#!/usr/bin/env node
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 与 `src/shared/actionResponsePayload.ts` 形状一致；供测试与外部工具构造下行应答行。 */
export function buildActionResponseLine(sessionId, actionId, option) {
  return JSON.stringify({
    type: "action_response",
    sessionId,
    actionId,
    response: { kind: "option", value: option },
  });
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

function sendLine(client, body) {
  return new Promise((resolve, reject) => {
    client.write(`${body}\n`, (err) => {
      if (err) reject(err);
      else client.end();
    });
    client.once("error", reject);
    client.once("close", resolve);
  });
}

/**
 * 将一行 JSON 文本经当前 IPC（unix socket 或 TCP）发往 CodePal。
 * @param {string} body 原始负载（会 trim）
 * @param {NodeJS.ProcessEnv} [env] 默认 `process.env`
 */
export async function sendEventLine(body, env = process.env) {
  const trimmed = String(body).trim();
  if (!trimmed) {
    throw new Error("sendEventLine: empty body");
  }

  const socketPath = env.CODEPAL_SOCKET_PATH;

  await new Promise((resolve, reject) => {
    const onConnect = () => {
      void sendLine(client, trimmed).then(resolve).catch(reject);
    };

    const client = socketPath
      ? net.createConnection(socketPath, onConnect)
      : net.createConnection(
          {
            host: env.CODEPAL_IPC_HOST ?? "127.0.0.1",
            port: Number(env.CODEPAL_IPC_PORT ?? "17371"),
          },
          onConnect,
        );

    client.once("error", reject);
  });
}

async function main() {
  let body = process.argv[2];
  if (body === undefined || body === "" || body === "-") {
    body = await readStdin();
  }
  if (!body) {
    console.error("send-event: missing payload (argv or stdin)");
    process.exit(1);
  }

  try {
    await sendEventLine(body, process.env);
  } catch (err) {
    console.error("send-event:", err);
    process.exit(1);
  }
}

const thisFile = fileURLToPath(import.meta.url);
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
const isMainModule = invokedAs === thisFile;

if (isMainModule) {
  main().catch((err) => {
    console.error("send-event:", err);
    process.exit(1);
  });
}
