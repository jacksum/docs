---
title: "面向用户的包"
description: "Oh My Pi 官方仓库文档：面向用户的包。"
---

# 面向用户的包 \{#user-facing-packages}

本页索引那些只在 README 中有说明、需要在包内 README/清单之外由根文档补充介绍的面向用户的包 CLI 和功能。

## 根文档政策 \{#root-docs-policy}

- 对用户可以直接或通过 `omp` 运行的包内 CLI、扩展功能、仪表盘和基准测试运行器，**纳入**根文档覆盖范围。
- 当包/crate 纯属内部实现时，**明确排除**，并指向负责介绍它的架构文档。
- 包 README 和清单仍是包内设置与标志的事实依据；根文档让功能易于发现，并链接到确切的源码路径。
- 内部 Rust crate 仍由原生架构文档覆盖，除非将其提升为独立的面向用户的命令或 API。面向贡献者的导览位于 [`native-crates.md`](./native-crates.md)；目前，每个 `crates/*` 条目都是 `@oh-my-pi/pi-natives` 和嵌入式 shell 的内部组成部分，因此由 [`natives-architecture.md`](./natives-architecture.md) 及周边原生文档负责介绍。

## 包 CLI 与功能 \{#package-clis-and-features}

### `python/robomp`：自托管 GitHub 分类与修复服务 \{#pythonrobomp--self-hosted-github-triage-and-fix-service}

