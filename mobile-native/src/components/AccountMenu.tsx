import { useState } from 'react';
import { View, Text, Pressable, Image, Modal, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/AuthContext';

interface Props {
  avatarUrl: string | null;
  name: string | null;
}

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

// Replaces the old plain-text "Sign out" link — tapping the avatar opens a small
// anchored menu (Profile / Change Password / Logout) instead of signing out directly,
// so signing out is no longer a single mis-tap away.
export default function AccountMenu({ avatarUrl, name }: Props) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);

  function go(path: '/(app)/profile' | '/(app)/my-analytics' | '/(app)/account-password') {
    setOpen(false);
    router.push(path);
  }

  return (
    <>
      <Pressable style={styles.avatarButton} onPress={() => setOpen(true)}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={styles.avatarInitials}>{initials(name)}</Text>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.menuAnchor}>
            <View style={styles.menu}>
              <Pressable style={styles.menuItem} onPress={() => go('/(app)/profile')}>
                <Text style={styles.menuItemText}>Profile</Text>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.menuItem} onPress={() => go('/(app)/my-analytics')}>
                <Text style={styles.menuItemText}>My Analytics</Text>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.menuItem} onPress={() => go('/(app)/account-password')}>
                <Text style={styles.menuItemText}>Change Password</Text>
              </Pressable>
              <View style={styles.divider} />
              <Pressable style={styles.menuItem} onPress={() => { setOpen(false); signOut(); }}>
                <Text style={[styles.menuItemText, styles.logoutText]}>Logout</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  avatarButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F9EEF2',
    borderWidth: 1.5, borderColor: '#E8C5D0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 13, fontWeight: '700', color: '#7D1D3F' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)' },
  menuAnchor: { position: 'absolute', top: 60, right: 16 },
  menu: {
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 4, minWidth: 180,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  menuItem: { paddingVertical: 12, paddingHorizontal: 16 },
  menuItemText: { fontSize: 13.5, fontWeight: '600', color: '#1C0D14' },
  logoutText: { color: '#DC2626' },
  divider: { height: 1, backgroundColor: '#F5F3F5', marginHorizontal: 8 },
});
