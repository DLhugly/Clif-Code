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
  prDetails,
  loadingDetail,
  fetchPrDetail,
  selectedPrs,
  toggleSelection,
  selectRangeTo,
  filteredSortedPrs,
  policyResults,
  fetchRelatedPrs,
  relatedPrs,
} from "../../stores/reviewsStore";
import SimilarityDrawer from "./SimilarityDrawer";
import { openExternal } from "../../lib/tauri";
import { setViewMode } from "../../stores/uiStore";
import { createEffect } from "solid-js";
import TierChip from "./TierChip";
import WhyTierPanel from "./WhyTierPanel";
import {
  classifications,
  classifying,
  fetchClassification,
} from "../../stores/classificationStore";
import { pendingPrs, previewPlans } from "../../stores/syncStore";

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
  const detail = createMemo(() => prDetails[props.pr.number] ?? null);
  const detailLoading = () => loadingDetail().has(props.pr.number);
  const commitsList = createMemo(() => detail()?.commits ?? props.pr.commits ?? []);
  const checksList = createMemo(() => detail()?.statusCheckRollup ?? props.pr.statusCheckRollup ?? []);
  const findingCounts = createMemo(() => {
    const r = review();
    if (!r) return null;
    const by: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
    for (const f of r.findings) by[f.severity] = (by[f.severity] || 0) + 1;
    return { total: r.findings.length, by };
  });
  const policyViolations = createMemo(() => {
    const list = policyResults[props.pr.number] ?? [];
    return list.filter((r) => !r.passed && r.required).length;
  });
  const [similarityOpen, setSimilarityOpen] = createSignal(false);
  const relatedCount = createMemo(() => (relatedPrs[props.pr.number] ?? []).length);
  const classification = createMemo(() => classifications[props.pr.number] ?? null);
  const isClassifying = () => classifying().has(props.pr.number);

  const syncIndicator = createMemo(() => {
    const plan = previewPlans[props.pr.number];
    if (plan && plan.add.length + plan.remove.length > 0) {
      const adds = plan.add.map((l) => `+ ${l}`);
      const removes = plan.remove.map((l) => `- ${l}`);
      const lines = [...adds, ...removes].join("\n");
      const heading = `Sync pending (${plan.add.length + plan.remove.length} change${
        plan.add.length + plan.remove.length === 1 ? "" : "s"
      }):`;
      return {
        color: "var(--accent-primary)",
        title: `${heading}\n${lines}`,
      };
    }
    if (pendingPrs().has(props.pr.number)) {
      return {
        color: "var(--accent-yellow)",
        title: "New decisions not yet pushed — open Sync drawer to preview",
      };
    }
    return null;
  });

  // Lazy-load detail (commits + checks) the first time the row is expanded
  createEffect(() => {
    if (props.expanded && !detail() && !detailLoading()) {
      fetchPrDetail(props.pr.number);
    }
    if (props.expanded && !classification() && !isClassifying()) {
      fetchClassification(props.pr.number);
    }
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

  function onRowClick(e: MouseEvent) {
    if (e.shiftKey) {
      const visible = filteredSortedPrs().map((p) => p.number);
      selectRangeTo(props.pr.number, visible);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggleSelection(props.pr.number);
      return;
    }
    setSelectedPrNumber(props.pr.number);
    setViewMode("review");
  }
  const isChecked = () => selectedPrs().has(props.pr.number);

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
        onClick={(e) => onRowClick(e)}
        onDblClick={props.onToggle}
      >
        <div
          class="flex items-center shrink-0"
          style={{ width: "22px", "padding-top": "3px" }}
          onClick={(e) => {
            e.stopPropagation();
            toggleSelection(props.pr.number);
          }}
        >
          <input
            type="checkbox"
            checked={isChecked()}
            style={{ cursor: "pointer" }}
            onClick={(e) => e.stopPropagation()}
            onChange={() => toggleSelection(props.pr.number)}
          />
        </div>
        <div class="flex flex-col items-center gap-1 shrink-0" style={{ width: "44px", "padding-top": "2px" }}>
          <div class="flex items-center gap-1">
            <TierChip
              classification={classification()}
              loading={isClassifying()}
              size="sm"
              showScore={false}
            />
            <Show when={syncIndicator()}>
              <span
                title={syncIndicator()!.title}
                style={{
                  width: "6px",
                  height: "6px",
                  "border-radius": "50%",
                  background: syncIndicator()!.color,
                  "flex-shrink": "0",
                }}
              />
            </Show>
          </div>
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
            <Show when={commitsList().length > 0}>
              <span>·</span>
              <span>{commitsList().length} commit{commitsList().length === 1 ? "" : "s"}</span>
            </Show>
          </div>
          <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
            <Show when={policyViolations() > 0}>
              <span
                class="flex items-center gap-1 px-1.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--accent-red) 18%, transparent)",
                  color: "var(--accent-red)",
                  "font-weight": "500",
                }}
                title={`${policyViolations()} required policy violation${policyViolations() === 1 ? "" : "s"}`}
              >
                <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: "var(--accent-red)" }} />
                {policyViolations()} policy fail
              </span>
            </Show>
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
          <Show when={classification()}>
            <WhyTierPanel classification={classification()!} />
          </Show>
          <Show when={!classification() && isClassifying()}>
            <div
              class="py-2"
              style={{
                "font-size": "calc(var(--ui-font-size) - 3px)",
                color: "var(--text-muted)",
              }}
            >
              Classifying PR…
            </div>
          </Show>
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
            <button
              class="px-2 py-1 rounded-md transition-colors"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                fetchRelatedPrs(props.pr.number);
                setSimilarityOpen(true);
              }}
              title="Find related PRs"
            >
              Related
              <Show when={relatedCount() > 0}>
                <span style={{ "margin-left": "4px", color: "var(--accent-primary)", "font-weight": "500" }}>
                  {relatedCount()}
                </span>
              </Show>
            </button>
          </div>

          <Show when={detailLoading() && commitsList().length === 0 && checksList().length === 0}>
            <div class="py-2 flex items-center gap-2" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Loading PR details...
            </div>
          </Show>

          <Show when={commitsList().length > 0}>
            <div class="py-1" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              <div
                class="mb-1"
                style={{ color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "font-size": "calc(var(--ui-font-size) - 4px)" }}
              >
                Commits
              </div>
              <div class="flex flex-col gap-1">
                <For each={commitsList().slice(0, 20)}>
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
                <Show when={commitsList().length > 20}>
                  <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                    +{commitsList().length - 20} more commits
                  </div>
                </Show>
              </div>
            </div>
          </Show>

          <Show when={checksList().length > 0}>
            <div class="py-1" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              <div
                class="mb-1"
                style={{ color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "font-size": "calc(var(--ui-font-size) - 4px)" }}
              >
                Checks
              </div>
              <div class="flex flex-wrap gap-1">
                <For each={checksList().slice(0, 24)}>
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
                <Show when={checksList().length > 24}>
                  <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                    +{checksList().length - 24} more
                  </span>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={similarityOpen()}>
        <SimilarityDrawer prNumber={props.pr.number} onClose={() => setSimilarityOpen(false)} />
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
