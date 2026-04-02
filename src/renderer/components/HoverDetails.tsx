type HoverDetailsProps = {
  activities: string[];
  summary: string;
};

export function HoverDetails({ activities, summary }: HoverDetailsProps) {
  const [latestActivity, ...restActivities] = activities;

  return (
    <div className="hover-details" role="region" aria-label="Session context">
      <div className="hover-details__summary-label">Latest</div>
      <p className="hover-details__summary">
        <strong>{summary}</strong>
      </p>
      {latestActivity ? (
        <div className="hover-details__latest">
          <span className="hover-details__latest-dot" aria-hidden="true" />
          <span>{latestActivity}</span>
        </div>
      ) : null}
      {restActivities.length > 0 ? (
        <>
          <div className="hover-details__section-label">Recent</div>
          <ul className="hover-details__list">
            {restActivities.map((line, i) => (
              <li key={`${i}-${line}`}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
