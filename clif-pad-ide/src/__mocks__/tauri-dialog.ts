// Mock for @tauri-apps/plugin-dialog
export const open = async (_opts?: unknown): Promise<string | null> => null;
export const save = async (_opts?: unknown): Promise<string | null> => null;
export const message = async (_msg: string, _opts?: unknown): Promise<void> => {};
export const ask = async (_msg: string, _opts?: unknown): Promise<boolean> => false;
