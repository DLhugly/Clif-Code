import { Component, Show, createSignal } from "solid-js";

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

const BrowserPanel: Component = () => {
  const [url, setUrl] = createSignal("");
  const [loadedUrl, setLoadedUrl] = createSignal("");
  const [iframeKey, setIframeKey] = createSignal(0);

  function navigate() {
    let value = url().trim();
    if (!value) return;
    if (!/^https?:\/\//i.test(value)) {
      value = "http://" + value;
      setUrl(value);
    }
    setLoadedUrl(value);
    setIframeKey((k) => k + 1);
  }

  return (
    <div class="flex flex-col h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* URL bar */}
      <div
        class="flex items-center gap-2 shrink-0 px-3 py-1.5"
        style={{ "border-bottom": "1px solid var(--border-default)", background: "var(--bg-surface)" }}
      >
        <span style={{ color: "var(--text-muted)", "flex-shrink": "0" }}>
          <GlobeIcon />
        </span>
        <input
          type="text"
          class="flex-1 text-sm rounded px-2 py-1 outline-none min-w-0"
          style={{
            background: "var(--bg-base)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
          }}
          placeholder="Enter URL (e.g. localhost:3000)"
          value={url()}
          onInput={(e) => setUrl(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate();
          }}
        />
        <button
          class="flex items-center justify-center rounded shrink-0"
          style={{
            width: "28px",
            height: "28px",
            color: "var(--text-muted)",
            background: "transparent",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
          }}
          onClick={() => {
            if (loadedUrl()) setIframeKey((k) => k + 1);
          }}
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>

      {/* Iframe / empty state */}
      <div class="flex-1 min-h-0 overflow-hidden">
        <Show
          when={loadedUrl()}
          fallback={
            <div class="flex flex-col items-center justify-center h-full gap-3 select-none">
              <svg
                width="48" height="48" viewBox="0 0 24 24" fill="none"
                stroke="var(--text-muted)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"
                style={{ opacity: "0.4" }}
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <p class="text-sm" style={{ color: "var(--text-muted)" }}>Enter a URL to browse</p>
            </div>
          }
        >
          <iframe
            src={`${loadedUrl()}${loadedUrl().includes("?") ? "&" : "?"}_r=${iframeKey()}`}
            class="w-full h-full border-0"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
            title="Browser"
          />
        </Show>
      </div>
    </div>
  );
};

export default BrowserPanel;
