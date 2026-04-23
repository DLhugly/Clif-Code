import { Component, For, Show, createMemo, createSignal, onMount } from "solid-js";
import {
  previewPlans,
  previewRunning,
  syncRunning,
  syncError,
  lastSyncedAt,
  lastSyncSummary,
  clearLastSyncSummary,
  previewSync,
  applySync,
  bootstrapAndRetry,
  bootstrapLabels,
  pendingPrs,
} from "../../stores/syncStore";
import { prs } from "../../stores/reviewsStore";
import { labelColor, type SyncPlan } from "../../types/sync";

const LabelPill: Component<{ name: string; tint?: "add" | "remove" | "neutral" }> = (props) => {
  const color = () => labelColor(props.name);
  const tint = () => props.tint ?? "neutral";
  const bg = () =>
    tint() === "add"
      ? "color-mix(in srgb, var(--accent-green) 16%, transparent)"
      : tint() === "remove"
      ? "color-mix(in srgb, var(--accent-red) 14%, transparent)"
      : "rgba(255,255,255,0.05)";
  const textColor = () =>
    tint() === "add"
      ? "var(--accent-green)"
      : tint() === "remove"
      ? "var(--accent-red)"
      : "var(--text-primary)";
  return (
    <span
      class="inline-flex items-center gap-1 rounded-full px-2"
      style={{
        background: bg(),
        color: textColor(),
        border: "1px solid rgba(255,255,255,0.1)",
        "font-size": "calc(var(--ui-font-size) - 3px)",
        "font-family": "monospace",
        height: "18px",
      }}
      title={props.name}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          "border-radius": "50%",
          background: color(),
        }}
      />
      <Show when={tint() === "add"}>
        <span style={{ "font-weight": "700" }}>+</span>
      </Show>
      <Show when={tint() === "remove"}>
        <span style={{ "font-weight": "700" }}>−</span>
      </Show>
      <span>{props.name.replace(/^clif\//, "")}</span>
    </span>
  );
};

const PlanRow: Component<{ plan: SyncPlan }> = (props) => {
  const pr = () => prs.find((p) => p.number === props.plan.pr_number) ?? null;
  const [expanded, setExpanded] = createSignal(false);
  const noop = () => props.plan.add.length === 0 && props.plan.remove.length === 0;

  return (
    <div
      style={{
        padding: "8px 10px",
        "border-bottom": "1px solid var(--border-muted)",
        background: noop() ? "transparent" : "rgba(255,255,255,0.02)",
      }}
    >
      <button
        class="w-full text-left flex items-start gap-3"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
          padding: 0,
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          style={{
            "font-family": "monospace",
            color: "var(--text-muted)",
            "min-width": "44px",
            "padding-top": "2px",
            "font-size": "calc(var(--ui-font-size) - 2px)",
          }}
        >
          #{props.plan.pr_number}
        </span>
        <div class="flex-1 min-w-0">
          <div
            class="truncate"
            style={{
              "font-size": "calc(var(--ui-font-size) - 1px)",
              "font-weight": "500",
            }}
          >
            {pr()?.title ?? `PR #${props.plan.pr_number}`}
          </div>
          <div class="flex items-center gap-1 flex-wrap" style={{ "margin-top": "4px" }}>
            <Show when={noop()}>
              <span
                style={{
                  "font-size": "calc(var(--ui-font-size) - 3px)",
                  color: "var(--text-muted)",
                }}
              >
                in sync
              </span>
            </Show>
            <For each={props.plan.add}>{(l) => <LabelPill name={l} tint="add" />}</For>
            <For each={props.plan.remove}>{(l) => <LabelPill name={l} tint="remove" />}</For>
          </div>
          <Show when={props.plan.skipped_reason}>
            <div
              style={{
                "margin-top": "4px",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                color: "var(--accent-red)",
              }}
            >
              Skipped: {props.plan.skipped_reason}
            </div>
          </Show>
        </div>
      </button>
      <Show when={expanded()}>
        <div
          style={{
            "margin-top": "6px",
            "margin-left": "44px",
            "font-size": "calc(var(--ui-font-size) - 3px)",
            color: "var(--text-secondary)",
          }}
        >
          <div style={{ "margin-bottom": "4px" }}>
            <span style={{ color: "var(--text-muted)" }}>current labels:</span>{" "}
            <Show
              when={props.plan.current_labels.length > 0}
              fallback={<span style={{ opacity: 0.6 }}>(none)</span>}
            >
              <span>{props.plan.current_labels.join(", ")}</span>
            </Show>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)" }}>target clif labels:</span>{" "}
            <Show
              when={props.plan.target_labels.length > 0}
              fallback={<span style={{ opacity: 0.6 }}>(none)</span>}
            >
              <span>{props.plan.target_labels.join(", ")}</span>
            </Show>
          </div>
        </div>
      </Show>
    </div>
  );
};

