import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Boxes,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileDown,
  FilePlus2,
  ImagePlus,
  Link2,
  PackageSearch,
  PencilLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  isUnknownShopAction,
  legacyNirAttachmentUrl,
  shopApi,
  ShopNirAttachment,
  ShopNirDocument,
  ShopInventoryMovement,
  ShopNirLine,
  ShopNirPage,
  ShopProduct,
  ShopSupplier,
  ShopWarehouse,
} from '@/services/shopApi';

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const isLocalNir = (document: ShopNirDocument) => document.id.startsWith('local-nir-');
const cloneNir = (document: ShopNirDocument) => JSON.parse(JSON.stringify(document)) as ShopNirDocument;
const isNirReversalDocument = (document: ShopNirDocument | null | undefined) => document?.source_type === 'reversal'
  || Boolean((document as (ShopNirDocument & { reversal_of_id?: string | null }) | null | undefined)?.reversal_of_id);
const isNirStornoActionLocked = (document: ShopNirDocument | null | undefined) => isNirReversalDocument(document);
const isNirCorrectionLocked = (document: ShopNirDocument | null | undefined) => {
  if (!document) return false;
  if (isNirReversalDocument(document)) return true;
  const state = document.storno_state || document.storno?.state || 'none';
  return state === 'partial'
    || state === 'full'
    || document.partially_storned === true
    || document.fully_storned === true
    || Number(document.storned_quantity ?? document.storno?.storned_quantity ?? 0) > 0;
};
const movementQuantity = (value: unknown) => new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(Number(value || 0));
const movementDate = (value: unknown) => {
  const parsed = new Date(String(value || '').replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? String(value || '—') : parsed.toLocaleString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const movementLabel = (type: unknown) => ({ NIR_IN: 'INTRARE NIR', NIR_REVERSAL: 'STORNARE NIR', SALE_OUT: 'IEȘIRE VÂNZARE', MANUAL_ADJUSTMENT: 'AJUSTARE MANUALĂ' }[String(type || '').toUpperCase()] || String(type || 'MIȘCARE STOC').replaceAll('_', ' '));
type PendingNirAttachment = { key: string; name: string; mimeType: string; uri: string; size?: number; base64?: string | null };
const makeLine = (): ShopNirLine => ({
  product_id: null,
  supplier_product_reference_id: null,
  supplier_product_code: '',
  supplier_product_name: '',
  supplier_ean: '',
  purchase_unit: 'buc',
  stock_unit: 'buc',
  invoiced_quantity: '1',
  received_quantity: '1',
  accepted_quantity: '1',
  rejected_quantity: '0',
  conversion_factor: '1',
  unit_price: '0',
  discount_percent: '0',
  vat_rate: '19',
  difference_reason: null, difference_notes: '', mismatch_reason: '',
});

const statusInfo = {
  draft: { label: 'CIORNĂ', color: '#F59E0B', Icon: Clock3 },
  confirmed: { label: 'CONFIRMAT', color: '#22C55E', Icon: CheckCircle2 },
  reversed: { label: 'STORNAT', color: '#EF4444', Icon: AlertTriangle },
} as const;
const nirDisplayStatus = (document: ShopNirDocument) => isNirReversalDocument(document)
  ? statusInfo.reversed
  : document.status === 'draft' ? statusInfo.draft : statusInfo.confirmed;

const differenceReasons = [
  ['shortage', 'Lipsă'], ['surplus', 'Surplus'], ['damaged', 'Deteriorat'], ['wrong_product', 'Produs greșit'],
  ['price_difference', 'Preț diferit'], ['vat_difference', 'TVA diferit'], ['other', 'Alt motiv'],
] as const;

function money(value?: string, currency = 'RON') {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const CURRENCY_CODES = 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWG'.split(' ');
const currencyDisplayNames = (() => { try { const DisplayNames = (Intl as unknown as { DisplayNames: new (locales: string[], options: { type: string }) => { of: (code: string) => string } }).DisplayNames; return new DisplayNames(['ro'], { type: 'currency' }); } catch { return null; } })();
const currencyName = (code: string) => currencyDisplayNames?.of(code) || code;
const orderedCurrencies = [...CURRENCY_CODES].sort((a, b) => { const priority = ['RON', 'EUR', 'USD', 'GBP', 'CHF']; const ai = priority.indexOf(a); const bi = priority.indexOf(b); if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi); return currencyName(a).localeCompare(currencyName(b), 'ro'); });

function localLineTotals(line: ShopNirLine, exchangeRate = '1') {
  const numeric = (value: unknown) => Number(String(value ?? 0).replace(',', '.')) || 0;
  const quantity = Math.max(0, numeric(line.accepted_quantity));
  const conversion = Math.max(0, numeric(line.conversion_factor || 1));
  const price = Math.max(0, numeric(line.unit_price));
  const discount = Math.min(100, Math.max(0, numeric(line.discount_percent)));
  const vatRate = Math.min(100, Math.max(0, numeric(line.vat_rate)));
  const rate = Math.max(0, numeric(exchangeRate || 1));
  const allocatedCost = Math.max(0, numeric(line.allocated_cost_ron));
  const netRon = quantity * price * (1 - discount / 100) * rate;
  const vatRon = netRon * vatRate / 100;
  const stockQuantity = quantity * conversion;
  const inventoryTotalRon = netRon + allocatedCost;
  return { netRon, vatRon, totalRon: netRon + vatRon, stockQuantity, inventoryUnitCostRon: stockQuantity > 0 ? inventoryTotalRon / stockQuantity : 0 };
}

function stornoLineQuantity(line: ShopNirLine) {
  const raw = String(line.stornable_quantity ?? line.accepted_quantity ?? line.stock_quantity ?? '0').trim().replace(',', '.');
  const numeric = Math.abs(Number(raw) || 0);
  return { numeric, value: String(numeric) };
}

function stornoCandidateLines(document: ShopNirDocument | null | undefined) {
  return (document?.lines || []).filter((line) => Boolean(line.id) && line.is_stock_item !== false && stornoLineQuantity(line).numeric > 0);
}

function localToday() {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

type NirRegistryPeriod = 'all' | 'year' | 'six_months' | 'three_months' | 'last_month' | 'current_month' | 'custom';
type NirRegistryContent = 'registry' | 'complete';
type NirExportProgress = { title: string; detail: string; percent: number; etaSeconds: number; documents: number; lines: number; attachments: number };

function localIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function nirRegistryPeriodRange(period: NirRegistryPeriod, customFrom = '', customTo = '') {
  const now = new Date();
  const to = localIsoDate(now);
  if (period === 'all') return { from: '', to: '', label: 'toată perioada' };
  if (period === 'year') return { from: `${now.getFullYear()}-01-01`, to, label: `anul ${now.getFullYear()}` };
  if (period === 'six_months' || period === 'three_months') {
    const fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    fromDate.setMonth(fromDate.getMonth() - (period === 'six_months' ? 6 : 3));
    return { from: localIsoDate(fromDate), to, label: period === 'six_months' ? 'ultimele 6 luni' : 'ultimele 3 luni' };
  }
  if (period === 'last_month') return { from: localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0)), label: 'luna trecută' };
  if (period === 'custom') return { from: customFrom, to: customTo, label: 'perioada aleasă' };
  return { from: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to, label: 'luna curentă' };
}

function NirRegistryPeriodIcon({ period, active }: { period: NirRegistryPeriod; active: boolean }) {
  const color = active ? '#FED7AA' : '#7DD3FC';
  if (period === 'all') return <Boxes size={15} color={color} />;
  if (period === 'six_months') return <Clock3 size={15} color={color} />;
  if (period === 'three_months') return <RotateCcw size={15} color={color} />;
  if (period === 'last_month') return <ArrowLeft size={15} color={color} />;
  if (period === 'custom') return <PencilLine size={15} color={color} />;
  return <CalendarDays size={15} color={color} />;
}

function formatNirExportDuration(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds || 0));
  if (value < 60) return `${value} sec`;
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  return remainder ? `${minutes} min ${remainder} sec` : `${minutes} min`;
}

function NirExportProgressModal({ progress }: { progress: NirExportProgress | null }) {
  return <Modal visible={Boolean(progress)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => undefined}>
    <View style={styles.exportProgressBackdrop}>
      <View accessibilityViewIsModal style={styles.exportProgressCard}>
        <View style={styles.exportProgressOrb}><FileDown size={27} color="#FFB071" /><ActivityIndicator style={styles.exportProgressSpinner} size="large" color="#F97316" /></View>
        <Text style={styles.exportProgressEyebrow}>EXPORT ÎN CURS</Text>
        <Text style={styles.exportProgressTitle}>{progress?.title || 'Pregătim exportul'}</Text>
        <Text style={styles.exportProgressDetail}>{progress?.detail || 'Calculăm volumul de date…'}</Text>
        <View style={styles.exportProgressStats}>
          <View style={styles.exportProgressStat}><Text style={styles.exportProgressStatValue}>{(progress?.documents || 0).toLocaleString('ro-RO')}</Text><Text style={styles.exportProgressStatLabel}>NIR-URI</Text></View>
          <View style={styles.exportProgressStat}><Text style={styles.exportProgressStatValue}>{(progress?.lines || 0).toLocaleString('ro-RO')}</Text><Text style={styles.exportProgressStatLabel}>POZIȚII</Text></View>
          <View style={styles.exportProgressStat}><Text style={styles.exportProgressStatValue}>{(progress?.attachments || 0).toLocaleString('ro-RO')}</Text><Text style={styles.exportProgressStatLabel}>FIȘIERE</Text></View>
        </View>
        <View style={styles.exportProgressMeta}><Text style={styles.exportProgressPercent}>{progress?.percent || 2}%</Text><Text style={styles.exportProgressEta}>{(progress?.percent || 0) >= 100 ? 'Fișier pregătit' : `Timp estimat rămas: ${formatNirExportDuration(progress?.etaSeconds || 1)}`}</Text></View>
        <View style={styles.exportProgressTrack}><View style={[styles.exportProgressFill, { width: `${Math.min(100, Math.max(2, progress?.percent || 2))}%` }]} /></View>
        <Text style={styles.exportProgressFooter}>Descărcarea pornește automat imediat ce fișierul este gata.</Text>
      </View>
    </View>
  </Modal>;
}

function suggestNextInvoiceNumber(value: string | null | undefined) {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(.*?)(\d+)$/);
  if (!match) return '';
  const next = String(Number(match[2]) + 1).padStart(match[2].length, '0');
  return `${match[1]}${next}`;
}

function isValidIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function nirDraftPayload(document: ShopNirDocument) {
  return {
    row_version: document.row_version, supplier_id: document.supplier_id, warehouse_id: document.warehouse_id,
    supplier_invoice_series: document.supplier_invoice_series, supplier_invoice_number: document.supplier_invoice_number,
    supplier_invoice_date: document.supplier_invoice_date, nir_date: document.nir_date, nir_time: document.nir_time,
    reception_date: document.reception_date, reception_time: document.reception_time,
    currency: document.currency, exchange_rate: document.exchange_rate, exchange_rate_date: document.exchange_rate_date,
    notes: document.notes, lines: document.lines || [],
  };
}

function nirDraftSignature(document: ShopNirDocument) {
  const payload = nirDraftPayload(document);
  return JSON.stringify({ ...payload, row_version: undefined });
}

