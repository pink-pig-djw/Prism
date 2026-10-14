"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { DEFAULT_SETTINGS, PRESET_GPTS } from "./defaults";
import type { Conversation, GPT, Message, ModelRef, ProviderId, ServerConfig, Settings } from "./types";
import { uid } from "./utils";

export type SettingsTab = "general" | "models" | "personalization" | "data";

interface Toast {
  id: string;
  text: string;
  tone: "default" | "error";
}

interface ConfirmRequest {
  title: string;
  message: string;
  confirmText?: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface State {
  // ---- 持久化数据 ----
  conversations: Record<string, Conversation>;
  gpts: GPT[];
  settings: Settings;

  // ---- 界面状态（不持久化） ----
  activeId: string | null;
  /** 新对话所关联的 GPT（对话还没创建时使用） */
  draftGptId: string | null;
  view: "chat" | "gpts";
  streaming: Record<string, boolean>;
  serverConfig: ServerConfig | null;
  sidebarOpen: boolean;
  settingsOpen: SettingsTab | null;
  gptEditor: { gptId: string | null } | null;
  searchOpen: boolean;
  toasts: Toast[];
  confirm: ConfirmRequest | null;

  // ---- actions ----
  newChat: (gptId?: string | null) => void;
  openConversation: (id: string) => void;
  createConversation: (init: { model: ModelRef; gptId?: string; title: string }) => string;
  updateConversation: (id: string, patch: Partial<Conversation>) => void;
  setMessages: (id: string, fn: (messages: Message[]) => Message[]) => void;
  patchMessage: (convId: string, msgId: string, patch: Partial<Message>) => void;
  deleteConversation: (id: string) => void;
  clearConversations: () => void;
  importData: (data: { conversations?: Conversation[]; gpts?: GPT[] }) => number;

  setModel: (model: ModelRef) => void;
  updateSettings: (fn: (s: Settings) => Settings) => void;
  updateProvider: (provider: ProviderId, patch: Partial<Settings["providers"][ProviderId]>) => void;

  saveGpt: (gpt: GPT) => void;
  deleteGpt: (id: string) => void;

  setView: (view: "chat" | "gpts") => void;
  setSidebarOpen: (open: boolean) => void;
  openSettings: (tab?: SettingsTab | null) => void;
  openGptEditor: (gptId: string | null) => void;
  closeGptEditor: () => void;
  setSearchOpen: (open: boolean) => void;
  setServerConfig: (config: ServerConfig) => void;
  setStreaming: (id: string, on: boolean) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  askConfirm: (req: Omit<ConfirmRequest, "resolve">) => Promise<boolean>;
  resolveConfirm: (ok: boolean) => void;
}

/**
 * localStorage 写入做了防抖：流式输出时每秒会有几十次状态更新，
 * 如果每次都完整序列化所有对话，会明显拖慢页面。
 */
function debouncedLocalStorage(delay = 500): StateStorage {
  let pending: [string, string] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!pending) return;
    const [name, value] = pending;
    pending = null;
    try {
      localStorage.setItem(name, value);
    } catch (err) {
      console.warn("保存到本地存储失败（可能是空间不足）", err);
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  }
  return {
    getItem: (name) => localStorage.getItem(name),
    setItem: (name, value) => {
      pending = [name, value];
      if (!timer) timer = setTimeout(flush, delay);
    },
    removeItem: (name) => localStorage.removeItem(name),
  };
}

