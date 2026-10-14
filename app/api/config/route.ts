import { getServerConfig } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(getServerConfig());
}
