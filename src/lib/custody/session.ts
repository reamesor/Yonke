import { cookies } from "next/headers";
import { parseSessionToken, SIWS_COOKIE } from "@/lib/auth/siws";

export async function requireSiwsSession(pubkey: string): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  const jar = await cookies();
  const token = jar.get(SIWS_COOKIE)?.value;
  const session = parseSessionToken(token);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: "Sign in with Solana required — session missing or expired.",
    };
  }
  if (session.pubkey !== pubkey) {
    return {
      ok: false,
      status: 403,
      error: "Session wallet does not match request.",
    };
  }
  return { ok: true };
}
