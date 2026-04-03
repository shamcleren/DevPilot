import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { IntegrationDiagnostics } from "../../shared/integrationTypes";
import { IntegrationPanel } from "./IntegrationPanel";

const baseRuntime = {
  packaged: false,
  hookScriptsRoot: "/app/scripts/hooks",
  executablePath: "/tmp/Electron.bin",
  executableLabel: "开发模式 · Electron.bin",
};

const diagnostics: IntegrationDiagnostics = {
  listener: {
    mode: "tcp",
    host: "127.0.0.1",
    port: 17371,
  },
  runtime: baseRuntime,
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
      health: "not_configured",
      healthLabel: "未配置",
      actionLabel: "启用",
      statusMessage: "未配置 CodePal Cursor hooks",
    },
    {
      id: "codex",
      label: "Codex",
      supported: true,
      configPath: "/Users/demo/.codex/config.toml",
      configExists: true,
      hookScriptPath: "/Users/demo/.codex/config.toml",
      hookScriptExists: true,
      hookInstalled: true,
      health: "active",
      healthLabel: "正常",
      actionLabel: "修复",
      statusMessage: "已配置 Codex 完成通知 notify hook，并自动读取 session 日志",
      lastEventAt: Date.parse("2026-03-31T11:00:00.000Z"),
      lastEventStatus: "running",
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
      health: "active",
      healthLabel: "正常",
      actionLabel: "修复",
      statusMessage: "已配置用户级 CodeBuddy hooks",
      lastEventAt: Date.parse("2026-03-31T12:00:00.000Z"),
      lastEventStatus: "running",
    },
  ],
};

const legacyDiagnostics: IntegrationDiagnostics = {
  ...diagnostics,
  agents: [
    {
      id: "cursor",
      label: "Cursor",
      supported: true,
      configPath: "/Users/demo/.cursor/hooks.json",
      configExists: true,
      hookScriptPath: "/app/scripts/hooks/cursor-agent-hook.sh",
      hookScriptExists: true,
      hookInstalled: true,
      health: "legacy_path",
      healthLabel: "待迁移",
      actionLabel: "迁移",
      statusMessage: "检测到旧版 CodePal Cursor hook 命令，建议迁移",
    },
  ],
};

const unavailableDiagnostics: IntegrationDiagnostics = {
  ...diagnostics,
  listener: {
    mode: "unavailable",
  },
};

describe("IntegrationPanel", () => {
  it("renders hook command context, listener, and agent actions", () => {
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

    expect(html).toContain("接入与诊断");
    expect(html).toContain("这里只放低频接入和修复");
    expect(html).toContain("监听中：TCP 127.0.0.1:17371");
    expect(html).toContain("开发模式 · Electron.bin");
    expect(html).not.toContain("node:");
    expect(html).not.toContain("python3:");
    expect(html).toContain("…/.codex/config.toml");
    expect(html).toContain("…/.cursor/hooks.json");
    expect(html).toContain("未配置");
    expect(html).toContain("正常");
    expect(html).toContain("未配置 CodePal Cursor hooks");
    expect(html).toContain("最近事件：running · 03/31");
    expect(html).toContain("已配置 Codex 完成通知 notify hook，并自动读取 session 日志");
    expect(html).toContain("配置已更新");
    expect(html).toContain(">启用<");
    expect(html).not.toContain(">修复<");
    expect(html).not.toContain(">修复<");
  });

  it("shows legacy_path as 待迁移 with 迁移 action", () => {
    const html = renderToStaticMarkup(
      <IntegrationPanel
        diagnostics={legacyDiagnostics}
        loading={false}
        installingAgentId={null}
        feedbackMessage={null}
        errorMessage={null}
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(html).toContain("待迁移");
    expect(html).toContain(">迁移<");
    expect(html).toContain("检测到旧版 CodePal Cursor hook 命令，建议迁移");
    expect(html).toContain("最近事件：无");
  });

  it("renders Chinese fallback labels for unavailable listener", () => {
    const html = renderToStaticMarkup(
      <IntegrationPanel
        diagnostics={unavailableDiagnostics}
        loading={false}
        installingAgentId={null}
        feedbackMessage={null}
        errorMessage={null}
        onRefresh={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(html).toContain("监听不可用");
  });
});
