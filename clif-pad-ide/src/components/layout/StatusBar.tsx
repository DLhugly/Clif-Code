import { Component, Show, createSignal, onMount } from "solid-js";
import { activeFile, projectRoot } from "../../stores/fileStore";

const hasProject = () => !!projectRoot();
import { isGitRepo, currentBranch, aheadBehind, fetchRemote } from "../../stores/gitStore";
import { theme, THEMES, agentVisible, toggleAgentPanel, terminalVisible, toggleTerminal } from "../../stores/uiStore";
import { securityEnabled, setSecurityEnabled, securityResults, securityScanning, setSecurityScanning, setSecurityResults, setSecurityShowModal, criticalCount, warningCount } from "../../stores/securityStore";
import { scanRepoSecurity } from "../../lib/tauri";
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
      const update = await checkForUpdate();
      if (update) {
        setPendingUpdate(update);
        setUpdateStatus({ state: "available", version: update.version, update });
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
      case "available":
        return `Update v${status.version}`;
      case "downloading":
        return `Updating ${status.progress}%`;
      case "installing":
        return "Installing...";
      case "error":
        return "Update failed";
      default:
        return `ClifPad v${appVersion()}`;
    }
  };

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
      {/* Left section */}
      <div class="flex items-center gap-3 min-w-0">
        {/* Git branch */}
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

        {/* Terminal toggle */}
        <button
          class="flex items-center gap-1.5 shrink-0"
          style={{
            background: "transparent",
            border: "none",
            color: terminalVisible() ? "var(--accent-green)" : "var(--text-muted)",
            cursor: "pointer",
            padding: "1px 4px",
            "border-radius": "3px",
            "font-size": "12px",
            "font-family": "var(--font-sans)",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
          onClick={() => toggleTerminal()}
          title={terminalVisible() ? "Hide terminal" : "Show terminal"}
        >
          <TerminalIcon />
          <span>{terminalVisible() ? "Terminal" : "Show Terminal"}</span>
        </button>

        {/* Divider */}
        <div style={{ width: "1px", height: "14px", background: "var(--border-default)", opacity: "0.4" }} />

        {/* Launch Clif Terminal */}
        <button
          class="flex items-center gap-1.5 shrink-0"
          style={{
            background: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
            color: hasProject() ? "var(--accent-primary)" : "var(--text-muted)",
            border: "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)",
            cursor: hasProject() ? "pointer" : "default",
            "font-size": "11px",
            "font-family": "var(--font-sans)",
            "font-weight": "600",
            opacity: hasProject() ? "1" : "0.5",
            padding: "2px 10px",
            "border-radius": "4px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { if (hasProject()) { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-primary) 22%, transparent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)"; } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-primary) 12%, transparent)"; (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent-primary) 25%, transparent)"; }}
          onClick={() => { if (hasProject()) props.onLaunchClifCode?.(); }}
          title="Launch ClifCode agent in terminal"
        >
          <TerminalIcon />
          <span>Launch ClifCode</span>
        </button>

        {/* Launch Claude Terminal */}
        <button
          class="flex items-center gap-1.5 shrink-0"
          style={{
            background: "color-mix(in srgb, var(--accent-purple, #a855f7) 12%, transparent)",
            color: hasProject() ? "var(--accent-purple, #a855f7)" : "var(--text-muted)",
            border: "1px solid color-mix(in srgb, var(--accent-purple, #a855f7) 25%, transparent)",
            cursor: hasProject() ? "pointer" : "default",
            "font-size": "11px",
            "font-family": "var(--font-sans)",
            "font-weight": "600",
            opacity: hasProject() ? "1" : "0.5",
            padding: "2px 10px",
            "border-radius": "4px",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { if (hasProject()) { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-purple, #a855f7) 22%, transparent)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-purple, #a855f7)"; } }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-purple, #a855f7) 12%, transparent)"; (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent-purple, #a855f7) 25%, transparent)"; }}
          onClick={() => { if (hasProject()) props.onLaunchClaude?.(); }}
          title="Launch Claude Code agent in terminal"
        >
          <TerminalIcon />
          <span>Launch Claude</span>
        </button>

        {/* File path */}
        <Show when={filePath()}>
          <div
            class="truncate"
            style={{
              color: "var(--text-muted)",
              "max-width": "300px",
            }}
            title={filePath()}
          >
            {filePath()}
          </div>
        </Show>
      </div>

      {/* Center spacer */}
      <div class="flex-1" />

      {/* Right section */}
      <div class="flex items-center gap-3 shrink-0">
        <Show when={activeFile()}>
          <span style={{ color: "var(--text-muted)" }}>
            Ln 1, Col 1
          </span>
        </Show>

        <Show when={language()}>
          <span style={{ color: "var(--text-secondary)" }}>
            {language()}
          </span>
        </Show>

        <Show when={activeFile()}>
          <span style={{ color: "var(--text-muted)" }}>
            UTF-8
          </span>
        </Show>

        {/* Security toggle + scan */}
        <div class="flex items-center gap-1">
          {/* Security mode toggle */}
          <button
            class="flex items-center gap-1"
            style={{
              background: "transparent", border: "none",
              color: securityEnabled() ? "var(--accent-green)" : "var(--text-muted)",
              cursor: "pointer", "font-size": "11px", "font-family": "var(--font-sans)",
              padding: "1px 4px", "border-radius": "3px", transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            onClick={() => setSecurityEnabled(!securityEnabled())}
            title={securityEnabled() ? "Security scan enabled (click to disable)" : "Security scan disabled (click to enable)"}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <Show when={securityResults().length > 0 && securityEnabled()}>
              <span style={{ color: criticalCount() > 0 ? "var(--accent-red)" : "var(--accent-yellow)", "font-weight": "600" }}>
                {criticalCount() > 0 ? `${criticalCount()} critical` : `${warningCount()} warn`}
              </span>
            </Show>
            <Show when={securityResults().length === 0 || !securityEnabled()}>
              <span>{securityEnabled() ? "Secure" : "Security off"}</span>
            </Show>
          </button>

          {/* Scan results badge (clickable to open modal) */}
          <Show when={securityResults().length > 0}>
            <button
              style={{
                background: criticalCount() > 0
                  ? "color-mix(in srgb, var(--accent-red) 15%, transparent)"
                  : "color-mix(in srgb, var(--accent-yellow) 15%, transparent)",
                color: criticalCount() > 0 ? "var(--accent-red)" : "var(--accent-yellow)",
                border: "none", "border-radius": "3px", cursor: "pointer",
                "font-size": "10px", "font-weight": "700", padding: "1px 5px",
              }}
              onClick={() => setSecurityShowModal(true)}
              title="View security issues"
            >
              {securityResults().length} issue{securityResults().length !== 1 ? "s" : ""}
            </button>
          </Show>

          {/* Scan repo button */}
          <Show when={securityEnabled() && !!projectRoot()}>
            <button
              class="flex items-center gap-1"
              style={{
                background: "transparent", border: "none",
                color: "var(--text-muted)", cursor: securityScanning() ? "default" : "pointer",
                "font-size": "11px", "font-family": "var(--font-sans)",
                padding: "1px 4px", "border-radius": "3px", transition: "all 0.15s",
                opacity: securityScanning() ? "0.5" : "1",
              }}
              onMouseEnter={(e) => { if (!securityScanning()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              onClick={async () => {
                if (securityScanning() || !projectRoot()) return;
                setSecurityScanning(true);
                try {
                  const issues = await scanRepoSecurity(projectRoot()!);
                  setSecurityResults(issues);
                  // path tracked in store
                  setSecurityShowModal(true);
                } catch (e) {
                  console.error("Security scan failed:", e);
                } finally {
                  setSecurityScanning(false);
                }
              }}
              title="Scan entire repo for security issues"
            >
              {securityScanning() ? "Scanning..." : "Scan repo"}
            </button>
          </Show>
        </div>

        {/* Agent chat toggle */}
        <button
          class="flex items-center gap-1.5"
          style={{
            background: agentVisible()
              ? "var(--accent-primary)"
              : "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
            color: agentVisible() ? "var(--accent-text)" : "var(--accent-primary)",
            border: agentVisible()
              ? "1px solid var(--accent-primary)"
              : "1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent)",
            "border-radius": "4px",
            padding: "2px 10px",
            cursor: "pointer",
            "font-size": "11px",
            "font-family": "var(--font-sans)",
            "font-weight": "600",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            if (!agentVisible()) {
              (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-primary) 22%, transparent)";
              (e.currentTarget as HTMLElement).style.borderColor = "var(--accent-primary)";
            }
          }}
          onMouseLeave={(e) => {
            if (!agentVisible()) {
              (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent-primary) 12%, transparent)";
              (e.currentTarget as HTMLElement).style.borderColor = "color-mix(in srgb, var(--accent-primary) 25%, transparent)";
            }
          }}
          onClick={() => toggleAgentPanel()}
          title={agentVisible() ? "Close agent chat" : "Open agent chat"}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span>{agentVisible() ? "Close Agent" : "Clif Agent"}</span>
        </button>

        {/* Clif label with update indicator */}
        <Show when={!isClickable()}>
          <div
            class="flex items-center gap-1.5"
            style={{
              color: updateStatus().state === "downloading" || updateStatus().state === "installing"
                ? "var(--accent-yellow, #eab308)"
                : "var(--accent-primary)",
              cursor: updateStatus().state === "idle" ? "pointer" : "default",
            }}
            title={`ClifPad v${appVersion()}`}
            onClick={() => {
              if (updateStatus().state === "idle" && props.onShowAbout) props.onShowAbout();
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
