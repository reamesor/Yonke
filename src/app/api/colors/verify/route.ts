import { NextResponse } from "next/server";
import { z } from "zod";
import { COLOR_KEYS } from "@/lib/colors/engine";
import { verifyFairness } from "@/lib/colors/fairness";

const schema = z.object({
  serverSeed: z.string().min(1),
  serverSeedHash: z.string().min(1),
  clientSeed: z.string().min(1),
  nonce: z.number().int().nonnegative(),
  dice: z.array(z.enum(COLOR_KEYS)).length(3),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ valid: false, error: "Invalid payload" }, { status: 400 });
  }
  const valid = verifyFairness(parsed.data);
  return NextResponse.json({ valid, reveal: parsed.data });
}
