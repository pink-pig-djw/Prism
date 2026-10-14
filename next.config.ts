import type { NextConfig } from "next";

/**
 * PRISM_TARGET=desktop | mobile 时输出纯静态文件，供 Electron / Capacitor 打包：
 * - 只把 .tsx 当作路由文件，从而跳过 app/api 下的服务端路由（route.ts）；
 * - 这两个平台上的 /api 请求分别由 Electron 主进程和 WebView 内的 lib/api/core.ts 处理。
 */
const target = process.env.PRISM_TARGET === "desktop" || process.env.PRISM_TARGET === "mobile" ? process.env.PRISM_TARGET : "web";
const isApp = target !== "web";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  env: { NEXT_PUBLIC_PRISM_TARGET: target },
  // 静态导出的文件输出到 out/。注意构建过程仍使用 .next 目录，会覆盖网页版的构建结果
  ...(isApp ? { output: "export", pageExtensions: ["tsx"], images: { unoptimized: true } } : {}),
};

export default nextConfig;
