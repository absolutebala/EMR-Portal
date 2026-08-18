import { useMemo, useState } from 'react';
import { View, Text, Image, Pressable, ScrollView, Modal, TextInput, StyleSheet } from 'react-native';
import { useNearbyEngineers } from '@/lib/hooks';

const DEFAULT_RADIUS_KM = 10;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

// "At the bottom" of the dashboard — sits after the recent-jobs list. Radius is local,
// client-side state (default 10km, tap the pill to edit) filtering an already-fetched
// list, so adjusting it is instant and doesn't trigger another location ping.
export default function NearbyEngineersStrip() {
  const { data, isLoading } = useNearbyEngineers();
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [editing, setEditing] = useState(false);
  const [draftRadius, setDraftRadius] = useState(String(DEFAULT_RADIUS_KM));

  const engineers = useMemo(
    () => (data?.engineers || []).filter(e => e.distanceKm <= radiusKm),
    [data, radiusKm]
  );

  function openEditor() {
    setDraftRadius(String(radiusKm));
    setEditing(true);
  }

  function saveRadius() {
    const n = Number(draftRadius);
    if (Number.isFinite(n) && n > 0) setRadiusKm(Math.min(n, 999));
    setEditing(false);
  }

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Nearby Engineers</Text>
        <Pressable style={styles.radiusPill} onPress={openEditor}>
          <Text style={styles.radiusPillText}>within {radiusKm} km</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <Text style={styles.empty}>Finding nearby engineers…</Text>
      ) : engineers.length === 0 ? (
        <Text style={styles.empty}>No other engineers within {radiusKm} km right now</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {engineers.map(e => (
            <View key={e.id} style={styles.card}>
              {e.avatarUrl ? (
                <Image source={{ uri: e.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatar}><Text style={styles.avatarInitials}>{initials(e.name)}</Text></View>
              )}
              <Text style={styles.name} numberOfLines={1}>{e.name}</Text>
              <Text style={styles.distance}>{formatDistance(e.distanceKm)}</Text>
            </View>
          ))}
        </ScrollView>
      )}

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setEditing(false)}>
          <Pressable style={styles.editorCard} onPress={e => e.stopPropagation()}>
            <Text style={styles.editorTitle}>Search radius</Text>
            <View style={styles.editorInputRow}>
              <TextInput
                style={styles.editorInput}
                value={draftRadius}
                onChangeText={setDraftRadius}
                keyboardType="number-pad"
                autoFocus
                selectTextOnFocus
              />
              <Text style={styles.editorUnit}>km</Text>
            </View>
            <Pressable style={styles.editorButton} onPress={saveRadius}>
              <Text style={styles.editorButtonText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontSize: 14, fontWeight: '600', color: '#1C0D14' },
  radiusPill: { backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  radiusPillText: { fontSize: 11, fontWeight: '700', color: '#7D1D3F' },
  empty: { fontSize: 12, color: '#9CA3AF', paddingVertical: 8 },
  strip: { gap: 12, paddingBottom: 4 },
  card: { width: 76, alignItems: 'center' },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#F9EEF2', borderWidth: 1.5, borderColor: '#E8C5D0',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
  avatarInitials: { fontSize: 16, fontWeight: '700', color: '#7D1D3F' },
  name: { fontSize: 10.5, fontWeight: '600', color: '#1C0D14', textAlign: 'center' },
  distance: { fontSize: 10, color: '#7A6870', marginTop: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center' },
  editorCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 240 },
  editorTitle: { fontSize: 13, fontWeight: '700', color: '#1C0D14', marginBottom: 12, textAlign: 'center' },
  editorInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 },
  editorInput: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 18, fontWeight: '700', color: '#1C0D14', width: 90, textAlign: 'center',
  },
  editorUnit: { fontSize: 14, fontWeight: '600', color: '#7A6870' },
  editorButton: { backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  editorButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
