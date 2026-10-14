"use client";

import { Check, Database, Download, Eye, EyeOff, Loader2, Plug, RefreshCw, Settings2, Trash2, Upload, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import { fetchModels } from "@/lib/chat";
import { DEFAULT_MODELS } from "@/lib/defaults";
import { useStore, type SettingsTab } from "@/lib/store";
import type { ProviderId } from "@/lib/types";
import { cn, downloadFile, prettyModel, PROVIDER_LABEL } from "@/lib/utils";
import { Button, Dialog, Field, inputClass, Switch } from "./ui";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "常规", icon: <Settings2 size={16} /> },
  { id: "models", label: "模型服务", icon: <Plug size={16} /> },
  { id: "personalization", label: "个性化", icon: <UserRound size={16} /> },
  { id: "data", label: "数据管理", icon: <Database size={16} /> },
];

/** 获取模型列表时过滤掉明显不能用来聊天的模型 */
const NON_CHAT = /embed|tts|whisper|dall-e|moderation|audio|realtime|transcribe|image|search|davinci|babbage|rerank|speech/i;

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line py-4 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm">{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-subtle">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function General() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  return (
    <div>
      <Row title="主题">
        <div className="flex rounded-full bg-soft p-0.5 text-[13px]">
          {(
            [
              ["system", "跟随系统"],
              ["light", "浅色"],
              ["dark", "深色"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => update((s) => ({ ...s, theme: value }))}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors",
                settings.theme === value ? "bg-main font-medium shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </Row>
      <Row title="自动生成对话标题" desc="第一轮回答结束后，让模型为对话起一个简短的标题（会额外消耗少量 token）。">
        <Switch checked={settings.autoTitle} onChange={(v) => update((s) => ({ ...s, autoTitle: v }))} />
      </Row>
      <Row title="快捷键" desc="新聊天 Ctrl/⌘ + Shift + O · 搜索聊天 Ctrl/⌘ + K · Enter 发送，Shift + Enter 换行">
        <span />
      </Row>
    </div>
  );
}

function SecretInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className={cn(inputClass, "pr-10 font-mono")}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        aria-label={show ? "隐藏" : "显示"}
        onClick={() => setShow((v) => !v)}
        className="absolute top-1/2 right-2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-subtle hover:text-fg"
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderId }) {
  const config = useStore((s) => s.settings.providers[provider]);
  const serverInfo = useStore((s) => s.serverConfig?.providers[provider]);
  const updateProvider = useStore((s) => s.updateProvider);
  const [newModel, setNewModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const connected = Boolean(config.apiKey.trim()) || Boolean(serverInfo?.serverKey);
  const isOpenAI = provider === "openai";

  const addModel = () => {
    const m = newModel.trim();
    if (m && !config.models.includes(m)) updateProvider(provider, { models: [...config.models, m] });
    setNewModel("");
  };

  const loadModels = async () => {
    setLoading(true);
    setStatus(null);
    try {
      const all = await fetchModels(provider);
      const models = all.filter((m) => !NON_CHAT.test(m));
      if (models.length) updateProvider(provider, { models });
      setStatus({ ok: true, text: `连接成功，获取到 ${models.length} 个模型` });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-line p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{PROVIDER_LABEL[provider]}</h3>
          <p className="mt-0.5 text-xs text-subtle">
            {isOpenAI ? "OpenAI、DeepSeek、通义千问、Kimi、智谱、Ollama、OpenRouter 等" : "Claude Opus / Sonnet / Haiku 官方接口或兼容中转"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
            connected ? "bg-[#10a37f]/12 text-[#0d8a6a] dark:text-[#4ade80]" : "bg-soft text-subtle",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", connected ? "bg-[#10a37f]" : "bg-subtle")} />
          {config.apiKey.trim() ? "已填写 Key" : serverInfo?.serverKey ? "使用服务器 Key" : "未配置"}
        </span>
      </div>

      <div className="space-y-4">
        <Field label="API Key" hint={serverInfo?.serverKey && !config.apiKey ? "服务器已配置 Key，可以留空直接使用。" : undefined}>
          <SecretInput
            value={config.apiKey}
            placeholder={isOpenAI ? "sk-..." : "sk-ant-..."}
            onChange={(v) => updateProvider(provider, { apiKey: v })}
          />
        </Field>
        <Field
          label="接口地址（可选）"
          hint={
            isOpenAI ? (
              <>
                留空使用 https://api.openai.com/v1。示例：DeepSeek <code>https://api.deepseek.com/v1</code> · 通义千问{" "}
                <code>https://dashscope.aliyuncs.com/compatible-mode/v1</code>
              </>
            ) : (
              "留空使用 https://api.anthropic.com，使用中转服务时填写其地址。"
            )
          }
        >
          <input
            className={cn(inputClass, "font-mono")}
            value={config.baseUrl}
            placeholder={isOpenAI ? "https://api.openai.com/v1" : "https://api.anthropic.com"}
            spellCheck={false}
            onChange={(e) => updateProvider(provider, { baseUrl: e.target.value })}
          />
        </Field>
        {!isOpenAI && (
          <Field label="单次回答最大 token 数" hint="默认 32000。部分中转或旧模型上限较低，如遇报错可调小。">
            <input
              type="number"
              min={256}
              step={1000}
              className={inputClass}
              value={config.maxTokens ?? 32000}
              onChange={(e) => updateProvider(provider, { maxTokens: Number(e.target.value) || undefined })}
            />
          </Field>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium">模型列表</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => updateProvider(provider, { models: DEFAULT_MODELS[provider] })}>
                恢复默认
              </Button>
              <Button size="sm" variant="secondary" onClick={loadModels} disabled={loading || !connected}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                获取模型列表
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-line-strong p-2">
            {config.models.map((m) => (
              <span key={m} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-soft py-1 pr-1 pl-2.5 text-[13px]">
                <span className="truncate" title={m}>
                  {prettyModel(m)}
                </span>
                <button
                  type="button"
                  aria-label={`移除 ${m}`}
                  onClick={() => updateProvider(provider, { models: config.models.filter((x) => x !== m) })}
                  className="flex h-5 w-5 items-center justify-center rounded-md text-subtle hover:bg-hover hover:text-fg"
                >
                  <X size={13} />
                </button>
              </span>
            ))}
            <input
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addModel();
                }
              }}
              onBlur={addModel}
              placeholder="输入模型 ID 后回车添加"
              className="min-w-[160px] flex-1 bg-transparent px-1.5 py-1 text-[13px] outline-none placeholder:text-subtle"
            />
          </div>
          {status && (
            <p className={cn("mt-2 flex items-start gap-1.5 text-xs leading-relaxed", status.ok ? "text-[#0d8a6a] dark:text-[#4ade80]" : "text-danger")}>
              {status.ok ? <Check size={14} className="mt-px shrink-0" /> : <X size={14} className="mt-px shrink-0" />}
              <span className="break-all">{status.text}</span>
            </p>
          )}
          {!status && !connected && <p className="mt-2 text-xs text-subtle">填写 API Key 后可以自动获取模型列表，也可以手动输入。</p>}
        </div>
      </div>
    </section>
  );
}

function Models() {
  const accessCodeRequired = useStore((s) => s.serverConfig?.accessCodeRequired);
  const accessCode = useStore((s) => s.settings.accessCode);
  const update = useStore((s) => s.updateSettings);
  return (
    <div className="space-y-4 py-4">
      <p className="rounded-xl bg-soft px-3.5 py-2.5 text-xs leading-relaxed text-muted">
        🔒 API Key 只保存在当前浏览器本地，发送消息时经由本应用的服务端转发给模型服务商，不会保存在服务器上。
      </p>
      {accessCodeRequired && (
        <Field label="访问密码" hint="管理员为服务器上的 API Key 设置了访问密码。使用你自己的 Key 时无需填写。">
          <SecretInput value={accessCode} placeholder="输入访问密码" onChange={(v) => update((s) => ({ ...s, accessCode: v }))} />
        </Field>
      )}
      <ProviderCard provider="anthropic" />
      <ProviderCard provider="openai" />
    </div>
  );
}

function Personalization() {
  const ci = useStore((s) => s.settings.customInstructions);
  const update = useStore((s) => s.updateSettings);
  const set = (patch: Partial<typeof ci>) => update((s) => ({ ...s, customInstructions: { ...s.customInstructions, ...patch } }));
  return (
    <div className="space-y-5 py-4">
      <Row title="启用自定义指令" desc="对所有新旧聊天生效（GPT 聊天使用 GPT 自己的指令）。">
        <Switch checked={ci.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <div className={cn("space-y-5 transition-opacity", !ci.enabled && "pointer-events-none opacity-50")}>
        <Field label="你希望 Prism 了解你哪些信息，以便提供更好的回复？">
          <textarea
            className={cn(inputClass, "scroll-thin min-h-[110px] resize-y leading-relaxed")}
            maxLength={1500}
            value={ci.aboutUser}
            placeholder={"例如：我在上海做前端开发，平时用 React 和 TypeScript，正在学习日语。"}
            onChange={(e) => set({ aboutUser: e.target.value })}
          />
        </Field>
        <Field label="你希望 Prism 怎样回复？">
          <textarea
            className={cn(inputClass, "scroll-thin min-h-[110px] resize-y leading-relaxed")}
            maxLength={1500}
            value={ci.responseStyle}
            placeholder={"例如：回答简洁直接，先给结论再解释；代码示例使用 TypeScript；语气轻松一点。"}
            onChange={(e) => set({ responseStyle: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

function Data() {
  const conversations = useStore((s) => s.conversations);
  const gpts = useStore((s) => s.gpts);
  const clear = useStore((s) => s.clearConversations);
  const importData = useStore((s) => s.importData);
  const askConfirm = useStore((s) => s.askConfirm);
  const toast = useStore((s) => s.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const count = Object.keys(conversations).length;

  return (
    <div>
      <Row title="导出数据" desc={`把 ${count} 个聊天和 ${gpts.length} 个 GPT 导出为 JSON 文件（不包含 API Key）。`}>
        <Button
          size="sm"
          onClick={() => {
            const data = { app: "prism", version: 1, exportedAt: new Date().toISOString(), conversations: Object.values(conversations), gpts };
            downloadFile(`prism-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2));
          }}
        >
          <Download size={14} />
          导出
        </Button>
      </Row>
      <Row title="导入数据" desc="从导出的 JSON 文件恢复聊天记录和 GPT。">
        <>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const n = importData(JSON.parse(await file.text()));
                toast(`已导入 ${n} 个聊天`);
              } catch {
                toast("文件格式不正确", "error");
              }
            }}
          />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <Upload size={14} />
            导入
          </Button>
        </>
      </Row>
      <Row title="删除所有聊天" desc="此操作无法撤销。GPT 和设置会保留。">
        <Button
          size="sm"
          variant="danger"
          disabled={count === 0}
          onClick={async () => {
            const ok = await askConfirm({
              title: "删除所有聊天？",
              message: `将永久删除全部 ${count} 个聊天记录。`,
              confirmText: "全部删除",
              danger: true,
            });
            if (ok) {
              clear();
              toast("已删除所有聊天");
            }
          }}
        >
          <Trash2 size={14} />
          全部删除
        </Button>
      </Row>
    </div>
  );
}

export function SettingsDialog() {
  const tab = useStore((s) => s.settingsOpen);
  const openSettings = useStore((s) => s.openSettings);
  const close = () => openSettings(null);

  return (
    <Dialog open={tab !== null} onClose={close} title="设置" className="sm:max-w-[760px]" scroll={false}>
      <div className="flex h-[min(640px,calc(92dvh-64px))] min-h-0 flex-col md:flex-row">
        <nav className="scroll-thin flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 md:w-48 md:flex-col md:border-r md:border-b-0 md:p-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openSettings(t.id)}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition-colors",
                tab === t.id ? "bg-active font-medium" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
        <div className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto px-5 sm:px-6">
          {tab === "general" && <General />}
          {tab === "models" && <Models />}
          {tab === "personalization" && <Personalization />}
          {tab === "data" && <Data />}
        </div>
      </div>
    </Dialog>
  );
}
