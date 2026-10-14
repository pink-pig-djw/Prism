"use client";

import { FileCode2, FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { describeFile, useImageSrc } from "@/lib/attachments";
import type { FileRef, ImageRef } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILE_STYLE: Record<FileRef["kind"], { color: string; Icon: typeof FileText }> = {
  pdf: { color: "#ef4444", Icon: FileText },
  docx: { color: "#3b82f6", Icon: FileText },
  text: { color: "#8b5cf6", Icon: FileCode2 },
};

export function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-fg text-main shadow-sm ring-2 ring-composer transition-transform hover:scale-110"
    >
      <X size={12} strokeWidth={3} />
    </button>
  );
}

/** 文件卡片：图标 + 文件名 + 类型/页数 */
export function FileCard({
  kind,
  name,
  meta,
  loading,
  className,
}: {
  kind: FileRef["kind"];
  name: string;
  meta?: string;
  loading?: boolean;
  className?: string;
}) {
  const { color, Icon } = FILE_STYLE[kind];
  return (
    <div className={cn("flex h-14 min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-main py-2 pr-3.5 pl-2", className)}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: color }}>
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={19} />}
      </span>
      <span className="min-w-0 text-left">
        <span className="block truncate text-sm font-medium" title={name}>
          {name}
        </span>
        <span className="block truncate text-xs text-subtle">{loading ? "正在读取…" : meta}</span>
      </span>
    </div>
  );
}

/** 全屏查看图片，点击任意位置或按 Esc 关闭 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex animate-fade-in cursor-zoom-out items-center justify-center bg-black/85 p-4" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
      <button
        type="button"
        aria-label="关闭"
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X size={20} />
      </button>
    </div>
  );
}

/** 单张图片在消息里最大显示 320×320，按原始比例缩放 */
function fitSize(image: ImageRef, max = 320) {
  const scale = Math.min(1, max / image.width, max / image.height);
  return { width: Math.round(image.width * scale), height: Math.round(image.height * scale) };
}

function StoredImage({ image, tile, onOpen }: { image: ImageRef; tile?: boolean; onOpen: (src: string) => void }) {
  const src = useImageSrc(image.id);
  const box = tile ? "h-28 w-28 rounded-2xl sm:h-32 sm:w-32" : "max-w-full rounded-3xl";
  const size = tile ? undefined : fitSize(image);
  if (!src) return <div className={cn("animate-pulse bg-soft", box)} style={size} />;
  return (
    <button type="button" onClick={() => onOpen(src)} className={cn("cursor-zoom-in overflow-hidden border border-line", box)} style={size}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-cover" />
    </button>
  );
}

/** 用户消息里的图片和文件 */
export function MessageAttachments({ images = [], files = [] }: { images?: ImageRef[]; files?: FileRef[] }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (!images.length && !files.length) return null;
  return (
    <div className="mb-2 flex max-w-[85%] flex-col items-end gap-2 sm:max-w-[75%]">
      {images.length === 1 && (
        <StoredImage image={images[0]} onOpen={setPreview} />
      )}
      {images.length > 1 && (
        <div className={cn("grid gap-1.5", images.length === 2 || images.length === 4 ? "grid-cols-2" : "grid-cols-3")}>
          {images.map((img) => (
            <StoredImage key={img.id} image={img} tile onOpen={setPreview} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {files.map((f) => (
            <FileCard
              key={f.id}
              kind={f.kind}
              name={f.name}
              meta={describeFile(f) + (f.truncated ? " · 内容过长已截断" : "")}
              className="max-w-[260px]"
            />
          ))}
        </div>
      )}
      {preview && <Lightbox src={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
