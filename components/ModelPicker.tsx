"use client";

import { Check, ChevronDown, Settings2 } from "lucide-react";
import { providerModels, providerReady, useStore } from "@/lib/store";
import type { ModelRef, ProviderId } from "@/lib/types";
import { cn, prettyModel, PROVIDER_LABEL } from "@/lib/utils";
import { Menu, MenuItem } from "./ui";

export function ModelPicker({ value, label }: { value: ModelRef; label?: string }) {
  const settings = useStore((s) => s.settings);
  const server = useStore((s) => s.serverConfig);
  const setModel = useStore((s) => s.setModel);
  const openSettings = useStore((s) => s.openSettings);
  const providers: ProviderId[] = ["anthropic", "openai"];

  return (
    <Menu
      className="w-[300px]"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "flex h-10 items-center gap-1 rounded-xl px-3 text-[17px] font-medium transition-colors hover:bg-hover",
            open && "bg-hover",
          )}
        >
          {label && <span className="mr-1 max-w-[30vw] truncate">{label}</span>}
          <span className={cn("max-w-[48vw] truncate", label && "text-muted")}>{prettyModel(value.model)}</span>
          <ChevronDown size={16} className="text-subtle" />
        </button>
      )}
    >
      {(close) => (
        <div className="scroll-thin max-h-[70vh] overflow-y-auto">
          {providers.map((provider) => {
            const ready = providerReady(provider, settings, server);
            const models = providerModels(provider, settings, server);
            return (
              <div key={provider} className="mb-1 last:mb-0">
                <div className="flex items-center justify-between px-3 pt-2 pb-1">
                  <span className="text-xs font-medium text-subtle">{PROVIDER_LABEL[provider]}</span>
                  {!ready && <span className="rounded-full bg-soft px-2 py-0.5 text-[11px] text-subtle">未配置</span>}
                </div>
                {models.length === 0 && <p className="px-3 py-1.5 text-sm text-subtle">还没有添加模型</p>}
                {models.map((model) => {
                  const selected = value.provider === provider && value.model === model;
                  return (
                    <MenuItem
                      key={model}
                      onClick={() => {
                        setModel({ provider, model });
                        close();
                      }}
                      className={cn(!ready && "opacity-60")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{prettyModel(model)}</span>
                        {prettyModel(model) !== model && <span className="block truncate text-xs text-subtle">{model}</span>}
                      </span>
                      {selected && <Check size={16} className="shrink-0" />}
                    </MenuItem>
                  );
                })}
              </div>
            );
          })}
          <div className="my-1 h-px bg-line" />
          <MenuItem
            icon={<Settings2 size={16} />}
            onClick={() => {
              close();
              openSettings("models");
            }}
          >
            管理模型与 API Key
          </MenuItem>
        </div>
      )}
    </Menu>
  );
}
