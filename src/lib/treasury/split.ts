import { splitCut } from "@/lib/colors/engine";
import {
  lamportsToSol,
  solToLamports,
  splitCutLamports,
} from "@/lib/solana/lamports";

export type TreasuryState = {
  total: number;
  burn: number;
  believers: number;
  build: number;
  /** Play pool that funds wins. Separate from cut meters. */
  pool: number;
};

export const EMPTY_TREASURY: TreasuryState = {
  total: 0,
  burn: 0,
  believers: 0,
  build: 0,
  pool: 0,
};

export function applyHouseCut(
  state: TreasuryState,
  houseCut: number,
): TreasuryState {
  const cutLp = solToLamports(houseCut);
  const parts = splitCutLamports(cutLp);
  return {
    total: lamportsToSol(solToLamports(state.total) + cutLp),
    burn: lamportsToSol(solToLamports(state.burn) + parts.burn),
    believers: lamportsToSol(solToLamports(state.believers) + parts.believers),
    build: lamportsToSol(solToLamports(state.build) + parts.build),
    pool: state.pool,
  };
}

/** Bets fund the pool. Wins leave the pool. House keeps only the 5% cut. */
export function applyPoolRound(
  state: TreasuryState,
  stake: number,
  winnings: number,
  houseCut: number,
): TreasuryState {
  const withCut = applyHouseCut(state, houseCut);
  const deltaLp =
    solToLamports(stake) - solToLamports(winnings) - solToLamports(houseCut);
  return {
    ...withCut,
    pool: lamportsToSol(Math.max(0, solToLamports(withCut.pool) + deltaLp)),
  };
}

export { splitCut };
