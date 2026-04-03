export type UsageAgentId = "codex" | "cursor" | "codebuddy";

export type UsageDisplaySettings = {
  showInStatusBar: boolean;
  hiddenAgents: UsageAgentId[];
  density: "compact" | "detailed";
};

const STORAGE_KEY = "codepal:usage-display-settings";

export const defaultUsageDisplaySettings: UsageDisplaySettings = {
  showInStatusBar: true,
  hiddenAgents: [],
  density: "detailed",
};

function isUsageAgentId(value: unknown): value is UsageAgentId {
  return value === "codex" || value === "cursor" || value === "codebuddy";
}

function normalizeSettings(value: unknown): UsageDisplaySettings | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.showInStatusBar !== "boolean" ||
    !Array.isArray(candidate.hiddenAgents) ||
    (candidate.density !== "compact" && candidate.density !== "detailed")
  ) {
    return null;
  }

  const hiddenAgents = candidate.hiddenAgents.filter(isUsageAgentId);
  return {
    showInStatusBar: candidate.showInStatusBar,
    hiddenAgents,
    density: candidate.density,
  };
}

export function loadUsageDisplaySettings(
  storage: Pick<Storage, "getItem"> | undefined,
): UsageDisplaySettings {
  if (!storage) {
    return defaultUsageDisplaySettings;
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultUsageDisplaySettings;
  }

  try {
    return normalizeSettings(JSON.parse(raw)) ?? defaultUsageDisplaySettings;
  } catch {
    return defaultUsageDisplaySettings;
  }
}

export function saveUsageDisplaySettings(
  storage: Pick<Storage, "setItem"> | undefined,
  settings: UsageDisplaySettings,
): void {
  storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
}
