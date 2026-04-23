import { Component, Show, For, createSignal, createMemo, lazy, Suspense, onCleanup } from "solid-js";
import { projectRoot, openFile, openDiff, refreshFileTree } from "../../stores/fileStore";
import { revealPath, renameEntry, deleteEntry, scanFilesSecurity, gitDiff, gitDiffCached, generateCommitMessage, getApiKey, aiReviewCode, onCodeReviewStart, onCodeReviewStream, onCodeReviewDone, onCodeReviewError } from "../../lib/tauri";
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
import { FileRow, GitGraphRow, PlusIcon } from "../git";
import { ResizeHandle, GitSyncButton, SidebarToolbarButton } from "../ui";
import { settings } from "../../stores/settingsStore";
import type { UnlistenFn } from "@tauri-apps/api/event";

const FileTree = lazy(() => import("../explorer/FileTree"));

type SidebarTab = "files" | "git" | "analyze";

const GitBranchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
);

/* FileRow and GitGraphRow extracted to ../git/ */

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

const MagicWandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M15 4V2" />
    <path d="M15 16v-2" />
    <path d="M8 9h2" />
    <path d="M20 9h2" />
    <path d="M17.8 11.8 19 13" />
    <path d="M15 9h0" />
    <path d="M17.8 6.2 19 5" />
    <path d="m3 21 9-9" />
    <path d="M12.2 6.2 11 5" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
    <path d="M8 16H3v5" />
  </svg>
);

