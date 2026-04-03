# Dashboard V1 Product Reset Design

## Goal

把 `CodePal` 的第一版明确收敛为一个可直接落地给用户使用的统一 dashboard，而不是继续把监控、回写、审批和控制能力混在同一个主路径里。

V1 的核心目标只有一个：

- 在一个浮动窗口里稳定查看多种 IDE / agent 的会话、状态、最近活动和配额摘要

V1 不再把“回写和管控闭环”作为主交付目标。现有能力可以保留在代码里，但不再占据主界面和产品叙事。

## Product Boundary

### In Scope

- 统一会话列表
- 会话状态总览
- 最近活动摘要
- 顶部额度 / 用量摘要
- 接入诊断与数据源连接
- 多 agent 只读接入
- session 自动过期与历史衰减

### Out of Scope

- 主界面审批与选项响应
- 回写式 action loop 作为 V1 主卖点
- 通用 control plane
- 自由文本输入
- 深度 IDE 导航与 pane control

### Existing Control Features

现有 `pending action / approval / single_choice / multi_choice` 相关能力不删：

- 保留协议、存储和测试
- 从主界面主路径移走
- 在设置页中归入 `实验功能` 或 `调试能力`
- 默认不干扰 dashboard-only 用户

## User Experience Principles

### Primary Value

用户打开 `CodePal` 后，应该在 2 到 3 秒内理解这就是一个“统一监控面板”：

- 谁在跑
- 谁卡住了
- 最近哪条任务有新输入
- 哪个 agent 快没额度了

### Visual Tone

主界面要像一个轻量、稳定、直接的桌面监控工具，而不是实验台或开发者控制台。

因此 V1 做以下收口：

- 去掉左上角 `Control Deck`
- 顶部保留 `CodePal` 品牌识别即可
- V1 默认采用更直接的单标题方案：仅显示更醒目的 `CodePal`
- 状态栏只保留高频信息，不承载解释性文案

## Information Architecture

### Main Surface

主界面仅保留三层信息：

1. 头部品牌区
2. 顶部状态与用量摘要
3. 会话列表

不再在主界面塞入设置型信息、接入修复型信息或控制型卡片。

### Settings Surface

设置页重组为三块：

1. `接入与诊断`
   - 当前监听方式
   - 各 agent 接入状态
   - 一键安装 / 修复
   - 最近事件时间

2. `显示与用量`
   - 顶部状态栏显示控制
   - 各 agent 用量来源与同步状态
   - Cursor dashboard 登录 / 刷新 / 过期处理

3. `实验功能`
   - pending action / approval 相关调试入口
   - 后续其他非 V1 主路径能力

## Session Lifecycle

### Problem

如果 session 不自动过期，列表会持续累积，主界面会越来越像日志堆而不是 dashboard。

### V1 Rule

session 必须有明确生命周期：

- `running` / `waiting` session 永远置顶，不自动过期
- `error` session 保留较长时间，但进入弱化态
- `completed` / `idle` session 在无新活动一段时间后自动衰减
- 过期 session 从主列表移除，不再长期占据主界面

### Proposed Expiry Windows

- `running`: 不过期
- `waiting`: 不过期，但需要明显状态标记
- `error`: 24 小时后从主列表移除
- `completed` / `idle`: 6 小时后从主列表移除

这个窗口是产品默认值，不需要在 V1 暴露成用户配置。

### Renderer Behavior

在接近过期前，历史 session 先弱化：

- 降低视觉权重
- 减少次级元信息
- 避免与活跃 session 抢主注意力

## Sorting Rules

### Problem

当前排序让用户感知不稳定，而且不能稳定表达“最近是谁在继续工作”。

### V1 Rule

排序必须优先反映用户最近在哪个任务上继续输入。

主排序键：

1. `lastUserMessageAt` 倒序
2. `updatedAt` 倒序
3. 稳定兜底键，例如 `createdAt` / `id`

补充规则：

- `running` 与 `waiting` 仍优先保留在可见区，但不应打破同类任务内部的时间倒序
- 低信息量系统事件不应频繁抖动列表顺序
- 纯工具执行回声不应压过真实的用户输入推进

