import { chainHealth } from "@/app/_lib/chain";

export const runtime = "nodejs";

export async function GET() {
  const health = await chainHealth();
  return Response.json(health);
}
