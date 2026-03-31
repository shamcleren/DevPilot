import net from "node:net";
import type { ActionResponseTransport } from "./actionResponseTransport";

const ACTION_RESPONSE_SOCKET_TIMEOUT_MS = 1_000;
const INVALID_SOCKET_CONFIG_MESSAGE =
  "[DevPilot] action_response socket transport misconfigured; falling back to log transport";

function createLogTransport(): ActionResponseTransport {
  return {
    async send(line: string) {
      console.log("[DevPilot] action_response:", line);
    },
  };
}

function createSocketTransport(
  options: net.NetConnectOpts,
): ActionResponseTransport {
  return {
    async send(line: string) {
      const payload = `${line}\n`;
      await new Promise<void>((resolve, reject) => {
        let settled = false;

        const finish = (error?: Error) => {
          if (settled) {
            return;
          }

          settled = true;
          clearTimeout(timeoutId);
          socket.removeListener("error", onError);

          if (error) {
            reject(error);
            return;
          }

          resolve();
        };

        const onError = (error: Error) => {
          socket.destroy();
          finish(error);
        };

        const socket = net.connect(options, () => {
          socket.write(payload, (err) => {
            if (err) {
              socket.destroy();
              finish(err);
              return;
            }

            socket.end(() => finish());
          });
        });
        const timeoutId = setTimeout(() => {
          socket.destroy();
          finish(
            new Error(
              `[DevPilot] action_response socket send timed out after ${ACTION_RESPONSE_SOCKET_TIMEOUT_MS}ms`,
            ),
          );
        }, ACTION_RESPONSE_SOCKET_TIMEOUT_MS);

        socket.on("error", onError);
      });
    },
  };
}

function createTcpSocketTransport(host: string, port: number): ActionResponseTransport {
  return createSocketTransport({ host, port });
}

function createUnixSocketTransport(socketPath: string): ActionResponseTransport {
  return createSocketTransport({ path: socketPath });
}

export function createActionResponseTransport(
  env: NodeJS.ProcessEnv,
): ActionResponseTransport {
  if (env.DEVPILOT_ACTION_RESPONSE_MODE === "socket") {
    const socketPath = env.DEVPILOT_ACTION_RESPONSE_SOCKET_PATH?.trim();
    if (socketPath) {
      return createUnixSocketTransport(socketPath);
    }
    const host = env.DEVPILOT_ACTION_RESPONSE_HOST?.trim();
    const portRaw = env.DEVPILOT_ACTION_RESPONSE_PORT?.trim();
    if (host && portRaw) {
      const port = Number(portRaw);
      if (Number.isFinite(port) && port > 0) {
        return createTcpSocketTransport(host, port);
      }
    }

    console.error(INVALID_SOCKET_CONFIG_MESSAGE);
  }

  return createLogTransport();
}
