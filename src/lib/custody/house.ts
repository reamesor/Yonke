/**
 * House-controlled devnet wallet — server-side signing only.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  type Cluster,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getFairnessStoreMode } from "@/lib/features";

export const DEVNET_FAUCET_URL = "https://faucet.solana.com/";

export function isDurableCustodyBackendReady(): boolean {
  if (process.env.VERCEL === "1") {
    return Boolean(
      process.env.UPSTASH_REDIS_REST_URL?.trim() &&
        process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
    );
  }
  return true;
}

function readSecretKey(): Uint8Array | null {
  const raw =
    process.env.HOUSE_WALLET_SECRET_KEY?.trim() ||
    process.env.TREASURY_AUTHORITY_KEYPAIR?.trim();
  if (!raw) return null;

  if (raw.startsWith("[")) {
    try {
      const arr = JSON.parse(raw) as number[];
      if (!Array.isArray(arr) || arr.length < 32) return null;
      return Uint8Array.from(arr);
    } catch {
      return null;
    }
  }

  try {
    return bs58.decode(raw);
  } catch {
    return null;
  }
}

export function getCustodyCluster(): "devnet" | null {
  const net = (
    process.env.NEXT_PUBLIC_SOLANA_NETWORK ||
    process.env.SOLANA_NETWORK ||
    ""
  )
    .trim()
    .toLowerCase();
  if (net === "devnet") return "devnet";
  return null;
}

export function getHouseKeypair(): Keypair | null {
  if (getCustodyCluster() !== "devnet") return null;
  const secret = readSecretKey();
  if (!secret) return null;
  try {
    return Keypair.fromSecretKey(secret);
  } catch {
    return null;
  }
}

export function getHousePublicKey(): PublicKey | null {
  const kp = getHouseKeypair();
  return kp?.publicKey ?? null;
}

export function getCustodyConnection(): Connection {
  const rpc =
    process.env.SOLANA_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC?.trim() ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    clusterApiUrl("devnet" as Cluster);
  return new Connection(rpc, "confirmed");
}

export function isDevnetCustodyConfigured(): boolean {
  if (getCustodyCluster() !== "devnet") return false;
  if (!getHouseKeypair()) return false;
  if (!isDurableCustodyBackendReady()) return false;
  const flag = process.env.NEXT_PUBLIC_DEVNET_CUSTODY?.trim().toLowerCase();
  const siws = process.env.NEXT_PUBLIC_SIWS_ENABLED?.trim().toLowerCase();
  const custodyOn = flag === "true" || flag === "1" || flag === "yes";
  const siwsOn = siws === "true" || siws === "1" || siws === "yes";
  return custodyOn && siwsOn;
}

export function custodyPublicStatus() {
  const cluster = getCustodyCluster();
  const house = getHousePublicKey();
  const durableReady = isDurableCustodyBackendReady();
  const enabled = isDevnetCustodyConfigured();
  return {
    enabled,
    cluster: cluster ?? (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "unknown"),
    housePubkey: house?.toBase58() ?? null,
    faucetUrl: DEVNET_FAUCET_URL,
    requiresSiws: true,
    durableStore: getFairnessStoreMode(),
    durableReady,
    disabledReason: enabled
      ? null
      : getCustodyCluster() !== "devnet"
        ? "Set NEXT_PUBLIC_SOLANA_NETWORK=devnet"
        : !getHouseKeypair()
          ? "Set HOUSE_WALLET_SECRET_KEY (devnet-only)"
          : !durableReady
            ? "On Vercel set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN"
            : "Enable NEXT_PUBLIC_DEVNET_CUSTODY + NEXT_PUBLIC_SIWS_ENABLED",
  };
}
