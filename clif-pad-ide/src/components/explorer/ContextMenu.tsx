import { Component, For, Show, onMount, onCleanup, createSignal } from "solid-js";

export interface ContextMenuItem {
  label: string;
  icon?: () => any;
  action: () => void;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

const ContextMenu: Component<ContextMenuProps> = (props) => {
  let menuRef: HTMLDivElement | undefined;
  const [position, setPosition] = createSignal({ x: props.x, y: props.y });

  onMount(() => {
    // Adjust position if menu would overflow viewport
    if (menuRef) {
      const rect = menuRef.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = props.x;
      let y = props.y;
      if (x + rect.width > vw) x = vw - rect.width - 4;
      if (y + rect.height > vh) y = vh - rect.height - 4;
      if (x < 0) x = 4;
      if (y < 0) y = 4;
      setPosition({ x, y });
    }

    function handleClickOutside(e: MouseEvent) {
      if (menuRef && !menuRef.contains(e.target as Node)) {
        props.onClose();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") props.onClose();
    }
    // Use setTimeout so the opening right-click doesn't immediately close it
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    document.addEventListener("keydown", handleEscape);

    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    });
  });

  return (
    <div
      ref={menuRef}
      class="fixed z-50"
      style={{
        left: `${position().x}px`,
        top: `${position().y}px`,
        background: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        "border-radius": "6px",
        "box-shadow": "0 4px 16px rgba(0,0,0,0.3)",
        "min-width": "160px",
        padding: "4px 0",
        "font-size": "12px",
        "font-family": "var(--font-sans)",
      }}
    >
      <For each={props.items}>
        {(item) => (
          <>
            <Show when={item.separator}>
              <div
                style={{
                  height: "1px",
                  background: "var(--border-muted)",
                  margin: "4px 8px",
                }}
              />
            </Show>
            <Show when={item.label}>
              <button
                class="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  color: item.danger ? "var(--accent-red, #ef4444)" : "var(--text-primary)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "12px",
                  "font-family": "var(--font-sans)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
                onClick={() => {
                  item.action();
                  props.onClose();
                }}
              >
                <Show when={item.icon}>
                  <span
                    class="flex items-center justify-center shrink-0"
                    style={{ width: "14px", height: "14px", color: "var(--text-muted)" }}
                  >
                    {item.icon!()}
                  </span>
                </Show>
                <span>{item.label}</span>
              </button>
            </Show>
          </>
        )}
      </For>
    </div>
  );
};

export default ContextMenu;
