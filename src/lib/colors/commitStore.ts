/**
 * Durable commit-reveal storage for Colors fairness.
 * Modes: redis (Upstash) → file → memory.
 */

import { promises as fs } from "fs";
import path from "path";
import { getFairnessStoreMode } from "@/lib/features";

export type CommitRecord = {
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: number;
};

const MEM = new Map<string, CommitRecord>();
const KEY_PREFIX = "monke:fairness:commit:";

const DATA_DIR = path.join(process.cwd(), ".data");

function filePath(): string {
  return process.env.FAIRNESS_FILE_PATH?.trim() || path.join(DATA_DIR, "fairness-commits.json");
}

async function readFileStore(): Promise<Record<string, CommitRecord>> {
  try {
    const raw = await fs.readFile(/* turbopackIgnore: true */ filePath(), "utf8");
    return JSON.parse(raw) as Record<string, CommitRecord>;
  } catch {
    return {};
  }
}

async function writeFileStore(data: Record<string, CommitRecord>) {
  const fp = filePath();
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(data), "utf8");
}

async function redisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

const TTL_SEC = 60 * 60 * 24 * 7;

export async function putCommit(id: string, record: CommitRecord): Promise<void> {
  const mode = getFairnessStoreMode();

  if (mode === "redis") {
    const r = await redisClient();
    if (r) {
      await r.set(`${KEY_PREFIX}${id}`, JSON.stringify(record), { ex: TTL_SEC });
      return;
    }
  }

  if (mode === "file" || mode === "redis") {
    try {
      const data = await readFileStore();
      data[id] = record;
      const cutoff = Date.now() - TTL_SEC * 1000;
      for (const [k, v] of Object.entries(data)) {
        if (v.createdAt < cutoff) delete data[k];
      }
      await writeFileStore(data);
      return;
    } catch {
      /* fall through to memory */
    }
  }

  MEM.set(id, record);
}

export async function getCommit(id: string): Promise<CommitRecord | null> {
  const mode = getFairnessStoreMode();

  if (mode === "redis") {
    const r = await redisClient();
    if (r) {
      const raw = await r.get<string>(`${KEY_PREFIX}${id}`);
      if (!raw) return null;
      return typeof raw === "string" ? (JSON.parse(raw) as CommitRecord) : (raw as CommitRecord);
    }
  }

  if (mode === "file" || mode === "redis") {
    try {
      const data = await readFileStore();
      return data[id] ?? null;
    } catch {
      /* fall through */
    }
  }

  return MEM.get(id) ?? null;
}

export async function takeCommit(id: string): Promise<CommitRecord | null> {
  const mode = getFairnessStoreMode();

  if (mode === "redis") {
    const r = await redisClient();
    if (r) {
      const key = `${KEY_PREFIX}${id}`;
      try {
        const raw = await (r as { getdel: (k: string) => Promise<unknown> }).getdel(key);
        if (raw != null) {
          MEM.delete(id);
          return typeof raw === "string"
            ? (JSON.parse(raw) as CommitRecord)
            : (raw as CommitRecord);
        }
      } catch {
        const raw = await r.get<string>(key);
        if (raw != null) {
          await r.del(key);
          MEM.delete(id);
          return typeof raw === "string"
            ? (JSON.parse(raw) as CommitRecord)
            : (raw as CommitRecord);
        }
      }
    }
  }

  if (mode === "file" || mode === "redis") {
    try {
      const data = await readFileStore();
      const rec = data[id];
      if (rec) {
        delete data[id];
        await writeFileStore(data);
        MEM.delete(id);
        return rec;
      }
    } catch {
      /* fall through */
    }
  }

  const mem = MEM.get(id);
  if (!mem) return null;
  MEM.delete(id);
  return mem;
}

/** HMAC material for server seed generation — never hardcode. */
export function getServerSeedSecret(): string {
  const s = process.env.SERVER_SEED_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[fairness] SERVER_SEED_SECRET unset in production — using weak ephemeral secret",
    );
  }
  return "";
}
