import crypto from "crypto";

// Canonicalization and content hashing for off-chain proof.
// What: Stable JSON string with sorted keys and normalized numeric types, then SHA-256 for MVP.
// Why: Deterministic hash independent of property order or float precision quirks; no external deps.
export function toLatE7(lat) {
  return Math.round(Number(lat) * 1e7);
}

export function toLonE7(lon) {
  return Math.round(Number(lon) * 1e7);
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        out[k] = sortObject(value[k]);
      });
    return out;
  }
  return value;
}

export function canonicalize(payload) {
  // Enforce primitive types and then lexicographically sort keys for stability
  const normalized = {
    occurredAt: String(payload.occurredAt),
    latE7: Number(payload.latE7),
    lonE7: Number(payload.lonE7),
    accuracyM: Number(payload.accuracyM),
    geohash5: String(payload.geohash5),
    topicId: String(payload.topicId),
    taskId: String(payload.taskId),
    userPubkey: payload.userPubkey ? String(payload.userPubkey) : "anonymous",
    nonce: String(payload.nonce),
    ipCountry: payload.ipCountry ? String(payload.ipCountry) : "",
    ipCity: payload.ipCity ? String(payload.ipCity) : "",
    venueTokenId: payload.venueTokenId ? String(payload.venueTokenId) : "",
  };
  const sorted = sortObject(normalized);
  return JSON.stringify(sorted);
}

export function computeContentHash(canonicalJson) {
  const h = crypto.createHash("sha256").update(Buffer.from(canonicalJson, "utf8")).digest("hex");
  return "0x" + h;
}
