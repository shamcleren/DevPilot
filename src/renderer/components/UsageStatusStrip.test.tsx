import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageOverview } from "../../shared/usageTypes";
import type { UsageDisplaySettings } from "../usageDisplaySettings";
import { UsageStatusStrip } from "./UsageStatusStrip";

const overview: UsageOverview = {
  updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
  summary: {
    updatedAt: Date.parse("2026-04-03T12:35:00.000Z"),
    rateLimits: [
      { agent: "codex", usedPercent: 32, resetAt: 1775200500, windowLabel: "5 小时" },
      { agent: "codex", usedPercent: 63, resetAt: 1775635200, windowLabel: "7 天" },
      {
        agent: "cursor",
        usedPercent: 40,
        remaining: 12000,
        limit: 30000,
        resetAt: 1775635200,
        windowLabel: "总量",
        planType: "usd-cents",
      },
    ],
    contextMode: "multi-session",
  },
  sessions: [],
};

const defaultSettings: UsageDisplaySettings = {
  showInStatusBar: true,
  hiddenAgents: [],
  density: "compact",
};

describe("UsageStatusStrip", () => {
  it("renders compact per-agent usage in the status bar", () => {
    const html = renderToStaticMarkup(
      <UsageStatusStrip overview={overview} settings={defaultSettings} />,
    );

    expect(html).toContain("usage-strip");
    expect(html).toContain("Codex");
    expect(html).toContain("5h 68%");
    expect(html).toContain("7d 37%");
    expect(html).toContain("Cursor");
    expect(html).toContain("$180 / 300");
    expect(html).toContain("60%");
    expect(html).toContain("cursor-app-icon");
    expect(html).toContain("codex-app-icon");
    expect(html).not.toContain("usage-strip__meter");
    expect(html).toContain("usage-strip__value--primary");
  });

  it("renders reset times inline in detailed mode and keeps hover hints", () => {
    const html = renderToStaticMarkup(
      <UsageStatusStrip
        overview={overview}
        settings={{ showInStatusBar: true, hiddenAgents: [], density: "detailed" }}
      />,
    );

    expect(html).toContain("usage-strip__value--primary\">5h 68%</span>");
    expect(html).toContain("usage-strip__value--secondary\">04/03 15:15</span>");
    expect(html).toContain("usage-strip__value--primary\">7d 37%</span>");
    expect(html).toContain("usage-strip__value--secondary\">04/08 16:00</span>");
    expect(html).toContain("usage-strip__value--primary\">60%</span>");
    expect(html).toContain("title=\"5h reset 04/03 15:15 | 7d reset 04/08 16:00\"");
    expect(html).toContain("usage-strip__value--secondary");
  });

  it("hides agents disabled in settings", () => {
    const html = renderToStaticMarkup(
      <UsageStatusStrip
        overview={overview}
        settings={{ showInStatusBar: true, hiddenAgents: ["cursor"], density: "compact" }}
      />,
    );

    expect(html).toContain("Codex");
    expect(html).not.toContain("Cursor");
  });

  it("renders nothing when the strip is disabled", () => {
    const html = renderToStaticMarkup(
      <UsageStatusStrip
        overview={overview}
        settings={{ showInStatusBar: false, hiddenAgents: [], density: "compact" }}
      />,
    );

    expect(html).toBe("");
  });
});
