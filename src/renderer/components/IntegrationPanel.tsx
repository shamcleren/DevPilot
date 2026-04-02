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
  if (!diagnostics) return "正在加载监听状态…";
  const { listener } = diagnostics;
  if (listener.mode === "tcp") {
    return `监听中：TCP ${listener.host}:${listener.port}`;
  }
  if (listener.mode === "socket") {
    return `监听中：Unix socket ${listener.socketPath}`;
  }
  return listener.message ?? "监听不可用";
}

function lastEventLabel(agent: IntegrationAgentDiagnostics): string {
  if (!agent.lastEventAt || !agent.lastEventStatus) {
    return "最近事件：无";
  }
  return `最近事件：${agent.lastEventStatus} · ${new Date(agent.lastEventAt).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function hookBadgeClass(agent: IntegrationAgentDiagnostics): string {
  switch (agent.health) {
    case "legacy_path":
      return "hook-badge hook-badge--legacy";
    case "active":
      return "hook-badge hook-badge--active";
    case "repair_needed":
      return "hook-badge hook-badge--repair";
    default:
      return "hook-badge hook-badge--inactive";
  }
}

function compactPathLabel(pathValue: string): string {
  const segments = pathValue.split("/");
  if (segments.length <= 3) {
    return pathValue;
  }
  return `…/${segments.slice(-2).join("/")}`;
}

function shouldShowAction(agent: IntegrationAgentDiagnostics): boolean {
  return agent.supported && agent.health !== "active";
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
    <section className="integration-panel" aria-label="接入管理">
      <div className="integration-panel__header">
        <div>
          <div className="integration-panel__title">接入与诊断</div>
          <div className="integration-panel__subtitle">
            这里只放低频接入和修复。正常状态下不需要额外操作。
          </div>
          <div className="integration-panel__summary">{listenerLabel(diagnostics)}</div>
        </div>
        <button
          type="button"
          className="integration-panel__refresh"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新"}
        </button>
      </div>

      {runtime ? (
        <div className="integration-panel__runtime">
          <span title={runtime.executablePath}>{runtime.executableLabel}</span>
          <span>{runtime.packaged ? "打包构建" : "开发运行"}</span>
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
                <span className={hookBadgeClass(agent)}>{agent.healthLabel}</span>
              </div>
              <div className="integration-card__path" title={agent.configPath}>
                {compactPathLabel(agent.configPath)}
              </div>
              <div className="integration-card__meta">{lastEventLabel(agent)}</div>
              {shouldShowAction(agent) ? (
                <button
                  type="button"
                  className="integration-card__action"
                  disabled={isInstalling}
                  onClick={() => onInstall(agent.id)}
                >
                  {isInstalling ? "应用中…" : agent.actionLabel}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
