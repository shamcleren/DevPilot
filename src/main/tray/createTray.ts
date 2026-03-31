import { Menu, Tray, nativeImage } from "electron";

/** 1×1 透明 PNG，避免部分平台对空 Tray 图标的限制 */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

export function createTray(): Tray {
  const tray = new Tray(nativeImage.createFromBuffer(TINY_PNG));
  tray.setToolTip("DevPilot");
  tray.setContextMenu(
    Menu.buildFromTemplate([{ label: "Quit DevPilot", role: "quit" }]),
  );
  return tray;
}
