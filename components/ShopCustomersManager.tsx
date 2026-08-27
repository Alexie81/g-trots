import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Ban,
  CalendarDays,
  ChevronRight,
  Mail,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  UsersRound,
  WalletCards,
  X,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopCustomerDetail, ShopCustomerSummary, ShopOrder } from '@/services/shopApi';

const money = (value: number) => `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0)} lei`;
const dateTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value.replace(' ', 'T')))
  : 'Nicio activitate';

const orderStatus: Record<string, string> = {
  new: 'În procesare', confirmed: 'Confirmată', processing: 'În pregătire', shipped: 'Predată curierului', completed: 'Livrată', refunded: 'Rambursată', cancelled: 'Anulată',
};

function initials(name: string) {
  return String(name || 'Client').trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'C';
}

export default function ShopCustomersManager({ onSearchFocus }: { onSearchFocus?: () => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 720;
  const [items, setItems] = useState<ShopCustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ShopCustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusSaving, setStatusSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await shopApi.listCustomers(token);
      setItems(Array.isArray(response) ? response : []);
    } catch (error) {
      Alert.alert('Clienții nu s-au putut încărca', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    if (!needle) return items;
    return items.filter((item) => [item.full_name, item.email, item.phone].some((value) => String(value || '').toLocaleLowerCase('ro-RO').includes(needle)));
  }, [items, query]);

  const totals = useMemo(() => ({
    active: items.filter((item) => item.is_active).length,
    orders: items.reduce((sum, item) => sum + item.orders_count, 0),
    value: items.reduce((sum, item) => sum + item.orders_total, 0),
  }), [items]);

  const openCustomer = async (id: string) => {
    if (!token) return;
    setDetailLoading(true);
    try { setSelected(await shopApi.getCustomer(token, id)); }
    catch (error) { Alert.alert('Fișa nu s-a putut deschide', error instanceof Error ? error.message : 'Încearcă din nou.'); }
    finally { setDetailLoading(false); }
  };

  const changeStatus = async (customer: ShopCustomerSummary | ShopCustomerDetail, next: boolean) => {
    if (!token || statusSaving) return;
    const run = async () => {
      setStatusSaving(customer.id);
      try {
        await shopApi.updateCustomerStatus(token, customer.id, next);
        setItems((current) => current.map((item) => item.id === customer.id ? { ...item, is_active: next } : item));
        setSelected((current) => current?.id === customer.id ? { ...current, is_active: next } : current);
        if (!next) Alert.alert('Cont dezactivat', `${customer.full_name} a fost deconectat. La următoarea autentificare va vedea mesajul de contact G-Trots.`);
      } catch (error) {
        Alert.alert('Starea nu s-a putut modifica', error instanceof Error ? error.message : 'Încearcă din nou.');
      } finally { setStatusSaving(null); }
    };
    if (next) return void run();
    Alert.alert('Dezactivezi acest cont?', 'Clientul va fi deconectat imediat, dar istoricul comenzilor rămâne păstrat.', [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Dezactivează', style: 'destructive', onPress: () => void run() },
    ]);
  };

  if (loading) return <View style={styles.loading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se pregătesc clienții</Text><Text style={styles.loadingText}>Conturi, comenzi și valori cumulate</Text></View>;

  return <View style={styles.page}>
    <View style={styles.hero}>
      <View style={styles.heroGlow} />
      <View style={styles.heroIcon}><UsersRound size={27} color="#FEA13B" /></View>
      <View style={styles.heroCopy}><Text style={styles.eyebrow}>RELAȚII CU CLIENȚII</Text><Text style={styles.heroTitle}>Clienți</Text><Text style={styles.heroText}>Vezi istoricul complet și controlează în siguranță accesul fiecărui cont.</Text></View>
      <TouchableOpacity style={styles.refresh} onPress={() => void load()} accessibilityLabel="Actualizează clienții"><RefreshCw size={18} color={Colors.white} /></TouchableOpacity>
    </View>

    <View style={[styles.metrics, compact && styles.metricsCompact]}>
      <Metric Icon={UserRound} color="#38BDF8" label="CLIENȚI" value={String(items.length)} note={`${totals.active} activi`} />
      <Metric Icon={ShoppingBag} color="#A78BFA" label="COMENZI" value={String(totals.orders)} note="înregistrate" />
      <Metric Icon={WalletCards} color="#34D399" label="VALOARE" value={money(totals.value)} note="comenzi valide" />
    </View>

    <View style={styles.searchBox}><Search size={19} color="#FE8C19" /><View style={styles.searchCopy}><Text style={styles.searchLabel}>CAUTĂ UN CLIENT</Text><TextInput value={query} onFocus={onSearchFocus} onChangeText={setQuery} placeholder="Nume, e-mail sau telefon" placeholderTextColor="#69636D" style={styles.searchInput} /></View>{query ? <TouchableOpacity style={styles.clear} onPress={() => setQuery('')}><X size={17} color="#CFC8D1" /></TouchableOpacity> : null}</View>

    <View style={styles.listHead}><Text style={styles.listTitle}>{filtered.length} {filtered.length === 1 ? 'client' : 'clienți'}</Text><Text style={styles.listHint}>Apasă pentru fișa completă</Text></View>
    <View style={styles.list}>
      {filtered.map((item) => <TouchableOpacity key={item.id} style={[styles.card, !item.is_active && styles.cardDisabled]} onPress={() => void openCustomer(item.id)} activeOpacity={0.72}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials(item.full_name)}</Text><View style={[styles.statusDot, !item.is_active && styles.statusDotOff]} /></View>
        <View style={styles.cardCopy}><View style={styles.nameLine}><Text numberOfLines={1} style={styles.customerName}>{item.full_name}</Text><View style={[styles.statusBadge, !item.is_active && styles.statusBadgeOff]}><Text style={[styles.statusBadgeText, !item.is_active && styles.statusBadgeTextOff]}>{item.is_active ? 'ACTIV' : 'DEZACTIVAT'}</Text></View></View><Text numberOfLines={1} style={styles.customerEmail}>{item.email}</Text><Text numberOfLines={1} style={styles.customerMeta}>{item.orders_count} comenzi · {money(item.orders_total)} · ultima: {dateTime(item.last_order_at)}</Text></View>
        {!compact ? <View style={styles.inlineSwitch}><Text style={styles.inlineSwitchLabel}>{item.is_active ? 'Acces permis' : 'Acces blocat'}</Text><Switch value={item.is_active} disabled={statusSaving === item.id} onValueChange={(value) => void changeStatus(item, value)} trackColor={{ false: '#41242D', true: '#5B3218' }} thumbColor={item.is_active ? Colors.orange : '#FB7185'} /></View> : null}
        <View style={styles.openIcon}><ChevronRight size={19} color="#EDE7EE" /></View>
      </TouchableOpacity>)}
      {!filtered.length ? <View style={styles.empty}><Search size={26} color="#FE8C19" /><Text style={styles.emptyTitle}>Niciun client găsit</Text><Text style={styles.emptyText}>Încearcă alt nume, e-mail sau număr de telefon.</Text></View> : null}
    </View>

    <Modal visible={Boolean(selected) || detailLoading} transparent animationType="fade" onRequestClose={() => !detailLoading && setSelected(null)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, compact && styles.sheetCompact, { paddingBottom: Math.max(16, insets.bottom) }]}>
          {detailLoading && !selected ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingTitle}>Se deschide fișa clientului</Text></View> : selected ? <>
            <View style={styles.sheetHeader}><View style={styles.sheetAvatar}><Text style={styles.sheetAvatarText}>{initials(selected.full_name)}</Text></View><View style={styles.sheetHeadCopy}><Text style={styles.sheetKicker}>FIȘĂ CLIENT</Text><Text numberOfLines={1} style={styles.sheetTitle}>{selected.full_name}</Text><Text numberOfLines={1} style={styles.sheetEmail}>{selected.email}</Text></View><TouchableOpacity style={styles.close} onPress={() => setSelected(null)}><X size={20} color="#EDE7EE" /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScroll}>
              <View style={[styles.accessCard, !selected.is_active && styles.accessCardOff]}><View style={[styles.accessIcon, !selected.is_active && styles.accessIconOff]}>{selected.is_active ? <ShieldCheck size={23} color="#34D399" /> : <Ban size={23} color="#FB7185" />}</View><View style={styles.accessCopy}><Text style={styles.accessTitle}>{selected.is_active ? 'Cont activ' : 'Cont dezactivat'}</Text><Text style={styles.accessText}>{selected.is_active ? 'Clientul se poate autentifica și își poate administra contul.' : 'Autentificarea este blocată, iar sesiunile au fost închise.'}</Text></View><Switch value={selected.is_active} disabled={statusSaving === selected.id} onValueChange={(value) => void changeStatus(selected, value)} trackColor={{ false: '#41242D', true: '#174232' }} thumbColor={selected.is_active ? '#34D399' : '#FB7185'} /></View>
              {!selected.is_active ? <View style={styles.disabledPreview}><View style={styles.disabledPreviewMark}>!</View><View><Text style={styles.disabledPreviewLabel}>MESAJ AFIȘAT CLIENTULUI</Text><Text style={styles.disabledPreviewText}>Acest cont a fost dezactivat. Contactează G-Trots pentru mai multe detalii.</Text></View></View> : null}

              <View style={styles.contactGrid}><InfoCard Icon={Mail} label="E-MAIL" value={selected.email} color="#38BDF8" /><InfoCard Icon={Phone} label="TELEFON" value={selected.phone || 'Necompletat'} color="#34D399" /><InfoCard Icon={CalendarDays} label="CLIENT DIN" value={dateTime(selected.created_at)} color="#A78BFA" /><InfoCard Icon={PackageCheck} label="ULTIMA COMANDĂ" value={dateTime(selected.last_order_at)} color="#FEA13B" /></View>
              <View style={styles.detailMetrics}><View style={styles.detailMetric}><Text style={styles.detailMetricLabel}>TOTAL COMENZI</Text><Text style={styles.detailMetricValue}>{selected.orders_count}</Text></View><View style={styles.detailMetric}><Text style={styles.detailMetricLabel}>VALOARE TOTALĂ</Text><Text style={styles.detailMetricValue}>{money(selected.orders_total)}</Text></View></View>
              <View style={styles.ordersHead}><View><Text style={styles.ordersKicker}>ISTORIC COMERCIAL</Text><Text style={styles.ordersTitle}>Comenzile clientului</Text></View><View style={styles.ordersCount}><Text style={styles.ordersCountText}>{selected.orders.length}</Text></View></View>
              <View style={styles.ordersList}>{selected.orders.map((order) => <OrderCard key={order.id} order={order} />)}{!selected.orders.length ? <View style={styles.emptyOrders}><ShoppingBag size={22} color="#FE8C19" /><Text style={styles.emptyOrdersText}>Clientul nu are încă nicio comandă.</Text></View> : null}</View>
            </ScrollView>
          </> : null}
        </View>
      </View>
    </Modal>
  </View>;
}

