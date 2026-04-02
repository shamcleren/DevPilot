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
  return `最近事件：${agent.lastEventStatus} @ ${new Date(agent.lastEventAt).toISOString()}`;
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
          <div className="integration-panel__title">CodePal Hook 命令</div>
          <div className="integration-panel__subtitle">
            管理本应用写入各编辑器的 hook 命令与迁移状态；新链路使用应用自身可执行入口，无需依赖外部
            node/python3。
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
          <span className="integration-panel__runtime-path" title={runtime.executablePath}>
            {runtime.executablePath}
          </span>
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
              <div className="integration-card__path">{agent.configPath}</div>
              <div className="integration-card__meta">{lastEventLabel(agent)}</div>
              <button
                type="button"
                className="integration-card__action"
                disabled={isInstalling}
                onClick={() => onInstall(agent.id)}
              >
                {isInstalling ? "应用中…" : agent.actionLabel}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
