import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider } from '@/contexts/AuthContext';
import MobileLoginGate from '@/components/MobileLoginGate';
import PushNotificationsManager from '@/components/PushNotificationsManager';
import MobileUpdateStartupNotifier from '@/components/MobileUpdateStartupNotifier';
import OtaUpdateManager from '@/components/OtaUpdateManager';
import AppStartupLoader from '@/components/AppStartupLoader';
import { AppModuleProvider, useAppModule } from '@/contexts/AppModuleContext';
import ModuleSelectionScreen from '@/components/ModuleSelectionScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  useFrameworkReady();
  const startupStartedAt = useRef(Date.now());
  const [appMounted, setAppMounted] = useState(false);
  const [showStartupLoader, setShowStartupLoader] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (!fontsLoaded && !fontError) return;

    const elapsed = Date.now() - startupStartedAt.current;
    const delay = Math.max(60 - elapsed, 0);
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const mountTimer = setTimeout(() => {
      setAppMounted(true);
      hideTimer = setTimeout(() => setShowStartupLoader(false), 20);
    }, delay);

    return () => {
      clearTimeout(mountTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [fontsLoaded, fontError]);

  return (
    <GestureHandlerRootView style={styles.root}>
      {appMounted ? (
        <AuthProvider>
          <MobileLoginGate>
            <AppModuleProvider>
              <ModuleAwareApp />
            </AppModuleProvider>
          </MobileLoginGate>
        </AuthProvider>
      ) : null}
      {showStartupLoader ? <AppStartupLoader overlay={appMounted} /> : null}
    </GestureHandlerRootView>
  );
}

function ModuleAwareApp() {
  const { activeModule, initializing } = useAppModule();

  if (initializing || !activeModule) return <ModuleSelectionScreen />;

  return (
    <>
      <PushNotificationsManager />
      <MobileUpdateStartupNotifier />
      <OtaUpdateManager />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="client/new" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="client/[id]" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="service-sheet/[id]" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080706',
  },
});
