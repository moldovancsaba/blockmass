import { NextResponse } from "next/server";
import { getEnv } from "@/app/_lib/env";

export const runtime = "nodejs";

export async function GET() {
  const { NEXT_PUBLIC_APP_VERSION } = getEnv();
  const ts = new Date().toISOString();
  return NextResponse.json({ status: "ok", ts, version: NEXT_PUBLIC_APP_VERSION });
}
