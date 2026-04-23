import { Component, For, Show, createEffect, createMemo, onMount } from "solid-js";
import { projectRoot } from "../../stores/fileStore";
import {
  prs,
  loading,
  error,
  lastFetchedAt,
  gh,
  search,
  setSearch,
  stateFilter,
  setStateFilter,
  authorFilter,
  setAuthorFilter,
  hideDrafts,
  setHideDrafts,
  onlyFailingCi,
  setOnlyFailingCi,
  sort,
  setSort,
  refreshPrs,
  checkGhAvailability,
  filteredSortedPrs,
  ensureReviewListeners,
  loadCachedReviews,
  reviewResults,
  runningReviews,
  progressFilter,
  setProgressFilter,
  progressCounts,
  tierFilter,
  setTierFilter,
  type PrStateFilter,
  type PrSort,
  type ProgressFilter,
} from "../../stores/reviewsStore";
import {
  classifications,
  classifyQueueStats,
  classifying,
} from "../../stores/classificationStore";
import { TIER_META, type Tier } from "../../types/classification";
import { ReviewRow, useRowExpansion } from "./ReviewRow";
import { openExternal } from "../../lib/tauri";
import BulkActionBar from "./BulkActionBar";
import { openConsolidationFromSelection } from "./consolidationHub";

const STATE_OPTIONS: { value: PrStateFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS: { value: PrSort; label: string }[] = [
  { value: "tier-desc", label: "Tier (high risk first)" },
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently opened" },
  { value: "age-desc", label: "Oldest first" },
  { value: "commits-desc", label: "Most commits" },
  { value: "ci-failing-first", label: "Failing CI first" },
];

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);

