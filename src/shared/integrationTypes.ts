import type { SessionStatus } from "./sessionTypes";

export type IntegrationAgentId = "cursor" | "codebuddy";

export interface IntegrationListenerDiagnostics {
  mode: "tcp" | "socket" | "unavailable";
  host?: string;
  port?: number;
  socketPath?: string;
  message?: string;
}

export interface IntegrationRuntimeDiagnostics {
  packaged: boolean;
  hookScriptsRoot: string;
  dependencies: {
    node: boolean;
    python3: boolean;
  };
}

export interface IntegrationAgentDiagnostics {
  id: IntegrationAgentId;
  label: string;
  supported: boolean;
  configPath: string;
  configExists: boolean;
  hookScriptPath: string;
  hookScriptExists: boolean;
  hookInstalled: boolean;
  statusMessage: string;
  lastEventAt?: number;
  lastEventStatus?: SessionStatus;
}

export interface IntegrationDiagnostics {
  listener: IntegrationListenerDiagnostics;
  runtime: IntegrationRuntimeDiagnostics;
  agents: IntegrationAgentDiagnostics[];
}

export interface IntegrationInstallResult {
  agentId: IntegrationAgentId;
  configPath: string;
  changed: boolean;
  hookInstalled: boolean;
  backupPath?: string;
  message: string;
  diagnostics: IntegrationAgentDiagnostics;
}