## Smoothness Requirements

V1 不追求复杂动画，但要解决当前“不够丝滑”的几个主要来源：

- 列表顺序抖动
- 状态频繁闪变
- 设置页内容层级不清
- 顶部信息过密
- 初次打开后用户看不懂重点

### Practical Requirements

- 列表重排要克制，只有在主排序键变化时才明显移动
- `running` 状态的视觉反馈应持续而轻，不应频繁跳变
- 顶部状态栏保持一行紧凑摘要
- 设置页文案改成明确的状态句，而不是诊断术语堆叠

## Agent Expansion Strategy

V1 的扩面原则是：

- 先统一只读监控
- 后考虑双向控制

每个 agent 第一版只要求统一四类数据：

- `session`
- `status`
- `activity`
- `usage`

### Target Order

1. `Claude Code`
   - CLI 场景接近 `Codex`
   - 最容易先做 dashboard-only 接入

2. `CodeBuddy`
   - 仓库内已有基础 normalizer 和设置诊断
   - 继续补真实 payload 校准即可

3. `JetBrains`
   - 优先通过已有插件 / 上报链路接入
   - 不单独承诺完整控制能力

4. 其他 agent
   - 以统一事件模型成熟度为前提继续扩

## Data Model Direction

共享模型的产品重心要从 `pending-action-first` 重新转回 `activity-first`：

- session 列表是主视图
- activity 是每条 session 的解释层
- usage 是全局摘要层
- pending action 是非主路径扩展层

这意味着后续实现中应避免 renderer 为控制链路做特殊形态绑定，而要优先保证多 agent 的 session/activity/usage 一致性。

## Testing Strategy

V1 需要把验证重点从控制闭环转向监控可用性：

- session 过期与清理测试
- 排序稳定性测试
- 各 agent fixture 驱动的 activity 校准
- usage 同步与过期处理测试
- 设置页状态流转测试
- 主界面窄宽度下的渲染测试

控制链路测试保留，但不作为 V1 UI 完成度的主验收条件。

## Implementation Order

### Step 1: Product Surface Reset

- 主界面去掉 `Control Deck` 叙事
- 重组设置页
- 把实验功能从主路径移走

### Step 2: Session Stability

- session 自动过期
- 排序修正
- 历史 session 弱化

### Step 3: Dashboard Polish

- 顶部状态栏窄宽度降级
- 文案与状态语义统一
- 列表动效与重排节制

### Step 4: Agent Expansion

- `Claude Code`
- `CodeBuddy`
- `JetBrains`

每完成一个 agent，都先补真实 payload 校准和 dashboard 视图验证，再继续往下扩。

## Risks

### Risk 1: 代码主线和产品主线继续分裂

如果 UI 已经转成 dashboard-only，但底层仍不断优先为控制链路加特殊逻辑，产品会再次变杂。

应对方式：

- 明确 V1 验收以 dashboard 可用性为准
- 控制链路能力只做保留，不再做主叙事

### Risk 2: 多 agent 接入导致共享模型继续漂移

应对方式：

- 新 agent 必须先映射到统一 `session / activity / usage`
- 不允许 renderer 为单一 agent 增加专属主路径逻辑

### Risk 3: 过期与排序规则不稳

应对方式：

- 先用明确默认窗口
- 用 fixture 和 store 级测试锁住
- 不在 V1 暴露过多用户可调参数

## Success Criteria

以下条件满足时，可认为 Dashboard V1 已经成立：

- 用户首次打开能直接理解 `CodePal` 是统一 dashboard
- 主界面没有控制台式杂讯
- 会话列表不会无限膨胀
- 排序稳定反映最近用户输入
- 顶部摘要清晰、紧凑、不过度拥挤
- 设置页能支持用户完成接入和用量同步
- 至少稳定覆盖 `Codex`、`Cursor`，并完成 `Claude Code / CodeBuddy / JetBrains` 中至少两个 agent 的 dashboard-only 接入
