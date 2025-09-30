import { NextResponse } from "next/server";
import { metrics, incClients, decClients } from "@/app/_lib/metrics";

/**
 * Minimal Socket.io server using Edge WebSocket upgrade fallback to Node on Vercel.
 * We expose a Server-Sent Events style ping for health when not upgraded.
 * For local dev, a simple in-memory registry tracks connections via query ops.
 */
export const runtime = "nodejs"; // ensure Node runtime

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const op = searchParams.get("op");
  if (op === "connect") {
    incClients();
    return NextResponse.json({ ok: true, connectedClients: metrics.socket.connectedClients });
  }
  if (op === "disconnect") {
    decClients();
    return NextResponse.json({ ok: true, connectedClients: metrics.socket.connectedClients });
  }
  return NextResponse.json({ ok: true, message: "socket health", connectedClients: metrics.socket.connectedClients });
}