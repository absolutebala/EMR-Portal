import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { apiPost } from '@/lib/api';

// Cognito password policy (infra/lib/auth-stack.ts): min 8, upper, lower, digit, symbol.
function policyError(pw: string): string | null {
  if (pw.length < 8) return 'At least 8 characters';
  if (!/[A-Z]/.test(pw)) return 'One uppercase letter';
  if (!/[a-z]/.test(pw)) return 'One lowercase letter';
  if (!/[0-9]/.test(pw)) return 'One number';
  if (!/[^A-Za-z0-9]/.test(pw)) return 'One symbol';
  return null;
}

// Two-step self-service reset: (1) enter the registered mobile number → an OTP is texted;
// (2) enter the OTP + a new password. The request step always "succeeds" server-side so a
// stranger can't probe which numbers have accounts — we just advance to step 2.
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function sendOtp() {
    if (phone.replace(/\D/g, '').length < 10) { setError('Enter your registered 10-digit mobile number'); return; }
    setLoading(true); setError(null);
    try {
      await apiPost('/api/mobile/v1/auth/forgot-password/request', { identifier: phone.trim() });
      setStep('reset');
    } catch {
      // The request endpoint is best-effort and never reveals account existence; advance
      // regardless so the flow can't be used to enumerate numbers.
      setStep('reset');
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    if (!/^\d{6}$/.test(otp.trim())) { setError('Enter the 6-digit code from the SMS'); return; }
    const pErr = policyError(password);
    if (pErr) { setError(`Password needs: ${pErr}`); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setLoading(true); setError(null);
    try {
      await apiPost('/api/mobile/v1/auth/forgot-password/verify', { identifier: phone.trim(), otp: otp.trim(), newPassword: password });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.title}>Reset password</Text>

          {done ? (
            <>
              <Text style={styles.subtitle}>Your password has been reset. Sign in with your new password.</Text>
              <Pressable style={styles.button} onPress={() => router.replace('/login')}>
                <Text style={styles.buttonText}>Back to sign in</Text>
              </Pressable>
            </>
          ) : step === 'request' ? (
            <>
              <Text style={styles.subtitle}>Enter your registered mobile number. We&apos;ll text you a 6-digit code.</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <TextInput
                style={styles.input}
                placeholder="Mobile number"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
              />
              <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={sendOtp} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send code</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>Enter the code we texted to {phone.trim()} and choose a new password.</Text>
              {error && <Text style={styles.error}>{error}</Text>}
              <TextInput
                style={styles.input}
                placeholder="6-digit code"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={setOtp}
              />
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="New password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPw}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8} accessibilityLabel={showPw ? 'Hide password' : 'Show password'} style={styles.passwordToggle}>
                  <Text style={styles.passwordToggleText}>{showPw ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
              <View style={styles.passwordRow}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Confirm new password"
                  placeholderTextColor="#9CA3AF"
                  secureTextEntry={!showPw}
                  value={confirm}
                  onChangeText={setConfirm}
                />
                <Pressable onPress={() => setShowPw(v => !v)} hitSlop={8} accessibilityLabel={showPw ? 'Hide password' : 'Show password'} style={styles.passwordToggle}>
                  <Text style={styles.passwordToggleText}>{showPw ? '🙈' : '👁'}</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Min 8 chars with uppercase, lowercase, number and symbol.</Text>
              <Pressable style={[styles.button, loading && styles.buttonDisabled]} onPress={resetPassword} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Reset password</Text>}
              </Pressable>
              <Pressable onPress={sendOtp} hitSlop={8} style={styles.resendLink} disabled={loading}>
                <Text style={styles.resendText}>Didn&apos;t get a code? Resend</Text>
              </Pressable>
            </>
          )}

          {!done && (
            <Pressable onPress={() => router.replace('/login')} hitSlop={8} style={styles.resendLink}>
              <Text style={styles.backText}>Back to sign in</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#7D1D3F' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 4 },
  error: { color: '#DC2626', fontSize: 13, textAlign: 'center' },
  hint: { fontSize: 11, color: '#9CA3AF', textAlign: 'center' },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  passwordInput: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  passwordToggle: { paddingHorizontal: 14, paddingVertical: 10 },
  passwordToggleText: { fontSize: 18 },
  button: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  resendLink: { alignItems: 'center', paddingVertical: 6 },
  resendText: { color: '#7D1D3F', fontSize: 13, fontWeight: '600' },
  backText: { color: '#6B7280', fontSize: 13, fontWeight: '500' },
});
