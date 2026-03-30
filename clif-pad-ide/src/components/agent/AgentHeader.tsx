import { Component, For, Show } from "solid-js";
import { SparkleIcon, KeyIcon, GearIcon } from "./icons";
import { PROVIDERS, POPULAR_MODELS, type OpenRouterModel } from "./constants";

interface AgentHeaderProps {
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onSwitchTab: (id: string) => void;
  onRemoveTab: (id: string) => void;
  onNewSession: () => void;
  onInitProject: () => void;
  projectRoot: string | null;
  aiProvider: string;
  aiModel: string;
  onProviderChange: (provider: string) => void;
  onModelChange: (model: string) => void;
  onOpenModelBrowser: () => void;
  onOpenSettings: () => void;
  hasApiKey: boolean | null;
  clifInitializing: boolean;
  clifExists: boolean | null;
  clifInitProgress: { step: number; total: number; message: string; elapsed_secs: number };
  modelDropdownOpen: boolean;
  openRouterModels: OpenRouterModel[];
}

const AgentHeader: Component<AgentHeaderProps> = (props) => {
  return (
    <>
      {/* Header: tabs + new session */}
      <div
        class="flex items-center shrink-0"
        style={{
          "border-bottom": "1px solid var(--border-muted)",
          height: "28px",
          background: "var(--bg-surface)",
        }}
      >
        <div class="flex items-center flex-1 min-w-0 overflow-x-auto" style={{ "padding-left": "4px" }}>
          {/* Saved tabs */}
          <For each={props.tabs}>
            {(tab) => (
              <div
                class="flex items-center shrink-0 cursor-pointer group"
                style={{
                  height: "28px",
                  padding: "0 8px 0 10px",
                  "font-size": "11px",
                  color: props.activeTab === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                  background: props.activeTab === tab.id ? "var(--bg-base)" : "transparent",
                  "border-right": "1px solid var(--border-default)",
                  transition: "color 0.1s, background 0.1s",
                }}
                onClick={() => props.onSwitchTab(tab.id)}
                title={tab.label}
              >
                <span style={{ opacity: props.activeTab === tab.id ? "1" : "0.6", "white-space": "nowrap", "max-width": "100px", overflow: "hidden", "text-overflow": "ellipsis", display: "inline-block" }}>
                  {tab.label}
                </span>
                <button
                  class="flex items-center justify-center"
                  style={{
                    width: "16px", height: "16px", "margin-left": "4px",
                    "border-radius": "3px", border: "none",
                    background: "transparent", color: "var(--text-muted)",
                    cursor: "pointer", "font-size": "12px",
                    opacity: "0", transition: "opacity 0.1s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; e.currentTarget.style.background = "transparent"; }}
                  onClick={(e) => { e.stopPropagation(); props.onRemoveTab(tab.id); }}
                  title="Close tab"
                >
                  ×
                </button>
              </div>
            )}
          </For>

          {/* Current session indicator */}
          {(() => {
            const isCurrentActive = () => !props.tabs.find((t) => t.id === props.activeTab);
            return (
              <div
                class="flex items-center shrink-0 cursor-pointer"
                style={{
                  height: "28px",
                  padding: "0 10px",
                  "font-size": "11px",
                  color: isCurrentActive() ? "var(--text-primary)" : "var(--text-muted)",
                  background: isCurrentActive() ? "var(--bg-base)" : "transparent",
                  "border-right": props.tabs.length > 0 ? "1px solid var(--border-default)" : "none",
                  transition: "color 0.1s, background 0.1s",
                }}
                onClick={() => {
                  if (!isCurrentActive()) {
                    props.onNewSession();
                  }
                }}
              >
                <SparkleIcon />
                <span style={{ "margin-left": "5px", "white-space": "nowrap", opacity: isCurrentActive() ? "1" : "0.6" }}>
                  New Chat
                </span>
              </div>
            );
          })()}
        </div>

        {/* New session button */}
        <button
          class="flex items-center justify-center shrink-0"
          style={{
            width: "28px", height: "28px",
            color: "var(--text-muted)", background: "transparent",
            border: "none", cursor: "pointer", "font-size": "15px",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          onClick={props.onNewSession}
          title="New chat"
        >
          +
        </button>

        {/* Init project button */}
        <Show when={props.projectRoot && props.aiProvider !== "ollama"}>
          <button
            class="flex items-center justify-center shrink-0"
            style={{
              width: "28px", height: "28px",
              color: props.clifInitializing ? "var(--accent-primary)" : props.clifExists ? "var(--accent-green)" : "var(--text-muted)",
              background: "transparent", border: "none",
              cursor: props.clifInitializing ? "default" : "pointer",
              "font-size": "13px",
            }}
            onMouseEnter={(e) => { if (!props.clifInitializing) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            onClick={props.onInitProject}
            title={props.clifInitializing
              ? "Analyzing project..."
              : props.clifExists
              ? "Re-initialize project context (CLIF.md exists)"
              : "Initialize project context — analyze codebase and write .clif/CLIF.md"}
          >
            <Show when={props.clifInitializing} fallback={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <Show when={props.clifExists}>
                  <polyline points="9 11 12 14 22 4" />
                </Show>
              </svg>
            }>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            </Show>
          </button>
        </Show>
      </div>

      {/* Header row 2: provider + model selectors */}
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
                  background: props.aiProvider === p.value ? "var(--accent-primary)" : "var(--bg-base)",
                  color: props.aiProvider === p.value ? "#fff" : "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "11px",
                  "font-weight": "500",
                }}
                onClick={() => props.onProviderChange(p.value)}
                title={p.hint}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>

        {/* Model selector */}
        <button
          class="flex items-center gap-1.5 flex-1 min-w-0 rounded-md px-2 py-1 transition-colors group"
          style={{
            background: props.modelDropdownOpen ? "var(--bg-active)" : "var(--bg-hover)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            "font-size": "11px",
            cursor: "pointer",
            "font-family": "var(--font-mono, monospace)",
            "text-align": "left",
          }}
          onClick={props.onOpenModelBrowser}
          title="Browse and select a model"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style={{ "flex-shrink": "0", color: "var(--text-muted)" }}>
            <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
          </svg>
          <span class="flex-1 truncate" style={{ "min-width": "0" }}>
            {(() => {
              const current = props.aiModel;
              const live = props.openRouterModels.find(m => m.id === current);
              const name = live?.name || (POPULAR_MODELS[props.aiProvider] || []).find(m => m.value === current)?.label || current;
              return name.replace(/^[^:]+:\s*/, "");
            })()}
          </span>
          <span style={{ "font-size": "9px", color: "var(--text-muted)", "flex-shrink": "0", "font-family": "var(--font-sans)" }}>Browse</span>
        </button>

        {/* API key indicator / button */}
        <Show when={props.aiProvider !== "ollama"}>
          <button
            class="flex items-center justify-center shrink-0"
            style={{
              width: "24px", height: "24px",
              color: props.hasApiKey ? "var(--accent-green)" : "var(--accent-yellow)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            onClick={props.onOpenSettings}
            title={props.hasApiKey ? "Change API key" : "Set API key"}
          >
            <KeyIcon />
          </button>
        </Show>
      </div>
    </>
  );
};

export default AgentHeader;
