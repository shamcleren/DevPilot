import type { ResponseTarget } from "../../shared/sessionTypes";
import type { ActionResponseTransport } from "./actionResponseTransport";
import { createActionResponseTransportFromResponseTarget } from "./createActionResponseTransport";

export type PendingActionResponsePrep = {
  line: string;
  responseTarget?: ResponseTarget;
};

export type ActionResponseSessionStore = {
  preparePendingActionResponse(
    sessionId: string,
    actionId: string,
    option: string,
  ): PendingActionResponsePrep | null;
  completePendingActionResponse(sessionId: string, actionId: string): void;
};

export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  fallbackTransport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
): Promise<boolean> {
  const prep = sessionStore.preparePendingActionResponse(sessionId, actionId, option);
  if (!prep) {
    return false;
  }

  const transport =
    prep.responseTarget !== undefined
      ? createActionResponseTransportFromResponseTarget(prep.responseTarget)
      : fallbackTransport;

  await transport.send(prep.line);
  sessionStore.completePendingActionResponse(sessionId, actionId);
  broadcastSessions();
  return true;
}
