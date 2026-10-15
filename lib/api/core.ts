/**
 * 聊天接口的核心逻辑。只依赖 Web 标准的 Request / Response，因此可以在三个地方运行：
 * - 网页版：Next.js 的 /api 路由（服务端）
 * - 桌面版：Electron 主进程的 app:// 协议处理器
 * - 安卓版：WebView 里直接运行（拦截对 /api 的 fetch）
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatMessagePayload, ChatRequestBody, ProviderId, SearchService, ServerConfig, Source, StreamEvent } from "../types";
import { formatResults, SEARCH_NAMES, webSearch } from "./search";

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
  /** 服务器上预置的搜索服务 Key */
  searchKeys?: Partial<Record<SearchService, string>>;
  /** 自定义搜索服务地址（自建代理或测试用） */
  searchEndpoints?: Partial<Record<SearchService, string>>;
}

/** 本次请求实际使用的联网搜索方式 */
type SearchPlan = { mode: "native" } | { mode: "service"; service: SearchService; apiKey: string };

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

/** 较新的模型支持带动态过滤的搜索工具，其余模型使用基础版本 */
function anthropicSearchTool(model: string) {
  const dynamic = /^claude-(opus-(5|4-[6-9])|sonnet-(5|4-6))(\b|-)/.test(model);
  return { type: dynamic ? ("web_search_20260209" as const) : ("web_search_20250305" as const), name: "web_search" as const, max_uses: 5 };
}

const NATIVE_SEARCH_PROMPT =
  "联网搜索：用户打开了联网搜索。回答前请先使用 web_search 工具搜索最新信息（可以多次搜索不同关键词），再基于搜索结果作答。";

/** pause_turn 时最多续接的次数 */
const MAX_CONTINUATIONS = 3;

async function openAnthropic(body: ChatRequestBody, creds: Credentials, env: ApiEnv, signal: AbortSignal, nativeSearch = false) {
  const client = new Anthropic(sdkOptions(creds, env));
  const official = new URL(creds.baseUrl).hostname === "api.anthropic.com";
  // 官方接口上为支持的模型开启服务端拒答降级：被安全策略拒绝时自动换模型重试
  const fallback = official && FALLBACK_MODELS.has(body.model);
  const system = [body.system, nativeSearch ? NATIVE_SEARCH_PROMPT : ""].filter(Boolean).join("\n\n");
  const messages = body.messages.map(toAnthropicMessage);

  const open = () => {
    const stream = client.beta.messages.stream(
      {
        model: body.model,
        max_tokens: body.maxTokens && body.maxTokens > 0 ? Math.floor(body.maxTokens) : DEFAULT_MAX_TOKENS,
        ...(system ? { system } : {}),
        messages,
        ...(nativeSearch ? { tools: [anthropicSearchTool(body.model)] } : {}),
        ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      },
      { signal },
    );
    return { stream, iterator: stream[Symbol.asyncIterator]() };
  };

  // 先读到第一个事件，鉴权失败、模型不存在等错误就能以 HTTP 状态码返回
  let current = open();
  let first = await current.iterator.next();

  return async (emit: Emit) => {
    // 参考来源编号：url → [n]
    const sourceNums = new Map<string, number>();
    const addSources = (items: Source[]) => {
      const fresh = items.filter((it) => it.url && !sourceNums.has(it.url));
      for (const it of fresh) sourceNums.set(it.url, sourceNums.size + 1);
      if (fresh.length) emit({ type: "sources", sources: fresh });
    };

    let stopReason: string | null = null;
    for (let round = 0; ; round++) {
      // 每个内容块的临时状态：搜索关键词的 JSON、正文引用的来源
      const toolInput = new Map<number, string>();
      const cited = new Map<number, Set<number>>();
      let result = first;
      while (!result.done) {
        const event = result.value;
        switch (event.type) {
          case "content_block_start": {
            const block = event.content_block;
            // 发生了降级：被拒绝的模型此前输出的部分内容需要丢弃
            if (block.type === "fallback") emit({ type: "reset" });
            else if (block.type === "server_tool_use" && block.name === "web_search") toolInput.set(event.index, "");
            else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
              addSources(block.content.map((r) => ({ title: r.title || r.url, url: r.url, ...(r.page_age ? { date: r.page_age } : {}) })));
            }
            break;
          }
          case "content_block_delta": {
            const delta = event.delta;
            if (delta.type === "text_delta") emit({ type: "text", text: delta.text });
            else if (delta.type === "thinking_delta" && delta.thinking) emit({ type: "reasoning", text: delta.thinking });
            else if (delta.type === "input_json_delta" && toolInput.has(event.index)) {
              toolInput.set(event.index, toolInput.get(event.index)! + delta.partial_json);
            } else if (delta.type === "citations_delta" && delta.citation.type === "web_search_result_location") {
              const { url, title } = delta.citation;
              if (!sourceNums.has(url)) addSources([{ title: title || url, url }]);
              if (!cited.has(event.index)) cited.set(event.index, new Set());
              cited.get(event.index)!.add(sourceNums.get(url)!);
            }
            break;
          }
          case "content_block_stop": {
            const json = toolInput.get(event.index);
            if (json !== undefined) {
              try {
                const query = (JSON.parse(json || "{}") as { query?: string }).query;
                if (query) emit({ type: "search", query });
              } catch {
                // 关键词解析失败不影响回答
              }
              toolInput.delete(event.index);
            }
            // 一段引用了来源的文字结束后，在后面标上来源编号
            const nums = cited.get(event.index);
            if (nums?.size) emit({ type: "text", text: [...nums].sort((a, b) => a - b).map((n) => `[${n}]`).join("") });
            break;
          }
          case "message_delta":
            if (event.delta.stop_reason) stopReason = event.delta.stop_reason;
            break;
        }
        result = await current.iterator.next();
      }

      // 服务端的搜索循环到达上限时会暂停，把已生成的内容原样发回去即可继续
      if (stopReason === "pause_turn" && round < MAX_CONTINUATIONS) {
        const paused = await current.stream.finalMessage();
        messages.push({ role: "assistant", content: paused.content as unknown as AnthropicContent });
        current = open();
        first = await current.iterator.next();
        stopReason = null;
        continue;
      }
      break;
    }

    if (stopReason === "refusal") {
      emit({ type: "reset" });
      emit({ type: "error", message: "这个请求被模型的安全策略拒绝了，换个问法再试试吧。" });
      return;
    }
    emit({ type: "done", stopReason });
  };
}

