import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { completeNewPassword, finishPasswordSetup } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';

// Cognito password policy (infra/lib/auth-stack.ts): min 8, upper, lower, digit, symbol.
function passwordChecks(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    digit: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}
const REQUIREMENTS: { key: keyof ReturnType<typeof passwordChecks>; label: string }[] = [
  { key: 'length', label: 'At least 8 characters' },
  { key: 'upper', label: 'An uppercase letter (A–Z)' },
  { key: 'lower', label: 'A lowercase letter (a–z)' },
  { key: 'digit', label: 'A number (0–9)' },
  { key: 'symbol', label: 'A symbol (e.g. ! @ # $)' },
];

// Completes the NEW_PASSWORD_REQUIRED challenge login.tsx started for a temp-password
// account (freshly invited, or admin-reset) — session/email were passed as route
// params from that one screen transition, not persisted anywhere. Cognito never
// issues real tokens for a temp-password account until this challenge is answered, so
// (unlike the old Supabase-based version of this screen) there's no already-signed-in
// state to handle here — see (app)/_layout.tsx for why a stale must_change_password on
// an existing session goes through a full sign-out + fresh login instead of landing here.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const { session, email } = useLocalSearchParams<{ session: string; email: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Cognito temp-password challenge is single-use — once it's answered, the temp
  // session can't be replayed. So if a later step (finishing setup) fails and the user
  // taps the button again, skip straight to the retryable step instead of re-answering
  // the challenge (which would fail with a confusing "session expired").
  const passwordSetRef = useRef(false);

  const checks = passwordChecks(password);
  const allMet = Object.values(checks).every(Boolean);
  const matches = confirm.length > 0 && password === confirm;
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = allMet && matches && !loading;

  async function handleSubmit() {
    if (!session || !email) {
      setError('Your session has expired. Please sign in again with your temporary password.');
      return;
    }
    // Give the exact reason rather than a raw Cognito policy string.
    if (!allMet) {
      const missing = REQUIREMENTS.filter(r => !checks[r.key]).map(r => r.label.toLowerCase());
      setError(`Your password still needs: ${missing.join(', ')}.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    setError(null);

    // Step 1 — set the new password in Cognito (single-use; skipped on a retry).
    if (!passwordSetRef.current) {
      const { error: changeError } = await completeNewPassword(email, session, password);
      if (changeError) {
        setLoading(false);
        setError(changeError);
        return;
      }
      passwordSetRef.current = true;
    }

    // Step 2 — finish account setup (clears must_change_password server-side). Must
    // succeed before navigating in, otherwise (app)/_layout.tsx signs the user straight
    // back out. Retryable on its own since the password is already set by now.
    const { error: finishError } = await finishPasswordSetup();
    if (finishError) {
      setLoading(false);
      setError(finishError);
      return;
    }

    // Same Field-Engineer-only check as login.tsx, before navigating in.
    const { accessDenied } = await refreshMe();
    setLoading(false);
    if (accessDenied) {
      setError(accessDenied);
      return;
    }
    router.replace('/(app)/(tabs)/dashboard');
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>This is required before you can continue.</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="New password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!show}
            value={password}
            onChangeText={setPassword}
          />
          <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.toggle}>
            <Text style={styles.toggleText}>{show ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>

        {/* Live requirement checklist — shows exactly what's still missing. */}
        {password.length > 0 && (
          <View style={styles.checklist}>
            {REQUIREMENTS.map(r => (
              <Text key={r.key} style={[styles.checkItem, checks[r.key] ? styles.checkMet : styles.checkUnmet]}>
                {checks[r.key] ? '✓' : '○'}  {r.label}
              </Text>
            ))}
          </View>
        )}

        <View style={[styles.passwordRow, mismatch && styles.rowError]}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirm password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry={!show}
            value={confirm}
            onChangeText={setConfirm}
          />
          <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.toggle}>
            <Text style={styles.toggleText}>{show ? '🙈' : '👁'}</Text>
          </Pressable>
        </View>
        {mismatch && <Text style={styles.hintError}>The two passwords don&apos;t match.</Text>}

        <Pressable style={[styles.button, !canSubmit && styles.buttonDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save and continue</Text>}
        </Pressable>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7D1D3F' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 8 },
  error: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  rowError: { borderColor: '#DC2626' },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  toggle: { paddingHorizontal: 14, paddingVertical: 10 },
  toggleText: { fontSize: 18 },
  checklist: { gap: 4, paddingHorizontal: 2, marginTop: -4 },
  checkItem: { fontSize: 12 },
  checkMet: { color: '#047857' },
  checkUnmet: { color: '#9CA3AF' },
  hintError: { color: '#DC2626', fontSize: 12, marginTop: -4 },
  button: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
