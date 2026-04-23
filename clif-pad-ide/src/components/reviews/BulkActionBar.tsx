import { Component, Show, createSignal } from "solid-js";
import {
  selectedPrs,
  clearSelection,
  bulkPostReview,
  bulkCloseAsDuplicate,
  bulkQueuePolish,
  bulkRunning,
} from "../../stores/reviewsStore";

type ConfirmKind =
  | { kind: "approve" }
  | { kind: "request_changes" }
  | { kind: "comment" }
  | { kind: "polish" }
  | { kind: "close_duplicate" }
  | { kind: "consolidate" };

const BulkActionBar: Component<{ onConsolidate: () => void }> = (props) => {
  const count = () => selectedPrs().size;
  const [confirm, setConfirm] = createSignal<ConfirmKind | null>(null);
  const [noteBody, setNoteBody] = createSignal("");
  const [dupTarget, setDupTarget] = createSignal<string>("");
  const [dupReason, setDupReason] = createSignal("duplicate");
  const [polishMode, setPolishMode] = createSignal<"minimal" | "standard" | "aggressive" | "security">(
    "minimal",
  );

  function showing() {
    const c = confirm();
    if (!c) return null;
    switch (c.kind) {
      case "approve":
        return { title: "Approve selected PRs", primary: "Approve all", color: "var(--accent-green)" };
      case "request_changes":
        return { title: "Request changes on selected PRs", primary: "Send request", color: "var(--accent-red)" };
      case "comment":
        return { title: "Comment on selected PRs", primary: "Post comment", color: "var(--accent-primary)" };
      case "polish":
        return { title: "Queue polish on selected PRs", primary: "Queue polish", color: "var(--accent-primary)" };
      case "close_duplicate":
        return { title: "Close selected as duplicates", primary: "Close all", color: "var(--accent-red)" };
      case "consolidate":
        return { title: "Consolidate selected PRs", primary: "Open consolidation", color: "var(--accent-primary)" };
    }
  }

  async function runConfirm() {
    const c = confirm();
    if (!c) return;
    const body = noteBody();
    switch (c.kind) {
      case "approve":
        await bulkPostReview("approve", body);
        break;
      case "request_changes":
        await bulkPostReview("request_changes", body);
        break;
      case "comment":
        await bulkPostReview("comment", body);
        break;
      case "polish":
        await bulkQueuePolish(polishMode());
        break;
      case "close_duplicate": {
        const target = parseInt(dupTarget(), 10);
        if (!Number.isFinite(target)) return;
        const tmpl =
          `Closing as duplicate of #${target}.${dupReason() ? ` Reason: ${dupReason()}` : ""}\n\n— Clif Review`;
        await bulkCloseAsDuplicate(target, dupReason(), tmpl);
        break;
      }
      case "consolidate":
        props.onConsolidate();
        break;
    }
    setConfirm(null);
    setNoteBody("");
    setDupTarget("");
    setDupReason("duplicate");
  }

  const running = () => bulkRunning();

  return (
    <Show when={count() > 0 || running()}>
      <div
        class="sticky bottom-0 left-0 right-0 flex items-center gap-2 px-3 py-2"
        style={{
          background: "var(--bg-surface)",
          "border-top": "1px solid var(--border-default)",
          "font-size": "calc(var(--ui-font-size) - 2px)",
          "z-index": "50",
        }}
      >
        <span
          class="px-2 py-0.5 rounded"
          style={{
            background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
            color: "var(--accent-primary)",
            "font-weight": "500",
          }}
        >
          {count()} selected
        </span>
        <Show when={running()}>
          <span style={{ color: "var(--text-muted)" }}>
            {running()!.done}/{running()!.total}
            <Show when={running()!.failed > 0}>
              <span style={{ color: "var(--accent-red)", "margin-left": "4px" }}>
                {running()!.failed} failed
              </span>
            </Show>
          </span>
        </Show>
        <div class="flex-1" />
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "color-mix(in srgb, var(--accent-green) 15%, transparent)",
            color: "var(--accent-green)",
            border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
            "font-weight": "500",
          }}
          onClick={() => setConfirm({ kind: "approve" })}
          title="Approve selected (A)"
          disabled={count() === 0}
        >
          Approve
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
            color: "var(--accent-red)",
            border: "1px solid color-mix(in srgb, var(--accent-red) 28%, transparent)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
            "font-weight": "500",
          }}
          onClick={() => setConfirm({ kind: "request_changes" })}
          title="Request changes (R)"
          disabled={count() === 0}
        >
          Request changes
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={() => setConfirm({ kind: "comment" })}
          title="Comment on all"
        >
          Comment
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={() => setConfirm({ kind: "polish" })}
          title="Queue polish (P)"
        >
          Polish
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={() => setConfirm({ kind: "close_duplicate" })}
          title="Close as duplicate (D)"
        >
          Close as duplicate
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "var(--accent-primary)",
            color: "#fff",
            border: "none",
            cursor: count() >= 2 ? "pointer" : "not-allowed",
            "font-size": "calc(var(--ui-font-size) - 3px)",
            "font-weight": "500",
            opacity: count() >= 2 ? 1 : 0.6,
          }}
          onClick={() => setConfirm({ kind: "consolidate" })}
          disabled={count() < 2}
          title="Consolidate (C) — requires 2+ selected"
        >
          Consolidate
        </button>
        <button
          class="px-2 py-1 rounded"
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            "font-size": "calc(var(--ui-font-size) - 3px)",
          }}
          onClick={() => clearSelection()}
          title="Clear selection (Esc)"
        >
          Clear
        </button>
      </div>

      <Show when={confirm()}>
        <div
          class="fixed inset-0 flex items-center justify-center"
          style={{ background: "color-mix(in srgb, #000 40%, transparent)", "z-index": "2000" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div
            class="rounded-lg flex flex-col gap-3 p-4"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              width: "min(520px, 90vw)",
              "box-shadow": "0 16px 32px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
              {showing()!.title}
            </div>
            <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              {count()} PR{count() === 1 ? "" : "s"} selected.
            </div>

            <Show when={["approve", "request_changes", "comment"].includes(confirm()!.kind)}>
              <textarea
                class="rounded p-2 outline-none"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  "min-height": "80px",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                  "font-family": "inherit",
                  resize: "vertical",
                }}
                placeholder="Optional message body..."
                value={noteBody()}
                onInput={(e) => setNoteBody(e.currentTarget.value)}
              />
            </Show>

            <Show when={confirm()!.kind === "polish"}>
              <div class="flex gap-1">
                {(["minimal", "standard", "aggressive", "security"] as const).map((m) => (
                  <button
                    class="flex-1 px-2 py-1 rounded"
                    style={{
                      background: polishMode() === m ? "var(--accent-primary)" : "var(--bg-base)",
                      color: polishMode() === m ? "#fff" : "var(--text-primary)",
                      border: "1px solid var(--border-default)",
                      cursor: "pointer",
                      "font-size": "calc(var(--ui-font-size) - 3px)",
                    }}
                    onClick={() => setPolishMode(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Show>

            <Show when={confirm()!.kind === "close_duplicate"}>
              <input
                type="number"
                class="rounded px-2 py-1 outline-none"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                }}
                placeholder="Consolidated-into PR number (e.g. 42)"
                value={dupTarget()}
                onInput={(e) => setDupTarget(e.currentTarget.value)}
              />
              <input
                type="text"
                class="rounded px-2 py-1 outline-none"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                }}
                placeholder="Reason (required)"
                value={dupReason()}
                onInput={(e) => setDupReason(e.currentTarget.value)}
              />
            </Show>

            <Show when={confirm()!.kind === "consolidate"}>
              <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
                Opens the consolidation workspace. Originals are not closed until you confirm inside.
              </div>
            </Show>

            <div class="flex items-center justify-end gap-2">
              <button
                class="px-3 py-1.5 rounded"
                style={{
                  background: "transparent",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                }}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                class="px-3 py-1.5 rounded"
                style={{
                  background: showing()!.color,
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                  "font-weight": "500",
                }}
                disabled={
                  confirm()!.kind === "close_duplicate" &&
                  (!dupTarget() || !dupReason().trim())
                }
                onClick={runConfirm}
              >
                {showing()!.primary}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </Show>
  );
};

export default BulkActionBar;
