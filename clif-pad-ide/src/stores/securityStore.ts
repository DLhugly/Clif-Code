import { createSignal } from "solid-js";
import type { SecurityIssue } from "../lib/tauri";

const [securityEnabled, setSecurityEnabled] = createSignal(true);
const [securityResults, setSecurityResults] = createSignal<SecurityIssue[]>([]);
const [securityScanning, setSecurityScanning] = createSignal(false);
const [securityShowModal, setSecurityShowModal] = createSignal(false);
const [securityLastScannedPath, setSecurityLastScannedPath] = createSignal<string>("");

function criticalCount() {
  return securityResults().filter((r) => r.severity === "critical").length;
}

function warningCount() {
  return securityResults().filter((r) => r.severity === "warning").length;
}

function clearResults() {
  setSecurityResults([]);
  setSecurityLastScannedPath("");
}

export {
  securityEnabled,
  setSecurityEnabled,
  securityResults,
  setSecurityResults,
  securityScanning,
  setSecurityScanning,
  securityShowModal,
  setSecurityShowModal,
  securityLastScannedPath,
  setSecurityLastScannedPath,
  criticalCount,
  warningCount,
  clearResults,
};
