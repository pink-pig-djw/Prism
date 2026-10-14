"use client";

import { ArrowUp, Square } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    onSend: (text: string) => void;
    onStop: () => void;
    streaming: boolean;
    placeholder?: string;
    autoFocus?: boolean;
  }
>(function Composer({ onSend, onStop, streaming, placeholder = "询问任何问题", autoFocus }, handle) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus(),
    setValue: (v) => {
      setValue(v);
      requestAnimationFrame(() => ref.current?.focus());
    },
  }));

  useEffect(() => {
    if (autoFocus && window.matchMedia("(min-width: 768px)").matches) ref.current?.focus();
  }, [autoFocus]);

  // 输入框高度随内容自适应
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !streaming;
  const submit = () => {
    if (!canSend) return;
    onSend(value);
    setValue("");
  };

  return (
    <div
      className="cursor-text rounded-[28px] bg-composer p-2.5 shadow-composer transition-shadow focus-within:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.12)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
      onClick={() => ref.current?.focus()}
    >
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          // 中文输入法选词时按回车不应发送
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          }
        }}
        className="scroll-thin block max-h-[220px] w-full resize-none bg-transparent px-3 pt-1.5 pb-1 text-base leading-7 outline-none placeholder:text-subtle"
      />
      <div className="flex items-center justify-end pt-1">
        {streaming ? (
          <button
            type="button"
            aria-label="停止生成"
            title="停止生成"
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform hover:opacity-85 active:scale-95"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            aria-label="发送"
            title="发送 (Enter)"
            disabled={!canSend}
            onClick={(e) => {
              e.stopPropagation();
              submit();
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-full transition-all active:scale-95",
              canSend ? "bg-accent text-accent-fg hover:opacity-85" : "bg-active text-subtle",
            )}
          >
            <ArrowUp size={19} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
});
