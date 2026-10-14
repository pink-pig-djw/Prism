/**
 * 构建桌面版 / 安卓版所需的静态文件。
 *   node scripts/build-app.mjs desktop   → build/desktop（交给 electron-builder 打包）
 *   node scripts/build-app.mjs mobile    → out/（交给 Capacitor 同步到 android/）
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (target !== "desktop" && target !== "mobile") {
  console.error("用法：node scripts/build-app.mjs <desktop|mobile>");
  process.exit(1);
}

// 1. 以静态导出模式构建页面
rmSync(path.join(root, "out"), { recursive: true, force: true });
const next = spawnSync(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "build"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PRISM_TARGET: target, NEXT_TELEMETRY_DISABLED: "1" },
});
if (next.status !== 0) process.exit(next.status ?? 1);
if (!existsSync(path.join(root, "out/index.html"))) {
  console.error("静态导出失败：没有找到 out/index.html");
  process.exit(1);
}

if (target === "desktop") {
  // 2. 组装 Electron 应用目录：静态页面 + 打包后的主进程 + 精简的 package.json
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const appDir = path.join(root, "build/desktop");
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
  cpSync(path.join(root, "out"), path.join(appDir, "web"), { recursive: true });
  cpSync(path.join(root, "build/resources/icon.png"), path.join(appDir, "icon.png"));

  await build({
    entryPoints: [path.join(root, "electron/main.ts")],
    outfile: path.join(appDir, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    minify: true,
    legalComments: "none",
    logLevel: "info",
  });

  writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "prism",
        productName: "Prism",
        version: pkg.version,
        description: pkg.description,
        author: pkg.author,
        homepage: pkg.homepage,
        main: "main.cjs",
        // Linux 桌面环境用它把窗口和 .desktop 启动项关联起来
        desktopName: "prism.desktop",
        // 主进程已用 esbuild 打包成单文件，不需要任何 node_modules
        dependencies: {},
      },
      null,
      2,
    ),
  );
  console.log("\n✓ 桌面版文件已生成：build/desktop");
} else {
  console.log("\n✓ 安卓版静态文件已生成：out/（接下来运行 npx cap sync android）");
}
