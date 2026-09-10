import { NextResponse } from "next/server";
import { z } from "zod";
import {
  confirmWithdrawTx,
  debitForWithdraw,
  restoreWithdraw,
} from "@/lib/custody/balances";
import { sendHouseWithdrawal } from "@/lib/custody/chain";
import { isDevnetCustodyConfigured } from "@/lib/custody/house";
import { requireSiwsSession } from "@/lib/custody/session";
import { lamportsToSol, solToLamports } from "@/lib/solana/lamports";

const bodySchema = z.object({
  pubkey: z.string().min(32).max(64),
  amountLamports: z.number().int().positive().optional(),
  amountSol: z.number().positive().optional(),
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
      { error: "Invalid withdraw payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const auth = await requireSiwsSession(parsed.data.pubkey);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const amountLamports =
    parsed.data.amountLamports ??
    (parsed.data.amountSol != null ? solToLamports(parsed.data.amountSol) : 0);
  if (amountLamports <= 0) {
    return NextResponse.json({ error: "Amount required" }, { status: 400 });
  }

  const hold = await debitForWithdraw({
    pubkey: parsed.data.pubkey,
    amountLamports,
  });
  if (!hold.ok) {
    return NextResponse.json(
      { error: hold.error, status: "failed" },
      { status: 400 },
    );
  }

  const sent = await sendHouseWithdrawal({
    toPubkey: parsed.data.pubkey,
    amountLamports,
  });

  if (!sent.ok) {
    await restoreWithdraw({
      pubkey: parsed.data.pubkey,
      amountLamports,
      holdId: hold.holdId,
      error: sent.error,
    });
    return NextResponse.json(
      { error: sent.error, status: "failed" },
      { status: 502 },
    );
  }

  await confirmWithdrawTx({
    holdId: hold.holdId,
    signature: sent.signature,
  });

  return NextResponse.json({
    ok: true,
    status: "confirmed",
    signature: sent.signature,
    withdrawnLamports: amountLamports,
    withdrawnSol: lamportsToSol(amountLamports),
    balanceLamports: hold.balanceLamports,
    balanceSol: lamportsToSol(hold.balanceLamports),
  });
}
