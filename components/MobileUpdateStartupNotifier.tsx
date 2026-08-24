import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { getMobileAppUpdate } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

type GtrotsGlobal = typeof globalThis & {
  __GTROTS_MOBILE_UPDATE_ALERTED_VERSION?: string;
};

const mobileCurrentVersion =
  Constants.expoConfig?.version ||
  (Constants as any).manifest2?.extra?.expoClient?.version ||
  '1.2.4';

export default function MobileUpdateStartupNotifier() {
  const router = useRouter();
  const { user } = useAuth();
  const checkInFlight = useRef(false);
  const lastCheckedAt = useRef(0);

  const checkForUpdate = useCallback(async () => {
    if (!user || checkInFlight.current) return;
    const now = Date.now();
    if (now - lastCheckedAt.current < 60000) return;

    checkInFlight.current = true;
    lastCheckedAt.current = now;
    try {
      const info = await getMobileAppUpdate(mobileCurrentVersion);
      if (!info.update_available || !info.available_version) return;

      const g = globalThis as GtrotsGlobal;
      if (g.__GTROTS_MOBILE_UPDATE_ALERTED_VERSION === info.available_version) return;
      g.__GTROTS_MOBILE_UPDATE_ALERTED_VERSION = info.available_version;

      Alert.alert(
        'Actualizare disponibila',
        `Exista versiunea ${info.available_version} pentru G-Trots. O poti descarca din Setari.`,
        [
          { text: 'Mai tarziu', style: 'cancel' },
          {
            text: 'Vezi actualizarea',
            onPress: () => router.push('/(tabs)/settings'),
          },
        ]
      );
    } catch {
      // Verificarea este discreta la pornire; erorile raman vizibile in Setari la verificarea manuala.
    } finally {
      checkInFlight.current = false;
    }
  }, [router, user]);

  useEffect(() => {
    if (!user) return undefined;
    const timer = setTimeout(checkForUpdate, 1200);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkForUpdate();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [checkForUpdate, user]);

  return null;
}
