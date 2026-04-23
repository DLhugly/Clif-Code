import { Component, For, Show, createResource } from "solid-js";
import {
  fetchRelatedPrs,
  relatedPrs,
  setSelectedPrNumber,
  toggleSelection,
  selectedPrs,
} from "../../stores/reviewsStore";

const SimilarityDrawer: Component<{ prNumber: number; onClose: () => void }> = (props) => {
  const [_] = createResource(
    () => props.prNumber,
    async (n) => {
      await fetchRelatedPrs(n);
    },
  );
  const items = () => relatedPrs[props.prNumber] ?? [];

  return (
    <div
      class="fixed inset-0 flex items-start justify-end"
      style={{
        background: "color-mix(in srgb, #000 40%, transparent)",
        "z-index": "9100",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="h-full flex flex-col"
        style={{
          background: "var(--bg-surface)",
          "border-left": "1px solid var(--border-default)",
          width: "min(520px, 85vw)",
          "box-shadow": "-10px 0 30px rgba(0,0,0,0.25)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
            PRs similar to #{props.prNumber}
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

        <div class="flex-1 min-h-0 overflow-auto px-3 py-3 flex flex-col gap-2">
          <Show when={items().length === 0}>
            <div
              class="flex flex-col items-center justify-center h-full gap-2 text-center"
              style={{ color: "var(--text-muted)", padding: "40px 20px", "font-size": "calc(var(--ui-font-size) - 2px)" }}
            >
              <div>No related PRs found above the similarity threshold.</div>
              <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
                Adjust similarity.threshold in .clifreview.yaml to surface weaker matches.
              </div>
            </div>
          </Show>
          <For each={items()}>
            {(r) => {
              const isSelected = () => selectedPrs().has(r.pr_number);
              return (
                <div
                  class="rounded-lg"
                  style={{
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-default)",
                    padding: "10px 12px",
                  }}
                >
                  <div class="flex items-center gap-2" style={{ "font-size": "calc(var(--ui-font-size) - 2px)" }}>
                    <span style={{ color: "var(--accent-primary)", "font-family": "var(--font-mono, monospace)" }}>
                      #{r.pr_number}
                    </span>
                    <span class="flex-1 truncate" style={{ color: "var(--text-primary)" }}>
                      {r.title}
                    </span>
                    <span
                      class="px-1.5 rounded"
                      style={{
                        background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
                        color: "var(--accent-primary)",
                        "font-weight": "500",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                      }}
                      title={`files ${Math.round(r.score.file_overlap * 100)}% · title ${Math.round(
                        r.score.title_similarity * 100,
                      )}% · hunks ${Math.round(r.score.diff_hash_overlap * 100)}%`}
                    >
                      {Math.round(r.score.combined * 100)}%
                    </span>
                  </div>
                  <div class="flex items-center gap-2 mt-1" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3px)" }}>
                    <span>@{r.author}</span>
                    <span>·</span>
                    <span>files {Math.round(r.score.file_overlap * 100)}%</span>
                    <span>·</span>
                    <span>title {Math.round(r.score.title_similarity * 100)}%</span>
                    <span>·</span>
                    <span>hunks {Math.round(r.score.diff_hash_overlap * 100)}%</span>
                  </div>
                  <div class="flex items-center gap-2 mt-2">
                    <button
                      class="px-2 py-1 rounded"
                      style={{
                        background: "var(--bg-surface)",
                        color: "var(--text-primary)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                      }}
                      onClick={() => setSelectedPrNumber(r.pr_number)}
                    >
                      Open
                    </button>
                    <button
                      class="px-2 py-1 rounded"
                      style={{
                        background: isSelected() ? "var(--accent-primary)" : "var(--bg-surface)",
                        color: isSelected() ? "#fff" : "var(--text-primary)",
                        border: "1px solid var(--border-default)",
                        cursor: "pointer",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                      }}
                      onClick={() => toggleSelection(r.pr_number)}
                    >
                      {isSelected() ? "Selected" : "Select for consolidation"}
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </div>
    </div>
  );
};

export default SimilarityDrawer;
