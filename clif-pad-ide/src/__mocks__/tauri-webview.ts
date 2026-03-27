// Mock for @tauri-apps/api/webviewWindow
export const getCurrentWebviewWindow = () => ({
  listen: async (_event: string, _cb: unknown) => () => {},
  emit: async (_event: string, _payload?: unknown) => {},
  label: "main",
});
