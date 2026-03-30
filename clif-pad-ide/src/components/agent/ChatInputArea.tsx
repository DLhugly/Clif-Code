import { Component, Show, For } from "solid-js";
import { SendIcon, StopIcon } from "./icons";

interface ChatInputAreaProps {
  inputValue: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onForceSend: () => void;
  onStop: () => void;
  onPaste: (e: ClipboardEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onAttachFile: () => void;
  pastedImages: string[];
  onRemoveImage: (index: number) => void;
  isStreaming: boolean;
  queuedCount: number;
  placeholder: string;
  fontSize: number;
  webSearchEnabled: boolean;
  onToggleWebSearch: () => void;
  showWebSearch: boolean;
  tokens: { prompt: number; completion: number };
}

const ChatInputArea: Component<ChatInputAreaProps> = (props) => {
  let inputRef: HTMLTextAreaElement | undefined;

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 150) + "px";
  }

  return (
    <div
      class="shrink-0 px-3 py-2"
      style={{ "border-top": "1px solid var(--border-default)" }}
    >
      {/* Pasted image previews */}
      <Show when={props.pastedImages.length > 0}>
        <div class="flex flex-wrap gap-2 mb-2">
          <For each={props.pastedImages}>
            {(img, idx) => (
              <div class="relative shrink-0" style={{ width: "64px", height: "64px" }}>
                <img
                  src={img}
                  alt="pasted"
                  style={{
                    width: "64px",
                    height: "64px",
                    "object-fit": "cover",
                    "border-radius": "6px",
                    border: "1px solid var(--border-default)",
                  }}
                />
                <button
                  class="absolute flex items-center justify-center"
                  style={{
                    top: "-5px",
                    right: "-5px",
                    width: "16px",
                    height: "16px",
                    "border-radius": "50%",
                    background: "var(--bg-overlay)",
                    border: "1px solid var(--border-default)",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    "font-size": "10px",
                    "line-height": "1",
                  }}
                  onClick={() => props.onRemoveImage(idx())}
                  title="Remove image"
                >
                  ✕
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div
        class="flex items-end gap-2 rounded-xl px-3 py-2"
        style={{
          background: "var(--bg-base)",
          border: "1px solid var(--border-default)",
        }}
      >
        {/* Attach file button */}
        <button
          class="flex items-center justify-center shrink-0 rounded p-1 mb-0.5"
          style={{
            color: "var(--text-muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
          }}
          onClick={props.onAttachFile}
          title="Attach current file as context"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={inputRef}
          class="flex-1 resize-none outline-none"
          style={{
            background: "transparent",
            color: "var(--text-primary)",
            border: "none",
            "font-size": `${props.fontSize}px`,
            "line-height": "1.4",
            "min-height": "20px",
            "max-height": "150px",
            "font-family": "inherit",
            opacity: props.queuedCount > 0 ? "0.6" : "1",
          }}
          placeholder={props.placeholder}
          rows={1}
          value={props.inputValue}
          onInput={(e) => {
            if (props.queuedCount > 0) return;
            const val = e.currentTarget.value;
            props.onInputChange(val);
            autoResize(e.currentTarget);
          }}
          onKeyDown={props.onKeyDown}
          onPaste={props.onPaste}
        />

        {/* Queued messages badge */}
        <Show when={props.queuedCount > 0}>
          <button
            class="absolute top-[-8px] right-[-8px] z-10 flex items-center justify-center rounded-full"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
              "font-size": "11px",
              "min-width": "20px",
              height: "20px",
              padding: "0 6px",
              "font-weight": "600",
              border: "2px solid var(--bg-base)",
              cursor: "pointer",
            }}
            onClick={props.onForceSend}
            title={`Force push: cancel current agent and send next message (${props.queuedCount} queued)`}
          >
            {props.queuedCount}
          </button>
        </Show>
      </div>

      <div class="flex items-center justify-between mt-1 px-1">
        {/* Send / Stop streaming button */}
        <Show
          when={!props.isStreaming}
          fallback={
            <Show
              when={props.inputValue.trim()}
              fallback={
                <button
                  class="flex items-center justify-center shrink-0 rounded-lg p-1.5 mb-0.5 transition-colors"
                  style={{
                    background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                    color: "var(--accent-red)",
                    border: "1px solid color-mix(in srgb, var(--accent-red) 25%, transparent)",
                    cursor: "pointer",
                  }}
                  onClick={props.onStop}
                  title="Stop streaming response"
                >
                  <StopIcon />
                </button>
              }
            >
              <button
                class="flex items-center justify-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1 mb-0.5 transition-colors"
                style={{
                  background: "var(--bg-hover)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                }}
                onClick={props.onForceSend}
                title="Force push: cancel current agent and send next message"
              >
                <SendIcon />
                <span style={{ "font-size": "11px", "font-weight": "500" }}>Force</span>
              </button>
            </Show>
          }
        >
          <button
            class="flex items-center justify-center shrink-0 rounded-lg p-1.5 mb-0.5 transition-colors"
            style={{
              background: (props.inputValue.trim() || props.pastedImages.length > 0)
                ? "var(--accent-primary)"
                : "var(--bg-hover)",
              color: (props.inputValue.trim() || props.pastedImages.length > 0) ? "#fff" : "var(--text-muted)",
              border: "none",
              cursor: (props.inputValue.trim() || props.pastedImages.length > 0) ? "pointer" : "default",
            }}
            onClick={() => props.onSend()}
            disabled={!props.inputValue.trim() && props.pastedImages.length === 0}
            title="Send message"
          >
            <SendIcon />
          </button>
        </Show>
      </div>

      <div
        class="flex items-center justify-between mt-1 px-1"
        style={{ "font-size": `${props.fontSize - 4}px`, color: "var(--text-muted)" }}
      >
        {/* Left: status or hint */}
        <Show when={props.isStreaming}
          fallback={<span>Enter to send, Shift+Enter for newline</span>}
        >
          <div class="flex items-center gap-1.5">
            <span
              class="inline-block animate-pulse"
              style={{ width: "5px", height: "5px", "border-radius": "50%", background: "var(--accent-yellow)", "flex-shrink": "0" }}
            />
            <span>Agent running</span>
            <button
              class="flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
              style={{
                background: "transparent", color: "var(--text-muted)",
                border: "1px solid var(--border-default)", cursor: "pointer",
                "font-size": `${props.fontSize - 4}px`, "font-weight": "600",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-red) 10%, transparent)";
                (e.currentTarget as HTMLElement).style.color = "var(--accent-red)";
                (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent-red) 25%, transparent)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                (e.currentTarget as HTMLElement).style.borderColor = "var(--border-default)";
              }}
              onClick={props.onStop}
              title="Stop all agent tasks"
            >
              <StopIcon />
              Stop
            </button>
          </div>
        </Show>

        <div class="flex items-center gap-2">
          {/* Web search toggle */}
          <Show when={props.showWebSearch}>
            <button
              class="flex items-center gap-1 rounded px-1.5 py-0.5 transition-all"
              style={{
                background: props.webSearchEnabled
                  ? "color-mix(in srgb, var(--accent-blue) 15%, transparent)"
                  : "transparent",
                color: props.webSearchEnabled ? "var(--accent-blue)" : "var(--text-muted)",
                border: props.webSearchEnabled
                  ? "1px solid color-mix(in srgb, var(--accent-blue) 30%, transparent)"
                  : "1px solid transparent",
                cursor: "pointer",
                "font-size": `${props.fontSize - 4}px`,
                "font-family": "var(--font-sans)",
              }}
              onMouseEnter={(e) => { if (!props.webSearchEnabled) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { if (!props.webSearchEnabled) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onClick={props.onToggleWebSearch}
              title={props.webSearchEnabled
                ? "Web search ON — model will fetch live results ($0.004/search)"
                : "Enable web search — appends :online to model via OpenRouter"}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
              </svg>
              {props.webSearchEnabled ? "Search on" : "Search"}
            </button>
          </Show>

          <Show when={props.tokens.prompt > 0}>
            <span style={{ "font-family": "var(--font-mono, monospace)" }}>
              {(() => {
                const total = props.tokens.prompt + props.tokens.completion;
                const cost = (props.tokens.prompt * 3 + props.tokens.completion * 15) / 1_000_000;
                const totalStr = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : `${total}`;
                return `${totalStr} tokens · ~$${cost.toFixed(4)}`;
              })()}
            </span>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default ChatInputArea;
