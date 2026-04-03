import { BrowserWindow, Tray, app, clipboard, ipcMain, shell } from "electron";
import fs from "node:fs";
import { createActionResponseTransport } from "./actionResponse/createActionResponseTransport";
import { dispatchActionResponse } from "./actionResponse/dispatchActionResponse";
import { HOOK_CLI_NOT_HOOK_MODE, runHookCli } from "./hook/runHookCli";
import { lineToSessionEvent } from "./ingress/hookIngress";
import { createIntegrationService } from "./integrations/integrationService";
import { createIpcHub } from "./ipc/ipcHub";
import { createSessionStore } from "./session/sessionStore";
import { createTray } from "./tray/createTray";
import { createFloatingWindow } from "./window/createFloatingWindow";
import { createCodexSessionWatcher } from "./codex/codexSessionWatcher";
import type { SessionRecord } from "../shared/sessionTypes";

const sessionStore = createSessionStore();
const actionResponseTransport = createActionResponseTransport(process.env);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let pendingExpirySweepTimer: ReturnType<typeof setInterval> | null = null;
let codexSessionWatcher: ReturnType<typeof createCodexSessionWatcher> | null = null;
const debugCodex = process.env.CODEPAL_DEBUG_CODEX === "1";

// Hook 入口已并入应用可执行文件；这里只保留一个可推导 legacy 路径形态的根目录。
function resolveHookScriptsRoot() {
  return app.getAppPath();
}

function broadcastSessions() {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  const payload: SessionRecord[] = sessionStore.getSessions();
  if (debugCodex) {
    console.log(
      "[CodePal Sessions] broadcast",
      payload.length,
      payload.map((session) => `${session.tool}:${session.status}:${session.id}`),
    );
  }
  win.webContents.send("codepal:sessions", payload);
}

function sweepExpiredPendingActions() {
  const now = Date.now();
  const changed =
    sessionStore.expireStalePendingActions(now) || sessionStore.expireStaleSessions(now);
  if (changed) {
    broadcastSessions();
  }
}

function wireActionResponseIpc(
  integrationService: ReturnType<typeof createIntegrationService>,
) {
  ipcMain.handle("codepal:get-sessions", () => {
    const sessions = sessionStore.getSessions();
    if (debugCodex) {
      console.log(
        "[CodePal Sessions] get-sessions",
        sessions.length,
        sessions.map((session) => `${session.tool}:${session.status}:${session.id}`),
      );
    }
    return sessions;
  });
  ipcMain.handle("codepal:get-integration-diagnostics", () =>
    integrationService.getDiagnostics(),
  );
  ipcMain.handle("codepal:install-integration-hooks", (_event, payload: unknown) => {
    const agentId =
      payload &&
      typeof payload === "object" &&
      typeof (payload as Record<string, unknown>).agentId === "string"
        ? (payload as Record<string, unknown>).agentId
        : "";
    if (agentId !== "cursor" && agentId !== "codebuddy" && agentId !== "codex") {
      throw new Error("unsupported integration agent");
    }
    return integrationService.installHooks(agentId);
  });
  ipcMain.handle("codepal:open-external-target", async (_event, payload: unknown) => {
    const targetToOpen =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).target === "string"
        ? (payload as Record<string, unknown>).target.trim()
        : "";
    if (!targetToOpen) {
      throw new Error("target is required");
    }
    if (/^https?:\/\//i.test(targetToOpen)) {
      await shell.openExternal(targetToOpen);
      return "";
    }
    return shell.openPath(targetToOpen);
  });
  ipcMain.handle("codepal:write-clipboard-text", (_event, payload: unknown) => {
    const text =
      payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).text === "string"
        ? (payload as Record<string, unknown>).text
        : "";
    clipboard.writeText(text);
  });
  ipcMain.on("codepal:action-response", (_event, payload: unknown) => {
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
      console.error("[CodePal] action_response transport error:", err);
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
    console.error("[CodePal IPC] server error:", err.message, err.code ?? "");
  });

  const socketPath = process.env.CODEPAL_SOCKET_PATH?.trim();

  if (socketPath) {
    try {
      fs.unlinkSync(socketPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.error(
          "[CodePal IPC] could not remove existing socket file:",
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
      console.log(`[CodePal IPC] listening on unix socket ${socketPath}`);
    });
    return;
  }

  const rawPort = process.env.CODEPAL_IPC_PORT;
  const port = rawPort ? Number(rawPort) : 17371;
  const host = "127.0.0.1";

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    integrationService.setListenerDiagnostics({
      mode: "unavailable",
      message: "CODEPAL_IPC_PORT 无效",
    });
    console.error(
      "[CodePal IPC] invalid CODEPAL_IPC_PORT; expected 1–65535, got:",
      rawPort,
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
      console.log(`[CodePal IPC] listening on ${host}:${addr.port}`);
    }
  });
}

void runHookCli(process.argv, process.stdin, process.stdout, process.stderr, process.env)
  .then((hookExitCode) => {
    if (hookExitCode !== HOOK_CLI_NOT_HOOK_MODE) {
      process.exit(hookExitCode);
      return;
    }

    app.on("before-quit", () => {
      if (pendingExpirySweepTimer !== null) {
        clearInterval(pendingExpirySweepTimer);
        pendingExpirySweepTimer = null;
      }
      codexSessionWatcher?.stop();
      codexSessionWatcher = null;
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
      }
      tray = null;
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.whenReady().then(() => {
      const integrationService = createIntegrationService({
        homeDir: process.env.CODEPAL_HOME_DIR?.trim() || app.getPath("home"),
        hookScriptsRoot: resolveHookScriptsRoot(),
        packaged: app.isPackaged,
        execPath: process.execPath,
        appPath: app.getAppPath(),
      });

      wireActionResponseIpc(integrationService);
      wireIpcHub(integrationService);
      codexSessionWatcher = createCodexSessionWatcher({
        sessionsRoot:
          process.env.CODEPAL_CODEX_SESSIONS_ROOT?.trim() ||
          `${app.getPath("home")}/.codex/sessions`,
        onEvent: (event) => {
          sessionStore.applyEvent(event);
          integrationService.recordEvent(event.tool, event.status, event.timestamp);
          broadcastSessions();
        },
      });
      void codexSessionWatcher.pollOnce().catch((error) => {
        console.error("[CodePal Codex] initial poll failed:", (error as Error).message);
      });
      codexSessionWatcher.start();
      const win = getOrCreateMainWindow();
      win.webContents.once("dom-ready", () => {
        broadcastSessions();
      });
      tray = createTray({
        onOpenMain: () => {
          const next = getOrCreateMainWindow();
          if (!next.isVisible()) {
            next.show();
          }
          next.focus();
        },
        onOpenSettings: () => {
          const next = getOrCreateMainWindow();
          if (!next.isVisible()) {
            next.show();
          }
          next.focus();
          next.webContents.send("codepal:open-settings");
        },
      });

      pendingExpirySweepTimer = setInterval(sweepExpiredPendingActions, 1_000);

      app.on("activate", () => {
        const activeWindow = getOrCreateMainWindow();
        if (!activeWindow.isVisible()) {
          activeWindow.show();
        }
      });
    });
  })
  .catch((err) => {
    console.error("[CodePal] hook CLI bootstrap error:", err);
    process.exit(1);
  });
