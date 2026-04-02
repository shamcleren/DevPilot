import { stringifyActionResponsePayload } from "../../shared/actionResponsePayload";
import {
  type PendingAction,
  type PendingCloseReason,
  type PendingClosed,
  type ResponseTarget,
  type SessionRecord,
  type SessionStatus,
  isSessionStatus,
} from "./sessionTypes";

/** 无 responseTarget.timeoutMs 时用于计算 pending 过期时间 */
export const DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS = 25_000;

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
  /** 仅关闭该 action，不整会话清空 pending */
  pendingClosed?: PendingClosed;
};

type PendingActionRuntimeState = {
  action: PendingAction;
  responseTarget?: ResponseTarget;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  effectiveTimeoutMs: number;
};

type InternalSessionRecord = {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  activities: string[];
  pendingById: Map<string, PendingActionRuntimeState>;
  /** 最近关闭的 action（新 upsert 同 id 时会移除），供控制器去重 */
  closedLedger: Map<string, PendingCloseReason>;
};

export type PendingActionResponsePrep = {
  line: string;
  responseTarget?: ResponseTarget;
};

const MAX_ACTIVITY_LINES = 6;

function capitalizeStatus(status: SessionStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function describeActivity(event: SessionEvent): string[] {
  const lines: string[] = [];
  const task = event.task?.trim();
  lines.push(task ? `${capitalizeStatus(event.status)}: ${task}` : capitalizeStatus(event.status));

  if (event.pendingAction && event.pendingAction !== null) {
    lines.push(`Pending action: ${event.pendingAction.title}`);
  }

  if (event.pendingClosed) {
    lines.push(`Closed action ${event.pendingClosed.actionId} (${event.pendingClosed.reason})`);
  }

  return lines;
}

function mergeActivities(previous: string[] | undefined, nextLines: string[]): string[] {
  return [...nextLines, ...(previous ?? [])].slice(0, MAX_ACTIVITY_LINES);
}

function toSessionRecord(internal: InternalSessionRecord): SessionRecord {
  const base: SessionRecord = {
    id: internal.id,
    tool: internal.tool,
    status: internal.status,
    task: internal.task,
    updatedAt: internal.updatedAt,
    ...(internal.activities.length > 0 ? { activities: internal.activities } : {}),
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
    const nextLedger = new Map(internal.closedLedger);
    nextLedger.set(actionId, "consumed_local");
    sessions.set(sessionId, {
      ...internal,
      pendingById: nextMap,
      closedLedger: nextLedger,
      updatedAt: Date.now(),
    });
  }

  function closePendingAction(
    sessionId: string,
    actionId: string,
    reason: PendingCloseReason,
  ): void {
    const internal = sessions.get(sessionId);
    if (!internal) {
      return;
    }
    const nextMap = new Map(internal.pendingById);
    nextMap.delete(actionId);
    const nextLedger = new Map(internal.closedLedger);
    nextLedger.set(actionId, reason);
    sessions.set(sessionId, {
      ...internal,
      pendingById: nextMap,
      closedLedger: nextLedger,
      updatedAt: Date.now(),
    });
  }

  function expireStalePendingActions(now: number): boolean {
    let expiredAny = false;
    for (const [sessionId, internal] of sessions) {
      const expiredIds: string[] = [];
      for (const [actionId, state] of internal.pendingById) {
        if (now >= state.expiresAt) {
          expiredIds.push(actionId);
        }
      }
      if (expiredIds.length === 0) {
        continue;
      }
      expiredAny = true;
      const nextMap = new Map(internal.pendingById);
      const nextLedger = new Map(internal.closedLedger);
      for (const id of expiredIds) {
        nextMap.delete(id);
        nextLedger.set(id, "expired");
      }
      sessions.set(sessionId, {
        ...internal,
        pendingById: nextMap,
        closedLedger: nextLedger,
        updatedAt: now,
      });
    }
    return expiredAny;
  }

  function isPendingActionClosed(sessionId: string, actionId: string): boolean {
    return sessions.get(sessionId)?.closedLedger.has(actionId) ?? false;
  }

  return {
    applyEvent(event: SessionEvent) {
      if (!isSessionStatus(event.status)) {
        return;
      }
      const prev = sessions.get(event.sessionId);
      const nextClosedLedger = new Map(prev?.closedLedger ?? []);

      let nextPendingById: Map<string, PendingActionRuntimeState>;
      if (event.pendingAction === undefined) {
        nextPendingById = prev?.pendingById ?? new Map();
      } else if (event.pendingAction === null) {
        nextPendingById = new Map();
        for (const id of prev?.pendingById.keys() ?? []) {
          nextClosedLedger.set(id, "cancelled");
        }
      } else {
        nextPendingById = new Map(prev?.pendingById ?? new Map());
        const action = event.pendingAction;
        nextClosedLedger.delete(action.id);
        const existing = nextPendingById.get(action.id);
        const responseTarget =
          event.responseTarget !== undefined
            ? event.responseTarget
            : existing?.responseTarget;
        const effectiveTimeoutMs =
          event.responseTarget?.timeoutMs ??
          existing?.effectiveTimeoutMs ??
          DEFAULT_PENDING_LIFECYCLE_TIMEOUT_MS;
        const ts = event.timestamp;
        const createdAt = existing?.createdAt ?? ts;
        const lastSeenAt = ts;
        const expiresAt = lastSeenAt + effectiveTimeoutMs;
        nextPendingById.set(action.id, {
          action,
          responseTarget,
          createdAt,
          lastSeenAt,
          expiresAt,
          effectiveTimeoutMs,
        });
      }

      if (event.pendingClosed) {
        const { actionId, reason } = event.pendingClosed;
        if (nextPendingById.has(actionId)) {
          nextPendingById = new Map(nextPendingById);
          nextPendingById.delete(actionId);
        }
        nextClosedLedger.set(actionId, reason);
      }

      const internal: InternalSessionRecord = {
        id: event.sessionId,
        tool: event.tool,
        status: event.status,
        task: event.task,
        updatedAt: event.timestamp,
        activities: mergeActivities(prev?.activities, describeActivity(event)),
        pendingById: nextPendingById,
        closedLedger: nextClosedLedger,
      };
      sessions.set(event.sessionId, internal);
    },

    preparePendingActionResponse,

    completePendingActionResponse,

    closePendingAction,

    expireStalePendingActions,

    isPendingActionClosed,

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
