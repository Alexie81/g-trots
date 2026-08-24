import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, fmt } from '@/constants/colors';
import Header from '@/components/Header';
import MobileChatHeaderButton from '@/components/MobileChatHeaderButton';
import ClientCollaboratorSelector from '@/components/ClientCollaboratorSelector';
import ClientExpenseSelector from '@/components/ClientExpenseSelector';
import FinancialPriceControls from '@/components/FinancialPriceControls';
import { createClient, createExpenseCategory, getCollaborators, getExpenseCategories, getProfiles, getPricePresets } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile, Collaborator, ExpenseCategory, ClientFormData, PricePreset } from '@/types';
import { QrCode } from 'lucide-react-native';
import { calculateCollaboratorDistribution } from '@/utils/collaboratorFinancials';
import { calculateClientPayment, displayAmountDueForPayment, isTotalOnlyPayment } from '@/constants/financial';

export default function NewClientScreen() {
  const router = useRouter();
  const { token, user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [pricePresets, setPricePresets] = useState<PricePreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ClientFormData>({
    name: '',
    phone: '',
    email: '',
    status: 'va_folosi_codul',
    price: '0',
    predefined_price: '0',
    advance_amount: '0',
    currency_code: 'RON',
    payment_status: 'de_incasat',
    discount_percentage: '0',
    manopera_colaboratori: '',
    collaborator_costs: [],
    valoare_piese: '',
    service_parts_price: '0',
    service_labor_price: '0',
    expense_costs: [],
    notes: '',
    profile_id: '',
  });

  useEffect(() => {
    const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
    if (!canViewClientPanel) {
      router.replace('/(tabs)/scanner');
      return;
    }
    Promise.all([getProfiles(), getCollaborators(), getExpenseCategories(), token ? getPricePresets(token) : Promise.resolve([])])
      .then(([p, c, e, presets]) => {
        setProfiles(p);
        setCollaborators(c);
        setExpenses(e);
        setPricePresets(presets);
        if (presets[0]) {
          setForm((current) => ({
            ...current,
            price:
              Number(current.price || 0) > 0
                ? current.price
                : String(Number(presets[0].price || 0)),
            predefined_price:
              Number(current.predefined_price || 0) > 0
                ? current.predefined_price
                : String(Number(presets[0].price || 0)),
          }));
        }
      })
      .catch(() => {});
  }, [router, token, user?.client_panel_access, user?.role]);

  const update = (key: keyof ClientFormData, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const updatePredefinedPrice = (value: string) => {
    setForm((current) => {
      const currentPrice = parseFloat(current.price) || 0;
      const previousPredefined = parseFloat(current.predefined_price) || 0;
      const nextPredefined = parseFloat(value) || 0;
      const shouldMirrorToWorkPrice =
        nextPredefined > 0
        && (currentPrice <= 0 || Math.abs(currentPrice - previousPredefined) < 0.01);
      return {
        ...current,
        predefined_price: value,
        price: shouldMirrorToWorkPrice ? value : current.price,
      };
    });
  };

  const setCollaboratorCosts = (collaboratorCosts: ClientFormData['collaborator_costs']) => {
    setForm((current) => ({
      ...current,
      collaborator_costs: collaboratorCosts,
    }));
  };

  const onSave = async () => {
    const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
    if (!canViewClientPanel) return setError('Contul tau nu are acces la panoul de clienti.');
    if (!form.name.trim()) return setError('Numele clientului este obligatoriu.');
    if (!form.phone.trim()) return setError('Numarul de telefon este obligatoriu.');
    const disc = parseFloat(form.discount_percentage);
    if (isNaN(disc) || disc < 0 || disc > 100)
      return setError('Reducerea trebuie sa fie intre 0 si 100.');
    setError('');
    setLoading(true);
    try {
      await createClient(form, token, selectedProfile?.percentage || 0);
      router.back();
    } catch (e: any) {
      setError(e.message || 'Eroare la salvare.');
    } finally {
      setLoading(false);
    }
  };

  const selectedProfile = profiles.find((p) => p.id === form.profile_id) || null;
  const priceValue = parseFloat(form.price) || 0;
  const predefinedPriceValue = parseFloat(form.predefined_price) || 0;
  const discountValue = parseFloat(form.discount_percentage) || 0;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(
    priceValue,
    predefinedPriceValue,
    discountValue,
    advanceAmount
  );
  const totalPriceValue = payment.grossTotal;
  const discountPreview =
    totalPriceValue > 0 && discountValue > 0
      ? fmt((totalPriceValue * discountValue) / 100)
      : null;
  const internalPartsInput = form.valoare_piese.trim() === '' ? null : Math.max(parseFloat(form.valoare_piese) || 0, 0);
  const valoarePiese = internalPartsInput === null ? Math.max(parseFloat(form.service_parts_price) || 0, 0) : internalPartsInput;
  const alteCheltuieli = form.expense_costs.reduce(
    (sum, item) => sum + (parseFloat(item.cost) || 0),
    0
  );
  const amountDue = payment.amountDue;
  const totalOnlyPayment = isTotalOnlyPayment(priceValue, predefinedPriceValue, advanceAmount);
  const displayedAmountDue = form.payment_status === 'incasati' && advanceAmount <= 0
    ? 0
    : displayAmountDueForPayment(priceValue, predefinedPriceValue, amountDue, advanceAmount);
  const amountDueLabel = `Rest de plata (${form.payment_status === 'incasati' ? 'Achitat' : 'Neachitat'})`;
  const totalIncasat = payment.total;
  const profileCastig = selectedProfile ? totalIncasat * (selectedProfile.percentage / 100) : 0;
  const collaboratorBaseBeforeCosts = Math.max(
    totalIncasat - profileCastig - valoarePiese - alteCheltuieli,
    0
  );
  const collaboratorDistribution = calculateCollaboratorDistribution(
    form.collaborator_costs,
    collaboratorBaseBeforeCosts
  );
  const internalLaborInput = form.manopera_colaboratori.trim() === '' ? null : Math.max(parseFloat(form.manopera_colaboratori) || 0, 0);
  const manoperaColaboratori = form.collaborator_costs.length > 0
    ? collaboratorDistribution.total
    : (internalLaborInput === null ? Math.max(parseFloat(form.service_labor_price) || 0, 0) : internalLaborInput);
  const gtrotsCastig = totalIncasat - profileCastig - manoperaColaboratori - valoarePiese - alteCheltuieli;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}>
      <View style={styles.container}>
        <Header
          title=""
          showBack
          onBack={() => router.back()}
          right={
            <View style={styles.headerActions}>
              <MobileChatHeaderButton />
              {loading ? (
                <ActivityIndicator color={Colors.orange} />
              ) : (
                <TouchableOpacity onPress={onSave}>
                  <Text style={styles.saveBtn}>Salveaza</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />

        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* QR auto-generate notice */}
          <View style={styles.qrNotice}>
            <QrCode size={16} color={Colors.orange} />
            <Text style={styles.qrNoticeText}>
              Codul QR va fi generat automat la salvare
            </Text>
          </View>

          <Text style={styles.label}>Nume Client *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Ion Popescu"
            placeholderTextColor={Colors.textMuted}
            value={form.name}
            onChangeText={(v) => update('name', v)}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Numar Telefon *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 0700 000 000"
            placeholderTextColor={Colors.textMuted}
            value={form.phone}
            onChangeText={(v) => update('phone', v)}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>Email (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: ion@email.com"
            placeholderTextColor={Colors.textMuted}
            value={form.email}
            onChangeText={(v) => update('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <FinancialPriceControls
            price={form.price}
            predefinedPrice={form.predefined_price}
            advanceAmount={form.advance_amount}
            currencyCode={form.currency_code}
            totalAmount={payment.total}
            amountDue={displayedAmountDue}
            paymentStatus={form.payment_status}
            totalOnlyPayment={totalOnlyPayment}
            presets={pricePresets}
            onPriceChange={(v) => update('price', v)}
            onPredefinedPriceChange={updatePredefinedPrice}
            onAdvanceAmountChange={(v) => update('advance_amount', v)}
            onCurrencyCodeChange={(v) => update('currency_code', v)}
            onPaymentStatusChange={(v) => update('payment_status', v)}
          />

          <Text style={styles.label}>Reducere QR (%)</Text>
          <View style={styles.discountRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="0"
              placeholderTextColor={Colors.textMuted}
              value={form.discount_percentage}
              onChangeText={(v) => update('discount_percentage', v)}
              keyboardType="numeric"
            />
            {discountPreview ? (
              <View style={styles.discountPreview}>
                <Text style={styles.discountPreviewText}>-{discountPreview} {form.currency_code}</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Note / Observatii (optional)</Text>
          <TextInput
            style={[styles.input, styles.notesInput]}
            placeholder="Ex: Trotineta reglata, frâne verificate..."
            placeholderTextColor={Colors.textMuted}
            value={form.notes}
            onChangeText={(v) => update('notes', v)}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          <Text style={styles.label}>Manopera Colaboratori ({form.currency_code})</Text>
          <ClientCollaboratorSelector
            collaborators={collaborators}
            value={form.collaborator_costs}
            onChange={setCollaboratorCosts}
            currencyCode={form.currency_code}
            baseBeforeCollaborators={collaboratorBaseBeforeCosts}
          />

          <Text style={styles.label}>Cost efectiv piese - intern ({form.currency_code})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.valoare_piese}
            onChangeText={(v) => update('valoare_piese', v)}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Piese afisate in fisa de service ({form.currency_code})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.service_parts_price}
            onChangeText={(v) => update('service_parts_price', v)}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Manopera afisata in fisa de service ({form.currency_code})</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={Colors.textMuted}
            value={form.service_labor_price}
            onChangeText={(v) => update('service_labor_price', v)}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Cheltuieli efective - intern</Text>
          <ClientExpenseSelector
            expenses={expenses}
            value={form.expense_costs}
            onChange={(expenseCosts) => setForm((current) => ({ ...current, expense_costs: expenseCosts }))}
            onCreateExpense={user?.role === 'admin' || user?.role === 'manager' ? async (name, color) => {
              if (!token) throw new Error('Sesiunea a expirat. Autentifică-te din nou.');
              const created = await createExpenseCategory(token, name, color);
              setExpenses((current) => current.some((expense) => expense.id === created.id) ? current : [...current, created]);
              return created;
            } : undefined}
            currencyCode={form.currency_code}
          />

          <View style={styles.calcGrid}>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>{amountDueLabel}</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={`${fmt(displayedAmountDue)} ${form.currency_code}`}
                editable={false}
                selectTextOnFocus={false}
              />
            </View>
            <View style={styles.calcField}>
              <Text style={styles.calcLabel}>G-Trots</Text>
              <TextInput
                style={[styles.input, styles.disabledInput]}
                value={`${fmt(gtrotsCastig)} ${form.currency_code}`}
                editable={false}
                selectTextOnFocus={false}
              />
            </View>
            {selectedProfile ? (
              <View style={styles.calcField}>
                <Text style={styles.calcLabel}>{selectedProfile.name}</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  value={`${fmt(profileCastig)} ${form.currency_code}`}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
            ) : null}
          </View>

          <Text style={styles.label}>Agent / Profil Afiliere</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, !form.profile_id && styles.chipActive]}
              onPress={() => update('profile_id', '')}>
              <Text style={[styles.chipText, !form.profile_id && styles.chipTextActive]}>
                Niciunul
              </Text>
            </TouchableOpacity>
            {profiles.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.chip,
                  form.profile_id === p.id && { backgroundColor: p.color, borderColor: p.color },
                ]}
                onPress={() => update('profile_id', p.id)}>
                <Text
                  style={[
                    styles.chipText,
                    form.profile_id === p.id ? { color: Colors.white } : { color: p.color },
                  ]}>
                  {p.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { padding: 16, paddingBottom: 140 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    marginBottom: 6,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  qrNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.orangeDim,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.orange + '33',
    marginBottom: 4,
  },
  qrNoticeText: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-Medium', flex: 1 },
  notesInput: { minHeight: 80, fontSize: 14 },
  collaboratorCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 10,
  },
  collaboratorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  collaboratorInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collaboratorDot: { width: 10, height: 10, borderRadius: 5 },
  collaboratorNameWrap: { flex: 1 },
  collaboratorName: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  collaboratorRole: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Regular', marginTop: 2 },
  collaboratorInput: {
    width: 104,
    textAlign: 'right',
    fontFamily: 'Inter-SemiBold',
  },
  collaboratorTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    paddingTop: 10,
  },
  collaboratorTotalLabel: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Medium' },
  collaboratorTotalValue: { color: Colors.orange, fontSize: 13, fontFamily: 'Inter-Bold' },
  emptyCollaboratorsText: { color: Colors.textMuted, fontSize: 12, fontFamily: 'Inter-Regular', lineHeight: 18 },
  calcGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  calcField: { flex: 1 },
  calcLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  disabledInput: {
    color: Colors.textSecondary,
    backgroundColor: Colors.surface,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discountPreview: {
    backgroundColor: Colors.successDim,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.success + '44',
  },
  discountPreviewText: { color: Colors.success, fontSize: 13, fontFamily: 'Inter-SemiBold' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
  },
  chipActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  chipText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' },
  chipTextActive: { color: Colors.white },
  saveBtn: { color: Colors.orange, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  errorText: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
  },
});
