---
title: "开发 @oh-my-pi/pi-coding-agent"
description: "Oh My Pi 官方仓库文档：开发 @oh-my-pi/pi-coding-agent。"
---

# 开发 `@oh-my-pi/pi-coding-agent` \{#developing-oh-my-pipi-coding-agent}

本包是 `omp` CLI。本文件是一份**开发者导航**：介绍各项内容在 `src/` 中的位置、如何运行本地开发循环，以及各子系统在仓库 [`docs/`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/docs) 目录树中的哪份文档是权威参考。

之前放在这里的长篇架构讲解，其过时速度比任何人重新阅读的速度都快。`docs/` 目录树持续维护更新（并为智能体内的 `omp://` 文档入口建立了索引），因此本文件改为链接到那里，而不重复容易过时的正文。

## 本地开发 \{#local-development}

在 `packages/coding-agent/` 中运行（或添加 `--cwd=packages/coding-agent`）：

| 任务 | 命令 |
| --- | --- |
| 类型检查 + lint（门禁） | `bun run check` |
| 仅类型检查 | `bun run check:types` |
| 仅 lint | `bun run lint` |
| 测试 | `bun run test` |
| 自动修复：lint + 提示词格式化 | `bun run fix` |
| 构建 `dist/omp` 二进制文件 | `bun run build` |

类型检查使用 Bun 内置的检查器（`bun check --no-script`）；显式指定的标志会绕过各包的 `check` 脚本。保留稳定版 TypeScript 仅用于发布声明文件和 JavaScript，因为 `bun check` 不会生成这些产物。使用 `bun run check` 运行完整的类型检查/lint 门禁。

更改导出的 HTML/CSS/JS、Web 主题或共用的工具/跟踪渲染器后，运行 `bun run gen:export-viewer`，并将 `src/export/html/viewer.generated.json` 纳入此次更改。生成的 JS 位于被忽略的 `export-assets/` 中；CI 会验证已提交的元数据（`--check`，设置 `CI=true` 时也会隐含启用），并将 Linux 二进制构建产生的那份确切资源与发布二进制文件一同发布。在设置了 `CI=true` 的 shell 中，例如 omp 的 bash 工具中，使用 `bun run gen:export-viewer --write` 更新元数据。

从源码检出目录进行导出时，会内联生成的查看器，因此依次运行 `bun gen:export-viewer` 和 `/export` 即可检验本地更改，无需发布或启动本地服务器。打包发行版引用各自带版本号的 `build.stencil.so` 查看器。两者都从不可变的、按内容寻址的 `stencil.so/assets/omp/` 文件加载 Markdown 和 Highlight.js。请永久保留站点上的这些文件：旧导出会直接引用它们。

将模拟计时器的作用范围限定为测试所检验的截止时间，然后在启动真实套接字监听器之前恢复真实计时器。Bun 的模拟时钟可能推迟 `server.listen` 回调，导致注册表发布和清理一直等待。

调用 `setAgentDir()` 的测试必须为每个测试保存并恢复 `PI_CODING_AGENT_DIR`、`OMP_PROFILE` 和 `PI_PROFILE` 的快照，然后在恢复后调用 `__resetDirsFromEnvForTests()`。主目录发现测试夹具必须清除并恢复 `PI_CODING_AGENT_DIR`，以防继承的覆盖设置绕过夹具。复用 `test/helpers/settings-test-state.ts` 中的 `restoreEnvValue()`，以保留未设置值的状态。

## 启动流程 \{#boot-flow}

```text
process argv
   │
   ▼
src/cli.ts (runCli)            ── worker-host dispatch + Bun version guard;
   │  default subcommand: launch    argv normalization
   ▼
src/commands/* (+ src/cli/)   ── per-command adapters
   │
   ▼
src/main.ts (runRootCommand)  ── theme / settings / model registry / session opts
   │
   ▼
createAgentSession(...)        ── src/sdk.ts → AgentSession
   │
   ├── InteractiveMode   (src/modes/, TUI event loop)
   ├── runPrintMode      (one-shot text/json)
   └── runRpcMode        (JSONL stdin/stdout server)
```

