import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { useMyAnalytics, useMyAnalyticsDrilldown } from '@/lib/hooks';
import type { AnalyticsMetric, EngineerAnalyticsSummary } from '@/lib/types';

const METRICS: { key: AnalyticsMetric; label: string }[] = [
  { key: 'assigned', label: 'Assigned' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'reassigned', label: 'Reassigned' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'present', label: 'Attendance' },
  { key: 'leave', label: 'Leave' },
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function metricValue(summary: EngineerAnalyticsSummary, key: AnalyticsMetric): string {
  switch (key) {
    case 'assigned': return String(summary.assigned);
    case 'resolved': return String(summary.resolved);
    case 'reassigned': return String(summary.reassigned);
    case 'expenses': return `₹${summary.expenseTotal.toLocaleString('en-IN')}`;
    case 'present': return String(summary.present);
    case 'leave': return String(summary.leave);
  }
}

export default function MyAnalyticsScreen() {
  const [month, setMonth] = useState(currentMonth());
  const [expanded, setExpanded] = useState<AnalyticsMetric | null>(null);

  const { data, isLoading } = useMyAnalytics(month);
  const { data: drilldownData, isLoading: drilldownLoading } = useMyAnalyticsDrilldown(month, expanded);

  function goPrev() { setExpanded(null); setMonth(m => shiftMonth(m, -1)); }
  function goNext() { setExpanded(null); setMonth(m => shiftMonth(m, 1)); }
  function toggleMetric(key: AnalyticsMetric) { setExpanded(e => (e === key ? null : key)); }

  const summary = data?.summary;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: true, title: 'My Analytics', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />

      <View style={styles.monthNav}>
        <Pressable style={styles.navButton} onPress={goPrev} accessibilityLabel="Previous month">
          <Text style={styles.navButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(month)}</Text>
        <Pressable style={styles.navButton} onPress={goNext} accessibilityLabel="Next month">
          <Text style={styles.navButtonText}>›</Text>
        </Pressable>
      </View>

      {!!data?.error && <Text style={styles.error}>{data.error}</Text>}

      {isLoading || !summary ? (
        <ActivityIndicator color="#7D1D3F" style={{ marginTop: 20 }} />
      ) : (
        METRICS.map(m => {
          const isOpen = expanded === m.key;
          return (
            <View key={m.key} style={styles.card}>
              <Pressable style={styles.cardHeader} onPress={() => toggleMetric(m.key)}>
                <Text style={styles.cardLabel}>{m.label}</Text>
                <View style={styles.cardValueRow}>
                  <Text style={styles.cardValue}>{metricValue(summary, m.key)}</Text>
                  <Text style={[styles.chevron, isOpen && styles.chevronOpen]}>›</Text>
                </View>
              </Pressable>

              {isOpen && (
                <View style={styles.drilldown}>
                  {drilldownLoading ? (
                    <Text style={styles.drilldownEmpty}>Loading…</Text>
                  ) : !drilldownData?.rows.length ? (
                    <Text style={styles.drilldownEmpty}>No records for this month.</Text>
                  ) : (
                    drilldownData.rows.map(row => (
                      <View key={row.id} style={styles.drilldownRow}>
                        {(m.key === 'assigned' || m.key === 'resolved' || m.key === 'reassigned') && (
                          <>
                            <Text style={styles.drilldownTitle}>{row.woNumber || '—'}</Text>
                            <Text style={styles.drilldownSub}>{row.customerName || '—'} · {row.status || '—'} · {fmtDate(row.date)}</Text>
                          </>
                        )}
                        {m.key === 'expenses' && (
                          <View style={styles.drilldownExpenseRow}>
                            <Text style={styles.drilldownSub}>{row.woNumber || '—'} · {row.status || '—'} · {fmtDate(row.date)}</Text>
                            <Text style={styles.drilldownAmount}>₹{(row.amount ?? 0).toLocaleString('en-IN')}</Text>
                          </View>
                        )}
                        {(m.key === 'present' || m.key === 'leave') && (
                          <Text style={styles.drilldownTitle}>{fmtDate(row.date)}</Text>
                        )}
                      </View>
                    ))
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 32 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  navButton: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  navButtonText: { fontSize: 18, color: '#1C0D14', fontWeight: '600' },
  monthLabel: { fontSize: 14, fontWeight: '700', color: '#1C0D14' },
  error: { color: '#DC2626', fontSize: 12, marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 9, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  cardLabel: { fontSize: 13, fontWeight: '600', color: '#1C0D14' },
  cardValueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardValue: { fontSize: 16, fontWeight: '700', color: '#7D1D3F' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  chevronOpen: { transform: [{ rotate: '90deg' }] },
  drilldown: { borderTopWidth: 1, borderTopColor: '#F5F3F5', paddingHorizontal: 14, paddingVertical: 8 },
  drilldownEmpty: { fontSize: 12, color: '#7A6870', paddingVertical: 6 },
  drilldownRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F3F5' },
  drilldownTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14' },
  drilldownSub: { fontSize: 11, color: '#7A6870', marginTop: 2 },
  drilldownExpenseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drilldownAmount: { fontSize: 12, fontWeight: '700', color: '#1C0D14' },
});
