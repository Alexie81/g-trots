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
import { ArrowLeft, BadgeCheck, Ban, BellRing, Check, ChevronRight, CircleCheckBig, Clock3, CreditCard, Eye, HandCoins, Mail, PackageCheck, PackageOpen, Pencil, Phone, RefreshCw, RotateCcw, Save, Search, ShoppingCart, SlidersHorizontal, Star, TrendingUp, Truck, WalletCards, Warehouse, X } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopOrder, ShopProductStats } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';

const orderStatuses = [
  { value: 'new', label: 'În procesare (Nouă)', shortLabel: 'Nouă', description: 'Comanda a fost primită și a intrat în procesare.', color: '#38BDF8', icon: Clock3 },
  { value: 'confirmed', label: 'Confirmată', description: 'Comanda și plata au fost confirmate.', color: '#34D399', icon: BadgeCheck },
  { value: 'processing', label: 'În pregătire', description: 'Produsele sunt pregătite pentru expediere.', color: '#FB923C', icon: PackageOpen },
  { value: 'shipped', label: 'Predată curierului', description: 'Pachetul a plecat către client.', color: '#A78BFA', icon: Truck },
  { value: 'completed', label: 'Livrată', description: 'Comanda a ajuns la destinație.', color: '#22C55E', icon: CircleCheckBig },
  { value: 'refunded', label: 'Rambursată', description: 'Comanda a fost returnată și rambursată.', color: '#F59E0B', icon: RotateCcw },
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

function parseShopDate(value: string) {
  const raw = String(value || '').trim();
  const mysqlDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (mysqlDate) {
    return new Date(
      Number(mysqlDate[1]),
      Number(mysqlDate[2]) - 1,
      Number(mysqlDate[3]),
      Number(mysqlDate[4]),
      Number(mysqlDate[5]),
      Number(mysqlDate[6] || 0),
    );
  }
  return new Date(raw);
}

function dateTime(value: string) {
  const date = parseShopDate(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = date.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}

function normalizeSearch(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function isCompanyOrder(order: ShopOrder) {
  return order.customer_type === 'company' || Boolean(String(order.company_name || order.company_cui || order.company_registration_number || '').trim());
}

function orderSearchText(order: ShopOrder) {
  const created = parseShopDate(order.created_at);
  const status = orderStatuses.find((item) => item.value === order.status);
  const payment = paymentStatuses.find((item) => item.value === order.payment_status);
  const createdLabels = Number.isNaN(created.getTime()) ? [] : [
    created.toLocaleDateString('ro-RO'),
    created.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }),
    created.toLocaleString('ro-RO'),
  ];
  return normalizeSearch([
    order.order_number,
    order.customer_name,
    order.customer_phone,
    order.customer_email,
    order.customer_type,
    isCompanyOrder(order) ? 'pj persoana juridica firma' : 'pf persoana fizica',
    order.company_name,
    order.company_cui,
    order.company_registration_number,
    order.company_address,
    order.created_at,
    ...createdLabels,
    order.status,
    status?.label,
    status?.shortLabel,
    order.payment_method,
    order.payment_method === 'card' ? 'card online plata cu cardul' : 'ramburs la curier plata ramburs numerar cash',
    order.payment_status,
    payment?.label,
  ].join(' '));
}

const mainOrderFlow: ShopOrder['status'][] = ['new', 'confirmed', 'processing', 'shipped', 'completed'];
const terminalOrderStatuses: ShopOrder['status'][] = ['refunded', 'cancelled'];

function isStatusTransitionLocked(current: ShopOrder['status'], candidate: ShopOrder['status']) {
  if (candidate === current) return false;
  if (terminalOrderStatuses.includes(current)) return true;
  if (terminalOrderStatuses.includes(candidate)) return false;
  const currentIndex = mainOrderFlow.indexOf(current);
  const candidateIndex = mainOrderFlow.indexOf(candidate);
  return currentIndex >= 0 && candidateIndex >= 0 && candidateIndex < currentIndex;
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

function WhatsAppLogo({ size = 17, color = '#51D88A' }: { size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden><Path fill={color} d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.981.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.895 6.99c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.14 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></Svg>;
}

export default function ShopOrdersManager({ initialStatusFilter = 'all', initialOrderId = null, onInitialOrderHandled }: { initialStatusFilter?: 'all' | ShopOrder['status']; initialOrderId?: string | null; onInitialOrderHandled?: () => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ShopOrder['status']>(initialStatusFilter);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'card' | 'cash'>('all');
  const [paymentStateFilter, setPaymentStateFilter] = useState<'all' | ShopOrder['payment_status']>('all');
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
  const [deliveryEditing, setDeliveryEditing] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryCounty, setDeliveryCounty] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [productPanelId, setProductPanelId] = useState<string | null>(null);
  const [productPanel, setProductPanel] = useState<ShopProductStats | null>(null);
  const [productPanelLoading, setProductPanelLoading] = useState(false);
  const [productPanelError, setProductPanelError] = useState('');
  const productPanelProgress = useRef(new Animated.Value(0)).current;
  const productRequestId = useRef(0);
  const initialOpenedOrderId = useRef<string | null>(null);

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

  const financials = useMemo(() => {
    const active = orders.filter((order) => !terminalOrderStatuses.includes(order.status));
    const collected = active.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingCash = active.filter((order) => order.payment_method !== 'card' && order.payment_status === 'pending').reduce((sum, order) => sum + Number(order.total || 0), 0);
    return { collected, pendingCash, total: collected + pendingCash };
  }, [orders]);

  const filtered = useMemo(() => {
    const term = normalizeSearch(query.trim());
    return orders.filter((order) => {
      if (term && !orderSearchText(order).includes(term)) return false;
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (paymentMethodFilter === 'card' && order.payment_method !== 'card') return false;
      if (paymentMethodFilter === 'cash' && order.payment_method === 'card') return false;
      if (paymentStateFilter !== 'all' && order.payment_status !== paymentStateFilter) return false;
      return true;
    });
  }, [orders, paymentMethodFilter, paymentStateFilter, query, statusFilter]);
  const activeFilterCount = Number(statusFilter !== 'all') + Number(paymentMethodFilter !== 'all') + Number(paymentStateFilter !== 'all');
  const resetFilters = () => {
    setQuery('');
    setStatusFilter('all');
    setPaymentMethodFilter('all');
    setPaymentStateFilter('all');
    setPage(1);
  };
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const pagedOrders = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const open = async (order: ShopOrder) => {
    setSelected(order);
    setStatus(order.status);
    setPaymentStatus(order.payment_status);
    setAdminNotes(order.admin_notes || '');
    setNotifyCustomer(false);
    setDeliveryEditing(false);
    setDeliveryAddress(order.address || '');
    setDeliveryCity(order.city || '');
    setDeliveryCounty(order.county || '');
    setDeliveryPostalCode(order.postal_code || '');
    if (!token) return;
    setDetailLoading(true);
    try {
      const detailed = await shopApi.getOrder(token, order.id);
      setSelected(detailed);
      setStatus(detailed.status);
      setPaymentStatus(detailed.payment_status);
      setAdminNotes(detailed.admin_notes || '');
      setDeliveryAddress(detailed.address || '');
      setDeliveryCity(detailed.city || '');
      setDeliveryCounty(detailed.county || '');
      setDeliveryPostalCode(detailed.postal_code || '');
    } catch (detailError) {
      Alert.alert('Detaliile nu s-au putut actualiza', detailError instanceof Error ? detailError.message : 'Încearcă din nou.');
    } finally { setDetailLoading(false); }
  };

  const openProductPanel = useCallback(async (productId: string) => {
    if (!token || !productId) return;
    const requestId = ++productRequestId.current;
    setProductPanelId(productId);
    setProductPanel(null);
    setProductPanelError('');
    setProductPanelLoading(true);
    productPanelProgress.setValue(0);
    Animated.timing(productPanelProgress, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    try {
      const nextProduct = await shopApi.getProductStats(token, productId);
      if (requestId === productRequestId.current) setProductPanel(nextProduct);
    } catch (productError) {
      if (requestId === productRequestId.current) setProductPanelError(productError instanceof Error ? productError.message : 'Fișa produsului nu a putut fi încărcată.');
    } finally {
      if (requestId === productRequestId.current) setProductPanelLoading(false);
    }
  }, [productPanelProgress, token]);

  const closeProductPanel = useCallback(() => {
    productRequestId.current += 1;
    Animated.timing(productPanelProgress, { toValue: 0, duration: 230, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      setProductPanelId(null);
      setProductPanel(null);
      setProductPanelError('');
      setProductPanelLoading(false);
    });
  }, [productPanelProgress]);

  useEffect(() => {
    if (!initialOrderId || loading || initialOpenedOrderId.current === initialOrderId) return;
    const order = orders.find((item) => item.id === initialOrderId);
    if (!order) return;
    initialOpenedOrderId.current = initialOrderId;
    onInitialOrderHandled?.();
    void open(order);
  }, [initialOrderId, loading, onInitialOrderHandled, orders]);

  const save = async () => {
    if (!token || !selected || saving) return;
    if (!deliveryAddress.trim() || !deliveryCity.trim() || !deliveryCounty.trim()) {
      Alert.alert('Date de livrare incomplete', 'Adresa, localitatea și județul sunt obligatorii.');
      return;
    }
    if (status === 'cancelled' && selected.status !== 'cancelled') {
      const proceed = await new Promise<boolean>((resolve) => Alert.alert('Anulezi comanda?', 'Produsele cu stoc urmarit vor fi adaugate inapoi in stoc.', [{ text: 'Renunta', style: 'cancel', onPress: () => resolve(false) }, { text: 'Anuleaza comanda', style: 'destructive', onPress: () => resolve(true) }]));
      if (!proceed) return;
    }
    setSaving(true);
    try {
      const updated = await shopApi.updateOrder(token, selected.id, { status, payment_status: paymentStatus, admin_notes: adminNotes.trim(), notify_customer: notifyCustomer, address: deliveryAddress.trim(), city: deliveryCity.trim(), county: deliveryCounty.trim(), postal_code: deliveryPostalCode.trim() });
      setOrders((current) => current.map((order) => order.id === updated.id ? updated : order));
      setSelected(updated);
      setDeliveryEditing(false);
      setDeliveryAddress(updated.address || '');
      setDeliveryCity(updated.city || '');
      setDeliveryCounty(updated.county || '');
      setDeliveryPostalCode(updated.postal_code || '');
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.statsScroller} contentContainerStyle={styles.stats}>
        <OrderMetricCard icon={Clock3} color="#38BDF8" label="În procesare" value={String(orders.filter((order) => order.status === 'new').length)} help="Comenzi noi" />
        <OrderMetricCard icon={PackageOpen} color="#FB923C" label="În pregătire" value={String(orders.filter((order) => order.status === 'processing').length)} help="Se pregătesc" />
        <OrderMetricCard icon={WalletCards} color="#A78BFA" label="Total" value={money(financials.total)} help="Încasat + ramburs" />
        <OrderMetricCard icon={CreditCard} color="#34D399" label="Încasat" value={money(financials.collected)} help="Plăți încasate" />
        <OrderMetricCard icon={HandCoins} color="#FBBF24" label="De încasat" value={money(financials.pendingCash)} help="Ramburs în așteptare" />
      </ScrollView>
      <View style={styles.actions}>
        <View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Client, dată, oră, telefon, status, plată sau număr" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View>
        <TouchableOpacity style={[styles.filterButton, (filtersOpen || activeFilterCount > 0) && styles.filterButtonActive]} onPress={() => setFiltersOpen((current) => !current)}>
          <SlidersHorizontal size={18} color={(filtersOpen || activeFilterCount > 0) ? Colors.orange : Colors.textSecondary} />
          {activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}
        </TouchableOpacity>
        <TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity>
      </View>
      {filtersOpen ? <View style={styles.filtersPanel}>
        <View style={styles.filtersHead}><View><Text style={styles.filtersTitle}>Filtre comenzi</Text><Text style={styles.filtersResult}>{filtered.length} {filtered.length === 1 ? 'rezultat' : 'rezultate'}</Text></View><TouchableOpacity onPress={resetFilters} disabled={!query && activeFilterCount === 0}><Text style={[styles.resetFilters, !query && activeFilterCount === 0 && styles.resetFiltersDisabled]}>Resetează</Text></TouchableOpacity></View>
        <Text style={styles.filterGroupLabel}>STATUS COMANDĂ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContent}>
          <FilterChip label="Toate" active={statusFilter === 'all'} onPress={() => { setStatusFilter('all'); setPage(1); }} />
          {orderStatuses.map((item) => <FilterChip key={item.value} label={item.label} active={statusFilter === item.value} color={item.color} onPress={() => { setStatusFilter(item.value); setPage(1); }} />)}
        </ScrollView>
        <Text style={styles.filterGroupLabel}>METODĂ DE PLATĂ</Text>
        <View style={styles.filterChipsWrap}><FilterChip label="Toate" active={paymentMethodFilter === 'all'} onPress={() => { setPaymentMethodFilter('all'); setPage(1); }} /><FilterChip label="Card online" active={paymentMethodFilter === 'card'} color="#A78BFA" onPress={() => { setPaymentMethodFilter('card'); setPage(1); }} /><FilterChip label="Ramburs" active={paymentMethodFilter === 'cash'} color="#FBBF24" onPress={() => { setPaymentMethodFilter('cash'); setPage(1); }} /></View>
        <Text style={styles.filterGroupLabel}>STATUS PLATĂ</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipsContent}>
          <FilterChip label="Toate" active={paymentStateFilter === 'all'} onPress={() => { setPaymentStateFilter('all'); setPage(1); }} />
          {paymentStatuses.map((item) => <FilterChip key={item.value} label={item.label} active={paymentStateFilter === item.value} color={item.value === 'paid' ? '#34D399' : item.value === 'failed' ? '#FB7185' : '#FBBF24'} onPress={() => { setPaymentStateFilter(item.value); setPage(1); }} />)}
        </ScrollView>
      </View> : null}
      {filtered.length ? pagedOrders.map((order) => {
        const statusMeta = orderStatuses.find((item) => item.value === order.status) || orderStatuses[0];
        return <TouchableOpacity key={order.id} style={styles.orderCard} activeOpacity={0.76} onPress={() => void open(order)}>
          <View style={[styles.orderIcon, { backgroundColor: `${statusMeta.color}15` }]}><ShoppingCart size={21} color={statusMeta.color} /></View>
          <View style={styles.orderCopy}>
            <View style={styles.orderTop}><View style={styles.orderIdentity}><Text style={styles.orderNumber}>{order.order_number}</Text><View style={[styles.customerTypeBadge, isCompanyOrder(order) && styles.customerTypeBadgeCompany]}><Text style={[styles.customerTypeBadgeText, isCompanyOrder(order) && styles.customerTypeBadgeTextCompany]}>{isCompanyOrder(order) ? 'PJ' : 'PF'}</Text></View></View><Text style={[styles.status, { color: statusMeta.color }]}>{(statusMeta.shortLabel || statusMeta.label).toUpperCase()}</Text></View>
            <Text style={styles.customer}>{order.customer_name} · {order.customer_phone}</Text>
            <View style={styles.orderBottom}><View style={styles.orderDateMeta}><Clock3 size={12} color="#AAA39C" /><Text numberOfLines={1} style={styles.orderDate}>{dateTime(order.created_at)}</Text></View><View style={[styles.paymentMethodChip, order.payment_method === 'card' ? styles.paymentMethodCard : styles.paymentMethodCash]}>{order.payment_method === 'card' ? <CreditCard size={11} color="#C4B5FD" /> : <HandCoins size={11} color="#7DD3FC" />}<Text style={[styles.paymentMethodText, order.payment_method === 'card' ? styles.paymentMethodCardText : styles.paymentMethodCashText]}>{order.payment_method === 'card' ? 'Card' : 'Ramburs'}</Text></View><Text style={styles.orderTotal}>{money(order.total)}</Text></View>
          </View>
          <View style={styles.orderArrow}><ChevronRight size={19} color="#FFFFFF" strokeWidth={2.5} /></View>
        </TouchableOpacity>;
      }) : <View style={styles.empty}><PackageCheck size={34} color="#38BDF8" /><Text style={styles.emptyTitle}>{orders.length ? 'Nicio comandă găsită' : 'Nicio comandă'}</Text><Text style={styles.emptyText}>{orders.length ? 'Schimbă căutarea sau resetează filtrele.' : 'Comenzile trimise de pe site vor apărea automat aici.'}</Text>{orders.length ? <TouchableOpacity style={styles.emptyReset} onPress={resetFilters}><Text style={styles.emptyResetText}>Resetează filtrele</Text></TouchableOpacity> : null}</View>}
      <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} />

      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => productPanelId ? closeProductPanel() : (!saving && setSelected(null))}>
        <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={21} color={Colors.textSecondary} /></TouchableOpacity><View style={styles.modalHeaderCopy}><Text style={styles.modalKicker}>COMANDA SHOP</Text><Text style={styles.modalTitle}>{selected?.order_number}</Text></View><TouchableOpacity style={[styles.save, saving && styles.disabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color={Colors.white} /> : <><Save size={17} color={Colors.white} /><Text style={styles.saveText}>Salveaza</Text></>}</TouchableOpacity></View>
          {selected ? <ScrollView contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 20) + 30 }]} showsVerticalScrollIndicator={false}>
            {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.detailLoadingText}>Actualizăm istoricul comenzii...</Text></View> : null}
            <ClientInfoBlock order={selected} />
            <DeliveryInfoBlock order={selected} editing={deliveryEditing} onToggle={() => { if (deliveryEditing) { setDeliveryAddress(selected.address || ''); setDeliveryCity(selected.city || ''); setDeliveryCounty(selected.county || ''); setDeliveryPostalCode(selected.postal_code || ''); } setDeliveryEditing((current) => !current); }} address={deliveryAddress} city={deliveryCity} county={deliveryCounty} postalCode={deliveryPostalCode} onAddressChange={setDeliveryAddress} onCityChange={setDeliveryCity} onCountyChange={setDeliveryCounty} onPostalCodeChange={setDeliveryPostalCode} />
            <Text style={styles.sectionLabel}>PRODUSE</Text>
            <View style={styles.items}>{(Array.isArray(selected.items) ? selected.items : []).map((item) => {
              const hasDiscount = selected.promotion_scope === 'product' && Number(item.discount_total || 0) > 0;
              return <View key={item.id} style={styles.item}>{item.image_url ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="contain" /> : <View style={styles.itemQty}><Text style={styles.itemQtyText}>{item.quantity}×</Text></View>}<View style={styles.itemCopy}><Text style={styles.itemName}>{item.product_name}</Text><Text style={styles.itemSku}>{item.quantity} × {item.product_sku || 'Fara SKU'}</Text><View style={styles.itemUnitPrices}>{hasDiscount ? <><Text style={styles.itemOldPrice}>{money(item.unit_price)}</Text><Text style={styles.itemDiscountPrice}>{money(item.discounted_unit_price ?? item.unit_price)} / buc.</Text></> : <Text style={styles.itemUnitPrice}>{money(item.unit_price)} / buc.</Text>}</View></View><View style={styles.itemTotals}>{hasDiscount ? <><Text style={styles.itemOldTotal}>{money(item.line_total)}</Text><Text style={styles.itemDiscountTotal}>{money(item.discounted_line_total ?? item.line_total)}</Text></> : <Text style={styles.itemTotal}>{money(item.line_total)}</Text>}</View>{item.product_id ? <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Deschide fișa produsului ${item.product_name}`} activeOpacity={0.72} style={styles.itemOpen} onPress={() => void openProductPanel(item.product_id!)}><ChevronRight size={19} color="#FFFFFF" strokeWidth={2.7} /></TouchableOpacity> : null}</View>;
            })}</View>
            <View style={styles.totals}>
              <View style={styles.totalRow}><Text style={styles.totalLabel}>{`${selected.promotion_scope === 'product' && Number(selected.discount_total || 0) > 0 ? 'Subtotal după reduceri' : 'Subtotal'}${selected.vat_payer ? ' (TVA inclus)' : ''}`}</Text><Text style={styles.totalValue}>{money(Number(selected.subtotal || 0) - (selected.promotion_scope === 'product' ? Number(selected.discount_total || 0) : 0))}</Text></View>
              {selected.promotion_scope !== 'product' && Number(selected.discount_total || 0) > 0 ? <View style={styles.totalRow}><Text style={styles.discountLabel}>Reducere{selected.promotion_code ? ` · ${selected.promotion_code}` : ''}</Text><Text style={styles.discountValue}>−{money(selected.discount_total || 0)}</Text></View> : null}
              <View style={styles.totalRow}><Text style={styles.totalLabel}>Livrare</Text><Text style={styles.totalValue}>{money(selected.shipping_cost)}</Text></View>
              <View style={[styles.totalRow, styles.grandTotal]}><Text style={styles.grandTotalLabel}>{`Total de plată${selected.vat_payer ? ' (TVA inclus)' : ''}`}</Text><Text style={styles.grandTotalValue}>{money(selected.total)}</Text></View>
            </View>
            <Text style={styles.sectionLabel}>EVOLUȚIA COMENZII</Text>
            <OrderStatusTimeline order={selected} />
            <Text style={styles.sectionLabel}>STATUS COMANDA</Text>
            <View style={styles.statusPicker}>{orderStatuses.map((item, index) => {
              const StatusIcon = item.icon;
              const active = status === item.value;
              const locked = isStatusTransitionLocked(selected.status, item.value);
              return <View key={item.value} style={styles.statusTrackRow}>
                <View style={styles.statusTrackRail}><View style={[styles.statusTrackDot, active && { borderColor: item.color, backgroundColor: item.color }]}>{active ? <Check size={12} color="#15110D" strokeWidth={3} /> : <Text style={styles.statusTrackIndex}>{String(index + 1).padStart(2, '0')}</Text>}</View>{index < orderStatuses.length - 1 ? <View style={styles.statusTrackLine} /> : null}</View>
                <TouchableOpacity disabled={locked} activeOpacity={0.76} style={[styles.statusOption, active && { borderColor: item.color, backgroundColor: `${item.color}12` }, locked && styles.statusOptionLocked]} onPress={() => { setStatus(item.value); if (item.value === selected.status) setNotifyCustomer(false); }}>
                  <View style={[styles.statusOptionIcon, { backgroundColor: `${item.color}18` }]}><StatusIcon size={17} color={item.color} /></View>
                  <View style={styles.statusOptionCopy}><Text style={[styles.statusOptionTitle, active && { color: item.color }]}>{item.label}</Text><Text style={styles.statusOptionText}>{locked ? 'Etapă finalizată · nu se poate reveni' : item.description}</Text></View>
                  <View style={[styles.radio, active && { borderColor: item.color, backgroundColor: item.color }]}>{active ? <Check size={12} color="#14110F" strokeWidth={3} /> : null}</View>
                </TouchableOpacity>
              </View>;
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
          {productPanelId ? <Animated.View
            style={[
              styles.productPanelLayer,
              {
                opacity: productPanelProgress,
                transform: [{ translateX: productPanelProgress.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) }],
              },
            ]}>
            <View style={styles.productPanelHeader}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Înapoi la comandă" style={styles.productPanelBack} onPress={closeProductPanel}><ArrowLeft size={20} color="#F6F0EA" strokeWidth={2.4} /></TouchableOpacity>
              <View style={styles.productPanelHeaderCopy}><Text style={styles.productPanelKicker}>FIȘA PRODUSULUI</Text><Text numberOfLines={1} style={styles.productPanelTitle}>{productPanel?.product.name || 'Se încarcă produsul...'}</Text><Text style={styles.productPanelHint}>Comanda rămâne deschisă în fundal</Text></View>
              <View style={styles.productPanelMark}><PackageOpen size={20} color="#38BDF8" /></View>
            </View>
            {productPanelLoading ? <View style={styles.productPanelState}><View style={styles.productPanelLoader}><ActivityIndicator color="#38BDF8" /></View><Text style={styles.productPanelStateTitle}>Pregătim fișa produsului</Text><Text style={styles.productPanelStateText}>Datele produsului și istoricul vânzărilor se încarcă.</Text></View> : null}
            {!productPanelLoading && productPanelError ? <View style={styles.productPanelState}><View style={[styles.productPanelLoader, styles.productPanelErrorIcon]}><X size={21} color="#FB7185" /></View><Text style={styles.productPanelStateTitle}>Fișa nu s-a putut încărca</Text><Text style={styles.productPanelStateText}>{productPanelError}</Text><TouchableOpacity style={styles.productPanelRetry} onPress={() => void openProductPanel(productPanelId)}><RefreshCw size={15} color="#15110D" /><Text style={styles.productPanelRetryText}>Încearcă din nou</Text></TouchableOpacity></View> : null}
            {!productPanelLoading && productPanel ? <ScrollView contentContainerStyle={[styles.productPanelContent, { paddingBottom: Math.max(insets.bottom, 18) + 28 }]} showsVerticalScrollIndicator={false}>
              <ProductPanelContent stats={productPanel} />
            </ScrollView> : null}
          </Animated.View> : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function ProductPanelContent({ stats }: { stats: ShopProductStats }) {
  const product = stats.product;
  const imageUrl = product.images?.find((image) => Boolean(image.url))?.url;
  const currentPrice = Number(product.promotion_price ?? product.sale_price ?? product.price ?? 0);
  const regularPrice = Number(product.price || 0);
  const stockLabel = product.stock_mode === 'unlimited' ? 'Nelimitat' : `${Number(product.stock_quantity || 0)} buc.`;

  return <>
    <View style={styles.productHero}>
      {imageUrl ? <Image source={{ uri: imageUrl }} resizeMode="contain" style={styles.productHeroImage} /> : <View style={styles.productHeroImageFallback}><PackageOpen size={34} color="#38BDF8" /></View>}
      <View style={styles.productHeroCopy}>
        <View style={styles.productHeroBadges}><View style={[styles.productStatusBadge, !product.is_active && styles.productStatusBadgeOff]}><Text style={[styles.productStatusBadgeText, !product.is_active && styles.productStatusBadgeTextOff]}>{product.is_active ? 'ACTIV' : 'OPRIT'}</Text></View>{product.is_featured ? <View style={styles.productFeaturedBadge}><Star size={10} color="#FBBF24" fill="#FBBF24" /><Text style={styles.productFeaturedBadgeText}>RECOMANDAT</Text></View> : null}</View>
        <Text style={styles.productHeroName}>{product.name}</Text>
        <Text style={styles.productHeroSku}>{product.sku || product.supplier_product_code || 'Fără cod produs'}</Text>
        <View style={styles.productPriceLine}>{currentPrice < regularPrice ? <Text style={styles.productOldPrice}>{money(regularPrice)}</Text> : null}<Text style={styles.productCurrentPrice}>{money(currentPrice)}</Text></View>
      </View>
    </View>

    <View style={styles.productMetricGrid}>
      <ProductPanelMetric icon={<TrendingUp size={18} color="#34D399" />} color="#34D399" label="VÂNZĂRI" value={money(stats.revenue)} help={`${stats.orders_count} ${stats.orders_count === 1 ? 'comandă' : 'comenzi'}`} />
      <ProductPanelMetric icon={<ShoppingCart size={18} color="#38BDF8" />} color="#38BDF8" label="BUCĂȚI VÂNDUTE" value={String(stats.units_sold)} help="Cantitate totală" />
      <ProductPanelMetric icon={<Warehouse size={18} color="#FBBF24" />} color="#FBBF24" label="STOC" value={stockLabel} help={product.stock_available ? 'Disponibil pentru vânzare' : 'Indisponibil'} />
      <ProductPanelMetric icon={<Eye size={18} color="#A78BFA" />} color="#A78BFA" label="VIZUALIZĂRI" value={String(product.view_count || 0)} help={`${product.review_count || 0} recenzii`} />
    </View>

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>IDENTITATE ȘI ACHIZIȚIE</Text><Text style={styles.productInfoTitle}>Date produs</Text></View>
      <ProductPanelRow label="Categorie" value={product.category_name || 'Necategorizat'} />
      <ProductPanelRow label="Producător" value={product.manufacturer_name || 'Nespecificat'} />
      <ProductPanelRow label="Furnizor / sursă" value={product.source_name || product.source_domain || 'Nespecificat'} />
      <ProductPanelRow label="Cod furnizor" value={product.supplier_product_code || '—'} />
      <ProductPanelRow label="EAN" value={product.ean || '—'} />
      <ProductPanelRow label="Preț achiziție" value={money(product.cost_price)} strong />
      <ProductPanelRow label="Profit realizat" value={money(stats.profit)} strong positive={stats.profit >= 0} />
    </View>

    {product.short_description ? <View style={styles.productDescriptionCard}><Text style={styles.productDescriptionKicker}>DESCRIERE</Text><Text style={styles.productDescriptionTitle}>{product.description_title || 'Pe scurt'}</Text><Text style={styles.productDescriptionText}>{product.short_description}</Text></View> : null}

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>ISTORIC RECENT</Text><Text style={styles.productInfoTitle}>Comenzi și vânzări</Text></View>
      {stats.orders.length ? stats.orders.slice(0, 5).map((sale) => <View key={sale.id} style={styles.productSaleRow}><View style={styles.productSaleIcon}><ShoppingCart size={15} color="#38BDF8" /></View><View style={styles.productSaleCopy}><Text style={styles.productSaleOrder}>{sale.order_number}</Text><Text style={styles.productSaleMeta}>{sale.customer_name || 'Client'} · {dateTime(sale.created_at)}</Text></View><View style={styles.productSaleTotal}><Text style={styles.productSaleQty}>{sale.quantity}×</Text><Text style={styles.productSaleValue}>{money(sale.line_total)}</Text></View></View>) : <View style={styles.productPanelEmpty}><ShoppingCart size={18} color={Colors.textMuted} /><Text style={styles.productPanelEmptyText}>Produsul nu apare încă în nicio comandă.</Text></View>}
    </View>

    <View style={styles.productInfoCard}>
      <View style={styles.productInfoHead}><Text style={styles.productInfoKicker}>FEEDBACK CLIENȚI</Text><Text style={styles.productInfoTitle}>Recenzii · {product.review_average ? `${Number(product.review_average).toFixed(1)}/5` : 'fără notă'}</Text></View>
      {stats.reviews.length ? stats.reviews.slice(0, 3).map((review) => <View key={review.id} style={styles.productReview}><View style={styles.productReviewTop}><Text style={styles.productReviewName}>{review.customer_name || 'Client'}</Text><View style={styles.productReviewRating}><Star size={11} color="#FBBF24" fill="#FBBF24" /><Text style={styles.productReviewRatingText}>{review.rating}/5</Text></View></View><Text style={styles.productReviewText}>{review.message || 'Fără mesaj.'}</Text></View>) : <View style={styles.productPanelEmpty}><Star size={18} color={Colors.textMuted} /><Text style={styles.productPanelEmptyText}>Produsul nu are încă recenzii.</Text></View>}
    </View>
  </>;
}

function ProductPanelMetric({ icon, color, label, value, help }: { icon: React.ReactNode; color: string; label: string; value: string; help: string }) {
  return <View style={[styles.productMetric, { borderColor: `${color}35`, backgroundColor: `${color}0D` }]}><View style={[styles.productMetricIcon, { backgroundColor: `${color}19` }]}>{icon}</View><View style={styles.productMetricCopy}><Text style={[styles.productMetricLabel, { color }]}>{label}</Text><Text numberOfLines={1} style={styles.productMetricValue}>{value}</Text><Text numberOfLines={1} style={styles.productMetricHelp}>{help}</Text></View></View>;
}

function ProductPanelRow({ label, value, strong = false, positive = false }: { label: string; value: string; strong?: boolean; positive?: boolean }) {
  return <View style={styles.productPanelRow}><Text style={styles.productPanelRowLabel}>{label}</Text><Text style={[styles.productPanelRowValue, strong && styles.productPanelRowValueStrong, positive && styles.productPanelRowValuePositive]}>{value}</Text></View>;
}

function OrderStatusTimeline({ order }: { order: ShopOrder }) {
  const reveal = useRef(new Animated.Value(0)).current;
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const terminalCurrent = terminalOrderStatuses.includes(order.status) ? orderStatuses.find((item) => item.value === order.status) : null;
  const visible = orderStatuses.filter((item) => mainOrderFlow.includes(item.value)).concat(terminalCurrent ? [terminalCurrent] : []);
  const flow = visible.filter((item) => mainOrderFlow.includes(item.value));
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
      const reached = Boolean(entry) || item.value === order.status || (!terminalOrderStatuses.includes(order.status) && flowIndex >= 0 && currentFlowIndex >= 0 && flowIndex <= currentFlowIndex);
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

function OrderMetricCard({ icon: Icon, color, label, value, help }: { icon: typeof Clock3; color: string; label: string; value: string; help: string }) {
  return <View style={[styles.metricCard, { borderColor: `${color}3D`, backgroundColor: `${color}0D` }]}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}1C` }]}><Icon size={17} color={color} strokeWidth={2.2} /></View>
    <View style={styles.metricCopy}><Text style={[styles.metricLabel, { color }]}>{label.toUpperCase()}</Text><Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text><Text style={styles.metricHelp} numberOfLines={2}>{help}</Text></View>
  </View>;
}

