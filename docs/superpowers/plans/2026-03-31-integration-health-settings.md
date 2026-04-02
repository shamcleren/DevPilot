# Integration Health Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CodePal's integration area reflect real agent health by fixing the packaged Cursor hook permission issue, replacing coarse install flags with actionable health states, and restructuring the settings panel around human-manageable integration groups.

**Architecture:** Keep the current main-process integration service as the single source of truth, but extend it from "config installed" checks to richer health evaluation that includes script executability and runtime prerequisites. Keep the renderer changes incremental: reuse the existing panel entry point in `App.tsx`, but render grouped integration sections with clearer states and human-oriented copy instead of raw diagnostics.

**Tech Stack:** Electron, React, TypeScript, Vitest, electron-builder

---

### Task 1: Expand integration diagnostics into real health states

**Files:**
- Modify: `src/shared/integrationTypes.ts`
- Modify: `src/main/integrations/integrationService.ts`
- Test: `src/main/integrations/integrationService.test.ts`

- [ ] **Step 1: Write the failing diagnostics test**

```ts
it("marks cursor as repair-needed when the hook script is configured but not executable", () => {
  const { homeDir, hookScriptsRoot } = createFixtureLayout();
  chmodSync(join(hookScriptsRoot, "cursor-agent-hook.sh"), 0o644);

  const service = createIntegrationService({
    homeDir,
    hookScriptsRoot,
    packaged: true,
    commandExists: () => true,
  });

  service.installHooks("cursor");

  const cursor = service.getDiagnostics().agents.find((agent) => agent.id === "cursor");
  expect(cursor).toMatchObject({
    health: "repair_needed",
    actionLabel: "修复",
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/main/integrations/integrationService.test.ts`
Expected: FAIL because `health` / `actionLabel` do not exist and executability is not checked.

- [ ] **Step 3: Implement minimal health-state support**

```ts
export type IntegrationHealth = "active" | "repair_needed" | "not_configured";

export interface IntegrationAgentDiagnostics {
  id: IntegrationAgentId;
  label: string;
  health: IntegrationHealth;
  healthLabel: string;
  actionLabel: string;
  statusMessage: string;
  hookInstalled: boolean;
  hookScriptExecutable: boolean;
  missingRequirements?: string[];
}
```

```ts
function isExecutable(pathname: string): boolean {
  try {
    fs.accessSync(pathname, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function deriveHealth(input: {
  configured: boolean;
  scriptReady: boolean;
  runtimeReady: boolean;
}) {
  if (!input.configured) return "not_configured";
  if (!input.scriptReady || !input.runtimeReady) return "repair_needed";
  return "active";
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/main/integrations/integrationService.test.ts`
Expected: PASS with the new `repair_needed` case and existing install tests still green.

### Task 2: Restructure the renderer integration area around human-manageable groups

**Files:**
- Modify: `src/renderer/components/IntegrationPanel.tsx`
- Modify: `src/renderer/components/IntegrationPanel.test.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`

- [ ] **Step 1: Write the failing panel rendering test**

```tsx
expect(html).toContain("CLI Hooks");
expect(html).toContain("IDE 扩展");
expect(html).toContain("已激活");
expect(html).toContain("需修复");
expect(html).toContain(">修复<");
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/renderer/components/IntegrationPanel.test.tsx`
Expected: FAIL because the current panel still renders `Integrations`, `Installed`, and `Repair`.

- [ ] **Step 3: Implement grouped settings UI with human-first copy**

```tsx
<section className="integration-section" aria-label="CLI Hooks">
  <header className="integration-section__header">
    <h3>CLI Hooks</h3>
    <p>负责把 Cursor / CodeBuddy 的运行态事件接入 CodePal。</p>
  </header>
  {cliAgents.map(renderAgentCard)}
</section>

<section className="integration-section" aria-label="IDE 扩展">
  <header className="integration-section__header">
    <h3>IDE 扩展</h3>
    <p>预留给后续深度跳转与编辑器内联能力，本轮先展示规划状态。</p>
  </header>
</section>
```

```tsx
<span className={`hook-badge hook-badge--${agent.health}`}>{agent.healthLabel}</span>
<button type="button" onClick={() => onInstall(agent.id)}>
  {isInstalling ? "处理中..." : agent.actionLabel}
</button>
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `npm test -- src/renderer/components/IntegrationPanel.test.tsx`
Expected: PASS with grouped sections and localized health/action labels.

### Task 3: Preserve hook script executability in the macOS package

**Files:**
- Modify: `electron-builder.yml`
- Test: `src/main/integrations/integrationService.test.ts`
- Test: `src/renderer/components/IntegrationPanel.test.tsx`

- [ ] **Step 1: Add a regression test that covers packaged script readiness**

```ts
expect(cursor?.hookScriptExecutable).toBe(false);
expect(cursor?.statusMessage).toContain("可执行权限");
```

- [ ] **Step 2: Run the focused test to verify the current package assumptions are insufficient**

Run: `npm test -- src/main/integrations/integrationService.test.ts`
Expected: FAIL because diagnostics do not expose script executability.

- [ ] **Step 3: Update packaging config to keep hook scripts executable**

```yaml
extraResources:
  - from: scripts
    to: scripts
    filter:
      - bridge/**/*
      - hooks/**/*
    filePermissions:
      - path: hooks/*.sh
        mode: 493
```

- [ ] **Step 4: Run repo verification**

Run: `npm test`
Expected: PASS

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS
