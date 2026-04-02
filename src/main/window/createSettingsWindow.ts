import { BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mainDir = dirname(fileURLToPath(import.meta.url));

function preloadPath(): string {
  return join(mainDir, "../preload/index.mjs");
}

function rendererEntryUrl(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return process.env.ELECTRON_RENDERER_URL;
  }

  return pathToFileURL(join(mainDir, "../renderer/index.html")).toString();
}

export function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 560,
    height: 560,
    show: false,
    title: "CodePal 设置",
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const url = new URL(rendererEntryUrl());
  url.searchParams.set("view", "settings");
  void win.loadURL(url.toString());

  return win;
}
