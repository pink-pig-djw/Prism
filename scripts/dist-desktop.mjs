/**
 * 打包桌面安装包。额外参数会原样传给 electron-builder，例如：
 *   node scripts/dist-desktop.mjs --win      → Windows 安装包
 *   node scripts/dist-desktop.mjs --mac      → macOS dmg
 *   node scripts/dist-desktop.mjs --linux    → AppImage / deb
 * 以 build/desktop 作为项目目录运行，避免把根目录的 node_modules 打进安装包。
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "node_modules/electron-builder/cli.js"),
    "--projectDir",
    path.join(root, "build/desktop"),
    "--config",
    path.join(root, "electron-builder.config.cjs"),
    "--publish",
    "never",
    ...process.argv.slice(2),
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
