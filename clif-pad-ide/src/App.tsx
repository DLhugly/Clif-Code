import { Component, onMount, createEffect, Show, createSignal, lazy, Suspense } from "solid-js";
import TopBar from "./components/layout/TopBar";
import EditorArea from "./components/layout/EditorArea";
import StatusBar from "./components/layout/StatusBar";
import RightSidebar from "./components/layout/RightSidebar";
import AboutModal from "./components/layout/AboutModal";
import ToastContainer from "./components/layout/ToastContainer";
import { terminalWidth, setTerminalWidth, terminalVisible, sidebarVisible, sidebarWidth, setSidebarWidth, agentWidth, setAgentWidth, agentVisible, applyTheme, setUiFontSize, toggleTerminal, toggleSidebar, setShowCommandPalette, leftPanel, rightPanel, setLeftPanel, setRightPanel } from "./stores/uiStore";
import { loadSettings, settings } from "./stores/settingsStore";
import { registerKeybinding, initKeybindings } from "./lib/keybindings";
import { saveActiveFile, projectRoot, openProject, openBrowser, togglePreview } from "./stores/fileStore";
import { initGit } from "./stores/gitStore";
import { configureMonaco } from "./lib/monaco-setup";
import { loadGoogleFont, applyUiFont } from "./lib/fonts";
import { createTerminalTab } from "./stores/terminalStore";
import type { TerminalPanelRef } from "./components/terminal/TerminalPanel";

const TerminalPanel = lazy(() => import("./components/terminal/TerminalPanel"));
const AgentChatPanel = lazy(() => import("./components/agent/AgentChatPanel"));

