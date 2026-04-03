import type { ReactNode } from "react";
import type { UsageAgentId, UsageDisplaySettings } from "../usageDisplaySettings";

type DisplayPreferencesPanelProps = {
  settings: UsageDisplaySettings;
  onToggleStrip: (nextValue: boolean) => void;
  onToggleAgent: (agent: UsageAgentId) => void;
  onDensityChange: (nextValue: UsageDisplaySettings["density"]) => void;
  children?: ReactNode;
};

const AGENTS: Array<{ id: UsageAgentId; label: string }> = [
  { id: "codex", label: "Codex" },
  { id: "cursor", label: "Cursor" },
  { id: "codebuddy", label: "CodeBuddy" },
];

export function DisplayPreferencesPanel({
  settings,
  onToggleStrip,
  onToggleAgent,
  onDensityChange,
  children,
}: DisplayPreferencesPanelProps) {
  return (
    <section className="display-panel" aria-label="显示与用量">
      <div className="display-panel__header">
        <div className="display-panel__title">显示与用量</div>
        <div className="display-panel__subtitle">控制顶部状态栏里的用量信息密度和可见范围。</div>
      </div>

      <label className="display-panel__toggle">
        <input
          type="checkbox"
          checked={settings.showInStatusBar}
          onChange={(event) => onToggleStrip(event.target.checked)}
        />
        <span>在顶部状态栏显示额度</span>
      </label>

      <div className="display-panel__agents">
        {AGENTS.map((agent) => (
          <label key={agent.id} className="display-panel__toggle">
            <input
              type="checkbox"
              checked={!settings.hiddenAgents.includes(agent.id)}
              onChange={() => onToggleAgent(agent.id)}
            />
            <span>{agent.label}</span>
          </label>
        ))}
      </div>
      <div className="display-panel__header">
        <div className="display-panel__title">用量显示密度</div>
        <div className="display-panel__subtitle">
          简洁模式只显示核心数值；详细模式会在顶部直接显示 reset 时间。
        </div>
      </div>
      <div className="display-panel__agents">
        <label className="display-panel__toggle">
          <input
            type="radio"
            name="usage-density"
            checked={settings.density === "compact"}
            onChange={() => onDensityChange("compact")}
          />
          <span>简洁</span>
        </label>
        <label className="display-panel__toggle">
          <input
            type="radio"
            name="usage-density"
            checked={settings.density === "detailed"}
            onChange={() => onDensityChange("detailed")}
          />
          <span>详细</span>
        </label>
      </div>
      {children ? <div className="display-panel__subsection">{children}</div> : null}
    </section>
  );
}
