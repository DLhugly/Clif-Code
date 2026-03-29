// Agent settings panel (gear dropdown) — extracted from AgentChatPanel.tsx
import { Component, For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import { settings, updateSettings } from "../../stores/settingsStore";
import { PROVIDERS, POPULAR_MODELS } from "./constants";

interface SettingsPanelProps {
  apiKeyInput: Accessor<string>;
  setApiKeyInput: (v: string) => void;
  hasApiKey: Accessor<boolean | null>;
  ollamaModels: Accessor<{ value: string; label: string }[]>;
  handleProviderChange: (provider: string) => void;
  handleModelChange: (model: string) => void;
  handleSaveApiKey: () => void;
}

const SettingsPanel: Component<SettingsPanelProps> = (props) => {
  return (
    <div
      class="shrink-0 px-3 py-3 flex flex-col gap-3"
      style={{ "border-bottom": "1px solid var(--border-default)" }}
    >
      {/* Provider */}
      <div>
        <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
          Provider
        </label>
        <div class="flex gap-1.5 mt-1">
          <For each={PROVIDERS}>
            {(p) => (
              <button
                class="flex-1 rounded-md px-2 py-1.5 text-center transition-colors"
                style={{
                  background: settings().aiProvider === p.value ? "var(--bg-active)" : "var(--bg-base)",
                  border: settings().aiProvider === p.value
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-muted)",
                  color: settings().aiProvider === p.value ? "var(--text-primary)" : "var(--text-secondary)",
                  cursor: "pointer",
                  "font-size": "12px",
                }}
                onClick={() => props.handleProviderChange(p.value)}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Model */}
      <div>
        <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
          Model
        </label>
        <select
          class="w-full mt-1 rounded-md px-2 py-1.5 outline-none"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-muted)",
            "font-size": "12px",
            cursor: "pointer",
          }}
          value={settings().aiModel}
          onChange={(e) => props.handleModelChange(e.currentTarget.value)}
        >
          <For each={settings().aiProvider === "ollama" ? props.ollamaModels() : (POPULAR_MODELS[settings().aiProvider] || [])}>
            {(m) => <option value={m.value}>{m.label}</option>}
          </For>
        </select>
      </div>

      {/* API Key */}
      <Show when={settings().aiProvider !== "ollama"}>
        <div>
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            API Key
          </label>
          <div class="flex gap-1.5 mt-1">
            <input
              type="password"
              class="flex-1 rounded-md px-2 py-1.5 outline-none"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-muted)",
                "font-size": "12px",
              }}
              placeholder="Update API key..."
              value={props.apiKeyInput()}
              onInput={(e) => props.setApiKeyInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") props.handleSaveApiKey();
              }}
            />
            <button
              class="rounded-md px-3 py-1.5 transition-colors"
              style={{
                background: props.apiKeyInput().trim() ? "var(--accent-primary)" : "var(--bg-hover)",
                color: props.apiKeyInput().trim() ? "#fff" : "var(--text-muted)",
                border: "none",
                cursor: props.apiKeyInput().trim() ? "pointer" : "default",
                "font-size": "12px",
              }}
              disabled={!props.apiKeyInput().trim()}
              onClick={props.handleSaveApiKey}
            >
              Save
            </button>
          </div>
          <Show when={props.hasApiKey()}>
            <span style={{ "font-size": "10px", color: "var(--accent-green)" }}>
              Key configured
            </span>
          </Show>
        </div>
      </Show>

      {/* Inline AI toggle */}
      <div class="flex items-center justify-between">
        <div>
          <span style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            Inline AI Completions
          </span>
          <p style={{ "font-size": "10px", color: "var(--text-muted)", margin: "2px 0 0 0", opacity: "0.7" }}>
            Ghost text as you type · Tab to accept
          </p>
        </div>
        <button
          onClick={() => updateSettings({ inlineAiEnabled: !settings().inlineAiEnabled })}
          class="rounded-full transition-colors shrink-0"
          style={{
            width: "32px",
            height: "18px",
            background: settings().inlineAiEnabled ? "var(--accent-primary)" : "var(--bg-hover)",
            border: "none",
            cursor: "pointer",
            position: "relative",
          }}
          title={settings().inlineAiEnabled ? "Disable inline AI" : "Enable inline AI"}
        >
          <span
            style={{
              position: "absolute",
              top: "2px",
              left: settings().inlineAiEnabled ? "16px" : "2px",
              width: "14px",
              height: "14px",
              "border-radius": "50%",
              background: "#fff",
              transition: "left 0.15s ease",
              display: "block",
            }}
          />
        </button>
      </div>
    </div>
  );
};

export default SettingsPanel;
