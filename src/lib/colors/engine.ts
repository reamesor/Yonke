/**
 * Monke Colors palette + PER_COLOR settlement.
 * Internal SOL math is lamport-integer (see engineLamports.ts).
 */

import {
  houseCutLamports,
  lamportsToSol,
  solToLamports,
  splitCutLamports,
} from "@/lib/solana/lamports";
import {
  perColorLinesLamports,
  settleRollLamports,
} from "./engineLamports";

export const COLOR_KEYS = [
  "yellow",
  "orange",
  "pink",
  "blue",
  "green",
  "red",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const COLOR_LABEL: Record<ColorKey, string> = {
  yellow: "YEL",
  orange: "ORG",
  pink: "PNK",
  blue: "BLU",
  green: "GRN",
  red: "RED",
};

/** Dusty pastels on eggshell paper — not neon, not CRT. */
export const COLOR_HEX: Record<ColorKey, string> = {
  yellow: "#e8c97a",
  orange: "#e4a078",
  pink: "#e4a8bc",
  blue: "#9bb8d4",
  green: "#b4d4a4",
  red: "#d4786a",
};

export const COLOR_INK: Record<ColorKey, string> = {
  yellow: "#6b5420",
  orange: "#6b3a1c",
  pink: "#6b3044",
  blue: "#2c4460",
  green: "#2c4a28",
  red: "#5c241c",
};

/**
 * Documented house edge (5%). Taken from **bet cost every round** — win or
 * lose. Wins still pay the full 2× / 4× / 6× gross ladder; the cut is separate.
 */
export const HOUSE_EDGE = 0.05;

/**
 * Each matching die pays 2× the bet base:
 *   1 match → return bet × 2
 *   2 matches → bet × 4
 *   3 matches → bet × 6
 * Monke separately takes 5% of bet cost every round for the treasury.
 */
export const MATCH_PAYOUT = 2;

/** Gross return multiplier by match count. */
export const SINGLE_RETURN_BY_MATCH: Record<1 | 2 | 3, number> = {
  1: MATCH_PAYOUT * 1,
  2: MATCH_PAYOUT * 2,
  3: MATCH_PAYOUT * 3,
};

/** @deprecated Alias — gross return factor (2 / 4 / 6). */
export const SINGLE_ODDS_BY_MATCH = SINGLE_RETURN_BY_MATCH;

/** Gross return multiplier for a match count (0 → 0). */
export function payoutMultiplier(matches: number): number {
  if (matches === 1 || matches === 2 || matches === 3) {
    return SINGLE_RETURN_BY_MATCH[matches];
  }
  return 0;
}

/** Treasury split of every house cut. */
export const CUT_BURN = 0.4;
export const CUT_BELIEVERS = 0.4;
export const CUT_BUILD = 0.2;

/**
 * LITERAL = multipliers on unit bet (total match count across picks).
 * STAKE_BASED = multipliers on total stake (bet × colors).
 * PER_COLOR = each picked color settled alone vs its own dice hits.
 *
 * Product default is PER_COLOR.
 */
export type PayoutMode = "LITERAL" | "STAKE_BASED" | "PER_COLOR";

export const PAYOUT_MODE: PayoutMode =
  (process.env.NEXT_PUBLIC_PAYOUT_MODE as PayoutMode) || "PER_COLOR";

export type SettleResult = {
  matches: number;
  /** Amount returned to the player (full 2× ladder; cut is separate). */
  winnings: number;
  stake: number;
  /** 5% of bet cost — every round, win or lose. */
  houseCut: number;
  net: number;
};

export type ColorResultLine = {
  color: ColorKey;
  cost: number;
  matches: number;
  winnings: number;
};

/** Gross / returned amount for match count (full ladder, no cut baked in). */
export function matchWinnings(base: number, matches: number): number {
  return lamportsToSol(
    Math.floor(solToLamports(base) * payoutMultiplier(matches)),
  );
}

/** @deprecated Alias — returned amount equals gross ladder (cut is on stake). */
export function netMatchWinnings(base: number, matches: number): number {
  return matchWinnings(base, matches);
}

/**
 * Settle a roll. Internal math is lamport-integer; SOL floats are display I/O.
 * House cut = 5% of bet cost every round (win or lose); wins pay full ladder.
 */
export function settleRoll(
  bet: number,
  picked: Set<ColorKey> | ColorKey[],
  dice: ColorKey[],
  mode: PayoutMode = PAYOUT_MODE,
): SettleResult {
  const r = settleRollLamports(solToLamports(bet), picked, dice, mode);
  return {
    matches: r.matches,
    winnings: lamportsToSol(r.winningsLamports),
    stake: lamportsToSol(r.stakeLamports),
    houseCut: lamportsToSol(r.houseCutLamports),
    net: lamportsToSol(r.netLamports),
  };
}

export function perColorLines(
  bet: number,
  picked: Set<ColorKey> | ColorKey[],
  dice: ColorKey[],
): ColorResultLine[] {
  return perColorLinesLamports(solToLamports(bet), picked, dice).map((line) => ({
    color: line.color,
    cost: lamportsToSol(line.costLamports),
    matches: line.hits,
    winnings: lamportsToSol(line.winningsLamports),
  }));
}

/** Split house cut 40/40/20 — exact in lamports, no dust loss. */
export function splitCut(houseCut: number) {
  const parts = splitCutLamports(solToLamports(houseCut));
  return {
    burn: lamportsToSol(parts.burn),
    believers: lamportsToSol(parts.believers),
    build: lamportsToSol(parts.build),
  };
}

/** Compact money for gamblers: trim trailing zeros, keep enough precision. */
export function formatSol(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const fixed = n.toFixed(4);
  const trimmed = fixed.replace(/\.?0+$/, "");
  if (!trimmed.includes(".")) return `${trimmed}.00`;
  const [, dec = ""] = trimmed.split(".");
  if (dec.length < 2) return n.toFixed(2);
  return trimmed;
}

export function roundSol(n: number): number {
  return lamportsToSol(solToLamports(n));
}

/** @internal re-export for tests / callers that want raw cut math */
export { houseCutLamports, splitCutLamports };
