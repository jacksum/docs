---
title: "Bash 工具运行时"
description: "Oh My Pi 官方仓库文档：Bash 工具运行时。"
---

# Bash 工具运行时 \{#bash-tool-runtime}

本文介绍智能体工具调用使用的 **`bash` 工具**运行时路径，涵盖命令规范化、执行、截断/产物和渲染。

本文也指出交互式 TUI、打印模式、RPC 模式和用户发起的感叹号（`!`）shell 执行之间的行为差异。

## 范围与运行时接口 \{#scope-and-runtime-surfaces}

coding-agent 中有两种不同的 bash 执行接口：

1. **工具调用接口**（`toolName: "bash"`）：模型调用 bash 工具时使用。
   - 入口：`BashTool.execute()`。
   - 参数包括 `command`、可选的 `timeout`、`pty`，以及在 `async.enabled` 为 true 时的 `async`。启用 `launch.enabled`（默认 `true`）时，`name` 和 `ready` 选择托管服务执行。两者任一启用时都会提供 `notify`。没有面向模型的 `env` 参数。
2. **用户感叹号命令接口**（来自交互输入的 `!cmd` 或 RPC `bash` 命令）：会话级辅助路径。
   - 入口：`AgentSession.executeBash()`。

两者最终都使用 `src/exec/bash-executor.ts` 中的 `executeBash()` 进行非 PTY 执行，但只有工具调用路径运行规范化/拦截、可选的托管后台作业处理和工具渲染器逻辑。

在设置中将 `bash.enabled: false` 可从活动工具注册表移除面向模型的 `bash` 工具。这不会禁用用户发起的感叹号命令或 RPC `bash` 请求。

## 端到端工具调用流水线 \{#end-to-end-tool-call-pipeline}

## 1) 输入处理与模式选择 \{#1-input-handling-and-mode-selection}

`BashTool.execute()` 当前按以下方式处理输入：

- 去除服务名称两端的空白，并规范化空就绪字段，
- 将开头单行的 `cd <path> && ...` 提取为工作目录，除非路径需要 shell 展开，
- 将没有服务名称的非空白 `notify` 正则表达式视为 `async: true`，并在 `async.enabled` 为 false 时拒绝这两者，
- 在运行任何内容前，拒绝无法编译的 `notify` 正则表达式，或无法接收其通知的会话，
- 将带服务名称的 `notify` 传给启动代理服务，由其报告匹配的服务输出，
- 将有限命令的 `timeout` 默认为 300 秒；`0` 显式禁用命令截止时间，
- 在命名服务模式下忽略 `async: true` 和任何提供的 `timeout`，并分别添加一条通知；就绪检查使用 `ready.timeout`，
- 没有非空白 `name` 时忽略 `ready`，并添加通知。

没有结构化的 `head` 或 `tail` 参数。命令文本绝不会因内部 URL 而被重写。嵌入式 shell 及其进程内 coreutils 在每次操作时，通过注入的异步文件系统（`InternalUrlFilesystem`）解析 `scheme://` 路径，因此通过变量、重定向、glob 构造的 URL，以及通过 `cd` 进入 URL 都能工作。基于文件的协议操作其底层文件，从这类协议到宿主路径执行 `ln -s` 时会存储底层文件的路径；渲染型资源为只读。外部程序无法看到该文件系统，因此程序路径、每个参数（`skill://example-skill/tool.py`、`--index=skill://example-skill/data`）以及派生程序时使用的工作目录，都会转换为它们所映射的文件。转换只涵盖整个参数和 `--option=URL` 值；单独的协议根（`local://`）、后接词语的根（`skill:// external command`），以及嵌入其他文本的 URL 都保持字面值，文件系统不路由的协议（`https://`、`s3://`）和指向不映射文件的协议的参数（`omp://`、`history://`）也保持字面值。提供方拒绝的 URL（未知技能、越出其根目录的路径）会使命令失败，并显示提供方的错误。外部程序不能在不映射文件的协议中启动，也不能在只读协议（`skill://`）中启动，因为子进程可写入其工作目录下的任何位置；除此之外，只读限制只对内置命令执行，因此拿到已转换只读路径的外部程序仍能写入它。`xargs`、`find -exec`/`-execdir` 和 `ifne` 会在子 shell 中通过 shell 自身的分发机制运行其命令，因此 `… | xargs cat` 会到达进程内的 `cat` 及其 URL 参数。有限命令路由还会加载配置的 direnv/devenv 变更。执行器的 SDK 调用方可提供 `env` 覆盖层；bash 工具本身使用 shell 赋值设置每条命令的变量。

### 审批策略 \{#approval-policy}

bash 工具的审批级别为 `exec`。`bash.patterns` 规则可显式指定 `allow`、`deny` 或 `prompt`。默认情况下，允许规则必须匹配整条命令，且不能批准 shell 控制语法。选择启用 `bash.allowCompoundCommands: true` 后，还会识别由未加引号的 `&&` 分隔、包含两个或更多字面命令的扁平链。它会针对每个原始文本片段独立解析有序规则，每个片段以第一个匹配规则为准。

对于 `allow` 规则，只有当 `NAME` 与 `bash.allowedEnvVars` 或规则的 `env` 列表中的某个条目完全匹配时，才剥离开头的 `NAME=value` 赋值；`deny` 和 `prompt` 规则同时检查带有和不带有开头赋值的分词片段。

整条链上的限制会保守合并（不符合条件的复合命令的分词片段之间也如此）：任何显式片段级或整链级 `deny` 优先，否则任何显式 `prompt` 优先。匹配完整链但不匹配任何单独片段的 `deny` 或 `prompt` 模式仍作为整链限制，而后续宽泛限制不会覆盖某个片段较早的匹配。来自 `Settings.grantAuthority()` 的操作者 `deny` 规则也优先于项目层的 `bash.patterns`。这些限制在现有的原始文本和规范化关键命令检查之前解析。

