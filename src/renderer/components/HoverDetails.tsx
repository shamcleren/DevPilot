type HoverDetailsProps = {
  activities: string[];
  summary: string;
};

export function HoverDetails({ activities, summary }: HoverDetailsProps) {
  return (
    <div className="hover-details" role="region" aria-label="Session context">
      <p className="hover-details__summary">
        <strong>{summary}</strong>
      </p>
      <ul className="hover-details__list">
        {activities.map((line, i) => (
          <li key={`${i}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
