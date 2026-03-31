import { BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const mainDir = dirname(fileURLToPath(import.meta.url));

function preloadPath(): string {
  return join(mainDir, "../preload/index.mjs");
}

export function createFloatingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 320,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(mainDir, "../renderer/index.html"));
  }

  return win;
}
