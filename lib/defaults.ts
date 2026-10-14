import type { GPT, Settings } from "./types";

export const DEFAULT_MODELS = {
  openai: ["gpt-5.5", "gpt-5.4-mini"],
  anthropic: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  providers: {
    openai: { apiKey: "", baseUrl: "", models: DEFAULT_MODELS.openai },
    anthropic: { apiKey: "", baseUrl: "", models: DEFAULT_MODELS.anthropic, maxTokens: 32000 },
  },
  defaultModel: { provider: "anthropic", model: "claude-opus-5-5" },
  customInstructions: { enabled: true, aboutUser: "", responseStyle: "" },
  autoTitle: true,
  accessCode: "",
};

export const GPT_COLORS = ["#f87171", "#fb923c", "#f5b33c", "#34d399", "#2dd4bf", "#60a5fa", "#818cf8", "#c084fc", "#f472b6", "#94a3b8"];

const now = 0;

export const PRESET_GPTS: GPT[] = [
  {
    id: "preset-translator",
    name: "翻译大师",
    description: "中英日互译，译文地道自然，还会解释难点",
    emoji: "🌐",
    color: "#60a5fa",
    instructions:
      "你是一位资深翻译。用户发来中文时翻译成地道的英文，发来其他语言时翻译成流畅的中文。\n" +
      "要求：\n1. 先给出译文，保持原文的格式和语气；\n2. 如果原文有俚语、习语或文化背景，在译文后用「注」简要说明；\n3. 用户明确指定目标语言时，以用户指定的为准。",
    starters: ["The early bird catches the worm.", "把「今天的会议推迟到下午三点」翻译成英文", "解释一下 break the ice 的用法"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preset-coder",
    name: "编程助手",
    description: "写代码、查 Bug、讲原理，资深工程师随叫随到",
    emoji: "💻",
    color: "#34d399",
    instructions:
      "你是一位经验丰富的全栈工程师和耐心的导师。\n" +
      "- 给出可以直接运行的完整代码，并标注语言；\n- 解释关键思路，而不是逐行复述代码；\n- 发现用户代码中的潜在问题（边界条件、性能、安全）时主动指出；\n- 不确定的地方坦诚说明。",
    starters: ["用 Python 写一个快速排序并解释", "解释一下 JavaScript 的事件循环", "帮我写一个正则表达式匹配邮箱"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preset-writer",
    name: "写作润色",
    description: "让文字更清晰、更有感染力，保留你的风格",
    emoji: "✍️",
    color: "#f5b33c",
    instructions:
      "你是一位专业的中文编辑。用户给出文字后：\n1. 输出润色后的完整版本；\n2. 用简短的列表说明主要修改点及原因；\n3. 尽量保留作者原本的语气和风格，不要过度修饰。",
    starters: ["帮我润色一段自我介绍", "把这句话改得更有说服力：我们的产品很好用", "写一段朋友圈文案，主题是周末去爬山"],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "preset-english",
    name: "英语口语陪练",
    description: "用英语陪你聊天，顺便帮你纠正语法",
    emoji: "🗣️",
    color: "#f472b6",
    instructions:
      "You are a friendly English conversation partner. Always reply in simple, natural English and keep the conversation going with a follow-up question. " +
      "If the user's message contains grammar or wording mistakes, add a short section at the end titled「纠错」in Chinese, listing the corrections.",
    starters: ["Let's talk about travel!", "How do I introduce myself in a job interview?", "I want practice ordering food at a restaurant"],
    createdAt: now,
    updatedAt: now,
  },
];
