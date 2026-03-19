import { createSignal, createRoot } from "solid-js";
import { createStore, produce } from "solid-js/store";

export interface TerminalTab {
  id: string;
  name: string;
  sessionId: string | null;
}

let nextId = 1;

function createTerminalStore() {
  const [tabs, setTabs] = createStore<TerminalTab[]>([]);
  const [activeId, setActiveId] = createSignal<string>("");

  function createTab(name?: string): string {
    const id = `term-${nextId++}`;
    const tab: TerminalTab = {
      id,
      name: name || `Terminal ${tabs.length + 1}`,
      sessionId: null,
    };
    setTabs(produce((t) => t.push(tab)));
    setActiveId(id);
    return id;
  }

  function removeTab(id: string) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx === -1) return;

    setTabs(produce((t) => t.splice(idx, 1)));

    if (activeId() === id) {
      const next = tabs[Math.min(idx, tabs.length - 1)];
      setActiveId(next?.id || "");
    }

    if (tabs.length === 0) {
      createTab();
    }
  }

  function setSessionId(tabId: string, sessionId: string) {
    const idx = tabs.findIndex((t) => t.id === tabId);
    if (idx !== -1) {
      setTabs(idx, "sessionId", sessionId);
    }
  }

  function renameTab(id: string, name: string) {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx !== -1) {
      setTabs(idx, "name", name);
    }
  }

  if (tabs.length === 0) {
    createTab();
  }

  return {
    tabs,
    activeId,
    setActiveId,
    createTab,
    removeTab,
    setSessionId,
    renameTab,
  };
}

const store = createRoot(createTerminalStore);

export const terminalTabs = () => store.tabs;
export const activeTerminalId = store.activeId;
export const setActiveTerminalId = store.setActiveId;
export const createTerminalTab = store.createTab;
export const removeTerminalTab = store.removeTab;
export const setTerminalSessionId = store.setSessionId;
export const renameTerminalTab = store.renameTab;
