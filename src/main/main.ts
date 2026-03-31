import { BrowserWindow, app, ipcMain } from "electron";
import fs from "node:fs";
import { lineToSessionEvent } from "./ingress/hookIngress";
import { createIpcHub } from "./ipc/ipcHub";
import { createSessionStore } from "./session/sessionStore";
import { createTray } from "./tray/createTray";
import { createFloatingWindow } from "./window/createFloatingWindow";
import type { SessionRecord } from "../shared/sessionTypes";

const sessionStore = createSessionStore();

let mainWindow: BrowserWindow | null = null;

function broadcastSessions() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const payload: SessionRecord[] = sessionStore.getSessions();
  win.webContents.send("devpilot:sessions", payload);
}

function wireActionResponseIpc() {
  ipcMain.on("devpilot:action-response", (_event, payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Record<string, unknown>;
    const sessionId = typeof p.sessionId === "string" ? p.sessionId : "";
    const actionId = typeof p.actionId === "string" ? p.actionId : "";
    const option = typeof p.option === "string" ? p.option : "";
    if (!sessionId || !actionId || !option) return;

    const line = sessionStore.respondToPendingAction(sessionId, actionId, option);
    if (line) {
      broadcastSessions();
      console.log("[DevPilot] action_response:", line);
    }
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

function wireIpcHub() {
  const { server } = createIpcHub((line) => {
    const event = lineToSessionEvent(line);
    if (event) {
      sessionStore.applyEvent(event);
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
      console.log(`[DevPilot IPC] listening on unix socket ${socketPath}`);
    });
  } else {
    const port = process.env.DEVPILOT_IPC_PORT
      ? Number(process.env.DEVPILOT_IPC_PORT)
      : 17371;
    const host = "127.0.0.1";

    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      console.error(
        "[DevPilot IPC] invalid DEVPILOT_IPC_PORT; expected 1–65535, got:",
        process.env.DEVPILOT_IPC_PORT,
      );
      return;
    }

    server.listen(port, host, () => {
      const addr = server.address();
      if (addr && typeof addr !== "string") {
        console.log(`[DevPilot IPC] listening on ${host}:${addr.port}`);
      }
    });
  }
}

app.whenReady().then(() => {
  wireActionResponseIpc();
  wireIpcHub();
  const win = getOrCreateMainWindow();
  win.webContents.once("dom-ready", () => {
    broadcastSessions();
  });
  createTray();

  app.on("activate", () => {
    const win = getOrCreateMainWindow();
    if (!win.isVisible()) {
      win.show();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
