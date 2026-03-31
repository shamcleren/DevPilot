import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import {
  type PendingAction,
  type ResponseTarget,
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
  /** 与 pendingAction 同条事件可选携带；按 action upsert 时写入该 action 的运行时路由 */
  responseTarget?: ResponseTarget;
};

type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
};

type InternalSessionRecord = {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  pendingById: Map<string, PendingActionRuntimeState>;
};

export type PendingActionResponsePrep = {
  line: string;
  responseTarget?: ResponseTarget;
};

function toSessionRecord(internal: InternalSessionRecord): SessionRecord {
  const base: SessionRecord = {
    id: internal.id,
    tool: internal.tool,
    status: internal.status,
    task: internal.task,
    updatedAt: internal.updatedAt,
  };
  if (internal.pendingById.size === 0) {
    return base;
  }
  return {
    ...base,
    pendingActions: [...internal.pendingById.values()].map((s) => s.action),
  };
}

export function createSessionStore() {
  const sessions = new Map<string, InternalSessionRecord>();

  function preparePendingActionResponse(
    sessionId: string,
    actionId: string,
    option: string,
  ): PendingActionResponsePrep | null {
    const internal = sessions.get(sessionId);
    const state = internal?.pendingById.get(actionId);
    if (!state) {
      return null;
    }
    const line = stringifyActionResponsePayload(sessionId, actionId, option);
    return {
      line,
      ...(state.responseTarget !== undefined
        ? { responseTarget: state.responseTarget }
        : {}),
    };
  }

  function completePendingActionResponse(sessionId: string, actionId: string): void {
    const internal = sessions.get(sessionId);
    if (!internal?.pendingById.has(actionId)) {
      return;
    }
    const nextMap = new Map(internal.pendingById);
    nextMap.delete(actionId);
    sessions.set(sessionId, {
      ...internal,
      pendingById: nextMap,
      updatedAt: Date.now(),
    });
  }

  return {
    applyEvent(event: SessionEvent) {
      if (!isSessionStatus(event.status)) {
        return;
      }
      const prev = sessions.get(event.sessionId);
      let nextPendingById: Map<string, PendingActionRuntimeState>;
      if (event.pendingAction === undefined) {
        nextPendingById = prev?.pendingById ?? new Map();
      } else if (event.pendingAction === null) {
        nextPendingById = new Map();
      } else {
        nextPendingById = new Map(prev?.pendingById ?? new Map());
        const action = event.pendingAction;
        const existing = nextPendingById.get(action.id);
        nextPendingById.set(action.id, {
          action,
          responseTarget:
            event.responseTarget !== undefined
              ? event.responseTarget
              : existing?.responseTarget,
        });
      }

      const internal: InternalSessionRecord = {
        id: event.sessionId,
        tool: event.tool,
        status: event.status,
        task: event.task,
        updatedAt: event.timestamp,
        pendingById: nextPendingById,
      };
      sessions.set(event.sessionId, internal);
    },

    preparePendingActionResponse,

    completePendingActionResponse,

    /** 供尚未迁移到 prepare/complete 的调用方使用；等价于 prepare 后立刻 complete */
    respondToPendingAction(sessionId: string, actionId: string, option: string) {
      const prep = preparePendingActionResponse(sessionId, actionId, option);
      if (!prep) {
        return null;
      }
      completePendingActionResponse(sessionId, actionId);
      return prep.line;
    },

    getSessions(): SessionRecord[] {
      return [...sessions.values()].map(toSessionRecord);
    },
  };
}
