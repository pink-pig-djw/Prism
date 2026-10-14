"use client";

import { useEffect } from "react";
import { installLocalApi } from "@/lib/native/local-api";
import { TARGET } from "@/lib/platform";
import { useStore } from "@/lib/store";
import type { ServerConfig } from "@/lib/types";
import { ChatView } from "./ChatView";
import { GptEditor } from "./GptEditor";
import { GptExplore } from "./GptExplore";
import { ConfirmDialog, SearchDialog, Toaster } from "./Overlays";
import { SettingsDialog } from "./SettingsDialog";
import { Sidebar } from "./Sidebar";

// 安卓版没有服务端，/api 请求在 WebView 内处理；必须在任何请求发出之前安装
if (TARGET === "mobile" && typeof window !== "undefined") installLocalApi();

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#212121" : "#ffffff");
    };
    apply();
    try {
      localStorage.setItem("prism-theme", theme);
    } catch {
      // 无痕模式下可能无法写入
    }
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export default function App() {
  const view = useStore((s) => s.view);
  useTheme();

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json() as Promise<ServerConfig>)
      .then((config) => useStore.getState().setServerConfig(config))
      .catch(() =>
        useStore.getState().setServerConfig({
          accessCodeRequired: false,
          providers: { openai: { serverKey: false, models: [] }, anthropic: { serverKey: false, models: [] } },
        }),
      );

    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        useStore.getState().newChat();
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        useStore.getState().setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);

    if (TARGET === "web" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (TARGET === "mobile") void import("@/lib/native/mobile").then((m) => m.setupMobileShell());
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh overflow-hidden bg-main pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-fg">
      <Sidebar />
      <main className="relative min-w-0 flex-1">{view === "gpts" ? <GptExplore /> : <ChatView />}</main>
      <SettingsDialog />
      <GptEditor />
      <SearchDialog />
      <ConfirmDialog />
      <Toaster />
    </div>
  );
}
