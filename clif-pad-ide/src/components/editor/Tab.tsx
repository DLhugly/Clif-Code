import { Component, Show, createSignal, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import type { OpenFile } from "../../types/files";

interface TabProps {
  file: OpenFile;
  isActive: boolean;
  onSelect: () => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseAll: () => void;
  onCloseToRight: () => void;
  onPreview?: () => void;
}

function getExtensionColor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colorMap: Record<string, string> = {
    ts: "#3178c6",
    tsx: "#3178c6",
    js: "#f7df1e",
    jsx: "#61dafb",
    rs: "#dea584",
    py: "#3572a5",
    go: "#00add8",
    html: "#e34c26",
    css: "#563d7c",
    scss: "#c6538c",
    json: "#a8b1c1",
    md: "#519aba",
    toml: "#9c4121",
    yaml: "#cb171e",
    yml: "#cb171e",
    sh: "#89e051",
    sql: "#e38c00",
    lua: "#000080",
    rb: "#cc342d",
    java: "#b07219",
    kt: "#a97bff",
    swift: "#f05138",
    c: "#555555",
    cpp: "#f34b7d",
    vue: "#41b883",
    svelte: "#ff3e00",
  };
  return colorMap[ext] || "#8b949e";
}

const Tab: Component<TabProps> = (props) => {
  const [showMenu, setShowMenu] = createSignal(false);
  const [menuPos, setMenuPos] = createSignal({ x: 0, y: 0 });

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenuPos({ x: e.clientX, y: e.clientY });
    setShowMenu(true);

    const closeMenu = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest("[data-tab-menu]")) {
        setShowMenu(false);
        document.removeEventListener("mousedown", closeMenu);
      }
    };
    document.addEventListener("mousedown", closeMenu);
    onCleanup(() => document.removeEventListener("mousedown", closeMenu));
  };

  return (
    <div class="relative">
      <div
        class={`group flex items-center gap-1.5 px-3 cursor-pointer select-none border-r border-[var(--border-color)] shrink-0 ${
          props.isActive
            ? "bg-[var(--editor-bg)] text-[var(--text-primary)] border-b-2 border-b-[var(--accent-color)]"
            : "bg-[var(--tab-bg)] text-[var(--text-secondary)] hover:bg-[var(--tab-hover-bg)] border-b-2 border-b-transparent"
        }`}
        style={{ height: "var(--tab-height, 36px)" }}
        onClick={() => props.onSelect()}
        onContextMenu={handleContextMenu}
        onMouseDown={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            props.onClose();
          }
        }}
      >
        {/* Eye icon for preview tabs, color dot for regular */}
        <Show
          when={props.file.isPreview}
          fallback={
            <span
              class="w-2 h-2 rounded-full shrink-0"
              style={{ "background-color": getExtensionColor(props.file.name) }}
            />
          }
        >
          <svg
            class="w-3.5 h-3.5 shrink-0"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
        </Show>

        {/* Dirty indicator */}
        <Show when={props.file.isDirty}>
          <span class="w-1.5 h-1.5 rounded-full bg-white shrink-0" />
        </Show>

        {/* File name */}
        <span class="text-xs whitespace-nowrap overflow-hidden text-ellipsis max-w-[120px]">
          {props.file.name}
        </span>

        {/* Close button */}
        <button
          class={`ml-1 w-4 h-4 flex items-center justify-center rounded-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-bg)] shrink-0 ${
            props.isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          }`}
          onClick={(e) => {
            e.stopPropagation();
            props.onClose();
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1 1L7 7M7 1L1 7"
              stroke="currentColor"
              stroke-width="1.2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      {/* Context menu (portaled to body to avoid overflow clipping) */}
      <Show when={showMenu()}>
        <Portal mount={document.getElementById("root")!}>
          <div
            data-tab-menu
            class="fixed z-[9999] py-1 min-w-[180px] rounded shadow-lg border border-[var(--border-color)]"
            style={{
              background: "var(--sidebar-bg)",
              left: `${menuPos().x}px`,
              top: `${menuPos().y}px`,
              "font-family": "var(--font-sans)",
              color: "var(--text-primary)",
            }}
          >
            <button
              class="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => { setShowMenu(false); props.onClose(); }}
            >
              Close
            </button>
            <button
              class="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => { setShowMenu(false); props.onCloseOthers(); }}
            >
              Close Others
            </button>
            <button
              class="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => { setShowMenu(false); props.onCloseAll(); }}
            >
              Close All
            </button>
            <button
              class="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--hover-bg)]"
              onClick={() => { setShowMenu(false); props.onCloseToRight(); }}
            >
              Close to the Right
            </button>
            <Show when={props.onPreview}>
              <div class="my-1 border-t border-[var(--border-color)]" />
              <button
                class="w-full px-3 py-1.5 text-xs text-left text-[var(--text-primary)] hover:bg-[var(--hover-bg)] flex items-center gap-2"
                onClick={() => { setShowMenu(false); props.onPreview?.(); }}
              >
                <svg
                  class="w-3.5 h-3.5"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
                  <circle cx="8" cy="8" r="2" />
                </svg>
                Preview Markdown
              </button>
            </Show>
          </div>
        </Portal>
      </Show>
    </div>
  );
};

export default Tab;
