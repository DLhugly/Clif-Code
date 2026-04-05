import { Component, Show, For, createSignal, createEffect } from "solid-js";
import type { FileEntry } from "../../types/files";
import { openFile, toggleDir, isDirExpanded, loadDirectory, refreshFileTree, openPreview } from "../../stores/fileStore";
import { renameEntry, deleteEntry, createFile, createDir, revealPath } from "../../lib/tauri";
import ContextMenu, { type ContextMenuItem } from "./ContextMenu";

function getExtensionColor(ext: string | null): string {
  if (!ext) return "#6b7280"; // gray
  const colorMap: Record<string, string> = {
    ts: "#3b82f6",
    tsx: "#3b82f6",
    js: "#eab308",
    jsx: "#eab308",
    rs: "#f97316",
    py: "#22c55e",
    json: "#eab308",
    css: "#a855f7",
    scss: "#a855f7",
    html: "#ef4444",
    md: "#7dd3fc",
  };
  return colorMap[ext.toLowerCase()] || "#6b7280";
}

function getParentDir(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const parts = path.split(sep);
  parts.pop();
  return parts.join(sep);
}

// Icons
const NewFileIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="12" y1="18" x2="12" y2="12" />
    <line x1="9" y1="15" x2="15" y2="15" />
  </svg>
);

const NewFolderIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 10v6M9 13h6" />
    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
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

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  searchQuery?: string;
}

