import { Component, onMount, onCleanup, createEffect } from "solid-js";
import * as monaco from "monaco-editor";
import { activeFile, updateFileContent, saveActiveFile, projectRoot } from "../../stores/fileStore";
import { theme, fontSize } from "../../stores/uiStore";
import { settings } from "../../stores/settingsStore";
import { monacoThemes } from "../../lib/themes";
import { registerGhostTextProvider } from "./GhostText";
import { showToast } from "../../stores/toastStore";
import { startLspForFile, stopAllLspClients } from "../../lib/lsp";
import type { Theme } from "../../stores/uiStore";

// Model + viewstate cache
const modelCache = new Map<string, monaco.editor.ITextModel>();
const viewStateCache = new Map<string, monaco.editor.ICodeEditorViewState>();

const LARGE_FILE_THRESHOLD = 512 * 1024; // 512 KB

function isLargeFile(content: string): boolean {
  return content.length >= LARGE_FILE_THRESHOLD;
}

function getOrCreateModel(path: string, content: string, language: string): monaco.editor.ITextModel {
  const existing = modelCache.get(path);
  if (existing && !existing.isDisposed()) {
    const currentLang = existing.getLanguageId();
    if (currentLang !== language) {
      monaco.editor.setModelLanguage(existing, language);
    }
    // For large files, compare length first to avoid expensive getValue()
    const needsUpdate = isLargeFile(content)
      ? existing.getValueLength() !== content.length
      : existing.getValue() !== content;
    if (needsUpdate) {
      existing.setValue(content);
    }
    return existing;
  }

  const uri = monaco.Uri.parse(`file://${path}`);
  const existingByUri = monaco.editor.getModel(uri);
  if (existingByUri) {
    modelCache.set(path, existingByUri);
    return existingByUri;
  }

  const model = monaco.editor.createModel(content, language, uri);
  modelCache.set(path, model);
  return model;
}

function getMonacoThemeName(t: Theme): string {
  return `clif-${t}`;
}

const MonacoEditor: Component = () => {
  let containerRef!: HTMLDivElement;
  let editorInstance: monaco.editor.IStandaloneCodeEditor | undefined;
  let ghostTextDisposable: monaco.IDisposable | undefined;
  let currentPath: string | null = null;
  let onChangeDisposable: monaco.IDisposable | undefined;

  onMount(() => {
    // Register all 5 themes
    for (const [name, themeData] of Object.entries(monacoThemes)) {
      monaco.editor.defineTheme(`clif-${name}`, themeData);
    }

    editorInstance = monaco.editor.create(containerRef, {
      fontSize: fontSize(),
      fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
      fontLigatures: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      renderWhitespace: "selection",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      smoothScrolling: true,
      padding: { top: 8 },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true },
      lineNumbers: "on",
      roundedSelection: true,
      tabSize: 2,
      automaticLayout: true,
      theme: getMonacoThemeName(theme()),
      // Enable inline AI ghost text suggestions (Tab to accept)
      inlineSuggest: {
        enabled: true,
        mode: "prefix",
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: false,
      },
    });

    // Register FIM ghost text completions
    ghostTextDisposable = registerGhostTextProvider(editorInstance);

    // Register Cmd+S / Ctrl+S to save
    editorInstance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveActiveFile();
    });
  });

  // Watch active file changes
  createEffect(() => {
    const file = activeFile();
    const editor = editorInstance;
    if (!editor) return;

    if (currentPath) {
      const state = editor.saveViewState();
      if (state) {
        viewStateCache.set(currentPath, state);
      }
    }

    if (onChangeDisposable) {
      onChangeDisposable.dispose();
      onChangeDisposable = undefined;
    }

    if (!file) {
      editor.setModel(null);
      currentPath = null;
      return;
    }

    const large = isLargeFile(file.content);
    const model = getOrCreateModel(file.path, file.content, file.language);
    editor.setModel(model);

    if (large) {
      const sizeMB = (file.content.length / (1024 * 1024)).toFixed(1);
      showToast(`Large file (${sizeMB} MB) — some features disabled for performance`, "warn");
    }

    // Toggle performance options based on file size
    editor.updateOptions({
      minimap: { enabled: !large },
      folding: !large,
      wordWrap: large ? "off" : (settings().wordWrap as "on" | "off"),
      renderWhitespace: large ? "none" : "selection",
      guides: { bracketPairs: !large },
      bracketPairColorization: { enabled: !large },
      occurrencesHighlight: large ? "off" : "multiFile",
    });

    const savedState = viewStateCache.get(file.path);
    if (savedState) {
      editor.restoreViewState(savedState);
    }

    currentPath = file.path;

    onChangeDisposable = model.onDidChangeContent(() => {
      const value = model.getValue();
      updateFileContent(file.path, value);
    });

    // Start LSP for this file's language if not already running
    const root = projectRoot();
    if (root && editorInstance) {
      startLspForFile(file.path, root, editorInstance);
    }
  });

  // Watch theme changes
  createEffect(() => {
    const t = theme();
    if (editorInstance) {
      monaco.editor.setTheme(getMonacoThemeName(t));
    }
  });

  // Watch font size changes
  createEffect(() => {
    const size = fontSize();
    if (editorInstance) {
      editorInstance.updateOptions({ fontSize: size });
    }
  });

  // Watch editor font changes
  createEffect(() => {
    const font = settings().editorFont;
    if (editorInstance) {
      editorInstance.updateOptions({ fontFamily: `${font}, Menlo, Monaco, 'Courier New', monospace` });
    }
  });

  // Watch inline AI toggle
  createEffect(() => {
    const enabled = settings().inlineAiEnabled;
    if (editorInstance) {
      editorInstance.updateOptions({
        inlineSuggest: { enabled, mode: "prefix" },
      });
    }
  });

  onCleanup(() => {
    if (currentPath && editorInstance) {
      const state = editorInstance.saveViewState();
      if (state) {
        viewStateCache.set(currentPath, state);
      }
    }

    if (ghostTextDisposable) {
      ghostTextDisposable.dispose();
    }

    stopAllLspClients();

    if (onChangeDisposable) {
      onChangeDisposable.dispose();
    }

    if (editorInstance) {
      editorInstance.dispose();
    }

    modelCache.forEach((model) => {
      if (!model.isDisposed()) {
        model.dispose();
      }
    });
    modelCache.clear();
    viewStateCache.clear();
  });

  return (
    <div
      ref={containerRef}
      class="flex-1 w-full h-full overflow-hidden"
    />
  );
};

export default MonacoEditor;
