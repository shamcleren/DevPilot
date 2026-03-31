import type { SessionRecord } from "../shared/sessionTypes";

export type DevPilotApi = {
  version: string;
  getSessions: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  respondToPendingAction: (sessionId: string, actionId: string, option: string) => void;
};

declare global {
  interface Window {
    devpilot: DevPilotApi;
  }
}

export {};
