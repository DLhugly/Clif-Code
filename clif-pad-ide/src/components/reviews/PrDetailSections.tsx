import { Component, For, Show, createEffect, createMemo } from "solid-js";
import {
  prDetails,
  loadingDetail,
  fetchPrDetail,
} from "../../stores/reviewsStore";
import {
  classifications,
  classifying,
  fetchClassification,
} from "../../stores/classificationStore";
import WhyTierPanel from "./WhyTierPanel";

export type SectionId =
  | "heuristic"
  | "findings"
  | "policy"
  | "diff"
  | "commits"
  | "checks"
  | "rules";

export const SECTIONS: { id: SectionId; label: string }[] = [
  // Heuristic first: it's the fastest way to understand why the PR got the
  // tier it did, and needs no LLM call.
  { id: "heuristic", label: "Heuristic score" },
  { id: "findings", label: "LLM findings" },
  { id: "policy", label: "Policy" },
  { id: "diff", label: "Diff" },
  { id: "commits", label: "Commits" },
  { id: "checks", label: "Checks" },
  { id: "rules", label: "Rules applied" },
];

/**
 * Collapsible section wrapper used for every block in the PR detail scroll.
 * Anchor id `pr-section-<id>` is what `scrollToSection` targets from the
 * sticky sub-nav in PrCenterStage.
 */
export const Section: Component<{
  id: SectionId;
  title: string;
  count?: number;
  collapsed: boolean;
  onToggle: () => void;
  children: any;
}> = (p) => {
  return (
    <section
      id={`pr-section-${p.id}`}
      style={{
        "border-bottom": "1px solid var(--border-muted)",
        "scroll-margin-top": "36px",
      }}
    >
      <button
        class="w-full flex items-center gap-2 px-3 py-2 transition-colors text-left"
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-primary)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onClick={p.onToggle}
        title={p.collapsed ? `Expand ${p.title}` : `Collapse ${p.title}`}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{
            transform: p.collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 0.15s",
            color: "var(--text-muted)",
            "flex-shrink": "0",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span
          style={{
            "font-size": "calc(var(--ui-font-size) - 1.5px)",
            "font-weight": "600",
            "text-transform": "uppercase",
            "letter-spacing": "0.05em",
          }}
        >
          {p.title}
        </span>
        <Show when={typeof p.count === "number"}>
          <span
            class="rounded-full px-1.5"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
              "font-size": "calc(var(--ui-font-size) - 4px)",
              "font-weight": "600",
              "min-width": "18px",
              "text-align": "center",
            }}
          >
            {p.count}
          </span>
        </Show>
      </button>
      <Show when={!p.collapsed}>
        <div>{p.children}</div>
      </Show>
    </section>
  );
};

/**
 * Heuristic score section — pulls the cached classification for this PR (or
 * kicks off a fetch if missing) and renders the full signal-by-signal
 * breakdown. Answers "why did this PR get this tier?" without any LLM call.
 */
export const HeuristicSection: Component<{
  prNumber: number;
  collapsed: boolean;
  onToggle: () => void;
}> = (p) => {
  const classification = createMemo(() => classifications[p.prNumber] ?? null);
  const isClassifying = () => classifying().has(p.prNumber);

  createEffect(() => {
    if (!p.collapsed && !classification() && !isClassifying()) {
      fetchClassification(p.prNumber);
    }
  });

  return (
    <Section
      id="heuristic"
      title="Heuristic score"
      count={classification()?.score || undefined}
      collapsed={p.collapsed}
      onToggle={p.onToggle}
    >
      <div class="px-3 pb-3">
        <Show when={classification()}>
          <WhyTierPanel classification={classification()!} />
        </Show>
        <Show when={!classification() && isClassifying()}>
          <div
            style={{
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 2px)",
              padding: "8px 4px",
            }}
          >
            Running heuristic scan on this PR…
          </div>
        </Show>
        <Show when={!classification() && !isClassifying()}>
          <div
            style={{
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 2px)",
              padding: "8px 4px",
            }}
          >
            No heuristic scan yet for this PR.{" "}
            <button
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-primary)",
                cursor: "pointer",
                "font-size": "inherit",
                padding: 0,
                "text-decoration": "underline",
              }}
              onClick={() => fetchClassification(p.prNumber)}
            >
              Run scan
            </button>
          </div>
        </Show>
      </div>
    </Section>
  );
};

/**
 * Commits section — reads the same lazy-loaded PR detail cache that the row
 * expansion uses. Kicks off a fetch the first time the section becomes
 * visible for a given PR.
 */
