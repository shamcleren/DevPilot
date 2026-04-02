import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrationService } from "./integrationService";

function writeExecutable(pathname: string, body = "#!/usr/bin/env bash\nexit 0\n") {
  mkdirSync(dirname(pathname), { recursive: true });
  writeFileSync(pathname, body, { mode: 0o755 });
}

function createFixtureLayout() {
  const root = mkdtempSync(join(tmpdir(), "codepal-integrations-"));
  const homeDir = join(root, "home");
  const appRoot = join(root, "app");
  const hookScriptsRoot = join(appRoot, "scripts", "hooks");
  writeExecutable(join(hookScriptsRoot, "cursor-agent-hook.sh"));
  writeExecutable(join(hookScriptsRoot, "codebuddy-hook.sh"));
  const execPath = join(root, "Electron.bin");
  const appPath = appRoot;
  return { root, homeDir, hookScriptsRoot, execPath, appPath };
}

describe("createIntegrationService", () => {
  afterEach(() => {
    // temp dirs are unique per test run
  });

  it("reports listener diagnostics and unconfigured agents by default", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    service.setListenerDiagnostics({
      mode: "tcp",
      host: "127.0.0.1",
      port: 17371,
    });

    const diagnostics = service.getDiagnostics();

    expect(diagnostics.listener).toEqual({
      mode: "tcp",
      host: "127.0.0.1",
      port: 17371,
    });
    expect(diagnostics.runtime.packaged).toBe(false);
    expect(diagnostics.runtime.executablePath).toBe(execPath);
    expect(diagnostics.runtime.executableLabel).toContain("开发模式");
    expect(diagnostics.runtime.executableLabel).toContain("Electron.bin");
    expect(diagnostics.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cursor",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
        expect.objectContaining({
          id: "codex",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
        expect.objectContaining({
          id: "codebuddy",
          configExists: false,
          hookInstalled: false,
          health: "not_configured",
          healthLabel: "未配置",
        }),
      ]),
    );
  });

  it("installs cursor user hooks idempotently", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 42,
    });

    const first = service.installHooks("cursor");
    const second = service.installHooks("cursor");

    const configPath = join(homeDir, ".cursor", "hooks.json");
    const text = readFileSync(configPath, "utf8");

    expect(first.changed).toBe(true);
    expect(first.hookInstalled).toBe(true);
    expect(second.changed).toBe(false);
    const parsed = JSON.parse(text) as {
      version: number;
      hooks: Record<string, Array<{ command: string }>>;
    };

    expect(parsed).toMatchObject({
      version: 1,
    });
    for (const eventName of [
      "sessionStart",
      "stop",
      "beforeSubmitPrompt",
      "afterAgentResponse",
      "afterAgentThought",
      "beforeReadFile",
      "afterFileEdit",
      "beforeMCPExecution",
      "afterMCPExecution",
      "beforeShellExecution",
      "afterShellExecution",
    ]) {
      expect(parsed.hooks[eventName]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: `"${execPath}" "${appPath}" --codepal-hook cursor`,
          }),
        ]),
      );
    }
  });

  it("installs codebuddy hooks without clobbering existing settings", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".codebuddy", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          theme: "dark",
          hooks: {
            SessionStart: [
              {
                hooks: [{ type: "command", command: "echo existing" }],
              },
            ],
          },
        },
        null,
        2,
      ),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
      now: () => 99,
    });

    const result = service.installHooks("codebuddy");
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.SessionStart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hooks: expect.arrayContaining([expect.objectContaining({ command: "echo existing" })]),
        }),
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({
              command: `"${execPath}" "${appPath}" --codepal-hook codebuddy`,
            }),
          ]),
        }),
      ]),
    );
    expect(parsed.hooks.Notification).toHaveLength(2);
  });

  it("records the latest event status per agent", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: true,
      execPath,
      appPath,
    });

    service.recordEvent("codebuddy", "waiting", 1234);
    service.recordEvent("codex", "running", 5678);

    const diagnostics = service.getDiagnostics();
    expect(diagnostics.runtime.packaged).toBe(true);
    expect(diagnostics.runtime.executableLabel).toContain("已打包");
    const codebuddy = diagnostics.agents.find((agent) => agent.id === "codebuddy");
    expect(codebuddy).toMatchObject({
      lastEventAt: 1234,
      lastEventStatus: "waiting",
    });
    const codex = diagnostics.agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      lastEventAt: 5678,
      lastEventStatus: "running",
    });
  });

  it("reports active Codex diagnostics when session logs exist", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const codexSessionsRoot = join(homeDir, ".codex", "sessions");
    mkdirSync(codexSessionsRoot, { recursive: true });

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codex = service.getDiagnostics().agents.find((agent) => agent.id === "codex");
    expect(codex).toMatchObject({
      id: "codex",
      health: "active",
      healthLabel: "正常",
      actionLabel: "自动接入",
      hookInstalled: true,
      statusMessage: "自动读取 Codex session 日志",
      configPath: codexSessionsRoot,
    });
  });

  it("refuses to overwrite incompatible existing hook config structures", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: [],
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    expect(() => service.installHooks("cursor")).toThrow("Cursor hooks.json 结构不兼容");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      version: 1,
      hooks: [],
    });
  });

  it("reports legacy_path for Cursor when hooks use shell script commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" sessionStart` }],
          stop: [{ command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" stop` }],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
    expect(cursor).toMatchObject({
      health: "legacy_path",
      healthLabel: "待迁移",
      actionLabel: "迁移",
      hookInstalled: true,
    });
  });

  it("reports legacy_path for Cursor when hooks use node bridge mjs commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".cursor", "hooks.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          sessionStart: [{ command: "node ./scripts/bridge/cursor-lifecycle.mjs sessionStart" }],
          stop: [{ command: "node ./scripts/bridge/cursor-lifecycle.mjs stop" }],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
    expect(cursor).toMatchObject({
      health: "legacy_path",
      hookInstalled: true,
    });
  });

  it("reports legacy_path for CodeBuddy when hooks use shell script commands", () => {
    const { homeDir, hookScriptsRoot, execPath, appPath } = createFixtureLayout();
    const configPath = join(homeDir, ".codebuddy", "settings.json");
    mkdirSync(dirname(configPath), { recursive: true });
    const legacyCommand = `"${join(hookScriptsRoot, "codebuddy-hook.sh")}"`;
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          UserPromptSubmit: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          SessionEnd: [{ hooks: [{ type: "command", command: legacyCommand }] }],
          Notification: [
            {
              matcher: "permission_prompt",
              hooks: [{ type: "command", command: legacyCommand }],
            },
            { matcher: "idle_prompt", hooks: [{ type: "command", command: legacyCommand }] },
          ],
        },
      }),
    );

    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      execPath,
      appPath,
    });

    const codebuddy = service.getDiagnostics().agents.find((agent) => agent.id === "codebuddy");
    expect(codebuddy).toMatchObject({
      health: "legacy_path",
      healthLabel: "待迁移",
      actionLabel: "迁移",
      hookInstalled: true,
    });
  });
});
