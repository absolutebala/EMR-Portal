import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useExpenseTypes, getOrCreateExpenseType } from '@/lib/hooks';
import type { ExpenseType } from '@/lib/types';

interface Props {
  valueId: string;
  valueName: string;
  onChange: (id: string, name: string) => void;
}

// RN port of components/mobile/ExpenseTypePicker.tsx — searchable + creatable
// dropdown over the expense_types catalog. Rendered as an inline expanding list
// rather than an absolutely-positioned overlay (RN + ScrollView don't mix well with
// the web version's click-outside-to-close popover pattern) — closes on selection or
// on successfully creating a new type instead.
export default function RNExpenseTypePicker({ valueId, valueName, onChange }: Props) {
  const [query, setQuery] = useState(valueName);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useExpenseTypes();
  const types = data?.types || [];

  useEffect(() => { setQuery(valueName); }, [valueName]);

  const q = query.trim().toLowerCase();
  const filtered = q ? types.filter(t => t.name.toLowerCase().includes(q)) : types;
  const exactMatch = types.some(t => t.name.toLowerCase() === q);

  function selectType(t: ExpenseType) {
    setQuery(t.name);
    onChange(t.id, t.name);
    setOpen(false);
  }

  async function createNew() {
    if (!query.trim()) return;
    setCreating(true);
    try {
      const { type, error } = await getOrCreateExpenseType(query.trim());
      if (!error && type) selectType(type);
    } finally {
      setCreating(false);
    }
  }

  return (
    <View>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={t => { setQuery(t); onChange('', t); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={isLoading ? 'Loading…' : 'Search or type to add…'}
        placeholderTextColor="#9CA3AF"
      />
      {open && (
        <View style={styles.dropdown}>
          {filtered.map(t => (
            <Pressable key={t.id} style={[styles.item, t.id === valueId && styles.itemActive]} onPress={() => selectType(t)}>
              <Text style={[styles.itemText, t.id === valueId && styles.itemTextActive]}>{t.name}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && !q && !isLoading && (
            <Text style={styles.emptyText}>No expense types yet — type to add one.</Text>
          )}
          {!!q && !exactMatch && (
            <Pressable style={styles.addItem} onPress={createNew} disabled={creating}>
              <Text style={styles.addItemText}>{creating ? 'Adding…' : `+ Add "${query.trim()}"`}</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff',
  },
  dropdown: {
    borderWidth: 1, borderColor: '#E5E0E3', borderRadius: 10, marginTop: 6, overflow: 'hidden', maxHeight: 200,
  },
  item: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F5F3F5' },
  itemActive: { backgroundColor: '#F9EEF2' },
  itemText: { fontSize: 12, color: '#1C0D14' },
  itemTextActive: { fontWeight: '600' },
  emptyText: { padding: 12, fontSize: 12, color: '#7A6870' },
  addItem: { padding: 12 },
  addItemText: { fontSize: 12, color: '#7D1D3F', fontWeight: '500' },
});
