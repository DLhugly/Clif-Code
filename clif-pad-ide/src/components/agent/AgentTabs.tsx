import { Component, For, Show } from "solid-js";
import { agentTabs, activeAgentTab, switchAgentTab, removeAgentTab, startNewSession, agentStreaming, agentMessages } from "../../stores/agentStore";
import { SparkleIcon } from "./icons";

const AgentTabs: Component = () => {
  const isCurrentActive = () => !agentTabs.find((t) => t.id === activeAgentTab());

  return (
    <div class="flex items-center flex-1 min-w-0 overflow-x-auto" style={{ "padding-left": "4px" }}>
      {/* Saved tabs */}
      <For each={agentTabs}>
        {(tab) => (
          <div
            class="flex items-center shrink-0 cursor-pointer group"
            style={{
              height: "28px",
              padding: "0 8px 0 10px",
              "font-size": "11px",
              color: activeAgentTab() === tab.id ? "var(--text-primary)" : "var(--text-muted)",
              background: activeAgentTab() === tab.id ? "var(--bg-base)" : "transparent",
              "border-right": "1px solid var(--border-default)",
              transition: "color 0.1s, background 0.1s",
            }}
            onClick={() => switchAgentTab(tab.id)}
            title={tab.label}
          >
            <span style={{ opacity: activeAgentTab() === tab.id ? "1" : "0.6", "white-space": "nowrap", "max-width": "100px", overflow: "hidden", "text-overflow": "ellipsis", display: "inline-block" }}>
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
              onClick={(e) => { e.stopPropagation(); removeAgentTab(tab.id); }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        )}
      </For>

      {/* Current session indicator */}
      <div
        class="flex items-center shrink-0 cursor-pointer"
        style={{
          height: "28px",
          padding: "0 10px",
          "font-size": "11px",
          color: isCurrentActive() ? "var(--text-primary)" : "var(--text-muted)",
          background: isCurrentActive() ? "var(--bg-base)" : "transparent",
          "border-right": agentTabs.length > 0 ? "1px solid var(--border-default)" : "none",
          transition: "color 0.1s, background 0.1s",
        }}
        onClick={() => {
          if (!isCurrentActive() && !agentStreaming()) {
            startNewSession();
          }
        }}
      >
        <SparkleIcon />
        <span style={{ "margin-left": "5px", "white-space": "nowrap", opacity: isCurrentActive() ? "1" : "0.6" }}>
          {isCurrentActive() && agentMessages.length > 0 ? "Current" : "New Chat"}
        </span>
      </div>
    </div>
  );
};

export default AgentTabs;
