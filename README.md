# Prism

一个仿 ChatGPT 的 AI 聊天应用（Web App + PWA），界面简洁精致，支持 **OpenAI 兼容接口** 和 **Anthropic Claude**。

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

## 快速开始

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

## 实现说明

- 技术栈：Next.js 16（App Router）+ React 19 + Tailwind CSS 4 + Zustand
- 浏览器通过 `/api/chat` 发送请求，服务端用官方 SDK（`@anthropic-ai/sdk`、`openai`）调用上游并以 NDJSON 流式返回，因此不受浏览器跨域限制
- Claude Opus 5.5 / Sonnet 5.5 等模型在官方接口上开启了服务端降级（`fallbacks: "default"`）：请求被安全策略拒绝时会自动换用其他模型重试

### 安全提示

- 网页端填写的 API Key 只保存在你的浏览器（localStorage）里，每次请求时随请求发给本应用的服务端转发，服务端不做存储
- 服务端会按用户填写的「接口地址」发起请求。如果部署在公网，别人也可以借你的服务器访问任意地址（包括内网），请只在可信环境中使用，或在前面加一层访问控制

## 目录结构

```
app/
  api/chat/route.ts     流式聊天代理
  api/models/route.ts   获取模型列表
  api/config/route.ts   服务器配置信息（是否配置了服务器 Key 等）
components/             界面组件（侧边栏、聊天、输入框、设置、GPT 编辑器…）
lib/
  server.ts             调用 OpenAI / Anthropic 的服务端逻辑
  chat.ts               前端发送、停止、编辑、重新生成、自动标题
  store.ts              全局状态与本地持久化
public/                 PWA 图标与 Service Worker
```
