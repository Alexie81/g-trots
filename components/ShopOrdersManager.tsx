import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BadgeCheck, Ban, BellRing, Check, ChevronRight, CircleCheckBig, Clock3, Mail, MessageCircle, PackageCheck, PackageOpen, Phone, RefreshCw, Save, Search, ShoppingCart, Truck, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopOrder } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';

const orderStatuses = [
  { value: 'new', label: 'În procesare (Nouă)', shortLabel: 'Nouă', description: 'Comanda a fost primită și a intrat în procesare.', color: '#38BDF8', icon: Clock3 },
  { value: 'confirmed', label: 'Confirmată', description: 'Comanda și plata au fost confirmate.', color: '#34D399', icon: BadgeCheck },
  { value: 'processing', label: 'În pregătire', description: 'Produsele sunt pregătite pentru expediere.', color: '#FB923C', icon: PackageOpen },
  { value: 'shipped', label: 'Predată curierului', description: 'Pachetul a plecat către client.', color: '#A78BFA', icon: Truck },
  { value: 'completed', label: 'Livrată', description: 'Comanda a ajuns la destinație.', color: '#22C55E', icon: CircleCheckBig },
  { value: 'cancelled', label: 'Comandă anulată', description: 'Comanda nu mai este procesată.', color: '#FB7185', icon: Ban },
] satisfies { value: ShopOrder['status']; label: string; shortLabel?: string; description: string; color: string; icon: typeof Clock3 }[];

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

function whatsappPhone(value: string) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 10) digits = `40${digits.slice(1)}`;
  if (digits.length === 9) digits = `40${digits}`;
  return digits;
}

async function callCustomer(phone: string) {
  const target = String(phone || '').replace(/[^\d+]/g, '');
  if (!target) return Alert.alert('Apelare', 'Comanda nu are un număr de telefon valid.');
  try { await Linking.openURL(`tel:${target}`); }
  catch { Alert.alert('Apelare', 'Apelul nu a putut fi inițiat pe acest dispozitiv.'); }
}

