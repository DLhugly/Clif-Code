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
  } catch (e) {
    // check() throws if the endpoint is unreachable or returns a non-200.
    // This happens in dev mode (no endpoint) and also when the latest.json
    // artifact is missing from a GitHub release. Surface the error so the
    // caller can decide whether to show it rather than swallowing it silently.
    const msg = e instanceof Error ? e.message : String(e);
    // Only re-throw real network/manifest errors, not dev-mode 404s
    if (msg && !msg.includes("404") && !msg.includes("dev") && !msg.includes("localhost")) {
      throw e;
    }
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
