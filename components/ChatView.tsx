"use client";

import { ArrowDown, Code2, GraduationCap, KeyRound, Lightbulb, Menu as MenuIcon, PanelLeft, PenLine, SquarePen } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { sendMessage, stopGeneration } from "@/lib/chat";
import { providerReady, useStore } from "@/lib/store";
import type { GPT } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChatMessage } from "./ChatMessage";
import { Composer, type ComposerHandle } from "./Composer";
import { ModelPicker } from "./ModelPicker";
import { Button, GptAvatar, IconButton } from "./ui";

const SUGGESTIONS = [
  { icon: Code2, color: "#60a5fa", label: "写代码", prompt: "用 Python 写一个批量重命名文件夹里图片的脚本，并解释关键步骤" },
  { icon: Lightbulb, color: "#f5b33c", label: "头脑风暴", prompt: "帮我想 10 个适合周末和朋友一起做的有趣活动" },
  { icon: GraduationCap, color: "#34d399", label: "解释概念", prompt: "用通俗易懂的方式解释一下什么是量子纠缠" },
  { icon: PenLine, color: "#c084fc", label: "帮我写作", prompt: "帮我写一封得体的请假邮件，理由是家里有事需要请两天假" },
];

function Disclaimer() {
  return <p className="px-4 py-2 text-center text-xs text-subtle">Prism 也可能会犯错。请核查重要信息。</p>;
}

function Header() {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);
  const newChat = useStore((s) => s.newChat);
  const convModel = useStore((s) => (s.activeId ? s.conversations[s.activeId]?.model : undefined));
  const gpt = useStore((s) => {
    const gptId = s.activeId ? s.conversations[s.activeId]?.gptId : s.draftGptId;
    return gptId ? s.gpts.find((g) => g.id === gptId) : undefined;
  });
  const defaultModel = useStore((s) => s.settings.defaultModel);
  // 已有对话用对话自己的模型；新对话里，GPT 指定了模型就用 GPT 的，否则用默认模型
  const current = convModel ?? gpt?.model ?? defaultModel;

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
      <IconButton label="打开侧边栏" className="md:hidden" onClick={() => setSidebarOpen(true)}>
        <MenuIcon size={20} />
      </IconButton>
      {!sidebarOpen && (
        <div className="hidden items-center gap-0.5 md:flex">
          <IconButton label="打开侧边栏" onClick={() => setSidebarOpen(true)}>
            <PanelLeft size={20} />
          </IconButton>
          <IconButton label="新聊天" onClick={() => newChat()}>
            <SquarePen size={19} />
          </IconButton>
        </div>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 max-md:justify-center">
        {gpt && <GptAvatar emoji={gpt.emoji} color={gpt.color} size={26} className="ml-1 hidden sm:inline-flex" />}
        <ModelPicker value={current} label={gpt?.name} />
      </div>
      <IconButton label="新聊天" className="md:hidden" onClick={() => newChat()}>
        <SquarePen size={19} />
      </IconButton>
    </header>
  );
}

