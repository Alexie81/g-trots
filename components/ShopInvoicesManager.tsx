import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BadgeCheck, Clock3, Download, FileCheck2, FileSpreadsheet, Mail, RefreshCw, Search, Send } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopIssuedInvoice } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';

const themeColors: Record<ShopIssuedInvoice['theme'], string> = { orange: '#FF8A00', green: '#19A86B', red: '#EF4056', purple: '#8B72E8' };

function money(value: number, currency: string) {
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function dateLabel(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

export default function ShopInvoicesManager() {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [invoices, setInvoices] = useState<ShopIssuedInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try { setInvoices(await shopApi.listInvoices(token)); }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Facturile nu au putut fi încărcate.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ro-RO');
    return invoices.filter((invoice) => {
      if (status !== 'all' && invoice.status !== status) return false;
      if (!needle) return true;
      return [invoice.display_number, invoice.order_number, invoice.buyer_name, invoice.buyer_cui, invoice.customer_email, invoice.total, invoice.currency].join(' ').toLocaleLowerCase('ro-RO').includes(needle);
    });
  }, [invoices, query, status]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const paidTotal = invoices.filter((item) => item.status === 'paid').reduce((sum, item) => sum + Number(item.total || 0), 0);
  const unpaidTotal = invoices.filter((item) => item.status === 'unpaid').reduce((sum, item) => sum + Number(item.total || 0), 0);

  const download = async (invoice: ShopIssuedInvoice, format: 'pdf' | 'xlsx') => {
    if (!token || busy) return;
    setBusy(invoice.id);
    try {
      const file = await shopApi.downloadInvoice(token, invoice.id, format);
      const uri = `${FileSystem.cacheDirectory}${String(file.file_name || `factura.${format}`).replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: `Descarcă ${invoice.display_number}` });
    } catch (downloadError) { Alert.alert('Descărcare nereușită', downloadError instanceof Error ? downloadError.message : 'Încearcă din nou.'); }
    finally { setBusy(null); }
  };

  const sendEmail = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    if (!invoice.customer_email) return Alert.alert('Adresă lipsă', 'Comanda nu are o adresă de e-mail validă.');
    Alert.alert('Trimite factura', `Trimiți ${invoice.display_number} la ${invoice.customer_email}?`, [
      { text: 'Renunță', style: 'cancel' },
      { text: 'Trimite', onPress: async () => {
        setBusy(invoice.id);
        try {
          const result = await shopApi.sendInvoiceEmail(token, invoice.id);
          if (!result.sent) throw new Error(result.error || 'E-mailul nu a putut fi trimis.');
          setInvoices((current) => current.map((item) => item.id === invoice.id ? { ...item, email_sent_at: new Date().toISOString(), email_last_error: null } : item));
          Alert.alert('Factura a fost trimisă', `Clientul a primit PDF-ul și XLSX-ul la ${result.recipient}.`);
        } catch (emailError) { Alert.alert('E-mail netrimis', emailError instanceof Error ? emailError.message : 'Încearcă din nou.'); }
        finally { setBusy(null); }
      } },
    ]);
  };

  return <ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 105 + insets.bottom }]} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><View style={styles.heroIcon}><FileCheck2 size={27} color="#FFB36B" /></View><View style={styles.heroCopy}><Text style={styles.eyebrow}>DOCUMENTE COMERCIALE</Text><Text style={styles.title}>Facturi emise</Text><Text style={styles.subtitle}>Facturi reale, generate din comenzi, cu tema și starea plății actualizate corect.</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color="#FFB36B" /></TouchableOpacity></View>
    <View style={styles.metrics}><View style={[styles.metric, styles.metricPaid]}><BadgeCheck size={19} color="#34D399" /><View><Text style={styles.metricLabel}>ACHITATE</Text><Text style={styles.metricValue}>{money(paidTotal, 'RON')}</Text></View></View><View style={[styles.metric, styles.metricUnpaid]}><Clock3 size={19} color="#FBBF24" /><View><Text style={styles.metricLabel}>DE ÎNCASAT</Text><Text style={styles.metricValue}>{money(unpaidTotal, 'RON')}</Text></View></View></View>
    <View style={styles.toolbar}><View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Număr, comandă, client, CUI sau e-mail" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(['all', 'paid', 'unpaid'] as const).map((value) => <TouchableOpacity key={value} style={[styles.filter, status === value && styles.filterActive]} onPress={() => { setStatus(value); setPage(1); }}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{value === 'all' ? `Toate · ${invoices.length}` : value === 'paid' ? 'Plătite' : 'Neplătite'}</Text></TouchableOpacity>)}</ScrollView>
    {loading ? <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se încarcă facturile emise...</Text></View> : error ? <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Încearcă din nou</Text></TouchableOpacity></View> : paged.length ? paged.map((invoice) => {
      const accent = themeColors[invoice.theme];
      return <View key={invoice.id} style={[styles.card, { borderColor: `${accent}55` }]}><View style={[styles.cardBar, { backgroundColor: accent }]} /><View style={[styles.cardIcon, { backgroundColor: `${accent}19` }]}><FileCheck2 size={21} color={accent} /></View><View style={styles.cardCopy}><View style={styles.cardTop}><Text style={styles.invoiceNumber}>{invoice.display_number}</Text><View style={[styles.status, { backgroundColor: invoice.status === 'paid' ? '#34D39918' : '#FBBF2418' }]}><Text style={[styles.statusText, { color: invoice.status === 'paid' ? '#34D399' : '#FBBF24' }]}>{invoice.status === 'paid' ? 'PLĂTITĂ' : 'NEPLĂTITĂ'}</Text></View></View><Text style={styles.buyer} numberOfLines={1}>{invoice.buyer_name}</Text><Text style={styles.meta}>{invoice.order_number} · {dateLabel(invoice.issue_date)} · tema {invoice.theme}</Text><View style={styles.emailMeta}><Mail size={12} color={invoice.email_sent_at ? '#34D399' : Colors.textMuted} /><Text style={[styles.emailText, invoice.email_sent_at && styles.emailSent]} numberOfLines={1}>{invoice.email_sent_at ? `Trimisă la ${invoice.customer_email}` : invoice.customer_email || 'Fără e-mail'}</Text></View></View><View style={styles.cardEnd}><Text style={styles.total}>{money(invoice.total, invoice.currency)}</Text><View style={styles.cardActions}><TouchableOpacity disabled={Boolean(busy)} style={styles.iconButton} onPress={() => void sendEmail(invoice)}>{busy === invoice.id ? <ActivityIndicator size="small" color="#FFB36B" /> : <><Send size={15} color="#FFB36B" /><Text style={styles.iconButtonText}>E-mail</Text></>}</TouchableOpacity><TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.downloadButton]} onPress={() => void download(invoice, 'pdf')}><Download size={15} color="#FFFFFF" /><Text style={styles.downloadButtonText}>PDF</Text></TouchableOpacity><TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.xlsxButton]} onPress={() => void download(invoice, 'xlsx')}><FileSpreadsheet size={15} color="#D1FAE5" /><Text style={styles.xlsxButtonText}>XLSX</Text></TouchableOpacity></View></View></View>;
    }) : <View style={styles.state}><FileCheck2 size={34} color="#FFB36B" /><Text style={styles.emptyTitle}>Nu există facturi emise</Text><Text style={styles.stateText}>Emite prima factură din pagina unei comenzi.</Text></View>}
    {!loading && !error ? <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg }, content: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 14 },
  hero: { minHeight: 148, flexDirection: 'row', alignItems: 'center', gap: 13, overflow: 'hidden', borderWidth: 1, borderColor: '#6A4525', borderRadius: 28, padding: 18, backgroundColor: '#241C17' }, heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#FF8A0018' }, heroCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: '#FFAD70', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, title: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 25, marginTop: 7 }, subtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 6 }, refresh: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF0A' },
  metrics: { flexDirection: 'row', gap: 9, marginTop: 10 }, metric: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 20, padding: 13 }, metricPaid: { borderColor: '#245B48', backgroundColor: '#15251F' }, metricUnpaid: { borderColor: '#62491E', backgroundColor: '#272116' }, metricLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 },
  toolbar: { marginTop: 12 }, search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#3D3941', borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, filters: { gap: 7, paddingVertical: 10 }, filter: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#403C44', borderRadius: 99, paddingHorizontal: 14, backgroundColor: '#1B1B1F' }, filterActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, filterText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9 }, filterTextActive: { color: '#FFAD70' },
  card: { minHeight: 168, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 11, overflow: 'hidden', borderWidth: 1, borderRadius: 23, padding: 13, backgroundColor: '#1B1B1F', marginBottom: 9 }, cardBar: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 9, borderBottomRightRadius: 9 }, cardIcon: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, cardCopy: { flex: 1, minWidth: 190 }, cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, invoiceNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, status: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4 }, statusText: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.6 }, buyer: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, marginTop: 6 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, emailMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, emailText: { flex: 1, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 7.5 }, emailSent: { color: '#6EE7B7' }, cardEnd: { width: '100%', minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 9, paddingLeft: 59 }, total: { flexShrink: 1, color: '#FFAD70', fontFamily: 'Inter-Bold', fontSize: 12 }, cardActions: { flexDirection: 'row', gap: 5 }, iconButton: { minWidth: 48, height: 42, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: '#624522', borderRadius: 13, paddingHorizontal: 5, backgroundColor: '#2A2118' }, iconButtonText: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 6.5 }, downloadButton: { borderColor: '#FF8A00', backgroundColor: Colors.orange }, downloadButtonText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 7 }, xlsxButton: { borderColor: '#28634E', backgroundColor: '#17382C' }, xlsxButtonText: { color: '#D1FAE5', fontFamily: 'Inter-Bold', fontSize: 7 },
  state: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#343137', borderRadius: 24, padding: 25, backgroundColor: '#1B1B1F' }, stateText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, textAlign: 'center' }, error: { color: '#FDA4AF', fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'center' }, retry: { minHeight: 40, justifyContent: 'center', borderRadius: 13, paddingHorizontal: 15, backgroundColor: Colors.orange }, retryText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 9 }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15 },
});
