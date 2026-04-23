import { Component } from "solid-js";
import { viewMode, setViewMode } from "../../stores/uiStore";

const CodeIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const ReviewIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    <line x1="6" y1="9" x2="6" y2="21" />
  </svg>
);

/**
 * Segmented pill with a sliding accent indicator. The inactive side stays
 * fully transparent so the toggle sits light against the top bar; the active
 * side lights up with a tinted accent + bold text. Feels like a tab control
 * instead of two tightly-packed buttons with hard dividers.
 */
const ModeToggle: Component = () => {
  const isCode = () => viewMode() === "code";
  const isReview = () => viewMode() === "review";

  return (
    <div
      class="flex items-center relative"
      style={{
        border: "1px solid var(--border-default)",
        background: "color-mix(in srgb, var(--bg-base) 70%, transparent)",
        height: "24px",
        "border-radius": "999px",
        padding: "2px",
        gap: "2px",
      }}
      role="tablist"
      aria-label="View mode"
    >
      <button
        class="flex items-center gap-1 transition-all"
        style={{
          height: "100%",
          padding: "0 10px",
          background: isCode()
            ? "color-mix(in srgb, var(--accent-primary) 22%, transparent)"
            : "transparent",
          color: isCode() ? "var(--accent-primary)" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          "font-size": "11px",
          "font-weight": isCode() ? "700" : "500",
          "border-radius": "999px",
          "letter-spacing": "0.01em",
        }}
        onClick={() => setViewMode("code")}
        title="Code mode — normal IDE (Cmd+Shift+R to toggle)"
        aria-selected={isCode()}
        role="tab"
      >
        <CodeIcon />
        <span>Code</span>
      </button>
      <button
        class="flex items-center gap-1 transition-all"
        style={{
          height: "100%",
          padding: "0 10px",
          background: isReview()
            ? "color-mix(in srgb, var(--accent-primary) 22%, transparent)"
            : "transparent",
          color: isReview() ? "var(--accent-primary)" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          "font-size": "11px",
          "font-weight": isReview() ? "700" : "500",
          "border-radius": "999px",
          "letter-spacing": "0.01em",
        }}
        onClick={() => setViewMode("review")}
        title="Review mode — PR review workspace (Cmd+Shift+R to toggle)"
        aria-selected={isReview()}
        role="tab"
      >
        <ReviewIcon />
        <span>Review</span>
      </button>
    </div>
  );
};

export default ModeToggle;
