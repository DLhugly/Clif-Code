import { Component, For, Show, createMemo, createSignal } from "solid-js";
import type { PrSummary } from "../../lib/tauri";
import {
  getCiSummary,
  formatAge,
  reviewResults,
  runningReviews,
  selectedPrNumber,
  setSelectedPrNumber,
  runReview,
} from "../../stores/reviewsStore";
import { openExternal } from "../../lib/tauri";
import { setViewMode } from "../../stores/uiStore";

const CheckGlyph: Component<{ state: "passing" | "failing" | "pending" | "none" }> = (props) => {
  const color = () =>
    props.state === "passing"
      ? "var(--accent-green)"
      : props.state === "failing"
      ? "var(--accent-red)"
      : props.state === "pending"
      ? "var(--accent-yellow)"
      : "var(--text-muted)";
  return (
    <span
      style={{
        display: "inline-block",
        width: "8px",
        height: "8px",
        "border-radius": "50%",
        background: color(),
      }}
    />
  );
};

const ReviewRow: Component<{ pr: PrSummary; expanded: boolean; onToggle: () => void }> = (props) => {
  const ci = () => getCiSummary(props.pr);
  const isSelected = () => selectedPrNumber() === props.pr.number;
  const review = createMemo(() => reviewResults[props.pr.number] ?? null);
  const isRunning = () => runningReviews().has(props.pr.number);
  const findingCounts = createMemo(() => {
    const r = review();
    if (!r) return null;
    const by: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
    for (const f of r.findings) by[f.severity] = (by[f.severity] || 0) + 1;
    return { total: r.findings.length, by };
  });
  const ciState = (): "passing" | "failing" | "pending" | "none" => {
    const s = ci();
    if (s.total === 0) return "none";
    if (s.failing > 0) return "failing";
    if (s.pending > 0) return "pending";
    return "passing";
  };
  const reviewLabel = () => {
    const d = (props.pr.reviewDecision ?? "").toUpperCase();
    if (d === "APPROVED") return { label: "Approved", color: "var(--accent-green)" };
    if (d === "CHANGES_REQUESTED") return { label: "Changes requested", color: "var(--accent-red)" };
    if (d === "REVIEW_REQUIRED") return { label: "Review required", color: "var(--accent-yellow)" };
    return null;
  };

  function onRowClick() {
    setSelectedPrNumber(props.pr.number);
    setViewMode("review");
  }

  return (
    <div
      class="shrink-0"
      style={{
        "border-bottom": "1px solid var(--border-muted)",
        background: isSelected() ? "color-mix(in srgb, var(--accent-primary) 10%, transparent)" : "transparent",
        "border-left": isSelected() ? "2px solid var(--accent-primary)" : "2px solid transparent",
      }}
    >
      <button
        class="w-full flex items-start gap-2 text-left px-3 py-2 transition-colors"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          if (!isSelected() && !props.expanded)
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onClick={onRowClick}
        onDblClick={props.onToggle}
      >
        <div class="flex flex-col items-center gap-1 shrink-0" style={{ width: "32px", "padding-top": "2px" }}>
          <span
            style={{
              "font-family": "var(--font-mono, monospace)",
              "font-size": "calc(var(--ui-font-size) - 3.5px)",
              color: "var(--text-muted)",
            }}
          >
            #{props.pr.number}
          </span>
          <Show when={props.pr.isDraft}>
            <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 5px)" }}>draft</span>
          </Show>
        </div>
        <div class="flex flex-col flex-1 min-w-0 gap-1">
          <div class="truncate" style={{ "font-size": "calc(var(--ui-font-size) - 1.5px)", "font-weight": "500" }}>
            {props.pr.title}
          </div>
          <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "calc(var(--ui-font-size) - 3.5px)", color: "var(--text-muted)" }}>
            <span>@{props.pr.author?.login ?? "unknown"}</span>
            <span>·</span>
            <span>{formatAge(props.pr)}</span>
            <Show when={props.pr.changedFiles !== null}>
              <span>·</span>
              <span>{props.pr.changedFiles} files</span>
            </Show>
            <Show when={(props.pr.additions ?? 0) > 0 || (props.pr.deletions ?? 0) > 0}>
              <span>·</span>
              <span style={{ color: "var(--accent-green)" }}>+{props.pr.additions ?? 0}</span>
              <span style={{ color: "var(--accent-red)" }}>-{props.pr.deletions ?? 0}</span>
            </Show>
            <Show when={(props.pr.commits?.length ?? 0) > 0}>
              <span>·</span>
              <span>{props.pr.commits?.length} commit{(props.pr.commits?.length ?? 0) === 1 ? "" : "s"}</span>
            </Show>
          </div>
          <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
            {/* Review status pill */}
            <Show when={isRunning()}>
              <span class="flex items-center gap-1" style={{ color: "var(--accent-yellow)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="animate-spin">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                reviewing
              </span>
            </Show>
            <Show when={!isRunning() && findingCounts()}>
              <span
                class="px-1.5 rounded"
                style={{
                  background: (findingCounts()!.by.critical > 0 || findingCounts()!.by.high > 0)
                    ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
                    : findingCounts()!.total > 0
                    ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)"
                    : "color-mix(in srgb, var(--accent-green) 15%, transparent)",
                  color: (findingCounts()!.by.critical > 0 || findingCounts()!.by.high > 0)
                    ? "var(--accent-red)"
                    : findingCounts()!.total > 0
                    ? "var(--accent-primary)"
                    : "var(--accent-green)",
                  "font-weight": "500",
                }}
                title={`critical ${findingCounts()!.by.critical}, high ${findingCounts()!.by.high}, medium ${findingCounts()!.by.medium}, low ${findingCounts()!.by.low}, nit ${findingCounts()!.by.nit}`}
              >
                <Show when={findingCounts()!.total === 0}>clean</Show>
                <Show when={findingCounts()!.total > 0}>
                  {findingCounts()!.total} finding{findingCounts()!.total === 1 ? "" : "s"}
                  <Show when={findingCounts()!.by.critical > 0}>
                    <span style={{ "margin-left": "4px" }}>· {findingCounts()!.by.critical} crit</span>
                  </Show>
                </Show>
              </span>
            </Show>
            <span class="flex items-center gap-1">
              <CheckGlyph state={ciState()} />
              <span style={{ color: "var(--text-muted)" }}>
                <Show when={ci().total > 0} fallback="no CI">
                  {ci().passing}/{ci().total}
                  <Show when={ci().failing > 0}>
                    <span style={{ color: "var(--accent-red)", "margin-left": "4px" }}>
                      {ci().failing} failing
                    </span>
                  </Show>
                  <Show when={ci().pending > 0}>
                    <span style={{ color: "var(--accent-yellow)", "margin-left": "4px" }}>
                      {ci().pending} pending
                    </span>
                  </Show>
                </Show>
              </span>
            </span>
            <Show when={reviewLabel()}>
              <span
                class="px-1.5 rounded"
                style={{
                  background: `color-mix(in srgb, ${reviewLabel()!.color} 15%, transparent)`,
                  color: reviewLabel()!.color,
                  "font-weight": "500",
                }}
              >
                {reviewLabel()!.label}
              </span>
            </Show>
            <Show when={props.pr.mergeable === "CONFLICTING"}>
              <span
                class="px-1.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--accent-red) 15%, transparent)",
                  color: "var(--accent-red)",
                  "font-weight": "500",
                }}
              >
                conflicts
              </span>
            </Show>
          </div>
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{
            transform: props.expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            color: "var(--text-muted)",
            "margin-top": "4px",
            "flex-shrink": "0",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <Show when={props.expanded}>
        <div
          class="px-3 pb-3"
          style={{
            background: "var(--bg-base)",
            "border-top": "1px solid var(--border-muted)",
          }}
        >
          <div class="flex items-center gap-2 py-2 flex-wrap">
            <button
              class="px-2 py-1 rounded-md transition-colors"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={() => openExternal(props.pr.url)}
            >
              Open in GitHub
            </button>
            <button
              class="px-2 py-1 rounded-md transition-colors"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "font-weight": "500",
              }}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedPrNumber(props.pr.number);
                setViewMode("review");
                runReview(props.pr.number, { force: !!review() });
              }}
              disabled={isRunning()}
              title={review() ? "Re-run review" : "Run review"}
            >
              {isRunning() ? "Reviewing..." : review() ? "Re-run" : "Review"}
            </button>
            <button
              class="px-2 py-1 rounded-md transition-colors"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: review() ? "pointer" : "not-allowed",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                opacity: review() ? 1 : 0.6,
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (!review()) return;
                setSelectedPrNumber(props.pr.number);
                setViewMode("review");
              }}
              disabled={!review()}
              title={review() ? "Open Polish drawer for this PR" : "Run review first"}
            >
              Polish
            </button>
          </div>

          <Show when={(props.pr.commits?.length ?? 0) > 0}>
            <div class="py-1" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              <div
                class="mb-1"
                style={{ color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "font-size": "calc(var(--ui-font-size) - 4px)" }}
              >
                Commits
              </div>
              <div class="flex flex-col gap-1">
                <For each={props.pr.commits!.slice(0, 20)}>
                  {(c) => (
                    <div class="flex items-start gap-2" style={{ color: "var(--text-secondary)" }}>
                      <span
                        style={{
                          "font-family": "var(--font-mono, monospace)",
                          color: "var(--accent-primary)",
                          "font-size": "calc(var(--ui-font-size) - 3.5px)",
                          "flex-shrink": "0",
                        }}
                      >
                        {(c.oid ?? "").slice(0, 7)}
                      </span>
                      <span class="truncate flex-1">{c.messageHeadline ?? ""}</span>
                      <Show when={(c.authors?.[0]?.name ?? "").length > 0}>
                        <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 4px)", "flex-shrink": "0" }}>
                          {c.authors![0].name}
                        </span>
                      </Show>
                    </div>
                  )}
                </For>
                <Show when={(props.pr.commits?.length ?? 0) > 20}>
                  <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                    +{(props.pr.commits?.length ?? 0) - 20} more commits
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={(props.pr.statusCheckRollup?.length ?? 0) > 0}>
            <div class="py-1" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              <div
                class="mb-1"
                style={{ color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "font-size": "calc(var(--ui-font-size) - 4px)" }}
              >
                Checks
              </div>
              <div class="flex flex-wrap gap-1">
                <For each={props.pr.statusCheckRollup!.slice(0, 24)}>
                  {(c) => {
                    const conclusion = (c.conclusion ?? "").toLowerCase();
                    const status = (c.status ?? "").toLowerCase();
                    const color =
                      conclusion === "success"
                        ? "var(--accent-green)"
                        : conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out"
                        ? "var(--accent-red)"
                        : status === "in_progress" || status === "queued" || conclusion === ""
                        ? "var(--accent-yellow)"
                        : "var(--text-muted)";
                    return (
                      <span
                        class="px-1.5 rounded"
                        title={`${c.name ?? ""} · ${conclusion || status || "?"}`}
                        style={{
                          background: `color-mix(in srgb, ${color} 14%, transparent)`,
                          color,
                          "font-size": "calc(var(--ui-font-size) - 4px)",
                        }}
                      >
                        {(c.name ?? "check").slice(0, 24)}
                      </span>
                    );
                  }}
                </For>
                <Show when={(props.pr.statusCheckRollup?.length ?? 0) > 24}>
                  <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                    +{(props.pr.statusCheckRollup?.length ?? 0) - 24} more
                  </span>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export { ReviewRow };

export function useRowExpansion() {
  const [expandedId, setExpandedId] = createSignal<number | null>(null);
  return {
    isExpanded: (n: number) => expandedId() === n,
    toggle: (n: number) => setExpandedId((prev) => (prev === n ? null : n)),
  };
}
