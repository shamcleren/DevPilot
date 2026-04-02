# Settings Window Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the main CodePal window focused on session monitoring only, and move integration/configuration actions into a dedicated settings interface reachable from both the main-window gear button and the tray menu.

**Architecture:** Reuse the existing renderer bundle for both windows, but open a separate BrowserWindow for settings and load the same `index.html` with a `?view=settings` query. Keep the integration service and `IntegrationPanel` intact, but render them only inside a new settings page instead of the main session dashboard.

**Tech Stack:** Electron, React, TypeScript, Vitest

---

### Task 1: Add failing tests for separate settings entry points

**Files:**
- Create: `src/main/window/createSettingsWindow.test.ts`
- Modify: `src/main/tray/createTray.ts`
- Test: `src/main/tray/createTray.test.ts`
- Create: `src/renderer/App.test.tsx`

- [ ] Write a failing renderer test asserting the default app view does not render integration settings and shows a settings trigger instead.
- [ ] Write a failing tray test asserting the context menu contains both “打开 CodePal” and “设置”.
- [ ] Write a failing window test asserting the settings window loads the renderer with `?view=settings`.

### Task 2: Implement separate settings window and renderer view split

**Files:**
- Create: `src/main/window/createSettingsWindow.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/codepal.d.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] Add a dedicated settings window creator in main.
- [ ] Add IPC/preload API for opening settings from the renderer.
- [ ] Change the tray factory to accept callbacks for opening main and settings windows.
- [ ] Split renderer output into `sessions` and `settings` views based on the URL query string.
- [ ] Keep the default/main view session-only.

### Task 3: Verify the new structure

**Files:**
- Modify: `README.md` only if wording becomes misleading

- [ ] Run focused tests for the new window, tray, and renderer view behavior.
- [ ] Run `npm test`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
