import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface CapturedPhoto {
  dataUrl: string;
  mimeType: string;
  ext: string;
}

// Compress to 1024px longest edge, quality 0.7 JPEG — matches the PWA's
// lib/mobile/compressImage.ts so uploaded photos are the same size class on both apps.
async function compress(uri: string): Promise<CapturedPhoto | null> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
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

// Opens the native OS camera app directly. Returns null if the user cancels or denies
// the camera permission (caller decides whether that's an error).
export async function capturePhoto(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  return compress(result.assets[0].uri);
}

// Opens the device photo library / gallery. Returns null if the user cancels or denies
// the media-library permission.
export async function pickPhotoFromLibrary(): Promise<CapturedPhoto | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
  });
  if (result.canceled || !result.assets?.length) return null;
  return compress(result.assets[0].uri);
}

// Multi-select from the gallery — used by Site Photos, where an engineer often adds
// several photos of a site at once. Compresses each; skips any that fail to process.
export async function pickPhotosFromLibrary(): Promise<CapturedPhoto[]> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 1,
    allowsMultipleSelection: true,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out: CapturedPhoto[] = [];
  for (const a of result.assets) {
    const c = await compress(a.uri);
    if (c) out.push(c);
  }
  return out;
}
