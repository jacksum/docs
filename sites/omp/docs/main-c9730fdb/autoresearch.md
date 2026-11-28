---
title: "自动研究"
description: "Oh My Pi 官方仓库文档：自动研究。"
---

# 自动研究 \{#autoresearch}

自动研究将会话转变为自主优化循环：智能体编写基准测试框架、运行它、记录测得的指标、修改代码，然后再次运行，直到某种情况使其停止。它是一个内置扩展（`packages/coding-agent/src/autoresearch/`，工厂为 `createAutoresearchExtension`），由 `sdk.ts` 注册到每个工具不受限的会话中。它提供 `/autoresearch` 命令、四个工具、一个仪表盘组件、两个轮次钩子，以及恢复其状态的会话生命周期钩子。它不是后台守护进程：每次迭代都是你启动它的会话中的普通智能体轮次。

本页陈述其契约，即该模式保证什么、不保证什么，以及状态存放在哪里。`packages/coding-agent/src/autoresearch/` 中的提示模板（`prompt-setup.md`、`prompt.md`、`resume-message.md`、`command-resume.md`）是交给模型的指令，而非机制规范。

## 激活 \{#activation}

| 输入 | 效果 |
| --- | --- |
| `/autoresearch <goal>` | 进入该模式并记录 `<goal>`。在全新会话中，目标文本也会作为第一条用户消息提交。 |
| `/autoresearch` | 开启时退出该模式。关闭时进入：若没有已存储会话匹配当前分支，则不带目标进入；否则恢复该会话并保留其记录的目标。 |
| `/autoresearch off` | 退出该模式。 |
| `/autoresearch clear [--keep-tree\|--reset-tree]` | 关闭会话并重置（参见[清除](#clearing)）。 |
| `Ctrl+X`、`Ctrl+Shift+X` | 切换仪表盘组件并打开其浮层。仅影响显示。 |

进入时会追加一条 `autoresearch-control` 会话条目（`{ mode, goal? }`）并挂载四个工具；退出时追加相同条目，但设为 `mode: "off"`，若设置了目标则携带目标，并卸载这些工具。这些条目是持久记录：`reconstructControlState` 会在 `session_start`、`session_switch`、`session_branch` 和 `session_tree` 时重放它们，因此恢复会话后模式仍然保留。

**谁可以激活它。** 只有两个关卡，没有其他条件，没有设置、角色或允许列表：

- `sdk.ts` 只在会话创建时未使用 `restrictToolNames` 的情况下构造该扩展。受限会话中不存在此命令。
- `AgentSession.prompt` 将开头的 `/` 路由至扩展命令，除非调用方传入 `runCommands: false` 或 `expandPromptTemplates: false`。交互式 TUI、打印模式（`modes/print-mode.ts`）、RPC（`modes/rpc/rpc-mode.ts`）和 ACP 都使用默认路径，因此都可调用 `/autoresearch <goal>`。任务执行器（`task/executor.ts`）使用 `runCommands: false` 向子代理发送提示，因此子代理不能通过向自身发送提示来激活该模式。

除该命令和 `init_experiment` 的 `goal` 参数之外，没有设置目标的 API。程序化调用方通过将命令文本作为提示发送来设置目标。

**Git 关卡**（`autoresearch/git.ts` 中的 `ensureAutoresearchBranch`），按以下顺序应用：

1. 纯 Jujutsu 工作区（存在 `.jj/` 但没有共置的 `.git/`）会被**拒绝**。
2. 完全没有 Git 仓库：接受并发出警告。此时该模式运行时没有分支隔离、基线重置或自动提交。
3. 已在名为 `autoresearch/*` 的分支上：原样接受。
4. 否则，脏工作树会被**拒绝**，请先提交或暂存到 stash。
5. 否则，创建并检出新分支 `autoresearch/<goal-slug>-<YYYYMMDD>`，名称已被占用时添加 `-2`、`-3`、……后缀。

## 循环 \{#the-loop}

阶段 1 是框架设置。模式开启且尚无已存储会话时，`before_agent_start` 注入 `prompt-setup.md`，指示模型编写 `./autoresearch.sh`，使其以 0 退出并打印 `METRIC <name>=<value>`，用普通 `bash` 工具验证它，然后调用 `init_experiment`。

阶段 2 是迭代循环。会话存在后，`before_agent_start` 改为注入 `prompt.md`，其中携带目标、工作目录、分支、基线提交、笔记、当前分段、基线和最佳指标、最近三次运行、缺乏理由的范围偏离，以及任何待处理运行。

循环本身是 `agent_end` 钩子。当一轮结束且模式开启时，钩子会将 `resume-message.md` 作为隐藏消息发送（`customType: "autoresearch-resume"`、`display: false`，使用 `triggerTurn` 作为下一轮交付）。当该轮准备了恢复时会发送，`init_experiment`、`run_experiment` 和 `log_experiment` 都会准备恢复；或者当已完成的运行仍未记录，且尚未为该运行发送恢复时发送。因此，一次迭代为：编辑、`run_experiment`、`log_experiment`、`agent_end`、隐藏恢复消息、下一轮。

## 停止条件 \{#stop-conditions}

只要有内容准备恢复，循环就会继续，因此没有任何内容这样做时，它就会结束。有三个条件会主动结束它，优先级如下。自动研究本身不添加裁判、裁决模型或自己的预算，不进行 token、成本或墙钟时间核算。普通的会话级限制（会话成本关卡、`--max-time`）仍然适用，而 `run_experiment` 有自己的每次运行超时（`timeout_seconds`，默认 600），它限制单次基准测试运行，而非整个循环。

| 优先级 | 条件 | 终止性？ |
| --- | --- | --- |
| 1 | **待处理用户输入。** `agent_end` 首先检查 `ctx.hasPendingMessages()`，然后直接返回，不重新发送提示。 | **否** |
| 2 | 当前分段**达到迭代上限**，在 `log_experiment` 记录运行之后检查。 | 是，直到重新启用 |
| 3 | **显式 `off` 或 `clear`。** | 是 |

**待处理用户输入不是终止条件。** 它只取消该轮的恢复准备；模式保持开启，工具保持挂载，下次 `log_experiment` 又会准备恢复，因此循环会从中断处继续。应将其视为暂停，绝不能视为“循环已完成”。

第四种更安静的停止方式只是某一轮没有准备任何恢复：当没有工具准备恢复，也没有新完成的运行等待记录时，`agent_end` 也会直接返回而不重新发送提示。只读取代码的轮次，或者在已为待处理运行发送恢复后才结束的轮次，不会再安排一次恢复。

## 更改分支 \{#changing-branch}

**更改分支不会停止循环，但会破坏它。** 自动研究不会被禁用，其工具也不会卸载。两个钩子都通过 `getActiveSessionForBranch` 解析当前分支最近的未关闭实验，因此接下来发生什么取决于目标分支。如果目标分支没有未关闭实验，智能体会收到阶段 1 设置提示，就像从未打开过实验一样，而 `run_experiment`、`log_experiment` 和 `update_notes` 都会回答 `Error: no active autoresearch session for the current branch`；已经准备好的恢复仍可能发送一次，此后循环就会安静下来。如果目标分支有自己的未关闭实验，钩子和工具会改用**那个**实验。检出记录的分支后，下一轮会恢复其实验。本应在分支变化时卸载工具的守卫（`before_agent_start` 中的 `onActiveBranch`）将找到的会话分支与当前分支比较，但查找已经按该分支过滤，因此它永远不会触发。无论哪种情况，都不会记录日志或给出通知，因此当循环看似停滞且没有任何记录时，这个原因很容易被忽略。

三个细节进一步明确了这一点。

**两个分支读取器不会产生分歧。** 钩子通过 `vcs.repo().label()` 读取分支，三个工具通过 `vcs.git().currentBranch()` 读取；在 Git 检出中，两者都解析到同一个 `current_branch`，包括分离 HEAD。只有在 Jujutsu 工作区中它们才会不同，但 `ensureAutoresearchBranch` 会直接拒绝该工作区，而共置的 jj+git 检出中两者都解析到 Git。这种重复是未来修改任一读取器时的陷阱，而非当前缺陷。

**分离 HEAD 属于无实验情况。** 两个读取器在此仍然一致：都报告没有分支。查找随后落入 `branch IS NULL` 分支，而它永远不会匹配在命名分支上打开的实验。

**离开原分支的智能体可以打开第二个实验。** 收到阶段 1 后，它可能按阶段 1 的要求调用 `init_experiment`，在同一数据库中针对新分支打开**第二个**已存储会话，同时第一个仍保持未关闭状态。

分支处理是该子系统中最不直观的部分，也是最值得实测而非推理的部分：三个独立位置决定一轮属于哪个实验，即分支读取器、按分支过滤的查找，以及被该查找变为不可达的 `onActiveBranch` 守卫；而提示和工具错误字符串不区分“还没有实验”和“存在一个你已离开的实验”。这里的更改应在真实仓库中针对上述每种情况进行验证，而不是从调用点推断。

## 迭代上限按分段计算，默认没有上限 \{#the-iteration-cap-is-per-segment-and-defaults-to-none}

`init_experiment` 上的 `max_iterations` 是上限的唯一来源。它是可选的；未提供时，存储的 `max_iterations` 为 `null`，并且**不存在上限**。循环随后持续到用户消息、显式 `off` 或某一轮未准备任何恢复为止。

设置了上限时，`log_experiment` 会将它与**当前分段中**已记录的运行次数比较，在 `segment runs >= max_iterations` 时停止。分段是一个会话中的基线时期：带 `new_segment: true` 的 `init_experiment` 会推进分段，计数重新从零开始，因此在该调用中再次提供的上限会重新应用于新分段。上限为 20 并不意味着一个会话最多运行 20 次，而是每个分段最多 20 次。

还应考虑两个后果：

- **每次** `init_experiment` 调用都会重写 `max_iterations`，包括重新配置调用。不带该参数再次调用 `init_experiment` 会清除上限，包括 `new_segment: true` 调用，因此若不提供上限，就不会将其延续到新分段。
- 达到上限会追加 `{ mode: "off" }` 并卸载工具，但不会关闭已存储会话或触及工作树。`/autoresearch` 会重新进入同一会话，但分段运行计数没有改变，因此紧接着记录的下一次运行又会触发 `segment runs >= max_iterations`。重新进入**每次只多运行一次**，直到 `new_segment: true` 或新的上限改变计算结果。

**希望为会话设定总预算的调用方必须自行跟踪。** 子系统中没有任何机制为了停止而跨分段累计运行次数，也没有任何机制统计轮次、token 或费用。

## 工具 \{#tools}

四个工具都声明了 `defaultInactive`，因此在进入模式之前不可见，退出时又会被卸载。除 `init_experiment` 外，其他工具都要求存在匹配当前 Git 分支的已存储会话，否则会拒绝执行。

| 工具 | 契约 |
| --- | --- |
| `init_experiment` | 打开会话，或重新配置已打开的会话。首次调用及任何 `new_segment: true` 调用都要求 `./autoresearch.sh` 存在，也只有这些调用会将脏工作树自动提交为框架提交，且仅在 `autoresearch/*` 分支上；提交失败会警告并继续。会话打开时将基线提交设为 `HEAD`，只有 `new_segment: true` 才会重写它；普通重新配置不会修改它。接受指标名称、单位、方向（默认为 `lower`）、次要指标、范围和禁止修改路径、约束以及 `max_iterations`。 |
| `run_experiment` | 运行框架。命令固定且不能覆盖；唯一参数是 `timeout_seconds`（默认 600；非正值实际上意味着无界）。先放弃先前未记录的运行，插入待处理行，将输出流式写入运行日志，并从中解析 `METRIC`/`ASI` 行。 |
| `log_experiment` | 完成那一次待处理运行。要求提供 `metric`、`status`（`keep`、`discard`、`crash`、`checks_failed`）和 `description`。记录修改路径、范围偏离、可选 `justification`，以及将早先运行排除在基线和最佳指标计算之外的 `flag_runs` 条目。重新计算置信度数值（距基线的距离，以绝对中位差的倍数表示；分段中可用运行少于三次时为 `null`）。 |
| `update_notes` | 替换会话笔记（`body`），或在 `## Ideas` 标题下追加一个项目符号（`append_idea`）。笔记在每次迭代中注入系统提示。 |

**`log_experiment` 对工作树的影响。** `keep` 时，修改的文件会被暂存并提交，但仅限 `autoresearch/*` 分支；否则会跳过提交并发出警告，更改留在工作树中。`discard`、`crash` 和 `checks_failed` 会回退，两种分支情况下的回退范围不同：在 `autoresearch/*` 分支上，`revertFailedExperiment` 运行 `git reset --hard HEAD` 加 `git clean`，丢弃工作树中所有已跟踪更改和所有未被忽略的未跟踪文件，包括未提交的 `autoresearch.sh`，这正是 `init_experiment` 的框架自动提交失败时的风险。被忽略的文件和嵌套仓库会保留下来，因为调用 `clean` 使用默认选项。不在 `autoresearch/*` 分支上时，回退改为通过 `computeRunModifiedPaths` 执行，它会跳过运行前已经是脏状态的每个路径，因此在 `run_experiment` 开始前写入的文件，包括框架，恰好就是它不会修改的文件；用户不相关的编辑也出于同样原因是安全的。

设置提示自身的 `baseline_warning` 字符串仍陈述与上一句相反的内容：它告诉智能体，在原分支之外，“`log_experiment discard` 只会回退运行修改的文件……因此在 `init_experiment` 之前写入的框架文件可能无法在丢弃后保留”。代码行为如上所述；该警告已过时，同时看到二者的读者应遵循代码。

**范围、禁止修改项、约束和报告的状态都是记录，而非关卡。** 没有任何机制阻止编辑。`log_experiment` 会先提交保留的运行，再追加范围偏离警告；它不会因为路径被禁止修改、基准测试以非零退出或指标与解析值不一致而拒绝 `keep`。约束更弱：`init_experiment` 存储它们，`buildExperimentState` 携带它们，但没有任何内容将它们提供给迭代模板，`prompt.md` 也从不渲染它们，因此它们被记录却从不重放。笔记则在每次迭代中重放。状态由智能体选择，因此错误状态会被记录，而不会被检测出来。

## 框架契约 \{#harness-contract}

工作目录中的 `./autoresearch.sh`。`run_experiment` 将命令记录为 `bash autoresearch.sh`，除 Windows 外，各处都精确运行该命令；在 Windows 上，若存在解析后的宿主 POSIX shell，`resolveHarnessExecLine` 会替换为它（`<shell> autoresearch.sh`），使裸 `bash` 不会解析到 WSL 启动器。记录的命令仍显示为 `bash autoresearch.sh`。

标准输出和标准错误会被捕获到运行日志中，但不是逐字节保留：两个流都经过共享的 `OutputSink`，其 `push` 会将回车规范化为换行，并在写入任何内容前对每个分块运行 `sanitizeText`。颜色转义序列和基于 CR 的进度重绘不会保留到 `benchmark.log`。从同一流中解析两种行形式（`autoresearch/helpers.ts` 中的 `ExperimentOutputScanner`）：

```text
METRIC <name>=<value>
ASI <key>=<value>
```

- `METRIC` 名称匹配 `[\w.µ-]+`，其值必须能解析为有限数。关键字后的分隔符是 `\s+`，可以包含换行，因此接受 `METRIC` 在一行、`name=value` 在下一行的情况，流式扫描器特意为此暂缓处理该关键字。名称等于会话主要指标的指标成为该运行解析出的主要指标；其余为次要指标。名称重复时保留最后一个值。`log_experiment` 在模型报告的指标与解析值不同时发出警告，并存储两者。
- `ASI` 值是自由形式的元数据：`true`、`false`、`null`、数字、JSON 对象/数组/字符串，其他情况则是原始文本。
- 两者都拒绝将 `__proto__`、`constructor` 和 `prototype` 用作名称。
- 退出码为 0 且未超时表示运行通过。因超时而取消的运行会被记录为设置了 `timed_out`，无论它之前打印了什么。

## 结果存储 \{#the-results-store}

`OMP_AUTORESEARCH_DB_DIR` **改变存放本地 SQLite 文件的目录位置，不选择后端。** `autoresearch/storage.ts` 中的 `resolveAutoresearchPaths` 是唯一读取该变量的代码，它只做一件事：将覆盖目录而非默认根目录与项目键拼接。没有驱动注册表，也没有远程选项：`AutoresearchStorage` 是基于 `bun:sqlite` 的具体类，通过 `openAutoresearchStorage` 和 `openAutoresearchStorageIfExists` 访问。

**将其设为前后不带空白的绝对路径。** 该值直接传给 `path.join`：与环境变量参考中相邻的覆盖项不同，它不会修剪空白，不会展开 `~`，也不要求是绝对路径。下面三种其他写法均已对照此代码实测：

- `bench-db` 这样的**相对**值会将数据库和产物目录放在进程工作目录下的同一棵树中，后续进程也能找到它们。
- 以**字面波浪号**开头的值同样如此，但放在名为 `~` 的目录下；主目录展开后的路径处不会创建任何内容。在 shell 中，需要写作 `OMP_AUTORESEARCH_DB_DIR='~/bench-db'`，因为不带引号的 `~/bench-db` 会在 omp 看到它之前展开。
- **前导空格**会使打开操作的两个部分分离，因为修剪空白会将本来相对的路径变成绝对路径。`mkdirSync` 在一个仅为空格的路径组成部分下创建目录，而 SQLite 打开修剪空白后的路径：如果那里没有目录，打开会失败并报 `unable to open database file`；如果有，则会改为在那里成功打开。此时数据库位于修剪后的路径，而 `storage.projectDir` 保留空格，因此运行日志和数据库落在不同的树中，`fs.existsSync(dbPath)`，即 `openAutoresearchStorageIfExists` 中的探测，也找不到任何内容。两个钩子以及 `run_experiment`、`log_experiment` 和 `update_notes` 随后都会表现得像没有实验一样，这比听起来更糟：钩子将阶段 1 设置提示交给智能体，智能体遵从后的下一步是 `init_experiment`，而它改为通过 `openAutoresearchStorage` 执行。后者没有存在性探测，因此会打开修剪后的路径，通过 `getActiveSessionForBranch` 找到已存储会话，跳过框架要求，并**重写已经存在的实验的目标、上限、范围、禁止修改项、约束和指标定义**，放弃任何待处理运行。`/autoresearch clear` 同样会通过 `getActiveSession` 找到该会话并关闭它，且在满足[清除](#clearing)中的条件时重置工作树。任一调用都会在未修剪的键下重新填充缓存，因此在该进程剩余的生命周期中，进行探测的读取器又能找到数据库。

没有验证会拒绝这些值，也没有任何机制报告这种分歧，因此应将第三种情况视为缺陷，而非特殊行为。

布局按 Git 仓库根目录划分（无仓库时使用工作目录），编码为单个路径段 `--<root with separators replaced by ->--`：

| 路径 | 内容 |
| --- | --- |
| `<dir>/<project-key>.db` | SQLite 数据库：会话和运行。 |
| `<dir>/<project-key>/runs/NNNN/benchmark.log` | 运行 `NNNN` 的捕获输出，编号补零至四位。 |

设置了 `OMP_AUTORESEARCH_DB_DIR` 时，`<dir>` 就是该值，否则为 omp 状态根目录的 `autoresearch` 子目录，默认是 `~/.omp/autoresearch`，但命名配置档案或现有 XDG 状态根目录会改变其位置（`packages/utils/src/dirs.ts` 中的 `getAutoresearchDbPath`、`getAutoresearchProjectDir`）。该编码对于特殊根目录并非无冲突（`/a/b` 和 `/a-b` 会冲突），但为了兼容现有状态而固定不变。

调用方还应了解存储的其他属性：

- **文件按需创建。** 文件不存在时，`openAutoresearchStorageIfExists` 返回 `null`，而扩展只有在会话控制条目显示自动研究已激活后才会查看存储。从未触及该模式的会话不会创建数据库，但有一个例外：`/autoresearch clear` 通过 `openAutoresearchStorage` 打开存储，即使没有任何内容可清除，也会创建目录和文件。
- **每组有效状态根目录和仓库根目录对应一个数据库，由其上的所有会话共享。** 会话在其中通过行上记录的 Git 分支区分；`getActiveSessionForBranch` 返回当前分支最近的未关闭会话，将两边都“无分支”视为匹配。因此，在*相同*分支和根目录上的两个会话会驱动*同一个*已存储会话。设置了 `PRAGMA journal_mode=WAL` 和 `PRAGMA busy_timeout = 5000`；在一个进程内，按数据库路径为键的模块级缓存会给两个会话提供同一个 `AutoresearchStorage` 实例。除此之外，没有任何机制仲裁并发会话，子系统也不提供并发保证。
- **模式只创建，从不迁移。** 表使用 `CREATE TABLE IF NOT EXISTS`。构造函数读取 `PRAGMA user_version`，当它较低时将其提升到 `SCHEMA_VERSION`，较高版本保持不变；这次读取只决定是否标记版本，没有任何逻辑根据旧值分支。目前没有升级路径，因此未来的列必须是增量添加的，或由新代码处理。
- **这里从不删除。** 关闭会话会设置 `closed_at`；放弃待处理运行会设置 `abandoned_at`；标记运行会设置 `flagged`。行和运行日志会不断累积，直到手动移除。
- **存储模块已导出；其模式不是契约。** `@oh-my-pi/pi-coding-agent/autoresearch/storage` 是包导出，因此可以导入 `AutoresearchStorage` 及其 `listRuns` / `listLoggedRuns` 读取器，而不必手动打开文件。不过，没有任何机制为外部使用者对该模式进行版本管理，`user_version` 只会被提升到当前值，从不用于迁移，因此应将类和表结构都视为会变化的目标。

### 表 \{#tables}

`sessions` 为每个实验会话保存一行：名称、目标、带单位和方向的主要指标、首选命令、分支、基线提交、当前分段、`max_iterations`、范围路径/禁止修改路径/约束/次要指标名称的 JSON 数组、笔记数据块、`created_at` 和 `closed_at`。

`runs` 为每次 `run_experiment` 调用保存一行，通过带 `ON DELETE CASCADE` 的键关联会话。它分三次写入：开始时插入（分段、命令、运行前脏路径、日志路径）；进程退出时完成（持续时间、退出码、超时标志、解析的指标和 ASI）；`log_experiment` 最终处理时记录（状态、描述、指标、提交、修改路径、范围偏离、理由、置信度）。满足 `status IS NULL AND abandoned_at IS NULL` 的行就是待处理运行。按顺序使用时最多只有一行：`run_experiment` 在插入自己的行之前会放弃任何先前运行。这没有通过约束或事务强制执行，而且放弃与插入之间存在 await，因此两个重叠的 `run_experiment` 调用可能在同一会话中留下两条待处理行。

两个表都使用 SQLite rowid 别名 `id`。运行 id 是用户可见的运行编号，也是 `flag_runs` 的 `run_id` 参数。时间戳为 epoch 毫秒数。

## 清除 \{#clearing}

`/autoresearch clear` 是主动重置：它关闭实验并重置会话运行时状态，已存储历史会保留。它也**不是**唯一的破坏性路径，带 `discard`、`crash` 或 `checks_failed` 的 `log_experiment` 同样会回退工作树，而且在 `autoresearch/*` 分支上，该回退是 `git reset --hard HEAD` 加 `git clean`。清除执行四件事：

1. 当位于 `autoresearch/*` 分支，或传入 `--reset-tree` 时，使用 `git reset --hard` 加 `git clean` 将工作树重置到会话的基线提交；传入 `--keep-tree` 时不执行。未记录基线时，会警告并跳过重置。
2. 从工作目录删除一组固定的旧版磁盘产物，**其中包括 `autoresearch.sh`**，以及 `autoresearch.md`、`autoresearch.checks.sh`、`autoresearch.program.md`、`autoresearch.ideas.md`、`autoresearch.jsonl`、`autoresearch.config.json` 和 `.autoresearch/`。`--keep-tree` 阻止的是 Git 重置，而不是这些删除。
3. 通过设置 `closed_at` 关闭已存储会话。保留行和运行日志；历史仍可读取。
4. 追加 `{ mode: "clear" }`，同时丢弃记录的目标，并卸载工具。

**`clear` 选择会话时不考虑分支，这看起来是一个缺陷。** 它通过 `getActiveSession` 关闭最近的仍未关闭会话，因此在一个分支上，它可以将工作树重置到另一个分支的基线，并关闭另一个会话。子系统中的其他所有查找都通过 `getActiveSessionForBranch`；代码及其注释没有任何内容表明此处有意作为例外，而它带来的后果，即针对不属于当前工作的基线执行硬重置，是子系统中破坏性最大的。

## 另请参阅 \{#see-also}

- [`OMP_AUTORESEARCH_DB_DIR`](./environment-variables.md)：环境变量参考中的目录覆盖项。
- [会话](./session.md)：该模式记录和重放的 `autoresearch-control` 会话条目。
- [扩展](./extensions.md)和[钩子](./hooks.md)：构建该循环所依赖的 `before_agent_start` / `agent_end` 机制。
- [斜杠命令内部机制](./slash-command-internals.md)：`/autoresearch` 如何分发。
