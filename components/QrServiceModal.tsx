import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { Colors, fmt } from '@/constants/colors';
import type { Client, PricePreset, ServiceFormData } from '@/types';
import FinancialPriceControls from '@/components/FinancialPriceControls';
import KeyboardAwareScrollView from '@/components/KeyboardAwareScrollView';
import SwipeDownSheet from '@/components/SwipeDownSheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Phone, Percent, FileText, X, Save } from 'lucide-react-native';
import { calculateClientPayment, displayAmountDueForPayment, isTotalOnlyPayment } from '@/constants/financial';

interface Props {
  visible: boolean;
  client: Client | null;
  pricePresets?: PricePreset[];
  onSave: (form: ServiceFormData) => Promise<void>;
  onOpenServiceSheet?: (client: Client) => Promise<void> | void;
  onCancel: () => void;
}

export default function QrServiceModal({ visible, client, pricePresets = [], onSave, onOpenServiceSheet, onCancel }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(600)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const [form, setForm] = useState<ServiceFormData>({
    price: '0',
    predefined_price: '0',
    advance_amount: '0',
    currency_code: 'RON',
    payment_status: 'de_incasat',
    discount_percentage: '0',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [openingSheet, setOpeningSheet] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      const defaultPredefinedPrice = Number(client?.predefined_price || 0) > 0
        ? Number(client?.predefined_price || 0)
        : Number(pricePresets[0]?.price || 0);
      const defaultWorkPrice = Number(client?.price || 0) > 0
        ? Number(client?.price || 0)
        : defaultPredefinedPrice;
      const payment = calculateClientPayment(
        defaultWorkPrice,
        defaultPredefinedPrice,
        client?.discount_percentage,
        client?.advance_amount
      );
      setForm({
        price: String(defaultWorkPrice || 0),
        predefined_price: String(defaultPredefinedPrice),
        advance_amount: String(client?.advance_amount || 0),
        currency_code: client?.currency_code || 'RON',
        payment_status:
          client?.payment_status
          || (payment.total > 0 && payment.amountDue <= 0 ? 'incasati' : 'de_incasat'),
        discount_percentage: client?.discount_percentage ? String(client.discount_percentage) : '0',
        // Defectul introdus la adaugarea clientului trebuie pastrat la scanare.
        notes: client?.notes || '',
      });
      setError('');
      setSaving(false);
      setOpeningSheet(false);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 600, duration: 250, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, client, pricePresets]);

  if (!client) return null;

  const priceVal = parseFloat(form.price) || 0;
  const predefinedPriceVal = parseFloat(form.predefined_price) || 0;
  const discountRaw = form.discount_percentage.trim()
    ? parseFloat(form.discount_percentage)
    : 0;
  const discountVal = isNaN(discountRaw) ? 0 : discountRaw;
  const advanceAmount = Math.max(parseFloat(form.advance_amount) || 0, 0);
  const payment = calculateClientPayment(
    priceVal,
    predefinedPriceVal,
    discountVal,
    advanceAmount
  );
  const totalPriceVal = payment.grossTotal;
  const discountAmount = totalPriceVal - payment.total;
  const finalPrice = payment.total;
  const amountDue = payment.amountDue;
  const totalOnlyPayment = isTotalOnlyPayment(priceVal, predefinedPriceVal, advanceAmount);
  const displayedAmountDue = form.payment_status === 'incasati' && advanceAmount <= 0
    ? 0
    : displayAmountDueForPayment(priceVal, predefinedPriceVal, amountDue, advanceAmount);
  const footerBottomPadding = Platform.OS === 'ios'
    ? Math.max(insets.bottom + 14, 32)
    : Math.max(insets.bottom + 18, 72);

  const handleSave = async () => {
    if (isNaN(discountRaw) || discountVal < 0 || discountVal > 100) {
      return setError('Reducerea trebuie sa fie intre 0 si 100.');
    }
    setError('');
    setSaving(true);
    try {
      await onSave(form);
    } catch (e: any) {
      setError(e.message || 'Eroare la salvare.');
      setSaving(false);
    }
  };

  const handleOpenServiceSheet = async () => {
    if (!onOpenServiceSheet || !client) return;
    setOpeningSheet(true);
    setError('');
    try {
      await onOpenServiceSheet(client);
    } catch (e: any) {
      setError(e.message || 'Fisa de service nu a putut fi deschisa.');
      setOpeningSheet(false);
    }
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

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onCancel} activeOpacity={1} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <SwipeDownSheet
            visible={visible}
            onClose={onCancel}
            disabled={saving || openingSheet}
            style={styles.sheetInner}>

          {/* Client header */}
          <View style={styles.clientHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{client.name}</Text>
              <View style={styles.phoneRow}>
                <Phone size={12} color={Colors.textMuted} />
                <Text style={styles.clientPhone}>{client.phone}</Text>
              </View>
              {client.profiles && (
                <View style={[styles.agentBadge, { backgroundColor: client.profiles.color + '22' }]}>
                  <Text style={[styles.agentText, { color: client.profiles.color }]}>
                    {client.profiles.name}
                  </Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onCancel} style={styles.closeBtn}>
              <X size={20} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          <KeyboardAwareScrollView
            contentContainerStyle={styles.form}
            extraScrollHeight={130}
            showsVerticalScrollIndicator={false}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <FinancialPriceControls
              label={`Pret Lucrare (${form.currency_code})`}
              price={form.price}
              predefinedPrice={form.predefined_price}
              advanceAmount={form.advance_amount}
              currencyCode={form.currency_code}
              totalAmount={finalPrice}
              amountDue={displayedAmountDue}
              paymentStatus={form.payment_status}
              totalOnlyPayment={totalOnlyPayment}
              presets={pricePresets}
              autoFocus
              onPriceChange={(v) => setForm((f) => ({ ...f, price: v }))}
              onPredefinedPriceChange={updatePredefinedPrice}
              onAdvanceAmountChange={(v) => setForm((f) => ({ ...f, advance_amount: v }))}
              onCurrencyCodeChange={(v) => setForm((f) => ({ ...f, currency_code: v }))}
              onPaymentStatusChange={(v) => setForm((f) => ({ ...f, payment_status: v }))}
            />

            {/* Discount */}
            <Text style={styles.label}>
              <Percent size={12} color={Colors.orange} /> Reducere (%)
            </Text>
            <View style={styles.discountRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                value={form.discount_percentage}
                onChangeText={(v) => setForm((f) => ({ ...f, discount_percentage: v }))}
                keyboardType="numeric"
              />
              {discountAmount > 0 && (
                <View style={styles.discountPreview}>
                  <Text style={styles.discountPreviewText}>-{fmt(discountAmount)} {form.currency_code}</Text>
                </View>
              )}
            </View>

            {/* Live total */}
            {totalPriceVal > 0 && (
              <View style={styles.totalCard}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Pret initial</Text>
                  <Text style={styles.totalValue}>{fmt(totalPriceVal)} {form.currency_code}</Text>
                </View>
                {discountAmount > 0 && (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Reducere {discountVal}%</Text>
                    <Text style={[styles.totalValue, { color: Colors.success }]}>
                      -{fmt(discountAmount)} {form.currency_code}
                    </Text>
                  </View>
                )}
                <View style={[styles.totalRow, styles.totalFinalRow]}>
                  <Text style={styles.totalFinalLabel}>Total de Plata</Text>
                  <Text style={styles.totalFinalValue}>{fmt(finalPrice)} {form.currency_code}</Text>
                </View>
              </View>
            )}

            {/* Notes */}
            <Text style={styles.label}>
              <FileText size={12} color={Colors.orange} /> Note / Observatii (optional)
            </Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Ex: Trotineta a fost reglata, frâne schimbate..."
              placeholderTextColor={Colors.textMuted}
              value={form.notes}
              onChangeText={(v) => setForm((f) => ({ ...f, notes: v }))}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </KeyboardAwareScrollView>

          {/* Save button */}
          <View style={[styles.footer, { paddingBottom: footerBottomPadding }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
              <Text style={styles.cancelText}>Anuleaza</Text>
            </TouchableOpacity>
            {onOpenServiceSheet && (
              <TouchableOpacity style={styles.sheetBtn} onPress={handleOpenServiceSheet} disabled={saving || openingSheet}>
                {openingSheet ? (
                  <ActivityIndicator color={Colors.orange} size="small" />
                ) : (
                  <>
                    <FileText size={16} color={Colors.orange} />
                    <Text style={styles.sheetText}>Receptie si semnare</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <>
                  <Save size={16} color={Colors.white} />
                  <Text style={styles.saveText}>Salveaza</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          </SwipeDownSheet>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const { height } = Dimensions.get('window');

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: height * 0.88,
    borderTopWidth: 1,
    borderColor: Colors.cardBorder,
  },
  sheetInner: {
    maxHeight: height * 0.88,
  },
  handle: {
    width: 44,
    height: 4,
    backgroundColor: Colors.cardBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  clientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.orangeDim,
    borderWidth: 2,
    borderColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.orange, fontSize: 20, fontFamily: 'Inter-Bold' },
  clientInfo: { flex: 1, gap: 3 },
  clientName: { color: Colors.textPrimary, fontSize: 17, fontFamily: 'Inter-Bold' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clientPhone: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Regular' },
  agentBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  agentText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  closeBtn: { padding: 6 },
  divider: { height: 1, backgroundColor: Colors.cardBorder, marginHorizontal: 0 },

  form: { padding: 20, paddingBottom: 110 },
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
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  notesInput: {
    minHeight: 80,
    fontSize: 14,
  },
  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  discountPreview: {
    backgroundColor: Colors.successDim,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: Colors.success + '44',
  },
  discountPreviewText: { color: Colors.success, fontSize: 14, fontFamily: 'Inter-Bold' },

  totalCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    gap: 6,
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular' },
  totalValue: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Medium' },
  totalFinalRow: {
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
    paddingTop: 8,
    marginTop: 4,
  },
  totalFinalLabel: { color: Colors.textPrimary, fontSize: 15, fontFamily: 'Inter-SemiBold' },
  totalFinalValue: { color: Colors.orange, fontSize: 18, fontFamily: 'Inter-Bold' },

  errorText: {
    color: Colors.error,
    backgroundColor: Colors.errorDim,
    padding: 12,
    borderRadius: 10,
    marginBottom: 4,
    fontFamily: 'Inter-Regular',
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.error + '33',
  },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    borderTopWidth: 1,
    borderTopColor: Colors.cardBorder,
  },
  cancelBtn: {
    flex: 0.4,
    backgroundColor: Colors.card,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  cancelText: { color: Colors.textSecondary, fontSize: 14, fontFamily: 'Inter-Medium' },
  sheetBtn: {
    flex: 0.42,
    backgroundColor: Colors.orangeDim,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: Colors.orange + '55',
  },
  sheetText: { color: Colors.orange, fontSize: 14, fontFamily: 'Inter-Bold' },
  saveBtn: {
    flex: 1,
    backgroundColor: Colors.orange,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveText: { color: Colors.white, fontSize: 14, fontFamily: 'Inter-Bold' },
});
