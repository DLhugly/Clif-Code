import { Component, Show, createSignal, lazy, Suspense, onCleanup, onMount } from "solid-js";
import { ResizeHandle } from "../ui";
import {
  reviewLeftWidth,
  setReviewLeftWidth,
  reviewRightWidth,
  setReviewRightWidth,
  clampPanelWidth,
} from "../../stores/uiStore";
import {
  clearSelection,
  selectedPrs,
  selectedPrNumber,
  filteredSortedPrs,
  setSelectedPrNumber,
  toggleSelection,
  sendPendingComment,
} from "../../stores/reviewsStore";
import ReviewsPanel from "./ReviewsPanel";
import PrCenterStage from "./PrCenterStage";
import AuditLog from "./AuditLog";
import ShortcutsOverlay from "./ShortcutsOverlay";
import PendingComments from "./PendingComments";
import ConsolidationView from "./ConsolidationView";
import WorkspaceHeader from "./WorkspaceHeader";
import SyncDrawer from "./SyncDrawer";
import { loadDecisions, previewSync } from "../../stores/syncStore";
import { consolidationOpen, closeConsolidation, openConsolidationFromSelection } from "./consolidationHub";
import { pendingComments, loadPendingComments } from "../../stores/reviewsStore";
import { projectRoot } from "../../stores/fileStore";

const ReviewAgentChat = lazy(() => import("./ReviewAgentChat"));

const ReviewWorkspace: Component = () => {
  const [isDraggingLeft, setIsDraggingLeft] = createSignal(false);
  const [isDraggingRight, setIsDraggingRight] = createSignal(false);
  const [chatOpen, setChatOpen] = createSignal(true);
  const [auditOpen, setAuditOpen] = createSignal(false);
  const [shortcutsOpen, setShortcutsOpen] = createSignal(false);
  const [pendingOpen, setPendingOpen] = createSignal(false);
  const [syncOpen, setSyncOpen] = createSignal(false);

  function onKey(e: KeyboardEvent) {
    // Ignore when focus is in an input/textarea
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    if (e.key === "Escape") {
      if (shortcutsOpen()) { setShortcutsOpen(false); return; }
      if (auditOpen()) { setAuditOpen(false); return; }
      if (selectedPrs().size > 0) { clearSelection(); return; }
    }
    if (e.key === "?") {
      setShortcutsOpen(true);
      return;
    }
    if (e.key === "j" || e.key === "k") {
      const visible = filteredSortedPrs().map((p) => p.number);
      if (visible.length === 0) return;
      const current = selectedPrNumber();
      const idx = current == null ? -1 : visible.indexOf(current);
      const next = e.key === "j"
        ? Math.min(visible.length - 1, idx + 1)
        : Math.max(0, idx - 1);
      setSelectedPrNumber(visible[next] ?? visible[0]);
      return;
    }
    if (e.key === "x") {
      const n = selectedPrNumber();
      if (n != null) toggleSelection(n);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      const visible = filteredSortedPrs().map((p) => p.number);
      for (const n of visible) toggleSelection(n);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      if (pendingComments.length > 0) {
        e.preventDefault();
        sendPendingComment(pendingComments[0].id);
      }
    }
    if (e.key === "c" && selectedPrs().size >= 2) {
      openConsolidationFromSelection();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", onKey);
    const root = projectRoot();
    if (root) loadPendingComments(root);
    void loadDecisions();
    void previewSync();
  });
  onCleanup(() => {
    window.removeEventListener("keydown", onKey);
  });

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
      class="flex flex-col h-full w-full overflow-hidden"
      style={{
        background: "var(--bg-base)",
      }}
    >
      <WorkspaceHeader
        onOpenPending={() => setPendingOpen(true)}
        onOpenAudit={() => setAuditOpen(true)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSync={() => {
          setSyncOpen(true);
          void previewSync();
        }}
      />
      <div class="flex flex-1 min-h-0 overflow-hidden">
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
            <ReviewAgentChat />
          </Suspense>
        </div>
      </Show>

      </div>
      {/* End flex body */}

      <Show when={auditOpen()}>
        <AuditLog onClose={() => setAuditOpen(false)} />
      </Show>
      <Show when={shortcutsOpen()}>
        <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />
      </Show>
      <Show when={pendingOpen()}>
        <PendingComments onClose={() => setPendingOpen(false)} />
      </Show>
      <Show when={consolidationOpen()}>
        <ConsolidationView onClose={() => closeConsolidation()} />
      </Show>
      <Show when={syncOpen()}>
        <SyncDrawer onClose={() => setSyncOpen(false)} />
      </Show>
    </div>
  );
};

export default ReviewWorkspace;