扫描整链限制时，拒绝优先，即使匹配的提示规则更早出现也如此。集中式的正向 shell 分类器只允许对已知采用 POSIX 引号规则的 shell（`sh`、`bash`、`dash`、`ash`、`ksh` 和 `zsh`，包括 `.exe` 名称）识别复合命令。Cmd、PowerShell、fish 和未知 shell 保留旧版审批行为；仅支持使用 `-c` 执行，并不能证明其引号规则兼容。

完成这些检查后，只有每个片段都显式解析为 `allow` 时，链才会获得显式的 `write` 级允许。如果任何片段未匹配，bash 保留其独立的 `exec` 级别，且没有显式策略，因此通用审批解析器会先应用 `tools.approval.bash`，再应用活动模式。因此，未匹配的片段继承现有策略，而不是始终提示。

接受带字面引号的参数，但展开、赋值、其他控制运算符、重定向、glob、换行、格式错误的语法，以及改变 shell 状态的内置命令（`cd`、`source`、`eval` 等）不符合条件。这些输入保留旧版审批行为。关键破坏性操作和远程获取后执行的检查仍会检查完整的原始和规范化输入及其片段，因此获准的前缀不能隐藏后续关键片段。审批不会重写执行内容：shell 接收原始命令，保留原生 `&&` 短路行为。

模式审批并不是隔离机制。一旦获准，进程就保留 shell 原有的文件系统、网络和子进程访问权限。拦截与审批也是独立机制：拦截将误用路由到专用工具；审批决定是否允许继续执行。

这些规则**只适用于 `bash` 工具**。它们不约束通过其他工具启动的 shell，尤其是 `eval`，它可通过子进程派生 shell（`subprocess.run(["bash", "-c", ...])`、`Bun.$` 等）。因此，通过 `eval` 发出相同命令时，`bash.patterns` 的 `deny` 规则不起作用。若要在这两种接口上强化对破坏性命令的防护，请将 `bash.patterns` 与 `tools.approval.eval` 策略（`prompt` 或 `deny`）配合使用；参见[工具审批模式](./approval-mode.md)。

## 2) 可选拦截（阻止命令路径） \{#2-optional-interception-blocked-command-path}

如果 `bashInterceptor.enabled` 为 true（默认 `false`），`BashTool` 会加载 `bashInterceptor.patterns`，并针对命令运行 `checkBashInterception()`；当原始形式与 cwd 规范化形式（提取开头的 `cd … &&` 之后）不同时，两种形式都会检查。规则语法不变：每条规则先检查完整输入，再检查由未加引号/未转义的 `&&`、`||`、`;`、`|`、`|&`、`&` 或换行分隔的原始扁平命令片段，然后检查移除开头 `NAME=value` 赋值后的片段。接收来自 `|` 或 `|&` 的管道标准输入的片段会从片段候选项中排除，包括跨越空白/注释续行的情况，因为消费标准输入的阶段不能由基于路径的专用工具替代。

拦截行为：

- **只有**以下条件都成立时才阻止命令：
   - 正则表达式规则匹配，且
   - 建议的工具存在于 `ctx.toolNames` 中。
- 静默跳过无效的正则表达式规则。
- 阻止时，`BashTool` 抛出 `ToolError`，消息包含：
   - `Blocked: ...`
   - 原始命令。
- heredoc、参数展开、命令替换、反引号、分组和格式错误的引号不会产生额外片段；它们只保留完整输入检查。拦截是尽力而为的专用工具路由，不是 shell 安全策略。

默认规则模式（在代码中定义）针对常见误用：

- 文件读取器（`cat`、`head`、`tail`、...）
- 搜索工具（`grep`、`rg`、...）
- 文件查找器（`find`、`fd`、...）
- 原地编辑器（`sed -i`、`perl -i`、`awk -i inplace`）
- shell 重定向写入（`echo ... > file`、heredoc 重定向）
- 非托管后台语法及常见服务/监听器/调试器（建议使用带 `name` 的 `bash`）

命名服务调用会省略建议工具为 `bash` 的规则，因此服务命令不会拦截自身。

### 注意事项 \{#caveat}

`InterceptionResult` 包含 `suggestedTool`，但 `BashTool` 当前只呈现消息文本（`details` 中没有结构化的建议工具字段）。

## 3) CWD 验证与超时解析 \{#3-cwd-validation-and-timeout-resolution}

提取出的宿主 `cd` 目标会相对于会话 cwd 解析，并通过文件系统 `stat` 验证。可识别的内部 URL 目标会通过 `InternalUrlFilesystem` 规范化并验证；嵌入式 shell 进入该目标，而服务或 pty 命令的 shell 进程先在会话 cwd 中启动，再从那里进入该目标。虚拟 cwd 会跳过客户端终端路由。

- 路径不存在 -> `ToolError("Working directory does not exist: ...")`
- 不是目录 -> `ToolError("Working directory is not a directory: ...")`

默认超时为 300 秒。`timeout: 0` 禁用截止时间。其他值限制在 `[1, 3600]` 秒内，并受正值 `tools.maxTimeout` 上限约束；请求值和解析值不同时，会记录限制通知以及这两个值。

## 4) 产物分配 \{#4-artifact-allocation}

本地有限命令执行会尽力分配产物路径/ID，用于存储被截断的输出；托管作业在作业内部分配。服务日志使用代理服务，而客户端终端输出改用最终内联上限恢复路径。

- 产物分配失败不是致命错误（执行继续，但没有产物溢出文件），
- 产物 ID/路径传入执行路径，以便在截断时持久保存完整输出。

## 5) PTY 与非 PTY 执行选择 \{#5-pty-vs-non-pty-execution-selection}

