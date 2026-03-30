import { Component, For } from "solid-js";

interface MentionDropdownProps {
  suggestions: string[];
  selectedIndex: number;
  onSelect: (path: string) => void;
  onHover: (index: number) => void;
  fontSize: number;
}

const MentionDropdown: Component<MentionDropdownProps> = (props) => {
  return (
    <div
      class="shrink-0 mx-3 mb-1 rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        "box-shadow": "0 -4px 16px rgba(0,0,0,0.2)",
        "max-height": "200px",
        "overflow-y": "auto",
      }}
    >
      <For each={props.suggestions}>
        {(path, i) => (
          <button
            class="flex items-center gap-2 w-full px-3 py-1.5 text-left"
            style={{
              background: i() === props.selectedIndex ? "var(--bg-hover)" : "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-primary)",
              "font-size": `${props.fontSize - 1}px`,
              "font-family": "var(--font-mono, monospace)",
            }}
            onMouseEnter={() => props.onHover(i())}
            onMouseDown={(e) => {
              e.preventDefault();
              props.onSelect(path);
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
              <polyline points="13 2 13 9 20 9" />
            </svg>
            <span class="truncate">{path}</span>
          </button>
        )}
      </For>
    </div>
  );
};

export default MentionDropdown;
