import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useJobs, searchProducts, useSubmitProductRequest } from '@/lib/hooks';
import { capturePhoto, type CapturedPhoto } from '@/lib/photo';
import { isOnline, apiErrorMessage } from '@/lib/offlineSubmit';
import RNWorkOrderPicker from '@/components/RNWorkOrderPicker';
import type { Product } from '@/lib/types';

interface CartItem { product: Product; quantity: number }

export default function NewRequestScreen() {
  const { wo } = useLocalSearchParams<{ wo?: string }>();
  const router = useRouter();
  const { data: jobsData } = useJobs('active');
  const submitProductRequest = useSubmitProductRequest();

  const [selectedWoId, setSelectedWoId] = useState(wo || '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [damagePhotos, setDamagePhotos] = useState<CapturedPhoto[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleQueryChange = useCallback((q: string) => {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimeout.current = setTimeout(async () => {
      const { products } = await searchProducts(q);
      setResults(products);
      setSearching(false);
    }, 300);
  }, []);

  useEffect(() => () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); }, []);

  async function handleFocus() {
    if (hasSearched || query) return;
    setSearching(true);
    const { products } = await searchProducts('');
    setResults(products);
    setSearching(false);
    setHasSearched(true);
  }

  function addToCart(product: Product) {
    setCart(prev => ({ ...prev, [product.id]: { product, quantity: (prev[product.id]?.quantity || 0) + 1 } }));
  }

  function changeQty(productId: string, delta: number) {
    setCart(prev => {
      const existing = prev[productId];
      if (!existing) return prev;
      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        const rest = { ...prev };
        delete rest[productId];
        return rest;
      }
      return { ...prev, [productId]: { ...existing, quantity: nextQty } };
    });
  }

  async function handleCapturePhoto() {
    setSubmitError('');
    setCapturing(true);
    try {
      const result = await capturePhoto();
      if (result) setDamagePhotos(prev => [...prev, result]);
    } catch {
      setSubmitError('Could not process that photo — please try again');
    } finally {
      setCapturing(false);
    }
  }

  function removePhoto(index: number) {
    setDamagePhotos(prev => prev.filter((_, i) => i !== index));
  }

  const cartItems = Object.values(cart);

  async function handleSubmit() {
    setSubmitError('');
    if (!selectedWoId) { setSubmitError('Select the linked notification'); return; }
    if (cartItems.length === 0) { setSubmitError('Add at least one product'); return; }
    if (damagePhotos.length === 0) { setSubmitError('At least one damaged-product photo is required'); return; }

    const variables = {
      workOrderId: selectedWoId,
      items: cartItems.map(c => ({ productId: c.product.id, quantity: c.quantity })),
      damagePhotos: damagePhotos.map(p => ({ base64: p.dataUrl, mimeType: p.mimeType, ext: p.ext })),
    };

    if (!(await isOnline())) {
      submitProductRequest.mutate(variables);
      Alert.alert('Saved — will sync', "You're offline. This request will be sent automatically once you're back online.");
      router.replace('/(app)/(tabs)/requests');
      return;
    }

    try {
      const result = await submitProductRequest.mutateAsync(variables);
      if (result.error) { setSubmitError(result.error); return; }
      setSubmitted(true);
    } catch (e) {
      setSubmitError(apiErrorMessage(e));
    }
  }

  const submitting = submitProductRequest.isPending;

  if (submitted) {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ headerShown: true, title: 'Request Submitted', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>Request submitted</Text>
        <Text style={styles.successSub}>Your supervisor will review it shortly.</Text>
        <Pressable style={styles.successButton} onPress={() => router.replace('/(app)/(tabs)/requests')}>
          <Text style={styles.successButtonText}>View my requests</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: 'New Request', headerTintColor: '#7D1D3F', headerBackTitle: '', headerBackButtonDisplayMode: 'minimal' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Linked notification <Text style={styles.required}>*</Text></Text>
          <RNWorkOrderPicker workOrders={jobsData?.workOrders || []} value={selectedWoId} onChange={setSelectedWoId} placeholder="Select a notification…" />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Products</Text>
          <View style={styles.searchWrap}>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={handleQueryChange}
              onFocus={handleFocus}
              placeholder="Search by product name or SAP code…"
              placeholderTextColor="#9CA3AF"
            />
            {searching && <ActivityIndicator size="small" color="#7D1D3F" style={styles.searchSpinner} />}
          </View>
          {results.map(p => (
            <View key={p.id} style={styles.resultRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{p.name}</Text>
                {!!p.sap_code && <Text style={styles.resultMeta}>SAP: {p.sap_code}</Text>}
              </View>
              <Pressable style={styles.addButton} onPress={() => addToCart(p)}>
                <Text style={styles.addButtonText}>Add</Text>
              </Pressable>
            </View>
          ))}
          {query.trim().length >= 2 && !searching && results.length === 0 && (
            <Text style={styles.noResults}>No products found for &quot;{query}&quot;</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Damaged product photos <Text style={styles.required}>*</Text></Text>
          <Text style={styles.cardSub}>Capture photos of the damaged products requiring replacement.</Text>
          <View style={styles.photoGrid}>
            {damagePhotos.map((p, i) => (
              <View key={i} style={styles.photoThumbWrap}>
                <Image source={{ uri: p.dataUrl }} style={styles.photoThumb} />
                <Pressable style={styles.removeButton} onPress={() => removePhoto(i)}>
                  <Text style={styles.removeButtonText}>×</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addPhotoBox} onPress={handleCapturePhoto} disabled={capturing}>
              {capturing ? <ActivityIndicator size="small" color="#7D1D3F" /> : <Text style={styles.addPhotoIcon}>+</Text>}
            </Pressable>
          </View>
        </View>

        <View style={styles.cartBox}>
          <View style={styles.cartHeader}>
            <Text style={styles.cartTitle}>Request cart</Text>
            <Text style={styles.cartCount}>{cartItems.length} item{cartItems.length !== 1 ? 's' : ''}</Text>
          </View>
          {cartItems.length === 0 ? (
            <Text style={styles.cartEmpty}>No products added yet.</Text>
          ) : (
            cartItems.map(c => (
              <View key={c.product.id} style={styles.cartRow}>
                <Text style={styles.cartItemName}>{c.product.name}</Text>
                <View style={styles.qtyRow}>
                  <Pressable style={styles.qtyButton} onPress={() => changeQty(c.product.id, -1)}>
                    <Text style={styles.qtyButtonText}>−</Text>
                  </Pressable>
                  <Text style={styles.qtyValue}>{c.quantity}</Text>
                  <Pressable style={styles.qtyButton} onPress={() => changeQty(c.product.id, 1)}>
                    <Text style={styles.qtyButtonText}>+</Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        {!!submitError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.submitButton, submitting && styles.submitButtonDisabled]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit request</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F5F6' },
  content: { padding: 16, paddingBottom: 100 },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 13, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '600', color: '#1C0D14', marginBottom: 10 },
  cardSub: { fontSize: 11, color: '#7A6870', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '500', color: '#7A6870', marginBottom: 4 },
  required: { color: '#7D1D3F' },
  input: {
    borderWidth: 1.5, borderColor: '#E5E0E3', borderRadius: 10, padding: 10, fontSize: 12,
    color: '#1C0D14', backgroundColor: '#fff',
  },
  searchWrap: { position: 'relative', marginBottom: 4 },
  searchSpinner: { position: 'absolute', right: 10, top: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#F5F3F5' },
  resultName: { fontSize: 12, fontWeight: '500', color: '#1C0D14' },
  resultMeta: { fontSize: 10, color: '#7A6870', marginTop: 2 },
  addButton: { borderRadius: 7, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#7D1D3F' },
  addButtonText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  noResults: { fontSize: 11, color: '#7A6870', marginTop: 4 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumbWrap: { width: 60, height: 60 },
  photoThumb: { width: 60, height: 60, borderRadius: 8, borderWidth: 1, borderColor: '#E5E0E3' },
  removeButton: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#DC2626', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  removeButtonText: { color: '#fff', fontSize: 11, lineHeight: 12 },
  addPhotoBox: {
    width: 60, height: 60, borderRadius: 8, borderWidth: 1.5, borderColor: '#E8C5D0', borderStyle: 'dashed',
    backgroundColor: '#F9EEF2', alignItems: 'center', justifyContent: 'center',
  },
  addPhotoIcon: { fontSize: 20, color: '#7D1D3F' },
  cartBox: { backgroundColor: '#F9EEF2', borderWidth: 1, borderColor: '#E8C5D0', borderRadius: 11, padding: 13 },
  cartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cartTitle: { fontSize: 12, fontWeight: '600', color: '#7D1D3F' },
  cartCount: { fontSize: 11, fontWeight: '500', color: '#7D1D3F' },
  cartEmpty: { fontSize: 11, color: '#7A6870' },
  cartRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 5 },
  cartItemName: { fontSize: 12, color: '#1C0D14' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyButton: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: '#E5E0E3', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  qtyButtonText: { fontSize: 13, lineHeight: 14, color: '#1C0D14' },
  qtyValue: { fontSize: 12, fontWeight: '600', minWidth: 14, textAlign: 'center' },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 10, padding: 12, marginTop: 12 },
  errorText: { color: '#DC2626', fontSize: 12 },
  footer: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E0E3', padding: 16 },
  submitButton: { backgroundColor: '#7D1D3F', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#A8294F' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8F5F6', padding: 24 },
  successIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successIconText: { fontSize: 26, color: '#059669', fontWeight: '700' },
  successTitle: { fontSize: 14, fontWeight: '600', color: '#1C0D14', marginBottom: 4 },
  successSub: { fontSize: 12, color: '#7A6870', marginBottom: 20 },
  successButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, backgroundColor: '#7D1D3F' },
  successButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
