import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date" }
  | { state: "available"; version: string; update: Update }
  | { state: "downloading"; progress: number }
  | { state: "installing" }
  | { state: "error"; message: string };

export async function checkForUpdate(): Promise<Update | null> {
  try {
    const update = await check();
    return update ?? null;
  } catch {
    // Expected to fail in dev mode (no updater endpoint)
    return null;
  }
}

export async function installUpdate(
  update: Update,
  onProgress?: (progress: number) => void
): Promise<void> {
  let totalLength = 0;
  let downloaded = 0;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started" && event.data.contentLength) {
      totalLength = event.data.contentLength;
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      if (totalLength > 0 && onProgress) {
        onProgress(Math.round((downloaded / totalLength) * 100));
      }
    }
  });

  await relaunch();
}
