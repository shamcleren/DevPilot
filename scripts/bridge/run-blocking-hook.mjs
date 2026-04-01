#!/usr/bin/env node
/**
 * Blocking hook helper：有合法 pendingAction 时挂临时 unix socket collector、注入 responseTarget、
 * 发事件后阻塞读到首条换行结束的 action_response 行并写到 stdout；否则等同单向 send-event。
 */
import net from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendEventLine } from "./send-event.mjs";

const PENDING_ACTION_TYPES = new Set(["approval", "single_choice", "multi_choice"]);

/** 与 `src/shared/sessionTypes.ts` isPendingAction 对齐（供路由判断，避免无效 pending 误阻塞） */
function isPendingAction(value) {
  if (!value || typeof value !== "object") return false;
  const o = value;
  if (typeof o.id !== "string" || typeof o.title !== "string") return false;
  if (typeof o.type !== "string" || !PENDING_ACTION_TYPES.has(o.type)) return false;
  if (!Array.isArray(o.options) || !o.options.every((x) => typeof x === "string")) {
    return false;
  }
  return true;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    if (process.stdin.isTTY) {
      resolve("");
      return;
    }
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () =>
      resolve(Buffer.concat(chunks).toString("utf8").trim()),
    );
    process.stdin.on("error", reject);
  });
}

function parseWaitMs(env) {
  const raw = env.CODEPAL_HOOK_RESPONSE_WAIT_MS;
  if (raw === undefined || raw === "") return 3_600_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 3_600_000;
}

function parseSocketTimeoutMs(env) {
  const raw = env.CODEPAL_ACTION_RESPONSE_SOCKET_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 10_000;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

/**
 * @param {number} waitMs
 * @returns {Promise<{ socketPath: string, linePromise: Promise<string>, dispose: () => Promise<void> }>}
 */
async function startCollector(waitMs) {
  const socketDir = await mkdtemp(path.join(os.tmpdir(), "codepal-hook-response-"));
  const socketPath = path.join(socketDir, "collector.sock");
  const server = net.createServer();

  let timeoutId;
  /** @type {import("node:net").Socket | null} */
  let activeSocket = null;
  /** @type {((socket: import("node:net").Socket) => void) | null} */
  let onConnectionHandler = null;

  const clearWaitTimer = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const destroyTrackedClient = () => {
    if (activeSocket && !activeSocket.destroyed) {
      activeSocket.destroy();
    }
    activeSocket = null;
  };

  /** 避免 server.close() 在仍有活跃连接时长时间阻塞 */
  const forceCloseServerSockets = () => {
    destroyTrackedClient();
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
  };

  const linePromise = new Promise((resolve, reject) => {
    onConnectionHandler = (socket) => {
      server.off("connection", onConnectionHandler);
      activeSocket = socket;
      let buf = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk) => {
        buf += chunk;
        const i = buf.indexOf("\n");
        if (i >= 0) {
          clearWaitTimer();
          socket.destroy();
          activeSocket = null;
          resolve(buf.slice(0, i));
        }
      });
      socket.on("error", (err) => {
        clearWaitTimer();
        server.off("connection", onConnectionHandler);
        forceCloseServerSockets();
        reject(err);
      });
    };

    timeoutId = setTimeout(() => {
      if (onConnectionHandler) {
        server.off("connection", onConnectionHandler);
      }
      forceCloseServerSockets();
      reject(
        new Error(
          `run-blocking-hook: timed out after ${waitMs}ms waiting for action_response line`,
        ),
      );
    }, waitMs);

    server.on("connection", onConnectionHandler);
  });

  try {
    await new Promise((resolve, reject) => {
      server.listen(socketPath, () => resolve(undefined));
      server.once("error", reject);
    });
  } catch (e) {
    clearWaitTimer();
    forceCloseServerSockets();
    await new Promise((resolve) => {
      server.close(() => resolve(undefined));
    });
    await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
    throw e;
  }

  async function dispose() {
    clearWaitTimer();
    if (onConnectionHandler) {
      server.off("connection", onConnectionHandler);
      onConnectionHandler = null;
    }
    forceCloseServerSockets();
    await new Promise((resolve) => {
      server.close(() => resolve(undefined));
    });
    await rm(socketDir, { recursive: true, force: true }).catch(() => undefined);
  }

  return { socketPath, linePromise, dispose };
}

async function main() {
  let raw = process.argv[2];
  if (raw === undefined || raw === "" || raw === "-") {
    raw = await readStdin();
  }
  if (!raw) {
    console.error("run-blocking-hook: missing payload (argv or stdin)");
    process.exit(1);
  }

  const trimmed = raw.trim();
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (e) {
    console.error("run-blocking-hook: invalid JSON", e);
    process.exit(1);
  }

  const env = process.env;

  if (!isPendingAction(parsed.pendingAction)) {
    await sendEventLine(trimmed, env);
    return;
  }

  const waitMs = parseWaitMs(env);
  const socketTimeoutMs = parseSocketTimeoutMs(env);
  const collector = await startCollector(waitMs);

  try {
    const outbound = {
      ...parsed,
      responseTarget: {
        mode: "socket",
        socketPath: collector.socketPath,
        timeoutMs: socketTimeoutMs,
      },
    };
    await sendEventLine(JSON.stringify(outbound), env);
    const line = await collector.linePromise;
    process.stdout.write(`${line}\n`);
  } finally {
    await collector.dispose();
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMainModule = invokedAs === thisFile;

if (isMainModule) {
  main().catch((err) => {
    console.error("run-blocking-hook:", err);
    process.exit(1);
  });
}
