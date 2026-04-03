# CodePal

CodePal 是一个面向 IDE / AI Agent 场景的统一 dashboard。当前第一期优先聚焦“统一查看”，目标是在一个浮动窗口里集中查看多种 agent 的会话、状态、最近活动和用量摘要，减少在 IDE、终端和网页之间来回切换的成本。

当前仓库已经完成第一阶段 bootstrap，可以本地运行、测试和构建。

## 当前第一期能力

- 实时接入 Codex session 日志与 Cursor 上行事件
- 主界面默认聚焦 dashboard-only：会话列表、最近活动、运行状态和顶部用量摘要
- 顶部用量支持紧凑显示和详细显示两档密度，可按 agent 显隐
- 设置界面集中承载接入诊断、用量同步和低频配置
- session 列表按最近用户输入优先排序，并带自动过期清理，避免历史无限堆积
- 会话行会主动压制 `Stop`、`UserPromptSubmit` 这类低价值技术事件，尽量保持用户任务视角
- **独立设置界面（测试版）**：可通过主窗口右上角或托盘菜单打开，查看 CodePal 当前监听端点、`Cursor` / `CodeBuddy` 的真实健康状态（`已激活` / `需修复` / `未配置`），并支持一键写入/修复用户级 hook 配置。
- **macOS 测试版产物（unsigned / ad-hoc）**：可通过 `npm run dist:mac` 生成 `release/` 下的 `.zip` 与 `.dmg` 测试包，便于内部安装试用。

## 当前边界

- 还没有实现自由文本输入
- 还没有覆盖精确 terminal pane 跳转、深度窗口控制
- `CodeBuddy` 与 `Claude Code` 已接入 dashboard-only 主路径；`JetBrains / PyCharm` 对话插件接入仍在重新校准数据源
- 当前测试版打包仍是 unsigned / ad-hoc 形态，不承诺正式签名、公证与自动更新体验
- 自动配置优先写用户级配置：`Cursor` 写 `~/.cursor/hooks.json`，`CodeBuddy` 写 `~/.codebuddy/settings.json`
- 当前正式 hook 链路已内置到 `CodePal` 可执行文件；未覆盖的旧脚本路径只保留给兼容性检测与迁移提示
- Codex 当前仍通过读取 `~/.codex/sessions/**/*.jsonl` 提供被动监控；控制型 hook 入口不再是当前 V1 主路径

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
   可执行文件内置的 hook CLI 与事件转发桥接。

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

当前控制型能力仍保留在代码中，但不再是默认 UI 主路径。当前产品主线应理解为：

`session/activity/usage visibility first`

## 集成设置

当前设置界面支持：

- 展示当前 CodePal listener 是 `TCP` 还是 `Unix socket`
- 展示当前应用可执行入口、监听端点与各集成的健康/迁移状态
- 检测 `Cursor` 与 `CodeBuddy` 用户级配置文件是否已包含 CodePal hook
- 一键写入或修复对应配置
- 展示最近一次从对应 agent 收到的事件时间与状态
- 控制顶部用量摘要的显示密度与 agent 可见范围
- 连接 `Cursor Dashboard` 并自动同步额度数据

当前自动配置策略：

- `Cursor`：写入 `~/.cursor/hooks.json`，启用最小生命周期 hooks（`sessionStart` / `stop`）
- `CodeBuddy`：写入 `~/.codebuddy/settings.json` 的 `hooks` 字段
- `Codex`：当前 V1 以被动监控为主，直接读取 `~/.codex/sessions/**/*.jsonl`
- 遇到不兼容或损坏的现有配置结构时，应用会拒绝强写，并在 UI 中返回错误

当前已知限制：

- `Cursor Dashboard` 额度依赖网页登录态；会话失效后需要重新登录
- `Codex` 当前以 session-log 监控为主，不提供完整的主路径控制闭环

## 测试范围

当前测试主要覆盖：

- Cursor / CodeBuddy normalizer
- CodeBuddy fixture 驱动的 hook CLI / ingress 校准
- 独立设置界面与自动配置服务
- IPC Hub 行协议与 bridge 集成
- hook ingress 到 session event 的转换
- session store 状态更新、排序和自动过期策略
- renderer 中会话行的基础渲染
- Playwright E2E：`npm run test:e2e`

## 路线图

下一阶段优先项：

- 扩展更多 IDE / agent 的 dashboard-only 接入，并继续加深 `JetBrains` / `Claude Code` 的事件完整度
- 继续丰富 activity 流并压制低价值技术噪音
- 进一步优化设置页和主界面的密度与稳定性

## 仓库状态

这是 `CodePal` 的独立仓库初始化版本，适合作为后续功能开发的基础分支。
