import "server-only";
import type { ApiEnv } from "./core";

function list(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 网页版服务端：从环境变量读取预置的 Key 和访问密码 */
export function serverEnv(): ApiEnv {
  return {
    accessCode: process.env.ACCESS_CODE || undefined,
    searchKeys: {
      tavily: process.env.TAVILY_API_KEY?.trim() || undefined,
      bocha: process.env.BOCHA_API_KEY?.trim() || undefined,
    },
    searchEndpoints: {
      tavily: process.env.TAVILY_BASE_URL?.trim() || undefined,
      bocha: process.env.BOCHA_BASE_URL?.trim() || undefined,
    },
    serverKeys: {
      openai: {
        apiKey: process.env.OPENAI_API_KEY?.trim(),
        baseUrl: process.env.OPENAI_BASE_URL?.trim(),
        models: list("OPENAI_MODELS"),
      },
      anthropic: {
        apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
        baseUrl: process.env.ANTHROPIC_BASE_URL?.trim(),
        models: list("ANTHROPIC_MODELS"),
      },
    },
  };
}
