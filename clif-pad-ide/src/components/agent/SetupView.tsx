// Agent setup / API key screen — extracted from AgentChatPanel.tsx
import { Component, For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import { settings } from "../../stores/settingsStore";
import { KeyIcon } from "./icons";
import { PROVIDERS, POPULAR_MODELS } from "./constants";

interface SetupViewProps {
  apiKeyInput: Accessor<string>;
  setApiKeyInput: (v: string) => void;
  savingKey: Accessor<boolean>;
  ollamaModels: Accessor<{ value: string; label: string }[]>;
  handleProviderChange: (provider: string) => void;
  handleModelChange: (model: string) => void;
  handleSaveApiKey: () => void;
  setHasApiKey: (v: boolean) => void;
}

const SetupView: Component<SetupViewProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div
        class="rounded-full p-4"
        style={{ background: "var(--bg-hover)" }}
      >
        <KeyIcon />
      </div>
      <h3
        class="font-medium text-center"
        style={{ color: "var(--text-primary)", "font-size": "15px" }}
      >
        Connect an LLM
      </h3>
      <p
        class="text-center"
        style={{ color: "var(--text-muted)", "font-size": "12px", "line-height": "1.5" }}
      >
        The agent needs an API key to chat. Choose a provider and enter your key below.
      </p>

      {/* Provider picker */}
      <div class="w-full">
        <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
          Provider
        </label>
        <div class="flex flex-col gap-1.5 mt-1">
          <For each={PROVIDERS}>
            {(p) => (
              <button
                class="flex items-center gap-3 w-full rounded-lg px-3 py-2.5 text-left transition-colors"
                style={{
                  background: settings().aiProvider === p.value ? "var(--bg-active)" : "var(--bg-base)",
                  border: settings().aiProvider === p.value
                    ? "1px solid var(--accent-primary)"
                    : "1px solid var(--border-default)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
                onClick={() => props.handleProviderChange(p.value)}
              >
                <div class="flex flex-col">
                  <span class="font-medium" style={{ "font-size": "13px" }}>{p.label}</span>
                  <span style={{ "font-size": "11px", color: "var(--text-muted)" }}>{p.hint}</span>
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Model picker */}
      <div class="w-full">
        <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
          Model
        </label>
        <select
          class="w-full mt-1 rounded-lg px-3 py-2 outline-none"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            "font-size": "13px",
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

      {/* API key input (not shown for Ollama) */}
      <Show when={settings().aiProvider !== "ollama"}>
        <div class="w-full">
          <label style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>
            API Key
          </label>
          <input
            type="password"
            class="w-full mt-1 rounded-lg px-3 py-2 outline-none"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "13px",
            }}
            placeholder={settings().aiProvider === "openrouter" ? "sk-or-..." : "API key"}
            value={props.apiKeyInput()}
            onInput={(e) => props.setApiKeyInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") props.handleSaveApiKey();
            }}
          />
        </div>

        <button
          class="w-full rounded-lg py-2.5 font-medium transition-colors"
          style={{
            background: props.apiKeyInput().trim()
              ? "var(--accent-primary)"
              : "var(--bg-hover)",
            color: props.apiKeyInput().trim() ? "#fff" : "var(--text-muted)",
            border: "none",
            cursor: props.apiKeyInput().trim() ? "pointer" : "default",
            "font-size": "13px",
          }}
          disabled={!props.apiKeyInput().trim() || props.savingKey()}
          onClick={props.handleSaveApiKey}
        >
          {props.savingKey() ? "Saving..." : "Save & Connect"}
        </button>
      </Show>

      {/* For Ollama, just a connect button */}
      <Show when={settings().aiProvider === "ollama"}>
        <p
          class="text-center"
          style={{ color: "var(--text-muted)", "font-size": "11px" }}
        >
          Make sure Ollama is running locally on port 11434.
        </p>
        <button
          class="w-full rounded-lg py-2.5 font-medium transition-colors"
          style={{
            background: "var(--accent-primary)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            "font-size": "13px",
          }}
          onClick={() => props.setHasApiKey(true)}
        >
          Connect to Ollama
        </button>
      </Show>
    </div>
  );
};

export default SetupView;
