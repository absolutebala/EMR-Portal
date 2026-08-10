import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { apiPost } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

// RN equivalent of the PWA's /mobile/change-password — reached from app/(app)/_layout.tsx
// when GET /api/mobile/v1/auth/me reports mustChangePassword: true (first login or an
// admin-triggered reset). Mirrors complete-password-change's two steps: update the
// Supabase Auth password itself, then clear profiles.must_change_password server-side.
export default function ChangePasswordScreen() {
  const router = useRouter();
  const { refreshMe } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      await apiPost('/api/mobile/v1/auth/complete-password-change');
      await refreshMe();
      router.replace('/(app)/(tabs)/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
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
