import { useEffect } from 'react';
import { BackHandler, Platform } from 'react-native';

export default function useAndroidSearchBack(value: string, clear: () => void) {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!value.trim()) return false;
      clear();
      return true;
    });
    return () => subscription.remove();
  }, [clear, value]);
}