PTY 资格由 `canUseInteractiveBashPty(pty, ctx)`（`src/tools/bash-pty-selection.ts`）决定；只有以下条件全部满足，本地 PTY 叠加界面才会运行：

- 工具输入 `pty === true`
- `PI_NO_PTY !== "1"`
- 工具上下文具有 UI（`ctx.hasUI === true` 且已设置 `ctx.ui`）

如果请求了 `pty` 但不可用，调用会回退到非 PTY，并追加 `pty requested but unavailable …` 通知。

pty 命令作为 shell 进程（`src/exec/shell-process.ts`）运行：使用工具配置档案的嵌入式引擎在独立进程中运行，作为叠加界面伪终端的主进程，因此其程序拥有该终端（`/dev/tty`、终端信号、调整大小）。它以会话 shell 的导出变量、函数和别名为起点，其 `local://`（包括溢出文件）、`skill://` 和 `attachment://` 路径解析到会话的宿主文件；那里没有其他协议。

在本地 PTY/非 PTY 选择之前，前台（`async: false`）调用可路由到托管后台作业（自动后台化，见下文），或者在会话客户端声明终端能力（`clientBridge.capabilities.terminal` + `createTerminal`，且 `pty` 为 false）时，路由到远程运行命令的**客户端桥接编辑器终端**（流式发送 `terminalId` 更新，超时时终止，将信号终止映射为退出码 `137`）。否则使用非交互式 `executeBash()`。

打印模式以及无 UI 的 RPC/工具上下文不能使用本地交互式叠加界面。命名服务具有由代理服务拥有的独立 PTY，不需要 TUI。

## 托管服务执行 \{#managed-service-execution}

非空白 `name` 会在有限命令超时、async、终端或输出接收器选择之前路由到 `startService()`。

- 名称长度为 1-48 个字符：以字母或数字开头，后接字母、数字、点、下划线或连字符。名称作用域为项目代理服务；启动已有的在线名称会替换该进程。
- 服务也作为 shell 进程运行（使用工具配置档案的嵌入式引擎，由代理服务启动），使用配置的 shell 前缀，继承会话 shell 的导出变量、函数和别名，外加 `PI_SESSION_ID`/`PI_SESSION_FILE`/`PI_TOOL_CALL_ID`。其 `local://`（包括溢出文件）、`skill://` 和 `attachment://` 路径解析到所属会话的宿主文件；那里没有其他协议。
- `pty` 默认为 `true`；不设命令截止时间。
- `ready` 必须包含日志正则表达式或 TCP 端口（1-65535）。两者都提供时，两者都必须通过。TCP 主机默认为 `127.0.0.1`；就绪超时默认为 30 秒，并限制在 0.05-3600 秒内。
- 没有就绪条件时，启动返回正在运行的服务。有就绪条件时，启动会等待就绪、退出或达到就绪截止时间。就绪超时会被报告，但不会停止进程。排队中的引导消息会提前结束就绪等待：调用返回 `starting`，服务继续启动。
- 新服务使用会话生命周期（开启 `launch.persist` 时持久运行，打印、RPC 和 ACP 模式始终设置此项），不自动重启，也不脱离。完成通知关联到所属会话。
- `read proc://<name>` 检查状态和日志；`write proc://<name>` 发送输入（空内容发送 Enter），`write proc://<name>/kill` 停止服务，`/mode` 接受 `persist`、`session` 或 `detached`。

结果携带 `details.service`（`name`、`state`、`ready`、`timedOut`、可选的 `pid`），而不是有限命令超时/async 元数据。

### `o2ctl services` shell 命令 \{#the-o2ctl-services-shell-command}

在允许启动服务时，嵌入式 shell 还具有 `o2ctl` 命令（`src/launch/o2ctl-command.ts`，每次运行时随会话工具命令安装）。其 `services` 命名空间访问与 `name` 相同的项目级注册表；其他所有 `o2ctl` 命名空间均保留：

- `o2ctl services add <name> <pid|%job>` 将已经运行的进程（`cmd &`、`nohup cmd &`）接管为服务 `<name>`，而不重启它（`adoptService()`；守护进程的 `open` 携带 `adopt: <pid>`）。`%job` 规格指向调用 shell 中运行某个程序的作业（shell 随请求传递该程序的 PID，就像 `jobs -x` 会替换它一样）。服务归会话所有，持有方式与启动的服务相同（会话生命周期，或在 `launch.persist` 下持久运行）；它绝不会被重启。守护进程像对待脱离服务一样按 PID 监视它，当其标准输出（否则为标准错误）是普通文件（`nohup.out`、`> log`）时，该文件会被链接为服务输出日志，因此 `read proc://<name>` 和服务输出视图会显示它。名称属于在线服务、PID 不是该用户的在线进程，或它已经是某个服务的进程时会失败。
- `o2ctl services ls` 列出项目的服务（`listServices()`）；`o2ctl services stop <name>` 停止一个服务（`stopService()`）。停止接管的服务时，先向其进程树发送 SIGTERM，再向其整个进程家族发送 SIGKILL；不向其进程组发送信号，因为它不一定是进程组组长。
- 此命令只存在于嵌入式 shell 中，不存在于 `pty` 命令、服务自身的 shell 或用户 shell 中。

## 非交互式执行引擎（`executeBash`） \{#non-interactive-execution-engine-executebash}

## Shell 会话复用模型 \{#shell-session-reuse-model}

`executeBash()` 在进程全局映射中缓存原生 `Shell` 实例，键由以下部分组成：

- shell 路径，
- 配置的命令前缀，
- 快照路径，
- 序列化的 shell 环境，
- 可选的智能体会话键，
- 最小化器配置。

会话级感叹号命令执行会传递执行开始时捕获的会话 ID，在分支或会话切换期间保持结果归属。

