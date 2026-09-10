import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useChangeMyPassword } from '@/lib/hooks';

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

// Voluntary password change for an already-signed-in engineer, reached from the
// account menu — distinct from the top-level change-password.tsx, which completes
// Cognito's NEW_PASSWORD_REQUIRED challenge for a temp-password account and has no
// signed-in session to work with yet.
export default function AccountPasswordScreen() {
  const router = useRouter();
  const mutation = useChangeMyPassword();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const checks = passwordChecks(newPassword);
  const allMet = Object.values(checks).every(Boolean);
  const mismatch = confirm.length > 0 && newPassword !== confirm;

  function handleSubmit() {
    setFormError(null);
    if (!allMet) {
      const missing = REQUIREMENTS.filter(r => !checks[r.key]).map(r => r.label.toLowerCase());
      setFormError(`Your new password still needs: ${missing.join(', ')}.`);
      return;
    }
    if (newPassword !== confirm) {
      setFormError("The two passwords don't match.");
      return;
    }
    mutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setSuccess(true);
          setCurrentPassword('');
          setNewPassword('');
          setConfirm('');
        },
      }
    );
  }

  if (success) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Change Password', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <Text style={styles.successTitle}>Password updated</Text>
        <Text style={styles.successSub}>Use your new password next time you sign in.</Text>
        <Pressable style={styles.saveButton} onPress={() => router.back()}>
          <Text style={styles.saveButtonText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Change Password', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {(formError || mutation.isError) && <Text style={styles.errorText}>{formError || mutation.error?.message}</Text>}

        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={styles.passwordInput} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry={!show} placeholder="Current password" placeholderTextColor="#9CA3AF" />
            <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.toggle}><Text style={styles.toggleText}>{show ? '🙈' : '👁'}</Text></Pressable>
          </View>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <View style={styles.passwordRow}>
            <TextInput style={styles.passwordInput} value={newPassword} onChangeText={setNewPassword} secureTextEntry={!show} placeholder="At least 8 characters" placeholderTextColor="#9CA3AF" />
            <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.toggle}><Text style={styles.toggleText}>{show ? '🙈' : '👁'}</Text></Pressable>
          </View>
          {newPassword.length > 0 && (
            <View style={styles.checklist}>
              {REQUIREMENTS.map(r => (
                <Text key={r.key} style={[styles.checkItem, checks[r.key] ? styles.checkMet : styles.checkUnmet]}>{checks[r.key] ? '✓' : '○'}  {r.label}</Text>
              ))}
            </View>
          )}
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <View style={[styles.passwordRow, mismatch && styles.rowError]}>
            <TextInput style={styles.passwordInput} value={confirm} onChangeText={setConfirm} secureTextEntry={!show} placeholder="Re-enter new password" placeholderTextColor="#9CA3AF" />
            <Pressable onPress={() => setShow(v => !v)} hitSlop={8} accessibilityLabel={show ? 'Hide password' : 'Show password'} style={styles.toggle}><Text style={styles.toggleText}>{show ? '🙈' : '👁'}</Text></Pressable>
          </View>
          {mismatch && <Text style={styles.hintError}>The two passwords don&apos;t match.</Text>}
        </View>

        <Pressable style={[styles.saveButton, mutation.isPending && styles.saveButtonDisabled]} onPress={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Update password</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6', padding: 32 },
  content: { padding: 20 },
  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1C0D14', backgroundColor: '#fff',
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, backgroundColor: '#fff' },
  rowError: { borderColor: '#DC2626' },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#1C0D14' },
  toggle: { paddingHorizontal: 14, paddingVertical: 10 },
  toggleText: { fontSize: 18 },
  checklist: { gap: 4, marginTop: 8, paddingHorizontal: 2 },
  checkItem: { fontSize: 12 },
  checkMet: { color: '#047857' },
  checkUnmet: { color: '#9CA3AF' },
  hintError: { color: '#DC2626', fontSize: 12, marginTop: 6 },
  errorText: { color: '#DC2626', fontSize: 12.5, textAlign: 'center', marginBottom: 14 },
  saveButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#1C0D14', marginBottom: 8 },
  successSub: { fontSize: 13, color: '#7A6870', textAlign: 'center', marginBottom: 24 },
});
