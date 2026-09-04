import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const APP_MODULE_STORAGE_KEY = 'gtrots.activeModule.v1';

export type AppModule = 'service' | 'shop';

type AppModuleContextValue = {
  activeModule: AppModule | null;
  initializing: boolean;
  selectModule: (module: AppModule) => void;
};

const AppModuleContext = createContext<AppModuleContextValue | null>(null);

function isAppModule(value: string | null): value is AppModule {
  return value === 'service' || value === 'shop';
}

export function AppModuleProvider({ children }: { children: React.ReactNode }) {
  const [activeModule, setActiveModule] = useState<AppModule | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(APP_MODULE_STORAGE_KEY)
      .then((storedModule) => {
        if (active && isAppModule(storedModule)) setActiveModule(storedModule);
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

  const value = useMemo(
    () => ({ activeModule, initializing, selectModule }),
    [activeModule, initializing, selectModule]
  );

  return <AppModuleContext.Provider value={value}>{children}</AppModuleContext.Provider>;
}

export function useAppModule() {
  const value = useContext(AppModuleContext);
  if (!value) throw new Error('useAppModule must be used inside AppModuleProvider');
  return value;
}
