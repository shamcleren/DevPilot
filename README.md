# CodePal

CodePal 是一个面向多 IDE / 多 AI Agent 场景的统一监控面板，目标是在一个浮动窗口里集中查看任务状态，减少在 Cursor、CodeBuddy、PyCharm 和终端之间反复切换的成本。

当前仓库已经完成第一阶段 bootstrap，可以本地运行、测试和构建。

## 当前能力

- 实时接入 Cursor / CodeBuddy / PyCharm(CodeBuddy 插件) 的上行事件
- 展示任务状态分布、当前任务摘要、运行时长
- 默认态直接看到全部任务状态
- 鼠标移入后展开最近活动时间线与更多上下文
- 支持 `approval` / `single_choice` / `multi_choice` 的项目内闭环
- 通过应用可执行文件内置的 `--codepal-hook` 模式将 `action_response` 按 `actionId` 回写到各 hook 进程挂起的 collector socket（同一 `sessionId` 下可多笔 pending 并存、互不串线）
- **Pending 生命周期（Phase 1，有界清理）**：对同一 `actionId` 的重复 `action_response` 在首次成功写回后即被拒绝（first-win），避免重复写回；收到明确的按 action 关闭信号时，面板会移除对应 pending 卡片；若长期收不到关闭信号，pending 会在超时后从可操作 UI 中过期淡出。这是有界的陈旧 pending 清理，**不承诺**跨 IDE / hook 表面的完美一致状态。
- **CodeBuddy CLI / hook payload 校准（Phase 1）**：显式支持 `status/state/agent_status`、`task/current_task/message/prompt/tool_name/reason/source`、`timestamp/ts` 这些主字段，并对 `SessionStart`、`Notification`、`UserPromptSubmit`、`PreToolUse`、`SessionEnd` 等官方 hook 事件做受限状态映射；内置 hook CLI 会稳定注入 `tool=codebuddy`，同时保留官方 `source` 原义（例如 `startup`）。
- **独立设置界面（测试版）**：配置与接入诊断已从主监控界面拆出，可通过主窗口右上角或托盘菜单打开，查看 CodePal 当前监听端点、`Cursor` / `CodeBuddy` 的真实健康状态（`已激活` / `需修复` / `未配置`），并支持一键写入/修复用户级 hook 配置。
- **macOS 测试版产物（unsigned / ad-hoc）**：可通过 `npm run dist:mac` 生成 `release/` 下的 `.zip` 与 `.dmg` 测试包，便于内部安装试用。

## 当前边界

- 还没有实现自由文本输入
- 还没有覆盖精确 terminal pane 跳转、深度窗口控制
- PyCharm / CodeBuddy 插件专属 payload 仍未校准；当前承诺只覆盖 CodeBuddy CLI / hook 主链路
- 当前测试版打包仍是 unsigned / ad-hoc 形态，不承诺正式签名、公证与自动更新体验
- 自动配置优先写用户级配置：`Cursor` 写 `~/.cursor/hooks.json`，`CodeBuddy` 写 `~/.codebuddy/settings.json`
- 当前正式 hook 链路已内置到 `CodePal` 可执行文件；未覆盖的旧脚本路径只保留给兼容性检测与迁移提示

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
4. `src/main/hook/`
   可执行文件内置的 hook CLI、事件转发与阻塞回写桥接。

## 目录结构

```text
src/
  adapters/       Hook payload -> upstream event
  main/           Electron main, IPC hub, session store
  renderer/       Monitoring panel UI
  shared/         Shared payload and session types
  hook/           Executable hook CLI and bridge modules
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

### 产出 macOS 测试版

```bash
npm run dist:mac
```

默认产物会写到 `release/`，当前会生成：

- `CodePal-<version>-arm64.zip`
- `CodePal-<version>-arm64.dmg`

说明：

- 当前是 unsigned / ad-hoc 测试版，macOS 首次打开可能需要在系统安全设置里手动放行。
- 测试机不再需要额外安装 `node` 与 `python3` 才能走正式 hook 主链路；当前测试版限制主要仍在 unsigned / ad-hoc 分发形态。

## 开发说明

当前主链路是：

`Hook / bridge -> IPC Hub -> sessionStore -> renderer`

当前 pending action 的响应链路是：

`renderer -> preload -> main -> action_response` →（按 pending 上的 `responseTarget`）→ 外部 hook / bridge 进程

当事件未携带 `responseTarget` 时，可回退到环境变量配置的默认 socket（如 E2E collector）。

## 集成设置

当前设置界面支持：

- 展示当前 CodePal listener 是 `TCP` 还是 `Unix socket`
- 展示当前应用可执行入口、监听端点与各集成的健康/迁移状态
- 检测 `Cursor` 与 `CodeBuddy` 用户级配置文件是否已包含 CodePal hook
- 一键写入或修复对应配置
- 展示最近一次从对应 agent 收到的事件时间与状态

当前自动配置策略：

- `Cursor`：写入 `~/.cursor/hooks.json`，启用最小生命周期 hooks（`sessionStart` / `stop`）
- `CodeBuddy`：写入 `~/.codebuddy/settings.json` 的 `hooks` 字段
- 遇到不兼容或损坏的现有配置结构时，应用会拒绝强写，并在 UI 中返回错误

## 测试范围

当前测试主要覆盖：

- Cursor / CodeBuddy normalizer
- CodeBuddy fixture 驱动的 hook CLI / ingress 校准
- 独立设置界面与自动配置服务
- IPC Hub 行协议与 bridge 集成
- hook ingress 到 session event 的转换
- session store 状态更新与 pending action 行为（含同 session 多 `actionId` 与按 id 路由的 `responseTarget`）
- renderer 中会话行的基础渲染
- Playwright E2E：`npm run test:e2e`（含真实 `--codepal-hook blocking-hook` 阻塞链路与双 pending 逆序应答）

## 路线图

下一阶段优先项：

- 接入更丰富的 activity 流
- 扩展更多 IDE / terminal adapter
- 增强窗口跳转与聚焦能力

## 仓库状态

这是 `CodePal` 的独立仓库初始化版本，适合作为后续功能开发的基础分支。
