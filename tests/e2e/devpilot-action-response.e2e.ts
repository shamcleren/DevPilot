import { test, expect } from "@playwright/test";
import { stringifyActionResponsePayload } from "../../src/shared/actionResponsePayload";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchDevPilot } from "./helpers/launchDevPilot";
import { startBlockingCursorHook } from "./helpers/runHookProcess";
import { sendStatusChange } from "./helpers/sendStatusChange";

const repoRoot = process.cwd();

const SESSION_ID = "e2e-golden-session";
const ACTION_ID = "e2e-golden-action";
const PENDING_TITLE = "E2E single choice prompt";
const OPTION_APPROVE = "Approve";

test("round-trips a single_choice pending action", async () => {
  const collector = await startActionResponseCollector();

  const devpilot = await launchDevPilot({
    actionResponseSocketPath: collector.socketPath,
  });

  try {
    const page = await devpilot.app.firstWindow();
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
      devpilot.ipcSocketPath,
    );

    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "DevPilot" })).toBeVisible({
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
    await devpilot.close().catch(() => undefined);
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
  const devpilot = await launchDevPilot({
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

  const hookA = startBlockingCursorHook({
    repoRoot,
    ipcSocketPath: devpilot.ipcSocketPath,
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

  const hookB = startBlockingCursorHook({
    repoRoot,
    ipcSocketPath: devpilot.ipcSocketPath,
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
    const page = await devpilot.app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForLoadState("load");
    await expect(page.getByRole("heading", { name: "DevPilot" })).toBeVisible({
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
    await devpilot.close().catch(() => undefined);
    await collector.close().catch(() => undefined);
  }
});
