import { contextBridge, ipcRenderer } from "electron";
import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../../shared/integrationTypes";
import type { SessionRecord } from "../../shared/sessionTypes";

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
  getIntegrationDiagnostics() {
    return ipcRenderer.invoke(
      "codepal:get-integration-diagnostics",
    ) as Promise<IntegrationDiagnostics>;
  },
  installIntegrationHooks(agentId: "cursor" | "codebuddy") {
    return ipcRenderer.invoke("codepal:install-integration-hooks", {
      agentId,
    }) as Promise<IntegrationInstallResult>;
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
  openPath(path: string) {
    return ipcRenderer.invoke("codepal:open-path", { path }) as Promise<string>;
  },
  respondToPendingAction(sessionId: string, actionId: string, option: string) {
    ipcRenderer.send("codepal:action-response", { sessionId, actionId, option });
  },
});
