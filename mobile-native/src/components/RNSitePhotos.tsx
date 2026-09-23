import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Image, ScrollView, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiGet, apiPost } from '@/lib/api';
import { capturePhoto, pickPhotosFromLibrary, type CapturedPhoto } from '@/lib/photo';

interface SitePhoto { id: string; url: string; uploaderName: string | null; createdAt: string }

// "Site Photos" for a notification — a button (shown at the top of the job screen) that
// opens a gallery of previously-added photos and lets the engineer add more (multiple at
// once, any number of times). Stored server-side (S3) and visible on mobile + web.
export default function RNSitePhotos({ workOrderId }: { workOrderId: string }) {
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<SitePhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ photos: SitePhoto[] }>(`/api/mobile/v1/work-orders/${workOrderId}/site-photos`);
      setPhotos(r.photos ?? []);
    } catch {
      // leave existing list
    }
    setLoading(false);
  }, [workOrderId]);

  function openModal() { setOpen(true); load(); }

  async function upload(captured: CapturedPhoto[]) {
    if (!captured.length) return;
    setUploading(true);
    try {
      await apiPost(`/api/mobile/v1/work-orders/${workOrderId}/site-photos`, {
        photos: captured.map(c => ({ base64: c.dataUrl, mimeType: c.mimeType, ext: c.ext })),
      });
      await load();
    } catch {
      Alert.alert('Upload failed', 'Could not upload the photo(s). Please try again.');
    }
    setUploading(false);
  }

  function addPhotos() {
    Alert.alert('Add site photos', 'Choose a source', [
      { text: 'Take photo', onPress: () => capturePhoto().then(p => upload(p ? [p] : [])) },
      { text: 'Choose from gallery', onPress: () => pickPhotosFromLibrary().then(upload) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <>
      <Pressable style={styles.triggerBtn} onPress={openModal}>
        <Ionicons name="images-outline" size={15} color="#7D1D3F" />
        <Text style={styles.triggerText}>Site Photos</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>Site Photos</Text>
            <Pressable onPress={() => setOpen(false)}><Text style={styles.cancel}>Done</Text></Pressable>
          </View>

          <Pressable style={[styles.addBtn, uploading && styles.addBtnDisabled]} onPress={addPhotos} disabled={uploading}>
            {uploading ? <ActivityIndicator color="#7D1D3F" /> : <Text style={styles.addBtnText}>+ Add photos</Text>}
          </Pressable>

          <ScrollView contentContainerStyle={styles.grid}>
            {loading ? (
              <Text style={styles.muted}>Loading…</Text>
            ) : photos.length === 0 ? (
              <Text style={styles.muted}>No site photos yet.</Text>
            ) : (
              photos.map(p => (
                <Pressable key={p.id} style={styles.thumbWrap} onPress={() => setLightbox(p.url)}>
                  <Image source={{ uri: p.url }} style={styles.thumb} />
                </Pressable>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={() => setLightbox(null)}>
        <Pressable style={styles.lightbox} onPress={() => setLightbox(null)}>
          {lightbox && <Image source={{ uri: lightbox }} style={styles.lightboxImg} resizeMode="contain" />}
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#fff', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  triggerText: { color: '#7D1D3F', fontSize: 12, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1E7EB' },
  title: { fontSize: 15, fontWeight: '600', color: '#1C0D14' },
  cancel: { fontSize: 13, color: '#7D1D3F', fontWeight: '600' },
  addBtn: { margin: 16, marginBottom: 8, borderWidth: 1.5, borderColor: '#7D1D3F', borderStyle: 'dashed', backgroundColor: '#F9EEF2', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  addBtnDisabled: { opacity: 0.6 },
  addBtnText: { color: '#7D1D3F', fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 16, paddingTop: 8 },
  thumbWrap: { width: '31%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#F8F5F6' },
  thumb: { width: '100%', height: '100%' },
  muted: { fontSize: 13, color: '#9CA3AF', padding: 20, textAlign: 'center', width: '100%' },
  lightbox: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  lightboxImg: { width: '100%', height: '100%' },
});
