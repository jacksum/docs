---
title: "CLI 参考"
description: "Oh My Pi 官方仓库文档：CLI 参考。"
---

# CLI 参考 \{#cli-reference}

`omp` 的调用方式如下：

```sh
omp [command] [flags] [messages...]
```

当第一个位置参数**不是**已注册的子命令时，`omp`
通常会路由到默认的 [`launch`](#launch-the-default-command) 命令。
因此，`omp "fix the build"` 会以该消息启动会话，而 `omp models`
运行 `models` 子命令。裸插件管理词语，如 `marketplace`、
`uninstall` 或 `extensions`，则会给出使用 `omp plugin …` 的提示；
如果这些词语就是预期的提示，请使用 `omp launch <word>`。

已识别的子命令可以放在前置启动标志之后。这些标志会
转发给 `launch` 和 `acp`，但其他子命令之前已识别的
仅适用于启动的标志会被移除，不会应用（例如 `omp --cwd dir update`）。

`--profile` 在子命令路由之前应用，因此它也会限定
`config`、`models` 和 `update` 等命令的作用域。

也可以获取运行时帮助：

- `omp --help` 列出面向用户的子命令和常用启动标志。
- `omp <command> --help` 打印该命令的公开标志和示例。

本页是共享**启动接口**（`omp` / `omp launch` 接受的
标志）和所有顶层**子命令**的综合参考。
每个子命令的标志（例如 `omp auth-broker --json`）由
各命令的 `--help` 记录。

## Launch（默认命令） \{#launch-the-default-command}

`omp` 和 `omp launch` 启动编码会话。位置参数成为
初始消息：

```sh
# Interactive session
omp

# Interactive session with an initial prompt
omp "List all .ts files in src/"

# Attach files/images to the initial message (prefix with @)
omp @prompt.md @image.png "What color is the sky?"

# Non-interactive: process the prompt and exit (headless / print mode)
omp -p "List all .ts files in src/"

# Continue the previous session
omp --continue "What did we discuss?"
```

参数处理：

- `@<path>` 将文件或图片附加到初始消息。
- 在协议模式之外，非 TTY stdin 会自动读取到 EOF，作为提示
  文本；不要添加 `-` 标记。省略 `--mode` 时，管道输入或非 TTY stdin 会选择打印模式。
  没有 stdin 文本时，需要 argv 提示或附件。
- stdin 文本、文本附件和第一条位置消息会合并
  为初始提示；其余位置消息会作为后续轮次发送。
- `--` 结束标志解析；其后所有内容都是字面消息文本，即使
  看起来像标志。

### 启动标志 \{#launch-flags}

#### 会话与工作区 \{#session-and-workspace}

| 标志 | 描述 |
| --- | --- |
| `--cwd <dir>` | 启动所在目录（覆盖启动 cwd）。 |
| `--add-dir <dir>` | 添加工作目录之外的工作区目录（可重复）。 |
| `--allow-home` | 允许在 `~` 中启动，而不自动切换到临时目录。 |
| `--profile <name>` | 为身份验证、会话、设置和缓存使用隔离的配置档案。 |
| `--alias <name>` | 为命名配置档案创建 shell 快捷方式并退出；要求提供 `--profile` 或 `OMP_PROFILE`。 |
| `--config <file>` | 为本次运行加载额外的 `config.yml` 风格覆盖层（可重复）。如果覆盖层设置了早期输入编辑器绘制所用的设置（`tui.screen`、主题、符号、输入编辑器形状等），则会跳过该帧；参见 `--prepaint`。 |
| `--session-dir <dir>` | 用于会话存储和查找的目录。 |
| `--no-session` | 不保存会话（临时会话）。 |

#### 会话历史 \{#session-history}

| 标志 | 描述 |
| --- | --- |
| `--continue`, `-c` | 继续上一个会话。 |
| `--resume [id]`, `-r`, `--session [id]` | 按 ID 前缀或路径恢复会话，未给出值时打开选择器。 |
| `--restore [id]` | 像 `--resume` 一样恢复会话，然后继续上次进程崩溃或被终止时未完成的工作：被中断的轮次及其正在运行的子代理。仅限交互式模式；不接受提示。参见[会话操作](./session-operations-export-share-fork-resume.md#cli---restore)。 |
| `--fork <session>` | 将已保存的会话（按 ID 前缀或路径）派生为新会话。参见[会话操作](./session-operations-export-share-fork-resume.md)。 |
| `--from-claude` | 将 Claude Code 会话导入 OMP。 |
| `--from-codex` | 将 Codex 会话导入 OMP。 |
| `--export <session>` | 将会话文件导出为 HTML 并退出。 |
| `--no-title` | 禁用标题自动生成（等同于 `PI_NO_TITLE` [环境变量](./environment-variables.md)）。 |

`--continue`、`--resume`、`--restore`、`--fork` 和外部会话导入都要求
持久化，不能使用 `--no-session`。`--from-claude` 和 `--from-codex`
互斥，且不能与 `--continue`、`--resume`
或 `--fork` 组合。

#### 模型选择 \{#model-selection}

| 标志 | 描述 |
| --- | --- |
| `--model <id-or-role>` | 要使用的模型或已配置角色（角色：`slow` 或 `@slow`；模糊模型匹配：`opus`、`gpt-5.2`；指定提供方时 id 必须精确：`openai/gpt-5.2`）。 |
| `--smol <id>` | 用于轻量任务的 Smol/快速模型（或 `PI_SMOL_MODEL`）。 |
| `--slow <id>` | 用于深入分析的慢速/推理模型（或 `PI_SLOW_MODEL`）。 |
| `--plan <id>` | 用于架构规划的计划模型（或 `PI_PLAN_MODEL`）。 |
| `--preset <name>` | 以已保存的模型预设启动：其角色模型和默认思考级别只应用于本次运行，`--model`、`--smol`、`--slow` 和 `--plan` 对其指定的角色仍然优先。 |
| `--models <a,b,c>` | 用于 `Ctrl+P` 循环切换的逗号分隔模型模式。 |
| `--provider <name>` | 要使用的提供方（旧版；优先使用 `--model`）。 |
| `--api-key <key>` | API 密钥（默认使用环境变量）。 |
| `--provider-session-id <id>` | 复用特定的提供方侧会话 id，以保持连续性并限定缓存作用域。 |
| `--prompt-cache-key <key>` | 覆盖此会话的提供方提示缓存键。 |
| `--service-tier <tier>` | OpenAI 服务层级：`none`、`auto`、`default`、`flex`、`scale`、`priority` 或 `ultrafast`（`none` 会省略 `service_tier`）。 |
| `--no-judge` | 只在活动模型的提供方上运行裁判角色调用；没有活动模型时，不做任何裁判评估。 |
| `--no-spotlight` | 不发送 Spotlight 请求，除非活动模型的提供方为 `stencil` 且 `spotlight.url` 为默认值。 |
| `--offline` | 包含上述两项，并将记忆、标题、提交消息、子代理、回退模型、网页搜索、语音、图片生成与描述、图片问答、技能和 MCP 提示、作业组件以及 eval `completion()` 保持在活动模型的提供方上；若某功能在那里没有模型，则跳过或失败。它不是网络防火墙：MCP 服务器和网页抓取仍会对外访问。 |

模型解析参见[提供方](./providers.md)和[模型](./models.md)。

#### 思考与推理 \{#thinking-and-reasoning}

| 标志 | 描述 |
| --- | --- |
| `--thinking <level>` | 设置思考级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` 或 `auto`。 |
| `--hide-thinking` | 在 TUI 输出中隐藏思考块（仅影响显示；不禁用模型思考）。 |
| `--print-thoughts` | 在打印模式文本输出中包含思考块。 |
| `--external-thinking` | 使用私有草稿区，同时禁用受支持的 GPT/Claude/Gemini 推理。风险自负：提供方已将这种请求形式标记为滥用。 |

#### 预演与计划模式 \{#prewalk-and-plan-modes}

| 标志 | 描述 |
| --- | --- |
| `--prewalk` | 在第一个符合条件的编辑/写入轮次准备一次性交接，`todo` 活跃时以成功的 todo 调用为前提（默认关闭）。参见[预演](./prewalk.md)。 |
| `--no-prewalk` | 即使设置了 `prewalk.enabled` 也禁用预演，并将 `prewalk.auto` 排除在启动会话之外；与 `--prewalk`/`--prewalk-into` 不兼容。 |
| `--prewalk-into <id-or-role>` | 使用此目标而非 `smol` 角色准备预演。 |
| `--plan-yolo` | 以只读计划模式启动，自动批准模型的计划提案，然后切换到执行目标来实现它。 |
| `--plan-yolo-into <id-or-role>` | plan-yolo 执行的目标模型（默认为 `smol` 角色）；要求 `--plan-yolo`。 |
| `--goal <objective>` | 在目标模式下启动全新交互式会话，并开始处理目标，无需输入 `/goal`。要求 `goal.enabled`；仅限交互式模式。绕过 `autoResume`，与位置提示、`@file` 或 stdin 输入、`--resume`/`--continue`/`--fork`/导入、`--plan-yolo`、`--no-tools` 或启动计划模式（`plan.defaultOnStartup`）同时使用时会被拒绝。 |

#### 工具、批准与运行时 \{#tools-approvals-and-runtime}

| 标志 | 描述 |
| --- | --- |
| `--tools <a,b,c>` | 要启用的工具的逗号分隔列表（默认：设置中启用的工具；设置关闭的工具仍保持关闭）。 |
| `--no-tools` | 将会话限制为 `--tools` 中指定的内置工具（未指定则没有工具）。不加载任何其他内容：没有 MCP 服务器、LSP、扩展（包括扩展注册的提供方和钩子）、自定义工具、记忆后端、自动学习、Auto-QA 或 IRC。子代理继承该限制。目标和计划模式不可用。不能与 `--extension`、`--hook` 或 `--trusted-extension` 组合。 |
| `--no-lsp` | 禁用 LSP 工具、格式化和诊断。 |
| `--no-pty` | 禁用基于 PTY 的交互式 bash 执行。 |
| `--approval-mode <mode>` | 为此会话覆盖 `tools.approvalMode`（`always-ask`、`always-ask-cached`、`write` 或 `yolo`）。参见[批准模式](./approval-mode.md)。 |
| `--auto-approve`, `--yolo` | 强制使用 yolo 层级批准；显式工具/用户策略和提供方安全检查仍然适用。 |
| `--advisor` | 启用顾问运行时（被动审查每轮并注入笔记）。参见[顾问 / 看门狗](./advisor-watchdog.md)。 |
| `--wait-async` | 打印模式：退出前等待本次运行的后台作业，并在同一会话中以每个结果启动另一轮（`async.printWake`）。参见[无界面 / 打印模式](#headless--print-mode)。 |
| `--max-time <duration>` | 在此时长后停止会话（例如 `600`、`10m`、`1h`）。 |
| `--motion <mode>` | 动画预设：`full`（默认）、`reduced`（250 毫秒旋转指示器，无微光或闪烁/淡入淡出）或 `none`（静态旋转指示器和标题）。流式文本不受影响；参见 `--max-fps`。为本次运行覆盖 `tui.motion` 和 `PI_MOTION`。 |
| `--spinner-interval <ms>` | 旋转指示器帧之间的毫秒数，包括终端标题（默认为 `80`，终端标题为 `250`；`0` = 静态）。为本次运行覆盖 `tui.spinnerInterval` 和 `PI_SPINNER_INTERVAL`。 |
| `--max-fps <n>` | 每秒重绘帧数上限（默认为 `30`；`1`-`120`），包括流式文本；按键回显保持 30 fps。为本次运行覆盖 `tui.maxFps` 和 `PI_MAX_FPS`。 |
| `--prepaint <mode>` | 在启动完成前绘制输入编辑器，使键入立即生效：`on`（默认）在另一个标志或 `--config`/`PI_CONFIG_FILES` 覆盖层会改变该帧时跳过，`off` 从不提前绘制，`force` 始终提前绘制。 |
| `--warn-cost <usd>` | 会话开销（包括子代理）达到此美元金额时警告一次。覆盖 `session.warnCost`。 |
| `--max-cost <usd>` | 会话开销达到此美元金额后停止发送模型请求；已在途的请求可能使开销超过它。覆盖 `session.maxCost`。 |

#### 扩展、钩子、技能与规则 \{#extensions-hooks-skills-and-rules}

| 标志 | 描述 |
| --- | --- |
| `--extension <path>`, `-e <path>` | 加载扩展（可重复）。参见[扩展](./extensions.md)。 |
| `--hook <path>` | 加载钩子/扩展文件（可重复）。参见[钩子](./hooks.md)。 |
| `--trusted-extension <abs-path>` | 现有绝对模块文件的精确允许列表（可重复）；禁用环境扩展发现和包根目录子发现。不能与 `--extension`/`-e`/`--hook` 组合。 |
| `--plugin-dir <dir>` | 将本地插件目录添加到发现中（可重复）。 |
| `--no-extensions` | 禁用扩展、自定义工具和自定义命令模块发现（显式 `-e` 路径仍可使用）。 |
| `--skills <globs>` | 用于过滤[技能](./skills.md)的逗号分隔 glob 模式（例如 `git-*,docker`）。 |
| `--no-skills` | 禁用技能发现和加载。 |
| `--no-rules` | 禁用规则发现和加载。参见[上下文文件](./context-files.md)。 |
| `--no-context-files` | 禁用工作目录和每个 `--add-dir` 根目录的[上下文文件](./context-files.md)（`AGENTS.md`、`CLAUDE.md` 等）。子代理继承此设置。 |

#### 系统提示 \{#system-prompt}

| 标志 | 描述 |
| --- | --- |
| `--system-prompt <text\|file>` | 纯文本系统提示覆盖项（默认：编码助手提示）。参见[系统提示自定义](./system-prompt-customization.md)。 |
| `--system-prompt-template <path>` | 严格将 `<path>` 作为 Handlebars 系统提示模板读取；与 `--system-prompt` 互斥。参见[系统提示自定义](./system-prompt-customization.md)。 |
| `--append-system-prompt <text\|file>` | 将纯文本或文件内容追加到系统提示。 |

#### 输出模式 \{#output-mode}

| 标志 | 描述 |
| --- | --- |
| `--mode <mode>` | 输出/传输模式：`text`（默认）、`json`、`rpc`、`acp` 或 `rpc-ui`。参见[输出模式](#output-modes---mode)。 |
| `--print`, `-p` | 以非交互方式处理提示并退出。 |
| `--no-ui` | 使用 `rpc`/`rpc-ui` 时，使扩展以无界面方式运行，但不禁用 rpc-ui 工具 UI。 |

#### 信息 \{#information}

| 标志 | 描述 |
| --- | --- |
| `--help`, `-h` | 显示 `omp` 或子命令的帮助并退出。 |
| `--version`, `-v` | 打印已安装版本并退出。 |

### 无界面 / 打印模式 \{#headless--print-mode}

`--print` / `-p` 以非交互方式运行 `omp`：处理提示，将
最后的助手回复写入 stdout，然后退出而不进入 TUI。文本
输出在轮次完成后发出，而非逐 token 输出；`Working...`
指示器写入 stderr。这是脚本与自动化的入口。

```sh
# Print the answer and exit
omp -p "Summarize the changes in the last commit"

# Include the model's thinking blocks in the printed text
omp -p --print-thoughts "Explain your reasoning for this refactor"

# Machine-readable output for pipelines
omp -p --mode json "List every TODO in src/" > todos.json

# Pipe a prompt via stdin
echo "review this diff" | omp -p
```

无界面运行的相关标志：

- `--print-thoughts`：在打印文本输出中包含思考块。
- `--mode json`：发出结构化事件，而非渲染后的文本。
- `--no-title`：跳过标题自动生成（也可使用 `PI_NO_TITLE`）。
- `--max-time <duration>`：限制运行时长。
- `--wait-async`：为后台作业保持运行活动（见下文）。
- `--warn-cost <usd>` / `--max-cost <usd>`：达到某个开销时警告，或从该开销起停止发送模型请求。

打印模式默认是一次性的：提示得到回答后便释放
会话，这会取消运行启动的后台作业（模型异步运行的 `bash` 或 `task`
调用）。使用 `--wait-async`（或
`async.printWake: true`）时，它会改为等待这些作业；每个作业的结果会像
在 TUI 中一样交付给同一会话，启动另一轮，而一轮
可以启动更多作业（或回传消息的子智能体）。运行结束时进程
退出，即没有流式传输，也没有任何剩余内容能恢复
它，文本模式会打印最后一轮的答案。使用 `--max-time`
限制无人值守运行。

```sh
# Start a long build in the background, then react to its result in the same session
omp -p --wait-async --max-time 2h "Run the integration suite in the background and fix what fails"
```

`--mode json` 先发出会话头，再以 JSON 行发出事件。
增量 `message_update` 事件省略完整的部分消息快照；完成的
消息通过 `message_end` 到达，不透明的提供方重放载荷会被省略。
终止性轮次失败在文本和 JSON 模式中都会产生非零退出状态。
因 `--max-cost` 停止的运行以状态 `3` 退出：上限消息写入
stderr（JSON 模式中为 `cost-gate` 通知），不打印答案。

`plan.defaultOnStartup` 在打印模式下会被忽略，因为没有计划审阅
UI。使用 `--plan-yolo` 进行无人值守的规划和实现。

[顾问 / 看门狗](./advisor-watchdog.md#headless-runs)文档描述了
启用顾问运行时后打印模式的释放语义。

### 输出模式（`--mode`） \{#output-modes---mode}

| 模式 | 说明 |
| --- | --- |
| `text` | 渲染后的文本。省略 `--mode` 会允许使用 TUI；显式指定 `--mode text` 会选择非交互式文本输出。 |
| `json` | 以换行符分隔的 JSON 事件流，供无界面运行或机器使用；`-p` 可选。 |
| `rpc` | 通过 stdio 传输的逐行 JSON 命令、响应和事件（不是 JSON-RPC 2.0）。参见 [RPC](./rpc.md)。 |
| `rpc-ui` | 启用了 UI 扩展事件的 RPC 传输。 |
| `acp` | 通过 stdio 运行的 Agent Client Protocol 服务器。等同于 [`acp`](#subcommands) 子命令；参见[审批模式 → ACP 会话](./approval-mode.md#acp-sessions)。 |

`--no-ui`（配合 `--mode rpc` 或 `--mode rpc-ui`）会以无界面方式运行扩展：`ctx.hasUI` 为 `false`，扩展对话框使用默认值完成解析，扩展的展示更新会被丢弃。在 `rpc-ui` 中，`ask` 等工具 UI 仍会发送 `extension_ui_request` 帧供宿主响应。宿主发起的 `login` UI 不受影响。参见 [RPC 启动](./rpc.md#startup)。

## 子命令 \{#subcommands}

运行 `omp <command> --help` 查看各命令自己的标志和示例。

| 命令 | 用途 | 另请参阅 |
| --- | --- | --- |
| `launch` | 启动编码会话（默认命令）。 | [启动标志](#launch-flags) |
| `acp` | 将 omp 作为通过 stdio 通信的 ACP（Agent Client Protocol）服务器运行。 | [审批模式](./approval-mode.md#acp-sessions) |
| `auth-broker` | 管理 omp auth-broker（凭据保险库）。 | [认证代理 / 网关](./auth-broker-gateway.md) |
| `auth-gateway` | 运行 auth-gateway：由已配置的代理支持的 HTTP 正向代理（`serve`），或者为使用你自己凭据的父进程在 stdin/stdout 上传输 JSON 行（`stdio`）。 | [认证代理 / 网关](./auth-broker-gateway.md) |
| `agents` | 管理内置任务智能体。 | [任务智能体发现](./task-agent-discovery.md) |
| `bench` | 对模型进行基准测试：比较 TTFT/预填充与解码吞吐量，给出聊天、预填充、生成和提示缓存工作负载的 p50/p95，并在实时仪表盘中展示（`--prefill-bytes` 设置合成预填充输入的大小）。`--detailed` 为每个模型运行单用户、`--par` 路并行（聚合 tok/s 和扩展能力）以及预填充阶段。 |  |
| `browser-relay` | 运行 Eval 的浏览器 API 所用的本地 CDP 中继，以操控你自己的 Chrome 标签页。 | [计算机使用](./computer-use.md) |
| `cleanse` | 使用加权并行子代理检测并修复项目诊断问题。 |  |
| `collab` | 列出活跃的本地 Collab 宿主，不暴露 URL；`collab link <instanceId\|pid>` 获取控制链接（`--view` 获取只读链接）。 | [协作](./collab.md) |
| `clip` | 将 `/record` 录制上传至 live.omp.sh，作为公开片段，并打印其 URL。 |  |
| `commit` | 生成提交消息并更新变更日志。 |  |
| `completions` | 打印 shell 补全脚本（bash、zsh 或 fish）。 |  |
| `compress` | 将文本文件改写为密集提示语体，并报告删去了哪些内容。 |  |
| `config` | 管理配置设置。 | [配置用法](./config-usage.md)、[设置](./settings.md) |
| `dry-balance` | 使用随机会话 ID 试运行 OAuth 账户均衡。 |  |
| `find` | 通过语义搜索查找实现文件和行范围。 |  |
| `gc` | 运行存储垃圾回收。 |  |
| `grep` | 从 CLI 测试 grep 工具。（[`grep` 工具](./tools/grep.md)是独立的智能体工具。） |  |
| `gallery` | 在确定性的展示库中预览工具、输入编辑器和状态行渲染器。 |  |
| `git` | 交互式全屏 git UI：分栏差异查看器、暂存侧栏和提交编辑器。 |  |
| `grievances` | 查看、清理或推送已报告的工具问题（自动 QA 问题报告）。 |  |
| `if-bench` | 对指令遵循和工作记忆进行基准测试：在一个缓存线程中执行字形数组操作，并让一条猫叫指令在提示中移动。 |  |
| `images`, `img` | 检查、诊断、探测和清除图像发布后端。 |  |
| `install` | 安装或链接扩展包（`plugin install` / `plugin link` 的别名）。 | [扩展](./extensions.md) |
| `join` | 加入共享的协作会话（等同于 `/join`）。 | [协作](./collab.md) |
| `login` | 从终端登录模型提供方（对应 `/login`）。 |  |
| `models` | 列出、搜索和刷新可用模型。 | [模型](./models.md) |
| `plugin`, `plugins` | 管理插件（安装、卸载、列出等）。 | [扩展](./extensions.md)、[市场](./marketplace.md) |
| `play` | 在终端重放 `/record` 录制；空格键暂停，`q` 退出。 |  |
| `predict` | 比较各单词补全引擎针对提示给出的实时幽灵文本。 |  |
| `ps` | 列出并控制由守护进程监管的后台进程（日志、停止、终止、重启）。 |  |
| `say` | 使用本地 TTS 引擎合成文本，并通过扬声器播放。 | [tts 工具](./tools/tts.md) |
| `share` | 通过加密链接共享已保存的会话（等同于 `/share` 斜杠命令）。 | [会话操作](./session-operations-export-share-fork-resume.md) |
| `setup` | 运行入门设置，或安装可选功能的依赖项。 |  |
| `shell` | 交互式 shell 控制台。 |  |
| `read` | 显示 read 工具针对某个路径、URL 或内部 URI 将返回的内容。（[`read` 工具](./tools/read.md)是独立的智能体工具。） |  |
| `render` | 通过生产环境的会话记录流水线绘制会话的整个线程（含重绘计时）。 |  |
| `skill`, `skills` | 在 skills.omp.sh 上安装、搜索、发布和管理技能。 | [技能](./skills.md) |
| `ssh` | 管理 SSH 主机配置。 |  |
| `stats` | 查看用量统计。 |  |
| `stream` | 将本地 OMP 会话画面和聊天广播到公开直播频道。 |  |
| `update` | 检查并安装更新；`--canary`/`--stable` 切换发布渠道。 |  |
| `usage` | 显示每个已认证账户的提供方用量限制，并标记即将过期的已保存重置；`usage clients` 按客户端细分 token 消耗（支持 `--days`），`usage invalidate` 丢弃缓存报告，`usage accounts` 列出每个 OAuth 账户的提供方和身份键（即键 `task.agentAccountPools` 及代理账户池所接受的键；不含 token，支持 `--json`），`usage reset` 按 `<provider>/<credential id>` 列出每个 Codex 和 Claude 账户已保存的速率限制重置（`--json`、`--redact`），而 `usage reset <provider>/<credential id>` 消耗其中一次重置，也可从 auth-broker 客户端执行。 | [任务智能体发现](./task-agent-discovery.md#model-and-structured-output-precedence)、[已保存的重置](./settings.md#saved-reset-auto-consumption) |
| `tiny-models` | 下载用于会话标题、记忆和单词补全的微型本地模型。 | [本地模型](./local-models.md) |
| `token` | 获取提供方的 API 密钥或 OAuth token。 | [秘密](./secrets.md) |
| `toks` | 使用内置离线分词器计算文件或文本的 token 数。 |  |
| `ttsr` | 检查和测试 Time-Traveling Stream Rules（TTSR）。（这里介绍 CLI 命令；[TTSR 功能](./ttsr-injection-lifecycle.md)另有文档。） |  |
| `worktree`, `wt` | 添加、列出或清理 git 工作树；启用时采用先克隆的行为。 |  |
| `search`, `q`, `web-search` | 从 CLI 测试网页搜索提供方。 | [web_search 工具](./tools/web_search.md) |

> `install`、`join`、`browser-relay`、`auth-gateway` 和 `tiny-models` 也可
> 通过相关机制调用（`plugin` 命令、`/join` 斜杠
> 命令等）。表中按各命令在
> `packages/coding-agent/src/cli-commands.ts` 中的注册方式列出。

`__complete` 是 shell 补全脚本使用的内部隐藏子命令。

### 工作树克隆 \{#worktree-clones}

启用 `worktree.clone` 后，`omp worktree add` 和其他采用先克隆方式的
工作树调用方会携带可重定位的已忽略缓存，例如 `node_modules`。
包含 `pyvenv.cfg` 或 `CMakeCache.txt` 的目录不会被携带，
即使它们是嵌套目录或自行设置了忽略规则。在新工作树中重新创建 Python 环境和
CMake 构建树，让其中的绝对路径指向新的
检出目录。被排除目录内的受跟踪文件会从 Git 恢复；
保留更改时，其源目录中的实时内容和暂存状态都会保留。

干净克隆还会在写入目标提交的树和索引后，丢弃已携带文件中按目标
提交自身忽略规则判定为未跟踪的文件。
被目标忽略的缓存会保留，即使源目录未忽略它们。嵌套
仓库会保留，符号链接不会被跟随。保留源目录的未提交更改时，
会跳过这一步按目标忽略规则执行的清理。

除此之外，每个已忽略文件都会被携带，而非局限于构建缓存：`.env` 文件、
本地凭据、`key.properties` 等签名配置，以及编辑器或工具
状态，都会以独立副本的形式出现在新工作树中。这些副本不会
跟随源检出目录的后续更改，而试图
链接共享文件的 `post-checkout` 钩子会发现该位置已有普通文件。没有
按路径排除的列表；设置 `worktree.clone: false`，即可改用
普通检出来创建工作树。
