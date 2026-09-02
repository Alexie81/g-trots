import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowDownLeft, ArrowUpRight, Boxes, ChevronLeft, ChevronRight, ClipboardList, FileText, History, Package, RefreshCw, Save, Search, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopInventoryMovement, ShopProduct } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';
import ShopProductPicture from '@/components/ShopProductPicture';

let inventoryProductsCache: ShopProduct[] = [];
const LEDGER_PAGE_SIZE = 5;

function movementDelta(movement: ShopInventoryMovement) {
  return Number(movement.accounting_quantity_delta ?? movement.quantity_delta ?? 0);
}

function movementAfter(movement: ShopInventoryMovement) {
  return Number(movement.accounting_quantity_after ?? movement.quantity_after ?? 0);
}

function movementDate(value?: string | null) {
  if (!value) return 'Dată indisponibilă';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function moneyRon(value?: string | number | null) {
  return `${Number(value || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
}

function movementLabel(type: string) {
  return ({ NIR_IN: 'Intrare din NIR', SALE_OUT: 'Ieșire prin vânzare', MANUAL_ADJUSTMENT: 'Ajustare manuală', RETURN_IN: 'Retur în stoc', REVERSAL_OUT: 'Stornare intrare' } as Record<string, string>)[type] || type.replaceAll('_', ' ');
}

function documentNumber(movement: ShopInventoryMovement) {
  return movement.note?.match(/NIR-[A-Z0-9-]+/i)?.[0] || 'NIR confirmat';
}

function normalizeSemanticSearch(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function searchEditDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
    previous = current;
  }
  return previous[right.length];
}

function inventorySearchScore(product: ShopProduct, rawQuery: string) {
  const normalizedQuery = normalizeSemanticSearch(rawQuery);
  if (!normalizedQuery) return 1;
  const fields: { text: string; weight: number }[] = [
    [product.name, 180], [product.sku, 230], [product.supplier_product_code, 230], [product.ean, 240],
    [product.category_name, 110], [product.manufacturer_name, 110], [product.brands?.map((brand) => brand.name).join(' '), 110],
    [product.source_name, 95], [product.source_domain, 90], [product.inventory_search_terms, 125],
    [product.slug, 80], [product.description_title, 65], [product.short_description, 55],
    [product.meta_title, 45], [product.meta_description, 35], [product.specifications?.map((item) => `${item.group || ''} ${item.label || ''} ${item.value || ''}`).join(' '), 60],
  ].map(([value, weight]) => ({ text: normalizeSemanticSearch(value), weight: Number(weight) })).filter((field) => field.text);
  const compactQuery = normalizedQuery.replaceAll(' ', '');
  let score = 0;
  fields.forEach((field) => {
    const compactField = field.text.replaceAll(' ', '');
    if (field.text === normalizedQuery || compactField === compactQuery) score = Math.max(score, field.weight * 5);
    else if (field.text.startsWith(normalizedQuery) || compactField.startsWith(compactQuery)) score = Math.max(score, field.weight * 3.5);
    else if (field.text.includes(normalizedQuery) || (compactQuery.length >= 3 && compactField.includes(compactQuery))) score = Math.max(score, field.weight * 2.5);
  });
  const tokens = [...new Set(normalizedQuery.split(' ').filter(Boolean))];
  for (const token of tokens) {
    let tokenScore = 0;
    fields.forEach((field) => field.text.split(' ').forEach((word) => {
      if (word === token) tokenScore = Math.max(tokenScore, field.weight);
      else if (word.startsWith(token) || token.startsWith(word)) tokenScore = Math.max(tokenScore, field.weight * 0.88);
      else if (token.length >= 3 && word.includes(token)) tokenScore = Math.max(tokenScore, field.weight * 0.72);
      else if (token.length >= 4 && word.length >= 4) {
        const tolerance = Math.max(1, Math.floor(Math.max(token.length, word.length) * 0.25));
        if (Math.abs(token.length - word.length) <= tolerance && searchEditDistance(token, word) <= tolerance) tokenScore = Math.max(tokenScore, field.weight * 0.56);
      }
    }));
    if (!tokenScore) return -1;
    score += tokenScore;
  }
  return score;
}

function Pager({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / LEDGER_PAGE_SIZE));
  const first = total ? (page - 1) * LEDGER_PAGE_SIZE + 1 : 0;
  const last = total ? Math.min(total, page * LEDGER_PAGE_SIZE) : 0;
  const pages: Array<number | 'ellipsis'> = pageCount <= 5
    ? Array.from({ length: pageCount }, (_, index) => index + 1)
    : Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
      .filter((value) => value >= 1 && value <= pageCount)
      .sort((a, b) => a - b)
      .flatMap((value, index, values) => index > 0 && value - values[index - 1] > 1 ? ['ellipsis', value] : [value]);
  return <View style={styles.ledgerPager}>
    <View style={styles.ledgerSummary}><Text style={styles.ledgerPageSize}>{LEDGER_PAGE_SIZE} / pagină</Text><Text style={styles.ledgerRange}>{first}–{last} din {total}</Text></View>
    <View style={styles.ledgerPages}>
      <TouchableOpacity disabled={page === 1} style={[styles.pageArrow, page === 1 && styles.disabled]} onPress={() => onChange(page - 1)}><ChevronLeft size={16} color={Colors.textSecondary} /></TouchableOpacity>
      {pages.map((value, index) => value === 'ellipsis'
        ? <Text key={`ellipsis-${index}`} style={styles.pageEllipsis}>…</Text>
        : <TouchableOpacity key={value} style={[styles.pageNumber, page === value && styles.pageNumberActive]} onPress={() => onChange(value)}><Text style={[styles.pageNumberText, page === value && styles.pageNumberTextActive]}>{value}</Text></TouchableOpacity>)}
      <TouchableOpacity disabled={page === pageCount} style={[styles.pageArrow, page === pageCount && styles.disabled]} onPress={() => onChange(page + 1)}><ChevronRight size={16} color={Colors.textSecondary} /></TouchableOpacity>
    </View>
  </View>;
}

export default function ShopInventoryManager({ onOpenNir }: { onOpenNir?: (nirId: string) => void }) {
  const { token } = useAuth();
  const [products, setProducts] = useState<ShopProduct[]>(inventoryProductsCache);
  const [movements, setMovements] = useState<ShopInventoryMovement[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(inventoryProductsCache.length === 0);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ShopProduct | null>(null);
  const [quantity, setQuantity] = useState('0');
  const [note, setNote] = useState('');
  const [entryPage, setEntryPage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);

  const load = useCallback(async () => {
    if (!token) return;
    if (!inventoryProductsCache.length) setLoading(true);
    setError('');
    try { const next = await shopApi.listInventory(token); inventoryProductsCache = next; setProducts(next); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Stocurile nu au putut fi încărcate.'); }
    finally { setLoading(false); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = normalizeSemanticSearch(query);
    return term ? products.map((product) => ({ product, score: inventorySearchScore(product, term) })).filter((item) => item.score >= 0).sort((left, right) => right.score - left.score || left.product.name.localeCompare(right.product.name, 'ro')).map((item) => item.product) : products;
  }, [products, query]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedProducts = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const nirEntries = useMemo(() => movements.filter((movement) => movement.movement_type === 'NIR_IN' && movement.nir_document_id), [movements]);
  const safeEntryPage = Math.min(entryPage, Math.max(1, Math.ceil(nirEntries.length / LEDGER_PAGE_SIZE)));
  const safeMovementPage = Math.min(movementPage, Math.max(1, Math.ceil(movements.length / LEDGER_PAGE_SIZE)));
  const entryRows = nirEntries.slice((safeEntryPage - 1) * LEDGER_PAGE_SIZE, safeEntryPage * LEDGER_PAGE_SIZE);
  const movementRows = movements.slice((safeMovementPage - 1) * LEDGER_PAGE_SIZE, safeMovementPage * LEDGER_PAGE_SIZE);

  const open = async (product: ShopProduct) => {
    setSelected(product); setQuantity(String(product.stock_quantity)); setNote(''); setMovements([]); setEntryPage(1); setMovementPage(1); setMovementsLoading(true);
    if (token) {
      try { setMovements(await shopApi.listInventoryMovements(token, product.id)); }
      catch { Alert.alert('Istoricul nu s-a încărcat', 'Fișa produsului rămâne deschisă. Încearcă din nou peste câteva momente.'); }
      finally { setMovementsLoading(false); }
    }
  };

  const save = async () => {
    if (!token || !selected || saving) return;
    const next = Number.parseInt(quantity || '0', 10);
    if (!Number.isFinite(next) || next < 0) { Alert.alert('Cantitate invalidă', 'Introdu o cantitate egală sau mai mare decât zero.'); return; }
    setSaving(true);
    try {
      const updated = await shopApi.adjustStock(token, selected.id, next, note.trim() || 'Ajustare manuală din aplicație');
      setProducts((current) => current.map((product) => product.id === updated.id ? updated : product));
      setSelected(updated); setMovementPage(1);
      setMovements(await shopApi.listInventoryMovements(token, updated.id));
      Alert.alert('Stoc actualizat', `Noul stoc este ${updated.stock_quantity} bucăți.`);
    } catch (saveError) { Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Încearcă din nou.'); }
    finally { setSaving(false); }
  };

  const openNir = (id?: string | null) => {
    if (!id) return;
    setSelected(null);
    onOpenNir?.(id);
  };

  if (loading) return <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se încarcă stocurile...</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Încearcă din nou</Text></TouchableOpacity></View>;
  const tracked = products.filter((product) => product.stock_mode === 'tracked');
  const low = tracked.filter((product) => product.stock_quantity <= product.low_stock_threshold);
  const selectedSupplierManaged = selected?.source_domain?.toLowerCase() === 'boomag.ro';
  const selectedCanAdjust = selected?.stock_mode === 'tracked' && !selectedSupplierManaged;

  return <View style={styles.wrap}>
    <View style={styles.actions}><View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Nume, cod, furnizor, marcă sau chiar cu o greșeală" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity></View>
    <View style={styles.stats}><View><Text style={styles.statValue}>{tracked.length}</Text><Text style={styles.statLabel}>URMĂRITE</Text></View><View><Text style={[styles.statValue, low.length > 0 && styles.lowText]}>{low.length}</Text><Text style={styles.statLabel}>STOC MIC</Text></View><View><Text style={styles.statValue}>{products.length - tracked.length}</Text><Text style={styles.statLabel}>NELIMITATE</Text></View></View>
    {filtered.length ? pagedProducts.map((product) => {
      const isLow = product.stock_mode === 'tracked' && product.stock_quantity <= product.low_stock_threshold;
      const isSupplierManaged = product.source_domain?.toLowerCase() === 'boomag.ro';
      return <TouchableOpacity key={product.id} style={styles.card} activeOpacity={0.76} onPress={() => void open(product)}>
        {product.images?.[0]?.url ? <ShopProductPicture image={product.images[0]} width={61} height={61} borderRadius={14} /> : <View style={styles.imageFallback}><Package size={22} color={Colors.textMuted} /></View>}
        <View style={styles.copy}><Text numberOfLines={1} style={styles.name}>{product.name}</Text><Text style={styles.meta}>{product.sku || 'Fără SKU'}</Text><View style={styles.stockLine}>{isSupplierManaged ? <View><Text style={styles.stockLabel}>STOC FURNIZOR</Text><Text style={styles.supplierQuantity}>{product.supplier_stock_quantity} BUC.</Text></View> : null}<View><Text style={styles.stockLabel}>STOC ONLINE</Text><Text style={[styles.quantity, isLow && styles.lowText]}>{product.stock_mode === 'unlimited' ? 'NELIMITAT' : `${product.stock_quantity} BUC.`}</Text></View><View><Text style={styles.stockLabel}>STOC CONTABIL</Text><Text style={styles.accountingQuantity}>{product.accounting_stock_quantity} BUC.</Text></View>{isLow ? <Text style={styles.warning}>STOC MIC</Text> : null}</View></View>
        <ChevronRight size={19} color={Colors.textMuted} />
      </TouchableOpacity>;
    }) : <View style={styles.empty}><Boxes size={34} color="#22C55E" /><Text style={styles.emptyTitle}>Niciun produs în stoc</Text></View>}
    <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />

    <Modal visible={Boolean(selected)} animationType="slide" transparent onRequestClose={() => !saving && setSelected(null)}>
      <View style={styles.backdrop}><SafeAreaView style={styles.sheet} edges={['top', 'bottom']}><View style={styles.sheetHeader}><View style={styles.sheetHeaderCopy}><Text style={styles.sheetKicker}>STOCURI / FIȘA PRODUSULUI</Text><Text numberOfLines={2} style={styles.sheetTitle}>{selected?.name}</Text><Text style={styles.sheetSubtitle}>Toate intrările și mișcările acestui produs, explicate cronologic.</Text></View><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
          <View style={styles.productHero}>
            {selected?.images?.[0]?.url ? <ShopProductPicture image={selected.images[0]} width={62} height={62} borderRadius={17} /> : <View style={styles.heroFallback}><Package size={24} color="#5EEAD4" /></View>}
            <View style={styles.heroCopy}><Text numberOfLines={2} style={styles.heroName}>{selected?.name}</Text><Text style={styles.heroSku}>{selected?.sku || 'Fără SKU'}</Text></View>
            <View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.liveText}>ACTUALIZAT</Text></View>
          </View>
          <View style={styles.sheetStats}><View><Text style={styles.sheetStatLabel}>STOC ONLINE</Text><Text style={styles.sheetStatValue}>{selected?.stock_mode === 'unlimited' ? 'Nelimitat' : `${selected?.stock_quantity || 0} buc.`}</Text></View><View><Text style={styles.sheetStatLabel}>STOC CONTABIL</Text><Text style={[styles.sheetStatValue, { color: '#93C5FD' }]}>{selected?.accounting_stock_quantity || 0} buc.</Text></View><View><Text style={styles.sheetStatLabel}>INTRĂRI NIR</Text><Text style={[styles.sheetStatValue, { color: '#4ADE80' }]}>{nirEntries.length}</Text></View></View>

          {selectedCanAdjust ? <View style={styles.adjustment}><View style={styles.sectionIntro}><View style={styles.sectionIcon}><Boxes size={18} color={Colors.orange} /></View><View><Text style={styles.sectionTitle}>Ajustare manuală</Text><Text style={styles.sectionDescription}>Folosește această zonă doar pentru corecții fizice de stoc.</Text></View></View><Text style={styles.label}>CANTITATE NOUĂ</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" selectTextOnFocus style={styles.quantityInput} /><View style={styles.quick}><TouchableOpacity onPress={() => setQuantity(String(Math.max(0, Number(quantity || 0) - 1)))}><Text>-1</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 1))}><Text>+1</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 5))}><Text>+5</Text></TouchableOpacity><TouchableOpacity onPress={() => setQuantity(String(Number(quantity || 0) + 10))}><Text>+10</Text></TouchableOpacity></View><Text style={styles.label}>MOTIV / NOTIȚĂ</Text><TextInput value={note} onChangeText={setNote} placeholder="Ex: Corecție după inventar" placeholderTextColor={Colors.textMuted} multiline style={styles.note} /><TouchableOpacity style={[styles.save, saving && styles.disabled]} disabled={saving} onPress={() => void save()}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={18} color={Colors.white} /><Text style={styles.saveText}>Salvează ajustarea</Text></>}</TouchableOpacity></View> : <View style={styles.readOnlyNotice}><ClipboardList size={19} color="#5EEAD4" /><View><Text style={styles.readOnlyTitle}>Fișă informativă</Text><Text style={styles.readOnlyText}>Stocul acestui produs este gestionat automat. Poți consulta documentele și mișcările fără să modifici valorile.</Text></View></View>}

          <View style={styles.ledgerSection}><View style={styles.ledgerHeader}><View style={styles.ledgerIconGreen}><ArrowDownLeft size={19} color="#4ADE80" /></View><View style={styles.ledgerHeaderCopy}><Text style={styles.ledgerKicker}>DOCUMENTELE CARE AU ADĂUGAT MARFĂ</Text><Text style={styles.ledgerTitle}>Intrări din NIR-uri</Text><Text style={styles.ledgerDescription}>Apasă pe o intrare ca să deschizi nota de recepție aferentă.</Text></View><View style={styles.countBadge}><Text style={styles.countBadgeText}>{nirEntries.length}</Text></View></View>
            {movementsLoading ? <View style={styles.ledgerLoading}><ActivityIndicator color="#4ADE80" /><Text style={styles.stateText}>Se încarcă documentele...</Text></View> : entryRows.length ? entryRows.map((movement) => <TouchableOpacity key={movement.id} style={styles.documentCard} activeOpacity={0.74} onPress={() => openNir(movement.nir_document_id)}>
              <View style={styles.documentTop}><View style={styles.documentIcon}><FileText size={19} color="#5EEAD4" /></View><View style={styles.documentCopy}><Text style={styles.documentLabel}>DOCUMENT DE INTRARE</Text><Text style={styles.documentName}>{documentNumber(movement)}</Text><Text style={styles.documentDate}>{movementDate(movement.created_at)}</Text></View><ChevronRight size={20} color="#5EEAD4" /></View>
              <View style={styles.documentValues}><View><Text style={styles.valueLabel}>CANTITATE</Text><Text style={styles.valuePositive}>+{Math.abs(movementDelta(movement)).toLocaleString('ro-RO')} buc.</Text></View><View><Text style={styles.valueLabel}>VALOARE UNITARĂ</Text><Text style={styles.valueText}>{moneyRon(movement.inventory_unit_cost_ron)}</Text></View><View><Text style={styles.valueLabel}>VALOARE TOTALĂ</Text><Text style={styles.valueText}>{moneyRon(movement.inventory_cost_total_ron)}</Text></View></View>
            </TouchableOpacity>) : <View style={styles.ledgerEmpty}><FileText size={25} color={Colors.textMuted} /><Text style={styles.ledgerEmptyTitle}>Nu există încă intrări confirmate</Text><Text style={styles.ledgerEmptyText}>După confirmarea unui NIR, documentul va apărea automat aici.</Text></View>}
            <Pager page={safeEntryPage} total={nirEntries.length} onChange={setEntryPage} />
            <View style={styles.futureNote}><Text style={styles.futureNoteText}>Ieșirile prin facturi vor fi adăugate aici când implementăm documentele de vânzare.</Text></View>
          </View>

          <View style={styles.ledgerSection}><View style={styles.ledgerHeader}><View style={styles.ledgerIconBlue}><History size={19} color="#93C5FD" /></View><View style={styles.ledgerHeaderCopy}><Text style={styles.ledgerKicker}>JURNAL CRONOLOGIC COMPLET</Text><Text style={styles.ledgerTitle}>Mișcări de stoc</Text><Text style={styles.ledgerDescription}>Vezi ce s-a schimbat și ce stoc a rămas după fiecare operațiune.</Text></View><View style={styles.countBadge}><Text style={styles.countBadgeText}>{movements.length}</Text></View></View>
            {movementsLoading ? <View style={styles.ledgerLoading}><ActivityIndicator color="#93C5FD" /></View> : movementRows.length ? movementRows.map((movement) => {
              const delta = movementDelta(movement); const incoming = delta >= 0;
              return <View key={movement.id} style={styles.movementCard}><View style={[styles.movementDirection, incoming ? styles.directionIn : styles.directionOut]}>{incoming ? <ArrowDownLeft size={17} color="#4ADE80" /> : <ArrowUpRight size={17} color="#FCA5A5" />}</View><View style={styles.movementCopy}><Text style={styles.movementTitle}>{movementLabel(movement.movement_type)}</Text><Text numberOfLines={2} style={styles.movementNote}>{movement.note || 'Mișcare înregistrată automat'}</Text><Text style={styles.movementDate}>{movementDate(movement.created_at)}</Text></View><View style={styles.movementNumbers}><Text style={[styles.movementDelta, incoming ? styles.valuePositive : styles.valueNegative]}>{incoming ? '+' : ''}{delta.toLocaleString('ro-RO')}</Text><Text style={styles.movementAfter}>rămân {movementAfter(movement).toLocaleString('ro-RO')} buc.</Text></View></View>;
            }) : <View style={styles.ledgerEmpty}><History size={25} color={Colors.textMuted} /><Text style={styles.ledgerEmptyTitle}>Nicio mișcare înregistrată</Text></View>}
            <Pager page={safeMovementPage} total={movements.length} onChange={setMovementPage} />
          </View>
        </ScrollView>
      </SafeAreaView></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B1B1F' },
  stats: { flexDirection: 'row', gap: 20, marginVertical: 10, paddingHorizontal: 4 }, statValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16 }, statLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7, marginTop: 2 }, lowText: { color: '#FCA5A5' },
  card: { minHeight: 94, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, padding: 10, backgroundColor: '#1B1B1F', marginBottom: 8 }, imageFallback: { width: 61, height: 61, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#27242A' }, copy: { flex: 1, minWidth: 0 }, name: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, stockLine: { flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: 14, rowGap: 5, marginTop: 8 }, stockLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.5, marginBottom: 2 }, supplierQuantity: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 9 }, quantity: { color: '#9CD9AE', fontFamily: 'Inter-Bold', fontSize: 9 }, accountingQuantity: { color: '#93C5FD', fontFamily: 'Inter-Bold', fontSize: 9 }, warning: { color: '#FCA5A5', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 }, empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14, marginTop: 12 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.82)' }, sheet: { height: '96%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#17161A', overflow: 'hidden' }, sheetHeader: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#37333B', backgroundColor: '#1D1B20' }, sheetHeaderCopy: { flex: 1, minWidth: 0 }, sheetKicker: { color: '#5EEAD4', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, sheetTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 17, lineHeight: 22, marginTop: 4 }, sheetSubtitle: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#2B292F' }, sheetContent: { padding: 14, paddingBottom: 32 },
  productHero: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: 'rgba(45,212,191,0.24)', borderRadius: 20, padding: 12, backgroundColor: 'rgba(45,212,191,0.055)' }, heroFallback: { width: 62, height: 62, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: 'rgba(45,212,191,0.11)' }, heroCopy: { flex: 1, minWidth: 0 }, heroName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12, lineHeight: 17 }, heroSku: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 5 }, livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.10)' }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4ADE80' }, liveText: { color: '#86EFAC', fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.5 },
  sheetStats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 9 }, sheetStatLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.5 }, sheetStatValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 4 }, adjustment: { borderWidth: 1, borderColor: 'rgba(255,107,0,0.24)', borderRadius: 20, padding: 13, marginTop: 14, backgroundColor: 'rgba(255,107,0,0.035)' }, sectionIntro: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 15 }, sectionIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(255,107,0,0.1)' }, sectionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 12 }, sectionDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, label: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginBottom: 7 }, quantityInput: { minHeight: 58, borderWidth: 1, borderColor: Colors.orange, borderRadius: 16, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Bold', fontSize: 24, textAlign: 'center' }, quick: { flexDirection: 'row', gap: 7, marginVertical: 10 }, note: { minHeight: 72, borderWidth: 1, borderColor: '#49454F', borderRadius: 14, padding: 12, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top', marginBottom: 12 }, save: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 11 }, disabled: { opacity: 0.4 }, readOnlyNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: 'rgba(45,212,191,0.2)', borderRadius: 17, padding: 12, marginTop: 14, backgroundColor: 'rgba(45,212,191,0.04)' }, readOnlyTitle: { color: '#99F6E4', fontFamily: 'Inter-Bold', fontSize: 10 }, readOnlyText: { flexShrink: 1, color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, marginTop: 3 },
  ledgerSection: { borderWidth: 1, borderColor: '#343139', borderRadius: 22, padding: 12, marginTop: 14, backgroundColor: '#1B1A1E' }, ledgerHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }, ledgerIconGreen: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(34,197,94,0.11)' }, ledgerIconBlue: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(59,130,246,0.11)' }, ledgerHeaderCopy: { flex: 1, minWidth: 0 }, ledgerKicker: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.55 }, ledgerTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14, marginTop: 2 }, ledgerDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 11, marginTop: 3 }, countBadge: { minWidth: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#29272D' }, countBadgeText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9 }, ledgerLoading: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 9 },
  documentCard: { borderWidth: 1, borderColor: '#39363E', borderRadius: 17, padding: 11, marginBottom: 8, backgroundColor: '#201F23' }, documentTop: { flexDirection: 'row', alignItems: 'center', gap: 9 }, documentIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: 'rgba(45,212,191,0.1)' }, documentCopy: { flex: 1, minWidth: 0 }, documentLabel: { color: '#5FA99D', fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.5 }, documentName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11, marginTop: 2 }, documentDate: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, documentValues: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3B383F', paddingTop: 10, marginTop: 10 }, valueLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 5.5, letterSpacing: 0.4 }, valueText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 8, marginTop: 3 }, valuePositive: { color: '#4ADE80', fontFamily: 'Inter-Bold', fontSize: 8, marginTop: 3 }, valueNegative: { color: '#FCA5A5' }, futureNote: { borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(245,158,11,0.22)', borderRadius: 13, padding: 10, marginTop: 10, backgroundColor: 'rgba(245,158,11,0.03)' }, futureNoteText: { color: '#9B8D75', fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12 },
  movementCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#39363D', paddingVertical: 9 }, movementDirection: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, directionIn: { backgroundColor: 'rgba(34,197,94,0.1)' }, directionOut: { backgroundColor: 'rgba(239,68,68,0.1)' }, movementCopy: { flex: 1, minWidth: 0 }, movementTitle: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, movementNote: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, movementDate: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7, marginTop: 3 }, movementNumbers: { alignItems: 'flex-end' }, movementDelta: { fontFamily: 'Inter-Bold', fontSize: 11 }, movementAfter: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7, marginTop: 3 }, ledgerEmpty: { minHeight: 130, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: '#38353D', borderRadius: 16, padding: 16 }, ledgerEmptyTitle: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 10, marginTop: 8 }, ledgerEmptyText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, textAlign: 'center', marginTop: 4 }, ledgerPager: { alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#39363D', paddingTop: 12, marginTop: 10 }, ledgerSummary: { flexDirection: 'row', alignItems: 'center', gap: 8 }, ledgerPageSize: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, color: '#99F6E4', backgroundColor: 'rgba(45,212,191,0.09)', fontFamily: 'Inter-Bold', fontSize: 8 }, ledgerRange: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9 }, ledgerPages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 5 }, pageArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#28262C' }, pageNumber: { minWidth: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#28262C' }, pageNumberActive: { backgroundColor: '#0F766E' }, pageNumberText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 10 }, pageNumberTextActive: { color: '#FFFFFF' }, pageEllipsis: { width: 18, color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 12, textAlign: 'center' },
});
