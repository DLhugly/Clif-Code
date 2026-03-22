import { Component, For, Show, createMemo } from "solid-js";
import { securityResults, setSecurityShowModal } from "../../stores/securityStore";
import type { SecurityIssue } from "../../lib/tauri";

const SeverityBadge: Component<{ severity: string }> = (props) => {
  const color = () => {
    switch (props.severity) {
      case "critical": return { bg: "color-mix(in srgb, var(--accent-red) 15%, transparent)", text: "var(--accent-red)", label: "CRITICAL" };
      case "warning": return { bg: "color-mix(in srgb, var(--accent-yellow) 15%, transparent)", text: "var(--accent-yellow)", label: "WARNING" };
      default: return { bg: "var(--bg-hover)", text: "var(--text-muted)", label: "INFO" };
    }
  };
  return (
    <span style={{
      background: color().bg, color: color().text,
      "font-size": "9px", "font-weight": "700", "letter-spacing": "0.05em",
      padding: "2px 6px", "border-radius": "4px",
    }}>
      {color().label}
    </span>
  );
};

const SecurityModal: Component<{
  mode: "pre-commit" | "scan";
  onCommitAnyway?: () => void;
  onClose: () => void;
}> = (props) => {
  const results = () => securityResults();
  const criticals = createMemo(() => results().filter(r => r.severity === "critical"));
  const warnings = createMemo(() => results().filter(r => r.severity === "warning"));
  const infos = createMemo(() => results().filter(r => r.severity === "info"));

  const IssueRow: Component<{ issue: SecurityIssue }> = (issueProps) => (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--bg-base)",
        "border-radius": "6px",
        "margin-bottom": "4px",
        "border-left": issueProps.issue.severity === "critical"
          ? "3px solid var(--accent-red)"
          : issueProps.issue.severity === "warning"
          ? "3px solid var(--accent-yellow)"
          : "3px solid var(--border-default)",
      }}
    >
      <div class="flex items-center gap-2 mb-1">
        <SeverityBadge severity={issueProps.issue.severity} />
        <span style={{ "font-size": "11px", "font-weight": "600", color: "var(--text-primary)" }}>
          {issueProps.issue.description}
        </span>
      </div>
      <div style={{ "font-size": "11px", color: "var(--text-muted)", "font-family": "var(--font-mono, monospace)", "margin-bottom": "4px" }}>
        {issueProps.issue.file}:{issueProps.issue.line}
      </div>
      <div style={{
        "font-size": "11px", "font-family": "var(--font-mono, monospace)",
        color: "var(--text-secondary)", background: "var(--bg-surface)",
        padding: "4px 8px", "border-radius": "4px",
        overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap",
      }}>
        {issueProps.issue.snippet.trim()}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed", inset: "0", "z-index": "1000",
        background: "rgba(0,0,0,0.6)", "backdrop-filter": "blur(4px)",
        display: "flex", "align-items": "center", "justify-content": "center",
        padding: "24px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        style={{
          background: "var(--bg-surface)", "border-radius": "12px",
          border: "1px solid var(--border-default)",
          "box-shadow": "0 24px 60px rgba(0,0,0,0.5)",
          width: "100%", "max-width": "600px", "max-height": "80vh",
          display: "flex", "flex-direction": "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px", "border-bottom": "1px solid var(--border-muted)" }}>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-red)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span style={{ "font-weight": "700", "font-size": "14px", color: "var(--text-primary)" }}>
                {props.mode === "pre-commit" ? "Security scan before commit" : "Security scan results"}
              </span>
            </div>
            <button
              onClick={props.onClose}
              style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", "font-size": "18px" }}
            >
              ×
            </button>
          </div>
          <div style={{ "font-size": "12px", color: "var(--text-muted)", "margin-top": "4px" }}>
            Found {results().length} issue{results().length !== 1 ? "s" : ""} —
            <Show when={criticals().length > 0}>
              <span style={{ color: "var(--accent-red)", "font-weight": "600" }}> {criticals().length} critical</span>
            </Show>
            <Show when={warnings().length > 0}>
              <span style={{ color: "var(--accent-yellow)", "font-weight": "600" }}> {warnings().length} warning{warnings().length !== 1 ? "s" : ""}</span>
            </Show>
            <Show when={infos().length > 0}>
              <span style={{ color: "var(--text-muted)" }}> {infos().length} info</span>
            </Show>
          </div>
        </div>

        {/* Issues list */}
        <div style={{ padding: "12px 16px", "overflow-y": "auto", flex: "1" }}>
          <Show when={criticals().length > 0}>
            <div style={{ "font-size": "10px", "font-weight": "700", "text-transform": "uppercase", "letter-spacing": "0.08em", color: "var(--accent-red)", "margin-bottom": "6px" }}>
              Critical
            </div>
            <For each={criticals()}>
              {(issue) => <IssueRow issue={issue} />}
            </For>
          </Show>
          <Show when={warnings().length > 0}>
            <div style={{ "font-size": "10px", "font-weight": "700", "text-transform": "uppercase", "letter-spacing": "0.08em", color: "var(--accent-yellow)", "margin-top": criticals().length > 0 ? "12px" : "0", "margin-bottom": "6px" }}>
              Warnings
            </div>
            <For each={warnings()}>
              {(issue) => <IssueRow issue={issue} />}
            </For>
          </Show>
          <Show when={infos().length > 0}>
            <div style={{ "font-size": "10px", "font-weight": "700", "text-transform": "uppercase", "letter-spacing": "0.08em", color: "var(--text-muted)", "margin-top": "12px", "margin-bottom": "6px" }}>
              Info
            </div>
            <For each={infos()}>
              {(issue) => <IssueRow issue={issue} />}
            </For>
          </Show>
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 16px", "border-top": "1px solid var(--border-muted)", display: "flex", gap: "8px", "justify-content": "flex-end" }}>
          <Show when={props.mode === "pre-commit"}>
            <button
              onClick={props.onClose}
              style={{
                padding: "8px 16px", "border-radius": "8px", "font-size": "13px",
                "font-weight": "600", background: "var(--bg-active)",
                color: "var(--text-primary)", border: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              Fix issues first
            </button>
            <button
              onClick={() => { props.onCommitAnyway?.(); props.onClose(); }}
              style={{
                padding: "8px 16px", "border-radius": "8px", "font-size": "13px",
                "font-weight": "600", cursor: "pointer",
                background: "color-mix(in srgb, var(--accent-red) 20%, transparent)",
                color: "var(--accent-red)", border: "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)",
              }}
            >
              Commit anyway
            </button>
          </Show>
          <Show when={props.mode === "scan"}>
            <button
              onClick={props.onClose}
              style={{
                padding: "8px 16px", "border-radius": "8px", "font-size": "13px",
                "font-weight": "600", background: "var(--accent-primary)",
                color: "#fff", border: "none", cursor: "pointer",
              }}
            >
              Close
            </button>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default SecurityModal;
