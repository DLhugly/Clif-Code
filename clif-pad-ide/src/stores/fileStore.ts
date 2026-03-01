import { createSignal, createMemo } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type { FileEntry, OpenFile } from "../types/files";
import { readDir, readFile, writeFile, watchDir, onFileChanged } from "../lib/tauri";
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
      // If the file is already open, refresh its content
      const existingIdx = openFiles.findIndex((f) => f.path === event.path);
      if (existingIdx !== -1) {
        try {
          const content = await readFile(event.path);
          // Only update if the content actually differs (avoid loops from our own saves)
          if (openFiles[existingIdx].content !== content) {
            setOpenFiles(existingIdx, "content", content);
            setOpenFiles(existingIdx, "isDirty", false);
          }
        } catch {
          // File might be temporarily locked during write
        }
      } else if (event.kind === "create") {
        // Auto-open newly created files
        try {
          await openFile(event.path);
        } catch {
          // File might not be fully written yet
        }
      } else if (event.kind === "modify") {
        // Auto-open modified files that we're not already viewing
        try {
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

async function openFile(path: string) {
  // If already open, just switch to it
  const existing = openFiles.find((f) => f.path === path);
  if (existing) {
    setActiveFilePath(path);
    return;
  }

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

  setOpenFiles(
    produce((files) => {
      files.splice(idx, 1);
    })
  );

  // If we closed the active file, switch to another
  if (activeFilePath() === path) {
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
}

async function saveFile(path: string) {
  const file = openFiles.find((f) => f.path === path);
  if (!file) return;

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
  closeFile,
  updateFileContent,
  saveFile,
  saveActiveFile,
  openPreview,
  closeOtherFiles,
  closeAllFiles,
  closeFilesToRight,
};
