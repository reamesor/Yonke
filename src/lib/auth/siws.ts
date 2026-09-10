import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify } from "crypto";
import bs58 from "bs58";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_PREFIX = "yonke:siws:chal:";

export type SiwsChallenge = {
  nonce: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  domain: string;
};

export type SiwsSessionPayload = {
  pubkey: string;
  iat: number;
  exp: number;
};

function sessionSecret(): string {
  const s =
    process.env.SIWS_SESSION_SECRET?.trim() ||
    process.env.SERVER_SEED_SECRET?.trim();
  if (!s) return "yonke-dev-siws-secret-change-me";
  return s;
}

function appDomain(reqUrl?: string): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).host;
    } catch {
      /* fall through */
    }
  }
  if (reqUrl) {
    try {
      return new URL(reqUrl).host;
    } catch {
      /* fall through */
    }
  }
  return "yonke.game";
}

const memoryChallenges = new Map<
  string,
  { pubkey: string; nonce: string; expiresAt: number }
>();

async function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

export function buildSiwsMessage(opts: {
  pubkey: string;
  nonce: string;
  domain: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  return [
    `${opts.domain} wants you to sign in with your Solana account:`,
    opts.pubkey,
    "",
    "Sign this message to prove wallet ownership for Yonke.",
    "This does not move funds or approve any transaction.",
    "",
    `Nonce: ${opts.nonce}`,
    `Issued At: ${opts.issuedAt.toISOString()}`,
    `Expires At: ${opts.expiresAt.toISOString()}`,
  ].join("\n");
}

export async function createSiwsChallenge(
  pubkey: string,
  reqUrl?: string,
): Promise<SiwsChallenge> {
  const nonce = randomBytes(24).toString("hex");
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const domain = appDomain(reqUrl);
  const message = buildSiwsMessage({
    pubkey,
    nonce,
    domain,
    issuedAt,
    expiresAt,
  });

  const record = { pubkey, nonce, expiresAt: expiresAt.getTime() };
  const r = await redis();
  if (r) {
    await r.set(`${CHALLENGE_PREFIX}${nonce}`, JSON.stringify(record), {
      px: CHALLENGE_TTL_MS,
    });
  } else {
    memoryChallenges.set(nonce, record);
  }

  return {
    nonce,
    message,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    domain,
  };
}

async function consumeChallenge(nonce: string, pubkey: string): Promise<boolean> {
  const r = await redis();
  if (r) {
    const key = `${CHALLENGE_PREFIX}${nonce}`;
    const raw = await r.get<string>(key);
    if (!raw) return false;
    await r.del(key);
    const parsed =
      typeof raw === "string"
        ? (JSON.parse(raw) as { pubkey: string; nonce: string; expiresAt: number })
        : (raw as { pubkey: string; nonce: string; expiresAt: number });
    if (parsed.pubkey !== pubkey) return false;
    if (Date.now() > parsed.expiresAt) return false;
    return true;
  }

  const record = memoryChallenges.get(nonce);
  if (!record) return false;
  memoryChallenges.delete(nonce);
  if (record.pubkey !== pubkey) return false;
  if (Date.now() > record.expiresAt) return false;
  return true;
}

export function verifyEd25519Detached(
  message: Uint8Array,
  signature: Uint8Array,
  pubkeyBase58: string,
): boolean {
  try {
    const publicKey = bs58.decode(pubkeyBase58);
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    const der = Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKey),
    ]);
    const keyObject = createPublicKey({ key: der, format: "der", type: "spki" });
    return verify(null, Buffer.from(message), keyObject, Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function verifySiwsAndIssueSession(opts: {
  pubkey: string;
  nonce: string;
  message: string;
  signatureBase58: string;
}): Promise<{ ok: true; token: string; expiresAt: number } | { ok: false; error: string }> {
  const consumed = await consumeChallenge(opts.nonce, opts.pubkey);
  if (!consumed) {
    return { ok: false, error: "Challenge expired or already used. Request a new one." };
  }

  if (!opts.message.includes(opts.nonce) || !opts.message.includes(opts.pubkey)) {
    return { ok: false, error: "Message does not match challenge." };
  }

  let signature: Uint8Array;
  try {
    signature = bs58.decode(opts.signatureBase58);
  } catch {
    return { ok: false, error: "Invalid signature encoding." };
  }

  const messageBytes = new TextEncoder().encode(opts.message);
  if (!verifyEd25519Detached(messageBytes, signature, opts.pubkey)) {
    return { ok: false, error: "Signature verification failed." };
  }

  const iat = Date.now();
  const exp = iat + SESSION_TTL_MS;
  const token = mintSessionToken({ pubkey: opts.pubkey, iat, exp });
  return { ok: true, token, expiresAt: exp };
}

function mintSessionToken(payload: SiwsSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function parseSessionToken(
  token: string | null | undefined,
): SiwsSessionPayload | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", sessionSecret())
    .update(body)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SiwsSessionPayload;
    if (!payload.pubkey || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SIWS_COOKIE = "yonke_siws";
export const SIWS_SESSION_TTL_MS = SESSION_TTL_MS;
