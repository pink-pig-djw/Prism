"use client";

import { AlertCircle, Brain, Check, ChevronDown, Copy, Pencil, RefreshCw, Settings2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { editMessage, regenerate } from "@/lib/chat";
import { useStore } from "@/lib/store";
import type { Message } from "@/lib/types";
import { cn, copyText, prettyModel } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { Button } from "./ui";

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label={copied ? "已复制" : "复制"}
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }
      }}
    >
      {copied ? <Check size={16} /> : <Copy size={16} />}
    </ActionButton>
  );
}

function Reasoning({ text, active }: { text: string; active: boolean }) {
  const [open, setOpen] = useState(active);
  useEffect(() => setOpen(active), [active]);
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg py-1 text-sm text-muted transition-colors hover:text-fg"
      >
        <Brain size={15} />
        <span className={cn(active && "text-shimmer")}>{active ? "思考中…" : "已深度思考"}</span>
        <ChevronDown size={15} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-1.5 animate-fade-in whitespace-pre-wrap border-l-2 border-line-strong pl-4 text-sm leading-relaxed text-muted">
          {text}
        </div>
      )}
    </div>
  );
}

function UserMessage({ message, convId, busy }: { message: Message; convId: string; busy: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 360)}px`;
  }, [draft, editing]);

  if (editing) {
    return (
      <div className="w-full animate-fade-in rounded-3xl bg-soft px-4 py-3">
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (draft.trim()) {
                setEditing(false);
                void editMessage(convId, message.id, draft);
              }
            }
          }}
          className="scroll-thin w-full resize-none bg-transparent px-1 leading-7 outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            取消
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={!draft.trim()}
            onClick={() => {
              setEditing(false);
              void editMessage(convId, message.id, draft);
            }}
          >
            发送
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-soft px-5 py-2.5 leading-7 sm:max-w-[75%]">
        {message.content}
      </div>
      <div className="mt-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
        <CopyButton text={message.content} />
        {!busy && (
          <ActionButton
            label="编辑"
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
          >
            <Pencil size={15} />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function AssistantMessage({ message, convId, isLast, busy }: { message: Message; convId: string; isLast: boolean; busy: boolean }) {
  const openSettings = useStore((s) => s.openSettings);
  const streaming = message.status === "streaming";
  const waiting = streaming && !message.content;
  const needsSetup = message.status === "error" && /API Key|访问密码/.test(message.error ?? "");

  return (
    <div className="group">
      {message.reasoning && <Reasoning text={message.reasoning} active={streaming && !message.content} />}

      {waiting && !message.reasoning && (
        <div className="flex h-7 items-center gap-2">
          <span className="h-3 w-3 animate-[blink_1s_ease-in-out_infinite] rounded-full bg-fg" />
        </div>
      )}

      {message.content && <Markdown content={message.content} streaming={streaming} />}

      {message.status === "stopped" && !message.content && <p className="text-sm text-subtle">已停止生成</p>}

      {message.status === "error" && (
        <div className={cn("flex items-start gap-3 rounded-2xl border border-danger/25 bg-danger/[0.06] px-4 py-3 text-sm", message.content && "mt-3")}>
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="break-words leading-relaxed">{message.error || "出错了，请重试。"}</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {isLast && (
                <Button size="sm" variant="secondary" onClick={() => void regenerate(convId)}>
                  <RefreshCw size={14} />
                  重试
                </Button>
              )}
              {needsSetup && (
                <Button size="sm" variant="secondary" onClick={() => openSettings("models")}>
                  <Settings2 size={14} />
                  打开设置
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {!streaming && message.status !== "error" && (
        <div
          className={cn(
            "-ml-1.5 mt-1.5 flex items-center gap-0.5 transition-opacity",
            isLast ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-md:opacity-100",
          )}
        >
          {message.content && <CopyButton text={message.content} />}
          {isLast && !busy && (
            <ActionButton label="重新生成" onClick={() => void regenerate(convId)}>
              <RefreshCw size={15} />
            </ActionButton>
          )}
          {message.model && <span className="ml-1.5 text-xs text-subtle">{prettyModel(message.model)}</span>}
        </div>
      )}
    </div>
  );
}

export const ChatMessage = memo(function ChatMessage(props: {
  message: Message;
  convId: string;
  isLast: boolean;
  busy: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
      {props.message.role === "user" ? (
        <UserMessage message={props.message} convId={props.convId} busy={props.busy} />
      ) : (
        <AssistantMessage {...props} />
      )}
    </div>
  );
});
