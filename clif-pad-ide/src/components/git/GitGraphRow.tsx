import { Component, Show, For, createSignal, createMemo } from "solid-js";
import { remoteUrl } from "../../stores/gitStore";
import { open } from "@tauri-apps/plugin-shell";
import type { GitLogEntry } from "../../types/git";

// Branch colors for the graph
const BRANCH_COLORS = [
  "var(--accent-blue)",
  "var(--accent-green)",
  "var(--accent-yellow)",
  "var(--accent-red)",
  "#c084fc", // purple
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#fb923c", // orange
];

const GitGraphRow: Component<{
  entry: GitLogEntry;
  isLast: boolean;
  isMerge: boolean;
}> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  let rowRef: HTMLDivElement | undefined;

  const refLabels = createMemo(() => {
    return props.entry.refs.filter((r) => r !== "").map((r) => {
      const isHead = r.includes("HEAD");
      const cleaned = r.replace("HEAD -> ", "").replace("HEAD", "").trim();
      return { label: cleaned || (isHead ? "HEAD" : r), isHead };
    }).filter((r) => r.label);
  });

  return (
    <div
      ref={rowRef}
      class="git-graph-row px-2 py-1 cursor-default"
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div class="flex items-start gap-2">
        {/* Graph column */}
        <div
          class="shrink-0 flex flex-col items-center"
          style={{ width: "16px", "min-height": "28px" }}
        >
          <div style={{ width: "2px", height: "6px", background: "var(--border-default)" }} />
          <div
            style={{
              width: props.entry.is_head ? "10px" : "8px",
              height: props.entry.is_head ? "10px" : "8px",
              "border-radius": "50%",
              background: props.entry.is_head
                ? "var(--accent-blue)"
                : props.isMerge
                ? "var(--accent-yellow)"
                : "var(--text-muted)",
              border: props.entry.is_head ? "2px solid var(--accent-blue)" : "none",
              "box-shadow": props.entry.is_head ? "0 0 6px rgba(59,130,246,0.5)" : "none",
              "flex-shrink": "0",
            }}
          />
          <Show when={!props.isLast}>
            <div style={{ width: "2px", "flex-grow": "1", "min-height": "6px", background: "var(--border-default)" }} />
          </Show>
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
                      background: ref.isHead ? "var(--accent-blue)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                      color: "#fff", opacity: ref.isHead ? "1" : "0.85",
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

      {/* Floating popup — VS Code style, appears to the left */}
      <Show when={hovered()}>
        <div
          style={{
            position: "fixed",
            right: "calc(100% - 310px + 4px)",
            "margin-top": "-4px",
            width: "260px",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            "border-radius": "8px",
            padding: "10px 12px",
            "box-shadow": "0 4px 20px rgba(0,0,0,0.35)",
            "z-index": "500",
            "font-size": "0.85em",
            "pointer-events": "none",
          }}
          onMouseEnter={() => setHovered(true)}
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
                style={{ color: "var(--accent-yellow)", cursor: "pointer", "text-decoration": "underline", "font-size": "0.9em", "pointer-events": "all" }}
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
                        background: ref.isHead ? "var(--accent-blue)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                        color: "#fff",
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
              style={{ "border-top": "1px solid var(--border-muted)", "pointer-events": "all" }}
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