const ReviewsPanel: Component = () => {
  const exp = useRowExpansion();

  onMount(async () => {
    await ensureReviewListeners();
    await checkGhAvailability();
    const root = projectRoot();
    if (root) {
      await loadCachedReviews(root);
      await refreshPrs(root);
    }
  });

  createEffect(() => {
    const root = projectRoot();
    if (root) {
      loadCachedReviews(root);
      refreshPrs(root);
    }
  });

  createEffect(() => {
    // Re-fetch when state filter changes
    stateFilter();
    const root = projectRoot();
    if (root) refreshPrs(root);
  });

  // Auto-queue removed: LLM reviews only run when the user explicitly clicks
  // "Review with LLM" in the PR detail view. Keeping this comment so future
  // edits don't silently reintroduce an auto-trigger.

  const rows = createMemo(() => filteredSortedPrs());
  const counts = createMemo(() => ({
    total: prs.length,
    shown: rows().length,
    // Note: per-PR CI details are loaded lazily on row expand, so the failing
    // count here is 0 until expansions populate the detail cache.
    drafts: prs.filter((p) => p.isDraft).length,
  }));

  const relativeFetched = () => {
    const t = lastFetchedAt();
    if (!t) return "";
    const ms = Date.now() - t;
    if (ms < 60_000) return "just now";
    const m = Math.floor(ms / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
  };

  return (
    <div
      class="flex flex-col h-full overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        "border-right": "1px solid var(--border-default)",
        "font-size": "var(--ui-font-size)",
      }}
    >
      {/* Header */}
      <div
        class="flex items-center justify-between shrink-0 px-3"
        style={{
          height: "36px",
          "border-bottom": "1px solid var(--border-default)",
        }}
      >
        <div class="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ color: "var(--text-muted)" }}>
            <circle cx="18" cy="18" r="3" />
            <circle cx="6" cy="6" r="3" />
            <path d="M13 6h3a2 2 0 0 1 2 2v7" />
            <line x1="6" y1="9" x2="6" y2="21" />
          </svg>
          <span class="font-medium" style={{ "font-size": "calc(var(--ui-font-size) - 2px)", color: "var(--text-primary)" }}>
            Reviews
          </span>
          <Show when={counts().total > 0}>
            <span
              class="px-1.5 rounded"
              style={{
                background: "var(--bg-hover)",
                color: "var(--text-muted)",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
              }}
            >
              {counts().shown}/{counts().total}
            </span>
          </Show>
          {(() => {
            const stats = createMemo(() => classifyQueueStats());
            const classifyingNow = () => classifying().size;
            const remaining = () => classifyingNow() + stats().queued;
            const total = () => stats().total;
            const done = () => Math.max(0, total() - remaining());
            return (
              <Show when={remaining() > 0}>
                <span
                  class="flex items-center gap-1 px-1.5 rounded"
                  style={{
                    background: "color-mix(in srgb, var(--accent-green) 14%, transparent)",
                    color: "var(--accent-green)",
                    "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  }}
                  title={
                    "Heuristic scan (local, free — no LLM): regex + filename signals + security scanner.\n" +
                    `Running: ${classifyingNow()} in flight, ${stats().queued} queued, ${done()} of ${total()} done.\n` +
                    "Produces the T1–T5 tier badge on each PR. Unlike the LLM review, this always runs on refresh."
                  }
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" class="animate-spin">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  heuristic scan {done()}/{total()}
                </span>
              </Show>
            );
          })()}
        </div>
        <div class="flex items-center gap-1.5">
          {/* LLM triggers are intentionally not here. This view is heuristic-
              only. Open a PR to run an LLM review with the "Review with LLM"
              button. */}
          <button
            class="flex items-center justify-center shrink-0 rounded p-1 transition-colors"
            style={{
              color: loading() ? "var(--accent-primary)" : "var(--text-muted)",
              background: "transparent",
              border: "none",
              cursor: loading() ? "default" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!loading()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={() => {
              const root = projectRoot();
              if (root) refreshPrs(root);
            }}
            title="Refresh PR list"
            disabled={loading()}
          >
            <Show when={loading()} fallback={<RefreshIcon />}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            </Show>
          </button>
        </div>
      </div>

      {/* Legend: two separate analyses run against your PRs. Making the
          distinction visible on every refresh so nobody burns tokens by
          accident thinking tier classification uses the LLM. */}
      <div
        class="shrink-0 flex items-center gap-3 flex-wrap px-3 py-1"
        style={{
          background: "var(--bg-base)",
          "border-bottom": "1px solid var(--border-muted)",
          color: "var(--text-muted)",
          "font-size": "calc(var(--ui-font-size) - 4px)",
        }}
      >
        <span
          class="flex items-center gap-1.5"
          title={
            "Heuristic scan: local Rust code that parses the diff and classifies each PR into T1–T5. Uses regex + filename patterns + our security scanner. Free, always on, no API key required."
          }
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              "border-radius": "50%",
              background: "var(--accent-green)",
            }}
          />
          <span>
            <b style={{ color: "var(--text-secondary)" }}>Tier badge</b> = local heuristic (free)
          </span>
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span
          class="flex items-center gap-1.5"
          title={
            "LLM review is only triggered when you open a PR and click 'Review with LLM'. Findings live on the PR detail page, not here. Never auto-runs."
          }
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              "border-radius": "50%",
              background: "var(--accent-yellow)",
            }}
          />
          <span>
            <b style={{ color: "var(--text-secondary)" }}>LLM review</b> = open a PR, click
            "Review with LLM"
          </span>
        </span>
      </div>

      {/* Inbox / Handled / All: the review-flow filter. Default is "inbox"
          (PRs with no user decisions) so you see only what still needs you. */}
      <div
        class="shrink-0 flex items-center gap-1 px-3 py-2"
        style={{ "border-bottom": "1px solid var(--border-muted)" }}
      >
        {(() => {
          const counts = createMemo(() => progressCounts());
          const Tab: Component<{ id: ProgressFilter; label: string; count: number; tint?: string }> = (tp) => {
            const active = () => progressFilter() === tp.id;
            return (
              <button
                class="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 transition-colors"
                style={{
                  background: active()
                    ? tp.tint
                      ? `color-mix(in srgb, ${tp.tint} 18%, transparent)`
                      : "var(--accent-primary)"
                    : "transparent",
                  color: active()
                    ? tp.tint
                      ? tp.tint
                      : "#fff"
                    : "var(--text-muted)",
                  border: `1px solid ${
                    active()
                      ? tp.tint
                        ? `color-mix(in srgb, ${tp.tint} 40%, transparent)`
                        : "var(--accent-primary)"
                      : "var(--border-default)"
                  }`,
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 2.5px)",
                  "font-weight": active() ? "600" : "500",
                }}
                onClick={() => setProgressFilter(tp.id)}
                title={
                  tp.id === "inbox"
                    ? "PRs that still need your review (no decisions yet)"
                    : tp.id === "handled"
                    ? "PRs you've already marked ready, kicked back, or signed off on"
                    : "Every PR, regardless of state"
                }
              >
                <span>{tp.label}</span>
                <span
                  class="rounded-full px-1.5"
                  style={{
                    background: active() ? "rgba(255,255,255,0.18)" : "var(--bg-base)",
                    color: active() && !tp.tint ? "#fff" : "var(--text-muted)",
                    "font-size": "calc(var(--ui-font-size) - 4px)",
                    "font-weight": "700",
                    "min-width": "18px",
                    "text-align": "center",
                  }}
                >
                  {tp.count}
                </span>
              </button>
            );
          };
          return (
            <>
              <Tab id="inbox" label="Inbox" count={counts().inbox} tint="var(--accent-primary)" />
              <Tab id="handled" label="Handled" count={counts().handled} tint="var(--accent-green)" />
              <Tab id="all" label="All" count={counts().all} />
            </>
          );
        })()}
      </div>

      {/* Search + filters */}
      <div class="shrink-0 flex flex-col gap-1.5 px-3 py-2" style={{ "border-bottom": "1px solid var(--border-default)" }}>
        <div
          class="flex items-center gap-1.5 rounded px-2 py-1"
          style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            class="flex-1 min-w-0 outline-none bg-transparent"
            style={{ color: "var(--text-primary)", border: "none", "font-size": "calc(var(--ui-font-size) - 2.5px)" }}
            placeholder="Search title, author, branch..."
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <Show when={search()}>
            <button
              class="shrink-0 flex items-center justify-center"
              style={{ color: "var(--text-muted)", cursor: "pointer", background: "transparent", border: "none" }}
              onClick={() => setSearch("")}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </Show>
        </div>

        <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
          <div class="flex rounded-md overflow-hidden" style={{ border: "1px solid var(--border-muted)" }}>
            <For each={STATE_OPTIONS}>
              {(opt) => (
                <button
                  class="px-2 py-0.5 transition-colors"
                  style={{
                    background: stateFilter() === opt.value ? "var(--accent-primary)" : "transparent",
                    color: stateFilter() === opt.value ? "#fff" : "var(--text-muted)",
                    border: "none",
                    cursor: "pointer",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                  }}
                  onClick={() => setStateFilter(opt.value)}
                >
                  {opt.label}
                </button>
              )}
            </For>
          </div>
          <select
            class="outline-none rounded px-1 py-0.5"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              cursor: "pointer",
            }}
            value={sort()}
            onChange={(e) => setSort(e.currentTarget.value as PrSort)}
          >
            <For each={SORT_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </div>

        <div class="flex items-center gap-3 flex-wrap" style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)" }}>
          <input
            type="text"
            class="outline-none rounded px-1.5 py-0.5"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              "min-width": "0",
              flex: "1",
            }}
            placeholder="author filter"
            value={authorFilter()}
            onInput={(e) => setAuthorFilter(e.currentTarget.value)}
          />
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={hideDrafts()} onChange={(e) => setHideDrafts(e.currentTarget.checked)} />
            <span>hide drafts</span>
          </label>
          <label class="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={onlyFailingCi()} onChange={(e) => setOnlyFailingCi(e.currentTarget.checked)} />
            <span>only failing CI</span>
          </label>
        </div>

        {/* Tier filter pills — click a tier to show only that bucket. Click
            again to remove. With all off (default), every tier is shown. */}
        <div class="flex items-center gap-1 flex-wrap">
          <span
            style={{
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 3.5px)",
              "text-transform": "uppercase",
              "letter-spacing": "0.05em",
              "margin-right": "2px",
            }}
          >
            Tier
          </span>
          {(() => {
            const counts = createMemo(() => {
              const c: Record<Tier, number> = { T1: 0, T2: 0, T3: 0, T4: 0, T5: 0 };
              for (const key of Object.keys(classifications)) {
                const cls = classifications[Number(key)];
                if (cls) c[cls.tier]++;
              }
              return c;
            });
            const tierOrder: Tier[] = ["T5", "T4", "T3", "T2", "T1"];
            return (
              <For each={tierOrder}>
                {(t) => {
                  const meta = TIER_META[t];
                  const active = () => tierFilter().has(t);
                  return (
                    <button
                      class="rounded-full px-1.5 py-0.5 transition-colors"
                      style={{
                        background: active()
                          ? meta.bg
                          : "transparent",
                        color: active() ? meta.color : "var(--text-muted)",
                        border: `1px solid ${
                          active() ? `${meta.color}55` : "var(--border-default)"
                        }`,
                        cursor: "pointer",
                        "font-size": "calc(var(--ui-font-size) - 3.5px)",
                        "font-weight": active() ? "700" : "500",
                        "font-family": "monospace",
                      }}
                      onClick={() => {
                        setTierFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(t)) next.delete(t);
                          else next.add(t);
                          return next;
                        });
                      }}
                      title={`Show only ${meta.short} (${meta.label}) PRs — ${counts()[t]} currently classified`}
                    >
                      {meta.short}{" "}
                      <span style={{ opacity: 0.7, "font-weight": "500" }}>{counts()[t]}</span>
                    </button>
                  );
                }}
              </For>
            );
          })()}
          <Show when={tierFilter().size > 0}>
            <button
              class="rounded-full px-1.5 py-0.5"
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
              }}
              onClick={() => setTierFilter(new Set<Tier>())}
              title="Clear tier filter"
            >
              clear
            </button>
          </Show>
        </div>
      </div>

      {/* Body */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={gh() && !gh()!.installed}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
            <div style={{ color: "var(--text-primary)", "font-weight": "500" }}>GitHub CLI not installed</div>
            <div>Clif Reviews needs the `gh` CLI to list and act on pull requests.</div>
            <button
              class="self-start px-2 py-1 rounded"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "font-weight": "500",
              }}
              onClick={() => openExternal("https://cli.github.com/")}
            >
              Install gh CLI
            </button>
          </div>
        </Show>
        <Show when={gh() && gh()!.installed && !gh()!.authenticated}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
            <div style={{ color: "var(--text-primary)", "font-weight": "500" }}>`gh` is not authenticated</div>
            <div>Run the following in your terminal and retry:</div>
            <code
              class="rounded px-2 py-1"
              style={{ background: "var(--bg-base)", color: "var(--text-primary)", "font-size": "calc(var(--ui-font-size) - 3px)" }}
            >
              gh auth login
            </code>
            <button
              class="self-start px-2 py-1 rounded"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={() => checkGhAvailability()}
            >
              Re-check auth
            </button>
          </div>
        </Show>
        <Show when={!projectRoot()}>
          <div class="flex items-center justify-center h-full" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)", padding: "24px" }}>
            Open a folder to see its PRs.
          </div>
        </Show>
        <Show when={projectRoot() && !loading() && !error() && rows().length === 0 && gh()?.installed && gh()?.authenticated}>
          <div class="flex flex-col items-center justify-center h-full gap-2 text-center" style={{ color: "var(--text-muted)", padding: "32px 20px" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style={{ opacity: 0.4 }}>
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 2px)", color: "var(--text-primary)" }}>
              {prs.length === 0
                ? "No open PRs in this repo"
                : progressFilter() === "inbox" && progressCounts().inbox === 0
                ? "Inbox zero — everything decided"
                : "No PRs match your filters"}
            </div>
            <Show when={prs.length === 0}>
              <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
                When teammates open PRs, they'll appear here with live risk scores.
              </div>
            </Show>
            <Show when={prs.length > 0 && progressFilter() === "inbox" && progressCounts().inbox === 0}>
              <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", "max-width": "34ch" }}>
                You've made a decision on every PR. Switch to <b>Handled</b> or <b>All</b> to review
                your past calls, or wait for new PRs to land.
              </div>
              <button
                class="px-2 py-1 rounded mt-1"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 3px)",
                }}
                onClick={() => setProgressFilter("handled")}
              >
                Show Handled
              </button>
            </Show>
            <Show when={prs.length > 0 && !(progressFilter() === "inbox" && progressCounts().inbox === 0)}>
              <button
                class="px-2 py-1 rounded mt-1"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 3px)",
                }}
                onClick={() => {
                  setSearch("");
                  setAuthorFilter("");
                  setHideDrafts(false);
                  setOnlyFailingCi(false);
                  setStateFilter("open");
                  setProgressFilter("inbox");
                }}
              >
                Clear filters
              </button>
            </Show>
          </div>
        </Show>
        <Show when={error()}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--accent-red)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
            <div style={{ "font-weight": "500" }}>Failed to load PRs</div>
            <div style={{ color: "var(--text-muted)" }}>{error()}</div>
            <button
              class="self-start px-2 py-1 rounded"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={() => {
                const root = projectRoot();
                if (root) refreshPrs(root);
              }}
            >
              Retry
            </button>
          </div>
        </Show>
        <For each={rows()}>
          {(pr) => (
            <ReviewRow pr={pr} expanded={exp.isExpanded(pr.number)} onToggle={() => exp.toggle(pr.number)} />
          )}
        </For>
      </div>

      {/* Bulk actions bar (appears when selection is non-empty) */}
      <BulkActionBar onConsolidate={() => openConsolidationFromSelection()} />

      {/* Footer */}
      <div
        class="shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{
          "border-top": "1px solid var(--border-default)",
          color: "var(--text-muted)",
          "font-size": "calc(var(--ui-font-size) - 3.5px)",
          background: "var(--bg-base)",
        }}
      >
        <span>
          <Show when={lastFetchedAt()} fallback="Not loaded">
            Updated {relativeFetched()}
          </Show>
        </span>
        <span class="flex items-center gap-2">
          <Show when={runningReviews().size > 0}>
            <span style={{ color: "var(--accent-yellow)" }}>
              {runningReviews().size} reviewing
            </span>
          </Show>
          <Show when={Object.keys(reviewResults).length > 0}>
            <span>{Object.keys(reviewResults).length} reviewed</span>
          </Show>
          <Show when={counts().drafts > 0}>
            <span>{counts().drafts} drafts</span>
          </Show>
        </span>
      </div>
    </div>
  );
};

export default ReviewsPanel;
