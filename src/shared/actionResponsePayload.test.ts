import { describe, expect, it } from "vitest";
import {
  buildActionResponsePayload,
  stringifyActionResponsePayload,
} from "./actionResponsePayload";

describe("actionResponsePayload", () => {
  it("builds the action_response object shape", () => {
    expect(buildActionResponsePayload("sid", "aid", "opt")).toEqual({
      type: "action_response",
      sessionId: "sid",
      actionId: "aid",
      response: { kind: "option", value: "opt" },
    });
  });

  it("stringifies for socket / bridge lines", () => {
    expect(stringifyActionResponsePayload("s", "a", "x")).toBe(
      '{"type":"action_response","sessionId":"s","actionId":"a","response":{"kind":"option","value":"x"}}',
    );
  });
});
