/**
 * Prism 桌面版主进程。
 * 页面通过自定义协议 app://prism/ 加载打包好的静态文件；
 * 页面里对 /api/* 的请求也走这个协议，由主进程调用 lib/api/core.ts 处理（Node 环境，没有跨域限制）。
 */
import { app, BrowserWindow, Menu, nativeTheme, protocol, shell } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { routeApi } from "../lib/api/core";
import { setupAutoUpdate } from "./updater";

const SCHEME = "app";
const ORIGIN = `${SCHEME}://prism`;
const WEB_ROOT = path.join(__dirname, "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

async function serveStatic(url: URL): Promise<Response> {
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith("/")) rel += "index.html";
  let file = path.normalize(path.join(WEB_ROOT, rel));
  if (!file.startsWith(WEB_ROOT + path.sep)) return new Response("Forbidden", { status: 403 });
  // 单页应用：没有扩展名的路径都回退到首页
  if (!path.extname(file)) file = path.join(WEB_ROOT, "index.html");
  try {
    const data = await readFile(file);
    return new Response(data, {
      headers: { "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

function isExternal(url: string) {
  return /^(https?|mailto):/i.test(url);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 380,
    minHeight: 520,
    title: "Prism",
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#212121" : "#ffffff",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });

  win.once("ready-to-show", () => win.show());

  // 回答里的链接用系统浏览器打开，应用窗口本身不跳转到外部网站
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(ORIGIN)) return;
    event.preventDefault();
    if (isExternal(url)) void shell.openExternal(url);
  });

  // Electron 默认没有右键菜单，补上复制粘贴
  win.webContents.on("context-menu", (_event, params) => {
    const items: Electron.MenuItemConstructorOptions[] = [];
    if (params.isEditable) {
      items.push({ role: "cut", label: "剪切" }, { role: "copy", label: "复制" }, { role: "paste", label: "粘贴" });
      items.push({ type: "separator" }, { role: "selectAll", label: "全选" });
    } else if (params.selectionText.trim()) {
      items.push({ role: "copy", label: "复制" });
    }
    if (params.linkURL && isExternal(params.linkURL)) {
      if (items.length) items.push({ type: "separator" });
      items.push({ label: "在浏览器中打开链接", click: () => void shell.openExternal(params.linkURL) });
    }
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });

  void win.loadURL(`${ORIGIN}/`);
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (req) => {
      const url = new URL(req.url);
      if (url.pathname.startsWith("/api/")) return routeApi(req, {});
      return serveStatic(url);
    });
    createWindow();
    setupAutoUpdate();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
