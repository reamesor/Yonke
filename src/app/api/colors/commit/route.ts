import { NextResponse } from "next/server";
import { z } from "zod";
import { putCommit } from "@/lib/colors/commitStore";
import { createRoundCommit } from "@/lib/colors/fairness";
import { getFairnessStoreMode } from "@/lib/features";

const openSchema = z.object({
  clientSeed: z.string().min(1).optional(),
  nonce: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = openSchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid commit request" }, { status: 400 });
  }

  const nonce = parsed.data.nonce ?? Date.now() % 1_000_000_000;
  const { commit, serverSeed } = createRoundCommit(nonce, parsed.data.clientSeed);
  const id = commit.serverSeedHash;

  await putCommit(id, {
    serverSeed,
    serverSeedHash: commit.serverSeedHash,
    clientSeed: commit.clientSeed,
    nonce: commit.nonce,
    createdAt: Date.now(),
  });

  return NextResponse.json({
    commitId: id,
    serverSeedHash: commit.serverSeedHash,
    clientSeed: commit.clientSeed,
    nonce: commit.nonce,
    store: getFairnessStoreMode(),
  });
}

export async function GET() {
  return POST(
    new Request("http://local/api/colors/commit", {
      method: "POST",
      body: "{}",
    }),
  );
}
