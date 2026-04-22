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
  queueReviewsForPrs,
  runAllShown,
  autoReviewEnabled,
  setAutoReviewEnabled,
  reviewResults,
  runningReviews,
  type PrStateFilter,
  type PrSort,
} from "../../stores/reviewsStore";
import { ReviewRow, useRowExpansion } from "./ReviewRow";
import { openExternal } from "../../lib/tauri";

const STATE_OPTIONS: { value: PrStateFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "merged", label: "Merged" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

const SORT_OPTIONS: { value: PrSort; label: string }[] = [
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

  // Auto-queue reviews for visible PRs without cached results
  createEffect(() => {
    if (!autoReviewEnabled()) return;
    const numbers = rows().map((p) => p.number);
    queueReviewsForPrs(numbers);
  });

  const rows = createMemo(() => filteredSortedPrs());
  const counts = createMemo(() => ({
    total: prs.length,
    shown: rows().length,
    failing: prs.filter((p) => (p.statusCheckRollup ?? []).some((c) => (c.conclusion ?? "").toLowerCase() === "failure")).length,
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
          <span class="font-medium" style={{ "font-size": "12px", color: "var(--text-primary)" }}>
            Reviews
          </span>
          <Show when={counts().total > 0}>
            <span
              class="px-1.5 rounded"
              style={{
                background: "var(--bg-hover)",
                color: "var(--text-muted)",
                "font-size": "10.5px",
              }}
            >
              {counts().shown}/{counts().total}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            class="px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: autoReviewEnabled() ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)" : "transparent",
              color: autoReviewEnabled() ? "var(--accent-primary)" : "var(--text-muted)",
              border: `1px solid ${autoReviewEnabled() ? "color-mix(in srgb, var(--accent-primary) 30%, transparent)" : "var(--border-default)"}`,
              cursor: "pointer",
              "font-size": "10.5px",
              "font-weight": "500",
            }}
            onClick={() => setAutoReviewEnabled(!autoReviewEnabled())}
            title={autoReviewEnabled() ? "Auto-review is on" : "Auto-review is off"}
          >
            auto
          </button>
          <button
            class="px-1.5 py-0.5 rounded transition-colors"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              "font-size": "10.5px",
              "font-weight": "500",
            }}
            onClick={() => runAllShown(rows().map((p) => p.number))}
            title="Queue review for every PR currently shown"
          >
            review all
          </button>
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
            style={{ color: "var(--text-primary)", border: "none", "font-size": "11.5px" }}
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

        <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "11px" }}>
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
                    "font-size": "11px",
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
              "font-size": "11px",
              cursor: "pointer",
            }}
            value={sort()}
            onChange={(e) => setSort(e.currentTarget.value as PrSort)}
          >
            <For each={SORT_OPTIONS}>{(o) => <option value={o.value}>{o.label}</option>}</For>
          </select>
        </div>

        <div class="flex items-center gap-3 flex-wrap" style={{ "font-size": "11px", color: "var(--text-muted)" }}>
          <input
            type="text"
            class="outline-none rounded px-1.5 py-0.5"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "11px",
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
      </div>

      {/* Body */}
      <div class="flex-1 min-h-0 overflow-y-auto">
        <Show when={gh() && !gh()!.installed}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
            <div style={{ color: "var(--text-primary)", "font-weight": "500" }}>GitHub CLI not installed</div>
            <div>Clif Reviews needs the `gh` CLI to list and act on pull requests.</div>
            <button
              class="self-start px-2 py-1 rounded"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                "font-size": "11px",
                "font-weight": "500",
              }}
              onClick={() => openExternal("https://cli.github.com/")}
            >
              Install gh CLI
            </button>
          </div>
        </Show>
        <Show when={gh() && gh()!.installed && !gh()!.authenticated}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
            <div style={{ color: "var(--text-primary)", "font-weight": "500" }}>`gh` is not authenticated</div>
            <div>Run the following in your terminal and retry:</div>
            <code
              class="rounded px-2 py-1"
              style={{ background: "var(--bg-base)", color: "var(--text-primary)", "font-size": "11px" }}
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
                "font-size": "11px",
              }}
              onClick={() => checkGhAvailability()}
            >
              Re-check auth
            </button>
          </div>
        </Show>
        <Show when={!projectRoot()}>
          <div class="flex items-center justify-center h-full" style={{ color: "var(--text-muted)", "font-size": "12px", padding: "24px" }}>
            Open a folder to see its PRs.
          </div>
        </Show>
        <Show when={projectRoot() && !loading() && !error() && rows().length === 0 && gh()?.installed && gh()?.authenticated}>
          <div class="flex items-center justify-center h-full" style={{ color: "var(--text-muted)", "font-size": "12px", padding: "24px" }}>
            No PRs match.
          </div>
        </Show>
        <Show when={error()}>
          <div class="flex flex-col gap-2 p-4" style={{ color: "var(--accent-red)", "font-size": "12px" }}>
            <div style={{ "font-weight": "500" }}>Failed to load PRs</div>
            <div style={{ color: "var(--text-muted)" }}>{error()}</div>
            <button
              class="self-start px-2 py-1 rounded"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "11px",
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

      {/* Footer */}
      <div
        class="shrink-0 flex items-center justify-between px-3 py-1.5"
        style={{
          "border-top": "1px solid var(--border-default)",
          color: "var(--text-muted)",
          "font-size": "10.5px",
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
          <Show when={counts().failing > 0}>
            <span style={{ color: "var(--accent-red)" }}>{counts().failing} failing CI</span>
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
