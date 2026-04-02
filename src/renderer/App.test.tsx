import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("keeps the default window focused on sessions instead of integration settings", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("CodePal");
    expect(html).toContain("Sessions");
    expect(html).not.toContain("接入管理");
    expect(html).not.toContain("CodePal Hook 命令");
    expect(html).toContain("aria-label=\"打开设置\"");
  });

  it("renders integration management only inside the dedicated settings view", () => {
    const html = renderToStaticMarkup(<App initialView="settings" />);

    expect(html).toContain("CodePal 设置");
    expect(html).toContain("接入管理");
    expect(html).toContain("CodePal Hook 命令");
    expect(html).not.toContain("aria-label=\"打开设置\"");
    expect(html).not.toContain("Sessions");
  });
});
