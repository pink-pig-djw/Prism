"use client";

import { deleteAttachments, loadPayloads, saveAttachments, type PreparedFile, type PreparedImage } from "./attachments";
import { attachmentIds, useStore } from "./store";
import type {
  ChatMessagePayload,
  ChatRequestBody,
  GPT,
  Message,
  ProviderId,
  SearchService,
  Settings,
  Source,
  StreamEvent,
  WebSearchOptions,
} from "./types";
import { uid } from "./utils";

export interface Attachments {
  images: PreparedImage[];
  files: PreparedFile[];
}

/** 每个对话当前正在进行的请求，用于「停止生成」 */
const controllers = new Map<string, AbortController>();

function credentials(provider: ProviderId, settings: Settings) {
  const p = settings.providers[provider];
  return {
    apiKey: p.apiKey.trim() || undefined,
    baseUrl: p.baseUrl.trim() || undefined,
    maxTokens: provider === "anthropic" ? p.maxTokens : undefined,
  };
}

/** 打开「联网」开关时，本次请求使用的搜索方式 */
function webSearchOptions(provider: ProviderId, settings: Settings): WebSearchOptions | undefined {
  const ws = settings.webSearch;
  if (!ws.enabled) return undefined;
  const mode = provider === "anthropic" && ws.claudeMode === "native" ? "native" : "service";
  return { mode, service: ws.service, apiKey: ws.keys[ws.service].trim() || undefined };
}

/** 调用 /api/chat 并逐行解析 NDJSON 流 */
async function streamChat(body: ChatRequestBody, signal: AbortSignal, onEvent: (event: StreamEvent) => void) {
  const accessCode = useStore.getState().settings.accessCode.trim();
  let res: Response;
  try {
    res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new Error("网络连接失败，请检查网络后重试。");
  }
  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `请求失败（${res.status}）`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (event.type === "done") finished = true;
    if (event.type === "error") throw new Error(event.message);
    onEvent(event);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        handle(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    handle(buffer);
  } catch (err) {
    reader.cancel().catch(() => {});
    throw err;
  }
  if (!finished && !signal.aborted) throw new Error("连接意外中断，回答可能不完整。");
}

function hasAttachments(m: Message) {
  return Boolean(m.images?.length || m.files?.length);
}

