import { Component, Show } from "solid-js";
import { settings } from "../../stores/settingsStore";
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

/**
 * Compact model chip + API-key indicator. Designed to sit inline inside the
 * unified agent header (no border, no padding wrapper). Clicking the chip
 * opens the full ModelBrowser, which also hosts the provider toggle — so
 * we don't duplicate controls at the top of the panel.
 */
const ProviderModelSelector: Component<ProviderModelSelectorProps> = (props) => {
  const currentModelName = () => {
    const current = settings().aiModel;
    const live = props.openRouterModels().find((m) => m.id === current);
    const name =
      live?.name ||
      (POPULAR_MODELS[settings().aiProvider] || []).find((m) => m.value === current)?.label ||
      current;
    return name.replace(/^[^:]+:\s*/, "");
  };
  const providerMeta = () =>
    PROVIDERS.find((p) => p.value === settings().aiProvider) ?? PROVIDERS[0];

  return (
    <div class="flex items-center shrink-0" style={{ gap: "4px", "min-width": "0" }}>
      {/* Model chip */}
      <button
        class="flex items-center rounded-full transition-colors"
        style={{
          background: props.modelDropdownOpen() ? "var(--bg-active)" : "var(--bg-hover)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          cursor: "pointer",
          height: "22px",
          padding: "0 3px 0 8px",
          gap: "6px",
          "font-size": "11px",
          "max-width": "200px",
          "min-width": "0",
        }}
        onMouseEnter={(e) => {
          if (!props.modelDropdownOpen())
            (e.currentTarget as HTMLElement).style.background = "var(--bg-active)";
        }}
        onMouseLeave={(e) => {
          if (!props.modelDropdownOpen())
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onClick={() => {
          const next = !props.modelDropdownOpen();
          props.setModelDropdownOpen(next);
          if (next && settings().aiProvider === "openrouter") props.fetchOpenRouterModels();
        }}
        title={`${providerMeta().label} · ${currentModelName()} — click to change`}
      >
        <span
          class="truncate"
          style={{
            "min-width": "0",
            "font-family": "var(--font-mono, monospace)",
            flex: "1",
          }}
        >
          {currentModelName()}
        </span>
        <span
          class="shrink-0 rounded-full"
          style={{
            background: "color-mix(in srgb, var(--accent-primary) 18%, transparent)",
            color: "var(--accent-primary)",
            padding: "0 6px",
            height: "16px",
            display: "flex",
            "align-items": "center",
            "font-size": "9px",
            "text-transform": "uppercase",
            "letter-spacing": "0.06em",
            "font-weight": "700",
          }}
        >
          {providerMeta().label}
        </span>
      </button>

      {/* API key indicator — only loud when missing */}
      <Show when={settings().aiProvider !== "ollama"}>
        <button
          class="flex items-center justify-center shrink-0 rounded-full transition-colors"
          style={{
            width: "22px",
            height: "22px",
            background: props.hasApiKey()
              ? "transparent"
              : "color-mix(in srgb, var(--accent-yellow) 20%, transparent)",
            color: props.hasApiKey() ? "var(--text-muted)" : "var(--accent-yellow)",
            border: `1px solid ${
              props.hasApiKey()
                ? "var(--border-default)"
                : "color-mix(in srgb, var(--accent-yellow) 45%, transparent)"
            }`,
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-active)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = props.hasApiKey()
              ? "transparent"
              : "color-mix(in srgb, var(--accent-yellow) 20%, transparent)";
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
