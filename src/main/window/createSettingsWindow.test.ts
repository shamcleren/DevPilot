import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const loadURL = vi.fn();
  const on = vi.fn();
  const once = vi.fn();
  const browserWindow = vi.fn(() => ({
    loadURL,
    on,
    once,
  }));

  return {
    loadURL,
    on,
    once,
    browserWindow,
  };
});

vi.mock("electron", () => ({
  BrowserWindow: mocks.browserWindow,
}));

import { createSettingsWindow } from "./createSettingsWindow";

describe("createSettingsWindow", () => {
  beforeEach(() => {
    mocks.browserWindow.mockClear();
    mocks.loadURL.mockClear();
  });

  it("loads the renderer in settings view mode", () => {
    const previousUrl = process.env.ELECTRON_RENDERER_URL;
    process.env.ELECTRON_RENDERER_URL = "http://127.0.0.1:5173/";

    createSettingsWindow();

    expect(mocks.browserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "CodePal 设置",
      }),
    );
    expect(mocks.loadURL).toHaveBeenCalledWith("http://127.0.0.1:5173/?view=settings");

    if (previousUrl === undefined) {
      delete process.env.ELECTRON_RENDERER_URL;
    } else {
      process.env.ELECTRON_RENDERER_URL = previousUrl;
    }
  });
});
