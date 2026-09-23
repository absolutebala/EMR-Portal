import { memo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { MobileFormField } from '@/lib/types';
import RNSignaturePad from '@/components/RNSignaturePad';
import RNPhotoField from '@/components/RNPhotoField';

interface Props {
  field: MobileFormField;
  value: string;
  onChange: (id: string, value: string) => void;
  onBlur?: (field: MobileFormField, value: string) => void;
  bordered: boolean;
  isIncomplete: boolean;
  error?: string;
}

// Dates are entered via a native picker and stored/displayed as DD/MM/YYYY. Parse both
// DD/MM/YYYY (current) and legacy YYYY-MM-DD (older submissions) so an existing value
// still opens the picker on the right day.
function parseStoredDate(v: string): Date | null {
  const s = (v || '').trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) { const d = new Date(+m[3], +m[2] - 1, +m[1]); return Number.isNaN(d.getTime()) ? null : d; }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const d = new Date(+m[1], +m[2] - 1, +m[3]); return Number.isNaN(d.getTime()) ? null : d; }
  return null;
}
function formatDDMMYYYY(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// RN port of FormFillView.tsx's memoized FormFieldRow — memoized so typing into one
// field doesn't re-render every other field/row in a large form.
const FormFieldRow = memo(function FormFieldRow({ field, value, onChange, onBlur, bordered, isIncomplete, error }: Props) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  // A prefill_from_job field only becomes a permanent, non-editable static display
  // when it's ALSO read_only_on_mobile. A prefill field that's still editable must
  // actually render as editable, or a failed auto-fill lookup (e.g. no rating/
  // manufacturer on file for this transformer) becomes an unfillable dead end.
  const isStaticDisplay = field.prefill_from_job && field.read_only_on_mobile;

  // RNSignaturePad already renders its own label (used both above the preview box and
  // as the modal title) — showing FormFieldRow's own label too would duplicate it.
  const showOuterLabel = field.field_type !== 'signature' || isStaticDisplay;

  return (
    <View style={[styles.container, bordered && styles.bordered, isIncomplete && styles.incomplete]}>
      {showOuterLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {field.label}
          </Text>
          {field.prefill_from_job && (
            <View style={styles.autoFilledBadge}>
              <Text style={styles.autoFilledText}>Auto-filled</Text>
            </View>
          )}
        </View>
      )}

      {isStaticDisplay ? (
        <View style={styles.prefillBox}>
          <Text style={styles.prefillText}>{value || '—'}</Text>
        </View>
      ) : field.repeatable ? (
        (() => {
          // Repeatable "points" list — each line is one point; value stored newline-joined.
          const points = value.length ? value.split('\n') : [''];
          const commit = (next: string[]) => onChange(field.id, next.join('\n'));
          return (
            <View style={{ gap: 8 }}>
              {points.map((pt, i) => (
                <View key={i} style={styles.pointRow}>
                  <Text style={styles.pointNum}>{i + 1}.</Text>
                  <TextInput
                    style={styles.pointInput}
                    value={pt}
                    onChangeText={v => { const n = [...points]; n[i] = v; commit(n); }}
                    placeholder="Add a point"
                    placeholderTextColor="#9CA3AF"
                    multiline
                  />
                  {points.length > 1 && (
                    <Pressable onPress={() => { const n = points.filter((_, j) => j !== i); commit(n.length ? n : ['']); }} style={styles.pointRemove}>
                      <Text style={styles.pointRemoveText}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              <Pressable onPress={() => commit([...points, ''])} style={styles.addPointBtn}>
                <Text style={styles.addPointText}>+ Add point</Text>
              </Pressable>
            </View>
          );
        })()
      ) : field.field_type === 'long_text' ? (
        <TextInput
          style={[styles.textarea, field.read_only_on_mobile && styles.readOnlyBg, !!error && styles.inputError]}
          value={value}
          onChangeText={v => onChange(field.id, v)}
          onBlur={() => onBlur?.(field, value)}
          editable={!field.read_only_on_mobile}
          placeholder={field.placeholder || ''}
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />
      ) : field.field_type === 'date' ? (
        <>
          <Pressable
            onPress={() => { if (!field.read_only_on_mobile) setShowDatePicker(true); }}
            style={[styles.input, styles.dateInput, field.read_only_on_mobile && styles.readOnlyBg, !!error && styles.inputError]}
          >
            <Text style={value ? styles.dateText : styles.datePlaceholder}>
              {value ? (parseStoredDate(value) ? formatDDMMYYYY(parseStoredDate(value)!) : value) : 'DD/MM/YYYY'}
            </Text>
            <Text style={styles.dateIcon}>📅</Text>
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={parseStoredDate(value) || new Date()}
              mode="date"
              onChange={(e: DateTimePickerEvent, d?: Date) => {
                setShowDatePicker(false);
                if (e.type === 'set' && d) onChange(field.id, formatDDMMYYYY(d));
              }}
            />
          )}
        </>
      ) : field.field_type === 'checkbox' ? (
        <View style={styles.yesNoRow}>
          {(['true', 'false'] as const).map(v => {
            const on = value === v;
            return (
              <Pressable
                key={v}
                onPress={() => onChange(field.id, on ? '' : v)}
                style={[styles.yesNoBtn, on && styles.yesNoBtnOn]}
              >
                <Text style={[styles.yesNoText, on && styles.yesNoTextOn]}>{v === 'true' ? 'Yes' : 'No'}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : field.field_type === 'signature' ? (
        <RNSignaturePad label={field.label} value={value} onChange={v => onChange(field.id, v)} readOnly={field.read_only_on_mobile} />
      ) : field.field_type === 'photo' ? (
        <RNPhotoField value={value} onChange={v => onChange(field.id, v)} readOnly={field.read_only_on_mobile} />
      ) : (
        <TextInput
          style={[styles.input, field.read_only_on_mobile && styles.readOnlyBg, !!error && styles.inputError]}
          value={value}
          onChangeText={v => onChange(field.id, field.field_type === 'number' ? v.replace(/[^0-9.\-]/g, '') : v)}
          onBlur={() => onBlur?.(field, value)}
          editable={!field.read_only_on_mobile}
          placeholder={field.placeholder || ''}
          placeholderTextColor="#9CA3AF"
          keyboardType={field.field_type === 'number' ? 'numeric' : 'default'}
        />
      )}

      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {!!field.help_text && <Text style={styles.helpText}>{field.help_text}</Text>}
    </View>
  );
});

export default FormFieldRow;

const styles = StyleSheet.create({
  container: { padding: 14 },
  bordered: { borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  incomplete: { backgroundColor: '#FEF2F2', borderLeftWidth: 3, borderLeftColor: '#DC2626' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: '500', color: '#374151' },
  autoFilledBadge: { backgroundColor: '#F9EEF2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  autoFilledText: { fontSize: 9, color: '#7D1D3F', fontWeight: '600' },
  prefillBox: { backgroundColor: '#F5F3F5', borderRadius: 10, borderWidth: 1, borderColor: '#E5E0E3', padding: 12 },
  prefillText: { fontSize: 13, fontWeight: '500', color: '#1C0D14' },
  textarea: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 11, fontSize: 14,
    color: '#1C0D14', backgroundColor: '#fff', textAlignVertical: 'top', minHeight: 70,
  },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 11, fontSize: 14,
    color: '#1C0D14', backgroundColor: '#fff',
  },
  readOnlyBg: { backgroundColor: '#F5F3F5' },
  dateInput: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: 14, color: '#1C0D14' },
  datePlaceholder: { fontSize: 14, color: '#9CA3AF' },
  dateIcon: { fontSize: 15 },
  inputError: { borderColor: '#DC2626' },
  errorText: { fontSize: 11, color: '#DC2626', marginTop: 4, fontWeight: '500' },
  yesNoRow: { flexDirection: 'row', gap: 10 },
  yesNoBtn: { flex: 1, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' },
  yesNoBtnOn: { borderColor: '#7D1D3F', backgroundColor: '#7D1D3F' },
  yesNoText: { fontSize: 14, fontWeight: '500', color: '#1C0D14' },
  yesNoTextOn: { color: '#fff' },
  helpText: { fontSize: 11, color: '#7A6870', marginTop: 4 },
  pointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  pointNum: { fontSize: 13, color: '#7A6870', paddingTop: 12, minWidth: 16 },
  pointInput: {
    flex: 1, borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 11, fontSize: 14,
    color: '#1C0D14', backgroundColor: '#fff', textAlignVertical: 'top', minHeight: 48,
  },
  pointRemove: { marginTop: 6, width: 30, height: 30, borderRadius: 8, borderWidth: 1.5, borderColor: '#E5E0E3', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  pointRemoveText: { color: '#991B1B', fontSize: 18, lineHeight: 20 },
  addPointBtn: { alignSelf: 'flex-start', borderWidth: 1.5, borderColor: '#7D1D3F', backgroundColor: '#F9EEF2', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  addPointText: { color: '#7D1D3F', fontSize: 13, fontWeight: '700' },
});
