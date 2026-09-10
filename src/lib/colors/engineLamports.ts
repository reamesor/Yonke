/**
 * PER_COLOR Colors settlement in lamports (integers).
 * returned = unitBet × 2 × hits(color) per pick; houseCut = stake × 5% every roll.
 */

import { houseCutLamports, splitCutLamports } from "@/lib/solana/lamports";

export type ColorKeyLamports =
  | "yellow"
  | "orange"
  | "pink"
  | "blue"
  | "green"
  | "red";

export type PayoutModeLamports = "LITERAL" | "STAKE_BASED" | "PER_COLOR";

/** Classic Colors: 2× per matching die. */
export const MATCH_PAYOUT_LAMPORTS = 2;

export type SettleResultLamports = {
  matches: number;
  /** Gross return to player (full 2×/4×/6× ladder). */
  winningsLamports: number;
  stakeLamports: number;
  /** 5% of stake — every round, win or lose. */
  houseCutLamports: number;
  netLamports: number;
};

export type ColorLineLamports = {
  color: ColorKeyLamports;
  costLamports: number;
  hits: number;
  winningsLamports: number;
};

/** Gross return for match count: unitBet × 2 × matches. */
export function matchWinningsLamports(
  unitBetLamports: number,
  matches: number,
): number {
  if (matches <= 0) return 0;
  return Math.floor(unitBetLamports) * MATCH_PAYOUT_LAMPORTS * matches;
}

export function perColorLinesLamports(
  unitBetLamports: number,
  picked: Set<ColorKeyLamports> | ColorKeyLamports[],
  dice: ColorKeyLamports[],
): ColorLineLamports[] {
  const unit = Math.max(0, Math.floor(unitBetLamports));
  const pickedSet = picked instanceof Set ? picked : new Set(picked);
  return [...pickedSet].map((color) => {
    const hits = dice.filter((d) => d === color).length;
    return {
      color,
      costLamports: unit,
      hits,
      winningsLamports: matchWinningsLamports(unit, hits),
    };
  });
}

export function settleRollLamports(
  unitBetLamports: number,
  picked: Set<ColorKeyLamports> | ColorKeyLamports[],
  dice: ColorKeyLamports[],
  mode: PayoutModeLamports = "PER_COLOR",
): SettleResultLamports {
  const unit = Math.max(0, Math.floor(unitBetLamports));
  const pickedSet = picked instanceof Set ? picked : new Set(picked);
  const stakeLamports = unit * pickedSet.size;

  let winningsLamports = 0;
  let matches = 0;

  if (mode === "PER_COLOR") {
    for (const color of pickedSet) {
      const hits = dice.filter((d) => d === color).length;
      matches = Math.max(matches, hits);
      winningsLamports += matchWinningsLamports(unit, hits);
    }
  } else {
    matches = dice.filter((d) => pickedSet.has(d)).length;
    if (mode === "LITERAL") {
      winningsLamports = matchWinningsLamports(unit, matches);
    } else {
      winningsLamports = matchWinningsLamports(stakeLamports, matches);
    }
  }

  const cut = houseCutLamports(stakeLamports);
  return {
    matches,
    winningsLamports,
    stakeLamports,
    houseCutLamports: cut,
    netLamports: winningsLamports - stakeLamports,
  };
}

export { splitCutLamports, houseCutLamports };
