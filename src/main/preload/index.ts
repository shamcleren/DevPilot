import { contextBridge, ipcRenderer } from "electron";
import type { SessionRecord } from "../../shared/sessionTypes";

contextBridge.exposeInMainWorld("devpilot", {
  version: "0.1.0",
  getSessions() {
    return ipcRenderer.invoke("devpilot:get-sessions") as Promise<SessionRecord[]>;
  },
  onSessions(handler: (sessions: SessionRecord[]) => void) {
    const channel = "devpilot:sessions";
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
  respondToPendingAction(sessionId: string, actionId: string, option: string) {
    ipcRenderer.send("devpilot:action-response", { sessionId, actionId, option });
  },
});
