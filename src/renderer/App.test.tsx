import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  it("renders sessions and the in-app settings drawer shell together", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("CodePal");
    expect(html).toContain("Sessions");
    expect(html).toContain("app-settings-drawer");
    expect(html).toContain("接入管理");
    expect(html).toContain("CodePal Hook 命令");
    expect(html).toContain("aria-label=\"打开设置\"");
  });
});
