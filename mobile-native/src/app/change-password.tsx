import { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { completeNewPassword, finishPasswordSetup } from '@/lib/auth';
import { useAuth } from '@/lib/AuthContext';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Cognito temp-password challenge is single-use — once it's answered, the temp
  // session can't be replayed. So if a later step (finishing setup) fails and the user
  // taps the button again, skip straight to the retryable step instead of re-answering
  // the challenge (which would fail with a confusing "session expired").
  const passwordSetRef = useRef(false);

  async function handleSubmit() {
    if (!session || !email) {
      setError('Your session has expired. Please sign in again with your temporary password.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
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
      <View style={styles.card}>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.subtitle}>This is required before you can continue.</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="New password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm password"
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          value={confirm}
          onChangeText={setConfirm}
        />

        <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save and continue</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7D1D3F', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 8 },
  error: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  input: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#111827',
  },
  button: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
