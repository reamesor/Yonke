import { NextResponse } from "next/server";
import { z } from "zod";
import { isSiwsEnabled } from "@/lib/features";
import { createSiwsChallenge } from "@/lib/auth/siws";

const bodySchema = z.object({
  pubkey: z.string().min(32).max(64),
});

export async function POST(req: Request) {
  if (!isSiwsEnabled()) {
    return NextResponse.json(
      {
        error: "SIWS disabled",
        message:
          "Set NEXT_PUBLIC_SIWS_ENABLED=true to require Sign-In-With-Solana verification.",
      },
      { status: 503 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "pubkey required" }, { status: 400 });
  }

  const challenge = await createSiwsChallenge(parsed.data.pubkey, req.url);
  return NextResponse.json(challenge);
}
