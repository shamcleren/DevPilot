import { useEffect, useMemo, useState } from "react";
import type { IntegrationAgentId, IntegrationDiagnostics } from "../shared/integrationTypes";
import { IntegrationPanel } from "./components/IntegrationPanel";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import type { MonitorSessionRow } from "./monitorSession";
import { hydrateRowsIfEmpty, rowsFromSessions } from "./sessionBootstrap";

export type AppView = "sessions" | "settings";

function resolveInitialView(): AppView {
  if (typeof window === "undefined") {
    return "sessions";
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("view") === "settings" ? "settings" : "sessions";
}

type AppProps = {
  initialView?: AppView;
};

export function App({ initialView = resolveInitialView() }: AppProps = {}) {
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
    if (initialView === "settings") {
      refreshIntegrations();
    }
  }, [initialView]);

  const counts = useMemo(
    () => ({
      running: rows.filter((s) => s.status === "running").length,
      waiting: rows.filter((s) => s.status === "waiting").length,
      error: rows.filter((s) => s.status === "error").length,
    }),
    [rows],
  );

  if (initialView === "settings") {
    return (
      <div className="app app--settings">
        <div className="app-header">
          <div>
            <h1 className="app-title">CodePal 设置</h1>
            <p className="app-subtitle">低频的接入、修复和诊断操作都放在这里。</p>
          </div>
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
      </div>
    );
  }

  return (
    <div className="app">
      <div className="app-header">
        <h1 className="app-title">CodePal</h1>
        <button
          type="button"
          className="app-settings-trigger"
          aria-label="打开设置"
          onClick={() => {
            window.codepal.openSettings();
          }}
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
    </div>
  );
}
