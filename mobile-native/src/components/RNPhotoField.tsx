import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Image, ActivityIndicator } from 'react-native';
import { capturePhoto } from '@/lib/photo';

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  readOnly?: boolean;
}

// RN equivalent of components/mobile/PhotoField.tsx — same {value, onChange, readOnly}
// contract (base64 data-URL string). Reuses lib/photo.ts's capturePhoto() (the same
// camera-capture + compression helper the check-in screen uses).
export default function RNPhotoField({ value, onChange, readOnly }: Props) {
  const [capturing, setCapturing] = useState(false);

  async function handleCapture() {
    if (readOnly) return;
    setCapturing(true);
    try {
      const result = await capturePhoto();
      if (result) onChange(result.dataUrl);
    } finally {
      setCapturing(false);
    }
  }

  if (capturing) {
    return (
      <View style={styles.box}>
        <ActivityIndicator color="#7D1D3F" />
      </View>
    );
  }

  return (
    <Pressable style={styles.box} onPress={handleCapture} disabled={readOnly}>
      {value ? (
        <Image source={{ uri: value }} style={styles.image} resizeMode="cover" />
      ) : (
        <Text style={styles.placeholder}>{readOnly ? 'No photo' : 'Tap to capture photo'}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 120, borderWidth: 1.5, borderColor: '#E5E0E3', borderStyle: 'dashed', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9EEF2', overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  placeholder: { fontSize: 12, color: '#7D1D3F', fontWeight: '500' },
});
