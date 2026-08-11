import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { getCurrentPositionWithFallback } from '@/lib/gps';
import { capturePhoto, type CapturedPhoto } from '@/lib/photo';
import { reverseGeocode, useSubmitCheckIn } from '@/lib/hooks';
import { isOnline, apiErrorMessage } from '@/lib/offlineSubmit';

export default function CheckInScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const submitCheckIn = useSubmitCheckIn();

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [gpsResolved, setGpsResolved] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getCurrentPositionWithFallback().then(pos => {
      setCoords(pos);
      setGpsResolved(true);
      if (pos) {
        reverseGeocode(pos.lat, pos.lng)
          .then(({ label }) => { if (label) setPlaceName(label); })
          .catch(() => {});
      }
    });
  }, []);

  async function handleCapture() {
    setError('');
    setCapturing(true);
    try {
      const result = await capturePhoto();
      if (result) setPhoto(result);
    } catch {
      setError('Could not process that photo — please try again');
    } finally {
      setCapturing(false);
    }
  }

  async function handleSubmit() {
    if (!photo) { setError('Photo proof is required'); return; }
    setError('');

    const variables = {
      workOrderId: id,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      placeName: placeName || null,
      photoBase64: photo.dataUrl,
      mimeType: photo.mimeType,
      ext: photo.ext,
    };

    if (!(await isOnline())) {
      // Fire-and-forget — react-query pauses this (queryClient.ts's onlineManager) and
      // retries automatically on reconnect. Don't await: a paused mutation's promise
      // doesn't settle until it actually runs, which could be much later.
      submitCheckIn.mutate(variables);
      Alert.alert('Saved — will sync', "You're offline. This check-in will be sent automatically once you're back online.");
      router.replace(`/(app)/work-orders/${id}`);
      return;
    }

    try {
      const result = await submitCheckIn.mutateAsync(variables);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace(`/(app)/work-orders/${id}`);
    } catch (e) {
      setError(apiErrorMessage(e));
    }
  }

  const submitting = submitCheckIn.isPending;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: 'Project Check-In', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Check-in required before starting work. GPS location and photo will be captured.</Text>
      </View>

      <View style={[styles.gpsCard, { backgroundColor: coords ? '#059669' : '#2563EB' }]}>
        <Text style={styles.gpsTitle}>
          {coords ? (placeName || 'GPS location captured') : gpsResolved ? 'GPS unavailable' : 'GPS location capturing…'}
        </Text>
        <Text style={styles.gpsSub}>
          {coords ? `${coords.lat.toFixed(4)}°, ${coords.lng.toFixed(4)}°` : gpsResolved ? 'You can still check in without it' : 'Locating · please wait'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Photo proof *</Text>
        <Text style={styles.cardSub}>Capture a photo confirming your arrival at the customer site.</Text>

        {capturing ? (
          <View style={styles.photoBox}>
            <ActivityIndicator color="#7D1D3F" />
          </View>
        ) : photo ? (
          <Pressable style={styles.photoCapturedRow} onPress={handleCapture}>
            <Image source={{ uri: photo.dataUrl }} style={styles.thumb} />
            <View>
              <Text style={styles.photoCapturedTitle}>1 photo captured</Text>
              <Text style={styles.photoCapturedSub}>Tap to retake</Text>
            </View>
          </Pressable>
        ) : (
          <Pressable style={styles.photoBox} onPress={handleCapture}>
            <Text style={styles.photoBoxText}>Tap to capture site arrival photo</Text>
          </Pressable>
        )}
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <Pressable
        style={[styles.submitButton, (!photo || submitting || capturing) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={!photo || submitting || capturing}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Confirm check-in — Reached Project</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  notice: { backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 10, padding: 12, marginBottom: 12 },
  noticeText: { color: '#7D1D3F', fontSize: 11, lineHeight: 16 },
  gpsCard: { borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  gpsTitle: { fontSize: 13, fontWeight: '600', color: '#fff', marginBottom: 3, textAlign: 'center' },
  gpsSub: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  cardSub: { fontSize: 11, color: '#7A6870', marginBottom: 8, marginTop: 2 },
  photoBox: {
    borderWidth: 1.5, borderColor: '#E8C5D0', borderStyle: 'dashed', borderRadius: 11,
    padding: 24, alignItems: 'center', backgroundColor: '#F9EEF2',
  },
  photoBoxText: { fontSize: 11, fontWeight: '500', color: '#7D1D3F' },
  photoCapturedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF5',
    borderWidth: 1.5, borderColor: '#A7F3D0', borderRadius: 10, padding: 11,
  },
  thumb: { width: 34, height: 34, borderRadius: 7 },
  photoCapturedTitle: { fontSize: 11, fontWeight: '500', color: '#065F46' },
  photoCapturedSub: { fontSize: 10, color: '#059669' },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginBottom: 12 },
  errorText: { color: '#DC2626', fontSize: 12 },
  submitButton: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
