import { NextResponse } from "next/server";
import { custodyPublicStatus } from "@/lib/custody/house";
import { isSiwsEnabled } from "@/lib/features";

export async function GET() {
  const status = custodyPublicStatus();
  return NextResponse.json({
    ...status,
    siwsEnabled: isSiwsEnabled(),
  });
}
