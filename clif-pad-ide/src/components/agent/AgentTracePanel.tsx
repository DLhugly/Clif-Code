import { Component, For, Show, createSignal, createEffect } from "solid-js";
import { agentTraceEntries, clearAgentTrace } from "../../stores/agentStore";
import { fontSize } from "../../stores/uiStore";
import type { AgentTraceEntry } from "../../types/agent";

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function toolIcon(tool: string): string {
  switch (tool) {
    case "read_file": return "📖";
    case "write_file": return "📝";
    case "edit_file": return "✏️";
    case "list_files": return "📁";
    case "search": return "🔍";
    case "find_file": return "🔎";
    case "run_command": return "⚡";
    case "change_directory": return "📂";
    case "submit": return "✅";
    default: return "🔧";
  }
}

function argSummary(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case "read_file":
    case "write_file":
    case "edit_file":
    case "list_files":
    case "change_directory":
      return (args.path as string) || "";
    case "search":
      return `"${args.query || ""}" in ${args.path || "."}`;
    case "find_file":
      return (args.name as string) || "";
    case "run_command":
      return (args.command as string) || "";
    case "submit":
      return ((args.summary as string) || "").slice(0, 60);
    default:
      return JSON.stringify(args).slice(0, 60);
  }
}

/** Try to extract diff_preview from an edit_file result */
function extractDiff(resultPreview: string): string | null {
  try {
    const parsed = JSON.parse(resultPreview);
    if (parsed.diff_preview) return parsed.diff_preview;
  } catch {
    // not JSON or truncated — try to find diff pattern
  }
  return null;
}

/** Try to extract write summary from a write_file result */
function extractWriteSummary(resultPreview: string): string | null {
  try {
    const parsed = JSON.parse(resultPreview);
    if (parsed.summary) return parsed.summary;
  } catch {}
  return null;
}

const TraceRow: Component<{ entry: AgentTraceEntry }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const diff = () => extractDiff(props.entry.result_preview);
  const writeSummary = () => extractWriteSummary(props.entry.result_preview);

  return (
    <div
      style={{
        "border-bottom": "1px solid var(--border-muted)",
        background: expanded() ? "var(--bg-hover)" : "transparent",
      }}
    >
      <button
        class="flex items-center gap-2 w-full px-3 py-1.5 text-left"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          "font-family": "inherit",
          "font-size": `${fontSize() - 2}px`,
          color: "var(--text-secondary)",
        }}
        onClick={() => setExpanded(!expanded())}
      >
        {/* Status dot */}
        <span
          class="shrink-0 rounded-full"
          style={{
            width: "6px",
            height: "6px",
            background: props.entry.ok ? "var(--accent-green)" : "var(--accent-red)",
          }}
        />

        {/* Timestamp */}
        <span
          class="shrink-0 font-mono"
          style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 3}px`, "min-width": "60px" }}
        >
          {formatTimestamp(props.entry.timestamp)}
        </span>

        {/* Turn # */}
        <span
          class="shrink-0 font-mono"
          style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 3}px`, "min-width": "24px" }}
        >
          T{props.entry.turn}
        </span>

        {/* Tool icon + name */}
        <span class="shrink-0">{toolIcon(props.entry.tool)}</span>
        <span class="shrink-0 font-mono font-medium" style={{ color: "var(--accent-primary)" }}>
          {props.entry.tool}
        </span>

        {/* Arg summary */}
        <span
          class="truncate flex-1 font-mono"
          style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 3}px` }}
          title={argSummary(props.entry.tool, props.entry.arguments)}
        >
          {argSummary(props.entry.tool, props.entry.arguments)}
        </span>

        {/* Result size */}
        <span
          class="shrink-0 font-mono"
          style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 3}px` }}
        >
          {props.entry.result_length > 1000
            ? `${(props.entry.result_length / 1024).toFixed(1)}K`
            : `${props.entry.result_length}b`}
        </span>

        {/* Chevron */}
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
          style={{
            transform: expanded() ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.12s",
            "flex-shrink": "0",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      <Show when={expanded()}>
        <div
          class="px-3 pb-2"
          style={{
            "font-size": `${fontSize() - 3}px`,
            "font-family": "var(--font-mono, monospace)",
          }}
        >
          {/* Arguments */}
          <div style={{ color: "var(--text-muted)", "margin-bottom": "6px" }}>
            <div style={{ "font-weight": "600", "margin-bottom": "2px", color: "var(--text-secondary)" }}>Arguments</div>
            <pre class="whitespace-pre-wrap break-all" style={{ margin: "0" }}>
              {JSON.stringify(props.entry.arguments, null, 2)}
            </pre>
          </div>

          {/* Diff preview for edit_file */}
          <Show when={diff()}>
            <div style={{ "margin-bottom": "6px" }}>
              <div style={{ "font-weight": "600", "margin-bottom": "2px", color: "var(--text-secondary)" }}>Diff</div>
              <pre
                class="whitespace-pre-wrap break-all"
                style={{
                  margin: "0",
                  padding: "6px 8px",
                  "border-radius": "6px",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-muted)",
                  "max-height": "200px",
                  "overflow-y": "auto",
                }}
              >
                <For each={diff()!.split("\n")}>
                  {(line) => (
                    <div
                      style={{
                        color: line.startsWith("+") ? "var(--accent-green)"
                          : line.startsWith("-") ? "var(--accent-red)"
                          : line.startsWith("@@") ? "var(--accent-blue)"
                          : "var(--text-muted)",
                        background: line.startsWith("+") ? "color-mix(in srgb, var(--accent-green) 8%, transparent)"
                          : line.startsWith("-") ? "color-mix(in srgb, var(--accent-red) 8%, transparent)"
                          : "transparent",
                      }}
                    >
                      {line}
                    </div>
                  )}
                </For>
              </pre>
            </div>
          </Show>

          {/* Write summary */}
          <Show when={!diff() && writeSummary()}>
            <div style={{ "margin-bottom": "6px", color: "var(--text-secondary)" }}>
              {writeSummary()}
            </div>
          </Show>

          {/* Result preview */}
          <div>
            <div style={{ "font-weight": "600", "margin-bottom": "2px", color: "var(--text-secondary)" }}>Result</div>
            <pre
              class="whitespace-pre-wrap break-all"
              style={{
                margin: "0",
                padding: "6px 8px",
                "border-radius": "6px",
                background: "var(--bg-base)",
                border: "1px solid var(--border-muted)",
                "max-height": "150px",
                "overflow-y": "auto",
                color: props.entry.ok ? "var(--text-muted)" : "var(--accent-red)",
              }}
            >
              {props.entry.result_preview}
            </pre>
          </div>
        </div>
      </Show>
    </div>
  );
};

