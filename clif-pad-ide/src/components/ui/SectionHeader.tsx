import { Component, Show, JSX } from "solid-js";

interface SectionHeaderProps {
  /** Section title text */
  title: string;
  /** Optional count badge (e.g. number of staged files) */
  count?: number;
  /** Whether the section is collapsed */
  collapsed: boolean;
  /** Toggle collapsed state */
  onToggle: () => void;
  /** Optional right-side action buttons */
  actions?: JSX.Element;
  /** Color for the count badge — defaults to accent-primary */
  badgeColor?: string;
}

/**
 * Collapsible section header with chevron, title, count badge, and optional action buttons.
 * Used in git changes, staged files, commit history, context files, etc.
 */
const SectionHeader: Component<SectionHeaderProps> = (props) => {
  return (
    <div
      class="flex items-center gap-1 px-2 py-1 shrink-0"
      style={{ "border-bottom": "1px solid var(--border-muted)" }}
    >
      <button
        class="flex items-center gap-1.5 flex-1 min-w-0"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          "font-size": "inherit",
          "font-weight": "600",
          "font-family": "inherit",
          padding: "0",
        }}
        onClick={props.onToggle}
      >
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{
            transform: props.collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 0.15s",
            "flex-shrink": "0",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span class="truncate" style={{ "font-size": "0.85em" }}>{props.title}</span>
        <Show when={props.count !== undefined && props.count > 0}>
          <span
            class="rounded-full px-1.5 shrink-0"
            style={{
              background: "var(--bg-active)",
              color: props.badgeColor || "var(--accent-primary)",
              "font-size": "0.78em",
              "font-weight": "700",
            }}
          >
            {props.count}
          </span>
        </Show>
      </button>
      <Show when={props.actions}>
        <div class="flex items-center gap-0.5 shrink-0">
          {props.actions}
        </div>
      </Show>
    </div>
  );
};

export default SectionHeader;
