import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Boxes, ChevronRight, History, Package, RefreshCw, Save, Search, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopInventoryMovement, ShopProduct } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';
import ShopProductPicture from '@/components/ShopProductPicture';

export default function ShopInventoryManager() {
  const { token } = useAuth();
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [movements, setMovements] = useState<ShopInventoryMovement[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [quantity, setQuantity] = useState('0');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true); setError('');
    try { setProducts(await shopApi.listInventory(token)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Stocurile nu au putut fi incarcate.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? products.filter((product) => `${product.name} ${product.sku || ''}`.toLowerCase().includes(term)) : products;
  }, [products, query]);
  const pageSize = 20;
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const open = async (product: ShopProduct) => {
    setSelected(product); setQuantity(String(product.stock_quantity)); setNote(''); setMovements([]);
    if (token) {
      try { setMovements(await shopApi.listInventoryMovements(token, product.id)); } catch {}
    }
  };

  const save = async () => {
    if (!token || !selected || saving) return;
    const next = Number.parseInt(quantity || '0', 10);
    if (!Number.isFinite(next) || next < 0) { Alert.alert('Cantitate invalida', 'Introdu o cantitate egala sau mai mare decat zero.'); return; }
    setSaving(true);
    try {
      const updated = await shopApi.adjustStock(token, selected.id, next, note.trim() || 'Ajustare manuala din aplicatie');
      setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
      setSelected(updated);
      setMovements(await shopApi.listInventoryMovements(token, updated.id));
      Alert.alert('Stoc actualizat', `Noul stoc este ${updated.stock_quantity} bucati.`);
    } catch (saveError) { Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.'); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca stocurile...</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>;
  const tracked = products.filter((product) => product.stock_mode === 'tracked');
  const low = tracked.filter((product) => product.stock_quantity <= product.low_stock_threshold);

  return <View style={styles.wrap}>
    <View style={styles.actions}><View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Cauta produs sau SKU" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
    <View style={styles.stats}><View><Text style={styles.statValue}>{tracked.length}</Text><Text style={styles.statLabel}>URMARITE</Text></View><View><Text style={[styles.statValue, low.length > 0 && styles.lowText]}>{low.length}</Text><Text style={styles.statLabel}>STOC MIC</Text></View><View><Text style={styles.statValue}>{products.length - tracked.length}</Text><Text style={styles.statLabel}>NELIMITATE</Text></View></View>
    {filtered.length ? pagedProducts.map((product) => {
      const isLow = product.stock_mode === 'tracked' && product.stock_quantity <= product.low_stock_threshold;
      return <TouchableOpacity key={product.id} style={styles.card} activeOpacity={product.stock_mode === 'tracked' ? 0.76 : 1} onPress={() => product.stock_mode === 'tracked' && void open(product)}>
        {product.images?.[0]?.url ? <ShopProductPicture image={product.images[0]} width={61} height={61} borderRadius={14} /> : <View style={styles.imageFallback}><Package size={22} color={Colors.textMuted} /></View>}
        <View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{product.name}</Text><Text style={styles.meta}>{product.sku || 'Fara SKU'}</Text><View style={styles.stockLine}><View><Text style={styles.stockLabel}>STOC ONLINE</Text><Text style={[styles.quantity, isLow && styles.lowText]}>{product.stock_mode === 'unlimited' ? 'NELIMITAT' : `${product.stock_quantity} BUC.`}</Text></View><View><Text style={styles.stockLabel}>STOC CONTA</Text><Text style={styles.accountingQuantity}>{product.accounting_stock_quantity} BUC.</Text></View>{isLow ? <Text style={styles.warning}>STOC MIC</Text> : null}</View></View>
        {product.stock_mode === 'tracked' ? <ChevronRight size={18} color={Colors.textMuted} /> : <Boxes size={19} color="#22C55E" />}
      </TouchableOpacity>;
    }) : <View style={styles.empty}><Boxes size={34} color="#22C55E" /><Text style={styles.emptyTitle}>Niciun produs in stoc</Text></View>}
    <ShopPagination page={safePage} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />

    <Modal visible={Boolean(selected)} animationType="slide" transparent onRequestClose={() => !saving && setSelected(null)}>
      <View style={styles.backdrop}><SafeAreaView style={styles.sheet} edges={['bottom']}><View style={styles.sheetHeader}><View><Text style={styles.sheetKicker}>AJUSTARE STOC</Text><Text style={styles.sheetTitle}>{selected?.name}</Text></View><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>CANTITATE NOUA</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" selectTextOnFocus style={styles.quantityInput} />
          <View style={styles.quick}><TouchableOpacity onPress={() => setQuantity(String(Math.max(0, Number(quantity || 0) - 1)))}><Text>-1</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 1))}><Text>+1</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 5))}><Text>+5</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 10))}><Text>+10</Text></TouchableOpacity></View>
          <Text style={styles.label}>MOTIV / NOTITA</Text><TextInput value={note} onChangeText={setNote} placeholder="Ex: Marfa receptionata de la furnizor" placeholderTextColor={Colors.textMuted} multiline style={styles.note} />
          <TouchableOpacity style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveText}>Actualizeaza stocul</Text></>}</TouchableOpacity>
          <View style={styles.historyHead}><History size={17} color={Colors.orange} /><Text style={styles.historyTitle}>ISTORIC RECENT</Text></View>
          {movements.slice(0, 20).map((movement) => <View key={movement.id} style={styles.movement}><View style={[styles.delta, movement.quantity_delta >= 0 ? styles.deltaPlus : styles.deltaMinus]}><Text>{movement.quantity_delta > 0 ? '+' : ''}{movement.quantity_delta}</Text></View><View style={styles.movementCopy}><Text style={styles.movementNote}>{movement.note || movement.movement_type}</Text><Text style={styles.movementMeta}>{movement.created_at} · stoc {movement.quantity_after}</Text></View></View>)}
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B1B1F' },
  stats: { flexDirection: 'row', gap: 20, marginVertical: 10, paddingHorizontal: 4 }, statValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16 }, statLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7, marginTop: 2 }, lowText: { color: '#FCA5A5' },
  card: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, padding: 10, backgroundColor: '#1B1B1F', marginBottom: 8 }, image: { width: 61, height: 61, borderRadius: 14 }, imageFallback: { width: 61, height: 61, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#27242A' }, copy: { flex: 1, minWidth: 0 }, name: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, stockLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 8 }, stockLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.5, marginBottom: 2 }, quantity: { color: '#9CD9AE', fontFamily: 'Inter-Bold', fontSize: 9 }, accountingQuantity: { color: '#93C5FD', fontFamily: 'Inter-Bold', fontSize: 9 }, warning: { color: '#FCA5A5', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 }, empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14, marginTop: 12 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.78)' }, sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, backgroundColor: '#1D1B20' }, sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }, sheetKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, sheetTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 18, marginTop: 3 }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2B292F' }, label: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginBottom: 7 }, quantityInput: { minHeight: 72, borderWidth: 1, borderColor: Colors.orange, borderRadius: 18, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Bold', fontSize: 30, textAlign: 'center' }, quick: { flexDirection: 'row', gap: 7, marginVertical: 10 }, note: { minHeight: 80, borderWidth: 1, borderColor: '#49454F', borderRadius: 14, padding: 12, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top', marginBottom: 12 }, save: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 11 }, disabled: { opacity: 0.55 }, historyHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 22, marginBottom: 10 }, historyTitle: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 }, movement: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#39363D' }, delta: { width: 42, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }, deltaPlus: { backgroundColor: 'rgba(34,197,94,0.12)' }, deltaMinus: { backgroundColor: 'rgba(239,68,68,0.12)' }, movementCopy: { flex: 1 }, movementNote: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, movementMeta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 },
});
