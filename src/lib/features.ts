function envFlag(name: string, truthy = "true"): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === truthy || v === "1" || v === "yes";
}

export function isSiwsEnabled(): boolean {
  return envFlag("NEXT_PUBLIC_SIWS_ENABLED");
}

export function isDevnetCustodyFlagOn(): boolean {
  const net = process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim().toLowerCase();
  if (net !== "devnet") return false;
  const flag = process.env.NEXT_PUBLIC_DEVNET_CUSTODY?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return isSiwsEnabled();
}

export function getFairnessStoreMode(): "redis" | "file" | "memory" {
  const raw = process.env.FAIRNESS_DURABLE_STORE?.trim().toLowerCase();
  if (raw === "redis" || raw === "file" || raw === "memory") return raw;
  if (
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim()
  ) {
    return "redis";
  }
  if (process.env.FAIRNESS_FILE_PATH?.trim() || process.env.VERCEL !== "1") {
    return "file";
  }
  return "memory";
}

export const DEMO_PLAY_SOL = 10;
export const DEMO_POOL_SOL = 100;
