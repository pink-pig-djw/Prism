/**
 * Windows 自动更新：从 GitHub Releases 检查新版本，后台下载，下载完成后询问是否重启安装。
 * 选择「稍后」时，会在下次退出应用时自动安装。
 * macOS 的自动更新要求苹果开发者证书签名，Linux 暂未开启，所以只在 Windows 上启用。
 */
import { app, BrowserWindow, dialog } from "electron";
import { autoUpdater } from "electron-updater";

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export function setupAutoUpdate() {
  if (process.platform !== "win32" || !app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  let prompted = false;
  autoUpdater.on("update-downloaded", async (info) => {
    if (prompted) return;
    prompted = true;
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const options = {
      type: "info" as const,
      title: "Prism 有新版本",
      message: `新版本 ${info.version} 已经下载好了`,
      detail: "现在重启即可完成更新，聊天记录和设置都会保留。\n选择「稍后」的话，会在你下次退出 Prism 时自动安装。",
      buttons: ["立即重启更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
    };
    const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    if (response === 0) setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });

  // 网络不通或 GitHub 暂时访问不了时静默失败，下次再试
  autoUpdater.on("error", (err) => console.warn("检查更新失败：", err?.message ?? err));

  const check = () => void autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 5000);
  setInterval(check, CHECK_INTERVAL);
}
