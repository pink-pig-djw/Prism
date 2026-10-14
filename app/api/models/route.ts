import { describeError, HttpError, isProvider, listModels, resolveCredentials } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let baseUrl: string | undefined;
  try {
    const body = (await req.json().catch(() => null)) as { provider?: unknown; apiKey?: string; baseUrl?: string } | null;
    if (!body || !isProvider(body.provider)) throw new HttpError(400, "缺少或不支持的 provider");
    const creds = resolveCredentials(body.provider, body, req.headers.get("x-access-code"));
    baseUrl = creds.baseUrl;
    const models = await listModels(body.provider, creds);
    return Response.json({ models: [...new Set(models)].sort() });
  } catch (err) {
    const e = describeError(err, baseUrl);
    return Response.json({ error: e.message }, { status: e.status });
  }
}
