import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import path from "node:path";
import { stringifyActionResponsePayload } from "../../src/shared/actionResponsePayload";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchCodePal } from "./helpers/launchCodePal";
import { startBlockingHookCliProcess } from "./helpers/startHookCliProcess";
import { sendStatusChange } from "./helpers/sendStatusChange";

const repoRoot = process.cwd();

const SESSION_ID = "e2e-golden-session";
const ACTION_ID = "e2e-golden-action";
const PENDING_TITLE = "E2E single choice prompt";
const OPTION_APPROVE = "Approve";

test("cursor phase1: installs cursor hooks and surfaces degraded unsupported actions", async () => {
  const collector = await startActionResponseCollector();
  const homeDir = await fs.mkdtemp(path.join("/tmp", "codepal-home-"));
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
    homeDir,
  });

  const phase1Session = "cursor-phase1-session";
  const phase1Action = "cursor-phase1-action";
  const phase1Title = "Cursor phase1 approval";

  try {
    const mainPage = await codepal.app.firstWindow();
    await mainPage.waitForLoadState("domcontentloaded");
    await mainPage.waitForLoadState("load");
    await expect(mainPage.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const installResult = await mainPage.evaluate(async () => {
      return window.codepal.installIntegrationHooks("cursor");
    });
    expect(installResult.message).toContain("已写入 Cursor 配置");

    const configPath = path.join(homeDir, ".cursor", "hooks.json");
    const installed = JSON.parse(await fs.readFile(configPath, "utf8")) as {
      hooks: { sessionStart: Array<{ command: string }>; stop: Array<{ command: string }> };
    };
    expect(installed.hooks.sessionStart[0]?.command).toContain("--codepal-hook cursor");
    expect(installed.hooks.stop[0]?.command).toContain("--codepal-hook cursor");

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: phase1Session,
        tool: "cursor",
        status: "waiting",
        task: "cursor phase1 ready",
        timestamp: Date.now(),
        pendingAction: {
          id: phase1Action,
          type: "single_choice",
          title: phase1Title,
          options: [OPTION_APPROVE, "Reject"],
        },
      },
      codepal.ipcSocketPath,
    );

    const pending = mainPage.getByLabel(phase1Title);
    await expect(pending).toBeVisible({ timeout: 15_000 });
    await pending.getByRole("button", { name: OPTION_APPROVE }).click();
    await expect(collector.waitForLine()).resolves.toBe(
      stringifyActionResponsePayload(phase1Session, phase1Action, OPTION_APPROVE),
    );
    await expect(pending).toBeHidden();

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: phase1Session,
        tool: "cursor",
        status: "waiting",
        task: "Unsupported Cursor action: text_input",
        timestamp: Date.now(),
        meta: {
          hook_event_name: "Notification",
          unsupported_action_type: "text_input",
        },
        pendingAction: null,
      },
      codepal.ipcSocketPath,
    );

    await expect(
      mainPage
        .getByLabel("Cursor WAITING")
        .getByText("Unsupported Cursor action: text_input"),
    ).toBeVisible({ timeout: 15_000 });
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
    await fs.rm(homeDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

test("round-trips a single_choice pending action", async () => {
  const collector = await startActionResponseCollector();

  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: SESSION_ID,
        tool: "cursor",
        status: "waiting",
        task: "e2e golden path",
        timestamp: Date.now(),
        pendingAction: {
          id: ACTION_ID,
          type: "single_choice",
          title: PENDING_TITLE,
          options: [OPTION_APPROVE, "Reject"],
        },
      },
      codepal.ipcSocketPath,
    );

    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    const pending = page.getByLabel(PENDING_TITLE);
    await expect(pending).toBeVisible();
    await expect(pending.getByText(PENDING_TITLE)).toBeVisible();

    await page.getByRole("button", { name: OPTION_APPROVE }).click();

    const expectedLine = stringifyActionResponsePayload(
      SESSION_ID,
      ACTION_ID,
      OPTION_APPROVE,
    );
    await expect(collector.waitForLine()).resolves.toBe(expectedLine);

    await expect(pending).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const CONCURRENT_SESSION = "e2e-concurrent-session";
const ACTION_A = "e2e-concurrent-action-a";
const ACTION_B = "e2e-concurrent-action-b";
const TITLE_A = "E2E concurrent card A";
const TITLE_B = "E2E concurrent card B";

test("same session: two blocking hooks with different actionIds route action_response correctly", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  const basePayload = {
    type: "status_change" as const,
    sessionId: CONCURRENT_SESSION,
    tool: "cursor",
    status: "waiting" as const,
    task: "e2e concurrent pending",
    timestamp: Date.now(),
  };

  const hookA = startBlockingHookCliProcess({
    repoRoot,
    ipcSocketPath: codepal.ipcSocketPath,
    payload: {
      ...basePayload,
      pendingAction: {
        id: ACTION_A,
        type: "single_choice",
        title: TITLE_A,
        options: ["Alpha", "Reject"],
      },
    },
  });

  const hookB = startBlockingHookCliProcess({
    repoRoot,
    ipcSocketPath: codepal.ipcSocketPath,
    payload: {
      ...basePayload,
      pendingAction: {
        id: ACTION_B,
        type: "single_choice",
        title: TITLE_B,
        options: ["Bravo", "Reject"],
      },
    },
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await expect(page.getByLabel(TITLE_A)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel(TITLE_B)).toBeVisible();

    const lineA = hookA.waitForFirstStdoutLine();
    const lineB = hookB.waitForFirstStdoutLine();

    const expectedB = stringifyActionResponsePayload(CONCURRENT_SESSION, ACTION_B, "Bravo");
    const expectedA = stringifyActionResponsePayload(CONCURRENT_SESSION, ACTION_A, "Alpha");

    await page.getByLabel(TITLE_B).getByRole("button", { name: "Bravo" }).click();
    await expect(lineB).resolves.toBe(expectedB);
    expect(JSON.parse(await lineB).actionId).toBe(ACTION_B);

    await page.getByLabel(TITLE_A).getByRole("button", { name: "Alpha" }).click();
    await expect(lineA).resolves.toBe(expectedA);
    expect(JSON.parse(await lineA).actionId).toBe(ACTION_A);

    await expect(hookB.waitForExitCode()).resolves.toBe(0);
    await expect(hookA.waitForExitCode()).resolves.toBe(0);

    await expect(page.getByLabel(TITLE_A)).toBeHidden();
    await expect(page.getByLabel(TITLE_B)).toBeHidden();
  } finally {
    hookA.kill();
    hookB.kill();
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const REMOTE_CLOSE_SESSION = "e2e-pending-closed-session";
const REMOTE_ACTION_X = "e2e-remote-close-x";
const REMOTE_ACTION_Y = "e2e-remote-close-y";
const TITLE_REMOTE_X = "E2E remote close card X";
const TITLE_REMOTE_Y = "E2E remote close card Y";

test("same session: pendingClosed removes only the matching pending card", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  const base = {
    type: "status_change" as const,
    sessionId: REMOTE_CLOSE_SESSION,
    tool: "cursor" as const,
    status: "waiting" as const,
    task: "e2e pendingClosed",
    timestamp: Date.now(),
  };

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingAction: {
          id: REMOTE_ACTION_X,
          type: "single_choice",
          title: TITLE_REMOTE_X,
          options: ["X1", "Reject"],
        },
      },
      codepal.ipcSocketPath,
    );

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingAction: {
          id: REMOTE_ACTION_Y,
          type: "single_choice",
          title: TITLE_REMOTE_Y,
          options: ["Y1", "Reject"],
        },
      },
      codepal.ipcSocketPath,
    );

    const cardX = page.getByLabel(TITLE_REMOTE_X);
    const cardY = page.getByLabel(TITLE_REMOTE_Y);
    await expect(cardX).toBeVisible({ timeout: 15_000 });
    await expect(cardY).toBeVisible();

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingClosed: { actionId: REMOTE_ACTION_X, reason: "consumed_remote" },
      },
      codepal.ipcSocketPath,
    );

    await expect(cardX).toBeHidden();
    await expect(cardY).toBeVisible();

    await sendStatusChange(
      {
        ...base,
        timestamp: Date.now(),
        pendingClosed: { actionId: REMOTE_ACTION_Y, reason: "consumed_remote" },
      },
      codepal.ipcSocketPath,
    );

    await expect(cardY).toBeHidden();
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const EXPIRY_SESSION = "e2e-expiry-session";
const EXPIRY_ACTION = "e2e-expiry-action";
const EXPIRY_TITLE = "E2E short timeout pending";

