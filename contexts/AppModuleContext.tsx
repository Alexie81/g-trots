import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';

const APP_MODULE_STORAGE_KEY = 'gtrots.activeModule.v1';

export type AppModule = 'service' | 'shop';

type AppModuleContextValue = {
  activeModule: AppModule | null;
  initializing: boolean;
  selectModule: (module: AppModule) => void;
  pendingShopOrderId: string | null;
  openShopOrder: (orderId: string) => void;
  consumePendingShopOrder: () => void;
};

const AppModuleContext = createContext<AppModuleContextValue | null>(null);

function isAppModule(value: string | null): value is AppModule {
  return value === 'service' || value === 'shop';
}

function orderIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^gtrots:\/\/(?:order|orders)\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[/?#]|$)/i);
  return match?.[1]?.toLowerCase() || null;
}

export function AppModuleProvider({ children }: { children: React.ReactNode }) {
  const [activeModule, setActiveModule] = useState<AppModule | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [pendingShopOrderId, setPendingShopOrderId] = useState<string | null>(null);
  const deepLinkRequestedRef = useRef(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(APP_MODULE_STORAGE_KEY)
      .then((storedModule) => {
        if (active && !deepLinkRequestedRef.current && isAppModule(storedModule)) setActiveModule(storedModule);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setInitializing(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectModule = useCallback((module: AppModule) => {
    setActiveModule(module);
    void SecureStore.setItemAsync(APP_MODULE_STORAGE_KEY, module).catch(() => {});
  }, []);

  const openShopOrder = useCallback((orderId: string) => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return;
    deepLinkRequestedRef.current = true;
    setPendingShopOrderId(orderId.toLowerCase());
    setActiveModule('shop');
    void SecureStore.setItemAsync(APP_MODULE_STORAGE_KEY, 'shop').catch(() => {});
  }, []);

  const consumePendingShopOrder = useCallback(() => setPendingShopOrderId(null), []);

  useEffect(() => {
    const receive = (url: string | null | undefined) => {
      const orderId = orderIdFromUrl(url);
      if (orderId) openShopOrder(orderId);
    };
    void Linking.getInitialURL().then(receive).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => receive(url));
    return () => subscription.remove();
  }, [openShopOrder]);

  const value = useMemo(
    () => ({ activeModule, initializing, selectModule, pendingShopOrderId, openShopOrder, consumePendingShopOrder }),
    [activeModule, consumePendingShopOrder, initializing, openShopOrder, pendingShopOrderId, selectModule]
  );

  return <AppModuleContext.Provider value={value}>{children}</AppModuleContext.Provider>;
}

export function useAppModule() {
  const value = useContext(AppModuleContext);
  if (!value) throw new Error('useAppModule must be used inside AppModuleProvider');
  return value;
}