工具调用执行在可用时传递 `sessionKey: this.session.getSessionId?.()`，包括在自动后台化路径上以前台方式启动的调用，因此变量、函数和 shell 选项在调用之间延续。一开始就在后台运行的托管作业（`async: true` 或不进行前台等待）改用每个作业专属的 `<session>:async:<jobId>` 键，因此绝不会占用会话的 shell。在两种接口中，会话键都按会话隔离 shell 复用；没有会话键时，复用回退到 shell 配置/快照/环境。
并发调用绝不会共享同一个 `Shell`：原生会话一次运行一条命令，`Shell.abort()` 会终止其上所有正在执行的运行。`executeBash()` 在 `shellSessionsInUse` 中跟踪正在使用的键；某个键忙碌时，重叠调用跳过缓存，改为在该会话 shell 的一次性 `Shell.fork()` 中运行，其初始状态为正在运行的命令开始前的状态。派生 shell 的运行结束后，`executeBash()` 将其交给 `Shell.adopt()`：它设置的内容（变量、函数、别名、选项、trap；不包括工作目录或哈希表）会在会话 shell 当前命令结束时（空闲时立即）合并回会话 shell，并带入之后的每个派生 shell；双方都设置的名称保留最后结束的命令所设的值。如果派生 shell 留下正在运行的后台作业，它会像已释放的会话一样在作业运行期间保留。`BashResult.fork` 报告这两种情况；`BashTool` 只在状态无法合并回来或后台作业仍留在派生 shell 中时添加通知。移入后台的调用会保持占用会话 shell，直到完成。只有所属调用会在其 `finally` 中释放使用中标志或删除缓存的会话。

`exit`、errexit（`set -e`）以及意外出现的顶层 `return`/`break` 会结束命令，而非原生会话；超时、取消或运行失败会隔离该会话，下一次调用会启动新的会话。

调用会保留其启动时的会话 ID，即使 shell 启动前会话发生变化也是如此。离开会话（新建、派生新会话、切换、分支）会释放其 shell，而来自已离开会话、仍在运行或等待的命令会在结束时丢弃其 shell（`isSessionCurrent`），因此返回该会话时会启动新的 shell。

一个会话可拥有多个 shell 缓存条目：需要独立 shell 状态的接口传递带命名空间的键 `<label>:<session id>`（`/loop` 条件使用 `loop-condition:<id>`），而 bash 工具使用不加修饰的会话 ID。释放会话会丢弃所有这些条目；如果 shell 在命令仍运行时被释放，该命令结束后仍会保留任何在线后台作业。只有标识符形状的标签直接后接已释放会话 ID 才算命名空间，因此每个作业的 `<session>:async:<jobId>` 键和 cwd 作用域键不受影响。

## 原生 shell 可视化 \{#native-shell-visualization}

`omp-shell` 负责 Raw/Pseudo 生成、静态分析、源映射、回放归约和最后设置者注解。它在单元编译时保留实际解析器的 `List`、`Command` 和 `Word` 节点；算术格式化使用引擎现有的算术解析器。此路径中没有第二套 TypeScript AST，也没有 shfmt 转换。

- **增量式：**只有引擎已公布的语法才会以 Pseudo 呈现。未编译的源文本保持字面形式；创建或呈现待执行的 `RunTrace` 不会提前解析。
- **实时：**执行器在发布每个不可变快照前，会将它附加到其实际的原生 `RunTrace`。`RunTrace.present(options)` 借用原生语法/历史；UI 不会在每次更新时序列化并重新加载 AST。
- **存储：**`ShellVisualization(snapshotJson)` 一次性恢复持久保存的跟踪。规范语法使用引擎自身 AST 和解析器上下文的版本化、缓存 base64 归档。不支持的归档版本会明确失败。没有归档的旧版跟踪只通过原生解析器恢复其已公布的单元。
- **渲染器：**ANSI 和 Tern 消费相同的语义行。TypeScript 负责偏好设置、输入分发和回放时钟，不负责 shell 解释。Tern 既不接收语法归档，也不接收执行日志。
- **标识：**源令牌的 `node` 键和 UTF-16 范围驱动选择/源链接。`executionNode` 标识实际拥有某个令牌结果和完成状态的命令，因此参数共享一个失败标记和 500 毫秒尾迹。键保留原生单元/源/节点标识；渲染器将其视为不透明值。
- **出处：**值遵循真实设置者和回放游标。未经证实的局部绑定标识明确保持未知；函数进入事件不能证明动态作用域变量的所有者。

引擎内子执行，包括字面 `eval`，使用实际编译器来源。外部操作系统 shell 和 SSH 仍为外部/未跟踪状态：字面正文可以带此标签显示，但绝不会获得虚构的内部结果、变量或输出。可视化不改变可执行文件解析。

普通 Bash 卡片仍为中性的分段命令/输出/页脚框。Raw/Pseudo 和菜单位于其第一行代码；回放控件属于检查器。`original` 行只为 Pseudo 拆分生成，正常实时输出仍来自现有输出接收器；显式回放游标使用原生捕获的输出。

## 内置 `jq` 兼容性 \{#bundled-jq-compatibility}

