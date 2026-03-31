/**
 * 上行事件信封（Task 4）：仅定义进入 Hub 的 JSON 形状。
 * Task 5：status_change 可携带 pendingAction（审批 / 结构化选项）。
 */

import type { PendingAction } from "../../shared/sessionTypes";
import { isPendingAction } from "../../shared/sessionTypes";

export type UpstreamEventType = "status_change";

/** 工具标识：与 sessionStore / UI 一致 */
export type UpstreamToolId = "cursor" | "codebuddy" | string;

/** Task 4 唯一上行种类：状态变化 */
export interface StatusChangeUpstreamEvent {
  type: "status_change";
  sessionId: string;
  tool: UpstreamToolId;
  /** 原始字符串，由 main 用 isSessionStatus 校验 */
  status: string;
  task?: string;
  timestamp: number;
  /** 可选：cwd、model 等未建模字段，供后续 UI 使用 */
  meta?: Record<string, unknown>;
  /** 待处理动作；null 表示清除 */
  pendingAction?: PendingAction | null;
}

export type UpstreamEventEnvelope = StatusChangeUpstreamEvent;

export function isStatusChangeUpstreamEvent(
  value: unknown,
): value is StatusChangeUpstreamEvent {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (
    o.type !== "status_change" ||
    typeof o.sessionId !== "string" ||
    typeof o.tool !== "string" ||
    typeof o.status !== "string" ||
    typeof o.timestamp !== "number"
  ) {
    return false;
  }
  if ("pendingAction" in o) {
    if (o.pendingAction === null) return true;
    if (!isPendingAction(o.pendingAction)) return false;
  }
  return true;
}
