import { handleConfig } from "@/lib/api/core";
import { serverEnv } from "@/lib/api/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return handleConfig(serverEnv());
}