function Metric({ Icon, color, label, value, note }: { Icon: typeof UserRound; color: string; label: string; value: string; note: string }) {
  return <View style={styles.metric}><View style={[styles.metricIcon, { backgroundColor: `${color}18` }]}><Icon size={21} color={color} /></View><View><Text style={[styles.metricLabel, { color }]}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.metricValue}>{value}</Text><Text style={styles.metricNote}>{note}</Text></View></View>;
}

function InfoCard({ Icon, label, value, color }: { Icon: typeof Mail; label: string; value: string; color: string }) {
  return <View style={styles.infoCard}><View style={[styles.infoIcon, { backgroundColor: `${color}16` }]}><Icon size={18} color={color} /></View><View style={styles.infoCopy}><Text style={styles.infoLabel}>{label}</Text><Text numberOfLines={2} style={styles.infoValue}>{value}</Text></View></View>;
}

function OrderCard({ order }: { order: ShopOrder }) {
  return <View style={styles.orderCard}><View style={styles.orderTop}><View><Text style={styles.orderNumber}>{order.order_number}</Text><Text style={styles.orderDate}>{dateTime(order.created_at)}</Text></View><View style={styles.orderAmount}><Text style={styles.orderAmountValue}>{money(order.total)}</Text><Text style={styles.orderStatus}>{orderStatus[order.status] || order.status}</Text></View></View><View style={styles.orderProducts}>{order.items?.slice(0, 3).map((item) => <View key={item.id} style={styles.orderProduct}><View style={styles.productThumb}><Text style={styles.productThumbText}>{item.product_name?.[0]?.toUpperCase() || 'P'}</Text></View><View style={styles.productCopy}><Text numberOfLines={1} style={styles.productName}>{item.product_name}</Text><Text style={styles.productMeta}>{item.quantity} × {money(item.unit_price)}</Text></View></View>)}</View>{order.items?.length > 3 ? <Text style={styles.moreProducts}>+ încă {order.items.length - 3} produse</Text> : null}</View>;
}

