import { Component, Show, createMemo } from "solid-js";
import {
  selectedPrs,
  runningReviews,
  pendingComments,
  policyResults,
  prs,
  clearSelection,
} from "../../stores/reviewsStore";

const Chip: Component<{
  label: string;
  value: number;
  tint?: "primary" | "danger" | "warning" | "neutral";
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}> = (props) => {
  const tint = () => props.tint ?? "neutral";
  const color = () =>
    tint() === "primary"
      ? "var(--accent-primary)"
      : tint() === "danger"
      ? "var(--accent-red)"
      : tint() === "warning"
      ? "var(--accent-yellow)"
      : "var(--text-secondary)";
  const bg = () =>
    tint() === "neutral"
      ? "transparent"
      : `color-mix(in srgb, ${color()} 14%, transparent)`;
  const border = () =>
    tint() === "neutral"
      ? "var(--border-default)"
      : `color-mix(in srgb, ${color()} 28%, transparent)`;

  return (
    <button
      class="flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{
        background: bg(),
        color: color(),
        border: `1px solid ${border()}`,
        cursor: props.disabled ? "default" : props.onClick ? "pointer" : "default",
        "font-size": "calc(var(--ui-font-size) - 3px)",
        "font-weight": "500",
        opacity: props.disabled ? 0.65 : 1,
      }}
      onClick={() => !props.disabled && props.onClick?.()}
      title={props.title}
      disabled={props.disabled}
    >
      <span>{props.label}</span>
      <span style={{ "font-weight": "600" }}>{props.value}</span>
    </button>
  );
};

const WorkspaceHeader: Component<{
  onOpenPending: () => void;
  onOpenAudit: () => void;
  onOpenShortcuts: () => void;
}> = (props) => {
  const reviewing = () => runningReviews().size;
  const pending = () => pendingComments.length;
  const violations = createMemo(() => {
    let n = 0;
    for (const key of Object.keys(policyResults)) {
      const list = policyResults[Number(key)] ?? [];
      n += list.filter((r) => !r.passed && r.required).length;
    }
    return n;
  });
  const selected = () => selectedPrs().size;

  return (
    <div
      class="flex items-center justify-between shrink-0 px-3"
      style={{
        height: "34px",
        background: "var(--bg-surface)",
        "border-bottom": "1px solid var(--border-default)",
      }}
    >
      <div class="flex items-center gap-2">
        <Chip
          label="PRs"
          value={prs.length}
          tint="neutral"
          title="Total PRs visible"
          disabled
        />
        <Chip
          label="Selected"
          value={selected()}
          tint={selected() > 0 ? "primary" : "neutral"}
          title={selected() > 0 ? "Click to clear selection" : "No PRs selected"}
          onClick={selected() > 0 ? () => clearSelection() : undefined}
        />
        <Chip
          label="Reviewing"
          value={reviewing()}
          tint={reviewing() > 0 ? "warning" : "neutral"}
          title="Reviews currently running"
          disabled
        />
        <Chip
          label="Violations"
          value={violations()}
          tint={violations() > 0 ? "danger" : "neutral"}
          title={violations() > 0 ? "Required policy violations across all PRs" : "No required violations"}
          disabled
        />
        <Chip
          label="Pending"
          value={pending()}
          tint={pending() > 0 ? "warning" : "neutral"}
          title="Pending comments awaiting your approval"
          onClick={pending() > 0 ? props.onOpenPending : undefined}
        />
      </div>
      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={props.onOpenShortcuts}
          title="Show keyboard shortcuts (?)"
        >
          <span>Shortcuts</span>
          <span
            class="px-1 rounded"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              "font-family": "var(--font-mono, monospace)",
              "font-size": "calc(var(--ui-font-size) - 4px)",
            }}
          >
            ?
          </span>
        </button>
        <button
          class="flex items-center gap-1 rounded-full px-2 py-0.5"
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={props.onOpenAudit}
          title="Open audit log"
        >
          Audit
        </button>
        <Show when={pending() > 0}>
          <button
            class="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: "color-mix(in srgb, var(--accent-yellow) 15%, transparent)",
              color: "var(--accent-yellow)",
              border: "1px solid color-mix(in srgb, var(--accent-yellow) 30%, transparent)",
              cursor: "pointer",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              "font-weight": "500",
            }}
            onClick={props.onOpenPending}
          >
            Review pending
            <span
              class="px-1.5 rounded-full"
              style={{
                background: "var(--accent-yellow)",
                color: "#000",
                "font-weight": "700",
                "min-width": "16px",
                "text-align": "center",
              }}
            >
              {pending()}
            </span>
          </button>
        </Show>
      </div>
    </div>
  );
};

export default WorkspaceHeader;
