import { handleModels } from "@/lib/api/core";
import { serverEnv } from "@/lib/api/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(req: Request) {
  return handleModels(req, serverEnv());
}
