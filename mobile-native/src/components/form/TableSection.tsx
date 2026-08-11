import { memo } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import type { MobileFormRow, MobileFormTable, RowValues } from '@/lib/types';

interface RowProps {
  row: MobileFormRow;
  indent: boolean;
  index: number;
  value: { status: string; remarks: string };
  setRowStatus: (id: string, status: string) => void;
  setRowRemarks: (id: string, remarks: string) => void;
  isIncomplete: boolean;
}

const EMPTY_ROW_VALUE = { status: '', remarks: '' };

// RN port of FormFillView.tsx's YesNoRow — memoized so drawing/typing in one row
// doesn't re-render every other row in a large table.
const YesNoRow = memo(function YesNoRow({ row, indent, index, value, setRowStatus, setRowRemarks, isIncomplete }: RowProps) {
  return (
    <View style={[
      styles.rowBase, indent && styles.rowIndent, (index > 0 || indent) && styles.rowBordered,
      isIncomplete && styles.rowIncomplete,
    ]}>
      <Text style={styles.rowLabel}>
        {row.sno_label ? <Text style={styles.snoLabel}>{row.sno_label}. </Text> : null}
        {row.row_label}
      </Text>
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.toggleButton, value.status === 'yes' && styles.yesActive]}
          onPress={() => setRowStatus(row.id, value.status === 'yes' ? '' : 'yes')}
        >
          <Text style={[styles.toggleButtonText, value.status === 'yes' && styles.toggleButtonTextActive]}>✓ Yes</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, value.status === 'no' && styles.noActive]}
          onPress={() => setRowStatus(row.id, value.status === 'no' ? '' : 'no')}
        >
          <Text style={[styles.toggleButtonText, value.status === 'no' && styles.toggleButtonTextActive]}>✗ No</Text>
        </Pressable>
      </View>
      {!!value.status && (
        <TextInput
          style={styles.remarksInput}
          value={value.remarks}
          onChangeText={v => setRowRemarks(row.id, v)}
          placeholder="Remarks (optional)"
          placeholderTextColor="#9CA3AF"
        />
      )}
    </View>
  );
});

// RN port of FormFillView.tsx's TestedRow.
const TestedRow = memo(function TestedRow({ row, indent, index, value, setRowStatus, setRowRemarks, isIncomplete }: RowProps) {
  return (
    <View style={[
      styles.rowBase, indent && styles.rowIndent, (index > 0 || indent) && styles.rowBordered,
      isIncomplete && styles.rowIncomplete,
    ]}>
      <Text style={styles.rowLabel}>
        {row.sno_label ? <Text style={styles.snoLabel}>{row.sno_label}. </Text> : null}
        {row.row_label}
      </Text>
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.toggleButton, value.status === 'tested' && styles.testedActive]}
          onPress={() => setRowStatus(row.id, value.status === 'tested' ? '' : 'tested')}
        >
          <Text style={[styles.toggleButtonText, value.status === 'tested' && styles.toggleButtonTextActive]}>Tested</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleButton, value.status === 'not_tested' && styles.notTestedActive]}
          onPress={() => setRowStatus(row.id, value.status === 'not_tested' ? '' : 'not_tested')}
        >
          <Text style={[styles.toggleButtonText, value.status === 'not_tested' && styles.toggleButtonTextActive]}>Not Tested</Text>
        </Pressable>
      </View>
      {!!value.status && (
        <TextInput
          style={styles.remarksInput}
          value={value.remarks}
          onChangeText={v => setRowRemarks(row.id, v)}
          placeholder="Remarks (optional)"
          placeholderTextColor="#9CA3AF"
        />
      )}
    </View>
  );
});

interface TableSectionProps {
  table: MobileFormTable;
  rowValues: RowValues;
  setRowStatus: (id: string, status: string) => void;
  setRowRemarks: (id: string, remarks: string) => void;
  incompleteIds: Set<string>;
}

