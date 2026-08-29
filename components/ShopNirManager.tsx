import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
  ArrowLeft,
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
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import {
  shopApi,
  ShopNirDocument,
  ShopNirLine,
  ShopNirPage,
  ShopProduct,
  ShopSupplier,
  ShopWarehouse,
} from '@/services/shopApi';

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const isLocalNir = (document: ShopNirDocument) => document.id.startsWith('local-nir-');
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
  reversed: { label: 'REVERSAT', color: '#EF4444', Icon: AlertTriangle },
} as const;

const differenceReasons = [
  ['shortage', 'Lipsă'], ['surplus', 'Surplus'], ['damaged', 'Deteriorat'], ['wrong_product', 'Produs greșit'],
  ['price_difference', 'Preț diferit'], ['vat_difference', 'TVA diferit'], ['rejected', 'Refuzat'], ['other', 'Alt motiv'],
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
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const [detailRows, setDetailRows] = useState<Record<string, unknown>[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<PendingNirAttachment[]>([]);
  const [dateTimePicker, setDateTimePicker] = useState<{ target: 'nir' | 'reception'; mode: 'date' | 'time'; value: Date } | null>(null);
  const [currencyPicker, setCurrencyPicker] = useState(false);
  const [currencySearch, setCurrencySearch] = useState('');
  const [rateLoading, setRateLoading] = useState(false);
  const [attachmentDownload, setAttachmentDownload] = useState<string | null>(null);
  const syncedDraftSignature = useRef('');
  const createDraftInFlight = useRef(false);
  const registryRequestId = useRef(0);
  const registryLoaded = useRef(false);
  const registrySearchReady = useRef(false);
  const codeResolveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const codeResolveRequestIds = useRef<Record<number, number>>({});
  const initialNirOpenedRef = useRef<string | null>(null);

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
    setPendingAttachments([]);
    syncedDraftSignature.current = '';
    setRegistryEpoch((value) => value + 1);
    setPage(1);
    void loadRegistry(1);
  };

  const requestLeaveEditor = () => {
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
    const supplierName = editor?.lines?.[index]?.supplier_product_name?.trim() || '';
    patchLine(index, { supplier_product_code, supplier_product_reference_id: null, product_id: null, product_name: '', resolution_status: supplier_product_code.trim() ? 'matching_code' : supplierName ? 'matching_name' : 'unmatched' });
    clearTimeout(codeResolveTimers.current[index]);
    const requestId = (codeResolveRequestIds.current[index] || 0) + 1;
    codeResolveRequestIds.current[index] = requestId;
    if ((!supplier_product_code.trim() && !supplierName) || !editor?.supplier_id) return;
    codeResolveTimers.current[index] = setTimeout(() => { void resolveLine(index, supplier_product_code, true, requestId, supplierName); }, 380);
  };

  const changeSupplierName = (index: number, supplier_product_name: string) => {
    const line = editor?.lines?.[index];
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
    patchLine(index, { product_id: product.id, product_name: product.name, product_image_url: product.images?.[0]?.url || null, supplier_product_reference_id: null, resolution_status: 'matched_manual' });
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
    if (!token || !editor || editor.status !== 'draft') return;
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
    if (!token || !editor || editor.status !== 'draft') return;
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

  const finalizeConfirmation = async (saved: ShopNirDocument) => {
    if (!token) return;
    setSaving(true);
    try {
      const key = `${saved.id}-${saved.row_version}-${Date.now()}`;
      const confirmed = await shopApi.confirmNir(token, saved.id, saved.row_version, key);
      setEditor(confirmed);
      await loadRegistry(page);
      Alert.alert('NIR confirmat', `${confirmed.nir_number} a actualizat stocul contabil.`);
    } catch (error) {
      Alert.alert('Confirmarea a eșuat', error instanceof Error ? error.message : 'Nicio modificare parțială nu a fost păstrată.');
    } finally {
      setSaving(false);
    }
  };

  const confirm = async () => {
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
    if (!token || !editor || editor.status !== 'confirmed' || saving) return;
    Alert.alert(
      'Corectezi acest NIR?',
      'Efectele actuale vor fi retrase controlat din stoc. Apoi poți modifica orice câmp, inclusiv furnizorul și produsele, și reconfirmi același număr NIR.',
      [
        { text: 'Renunță', style: 'cancel' },
        { text: 'Da, deschide editarea', onPress: async () => {
          setSaving(true);
          try {
            const reopened = await shopApi.reopenNir(token, editor.id, editor.row_version);
            syncedDraftSignature.current = nirDraftSignature(reopened);
            setPendingAttachments([]);
            setEditor(reopened);
            setDetailsTab('lines');
            setDetailRows([]);
            await loadRegistry(page);
            Alert.alert('NIR editabil', 'Poți modifica orice informație. Salvează și reconfirmă documentul după corectare.');
          } catch (error) {
            Alert.alert('NIR-ul nu s-a redeschis', error instanceof Error ? error.message : 'Încearcă din nou.');
          } finally { setSaving(false); }
        } },
      ],
    );
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

  const downloadAttachment = async (attachmentId: string) => {
    if (!token || !editor || attachmentDownload) return;
    setAttachmentDownload(attachmentId);
    try {
      const file = await shopApi.downloadNirAttachment(token, editor.id, attachmentId);
      await shareDownloadedFile(file, `Descarcă ${file.file_name}`);
    } catch (error) {
      Alert.alert('Documentul nu s-a descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setAttachmentDownload(null); }
  };

  const downloadAllAttachments = async () => {
    if (!token || !editor || attachmentDownload || !editor.attachments?.length) return;
    setAttachmentDownload('all');
    try {
      const file = await shopApi.downloadAllNirAttachments(token, editor.id);
      await shareDownloadedFile(file, `Descarcă toate documentele ${editor.nir_number || editor.temporary_number}`);
    } catch (error) {
      Alert.alert('Documentele nu s-au descărcat', error instanceof Error ? error.message : 'Încearcă din nou.');
    } finally { setAttachmentDownload(null); }
  };

  const filteredSuppliers = useMemo(() => suppliers.filter((supplier) => `${supplier.name} ${supplier.cui || ''}`.toLowerCase().includes(supplierSearch.toLowerCase())), [supplierSearch, suppliers]);
  const filteredCurrencies = useMemo(() => { const query = currencySearch.trim().toLowerCase(); return orderedCurrencies.filter((currency) => !query || `${currency} ${currencyName(currency)}`.toLowerCase().includes(query)); }, [currencySearch]);
  const quantitySummary = (editor?.lines || []).reduce((summary, line) => ({
    invoiced: summary.invoiced + Number(line.invoiced_quantity || 0), received: summary.received + Number(line.received_quantity || 0),
    accepted: summary.accepted + Number(line.accepted_quantity || 0), rejected: summary.rejected + Number(line.rejected_quantity || 0),
    stock: summary.stock + (editor?.status === 'draft' ? localLineTotals(line, editor.exchange_rate || '1').stockQuantity : Number(line.stock_quantity || 0)),
  }), { invoiced: 0, received: 0, accepted: 0, rejected: 0, stock: 0 });
  const liveTotals = (editor?.lines || []).map((line) => localLineTotals(line, editor?.exchange_rate || '1')).reduce((summary, line) => ({ netRon: summary.netRon + line.netRon, vatRon: summary.vatRon + line.vatRon, totalRon: summary.totalRon + line.totalRon }), { netRon: 0, vatRon: 0, totalRon: 0 });

  if (editor) {
    const editable = editor.status === 'draft';
    const currentStatus = statusInfo[editor.status];
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
            {!!editor.attachments?.length && <View style={styles.savedAttachments}><View style={styles.attachmentSectionHeader}><View style={{ flex: 1 }}><Text style={styles.attachmentSectionKicker}>DOCUMENTELE FURNIZORULUI</Text><Text style={styles.attachmentSectionTitle}>{editor.attachments.length} {editor.attachments.length === 1 ? 'document salvat' : 'documente salvate'}</Text></View>{!editable && <TouchableOpacity disabled={Boolean(attachmentDownload)} style={[styles.downloadAll, attachmentDownload && styles.downloadDisabled]} onPress={() => void downloadAllAttachments()}>{attachmentDownload === 'all' ? <ActivityIndicator size="small" color="#7DD3FC" /> : <FileDown size={16} color="#7DD3FC" />}<Text style={styles.downloadAllText}>Descarcă toate</Text></TouchableOpacity>}</View><View style={styles.attachmentList}>{editor.attachments.map((attachment) => <View style={styles.attachmentCard} key={attachment.id}><View style={styles.attachmentIcon}><FileDown size={16} color="#38BDF8" /></View><View style={{ flex: 1 }}><Text style={styles.attachmentName} numberOfLines={1}>{attachment.original_name}</Text><Text style={styles.attachmentMeta}>{attachment.extraction_status} · {Math.max(1, Math.round(attachment.file_size / 1024))} KB</Text></View><TouchableOpacity disabled={Boolean(attachmentDownload)} style={styles.attachmentDownload} onPress={() => void downloadAttachment(attachment.id)}>{attachmentDownload === attachment.id ? <ActivityIndicator size="small" color="#7DD3FC" /> : <FileDown size={16} color="#7DD3FC" />}</TouchableOpacity></View>)}</View></View>}
          </View></Reveal>

          {!editable && <>
            <View style={styles.detailTabs}><Tab label="Poziții" active={detailsTab === 'lines'} onPress={() => void loadDetailTab('lines')} /><Tab label="Mișcări de stoc" active={detailsTab === 'movements'} onPress={() => void loadDetailTab('movements')} /></View>
            {detailsTab === 'movements' && <View style={styles.auditList}>{detailRows.map((row, index) => <View style={styles.auditCard} key={String(row.id || index)}><View style={styles.auditDot} /><View style={{ flex: 1 }}><Text style={styles.auditTitle}>{String(row.product_name || row.movement_type || `Mișcare ${index + 1}`)}</Text><Text style={styles.auditMeta}>{String(row.accounting_quantity_delta || row.quantity_delta)} buc · {String(row.created_at || '')}</Text></View></View>)}</View>}
            <View style={styles.exportRow}><TouchableOpacity style={styles.exportButton} onPress={() => void exportDocument('pdf')}><FileDown size={17} color={Colors.textPrimary} /><Text style={styles.exportText}>PDF</Text></TouchableOpacity><TouchableOpacity style={styles.exportButton} onPress={() => void exportDocument('xlsx')}><FileDown size={17} color={Colors.textPrimary} /><Text style={styles.exportText}>Excel</Text></TouchableOpacity></View>
          </>}

          <Reveal delay={220}><View style={styles.editorStepCard}>
            <SectionTitle icon={<ShieldCheck size={18} color="#22C55E" />} index="05" title="Verifică documentul" subtitle="Controlează cantitățile și totalurile înainte de confirmare" />
            <View style={styles.reviewGuide}><View style={styles.reviewGuideNumber}><Text style={styles.reviewGuideNumberText}>05</Text></View><View style={{ flex: 1 }}><Text style={styles.reviewGuideTitle}>Compară cantitățile, apoi verifică valoarea finală</Text><Text style={styles.reviewGuideText}>Dacă există diferențe, corectează produsul înainte de confirmare.</Text></View><View style={styles.reviewReady}><CheckCircle2 size={13} color="#5EEAA4" /><Text style={styles.reviewReadyText}>GATA</Text></View></View>
            <View style={styles.quantitySummary}>
              <ReviewMetric icon={<FilePlus2 size={18} color="#A78BFA" />} label="FACTURAT" value={quantitySummary.invoiced} hint="pe factură" tone="purple" />
              <ReviewMetric icon={<Boxes size={18} color="#38BDF8" />} label="RECEPȚIONAT" value={quantitySummary.received} hint="numărat" tone="blue" />
              <ReviewMetric icon={<CheckCircle2 size={18} color="#5EEAA4" />} label="ACCEPTAT" value={quantitySummary.accepted} hint="conform" tone="green" />
              <ReviewMetric icon={<AlertTriangle size={18} color="#FB7185" />} label="RESPINS" value={quantitySummary.rejected} hint="nu intră" tone="red" />
              <ReviewMetric icon={<PackageSearch size={19} color="#5EEAD4" />} label="INTRĂ ÎN STOC" value={quantitySummary.stock} hint="cantitate finală" tone="teal" wide />
            </View>
            {can('NIR_VIEW_COSTS') && <View style={styles.totalCard}><View style={styles.totalMetric}><View style={[styles.totalMetricIcon, { backgroundColor: '#A78BFA16' }]}><CircleDollarSign size={17} color="#A78BFA" /></View><View><Text style={styles.totalLabel}>FĂRĂ TVA</Text><Text style={styles.totalSub}>{money(editable ? String(liveTotals.netRon) : editor.subtotal_ron)}</Text><Text style={styles.totalHint}>Bază de calcul</Text></View></View><View style={styles.totalMetric}><View style={[styles.totalMetricIcon, { backgroundColor: '#38BDF816' }]}><FilePlus2 size={17} color="#38BDF8" /></View><View><Text style={styles.totalLabel}>TVA</Text><Text style={styles.totalSub}>{money(editable ? String(liveTotals.vatRon) : editor.vat_total_ron)}</Text><Text style={styles.totalHint}>Valoarea taxei</Text></View></View><View style={styles.totalMain}><View><Text style={styles.totalMainLabel}>TOTAL CONTABIL RON</Text><Text style={styles.totalHint}>Valoarea confirmată</Text></View><Text style={styles.totalMainValue}>{money(editable ? String(liveTotals.totalRon) : editor.grand_total_ron)}</Text></View></View>}
            <Field label="OBSERVAȚII" value={editor.notes || ''} editable={editable} onChangeText={(value) => patchEditor({ notes: value })} placeholder="Detalii interne, diferențe sau documente justificative" multiline />
          </View></Reveal>
        </ScrollView>
        {editable && <View style={[styles.stickyActions, { paddingBottom: Math.max(insets.bottom, 10) }]}>{can('NIR_EDIT_DRAFT') && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Șterge NIR-ul" style={styles.deleteNirAction} disabled={saving || deleting} onPress={() => setDeleteDialog(true)}><Trash2 size={16} color="#FDA4AF" /><Text style={styles.deleteNirActionText}>Șterge NIR-ul</Text><Text style={styles.deleteNirActionHint}>ciorna și toate datele ei</Text></TouchableOpacity>}<View style={styles.stickyPrimaryRow}><TouchableOpacity style={styles.secondaryAction} disabled={saving || deleting} onPress={() => void saveDraft()}>{saving ? <ActivityIndicator color={Colors.textPrimary} /> : <><Save size={18} color={Colors.textPrimary} /><Text style={styles.secondaryActionText}>Salvează</Text></>}</TouchableOpacity><TouchableOpacity style={styles.confirmAction} disabled={saving || deleting || !can('NIR_CONFIRM')} onPress={() => void confirm()}><ShieldCheck size={19} color={Colors.white} /><Text style={styles.confirmActionText}>Verifică și confirmă</Text></TouchableOpacity></View></View>}
        {!editable && editor.status === 'confirmed' && can('NIR_EDIT_DRAFT') && can('NIR_CONFIRM') && <View style={[styles.stickyActions, { paddingBottom: Math.max(insets.bottom, 10) }]}><TouchableOpacity style={styles.correctNirAction} disabled={saving} onPress={reopenForCorrection}>{saving ? <ActivityIndicator color="#FBBF24" /> : <PencilLine size={19} color="#FBBF24" />}<View style={{ flex: 1 }}><Text style={styles.correctNirActionText}>Corectează NIR-ul</Text><Text style={styles.correctNirActionHint}>Modifică orice câmp și reconfirmă același document</Text></View><ChevronRight size={18} color="#FBBF24" /></TouchableOpacity></View>}
        {dateTimePicker && <DateTimePicker value={dateTimePicker.value} mode={Platform.OS === 'ios' ? 'datetime' : dateTimePicker.mode} display={Platform.OS === 'ios' ? 'compact' : 'default'} minuteInterval={1} is24Hour onChange={changeDateTimePicker} />}

        <Modal visible={deleteDialog} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !deleting && setDeleteDialog(false)}><Pressable style={styles.deleteBackdrop} onPress={() => !deleting && setDeleteDialog(false)}><Pressable style={styles.deleteDialog} onPress={(event) => event.stopPropagation()}><View style={styles.deleteDialogAccent} /><View style={styles.deleteDialogIcon}><Trash2 size={27} color="#FDA4AF" /></View><Text style={styles.deleteDialogEyebrow}>ȘTERGERE DEFINITIVĂ</Text><Text style={styles.deleteDialogTitle}>Ștergi această notă de intrare-recepție?</Text><Text style={styles.deleteDialogMessage}>Ești sigur că vrei să ștergi această notă de intrare-recepție marfă?</Text><View style={styles.deleteDialogDocument}><View style={{ flex: 1 }}><Text style={styles.deleteDialogMetaLabel}>DOCUMENT</Text><Text numberOfLines={1} style={styles.deleteDialogMetaValue}>{editor.nir_number || editor.temporary_number || 'NIR nesalvat'}</Text></View><View style={styles.deleteDialogDivider} /><View style={{ flex: 1 }}><Text style={styles.deleteDialogMetaLabel}>FURNIZOR</Text><Text numberOfLines={1} style={styles.deleteDialogMetaValue}>{editor.supplier_name || 'Necompletat'}</Text></View></View><View style={styles.deleteDialogWarning}><AlertTriangle size={18} color="#FBBF24" /><View style={{ flex: 1 }}><Text style={styles.deleteDialogWarningTitle}>Acțiunea nu poate fi anulată</Text><Text style={styles.deleteDialogWarningText}>Pozițiile, documentele atașate și toate datele acestei ciorne vor fi eliminate definitiv.</Text></View></View><TouchableOpacity disabled={deleting} style={styles.deleteDialogCancel} onPress={() => setDeleteDialog(false)}><Text style={styles.deleteDialogCancelText}>Nu, păstrează NIR-ul</Text></TouchableOpacity><TouchableOpacity disabled={deleting} style={styles.deleteDialogConfirm} onPress={() => void deleteNir()}>{deleting ? <ActivityIndicator color="#FFFFFF" /> : <><Trash2 size={17} color="#FFFFFF" /><Text style={styles.deleteDialogConfirmText}>Da, șterge definitiv</Text></>}</TouchableOpacity></Pressable></Pressable></Modal>

        <Modal visible={currencyPicker} transparent animationType="slide" onRequestClose={() => setCurrencyPicker(false)}><Pressable style={styles.backdrop} onPress={() => setCurrencyPicker(false)}><Pressable style={[styles.sheet, styles.currencySheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Alege moneda facturii" onClose={() => setCurrencyPicker(false)} /><SearchBox value={currencySearch} onChangeText={setCurrencySearch} placeholder="Caută după cod sau denumire" /><View style={styles.currencyCount}><CircleDollarSign size={15} color="#F59E0B" /><Text style={styles.currencyCountText}>{filteredCurrencies.length} monede disponibile</Text></View><ScrollView style={{ maxHeight: 510 }} contentContainerStyle={styles.currencyList}>{filteredCurrencies.map((currency) => <TouchableOpacity key={currency} style={[styles.currencyOption, currency === editor.currency && styles.currencyOptionActive]} onPress={() => selectCurrency(currency)}><View style={[styles.currencyOptionCode, currency === editor.currency && styles.currencyOptionCodeActive]}><Text style={[styles.currencyOptionCodeText, currency === editor.currency && styles.currencyOptionCodeTextActive]}>{currency}</Text></View><Text numberOfLines={1} style={styles.currencyOptionName}>{currencyName(currency)}</Text>{currency === editor.currency ? <CheckCircle2 size={18} color="#5EEAA4" /> : <ChevronRight size={17} color={Colors.textMuted} />}</TouchableOpacity>)}</ScrollView></Pressable></Pressable></Modal>

        <Modal visible={warehousePicker} transparent animationType="slide" onRequestClose={() => setWarehousePicker(false)}><Pressable style={styles.backdrop} onPress={() => setWarehousePicker(false)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Alege gestiunea" onClose={() => setWarehousePicker(false)} /><Text style={styles.pickerExplanation}>Aici va intra efectiv marfa după confirmarea NIR-ului.</Text><ScrollView style={{ maxHeight: 430 }}>{warehouses.map((warehouse) => <TouchableOpacity style={styles.pickerRow} key={warehouse.id} onPress={() => { patchEditor({ warehouse_id: warehouse.id, warehouse_name: warehouse.name }); setWarehousePicker(false); }}><View style={styles.pickerIcon}><Boxes size={19} color="#5EEAA4" /></View><View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{warehouse.name}</Text><Text style={styles.pickerMeta}>{warehouse.is_default ? 'Gestiune implicită' : 'Gestiune disponibilă'}</Text></View>{warehouse.id === editor.warehouse_id ? <CheckCircle2 size={18} color="#5EEAA4" /> : <ChevronRight size={18} color={Colors.textMuted} />}</TouchableOpacity>)}</ScrollView></Pressable></Pressable></Modal>

        <Modal visible={supplierPicker} transparent animationType="slide" onRequestClose={() => setSupplierPicker(false)}><Pressable style={styles.backdrop} onPress={() => setSupplierPicker(false)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Selectează furnizorul" onClose={() => setSupplierPicker(false)} /><SearchBox value={supplierSearch} onChangeText={setSupplierSearch} placeholder="Denumire sau CUI" />{newSupplier ? <View style={styles.inlineCreate}><Field label="DENUMIRE *" value={newSupplier.name} onChangeText={(name) => setNewSupplier({ ...newSupplier, name })} placeholder="Firma furnizoare" /><Field label="CUI" value={newSupplier.cui} onChangeText={(cui) => setNewSupplier({ ...newSupplier, cui })} placeholder="RO123456" /><TouchableOpacity style={styles.confirmAction} onPress={() => void addSupplier()}><Check size={18} color={Colors.white} /><Text style={styles.confirmActionText}>Creează și selectează</Text></TouchableOpacity></View> : <><ScrollView style={{ maxHeight: 430 }}>{filteredSuppliers.map((supplier) => <TouchableOpacity style={styles.pickerRow} key={supplier.id} onPress={() => { const supplierCurrency = supplier.default_currency || editor.currency; patchEditor({ supplier_id: supplier.id, supplier_name: supplier.name }); setSupplierPicker(false); if (supplierCurrency !== editor.currency) selectCurrency(supplierCurrency); }}><View style={styles.pickerIcon}><Building2 size={18} color="#5EEAD4" /></View><View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{supplier.name}</Text><Text style={styles.pickerMeta}>{supplier.cui || 'CUI necompletat'}</Text></View><ChevronRight size={18} color={Colors.textMuted} /></TouchableOpacity>)}</ScrollView>{can('SUPPLIER_CREATE') && <TouchableOpacity style={styles.addLine} onPress={() => setNewSupplier({ name: supplierSearch, cui: '' })}><Plus size={18} color={Colors.orange} /><Text style={styles.addLineText}>Furnizor nou</Text></TouchableOpacity>}</>}</Pressable></Pressable></Modal>

        <Modal visible={productPickerLine !== null} transparent animationType="slide" onRequestClose={() => setProductPickerLine(null)}><Pressable style={styles.backdrop} onPress={() => setProductPickerLine(null)}><Pressable style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]} onPress={(event) => event.stopPropagation()}><SheetHeader title="Asociază produsul intern" onClose={() => setProductPickerLine(null)} /><SearchBox value={productSearch} onChangeText={setProductSearch} placeholder="Denumire, SKU sau cod" />{loadingProducts ? <ActivityIndicator color={Colors.orange} style={{ margin: 28 }} /> : <ScrollView style={{ maxHeight: 520 }}>{products.map((product) => <TouchableOpacity key={product.id} style={styles.pickerRow} onPress={() => void selectProduct(product)}>{product.images?.[0]?.url ? <Image source={{ uri: product.images[0].url }} style={styles.pickerImage} resizeMode="cover" /> : <View style={styles.pickerIcon}><PackageSearch size={18} color="#A78BFA" /></View>}<View style={{ flex: 1 }}><Text style={styles.pickerTitle}>{product.name}</Text><Text style={styles.pickerMeta}>{product.sku || 'Fără SKU'} · stoc conta {product.accounting_stock_quantity}</Text></View><Link2 size={17} color={Colors.orange} /></TouchableOpacity>)}</ScrollView>}</Pressable></Pressable></Modal>
      </View>
    );
  }

  return (
    <View key={`nir-registry-${registryEpoch}`} style={styles.screen}>
      <View style={styles.registryHero}><View style={styles.registryHeroGlow} /><View style={styles.registryHeroTop}><View style={styles.heroBrand}><MotionOrb><FilePlus2 size={23} color="#5EEAD4" /></MotionOrb><View><Text style={styles.heroEyebrow}>RECEPȚII · STOC · COSTURI</Text><Text style={styles.heroTitle}>NIR-uri</Text></View></View><View style={styles.heroActions}>{can('NIR_CREATE') && <TouchableOpacity style={styles.newNirButton} onPress={() => void createDraft()} disabled={saving}><Plus size={18} color="#081311" /><Text style={styles.newNirButtonText}>NIR nou</Text></TouchableOpacity>}<TouchableOpacity style={styles.iconButton} onPress={() => void loadRegistry(page)}><RefreshCw size={18} color={Colors.textSecondary} /></TouchableOpacity></View></View><View style={styles.heroMessage}><Text style={styles.heroMessageBadge}>FLUX GHIDAT</Text><Text style={styles.heroText}>Înregistrează factura și recepția în pași simpli. Nimic nu se salvează până nu apeși „Salvează”.</Text></View><View style={styles.heroStats}><View><Text style={styles.heroStatValue}>{registry?.total || 0}</Text><Text style={styles.heroStatLabel}>DOCUMENTE</Text></View><View><Text style={styles.heroStatValue}>{registry?.items.filter((item) => item.status === 'draft').length || 0}</Text><Text style={styles.heroStatLabel}>CIORNE ÎN PAGINĂ</Text></View></View><View style={styles.quickGuide}><GuideItem number="1" label="Furnizor" /><View style={styles.guideLine} /><GuideItem number="2" label="Produse" /><View style={styles.guideLine} /><GuideItem number="3" label="Confirmare" /></View></View>
      <View style={styles.registryToolbar}><SearchBox value={search} onChangeText={setSearch} onSubmitEditing={() => void loadRegistry(1)} placeholder="Număr NIR, factură, furnizor sau CUI" /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusFilters}>{[['', 'Toate'], ['draft', 'Ciorne'], ['confirmed', 'Confirmate'], ['reversed', 'Reversate']].map(([value, label]) => <TouchableOpacity key={value} style={[styles.filterChip, status === value && styles.filterChipActive]} onPress={() => setStatus(value)}><Text style={[styles.filterText, status === value && styles.filterTextActive]}>{label}</Text></TouchableOpacity>)}</ScrollView></View>
      {loading ? <View style={styles.loadingBox}><ActivityIndicator color={Colors.orange} /><Text style={styles.loadingText}>Se încarcă registrul NIR...</Text></View> : <ScrollView contentContainerStyle={[styles.registryList, { paddingBottom: 30 + insets.bottom }]} showsVerticalScrollIndicator={false}>{registry?.items.length ? registry.items.map((document) => <NirRegistryCard key={document.id} document={document} onPress={() => void openDocument(document.id)} canViewCosts={can('NIR_VIEW_COSTS')} />) : <View style={styles.emptyBox}><RegistryDocumentIcon color="#F97316" /><View style={{ flex: 1 }}><Text style={styles.emptyEyebrow}>REGISTRU NIR</Text><Text style={styles.emptyTitle}>Nu există NIR-uri pentru filtrul ales</Text><Text style={styles.emptyText}>{search ? 'Nu am găsit un document pentru această căutare.' : 'Adaugă prima recepție sau schimbă filtrul.'}</Text></View>{can('NIR_CREATE') && <TouchableOpacity style={styles.emptyAction} onPress={createDraft}><Plus size={16} color="#081311" /><Text style={styles.emptyActionText}>NIR nou</Text></TouchableOpacity>}</View>}<View style={styles.pagination}><TouchableOpacity style={styles.pageButton} disabled={(registry?.page || 1) <= 1} onPress={() => void loadRegistry(page - 1)}><ChevronLeft size={18} color={Colors.textPrimary} /></TouchableOpacity><Text style={styles.pageText}>Pagina {registry?.page || 1} din {registry?.total_pages || 1}</Text><TouchableOpacity style={styles.pageButton} disabled={(registry?.page || 1) >= (registry?.total_pages || 1)} onPress={() => void loadRegistry(page + 1)}><ChevronRight size={18} color={Colors.textPrimary} /></TouchableOpacity></View></ScrollView>}
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
    const loop = Animated.loop(Animated.timing(progress, { toValue: 1, duration: 8000, easing: Easing.linear, useNativeDriver: false }), { resetBeforeIteration: true });
    loop.start();
    return () => loop.stop();
  }, [progress]);
  return <View style={styles.flowGuide}><View style={styles.flowGuideHead}><Text style={styles.flowGuideEyebrow}>GHID RAPID · URMEAZĂ SĂGEATA</Text><Text style={styles.flowGuideTitle}>Completează NIR-ul în 5 pași simpli</Text><Text style={styles.flowGuideText}>Traseul desenează fiecare pas în ordinea corectă, apoi pornește din nou.</Text></View><View style={styles.flowGuideRow}>{nirFlowSteps.map((step, index) => <React.Fragment key={step.label}><DrawnFlowIcon path={step.path} index={index} progress={progress} />{index < 4 && <AnimatedFlowConnector index={index} progress={progress} />}</React.Fragment>)}</View></View>;
}

function SectionTitle({ icon, index, title, subtitle }: { icon: React.ReactNode; index: string; title: string; subtitle: string }) { return <View style={styles.sectionTitle}><View style={styles.sectionIndex}>{icon}<Text style={styles.sectionIndexText}>{index}</Text></View><View style={{ flex: 1 }}><Text style={styles.sectionHeading}>{title}</Text><Text style={styles.sectionSubtitle}>{subtitle}</Text></View></View>; }
function ReviewMetric({ icon, label, value, hint, tone, wide = false }: { icon: React.ReactNode; label: string; value: number; hint: string; tone: 'purple' | 'blue' | 'green' | 'red' | 'teal'; wide?: boolean }) { const toneStyle = { purple: styles.reviewTonePurple, blue: styles.reviewToneBlue, green: styles.reviewToneGreen, red: styles.reviewToneRed, teal: styles.reviewToneTeal }[tone]; return <View style={[styles.reviewMetric, toneStyle, wide && styles.reviewMetricWide]}><View style={styles.reviewMetricIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={styles.reviewMetricLabel}>{label}</Text><Text style={styles.reviewMetricValue}>{value.toLocaleString('ro-RO')}</Text><Text style={styles.reviewMetricHint}>{hint}</Text></View></View>; }
function DateTimeSelector({ label, date, time, color, disabled, onPress }: { label: string; date: string; time: string | null; color: string; disabled: boolean; onPress: () => void }) { const parsed = date ? new Date(`${date}T${String(time || '00:00').slice(0, 5)}:00`) : null; const dateLabel = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleDateString('ro-RO', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Alege data'; const timeLabel = String(time || '').slice(0, 5) || '--:--'; return <TouchableOpacity disabled={disabled} activeOpacity={0.78} style={[styles.dateTimeSelector, disabled && styles.dateTimeSelectorDisabled]} onPress={onPress}><View style={[styles.dateTimeSelectorIcon, { borderColor: `${color}40`, backgroundColor: `${color}12` }]}><CalendarDays size={20} color={color} /><Clock3 size={10} color={color} style={styles.dateTimeClock} /></View><View style={{ flex: 1 }}><Text style={styles.dateTimeSelectorLabel}>{label}</Text><View style={styles.dateTimeSelectorValue}><Text style={styles.dateTimeSelectorDate}>{dateLabel}</Text><View style={[styles.dateTimeTimeChip, { backgroundColor: `${color}12` }]}><Text style={[styles.dateTimeTimeText, { color }]}>{timeLabel}</Text></View></View><Text style={styles.dateTimeSelectorHint}>Atinge pentru calendar și oră</Text></View><ChevronRight size={18} color={Colors.textMuted} /></TouchableOpacity>; }
function Field({ label, value, onChangeText, placeholder, editable = true, keyboardType, multiline, icon }: { label: string; value: string; onChangeText?: (value: string) => void; placeholder: string; editable?: boolean; keyboardType?: 'default' | 'decimal-pad'; multiline?: boolean; icon?: React.ReactNode }) { return <View style={[styles.field, multiline && styles.fieldWide]}><Text style={styles.label}>{label}</Text><View style={styles.inputWrap}>{icon}<TextInput style={[styles.input, multiline && styles.textarea]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} editable={editable} keyboardType={keyboardType} multiline={multiline} /></View></View>; }
function SearchBox({ value, onChangeText, placeholder, onSubmitEditing }: { value: string; onChangeText: (value: string) => void; placeholder: string; onSubmitEditing?: () => void }) { return <View style={styles.searchBox}><Search size={18} color={Colors.textMuted} /><TextInput style={styles.searchInput} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={Colors.textMuted} returnKeyType="search" onSubmitEditing={onSubmitEditing} /></View>; }
function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) { return <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><TouchableOpacity style={styles.iconButton} onPress={onClose}><X size={20} color={Colors.textSecondary} /></TouchableOpacity></View>; }
function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <TouchableOpacity style={[styles.detailTab, active && styles.detailTabActive]} onPress={onPress}><Text style={[styles.detailTabText, active && styles.detailTabTextActive]}>{label}</Text></TouchableOpacity>; }

function NirRegistryCard({ document, onPress, canViewCosts }: { document: ShopNirDocument; onPress: () => void; canViewCosts: boolean }) {
  const info = statusInfo[document.status];
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

function NirLineCard({ line, index, editable, supplierName, currency, exchangeRate, onPatch, onSupplierCodeChange, onSupplierNameChange, onPickProduct, onRemove }: { line: ShopNirLine; index: number; editable: boolean; supplierName: string; currency: string; exchangeRate: string; onPatch: (patch: Partial<ShopNirLine>) => void; onSupplierCodeChange: (value: string) => void; onSupplierNameChange: (value: string) => void; onPickProduct: () => void; onRemove: () => void }) {
  const matched = Boolean(line.product_id);
  const isStockItem = line.is_stock_item !== false;
  const received = line.received_quantity || line.accepted_quantity;
  const differs = line.invoiced_quantity !== received || received !== line.accepted_quantity || Number(line.rejected_quantity || 0) > 0;
  const differenceReason = line.difference_reason || (line.mismatch_reason ? 'other' : null);
  const calculated = localLineTotals(line, exchangeRate);
  return <Reveal delay={Math.min(index * 45, 220)}><View style={[styles.lineCard, matched && styles.lineCardMatched]}>
    <View style={styles.lineHeader}>{line.product_image_url ? <Image source={{ uri: line.product_image_url }} style={styles.lineProductImage} /> : <View style={styles.lineNumber}><Text style={styles.lineNumberText}>{String(index + 1).padStart(2, '0')}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.lineProduct}>{line.product_name || line.supplier_product_name || 'Produs neasociat'}</Text><Text style={[styles.matchText, { color: ['matching_code', 'matching_name'].includes(line.resolution_status || '') ? '#38BDF8' : matched ? Colors.success : Colors.warning }]}>{['matching_code', 'matching_name'].includes(line.resolution_status || '') ? '● Se caută automat…' : matched ? (line.resolution_status === 'matched_code' ? '● Recunoscut după cod' : line.resolution_status === 'matched_name' ? '● Recunoscut după denumirea identică' : '● Asociat manual · se memorează la Salvare') : '● Necesită asociere'}</Text></View>{editable && <TouchableOpacity style={styles.deleteLine} onPress={onRemove}><Trash2 size={16} color={Colors.error} /></TouchableOpacity>}</View>
    <LineStage number="1" title="Identifică produsul" subtitle="Căutare automată după cod sau denumire identică" icon={<PackageSearch size={17} color="#A78BFA" />}>
      <View style={styles.supplierContext}><Text style={styles.supplierContextLabel}>FURNIZOR</Text><Text style={styles.supplierContextValue}>{supplierName}</Text></View>
      <Field label="COD FURNIZOR" value={line.supplier_product_code} onChangeText={onSupplierCodeChange} placeholder="Ex: CAU-1025-A" editable={editable} />
      <Field label="DENUMIRE PE FACTURĂ" value={line.supplier_product_name} onChangeText={onSupplierNameChange} placeholder="Denumirea folosită de furnizor" editable={editable} />
      <View style={[styles.autoCodeStatus, matched && styles.autoCodeStatusMatched]}><Search size={15} color={matched ? Colors.success : '#38BDF8'} /><View style={{ flex: 1 }}><Text style={[styles.autoCodeTitle, matched && { color: Colors.success }]}>{['matching_code', 'matching_name'].includes(line.resolution_status || '') ? 'Se caută automat…' : matched ? 'Produs recunoscut' : 'Căutare după cod sau nume'}</Text><Text style={styles.autoCodeText}>{matched ? line.product_name : 'Fără cod, denumirea de pe factură trebuie să fie identică produsului intern.'}</Text></View></View>
      {editable && isStockItem && <View style={styles.associationActions}><TouchableOpacity style={[styles.productAssociation, matched && styles.productAssociationMatched]} onPress={onPickProduct}><Link2 size={16} color={matched ? Colors.success : Colors.orange} /><Text style={[styles.productAssociationText, matched && { color: Colors.success }]}>{matched ? 'Schimbă produsul' : 'Alege produsul intern'}</Text></TouchableOpacity></View>}
      <Text style={styles.stageExplanation}>Același produs poate fi cumpărat de la mai mulți furnizori, cu sau fără cod propriu.</Text>
    </LineStage>
    <LineStage number="2" title="Verifică marfa" subtitle="Compară factura cu ce ai primit și acceptat" icon={<Boxes size={17} color="#38BDF8" />}>
      <View style={styles.grid2}><Field label="FACTURAT" value={line.invoiced_quantity} onChangeText={(invoiced_quantity) => onPatch({ invoiced_quantity, received_quantity: invoiced_quantity, accepted_quantity: invoiced_quantity })} placeholder="0" editable={editable} keyboardType="decimal-pad" /><Field label="RECEPȚIONAT" value={received} onChangeText={(received_quantity) => onPatch({ received_quantity })} placeholder="0" editable={editable} keyboardType="decimal-pad" /></View>
      <View style={styles.grid2}><Field label="ACCEPTAT" value={line.accepted_quantity} onChangeText={(accepted_quantity) => onPatch({ accepted_quantity })} placeholder="0" editable={editable} keyboardType="decimal-pad" /><Field label="RESPINS" value={line.rejected_quantity} onChangeText={(rejected_quantity) => onPatch({ rejected_quantity })} placeholder="0" editable={editable} keyboardType="decimal-pad" /></View>
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
  </View></Reveal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.bg },
  registryHero: { position: 'relative', margin: 12, padding: 17, borderRadius: 26, backgroundColor: '#10201F', borderWidth: 1, borderColor: '#257168', overflow: 'hidden' }, registryHeroGlow: { position: 'absolute', right: -72, top: -88, width: 210, height: 210, borderRadius: 105, backgroundColor: '#2DD4BF12' },
  registryHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, heroBrand: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 }, heroIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD418', borderWidth: 1, borderColor: '#5EEAD444' }, iconButton: { width: 42, height: 42, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF0A', borderWidth: 1, borderColor: Colors.cardBorder },
  heroEyebrow: { color: '#5EEAD4', fontSize: 8, fontWeight: '900', letterSpacing: 1 }, heroTitle: { marginTop: 2, color: Colors.textPrimary, fontSize: 25, lineHeight: 30, fontWeight: '900' }, heroMessage: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF06', borderWidth: 1, borderColor: '#FFFFFF09' }, heroMessageBadge: { alignSelf: 'flex-start', marginBottom: 6, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 999, color: '#5EEAD4', backgroundColor: '#5EEAD410', fontSize: 7, fontWeight: '900', letterSpacing: 0.8 }, heroText: { color: Colors.textSecondary, fontSize: 11, lineHeight: 17 }, heroStats: { marginTop: 14, flexDirection: 'row', gap: 30 }, heroStatValue: { color: Colors.textPrimary, fontSize: 19, fontWeight: '900' }, heroStatLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  registryToolbar: { paddingHorizontal: 14 }, searchBox: { minHeight: 52, paddingHorizontal: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14, paddingVertical: 12 }, statusFilters: { gap: 8, paddingVertical: 12 }, filterChip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, filterChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orangeMid }, filterText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' }, filterTextActive: { color: Colors.orange },
  loadingBox: { padding: 50, alignItems: 'center', gap: 12 }, loadingText: { color: Colors.textSecondary }, registryList: { paddingHorizontal: 14, gap: 10 }, registryCard: { minHeight: 112, padding: 13, paddingLeft: 18, borderRadius: 22, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 11, overflow: 'hidden' }, registryAccent: { position: 'absolute', left: 0, top: 16, bottom: 16, width: 4, borderRadius: 4 }, registryDocumentIcon: { width: 45, height: 45, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, registryCardMain: { flex: 1, gap: 9 }, registryCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }, registryNumber: { color: Colors.textPrimary, fontSize: 15, fontWeight: '900' }, registrySupplier: { marginTop: 3, color: Colors.textSecondary, fontSize: 12 }, statusChip: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }, statusChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, registryMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, registryMetaText: { color: Colors.textMuted, fontSize: 10 }, registryTotal: { color: Colors.orangeLight, fontSize: 14, fontWeight: '900' },
  emptyBox: { minHeight: 130, padding: 18, alignItems: 'center', gap: 13, borderWidth: 1, borderColor: '#F9731630', backgroundColor: '#F9731608', borderRadius: 24, flexDirection: 'row' }, emptyEyebrow: { color: Colors.orange, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, emptyTitle: { marginTop: 4, color: Colors.textPrimary, fontSize: 15, fontWeight: '900' }, emptyText: { marginTop: 4, color: Colors.textSecondary, fontSize: 11, lineHeight: 16 }, emptyAction: { minHeight: 42, paddingHorizontal: 13, borderRadius: 14, backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', gap: 6 }, emptyActionText: { color: '#081311', fontSize: 11, fontWeight: '900' }, pagination: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 12 }, pageButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' }, pageText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '800' }, fab: { position: 'absolute', right: 18, height: 54, paddingHorizontal: 21, borderRadius: 19, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: Colors.orange, shadowColor: Colors.orange, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 }, fabText: { color: Colors.white, fontWeight: '900' },
  editorHeader: { minHeight: 72, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, backgroundColor: Colors.surface }, editorHeaderCopy: { flex: 1 }, editorEyebrow: { color: Colors.orange, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, editorTitle: { marginTop: 3, color: Colors.textPrimary, fontSize: 16, fontWeight: '900' }, editorContent: { padding: 14, gap: 12 },
  sectionTitle: { marginBottom: 3, flexDirection: 'row', alignItems: 'center', gap: 12 }, sectionIndex: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08', borderWidth: 1, borderColor: Colors.cardBorder }, sectionIndexText: { position: 'absolute', right: 4, bottom: 3, color: Colors.textMuted, fontSize: 7, fontWeight: '900' }, sectionHeading: { color: Colors.textPrimary, fontSize: 17, fontWeight: '900' }, sectionSubtitle: { marginTop: 3, color: Colors.textMuted, fontSize: 11, lineHeight: 16 },
  selector: { minHeight: 70, padding: 14, borderRadius: 18, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, selectorValue: { marginTop: 7, color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, placeholder: { marginTop: 7, color: Colors.textMuted, fontSize: 13 }, grid2: { flexDirection: 'row', gap: 10 }, dateTimeCard: { padding: 10, gap: 9, borderRadius: 19, backgroundColor: '#38BDF807', borderWidth: 1, borderColor: '#38BDF826' }, dateTimeSelector: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 11, borderRadius: 17, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, dateTimeSelectorDisabled: { opacity: 0.62 }, dateTimeSelectorIcon: { position: 'relative', width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1 }, dateTimeClock: { position: 'absolute', right: 5, bottom: 5 }, dateTimeSelectorLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, dateTimeSelectorValue: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 7 }, dateTimeSelectorDate: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' }, dateTimeTimeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 }, dateTimeTimeText: { fontSize: 10, fontWeight: '900' }, dateTimeSelectorHint: { marginTop: 4, color: Colors.textMuted, fontSize: 8 }, quantityGrid: { flexDirection: 'row', gap: 7 }, field: { flex: 1, minWidth: 0 }, fieldWide: { flex: 0, width: '100%' }, label: { marginLeft: 3, marginBottom: 6, color: Colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 }, inputWrap: { minHeight: 52, paddingHorizontal: 13, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }, input: { flex: 1, color: Colors.textPrimary, fontSize: 13, paddingVertical: 11 }, textarea: { minHeight: 88, textAlignVertical: 'top' },
  currencyRow: { flexDirection: 'row', gap: 8 }, currencyChip: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 14, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, currencyChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orange }, currencyText: { color: Colors.textSecondary, fontWeight: '900' }, currencyTextActive: { color: Colors.orange }, currencySelector: { minHeight: 72, padding: 11, borderRadius: 18, backgroundColor: '#F59E0B08', borderWidth: 1, borderColor: '#F59E0B30', flexDirection: 'row', alignItems: 'center', gap: 11 }, currencySelectorIcon: { width: 45, height: 45, borderRadius: 14, backgroundColor: '#F59E0B12', alignItems: 'center', justifyContent: 'center' }, currencySelectorLabel: { color: Colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, currencySelectorValue: { marginTop: 5, flexDirection: 'row', alignItems: 'center', gap: 8 }, currencySelectorCode: { color: '#FBBF24', fontSize: 15, fontWeight: '900' }, currencySelectorName: { flex: 1, color: Colors.textSecondary, fontSize: 10 }, bnrStatus: { minHeight: 45, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#22C55E08', borderWidth: 1, borderColor: '#22C55E22', flexDirection: 'row', alignItems: 'center', gap: 8 }, bnrStatusText: { color: '#8FE3B2', fontSize: 9, fontWeight: '800' }, bnrRefresh: { minHeight: 56, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#38BDF808', borderWidth: 1, borderColor: '#38BDF82C', flexDirection: 'row', alignItems: 'center', gap: 10 }, bnrRefreshTitle: { color: '#38BDF8', fontSize: 10, fontWeight: '900' }, bnrRefreshText: { marginTop: 3, color: Colors.textMuted, fontSize: 8 }, currencySheet: { maxHeight: '88%' }, currencyCount: { marginTop: 11, paddingHorizontal: 3, flexDirection: 'row', alignItems: 'center', gap: 6 }, currencyCountText: { color: Colors.textMuted, fontSize: 9, fontWeight: '800' }, currencyList: { paddingTop: 8, gap: 6 }, currencyOption: { minHeight: 57, paddingHorizontal: 10, borderRadius: 15, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }, currencyOptionActive: { backgroundColor: '#22C55E08', borderColor: '#22C55E32' }, currencyOptionCode: { width: 48, height: 34, borderRadius: 11, backgroundColor: '#FFFFFF08', alignItems: 'center', justifyContent: 'center' }, currencyOptionCodeActive: { backgroundColor: '#22C55E12' }, currencyOptionCodeText: { color: '#FBBF24', fontSize: 10, fontWeight: '900' }, currencyOptionCodeTextActive: { color: '#5EEAA4' }, currencyOptionName: { flex: 1, color: Colors.textPrimary, fontSize: 11, fontWeight: '700' },
  lineList: { gap: 12 }, lineCard: { padding: 11, borderRadius: 23, backgroundColor: '#17161A', borderWidth: 1, borderColor: Colors.cardBorder, gap: 10 }, lineCardMatched: { borderColor: '#22C55E55' }, lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 3, paddingVertical: 3 }, lineNumber: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#A78BFA16', borderWidth: 1, borderColor: '#A78BFA30' }, lineProductImage: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF08' }, lineNumberText: { color: '#A78BFA', fontSize: 11, fontWeight: '900' }, lineProduct: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, matchText: { marginTop: 4, fontSize: 10, fontWeight: '800' }, deleteLine: { width: 38, height: 38, borderRadius: 13, backgroundColor: Colors.errorDim, alignItems: 'center', justifyContent: 'center' }, productAssociation: { flex: 1, minHeight: 45, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: Colors.orangeMid, backgroundColor: Colors.orangeDim, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, productAssociationMatched: { borderColor: '#22C55E44', backgroundColor: Colors.successDim }, productAssociationText: { flex: 0, color: Colors.orange, fontSize: 10, fontWeight: '800' }, autoCodeStatus: { minHeight: 53, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#38BDF80A', borderWidth: 1, borderColor: '#38BDF82B', flexDirection: 'row', alignItems: 'center', gap: 9 }, autoCodeStatusMatched: { backgroundColor: '#22C55E09', borderColor: '#22C55E2E' }, autoCodeTitle: { color: '#38BDF8', fontSize: 10, fontWeight: '900' }, autoCodeText: { marginTop: 3, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, lineTotal: { minHeight: 75, padding: 12, borderRadius: 15, backgroundColor: '#F9731610', borderWidth: 1, borderColor: '#F9731635', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, lineTotalLabel: { color: Colors.orangeLight, fontSize: 9, fontWeight: '900' }, lineTotalHint: { marginTop: 4, color: Colors.textMuted, fontSize: 8 }, lineTotalCost: { marginTop: 5, color: '#D6A27B', fontSize: 8, fontWeight: '800' }, lineTotalValue: { color: Colors.orangeLight, fontSize: 16, fontWeight: '900' },
  priceComparison: { padding: 12, gap: 8, borderRadius: 15, backgroundColor: '#38BDF80A', borderWidth: 1, borderColor: '#38BDF82E' }, priceComparisonWarning: { backgroundColor: '#F59E0B0D', borderColor: '#F59E0B4A' }, priceComparisonLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900', letterSpacing: 0.6 }, priceComparisonValue: { marginTop: 4, color: Colors.textPrimary, fontSize: 12, fontWeight: '800' }, priceComparisonMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }, priceComparisonMetaText: { color: Colors.textSecondary, fontSize: 10 }, priceComparisonVariance: { color: '#38BDF8', fontSize: 11, fontWeight: '900' }, priceComparisonAlert: { color: Colors.warning, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  differenceBox: { gap: 8, padding: 10, borderRadius: 15, backgroundColor: '#F59E0B08', borderWidth: 1, borderColor: '#F59E0B2E' }, differenceReasons: { gap: 7 }, differenceChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, differenceChipActive: { backgroundColor: Colors.orangeDim, borderColor: Colors.orangeMid }, differenceChipText: { color: Colors.textSecondary, fontSize: 10, fontWeight: '800' }, differenceChipTextActive: { color: Colors.orange },
  stockItemToggle: { minHeight: 64, paddingHorizontal: 13, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: Colors.cardBorder }, stockItemToggleActive: { backgroundColor: '#22C55E0A', borderColor: '#22C55E33' }, stockItemText: { color: Colors.textSecondary, fontSize: 11, fontWeight: '900' }, stockItemTextActive: { color: Colors.success }, stockItemHint: { marginTop: 4, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, stockSwitchTrack: { width: 48, height: 28, padding: 3, borderRadius: 14, backgroundColor: '#37343C', justifyContent: 'center' }, stockSwitchTrackActive: { backgroundColor: '#22C55E55' }, stockSwitchThumb: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#8B8790' }, stockSwitchThumbActive: { marginLeft: 20, backgroundColor: '#5EEAA4' },
  addLine: { minHeight: 50, paddingHorizontal: 15, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.orangeMid, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, addLineText: { color: Colors.orange, fontSize: 12, fontWeight: '900' }, importButton: { padding: 15, borderRadius: 18, backgroundColor: '#38BDF810', borderWidth: 1, borderColor: '#38BDF833', flexDirection: 'row', alignItems: 'center', gap: 12 }, importTitle: { color: '#38BDF8', fontSize: 13, fontWeight: '900' }, importText: { maxWidth: 290, marginTop: 3, color: Colors.textSecondary, fontSize: 10, lineHeight: 15 },
  savedAttachments: { marginTop: 14, padding: 11, borderWidth: 1, borderColor: '#38BDF82B', borderRadius: 18, backgroundColor: '#38BDF806' }, attachmentSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 9 }, attachmentSectionKicker: { color: '#7DD3FC', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, attachmentSectionTitle: { color: Colors.textPrimary, fontSize: 12, fontWeight: '800', marginTop: 3 }, downloadAll: { minHeight: 38, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: '#38BDF84A', backgroundColor: '#38BDF812', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }, downloadDisabled: { opacity: 0.5 }, downloadAllText: { color: '#7DD3FC', fontSize: 9, fontWeight: '900' }, attachmentList: { gap: 7 }, attachmentCard: { minHeight: 58, paddingHorizontal: 10, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder }, attachmentPending: { borderColor: '#FBBF2438', backgroundColor: '#FBBF2408' }, attachmentIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#38BDF810' }, attachmentName: { color: Colors.textPrimary, fontSize: 11, fontWeight: '800' }, attachmentMeta: { marginTop: 3, color: Colors.textMuted, fontSize: 9 }, attachmentRemove: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FB718510' }, attachmentDownload: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: '#38BDF838', backgroundColor: '#38BDF80F', alignItems: 'center', justifyContent: 'center' },
  reviewGuide: { padding: 11, borderRadius: 16, backgroundColor: '#22C55E08', borderWidth: 1, borderColor: '#22C55E22', flexDirection: 'row', alignItems: 'center', gap: 10 }, reviewGuideNumber: { width: 29, height: 29, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E13' }, reviewGuideNumberText: { color: '#5EEAA4', fontSize: 9, fontWeight: '900' }, reviewGuideTitle: { color: Colors.textPrimary, fontSize: 10, fontWeight: '900' }, reviewGuideText: { marginTop: 3, color: Colors.textMuted, fontSize: 8, lineHeight: 12 }, reviewReady: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, backgroundColor: '#22C55E10', flexDirection: 'row', alignItems: 'center', gap: 4 }, reviewReadyText: { color: '#5EEAA4', fontSize: 7, fontWeight: '900' },
  quantitySummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, reviewMetric: { width: '48.5%', minHeight: 86, padding: 11, borderRadius: 18, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 9 }, reviewMetricWide: { width: '100%', minHeight: 76 }, reviewMetricIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08' }, reviewMetricLabel: { color: Colors.textMuted, fontSize: 7, fontWeight: '900', letterSpacing: 0.5 }, reviewMetricValue: { marginTop: 3, color: Colors.textPrimary, fontSize: 18, fontWeight: '900' }, reviewMetricHint: { marginTop: 2, color: Colors.textMuted, fontSize: 8 }, reviewTonePurple: { backgroundColor: '#A78BFA08', borderColor: '#A78BFA24' }, reviewToneBlue: { backgroundColor: '#38BDF808', borderColor: '#38BDF824' }, reviewToneGreen: { backgroundColor: '#22C55E08', borderColor: '#22C55E28' }, reviewToneRed: { backgroundColor: '#FB718508', borderColor: '#FB718526' }, reviewToneTeal: { backgroundColor: '#2DD4BF0A', borderColor: '#2DD4BF2B' },
  totalCard: { padding: 12, borderRadius: 21, backgroundColor: '#F9731609', borderWidth: 1, borderColor: '#F9731638', gap: 9 }, totalMetric: { minHeight: 61, padding: 10, borderRadius: 15, backgroundColor: '#17161A', borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 10 }, totalMetricIcon: { width: 35, height: 35, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, totalLabel: { color: Colors.textMuted, fontSize: 8, fontWeight: '900' }, totalSub: { marginTop: 3, color: Colors.textPrimary, fontSize: 14, fontWeight: '900' }, totalHint: { marginTop: 3, color: Colors.textMuted, fontSize: 8 }, totalMain: { minHeight: 69, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#F9731612', borderWidth: 1, borderColor: Colors.orangeMid, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, totalMainLabel: { color: Colors.orangeLight, fontSize: 9, fontWeight: '900' }, totalMainValue: { color: Colors.orangeLight, fontSize: 20, fontWeight: '900' },
  stickyActions: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, gap: 8, backgroundColor: '#111111F7', borderTopWidth: 1, borderTopColor: Colors.cardBorder }, stickyPrimaryRow: { flexDirection: 'row', gap: 9 }, deleteNirAction: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, borderWidth: 1, borderColor: '#FB718530', backgroundColor: '#FB71850A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, deleteNirActionText: { color: '#FDA4AF', fontSize: 10, fontWeight: '900' }, deleteNirActionHint: { color: '#73676C', fontSize: 8, fontWeight: '700' }, secondaryAction: { flex: 0.8, minHeight: 52, borderRadius: 17, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, secondaryActionText: { color: Colors.textPrimary, fontWeight: '900' }, confirmAction: { flex: 1.4, minHeight: 52, paddingHorizontal: 15, borderRadius: 17, backgroundColor: Colors.orange, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, confirmActionText: { color: Colors.white, fontWeight: '900', fontSize: 12 }, correctNirAction: { minHeight: 58, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: '#FBBF2442', backgroundColor: '#FBBF240D', flexDirection: 'row', alignItems: 'center', gap: 11 }, correctNirActionText: { color: '#FDE68A', fontSize: 12, fontWeight: '900' }, correctNirActionHint: { marginTop: 3, color: '#9C8B69', fontSize: 8, lineHeight: 12 },
  deleteBackdrop: { flex: 1, padding: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050407E8' }, deleteDialog: { position: 'relative', width: '100%', maxWidth: 520, overflow: 'hidden', padding: 22, borderRadius: 27, backgroundColor: '#1C191D', borderWidth: 1, borderColor: '#FB718548', shadowColor: '#000000', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 18 }, elevation: 22 }, deleteDialogAccent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: '#E11D48' }, deleteDialogIcon: { width: 59, height: 59, marginBottom: 17, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FB718516', borderWidth: 1, borderColor: '#FB71854A' }, deleteDialogEyebrow: { color: '#FB7185', fontSize: 8, fontWeight: '900', letterSpacing: 1.15 }, deleteDialogTitle: { marginTop: 7, color: '#FFF5F6', fontSize: 22, lineHeight: 27, fontWeight: '900' }, deleteDialogMessage: { marginTop: 7, color: '#ADA3A8', fontSize: 12, lineHeight: 19 }, deleteDialogDocument: { marginTop: 17, minHeight: 67, padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF05', borderWidth: 1, borderColor: '#FFFFFF0D', flexDirection: 'row', alignItems: 'center', gap: 10 }, deleteDialogDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#FFFFFF0D' }, deleteDialogMetaLabel: { color: '#766E73', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, deleteDialogMetaValue: { marginTop: 5, color: '#F1EBEE', fontSize: 10, fontWeight: '900' }, deleteDialogWarning: { marginTop: 10, padding: 11, borderRadius: 15, backgroundColor: '#F59E0B0C', borderWidth: 1, borderColor: '#F59E0B30', flexDirection: 'row', alignItems: 'flex-start', gap: 9 }, deleteDialogWarningTitle: { color: '#F5D695', fontSize: 9, fontWeight: '900' }, deleteDialogWarningText: { marginTop: 3, color: '#8E8582', fontSize: 9, lineHeight: 14 }, deleteDialogCancel: { minHeight: 49, marginTop: 17, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#29262B', borderWidth: 1, borderColor: '#403B42' }, deleteDialogCancelText: { color: '#E4DDE1', fontSize: 11, fontWeight: '900' }, deleteDialogConfirm: { minHeight: 49, marginTop: 8, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, backgroundColor: '#D81747', borderWidth: 1, borderColor: '#FB71856B' }, deleteDialogConfirmText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: Colors.overlay }, sheet: { padding: 16, maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.cardBorder }, sheetHeader: { marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sheetTitle: { color: Colors.textPrimary, fontSize: 20, fontWeight: '900' }, pickerExplanation: { marginBottom: 8, padding: 11, borderRadius: 13, backgroundColor: '#22C55E0B', color: '#98B6A1', fontSize: 9, lineHeight: 14 }, pickerRow: { minHeight: 76, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 11 }, pickerIcon: { width: 52, height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF08' }, pickerImage: { width: 52, height: 52, borderRadius: 15, backgroundColor: '#FFFFFF08' }, pickerTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '800' }, pickerMeta: { marginTop: 4, color: Colors.textMuted, fontSize: 11 }, inlineCreate: { gap: 12, marginTop: 14 },
  detailTabs: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: Colors.surface }, detailTab: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' }, detailTabActive: { backgroundColor: Colors.card }, detailTabText: { color: Colors.textMuted, fontSize: 11, fontWeight: '800' }, detailTabTextActive: { color: Colors.orange }, auditList: { gap: 8 }, auditCard: { padding: 13, borderRadius: 16, backgroundColor: Colors.card, flexDirection: 'row', alignItems: 'center', gap: 10 }, auditDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success }, auditTitle: { color: Colors.textPrimary, fontSize: 12, fontWeight: '800' }, auditMeta: { marginTop: 3, color: Colors.textSecondary, fontSize: 10 }, exportRow: { flexDirection: 'row', gap: 10 }, exportButton: { flex: 1, minHeight: 48, borderRadius: 15, backgroundColor: Colors.card, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, exportText: { color: Colors.textPrimary, fontWeight: '800' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, newNirButton: { minHeight: 43, paddingHorizontal: 15, borderRadius: 15, backgroundColor: '#5EEAD4', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }, newNirButtonText: { color: '#081311', fontSize: 12, fontWeight: '900' },
  quickGuide: { marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#5EEAD424', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, guideItem: { alignItems: 'center', gap: 5 }, guideBubble: { width: 27, height: 27, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD414', borderWidth: 1, borderColor: '#5EEAD43A' }, guideBubbleText: { color: '#5EEAD4', fontSize: 9, fontWeight: '900' }, guideLabel: { color: '#A9C8C3', fontSize: 9, fontWeight: '800' }, guideLine: { flex: 1, height: 1, marginHorizontal: 8, backgroundColor: '#5EEAD426' },
  flowGuide: { padding: 17, borderRadius: 22, backgroundColor: '#121B1B', borderWidth: 1, borderColor: '#2DD4BF38', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }, flowGuideHead: { marginBottom: 18 }, flowGuideEyebrow: { color: '#5EEAD4', fontSize: 8, fontWeight: '900', letterSpacing: 1.1 }, flowGuideTitle: { marginTop: 5, color: Colors.textPrimary, fontSize: 17, fontWeight: '900' }, flowGuideText: { marginTop: 5, color: Colors.textMuted, fontSize: 9, lineHeight: 14 }, flowGuideRow: { flexDirection: 'row', alignItems: 'flex-start' }, flowGuideItem: { alignItems: 'center', width: 52, gap: 7 }, flowGuideIcon: { position: 'relative', width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#5EEAD410', borderWidth: 1, borderColor: '#5EEAD440' }, flowGuideBadge: { position: 'absolute', right: -4, bottom: -3, width: 17, height: 17, borderRadius: 6, color: '#071513', backgroundColor: '#2DD4BF', textAlign: 'center', lineHeight: 17, fontSize: 8, fontWeight: '900', overflow: 'hidden' }, flowGuideLabel: { color: '#A9C8C3', fontSize: 8, fontWeight: '900', textAlign: 'center' }, flowGuideLine: { position: 'relative', flex: 1, height: 5, marginTop: 19, overflow: 'visible', backgroundColor: '#5EEAD414', borderRadius: 99 }, flowGuideLineFill: { position: 'absolute', left: 0, right: 0, top: 1, height: 3, borderRadius: 99, backgroundColor: '#2DD4BF', transformOrigin: 'left center' }, flowGuideArrow: { position: 'absolute', right: -2, top: -2, width: 7, height: 7, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#99F6E4', transform: [{ rotate: '45deg' }] },
  editorStepCard: { padding: 14, borderRadius: 22, backgroundColor: '#1B1A1E', borderWidth: 1, borderColor: Colors.cardBorder, gap: 12 }, editorStepCardLines: { paddingHorizontal: 10 }, stepHint: { padding: 11, borderRadius: 14, backgroundColor: '#FFFFFF05', flexDirection: 'row', alignItems: 'center', gap: 9 }, stepHintNumber: { width: 24, height: 24, borderRadius: 8, color: Colors.orange, backgroundColor: Colors.orangeDim, textAlign: 'center', lineHeight: 24, fontSize: 9, fontWeight: '900' }, stepHintText: { flex: 1, color: Colors.textSecondary, fontSize: 10, lineHeight: 15 },
  lineGuide: { padding: 11, borderRadius: 16, backgroundColor: '#A78BFA08', borderWidth: 1, borderColor: '#A78BFA22', gap: 11 }, lineGuideLead: { flexDirection: 'row', alignItems: 'center', gap: 9 }, lineGuideEyebrow: { color: '#A78BFA', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 }, lineGuideLeadText: { marginTop: 2, color: '#D8D2DD', fontSize: 10, fontWeight: '800' }, lineGuideTrack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, lineGuideStep: { minWidth: 70, flexDirection: 'row', alignItems: 'center', gap: 6 }, lineGuideNumber: { width: 25, height: 25, borderRadius: 8, color: '#EDE9FE', backgroundColor: '#7C3AED55', textAlign: 'center', lineHeight: 25, fontSize: 9, fontWeight: '900', overflow: 'hidden' }, lineGuideTitle: { color: '#D8D2DD', fontSize: 8, fontWeight: '900' }, lineGuideDetail: { marginTop: 2, color: '#746E7B', fontSize: 6.5, fontWeight: '700' }, lineGuideArrow: { color: '#A78BFA', fontSize: 13, fontWeight: '900' }, lineGuideConnector: { flex: 1, height: 1, marginTop: 13, marginHorizontal: 8, backgroundColor: '#A78BFA28' },
  lineStage: { padding: 12, borderRadius: 18, backgroundColor: '#201F24', borderWidth: 1, borderColor: '#36333B', gap: 11 }, lineStageHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#343139' }, lineStageIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF07', borderWidth: 1, borderColor: Colors.cardBorder }, lineStageNumber: { position: 'absolute', right: 3, bottom: 2, color: Colors.textMuted, fontSize: 7, fontWeight: '900' }, lineStageTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '900' }, lineStageSubtitle: { marginTop: 3, color: Colors.textMuted, fontSize: 9, lineHeight: 13 }, supplierContext: { padding: 10, borderRadius: 13, backgroundColor: '#2DD4BF09', borderWidth: 1, borderColor: '#2DD4BF25' }, supplierContextLabel: { color: '#6CA9A0', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 }, supplierContextValue: { marginTop: 4, color: '#B8EAE3', fontSize: 11, fontWeight: '800' }, associationActions: { flexDirection: 'row', gap: 8 }, stageExplanation: { color: Colors.textMuted, fontSize: 9, lineHeight: 14 },
});
