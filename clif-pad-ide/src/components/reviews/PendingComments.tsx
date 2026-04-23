import { Component, For, Show, createSignal } from "solid-js";
import {
  pendingComments,
  sendPendingComment,
  editPendingComment,
  dismissPendingComment,
} from "../../stores/reviewsStore";

const PendingComments: Component<{ onClose: () => void }> = (props) => {
  const [editing, setEditing] = createSignal<Record<string, string>>({});
  const [sending, setSending] = createSignal<string | null>(null);

  function currentBody(id: string, fallback: string): string {
    const e = editing();
    return e[id] ?? fallback;
  }

  async function onSend(id: string) {
    setSending(id);
    const body = editing()[id];
    if (body != null) {
      try {
        await editPendingComment(id, body);
      } catch {
        // ignore
      }
    }
    try {
      await sendPendingComment(id);
    } finally {
      setSending(null);
      setEditing((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }

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
            Pending comments
            <span style={{ color: "var(--text-muted)", "margin-left": "6px", "font-size": "calc(var(--ui-font-size) - 3px)", "font-weight": "400" }}>
              ({pendingComments.length})
            </span>
          </div>
          <button
            class="flex items-center justify-center"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onClick={() => props.onClose()}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex-1 min-h-0 overflow-auto px-3 py-3 flex flex-col gap-3">
          <Show when={pendingComments.length === 0}>
            <div
              class="flex flex-col items-center justify-center h-full gap-2 text-center"
              style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)", padding: "40px 20px" }}
            >
              <div>No pending comments.</div>
              <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
                Policy violations will draft comments here for your approval.
              </div>
            </div>
          </Show>
          <For each={pendingComments}>
            {(c) => (
              <div
                class="rounded-lg"
                style={{
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-default)",
                  padding: "10px 12px",
                }}
              >
                <div class="flex items-center gap-2 mb-2" style={{ "font-size": "calc(var(--ui-font-size) - 3px)" }}>
                  <span style={{ color: "var(--accent-primary)", "font-family": "var(--font-mono, monospace)" }}>
                    #{c.pr_number}
                  </span>
                  <span style={{ color: "var(--text-muted)" }}>@{c.author}</span>
                  <Show when={c.rule_id}>
                    <span
                      class="px-1.5 rounded"
                      style={{
                        background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                        color: "var(--accent-red)",
                        "font-weight": "500",
                      }}
                    >
                      {c.rule_id}
                    </span>
                  </Show>
                  <Show when={c.auto_post}>
                    <span
                      class="px-1.5 rounded"
                      style={{
                        background: "color-mix(in srgb, var(--accent-yellow) 15%, transparent)",
                        color: "var(--accent-yellow)",
                      }}
                    >
                      auto-post
                    </span>
                  </Show>
                </div>
                <textarea
                  class="w-full outline-none rounded p-2"
                  style={{
                    background: "var(--bg-surface)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-muted)",
                    "min-height": "80px",
                    "font-size": "calc(var(--ui-font-size) - 2px)",
                    "font-family": "inherit",
                    resize: "vertical",
                  }}
                  value={currentBody(c.id, c.body)}
                  onInput={(e) =>
                    setEditing((prev) => ({ ...prev, [c.id]: e.currentTarget.value }))
                  }
                />
                <div class="flex items-center justify-end gap-2 mt-2">
                  <button
                    class="px-2 py-1 rounded"
                    style={{
                      background: "transparent",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-default)",
                      cursor: "pointer",
                      "font-size": "calc(var(--ui-font-size) - 3px)",
                    }}
                    onClick={() => dismissPendingComment(c.id)}
                    disabled={sending() === c.id}
                  >
                    Dismiss
                  </button>
                  <button
                    class="px-2 py-1 rounded"
                    style={{
                      background: "var(--accent-primary)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      "font-size": "calc(var(--ui-font-size) - 3px)",
                      "font-weight": "500",
                      opacity: sending() === c.id ? 0.7 : 1,
                    }}
                    onClick={() => onSend(c.id)}
                    disabled={sending() === c.id}
                    title="Send to GitHub (Cmd+Enter)"
                  >
                    {sending() === c.id ? "Sending..." : "Send"}
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};

export default PendingComments;
