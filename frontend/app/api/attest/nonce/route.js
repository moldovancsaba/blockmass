export const runtime = "nodejs";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { dbConnect } from "@/app/_lib/db";
import Nonce from "@/app/_models/Nonce";

export async function POST() {
  await dbConnect();
  const now = new Date();
  const id = crypto.randomUUID();
  const value = `${crypto.randomUUID()}-${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

  await Nonce.create({ _id: id, value, expiresAt, used: false });

  return new NextResponse(
    JSON.stringify({ nonce: value, expiresAt: expiresAt.toISOString() }),
    {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store, no-transform",
      },
    }
  );
}
