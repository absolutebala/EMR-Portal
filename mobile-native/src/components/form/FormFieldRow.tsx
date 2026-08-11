import { memo } from 'react';
import { View, Text, TextInput, Switch, StyleSheet } from 'react-native';
import type { MobileFormField } from '@/lib/types';
import RNSignaturePad from '@/components/RNSignaturePad';
import RNPhotoField from '@/components/RNPhotoField';

interface Props {
  field: MobileFormField;
  value: string;
  onChange: (id: string, value: string) => void;
  bordered: boolean;
  isIncomplete: boolean;
}

// RN port of FormFillView.tsx's memoized FormFieldRow — memoized so typing into one
// field doesn't re-render every other field/row in a large form.
const FormFieldRow = memo(function FormFieldRow({ field, value, onChange, bordered, isIncomplete }: Props) {
  // A prefill_from_job field only becomes a permanent, non-editable static display
  // when it's ALSO read_only_on_mobile — matching the validator's carve-out, which
  // only skips the required-check for that exact combination (a field the engineer
  // has no way to fix). A prefill field that's still editable must actually render as
  // editable, or a failed auto-fill lookup (e.g. no rating/manufacturer on file for
  // this transformer) becomes an unfillable, submit-blocking dead end.
  const isStaticDisplay = field.prefill_from_job && field.read_only_on_mobile;
  const showAsterisk = !isStaticDisplay;

  // RNSignaturePad already renders its own label (used both above the preview box and
  // as the modal title) — showing FormFieldRow's own label too would duplicate it.
  const showOuterLabel = field.field_type !== 'signature' || isStaticDisplay;

  return (
    <View style={[styles.container, bordered && styles.bordered, isIncomplete && styles.incomplete]}>
      {showOuterLabel && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {field.label}
            {showAsterisk && <Text style={styles.asterisk}> *</Text>}
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
      ) : field.field_type === 'long_text' ? (
        <TextInput
          style={[styles.textarea, field.read_only_on_mobile && styles.readOnlyBg]}
          value={value}
          onChangeText={v => onChange(field.id, v)}
          editable={!field.read_only_on_mobile}
          placeholder={field.placeholder || ''}
          placeholderTextColor="#9CA3AF"
          multiline
          numberOfLines={3}
        />
      ) : field.field_type === 'checkbox' ? (
        <View style={styles.checkboxRow}>
          <Switch
            value={value === 'true'}
            onValueChange={v => onChange(field.id, String(v))}
            trackColor={{ true: '#7D1D3F' }}
          />
          <Text style={styles.checkboxLabel}>Yes</Text>
        </View>
      ) : field.field_type === 'signature' ? (
        <RNSignaturePad label={field.label} value={value} onChange={v => onChange(field.id, v)} readOnly={field.read_only_on_mobile} />
      ) : field.field_type === 'photo' ? (
        <RNPhotoField value={value} onChange={v => onChange(field.id, v)} readOnly={field.read_only_on_mobile} />
      ) : (
        <TextInput
          style={[styles.input, field.read_only_on_mobile && styles.readOnlyBg]}
          value={value}
          onChangeText={v => onChange(field.id, v)}
          editable={!field.read_only_on_mobile}
          placeholder={field.placeholder || (field.field_type === 'date' ? 'YYYY-MM-DD' : '')}
          placeholderTextColor="#9CA3AF"
          keyboardType={field.field_type === 'number' ? 'numeric' : 'default'}
        />
      )}

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
  asterisk: { color: '#DC2626' },
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
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkboxLabel: { fontSize: 14, color: '#1C0D14' },
  helpText: { fontSize: 11, color: '#7A6870', marginTop: 4 },
});
