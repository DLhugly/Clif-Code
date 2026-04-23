import { Component, For, Show, createMemo, createSignal } from "solid-js";
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
import {
  Section,
  HeuristicSection,
  CommitsSection,
  ChecksSection,
  SECTIONS,
  type SectionId,
} from "./PrDetailSections";
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


const PrCenterStage: Component<{ chatOpen: boolean; onToggleChat: () => void }> = (props) => {
  const [signOffOpen, setSignOffOpen] = createSignal(false);
  const [polishOpen, setPolishOpen] = createSignal(false);
  const [collapsed, setCollapsed] = createSignal<Record<SectionId, boolean>>({
    heuristic: false,
    findings: false,
    policy: false,
    diff: false,
    commits: false,
    checks: false,
    rules: false,
  });
  function toggleSection(id: SectionId) {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }
  function scrollToSection(id: SectionId) {
    const el = document.getElementById(`pr-section-${id}`);
    if (el) {
      setCollapsed((prev) => ({ ...prev, [id]: false }));
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

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
          <div
            class="flex flex-col items-center justify-center h-full gap-4 px-6 text-center"
            style={{ color: "var(--text-muted)" }}
          >
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style={{ opacity: 0.5 }}
            >
              <circle cx="18" cy="18" r="3" />
              <circle cx="6" cy="6" r="3" />
              <path d="M13 6h3a2 2 0 0 1 2 2v7" />
              <line x1="6" y1="9" x2="6" y2="21" />
            </svg>
            <div
              style={{
                "font-size": "calc(var(--ui-font-size))",
                "font-weight": "600",
                color: "var(--text-primary)",
              }}
            >
              Pick a PR from your Inbox
            </div>
            <div
              style={{
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "max-width": "48ch",
                "line-height": "1.6",
              }}
            >
              The <b>Inbox</b> on the left holds every PR that still needs you. Once you decide
              something (Mark ready, Kick back, or Sign off), the PR moves to <b>Handled</b> and
              drops out of the inbox.
            </div>
            <ol
              style={{
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "text-align": "left",
                "line-height": "1.7",
                "list-style": "decimal",
                "padding-left": "22px",
                "max-width": "48ch",
              }}
            >
              <li>Click a PR — scan findings, policy, diff, commits, checks.</li>
              <li>Use <b>Mark ready</b> / <b>Kick back</b> to tag locally.</li>
              <li>Hit <b>Sync PR</b> (top-right of the triage bar) to push labels to GitHub.</li>
              <li>PR leaves your inbox. Repeat.</li>
            </ol>
            <div
              style={{
                "margin-top": "8px",
                padding: "8px 12px",
                "border-radius": "6px",
                background: "var(--bg-surface)",
                border: "1px solid var(--border-muted)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "line-height": "1.55",
                "max-width": "48ch",
                "text-align": "left",
              }}
            >
              <b style={{ color: "var(--accent-green)" }}>Tier badge</b> = local heuristic scan,
              free, always on. Runs regex + filename patterns + our security scanner to bucket
              each PR T1–T5.
              <br />
              <b style={{ color: "var(--accent-yellow)" }}>Findings</b> = OpenRouter LLM review.
              Opt-in. Only runs when you click <i>Review</i>, use <i>review all</i>, or flip{" "}
              <i>auto LLM</i> on.
            </div>
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
                  class="flex items-center gap-1 px-2 py-1 rounded transition-colors"
                  style={{
                    background: review()
                      ? "var(--bg-base)"
                      : "color-mix(in srgb, var(--accent-yellow) 18%, transparent)",
                    color: review() ? "var(--accent-yellow)" : "var(--accent-yellow)",
                    border: `1px solid ${
                      review()
                        ? "color-mix(in srgb, var(--accent-yellow) 30%, transparent)"
                        : "color-mix(in srgb, var(--accent-yellow) 50%, transparent)"
                    }`,
                    cursor: "pointer",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                    "font-weight": "600",
                  }}
                  onClick={() => {
                    const n = selectedPrNumber();
                    if (n != null) runReview(n, { force: true });
                  }}
                  title={
                    review()
                      ? "Re-run the LLM review (sends the diff to OpenRouter — costs tokens)"
                      : "Run the LLM review for this PR (sends the diff to OpenRouter — costs tokens)"
                  }
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6L12 2z" />
                  </svg>
                  {review() ? "Re-run LLM review" : "Review with LLM"}
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

        {/* Sticky jump-nav: click to scroll to a section. Same labels as the
            old tabs, but they're anchor links — every section is always on
            the page, you just scroll. */}
        <div
          class="flex items-center shrink-0 px-3 gap-1 overflow-x-auto"
          style={{
            height: "32px",
            "border-bottom": "1px solid var(--border-default)",
            background: "var(--bg-surface)",
          }}
        >
          <For each={SECTIONS}>
            {(s) => (
              <button
                class="px-2 rounded transition-colors shrink-0"
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 2.5px)",
                  "font-weight": "500",
                  height: "22px",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                }}
                onClick={() => scrollToSection(s.id)}
                title={`Jump to ${s.label}`}
              >
                {s.label}
              </button>
            )}
          </For>
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={isRunning() && !review()}>
            <div
              class="flex items-center gap-2 px-4 pt-4"
              style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Running review…</span>
            </div>
          </Show>

          {/* Heuristic score — first, because it's the fastest signal. */}
          <HeuristicSection
            prNumber={selected()!.number}
            collapsed={collapsed().heuristic}
            onToggle={() => toggleSection("heuristic")}
          />

          {/* LLM findings (only populated after "Review with LLM") */}
          <Section
            id="findings"
            title="LLM findings"
            count={findingsCount() || undefined}
            collapsed={collapsed().findings}
            onToggle={() => toggleSection("findings")}
          >
            <FindingsList prNumber={selected()!.number} review={review()} />
          </Section>

          {/* Policy */}
          <Section
            id="policy"
            title="Policy"
            collapsed={collapsed().policy}
            onToggle={() => toggleSection("policy")}
          >
            <PolicyTab prNumber={selected()!.number} />
          </Section>

          {/* Diff */}
          <Section
            id="diff"
            title="Diff"
            collapsed={collapsed().diff}
            onToggle={() => toggleSection("diff")}
          >
            <PrDiffView prNumber={selected()!.number} />
          </Section>

          {/* Commits */}
          <CommitsSection
            prNumber={selected()!.number}
            collapsed={collapsed().commits}
            onToggle={() => toggleSection("commits")}
          />

          {/* Checks */}
          <ChecksSection
            prNumber={selected()!.number}
            collapsed={collapsed().checks}
            onToggle={() => toggleSection("checks")}
          />

          {/* Rules applied */}
          <Section
            id="rules"
            title="Rules applied"
            collapsed={collapsed().rules}
            onToggle={() => toggleSection("rules")}
          >
            <div
              class="px-4 pb-4"
              style={{
                color: "var(--text-secondary)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "line-height": "1.5",
              }}
            >
              Rules loaded in priority order when running reviews on this repo:
              <ul style={{ "margin-top": "6px", "padding-left": "18px", "list-style": "disc" }}>
                <li><code>.clifreview.yaml</code></li>
                <li><code>AGENTS.md</code></li>
                <li><code>CLAUDE.md</code></li>
                <li><code>.cursorrules</code></li>
                <li><code>.github/copilot-instructions.md</code></li>
              </ul>
            </div>
          </Section>
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
