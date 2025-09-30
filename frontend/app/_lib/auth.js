/**
 * auth.js
 * What: Simple admin token verification from request headers.
 * Why: Protect admin-only endpoints without exposing secrets to the client.
 */
export function isAdminRequest(request) {
  const provided = request.headers.get("x-admin-token") || request.headers.get("X-Admin-Token");
  const expected = process.env.ADMIN_API_TOKEN;
  return Boolean(expected) && provided === expected;
}