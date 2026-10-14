/**
 * 聊天接口的核心逻辑。只依赖 Web 标准的 Request / Response，因此可以在三个地方运行：
 * - 网页版：Next.js 的 /api 路由（服务端）
 * - 桌面版：Electron 主进程的 app:// 协议处理器
 * - 安卓版：WebView 里直接运行（拦截对 /api 的 fetch）
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatMessagePayload, ChatRequestBody, ProviderId, ServerConfig, StreamEvent } from "../types";

export const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

const DEFAULT_MAX_TOKENS = 32000;

/** 一次请求里附件（图片 + 文件）的总大小上限，略低于 Anthropic 的 32MB 请求上限 */
const MAX_ATTACHMENT_CHARS = 30 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** 这些模型在 Anthropic 官方接口上支持服务端拒答降级（fallbacks: "default"） */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export interface ApiEnv {
  /** 服务器上预置的 Key（只有网页版服务端会配置） */
  serverKeys?: Partial<Record<ProviderId, { apiKey?: string; baseUrl?: string; models?: string[] }>>;
  /** 使用服务器 Key 时需要的访问密码 */
  accessCode?: string;
  /** 在浏览器 / WebView 中直接调用模型接口 */
  browser?: boolean;
  /** 自定义 fetch，安卓版用它在跨域失败时改走原生网络请求 */
  fetch?: typeof fetch;
}

interface Credentials {
  apiKey: string;
  baseUrl: string;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function isProvider(value: unknown): value is ProviderId {
  return value === "openai" || value === "anthropic";
}

/** 与长度无关的字符串比较，避免通过响应时间猜测访问密码 */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function normalizeBaseUrl(provider: ProviderId, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, `接口地址格式不正确：${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "接口地址必须以 http:// 或 https:// 开头");
  }
  let base = url.toString().replace(/\/+$/, "");
  if (provider === "openai") {
    // 用户有时会把完整的 /chat/completions 地址粘贴进来
    base = base.replace(/\/chat\/completions$/, "");
  } else {
    // Anthropic SDK 会自己拼接 /v1/messages
    base = base.replace(/\/v1\/messages$/, "").replace(/\/v1$/, "");
  }
  return base;
}

/**
 * 选择本次请求使用的凭证：
 * - 用户填写了 Key：使用用户自己的 Key 和接口地址；
 * - 否则使用服务器预置的 Key。此时忽略用户传来的接口地址，以免服务器 Key 被发送到任意第三方地址。
 */
function resolveCredentials(
  provider: ProviderId,
  input: { apiKey?: string; baseUrl?: string },
  accessCode: string | null,
  env: ApiEnv,
): Credentials {
  const userKey = input.apiKey?.trim();
  if (userKey) {
    return { apiKey: userKey, baseUrl: normalizeBaseUrl(provider, input.baseUrl?.trim() || DEFAULT_BASE_URL[provider]) };
  }
  const server = env.serverKeys?.[provider];
  if (!server?.apiKey) {
    const name = provider === "openai" ? "OpenAI 兼容接口" : "Anthropic";
    throw new HttpError(401, `还没有配置 ${name} 的 API Key，请在「设置 → 模型服务」中填写。`);
  }
  if (env.accessCode && !safeEqual(accessCode ?? "", env.accessCode)) {
    throw new HttpError(401, "访问密码错误，请在「设置 → 模型服务」中填写正确的访问密码。");
  }
  return { apiKey: server.apiKey, baseUrl: normalizeBaseUrl(provider, server.baseUrl || DEFAULT_BASE_URL[provider]) };
}

/** 把上游 SDK 抛出的错误转换为对用户友好的中文提示 */
function describeError(err: unknown, baseUrl?: string): HttpError {
  if (err instanceof HttpError) return err;
  if (err instanceof Anthropic.APIConnectionError || err instanceof OpenAI.APIConnectionError) {
    return new HttpError(502, `无法连接到模型服务${baseUrl ? `（${baseUrl}）` : ""}，请检查接口地址和网络。`);
  }
  if (err instanceof Anthropic.APIError || err instanceof OpenAI.APIError) {
    const status = typeof err.status === "number" ? err.status : 502;
    const hint =
      status === 401 || status === 403
        ? "API Key 无效或没有权限"
        : status === 404
          ? "模型不存在，或接口地址填写有误"
          : status === 429
            ? "请求过于频繁，或账户额度不足"
            : status >= 500
              ? "模型服务暂时不可用"
              : "请求失败";
    const body = err.error as { error?: { message?: string }; message?: string } | undefined;
    return new HttpError(status, `${hint}（${status}）：${body?.error?.message ?? body?.message ?? err.message}`);
  }
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

function sdkOptions(creds: Credentials, env: ApiEnv) {
  return {
    apiKey: creds.apiKey,
    baseURL: creds.baseUrl,
    maxRetries: 1,
    dangerouslyAllowBrowser: env.browser,
    ...(env.fetch ? { fetch: env.fetch } : {}),
  };
}

type Emit = (event: StreamEvent) => void;

/**
 * 向上游发起流式请求。返回的函数负责把流里的增量逐条交给 emit。
 * 拆成两步是为了让鉴权、模型不存在等错误在响应开始前就以 HTTP 状态码返回。
 */
async function openOpenAI(body: ChatRequestBody, creds: Credentials, env: ApiEnv, signal: AbortSignal) {
  const client = new OpenAI(sdkOptions(creds, env));
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const m of body.messages) messages.push(toOpenAIMessage(m));

  const stream = await client.chat.completions.create({ model: body.model, messages, stream: true }, { signal });

  return async (emit: Emit) => {
    let stopReason: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta as { content?: string | null; reasoning_content?: string; reasoning?: string };
      // DeepSeek / 通义千问用 reasoning_content，OpenRouter / Ollama 用 reasoning
      const reasoning = delta?.reasoning_content ?? delta?.reasoning;
      if (reasoning) emit({ type: "reasoning", text: reasoning });
      if (delta?.content) emit({ type: "text", text: delta.content });
      if (choice.finish_reason) stopReason = choice.finish_reason;
    }
    emit({ type: "done", stopReason });
  };
}

/** 文件统一转成文字放进消息里，这样不支持文件输入的模型（DeepSeek、通义千问等）也能读取 */
function filesAsText(m: ChatMessagePayload): string {
  return (m.files ?? [])
    .map((f) => {
      const text = f.text.trim() || "（这个文件没有可提取的文字，可能是扫描件或纯图片）";
      return `<file name="${f.name.replace(/"/g, "'")}">\n${text}\n</file>`;
    })
    .join("\n\n");
}

