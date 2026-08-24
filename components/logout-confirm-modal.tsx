import { useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeOut, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { LogOut, ShieldCheck, X } from 'lucide-react-native';
import { Colors } from '@/constants/colors';

const appLogo = require('../assets/images/logo.png');

type Props = {
  visible: boolean;
  loading?: boolean;
  userName?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function LogoutConfirmModal({
  visible,
  loading = false,
  userName,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!visible) return;
    Haptics.selectionAsync().catch(() => {});
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}>
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(160)}
        style={styles.overlay}>
        <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFill} />
        <Pressable style={StyleSheet.absoluteFill} onPress={loading ? undefined : onCancel} />

        <Animated.View
          entering={FadeInDown.duration(260).springify().damping(18).stiffness(150)}
          exiting={FadeOut.duration(140)}
          style={styles.card}>
          <LinearGradient
            colors={['rgba(255,107,0,0.26)', 'rgba(255,255,255,0.045)', 'rgba(255,255,255,0.035)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.cardGlow}>
            <View style={styles.topRow}>
              <View style={styles.logoStack}>
                <Image source={appLogo} style={styles.logo} />
                <Animated.View entering={ZoomIn.duration(260).delay(80)} style={styles.statusDot}>
                  <ShieldCheck size={12} color={Colors.orange} />
                </Animated.View>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.74}>
                <X size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.eyebrow}>Sesiune activa</Text>
            <Text style={styles.title}>Te deloghezi?</Text>
            <Text style={styles.message} selectable>
              {userName
                ? `Contul ${userName} va fi scos de pe acest telefon. Poti intra inapoi oricand cu userul tau.`
                : 'Contul va fi scos de pe acest telefon. Poti intra inapoi oricand cu userul tau.'}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onCancel}
                disabled={loading}
                activeOpacity={0.82}>
                <Text style={styles.cancelText}>Raman aici</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, loading && styles.confirmButtonLoading]}
                onPress={onConfirm}
                disabled={loading}
                activeOpacity={0.86}>
                {loading ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <LogOut size={17} color={Colors.white} />
                    <Text style={styles.confirmText}>Delogheaza-ma</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  card: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    boxShadow: '0 28px 70px rgba(0,0,0,0.56)',
  },
  cardGlow: {
    padding: 20,
    backgroundColor: 'rgba(10,10,10,0.74)',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  logoStack: {
    width: 64,
    height: 64,
    justifyContent: 'center',
  },
  logo: {
    width: 58,
    height: 58,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  statusDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#15110D',
    borderWidth: 1,
    borderColor: Colors.orangeMid,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  eyebrow: {
    color: Colors.orange,
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 7,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    letterSpacing: -0.3,
  },
  message: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
    marginTop: 9,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.065)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  cancelText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  confirmButton: {
    flex: 1.18,
    minHeight: 50,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: Colors.orange,
    boxShadow: '0 16px 34px rgba(255,107,0,0.30)',
  },
  confirmButtonLoading: {
    opacity: 0.82,
  },
  confirmText: {
    color: Colors.white,
    fontSize: 13,
    fontFamily: 'Inter-Bold',
  },
});