来源：[`python/robomp/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/python/robomp/README.md)、[`python/robomp/pyproject.toml`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/python/robomp/pyproject.toml)、[`python/robomp/.env.example`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/python/robomp/.env.example)、[`python/robomp/docker-compose.yml`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/python/robomp/docker-compose.yml)。

- Python 包：`robomp`（Python 3.11 或更新版本）；可执行命令：`robomp`，包含 `serve`、`triage`、`replay`、`status` 和 `cleanup` 命令。
- 功能：自托管服务，接收来自允许列表中仓库的 GitHub webhook，对议题进行分类，为每个议题恢复一个 `omp --mode rpc` 会话，发表评论或创建修复 PR，并处理后续的议题与 PR 对话。传入 PR 审查默认启用；可选择启用的发布哨兵处理失败的发布 CI（`ROBOMP_RELEASE_SENTINEL_ENABLED`，默认值 false）。
- 仪表盘/API：FastAPI 在 `/` 提供运维人员仪表盘，同时提供健康、事件、议题和重放端点。随附的 Compose 部署将其发布到 `http://localhost:6543/`；`bun run robomp:web:dev` 在开发模式下运行仪表盘前端，`bun run robomp:web:build` 重新构建其静态包。
- 输入/存储：Compose 通过显式的逐服务环境变量允许列表，对 `python/robomp/.env` 进行插值，并将 `~/.omp/agent/models.container.yml` 挂载为智能体的 `models.yml`。主机 CLI 配置使用进程环境和相对于 cwd 的 `.env`。GitHub webhook 事件进入由 SQLite 支持的队列；Compose 将数据库、工作区、会话记录和日志持久化到 `/data` 下的 `robomp_data` 卷中。
- 根命令：`bun run robomp:install` 为主机开发安装 Python 包；`bun run robomp:serve` 在主机上运行它；`bun run robomp:build`/`bun run robomp:rebuild`、`bun run robomp:up`、`bun run robomp:down`、`bun run robomp:restart`、`bun run robomp:logs`、`bun run robomp:dev` 和 `bun run robomp:reset` 管理容器部署。
- 前提条件：随附部署需要 Docker Compose v2、与容器模型配置匹配且主机可访问的模型网关、GitHub webhook 端点，以及对允许列表中每个仓库拥有写入权限的机器人 PAT。编排器要求使用经 HMAC 身份验证的 `gh-proxy`，并拒绝持有 `GITHUB_TOKEN`；随附的双容器部署将 PAT 只传给边车。主机开发同样不能将 PAT 放入编排器环境和 `.env`。

### `packages/stats`：本地使用情况仪表盘 \{#packagesstats--local-usage-dashboard}

来源：[`packages/stats/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/stats/README.md)、[`packages/stats/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/stats/package.json)、[`packages/coding-agent/src/cli/stats-cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/cli/stats-cli.ts)。

- 包：`@oh-my-pi/omp-stats`；可执行命令：`omp-stats`；主要用户入口：`omp stats`。
- 功能：根据会话 JSONL 日志生成 AI 使用统计的本地可观测性仪表盘。
- CLI 模式：`omp stats` 在 `http://127.0.0.1:3847` 启动或复用仪表盘（若该端口被其他程序占用，则使用空闲端口），在浏览器中打开它，并持续运行。在 Tern 窗格中，它改为在替代该窗格的浏览器块中显示仪表盘，顶部栏带有关闭按钮（Esc，或未选中任何内容时按 Ctrl+C），并在块关闭时退出；omp 内的 `/stats` 会在 omp 窗格旁的浏览器块中打开它。`--port <port>` 更改端口；`--host <host>` 更改绑定地址（默认是回环地址）。`--summary` 输出控制台摘要；`--json` 输出 JSON 并退出。独立的 `omp-stats` 使用 `--sync` 进入摘要模式，且不会自动打开浏览器。
- 编程 API：导出 `syncAllSessions()` 和 `getDashboardStats()` 等辅助函数供嵌入使用。
- 输入/存储：递归扫描当前配置档案的会话目录，包括嵌套的子代理会话记录；将聚合结果存入该配置档案的统计数据库。默认路径为 `~/.omp/agent/sessions/` 和 `~/.omp/stats.db`；已初始化的 XDG 数据根目录和命名配置档案会通过共享目录解析器改变这些路径。
- 输出：请求/token/费用、提供方、模型、文件夹、工具、收益和挫败感仪表盘。API 端点包括 `/api/stats`、`/api/stats/models`、`/api/stats/folders`、`/api/stats/timeseries`、`/api/stats/tools`、`/api/stats/gain`、`/api/status`、`/api/events`（SSE）和 `/api/sync`（POST）。
- 副作用/限制：一次性报告在输出前完成数据摄取和汇总。仪表盘立即绑定地址，并在页面连接其事件流时启动后台数据摄取；`Ctrl+C` 关闭 CLI 的统计数据库并退出。`omp stats` 中的挫败感评判按需使用已配置的 `judge` 角色（遥测用途 `stats_frustration`），可能发起模型调用；独立的 `omp-stats` 不提供评判器。

### `packages/omptype`：模式验证库 \{#packagesomptype--schema-validation-library}

来源：[`packages/omptype/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/omptype/README.md)、[`packages/omptype/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/omptype/package.json)，以及仓库的 [omptype 编写指南](./omptype-guide.md)。

- 包：公开的 `@oh-my-pi/omptype`；使用 `bun add @oh-my-pi/omptype` 安装。其清单声明需要 Node 20 或更新版本，以及 Bun 1.4.4 或更新版本。
- 功能：可调用的 ArkType 兼容模式，具有低开销的解释执行启动、按需热路径编译、验证错误、默认值与变换，以及 JSON Schema 输出能力。
- 公开接口：`@oh-my-pi/omptype` 用于原生编写，`/typebox` 和 `/zod` 用于兼容构建器，`/ark` 用于无别名的 ArkType 兼容门面。
- 运行时行为：模式调用返回已验证的值或 `type.errors`；`.assert()` 返回值或抛出异常；`.allows()` 执行布尔检查。
- 限制：这是刻意聚焦范围的兼容接口，而非每个 ArkType、TypeBox 或 Zod API 的完整实现。

### `packages/typescript-edit-benchmark`：TypeScript 编辑测试夹具引擎 \{#packagestypescript-edit-benchmark--typescript-edit-fixture-engine}

来源：[`packages/typescript-edit-benchmark/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/typescript-edit-benchmark/package.json)、[`packages/typescript-edit-benchmark/src/generate.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/typescript-edit-benchmark/src/generate.ts)、[`packages/typescript-edit-benchmark/src/tasks.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/typescript-edit-benchmark/src/tasks.ts)、[`packages/typescript-edit-benchmark/src/verify.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/typescript-edit-benchmark/src/verify.ts)，以及 [`packages/metaharness/adapters/edit/cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/adapters/edit/cli.ts) 中的运行器。

- 包：私有的 `@oh-my-pi/typescript-edit-benchmark`；支持库，没有独立可执行命令。
- 功能：生成、加载、格式化并验证由 metaharness 编辑适配器使用的 TypeScript 变异测试夹具。
- 测试夹具生成：在仓库根目录执行 `bun packages/typescript-edit-benchmark/src/generate.ts [--typescript-dir <path>] [generator options]`。它扫描 JS/JSX/TS/TSX；未提供源路径时，会将 `badlogic/pi-mono` 浅克隆到临时目录并扫描 `packages/`。输出默认是 `packages/typescript-edit-benchmark/fixtures.tar.gz`；当前生成器控制项包括 `--count-scale`、`--seed`、`--categories` 以及难度/分数过滤器。
- 基准测试执行：`bun run --cwd packages/metaharness bench:edit -- --model <provider/model> [options]`，或者从 metaharness 仪表盘/API 启动 `edit` 运行。
- 运行器输入包括提供方/模型、思考级别、每任务运行次数、超时、并发数、任务 ID、测试夹具目录或 `.tar.gz`、编辑策略、引导模式、重试/轮次限制、输出路径/格式，以及测试夹具验证/列举标志。
- 测试夹具包含任务元数据、提示词、输入文件和预期文件。运行器将每次运行的输入复制到 `runs/rb-*/` 下的隔离工作目录，记录可选的对话转储，并写入 Markdown 或 JSON 结果。

### `packages/metaharness`：统一基准测试管理器 \{#packagesmetaharness--unified-benchmark-manager}

来源：[`packages/metaharness/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/README.md)、[`packages/metaharness/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/package.json)、[`packages/metaharness/src/server.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/src/server.ts)、[`packages/metaharness/src/runner.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/src/runner.ts)、[`packages/metaharness/src/tb/cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/src/tb/cli.ts)，以及 [`packages/metaharness/adapters/edit/cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/metaharness/adapters/edit/cli.ts)。

- 包：私有的 `@oh-my-pi/pi-metaharness`；可执行命令：`metaharness`。
- 功能：为 Harbor 数据集（默认 `terminal-bench@2.0`）、TypeScript 编辑和 SnapCompact 基准测试提供统一的仪表盘、SQLite 存储、REST/SSE API，以及规范化的实验 → 运行 → 跟踪记录模型。
- 仪表盘/API：`bun run --cwd packages/metaharness serve -- --port 4700`；启动表单和 `POST /api/runs` 支持全部三种基准测试适配器。
- 直接运行器：`bun packages/metaharness/src/runner.ts --model <provider/model> [Harbor options]` 和 `bun run --cwd packages/metaharness bench:edit -- --model <provider/model> [edit options]`。
- 独立的 Terminal-Bench 2.1 运行器：`bun run --cwd packages/metaharness bench:tb -- --model <provider/model> [options]` 在远程 Vibemon microVM 中运行本地 OMP 二进制程序，并使用可访问的主机身份验证网关。它支持任务过滤器、重复尝试/轮次、并发数、支出预算、工具/环境控制，以及任务列举。其产物和 `tb.sqlite` 默认位于 `runs/tb/`；它不属于仪表盘的三种适配器。
- Harbor 源码模式以绑定挂载方式挂载仓库和缓存的 Linux 依赖树，而提供方凭据保留在主机上的身份验证网关之后。也提供本地 tarball、已发布包和预构建二进制程序安装模式。
- 存储：规范化状态位于 `<jobs-dir>/_manager/metaharness.sqlite` 下；基准测试原生产物仍是文件系统中的事实依据，历史运行会自动发现。
- 输出包括 Harbor 试验目录、`_bench/<jobName>/report.md`、每次运行的日志、编辑报告、规范化跟踪记录、仪表盘指标和 REST/SSE 更新。
- 限制：删除实验或运行也会删除其作业目录，且目标正在运行时会拒绝删除。Harbor 需要 Docker 或 Apple Container，以及 Harbor CLI；特定后端的网络和挂载约束记录在包 README 中。

### `packages/browser-relay`：操控现有 Chrome 标签页 \{#packagesbrowser-relay--drive-existing-chrome-tabs}

来源：[`packages/browser-relay/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/browser-relay/README.md)、[`packages/browser-relay/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/browser-relay/package.json)、[`packages/coding-agent/src/tools/browser/relay/`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/browser/relay)。

- 包：私有的 `@oh-my-pi/browser-relay`；用户命令：`omp browser-relay`。
- 设置：运行 `omp browser-relay install`；它将扩展暂存到 `~/.omp/browser-relay/extension`，注册
  原生主机，并将 Chrome 自身的未打包安装记录写入上次使用的配置档案（必要时重启
  Chrome）。`--no-chrome` 输出手动加载步骤。每次调用时可用 `app: "relay"` 选择启用，
  或设置 `browser.relay`，使中继成为该配置档案跨项目的默认选项（作用域
  详情见包 README）。
- 行为：Chrome 运行期间，扩展的原生主机在操作系统分配的回环端口上提供中继服务。侧边栏聊天使用独立的原生消息连接。
- 安全/限制：它只绑定回环地址。Chrome
  内部页面、DevTools、Web Store、扩展页面，以及打开了 DevTools 的标签页无法接入。

### `packages/collab-web`：协作会话的浏览器客户端 \{#packagescollab-web--browser-client-for-collaborative-sessions}

来源：[`packages/collab-web/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/collab-web/README.md)、[`packages/collab-web/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/collab-web/package.json)、[`docs/collab.md`](./collab.md)。

- 包：私有的 `@oh-my-pi/collab-web`；生产客户端：<https://my.omp.sh/>。
- 功能：`/collab` 会话的浏览器来宾 UI，包括流式会话记录、工具卡片、
  子代理视图、提示词和主机中断。
- 本地路径：`bun run dev` 在端口 3000 提供 UI；`bun run mock-host` 运行离线中继
  和脚本化主机；`bun run build` 在 `dist/` 下生成静态 SPA。
- 约束：非本地部署需要 HTTPS 和可访问的安全 WebSocket 中继。房间
  密钥保留在 URL 片段中，不会发送给中继。

### `packages/snapcompact`：位图上下文压缩 API \{#packagessnapcompact--bitmap-context-compression-api}

来源：[`packages/snapcompact/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/snapcompact/README.md)、[`packages/snapcompact/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/snapcompact/package.json)、[`packages/snapcompact/src/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/snapcompact/src/index.ts)。

- 包：公开的 `@oh-my-pi/snapcompact`；使用 `bun add @oh-my-pi/snapcompact` 安装；需要
  Bun 1.4.4 或更新版本。
- 功能：对丢弃的对话历史进行确定性的本地序列化和 PNG 渲染，
  用于视觉模型上下文压缩；不需要模型调用或 API 密钥。
- 公开入口包括 `compact`、`render`、`renderMany`、`frames`、形状选择、文本
  规范化/序列化、图像预算和文件操作辅助函数。
- 运行时约束：光栅化和 PNG 编码需要 `@oh-my-pi/pi-natives`。

### `packages/mnemopi`：独立的本地记忆 CLI \{#packagesmnemopi--standalone-local-memory-cli}

来源：[`packages/mnemopi/README.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/mnemopi/README.md)、[`packages/mnemopi/package.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/mnemopi/package.json)、[`packages/mnemopi/src/cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/mnemopi/src/cli.ts)，以及 coding-agent 的 [Mnemopi 记忆后端指南](./mnemosyne-memory-backend.md)。

- 包：公开的 `@oh-my-pi/pi-mnemopi`；可执行命令：`mnemopi`；需要 Bun 1.4.4 或更新版本。使用 `bun add --global @oh-my-pi/pi-mnemopi` 全局安装，然后运行 `mnemopi <command>`。在源码检出目录中，`bun packages/mnemopi/src/cli.ts <command>` 运行相同的入口。
- 存储与搜索：`store`/`remember`、`recall`/`search`、`update`/`edit` 和 `delete`/`forget`。
- 检查与维护：`stats`、`sleep`/`consolidate`、`diagnose`/`doctor`、JSON `export` 和 `import`、搭配 `read`、`write` 或 `clear` 的 `scratchpad`/`sp`，以及搭配 `list`、`create` 或 `delete` 的 `bank`。
- 存储：独立命令默认使用 `~/.hermes/mnemopi/data/mnemopi.db`；`MNEMOPI_DATA_DIR` 可选择其他数据目录。此默认位置与 OMP 的会话管理记忆位置分开。
- 集成：`mcp` 启动该包的 MCP 服务器。独立 CLI 直接操作 Mnemopi 存储；将记忆集成到 OMP 会话时，则按后端指南所述选择 `memory.backend: mnemopi`。
- 发现与错误：`mnemopi --help` 列出主要命令形式。未知命令和无效参数会输出简洁的错误，并返回非零退出码。
