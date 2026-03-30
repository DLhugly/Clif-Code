import { Component, onMount, onCleanup, createEffect, For, Show } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptySpawn, ptyWrite, ptyResize, ptyKill, onPtyOutput, onPtyExit } from "../../lib/tauri";
import { theme, fontSize } from "../../stores/uiStore";
import { settings } from "../../stores/settingsStore";
import { terminalThemes } from "../../lib/terminalThemes";
import {
  terminalTabs,
  activeTerminalId,
  setActiveTerminalId,
  createTerminalTab,
  removeTerminalTab,
  setTerminalSessionId,
} from "../../stores/terminalStore";
import type { UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

export interface TerminalPanelRef {
  sendCommand: (cmd: string) => void;
  clearTerminal: () => void;
}

interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  sessionId: string | null;
  container: HTMLDivElement;
  unlistenOutput?: UnlistenFn;
  unlistenExit?: UnlistenFn;
  dataDisposable?: { dispose: () => void };
  alive: boolean;
}

const instances = new Map<string, TerminalInstance>();

interface TerminalPanelProps {
  ref?: (ref: TerminalPanelRef) => void;
  workingDir?: string;
  onLaunchClifCode?: () => void;
  onLaunchClaude?: () => void;
}

const TerminalPanel: Component<TerminalPanelProps> = (props) => {
  let wrapperRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;

  function getActiveInstance(): TerminalInstance | undefined {
    return instances.get(activeTerminalId());
  }

  const sendCommand = (cmd: string) => {
    const inst = getActiveInstance();
    if (inst?.sessionId) {
      ptyWrite(inst.sessionId, cmd);
    }
  };

  const clearTerminal = () => {
    const inst = getActiveInstance();
    if (inst) {
      inst.terminal.clear();
      inst.terminal.write("\x1bc");
    }
  };

  function makeTerminalOptions() {
    const t = theme();
    const font = settings().terminalFont;
    return {
      fontSize: fontSize(),
      fontFamily: `${font}, Menlo, Monaco, Courier New, monospace`,
      cursorBlink: true,
      cursorStyle: "bar" as const,
      allowProposedApi: true,
      scrollback: 10000,
      theme: terminalThemes[t],
    };
  }

  async function spawnSession(inst: TerminalInstance, tabId: string, workingDir?: string) {
    inst.unlistenOutput?.();
    inst.unlistenExit?.();
    inst.dataDisposable?.dispose();

    try {
      const sid = await ptySpawn(workingDir);
      inst.sessionId = sid;
      setTerminalSessionId(tabId, sid);

      inst.unlistenOutput = await onPtyOutput((event) => {
        if (event.session_id === sid && event.data) {
          inst.terminal.write(event.data);
        }
      });

      inst.unlistenExit = await onPtyExit((event) => {
        if (event.session_id === sid && inst.alive) {
          inst.terminal.write("\r\n\x1b[33m[Session ended — restarting...]\x1b[0m\r\n\r\n");
          setTimeout(() => {
            if (inst.alive) spawnSession(inst, tabId, workingDir);
          }, 500);
        }
      });

      const dims = inst.fitAddon.proposeDimensions();
      if (dims) {
        await ptyResize(sid, dims.cols, dims.rows);
      }

      inst.dataDisposable = inst.terminal.onData((data) => {
        ptyWrite(sid, data);
      });
    } catch (e) {
      inst.terminal.write(`\r\n\x1b[31mFailed to start terminal: ${e}\x1b[0m\r\n`);
    }
  }

  function initInstance(tabId: string) {
    if (instances.has(tabId)) return;

    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.display = "none";

    const terminal = new Terminal(makeTerminalOptions());
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    const inst: TerminalInstance = {
      terminal,
      fitAddon,
      sessionId: null,
      container,
      alive: true,
    };

    instances.set(tabId, inst);
    wrapperRef.appendChild(container);
    terminal.open(container);

    requestAnimationFrame(() => fitAddon.fit());
    spawnSession(inst, tabId, props.workingDir);
  }

  function destroyInstance(tabId: string) {
    const inst = instances.get(tabId);
    if (!inst) return;
    inst.alive = false;
    inst.unlistenOutput?.();
    inst.unlistenExit?.();
    inst.dataDisposable?.dispose();
    if (inst.sessionId) {
      ptyKill(inst.sessionId).catch(() => {});
    }
    inst.terminal.dispose();
    inst.container.remove();
    instances.delete(tabId);
  }

  function showActive() {
    const aid = activeTerminalId();
    for (const [id, inst] of instances) {
      inst.container.style.display = id === aid ? "block" : "none";
      if (id === aid) {
        requestAnimationFrame(() => {
          inst.fitAddon.fit();
          inst.terminal.focus();
        });
      }
    }
  }

  function handleKill(tabId: string, e: MouseEvent) {
    e.stopPropagation();
    destroyInstance(tabId);
    removeTerminalTab(tabId);
  }

  onMount(() => {
    props.ref?.({ sendCommand, clearTerminal });

    const tabs = terminalTabs();
    for (const tab of tabs) {
      initInstance(tab.id);
    }
    showActive();

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        const inst = getActiveInstance();
        if (inst) {
          inst.fitAddon.fit();
          if (inst.sessionId) {
            const dims = inst.fitAddon.proposeDimensions();
            if (dims) {
              ptyResize(inst.sessionId, dims.cols, dims.rows);
            }
          }
        }
      });
    });
    resizeObserver.observe(wrapperRef);
  });

  createEffect(() => {
    const aid = activeTerminalId();
    if (aid && !instances.has(aid)) {
      initInstance(aid);
    }
    showActive();
  });

  createEffect(() => {
    const t = theme();
    for (const inst of instances.values()) {
      inst.terminal.options.theme = terminalThemes[t];
    }
  });

  createEffect(() => {
    const size = fontSize();
    for (const inst of instances.values()) {
      inst.terminal.options.fontSize = size;
      inst.fitAddon.fit();
    }
  });

  createEffect(() => {
    const font = settings().terminalFont;
    const family = `${font}, Menlo, Monaco, Courier New, monospace`;
    for (const inst of instances.values()) {
      inst.terminal.options.fontFamily = family;
      inst.fitAddon.fit();
    }
    document.fonts.load(`14px "${font}"`).then(() => {
      for (const inst of instances.values()) {
        inst.terminal.options.fontFamily = family;
        inst.fitAddon.fit();
      }
    });
  });

  let prevWorkingDir: string | undefined = undefined;
  createEffect(() => {
    const dir = props.workingDir;
    if (prevWorkingDir !== undefined && dir && dir !== prevWorkingDir) {
      const inst = getActiveInstance();
      const aid = activeTerminalId();
      if (inst && inst.sessionId) {
        ptyKill(inst.sessionId).catch(() => {});
        inst.unlistenOutput?.();
        inst.unlistenExit?.();
        inst.dataDisposable?.dispose();
        inst.sessionId = null;
        inst.terminal.clear();
        spawnSession(inst, aid, dir);
      }
    }
    prevWorkingDir = dir;
  });

  onCleanup(() => {
    resizeObserver?.disconnect();
    for (const [id] of instances) {
      destroyInstance(id);
    }
  });

  return (
    <div class="flex flex-col w-full h-full overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Tab bar */}
      <div
        class="flex items-center shrink-0 select-none"
        style={{
          height: "28px",
          "border-bottom": "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          "padding-left": "4px",
          gap: "0",
        }}
      >
        <div class="flex items-center flex-1 min-w-0 overflow-x-auto" style={{ gap: "0" }}>
          <For each={terminalTabs()}>
            {(tab) => (
              <div
                class="flex items-center shrink-0 cursor-pointer group"
                style={{
                  height: "28px",
                  padding: "0 8px 0 10px",
                  "font-size": "11px",
                  color: activeTerminalId() === tab.id ? "var(--text-primary)" : "var(--text-muted)",
                  background: activeTerminalId() === tab.id ? "var(--bg-base)" : "transparent",
                  "border-right": "1px solid var(--border-default)",
                  transition: "color 0.1s, background 0.1s",
                }}
                onClick={() => setActiveTerminalId(tab.id)}
              >
                <span
                  style={{
                    opacity: activeTerminalId() === tab.id ? "1" : "0.6",
                    "white-space": "nowrap",
                  }}
                >
                  {tab.name}
                </span>
                <Show when={terminalTabs().length > 1}>
                  <button
                    class="flex items-center justify-center"
                    style={{
                      width: "16px",
                      height: "16px",
                      "margin-left": "6px",
                      "border-radius": "3px",
                      border: "none",
                      background: "transparent",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      "font-size": "12px",
                      opacity: "0",
                      transition: "opacity 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; e.currentTarget.style.background = "transparent"; }}
                    onClick={(e) => handleKill(tab.id, e)}
                    title="Kill terminal"
                  >
                    ×
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* Launch Terminal Agents + New terminal + Clear buttons */}
        <div class="flex items-center shrink-0" style={{ padding: "0 6px", gap: "4px" }}>
          <Show when={props.onLaunchClifCode && props.onLaunchClaude}>
            <span style={{ "font-size": "10px", color: "var(--text-muted)", "margin-right": "2px" }}>Launch Terminal Agent:</span>
            <button
              class="flex items-center justify-center"
              style={{
                height: "20px",
                padding: "0 6px",
                "border-radius": "4px",
                border: "none",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                "font-size": "10px",
                "white-space": "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
              onClick={props.onLaunchClifCode}
              title="Launch ClifCode AI agent in terminal"
            >
              ClifCode
            </button>
            <button
              class="flex items-center justify-center"
              style={{
                height: "20px",
                padding: "0 6px",
                "border-radius": "4px",
                border: "none",
                background: "transparent",
                color: "var(--text-muted)",
                cursor: "pointer",
                "font-size": "10px",
                "white-space": "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
              onClick={props.onLaunchClaude}
              title="Launch Claude Code in terminal"
            >
              Claude
            </button>
            <div style={{ width: "1px", height: "14px", background: "var(--border-default)", margin: "0 4px" }} />
          </Show>
          <button
            class="flex items-center justify-center"
            style={{
              width: "22px",
              height: "22px",
              "border-radius": "4px",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              "font-size": "15px",
              "line-height": "1",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
            onClick={() => {
              const id = createTerminalTab();
              initInstance(id);
              showActive();
            }}
            title="New terminal"
          >
            +
          </button>
          <button
            class="flex items-center justify-center"
            style={{
              width: "22px",
              height: "22px",
              "border-radius": "4px",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              "font-size": "11px",
              "line-height": "1",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--text-muted)"; }}
            onClick={clearTerminal}
            title="Clear terminal"
          >
            ⌫
          </button>
        </div>
      </div>

      {/* Terminal container */}
      <div
        ref={wrapperRef}
        class="flex-1 min-h-0 overflow-hidden"
        style={{ padding: "4px 0 0 8px" }}
      />
    </div>
  );
};

export default TerminalPanel;
