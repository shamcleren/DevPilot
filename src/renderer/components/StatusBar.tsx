export type StatusCounts = {
  running: number;
  waiting: number;
  error: number;
};

type StatusBarProps = {
  counts: StatusCounts;
};

export function StatusBar({ counts }: StatusBarProps) {
  return (
    <section className="status-bar" aria-label="Task status distribution">
      <span className="status-bar__label">Status</span>
      <div className="status-chip status-chip--running">
        <span className="status-chip__dot" aria-hidden />
        <span>Running {counts.running}</span>
      </div>
      <div className="status-chip status-chip--waiting">
        <span className="status-chip__dot" aria-hidden />
        <span>Waiting {counts.waiting}</span>
      </div>
      <div className="status-chip status-chip--error">
        <span className="status-chip__dot" aria-hidden />
        <span>Error {counts.error}</span>
      </div>
    </section>
  );
}
