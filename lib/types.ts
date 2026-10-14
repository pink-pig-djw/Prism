export type ProviderId = "openai" | "anthropic";

export interface ModelRef {
  provider: ProviderId;
  model: string;
}

export type Role = "user" | "assistant";

/** 消息里附带的图片。图片数据单独存放在 IndexedDB（见 lib/images.ts），这里只记录引用 */
export interface ImageRef {
  id: string;
  mimeType: string;
  width: number;
  height: number;
}

/** 消息里附带的文件（PDF、Word、文本/代码）。提取出的文字和原始 PDF 同样存放在 IndexedDB */
export interface FileRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "pdf" | "docx" | "text";
  /** 提取出的文字长度 */
  chars: number;
  pages?: number;
  /** 文字过长被截断 */
  truncated?: boolean;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  images?: ImageRef[];
  files?: FileRef[];
  /** 模型的思考过程（DeepSeek reasoning_content / Claude thinking） */
  reasoning?: string;
  /** 生成这条回答所用的模型 */
  model?: string;
  status?: "streaming" | "done" | "error" | "stopped";
  error?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  /** 标题是否已经由模型自动生成或被用户手动修改过 */
  titled?: boolean;
  messages: Message[];
  gptId?: string;
  model: ModelRef;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GPT {
  id: string;
  name: string;
  description: string;
  instructions: string;
  starters: string[];
  emoji: string;
  color: string;
  /** 不设置时跟随当前选择的模型 */
  model?: ModelRef;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderSettings {
  apiKey: string;
  baseUrl: string;
  models: string[];
  /** 仅 Anthropic 使用：单次回答的最大输出 token 数 */
  maxTokens?: number;
}

export interface Settings {
  theme: "system" | "light" | "dark";
  providers: Record<ProviderId, ProviderSettings>;
  defaultModel: ModelRef;
  customInstructions: {
    enabled: boolean;
    aboutUser: string;
    responseStyle: string;
  };
  autoTitle: boolean;
  accessCode: string;
}

/** /api/chat 返回的 NDJSON 流中的一行 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  /** 模型中途切换（Claude 安全拒答后自动降级），之前输出的内容作废 */
  | { type: "reset" }
  | { type: "error"; message: string }
  | { type: "done"; stopReason?: string | null };

/** 发送给模型的图片：base64 数据（不含 data: 前缀） */
export interface ImagePayload {
  mimeType: string;
  data: string;
}

/** 发送给模型的文件：提取出的文字；PDF 还附带原始数据（base64），Claude 可以直接阅读其中的图表和排版 */
export interface FilePayload {
  name: string;
  kind: FileRef["kind"];
  text: string;
  pdf?: string;
}

export interface ChatMessagePayload {
  role: Role;
  content: string;
  images?: ImagePayload[];
  files?: FilePayload[];
}

export interface ChatRequestBody {
  provider: ProviderId;
  model: string;
  system?: string;
  messages: ChatMessagePayload[];
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export interface ServerConfig {
  accessCodeRequired: boolean;
  providers: Record<ProviderId, { serverKey: boolean; models: string[] }>;
}
