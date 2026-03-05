import { createSignal, createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { FileEntry, OpenFile } from "../types/files";
import { readDir, readFile, writeFile, watchDir, onFileChanged, gitShow } from "../lib/tauri";
import { getLanguageFromExtension, getFileName, getFileExtension } from "../lib/utils";
import type { UnlistenFn } from "@tauri-apps/api/event";

// Project root
const [projectRoot, setProjectRoot] = createSignal<string | null>(null);

// File tree
const [fileTree, setFileTree] = createSignal<FileEntry[]>([]);
const [expandedDirs, setExpandedDirs] = createStore<Record<string, boolean>>({});

// Open files and tabs
const [openFiles, setOpenFiles] = createStore<OpenFile[]>([]);
const [activeFilePath, setActiveFilePath] = createSignal<string | null>(null);

// File watcher listener
let unlistenFileChanged: UnlistenFn | undefined;

// Debounce timer for file tree refresh
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

const activeFile = createMemo(() => {
  const path = activeFilePath();
  if (!path) return null;
  return openFiles.find((f) => f.path === path) || null;
});

async function loadDirectory(path: string): Promise<FileEntry[]> {
  try {
    const entries = await readDir(path);
    return entries;
  } catch (e) {
    console.error("Failed to read directory:", e);
    return [];
  }
}

async function openProject(path: string) {
  setProjectRoot(path);
  const entries = await loadDirectory(path);
  setFileTree(entries);

  // Start file watcher
  try {
    await watchDir(path);
  } catch (e) {
    console.error("Failed to start file watcher:", e);
  }

  // Listen for file change events
  unlistenFileChanged?.();
  unlistenFileChanged = await onFileChanged(async (event) => {
    const root = projectRoot();
    if (!root) return;

    // Only process files within the project
    if (!event.path.startsWith(root)) return;

    if (event.kind === "create" || event.kind === "modify") {
      // Check if the file is already open — either as raw path or as ::diff
      const existingIdx = openFiles.findIndex((f) => f.path === event.path);
      const diffIdx = openFiles.findIndex((f) => f.path === event.path + "::diff");

      if (existingIdx !== -1) {
        // File is open as a regular tab — refresh and upgrade to diff if possible
        try {
          const content = await readFile(event.path);
          if (openFiles[existingIdx].content !== content) {
            setOpenFiles(existingIdx, "content", content);
            setOpenFiles(existingIdx, "isDirty", false);

            // Also update any open preview tab for this file
            const previewIdx = openFiles.findIndex((f) => f.path === event.path + "::preview");
            if (previewIdx !== -1) {
              setOpenFiles(previewIdx, "content", content);
            }

            // Upgrade to diff view if tracked in git
            const root = projectRoot();
            if (root && !openFiles[existingIdx].isDiff && !openFiles[existingIdx].isPreview && !openFiles[existingIdx].isBrowser) {
              try {
                const relativePath = event.path.startsWith(root)
                  ? event.path.slice(root.length + 1)
                  : event.path;
                const original = await gitShow(root, relativePath);
                if (original !== undefined && original !== null) {
                  setOpenFiles(existingIdx, "isDiff", true);
                  setOpenFiles(existingIdx, "originalContent", original);
                  setOpenFiles(existingIdx, "name", getFileName(event.path) + " (diff)");
                  const diffPath = event.path + "::diff";
                  setOpenFiles(existingIdx, "path", diffPath);
                  if (activeFilePath() === event.path) {
                    setActiveFilePath(diffPath);
                  }
                }
              } catch {
                // Not tracked in git, keep as regular file
              }
            }
          }
        } catch {
          // File might be temporarily locked during write
        }
      } else if (diffIdx !== -1) {
        // File is already open as a diff — refresh its content
        try {
          const content = await readFile(event.path);
          const root = projectRoot();

          // Check if the file still differs from HEAD
          if (root) {
            try {
              const relativePath = event.path.startsWith(root)
                ? event.path.slice(root.length + 1)
                : event.path;
              const original = await gitShow(root, relativePath);
              if (content === original) {
                // File matches HEAD (e.g. after staging+commit or revert) — close the diff
                closeFile(event.path + "::diff");
                return;
              }
              // Update both current and original content
              setOpenFiles(diffIdx, "originalContent", original);
            } catch {
              // File no longer tracked — close diff, open as regular
              closeFile(event.path + "::diff");
              await openFile(event.path);
              return;
            }
          }

          if (openFiles[diffIdx] && openFiles[diffIdx].content !== content) {
            setOpenFiles(diffIdx, "content", content);
            setOpenFiles(diffIdx, "isDirty", false);
            setActiveFilePath(event.path + "::diff");
          }
        } catch {
          // File might be temporarily locked
        }
      } else if (event.kind === "create") {
        // Auto-open newly created files
        try {
          await openFile(event.path);
        } catch {
          // File might not be fully written yet
        }
      } else if (event.kind === "modify") {
        // Auto-open modified files — use diff mode if tracked in git
        try {
          const root = projectRoot();
          if (root) {
            try {
              const relativePath = event.path.startsWith(root)
                ? event.path.slice(root.length + 1)
                : event.path;
              const original = await gitShow(root, relativePath);
              if (original !== undefined && original !== null) {
                await openDiff(event.path, root);
                return;
              }
            } catch {
              // Not tracked, fall through to regular open
            }
          }
          await openFile(event.path);
        } catch {
          // File might not be readable yet
        }
      }
    }

    // Debounced file tree + git refresh
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      const r = projectRoot();
      if (r) {
        const entries = await loadDirectory(r);
        setFileTree(entries);
      }
      // Refresh git status and branches
      try {
        const { refreshGitStatus, refreshBranches } = await import("./gitStore");
        refreshGitStatus();
        refreshBranches();
      } catch {}
    }, 500);
  });

}

