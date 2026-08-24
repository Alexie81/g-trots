import { Tabs } from 'expo-router';
import { Users, BarChart3, Settings, ScanLine, FileText } from 'lucide-react-native';
import { Colors } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useAppModule } from '@/contexts/AppModuleContext';
import ShopModuleScreen from '@/components/ShopModuleScreen';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { activeModule } = useAppModule();
  const isRestrictedUser = user?.role === 'user';
  const canViewClientPanel = user?.role !== 'user' || Boolean(user?.client_panel_access);
  const canViewServiceSheets = user?.role !== 'user' || user?.service_sheet_access !== false;

  if (activeModule === 'shop') return <ShopModuleScreen />;

  return (
    <Tabs
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
  );
}
