# Prism

一个仿 ChatGPT 的 AI 聊天应用，提供**网页版、Windows / macOS / Linux 桌面版和安卓版**，界面简洁精致，支持 **OpenAI 兼容接口** 和 **Anthropic Claude**。

## 功能

- 💬 **流式对话**：逐字输出，可随时停止；支持 Markdown、表格、代码高亮与一键复制
- 🧠 **思考过程**：DeepSeek / 通义千问等推理模型的思考内容可折叠查看
- ✏️ **编辑与重新生成**：修改已发送的问题重新提问，或重新生成最后一条回答
- 🗂️ **会话管理**：按时间分组的历史记录、自动生成标题、重命名、置顶、删除、全文搜索（Ctrl/⌘ + K）
- 🤖 **GPT**：创建带专属指令、头像、开场白和默认模型的助手，内置翻译、编程、写作、英语陪练 4 个示例
- 🙋 **自定义指令**：告诉模型你是谁、希望它怎样回复
- 🔀 **多模型切换**：顶部一键切换 Claude / GPT / DeepSeek 等模型，可自动获取服务商的模型列表
- 🌗 **深浅色主题**、移动端适配，可「添加到主屏幕」像原生 App 一样使用
- 💾 聊天记录保存在浏览器本地，可导出 / 导入 JSON

## 下载安装

| 平台 | 安装包 | 首次打开 |
| --- | --- | --- |
| Windows | `Prism-x.y.z-windows-x64-setup.exe` | 如果弹出「Windows 已保护你的电脑」，点「更多信息 → 仍要运行」 |
| macOS（Apple 芯片 / Intel） | `Prism-x.y.z-mac-arm64.dmg` / `…-mac-x64.dmg` | 拖进「应用程序」后，在 Finder 中右键 Prism →「打开」；或到「系统设置 → 隐私与安全性」点「仍要打开」 |
| Linux | `.AppImage`（加执行权限后直接运行）或 `.deb` | — |
| 安卓 | `Prism-x.y.z-android.apk` | 允许「安装未知来源应用」后安装 |

**下载位置**：