export const CommitsSection: Component<{
  prNumber: number;
  collapsed: boolean;
  onToggle: () => void;
}> = (p) => {
  const detail = createMemo(() => prDetails[p.prNumber] ?? null);
  const commits = createMemo(() => detail()?.commits ?? []);
  const isLoading = () => loadingDetail().has(p.prNumber);

  createEffect(() => {
    if (!p.collapsed && !detail() && !isLoading()) {
      fetchPrDetail(p.prNumber);
    }
  });

  return (
    <Section
      id="commits"
      title="Commits"
      count={commits().length || undefined}
      collapsed={p.collapsed}
      onToggle={p.onToggle}
    >
      <div class="px-3 pb-3 flex flex-col gap-1" style={{ "font-size": "calc(var(--ui-font-size) - 2px)" }}>
        <Show when={isLoading() && commits().length === 0}>
          <div style={{ color: "var(--text-muted)" }}>Loading commits…</div>
        </Show>
        <Show when={!isLoading() && commits().length === 0}>
          <div style={{ color: "var(--text-muted)" }}>No commits to show.</div>
        </Show>
        <For each={commits().slice(0, 50)}>
          {(c) => (
            <div
              class="flex items-start gap-2"
              style={{ color: "var(--text-secondary)" }}
            >
              <span
                style={{
                  "font-family": "var(--font-mono, monospace)",
                  color: "var(--accent-primary)",
                  "font-size": "calc(var(--ui-font-size) - 2.5px)",
                  "flex-shrink": "0",
                }}
              >
                {(c.oid ?? "").slice(0, 7)}
              </span>
              <span class="truncate flex-1">{c.messageHeadline ?? ""}</span>
              <Show when={(c.authors?.[0]?.name ?? "").length > 0}>
                <span
                  style={{
                    color: "var(--text-muted)",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                    "flex-shrink": "0",
                  }}
                >
                  {c.authors![0].name}
                </span>
              </Show>
            </div>
          )}
        </For>
        <Show when={commits().length > 50}>
          <div style={{ color: "var(--text-muted)", "margin-top": "4px" }}>
            +{commits().length - 50} more commits
          </div>
        </Show>
      </div>
    </Section>
  );
};

/**
 * Checks section — same lazy-loaded detail cache as Commits. Shows each
 * status check as a colored pill with conclusion tooltip.
 */
export const ChecksSection: Component<{
  prNumber: number;
  collapsed: boolean;
  onToggle: () => void;
}> = (p) => {
  const detail = createMemo(() => prDetails[p.prNumber] ?? null);
  const checks = createMemo(() => detail()?.statusCheckRollup ?? []);
  const isLoading = () => loadingDetail().has(p.prNumber);

  createEffect(() => {
    if (!p.collapsed && !detail() && !isLoading()) {
      fetchPrDetail(p.prNumber);
    }
  });

  return (
    <Section
      id="checks"
      title="Checks"
      count={checks().length || undefined}
      collapsed={p.collapsed}
      onToggle={p.onToggle}
    >
      <div class="px-3 pb-3 flex flex-col gap-2" style={{ "font-size": "calc(var(--ui-font-size) - 2.5px)" }}>
        {/* Intro + color legend so the wall of check names actually reads. */}
        <Show when={checks().length > 0}>
          <div
            class="flex items-center gap-3 flex-wrap"
            style={{
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 3.5px)",
            }}
          >
            <span>GitHub Actions / CI status for this PR. One pill per check run.</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span class="flex items-center gap-1">
              <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: "var(--accent-green)" }} />
              passing
            </span>
            <span class="flex items-center gap-1">
              <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: "var(--accent-red)" }} />
              failing
            </span>
            <span class="flex items-center gap-1">
              <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: "var(--accent-yellow)" }} />
              in progress / queued
            </span>
            <span class="flex items-center gap-1">
              <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: "var(--text-muted)" }} />
              unknown / skipped
            </span>
          </div>
        </Show>
        <Show when={isLoading() && checks().length === 0}>
          <div style={{ color: "var(--text-muted)" }}>Loading checks…</div>
        </Show>
        <Show when={!isLoading() && checks().length === 0}>
          <div style={{ color: "var(--text-muted)" }}>No CI checks configured for this PR.</div>
        </Show>
        <div class="flex flex-wrap gap-1.5">
        <For each={checks()}>
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
                class="px-2 py-0.5 rounded"
                title={`${c.name ?? ""} · ${conclusion || status || "?"}`}
                style={{
                  background: `color-mix(in srgb, ${color} 14%, transparent)`,
                  color,
                  border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                  "font-weight": "500",
                }}
              >
                {c.name ?? "check"}
              </span>
            );
          }}
        </For>
        </div>
      </div>
    </Section>
  );
};
