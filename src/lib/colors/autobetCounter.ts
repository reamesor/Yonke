/** remaining: 0 = idle/stopped, -1 = ∞, >0 = finite rounds left. */

export function shouldFireAutobet(remaining: number): boolean {
  return remaining !== 0;
}

export function consumeAutobetRemaining(remaining: number): number {
  if (remaining < 0) return remaining;
  if (remaining <= 0) return 0;
  return remaining - 1;
}

export function simulateAutobetSession(
  armed: number,
  opts?: { stopAfter?: number; maxRounds?: number },
): { played: number; remaining: number } {
  let remaining = armed;
  let played = 0;
  const stopAfter = opts?.stopAfter;
  const maxRounds = opts?.maxRounds ?? (armed < 0 ? 10_000 : armed + 5);

  while (shouldFireAutobet(remaining)) {
    if (stopAfter !== undefined && played >= stopAfter) {
      remaining = 0;
      break;
    }
    if (played >= maxRounds) {
      throw new Error(
        `autobet session exceeded maxRounds=${maxRounds} (armed=${armed})`,
      );
    }
    played += 1;
    remaining = consumeAutobetRemaining(remaining);
  }

  return { played, remaining };
}