function toOpenAIMessage(m: ChatMessagePayload): OpenAI.Chat.ChatCompletionMessageParam {
  if (m.role === "assistant") return { role: "assistant", content: m.content };
  const text = [filesAsText(m), m.content].filter((s) => s.trim()).join("\n\n");
  // 没有图片时用纯文本，兼容只支持字符串 content 的服务商
  if (!m.images?.length) return { role: "user", content: text };
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
  if (text) parts.push({ type: "text", text });
  for (const img of m.images) parts.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
  return { role: "user", content: parts };
}

type AnthropicContent = Anthropic.Beta.Messages.BetaContentBlockParam[];

function toAnthropicMessage(m: ChatMessagePayload): Anthropic.Beta.Messages.BetaMessageParam {
  if (m.role === "assistant" || (!m.images?.length && !m.files?.length)) return { role: m.role, content: m.content };
  // 按官方建议，文档和图片放在文字前面
  const blocks: AnthropicContent = [];
  for (const f of m.files ?? []) {
    blocks.push(
      f.pdf
        ? { type: "document", title: f.name, source: { type: "base64", media_type: "application/pdf", data: f.pdf } }
        : { type: "document", title: f.name, source: { type: "text", media_type: "text/plain", data: f.text.trim() || "（空文件）" } },
    );
  }
  for (const img of m.images ?? []) {
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: img.data },
    });
  }
  if (m.content.trim()) blocks.push({ type: "text", text: m.content });
  return { role: "user", content: blocks };
}

async function openAnthropic(body: ChatRequestBody, creds: Credentials, env: ApiEnv, signal: AbortSignal) {
  const client = new Anthropic(sdkOptions(creds, env));
  const official = new URL(creds.baseUrl).hostname === "api.anthropic.com";
  // 官方接口上为支持的模型开启服务端拒答降级：被安全策略拒绝时自动换模型重试
  const fallback = official && FALLBACK_MODELS.has(body.model);

  const stream = await client.beta.messages.create(
    {
      model: body.model,
      max_tokens: body.maxTokens && body.maxTokens > 0 ? Math.floor(body.maxTokens) : DEFAULT_MAX_TOKENS,
      ...(body.system ? { system: body.system } : {}),
      messages: body.messages.map(toAnthropicMessage),
      stream: true,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );

  return async (emit: Emit) => {
    let stopReason: string | null = null;
    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start":
          // 发生了降级：被拒绝的模型此前输出的部分内容需要丢弃
          if (event.content_block.type === "fallback") emit({ type: "reset" });
          break;
        case "content_block_delta":
          if (event.delta.type === "text_delta") emit({ type: "text", text: event.delta.text });
          else if (event.delta.type === "thinking_delta" && event.delta.thinking)
            emit({ type: "reasoning", text: event.delta.thinking });
          break;
        case "message_delta":
          if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
          break;
      }
    }
    if (stopReason === "refusal") {
      emit({ type: "reset" });
      emit({ type: "error", message: "这个请求被模型的安全策略拒绝了，换个问法再试试吧。" });
      return;
    }
    emit({ type: "done", stopReason });
  };
}

