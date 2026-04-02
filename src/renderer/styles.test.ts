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
    expect(css).toMatch(/\.session-row__summary-text\s*\{[\s\S]*white-space:\s*nowrap;/);
    expect(css).toMatch(/\.session-row__pending\s*\{/);
    expect(css).toMatch(/\.session-row__details\s*\{[\s\S]*max-height:\s*280px;/);
    expect(css).toMatch(/\.session-row__details\s*\{[\s\S]*overflow:\s*auto;/);
    expect(css).toMatch(/\.session-stream__item--message\s*\{/);
    expect(css).toMatch(/\.session-stream__item--message\s*\{[\s\S]*width:\s*min\(100%,\s*82%\);/);
    expect(css).toMatch(/\.session-stream__item--message-user\s*\{[\s\S]*margin-left:\s*auto;/);
    expect(css).toMatch(/\.session-stream__item--message-agent[\s\S]*margin-right:\s*auto;/);
    expect(css).toMatch(/\.session-stream__item--artifact\s*\{/);
    expect(css).toMatch(/\.session-stream__item--artifact\s*\{[\s\S]*border-radius:\s*14px;/);
    expect(css).toMatch(/\.session-stream__artifact-type\s*\{[\s\S]*font-size:\s*8px;/);
    expect(css).toMatch(/\.session-stream__artifact-body\s*\{[\s\S]*-webkit-line-clamp:\s*3;/);
    expect(css).toMatch(/\.session-stream__item--note\s*\{/);
    expect(css).toMatch(/\.session-stream__section--primary\s*\{/);
    expect(css).toMatch(/\.session-stream__item--artifact-active::after\s*\{/);
    expect(css).toMatch(/@keyframes session-artifact-scan/);
    expect(css).toMatch(/\.pending-action\s*\{[\s\S]*border-radius:\s*14px;/);
    expect(css).toMatch(/\.pending-action__eyebrow\s*\{/);
    expect(css).toMatch(/\.pending-action__btn\s*\{/);
    expect(css).toMatch(/\.session-stream__code\s*\{/);
    expect(css).toMatch(/\.session-stream__file-link\s*\{/);
    expect(css).toMatch(/\.session-row__loading\s*\{/);
    expect(css).toMatch(/\.session-row__loading-bubble\s*\{/);
    expect(css).toMatch(/\.session-row__loading-dots\s*\{/);
    expect(css).toMatch(/\.session-stream__typing-indicator\s*\{/);
    expect(css).toMatch(/\.session-stream__typing-dots\s*\{/);
    expect(css).toMatch(/@keyframes session-loading-dots/);
  });
});
