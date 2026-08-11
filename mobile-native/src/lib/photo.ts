import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface CapturedPhoto {
  dataUrl: string;
  mimeType: string;
  ext: string;
}

// RN port of the PWA's <input capture="environment"> + lib/mobile/compressImage.ts
// (1024px longest edge, quality 0.7 JPEG) — launchCameraAsync opens the native OS
// camera app directly, same UX class as the web version's native file-input capture.
// Returns null if the user cancels or denies the camera permission (caller decides
// whether that's an error).
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;

  const manipulated = await ImageManipulator.manipulateAsync(
    result.assets[0].uri,
    [{ resize: { width: 1024 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!manipulated.base64) return null;

  return {
    dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
    mimeType: 'image/jpeg',
    ext: 'jpg',
  };
}