function jsonError(err: HttpError) {
  return Response.json({ error: err.message }, { status: err.status });
}

function parseChatBody(raw: unknown): ChatRequestBody {
  const body = raw as Partial<ChatRequestBody> | null;
  if (!body || !isProvider(body.provider)) throw new HttpError(400, "缺少或不支持的 provider");
  if (typeof body.model !== "string" || !body.model.trim()) throw new HttpError(400, "请先选择一个模型");
  if (!Array.isArray(body.messages) || body.messages.length === 0) throw new HttpError(400, "消息不能为空");
  let attachmentChars = 0;
  for (const m of body.messages) {
    if ((m?.role !== "user" && m?.role !== "assistant") || typeof m.content !== "string") {
      throw new HttpError(400, "消息格式不正确");
    }
    if ((m.images !== undefined && !Array.isArray(m.images)) || (m.files !== undefined && !Array.isArray(m.files))) {
      throw new HttpError(400, "附件格式不正确");
    }
    for (const img of m.images ?? []) {
      if (!IMAGE_TYPES.has(img?.mimeType) || typeof img.data !== "string") throw new HttpError(400, "不支持的图片格式");
      attachmentChars += img.data.length;
    }
    for (const f of m.files ?? []) {
      if (typeof f?.name !== "string" || typeof f.text !== "string" || (f.pdf !== undefined && typeof f.pdf !== "string")) {
        throw new HttpError(400, "文件格式不正确");
      }
      attachmentChars += f.text.length + (f.pdf?.length ?? 0);
    }
  }
  if (attachmentChars > MAX_ATTACHMENT_CHARS) {
    throw new HttpError(413, "这次对话里的图片和文件总共太大了（超过约 30MB），请新开一个对话或减少附件。");
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

/** POST /api/chat：以 NDJSON 流的形式返回模型输出 */
export async function handleChat(req: Request, env: ApiEnv): Promise<Response> {
  let body: ChatRequestBody;
  let creds: Credentials;
  try {
    body = parseChatBody(await req.json().catch(() => null));
    creds = resolveCredentials(body.provider, body, req.headers.get("x-access-code"), env);
  } catch (err) {
    return jsonError(describeError(err));
  }

  // 前端停止生成或断开连接时取消上游请求
  const upstream = new AbortController();
  if (req.signal.aborted) upstream.abort();
  req.signal.addEventListener("abort", () => upstream.abort());

  let pump: (emit: Emit) => Promise<void>;
  try {
    pump =
      body.provider === "openai"
        ? await openOpenAI(body, creds, env, upstream.signal)
        : await openAnthropic(body, creds, env, upstream.signal);
  } catch (err) {
    return jsonError(describeError(err, creds.baseUrl));
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // 读取方已关闭
        }
      };
      try {
        await pump(emit);
      } catch (err) {
        if (!upstream.signal.aborted) emit({ type: "error", message: describeError(err, creds.baseUrl).message });
      } finally {
        try {
          controller.close();
        } catch {
          // 已关闭
        }
      }
    },
    cancel() {
      upstream.abort();
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

/** POST /api/models：获取服务商的模型列表，同时也用于测试连接 */
export async function handleModels(req: Request, env: ApiEnv): Promise<Response> {
  let baseUrl: string | undefined;
  try {
    const body = (await req.json().catch(() => null)) as { provider?: unknown; apiKey?: string; baseUrl?: string } | null;
    if (!body || !isProvider(body.provider)) throw new HttpError(400, "缺少或不支持的 provider");
    const creds = resolveCredentials(body.provider, body, req.headers.get("x-access-code"), env);
    baseUrl = creds.baseUrl;
    const options = { ...sdkOptions(creds, env), timeout: 20_000 };
    const ids: string[] = [];
    if (body.provider === "openai") {
      for await (const m of new OpenAI(options).models.list()) ids.push(m.id);
    } else {
      for await (const m of new Anthropic(options).models.list()) ids.push(m.id);
    }
    return Response.json({ models: [...new Set(ids)].sort() });
  } catch (err) {
    return jsonError(describeError(err, baseUrl));
  }
}

/** GET /api/config：告诉前端服务器是否预置了 Key */
export function handleConfig(env: ApiEnv): Response {
  const provider = (id: ProviderId) => ({
    serverKey: Boolean(env.serverKeys?.[id]?.apiKey),
    models: env.serverKeys?.[id]?.models ?? [],
  });
  const config: ServerConfig = {
    accessCodeRequired: Boolean(env.accessCode),
    providers: { openai: provider("openai"), anthropic: provider("anthropic") },
  };
  return Response.json(config);
}

/** 按路径分发 /api 请求 */
export async function routeApi(req: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/chat" && req.method === "POST") return handleChat(req, env);
  if (pathname === "/api/models" && req.method === "POST") return handleModels(req, env);
  if (pathname === "/api/config") return handleConfig(env);
  return Response.json({ error: "Not found" }, { status: 404 });
}
