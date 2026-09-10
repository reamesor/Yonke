/**
 * Deterministic Colors round gates — shared by UI + regression checks.
 */

export type RoundPhase = "select" | "placed" | "rolling" | "done";

export type RoundGate = {
  phase: RoundPhase;
  inFlight: boolean;
  commitReady: boolean;
};

export function canPlaceBet(g: RoundGate): boolean {
  return g.phase === "select" && !g.inFlight && g.commitReady;
}

export function canPullLever(g: RoundGate): boolean {
  return g.phase === "placed" && !g.inFlight && g.commitReady;
}

export function afterPlaceBet(g: RoundGate): RoundGate | null {
  if (!canPlaceBet(g)) return null;
  return { ...g, phase: "placed" };
}

export function afterCancelPlace(g: RoundGate): RoundGate | null {
  if (g.phase !== "placed" || g.inFlight) return null;
  return { ...g, phase: "select" };
}

export function afterLeverPull(g: RoundGate): RoundGate | null {
  if (!canPullLever(g)) return null;
  return { phase: "rolling", inFlight: true, commitReady: g.commitReady };
}

export function afterSettleUi(g: RoundGate): RoundGate {
  return { phase: "done", inFlight: true, commitReady: false };
}

export function afterSettleTail(g: RoundGate): RoundGate {
  return { phase: "select", inFlight: false, commitReady: g.commitReady };
}

export function afterRollFail(_g: RoundGate): RoundGate {
  return { phase: "select", inFlight: false, commitReady: false };
}

export function afterCommitReady(g: RoundGate): RoundGate {
  return { ...g, commitReady: true };
}

export function rejectDoubleLever(g: RoundGate): boolean {
  return afterLeverPull(g) === null;
}

export function playOneRound(g: RoundGate): RoundGate | null {
  const placed = afterPlaceBet(g);
  if (!placed) return null;
  const rolling = afterLeverPull(placed);
  if (!rolling) return null;
  return afterCommitReady(afterSettleTail(afterSettleUi(rolling)));
}

export function canPlaySequentialRounds(n: number): boolean {
  let g: RoundGate = { phase: "select", inFlight: false, commitReady: true };
  for (let i = 0; i < n; i++) {
    if (!canPlaceBet(g)) return false;
    const next = playOneRound(g);
    if (!next) return false;
    g = next;
  }
  return canPlaceBet(g);
}

export function canPlayManualAndAutobetLoops(cycles: number): boolean {
  let g: RoundGate = { phase: "select", inFlight: false, commitReady: true };
  for (let i = 0; i < cycles; i++) {
    const manual = playOneRound(g);
    if (!manual) return false;
    g = manual;
    if (!canPlaceBet(g)) return false;
    const auto = playOneRound(g);
    if (!auto) return false;
    g = auto;
    const mid: RoundGate = { phase: "placed", inFlight: true, commitReady: true };
    if (!rejectDoubleLever(mid)) return false;
  }
  return canPlaceBet(g);
}
