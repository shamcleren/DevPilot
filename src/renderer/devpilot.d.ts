import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../shared/integrationTypes";
import type { SessionRecord } from "../shared/sessionTypes";

export type DevPilotApi = {
  version: string;
  getSessions: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  getIntegrationDiagnostics: () => Promise<IntegrationDiagnostics>;
  installIntegrationHooks: (
    agentId: "cursor" | "codebuddy",
  ) => Promise<IntegrationInstallResult>;
  respondToPendingAction: (sessionId: string, actionId: string, option: string) => void;
};

declare global {
  interface Window {
    devpilot: DevPilotApi;
  }
}

export {};
