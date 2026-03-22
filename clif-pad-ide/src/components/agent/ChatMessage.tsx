import { Component, Show, createSignal, createMemo } from "solid-js";
import { marked } from "marked";
import { fontSize } from "../../stores/uiStore";
import type { AgentMessage } from "../../types/agent";

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

const ToolCallCard: Component<{ message: AgentMessage }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const toolCall = () => props.message.toolCalls?.[0];
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
      case "read_file": return (args.path as string) || "";
      case "write_file": return (args.path as string) || "";
      case "edit_file": return (args.path as string) || "";
      case "search": return `"${args.query || ""}" in ${args.path || "."}`;
      case "find_file": return (args.name as string) || "";
      case "list_files": return (args.path as string) || ".";
      default: return "";
    }
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
        class="flex items-center gap-2 w-full px-3 py-2 text-left"
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
        <span
          class="shrink-0 rounded-full"
          style={{
            width: "6px",
            height: "6px",
            background: statusColor(),
          }}
        />
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style={{
            transform: expanded() ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
          }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span class="font-mono font-medium" style={{ color: "var(--accent-primary)" }}>
          {props.message.toolName}
        </span>
        <Show when={toolSummary()}>
          <span
            class="truncate font-mono"
            style={{
              color: props.message.toolName === "run_command" ? "var(--accent-yellow)" : "var(--text-muted)",
              "max-width": "200px",
              "font-size": "0.9em",
            }}
            title={toolSummary()}
          >
            {toolSummary()}
          </span>
        </Show>
        <Show when={toolCall()?.status === "running"}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            class="animate-spin"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </Show>
      </button>

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
            <div class="py-1.5" style={{ color: "var(--text-muted)" }}>
              <pre
                class="whitespace-pre-wrap break-all"
                style={{ margin: "0" }}
              >
                {JSON.stringify(toolCall()!.arguments, null, 2)}
              </pre>
            </div>
          </Show>
          <Show when={toolCall()?.result}>
            <div
              class="py-1.5 mt-1"
              style={{
                color: "var(--text-secondary)",
                "border-top": "1px solid var(--border-muted)",
                "max-height": "200px",
                "overflow-y": "auto",
              }}
            >
              <pre
                class="whitespace-pre-wrap break-all"
                style={{ margin: "0" }}
              >
                {toolCall()!.result}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const ChatMessage: Component<{ message: AgentMessage }> = (props) => {
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

  if (isToolCall()) {
    return <ToolCallCard message={props.message} />;
  }

  if (isSystem()) {
    return (
      <div
        class="flex justify-center py-2 px-4"
        style={{ color: "var(--text-muted)", "font-size": `${fontSize() - 2}px` }}
      >
        <span
          class="px-3 py-1 rounded-full"
          style={{
            background: props.message.status === "error"
              ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
              : "var(--bg-hover)",
            color: props.message.status === "error"
              ? "var(--accent-red)"
              : "var(--text-muted)",
          }}
        >
          {props.message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      class={`flex ${isUser() ? "justify-end" : "justify-start"} px-3 py-2`}
    >
      <div
        class={`max-w-[85%] rounded-2xl group ${isUser() ? "rounded-br-md" : "rounded-bl-md"}`}
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
          "user-select": "text",
          "-webkit-user-select": "text",
          cursor: "text",
        }}
      >
        <Show when={isUser()}>
          <div class="whitespace-pre-wrap" style={{ "user-select": "text", "-webkit-user-select": "text" }}>{props.message.content}</div>
        </Show>
        <Show when={isAssistant()}>
          <div class="agent-markdown" innerHTML={renderedHtml()} />
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
  );
};

export default ChatMessage;
