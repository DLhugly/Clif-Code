// Mock for @tauri-apps/api/event
export type UnlistenFn = () => void;
export const listen = async (_event: string, _cb: unknown): Promise<UnlistenFn> => () => {};
export const emit = async (_event: string, _payload?: unknown): Promise<void> => {};
