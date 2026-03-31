import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export type ActionResponseCollector = {
  socketPath: string;
  waitForLine: () => Promise<string>;
  close: () => Promise<void>;
};

/**
 * Unix socket server that accepts the first connection and resolves the first
 * newline-terminated line.
 */
export async function startActionResponseCollector(): Promise<ActionResponseCollector> {
  const socketDir = await fs.mkdtemp(path.join(os.tmpdir(), "devpilot-action-response-"));
  const socketPath = path.join(socketDir, "collector.sock");
  const server = net.createServer();

  const waitForLine = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("action_response collector timed out waiting for a line"));
    }, 25_000);

    const onConnection = (socket: net.Socket) => {
      server.off("connection", onConnection);
      let buffer = "";
      socket.setEncoding("utf8");
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const nl = buffer.indexOf("\n");
        if (nl >= 0) {
          clearTimeout(timeout);
          socket.destroy();
          resolve(buffer.slice(0, nl));
        }
      });
      socket.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    };

    server.on("connection", onConnection);
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.once("error", reject);
  });

  return {
    socketPath,
    waitForLine: () => waitForLine,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await fs.rm(socketDir, { recursive: true, force: true });
    },
  };
}