export default function ShopNirManager({ initialNirId = null, onInitialNirHandled }: { initialNirId?: string | null; onInitialNirHandled?: () => void }) {
  const { token } = useAuth();
  const insets = useSafeAreaInsets();
  const [registry, setRegistry] = useState<ShopNirPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [registryEpoch, setRegistryEpoch] = useState(0);
  const [editor, setEditor] = useState<ShopNirDocument | null>(null);
  const [correctionOriginal, setCorrectionOriginal] = useState<ShopNirDocument | null>(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reverseDialog, setReverseDialog] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseReasonTouched, setReverseReasonTouched] = useState(false);
  const [reverseSelection, setReverseSelection] = useState<Record<string, string>>({});
  const [reverseSelectionError, setReverseSelectionError] = useState('');
  const [stornoInvoice, setStornoInvoice] = useState({ series: '', number: '', date: localToday() });
  const [stornoInvoiceTouched, setStornoInvoiceTouched] = useState(false);
  const [stornoAttachments, setStornoAttachments] = useState<PendingNirAttachment[]>([]);
  const [stornoNotice, setStornoNotice] = useState<{ title: string; message: string } | null>(null);
  const [reversing, setReversing] = useState(false);
  const [suppliers, setSuppliers] = useState<ShopSupplier[]>([]);
  const [warehouses, setWarehouses] = useState<ShopWarehouse[]>([]);
  const [supplierPicker, setSupplierPicker] = useState(false);
  const [warehousePicker, setWarehousePicker] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [newSupplier, setNewSupplier] = useState<{ name: string; cui: string } | null>(null);
  const [productPickerLine, setProductPickerLine] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'lines' | 'movements'>('lines');
  const [detailRows, setDetailRows] = useState<ShopInventoryMovement[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingNirAttachment[]>([]);
  const [dateTimePicker, setDateTimePicker] = useState<{ target: 'nir' | 'reception'; mode: 'date' | 'time'; value: Date } | null>(null);
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [rateLoading, setRateLoading] = useState(false);
  const [attachmentDownload, setAttachmentDownload] = useState<string | null>(null);
  const [bundleDownloading, setBundleDownloading] = useState(false);
  const [registryDownloadVisible, setRegistryDownloadVisible] = useState(false);
  const [registryDownloadPeriod, setRegistryDownloadPeriod] = useState<NirRegistryPeriod>('current_month');
  const [registryDownloadContent, setRegistryDownloadContent] = useState<NirRegistryContent>('complete');
  const [registryDownloadFrom, setRegistryDownloadFrom] = useState(nirRegistryPeriodRange('current_month').from);
  const [registryDownloadTo, setRegistryDownloadTo] = useState(nirRegistryPeriodRange('current_month').to);
  const [registryDownloading, setRegistryDownloading] = useState(false);
  const [exportProgress, setExportProgress] = useState<NirExportProgress | null>(null);
  const exportProgressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncedDraftSignature = useRef('');
  const createDraftInFlight = useRef(false);
  const registryRequestId = useRef(0);
  const registryLoaded = useRef(false);
  const registrySearchReady = useRef(false);
  const codeResolveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const codeResolveRequestIds = useRef<Record<number, number>>({});
  const initialNirOpenedRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (exportProgressTimer.current) clearInterval(exportProgressTimer.current);
  }, []);

  const permissions = registry?.permissions || editor?.permissions || [];
  const can = (permission: string) => permissions.includes(permission);

  const loadRegistry = useCallback(async (requestedPage = page) => {
    if (!token) return;
    const requestId = ++registryRequestId.current;
    if (!registryLoaded.current) setLoading(true);
    try {
      const result = await shopApi.listNirs(token, { page: requestedPage, page_size: 12, search: search.trim(), status });
      if (requestId !== registryRequestId.current) return;
      registryLoaded.current = true;
      setRegistry(result);
      setPage(result.page);
    } catch (error) {
      if (requestId !== registryRequestId.current) return;
      Alert.alert('NIR-urile nu s-au încărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      if (requestId === registryRequestId.current) setLoading(false);
    }
  }, [page, search, status, token]);

  const loadLookups = useCallback(async () => {
    if (!token) return;
    try {
      const [supplierRows, warehouseRows] = await Promise.all([shopApi.searchSuppliers(token), shopApi.listWarehouses(token)]);
      setSuppliers(supplierRows);
      setWarehouses(warehouseRows);
    } catch {
      // Registrul rămâne utilizabil, iar editorul va afișa eroarea la salvare.
    }
  }, [token]);

  useEffect(() => { void loadRegistry(1); void loadLookups(); }, [loadLookups]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!registrySearchReady.current) {
      registrySearchReady.current = true;
      return;
    }
    const timer = setTimeout(() => { void loadRegistry(1); }, 300);
    return () => clearTimeout(timer);
  }, [search, status]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      void loadRegistry(page);
      void loadLookups();
    });
    return () => subscription.remove();
  }, [loadLookups, loadRegistry, page]);

  const openDocument = async (id: string) => {
    if (!token) return;
    setSaving(true);
    try {
      const document = await shopApi.getNir(token, id);
      setPendingAttachments([]);
      setCorrectionOriginal(null);
      syncedDraftSignature.current = document.status === 'draft' ? nirDraftSignature(document) : '';
      setEditor({ ...document, lines: document.lines || [] });
      setDetailsTab('lines');
      setDetailRows([]);
    } catch (error) {
      Alert.alert('NIR-ul nu s-a deschis', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!initialNirId) {
      initialNirOpenedRef.current = null;
      return;
    }
    if (!token || initialNirOpenedRef.current === initialNirId) return;
    initialNirOpenedRef.current = initialNirId;
    void openDocument(initialNirId).finally(() => onInitialNirHandled?.());
  }, [initialNirId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const createDraft = () => {
    if (saving || createDraftInFlight.current) return;
    createDraftInFlight.current = true;
    const warehouse = warehouses.find((item) => item.is_default) || warehouses[0];
    const date = today();
    const time = currentTime();
    const document: ShopNirDocument = {
      id: `local-nir-${Date.now()}`,
      temporary_number: 'NIR nesalvat', nir_number: null, status: 'draft', supplier_id: null,
      warehouse_id: warehouse?.id || '', supplier_invoice_series: null, supplier_invoice_number: null,
      supplier_invoice_date: date, nir_date: date, nir_time: time, reception_date: date, reception_time: time, currency: 'RON', exchange_rate: '1',
      exchange_rate_date: date, notes: null, source_type: 'manual', row_version: 0,
      confirmed_at: null, confirmed_by: null, reversed_at: null, reversed_by: null,
      lines: [makeLine()], attachments: [], permissions,
    };
    syncedDraftSignature.current = '';
    setPendingAttachments([]);
    setCorrectionOriginal(null);
    setEditor(document);
    setTimeout(() => { createDraftInFlight.current = false; }, 350);
  };

  const patchEditor = (patch: Partial<ShopNirDocument>) => setEditor((current) => current ? { ...current, ...patch } : current);
  const refreshBnrRate = async (currency: string, date: string) => {
    if (!token || currency === 'RON') return;
    setRateLoading(true);
    try {
      const result = await shopApi.getBnrExchangeRate(token, currency, date);
      setEditor((current) => current && current.currency === currency ? { ...current, exchange_rate: result.rate, exchange_rate_date: result.date } : current);
    } catch (error) {
      Alert.alert('Cursul BNR nu este disponibil', `${error instanceof Error ? error.message : 'Completează cursul manual.'}\n\nCâmpurile rămân editabile.`);
    } finally { setRateLoading(false); }
  };
  const selectCurrency = (currency: string) => {
    if (!editor || currency === editor.currency) { setCurrencyPicker(false); return; }
    const invoiceDate = editor.supplier_invoice_date || editor.nir_date || today();
    patchEditor({ currency, exchange_rate: currency === 'RON' ? '1' : '', exchange_rate_date: invoiceDate });
    setCurrencyPicker(false);
    setCurrencySearch('');
    if (currency !== 'RON') void refreshBnrRate(currency, invoiceDate);
  };
  const openDateTimePicker = (target: 'nir' | 'reception') => {
    if (!editor) return;
    const date = target === 'nir' ? editor.nir_date : editor.reception_date;
    const time = String(target === 'nir' ? editor.nir_time : editor.reception_time).slice(0, 5) || '00:00';
    const value = new Date(`${date || today()}T${time}:00`);
    setDateTimePicker({ target, mode: Platform.OS === 'ios' ? 'time' : 'date', value: Number.isNaN(value.getTime()) ? new Date() : value });
  };
  const changeDateTimePicker = (event: DateTimePickerEvent, value?: Date) => {
    if (!dateTimePicker) return;
    if (event.type === 'dismissed' || !value) { setDateTimePicker(null); return; }
    const target = dateTimePicker.target;
    if (Platform.OS !== 'ios' && dateTimePicker.mode === 'date') { setDateTimePicker({ target, mode: 'time', value }); return; }
    const dateSource = Platform.OS !== 'ios' ? dateTimePicker.value : value;
    const finalValue = new Date(dateSource);
    if (Platform.OS !== 'ios') finalValue.setHours(value.getHours(), value.getMinutes(), 0, 0);
    const date = `${finalValue.getFullYear()}-${String(finalValue.getMonth() + 1).padStart(2, '0')}-${String(finalValue.getDate()).padStart(2, '0')}`;
    const time = `${String(finalValue.getHours()).padStart(2, '0')}:${String(finalValue.getMinutes()).padStart(2, '0')}`;
    patchEditor(target === 'nir' ? { nir_date: date, nir_time: time } : { reception_date: date, reception_time: time });
    setDateTimePicker(null);
  };
  const patchLine = (index: number, patch: Partial<ShopNirLine>) => setEditor((current) => {
    if (!current) return current;
    const lines = [...(current.lines || [])];
    lines[index] = { ...lines[index], ...patch };
    return { ...current, lines };
  });

  const leaveEditor = () => {
    Keyboard.dismiss();
    setEditor(null);
    setCorrectionOriginal(null);
    setPendingAttachments([]);
    syncedDraftSignature.current = '';
    setRegistryEpoch((value) => value + 1);
    setPage(1);
    void loadRegistry(1);
  };

  const requestLeaveEditor = () => {
    if (correctionOriginal) {
      Alert.alert(
        'Sigur vrei să ieși?',
        'Modificările nu se salvează, iar NIR-ul rămâne confirmat exact cum era înainte.',
        [
          { text: 'Rămân în NIR', style: 'cancel' },
          { text: 'Da, ies fără salvare', style: 'destructive', onPress: leaveEditor },
        ],
      );
      return;
    }
    if (!editor || editor.status !== 'draft') return leaveEditor();
    const dirty = isLocalNir(editor) || pendingAttachments.length > 0 || nirDraftSignature(editor) !== syncedDraftSignature.current;
    if (!dirty) return leaveEditor();
    Alert.alert(
      'Există modificări nesalvate',
      'Dacă închizi acum, datele introduse după ultima salvare vor fi eliminate. Nu se salvează nimic în fundal.',
      [
        { text: 'Rămân în NIR', style: 'cancel' },
        { text: 'Închid fără salvare', style: 'destructive', onPress: leaveEditor },
      ],
    );
  };

  const deleteNir = async () => {
    if (!token || !editor || editor.status !== 'draft' || deleting || !can('NIR_EDIT_DRAFT')) return;
    setDeleting(true);
    try {
      if (!isLocalNir(editor)) {
        const result = await shopApi.deleteNir(token, editor.id);
        if (!result.deleted) throw new Error('Ciorna nu mai există sau nu mai poate fi ștearsă.');
      }
      setDeleteDialog(false);
      leaveEditor();
    } catch (error) {
      Alert.alert('NIR-ul nu a putut fi șters', error instanceof Error ? error.message : 'Reîncarcă documentul și încearcă din nou.');
    } finally {
      setDeleting(false);
    }
  };

  const uploadPendingAttachments = async (saved: ShopNirDocument) => {
    if (!token || !pendingAttachments.length) return saved;
    for (const pending of pendingAttachments) {
      const contentBase64 = pending.base64 || await FileSystem.readAsStringAsync(pending.uri, { encoding: FileSystem.EncodingType.Base64 });
      const attachment = await shopApi.uploadNirAttachment(token, saved.id, { file_name: pending.name, mime_type: pending.mimeType, content_base64: contentBase64 });
      await shopApi.extractNirAttachment(token, saved.id, attachment.id);
      setPendingAttachments((current) => current.filter((item) => item.key !== pending.key));
    }
    return shopApi.getNir(token, saved.id);
  };

  const saveDraft = async (silent = false) => {
    if (!token || !editor || editor.status !== 'draft' || saving) return;
    setSaving(true);
    try {
      let saved = isLocalNir(editor)
        ? await shopApi.createNir(token, nirDraftPayload(editor))
        : await shopApi.updateNir(token, editor.id, nirDraftPayload(editor));
      saved = await uploadPendingAttachments(saved);
      syncedDraftSignature.current = nirDraftSignature(saved);
      setEditor(saved);
      await loadRegistry(page);
      if (!silent) Alert.alert('Ciornă salvată', 'Datele sunt sincronizate și pot fi continuate de pe desktop.');
    } catch (error) {
      Alert.alert('Ciorna nu s-a salvat', error instanceof Error ? error.message : 'Reîncarcă documentul și încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  const resolveLine = async (index: number, supplierCode?: string, silent = false, requestId?: number, supplierName?: string) => {
    if (!token || !editor?.supplier_id) return;
    const line = editor.lines?.[index];
    const code = (supplierCode ?? line?.supplier_product_code ?? '').trim();
    const name = (supplierName ?? line?.supplier_product_name ?? '').trim();
    if (!code && !line?.supplier_ean.trim() && !name) return;
    try {
      const result = await shopApi.resolveSupplierProductReference(token, editor.supplier_id, code, line?.supplier_ean || '', name);
      if (requestId && codeResolveRequestIds.current[index] !== requestId) return;
      if (result.reference) {
        patchLine(index, {
          product_id: result.reference.product_id,
          product_name: result.reference.product_name,
          product_image_url: result.reference.product_image_url || null,
          supplier_product_reference_id: result.reference.id || null,
          supplier_product_name: line?.supplier_product_name || result.reference.supplier_product_name || result.reference.product_name || '',
          conversion_factor: result.reference.conversion_factor,
          purchase_unit: result.reference.purchase_unit,
          stock_unit: result.reference.stock_unit,
          resolution_status: result.match_method === 'name_exact' ? 'matched_name' : 'matched_code',
        });
      } else {
        patchLine(index, { product_id: null, product_name: '', supplier_product_reference_id: null, resolution_status: 'unmatched' });
      }
    } catch (error) {
      if (!silent) Alert.alert('Codul nu a putut fi verificat', error instanceof Error ? error.message : 'Încearcă din nou.');
      else patchLine(index, { resolution_status: 'unmatched' });
    }
  };

  const changeSupplierCode = (index: number, supplier_product_code: string) => {
    const currentLine = editor?.lines?.[index];
    const supplierName = currentLine?.supplier_product_name?.trim() || '';
    if (currentLine?.product_id) {
      clearTimeout(codeResolveTimers.current[index]);
      patchLine(index, { supplier_product_code, supplier_product_reference_id: null, resolution_status: 'matched_manual' });
      return;
    }
    patchLine(index, { supplier_product_code, supplier_product_reference_id: null, product_id: null, product_name: '', resolution_status: supplier_product_code.trim() ? 'matching_code' : supplierName ? 'matching_name' : 'unmatched' });
    clearTimeout(codeResolveTimers.current[index]);
    const requestId = (codeResolveRequestIds.current[index] || 0) + 1;
    codeResolveRequestIds.current[index] = requestId;
    if ((!supplier_product_code.trim() && !supplierName) || !editor?.supplier_id) return;
    codeResolveTimers.current[index] = setTimeout(() => { void resolveLine(index, supplier_product_code, true, requestId, supplierName); }, 380);
  };

  const changeSupplierName = (index: number, supplier_product_name: string) => {
    const line = editor?.lines?.[index];
    if (line?.product_id) {
      clearTimeout(codeResolveTimers.current[index]);
      patchLine(index, { supplier_product_name, supplier_product_reference_id: null, resolution_status: 'matched_manual' });
      return;
    }
    if (line?.supplier_product_code?.trim()) { patchLine(index, { supplier_product_name }); return; }
    patchLine(index, { supplier_product_name, supplier_product_reference_id: null, product_id: null, product_name: '', resolution_status: supplier_product_name.trim() ? 'matching_name' : 'unmatched' });
    clearTimeout(codeResolveTimers.current[index]);
    const requestId = (codeResolveRequestIds.current[index] || 0) + 1;
    codeResolveRequestIds.current[index] = requestId;
    if (!supplier_product_name.trim() || !editor?.supplier_id) return;
    codeResolveTimers.current[index] = setTimeout(() => { void resolveLine(index, '', true, requestId, supplier_product_name); }, 380);
  };

  useEffect(() => () => Object.values(codeResolveTimers.current).forEach(clearTimeout), []);

  const searchProducts = async () => {
    if (!token) return;
    setLoadingProducts(true);
    try {
      setProducts(await shopApi.listProductOptions(token, { q: productSearch.trim(), supplier_id: editor?.supplier_id || '', limit: 40 }));
    } catch (error) {
      Alert.alert('Produsele nu s-au încărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (productPickerLine === null) return;
    const timer = setTimeout(() => { void searchProducts(); }, 260);
    return () => clearTimeout(timer);
  }, [productSearch, productPickerLine]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectProduct = async (product: ShopProduct) => {
    if (productPickerLine === null || !editor) return;
    const index = productPickerLine;
    const line = editor.lines?.[index];
    setProductPickerLine(null);
    if (!line) return;
    const reference = product.supplier_reference || null;
    const existingReferenceId = line.supplier_product_reference_id || null;
    const currentCode = line.supplier_product_code.trim();
    const currentName = line.supplier_product_name.trim();
    const currentEan = line.supplier_ean.trim();
    const canReuseReference = Boolean(reference && !currentCode && !currentName && !currentEan);
    patchLine(index, {
      product_id: product.id,
      product_name: product.name,
      product_image_url: product.images?.[0]?.url || null,
      supplier_product_reference_id: canReuseReference ? reference?.id || null : existingReferenceId,
      supplier_product_code: currentCode || (canReuseReference ? reference?.supplier_product_code_original || '' : ''),
      supplier_product_name: currentName || (canReuseReference ? reference?.supplier_product_name || product.name : product.name),
      supplier_ean: currentEan || (canReuseReference ? reference?.supplier_ean || '' : ''),
      purchase_unit: canReuseReference ? reference?.purchase_unit || line.purchase_unit || 'buc' : line.purchase_unit,
      stock_unit: canReuseReference ? reference?.stock_unit || line.stock_unit || 'buc' : line.stock_unit,
      conversion_factor: canReuseReference ? reference?.conversion_factor || line.conversion_factor || '1' : line.conversion_factor,
      resolution_status: canReuseReference ? (reference?.supplier_product_code_original ? 'matched_code' : 'matched_name') : 'matched_manual',
    });
  };

  const addSupplier = async () => {
    if (!token || !newSupplier?.name.trim()) return;
    setSaving(true);
    try {
      if (newSupplier.cui.trim()) {
        const duplicate = await shopApi.checkSupplierCui(token, newSupplier.cui);
        if (duplicate.supplier) {
          patchEditor({ supplier_id: duplicate.supplier.id, supplier_name: duplicate.supplier.name });
          setNewSupplier(null);
          setSupplierPicker(false);
          return;
        }
      }
      const supplier = await shopApi.createSupplier(token, {
        name: newSupplier.name.trim(), cui: newSupplier.cui.trim(), contact_person: '', email: '', phone: '', website: '',
        registration_number: '', address: '', notes: '', is_active: true,
      });
      setSuppliers((current) => [supplier, ...current]);
      patchEditor({ supplier_id: supplier.id, supplier_name: supplier.name });
      setNewSupplier(null);
      setSupplierPicker(false);
    } catch (error) {
      Alert.alert('Furnizorul nu s-a salvat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally {
      setSaving(false);
    }
  };

  const importDocuments = async () => {
    if (!token || !editor || (editor.status !== 'draft' && !correctionOriginal)) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'text/xml', 'image/jpeg', 'image/png', 'image/webp'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const staged: PendingNirAttachment[] = [];
    for (const asset of result.assets) {
      if (asset.size && asset.size > 15 * 1024 * 1024) { Alert.alert('Fișier prea mare', `${asset.name} depășește limita de 15 MB.`); continue; }
      staged.push({ key: `${asset.uri}-${asset.name}`, name: asset.name || `document-${Date.now()}`, mimeType: asset.mimeType || 'application/octet-stream', uri: asset.uri, size: asset.size });
    }
    setPendingAttachments((current) => [...current, ...staged.filter((item) => !current.some((existing) => existing.key === item.key))]);
  };

  const importPhotos = async (source: 'camera' | 'gallery') => {
    if (!token || !editor || (editor.status !== 'draft' && !correctionOriginal)) return;
    const permission = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 8, quality: 0.9, base64: true });
    if (result.canceled) return;
    const staged = result.assets.map((asset, index): PendingNirAttachment => ({ key: `${asset.uri}-${index}`, name: asset.fileName || `factura-${Date.now()}-${index + 1}.jpg`, mimeType: asset.mimeType || 'image/jpeg', uri: asset.uri, size: asset.fileSize, base64: asset.base64 }));
    setPendingAttachments((current) => [...current, ...staged.filter((item) => !current.some((existing) => existing.key === item.key))]);
  };

  const chooseImportSource = () => Alert.alert('Importă factura', 'Alege sursa documentului.', [
    { text: 'Cameră', onPress: () => void importPhotos('camera') },
    { text: 'Galerie', onPress: () => void importPhotos('gallery') },
    { text: 'PDF / XLSX / XML', onPress: () => void importDocuments() },
    { text: 'Renunță', style: 'cancel' },
  ]);

  const importStornoDocuments = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/xml', 'text/xml', 'image/jpeg', 'image/png', 'image/webp'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const staged: PendingNirAttachment[] = [];
    for (const asset of result.assets) {
      if (asset.size && asset.size > 15 * 1024 * 1024) { Alert.alert('Fișier prea mare', `${asset.name} depășește limita de 15 MB.`); continue; }
      staged.push({ key: `${asset.uri}-${asset.name}`, name: asset.name || `document-storno-${Date.now()}`, mimeType: asset.mimeType || 'application/octet-stream', uri: asset.uri, size: asset.size });
    }
    setStornoAttachments((current) => [...current, ...staged.filter((item) => !current.some((existing) => existing.key === item.key))]);
  };

  const uploadStornoAttachments = async (documentId: string) => {
    if (!token) return;
    for (const pending of stornoAttachments) {
      const contentBase64 = pending.base64 || await FileSystem.readAsStringAsync(pending.uri, { encoding: FileSystem.EncodingType.Base64 });
      const attachment = await shopApi.uploadNirAttachment(token, documentId, { file_name: pending.name, mime_type: pending.mimeType, content_base64: contentBase64 });
      await shopApi.extractNirAttachment(token, documentId, attachment.id);
      setStornoAttachments((current) => current.filter((item) => item.key !== pending.key));
    }
  };

  const finalizeConfirmation = async (saved: ShopNirDocument) => {
    if (!token) return;
    const correcting = Boolean(saved.nir_number);
    setSaving(true);
    try {
      const key = `${saved.id}-${saved.row_version}-${Date.now()}`;
      const confirmed = await shopApi.confirmNir(token, saved.id, saved.row_version, key);
      setEditor(confirmed);
      await loadRegistry(page);
      Alert.alert(correcting ? 'NIR corectat' : 'NIR confirmat', correcting ? `${confirmed.nir_number} a fost corectat, iar stocul contabil a fost recalculat.` : `${confirmed.nir_number} a actualizat stocul contabil.`);
    } catch (error) {
      Alert.alert('Confirmarea a eșuat', error instanceof Error ? error.message : 'Nicio modificare parțială nu a fost păstrată.');
    } finally {
      setSaving(false);
    }
  };

  const restoreConfirmedNir = async (original: ShopNirDocument) => {
    if (!token) throw new Error('Sesiunea nu mai este activă.');
    let current = await shopApi.getNir(token, original.id);
    if (current.status === 'confirmed') return current;
    if (current.status !== 'draft') throw new Error('NIR-ul nu mai poate fi readus automat la versiunea confirmată.');
    current = await shopApi.updateNir(token, original.id, nirDraftPayload({ ...original, row_version: current.row_version }));
    const restoreKey = `${original.id}-restore-${current.row_version}-${Date.now()}`;
    return shopApi.confirmNir(token, original.id, current.row_version, restoreKey);
  };

  const keepLocalCorrectionAfterRestore = (modified: ShopNirDocument, restored: ShopNirDocument) => {
    setCorrectionOriginal(cloneNir(restored));
    setEditor({
      ...modified,
      status: 'confirmed',
      row_version: restored.row_version,
      confirmed_at: restored.confirmed_at,
      confirmed_by: restored.confirmed_by,
      subtotal_ron: restored.subtotal_ron,
      vat_total_ron: restored.vat_total_ron,
      grand_total_ron: restored.grand_total_ron,
      attachments: restored.attachments || modified.attachments || [],
    });
  };

  const confirmWarnings = (warnings: string[]) => new Promise<boolean>((resolve) => {
    Alert.alert('Verificarea NIR-ului', warnings.join('\n'), [
      { text: 'Revizuiește', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Aplică totuși', onPress: () => resolve(true) },
    ], { cancelable: false });
  });

  const commitCorrection = async () => {
    if (!token || !editor || !correctionOriginal || saving) return;
    const original = cloneNir(correctionOriginal);
    const modified = cloneNir(editor);
    let serverReopened = false;
    setSaving(true);
    try {
      const reopened = await shopApi.reopenNir(token, original.id, original.row_version);
      serverReopened = true;
      let saved = await shopApi.updateNir(token, original.id, nirDraftPayload({
        ...modified,
        status: 'draft',
        row_version: reopened.row_version,
        confirmed_at: null,
        confirmed_by: null,
      }));
      const validation = await shopApi.validateNir(token, saved.id);
      if (!validation.valid) {
        const restored = await restoreConfirmedNir(original);
        keepLocalCorrectionAfterRestore(modified, restored);
        Alert.alert('NIR-ul nu poate fi corectat', validation.errors.join('\n'));
        return;
      }
      if (validation.warnings?.length && !(await confirmWarnings(validation.warnings))) {
        const restored = await restoreConfirmedNir(original);
        keepLocalCorrectionAfterRestore(modified, restored);
        return;
      }
      saved = await uploadPendingAttachments(saved);
      const key = `${saved.id}-correction-${saved.row_version}-${Date.now()}`;
      const confirmed = await shopApi.confirmNir(token, saved.id, saved.row_version, key);
      setCorrectionOriginal(null);
      setPendingAttachments([]);
      setEditor(confirmed);
      syncedDraftSignature.current = '';
      await loadRegistry(page);
      Alert.alert('NIR corectat', `${confirmed.nir_number} a fost corectat, iar stocul contabil a fost recalculat.`);
    } catch (error) {
      if (serverReopened) {
        try {
          const restored = await restoreConfirmedNir(original);
          keepLocalCorrectionAfterRestore(modified, restored);
        } catch (restoreError) {
          Alert.alert('Corectarea necesită verificare', `Corectarea a eșuat, iar versiunea confirmată nu a putut fi restaurată automat. ${restoreError instanceof Error ? restoreError.message : ''}`.trim());
          return;
        }
      }
      Alert.alert('Corectarea a eșuat', error instanceof Error ? error.message : 'NIR-ul a rămas în versiunea confirmată inițială.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
    if (correctionOriginal) {
      await commitCorrection();
      return;
    }
    if (!token || !editor || editor.status !== 'draft' || saving) return;
    setSaving(true);
    try {
      let saved = isLocalNir(editor)
        ? await shopApi.createNir(token, nirDraftPayload(editor))
        : await shopApi.updateNir(token, editor.id, nirDraftPayload(editor));
      saved = await uploadPendingAttachments(saved);
      const validation = await shopApi.validateNir(token, saved.id);
      if (!validation.valid) {
        setEditor(saved);
        Alert.alert('NIR-ul nu poate fi confirmat', validation.errors.join('\n'));
        return;
      }
      if (validation.warnings?.length) {
        setEditor(saved);
        Alert.alert('Verificarea NIR-ului', validation.warnings.join('\n'), [
          { text: 'Revizuiește', style: 'cancel' },
          { text: 'Confirmă în continuare', onPress: () => void finalizeConfirmation(saved) },
        ]);
        return;
      }
      await finalizeConfirmation(saved);
    } catch (error) {
      Alert.alert('Confirmarea a eșuat', error instanceof Error ? error.message : 'Nicio modificare parțială nu a fost păstrată.');
    } finally {
      setSaving(false);
    }
  };

  const reopenForCorrection = () => {
    if (!token || !editor || editor.status !== 'confirmed' || isNirCorrectionLocked(editor) || saving) return;
    Alert.alert(
      'Editezi acest NIR?',
      'Poți modifica orice câmp. NIR-ul rămâne confirmat și stocul nu se schimbă până când apeși „Corectează NIR”.',
      [
        { text: 'Renunță', style: 'cancel' },
        { text: 'Da, editează NIR-ul', onPress: () => {
          setCorrectionOriginal(cloneNir(editor));
          setPendingAttachments([]);
          setEditor(cloneNir(editor));
          setDetailsTab('lines');
          setDetailRows([]);
          Alert.alert('Editarea este activă', 'Poți modifica orice informație. NIR-ul rămâne confirmat până apeși „Corectează NIR”.');
        } },
      ],
    );
  };

  const openReverseDialog = () => {
    if (!editor || editor.status !== 'confirmed' || editor.can_storno === false || isNirStornoActionLocked(editor) || !can('NIR_REVERSE') || reversing) return;
    const lines = stornoCandidateLines(editor);
    setReverseSelection(Object.fromEntries(lines.map((line) => [String(line.id), stornoLineQuantity(line).value])));
    setReverseReason('');
    setReverseReasonTouched(false);
    setStornoInvoice({
      series: String(editor.supplier_invoice_series || ''),
      number: suggestNextInvoiceNumber(editor.supplier_invoice_number),
      date: localToday(),
    });
    setStornoInvoiceTouched(false);
    setStornoAttachments([]);
    setReverseSelectionError(lines.length ? '' : 'Acest NIR nu are poziții disponibile pentru stornare.');
    setReverseDialog(true);
  };

  const reverseDocument = async () => {
    const reason = reverseReason.trim();
    setReverseReasonTouched(true);
    setStornoInvoiceTouched(true);
    if (!token || !editor || editor.status !== 'confirmed' || editor.can_storno === false || isNirStornoActionLocked(editor) || reversing) return;
    const supplierInvoiceNumber = stornoInvoice.number.trim();
    const supplierInvoiceDate = stornoInvoice.date.trim();
    const selectedLines = stornoCandidateLines(editor).filter((line) => Object.prototype.hasOwnProperty.call(reverseSelection, String(line.id)));
    if (!reason || !supplierInvoiceNumber || !isValidIsoDate(supplierInvoiceDate)) return;
    if (!selectedLines.length) {
      setReverseSelectionError('Selectează cel puțin o poziție din NIR.');
      return;
    }
    const lines: { line_id: string; quantity: string }[] = [];
    for (const line of selectedLines) {
      const lineId = String(line.id || '');
      const maximum = stornoLineQuantity(line).numeric;
      const quantity = Number(String(reverseSelection[lineId] || '').replace(',', '.'));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        setReverseSelectionError(`Completează o cantitate mai mare decât zero pentru „${line.product_name || line.supplier_product_name || `poziția ${line.line_number || ''}`}”.`);
        return;
      }
      if (quantity > maximum + 0.00005) {
        setReverseSelectionError(`Cantitatea pentru „${line.product_name || line.supplier_product_name || `poziția ${line.line_number || ''}`}” nu poate depăși ${movementQuantity(maximum)} ${line.purchase_unit || 'buc'}.`);
        return;
      }
      lines.push({ line_id: lineId, quantity: String(quantity) });
    }
    setReverseSelectionError('');
    setReversing(true);
    try {
      const result = await shopApi.reverseNir(token, editor.id, editor.row_version, reason, lines, {
        supplier_invoice_series: stornoInvoice.series.trim(),
        supplier_invoice_number: supplierInvoiceNumber,
        supplier_invoice_date: supplierInvoiceDate,
      });
      let attachmentWarning = '';
      if (stornoAttachments.length) {
        try { await uploadStornoAttachments(result.reversal.id); }
        catch (uploadError) { attachmentWarning = `\n\nStornarea a fost creată, dar documentele nu s-au încărcat: ${uploadError instanceof Error ? uploadError.message : 'eroare necunoscută'}`; }
      }
      setEditor(result.original);
      setDetailsTab('lines');
      setDetailRows([]);
      setReverseDialog(false);
      setReverseReason('');
      setReverseReasonTouched(false);
      setReverseSelection({});
      setStornoInvoiceTouched(false);
      setStornoAttachments([]);
      await loadRegistry(page);
      setStornoNotice({
        title: 'Stornare înregistrată',
        message: `${lines.length === availableStornoLines.length ? 'Toate pozițiile selectate au fost stornate' : `${lines.length} ${lines.length === 1 ? 'poziție a fost stornată' : 'poziții au fost stornate'}`} prin documentul ${result.reversal.nir_number || result.reversal.temporary_number}.${attachmentWarning}`,
      });
    } catch (error) {
      setReverseSelectionError(error instanceof Error ? error.message : 'Stornarea nu a putut fi înregistrată. Încearcă din nou.');
    } finally {
      setReversing(false);
    }
  };

  const loadDetailTab = async (tab: 'lines' | 'movements') => {
    if (!token || !editor) return;
    setDetailsTab(tab);
    if (tab === 'lines') { setDetailRows([]); return; }
    setSaving(true);
    try {
      setDetailRows(await shopApi.getNirMovements(token, editor.id));
    } finally { setSaving(false); }
  };

  const exportDocument = async (format: 'pdf' | 'xlsx') => {
    if (!token || !editor) return;
    setSaving(true);
    try {
      const file = await shopApi.exportNir(token, editor.id, format);
      const uri = `${FileSystem.cacheDirectory}${file.file_name}`;
      await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
      await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: `Exportă ${editor.nir_number || editor.temporary_number}` });
    } catch (error) {
      Alert.alert('Exportul a eșuat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setSaving(false); }
  };

  const shareDownloadedFile = async (file: { file_name: string; mime_type: string; content_base64: string }, title: string) => {
    const safeName = file.file_name.replace(/[\\/:*?"<>|]/g, '-');
    const uri = `${FileSystem.cacheDirectory}${safeName}`;
    await FileSystem.writeAsStringAsync(uri, file.content_base64, { encoding: FileSystem.EncodingType.Base64 });
    await Sharing.shareAsync(uri, { mimeType: file.mime_type, dialogTitle: title });
  };

  const startExportProgress = (estimate: Partial<{ estimated_seconds: number; document_count: number; line_count: number; attachment_count: number; bundle_type: 'registry' | 'complete' }>, title: string) => {
    if (exportProgressTimer.current) clearInterval(exportProgressTimer.current);
    const startedAt = Date.now();
    const estimatedSeconds = Math.max(1, Number(estimate.estimated_seconds) || 3);
    const base = {
      title,
      detail: estimate.bundle_type === 'registry' ? 'Construim registrul Excel optimizat…' : 'Generăm documentele și împachetăm arhiva ZIP…',
      documents: Number(estimate.document_count || 0),
      lines: Number(estimate.line_count || 0),
      attachments: Number(estimate.attachment_count || 0),
    };
    setExportProgress({ ...base, percent: 2, etaSeconds: estimatedSeconds });
    exportProgressTimer.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      const adaptiveTotal = Math.max(estimatedSeconds, elapsed / 0.9);
      setExportProgress({ ...base, percent: Math.min(94, Math.max(2, Math.round(2 + (elapsed / adaptiveTotal) * 92))), etaSeconds: Math.max(1, adaptiveTotal - elapsed) });
    }, 250);
  };

  const finishExportProgress = async (success: boolean) => {
    if (exportProgressTimer.current) clearInterval(exportProgressTimer.current);
    exportProgressTimer.current = null;
    if (!success) { setExportProgress(null); return; }
    setExportProgress((current) => current ? { ...current, percent: 100, etaSeconds: 0, detail: 'Export finalizat. Descărcarea pornește acum.' } : current);
    await new Promise<void>((resolve) => setTimeout(resolve, 320));
    setExportProgress(null);
  };

  const downloadNirBundle = async () => {
    if (!token || !editor || bundleDownloading) return;
    setBundleDownloading(true);
    try {
      startExportProgress({ document_count: 1, line_count: editor.lines?.length || 0, attachment_count: editor.attachments?.length || 0, estimated_seconds: Math.max(2, 1.5 + (editor.lines?.length || 0) * 0.1), bundle_type: 'complete' }, `Pregătim ${editor.nir_number || editor.temporary_number || 'NIR-ul'}`);
      const file = await shopApi.downloadNirBundle(token, editor.id);
      await finishExportProgress(true);
      await shareDownloadedFile(file, `Descarcă toate fișierele ${editor.nir_number || editor.temporary_number}`);
    } catch (error) {
      await finishExportProgress(false);
      Alert.alert('Arhiva NIR nu s-a descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setBundleDownloading(false); }
  };

  const downloadNirRegistry = async () => {
    if (!token || registryDownloading) return;
    const range = nirRegistryPeriodRange(registryDownloadPeriod, registryDownloadFrom, registryDownloadTo);
    if (registryDownloadPeriod === 'custom' && (!isValidIsoDate(range.from) || !isValidIsoDate(range.to) || range.from > range.to)) {
      Alert.alert('Perioadă incompletă', 'Alege o dată de început și o dată de sfârșit valide.');
      return;
    }
    setRegistryDownloading(true);
    try {
      const complete = registryDownloadContent === 'complete';
      setRegistryDownloadVisible(false);
      startExportProgress({ estimated_seconds: complete ? 12 : 2, bundle_type: complete ? 'complete' : 'registry' }, complete ? 'Pregătim arhiva completă' : 'Pregătim registrul Excel');
      try {
        const estimate = await shopApi.getNirExportEstimate(token, range.from, range.to, complete);
        startExportProgress(estimate, complete ? 'Pregătim arhiva completă' : 'Pregătim registrul Excel');
      } catch {
        // Păstrăm estimarea de rezervă pentru compatibilitate cu un API încă neactualizat.
      }
      const file = await shopApi.downloadNirRegistryBundle(token, range.from, range.to, complete);
      await finishExportProgress(true);
      await shareDownloadedFile(file, complete ? 'Descarcă registrul și toate NIR-urile' : 'Descarcă registrul NIR');
    } catch (error) {
      await finishExportProgress(false);
      Alert.alert('Registrul nu s-a descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setRegistryDownloading(false); }
  };

  const shareLegacyAttachment = async (attachment: ShopNirAttachment) => {
    const remoteUrl = legacyNirAttachmentUrl(attachment);
    if (!remoteUrl) throw new Error('Adresa documentului salvat nu poate fi reconstruită.');
    const safeName = attachment.original_name.replace(/[\\/:*?"<>|]/g, '-');
    const localUri = `${FileSystem.cacheDirectory}${safeName}`;
    const downloaded = await FileSystem.downloadAsync(remoteUrl, localUri);
    if (downloaded.status < 200 || downloaded.status >= 300) throw new Error('Documentul salvat nu mai este disponibil pe server.');
    await Sharing.shareAsync(downloaded.uri, { mimeType: attachment.mime_type, dialogTitle: `Descarcă ${attachment.original_name}` });
  };

  const downloadAttachment = async (attachmentId: string) => {
    if (!token || !editor || attachmentDownload) return;
    setAttachmentDownload(attachmentId);
    try {
      const file = await shopApi.downloadNirAttachment(token, editor.id, attachmentId);
      await shareDownloadedFile(file, `Descarcă ${file.file_name}`);
    } catch (error) {
      const attachment = editor.attachments?.find((item) => item.id === attachmentId);
      if (attachment && isUnknownShopAction(error)) {
        try { await shareLegacyAttachment(attachment); }
        catch (legacyError) { Alert.alert('Documentul nu s-a descărcat', legacyError instanceof Error ? legacyError.message : 'Încearcă din nou.'); }
      } else Alert.alert('Documentul nu s-a descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setAttachmentDownload(null); }
  };

  const downloadAllAttachments = async () => {
    if (!token || !editor || attachmentDownload || !editor.attachments?.length) return;
    setAttachmentDownload('all');
    try {
      const file = await shopApi.downloadAllNirAttachments(token, editor.id);
      await shareDownloadedFile(file, `Descarcă toate documentele ${editor.nir_number || editor.temporary_number}`);
    } catch (error) {
      if (isUnknownShopAction(error)) {
        try {
          for (const attachment of editor.attachments) await shareLegacyAttachment(attachment);
        } catch (legacyError) { Alert.alert('Documentele nu s-au descărcat', legacyError instanceof Error ? legacyError.message : 'Încearcă din nou.'); }
      } else Alert.alert('Documentele nu s-au descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setAttachmentDownload(null); }
  };

  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => `${supplier.name} ${supplier.cui || ''}`.toLowerCase().includes(supplierSearch.toLowerCase())), [supplierSearch, suppliers]);
  const filteredCurrencies = useMemo(() => { const query = currencySearch.trim().toLowerCase(); return orderedCurrencies.filter((currency) => !query || `${currency} ${currencyName(currency)}`.toLowerCase().includes(query)); }, [currencySearch]);
  const correctionEditing = Boolean(correctionOriginal);
  const correctionActionsLocked = isNirCorrectionLocked(editor);
  const stornoActionLocked = isNirStornoActionLocked(editor);
  const quantitySummary = (editor?.lines || []).reduce((summary, line) => ({
    invoiced: summary.invoiced + Number(line.invoiced_quantity || 0), received: summary.received + Number(line.received_quantity || 0),
    accepted: summary.accepted + Number(line.accepted_quantity || 0),
    stock: summary.stock + (editor?.status === 'draft' || correctionEditing ? localLineTotals(line, editor?.exchange_rate || '1').stockQuantity : Number(line.stock_quantity || 0)),
  }), { invoiced: 0, received: 0, accepted: 0, stock: 0 });
  const liveTotals = (editor?.lines || []).map((line) => localLineTotals(line, editor?.exchange_rate || '1')).reduce((summary, line) => ({ netRon: summary.netRon + line.netRon, vatRon: summary.vatRon + line.vatRon, totalRon: summary.totalRon + line.totalRon }), { netRon: 0, vatRon: 0, totalRon: 0 });
  const movementSummary = detailRows.reduce((summary, row) => {
    const delta = Number(row.accounting_quantity_delta ?? row.quantity_delta ?? 0);
    return { entries: summary.entries + (delta > 0 ? delta : 0), exits: summary.exits + (delta < 0 ? Math.abs(delta) : 0), net: summary.net + delta };
  }, { entries: 0, exits: 0, net: 0 });
  const availableStornoLines = stornoCandidateLines(editor);
  const selectedStornoLines = availableStornoLines.flatMap((line) => {
    const lineId = String(line.id || '');
    const quantity = String(reverseSelection[lineId] || '').trim().replace(',', '.');
    return quantity ? [{ line_id: lineId, quantity }] : [];
  });
  const allStornoLinesSelected = availableStornoLines.length > 0 && selectedStornoLines.length === availableStornoLines.length;
  const selectedStornoQuantity = selectedStornoLines.reduce((total, item) => total + (Number(item.quantity) || 0), 0);

  if (editor) {
    const editable = !correctionActionsLocked && (editor.status === 'draft' || correctionEditing);
    const currentStatus = nirDisplayStatus(editor);
    return (
      <View style={styles.screen}>
        <View style={styles.editorHeader}>
          <TouchableOpacity style={styles.iconButton} onPress={requestLeaveEditor}><ArrowLeft size={20} color={Colors.textPrimary} /></TouchableOpacity>
          <View style={styles.editorHeaderCopy}><Text style={styles.editorEyebrow}>NOTĂ DE INTRARE RECEPȚIE</Text><Text style={styles.editorTitle}>{editor.nir_number || editor.temporary_number}</Text></View>
          <View style={[styles.statusChip, { backgroundColor: `${currentStatus.color}18`, borderColor: `${currentStatus.color}55` }]}><currentStatus.Icon size={14} color={currentStatus.color} /><Text style={[styles.statusChipText, { color: currentStatus.color }]}>{currentStatus.label}</Text></View>
        </View>
        <ScrollView contentContainerStyle={[styles.editorContent, { paddingBottom: 166 + insets.bottom }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <NirFlowGuide />
          <Reveal delay={20}><View style={styles.editorStepCard}>
            <SectionTitle icon={<Building2 size={18} color="#5EEAD4" />} index="01" title="Alege furnizorul" subtitle="Identifică firma și factura primită" />
            <View style={styles.stepHint}><Text style={styles.stepHintNumber}>1</Text><Text style={styles.stepHintText}>Selectează furnizorul, apoi completează seria, numărul și data facturii.</Text></View>
            <TouchableOpacity style={styles.selector} disabled={!editable} onPress={() => setSupplierPicker(true)}><View><Text style={styles.label}>DENUMIRE FURNIZOR *</Text><Text style={editor.supplier_id ? styles.selectorValue : styles.placeholder}>{editor.supplier_name || 'Selectează sau creează furnizor'}</Text></View>{editable && <ChevronRight size={19} color={Colors.textMuted} />}</TouchableOpacity>
            <View style={styles.grid2}><Field label="SERIE FACTURĂ" value={editor.supplier_invoice_series || ''} editable={editable} onChangeText={(value) => patchEditor({ supplier_invoice_series: value })} placeholder="Ex: GT" /><Field label="NUMĂR FACTURĂ *" value={editor.supplier_invoice_number || ''} editable={editable} onChangeText={(value) => patchEditor({ supplier_invoice_number: value })} placeholder="Ex: 1048" /></View>
            <Field label="DATA FACTURII *" value={editor.supplier_invoice_date || ''} editable={editable} onChangeText={(value) => patchEditor({ supplier_invoice_date: value, ...(editor.currency === 'RON' ? { exchange_rate_date: value } : {}) })} placeholder="AAAA-LL-ZZ" icon={<CalendarDays size={16} color={Colors.textMuted} />} />
          </View></Reveal>

          <Reveal delay={70}><View style={styles.editorStepCard}>
            <SectionTitle icon={<CalendarDays size={18} color="#38BDF8" />} index="02" title="Stabilește recepția" subtitle="Alege data, ora și gestiunea în care intră marfa" />
            <View style={styles.stepHint}><Text style={styles.stepHintNumber}>2</Text><Text style={styles.stepHintText}>Data și ora păstrează ordinea exactă a recepțiilor.</Text></View>
            <View style={styles.dateTimeCard}><DateTimeSelector label="DATA ȘI ORA NIR *" date={editor.nir_date} time={editor.nir_time} color="#38BDF8" disabled={!editable} onPress={() => openDateTimePicker('nir')} /><DateTimeSelector label="DATA ȘI ORA RECEPȚIEI *" date={editor.reception_date} time={editor.reception_time} color="#5EEAD4" disabled={!editable} onPress={() => openDateTimePicker('reception')} /></View>
            <TouchableOpacity style={styles.selector} disabled={!editable} activeOpacity={0.78} onPress={() => setWarehousePicker(true)}><View><Text style={styles.label}>GESTIUNE *</Text><Text style={styles.selectorValue}>{warehouses.find((item) => item.id === editor.warehouse_id)?.name || editor.warehouse_name || 'Selectează gestiunea'}</Text></View>{editable ? <ChevronRight size={19} color="#22C55E" /> : <Boxes size={18} color="#22C55E" />}</TouchableOpacity>
          </View></Reveal>

          <Reveal delay={120}><View style={styles.editorStepCard}>
            <SectionTitle icon={<CircleDollarSign size={18} color="#F59E0B" />} index="03" title="Setează moneda" subtitle="Cursul este memorat exact pentru acest NIR" />
            <View style={styles.stepHint}><Text style={styles.stepHintNumber}>3</Text><Text style={styles.stepHintText}>Alege moneda. Prețul rămâne în valuta facturii; totalurile și costul contabil se calculează în lei.</Text></View>
            <TouchableOpacity disabled={!editable} activeOpacity={0.78} style={styles.currencySelector} onPress={() => setCurrencyPicker(true)}><View style={styles.currencySelectorIcon}><CircleDollarSign size={20} color="#F59E0B" /></View><View style={{ flex: 1 }}><Text style={styles.currencySelectorLabel}>MONEDA FACTURII</Text><View style={styles.currencySelectorValue}><Text style={styles.currencySelectorCode}>{editor.currency || 'RON'}</Text><Text numberOfLines={1} style={styles.currencySelectorName}>{currencyName(editor.currency || 'RON')}</Text></View></View><ChevronRight size={19} color={Colors.textMuted} /></TouchableOpacity>
            <View style={styles.grid2}><Field label={`CURS ${editor.currency}/RON *`} value={editor.exchange_rate || ''} editable={editable && editor.currency !== 'RON'} onChangeText={(value) => patchEditor({ exchange_rate: value })} placeholder={rateLoading ? 'Se preia de la BNR...' : 'Ex: 4.9735'} keyboardType="decimal-pad" /><Field label="DATA CURSULUI BNR" value={editor.exchange_rate_date || ''} editable={editable && editor.currency !== 'RON'} onChangeText={(value) => patchEditor({ exchange_rate_date: value })} placeholder="AAAA-LL-ZZ" /></View>
            {editor.currency === 'RON' ? <View style={styles.bnrStatus}><CheckCircle2 size={15} color="#5EEAA4" /><Text style={styles.bnrStatusText}>Curs fix 1 · data cursului este data facturii</Text></View> : <TouchableOpacity disabled={!editable || rateLoading} style={styles.bnrRefresh} onPress={() => void refreshBnrRate(editor.currency, editor.exchange_rate_date || editor.supplier_invoice_date || editor.nir_date)}>{rateLoading ? <ActivityIndicator color="#38BDF8" /> : <RefreshCw size={16} color="#38BDF8" />}<View style={{ flex: 1 }}><Text style={styles.bnrRefreshTitle}>{rateLoading ? 'Se preia cursul BNR…' : 'Actualizează cursul din BNR'}</Text><Text style={styles.bnrRefreshText}>Pentru data aleasă; câmpurile rămân editabile.</Text></View></TouchableOpacity>}
          </View></Reveal>

          <Reveal delay={170}><View style={[styles.editorStepCard, styles.editorStepCardLines]}>
            <SectionTitle icon={<PackageSearch size={18} color="#A78BFA" />} index="04" title="Adaugă produsele" subtitle="Pentru fiecare poziție urmezi doar trei pași" />
            <View style={styles.lineGuide}><View style={styles.lineGuideLead}><PackageSearch size={17} color="#C4B5FD" /><View><Text style={styles.lineGuideEyebrow}>ORDINEA COMPLETĂRII</Text><Text style={styles.lineGuideLeadText}>Mergi simplu de la stânga la dreapta</Text></View></View><View style={styles.lineGuideTrack}><View style={styles.lineGuideStep}><Text style={styles.lineGuideNumber}>1</Text><View><Text style={styles.lineGuideTitle}>Produs</Text><Text style={styles.lineGuideDetail}>alege articolul</Text></View></View><Text style={styles.lineGuideArrow}>→</Text><View style={styles.lineGuideStep}><Text style={styles.lineGuideNumber}>2</Text><View><Text style={styles.lineGuideTitle}>Cantitate</Text><Text style={styles.lineGuideDetail}>scrie ce ai primit</Text></View></View><Text style={styles.lineGuideArrow}>→</Text><View style={styles.lineGuideStep}><Text style={styles.lineGuideNumber}>3</Text><View><Text style={styles.lineGuideTitle}>Preț</Text><Text style={styles.lineGuideDetail}>completează costul</Text></View></View></View></View>
            <View style={styles.lineList}>{(detailsTab === 'lines' ? editor.lines || [] : []).map((line, index) => <NirLineCard key={line.id || index} line={line} index={index} editable={editable} supplierName={editor.supplier_name || 'Furnizor neselectat'} currency={editor.currency || 'RON'} exchangeRate={editor.exchange_rate || '1'} onPatch={(patch) => patchLine(index, patch)} onSupplierCodeChange={(value) => changeSupplierCode(index, value)} onSupplierNameChange={(value) => changeSupplierName(index, value)} onPickProduct={() => { setProductPickerLine(index); setProductSearch(line.supplier_product_name || ''); }} onRemove={() => setEditor((current) => current ? { ...current, lines: (current.lines || []).filter((_, lineIndex) => lineIndex !== index) } : current)} />)}</View>
            {editable && <TouchableOpacity style={styles.addLine} onPress={() => patchEditor({ lines: [...(editor.lines || []), makeLine()] })}><Plus size={18} color={Colors.orange} /><Text style={styles.addLineText}>Adaugă încă un produs</Text></TouchableOpacity>}
            {editable && <TouchableOpacity style={styles.importButton} onPress={chooseImportSource}><ImagePlus size={18} color="#38BDF8" /><View><Text style={styles.importTitle}>Importă documentul furnizorului</Text><Text style={styles.importText}>Alege-l acum; încărcarea începe doar când apeși Salvează.</Text></View></TouchableOpacity>}
            {!!pendingAttachments.length && <View style={styles.attachmentList}>{pendingAttachments.map((attachment) => <View style={[styles.attachmentCard, styles.attachmentPending]} key={attachment.key}><View style={styles.attachmentIcon}><FileDown size={16} color="#FBBF24" /></View><View style={{ flex: 1 }}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text><Text style={styles.attachmentMeta}>Pregătit local · se încarcă la salvare</Text></View><TouchableOpacity style={styles.attachmentRemove} onPress={() => setPendingAttachments((current) => current.filter((item) => item.key !== attachment.key))}><X size={15} color="#FDA4AF" /></TouchableOpacity></View>)}</View>}
            {!!editor.attachments?.length && <View style={styles.savedAttachments}><View style={styles.attachmentSectionHeader}><View style={{ flex: 1 }}><Text style={styles.attachmentSectionKicker}>DOCUMENTELE FURNIZORULUI</Text><Text style={styles.attachmentSectionTitle}>{editor.attachments.length} {editor.attachments.length === 1 ? 'document salvat' : 'documente salvate'}</Text></View>{!editable && <TouchableOpacity disabled={Boolean(attachmentDownload)} style={[styles.downloadAll, attachmentDownload && styles.downloadDisabled]} onPress={() => void downloadAllAttachments()}>{attachmentDownload === 'all' ? <ActivityIndicator size="small" color="#7DD3FC" /> : <FileDown size={16} color="#7DD3FC" />}<Text style={styles.downloadAllText}>Doar atașamentele</Text></TouchableOpacity>}</View><View style={styles.attachmentList}>{editor.attachments.map((attachment) => <View style={styles.attachmentCard} key={attachment.id}><View style={styles.attachmentIcon}><FileDown size={16} color="#38BDF8" /></View><View style={{ flex: 1 }}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.original_name}</Text><Text style={styles.attachmentMeta}>{attachment.extraction_status} · {Math.max(1, Math.round(attachment.file_size / 1024))} KB</Text></View><TouchableOpacity disabled={Boolean(attachmentDownload)} style={styles.attachmentDownload} onPress={() => void downloadAttachment(attachment.id)}>{attachmentDownload === attachment.id ? <ActivityIndicator size="small" color="#7DD3FC" /> : <FileDown size={16} color="#7DD3FC" />}</TouchableOpacity></View>)}</View></View>}
          </View></Reveal>

          {!editable && <>
            <View style={styles.detailTabs}><Tab label="Poziții" active={detailsTab === 'lines'} onPress={() => void loadDetailTab('lines')} /><Tab label="Mișcări de stoc" active={detailsTab === 'movements'} onPress={() => void loadDetailTab('movements')} /></View>
            {detailsTab === 'movements' && <View style={styles.movementBoard}><View style={styles.movementBoardHeader}><View style={styles.movementBoardIcon}><Boxes size={20} color="#5EEAD4" /></View><View style={{ flex: 1 }}><Text style={styles.movementBoardEyebrow}>JURNAL CONTABIL</Text><Text style={styles.movementBoardTitle}>Traseul stocului</Text><Text style={styles.movementBoardText}>{isNirReversalDocument(editor) ? 'Vezi pozițiile anulate prin acest document de stornare.' : 'Fiecare mișcare produsă de acest NIR, în ordine cronologică.'}</Text></View><View style={styles.movementCount}><Text style={styles.movementCountValue}>{detailRows.length}</Text><Text style={styles.movementCountLabel}>MIȘCĂRI</Text></View></View><View style={styles.movementSummary}><View><Text style={styles.movementSummaryLabel}>INTRĂRI</Text><Text style={[styles.movementSummaryValue, styles.movementPositive]}>+{movementQuantity(movementSummary.entries)}</Text></View><View><Text style={styles.movementSummaryLabel}>IEȘIRI</Text><Text style={[styles.movementSummaryValue, styles.movementNegative]}>−{movementQuantity(movementSummary.exits)}</Text></View><View><Text style={styles.movementSummaryLabel}>EFECT NET</Text><Text style={styles.movementSummaryValue}>{movementSummary.net > 0 ? '+' : ''}{movementQuantity(movementSummary.net)}</Text></View></View>{detailRows.length ? <View style={styles.movementList}>{detailRows.map((row, index) => { const delta = Number(row.accounting_quantity_delta ?? row.quantity_delta ?? 0); const incoming = delta >= 0; return <View style={[styles.movementCard, incoming ? styles.movementCardIn : styles.movementCardOut]} key={String(row.id || index)}><View style={[styles.movementDirection, incoming ? styles.movementDirectionIn : styles.movementDirectionOut]}>{incoming ? <ArrowDownToLine size={18} color="#5EEAA4" /> : <ArrowUpFromLine size={18} color="#FDA4AF" />}</View><View style={styles.movementMain}><View style={styles.movementCardTop}><Text style={[styles.movementType, incoming ? styles.movementPositive : styles.movementNegative]}>{movementLabel(row.movement_type)}</Text><Text style={styles.movementDate}>{movementDate(row.created_at)}</Text></View><Text numberOfLines={2} style={styles.movementProduct}>{row.product_name || `Mișcare ${index + 1}`}</Text><Text numberOfLines={2} style={styles.movementNote}>{row.movement_document_number || row.note || 'Document de stoc'}</Text><View style={styles.movementFacts}><View><Text style={styles.movementFactLabel}>CANTITATE</Text><Text style={[styles.movementFactValue, incoming ? styles.movementPositive : styles.movementNegative]}>{delta > 0 ? '+' : '−'}{movementQuantity(Math.abs(delta))} buc</Text></View><View><Text style={styles.movementFactLabel}>STOC DUPĂ</Text><Text style={styles.movementFactValue}>{movementQuantity(row.accounting_quantity_after ?? row.quantity_after)} buc</Text></View><View><Text style={styles.movementFactLabel}>OPERATOR</Text><Text numberOfLines={1} style={styles.movementFactValue}>{row.created_by || 'Sistem'}</Text></View></View></View></View>; })}</View> : <View style={styles.movementEmpty}><Boxes size={23} color={Colors.textMuted} /><Text style={styles.movementEmptyTitle}>Nu există mișcări de stoc</Text><Text style={styles.movementEmptyText}>Acest document nu a produs încă o intrare sau ieșire contabilă.</Text></View>}</View>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Descarcă toate documentele NIR" disabled={bundleDownloading} style={[styles.bundleDownloadButton, bundleDownloading && styles.downloadDisabled]} onPress={() => void downloadNirBundle()}>{bundleDownloading ? <ActivityIndicator color="#071513" /> : <View style={styles.bundleDownloadIcon}><FileDown size={20} color="#071513" /></View>}<View style={{ flex: 1 }}><Text style={styles.bundleDownloadTitle}>Descarcă toate documentele</Text><Text style={styles.bundleDownloadText}>NIR PDF, NIR Excel și folderul cu documentele furnizorului</Text></View><ChevronRight size={19} color="#0F766E" /></TouchableOpacity>
            <View style={styles.exportRow}><TouchableOpacity style={styles.exportButton} onPress={() => void exportDocument('pdf')}><FileDown size={17} color={Colors.textPrimary} /><Text style={styles.exportText}>Doar PDF</Text></TouchableOpacity><TouchableOpacity style={styles.exportButton} onPress={() => void exportDocument('xlsx')}><FileDown size={17} color={Colors.textPrimary} /><Text style={styles.exportText}>Doar Excel</Text></TouchableOpacity></View>
          </>}

          <Reveal delay={220}><View style={styles.editorStepCard}>
            <SectionTitle icon={<ShieldCheck size={18} color="#22C55E" />} index="05" title="Verifică documentul" subtitle="Controlează cantitățile și totalurile înainte de confirmare" />
            <View style={styles.reviewGuide}><View style={styles.reviewGuideNumber}><Text style={styles.reviewGuideNumberText}>05</Text></View><View style={{ flex: 1 }}><Text style={styles.reviewGuideTitle}>Compară cantitățile, apoi verifică valoarea finală</Text><Text style={styles.reviewGuideText}>Dacă există diferențe, corectează produsul înainte de confirmare.</Text></View><View style={styles.reviewReady}><CheckCircle2 size={13} color="#5EEAA4" /><Text style={styles.reviewReadyText}>GATA</Text></View></View>
            <View style={styles.quantitySummary}>
              <ReviewMetric icon={<FilePlus2 size={18} color="#A78BFA" />} label="FACTURAT" value={quantitySummary.invoiced} hint="pe factură" tone="purple" />
              <ReviewMetric icon={<Boxes size={18} color="#38BDF8" />} label="RECEPȚIONAT" value={quantitySummary.received} hint="numărat" tone="blue" />
              <ReviewMetric icon={<CheckCircle2 size={18} color="#5EEAA4" />} label="ACCEPTAT" value={quantitySummary.accepted} hint="conform" tone="green" />
              <ReviewMetric icon={<PackageSearch size={19} color="#5EEAD4" />} label="INTRĂ ÎN STOC" value={quantitySummary.stock} hint="cantitate finală" tone="teal" wide />
            </View>
            {can('NIR_VIEW_COSTS') && <View style={styles.totalCard}><View style={styles.totalMetric}><View style={[styles.totalMetricIcon, { backgroundColor: '#A78BFA16' }]}><CircleDollarSign size={17} color="#A78BFA" /></View><View><Text style={styles.totalLabel}>FĂRĂ TVA</Text><Text style={styles.totalSub}>{money(editable ? String(liveTotals.netRon) : editor.subtotal_ron)}</Text><Text style={styles.totalHint}>Bază de calcul</Text></View></View><View style={styles.totalMetric}><View style={[styles.totalMetricIcon, { backgroundColor: '#38BDF816' }]}><FilePlus2 size={17} color="#38BDF8" /></View><View><Text style={styles.totalLabel}>TVA</Text><Text style={styles.totalSub}>{money(editable ? String(liveTotals.vatRon) : editor.vat_total_ron)}</Text><Text style={styles.totalHint}>Valoarea taxei</Text></View></View><View style={styles.totalMain}><View><Text style={styles.totalMainLabel}>TOTAL CONTABIL RON</Text><Text style={styles.totalHint}>Valoarea confirmată</Text></View><Text style={styles.totalMainValue}>{money(editable ? String(liveTotals.totalRon) : editor.grand_total_ron)}</Text></View></View>}
            <Field label="OBSERVAȚII" value={editor.notes || ''} editable={editable} onChangeText={(value) => patchEditor({ notes: value })} placeholder="Detalii interne, diferențe sau documente justificative" multiline />
          </View></Reveal>
        </ScrollView>
        {editable && <View style={[styles.stickyActions, { paddingBottom: Math.max(insets.bottom, 10) }]}>{!correctionEditing && can('NIR_EDIT_DRAFT') && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Șterge NIR-ul" style={styles.deleteNirAction} disabled={saving || deleting} onPress={() => setDeleteDialog(true)}><Trash2 size={16} color="#FDA4AF" /><Text style={styles.deleteNirActionText}>Șterge NIR-ul</Text><Text style={styles.deleteNirActionHint}>ciorna și toate datele ei</Text></TouchableOpacity>}{correctionEditing ? <TouchableOpacity style={styles.correctNirAction} disabled={saving || deleting || !can('NIR_CONFIRM')} onPress={() => void confirm()}>{saving ? <ActivityIndicator color="#FBBF24" /> : <ShieldCheck size={19} color="#FBBF24" />}<View style={{ flex: 1 }}><Text style={styles.correctNirActionText}>Corectează NIR</Text><Text style={styles.correctNirActionHint}>Salvează modificările și recalculează stocul</Text></View><ChevronRight size={18} color="#FBBF24" /></TouchableOpacity> : <View style={styles.stickyPrimaryRow}><TouchableOpacity style={styles.secondaryAction} disabled={saving || deleting} onPress={() => void saveDraft()}>{saving ? <ActivityIndicator color={Colors.textPrimary} /> : <><Save size={18} color={Colors.textPrimary} /><Text style={styles.secondaryActionText}>Salvează</Text></>}</TouchableOpacity><TouchableOpacity style={styles.confirmAction} disabled={saving || deleting || !can('NIR_CONFIRM')} onPress={() => void confirm()}><ShieldCheck size={19} color={Colors.white} /><Text style={styles.confirmActionText}>Verifică și confirmă</Text></TouchableOpacity></View>}</View>}
        {!editable && editor.status === 'confirmed' && !stornoActionLocked && ((!correctionActionsLocked && can('NIR_EDIT_DRAFT') && can('NIR_CONFIRM')) || (can('NIR_REVERSE') && editor.can_storno !== false && availableStornoLines.length > 0)) && <View style={[styles.stickyActions, { paddingBottom: Math.max(insets.bottom, 10) }]}>{can('NIR_REVERSE') && editor.can_storno !== false && availableStornoLines.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Stornare factură" style={styles.reverseNirAction} disabled={saving || reversing} onPress={openReverseDialog}><RotateCcw size={18} color="#FDA4AF" /><View style={{ flex: 1 }}><Text style={styles.reverseNirActionText}>Stornare factură</Text><Text style={styles.reverseNirActionHint}>Alege una, mai multe sau toate pozițiile</Text></View></TouchableOpacity>}{!correctionActionsLocked && can('NIR_EDIT_DRAFT') && can('NIR_CONFIRM') && <TouchableOpacity style={styles.correctNirAction} disabled={saving || reversing} onPress={reopenForCorrection}>{saving ? <ActivityIndicator color="#FBBF24" /> : <PencilLine size={19} color="#FBBF24" />}<View style={{ flex: 1 }}><Text style={styles.correctNirActionText}>Editează NIR</Text><Text style={styles.correctNirActionHint}>Deblochează toate câmpurile pentru corectare</Text></View><ChevronRight size={18} color="#FBBF24" /></TouchableOpacity>}</View>}
        {dateTimePicker && <DateTimePicker value={dateTimePicker.value} mode={Platform.OS === 'ios' ? 'datetime' : dateTimePicker.mode} display={Platform.OS === 'ios' ? 'compact' : 'default'} minuteInterval={1} is24Hour onChange={changeDateTimePicker} />}

        <Modal visible={deleteDialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !deleting && setDeleteDialog(false)}><Pressable style={styles.deleteBackdrop} onPress={() => !deleting && setDeleteDialog(false)}><Pressable style={styles.deleteDialog} onPress={(event) => event.stopPropagation()}><View style={styles.deleteDialogAccent} /><View style={styles.deleteDialogIcon}><Trash2 size={27} color="#FDA4AF" /></View><Text style={styles.deleteDialogEyebrow}>ȘTERGERE DEFINITIVĂ</Text><Text style={styles.deleteDialogTitle}>Ștergi această notă de intrare-recepție?</Text><Text style={styles.deleteDialogMessage}>Ești sigur că vrei să ștergi această notă de intrare-recepție marfă?</Text><View style={styles.deleteDialogDocument}><View style={{ flex: 1 }}><Text style={styles.deleteDialogMetaLabel}>DOCUMENT</Text><Text numberOfLines={1} style={styles.deleteDialogMetaValue}>{editor.nir_number || editor.temporary_number || 'NIR nesalvat'}</Text></View><View style={styles.deleteDialogDivider} /><View style={{ flex: 1 }}><Text style={styles.deleteDialogMetaLabel}>FURNIZOR</Text><Text numberOfLines={1} style={styles.deleteDialogMetaValue}>{editor.supplier_name || 'Necompletat'}</Text></View></View><View style={styles.deleteDialogWarning}><AlertTriangle size={18} color="#FBBF24" /><View style={{ flex: 1 }}><Text style={styles.deleteDialogWarningTitle}>Acțiunea nu poate fi anulată</Text><Text style={styles.deleteDialogWarningText}>Pozițiile, documentele atașate și toate datele acestei ciorne vor fi eliminate definitiv.</Text></View></View><TouchableOpacity disabled={deleting} style={styles.deleteDialogCancel} onPress={() => setDeleteDialog(false)}><Text style={styles.deleteDialogCancelText}>Nu, păstrează NIR-ul</Text></TouchableOpacity><TouchableOpacity disabled={deleting} style={styles.deleteDialogConfirm} onPress={() => void deleteNir()}>{deleting ? <ActivityIndicator color="#FFFFFF" /> : <><Trash2 size={17} color="#FFFFFF" /><Text style={styles.deleteDialogConfirmText}>Da, șterge definitiv</Text></>}</TouchableOpacity></Pressable></Pressable></Modal>

        <Modal visible={reverseDialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !reversing && setReverseDialog(false)}>
          <Pressable style={styles.deleteBackdrop} onPress={() => !reversing && setReverseDialog(false)}>
            <Pressable style={[styles.deleteDialog, styles.reverseDialog, styles.stornoDialog, styles.stornoM3Dialog]} onPress={(event) => event.stopPropagation()}>
              <View style={[styles.deleteDialogAccent, styles.reverseDialogAccent]} />
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.stornoDialogContent, styles.stornoM3DialogContent]}>
                <View style={[styles.stornoTitleRow, styles.stornoM3TitleRow]}><View style={[styles.deleteDialogIcon, styles.reverseDialogIcon, styles.stornoTitleIcon, styles.stornoM3TitleIcon]}><RotateCcw size={27} color="#FFB2BC" /></View><View style={{ flex: 1 }}><Text style={[styles.deleteDialogEyebrow, styles.stornoM3Eyebrow]}>STORNARE CONTABILĂ</Text><Text style={[styles.stornoDialogTitle, styles.stornoM3DialogTitle]}>Stornare factură</Text><Text style={[styles.deleteDialogMessage, styles.stornoM3Message]}>Alege exact produsele și cantitățile care trebuie scoase din această recepție.</Text></View></View>
                <View style={[styles.deleteDialogDocument, styles.stornoM3Surface]}><View style={{ flex: 1 }}><Text style={[styles.deleteDialogMetaLabel, styles.stornoM3MetaLabel]}>DOCUMENT</Text><Text numberOfLines={1} style={[styles.deleteDialogMetaValue, styles.stornoM3MetaValue]}>{editor.nir_number || editor.temporary_number || 'NIR'}</Text></View><View style={styles.deleteDialogDivider} /><View style={{ flex: 1 }}><Text style={[styles.deleteDialogMetaLabel, styles.stornoM3MetaLabel]}>FURNIZOR</Text><Text numberOfLines={1} style={[styles.deleteDialogMetaValue, styles.stornoM3MetaValue]}>{editor.supplier_name || 'Necompletat'}</Text></View></View>

                <View style={[styles.stornoOriginalInvoice, styles.stornoM3Surface]}><View style={styles.stornoOriginalInvoiceHead}><View style={[styles.stornoOriginalInvoiceIcon, styles.stornoM3TonalIcon]}><FileDown size={18} color="#FFB2BC" /></View><View><Text style={[styles.stornoOriginalInvoiceEyebrow, styles.stornoM3Eyebrow]}>DOCUMENT DE REFERINȚĂ</Text><Text style={[styles.stornoOriginalInvoiceTitle, styles.stornoM3SectionHeading]}>Factura originală</Text></View></View><View style={[styles.stornoOriginalInvoiceFacts, styles.stornoM3Facts]}><View style={[styles.stornoOriginalInvoiceFact, styles.stornoM3Fact]}><Text style={[styles.stornoOriginalInvoiceLabel, styles.stornoM3MetaLabel]}>SERIE / NUMĂR</Text><Text numberOfLines={1} style={[styles.stornoOriginalInvoiceValue, styles.stornoM3MetaValue]}>{[editor.supplier_invoice_series, editor.supplier_invoice_number].filter(Boolean).join(' / ') || '—'}</Text></View><View style={[styles.stornoOriginalInvoiceFact, styles.stornoM3Fact]}><Text style={[styles.stornoOriginalInvoiceLabel, styles.stornoM3MetaLabel]}>DATA</Text><Text style={[styles.stornoOriginalInvoiceValue, styles.stornoM3MetaValue]}>{editor.supplier_invoice_date || '—'}</Text></View><View style={[styles.stornoOriginalInvoiceFact, styles.stornoM3Fact]}><Text style={[styles.stornoOriginalInvoiceLabel, styles.stornoM3MetaLabel]}>VALOARE</Text><Text style={[styles.stornoOriginalInvoiceValue, styles.stornoOriginalInvoiceAmount, styles.stornoM3Amount]}>{editor.grand_total !== undefined ? money(editor.grand_total, editor.currency || 'RON') : money(editor.grand_total_ron, 'RON')}</Text></View></View></View>

                <View style={styles.stornoM3InvoiceSection}><View style={styles.stornoM3SectionHeader}><View style={styles.stornoM3TonalIcon}><FilePlus2 size={18} color="#FFB2BC" /></View><View style={{ flex: 1 }}><Text style={styles.stornoM3Eyebrow}>FACTURĂ NOUĂ DE STORNO</Text><Text style={styles.stornoM3SectionHeading}>Completează documentul primit de la furnizor</Text></View></View><View style={[styles.stornoInvoiceFields, styles.stornoM3InvoiceFields]}><View style={styles.stornoInvoiceField}><Text style={[styles.reverseReasonLabel, styles.stornoM3FieldLabel]}>SERIE FACTURĂ STORNO (OPȚIONAL)</Text><View style={[styles.stornoInvoiceInputWrap, styles.stornoM3InputWrap]}><TextInput accessibilityLabel="Serie factură storno, opțional" editable={!reversing} value={stornoInvoice.series} onChangeText={(series) => setStornoInvoice((current) => ({ ...current, series }))} placeholder="Poate rămâne goală" placeholderTextColor={Colors.textMuted} selectionColor="#FFB2BC" cursorColor="#FFB2BC" autoCorrect={false} style={[styles.stornoInvoiceInput, styles.stornoM3Input]} /></View><Text style={[styles.stornoInvoiceHint, styles.stornoM3Hint]}>Am completat seria facturii originale; o poți modifica sau șterge.</Text></View><View style={styles.stornoInvoiceField}><Text style={[styles.reverseReasonLabel, styles.stornoM3FieldLabel]}>NUMĂR FACTURĂ STORNO *</Text><View style={[styles.stornoInvoiceInputWrap, styles.stornoM3InputWrap, stornoInvoiceTouched && !stornoInvoice.number.trim() && styles.reverseReasonInputInvalid]}><TextInput accessibilityLabel="Număr factură storno" editable={!reversing} value={stornoInvoice.number} onChangeText={(number) => setStornoInvoice((current) => ({ ...current, number }))} placeholder="Completează numărul documentului" placeholderTextColor={Colors.textMuted} selectionColor="#FFB2BC" cursorColor="#FFB2BC" autoCorrect={false} style={[styles.stornoInvoiceInput, styles.stornoM3Input]} /></View>{stornoInvoiceTouched && !stornoInvoice.number.trim() && <Text style={styles.reverseReasonError}>Numărul facturii storno este obligatoriu.</Text>}</View><View style={styles.stornoInvoiceField}><Text style={[styles.reverseReasonLabel, styles.stornoM3FieldLabel]}>DATA FACTURII STORNO *</Text><View style={[styles.stornoInvoiceInputWrap, styles.stornoM3InputWrap, stornoInvoiceTouched && !isValidIsoDate(stornoInvoice.date.trim()) && styles.reverseReasonInputInvalid]}><CalendarDays size={18} color="#FFB2BC" /><TextInput accessibilityLabel="Data facturii storno" editable={!reversing} value={stornoInvoice.date} onChangeText={(date) => setStornoInvoice((current) => ({ ...current, date }))} placeholder="AAAA-LL-ZZ" placeholderTextColor={Colors.textMuted} selectionColor="#FFB2BC" cursorColor="#FFB2BC" autoCorrect={false} maxLength={10} style={[styles.stornoInvoiceInput, styles.stornoM3Input]} /></View>{stornoInvoiceTouched && !isValidIsoDate(stornoInvoice.date.trim()) && <Text style={styles.reverseReasonError}>Scrie o dată validă în formatul AAAA-LL-ZZ.</Text>}</View></View></View>

                <View style={[styles.stornoDocuments, styles.stornoM3Surface]}><View style={styles.attachmentSectionHeader}><View style={{ flex: 1 }}><Text style={[styles.stornoSectionEyebrow, styles.stornoM3Eyebrow]}>DOCUMENTELE FACTURII STORNO</Text><Text style={[styles.stornoSectionTitle, styles.stornoM3SectionTitle]}>{stornoAttachments.length ? `${stornoAttachments.length} ${stornoAttachments.length === 1 ? 'document pregătit' : 'documente pregătite'}` : 'PDF, imagini, Excel sau XML'}</Text></View><TouchableOpacity disabled={reversing} style={[styles.stornoDocumentButton, styles.stornoM3Pill]} onPress={() => void importStornoDocuments()}><FilePlus2 size={17} color="#FFB2BC" /><Text style={[styles.stornoDocumentButtonText, styles.stornoM3PillText]}>Alege</Text></TouchableOpacity></View>{!!stornoAttachments.length && <View style={styles.attachmentList}>{stornoAttachments.map((attachment) => <View style={[styles.attachmentCard, styles.attachmentPending, styles.stornoM3Attachment]} key={attachment.key}><View style={styles.attachmentIcon}><FileDown size={16} color="#FFB2BC" /></View><View style={{ flex: 1 }}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text><Text style={styles.attachmentMeta}>Se încarcă pe NIR-ul STORNO la confirmare</Text></View><TouchableOpacity disabled={reversing} style={styles.attachmentRemove} onPress={() => setStornoAttachments((current) => current.filter((item) => item.key !== attachment.key))}><X size={15} color="#FFB2BC" /></TouchableOpacity></View>)}</View>}</View>

                <View style={[styles.stornoSelectionHead, styles.stornoM3SelectionHead]}><View style={{ flex: 1 }}><Text style={[styles.stornoSectionEyebrow, styles.stornoM3Eyebrow]}>POZIȚIILE DIN NIR</Text><Text style={[styles.stornoSectionTitle, styles.stornoM3SectionTitle]}>{selectedStornoLines.length} din {availableStornoLines.length} selectate · {movementQuantity(selectedStornoQuantity)} unități</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel={allStornoLinesSelected ? 'Deselectează toate produsele' : 'Selectează toate produsele'} disabled={reversing || !availableStornoLines.length} style={[styles.stornoAllButton, styles.stornoM3Pill, !availableStornoLines.length && styles.downloadDisabled]} onPress={() => { setReverseSelection(allStornoLinesSelected ? {} : Object.fromEntries(availableStornoLines.map((line) => [String(line.id), stornoLineQuantity(line).value]))); setReverseSelectionError(''); }}><Text style={[styles.stornoAllButtonText, styles.stornoM3PillText]}>{allStornoLinesSelected ? 'Deselectează' : 'Toate'}</Text></TouchableOpacity></View>

                <View style={styles.stornoLineList}>{availableStornoLines.map((line, index) => { const lineId = String(line.id || ''); const selected = Object.prototype.hasOwnProperty.call(reverseSelection, lineId); const maximum = stornoLineQuantity(line); return <View key={lineId} style={[styles.stornoLineCard, styles.stornoM3LineCard, selected && styles.stornoM3LineCardSelected]}><TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`${selected ? 'Deselectează' : 'Selectează'} ${line.product_name || line.supplier_product_name || `poziția ${index + 1}`}`} disabled={reversing} activeOpacity={0.75} style={styles.stornoLineChoice} onPress={() => { setReverseSelection((current) => { const next = { ...current }; if (selected) delete next[lineId]; else next[lineId] = maximum.value; return next; }); setReverseSelectionError(''); }}><View style={[styles.stornoCheckbox, styles.stornoM3Checkbox, selected && styles.stornoM3CheckboxSelected]}>{selected && <Check size={15} color="#5F1128" strokeWidth={3} />}</View><NirLineProductVisual uri={line.product_image_url} matched={Boolean(line.product_id)} /><View style={{ flex: 1, minWidth: 0 }}><Text style={[styles.stornoLineName, styles.stornoM3LineName]}>{line.product_name || line.supplier_product_name || `Produs ${index + 1}`}</Text><Text style={[styles.stornoLineMeta, styles.stornoM3LineMeta]}>Poziția {line.line_number || index + 1} · maxim {movementQuantity(maximum.numeric)} {line.purchase_unit || 'buc'}</Text></View></TouchableOpacity><View style={[styles.stornoQuantityWrap, styles.stornoM3QuantityWrap, !selected && styles.stornoM3QuantityDisabled]}><Text style={[styles.stornoQuantityLabel, styles.stornoM3QuantityLabel]}>CANTITATE</Text><TextInput accessibilityLabel={`Cantitate de stornat pentru ${line.product_name || line.supplier_product_name || `poziția ${index + 1}`}`} accessibilityState={{ disabled: !selected || reversing }} editable={selected && !reversing} value={selected ? reverseSelection[lineId] || '' : ''} onChangeText={(value) => { setReverseSelection((current) => ({ ...current, [lineId]: value.replace(/[^0-9.,]/g, '') })); setReverseSelectionError(''); }} keyboardType="decimal-pad" selectTextOnFocus selectionColor="#FFB2BC" cursorColor="#FFB2BC" placeholder={selected ? '0' : 'Inactiv'} placeholderTextColor={selected ? Colors.textMuted : '#8D838A'} style={[styles.stornoQuantityInput, styles.stornoM3QuantityInput, !selected && styles.stornoM3QuantityInputDisabled]} /><Text style={[styles.stornoQuantityUnit, styles.stornoM3QuantityUnit]}>{line.purchase_unit || 'buc'}</Text></View></View>; })}</View>

                {!availableStornoLines.length && <View style={styles.stornoEmpty}><PackageSearch size={22} color="#FDA4AF" /><Text style={styles.stornoEmptyTitle}>Nu există poziții disponibile</Text><Text style={styles.stornoEmptyText}>Produsele din acest NIR nu mai pot fi stornate din stoc.</Text></View>}
                {!!reverseSelectionError && <View accessibilityRole="alert" style={styles.stornoError}><AlertTriangle size={16} color="#FDA4AF" /><Text style={styles.stornoErrorText}>{reverseSelectionError}</Text></View>}

                <Text style={[styles.reverseReasonLabel, styles.stornoM3FieldLabel]}>MOTIVUL STORNĂRII *</Text><TextInput multiline value={reverseReason} onChangeText={(value) => { setReverseReason(value); setReverseReasonTouched(false); }} editable={!reversing} maxLength={500} placeholder="Ex: poziție facturată greșit sau marfă returnată furnizorului" placeholderTextColor={Colors.textMuted} selectionColor="#FFB2BC" cursorColor="#FFB2BC" style={[styles.reverseReasonInput, styles.stornoM3ReasonInput, reverseReasonTouched && !reverseReason.trim() && styles.reverseReasonInputInvalid]} />{reverseReasonTouched && !reverseReason.trim() && <Text style={styles.reverseReasonError}>Scrie motivul stornării.</Text>}
                <View style={styles.deleteDialogWarning}><AlertTriangle size={18} color="#FBBF24" /><View style={{ flex: 1 }}><Text style={styles.deleteDialogWarningTitle}>Verifică selecția înainte de confirmare</Text><Text style={styles.deleteDialogWarningText}>Se stornează numai pozițiile și cantitățile selectate. Operațiunea este blocată dacă stocul aferent a fost deja consumat.</Text></View></View>
                <TouchableOpacity disabled={reversing} style={[styles.deleteDialogCancel, styles.stornoM3Cancel]} onPress={() => { setStornoAttachments([]); setReverseDialog(false); }}><Text style={[styles.deleteDialogCancelText, styles.stornoM3CancelText]}>Renunță</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Confirmă stornarea facturii" disabled={reversing || !availableStornoLines.length} style={[styles.deleteDialogConfirm, styles.reverseDialogConfirm, styles.stornoM3Confirm, (!availableStornoLines.length || reversing) && styles.downloadDisabled]} onPress={() => void reverseDocument()}>{reversing ? <ActivityIndicator color="#5F1128" /> : <><RotateCcw size={18} color="#5F1128" /><Text style={[styles.deleteDialogConfirmText, styles.stornoM3ConfirmText]}>Confirmă stornarea</Text></>}</TouchableOpacity>
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        <Modal visible={Boolean(stornoNotice)} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setStornoNotice(null)}><Pressable style={styles.deleteBackdrop} onPress={() => setStornoNotice(null)}><Pressable accessibilityViewIsModal style={[styles.deleteDialog, styles.stornoNotice]} onPress={(event) => event.stopPropagation()}><View style={styles.stornoNoticeIcon}><CheckCircle2 size={29} color="#5EEAA4" /></View><Text style={styles.stornoNoticeEyebrow}>STORNARE ÎNREGISTRATĂ</Text><Text style={styles.stornoNoticeTitle}>{stornoNotice?.title}</Text><Text style={styles.stornoNoticeText}>{stornoNotice?.message}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Închide confirmarea stornării" style={styles.stornoNoticeAction} onPress={() => setStornoNotice(null)}><Text style={styles.stornoNoticeActionText}>Am înțeles</Text></TouchableOpacity></Pressable></Pressable></Modal>

        <Modal visible={currencyPicker} transparent animationType="slide" onRequestClose={() => setCurrencyPicker(false)}><Pressable style={styles.backdrop} onPress={() => setCurrencyPicker(false)}><Pressable style={[styles.sheet, styles.currencySheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Alege moneda facturii" onClose={() => setCurrencyPicker(false)} /><SearchBox value={currencySearch} onChangeText={setCurrencySearch} placeholder="Caută după cod sau denumire" /><View style={styles.currencyCount}><CircleDollarSign size={15} color="#F59E0B" /><Text style={styles.currencyCountText}>{filteredCurrencies.length} monede disponibile</Text></View><ScrollView style={{ maxHeight: 510 }} contentContainerStyle={styles.currencyList}>{filteredCurrencies.map((currency) => <TouchableOpacity key={currency} style={[styles.currencyOption, currency === editor.currency && styles.currencyOptionActive]} onPress={() => selectCurrency(currency)}><View style={[styles.currencyOptionCode, currency === editor.currency && styles.currencyOptionCodeActive]}><Text style={[styles.currencyOptionCodeText, currency === editor.currency && styles.currencyOptionCodeTextActive]}>{currency}</Text></View><Text numberOfLines={1} style={styles.currencyOptionName}>{currencyName(currency)}</Text>{currency === editor.currency ? <CheckCircle2 size={18} color="#5EEAA4" /> : <ChevronRight size={17} color={Colors.textMuted} />}</TouchableOpacity>)}</ScrollView></Pressable></Pressable></Modal>

        <Modal visible={warehousePicker} transparent animationType="slide" onRequestClose={() => setWarehousePicker(false)}><Pressable style={styles.backdrop} onPress={() => setWarehousePicker(false)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Alege gestiunea" onClose={() => setWarehousePicker(false)} /><Text style={styles.pickerExplanation}>Aici va intra efectiv marfa după confirmarea NIR-ului.</Text><ScrollView style={{ maxHeight: 430 }}>{warehouses.map((warehouse) => <TouchableOpacity style={styles.pickerRow} key={warehouse.id} onPress={() => { patchEditor({ warehouse_id: warehouse.id, warehouse_name: warehouse.name }); setWarehousePicker(false); }}><View style={styles.pickerIcon}><Boxes size={19} color="#5EEAA4" /></View><View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{warehouse.name}</Text><Text style={styles.pickerMeta}>{warehouse.is_default ? 'Gestiune implicită' : 'Gestiune disponibilă'}</Text></View>{warehouse.id === editor.warehouse_id ? <CheckCircle2 size={18} color="#5EEAA4" /> : <ChevronRight size={18} color={Colors.textMuted} />}</TouchableOpacity>)}</ScrollView></Pressable></Pressable></Modal>

        <Modal visible={supplierPicker} transparent animationType="slide" onRequestClose={() => setSupplierPicker(false)}><Pressable style={styles.backdrop} onPress={() => setSupplierPicker(false)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Selectează furnizorul" onClose={() => setSupplierPicker(false)} /><SearchBox value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Denumire sau CUI" />{newSupplier ? <View style={styles.inlineCreate}><Field label="DENUMIRE *" value={newSupplier.name} onChangeText={(name) => setNewSupplier({ ...newSupplier, name })} placeholder="Firma furnizoare" /><Field label="CUI" value={newSupplier.cui} onChangeText={(cui) => setNewSupplier({ ...newSupplier, cui })} placeholder="RO123456" /><TouchableOpacity style={styles.confirmAction} onPress={() => void addSupplier()}><Check size={18} color={Colors.white} /><Text style={styles.confirmActionText}>Creează și selectează</Text></TouchableOpacity></View> : <><ScrollView style={{ maxHeight: 430 }}>{filteredSuppliers.map((supplier) => <TouchableOpacity style={styles.pickerRow} key={supplier.id} onPress={() => { const supplierCurrency = supplier.default_currency || editor.currency; patchEditor({ supplier_id: supplier.id, supplier_name: supplier.name }); setSupplierPicker(false); if (supplierCurrency !== editor.currency) selectCurrency(supplierCurrency); }}><View style={styles.pickerIcon}><Building2 size={18} color="#5EEAD4" /></View><View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{supplier.name}</Text><Text style={styles.pickerMeta}>{supplier.cui || 'CUI necompletat'}</Text></View><ChevronRight size={18} color={Colors.textMuted} /></TouchableOpacity>)}</ScrollView>{can('SUPPLIER_CREATE') && <TouchableOpacity style={styles.addLine} onPress={() => setNewSupplier({ name: supplierSearch, cui: '' })}><Plus size={18} color={Colors.orange} /><Text style={styles.addLineText}>Furnizor nou</Text></TouchableOpacity>}</>}</Pressable></Pressable></Modal>

        <Modal visible={productPickerLine !== null} transparent animationType="slide" onRequestClose={() => setProductPickerLine(null)}><Pressable style={styles.backdrop} onPress={() => setProductPickerLine(null)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Asociază produsul intern" onClose={() => setProductPickerLine(null)} /><SearchBox value={productSearch} onChangeText={setProductSearch} placeholder="Denumire, SKU sau cod" />{loadingProducts ? <ActivityIndicator color={Colors.orange} style={{ margin: 28 }} /> : <ScrollView style={{ maxHeight: 520 }}>{products.map((product) => { const supplierAlias = product.supplier_reference?.supplier_product_code_original || product.supplier_reference?.supplier_product_name; return <TouchableOpacity key={product.id} style={styles.pickerRow} onPress={() => void selectProduct(product)}>{product.images?.[0]?.url ? <Image source={{ uri: product.images[0].url }} style={styles.pickerImage} resizeMode="cover" /> : <View style={styles.pickerIcon}><PackageSearch size={18} color="#A78BFA" /></View>}<View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{product.name}</Text><Text style={styles.pickerMeta}>{product.sku || 'Fără SKU'} · {supplierAlias ? `asociat: ${supplierAlias}` : 'fără alias la acest furnizor'}</Text></View><Link2 size={17} color={Colors.orange} /></TouchableOpacity>; })}</ScrollView>}</Pressable></Pressable></Modal>
        <NirExportProgressModal progress={exportProgress} />
      </View>
    );
  }

  const registryDownloadRange = nirRegistryPeriodRange(registryDownloadPeriod, registryDownloadFrom, registryDownloadTo);
  const registryPeriods: { value: NirRegistryPeriod; label: string }[] = [
    { value: 'all', label: 'Toată perioada' },
    { value: 'year', label: 'Tot anul' },
    { value: 'six_months', label: '6 luni' },
    { value: 'three_months', label: '3 luni' },
    { value: 'last_month', label: 'Luna trecută' },
    { value: 'current_month', label: 'Luna curentă' },
    { value: 'custom', label: 'Custom' },
  ];

  return (
    <View key={`nir-registry-${registryEpoch}`} style={styles.screen}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingBottom: 30 + insets.bottom }}>
        <View style={styles.registryHero}>
          <View style={styles.registryHeroGlow} />
          <View style={styles.registryHeroTop}>
            <View style={styles.heroBrand}>
              <MotionOrb><FilePlus2 size={23} color="#5EEAD4" /></MotionOrb>
              <View><Text style={styles.heroEyebrow}>RECEPȚII · STOC · COSTURI</Text><Text style={styles.heroTitle}>NIR-uri</Text></View>
            </View>
            <View style={styles.heroActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Exportă registrul NIR" style={styles.registryDownloadOpen} onPress={() => setRegistryDownloadVisible(true)}><FileDown size={18} color="#071513" /><Text style={styles.registryDownloadOpenText}>Export</Text></TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => void loadRegistry(page)}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity>
            </View>
          </View>
          <View style={styles.heroMessage}><Text style={styles.heroMessageBadge}>FLUX GHIDAT</Text><Text style={styles.heroText}>Înregistrează factura și recepția în pași simpli. Nimic nu se salvează până nu apeși „Salvează”.</Text></View>
          <View style={styles.heroStats}><View><Text style={styles.heroStatValue}>{registry?.total || 0}</Text><Text style={styles.heroStatLabel}>DOCUMENTE</Text></View><View><Text style={styles.heroStatValue}>{registry?.items.filter((item) => item.status === 'draft').length || 0}</Text><Text style={styles.heroStatLabel}>CIORNE ÎN PAGINĂ</Text></View></View>
          <View style={styles.quickGuide}><GuideItem number="1" label="Furnizor" /><View style={styles.guideLine} /><GuideItem number="2" label="Produse" /><View style={styles.guideLine} /><GuideItem number="3" label="Confirmare" /></View>
        </View>

        <View collapsable={false} style={styles.registryToolbarSticky}>
          <View style={styles.registryToolbar}>
            <View style={styles.registryToolbarRow}>
              <View style={styles.registryToolbarSearch}><SearchBox value={search} onChangeText={setSearch} onSubmitEditing={() => void loadRegistry(1)} placeholder="Număr NIR, factură, furnizor sau CUI" /></View>
              {can('NIR_CREATE') && <AnimatedCreateNirButton disabled={saving} onPress={() => void createDraft()} />}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.statusFilters}>
              {[['', 'Toate'], ['draft', 'Ciorne'], ['confirmed', 'Confirmate'], ['storno', 'Stornate']].map(([value, label]) => <TouchableOpacity key={value} style={[styles.filterChip, status === value && styles.filterChipActive]} onPress={() => setStatus(value)}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{label}</Text></TouchableOpacity>)}
            </ScrollView>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingText}>Se încarcă registrul NIR...</Text></View>
        ) : (
          <View style={styles.registryList}>
            {registry?.items.length ? registry.items.map((document) => <NirRegistryCard key={document.id} document={document} onPress={() => void openDocument(document.id)} canViewCosts={can('NIR_VIEW_COSTS')} />) : <View style={styles.emptyBox}><RegistryDocumentIcon color="#F97316" /><View style={{ flex: 1 }}><Text style={styles.emptyEyebrow}>REGISTRU NIR</Text><Text style={styles.emptyTitle}>Nu există NIR-uri pentru filtrul ales</Text><Text style={styles.emptyText}>{search ? 'Nu am găsit un document pentru această căutare.' : 'Adaugă prima recepție sau schimbă filtrul.'}</Text></View>{can('NIR_CREATE') && <TouchableOpacity style={styles.emptyAction} onPress={createDraft}><Plus size={16} color="#081311" /><Text style={styles.emptyActionText}>NIR nou</Text></TouchableOpacity>}</View>}
            <View style={styles.pagination}><TouchableOpacity style={styles.pageButton} disabled={(registry?.page || 1) <= 1} onPress={() => void loadRegistry(page - 1)}><ChevronLeft size={18} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.pageText}>Pagina {registry?.page || 1} din {registry?.total_pages || 1}</Text><TouchableOpacity style={styles.pageButton} disabled={(registry?.page || 1) >= (registry?.total_pages || 1)} onPress={() => void loadRegistry(page + 1)}><ChevronRight size={18} color={Colors.textPrimary} /></TouchableOpacity></View>
          </View>
        )}
      </ScrollView>
      <Modal visible={registryDownloadVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => !registryDownloading && setRegistryDownloadVisible(false)}><Pressable style={styles.registryDownloadBackdrop} onPress={() => !registryDownloading && setRegistryDownloadVisible(false)}><Pressable accessibilityViewIsModal style={[styles.registryDownloadSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><View style={styles.registryDownloadHandle} /><View style={styles.registryDownloadHeader}><View style={styles.registryDownloadHeaderIcon}><FileDown size={24} color="#7DD3FC" /></View><View style={{ flex: 1 }}><Text style={styles.registryDownloadEyebrow}>EXPORT CONTABIL</Text><Text style={styles.registryDownloadTitle}>Descarcă registrul NIR</Text><Text style={styles.registryDownloadIntro}>Fișierele sunt generate acum și nu ocupă spațiul hostingului.</Text></View><TouchableOpacity accessibilityLabel="Închide" disabled={registryDownloading} style={styles.registryDownloadClose} onPress={() => setRegistryDownloadVisible(false)}><X size={19} color={Colors.textSecondary} /></TouchableOpacity></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.registryDownloadBody}><View style={styles.registryDownloadSectionTitle}><Text style={styles.registryDownloadStep}>01</Text><View><Text style={styles.registryDownloadSectionHeading}>Ce vrei să descarci?</Text><Text style={styles.registryDownloadSectionHint}>Alege fișierul simplu sau arhiva completă.</Text></View></View><View style={styles.registryContentOptions}>{([{ value: 'registry', title: 'Doar registrul', hint: 'Un fișier XLSX foarte detaliat' }, { value: 'complete', title: 'Registru + toate NIR-urile', hint: 'ZIP cu fiecare PDF, Excel și documentele sale' }] as const).map((option) => <TouchableOpacity key={option.value} style={[styles.registryContentOption, registryDownloadContent === option.value && styles.registryContentOptionActive]} onPress={() => setRegistryDownloadContent(option.value)}><View style={[styles.registryContentIcon, registryDownloadContent === option.value && styles.registryContentIconActive]}><FileDown size={19} color={registryDownloadContent === option.value ? '#071513' : '#7DD3FC'} /></View><View style={{ flex: 1 }}><Text style={styles.registryContentTitle}>{option.title}</Text><Text style={styles.registryContentHint}>{option.hint}</Text></View><View style={[styles.registryRadio, registryDownloadContent === option.value && styles.registryRadioActive]} /></TouchableOpacity>)}</View><View style={styles.registryDownloadSectionTitle}><Text style={styles.registryDownloadStep}>02</Text><View><Text style={styles.registryDownloadSectionHeading}>Pentru ce perioadă?</Text><Text style={styles.registryDownloadSectionHint}>Selectează rapid sau alege un interval.</Text></View></View><View style={styles.registryPeriodGrid}>{registryPeriods.map((option) => { const active = registryDownloadPeriod === option.value; return <TouchableOpacity key={option.value} style={[styles.registryPeriodChip, active && styles.registryPeriodChipActive]} onPress={() => setRegistryDownloadPeriod(option.value)}><NirRegistryPeriodIcon period={option.value} active={active} /><Text style={[styles.registryPeriodText, active && styles.registryPeriodTextActive]}>{option.label}</Text></TouchableOpacity>; })}</View>{registryDownloadPeriod === 'custom' && <View style={styles.registryCustomRange}><View style={{ flex: 1 }}><Text style={styles.registryCustomLabel}>DE LA</Text><TextInput value={registryDownloadFrom} onChangeText={setRegistryDownloadFrom} placeholder="AAAA-LL-ZZ" placeholderTextColor={Colors.textMuted} keyboardType="numbers-and-punctuation" style={styles.registryCustomInput} /></View><View style={{ flex: 1 }}><Text style={styles.registryCustomLabel}>PÂNĂ LA</Text><TextInput value={registryDownloadTo} onChangeText={setRegistryDownloadTo} placeholder="AAAA-LL-ZZ" placeholderTextColor={Colors.textMuted} keyboardType="numbers-and-punctuation" style={styles.registryCustomInput} /></View></View>}<View style={styles.registryDownloadSummary}><CheckCircle2 size={20} color="#5EEAD4" /><View style={{ flex: 1 }}><Text style={styles.registryDownloadSummaryLabel}>SE VA GENERA</Text><Text style={styles.registryDownloadSummaryTitle}>{registryDownloadContent === 'complete' ? 'Arhivă completă' : 'Registru Excel'} pentru {registryDownloadRange.label}</Text><Text style={styles.registryDownloadSummaryText}>{registryDownloadRange.from && registryDownloadRange.to ? `${registryDownloadRange.from.split('-').reverse().join('.')} — ${registryDownloadRange.to.split('-').reverse().join('.')}` : registryDownloadPeriod === 'custom' ? 'Completează ambele date.' : 'Toate NIR-urile din registru.'}</Text></View></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Descarcă registrul selectat" disabled={registryDownloading} style={[styles.registryDownloadConfirm, registryDownloading && styles.downloadDisabled]} onPress={() => void downloadNirRegistry()}>{registryDownloading ? <ActivityIndicator color="#071513" /> : <FileDown size={20} color="#071513" />}<Text style={styles.registryDownloadConfirmText}>{registryDownloading ? 'Se pregătește…' : 'Descarcă acum'}</Text></TouchableOpacity></ScrollView></Pressable></Pressable></Modal>
      <NirExportProgressModal progress={exportProgress} />
    </View>
  );
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 360, delay, useNativeDriver: true }).start();
  }, [delay, progress]);
  return <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{children}</Animated.View>;
}

function useReduceMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => { if (mounted) setReduceMotion(enabled); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduceMotion;
}

function useSmoothExpansionProgress(expanded: boolean) {
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  const reduceMotion = useReduceMotionPreference();

  useEffect(() => {
    progress.stopAnimation();
    if (reduceMotion) {
      progress.setValue(expanded ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: expanded ? 320 : 280,
      easing: expanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, progress, reduceMotion]);

  return progress;
}

function SmoothCollapsible({ expanded, progress, children }: { expanded: boolean; progress: Animated.Value; children: React.ReactNode }) {
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = contentHeight > 0
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0, contentHeight] })
    : (expanded ? undefined : 0);

  return (
    <Animated.View
      pointerEvents={expanded ? 'auto' : 'none'}
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
      style={[styles.lineCollapsible, {
        height: animatedHeight,
        opacity: progress.interpolate({ inputRange: [0, 0.16, 1], outputRange: [0, 0.32, 1] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) }],
      }]}
    >
      <View
        collapsable={false}
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          setContentHeight((current) => Math.abs(current - nextHeight) > 1 ? nextHeight : current);
        }}
        style={styles.lineExpandableContent}
      >
        {children}
      </View>
    </Animated.View>
  );
}

function AnimatedCreateNirButton({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const ambient = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotionPreference();

  useEffect(() => {
    ambient.stopAnimation();
    ambient.setValue(0);
    if (reduceMotion || disabled) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(ambient, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(ambient, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(700),
    ]));
    loop.start();
    return () => loop.stop();
  }, [ambient, disabled, reduceMotion]);

  const animatePress = (scale: number) => {
    if (reduceMotion) return;
    Animated.spring(pressScale, { toValue: scale, damping: 16, stiffness: 240, mass: 0.55, useNativeDriver: true }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="NIR nou"
      accessibilityHint="Creează o notă nouă de intrare-recepție"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      onPressIn={() => animatePress(0.92)}
      onPressOut={() => animatePress(1)}
      style={({ pressed }) => [styles.registryCreateButtonTouch, pressed && styles.registryCreateButtonPressed, disabled && styles.registryCreateButtonDisabled]}>
      <Animated.View
        pointerEvents="none"
        style={[styles.registryCreateButton, {
          transform: [
            { scale: ambient.interpolate({ inputRange: [0, 1], outputRange: [1, 1.055] }) },
            { scale: pressScale },
            { rotate: ambient.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '2deg'] }) },
          ],
        }]}>
        <Plus size={23} strokeWidth={2.8} color="#081311" />
      </Animated.View>
    </Pressable>
  );
}

function MotionOrb({ children }: { children: React.ReactNode }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(motion, { toValue: 1, duration: 1300, useNativeDriver: true }),
      Animated.timing(motion, { toValue: 0, duration: 1300, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [motion]);
  return <Animated.View style={[styles.heroIcon, { transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }, { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '3deg'] }) }] }]}>{children}</Animated.View>;
}

function GuideItem({ number, label }: { number: string; label: string }) { return <View style={styles.guideItem}><View style={styles.guideBubble}><Text style={styles.guideBubbleText}>{number}</Text></View><Text style={styles.guideLabel}>{label}</Text></View>; }
const AnimatedFlowPath = Animated.createAnimatedComponent(Path);
const nirFlowSteps = [
  { label: 'Furnizor', path: 'M4 21V8l8-5 8 5v13M8 21v-8h8v8M8 9h.01M12 9h.01M16 9h.01' },
  { label: 'Recepție', path: 'M3 10h18M8 3v4M16 3v4M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z' },
  { label: 'Monedă', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 8.5c-.8-.7-1.7-1-3-1-1.7 0-3 1-3 2.3 0 3.5 6 1.7 6 5 0 1.4-1.3 2.4-3.1 2.4-1.4 0-2.5-.4-3.4-1.2M12 5.5v13' },
  { label: 'Produse', path: 'm4 7 8-4 8 4-8 4-8-4ZM4 7v10l8 4 8-4V7M12 11v10' },
  { label: 'Verificare', path: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-13 0 2.5 2.5L16 9' },
];

const nirFlowStarts = [0.02, 0.18, 0.34, 0.5, 0.66];

function DrawnFlowIcon({ path, index, progress }: { path: string; index: number; progress: Animated.Value }) {
  const start = nirFlowStarts[index];
  const drawn = start + 0.1;
  const dashOffset = progress.interpolate({ inputRange: [0, start, drawn, 0.84, 0.96, 1], outputRange: [96, 96, 0, 0, -96, -96] });
  const opacity = progress.interpolate({ inputRange: [0, start, drawn, 0.84, 0.96, 1], outputRange: [0.16, 0.16, 1, 1, 0, 0] });
  const scale = progress.interpolate({ inputRange: [0, start, drawn, 0.84, 0.96, 1], outputRange: [0.88, 0.88, 1, 1, 0.94, 0.94] });
  return <Animated.View style={[styles.flowGuideItem, { opacity, transform: [{ scale }] }]}><View style={styles.flowGuideIcon}><Svg width={24} height={24} viewBox="0 0 24 24"><AnimatedFlowPath d={path} fill="none" stroke="#5EEAD4" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="96 96" strokeDashoffset={dashOffset as unknown as number} /></Svg><Text style={styles.flowGuideBadge}>{index + 1}</Text></View><Text style={styles.flowGuideLabel}>{nirFlowSteps[index].label}</Text></Animated.View>;
}

function AnimatedFlowConnector({ index, progress }: { index: number; progress: Animated.Value }) {
  const start = nirFlowStarts[index] + 0.1;
  const finish = nirFlowStarts[index + 1];
  const scaleX = progress.interpolate({ inputRange: [0, start, finish, 0.84, 0.96, 1], outputRange: [0, 0, 1, 1, 0, 0] });
  const opacity = progress.interpolate({ inputRange: [0, start, finish, 0.84, 0.96, 1], outputRange: [0, 0.45, 1, 1, 0, 0] });
  return <View style={styles.flowGuideLine}><Animated.View style={[styles.flowGuideLineFill, { opacity, transform: [{ scaleX }] }]}><View style={styles.flowGuideArrow} /></Animated.View></View>;
}

function NirFlowGuide() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 5200, easing: Easing.linear, useNativeDriver: false }), { resetBeforeIteration: true });
    loop.start();
    return () => loop.stop();
  }, [progress]);
  return <View style={styles.flowGuide}><View style={styles.flowGuideHead}><Text style={styles.flowGuideEyebrow}>GHID RAPID · URMEAZĂ SĂGEATA</Text><Text style={styles.flowGuideTitle}>Completează NIR-ul în 5 pași simpli</Text><Text style={styles.flowGuideText}>Traseul desenează fiecare pas în ordinea corectă, apoi pornește din nou.</Text></View><View style={styles.flowGuideRow}>{nirFlowSteps.map((step, index) => <React.Fragment key={step.label}><DrawnFlowIcon path={step.path} index={index} progress={progress} />{index < 4 && <AnimatedFlowConnector index={index} progress={progress} />}</React.Fragment>)}</View></View>;
}