const SyncDrawer: Component<{ onClose: () => void }> = (props) => {
  const plans = createMemo(() => {
    const list: SyncPlan[] = [];
    for (const key of Object.keys(previewPlans)) {
      const p = previewPlans[Number(key)];
      if (p) list.push(p);
    }
    list.sort((a, b) => {
      const aDelta = a.add.length + a.remove.length;
      const bDelta = b.add.length + b.remove.length;
      if (aDelta !== bDelta) return bDelta - aDelta;
      return a.pr_number - b.pr_number;
    });
    return list;
  });
  const totalDelta = createMemo(() =>
    plans().reduce((acc, p) => acc + p.add.length + p.remove.length, 0),
  );
  const affected = createMemo(() =>
    plans().filter((p) => p.add.length + p.remove.length > 0).length,
  );

  onMount(() => {
    void previewSync();
  });

  return (
    <div
      class="fixed inset-0 z-40 flex"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div class="ml-auto h-full flex flex-col" style={{ width: "min(560px, 100vw)", background: "var(--bg-surface)", "border-left": "1px solid var(--border-default)" }}>
        <div
          class="flex items-center justify-between px-3 shrink-0"
          style={{
            height: "40px",
            "border-bottom": "1px solid var(--border-default)",
          }}
        >
          <div class="flex items-center gap-2">
            <span style={{ "font-weight": "600" }}>Sync to GitHub</span>
            <span
              class="px-2 py-0.5 rounded-full"
              style={{
                background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                color: "var(--accent-primary)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "font-weight": "500",
              }}
            >
              {totalDelta()} change{totalDelta() === 1 ? "" : "s"} · {affected()} PR{affected() === 1 ? "" : "s"}
            </span>
            <Show when={pendingPrs().size > 0 && plans().length === 0}>
              <span style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)" }}>
                · {pendingPrs().size} pending
              </span>
            </Show>
          </div>
          <button
            class="rounded px-2 py-0.5"
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--text-muted)",
              cursor: "pointer",
              "font-size": "calc(var(--ui-font-size) - 3px)",
            }}
            onClick={props.onClose}
          >
            Close
          </button>
        </div>

        <div
          class="flex items-center gap-2 px-3 py-2 shrink-0 flex-wrap"
          style={{ "border-bottom": "1px solid var(--border-muted)" }}
        >
          <button
            class="rounded px-2 py-1"
            style={{
              background: "var(--bg-base)",
              border: "1px solid var(--border-default)",
              color: "var(--text-primary)",
              cursor: previewRunning() ? "wait" : "pointer",
              "font-size": "calc(var(--ui-font-size) - 3px)",
            }}
            disabled={previewRunning()}
            onClick={() => void previewSync()}
            title="Re-compute plan from current decisions + GitHub labels"
          >
            {previewRunning() ? "Refreshing…" : "Refresh preview"}
          </button>
          <button
            class="rounded px-2 py-1"
            style={{
              background: affected() > 0 ? "var(--accent-primary)" : "var(--bg-base)",
              color: affected() > 0 ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: affected() > 0 && !syncRunning() ? "pointer" : "not-allowed",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              "font-weight": "500",
              opacity: affected() === 0 || syncRunning() ? 0.7 : 1,
            }}
            disabled={affected() === 0 || syncRunning()}
            onClick={async () => {
              await applySync();
              await previewSync();
            }}
            title="Apply all pending label changes via gh pr edit"
          >
            {syncRunning() ? "Pushing…" : `Push ${totalDelta()} to GitHub`}
          </button>
          <button
            class="rounded px-2 py-1 ml-auto"
            style={{
              background: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--text-muted)",
              cursor: "pointer",
              "font-size": "calc(var(--ui-font-size) - 3px)",
            }}
            onClick={async () => {
              await bootstrapLabels();
              await previewSync();
            }}
            title="Create missing clif/* labels in the repo (idempotent)"
          >
            Create labels
          </button>
        </div>

        <Show when={lastSyncSummary()}>
          {(() => {
            const summary = lastSyncSummary()!;
            const hasSuccess = summary.ok_count > 0;
            const hasFailure = summary.fail_count > 0;
            const tint = hasFailure ? "var(--accent-red)" : "var(--accent-green)";
            return (
              <div
                class="flex items-start gap-2 px-3 py-2 shrink-0"
                style={{
                  background: `color-mix(in srgb, ${tint} 14%, transparent)`,
                  color: tint,
                  "border-bottom": "1px solid var(--border-muted)",
                  "font-size": "calc(var(--ui-font-size) - 3px)",
                }}
              >
                <div style={{ flex: "1" }}>
                  <div style={{ "font-weight": "600" }}>
                    <Show when={hasSuccess}>
                      {summary.add_total + summary.remove_total} label change
                      {summary.add_total + summary.remove_total === 1 ? "" : "s"} pushed across{" "}
                      {summary.ok_count} PR{summary.ok_count === 1 ? "" : "s"}
                    </Show>
                    <Show when={hasSuccess && hasFailure}> · </Show>
                    <Show when={hasFailure}>
                      {summary.fail_count} PR{summary.fail_count === 1 ? "" : "s"} failed
                    </Show>
                  </div>
                  <Show when={summary.missing_label_error}>
                    <div style={{ "margin-top": "4px", color: "var(--text-secondary)" }}>
                      One or more Clif labels don't exist in this repo yet. Create them once and
                      retry.
                    </div>
                  </Show>
                </div>
                <Show when={summary.missing_label_error}>
                  <button
                    class="rounded px-2 py-0.5"
                    style={{
                      background: "var(--accent-primary)",
                      color: "#fff",
                      border: "none",
                      cursor: syncRunning() ? "wait" : "pointer",
                      "font-size": "calc(var(--ui-font-size) - 3px)",
                      "font-weight": "500",
                      "white-space": "nowrap",
                    }}
                    disabled={syncRunning()}
                    onClick={async () => {
                      await bootstrapAndRetry();
                      await previewSync();
                    }}
                  >
                    Create labels and retry
                  </button>
                </Show>
                <button
                  class="rounded"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "currentColor",
                    cursor: "pointer",
                    opacity: 0.6,
                    padding: "0 4px",
                    "font-size": "calc(var(--ui-font-size) - 2px)",
                    "line-height": "1",
                  }}
                  onClick={clearLastSyncSummary}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
            );
          })()}
        </Show>

        <Show when={syncError()}>
          <div
            class="px-3 py-2 shrink-0"
            style={{
              background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
              color: "var(--accent-red)",
              "border-bottom": "1px solid var(--border-muted)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              "white-space": "pre-wrap",
            }}
          >
            {syncError()}
          </div>
        </Show>

        <div class="flex-1 min-h-0 overflow-auto">
          <Show
            when={plans().length > 0}
            fallback={
              <div
                class="h-full flex flex-col items-center justify-center px-4 text-center gap-2"
                style={{ color: "var(--text-muted)" }}
              >
                <div style={{ "font-size": "calc(var(--ui-font-size))", "font-weight": "500" }}>
                  Nothing to push
                </div>
                <div style={{ "font-size": "calc(var(--ui-font-size) - 2px)", "max-width": "40ch" }}>
                  Mark PRs ready to merge, kick some back, or run a classification — the changes
                  will show up here. Clif only manages labels in the <code>clif/*</code> namespace;
                  your existing labels are preserved.
                </div>
              </div>
            }
          >
            <For each={plans()}>{(p) => <PlanRow plan={p} />}</For>
          </Show>
        </div>

        <Show when={lastSyncedAt()}>
          <div
            class="px-3 py-1 shrink-0"
            style={{
              "border-top": "1px solid var(--border-muted)",
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 4px)",
            }}
          >
            Last push: {new Date(lastSyncedAt()!).toLocaleTimeString()}
          </div>
        </Show>
      </div>
    </div>
  );
};

export default SyncDrawer;
