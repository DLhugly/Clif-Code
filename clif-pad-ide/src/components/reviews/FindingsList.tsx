import { Component, For, Show, createMemo, createSignal } from "solid-js";
import type { ReviewResult, Finding, Severity, Category } from "../../types/review";
import { openFile } from "../../stores/fileStore";
import { dismissFinding, promoteFindingRequired, applyFindingPatch } from "../../stores/reviewsStore";

const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "nit"];

function severityColor(s: Severity): string {
  switch (s) {
    case "critical": return "var(--accent-red)";
    case "high": return "var(--accent-yellow)";
    case "medium": return "var(--accent-blue)";
    case "low": return "var(--text-muted)";
    case "nit": return "var(--text-muted)";
  }
}

function categoryLabel(c: Category): string {
  return c;
}

const FindingsList: Component<{ prNumber: number; review: ReviewResult | null }> = (props) => {
  const [severityFilter, setSeverityFilter] = createSignal<Severity | "all">("all");
  const [categoryFilter, setCategoryFilter] = createSignal<Category | "all">("all");
  const [expanded, setExpanded] = createSignal<string | null>(null);

  const findings = createMemo<Finding[]>(() => {
    const base = props.review?.findings ?? [];
    return base
      .filter((f) => severityFilter() === "all" || f.severity === severityFilter())
      .filter((f) => categoryFilter() === "all" || f.category === categoryFilter())
      .sort((a, b) => {
        const diff = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
        if (diff !== 0) return diff;
        return a.path.localeCompare(b.path);
      });
  });

  const severityCounts = createMemo(() => {
    const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, nit: 0 };
    for (const f of props.review?.findings ?? []) counts[f.severity]++;
    return counts;
  });

  const categorySet = createMemo<Category[]>(() => {
    const set = new Set<Category>();
    for (const f of props.review?.findings ?? []) set.add(f.category);
    return Array.from(set).sort();
  });

  return (
    <div class="flex flex-col h-full">
      <Show when={!props.review}>
        <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
          No review yet for this PR. Click <strong>Review</strong> in the header to run one.
        </div>
      </Show>

      <Show when={props.review}>
        <Show when={props.review!.summary}>
          <div class="px-4 py-3" style={{ "border-bottom": "1px solid var(--border-muted)" }}>
            <div style={{ "font-size": "11px", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em", "margin-bottom": "4px" }}>
              Summary
            </div>
            <div style={{ "font-size": "12.5px", color: "var(--text-primary)", "line-height": "1.5" }}>
              {props.review!.summary}
            </div>
          </div>
        </Show>

        <div class="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ "border-bottom": "1px solid var(--border-muted)", "font-size": "11px" }}>
          <div class="flex rounded overflow-hidden" style={{ border: "1px solid var(--border-muted)" }}>
            <button
              class="px-2 py-0.5 transition-colors"
              style={{
                background: severityFilter() === "all" ? "var(--accent-primary)" : "transparent",
                color: severityFilter() === "all" ? "#fff" : "var(--text-muted)",
                border: "none",
                cursor: "pointer",
                "font-size": "11px",
              }}
              onClick={() => setSeverityFilter("all")}
            >
              All ({props.review!.findings?.length ?? 0})
            </button>
            <For each={SEVERITY_ORDER}>
              {(sev) => (
                <Show when={severityCounts()[sev] > 0}>
                  <button
                    class="px-2 py-0.5 transition-colors"
                    style={{
                      background: severityFilter() === sev ? severityColor(sev) : "transparent",
                      color: severityFilter() === sev ? "#fff" : severityColor(sev),
                      border: "none",
                      "border-left": "1px solid var(--border-muted)",
                      cursor: "pointer",
                      "font-size": "11px",
                    }}
                    onClick={() => setSeverityFilter(sev)}
                  >
                    {sev} ({severityCounts()[sev]})
                  </button>
                </Show>
              )}
            </For>
          </div>

          <Show when={categorySet().length > 0}>
            <select
              class="outline-none rounded px-1 py-0.5"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "11px",
                cursor: "pointer",
              }}
              value={categoryFilter()}
              onChange={(e) => setCategoryFilter(e.currentTarget.value as Category | "all")}
            >
              <option value="all">All categories</option>
              <For each={categorySet()}>
                {(cat) => <option value={cat}>{categoryLabel(cat)}</option>}
              </For>
            </select>
          </Show>
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={findings().length === 0}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "12px" }}>
              <Show when={(props.review?.findings?.length ?? 0) === 0} fallback="No findings match your filters.">
                No issues found.
              </Show>
            </div>
          </Show>
          <For each={findings()}>
            {(f) => (
              <div
                class="px-3 py-2"
                style={{ "border-bottom": "1px solid var(--border-muted)" }}
              >
                <button
                  class="w-full flex items-start gap-2 text-left"
                  style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-primary)" }}
                  onClick={() => setExpanded(expanded() === f.id ? null : f.id)}
                >
                  <span
                    class="px-1.5 rounded shrink-0"
                    style={{
                      background: `color-mix(in srgb, ${severityColor(f.severity)} 15%, transparent)`,
                      color: severityColor(f.severity),
                      "font-size": "10px",
                      "font-weight": "600",
                      "text-transform": "uppercase",
                      "margin-top": "2px",
                    }}
                  >
                    {f.severity}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div style={{ "font-size": "12.5px", "font-weight": "500" }}>{f.message}</div>
                    <div class="flex items-center gap-2 flex-wrap" style={{ "font-size": "10.5px", color: "var(--text-muted)", "margin-top": "2px" }}>
                      <span
                        class="cursor-pointer"
                        style={{ color: "var(--accent-primary)", "font-family": "var(--font-mono, monospace)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openFile(f.path);
                        }}
                      >
                        {f.path}:{f.line_start}{f.line_end !== f.line_start ? `-${f.line_end}` : ""}
                      </span>
                      <span class="px-1 rounded" style={{ background: "var(--bg-hover)" }}>
                        {f.category}
                      </span>
                      <Show when={f.rule_id}>
                        <span class="px-1 rounded" style={{ background: "var(--bg-hover)" }}>{f.rule_id}</span>
                      </Show>
                      <Show when={f.confidence != null}>
                        <span>confidence {Math.round(((f.confidence as number) || 0) * 100)}%</span>
                      </Show>
                    </div>
                  </div>
                </button>
                <Show when={expanded() === f.id}>
                  <div class="mt-2 ml-2" style={{ "font-size": "12px", color: "var(--text-secondary)" }}>
                    <Show when={f.rationale}>
                      <div style={{ "margin-bottom": "8px", "line-height": "1.5" }}>{f.rationale}</div>
                    </Show>
                    <Show when={f.suggested_patch}>
                      <pre
                        class="rounded p-2"
                        style={{
                          background: "var(--bg-base)",
                          border: "1px solid var(--border-default)",
                          "font-size": "11px",
                          "overflow-x": "auto",
                          "font-family": "var(--font-mono, monospace)",
                          "white-space": "pre",
                        }}
                      >
                        {f.suggested_patch}
                      </pre>
                    </Show>
                    <div class="flex items-center gap-2 mt-2">
                      <Show when={f.suggested_patch}>
                        <button
                          class="px-2 py-0.5 rounded"
                          style={{
                            background: "var(--accent-primary)",
                            color: "#fff",
                            border: "none",
                            cursor: "pointer",
                            "font-size": "11px",
                          }}
                          onClick={() => applyFindingPatch(props.prNumber, f.id)}
                        >
                          Apply
                        </button>
                      </Show>
                      <button
                        class="px-2 py-0.5 rounded"
                        style={{
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          "font-size": "11px",
                        }}
                        onClick={() => dismissFinding(props.prNumber, f.id)}
                      >
                        Dismiss
                      </button>
                      <button
                        class="px-2 py-0.5 rounded"
                        style={{
                          background: "transparent",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-default)",
                          cursor: "pointer",
                          "font-size": "11px",
                        }}
                        onClick={() => promoteFindingRequired(props.prNumber, f.id)}
                      >
                        Require
                      </button>
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default FindingsList;