const RightSidebar: Component<{ onOpenFolder?: () => void; onCloneRepo?: () => void; onOpenRecent?: (path: string) => void }> = (props) => {
  const [activeTab, setActiveTab] = createSignal<SidebarTab>("files");
  const [commitMsg, setCommitMsg] = createSignal("");
  const [pendingCommit, setPendingCommit] = createSignal(false);
  const [isCommitting, setIsCommitting] = createSignal(false);
  const [isGeneratingMsg, setIsGeneratingMsg] = createSignal(false);
  const [creatingType, setCreatingType] = createSignal<"file" | "folder" | null>(null);
  const [branchDropdownOpen, setBranchDropdownOpen] = createSignal(false);
  const [creatingBranch, setCreatingBranch] = createSignal(false);
  const [newBranchName, setNewBranchName] = createSignal("");
  const [changesHeightPct, setChangesHeightPct] = createSignal(40);
  const [isDraggingGitSplitter, setIsDraggingGitSplitter] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal("");
  const [isAiReviewing, setIsAiReviewing] = createSignal(false);
  const [aiReviewContent, setAiReviewContent] = createSignal("");
  const [aiReviewExpanded, setAiReviewExpanded] = createSignal(true);
  const [aiReviewFiles, setAiReviewFiles] = createSignal<string[]>([]);
  let gitSplitContainerRef: HTMLDivElement | undefined;
  let aiReviewUnlisten: UnlistenFn | undefined;

  async function handleGenerateCommitMessage() {
    if (isGeneratingMsg() || stagedFiles().length === 0) return;
    setIsGeneratingMsg(true);
    try {
      const s = settings();
      const model = s.aiModel || "anthropic/claude-sonnet-4";
      const provider = s.aiProvider || "openrouter";

      // Get API key for the provider
      const apiKey = await getApiKey(provider);

      // Get diff of staged files
      const diff = await gitDiffCached(projectRoot() || "");
      const stagedPaths = stagedFiles().map(f => f.path);
      
      const message = await generateCommitMessage(diff, stagedPaths, model, apiKey, provider);
      setCommitMsg(message);
    } catch (e) {
      console.error("Failed to generate commit message:", e);
    } finally {
      setIsGeneratingMsg(false);
    }
  }

  async function handleAiReview() {
    if (isAiReviewing() || stagedFiles().length === 0) return;
    setIsAiReviewing(true);
    setAiReviewContent("");
    
    const s = settings();
    const model = s.aiModel || "anthropic/claude-sonnet-4";
    const provider = s.aiProvider || "openrouter";
    const apiKey = await getApiKey(provider);

    const diff = await gitDiffCached(projectRoot() || "");
    const stagedPaths = stagedFiles().map(f => f.path);
    
    console.log("AI Review - diff length:", diff.length);
    console.log("AI Review - staged files:", stagedPaths);

    // Set up event listeners for streaming
    const unlistenStart = await onCodeReviewStart((files) => {
      console.log("AI Review - start event received:", files);
      setAiReviewFiles(files);
    });
    
    const unlistenStream = await onCodeReviewStream((chunk) => {
      console.log("AI Review - stream chunk:", chunk);
      setAiReviewContent(prev => prev + chunk);
    });
    
    const unlistenDone = await onCodeReviewDone(() => {
      console.log("AI Review - done event received");
      setIsAiReviewing(false);
    });
    
    const unlistenError = await onCodeReviewError((error) => {
      console.error("AI review error:", error);
      setAiReviewContent(prev => prev + `\n\n**Error:** ${error}`);
      setIsAiReviewing(false);
    });
    
    // Store unlisteners for cleanup
    aiReviewUnlisten = () => {
      unlistenStart();
      unlistenStream();
      unlistenDone();
      unlistenError();
    };
    
    setAiReviewExpanded(true);
    
    try {
      console.log("AI Review - calling aiReviewCode...");
      await aiReviewCode(diff, stagedPaths, model, apiKey, provider);
      console.log("AI Review - aiReviewCode returned");
    } catch (e) {
      console.error("Failed to run AI code review:", e);
      setIsAiReviewing(false);
    }
  }

  function cancelAiReview() {
    // Currently no backend cancel for this - just reset state
    if (aiReviewUnlisten) {
      aiReviewUnlisten();
    }
    setIsAiReviewing(false);
    setAiReviewContent(prev => prev + "\n\n*[Cancelled]*");
  }

  function copyAiReviewToAgent() {
    const content = aiReviewContent();
    if (!content) return;
    
    const text = `## AI Code Review\n\n**Files:** ${aiReviewFiles().join(", ")}\n\n${content}`;
    navigator.clipboard.writeText(text);
  }
  
  onCleanup(() => {
    if (aiReviewUnlisten) {
      aiReviewUnlisten();
    }
  });

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
        <button
          class="flex-1 flex items-center justify-center gap-1.5 font-medium transition-colors"
          style={{
            color: activeTab() === "analyze" ? "var(--text-primary)" : "var(--text-muted)",
            background: activeTab() === "analyze" ? "var(--bg-base)" : "transparent",
            "border-bottom": activeTab() === "analyze" ? "2px solid var(--accent-blue)" : "2px solid transparent",
          }}
          onClick={() => setActiveTab("analyze")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          Analyze
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
              onCloneRepo={props.onCloneRepo}
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
                      "padding-right": stagedFiles().length > 0 ? "70px" : "40px",
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
                  <div style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", display: "flex", "align-items": "center", gap: "6px" }}>
                    <Show when={stagedFiles().length > 0}>
                      <button
                        type="button"
                        onClick={handleGenerateCommitMessage}
                        disabled={isGeneratingMsg()}
                        title="Generate commit message with AI"
                        style={{
                          background: "transparent",
                          border: "none",
                          cursor: isGeneratingMsg() ? "wait" : "pointer",
                          color: "var(--text-muted)",
                          padding: "2px",
                          display: "flex",
                          "align-items": "center",
                          opacity: isGeneratingMsg() ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (!isGeneratingMsg()) (e.currentTarget as HTMLElement).style.color = "var(--accent-primary)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                      >
                        {isGeneratingMsg() ? <SpinnerIcon /> : <MagicWandIcon />}
                      </button>
                    </Show>
                    <Show when={commitMsg().trim()}>
                      <span style={{
                        "font-size": "0.78em", color: commitMsg().length > 72 ? "var(--accent-red)" : "var(--text-muted)",
                      }}>
                        {commitMsg().length}
                      </span>
                    </Show>
                  </div>
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
                <ResizeHandle
                  direction="row"
                  isDragging={isDraggingGitSplitter()}
                  onMouseDown={handleGitSplitterMouseDown}
                />

                {/* Commits section */}
                <div class="flex flex-col min-h-0 flex-1">
                  <Show when={commitLog().length > 0}>
                    <div
                      class="flex items-center justify-between px-2 py-1 shrink-0"
                      style={{ "border-bottom": "1px solid var(--border-muted)" }}
                    >
                      <div class="flex items-center gap-2">
                        <span class="font-semibold" style={{ color: "var(--text-secondary)", "font-size": "0.85em" }}>
                          History · {commitLog().length}
                        </span>
                        <button
                          class="p-1 rounded transition-colors"
                          style={{ color: "var(--text-muted)" }}
                          title="Refresh git status"
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLElement).style.background = "transparent";
                            (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
                          }}
                          onClick={() => { refreshGitStatus(); refreshBranches(); }}
                        >
                          <RefreshIcon />
                        </button>
                      </div>
                      <span style={{ "font-size": "0.78em", color: "var(--text-muted)" }}>
                        {currentBranch()}
                      </span>
                    </div>
                    <div class="overflow-y-auto min-h-0 flex-1" style={{ position: "relative" }}>
                      {/* Single continuous vertical line behind all dots */}
                      <div
                        style={{
                          position: "absolute",
                          left: "17px", // 8px (px-2 padding) + 10px (half of 20px dot column) - 1px (half of 2px line)
                          top: "0",
                          bottom: "0",
                          width: "2px",
                          background: "var(--accent-primary)",
                          opacity: "0.35",
                          "z-index": "0",
                        }}
                      />
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

            </Show>
          </div>
        </Show>

        {/* Analyze Tab - Security + AI combined */}
        <Show when={activeTab() === "analyze"}>
          <div class="flex flex-col h-full overflow-y-auto p-3 gap-4">
            {/* Security Section */}
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Security Scanner</h3>
                <div
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded"
                  style={{
                    background: securityEnabled() ? "var(--accent-green)" : "var(--bg-hover)",
                    color: securityEnabled() ? "#fff" : "var(--text-muted)",
                  }}
                >
                  <div
                    style={{
                      width: "6px",
                      height: "6px",
                      "border-radius": "50%",
                      background: securityEnabled() ? "#fff" : "var(--text-muted)",
                    }}
                  />
                  <span class="text-xs">{securityEnabled() ? "On" : "Off"}</span>
                </div>
              </div>

              <p class="text-xs" style={{ color: "var(--text-muted)" }}>
                Scans for secrets, API keys, and vulnerable patterns.
              </p>

              <div class="flex flex-wrap gap-1.5">
                <span class="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>API Keys</span>
                <span class="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>AWS/GCP/Azure</span>
                <span class="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>Private Keys</span>
                <span class="px-2 py-0.5 rounded text-xs" style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}>DB URLs</span>
              </div>

              <button
                class="w-full py-2 rounded text-sm font-medium transition-colors"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-text, #fff)",
                  border: "none",
                  cursor: "pointer",
                }}
                onClick={() => setSecurityShowModal(true)}
              >
                Run Security Scan
              </button>
            </div>

            {/* Divider */}
            <div style={{ height: "1px", background: "var(--border-default)" }}></div>

            {/* AI Code Review Section */}
            <div class="flex flex-col gap-2">
              <div class="flex items-center justify-between">
                <h3 class="text-sm font-medium" style={{ color: "var(--text-primary)" }}>AI Code Review</h3>
              </div>

              <p class="text-xs" style={{ color: "var(--text-muted)" }}>
                Analyze staged changes for bugs, performance issues, and improvements.
              </p>

              <Show when={stagedFiles().length > 0}>
                <div class="text-xs" style={{ color: "var(--text-secondary)" }}>
                  <span class="font-medium">{stagedFiles().length} file(s) staged</span>
                </div>
              </Show>

              {/* AI Analysis - Coming Soon */}
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  class="flex-1 flex items-center justify-center gap-2 py-2 rounded text-sm font-medium transition-colors"
                  style={{
                    background: "var(--bg-hover)",
                    color: "var(--text-muted)",
                    border: "1px dashed var(--border-default)",
                    cursor: "default",
                    opacity: "0.7",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                  AI Analysis (Coming Soon)
                </button>
              </div>

              <Show when={stagedFiles().length === 0}>
                <div class="flex flex-col items-center justify-center gap-2 py-4 text-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: "var(--text-muted)" }}>
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  <p class="text-xs" style={{ color: "var(--text-muted)" }}>
                    AI-powered code analysis coming soon
                  </p>
                </div>
              </Show>
            </div>
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
