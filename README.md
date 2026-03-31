# DevPilot

DevPilot 是一个面向多 IDE / 多 AI Agent 场景的统一监控面板，目标是在一个浮动窗口里集中查看任务状态，减少在 Cursor、CodeBuddy、PyCharm 和终端之间反复切换的成本。

当前仓库已经完成第一阶段 bootstrap，可以本地运行、测试和构建。

## 当前能力

- 实时接入 Cursor / CodeBuddy / PyCharm(CodeBuddy 插件) 的上行事件
- 展示任务状态分布、当前任务摘要、运行时长
- 默认态直接看到全部任务状态
- 鼠标移入后展开更多上下文
- 支持 `approval` / `single_choice` / `multi_choice` 的项目内闭环

## 当前边界

- 还没有把 `action_response` 真正回写给外部工具的阻塞 Hook
- 还没有实现自由文本输入
- 还没有覆盖精确 terminal pane 跳转、深度窗口控制
- CodeBuddy 的真实 Hook 字段仍需要联调校准

## 技术栈

- Electron
- React
- TypeScript
- electron-vite
- Vitest
- Tailwind CSS

## 架构概览

项目采用 4 层结构：

1. `src/main/`
   Electron Main Process，负责窗口、托盘、本地 IPC Hub、session store。
2. `src/renderer/`
   统一监控面板 UI，负责状态总览、会话列表、hover 上下文和 pending action 展示。
3. `src/adapters/`
   Hook 事件归一化层，目前包含 Cursor 和 CodeBuddy。
4. `scripts/`
   Hook 包装脚本与 bridge sender，用于把外部工具事件发送到 DevPilot。

## 目录结构

```text
src/
  adapters/       Hook payload -> upstream event
  main/           Electron main, IPC hub, session store
  renderer/       Monitoring panel UI
  shared/         Shared payload and session types
scripts/
  bridge/         Event sender
  hooks/          Cursor / CodeBuddy hook wrappers
```

## 快速开始

如果你是用 Cursor / agent 模式继续开发，先读：

- `AGENTS.md`
- `docs/context/current-status.md`

### 安装依赖

```bash
npm ci
```

### 启动开发环境

```bash
npm run dev
```

### 运行测试

```bash
npm test
```

### 运行静态检查

```bash
npm run lint
```

### 构建生产包

```bash
npm run build
```

## 开发说明

当前主链路是：

`Hook / bridge -> IPC Hub -> sessionStore -> renderer`

当前 pending action 的响应链路是：

`renderer -> preload -> main -> action_response payload`

也就是说，第一阶段已经完成“应用内闭环”，但还没有完成“外部工具回灌闭环”。

## 测试范围

当前测试主要覆盖：

- Cursor / CodeBuddy normalizer
- IPC Hub 行协议与 bridge 集成
- hook ingress 到 session event 的转换
- session store 状态更新与 pending action 行为
- renderer 中会话行的基础渲染

## 路线图

下一阶段优先项：

- 把 `action_response` 正式回写给外部工具
- 接入更丰富的 activity 流
- 扩展更多 IDE / terminal adapter
- 增强窗口跳转与聚焦能力

## 仓库状态

这是 `DevPilot` 的独立仓库初始化版本，适合作为后续功能开发的基础分支。
