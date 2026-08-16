import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useCheckinDriftNotice } from '@/lib/hooks';

// Rendered once at the (app) root alongside PendingSyncBanner. Persistent (not
// auto-dismissing) by design — keeps reminding for as long as the engineer's status
// stays "Reached" but they're 2km+ from where they checked in, per the product
// decision to nag rather than fire a single one-off notice. Offset below
// PendingSyncBanner's position so the two don't overlap if both are showing.
export default function CheckinDriftBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: notice } = useCheckinDriftNotice();

  if (!notice) return null;

  return (
    <Pressable
      style={[styles.banner, { top: insets.top + 56 }]}
      onPress={() => router.push(`/(app)/work-orders/${notice.workOrderId}` as Href)}
    >
      <Text style={styles.text}>
        You&apos;re ~{notice.distanceKm < 1 ? '<1' : Math.round(notice.distanceKm)} km from {notice.projectLabel} — update the notification&apos;s status if you&apos;ve left
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', left: 12, right: 12, zIndex: 50,
    backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  text: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
