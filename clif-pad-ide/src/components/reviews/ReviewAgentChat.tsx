import { Component, Show, createEffect, createMemo, lazy, Suspense } from "solid-js";
import { selectedPrNumber, prs, reviewResults } from "../../stores/reviewsStore";
import { classifications } from "../../stores/classificationStore";
import { agentStreaming, ensurePrChat, startNewSession, activeAgentTab } from "../../stores/agentStore";
import { openExternal } from "../../lib/tauri";
import { TIER_META } from "../../types/classification";
import TierChip from "./TierChip";

const AgentChatPanel = lazy(() => import("../agent/AgentChatPanel"));

const ReviewAgentChat: Component = () => {
  const prNumber = () => selectedPrNumber();
  const pr = createMemo(() => {
    const n = prNumber();
    if (n == null) return null;
    return prs.find((p) => p.number === n) ?? null;
  });
  const classification = createMemo(() => {
    const n = prNumber();
    return n != null ? classifications[n] ?? null : null;
  });
  const review = createMemo(() => {
    const n = prNumber();
    return n != null ? reviewResults[n] ?? null : null;
  });

  // When selected PR changes (and agent isn't streaming), hop to the PR-scoped tab.
  createEffect(() => {
    const n = prNumber();
    if (n == null) return;
    if (agentStreaming()) return;
    const p = pr();
    const label = p ? `#${n} ${p.title.slice(0, 26)}${p.title.length > 26 ? "…" : ""}` : `#${n}`;
    ensurePrChat(n, label);
  });

  const tierMeta = () => {
    const c = classification();
    return c ? TIER_META[c.tier] : null;
  };

  const headerBorder = () => {
    const meta = tierMeta();
    return meta ? `${meta.color}44` : "var(--border-default)";
  };

  const findingsCount = () => review()?.findings.length ?? 0;

  return (
    <div class="flex flex-col h-full w-full overflow-hidden" style={{ background: "var(--bg-surface)" }}>
      <Show
        when={prNumber() != null}
        fallback={
          <div
            class="flex flex-col items-center justify-center h-full px-4 text-center gap-2"
            style={{ color: "var(--text-muted)" }}
          >
            <div style={{ "font-size": "calc(var(--ui-font-size))", "font-weight": "500" }}>
              Select a PR to start a scoped chat
            </div>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 2px)", "max-width": "24ch" }}>
              Each PR gets its own conversation with the PR title, diff signals, and classification
              pre-loaded into context.
            </div>
          </div>
        }
      >
        <div
          class="shrink-0 px-3 py-2"
          style={{
            "border-bottom": `1px solid ${headerBorder()}`,
            background:
              tierMeta()?.bg ?? "var(--bg-surface)",
          }}
        >
          <div class="flex items-center gap-2 flex-wrap">
            <TierChip classification={classification()} size="md" showScore={true} />
            <button
              class="flex items-center gap-1"
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-primary)",
                cursor: pr()?.url ? "pointer" : "default",
                "font-size": "calc(var(--ui-font-size) - 1px)",
                "font-weight": "600",
                "text-align": "left",
                padding: 0,
              }}
              onClick={() => pr()?.url && openExternal(pr()!.url)}
              title={pr()?.url ?? ""}
              disabled={!pr()?.url}
            >
              <span style={{ "font-family": "monospace", color: "var(--text-muted)" }}>
                #{prNumber()}
              </span>
              <span class="truncate" style={{ "max-width": "24ch" }}>
                {pr()?.title ?? `PR #${prNumber()}`}
              </span>
            </button>
            <button
              class="ml-auto px-2 py-0.5 rounded"
              style={{
                background: "transparent",
                border: "1px solid var(--border-default)",
                color: "var(--text-muted)",
                cursor: agentStreaming() ? "not-allowed" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              disabled={agentStreaming()}
              onClick={() => {
                // Reset the current PR chat's conversation
                startNewSession();
                const n = prNumber();
                const p = pr();
                if (n != null) {
                  const label = p ? `#${n} ${p.title.slice(0, 26)}${p.title.length > 26 ? "…" : ""}` : `#${n}`;
                  ensurePrChat(n, label);
                }
              }}
              title="Clear this PR's conversation"
            >
              Reset
            </button>
          </div>
          <div
            class="flex items-center gap-2 flex-wrap"
            style={{
              "margin-top": "4px",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              color: "var(--text-secondary)",
            }}
          >
            <Show when={pr()?.author?.login}>
              <span>@{pr()!.author!.login}</span>
            </Show>
            <Show when={pr()?.headRefName}>
              <span>·</span>
              <span style={{ "font-family": "monospace" }}>{pr()!.headRefName}</span>
            </Show>
            <Show when={classification()?.hard_override}>
              <span>·</span>
              <span style={{ color: "var(--accent-red)", "font-weight": "500" }}>
                HARD: {classification()!.hard_override}
              </span>
            </Show>
            <Show when={findingsCount() > 0}>
              <span>·</span>
              <span style={{ color: "var(--accent-primary)" }}>
                {findingsCount()} finding{findingsCount() === 1 ? "" : "s"}
              </span>
            </Show>
            <Show when={activeAgentTab().startsWith("pr-")}>
              <span class="ml-auto" style={{ opacity: 0.7 }}>
                scoped chat
              </span>
            </Show>
          </div>
        </div>
        <div class="flex-1 min-h-0 overflow-hidden">
          <Suspense
            fallback={
              <div
                class="flex items-center justify-center h-full"
                style={{ color: "var(--text-muted)" }}
              >
                <span>Loading chat…</span>
              </div>
            }
          >
            <AgentChatPanel />
          </Suspense>
        </div>
      </Show>
    </div>
  );
};

export default ReviewAgentChat;
