import { useEffect } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { Colors } from '@/constants/colors';
import { AppAuroraGlows, appAuroraStyles } from '@/components/AppAuroraBackground';

const appLogo = require('../assets/images/logo.png');

type AppStartupLoaderProps = {
  subtitle?: string;
  overlay?: boolean;
};

export default function AppStartupLoader({
  subtitle = 'Se pregateste aplicatia mobila...',
  overlay = false,
}: AppStartupLoaderProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 950, easing: Easing.linear }),
      -1,
      false
    );
  }, [rotation]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(360)}
      style={[appAuroraStyles.screen, styles.screen, overlay && styles.overlay]}>
      <StatusBar style="light" backgroundColor={Colors.bg} />
      <AppAuroraGlows />
      <Animated.View
        entering={ZoomIn.duration(420).springify().damping(18).stiffness(135)}
        exiting={FadeOut.duration(220)}
        style={styles.card}>
        <View style={styles.spinner}>
          <Animated.View style={[styles.spinnerRing, spinnerStyle]} />
          <Image source={appLogo} style={styles.logo} />
        </View>
        <Text style={styles.title}>G-Trots</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    minHeight: 250,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.045)',
    boxShadow: '0 30px 70px rgba(0,0,0,0.45)',
  },
  spinner: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  spinnerRing: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.08)',
    borderTopColor: Colors.orange,
    borderRightColor: Colors.orangeLight,
  },
  logo: {
    width: 66,
    height: 66,
    borderRadius: 24,
  },
  title: {
    color: '#F7F3EF',
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: '#A7A09A',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
});
