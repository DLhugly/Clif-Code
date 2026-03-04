import { Component, Show, For, createSignal, onCleanup } from "solid-js";
import { theme, applyTheme, fontSize, setUiFontSize, THEMES } from "../../stores/uiStore";
import type { Theme } from "../../stores/uiStore";
import { settings, updateSettings } from "../../stores/settingsStore";
import { projectRoot } from "../../stores/fileStore";
import { MONO_FONTS, loadGoogleFont, applyUiFont } from "../../lib/fonts";

const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);

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

const GlobeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const TopBar: Component<{
  onLaunchClaude: () => void;
  onLaunchClifCode: () => void;
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

      {/* Folder / Project name button */}
      <button
        class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-all duration-150"
        style={{
          color: "var(--text-primary)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
        onClick={() => props.onOpenFolder()}
        title={projectRoot() || "Open folder"}
      >
        <FolderIcon />
        <span class="font-medium" style={{ "max-width": "160px", overflow: "hidden", "text-overflow": "ellipsis", "white-space": "nowrap" }}>
          {getProjectName() || "Open Folder"}
        </span>
      </button>

      {/* Spacer — also draggable */}
      <div data-tauri-drag-region class="flex-1 h-full" />

      {/* Right controls */}
      <div class="flex items-center gap-3">
        {/* Font size slider */}
        <div
          class="flex items-center gap-2"
          style={{ color: "var(--text-secondary)" }}
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
        <FontDropdown
          label="Font"
          value={settings().editorFont}
          options={MONO_FONTS}
          onChange={handleFontFamilyChange}
        />

        {/* Divider */}
        <div style={{ width: "1px", height: "20px", background: "var(--border-default)", opacity: "0.5" }} />

        {/* Theme dropdown */}
        <span style={{ "font-size": "11px", color: "var(--text-muted)", "font-weight": "500" }}>Themes:</span>
        <div ref={dropdownRef} style={{ position: "relative" }}>
          <button
            class="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-150"
            style={{
              color: "var(--text-secondary)",
              background: dropdownOpen() ? "var(--bg-hover)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              if (!dropdownOpen()) {
                (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              }
            }}
            onMouseLeave={(e) => {
              if (!dropdownOpen()) {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }
            }}
            onClick={toggleDropdown}
          >
            {/* Theme swatch */}
            <div
              style={{
                width: "12px",
                height: "12px",
                "border-radius": "50%",
                background: THEMES[theme()].accent,
                "box-shadow": `0 0 0 2px var(--bg-surface), 0 0 0 3px ${THEMES[theme()].accent}44`,
              }}
            />
            <span>{THEMES[theme()].label}</span>
            <ChevronIcon />
          </button>

          {/* Dropdown menu */}
          <Show when={dropdownOpen()}>
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
                "max-height": "320px",
                "overflow-y": "auto",
                "z-index": "200",
                "backdrop-filter": "blur(20px)",
                "-webkit-backdrop-filter": "blur(20px)",
              }}
            >
              <For each={themeKeys}>
                {(t) => (
                  <button
                    class="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors duration-100"
                    style={{
                      color: theme() === t ? "var(--text-primary)" : "var(--text-secondary)",
                      background: theme() === t ? "var(--bg-active)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      "text-align": "left",
                    }}
                    onMouseEnter={(e) => {
                      if (theme() !== t) {
                        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (theme() !== t) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }
                    }}
                    onClick={() => handleThemeSelect(t)}
                  >
                    {/* Color swatch */}
                    <div
                      style={{
                        width: "14px",
                        height: "14px",
                        "border-radius": "50%",
                        background: THEMES[t].accent,
                        "flex-shrink": "0",
                        "box-shadow": theme() === t
                          ? `0 0 0 2px var(--bg-active), 0 0 0 3px ${THEMES[t].accent}`
                          : "none",
                      }}
                    />
                    <span class="flex-1">{THEMES[t].label}</span>
                    {/* Checkmark for active */}
                    <Show when={theme() === t}>
                      <CheckIcon />
                    </Show>
                  </button>
                )}
              </For>
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

        {/* Launch ClifCode button */}
        <button
          class="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150"
          style={{
            background: hasProject()
              ? "var(--bg-hover)"
              : "var(--bg-hover)",
            color: hasProject() ? "var(--text-primary)" : "var(--text-muted)",
            border: hasProject() ? "1px solid var(--border-default)" : "none",
            cursor: hasProject() ? "pointer" : "not-allowed",
            opacity: hasProject() ? "1" : "0.6",
          }}
          onMouseEnter={(e) => {
            if (hasProject()) {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-active)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (hasProject()) {
              (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            if (hasProject()) props.onLaunchClifCode();
          }}
          disabled={!hasProject()}
          title={hasProject() ? "Launch ClifCode (offline AI) in terminal" : "Open a folder first"}
        >
          <ClifCodeIcon />
          ClifCode
        </button>

        {/* Launch Claude button */}
        <button
          class="flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-150"
          style={{
            background: hasProject()
              ? `linear-gradient(135deg, var(--accent-primary), var(--accent-purple))`
              : "var(--bg-hover)",
            color: hasProject() ? "#fff" : "var(--text-muted)",
            border: "none",
            "box-shadow": hasProject() ? `0 2px 8px color-mix(in srgb, var(--accent-primary) 40%, transparent)` : "none",
            cursor: hasProject() ? "pointer" : "not-allowed",
            opacity: hasProject() ? "1" : "0.6",
          }}
          onMouseEnter={(e) => {
            if (hasProject()) {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px color-mix(in srgb, var(--accent-primary) 50%, transparent)`;
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
            }
          }}
          onMouseLeave={(e) => {
            if (hasProject()) {
              (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px color-mix(in srgb, var(--accent-primary) 40%, transparent)`;
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            if (hasProject()) props.onLaunchClaude();
          }}
          disabled={!hasProject()}
          title={hasProject() ? "Launch Claude Code in terminal" : "Open a folder first"}
        >
          <SparkleIcon />
          Launch Claude
        </button>
      </div>
    </div>
  );
};

export default TopBar;
