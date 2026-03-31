import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createIntegrationService } from "./integrationService";

function writeExecutable(path: string, body = "#!/usr/bin/env bash\nexit 0\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, { mode: 0o755 });
}

function createFixtureLayout() {
  const root = mkdtempSync(join(tmpdir(), "devpilot-integrations-"));
  const homeDir = join(root, "home");
  const hookScriptsRoot = join(root, "app", "scripts", "hooks");
  writeExecutable(join(hookScriptsRoot, "cursor-agent-hook.sh"));
  writeExecutable(join(hookScriptsRoot, "codebuddy-hook.sh"));
  return { root, homeDir, hookScriptsRoot };
}

describe("createIntegrationService", () => {
  afterEach(() => {
    // Temp directories live under /tmp and are unique per test; explicit cleanup is not required here.
  });

  it("reports listener diagnostics and unconfigured agents by default", () => {
    const { homeDir, hookScriptsRoot } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      commandExists: () => true,
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
    expect(diagnostics.runtime.dependencies).toEqual({ node: true, python3: true });
    expect(diagnostics.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cursor",
          configExists: false,
          hookInstalled: false,
        }),
        expect.objectContaining({
          id: "codebuddy",
          configExists: false,
          hookInstalled: false,
        }),
      ]),
    );
  });

  it("installs cursor user hooks idempotently", () => {
    const { homeDir, hookScriptsRoot } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: false,
      commandExists: () => true,
      now: () => 42,
    });

    const first = service.installHooks("cursor");
    const second = service.installHooks("cursor");

    const configPath = join(homeDir, ".cursor", "hooks.json");
    const text = readFileSync(configPath, "utf8");

    expect(first.changed).toBe(true);
    expect(first.hookInstalled).toBe(true);
    expect(second.changed).toBe(false);
    expect(JSON.parse(text)).toMatchObject({
      version: 1,
      hooks: {
        sessionStart: [
          {
            command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" sessionStart`,
          },
        ],
        stop: [
          {
            command: `"${join(hookScriptsRoot, "cursor-agent-hook.sh")}" stop`,
          },
        ],
      },
    });
  });

  it("installs codebuddy hooks without clobbering existing settings", () => {
    const { homeDir, hookScriptsRoot } = createFixtureLayout();
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
      commandExists: () => true,
      now: () => 99,
    });

    const result = service.installHooks("codebuddy");
    const parsed = JSON.parse(readFileSync(configPath, "utf8"));

    expect(result.changed).toBe(true);
    expect(parsed.theme).toBe("dark");
    expect(parsed.hooks.SessionStart).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({ command: "echo existing" }),
          ]),
        }),
        expect.objectContaining({
          hooks: expect.arrayContaining([
            expect.objectContaining({
              command: `"${join(hookScriptsRoot, "codebuddy-hook.sh")}"`,
            }),
          ]),
        }),
      ]),
    );
    expect(parsed.hooks.Notification).toHaveLength(2);
  });

  it("records the latest event status per agent", () => {
    const { homeDir, hookScriptsRoot } = createFixtureLayout();
    const service = createIntegrationService({
      homeDir,
      hookScriptsRoot,
      packaged: true,
      commandExists: () => true,
    });

    service.recordEvent("codebuddy", "waiting", 1234);

    const diagnostics = service.getDiagnostics();
    const codebuddy = diagnostics.agents.find((agent) => agent.id === "codebuddy");
    expect(codebuddy).toMatchObject({
      lastEventAt: 1234,
      lastEventStatus: "waiting",
    });
  });

  it("refuses to overwrite incompatible existing hook config structures", () => {
    const { homeDir, hookScriptsRoot } = createFixtureLayout();
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
      commandExists: () => true,
    });

    expect(() => service.installHooks("cursor")).toThrow("Cursor hooks.json 结构不兼容");
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({
      version: 1,
      hooks: [],
    });
  });
});
