import { Component, Show, For, createSignal, createMemo, lazy, Suspense } from "solid-js";
import { projectRoot, openFile, openDiff, refreshFileTree } from "../../stores/fileStore";
import { revealPath, renameEntry, deleteEntry, scanFilesSecurity } from "../../lib/tauri";
import { securityEnabled, setSecurityResults, setSecurityShowModal, securityShowModal } from "../../stores/securityStore";
import SecurityModal from "../security/SecurityModal";
import ContextMenu, { type ContextMenuItem } from "../explorer/ContextMenu";
import {
  isGitRepo, currentBranch, changedFiles, diffStat,
  stagedFiles, unstagedFiles, commitLog, fileNumstats,
  aheadBehind, isSyncing, branches, remoteUrl,
  refreshGitStatus, refreshBranches, stageFile, unstageFile, stageAll, unstageAll, commitChanges, initializeRepo,
  switchBranch, createBranch, fetchRemote, pullRemote, pushRemote,
} from "../../stores/gitStore";
import { open } from "@tauri-apps/plugin-shell";
import type { GitLogEntry } from "../../types/git";

const FileTree = lazy(() => import("../explorer/FileTree"));

type SidebarTab = "files" | "git";

const GitBranchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

const PlusIcon = () => (
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

function getStatusColor(status: string): string {
  switch (status) {
    case "modified": return "var(--accent-yellow)";
    case "added": case "new": return "var(--accent-green)";
    case "deleted": return "var(--accent-red)";
    case "renamed": return "var(--accent-blue)";
    case "untracked": return "var(--accent-green)";
    default: return "var(--text-muted)";
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "modified": return "M";
    case "added": case "new": return "A";
    case "deleted": return "D";
    case "renamed": return "R";
    case "untracked": return "U";
    default: return "?";
  }
}

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
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
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

// Branch colors for the graph
const BRANCH_COLORS = [
  "var(--accent-blue)",
  "var(--accent-green)",
  "var(--accent-yellow)",
  "var(--accent-red)",
  "#c084fc", // purple
  "#f472b6", // pink
  "#2dd4bf", // teal
  "#fb923c", // orange
];

const GitGraphRow: Component<{
  entry: GitLogEntry;
  isLast: boolean;
  isMerge: boolean;
}> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  let rowRef: HTMLDivElement | undefined;

  const refLabels = createMemo(() => {
    return props.entry.refs.filter((r) => r !== "").map((r) => {
      const isHead = r.includes("HEAD");
      const cleaned = r.replace("HEAD -> ", "").replace("HEAD", "").trim();
      return { label: cleaned || (isHead ? "HEAD" : r), isHead };
    }).filter((r) => r.label);
  });

  return (
    <div
      ref={rowRef}
      class="git-graph-row px-2 py-1 cursor-default"
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div class="flex items-start gap-2">
        {/* Graph column */}
        <div
          class="shrink-0 flex flex-col items-center"
          style={{ width: "16px", "min-height": "28px" }}
        >
          <div style={{ width: "2px", height: "6px", background: "var(--border-default)" }} />
          <div
            style={{
              width: props.entry.is_head ? "10px" : "8px",
              height: props.entry.is_head ? "10px" : "8px",
              "border-radius": "50%",
              background: props.entry.is_head
                ? "var(--accent-blue)"
                : props.isMerge
                ? "var(--accent-yellow)"
                : "var(--text-muted)",
              border: props.entry.is_head ? "2px solid var(--accent-blue)" : "none",
              "box-shadow": props.entry.is_head ? "0 0 6px rgba(59,130,246,0.5)" : "none",
              "flex-shrink": "0",
            }}
          />
          <Show when={!props.isLast}>
            <div style={{ width: "2px", "flex-grow": "1", "min-height": "6px", background: "var(--border-default)" }} />
          </Show>
        </div>

        {/* Commit info */}
        <div class="flex-1 min-w-0 py-0.5">
          <Show when={refLabels().length > 0}>
            <div class="flex flex-wrap gap-1 mb-0.5">
              <For each={refLabels()}>
                {(ref, i) => (
                  <span
                    class="px-1 rounded font-mono"
                    style={{
                      "font-size": "0.75em", "line-height": "1.4",
                      background: ref.isHead ? "var(--accent-blue)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                      color: "#fff", opacity: ref.isHead ? "1" : "0.85",
                    }}
                  >
                    {ref.label}
                  </span>
                )}
              </For>
            </div>
          </Show>
          <div class="truncate" style={{ color: "var(--text-primary)", "font-size": "0.92em", "line-height": "1.4" }}>
            {props.entry.message}
          </div>
          <div class="flex items-center gap-2 mt-0.5" style={{ color: "var(--text-muted)", "font-size": "0.84em" }}>
            <Show when={remoteUrl()}>
              <span
                class="font-mono"
                style={{ color: "var(--accent-yellow)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "underline"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.textDecoration = "none"; }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
              >
                {props.entry.short_hash}
              </span>
            </Show>
            <Show when={!remoteUrl()}>
              <span class="font-mono" style={{ color: "var(--accent-yellow)" }}>{props.entry.short_hash}</span>
            </Show>
            <span class="truncate">{props.entry.author}</span>
            <span class="shrink-0 ml-auto">{props.entry.date}</span>
          </div>
        </div>
      </div>

      {/* Floating popup — VS Code style, appears to the left */}
      <Show when={hovered()}>
        <div
          style={{
            position: "fixed",
            right: "calc(100% - 310px + 4px)",
            "margin-top": "-4px",
            width: "260px",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            "border-radius": "8px",
            padding: "10px 12px",
            "box-shadow": "0 4px 20px rgba(0,0,0,0.35)",
            "z-index": "500",
            "font-size": "0.85em",
            "pointer-events": "none",
          }}
          onMouseEnter={() => setHovered(true)}
        >
          {/* Message */}
          <div style={{ "font-weight": "600", color: "var(--text-primary)", "margin-bottom": "8px", "line-height": "1.4", "word-break": "break-word" }}>
            {props.entry.message}
          </div>

          {/* Hash */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Hash</span>
            <Show when={remoteUrl()}
              fallback={<span class="font-mono" style={{ color: "var(--accent-yellow)", "font-size": "0.9em" }}>{props.entry.hash.slice(0, 16)}</span>}
            >
              <span
                class="font-mono"
                style={{ color: "var(--accent-yellow)", cursor: "pointer", "text-decoration": "underline", "font-size": "0.9em", "pointer-events": "all" }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
                title={`View on ${new URL(remoteUrl()!).hostname}`}
              >
                {props.entry.hash.slice(0, 16)} ↗
              </span>
            </Show>
          </div>

          {/* Author */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Author</span>
            <span style={{ color: "var(--text-primary)", "font-size": "0.9em" }}>{props.entry.author}</span>
          </div>

          {/* Date */}
          <div class="flex items-center gap-2 mb-1">
            <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em" }}>Date</span>
            <span style={{ color: "var(--text-primary)", "font-size": "0.9em" }}>{props.entry.date}</span>
          </div>

          {/* Refs */}
          <Show when={refLabels().length > 0}>
            <div class="flex items-start gap-2 mt-1 pt-1" style={{ "border-top": "1px solid var(--border-muted)" }}>
              <span style={{ color: "var(--text-muted)", "min-width": "48px", "font-size": "0.9em", "padding-top": "1px" }}>Refs</span>
              <div class="flex flex-wrap gap-1">
                <For each={refLabels()}>
                  {(ref, i) => (
                    <span
                      class="px-1 rounded font-mono"
                      style={{
                        "font-size": "0.8em", "line-height": "1.5",
                        background: ref.isHead ? "var(--accent-blue)" : BRANCH_COLORS[i() % BRANCH_COLORS.length],
                        color: "#fff",
                      }}
                    >
                      {ref.label}
                    </span>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Open on GitHub link */}
          <Show when={remoteUrl()}>
            <div
              class="mt-2 pt-1"
              style={{ "border-top": "1px solid var(--border-muted)", "pointer-events": "all" }}
            >
              <span
                style={{ color: "var(--accent-primary)", "font-size": "0.85em", cursor: "pointer", "text-decoration": "underline" }}
                onClick={(e) => { e.stopPropagation(); open(`${remoteUrl()}/commit/${props.entry.hash}`); }}
              >
                View on {new URL(remoteUrl()!).hostname} ↗
              </span>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SpinnerIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const RightSidebar: Component<{ onOpenFolder?: () => void; onOpenRecent?: (path: string) => void }> = (props) => {
  const [activeTab, setActiveTab] = createSignal<SidebarTab>("files");
  const [commitMsg, setCommitMsg] = createSignal("");
  const [pendingCommit, setPendingCommit] = createSignal(false);
  const [isCommitting, setIsCommitting] = createSignal(false);
  const [creatingType, setCreatingType] = createSignal<"file" | "folder" | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = createSignal(false);
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [newBranchName, setNewBranchName] = createSignal("");
  const [changesHeightPct, setChangesHeightPct] = createSignal(40);
  const [isDraggingGitSplitter, setIsDraggingGitSplitter] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  let gitSplitContainerRef: HTMLDivElement | undefined;

  function handleGitSplitterMouseDown(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingGitSplitter(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!gitSplitContainerRef) return;
      const rect = gitSplitContainerRef.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setChangesHeightPct(Math.max(10, Math.min(90, pct)));
    };

    const onMouseUp = () => {
      setIsDraggingGitSplitter(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  async function doCommit() {
    const msg = commitMsg().trim();
    if (!msg) return;
    setIsCommitting(true);
    try {
      await commitChanges(msg);
      setCommitMsg("");
      setPendingCommit(false);
    } catch (e) {
      console.error("Commit failed:", e);
    } finally {
      setIsCommitting(false);
    }
  }

  async function handleCommit() {
    const msg = commitMsg().trim();
    if (!msg) return;

    // Pre-commit security scan if enabled
    if (securityEnabled() && projectRoot()) {
      const root = projectRoot()!;
      const paths = stagedFiles().map((f) =>
        f.path.startsWith("/") ? f.path : `${root}/${f.path}`
      );
      if (paths.length > 0) {
        try {
          const issues = await scanFilesSecurity(paths);
          if (issues.length > 0) {
            setSecurityResults(issues);
            setPendingCommit(true);
            setSecurityShowModal(true);
            return; // Wait for user decision in modal
          }
        } catch (e) {
          console.error("Pre-commit scan failed:", e);
          // If scan fails, proceed with commit
        }
      }
    }

    await doCommit();
  }

  return (
    <div
      class="flex flex-col h-full overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        "border-left": "1px solid var(--border-default)",
        "font-size": "var(--ui-font-size)",
      }}
    >
      {/* Tab buttons */}
      <div
        class="flex shrink-0"
        style={{
          "border-bottom": "1px solid var(--border-default)",
          height: "36px",
        }}
      >
        <button
          class="flex-1 flex items-center justify-center gap-1.5 font-medium transition-colors"
          style={{
            color: activeTab() === "files" ? "var(--text-primary)" : "var(--text-muted)",
            background: activeTab() === "files" ? "var(--bg-base)" : "transparent",
            "border-bottom": activeTab() === "files" ? "2px solid var(--accent-blue)" : "2px solid transparent",
          }}
          onClick={() => setActiveTab("files")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          Files
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1.5 font-medium transition-colors"
          style={{
            color: activeTab() === "git" ? "var(--text-primary)" : "var(--text-muted)",
            background: activeTab() === "git" ? "var(--bg-base)" : "transparent",
            "border-bottom": activeTab() === "git" ? "2px solid var(--accent-blue)" : "2px solid transparent",
          }}
          onClick={() => {
            setActiveTab("git");
            refreshGitStatus();
          }}
        >
          <GitBranchIcon />
          Git
          <Show when={changedFiles.length > 0}>
            <span
              class="flex items-center justify-center rounded-full"
              style={{
                "min-width": "16px",
                height: "16px",
                "font-size": "0.78em",
                background: "var(--accent-blue)",
                color: "#fff",
                "padding-left": "4px",
                "padding-right": "4px",
              }}
            >
              {changedFiles.length}
            </span>
          </Show>
        </button>
      </div>

      {/* Panel content */}
      <div class={`min-h-0 flex-1 ${activeTab() === "git" ? "overflow-hidden flex flex-col" : "overflow-y-auto"}`}>
        <Show when={activeTab() === "files"}>
          <Show when={projectRoot()}>
            <div
              class="flex items-center justify-end shrink-0 px-2 py-1 gap-0.5"
              style={{ "border-bottom": "1px solid var(--border-muted)" }}
            >
              {/* New File */}
              <button
                class="flex items-center justify-center rounded p-1 transition-colors"
                style={{ color: "var(--text-muted)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => setCreatingType("file")}
                title="New File"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </button>
              {/* New Folder */}
              <button
                class="flex items-center justify-center rounded p-1 transition-colors"
                style={{ color: "var(--text-muted)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => setCreatingType("folder")}
                title="New Folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 10v6M9 13h6" />
                  <path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z" />
                </svg>
              </button>
              {/* Refresh */}
              <button
                class="flex items-center justify-center rounded p-1 transition-colors"
                style={{ color: "var(--text-muted)", cursor: "pointer" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => { refreshFileTree(); refreshGitStatus(); }}
                title="Refresh file tree"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                  <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                </svg>
              </button>
            </div>
          </Show>
          <Show when={projectRoot()}>
            <div class="shrink-0 px-2 py-1" style={{ "border-bottom": "1px solid var(--border-muted)" }}>
              <div class="flex items-center gap-1.5 rounded px-2 py-1" style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)" }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  class="flex-1 min-w-0 outline-none bg-transparent"
                  style={{ color: "var(--text-primary)", border: "none", "font-size": "inherit" }}
                  placeholder="Search files..."
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); (e.currentTarget as HTMLInputElement).blur(); } }}
                />
                <Show when={searchQuery()}>
                  <button
                    class="shrink-0 flex items-center justify-center"
                    style={{ color: "var(--text-muted)", cursor: "pointer" }}
                    onClick={() => setSearchQuery("")}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </Show>
              </div>
            </div>
          </Show>
          <Suspense>
            <FileTree
              onOpenFolder={props.onOpenFolder}
              onOpenRecent={props.onOpenRecent}
              creatingType={creatingType()}
              onCreateDone={() => setCreatingType(null)}
              searchQuery={searchQuery()}
            />
          </Suspense>
        </Show>

        <Show when={activeTab() === "git"}>
          <div class="flex flex-col flex-1 min-h-0">
            <Show when={isGitRepo()} fallback={
              <div class="flex flex-col items-center justify-center h-full gap-3 p-4">
                <GitBranchIcon />
                <p class="text-center" style={{ color: "var(--text-muted)" }}>
                  {projectRoot() ? "Not a git repository" : "Open a folder first"}
                </p>
                <Show when={projectRoot()}>
                  <button
                    class="px-3 py-1.5 rounded font-medium transition-colors"
                    style={{
                      background: "var(--accent-blue)",
                      color: "#fff",
                      cursor: "pointer",
                    }}
                    onClick={async () => {
                      try {
                        await initializeRepo();
                      } catch (e) {
                        console.error("Failed to initialize git:", e);
                      }
                    }}
                  >
                    Initialize Git Repository
                  </button>
                </Show>
              </div>
            }>
              {/* Branch picker */}
              <div
                class="shrink-0 px-3 py-2 relative"
                style={{ "border-bottom": "1px solid var(--border-muted)" }}
              >
                <button
                  class="flex items-center gap-2 w-full rounded px-1.5 py-1 transition-colors"
                  style={{
                    color: "var(--text-primary)",
                    background: branchDropdownOpen() ? "var(--bg-hover)" : "transparent",
                    cursor: "pointer",
                    border: "none",
                    "font-size": "inherit",
                    "font-family": "inherit",
                  }}
                  onMouseEnter={(e) => { if (!branchDropdownOpen()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { if (!branchDropdownOpen()) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  onClick={() => {
                    setBranchDropdownOpen(!branchDropdownOpen());
                    setCreatingBranch(false);
                    setNewBranchName("");
                  }}
                >
                  <GitBranchIcon />
                  <span class="font-mono truncate font-medium flex-1 text-left">
                    {currentBranch() || "main"}
                  </span>
                  <ChevronDownIcon />
                </button>

                {/* Branch dropdown */}
                <Show when={branchDropdownOpen()}>
                  <div
                    class="absolute left-2 right-2 rounded shadow-lg overflow-hidden z-50"
                    style={{
                      top: "100%",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      "max-height": "200px",
                      "overflow-y": "auto",
                    }}
                  >
                    <For each={branches}>
                      {(branch) => (
                        <button
                          class="flex items-center gap-2 w-full px-2 py-1.5 transition-colors text-left"
                          style={{
                            color: branch.is_current ? "var(--accent-blue)" : "var(--text-primary)",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            "font-size": "inherit",
                            "font-family": "var(--font-mono, monospace)",
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          onClick={async () => {
                            if (!branch.is_current) {
                              try {
                                await switchBranch(branch.name);
                              } catch (e) {
                                console.error("Branch switch failed:", e);
                              }
                            }
                            setBranchDropdownOpen(false);
                          }}
                        >
                          <span class="shrink-0" style={{ width: "14px" }}>
                            <Show when={branch.is_current}><CheckIcon /></Show>
                          </span>
                          <span class="truncate">{branch.name}</span>
                        </button>
                      )}
                    </For>
                    {/* Separator */}
                    <div style={{ height: "1px", background: "var(--border-muted)" }} />
                    {/* Create new branch */}
                    <Show when={!creatingBranch()}>
                      <button
                        class="flex items-center gap-2 w-full px-2 py-1.5 transition-colors text-left"
                        style={{
                          color: "var(--text-muted)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          "font-size": "inherit",
                          "font-family": "inherit",
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => setCreatingBranch(true)}
                      >
                        <PlusIcon />
                        <span>Create new branch...</span>
                      </button>
                    </Show>
                    <Show when={creatingBranch()}>
                      <div class="px-2 py-1.5">
                        <input
                          type="text"
                          class="w-full rounded px-2 py-1 outline-none"
                          style={{
                            background: "var(--bg-surface)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--accent-blue)",
                            "font-size": "inherit",
                            "font-family": "var(--font-mono, monospace)",
                          }}
                          placeholder="branch-name"
                          value={newBranchName()}
                          onInput={(e) => setNewBranchName(e.currentTarget.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && newBranchName().trim()) {
                              try {
                                await createBranch(newBranchName().trim());
                              } catch (err) {
                                console.error("Create branch failed:", err);
                              }
                              setCreatingBranch(false);
                              setNewBranchName("");
                              setBranchDropdownOpen(false);
                            }
                            if (e.key === "Escape") {
                              setCreatingBranch(false);
                              setNewBranchName("");
                            }
                          }}
                          ref={(el) => setTimeout(() => el.focus(), 0)}
                        />
                      </div>
                    </Show>
                  </div>
                  {/* Click-outside overlay */}
                  <div
                    class="fixed inset-0 z-40"
                    onClick={() => {
                      setBranchDropdownOpen(false);
                      setCreatingBranch(false);
                      setNewBranchName("");
                    }}
                  />
                </Show>

                <Show when={diffStat().files_changed > 0 || changedFiles.length > 0}>
                  <div class="flex items-center gap-3 mt-1" style={{ color: "var(--text-muted)", "padding-left": "2px" }}>
                    <span>{changedFiles.length} file{changedFiles.length !== 1 ? "s" : ""}</span>
                    <Show when={diffStat().insertions > 0}>
                      <span style={{ color: "var(--accent-green)" }}>+{diffStat().insertions}</span>
                    </Show>
                    <Show when={diffStat().deletions > 0}>
                      <span style={{ color: "var(--accent-red)" }}>-{diffStat().deletions}</span>
                    </Show>
                  </div>
                </Show>
              </div>

              {/* Fetch / Pull / Push action buttons */}
              <div
                class="shrink-0 flex items-center gap-1.5 px-3 py-1.5"
                style={{ "border-bottom": "1px solid var(--border-muted)" }}
              >
                <button
                  class="flex-1 flex items-center justify-center gap-1 py-1 rounded transition-colors"
                  style={{
                    color: isSyncing() ? "var(--text-muted)" : "var(--text-secondary)",
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-muted)",
                    cursor: isSyncing() ? "not-allowed" : "pointer",
                    "font-size": "0.85em",
                    "font-family": "inherit",
                    opacity: isSyncing() ? "0.6" : "1",
                  }}
                  onMouseEnter={(e) => { if (!isSyncing()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
                  disabled={isSyncing()}
                  onClick={async () => {
                    try { await fetchRemote(); } catch (e) { console.error("Fetch failed:", e); }
                  }}
                  title="Fetch from remote"
                >
                  {isSyncing() ? <SpinnerIcon /> : <span>Fetch</span>}
                  {!isSyncing() && <span style={{ "font-size": "12px" }}>&#x27F3;</span>}
                </button>
                <button
                  class="flex-1 flex items-center justify-center gap-1 py-1 rounded transition-colors"
                  style={{
                    color: isSyncing() ? "var(--text-muted)" : "var(--text-secondary)",
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-muted)",
                    cursor: isSyncing() ? "not-allowed" : "pointer",
                    "font-size": "0.85em",
                    "font-family": "inherit",
                    opacity: isSyncing() ? "0.6" : "1",
                  }}
                  onMouseEnter={(e) => { if (!isSyncing()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
                  disabled={isSyncing()}
                  onClick={async () => {
                    try { await pullRemote(); } catch (e) { console.error("Pull failed:", e); }
                  }}
                  title="Pull from remote"
                >
                  <span>Pull</span>
                  <Show when={aheadBehind().behind > 0}>
                    <span style={{ color: "var(--accent-blue)" }}>{"\u2193"}{aheadBehind().behind}</span>
                  </Show>
                </button>
                <button
                  class="flex-1 flex items-center justify-center gap-1 py-1 rounded transition-colors"
                  style={{
                    color: isSyncing() ? "var(--text-muted)" : "var(--text-secondary)",
                    background: "var(--bg-base)",
                    border: "1px solid var(--border-muted)",
                    cursor: isSyncing() ? "not-allowed" : "pointer",
                    "font-size": "0.85em",
                    "font-family": "inherit",
                    opacity: isSyncing() ? "0.6" : "1",
                  }}
                  onMouseEnter={(e) => { if (!isSyncing()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
                  disabled={isSyncing()}
                  onClick={async () => {
                    try { await pushRemote(); } catch (e) { console.error("Push failed:", e); }
                  }}
                  title="Push to remote"
                >
                  <span>Push</span>
                  <Show when={aheadBehind().ahead > 0}>
                    <span style={{ color: "var(--accent-green)" }}>{"\u2191"}{aheadBehind().ahead}</span>
                  </Show>
                </button>
              </div>

              {/* Commit input */}
              <div class="shrink-0 p-2" style={{ "border-bottom": "1px solid var(--border-muted)" }}>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    class="w-full rounded px-2 py-1.5 outline-none"
                    style={{
                      background: "var(--bg-base)",
                      color: "var(--text-primary)",
                      border: commitMsg().trim() ? "1px solid var(--accent-primary)" : "1px solid var(--border-default)",
                      "padding-right": "40px",
                      "font-size": "inherit",
                      transition: "border-color 0.15s",
                    }}
                    placeholder="Commit message..."
                    value={commitMsg()}
                    onInput={(e) => setCommitMsg(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && commitMsg().trim()) handleCommit();
                    }}
                  />
                  <Show when={commitMsg().trim()}>
                    <span style={{
                      position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                      "font-size": "0.78em", color: commitMsg().length > 72 ? "var(--accent-red)" : "var(--text-muted)",
                    }}>
                      {commitMsg().length}
                    </span>
                  </Show>
                </div>
                <div class="flex gap-1.5 mt-1.5">
                  <button
                    class="flex-1 py-1.5 rounded font-medium transition-colors"
                    style={{
                      background: stagedFiles().length > 0 && commitMsg().trim()
                        ? "var(--accent-primary)"
                        : "var(--bg-hover)",
                      color: stagedFiles().length > 0 && commitMsg().trim()
                        ? "var(--accent-text, #fff)"
                        : "var(--text-muted)",
                      cursor: stagedFiles().length > 0 && commitMsg().trim() && !isCommitting()
                        ? "pointer" : "not-allowed",
                      "font-size": "inherit",
                      border: "none",
                      transition: "all 0.15s",
                    }}
                    disabled={!commitMsg().trim() || stagedFiles().length === 0 || isCommitting()}
                    onClick={handleCommit}
                  >
                    {isCommitting() ? "Committing..." : stagedFiles().length > 0
                      ? `Commit ${stagedFiles().length} file${stagedFiles().length !== 1 ? "s" : ""}`
                      : "Nothing staged"}
                  </button>
                  <Show when={unstagedFiles().length > 0 && stagedFiles().length === 0}>
                    <button
                      class="px-2.5 py-1.5 rounded font-medium transition-colors"
                      style={{
                        background: "var(--bg-base)", color: "var(--accent-green)",
                        border: "1px solid color-mix(in srgb, var(--accent-green) 30%, transparent)",
                        cursor: "pointer", "font-size": "inherit",
                      }}
                      onClick={() => stageAll()}
                      title="Stage all changes"
                    >
                      Stage All
                    </button>
                  </Show>
                </div>
              </div>

              {/* Resizable changes + commits split */}
              <div
                ref={gitSplitContainerRef}
                class="flex flex-col flex-1 min-h-0"
              >
                {/* Changes section (staged + unstaged) */}
                <div
                  class="flex flex-col overflow-y-auto shrink-0"
                  style={{ height: `${changesHeightPct()}%` }}
                >
                  {/* Staged changes */}
                  <Show when={stagedFiles().length > 0}>
                    <div>
                      <div
                        class="flex items-center justify-between px-2 py-1"
                        style={{ "border-bottom": "1px solid var(--border-muted)", background: "color-mix(in srgb, var(--accent-green) 5%, transparent)" }}
                      >
                        <div class="flex items-center gap-1.5">
                          <div style={{ width: "7px", height: "7px", "border-radius": "50%", background: "var(--accent-green)" }} />
                          <span class="font-semibold" style={{ color: "var(--accent-green)", "font-size": "0.85em" }}>
                            Staged · {stagedFiles().length}
                          </span>
                        </div>
                        <button
                          class="px-1.5 py-0.5 rounded transition-colors"
                          style={{ color: "var(--text-muted)", background: "transparent", "font-size": "0.78em", border: "none", cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                          onClick={() => unstageAll()}
                          title="Unstage all"
                        >
                          Unstage all
                        </button>
                      </div>
                      <For each={stagedFiles()}>
                        {(file) => (
                          <FileRow
                            file={file}
                            onAction={() => unstageFile(file.path)}
                            actionIcon="unstage"
                          />
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* Unstaged changes */}
                  <Show when={unstagedFiles().length > 0}>
                    <div>
                      <div
                        class="flex items-center justify-between px-2 py-1"
                        style={{ "border-bottom": "1px solid var(--border-muted)", background: "color-mix(in srgb, var(--accent-yellow) 5%, transparent)" }}
                      >
                        <div class="flex items-center gap-1.5">
                          <div style={{ width: "7px", height: "7px", "border-radius": "50%", background: "var(--accent-yellow)" }} />
                          <span class="font-semibold" style={{ color: "var(--accent-yellow)", "font-size": "0.85em" }}>
                            Changes · {unstagedFiles().length}
                          </span>
                        </div>
                        <button
                          class="px-1.5 py-0.5 rounded transition-colors"
                          style={{ color: "var(--accent-green)", background: "color-mix(in srgb, var(--accent-green) 10%, transparent)", "font-size": "0.78em", border: "1px solid color-mix(in srgb, var(--accent-green) 25%, transparent)", cursor: "pointer" }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-green) 18%, transparent)"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-green) 10%, transparent)"; }}
                          onClick={() => stageAll()}
                          title="Stage all"
                        >
                          Stage all
                        </button>
                      </div>
                      <For each={unstagedFiles()}>
                        {(file) => (
                          <FileRow
                            file={file}
                            onAction={() => stageFile(file.path)}
                            actionIcon="stage"
                          />
                        )}
                      </For>
                    </div>
                  </Show>

                  {/* No changes state */}
                  <Show when={changedFiles.length === 0}>
                    <div class="flex items-center justify-center py-4">
                      <p class="text-xs" style={{ color: "var(--text-muted)" }}>
                        No changes
                      </p>
                    </div>
                  </Show>
                </div>

                {/* Resize handle */}
                <div
                  class="shrink-0 cursor-row-resize"
                  style={{
                    height: "5px",
                    background: isDraggingGitSplitter() ? "var(--accent-primary)" : "var(--border-default)",
                    transition: isDraggingGitSplitter() ? "none" : "background 0.15s",
                  }}
                  onMouseDown={handleGitSplitterMouseDown}
                  onMouseEnter={(e) => {
                    if (!isDraggingGitSplitter()) {
                      (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isDraggingGitSplitter()) {
                      (e.currentTarget as HTMLElement).style.background = "var(--border-default)";
                    }
                  }}
                />

                {/* Commits section */}
                <div class="flex flex-col min-h-0 flex-1">
                  <Show when={commitLog().length > 0}>
                    <div
                      class="flex items-center justify-between px-2 py-1 shrink-0"
                      style={{ "border-bottom": "1px solid var(--border-muted)" }}
                    >
                      <span class="font-semibold" style={{ color: "var(--text-secondary)", "font-size": "0.85em" }}>
                        History · {commitLog().length}
                      </span>
                      <span style={{ "font-size": "0.78em", color: "var(--text-muted)" }}>
                        {currentBranch()}
                      </span>
                    </div>
                    <div class="overflow-y-auto min-h-0 flex-1">
                      <For each={commitLog()}>
                        {(entry, idx) => (
                          <GitGraphRow
                            entry={entry}
                            isLast={idx() === commitLog().length - 1}
                            isMerge={entry.parents.length > 1}
                          />
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </div>

              {/* Refresh button */}
              <div class="p-2 shrink-0">
                <button
                  class="w-full py-1 rounded transition-colors"
                  style={{
                    color: "var(--text-muted)",
                    background: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                  onClick={() => { refreshGitStatus(); refreshBranches(); }}
                >
                  Refresh
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>

      {/* Security modal rendered via Portal so it escapes sidebar bounds */}
      <Show when={securityShowModal()}>
        <SecurityModal
          mode={pendingCommit() ? "pre-commit" : "scan"}
          onCommitAnyway={() => {
            setSecurityShowModal(false);
            doCommit();
          }}
          onClose={() => {
            setSecurityShowModal(false);
            setPendingCommit(false);
          }}
        />
      </Show>
    </div>
  );
};

export default RightSidebar;
