import { mkdtempSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import afterPack, { resolveResourcesDir } from "../../../scripts/build/after-pack.mjs";

describe("after-pack hook", () => {
  it("targets the packaged .app resources directory on macOS", async () => {
    const appOutDir = mkdtempSync(join(tmpdir(), "codepal-after-pack-"));
    const resourcesDir = resolveResourcesDir(appOutDir, "darwin", "CodePal");
    const hooksDir = join(resourcesDir, "scripts", "hooks");
    mkdirSync(hooksDir, { recursive: true });

    const cursorHookPath = join(hooksDir, "cursor-agent-hook.sh");
    const codeBuddyHookPath = join(hooksDir, "codebuddy-hook.sh");
    writeFileSync(cursorHookPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o644 });
    writeFileSync(codeBuddyHookPath, "#!/usr/bin/env bash\nexit 0\n", { mode: 0o644 });

    await afterPack({
      appOutDir,
      electronPlatformName: "darwin",
      packager: {
        appInfo: {
          productFilename: "CodePal",
        },
      },
    });

    expect(statSync(cursorHookPath).mode & 0o777).toBe(0o755);
    expect(statSync(codeBuddyHookPath).mode & 0o777).toBe(0o755);
  });
});
