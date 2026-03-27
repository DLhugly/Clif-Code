import { createSignal } from "solid-js";

export type Theme = "midnight" | "graphite" | "dawn" | "arctic" | "dusk" | "cyberpunk" | "ember" | "forest" | "solarized-dark" | "monokai" | "nord" | "dracula" | "one-dark" | "tokyo-night" | "catppuccin" | "rose-pine" | "ayu-dark" | "vesper" | "poimandres" | "pale-fire";

export type PanelSlot = "terminal" | "agent" | "sidebar" | "none";
export type LayoutPreset = "default" | "agent-mode" | "terminal-only" | "sidebar-only" | "zen";

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
  nord:              { label: "Nord",             accent: "#88c0d0", bg: "#2e3440", isDark: true },
  dracula:           { label: "Dracula",          accent: "#bd93f9", bg: "#282a36", isDark: true },
  "one-dark":        { label: "One Dark",         accent: "#61afef", bg: "#282c34", isDark: true },
  "tokyo-night":     { label: "Tokyo Night",      accent: "#7aa2f7", bg: "#1a1b26", isDark: true },
  catppuccin:        { label: "Catppuccin",        accent: "#cba6f7", bg: "#1e1e2e", isDark: true },
  "rose-pine":       { label: "Rosé Pine",        accent: "#ebbcba", bg: "#191724", isDark: true },
  "ayu-dark":        { label: "Ayu Dark",         accent: "#ffb454", bg: "#0a0e14", isDark: true },
  vesper:            { label: "Vesper",            accent: "#ffc799", bg: "#101010", isDark: true },
  poimandres:        { label: "Poimandres",        accent: "#a6accd", bg: "#1b1e28", isDark: true },
  "pale-fire":       { label: "Pale Fire",        accent: "#b4637a", bg: "#faf4ed", isDark: false },
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
const [agentWidth, setAgentWidth] = createSignal(380);
const [agentVisible, setAgentVisible] = createSignal(false);
const [editorVisible, setEditorVisible] = createSignal(true);

const [leftPanel, setLeftPanel] = createSignal<PanelSlot>("terminal");
const [rightPanel, setRightPanel] = createSignal<PanelSlot>("sidebar");

const LAYOUT_PRESETS: Record<LayoutPreset, { left: PanelSlot; right: PanelSlot }> = {
  "default": { left: "terminal", right: "sidebar" },
  "agent-mode": { left: "terminal", right: "agent" },
  "terminal-only": { left: "terminal", right: "none" },
  "sidebar-only": { left: "none", right: "sidebar" },
  "zen": { left: "none", right: "none" },
};

function applyLayoutPreset(preset: LayoutPreset) {
  const config = LAYOUT_PRESETS[preset];
  setLeftPanel(config.left);
  setRightPanel(config.right);
  setTerminalVisible(config.left === "terminal");
  setSidebarVisible(config.right === "sidebar");
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

function toggleAgentPanel() {
  setAgentVisible(!agentVisible());
}

function toggleEditor() {
  setEditorVisible(!editorVisible());
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
  agentVisible,
  setAgentVisible,
  toggleAgentPanel,
  editorVisible,
  setEditorVisible,
  toggleEditor,
  applyLayoutPreset,
  getCurrentPreset,
  LAYOUT_PRESETS,
};
