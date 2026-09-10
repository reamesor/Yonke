import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isSiwsEnabled } from "@/lib/features";
import { parseSessionToken, SIWS_COOKIE } from "@/lib/auth/siws";

export async function GET() {
  if (!isSiwsEnabled()) {
    return NextResponse.json({
      enabled: false,
      verified: false,
      pubkey: null,
    });
  }

  const jar = await cookies();
  const token = jar.get(SIWS_COOKIE)?.value;
  const session = parseSessionToken(token);
  if (!session) {
    return NextResponse.json({
      enabled: true,
      verified: false,
      pubkey: null,
    });
  }

  return NextResponse.json({
    enabled: true,
    verified: true,
    pubkey: session.pubkey,
    expiresAt: session.exp,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SIWS_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
