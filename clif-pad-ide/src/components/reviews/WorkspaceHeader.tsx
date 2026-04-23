import { Component, For, Show, createMemo } from "solid-js";
import {
  selectedPrs,
  runningReviews,
  pendingComments,
  policyResults,
  prs,
  clearSelection,
  tierCounts,
  selectByTier,
} from "../../stores/reviewsStore";
import { TIER_META, type Tier } from "../../types/classification";

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
  const tiers = createMemo(() => tierCounts());
  const tierOrder: Tier[] = ["T5", "T4", "T3", "T2", "T1"];

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
        <div class="flex items-center gap-1">
          <For each={tierOrder}>
            {(t) => {
              const count = () => tiers()[t];
              const meta = TIER_META[t];
              return (
                <button
                  class="flex items-center gap-1 rounded px-1.5 py-0.5"
                  title={`Select all ${meta.short} (${meta.label}) — ${count()} PR${count() === 1 ? "" : "s"}`}
                  onClick={() => count() > 0 && selectByTier(t)}
                  disabled={count() === 0}
                  style={{
                    background: count() > 0 ? meta.bg : "transparent",
                    color: count() > 0 ? meta.color : "var(--text-muted)",
                    border: `1px solid ${count() > 0 ? `${meta.color}44` : "var(--border-default)"}`,
                    cursor: count() > 0 ? "pointer" : "default",
                    opacity: count() === 0 ? 0.45 : 1,
                    "font-family": "monospace",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                    "font-weight": "600",
                  }}
                >
                  <span>{meta.short}</span>
                  <span style={{ "font-weight": "500", opacity: 0.85 }}>{count()}</span>
                </button>
              );
            }}
          </For>
        </div>
        <div style={{ width: "1px", height: "18px", background: "var(--border-default)" }} />
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
