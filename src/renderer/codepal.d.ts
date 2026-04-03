import type {
  CursorDashboardConnectResult,
  CursorDashboardDiagnostics,
} from "../shared/cursorDashboardTypes";
import type {
  IntegrationDiagnostics,
  IntegrationInstallResult,
} from "../shared/integrationTypes";
import type { SessionRecord } from "../shared/sessionTypes";
import type { UsageOverview } from "../shared/usageTypes";

export type CodePalApi = {
  version: string;
  getSessions: () => Promise<SessionRecord[]>;
  onSessions: (handler: (sessions: SessionRecord[]) => void) => () => void;
  getUsageOverview: () => Promise<UsageOverview>;
  onUsageOverview: (handler: (overview: UsageOverview) => void) => () => void;
  getIntegrationDiagnostics: () => Promise<IntegrationDiagnostics>;
  installIntegrationHooks: (
    agentId: "cursor" | "codebuddy" | "codex",
  ) => Promise<IntegrationInstallResult>;
  getCursorDashboardDiagnostics: () => Promise<CursorDashboardDiagnostics>;
  connectCursorDashboard: () => Promise<CursorDashboardConnectResult>;
  refreshCursorDashboardUsage: () => Promise<CursorDashboardConnectResult>;
  onOpenSettings: (handler: () => void) => () => void;
  openExternalTarget: (target: string) => Promise<string>;
  writeClipboardText: (text: string) => Promise<void>;
  respondToPendingAction: (sessionId: string, actionId: string, option: string) => void;
};

declare global {
  interface Window {
    codepal: CodePalApi;
  }
}

export {};
