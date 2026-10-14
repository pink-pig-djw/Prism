"use client";

import { useStore } from "./store";
import type { ChatRequestBody, GPT, Message, ProviderId, Role, Settings, StreamEvent } from "./types";
import { uid } from "./utils";

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

/** 把界面上的消息整理成模型接口需要的格式：跳过失败/空消息，合并相邻的同角色消息 */
function buildHistory(messages: Message[]): { role: Role; content: string }[] {
  const out: { role: Role; content: string }[] = [];
  for (const m of messages) {
    if (m.status === "error" || m.status === "streaming") continue;
    const content = m.content.trim();
    if (!content) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
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

export async function sendMessage(text: string) {
  const content = text.trim();
  if (!content) return;
  const s = useStore.getState();
  let convId = s.activeId && s.conversations[s.activeId] ? s.activeId : null;
  if (convId && s.streaming[convId]) return;
  if (!convId) {
    const gpt = s.draftGptId ? s.gpts.find((g) => g.id === s.draftGptId) : undefined;
    convId = s.createConversation({
      model: gpt?.model ?? s.settings.defaultModel,
      gptId: gpt?.id,
      title: content.replace(/\s+/g, " ").slice(0, 40),
    });
  }
  const userMessage: Message = { id: uid(), role: "user", content, createdAt: Date.now() };
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

/** 编辑某条用户消息：丢弃它之后的所有内容，用新内容重新提问 */
export async function editMessage(convId: string, msgId: string, text: string) {
  const content = text.trim();
  if (!content) return;
  const s = useStore.getState();
  stopGeneration(convId);
  s.setMessages(convId, (msgs) => {
    const idx = msgs.findIndex((m) => m.id === msgId);
    const kept = idx >= 0 ? msgs.slice(0, idx) : msgs;
    return [...kept, { id: uid(), role: "user", content, createdAt: Date.now() }];
  });
  await generate(convId);
}

async function generate(convId: string) {
  const s = useStore.getState();
  const conv = s.conversations[convId];
  if (!conv) return;
  const gpt = conv.gptId ? s.gpts.find((g) => g.id === conv.gptId) : undefined;
  const { provider, model } = conv.model;
  const history = buildHistory(conv.messages);
  if (!history.length) return;

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
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    timer = null;
    useStore.getState().patchMessage(convId, assistant.id, { content, reasoning: reasoning || undefined });
  };
  const schedule = () => {
    if (!timer) timer = setTimeout(flush, 40);
  };

  let ok = false;
  try {
    await streamChat(
      { provider, model, system: buildSystem(gpt, s.settings), messages: history, ...credentials(provider, s.settings) },
      controller.signal,
      (event) => {
        if (event.type === "text") content += event.text;
        else if (event.type === "reasoning") reasoning += event.text;
        else if (event.type === "reset") content = reasoning = "";
        schedule();
      },
    );
    ok = true;
  } catch (err) {
    if (!controller.signal.aborted) {
      if (timer) clearTimeout(timer);
      useStore.getState().patchMessage(convId, assistant.id, {
        content,
        reasoning: reasoning || undefined,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  } finally {
    if (timer) clearTimeout(timer);
    if (ok || controller.signal.aborted) {
      useStore.getState().patchMessage(convId, assistant.id, {
        content,
        reasoning: reasoning || undefined,
        status: ok ? "done" : "stopped",
      });
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
  const question = conv.messages.find((m) => m.role === "user")?.content ?? "";
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
