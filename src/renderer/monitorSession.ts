import type { SessionRecord } from "../shared/sessionTypes";

/**
 * Renderer row model: same core fields as {@link SessionRecord}, plus mock-only
 * presentation fields until IPC wiring lands.
 */
export type MonitorSessionRow = SessionRecord & {
  titleLabel: string;
  shortId: string;
  updatedLabel: string;
  durationLabel: string;
  activities: string[];
  hoverSummary: string;
};
