"use client";

import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function IconButton({
  label,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-9 px-4 text-sm",
        variant === "primary" && "bg-accent text-accent-fg hover:opacity-85",
        variant === "secondary" && "border border-line-strong bg-main text-fg hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "bg-danger text-white hover:opacity-90 dark:text-black",
        className,
      )}
      {...props}
    />
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-[#10a37f]" : "bg-line-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line-strong bg-main px-3.5 py-2.5 text-sm text-fg outline-none transition-[border-color,box-shadow] placeholder:text-subtle focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.18)]";

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-subtle">{hint}</span>}
    </label>
  );
}

/** 居中的模态框：点击遮罩或按 Esc 关闭 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  footer,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  /** 为 false 时由内容自己处理滚动 */
  scroll?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[92dvh] w-full animate-pop-in flex-col overflow-hidden rounded-t-3xl bg-elevated shadow-pop sm:rounded-3xl",
          className ?? "sm:max-w-lg",
        )}
      >
        {title !== undefined && (
          <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3.5 sm:px-6">
            <h2 className="text-[17px] font-semibold">{title}</h2>
            <IconButton label="关闭" onClick={onClose} className="-mr-2">
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className={cn("min-h-0 flex-1", scroll ? "scroll-thin overflow-y-auto" : "flex flex-col overflow-hidden")}>{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

/** 下拉菜单：trigger 渲染按钮，children 渲染菜单内容（可调用 close 关闭） */
export function Menu({
  trigger,
  children,
  align = "left",
  side = "bottom",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "top";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 菜单如果超出视口底部，就改为向上展开
  useLayoutEffect(() => {
    if (!open || side !== "bottom" || !panelRef.current) return setFlip(false);
    const rect = panelRef.current.getBoundingClientRect();
    // 同时考虑所在滚动容器的底部，避免菜单被侧边栏列表裁掉
    let limit = window.innerHeight;
    for (let el = ref.current?.parentElement; el; el = el.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        limit = Math.min(limit, el.getBoundingClientRect().bottom);
        break;
      }
    }
    setFlip(rect.bottom > limit - 8);
  }, [open, side]);

  const up = side === "top" || flip;
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-40 min-w-[200px] animate-pop-in rounded-2xl bg-elevated p-1.5 shadow-pop",
            align === "right" ? "right-0" : "left-0",
            up ? "bottom-full mb-1.5 origin-bottom" : "top-full mt-1.5 origin-top",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  danger,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-hover",
        danger ? "text-danger" : "text-fg",
        className,
      )}
      {...props}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
}

export function GptAvatar({ emoji, color, size = 28, className }: { emoji: string; color: string; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: `color-mix(in srgb, ${color} 22%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {emoji || "✨"}
    </span>
  );
}

export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  const id = `prism-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id={id} x1="8" y1="54" x2="56" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="0.5" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <path d="M30 10 L52 50 H8 Z" fill={`url(#${id})`} stroke={`url(#${id})`} strokeWidth="7" strokeLinejoin="round" />
      <path d="M30 10 L30 50 H8 Z" fill="#fff" opacity="0.18" />
      <g strokeWidth="3.2" strokeLinecap="round">
        <path d="M45 32 L60 26" stroke="#f59e0b" />
        <path d="M45 33.5 L61 33.5" stroke="#f472b6" />
        <path d="M45 35 L60 41" stroke="#34d399" />
      </g>
    </svg>
  );
}
