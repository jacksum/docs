---
title: "命令行参考"
description: "Oh My Pi v19.1.1 仓库文档：命令行参考。"
---

# CLI 参考 \{#cli-reference}

`omp` 的调用方式如下：

```sh
omp [command] [flags] [messages...]
```

如果第一个位置参数**不是**已注册的子命令，`omp` 通常会转交给默认命令 [`launch`](#launch-the-default-command)。因此，`omp "fix the build"` 会以这条消息启动会话，而 `omp models` 会运行 `models` 子命令。单独使用 `marketplace`、`uninstall` 或 `extensions` 等插件管理词时，会提示改用 `omp plugin …`；若想把这样的词用作提示词，请使用 `omp launch <word>`。

已识别的子命令可以跟在启动参数之后。前置参数会转发给 `launch` 和 `acp`，但对其他子命令，已识别的仅限启动时使用的前置参数会被移除，不会生效（例如 `omp --cwd dir update`）。

`--profile` 在路由到子命令前生效，因此也决定 `config`、`models` 和 `update` 等命令使用哪个配置档案。

还可以在命令行查看帮助：

- `omp --help` 列出面向用户的子命令和常用启动参数。
- `omp <command> --help` 显示该命令的公开参数和示例。

本页集中介绍共用的**启动接口**（即 `omp` / `omp launch` 接受的参数）和每个顶级**子命令**。各子命令的专用参数（例如 `omp auth-broker --json`）见相应命令的 `--help`。

## 启动（默认命令） \{#launch-the-default-command}

`omp` 和 `omp launch` 都会启动编码会话。位置参数用作初始消息：

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

参数处理规则：

- `@<path>` 将文件或图片附加到初始消息。
- 在协议模式之外，OMP 会自动从非 TTY 的 stdin 读到 EOF，将读到的内容用作提示词；不要加 `-` 标记。省略 `--mode` 时，管道输入或非 TTY 的 stdin 会选用打印模式。如果 stdin 没有文本，就要通过命令行参数提供提示词或附件。
- stdin 文本、文本附件和第一条位置消息会合并为初始提示词，其余位置消息会在后续轮次发送。
- `--` 结束参数解析；其后所有内容均按原样作为消息文本，即使看起来像参数。

### 启动参数 \{#launch-flags}

#### 会话与工作区 \{#session-and-workspace}

| 参数 | 说明 |
| --- | --- |
| `--cwd <dir>` | 启动目录，覆盖调用命令时的当前工作目录。 |
| `--add-dir <dir>` | 在当前工作目录之外添加一个工作区目录（可重复指定）。 |
| `--allow-home` | 允许在 `~` 下启动，不自动切换到临时目录。 |
| `--profile <name>` | 使用隔离的配置档案存放认证信息、会话、设置和缓存。 |
| `--alias <name>` | 为指定名称的配置档案创建 shell 快捷命令后退出；需要 `--profile` 或 `OMP_PROFILE`。 |
| `--config <file>` | 为本次运行额外加载一个 `config.yml` 格式的覆盖配置（可重复指定）。 |
| `--session-dir <dir>` | 存储和查找会话的目录。 |
| `--no-session` | 不保存会话（临时会话）。 |

#### 会话历史 \{#session-history}

| 参数 | 说明 |
| --- | --- |
| `--continue`, `-c` | 继续上一个会话。 |
| `--resume [id]`, `-r`, `--session [id]` | 按 ID 前缀或路径恢复会话；不提供值时打开选择器。 |
| `--restore [id]` | 像 `--resume` 一样恢复会话，再继续上一个进程崩溃或被终止时尚未完成的工作：中断的轮次和当时正在运行的子代理。仅限交互模式；不接受提示词。见[会话操作](./session-operations-export-share-fork-resume.md#cli---restore)。 |
| `--fork <session>` | 从已保存的会话（按 ID 前缀或路径指定）派生新会话。见[会话操作](./session-operations-export-share-fork-resume.md)。 |
| `--from-claude` | 将 Claude Code 会话导入 OMP。 |
| `--from-codex` | 将 Codex 会话导入 OMP。 |
| `--export <session>` | 将会话文件导出为 HTML 后退出。 |
| `--no-title` | 禁用标题自动生成（等同于 `PI_NO_TITLE` [环境变量](./environment-variables.md)）。 |

`--continue`、`--resume`、`--restore`、`--fork` 和外部会话导入都需要持久化，不能使用 `--no-session`。`--from-claude` 和 `--from-codex` 互斥，且不能与 `--continue`、`--resume` 或 `--fork` 组合使用。

#### 模型选择 \{#model-selection}

| 参数 | 说明 |
| --- | --- |
| `--model <id-or-role>` | 指定要使用的模型或已配置的角色（角色：`slow` 或 `@slow`；模糊匹配模型：`opus`、`gpt-5.2`；指定模型提供方时，ID 必须精确匹配：`openai/gpt-5.2`）。 |
| `--smol <id>` | 用于轻量任务的小型或快速模型（也可使用 `PI_SMOL_MODEL`）。 |
| `--slow <id>` | 用于深入分析的慢速或推理模型（也可使用 `PI_SLOW_MODEL`）。 |
| `--plan <id>` | 用于架构规划的计划模型（也可使用 `PI_PLAN_MODEL`）。 |
| `--models <a,b,c>` | 用逗号分隔的模型匹配模式，供 `Ctrl+P` 循环切换。 |
| `--provider <name>` | 要使用的模型提供方（旧参数，建议用 `--model`）。 |
| `--api-key <key>` | API 密钥（默认从环境变量读取）。 |
| `--provider-session-id <id>` | 复用指定的模型提供方侧会话 ID，以延续会话并限定缓存范围。 |
| `--prompt-cache-key <key>` | 覆盖本会话在模型提供方侧使用的提示词缓存键。 |
| `--service-tier <tier>` | OpenAI 服务层级：`none`、`auto`、`default`、`flex`、`scale`、`priority` 或 `ultrafast`（`none` 表示省略 `service_tier`）。 |

模型解析规则见[模型提供方](./providers.md)和[模型](./models.md)。

#### 思考与推理 \{#thinking-and-reasoning}

| 参数 | 说明 |
| --- | --- |
| `--thinking <level>` | 设置思考级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max` 或 `auto`。 |
| `--hide-thinking` | 在 TUI 输出中隐藏思考块（只影响显示，不禁用模型思考）。 |
| `--print-thoughts` | 在打印模式的文本输出中包含思考块。 |
| `--external-thinking` | 使用私有草稿区，同时在受支持的情况下关闭 GPT、Claude、Gemini 的推理。使用风险自行承担：模型提供方曾将这种请求形式标记为滥用。 |

#### Prewalk 与计划模式 \{#prewalk-and-plan-modes}

| 参数 | 说明 |
| --- | --- |
| `--prewalk` | 预备在第一个符合条件的编辑或写入轮次进行一次性交接。启用 `todo` 时，必须先有一次成功的待办工具调用。Prewalk 默认关闭。见 [Prewalk](./prewalk.md)。 |
| `--no-prewalk` | 即使设置了 `prewalk.enabled`，也禁用 Prewalk，并阻止 `prewalk.auto` 在启动会话中生效；不能与 `--prewalk`/`--prewalk-into` 同用。 |
| `--prewalk-into <id-or-role>` | 预备 Prewalk，并使用指定的交接目标代替 `smol` 角色。 |
| `--plan-yolo` | 以只读的计划模式启动，自动批准模型提出的计划，再切换到执行目标来实施。 |
| `--plan-yolo-into <id-or-role>` | plan-yolo 执行使用的目标模型（默认使用 `smol` 角色）；需要 `--plan-yolo`。 |
| `--goal <objective>` | 以目标模式启动新的交互会话并开始处理目标，无须输入 `/goal`。需要 `goal.enabled`；仅限交互模式。此参数跳过 `autoResume`，且不能与位置参数形式的提示词、`@file` 或 stdin 输入、`--resume`/`--continue`/`--fork`/导入、`--plan-yolo`、`--no-tools` 或启动时的计划模式（`plan.defaultOnStartup`）同用。 |

#### 工具、审批与运行时 \{#tools-approvals-and-runtime}

| 参数 | 说明 |
| --- | --- |
| `--tools <a,b,c>` | 用逗号分隔的待启用工具列表（默认使用设置中已启用的工具；设置中已禁用的工具仍保持禁用）。 |
| `--no-tools` | 禁用所有内置工具。 |
| `--no-lsp` | 禁用 LSP 工具、格式化和诊断。 |
| `--no-pty` | 禁用基于 PTY 的交互式 bash 执行。 |
| `--approval-mode <mode>` | 覆盖本会话的 `tools.approvalMode`（`always-ask`、`always-ask-cached`、`write` 或 `yolo`）。见[审批模式](./approval-mode.md)。 |
| `--auto-approve`, `--yolo` | 强制使用 yolo 级审批；显式工具策略、用户策略和模型提供方的安全检查仍然生效。 |
| `--advisor` | 启用 Advisor 运行时，被动审查每个轮次并插入备注。见 [Advisor / Watchdog](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/advisor-watchdog.md)。 |
| `--wait-async` | 打印模式：退出前等待本次运行的后台任务，并将各个结果送回同一会话，各开启一个新轮次（`async.printWake`）。见[无界面模式 / 打印模式](#headless--print-mode)。 |
| `--max-time <duration>` | 达到指定时长后停止会话（例如 `600`、`10m`、`1h`）。 |
| `--motion <mode>` | 动画预设：`full`（默认）、`reduced`（转圈指示器每 250 毫秒更新，无流光、闪烁或淡入淡出）或 `none`（转圈指示器和标题静止）。不影响流式文本；见 `--max-fps`。覆盖本次运行的 `tui.motion` 和 `PI_MOTION`。 |
| `--spinner-interval <ms>` | 转圈指示器的帧间隔，单位为毫秒，包含终端标题中的指示器（默认 `80`，`0` 表示静止）。覆盖本次运行的 `tui.spinnerInterval` 和 `PI_SPINNER_INTERVAL`。 |
| `--max-fps <n>` | 重绘的每秒帧数上限（默认 `30`，范围为 `1`-`120`），流式文本也受此限制；按键回显保持 30 fps。覆盖本次运行的 `tui.maxFps` 和 `PI_MAX_FPS`。 |
| `--warn-cost <usd>` | 会话开销达到指定美元金额时警告一次，子代理开销计入其中。覆盖 `session.warnCost`。 |
| `--max-cost <usd>` | 会话开销达到指定美元金额后停止发送模型请求；已发出但尚未完成的请求可能使开销超过上限。覆盖 `session.maxCost`。 |

#### 扩展、钩子、技能和规则 \{#extensions-hooks-skills-and-rules}

| 参数 | 说明 |
| --- | --- |
| `--extension <path>`, `-e <path>` | 加载扩展（可重复指定）。见[扩展](./extensions.md)。 |
| `--hook <path>` | 加载钩子或扩展文件（可重复指定）。见[钩子](./hooks.md)。 |
| `--trusted-extension <abs-path>` | 仅加载白名单中明确指定的已有模块文件，路径必须为绝对路径（可重复指定）。禁用常规扩展自动发现，也不从包根目录进一步发现扩展。不能与 `--extension`/`-e`/`--hook` 同用。 |
| `--plugin-dir <dir>` | 将本地插件目录加入发现范围（可重复指定）。 |
| `--no-extensions` | 禁用扩展发现（用 `-e` 显式指定的路径仍然有效）。 |
| `--skills <globs>` | 用逗号分隔的 glob 模式，用于筛选[技能](./skills.md)（例如 `git-*,docker`）。 |
| `--no-skills` | 禁用技能发现和加载。 |
| `--no-rules` | 禁用规则发现和加载。见[上下文文件](./context-files.md)。 |
| `--no-context-files` | 禁用[上下文文件](./context-files.md)（`AGENTS.md`、`CLAUDE.md` 等），适用于工作目录及每个 `--add-dir` 根目录。子代理继承此设置。 |

#### 系统提示词 \{#system-prompt}

| 参数 | 说明 |
| --- | --- |
| `--system-prompt <text\|file>` | 使用纯文本覆盖系统提示词（默认使用编码助手提示词）。见[自定义系统提示词](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md)。 |
| `--system-prompt-template <path>` | 严格将 `<path>` 作为 Handlebars 系统提示词模板读取；与 `--system-prompt` 互斥。见[自定义系统提示词](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md)。 |
| `--append-system-prompt <text\|file>` | 将纯文本或文件内容追加到系统提示词。 |

#### 输出模式 \{#output-mode}

| 参数 | 说明 |
| --- | --- |
| `--mode <mode>` | 输出或传输模式：`text`（默认）、`json`、`rpc`、`acp` 或 `rpc-ui`。见[输出模式](#output-modes---mode)。 |
| `--print`, `-p` | 非交互地处理提示词后退出。 |
| `--no-ui` | 与 `rpc`/`rpc-ui` 搭配时让扩展以无界面方式运行，但不禁用 rpc-ui 的工具界面。 |

#### 信息 \{#information}

| 参数 | 说明 |
| --- | --- |
| `--help`, `-h` | 显示 `omp` 或子命令的帮助后退出。 |
| `--version`, `-v` | 输出已安装的版本后退出。 |

### 无界面模式 / 打印模式 \{#headless--print-mode}

`--print` / `-p` 使 `omp` 以非交互方式运行：处理提示词，将助手的最后一条回复写入 stdout，然后退出，不进入 TUI。文本在轮次结束后一次性输出，不逐 token 输出；`Working...` 指示信息会写入 stderr。这是脚本和自动化的入口。

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

无界面运行的相关参数：

- `--print-thoughts`：在打印的文本输出中包含思考块。
- `--mode json`：输出结构化事件，而不是渲染后的文本。
- `--no-title`：跳过标题自动生成（也可使用 `PI_NO_TITLE`）。
- `--max-time <duration>`：限制运行时长。
- `--wait-async`：让进程继续运行以等待后台任务（见下文）。
- `--warn-cost <usd>` / `--max-cost <usd>`：开销达到指定金额时发出警告，或停止发送模型请求。

默认情况下，打印模式只运行一次：提示词得到回复后，会话即被释放，由此取消本次运行启动的后台任务（模型异步执行的 `bash` 或 `task` 调用）。使用 `--wait-async`（或 `async.printWake: true`）时，打印模式会改为等待这些任务。每个任务的结果都会像在 TUI 中一样送回同一会话，开启一个新轮次；该轮次可能启动更多任务，或启动会发回消息的子代理。运行结束时，也就是没有内容正在流式输出且没有任何事项可以让运行恢复时，进程会退出；文本模式会输出最后一个轮次的回复。无人值守运行时，可用 `--max-time` 限制时长。

```sh
# Start a long build in the background, then react to its result in the same session
omp -p --wait-async --max-time 2h "Run the integration suite in the background and fix what fails"
```

`--mode json` 输出会话头部，随后以 JSON Lines 格式输出事件。增量 `message_update` 事件不包含未完成消息的完整快照；完整消息通过 `message_end` 送达，不透明的模型提供方重放载荷也会省略。轮次最终失败时，文本模式和 JSON 模式都会以非零状态退出。因 `--max-cost` 停止的运行以状态码 `3` 退出：开销上限消息写入 stderr（JSON 模式中为 `cost-gate` 通知），且不会输出回复。

打印模式没有计划审阅界面，因此会忽略 `plan.defaultOnStartup`。无人值守地规划和实施时，请使用 `--plan-yolo`。

[Advisor / Watchdog](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/advisor-watchdog.md#headless-runs) 说明了启用 Advisor 运行时，打印模式如何释放会话。

### 输出模式（`--mode`） \{#output-modes---mode}

| 模式 | 说明 |
| --- | --- |
| `text` | 渲染后的文本。省略 `--mode` 时可以使用 TUI；显式指定 `--mode text` 时则使用非交互式文本输出。 |
| `json` | 以换行分隔的 JSON 事件流，用于无界面运行或机器读取；可省略 `-p`。 |
| `rpc` | 通过 stdio 传输逐行分隔的 JSON 命令、响应和事件（并非 JSON-RPC 2.0）。见 [RPC](./rpc.md)。 |
| `rpc-ui` | 启用扩展 UI 事件的 RPC 传输。 |
| `acp` | 通过 stdio 提供 Agent Client Protocol 服务。等同于 [`acp`](#subcommands) 子命令；见[审批模式 → ACP 会话](./approval-mode.md#acp-sessions)。 |

`--no-ui`（与 `--mode rpc` 或 `--mode rpc-ui` 同用）让扩展以无界面方式运行：`ctx.hasUI` 为 `false`，扩展对话框使用默认值作为结果，扩展的界面显示更新会被丢弃。在 `rpc-ui` 中，`ask` 等工具的界面仍发送 `extension_ui_request` 帧，等待宿主响应。由宿主发起的 `login` 界面不受影响。见 [RPC 启动](./rpc.md#startup)。

## 子命令 \{#subcommands}

运行 `omp <command> --help` 查看各命令的专用参数和示例。

| 命令 | 用途 | 另见 |
| --- | --- | --- |
| `launch` | 启动编码会话（默认命令）。 | [启动参数](#launch-flags) |
| `acp` | 通过 stdio 将 omp 作为 ACP（Agent Client Protocol）服务器运行。 | [审批模式](./approval-mode.md#acp-sessions) |
| `auth-broker` | 管理 omp 的 auth-broker（凭据保险库）。 | [认证代理 / 网关](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md) |
| `auth-gateway` | 运行 auth-gateway：作为由已配置的认证代理提供支持的 HTTP 正向代理（`serve`）；或使用你自己的凭据，通过 stdin/stdout 以 JSON Lines 为父进程提供服务（`stdio`）。 | [认证代理 / 网关](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md) |
| `agents` | 管理随附的任务代理。 | [任务代理发现](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/task-agent-discovery.md) |
| `bench` | 对模型做基准测试：针对聊天、预填充、生成和提示词缓存负载，比较首 token 时间（TTFT）/预填充与解码吞吐量，给出 p50/p95，并在实时面板中呈现结果（`--prefill-bytes` 设置合成预填充输入的大小）。`--detailed` 针对每个模型分别运行单用户测试、`--par` 路并行测试（衡量总 tok/s 和扩展性），以及预填充测试。 | |
| `browser-relay` | 运行 Eval 浏览器 API 使用的本地 CDP 中继，以操作你自己的 Chrome 标签页。 | [计算机操作](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/computer-use.md) |
| `cleanse` | 使用带权重的并行子代理检测并修复项目中的诊断问题。 | |
| `collab` | 列出活动的本地 Collab 宿主，不显示 URL；`collab link <instanceId\|pid>` 获取控制链接（用 `--view` 获取仅查看链接）。 | [Collab](./collab.md) |
| `clip` | 将 `/record` 录制内容作为公开片段上传到 live.omp.sh，并输出其 URL。 | |
| `commit` | 生成提交消息并更新变更日志。 | |
| `completions` | 输出 shell 补全脚本（bash、zsh 或 fish）。 | |
| `compress` | 将文本文件改写为紧凑的提示词文体，并报告删去了哪些内容。 | |
| `config` | 管理配置项。 | [配置用法](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/config-usage.md)、[设置](./settings.md) |
| `dry-balance` | 使用随机会话 ID 试跑 OAuth 账号均衡分配。 | |
| `find` | 通过语义搜索查找实现文件和行范围。 | |
| `gc` | 对存储执行垃圾回收。 | |
| `grep` | 从 CLI 测试 grep 工具。（[`grep` 工具](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/grep.md)是独立的代理工具。） | |
| `gallery` | 在展示结果固定的预览页中查看工具、输入区和状态行的渲染效果。 | |
| `git` | 交互式全屏 Git 界面：并排差异视图、暂存侧栏和提交消息编辑区。 | |
| `grievances` | 查看、清理或推送已报告的工具问题（自动 QA 反馈）。 | |
| `if-bench` | 测试指令遵循和工作记忆能力：使用一条已缓存的字形数组操作线程，让一条关于猫叫声的指令在提示词中移动。 | |
| `images`, `img` | 检查、诊断、探测和清理图片发布后端。 | |
| `install` | 安装或链接扩展包（`plugin install` / `plugin link` 的别名）。 | [扩展](./extensions.md) |
| `join` | 加入共享的 Collab 会话（等同于 `/join`）。 | [Collab](./collab.md) |
| `login` | 从终端登录模型提供方（对应 `/login`）。 | |
| `models` | 列出、搜索和刷新可用模型。 | [模型](./models.md) |
| `plugin`, `plugins` | 管理插件（安装、卸载、列出等）。 | [扩展](./extensions.md)、[插件市场](./marketplace.md) |
| `play` | 在终端重放 `/record` 录制内容；Space 暂停，`q` 退出。 | |
| `predict` | 比较各单词补全引擎针对同一提示词实时显示的淡色建议文本。 | |
| `ps` | 列出和控制由守护进程监管的后台进程（查看日志、停止、强制终止、重启）。 | |
| `say` | 使用本地 TTS 引擎将文本合成为语音，并通过扬声器播放。 | [tts 工具](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/tts.md) |
| `share` | 通过加密链接共享已保存的会话（等同于 `/share` 斜杠命令）。 | [会话操作](./session-operations-export-share-fork-resume.md) |
| `setup` | 运行初始设置，或安装可选功能的依赖项。 | |
| `shell` | 交互式 shell 控制台。 | |
| `read` | 显示 read 工具针对路径、URL 或内部 URI 会返回什么。（[`read` 工具](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/read.md)是独立的代理工具。） | |
| `render` | 使用正式的会话记录渲染流程绘制整个会话线程（含重绘计时）。 | |
| `skill`, `skills` | 在 skills.omp.sh 上安装、搜索、发布和管理技能。 | [技能](./skills.md) |
| `ssh` | 管理 SSH 主机配置。 | |
| `stats` | 查看用量统计。 | |
| `stream` | 将本地 OMP 会话的画面和聊天内容播送到公开直播频道。 | |
| `update` | 检查并安装更新；`--canary`/`--stable` 切换发布频道。 | |
| `usage` | 显示所有已认证账号在各模型提供方的用量上限，并标记即将过期的已保存重置机会；`usage clients` 按客户端细分 token 消耗（使用 `--days`），`usage invalidate` 清除缓存的报告，`usage accounts` 列出每个 OAuth 账号的模型提供方和标识键（`task.agentAccountPools` 和认证代理的账号池使用此键；不显示令牌，支持 `--json`），`usage reset` 按 `<provider>/<credential id>` 列出每个 Codex 和 Claude 账号已保存的速率限制重置机会（`--json`、`--redact`），而 `usage reset <provider>/<credential id>` 会用掉一次重置机会，也可以从 auth-broker 客户端执行。 | [任务代理发现](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/task-agent-discovery.md#model-and-structured-output-precedence)、[已保存的重置机会](./settings.md#saved-reset-auto-consumption) |
| `tiny-models` | 下载用于会话标题、记忆和单词补全的微型本地模型。 | [本地模型](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/local-models.md) |
| `token` | 获取指定模型提供方的 API 密钥或 OAuth 令牌。 | [机密信息](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/secrets.md) |
| `toks` | 使用内嵌的离线分词器统计文件或文本的 token 数量。 | |
| `ttsr` | 检查和测试 Time-Traveling Stream Rules（TTSR）。（此处介绍 CLI 命令；[TTSR 功能](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/ttsr-injection-lifecycle.md)另有文档。） | |
| `worktree`, `wt` | 添加、列出或清理 Git 工作树；启用时采用优先克隆方式。 | |
| `search`, `q`, `web-search` | 从 CLI 测试网页搜索提供方。 | [web_search 工具](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/web_search.md) |

> `install`、`join`、`browser-relay`、`auth-gateway` 和 `tiny-models` 也可通过相关途径调用（如 `plugin` 命令、`/join` 斜杠命令等）。表中各项按在 `packages/coding-agent/src/cli-commands.ts` 中注册的形式列出。

`__complete` 是供 shell 补全脚本使用的内部隐藏子命令。

### 工作树克隆 \{#worktree-clones}

启用 `worktree.clone` 时，`omp worktree add` 和其他按优先克隆方式运行的工作树调用方会带上 `node_modules` 等可迁移且被 Git 忽略的缓存。包含 `pyvenv.cfg` 或 `CMakeCache.txt` 的目录不会被带过去，即使这些目录处于嵌套位置，或按自身的忽略规则被忽略。请在新工作树中重建 Python 环境和 CMake 构建树，让其中的绝对路径指向新的检出目录。排除目录中的已跟踪文件会从 Git 恢复；保留改动时，这些文件在源工作树中的当前内容和暂存状态会一并保留。

对于干净克隆，写入目标提交的工作树和索引后，还会按目标提交自身的忽略规则，丢弃带过来却未被跟踪且未被忽略的文件。目标忽略的缓存会保留，即使源工作树没有忽略它们。嵌套仓库会保留，且不会跟随符号链接。保留源工作树中未提交的改动时，则跳过这一步按目标忽略规则执行的清理。
