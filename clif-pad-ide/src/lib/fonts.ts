export interface FontOption {
  label: string;
  value: string;
  isSystem?: boolean;
}

export const MONO_FONTS: FontOption[] = [
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "Source Code Pro", value: "Source Code Pro" },
  { label: "Cascadia Code", value: "Cascadia Code" },
  { label: "IBM Plex Mono", value: "IBM Plex Mono" },
  { label: "Hack", value: "Hack" },
  { label: "Monaco", value: "Monaco", isSystem: true },
  { label: "Consolas", value: "Consolas", isSystem: true },
  { label: "SF Mono", value: "SF Mono", isSystem: true },
  { label: "Ubuntu Mono", value: "Ubuntu Mono" },
  { label: "Menlo", value: "Menlo", isSystem: true },
];

export const SANS_FONTS: FontOption[] = [
  { label: "Inter", value: "Inter" },
  { label: "Roboto", value: "Roboto" },
  { label: "IBM Plex Sans", value: "IBM Plex Sans" },
  { label: "Nunito Sans", value: "Nunito Sans" },
  { label: "System UI", value: "system-ui", isSystem: true },
];

const loadedFonts = new Set<string>();

export function loadGoogleFont(family: string) {
  if (loadedFonts.has(family)) return;

  // Skip system fonts
  const allFonts = [...MONO_FONTS, ...SANS_FONTS];
  const fontDef = allFonts.find((f) => f.value === family);
  if (fontDef?.isSystem) return;

  const encoded = family.replace(/ /g, "+");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encoded}:wght@300;400;500;600;700&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(family);
}

export function applyEditorFont(_family: string) {
  // Editor font is applied directly via Monaco updateOptions — no CSS var needed
}

export function applyTerminalFont(_family: string) {
  // Terminal font is applied directly via xterm options — no CSS var needed
}

export function applyUiFont(family: string) {
  const fallback = "-apple-system, BlinkMacSystemFont, sans-serif";
  const value = family === "system-ui" ? `system-ui, ${fallback}` : `"${family}", ${fallback}`;
  document.documentElement.style.setProperty("--font-sans", value);
}
