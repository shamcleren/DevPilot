import { test, expect } from "@playwright/test";
import { stringifyActionResponsePayload } from "../../src/shared/actionResponsePayload";
import { startActionResponseCollector } from "./helpers/actionResponseServer";
import { launchDevPilot } from "./helpers/launchDevPilot";
import { sendStatusChange } from "./helpers/sendStatusChange";

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
