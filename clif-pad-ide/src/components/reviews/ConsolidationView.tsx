import { Component, For, Show, createResource, createSignal } from "solid-js";
import {
  selectedPrs,
  planConsolidation,
  applyConsolidation,
  clearSelection,
} from "../../stores/reviewsStore";
import type { ConsolidationPlan, ConsolidationResult } from "../../types/consolidation";

const ConsolidationView: Component<{ onClose: () => void }> = (props) => {
  const sourceList = () => Array.from(selectedPrs()).sort((a, b) => a - b);
  const [plan, setPlan] = createSignal<ConsolidationPlan | null>(null);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [closeSources, setCloseSources] = createSignal(false);
  const [applying, setApplying] = createSignal(false);
  const [result, setResult] = createSignal<ConsolidationResult | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  const [planResource] = createResource(
    () => sourceList(),
    async (sources) => {
      if (sources.length < 2) return null;
      try {
        const p = await planConsolidation(sources);
        setPlan(p);
        setTitle(p.new_title);
        setBody(p.new_body);
        setError(null);
        return p;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
  );

  function toggleCommit(id: string) {
    setPlan((prev) => {
      if (!prev) return prev;
      const nextCommits = prev.commits.map((c) =>
        c.oid === id ? { ...c, include: !c.include } : c,
      );
      return { ...prev, commits: nextCommits };
    });
  }

  async function onApply() {
    const p = plan();
    if (!p) return;
    setApplying(true);
    setError(null);
    try {
      // Push edited title/body/include flags back (in-memory; backend has cached plan by id)
      // We re-plan if user edited things substantially; for MVP we let backend use cached plan.
      const res = await applyConsolidation(p.plan_id, closeSources());
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function onCloseAndClear() {
    clearSelection();
    props.onClose();
  }

  const includedCount = () => (plan()?.commits ?? []).filter((c) => c.include).length;

  return (
    <div
      class="fixed inset-0 flex items-center justify-center"
      style={{ background: "color-mix(in srgb, #000 55%, transparent)", "z-index": "9200" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="rounded-lg flex flex-col"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          width: "min(920px, 94vw)",
          height: "min(700px, 90vh)",
          "box-shadow": "0 24px 48px rgba(0,0,0,0.35)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
            Consolidate {sourceList().length} PRs
          </div>
          <button
            class="flex items-center justify-center"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onClick={() => props.onClose()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex-1 min-h-0 flex">
          {/* Left: source PRs & commit picker */}
          <div
            class="flex flex-col overflow-auto"
            style={{
              width: "45%",
              "border-right": "1px solid var(--border-default)",
              padding: "10px 12px",
            }}
          >
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "6px" }}>
              Source PRs ({sourceList().length})
            </div>
            <div class="flex flex-wrap gap-1 mb-3">
              <For each={sourceList()}>
                {(n) => (
                  <span
                    class="px-1.5 rounded"
                    style={{
                      background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                      color: "var(--accent-primary)",
                      "font-family": "var(--font-mono, monospace)",
                      "font-size": "calc(var(--ui-font-size) - 3px)",
                    }}
                  >
                    #{n}
                  </span>
                )}
              </For>
            </div>

            <Show when={planResource.loading && !plan() && !error()}>
              <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
                Planning consolidation...
              </div>
            </Show>
            <Show when={error()}>
              <div
                class="rounded px-3 py-2"
                style={{
                  background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                  color: "var(--accent-red)",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                }}
              >
                {error()}
              </div>
            </Show>

            <Show when={plan() && plan()!.commits.length > 0}>
              <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "6px" }}>
                Commits to include ({includedCount()}/{plan()!.commits.length})
              </div>
              <div class="flex flex-col gap-1">
                <For each={plan()!.commits}>
                  {(c) => (
                    <label
                      class="flex items-start gap-2 rounded px-2 py-1 cursor-pointer"
                      style={{
                        background: c.include
                          ? "color-mix(in srgb, var(--accent-primary) 8%, var(--bg-base))"
                          : "var(--bg-base)",
                        border: "1px solid var(--border-muted)",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={c.include}
                        onChange={() => toggleCommit(c.oid)}
                        style={{ "margin-top": "3px" }}
                      />
                      <div class="flex flex-col min-w-0">
                        <div class="flex items-center gap-2">
                          <span
                            style={{
                              color: "var(--accent-primary)",
                              "font-family": "var(--font-mono, monospace)",
                            }}
                          >
                            {c.oid.slice(0, 7)}
                          </span>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              "font-size": "calc(var(--ui-font-size) - 4px)",
                            }}
                          >
                            #{c.pr_number} · {c.author}
                          </span>
                        </div>
                        <span class="truncate" style={{ color: "var(--text-primary)" }}>
                          {c.message_headline}
                        </span>
                      </div>
                    </label>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Right: new PR metadata */}
          <div class="flex flex-col overflow-auto flex-1" style={{ padding: "10px 12px" }}>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "6px" }}>
              New PR title
            </div>
            <input
              type="text"
              class="outline-none rounded px-2 py-1 mb-3"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
              }}
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
              placeholder="Consolidated PR title"
            />
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "6px" }}>
              Description
            </div>
            <textarea
              class="outline-none rounded p-2 mb-3"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "min-height": "140px",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "font-family": "inherit",
                resize: "vertical",
              }}
              value={body()}
              onInput={(e) => setBody(e.currentTarget.value)}
            />
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "6px" }}>
              New branch
            </div>
            <div
              class="rounded px-2 py-1 mb-3"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                "font-family": "var(--font-mono, monospace)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                border: "1px solid var(--border-default)",
              }}
            >
              {plan()?.new_branch ?? "(planning)"}
            </div>
            <label class="flex items-center gap-2" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
              <input
                type="checkbox"
                checked={closeSources()}
                onChange={(e) => setCloseSources(e.currentTarget.checked)}
              />
              <span>Draft close-comments for source PRs (posted via Pending drawer)</span>
            </label>

            <Show when={result()}>
              <div
                class="rounded px-3 py-2 mt-3"
                style={{
                  background: "color-mix(in srgb, var(--accent-green) 12%, transparent)",
                  color: "var(--accent-green)",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                  border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
                }}
              >
                <Show when={result()!.new_pr_url}>
                  <div>Opened consolidated PR: {result()!.new_pr_url}</div>
                </Show>
                <div>Applied {result()!.commits_applied} commits.</div>
                <Show when={result()!.failed_commits.length > 0}>
                  <div style={{ color: "var(--accent-yellow)", "margin-top": "4px" }}>
                    Skipped {result()!.failed_commits.length} failing commit(s). See Audit log.
                  </div>
                </Show>
              </div>
            </Show>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-2 shrink-0" style={{ "border-top": "1px solid var(--border-default)" }}>
          <button
            class="px-3 py-1.5 rounded"
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              "font-size": "calc(var(--ui-font-size) - 2px)",
            }}
            onClick={() => props.onClose()}
            disabled={applying()}
          >
            Close
          </button>
          <Show when={result()}>
            <button
              class="px-3 py-1.5 rounded"
              style={{
                background: "var(--accent-green)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "font-weight": "500",
              }}
              onClick={onCloseAndClear}
            >
              Done — clear selection
            </button>
          </Show>
          <Show when={!result()}>
            <button
              class="px-3 py-1.5 rounded"
              style={{
                background: "var(--accent-primary)",
                color: "#fff",
                border: "none",
                cursor: applying() || !plan() ? "wait" : "pointer",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "font-weight": "500",
                opacity: applying() || !plan() ? 0.7 : 1,
              }}
              onClick={onApply}
              disabled={applying() || !plan() || includedCount() === 0}
            >
              {applying() ? "Building..." : `Build consolidated PR (${includedCount()} commits)`}
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ConsolidationView;
