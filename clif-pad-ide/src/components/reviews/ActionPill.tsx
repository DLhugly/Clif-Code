import { Component, JSX } from "solid-js";

export type ActionKind = "primary" | "success" | "danger" | "warning" | "neutral";

const STYLE: Record<ActionKind, { bg: string; color: string; border: string; fillBg: string; fillColor: string }> = {
  primary: {
    bg: "color-mix(in srgb, var(--accent-primary) 12%, transparent)",
    color: "var(--accent-primary)",
    border: "color-mix(in srgb, var(--accent-primary) 28%, transparent)",
    fillBg: "var(--accent-primary)",
    fillColor: "#fff",
  },
  success: {
    bg: "color-mix(in srgb, var(--accent-green) 14%, transparent)",
    color: "var(--accent-green)",
    border: "color-mix(in srgb, var(--accent-green) 32%, transparent)",
    fillBg: "var(--accent-green)",
    fillColor: "#fff",
  },
  danger: {
    bg: "color-mix(in srgb, var(--accent-red) 14%, transparent)",
    color: "var(--accent-red)",
    border: "color-mix(in srgb, var(--accent-red) 30%, transparent)",
    fillBg: "var(--accent-red)",
    fillColor: "#fff",
  },
  warning: {
    bg: "color-mix(in srgb, var(--accent-yellow) 18%, transparent)",
    color: "var(--accent-yellow)",
    border: "color-mix(in srgb, var(--accent-yellow) 35%, transparent)",
    fillBg: "var(--accent-yellow)",
    fillColor: "#000",
  },
  neutral: {
    bg: "var(--bg-base)",
    color: "var(--text-primary)",
    border: "var(--border-default)",
    fillBg: "var(--bg-hover)",
    fillColor: "var(--text-primary)",
  },
};

const ActionPill: Component<{
  kind?: ActionKind;
  fill?: boolean;
  children: JSX.Element;
  onClick?: (e: MouseEvent) => void;
  title?: string;
  disabled?: boolean;
}> = (props) => {
  const kind = () => props.kind ?? "neutral";
  const s = () => STYLE[kind()];
  return (
    <button
      class="px-2 py-1 rounded transition-colors"
      style={{
        background: props.fill ? s().fillBg : s().bg,
        color: props.fill ? s().fillColor : s().color,
        border: `1px solid ${s().border}`,
        cursor: props.disabled ? "not-allowed" : "pointer",
        "font-size": "calc(var(--ui-font-size) - 3px)",
        "font-weight": "500",
        opacity: props.disabled ? 0.6 : 1,
      }}
      onClick={(e) => {
        if (props.disabled) return;
        props.onClick?.(e);
      }}
      title={props.title}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  );
};

export default ActionPill;
