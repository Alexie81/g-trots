import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Colors, fmt } from '@/constants/colors';
import { calculateClientPayment, displayAmountDueForPayment, isTotalOnlyPayment } from '@/constants/financial';
import { CheckCircle, X } from 'lucide-react-native';
import type { Client } from '@/types';

interface Props {
  visible: boolean;
  client: Client | null;
  onClose: () => void;
}

export default function QrSuccessModal({ visible, client, onClose }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scale.setValue(0);
      opacity.setValue(0);
    }
  }, [visible]);

  if (!client) return null;

  const predefinedPrice = Number(client.predefined_price || 0);
  const payment = calculateClientPayment(
    client.price,
    predefinedPrice,
    client.discount_percentage,
    client.advance_amount
  );
  const totalPrice = payment.grossTotal;
  const discountAmount = totalPrice - payment.total;
  const finalPrice = payment.total;
  const currency = client.currency_code || 'RON';
  const amountDue = payment.amountDue;
  const totalOnlyPayment = isTotalOnlyPayment(client.price, predefinedPrice, client.advance_amount);
  const displayedAmountDue = client.payment_status === 'incasati' && Number(client.advance_amount || 0) <= 0
    ? 0
    : displayAmountDueForPayment(client.price, predefinedPrice, amountDue, client.advance_amount);
  const amountDueLabel = `Rest de plata (${client.payment_status === 'incasati' ? 'Achitat' : 'Neachitat'})`;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={18} color={Colors.textMuted} />
          </TouchableOpacity>

          {/* Success icon */}
          <View style={styles.iconWrap}>
            <View style={styles.iconRing}>
              <CheckCircle size={52} color={Colors.success} strokeWidth={2} />
            </View>
          </View>

          <Text style={styles.title}>Cod QR Validat!</Text>
          <Text style={styles.subtitle}>Codul a fost utilizat cu succes</Text>

          <View style={styles.divider} />

          {/* Client info */}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Client</Text>
            <Text style={styles.infoValue}>{client.name}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Telefon</Text>
            <Text style={styles.infoValue}>{client.phone}</Text>
          </View>
          {!client.financials_hidden ? (
            <>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Valoare Lucrare</Text>
            <Text style={[styles.infoValue, { color: Colors.orange }]}>
              {fmt(client.price)} {currency}
            </Text>
          </View>
          {predefinedPrice > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Pret predefinit</Text>
              <Text style={[styles.infoValue, { color: Colors.success }]}>
                {fmt(predefinedPrice)} {currency}
              </Text>
            </View>
          )}

          {client.discount_percentage > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Reducere</Text>
              <Text style={[styles.infoValue, { color: Colors.success }]}>
                -{client.discount_percentage}% ({fmt(discountAmount)} {currency})
              </Text>
            </View>
          )}
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Total de plata</Text>
            <Text style={[styles.infoValue, styles.finalPrice]}>
              {fmt(finalPrice)} {currency}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Avans</Text>
            <Text style={styles.infoValue}>{fmt(client.advance_amount || 0)} {currency}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>{amountDueLabel}</Text>
            <Text style={[styles.infoValue, styles.finalPrice]}>{fmt(displayedAmountDue)} {currency}</Text>
          </View>
            </>
          ) : (
            <View style={styles.hiddenFinancials}>
              <Text style={styles.hiddenFinancialsTitle}>Valorile financiare au fost salvate</Text>
              <Text style={styles.hiddenFinancialsText}>Vizualizarea lor este restrictionata de administrator.</Text>
            </View>
          )}

          {client.profiles && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Agent</Text>
              <View style={[styles.agentBadge, { backgroundColor: client.profiles.color + '22' }]}>
                <Text style={[styles.agentText, { color: client.profiles.color }]}>
                  {client.profiles.name}
                </Text>
              </View>
            </View>
          )}

          {client.notes ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>Note</Text>
              <Text style={styles.notesText}>{client.notes}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.okBtn} onPress={onClose}>
            <Text style={styles.okText}>OK</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 28,
    width: Math.min(width - 48, 360),
    borderWidth: 1,
    borderColor: Colors.success + '44',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
  },
  iconWrap: {
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: Colors.successDim,
    borderWidth: 3,
    borderColor: Colors.success + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 22,
    fontFamily: 'Inter-Bold',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    marginBottom: 20,
    textAlign: 'center',
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: Colors.cardBorder,
    marginBottom: 16,
  },
  hiddenFinancials: { backgroundColor: Colors.orangeDim, borderWidth: 1, borderColor: Colors.orange + '44', borderRadius: 12, padding: 12, marginVertical: 4 },
  hiddenFinancialsTitle: { color: Colors.textPrimary, fontSize: 12, fontFamily: 'Inter-Bold' },
  hiddenFinancialsText: { color: Colors.textMuted, fontSize: 10, lineHeight: 15, fontFamily: 'Inter-Regular', marginTop: 3 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  infoLabel: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  infoValue: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'right',
    flex: 1,
  },
  finalPrice: {
    color: Colors.success,
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  agentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  agentText: { fontSize: 12, fontFamily: 'Inter-SemiBold' },
  notesBox: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginTop: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    alignItems: 'flex-start',
  },
  notesLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  notesText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  okBtn: {
    marginTop: 20,
    backgroundColor: Colors.success,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  okText: { color: Colors.white, fontSize: 16, fontFamily: 'Inter-Bold' },
});