function FilterChip({ label, active, onPress, color = Colors.orange }: { label: string; active: boolean; onPress: () => void; color?: string }) {
  return <TouchableOpacity activeOpacity={0.76} onPress={onPress} style={[styles.filterChip, active && { borderColor: color, backgroundColor: `${color}18` }]}>
    {active ? <Check size={12} color={color} strokeWidth={3} /> : null}
    <Text style={[styles.filterChipText, active && { color }]}>{label}</Text>
  </TouchableOpacity>;
}

function InfoBlock({ title, lines }: { title: string; lines: string[] }) {
  return <View style={styles.info}><View style={styles.infoHead}><Text style={styles.infoTitle}>{title.toUpperCase()}</Text></View>{lines.map((line, index) => <Text key={`${line}-${index}`} style={index === 0 ? styles.infoStrong : styles.infoText}>{line}</Text>)}</View>;
}

function DetailInfoRow({ label, value, strong = false }: { label: string; value?: string | null; strong?: boolean }) {
  return <View style={styles.detailInfoRow}><Text style={styles.detailInfoLabel}>{label}</Text><Text style={[styles.detailInfoValue, strong && styles.detailInfoValueStrong]}>{String(value || '').trim() || '—'}</Text></View>;
}

function ClientInfoBlock({ order }: { order: ShopOrder }) {
  const companyOrder = isCompanyOrder(order);
  return <View style={styles.info}>
    <View style={styles.infoHead}><View style={styles.infoTitleWithBadge}><Text style={styles.infoTitle}>CLIENT</Text><View style={[styles.customerTypeBadge, companyOrder && styles.customerTypeBadgeCompany]}><Text style={[styles.customerTypeBadgeText, companyOrder && styles.customerTypeBadgeTextCompany]}>{companyOrder ? 'PJ' : 'PF'}</Text></View></View><Text style={styles.infoHeadHint}>{companyOrder ? 'PERSOANĂ JURIDICĂ' : 'PERSOANĂ FIZICĂ'}</Text></View>
    <DetailInfoRow label="Nume" value={order.customer_name} strong />
    <DetailInfoRow label="Telefon" value={order.customer_phone} />
    <DetailInfoRow label="E-mail" value={order.customer_email || 'Fără e-mail'} />
    {companyOrder ? <View style={styles.companyDetails}>
      <Text style={styles.companyDetailsTitle}>DATE FISCALE</Text>
      <DetailInfoRow label="Denumire firmă" value={order.company_name} strong />
      <DetailInfoRow label="CUI / CIF" value={order.company_cui} />
      <DetailInfoRow label="Registrul Comerțului" value={order.company_registration_number} />
      <DetailInfoRow label="Sediu social" value={order.company_address} />
    </View> : null}
    <View style={styles.contactActions}>
      <TouchableOpacity style={styles.contactCall} activeOpacity={0.78} onPress={() => void callCustomer(order.customer_phone)}><Phone size={16} color="#EDE7E1" /><Text style={styles.contactCallText}>Apelează</Text></TouchableOpacity>
      <TouchableOpacity style={styles.contactWhatsApp} activeOpacity={0.78} onPress={() => void openCustomerWhatsApp(order.customer_phone)}><WhatsAppLogo size={17} /><Text style={styles.contactWhatsAppText}>WhatsApp</Text></TouchableOpacity>
    </View>
  </View>;
}

