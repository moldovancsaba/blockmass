export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import crypto from "crypto";
import { dbConnect } from "@/app/_lib/db";
import EventModel from "@/app/_models/Event";
import Nonce from "@/app/_models/Nonce";
import { toGeohash5 } from "@/app/_lib/geo/geohash5";
import { canonicalize, computeContentHash, toLatE7, toLonE7 } from "@/app/_lib/hash/canonicalEvent";

function bad(message) {
  return new NextResponse(JSON.stringify({ ok: false, error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request) {
  await dbConnect();

  const body = await request.json().catch(() => null);
  if (!body) return bad("invalid json");

  const { topicId, taskId, occurredAt, lat, lon, accuracyM, nonce, userPubkey, userSig, venueTokenId } = body;

  if (!topicId || !taskId || !occurredAt || typeof lat !== "number" || typeof lon !== "number" || typeof accuracyM !== "number" || !nonce) {
    return bad("missing fields");
  }

  const n = await Nonce.findOne({ value: nonce }).lean();
  if (!n) return bad("nonce not found");
  if (n.used) return bad("nonce used");
  if (new Date(n.expiresAt).getTime() < Date.now()) return bad("nonce expired");

  const latE7 = toLatE7(lat);
  const lonE7 = toLonE7(lon);
  const geohash5 = toGeohash5(lat, lon);

  const h = await headers();
  const ipCountry = h.get("x-vercel-ip-country") || "";
  const ipCity = h.get("x-vercel-ip-city") || "";

  const canonicalJson = canonicalize({
    occurredAt,
    latE7,
    lonE7,
    accuracyM,
    geohash5,
    topicId,
    taskId,
    userPubkey: userPubkey ? String(userPubkey) : "anonymous",
    nonce,
    ipCountry,
    ipCity,
    venueTokenId: venueTokenId ? String(venueTokenId) : "",
  });

  const contentHash = computeContentHash(canonicalJson);

  const eventId = crypto.randomUUID();
  await EventModel.create({
    _id: eventId,
    topicId,
    taskId,
    occurredAt,
    geo: { latE7, lonE7, geohash5, accuracyM },
    verification: {
      nonce,
      userSig: userSig || "",
      ipCountry,
      ipCity,
      ipOk: false,
      venueTokenId: venueTokenId || "",
      venueOk: false,
    },
    contentHash,
    anchor: { status: "queued", txHash: "", blockNumber: null, usedEndpoint: "" },
  });

  await Nonce.updateOne({ value: nonce }, { $set: { used: true } });

  // Broadcast to connected clients via Socket.IO if initialized
  globalThis._io?.emit("event:new", {
    id: eventId,
    topicId,
    taskId,
    occurredAt,
    geohash5,
    accuracyM,
    contentHash,
  });

  return new NextResponse(
    JSON.stringify({ ok: true, eventId, contentHash }),
    { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
  );
}