test("pending card disappears when lifecycle expires without pendingClosed", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: EXPIRY_SESSION,
        tool: "cursor",
        status: "waiting",
        task: "e2e expiry",
        timestamp: Date.now(),
        pendingAction: {
          id: EXPIRY_ACTION,
          type: "single_choice",
          title: EXPIRY_TITLE,
          options: ["Soon", "Never"],
        },
        responseTarget: {
          mode: "socket",
          socketPath: collector.socketPath,
          timeoutMs: 750,
        },
      },
      codepal.ipcSocketPath,
    );

    const pending = page.getByLabel(EXPIRY_TITLE);
    await expect(pending).toBeVisible({ timeout: 15_000 });
    await Promise.all([
      expect(pending).toBeHidden({ timeout: 12_000 }),
      collector.expectNoFurtherConnections(12_000),
    ]);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});

const FIRST_WIN_SESSION = "e2e-first-win-session";
const FIRST_WIN_ACTION = "e2e-first-win-action";
const FIRST_WIN_TITLE = "E2E first-win prompt";

test("after a successful response the card hides and a second action_response is a no-op", async () => {
  const collector = await startActionResponseCollector();
  const codepal = await launchCodePal({
    actionResponseSocketPath: collector.socketPath,
  });

  try {
    const page = await codepal.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "CodePal" })).toBeVisible({
      timeout: 15_000,
    });

    await sendStatusChange(
      {
        type: "status_change",
        sessionId: FIRST_WIN_SESSION,
        tool: "cursor",
        status: "waiting",
        task: "e2e first win",
        timestamp: Date.now(),
        pendingAction: {
          id: FIRST_WIN_ACTION,
          type: "single_choice",
          title: FIRST_WIN_TITLE,
          options: ["Once", "Twice"],
        },
      },
      codepal.ipcSocketPath,
    );

    const pending = page.getByLabel(FIRST_WIN_TITLE);
    await expect(pending).toBeVisible({ timeout: 15_000 });

    const linePromise = collector.waitForLine();
    await page.getByRole("button", { name: "Once" }).click();

    const expectedLine = stringifyActionResponsePayload(
      FIRST_WIN_SESSION,
      FIRST_WIN_ACTION,
      "Once",
    );
    await expect(linePromise).resolves.toBe(expectedLine);
    await expect(pending).toBeHidden();

    await page.evaluate(
      ([sessionId, actionId]) => {
        window.codepal.respondToPendingAction(sessionId, actionId, "Once");
      },
      [FIRST_WIN_SESSION, FIRST_WIN_ACTION] as const,
    );

    await collector.expectNoFurtherConnections(3_000);
  } finally {
    await codepal.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
