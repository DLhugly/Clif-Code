import { Component, Show } from "solid-js";

interface InitProgress {
  step: number;
  total: number;
  message: string;
  elapsed_secs: number;
}

interface InitProjectBannerProps {
  progress: InitProgress;
}

const InitProjectBanner: Component<InitProjectBannerProps> = (props) => {
  return (
    <div
      class="shrink-0 px-3 py-2"
      style={{
        background: "color-mix(in srgb, var(--accent-primary) 6%, transparent)",
        "border-bottom": "1px solid color-mix(in srgb, var(--accent-primary) 12%, transparent)",
      }}
    >
      {/* Top row: icon + message + elapsed */}
      <div class="flex items-center gap-2 mb-1.5">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.5" class="animate-spin shrink-0">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span style={{ "font-size": "11px", color: "var(--accent-primary)", flex: "1", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
          {props.progress.message || "Scanning codebase..."}
        </span>
        <span style={{ "font-size": "10px", color: "var(--text-muted)", "flex-shrink": "0" }}>
          {props.progress.elapsed_secs > 0 ? `${props.progress.elapsed_secs}s` : ""}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ height: "3px", background: "color-mix(in srgb, var(--accent-primary) 15%, transparent)", "border-radius": "2px", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${Math.min(100, (props.progress.step / props.progress.total) * 100)}%`,
          background: "var(--accent-primary)",
          "border-radius": "2px",
          transition: "width 0.4s ease",
        }} />
      </div>
      {/* Bottom row: step count + hint */}
      <div class="flex items-center justify-between mt-1">
        <span style={{ "font-size": "10px", color: "var(--text-muted)" }}>
          Step {props.progress.step} / ~{props.progress.total} — building .clif/CLIF.md
        </span>
        <span style={{ "font-size": "10px", color: "var(--text-muted)" }}>
          You can chat while this runs
        </span>
      </div>
    </div>
  );
};

export default InitProjectBanner;
