import { Component, For, Show, createSignal } from "solid-js";
import { fileTree, projectRoot, refreshFileTree } from "../../stores/fileStore";
import { createFile, createDir, renameEntry } from "../../lib/tauri";
import FileTreeItem from "./FileTreeItem";

const FileTree: Component<{ onOpenFolder?: () => void; creatingType?: "file" | "folder" | null; onCreateDone?: () => void }> = (props) => {
  const [isDragOver, setIsDragOver] = createSignal(false);

  // Handle drop on empty area (move to project root)
  async function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);

    const root = projectRoot();
    if (!root || !e.dataTransfer) return;

    const sourceData = e.dataTransfer.getData("application/x-clif-entry");
    if (!sourceData) return;

    const source = JSON.parse(sourceData) as { path: string; name: string; is_dir: boolean };
    const sep = root.includes("\\") ? "\\" : "/";
    const destPath = root + sep + source.name;

    if (source.path === destPath) return;

    try {
      await renameEntry(source.path, destPath);
      await refreshFileTree();
    } catch (e) {
      console.error("Move to root failed:", e);
    }
  }

  async function commitRootCreate(name: string) {
    const type = props.creatingType;
    props.onCreateDone?.();
    if (!name || !type) return;

    const root = projectRoot();
    if (!root) return;

    const sep = root.includes("\\") ? "\\" : "/";
    const newPath = root + sep + name;

    try {
      if (type === "file") {
        await createFile(newPath);
      } else {
        await createDir(newPath);
      }
      await refreshFileTree();
    } catch (e) {
      console.error(`Create ${type} failed:`, e);
    }
  }

  return (
    <div
      class="flex flex-col h-full"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <Show
        when={projectRoot()}
        fallback={
          <div class="flex flex-col items-center justify-center h-full gap-4 p-4">
            <p
              class="text-sm text-center"
              style={{ color: "var(--text-muted)" }}
            >
              No folder opened
            </p>
            <button
              class="px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{
                background: "var(--accent-blue)",
                color: "#ffffff",
              }}
              onClick={() => props.onOpenFolder?.()}
            >
              Open Folder
            </button>
          </div>
        }
      >
        <div
          class="flex-1 overflow-y-auto py-1"
          style={{
            background: isDragOver() ? "var(--accent-blue)08" : "transparent",
          }}
        >
          {/* Inline create at root level */}
          <Show when={props.creatingType}>
            <div
              class="flex items-center"
              style={{
                "padding-left": "0px",
                "padding-right": "8px",
                height: "24px",
              }}
            >
              <span
                class="flex items-center justify-center shrink-0 mr-1"
                style={{ width: "16px", height: "16px" }}
              >
                {props.creatingType === "folder" ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#e2b340" stroke="none">
                    <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                  </svg>
                ) : (
                  <span
                    class="rounded-full"
                    style={{ width: "8px", height: "8px", background: "#6b7280", "margin-left": "16px" }}
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
                placeholder={props.creatingType === "folder" ? "folder name" : "file name"}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRootCreate(e.currentTarget.value.trim());
                  if (e.key === "Escape") props.onCreateDone?.();
                  e.stopPropagation();
                }}
                onBlur={(e) => commitRootCreate(e.currentTarget.value.trim())}
                ref={(el) => setTimeout(() => el.focus(), 0)}
              />
            </div>
          </Show>

          <For each={fileTree()}>
            {(entry) => <FileTreeItem entry={entry} depth={0} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default FileTree;
