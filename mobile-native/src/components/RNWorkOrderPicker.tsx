import { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { MobileWorkOrder } from '@/lib/types';

interface Props {
  workOrders: MobileWorkOrder[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

// Shared by the New Request and New Expense screens — RN has no <select>, so this is
// a tap-to-expand inline list instead (same non-overlay approach as
// RNExpenseTypePicker, to avoid fighting the parent ScrollView's clipping).
export default function RNWorkOrderPicker({ workOrders, value, onChange, placeholder = 'Select…' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = workOrders.find(w => w.id === value);

  return (
    <View>
      <Pressable style={styles.input} onPress={() => setOpen(o => !o)}>
        <Text style={selected ? styles.inputText : styles.inputPlaceholder} numberOfLines={1}>
          {selected ? `${selected.wo_number} — ${selected.site_name || selected.customer_name}` : placeholder}
        </Text>
      </Pressable>
      {open && (
        <View style={styles.dropdown}>
          {workOrders.map(wo => (
            <Pressable key={wo.id} style={[styles.item, wo.id === value && styles.itemActive]} onPress={() => { onChange(wo.id); setOpen(false); }}>
              <Text style={[styles.itemText, wo.id === value && styles.itemTextActive]} numberOfLines={1}>
                {wo.wo_number} — {wo.site_name || wo.customer_name}
              </Text>
            </Pressable>
          ))}
          {workOrders.length === 0 && <Text style={styles.emptyText}>No active jobs found.</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10,
    backgroundColor: '#fff',
  },
  inputText: { color: '#1C0D14', fontSize: 12 },
  inputPlaceholder: { color: '#9CA3AF', fontSize: 12 },
  dropdown: {
    borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 10, marginTop: 6, overflow: 'hidden', maxHeight: 220,
  },
  item: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F5F3F5' },
  itemActive: { backgroundColor: '#F9EEF2' },
  itemText: { fontSize: 12, color: '#1C0D14' },
  itemTextActive: { fontWeight: '600' },
  emptyText: { padding: 12, fontSize: 12, color: '#7A6870' },
});
