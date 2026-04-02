import fs from "node:fs";
import path from "node:path";
import type { SessionEvent } from "../session/sessionStore";
import { normalizeCodexLogEvent } from "../../adapters/codex/normalizeCodexLogEvent";
import { isSessionStatus } from "../../shared/sessionTypes";

type CodexSessionWatcherOptions = {
  sessionsRoot: string;
  onEvent: (event: SessionEvent) => void;
  pollIntervalMs?: number;
};

type FileCursor = {
  offset: number;
  remainder: string;
};

function listJsonlFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];

  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const pathname = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(pathname);
      } else if (entry.isFile() && pathname.endsWith(".jsonl")) {
        files.push(pathname);
      }
    }
  }
  return files
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
    .slice(0, 5)
    .sort();
}

export function createCodexSessionWatcher(options: CodexSessionWatcherOptions) {
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const cursors = new Map<string, FileCursor>();
  let timer: ReturnType<typeof setInterval> | null = null;
  const debug = process.env.CODEPAL_DEBUG_CODEX === "1";

  async function pollFile(filePath: string) {
    const stat = fs.statSync(filePath);
    const existing = cursors.get(filePath) ?? { offset: 0, remainder: "" };
    const offset = stat.size < existing.offset ? 0 : existing.offset;
    const content = fs.readFileSync(filePath).subarray(offset).toString("utf8");

    let nextOffset = stat.size;
    const text = `${existing.remainder}${content}`;
    const lines = text.split("\n");
    const remainder = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const normalized = normalizeCodexLogEvent(trimmed, filePath);
      if (!normalized || !isSessionStatus(normalized.status)) continue;
      if (debug) {
        console.log(
          "[CodePal Codex] event",
          normalized.sessionId,
          normalized.status,
          normalized.task ?? "",
        );
      }
      options.onEvent({
        type: normalized.type,
        sessionId: normalized.sessionId,
        tool: normalized.tool,
        status: normalized.status,
        task: normalized.task,
        timestamp: normalized.timestamp,
        ...(normalized.meta !== undefined ? { meta: normalized.meta } : {}),
      });
    }

    if (remainder) {
      nextOffset -= Buffer.byteLength(remainder, "utf8");
    }
    cursors.set(filePath, { offset: nextOffset, remainder });
  }

  return {
    async pollOnce() {
      const files = listJsonlFiles(options.sessionsRoot);
      if (debug) {
        console.log("[CodePal Codex] polling root", options.sessionsRoot, "files", files);
      }
      for (const filePath of files) {
        await pollFile(filePath);
      }
    },
    start() {
      if (timer !== null) return;
      timer = setInterval(() => {
        void this.pollOnce().catch((error) => {
          console.error("[CodePal Codex] poll failed:", (error as Error).message);
        });
      }, pollIntervalMs);
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
