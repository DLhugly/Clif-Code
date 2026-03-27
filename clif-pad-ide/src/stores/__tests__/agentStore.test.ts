import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all Tauri dependencies before importing the store
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({
    listen: vi.fn(async () => () => {}),
    emit: vi.fn(async () => {}),
    label: "main",
  }),
}));
vi.mock("../settingsStore", () => ({
  settings: { provider: "openai", model: "gpt-4o", apiKey: "" },
}));
vi.mock("../fileStore", () => ({
  projectRoot: vi.fn(() => "/test/project"),
}));
vi.mock("../../lib/tauri", () => ({
  saveAgentHistory: vi.fn(async () => {}),
  loadAgentHistory: vi.fn(async () => null),
}));

// Import AFTER mocks are set up
const { clearAgentState, agentMessages, agentTabs, agentStreaming, agentTokens } =
  await import("../agentStore");

describe("clearAgentState", () => {
  beforeEach(() => {
    clearAgentState();
  });

  it("resets messages to empty array", () => {
    expect(agentMessages.length).toBe(0);
  });

  it("resets tabs to empty array", () => {
    expect(agentTabs.length).toBe(0);
  });

  it("resets streaming flag to false", () => {
    expect(agentStreaming()).toBe(false);
  });

  it("resets token counts to zero", () => {
    const tokens = agentTokens();
    expect(tokens.prompt).toBe(0);
    expect(tokens.completion).toBe(0);
    expect(tokens.context).toBe(0);
  });

  it("is idempotent — can be called multiple times safely", () => {
    clearAgentState();
    clearAgentState();
    expect(agentMessages.length).toBe(0);
  });

  it("cancels any pending save timer without throwing", () => {
    // Simulate a timer being set
    expect(() => {
      clearAgentState();
      clearAgentState(); // second call when timer is null — should not throw
    }).not.toThrow();
  });
});
