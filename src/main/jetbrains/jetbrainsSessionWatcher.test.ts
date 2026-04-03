import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJetBrainsSessionWatcher } from "./jetbrainsSessionWatcher";

describe("createJetBrainsSessionWatcher", () => {
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("does not surface empty running workspace lifecycle events as dashboard sessions", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const logsDir = path.join(tmpDir, "gongfeng-chat-agent", "log");
    fs.mkdirSync(logsDir, { recursive: true });
    const filePath = path.join(logsDir, "chat-agent.log");

    fs.writeFileSync(
      filePath,
      [
        "2025-05-19 15:24:28.938\tDEBUG\tws/wswrap.go:360\treceive msg:Content-Length: 433",
        "Content-Type: application/json-rpc; charset=utf-8",
        "",
        '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"repo":["git@github.com:shamcleren/bkmonitor-datalink.git"],"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"language":"","machine_id":"2da16474866e586e19a637335e77a3140acc9e195298711f170478b676019fcd","session_id":"0196e76d-ff55-7aa3-a7da-78c8960af34c","editor_name":"JetBrainsGoLand","app_version":"v1.45.4"},"id":"1"}',
        '2025-05-19 15:24:28.949\tDEBUG\tws/wswrap.go:485\twrite message:Content-Length: 449',
        '{"id":"1","result":{"code":0,"msg":"success","uuid":"b8712854-0047-e18a-68f1-cf1479345ff0","tools":["list_dir"],"version":"v0.0.24","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
        "2025-05-19 15:24:29.116\tINFO\tws/connect.go:96\tuuid from proxy: b8712854-0047-e18a-68f1-cf1479345ff0",
        "",
      ].join("\n"),
    );

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("maps connection errors onto the workspace session without surfacing empty running states", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const logsDir = path.join(tmpDir, "gongfeng-chat-agent", "log");
    fs.mkdirSync(logsDir, { recursive: true });
    const filePath = path.join(logsDir, "chat-agent.log");

    fs.writeFileSync(filePath, "");

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.appendFileSync(
      filePath,
      [
        '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"repo":[""],"workspace":["file:///Users/renjinming/go/src/git.woa.com/blueking/helm-charts"],"session_id":"0196e76d-ff55-7aa3-a7da-78c8960af34c","editor_name":"JetBrainsGoLand","app_version":"v1.45.4"},"id":"3"}',
        '{"id":"3","result":{"code":0,"msg":"success","uuid":"d3e30a21-11f5-2218-996d-8744f5bf7c7c","workspace_uri":"file:///Users/renjinming/go/src/git.woa.com/blueking/helm-charts"},"jsonrpc":"2.0"}',
        "2025-05-19 15:24:38.263\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:24:47.241\tDEBUG\tws/wswrap.go:427\tclose connection to proxy:d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:25:43.286\tERROR\tws/connect.go:105\tlisten local failed: read tcp 192.168.255.10:63439->21.34.11.236:80: i/o timeout, d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:25:44.000\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "",
      ].join("\n"),
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "d3e30a21-11f5-2218-996d-8744f5bf7c7c",
      tool: "goland",
      status: "error",
      activityItems: [
        expect.objectContaining({
          title: "Connection error",
          tone: "error",
          body: "listen local failed: read tcp 192.168.255.10:63439->21.34.11.236:80: i/o timeout",
        }),
      ],
    });
    fs.appendFileSync(
      filePath,
      "2025-05-19 15:25:45.000\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c\n",
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("reduces initial bootstrap to the latest meaningful error state per workspace session", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const logsDir = path.join(tmpDir, "gongfeng-chat-agent", "log");
    fs.mkdirSync(logsDir, { recursive: true });
    const filePath = path.join(logsDir, "chat-agent.log");

    fs.writeFileSync(
      filePath,
      [
        '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/shamcleren/demo"],"session_id":"019","editor_name":"jetbrainsgoland"},"id":"1"}',
        '{"id":"1","result":{"code":0,"msg":"success","uuid":"11111111-1111-1111-1111-111111111111","workspace_uri":"file:///Users/renjinming/go/src/github.com/shamcleren/demo"},"jsonrpc":"2.0"}',
        "2026-04-03 21:00:00.000\tINFO\tws/connect.go:96\tuuid from proxy: 11111111-1111-1111-1111-111111111111",
        "2026-04-03 21:00:02.000\tERROR\tws/connect.go:105\tlisten local failed: io: read/write on closed pipe, 11111111-1111-1111-1111-111111111111",
        "",
      ].join("\n"),
    );

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "11111111-1111-1111-1111-111111111111",
      tool: "goland",
      status: "error",
      title: "demo",
    });
  });
});
