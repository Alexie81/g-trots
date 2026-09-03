import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, BadgeCheck, Building2, ChevronRight, Clock3, Download, FileCheck2, FileCode2, FileSpreadsheet, Link2, Mail, MapPin, Package, RefreshCw, Search, Send, ShieldCheck, ShoppingBag, Trash2, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { shopApi, ShopInvoiceItem, ShopIssuedInvoice, ShopProduct } from '@/services/shopApi';
import ShopPagination from '@/components/ShopPagination';

const themeColors: Record<ShopIssuedInvoice['theme'], string> = { orange: '#FF8A00', green: '#19A86B', red: '#EF4056', purple: '#8B72E8' };
const shopApiBase = (process.env.EXPO_PUBLIC_SHOP_API_URL || 'https://g-trots.ro/shop-api').replace(/\/$/, '');

function money(value: number, currency: string) {
  return `${new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function dateLabel(value: string) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
}

function assetUrl(path?: string) {
  const value = String(path || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `${shopApiBase}/${value.replace(/^\/+/, '')}`;
}

function invoiceLine(item: ShopInvoiceItem) {
  const discount = Math.max(0, Math.min(100, Number(item.discount_percent || 0)));
  const net = Number(item.quantity || 0) * Number(item.unit_price || 0) * (1 - discount / 100);
  const vat = net * Math.max(0, Number(item.vat_rate || 0)) / 100;
  return { net, vat, gross: net + vat };
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
  const [selectedInvoice, setSelectedInvoice] = useState<ShopIssuedInvoice | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ShopProduct | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState('');

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

  const download = async (invoice: ShopIssuedInvoice, format: 'pdf' | 'xlsx' | 'xml') => {
    if (!token || busy) return;
    setBusy(invoice.id);
    try {
      const file = await shopApi.getInvoicePublicLink(token, invoice.id, format);
      const uri = `${FileSystem.cacheDirectory}${String(file.file_name || `factura.${format}`).replace(/[\\/:*?"<>|]/g, '-')}`;
      await FileSystem.downloadAsync(file.url, uri);
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: `Descarcă ${invoice.display_number}` });
    } catch (downloadError) { Alert.alert('Descărcare nereușită', downloadError instanceof Error ? downloadError.message : 'Încearcă din nou.'); }
    finally { setBusy(null); }
  };

  const deleteInvoice = (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    if (!invoice.can_delete) {
      Alert.alert('Factura nu poate fi ștearsă', invoice.spv_status === 'sent'
        ? 'Factura a fost deja trimisă în SPV și trebuie păstrată.'
        : 'Poți șterge numai ultima factură emisă din serie.');
      return;
    }
    Alert.alert(
      'Ștergi ultima factură?',
      `${invoice.display_number} este netrimisă în SPV. Stocul și mișcările vor fi refăcute, iar numărul va fi reutilizat la următoarea factură.`,
      [
        { text: 'Renunță', style: 'cancel' },
        { text: 'Șterge factura', style: 'destructive', onPress: async () => {
          setBusy(invoice.id);
          try {
            await shopApi.deleteInvoice(token, invoice.id);
            setSelectedInvoice(null);
            setInvoices((current) => current.filter((item) => item.id !== invoice.id));
            Alert.alert('Factura a fost ștearsă', `Numărul ${invoice.display_number} este disponibil pentru următoarea factură.`);
            void load();
          } catch (deleteError) {
            Alert.alert('Factura nu a fost ștearsă', deleteError instanceof Error ? deleteError.message : 'Încearcă din nou.');
          } finally { setBusy(null); }
        } },
      ],
    );
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

  const copyPublicLink = async (invoice: ShopIssuedInvoice) => {
    if (!token || busy) return;
    setBusy(invoice.id);
    try {
      const result = await shopApi.getInvoicePublicLink(token, invoice.id, 'pdf');
      await Clipboard.setStringAsync(result.url);
      Alert.alert('Link copiat', `Linkul securizat pentru ${invoice.display_number} a fost copiat.`);
    } catch (linkError) { Alert.alert('Link indisponibil', linkError instanceof Error ? linkError.message : 'Încearcă din nou.'); }
    finally { setBusy(null); }
  };

  const openInvoice = async (invoice: ShopIssuedInvoice) => {
    if (!token) return;
    setSelectedInvoice(invoice);
    setSelectedProduct(null);
    setDetailError('');
    setDetailLoading(true);
    try { setSelectedInvoice(await shopApi.getInvoice(token, invoice.id)); }
    catch (openError) { setDetailError(openError instanceof Error ? openError.message : 'Fișa facturii nu a putut fi încărcată.'); }
    finally { setDetailLoading(false); }
  };

  const openProduct = async (productId?: string | null) => {
    if (!token || !productId) return;
    setSelectedProduct(null);
    setProductError('');
    setProductLoading(true);
    try { setSelectedProduct(await shopApi.getProduct(token, productId)); }
    catch (openError) { setProductError(openError instanceof Error ? openError.message : 'Fișa produsului nu a putut fi încărcată.'); }
    finally { setProductLoading(false); }
  };

  const closeInvoice = () => {
    setSelectedInvoice(null);
    setSelectedProduct(null);
    setDetailError('');
    setProductError('');
  };

  const payload = selectedInvoice?.payload;
  const invoiceItems = payload?.items || [];
  const totals = invoiceItems.reduce((sum, item) => {
    const line = invoiceLine(item);
    return { net: sum.net + line.net, vat: sum.vat + line.vat, gross: sum.gross + line.gross };
  }, { net: 0, vat: 0, gross: 0 });
  const invoiceAccent = selectedInvoice ? themeColors[selectedInvoice.theme] : Colors.orange;
  const productImage = selectedProduct?.images?.[0]?.url || '';

  return <><ScrollView style={styles.screen} contentContainerStyle={[styles.content, { paddingBottom: 105 + insets.bottom }]} showsVerticalScrollIndicator={false}>
    <View style={styles.hero}><View style={styles.heroIcon}><FileCheck2 size={27} color="#FFB36B" /></View><View style={styles.heroCopy}><Text style={styles.eyebrow}>DOCUMENTE COMERCIALE</Text><Text style={styles.title}>Facturi emise</Text><Text style={styles.subtitle}>Facturi reale, generate din comenzi, cu tema și starea plății actualizate corect.</Text></View><TouchableOpacity style={styles.refresh} onPress={() => void load()}><RefreshCw size={18} color="#FFB36B" /></TouchableOpacity></View>
    <View style={styles.metrics}><View style={[styles.metric, styles.metricPaid]}><BadgeCheck size={19} color="#34D399" /><View><Text style={styles.metricLabel}>ACHITATE</Text><Text style={styles.metricValue}>{money(paidTotal, 'RON')}</Text></View></View><View style={[styles.metric, styles.metricUnpaid]}><Clock3 size={19} color="#FBBF24" /><View><Text style={styles.metricLabel}>DE ÎNCASAT</Text><Text style={styles.metricValue}>{money(unpaidTotal, 'RON')}</Text></View></View></View>
    <View style={styles.toolbar}><View style={styles.search}><Search size={17} color={Colors.textMuted} /><TextInput value={query} onChangeText={(value) => { setQuery(value); setPage(1); }} placeholder="Număr, comandă, client, CUI sau e-mail" placeholderTextColor={Colors.textMuted} style={styles.searchInput} /></View></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>{(['all', 'paid', 'unpaid'] as const).map((value) => <TouchableOpacity key={value} style={[styles.filter, status === value && styles.filterActive]} onPress={() => { setStatus(value); setPage(1); }}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{value === 'all' ? `Toate · ${invoices.length}` : value === 'paid' ? 'Plătite' : 'Neplătite'}</Text></TouchableOpacity>)}</ScrollView>
    {loading ? <View style={styles.state}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se încarcă facturile emise...</Text></View> : error ? <View style={styles.state}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.retry} onPress={() => void load()}><Text style={styles.retryText}>Încearcă din nou</Text></TouchableOpacity></View> : paged.length ? paged.map((invoice) => {
      const accent = themeColors[invoice.theme];
      return <View key={invoice.id} style={[styles.card, { borderColor: `${accent}55` }]}>
        <View style={[styles.cardBar, { backgroundColor: accent }]} />
        <TouchableOpacity activeOpacity={0.78} style={styles.cardMain} onPress={() => void openInvoice(invoice)}>
          <View style={[styles.cardIcon, { backgroundColor: `${accent}19` }]}><FileCheck2 size={21} color={accent} /></View>
          <View style={styles.cardCopy}>
            <View style={styles.cardTop}>
              <Text style={styles.invoiceNumber}>{invoice.display_number}</Text>
              <View style={[styles.status, { backgroundColor: invoice.status === 'paid' ? '#34D39918' : '#FBBF2418' }]}><Text style={[styles.statusText, { color: invoice.status === 'paid' ? '#34D399' : '#FBBF24' }]}>{invoice.status === 'paid' ? 'PLĂTITĂ' : 'NEPLĂTITĂ'}</Text></View>
              <View style={[styles.spvBadge, invoice.spv_status === 'sent' ? styles.spvSent : styles.spvPending]}><ShieldCheck size={10} color={invoice.spv_status === 'sent' ? '#6EE7B7' : '#A8C7FA'} /><Text style={[styles.spvText, { color: invoice.spv_status === 'sent' ? '#6EE7B7' : '#A8C7FA' }]}>SPV {invoice.spv_status === 'sent' ? 'TRIMISĂ' : 'NETRIMISĂ'}</Text></View>
            </View>
            <Text style={styles.buyer} numberOfLines={1}>{invoice.buyer_name}</Text>
            <Text style={styles.meta}>{invoice.order_number} · {dateLabel(invoice.issue_date)} · tema {invoice.theme}</Text>
            <View style={styles.emailMeta}><Mail size={12} color={invoice.email_sent_at ? '#34D399' : Colors.textMuted} /><Text style={[styles.emailText, invoice.email_sent_at && styles.emailSent]} numberOfLines={1}>{invoice.email_sent_at ? `Trimisă la ${invoice.customer_email}` : invoice.customer_email || 'Fără e-mail'}</Text></View>
          </View>
          <View style={[styles.openCircle, { borderColor: `${accent}77` }]}><ChevronRight size={18} color={accent} /></View>
        </TouchableOpacity>
        <View style={styles.cardEnd}>
          <Text style={styles.total}>{money(invoice.total, invoice.currency)}</Text>
          <View style={styles.cardActions}>
            <TouchableOpacity disabled={Boolean(busy)} style={styles.iconButton} onPress={() => void sendEmail(invoice)}>{busy === invoice.id ? <ActivityIndicator size="small" color="#FFB36B" /> : <><Send size={15} color="#FFB36B" /><Text style={styles.iconButtonText}>E-mail</Text></>}</TouchableOpacity>
            <TouchableOpacity disabled={Boolean(busy)} style={styles.iconButton} onPress={() => void copyPublicLink(invoice)}><Link2 size={15} color="#A8C7FA" /><Text style={styles.linkButtonText}>Link</Text></TouchableOpacity>
            <TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.downloadButton]} onPress={() => void download(invoice, 'pdf')}><Download size={15} color="#FFFFFF" /><Text style={styles.downloadButtonText}>PDF</Text></TouchableOpacity>
            <TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.xlsxButton]} onPress={() => void download(invoice, 'xlsx')}><FileSpreadsheet size={15} color="#D1FAE5" /><Text style={styles.xlsxButtonText}>XLSX</Text></TouchableOpacity>
            <TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.xmlButton]} onPress={() => void download(invoice, 'xml')}><FileCode2 size={15} color="#C4B5FD" /><Text style={styles.xmlButtonText}>e-Factura</Text></TouchableOpacity>
            {invoice.can_delete ? <TouchableOpacity disabled={Boolean(busy)} style={[styles.iconButton, styles.deleteButton]} onPress={() => deleteInvoice(invoice)}><Trash2 size={15} color="#FDA4AF" /><Text style={styles.deleteButtonText}>Șterge</Text></TouchableOpacity> : null}
          </View>
        </View>
      </View>;
    }) : <View style={styles.state}><FileCheck2 size={34} color="#FFB36B" /><Text style={styles.emptyTitle}>Nu există facturi emise</Text><Text style={styles.stateText}>Emite prima factură din pagina unei comenzi.</Text></View>}
    {!loading && !error ? <ShopPagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} /> : null}
  </ScrollView><Modal visible={Boolean(selectedInvoice)} transparent animationType="fade" statusBarTranslucent onRequestClose={closeInvoice}><View style={styles.modalBackdrop}><View style={[styles.detailSheet, { paddingTop: Math.max(insets.top, 12), paddingBottom: Math.max(insets.bottom, 12) }]}>
    {(productLoading || productError || selectedProduct) ? <>
      <View style={styles.detailHeader}><TouchableOpacity style={styles.detailHeaderButton} onPress={() => { setSelectedProduct(null); setProductError(''); setProductLoading(false); }}><ArrowLeft size={20} color={Colors.textPrimary} /></TouchableOpacity><View style={styles.detailHeaderCopy}><Text style={styles.detailEyebrow}>FIȘA PRODUSULUI</Text><Text style={styles.detailTitle} numberOfLines={1}>{selectedProduct?.name || 'Se încarcă produsul...'}</Text></View><TouchableOpacity style={styles.detailHeaderButton} onPress={closeInvoice}><X size={20} color={Colors.textPrimary} /></TouchableOpacity></View>
      {productLoading ? <View style={styles.detailLoading}><ActivityIndicator color={Colors.orange} /><Text style={styles.stateText}>Se pregătește fișa produsului...</Text></View> : productError ? <View style={styles.detailLoading}><Text style={styles.error}>{productError}</Text><TouchableOpacity style={styles.retry} onPress={() => setProductError('')}><Text style={styles.retryText}>Înapoi la factură</Text></TouchableOpacity></View> : selectedProduct ? <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.productHero}>{productImage ? <Image source={{ uri: productImage }} style={styles.productImage} resizeMode="contain" /> : <View style={styles.productImageEmpty}><Package size={42} color="#FFB36B" /></View>}<View style={styles.productHeroCopy}><Text style={styles.productName}>{selectedProduct.name}</Text><Text style={styles.productSku}>{selectedProduct.sku || 'Fără SKU'}{selectedProduct.ean ? ` · EAN ${selectedProduct.ean}` : ''}</Text><View style={[styles.productStock, { backgroundColor: selectedProduct.stock_available ? '#34D39918' : '#FB718518' }]}><Text style={{ color: selectedProduct.stock_available ? '#6EE7B7' : '#FDA4AF', fontFamily: 'Inter-Bold', fontSize: 9 }}>{selectedProduct.stock_mode === 'unlimited' ? 'STOC NELIMITAT' : `${selectedProduct.stock_quantity} BUCĂȚI ÎN STOC`}</Text></View></View></View>
        <View style={styles.productMetrics}><View style={styles.productMetric}><Text style={styles.detailLabel}>PREȚ VÂNZARE</Text><Text style={styles.productPrice}>{money(selectedProduct.promotion_price ?? selectedProduct.sale_price ?? selectedProduct.price, selectedProduct.currency)}</Text></View><View style={styles.productMetric}><Text style={styles.detailLabel}>CATEGORIE</Text><Text style={styles.detailValue}>{selectedProduct.category_name || 'Necategorizat'}</Text></View></View>
        <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Despre produs</Text><Text style={styles.detailParagraph}>{selectedProduct.short_description || selectedProduct.description_title || 'Produsul nu are încă o descriere scurtă.'}</Text></View>
        {selectedProduct.specifications?.length ? <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Specificații</Text>{selectedProduct.specifications.map((specification, index) => <View key={`${specification.group}-${specification.label}-${index}`} style={styles.specRow}><View><Text style={styles.specGroup}>{specification.group}</Text><Text style={styles.specLabel}>{specification.label}</Text></View><Text style={styles.specValue}>{specification.value}</Text></View>)}</View> : null}
      </ScrollView> : null}
    </> : <>
      <View style={styles.detailHeader}><View style={[styles.detailHeaderIcon, { backgroundColor: `${invoiceAccent}20` }]}><FileCheck2 size={22} color={invoiceAccent} /></View><View style={styles.detailHeaderCopy}><Text style={[styles.detailEyebrow, { color: invoiceAccent }]}>FIȘA FACTURII EMISE</Text><Text style={styles.detailTitle}>{selectedInvoice?.display_number || 'Factură'}</Text></View><TouchableOpacity style={styles.detailHeaderButton} onPress={closeInvoice}><X size={20} color={Colors.textPrimary} /></TouchableOpacity></View>
      {detailLoading ? <View style={styles.detailLoading}><ActivityIndicator color={invoiceAccent} /><Text style={styles.stateText}>Se pregătește factura...</Text></View> : detailError ? <View style={styles.detailLoading}><Text style={styles.error}>{detailError}</Text><TouchableOpacity style={styles.retry} onPress={() => selectedInvoice && void openInvoice(selectedInvoice)}><Text style={styles.retryText}>Reîncearcă</Text></TouchableOpacity></View> : selectedInvoice && payload ? <>
        <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
          <View style={[styles.invoiceHero, { borderColor: `${invoiceAccent}66`, backgroundColor: `${invoiceAccent}12` }]}><View><Text style={styles.detailLabel}>DOCUMENT FISCAL</Text><Text style={styles.invoiceHeroNumber}>{selectedInvoice.display_number}</Text><Text style={styles.invoiceHeroMeta}>Comanda {selectedInvoice.order_number} · emisă {dateLabel(payload.issue_date)}</Text></View><View style={styles.invoiceHeroBadges}><View style={[styles.invoiceHeroStatus, { backgroundColor: selectedInvoice.status === 'paid' ? '#34D3991D' : '#FBBF241D' }]}><Text style={{ color: selectedInvoice.status === 'paid' ? '#6EE7B7' : '#FCD34D', fontFamily: 'Inter-Bold', fontSize: 9 }}>{selectedInvoice.status === 'paid' ? 'PLĂTITĂ' : 'NEPLĂTITĂ'}</Text></View><View style={[styles.spvBadge, selectedInvoice.spv_status === 'sent' ? styles.spvSent : styles.spvPending]}><ShieldCheck size={12} color={selectedInvoice.spv_status === 'sent' ? '#6EE7B7' : '#A8C7FA'} /><Text style={[styles.spvText, { color: selectedInvoice.spv_status === 'sent' ? '#6EE7B7' : '#A8C7FA' }]}>SPV {selectedInvoice.spv_status === 'sent' ? 'TRIMISĂ' : 'NETRIMISĂ'}</Text></View></View></View>
          <View style={styles.partyGrid}><View style={styles.partyCard}><Building2 size={18} color="#FFB36B" /><Text style={styles.detailLabel}>FURNIZOR</Text><Text style={styles.partyName}>{payload.seller.name}</Text><Text style={styles.partyMeta}>CUI {payload.seller.cui || '—'}{payload.seller.registration_number ? ` · ${payload.seller.registration_number}` : ''}</Text><Text style={styles.partyMeta}>{payload.seller.address || 'Adresă necompletată'}</Text></View><View style={styles.partyCard}><MapPin size={18} color="#67E8F9" /><Text style={styles.detailLabel}>CLIENT</Text><Text style={styles.partyName}>{payload.buyer.name}</Text><Text style={styles.partyMeta}>{payload.buyer.cui ? `CUI ${payload.buyer.cui}` : 'Persoană fizică'}</Text><Text style={styles.partyMeta}>{payload.buyer.address || 'Adresă necompletată'}</Text></View></View>
          <View style={styles.detailBlock}><View style={styles.blockHeader}><View><Text style={styles.detailLabel}>POZIȚII FACTURATE</Text><Text style={styles.detailBlockTitle}>{invoiceItems.length} {invoiceItems.length === 1 ? 'poziție' : 'poziții'}</Text></View><ShoppingBag size={20} color={invoiceAccent} /></View>{invoiceItems.map((item, index) => { const line = invoiceLine(item); const image = assetUrl(item.image_path); const content = <><View style={styles.invoiceProductImage}>{image ? <Image source={{ uri: image }} style={styles.invoiceProductPhoto} resizeMode="contain" /> : <Package size={21} color={item.product_id ? invoiceAccent : Colors.textMuted} />}</View><View style={styles.invoiceProductCopy}><Text style={styles.invoiceProductName}>{item.name}</Text><Text style={styles.invoiceProductMeta}>{item.sku || 'Fără cod'} · {item.quantity} {item.unit} × {money(line.gross / Math.max(1, item.quantity), payload.currency)}</Text><Text style={styles.invoiceProductVat}>TVA {Number(item.vat_rate || 0).toLocaleString('ro-RO')}%</Text></View><Text style={styles.invoiceProductTotal}>{money(line.gross, payload.currency)}</Text>{item.product_id ? <ChevronRight size={18} color={invoiceAccent} /> : null}</>; return item.product_id ? <TouchableOpacity key={`${item.sku}-${index}`} style={styles.invoiceProduct} activeOpacity={0.76} onPress={() => void openProduct(item.product_id)}>{content}</TouchableOpacity> : <View key={`${item.sku}-${index}`} style={styles.invoiceProduct}>{content}</View>; })}</View>
          <View style={styles.totalsCard}><View><Text style={styles.totalsLabel}>Subtotal fără TVA</Text><Text style={styles.totalsValue}>{money(totals.net, payload.currency)}</Text></View><View><Text style={styles.totalsLabel}>TVA</Text><Text style={styles.totalsValue}>{money(totals.vat, payload.currency)}</Text></View><View style={[styles.grandTotal, { borderTopColor: `${invoiceAccent}55` }]}><Text style={styles.grandTotalLabel}>TOTAL FACTURĂ</Text><Text style={[styles.grandTotalValue, { color: invoiceAccent }]}>{money(selectedInvoice.total, payload.currency)}</Text></View></View>
          <View style={styles.detailBlock}><Text style={styles.detailBlockTitle}>Plată și emitere</Text><Text style={styles.detailParagraph}>{payload.payment?.method || 'Metodă neprecizată'} · scadență {dateLabel(payload.due_date || payload.issue_date)}</Text><Text style={styles.detailParagraph}>Emisă de {selectedInvoice.issued_by || 'Administrator'}{selectedInvoice.customer_email ? ` · ${selectedInvoice.customer_email}` : ''}</Text>{payload.notes ? <Text style={styles.note}>{payload.notes}</Text> : null}</View>
        </ScrollView><View style={styles.detailActions}><TouchableOpacity style={styles.detailActionSecondary} disabled={Boolean(busy)} onPress={() => void sendEmail(selectedInvoice)}><Send size={17} color="#FFB36B" /><Text style={styles.detailActionSecondaryText}>E-mail</Text></TouchableOpacity><TouchableOpacity style={styles.detailActionLink} disabled={Boolean(busy)} onPress={() => void copyPublicLink(selectedInvoice)}><Link2 size={17} color="#A8C7FA" /><Text style={styles.detailActionLinkText}>Obține link</Text></TouchableOpacity><TouchableOpacity style={[styles.detailActionPrimary, { backgroundColor: invoiceAccent }]} disabled={Boolean(busy)} onPress={() => void download(selectedInvoice, 'pdf')}><Download size={17} color="#FFFFFF" /><Text style={styles.detailActionPrimaryText}>PDF</Text></TouchableOpacity><TouchableOpacity style={styles.detailActionXlsx} disabled={Boolean(busy)} onPress={() => void download(selectedInvoice, 'xlsx')}><FileSpreadsheet size={17} color="#D1FAE5" /><Text style={styles.detailActionXlsxText}>XLSX</Text></TouchableOpacity><TouchableOpacity style={styles.detailActionXml} disabled={Boolean(busy)} onPress={() => void download(selectedInvoice, 'xml')}><FileCode2 size={17} color="#C4B5FD" /><Text style={styles.detailActionXmlText}>e-Factura</Text></TouchableOpacity>{selectedInvoice.can_delete ? <TouchableOpacity style={styles.detailActionDelete} disabled={Boolean(busy)} onPress={() => deleteInvoice(selectedInvoice)}><Trash2 size={17} color="#FDA4AF" /><Text style={styles.detailActionDeleteText}>Șterge</Text></TouchableOpacity> : null}</View>
      </> : null}
    </>}
  </View></View></Modal></>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg }, content: { width: '100%', maxWidth: 920, alignSelf: 'center', padding: 14 },
  hero: { minHeight: 148, flexDirection: 'row', alignItems: 'center', gap: 13, overflow: 'hidden', borderWidth: 1, borderColor: '#6A4525', borderRadius: 28, padding: 18, backgroundColor: '#241C17' }, heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: '#FF8A0018' }, heroCopy: { flex: 1, minWidth: 0 }, eyebrow: { color: '#FFAD70', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 1 }, title: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 25, marginTop: 7 }, subtitle: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16, marginTop: 6 }, refresh: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF0A' },
  metrics: { flexDirection: 'row', gap: 9, marginTop: 10 }, metric: { flex: 1, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 20, padding: 13 }, metricPaid: { borderColor: '#245B48', backgroundColor: '#15251F' }, metricUnpaid: { borderColor: '#62491E', backgroundColor: '#272116' }, metricLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7, letterSpacing: 0.7 }, metricValue: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13, marginTop: 3 },
  toolbar: { marginTop: 12 }, search: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderColor: '#3D3941', borderRadius: 17, paddingHorizontal: 14, backgroundColor: '#1B1B1F' }, searchInput: { flex: 1, color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10 }, filters: { gap: 7, paddingVertical: 10 }, filter: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#403C44', borderRadius: 99, paddingHorizontal: 14, backgroundColor: '#1B1B1F' }, filterActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim }, filterText: { color: Colors.textSecondary, fontFamily: 'Inter-Bold', fontSize: 9 }, filterTextActive: { color: '#FFAD70' },
  card: { minHeight: 168, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 11, overflow: 'hidden', borderWidth: 1, borderRadius: 23, padding: 13, backgroundColor: '#1B1B1F', marginBottom: 9 }, cardBar: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderTopRightRadius: 9, borderBottomRightRadius: 9 }, cardMain: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 11 }, cardIcon: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }, cardCopy: { flex: 1, minWidth: 0 }, cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 }, invoiceNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 13 }, status: { borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4 }, statusText: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.6 }, spvBadge: { minHeight: 24, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 7 }, spvSent: { borderColor: '#2B7A5D', backgroundColor: '#18382D' }, spvPending: { borderColor: '#365979', backgroundColor: '#182A3A' }, spvText: { fontFamily: 'Inter-Bold', fontSize: 6.5, letterSpacing: 0.45 }, buyer: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 10, marginTop: 6 }, meta: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, emailMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }, emailText: { flex: 1, color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 7.5 }, emailSent: { color: '#6EE7B7' }, openCircle: { width: 38, height: 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 19, backgroundColor: '#FFFFFF08' }, cardEnd: { width: '100%', minHeight: 44, gap: 9 }, total: { color: '#FFAD70', fontFamily: 'Inter-Bold', fontSize: 14 }, cardActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, iconButton: { minWidth: 52, height: 44, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 2, borderWidth: 1, borderColor: '#624522', borderRadius: 13, paddingHorizontal: 6, backgroundColor: '#2A2118' }, iconButtonText: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 6.5 }, linkButtonText: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 6.5 }, downloadButton: { borderColor: '#FF8A00', backgroundColor: Colors.orange }, downloadButtonText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 7 }, xlsxButton: { borderColor: '#28634E', backgroundColor: '#17382C' }, xlsxButtonText: { color: '#D1FAE5', fontFamily: 'Inter-Bold', fontSize: 7 }, xmlButton: { borderColor: '#6650A4', backgroundColor: '#2C2440' }, xmlButtonText: { color: '#C4B5FD', fontFamily: 'Inter-Bold', fontSize: 6.5 }, deleteButton: { borderColor: '#7F1D35', backgroundColor: '#341923' }, deleteButtonText: { color: '#FDA4AF', fontFamily: 'Inter-Bold', fontSize: 6.5 },
  state: { minHeight: 210, alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: '#343137', borderRadius: 24, padding: 25, backgroundColor: '#1B1B1F' }, stateText: { color: Colors.textMuted, fontFamily: 'Inter-Regular', fontSize: 10, textAlign: 'center' }, error: { color: '#FDA4AF', fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'center' }, retry: { minHeight: 40, justifyContent: 'center', borderRadius: 13, paddingHorizontal: 15, backgroundColor: Colors.orange }, retryText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 9 }, emptyTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 15 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#050405D9' }, detailSheet: { width: '100%', maxWidth: 820, maxHeight: '96%', alignSelf: 'center', overflow: 'hidden', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderBottomWidth: 0, borderColor: '#3D3941', backgroundColor: '#171619' }, detailHeader: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#353138', paddingHorizontal: 15, backgroundColor: '#201E22' }, detailHeaderIcon: { width: 43, height: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 14 }, detailHeaderButton: { width: 43, height: 43, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFFFFF0A' }, detailHeaderCopy: { flex: 1, minWidth: 0 }, detailEyebrow: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.9 }, detailTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 19, marginTop: 3 }, detailLoading: { minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 25 }, detailScroll: { gap: 11, padding: 14, paddingBottom: 24 }, invoiceHero: { minHeight: 108, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 23, padding: 16 }, detailLabel: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 8, letterSpacing: 0.8 }, invoiceHeroNumber: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 23, marginTop: 5 }, invoiceHeroMeta: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 6 }, invoiceHeroBadges: { alignItems: 'flex-end', gap: 7 }, invoiceHeroStatus: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 7 }, partyGrid: { gap: 9 }, partyCard: { gap: 7, borderWidth: 1, borderColor: '#37333A', borderRadius: 20, padding: 15, backgroundColor: '#1E1C21' }, partyName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14 }, partyMeta: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 9, lineHeight: 14 }, detailBlock: { gap: 9, borderWidth: 1, borderColor: '#37333A', borderRadius: 21, padding: 14, backgroundColor: '#1E1C21' }, blockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, detailBlockTitle: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 14, marginTop: 3 }, detailParagraph: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 10, lineHeight: 16 }, note: { color: '#F5D0A9', fontFamily: 'Inter-Medium', fontSize: 9, lineHeight: 15, borderLeftWidth: 3, borderLeftColor: '#FF8A00', paddingLeft: 10 }, invoiceProduct: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: '#343138', paddingVertical: 10 }, invoiceProductImage: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 14, backgroundColor: '#FFFFFF08' }, invoiceProductPhoto: { width: '100%', height: '100%', backgroundColor: '#FFFFFF' }, invoiceProductCopy: { flex: 1, minWidth: 0 }, invoiceProductName: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10, lineHeight: 14 }, invoiceProductMeta: { color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 8, marginTop: 4 }, invoiceProductVat: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 7, marginTop: 3 }, invoiceProductTotal: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, totalsCard: { gap: 10, borderWidth: 1, borderColor: '#4B3D30', borderRadius: 21, padding: 15, backgroundColor: '#241E19' }, totalsLabel: { color: Colors.textMuted, fontFamily: 'Inter-Medium', fontSize: 9 }, totalsValue: { color: Colors.textSecondary, fontFamily: 'Inter-SemiBold', fontSize: 11, marginTop: 3 }, grandTotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 12 }, grandTotalLabel: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 10 }, grandTotalValue: { fontFamily: 'Inter-Bold', fontSize: 18 }, detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, borderTopWidth: 1, borderTopColor: '#353138', padding: 12, backgroundColor: '#201E22' }, detailActionSecondary: { height: 48, minWidth: 84, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderColor: '#624522', borderRadius: 15, backgroundColor: '#2A2118' }, detailActionSecondaryText: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionLink: { height: 48, minWidth: 100, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#41638A', borderRadius: 15, backgroundColor: '#1C2938' }, detailActionLinkText: { color: '#A8C7FA', fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionPrimary: { height: 48, minWidth: 74, flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15 }, detailActionPrimaryText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 9 }, detailActionXlsx: { height: 48, minWidth: 74, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#28634E', borderRadius: 15, backgroundColor: '#17382C' }, detailActionXlsxText: { color: '#D1FAE5', fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionXml: { height: 48, minWidth: 96, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#6650A4', borderRadius: 15, backgroundColor: '#2C2440' }, detailActionXmlText: { color: '#C4B5FD', fontFamily: 'Inter-Bold', fontSize: 8 }, detailActionDelete: { height: 48, minWidth: 84, flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: '#7F1D35', borderRadius: 15, backgroundColor: '#341923' }, detailActionDeleteText: { color: '#FDA4AF', fontFamily: 'Inter-Bold', fontSize: 8 }, productHero: { flexDirection: 'row', gap: 13, borderWidth: 1, borderColor: '#4B4037', borderRadius: 23, padding: 14, backgroundColor: '#211D1A' }, productImage: { width: 114, height: 114, flexShrink: 0, borderRadius: 18, backgroundColor: '#FFFFFF' }, productImageEmpty: { width: 114, height: 114, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18, backgroundColor: '#FF8A0012' }, productHeroCopy: { flex: 1, justifyContent: 'center', minWidth: 0 }, productName: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 16, lineHeight: 21 }, productSku: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 7 }, productStock: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 6, marginTop: 10 }, productMetrics: { flexDirection: 'row', gap: 9 }, productMetric: { flex: 1, gap: 6, borderWidth: 1, borderColor: '#37333A', borderRadius: 19, padding: 14, backgroundColor: '#1E1C21' }, productPrice: { color: '#FFB36B', fontFamily: 'Inter-Bold', fontSize: 15 }, detailValue: { color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 11 }, specRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#343138', paddingVertical: 8 }, specGroup: { color: Colors.textMuted, fontFamily: 'Inter-Bold', fontSize: 7 }, specLabel: { color: Colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 9, marginTop: 3 }, specValue: { maxWidth: '48%', color: Colors.textPrimary, fontFamily: 'Inter-SemiBold', fontSize: 10, textAlign: 'right' },
});
