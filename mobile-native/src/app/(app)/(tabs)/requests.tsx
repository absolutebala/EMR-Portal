import { View, Text, StyleSheet } from 'react-native';

// Placeholder — Product Requests is Phase 4 of the React Native rewrite plan.
export default function RequestsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Requests</Text>
      <Text style={styles.body}>Product requests are coming in a later update.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB', padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#1C0D14' },
  body: { fontSize: 13, color: '#7A6870', textAlign: 'center' },
});