async function openCustomerWhatsApp(phone: string) {
  const target = whatsappPhone(phone);
  if (!target) return Alert.alert('WhatsApp', 'Comanda nu are un număr de telefon valid.');
  const appUrl = `whatsapp://send?phone=${target}`;
  const webUrl = `https://wa.me/${target}`;
  try { await Linking.openURL((await Linking.canOpenURL(appUrl)) ? appUrl : webUrl); }
  catch { Alert.alert('WhatsApp', 'Conversația nu a putut fi deschisă.'); }
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
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const nextOrders = await shopApi.listOrders(token);
      setOrders(Array.isArray(nextOrders) ? nextOrders : []);
    }
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

  const open = async (order: ShopOrder) => {
    setSelected(order);
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setAdminNotes(order.admin_notes || '');
    setNotifyCustomer(false);
    if (!token) return;
    setDetailLoading(true);
    try {
      const detailed = await shopApi.getOrder(token, order.id);
      setSelected(detailed);
      setStatus(detailed.status);
      setPaymentStatus(detailed.payment_status);
      setAdminNotes(detailed.admin_notes || '');
    } catch (detailError) {
      Alert.alert('Detaliile nu s-au putut actualiza', detailError instanceof Error ? detailError.message : 'Încearcă din nou.');
    } finally { setDetailLoading(false); }
  };

  const save = async () => {
    if (!token || !selected || saving) return;
    if (status === 'cancelled' && selected.status !== 'cancelled') {
      const proceed = await new Promise<boolean>((resolve) => Alert.alert('Anulezi comanda?', 'Produsele cu stoc urmarit vor fi adaugate inapoi in stoc.', [{ text: 'Renunta', style: 'cancel', onPress: () => resolve(false) }, { text: 'Anuleaza comanda', style: 'destructive', onPress: () => resolve(true) }]));
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const updated = await shopApi.updateOrder(token, selected.id, { status, payment_status: paymentStatus, admin_notes: adminNotes.trim(), notify_customer: notifyCustomer });
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setSelected(updated);
      setNotifyCustomer(false);
      const email = updated.email_notification;
      Alert.alert(
        'Comanda actualizată',
        email?.requested
          ? (email.sent ? `Statusul a fost salvat, iar clientul a primit e-mailul la ${email.recipient || selected.customer_email}.` : `Statusul a fost salvat, dar e-mailul nu a putut fi trimis: ${email.error || 'verifică setările SMTP.'}`)
          : `Statusul comenzii ${updated.order_number} a fost salvat.`
      );
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
        return <TouchableOpacity key={order.id} style={styles.orderCard} activeOpacity={0.76} onPress={() => void open(order)}>
          <View style={[styles.orderIcon, { backgroundColor: `${statusMeta.color}15` }]}><ShoppingCart size={21} color={statusMeta.color} /></View>
          <View style={styles.orderCopy}>
            <View style={styles.orderTop}><Text style={styles.orderNumber}>{order.order_number}</Text><Text style={[styles.status, { color: statusMeta.color }]}>{(statusMeta.shortLabel || statusMeta.label).toUpperCase()}</Text></View>
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
            {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.detailLoadingText}>Actualizăm istoricul comenzii...</Text></View> : null}
            <ClientInfoBlock order={selected} />
            <DeliveryInfoBlock order={selected} />
            <Text style={styles.sectionLabel}>PRODUSE</Text>
            <View style={styles.items}>{(Array.isArray(selected.items) ? selected.items : []).map((item) => <View key={item.id} style={styles.item}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="contain" /> : <View style={styles.itemQty}><Text style={styles.itemQtyText}>{item.quantity}×</Text></View>}<View style={styles.itemCopy}><Text style={styles.itemName}>{item.product_name}</Text><Text style={styles.itemSku}>{item.quantity} × {item.product_sku || 'Fara SKU'}</Text></View><Text style={styles.itemTotal}>{money(item.line_total)}</Text></View>)}</View>
            <View style={styles.totals}>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Produse</Text><Text style={styles.totalValue}>{money(selected.subtotal)}</Text></View>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Livrare</Text><Text style={styles.totalValue}>{money(selected.shipping_cost)}</Text></View>
              <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>Total comandă</Text><Text style={styles.grandTotalValue}>{money(selected.total)}</Text></View>
            </View>
            <Text style={styles.sectionLabel}>EVOLUȚIA COMENZII</Text>
            <OrderStatusTimeline order={selected} />
            <Text style={styles.sectionLabel}>STATUS COMANDA</Text>
            <View style={styles.statusPicker}>{orderStatuses.map((item) => {
              const StatusIcon = item.icon;
              const active = status === item.value;
              return <TouchableOpacity key={item.value} activeOpacity={0.76} style={[styles.statusOption, active && { borderColor: item.color, backgroundColor: `${item.color}12` }]} onPress={() => { setStatus(item.value); if (item.value === selected.status) setNotifyCustomer(false); }}>
                <View style={[styles.statusOptionIcon, { backgroundColor: `${item.color}18` }]}><StatusIcon size={18} color={item.color} /></View>
                <View style={styles.statusOptionCopy}><Text style={[styles.statusOptionTitle, active && { color: item.color }]}>{item.label}</Text><Text style={styles.statusOptionText}>{item.description}</Text></View>
                <View style={[styles.radio, active && { borderColor: item.color, backgroundColor: item.color }]}>{active ? <Check size={12} color="#14110F" strokeWidth={3} /> : null}</View>
              </TouchableOpacity>;
            })}</View>
            <TouchableOpacity
              activeOpacity={0.78}
              disabled={!selected.customer_email || status === selected.status}
              style={[styles.notifyCard, notifyCustomer && styles.notifyCardActive, (!selected.customer_email || status === selected.status) && styles.notifyCardDisabled]}
              onPress={() => setNotifyCustomer((current) => !current)}>
              <View style={styles.notifyIcon}><BellRing size={19} color={notifyCustomer ? '#15110D' : Colors.orange} /></View>
              <View style={styles.notifyCopy}><Text style={styles.notifyTitle}>Trimite actualizarea pe e-mail</Text><Text style={styles.notifyText}>{!selected.customer_email ? 'Comanda nu are o adresă de e-mail.' : status === selected.status ? 'Selectează un status diferit pentru a putea notifica clientul.' : `Clientul va primi rezumatul și linkul de urmărire la ${selected.customer_email}.`}</Text></View>
              <View style={[styles.checkbox, notifyCustomer && styles.checkboxActive]}>{notifyCustomer ? <Check size={13} color="#15110D" strokeWidth={3} /> : <Mail size={13} color={Colors.textMuted} />}</View>
            </TouchableOpacity>
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

