import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Image, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { useMyProfile, useUpdateMyProfile, useUploadAvatar } from '@/lib/hooks';
import { capturePhoto } from '@/lib/photo';

function initials(firstName: string, lastName: string): string {
  return ((firstName[0] || '') + (lastName[0] || '')).toUpperCase() || '?';
}

export default function ProfileScreen() {
  const { data, isLoading } = useMyProfile();
  const updateMutation = useUpdateMyProfile();
  const avatarMutation = useUploadAvatar();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data?.profile) {
      setFirstName(data.profile.firstName);
      setLastName(data.profile.lastName);
      setPhone(data.profile.phone || '');
    }
  }, [data]);

  async function handleAvatarTap() {
    const photo = await capturePhoto();
    if (!photo) return;
    avatarMutation.mutate({ base64: photo.dataUrl, mimeType: photo.mimeType, ext: photo.ext });
  }

  function handleSave() {
    setSaved(false);
    updateMutation.mutate(
      { firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim() || null },
      { onSuccess: () => setSaved(true) }
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: true, title: 'Profile', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <ActivityIndicator size="large" color="#7D1D3F" />
      </View>
    );
  }

  const profile = data?.profile;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: true, title: 'Profile', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable style={styles.avatarWrap} onPress={handleAvatarTap} disabled={avatarMutation.isPending}>
          {avatarMutation.isPending ? (
            <View style={styles.avatarLarge}><ActivityIndicator color="#7D1D3F" /></View>
          ) : profile?.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.avatarLarge} />
          ) : (
            <View style={styles.avatarLarge}>
              <Text style={styles.avatarInitials}>{initials(profile?.firstName || '', profile?.lastName || '')}</Text>
            </View>
          )}
          <Text style={styles.avatarHint}>Tap to change photo</Text>
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>First name</Text>
          <TextInput style={styles.input} value={firstName} onChangeText={setFirstName} placeholder="First name" placeholderTextColor="#9CA3AF" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Last name</Text>
          <TextInput style={styles.input} value={lastName} onChangeText={setLastName} placeholder="Last name" placeholderTextColor="#9CA3AF" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Phone number</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor="#9CA3AF" keyboardType="phone-pad" />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <View style={[styles.input, styles.inputReadOnly]}>
            <Text style={styles.readOnlyText}>{profile?.email}</Text>
          </View>
        </View>

        {updateMutation.isError && <Text style={styles.errorText}>{updateMutation.error.message}</Text>}
        {saved && !updateMutation.isError && <Text style={styles.successText}>Profile updated.</Text>}

        <Pressable style={[styles.saveButton, updateMutation.isPending && styles.saveButtonDisabled]} onPress={handleSave} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6' },
  content: { padding: 20, paddingBottom: 48 },
  avatarWrap: { alignItems: 'center', marginBottom: 28 },
  avatarLarge: {
    width: 92, height: 92, borderRadius: 46, backgroundColor: '#F9EEF2', borderWidth: 1.5, borderColor: '#E8C5D0',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: '#7D1D3F' },
  avatarHint: { fontSize: 11.5, color: '#7D1D3F', fontWeight: '600', marginTop: 10 },
  field: { marginBottom: 16 },
  label: { fontSize: 11.5, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1C0D14', backgroundColor: '#fff',
  },
  inputReadOnly: { backgroundColor: '#F5F3F5', justifyContent: 'center' },
  readOnlyText: { fontSize: 14, color: '#7A6870' },
  errorText: { color: '#DC2626', fontSize: 12.5, textAlign: 'center', marginBottom: 12 },
  successText: { color: '#059669', fontSize: 12.5, textAlign: 'center', marginBottom: 12 },
  saveButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
