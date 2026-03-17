import { Component, For } from "solid-js";
import { toasts, dismissToast } from "../../stores/toastStore";

const ToastContainer: Component = () => {
  return (
    <div class="fixed bottom-10 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <For each={toasts()}>
        {(toast) => (
          <div
            class="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-lg shadow-lg text-sm max-w-sm animate-slide-in"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: `1px solid ${toast.type === "warn" ? "var(--accent-primary)" : toast.type === "error" ? "#ef4444" : "var(--border-default)"}`,
            }}
          >
            <span class="flex-1">{toast.message}</span>
            <button
              class="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: "2px" }}
              onClick={() => dismissToast(toast.id)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
      </For>
    </div>
  );
};

export default ToastContainer;
