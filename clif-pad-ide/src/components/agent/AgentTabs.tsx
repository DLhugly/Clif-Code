import { Component, For, Show } from "solid-js";
import {
  agentTabs,
  activeAgentTab,
  switchAgentTab,
  removeAgentTab,
  startNewSession,
  agentStreaming,
  agentMessages,
} from "../../stores/agentStore";
import { SparkleIcon } from "./icons";

/**
 * Slim tab strip. One row with saved chats as small pills + a single
 * "New" action on the right. No hard dividers, no chunky rows — the tab
 * header blends into the panel's surface instead of fighting it.
 */
const AgentTabs: Component = () => {
  const isCurrentActive = () => !agentTabs.find((t) => t.id === activeAgentTab());
  const activeLabel = () =>
    isCurrentActive() && agentMessages.length > 0 ? "Current" : "New Chat";

  return (
    <div
      class="flex items-center w-full min-w-0"
      style={{
        height: "30px",
        padding: "0 6px",
        gap: "4px",
      }}
    >
      {/* Sparkle badge that identifies the panel at a glance */}
      <div
        class="flex items-center justify-center shrink-0"
        style={{
          color: "var(--accent-primary)",
          opacity: 0.85,
        }}
      >
        <SparkleIcon />
      </div>

      {/* Saved tabs scroll horizontally if overflow */}
      <div
        class="flex items-center flex-1 min-w-0 overflow-x-auto"
        style={{ gap: "3px", "scrollbar-width": "thin" }}
      >
        <For each={agentTabs}>
          {(tab) => {
            const isActive = () => activeAgentTab() === tab.id;
            return (
              <div
                class="flex items-center shrink-0 group rounded-full transition-colors"
                style={{
                  height: "22px",
                  padding: "0 4px 0 10px",
                  background: isActive()
                    ? "color-mix(in srgb, var(--accent-primary) 16%, transparent)"
                    : "transparent",
                  color: isActive() ? "var(--text-primary)" : "var(--text-muted)",
                  border: `1px solid ${isActive() ? "color-mix(in srgb, var(--accent-primary) 30%, transparent)" : "transparent"}`,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!isActive()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive()) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
                onClick={() => switchAgentTab(tab.id)}
                title={tab.label}
              >
                <span
                  style={{
                    "font-size": "11px",
                    "font-weight": isActive() ? "600" : "500",
                    "white-space": "nowrap",
                    "max-width": "120px",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                  }}
                >
                  {tab.label}
                </span>
                <button
                  class="flex items-center justify-center rounded-full"
                  style={{
                    width: "14px",
                    height: "14px",
                    "margin-left": "4px",
                    border: "none",
                    background: "transparent",
                    color: "currentColor",
                    cursor: "pointer",
                    "font-size": "11px",
                    opacity: 0,
                    transition: "opacity 0.1s, background 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "1";
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = "0";
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAgentTab(tab.id);
                  }}
                  title="Close tab"
                >
                  ×
                </button>
              </div>
            );
          }}
        </For>

        {/* Current-session chip — only renders when there are saved tabs.
            When the list is empty, the current session IS the only chat so
            the label is redundant; the "+" on the right is the whole UX. */}
        <Show when={agentTabs.length > 0}>
          <div
            class="flex items-center shrink-0 rounded-full transition-colors"
            style={{
              height: "22px",
              padding: "0 10px",
              background: isCurrentActive()
                ? "color-mix(in srgb, var(--accent-primary) 16%, transparent)"
                : "transparent",
              color: isCurrentActive() ? "var(--text-primary)" : "var(--text-muted)",
              border: `1px solid ${isCurrentActive() ? "color-mix(in srgb, var(--accent-primary) 30%, transparent)" : "transparent"}`,
              cursor: isCurrentActive() ? "default" : "pointer",
              "font-size": "11px",
              "font-weight": isCurrentActive() ? "600" : "500",
            }}
            onMouseEnter={(e) => {
              if (!isCurrentActive()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              if (!isCurrentActive()) (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={() => {
              if (!isCurrentActive() && !agentStreaming()) startNewSession();
            }}
            title={activeLabel()}
          >
            {activeLabel()}
          </div>
        </Show>
      </div>

      {/* New-chat action always sits on the right */}
      <button
        class="flex items-center justify-center shrink-0 rounded-full transition-colors"
        style={{
          width: "22px",
          height: "22px",
          border: "1px solid var(--border-default)",
          background: "var(--bg-hover)",
          color: "var(--text-secondary)",
          cursor: agentStreaming() ? "not-allowed" : "pointer",
          opacity: agentStreaming() ? 0.5 : 1,
        }}
        onMouseEnter={(e) => {
          if (!agentStreaming()) (e.currentTarget as HTMLElement).style.background = "var(--bg-active)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onClick={() => !agentStreaming() && startNewSession()}
        title="Start a new chat (saves current to a tab)"
        disabled={agentStreaming()}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
};

export default AgentTabs;
