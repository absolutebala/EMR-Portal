import * as SecureStore from 'expo-secure-store';

// Supabase's persisted session payload (access token + refresh token + user object)
// routinely exceeds SecureStore's real-world per-item size ceiling (historically ~2048
// bytes on iOS Keychain / Android Keystore) — a plain single setItemAsync call for the
// whole session silently fails or throws on-device even though it works fine in
// simulators with more permissive storage. This adapter chunks the value across
// numbered keys plus a small manifest key recording how many chunks exist, and
// implements the {getItem,setItem,removeItem} interface supabase-js expects for its
// `storage` option. Do not swap this for plain AsyncStorage — that would store the
// session tokens unencrypted on disk.
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number) {
  return `${key}_chunk_${index}`;
}

function manifestKey(key: string) {
  return `${key}_chunks`;
}

export const secureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(manifestKey(key));
    if (!countRaw) return null;
    const count = parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part == null) return null; // a chunk went missing — treat the whole value as gone
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    // Clear out any previous (possibly longer) chunk set first, so a shrinking value
    // doesn't leave stale trailing chunks behind.
    await secureStoreAdapter.removeItem(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(chunkKey(key, i), chunk)));
    await SecureStore.setItemAsync(manifestKey(key), String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(manifestKey(key));
    const count = countRaw ? parseInt(countRaw, 10) : 0;
    if (Number.isFinite(count) && count > 0) {
      await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i)))
      );
    }
    await SecureStore.deleteItemAsync(manifestKey(key));
  },
};
