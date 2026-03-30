import { Component, For, Show, createSignal } from "solid-js";
import { SectionHeader } from "../ui";
import ContextChip from "./ContextChip";

interface ContextFilesPanelProps {
  files: string[];
  projectRoot: string;
  onRemove: (path: string) => void;
  fontSize: number;
}

const ContextFilesPanel: Component<ContextFilesPanelProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false);

  const relPath = (path: string) =>
    path.startsWith(props.projectRoot) ? path.slice(props.projectRoot.length + 1) : path;

  const fileName = (path: string) => path.split("/").pop() || path;

  return (
    <div class="shrink-0" style={{ "border-top": "1px solid var(--border-muted)" }}>
      <SectionHeader
        title="In Context"
        count={props.files.length}
        collapsed={collapsed()}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {/* File list */}
      <Show when={!collapsed()}>
        <div class="flex flex-col pb-1">
          <For each={props.files}>
            {(path) => (
              <div
                class="flex items-center gap-2 px-3 py-0.5 group"
                style={{
                  "font-size": `${props.fontSize - 2}px`,
                  "font-family": "var(--font-mono, monospace)",
                }}
              >
                {/* File icon */}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="var(--accent-primary)" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round"
                  style={{ "flex-shrink": "0" }}
                >
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
                  <polyline points="13 2 13 9 20 9" />
                </svg>
                {/* Filename (bold) + directory (muted) */}
                <span
                  class="truncate flex-1"
                  style={{ color: "var(--text-secondary)" }}
                  title={relPath(path)}
                >
                  <span style={{ color: "var(--text-primary)", "font-weight": "500" }}>
                    {fileName(path)}
                  </span>
                  <Show when={relPath(path) !== fileName(path)}>
                    <span style={{ color: "var(--text-muted)", "font-size": "0.85em" }}>
                      {" · " + relPath(path).slice(0, relPath(path).lastIndexOf("/"))}
                    </span>
                  </Show>
                </span>
                {/* Remove button */}
                <button
                  class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    padding: "0 2px",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent-red)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                  onClick={() => props.onRemove(path)}
                  title="Remove from context"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" stroke-width="3" stroke-linecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Compact chips row (shown when collapsed) */}
      <Show when={collapsed()}>
        <div class="flex flex-wrap gap-1 px-3 pb-1.5">
          <For each={props.files}>
            {(path) => (
              <ContextChip
                label={path.split("/").pop() || path}
                type="file"
                onRemove={() => props.onRemove(path)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ContextFilesPanel;
