export type ActionResponsePayload = {
  type: "action_response";
  sessionId: string;
  actionId: string;
  response: { kind: "option"; value: string };
};

export function buildActionResponsePayload(
  sessionId: string,
  actionId: string,
  option: string,
): ActionResponsePayload {
  return {
    type: "action_response",
    sessionId,
    actionId,
    response: { kind: "option", value: option },
  };
}

export function stringifyActionResponsePayload(
  sessionId: string,
  actionId: string,
  option: string,
): string {
  return JSON.stringify(buildActionResponsePayload(sessionId, actionId, option));
}
