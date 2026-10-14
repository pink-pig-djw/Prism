import { App } from "@capacitor/app";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { useStore } from "../store";

/** 安卓返回键：依次关闭弹窗、侧边栏、GPT 页面，回到新聊天，最后才把应用退到后台 */
export function setupMobileShell() {
  void App.addListener("backButton", () => {
    const s = useStore.getState();
    if (s.confirm) return s.resolveConfirm(false);
    if (s.gptEditor) return s.closeGptEditor();
    if (s.settingsOpen) return s.openSettings(null);
    if (s.searchOpen) return s.setSearchOpen(false);
    if (s.sidebarOpen) return s.setSidebarOpen(false);
    if (s.view === "gpts") return s.setView("chat");
    if (s.activeId || s.draftGptId) return s.newChat();
    void App.minimizeApp();
  });
}

/** 把导出的数据保存到「文档/Prism」目录，返回给用户看的路径 */
export async function saveToDocuments(name: string, content: string): Promise<string> {
  await Filesystem.writeFile({
    path: `Prism/${name}`,
    data: content,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  return `文档/Prism/${name}`;
}
