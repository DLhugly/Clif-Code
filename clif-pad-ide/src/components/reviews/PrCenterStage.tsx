import { Component, Show, createMemo, createSignal } from "solid-js";
import {
  selectedPrNumber,
  reviewResults,
  runningReviews,
  runReview,
  cancelReview,
} from "../../stores/reviewsStore";
import { prs } from "../../stores/reviewsStore";
import FindingsList from "./FindingsList";
import PrDiffView from "./PrDiffView";
import SignOffOverlay from "./SignOffOverlay";
import PolishDrawer from "./PolishDrawer";

type Tab = "findings" | "diff" | "commits" | "checks" | "rules";

const TABS: { id: Tab; label: string }[] = [
  { id: "findings", label: "Findings" },
  { id: "diff", label: "Diff" },
  { id: "commits", label: "Commits" },
  { id: "checks", label: "Checks" },
  { id: "rules", label: "Rules applied" },
];

const PrCenterStage: Component<{ chatOpen: boolean; onToggleChat: () => void }> = (props) => {
  const [tab, setTab] = createSignal<Tab>("findings");
  const [signOffOpen, setSignOffOpen] = createSignal(false);
  const [polishOpen, setPolishOpen] = createSignal(false);

  const selected = createMemo(() => {
    const n = selectedPrNumber();
    if (n == null) return null;
    return prs.find((p) => p.number === n) ?? null;
  });

  const review = createMemo(() => {
    const n = selectedPrNumber();
    return n != null ? reviewResults[n] ?? null : null;
  });

  const isRunning = () => {
    const n = selectedPrNumber();
    return n != null && runningReviews().has(n);
  };

  const findingsCount = createMemo(() => review()?.findings?.length ?? 0);

  return (
    <div class="flex flex-col h-full w-full" style={{ background: "var(--bg-base)" }}>
      <Show
        when={selected()}
        fallback={
          <div class="flex flex-col items-center justify-center h-full gap-3" style={{ color: "var(--text-muted)" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style={{ opacity: 0.5 }}>
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <div style={{ "font-size": "13px" }}>Select a PR from the left to see findings</div>
          </div>
        }
      >
        <div
          class="flex items-center justify-between shrink-0 px-4 py-2"
          style={{
            "border-bottom": "1px solid var(--border-default)",
            background: "var(--bg-surface)",
            height: "44px",
          }}
        >
          <div class="flex items-center gap-2 min-w-0">
            <span style={{ color: "var(--text-muted)", "font-family": "var(--font-mono, monospace)", "font-size": "11px" }}>
              #{selected()!.number}
            </span>
            <span class="truncate" style={{ color: "var(--text-primary)", "font-weight": "500", "font-size": "13px" }}>
              {selected()!.title}
            </span>
            <Show when={findingsCount() > 0}>
              <span
                class="px-1.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                  color: "var(--accent-primary)",
                  "font-size": "10.5px",
                }}
              >
                {findingsCount()} findings
              </span>
            </Show>
            <Show when={review()?.risk_score != null}>
              <span
                class="px-1.5 rounded"
                style={{ background: "var(--bg-base)", color: "var(--text-muted)", "font-size": "10.5px", border: "1px solid var(--border-default)" }}
                title="Risk score"
              >
                risk {review()!.risk_score}
              </span>
            </Show>
          </div>
          <div class="flex items-center gap-2">
            <Show
              when={isRunning()}
              fallback={
                <button
                  class="px-2 py-1 rounded transition-colors"
                  style={{
                    background: "var(--bg-base)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-default)",
                    cursor: "pointer",
                    "font-size": "11px",
                  }}
                  onClick={() => {
                    const n = selectedPrNumber();
                    if (n != null) runReview(n, { force: true });
                  }}
                  title={review() ? "Re-run review" : "Run review"}
                >
                  {review() ? "Re-run" : "Review"}
                </button>
              }
            >
              <button
                class="px-2 py-1 rounded transition-colors"
                style={{
                  background: "color-mix(in srgb, var(--accent-red) 15%, transparent)",
                  color: "var(--accent-red)",
                  border: "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)",
                  cursor: "pointer",
                  "font-size": "11px",
                }}
                onClick={() => {
                  const n = selectedPrNumber();
                  if (n != null) cancelReview(n);
                }}
              >
                Stop
              </button>
            </Show>
            <button
              class="px-2 py-1 rounded transition-colors"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "11px",
              }}
              onClick={() => setPolishOpen(true)}
              disabled={!review()}
              title={review() ? "Open Polish drawer" : "Run review first"}
            >
              Polish
            </button>
            <button
              class="px-2 py-1 rounded transition-colors"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                "font-size": "11px",
                "font-weight": "500",
              }}
              onClick={() => setSignOffOpen(true)}
              disabled={!review()}
            >
              Sign off
            </button>
            <button
              class="px-2 py-1 rounded transition-colors"
              style={{
                background: "transparent",
                color: "var(--text-muted)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "11px",
              }}
              onClick={() => props.onToggleChat()}
              title={props.chatOpen ? "Hide chat" : "Show chat"}
            >
              {props.chatOpen ? "Hide chat" : "Show chat"}
            </button>
          </div>
        </div>

        <div
          class="flex items-center shrink-0 px-3"
          style={{
            height: "32px",
            "border-bottom": "1px solid var(--border-default)",
            background: "var(--bg-surface)",
            gap: "2px",
          }}
        >
          {TABS.map((t) => (
            <button
              class="px-2 transition-colors"
              style={{
                height: "100%",
                background: tab() === t.id ? "var(--bg-base)" : "transparent",
                color: tab() === t.id ? "var(--text-primary)" : "var(--text-muted)",
                border: "none",
                "border-bottom": tab() === t.id ? "2px solid var(--accent-primary)" : "2px solid transparent",
                cursor: "pointer",
                "font-size": "11.5px",
                "font-weight": "500",
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={isRunning() && !review()}>
            <div class="flex items-center gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Running review...</span>
            </div>
          </Show>
          <Show when={tab() === "findings"}>
            <FindingsList prNumber={selected()!.number} review={review()} />
          </Show>
          <Show when={tab() === "diff"}>
            <PrDiffView prNumber={selected()!.number} />
          </Show>
          <Show when={tab() === "commits"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              Commit list — see the expanded PR row in the left column for the full commit history.
            </div>
          </Show>
          <Show when={tab() === "checks"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              Checks — see the expanded PR row in the left column for the complete CI rollup.
            </div>
          </Show>
          <Show when={tab() === "rules"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              Rules loaded in priority order: .clifreview.yaml, AGENTS.md, CLAUDE.md, .cursorrules, .github/copilot-instructions.md.
            </div>
          </Show>
        </div>

        <Show when={signOffOpen()}>
          <SignOffOverlay prNumber={selected()!.number} onClose={() => setSignOffOpen(false)} />
        </Show>
        <Show when={polishOpen()}>
          <PolishDrawer prNumber={selected()!.number} onClose={() => setPolishOpen(false)} />
        </Show>
      </Show>
    </div>
  );
};

export default PrCenterStage;
