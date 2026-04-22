import { Component, Show, createMemo, createSignal } from "solid-js";
import { reviewResults, postReview } from "../../stores/reviewsStore";
import { projectRoot } from "../../stores/fileStore";

type Action = "comment" | "approve" | "request_changes";

const ACTIONS: { id: Action; label: string; color: string; bg: string }[] = [
  { id: "comment", label: "Comment", color: "#fff", bg: "var(--accent-primary)" },
  { id: "approve", label: "Approve", color: "#fff", bg: "var(--accent-green)" },
  { id: "request_changes", label: "Request changes", color: "#fff", bg: "var(--accent-red)" },
];

const SignOffOverlay: Component<{ prNumber: number; onClose: () => void }> = (props) => {
  const review = createMemo(() => reviewResults[props.prNumber] ?? null);
  const [action, setAction] = createSignal<Action>("comment");
  const [note, setNote] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const requiredCount = createMemo(() => {
    const r = review();
    if (!r?.findings) return 0;
    return r.findings.filter((f) => f.required).length;
  });

  const payload = createMemo(() => {
    const r = review();
    if (!r) return "";
    const body: string[] = [];
    if (r.summary) body.push(`## Clif Review Summary\n\n${r.summary}`);
    if (r.risk_score != null) body.push(`**Risk score:** ${r.risk_score}`);
    const findings = r.findings ?? [];
    if (findings.length > 0) {
      body.push(`## Findings (${findings.length})`);
      for (const f of findings) {
        body.push(`- **[${f.severity}]** \`${f.path}:${f.line_start}${f.line_end !== f.line_start ? `-${f.line_end}` : ""}\` ${f.message}`);
      }
    }
    if (note().trim()) body.push(`\n---\n\n${note().trim()}`);
    return body.join("\n\n");
  });

  async function handlePost() {
    const root = projectRoot();
    if (!root) return;
    setPosting(true);
    setError(null);
    try {
      await postReview(root, props.prNumber, action(), payload());
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div
      class="fixed inset-0 flex items-center justify-center"
      style={{
        background: "color-mix(in srgb, #000 45%, transparent)",
        "z-index": "9000",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        class="rounded-lg flex flex-col"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          width: "min(640px, 90vw)",
          "max-height": "85vh",
          "box-shadow": "0 20px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>Sign off on PR #{props.prNumber}</div>
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

        <div class="px-4 py-3 overflow-auto flex-1 flex flex-col gap-3">
          <Show when={requiredCount() > 0 && action() === "approve"}>
            <div
              class="rounded px-3 py-2"
              style={{
                background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                color: "var(--accent-red)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                border: "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)",
              }}
            >
              Warning: {requiredCount()} required finding{requiredCount() === 1 ? "" : "s"} will be overridden by this approval.
            </div>
          </Show>

          <div>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Action
            </div>
            <div class="flex gap-2">
              {ACTIONS.map((a) => (
                <button
                  class="flex-1 py-1.5 rounded transition-colors"
                  style={{
                    background: action() === a.id ? a.bg : "var(--bg-base)",
                    color: action() === a.id ? a.color : "var(--text-muted)",
                    border: `1px solid ${action() === a.id ? a.bg : "var(--border-default)"}`,
                    cursor: "pointer",
                    "font-size": "calc(var(--ui-font-size) - 2px)",
                    "font-weight": "500",
                  }}
                  onClick={() => setAction(a.id)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Reviewer note (optional)
            </div>
            <textarea
              class="w-full outline-none rounded p-2"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "min-height": "60px",
                "font-family": "inherit",
                resize: "vertical",
              }}
              placeholder="Add a personal note that will be appended to the posted review..."
              value={note()}
              onInput={(e) => setNote(e.currentTarget.value)}
            />
          </div>

          <div>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "margin-bottom": "6px", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Payload preview
            </div>
            <pre
              class="rounded p-2"
              style={{
                background: "var(--bg-base)",
                border: "1px solid var(--border-default)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "max-height": "220px",
                "overflow-y": "auto",
                "font-family": "var(--font-mono, monospace)",
                "white-space": "pre-wrap",
                color: "var(--text-secondary)",
              }}
            >
              {payload() || "(empty)"}
            </pre>
          </div>

          <Show when={error()}>
            <div
              class="rounded px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--accent-red) 12%, transparent)", color: "var(--accent-red)", "font-size": "calc(var(--ui-font-size) - 2px)" }}
            >
              {error()}
            </div>
          </Show>
        </div>

        <div
          class="flex items-center justify-end gap-2 px-4 py-2 shrink-0"
          style={{ "border-top": "1px solid var(--border-default)" }}
        >
          <button
            class="px-3 py-1.5 rounded"
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
              "font-size": "calc(var(--ui-font-size) - 2px)",
            }}
            onClick={() => props.onClose()}
            disabled={posting()}
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 rounded"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              cursor: posting() ? "wait" : "pointer",
              "font-size": "calc(var(--ui-font-size) - 2px)",
              "font-weight": "500",
              opacity: posting() ? 0.7 : 1,
            }}
            onClick={handlePost}
            disabled={posting()}
          >
            {posting() ? "Posting..." : `Post ${action() === "request_changes" ? "changes request" : action()}`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SignOffOverlay;
