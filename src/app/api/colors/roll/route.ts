import { NextResponse } from "next/server";
import { z } from "zod";
import { COLOR_KEYS } from "@/lib/colors/engine";
import { putCommit, takeCommit } from "@/lib/colors/commitStore";
import { createRoundCommit, deriveDice } from "@/lib/colors/fairness";
import { settleRollLamports } from "@/lib/colors/engineLamports";
import { endSessionRoll, tryBeginSessionRoll } from "@/lib/colors/sessionRollGuard";
import { getFairnessStoreMode } from "@/lib/features";
import { solToLamports } from "@/lib/solana/lamports";

const bodySchema = z.object({
  bet: z.number().positive(),
  picked: z.array(z.enum(COLOR_KEYS)).min(1).max(3),
  commitId: z.string().min(1).optional(),
  clientSeed: z.string().min(1).optional(),
  nonce: z.number().int().nonnegative(),
  clientSessionId: z.string().min(8).max(128).optional(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid roll request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { nonce, clientSessionId, bet, picked } = parsed.data;
  if (!tryBeginSessionRoll(clientSessionId)) {
    return NextResponse.json(
      { error: "Roll already in flight for this session" },
      { status: 409 },
    );
  }

  try {
    let serverSeed: string;
    let clientSeed: string;
    let serverSeedHash: string;

    const commitId = parsed.data.commitId;
    if (commitId) {
      const stored = await takeCommit(commitId);
      if (stored) {
        serverSeed = stored.serverSeed;
        clientSeed = stored.clientSeed;
        serverSeedHash = stored.serverSeedHash;
      } else {
        console.warn(
          `[colors/roll] commit ${commitId.slice(0, 12)}… missing (store=${getFairnessStoreMode()}) — ephemeral fallback`,
        );
        const opened = createRoundCommit(nonce, parsed.data.clientSeed);
        serverSeed = opened.serverSeed;
        clientSeed = opened.commit.clientSeed;
        serverSeedHash = opened.commit.serverSeedHash;
      }
    } else {
      const opened = createRoundCommit(nonce, parsed.data.clientSeed);
      serverSeed = opened.serverSeed;
      clientSeed = opened.commit.clientSeed;
      serverSeedHash = opened.commit.serverSeedHash;
    }

    const dice = deriveDice(serverSeed, clientSeed, nonce);
    const settled = settleRollLamports(solToLamports(bet), picked, dice, "PER_COLOR");

    return NextResponse.json({
      dice,
      settlement: {
        matches: settled.matches,
        winningsLamports: settled.winningsLamports,
        stakeLamports: settled.stakeLamports,
        houseCutLamports: settled.houseCutLamports,
        netLamports: settled.netLamports,
      },
      fairness: {
        serverSeedHash,
        serverSeed,
        clientSeed,
        nonce,
        dice,
      },
      store: getFairnessStoreMode(),
    });
  } finally {
    endSessionRoll(clientSessionId);
  }
}

export async function GET() {
  const opened = createRoundCommit(0);
  await putCommit(opened.commit.serverSeedHash, {
    serverSeed: opened.serverSeed,
    serverSeedHash: opened.commit.serverSeedHash,
    clientSeed: opened.commit.clientSeed,
    nonce: opened.commit.nonce,
    createdAt: Date.now(),
  });
  return NextResponse.json({
    commitId: opened.commit.serverSeedHash,
    serverSeedHash: opened.commit.serverSeedHash,
    store: getFairnessStoreMode(),
  });
}