function EmptyState({ gpt, composer }: { gpt?: GPT; composer: React.ReactNode }) {
  const ready = useStore((s) => {
    const provider = (gpt?.model ?? s.settings.defaultModel).provider;
    return providerReady(provider, s.settings, s.serverConfig);
  });
  const serverLoaded = useStore((s) => s.serverConfig !== null);
  const openSettings = useStore((s) => s.openSettings);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:justify-center sm:pb-[10vh]">
      <div className="order-1 flex flex-1 flex-col items-center justify-center py-8 text-center sm:flex-none sm:py-0">
        {gpt ? (
          <div className="flex animate-slide-up flex-col items-center">
            <GptAvatar emoji={gpt.emoji} color={gpt.color} size={72} />
            <h1 className="mt-4 text-2xl font-semibold">{gpt.name}</h1>
            {gpt.description && <p className="mt-2 max-w-md text-[15px] leading-relaxed text-muted">{gpt.description}</p>}
          </div>
        ) : (
          <h1 className="animate-slide-up text-[26px] font-medium tracking-tight sm:text-[28px]">有什么可以帮忙的？</h1>
        )}
      </div>

      <div className="order-3 mx-auto w-full max-w-3xl pb-1 sm:order-2 sm:mt-8">{composer}</div>

      <div className="order-2 mx-auto w-full max-w-3xl pb-3 sm:order-3 sm:mt-5 sm:pb-0">
        {serverLoaded && !ready ? (
          <div className="mx-auto flex max-w-xl animate-fade-in flex-col gap-3 rounded-2xl border border-line p-4 sm:flex-row sm:items-center">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-soft sm:flex">
              <KeyRound size={18} />
            </span>
            <div className="flex-1 text-left">
              <p className="text-[15px] font-medium">连接模型服务后即可开始对话</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                支持 OpenAI 兼容接口（OpenAI、DeepSeek、通义千问、Ollama 等）和 Anthropic Claude，填入 API Key 即可。
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => openSettings("models")}>
              去设置
            </Button>
          </div>
        ) : gpt ? (
          gpt.starters.filter(Boolean).length > 0 && (
            <div className="grid animate-fade-in grid-cols-1 gap-2 sm:grid-cols-2">
              {gpt.starters.filter(Boolean).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void sendMessage(s)}
                  className="rounded-2xl border border-line px-4 py-3 text-left text-sm leading-relaxed text-muted transition-colors hover:bg-hover hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="flex animate-fade-in flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(({ icon: Icon, color, label, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => void sendMessage(prompt)}
                className="flex items-center gap-2 rounded-full border border-line px-3.5 py-2 text-sm text-muted transition-colors hover:bg-hover hover:text-fg"
              >
                <Icon size={16} style={{ color }} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatView() {
  const activeId = useStore((s) => s.activeId);
  const conv = useStore((s) => (s.activeId ? s.conversations[s.activeId] : undefined));
  const draftGpt = useStore((s) => (s.draftGptId ? s.gpts.find((g) => g.id === s.draftGptId) : undefined));
  const convGpt = useStore((s) => (conv?.gptId ? s.gpts.find((g) => g.id === conv.gptId) : undefined));
  const streaming = useStore((s) => (activeId ? Boolean(s.streaming[activeId]) : false));

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const stick = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const messages = conv?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // 切换对话时直接滚到底部
  useLayoutEffect(() => {
    stick.current = true;
    scrollToBottom();
    setShowJump(false);
  }, [activeId, scrollToBottom]);

  // 有新消息时强制跟随到底部
  useLayoutEffect(() => {
    stick.current = true;
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // 流式输出时，只有用户停留在底部附近才自动跟随
  useLayoutEffect(() => {
    if (stick.current) scrollToBottom();
  }, [conv?.messages, scrollToBottom]);

  // 回答结束后把焦点还给输入框（移动端不自动聚焦，避免弹出键盘）
  useEffect(() => {
    if (!streaming && window.matchMedia("(min-width: 768px)").matches) composerRef.current?.focus();
  }, [streaming]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stick.current = distance < 80;
    setShowJump(distance > 240);
  };

  const composer = (
    <Composer
      key={activeId ?? "new"}
      ref={composerRef}
      autoFocus
      streaming={streaming}
      onSend={(text) => void sendMessage(text)}
      onStop={() => activeId && stopGeneration(activeId)}
      placeholder={(convGpt ?? draftGpt) ? `给“${(convGpt ?? draftGpt)!.name}”发送消息` : "询问任何问题"}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header />
      {!conv || messages.length === 0 ? (
        <>
          <EmptyState gpt={draftGpt ?? convGpt} composer={composer} />
          <Disclaimer />
        </>
      ) : (
        <>
          <div ref={scrollRef} onScroll={onScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-6 pt-4 pb-10">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} convId={conv.id} isLast={m.id === lastId} busy={streaming} />
              ))}
            </div>
          </div>
          <div className="relative shrink-0 px-3 sm:px-4">
            <button
              type="button"
              aria-label="滚动到底部"
              onClick={() => {
                stick.current = true;
                scrollToBottom(true);
              }}
              className={cn(
                "absolute -top-12 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-line-strong bg-main text-muted shadow-pop transition-all hover:text-fg",
                showJump ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
              )}
            >
              <ArrowDown size={17} />
            </button>
            <div className="mx-auto w-full max-w-3xl">{composer}</div>
          </div>
          <Disclaimer />
        </>
      )}
    </div>
  );
}
