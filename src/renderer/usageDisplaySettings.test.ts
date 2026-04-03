import { describe, expect, it } from "vitest";
import {
  defaultUsageDisplaySettings,
  loadUsageDisplaySettings,
  saveUsageDisplaySettings,
  type UsageDisplaySettings,
} from "./usageDisplaySettings";

class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("usageDisplaySettings", () => {
  it("falls back to defaults when storage is empty", () => {
    expect(loadUsageDisplaySettings(new MemoryStorage())).toEqual(defaultUsageDisplaySettings);
  });

  it("loads persisted settings from storage", () => {
    const storage = new MemoryStorage();
    const settings: UsageDisplaySettings = {
      showInStatusBar: false,
      hiddenAgents: ["codex", "cursor"],
      density: "compact",
    };

    saveUsageDisplaySettings(storage, settings);

    expect(loadUsageDisplaySettings(storage)).toEqual(settings);
  });

  it("ignores invalid persisted data", () => {
    const storage = new MemoryStorage();
    storage.setItem("codepal:usage-display-settings", "{\"showInStatusBar\":\"bad\"}");

    expect(loadUsageDisplaySettings(storage)).toEqual(defaultUsageDisplaySettings);
  });
});
