import { Component, For, Show, createResource, createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { projectRoot } from "../../stores/fileStore";
import type { AuditEntry } from "../../types/audit";

function formatRelative(ts: string): string {
  const n = Number(ts);
  if (!Number.isFinite(n)) return ts;
  const delta = Math.floor(Date.now() / 1000) - n;
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

function actionColor(action: string): string {
  if (action.includes("violation")) return "var(--accent-red)";
  if (action.includes("polish")) return "var(--accent-blue)";
  if (action.includes("consolidated")) return "var(--accent-primary)";
  if (action.includes("closed")) return "var(--accent-muted, var(--text-muted))";
  if (action.includes("posted")) return "var(--accent-green)";
  if (action.includes("sent")) return "var(--accent-green)";
  if (action.includes("drafted")) return "var(--accent-yellow)";
  return "var(--text-muted)";
}

const AuditLog: Component<{ onClose: () => void }> = (props) => {
  const [actorFilter, setActorFilter] = createSignal("");
  const [actionFilter, setActionFilter] = createSignal("");
  const [expanded, setExpanded] = createSignal<string | null>(null);
  const [exportMsg, setExportMsg] = createSignal<string | null>(null);

  const [entries, { refetch }] = createResource(
    () => ({ root: projectRoot(), actor: actorFilter(), action: actionFilter() }),
    async ({ root, actor, action }) => {
      if (!root) return [] as AuditEntry[];
      return invoke<AuditEntry[]>("audit_list", {
        workspaceDir: root,
        limit: 500,
        actor: actor || null,
        action: action || null,
      });
    },
  );

  async function doExport(format: "json" | "csv") {
    const root = projectRoot();
    if (!root) return;
    try {
      const path = await invoke<string>("audit_export", { workspaceDir: root, format });
      setExportMsg(`Exported to ${path}`);
    } catch (e) {
      setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
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
          width: "min(840px, 92vw)",
          height: "min(640px, 85vh)",
          "box-shadow": "0 20px 40px rgba(0,0,0,0.25)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div class="flex items-center gap-2">
            <span style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
              Audit log
            </span>
            <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2.5px)" }}>
              ({entries()?.length ?? 0} entries)
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="px-2 py-1 rounded"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                cursor: "pointer",
                "font-size": "calc(var(--ui-font-size) - 3px)",
              }}
              onClick={() => refetch()}
            >
              Refresh
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
              onClick={() => doExport("csv")}
            >
              Export CSV
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
              onClick={() => doExport("json")}
            >
              Export JSON
            </button>
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
        </div>

        <div class="flex items-center gap-2 px-4 py-2 shrink-0" style={{ "border-bottom": "1px solid var(--border-muted)" }}>
          <input
            type="text"
            class="outline-none rounded px-2 py-1"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              flex: "1",
            }}
            placeholder="Filter by actor..."
            value={actorFilter()}
            onInput={(e) => setActorFilter(e.currentTarget.value)}
          />
          <input
            type="text"
            class="outline-none rounded px-2 py-1"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
              flex: "1",
            }}
            placeholder="Filter by action..."
            value={actionFilter()}
            onInput={(e) => setActionFilter(e.currentTarget.value)}
          />
        </div>

        <div class="flex-1 min-h-0 overflow-auto">
          <Show when={entries.loading}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              Loading...
            </div>
          </Show>
          <Show when={!entries.loading && (entries() ?? []).length === 0}>
            <div class="p-4" style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 2px)" }}>
              No audit entries yet. Actions you take in Review mode will appear here.
            </div>
          </Show>
          <For each={entries() ?? []}>
            {(e, i) => {
              const key = `${e.ts}-${i()}`;
              return (
                <div
                  style={{
                    "border-bottom": "1px solid var(--border-muted)",
                    padding: "8px 16px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(expanded() === key ? null : key)}
                >
                  <div class="flex items-center gap-2" style={{ "font-size": "calc(var(--ui-font-size) - 2px)" }}>
                    <span
                      class="px-1.5 rounded"
                      style={{
                        background: `color-mix(in srgb, ${actionColor(e.action)} 14%, transparent)`,
                        color: actionColor(e.action),
                        "font-weight": "500",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                      }}
                    >
                      {e.action}
                    </span>
                    <Show when={e.pr_numbers.length > 0}>
                      <span style={{ color: "var(--accent-primary)", "font-family": "var(--font-mono, monospace)" }}>
                        {e.pr_numbers.map((n) => `#${n}`).join(", ")}
                      </span>
                    </Show>
                    <span class="flex-1" style={{ color: "var(--text-muted)" }}>
                      by {e.actor}
                    </span>
                    <span style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 3.5px)" }}>
                      {formatRelative(e.ts)}
                    </span>
                  </div>
                  <Show when={expanded() === key}>
                    <pre
                      class="rounded p-2 mt-2"
                      style={{
                        background: "var(--bg-base)",
                        border: "1px solid var(--border-default)",
                        "font-size": "calc(var(--ui-font-size) - 3px)",
                        "font-family": "var(--font-mono, monospace)",
                        "white-space": "pre-wrap",
                        color: "var(--text-secondary)",
                        "max-height": "200px",
                        overflow: "auto",
                      }}
                    >
                      {JSON.stringify(e, null, 2)}
                    </pre>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <Show when={exportMsg()}>
          <div
            class="px-4 py-2 shrink-0"
            style={{
              "border-top": "1px solid var(--border-default)",
              color: "var(--text-muted)",
              "font-size": "calc(var(--ui-font-size) - 3px)",
            }}
          >
            {exportMsg()}
          </div>
        </Show>
      </div>
    </div>
  );
};

export default AuditLog;
