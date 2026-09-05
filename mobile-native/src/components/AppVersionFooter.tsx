import { Text, StyleSheet } from 'react-native';
import { appVersionLabel } from '@/lib/appInfo';

// Small version+date line shown at the bottom of every screen so engineers always
// know which build they're on. Pass `light` on dark backgrounds (e.g. login).
export default function AppVersionFooter({ light }: { light?: boolean }) {
  return <Text style={[styles.text, light && styles.light]}>{appVersionLabel()}</Text>;
}

const styles = StyleSheet.create({
  text: { fontSize: 10, color: '#B0A8AC', textAlign: 'center', marginTop: 18, marginBottom: 6 },
  light: { color: 'rgba(255,255,255,0.6)' },
});
