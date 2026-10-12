'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

type FabContextValue = {
  fabAction: (() => void) | null;
  registerFabAction: (fn: () => void) => void;
  clearFabAction: () => void;
};

const FabContext = createContext<FabContextValue | null>(null);

export function FabProvider({ children }: { children: ReactNode }) {
  const [fabAction, setFabAction] = useState<(() => void) | null>(null);

  const registerFabAction = useCallback((fn: () => void) => {
    setFabAction(() => fn);
  }, []);

  const clearFabAction = useCallback(() => {
    setFabAction(null);
  }, []);

  return (
    <FabContext.Provider value={{ fabAction, registerFabAction, clearFabAction }}>
      {children}
    </FabContext.Provider>
  );
}

export function useFabContext() {
  const ctx = useContext(FabContext);
  if (!ctx) throw new Error('useFabContext must be used within FabProvider');
  return ctx;
}
