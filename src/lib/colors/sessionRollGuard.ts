/**
 * Per-session in-flight roll latch — process-local, keyed by client session.
 */

const inflight = new Map<string, number>();
const TTL_MS = 60_000;

function prune(now: number) {
  for (const [k, started] of inflight) {
    if (now - started > TTL_MS) inflight.delete(k);
  }
}

export function tryBeginSessionRoll(sessionId: string | undefined): boolean {
  if (!sessionId) return true;
  const now = Date.now();
  prune(now);
  const started = inflight.get(sessionId);
  if (started != null) {
    if (now - started < 12_000) return false;
    inflight.delete(sessionId);
  }
  inflight.set(sessionId, now);
  return true;
}

export function endSessionRoll(sessionId: string | undefined): void {
  if (!sessionId) return;
  inflight.delete(sessionId);
}

export function clearSessionRollGuards(): void {
  inflight.clear();
}

export function sessionRollInFlightCount(): number {
  return inflight.size;
}
