import { Component, Show, createSignal } from "solid-js";
import { projectRoot, openDiff, refreshFileTree } from "../../stores/fileStore";
import { revealPath, renameEntry, deleteEntry } from "../../lib/tauri";
import { refreshGitStatus, fileNumstats } from "../../stores/gitStore";
import ContextMenu, { type ContextMenuItem } from "../explorer/ContextMenu";

/* ── Inline icons (tiny, not worth a separate file) ───────────────── */

export const PlusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const MinusIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const RenameIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
);

const DeleteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
);

/* ── Helpers ───────────────────────────────────────────────────────── */

export function getStatusColor(status: string): string {
  switch (status) {
    case "modified": return "var(--accent-yellow)";
    case "added": case "new": return "var(--accent-green)";
    case "deleted": return "var(--accent-red)";
    case "renamed": return "var(--accent-blue)";
    case "untracked": return "var(--accent-green)";
    default: return "var(--text-muted)";
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case "modified": return "M";
    case "added": case "new": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "untracked": return "U";
    default: return "?";
  }
}

/* ── FileRow component ────────────────────────────────────────────── */

const FileRow: Component<{
  file: { path: string; status: string; staged: boolean };
  onAction: () => void;
  actionIcon: "stage" | "unstage";
}> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  const [ctxMenu, setCtxMenu] = createSignal<{ x: number; y: number } | null>(null);
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal("");

  const fileName = () => {
    const parts = props.file.path.split("/");
    return parts[parts.length - 1];
  };

  const dirPath = () => {
    const parts = props.file.path.split("/");
    if (parts.length <= 1) return "";
    return parts.slice(0, -1).join("/") + "/";
  };

  const fullPath = () => {
    const root = projectRoot();
    return root ? root + "/" + props.file.path : props.file.path;
  };

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleDelete() {
    const confirmed = window.confirm(`Delete "${fileName()}"?`);
    if (!confirmed) return;
    try {
      await deleteEntry(fullPath());
      await refreshFileTree();
      refreshGitStatus();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  function startRename() {
    setRenameValue(fileName());
    setIsRenaming(true);
  }

  async function commitRename() {
    if (!isRenaming()) return;
    const newName = renameValue().trim();
    setIsRenaming(false);
    if (!newName || newName === fileName()) return;

    const fp = fullPath();
    const sep = fp.includes("\\") ? "\\" : "/";
    const parts = fp.split(sep);
    parts.pop();
    const newPath = parts.join(sep) + sep + newName;

    try {
      await renameEntry(fp, newPath);
      await refreshFileTree();
      refreshGitStatus();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  }

  function getContextMenuItems(): ContextMenuItem[] {
    return [
      {
        label: "Reveal in Finder",
        action: () => revealPath(fullPath()),
      },
      {
        label: "Rename",
        icon: RenameIcon,
        action: startRename,
        separator: true,
      },
      {
        label: "Delete",
        icon: DeleteIcon,
        action: handleDelete,
        danger: true,
      },
    ];
  }

  return (
    <>
      <div
        class="flex items-center gap-1 px-2 py-0.5 cursor-pointer"
        style={{
          color: "var(--text-primary)",
          background: hovered() ? "var(--bg-hover)" : "transparent",
        }}
        onMouseEnter={() => !ctxMenu() && setHovered(true)}
        onMouseLeave={() => !ctxMenu() && setHovered(false)}
        onContextMenu={handleContextMenu}
        onClick={() => {
          if (isRenaming()) return;
          const root = projectRoot();
          if (root && props.file.status !== "deleted") {
            openDiff(root + "/" + props.file.path, root);
          }
        }}
      >
        <span
          class="shrink-0 font-mono font-bold"
          style={{
            color: getStatusColor(props.file.status),
            width: "14px",
            "text-align": "center",
            "font-size": "0.85em",
          }}
        >
          {getStatusLabel(props.file.status)}
        </span>
        <Show when={isRenaming()} fallback={
          <span class="truncate flex-1 min-w-0" title={props.file.path}>
            <span style={{ color: "var(--text-muted)" }}>{dirPath()}</span>
            {fileName()}
          </span>
        }>
          <span style={{ color: "var(--text-muted)" }}>{dirPath()}</span>
          <input
            class="flex-1 min-w-0 outline-none rounded px-1"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-blue)",
              "font-size": "inherit",
              height: "20px",
              "font-family": "var(--font-sans)",
            }}
            value={renameValue()}
            onInput={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setIsRenaming(false);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            ref={(el) => {
              setTimeout(() => {
                el.focus();
                const dotIdx = el.value.lastIndexOf(".");
                if (dotIdx > 0) {
                  el.setSelectionRange(0, dotIdx);
                } else {
                  el.select();
                }
              }, 0);
            }}
          />
        </Show>
        {(() => {
          const stats = fileNumstats().get(props.file.path);
          if (!stats || (stats.insertions < 0 && stats.deletions < 0)) return null;
          return (
            <span class="shrink-0 flex items-center gap-1 font-mono" style={{ "font-size": "0.8em" }}>
              <Show when={stats.insertions > 0}>
                <span style={{ color: "var(--accent-green)" }}>+{stats.insertions}</span>
              </Show>
              <Show when={stats.deletions > 0}>
                <span style={{ color: "var(--accent-red)" }}>-{stats.deletions}</span>
              </Show>
              <Show when={stats.insertions === 0 && stats.deletions === 0}>
                <span style={{ color: "var(--text-muted)" }}>0</span>
              </Show>
            </span>
          );
        })()}
        <Show when={hovered() && !isRenaming()}>
          <button
            class="shrink-0 flex items-center justify-center rounded"
            style={{
              width: "18px",
              height: "18px",
              color: "var(--text-secondary)",
              background: "var(--bg-active)",
            }}
            onClick={(e) => {
              e.stopPropagation();
              props.onAction();
            }}
            title={props.actionIcon === "stage" ? "Stage file" : "Unstage file"}
          >
            {props.actionIcon === "stage" ? <PlusIcon /> : <MinusIcon />}
          </button>
        </Show>
      </div>
      <Show when={ctxMenu()}>
        <ContextMenu
          x={ctxMenu()!.x}
          y={ctxMenu()!.y}
          items={getContextMenuItems()}
          onClose={() => setCtxMenu(null)}
        />
      </Show>
    </>
  );
};

export default FileRow;
