"use client";

import { MessageSquare, Search, SquarePen } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Button, Dialog } from "./ui";

export function SearchDialog() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const conversations = useStore((s) => s.conversations);
  const openConversation = useStore((s) => s.openConversation);
  const newChat = useStore((s) => s.newChat);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = Object.values(conversations)
      .filter((c) => c.messages.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list.slice(0, 30).map((c) => ({ conv: c, snippet: "" }));
    const out: { conv: (typeof list)[number]; snippet: string }[] = [];
    for (const c of list) {
      const inTitle = c.title.toLowerCase().includes(q);
      const hit = c.messages.find((m) => m.content.toLowerCase().includes(q));
      if (!inTitle && !hit) continue;
      let snippet = "";
      if (hit) {
        const i = hit.content.toLowerCase().indexOf(q);
        snippet = (i > 30 ? "…" : "") + hit.content.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, " ");
      }
      out.push({ conv: c, snippet });
      if (out.length >= 50) break;
    }
    return out;
  }, [conversations, query]);

  const pick = (id: string) => {
    openConversation(id);
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={() => setOpen(false)} className="sm:max-w-xl">
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <Search size={18} className="text-subtle" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing && results[cursor]) {
              pick(results[cursor].conv.id);
            }
          }}
          placeholder="搜索聊天…"
          className="h-8 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
        />
      </div>
      <div className="h-[min(420px,60dvh)] overflow-y-auto p-2 scroll-thin">
        {!query && (
          <button
            type="button"
            onClick={() => {
              newChat();
              setOpen(false);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-hover"
          >
            <SquarePen size={17} />
            新聊天
          </button>
        )}
        {results.length === 0 && <p className="px-3 py-10 text-center text-sm text-subtle">没有找到相关聊天</p>}
        {results.map(({ conv, snippet }, i) => (
          <button
            key={conv.id}
            type="button"
            onMouseEnter={() => setCursor(i)}
            onClick={() => pick(conv.id)}
            className={cn("flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left", i === cursor && "bg-hover")}
          >
            <MessageSquare size={17} className="mt-0.5 shrink-0 text-subtle" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{conv.title}</span>
              {snippet && <span className="mt-0.5 block truncate text-xs text-subtle">{snippet}</span>}
            </span>
            <span className="shrink-0 text-xs text-subtle">{new Date(conv.updatedAt).toLocaleDateString("zh-CN")}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}

export function ConfirmDialog() {
  const confirm = useStore((s) => s.confirm);
  const resolve = useStore((s) => s.resolveConfirm);
  return (
    <Dialog
      open={Boolean(confirm)}
      onClose={() => resolve(false)}
      title={confirm?.title}
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={() => resolve(false)}>
            取消
          </Button>
          <Button variant={confirm?.danger ? "danger" : "primary"} onClick={() => resolve(true)} autoFocus>
            {confirm?.confirmText ?? "确定"}
          </Button>
        </>
      }
    >
      <p className="px-5 py-5 text-[15px] leading-relaxed text-muted sm:px-6">{confirm?.message}</p>
    </Dialog>
  );
}

export function Toaster() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "animate-pop-in rounded-full px-4 py-2 text-sm shadow-pop",
            t.tone === "error" ? "bg-danger text-white dark:text-black" : "bg-accent text-accent-fg",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
