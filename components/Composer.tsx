"use client";

import { ArrowUp, Globe, Loader2, Paperclip, Square } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ACCEPT,
  classify,
  describeFile,
  MAX_ATTACHMENTS,
  prepareFile,
  prepareImage,
  type AttachmentKind,
  type PreparedFile,
  type PreparedImage,
} from "@/lib/attachments";
import type { Attachments } from "@/lib/chat";
import { useStore } from "@/lib/store";
import { cn, uid } from "@/lib/utils";
import { FileCard, RemoveButton } from "./Attachments";

export interface ComposerHandle {
  focus: () => void;
  setValue: (v: string) => void;
  addFiles: (files: File[]) => void;
}

interface Pending {
  key: string;
  kind: AttachmentKind;
  name: string;
  /** 图片预览地址（处理中时是 blob: 地址） */
  preview?: string;
  image?: PreparedImage;
  file?: PreparedFile;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    onSend: (text: string, attachments: Attachments) => void;
    onStop: () => void;
    streaming: boolean;
    placeholder?: string;
    autoFocus?: boolean;
  }
>(function Composer({ onSend, onStop, streaming, placeholder = "询问任何问题", autoFocus }, handle) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<Pending[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const toast = useStore((s) => s.toast);

  const update = (key: string, patch: Partial<Pending>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const remove = (key: string) =>
    setItems((list) => {
      const it = list.find((x) => x.key === key);
      if (it?.preview?.startsWith("blob:")) URL.revokeObjectURL(it.preview);
      return list.filter((x) => x.key !== key);
    });

  const addFiles = (files: File[]) => {
    const room = MAX_ATTACHMENTS - itemsRef.current.length;
    if (files.length > room) toast(`每条消息最多添加 ${MAX_ATTACHMENTS} 个附件`, "error");
    for (const file of files.slice(0, Math.max(0, room))) {
      const kind = classify(file);
      const key = uid();
      const isImage = kind === "image";
      const preview = isImage ? URL.createObjectURL(file) : undefined;
      setItems((list) => [...list, { key, kind: kind ?? "text", name: file.name || "图片", preview }]);
      const task = isImage ? prepareImage(file).then((image) => ({ image })) : prepareFile(file, kind).then((f) => ({ file: f }));
      task
        .then((result) => {
          if (!itemsRef.current.some((it) => it.key === key)) return; // 已被移除
          if (preview) URL.revokeObjectURL(preview);
          update(key, "image" in result ? { ...result, preview: result.image.dataUrl } : { ...result, kind: result.file.kind });
        })
        .catch((err) => {
          remove(key);
          toast(err instanceof Error ? err.message : `无法读取「${file.name}」`, "error");
        });
    }
    requestAnimationFrame(() => ref.current?.focus());
  };

  useImperativeHandle(handle, () => ({
    focus: () => ref.current?.focus(),
    setValue: (v) => {
      setValue(v);
      requestAnimationFrame(() => ref.current?.focus());
    },
    addFiles,
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

  const processing = items.some((it) => !it.image && !it.file);
  const canSend = (value.trim().length > 0 || items.length > 0) && !processing && !streaming;
  const submit = () => {
    if (!canSend) return;
    onSend(value, {
      images: items.flatMap((it) => (it.image ? [it.image] : [])),
      files: items.flatMap((it) => (it.file ? [it.file] : [])),
    });
    setValue("");
    setItems([]);
  };

  return (
    <div
      className="cursor-text rounded-[28px] bg-composer p-2.5 shadow-composer transition-shadow focus-within:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.22),0_0_0_1px_rgba(0,0,0,0.12)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.12)]"
      onClick={() => ref.current?.focus()}
    >
      {items.length > 0 && (
        <div className="scroll-thin flex gap-2.5 overflow-x-auto px-1.5 pt-1.5 pb-2.5">
          {items.map((it) =>
            it.kind === "image" ? (
              <div key={it.key} className="relative mt-1 mr-1 shrink-0">
                <div className="h-14 w-14 overflow-hidden rounded-2xl border border-line bg-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {it.preview && <img src={it.preview} alt="" className="h-full w-full object-cover" />}
                  {!it.image && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/35 text-white">
                      <Loader2 size={18} className="animate-spin" />
                    </span>
                  )}
                </div>
                <RemoveButton label="移除图片" onClick={() => remove(it.key)} />
              </div>
            ) : (
              <div key={it.key} className="relative mt-1 mr-1 shrink-0">
                <FileCard
                  kind={it.kind}
                  name={it.name}
                  meta={it.file ? describeFile(it.file) : undefined}
                  loading={!it.file}
                  className="max-w-[220px]"
                />
                <RemoveButton label="移除文件" onClick={() => remove(it.key)} />
              </div>
            ),
          )}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onPaste={(e) => {
          // 粘贴截图或复制的文件时作为附件添加
          const files = Array.from(e.clipboardData.files);
          if (!files.length) return;
          if (!e.clipboardData.getData("text/plain")) e.preventDefault();
          addFiles(files);
        }}
        onKeyDown={(e) => {
          // 中文输入法选词时按回车不应发送
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault();
            submit();
          }
        }}
        className="scroll-thin block max-h-[220px] w-full resize-none bg-transparent px-3 pt-1.5 pb-1 text-base leading-7 outline-none placeholder:text-subtle"
      />
      <div className="flex items-center justify-between pt-1">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="添加图片和文件"
            title="添加图片和文件（也可以直接粘贴或拖进来）"
            onClick={(e) => {
              e.stopPropagation();
              fileInput.current?.click();
            }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-hover hover:text-fg"
          >
            <Paperclip size={19} />
          </button>
          <WebSearchToggle />
        </div>
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
            title={processing ? "正在读取附件…" : "发送 (Enter)"}
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

/** 「联网」开关：打开后每条消息都会先联网搜索再回答 */
function WebSearchToggle() {
  const enabled = useStore((s) => s.settings.webSearch.enabled);
  const updateSettings = useStore((s) => s.updateSettings);
  const toast = useStore((s) => s.toast);
  return (
    <button
      type="button"
      aria-pressed={enabled}
      title={enabled ? "联网搜索已开启：每条消息都会先搜索再回答" : "开启联网搜索"}
      onClick={(e) => {
        e.stopPropagation();
        updateSettings((s) => ({ ...s, webSearch: { ...s.webSearch, enabled: !enabled } }));
        toast(enabled ? "已关闭联网搜索" : "已开启联网搜索");
      }}
      className={cn(
        "flex h-9 items-center gap-1.5 rounded-full px-2.5 text-sm transition-colors",
        enabled
          ? "bg-[#3b82f6]/12 font-medium text-[#2563eb] hover:bg-[#3b82f6]/18 dark:text-[#7ab7ff]"
          : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      <Globe size={18} />
      <span>联网</span>
    </button>
  );
}
