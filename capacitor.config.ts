import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.prism.chat",
  appName: "Prism",
  // 由 `node scripts/build-app.mjs mobile` 生成
  webDir: "out",
  android: {
    // 允许连接局域网里的 http 服务（例如 Ollama）
    allowMixedContent: true,
  },
  plugins: {
    SystemBars: { insetsHandling: "css", initialViewportFitValueHint: "cover" },
  },
};

export default config;
