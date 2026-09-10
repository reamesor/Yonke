/**
 * Provably-fair RNG — commit–reveal.
 * Publish hash(serverSeed:nonce) before roll; reveal; HMAC-SHA256 dice.
 */

import { createHash, createHmac, randomBytes } from "crypto";
import { COLOR_KEYS, type ColorKey } from "./engine";
import { getServerSeedSecret } from "./commitStore";

export type FairnessCommit = {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
};

export type FairnessReveal = FairnessCommit & {
  serverSeed: string;
  dice: ColorKey[];
};

export function hashSeed(serverSeed: string, nonce: number): string {
  return createHash("sha256").update(`${serverSeed}:${nonce}`).digest("hex");
}

export function hashServerSeed(serverSeed: string): string {
  return createHash("sha256").update(serverSeed).digest("hex");
}

export function generateServerSeed(): string {
  const entropy = randomBytes(32).toString("hex");
  const secret = getServerSeedSecret();
  if (!secret) return entropy;
  return createHmac("sha256", secret).update(entropy).digest("hex");
}

export function generateClientSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Uniform float in [0, 1) from HMAC counter. */
function hmacUnit(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  stream: string,
  counter: number,
): number {
  const msg = `${clientSeed}:${nonce}:${stream}:${counter}`;
  const digest = createHmac("sha256", serverSeed).update(msg).digest();
  const hi = BigInt(digest.readUInt32BE(0));
  const lo = BigInt(digest.readUInt32BE(4) >>> 11);
  const mantissa = (hi << BigInt(21)) | lo;
  return Number(mantissa) / Number(BigInt(1) << BigInt(53));
}

function hmacIndex(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  stream: string,
  counter: number,
  modulo: number,
): number {
  const u = hmacUnit(serverSeed, clientSeed, nonce, stream, counter);
  return Math.min(modulo - 1, Math.floor(u * modulo));
}

/** Deterministic 3 dice from the server seed — HMAC-SHA256, never client RNG. */
export function deriveDice(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): ColorKey[] {
  return [0, 1, 2].map((i) => {
    const idx = hmacIndex(serverSeed, clientSeed, nonce, "dice", i, COLOR_KEYS.length);
    return COLOR_KEYS[idx]!;
  });
}

export function createRoundCommit(
  nonce: number,
  clientSeed?: string,
): { commit: FairnessCommit; serverSeed: string } {
  const cs = clientSeed ?? generateClientSeed();
  const serverSeed = generateServerSeed();
  return {
    serverSeed,
    commit: {
      serverSeedHash: hashSeed(serverSeed, nonce),
      clientSeed: cs,
      nonce,
    },
  };
}

export function verifyFairness(reveal: FairnessReveal): boolean {
  const hashOk =
    hashSeed(reveal.serverSeed, reveal.nonce) === reveal.serverSeedHash ||
    hashServerSeed(reveal.serverSeed) === reveal.serverSeedHash;
  if (!hashOk) return false;
  const expected = deriveDice(reveal.serverSeed, reveal.clientSeed, reveal.nonce);
  return (
    expected.length === reveal.dice.length &&
    expected.every((c, i) => c === reveal.dice[i])
  );
}
