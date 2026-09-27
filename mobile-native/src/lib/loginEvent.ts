import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import { apiPost } from './api';
import { getCurrentPositionWithFallback } from './gps';

// A stable per-install device id (persisted). Reliable across app launches without
// depending on reading the SIM/hardware id (which Android heavily restricts). A
// reinstall generates a new one — acceptable for "which device is this login from".
const DEVICE_ID_KEY = 'emr_device_id';

async function getDeviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

// A human-friendly name for this phone for the dashboard's suspicious-login detail —
// the user-assigned name when available ("Bala's Phone"), otherwise the model, with the
// manufacturer prefixed when it isn't already part of the model string.
function getDeviceName(): string | null {
  const parts = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ').trim();
  const friendly = (Device.deviceName || '').trim();
  if (friendly && friendly.toLowerCase() !== (Device.modelName || '').toLowerCase()) {
    return parts ? `${friendly} (${parts})` : friendly;
  }
  return parts || friendly || null;
}

// Turns coordinates into a readable place ("Adyar, Chennai, Tamil Nadu") using the OS
// reverse geocoder — no external API/key. Best-effort: returns null on any failure.
async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (!place) return null;
    // Locality → city → state, de-duplicated (these often repeat for smaller towns).
    const readable = [place.district || place.subregion, place.city, place.region]
      .filter((v, i, a): v is string => Boolean(v) && a.indexOf(v) === i)
      .join(', ');
    return readable || place.city || place.region || null;
  } catch {
    return null;
  }
}

// Fire-and-forget: records this login's device + current location for the web
// dashboard's suspicious-login detection (impossible travel / two devices). Never
// throws and never blocks the login flow — call it without awaiting.
export async function recordLoginEvent(): Promise<void> {
  try {
    const [deviceId, pos] = await Promise.all([getDeviceId(), getCurrentPositionWithFallback()]);
    const placeName = pos ? await reverseGeocode(pos.lat, pos.lng) : null;
    await apiPost('/api/mobile/v1/login-events', {
      deviceId,
      deviceName: getDeviceName(),
      latitude: pos?.lat ?? null,
      longitude: pos?.lng ?? null,
      placeName,
    });
  } catch {
    // best-effort only
  }
}
