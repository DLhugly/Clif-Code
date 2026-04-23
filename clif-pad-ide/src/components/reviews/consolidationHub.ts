import { createSignal } from "solid-js";

/**
 * Shared signal for whether the consolidation workspace is open.
 * Stage 2 opens it; Stage 4 renders `ConsolidationView` reading from this.
 */
const [consolidationOpen, setConsolidationOpen] = createSignal(false);

function openConsolidationFromSelection() {
  setConsolidationOpen(true);
}

function closeConsolidation() {
  setConsolidationOpen(false);
}

export { consolidationOpen, openConsolidationFromSelection, closeConsolidation };
