import { Component, JSX } from "solid-js";

interface SidebarToolbarButtonProps {
  /** SVG icon element */
  icon: JSX.Element;
  /** Tooltip text */
  title: string;
  /** Click handler */
  onClick: () => void;
}

/**
 * Small icon button used in sidebar toolbars (new file, new folder, refresh, etc).
 * Handles hover state for color + background automatically.
 */
const SidebarToolbarButton: Component<SidebarToolbarButtonProps> = (props) => {
  return (
    <button
      class="flex items-center justify-center rounded p-1 transition-colors"
      style={{ color: "var(--text-muted)", cursor: "pointer", background: "transparent", border: "none" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
        (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text-muted)";
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
      onClick={props.onClick}
      title={props.title}
    >
      {props.icon}
    </button>
  );
};

export default SidebarToolbarButton;
