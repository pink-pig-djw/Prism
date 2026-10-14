import { handleChat } from "@/lib/api/core";
import { serverEnv } from "@/lib/api/server-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export function POST(req: Request) {
  return handleChat(req, serverEnv());
}
