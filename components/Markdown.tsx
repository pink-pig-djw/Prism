"use client";

import { Check, Copy } from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { TARGET } from "@/lib/platform";
import type { Source } from "@/lib/types";
import { cn, copyText } from "@/lib/utils";

function CodeBlock({ children, language }: { children: ReactNode; language: string }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (await copyText(ref.current?.textContent ?? "")) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };
  return (
    <div className="not-prose my-4 overflow-hidden rounded-2xl border border-line bg-[var(--code-bg)]">
      <div className="flex items-center justify-between bg-[var(--code-head)] px-4 py-1.5 text-xs text-muted">
        <span className="font-mono lowercase">{language || "text"}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors hover:text-fg"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "已复制" : "复制代码"}
        </button>
      </div>
      <pre ref={ref} className="scroll-thin overflow-x-auto px-4 py-3.5 font-mono text-[13.5px] leading-[1.65]">
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  pre({ children }) {
    // 从 <code class="language-xxx"> 中取出语言名
    const child = Array.isArray(children) ? children[0] : children;
    const className = (child as { props?: { className?: string } })?.props?.className ?? "";
    const language = /language-([\w+#-]+)/.exec(className)?.[1] ?? "";
    return <CodeBlock language={language}>{children}</CodeBlock>;
  },
  table({ children }) {
    return (
      <div className="table-wrap scroll-thin">
        <table>{children}</table>
      </div>
    );
  },
  a({ children, href, title }) {
    // 联网搜索的来源编号，渲染成小圆角标
    if (title === "cite") {
      return (
        <a href={href} target={TARGET === "mobile" ? undefined : "_blank"} rel="noopener noreferrer" className="cite">
          {children}
        </a>
      );
    }
    return (
      // 安卓版里 target=_blank 不会打开新窗口；直接跳转时 Capacitor 会用系统浏览器打开外部链接
      <a href={href} target={TARGET === "mobile" ? undefined : "_blank"} rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

const remarkPlugins = [remarkGfm];
const rehypePlugins = [[rehypeHighlight, { detect: false }]] as never;

/** 把正文里的 [1]、[2] 换成指向对应来源的链接（代码块里的不处理） */
function linkCitations(content: string, sources?: Source[]) {
  if (!sources?.length) return content;
  return content
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/\[(\d{1,2})\](?![(:\[])/g, (m, n: string) => {
            const src = sources[Number(n) - 1];
            return src ? `[${n}](<${src.url}> "cite")` : m;
          }),
    )
    .join("");
}

export const Markdown = memo(function Markdown({
  content,
  streaming,
  sources,
}: {
  content: string;
  streaming?: boolean;
  sources?: Source[];
}) {
  return (
    <div className={cn("md", streaming && "streaming")}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {linkCitations(content, sources)}
      </ReactMarkdown>
    </div>
  );
});
