import { Component, For, Show } from "solid-js";
import { settings, updateSettings } from "../../stores/settingsStore";
import { PROVIDERS, POPULAR_MODELS, type OpenRouterModel } from "./constants";
import { KeyIcon } from "./icons";

interface ProviderModelSelectorProps {
  modelDropdownOpen: () => boolean;
  setModelDropdownOpen: (v: boolean) => void;
  openRouterModels: () => OpenRouterModel[];
  fetchOpenRouterModels: () => void;
  hasApiKey: () => boolean | null;
  showSettings: () => boolean;
  setShowSettings: (v: boolean) => void;
  handleProviderChange: (provider: string) => void;
}

const ProviderModelSelector: Component<ProviderModelSelectorProps> = (props) => {
  return (
    <div
      class="flex items-center gap-1.5 shrink-0 px-2 py-1.5"
      style={{ "border-bottom": "1px solid var(--border-default)" }}
    >
      {/* Provider toggle */}
      <div class="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border-muted)" }}>
        <For each={PROVIDERS}>
          {(p) => (
            <button
              class="px-2 py-1 transition-colors"
              style={{
                background: settings().aiProvider === p.value ? "var(--accent-primary)" : "var(--bg-base)",
                color: settings().aiProvider === p.value ? "#fff" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
                "font-size": "11px",
                "font-weight": "500",
              }}
              onClick={() => props.handleProviderChange(p.value)}
              title={p.hint}
            >
              {p.label}
            </button>
          )}
        </For>
      </div>

      {/* Model selector — opens full-panel browser */}
      <button
        class="flex items-center gap-1.5 flex-1 min-w-0 rounded-md px-2 py-1 transition-colors group"
        style={{
          background: props.modelDropdownOpen() ? "var(--bg-active)" : "var(--bg-hover)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          "font-size": "11px",
          cursor: "pointer",
          "font-family": "var(--font-mono, monospace)",
          "text-align": "left",
        }}
        onClick={() => {
          const next = !props.modelDropdownOpen();
          props.setModelDropdownOpen(next);
          if (next && settings().aiProvider === "openrouter") props.fetchOpenRouterModels();
        }}
        title="Browse and select a model"
      >
        {/* Grid icon to signal "opens browser" */}
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style={{ "flex-shrink": "0", color: "var(--text-muted)" }}>
          <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
        </svg>
        <span class="flex-1 truncate" style={{ "min-width": "0" }}>
          {(() => {
            const current = settings().aiModel;
            const live = props.openRouterModels().find(m => m.id === current);
            const name = live?.name || (POPULAR_MODELS[settings().aiProvider] || []).find(m => m.value === current)?.label || current;
            // Strip provider prefix like "Anthropic: " or "OpenAI: "
            return name.replace(/^[^:]+:\s*/, "");
          })()}
        </span>
        <span style={{ "font-size": "9px", color: "var(--text-muted)", "flex-shrink": "0", "font-family": "var(--font-sans)" }}>Browse</span>
      </button>

      {/* API key indicator / button */}
      <Show when={settings().aiProvider !== "ollama"}>
        <button
          class="flex items-center justify-center shrink-0 rounded-md p-1 transition-colors"
          style={{
            background: props.showSettings() ? "var(--bg-hover)" : "transparent",
            color: props.hasApiKey() ? "var(--accent-green)" : "var(--accent-yellow)",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            if (!props.showSettings()) (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          onClick={() => props.setShowSettings(!props.showSettings())}
          title={props.hasApiKey() ? "API key configured — click to change" : "Set API key"}
        >
          <KeyIcon />
        </button>
      </Show>
    </div>
  );
};

export default ProviderModelSelector;
