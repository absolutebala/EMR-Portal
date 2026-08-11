import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePendingSyncCount } from '@/lib/pendingSync';

// Rendered once at the (app) root, floating above whatever screen is currently
// showing (absolute position, high zIndex) — so an engineer who submitted something
// offline and then navigated elsewhere still sees it's queued, not just on the
// screen they submitted from.
export default function PendingSyncBanner() {
  const insets = useSafeAreaInsets();
  const count = usePendingSyncCount();

  if (count === 0) return null;

  return (
    <View style={[styles.banner, { top: insets.top + 8 }]} pointerEvents="none">
      <Text style={styles.text}>
        {count} item{count !== 1 ? 's' : ''} waiting to sync — will send once you&apos;re back online
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', left: 12, right: 12, zIndex: 50,
    backgroundColor: '#92400E', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
  },
  text: { color: '#fff', fontSize: 11, fontWeight: '600', textAlign: 'center' },
});