function SectionTitle({ icon, index, title, subtitle }: { icon: React.ReactNode; index: string; title: string; subtitle: string }) { return <View style={styles.sectionTitle}><View style={styles.sectionIndex}>{icon}<Text style={styles.sectionIndexText}>{index}</Text></View><View style={{ flex: 1 }}><Text style={styles.sectionHeading}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View></View>; }
function ReviewMetric({ icon, label, value, hint, tone, wide = false }: { icon: React.ReactNode; label: string; value: number; hint: string; tone: 'purple' | 'blue' | 'green' | 'red' | 'teal'; wide?: boolean }) { const toneStyle = { purple: styles.reviewTonePurple, blue: styles.reviewToneBlue, green: styles.reviewToneGreen, red: styles.reviewToneRed, teal: styles.reviewToneTeal }[tone]; return <View style={[styles.reviewMetric, toneStyle, wide && styles.reviewMetricWide]}><View style={styles.reviewMetricIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={styles.reviewMetricLabel}>{label}</Text><Text style={styles.reviewMetricValue}>{value.toLocaleString('ro-RO')}</Text><Text style={styles.reviewMetricHint}>{hint}</Text></View></View>; }
function DateTimeSelector({ label, date, time, color, disabled, onPress }: { label: string; date: string; time: string | null; color: string; disabled: boolean; onPress: () => void }) { const parsed = date ? new Date(`${date}T${String(time || '00:00').slice(0, 5)}:00`) : null; const dateLabel = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Alege data'; const timeLabel = String(time || '').slice(0, 5) || '--:--'; return <TouchableOpacity disabled={disabled} activeOpacity={0.78} style={[styles.dateTimeSelector, disabled && styles.dateTimeSelectorDisabled]} onPress={onPress}><View style={[styles.dateTimeSelectorIcon, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}><CalendarDays size={20} color={color} /><Clock3 size={10} color={color} style={styles.dateTimeClock} /></View><View style={{ flex: 1 }}><Text style={styles.dateTimeSelectorLabel}>{label}</Text><View style={styles.dateTimeSelectorValue}><Text style={styles.dateTimeSelectorDate}>{dateLabel}</Text><View style={[styles.dateTimeTimeChip, { backgroundColor: `${color}12` }]}><Text style={[styles.dateTimeTimeText, { color }]}>{timeLabel}</Text></View></View><Text style={styles.dateTimeSelectorHint}>Atinge pentru calendar și oră</Text></View><ChevronRight size={18} color={Colors.textMuted} /></TouchableOpacity>; }
function Field({ label, value, onChangeText, placeholder, editable = true, keyboardType, multiline, icon }: { label: string; value: string; onChangeText?: (value: string) => void; placeholder: string; editable?: boolean; keyboardType?: 'default' | 'decimal-pad'; multiline?: boolean; icon?: React.ReactNode }) { return <View style={[styles.field, multiline && styles.fieldWide]}><Text style={styles.label}>{label}</Text><View style={styles.inputWrap}>{icon}<TextInput style={[styles.input, multiline && styles.textarea]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} selectionColor="#5EEAD4" cursorColor="#5EEAD4" autoCorrect={false} editable={editable} keyboardType={keyboardType} multiline={multiline} /></View></View>; }
function SearchBox({ value, onChangeText, placeholder, onSubmitEditing }: { value: string; onChangeText: (value: string) => void; placeholder: string; onSubmitEditing?: () => void }) { return <View style={styles.searchBox}><Search size={18} color={Colors.textMuted} /><TextInput style={styles.searchInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} returnKeyType="search" onSubmitEditing={onSubmitEditing} /></View>; }
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) { return <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><TouchableOpacity style={styles.iconButton} onPress={onClose}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>; }
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={[styles.detailTab, active && styles.detailTabActive]} onPress={onPress}><Text style={[styles.detailTabText, active && styles.detailTabTextActive]}>{label}</Text></TouchableOpacity>; }

