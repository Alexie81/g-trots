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
import { calculateClientPayment } from '@/constants/financial';
import { XCircle } from 'lucide-react-native';
import type { Client } from '@/types';

interface Props {
  visible: boolean;
  client: Client | null;
  onClose: () => void;
}

export default function QrErrorModal({ visible, client, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.6)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.6);
      opacity.setValue(0);
    }
  }, [visible]);

  const usedAtFormatted = client?.qr_used_at
    ? new Date(client.qr_used_at).toLocaleString('ro-RO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  const isNotFound = client?.id === '';
  const isFinalized = !!client?.is_finalized;
  const predefinedPrice = Number(client?.predefined_price || 0);
  const totalPrice = calculateClientPayment(
    client?.price,
    predefinedPrice,
    client?.discount_percentage,
    client?.advance_amount
  ).total;
  const currency = client?.currency_code || 'RON';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          {/* Error icon */}
          <View style={styles.iconRing}>
            <XCircle size={56} color={Colors.error} strokeWidth={1.8} />
          </View>

          <Text style={styles.title}>
            {isNotFound ? 'Cod Negasit!' : isFinalized ? 'Client Finalizat!' : 'Cod indisponibil!'}
          </Text>
          <Text style={styles.subtitle}>
            {isNotFound
              ? `Codul "${client?.qr_code}" nu exista in baza de date`
              : isFinalized
                ? 'Clientul este finalizat si nu mai poate fi scanat.'
                : 'Acest cod QR nu este disponibil momentan.'}
          </Text>

          <View style={styles.divider} />

          {client && !isNotFound && (
            <>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Client</Text>
                <Text style={styles.rowValue}>{client.name}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Telefon</Text>
                <Text style={styles.rowValue}>{client.phone}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Cod QR</Text>
                <Text style={[styles.rowValue, { color: Colors.textMuted }]}>{client.qr_code}</Text>
              </View>
              {usedAtFormatted && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Utilizat la</Text>
                  <Text style={[styles.rowValue, { color: Colors.error }]}>{usedAtFormatted}</Text>
                </View>
              )}
              {totalPrice > 0 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Valoare Fisa</Text>
                  <Text style={[styles.rowValue, { color: Colors.orange }]}>
                    {fmt(totalPrice)} {currency}
                  </Text>
                </View>
              )}
              {predefinedPrice > 0 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Pret predefinit</Text>
                  <Text style={[styles.rowValue, { color: Colors.success }]}>
                    {fmt(predefinedPrice)} {currency}
                  </Text>
                </View>
              )}
              {client.notes && (
                <View style={[styles.notesBox]}>
                  <Text style={styles.notesLabel}>Note</Text>
                  <Text style={styles.notesText}>{client.notes}</Text>
                </View>
              )}
            </>
          )}

          <TouchableOpacity style={styles.okBtn} onPress={onClose}>
            <Text style={styles.okText}>Am Inteles</Text>
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
    backgroundColor: 'rgba(0,0,0,0.78)',
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
    borderColor: Colors.error + '44',
    alignItems: 'center',
  },
  iconRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.errorDim,
    borderWidth: 3,
    borderColor: Colors.error + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    color: Colors.error,
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 10,
  },
  rowLabel: { color: Colors.textMuted, fontSize: 13, fontFamily: 'Inter-Regular', flex: 1 },
  rowValue: { color: Colors.textPrimary, fontSize: 13, fontFamily: 'Inter-SemiBold', flex: 1, textAlign: 'right' },
  notesBox: {
    width: '100%',
    backgroundColor: Colors.card,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  notesLabel: { color: Colors.textMuted, fontSize: 11, fontFamily: 'Inter-Medium', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  notesText: { color: Colors.textSecondary, fontSize: 13, fontFamily: 'Inter-Regular', lineHeight: 18 },
  okBtn: {
    marginTop: 16,
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  okText: { color: Colors.white, fontSize: 16, fontFamily: 'Inter-Bold' },
});
