import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Fire-and-forget: records this login's device + current location for the web
// dashboard's suspicious-login detection (impossible travel / two devices). Never
// throws and never blocks the login flow — call it without awaiting.
export async function recordLoginEvent(): Promise<void> {
  try {
    const [deviceId, pos] = await Promise.all([getDeviceId(), getCurrentPositionWithFallback()]);
    await apiPost('/api/mobile/v1/login-events', {
      deviceId,
      latitude: pos?.lat ?? null,
      longitude: pos?.lng ?? null,
      placeName: null,
    });
  } catch {
    // best-effort only
  }
}
