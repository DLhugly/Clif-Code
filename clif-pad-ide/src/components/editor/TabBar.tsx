import { Component, For, Show } from "solid-js";
import { openFiles, activeFilePath, setActiveFilePath, closeFile, closeOtherFiles, closeAllFiles, closeFilesToRight, openPreview } from "../../stores/fileStore";
import Tab from "./Tab";

const TabBar: Component = () => {
  return (
    <Show when={openFiles.length > 0}>
      <div
        class="flex items-center w-full min-w-0 bg-[var(--sidebar-bg)] border-b border-[var(--border-color)] overflow-x-auto overflow-y-hidden scrollbar-hide"
        style={{ height: "var(--tab-height, 36px)", "min-height": "var(--tab-height, 36px)" }}
      >
        <For each={openFiles}>
          {(file) => {
            // Get actual file path (strip ::diff suffix if present)
            const actualPath = file.path.replace(/::diff$/, "");
            const isMarkdown = actualPath.endsWith(".md");
            return (
              <Tab
                file={file}
                isActive={activeFilePath() === file.path}
                onSelect={() => setActiveFilePath(file.path)}
                onClose={() => closeFile(file.path)}
                onCloseOthers={() => closeOtherFiles(file.path)}
                onCloseAll={() => closeAllFiles()}
                onCloseToRight={() => closeFilesToRight(file.path)}
                onPreview={!file.isPreview && !file.isBrowser && isMarkdown ? () => openPreview(actualPath) : undefined}
              />
            );
          }}
        </For>
      </div>
    </Show>
  );
};

export default TabBar;
