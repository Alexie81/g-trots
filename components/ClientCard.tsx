import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, UIManager } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection, type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Colors, StatusColors, StatusLabels, fmt } from '@/constants/colors';
import type { Client } from '@/types';
import { CalendarClock, Phone, Tag, ChevronRight, ChevronDown, CheckCircle, Percent, Trash2, MessageCircle } from 'lucide-react-native';
import { calculateClientPayment, displayAmountDueForPayment, isTotalOnlyPayment } from '@/constants/financial';

interface Props {
  client: Client;
  onPress: (clientId: string) => void;
  onDelete?: (client: Client) => void;
  onWhatsApp?: (client: Client) => void;
  canDelete?: boolean;
}

function runClientCardLayoutAnimation() {
  try {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
    LayoutAnimation.configureNext({
      duration: 165,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  } catch {
    // Daca platforma nu suporta LayoutAnimation, ramane schimbarea instant.
  }
}

function ClientCard({ client, onPress, onDelete, onWhatsApp, canDelete = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const swipeRef = useRef<SwipeableMethods | null>(null);
  const expandProgress = useSharedValue(0);
  const statusColor = StatusColors[client.status] || Colors.textSecondary;
  const cardAccentColor = client.is_finalized ? Colors.success : Colors.error;
  const payment = calculateClientPayment(
    client.price,
    client.predefined_price,
    client.discount_percentage,
    client.advance_amount
  );
  const totalDupaReducere = payment.total;
  const baniIncasat = payment.amountDue;
  const totalOnlyPayment = isTotalOnlyPayment(
    client.price,
    client.predefined_price,
    client.advance_amount
  );
  const baniIncasatAfisat = client.payment_status === 'incasati'
    ? 0
    : displayAmountDueForPayment(client.price, client.predefined_price, baniIncasat, client.advance_amount);
  const currency = client.currency_code || 'RON';
  const amountDueLabel = 'Rest de plata';
  const incasatEfectiv = totalDupaReducere;
  const profilePct = client.profiles ? client.profiles.percentage / 100 : 0;
  const baniProfil = incasatEfectiv * profilePct;
  const expenses =
    (client.manopera_colaboratori || 0)
    + (client.valoare_piese || 0)
    + (client.alte_cheltuieli || 0);
  const baniGtrots = incasatEfectiv * (1 - profilePct) - expenses;
  const collaboratorCosts = (client.collaborator_costs || []).filter((item) => item.cost > 0);
  const fmtProfileBadge = (value: number) =>
    `${(Math.round(value * 10) / 10).toFixed(1).padStart(4, '0')} ${currency.toLowerCase()}`;
  const createdDate = formatCreatedDate(client.created_at);
  const toggleExpanded = useCallback(() => {
    runClientCardLayoutAnimation();
    setExpanded((value) => !value);
  }, []);
  useEffect(() => {
    expandProgress.value = withTiming(expanded ? 1 : 0, { duration: 220 });
  }, [expanded, expandProgress]);
  useEffect(() => {
    setExpanded(false);
    expandProgress.value = 0;
  }, [client.id, expandProgress]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${expandProgress.value * 180}deg` }],
  }));

  const renderDeleteAction = () => (
    <View style={[styles.swipeAction, styles.deleteAction]}>
      <Trash2 size={24} color={Colors.white} />
      <Text style={styles.swipeActionText}>Sterge</Text>
    </View>
  );

  const renderWhatsAppAction = () => (
    <View style={[styles.swipeAction, styles.whatsAppAction]}>
      <MessageCircle size={24} color={Colors.white} />
      <Text style={styles.swipeActionText}>WhatsApp</Text>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={1.8}
      leftThreshold={68}
      rightThreshold={68}
      overshootLeft={false}
      overshootRight={false}
      renderLeftActions={canDelete ? renderDeleteAction : undefined}
      renderRightActions={onWhatsApp ? renderWhatsAppAction : undefined}
      onSwipeableOpen={(direction) => {
        swipeRef.current?.close();
        if (direction === SwipeDirection.LEFT && onWhatsApp) onWhatsApp(client);
        if (direction === SwipeDirection.RIGHT && canDelete) onDelete?.(client);
      }}
      containerStyle={styles.swipeContainer}>
    <View
      style={[
        styles.card,
        {
          borderColor: `${cardAccentColor}${client.is_finalized ? '99' : '88'}`,
          shadowColor: cardAccentColor,
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.summaryButton}
          onPress={toggleExpanded}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Restrange detaliile clientului' : 'Extinde detaliile clientului'}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{client.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={1}>{client.name}</Text>
            <View style={styles.row}>
              <Phone size={12} color={Colors.textMuted} />
              <Text style={styles.sub} numberOfLines={1}>{client.phone}</Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerIconButton, expanded && styles.headerIconButtonActive]}
          onPress={toggleExpanded}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Restrange detaliile clientului' : 'Extinde detaliile clientului'}>
          <Animated.View style={chevronAnimatedStyle}>
            <ChevronDown size={21} color={expanded ? Colors.orange : Colors.textSecondary} />
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerIconButton}
          onPress={() => onPress(client.id)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`Deschide clientul ${client.name}`}>
          <ChevronRight size={21} color={Colors.orange} />
        </TouchableOpacity>
      </View>

      {expanded ? (
        <View style={styles.expandedContent}>
          {createdDate ? (
            <View style={styles.metaRow}>
              <CalendarClock size={12} color={Colors.orange} />
              <Text style={styles.createdAt}>{createdDate}</Text>
            </View>
          ) : null}

          {/* Status + profile badge */}
          <View style={styles.footer}>
            {client.qr_used && (
              <View style={styles.qrUsedStatusBadge}>
                <CheckCircle size={11} color={Colors.success} />
                <Text style={styles.qrUsedStatusText}>QR folosit</Text>
              </View>
            )}

        {client.is_finalized && (
          <View style={styles.finalizedBadge}>
            <CheckCircle size={11} color={Colors.white} />
            <Text style={styles.finalizedText}>Finalizat</Text>
          </View>
        )}

        {client.status !== 'cod_folosit' && client.status !== 'va_folosi_codul' && (
          <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {StatusLabels[client.status]}
            </Text>
          </View>
        )}

        {client.discount_percentage > 0 && (
          <View style={styles.discountBadge}>
            <Percent size={11} color={Colors.success} />
            <Text style={styles.discountText}>{client.discount_percentage}%</Text>
          </View>
        )}

        {client.profiles && (
          <View style={[styles.profileBadge, { backgroundColor: client.profiles.color + '22' }]}>
            <Text style={[styles.profileText, { color: client.profiles.color }]}>
              {client.profiles.name} <Text style={styles.profileAmount}>{fmtProfileBadge(baniProfil)}</Text>
            </Text>
          </View>
        )}
      </View>

      {/* Price breakdown */}
      <View style={styles.priceRow}>
        <PriceItem label="Pret total" value={`${fmt(totalDupaReducere)} ${currency}`} color={Colors.textSecondary} />
        <View style={styles.priceDivider} />
        <PriceItem label={amountDueLabel} value={`${fmt(baniIncasatAfisat)} ${currency}`} color={Colors.orange} highlight />
        <View style={styles.priceDivider} />
        <PriceItem label="G-Trots" value={`${fmt(baniGtrots)} ${currency}`} color={Colors.success} />
      </View>

      {collaboratorCosts.length > 0 && (
        <View style={styles.collaboratorGrid}>
          {collaboratorCosts.map((item) => (
            <View key={item.id} style={styles.collaboratorItem}>
              <View style={styles.collaboratorLabelRow}>
                <View style={[styles.collaboratorDot, { backgroundColor: item.collaborator_color }]} />
                <Text style={styles.collaboratorLabel} numberOfLines={1}>
                  {item.collaborator_name}
                </Text>
              </View>
              <Text style={[styles.collaboratorValue, { color: item.collaborator_color }]}>
                {fmt(item.cost)} {currency}
              </Text>
              <Text style={[
                styles.collaboratorPaymentState,
                { color: item.payment_status === 'incasati' ? Colors.success : Colors.warning },
              ]}>
                {item.payment_status === 'incasati' ? 'Achitat' : 'Neachitat'}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* QR code row */}
      {client.qr_code ? (
        <View style={[styles.qrRow, { borderTopColor: client.qr_used ? Colors.orange + '33' : Colors.success + '33' }]}>
          <Tag size={11} color={client.qr_used ? Colors.orange : Colors.success} />
          <Text
            style={[styles.qrText, { color: client.qr_used ? Colors.orange : Colors.success }]}
            numberOfLines={1}>
            {client.qr_code}
          </Text>
          {client.qr_used ? (
            <Text style={styles.qrUsedLabel}>Cod QR Utilizat</Text>
          ) : (
            <Text style={styles.qrGeneratedLabel}>QR Generat</Text>
          )}
        </View>
      ) : null}
        </View>
      ) : null}
    </View>
    </ReanimatedSwipeable>
  );
}

export default React.memo(ClientCard);

function formatCreatedDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ro-RO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function PriceItem({ label, value, color, highlight }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <View style={styles.priceItem}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.priceValue, { color }, highlight && styles.priceValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 0,
    borderWidth: 1,
  },
  swipeContainer: {
    borderRadius: 14,
    marginBottom: 10,
  },
  swipeAction: {
    width: 104,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  deleteAction: { backgroundColor: '#DC2626' },
  whatsAppAction: { backgroundColor: '#16A34A' },
  swipeActionText: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  cardQrUnused: {
    borderColor: Colors.success + '88',
    shadowColor: Colors.success,
    shadowOpacity: 0.13,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  cardQrUsed: {
    borderColor: Colors.orange + '99',
    shadowColor: Colors.orange,
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  summaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.orangeDim,
    borderWidth: 1.5,
    borderColor: Colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: Colors.orange,
    fontSize: 17,
    fontFamily: 'Inter-Bold',
  },
  info: { flex: 1 },
  name: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    marginBottom: 3,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sub: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    flexShrink: 1,
  },
  createdAt: {
    color: Colors.orange,
    fontSize: 11,
    fontFamily: 'Inter-Medium',
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButtonActive: {
    borderColor: Colors.orange + '88',
    backgroundColor: Colors.orangeDim,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  expandedContent: {
    overflow: 'hidden',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 10,
    marginBottom: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  discountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.successDim,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 20,
  },
  discountText: { color: Colors.success, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  finalizedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.orange,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 20,
  },
  finalizedText: { color: Colors.white, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  qrUsedStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successDim,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 20,
  },
  qrUsedStatusText: { color: Colors.success, fontSize: 11, fontFamily: 'Inter-SemiBold' },
  profileBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 'auto',
    maxWidth: '100%',
  },
  profileText: { fontSize: 11, fontFamily: 'Inter-Medium' },
  profileAmount: { fontFamily: 'Inter-Bold' },
  priceRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  priceItem: { flex: 1, alignItems: 'center' },
  priceLabel: {
    fontSize: 10,
    color: Colors.textMuted,
    fontFamily: 'Inter-Regular',
    marginBottom: 3,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  priceValue: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  priceValueHighlight: {
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
  priceDivider: {
    width: 1,
    backgroundColor: Colors.cardBorder,
    marginVertical: 2,
  },
  collaboratorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  collaboratorItem: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 92,
    backgroundColor: Colors.card,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  collaboratorLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 4,
  },
  collaboratorDot: { width: 6, height: 6, borderRadius: 3 },
  collaboratorLabel: {
    color: Colors.textMuted,
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  collaboratorValue: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
  },  collaboratorPaymentState: {
    marginTop: 3,
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  qrRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  qrText: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  qrUsedLabel: {
    color: Colors.orange,
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    backgroundColor: Colors.orangeDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  qrGeneratedLabel: {
    color: Colors.success,
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    backgroundColor: Colors.successDim,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
});
