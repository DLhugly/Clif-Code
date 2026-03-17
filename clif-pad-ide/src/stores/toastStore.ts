import { createSignal } from "solid-js";

export interface Toast {
  id: number;
  message: string;
  type: "info" | "warn" | "error";
}

let nextId = 0;
const [toasts, setToasts] = createSignal<Toast[]>([]);

function showToast(message: string, type: Toast["type"] = "info", duration = 4000) {
  const id = nextId++;
  setToasts((prev) => [...prev, { id, message, type }]);
  setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, duration);
}

function dismissToast(id: number) {
  setToasts((prev) => prev.filter((t) => t.id !== id));
}

export { toasts, showToast, dismissToast };