// ---------------- 通用搜索服务 ----------------

const SERVICE_SEARCH_PROMPT =
  "联网搜索：用户打开了联网搜索，最新一条消息开头附带了搜索结果（<search_results>）。请优先依据搜索结果回答，" +
  "在用到某条结果的句子后用 [1]、[2] 这样的编号标注来源（编号与搜索结果一致，不要编造编号）；" +
  "如果搜索结果与问题无关或不够，请直接说明，并结合自己的知识回答。";

function resolveSearch(body: ChatRequestBody, accessCode: string | null, env: ApiEnv): SearchPlan | null {
  const ws = body.webSearch;
  if (!ws) return null;
  if (ws.mode === "native" && body.provider === "anthropic") return { mode: "native" };
  const service: SearchService = ws.service === "bocha" ? "bocha" : "tavily";
  const userKey = ws.apiKey?.trim();
  if (userKey) return { mode: "service", service, apiKey: userKey };
  const serverKey = env.searchKeys?.[service];
  if (!serverKey) {
    throw new HttpError(400, `联网搜索需要先在「设置 → 联网搜索」中填写${SEARCH_NAMES[service]}的 API Key。`);
  }
  if (env.accessCode && !safeEqual(accessCode ?? "", env.accessCode)) {
    throw new HttpError(401, "访问密码错误，请在「设置 → 模型服务」中填写正确的访问密码。");
  }
  return { mode: "service", service, apiKey: serverKey };
}