// RN port of FormFillView.tsx's renderTable — covers all 7 status_types, with
// parent/child row nesting for the two-toggle types (yes_no, tested_not_tested).
export default function TableSection({ table, rowValues, setRowStatus, setRowRemarks, incompleteIds }: TableSectionProps) {
  const topRows = table.rows.filter(r => !r.parent_row_id);
  const childMap: Record<string, MobileFormRow[]> = {};
  table.rows.filter(r => r.parent_row_id).forEach(r => {
    if (!childMap[r.parent_row_id!]) childMap[r.parent_row_id!] = [];
    childMap[r.parent_row_id!].push(r);
  });

  if (table.status_type === 'yes_no') {
    return (
      <View>
        {topRows.map((row, i) => (
          <View key={row.id}>
            <YesNoRow row={row} indent={false} index={i} value={rowValues[row.id] || EMPTY_ROW_VALUE} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} isIncomplete={incompleteIds.has(row.id)} />
            {(childMap[row.id] || []).map((child, ci) => (
              <YesNoRow key={child.id} row={child} indent index={ci} value={rowValues[child.id] || EMPTY_ROW_VALUE} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} isIncomplete={incompleteIds.has(child.id)} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (table.status_type === 'tested_not_tested') {
    return (
      <View>
        {topRows.map((row, i) => (
          <View key={row.id}>
            <TestedRow row={row} indent={false} index={i} value={rowValues[row.id] || EMPTY_ROW_VALUE} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} isIncomplete={incompleteIds.has(row.id)} />
            {(childMap[row.id] || []).map((child, ci) => (
              <TestedRow key={child.id} row={child} indent index={ci} value={rowValues[child.id] || EMPTY_ROW_VALUE} setRowStatus={setRowStatus} setRowRemarks={setRowRemarks} isIncomplete={incompleteIds.has(child.id)} />
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (table.status_type === 'checkbox_only') {
    return (
      <View>
        {topRows.map((row, i) => {
          const isIncomplete = incompleteIds.has(row.id);
          const checked = rowValues[row.id]?.status === 'checked';
          return (
            <Pressable
              key={row.id}
              style={[styles.checkboxRow, i > 0 && styles.rowBordered, isIncomplete && styles.rowIncomplete]}
              onPress={() => setRowStatus(row.id, checked ? '' : 'checked')}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxRowLabel}>
                {row.sno_label ? <Text style={styles.snoLabel}>{row.sno_label}. </Text> : null}
                {row.row_label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (table.status_type === 'two_party' || table.status_type === 'two_party_exclusive') {
    return (
      <View>
        <View style={styles.twoPartyHeader}>
          <Text style={styles.twoPartyHeaderText}>Item</Text>
          <Text style={[styles.twoPartyHeaderText, styles.twoPartyCol]}>{table.col1_label || 'Col 1'}</Text>
          <Text style={[styles.twoPartyHeaderText, styles.twoPartyCol]}>{table.col2_label || 'Col 2'}</Text>
        </View>
        {topRows.map(row => {
          const isIncomplete = incompleteIds.has(row.id);
          const status = rowValues[row.id]?.status;
          return (
            <View key={row.id} style={[styles.twoPartyRow, isIncomplete && styles.rowIncomplete]}>
              <Text style={styles.twoPartyLabel}>
                {row.sno_label ? <Text style={styles.snoLabel}>{row.sno_label}. </Text> : null}
                {row.row_label}
              </Text>
              <Pressable style={styles.twoPartyCol} onPress={() => setRowStatus(row.id, status === 'col1' ? '' : 'col1')}>
                <View style={[styles.checkbox, status === 'col1' && styles.checkboxChecked, styles.centered]}>
                  {status === 'col1' && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>
              <Pressable style={styles.twoPartyCol} onPress={() => setRowStatus(row.id, status === 'col2' ? '' : 'col2')}>
                <View style={[styles.checkbox, status === 'col2' && styles.checkboxChecked, styles.centered]}>
                  {status === 'col2' && <Text style={styles.checkmark}>✓</Text>}
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  }

  // observation / measurement: free-text or numeric input per row
  return (
    <View>
      {topRows.map((row, i) => {
        const isIncomplete = incompleteIds.has(row.id);
        return (
          <View key={row.id} style={[styles.rowBase, i > 0 && styles.rowBordered, isIncomplete && styles.rowIncomplete]}>
            <Text style={styles.observationLabel}>
              {row.sno_label ? <Text style={styles.snoLabel}>{row.sno_label}. </Text> : null}
              {row.row_label}
            </Text>
            <TextInput
              style={[styles.input, isIncomplete && styles.inputIncomplete]}
              value={rowValues[row.id]?.remarks || ''}
              onChangeText={v => setRowRemarks(row.id, v)}
              placeholder={table.status_type === 'measurement' ? 'Enter value' : 'Enter observation'}
              placeholderTextColor="#9CA3AF"
              keyboardType={table.status_type === 'measurement' ? 'numeric' : 'default'}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rowBase: { padding: 14 },
  rowIndent: { paddingLeft: 28, backgroundColor: '#FAFAFA' },
  rowBordered: { borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  rowIncomplete: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  rowLabel: { fontSize: 13, color: '#1C0D14', marginBottom: 10, lineHeight: 18 },
  snoLabel: { color: '#7A6870', fontWeight: '500' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  toggleButton: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: '#E5E0E3', alignItems: 'center' },
  toggleButtonText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  toggleButtonTextActive: { color: '#fff' },
  yesActive: { backgroundColor: '#059669', borderColor: '#059669' },
  noActive: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  testedActive: { backgroundColor: '#1E40AF', borderColor: '#1E40AF' },
  notTestedActive: { backgroundColor: '#7A6870', borderColor: '#7A6870' },
  remarksInput: {
    marginTop: 8, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 8, paddingHorizontal: 12,
    paddingVertical: 9, fontSize: 13, color: '#1C0D14',
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  checkboxRowLabel: { fontSize: 13, color: '#1C0D14', flex: 1, lineHeight: 18 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#7D1D3F', borderColor: '#7D1D3F' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  centered: { alignSelf: 'center' },
  twoPartyHeader: { flexDirection: 'row', backgroundColor: '#F5F3F5', paddingVertical: 8, paddingHorizontal: 14 },
  twoPartyHeaderText: { fontSize: 11, fontWeight: '600', color: '#7A6870', flex: 1 },
  twoPartyCol: { width: 60, alignItems: 'center', justifyContent: 'center' },
  twoPartyRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F5F3F5', paddingVertical: 10, paddingHorizontal: 14 },
  twoPartyLabel: { fontSize: 12, color: '#1C0D14', flex: 1, lineHeight: 18 },
  observationLabel: { fontSize: 12, color: '#374151', fontWeight: '500', marginBottom: 6 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#1C0D14', backgroundColor: '#fff',
  },
  inputIncomplete: { borderColor: '#DC2626' },
});
