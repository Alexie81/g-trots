import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Check, CheckCircle2, Clock3, Download, MessageCircle, Save, Signature, X } from 'lucide-react-native';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import ClientSignatureModal, { hasClientSignature } from '@/components/ClientSignatureModal';
import ClientExpenseSelector from '@/components/ClientExpenseSelector';
import SearchableSelect from '@/components/SearchableSelect';
import KeyboardAwareScrollView from '@/components/KeyboardAwareScrollView';
import { Colors, fmt } from '@/constants/colors';
import {
  CURRENCY_OPTIONS,
  DEADLINE_UNIT_OPTIONS,
  WARRANTY_UNIT_OPTIONS,
  calculateClientPayment,
  displayAmountDueForPayment,
  formatDurationLabel,
  isTotalOnlyPayment,
  normalizeServiceSheetWorkPrice,
  parseDurationText,
  normalizeCurrency,
  sanitizeDurationNumber,
} from '@/constants/financial';
import { useAuth } from '@/contexts/AuthContext';
import {
  createExpenseCategory,
  getExpenseCategories,
  getServiceSheetById,
  getServiceSheetPdfUrl,
  createServiceSheetPdfShareLink,
  updateServiceSheet,
  updateServiceSheetCompanyDetails,
} from '@/services/api';
import type { ExpenseCategory, ServiceProductPhoto, ServiceSheet, ServiceSheetFormData, ServiceVehicleType } from '@/types';

function str(value: unknown) {
  return value === null || value === undefined ? '' : String(value);
}

function sheetToForm(sheet: ServiceSheet): ServiceSheetFormData {
  const workPrice = normalizeServiceSheetWorkPrice(
    sheet.total_price,
    sheet.diagnostic_price,
    sheet.client_package_price
  );
  return {
    client_id: sheet.client_id,
    qr_code: sheet.qr_code || '',
    client_name: sheet.client_name || '',
    client_phone: sheet.client_phone || '',
    client_email: sheet.client_email || '',
    client_address: sheet.client_address || '',
    vehicle_type: sheet.vehicle_type || 'trotineta',
    vehicle_brand_model: sheet.vehicle_brand_model || '',
    vehicle_registration: sheet.vehicle_registration || '',
    vehicle_series: sheet.vehicle_series || '',
    vehicle_km: sheet.vehicle_km || '',
    vehicle_battery: sheet.vehicle_battery || '',
    issue_description: sheet.issue_description || '',
    visible_damage: sheet.visible_damage || '',
    accessories_charger: !!sheet.accessories_charger,
    accessories_keys: !!sheet.accessories_keys,
    accessories_saddle: !!sheet.accessories_saddle,
    accessories_other: !!sheet.accessories_other,
    accessories_other_text: sheet.accessories_other_text || '',
    quick_powers_on: !!sheet.quick_powers_on,
    quick_water_traces: !!sheet.quick_water_traces,
    quick_impact: !!sheet.quick_impact,
    quick_battery_risk: !!sheet.quick_battery_risk,
    product_photo: sheet.product_photo || '',
    diagnostic: sheet.diagnostic || '',
    work_performed: sheet.work_performed || '',
    parts_used: sheet.parts_used || '',
    observations: sheet.observations || '',
    diagnostic_price: str(sheet.diagnostic_price || 0),
    parts_price: str(sheet.parts_price || 0),
    labor_price: str(sheet.labor_price || 0),
    internal_parts_cost: str(sheet.internal_parts_cost),
    internal_labor_cost: str(sheet.internal_labor_cost),
    internal_other_costs: str(sheet.internal_other_costs),
    expense_costs: (sheet.expense_costs || [])
      .filter((item) => item.expense_id)
      .map((item) => ({ expense_id: item.expense_id!, cost: str(item.cost) })),
    total_price: str(workPrice),
    advance_amount: str(sheet.advance_amount || 0),
    currency_code: normalizeCurrency(sheet.currency_code),
    payment_status: sheet.payment_status || 'de_incasat',
    client_discount: str(sheet.client_discount || 0),
    deadline: sheet.deadline || '',
    deadline_unit: sheet.deadline_unit || 'zile',
    warranty: sheet.warranty || '',
    storage_fee_per_day: str(sheet.storage_fee_per_day || 0),
    storage_after_days: str(sheet.storage_after_days || 0),
    old_parts_client: !!sheet.old_parts_client,
    old_parts_recycle: !!sheet.old_parts_recycle,
    approve_diagnostic_test: !!sheet.approve_diagnostic_test,
    approve_repair_estimate: !!sheet.approve_repair_estimate,
    reject_repair: !!sheet.reject_repair,
    vehicle_delivered_checked: !!sheet.vehicle_delivered_checked,
    client_signature: sheet.client_signature || '',
    client_signed_at: sheet.client_signed_at || null,
    finalized_at: sheet.finalized_at ? formatDateTimeInput(sheet.finalized_at) : null,
    technician_name: sheet.technician_name || sheet.mechanic_name || '',
    service_type: sheet.service_type || 'Verificare generala',
  };
}

function fmtDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return value;
  return formatDateTimeInput(date);
}

function formatDateTimeInput(value: string | Date) {
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nowDateTimeInput() {
  return formatDateTimeInput(new Date());
}

function whatsappPhone(value?: string | null) {
  let digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `40${digits.slice(1)}`;
  if (digits.length === 9) digits = `40${digits}`;
  return digits;
}

export default function ServiceSheetDetailsScreen() {
  const router = useRouter();
  const { id, fromScan } = useLocalSearchParams<{ id: string; fromScan?: string }>();
  const { token, user } = useAuth();
  const financialEntryRequested = fromScan === '1';
  const [financialEntryActive, setFinancialEntryActive] = useState(financialEntryRequested);
  const canNormallyViewFinancials = user?.role !== 'user' || user?.client_financial_access !== false;
  const canViewFinancials = canNormallyViewFinancials || financialEntryActive;
  const [sheet, setSheet] = useState<ServiceSheet | null>(null);
  const [form, setForm] = useState<ServiceSheetFormData | null>(null);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [switchingCompanyDetails, setSwitchingCompanyDetails] = useState(false);
  const [signatureVisible, setSignatureVisible] = useState(false);
  const [error, setError] = useState('');

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/service-sheets');
  };

  useEffect(() => {
    (async () => {
      if (!id || !token) return;
      try {
        const [row, expenseRows] = await Promise.all([
          getServiceSheetById(id, token, financialEntryActive),
          getExpenseCategories(),
        ]);
        setSheet(row);
        setExpenses(expenseRows);
        setForm(sheetToForm(row));
      } catch (e: any) {
        setError(e.message || 'Fisa nu a putut fi incarcata.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, token, financialEntryActive]);

  const payment = useMemo(
    () => calculateClientPayment(
      normalizeServiceSheetWorkPrice(form?.total_price, form?.diagnostic_price, sheet?.client_package_price),
      form?.diagnostic_price,
      form?.client_discount,
      form?.advance_amount
    ),
    [form?.total_price, form?.diagnostic_price, form?.client_discount, form?.advance_amount, sheet?.client_package_price]
  );
  const effectiveTotal = payment.total;
  const amountDue = payment.amountDue;
  const serviceWorkPrice = normalizeServiceSheetWorkPrice(form?.total_price, form?.diagnostic_price, sheet?.client_package_price);
  const totalOnlyPayment = isTotalOnlyPayment(serviceWorkPrice, form?.diagnostic_price, form?.advance_amount);
  const effectivePaymentStatus = !totalOnlyPayment && effectiveTotal > 0 && amountDue <= 0
    ? 'incasati'
    : form?.payment_status;
  const displayedAmountDue = effectivePaymentStatus === 'incasati'
    ? 0
    : displayAmountDueForPayment(
        serviceWorkPrice,
        form?.diagnostic_price,
        amountDue,
        form?.advance_amount
      );
  const paymentStatusLabel = effectivePaymentStatus === 'incasati' ? 'Achitat' : 'Neachitat';
  const amountDueLabel = totalOnlyPayment ? 'Rest de plata' : `Rest de plata (${paymentStatusLabel})`;
  const warrantyParts = parseDurationText(form?.warranty, 'zile');
  const deadlineValue = sanitizeDurationNumber(form?.deadline);
  const nullableNumber = (value: unknown) => String(value ?? '').trim() === '' ? null : Math.max(Number(value) || 0, 0);
  const displayedPartsCost = Math.max(Number(form?.parts_price) || 0, 0);
  const displayedLaborCost = Math.max(Number(form?.labor_price) || 0, 0);
  const internalPartsInput = nullableNumber(form?.internal_parts_cost);
  const internalLaborInput = nullableNumber(form?.internal_labor_cost);
  const effectiveInternalParts = internalPartsInput === null ? displayedPartsCost : internalPartsInput;
  const effectiveInternalLabor = internalLaborInput === null ? displayedLaborCost : internalLaborInput;
  const effectiveInternalOther = (form?.expense_costs || []).reduce(
    (sum, item) => sum + Math.max(Number(item.cost) || 0, 0),
    0
  );
  const internalTotal = effectiveInternalParts + effectiveInternalLabor + effectiveInternalOther;
  const gtrotsRemaining = Math.max(effectiveTotal - internalTotal, 0);

  if (loading || !form) {
    return (
      <View style={styles.container}>
        <Header title="" showBack onBack={goBack} right={<MobileChatHeaderButton />} />
        <View style={styles.center}><ActivityIndicator color={Colors.orange} /></View>
      </View>
    );
  }

  const update = <K extends keyof ServiceSheetFormData>(key: K, value: ServiceSheetFormData[K]) => {
    setForm((current) => {
      if (!current) return current;
      if (key === 'diagnostic_price') {
        const currentTotal = parseFloat(current.total_price) || 0;
        const previousDiagnostic = parseFloat(current.diagnostic_price) || 0;
        const nextDiagnostic = parseFloat(String(value)) || 0;
        const shouldMirrorToTotal =
          nextDiagnostic > 0
          && (currentTotal <= 0 || Math.abs(currentTotal - previousDiagnostic) < 0.01);
        return {
          ...current,
          [key]: value,
          total_price: shouldMirrorToTotal ? String(value) : current.total_price,
        };
      }
      return { ...current, [key]: value };
    });
  };

  const updateWarrantyValue = (value: string) => {
    const number = sanitizeDurationNumber(value);
    update('warranty', formatDurationLabel(number, warrantyParts.unit));
  };

  const updateWarrantyUnit = (unit: string) => {
    update('warranty', formatDurationLabel(warrantyParts.value, unit));
  };

  const updatePaymentStatus = (status: 'incasati' | 'de_incasat') => {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        payment_status: status,
        finalized_at: status === 'incasati' && !current.finalized_at
          ? nowDateTimeInput()
          : current.finalized_at,
      };
    });
  };

  const setCompanyDetailsVisibility = async (value: boolean) => {
    if (!token || !id || !sheet || switchingCompanyDetails) return;
    const previous = !!sheet.show_company_details;
    setSheet({ ...sheet, show_company_details: value });
    setSwitchingCompanyDetails(true);
    setError('');
    try {
      const updatedSheet = await updateServiceSheetCompanyDetails(token, id, value);
      setSheet(updatedSheet);
    } catch (e: any) {
      setSheet((current) => current ? { ...current, show_company_details: previous } : current);
      setError(e.message || 'Optiunea PDF nu a putut fi salvata.');
    } finally {
      setSwitchingCompanyDetails(false);
    }
  };

  const saveCurrentSheet = async ({ showAlert = false }: { showAlert?: boolean } = {}) => {
    if (!token || !id || !form) return null;
    if (!form.client_name.trim()) {
      setError('Numele clientului este obligatoriu.');
      return null;
    }
    if (!form.client_phone.trim()) {
      setError('Telefonul clientului este obligatoriu.');
      return null;
    }
    const diagnostic = Math.max(parseFloat(form.diagnostic_price) || 0, 0);
    const total = Math.max(parseFloat(form.total_price) || 0, 0) || diagnostic;
    setError('');
    setSaving(true);
    try {
      const saved = await updateServiceSheet(token, id, {
        ...form,
        total_price: String(total),
        deadline: deadlineValue,
        warranty: formatDurationLabel(warrantyParts.value, warrantyParts.unit),
      }, financialEntryActive);
      if (!canNormallyViewFinancials && financialEntryActive) {
        setFinancialEntryActive(false);
      }
      setSheet(saved);
      setForm(sheetToForm(saved));
      if (showAlert) {
        Alert.alert('Salvat', 'Fisa de service a fost actualizata si PDF-ul a fost regenerat.');
      }
      return saved;
    } catch (e: any) {
      setError(e.message || 'Fisa nu a putut fi salvata.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    await saveCurrentSheet({ showAlert: true });
  };

  const sharePdf = async () => {
    if (!token || !id || !sheet || !form) return;
    setSharing(true);
    setError('');
    try {
      const saved = await saveCurrentSheet();
      if (!saved) return;
      if (!hasClientSignature(saved.client_signature)) {
        Alert.alert(
          'Semnare client',
          'Clientul nu a semnat fisa de service. Semneaza fisa inainte de trimitere.'
        );
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) throw new Error('Partajarea nu este disponibila pe acest dispozitiv.');
      const url = await getServiceSheetPdfUrl(id, token);
      const fileUri = `${FileSystem.cacheDirectory}${(saved.sheet_number || 'fisa-service').replace(/[^a-zA-Z0-9_-]/g, '-')}-${Date.now()}.pdf`;
      const downloaded = await FileSystem.downloadAsync(url, fileUri);
      await Sharing.shareAsync(downloaded.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Fisa service ${saved.sheet_number}`,
      });
    } catch (e: any) {
      setError(e.message || 'PDF-ul nu a putut fi partajat.');
    } finally {
      setSharing(false);
    }
  };

  const sendPdfOnWhatsApp = async () => {
    if (!token || !id || !sheet || !form) return;
    setSendingWhatsApp(true);
    setError('');
    try {
      const saved = await saveCurrentSheet();
      if (!saved) return;
      if (!hasClientSignature(saved.client_signature)) {
        Alert.alert(
          'Semnare client',
          'Clientul nu a semnat fisa de service. Semneaza fisa inainte de trimitere.'
        );
        return;
      }
      const phone = whatsappPhone(saved.client_phone);
      if (!phone) {
        Alert.alert('WhatsApp', 'Numarul clientului nu este valid pentru WhatsApp.');
        return;
      }
      const share = await createServiceSheetPdfShareLink(token, id);
      const shareUrl = String(share?.share_url || '').trim();
      if (!share?.success || !shareUrl) {
        throw new Error('PDF-ul nu a putut fi incarcat pe server.');
      }
      const message = `Buna ziua,\nAccesati linkul pentru a descarca fisa de service in format PDF: ${shareUrl}`;
      const encoded = encodeURIComponent(message);
      const appUrl = `whatsapp://send?phone=${phone}&text=${encoded}`;
      const webUrl = `https://wa.me/${phone}?text=${encoded}`;
      try {
        await Linking.openURL(appUrl);
      } catch {
        await Linking.openURL(webUrl);
      }
    } catch (e: any) {
      setError(e.message || 'PDF-ul nu a putut fi pregatit pentru WhatsApp.');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const saveClientSignature = async (signature: string) => {
    if (!token || !id || !form) return;
    const signedForm: ServiceSheetFormData = {
      ...form,
      client_signature: signature,
      client_signed_at: new Date().toISOString(),
      finalized_at: form.finalized_at || null,
    };
    const saved = await updateServiceSheet(token, id, signedForm, financialEntryActive);
    if (!canNormallyViewFinancials && financialEntryActive) {
      setFinancialEntryActive(false);
    }
    setSheet(saved);
    setForm(sheetToForm(saved));
  };

  const input = (key: keyof ServiceSheetFormData, label: string, opts: { multiline?: boolean; keyboardType?: 'default' | 'numeric' | 'email-address'; placeholder?: string; autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'; autoCorrect?: boolean } = {}) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, opts.multiline && styles.textarea]}
        value={String(form[key] ?? '')}
        onChangeText={(value) => update(key as any, value as any)}
        placeholder={opts.placeholder}
        placeholderTextColor={Colors.textMuted}
        keyboardType={opts.keyboardType || 'default'}
        autoCapitalize={opts.autoCapitalize}
        autoCorrect={opts.autoCorrect}
        multiline={opts.multiline}
        textAlignVertical={opts.multiline ? 'top' : 'center'}
      />
    </View>
  );

  const toggle = (key: keyof ServiceSheetFormData, label: string) => (
    <TouchableOpacity
      style={[styles.toggle, form[key] && styles.toggleActive]}
      onPress={() => update(key as any, !form[key] as any)}>
      <View style={[styles.toggleBox, form[key] && styles.toggleBoxActive]}>
        {form[key] ? <Check size={13} color={Colors.white} /> : null}
      </View>
      <Text style={[styles.toggleText, form[key] && styles.toggleTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const choice = <T extends string>(value: T, current: T, label: string, onPress: () => void) => (
    <TouchableOpacity style={[styles.choice, current === value && styles.choiceActive]} onPress={onPress}>
      <Text style={[styles.choiceText, current === value && styles.choiceTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
  const isFinalized = !!sheet?.is_finalized;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <Header title="" showBack onBack={goBack} right={<MobileChatHeaderButton />} />
      <KeyboardAwareScrollView contentContainerStyle={styles.content} extraScrollHeight={130}>
        <View style={styles.hero}>
          <View style={{ flex: 1 }}>
            <Text style={styles.kicker}>Fisa service</Text>
            <Text style={styles.title}>{sheet?.sheet_number}</Text>
            {isFinalized ? (
              <View style={styles.finalizedPill}>
                <CheckCircle2 size={13} color={Colors.success} />
                <Text style={styles.finalizedPillText}>Finalizata{sheet?.finalized_at ? ` · ${fmtDate(sheet.finalized_at)}` : ''}</Text>
              </View>
            ) : null}
            <Text style={styles.meta}>Adaugata {fmtDate(sheet?.created_at)} · Modificata {fmtDate(sheet?.updated_at)}</Text>
          </View>
          {canNormallyViewFinancials ? (
            <View style={styles.heroActions}>
              <TouchableOpacity style={styles.whatsappBtn} onPress={sendPdfOnWhatsApp} disabled={sendingWhatsApp}>
                {sendingWhatsApp ? <ActivityIndicator color={Colors.success} size="small" /> : <MessageCircle size={17} color={Colors.success} />}
                <Text style={styles.whatsappText}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pdfBtn} onPress={sharePdf} disabled={sharing}>
                {sharing ? <ActivityIndicator color={Colors.white} size="small" /> : <Download size={17} color={Colors.white} />}
                <Text style={styles.pdfText}>PDF</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.companyPdfSwitchCard}>
          <View style={styles.companyPdfSwitchCopy}>
            <Text style={styles.companyPdfSwitchTitle}>Datele firmei in PDF</Text>
            <Text style={styles.companyPdfSwitchSub}>
              {sheet?.show_company_details ? 'Cu datele firmei' : 'Fara datele firmei'} - se salveaza imediat
            </Text>
          </View>
          {switchingCompanyDetails ? (
            <ActivityIndicator color={Colors.orange} size="small" />
          ) : (
            <Switch
              value={!!sheet?.show_company_details}
              onValueChange={setCompanyDetailsVisibility}
              trackColor={{ false: Colors.cardBorder, true: Colors.orange + '88' }}
              thumbColor={sheet?.show_company_details ? Colors.orange : Colors.textMuted}
              accessibilityLabel="Include datele firmei in PDF"
            />
          )}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Section title="Client si vehicul">
          {input('client_name', 'Nume / Firma', { autoCapitalize: 'none', autoCorrect: false })}
          {input('client_phone', 'Telefon', { keyboardType: 'numeric' })}
          {input('client_email', 'E-mail', { keyboardType: 'email-address' })}
          {input('client_address', 'Adresa', { multiline: true })}
          <Text style={styles.label}>Tip vehicul</Text>
          <View style={styles.choiceRow}>
            {choice<ServiceVehicleType>('trotineta', form.vehicle_type, 'Trotineta', () => update('vehicle_type', 'trotineta'))}
            {choice<ServiceVehicleType>('scuter', form.vehicle_type, 'Scuter', () => update('vehicle_type', 'scuter'))}
            {choice<ServiceVehicleType>('altul', form.vehicle_type, 'Altul', () => update('vehicle_type', 'altul'))}
          </View>
          {input('vehicle_brand_model', 'Marca / Model')}
          {input('vehicle_registration', 'Nr. inmatriculare')}
          {input('vehicle_series', 'Serie cadru / SN')}
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>{input('vehicle_km', 'KM')}</View>
            <View style={{ flex: 1 }}>{input('vehicle_battery', 'Baterie')}</View>
          </View>
        </Section>

        <Section title="Receptie si solicitare">
          {input('issue_description', 'Defect / solicitare declarata', { multiline: true })}
          {input('visible_damage', 'Avarii / urme vizibile', { multiline: true })}
          <View style={styles.subSectionBlock}>
            <Text style={styles.subSectionTitle}>Accesorii predate</Text>
            <View style={styles.toggleGrid}>
              {toggle('accessories_charger', 'Incarcator')}
              {toggle('accessories_keys', 'Chei')}
              {toggle('accessories_saddle', 'Sa')}
              {toggle('accessories_other', 'Altele')}
            </View>
          </View>
          <View style={styles.subSectionBlock}>
            <Text style={styles.subSectionTitle}>Detalii accesorii / altele</Text>
            {input('accessories_other_text', 'Detalii accesorii')}
          </View>
          <View style={styles.subSectionBlock}>
            <Text style={styles.subSectionTitle}>Constatari rapide</Text>
            <View style={styles.toggleGrid}>
              {toggle('quick_powers_on', 'Porneste')}
              {toggle('quick_impact', 'Nu porneste')}
              {toggle('quick_water_traces', 'Urme apa')}
              {toggle('quick_battery_risk', 'Risc baterie')}
            </View>
          </View>
          <View style={styles.subSectionBlock}>
            <Text style={styles.subSectionTitle}>Poza produs</Text>
            <View style={styles.choiceRow}>
              {choice<ServiceProductPhoto>('da', form.product_photo, 'DA', () => update('product_photo', 'da'))}
              {choice<ServiceProductPhoto>('nu', form.product_photo, 'NU', () => update('product_photo', 'nu'))}
              {choice<ServiceProductPhoto>('', form.product_photo, 'Nesetat', () => update('product_photo', ''))}
            </View>
          </View>
        </Section>

        <Section title="Diagnostic si interventie">
          {input('technician_name', 'Tehnician / Mecanic')}
          {input('service_type', 'Tip serviciu')}
          {input('diagnostic', 'Diagnostic / cauza', { multiline: true })}
          {input('work_performed', 'Lucrari efectuate / test final', { multiline: true })}
          {input('parts_used', 'Piese inlocuite / utilizate', { multiline: true })}
          {input('observations', 'Observatii', { multiline: true })}
          {canViewFinancials ? (
            <>
              <View style={styles.financialGroup}>
                <Text style={styles.financialGroupKicker}>Costuri interne</Text>
                <Text style={styles.financialGroupTitle}>Ce scade din suma G-Trots</Text>
                <Text style={styles.financialGroupHint}>
                  Daca un cost intern ramane necompletat, se foloseste automat valoarea afisata in fisa. Valoarea 0 ramane zero explicit.
                </Text>
                <View style={styles.twoCols}>
                  <View style={{ flex: 1 }}>{input('internal_parts_cost', `Piese intern ${form.currency_code}`, { keyboardType: 'numeric', placeholder: 'Necompletat' })}</View>
                  <View style={{ flex: 1 }}>{input('internal_labor_cost', `Manopera intern ${form.currency_code}`, { keyboardType: 'numeric', placeholder: 'Necompletat' })}</View>
                </View>
                <ClientExpenseSelector
                  expenses={expenses}
                  value={form.expense_costs}
                  onChange={(expenseCosts) => setForm((current) => current ? {
                    ...current,
                    expense_costs: expenseCosts,
                    internal_other_costs: String(expenseCosts.reduce(
                      (sum, item) => sum + Math.max(Number(item.cost) || 0, 0),
                      0
                    )),
                  } : current)}
                  onCreateExpense={user?.role === 'admin' || user?.role === 'manager' ? async (name, color) => {
                    if (!token) throw new Error('Sesiunea a expirat. Autentifica-te din nou.');
                    const created = await createExpenseCategory(token, name, color);
                    setExpenses((current) => current.some((expense) => expense.id === created.id) ? current : [...current, created]);
                    return created;
                  } : undefined}
                  currencyCode={form.currency_code}
                />
                <Text style={styles.financialGroupHint}>Cheltuielile sunt sincronizate automat cu clientul la salvarea fisei.</Text>
                <View style={styles.financialSummaryRow}>
                  <Text style={styles.financialSummaryLabel}>Cost intern efectiv</Text>
                  <Text style={styles.financialSummaryValue}>{fmt(internalTotal)} {form.currency_code}</Text>
                </View>
                <View style={[styles.financialSummaryRow, styles.gtrotsSummaryRow]}>
                  <Text style={styles.gtrotsSummaryLabel}>Ramane pentru G-Trots</Text>
                  <Text style={styles.gtrotsSummaryValue}>{fmt(gtrotsRemaining)} {form.currency_code}</Text>
                </View>
              </View>
              <View style={styles.financialGroup}>
                <Text style={styles.financialGroupKicker}>Valori pentru client</Text>
                <Text style={styles.financialGroupTitle}>Ce apare in fisa de service si PDF</Text>
              </View>
          <SearchableSelect
            label="Moneda pentru toate valorile financiare"
            value={form.currency_code || 'RON'}
            options={CURRENCY_OPTIONS}
            onChange={(value) => update('currency_code', value)}
            searchPlaceholder="Cauta moneda sau codul..."
          />
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>{input('diagnostic_price', `Diagnostic ${form.currency_code}`, { keyboardType: 'numeric' })}</View>
            <View style={{ flex: 1 }}>{input('parts_price', `Piese ${form.currency_code}`, { keyboardType: 'numeric' })}</View>
          </View>
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>{input('labor_price', `Manopera ${form.currency_code}`, { keyboardType: 'numeric' })}</View>
            <View style={{ flex: 1 }}>{input('total_price', `Pret total ${form.currency_code}`, { keyboardType: 'numeric' })}</View>
          </View>
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>{input('advance_amount', `Avans ${form.currency_code}`, { keyboardType: 'numeric' })}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{amountDueLabel}</Text>
              <TextInput
                style={[styles.input, styles.readonlyInput]}
                value={`${fmt(displayedAmountDue)} ${form.currency_code}`}
                editable={false}
              />
            </View>
          </View>
          <Text style={styles.label}>Status plata</Text>
          <View style={styles.paymentStatusRow}>
            <TouchableOpacity
              style={[
                styles.paymentStatusChip,
                effectivePaymentStatus !== 'incasati' && styles.paymentStatusUnpaid,
              ]}
              onPress={() => updatePaymentStatus('de_incasat')}
              activeOpacity={0.84}>
              <Text style={[
                styles.paymentStatusText,
                effectivePaymentStatus !== 'incasati' && styles.paymentStatusTextUnpaid,
              ]}>Neachitat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.paymentStatusChip,
                effectivePaymentStatus === 'incasati' && styles.paymentStatusPaid,
              ]}
              onPress={() => updatePaymentStatus('incasati')}
              activeOpacity={0.84}>
              <Text style={[
                styles.paymentStatusText,
                effectivePaymentStatus === 'incasati' && styles.paymentStatusTextPaid,
              ]}>Achitat</Text>
            </TouchableOpacity>
          </View>
          {input('client_discount', 'Reducere client (%)', { keyboardType: 'numeric' })}
          {effectiveTotal > 0 ? <Text style={styles.totalHint}>Total calculat ({paymentStatusLabel}): {fmt(effectiveTotal)} {form.currency_code}</Text> : null}
            </>
          ) : (
            <View style={styles.financialHiddenCard}>
              <Text style={styles.financialHiddenTitle}>Valorile financiare sunt ascunse</Text>
              <Text style={styles.financialHiddenText}>Poti completa costurile numai in fluxul deschis imediat dupa scanare. Dupa salvare, accesul este restrictionat de administrator.</Text>
            </View>
          )}
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>
              <View style={styles.field}>
                <Text style={styles.label}>Termen</Text>
                <TextInput
                  style={styles.input}
                  value={deadlineValue}
                  onChangeText={(value) => update('deadline', sanitizeDurationNumber(value))}
                  placeholder="Ex: 3"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <SearchableSelect
                label="Unitate termen"
                value={form.deadline_unit || 'zile'}
                options={DEADLINE_UNIT_OPTIONS}
                onChange={(value) => update('deadline_unit', value)}
                searchPlaceholder="Cauta unitatea..."
              />
            </View>
          </View>
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>
              <View style={styles.field}>
                <Text style={styles.label}>Garantie</Text>
                <TextInput
                  style={styles.input}
                  value={warrantyParts.value}
                  onChangeText={updateWarrantyValue}
                  placeholder="Ex: 30"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <SearchableSelect
                label="Unitate garantie"
                value={warrantyParts.unit || 'zile'}
                options={WARRANTY_UNIT_OPTIONS}
                onChange={updateWarrantyUnit}
                searchPlaceholder="Cauta unitatea..."
              />
            </View>
          </View>
        </Section>

        <Section title="Acord / predare">
          <View style={styles.toggleGrid}>
            {toggle('approve_diagnostic_test', 'Aprob diagnostic + test')}
            {toggle('approve_repair_estimate', 'Aprob reparatia/devizul')}
            {toggle('reject_repair', 'Refuz reparatia')}
            {toggle('vehicle_delivered_checked', 'Vehicul predat verificat')}
            {toggle('old_parts_client', 'Piese vechi client')}
            {toggle('old_parts_recycle', 'Piese vechi reciclare')}
          </View>
          <View style={styles.twoCols}>
            <View style={{ flex: 1 }}>{input('storage_fee_per_day', `Depozitare ${form.currency_code}/zi`, { keyboardType: 'numeric' })}</View>
            <View style={{ flex: 1 }}>{input('storage_after_days', 'Dupa zile', { keyboardType: 'numeric' })}</View>
          </View>
          <View style={styles.field}>
            <View style={styles.dateLabelRow}>
              <Text style={styles.label}>Data / Ora Incheiere</Text>
              <Text style={styles.dateFormatHint}>DD-MM-YYYY HH:mm</Text>
            </View>
            <View style={styles.dateTimeControl}>
              <TextInput
                style={[styles.input, styles.dateTimeInput]}
                value={form.finalized_at || ''}
                onChangeText={(value) => update('finalized_at', value.trim() ? value : null)}
                placeholder="Selecteaza data"
                placeholderTextColor={Colors.textMuted}
                keyboardType="numbers-and-punctuation"
              />
              <TouchableOpacity
                style={styles.nowBtn}
                onPress={() => update('finalized_at', nowDateTimeInput())}
                activeOpacity={0.84}>
                <Clock3 size={15} color={Colors.white} />
                <Text style={styles.nowBtnText}>Acum</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={[styles.signatureCard, hasClientSignature(form.client_signature) && styles.signatureCardSigned]}>
            <View style={styles.signatureCopy}>
              {hasClientSignature(form.client_signature) ? (
                <CheckCircle2 size={19} color={Colors.success} />
              ) : (
                <Signature size={19} color={Colors.orange} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.signatureTitle}>
                  {hasClientSignature(form.client_signature) ? 'Client semnat' : 'Semnatura client'}
                </Text>
                <Text style={styles.signatureSubtitle}>
                  {hasClientSignature(form.client_signature)
                    ? `Semnata la ${fmtDate(form.client_signed_at || undefined)}`
                    : 'Obligatorie inainte de trimiterea PDF-ului.'}
                </Text>
              </View>
            </View>
            <TouchableOpacity style={styles.signatureButton} onPress={() => setSignatureVisible(true)}>
              <Signature size={16} color={Colors.white} />
              <Text style={styles.signatureButtonText}>
                {hasClientSignature(form.client_signature) ? 'Semneaza din nou' : 'Semneaza client'}
              </Text>
            </TouchableOpacity>
          </View>
        </Section>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={goBack}>
            <X size={16} color={Colors.textSecondary} />
            <Text style={styles.cancelText}>Inchide</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Save size={16} color={Colors.white} />}
            <Text style={styles.saveText}>Salveaza fisa</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
      <ClientSignatureModal
        visible={signatureVisible}
        value={form.client_signature}
        onClose={() => setSignatureVisible(false)}
        onSave={saveClientSignature}
      />
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 14, paddingBottom: 120 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  kicker: { color: Colors.orange, fontSize: 11, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.8 },
  title: { color: Colors.textPrimary, fontSize: 20, fontFamily: 'Inter-Bold', marginTop: 3 },
  meta: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 4 },
  finalizedPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: Colors.successDim,
    borderWidth: 1,
    borderColor: Colors.success + '44',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  finalizedPillText: { color: Colors.success, fontSize: 11, fontFamily: 'Inter-Bold' },
  heroActions: {
    alignItems: 'flex-end',
    gap: 8,
    marginLeft: 10,
  },
  whatsappBtn: {
    backgroundColor: Colors.successDim,
    borderColor: Colors.success + '55',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  whatsappText: { color: Colors.success, fontSize: 12, fontFamily: 'Inter-Bold' },
  pdfBtn: {
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pdfText: { color: Colors.white, fontSize: 13, fontFamily: 'Inter-Bold' },
  companyPdfSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  companyPdfSwitchCopy: { flex: 1 },
  companyPdfSwitchTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  companyPdfSwitchSub: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 3 },
  error: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    borderColor: Colors.error + '33',
    borderWidth: 1,
    borderRadius: 12,
    padding: 11,
    marginBottom: 12,
  },
  section: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    marginBottom: 12,
  },
  sectionTitle: { color: Colors.textPrimary, fontSize: 16, fontFamily: 'Inter-Bold', marginBottom: 12 },
  subSectionBlock: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface + 'AA',
    padding: 11,
    marginBottom: 11,
  },
  subSectionTitle: {
    color: Colors.orange,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 9,
  },
  field: { marginBottom: 11 },
  label: { color: Colors.textSecondary, fontSize: 11, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    color: Colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  readonlyInput: {
    color: Colors.orange,
    backgroundColor: Colors.orange + '12',
    borderColor: Colors.orange + '55',
    fontFamily: 'Inter-Bold',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 11,
  },
  paymentStatusChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentStatusUnpaid: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warning + '20',
  },
  paymentStatusPaid: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '20',
  },
  paymentStatusText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  paymentStatusTextUnpaid: {
    color: Colors.warning,
  },
  paymentStatusTextPaid: {
    color: Colors.success,
  },
  dateLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  dateFormatHint: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  dateTimeControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  dateTimeInput: {
    flex: 1,
    marginBottom: 0,
  },
  nowBtn: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: Colors.orange,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nowBtnText: {
    color: Colors.white,
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  textarea: { minHeight: 86 },
  twoCols: { flexDirection: 'row', gap: 10 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  choice: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.surface },
  choiceActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  choiceText: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Medium' },
  choiceTextActive: { color: Colors.orange, fontFamily: 'Inter-Bold' },
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  toggleActive: { borderColor: Colors.orange, backgroundColor: Colors.orangeDim },
  toggleBox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: Colors.cardBorder, alignItems: 'center', justifyContent: 'center' },
  toggleBoxActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  toggleText: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium' },
  toggleTextActive: { color: Colors.orange, fontFamily: 'Inter-Bold' },
  totalHint: { color: Colors.success, fontSize: 12, fontFamily: 'Inter-Bold', marginTop: -3, marginBottom: 14 },
  financialGroup: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface + 'CC',
    padding: 13,
    marginBottom: 14,
  },
  financialGroupKicker: { color: Colors.orange, fontSize: 10, fontFamily: 'Inter-Bold', textTransform: 'uppercase', letterSpacing: 0.7 },
  financialGroupTitle: { color: Colors.textPrimary, fontSize: 14, fontFamily: 'Inter-Bold', marginTop: 3, marginBottom: 8 },
  financialGroupHint: { color: Colors.textMuted, fontSize: 11, lineHeight: 16, fontFamily: 'Inter-Regular', marginBottom: 12 },
  financialSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: Colors.cardBorder, paddingTop: 10, marginTop: 2 },
  financialSummaryLabel: { color: Colors.textSecondary, fontSize: 12, fontFamily: 'Inter-Medium' },
  financialSummaryValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  gtrotsSummaryRow: { backgroundColor: Colors.orangeDim, borderTopWidth: 0, borderRadius: 11, paddingHorizontal: 10, paddingBottom: 10, marginTop: 10 },
  gtrotsSummaryLabel: { color: Colors.orange, fontSize: 12, fontFamily: 'Inter-Bold' },
  gtrotsSummaryValue: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter-Bold' },
  financialHiddenCard: { borderRadius: 14, borderWidth: 1, borderColor: Colors.cardBorder, backgroundColor: Colors.surface, padding: 14, marginBottom: 14 },
  financialHiddenTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  financialHiddenText: { color: Colors.textMuted, fontSize: 11, lineHeight: 17, fontFamily: 'Inter-Regular', marginTop: 5 },
  signatureCard: {
    marginTop: 5,
    padding: 12,
    gap: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
    backgroundColor: Colors.orangeDim,
  },
  signatureCardSigned: {
    borderColor: Colors.success + '55',
    backgroundColor: Colors.successDim,
  },
  signatureCopy: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  signatureTitle: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-Bold' },
  signatureSubtitle: { color: Colors.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 2 },
  signatureButton: {
    minHeight: 43,
    borderRadius: 11,
    backgroundColor: Colors.orange,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  signatureButtonText: { color: Colors.white, fontSize: 12, fontFamily: 'Inter-Bold' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 0.42,
    borderRadius: 12,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  cancelText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter-Medium' },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: Colors.orange,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  saveText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-Bold' },
});
