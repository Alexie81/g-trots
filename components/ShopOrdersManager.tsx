import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronRight, PackageCheck, RefreshCw, Save, Search, ShoppingCart, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopOrder } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';

const orderStatuses: { value: ShopOrder['status']; label: string; color: string }[] = [
  { value: 'new', label: 'Noua', color: '#38BDF8' },
  { value: 'confirmed', label: 'Confirmata', color: '#A78BFA' },
  { value: 'processing', label: 'In pregatire', color: '#F59E0B' },
  { value: 'shipped', label: 'Expediata', color: '#2DD4BF' },
  { value: 'completed', label: 'Finalizata', color: '#22C55E' },
  { value: 'cancelled', label: 'Anulata', color: '#EF4444' },
];

const paymentStatuses: { value: ShopOrder['payment_status']; label: string }[] = [
  { value: 'pending', label: 'In asteptare' },
  { value: 'paid', label: 'Platita' },
  { value: 'failed', label: 'Esuata' },
  { value: 'refunded', label: 'Rambursata' },
];

function money(value: number) {
  return new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2 }).format(value) + ' lei';
}

function dateTime(value: string) {
  const date = new Date(value.replace(' ', 'T') + (value.includes('T') ? '' : 'Z'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ShopOrdersManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ShopOrder | null>(null);
  const [status, setStatus] = useState<ShopOrder['status']>('new');
  const [paymentStatus, setPaymentStatus] = useState<ShopOrder['payment_status']>('pending');
  const [adminNotes, setAdminNotes] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try { setOrders(await shopApi.listOrders(token)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Comenzile nu au putut fi incarcate.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return orders;
    return orders.filter((order) => `${order.order_number} ${order.customer_name} ${order.customer_phone} ${order.customer_email || ''}`.toLowerCase().includes(term));
  }, [orders, query]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedOrders = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const open = (order: ShopOrder) => {
    setSelected(order);
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setAdminNotes(order.admin_notes || '');
  };

  const save = async () => {
    if (!token || !selected || saving) return;
    if (status === 'cancelled' && selected.status !== 'cancelled') {
      const proceed = await new Promise<boolean>((resolve) => Alert.alert('Anulezi comanda?', 'Produsele cu stoc urmarit vor fi adaugate inapoi in stoc.', [{ text: 'Renunta', style: 'cancel', onPress: () => resolve(false) }, { text: 'Anuleaza comanda', style: 'destructive', onPress: () => resolve(true) }]));
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const updated = await shopApi.updateOrder(token, selected.id, { status, payment_status: paymentStatus, admin_notes: adminNotes.trim() });
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setSelected(updated);
      Alert.alert('Comanda actualizata', `Statusul comenzii ${updated.order_number} a fost salvat.`);
    } catch (saveError) {
      Alert.alert('Nu s-a putut salva', saveError instanceof Error ? saveError.message : 'Incearca din nou.');
    } finally { setSaving(false); }
  };

  if (loading) return <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se incarca comenzile...</Text></View>;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Incearca din nou</Text></TouchableOpacity></View>;

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Numar, client sau telefon" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View>
        <TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity>
      </View>
      <View style={styles.stats}>
        <View><Text style={styles.statValue}>{orders.filter((order) => order.status === 'new').length}</Text><Text style={styles.statLabel}>COMENZI NOI</Text></View>
        <View><Text style={styles.statValue}>{orders.filter((order) => order.status === 'processing').length}</Text><Text style={styles.statLabel}>IN PREGATIRE</Text></View>
        <View><Text style={styles.statValue}>{money(orders.reduce((sum, order) => sum + (order.status !== 'cancelled' ? order.total : 0), 0))}</Text><Text style={styles.statLabel}>VALOARE</Text></View>
      </View>
      {filtered.length ? pagedOrders.map((order) => {
        const statusMeta = orderStatuses.find((item) => item.value === order.status) || orderStatuses[0];
        return <TouchableOpacity key={order.id} style={styles.orderCard} activeOpacity={0.76} onPress={() => open(order)}>
          <View style={[styles.orderIcon, { backgroundColor: `${statusMeta.color}15` }]}><ShoppingCart size={21} color={statusMeta.color} /></View>
          <View style={styles.orderCopy}>
            <View style={styles.orderTop}><Text style={styles.orderNumber}>{order.order_number}</Text><Text style={[styles.status, { color: statusMeta.color }]}>{statusMeta.label.toUpperCase()}</Text></View>
            <Text style={styles.customer}>{order.customer_name} · {order.customer_phone}</Text>
            <View style={styles.orderBottom}><Text style={styles.orderDate}>{dateTime(order.created_at)}</Text><Text style={styles.orderTotal}>{money(order.total)}</Text></View>
          </View>
          <ChevronRight size={18} color={Colors.textMuted} />
        </TouchableOpacity>;
      }) : <View style={styles.empty}><PackageCheck size={34} color="#38BDF8" /><Text style={styles.emptyTitle}>Nicio comanda</Text><Text style={styles.emptyText}>Comenzile trimise de pe site vor aparea automat aici.</Text></View>}
      <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />

      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => !saving && setSelected(null)}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={21} color={Colors.textSecondary} /></TouchableOpacity><View style={styles.modalHeaderCopy}><Text style={styles.modalKicker}>COMANDA SHOP</Text><Text style={styles.modalTitle}>{selected?.order_number}</Text></View><TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={17} color={Colors.white} /><Text style={styles.saveText}>Salveaza</Text></>}</TouchableOpacity></View>
          {selected ? <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) + 30 }]} showsVerticalScrollIndicator={false}>
            <InfoBlock title="Client" lines={[selected.customer_name, selected.customer_phone, selected.customer_email || 'Fara e-mail']} />
            <InfoBlock title="Livrare" lines={[selected.address, `${selected.city}${selected.county ? `, ${selected.county}` : ''}`, selected.shipping_method_name]} />
            <Text style={styles.sectionLabel}>PRODUSE</Text>
            <View style={styles.items}>{selected.items.map((item) => <View key={item.id} style={styles.item}><View style={styles.itemQty}><Text style={styles.itemQtyText}>{item.quantity}×</Text></View><View style={styles.itemCopy}><Text style={styles.itemName}>{item.product_name}</Text><Text style={styles.itemSku}>{item.product_sku || 'Fara SKU'}</Text></View><Text style={styles.itemTotal}>{money(item.line_total)}</Text></View>)}</View>
            <View style={styles.totals}><View><Text>Produse</Text><Text>{money(selected.subtotal)}</Text></View><View><Text>Livrare</Text><Text>{money(selected.shipping_cost)}</Text></View><View style={styles.grandTotal}><Text>Total</Text><Text>{money(selected.total)}</Text></View></View>
            <Text style={styles.sectionLabel}>STATUS COMANDA</Text>
            <View style={styles.chips}>{orderStatuses.map((item) => <TouchableOpacity key={item.value} style={[styles.chip, status === item.value && { borderColor: item.color, backgroundColor: `${item.color}15` }]} onPress={() => setStatus(item.value)}>{status === item.value ? <Check size={13} color={item.color} /> : null}<Text style={[styles.chipText, status === item.value && { color: item.color }]}>{item.label}</Text></TouchableOpacity>)}</View>
            <Text style={styles.sectionLabel}>STATUS PLATA · {selected.payment_method === 'card' ? 'CARD' : 'RAMBURS'}</Text>
            <View style={styles.chips}>{paymentStatuses.map((item) => <TouchableOpacity key={item.value} style={[styles.chip, paymentStatus === item.value && styles.chipActive]} onPress={() => setPaymentStatus(item.value)}>{paymentStatus === item.value ? <Check size={13} color={Colors.orange} /> : null}<Text style={[styles.chipText, paymentStatus === item.value && styles.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}</View>
            {selected.customer_notes ? <InfoBlock title="Observatii client" lines={[selected.customer_notes]} /> : null}
            <Text style={styles.sectionLabel}>NOTITE INTERNE</Text><TextInput value={adminNotes} onChangeText={setAdminNotes} multiline placeholder="Adauga informatii vizibile doar in CRM" placeholderTextColor={Colors.textMuted} style={styles.notes} />
          </ScrollView> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return <View style={styles.info}><Text style={styles.infoTitle}>{title.toUpperCase()}</Text>{lines.map((line, index) => <Text key={`${line}-${index}`} style={index === 0 ? styles.infoStrong : styles.infoText}>{line}</Text>)}</View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B1B1F' },
  stats: { flexDirection: 'row', gap: 7, marginBottom: 11 }, statValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, statLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.6, marginTop: 2 },
  orderCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, padding: 11, backgroundColor: '#1B1B1F', marginBottom: 8 }, orderIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, orderCopy: { flex: 1, minWidth: 0 }, orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, orderNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, status: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.5 }, customer: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 5 }, orderBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 7 }, orderDate: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8 }, orderTotal: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 13 }, emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 5 },
  modalSafe: { flex: 1, backgroundColor: Colors.bg }, modalHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#29272B', paddingHorizontal: 12, backgroundColor: '#171513' }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#27242A' }, modalHeaderCopy: { flex: 1 }, modalKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 2 }, save: { minWidth: 96, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 }, disabled: { opacity: 0.55 }, modalContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  info: { borderRadius: 18, padding: 15, backgroundColor: '#1B1B1F', marginBottom: 9 }, infoTitle: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginBottom: 7 }, infoStrong: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 }, infoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 2 }, sectionLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginTop: 15, marginBottom: 8 }, items: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#1B1B1F' }, item: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343137', padding: 11 }, itemQty: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: Colors.orangeDim }, itemQtyText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, itemCopy: { flex: 1 }, itemName: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, itemSku: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, itemTotal: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 },
  totals: { borderRadius: 18, padding: 14, backgroundColor: '#252329', marginTop: 9 }, grandTotal: { borderTopWidth: 1, borderTopColor: '#3A363D', marginTop: 8, paddingTop: 9 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#413D45', borderRadius: 999, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, chipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, chipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, chipTextActive: { color: Colors.orange }, notes: { minHeight: 100, borderWidth: 1, borderColor: '#49454F', borderRadius: 15, padding: 13, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top' },
});
