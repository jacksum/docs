---
title: "bash"
description: "Oh My Pi 官方仓库文档：bash。"
---

# bash \{#bash}

> 在会话工作区中执行 shell 命令，可选择使用 PTY、后台作业处理或受监督服务模式。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/bash.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/bash.md`
- 主要协作组件：
  - `packages/coding-agent/src/tools/bash-interactive.ts`：PTY/TUI 执行路径。
  - `packages/coding-agent/src/tools/bash-interceptor.ts`：阻止更适合由工具处理的 shell 模式。
  - `packages/coding-agent/src/internal-urls/url-filesystem.ts`：用于 `scheme://` 路径、以路由器为后端的 shell 文件系统。
  - `packages/coding-agent/src/tools/bash-pty-selection.ts`：`canUseInteractiveBashPty()` 决定调用是否可使用本地 PTY 覆盖层。
  - `packages/coding-agent/src/tools/gh-cache-invalidation.ts`：针对会修改数据的 `gh issue`/`gh pr` 子命令删除 `github-cache` 行。
  - `packages/coding-agent/src/tools/bash-worktree-rewrite.ts`：可选的 `git worktree add` 克隆改写。
  - `packages/coding-agent/src/launch/services.ts`：命名服务验证和启动代理调用。
  - `packages/coding-agent/src/exec/bash-executor.ts`：非 PTY shell 执行。
  - `packages/coding-agent/src/tools/streaming-output.ts`：流式缓冲区、截断、溢出产物保存。
  - `packages/coding-agent/src/tools/tool-timeouts.ts`：超时钳制边界。
  - `packages/coding-agent/src/exec/settings.ts`：默认拦截器规则。
  - `docs/bash-tool-runtime.md`：更深入的执行器/运行时说明；可作为 shell 会话内部机制的配套文档。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `command` | `string` | 是 | 要执行的 shell 命令文本。开头的 `cd <path> && ...`（或进入现有目录的 `cd <path>; ...`）用于选择工作目录。 |
| `timeout` | `number` | 否 | 超时时间，单位为秒。默认 `300`。`0` 禁用截止时间。非零值（包括默认值）先受正数 `tools.maxTimeout` 限制，再钳制到 `1..3600`。 |
| `pty` | `boolean` | 否 | 请求 PTY 模式。有限时长命令默认为 `false`，命名服务默认为 `true`。前台 PTY 需要 UI 且 `PI_NO_PTY !== "1"`；命名服务将此设置转发给启动代理。 |
| `async` | `boolean` | 否 | 后台执行请求。只在会话的 `async.enabled` 为 true 时提供。立即返回作业 ID 而不是等待；它不会改变生效的截止时间，包括由 `timeout: 0` 禁用的截止时间。 |
| `notify` | `string` | 否 | Rust 语法的正则表达式（与 `grep` 相同）。命令运行期间，匹配的每一行输出都会作为 `async-notify` 后续消息送达会话。不带 `name` 时，它会像 `async: true` 一样将命令作为后台作业启动（需要 `async.enabled`）；带有 `name` 时，启动代理会匹配服务的输出。空白值视为未设置。 |
| `name` | `string` | 否 | 项目内唯一的受监督服务名称：由 1-48 个字母、数字、点、下划线或连字符组成，以字母或数字开头。只在 `launch.enabled` 和 Bash 均启用时提供。空白名称选择有限时长命令模式。已有活动服务的名称会使用新规格重新启动。与 `async: true` 或任何显式提供的 `timeout` 不兼容。 |
| `ready` | `{ log?: string; port?: number; host?: string; timeout?: number }` | 否 | 服务就绪要求非空白日志正则表达式和/或 `1..65535` 范围内的整数 TCP 端口；提供的所有条件都必须满足。Host 默认为 `127.0.0.1`，超时默认为 30 秒（钳制到 `0.05..3600`）。没有 `name` 时，非空规格会被忽略并给出通知。 |

