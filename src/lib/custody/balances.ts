/**
 * Off-chain custodial play balances (lamports) for DEVNET mode.
 */

import { promises as fs } from "fs";
import path from "path";
import { getFairnessStoreMode } from "@/lib/features";

export type CustodyAccount = {
  pubkey: string;
  balanceLamports: number;
  updatedAt: number;
};

export type CustodyTxRecord = {
  id: string;
  pubkey: string;
  kind: "deposit" | "withdraw" | "bet_debit" | "bet_credit";
  amountLamports: number;
  signature?: string;
  status: "pending" | "confirmed" | "failed";
  error?: string;
  at: number;
};

type StoreBlob = {
  accounts: Record<string, CustodyAccount>;
  creditedSigs: Record<string, string>;
  txs: CustodyTxRecord[];
};

const REDIS_KEY = "yonke:custody:v1";
const FILE_NAME = "custody-balances.json";
const MEM: StoreBlob = { accounts: {}, creditedSigs: {}, txs: [] };

const DATA_DIR = path.join(process.cwd(), ".data");

function filePath(): string {
  return process.env.CUSTODY_FILE_PATH?.trim() || path.join(DATA_DIR, FILE_NAME);
}

async function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

async function readStore(): Promise<StoreBlob> {
  const mode = getFairnessStoreMode();

  if (mode === "redis") {
    const r = await redisClient();
    if (r) {
      const raw = await r.get<string | StoreBlob>(REDIS_KEY);
      if (!raw) return { accounts: {}, creditedSigs: {}, txs: [] };
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw) as StoreBlob;
        } catch {
          return { accounts: {}, creditedSigs: {}, txs: [] };
        }
      }
      return {
        accounts: raw.accounts ?? {},
        creditedSigs: raw.creditedSigs ?? {},
        txs: raw.txs ?? [],
      };
    }
  }

  if (mode === "file" || mode === "redis") {
    try {
      const raw = await fs.readFile(/* turbopackIgnore: true */ filePath(), "utf8");
      const parsed = JSON.parse(raw) as StoreBlob;
      return {
        accounts: parsed.accounts ?? {},
        creditedSigs: parsed.creditedSigs ?? {},
        txs: parsed.txs ?? [],
      };
    } catch {
      /* fall through */
    }
  }

  return {
    accounts: { ...MEM.accounts },
    creditedSigs: { ...MEM.creditedSigs },
    txs: [...MEM.txs],
  };
}

async function writeStore(data: StoreBlob): Promise<void> {
  MEM.accounts = { ...data.accounts };
  MEM.creditedSigs = { ...data.creditedSigs };
  MEM.txs = [...data.txs];

  const mode = getFairnessStoreMode();

  if (mode === "redis") {
    const r = await redisClient();
    if (r) {
      await r.set(REDIS_KEY, JSON.stringify(data));
      return;
    }
  }

  if (mode === "file" || mode === "redis") {
    const fp = filePath();
    await fs.mkdir(path.dirname(fp), { recursive: true });
    await fs.writeFile(fp, JSON.stringify(data), "utf8");
  }
}

function pushTx(store: StoreBlob, tx: CustodyTxRecord) {
  store.txs = [tx, ...store.txs].slice(0, 200);
}

export async function getCustodyBalance(pubkey: string): Promise<number> {
  const store = await readStore();
  return store.accounts[pubkey]?.balanceLamports ?? 0;
}

export async function creditDeposit(opts: {
  pubkey: string;
  amountLamports: number;
  signature: string;
}): Promise<{ ok: true; balanceLamports: number } | { ok: false; error: string }> {
  const amount = Math.floor(opts.amountLamports);
  if (amount <= 0) return { ok: false, error: "Amount must be positive." };

  const store = await readStore();
  if (store.creditedSigs[opts.signature]) {
    const bal = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
    return { ok: true, balanceLamports: bal };
  }

  const prev = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
  const next = prev + amount;
  store.accounts[opts.pubkey] = {
    pubkey: opts.pubkey,
    balanceLamports: next,
    updatedAt: Date.now(),
  };
  store.creditedSigs[opts.signature] = opts.pubkey;
  pushTx(store, {
    id: `dep-${opts.signature.slice(0, 16)}`,
    pubkey: opts.pubkey,
    kind: "deposit",
    amountLamports: amount,
    signature: opts.signature,
    status: "confirmed",
    at: Date.now(),
  });
  await writeStore(store);
  return { ok: true, balanceLamports: next };
}

