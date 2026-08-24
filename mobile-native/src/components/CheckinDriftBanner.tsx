import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';
import { useCheckinDriftNotice } from '@/lib/hooks';
import { usePendingSyncBannerOffset, useNativeHeaderOffset } from '@/lib/bannerLayout';

// Rendered once at the (app) root alongside PendingSyncBanner. Persistent (not
// auto-dismissing) by design — keeps reminding for as long as the engineer's status
// stays "Reached" but they're 2km+ from where they checked in, per the product
// decision to nag rather than fire a single one-off notice. Offset dynamically below
// PendingSyncBanner's actual position — only reserving space for it when it's really
// showing, instead of a fixed guess that overlapped screen content whenever the sync
// banner was absent.
export default function CheckinDriftBanner() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: notice } = useCheckinDriftNotice();
  const syncBannerOffset = usePendingSyncBannerOffset();
  const headerOffset = useNativeHeaderOffset();

  if (!notice) return null;

  return (
    <Pressable
      style={[styles.banner, { top: insets.top + 8 + syncBannerOffset + headerOffset }]}
      onPress={() => router.push(`/(app)/(tabs)/work-orders/${notice.workOrderId}` as Href)}
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
