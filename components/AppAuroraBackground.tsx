import type { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type AppAuroraBackgroundProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

export function AppAuroraGlows() {
  return (
    <>
      <LinearGradient
        colors={['#080706', '#100B07', '#070707']}
        start={{ x: 0.08, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={appAuroraStyles.topGlow} />
      <View style={appAuroraStyles.centerGlow} />
      <View style={appAuroraStyles.leftRibbon} />
      <View style={appAuroraStyles.bottomGlow} />
      <View style={appAuroraStyles.softVignette} />
    </>
  );
}

export default function AppAuroraBackground({
  children,
  style,
  contentStyle,
}: AppAuroraBackgroundProps) {
  return (
    <View style={[appAuroraStyles.screen, style]}>
      <AppAuroraGlows />
      <View style={[appAuroraStyles.content, contentStyle]}>{children}</View>
    </View>
  );
}

export const appAuroraStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#080706',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
  },
  topGlow: {
    position: 'absolute',
    top: -105,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(255,107,0,0.22)',
  },
  centerGlow: {
    position: 'absolute',
    top: '28%',
    right: -135,
    width: 315,
    height: 315,
    borderRadius: 158,
    backgroundColor: 'rgba(255,107,0,0.105)',
  },
  leftRibbon: {
    position: 'absolute',
    left: -125,
    top: '44%',
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(255,140,56,0.055)',
  },
  bottomGlow: {
    position: 'absolute',
    right: -110,
    bottom: -120,
    width: 310,
    height: 310,
    borderRadius: 155,
    backgroundColor: 'rgba(255,154,61,0.10)',
  },
  softVignette: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
});
