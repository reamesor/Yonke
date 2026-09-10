"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_PLAY_SOL } from "@/lib/features";
import { lamportsToSol, solToLamports } from "@/lib/solana/lamports";

const KEY = "yonke:demo-sol";

function readDemo(): number {
  if (typeof window === "undefined") return DEMO_PLAY_SOL;
  const raw = window.localStorage.getItem(KEY);
  if (raw == null) return DEMO_PLAY_SOL;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEMO_PLAY_SOL;
}

export function useDemoBalance() {
  const [sol, setSol] = useState(DEMO_PLAY_SOL);

  useEffect(() => {
    setSol(readDemo());
  }, []);

  const persist = useCallback((next: number) => {
    const clamped = Math.max(0, next);
    setSol(clamped);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, String(clamped));
    }
  }, []);

  const debit = useCallback(
    (amount: number) => {
      const have = solToLamports(sol);
      const need = solToLamports(amount);
      if (need > have) return { ok: false as const, error: "Insufficient DEMO pot." };
      persist(lamportsToSol(have - need));
      return { ok: true as const };
    },
    [persist, sol],
  );

  const credit = useCallback(
    (amount: number) => {
      if (amount <= 0) return { ok: true as const };
      persist(lamportsToSol(solToLamports(sol) + solToLamports(amount)));
      return { ok: true as const };
    },
    [persist, sol],
  );

  const reset = useCallback(() => persist(DEMO_PLAY_SOL), [persist]);

  return { sol, debit, credit, reset };
}