export async function debitForWithdraw(opts: {
  pubkey: string;
  amountLamports: number;
}): Promise<
  | { ok: true; balanceLamports: number; holdId: string }
  | { ok: false; error: string }
> {
  const amount = Math.floor(opts.amountLamports);
  if (amount <= 0) return { ok: false, error: "Amount must be positive." };

  const store = await readStore();
  const prev = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
  if (amount > prev) {
    return { ok: false, error: "Insufficient Yonke DEVNET play balance." };
  }
  const next = prev - amount;
  const holdId = `wdr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  store.accounts[opts.pubkey] = {
    pubkey: opts.pubkey,
    balanceLamports: next,
    updatedAt: Date.now(),
  };
  pushTx(store, {
    id: holdId,
    pubkey: opts.pubkey,
    kind: "withdraw",
    amountLamports: amount,
    status: "pending",
    at: Date.now(),
  });
  await writeStore(store);
  return { ok: true, balanceLamports: next, holdId };
}

export async function restoreWithdraw(opts: {
  pubkey: string;
  amountLamports: number;
  holdId: string;
  error: string;
}): Promise<void> {
  const store = await readStore();
  const prev = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
  store.accounts[opts.pubkey] = {
    pubkey: opts.pubkey,
    balanceLamports: prev + Math.floor(opts.amountLamports),
    updatedAt: Date.now(),
  };
  const tx = store.txs.find((t) => t.id === opts.holdId);
  if (tx) {
    tx.status = "failed";
    tx.error = opts.error;
  }
  await writeStore(store);
}

export async function confirmWithdrawTx(opts: {
  holdId: string;
  signature: string;
}): Promise<void> {
  const store = await readStore();
  const tx = store.txs.find((t) => t.id === opts.holdId);
  if (tx) {
    tx.status = "confirmed";
    tx.signature = opts.signature;
  }
  await writeStore(store);
}

export async function debitPlay(opts: {
  pubkey: string;
  amountLamports: number;
  note?: string;
}): Promise<{ ok: true; balanceLamports: number } | { ok: false; error: string }> {
  const amount = Math.floor(opts.amountLamports);
  if (amount <= 0) return { ok: true, balanceLamports: await getCustodyBalance(opts.pubkey) };

  const store = await readStore();
  const prev = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
  if (amount > prev) {
    return { ok: false, error: "Insufficient DEVNET play balance." };
  }
  const next = prev - amount;
  store.accounts[opts.pubkey] = {
    pubkey: opts.pubkey,
    balanceLamports: next,
    updatedAt: Date.now(),
  };
  pushTx(store, {
    id: `bet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pubkey: opts.pubkey,
    kind: "bet_debit",
    amountLamports: amount,
    status: "confirmed",
    at: Date.now(),
  });
  await writeStore(store);
  return { ok: true, balanceLamports: next };
}

export async function creditPlay(opts: {
  pubkey: string;
  amountLamports: number;
}): Promise<{ ok: true; balanceLamports: number } | { ok: false; error: string }> {
  const amount = Math.floor(opts.amountLamports);
  if (amount <= 0) {
    return { ok: true, balanceLamports: await getCustodyBalance(opts.pubkey) };
  }
  const store = await readStore();
  const prev = store.accounts[opts.pubkey]?.balanceLamports ?? 0;
  const next = prev + amount;
  store.accounts[opts.pubkey] = {
    pubkey: opts.pubkey,
    balanceLamports: next,
    updatedAt: Date.now(),
  };
  pushTx(store, {
    id: `win-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pubkey: opts.pubkey,
    kind: "bet_credit",
    amountLamports: amount,
    status: "confirmed",
    at: Date.now(),
  });
  await writeStore(store);
  return { ok: true, balanceLamports: next };
}

export async function listRecentTxs(pubkey: string, limit = 20) {
  const store = await readStore();
  return store.txs.filter((t) => t.pubkey === pubkey).slice(0, limit);
}
