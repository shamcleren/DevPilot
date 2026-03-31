import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IntegrationPanel } from "./IntegrationPanel";
import type { IntegrationDiagnostics } from "../../shared/integrationTypes";

const diagnostics: IntegrationDiagnostics = {
  listener: {
    mode: "tcp",
    host: "127.0.0.1",
    port: 17371,
  },
  runtime: {
    packaged: false,
    hookScriptsRoot: "/app/scripts/hooks",
    dependencies: {
      node: true,
      python3: false,
    },
  },
  agents: [
    {
      id: "cursor",
      label: "Cursor",
      supported: true,
      configPath: "/Users/demo/.cursor/hooks.json",
      configExists: true,
      hookScriptPath: "/app/scripts/hooks/cursor-agent-hook.sh",
      hookScriptExists: true,
      hookInstalled: false,
      statusMessage: "未配置 DevPilot Cursor hooks",
    },
    {
      id: "codebuddy",
      label: "CodeBuddy",
      supported: true,
      configPath: "/Users/demo/.codebuddy/settings.json",
      configExists: true,
      hookScriptPath: "/app/scripts/hooks/codebuddy-hook.sh",
      hookScriptExists: true,
      hookInstalled: true,
      statusMessage: "已配置用户级 CodeBuddy hooks",
      lastEventAt: Date.parse("2026-03-31T12:00:00.000Z"),
      lastEventStatus: "running",
    },
  ],
};

describe("IntegrationPanel", () => {
  it("renders listener, dependency, and integration status details", () => {
    const html = renderToStaticMarkup(
      <IntegrationPanel
        diagnostics={diagnostics}
        loading={false}
        installingAgentId={null}
        feedbackMessage="配置已更新"
        errorMessage={null}
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(html).toContain("Integrations");
    expect(html).toContain("TCP 127.0.0.1:17371");
    expect(html).toContain("node: OK");
    expect(html).toContain("python3: Missing");
    expect(html).toContain("/Users/demo/.cursor/hooks.json");
    expect(html).toContain("Not installed");
    expect(html).toContain("Installed");
    expect(html).toContain("Recent event: running @ 2026-03-31T12:00:00.000Z");
    expect(html).toContain("配置已更新");
    expect(html).toContain(">Enable<");
    expect(html).toContain(">Repair<");
  });
});
