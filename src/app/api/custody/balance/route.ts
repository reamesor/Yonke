import { NextResponse } from "next/server";
import { z } from "zod";
import { getCustodyBalance, listRecentTxs } from "@/lib/custody/balances";
import { isDevnetCustodyConfigured } from "@/lib/custody/house";
import { requireSiwsSession } from "@/lib/custody/session";
import { lamportsToSol } from "@/lib/solana/lamports";

const querySchema = z.object({
  pubkey: z.string().min(32).max(64),
});

export async function GET(req: Request) {
  if (!isDevnetCustodyConfigured()) {
    return NextResponse.json(
      { error: "DEVNET custody not configured", enabled: false },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    pubkey: url.searchParams.get("pubkey"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  const auth = await requireSiwsSession(parsed.data.pubkey);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const balanceLamports = await getCustodyBalance(parsed.data.pubkey);
  const txs = await listRecentTxs(parsed.data.pubkey, 10);

  return NextResponse.json({
    enabled: true,
    pubkey: parsed.data.pubkey,
    balanceLamports,
    balanceSol: lamportsToSol(balanceLamports),
    txs,
  });
}
