# Prism

一个仿 ChatGPT 的 AI 聊天应用，提供**网页版、Windows / macOS / Linux 桌面版和安卓版**，界面简洁精致，支持 **OpenAI 兼容接口** 和 **Anthropic Claude**。

## 功能

- 💬 **流式对话**：逐字输出，可随时停止；支持 Markdown、表格、代码高亮与一键复制
- 🖼️ **看图和读文件**：点 📎、粘贴截图或直接拖进窗口，即可发送图片（JPG / PNG / WebP / GIF）、PDF、Word（.docx）、文本和代码文件
  - Claude 直接阅读 PDF 原文（包括图表和排版）；OpenAI 兼容接口会先在本地提取 PDF 文字再发送，所以不支持文件输入的模型也能用
  - 大图会自动压缩到长边 1568px；GBK 编码的中文文本文件也能正确识别
  - 看图需要模型本身支持识图（例如 Claude、GPT-5.5、通义千问 VL）；纯文本模型（例如 deepseek-chat）可以读文件但不能看图
- 🌐 **联网搜索**：点输入框上的「联网」打开后，每条消息都会先搜索再回答，正文里用 ①② 角标标注来源，回答下方列出参考链接
  - Claude（官方接口）默认使用 Anthropic 自带的搜索，由模型自己决定搜什么、搜几次，不用额外申请 Key，搜索按次另外计费
  - DeepSeek、GPT 等其他模型使用通用搜索服务：[Tavily](https://tavily.com)（海外，每月有免费额度）或 [博查](https://open.bochaai.com)（国内，中文结果更好），在「设置 → 联网搜索」填入对应的 API Key 即可；追问（例如「那明天呢？」）会先由模型改写成完整的搜索词
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

### 自动更新

- **Windows**：打开 Prism 后会自动到 GitHub Releases 检查新版本（之后每 6 小时检查一次），在后台下载好之后询问是否重启更新；选择「稍后」则在下次退出时自动安装。聊天记录和设置都会保留。
- macOS / Linux / 安卓暂时需要手动下载新版本覆盖安装。

发布新版本（二选一）：

- 在仓库的 **Actions → 构建应用 → Run workflow** 里填写版本号（例如 `0.2.0`）后运行，流程会自动创建标签并发布；
- 或者推送一个 `v` 开头的标签：`git tag v0.2.0 && git push origin v0.2.0`。

GitHub Actions 会用这个版本号构建全部安装包并发布到 Releases，已安装的 Windows 版就会收到更新。版本号要比上一次大。注意自动更新只认 Releases 里的正式版本，Actions 页面下载的测试包不会触发更新；另外需要能访问 github.com。

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
| `TAVILY_API_KEY` / `BOCHA_API_KEY` | 联网搜索服务的 Key（可选），配置后访问者不用自己填 |
| `ACCESS_CODE` | 访问密码。部署到公网并配置了服务器 Key 时**强烈建议设置**，否则任何人都能消耗你的额度 |

使用服务器 Key 时会忽略网页端填写的接口地址，避免 Key 被发往第三方。

## 自己打包

```bash
npm run desktop            # 本地以桌面应用方式运行
npm run dist:desktop       # 打包当前系统的桌面安装包，输出到 dist/
npm run build:android      # 生成安卓工程所需的文件，然后用 Android Studio 打开 android/ 目录构建
```

桌面版 / 安卓版的构建同样使用 `.next` 目录，会覆盖网页版的构建结果，之后想运行网页版请重新执行 `npm run build`。

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

### 附件相关的限制

- 图片和文件保存在本机的 IndexedDB 里（聊天记录本身在 localStorage），导出数据时会一并打包；
- 为了让模型记得前面发过的图片和文件，每次提问都会带上本对话里的全部附件。单次请求的附件总量上限约 30MB，超过时请新开一个对话；
- 部署在 Vercel 上时，平台限制单次请求不能超过 4.5MB，附件多的对话可能会失败；自建服务器、桌面版和安卓版没有这个限制。

### 安全提示

- 网页端填写的 API Key 只保存在你的浏览器（localStorage）里，每次请求时随请求发给本应用的服务端转发，服务端不做存储
- 服务端会按用户填写的「接口地址」发起请求。如果部署在公网，别人也可以借你的服务器访问任意地址（包括内网），请只在可信环境中使用，或在前面加一层访问控制

## 目录结构

```
app/api/                网页版的服务端路由（转发给 lib/api/core.ts）
components/             界面组件（侧边栏、聊天、输入框、设置、GPT 编辑器…）
lib/
  api/core.ts           调用 OpenAI / Anthropic 的核心逻辑（三端共用）
  api/search.ts         通用搜索服务（Tavily / 博查）
  attachments.ts        图片压缩、PDF / Word / 文本提取、附件本地存储
  native/               安卓版：页面内的 /api 处理、返回键、导出文件
  chat.ts               前端发送、停止、编辑、重新生成、自动标题
  store.ts              全局状态与本地持久化
electron/main.ts        桌面版主进程
android/                安卓工程（Capacitor 生成）
scripts/                桌面 / 安卓打包脚本
public/                 PWA 图标与 Service Worker
```
