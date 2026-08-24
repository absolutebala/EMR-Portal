import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useChangeMyPassword } from '@/lib/hooks';

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
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit() {
    setFormError(null);
    if (newPassword.length < 8) {
      setFormError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirm) {
      setFormError('New passwords do not match');
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
      <View style={styles.content}>
        {(formError || mutation.isError) && <Text style={styles.errorText}>{formError || mutation.error?.message}</Text>}

        <View style={styles.field}>
          <Text style={styles.label}>Current password</Text>
          <TextInput style={styles.input} value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry placeholder="Current password" placeholderTextColor="#9CA3AF" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="At least 8 characters" placeholderTextColor="#9CA3AF" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput style={styles.input} value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="Re-enter new password" placeholderTextColor="#9CA3AF" />
        </View>

        <Pressable style={[styles.saveButton, mutation.isPending && styles.saveButtonDisabled]} onPress={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Update password</Text>}
        </Pressable>
      </View>
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
  errorText: { color: '#DC2626', fontSize: 12.5, textAlign: 'center', marginBottom: 14 },
  saveButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  successTitle: { fontSize: 18, fontWeight: '700', color: '#1C0D14', marginBottom: 8 },
  successSub: { fontSize: 13, color: '#7A6870', textAlign: 'center', marginBottom: 24 },
});