`cli.ts` 同时充当工作进程宿主：它通过 `declareWorkerHostEntry()` 声明自身，并在加载命令注册表之前分派隐藏的 `__omp_worker_*` argv 选择器（参见 `AGENTS.md` → _工作进程脚本_）。

## 源码布局（`src/`） \{#source-layout-src}

顶层入口模块：`cli.ts`、`main.ts`、`sdk.ts`、`index.ts`（SDK 汇总导出）、`config.ts`、`system-prompt.ts`、`workspace-tree.ts`、`cli-commands.ts`、`telemetry-export.ts`。

| 目录 | 职责 | 参考 |
| --- | --- | --- |
| `cli/`, `commands/`, `commit/`, `export/` | 命令行适配器和具体子命令 | 无 |
| `modes/` | 交互式 TUI、打印和 RPC 运行时 | [rpc.md](./rpc.md), [sdk.md](./sdk.md) |
| `session/` | `AgentSession`、JSONL 会话树、存储、历史 | [session.md](./session.md), [session-tree-plan.md](./session-tree-plan.md) |
| `config/`, `registry/`, `secrets/` | 设置、模型/模型提供方注册表、密钥混淆 | [settings.md](./settings.md), [config-usage.md](./config-usage.md), [models.md](./models.md), [secrets.md](./secrets.md) |
| `tools/` | 内置工具实现 + 渲染/元数据辅助函数 | [custom-tools.md](./custom-tools.md), [`tools/`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/docs/tools) |
| `exec/`, `eval/`, `ssh/`, `dap/`, `debug/` | 执行后端（shell、py/js 内核、ssh、调试器） | [bash-tool-runtime.md](./bash-tool-runtime.md), [python-repl.md](./python-repl.md) |
| `lsp/` | 语言服务器客户端/运行时 | [lsp-config.md](./lsp-config.md), [tools/lsp.md](./tools/lsp.md) |
| `task/`, `irc/`, `goals/`, `plan-mode/` | 子代理委派、智能体间 IRC、计划模式 | [task-agent-discovery.md](./task-agent-discovery.md), [tools/task.md](./tools/task.md) |
| `web/`, `exa/` | 抓取、浏览器自动化、搜索提供方、抓取器 | [tools/web_search.md](./tools/web_search.md), [tools/browser.md](./tools/browser.md) |
| `mcp/` | MCP 传输 / 管理器 / 加载器 / 工具桥接 | [mcp-config.md](./mcp-config.md), [mcp-runtime-lifecycle.md](./mcp-runtime-lifecycle.md) |
| `extensibility/`, `slash-commands/` | 扩展、钩子、自定义工具/命令、技能、插件 | [extensions.md](./extensions.md), [hooks.md](./hooks.md), [skills.md](./skills.md) |
| `capability/`, `discovery/` | 能力注册表 + 配置发现来源模块 | [extension-loading.md](./extension-loading.md), [context-files.md](./context-files.md) |
| `advisor/`, `autolearn/`, `autoresearch/` | 顾问/看门狗、托管技能、后台研究 | [advisor-watchdog.md](./advisor-watchdog.md), [autoresearch.md](./autoresearch.md) |
| `memories/`, `memory-backend/`, `mnemopi/`, `hindsight/` | 记忆子系统和后端 | [memory.md](./memory.md), [mnemosyne-memory-backend.md](./mnemosyne-memory-backend.md) |
| `internal-urls/` | 路由器 + 处理器（`agent://`、`omp://`、`rule://`、…） | [tools/read.md](./tools/read.md#internal-urls), [tools/write.md](./tools/write.md#writable-internal-resources) |
| `collab/` | 实时会话共享 | [collab.md](./collab.md) |
| `tts/`, `stt/` | 文本转语音 / 语音转文本 | 无 |
| `tiny/`, `auto-thinking/` | 嵌入式小型模型实验、自动思考级别 | [local-models.md](./local-models.md) |
| `async/`, `lib/`, `utils/`, `prompts/`, `edit/` | 共用基础设施、提示词资源、补丁/差异引擎 | [tools/edit.md](./tools/edit.md) |

## 子系统参考 \{#subsystem-reference}

### 会话、持久化和轮次生命周期 \{#sessions-persistence-and-turn-lifecycle}

- [session.md](./session.md)：存储和条目模型
- [session-tree-plan.md](./session-tree-plan.md)：分支/树架构
- [tree.md](./tree.md)：`/tree` 会话导航器和叶节点切换
- [session-switching-and-recent-listing.md](./session-switching-and-recent-listing.md)
- [session-operations-export-share-fork-resume.md](./session-operations-export-share-fork-resume.md)
- [compaction.md](./compaction.md)：上下文压缩和分支摘要
- [ttsr-injection-lifecycle.md](./ttsr-injection-lifecycle.md)
- [non-compaction-retry-policy.md](./non-compaction-retry-policy.md)
- [handoff-generation-pipeline.md](./handoff-generation-pipeline.md)

### 配置、模型、模型提供方、身份验证 \{#configuration-models-providers-auth}

- [settings.md](./settings.md), [config-usage.md](./config-usage.md)
- [environment-variables.md](./environment-variables.md)
- [models.md](./models.md), [providers.md](./providers.md), [adding-a-provider.md](./adding-a-provider.md)
- [local-models.md](./local-models.md)
- [provider-streaming-internals.md](./provider-streaming-internals.md), [ai-schema-normalize.md](./ai-schema-normalize.md)
- [toolconv/](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/docs/toolconv)：按模型家族进行工具调用转换（anthropic、deepseek、gemini、gemma、glm-4.5、harmony、hermes、kimi-k2、minimax、pi-native、qwen3、xml）；另见 [ERRATA-GPT5-HARMONY.md](./ERRATA-GPT5-HARMONY.md)
- [keybindings.md](./keybindings.md)
- [secrets.md](./secrets.md), [auth-broker-gateway.md](./auth-broker-gateway.md), [install-id.md](./install-id.md)
- [system-prompt-customization.md](./system-prompt-customization.md)

### 工具框架和内置工具 \{#tools-framework-and-built-in-tools}

- 编写 + 注册表：[custom-tools.md](./custom-tools.md)
- 输出/产物：[blob-artifact-architecture.md](./blob-artifact-architecture.md)
- 门控/审批：[approval-mode.md](./approval-mode.md), [resolve-tool-runtime.md](./resolve-tool-runtime.md)
- 各工具参考：[`docs/tools/`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/docs/tools)：`read`、`write`、`edit`、`ast-edit`、`ast-grep`、`grep`、`glob`、`bash`、`eval`、`wait`、`lsp`、`debug`、`task`、`web_search`、`browser`、`github`、`ask`、`todo`、`recall`、`retain`、`reflect`、`checkpoint`、`rewind`

### 执行后端 \{#execution-backends}

- [bash-tool-runtime.md](./bash-tool-runtime.md), [tools/bash.md](./tools/bash.md)
- [python-repl.md](./python-repl.md), [notebook-tool-runtime.md](./notebook-tool-runtime.md), [tools/eval.md](./tools/eval.md), [tools/wait.md](./tools/wait.md)
- [tools/debug.md](./tools/debug.md), [tools/lsp.md](./tools/lsp.md), [lsp-config.md](./lsp-config.md)

### 任务委派和子代理 \{#task-delegation-and-subagents}

- [task-agent-discovery.md](./task-agent-discovery.md), [tools/task.md](./tools/task.md)
- [collab.md](./collab.md), [agent-hub.md](./agent-hub.md), [tools/wait.md](./tools/wait.md)

### Web I/O 和检索 \{#web-io-and-retrieval}

- [tools/web_search.md](./tools/web_search.md), [tools/browser.md](./tools/browser.md), [tools/github.md](./tools/github.md)

### MCP \{#mcp}

- [mcp-config.md](./mcp-config.md), [mcp-runtime-lifecycle.md](./mcp-runtime-lifecycle.md)
- [mcp-protocol-transports.md](./mcp-protocol-transports.md), [mcp-server-tool-authoring.md](./mcp-server-tool-authoring.md)

### 记忆 \{#memory}

- [memory.md](./memory.md), [mnemosyne-memory-backend.md](./mnemosyne-memory-backend.md)
- 记忆工具：[tools/recall.md](./tools/recall.md), [tools/retain.md](./tools/retain.md), [tools/reflect.md](./tools/reflect.md)

### 发现、上下文和规则 \{#discovery-context-and-rules}

- [context-files.md](./context-files.md), [rulebook-matching-pipeline.md](./rulebook-matching-pipeline.md)
- [advisor-watchdog.md](./advisor-watchdog.md), [fs-scan-cache-architecture.md](./fs-scan-cache-architecture.md)

### TUI 和主题 \{#tui-and-theming}

- [tui.md](./tui.md), [tui-core-renderer.md](./tui-core-renderer.md), [tui-runtime-internals.md](./tui-runtime-internals.md)
- [theme.md](./theme.md)

### 原生组件（`crates/natives`、`packages/natives`） \{#natives-cratesnatives-packagesnatives}

- [natives-architecture.md](./natives-architecture.md), [natives-addon-loader-runtime.md](./natives-addon-loader-runtime.md), [natives-binding-contract.md](./natives-binding-contract.md)
- [natives-text-search-pipeline.md](./natives-text-search-pipeline.md), [natives-shell-pty-process.md](./natives-shell-pty-process.md), [natives-media-system-utils.md](./natives-media-system-utils.md)
- [natives-build-release-debugging.md](./natives-build-release-debugging.md), [natives-rust-task-cancellation.md](./natives-rust-task-cancellation.md), [porting-to-natives.md](./porting-to-natives.md)

### 构建和发布 \{#build-and-release}

- [macos-signing-notarization.md](./macos-signing-notarization.md)

## 扩展 omp \{#extending-omp}

| 要添加的内容… | 从这里开始 |
| --- | --- |
| 内置工具 | `src/tools/index.ts`（`BUILTIN_TOOLS` / `HIDDEN_TOOLS`）+ [custom-tools.md](./custom-tools.md) |
| 扩展（TS/JS 模块） | [extensions.md](./extensions.md), [extension-loading.md](./extension-loading.md), [skills/authoring-extensions.md](./skills/authoring-extensions.md) |
| 钩子 | `src/extensibility/hooks/types.ts` + [hooks.md](./hooks.md), [skills/authoring-hooks.md](./skills/authoring-hooks.md) |
| 斜杠命令 | [slash-command-internals.md](./slash-command-internals.md) |
| RPC 命令 | `src/modes/rpc/rpc-types.ts` + [rpc.md](./rpc.md) |
| 技能 | [skills.md](./skills.md) |
| 市场插件 | [marketplace.md](./marketplace.md), [plugin-manager-installer-plumbing.md](./plugin-manager-installer-plumbing.md), [skills/authoring-marketplaces.md](./skills/authoring-marketplaces.md) |
| 自定义 MCP 工具/服务器 | [mcp-server-tool-authoring.md](./mcp-server-tool-authoring.md), [custom-tools.md](./custom-tools.md) |
| 模型提供方 | [adding-a-provider.md](./adding-a-provider.md) |
| 编程式/SDK 使用 | [sdk.md](./sdk.md) |

另请参阅仓库根目录的 `AGENTS.md`，了解全仓库约定（优先使用 Bun 而非 Node、日志、TUI 净化、生成文件、变更日志、发布）。
