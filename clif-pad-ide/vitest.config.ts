import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  test: {
    environment: "node",
    globals: true,
    // Mock Tauri APIs — they don't exist in a test environment
    alias: {
      "@tauri-apps/api/core": "/src/__mocks__/tauri-core.ts",
      "@tauri-apps/api/event": "/src/__mocks__/tauri-event.ts",
      "@tauri-apps/api/webviewWindow": "/src/__mocks__/tauri-webview.ts",
      "@tauri-apps/plugin-dialog": "/src/__mocks__/tauri-dialog.ts",
    },
    include: ["src/**/__tests__/**/*.test.ts"],
  },
});
