import { Tabs, usePathname } from 'expo-router';
import { useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { Users, BarChart3, Settings, ScanLine, FileText } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useAppModule } from '@/contexts/AppModuleContext';
import ShopModuleScreen from '@/components/ShopModuleScreen';
import { shopApi } from '@/services/shopApi';
import { getClientsPage, getServiceSheetsPage } from '@/services/api';
import { runWhenIdle } from '@/utils/runWhenIdle';
import ServiceShopNotificationsModal from '@/components/ServiceShopNotificationsModal';

let warmedShopToken = '';
let warmedServiceToken = '';
type ServiceTabName = 'index' | 'service-sheets' | 'scanner' | 'stats' | 'settings';
let lastServiceTab: ServiceTabName = 'index';

function serviceTabFromPath(pathname: string): ServiceTabName | null {
  if (pathname === '/' || pathname === '/index') return 'index';
  if (pathname === '/service-sheets') return 'service-sheets';
  if (pathname === '/scanner') return 'scanner';
  if (pathname === '/stats') return 'stats';
  if (pathname === '/settings') return 'settings';
  return null;
}

function accessibleServiceTab(
  preferred: ServiceTabName,
  canViewClients: boolean,
  canViewSheets: boolean,
  restrictedUser: boolean
): ServiceTabName {
  const allowed = preferred !== 'index' || canViewClients;
  const allowedSheet = preferred !== 'service-sheets' || canViewSheets;
  const allowedStats = preferred !== 'stats' || !restrictedUser;
  if (allowed && allowedSheet && allowedStats) return preferred;
  if (canViewClients) return 'index';
  if (canViewSheets) return 'service-sheets';
  return 'scanner';
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { token, user } = useAuth();
  const { activeModule } = useAppModule();
  const isRestrictedUser = user?.role === 'user';
  const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
  const canViewServiceSheets = user?.role !== 'user' || user?.service_sheet_access !== false;
  const initialServiceTab = accessibleServiceTab(lastServiceTab, canViewClientPanel, canViewServiceSheets, isRestrictedUser);

  useEffect(() => {
    if (!token || activeModule !== 'service' || warmedShopToken === token) return;
    const task = runWhenIdle(() => {
      warmedShopToken = token;
      void shopApi.getDashboardStats(token, { period: '7d', granularity: 'day' }).catch(() => {
        if (warmedShopToken === token) warmedShopToken = '';
      });
    });
    return () => task.cancel();
  }, [activeModule, token]);

  useEffect(() => {
    if (!token || activeModule !== 'shop' || warmedServiceToken === token) return;
    const task = runWhenIdle(() => {
      warmedServiceToken = token;
      void Promise.all([
        SecureStore.getItemAsync('gtrots.clientsPageSize.v1'),
        SecureStore.getItemAsync('gtrots.serviceSheetsPageSize.v1'),
      ]).then(([clientsSizeRaw, serviceSizeRaw]) => {
        const allowedSizes = new Set([10, 15, 25, 50, 100]);
        const clientsSize = allowedSizes.has(Number(clientsSizeRaw)) ? Number(clientsSizeRaw) : 10;
        const serviceSize = allowedSizes.has(Number(serviceSizeRaw)) ? Number(serviceSizeRaw) : 10;
        const requests: Promise<unknown>[] = [];
        if (canViewClientPanel) {
          requests.push(getClientsPage(token, { page: 1, pageSize: clientsSize, sortBy: 'created_at', sortDir: 'desc' }));
        }
        if (canViewServiceSheets) {
          requests.push(getServiceSheetsPage(token, { page: 1, pageSize: serviceSize, sortBy: 'created_at', sortDir: 'desc' }));
        }
        return Promise.allSettled(requests);
      }).then((results) => {
        if (results.length > 0 && results.every((result) => result.status === 'rejected') && warmedServiceToken === token) {
          warmedServiceToken = '';
        }
      }).catch(() => {
        if (warmedServiceToken === token) warmedServiceToken = '';
      });
    });
    return () => task.cancel();
  }, [activeModule, canViewClientPanel, canViewServiceSheets, token]);

  useEffect(() => {
    if (activeModule !== 'service') return;
    const currentTab = serviceTabFromPath(pathname);
    if (currentTab) lastServiceTab = currentTab;
  }, [activeModule, pathname]);

  if (activeModule === 'shop') return <ShopModuleScreen />;

  return (
    <>
    <Tabs
      initialRouteName={initialServiceTab}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: 'transparent',
        },
        tabBarStyle: {
          backgroundColor: 'rgba(20,20,20,0.84)',
          borderTopColor: 'rgba(255,255,255,0.08)',
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarActiveTintColor: Colors.orange,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: 'Inter-Medium',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Clienti',
          href: canViewClientPanel ? undefined : null,
          tabBarIcon: ({ size, color }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="service-sheets"
        options={{
          title: 'Fise',
          href: canViewServiceSheets ? undefined : null,
          tabBarIcon: ({ size, color }) => <FileText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Scanner QR',
          tabBarIcon: ({ size, color }) => <ScanLine size={size} color={color} />,
          tabBarActiveTintColor: Colors.orange,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Statistici',
          href: isRestrictedUser ? null : undefined,
          tabBarIcon: ({ size, color }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Setari',
          tabBarIcon: ({ size, color }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
    <ServiceShopNotificationsModal />
    </>
  );
}
