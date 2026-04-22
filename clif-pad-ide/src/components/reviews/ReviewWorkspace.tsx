import { Component, Show, createSignal, lazy, Suspense } from "solid-js";
import { ResizeHandle } from "../ui";
import {
  reviewLeftWidth,
  setReviewLeftWidth,
  reviewRightWidth,
  setReviewRightWidth,
  clampPanelWidth,
} from "../../stores/uiStore";
import ReviewsPanel from "./ReviewsPanel";
import PrCenterStage from "./PrCenterStage";

const AgentChatPanel = lazy(() => import("../agent/AgentChatPanel"));

const ReviewWorkspace: Component = () => {
  const [isDraggingLeft, setIsDraggingLeft] = createSignal(false);
  const [isDraggingRight, setIsDraggingRight] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(true);

  function onLeftResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingLeft(true);
    document.body.style.cursor = "col-resize";
    let rafId = 0;
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const raw = ev.clientX;
        const other = chatOpen() ? reviewRightWidth() : 0;
        const next = clampPanelWidth(raw, "reviews", window.innerWidth, other);
        setReviewLeftWidth(next);
      });
    };
    const onUp = () => {
      cancelAnimationFrame(rafId);
      setIsDraggingLeft(false);
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onRightResize(e: MouseEvent) {
    e.preventDefault();
    setIsDraggingRight(true);
    document.body.style.cursor = "col-resize";
    let rafId = 0;
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const raw = window.innerWidth - ev.clientX;
        const other = reviewLeftWidth();
        const next = clampPanelWidth(raw, "agent", window.innerWidth, other);
        setReviewRightWidth(next);
      });
    };
    const onUp = () => {
      cancelAnimationFrame(rafId);
      setIsDraggingRight(false);
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div
      class="flex h-full w-full overflow-hidden"
      style={{
        background: "var(--bg-base)",
      }}
    >
      {/* Left: PR list */}
      <div
        style={{ width: `${reviewLeftWidth()}px` }}
        class="h-full shrink-0"
      >
        <ReviewsPanel />
      </div>
      <ResizeHandle direction="col" isDragging={isDraggingLeft()} onMouseDown={onLeftResize} />

      {/* Center: PR detail */}
      <div class="flex flex-col flex-1 min-w-0 min-h-0">
        <PrCenterStage
          chatOpen={chatOpen()}
          onToggleChat={() => setChatOpen(!chatOpen())}
        />
      </div>

      {/* Right: scoped agent chat */}
      <Show when={chatOpen()}>
        <ResizeHandle direction="col" isDragging={isDraggingRight()} onMouseDown={onRightResize} />
        <div
          style={{ width: `${reviewRightWidth()}px` }}
          class="h-full shrink-0"
        >
          <Suspense
            fallback={
              <div
                class="flex items-center justify-center h-full"
                style={{ color: "var(--text-muted)", background: "var(--bg-surface)" }}
              >
                <span class="text-sm">Loading chat...</span>
              </div>
            }
          >
            <AgentChatPanel />
          </Suspense>
        </div>
      </Show>
    </div>
  );
};

export default ReviewWorkspace;
