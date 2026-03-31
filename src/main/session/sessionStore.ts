import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import {
  type PendingAction,
  type SessionRecord,
  type SessionStatus,
  isSessionStatus,
} from "./sessionTypes";

export type SessionEvent = {
  type?: string;
  sessionId: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  timestamp: number;
  /** 未出现则保留原值；null 表示清除 */
  pendingAction?: PendingAction | null;
};

export function createSessionStore() {
  const sessions = new Map<string, SessionRecord>();

  return {
    applyEvent(event: SessionEvent) {
      if (!isSessionStatus(event.status)) {
        return;
      }
      const prev = sessions.get(event.sessionId);
      let nextPending: PendingAction | undefined;
      if (event.pendingAction === undefined) {
        nextPending = prev?.pendingAction;
      } else if (event.pendingAction === null) {
        nextPending = undefined;
      } else {
        nextPending = event.pendingAction;
      }

      const base: SessionRecord = {
        id: event.sessionId,
        tool: event.tool,
        status: event.status,
        task: event.task,
        updatedAt: event.timestamp,
      };
      const record: SessionRecord =
        nextPending !== undefined ? { ...base, pendingAction: nextPending } : base;
      sessions.set(event.sessionId, record);
    },
    respondToPendingAction(sessionId: string, actionId: string, option: string) {
      const rec = sessions.get(sessionId);
      if (!rec?.pendingAction || rec.pendingAction.id !== actionId) {
        return null;
      }
      const line = stringifyActionResponsePayload(sessionId, actionId, option);
      const next: SessionRecord = {
        id: rec.id,
        tool: rec.tool,
        status: rec.status,
        task: rec.task,
        updatedAt: Date.now(),
      };
      sessions.set(sessionId, next);
      return line;
    },
    getSessions() {
      return [...sessions.values()];
    },
  };
}