function NirRegistryCard({ document, onPress, canViewCosts }: { document: ShopNirDocument; onPress: () => void; canViewCosts: boolean }) {
  const info = nirDisplayStatus(document);
  return <TouchableOpacity style={styles.registryCard} activeOpacity={0.75} onPress={onPress}><View style={[styles.registryAccent, { backgroundColor: info.color }]} /><RegistryDocumentIcon color={info.color} /><View style={styles.registryCardMain}><View style={styles.registryCardTop}><View style={{ flex: 1 }}><Text style={styles.registryNumber}>{document.nir_number || document.temporary_number}</Text><Text style={styles.registrySupplier}>{document.supplier_name || 'Furnizor neselectat'}</Text></View><View style={[styles.statusChip, { backgroundColor: `${info.color}16`, borderColor: `${info.color}40` }]}><info.Icon size={13} color={info.color} /><Text style={[styles.statusChipText, { color: info.color }]}>{info.label}</Text></View></View><View style={styles.registryMeta}><Text style={styles.registryMetaText}>◷ {document.nir_date} · {String(document.nir_time || document.reception_time || '').slice(0, 5) || '—'}</Text><Text style={styles.registryMetaText}>▧ {document.line_count || 0} produse</Text><Text style={styles.registryMetaText}>Factura {document.supplier_invoice_number || '—'}</Text></View>{canViewCosts && <Text style={styles.registryTotal}>{money(document.grand_total_ron)}</Text>}</View><ChevronRight size={20} color={Colors.textMuted} /></TouchableOpacity>;
}

