import { useEffect, useState } from "react";
import type { CursorDashboardDiagnostics } from "../shared/cursorDashboardTypes";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import type { UsageOverview } from "../shared/usageTypes";
import { DisplayPreferencesPanel } from "./components/DisplayPreferencesPanel";
import { CursorDashboardPanel } from "./components/CursorDashboardPanel";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import { UsageStatusStrip } from "./components/UsageStatusStrip";
import type { MonitorSessionRow } from "./monitorSession";
import { hydrateRowsIfEmpty, rowsFromSessions } from "./sessionBootstrap";
import {
  loadUsageDisplaySettings,
  saveUsageDisplaySettings,
  type UsageAgentId,
  type UsageDisplaySettings,
} from "./usageDisplaySettings";

const CURSOR_DASHBOARD_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function storageOrUndefined(): Storage | undefined {
  return typeof window !== "undefined" && window.localStorage ? window.localStorage : undefined;
}

export function App() {
  const [rows, setRows] = useState<MonitorSessionRow[]>([]);
  const [integrationDiagnostics, setIntegrationDiagnostics] =
    useState<IntegrationDiagnostics | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [installingAgentId, setInstallingAgentId] = useState<IntegrationAgentId | null>(null);
  const [integrationFeedback, setIntegrationFeedback] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usageOverview, setUsageOverview] = useState<UsageOverview | null>(null);
  const [cursorDashboardDiagnostics, setCursorDashboardDiagnostics] =
    useState<CursorDashboardDiagnostics | null>(null);
  const [cursorDashboardLoading, setCursorDashboardLoading] = useState(false);
  const [usageDisplaySettings, setUsageDisplaySettings] = useState<UsageDisplaySettings>(() =>
    loadUsageDisplaySettings(storageOrUndefined()),
  );

  function loadCursorDashboardDiagnostics() {
    return window.codepal
      .getCursorDashboardDiagnostics()
      .then((cursorDiagnostics) => {
        setCursorDashboardDiagnostics(cursorDiagnostics);
        return cursorDiagnostics;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setCursorDashboardDiagnostics(diagnostics);
        return diagnostics;
      });
  }

  function runCursorDashboardSync(mode: "connect" | "refresh") {
    setCursorDashboardLoading(true);
    const action =
      mode === "connect"
        ? window.codepal.connectCursorDashboard()
        : window.codepal.refreshCursorDashboardUsage();
    return action
      .then((result) => {
        setCursorDashboardDiagnostics(result.diagnostics);
        return result;
      })
      .catch((error: unknown) => {
        const diagnostics = {
          state: "error" as const,
          message: (error as Error).message,
        };
        setCursorDashboardDiagnostics(diagnostics);
        return {
          diagnostics,
          synced: false,
        };
      })
      .finally(() => {
        setCursorDashboardLoading(false);
      });
  }

  function refreshIntegrations() {
    setIntegrationLoading(true);
    setIntegrationError(null);
    setIntegrationFeedback(null);
    void window.codepal
      .getIntegrationDiagnostics()
      .then((diagnostics) => {
        setIntegrationDiagnostics(diagnostics);
      })
      .catch((error: unknown) => {
        setIntegrationError((error as Error).message);
      })
      .finally(() => {
        setIntegrationLoading(false);
      });

    void loadCursorDashboardDiagnostics();
  }

  function openSettingsDrawer() {
    setSettingsOpen(true);
    refreshIntegrations();
  }

  function closeSettingsDrawer() {
    setSettingsOpen(false);
  }

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onSessions((sessions) => {
      setRows(rowsFromSessions(sessions));
    });
    void window.codepal.getSessions().then((sessions) => {
      if (!active) {
        return;
      }
      setRows((currentRows) => hydrateRowsIfEmpty(currentRows, sessions));
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    void loadCursorDashboardDiagnostics();
  }, []);

  useEffect(() => {
    let active = true;
    const unsub = window.codepal.onUsageOverview((overview) => {
      setUsageOverview(overview);
    });
    void window.codepal.getUsageOverview().then((overview) => {
      if (!active) {
        return;
      }
      setUsageOverview(overview);
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    const unsub = window.codepal.onOpenSettings(() => {
      openSettingsDrawer();
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!settingsOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeSettingsDrawer();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (cursorDashboardLoading || cursorDashboardDiagnostics?.state !== "connected") {
      return;
    }

    if (!cursorDashboardDiagnostics.lastSyncAt) {
      void runCursorDashboardSync("refresh");
      return;
    }

    const timer = window.setInterval(() => {
      void runCursorDashboardSync("refresh");
    }, CURSOR_DASHBOARD_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    cursorDashboardDiagnostics?.lastSyncAt,
    cursorDashboardDiagnostics?.state,
    cursorDashboardLoading,
  ]);

  function updateUsageDisplaySettings(nextValue: UsageDisplaySettings) {
    setUsageDisplaySettings(nextValue);
    saveUsageDisplaySettings(storageOrUndefined(), nextValue);
  }

  function toggleUsageAgent(agent: UsageAgentId) {
    const hiddenAgents = usageDisplaySettings.hiddenAgents.includes(agent)
      ? usageDisplaySettings.hiddenAgents.filter((value) => value !== agent)
      : [...usageDisplaySettings.hiddenAgents, agent];

    updateUsageDisplaySettings({
      ...usageDisplaySettings,
      hiddenAgents,
    });
  }

  return (
    <div className="app app-shell">
      <div className="app-header">
        <div className="app-header__meta">
          <h1 className="app-title">CodePal</h1>
        </div>
        <button
          type="button"
          className="app-settings-trigger"
          aria-label="打开设置"
          onClick={openSettingsDrawer}
        >
          设置
        </button>
      </div>
      <StatusBar usage={<UsageStatusStrip overview={usageOverview} settings={usageDisplaySettings} />} />
      {rows.length === 0 ? (
        <p className="app-hint" style={{ padding: "0 12px", opacity: 0.75 }}>
          等待来自 Cursor / CodeBuddy hook 的实时会话事件（IPC 端口默认 17371）。
        </p>
      ) : null}
      <SessionList
        sessions={rows}
        onRespond={(sessionId, actionId, option) => {
          window.codepal.respondToPendingAction(sessionId, actionId, option);
        }}
      />
      {settingsOpen ? (
        <button
          type="button"
          className="app-settings-backdrop"
          aria-label="关闭设置"
          onClick={closeSettingsDrawer}
        />
      ) : null}
      <aside
        className={`app-settings-drawer ${settingsOpen ? "app-settings-drawer--open" : ""}`}
        aria-hidden={!settingsOpen}
      >
        <div className="app-settings-drawer__header">
          <div>
            <h2 className="app-title">CodePal 设置</h2>
            <p className="app-subtitle">低频的接入、修复和诊断操作都放在这里。</p>
          </div>
          <button
            type="button"
            className="app-settings-close"
            aria-label="返回主面板"
            onClick={closeSettingsDrawer}
          >
            返回
          </button>
        </div>
        <IntegrationPanel
          diagnostics={integrationDiagnostics}
          loading={integrationLoading}
          installingAgentId={installingAgentId}
          feedbackMessage={integrationFeedback}
          errorMessage={integrationError}
          onRefresh={refreshIntegrations}
          onInstall={(agentId) => {
            setInstallingAgentId(agentId);
            setIntegrationError(null);
            setIntegrationFeedback(null);
            void window.codepal
              .installIntegrationHooks(agentId)
              .then((result) => {
                setIntegrationFeedback(result.message);
                return window.codepal.getIntegrationDiagnostics();
              })
              .then((diagnostics) => {
                setIntegrationDiagnostics(diagnostics);
              })
              .catch((error: unknown) => {
                setIntegrationError((error as Error).message);
              })
              .finally(() => {
                setInstallingAgentId(null);
              });
          }}
        />
        <DisplayPreferencesPanel
          settings={usageDisplaySettings}
          onToggleStrip={(nextValue) =>
            updateUsageDisplaySettings({
              ...usageDisplaySettings,
              showInStatusBar: nextValue,
            })
          }
          onToggleAgent={toggleUsageAgent}
          onDensityChange={(nextValue) =>
            updateUsageDisplaySettings({
              ...usageDisplaySettings,
              density: nextValue,
            })
          }
        >
          <CursorDashboardPanel
            diagnostics={cursorDashboardDiagnostics}
            loading={cursorDashboardLoading}
            onConnect={() => {
              void runCursorDashboardSync("connect");
            }}
            onRefresh={() => {
              void runCursorDashboardSync("refresh");
            }}
          />
        </DisplayPreferencesPanel>
        <section className="display-panel" aria-label="实验功能">
          <div className="display-panel__header">
            <div className="display-panel__title">实验功能</div>
            <div className="display-panel__subtitle">
              审批与选项响应链路仍保留在应用中，但当前不作为 Dashboard V1 主路径。
            </div>
          </div>
        </section>
      </aside>
    </div>
  );
}