/** 把界面上的消息整理成模型接口需要的格式：跳过失败/空消息，合并相邻的同角色消息，读出附件数据 */
async function buildHistory(messages: Message[]): Promise<ChatMessagePayload[]> {
  const out: ChatMessagePayload[] = [];
  for (const m of messages) {
    if (m.status === "error" || m.status === "streaming") continue;
    const content = m.content.trim();
    const { images, files } = m.role === "user" ? await loadPayloads(m.images, m.files) : { images: [], files: [] };
    if (!content && !images.length && !files.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = [last.content, content].filter(Boolean).join("\n\n");
      if (images.length) last.images = [...(last.images ?? []), ...images];
      if (files.length) last.files = [...(last.files ?? []), ...files];
    } else {
      out.push({ role: m.role, content, ...(images.length ? { images } : {}), ...(files.length ? { files } : {}) });
    }
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** 只有附件、没有文字时，用附件名作为对话标题和标题生成的素材 */
function describeAttachments(m: Pick<Message, "images" | "files">) {
  const names = (m.files ?? []).map((f) => f.name);
  if (m.images?.length) names.push(m.images.length > 1 ? `${m.images.length} 张图片` : "图片");
  return names.join("、");
}

function buildSystem(gpt: GPT | undefined, settings: Settings): string {
  const date = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" });
  if (gpt) return [gpt.instructions.trim(), `当前日期：${date}`].filter(Boolean).join("\n\n");

  const parts = [
    "你是 Prism，一个聪明、友善、乐于助人的 AI 助手。请使用与用户相同的语言回答；需要时使用 Markdown 排版（标题、列表、表格），代码放在标注了语言的代码块中。",
    `当前日期：${date}`,
  ];
  const ci = settings.customInstructions;
  if (ci.enabled && ci.aboutUser.trim()) parts.push(`用户希望你了解的关于他们的信息：\n${ci.aboutUser.trim()}`);
  if (ci.enabled && ci.responseStyle.trim()) parts.push(`用户希望你采用的回复方式：\n${ci.responseStyle.trim()}`);
  return parts.join("\n\n");
}

export async function sendMessage(text: string, attachments: Attachments = { images: [], files: [] }) {
  const content = text.trim();
  const { images, files } = attachments;
  if (!content && !images.length && !files.length) return;
  const s = useStore.getState();
  let convId = s.activeId && s.conversations[s.activeId] ? s.activeId : null;
  if (convId && s.streaming[convId]) return;

  const userMessage: Message = { id: uid(), role: "user", content, createdAt: Date.now() };
  if (images.length) userMessage.images = images.map(({ id, mimeType, width, height }) => ({ id, mimeType, width, height }));
  if (files.length) userMessage.files = files.map(({ text: _text, pdf: _pdf, ...ref }) => ref);
  try {
    await saveAttachments(images, files);
  } catch {
    s.toast("保存附件失败，可能是设备存储空间不足", "error");
    return;
  }

  if (!convId) {
    const gpt = s.draftGptId ? s.gpts.find((g) => g.id === s.draftGptId) : undefined;
    convId = s.createConversation({
      model: gpt?.model ?? s.settings.defaultModel,
      gptId: gpt?.id,
      title: (content || describeAttachments(userMessage)).replace(/\s+/g, " ").slice(0, 40),
    });
  }
  s.setMessages(convId, (msgs) => [...msgs, userMessage]);
  await generate(convId);
}

export function stopGeneration(convId: string) {
  controllers.get(convId)?.abort();
}

/** 重新生成最后一条回答 */
export async function regenerate(convId: string) {
  const s = useStore.getState();
  stopGeneration(convId);
  s.setMessages(convId, (msgs) => {
    const out = [...msgs];
    while (out.length && out[out.length - 1].role === "assistant") out.pop();
    return out;
  });
  await generate(convId);
}

/** 编辑某条用户消息：保留它的附件，丢弃它之后的所有内容，用新内容重新提问 */
export async function editMessage(convId: string, msgId: string, text: string) {
  const content = text.trim();
  const s = useStore.getState();
  const original = s.conversations[convId]?.messages.find((m) => m.id === msgId);
  if (!content && !(original && hasAttachments(original))) return;
  stopGeneration(convId);
  s.setMessages(convId, (msgs) => {
    const idx = msgs.findIndex((m) => m.id === msgId);
    const kept = idx >= 0 ? msgs.slice(0, idx) : msgs;
    const edited: Message = { id: uid(), role: "user", content, createdAt: Date.now() };
    if (original?.images?.length) edited.images = original.images;
    if (original?.files?.length) edited.files = original.files;
    // 被丢弃的后续消息里的附件不再需要，从本地存储中删除
    const keep = new Set(attachmentIds([{ messages: [edited] }]));
    const dropped = attachmentIds([{ messages: idx >= 0 ? msgs.slice(idx) : [] }]).filter((id) => !keep.has(id));
    void deleteAttachments(dropped);
    return [...kept, edited];
  });
  await generate(convId);
}

async function generate(convId: string) {
  const s = useStore.getState();
  const conv = s.conversations[convId];
  if (!conv) return;
  const gpt = conv.gptId ? s.gpts.find((g) => g.id === conv.gptId) : undefined;
  const { provider, model } = conv.model;
  const history = await buildHistory(conv.messages);
  if (!history.length) return;
  const withImages = history.some((m) => m.images?.length);

  const assistant: Message = {
    id: uid(),
    role: "assistant",
    content: "",
    model,
    status: "streaming",
    createdAt: Date.now(),
  };
  s.setMessages(convId, (msgs) => [...msgs, assistant]);

  controllers.get(convId)?.abort();
  const controller = new AbortController();
  controllers.set(convId, controller);
  s.setStreaming(convId, true);

  // 增量先攒在本地，每 40ms 合并写一次 store，避免每个 token 都触发渲染
  let content = "";
  let reasoning = "";
  const searches: string[] = [];
  const sources: Source[] = [];
  const extra = () => ({
    reasoning: reasoning || undefined,
    searches: searches.length ? [...searches] : undefined,
    sources: sources.length ? [...sources] : undefined,
  });
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    useStore.getState().patchMessage(convId, assistant.id, { content, ...extra() });
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 40);
  };

  let ok = false;
  try {
    await streamChat(
      {
        provider,
        model,
        system: buildSystem(gpt, s.settings),
        messages: history,
        ...credentials(provider, s.settings),
        webSearch: webSearchOptions(provider, s.settings),
      },
      controller.signal,
      (event) => {
        if (event.type === "text") content += event.text;
        else if (event.type === "reasoning") reasoning += event.text;
        else if (event.type === "reset") content = reasoning = "";
        else if (event.type === "search") searches.push(event.query);
        else if (event.type === "sources") sources.push(...event.sources);
        schedule();
      },
    );
    ok = true;
  } catch (err) {
    if (!controller.signal.aborted) {
      if (timer) clearTimeout(timer);
      let error = err instanceof Error ? err.message : String(err);
      // 不支持识图的模型收到图片时通常只返回一个笼统的参数错误，补充一句提示
      if (withImages && !/API Key|访问密码|网络|连接/.test(error)) {
        error += "\n\n提示：如果当前模型不支持图片，请换一个支持识图的模型（例如 Claude、GPT-5.5、通义千问 VL）。";
      }
      useStore.getState().patchMessage(convId, assistant.id, { content, ...extra(), status: "error", error });
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (ok || controller.signal.aborted) {
      useStore.getState().patchMessage(convId, assistant.id, { content, ...extra(), status: ok ? "done" : "stopped" });
    }
    if (controllers.get(convId) === controller) {
      controllers.delete(convId);
      useStore.getState().setStreaming(convId, false);
    }
  }

  const latest = useStore.getState();
  if (ok && content.trim() && latest.settings.autoTitle && !latest.conversations[convId]?.titled) {
    void generateTitle(convId);
  }
}

/** 第一轮对话结束后，让模型生成一个简短标题 */
async function generateTitle(convId: string) {
  const s = useStore.getState();
  const conv = s.conversations[convId];
  if (!conv) return;
  const first = conv.messages.find((m) => m.role === "user");
  const question = [first?.content ?? "", first && hasAttachments(first) ? `（附件：${describeAttachments(first)}）` : ""]
    .filter(Boolean)
    .join("\n");
  const answer = conv.messages.find((m) => m.role === "assistant" && m.status === "done")?.content ?? "";
  s.updateConversation(convId, { titled: true });

  const prompt =
    "请为下面这段对话生成一个简短的标题，不超过 15 个字，概括主题即可，不要使用引号、书名号和句号，只输出标题本身。\n\n" +
    `用户：${question.slice(0, 600)}\n\n助手：${answer.slice(0, 600)}`;
  const { provider, model } = conv.model;
  let out = "";
  try {
    await streamChat(
      {
        provider,
        model,
        messages: [{ role: "user", content: prompt }],
        ...credentials(provider, s.settings),
        maxTokens: provider === "anthropic" ? 2000 : undefined,
      },
      AbortSignal.timeout(60_000),
      (event) => {
        if (event.type === "text") out += event.text;
        else if (event.type === "reset") out = "";
      },
    );
  } catch {
    return;
  }
  const title = out
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean)
    ?.replace(/^(标题|title)\s*[:：]\s*/i, "")
    .replace(/^[#*\s"'“”‘’「」《》]+|[*\s"'“”‘’「」《》。.!！]+$/g, "")
    .slice(0, 30);
  const current = useStore.getState().conversations[convId];
  // 期间用户手动改过标题的话就不覆盖
  if (title && current && current.title === conv.title) useStore.getState().updateConversation(convId, { title });
}

export async function fetchModels(provider: ProviderId): Promise<string[]> {
  const { settings } = useStore.getState();
  const accessCode = settings.accessCode.trim();
  const { apiKey, baseUrl } = credentials(provider, settings);
  const res = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify({ provider, apiKey, baseUrl }),
  });
  const data = (await res.json().catch(() => null)) as { models?: string[]; error?: string } | null;
  if (!res.ok || !data?.models) throw new Error(data?.error ?? `获取失败（${res.status}）`);
  return data.models;
}

/** 设置页里的「测试搜索」 */
export async function testSearch(service: SearchService): Promise<Source[]> {
  const { settings } = useStore.getState();
  const accessCode = settings.accessCode.trim();
  const res = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(accessCode ? { "x-access-code": accessCode } : {}) },
    body: JSON.stringify({ service, apiKey: settings.webSearch.keys[service].trim() || undefined, query: "今天的科技新闻" }),
  });
  const data = (await res.json().catch(() => null)) as { results?: Source[]; error?: string } | null;
  if (!res.ok || !data?.results) throw new Error(data?.error ?? `搜索失败（${res.status}）`);
  return data.results;
}
