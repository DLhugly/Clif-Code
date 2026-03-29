import { Component, createSignal } from "solid-js";

export type ResizeDirection = "row" | "col";

interface ResizeHandleProps {
  direction: ResizeDirection;
  isDragging: boolean;
  onMouseDown: (e: MouseEvent) => void;
}

/**
 * Shared resize handle bar used between panels.
 * Highlights on hover and turns accent color while dragging.
 */
const ResizeHandle: Component<ResizeHandleProps> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  const isRow = () => props.direction === "row";
  const active = () => props.isDragging || hovered();

  return (
    <div
      class="shrink-0"
      style={{
        width: isRow() ? "100%" : "5px",
        height: isRow() ? "5px" : "100%",
        cursor: isRow() ? "row-resize" : "col-resize",
        background: active() ? "var(--accent-primary)" : "var(--border-default)",
        transition: props.isDragging ? "none" : "background 0.15s",
      }}
      onMouseDown={props.onMouseDown}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
  );
};

export default ResizeHandle;