const styles = StyleSheet.create({
  page: { padding: 14, gap: 12 }, loading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 7 }, loadingTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: '900' }, loadingText: { color: Colors.textMuted, fontSize: 12 },
  hero: { minHeight: 132, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#352A24', borderRadius: 26, backgroundColor: '#181513' }, heroGlow: { width: 220, height: 220, position: 'absolute', right: -70, top: -120, borderRadius: 110, backgroundColor: '#FF7A001C' }, heroIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: 19, borderWidth: 1, borderColor: '#FF8A253D', backgroundColor: '#FF7A0015' }, heroCopy: { minWidth: 0, flex: 1 }, eyebrow: { color: '#FE8C19', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 }, heroTitle: { marginTop: 4, color: '#FFF8F1', fontSize: 30, fontWeight: '900', letterSpacing: -1.2 }, heroText: { maxWidth: 620, marginTop: 4, color: '#978F8A', fontSize: 12, lineHeight: 18 }, refresh: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#282321' },
  metrics: { flexDirection: 'row', gap: 10 }, metricsCompact: { flexDirection: 'column' }, metric: { minWidth: 0, minHeight: 92, padding: 14, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#2D292F', borderRadius: 20, backgroundColor: '#1B191E' }, metricIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15 }, metricLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 1 }, metricValue: { maxWidth: 200, marginTop: 2, color: '#FFF', fontSize: 19, fontWeight: '900' }, metricNote: { marginTop: 2, color: '#777079', fontSize: 10 },
  searchBox: { minHeight: 70, padding: 10, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#3A3331', borderRadius: 20, backgroundColor: '#161416' }, searchCopy: { minWidth: 0, flex: 1 }, searchLabel: { color: '#B6865B', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, searchInput: { height: 30, padding: 0, color: '#FFF', fontSize: 14, fontWeight: '700' }, clear: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2A272B' },
  listHead: { paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, listTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' }, listHint: { color: '#706A72', fontSize: 10 }, list: { gap: 8 }, card: { minHeight: 92, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#302D32', borderRadius: 20, backgroundColor: '#1B191E' }, cardDisabled: { borderColor: '#422B32', backgroundColor: '#1C171A' }, avatar: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#2C211A' }, avatarText: { color: '#FEA13B', fontSize: 16, fontWeight: '900' }, statusDot: { width: 10, height: 10, position: 'absolute', right: -2, bottom: -2, borderWidth: 2, borderColor: '#1B191E', borderRadius: 5, backgroundColor: '#34D399' }, statusDotOff: { backgroundColor: '#FB7185' }, cardCopy: { minWidth: 0, flex: 1, gap: 3 }, nameLine: { flexDirection: 'row', alignItems: 'center', gap: 7 }, customerName: { minWidth: 0, flexShrink: 1, color: '#FFF', fontSize: 14, fontWeight: '900' }, statusBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 99, backgroundColor: '#15362A' }, statusBadgeOff: { backgroundColor: '#40242C' }, statusBadgeText: { color: '#4ADE80', fontSize: 8, fontWeight: '900' }, statusBadgeTextOff: { color: '#FB7185' }, customerEmail: { color: '#A69DA6', fontSize: 11 }, customerMeta: { color: '#6F6871', fontSize: 9 }, inlineSwitch: { alignItems: 'flex-end', gap: 4 }, inlineSwitchLabel: { color: '#7D757F', fontSize: 9, fontWeight: '700' }, openIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#29262B' }, empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#3B353D', borderRadius: 22 }, emptyTitle: { color: '#FFF', fontSize: 15, fontWeight: '900' }, emptyText: { color: '#766F78', fontSize: 11 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12, backgroundColor: '#050405D9' }, sheet: { width: '100%', maxWidth: 980, maxHeight: '94%', overflow: 'hidden', borderWidth: 1, borderColor: '#3A343B', borderRadius: 28, backgroundColor: '#18161B' }, sheetCompact: { maxHeight: '97%', alignSelf: 'stretch', borderRadius: 24 }, detailLoading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 10 }, sheetHeader: { minHeight: 98, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#302C32', backgroundColor: '#1E1B20' }, sheetAvatar: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FE8C19' }, sheetAvatarText: { color: '#1F0E02', fontSize: 17, fontWeight: '900' }, sheetHeadCopy: { minWidth: 0, flex: 1 }, sheetKicker: { color: '#FE8C19', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 }, sheetTitle: { marginTop: 2, color: '#FFF', fontSize: 19, fontWeight: '900' }, sheetEmail: { marginTop: 2, color: '#8D858E', fontSize: 10 }, close: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#2B282E' }, sheetScroll: { padding: 16, gap: 12 },
  accessCard: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#215340', borderRadius: 20, backgroundColor: '#12241D' }, accessCardOff: { borderColor: '#63303C', backgroundColor: '#27171C' }, accessIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#15402F' }, accessIconOff: { backgroundColor: '#47232C' }, accessCopy: { minWidth: 0, flex: 1 }, accessTitle: { color: '#FFF', fontSize: 13, fontWeight: '900' }, accessText: { marginTop: 3, color: '#8C858D', fontSize: 10, lineHeight: 15 }, disabledPreview: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#5B392D', borderRadius: 18, backgroundColor: '#261A16' }, disabledPreviewMark: { width: 38, height: 38, textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, overflow: 'hidden', backgroundColor: '#FE8C19', color: '#1D0C01', fontSize: 18, fontWeight: '900' }, disabledPreviewLabel: { color: '#FEA13B', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, disabledPreviewText: { maxWidth: 720, marginTop: 3, color: '#E8D4C3', fontSize: 10, lineHeight: 15 },
  contactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, infoCard: { minWidth: 210, padding: 12, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#302D33', borderRadius: 17, backgroundColor: '#1D1A20' }, infoIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, infoCopy: { minWidth: 0, flex: 1 }, infoLabel: { color: '#716A73', fontSize: 8, fontWeight: '900', letterSpacing: .7 }, infoValue: { marginTop: 3, color: '#ECE6ED', fontSize: 10, fontWeight: '800' }, detailMetrics: { flexDirection: 'row', gap: 8 }, detailMetric: { minWidth: 0, flex: 1, padding: 13, borderWidth: 1, borderColor: '#302D33', borderRadius: 17, backgroundColor: '#1D1A20' }, detailMetricLabel: { color: '#777079', fontSize: 8, fontWeight: '900', letterSpacing: .8 }, detailMetricValue: { marginTop: 5, color: '#FFF', fontSize: 18, fontWeight: '900' },
  ordersHead: { marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, ordersKicker: { color: '#FE8C19', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, ordersTitle: { marginTop: 3, color: '#FFF', fontSize: 18, fontWeight: '900' }, ordersCount: { minWidth: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: '#2A252C' }, ordersCountText: { color: '#FFF', fontSize: 12, fontWeight: '900' }, ordersList: { gap: 8 }, orderCard: { padding: 13, gap: 10, borderWidth: 1, borderColor: '#332F35', borderRadius: 19, backgroundColor: '#1D1A20' }, orderTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, orderNumber: { color: '#FFF', fontSize: 12, fontWeight: '900' }, orderDate: { marginTop: 3, color: '#777079', fontSize: 9 }, orderAmount: { alignItems: 'flex-end', gap: 3 }, orderAmountValue: { color: '#FEA13B', fontSize: 12, fontWeight: '900' }, orderStatus: { color: '#8F8791', fontSize: 8, fontWeight: '800' }, orderProducts: { gap: 5 }, orderProduct: { padding: 7, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 12, backgroundColor: '#242126' }, productThumb: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#F8F4EF' }, productThumbText: { color: '#2A211A', fontSize: 12, fontWeight: '900' }, productCopy: { minWidth: 0, flex: 1 }, productName: { color: '#EDE7EE', fontSize: 10, fontWeight: '800' }, productMeta: { marginTop: 2, color: '#777079', fontSize: 8 }, moreProducts: { color: '#A27B56', fontSize: 9, fontWeight: '800' }, emptyOrders: { minHeight: 100, alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: '#38333A', borderRadius: 18 }, emptyOrdersText: { color: '#8E8790', fontSize: 10 },
});
