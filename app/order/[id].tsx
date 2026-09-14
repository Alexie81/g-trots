import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAppModule } from '@/contexts/AppModuleContext';

export default function OpenShopOrderRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const { openShopOrder } = useAppModule();

  useEffect(() => {
    const orderId = Array.isArray(id) ? id[0] : id;
    if (orderId) openShopOrder(orderId);
    router.replace('/');
  }, [id, openShopOrder]);

  return <View style={styles.container}><ActivityIndicator color={Colors.orange} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080706' },
});