const FileTreeItem: Component<FileTreeItemProps> = (props) => {
  const [children, setChildren] = createSignal<FileEntry[]>([]);
  const [loaded, setLoaded] = createSignal(false);
  const [isHovered, setIsHovered] = createSignal(false);

  // Context menu
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number } | null>(null);

  // Inline rename
  const [isRenaming, setIsRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal("");

  // Inline create (new file/folder inside this directory)
  const [isCreating, setIsCreating] = createSignal<"file" | "folder" | null>(null);
  const [createValue, setCreateValue] = createSignal("");

  // Drag and drop
  const [isDragOver, setIsDragOver] = createSignal(false);

  createEffect(() => {
    if (props.entry.is_dir && isDirExpanded(props.entry.path) && !loaded()) {
      loadDirectory(props.entry.path).then((entries) => {
        setChildren(entries);
        setLoaded(true);
      });
    }
  });

  function handleClick() {
    if (isRenaming()) return;
    if (props.entry.is_dir) {
      toggleDir(props.entry.path);
      if (!loaded()) {
        loadDirectory(props.entry.path).then((entries) => {
          setChildren(entries);
          setLoaded(true);
        });
      }
    } else {
      openFile(props.entry.path);
    }
  }

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function startRename() {
    setRenameValue(props.entry.name);
    setIsRenaming(true);
  }

  async function commitRename() {
    if (!isRenaming()) return; // guard against double-fire from Enter + blur
    const newName = renameValue().trim();
    setIsRenaming(false);
    if (!newName || newName === props.entry.name) return;

    const parentDir = getParentDir(props.entry.path);
    const sep = props.entry.path.includes("\\") ? "\\" : "/";
    const newPath = parentDir + sep + newName;

    try {
      await renameEntry(props.entry.path, newPath);
      await refreshFileTree();
    } catch (e) {
      console.error("Rename failed:", e);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${props.entry.name}"${props.entry.is_dir ? " and all its contents" : ""}?`
    );
    if (!confirmed) return;

    try {
      await deleteEntry(props.entry.path);
      await refreshFileTree();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  function startCreateFile() {
    if (props.entry.is_dir) {
      // Expand folder first
      if (!isDirExpanded(props.entry.path)) toggleDir(props.entry.path);
      setCreateValue("");
      setIsCreating("file");
    }
  }

  function startCreateFolder() {
    if (props.entry.is_dir) {
      if (!isDirExpanded(props.entry.path)) toggleDir(props.entry.path);
      setCreateValue("");
      setIsCreating("folder");
    }
  }

  async function commitCreate() {
    if (!isCreating()) return; // guard against double-fire from Enter + blur
    const name = createValue().trim();
    const type = isCreating();
    setIsCreating(null);
    if (!name || !type) return;

    const sep = props.entry.path.includes("\\") ? "\\" : "/";
    const newPath = props.entry.path + sep + name;

    try {
      if (type === "file") {
        await createFile(newPath);
      } else {
        await createDir(newPath);
      }
      await refreshFileTree();
      // Reload children
      const entries = await loadDirectory(props.entry.path);
      setChildren(entries);
      setLoaded(true);
    } catch (e) {
      console.error(`Create ${type} failed:`, e);
    }
  }

  // Drag and drop handlers
  function handleDragStart(e: DragEvent) {
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", props.entry.path);
      e.dataTransfer.setData("application/x-clif-entry", JSON.stringify({
        path: props.entry.path,
        name: props.entry.name,
        is_dir: props.entry.is_dir,
      }));
    }
  }

  function handleDragOver(e: DragEvent) {
    if (!props.entry.is_dir) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.stopPropagation();
    setIsDragOver(false);
  }

  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!props.entry.is_dir || !e.dataTransfer) return;

    const sourceData = e.dataTransfer.getData("application/x-clif-entry");
    if (!sourceData) return;

    const source = JSON.parse(sourceData) as { path: string; name: string; is_dir: boolean };

    // Don't drop on itself or into its own subtree
    if (source.path === props.entry.path) return;
    if (props.entry.path.startsWith(source.path + "/") || props.entry.path.startsWith(source.path + "\\")) return;

    const sep = props.entry.path.includes("\\") ? "\\" : "/";
    const destPath = props.entry.path + sep + source.name;

    // Don't move if destination is the same
    if (source.path === destPath) return;

    try {
      await renameEntry(source.path, destPath);
      await refreshFileTree();
      // Reload this folder's children
      const entries = await loadDirectory(props.entry.path);
      setChildren(entries);
    } catch (e) {
      console.error("Move failed:", e);
    }
  }

  function getContextMenuItems(): ContextMenuItem[] {
    const items: ContextMenuItem[] = [];

    if (props.entry.is_dir) {
      items.push({
        label: "New File",
        icon: NewFileIcon,
        action: startCreateFile,
      });
      items.push({
        label: "New Folder",
        icon: NewFolderIcon,
        action: startCreateFolder,
      });
    }

    items.push({
      label: "Reveal in Finder",
      action: () => revealPath(props.entry.path),
      separator: props.entry.is_dir,
    });

    // Add Preview option for markdown files
    if (!props.entry.is_dir && props.entry.name.endsWith(".md")) {
      items.push({
        label: "Preview Markdown",
        action: () => openPreview(props.entry.path),
      });
    }

    items.push({
      label: "Rename",
      icon: RenameIcon,
      action: startRename,
    });
    items.push({
      label: "Delete",
      icon: DeleteIcon,
      action: handleDelete,
      danger: true,
    });

    return items;
  }

  return (
    <div>
      {/* Main row */}
      <div
        class="flex items-center cursor-pointer select-none"
        style={{
          "padding-left": `${props.depth * 16}px`,
          "padding-right": "8px",
          height: "24px",
          "font-size": "13px",
          color: "var(--text-primary)",
          background: isDragOver()
            ? "var(--accent-blue)22"
            : isHovered()
              ? "var(--bg-hover)"
              : "transparent",
          "border": isDragOver() ? "1px solid var(--accent-blue)" : "1px solid transparent",
          "border-radius": isDragOver() ? "3px" : "0",
        }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={!isRenaming()}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Show when={props.entry.is_dir}>
          {/* Chevron */}
          <span
            class="flex items-center justify-center shrink-0 transition-transform duration-150"
            style={{
              width: "16px",
              height: "16px",
              transform: isDirExpanded(props.entry.path) ? "rotate(90deg)" : "rotate(0deg)",
              color: "var(--text-muted)",
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3 2 L7 5 L3 8 Z" />
            </svg>
          </span>
          {/* Folder icon */}
          <span
            class="flex items-center justify-center shrink-0 mr-1"
            style={{ width: "16px", height: "16px", color: "#e2b340" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
            </svg>
          </span>
        </Show>

        <Show when={!props.entry.is_dir}>
          {/* Spacer for alignment with folders */}
          <span class="shrink-0" style={{ width: "16px" }} />
          {/* File type color dot */}
          <span
            class="shrink-0 rounded-full mr-1.5"
            style={{
              width: "8px",
              height: "8px",
              background: getExtensionColor(props.entry.extension),
            }}
          />
        </Show>

        {/* Name — editable when renaming */}
        <Show
          when={isRenaming()}
          fallback={
            <span class="truncate" title={props.entry.name}>
              {props.entry.name}
            </span>
          }
        >
          <input
            class="flex-1 min-w-0 outline-none rounded px-1"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-blue)",
              "font-size": "12px",
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
              // Auto-focus and select filename (without extension for files)
              setTimeout(() => {
                el.focus();
                if (!props.entry.is_dir && props.entry.extension) {
                  const dotIdx = el.value.lastIndexOf(".");
                  if (dotIdx > 0) {
                    el.setSelectionRange(0, dotIdx);
                    return;
                  }
                }
                el.select();
              }, 0);
            }}
          />
        </Show>
      </div>

      {/* Inline create input (appears as first child when creating inside this folder) */}
      <Show when={isCreating()}>
        <div
          class="flex items-center"
          style={{
            "padding-left": `${(props.depth + 1) * 16}px`,
            "padding-right": "8px",
            height: "24px",
          }}
        >
          <span
            class="flex items-center justify-center shrink-0 mr-1"
            style={{ width: "16px", height: "16px", color: "var(--text-muted)" }}
          >
            {isCreating() === "folder" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#e2b340" stroke="none">
                <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
              </svg>
            ) : (
              <span
                class="rounded-full"
                style={{ width: "8px", height: "8px", background: "#6b7280" }}
              />
            )}
          </span>
          <input
            class="flex-1 min-w-0 outline-none rounded px-1"
            style={{
              background: "var(--bg-base)",
              color: "var(--text-primary)",
              border: "1px solid var(--accent-blue)",
              "font-size": "12px",
              height: "20px",
              "font-family": "var(--font-sans)",
            }}
            placeholder={isCreating() === "folder" ? "folder name" : "file name"}
            value={createValue()}
            onInput={(e) => setCreateValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreate();
              if (e.key === "Escape") setIsCreating(null);
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitCreate}
            ref={(el) => setTimeout(() => el.focus(), 0)}
          />
        </div>
      </Show>

      {/* Children (recursive) */}
      <Show when={props.entry.is_dir && isDirExpanded(props.entry.path)}>
        <For each={children().filter((child) => {
          const q = props.searchQuery?.toLowerCase();
          if (!q) return true;
          return child.name.toLowerCase().includes(q) || child.is_dir;
        })}>
          {(child) => <FileTreeItem entry={child} depth={props.depth + 1} searchQuery={props.searchQuery} />}
        </For>
      </Show>

      {/* Context menu portal */}
      <Show when={contextMenu()}>
        <ContextMenu
          x={contextMenu()!.x}
          y={contextMenu()!.y}
          items={getContextMenuItems()}
          onClose={() => setContextMenu(null)}
        />
      </Show>
    </div>
  );
};

export default FileTreeItem;