async function refreshFileTree() {
  const root = projectRoot();
  if (!root) return;
  const entries = await loadDirectory(root);
  setFileTree(entries);
}

function toggleDir(path: string) {
  setExpandedDirs(path, !expandedDirs[path]);
}

function isDirExpanded(path: string): boolean {
  return expandedDirs[path] || false;
}

let browserCounter = 0;

function openBrowser() {
  browserCounter++;
  const path = `browser://${browserCounter}`;
  const existing = openFiles.find((f) => f.isBrowser);
  if (existing) {
    setActiveFilePath(existing.path);
    return;
  }
  setOpenFiles(
    produce((files) => {
      files.push({ path, name: "Browser", content: "", language: "", isDirty: false, isBrowser: true });
    })
  );
  setActiveFilePath(path);
}

async function openFile(path: string) {
  // If already open, just switch to it
  const existing = openFiles.find((f) => f.path === path);
  if (existing) {
    setActiveFilePath(path);
    return;
  }

  // Guard virtual paths
  if (path.startsWith("browser://")) return;

  try {
    const content = await readFile(path);
    const name = getFileName(path);
    const ext = getFileExtension(name);
    const language = getLanguageFromExtension(ext);

    setOpenFiles(
      produce((files) => {
        files.push({ path, name, content, language, isDirty: false });
      })
    );
    setActiveFilePath(path);
  } catch (e) {
    console.error("Failed to open file:", e);
  }
}

function closeFile(path: string) {
  const idx = openFiles.findIndex((f) => f.path === path);
  if (idx === -1) return;

  // Collect linked tabs to close (preview, diff)
  const basePath = path.replace(/::(?:preview|diff)$/, "");
  const linkedPaths: string[] = [];
  if (!path.endsWith("::preview")) {
    // Closing source or diff — also close its preview
    const previewPath = basePath + "::preview";
    if (openFiles.find((f) => f.path === previewPath)) {
      linkedPaths.push(previewPath);
    }
  }
  if (path.endsWith("::preview")) {
    // Closing preview — don't close the source
  }

  setOpenFiles(
    produce((files) => {
      // Remove linked tabs first (iterate backwards)
      for (let i = files.length - 1; i >= 0; i--) {
        if (linkedPaths.includes(files[i].path)) {
          files.splice(i, 1);
        }
      }
      // Remove the target tab
      const targetIdx = files.findIndex((f) => f.path === path);
      if (targetIdx !== -1) files.splice(targetIdx, 1);
    })
  );

  // If we closed the active file (or it was a linked tab), switch to another
  const active = activeFilePath();
  if (active === path || linkedPaths.includes(active || "")) {
    if (openFiles.length > 0) {
      const newIdx = Math.min(idx, openFiles.length - 1);
      setActiveFilePath(openFiles[newIdx]?.path || null);
    } else {
      setActiveFilePath(null);
    }
  }
}

function closeOtherFiles(path: string) {
  setOpenFiles(
    produce((files) => {
      for (let i = files.length - 1; i >= 0; i--) {
        if (files[i].path !== path) files.splice(i, 1);
      }
    })
  );
  setActiveFilePath(path);
}

function closeAllFiles() {
  setOpenFiles(
    produce((files) => {
      files.splice(0, files.length);
    })
  );
  setActiveFilePath(null);
}

