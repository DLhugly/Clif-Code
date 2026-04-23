import { Component, For } from "solid-js";

const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "?", label: "Show this cheatsheet" },
  { keys: "Esc", label: "Clear selection, close drawers" },
  { keys: "J / K", label: "Next / previous PR" },
  { keys: "X", label: "Toggle selection on the focused PR" },
  { keys: "Cmd/Ctrl+A", label: "Select all visible PRs" },
  { keys: "A / R / D", label: "Approve / Request changes / Close duplicate (selected)" },
  { keys: "P", label: "Queue polish on selected" },
  { keys: "C", label: "Open consolidation for selected (2+)" },
  { keys: "Cmd+Shift+R", label: "Toggle between Code and Review modes" },
  { keys: "Cmd+Enter", label: "Send focused pending comment" },
];

const ShortcutsOverlay: Component<{ onClose: () => void }> = (props) => {
  return (
    <div
      class="fixed inset-0 flex items-center justify-center"
      style={{
        background: "color-mix(in srgb, #000 45%, transparent)",
        "z-index": "9500",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="rounded-lg flex flex-col gap-2 p-4"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          width: "min(480px, 90vw)",
          "box-shadow": "0 20px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div class="flex items-center justify-between mb-1">
          <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
            Keyboard shortcuts
          </div>
          <button
            class="flex items-center justify-center"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
            onClick={() => props.onClose()}
            title="Close (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div class="flex flex-col gap-1.5" style={{ "font-size": "calc(var(--ui-font-size) - 2px)" }}>
          <For each={SHORTCUTS}>
            {(s) => (
              <div class="flex items-center gap-3">
                <span
                  class="shrink-0 px-1.5 rounded"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                    "font-family": "var(--font-mono, monospace)",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                    "min-width": "90px",
                    "text-align": "center",
                  }}
                >
                  {s.keys}
                </span>
                <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsOverlay;
