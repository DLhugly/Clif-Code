import { Component, Show, For, createSignal, createMemo, createEffect, onCleanup } from "solid-js";
import { remoteUrl } from "../../stores/gitStore";
import { open } from "@tauri-apps/plugin-shell";
import type { GitLogEntry } from "../../types/git";

// Branch colors using theme variables (only colors that exist in all themes)
const BRANCH_COLORS = [
  "var(--accent-blue)",
  "var(--accent-green)",
  "var(--accent-yellow)",
  "var(--accent-red)",
  "var(--accent-purple)",
  "var(--accent-orange)",
];

// Hash a string to get a consistent index for branch colors
function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash) % max;
}

const GitGraphRow: Component<{
  entry: GitLogEntry;
  isLast: boolean;
  isMerge: boolean;
  branchColorIndex?: number;
}> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  const [popupStyle, setPopupStyle] = createSignal<Record<string, string>>({});
  let rowRef: HTMLDivElement | undefined;
  let hideTimeout: ReturnType<typeof setTimeout> | undefined;

  const handleMouseEnter = () => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = undefined;
    }
    setHovered(true);
  };

  const handleMouseLeave = () => {
    // Delay hiding to allow mouse to reach the popup
    hideTimeout = setTimeout(() => {
      setHovered(false);
    }, 150);
  };

  onCleanup(() => {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
    }
  });

  const refLabels = createMemo(() => {
    return props.entry.refs.filter((r) => r !== "").map((r) => {
      const isHead = r.includes("HEAD");
      const cleaned = r.replace("HEAD -> ", "").replace("HEAD", "").trim();
      return { label: cleaned || (isHead ? "HEAD" : r), isHead };
    }).filter((r) => r.label);
  });

  // Compute branch color based on commit hash for consistency
  const dotColorIndex = () => props.branchColorIndex ?? hashStringToIndex(props.entry.hash, BRANCH_COLORS.length);
  const dotColor = () => BRANCH_COLORS[dotColorIndex()];

  // Position popup to the left of the row when hovered
  createEffect(() => {
    if (hovered() && rowRef) {
      const rect = rowRef.getBoundingClientRect();
      const popupWidth = 280;
      const gap = 8;
      
      // Position to the left of the row, aligned with top
      setPopupStyle({
        left: `${rect.left - popupWidth - gap}px`,
        top: `${rect.top}px`,
      });
    }
  });

  return (
    <div
      ref={rowRef}
      class="git-graph-row px-2 py-1 cursor-default"
      style={{ position: "relative" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div class="flex items-start gap-2">
        {/* Graph column - just the dot, line is drawn by parent */}
        <div
          class="shrink-0 flex items-center justify-center"
          style={{ width: "20px", "min-height": "28px", position: "relative" }}
        >
          {/* The commit dot - centered vertically in the row */}
          <div
            style={{
              width: props.entry.is_head ? "12px" : "10px",
              height: props.entry.is_head ? "12px" : "10px",
              "border-radius": "50%",
              background: props.entry.is_head
                ? "var(--accent-primary)"
                : props.isMerge
                ? "var(--accent-yellow)"
                : "var(--accent-primary)",
              opacity: props.entry.is_head ? "1" : "0.6",
              border: props.entry.is_head ? "2px solid var(--accent-primary)" : "none",
              "box-shadow": props.entry.is_head ? "0 0 8px var(--accent-primary)" : "none",
              "z-index": "2",
              position: "relative",
              transform: hovered() ? "scale(1.4)" : "scale(1)",
              transition: "transform 0.15s ease",
            }}
          />
        </div>

        {/* Commit info */}
        <div class="flex-1 min-w-0 py-0.5">
          <Show when={refLabels().length > 0}>
            <div class="flex flex-wrap gap-1 mb-0.5">
              <For each={refLabels()}>
                {(ref, i) => (
                  <span
                    class="px-1 rounded font-mono"
                    style={{
                      "font-size": "0.75em", "line-height": "1.4",
                      background: ref.isHead ? "var(--accent-primary)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                      color: "var(--accent-text)",
                      opacity: ref.isHead ? "1" : "0.9",
                    }}
                  >
                    {ref.label}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <div class="truncate" style={{ color: "var(--text-primary)", "font-size": "0.92em", "line-height": "1.4" }}>
            {props.entry.message}
          </div>
          <div class="flex items-center gap-2 mt-0.5" style={{ color: "var(--text-muted)", "font-size": "0.84em" }}>
            <Show when={remoteUrl()}>
              <span
                class="font-mono"
                style={{ color: "var(--accent-yellow)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
              >
                {props.entry.short_hash}
              </span>
            </Show>
            <Show when={!remoteUrl()}>
              <span class="font-mono" style={{ color: "var(--accent-yellow)" }}>{props.entry.short_hash}</span>
            </Show>
            <span class="truncate">{props.entry.author}</span>
            <span class="shrink-0 ml-auto">{props.entry.date}</span>
          </div>
        </div>
      </div>

      {/* Floating popup — appears to the left of the row, pinned close */}
      <Show when={hovered()}>
        <div
          style={{
            position: "fixed",
            width: "280px",
            left: popupStyle().left || "0",
            top: popupStyle().top || "0",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            "border-radius": "8px",
            padding: "10px 12px",
            "box-shadow": "0 4px 20px rgba(0,0,0,0.35)",
            "z-index": "1000",
            "font-size": "0.85em",
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Message */}
          <div style={{ "font-weight": "600", color: "var(--text-primary)", "margin-bottom": "8px", "line-height": "1.4", "word-break": "break-word" }}>
            {props.entry.message}
          </div>

          {/* Hash */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Hash</span>
            <Show when={remoteUrl()}
              fallback={<span class="font-mono" style={{ color: "var(--accent-yellow)", "font-size": "0.9em" }}>{props.entry.hash.slice(0, 16)}</span>}
            >
              <span
                class="font-mono"
                style={{ color: "var(--accent-yellow)", cursor: "pointer", "text-decoration": "underline", "font-size": "0.9em" }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
                title={`View on ${new URL(remoteUrl()!).hostname}`}
              >
                {props.entry.hash.slice(0, 16)} ↗
              </span>
            </Show>
          </div>

          {/* Author */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Author</span>
            <span style={{ color: "var(--text-primary)", "font-size": "0.9em" }}>{props.entry.author}</span>
          </div>

          {/* Date */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Date</span>
            <span style={{ color: "var(--text-primary)", "font-size": "0.9em" }}>{props.entry.date}</span>
          </div>

          {/* Refs */}
          <Show when={refLabels().length > 0}>
            <div class="flex items-start gap-2 mt-1 pt-1" style={{ "border-top": "1px solid var(--border-muted)" }}>
              <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em", "padding-top": "1px" }}>Refs</span>
              <div class="flex flex-wrap gap-1">
                <For each={refLabels()}>
                  {(ref, i) => (
                    <span
                      class="px-1 rounded font-mono"
                      style={{
                        "font-size": "0.8em", "line-height": "1.5",
                        background: ref.isHead ? "var(--accent-primary)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                        color: "var(--accent-text)",
                      }}
                    >
                      {ref.label}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Open on GitHub link */}
          <Show when={remoteUrl()}>
            <div
              class="mt-2 pt-1"
              style={{ "border-top": "1px solid var(--border-muted)" }}
            >
              <span
                style={{ color: "var(--accent-primary)", "font-size": "0.85em", cursor: "pointer", "text-decoration": "underline" }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
              >
                View on {new URL(remoteUrl()!).hostname} ↗
              </span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default GitGraphRow;
