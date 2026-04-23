import { Component, Show, createMemo, createSignal } from "solid-js";
import { gitClone, type CloneDepth } from "../../lib/tauri";

function deriveSlug(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  const last = trimmed.split(/[/:]/).pop() ?? "";
  return last.replace(/\.git$/, "");
}

const CloneRepoModal: Component<{
  onClose: () => void;
  onDone: (path: string) => void;
}> = (props) => {
  const [url, setUrl] = createSignal("");
  const [parent, setParent] = createSignal("");
  const [folderName, setFolderName] = createSignal("");
  const [depth, setDepth] = createSignal<CloneDepth>("shallow");
  const [cloning, setCloning] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const autoSlug = createMemo(() => deriveSlug(url()));
  const effectiveFolderName = () => (folderName().trim() ? folderName().trim() : autoSlug());
  const targetPath = () => {
    const p = parent().trim();
    const n = effectiveFolderName();
    if (!p || !n) return "";
    return p.replace(/\/+$/, "") + "/" + n;
  };

  async function pickParent() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose folder to clone into",
      });
      if (typeof selected === "string") setParent(selected);
    } catch {
      // dialog plugin unavailable — leave manual entry
    }
  }

  async function doClone() {
    setError(null);
    const u = url().trim();
    const p = parent().trim();
    if (!u) return setError("Enter a git URL.");
    if (!p) return setError("Pick a parent folder to clone into.");
    setCloning(true);
    try {
      const result = await gitClone(u, p, folderName().trim() || undefined, depth());
      props.onDone(result.target_path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloning(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (!cloning()) props.onClose();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      doClone();
    }
  }

  return (
    <div
      class="fixed inset-0 flex items-center justify-center"
      style={{
        background: "color-mix(in srgb, #000 45%, transparent)",
        "z-index": "9500",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !cloning()) props.onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        class="rounded-lg flex flex-col"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          width: "min(560px, 92vw)",
          "box-shadow": "0 20px 40px rgba(0,0,0,0.3)",
        }}
      >
        <div
          class="flex items-center justify-between px-4 py-2 shrink-0"
          style={{ "border-bottom": "1px solid var(--border-default)" }}
        >
          <div style={{ "font-size": "calc(var(--ui-font-size) - 1px)", "font-weight": "600" }}>
            Clone a repository
          </div>
          <button
            class="flex items-center justify-center"
            style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            onClick={() => !cloning() && props.onClose()}
            disabled={cloning()}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="flex flex-col gap-3 px-4 py-3">
          <div class="flex flex-col gap-1">
            <label style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Repository URL
            </label>
            <input
              type="text"
              class="outline-none rounded px-2 py-1.5"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "font-family": "var(--font-mono, monospace)",
              }}
              placeholder="https://github.com/org/repo.git"
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              disabled={cloning()}
              autofocus
            />
          </div>

          <div class="flex flex-col gap-1">
            <label style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Parent folder
            </label>
            <div class="flex items-center gap-2">
              <input
                type="text"
                class="flex-1 outline-none rounded px-2 py-1.5"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                  "font-family": "var(--font-mono, monospace)",
                }}
                placeholder="/Users/you/Code"
                value={parent()}
                onInput={(e) => setParent(e.currentTarget.value)}
                disabled={cloning()}
              />
              <button
                class="rounded px-3 py-1.5"
                style={{
                  background: "var(--bg-base)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  cursor: "pointer",
                  "font-size": "calc(var(--ui-font-size) - 2px)",
                }}
                onClick={pickParent}
                disabled={cloning()}
              >
                Browse...
              </button>
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Folder name (optional)
            </label>
            <input
              type="text"
              class="outline-none rounded px-2 py-1.5"
              style={{
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                "font-size": "calc(var(--ui-font-size) - 2px)",
                "font-family": "var(--font-mono, monospace)",
              }}
              placeholder={autoSlug() || "derived-from-url"}
              value={folderName()}
              onInput={(e) => setFolderName(e.currentTarget.value)}
              disabled={cloning()}
            />
          </div>

          <div class="flex flex-col gap-1">
            <label style={{ "font-size": "calc(var(--ui-font-size) - 3px)", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.04em" }}>
              Clone depth
            </label>
            <div class="flex gap-1">
              {(
                [
                  { id: "shallow", label: "Shallow", hint: "fastest · ~30s for huge repos" },
                  { id: "single", label: "Single branch", hint: "default branch history" },
                  { id: "full", label: "Full", hint: "all branches + history" },
                ] as { id: CloneDepth; label: string; hint: string }[]
              ).map((opt) => (
                <button
                  class="flex-1 rounded px-2 py-1.5 text-left"
                  style={{
                    background: depth() === opt.id ? "color-mix(in srgb, var(--accent-primary) 15%, transparent)" : "var(--bg-base)",
                    color: depth() === opt.id ? "var(--accent-primary)" : "var(--text-primary)",
                    border: depth() === opt.id ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
                    cursor: cloning() ? "not-allowed" : "pointer",
                    "font-size": "calc(var(--ui-font-size) - 3px)",
                  }}
                  onClick={() => setDepth(opt.id)}
                  disabled={cloning()}
                >
                  <div style={{ "font-weight": "500" }}>{opt.label}</div>
                  <div style={{ color: "var(--text-muted)", "font-size": "calc(var(--ui-font-size) - 4px)" }}>
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
            <div style={{ "font-size": "calc(var(--ui-font-size) - 3.5px)", color: "var(--text-muted)", "margin-top": "2px" }}>
              Review mode works fine with shallow clones. Use Full only if you need local history for `git blame`.
            </div>
          </div>

          <Show when={targetPath()}>
            <div
              class="rounded px-2 py-1.5"
              style={{
                background: "var(--bg-base)",
                border: "1px dashed var(--border-default)",
                "font-family": "var(--font-mono, monospace)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                color: "var(--text-secondary)",
              }}
            >
              Clone to: {targetPath()}
            </div>
          </Show>

          <Show when={error()}>
            <div
              class="rounded px-2 py-1.5"
              style={{
                background: "color-mix(in srgb, var(--accent-red) 12%, transparent)",
                color: "var(--accent-red)",
                "font-size": "calc(var(--ui-font-size) - 3px)",
                "white-space": "pre-wrap",
              }}
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
              cursor: cloning() ? "not-allowed" : "pointer",
              "font-size": "calc(var(--ui-font-size) - 2px)",
            }}
            onClick={() => !cloning() && props.onClose()}
            disabled={cloning()}
          >
            Cancel
          </button>
          <button
            class="px-3 py-1.5 rounded"
            style={{
              background: "var(--accent-primary)",
              color: "#fff",
              border: "none",
              cursor: cloning() ? "wait" : "pointer",
              "font-size": "calc(var(--ui-font-size) - 2px)",
              "font-weight": "500",
              opacity: cloning() || !url() || !parent() ? 0.7 : 1,
            }}
            onClick={doClone}
            disabled={cloning() || !url() || !parent()}
            title="Clone (Cmd+Enter)"
          >
            {cloning() ? "Cloning..." : "Clone"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CloneRepoModal;
