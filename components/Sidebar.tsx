"use client";

import { Ellipsis, LayoutGrid, PanelLeft, Pencil, Pin, PinOff, Search, Settings, SquarePen, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Conversation } from "@/lib/types";
import { cn, groupConversations } from "@/lib/utils";
import { GptAvatar, IconButton, Logo, Menu, MenuItem } from "./ui";

function NavItem({
  icon,
  children,
  onClick,
  active,
  shortcut,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-hover",
        active && "bg-active",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {shortcut && <span className="hidden text-xs text-subtle opacity-0 transition-opacity group-hover:opacity-100 md:inline">{shortcut}</span>}
    </button>
  );
}

function ConversationItem({ conv, active }: { conv: Conversation; active: boolean }) {
  const open = useStore((s) => s.openConversation);
  const update = useStore((s) => s.updateConversation);
  const remove = useStore((s) => s.deleteConversation);
  const askConfirm = useStore((s) => s.askConfirm);
  const streaming = useStore((s) => Boolean(s.streaming[conv.id]));
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conv.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const commit = () => {
    const t = title.trim();
    if (t && t !== conv.title) update(conv.id, { title: t, titled: true });
    setRenaming(false);
  };

  if (renaming) {
    return (
      <div className="px-1 py-0.5">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
            if (e.key === "Escape") setRenaming(false);
          }}
          className="h-8 w-full rounded-lg border border-[#3b82f6] bg-main px-2 text-sm outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex h-9 items-center rounded-lg text-sm transition-colors",
        active ? "bg-active" : "hover:bg-hover",
      )}
    >
      <button type="button" onClick={() => open(conv.id)} className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2.5 text-left">
        {streaming && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#10a37f]" />}
        <span className="truncate">{conv.title || "新聊天"}</span>
      </button>
      <Menu
        align="right"
        trigger={({ open: menuOpen, toggle }) => (
          <button
            type="button"
            aria-label="更多操作"
            onClick={toggle}
            className={cn(
              "mr-1 flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-fg",
              menuOpen || active ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-md:opacity-100",
            )}
          >
            <Ellipsis size={16} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem
              icon={<Pencil size={15} />}
              onClick={() => {
                close();
                setTitle(conv.title);
                setRenaming(true);
              }}
            >
              重命名
            </MenuItem>
            <MenuItem
              icon={conv.pinned ? <PinOff size={15} /> : <Pin size={15} />}
              onClick={() => {
                close();
                update(conv.id, { pinned: !conv.pinned });
              }}
            >
              {conv.pinned ? "取消置顶" : "置顶"}
            </MenuItem>
            <div className="my-1 h-px bg-line" />
            <MenuItem
              danger
              icon={<Trash2 size={15} />}
              onClick={async () => {
                close();
                const ok = await askConfirm({
                  title: "删除聊天？",
                  message: `将删除「${conv.title}」，删除后无法恢复。`,
                  confirmText: "删除",
                  danger: true,
                });
                if (ok) remove(conv.id);
              }}
            >
              删除
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

export function Sidebar() {
  const open = useStore((s) => s.sidebarOpen);
  const setOpen = useStore((s) => s.setSidebarOpen);
  const conversations = useStore((s) => s.conversations);
  const activeId = useStore((s) => s.activeId);
  const view = useStore((s) => s.view);
  const draftGptId = useStore((s) => s.draftGptId);
  const gpts = useStore((s) => s.gpts);
  const newChat = useStore((s) => s.newChat);
  const setView = useStore((s) => s.setView);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const openSettings = useStore((s) => s.openSettings);

  const groups = useMemo(
    () => groupConversations(Object.values(conversations).filter((c) => c.messages.length > 0)),
    [conversations],
  );
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? "⌘" : "Ctrl+";

  return (
    <>
      {/* 移动端遮罩 */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/40 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
      />
      <aside
        className={cn(
          "z-40 flex h-full shrink-0 flex-col overflow-hidden bg-sidebar transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:w-[280px]",
          open ? "max-md:shadow-pop md:w-[260px]" : "max-md:-translate-x-full md:w-0",
        )}
      >
        <div className="flex h-full w-[280px] flex-col md:w-[260px]">
          <div className="flex h-14 shrink-0 items-center justify-between px-3">
            <button
              type="button"
              onClick={() => newChat()}
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-hover"
              aria-label="Prism 首页"
            >
              <Logo size={26} />
              <span className="text-[17px] font-semibold tracking-tight">Prism</span>
            </button>
            <IconButton label="关闭侧边栏" onClick={() => setOpen(false)}>
              <PanelLeft size={20} />
            </IconButton>
          </div>

          <nav className="flex shrink-0 flex-col gap-0.5 px-2">
            <NavItem icon={<SquarePen size={18} />} onClick={() => newChat()} shortcut={`${mod}⇧O`}>
              新聊天
            </NavItem>
            <NavItem icon={<Search size={18} />} onClick={() => setSearchOpen(true)} shortcut={`${mod}K`}>
              搜索聊天
            </NavItem>
            <NavItem icon={<LayoutGrid size={18} />} onClick={() => setView("gpts")} active={view === "gpts"}>
              GPT
            </NavItem>
          </nav>

          <div className="scroll-thin mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
            {gpts.length > 0 && (
              <div className="mb-4">
                <h3 className="px-2.5 pb-1 text-xs font-medium text-subtle">我的 GPT</h3>
                {gpts.slice(0, 5).map((g) => (
                  <NavItem
                    key={g.id}
                    icon={<GptAvatar emoji={g.emoji} color={g.color} size={22} />}
                    onClick={() => newChat(g.id)}
                    active={view === "chat" && !activeId && draftGptId === g.id}
                  >
                    {g.name}
                  </NavItem>
                ))}
              </div>
            )}

            {groups.length === 0 && <p className="px-2.5 py-2 text-[13px] text-subtle">还没有聊天记录</p>}
            {groups.map((group) => (
              <div key={group.label} className="mb-4">
                <h3 className="sticky top-0 z-10 bg-sidebar px-2.5 pt-1 pb-1 text-xs font-medium text-subtle">{group.label}</h3>
                {group.items.map((c) => (
                  <ConversationItem key={c.id} conv={c} active={view === "chat" && c.id === activeId} />
                ))}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-line p-2">
            <button
              type="button"
              onClick={() => openSettings("general")}
              className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-hover"
            >
              <span className="brand-gradient flex h-8 w-8 items-center justify-center rounded-full text-white">
                <Settings size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">设置</span>
                <span className="block truncate text-xs text-subtle">模型、API Key、个性化</span>
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
