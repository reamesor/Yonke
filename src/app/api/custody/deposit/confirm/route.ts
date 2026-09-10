import { NextResponse } from "next/server";
import { z } from "zod";
import { creditDeposit } from "@/lib/custody/balances";
import { verifyIncomingDeposit } from "@/lib/custody/chain";
import { isDevnetCustodyConfigured } from "@/lib/custody/house";
import { requireSiwsSession } from "@/lib/custody/session";
import { lamportsToSol } from "@/lib/solana/lamports";

const bodySchema = z.object({
  pubkey: z.string().min(32).max(64),
  signature: z.string().min(44).max(128),
  minLamports: z.number().int().positive().optional(),
});

export async function POST(req: Request) {
  if (!isDevnetCustodyConfigured()) {
    return NextResponse.json(
      { error: "DEVNET custody not configured" },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid deposit payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const auth = await requireSiwsSession(parsed.data.pubkey);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const verified = await verifyIncomingDeposit({
    signature: parsed.data.signature,
    fromPubkey: parsed.data.pubkey,
    minLamports: parsed.data.minLamports ?? 1,
  });

  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error, status: "failed" },
      { status: 400 },
    );
  }

  const credited = await creditDeposit({
    pubkey: parsed.data.pubkey,
    amountLamports: verified.amountLamports,
    signature: parsed.data.signature,
  });

  if (!credited.ok) {
    return NextResponse.json(
      { error: credited.error, status: "failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    status: "confirmed",
    signature: parsed.data.signature,
    creditedLamports: verified.amountLamports,
    creditedSol: lamportsToSol(verified.amountLamports),
    balanceLamports: credited.balanceLamports,
    balanceSol: lamportsToSol(credited.balanceLamports),
  });
}
