import type { ActionResponseTransport } from "./actionResponseTransport";

export type ActionResponseSessionStore = {
  respondToPendingAction(
    sessionId: string,
    actionId: string,
    option: string,
  ): string | null;
};

export async function dispatchActionResponse(
  sessionStore: ActionResponseSessionStore,
  transport: ActionResponseTransport,
  broadcastSessions: () => void,
  sessionId: string,
  actionId: string,
  option: string,
): Promise<boolean> {
  const line = sessionStore.respondToPendingAction(sessionId, actionId, option);
  if (!line) {
    return false;
  }
  broadcastSessions();
  await transport.send(line);
  return true;
}
