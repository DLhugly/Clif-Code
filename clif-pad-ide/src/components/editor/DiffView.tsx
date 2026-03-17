import { Component, onMount, onCleanup, createEffect } from "solid-js";
import * as monaco from "monaco-editor";
import { theme, fontSize } from "../../stores/uiStore";
import { settings } from "../../stores/settingsStore";
import { monacoThemes } from "../../lib/themes";
import type { Theme } from "../../stores/uiStore";

interface DiffViewProps {
  original: string;
  modified: string;
  language: string;
}

function getMonacoThemeName(t: Theme): string {
  return `clif-${t}`;
}

const DiffView: Component<DiffViewProps> = (props) => {
  let containerRef!: HTMLDivElement;
  let diffEditor: monaco.editor.IStandaloneDiffEditor | undefined;
  let originalModel: monaco.editor.ITextModel | undefined;
  let modifiedModel: monaco.editor.ITextModel | undefined;

  onMount(() => {
    // Ensure themes are defined (may already be defined by MonacoEditor)
    for (const [name, themeData] of Object.entries(monacoThemes)) {
      monaco.editor.defineTheme(`clif-${name}`, themeData);
    }

    diffEditor = monaco.editor.createDiffEditor(containerRef, {
      fontSize: fontSize(),
      fontFamily: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace",
      fontLigatures: true,
      readOnly: true,
      renderSideBySide: true,
      renderIndicators: true,
      ignoreTrimWhitespace: false,
      scrollBeyondLastLine: false,
      minimap: { enabled: false },
      padding: { top: 8 },
      automaticLayout: true,
      theme: getMonacoThemeName(theme()),
    });

    originalModel = monaco.editor.createModel(props.original, props.language);
    modifiedModel = monaco.editor.createModel(props.modified, props.language);

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });
  });

  // Update models when props change (skip expensive setValue if length matches for large files)
  createEffect(() => {
    const orig = props.original;
    const mod = props.modified;
    const lang = props.language;

    if (originalModel && !originalModel.isDisposed()) {
      const needsUpdate = orig.length > 512 * 1024
        ? originalModel.getValueLength() !== orig.length
        : originalModel.getValue() !== orig;
      if (needsUpdate) originalModel.setValue(orig);
      monaco.editor.setModelLanguage(originalModel, lang);
    }

    if (modifiedModel && !modifiedModel.isDisposed()) {
      const needsUpdate = mod.length > 512 * 1024
        ? modifiedModel.getValueLength() !== mod.length
        : modifiedModel.getValue() !== mod;
      if (needsUpdate) modifiedModel.setValue(mod);
      monaco.editor.setModelLanguage(modifiedModel, lang);
    }
  });

  // Watch theme changes
  createEffect(() => {
    const t = theme();
    if (diffEditor) {
      monaco.editor.setTheme(getMonacoThemeName(t));
    }
  });

  // Watch font size changes
  createEffect(() => {
    const size = fontSize();
    if (diffEditor) {
      diffEditor.updateOptions({ fontSize: size });
    }
  });

  // Watch editor font changes
  createEffect(() => {
    const font = settings().editorFont;
    if (diffEditor) {
      diffEditor.updateOptions({ fontFamily: `${font}, Menlo, Monaco, 'Courier New', monospace` });
    }
  });

  onCleanup(() => {
    if (diffEditor) {
      diffEditor.dispose();
    }
    if (originalModel && !originalModel.isDisposed()) {
      originalModel.dispose();
    }
    if (modifiedModel && !modifiedModel.isDisposed()) {
      modifiedModel.dispose();
    }
  });

  return (
    <div
      ref={containerRef}
      class="w-full h-full overflow-hidden"
    />
  );
};

export default DiffView;
