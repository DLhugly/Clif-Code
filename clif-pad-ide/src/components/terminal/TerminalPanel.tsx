import { Component, onMount, onCleanup, createSignal, createEffect } from "solid-js";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptySpawn, ptyWrite, ptyResize, ptyKill, onPtyOutput, onPtyExit } from "../../lib/tauri";
import { theme, fontSize } from "../../stores/uiStore";
import { settings } from "../../stores/settingsStore";
import { terminalThemes } from "../../lib/terminalThemes";
import type { UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

export interface TerminalPanelRef {
  sendCommand: (cmd: string) => void;
}

const TerminalPanel: Component<{ ref?: (ref: TerminalPanelRef) => void; workingDir?: string }> = (props) => {
  let containerRef!: HTMLDivElement;
  let terminal: Terminal | undefined;
  let fitAddon: FitAddon | undefined;
  const [sessionId, setSessionId] = createSignal<string | null>(null);
  let unlistenOutput: UnlistenFn | undefined;
  let unlistenExit: UnlistenFn | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let dataDisposable: { dispose: () => void } | undefined;
  let alive = true;

  const sendCommand = (cmd: string) => {
    const sid = sessionId();
    if (sid) {
      ptyWrite(sid, cmd);
    }
  };

  async function spawnSession(workingDir?: string) {
    if (!terminal || !fitAddon) return;

    unlistenOutput?.();
    unlistenExit?.();
    dataDisposable?.dispose();

    try {
      const sid = await ptySpawn(workingDir);
      setSessionId(sid);

      unlistenOutput = await onPtyOutput((event) => {
        if (event.session_id === sid && event.data) {
          terminal?.write(event.data);
        }
      });

      unlistenExit = await onPtyExit((event) => {
        if (event.session_id === sid && alive) {
          terminal?.write("\r\n\x1b[33m[Session ended — restarting shell...]\x1b[0m\r\n\r\n");
          setTimeout(() => {
            if (alive) spawnSession(workingDir);
          }, 500);
        }
      });

      const dims = fitAddon.proposeDimensions();
      if (dims) {
        await ptyResize(sid, dims.cols, dims.rows);
      }

      dataDisposable = terminal.onData((data) => {
        ptyWrite(sid, data);
      });
    } catch (e) {
      terminal?.write(`\r\n\x1b[31mFailed to start terminal: ${e}\x1b[0m\r\n`);
    }
  }

  onMount(async () => {
    props.ref?.({ sendCommand });

    const t = theme();
    const font = settings().terminalFont;
    terminal = new Terminal({
      fontSize: fontSize(),
      fontFamily: `${font}, Menlo, Monaco, Courier New, monospace`,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 10000,
      theme: terminalThemes[t],
    });

    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef);

    requestAnimationFrame(() => {
      fitAddon?.fit();
    });

    await spawnSession(props.workingDir);

    resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddon && terminal) {
          fitAddon.fit();
          const sid = sessionId();
          if (sid) {
            const dims = fitAddon.proposeDimensions();
            if (dims) {
              ptyResize(sid, dims.cols, dims.rows);
            }
          }
        }
      });
    });
    resizeObserver.observe(containerRef);
  });

  // Watch theme changes
  createEffect(() => {
    const t = theme();
    if (terminal) {
      terminal.options.theme = terminalThemes[t];
    }
  });

  // Watch font size changes
  createEffect(() => {
    const size = fontSize();
    if (terminal) {
      terminal.options.fontSize = size;
      fitAddon?.fit();
    }
  });

  // Watch terminal font changes
  createEffect(() => {
    const font = settings().terminalFont;
    if (terminal) {
      const family = `${font}, Menlo, Monaco, Courier New, monospace`;
      terminal.options.fontFamily = family;
      fitAddon?.fit();
      // Wait for the specific font to load, then re-fit so xterm renders with it
      document.fonts.load(`14px "${font}"`).then(() => {
        if (terminal) {
          terminal.options.fontFamily = family;
          fitAddon?.fit();
        }
      });
    }
  });

  // Respawn session when workingDir changes
  let prevWorkingDir: string | undefined = undefined;
  createEffect(() => {
    const dir = props.workingDir;
    if (prevWorkingDir !== undefined && dir && dir !== prevWorkingDir) {
      const sid = sessionId();
      if (sid && terminal) {
        ptyKill(sid).catch(() => {});
        unlistenOutput?.();
        unlistenExit?.();
        dataDisposable?.dispose();
        setSessionId(null);
        terminal.clear();
        spawnSession(dir);
      }
    }
    prevWorkingDir = dir;
  });

  onCleanup(async () => {
    alive = false;
    resizeObserver?.disconnect();
    unlistenOutput?.();
    unlistenExit?.();
    dataDisposable?.dispose();
    terminal?.dispose();
    const sid = sessionId();
    if (sid) {
      try {
        await ptyKill(sid);
      } catch {
        // Session may already be dead
      }
    }
  });

  return (
    <div
      ref={containerRef}
      class="w-full h-full overflow-hidden"
      style={{
        padding: "4px 0 0 8px",
        background: "var(--bg-base)",
      }}
    />
  );
};

export default TerminalPanel;
