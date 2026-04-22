import { Component, For, Show, createSignal, createResource } from "solid-js";
import { projectRoot } from "../../stores/fileStore";
import { polishPreview, polishApply } from "../../stores/reviewsStore";
import type { PolishPlan, PolishMode, Category } from "../../types/review";

const MODE_OPTIONS: { id: PolishMode; label: string; description: string }[] = [
  { id: "minimal", label: "Minimal", description: "Style, imports, typos only" },
  { id: "standard", label: "Standard", description: "Minimal + safe refactors, dead code, doc fixes" },
  { id: "aggressive", label: "Aggressive", description: "Standard + structural refactors (requires approval)" },
  { id: "security", label: "Security only", description: "Security-category findings only" },
];

const ALLOWLIST_DEFAULT: Category[] = ["style", "docs", "tests", "imports", "types"];

const PolishDrawer: Component<{ prNumber: number; onClose: () => void }> = (props) => {
  const [mode, setMode] = createSignal<PolishMode>("minimal");
  const [applying, setApplying] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [appliedReport, setAppliedReport] = createSignal<{ commits: number; branch: string; manifestPath: string } | null>(null);

  const [plan] = createResource(
    () => ({ n: props.prNumber, m: mode() }),
    async ({ n, m }) => {
      const root = projectRoot();
      if (!root) return null;
      try {
        return await polishPreview(root, n, m);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
  );

  async function onApply() {
    const root = projectRoot();
    const p = plan();
    if (!root || !p) return;
    setApplying(true);
    setError(null);
    try {
      const report = await polishApply(root, props.prNumber, p.plan_id);
      setAppliedReport({ commits: report.commits_applied, branch: report.branch, manifestPath: report.manifest_path });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  const nonAllowlisted = (p: PolishPlan | null | undefined): Category[] => {
    if (!p) return [];
    const extras = new Set<Category>();
    for (const c of p.chunks) {
      if (!ALLOWLIST_DEFAULT.includes(c.category)) extras.add(c.category);
    }
    return Array.from(extras);
  };

  return (
    <div
      class="fixed inset-0 flex items-start justify-end"
      style={{ background: "color-mix(in srgb, #000 45%, transparent)", "z-index": "9000" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="flex flex-col h-full"
        style={{
          background: "var(--bg-surface)",
          "border-left": "1px solid var(--border-default)",
          width: "min(520px, 80vw)",
          "box-shadow": "-10px 0 30px rgba(0,0,0,0.25)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div style={{ "font-size": "13px", "font-weight": "600" }}>Polish PR #{props.prNumber}</div>
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

        <div class="flex-1 min-h-0 overflow-auto px-4 py-3 flex flex-col gap-3">
          <div>
            <div style={{ "font-size": "11px", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Mode
            </div>
            <div class="flex flex-col gap-1">
              <For each={MODE_OPTIONS}>
                {(opt) => (
                  <button
                    class="text-left rounded px-2 py-1.5 transition-colors"
                    style={{
                      background: mode() === opt.id ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)" : "var(--bg-base)",
                      color: mode() === opt.id ? "var(--accent-primary)" : "var(--text-primary)",
                      border: mode() === opt.id ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
                      cursor: "pointer",
                      "font-size": "12px",
                    }}
                    onClick={() => setMode(opt.id)}
                  >
                    <div style={{ "font-weight": "500" }}>{opt.label}</div>
                    <div style={{ color: "var(--text-muted)", "font-size": "11px" }}>{opt.description}</div>
                  </button>
                )}
              </For>
            </div>
          </div>

          <Show when={plan.loading}>
            <div class="flex items-center gap-2" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <span>Planning polish...</span>
            </div>
          </Show>

          <Show when={!plan.loading && plan()}>
            <div>
              <div style={{ "font-size": "11px", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
                Plan
              </div>
              <div class="rounded px-3 py-2" style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", "font-size": "12px" }}>
                <div>
                  <strong>{plan()!.chunks.length}</strong> change{plan()!.chunks.length === 1 ? "" : "s"} across{" "}
                  <strong>{new Set(plan()!.chunks.map((c) => c.path)).size}</strong> file(s)
                </div>
                <div style={{ color: "var(--text-muted)", "margin-top": "2px" }}>
                  Commits planned: {plan()!.commit_plan.length}
                </div>
              </div>
            </div>

            <div>
              <div style={{ "font-size": "11px", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
                Commits
              </div>
              <div class="flex flex-col gap-1">
                <For each={plan()!.commit_plan}>
                  {(c) => (
                    <div
                      class="rounded px-2 py-1"
                      style={{ background: "var(--bg-base)", border: "1px solid var(--border-muted)", "font-size": "11.5px" }}
                    >
                      <div style={{ "font-weight": "500" }}>{c.message}</div>
                      <div style={{ color: "var(--text-muted)", "font-size": "10.5px" }}>
                        {c.chunk_ids.length} change{c.chunk_ids.length === 1 ? "" : "s"} · category {c.category}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>

            <Show when={nonAllowlisted(plan()).length > 0}>
              <div
                class="rounded px-3 py-2"
                style={{ background: "color-mix(in srgb, var(--accent-yellow) 12%, transparent)", color: "var(--accent-yellow)", "font-size": "12px", border: "1px solid color-mix(in srgb, var(--accent-yellow) 30%, transparent)" }}
              >
                Heads up: {nonAllowlisted(plan()).join(", ")} changes are outside the safe allowlist. Review carefully before applying.
              </div>
            </Show>
          </Show>

          <Show when={error()}>
            <div
              class="rounded px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--accent-red) 12%, transparent)", color: "var(--accent-red)", "font-size": "12px" }}
            >
              {error()}
            </div>
          </Show>

          <Show when={appliedReport()}>
            <div
              class="rounded px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--accent-green) 12%, transparent)", color: "var(--accent-green)", "font-size": "12px", border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)" }}
            >
              Pushed {appliedReport()!.commits} commit{appliedReport()!.commits === 1 ? "" : "s"} to {appliedReport()!.branch}. Manifest saved at {appliedReport()!.manifestPath}.
            </div>
          </Show>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-2 shrink-0" style={{ "border-top": "1px solid var(--border-default)" }}>
          <button
            class="px-3 py-1.5 rounded"
            style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-default)", cursor: "pointer", "font-size": "12px" }}
            onClick={() => props.onClose()}
            disabled={applying()}
          >
            Close
          </button>
          <button
            class="px-3 py-1.5 rounded"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              cursor: applying() ? "wait" : plan() ? "pointer" : "not-allowed",
              "font-size": "12px",
              "font-weight": "500",
              opacity: applying() || !plan() ? 0.7 : 1,
            }}
            onClick={onApply}
            disabled={applying() || !plan()}
          >
            {applying() ? "Applying..." : "Apply polish"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolishDrawer;
