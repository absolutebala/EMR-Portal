import * as Location from 'expo-location';

// RN port of CheckInView.tsx's GPS capture — high-accuracy first (GPS hardware),
// falling back to a coarser, faster, more power-friendly fix if the first attempt
// times out or fails (common indoors or on a weak signal). expo-location's
// getCurrentPositionAsync has no built-in timeout option (unlike the browser
// Geolocation API this mirrors), so both attempts are raced against a manual timer.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

export async function getCurrentPositionWithFallback(): Promise<{ lat: number; lng: number } | null> {
  try {
    const pos = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Highest }),
      12000
    );
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    try {
      const pos = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.LocationAccuracy.Balanced }),
        10000
      );
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return null;
    }
  }
}
