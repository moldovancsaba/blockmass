/**
 * logger.js
 * What: Timestamped logger enforcing ISO 8601 with milliseconds (UTC).
 * Why: Consistent logs across server and scripts.
 */
export function log(level, message, meta = undefined) {
  const ts = new Date().toISOString();
  if (meta !== undefined) {
    console.log(JSON.stringify({ ts, level, message, meta }));
  } else {
    console.log(JSON.stringify({ ts, level, message }));
  }
}