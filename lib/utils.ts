import { nanoid } from "nanoid";
import type { Conversation, ProviderId } from "./types";

export const uid = () => nanoid(12);

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  openai: "OpenAI 兼容接口",
  anthropic: "Anthropic Claude",
};

/** 把模型 ID 转成更易读的名字，例如 claude-opus-5-5 → Claude Opus 5.5 */
export function prettyModel(id: string): string {
  const claude = /^claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?$/.exec(id);
  if (claude) {
    const [, family, major, minor] = claude;
    return `Claude ${family[0].toUpperCase()}${family.slice(1)} ${major}${minor ? `.${minor}` : ""}`;
  }
  const gpt = /^gpt-(.+)$/i.exec(id);
  if (gpt) return `GPT-${gpt[1]}`;
  return id;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 非 HTTPS 环境下 clipboard API 不可用，退回到 execCommand
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

/** 侧边栏按时间分组：置顶 / 今天 / 昨天 / 7 天内 / 30 天内 / 按月份 */
export function groupConversations(list: Conversation[]): { label: string; items: Conversation[] }[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = startOfToday.getTime();
  const day = 86_400_000;
  const groups = new Map<string, Conversation[]>();
  const push = (label: string, c: Conversation) => {
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(c);
  };
  const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  for (const c of sorted) if (c.pinned) push("置顶", c);
  for (const c of sorted) {
    if (c.pinned) continue;
    const t = c.updatedAt;
    if (t >= today) push("今天", c);
    else if (t >= today - day) push("昨天", c);
    else if (t >= today - 7 * day) push("7 天内", c);
    else if (t >= today - 30 * day) push("30 天内", c);
    else {
      const d = new Date(t);
      push(`${d.getFullYear()} 年 ${d.getMonth() + 1} 月`, c);
    }
  }
  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

export function downloadFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
