import { createSignal } from "solid-js";
import { getSettings, setSettings } from "../lib/tauri";
import type { Theme, PanelSlot } from "./uiStore";

interface Settings {
  theme: Theme;
  fontSize: number;
  editorFont: string;
  terminalFont: string;
  uiFont: string;
  tabSize: number;
  wordWrap: "on" | "off";
  minimap: boolean;
  vimMode: boolean;
  aiProvider: string;
  aiModel: string;
  leftPanel: PanelSlot;
  rightPanel: PanelSlot;
  inlineAiEnabled: boolean;
}

const defaultSettings: Settings = {
  theme: "midnight",
  fontSize: 14,
  editorFont: "JetBrains Mono",
  terminalFont: "JetBrains Mono",
  uiFont: "Inter",
  tabSize: 2,
  wordWrap: "off",
  minimap: true,
  vimMode: false,
  aiProvider: "openrouter",
  aiModel: "anthropic/claude-sonnet-4",
  leftPanel: "terminal",
  rightPanel: "sidebar",
  inlineAiEnabled: true,
};

const [settings, setSettingsLocal] = createSignal<Settings>(defaultSettings);

async function loadSettings() {
  try {
    const s = await getSettings();
    const raw = s as any;
    // Migrate old fontFamily field to new fields
    if (raw.fontFamily && !raw.editorFont) {
      raw.editorFont = raw.fontFamily;
      raw.terminalFont = raw.fontFamily;
      delete raw.fontFamily;
    }
    setSettingsLocal({ ...defaultSettings, ...raw });
  } catch {
    // Use defaults
  }
}

async function updateSettings(partial: Partial<Settings>) {
  const updated = { ...settings(), ...partial };
  setSettingsLocal(updated);
  try {
    await setSettings(updated as any);
  } catch (e) {
    console.error("Failed to save settings:", e);
  }
}

export { settings, loadSettings, updateSettings };
export type { Settings };
