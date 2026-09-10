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
  mode: PlayMode;
  chose: boolean;
  ready: boolean;
  setMode: (mode: PlayMode) => void;
  reset: () => void;
};

const PlayModeContext = createContext<PlayModeContextValue | null>(null);

const KEY = "yonke:play-mode";

export function PlayModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PlayMode>("demo");
  const [ready, setReady] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored === "demo" || stored === "devnet") setModeState(stored);
    else window.localStorage.setItem(KEY, "demo");
  }, []);

  const setMode = useCallback((next: PlayMode) => {
    setModeState(next);
    window.localStorage.setItem(KEY, next);
  }, []);

  const reset = useCallback(() => {
    setModeState((current) => {
      const next: PlayMode = current === "devnet" ? "demo" : "devnet";
      window.localStorage.setItem(KEY, next);
      return next;
    });
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
