import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShoppingBag, X } from 'lucide-react-native';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useAppModule } from '@/contexts/AppModuleContext';
import { shopApi } from '@/services/shopApi';

const SHOP_NOTIFICATION_CHECK_INTERVAL = 30000;

export default function ServiceShopNotificationsModal() {
  const { token } = useAuth();
  const { activeModule, selectModule } = useAppModule();
  const [visible, setVisible] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const acknowledgedUnread = useRef(0);
  const checking = useRef(false);
  const pulse = useSharedValue(0);

  const checkNotifications = useCallback(async () => {
    if (!token || activeModule !== 'service' || checking.current) return;
    checking.current = true;
    try {
      const nextUnread = (await shopApi.getShopNotificationSummary(token)).unread_count;
      setUnreadCount(nextUnread);
      if (nextUnread === 0) {
        acknowledgedUnread.current = 0;
      } else if (nextUnread > acknowledgedUnread.current) {
        setVisible(true);
      }
    } catch {
      // Lipsa temporara a conexiunii nu trebuie sa intrerupa lucrul in Service.
    } finally {
      checking.current = false;
    }
  }, [activeModule, token]);

  useEffect(() => {
    if (activeModule !== 'service') return;
    const initialCheck = setTimeout(() => void checkNotifications(), 0);
    const timer = setInterval(() => void checkNotifications(), SHOP_NOTIFICATION_CHECK_INTERVAL);
    return () => {
      clearTimeout(initialCheck);
      clearInterval(timer);
    };
  }, [activeModule, checkNotifications]);

  useEffect(() => {
    if (!visible) {
      cancelAnimation(pulse);
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 260 }),
        withTiming(0, { duration: 520 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(pulse);
  }, [pulse, visible]);

  const iconMotion = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [1, 1.12]) },
      { rotateZ: `${interpolate(pulse.value, [0, 1], [-4, 4])}deg` },
    ],
  }));

  const acknowledge = useCallback(() => {
    acknowledgedUnread.current = unreadCount;
    setVisible(false);
  }, [unreadCount]);

  const openShop = useCallback(() => {
    acknowledgedUnread.current = unreadCount;
    setVisible(false);
    selectModule('shop');
  }, [selectModule, unreadCount]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={acknowledge}>
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <TouchableOpacity style={styles.close} onPress={acknowledge} accessibilityLabel="Inchide notificarea">
            <X size={18} color={Colors.textSecondary} />
          </TouchableOpacity>

          <Animated.View style={[styles.iconWrap, iconMotion]}>
            <ShoppingBag size={29} color="#FFFFFF" strokeWidth={2.2} />
            <View style={styles.alertBadge}><Text style={styles.alertBadgeText}>!</Text></View>
          </Animated.View>

          <Text style={styles.kicker}>G-TROTS SHOP</Text>
          <Text style={styles.title}>Ai notificări noi în magazinul tău</Text>
          <Text style={styles.description}>
            {unreadCount === 1
              ? 'Ai o notificare necitită care așteaptă atenția ta.'
              : `Ai ${unreadCount} notificări necitite care așteaptă atenția ta.`}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.primaryButton} onPress={openShop} activeOpacity={0.8}>
              <ShoppingBag size={17} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Deschide SHOP</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={acknowledge} activeOpacity={0.8}>
              <Text style={styles.secondaryButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22, backgroundColor: '#050405D9' },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', borderWidth: 1, borderColor: '#FF8A0055', borderRadius: 28, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 22, backgroundColor: '#1B1817', shadowColor: '#000000', shadowOpacity: 0.5, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 18 },
  close: { position: 'absolute', top: 13, right: 13, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#FFFFFF0A' },
  iconWrap: { width: 70, height: 70, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FF9A4D88', borderRadius: 23, backgroundColor: '#FF791F', shadowColor: '#FF6B00', shadowOpacity: 0.38, shadowRadius: 15, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  alertBadge: { position: 'absolute', top: -7, right: -7, width: 25, height: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#1B1817', borderRadius: 13, backgroundColor: '#FF3B30' },
  alertBadgeText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14, lineHeight: 17 },
  kicker: { color: '#FF9C52', fontFamily: 'Inter-Bold', fontSize: 9, letterSpacing: 1.4, marginTop: 19 },
  title: { maxWidth: 310, color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 21, lineHeight: 27, textAlign: 'center', marginTop: 7 },
  description: { maxWidth: 310, color: Colors.textSecondary, fontFamily: 'Inter-Regular', fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 8 },
  actions: { width: '100%', flexDirection: 'row', gap: 10, marginTop: 23 },
  primaryButton: { flex: 1.8, minHeight: 49, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, backgroundColor: '#F97316' },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 11 },
  secondaryButton: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFFFFF20', borderRadius: 15, backgroundColor: '#FFFFFF08' },
  secondaryButtonText: { color: Colors.textPrimary, fontFamily: 'Inter-Bold', fontSize: 11 },
});
