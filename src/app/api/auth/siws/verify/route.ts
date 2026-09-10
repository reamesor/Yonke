import { NextResponse } from "next/server";
import { z } from "zod";
import { isSiwsEnabled } from "@/lib/features";
import {
  SIWS_COOKIE,
  SIWS_SESSION_TTL_MS,
  verifySiwsAndIssueSession,
} from "@/lib/auth/siws";

const bodySchema = z.object({
  pubkey: z.string().min(32).max(64),
  nonce: z.string().min(8),
  message: z.string().min(16),
  signature: z.string().min(64),
});

export async function POST(req: Request) {
  if (!isSiwsEnabled()) {
    return NextResponse.json({ error: "SIWS disabled" }, { status: 503 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid verify payload", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await verifySiwsAndIssueSession({
    pubkey: parsed.data.pubkey,
    nonce: parsed.data.nonce,
    message: parsed.data.message,
    signatureBase58: parsed.data.signature,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const res = NextResponse.json({
    ok: true,
    pubkey: parsed.data.pubkey,
    expiresAt: result.expiresAt,
    verified: true,
  });

  res.cookies.set(SIWS_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SIWS_SESSION_TTL_MS / 1000),
  });

  return res;
}
