import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Updates from 'expo-updates';

const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function OtaUpdateManager() {
  const lastCheckAt = useRef(0);
  const checking = useRef(false);

  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;

    let active = true;
    const checkInBackground = async () => {
      const now = Date.now();
      if (!active || checking.current || now - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
      checking.current = true;
      lastCheckAt.current = now;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (active && update.isAvailable) {
          await Updates.fetchUpdateAsync();
        }
      } catch {
        // Actualizarea OTA este opțională: aplicația continuă normal când dispozitivul este offline.
      } finally {
        checking.current = false;
      }
    };

    const initialTimer = setTimeout(checkInBackground, 2500);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkInBackground();
    });

    return () => {
      active = false;
      clearTimeout(initialTimer);
      subscription.remove();
    };
  }, []);

  return null;
}
