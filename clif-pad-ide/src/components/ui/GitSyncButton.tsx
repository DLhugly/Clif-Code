import { Component, Show, JSX } from "solid-js";

interface GitSyncButtonProps {
  label: string;
  disabled: boolean;
  /** Badge element (e.g. ahead/behind count) — shown after label */
  badge?: JSX.Element;
  onClick: () => void;
  title: string;
  /** Show spinner instead of label */
  loading?: boolean;
}

const SpinnerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

/**
 * Fetch / Pull / Push button used in the git sync toolbar.
 */
const GitSyncButton: Component<GitSyncButtonProps> = (props) => {
  return (
    <button
      class="flex-1 flex items-center justify-center gap-1 py-1 rounded transition-colors"
      style={{
        color: props.disabled ? "var(--text-muted)" : "var(--text-secondary)",
        background: "var(--bg-base)",
        border: "1px solid var(--border-muted)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        "font-size": "0.85em",
        "font-family": "inherit",
        opacity: props.disabled ? "0.6" : "1",
      }}
      onMouseEnter={(e) => {
        if (!props.disabled) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "var(--bg-base)";
      }}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
    >
      <Show when={props.loading} fallback={<span>{props.label}</span>}>
        <SpinnerIcon />
      </Show>
      <Show when={!props.loading}>
        {props.badge}
      </Show>
    </button>
  );
};

export default GitSyncButton;
