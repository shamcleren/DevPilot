import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const stylesPath = path.resolve(process.cwd(), "src/renderer/styles.css");

describe("renderer layout styles", () => {
  it("keeps the session list scrollable inside the floating window", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(css).toMatch(/\.app\s*\{[\s\S]*height:\s*100vh;/);
    expect(css).toMatch(/\.app\s*\{[\s\S]*overflow:\s*hidden;/);
    expect(css).toMatch(/\.session-list\s*\{[\s\S]*min-height:\s*0;/);
    expect(css).toMatch(/\.session-list\s*\{[\s\S]*overflow-y:\s*auto;/);
  });

  it("keeps the compact status row and contained session details layout", () => {
    const css = fs.readFileSync(stylesPath, "utf8");

    expect(css).toMatch(/\.status-bar\s*\{[\s\S]*align-items:\s*center;/);
    expect(css).toMatch(/\.status-bar\s*\{[\s\S]*padding:\s*10px 12px;/);
    expect(css).toMatch(/\.session-row__details\s*\{[\s\S]*max-height:\s*220px;/);
    expect(css).toMatch(/\.session-row__details\s*\{[\s\S]*overflow:\s*auto;/);
  });
});
