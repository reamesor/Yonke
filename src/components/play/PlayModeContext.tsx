"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PlayMode = "demo" | "devnet";

type PlayModeContextValue = {
  mode: PlayMode | null;
  chose: boolean;
  ready: boolean;
  setMode: (mode: PlayMode) => void;
  reset: () => void;
};

const PlayModeContext = createContext<PlayModeContextValue | null>(null);

const KEY = "yonke:play-mode";

export function PlayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PlayMode | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "demo" || stored === "devnet") setModeState(stored);
    setReady(true);
  }, []);

  const setMode = useCallback((next: PlayMode) => {
    setModeState(next);
    window.localStorage.setItem(KEY, next);
  }, []);

  const reset = useCallback(() => {
    setModeState(null);
    window.localStorage.removeItem(KEY);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      chose: mode !== null,
      ready,
      setMode,
      reset,
    }),
    [mode, ready, setMode, reset],
  );

  return (
    <PlayModeContext.Provider value={value}>{children}</PlayModeContext.Provider>
  );
}

export function usePlayMode() {
  const ctx = useContext(PlayModeContext);
  if (!ctx) throw new Error("usePlayMode must be used within PlayModeProvider");
  return ctx;
}