- 正式版本：仓库的 [Releases](https://github.com/pink-pig-djw/Prism/releases) 页面（推送 `v` 开头的标签时自动发布）；
- 最新构建：仓库的 [Actions → 构建应用](https://github.com/pink-pig-djw/Prism/actions/workflows/build-apps.yml)，打开最近一次成功的运行，在页面底部的 Artifacts 中下载（需登录 GitHub，文件是 zip 压缩包）。

> 安装包没有购买 Windows / Apple 的商业签名证书，所以首次打开时系统会提示风险，按上表操作即可。

桌面版和安卓版都**不需要服务器**：打开后在「设置 → 模型服务」里填入 API Key 就能聊天，数据只保存在本机。

- 桌面版：对话请求由应用自己发出，所有服务商都能用；
- 安卓版：优先流式直连。个别服务商不允许网页直连（跨域限制）时，会自动改走系统网络请求，此时回答会在生成完后一次性显示。

## 快速开始（网页版）

需要 Node.js 20+。

```bash
npm install
npm run dev        # 开发模式：http://localhost:3000
```

打开页面后点击 **设置 → 模型服务**，填入任意一家的 API Key 即可开始对话：

| 服务商 | 类型 | 接口地址 |
| --- | --- | --- |
| Anthropic Claude | Anthropic | 留空（默认 `https://api.anthropic.com`） |
| OpenAI | OpenAI 兼容 | 留空（默认 `https://api.openai.com/v1`） |
| DeepSeek | OpenAI 兼容 | `https://api.deepseek.com/v1` |
| 通义千问 | OpenAI 兼容 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Ollama（本地） | OpenAI 兼容 | `http://localhost:11434/v1` |

填好后点「获取模型列表」即可验证连接并拉取可用模型，也可以手动输入模型 ID。

## 部署

```bash
npm run build
npm start          # 默认端口 3000，可用 -p 指定
```

也可以直接导入到 Vercel 等支持 Next.js 的平台。

### 服务器端 Key（可选）

如果希望访问者不用自己填 Key，可以在服务器上配置环境变量（参考 `.env.example`）：

| 变量 | 说明 |
| --- | --- |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODELS` | OpenAI 兼容接口的 Key、地址和模型列表（逗号分隔） |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODELS` | Anthropic 的 Key、地址和模型列表 |
| `ACCESS_CODE` | 访问密码。部署到公网并配置了服务器 Key 时**强烈建议设置**，否则任何人都能消耗你的额度 |

使用服务器 Key 时会忽略网页端填写的接口地址，避免 Key 被发往第三方。

## 自己打包

```bash
npm run desktop            # 本地以桌面应用方式运行
npm run dist:desktop       # 打包当前系统的桌面安装包，输出到 dist/
npm run build:android      # 生成安卓工程所需的文件，然后用 Android Studio 打开 android/ 目录构建
```

Windows 安装包需要在 Windows 上打包，macOS 安装包需要在 Mac 上打包。推送代码后 GitHub Actions 会在三个系统上自动完成，见 `.github/workflows/build-apps.yml`。

### 安卓签名证书（可选）

不配置时 APK 使用临时的调试证书签名，可以正常安装，但每次构建的证书不同，**升级时需要先卸载旧版**（聊天记录会丢失，可先在设置里导出）。想要固定签名，可以生成一个证书：

```bash
keytool -genkeypair -v -keystore prism.jks -alias prism -keyalg RSA -keysize 2048 -validity 36500
base64 -w0 prism.jks   # macOS 上用 base64 -i prism.jks
```

然后在仓库的 **Settings → Secrets and variables → Actions** 中添加：`ANDROID_KEYSTORE_BASE64`（上面输出的内容）、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`（例如 `prism`）、`ANDROID_KEY_PASSWORD`。

## 实现说明

- 技术栈：Next.js 16（App Router）+ React 19 + Tailwind CSS 4 + Zustand；桌面版 Electron，安卓版 Capacitor
- 页面统一请求 `/api/chat`，由 `lib/api/core.ts` 用官方 SDK（`@anthropic-ai/sdk`、`openai`）调用上游并以 NDJSON 流式返回。这段逻辑在三端共用：
  - 网页版：运行在 Next.js 服务端路由里；
  - 桌面版：运行在 Electron 主进程里（页面通过 `app://prism/` 协议加载，`/api` 请求由主进程处理）；
  - 安卓版：直接运行在 WebView 里（`lib/native/local-api.ts` 拦截 `/api` 请求）
- Claude Opus 5.5 / Sonnet 5.5 等模型在官方接口上开启了服务端降级（`fallbacks: "default"`）：请求被安全策略拒绝时会自动换用其他模型重试

### 安全提示

- 网页端填写的 API Key 只保存在你的浏览器（localStorage）里，每次请求时随请求发给本应用的服务端转发，服务端不做存储
- 服务端会按用户填写的「接口地址」发起请求。如果部署在公网，别人也可以借你的服务器访问任意地址（包括内网），请只在可信环境中使用，或在前面加一层访问控制

## 目录结构

```
app/api/                网页版的服务端路由（转发给 lib/api/core.ts）
components/             界面组件（侧边栏、聊天、输入框、设置、GPT 编辑器…）
lib/
  api/core.ts           调用 OpenAI / Anthropic 的核心逻辑（三端共用）
  native/               安卓版：页面内的 /api 处理、返回键、导出文件
  chat.ts               前端发送、停止、编辑、重新生成、自动标题
  store.ts              全局状态与本地持久化
electron/main.ts        桌面版主进程
android/                安卓工程（Capacitor 生成）
scripts/                桌面 / 安卓打包脚本
public/                 PWA 图标与 Service Worker
```
