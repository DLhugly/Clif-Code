import { describe, it, expect, beforeEach } from "vitest";

// uiStore has no Tauri dependencies — import directly
const {
  visiblePanels,
  togglePanel,
  showPanel,
  hidePanel,
  setPanelVisibility,
} = await import("../uiStore");

describe("Panel visibility — togglePanel", () => {
  beforeEach(() => {
    // Reset to a known state before each test
    setPanelVisibility(["editor", "terminal", "files", "agent"]);
  });

  it("toggling a visible panel hides it", () => {
    showPanel("agent");
    expect(visiblePanels().has("agent")).toBe(true);
    togglePanel("agent");
    expect(visiblePanels().has("agent")).toBe(false);
  });

  it("toggling a hidden panel shows it", () => {
    hidePanel("agent");
    expect(visiblePanels().has("agent")).toBe(false);
    togglePanel("agent");
    expect(visiblePanels().has("agent")).toBe(true);
  });

  it("toggling a panel twice returns to the original state", () => {
    const initial = visiblePanels().has("terminal");
    togglePanel("terminal");
    togglePanel("terminal");
    expect(visiblePanels().has("terminal")).toBe(initial);
  });

  it("panels are independent — toggling one does not affect another", () => {
    showPanel("editor");
    showPanel("files");
    togglePanel("editor");
    expect(visiblePanels().has("files")).toBe(true);
  });
});

describe("Panel visibility — showPanel / hidePanel", () => {
  it("showPanel makes the panel visible", () => {
    hidePanel("terminal");
    showPanel("terminal");
    expect(visiblePanels().has("terminal")).toBe(true);
  });

  it("hidePanel makes the panel invisible", () => {
    showPanel("terminal");
    hidePanel("terminal");
    expect(visiblePanels().has("terminal")).toBe(false);
  });

  it("showPanel on an already visible panel is a no-op", () => {
    showPanel("editor");
    showPanel("editor");
    expect(visiblePanels().has("editor")).toBe(true);
  });

  it("hidePanel on an already hidden panel is a no-op", () => {
    hidePanel("agent");
    hidePanel("agent");
    expect(visiblePanels().has("agent")).toBe(false);
  });
});

describe("Panel visibility — setPanelVisibility", () => {
  it("sets exactly the provided panels as visible", () => {
    setPanelVisibility(["agent"]);
    expect(visiblePanels().has("agent")).toBe(true);
  });

  it("hides panels not in the provided list", () => {
    setPanelVisibility(["editor"]);
    expect(visiblePanels().has("agent")).toBe(false);
  });
});
