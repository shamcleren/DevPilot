import { contextBridge, ipcRenderer } from "electron";
import type {
  CursorDashboardConnectResult,
  CursorDashboardDiagnostics,
} from "../../shared/cursorDashboardTypes";
import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../../shared/integrationTypes";
import type { SessionRecord } from "../../shared/sessionTypes";
import type { UsageOverview } from "../../shared/usageTypes";

contextBridge.exposeInMainWorld("codepal", {
  version: "0.1.0",
  getSessions() {
    return ipcRenderer.invoke("codepal:get-sessions") as Promise<SessionRecord[]>;
  },
  onSessions(handler: (sessions: SessionRecord[]) => void) {
    const channel = "codepal:sessions";
    const listener = (
      _event: Electron.IpcRendererEvent,
      sessions: SessionRecord[],
    ) => {
      handler(sessions);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  getUsageOverview() {
    return ipcRenderer.invoke("codepal:get-usage-overview") as Promise<UsageOverview>;
  },
  onUsageOverview(handler: (overview: UsageOverview) => void) {
    const channel = "codepal:usage-overview";
    const listener = (
      _event: Electron.IpcRendererEvent,
      overview: UsageOverview,
    ) => {
      handler(overview);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  getIntegrationDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-integration-diagnostics",
    ) as Promise<IntegrationDiagnostics>;
  },
  installIntegrationHooks(agentId: "cursor" | "codebuddy" | "codex") {
    return ipcRenderer.invoke("codepal:install-integration-hooks", {
      agentId,
    }) as Promise<IntegrationInstallResult>;
  },
  getCursorDashboardDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-cursor-dashboard-diagnostics",
    ) as Promise<CursorDashboardDiagnostics>;
  },
  connectCursorDashboard() {
    return ipcRenderer.invoke(
      "codepal:connect-cursor-dashboard",
    ) as Promise<CursorDashboardConnectResult>;
  },
  refreshCursorDashboardUsage() {
    return ipcRenderer.invoke(
      "codepal:refresh-cursor-dashboard-usage",
    ) as Promise<CursorDashboardConnectResult>;
  },
  onOpenSettings(handler: () => void) {
    const channel = "codepal:open-settings";
    const listener = () => {
      handler();
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  openExternalTarget(target: string) {
    return ipcRenderer.invoke("codepal:open-external-target", { target }) as Promise<string>;
  },
  writeClipboardText(text: string) {
    return ipcRenderer.invoke("codepal:write-clipboard-text", { text }) as Promise<void>;
  },
  respondToPendingAction(sessionId: string, actionId: string, option: string) {
    ipcRenderer.send("codepal:action-response", { sessionId, actionId, option });
  },
});
