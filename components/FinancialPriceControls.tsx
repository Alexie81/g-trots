import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '@/constants/colors';
import { CURRENCY_OPTIONS, normalizeCurrency } from '@/constants/financial';
import type { PricePreset } from '@/types';
import SearchableSelect from '@/components/SearchableSelect';

interface Props {
  label?: string;
  price: string;
  predefinedPrice: string;
  advanceAmount: string;
  currencyCode: string;
  totalAmount?: number;
  amountDue?: number;
  paymentStatus?: 'incasati' | 'de_incasat';
  totalOnlyPayment?: boolean;
  presets?: PricePreset[];
  disabled?: boolean;
  autoFocus?: boolean;
  onPriceChange: (value: string) => void;
  onPredefinedPriceChange: (value: string) => void;
  onAdvanceAmountChange: (value: string) => void;
  onCurrencyCodeChange: (value: string) => void;
  onPaymentStatusChange?: (value: 'incasati' | 'de_incasat') => void;
}

export default function FinancialPriceControls({
  label = 'Pret Lucrare (RON)',
  price,
  predefinedPrice,
  advanceAmount,
  currencyCode,
  totalAmount,
  amountDue,
  paymentStatus = 'de_incasat',
  totalOnlyPayment = false,
  presets = [],
  disabled = false,
  autoFocus = false,
  onPriceChange,
  onPredefinedPriceChange,
  onAdvanceAmountChange,
  onCurrencyCodeChange,
  onPaymentStatusChange,
}: Props) {
  const currency = normalizeCurrency(currencyCode);
  const effectivePaymentStatus =
    !totalOnlyPayment && Number(totalAmount || 0) > 0 && Number(amountDue || 0) <= 0
      ? 'incasati'
      : paymentStatus;
  const amountDueLabel = `Rest de plata (${currency})`;
  const applyPrice = (value: string) => {
    onPriceChange(value);
  };
  const applyPredefinedPrice = (value: string) => {
    onPredefinedPriceChange(value);
  };
  const selectedPreset =
    presets.find((preset) => Number(preset.price || 0) === Number(predefinedPrice || 0))
    || presets[0];
  const predefinedLabel = selectedPreset?.label || 'Pret predefinit';

  return (
    <View style={[styles.wrap, disabled && styles.wrapDisabled]}>
      <SearchableSelect
        label="Moneda"
        value={currency}
        options={CURRENCY_OPTIONS}
        onChange={onCurrencyCodeChange}
        searchPlaceholder="Cauta moneda sau codul..."
        disabled={disabled}
      />

      <Text style={styles.label}>{label.replace('(RON)', `(${currency})`)}</Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="0"
        placeholderTextColor={Colors.textMuted}
        value={price}
        onChangeText={applyPrice}
        keyboardType="numeric"
        editable={!disabled}
        autoFocus={autoFocus}
      />

      <Text style={[styles.label, styles.secondaryLabel]}>{predefinedLabel} ({currency})</Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="0"
        placeholderTextColor={Colors.textMuted}
        value={predefinedPrice}
        onChangeText={applyPredefinedPrice}
        keyboardType="numeric"
        editable={!disabled}
      />

      <Text style={[styles.label, styles.secondaryLabel]}>Avans ({currency})</Text>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder="0"
        placeholderTextColor={Colors.textMuted}
        value={advanceAmount}
        onChangeText={onAdvanceAmountChange}
        keyboardType="numeric"
        editable={!disabled}
      />

      {totalAmount !== undefined ? (
        <>
          <Text style={[styles.label, styles.secondaryLabel]}>Total de plata ({currency})</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={`${Number(totalAmount || 0).toFixed(2)} ${currency}`}
            editable={false}
            selectTextOnFocus={false}
          />
        </>
      ) : null}

      {amountDue !== undefined ? (
        <>
          <Text style={[styles.label, styles.secondaryLabel]}>{amountDueLabel}</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled, styles.dueInput]}
            value={`${Number(amountDue || 0).toFixed(2)} ${currency}`}
            editable={false}
            selectTextOnFocus={false}
          />
          {onPaymentStatusChange ? (
            <>
              <Text style={[styles.label, styles.secondaryLabel]}>Status plata</Text>
              <View style={styles.paymentStatusRow}>
                <TouchableOpacity
                  style={[
                    styles.paymentStatusChip,
                    effectivePaymentStatus !== 'incasati' && styles.paymentStatusChipActive,
                    disabled && styles.paymentStatusChipDisabled,
                  ]}
                  onPress={() => onPaymentStatusChange('de_incasat')}
                  disabled={disabled}
                  activeOpacity={0.82}>
                  <Text style={[
                    styles.paymentStatusText,
                    effectivePaymentStatus !== 'incasati' && styles.paymentStatusTextActive,
                  ]}>Neachitat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.paymentStatusChip,
                    effectivePaymentStatus === 'incasati' && styles.paymentStatusChipPaid,
                    disabled && styles.paymentStatusChipDisabled,
                  ]}
                  onPress={() => onPaymentStatusChange('incasati')}
                  disabled={disabled}
                  activeOpacity={0.82}>
                  <Text style={[
                    styles.paymentStatusText,
                    effectivePaymentStatus === 'incasati' && styles.paymentStatusTextPaid,
                  ]}>Achitat</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    padding: 12,
    gap: 10,
    marginTop: 14,
  },
  wrapDisabled: { opacity: 0.82 },
  label: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  secondaryLabel: {
    marginTop: 2,
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
  inputDisabled: {
    color: Colors.textSecondary,
    backgroundColor: Colors.bg,
  },
  dueInput: {
    backgroundColor: Colors.orange + '12',
    borderColor: Colors.orange + '55',
    color: Colors.orange,
    fontFamily: 'Inter-Bold',
  },
  paymentStatusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentStatusChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentStatusChipActive: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warning + '1F',
  },
  paymentStatusChipPaid: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '1F',
  },
  paymentStatusChipDisabled: {
    opacity: 0.65,
  },
  paymentStatusText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  paymentStatusTextActive: {
    color: Colors.warning,
  },
  paymentStatusTextPaid: {
    color: Colors.success,
  },
});