const isMobile = () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      conversations: {},
      gpts: PRESET_GPTS,
      settings: DEFAULT_SETTINGS,

      activeId: null,
      draftGptId: null,
      view: "chat",
      streaming: {},
      serverConfig: null,
      sidebarOpen: !isMobile(),
      settingsOpen: null,
      gptEditor: null,
      searchOpen: false,
      toasts: [],
      confirm: null,

      newChat: (gptId = null) =>
        set({ activeId: null, draftGptId: gptId, view: "chat", ...(isMobile() ? { sidebarOpen: false } : {}) }),

      openConversation: (id) =>
        set({ activeId: id, draftGptId: null, view: "chat", ...(isMobile() ? { sidebarOpen: false } : {}) }),

      createConversation: ({ model, gptId, title }) => {
        const id = uid();
        const now = Date.now();
        const conv: Conversation = { id, title, model, gptId, messages: [], createdAt: now, updatedAt: now };
        set((s) => ({ conversations: { ...s.conversations, [id]: conv }, activeId: id, draftGptId: null }));
        return id;
      },

      updateConversation: (id, patch) =>
        set((s) => {
          const conv = s.conversations[id];
          if (!conv) return s;
          return { conversations: { ...s.conversations, [id]: { ...conv, ...patch } } };
        }),

      setMessages: (id, fn) =>
        set((s) => {
          const conv = s.conversations[id];
          if (!conv) return s;
          return {
            conversations: { ...s.conversations, [id]: { ...conv, messages: fn(conv.messages), updatedAt: Date.now() } },
          };
        }),

      patchMessage: (convId, msgId, patch) =>
        set((s) => {
          const conv = s.conversations[convId];
          if (!conv) return s;
          const messages = conv.messages.map((m) => (m.id === msgId ? { ...m, ...patch } : m));
          return { conversations: { ...s.conversations, [convId]: { ...conv, messages } } };
        }),

      deleteConversation: (id) =>
        set((s) => {
          const { [id]: _removed, ...rest } = s.conversations;
          return { conversations: rest, activeId: s.activeId === id ? null : s.activeId };
        }),

      clearConversations: () => set({ conversations: {}, activeId: null }),

      importData: (data) => {
        let count = 0;
        set((s) => {
          const conversations = { ...s.conversations };
          for (const c of data.conversations ?? []) {
            if (c && typeof c.id === "string" && Array.isArray(c.messages)) {
              conversations[c.id] = c;
              count++;
            }
          }
          const gpts = [...s.gpts];
          for (const g of data.gpts ?? []) {
            if (g && typeof g.id === "string" && !gpts.some((x) => x.id === g.id)) gpts.push(g);
          }
          return { conversations, gpts };
        });
        return count;
      },

      setModel: (model) => {
        const { activeId } = get();
        set((s) => ({ settings: { ...s.settings, defaultModel: model } }));
        if (activeId) get().updateConversation(activeId, { model });
      },

      updateSettings: (fn) => set((s) => ({ settings: fn(s.settings) })),

      updateProvider: (provider, patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            providers: { ...s.settings.providers, [provider]: { ...s.settings.providers[provider], ...patch } },
          },
        })),

      saveGpt: (gpt) =>
        set((s) => {
          const exists = s.gpts.some((g) => g.id === gpt.id);
          return { gpts: exists ? s.gpts.map((g) => (g.id === gpt.id ? gpt : g)) : [gpt, ...s.gpts] };
        }),

      deleteGpt: (id) =>
        set((s) => ({ gpts: s.gpts.filter((g) => g.id !== id), draftGptId: s.draftGptId === id ? null : s.draftGptId })),

      setView: (view) => set({ view, ...(isMobile() ? { sidebarOpen: false } : {}) }),
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      openSettings: (tab = "general") => set({ settingsOpen: tab }),
      openGptEditor: (gptId) => set({ gptEditor: { gptId } }),
      closeGptEditor: () => set({ gptEditor: null }),
      setSearchOpen: (open) => set({ searchOpen: open }),
      setServerConfig: (config) => set({ serverConfig: config }),
      setStreaming: (id, on) =>
        set((s) => {
          const streaming = { ...s.streaming };
          if (on) streaming[id] = true;
          else delete streaming[id];
          return { streaming };
        }),

      toast: (text, tone = "default") => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
      },

      askConfirm: (req) =>
        new Promise<boolean>((resolve) => {
          get().confirm?.resolve(false);
          set({ confirm: { ...req, resolve } });
        }),

      resolveConfirm: (ok) => {
        get().confirm?.resolve(ok);
        set({ confirm: null });
      },
    }),
    {
      name: "prism-store",
      version: 1,
      storage: createJSONStorage(() => debouncedLocalStorage()),
      partialize: (s) => ({ conversations: s.conversations, gpts: s.gpts, settings: s.settings }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const conversations = { ...(p.conversations ?? {}) };
        // 上次关闭页面时还在生成中的回答，标记为已停止
        for (const [id, c] of Object.entries(conversations)) {
          if (c.messages.some((m) => m.status === "streaming")) {
            conversations[id] = {
              ...c,
              messages: c.messages.map((m) => (m.status === "streaming" ? { ...m, status: "stopped" } : m)),
            };
          }
        }
        const s = p.settings;
        return {
          ...current,
          conversations,
          gpts: p.gpts ?? current.gpts,
          settings: s
            ? {
                ...DEFAULT_SETTINGS,
                ...s,
                providers: {
                  openai: { ...DEFAULT_SETTINGS.providers.openai, ...s.providers?.openai },
                  anthropic: { ...DEFAULT_SETTINGS.providers.anthropic, ...s.providers?.anthropic },
                },
                customInstructions: { ...DEFAULT_SETTINGS.customInstructions, ...s.customInstructions },
              }
            : current.settings,
        };
      },
    },
  ),
);

/** 某个服务商是否可用：浏览器里填了 Key，或者服务器配置了 Key */
export function providerReady(provider: ProviderId, settings: Settings, server: ServerConfig | null) {
  return Boolean(settings.providers[provider].apiKey.trim() || server?.providers[provider]?.serverKey);
}

export function providerModels(provider: ProviderId, settings: Settings, server: ServerConfig | null) {
  return [...new Set([...settings.providers[provider].models, ...(server?.providers[provider]?.models ?? [])])];
}
