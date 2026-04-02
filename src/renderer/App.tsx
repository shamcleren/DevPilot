import { useEffect, useMemo, useState } from "react";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import type { MonitorSessionRow } from "./monitorSession";
import { hydrateRowsIfEmpty, rowsFromSessions } from "./sessionBootstrap";

export function App() {
  const [rows, setRows] = useState<MonitorSessionRow[]>([]);
  const [integrationDiagnostics, setIntegrationDiagnostics] =
    useState<IntegrationDiagnostics | null>(null);
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [installingAgentId, setInstallingAgentId] = useState<IntegrationAgentId | null>(null);
  const [integrationFeedback, setIntegrationFeedback] = useState<string | null>(null);
  const [integrationError, setIntegrationError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  const counts = useMemo(
    () => ({
      running: rows.filter((s) => s.status === "running").length,
      waiting: rows.filter((s) => s.status === "waiting").length,
      error: rows.filter((s) => s.status === "error").length,
    }),
    [rows],
  );

  return (
    <div className="app">
      <div className="app-header">
        <h1 className="app-title">CodePal</h1>
        <button
          type="button"
          className="app-settings-trigger"
          aria-label="打开设置"
          onClick={openSettingsDrawer}
        >
          设置
        </button>
      </div>
      <StatusBar counts={counts} />
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
      </aside>
    </div>
  );
}