function OrderStatusTimeline({ order }: { order: ShopOrder }) {
  const reveal = useRef(new Animated.Value(0)).current;
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const visible = orderStatuses;
  const flow = visible.filter((item) => item.value !== 'cancelled');
  const currentFlowIndex = flow.findIndex((item) => item.value === order.status);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [order.id, order.status, history.length, reveal]);

  return <Animated.View style={[styles.timeline, { opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
    {visible.map((item, index) => {
      const StatusIcon = item.icon;
      const entry = [...history].reverse().find((historyEntry) => historyEntry.to_status === item.value);
      const flowIndex = flow.findIndex((flowItem) => flowItem.value === item.value);
      const reached = Boolean(entry) || item.value === order.status || (order.status !== 'cancelled' && flowIndex >= 0 && currentFlowIndex >= 0 && flowIndex <= currentFlowIndex);
      const current = item.value === order.status;
      return <View key={item.value} style={styles.timelineRow}>
        <View style={styles.timelineRail}>
          <View style={[styles.timelineDot, reached && { backgroundColor: item.color, borderColor: item.color }, current && styles.timelineDotCurrent]}>
            <StatusIcon size={16} color={reached ? '#15110D' : Colors.textMuted} strokeWidth={2.5} />
          </View>
          {index < visible.length - 1 ? <View style={[styles.timelineLine, reached && entry && { backgroundColor: `${item.color}88` }]} /> : null}
        </View>
        <View style={[styles.timelineCard, current && { borderColor: `${item.color}88`, backgroundColor: `${item.color}0F` }]}>
          <View style={styles.timelineTop}><Text style={[styles.timelineTitle, reached && { color: item.color }]}>{item.label}</Text>{current ? <Text style={[styles.timelineCurrent, { color: item.color }]}>ACUM</Text> : null}</View>
          <Text style={styles.timelineDescription}>{item.description}</Text>
          {entry ? <View style={styles.timelineMeta}><Text style={styles.timelineDate}>{dateTime(entry.created_at)}</Text>{entry.customer_notified ? <View style={styles.timelineMail}><Mail size={11} color="#34D399" /><Text style={styles.timelineMailText}>CLIENT NOTIFICAT</Text></View> : null}</View> : <Text style={styles.timelinePending}>{current ? 'Statusul curent' : 'Pas următor'}</Text>}
        </View>
      </View>;
    })}
  </Animated.View>;
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return <View style={styles.info}><View style={styles.infoHead}><Text style={styles.infoTitle}>{title.toUpperCase()}</Text></View>{lines.map((line, index) => <Text key={`${line}-${index}`} style={index === 0 ? styles.infoStrong : styles.infoText}>{line}</Text>)}</View>;
}

function DetailInfoRow({ label, value, strong = false }: { label: string; value?: string | null; strong?: boolean }) {
  return <View style={styles.detailInfoRow}><Text style={styles.detailInfoLabel}>{label}</Text><Text style={[styles.detailInfoValue, strong && styles.detailInfoValueStrong]}>{String(value || '').trim() || '—'}</Text></View>;
}

function ClientInfoBlock({ order }: { order: ShopOrder }) {
  return <View style={styles.info}>
    <View style={styles.infoHead}><Text style={styles.infoTitle}>CLIENT</Text><Text style={styles.infoHeadHint}>DATE CONTACT</Text></View>
    <DetailInfoRow label="Nume" value={order.customer_name} strong />
    <DetailInfoRow label="Telefon" value={order.customer_phone} />
    <DetailInfoRow label="E-mail" value={order.customer_email || 'Fără e-mail'} />
    <View style={styles.contactActions}>
      <TouchableOpacity style={styles.contactCall} activeOpacity={0.78} onPress={() => void callCustomer(order.customer_phone)}><Phone size={16} color="#EDE7E1" /><Text style={styles.contactCallText}>Apelează</Text></TouchableOpacity>
      <TouchableOpacity style={styles.contactWhatsApp} activeOpacity={0.78} onPress={() => void openCustomerWhatsApp(order.customer_phone)}><MessageCircle size={16} color="#51D88A" /><Text style={styles.contactWhatsAppText}>WhatsApp</Text></TouchableOpacity>
    </View>
  </View>;
}

function DeliveryInfoBlock({ order }: { order: ShopOrder }) {
  return <View style={styles.info}>
    <View style={styles.infoHead}><Text style={styles.infoTitle}>LIVRARE</Text><Truck size={17} color={Colors.orange} /></View>
    <DetailInfoRow label="Adresă completă" value={order.address} strong />
    <DetailInfoRow label="Localitate" value={order.city} />
    <DetailInfoRow label="Județ" value={order.county} />
    <DetailInfoRow label="Cod poștal" value={order.postal_code} />
    <DetailInfoRow label="Metodă" value={order.shipping_method_name} />
    <DetailInfoRow label="Cost livrare" value={money(order.shipping_cost)} />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#1B1B1F' },
  stats: { flexDirection: 'row', gap: 7, marginBottom: 11 }, statValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, statLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.6, marginTop: 2 },
  orderCard: { minHeight: 86, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 19, padding: 11, backgroundColor: '#1B1B1F', marginBottom: 8 }, orderIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, orderCopy: { flex: 1, minWidth: 0 }, orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, orderNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, status: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.5 }, customer: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 5 }, orderBottom: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 7 }, orderDate: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8 }, orderTotal: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 13 }, emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 5 },
  modalSafe: { flex: 1, backgroundColor: Colors.bg }, modalHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#29272B', paddingHorizontal: 12, backgroundColor: '#171513' }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#27242A' }, modalHeaderCopy: { flex: 1 }, modalKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 2 }, save: { minWidth: 96, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 }, disabled: { opacity: 0.55 }, modalContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  detailLoading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, backgroundColor: Colors.orangeDim, marginBottom: 9 }, detailLoadingText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  info: { borderWidth: 1, borderColor: '#302D34', borderRadius: 20, padding: 15, backgroundColor: '#1B1B1F', marginBottom: 9 },
  infoHead: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343137', paddingBottom: 8, marginBottom: 4 },
  infoTitle: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 },
  infoHeadHint: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 },
  infoStrong: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 }, infoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 2 },
  detailInfoRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2D2A30', paddingVertical: 8 },
  detailInfoLabel: { flexShrink: 0, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  detailInfoValue: { flex: 1, color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 15, textAlign: 'right' },
  detailInfoValueStrong: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 },
  contactActions: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  contactCall: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: '#343138' },
  contactCallText: { color: '#EDE7E1', fontFamily: 'Inter-Bold', fontSize: 10 },
  contactWhatsApp: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#255B3D', borderRadius: 14, backgroundColor: '#163323' },
  contactWhatsAppText: { color: '#51D88A', fontFamily: 'Inter-Bold', fontSize: 10 },
  sectionLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginTop: 15, marginBottom: 8 }, items: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#1B1B1F' }, item: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343137', padding: 11 }, itemImage: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#F7F2ED' }, itemQty: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.orangeDim }, itemQtyText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, itemCopy: { flex: 1 }, itemName: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, itemSku: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, itemTotal: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 },
  totals: { gap: 9, borderWidth: 1, borderColor: '#38343C', borderRadius: 20, padding: 15, backgroundColor: '#211F24', marginTop: 9 },
  totalRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  totalLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 11 },
  totalValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
  grandTotal: { borderTopWidth: 1, borderTopColor: '#49454F', marginTop: 2, paddingTop: 12 },
  grandTotalLabel: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 },
  grandTotalValue: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  timeline: { overflow: 'hidden', borderRadius: 22, padding: 14, backgroundColor: '#1B1B1F' }, timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 11 }, timelineRail: { width: 38, alignItems: 'center' }, timelineDot: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#403C43', borderRadius: 12, backgroundColor: '#242228' }, timelineDotCurrent: { shadowColor: '#FF7A00', shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, timelineLine: { width: 2, flex: 1, minHeight: 30, borderRadius: 99, backgroundColor: '#343138', marginVertical: 4 }, timelineCard: { flex: 1, minHeight: 78, borderWidth: 1, borderColor: 'transparent', borderRadius: 17, padding: 12, marginBottom: 8, backgroundColor: '#232126' }, timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, timelineTitle: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 11 }, timelineCurrent: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, timelineDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 4 }, timelineMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }, timelineDate: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 8 }, timelineMail: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timelineMailText: { color: '#34D399', fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.45 }, timelinePending: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 7, marginTop: 8 },
  statusPicker: { gap: 7 }, statusOption: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#36333A', borderRadius: 18, padding: 10, backgroundColor: '#1B1B1F' }, statusOptionIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, statusOptionCopy: { flex: 1, minWidth: 0 }, statusOptionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, statusOptionText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 3 }, radio: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A555E', borderRadius: 99 },
  notifyCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#433B32', borderRadius: 20, padding: 12, backgroundColor: '#211D18', marginTop: 10 }, notifyCardActive: { borderColor: Colors.orange, backgroundColor: '#2A1C11' }, notifyCardDisabled: { opacity: 0.5 }, notifyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.orangeDim }, notifyCopy: { flex: 1, minWidth: 0 }, notifyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, notifyText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 4 }, checkbox: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#554E47', borderRadius: 8, backgroundColor: '#171513' }, checkboxActive: { borderColor: Colors.orange, backgroundColor: Colors.orange },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#413D45', borderRadius: 999, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, chipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, chipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, chipTextActive: { color: Colors.orange }, notes: { minHeight: 100, borderWidth: 1, borderColor: '#49454F', borderRadius: 15, padding: 13, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top' },
});