const AgentTracePanel: Component = () => {
  let scrollRef: HTMLDivElement | undefined;

  // Auto-scroll to bottom when new entries come in
  createEffect(() => {
    const len = agentTraceEntries.length;
    if (len > 0 && scrollRef) {
      requestAnimationFrame(() => {
        scrollRef!.scrollTop = scrollRef!.scrollHeight;
      });
    }
  });

  const successCount = () => agentTraceEntries.filter((e) => e.ok).length;
  const errorCount = () => agentTraceEntries.filter((e) => !e.ok).length;
  const toolCounts = () => {
    const counts: Record<string, number> = {};
    for (const e of agentTraceEntries) {
      counts[e.tool] = (counts[e.tool] || 0) + 1;
    }
    return counts;
  };

  return (
    <div class="flex flex-col h-full" style={{ background: "var(--bg-surface)" }}>
      {/* Header */}
      <div
        class="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{
          "border-bottom": "1px solid var(--border-default)",
          background: "var(--bg-base)",
        }}
      >
        <span style={{ "font-size": `${fontSize()}px`, "font-weight": "700", color: "var(--text-primary)" }}>
          Agent Trace
        </span>

        {/* Stats */}
        <span
          class="font-mono"
          style={{ "font-size": `${fontSize() - 2}px`, color: "var(--text-muted)" }}
        >
          {agentTraceEntries.length} calls
        </span>
        <Show when={successCount() > 0}>
          <span class="font-mono" style={{ "font-size": `${fontSize() - 2}px`, color: "var(--accent-green)" }}>
            ✓ {successCount()}
          </span>
        </Show>
        <Show when={errorCount() > 0}>
          <span class="font-mono" style={{ "font-size": `${fontSize() - 2}px`, color: "var(--accent-red)" }}>
            ✗ {errorCount()}
          </span>
        </Show>

        <div class="flex-1" />

        {/* Tool frequency badges */}
        <div class="flex gap-1">
          <For each={Object.entries(toolCounts())}>
            {([tool, count]) => (
              <span
                class="px-1.5 py-0.5 rounded font-mono"
                style={{
                  "font-size": `${fontSize() - 3}px`,
                  background: "var(--bg-hover)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-muted)",
                }}
              >
                {toolIcon(tool)} {count}
              </span>
            )}
          </For>
        </div>

        {/* Clear button */}
        <button
          class="flex items-center justify-center"
          style={{
            width: "26px",
            height: "26px",
            "border-radius": "6px",
            border: "1px solid var(--border-muted)",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--accent-red)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
          onClick={clearAgentTrace}
          title="Clear trace"
        >
          <TrashIcon />
        </button>
      </div>

      {/* Trace entries */}
      <div
        ref={scrollRef}
        class="flex-1 overflow-y-auto"
        style={{ "min-height": "0" }}
      >
        <Show
          when={agentTraceEntries.length > 0}
          fallback={
            <div
              class="flex items-center justify-center h-full"
              style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 1}px` }}
            >
              <div class="text-center">
                <div style={{ "font-size": "24px", "margin-bottom": "8px" }}>🔍</div>
                <div>No trace entries yet</div>
                <div style={{ "font-size": `${fontSize() - 3}px`, "margin-top": "4px" }}>
                  Tool calls will appear here as the agent works
                </div>
              </div>
            </div>
          }
        >
          <For each={agentTraceEntries}>
            {(entry) => <TraceRow entry={entry} />}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default AgentTracePanel;