function RegistryDocumentIcon({ color }: { color: string }) {
  const motion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(motion, { toValue: 1, duration: 1200, useNativeDriver: true }), Animated.timing(motion, { toValue: 0, duration: 1200, useNativeDriver: true })]));
    loop.start(); return () => loop.stop();
  }, [motion]);
  return <Animated.View style={[styles.registryDocumentIcon, { borderColor: `${color}44`, backgroundColor: `${color}12`, transform: [{ translateY: motion.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }, { rotate: motion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '3deg'] }) }] }]}><FilePlus2 size={20} color={color} /></Animated.View>;
}

function LineStage({ number, title, subtitle, icon, children }: { number: string; title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) { return <View style={styles.lineStage}><View style={styles.lineStageHeader}><View style={styles.lineStageIcon}>{icon}<Text style={styles.lineStageNumber}>{number}</Text></View><View style={{ flex: 1 }}><Text style={styles.lineStageTitle}>{title}</Text><Text style={styles.lineStageSubtitle}>{subtitle}</Text></View></View>{children}</View>; }

const AnimatedSvgPath = Animated.createAnimatedComponent(Path);
function NirLineProductVisual({ uri, matched }: { uri?: string | null; matched: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  const drawing = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotionPreference();
  const showImage = matched && Boolean(uri) && !imageFailed;
  useEffect(() => {
    setImageFailed(false);
  }, [uri]);
  useEffect(() => {
    drawing.stopAnimation();
    drawing.setValue(reduceMotion ? 0.5 : 0);
    if (reduceMotion || showImage) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drawing, { toValue: 1, duration: 920, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      Animated.delay(45),
      Animated.timing(drawing, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [drawing, reduceMotion, showImage]);
  if (showImage) return <Image source={{ uri: uri! }} style={styles.lineProductImage} resizeMode="contain" onError={() => setImageFailed(true)} />;
  const color = matched ? '#5EEAD4' : '#A78BFA';
  return <View style={[styles.lineProductPlaceholder, matched && styles.lineProductPlaceholderMatched]}><Svg width={26} height={26} viewBox="0 0 24 24"><AnimatedSvgPath d="m4 7 8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7m-8 4v10" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="90" strokeDashoffset={drawing.interpolate({ inputRange: [0, 0.24, 0.76, 1], outputRange: [90, 0, 0, -90] })} opacity={drawing.interpolate({ inputRange: [0, 0.12, 0.84, 1], outputRange: [0.24, 1, 1, 0.16] })} /></Svg></View>;
}

function NirLineCard({ line, index, editable, supplierName, currency, exchangeRate, onPatch, onSupplierCodeChange, onSupplierNameChange, onPickProduct, onRemove }: { line: ShopNirLine; index: number; editable: boolean; supplierName: string; currency: string; exchangeRate: string; onPatch: (patch: Partial<ShopNirLine>) => void; onSupplierCodeChange: (value: string) => void; onSupplierNameChange: (value: string) => void; onPickProduct: () => void; onRemove: () => void }) {
  const matched = Boolean(line.product_id);
  const isStockItem = line.is_stock_item !== false;
  const received = line.received_quantity || line.accepted_quantity;
  const differs = line.invoiced_quantity !== received || received !== line.accepted_quantity;
  const differenceReason = line.difference_reason || (line.mismatch_reason ? 'other' : null);
  const calculated = localLineTotals(line, exchangeRate);
  const [expanded, setExpanded] = useState(editable);
  const expansion = useSmoothExpansionProgress(expanded);

  useEffect(() => {
    setExpanded(editable);
  }, [editable]);

  return <Reveal delay={Math.min(index * 45, 220)}><View style={[styles.lineCard, matched && styles.lineCardMatched]}>
    <View style={styles.lineHeader}><NirLineProductVisual uri={line.product_image_url} matched={matched} /><View style={{ flex: 1 }}><Text style={styles.lineProduct}>{line.product_name || line.supplier_product_name || 'Produs neasociat'}</Text><Text style={[styles.matchText, { color: ['matching_code', 'matching_name'].includes(line.resolution_status || '') ? '#38BDF8' : matched ? Colors.success : Colors.warning }]}>{['matching_code', 'matching_name'].includes(line.resolution_status || '') ? '● Se caută automat…' : matched ? (line.resolution_status === 'matched_code' ? '● Recunoscut după cod' : line.resolution_status === 'matched_name' ? '● Recunoscut după denumirea furnizorului' : '● Asociat manual · se memorează la Salvare') : '● Necesită asociere'}</Text></View><View style={styles.lineHeaderActions}>{editable && <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Șterge produsul ${index + 1}`} style={styles.deleteLine} onPress={onRemove}><Trash2 size={16} color={Colors.error} /></TouchableOpacity>}<TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? `Restrânge produsul ${index + 1}` : `Extinde produsul ${index + 1}`} accessibilityState={{ expanded }} hitSlop={7} style={styles.lineExpandButton} onPress={() => setExpanded((current) => !current)}><Animated.View style={{ transform: [{ rotate: expansion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}><ChevronRight size={18} color={expanded ? '#C4B5FD' : Colors.textMuted} /></Animated.View></TouchableOpacity></View></View>
    <SmoothCollapsible expanded={expanded} progress={expansion}>
    <LineStage number="1" title="Identifică produsul" subtitle="Căutare după cod, EAN sau denumirea memorată la furnizor" icon={<PackageSearch size={17} color="#A78BFA" />}>
      <View style={styles.supplierContext}><Text style={styles.supplierContextLabel}>FURNIZOR</Text><Text style={styles.supplierContextValue}>{supplierName}</Text></View>
      <Field label="COD FURNIZOR" value={line.supplier_product_code} onChangeText={onSupplierCodeChange} placeholder="Ex: CAU-1025-A" editable={editable} />
      <Field label="DENUMIRE PE FACTURĂ" value={line.supplier_product_name} onChangeText={onSupplierNameChange} placeholder="Denumirea folosită de furnizor" editable={editable} />
      <View style={[styles.autoCodeStatus, matched && styles.autoCodeStatusMatched]}><Search size={15} color={matched ? Colors.success : '#38BDF8'} /><View style={{ flex: 1 }}><Text style={[styles.autoCodeTitle, matched && { color: Colors.success }]}>{['matching_code', 'matching_name'].includes(line.resolution_status || '') ? 'Se caută automat…' : matched ? 'Produs recunoscut' : 'Căutare după cod sau nume'}</Text><Text style={styles.autoCodeText}>{matched ? line.product_name : 'La prima achiziție alegi produsul intern; apoi această denumire este recunoscută automat la furnizor.'}</Text></View></View>
      {editable && isStockItem && <View style={styles.associationActions}><TouchableOpacity style={[styles.productAssociation, matched && styles.productAssociationMatched]} onPress={onPickProduct}><Link2 size={16} color={matched ? Colors.success : Colors.orange} /><Text style={[styles.productAssociationText, matched && { color: Colors.success }]}>{matched ? 'Schimbă produsul' : 'Alege produsul intern'}</Text></TouchableOpacity></View>}
      <Text style={styles.stageExplanation}>SKU-ul intern este independent. Același produs poate avea coduri și denumiri diferite la fiecare furnizor.</Text>
    </LineStage>
    <LineStage number="2" title="Verifică marfa" subtitle="Compară factura cu ce ai primit și acceptat" icon={<Boxes size={17} color="#38BDF8" />}>
      <View style={styles.grid2}><Field label="FACTURAT" value={line.invoiced_quantity} onChangeText={(invoiced_quantity) => onPatch({ invoiced_quantity, received_quantity: invoiced_quantity, accepted_quantity: invoiced_quantity, rejected_quantity: '0' })} placeholder="0" editable={editable} keyboardType="decimal-pad" /><Field label="RECEPȚIONAT" value={received} onChangeText={(received_quantity) => onPatch({ received_quantity, rejected_quantity: '0' })} placeholder="0" editable={editable} keyboardType="decimal-pad" /></View>
      <Field label="ACCEPTAT" value={line.accepted_quantity} onChangeText={(accepted_quantity) => onPatch({ accepted_quantity, rejected_quantity: '0' })} placeholder="0" editable={editable} keyboardType="decimal-pad" />
      {differs && <View style={styles.differenceBox}><Text style={styles.label}>MOTIVUL DIFERENȚEI *</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.differenceReasons}>{differenceReasons.map(([value, label]) => <TouchableOpacity key={value} disabled={!editable} style={[styles.differenceChip, differenceReason === value && styles.differenceChipActive]} onPress={() => onPatch({ difference_reason: value, mismatch_reason: value, ...(value !== 'other' ? { difference_notes: '' } : {}) })}><Text style={[styles.differenceChipText, differenceReason === value && styles.differenceChipTextActive]}>{label}</Text></TouchableOpacity>)}</ScrollView>{(differenceReason === 'other' || Boolean(line.difference_notes)) && <Field label={differenceReason === 'other' ? 'EXPLICAȚIE *' : 'OBSERVAȚII'} value={line.difference_notes || ''} onChangeText={(difference_notes) => onPatch({ difference_notes, mismatch_reason: difference_notes || differenceReason })} placeholder="Descrie diferența constatată" editable={editable} />}</View>}
      <View style={styles.grid2}><Field label="UNITATE ACHIZIȚIE" value={line.purchase_unit} onChangeText={(purchase_unit) => onPatch({ purchase_unit })} placeholder="cutie" editable={editable} /><Field label="UNITATE STOC" value={line.stock_unit} onChangeText={(stock_unit) => onPatch({ stock_unit })} placeholder="buc" editable={editable} /></View>
      <Field label="FACTOR CONVERSIE" value={line.conversion_factor} onChangeText={(conversion_factor) => onPatch({ conversion_factor })} placeholder="1" editable={editable} keyboardType="decimal-pad" />
    </LineStage>
    <LineStage number="3" title="Completează costul" subtitle={`Preț în ${currency}, TVA și costuri suplimentare`} icon={<CircleDollarSign size={17} color="#F59E0B" />}>
      <View style={styles.grid2}><Field label={`PREȚ UNITAR · ${currency}`} value={line.unit_price} onChangeText={(unit_price) => onPatch({ unit_price })} placeholder="0.00" editable={editable} keyboardType="decimal-pad" /><Field label="DISCOUNT %" value={line.discount_percent} onChangeText={(discount_percent) => onPatch({ discount_percent })} placeholder="0" editable={editable} keyboardType="decimal-pad" /></View>
      <View style={styles.grid2}><Field label="TVA %" value={line.vat_rate} onChangeText={(vat_rate) => onPatch({ vat_rate })} placeholder="19" editable={editable} keyboardType="decimal-pad" /><Field label="COST SUPLIMENTAR RON" value={line.allocated_cost_ron || '0'} onChangeText={(allocated_cost_ron) => onPatch({ allocated_cost_ron })} placeholder="0" editable={editable} keyboardType="decimal-pad" /></View>
      {line.price_comparison && <View style={[styles.priceComparison, line.price_comparison.is_significant && styles.priceComparisonWarning]}><View><Text style={styles.priceComparisonLabel}>ULTIMA ACHIZIȚIE · ACELAȘI FURNIZOR</Text><Text style={styles.priceComparisonValue}>{line.price_comparison.last_supplier ? `${money(line.price_comparison.last_supplier.unit_net_price_ron)} / unitate` : 'Fără istoric la acest furnizor'}</Text></View><View style={styles.priceComparisonMeta}><Text style={styles.priceComparisonMetaText}>Minim recent: {line.price_comparison.recent_minimum_unit_net_price_ron ? money(line.price_comparison.recent_minimum_unit_net_price_ron) : '—'}</Text>{line.price_comparison.variance_percent !== null && <Text style={[styles.priceComparisonVariance, line.price_comparison.is_significant && { color: Colors.warning }]}>{Number(line.price_comparison.variance_percent) > 0 ? '+' : ''}{line.price_comparison.variance_percent}%</Text>}</View>{line.price_comparison.is_significant && <Text style={styles.priceComparisonAlert}>Prețul diferă semnificativ. Verifică valoarea înainte de confirmare.</Text>}</View>}
      <View style={styles.lineTotal}><View><Text style={styles.lineTotalLabel}>TOTAL POZIȚIE ÎN RON</Text><Text style={styles.lineTotalHint}>Se recalculează instant, fără salvare</Text><Text style={styles.lineTotalCost}>Cost contabil: {money(String(calculated.inventoryUnitCostRon))}/u</Text></View><Text style={styles.lineTotalValue}>{money(editable ? String(calculated.totalRon) : line.line_total_ron)}</Text></View>
    </LineStage>
    </SmoothCollapsible>
  </View></Reveal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  registryHero: { position: 'relative', margin: 12, padding: 17, borderRadius: 26, backgroundColor: '#10201F', borderWidth: 1, borderColor: '#257168', overflow: 'hidden' }, registryHeroGlow: { position: 'absolute', right: -72, top: -88, width: 210, height: 210, borderRadius: 105, backgroundColor: '#2DD4BF12' },
  registryHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, heroBrand: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD418', borderWidth: 1, borderColor: '#5EEAD444' }, iconButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: Colors.cardBorder },
  heroEyebrow: { color: '#5EEAD4', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, heroTitle: { marginTop: 2, color: Colors.textPrimary, fontSize: 25, lineHeight: 30, fontWeight: '900' }, heroMessage: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF06', borderWidth: 1, borderColor: '#FFFFFF09' }, heroMessageBadge: { alignSelf: 'flex-start', marginBottom: 6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, color: '#5EEAD4', backgroundColor: '#5EEAD410', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 }, heroText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 17 }, heroStats: { marginTop: 14, flexDirection: 'row', gap: 30 }, heroStatValue: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900' }, heroStatLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  registryToolbarSticky: { zIndex: 20, elevation: 10, backgroundColor: Colors.bg, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder }, registryToolbar: { paddingTop: 2, paddingHorizontal: 14 }, registryToolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, registryToolbarSearch: { flex: 1, minWidth: 0 }, registryCreateButtonTouch: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }, registryCreateButton: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD4', borderWidth: 1, borderColor: '#99F6E4', shadowColor: '#2DD4BF', shadowOpacity: 0.28, shadowRadius: 11, shadowOffset: { width: 0, height: 5 }, elevation: 5 }, registryCreateButtonPressed: { opacity: 0.72 }, registryCreateButtonDisabled: { opacity: 0.45 }, searchBox: { minHeight: 52, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 12 }, statusFilters: { gap: 8, paddingTop: 10, paddingBottom: 12 }, filterChip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, filterChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orangeMid }, filterText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' }, filterTextActive: { color: Colors.orange },
  loadingBox: { padding: 50, alignItems: 'center', gap: 12 }, loadingText: { color: Colors.textSecondary }, registryList: { paddingTop: 2, paddingHorizontal: 14, gap: 10 }, registryCard: { minHeight: 112, padding: 13, paddingLeft: 18, borderRadius: 22, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 11, overflow: 'hidden' }, registryAccent: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderRadius: 4 }, registryDocumentIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, registryCardMain: { flex: 1, gap: 9 }, registryCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, registryNumber: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' }, registrySupplier: { marginTop: 3, color: Colors.textSecondary, fontSize: 12 }, statusChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, statusChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, registryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, registryMetaText: { color: Colors.textMuted, fontSize: 10 }, registryTotal: { color: Colors.orangeLight, fontSize: 14, fontWeight: '900' },
  emptyBox: { minHeight: 130, padding: 18, alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#F9731630', backgroundColor: '#F9731608', borderRadius: 24, flexDirection: 'row' }, emptyEyebrow: { color: Colors.orange, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, emptyTitle: { marginTop: 4, color: Colors.textPrimary, fontSize: 15, fontWeight: '900' }, emptyText: { marginTop: 4, color: Colors.textSecondary, fontSize: 11, lineHeight: 16 }, emptyAction: { minHeight: 42, paddingHorizontal: 13, borderRadius: 14, backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', gap: 6 }, emptyActionText: { color: '#081311', fontSize: 11, fontWeight: '900' }, pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 12 }, pageButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' }, pageText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' }, fab: { position: 'absolute', right: 18, height: 54, paddingHorizontal: 21, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.orange, shadowColor: Colors.orange, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 }, fabText: { color: Colors.white, fontWeight: '900' },
  editorHeader: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: Colors.surface }, editorHeaderCopy: { flex: 1 }, editorEyebrow: { color: Colors.orange, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, editorTitle: { marginTop: 3, color: Colors.textPrimary, fontSize: 16, fontWeight: '900' }, editorContent: { padding: 14, gap: 12 },
  sectionTitle: { marginBottom: 3, flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionIndex: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08', borderWidth: 1, borderColor: Colors.cardBorder }, sectionIndexText: { position: 'absolute', right: 4, bottom: 3, color: Colors.textMuted, fontSize: 7, fontWeight: '900' }, sectionHeading: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' }, sectionSubtitle: { marginTop: 3, color: Colors.textMuted, fontSize: 11, lineHeight: 16 },
  selector: { minHeight: 70, padding: 14, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, selectorValue: { marginTop: 7, color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, placeholder: { marginTop: 7, color: Colors.textMuted, fontSize: 13 }, grid2: { flexDirection: 'row', gap: 10 }, dateTimeCard: { padding: 10, gap: 9, borderRadius: 19, backgroundColor: '#38BDF807', borderWidth: 1, borderColor: '#38BDF826' }, dateTimeSelector: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 17, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, dateTimeSelectorDisabled: { opacity: 0.62 }, dateTimeSelectorIcon: { position: 'relative', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1 }, dateTimeClock: { position: 'absolute', right: 5, bottom: 5 }, dateTimeSelectorLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, dateTimeSelectorValue: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7 }, dateTimeSelectorDate: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' }, dateTimeTimeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }, dateTimeTimeText: { fontSize: 10, fontWeight: '900' }, dateTimeSelectorHint: { marginTop: 4, color: Colors.textMuted, fontSize: 8 }, quantityGrid: { flexDirection: 'row', gap: 7 }, field: { flex: 1, minWidth: 0 }, fieldWide: { flex: 0, width: '100%' }, label: { marginLeft: 3, marginBottom: 6, color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, inputWrap: { minHeight: 52, paddingHorizontal: 13, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { flex: 1, color: Colors.textPrimary, fontSize: 13, paddingVertical: 11 }, textarea: { minHeight: 88, textAlignVertical: 'top' },
  currencyRow: { flexDirection: 'row', gap: 8 }, currencyChip: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, currencyChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orange }, currencyText: { color: Colors.textSecondary, fontWeight: '900' }, currencyTextActive: { color: Colors.orange }, currencySelector: { minHeight: 72, padding: 11, borderRadius: 18, backgroundColor: '#F59E0B08', borderWidth: 1, borderColor: '#F59E0B30', flexDirection: 'row', alignItems: 'center', gap: 11 }, currencySelectorIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#F59E0B12', alignItems: 'center', justifyContent: 'center' }, currencySelectorLabel: { color: Colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, currencySelectorValue: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 }, currencySelectorCode: { color: '#FBBF24', fontSize: 15, fontWeight: '900' }, currencySelectorName: { flex: 1, color: Colors.textSecondary, fontSize: 10 }, bnrStatus: { minHeight: 45, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#22C55E08', borderWidth: 1, borderColor: '#22C55E22', flexDirection: 'row', alignItems: 'center', gap: 8 }, bnrStatusText: { color: '#8FE3B2', fontSize: 9, fontWeight: '800' }, bnrRefresh: { minHeight: 56, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#38BDF808', borderWidth: 1, borderColor: '#38BDF82C', flexDirection: 'row', alignItems: 'center', gap: 10 }, bnrRefreshTitle: { color: '#38BDF8', fontSize: 10, fontWeight: '900' }, bnrRefreshText: { marginTop: 3, color: Colors.textMuted, fontSize: 8 }, currencySheet: { maxHeight: '88%' }, currencyCount: { marginTop: 11, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }, currencyCountText: { color: Colors.textMuted, fontSize: 9, fontWeight: '800' }, currencyList: { paddingTop: 8, gap: 6 }, currencyOption: { minHeight: 57, paddingHorizontal: 10, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }, currencyOptionActive: { backgroundColor: '#22C55E08', borderColor: '#22C55E32' }, currencyOptionCode: { width: 48, height: 34, borderRadius: 11, backgroundColor: '#FFFFFF08', alignItems: 'center', justifyContent: 'center' }, currencyOptionCodeActive: { backgroundColor: '#22C55E12' }, currencyOptionCodeText: { color: '#FBBF24', fontSize: 10, fontWeight: '900' }, currencyOptionCodeTextActive: { color: '#5EEAA4' }, currencyOptionName: { flex: 1, color: Colors.textPrimary, fontSize: 11, fontWeight: '700' },
  lineList: { gap: 12 }, lineCard: { padding: 11, borderRadius: 23, backgroundColor: '#17161A', borderWidth: 1, borderColor: Colors.cardBorder, gap: 10 }, lineCardMatched: { borderColor: '#22C55E55' }, lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 3, paddingVertical: 3 }, lineHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 7 }, lineExpandButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A78BFA0D', borderWidth: 1, borderColor: '#A78BFA28' }, lineCollapsible: { overflow: 'hidden' }, lineExpandableContent: { gap: 10 }, lineNumber: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A78BFA16', borderWidth: 1, borderColor: '#A78BFA30' }, lineProductImage: { flexShrink: 0, width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: '#2DD4BF38', backgroundColor: '#F7F7F5', overflow: 'hidden' }, lineProductPlaceholder: { flexShrink: 0, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A78BFA12', borderWidth: 1, borderColor: '#A78BFA38' }, lineProductPlaceholderMatched: { backgroundColor: '#2DD4BF10', borderColor: '#2DD4BF38' }, lineNumberText: { color: '#A78BFA', fontSize: 11, fontWeight: '900' }, lineProduct: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, matchText: { marginTop: 4, fontSize: 10, fontWeight: '800' }, deleteLine: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.errorDim, alignItems: 'center', justifyContent: 'center' }, productAssociation: { flex: 1, minHeight: 45, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: Colors.orangeMid, backgroundColor: Colors.orangeDim, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, productAssociationMatched: { borderColor: '#22C55E44', backgroundColor: Colors.successDim }, productAssociationText: { flex: 0, color: Colors.orange, fontSize: 10, fontWeight: '800' }, autoCodeStatus: { minHeight: 53, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#38BDF80A', borderWidth: 1, borderColor: '#38BDF82B', flexDirection: 'row', alignItems: 'center', gap: 9 }, autoCodeStatusMatched: { backgroundColor: '#22C55E09', borderColor: '#22C55E2E' }, autoCodeTitle: { color: '#38BDF8', fontSize: 10, fontWeight: '900' }, autoCodeText: { marginTop: 3, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, lineTotal: { minHeight: 75, padding: 12, borderRadius: 15, backgroundColor: '#F9731610', borderWidth: 1, borderColor: '#F9731635', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, lineTotalLabel: { color: Colors.orangeLight, fontSize: 9, fontWeight: '900' }, lineTotalHint: { marginTop: 4, color: Colors.textMuted, fontSize: 8 }, lineTotalCost: { marginTop: 5, color: '#D6A27B', fontSize: 8, fontWeight: '800' }, lineTotalValue: { color: Colors.orangeLight, fontSize: 16, fontWeight: '900' },
  priceComparison: { padding: 12, gap: 8, borderRadius: 15, backgroundColor: '#38BDF80A', borderWidth: 1, borderColor: '#38BDF82E' }, priceComparisonWarning: { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B4A' }, priceComparisonLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 }, priceComparisonValue: { marginTop: 4, color: Colors.textPrimary, fontSize: 12, fontWeight: '800' }, priceComparisonMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, priceComparisonMetaText: { color: Colors.textSecondary, fontSize: 10 }, priceComparisonVariance: { color: '#38BDF8', fontSize: 11, fontWeight: '900' }, priceComparisonAlert: { color: Colors.warning, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  differenceBox: { gap: 8, padding: 10, borderRadius: 15, backgroundColor: '#F59E0B08', borderWidth: 1, borderColor: '#F59E0B2E' }, differenceReasons: { gap: 7 }, differenceChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, differenceChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orangeMid }, differenceChipText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800' }, differenceChipTextActive: { color: Colors.orange },
  stockItemToggle: { minHeight: 64, paddingHorizontal: 13, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: Colors.cardBorder }, stockItemToggleActive: { backgroundColor: '#22C55E0A', borderColor: '#22C55E33' }, stockItemText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '900' }, stockItemTextActive: { color: Colors.success }, stockItemHint: { marginTop: 4, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, stockSwitchTrack: { width: 48, height: 28, padding: 3, borderRadius: 14, backgroundColor: '#37343C', justifyContent: 'center' }, stockSwitchTrackActive: { backgroundColor: '#22C55E55' }, stockSwitchThumb: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B8790' }, stockSwitchThumbActive: { marginLeft: 20, backgroundColor: '#5EEAA4' },
  addLine: { minHeight: 50, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.orangeMid, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, addLineText: { color: Colors.orange, fontSize: 12, fontWeight: '900' }, importButton: { padding: 15, borderRadius: 18, backgroundColor: '#38BDF810', borderWidth: 1, borderColor: '#38BDF833', flexDirection: 'row', alignItems: 'center', gap: 12 }, importTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '900' }, importText: { maxWidth: 290, marginTop: 3, color: Colors.textSecondary, fontSize: 10, lineHeight: 15 },
  savedAttachments: { marginTop: 14, padding: 11, borderWidth: 1, borderColor: '#38BDF82B', borderRadius: 18, backgroundColor: '#38BDF806' }, attachmentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }, attachmentSectionKicker: { color: '#7DD3FC', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, attachmentSectionTitle: { color: Colors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 3 }, downloadAll: { minHeight: 38, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: '#38BDF84A', backgroundColor: '#38BDF812', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, downloadDisabled: { opacity: 0.5 }, downloadAllText: { color: '#7DD3FC', fontSize: 9, fontWeight: '900' }, attachmentList: { gap: 7 }, attachmentCard: { minHeight: 58, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, attachmentPending: { borderColor: '#FBBF2438', backgroundColor: '#FBBF2408' }, attachmentIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#38BDF810' }, attachmentName: { color: Colors.textPrimary, fontSize: 11, fontWeight: '800' }, attachmentMeta: { marginTop: 3, color: Colors.textMuted, fontSize: 9 }, attachmentRemove: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FB718510' }, attachmentDownload: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: '#38BDF838', backgroundColor: '#38BDF80F', alignItems: 'center', justifyContent: 'center' },
  reviewGuide: { padding: 11, borderRadius: 16, backgroundColor: '#22C55E08', borderWidth: 1, borderColor: '#22C55E22', flexDirection: 'row', alignItems: 'center', gap: 10 }, reviewGuideNumber: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E13' }, reviewGuideNumberText: { color: '#5EEAA4', fontSize: 9, fontWeight: '900' }, reviewGuideTitle: { color: Colors.textPrimary, fontSize: 10, fontWeight: '900' }, reviewGuideText: { marginTop: 3, color: Colors.textMuted, fontSize: 8, lineHeight: 12 }, reviewReady: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: '#22C55E10', flexDirection: 'row', alignItems: 'center', gap: 4 }, reviewReadyText: { color: '#5EEAA4', fontSize: 7, fontWeight: '900' },
  quantitySummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, reviewMetric: { width: '48.5%', minHeight: 86, padding: 11, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }, reviewMetricWide: { width: '100%', minHeight: 76 }, reviewMetricIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08' }, reviewMetricLabel: { color: Colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 }, reviewMetricValue: { marginTop: 3, color: Colors.textPrimary, fontSize: 18, fontWeight: '900' }, reviewMetricHint: { marginTop: 2, color: Colors.textMuted, fontSize: 8 }, reviewTonePurple: { backgroundColor: '#A78BFA08', borderColor: '#A78BFA24' }, reviewToneBlue: { backgroundColor: '#38BDF808', borderColor: '#38BDF824' }, reviewToneGreen: { backgroundColor: '#22C55E08', borderColor: '#22C55E28' }, reviewToneRed: { backgroundColor: '#FB718508', borderColor: '#FB718526' }, reviewToneTeal: { backgroundColor: '#2DD4BF0A', borderColor: '#2DD4BF2B' },
  totalCard: { padding: 12, borderRadius: 21, backgroundColor: '#F9731609', borderWidth: 1, borderColor: '#F9731638', gap: 9 }, totalMetric: { minHeight: 61, padding: 10, borderRadius: 15, backgroundColor: '#17161A', borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }, totalMetricIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, totalLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900' }, totalSub: { marginTop: 3, color: Colors.textPrimary, fontSize: 14, fontWeight: '900' }, totalHint: { marginTop: 3, color: Colors.textMuted, fontSize: 8 }, totalMain: { minHeight: 69, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#F9731612', borderWidth: 1, borderColor: Colors.orangeMid, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, totalMainLabel: { color: Colors.orangeLight, fontSize: 9, fontWeight: '900' }, totalMainValue: { color: Colors.orangeLight, fontSize: 20, fontWeight: '900' },
  stickyActions: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, gap: 8, backgroundColor: '#111111F7', borderTopWidth: 1, borderTopColor: Colors.cardBorder }, stickyPrimaryRow: { flexDirection: 'row', gap: 9 }, deleteNirAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#FB718530', backgroundColor: '#FB71850A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, deleteNirActionText: { color: '#FDA4AF', fontSize: 10, fontWeight: '900' }, deleteNirActionHint: { color: '#73676C', fontSize: 8, fontWeight: '700' }, secondaryAction: { flex: 0.8, minHeight: 52, borderRadius: 17, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryActionText: { color: Colors.textPrimary, fontWeight: '900' }, confirmAction: { flex: 1.4, minHeight: 52, paddingHorizontal: 15, borderRadius: 17, backgroundColor: Colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, confirmActionText: { color: Colors.white, fontWeight: '900', fontSize: 12 }, correctNirAction: { minHeight: 58, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: '#FBBF2442', backgroundColor: '#FBBF240D', flexDirection: 'row', alignItems: 'center', gap: 11 }, correctNirActionText: { color: '#FDE68A', fontSize: 12, fontWeight: '900' }, correctNirActionHint: { marginTop: 3, color: '#9C8B69', fontSize: 8, lineHeight: 12 }, reverseNirAction: { minHeight: 52, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: '#FB718538', backgroundColor: '#FB71850A', flexDirection: 'row', alignItems: 'center', gap: 11 }, reverseNirActionText: { color: '#FDA4AF', fontSize: 11, fontWeight: '900' }, reverseNirActionHint: { marginTop: 3, color: '#8F747C', fontSize: 8, lineHeight: 12 },
  deleteBackdrop: { flex: 1, padding: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050407E8' }, deleteDialog: { position: 'relative', width: '100%', maxWidth: 520, overflow: 'hidden', padding: 22, borderRadius: 27, backgroundColor: '#1C191D', borderWidth: 1, borderColor: '#FB718548', shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 22 }, deleteDialogAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#E11D48' }, deleteDialogIcon: { width: 59, height: 59, marginBottom: 17, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FB718516', borderWidth: 1, borderColor: '#FB71854A' }, deleteDialogEyebrow: { color: '#FB7185', fontSize: 8, fontWeight: '900', letterSpacing: 1.15 }, deleteDialogTitle: { marginTop: 7, color: '#FFF5F6', fontSize: 22, lineHeight: 27, fontWeight: '900' }, deleteDialogMessage: { marginTop: 7, color: '#ADA3A8', fontSize: 12, lineHeight: 19 }, deleteDialogDocument: { marginTop: 17, minHeight: 67, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: '#FFFFFF0D', flexDirection: 'row', alignItems: 'center', gap: 10 }, deleteDialogDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#FFFFFF0D' }, deleteDialogMetaLabel: { color: '#766E73', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, deleteDialogMetaValue: { marginTop: 5, color: '#F1EBEE', fontSize: 10, fontWeight: '900' }, deleteDialogWarning: { marginTop: 10, padding: 11, borderRadius: 15, backgroundColor: '#F59E0B0C', borderWidth: 1, borderColor: '#F59E0B30', flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, deleteDialogWarningTitle: { color: '#F5D695', fontSize: 9, fontWeight: '900' }, deleteDialogWarningText: { marginTop: 3, color: '#8E8582', fontSize: 9, lineHeight: 14 }, deleteDialogCancel: { minHeight: 49, marginTop: 17, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#29262B', borderWidth: 1, borderColor: '#403B42' }, deleteDialogCancelText: { color: '#E4DDE1', fontSize: 11, fontWeight: '900' }, deleteDialogConfirm: { minHeight: 49, marginTop: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#D81747', borderWidth: 1, borderColor: '#FB71856B' }, deleteDialogConfirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, reverseDialog: { borderColor: '#FB718548' }, reverseDialogAccent: { backgroundColor: '#F43F5E' }, reverseDialogIcon: { backgroundColor: '#FB718512', borderColor: '#FB718542' }, reverseReasonLabel: { marginTop: 16, marginBottom: 7, color: '#9A8D93', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, reverseReasonInput: { minHeight: 88, paddingHorizontal: 13, paddingVertical: 11, borderRadius: 15, borderWidth: 1, borderColor: '#4A4147', backgroundColor: '#151316', color: '#F4EEF1', fontSize: 12, lineHeight: 18, textAlignVertical: 'top' }, reverseReasonInputInvalid: { borderColor: '#FB7185', backgroundColor: '#FB71850A' }, reverseReasonError: { marginTop: 5, color: '#FDA4AF', fontSize: 9, fontWeight: '800' }, reverseDialogConfirm: { backgroundColor: '#C81E4D' },
  stornoDialog: { maxHeight: '94%', padding: 0 }, stornoDialogContent: { padding: 18, paddingLeft: 21 }, stornoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 13 }, stornoTitleIcon: { flexShrink: 0, marginBottom: 0 }, stornoDialogTitle: { marginTop: 4, color: '#FFF5F6', fontSize: 21, lineHeight: 25, fontWeight: '900' }, stornoSelectionHead: { marginTop: 17, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 }, stornoSectionEyebrow: { color: '#FB7185', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 }, stornoSectionTitle: { marginTop: 4, color: '#E5DEE2', fontSize: 10, lineHeight: 14, fontWeight: '800' }, stornoAllButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FB71850D', borderWidth: 1, borderColor: '#FB71853A' }, stornoAllButtonText: { color: '#FDA4AF', fontSize: 9, fontWeight: '900' }, stornoLineList: { gap: 8 }, stornoLineCard: { padding: 10, borderRadius: 17, backgroundColor: '#151316', borderWidth: 1, borderColor: '#373238', gap: 9 }, stornoLineCardSelected: { backgroundColor: '#FB718508', borderColor: '#FB718542' }, stornoLineChoice: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 9 }, stornoCheckbox: { width: 24, height: 24, flexShrink: 0, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF07', borderWidth: 1, borderColor: '#62565D' }, stornoCheckboxSelected: { backgroundColor: '#FB7185', borderColor: '#FDA4AF' }, stornoLineName: { color: '#F4EEF1', fontSize: 11, lineHeight: 15, fontWeight: '900' }, stornoLineMeta: { marginTop: 4, color: '#8F858B', fontSize: 8, fontWeight: '700' }, stornoQuantityWrap: { minHeight: 45, paddingHorizontal: 10, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: '#FFFFFF0C' }, stornoQuantityDisabled: { opacity: 0.38 }, stornoQuantityLabel: { color: '#8F858B', fontSize: 7, fontWeight: '900', letterSpacing: 0.6 }, stornoQuantityInput: { flex: 1, minWidth: 55, paddingVertical: 8, color: '#FFF5F6', fontSize: 13, fontWeight: '900', textAlign: 'right' }, stornoQuantityUnit: { minWidth: 26, color: '#FDA4AF', fontSize: 9, fontWeight: '900' }, stornoEmpty: { padding: 18, borderRadius: 17, alignItems: 'center', backgroundColor: '#FB718507', borderWidth: 1, borderColor: '#FB71852E' }, stornoEmptyTitle: { marginTop: 8, color: '#F4EEF1', fontSize: 11, fontWeight: '900' }, stornoEmptyText: { marginTop: 4, color: '#8F858B', fontSize: 9, lineHeight: 14, textAlign: 'center' }, stornoError: { marginTop: 10, padding: 10, borderRadius: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FB71850C', borderWidth: 1, borderColor: '#FB718539' }, stornoErrorText: { flex: 1, color: '#FDA4AF', fontSize: 9, lineHeight: 14, fontWeight: '800' }, stornoNotice: { borderColor: '#22C55E48' }, stornoNoticeIcon: { width: 59, height: 59, marginBottom: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E12', borderWidth: 1, borderColor: '#22C55E42' }, stornoNoticeEyebrow: { color: '#5EEAA4', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, stornoNoticeTitle: { marginTop: 6, color: '#F0FFF5', fontSize: 21, lineHeight: 26, fontWeight: '900' }, stornoNoticeText: { marginTop: 7, color: '#A6B7AC', fontSize: 11, lineHeight: 18 }, stornoNoticeAction: { minHeight: 49, marginTop: 18, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E', borderWidth: 1, borderColor: '#5EEAA4' }, stornoNoticeActionText: { color: '#07130B', fontSize: 11, fontWeight: '900' },
  stornoOriginalInvoice: { marginTop: 12, padding: 12, borderRadius: 17, backgroundColor: '#38BDF807', borderWidth: 1, borderColor: '#38BDF82E' }, stornoOriginalInvoiceHead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, stornoOriginalInvoiceIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#38BDF810', borderWidth: 1, borderColor: '#38BDF831' }, stornoOriginalInvoiceEyebrow: { color: '#7DD3FC', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, stornoOriginalInvoiceTitle: { marginTop: 3, color: '#EDF9FF', fontSize: 12, fontWeight: '900' }, stornoOriginalInvoiceFacts: { marginTop: 11, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#38BDF81E', flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stornoOriginalInvoiceFact: { flexGrow: 1, minWidth: '29%', padding: 9, borderRadius: 12, backgroundColor: '#FFFFFF04' }, stornoOriginalInvoiceLabel: { color: '#7E8D96', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.5 }, stornoOriginalInvoiceValue: { marginTop: 4, color: '#E9F5FA', fontSize: 9, fontWeight: '900' }, stornoOriginalInvoiceAmount: { color: '#7DD3FC' }, stornoInvoiceFields: { marginTop: 13, gap: 10 }, stornoInvoiceField: { width: '100%' }, stornoInvoiceInputWrap: { minHeight: 49, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#151316', borderWidth: 1, borderColor: '#4A4147', flexDirection: 'row', alignItems: 'center', gap: 8 }, stornoInvoiceInput: { flex: 1, minWidth: 0, paddingVertical: 10, color: '#FFF5F6', fontSize: 12, fontWeight: '800' }, stornoInvoiceHint: { marginTop: 5, marginLeft: 3, color: '#786E74', fontSize: 8, lineHeight: 12 },
  stornoDocuments: { marginTop: 14, padding: 11, borderRadius: 16, backgroundColor: '#38BDF807', borderWidth: 1, borderColor: '#38BDF82B' }, stornoDocumentButton: { minHeight: 37, paddingHorizontal: 11, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#38BDF80D', borderWidth: 1, borderColor: '#38BDF838' }, stornoDocumentButtonText: { color: '#7DD3FC', fontSize: 9, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay }, sheet: { padding: 16, maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.cardBorder }, sheetHeader: { marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '900' }, pickerExplanation: { marginBottom: 8, padding: 11, borderRadius: 13, backgroundColor: '#22C55E0B', color: '#98B6A1', fontSize: 9, lineHeight: 14 }, pickerRow: { minHeight: 76, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 11 }, pickerIcon: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08' }, pickerImage: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#FFFFFF08' }, pickerTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, pickerMeta: { marginTop: 4, color: Colors.textMuted, fontSize: 11 }, inlineCreate: { gap: 12, marginTop: 14 },
  detailTabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: Colors.surface }, detailTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }, detailTabActive: { backgroundColor: Colors.card }, detailTabText: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' }, detailTabTextActive: { color: Colors.orange }, movementBoard: { overflow: 'hidden', borderRadius: 22, borderWidth: 1, borderColor: '#2DD4BF30', backgroundColor: '#17171A' }, movementBoardHeader: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#2DD4BF08', borderBottomWidth: 1, borderBottomColor: '#2DD4BF1F' }, movementBoardIcon: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2DD4BF12', borderWidth: 1, borderColor: '#2DD4BF35' }, movementBoardEyebrow: { color: '#5EEAD4', fontSize: 7, fontWeight: '900', letterSpacing: 0.9 }, movementBoardTitle: { marginTop: 3, color: Colors.textPrimary, fontSize: 14, fontWeight: '900' }, movementBoardText: { marginTop: 3, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, movementCount: { minWidth: 54, height: 49, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: '#FFFFFF0D' }, movementCountValue: { color: '#5EEAD4', fontSize: 16, fontWeight: '900' }, movementCountLabel: { marginTop: 1, color: Colors.textMuted, fontSize: 6, fontWeight: '900', letterSpacing: 0.6 }, movementSummary: { padding: 10, flexDirection: 'row', gap: 7 }, movementSummaryLabel: { color: Colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 }, movementSummaryValue: { marginTop: 4, color: Colors.textPrimary, fontSize: 13, fontWeight: '900' }, movementPositive: { color: '#5EEAA4' }, movementNegative: { color: '#FDA4AF' }, movementList: { padding: 10, paddingTop: 3, gap: 8 }, movementCard: { minHeight: 134, padding: 11, borderRadius: 17, borderWidth: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#1D1C20' }, movementCardIn: { borderColor: '#22C55E29' }, movementCardOut: { borderColor: '#FB718538', backgroundColor: '#211A1E' }, movementDirection: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, movementDirectionIn: { backgroundColor: '#22C55E10', borderColor: '#22C55E30' }, movementDirectionOut: { backgroundColor: '#FB718510', borderColor: '#FB718538' }, movementMain: { flex: 1, minWidth: 0 }, movementCardTop: { minHeight: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7 }, movementType: { fontSize: 8, fontWeight: '900', letterSpacing: 0.55 }, movementDate: { color: Colors.textMuted, fontSize: 8 }, movementProduct: { marginTop: 7, color: Colors.textPrimary, fontSize: 12, lineHeight: 16, fontWeight: '900' }, movementNote: { marginTop: 4, color: Colors.textSecondary, fontSize: 9, lineHeight: 13 }, movementFacts: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: '#FFFFFF0A', flexDirection: 'row', gap: 12 }, movementFactLabel: { color: Colors.textMuted, fontSize: 6, fontWeight: '900', letterSpacing: 0.5 }, movementFactValue: { marginTop: 3, color: Colors.textPrimary, fontSize: 9, fontWeight: '900' }, movementEmpty: { padding: 30, alignItems: 'center' }, movementEmptyTitle: { marginTop: 9, color: Colors.textPrimary, fontSize: 12, fontWeight: '900' }, movementEmptyText: { marginTop: 4, maxWidth: 260, color: Colors.textMuted, fontSize: 9, lineHeight: 14, textAlign: 'center' }, exportRow: { flexDirection: 'row', gap: 10 }, exportButton: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: Colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, exportText: { color: Colors.textPrimary, fontWeight: '800' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quickGuide: { marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#5EEAD424', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, guideItem: { alignItems: 'center', gap: 5 }, guideBubble: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD414', borderWidth: 1, borderColor: '#5EEAD43A' }, guideBubbleText: { color: '#5EEAD4', fontSize: 9, fontWeight: '900' }, guideLabel: { color: '#A9C8C3', fontSize: 9, fontWeight: '800' }, guideLine: { flex: 1, height: 1, marginHorizontal: 8, backgroundColor: '#5EEAD426' },
  flowGuide: { padding: 17, borderRadius: 22, backgroundColor: '#121B1B', borderWidth: 1, borderColor: '#2DD4BF38', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }, flowGuideHead: { marginBottom: 18 }, flowGuideEyebrow: { color: '#5EEAD4', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, flowGuideTitle: { marginTop: 5, color: Colors.textPrimary, fontSize: 17, fontWeight: '900' }, flowGuideText: { marginTop: 5, color: Colors.textMuted, fontSize: 9, lineHeight: 14 }, flowGuideRow: { flexDirection: 'row', alignItems: 'flex-start' }, flowGuideItem: { alignItems: 'center', width: 52, gap: 7 }, flowGuideIcon: { position: 'relative', width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD410', borderWidth: 1, borderColor: '#5EEAD440' }, flowGuideBadge: { position: 'absolute', right: -4, bottom: -3, width: 17, height: 17, borderRadius: 6, color: '#071513', backgroundColor: '#2DD4BF', textAlign: 'center', lineHeight: 17, fontSize: 8, fontWeight: '900', overflow: 'hidden' }, flowGuideLabel: { color: '#A9C8C3', fontSize: 8, fontWeight: '900', textAlign: 'center' }, flowGuideLine: { position: 'relative', flex: 1, height: 5, marginTop: 19, overflow: 'visible', backgroundColor: '#5EEAD414', borderRadius: 99 }, flowGuideLineFill: { position: 'absolute', left: 0, right: 0, top: 1, height: 3, borderRadius: 99, backgroundColor: '#2DD4BF', transformOrigin: 'left center' }, flowGuideArrow: { position: 'absolute', right: -2, top: -2, width: 7, height: 7, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#99F6E4', transform: [{ rotate: '45deg' }] },
  editorStepCard: { padding: 14, borderRadius: 22, backgroundColor: '#1B1A1E', borderWidth: 1, borderColor: Colors.cardBorder, gap: 12 }, editorStepCardLines: { paddingHorizontal: 10 }, stepHint: { padding: 11, borderRadius: 14, backgroundColor: '#FFFFFF05', flexDirection: 'row', alignItems: 'center', gap: 9 }, stepHintNumber: { width: 24, height: 24, borderRadius: 8, color: Colors.orange, backgroundColor: Colors.orangeDim, textAlign: 'center', lineHeight: 24, fontSize: 9, fontWeight: '900' }, stepHintText: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15 },
  lineGuide: { padding: 11, borderRadius: 16, backgroundColor: '#A78BFA08', borderWidth: 1, borderColor: '#A78BFA22', gap: 11 }, lineGuideLead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, lineGuideEyebrow: { color: '#A78BFA', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, lineGuideLeadText: { marginTop: 2, color: '#D8D2DD', fontSize: 10, fontWeight: '800' }, lineGuideTrack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lineGuideStep: { minWidth: 70, flexDirection: 'row', alignItems: 'center', gap: 6 }, lineGuideNumber: { width: 25, height: 25, borderRadius: 8, color: '#EDE9FE', backgroundColor: '#7C3AED55', textAlign: 'center', lineHeight: 25, fontSize: 9, fontWeight: '900', overflow: 'hidden' }, lineGuideTitle: { color: '#D8D2DD', fontSize: 8, fontWeight: '900' }, lineGuideDetail: { marginTop: 2, color: '#746E7B', fontSize: 6.5, fontWeight: '700' }, lineGuideArrow: { color: '#A78BFA', fontSize: 13, fontWeight: '900' }, lineGuideConnector: { flex: 1, height: 1, marginTop: 13, marginHorizontal: 8, backgroundColor: '#A78BFA28' },
  lineStage: { padding: 12, borderRadius: 18, backgroundColor: '#201F24', borderWidth: 1, borderColor: '#36333B', gap: 11 }, lineStageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#343139' }, lineStageIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF07', borderWidth: 1, borderColor: Colors.cardBorder }, lineStageNumber: { position: 'absolute', right: 3, bottom: 2, color: Colors.textMuted, fontSize: 7, fontWeight: '900' }, lineStageTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' }, lineStageSubtitle: { marginTop: 3, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, supplierContext: { padding: 10, borderRadius: 13, backgroundColor: '#2DD4BF09', borderWidth: 1, borderColor: '#2DD4BF25' }, supplierContextLabel: { color: '#6CA9A0', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, supplierContextValue: { marginTop: 4, color: '#B8EAE3', fontSize: 11, fontWeight: '800' }, associationActions: { flexDirection: 'row', gap: 8 }, stageExplanation: { color: Colors.textMuted, fontSize: 9, lineHeight: 14 },
  stornoM3Dialog: { maxWidth: 600, maxHeight: '96%', borderRadius: 32, borderColor: '#655B67', backgroundColor: '#211F26' },
  stornoM3DialogContent: { padding: 22, paddingLeft: 26, paddingBottom: 28 },
  stornoM3TitleRow: { alignItems: 'flex-start', gap: 15 },
  stornoM3TitleIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#4B252F', borderColor: '#7A5A65' },
  stornoM3Eyebrow: { color: '#FFB2BC', fontSize: 9, lineHeight: 13, letterSpacing: 1 },
  stornoM3DialogTitle: { color: '#FFF7F8', fontSize: 25, lineHeight: 30 },
  stornoM3Message: { color: '#CFC4C8', fontSize: 13, lineHeight: 20 },
  stornoM3Surface: { marginTop: 16, padding: 15, borderRadius: 22, borderColor: '#4A444D', backgroundColor: '#2B2930' },
  stornoM3MetaLabel: { color: '#AAA0A8', fontSize: 8, lineHeight: 12, letterSpacing: 0.7 },
  stornoM3MetaValue: { color: '#FFF7F8', fontSize: 12, lineHeight: 17 },
  stornoM3TonalIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#4B252F', borderWidth: 1, borderColor: '#765965' },
  stornoM3SectionHeading: { marginTop: 3, color: '#FFF7F8', fontSize: 14, lineHeight: 19, fontWeight: '900' },
  stornoM3Facts: { marginTop: 13, paddingTop: 12, borderTopColor: '#4A444D', gap: 9 },
  stornoM3Fact: { minWidth: '29%', padding: 11, borderRadius: 14, backgroundColor: '#242229' },
  stornoM3Amount: { color: '#FFB2BC', fontSize: 13 },
  stornoM3InvoiceSection: { marginTop: 16, padding: 15, borderRadius: 22, borderWidth: 1, borderColor: '#4A444D', backgroundColor: '#2B2930' },
  stornoM3SectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  stornoM3InvoiceFields: { marginTop: 15, gap: 12 },
  stornoM3FieldLabel: { marginTop: 14, marginBottom: 8, color: '#C5BBC1', fontSize: 9, lineHeight: 13, letterSpacing: 0.75 },
  stornoM3InputWrap: { minHeight: 54, paddingHorizontal: 14, borderRadius: 17, borderColor: '#5A525C', backgroundColor: '#1D1B20' },
  stornoM3Input: { color: '#FFF7F8', fontSize: 14, lineHeight: 19 },
  stornoM3Hint: { color: '#AAA0A8', fontSize: 10, lineHeight: 15 },
  stornoM3SectionTitle: { marginTop: 5, color: '#F1E8ED', fontSize: 12, lineHeight: 17 },
  stornoM3Pill: { minHeight: 43, paddingHorizontal: 15, borderRadius: 999, borderColor: '#765965', backgroundColor: '#4B252F' },
  stornoM3PillText: { color: '#FFD9DE', fontSize: 10 },
  stornoM3Attachment: { minHeight: 62, borderColor: '#4A444D', backgroundColor: '#242229' },
  stornoM3SelectionHead: { marginTop: 20, marginBottom: 12 },
  stornoM3LineCard: { padding: 13, borderRadius: 22, borderColor: '#4A444D', backgroundColor: '#242229', gap: 11 },
  stornoM3LineCardSelected: { borderColor: '#8A6571', backgroundColor: '#34272D' },
  stornoM3Checkbox: { width: 27, height: 27, borderRadius: 9, borderColor: '#777078', backgroundColor: '#2B2930' },
  stornoM3CheckboxSelected: { borderColor: '#FFB2BC', backgroundColor: '#FFB2BC' },
  stornoM3LineName: { color: '#FFF7F8', fontSize: 13, lineHeight: 18 },
  stornoM3LineMeta: { color: '#AAA0A8', fontSize: 10, lineHeight: 15 },
  stornoM3QuantityWrap: { width: 190, maxWidth: '100%', minHeight: 48, alignSelf: 'flex-end', paddingHorizontal: 11, borderRadius: 16, borderColor: '#5A525C', backgroundColor: '#1D1B20' },
  stornoM3QuantityDisabled: { opacity: 1, borderColor: '#403A42', backgroundColor: '#19171C' },
  stornoM3QuantityLabel: { color: '#B9AFB5', fontSize: 8, letterSpacing: 0.7 },
  stornoM3QuantityInput: { color: '#FFF7F8', fontSize: 15, lineHeight: 20 },
  stornoM3QuantityInputDisabled: { color: '#8D838A', fontSize: 11 },
  stornoM3QuantityUnit: { color: '#FFB2BC', fontSize: 10 },
  stornoM3ReasonInput: { minHeight: 112, paddingHorizontal: 15, paddingVertical: 14, borderRadius: 18, borderColor: '#5A525C', backgroundColor: '#1D1B20', color: '#FFF7F8', fontSize: 13, lineHeight: 20 },
  stornoM3Cancel: { minHeight: 54, borderRadius: 999, borderColor: '#5A525C', backgroundColor: '#302D34' },
  stornoM3CancelText: { color: '#F1E8ED', fontSize: 12 },
  stornoM3Confirm: { minHeight: 56, borderRadius: 999, borderColor: '#FFB2BC', backgroundColor: '#FFB2BC' },
  stornoM3ConfirmText: { color: '#5F1128', fontSize: 12 },
  bundleDownloadButton: { minHeight: 76, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: '#2DD4BF55', backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', gap: 11, shadowColor: '#2DD4BF', shadowOpacity: 0.22, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 4 },
  bundleDownloadIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF55' },
  bundleDownloadTitle: { color: '#071513', fontSize: 13, fontWeight: '900' }, bundleDownloadText: { marginTop: 3, color: '#0F5952', fontSize: 9, lineHeight: 13, fontWeight: '700' },
  registryDownloadOpen: { minHeight: 44, paddingHorizontal: 14, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, shadowColor: '#2DD4BF', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 }, registryDownloadOpenText: { color: '#071513', fontSize: 10, fontWeight: '900' },
  registryDownloadBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#050609E8' }, registryDownloadSheet: { maxHeight: '92%', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, borderColor: '#38BDF83D', backgroundColor: '#1D1B20', overflow: 'hidden' }, registryDownloadHandle: { width: 42, height: 4, marginTop: 9, marginBottom: 5, alignSelf: 'center', borderRadius: 99, backgroundColor: '#625D65' },
  registryDownloadHeader: { paddingHorizontal: 17, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#FFFFFF0D', flexDirection: 'row', alignItems: 'center', gap: 12 }, registryDownloadHeaderIcon: { width: 52, height: 52, borderRadius: 18, borderWidth: 1, borderColor: '#38BDF843', backgroundColor: '#38BDF812', alignItems: 'center', justifyContent: 'center' }, registryDownloadEyebrow: { color: '#5EEAD4', fontSize: 7, fontWeight: '900', letterSpacing: 1 }, registryDownloadTitle: { marginTop: 3, color: '#F8F5F2', fontSize: 19, lineHeight: 24, fontWeight: '900' }, registryDownloadIntro: { marginTop: 3, color: '#A29BA4', fontSize: 9, lineHeight: 13 }, registryDownloadClose: { width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: '#FFFFFF12', backgroundColor: '#FFFFFF08', alignItems: 'center', justifyContent: 'center' },
  registryDownloadBody: { padding: 17, paddingBottom: 6, gap: 14 }, registryDownloadSectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 }, registryDownloadStep: { width: 30, height: 30, borderRadius: 10, overflow: 'hidden', backgroundColor: '#38BDF814', color: '#7DD3FC', textAlign: 'center', lineHeight: 30, fontSize: 8, fontWeight: '900' }, registryDownloadSectionHeading: { color: '#EEE9ED', fontSize: 13, fontWeight: '900' }, registryDownloadSectionHint: { marginTop: 2, color: '#807981', fontSize: 9 },
  registryContentOptions: { gap: 8 }, registryContentOption: { minHeight: 72, padding: 11, borderRadius: 18, borderWidth: 1, borderColor: '#403C43', backgroundColor: '#242228', flexDirection: 'row', alignItems: 'center', gap: 10 }, registryContentOptionActive: { borderColor: '#2DD4BF66', backgroundColor: '#2DD4BF0E' }, registryContentIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, borderColor: '#38BDF835', backgroundColor: '#38BDF80D', alignItems: 'center', justifyContent: 'center' }, registryContentIconActive: { borderColor: '#99F6E4', backgroundColor: '#5EEAD4' }, registryContentTitle: { color: '#F2EDF0', fontSize: 12, fontWeight: '900' }, registryContentHint: { marginTop: 3, color: '#918A93', fontSize: 8.5, lineHeight: 12 }, registryRadio: { width: 17, height: 17, borderRadius: 9, borderWidth: 2, borderColor: '#69636C' }, registryRadioActive: { borderWidth: 5, borderColor: '#5EEAD4', backgroundColor: '#0C211F' },
  registryPeriodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, registryPeriodChip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: '#403C43', backgroundColor: '#242228', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, registryPeriodChipActive: { borderColor: '#FB923C77', backgroundColor: '#F9731617' }, registryPeriodText: { color: '#D0C9D1', fontSize: 10, fontWeight: '900' }, registryPeriodTextActive: { color: '#FED7AA' }, registryCustomRange: { flexDirection: 'row', gap: 8, padding: 11, borderRadius: 17, borderWidth: 1, borderColor: '#F9731638', backgroundColor: '#F973160A' }, registryCustomLabel: { marginLeft: 3, marginBottom: 5, color: '#C29B7C', fontSize: 7, fontWeight: '900', letterSpacing: 0.6 }, registryCustomInput: { minHeight: 45, paddingHorizontal: 11, borderRadius: 13, borderWidth: 1, borderColor: '#54474A', backgroundColor: '#171519', color: '#FFF7F2', fontSize: 12, fontWeight: '800' },
  registryDownloadSummary: { padding: 12, borderRadius: 17, borderWidth: 1, borderColor: '#2DD4BF3D', backgroundColor: '#2DD4BF0C', flexDirection: 'row', alignItems: 'center', gap: 10 }, registryDownloadSummaryLabel: { color: '#5EEAD4', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, registryDownloadSummaryTitle: { marginTop: 3, color: '#DDFBF6', fontSize: 11, fontWeight: '900' }, registryDownloadSummaryText: { marginTop: 3, color: '#84AAA4', fontSize: 8.5 }, registryDownloadConfirm: { minHeight: 54, marginTop: 2, borderRadius: 18, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 }, registryDownloadConfirmText: { color: '#071513', fontSize: 12, fontWeight: '900' },
  exportProgressBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18, backgroundColor: '#050507F2' }, exportProgressCard: { width: '100%', maxWidth: 520, padding: 24, borderRadius: 30, borderWidth: 1, borderColor: '#FB923C55', backgroundColor: '#201D21', alignItems: 'center', shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 30, shadowOffset: { width: 0, height: 16 }, elevation: 16 }, exportProgressOrb: { position: 'relative', width: 72, height: 72, marginBottom: 17, borderRadius: 24, borderWidth: 1, borderColor: '#FB923C55', backgroundColor: '#F973161A', alignItems: 'center', justifyContent: 'center' }, exportProgressSpinner: { position: 'absolute', transform: [{ scale: 1.45 }] }, exportProgressEyebrow: { color: '#FB923C', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 }, exportProgressTitle: { marginTop: 7, color: '#FFF8F2', fontSize: 23, lineHeight: 29, fontWeight: '900', textAlign: 'center' }, exportProgressDetail: { marginTop: 6, color: '#AAA1A8', fontSize: 11, lineHeight: 17, textAlign: 'center' }, exportProgressStats: { width: '100%', marginTop: 22, flexDirection: 'row', gap: 7 }, exportProgressStat: { flex: 1, minHeight: 64, padding: 8, borderRadius: 17, borderWidth: 1, borderColor: '#FFFFFF12', backgroundColor: '#FFFFFF08', alignItems: 'center', justifyContent: 'center' }, exportProgressStatValue: { color: '#FFF2E6', fontSize: 15, fontWeight: '900' }, exportProgressStatLabel: { marginTop: 3, color: '#8F878E', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.6 }, exportProgressMeta: { width: '100%', marginTop: 21, marginBottom: 9, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, exportProgressPercent: { color: '#FB923C', fontSize: 21, fontWeight: '900' }, exportProgressEta: { flex: 1, color: '#C9C0C7', fontSize: 9, lineHeight: 13, fontWeight: '800', textAlign: 'right' }, exportProgressTrack: { width: '100%', height: 12, padding: 2, borderRadius: 99, borderWidth: 1, borderColor: '#FB923C35', backgroundColor: '#0E0D10', overflow: 'hidden' }, exportProgressFill: { height: '100%', borderRadius: 99, backgroundColor: '#F97316' }, exportProgressFooter: { marginTop: 15, color: '#777077', fontSize: 8.5, lineHeight: 13, textAlign: 'center' },
});
