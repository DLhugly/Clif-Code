import { Component, onMount, createEffect, Show, createSignal, lazy, Suspense } from "solid-js";
import TopBar from "./components/layout/TopBar";
import EditorArea from "./components/layout/EditorArea";
import StatusBar from "./components/layout/StatusBar";
import RightSidebar from "./components/layout/RightSidebar";
import AboutModal from "./components/layout/AboutModal";
import {
  terminalWidth, setTerminalWidth, terminalVisible, sidebarVisible, sidebarWidth, setSidebarWidth,
  applyTheme, setUiFontSize, toggleTerminal, toggleSidebar, setShowCommandPalette,
  leftPanel, rightPanel, agentWidth, setAgentWidth, setLeftPanel, setRightPanel, toggleAgentPanel,
} from "./stores/uiStore";
import { loadSettings, settings } from "./stores/settingsStore";
import { registerKeybinding, initKeybindings } from "./lib/keybindings";
import { saveActiveFile, projectRoot, openProject, openBrowser, togglePreview } from "./stores/fileStore";
import { initGit } from "./stores/gitStore";
import { configureMonaco } from "./lib/monaco-setup";
import { loadGoogleFont, applyUiFont } from "./lib/fonts";
import type { TerminalPanelRef } from "./components/terminal/TerminalPanel";

const TerminalPanel = lazy(() => import("./components/terminal/TerminalPanel"));
const AgentChatPanel = lazy(() => import("./components/agent/AgentChatPanel"));

const App: Component = () => {
  let terminalRef: TerminalPanelRef | undefined;
  const [isDraggingTerminal, setIsDraggingTerminal] = createSignal(false);
  const [isDraggingSidebar, setIsDraggingSidebar] = createSignal(false);
  const [isDraggingLeftAgent, setIsDraggingLeftAgent] = createSignal(false);
  const [isDraggingRightAgent, setIsDraggingRightAgent] = createSignal(false);
  const [showAbout, setShowAbout] = createSignal(false);

  function handleLaunchClaude() {
    if (terminalRef && projectRoot()) {
      terminalRef.sendCommand("claude\n");
    }
  }

  function handleLaunchClifCode() {
    if (terminalRef && projectRoot()) {
      terminalRef.sendCommand("clifcode\n");
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
      const rightPx = rightPanel() === "sidebar" ? sidebarWidth() : rightPanel() === "agent" ? agentWidth() : 0;
      const availableWidth = window.innerWidth - rightPx;
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

  function handleLeftAgentResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingLeftAgent(true);

    const onMouseMove = (e: MouseEvent) => {
      setAgentWidth(Math.max(280, Math.min(600, e.clientX)));
    };

    const onMouseUp = () => {
      setIsDraggingLeftAgent(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function handleRightAgentResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingRightAgent(true);

    const onMouseMove = (e: MouseEvent) => {
      const width = window.innerWidth - e.clientX;
      setAgentWidth(Math.max(280, Math.min(600, width)));
    };

    const onMouseUp = () => {
      setIsDraggingRightAgent(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  function ResizeHandle(props: {
    isDragging: () => boolean;
    onMouseDown: (e: MouseEvent) => void;
  }) {
    return (
      <div
        class="shrink-0 cursor-col-resize"
        style={{
          width: "5px",
          background: props.isDragging() ? "var(--accent-primary)" : "var(--border-default)",
          transition: props.isDragging() ? "none" : "background 0.15s",
        }}
        onMouseDown={props.onMouseDown}
        onMouseEnter={(e) => {
          if (!props.isDragging()) {
            (e.currentTarget as HTMLElement).style.background = "var(--accent-primary)";
          }
        }}
        onMouseLeave={(e) => {
          if (!props.isDragging()) {
            (e.currentTarget as HTMLElement).style.background = "var(--border-default)";
          }
        }}
      />
    );
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
    registerKeybinding("b", ["ctrl"], toggleSidebar, "Toggle sidebar");
    registerKeybinding("p", ["ctrl", "shift"], () => setShowCommandPalette(true), "Command palette");
    registerKeybinding("v", ["ctrl", "shift"], togglePreview, "Toggle markdown preview");
    registerKeybinding("a", ["ctrl", "shift"], toggleAgentPanel, "Toggle agent panel");

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
      <TopBar onLaunchClaude={handleLaunchClaude} onLaunchClifCode={handleLaunchClifCode} onOpenFolder={handleOpenFolder} onOpenBrowser={openBrowser} />

      {/* Main content: Left Panel + Editor (center) + Right Panel */}
      <div class="flex flex-1 min-h-0">
        {/* Left Panel */}
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
          <ResizeHandle isDragging={isDraggingTerminal} onMouseDown={handleTerminalResize} />
        </Show>

        <Show when={leftPanel() === "agent"}>
          <div
            style={{ width: `${agentWidth()}px` }}
            class="h-full shrink-0"
          >
            <Suspense fallback={<div class="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>Loading agent...</div>}>
              <AgentChatPanel />
            </Suspense>
          </div>
          <ResizeHandle isDragging={isDraggingLeftAgent} onMouseDown={handleLeftAgentResize} />
        </Show>

        {/* Editor Panel (always center) */}
        <div class="flex-1 min-w-0 h-full">
          <EditorArea />
        </div>

        {/* Right Panel */}
        <Show when={rightPanel() === "sidebar"}>
          <ResizeHandle isDragging={isDraggingSidebar} onMouseDown={handleSidebarResize} />
          <div
            style={{ width: `${sidebarWidth()}px` }}
            class="h-full shrink-0"
          >
            <RightSidebar onOpenFolder={handleOpenFolder} />
          </div>
        </Show>

        <Show when={rightPanel() === "agent"}>
          <ResizeHandle isDragging={isDraggingRightAgent} onMouseDown={handleRightAgentResize} />
          <div
            style={{ width: `${agentWidth()}px` }}
            class="h-full shrink-0"
          >
            <Suspense fallback={<div class="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>Loading agent...</div>}>
              <AgentChatPanel />
            </Suspense>
          </div>
        </Show>
      </div>

      {/* Status Bar */}
      <StatusBar onShowAbout={() => setShowAbout(true)} />

      {/* About Modal */}
      <AboutModal open={showAbout()} onClose={() => setShowAbout(false)} />
    </div>
  );
};

export default App;