除非 `PI_DISABLE_UUTILS_BUILTINS` 为真值，否则非 PTY 原生 shell 会注册内置的进程内 `jq` 命令，而非系统 `jq`。其行为如同 jq 1.8.2：相同的选项、语法、内置功能、输出字节、错误消息和退出状态（`jq --version` 输出 `jq-1.8.2`），并通过 jq 1.8.2 自身的测试套件（`tests/*.test`，也可通过 `--run-tests` 运行）。它基于 [jaq](https://github.com/01mf02/jaq) 的 crate 构建，以 vendored 形式引入，并为 jq 语义打补丁（`crates/vendor/jaq-*`）。设置该标志会禁用进程内 uutils 命令集，并回退到系统二进制文件；使用路径（`/usr/bin/jq`）可对单条命令运行系统 `jq`。

与 jq 1.8.2 的已知差异：`--debug-trace` 不输出字节码，无界递归（`def f: 1 + f; f`）会以 `filter recursion too deep` 失败，而不是耗尽内存；jq 从 C 库获取的数学内置函数（`gamma`、`lgamma`、`j0`、…）可能在最后一位数字上与其不同。

## Shell 配置、direnv 与快照行为 \{#shell-config-direnv-and-snapshot-behavior}

每次调用时，执行器加载设置中的 shell 配置（`shell`、`env`、可选的 `prefix`），并运行 `applyDirenvPreflight()`。

除非 `bash.direnv` 为 `"off"`，否则预检会尝试在 `bash.direnvLoadTimeoutMs` 内加载 cwd 的 direnv/devenv 变更，并额外受正值命令超时约束。direnv 提供的变量合并在显式调用方 `env` 之下；direnv 移除的安全变量会作为 `unset -v ...` 前缀添加。ACP 终端和 PTY 路由在其后端之前运行相同的预检；非 PTY 执行器在内部运行它。每条 `BashTool` 路由都将会话身份（`PI_SESSION_ID`，以及绝对路径形式的 `PI_SESSION_FILE`，未持久保存时为空）和该调用的 `PI_TOOL_CALL_ID` 作为调用方 `env` 传递，在调用开始时与会话 ID 一起读取；它不属于 shell 会话键，因此绝不会启动新的 shell。

预检使用嵌入式 direnv 内置命令，即使 `PI_DISABLE_UUTILS_BUILTINS` 禁用了命令 shell 中的实用工具也是如此。它读取 `.envrc`（或当 `direnv.toml` 中设置 `load_dotenv = true` 时读取 `.env`），不会在 `PATH` 中查找 `direnv`。内置命令遵循 direnv 的 XDG 允许和拒绝文件及配置的白名单；显式拒绝优先。与[上游 direnv](https://github.com/direnv/direnv/blob/master/internal/cmd/rc.go) 一样，`whitelist.prefix` 匹配字符串前缀；以 `/` 结尾可只信任目录内容。通过嵌入式 shell 或常规 direnv 安装中的 `direnv allow` 和 `direnv deny` 管理审批。

求值使用与允许列表核对过的根文件原始字节。在用户 direnv 启动期间替换文件，不会改变运行内容：当前加载使用获准的字节，保留原始 `.envrc` 源名称和工作目录，下一次加载才检查新字节。当 `.env` 为根文件时，也适用相同规则。

标准库包含 `PATH_add`、`dotenv`、`watch_file`、`require_allowed`、`source_env` 和其他 direnv 辅助函数。与 direnv 一样，获准的 `.envrc` 可引用其他脚本，并以你的常规权限运行子进程；审批不是沙箱。`use nix`、`use flake` 和 devenv 仍需要各自的工具，自定义辅助函数可能有自己的依赖。

成功加载的环境按环境文件缓存。进程环境变化、direnv 配置变化和受监视文件变化（包括同一秒内的编辑，以及允许/拒绝文件的删除或创建）都会使缓存失效。预检应用差异，但不改变 OMP 自身的进程环境。

如果所选 shell 包含 `bash`，它会尝试 `getOrCreateSnapshot()`：

- 快照从用户 rc 捕获别名/函数/选项，
- 快照创建采用尽力而为方式，
- 失败时回退为无快照；失败的快照会在 60 秒后重试，或在 rc 文件的修改时间、大小或 shell 环境变化时更早重试。

如果配置了 `prefix`，它会在任何 direnv unset 前缀之后包装命令。

随后，`buildNonInteractiveEnv()`（`src/exec/non-interactive-env.ts`）构建每条命令的子进程环境，将非交互式加固默认值放在调用方和 direnv 覆盖项**之下**：

- 禁用分页器（`PAGER=cat`、`GIT_PAGER=cat`、… 及 `LESS=FRX`），
- 禁用编辑器提示（`GIT_EDITOR=true`、`GIT_SEQUENCE_EDITOR=true`、`EDITOR=true`、`VISUAL=true`），
- 减少终端/凭据提示（`TERM=dumb`、`GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=never`、`SSH_ASKPASS` 设置为解析得到的 `false` 可执行文件或 `"false"`、`NO_COLOR=1`、`CI=true`，除非设置了 `PI_BASH_NO_CI`/`CLAUDE_BASH_NO_CI`），
- 为非交互行为设置包管理器/工具自动化标志（npm/pnpm/yarn/pip/cargo/terraform/gh、…），
- 将区域设置固定为 `LANG=C.UTF-8`/`LC_ALL=C.UTF-8`（字节顺序排序、`C` 数字和消息、UTF-8 文本），覆盖任何继承的区域设置，除非调用方或 direnv 环境设置了 `LANG` 或某个 `LC_*` 变量；macOS 不提供 `C.UTF-8`，因此在那里 `LANG` 和每个 `LC_*` 类别均为 `C`，但 `LC_CTYPE=en_US.UTF-8` 除外，且 `LC_ALL` 为空；用户 `!` 命令保留继承的区域设置，只在 Windows 上未设置任何区域设置时应用 UTF-8 默认值，
- 在 Windows 上，当 `PYTHONIOENCODING`、`PYTHONUTF8` 两者都未继承或传入时，添加 Python UTF-8 标准输入输出默认值。

## 流式传输与取消 \{#streaming-and-cancellation}

`Shell.run()` 将数据块流式传给 `OutputSink` 和可选的 `onChunk` 回调。

取消：

- 中止信号触发 `shellSession.abort(...)`，
- 来自原生结果的超时映射为 `cancelled: true` + 注解文本，
- 显式取消同样返回 `cancelled: true` + 注解。
- 在 POSIX 上，取消非 PTY 运行时会向其拥有的进程组和后代发送 TERM，最多允许一秒清理，再升级为 KILL；Windows 会终止进程，不提供可捕获的 TERM 信号。

执行器内部不会因超时/取消抛出异常；它返回结构化 `BashResult`，由调用方映射错误语义。

## 交互式 PTY 路径（`runInteractiveBashPty`） \{#interactive-pty-path-runinteractivebashpty}

启用 PTY 时，工具运行 `runInteractiveBashPty()`，打开叠加控制台组件并驱动原生 `PtySession`。

行为要点：

- xterm-headless 虚拟终端在叠加界面中渲染视口，
- 键盘输入会规范化（包括 Kitty 序列和应用光标模式处理），
- 运行期间按 `esc` 会终止 PTY 会话，
- 终端大小调整会传播到 PTY（`session.resize(cols, rows)`）。

与非 PTY 引擎不同，交互式 PTY 路径**不**应用非交互式加固。Rust 侧以进程的原生环境为起点，并将收到的环境作为覆盖项；Bun 的 `process.env` 写入绝不会到达该基础环境，因此传给 PTY 的是 shell 派生环境（`getShellConfig().env`）去掉其非交互式防护（`GIT_EDITOR`、`GPG_TTY`、`CI`）和 `NO_COLOR` 后的环境，然后设置真实的 `TERM=xterm-256color`，使编辑器、分页器和 TUI 的行为如同普通终端，最后应用优先于前两者的 direnv 值。省略的键保留继承值。

PTY 输出会规范化（`CRLF`/`CR` 转为 `LF`、`sanitizeText`）并写入 `OutputSink`，包括产物溢出支持。

PTY 启动/运行时出错时，接收器会收到 `PTY error: ...` 行，命令以未定义的退出码结束。

## 输出处理：流式传输、截断、产物溢出 \{#output-handling-streaming-truncation-artifact-spill}

PTY 和非 PTY 路径都使用 `OutputSink`。

## OutputSink 语义 \{#outputsink-semantics}

bash 执行器使用来自设置的 `headBytes` 和 `maxColumns` 构建接收器（`resolveOutputSinkHeadBytes` / `resolveOutputMaxColumns`）。

- 使用 UTF-8 安全边界，将内联正文保持在 `spillThreshold`（`DEFAULT_MAX_BYTES`，默认 50 KiB）之内，
- 当 `headBytes > 0`（`tools.artifactHeadBytes`，默认 20 KiB）时，在同一预算内保留一个**头部**窗口，将剩余空间用于滚动**尾部**；头部保留量上限为总预算的一半，`dump()` 会在需要时插入中间省略标记，
- 每行列数上限：当 `maxColumns > 0`（`tools.outputMaxColumns`，默认 768 字节）时，过宽的行会在写入时用省略号截断，并丢弃该行其余部分，
- 跟踪已见总字节数/行数，
- 当输出溢出、列数上限导致字节被丢弃，或文件已经处于活动状态时，将经过清理但未施加上限的文本流镜像到产物文件；产物文件上限为 `tools.artifactMaxBytes`（默认 16 MB：前 3 MB 加滚动尾部，通过 `[ARTIFACT TRUNCATED: …]` 通知连接；`0` = 无界），
- 在尾部溢出、中间省略、列数上限丢弃或文件溢出时标记 `truncated`。

`dump()` 返回：

- `output`（可能带注解前缀），
- `truncated`，
- `totalLines/totalBytes`，
- `outputLines/outputBytes`，
- 中间部分被省略时的 `elidedBytes/elidedLines`，
- 每行上限触发时的 `columnDroppedBytes/columnTruncatedLines`，
- 每行上限触发时的 `columnMax`，
- 捕获成功时的 `artifactId`，
- 产物 I/O 失败时的 `artifactError`（`open`、`write`、`flush` 或 `end`）；捕获失败时不提供产物 ID。

### 长输出注意事项 \{#long-output-caveat}

运行时截断在 `OutputSink` 中基于字节阈值执行（默认头尾共享 50 KiB 预算，外加标记文本）。此代码路径不强制设置硬性行数上限。

Kitty 直接图像和 Sixel 帧会在文本清理/截断之前提取，并作为图像内容返回。其控制字节不会作为普通产物文本保留。

### Shell 输出最小化器 \{#shell-output-minimizer}

非 PTY 执行还会将 shell 最小化器设置传入原生 `Shell` 会话。当最小化器重写冗长输出时，执行器只有在原始捕获已另存为独立溢出文件后，才会替换为最小化文本，该文件由 `[raw output: local://<id>.log]` 页脚引用，同时以 `BashResult.minimized` 返回 `{ filter, inputBytes, outputBytes, artifactId }`，工具结果将其保留为 `details.meta.minimized`，渲染器将其显示为 `Minimized` 页脚信息。如果保存未返回产物 ID，则改为保留无损的接收器输出，不记录 `minimized`。

## 实时工具更新与异步作业 \{#live-tool-updates-and-async-jobs}

对于非 PTY 前台执行，`BashTool` 向 `executeBash()` 传递 `onPreview` 回调，在命令运行期间将 `OutputSink` 自身的内联视图（`OutputSink.preview()`）作为 `onUpdate` 快照流式传输；没有单独的部分更新缓冲区。

对于 PTY 执行，实时渲染由自定义 UI 叠加界面处理，而不是通过 `onUpdate` 文本块处理。

当 `async.enabled` 为 true 且调用传递 `async: true` 时，`BashTool` 会立即启动托管 bash 作业，返回带作业 ID 的运行中结果，并通过会话作业管理器存储完成状态。自动后台化（`bash.autoBackground.enabled`，默认 `true`）也可在经过 `bash.autoBackground.thresholdMs`（默认 60,000 毫秒）后使用此路径；PTY 和客户端桥接终端路由会跳过它，作业管理器容量已满时回退到前台执行。排队中的引导消息可让仍在运行的自动后台化候选项提前转入后台。

### 管道流（`proc://<id>/streams`） \{#pipe-streams-procidstreams}

每个托管 bash 作业都向嵌入式 shell 传递原生 `PipeStreams`（`ShellRunOptions.streams`）。引擎将该次运行中写入每个 `|` 管道的字节镜像到每个流的环形缓冲区（最新 1 MiB；一次运行最多保留 16 个流，其中 4 个可为已结束流），而不改变管道语义：背压、EOF，以及提前退出的消费者（`| head`）使生产者失去消费者时的行为，都与普通管道相同（`omp_shell::bash::Host::pipe_tap`、`crates/shell/src/bash/mem.rs`、`crates/shell/src/taps.rs`）。`read proc://<id>/streams` 列出这些流（流 `n` 是阶段 `n` 读取的内容），`proc://<id>/streams/<n>` 返回已解码、已清理的文本，因此即使 `tail` 暂扣着 `cmd` 的输出，也可跟踪 `cmd | tail -5`。这些流随作业行保留，直到它被逐出。用户 shell（zsh/fish）和 PTY 运行不会被旁路采集，每个阶段的标准错误仍进入作业自身的输出。

### 作业小组件 \{#job-widgets}

Bash 作业会注册 `widgetInputs`（`src/job-widgets/`）：一个由作业输出块供给的 `out` 来源、每个管道流对应的一个 `pipe:<n>` 来源，以及一份简述（命令和该调用的 `i` 意图）。当一个已显示的作业运行满 15 秒且有输出后，`widget` 模型角色（解析方式类似 `smol`；请求出错时，会转向该角色的下一个有凭据模型，候选来自 `retry.fallbackChains.widget`，否则来自内置 `smol` 默认值，每次尝试都计入费用上限）会编写一份声明式规格：行规则（通过原生 `LineMatcher` 运行的线性时间 Rust 正则表达式），其中各命名组为同名字段供值（数字，或当它是规则的 `text` 组、或捕获内容不含数字时为文本；`key` 将规则字段拆分为序列，`count` 统计匹配行数），以及最多四个块（带目标线的柱状图、按键条形图、仪表、统计、状态网格、文本）。请求只携带作业中互不相同的样本行（每个来源头部和尾部的每种行形状最多三条），除共享系统提示词和模式外不缓存任何内容。子代理的作业（其 `tools` 来源和其自身作业的来源）只有在完成探针指定 `watch` 提示后才会被描述：读取和编辑代码的子代理没有能显示进度的输出。编写者可用 `{"skip": "<why>"}` 拒绝，这会让作业不带小组件（任务作业在其 `watch` 提示变化后会再次被询问）。规格安装前，会先验证并对样本试运行（按数字读取的字段必须捕获数字；任何规则都不得读取子代理工具调用的 `» <tool> <intent>` 标记；常量仪表 `total` 或迷你图 `target` 必须是命令、任务或输出中明示的数字）；常见疏漏会在本地修复，而不消耗重试（裁短过长的标题或标签，将没有已知总量的仪表改为统计，丢弃指向模式中不存在组的 `key` 或 `text`，或者在模式没有组时捕获整个匹配），剩余错误通过一次重试反馈；出现漂移（规则来源上有 200 行未匹配且数据过期）或子代理迟来的 `watch` 提示时会重新编写，每个作业最多三个请求。之后，每次刷新只读取新字节，对每个来源上读取它的规则运行一次原生匹配（列式结果：匹配行、规则和捕获范围），将匹配归并到有界的每字段序列，并在本地重新计算 `JobWidgetView`；`snapshotJobs` 将其附加到 `JobSnapshot.widget`，由 `wait` 卡片、HUD 作业胶囊（及其 `hovercard`）和作业面板渲染。`async.widgets` 可关闭此功能。

## 结果整形、元数据与错误映射 \{#result-shaping-metadata-and-error-mapping}

执行后：

1. 取消或缺少退出状态会抛出工具错误。客户端桥接
   终端路由还会在结构化结果
   整形前对超时抛出 `ToolError`。
2. 本地非 PTY 和交互式 PTY 超时会返回错误结果，并设置
   `details.timedOut = true`，使渲染器能将其与
   普通失败区分。
3. 空输出变为 `(no output)`。
4. 最终内联字节上限保护绕过 `OutputSink` 的路由；可用时复用接收器产物，否则保存 `bash-original` 产物。
5. 从接收器摘要附加截断元数据。
6. 非零退出返回带 `details.exitCode` 的错误结果；零退出返回成功。

结果详情还可包含已解析/请求的超时、`timeoutDisabled`、客户端 `terminalId`、实际耗时、异步作业状态和截断元数据。截断包括方向/原因、总计和已显示的行/字节数量、显示范围，以及持久保存成功时的 `artifactId`。

内置工具包装会自动追加面向模型的恢复通知，例如 `Read local://<id>.log for full output`。

## 渲染路径 \{#rendering-paths}

## 工具调用渲染器（`bashToolRenderer`） \{#tool-call-renderer-bashtoolrenderer}

`bashToolRenderer` 用于工具调用消息（`toolCall` / `toolResult`）：

- 折叠模式显示按视觉行截断的预览，
- 展开模式显示当前可用的全部输出文本，
- 截断时，警告行包含截断原因和 `local://<id>.log`，
- 超时值（来自参数）显示在页脚元数据行中。

### 注意事项：完整产物展开 \{#caveat-full-artifact-expansion}

`BashRenderContext` 具有 `isFullOutput`，但当前渲染器上下文构建器不会为 bash 工具结果设置它。除非其他调用方提供完整产物内容，否则展开视图仍使用结果内容中已有的文本（尾部/截断输出）。

## 用户感叹号命令组件（`BashExecutionComponent`） \{#user-bang-command-component-bashexecutioncomponent}

`BashExecutionComponent` 用于交互模式下的用户 `!` 命令（非模型工具调用）：

- 实时流式传输数据块，
- 折叠预览保留最后 20 个逻辑行，
- 每行限制为 4000 个可见列，
- 存在元数据时显示截断和产物警告，
- 分别标记取消/错误/退出状态。

此组件由 `CommandController.handleBashCommand()` 连接，并从 `AgentSession.executeBash()` 接收数据。

交互式 `!` 调用请求使用配置的用户 shell 执行。zsh/fish 命令可在无头 PTY 上运行，并在组件中回放 ANSI 输出；bash 使用快照/嵌入式 shell 路径。简单且成功的 `cd` 命令通过持久 shell 运行，可改变 OMP 会话 cwd；智能体响应正在流式输出时，拒绝此目录变更。`!!` 将执行消息排除在模型上下文之外。

## 各模式的行为差异 \{#mode-specific-behavior-differences}

此表涵盖有限命令执行；命名服务路由在上文单独介绍。

| 接口 | 入口路径 | 可用 PTY | 实时输出体验 | 错误呈现 |
| --- | --- | --- | --- | --- |
| 交互式工具调用 | `BashTool.execute` | 可以，需 `pty=true`、存在 UI 且 `PI_NO_PTY!=1` | PTY 叠加界面（交互式）或流式尾部更新 | 工具错误变为 `toolResult.isError` |
| 打印模式工具调用 | `BashTool.execute` | 不可（无 UI 上下文） | 无 TUI 叠加界面；输出出现在事件流/最终助手文本流中 | 相同的工具错误映射 |
| RPC 工具调用（智能体工具） | `BashTool.execute` | 通常无 UI -> 非 PTY | 结构化工具事件/结果 | 相同的工具错误映射 |
| 交互式感叹号命令（`!`） | `AgentSession.executeBash` + `BashExecutionComponent` | 对支持的 zsh/fish 用户 shell 使用无头 PTY；不是交互式叠加界面 | 专用 bash 执行组件，使用 PTY 时带回放 | 控制器捕获异常并显示 UI 错误 |
| RPC `bash` 命令 | `rpc-mode` -> `session.executeBash` | 不可 | 直接返回 `BashResult` | 消费方处理返回字段 |

## 运行注意事项 \{#operational-caveats}

- 拦截器只在建议的工具当前存在于上下文中时阻止命令。
- 如果产物分配失败，仍会发生截断，但没有可用的 `local://N.log` 反向引用。
- 普通 shell 会话缓存条目作用域为进程，不按大小逐出。已取消/损坏的会话会被移除并隔离；每个作业的 `:async:` 条目在完成后移除。具有在线后台子进程的 shell 可保留到这些子进程退出。
- 超时整形因后端而异：本地非 PTY 和交互式 PTY 超时返回带 `details.timedOut` 的错误结果；客户端桥接终端创建/执行超时路径抛出 `ToolError`。这些工具调用路由中的非超时取消都会抛出异常。

## 实现文件 \{#implementation-files}

- [`src/tools/bash.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/bash.ts)：工具入口、规范化/拦截、服务/异步/PTY 选择、结果/错误映射。
- [`packages/coding-agent/src/ui/tools/bash.tsx`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/ui/tools/bash.tsx)：bash 工具渲染器（详情类型：`packages/coding-agent/src/tools/details/bash.ts`）。
- [`src/launch/services.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/launch/services.ts)：命名服务验证和项目代理服务监督。
- [`src/internal-urls/proc-protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/proc-protocol.ts)：服务/作业检查、输入、停止和生命周期控制。
- [`src/tools/bash-pty-selection.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/bash-pty-selection.ts)：用于选择本地 PTY 叠加界面的 `canUseInteractiveBashPty` 谓词。
- [`src/tools/bash-interceptor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/bash-interceptor.ts)：拦截器规则匹配和命令被阻止时的消息。
- [`src/internal-urls/url-filesystem.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/url-filesystem.ts)：由路由器支持、用于 `scheme://` 路径的 shell 文件系统。
- [`src/exec/bash-executor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/exec/bash-executor.ts)：非 PTY 执行器、shell 会话复用、取消连接和输出接收器集成。
- [`src/exec/non-interactive-env.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/exec/non-interactive-env.ts)：非 PTY 执行器使用的非交互式子进程环境默认值（`buildNonInteractiveEnv`）。
- [`src/exec/direnv.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/exec/direnv.ts)：执行器预检使用的 direnv/devenv 环境加载。
- [`src/tools/bash-interactive.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/bash-interactive.ts)：PTY 运行时、叠加 UI、输入规范化和交互式 `TERM` 设置。
- [`packages/coding-agent/src/tools/streaming-output.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/streaming-output.ts)：`OutputSink`、`TailBuffer`、截断/产物溢出和摘要元数据。
- [`src/tools/output-meta.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/output-meta.ts)：从设置到输出预算的辅助函数。
- [`packages/coding-agent/src/tools/output-meta.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/output-meta.ts)：截断元数据和恢复通知。
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)：会话级 `executeBash` 接口。
- [`src/session/bash-runner.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/bash-runner.ts)：感叹号命令执行、结果归属、消息记录和中止生命周期。
- [`packages/coding-agent/src/ui/transcript/exec-run.tsx`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/ui/transcript/exec-run.tsx)：交互式 `!` 命令执行组件。
- [`src/modes/controllers/command-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/command-controller.ts)：交互式 `!` 命令 UI 流式传输/更新完成的连接。
- [`src/modes/rpc/rpc-mode.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/rpc/rpc-mode.ts)：RPC `bash` 和 `abort_bash` 命令接口。
- [`src/internal-urls/local-protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/local-protocol.ts)：`local://` 解析，包括溢出文件（`local://<id>.log`）。
