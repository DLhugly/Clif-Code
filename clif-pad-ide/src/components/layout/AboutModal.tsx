import { Component, Show, onMount, createSignal } from "solid-js";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";

const AboutModal: Component<{ open: boolean; onClose: () => void }> = (props) => {
  const [appVersion, setAppVersion] = createSignal("...");

  onMount(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => {});
  });

  return (
    <Show when={props.open}>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-[999] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.5)", "backdrop-filter": "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        {/* Modal */}
        <div
          class="flex flex-col items-center gap-4 rounded-xl p-6"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
            "box-shadow": "var(--shadow-lg)",
            "min-width": "320px",
            "max-width": "400px",
          }}
        >
          {/* Logo / Icon */}
          <div
            class="flex items-center justify-center rounded-xl"
            style={{
              width: "56px",
              height: "56px",
              background: "linear-gradient(135deg, var(--accent-primary), var(--accent-purple))",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>

          {/* Title & version */}
          <div class="text-center">
            <h2 class="text-lg font-bold" style={{ color: "var(--text-primary)" }}>ClifPad</h2>
            <span class="text-xs" style={{ color: "var(--text-muted)" }}>v{appVersion()}</span>
          </div>

          <p class="text-xs text-center" style={{ color: "var(--text-secondary)", "line-height": "1.5" }}>
            AI-native desktop code editor built with Tauri, SolidJS, and Monaco Editor.
          </p>

          {/* Links */}
          <div class="flex flex-col gap-2 w-full">
            <button
              class="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs transition-colors"
              style={{ color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border-muted)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
              onClick={() => open("https://github.com/nicepkg/clifcode")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              GitHub Repository
            </button>
            <button
              class="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs transition-colors"
              style={{ color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border-muted)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
              onClick={() => open("https://clifcode.io")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              Website — clifcode.io
            </button>
            <button
              class="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs transition-colors"
              style={{ color: "var(--text-secondary)", background: "var(--bg-base)", border: "1px solid var(--border-muted)", cursor: "pointer" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-base)"; }}
              onClick={() => open("https://github.com/nicepkg/clifcode/issues")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Report an Issue
            </button>
          </div>

          {/* Close button */}
          <button
            class="mt-1 px-6 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              color: "var(--text-primary)",
              background: "var(--bg-hover)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onClick={props.onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Show>
  );
};

export default AboutModal;
