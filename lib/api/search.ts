/**
 * 通用搜索服务（Tavily / 博查）。和 core.ts 一样只依赖 fetch，网页、桌面、安卓三端共用。
 */
import type { SearchService, Source } from "../types";

export interface SearchHit extends Source {
  snippet: string;
}

export const SEARCH_ENDPOINTS: Record<SearchService, string> = {
  tavily: "https://api.tavily.com/search",
  bocha: "https://api.bochaai.com/v1/web-search",
};

export const SEARCH_NAMES: Record<SearchService, string> = { tavily: "Tavily", bocha: "博查" };

const MAX_SNIPPET = 1200;

interface Options {
  count?: number;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  endpoint?: string;
}

async function post(url: string, apiKey: string, body: unknown, opts: Options, service: SearchService) {
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    throw new Error(`无法连接到${SEARCH_NAMES[service]}搜索服务，请检查网络。`);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 不是 JSON，下面统一报错
  }
  if (!res.ok) {
    const d = data as { detail?: { error?: string } | string; message?: string; msg?: string } | null;
    const detail = typeof d?.detail === "string" ? d.detail : (d?.detail?.error ?? d?.message ?? d?.msg ?? text.slice(0, 200));
    const hint = res.status === 401 || res.status === 403 ? "API Key 无效" : res.status === 429 || res.status === 432 ? "额度不足或请求太频繁" : "请求失败";
    throw new Error(`联网搜索失败：${SEARCH_NAMES[service]} ${hint}（${res.status}）${detail ? `：${detail}` : ""}`);
  }
  if (!data) throw new Error(`联网搜索失败：${SEARCH_NAMES[service]} 返回了无法识别的内容。`);
  return data;
}

const clip = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, MAX_SNIPPET) : "");

export async function webSearch(service: SearchService, apiKey: string, query: string, opts: Options = {}): Promise<SearchHit[]> {
  const count = opts.count ?? 6;
  if (service === "tavily") {
    const data = (await post(
      opts.endpoint ?? SEARCH_ENDPOINTS.tavily,
      apiKey,
      // 新版用 Authorization 头鉴权，旧版读取 body 里的 api_key，两者都带上
      { api_key: apiKey, query, max_results: count, search_depth: "basic", include_answer: false },
      opts,
      service,
    )) as { results?: { title?: string; url?: string; content?: string; published_date?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title || r.url!, url: r.url!, snippet: clip(r.content), date: r.published_date?.slice(0, 10) }));
  }

  const data = (await post(
    opts.endpoint ?? SEARCH_ENDPOINTS.bocha,
    apiKey,
    { query, summary: true, count, freshness: "noLimit" },
    opts,
    service,
  )) as {
    code?: number;
    msg?: string;
    data?: { webPages?: { value?: BochaPage[] } };
    webPages?: { value?: BochaPage[] };
  };
  if (typeof data.code === "number" && data.code !== 200) {
    throw new Error(`联网搜索失败：博查返回错误（${data.code}）${data.msg ? `：${data.msg}` : ""}`);
  }
  const pages = data.data?.webPages?.value ?? data.webPages?.value ?? [];
  return pages
    .filter((p) => p.url)
    .slice(0, count)
    .map((p) => ({ title: p.name || p.url!, url: p.url!, snippet: clip(p.summary || p.snippet), date: p.datePublished?.slice(0, 10) }));
}

interface BochaPage {
  name?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  datePublished?: string;
}

/** 把搜索结果整理成放进提示词里的文字 */
export function formatResults(query: string, hits: SearchHit[], startIndex = 1): string {
  const date = new Date().toISOString().slice(0, 10);
  const items = hits
    .map((h, i) => [`[${startIndex + i}] ${h.title}`, `链接：${h.url}`, h.date ? `发布时间：${h.date}` : "", `内容：${h.snippet || "（无摘要）"}`].filter(Boolean).join("\n"))
    .join("\n\n");
  return `<search_results query="${query.replace(/"/g, "'")}" date="${date}">\n${items || "（没有搜索到相关结果）"}\n</search_results>`;
}
