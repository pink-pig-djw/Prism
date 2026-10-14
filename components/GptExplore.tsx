"use client";

import { Ellipsis, Menu as MenuIcon, PanelLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { prettyModel } from "@/lib/utils";
import { Button, GptAvatar, IconButton, Menu, MenuItem } from "./ui";

export function GptExplore() {
  const gpts = useStore((s) => s.gpts);
  const newChat = useStore((s) => s.newChat);
  const openEditor = useStore((s) => s.openGptEditor);
  const deleteGpt = useStore((s) => s.deleteGpt);
  const askConfirm = useStore((s) => s.askConfirm);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
        <IconButton label="打开侧边栏" className="md:hidden" onClick={() => setSidebarOpen(true)}>
          <MenuIcon size={20} />
        </IconButton>
        {!sidebarOpen && (
          <IconButton label="打开侧边栏" className="hidden md:inline-flex" onClick={() => setSidebarOpen(true)}>
            <PanelLeft size={20} />
          </IconButton>
        )}
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => openEditor(null)}>
          <Plus size={16} />
          创建
        </Button>
      </header>

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
          <div className="animate-slide-up text-center">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">GPT</h1>
            <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-muted">
              用自定义指令打造专属助手：翻译、编程、写作、陪练……每个 GPT 都有自己的性格和本领。
            </p>
          </div>

          <h2 className="mt-10 mb-3 text-lg font-semibold">我的 GPT</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => openEditor(null)}
              className="flex items-center gap-4 rounded-2xl border border-dashed border-line-strong p-4 text-left transition-colors hover:bg-hover"
            >
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-soft">
                <Plus size={24} className="text-muted" />
              </span>
              <span>
                <span className="block font-medium">创建 GPT</span>
                <span className="mt-0.5 block text-sm text-muted">设定名称、头像和指令，几秒钟完成</span>
              </span>
            </button>

            {gpts.map((g) => (
              <div
                key={g.id}
                role="button"
                tabIndex={0}
                onClick={() => newChat(g.id)}
                onKeyDown={(e) => e.key === "Enter" && newChat(g.id)}
                className="group relative flex cursor-pointer items-center gap-4 rounded-2xl border border-line p-4 text-left transition-colors hover:bg-hover"
              >
                <GptAvatar emoji={g.emoji} color={g.color} size={56} />
                <div className="min-w-0 flex-1 pr-6">
                  <p className="truncate font-medium">{g.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-muted">{g.description || "没有简介"}</p>
                  {g.model && <p className="mt-1 text-xs text-subtle">{prettyModel(g.model.model)}</p>}
                </div>
                <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
                  <Menu
                    align="right"
                    trigger={({ toggle }) => (
                      <IconButton label="更多操作" onClick={toggle} className="h-8 w-8">
                        <Ellipsis size={17} />
                      </IconButton>
                    )}
                  >
                    {(close) => (
                      <>
                        <MenuItem
                          icon={<Pencil size={15} />}
                          onClick={() => {
                            close();
                            openEditor(g.id);
                          }}
                        >
                          编辑
                        </MenuItem>
                        <MenuItem
                          danger
                          icon={<Trash2 size={15} />}
                          onClick={async () => {
                            close();
                            const ok = await askConfirm({
                              title: "删除 GPT？",
                              message: `将删除「${g.name}」。已有的聊天记录会保留。`,
                              confirmText: "删除",
                              danger: true,
                            });
                            if (ok) deleteGpt(g.id);
                          }}
                        >
                          删除
                        </MenuItem>
                      </>
                    )}
                  </Menu>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
