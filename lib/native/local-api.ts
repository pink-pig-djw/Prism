/**
 * 安卓版没有服务端：拦截页面里对 /api/* 的 fetch，直接在 WebView 中运行 lib/api/core.ts。
 *
 * 模型接口优先用浏览器 fetch 直连（支持流式输出）；如果服务商不允许跨域，
 * 再改用 Capacitor 的原生网络请求（不受跨域限制，但会等完整回答返回后一次性显示）。
 */
export function installLocalApi() {
  const original = window.fetch.bind(window);
  const upstreamFetch = withNativeFallback(original);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return original(input, init);
    const { routeApi } = await import("../api/core");
    return routeApi(new Request(input instanceof Request ? input : url, init), { browser: true, fetch: upstreamFetch });
  };
}

function withNativeFallback(original: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await original(input, init);
    } catch (err) {
      const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
      if (signal?.aborted) throw err;
      return nativeRequest(new Request(input, init));
    }
  };
}

async function nativeRequest(req: Request): Promise<Response> {
  const { CapacitorHttp } = await import("@capacitor/core");
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => (headers[key] = value));
  const text = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  let data: unknown = text || undefined;
  if (text && /json/i.test(headers["content-type"] ?? "")) {
    try {
      data = JSON.parse(text);
    } catch {
      // 保持原始字符串
    }
  }
  const res = await CapacitorHttp.request({ url: req.url, method: req.method, headers, data, responseType: "text" });
  const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
  return new Response(body, { status: res.status, headers: res.headers });
}