function DeliveryEditRow({ label, value, onChangeText, strong = false }: { label: string; value: string; onChangeText: (value: string) => void; strong?: boolean }) {
  return <View style={styles.deliveryEditRow}><Text style={styles.detailInfoLabel}>{label}</Text><TextInput value={value} onChangeText={onChangeText} style={[styles.deliveryInput, strong && styles.deliveryInputStrong]} placeholder="Completează" placeholderTextColor={Colors.textMuted} /></View>;
}

function DeliveryInfoBlock({ order, editing, onToggle, address, city, county, postalCode, onAddressChange, onCityChange, onCountyChange, onPostalCodeChange }: { order: ShopOrder; editing: boolean; onToggle: () => void; address: string; city: string; county: string; postalCode: string; onAddressChange: (value: string) => void; onCityChange: (value: string) => void; onCountyChange: (value: string) => void; onPostalCodeChange: (value: string) => void }) {
  return <View style={styles.info}>
    <View style={styles.infoHead}><Text style={styles.infoTitle}>LIVRARE</Text><TouchableOpacity style={[styles.deliveryEditButton, editing && styles.deliveryEditButtonActive]} onPress={onToggle}>{editing ? <X size={14} color={Colors.orange} /> : <Pencil size={14} color={Colors.textPrimary} />}<Text style={[styles.deliveryEditButtonText, editing && styles.deliveryEditButtonTextActive]}>{editing ? 'Anulează' : 'Editează'}</Text></TouchableOpacity></View>
    {editing ? <><DeliveryEditRow label="Adresă completă" value={address} onChangeText={onAddressChange} strong /><DeliveryEditRow label="Localitate" value={city} onChangeText={onCityChange} /><DeliveryEditRow label="Județ" value={county} onChangeText={onCountyChange} /><DeliveryEditRow label="Cod poștal" value={postalCode} onChangeText={onPostalCodeChange} /><Text style={styles.deliveryEditHelper}>Salvează modificările folosind butonul „Salvează” din partea de sus.</Text></> : <><DetailInfoRow label="Adresă completă" value={order.address} strong /><DetailInfoRow label="Localitate" value={order.city} /><DetailInfoRow label="Județ" value={order.county} /><DetailInfoRow label="Cod poștal" value={order.postal_code} /></>}
    <DetailInfoRow label="Metodă" value={order.shipping_method_name} />
    <DetailInfoRow label="Cost livrare" value={money(order.shipping_cost)} />
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginTop: 16 }, state: { minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 24, backgroundColor: '#1B1B1F', marginTop: 16 }, stateText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11 }, error: { color: '#FCA5A5', fontFamily: 'Inter-Regular', fontSize: 11, textAlign: 'center', paddingHorizontal: 22 }, retry: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, backgroundColor: Colors.orangeDim }, retryText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 10 },
  actions: { flexDirection: 'row', gap: 7, marginBottom: 10 }, search: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#343138', borderRadius: 17, paddingHorizontal: 13, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-Regular', fontSize: 11 }, refresh: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#343138', borderRadius: 17, backgroundColor: '#222126' },
  filterButton: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#343138', borderRadius: 17, backgroundColor: '#222126' }, filterButtonActive: { borderColor: '#A54E16', backgroundColor: Colors.orangeDim }, filterBadge: { position: 'absolute', top: 5, right: 5, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', borderRadius: 8, paddingHorizontal: 4, backgroundColor: Colors.orange }, filterBadgeText: { color: '#17110D', fontFamily: 'Inter-Bold', fontSize: 8 },
  filtersPanel: { overflow: 'hidden', borderWidth: 1, borderColor: '#38343D', borderRadius: 24, padding: 15, backgroundColor: '#1B1B1F', marginBottom: 11 }, filtersHead: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343138', paddingBottom: 10, marginBottom: 12 }, filtersTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, filtersResult: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 3 }, resetFilters: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10, paddingVertical: 8 }, resetFiltersDisabled: { color: Colors.textMuted, opacity: 0.45 }, filterGroupLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginTop: 4, marginBottom: 8 }, filterChipsContent: { gap: 7, paddingRight: 12, paddingBottom: 12 }, filterChipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingBottom: 12 }, filterChip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#3A363E', borderRadius: 999, paddingHorizontal: 12, backgroundColor: '#242228' }, filterChipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  statsScroller: { marginBottom: 10 }, stats: { flexDirection: 'row', gap: 7, paddingRight: 10 }, metricCard: { width: 156, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, overflow: 'hidden', borderWidth: 1, borderRadius: 18, paddingHorizontal: 10, paddingVertical: 9 }, metricIcon: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, metricCopy: { flex: 1, minWidth: 0 }, metricLabel: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.65 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 2 }, metricHelp: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 7.5, lineHeight: 10, marginTop: 2 },
  orderCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: '#2D2A30', borderRadius: 21, padding: 11, backgroundColor: '#1B1B1F', marginBottom: 8 }, orderIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, orderCopy: { flex: 1, minWidth: 0 }, orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, orderIdentity: { minWidth: 0, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }, orderNumber: { flexShrink: 1, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 }, customerTypeBadge: { minWidth: 27, height: 19, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#294A69', borderRadius: 99, paddingHorizontal: 6, backgroundColor: '#172B3E' }, customerTypeBadgeCompany: { borderColor: '#235C48', backgroundColor: '#15372B' }, customerTypeBadgeText: { color: '#7DD3FC', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.5 }, customerTypeBadgeTextCompany: { color: '#6EE7B7' }, status: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.5 }, customer: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, marginTop: 5 }, orderBottom: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 7 }, orderDateMeta: { flex: 1, minWidth: 0, minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 9, paddingHorizontal: 7, backgroundColor: '#252329' }, orderDate: { flexShrink: 1, color: '#C5BEB7', fontFamily: 'Inter-SemiBold', fontSize: 8 }, paymentMethodChip: { height: 24, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 7 }, paymentMethodCard: { borderColor: '#4C416A', backgroundColor: '#29233B' }, paymentMethodCash: { borderColor: '#24556B', backgroundColor: '#182E3A' }, paymentMethodText: { fontFamily: 'Inter-Bold', fontSize: 7.5 }, paymentMethodCardText: { color: '#C4B5FD' }, paymentMethodCashText: { color: '#7DD3FC' }, orderTotal: { flexShrink: 0, color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, orderArrow: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#48454E', borderRadius: 15, backgroundColor: '#323037' },
  empty: { minHeight: 230, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#1B1B1F' }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 13 }, emptyText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, marginTop: 5 }, emptyReset: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 15, backgroundColor: Colors.orangeDim, marginTop: 13 }, emptyResetText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 9 },
  modalSafe: { flex: 1, backgroundColor: Colors.bg }, modalHeader: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#29272B', paddingHorizontal: 12, backgroundColor: '#171513' }, close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#27242A' }, modalHeaderCopy: { flex: 1 }, modalKicker: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, modalTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 2 }, save: { minWidth: 96, height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, backgroundColor: Colors.orange }, saveText: { color: Colors.white, fontFamily: 'Inter-Bold', fontSize: 9 }, disabled: { opacity: 0.55 }, modalContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 16 },
  productPanelLayer: { ...StyleSheet.absoluteFillObject, zIndex: 40, elevation: 40, backgroundColor: '#111114' },
  productPanelHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#2B3038', paddingHorizontal: 12, backgroundColor: '#15191E' },
  productPanelBack: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#39414A', borderRadius: 14, backgroundColor: '#20262D' },
  productPanelHeaderCopy: { flex: 1, minWidth: 0 }, productPanelKicker: { color: '#38BDF8', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 1 }, productPanelTitle: { color: '#F5F0EB', fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 2 }, productPanelHint: { color: '#7F8993', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 2 },
  productPanelMark: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: 'rgba(56,189,248,.11)' },
  productPanelContent: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 14 },
  productPanelState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 }, productPanelLoader: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(56,189,248,.28)', borderRadius: 19, backgroundColor: 'rgba(56,189,248,.09)' }, productPanelErrorIcon: { borderColor: 'rgba(251,113,133,.3)', backgroundColor: 'rgba(251,113,133,.09)' }, productPanelStateTitle: { color: '#F5F0EB', fontFamily: 'Inter-Bold', fontSize: 15, marginTop: 15 }, productPanelStateText: { maxWidth: 340, color: '#8F888F', fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 6 }, productPanelRetry: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, paddingHorizontal: 16, backgroundColor: '#38BDF8', marginTop: 16 }, productPanelRetryText: { color: '#15110D', fontFamily: 'Inter-Bold', fontSize: 9 },
  productHero: { minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(56,189,248,.24)', borderRadius: 24, padding: 14, backgroundColor: '#192126' }, productHeroImage: { width: 116, height: 116, flexShrink: 0, borderRadius: 20, backgroundColor: '#F4F1ED' }, productHeroImageFallback: { width: 116, height: 116, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: 'rgba(56,189,248,.09)' }, productHeroCopy: { flex: 1, minWidth: 0 }, productHeroBadges: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginBottom: 8 }, productStatusBadge: { minHeight: 21, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 8, backgroundColor: 'rgba(52,211,153,.13)' }, productStatusBadgeOff: { backgroundColor: 'rgba(251,113,133,.13)' }, productStatusBadgeText: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.7 }, productStatusBadgeTextOff: { color: '#FB7185' }, productFeaturedBadge: { minHeight: 21, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, backgroundColor: 'rgba(251,191,36,.1)' }, productFeaturedBadgeText: { color: '#FBBF24', fontFamily: 'Inter-Bold', fontSize: 6.3, letterSpacing: 0.45 }, productHeroName: { color: '#F5F0EB', fontFamily: 'Inter-Bold', fontSize: 15, lineHeight: 20 }, productHeroSku: { color: '#818991', fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 5 }, productPriceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7, marginTop: 10 }, productOldPrice: { color: '#777179', fontFamily: 'Inter-SemiBold', fontSize: 9, textDecorationLine: 'line-through', textDecorationColor: '#FB923C' }, productCurrentPrice: { color: '#38BDF8', fontFamily: 'Inter-Bold', fontSize: 15 },
  productMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }, productMetric: { minWidth: 150, flexGrow: 1, flexBasis: '47%', minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 9, overflow: 'hidden', borderWidth: 1, borderRadius: 18, padding: 10 }, productMetricIcon: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, productMetricCopy: { flex: 1, minWidth: 0 }, productMetricLabel: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.55 }, productMetricValue: { color: '#F5F0EB', fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 3 }, productMetricHelp: { color: '#807981', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 2 },
  productInfoCard: { overflow: 'hidden', borderWidth: 1, borderColor: '#34343B', borderRadius: 22, padding: 14, backgroundColor: '#1B1B20', marginTop: 10 }, productInfoHead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#37363E', paddingBottom: 10, marginBottom: 2 }, productInfoKicker: { color: '#38BDF8', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.8 }, productInfoTitle: { color: '#F0EBE6', fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 }, productPanelRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#302F36', paddingVertical: 8 }, productPanelRowLabel: { flexShrink: 0, color: '#817B83', fontFamily: 'Inter-Medium', fontSize: 9 }, productPanelRowValue: { flex: 1, color: '#C9C2BC', fontFamily: 'Inter-SemiBold', fontSize: 9.5, lineHeight: 14, textAlign: 'right' }, productPanelRowValueStrong: { color: '#F2ECE7', fontFamily: 'Inter-Bold', fontSize: 10.5 }, productPanelRowValuePositive: { color: '#6EE7B7' },
  productDescriptionCard: { borderWidth: 1, borderColor: 'rgba(251,146,60,.2)', borderRadius: 21, padding: 14, backgroundColor: 'rgba(251,146,60,.055)', marginTop: 10 }, productDescriptionKicker: { color: '#FB923C', fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.8 }, productDescriptionTitle: { color: '#F2ECE7', fontFamily: 'Inter-Bold', fontSize: 12, marginTop: 4 }, productDescriptionText: { color: '#A59DA4', fontFamily: 'Inter-Regular', fontSize: 9.5, lineHeight: 16, marginTop: 7 },
  productSaleRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#302F36', paddingVertical: 8 }, productSaleIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: 'rgba(56,189,248,.1)' }, productSaleCopy: { flex: 1, minWidth: 0 }, productSaleOrder: { color: '#EEE9E4', fontFamily: 'Inter-Bold', fontSize: 9.5 }, productSaleMeta: { color: '#7E7880', fontFamily: 'Inter-Regular', fontSize: 7.5, marginTop: 3 }, productSaleTotal: { alignItems: 'flex-end', gap: 2 }, productSaleQty: { color: '#38BDF8', fontFamily: 'Inter-Bold', fontSize: 7.5 }, productSaleValue: { color: '#EEE9E4', fontFamily: 'Inter-Bold', fontSize: 9.5 },
  productReview: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#302F36', paddingVertical: 11 }, productReviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, productReviewName: { color: '#EEE9E4', fontFamily: 'Inter-Bold', fontSize: 9.5 }, productReviewRating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, productReviewRatingText: { color: '#FBBF24', fontFamily: 'Inter-Bold', fontSize: 8 }, productReviewText: { color: '#999199', fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 6 }, productPanelEmpty: { minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 7 }, productPanelEmptyText: { color: '#817A82', fontFamily: 'Inter-Regular', fontSize: 9, textAlign: 'center' },
  detailLoading: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 15, backgroundColor: Colors.orangeDim, marginBottom: 9 }, detailLoadingText: { color: Colors.orange, fontFamily: 'Inter-SemiBold', fontSize: 9 },
  info: { borderWidth: 1, borderColor: '#302D34', borderRadius: 20, padding: 15, backgroundColor: '#1B1B1F', marginBottom: 9 },
  infoHead: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343137', paddingBottom: 8, marginBottom: 4 },
  infoTitle: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 }, infoTitleWithBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 }, companyDetails: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#3B383E', paddingTop: 8, marginTop: 8 }, companyDetailsTitle: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8, marginBottom: 2 },
  infoHeadHint: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.6 },
  infoStrong: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12 }, infoText: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 2 },
  detailInfoRow: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2D2A30', paddingVertical: 8 },
  detailInfoLabel: { flexShrink: 0, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 },
  detailInfoValue: { flex: 1, color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 15, textAlign: 'right' },
  detailInfoValueStrong: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 },
  deliveryEditButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#49454F', borderRadius: 11, paddingHorizontal: 9, backgroundColor: '#343139' },
  deliveryEditButtonActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  deliveryEditButtonText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 8 },
  deliveryEditButtonTextActive: { color: Colors.orange },
  deliveryEditRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#2D2A30', paddingVertical: 6 },
  deliveryInput: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: '#49454F', borderRadius: 11, paddingHorizontal: 10, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'right' },
  deliveryInputStrong: { fontFamily: 'Inter-Bold', fontSize: 11 },
  deliveryEditHelper: { color: '#FFAD70', fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, borderRadius: 10, padding: 9, backgroundColor: Colors.orangeDim, marginTop: 8 },
  contactActions: { flexDirection: 'row', gap: 8, paddingTop: 12 },
  contactCall: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 14, backgroundColor: '#343138' },
  contactCallText: { color: '#EDE7E1', fontFamily: 'Inter-Bold', fontSize: 10 },
  contactWhatsApp: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderColor: '#255B3D', borderRadius: 14, backgroundColor: '#163323' },
  contactWhatsAppText: { color: '#51D88A', fontFamily: 'Inter-Bold', fontSize: 10 },
  sectionLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8, marginTop: 15, marginBottom: 8 }, items: { overflow: 'hidden', borderRadius: 18, backgroundColor: '#1B1B1F' }, item: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#343137', padding: 11 }, itemImage: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#F7F2ED' }, itemQty: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: Colors.orangeDim }, itemQtyText: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 10 }, itemCopy: { flex: 1, minWidth: 0 }, itemName: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, itemSku: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 3 }, itemTotal: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, itemOpen: { width: 39, height: 39, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#4A4750', borderRadius: 14, backgroundColor: '#343139' },
  itemUnitPrices: { minHeight: 15, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 3 }, itemUnitPrice: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 8 }, itemOldPrice: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 8, textDecorationLine: 'line-through', textDecorationColor: Colors.orange }, itemDiscountPrice: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 8 }, itemTotals: { alignItems: 'flex-end', gap: 2 }, itemOldTotal: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 8, textDecorationLine: 'line-through', textDecorationColor: Colors.orange }, itemDiscountTotal: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 10 },
  totals: { gap: 9, borderWidth: 1, borderColor: '#38343C', borderRadius: 20, padding: 15, backgroundColor: '#211F24', marginTop: 9 },
  totalRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  totalLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 11 },
  totalValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 12, fontVariant: ['tabular-nums'] },
  discountLabel: { color: '#6EE7B7', fontFamily: 'Inter-SemiBold', fontSize: 11 },
  discountValue: { color: '#6EE7B7', fontFamily: 'Inter-Bold', fontSize: 12, fontVariant: ['tabular-nums'] },
  grandTotal: { borderTopWidth: 1, borderTopColor: '#49454F', marginTop: 2, paddingTop: 12 },
  grandTotalLabel: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 },
  grandTotalValue: { color: Colors.orange, fontFamily: 'Inter-Bold', fontSize: 17, fontVariant: ['tabular-nums'] },
  timeline: { overflow: 'hidden', borderRadius: 22, padding: 14, backgroundColor: '#1B1B1F' }, timelineRow: { flexDirection: 'row', alignItems: 'stretch', gap: 11 }, timelineRail: { width: 38, alignItems: 'center' }, timelineDot: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#403C43', borderRadius: 12, backgroundColor: '#242228' }, timelineDotCurrent: { shadowColor: '#FF7A00', shadowOpacity: 0.28, shadowRadius: 9, shadowOffset: { width: 0, height: 4 }, elevation: 3 }, timelineLine: { width: 2, flex: 1, minHeight: 30, borderRadius: 99, backgroundColor: '#343138', marginVertical: 4 }, timelineCard: { flex: 1, minHeight: 78, borderWidth: 1, borderColor: 'transparent', borderRadius: 17, padding: 12, marginBottom: 8, backgroundColor: '#232126' }, timelineTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, timelineTitle: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 11 }, timelineCurrent: { fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.8 }, timelineDescription: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14, marginTop: 4 }, timelineMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }, timelineDate: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 8 }, timelineMail: { flexDirection: 'row', alignItems: 'center', gap: 4 }, timelineMailText: { color: '#34D399', fontFamily: 'Inter-Bold', fontSize: 6, letterSpacing: 0.45 }, timelinePending: { color: Colors.textMuted, fontFamily: 'Inter-SemiBold', fontSize: 7, marginTop: 8 },
  statusPicker: { overflow: 'hidden', borderWidth: 1, borderColor: '#37343B', borderRadius: 22, padding: 12, backgroundColor: '#1B1B1F' }, statusTrackRow: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch', gap: 9 }, statusTrackRail: { width: 28, alignItems: 'center' }, statusTrackDot: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderWidth: 1, borderColor: '#4A4650', borderRadius: 10, backgroundColor: '#29272D' }, statusTrackIndex: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7 }, statusTrackLine: { width: 2, flex: 1, minHeight: 25, borderRadius: 99, backgroundColor: '#37343B', marginVertical: 3 }, statusOption: { flex: 1, minHeight: 55, flexDirection: 'row', alignItems: 'center', gap: 9, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#36333A', borderRadius: 16, padding: 8, backgroundColor: '#211F24', marginBottom: 7 }, statusOptionLocked: { opacity: 0.46 }, statusOptionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, statusOptionCopy: { flex: 1, minWidth: 0 }, statusOptionTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, statusOptionText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 12, marginTop: 2 }, radio: { width: 21, height: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#5A555E', borderRadius: 99 },
  notifyCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#433B32', borderRadius: 20, padding: 12, backgroundColor: '#211D18', marginTop: 10 }, notifyCardActive: { borderColor: Colors.orange, backgroundColor: '#2A1C11' }, notifyCardDisabled: { opacity: 0.5 }, notifyIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: Colors.orangeDim }, notifyCopy: { flex: 1, minWidth: 0 }, notifyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, notifyText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, lineHeight: 13, marginTop: 4 }, checkbox: { width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#554E47', borderRadius: 8, backgroundColor: '#171513' }, checkboxActive: { borderColor: Colors.orange, backgroundColor: Colors.orange },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, chip: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: '#413D45', borderRadius: 999, paddingHorizontal: 12, backgroundColor: '#1B1B1F' }, chipActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, chipText: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 9 }, chipTextActive: { color: Colors.orange }, notes: { minHeight: 100, borderWidth: 1, borderColor: '#49454F', borderRadius: 15, padding: 13, color: Colors.textPrimary, backgroundColor: '#161519', fontFamily: 'Inter-Regular', fontSize: 11, textAlignVertical: 'top' },
});