没有 `env` 输入。每个命令和命名服务还会获得 `PI_SESSION_ID`、`PI_SESSION_FILE`（会话记录的绝对路径，会话未持久化时为空）和 `PI_TOOL_CALL_ID`（正在运行的 `bash` 调用 ID），这些值在调用开始时读取；见[环境变量](../environment-variables.md#set-for-session-commands)。除此之外，命名服务继承已配置的 shell 环境；命令专属赋值请放在 `command` 中。

没有 `name`、`pty` 或客户端终端时，命令会在嵌入式 bash 引擎中运行（bash 5.3 语义），即使 `shellPath` 指向 PowerShell 或其他外部 shell 也是如此。`shellPath` 为命名服务、受支持的终端路由和交互式 `!` 命令选择外部 shell；bash 路径仍可能向嵌入式会话提供环境和 rc 快照。要在普通工具调用中使用 PowerShell 语法，请显式调用 `pwsh -Command '...'`，并正确加引号，使嵌入式 shell 保留 PowerShell 的 `$` 变量。

命名服务示例：

```json
{
  "command": "python3 -m http.server 8765",
  "name": "web",
  "ready": { "port": 8765 }
}
```

## 内置命令 \{#builtins}

嵌入式 shell 按以下顺序解析命令名称：引擎自身的 bash 5.3 内置命令，然后是 pi 的 shell 工具、pi 的进程内实用程序、已挂载的工具命令，最后是 `PATH`。包含斜杠的名称不会被视为内置命令，`type`/`command -v` 会将进程内实用程序报告为 shell 内置命令。

- 引擎内置命令是 bash 5.3 自身的命令：`alias`、`cd`、`command`、`coproc`、`declare`/`typeset`、`echo`、`eval`、`exec`、`export`、`fc`、`getopts`、`history`、`jobs`、`kill`、`let`、`local`、`mapfile`/`readarray`、`printf`、`pwd`、`read`、`readonly`、`set`、`shopt`、`source`、`test`、`times`、`trap`、`type`、`ulimit`、`umask`、`unset`、`wait`，以及内置命令表中的其余命令。`suspend` 不予提供（`suspend: not available in this shell`，状态为 `1`）；`exec` 从不替换 pi 的进程，其仅操作 fd 的形式（`exec 3>&1`、`exec >log`）只更改 shell 自身的描述符。`complete`、`compopt` 和 `bind` 会被接受，但不执行任何操作。
- pi 的 shell 工具在子 shell 中运行其操作数：`time`（带选项）、`timeout`、`nohup`、`git`（启用 `PI_SMART_GIT`/`PI_GIT_GUARD` 层时），以及运行命令行的实用程序（`direnv exec`、`entr`、`env`、`flock`、`ifne`、`watchexec`、`xargs`、`find -exec`、`fd -x`/`-X`/`-l`）。
- pi 的进程内实用程序替代同名外部二进制程序：`ast-grep`/`sg`、`awk`、`b2sum`、`base32`、`base64`、`basename`、`cat`、`chmod`、`cksum`、`cmp`、`column`、`combine`、`comm`、`cp`、`cut`、`date`、`dd`、`df`、`diff`、`dirname`、`du`、`errno`、`fd`、`file`、`find`、`fold`、`fswatch`、`grep`、`head`、`hostname`、`id`、`ifne`、`isutf8`、`jq`、`ln`、`ls`、`md5`、`md5sum`、`mkdir`、`mktemp`、`mv`、`nl`、`nproc`、`od`、`open`、`paste`、`printenv`、`readlink`、`realpath`、`rg`、`rm`、`rmdir`、`rsync`、`say`、`sd`、`sed`、`seq`、`sha1sum`、`sha224sum`、`sha256sum`、`sha384sum`、`sha512sum`、`shasum`、`sort`、`sponge`、`stat`、`strings`、`tac`、`tail`、`tar`、`tee`、`touch`、`tr`、`truncate`、`ts`、`uname`、`uniq`、`uptime`、`wc`、`which`、`whoami`、`xargs`、`xdg-open`、`yes`。`chmod`、`errno` 和 `id` 仅适用于 Unix；`tar` 需要 Unix 或 Windows 目标；`ast-grep`、`fd`、`find`、`grep`、`rg` 以原生方式等待，因此取消会停止工作。
- pi 的进程内置命令有 `ps`、`top`、`sleep`、`pgrep`、`pkill`、`pidwait` 和 `lsof`（Linux、macOS、Windows）；它们缓冲输出，并且不会被开关禁用。

当 `sleep`、`yes` 或 `timeout` 单独带 `&` 运行时，如果 `PATH` 中有同名可执行文件，就使用它，使 `$!` 能与 `ps` 等操作系统工具配合使用。该可执行文件使用自己的选项，无法调用 shell 本地函数；其他所有进程内实用程序在 `&` 下仍留在进程内。没有可执行文件时，作业留在进程内，并保留仅 shell 可见的 PID。`nohup cmd &` 保留 pi 的 `nohup`，它会使 `cmd` 脱离取消和会话拆卸；当 `cmd` 是外部程序时，其 `$!` 已经是 `cmd` 的 pid。前台解析和后台复合命令不变。在 Windows 上，GNU 风格的调用不会被重定向到 `timeout.exe` 等不兼容的 System32 程序。

`time` 后跟除单独 `-p` 以外的选项时（`time -l cmd`、`time -v cmd`、`time -p -l cmd`），使用 pi 的 `time` 实用程序，而不是 bash 关键字；在这种情况下，bash 会尝试运行名为 `-l` 的命令并失败；`command time` 和 `env time` 也会调用该实用程序。它先运行 `cmd`，然后将报告写入自身的 stderr，因此 `time -l cmd 2>&1 | grep 'maximum resident'` 可以读取该报告。`-l` 添加 macOS `/usr/bin/time -l` 的资源行（以字节计的最大常驻集大小、页面回收和缺页、块 I/O、上下文切换；在 macOS 上还包括已完成指令、周期和内存占用峰值），`-p` 打印 POSIX 布局，`-v` 打印 GNU time 的详细报告（大小以 kbytes 为单位）。这些数字来自 `cmd` 所等待的外部程序，包括其管道阶段和嵌套 shell；进程内内置命令和函数只计入实际耗时。它不支持的选项（`-o`、`-f`）会交给 `PATH` 中的 `time`。单独的 `time` 和 `time -p` 仍为 bash 关键字，在 shell 的 stderr 上报告管道的实际、用户和系统耗时。

要执行带检查的字面量编辑，请使用 `sd -F --expect 3 -U 2 'oldName' 'newName' file.ts`。`--expect` 在任何 `-n` 限制之前检查**每个输入**的匹配数量；计数不符时以非零状态退出，且不写入任何文件。`-U 2` 打印已应用的统一差异，并带有两行上下文。没有更改时不打印任何内容；二进制更改会打印文件名通知。`-U` 要求文件操作数，不能与 `--preview` 组合使用。

开关从会话启动时的环境中读取一次；设置为非空且不是 `0`/`false` 的值时启用。

| 变量 | 效果 |
| --- | --- |
| `PI_DISABLE_UUTILS_BUILTINS` | 所有实用程序都不再是内置命令；每个实用程序名称都解析为 `PATH` 中的二进制程序。 |
| `PI_DISABLE_UUTILS_DESTRUCTIVE` | `rm`、`mv`、`cp`、`ln`、`dd`、`rsync` 和 `tar` 解析为系统版本。 |
| `PI_DISABLE_RM_BUILTIN` | `rm` 解析为系统版本。 |
| `PI_DISABLE_MV_BUILTIN` | `mv` 解析为系统版本。 |

路径（`/usr/bin/jq`）始终为该次命令运行系统程序，即使实用程序已启用也是如此。捆绑的 `jq` 行为类似 jq 1.8.2；其差异列表见 [bash-tool-runtime.md](../bash-tool-runtime.md)。

### 工具命令 \{#tool-commands}

作为会话命令挂载的工具（`isMountableAsToolCommand`）是嵌入式 shell 的命令，在引擎内置命令、pi 的 shell 工具和进程内实用程序之后、`PATH` 之前解析；shell 保留的名称不会作为命令挂载。`exec/tool-command-host.ts` 为一次运行安装会话的命令名称，`exec/tool-cli.ts` 中的 `runToolCli()` 根据工具的 JSON 模式解析并运行每次调用：

- 必填的顶层标量/枚举字段按模式顺序作为位置参数；
- 每个字段也接受 `--flag value`（下划线变为连字符；嵌套字段为 `--a.b`）；
- 布尔字段为 `--flag` 或 `--no-flag`；
- 数组字段重复使用其标志；
- `-j` / `--json <JSON>` 合并原始对象；
- `@FILE` 和 `-` 合并 JSON 对象，或将其文本绑定到下一个位置参数（`-` 读取 stdin）；
- `--help` 打印根据模式生成的用法。

用法错误以 `2` 退出；工具自身失败以 `1` 退出。每次调用按调用顺序记录在结果的 `details.toolCommands` 上（包括部分结果和最终结果）。指名工具命令的命令行即使在客户端终端可用时也仍在嵌入式引擎上执行，`pty: true` 会拒绝它（``<name> is a session tool command and cannot run in a PTY; run it without \`pty\`.``）。完全由工具命令组成的命令行，用 `;`、`&&`、`||`、`|`、`|&` 或换行连接，且没有重定向、展开或替换，会通过外层 bash 审批关卡；每个工具在运行时根据自身的级别和 `tools.approval.<tool>` 策略单独审批。工具返回的图片块会作为 stdout 上的 kitty 图形送达 shell，输出管道会将来自任何命令的终端图形解码为附加图片及 `Image saved: <path>` 链接行。

## 输出 \{#outputs}

工具返回一个 `text` 内容块，以及可选的 `details` 和从终端图形解码得到的图片块。

- 成功，前台：
  - `content[0].text`：命令输出；命令未产生任何内容时为 `(no output)`。
  - `details.timeoutSeconds`：经过全局/逐工具钳制后生效的正数超时时间；`timeout: 0` 时则为 `details.timeoutDisabled: true`。
  - `details.requestedTimeoutSeconds`：当请求的/默认超时时间与生效的超时时间不同时提供，包括截止时间被禁用时的 `0`。
  - `details.wallTimeMs`：已完成的本地/客户端终端运行所经过的墙钟毫秒数。
  - `details.terminalId`：执行经由客户端终端桥接路由时，在流式更新中提供；不保留在完成后的结果中。
  - `details.exitCode`：命令以非零退出码完成时提供。
  - `details.timedOut: true`：在本地、PTY 和客户端终端超时结果中提供。
  - `details.meta.truncation`：输出在内存中被截断时提供；完整输出溢出保存到产物时包含 `artifactId`。
  - `details.meta.minimized`：shell 最小化器的文本替代输出时提供；`{ filter, inputBytes, outputBytes, artifactId }` 指出原生过滤器（对于已最小化的 `&&`/`;` 链为 `chain`）、原始和最小化后的字节数，以及保存原始捕获内容的 `bash-original` 产物。
  - 非零退出和超时会返回标记为 `isError` 的工具结果；确定的非零退出输出以 `[exit code <n>]` 结尾。
- 成功，后台启动（`async: true` 或自动转入后台）：
  - `content[0].text`：可选的预览尾部和通知，后接 `[backgrounded as <id>, killed at <n>s total; …]`，在 `timeout: 0` 下为 `no deadline`，由引导或审批提示提前转入后台时会在 ID 后附加 `(<reason>)`，随后是不轮询指令（`packages/coding-agent/src/tools/details/bash.ts` 中的 `formatBackgroundNotice`），使模型在等待结果前就能看到作业的截止时间。截止时间从作业启动时计算，因此自动转入后台的命令已经消耗了前台等待时间。
  - `details.async`：`{ state: "running", jobId, type: "bash" }`。
  - `read proc://` 列出所拥有的作业和项目服务；`read proc://<id>` 查看状态/输出而不消耗结果交付；使用空 `content` 的 `write proc://<id>/kill` 取消作业。
- 成功，命名服务（`name`）：在启动代理管理下通过用户的 shell 执行 `command`，返回就绪、退出或就绪超时结果，包含状态和日志尾部。已有活动服务的名称会使用新规格停止并重启；退出通知仍自动交付。`read proc://<name>` 查看状态/日志；`write proc://<name>` 发送 stdin（除非内容已以换行结尾，否则会追加 Enter，包括空内容）；`write proc://<name>/kill` 停止服务。`write proc://<name>/mode` 接受 `persist`、`session` 或 `detached`。
- `o2ctl services` shell 命令（在可以启动服务时的嵌入式 shell 中）：`o2ctl services add <name> <pid|%job>` 将命令已经启动的进程（`cmd &`、`nohup cmd &`）保留为服务 `<name>`，不重新启动它；若其 stdout（否则为 stderr）写入普通文件，则该文件就是其输出。`o2ctl services ls` 列出项目服务，`o2ctl services stop <name>` 停止某个服务。见 [bash-tool-runtime](../bash-tool-runtime.md#the-o2ctl-services-shell-command)。
- 后台进度 / 完成：
  - 通过 `onUpdate` / 异步作业管理器交付，而非通过初始返回。
  - 只有在作业被视为已转入后台后，运行中更新才包含尾部文本和 `details.async.state: "running"`。
  - 完成/失败更新携带最终文本和 `details.async.state: "completed" | "failed"`。非零退出或超时会被记录为失败的后台作业。
  - `async-result` 后续消息将作业命令放在一行内作为作业名称（换行表示为 `\n`，超过 400 个字符时省略中间部分）：`Background job <id> (<command>) has completed.`，批量消息中则为 `── Job <id> (<command>) ──`。
- 后台输出通知（`notify`）：
  - 后台作业或命名服务运行时，每一行与 `notify` 正则表达式匹配的输出（stdout 和 stderr，按面向模型的方式合并）都会作为 `async-notify` 后续消息交付；在首次匹配后的 200 毫秒内匹配的行会一起发送。通知以命令标识作业，以名称标识服务，并说明其是否仍在运行。
  - 交付方式与结果相同：会话空闲时开启新一轮，否则作为请求之间的旁注，并结束被阻塞的 `wait`（其返回 `Wait interrupted by message.`，通知随后出现）。
  - 作业的匹配内容归属于该作业启动时的会话记录。服务的匹配内容与退出通知一样，归属于拥有该服务的会话：启动代理匹配输出，并且只在该会话的 omp 进程已连接时报告，恢复后的会话会再次收到报告。所有者离线期间打印的输出不会报告。
  - 服务退出时，其尚未发送的匹配内容，包括未以换行结束的最后一行，会立即发出，先于不携带输出的退出通知。作业的匹配内容则会被丢弃，因为其结果已携带输出；已停止服务或已取消作业的匹配内容也会被丢弃。
  - 通知消息的 `details.reports[]`：`{ id, type: "bash" | "service", pattern, lines, omitted, running, stopped }`；在两次注入之间排队的同一来源的批次会合并为一个条目。
- 失败：
  - 取消、缺少退出状态、验证失败和被拦截的命令会抛出 `ToolError` / `ToolAbortError`；超时返回错误结果。

Stdout 和 stderr 会在模型看到之前合并。确定的非零退出码会作为 `[exit code <n>]` 追加到返回的错误结果文本中。

## 命令策略与专用工具路由 \{#command-policy-and-dedicated-tool-routing}

两个独立的设置可以阻止 Bash 子进程启动。它们用途不同，在工具调用生命周期的不同阶段运行。

| 设置 | 用途 | 规则语法 | 匹配时的结果 |
| --- | --- | --- | --- |
| `bash.patterns` | 命令专属执行策略 | 带 `*` 通配符的字面文本 | 允许调用、请求人工审批或拒绝调用。 |
| `bashInterceptor.patterns` | 优先使用专用工具而非 Bash | JavaScript 正则表达式、可选标志、工具名称和消息 | 返回 Bash 工具错误，要求模型改为调用指定的专用工具。 |

### `bash.patterns`：权限策略 \{#bashpatterns-permission-policy}

`bash.patterns` 用于无论其他工具是否能完成工作，都需要允许、人工确认或拒绝的命令。规则有顺序，首个匹配规则生效。每条规则有一个 `match` glob，以及值为 `allow`、`prompt` 或 `deny` 的 `approval`。匹配前，glob 和命令中的连续空白都会折叠为一个空格，因此 glob 中的换行会匹配任何空白（`"*\n*"` 的行为与 `"* *"` 相同）。

```yaml
bash:
  patterns:
    - match: "git *"
      approval: allow
    - match: "curl *"
      approval: prompt
    - match: "rm -rf *"
      approval: deny
```

- `deny` 会在 `BashTool.execute()` 运行前停止调用，在 `yolo` 模式下也一样。
- `prompt` 显示审批请求。只有请求获准后才会进入 `BashTool.execute()`。
- 默认情况下，`allow` 可以降低简单命令的审批级别，但不能批准复合命令。例如，`match: "git *"` 不会批准 `git status && rm -rf build`。
- 当设置 `bash.allowCompoundCommands: true`（默认为 `false`）且已配置 POSIX shell 时，字面量 `&&` 链会逐命令评估。每个段都需要一条 `allow` 规则才能允许整个链；未匹配的段保留正常的 exec 级别审批。分段规则仍然是首个匹配生效，任意分段或全链的拒绝都会优先，提示也会保留。展开、其他 shell 运算符以及关键命令模式不会获得允许绕过。
- `deny` 和 `prompt` 检查完整命令和每个 shell 命令段（每段取首个匹配限制，跨段时 `deny` 优先于 `prompt`）。因此，诸如 `match: "rm -rf *"` 的规则能够捕获 `cd /tmp && rm -rf build` 和 `curl http://example.com; rm -rf build`，即使 `curl *` 已匹配更靠前的 `prompt` 规则也是如此。`Settings.grantAuthority()` 中的操作者 `deny` 规则也优先于项目层规则。
- `bash.patterns` 和 `bashInterceptor.patterns` 都支持[路径作用域条目](../settings.md#path-scoped-arrays)（`{ path, patterns: [...] }`），允许将仓库专属命令规则直接放在 `~/.omp/agent/config.yml` 中。
- 对于 `allow` 规则，只有当变量名称与 `bash.allowedEnvVars` 中的条目或该规则可选的 `env: [...]` 列表中的条目完全匹配时，才会剥离开头的 `KEY=VALUE` 赋值（不支持通配符）。`deny` 和 `prompt` 规则会分别检查保留和移除开头裸 `KEY=VALUE` 赋值后的分段，因此 `FOO=1 rm -rf build` 仍会命中 `match: "rm -rf *"`。诸如 `env FOO=1 rm -rf build` 的包装命令不会被解包。
- 完全由[工具命令](#tool-commands)组成的命令行不运行程序，因此不会对其匹配 `bash.patterns`（以及关键命令模式）：工具名称后面的文本是该工具的参数。请改用 `tools.approval.<tool>` 对这些工具设卡。混合工具命令和任何其他命令的命令行仍按通常方式检查。
- 项目（`.omp/config.yml`）和 `--config` 覆盖配置的 `bash.patterns` 列表会前置于全局 `config.yml` 列表，因此仓库本地规则可以扩展全局策略，而不是替换它。

此设置用于安全和用户控制。对于没有合适替代工具的命令，例如破坏性删除、网络访问、部署脚本或项目专属脚本，它仍然有用。

### `bashInterceptor.patterns`：专用工具路由 \{#bashinterceptorpatterns-dedicated-tool-routing}

`bashInterceptor` 是选择启用的路由层（`bashInterceptor.enabled` 默认为 `false`）。它用于技术上是有效 Bash、但更适合通过可用专用工具表达的命令。每个模式都是正则表达式，包含替代工具名称和向模型显示的解释。

```yaml
bashInterceptor:
  enabled: true
  patterns:
    - pattern: '^\s*(cat|head|tail)\s+'
      tool: read
      message: "Use the read tool instead; it handles binary files and provides better context."
    - pattern: '^\s*(grep|rg)\s+'
      tool: grep
      message: "Use the grep tool instead; it respects .gitignore and returns structured results."
```

拦截器规则只在其 `tool` 在当前会话中可用时生效。如果 `read` 被禁用，指向 `read` 的 `cat` 规则不会阻止 Bash 调用。因此，拦截器是尽力而为的能力偏好，而不是执行安全边界。

内置默认规则将常见操作路由到专用工具，例如将 `cat` 路由到 `read`、`rg` 路由到 `grep`、原地修改的 `sed` 路由到 `edit`、shell 重定向路由到 `write`，以及将未受管理的服务/监视器路由到命名 `bash` 服务模式。完整列表见 `packages/coding-agent/src/exec/settings.ts` 中的 `DEFAULT_BASH_INTERCEPTOR_RULES`。项目和 `--config` 覆盖配置的 `bashInterceptor.patterns` 条目会前置于全局列表（如果全局配置未设置 `bashInterceptor.patterns`，则前置于 `DEFAULT_BASH_INTERCEPTOR_RULES`）。仅含路径作用域条目的全局列表会在自身规则之后保留内置规则，因此在其前方追加规则也会保留内置规则。

Perl 规则会在解释器开头的开关中查找 `-i`，包括 `-lpi` 等组合。Perl 程序文本、脚本参数和 `--` 后的操作数不算开关。

为兼容现有自定义正则表达式，拦截器始终先检查完整的原始命令。然后检查由未加引号且未转义的 `&&`、`||`、`;`、`|`、`&` 或换行分隔的原始平铺命令片段。它还会检查移除开头环境赋值后的片段：

```bash
git add file && git commit -m "message"
GIT_AUTHOR_NAME=Dev git commit -m "message"
```

因此，诸如 `^\s*git\s+commit\b` 的锚定规则可以匹配两个示例中的 `git commit` 命令。通过未加引号的 `|` 或 `|&` 消费另一命令 stdout 的阶段（例如 `printf 'x\n' | grep x` 中的 `grep x`）**不会**被视为拦截候选：它读取管道 stdin，而基于路径的专用工具无法提供该输入，因此只匹配独立命令或首阶段命令。管道之后的空白续行和纯注释续行会保留这一上下文。加引号、转义或注释中的文本不会被视为命令。Heredoc、参数展开、命令替换、反引号、分组和格式错误的引号只保留完整命令检查；拦截器刻意不尝试成为完整的 shell 解析器。

### 交互与选择指南 \{#interaction-and-selection-guide}

审批策略在执行前解析。匹配 `bash.patterns` 的 `deny` 不会到达拦截器。匹配的 `prompt` 只有在用户接受审批请求后才会到达拦截器。如果获准的调用随后匹配拦截器规则，Bash 调用仍不会运行；模型收到路由错误后，应调用专用工具。

除非有意采用这种两步行为，否则请避免在两处配置相同操作。例如，针对 `cat *` 的 `prompt` 规则加上已启用的 `cat` 到 `read` 拦截器，会先请求用户批准 Bash，然后拒绝 Bash，并要求模型使用 `read`。

根据期望结果选择设置：

- 关心**命令是否可以执行**时，使用 `bash.patterns`。
- 关心**应该由哪个工具执行操作**时，使用 `bashInterceptor.patterns`。

## 流程 \{#flow}

1. `packages/coding-agent/src/tools/bash.ts` 中的 `BashTool.execute()` 读取 `command`。`name` 选择受监督服务模式（通过用户的 shell 和启动代理）；普通 Bash 执行将 `timeout` 默认为 `300`。
2. 它将开头的 `cd <path> && ...` 提取为工作目录，并从 `command` 中移除该前缀。
3. 没有 `name` 时，非空白的 `notify` 视为 `async: true`。如果在 `async.enabled` 关闭时请求其中任意一个，它会在任何执行之前抛出 `ToolError`；无法编译的 `notify` 正则表达式也会如此，无论是否有 `name`。
4. 如果启用 `bashInterceptor.enabled`，`checkBashInterception()` 会同时针对原始命令和移除 `cd` 后的命令运行。对于每种形式，配置的正则表达式仍先检查完整输入，再检查由未加引号/未转义的 `&&`、`||`、`;`、`|`、`|&`、`&` 或换行分隔的每个平铺命令（排除从 `|` 或 `|&` 消费管道 stdin 的阶段，包括跨越空白/注释续行的情况），随后检查这些片段移除开头 `NAME=value` 赋值后的版本。匹配的已启用规则会在执行前抛出异常。
5. 启用 `worktree.clone` 时，识别出的字面量 `git worktree add` 命令会被改写为以克隆为后端的工作树辅助程序。随后运行 GitHub 缓存失效处理。每次运行专属的 `InternalUrlFilesystem` 会注入原生 shell，使 `scheme://` 路径在操作时解析。
6. 提取出的宿主目录相对于 `session.cwd` 解析，并由 `fs.stat()` 验证其是目录；URL 目录通过 URL 文件系统检查，并原样交给 shell（服务和 PTY 模式会拒绝它）。
7. 命名服务在有限时长命令的超时处理之前分派，默认将 PTY 设为 `true`，且 `ready.timeout` 仅用于就绪检查。`notify` 正则表达式随服务的启动规格传递：启动代理将服务输出送入与作业相同的 `OutputNotifier`，并将每批内容作为 `daemon-notify` 事件发送到所有者的连接（`packages/coding-agent/src/launch/broker.ts`），再由 `services.ts` 将其加入所属会话的队列。对于有限时长命令，`timeout: 0` 禁用截止时间；否则，`clampTimeout("bash", requestedTimeoutSec, tools.maxTimeout)` 先应用正数的全局上限，再应用 `TOOL_TIMEOUTS.bash`（`min: 1`、`max: 3600`）。钳制会添加一行通知。
8. 执行路径分为：
   1. `async: true` 或 `notify` -> `#startManagedBashJob()` 注册会话异步作业并立即返回。带有 `notify` 时，作业将其输出送入 `OutputNotifier`（`packages/coding-agent/src/async/notify.ts`），后者通过会话的 `openAsyncNotify` 通道发送匹配行。
   2. 非 PTY，启用 `bash.autoBackground.enabled`，异步作业管理器尚未达到运行中作业上限，且没有可用的客户端终端桥接（两者均适用时桥接优先）-> 启动受管理作业，在存在截止时间时最多等待 `min(thresholdMs, max(0, timeoutMs - 1000))`，然后返回已完成结果，或将运行转换为后台作业。
   3. 非 PTY 客户端终端桥接，在会话声明具有终端能力且 `pty` 为 false 时 -> 创建远程终端，流式传输/轮询当前输出，并在完成后释放终端。
   4. 否则执行前台运行。
9. 无客户端终端的前台非 PTY 运行调用 `packages/coding-agent/src/exec/bash-executor.ts` 中的 `executeBash()`；该路径自行执行 direnv/devenv 预检。
10. 前台 PTY 和客户端终端路径在分派前于 `BashTool` 中运行相同的 direnv 预检。使用 `bash.direnv: "auto"`（默认值）时，获准的 `.envrc` 可以将环境更改合并到命令中；`"off"` 禁用此行为。`bash.direnvLoadTimeoutMs` 默认为 `30_000`，正数的命令超时时间也会限制预检。
11. 当 `session.allocateOutputArtifact` 可用时，本地非 PTY 和 PTY 路径会先分配输出产物。产物路径/ID 会传入输出接收器，使大量输出可以溢出到磁盘。
12. `executeBash()` 加载 shell 设置、可选的 shell 快照和 shell 最小化器设置，然后通过持久化的原生 `Shell` 会话或一次性的 `executeShell()` 运行。`docs/bash-tool-runtime.md` 详细介绍了该路径。
13. `runInteractiveBashPty()` 创建 `PtySession`，叠加以 xterm 为后端的控制台 UI，将用户按键输入转发到 PTY，通过 `OutputSink` 捕获输出，并在关闭/释放时终止 PTY。
14. 客户端终端桥接模式调用 `session.getClientBridge().createTerminal(...)`，发出 `terminalId` 更新，轮询输出直到退出/超时/中止，将信号退出映射为 `137`，并在 `finally` 中释放句柄。
15. 完成时，`#buildCompletedResult()` 在需要时格式化 `(no output)`，附加输出摘要中的截断元数据，追加墙钟耗时/超时/退出通知，并在返回前重新检查未完成状态。
16. 本地、PTY 和客户端终端的超时结果会成为带 `details.timedOut` 的 `isError` 结果。客户端终端分配/轮询与截止时间竞速；超时时，延迟完成的分配会被清理，或先终止活动终端，再进行一次有界的最终输出读取。取消和缺少退出状态仍会抛出异常。

## 模式 / 变体 \{#modes--variants}

1. 前台非 PTY 本地运行
   - 没有可用客户端终端桥接时的默认路径。
   - 使用 `executeBash()`。
   - 通过 `streamTailUpdates()` 和 `TailBuffer(DEFAULT_MAX_BYTES)` 流式发送仅含尾部内容的更新。
2. 前台非 PTY 客户端终端
   - 在 `session.getClientBridge()?.capabilities.terminal` 为 true、存在 `createTerminal` 且 `pty` 为 false 时使用。
   - 通过带 `details.terminalId` 的轮询更新流式发送当前终端输出。
   - 执行相同的超时和中止行为，然后释放终端句柄。
3. 前台 PTY
   - 需要 `pty: true`、UI 上下文以及 `PI_NO_PTY !== "1"`。
   - 使用 `runInteractiveBashPty()` 和 `PtySession` 覆盖层。
   - 支持交互式输入；`Esc` 从覆盖层终止会话。
   - 程序等待按键时，运行会显示为被用户阻塞（标题为 `!`，OSC 7501 为 `blocked`），每次新的等待都会发送 `Console waiting for input` 终端通知，除非 `pty.notify` 为 `off` 或过去 10 秒内曾向控制台发送按键。由 `PtySession.awaitsInput()` 判定：在所有 Unix 上检测终端回显关闭（密码提示、全屏程序）；在 Linux 上，还检测前台进程是否阻塞在对终端的 `read` 上（`/proc/<pid>/syscall`）。无法判断时（macOS 和 Windows 的行输入提示、Linux 上无法检查的 setuid 进程），输出静默 2 秒且光标位于文本之后，就会被视为提示。
4. 显式后台作业
   - 需要 `async: true` 或 `notify`，以及 `async.enabled`。
   - 向 `session.asyncJobManager` 注册作业，并立即返回 `{ state: "running", jobId }`。`timeout: 0` 使作业没有工具施加的截止时间。
5. 自动转入后台的非 PTY 作业
   - 需要启用 `bash.autoBackground.enabled`、没有 PTY/客户端终端桥接，并且异步作业管理器尚未达到运行中作业上限。
   - 起初像前台受管理作业一样运行，超过等待窗口后转入后台；达到容量上限时，Bash 回退为直接前台执行。
6. 命名受监督服务
   - 需要 `launch.enabled` 和活动的 Bash 工具；`async: true` 以及任何显式提供的 `timeout` 均不兼容，会被忽略并给出通知。
   - `notify` 在服务运行期间报告匹配输出，每次启动最多 30 条通知；再次启动会重新启用通知。由较旧 omp 留下并持续运行的启动代理会启动服务，但忽略正则表达式；此时结果会显示 `Ignored notify: …`，而不是确认已启用。
   - 通过启动代理运行，使用项目内唯一的 `name`、已配置的 shell 环境加会话标识、默认值为 `true` 的 PTY，以及可选的就绪条件。复用活动名称会使用新规格重启服务。
   - 就绪检查等待所有已提供的日志/端口条件满足、服务退出或超时。`ready.log` 是针对累积输出的 Unicode 多行正则表达式：`^` 和 `$` 匹配行边界，包括先前启动输出之后的行边界，匹配也可跨输出块。`$` 还匹配截至当前已收到输出的末尾，因此锚定模式可以匹配服务尚未写完的行（这使没有末尾换行的提示也能匹配）。使用 `read proc://<name>` 查看。
7. 被拦截的命令
   - 不创建子进程。
   - 返回 `ToolError`，引导模型使用专用工具或命名服务模式。

## 副作用 \{#side-effects}

- 文件系统
  - 使用 `fs.stat()` 验证提取出的工作目录。
  - 可能为完整本地输出（`bash`）和最小化器保留的原始输出（`bash-original`）分配并写入产物文件。
  - `scheme://` 路径由 `InternalUrlFilesystem` 按操作处理：以文件为后端的协议重定向到其后端文件（只有 `local://` 等可变、以文件写入的协议可在已批准级别内写入）；渲染的资源为只读；`realpath`/`readlink` 打印以文件为后端的 URL 的实际后端路径。
  - 重定向到由处理器写入的 URL（`: > proc://<id>/kill`、`echo hi > agent://<id>`、`cfg://`、`ssh://` 等）会打开只写句柄；关闭时，其字节（仅 UTF-8）会像 `write` 工具一样，作为一次写入送达该协议的处理器。处理器的答复（或拒绝原因）作为通知追加到结果中；拒绝也会使关闭失败，因此命令以非零状态退出。追加（`>>`）会被拒绝，但不保存内容的 `proc://`、`out://` 和 `agent://` 通道除外，因为处理器写入会替换目标。
  - 重定向到 `out://`（`printf '…' > out://`）会打开只写句柄；关闭时，其文本成为调用后以助手正文形式向用户显示的回复。回复随每个进度帧和结果中的 `details.replies` 传递，使会话记录在实时显示和重建时均将每条回复绘制一次。只有调用等待命令期间才接受它们（转入后台的作业写入会失败），超过 64 KiB 的回复会以 `EFBIG` 失败，并整体丢弃。
- 子进程 / 原生绑定 / 客户端终端
  - 非 PTY 本地执行通过 `@oh-my-pi/pi-natives` 使用原生 shell 执行（`Shell.run()` 或 `executeShell()`）。
  - PTY 使用原生 `PtySession.start()`。
  - 客户端终端模式将进程执行委托给已连接客户端的终端能力。
  - 命名服务在项目作用域的启动代理中运行，并为 `proc://` 保留日志/状态。
- 会话状态
  - 读取会话设置，包括异步、自动转入后台、拦截器、direnv、全局超时上限、工具可用性和 shell 配置。
  - 为显式/自动后台运行向 `session.asyncJobManager` 注册作业。
  - 使用 `session.getSessionId()` 隔离 shell 复用和异步会话键。
  - 使用 `session.allocateOutputArtifact()` 处理溢出文件。
  - 命令包含会修改数据的 `gh issue`/`gh pr` 子命令时，在执行前使 `github-cache` 行失效，以便后续 `issue://`/`pr://` 读取能看到修改后的状态（`invalidateGithubCacheForBashCommand`）。
- 用户可见的提示 / 交互式 UI
  - PTY 模式打开标题为 `Console` 的 TUI 覆盖层，并将输入转发到 PTY。
  - 后台启动消息会注明结果将自动交付；只有没有其他工作时才使用 `wait`。
- 后台工作 / 取消
  - 异步和自动转入后台的作业会在工具初次返回后继续运行，直到完成、取消或达到截止时间（除非 `timeout: 0` 禁用了截止时间）。
  - 取消会中止原生运行；关闭 PTY 覆盖层也会终止 PTY。
  - 每次运行都携带 `OMP_BASH_SESSION=<session id>@<omp pid>`（另一个活动 omp 进程打开同一会话时不会匹配；某个 omp 在未回收进程前退出后，其进程会转交给下一个运行该会话的 omp），它启动的所有内容都会继承该值，即使发生父进程变更或 `setsid` 也一样；由于 macOS 隐藏 Apple 签名二进制程序的环境，会话 shell 仍持有的外部程序（`Shell.heldProcesses()`）也算作该会话的进程。当进程忽略 SIGHUP（系统 `nohup`），或由 shell 自身的 `nohup` 启动（它不屏蔽 SIGHUP；持有的进程记录会记录此情况）时，该进程就是 `nohup` 进程。启用 `bash.reapBackground` 时（默认启用；RPC 模式中强制关闭），调用留下的运行中进程（`cmd &`、`(cmd &)`、`nohup cmd &`）如果既不属于运行中的 bash 调用，也不属于服务，就会在主智能体停止时通过提醒列给它（每个进程一次，类型为 `&` 或 `nohup`），要求它使用 `o2ctl services add <name> <pid>` 注册或终止这些进程。会话结束时，`&` 进程及其整个进程树会被 SIGKILL 终止；通过 `nohup` 启动的进程及其下的所有内容都不会被终止（`src/exec/session-processes.ts`、`src/session/leftover-processes.ts`）。

## 限制与上限 \{#limits--caps}

- 默认超时：`300s`（`packages/coding-agent/src/tools/tool-timeouts.ts` 中的 `TOOL_TIMEOUTS.bash.default`）。
- `timeout: 0` 禁用命令截止时间。
- 正数超时的限幅：`tools.maxTimeout` 是可选的全局上限（`0` 表示没有全局上限），随后再限制在 Bash 的 `1..3600s` 范围内。
- 自动转入后台的默认阈值：`60_000ms`（`packages/coding-agent/src/exec/settings.ts` 中的 `cfgBashAutoBackgroundThresholdMs`、`bash.autoBackground.thresholdMs`）；存在截止时间时，还会将其限制为不超过 `max(0, timeoutMs - 1000)`；禁用截止时间时则不对该阈值设限。
- 非 PTY 工具执行会将正数超时传给原生运行层，由其负责强制执行截止时间。宿主侧看门狗会等待 `max(1_000, timeoutMs) + 5_000ms`，以便原生层完成取消和输出排空；如果看门狗先触发，结果会警告输出可能不完整，并隔离持久会话。`timeout: 0` 既不启用截止时间，也不启用看门狗（`packages/coding-agent/src/exec/bash-executor.ts`）。
- 流式更新的尾部上限：`50 * 1024` 字节（`packages/coding-agent/src/tools/streaming-output.ts` 中的 `DEFAULT_MAX_BYTES`）。本地执行器的结果接收器默认采用相同的字节预算，并在保留滚动尾部的同时保留一个初始头部窗口（`tools.artifactHeadBytes`，默认 20 KiB）；将该设置设为 `0` 可只保留尾部。
- 结果后处理使用 `tools.artifactSpillThreshold`（默认 50 KiB）以及头部和尾部窗口（默认均为 20 KiB）。最终的 Bash 边界还会应用溢出阈值，并为提示预留 2 KiB。`tools.outputMaxColumns` 默认将流式输出的每行限制为 768 字节。
- `executeBash()` 中的流式回调节流：启用流式输出时，两次 `onChunk` 调用之间间隔 `50ms`。
- `notify`（`packages/coding-agent/src/async/notify.ts`）：批处理窗口为 200 ms；每条通知包含 `50` 行，每行截为 400 个字符，更多匹配只计数；空行从不匹配。作业可以连续快速发送 `30` 条通知，每过 20 s 恢复一个额度，因为它会在截止时间结束；服务没有截止时间，每次启动获得 `30` 个额度，且不会恢复。耗尽最后一个额度的通知会标记为 `stopped`，之后的匹配不再报告，但进程继续运行。再次启动服务会重新启用通知。
- TUI 折叠预览：在智能体 UI 中内联渲染时为 `10` 个视觉行（`DEFAULT_TERMINAL_PREVIEW_LINES`）；这是渲染器上限，不是工具输出上限。

## 错误 \{#errors}

- 输入验证：
  - 在异步执行被禁用时请求异步 -> `ToolError("Async bash execution is disabled...")`。
  - 缺少异步作业管理器 -> `ToolError("Background job manager unavailable for this session.")`。
  - `notify` 正则表达式无效 -> `ToolError("Invalid notify regex: ...")`；会话无法接收通知时（顾问、没有用于作业的 `openAsyncNotify` 或用于服务的 `queueServiceNotify` 的 SDK 工具会话）-> `ToolError("notify is unavailable in this session.")`。这两种情况都不会启动命令。
  - 提取到外层的 `cd` 目录不存在或无效 -> `ToolError("Working directory does not exist: ...")` 或 `ToolError("Working directory is not a directory: ...")`。
- 拦截器：
  - 命令匹配规则 -> `ToolError`，包含 `Blocked: <rule.message>` 和原始命令。
  - `compileRules()` 会静默跳过无效的拦截器正则表达式。
- 内部 URL 文件系统：
  - 故障在命令内以 errno 结果呈现：条目不存在为 `ENOENT`；写入不可变协议、对处理器拥有的协议执行非写入型修改（`rm`、`mkdir`、…），以及在关闭 `out.enabled` 时写入 `out://` 为 `EROFS`；向仅支持替换的处理器 URL 追加内容，以及处理器载荷不是 UTF-8 为 `EINVAL`；`out://` 回复超出大小限制为 `EFBIG`；协议高于获批层级为 `EACCES`；跨协议重命名或链接为 `EXDEV`；越出约束范围为 `EACCES`。在 URL 工作目录中启动的外部程序会失败，而不是在宿主上运行。
- 执行：
  - 非零退出 -> 返回的工具结果标记为 `isError`，包含 `details.exitCode`，文本以 `[exit code <n>]` 结尾。
  - 缺少退出码 -> 抛出 `ToolError`，包含 `[missing exit status]`。
  - 超时 -> 本地、PTY 和客户端终端执行返回 `isError` 结果，其中包含 `details.timedOut: true` 和超时提示。受管理的后台执行将其记录为失败作业。
  - 用户中止 -> 调用方信号被中止时，抛出 `ToolAbortError`。
- `saveBashOriginalArtifact()` 中的产物分配或保存失败不会导致命令失败。接收器产物失败也允许继续执行，但会返回 `artifactError` 元数据和捕获不完整提示，而不是将不完整的产物宣称为完整输出。

## 说明 \{#notes}

- `BashTool` 上设置了 `strict = true`；`concurrency` 按每次调用解析：`pty: true` 为 `"exclusive"`（它会接管终端 UI），其余情况均为 `"shared"`，因此同一条助手消息中的多个非 pty bash 调用会并行运行。当并行调用使用同一个 shell 会话键而发生重叠时，第一个调用拥有持久 `Shell`；其余调用在它的一次性派生实例中运行，这些实例结束时，其 shell 状态会带回持久 `Shell`（参见 `bash-executor.ts` 中的 `shellSessionsInUse` 和 `Shell.adopt()`）。
- 不带后缀的 `skill://<name>` 是用于 shell 操作的技能目录；其指令位于 `skill://<name>/SKILL.md`。
- `checkBashInterception()` 只有在匹配规则的 `tool` 名称存在于 `ctx.toolNames` 中时才会阻止执行；缺少工具会禁用其对应规则。
- 拦截器配置语法不变。它处理常见的平面命令列表，而不是完整的 shell 解析：heredoc、参数展开、命令替换、反引号、分组和格式错误的引号都只接受现有的完整输入检查。这是尽力将操作路由到专用工具的机制，不是安全边界。
- `bash.direnv` 默认为 `"auto"`，并遵循 direnv 的允许列表；未经允许的 `.envrc` 不会执行。设为 `"off"` 可跳过预检。`bash.direnvLoadTimeoutMs` 控制冷加载的时间预算。
- 默认拦截器规则来自 `packages/coding-agent/src/exec/settings.ts` 中的 `DEFAULT_BASH_INTERCEPTOR_RULES`：
  - `cat|head|tail|less|more` -> `read`（不包括将 stdout 发送到文件或读取 heredoc 的 `cat`，例如 `cat > f` 或 `cat 2>err > f`）
  - `grep|rg|ripgrep|ag|ack` -> `grep`
  - 带名称、类型或 glob 标志的 `find|fd|locate` -> `glob`
  - `sed -i`、`perl -i`、`awk -i inplace` -> `edit`
  - stdout 写入文件的 `echo|printf|cat`（`echo x > f`、`cat > f`、`cat 2>err > f`、`cat <<EOF > f`）-> `write`；其他 fd 的重定向（`2>err.log`）、fd 复制、`/dev` 接收目标，以及位于 `;`、`&&`、`|` 或换行之后的重定向不计入
- 在非 UI 上下文及 `PI_NO_PTY=1` 时忽略 PTY 模式（由 `canUseInteractiveBashPty()` 控制）；工具回退到非 PTY 执行，并附加 `[pty unavailable; ran without]` 提示。
- 非 PTY 运行通过 `buildNonInteractiveEnv()` 叠加 `NON_INTERACTIVE_ENV`；PTY 运行则使用 shell 启动环境（`getShellConfig().env`），去除 `GIT_EDITOR`、`GPG_TTY`、`CI` 和 `NO_COLOR`，随后设置 `TERM=xterm-256color`，再加入 direnv 提供的值，后者优先。
- 当 shell 精简器在 `executeBash()` 中重写输出时，可见输出会替换为精简文本；如果 `onMinimizedSave` 持久保存了原始文本，还可能附加 `[raw output: local://<id>.log]` 页脚。
- 关于不专属于工具的执行器内部机制，包括 shell 会话复用键、快照、前缀处理和原生超时行为，参见 `docs/bash-tool-runtime.md`。