const App: Component = () => {
  let terminalRef: TerminalPanelRef | undefined;
  const [isDraggingTerminal, setIsDraggingTerminal] = createSignal(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = createSignal(false);
  const [isDraggingAgent, setIsDraggingAgent] = createSignal(false);
  const [showAbout, setShowAbout] = createSignal(false);

  function handleLaunchClaude() {
    if (terminalRef && projectRoot()) {
      terminalRef.sendCommand("claude\n");
    }
  }

  function handleLaunchClifCode() {
    const root = projectRoot();
    if (terminalRef && root) {
      terminalRef.sendCommand(`clifcode -w ${JSON.stringify(root)}\n`);
    }
  }

  async function handleOpenFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Open Folder",
      });
      if (selected && typeof selected === "string") {
        await openProject(selected);
        if (terminalRef) {
          terminalRef.sendCommand(`cd ${JSON.stringify(selected)}\n`);
        }
        await initGit();
      }
    } catch {
      console.warn("Tauri dialog plugin not available");
    }
  }

  function handleTerminalResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingTerminal(true);

    const onMouseMove = (e: MouseEvent) => {
      const sidebarPx = sidebarVisible() ? sidebarWidth() : 0;
      const availableWidth = window.innerWidth - sidebarPx;
      const pct = (e.clientX / availableWidth) * 100;
      setTerminalWidth(Math.max(20, Math.min(80, pct)));
    };

    const onMouseUp = () => {
      setIsDraggingTerminal(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleSidebarResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingSidebar(true);

    const onMouseMove = (e: MouseEvent) => {
      const width = window.innerWidth - e.clientX;
      setSidebarWidth(Math.max(180, Math.min(500, width)));
    };

    const onMouseUp = () => {
      setIsDraggingSidebar(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleAgentResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingAgent(true);

    const onMouseMove = (e: MouseEvent) => {
      const width = window.innerWidth - e.clientX;
      setAgentWidth(Math.max(280, Math.min(700, width)));
    };

    const onMouseUp = () => {
      setIsDraggingAgent(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  createEffect(async () => {
    const root = projectRoot();
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    if (root) {
      const folder = root.split("/").pop() || root;
      getCurrentWindow().setTitle(`${folder} — ClifPad`);
    } else {
      getCurrentWindow().setTitle("ClifPad");
    }
  });

  onMount(async () => {
    configureMonaco();

    await loadSettings();
    const s = settings();
    applyTheme(s.theme);
    setUiFontSize(s.fontSize);

    // Restore layout from settings
    if (s.leftPanel) setLeftPanel(s.leftPanel);
    if (s.rightPanel) setRightPanel(s.rightPanel);

    // Load and apply saved fonts
    loadGoogleFont(s.editorFont);
    loadGoogleFont(s.terminalFont);
    loadGoogleFont(s.uiFont);
    applyUiFont(s.uiFont);

    registerKeybinding("s", ["ctrl"], saveActiveFile, "Save file");
    registerKeybinding("`", ["ctrl"], toggleTerminal, "Toggle terminal");
    registerKeybinding("`", ["ctrl", "shift"], () => createTerminalTab(), "New terminal");
    registerKeybinding("k", ["meta"], () => terminalRef?.clearTerminal(), "Clear terminal");
    registerKeybinding("b", ["ctrl"], toggleSidebar, "Toggle sidebar");
    registerKeybinding("p", ["ctrl", "shift"], () => setShowCommandPalette(true), "Command palette");
    registerKeybinding("v", ["ctrl", "shift"], togglePreview, "Toggle markdown preview");

    initKeybindings();

    // Listen for "About ClifPad" from the system menu
    const { listen } = await import("@tauri-apps/api/event");
    listen("show-about", () => setShowAbout(true));
  });

  return (
    <div
      class="flex flex-col w-full h-screen overflow-hidden"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Top Bar */}
      <TopBar onOpenFolder={handleOpenFolder} onOpenBrowser={openBrowser} />

      {/* Main content: Left Panel + Editor (center) + Right Panel */}
      <div class="flex flex-1 min-h-0">
        {/* Left Panel: Terminal */}
        <Show when={leftPanel() === "terminal"}>
          <div
            style={{ width: `${terminalWidth()}%` }}
            class="h-full min-w-0 shrink-0"
          >
            <Suspense
              fallback={
                <div
                  class="flex items-center justify-center h-full"
                  style={{ color: "var(--text-muted)", background: "var(--bg-base)" }}
                >
                  <span class="text-sm">Starting terminal...</span>
                </div>
              }
            >
              <TerminalPanel ref={(r) => (terminalRef = r)} workingDir={projectRoot() || undefined} />
            </Suspense>
          </div>

          {/* Terminal Resize Handle */}
          <div
            class="shrink-0 cursor-col-resize"
            style={{
              width: "5px",
              background: isDraggingTerminal() ? "var(--accent-primary)" : "var(--border-default)",
              transition: isDraggingTerminal() ? "none" : "background 0.15s",
            }}
            onMouseDown={handleTerminalResize}
            onMouseEnter={(e) => {
              if (!isDraggingTerminal()) {
                (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isDraggingTerminal()) {
                (e.currentTarget as HTMLElement).style.background = "var(--border-default)";
              }
            }}
          />
        </Show>

        {/* Editor Panel (always center) */}
        <div class="flex-1 min-w-0 h-full">
          <EditorArea />
        </div>

        {/* Right Panel: Sidebar */}
        <Show when={sidebarVisible()}>
          {/* Sidebar Resize Handle */}
          <div
            class="shrink-0 cursor-col-resize"
            style={{
              width: "5px",
              background: isDraggingSidebar() ? "var(--accent-primary)" : "var(--border-default)",
              transition: isDraggingSidebar() ? "none" : "background 0.15s",
            }}
            onMouseDown={handleSidebarResize}
            onMouseEnter={(e) => {
              if (!isDraggingSidebar()) {
                (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isDraggingSidebar()) {
                (e.currentTarget as HTMLElement).style.background = "var(--border-default)";
              }
            }}
          />

          <div
            style={{ width: `${sidebarWidth()}px` }}
            class="h-full shrink-0"
          >
            <RightSidebar onOpenFolder={handleOpenFolder} onOpenRecent={async (path) => {
              await openProject(path);
              if (terminalRef) {
                terminalRef.sendCommand(`cd ${JSON.stringify(path)}\n`);
              }
              await initGit();
            }} />
          </div>
        </Show>

        {/* Agent Panel (independent, between editor and sidebar) */}
        <Show when={agentVisible()}>
          <div
            class="shrink-0 cursor-col-resize"
            style={{
              width: "5px",
              background: isDraggingAgent() ? "var(--accent-primary)" : "var(--border-default)",
              transition: isDraggingAgent() ? "none" : "background 0.15s",
            }}
            onMouseDown={handleAgentResize}
            onMouseEnter={(e) => {
              if (!isDraggingAgent()) {
                (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isDraggingAgent()) {
                (e.currentTarget as HTMLElement).style.background = "var(--border-default)";
              }
            }}
          />

          <div
            style={{ width: `${agentWidth()}px` }}
            class="h-full shrink-0"
          >
            <Suspense
              fallback={
                <div
                  class="flex items-center justify-center h-full"
                  style={{ color: "var(--text-muted)", background: "var(--bg-surface)" }}
                >
                  <span class="text-sm">Loading agent...</span>
                </div>
              }
            >
              <AgentChatPanel />
            </Suspense>
          </div>
        </Show>
      </div>

      {/* Status Bar */}
      <StatusBar onShowAbout={() => setShowAbout(true)} onLaunchClifCode={handleLaunchClifCode} onLaunchClaude={handleLaunchClaude} />

      {/* About Modal */}
      <AboutModal open={showAbout()} onClose={() => setShowAbout(false)} />

      {/* Toasts */}
      <ToastContainer />
    </div>
  );
};

export default App;
