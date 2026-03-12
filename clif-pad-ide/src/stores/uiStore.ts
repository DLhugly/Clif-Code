import { createSignal } from "solid-js";

export type Theme = "midnight" | "graphite" | "dawn" | "arctic" | "dusk" | "cyberpunk" | "ember" | "forest" | "solarized-dark" | "monokai";

export type PanelSlot = "terminal" | "agent" | "sidebar" | "none";
export type LayoutPreset = "default" | "agent-mode" | "agent-focus" | "zen";

export interface ThemeMeta {
  label: string;
  accent: string;
  bg: string;
  isDark: boolean;
}

export const THEMES: Record<Theme, ThemeMeta> = {
  midnight:          { label: "Midnight",        accent: "#3b82f6", bg: "#0d1117", isDark: true },
  graphite:          { label: "Graphite",         accent: "#f0883e", bg: "#1c1c1e", isDark: true },
  dawn:              { label: "Dawn",             accent: "#0066cc", bg: "#ffffff", isDark: false },
  arctic:            { label: "Arctic",           accent: "#0284c7", bg: "#f0f4f8", isDark: false },
  dusk:              { label: "Dusk",             accent: "#a855f7", bg: "#1a1625", isDark: true },
  cyberpunk:         { label: "Cyberpunk",        accent: "#ff0090", bg: "#0d0015", isDark: true },
  ember:             { label: "Ember",            accent: "#f97316", bg: "#1a1210", isDark: true },
  forest:            { label: "Forest",           accent: "#22c55e", bg: "#0f1a0f", isDark: true },
  "solarized-dark":  { label: "Solarized Dark",   accent: "#268bd2", bg: "#002b36", isDark: true },
  monokai:           { label: "Monokai",          accent: "#a6e22e", bg: "#272822", isDark: true },
};

const [terminalWidth, setTerminalWidth] = createSignal(50);
const [terminalVisible, setTerminalVisible] = createSignal(true);
const [sidebarVisible, setSidebarVisible] = createSignal(true);
const [sidebarWidth, setSidebarWidth] = createSignal(240);
const [theme, setTheme] = createSignal<Theme>("midnight");
const [fontSize, setFontSize] = createSignal(14);
const [showCommandPalette, setShowCommandPalette] = createSignal(false);
const [devDrawerOpen, setDevDrawerOpen] = createSignal(false);
const [devDrawerHeight, setDevDrawerHeight] = createSignal(50);

const [leftPanel, setLeftPanel] = createSignal<PanelSlot>("terminal");
const [rightPanel, setRightPanel] = createSignal<PanelSlot>("sidebar");
const [agentWidth, setAgentWidth] = createSignal(380);

const LAYOUT_PRESETS: Record<LayoutPreset, { left: PanelSlot; right: PanelSlot }> = {
  "default": { left: "terminal", right: "sidebar" },
  "agent-mode": { left: "terminal", right: "agent" },
  "agent-focus": { left: "agent", right: "sidebar" },
  "zen": { left: "none", right: "none" },
};

function applyLayoutPreset(preset: LayoutPreset) {
  const config = LAYOUT_PRESETS[preset];
  setLeftPanel(config.left);
  setRightPanel(config.right);
  // Sync visibility signals for backward compat
  setTerminalVisible(config.left === "terminal");
  setSidebarVisible(config.right === "sidebar");
}

function toggleAgentPanel() {
  const current = rightPanel();
  if (current === "agent") {
    setRightPanel("sidebar");
  } else {
    setRightPanel("agent");
  }
}

function getCurrentPreset(): LayoutPreset | null {
  const l = leftPanel();
  const r = rightPanel();
  for (const [key, val] of Object.entries(LAYOUT_PRESETS)) {
    if (val.left === l && val.right === r) return key as LayoutPreset;
  }
  return null;
}

const VALID_THEMES = Object.keys(THEMES) as Theme[];

function isValidTheme(t: string): t is Theme {
  return VALID_THEMES.includes(t as Theme);
}

function applyTheme(t: string) {
  const valid = isValidTheme(t) ? t : "midnight";
  document.documentElement.setAttribute("data-theme", valid);
  setTheme(valid);
}

function setUiFontSize(size: number) {
  const clamped = Math.max(10, Math.min(24, Math.round(size)));
  setFontSize(clamped);
  document.documentElement.style.setProperty("--ui-font-size", `${clamped}px`);
}

function toggleTerminal() {
  setTerminalVisible(!terminalVisible());
}

function toggleSidebar() {
  setSidebarVisible(!sidebarVisible());
}

export {
  terminalWidth,
  setTerminalWidth,
  terminalVisible,
  setTerminalVisible,
  sidebarVisible,
  setSidebarVisible,
  sidebarWidth,
  setSidebarWidth,
  theme,
  setTheme,
  fontSize,
  setUiFontSize,
  showCommandPalette,
  setShowCommandPalette,
  applyTheme,
  toggleTerminal,
  toggleSidebar,
  devDrawerOpen,
  setDevDrawerOpen,
  devDrawerHeight,
  setDevDrawerHeight,
  leftPanel,
  setLeftPanel,
  rightPanel,
  setRightPanel,
  agentWidth,
  setAgentWidth,
  applyLayoutPreset,
  toggleAgentPanel,
  getCurrentPreset,
  LAYOUT_PRESETS,
};