/** 有上下文的追问（例如「那明天呢？」）先让模型改写成适合搜索引擎的关键词 */
async function rewriteQuery(body: ChatRequestBody, creds: Credentials, env: ApiEnv, signal: AbortSignal): Promise<string | null> {
  const recent = body.messages
    .slice(-6)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content.slice(0, 500)}`)
    .join("\n");
  const prompt = `${recent}\n\n根据以上对话，为用户最后一个问题写一条适合搜索引擎的查询语句（不超过 30 个字），只输出查询语句本身，不要任何解释。`;
  const timeout = AbortSignal.any([signal, AbortSignal.timeout(20_000)]);
  let text = "";
  if (body.provider === "openai") {
    const res = await new OpenAI(sdkOptions(creds, env)).chat.completions.create(
      { model: body.model, messages: [{ role: "user", content: prompt }] },
      { signal: timeout },
    );
    text = res.choices?.[0]?.message?.content ?? "";
  } else {
    const res = await new Anthropic(sdkOptions(creds, env)).messages.create(
      { model: body.model, max_tokens: 2000, messages: [{ role: "user", content: prompt }] },
      { signal: timeout },
    );
    text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
  const query = text.split("\n").map((l) => l.trim()).find(Boolean)?.replace(/^["'“”「」]+|["'“”「」]+$/g, "");
  return query ? query.slice(0, 200) : null;
}

/** 先搜索，再把结果放进最后一条用户消息里 */
async function applyServiceSearch(
  body: ChatRequestBody,
  plan: Extract<SearchPlan, { mode: "service" }>,
  creds: Credentials,
  env: ApiEnv,
  signal: AbortSignal,
  emit: Emit,
) {
  const last = body.messages[body.messages.length - 1];
  if (!last || last.role !== "user" || !last.content.trim()) return;
  let query = last.content.trim().slice(0, 200);
  if (body.messages.filter((m) => m.role === "user").length > 1) {
    query = (await rewriteQuery(body, creds, env, signal).catch(() => null)) ?? query;
  }
  emit({ type: "search", query });
  const hits = await webSearch(plan.service, plan.apiKey, query, {
    fetch: env.fetch,
    signal,
    endpoint: env.searchEndpoints?.[plan.service],
  });
  if (hits.length) emit({ type: "sources", sources: hits.map(({ title, url, date }) => ({ title, url, ...(date ? { date } : {}) })) });
  last.content = `${formatResults(query, hits)}\n\n${last.content}`;
  body.system = [body.system, SERVICE_SEARCH_PROMPT].filter(Boolean).join("\n\n");
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
    webSearch:
      body.webSearch && typeof body.webSearch === "object"
        ? {
            mode: body.webSearch.mode === "native" ? "native" : "service",
            service: body.webSearch.service === "bocha" ? "bocha" : "tavily",
            apiKey: typeof body.webSearch.apiKey === "string" ? body.webSearch.apiKey : undefined,
          }
        : undefined,
  };
}

/** POST /api/chat：以 NDJSON 流的形式返回模型输出 */
export async function handleChat(req: Request, env: ApiEnv): Promise<Response> {
  let body: ChatRequestBody;
  let creds: Credentials;
  let search: SearchPlan | null;
  try {
    body = parseChatBody(await req.json().catch(() => null));
    const accessCode = req.headers.get("x-access-code");
    creds = resolveCredentials(body.provider, body, accessCode, env);
    search = resolveSearch(body, accessCode, env);
  } catch (err) {
    return jsonError(describeError(err));
  }

  // 前端停止生成或断开连接时取消上游请求
  const upstream = new AbortController();
  if (req.signal.aborted) upstream.abort();
  req.signal.addEventListener("abort", () => upstream.abort());

  const openModel = () =>
    body.provider === "openai"
      ? openOpenAI(body, creds, env, upstream.signal)
      : openAnthropic(body, creds, env, upstream.signal, search?.mode === "native");

  // 不需要先搜索时，在返回响应前就连上模型，错误可以直接以 HTTP 状态码返回；
  // 需要先搜索时，搜索进度要通过流告诉前端，所以在流里依次完成搜索和请求模型
  let pump: ((emit: Emit) => Promise<void>) | null = null;
  if (search?.mode !== "service") {
    try {
      pump = await openModel();
    } catch (err) {
      return jsonError(describeError(err, creds.baseUrl));
    }
  }
  const run = async (emit: Emit) => {
    if (!pump && search?.mode === "service") {
      await applyServiceSearch(body, search, creds, env, upstream.signal, emit);
      pump = await openModel();
    }
    await pump!(emit);
  };

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
        await run(emit);
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

/** POST /api/search：测试搜索服务是否可用 */
export async function handleSearch(req: Request, env: ApiEnv): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as { service?: string; apiKey?: string; query?: string } | null;
    const service: SearchService = body?.service === "bocha" ? "bocha" : "tavily";
    const plan = resolveSearch(
      { provider: "openai", model: "-", messages: [], webSearch: { mode: "service", service, apiKey: body?.apiKey } },
      req.headers.get("x-access-code"),
      env,
    ) as Extract<SearchPlan, { mode: "service" }>;
    const hits = await webSearch(service, plan.apiKey, (body?.query || "今天的新闻").slice(0, 200), {
      fetch: env.fetch,
      endpoint: env.searchEndpoints?.[service],
      signal: AbortSignal.timeout(20_000),
    });
    return Response.json({ results: hits.map(({ title, url, date }) => ({ title, url, date })) });
  } catch (err) {
    const e = describeError(err);
    return jsonError(e.status === 500 ? new HttpError(502, e.message) : e);
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
    search: { tavily: Boolean(env.searchKeys?.tavily), bocha: Boolean(env.searchKeys?.bocha) },
  };
  return Response.json(config);
}

/** 按路径分发 /api 请求 */
export async function routeApi(req: Request, env: ApiEnv): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname === "/api/chat" && req.method === "POST") return handleChat(req, env);
  if (pathname === "/api/models" && req.method === "POST") return handleModels(req, env);
  if (pathname === "/api/search" && req.method === "POST") return handleSearch(req, env);
  if (pathname === "/api/config") return handleConfig(env);
  return Response.json({ error: "Not found" }, { status: 404 });
}
