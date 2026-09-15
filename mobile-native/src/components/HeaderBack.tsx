import { Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

// Header back button for the detail/sub screens. These screens live inside the bottom
// Tabs navigator (so the tab bar stays visible underneath them), and a bottom-tab
// header does NOT render a native back arrow the way a stack header does — so we supply
// our own via `headerLeft`. router.back() returns to the previously focused route
// (the Tabs navigator uses backBehavior="history"). Hidden on screens with nothing to
// go back to (e.g. a tab root focused directly).
export default function HeaderBack() {
  const router = useRouter();
  if (!router.canGoBack()) return null;
  return (
    <Pressable onPress={() => router.back()} hitSlop={12} style={styles.button}>
      <Text style={styles.chevron}>‹</Text>
      <Text style={styles.label}>Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', paddingRight: 12, paddingVertical: 4 },
  chevron: { fontSize: 26, color: '#7D1D3F', fontWeight: '400', marginTop: -3 },
  label: { fontSize: 15, color: '#7D1D3F', fontWeight: '500', marginLeft: 1 },
});
