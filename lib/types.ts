export type ProviderId = "openai" | "anthropic";

export interface ModelRef {
  provider: ProviderId;
  model: string;
}

export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
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

export interface ChatRequestBody {
  provider: ProviderId;
  model: string;
  system?: string;
  messages: { role: Role; content: string }[];
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
}

export interface ServerConfig {
  accessCodeRequired: boolean;
  providers: Record<ProviderId, { serverKey: boolean; models: string[] }>;
}
