import { Component } from "solid-js";
import { viewMode, setViewMode } from "../../stores/uiStore";

const CodeIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const ReviewIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <path d="M13 6h3a2 2 0 0 1 2 2v7" />
    <line x1="6" y1="9" x2="6" y2="21" />
  </svg>
);

const ModeToggle: Component = () => {
  const isCode = () => viewMode() === "code";
  const isReview = () => viewMode() === "review";

  return (
    <div
      class="flex items-center rounded-lg overflow-hidden"
      style={{
        border: "1px solid var(--border-default)",
        background: "var(--bg-base)",
        height: "26px",
      }}
    >
      <button
        class="flex items-center gap-1 px-2.5 transition-colors"
        style={{
          height: "100%",
          background: isCode() ? "var(--accent-primary)" : "transparent",
          color: isCode() ? "#fff" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          "font-size": "11px",
          "font-weight": "600",
        }}
        onClick={() => setViewMode("code")}
        title="Code mode — normal IDE (Cmd+Shift+R to toggle)"
      >
        <CodeIcon />
        <span>Code</span>
      </button>
      <button
        class="flex items-center gap-1 px-2.5 transition-colors"
        style={{
          height: "100%",
          background: isReview() ? "var(--accent-primary)" : "transparent",
          color: isReview() ? "#fff" : "var(--text-muted)",
          border: "none",
          cursor: "pointer",
          "font-size": "11px",
          "font-weight": "600",
          "border-left": "1px solid var(--border-default)",
        }}
        onClick={() => setViewMode("review")}
        title="Review mode — PR review workspace (Cmd+Shift+R to toggle)"
      >
        <ReviewIcon />
        <span>Review</span>
      </button>
    </div>
  );
};

export default ModeToggle;
