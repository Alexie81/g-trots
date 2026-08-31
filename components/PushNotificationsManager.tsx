import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { registerPushToken } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';

const isExpoGo = Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient';
let notificationHandlerConfigured = false;

export default function PushNotificationsManager() {
  const { token, user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' || isExpoGo || !token || !user?.id) return undefined;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tokenSub: { remove: () => void } | null = null;
    let responseSub: { remove: () => void } | null = null;

    const savePushToken = async (pushToken: string) => {
      if (!active || !pushToken) return;
      await registerPushToken(token, pushToken, Platform.OS);
    };

    const setup = async () => {
      try {
        const Notifications = await import('expo-notifications');
        if (!active) return;

        if (!notificationHandlerConfigured) {
          Notifications.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldShowBanner: true,
              shouldShowList: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
          notificationHandlerConfigured = true;
        }

        if (!tokenSub) {
          tokenSub = Notifications.addPushTokenListener((nextToken) => {
            savePushToken(nextToken.data).catch(() => {});
          });
        }

        if (!responseSub) {
          responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
            const screen = response.notification.request.content.data?.screen;
            if (screen === 'chat') router.push('/');
          });
        }

        if (Platform.OS === 'android') {
          const channel = {
            name: 'Chat',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
            vibrationPattern: [0, 250, 150, 250],
            enableVibrate: true,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          };
          await Notifications.setNotificationChannelAsync('default', channel);
          await Notifications.setNotificationChannelAsync('chat', channel);
        }

        const currentPermission = await Notifications.getPermissionsAsync();
        const finalPermission = currentPermission.granted
          ? currentPermission
          : await Notifications.requestPermissionsAsync();

        if (!finalPermission.granted) return;

        const projectId = Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return;

        const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
        if (!active || !expoToken.data) return;

        await savePushToken(expoToken.data);
      } catch {
        if (active) {
          retryTimer = setTimeout(setup, 60000);
        }
      }
    };

    setup();

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      tokenSub?.remove();
      responseSub?.remove();
    };
  }, [router, token, user?.id]);

  return null;
}
