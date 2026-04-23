import { Component, Show, createMemo, createSignal } from "solid-js";
import {
  selectedPrNumber,
  reviewResults,
  runningReviews,
  runReview,
  cancelReview,
  markReadyToMerge,
  markKickedBack,
  clearPrDecisions,
} from "../../stores/reviewsStore";
import { prs } from "../../stores/reviewsStore";
import FindingsList from "./FindingsList";
import PrDiffView from "./PrDiffView";
import SignOffOverlay from "./SignOffOverlay";
import PolishDrawer from "./PolishDrawer";
import PolicyTab from "./PolicyTab";
import { policyResults } from "../../stores/reviewsStore";
import {
  applySync,
  decisionsForPr,
  previewPlans,
  previewSync,
  syncRunning,
} from "../../stores/syncStore";
import { labelColor } from "../../types/sync";

type Tab = "findings" | "policy" | "diff" | "commits" | "checks" | "rules";

const TABS: { id: Tab; label: string }[] = [
  { id: "findings", label: "Findings" },
  { id: "policy", label: "Policy" },
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

  // Derive current triage state from the decision log for this PR.
  // The latest decision of each kind wins; mark_ready and mark_kicked_back are
  // mutually exclusive. Drives pill display in the triage bar.
  const triageState = createMemo(() => {
    const n = selectedPrNumber();
    if (n == null) {
      return { ready: false, kicked: false, reviewed: false, polished: false, cleared: false };
    }
    const ds = decisionsForPr(n);
    let ready = false;
    let kicked = false;
    let reviewed = false;
    let polished = false;
    let cleared = false;
    for (const d of ds) {
      switch (d.kind) {
        case "mark_ready_to_merge":
          ready = true;
          kicked = false;
          break;
        case "mark_kicked_back":
          kicked = true;
          ready = false;
          break;
        case "mark_reviewed":
          reviewed = true;
          break;
        case "mark_polished":
          polished = true;
          break;
        case "clear":
          ready = false;
          kicked = false;
          reviewed = false;
          polished = false;
          cleared = true;
          break;
        default:
          break;
      }
    }
    return { ready, kicked, reviewed, polished, cleared };
  });

  const prPlanDelta = createMemo(() => {
    const n = selectedPrNumber();
    if (n == null) return 0;
    const plan = previewPlans[n];
    if (!plan) return 0;
    return plan.add.length + plan.remove.length;
  });

  const [triageBusy, setTriageBusy] = createSignal(false);

  async function handleMarkReady() {
    const n = selectedPrNumber();
    if (n == null || triageBusy()) return;
    setTriageBusy(true);
    try {
      await markReadyToMerge(n);
      await previewSync([n]);
    } finally {
      setTriageBusy(false);
    }
  }

  async function handleKickBack() {
    const n = selectedPrNumber();
    if (n == null || triageBusy()) return;
    setTriageBusy(true);
    try {
      await markKickedBack(n);
      await previewSync([n]);
    } finally {
      setTriageBusy(false);
    }
  }

  async function handleClear() {
    const n = selectedPrNumber();
    if (n == null || triageBusy()) return;
    setTriageBusy(true);
    try {
      await clearPrDecisions(n);
      await previewSync([n]);
    } finally {
      setTriageBusy(false);
    }
  }

  async function handleSyncThisPr() {
    const n = selectedPrNumber();
    if (n == null || syncRunning()) return;
    await previewSync([n]);
    await applySync([n]);
    await previewSync([n]);
  }

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
            <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)" }}>Select a PR from the left to see findings</div>
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
            <span style={{ color: "var(--text-muted)", "font-family": "var(--font-mono, monospace)", "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              #{selected()!.number}
            </span>
            <span class="truncate" style={{ color: "var(--text-primary)", "font-weight": "500", "font-size": "calc(var(--ui-font-size) - 1px)" }}>
              {selected()!.title}
            </span>
            <Show when={findingsCount() > 0}>
              <span
                class="px-1.5 rounded"
                style={{
                  background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                  color: "var(--accent-primary)",
                  "font-size": "calc(var(--ui-font-size) - 3.5px)",
                }}
              >
                {findingsCount()} findings
              </span>
            </Show>
            <Show when={review()?.risk_score != null}>
              <span
                class="px-1.5 rounded"
                style={{ background: "var(--bg-base)", color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)", border: "1px solid var(--border-default)" }}
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
                    "font-size": "calc(var(--ui-font-size) - 3px)",
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
                  "font-size": "calc(var(--ui-font-size) - 3px)",
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
                "font-size": "calc(var(--ui-font-size) - 3px)",
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
                "font-size": "calc(var(--ui-font-size) - 3px)",
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
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={() => props.onToggleChat()}
              title={props.chatOpen ? "Hide chat" : "Show chat"}
            >
              {props.chatOpen ? "Hide chat" : "Show chat"}
            </button>
          </div>
        </div>

        {/* Triage bar: local-only decision tags + per-PR sync button */}
        <div
          class="flex items-center shrink-0 px-3 gap-2 flex-wrap"
          style={{
            height: "36px",
            "border-bottom": "1px solid var(--border-default)",
            background: "var(--bg-base)",
          }}
        >
          <div class="flex items-center gap-1 flex-wrap min-w-0">
            <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Triage
            </span>
            <Show when={triageState().ready}>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2"
                style={{
                  background: "color-mix(in srgb, var(--accent-green) 14%, transparent)",
                  color: "var(--accent-green)",
                  border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
                  "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  "font-weight": "500",
                  height: "18px",
                }}
                title="Local: marked ready to merge. Sync to publish as clif/ready-to-merge label."
              >
                <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: labelColor("clif/ready-to-merge") }} />
                ready
              </span>
            </Show>
            <Show when={triageState().kicked}>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2"
                style={{
                  background: "color-mix(in srgb, var(--accent-yellow) 14%, transparent)",
                  color: "var(--accent-yellow)",
                  border: "1px solid color-mix(in srgb, var(--accent-yellow) 30%, transparent)",
                  "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  "font-weight": "500",
                  height: "18px",
                }}
                title="Local: marked kicked back. Sync to publish as clif/kicked-back label."
              >
                <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: labelColor("clif/kicked-back") }} />
                kicked back
              </span>
            </Show>
            <Show when={triageState().reviewed}>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2"
                style={{
                  background: "rgba(167, 139, 250, 0.14)",
                  color: "#a78bfa",
                  border: "1px solid rgba(167, 139, 250, 0.3)",
                  "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  "font-weight": "500",
                  height: "18px",
                }}
                title="Local: review pass completed."
              >
                <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: labelColor("clif/reviewed") }} />
                reviewed
              </span>
            </Show>
            <Show when={triageState().polished}>
              <span
                class="inline-flex items-center gap-1 rounded-full px-2"
                style={{
                  background: "rgba(52, 211, 153, 0.14)",
                  color: "#34d399",
                  border: "1px solid rgba(52, 211, 153, 0.3)",
                  "font-size": "calc(var(--ui-font-size) - 3.5px)",
                  "font-weight": "500",
                  height: "18px",
                }}
                title="Local: polish pipeline applied."
              >
                <span style={{ width: "6px", height: "6px", "border-radius": "50%", background: labelColor("clif/polished") }} />
                polished
              </span>
            </Show>
            <Show when={!triageState().ready && !triageState().kicked && !triageState().reviewed && !triageState().polished}>
              <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                Mark ready or kick back to tag this PR
              </span>
            </Show>
          </div>

          <div class="flex items-center gap-1 ml-auto">
            <button
              class="px-2 rounded transition-colors"
              style={{
                background: triageState().ready
                  ? "color-mix(in srgb, var(--accent-green) 14%, transparent)"
                  : "var(--bg-surface)",
                color: triageState().ready ? "var(--accent-green)" : "var(--text-primary)",
                border: `1px solid ${
                  triageState().ready
                    ? "color-mix(in srgb, var(--accent-green) 30%, transparent)"
                    : "var(--border-default)"
                }`,
                cursor: triageBusy() ? "wait" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
                "font-weight": "500",
                height: "22px",
              }}
              disabled={triageBusy()}
              onClick={handleMarkReady}
              title="Mark this PR ready to merge (local only; syncs as clif/ready-to-merge label)"
            >
              Mark ready
            </button>
            <button
              class="px-2 rounded transition-colors"
              style={{
                background: triageState().kicked
                  ? "color-mix(in srgb, var(--accent-yellow) 14%, transparent)"
                  : "var(--bg-surface)",
                color: triageState().kicked ? "var(--accent-yellow)" : "var(--text-primary)",
                border: `1px solid ${
                  triageState().kicked
                    ? "color-mix(in srgb, var(--accent-yellow) 30%, transparent)"
                    : "var(--border-default)"
                }`,
                cursor: triageBusy() ? "wait" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
                "font-weight": "500",
                height: "22px",
              }}
              disabled={triageBusy()}
              onClick={handleKickBack}
              title="Kick this PR back to author (local only; syncs as clif/kicked-back label)"
            >
              Kick back
            </button>
            <button
              class="px-2 rounded transition-colors"
              style={{
                background: "var(--bg-surface)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-default)",
                cursor: triageBusy() ? "wait" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
                height: "22px",
              }}
              disabled={triageBusy()}
              onClick={handleClear}
              title="Clear all Clif state for this PR (removes all clif/* labels on next sync)"
            >
              Clear
            </button>
            <div style={{ width: "1px", height: "16px", background: "var(--border-default)", margin: "0 4px" }} />
            <button
              class="flex items-center gap-1 px-2 rounded transition-colors"
              style={{
                background: prPlanDelta() > 0
                  ? "var(--accent-primary)"
                  : "var(--bg-surface)",
                color: prPlanDelta() > 0 ? "#fff" : "var(--text-muted)",
                border: prPlanDelta() > 0 ? "none" : "1px solid var(--border-default)",
                cursor: syncRunning() ? "wait" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 3.5px)",
                "font-weight": "500",
                height: "22px",
                opacity: syncRunning() ? 0.7 : 1,
              }}
              disabled={syncRunning()}
              onClick={handleSyncThisPr}
              title={
                prPlanDelta() > 0
                  ? `Push ${prPlanDelta()} label change${prPlanDelta() === 1 ? "" : "s"} for this PR`
                  : "Refresh this PR's sync plan and push if changes exist"
              }
            >
              <Show
                when={prPlanDelta() > 0 || syncRunning()}
                fallback={
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                }
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </Show>
              <span>{syncRunning() ? "Syncing" : prPlanDelta() > 0 ? "Sync PR" : "Synced"}</span>
              <Show when={prPlanDelta() > 0 && !syncRunning()}>
                <span
                  class="px-1 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.25)",
                    "font-weight": "700",
                    "min-width": "14px",
                    "text-align": "center",
                    "font-size": "calc(var(--ui-font-size) - 4.5px)",
                  }}
                >
                  {prPlanDelta()}
                </span>
              </Show>
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
                "font-size": "calc(var(--ui-font-size) - 2.5px)",
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
            <div class="flex items-center gap-2 p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Running review...</span>
            </div>
          </Show>
          <Show when={tab() === "findings"}>
            <FindingsList prNumber={selected()!.number} review={review()} />
          </Show>
          <Show when={tab() === "policy"}>
            <PolicyTab prNumber={selected()!.number} />
          </Show>
          <Show when={tab() === "diff"}>
            <PrDiffView prNumber={selected()!.number} />
          </Show>
          <Show when={tab() === "commits"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              Commit list — see the expanded PR row in the left column for the full commit history.
            </div>
          </Show>
          <Show when={tab() === "checks"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              Checks — see the expanded PR row in the left column for the complete CI rollup.
            </div>
          </Show>
          <Show when={tab() === "rules"}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
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
