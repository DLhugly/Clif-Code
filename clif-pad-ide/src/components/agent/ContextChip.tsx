import { Component } from "solid-js";

const ContextChip: Component<{
  label: string;
  type: "file" | "selection";
  onRemove: () => void;
}> = (props) => {
  return (
    <span
      class="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
      style={{
        background: "var(--bg-active)",
        color: "var(--text-secondary)",
        "font-size": "11px",
        border: "1px solid var(--border-muted)",
      }}
    >
      <span style={{ color: "var(--accent-primary)" }}>
        {props.type === "file" ? "@" : ""}
      </span>
      <span class="truncate" style={{ "max-width": "120px" }}>
        {props.label}
      </span>
      <button
        class="flex items-center justify-center rounded-full shrink-0"
        style={{
          width: "14px",
          height: "14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-muted)",
          padding: "0",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        }}
        onClick={(e) => {
          e.stopPropagation();
          props.onRemove();
        }}
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
};

export default ContextChip;
