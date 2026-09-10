/** Lamport-integer helpers — internal SOL math stays integer; format only for display. */

export const LAMPORTS_PER_SOL = 1_000_000_000;

/** Convert SOL (float display units) → lamports (integer). */
export function solToLamports(sol: number): number {
  if (!Number.isFinite(sol) || sol <= 0) return 0;
  return Math.round(sol * LAMPORTS_PER_SOL);
}

/** Convert lamports → SOL float for display / legacy float APIs. */
export function lamportsToSol(lamports: number): number {
  if (!Number.isFinite(lamports) || lamports === 0) return 0;
  return lamports / LAMPORTS_PER_SOL;
}

/** Format lamports as a compact SOL string for UI. */
export function formatLamportsAsSol(
  lamports: number,
  opts?: { minFrac?: number; maxFrac?: number },
): string {
  const sol = lamportsToSol(lamports);
  const minFrac = opts?.minFrac ?? 2;
  const maxFrac = opts?.maxFrac ?? 9;
  return sol.toLocaleString(undefined, {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  });
}

/**
 * Exact 40/40/20 split in lamports.
 * burn + believers + build === houseCutLamports always (remainder → build).
 */
export function splitCutLamports(houseCutLamports: number): {
  burn: number;
  believers: number;
  build: number;
} {
  const cut = Math.max(0, Math.floor(houseCutLamports));
  const burn = Math.floor((cut * 2) / 5); // 40%
  const believers = Math.floor((cut * 2) / 5); // 40%
  const build = cut - burn - believers; // ≥ 20%, absorbs remainder
  return { burn, believers, build };
}

/** House cut in lamports: exactly 5% of bet cost (floor). */
export function houseCutLamports(betCostLamports: number): number {
  const stake = Math.max(0, Math.floor(betCostLamports));
  return Math.floor((stake * 5) / 100);
}
