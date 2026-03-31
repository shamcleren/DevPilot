import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "./components/StatusBar";
import { SessionList } from "./components/SessionList";
import type { MonitorSessionRow } from "./monitorSession";
import { hydrateRowsIfEmpty, rowsFromSessions } from "./sessionBootstrap";

export function App() {
  const [rows, setRows] = useState<MonitorSessionRow[]>([]);

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
