import { Component, Show, createSignal, onMount } from "solid-js";
import { activeFile, projectRoot } from "../../stores/fileStore";

const hasProject = () => !!projectRoot();
import { isGitRepo, currentBranch, aheadBehind, fetchRemote } from "../../stores/gitStore";
import { theme, THEMES, agentVisible, toggleAgentPanel, terminalVisible, toggleTerminal, editorVisible, toggleEditor } from "../../stores/uiStore";
import { checkForUpdate, installUpdate, type UpdateStatus } from "../../lib/updater";
import type { Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";

const TerminalIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="4 17 10 11 4 5" />
    <line x1="12" y1="19" x2="20" y2="19" />
  </svg>
);

const SparkleIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
);

const StatusBar: Component<{ onShowAbout?: () => void; onLaunchClifCode?: () => void; onLaunchClaude?: () => void }> = (props) => {
  const [appVersion, setAppVersion] = createSignal("...");
  const [updateStatus, setUpdateStatus] = createSignal<UpdateStatus>({ state: "idle" });
  const [pendingUpdate, setPendingUpdate] = createSignal<Update | null>(null);

  const filePath = () => {
    const file = activeFile();
    return file ? file.path : "";
  };

  const language = () => {
    const file = activeFile();
    return file ? file.language : "";
  };

  onMount(() => {
    getVersion().then((v) => setAppVersion(v)).catch(() => {});

    // Delay update check so it doesn't block startup
    setTimeout(async () => {
      try {
        const update = await checkForUpdate();
        if (update) {
          setPendingUpdate(update);
          setUpdateStatus({ state: "available", version: update.version, update });
        }
      } catch {
        // Updater endpoint is unreachable or returned a bad manifest —
        // fail silently on startup; user can retry by clicking the version chip
      }
    }, 3000);
  });

  const handleUpdateClick = async () => {
    const update = pendingUpdate();
    if (!update) return;

    setUpdateStatus({ state: "downloading", progress: 0 });

    try {
      await installUpdate(update, (progress) => {
        setUpdateStatus({ state: "downloading", progress });
      });
      // relaunch happens inside installUpdate, so we won't reach here normally
    } catch (e) {
      setUpdateStatus({
        state: "error",
        message: e instanceof Error ? e.message : "Update failed",
      });
    }
  };

  const updateLabel = () => {
    const status = updateStatus();
    switch (status.state) {
      case "checking":   return "Checking...";
      case "up-to-date": return `✓ Up to date`;
      case "available":  return `Update v${status.version}`;
      case "downloading": return `Updating ${status.progress}%`;
      case "installing": return "Installing...";
      case "error":      return "Update failed";
      default:           return `ClifPad v${appVersion()}`;
    }
  };

  async function forceCheckUpdate() {
    setUpdateStatus({ state: "checking" });
    try {
      const update = await checkForUpdate();
      if (update) {
        setPendingUpdate(update);
        setUpdateStatus({ state: "available", version: update.version, update });
      } else {
        setUpdateStatus({ state: "up-to-date" });
        setTimeout(() => setUpdateStatus({ state: "idle" }), 3000);
      }
    } catch (e) {
      setUpdateStatus({
        state: "error",
        message: e instanceof Error ? e.message : "Could not reach update server",
      });
      setTimeout(() => setUpdateStatus({ state: "idle" }), 4000);
    }
  }

  const isClickable = () => {
    const s = updateStatus().state;
    return s === "available" || s === "error";
  };

  return (
    <div
      class="flex items-center justify-between shrink-0 select-none transition-theme"
      style={{
        height: "var(--status-bar-height)",
        background: "var(--bg-surface)",
        "border-top": "1px solid var(--border-muted)",
        "font-size": "12px",
        "font-family": "var(--font-sans)",
        "padding-left": "8px",
        "padding-right": "8px",
      }}
    >
      {/* Left section — Terminal toggle + git + launch buttons */}
      <div class="flex items-center gap-2 min-w-0">
        {/* Terminal toggle */}
        <button
          class="flex items-center gap-1.5 rounded-lg shrink-0 transition-all duration-150"
          style={{
            background: terminalVisible() ? "var(--bg-active)" : "var(--bg-hover)",
            color: terminalVisible() ? "var(--text-primary)" : "var(--text-muted)",
            border: "1px solid var(--border-default)",
            padding: "3px 12px",
            cursor: "pointer",
            "font-size": "12px",
            "font-family": "var(--font-sans)",
            "font-weight": "500",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = terminalVisible() ? "var(--bg-active)" : "var(--bg-hover)"; }}
          onClick={() => toggleTerminal()}
          title={terminalVisible() ? "Hide terminal" : "Show terminal"}
        >
          <TerminalIcon />
          <span>Launch Terminal</span>
        </button>

        {/* Launch ClifCode */}
        <Show when={props.onLaunchClifCode}>
          <button
            class="flex items-center gap-1 rounded-lg shrink-0 transition-all duration-150"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
              padding: "3px 10px",
              cursor: "pointer",
              "font-size": "12px",
              "font-family": "var(--font-sans)",
              "font-weight": "500",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            onClick={() => props.onLaunchClifCode?.()}
            title="Launch ClifCode in terminal"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5" />
            </svg>
            <span>Launch ClifCode</span>
          </button>
        </Show>

        {/* Launch Claude */}
        <Show when={props.onLaunchClaude}>
          <button
            class="flex items-center gap-1 rounded-lg shrink-0 transition-all duration-150"
            style={{
              background: "var(--bg-hover)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-default)",
              padding: "3px 10px",
              cursor: "pointer",
              "font-size": "12px",
              "font-family": "var(--font-sans)",
              "font-weight": "500",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
            onClick={() => props.onLaunchClaude?.()}
            title="Launch Claude Code in terminal"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5" />
            </svg>
            <span>Launch Claude</span>
          </button>
        </Show>

        <Show when={isGitRepo()}>
          <div
            class="flex items-center gap-1.5 shrink-0"
            style={{ color: "var(--text-secondary)", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)"; }}
            title="Click to sync"
            onClick={() => { fetchRemote().catch(() => {}); }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 0 1-9 9" />
            </svg>
            <span class="truncate" style={{ "max-width": "120px" }}>
              {currentBranch() || "main"}
            </span>
            <Show when={aheadBehind().ahead > 0 || aheadBehind().behind > 0}>
              <span class="flex items-center gap-1" style={{ "font-size": "10px", "font-family": "var(--font-mono, monospace)" }}>
                <Show when={aheadBehind().ahead > 0}>
                  <span style={{ color: "var(--accent-green)" }}>{"\u2191"}{aheadBehind().ahead}</span>
                </Show>
                <Show when={aheadBehind().behind > 0}>
                  <span style={{ color: "var(--accent-blue)" }}>{"\u2193"}{aheadBehind().behind}</span>
                </Show>
              </span>
            </Show>
          </div>
        </Show>

        <Show when={filePath()}>
          <div class="truncate" style={{ color: "var(--text-muted)", "max-width": "200px" }} title={filePath()}>
            {filePath()}
          </div>
        </Show>
      </div>

      {/* Center section — Editor toggle + file info */}
      <div class="flex items-center gap-3">
        <button
          class="flex items-center gap-1.5 rounded-lg shrink-0 transition-all duration-150"
          style={{
            background: editorVisible() ? "var(--bg-active)" : "var(--bg-hover)",
            color: editorVisible() ? "var(--text-primary)" : "var(--text-muted)",
            border: "1px solid var(--border-default)",
            padding: "3px 12px",
            cursor: "pointer",
            "font-size": "12px",
            "font-family": "var(--font-sans)",
            "font-weight": "500",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = editorVisible() ? "var(--bg-active)" : "var(--bg-hover)"; }}
          onClick={() => toggleEditor()}
          title={editorVisible() ? "Hide editor" : "Show editor"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
          <span>Editor</span>
        </button>

        <Show when={language()}>
          <span style={{ color: "var(--text-muted)", "font-size": "11px" }}>{language()}</span>
        </Show>

        <Show when={activeFile()}>
          <span style={{ color: "var(--text-muted)", "font-size": "11px" }}>UTF-8</span>
        </Show>

      </div>

      {/* Right section — Agent toggle + version */}
      <div class="flex items-center gap-3 shrink-0">
        {/* Agent toggle */}
        <button
          class="flex items-center gap-1.5 rounded-lg shrink-0 transition-all duration-150"
          style={{
            background: agentVisible() ? "var(--bg-active)" : "var(--bg-hover)",
            color: agentVisible() ? "var(--text-primary)" : "var(--text-muted)",
            border: "1px solid var(--border-default)",
            padding: "3px 12px",
            cursor: "pointer",
            "font-size": "12px",
            "font-family": "var(--font-sans)",
            "font-weight": "500",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = agentVisible() ? "var(--bg-active)" : "var(--bg-hover)"; }}
          onClick={() => toggleAgentPanel()}
          title={agentVisible() ? "Close agent" : "Open agent"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>Agent</span>
        </button>

        {/* Clif label with update indicator */}
        <Show when={!isClickable()}>
          <div
            class="flex items-center gap-1.5"
            style={{
              color: updateStatus().state === "downloading" || updateStatus().state === "installing"
                ? "var(--accent-yellow, #eab308)"
                : updateStatus().state === "up-to-date"
                ? "var(--accent-green)"
                : updateStatus().state === "checking"
                ? "var(--text-muted)"
                : "var(--accent-primary)",
              cursor: updateStatus().state === "idle" || updateStatus().state === "up-to-date" ? "pointer" : "default",
              position: "relative",
            }}
            title={updateStatus().state === "idle"
              ? `ClifPad v${appVersion()} — click to check for updates`
              : updateStatus().state === "up-to-date"
              ? "Already on latest version"
              : undefined}
            onClick={() => {
              if (updateStatus().state === "idle") forceCheckUpdate();
            }}
            onMouseEnter={(e) => {
              if (updateStatus().state === "idle") (e.currentTarget as HTMLElement).style.opacity = "0.7";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = "1";
            }}
          >
            <SparkleIcon />
            <span class="text-xs">{updateLabel()}</span>
          </div>
        </Show>
        <Show when={isClickable()}>
          <button
            class="flex items-center gap-1.5"
            style={{
              color: updateStatus().state === "error"
                ? "var(--accent-red)"
                : "var(--accent-primary)",
              background: updateStatus().state === "error"
                ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
                : "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              border: updateStatus().state === "error"
                ? "1px solid color-mix(in srgb, var(--accent-red) 30%, transparent)"
                : "1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)",
              "border-radius": "4px",
              padding: "2px 8px",
              cursor: "pointer",
              "font-size": "11px",
              "font-family": "var(--font-sans)",
              "font-weight": "600",
              "line-height": "1.4",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => e.currentTarget.style.opacity = "0.85"}
            onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
            onClick={handleUpdateClick}
            title={
              updateStatus().state === "available"
                ? "Click to install update and restart"
                : "Click to retry update"
            }
          >
            <SparkleIcon />
            <span>{updateLabel()}</span>
          </button>
        </Show>
      </div>
    </div>
  );
};

export default StatusBar;
