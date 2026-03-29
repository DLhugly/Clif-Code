import { Component, Show, For, createSignal, onCleanup } from "solid-js";
import { theme, applyTheme, fontSize, setUiFontSize, THEMES, toggleSidebar, sidebarVisible } from "../../stores/uiStore";
import { securityEnabled, setSecurityEnabled } from "../../stores/securityStore";
import type { Theme } from "../../stores/uiStore";
import { settings, updateSettings } from "../../stores/settingsStore";
import { projectRoot } from "../../stores/fileStore";
import { MONO_FONTS, loadGoogleFont, applyUiFont } from "../../lib/fonts";

const SparkleIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function getProjectName(): string {
  const root = projectRoot();
  if (!root) return "";
  const parts = root.split("/");
  return parts[parts.length - 1] || "";
}

const ClifCodeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

interface FontDropdownProps {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}

const FontDropdown: Component<FontDropdownProps> = (props) => {
  const [open, setOpen] = createSignal(false);
  let ref: HTMLDivElement | undefined;

  const handleClickOutside = (e: MouseEvent) => {
    if (ref && !ref.contains(e.target as Node)) {
      setOpen(false);
    }
  };

  const toggle = () => {
    const next = !open();
    setOpen(next);
    if (next) {
      setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  };

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs transition-all duration-150"
        style={{
          color: "var(--text-secondary)",
          background: open() ? "var(--bg-hover)" : "transparent",
          border: "none",
          cursor: "pointer",
          "white-space": "nowrap",
        }}
        onMouseEnter={(e) => {
          if (!open()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          if (!open()) (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onClick={toggle}
        title={props.label}
      >
        <span style={{ color: "var(--text-muted)", "font-size": "10px" }}>{props.label}</span>
        <span style={{ "max-width": "90px", overflow: "hidden", "text-overflow": "ellipsis" }}>{props.value}</span>
        <ChevronIcon />
      </button>

      <Show when={open()}>
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: "0",
            background: "var(--bg-overlay)",
            border: "1px solid var(--border-default)",
            "border-radius": "var(--radius-lg)",
            "box-shadow": "var(--shadow-lg)",
            padding: "4px",
            "min-width": "170px",
            "z-index": "200",
            "backdrop-filter": "blur(20px)",
            "-webkit-backdrop-filter": "blur(20px)",
          }}
        >
          <For each={props.options}>
            {(opt) => (
              <button
                class="flex items-center gap-3 w-full rounded-md px-3 py-2 text-xs transition-colors duration-100"
                style={{
                  color: props.value === opt.value ? "var(--text-primary)" : "var(--text-secondary)",
                  background: props.value === opt.value ? "var(--bg-active)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  "text-align": "left",
                }}
                onMouseEnter={(e) => {
                  if (props.value !== opt.value) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  if (props.value !== opt.value) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
                onClick={() => {
                  props.onChange(opt.value);
                  setOpen(false);
                  document.removeEventListener("click", handleClickOutside);
                }}
              >
                <span class="flex-1">{opt.label}</span>
                <Show when={props.value === opt.value}>
                  <CheckIcon />
                </Show>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// Removed LayoutDropdown - now using individual panel toggles

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const TopBar: Component<{
  onOpenFolder: () => void;
  onOpenBrowser: () => void;
}> = (props) => {
  const hasProject = () => !!projectRoot();
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  let dropdownRef: HTMLDivElement | undefined;

  // Close dropdown on outside click
  const handleClickOutside = (e: MouseEvent) => {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      setDropdownOpen(false);
    }
  };

  // Attach/detach listener based on dropdown state
  const toggleDropdown = () => {
    const next = !dropdownOpen();
    setDropdownOpen(next);
    if (next) {
      setTimeout(() => document.addEventListener("click", handleClickOutside), 0);
    } else {
      document.removeEventListener("click", handleClickOutside);
    }
  };

  onCleanup(() => {
    document.removeEventListener("click", handleClickOutside);
  });

  const handleThemeSelect = (t: Theme) => {
    applyTheme(t);
    updateSettings({ theme: t });
    setDropdownOpen(false);
    document.removeEventListener("click", handleClickOutside);
  };

  const handleFontChange = (size: number) => {
    setUiFontSize(size);
    updateSettings({ fontSize: size });
  };

  const handleFontFamilyChange = (font: string) => {
    loadGoogleFont(font);
    applyUiFont(font);
    updateSettings({ editorFont: font, terminalFont: font, uiFont: font });
  };

  const themeKeys = Object.keys(THEMES) as Theme[];

  return (
    <div
      class="flex items-center shrink-0 select-none"
      style={{
        height: "48px",
        background: "color-mix(in srgb, var(--bg-surface) 80%, transparent)",
        "backdrop-filter": `blur(var(--surface-blur))`,
        "-webkit-backdrop-filter": `blur(var(--surface-blur))`,
        "border-bottom": "1px solid var(--border-muted)",
        "padding-right": "12px",
        position: "relative",
        "z-index": "100",
      }}
    >
      {/* macOS traffic light zone — draggable */}
      <div
        data-tauri-drag-region
        style={{ width: "78px", height: "48px", "flex-shrink": "0" }}
      />

      {/* Logo + ClifCode + Project name */}
      <div
        class="flex items-center gap-3"
        style={{ "flex-shrink": "0", "padding-left": "2px", "margin-right": "16px" }}
      >
        <div
          style={{
            width: "36px",
            height: "28px",
            background: "var(--accent-primary)",
            "border-radius": "6px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "font-family": '"Fira Code", "JetBrains Mono", "SF Mono", monospace',
            "font-size": "18px",
            "font-weight": "900",
            color: "var(--accent-text, #fff)",
            "letter-spacing": "-1px",
          }}
        >
          {"< >"}
        </div>
        <span
          class="text-sm font-semibold"
          style={{ color: "var(--text-primary)", "white-space": "nowrap" }}
        >
          ClifCode
        </span>
        <Show when={getProjectName()}>
          <div style={{ width: "1px", height: "16px", background: "var(--border-default)", opacity: "0.6" }} />
          <span
            class="text-sm"
            style={{
              color: "var(--text-muted)",
              "max-width": "180px",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {getProjectName()}
          </span>
        </Show>
      </div>

      {/* Spacer — also draggable */}
      <div data-tauri-drag-region class="flex-1 h-full" />

      {/* Right controls */}
      <div class="flex items-center gap-3">
        {/* Font size slider */}
        <div
          class="flex items-center gap-2"
          style={{ color: "var(--text-secondary)", "margin-left": "-12px" }}
        >
          <span style={{ "font-size": "11px", "font-weight": "600", opacity: "0.7" }}>A</span>
          <input
            type="range"
            class="font-slider"
            min="10"
            max="24"
            step="1"
            value={fontSize()}
            onInput={(e) => handleFontChange(parseInt(e.currentTarget.value))}
            style={{ width: "80px" }}
            title={`Font size: ${fontSize()}px`}
          />
          <span style={{ "font-size": "15px", "font-weight": "600", opacity: "0.7" }}>A</span>
          <span
            style={{
              "font-size": "11px",
              "min-width": "30px",
              "text-align": "center",
              color: "var(--text-muted)",
              "font-variant-numeric": "tabular-nums",
            }}
          >
            {fontSize()}px
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "var(--border-default)", opacity: "0.5" }} />

        {/* Font dropdown */}
        <span style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>Fonts:</span>
        <div style={{ "margin-left": "-12px" }}>
          <FontDropdown
            label="Font"
            value={settings().editorFont}
            options={MONO_FONTS}
            onChange={handleFontFamilyChange}
          />
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "var(--border-default)", opacity: "0.5" }} />

        {/* Theme picker */}
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150"
            style={{
              color: "var(--text-secondary)",
              background: dropdownOpen() ? "var(--bg-hover)" : "var(--bg-hover)",
              border: "1px solid var(--border-default)",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = dropdownOpen() ? "var(--bg-hover)" : "var(--bg-hover)"; }}
            onClick={toggleDropdown}
          >
            {/* Paint palette icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <circle cx="19" cy="13.5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="12" cy="19" r="2.5" />
              <path d="M12 2a10 10 0 0 0-9.95 11.08A10 10 0 0 0 12 22a2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1a2 2 0 0 0 2-2 10 10 0 0 0-7-12.92" />
            </svg>
            <div
              style={{
                width: "10px", height: "10px", "border-radius": "50%",
                background: THEMES[theme()].accent,
              }}
            />
            <span style={{ "font-weight": "500" }}>{THEMES[theme()].label}</span>
            <ChevronIcon />
          </button>

          <Show when={dropdownOpen()}>
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: "0",
                background: "var(--bg-overlay)",
                border: "1px solid var(--border-default)",
                "border-radius": "12px",
                "box-shadow": "0 12px 40px rgba(0,0,0,0.3)",
                padding: "12px",
                width: "420px",
                "z-index": "200",
                "backdrop-filter": "blur(24px)",
                "-webkit-backdrop-filter": "blur(24px)",
              }}
            >
              {/* Dark themes */}
              <div style={{ "font-size": "10px", "font-weight": "600", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.05em", "margin-bottom": "6px" }}>
                Dark
              </div>
              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "4px", "margin-bottom": "10px" }}>
                <For each={themeKeys.filter(t => THEMES[t].isDark)}>
                  {(t) => {
                    const meta = THEMES[t];
                    const isActive = () => theme() === t;
                    return (
                      <button
                        class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-100"
                        style={{
                          background: isActive() ? "var(--bg-active)" : "transparent",
                          border: isActive() ? `1px solid ${meta.accent}66` : "1px solid transparent",
                          cursor: "pointer",
                          "text-align": "left",
                        }}
                        onMouseEnter={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => handleThemeSelect(t)}
                      >
                        {/* Mini preview swatch */}
                        <div
                          style={{
                            width: "28px", height: "20px", "border-radius": "4px",
                            background: meta.bg,
                            border: "1px solid rgba(255,255,255,0.1)",
                            display: "flex", "align-items": "center", "justify-content": "center",
                            "flex-shrink": "0",
                          }}
                        >
                          <div style={{ width: "10px", height: "3px", "border-radius": "1px", background: meta.accent }} />
                        </div>
                        <span style={{ "font-size": "12px", color: isActive() ? meta.accent : "var(--text-secondary)", "font-weight": isActive() ? "600" : "400", "white-space": "nowrap" }}>
                          {meta.label}
                        </span>
                        <Show when={isActive()}>
                          <CheckIcon />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>

              {/* Light themes */}
              <div style={{ "font-size": "10px", "font-weight": "600", color: "var(--text-muted)", "text-transform": "uppercase", "letter-spacing": "0.05em", "margin-bottom": "6px" }}>
                Light
              </div>
              <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "4px" }}>
                <For each={themeKeys.filter(t => !THEMES[t].isDark)}>
                  {(t) => {
                    const meta = THEMES[t];
                    const isActive = () => theme() === t;
                    return (
                      <button
                        class="flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-all duration-100"
                        style={{
                          background: isActive() ? "var(--bg-active)" : "transparent",
                          border: isActive() ? `1px solid ${meta.accent}66` : "1px solid transparent",
                          cursor: "pointer",
                          "text-align": "left",
                        }}
                        onMouseEnter={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                        onMouseLeave={(e) => { if (!isActive()) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        onClick={() => handleThemeSelect(t)}
                      >
                        <div
                          style={{
                            width: "28px", height: "20px", "border-radius": "4px",
                            background: meta.bg,
                            border: "1px solid rgba(0,0,0,0.12)",
                            display: "flex", "align-items": "center", "justify-content": "center",
                            "flex-shrink": "0",
                          }}
                        >
                          <div style={{ width: "10px", height: "3px", "border-radius": "1px", background: meta.accent }} />
                        </div>
                        <span style={{ "font-size": "12px", color: isActive() ? meta.accent : "var(--text-secondary)", "font-weight": isActive() ? "600" : "400", "white-space": "nowrap" }}>
                          {meta.label}
                        </span>
                        <Show when={isActive()}>
                          <CheckIcon />
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "var(--border-default)", opacity: "0.5" }} />

        {/* Browser button */}
        <button
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150"
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
            (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
          }}
          onClick={() => props.onOpenBrowser()}
          title="Open browser tab"
        >
          <GlobeIcon />
          Browser
        </button>

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "var(--border-default)", opacity: "0.5" }} />

        {/* Files & Git toggle */}
        <button
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
          style={{
            background: sidebarVisible() ? "var(--bg-active)" : "var(--bg-hover)",
            color: sidebarVisible() ? "var(--text-primary)" : "var(--text-muted)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = sidebarVisible() ? "var(--bg-active)" : "var(--bg-hover)"; }}
          onClick={() => toggleSidebar()}
          title={sidebarVisible() ? "Hide Git/Files panel" : "Open Git/Files panel"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          {sidebarVisible() ? "Hide Git/Files" : "Open Git/Files"}
        </button>

        {/* Security scan toggle */}
        <button
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-150"
          style={{
            background: securityEnabled() ? "var(--bg-active)" : "var(--bg-hover)",
            color: securityEnabled() ? "var(--accent-green)" : "var(--text-muted)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-active)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = securityEnabled() ? "var(--bg-active)" : "var(--bg-hover)"; }}
          onClick={() => setSecurityEnabled(!securityEnabled())}
          title={securityEnabled() ? "Security scan is ON — click to disable" : "Security scan is OFF — click to enable"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          {securityEnabled() ? "Security Scan On" : "Security Scan Off"}
        </button>
      </div>
    </div>
  );
};

export default TopBar;
