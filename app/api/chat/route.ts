import { describeError, HttpError, isProvider, openChatStream, resolveCredentials } from "@/lib/server";
import type { ChatRequestBody, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function jsonError(err: HttpError) {
  return Response.json({ error: err.message }, { status: err.status });
}

function parseBody(raw: unknown): ChatRequestBody {
  const body = raw as Partial<ChatRequestBody> | null;
  if (!body || !isProvider(body.provider)) throw new HttpError(400, "缺少或不支持的 provider");
  if (typeof body.model !== "string" || !body.model.trim()) throw new HttpError(400, "请先选择一个模型");
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, "消息不能为空");
  for (const m of body.messages) {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m.content !== "string") {
      throw new HttpError(400, "消息格式不正确");
    }
  }
  return {
    provider: body.provider,
    model: body.model.trim(),
    system: typeof body.system === "string" ? body.system : undefined,
    messages: body.messages,
    apiKey: typeof body.apiKey === "string" ? body.apiKey : undefined,
    baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
    maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
  };
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  let creds: { apiKey: string; baseUrl: string };
  try {
    body = parseBody(await req.json().catch(() => null));
    creds = resolveCredentials(body.provider, body, req.headers.get("x-access-code"));
  } catch (err) {
    return jsonError(describeError(err));
  }

  // 前端点击「停止生成」或关闭页面时，req.signal 会被触发，上游请求随之取消
  let pump: Awaited<ReturnType<typeof openChatStream>>;
  try {
    pump = await openChatStream(body, creds, req.signal);
  } catch (err) {
    return jsonError(describeError(err, creds.baseUrl));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await pump(emit);
      } catch (err) {
        if (!req.signal.aborted) emit({ type: "error", message: describeError(err, creds.baseUrl).message });
      } finally {
        try {
          controller.close();
        } catch {
          // 客户端已断开
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