function closeFilesToRight(path: string) {
  const idx = openFiles.findIndex((f) => f.path === path);
  if (idx === -1) return;
  setOpenFiles(
    produce((files) => {
      files.splice(idx + 1);
    })
  );
  // If the active file was to the right, switch to the given file
  const activePath = activeFilePath();
  if (activePath && !openFiles.find((f) => f.path === activePath)) {
    setActiveFilePath(path);
  }
}

function updateFileContent(path: string, content: string) {
  const idx = openFiles.findIndex((f) => f.path === path);
  if (idx === -1) return;
  setOpenFiles(idx, "content", content);
  setOpenFiles(idx, "isDirty", true);

  // Live-update any open preview tab for this file
  const previewIdx = openFiles.findIndex((f) => f.path === path + "::preview");
  if (previewIdx !== -1) {
    setOpenFiles(previewIdx, "content", content);
  }
}

async function saveFile(path: string) {
  const file = openFiles.find((f) => f.path === path);
  if (!file || file.isBrowser) return;

  try {
    await writeFile(path, file.content);
    const idx = openFiles.findIndex((f) => f.path === path);
    setOpenFiles(idx, "isDirty", false);
  } catch (e) {
    console.error("Failed to save file:", e);
  }
}

async function saveActiveFile() {
  const path = activeFilePath();
  if (path) await saveFile(path);
}

async function openPreview(sourcePath: string) {
  const previewPath = sourcePath + "::preview";

  // If preview already open, switch to it
  const existing = openFiles.find((f) => f.path === previewPath);
  if (existing) {
    setActiveFilePath(previewPath);
    return;
  }

  // Get content from already-open source file or read from disk
  let content: string;
  const sourceFile = openFiles.find((f) => f.path === sourcePath);
  if (sourceFile) {
    content = sourceFile.content;
  } else {
    try {
      content = await readFile(sourcePath);
    } catch (e) {
      console.error("Failed to read file for preview:", e);
      return;
    }
  }

  const name = "Preview: " + getFileName(sourcePath);

  setOpenFiles(
    produce((files) => {
      files.push({ path: previewPath, name, content, language: "markdown", isDirty: false, isPreview: true });
    })
  );
  setActiveFilePath(previewPath);
}

function togglePreview() {
  const path = activeFilePath();
  if (!path) return;

  // If viewing a preview, switch back to source
  if (path.endsWith("::preview")) {
    const sourcePath = path.replace(/::preview$/, "");
    const sourceFile = openFiles.find((f) => f.path === sourcePath);
    if (sourceFile) {
      setActiveFilePath(sourcePath);
    }
    closeFile(path);
    return;
  }

  // If active file is markdown, open preview
  const file = openFiles.find((f) => f.path === path);
  if (file && file.name.endsWith(".md")) {
    openPreview(path);
  }
}

async function openDiff(filePath: string, repoRoot: string) {
  const diffPath = filePath + "::diff";

  // If already open, switch to it
  const existing = openFiles.find((f) => f.path === diffPath);
  if (existing) {
    setActiveFilePath(diffPath);
    return;
  }

  try {
    // Get the relative path for git show
    const relativePath = filePath.startsWith(repoRoot)
      ? filePath.slice(repoRoot.length + 1)
      : filePath;

    // Get HEAD version — if file doesn't exist in HEAD, don't open as diff
    let originalContent: string;
    try {
      originalContent = await gitShow(repoRoot, relativePath);
    } catch {
      // File not tracked in git — open as regular file instead
      await openFile(filePath);
      return;
    }

    const currentContent = await readFile(filePath).catch(() => "");

    // If content matches HEAD, no diff to show
    if (currentContent === originalContent) {
      return;
    }

    const name = getFileName(filePath);
    const ext = getFileExtension(name);
    const language = getLanguageFromExtension(ext);

    setOpenFiles(
      produce((files) => {
        files.push({
          path: diffPath,
          name: `${name} (diff)`,
          content: currentContent,
          language,
          isDirty: false,
          isDiff: true,
          originalContent,
        });
      })
    );
    setActiveFilePath(diffPath);
  } catch (e) {
    console.error("Failed to open diff:", e);
  }
}

export {
  projectRoot,
  setProjectRoot,
  fileTree,
  setFileTree,
  expandedDirs,
  openFiles,
  activeFilePath,
  setActiveFilePath,
  activeFile,
  loadDirectory,
  openProject,
  refreshFileTree,
  toggleDir,
  isDirExpanded,
  openFile,
  openBrowser,
  closeFile,
  updateFileContent,
  saveFile,
  saveActiveFile,
  openPreview,
  closeOtherFiles,
  closeAllFiles,
  closeFilesToRight,
  openDiff,
  togglePreview,
};
