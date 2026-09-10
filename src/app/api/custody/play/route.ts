import { NextResponse } from "next/server";
import { z } from "zod";
import { creditPlay, debitPlay } from "@/lib/custody/balances";
import { isDevnetCustodyConfigured } from "@/lib/custody/house";
import { requireSiwsSession } from "@/lib/custody/session";
import { lamportsToSol, solToLamports } from "@/lib/solana/lamports";

const bodySchema = z.object({
  pubkey: z.string().min(32).max(64),
  kind: z.enum(["debit", "credit"]),
  amountLamports: z.number().int().nonnegative().optional(),
  amountSol: z.number().nonnegative().optional(),
  note: z.string().max(200).optional(),
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
      { error: "Invalid play payload", details: parsed.error.flatten() },
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

  const result =
    parsed.data.kind === "debit"
      ? await debitPlay({
          pubkey: parsed.data.pubkey,
          amountLamports,
          note: parsed.data.note,
        })
      : await creditPlay({
          pubkey: parsed.data.pubkey,
          amountLamports,
        });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    balanceLamports: result.balanceLamports,
    balanceSol: lamportsToSol(result.balanceLamports),
  });
}
