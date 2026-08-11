import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Image, SafeAreaView, Alert } from 'react-native';
import SignatureView, { type SignatureViewRef } from 'react-native-signature-canvas';

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

// RN equivalent of components/mobile/SignaturePad.tsx — same {value, onChange,
// readOnly} contract (base64 PNG data-URL string), so the backend's stored field
// value format doesn't change. Unlike the web version, this does NOT hand-roll a
// rotated-canvas coordinate transform — react-native-signature-canvas's `rotated`
// prop already renders a landscape drawing surface on a portrait screen internally
// (it wraps a WebView running signature_pad, not a raw <canvas>).
//
// The library's own in-WebView "Save"/"Clear" footer buttons are hidden (via
// webStyle) and not used — in `rotated` mode that footer renders outside the
// visible viewport (a known library quirk), making it unreachable. Real RN buttons
// below drive the same ref methods (readSignature()/clearSignature()) instead.
export default function RNSignaturePad({ label, value, onChange, readOnly }: Props) {
  const [open, setOpen] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const ref = useRef<SignatureViewRef>(null);

  function handleOK(signature: string) {
    onChange(signature);
    setOpen(false);
  }

  function handleEmpty() {
    Alert.alert('Nothing to save', 'Please sign before saving.');
  }

  function openModal() {
    setHasStroke(false);
    setOpen(true);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={styles.previewBox}
        onPress={() => !readOnly && openModal()}
        disabled={readOnly}
      >
        {value ? (
          <Image source={{ uri: value }} style={styles.previewImage} resizeMode="contain" />
        ) : (
          <Text style={styles.placeholder}>{readOnly ? 'No signature' : 'Tap to sign'}</Text>
        )}
      </Pressable>

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </View>
          <View style={styles.canvasWrap}>
            <SignatureView
              ref={ref}
              onOK={handleOK}
              onEmpty={handleEmpty}
              onBegin={() => setHasStroke(true)}
              onClear={() => setHasStroke(false)}
              descriptionText=""
              rotated
              trimWhitespace
              imageType="image/png"
              webStyle=".m-signature-pad--footer { display: none; margin: 0; } .m-signature-pad--body { border: none; }"
            />
          </View>
          <View style={styles.actionRow}>
            <Pressable style={styles.clearButton} onPress={() => ref.current?.clearSignature()}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, !hasStroke && styles.saveButtonDisabled]}
              onPress={() => ref.current?.readSignature()}
              disabled={!hasStroke}
            >
              <Text style={styles.saveButtonText}>Done</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: { fontSize: 12, color: '#7A6870', marginBottom: 6, fontWeight: '500' },
  previewBox: {
    height: 100, borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6',
  },
  previewImage: { width: '100%', height: '100%' },
  placeholder: { fontSize: 12, color: '#9CA3AF' },
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  modalTitle: { fontSize: 15, fontWeight: '600', color: '#1C0D14' },
  cancelText: { fontSize: 13, color: '#7D1D3F', fontWeight: '600' },
  canvasWrap: { flex: 1 },
  actionRow: { flexDirection: 'row', gap: 10, padding: 16 },
  clearButton: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', backgroundColor: '#fff',
  },
  clearButtonText: { color: '#7A6870', fontSize: 14, fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#7D1D3F', borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#D8B6C2' },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
