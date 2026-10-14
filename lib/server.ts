import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ChatRequestBody, ProviderId, ServerConfig, StreamEvent } from "./types";

export const DEFAULT_BASE_URL: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com",
};

const DEFAULT_MAX_TOKENS = 32000;

/** 这些模型在 Anthropic 官方接口上支持服务端拒答降级（fallbacks: "default"） */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

const ENV_KEY: Record<ProviderId, string> = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY" };
const ENV_BASE: Record<ProviderId, string> = { openai: "OPENAI_BASE_URL", anthropic: "ANTHROPIC_BASE_URL" };
const ENV_MODELS: Record<ProviderId, string> = { openai: "OPENAI_MODELS", anthropic: "ANTHROPIC_MODELS" };

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function isProvider(value: unknown): value is ProviderId {
  return value === "openai" || value === "anthropic";
}

function envList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getServerConfig(): ServerConfig {
  const provider = (id: ProviderId) => ({
    serverKey: Boolean(process.env[ENV_KEY[id]]?.trim()),
    models: envList(ENV_MODELS[id]),
  });
  return {
    accessCodeRequired: Boolean(process.env.ACCESS_CODE),
    providers: { openai: provider("openai"), anthropic: provider("anthropic") },
  };
}

function sameSecret(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
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
 * - 浏览器端填写了 Key：使用用户自己的 Key 和接口地址；
 * - 否则使用服务器环境变量里的 Key。此时忽略浏览器传来的接口地址，
 *   以免服务器 Key 被发送到任意第三方地址。
 */
export function resolveCredentials(
  provider: ProviderId,
  input: { apiKey?: string; baseUrl?: string },
  accessCode: string | null,
): { apiKey: string; baseUrl: string } {
  const userKey = input.apiKey?.trim();
  if (userKey) {
    return { apiKey: userKey, baseUrl: normalizeBaseUrl(provider, input.baseUrl?.trim() || DEFAULT_BASE_URL[provider]) };
  }
  const serverKey = process.env[ENV_KEY[provider]]?.trim();
  if (!serverKey) {
    const name = provider === "openai" ? "OpenAI 兼容接口" : "Anthropic";
    throw new HttpError(401, `还没有配置 ${name} 的 API Key，请在「设置 → 模型服务」中填写。`);
  }
  const expected = process.env.ACCESS_CODE;
  if (expected && !sameSecret(accessCode ?? "", expected)) {
    throw new HttpError(401, "访问密码错误，请在「设置 → 模型服务」中填写正确的访问密码。");
  }
  const base = process.env[ENV_BASE[provider]]?.trim() || DEFAULT_BASE_URL[provider];
  return { apiKey: serverKey, baseUrl: normalizeBaseUrl(provider, base) };
}

/** 把上游 SDK 抛出的错误转换为对用户友好的中文提示 */
export function describeError(err: unknown, baseUrl?: string): HttpError {
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
    return new HttpError(status, `${hint}（${status}）：${extractMessage(err)}`);
  }
  return new HttpError(500, err instanceof Error ? err.message : String(err));
}

function extractMessage(err: InstanceType<typeof Anthropic.APIError> | InstanceType<typeof OpenAI.APIError>): string {
  const body = err.error as { error?: { message?: string }; message?: string } | undefined;
  return body?.error?.message ?? body?.message ?? err.message;
}

type Emit = (event: StreamEvent) => void;

/**
 * 向上游发起流式请求。返回的函数负责把流里的增量逐条交给 emit。
 * 之所以拆成两步，是为了让鉴权、模型不存在等错误在响应开始前就以 HTTP 状态码返回。
 */
export async function openChatStream(
  body: ChatRequestBody,
  creds: { apiKey: string; baseUrl: string },
  signal: AbortSignal,
): Promise<(emit: Emit) => Promise<void>> {
  return body.provider === "openai" ? openOpenAI(body, creds, signal) : openAnthropic(body, creds, signal);
}

async function openOpenAI(
  body: ChatRequestBody,
  creds: { apiKey: string; baseUrl: string },
  signal: AbortSignal,
): Promise<(emit: Emit) => Promise<void>> {
  const client = new OpenAI({ apiKey: creds.apiKey, baseURL: creds.baseUrl, maxRetries: 1 });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (body.system) messages.push({ role: "system", content: body.system });
  for (const m of body.messages) messages.push({ role: m.role, content: m.content });

  const stream = await client.chat.completions.create({ model: body.model, messages, stream: true }, { signal });

  return async (emit) => {
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

async function openAnthropic(
  body: ChatRequestBody,
  creds: { apiKey: string; baseUrl: string },
  signal: AbortSignal,
): Promise<(emit: Emit) => Promise<void>> {
  const client = new Anthropic({ apiKey: creds.apiKey, baseURL: creds.baseUrl, maxRetries: 1 });
  const official = new URL(creds.baseUrl).hostname === "api.anthropic.com";
  // 官方接口上为支持的模型开启服务端拒答降级：被安全策略拒绝时自动换模型重试
  const fallback = official && FALLBACK_MODELS.has(body.model);

  const stream = await client.beta.messages.create(
    {
      model: body.model,
      max_tokens: body.maxTokens && body.maxTokens > 0 ? Math.floor(body.maxTokens) : DEFAULT_MAX_TOKENS,
      ...(body.system ? { system: body.system } : {}),
      messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );

  return async (emit) => {
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

export async function listModels(
  provider: ProviderId,
  creds: { apiKey: string; baseUrl: string },
): Promise<string[]> {
  const ids: string[] = [];
  if (provider === "openai") {
    const client = new OpenAI({ apiKey: creds.apiKey, baseURL: creds.baseUrl, maxRetries: 1, timeout: 20_000 });
    for await (const m of client.models.list()) ids.push(m.id);
  } else {
    const client = new Anthropic({ apiKey: creds.apiKey, baseURL: creds.baseUrl, maxRetries: 1, timeout: 20_000 });
    for await (const m of client.models.list()) ids.push(m.id);
  }
  return ids;
}
