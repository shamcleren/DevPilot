import type { SessionRecord } from "../shared/sessionTypes";

/**
 * Renderer row model: same core fields as {@link SessionRecord}, plus mock-only
 * presentation fields until IPC wiring lands.
 */
export type MonitorSessionRow = SessionRecord & {
  durationLabel: string;
  activities: string[];
  hoverSummary: string;
};
