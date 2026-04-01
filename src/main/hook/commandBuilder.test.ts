import { describe, expect, it } from "vitest";
import {
  buildCodeBuddyHookCommand,
  buildCursorLifecycleHookCommand,
  detectLegacyHookCommand,
} from "./commandBuilder";

describe("commandBuilder", () => {
  describe("buildCursorLifecycleHookCommand", () => {
    it("builds dev-mode command with execPath, appPath, and event name", () => {
      const command = buildCursorLifecycleHookCommand("sessionStart", {
        packaged: false,
        execPath: "/path/to/Electron",
        appPath: "/path/to/repo",
      });
      expect(command).toBe(
        '"/path/to/Electron" "/path/to/repo" --codepal-hook cursor-lifecycle sessionStart',
      );
    });

    it("builds packaged command with execPath only", () => {
      const command = buildCursorLifecycleHookCommand("stop", {
        packaged: true,
        execPath: "/Applications/CodePal.app/Contents/MacOS/CodePal",
        appPath: "/ignored",
      });
      expect(command).toBe(
        '"/Applications/CodePal.app/Contents/MacOS/CodePal" --codepal-hook cursor-lifecycle stop',
      );
    });
  });

  describe("buildCodeBuddyHookCommand", () => {
    it("builds dev-mode codebuddy hook command", () => {
      const command = buildCodeBuddyHookCommand({
        packaged: false,
        execPath: "/path/to/Electron",
        appPath: "/path/to/repo",
      });
      expect(command).toBe('"/path/to/Electron" "/path/to/repo" --codepal-hook codebuddy');
    });

    it("builds packaged codebuddy hook command", () => {
      const command = buildCodeBuddyHookCommand({
        packaged: true,
        execPath: "/Applications/CodePal.app/Contents/MacOS/CodePal",
        appPath: "/ignored",
      });
      expect(command).toBe('"/Applications/CodePal.app/Contents/MacOS/CodePal" --codepal-hook codebuddy');
    });
  });

  describe("detectLegacyHookCommand", () => {
    it("detects scripts/hooks shell paths", () => {
      expect(detectLegacyHookCommand('"/my/app/scripts/hooks/cursor-agent-hook.sh" sessionStart')).toBe(
        true,
      );
      expect(detectLegacyHookCommand('"/x/scripts/hooks/codebuddy-hook.sh"')).toBe(true);
    });

    it("detects node scripts/bridge mjs invocations", () => {
      expect(detectLegacyHookCommand("node ./scripts/bridge/foo.mjs")).toBe(true);
      expect(detectLegacyHookCommand('node "/abs/path/scripts/bridge/hook.mjs" arg')).toBe(true);
    });

    it("returns false for self-contained codepal-hook commands", () => {
      expect(detectLegacyHookCommand('"/Electron" "/repo" --codepal-hook cursor-lifecycle sessionStart')).toBe(
        false,
      );
      expect(detectLegacyHookCommand('"/CodePal" --codepal-hook codebuddy')).toBe(false);
    });
  });
});
