"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { GPT_COLORS } from "@/lib/defaults";
import { providerModels, useStore } from "@/lib/store";
import type { GPT, ProviderId } from "@/lib/types";
import { cn, prettyModel, PROVIDER_LABEL, uid } from "@/lib/utils";
import { Button, Dialog, Field, GptAvatar, inputClass } from "./ui";

const EMOJIS = ["✨", "🤖", "🧠", "📚", "💡", "🎨", "🧑‍💻", "📝", "🌍", "🎯", "🧪", "📈", "🍳", "🎵", "🩺", "⚖️", "🧭", "🐱"];

function blankGpt(): GPT {
  return {
    id: uid(),
    name: "",
    description: "",
    instructions: "",
    starters: [""],
    emoji: "✨",
    color: GPT_COLORS[6],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function GptEditor() {
  const editor = useStore((s) => s.gptEditor);
  const gpts = useStore((s) => s.gpts);
  const close = useStore((s) => s.closeGptEditor);
  const saveGpt = useStore((s) => s.saveGpt);
  const newChat = useStore((s) => s.newChat);
  const settings = useStore((s) => s.settings);
  const server = useStore((s) => s.serverConfig);
  const [draft, setDraft] = useState<GPT>(blankGpt);

  useEffect(() => {
    if (!editor) return;
    const existing = editor.gptId ? gpts.find((g) => g.id === editor.gptId) : undefined;
    setDraft(existing ? { ...existing, starters: existing.starters.length ? [...existing.starters] : [""] } : blankGpt());
    // 只在打开编辑器时初始化草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const isNew = !editor?.gptId;
  const set = <K extends keyof GPT>(key: K, value: GPT[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const modelValue = draft.model ? `${draft.model.provider}::${draft.model.model}` : "";

  const save = () => {
    const gpt: GPT = {
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
      starters: draft.starters.map((s) => s.trim()).filter(Boolean),
      updatedAt: Date.now(),
    };
    saveGpt(gpt);
    close();
    if (isNew) newChat(gpt.id);
  };

  const starters = draft.starters.filter((s) => s.trim());

  return (
    <Dialog
      open={Boolean(editor)}
      onClose={close}
      title={isNew ? "创建 GPT" : "编辑 GPT"}
      className="sm:max-w-5xl"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            取消
          </Button>
          <Button variant="primary" disabled={!draft.name.trim()} onClick={save}>
            {isNew ? "创建" : "保存"}
          </Button>
        </>
      }
    >
      <div className="grid md:grid-cols-[1fr_380px]">
        <div className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <GptAvatar emoji={draft.emoji} color={draft.color} size={64} />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex flex-wrap gap-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => set("emoji", e)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-lg text-lg transition-colors hover:bg-hover",
                      draft.emoji === e && "bg-active",
                    )}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {GPT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`颜色 ${c}`}
                    onClick={() => set("color", c)}
                    className={cn(
                      "h-6 w-6 rounded-full ring-offset-2 ring-offset-elevated transition-transform hover:scale-110",
                      draft.color === c && "ring-2 ring-fg",
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <Field label="名称">
            <input
              className={inputClass}
              value={draft.name}
              maxLength={40}
              placeholder="给你的 GPT 起个名字，例如：旅行规划师"
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="简介">
            <input
              className={inputClass}
              value={draft.description}
              maxLength={100}
              placeholder="一句话介绍这个 GPT 能做什么"
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>
          <Field label="指令" hint="这个 GPT 是做什么的？它应该如何表现？有什么需要避免的？">
            <textarea
              className={cn(inputClass, "scroll-thin min-h-[160px] resize-y leading-relaxed")}
              value={draft.instructions}
              placeholder={"例如：你是一位经验丰富的旅行规划师。根据用户的目的地、天数和预算，给出按天划分的详细行程，包括交通、住宿和美食推荐。"}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[13px] font-medium">对话开场白</span>
            <div className="space-y-2">
              {draft.starters.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={inputClass}
                    value={s}
                    maxLength={120}
                    placeholder="用户可以一键发送的示例问题"
                    onChange={(e) => set("starters", draft.starters.map((x, j) => (j === i ? e.target.value : x)))}
                  />
                  <button
                    type="button"
                    aria-label="删除"
                    onClick={() => set("starters", draft.starters.filter((_, j) => j !== i))}
                    className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-hover hover:text-fg"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              {draft.starters.length < 4 && (
                <Button size="sm" variant="ghost" onClick={() => set("starters", [...draft.starters, ""])}>
                  <Plus size={15} />
                  添加开场白
                </Button>
              )}
            </div>
          </div>
          <Field label="模型" hint="不指定时，使用你在顶部选择的模型。">
            <select
              className={cn(inputClass, "appearance-none")}
              value={modelValue}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return set("model", undefined);
                const [provider, ...rest] = v.split("::");
                set("model", { provider: provider as ProviderId, model: rest.join("::") });
              }}
            >
              <option value="">跟随当前选择的模型</option>
              {(["anthropic", "openai"] as ProviderId[]).map((p) => (
                <optgroup key={p} label={PROVIDER_LABEL[p]}>
                  {providerModels(p, settings, server).map((m) => (
                    <option key={m} value={`${p}::${m}`}>
                      {prettyModel(m)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        </div>

        {/* 实时预览 */}
        <div className="hidden border-l border-line bg-sidebar p-6 md:block">
          <p className="mb-4 text-xs font-medium tracking-wide text-subtle">预览</p>
          <div className="flex flex-col items-center rounded-3xl bg-main px-5 py-10 text-center shadow-composer">
            <GptAvatar emoji={draft.emoji} color={draft.color} size={64} />
            <p className="mt-3 text-xl font-semibold">{draft.name.trim() || "未命名 GPT"}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{draft.description.trim() || "在这里显示 GPT 的简介"}</p>
            {starters.length > 0 && (
              <div className="mt-6 grid w-full gap-2">
                {starters.map((s, i) => (
                  <div key={i} className="truncate rounded-xl border border-line px-3 py-2 text-left text-[13px] text-muted">
                    {s}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 w-full rounded-full bg-soft px-4 py-2.5 text-left text-sm text-subtle">
              给“{draft.name.trim() || "未命名 GPT"}”发送消息
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
