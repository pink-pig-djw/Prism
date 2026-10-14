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
  ...(isApp ? { output: "export", pageExtensions: ["tsx"], distDir: ".next-app", images: { unoptimized: true } } : {}),
};

export default nextConfig;
