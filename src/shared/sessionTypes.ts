export type SessionStatus =
  | "running"
  | "waiting"
  | "completed"
  | "error"
  | "idle"
  | "offline";

export const SESSION_STATUSES: readonly SessionStatus[] = [
  "running",
  "waiting",
  "completed",
  "error",
  "idle",
  "offline",
] as const;

export function isSessionStatus(value: string): value is SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value);
}

export type PendingActionType = "approval" | "single_choice" | "multi_choice";

export const PENDING_ACTION_TYPES: readonly PendingActionType[] = [
  "approval",
  "single_choice",
  "multi_choice",
] as const;

export interface PendingAction {
  id: string;
  type: PendingActionType;
  title: string;
  options: string[];
}

export function isPendingAction(value: unknown): value is PendingAction {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string") return false;
  if (typeof o.type !== "string") return false;
  if (!(PENDING_ACTION_TYPES as readonly string[]).includes(o.type)) return false;
  if (!Array.isArray(o.options) || !o.options.every((x) => typeof x === "string")) {
    return false;
  }
  return true;
}

export interface SessionRecord {
  id: string;
  tool: string;
  status: SessionStatus;
  task?: string;
  updatedAt: number;
  pendingAction?: PendingAction;
}
