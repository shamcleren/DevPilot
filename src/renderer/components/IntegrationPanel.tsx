import type {
  IntegrationAgentDiagnostics,
  IntegrationAgentId,
  IntegrationDiagnostics,
} from "../../shared/integrationTypes";

type IntegrationPanelProps = {
  diagnostics: IntegrationDiagnostics | null;
  loading: boolean;
  installingAgentId: IntegrationAgentId | null;
  feedbackMessage: string | null;
  errorMessage: string | null;
  onRefresh: () => void;
  onInstall: (agentId: IntegrationAgentId) => void;
};

function listenerLabel(diagnostics: IntegrationDiagnostics | null): string {
  if (!diagnostics) return "Loading listener diagnostics...";
  const { listener } = diagnostics;
  if (listener.mode === "tcp") {
    return `TCP ${listener.host}:${listener.port}`;
  }
  if (listener.mode === "socket") {
    return `Unix socket ${listener.socketPath}`;
  }
  return listener.message ?? "Listener unavailable";
}

function dependencyLabel(name: string, available: boolean): string {
  return `${name}: ${available ? "OK" : "Missing"}`;
}

function lastEventLabel(agent: IntegrationAgentDiagnostics): string {
  if (!agent.lastEventAt || !agent.lastEventStatus) {
    return "Recent event: never";
  }
  return `Recent event: ${agent.lastEventStatus} @ ${new Date(agent.lastEventAt).toISOString()}`;
}

export function IntegrationPanel({
  diagnostics,
  loading,
  installingAgentId,
  feedbackMessage,
  errorMessage,
  onRefresh,
  onInstall,
}: IntegrationPanelProps) {
  const runtime = diagnostics?.runtime;

  return (
    <section className="integration-panel" aria-label="Integration settings">
      <div className="integration-panel__header">
        <div>
          <div className="integration-panel__title">Integrations</div>
          <div className="integration-panel__summary">{listenerLabel(diagnostics)}</div>
        </div>
        <button
          type="button"
          className="integration-panel__refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {runtime ? (
        <div className="integration-panel__runtime">
          <span>{runtime.packaged ? "Packaged app" : "Dev mode"}</span>
          <span>{dependencyLabel("node", runtime.dependencies.node)}</span>
          <span>{dependencyLabel("python3", runtime.dependencies.python3)}</span>
        </div>
      ) : null}

      {feedbackMessage ? <p className="integration-panel__feedback">{feedbackMessage}</p> : null}
      {errorMessage ? <p className="integration-panel__error">{errorMessage}</p> : null}

      <div className="integration-grid">
        {(diagnostics?.agents ?? []).map((agent) => {
          const isInstalling = installingAgentId === agent.id;
          return (
            <article key={agent.id} className="integration-card" aria-label={agent.label}>
              <div className="integration-card__header">
                <div>
                  <div className="integration-card__name">{agent.label}</div>
                  <div className="integration-card__message">{agent.statusMessage}</div>
                </div>
                <span
                  className={`hook-badge ${
                    agent.hookInstalled ? "hook-badge--installed" : "hook-badge--missing"
                  }`}
                >
                  {agent.hookInstalled ? "Installed" : "Not installed"}
                </span>
              </div>
              <div className="integration-card__path">{agent.configPath}</div>
              <div className="integration-card__meta">{lastEventLabel(agent)}</div>
              <button
                type="button"
                className="integration-card__action"
                disabled={isInstalling}
                onClick={() => onInstall(agent.id)}
              >
                {isInstalling ? "Applying..." : agent.hookInstalled ? "Repair" : "Enable"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
