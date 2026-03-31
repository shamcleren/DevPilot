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

  function refreshIntegrations() {
    setIntegrationLoading(true);
    setIntegrationError(null);
    setIntegrationFeedback(null);
    void window.devpilot
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

  useEffect(() => {
    let active = true;
    const unsub = window.devpilot.onSessions((sessions) => {
      setRows(rowsFromSessions(sessions));
    });
    void window.devpilot.getSessions().then((sessions) => {
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
    refreshIntegrations();
  }, []);

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
      <h1 className="app-title">DevPilot</h1>
      <StatusBar counts={counts} />
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
          void window.devpilot
            .installIntegrationHooks(agentId)
            .then((result) => {
              setIntegrationFeedback(result.message);
              return window.devpilot.getIntegrationDiagnostics();
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
      {rows.length === 0 ? (
        <p className="app-hint" style={{ padding: "0 12px", opacity: 0.75 }}>
          等待来自 Cursor / CodeBuddy hook 的实时会话事件（IPC 端口默认 17371）。
        </p>
      ) : null}
      <SessionList
        sessions={rows}
        onRespond={(sessionId, actionId, option) => {
          window.devpilot.respondToPendingAction(sessionId, actionId, option);
        }}
      />
    </div>
  );
}
