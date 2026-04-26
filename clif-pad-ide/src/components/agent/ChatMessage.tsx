import { Component, Show, createSignal, createMemo, For, type Accessor } from "solid-js";
import { marked } from "marked";
import { fontSize } from "../../stores/uiStore";
import { openFile } from "../../stores/fileStore";
import { openExternal } from "../../lib/tauri";
import type { AgentMessage } from "../../types/agent";

export interface PendingCommand {
  sessionId: string;
  command: string;
  toolCallId: string;
}

const CopyButton: Component<{ text: string }> = (props) => {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <button
      class="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
      style={{
        position: "absolute",
        top: "6px",
        right: "6px",
        width: "26px",
        height: "26px",
        "border-radius": "6px",
        border: "none",
        background: "color-mix(in srgb, var(--bg-base) 80%, transparent)",
        "backdrop-filter": "blur(8px)",
        color: copied() ? "var(--accent-green)" : "var(--text-muted)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => { if (!copied()) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { if (!copied()) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
      onClick={handleCopy}
      title={copied() ? "Copied!" : "Copy message"}
    >
      <Show when={copied()} fallback={
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      }>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </Show>
    </button>
  );
};

marked.setOptions({ async: false, breaks: true, gfm: true });

// ── Feature #15: Diff Viewer ──────────────────────────────────────────────────
// Parses unified diff format and renders +/- lines with colour highlighting.
const DiffViewer: Component<{ diff: string }> = (props) => {
  const lines = () => props.diff.split("\n");
  return (
    <div
      style={{
        "font-family": "var(--font-mono, monospace)",
        "font-size": "0.8em",
        "border-radius": "6px",
        overflow: "hidden",
        border: "1px solid var(--border-muted)",
        "margin-top": "6px",
      }}
    >
      <For each={lines()}>
        {(line) => {
          const isAdd = line.startsWith("+") && !line.startsWith("+++");
          const isDel = line.startsWith("-") && !line.startsWith("---");
          const isHunk = line.startsWith("@@");
          return (
            <div
              style={{
                padding: "1px 8px",
                background: isAdd
                  ? "color-mix(in srgb, var(--accent-green) 15%, transparent)"
                  : isDel
                  ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
                  : isHunk
                  ? "color-mix(in srgb, var(--accent-blue) 10%, transparent)"
                  : "transparent",
                color: isAdd
                  ? "var(--accent-green)"
                  : isDel
                  ? "var(--accent-red)"
                  : isHunk
                  ? "var(--accent-blue)"
                  : "var(--text-muted)",
                "white-space": "pre",
                "word-break": "break-all",
              }}
            >
              {line || " "}
            </div>
          );
        }}
      </For>
    </div>
  );
};

// ── Clean Arguments Display ────────────────────────────────────────────────
// Renders tool arguments as clean key-value pairs instead of raw JSON.
const ArgumentsDisplay: Component<{ args: Record<string, unknown>; toolName: string }> = (props) => {
  // Format a value based on its type
  const formatValue = (val: unknown): string => {
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    return JSON.stringify(val);
  };

  // Get icon for common argument types
  const getArgIcon = (key: string): string => {
    if (key === "command") return "▶";
    if (key === "path") return "📄";
    if (key === "query") return "🔍";
    if (key === "old_string" || key === "new_string") return "✏️";
    if (key === "content") return "📝";
    if (key === "todos") return "☑";
    if (key === "merge") return "🔀";
    return "•";
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", gap: "4px", "padding-right": "28px" }}>
      <For each={Object.entries(props.args)}>
        {([key, value]) => {
          const displayValue = formatValue(value);
          const isLong = displayValue.length > 100;
          const truncatedValue = isLong ? displayValue.slice(0, 97) + "…" : displayValue;
          const isMultiline = typeof value === "string" && value.includes("\n");
          
          return (
            <div style={{ display: "flex", "flex-direction": "column", gap: "2px" }}>
              <div style={{ display: "flex", "align-items": "flex-start", gap: "8px" }}>
                <span style={{ color: "var(--text-muted)", "font-size": "0.85em" }}>
                  {getArgIcon(key)}
                </span>
                <span style={{ color: "var(--accent-blue)", "font-weight": "500" }}>
                  {key}:
                </span>
                <span
                  style={{
                    color: key === "command" ? "var(--accent-yellow)" : "var(--text-primary)",
                    "word-break": "break-all",
                    "white-space": isMultiline ? "pre-wrap" : "normal",
                  }}
                  title={isLong ? displayValue : undefined}
                >
                  {truncatedValue}
                </span>
              </div>
              {/* Show full value for long content/edit strings on click */}
              <Show when={isLong && (key === "old_string" || key === "new_string" || key === "content")}>
                <div
                  style={{
                    "margin-left": "24px",
                    "padding": "6px 8px",
                    "background": "var(--bg-surface)",
                    "border-radius": "4px",
                    border: "1px solid var(--border-muted)",
                    "white-space": "pre-wrap",
                    "word-break": "break-all",
                    "max-height": "120px",
                    overflow: "auto",
                    "font-size": "0.9em",
                  }}
                >
                  {displayValue}
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
};

// ── Feature #3: Clickable File Links ─────────────────────────────────────────
// Detects `path:line` or bare file path patterns in tool result text and
// renders them as clickable spans that open the file in the editor.
const FILE_LINK_RE = /([^\s"'`]+\.[a-zA-Z0-9]+)(?::(\d+))?/g;

function renderWithFileLinks(text: string, fs: typeof fontSize) {
  const parts: (string | { path: string; line?: number; raw: string })[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  FILE_LINK_RE.lastIndex = 0;

  while ((match = FILE_LINK_RE.exec(text)) !== null) {
    const [raw, path, lineStr] = match;
    // Only linkify if it looks like a real file path (has a / or starts with src/etc.)
    const looksLikePath = path.includes("/") || path.startsWith("src") || path.startsWith("lib");
    if (!looksLikePath) continue;
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ path, line: lineStr ? parseInt(lineStr, 10) : undefined, raw });
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return parts.map((p) => {
    if (typeof p === "string") return p;
    return (
      <span
        style={{
          color: "var(--accent-primary)",
          cursor: "pointer",
          "text-decoration": "underline",
          "text-underline-offset": "2px",
        }}
        onClick={() => openFile(p.path)}
        title={`Open ${p.path}${p.line ? `:${p.line}` : ""}`}
      >
        {p.raw}
      </span>
    );
  });
}

const ToolCallCard: Component<{
  message: AgentMessage;
  pendingCommand?: Accessor<PendingCommand | null>;
  onApprove?: (sessionId: string, approved: boolean) => void;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const toolCall = () => props.message.toolCalls?.[0];

  const isPendingApproval = () => {
    const pending = props.pendingCommand?.();
    return pending && pending.toolCallId === props.message.toolCallId;
  };
  const statusColor = () => {
    switch (toolCall()?.status) {
      case "running": return "var(--accent-yellow)";
      case "done": return "var(--accent-green)";
      case "error": return "var(--accent-red)";
      default: return "var(--text-muted)";
    }
  };

  const toolSummary = () => {
    const tc = toolCall();
    if (!tc) return "";
    const args = tc.arguments;
    switch (props.message.toolName) {
      case "run_command": return (args.command as string) || "";
      case "read_file": {
        const p = (args.path as string) || "";
        // Show just the filename, not full path
        return p.split("/").pop() || p;
      }
      case "write_file": return (args.path as string || "").split("/").pop() || "";
      case "edit_file": return (args.path as string || "").split("/").pop() || "";
      case "search": return `"${args.query || ""}"${args.path ? ` in ${(args.path as string).split("/").pop()}` : ""}`;
      case "find_file": return (args.name as string) || "";
      case "find_symbol": {
        const name = (args.name as string) || "";
        const limit = typeof args.limit === "number" ? args.limit : null;
        return limit ? `${name} (top ${limit})` : name;
      }
      case "list_files": {
        const p = (args.path as string) || ".";
        return p.split("/").pop() || p;
      }
      case "todo_write": {
        const todos = Array.isArray(args.todos) ? args.todos.length : 0;
        return `${todos} task${todos === 1 ? "" : "s"}${args.merge ? " (merge)" : ""}`;
      }
      case "todo_read":
        return "current tasks";
      default: return "";
    }
  };

  // Result preview for the collapsed state — first meaningful line of output
  const resultPreview = () => {
    const result = toolCall()?.result;
    if (!result || toolCall()?.status !== "done") return "";
    const text = result.trim();
    if (!text || text === "Task complete") return "";
    // Skip error messages in preview
    if (text.startsWith("Error:")) return text.slice(0, 80);
    // For file reads, show first non-empty line of content
    const firstLine = text.split("\n").find(l => l.trim().length > 0) || "";
    if (firstLine.length > 90) return firstLine.slice(0, 87) + "…";
    return firstLine;
  };

  return (
    <div
      class="rounded-lg overflow-hidden my-1"
      style={{
        border: "1px solid var(--border-default)",
        background: "var(--bg-base)",
      }}
    >
      <button
        class="flex flex-col w-full px-3 py-2 text-left gap-1"
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          "font-size": `${fontSize() - 2}px`,
          "font-family": "inherit",
        }}
        onClick={() => setExpanded(!expanded())}
      >
        {/* Row 1: status dot + chevron + tool name + key arg + spinner */}
        <div class="flex items-center gap-2 w-full">
          <span
            class="shrink-0 rounded-full"
            style={{ width: "6px", height: "6px", background: statusColor() }}
          />
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            style={{ transform: expanded() ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", "flex-shrink": "0" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span class="font-mono font-medium shrink-0" style={{ color: "var(--accent-primary)" }}>
            {props.message.toolName}
          </span>
          <Show when={toolSummary()}>
            <span
              class="truncate font-mono flex-1"
              style={{
                color: props.message.toolName === "run_command" ? "var(--accent-yellow)" : "var(--text-muted)",
                "font-size": "0.9em",
              }}
              title={toolSummary()}
            >
              {toolSummary()}
            </span>
          </Show>
          <Show when={toolCall()?.status === "running"}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="animate-spin shrink-0">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </Show>
        </div>

        {/* Row 2: result preview (only when done and not expanded) */}
        <Show when={!expanded() && resultPreview()}>
          <div
            class="truncate"
            style={{
              "padding-left": "20px",
              "font-size": `${fontSize() - 3}px`,
              "font-family": "var(--font-mono, monospace)",
              color: "var(--text-muted)",
              opacity: "0.75",
            }}
          >
            {resultPreview()}
          </div>
        </Show>
      </button>

      {/* Inline approval buttons for run_command */}
      <Show when={isPendingApproval()}>
        <div
          class="flex items-center gap-2 px-3 py-2"
          style={{ "border-top": "1px solid var(--border-muted)" }}
        >
          <button
            class="flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-text)",
              border: "none",
              cursor: "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              const pending = props.pendingCommand?.();
              if (pending) props.onApprove?.(pending.sessionId, true);
            }}
          >
            Allow
          </button>
          <button
            class="flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
              color: "var(--accent-red)",
              border: "1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)",
              cursor: "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              const pending = props.pendingCommand?.();
              if (pending) props.onApprove?.(pending.sessionId, false);
            }}
          >
            Block
          </button>
        </div>
      </Show>

      <Show when={expanded()}>
        <div
          class="px-3 pb-2"
          style={{
            "border-top": "1px solid var(--border-muted)",
            "font-size": `${fontSize() - 3}px`,
            "font-family": "var(--font-mono, monospace)",
          }}
        >
          <Show when={toolCall()?.arguments}>
            <div class="py-1.5 group" style={{ color: "var(--text-secondary)", position: "relative" }}>
              {/* Render arguments as clean key-value pairs */}
              <ArgumentsDisplay args={toolCall()!.arguments ?? {}} toolName={props.message.toolName ?? ""} />
              <CopyButton text={JSON.stringify(toolCall()!.arguments ?? {}, null, 2)} />
            </div>
          </Show>
          <Show when={toolCall()?.result}>
            <div
              class="py-1.5 mt-1 group"
              style={{
                color: "var(--text-secondary)",
                "border-top": "1px solid var(--border-muted)",
                "max-height": "300px",
                "overflow-y": "auto",
                position: "relative",
              }}
            >
              {/* Feature #15: Show coloured diff for edit_file results */}
              <Show
                when={props.message.toolName === "edit_file" && (() => {
                  try { return JSON.parse(toolCall()!.result ?? "{}").diff_preview; } catch { return null; }
                })()}
                fallback={
                  <pre class="whitespace-pre-wrap break-all" style={{ margin: "0", "padding-right": "28px" }}>
                    {/* Feature #3: render file paths as clickable links */}
                    {renderWithFileLinks(toolCall()!.result ?? "", fontSize)}
                  </pre>
                }
              >
                {(_) => {
                  let diffStr = "";
                  try { diffStr = JSON.parse(toolCall()!.result ?? "{}").diff_preview ?? ""; } catch {}
                  return <DiffViewer diff={diffStr} />;
                }}
              </Show>
              <CopyButton text={toolCall()?.result ?? ""} />
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const ChatMessage: Component<{
  message: AgentMessage;
  pendingCommand?: Accessor<PendingCommand | null>;
  onApprove?: (sessionId: string, approved: boolean) => void;
}> = (props) => {
  const isUser = () => props.message.role === "user";
  const isToolCall = () => props.message.role === "tool_call";
  const isToolResult = () => props.message.role === "tool_result";
  const isSystem = () => props.message.role === "system";
  const isAssistant = () => props.message.role === "assistant";

  const renderedHtml = createMemo(() => {
    if (!isAssistant()) return "";
    return marked.parse(props.message.content) as string;
  });

  // Don't render tool_result messages (shown inside tool_call cards)
  if (isToolResult()) return null;

  // For tool_call messages, always render the card.
  if (isToolCall()) {
    return <ToolCallCard message={props.message} pendingCommand={props.pendingCommand} onApprove={props.onApprove} />;
  }

  if (isSystem()) {
    // Structured compaction card — replaces the old raw "*[context compacted]*"
    // markdown that used to get appended to the assistant bubble.
    if (props.message.systemKind === "compaction") {
      const data = (props.message.systemData ?? {}) as Record<string, unknown>;
      const before = typeof data.tokens_before === "number" ? data.tokens_before : 0;
      const after = typeof data.tokens_after === "number" ? data.tokens_after : 0;
      const reason = (data.reason as string) ?? "auto";
      const saved = Math.max(0, before - after);
      const pct = before > 0 ? Math.round((saved / before) * 100) : 0;
      const fmt = (n: number) =>
        n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
      return (
        <div class="flex justify-center py-3 px-4">
          <div
            class="rounded-lg"
            style={{
              background: "color-mix(in srgb, var(--accent-primary) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--accent-primary) 28%, transparent)",
              padding: "10px 12px",
              "max-width": "440px",
              width: "100%",
              "font-size": `${fontSize() - 2}px`,
            }}
          >
            <div
              class="flex items-center gap-2"
              style={{ "margin-bottom": "6px" }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                style={{ color: "var(--accent-primary)", "flex-shrink": "0" }}
              >
                <polyline points="4 14 10 14 10 20" />
                <polyline points="20 10 14 10 14 4" />
                <line x1="14" y1="10" x2="21" y2="3" />
                <line x1="3" y1="21" x2="10" y2="14" />
              </svg>
              <span
                style={{
                  color: "var(--accent-primary)",
                  "font-weight": "700",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.06em",
                  "font-size": `${fontSize() - 3}px`,
                }}
              >
                Context compacted
              </span>
              <span
                class="ml-auto shrink-0"
                style={{
                  color: "var(--text-muted)",
                  "font-size": `${fontSize() - 3}px`,
                  "font-family": "var(--font-mono, monospace)",
                }}
              >
                {fmt(before)} → {fmt(after)}{" "}
                {saved > 0 ? (
                  <span style={{ color: "var(--accent-green)" }}>
                    (−{pct}%)
                  </span>
                ) : null}
              </span>
            </div>
            <div
              style={{
                color: "var(--text-secondary)",
                "line-height": "1.5",
                "font-size": `${fontSize() - 2.5}px`,
              }}
            >
              {reason === "overflow" ? (
                <>
                  The model rejected the last request as too large. Clif
                  summarized earlier turns and retried — nothing was lost from
                  the conversation UI, only from what the model sees going
                  forward.
                </>
              ) : (
                <>
                  This chat grew past Clif's auto-compact threshold
                  {typeof data.threshold === "number" && data.threshold > 0 ? (
                    <>
                      {" "}
                      (~{fmt(data.threshold as number)} tokens)
                    </>
                  ) : null}
                  . Older tool results and turns were summarized to keep the
                  model responsive and to stay inside the provider's context
                  window. Your messages above still show the full history.
                </>
              )}
            </div>
            <details style={{ "margin-top": "6px" }}>
              <summary
                style={{
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  "font-size": `${fontSize() - 3}px`,
                  "user-select": "none",
                }}
              >
                How does compaction work?
              </summary>
              <div
                style={{
                  "margin-top": "4px",
                  color: "var(--text-muted)",
                  "line-height": "1.5",
                  "font-size": `${fontSize() - 3}px`,
                }}
              >
                Clif uses a Claude-Code-style tiered compaction:
                <ol
                  style={{
                    "padding-left": "18px",
                    "margin-top": "2px",
                    "list-style": "decimal",
                  }}
                >
                  <li>Keep the system prompt and the last eight messages verbatim.</li>
                  <li>
                    Stub out old tool results beyond that window so the model
                    still sees the shape of the conversation but not the bulky
                    outputs.
                  </li>
                  <li>
                    Write a one-paragraph summary of the compacted turns and
                    insert it in place so the thread still reads continuously.
                  </li>
                </ol>
                Your visible chat above is unchanged — this only affects what
                the model sees on the next request.
              </div>
            </details>
          </div>
        </div>
      );
    }

    return (
      <div
        class="flex justify-center py-2 px-4"
        style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 2}px` }}
      >
        <span
          class="px-3 py-1 rounded-full"
          style={{
            background:
              props.message.status === "error"
                ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
                : "var(--bg-hover)",
            color:
              props.message.status === "error"
                ? "var(--accent-red)"
                : "var(--text-muted)",
          }}
        >
          {props.message.content}
        </span>
      </div>
    );
  }

  // Reactively hide assistant/user bubbles that have no content and are not
  // actively streaming. This handles tool-call-only turns where the LLM emits
  // zero text — we should see nothing, not an empty box with a copy button.
  const hasVisibleContent = () =>
    props.message.status === "streaming" ||
    !!(props.message.content?.trim()) ||
    !!(props.message.images && props.message.images.length > 0);

  return (
    <Show when={hasVisibleContent()}>
      <div
        class={`flex ${isUser() ? "justify-end" : "justify-start"} px-3 py-2`}
      >
        <div
          class={`max-w-[85%] rounded-2xl group selectable-text ${isUser() ? "rounded-br-md" : "rounded-bl-md"}`}
          style={{
            position: "relative",
            background: isUser()
              ? "var(--accent-primary)"
              : "var(--bg-surface)",
            color: isUser() ? "var(--accent-text, #fff)" : "var(--text-primary)",
            border: isUser() ? "none" : "1px solid var(--border-muted)",
            "box-shadow": isUser()
              ? "0 1px 4px color-mix(in srgb, var(--accent-primary) 30%, transparent)"
              : "0 1px 3px rgba(0,0,0,0.06)",
            "font-size": `${fontSize()}px`,
            "line-height": "1.6",
            padding: "10px 14px",
            cursor: "text",
          }}
        >
          <Show when={isUser()}>
            {/* Image attachments shown above the text */}
            <Show when={props.message.images && props.message.images.length > 0}>
              <div class="flex flex-wrap gap-1.5 mb-2">
                <For each={props.message.images}>
                  {(img) => (
                    <img
                      src={img}
                      alt="attachment"
                      style={{
                        "max-width": "200px",
                        "max-height": "160px",
                        "object-fit": "contain",
                        "border-radius": "6px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        display: "block",
                      }}
                    />
                  )}
                </For>
              </div>
            </Show>
            <Show when={props.message.content}>
              <div class="whitespace-pre-wrap" style={{ "user-select": "text", "-webkit-user-select": "text" }}>{props.message.content}</div>
            </Show>
          </Show>
          <Show when={isAssistant()}>
            <div
              class="agent-markdown"
              innerHTML={renderedHtml()}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === "A") {
                  e.preventDefault();
                  const href = target.getAttribute("href");
                  if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
                    openExternal(href);
                  }
                }
              }}
            />
            <Show when={props.message.status === "streaming"}>
              <span
                class="inline-block animate-pulse"
                style={{
                  width: "6px",
                  height: `${fontSize()}px`,
                  background: "var(--text-muted)",
                  "border-radius": "1px",
                  "vertical-align": "text-bottom",
                  "margin-left": "2px",
                }}
              />
            </Show>
          </Show>
          <Show when={props.message.status !== "streaming"}>
            <CopyButton text={props.message.content} />
          </Show>
        </div>
      </div>
    </Show>
  );
};

export default ChatMessage;
