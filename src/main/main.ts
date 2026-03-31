import { BrowserWindow, app, ipcMain } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createActionResponseTransport } from "./actionResponse/createActionResponseTransport";
import { dispatchActionResponse } from "./actionResponse/dispatchActionResponse";
import { lineToSessionEvent } from "./ingress/hookIngress";
import { createIntegrationService } from "./integrations/integrationService";
import { createIpcHub } from "./ipc/ipcHub";
import { createSessionStore } from "./session/sessionStore";
import { createTray } from "./tray/createTray";
import { createFloatingWindow } from "./window/createFloatingWindow";
import type { SessionRecord } from "../shared/sessionTypes";

const sessionStore = createSessionStore();
const actionResponseTransport = createActionResponseTransport(process.env);

let mainWindow: BrowserWindow | null = null;
let pendingExpirySweepTimer: ReturnType<typeof setInterval> | null = null;

function resolveHookScriptsRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "scripts", "hooks")
    : path.join(app.getAppPath(), "scripts", "hooks");
}

function broadcastSessions() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const payload: SessionRecord[] = sessionStore.getSessions();
  win.webContents.send("devpilot:sessions", payload);
}

function sweepExpiredPendingActions() {
  if (sessionStore.expireStalePendingActions(Date.now())) {
    broadcastSessions();
  }
}

function wireActionResponseIpc(
  integrationService: ReturnType<typeof createIntegrationService>,
) {
  ipcMain.handle("devpilot:get-sessions", () => sessionStore.getSessions());
  ipcMain.handle("devpilot:get-integration-diagnostics", () =>
    integrationService.getDiagnostics(),
  );
  ipcMain.handle("devpilot:install-integration-hooks", (_event, payload: unknown) => {
    const agentId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).agentId === "string"
        ? (payload as Record<string, unknown>).agentId
        : "";
    if (agentId !== "cursor" && agentId !== "codebuddy") {
      throw new Error("unsupported integration agent");
    }
    return integrationService.installHooks(agentId);
  });

  ipcMain.on("devpilot:action-response", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionId = typeof p.actionId === "string" ? p.actionId : "";
    const option = typeof p.option === "string" ? p.option : "";
    if (!sessionId || !actionId || !option) return;

    void dispatchActionResponse(
      sessionStore,
      actionResponseTransport,
      broadcastSessions,
      sessionId,
      actionId,
      option,
    ).catch((err) => {
      console.error("[DevPilot] action_response transport error:", err);
    });
  });
}

function getOrCreateMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  const win = createFloatingWindow();
  mainWindow = win;
  win.on("closed", () => {
    mainWindow = null;
  });
  win.once("ready-to-show", () => win.show());
  return win;
}

function wireIpcHub(integrationService: ReturnType<typeof createIntegrationService>) {
  const { server } = createIpcHub((line) => {
    const event = lineToSessionEvent(line);
    if (event) {
      sessionStore.applyEvent(event);
      integrationService.recordEvent(event.tool, event.status, event.timestamp);
      broadcastSessions();
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error("[DevPilot IPC] server error:", err.message, err.code ?? "");
  });

  const socketPath = process.env.DEVPILOT_SOCKET_PATH?.trim();

  if (socketPath) {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(
          "[DevPilot IPC] could not remove existing socket file:",
          socketPath,
          (err as Error).message,
          code ?? "",
        );
      }
    }

    server.listen(socketPath, () => {
      integrationService.setListenerDiagnostics({
        mode: "socket",
        socketPath,
      });
      console.log(`[DevPilot IPC] listening on unix socket ${socketPath}`);
    });
  } else {
    const port = process.env.DEVPILOT_IPC_PORT
      ? Number(process.env.DEVPILOT_IPC_PORT)
      : 17371;
    const host = "127.0.0.1";

    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      integrationService.setListenerDiagnostics({
        mode: "unavailable",
        message: "DEVPILOT_IPC_PORT 无效",
      });
      console.error(
        "[DevPilot IPC] invalid DEVPILOT_IPC_PORT; expected 1–65535, got:",
        process.env.DEVPILOT_IPC_PORT,
      );
      return;
    }

    server.listen(port, host, () => {
      integrationService.setListenerDiagnostics({
        mode: "tcp",
        host,
        port,
      });
      const addr = server.address();
      if (addr && typeof addr !== "string") {
        console.log(`[DevPilot IPC] listening on ${host}:${addr.port}`);
      }
    });
  }
}

app.whenReady().then(() => {
  const integrationService = createIntegrationService({
    homeDir: app.getPath("home"),
    hookScriptsRoot: resolveHookScriptsRoot(),
    packaged: app.isPackaged,
  });

  wireActionResponseIpc(integrationService);
  wireIpcHub(integrationService);
  const win = getOrCreateMainWindow();
  win.webContents.once("dom-ready", () => {
    broadcastSessions();
  });
  createTray();

  pendingExpirySweepTimer = setInterval(sweepExpiredPendingActions, 1_000);

  app.on("activate", () => {
    const win = getOrCreateMainWindow();
    if (!win.isVisible()) {
      win.show();
    }
  });
});

app.on("before-quit", () => {
  if (pendingExpirySweepTimer !== null) {
    clearInterval(pendingExpirySweepTimer);
    pendingExpirySweepTimer = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
