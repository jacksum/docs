---
title: "task"
description: "Oh My Pi 官方仓库文档：task。"
---

# task \{#task}

> 启动子代理，每次调用一个，或每次调用一批 `tasks[]`（`task.batch`，默认开启）。当 `async.enabled=true` 时，普通启动在后台运行；否则调用会阻塞，直到它们完成。执行模式按条目决定：自定义智能体类型声明了 `blocking: true` 的条目会内联运行，同一调用中的非阻塞条目仍会作为后台作业启动。目前没有内置智能体声明 `blocking: true`。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/task/index.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/task.md`
- 关键协作组件：
   - `packages/coding-agent/src/task/types.ts`：动态模式、智能体定义、输出上限。
   - `packages/coding-agent/src/ui/tools/task.tsx` / `packages/coding-agent/src/task/task-details.ts`：进度/结果渲染和工具详情类型。
   - `packages/coding-agent/src/task/structured-subagent.ts`：共享的 task/eval 预检、模型/模式策略、产物保留、执行。
   - `packages/coding-agent/src/task/isolation-runner.ts`：隔离捕获、合并、恢复和生命周期所有权。
   - `packages/coding-agent/src/task/eval-tools.ts`：向子级公开父级内核工具。
   - `packages/coding-agent/src/task/discovery.ts`：发现项目/用户/插件/内置智能体。
   - `packages/coding-agent/src/task/agents.ts`：内置智能体定义和 frontmatter 解析。
   - `packages/coding-agent/src/task/executor.ts`：创建子会话、运行子代理、收集输出，并将已完成的会话交给生命周期管理器。
   - `packages/coding-agent/src/thread/`：子代理工作线程，包括工作线程池（`subagent-worker.ts`）、主线程↔工作线程 RPC（`rpc.ts`）、运行路由（`executor-routing.ts`）、由工作线程承载的会话在主线程侧的镜像（`remote-agent-session.ts`），以及每个共享主线程服务各自的桥接（`services/`）。
   - `packages/coding-agent/src/registry/agent-lifecycle.ts`：已完成子代理的空闲 TTL 停驻与唤醒。
   - `packages/coding-agent/src/registry/agent-registry.ts`：进程全局智能体目录（`running | idle | parked | aborted`）。
   - `packages/coding-agent/src/async/job-manager.ts`：后台作业注册、进度和结果投递。
   - `packages/coding-agent/src/task/parallel.ts`：用于会话作用域并发上限的 `Semaphore`。
   - `@oh-my-pi/pi-natives`（`crates/iso`）：隔离 PAL，包括 `isoResolve` / `isoStart` / `isoStop` 后端解析与回退。
   - `packages/coding-agent/src/task/worktree.ts`：隔离后端映射（`parseIsolationBackend`）和生命周期（`ensureIsolation`/`cleanupIsolation`）、补丁捕获、分支合并。
   - `packages/coding-agent/src/task/output-manager.ts`：会话作用域的 `agent://` ID 分配。
   - `packages/coding-agent/src/task/name-generator.ts`：默认的 AdjectiveNoun 智能体 ID。
   - `packages/coding-agent/src/internal-urls/agent-protocol.ts`：将 `agent://<id>` 解析到已保存的子代理输出。
   - `packages/coding-agent/src/internal-urls/history-protocol.ts`：将 `history://<id>` 解析为简明会话记录。
   - `packages/coding-agent/src/tools/index.ts`：工具注册和递归深度控制。
   - `packages/coding-agent/src/sdk.ts`：子会话路由器/工具接线以及每个子代理的 `AgentOutputManager`。
   - `docs/task-agent-discovery.md`：更深入的发现和优先级说明。

## 输入 \{#inputs}

传输模式的形状由 `task.batch` 切换（默认开启）。一个工作单元为 `{ name?, agent?, model?, task, solutionSpace, effort?, outputSchema?, schemaMode?, tools?, isolated? }`。`isolated` 仅在 `task.isolation.enabled` 为 true **且计划模式禁用**时存在；`effort` 要求 `task.enableEffort=true`（默认关闭），`tools` 要求 `eval.tools.enabled`（默认关闭）。

`task.steps`（默认关闭）会在两种形状的传输模式和工具说明中，将 `task` 替换为 `steps: string[]`：模型只会看到两者之一。运行时接受任一种（内部调用方、过期会话记录），但会拒绝同时携带两者的条目。

- **批量形状**（`task.batch` 开启）：`{ context, tasks: item[] }`，每个条目一个子代理，全部遵循相同的扇出规则运行；没有顶层智能体字段。`context` 是**必填**的共享背景，会渲染到每个启动的子代理的系统提示词中（`CONTEXT` 节）；`agent`、`outputSchema` 和 `schemaMode` 按条目设置。`effort` 仅在相应设置启用时添加；`isolated` 还要求计划模式禁用。
- **扁平形状**（`task.batch` 关闭）：`{ ...item }`，每次调用恰好启动一个。共享背景放入 `local://` 文件（例如 `local://ctx.md`），由每次启动的 `task` 引用；子代理共享父级的 `local://` 根目录。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `context` | `string` | 是（批量） | 通过子代理系统提示词添加到此次调用每次启动内容之前的共享背景。`task.batch` 关闭时会被拒绝。 |
| `tasks` | `array` | 是（批量） | 每个子代理一个任务条目。提供的名称须在调用内唯一（不区分大小写）。`task.batch` 关闭时会被拒绝。 |
| `name` | `string` | 否 | 稳定的智能体名称，会成为注册表/IRC ID。提示词要求 CamelCase，最多 32 个字符；传输模式只要求它是字符串。默认为生成的 AdjectiveNoun 名称，并由 `AgentOutputManager` 在每个会话内确保唯一。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `agent` | `string` | 否 | 运行此条目的智能体类型（例如 `scout`）。默认为启动策略的默认智能体（通常为 `task`）；同一次批量调用中的条目可以使用不同的智能体类型。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `model` | `string` | 否 | 按调用指定的模型：一个确切的 `provider/model-id[@upstream][:level]`，仅在 `task.perCallModel` 为 `on` 时接受，且限于操作方批准的模型；否则调用在预检时失败（参见[按调用指定的 `model`](../task-agent-discovery.md#per-call-model)）。`@upstream` 是仅适用于聚合器的路由固定标记，也是模型身份的一部分。仅当 `task.perCallModel` 为 `on` 时出现在模式中；未公开的 `model` 仍会进入预检，而不会被丢弃。空字符串视为省略。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `task` | `string` | 是，除非 `task.steps` 开启 | 完整、自包含的指令。去除首尾空白后为空会被拒绝。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `steps` | `string[]` | 是，当 `task.steps` 开启时 | 替代 `task`：一个子代理的有序阶段，每项非空。第一项是初始提示词；后续每项在子代理交付上一项后发送（终态 `yield`，或未使用 `yield` 的最终消息）。超过 `MAX_STEPS`（4）时，多个步骤会共用提示词，较早的提示词分配到额外步骤（5 → 2-1-1-1）。子代理针对前面各提示词交付的内容会作为 IRC 进度通知到达启动方（忙碌的启动方会在下一个步骤边界读取，空闲的启动方会被唤醒，`wait` 则继续等待）；最后一个提示词的结果就是此次启动的结果。失败的 `yield` 或预算停止会提前结束该链。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `solutionSpace` | `string` | 是 | 子级问题的开放程度：是否已给出修复或设计，或哪些原因或设计仍待确定（例如 `one fix: rename, names given`；`deadlock cause open, no repro`）。工作量不会扩大它。它随子级的首个提示词进入 `auto` 思考分类器，作为其唯一输入，判断器看到的是此字段，而非 `task` 文本；当子级的思考选择器不是 `auto` 或 `effort` 覆盖它时会被忽略。空白或缺失值会回退为对 `task` 文本分类：模式将其标为必填，但工具宽松的参数验证仍会启动省略该字段的调用。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `effort` | `"lo" \| "med" \| "hi"` | 否 | 仅在 `task.enableEffort=true` 时存在。按每次启动指定思考投入，映射到所解析模型支持的范围（其可达到的最低/中间/最高级别，例如 `high`/`xhigh`/`max`）。覆盖智能体的默认选择器，包括 `auto`，但标签指定了级别的提及智能体，以及带有显式 `:level` 的按调用指定 `model` 都会忽略它；省略时保留智能体配置的选择器，只有配置为 `auto` 的智能体才会按提示词自动分类（例如内置 `task`）；`scout`/`sonic` 配置为 `medium`。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `outputSchema` | JSON Schema（粗粒度传输验证层中为 `object \| boolean \| string \| null`） | 否 | 本次调用特定的结构化输出契约。优先于智能体 frontmatter 的 `output` 和继承的父会话模式。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `schemaMode` | `"permissive" \| "strict"` | 否 | 有效输出模式的验证模式。覆盖父级模式；默认为 `permissive`。模式重试耗尽后，宽松模式可在发出警告的情况下接受无效载荷；严格模式会失败。任一模式下，无效的调用方模式都会在预检时失败。 |
| `tools` | `string[]` | 否 | 父级 Python 或 JS eval 内核中已定义的命名工具。`eval.tools.enabled=true` 时存在；子级调用在父级内核中执行，而非子级内核。计划模式下会被拒绝。在批量形状中是条目字段，在扁平形状中位于顶层。 |
| `isolated` | `boolean` | 否 | 在隔离工作区中运行，并捕获补丁/分支变更。仅在 `task.isolation.enabled` 为 true 且计划模式禁用时存在。保持存活的任务智能体在空闲/停驻转换期间保留工作区，并可被唤醒；释放会捕获最终变更并清理工作区。 |

没有传输层标签字段：TUI/注册表中显示的单行 UI 标签由 tiny/title 模型根据 `task` 文本自动生成（发起后不等待），因此调用方从不提供它。

当 `task.steps` 开启时，条目形式为 `{ "name": "Implement", "steps": ["Add the parser in src/parse.ts.", "Wire it into the CLI.", "Cover both with tests."], "solutionSpace": "…" }`。每个步骤的文本会去除首尾空白，以 LF 换行符发送给子代理，并保留内部空白。运行会将已发送的提示词记录为 `task-steps` 会话条目，因此 `omp --restore` 会在中断的子代理恢复其轮次后，发送它尚未处理的提示词。

用户可以在输入框中使用 `^` 标记模型。生成的会话本地 `m1`、`m2`、… 伪名可被 task、eval `agent()` 和 `workpool()` 接受为 `agent`；每个都使用固定到所标记选择器的内置 task 模板。`^provider/model:level` 标签还会设置智能体的初始投入级别，`effort` 提示不会覆盖它。不带级别的用户标记 `^provider/model` 智能体会授权其标记模型用于按调用选择，但受 `task.perCallModelAllow` 约束；对带级别标签的智能体按调用指定 `model` 会产生冲突错误。持久化、边界和优先级详见[用户标记的模型智能体](../task-agent-discovery.md#user-tagged-model-agents)。

某个入口启用按调用选择时，task/eval 工具说明会列出操作方设置中批准的角色模型，以及用于缩小范围的允许列表；项目设置绝不能添加模型，只能缩小列表。

运行时保持宽松：即使 `task.batch` 开启，也接受扁平形式（用于内部调用方，例如提交流程的 `analyze_files`，以及过期会话记录）。模型始终只看到一种形状。

批量调用会拒绝顶层 `agent`，而不是静默丢弃专用选择器并启动默认智能体。选择 `reviewer`、`scout` 或自定义智能体时，请将 `agent` 放在每个 `tasks[]` 条目上；智能体名称不会从任务文本推断。

没有旧版的按调用 `schema` 参数。请使用 `outputSchema` 和可选的 `schemaMode`；缺失时，结构化输出回退到智能体定义的 `output` frontmatter，然后回退到继承的父会话模式。

## 输出 \{#outputs}

工具返回一个文本块以及 `details: TaskToolDetails`。

分步骤启动的 `assignment`（位于 `details.progress` 项和 `details.results` 条目中）将所有步骤列为一份 Markdown 简报；`task` 是初始提示词，只携带第一项。

当 `async.enabled=true` 时，Task 工具说明会提供投递规则：结果自动投递，受阻的调用方可在工具启用时使用 `wait`，且 `completed` 结果声称的产物尚未验证。作业生命周期参考（`read proc://<id>` 检查而不消费投递、`write proc://<id>/kill` 取消、结果和作业 ID 的保留时长，以及启用对等消息时的 `write agent://<id>`）仅随每个 `TaskTool` 实例的首个启动结果提供；后续确认不再重复。

替换 `task` 的扩展会在其说明中继承此指导（原生工具的 `delegationGuidance`），用于通过 `ctx.invokeTool` 委派的调用，同时保留自身的调用指令和输入模式。

后台响应（`async.enabled=true`）：

- `content`：``Spawned agent `<id>` (job `<jobId>`).``（会话的首个启动结果后面还会附上作业生命周期参考）。批量调用则返回 `Spawned N background agents using <agent types>. ...`（去重后的各条目智能体类型，以逗号连接），并附带每个智能体的 `- `<id>`(job`<jobId>`)` 列表。
- `details`：`{ projectAgentsDir, results, totalDurationMs, progress: [<AgentProgress per spawn>], async: { state, jobId, type: "task" } }`。调用维护一个共享的 `progress[]` 快照；`async.jobId` 是首个启动的作业，`async.state` 汇总异步启动的状态（全部作业结束前为“running”，任一启动失败时为“failed”），调用返回前已经结束的作业会得到反映。混合调用的 `results` 携带阻塞启动的内联 `SingleResult`（纯后台调用返回 `results: []`）。
- 实时进度通过 `onUpdate(...)` 流入同一工具块；最终结果以异步结果注入的形式到达。启用消息传递时，非隔离完成会获得空闲/跟进提示。可恢复的已中止智能体会获得恢复提示；隔离运行则指向会话记录。尽管下文描述了保留工作区的生命周期，当前 `task-follow-up.md` 模板仍将隔离运行标为不可恢复。

已结束响应（`async.enabled=false`、无作业管理器、每个条目的智能体均为 `blocking: true`，或异步作业体）：

- `content`：根据 `packages/coding-agent/src/prompts/tools/task-summary.md` 渲染的摘要；不超过 11500 个字符的输出会完整内联，更长输出显示 5000 个字符的预览，`agent://<id>` 保存完整输出。同步批次会连接各次启动的摘要。
- `details.results`：每次启动一个 `SingleResult`；填充 `usage`、`outputPaths`（同步批次会跨各次启动汇总）。

`SingleResult` 包括：

- 身份：`index`、`id`、`agent`、`agentSource`、`task`、`description`，可选的 `assignment`（内部载荷名称；传输字段为 `name`/`agent`/`task`）
- 状态：`exitCode`，可选的 `error`、`aborted`、`abortReason`、`retryFailure`
- 输出：`output`、`stderr`、`truncated`、`durationMs`、`tokens`、`requests`，可选的 `contextTokens`/`contextWindow`，以及 `usage`
- 模型：可选的 `modelOverride`、`modelRole`、`resolvedModel`、`resolvedModelIdentity`、`resolvedThinkingLevel`、`resolvedModelIsFallback`、`resolvedModelRoute`、`advisor`
- 结构化结果：可选的 `structuredOutput`，包含模式来源/模式、验证状态、解析后的 `data` 和验证 `error`
- 产物元数据：`outputPath?`、`isolated?`、`patchPath?`、`hasRootChanges?`、`branchName?`、`branchBaseSha?`、`nestedPatches?`、`nestedPatchPaths?`、`outputMeta?`
- 提取的工具数据：`extractedToolData?`，来自 `yield` 等已注册的子进程工具处理器

产物与旁路通道：

- 每个有产物目录的子代理都会写入 `<id>.md`；`agent://<id>` 解析到该文件。
- 带有 `data` 值的结构化载荷还会写入 `<id>.json`，即使不符合模式也如此。JSON 路径读取优先使用此附属文件，找不到时回退到解析 `<id>.md`；后续输出若没有结构化数据，会删除过期的附属文件。
- 子代理自己的子级使用点号限定名称（`<id>.<child>`）；`agent://<id>.<child>` 读取该嵌套输出。斜杠路径始终用于 JSON 提取：`agent://<id>/<key>/<index>/…` 从 JSON 输出中提取该值（例如 `agent://<id>.<child>/reports/0/data`）。
- 父级持久化产物时，每个子代理都会获得 `<id>.jsonl` 会话历史；`history://<id>` 将其呈现为简洁的会话记录（适用于活跃和已停驻的智能体）。
- 隔离补丁模式在合并前写入 `<id>.patch`；两种合并模式下，嵌套更改都会写入 `<id>.nested-<n>-<path>.patch` 文件。

## 流程 \{#flow}

1. `TaskTool.create(...)` 通过以解析后的 cwd 和有效扩展根目录为键的进程级记忆缓存来发现智能体（`discoverAgentsForCreate`）。显式重新加载后，`refreshAgentDiscovery(...)` 会替换匹配的描述快照。
2. `execute(...)` 修复行内正文（`repairTaskParams`），然后验证：始终拒绝 `schema`；除非启用 `task.batch`，否则拒绝 `tasks`/`context`；批量调用需要非空的 `tasks`、所提供名称互不重复、非空的共享 `context`，且不能在 `tasks` 之外同时提供顶层 `task` 或 `steps`。每个条目或平铺调用需要非空的 `task` 或非空的 `steps` 列表，不能两者兼有。在正常分派开始任何派生之前，调用会先归一化为派生列表（`resolveSpawnItems`）。
   在正常分派注册作业之前，会预检 eval 工具名称和每个条目的有效派生策略。未知/已禁用的智能体、无效的调用方模式、深度/派生策略违规以及不可用的计划模式控制项，都会在分派前使调用失败。
3. 按条目划分执行方式：智能体类型声明了 `blocking: true` 的条目以内联方式运行；其余条目成为后台作业。当 `async.enabled=false`、会话没有 `AsyncJobManager`（失去宿主的孤立实例），或所有条目均为阻塞式时，整个调用同步运行；内联派生以 `SpawnRun`（`src/task/spawn-run.ts`）运行，每个运行在结束前都持有一个会话级信号量许可。
4. 后台执行（任何启用 `async.enabled=true` 且有 `AsyncJobManager` 的非阻塞条目）：
   - 通过 `AgentOutputManager.allocate(...)` 提前分配智能体 ID，每个派生一个，使用各条目的 `name`，或生成的“形容词名词”名称；
   - 向 `session.asyncJobManager` 注册每个派生对应的一个 `type: "task"` 作业（`id` = 智能体 ID，`queued: true`，`ownerId` = 调用方智能体 ID），工具随即返回；
   - 每个作业主体启动一个 `SpawnRun`，或在推测性启动后接管它；该运行获取会话级 `Semaphore`（每个 `TaskTool` 实例一个，每次获取和释放前都根据实时 `task.maxConcurrency` 设置原地调整大小）；持有许可后，作业标记为运行中，并通过共享的 `buildAsyncDetails`/`onUpdate` 报告进度；
   - 失败或中止的运行抛出 `TaskJobError`，使作业进入 `failed` 状态，但智能体本身仍保持注册且可供查询。
   - 混合调用先注册异步作业，再以内联方式运行阻塞条目，并在这些条目结束后返回；文本将内联摘要与派生作业列表组合起来，渲染块继续在内联结果旁显示仍在运行的后台行。
5. 每个 `SpawnRun` 调用 `#runSpawn` → `runStructuredSubagent(...)`。共享策略解析会重新加载设置并从磁盘重新发现智能体，因此运行时解析结果可能与创建时的描述不同。
6. 它解析请求的智能体，实施深度/派生策略和 `PI_BLOCKED_AGENT` 自递归防护，验证有效输出模式，并应用 `before_subagent_spawn` 路由/阻止钩子。
7. 模型优先级：`task.agentModelOverrides` → 智能体 frontmatter → 已配置的 task 角色/会话回退。经批准的单次调用 `model` 会替换后两者；对于存在 `task.agentModelOverrides` 条目的智能体或带级别标签的提及智能体，这会产生冲突错误。输出模式优先级：单次调用 `outputSchema` → 智能体 frontmatter `output` → 继承的父会话模式。
8. 计划模式提供 `read`、`grep`、`glob`、`web_search` 以及任何已配置的 `ast_grep`，替换智能体的派生/预遍历控制项，并禁用 LSP/IRC。它拒绝 eval 定义的工具以及隔离/应用/合并控制项。
9. 若启用 `isolated`，则要求有 git 仓库（`getRepoRoot(...)` / `captureBaseline(...)`），并打开该运行的工作区（`openWorkspace`）：默认将 `isolation.backend` 映射为后端类型提示（`parseIsolationBackend`），并通过 natives PAL（`nativeWorkspace` → `ensureIsolation` → `isoResolve`/`isoStart`）实体化工作区，在后端不可用时遍历候选列表；当 `isolation.backend` 为 `auto` 且找到 ovnfs（`ovnfsCommand`）时，则改为打开 ovnfs 检出目录（`ovnfsWorkspace`、`task/ovnfs.ts`）。
10.   产物目录在父会话文件可用时由该文件确定，否则使用临时目录。会话正在执行获批计划时，会将计划引用交给子代理。
11.   非隔离派生使用父级 cwd 调用 `runSubprocess(...)`。隔离派生在自己的工作区内运行，并捕获根级/嵌套补丁或分支。成功的更改仅在 `task.isolation.apply=true` 时应用；捕获/合并失败的路径会保留恢复产物。保持存活的运行将工作区清理责任移交给生命周期所有者，而不是在完成时将其拆除。
12.   `runSubprocess(...)` 创建具有隔离设置快照的子智能体会话（继承父级设置，其中 `async.enabled` 和 `bash.autoBackground.enabled` **继承**自父级，而非强制禁用；`tier.openai`/`tier.anthropic`/`tier.google` 首先通过 `tier.subagent` 重新解析，然后子会话根据其最终模型解析由 task/eval 分派交来的精确 `task.agentServiceTierOverrides[agentName]` 条目并持久化结果；`tools.approvalMode` 被强制设为 `yolo`，因为无界面子代理没有 UI 可用于确认提示；除非派生为每个智能体选择启用，否则 `advisor.enabled` 被强制关闭；单次派生覆盖可禁用读取摘要，并为隔离运行清除额外工作区根目录），子级 `agentId` 等于分配的 ID，且会话具有子级内部 URL 路由器/`AgentOutputManager`、输出模式、系统提示词 `CONTEXT` 节中的共享 `context`（批量调用），以及系统提示词中的 IRC 对等成员名单。
      复制父级账户亲和性后，会立即将精确的 `task.agentAccountPools[agentName]` 条目安装到子级的提供方会话中，子级模型注册表在每次密钥查找时都会强制执行该条目，因此对于列出的每个提供方，子级、其旁路请求以及它派生的、没有自己条目的子代理，都只能使用这些 OAuth 账户进行身份验证；vibe 工作智能体和复活的智能体使用实时条目。参见[Task 智能体发现](../task-agent-discovery.md#model-and-structured-output-precedence)。
13.   子级工具可用性以显式提供的 `agent.tools` 为起点；若声明了派生能力且未达到深度限制，则自动添加 `task`。包含 `task`/`bash` 的显式列表会获得 `wait`，除非受到限制，且注册表仍要求有异步/IRC/服务唤醒源。启用后端时，`exec` 扩展为 `bash` 加 `eval`。出站消息需要显式 `write`，而入站引导不需要。除非已启用预遍历，否则会移除父级所有的 `todo`。
14.   子级须通过隐藏的 `yield` 工具完成；最多提供 3 次提醒提示词，最后一次在受支持时强制设置 `toolChoice = yield`。`finalizeSubprocessOutput(...)` 协调原始文本、`yield` 载荷、结构化模式和中止状态。
15.   运行结束时的生命周期（在运行终结器中处理保持存活）：
      - 保持存活且有复活器的智能体遇到调用方信号、用户中断、挂钟超时或软请求预算中止时，只停止本次运行：智能体变为 `idle`，可以接收后续消息/复活；
      - 显式终止（Agent Hub、RPC `cancel_subagent`、collab、vibe），或没有复活器的智能体中止时，注册表状态变为 `aborted`，会话被释放，写入终止墓碑；之后的消息或 Hub 复活操作会将会话记录作为新的 `parked` 代重新打开，移除墓碑并使其复活；
      - 管理器关闭时，释放/注销进程内会话，不写终止墓碑；
      - 隔离且保持存活的运行遵循相同的空闲/停驻/复活路径，同时保留工作区；显式释放会捕获最终补丁/分支状态，并清理隔离句柄；
      - 其他所有情况（无论成功还是失败），状态都变为 `idle`，并附有活动会话，且 `AgentLifecycleManager.global().adopt(id, { idleTtlMs, revive })` 会启动停驻计时器。复活器重新打开会话 JSONL。
16.   此后的生命周期：`idle` 智能体在 `task.agentIdleTtlMs` 后停驻（释放会话；保留 `AgentRef` + 会话文件）；`write agent://<id>` 或 Agent Hub 将已停驻和已终止的智能体复活回 `idle`。`"Main"` 从不被停驻。

## 模式 / 变体 \{#modes--variants}

- 执行模式
   - 后台作业：`async.enabled=true`；非阻塞派生经由 `AsyncJobManager` 执行。
   - 同步内联：`async.enabled=false`、没有作业管理器，或条目的智能体声明了 `blocking: true`（按条目决定：混合调用会同时运行两种模式）。
- 线程（`task.workerThreads`，默认 `4`：使用的工作线程数上限；仅限 omp CLI 和编译后的二进制文件）
   - 放置：只有足够多的子代理同时运行时才使用工作线程。设主线程放置的在途子代理运行数为 `n`（包括其自身的进程内运行和后续轮次，以及工作线程上的运行，也计入正在放置的派生），当 `n < 9` 时，`W(n) = 0`（`src/thread/subagent-worker.ts` 中的 `SUBAGENT_WORKER_THRESHOLD`），否则为 `min(task.workerThreads, floor(log2(n / 9)) + 1)`：1-8 个运行留在主线程，9-17 个增加一个工作线程，18-35 个增加两个，36-71 个增加三个，72 个及以上增加四个。每个顶层派生和每次冷复活都会被分配到主线程与前 `W(n)` 个工作线程槽位中在途运行数最少的位置，若槽位为空则启动工作线程；相同时优先选择现有工作线程而非主线程（主线程还负责驱动 TUI），并优先选择主线程而非启动新工作线程。保持存活但处于空闲状态的子代理不计为运行中。
   - 工作线程：放置到工作线程上的派生，其整个 `runSubprocess(...)`（子会话、工具、监视器、生命周期终结）都在那里运行；子代理内部发起的派生留在该子代理的线程中，不计入主线程的 `n`。后续轮次和热复活在智能体的归属线程（其工作线程或主线程）上运行；冷复活按新派生的方式放置。
   - 按需：只有流式传入的派生数（在途数加上流式 `task` 调用截至当前已见到的 `tasks[]` 条目数，或 1；代码调用了 `agent(`/`workpool(` 的 `eval` 调用计为 1）达到某个工作线程槽位为空的区间时，才会提前启动工作线程；否则由需要该线程的放置操作启动。工作线程在运行子代理或持有活动（空闲、保持存活）的子代理会话期间保持存活，两者都没有后经过 60 秒退出并释放内存；`n` 降低时，不会提前停止现有工作线程。
   - 主线程：并发子代理少于 9 个、`task.workerThreads: 0`、SDK 嵌入和 `bun test` 都会在主线程上运行子代理。
   - 共享状态仍由主线程单独持有，并通过 RPC 传到工作线程：智能体注册表、生命周期、IRC 总线、异步作业、费用闸门、事件总线、产物 ID、智能体存储、身份验证存储（固定绑定、账户池、OAuth 刷新）、MCP 连接、Hindsight/Mnemopi 状态、遥测跨度和日志。工作线程获得父级设置的实时镜像，并基于主线程的身份验证存储构建自己的模型目录。在主线程看来，归属于工作线程的子代理是一个镜像会话，Agent Hub、聚焦视图、`agent://`、`history://`、`proc://` 和 RPC 模式都像使用本地会话一样使用它。
   - 扩展：工作线程重新导入基于文件的已准备扩展；内联工厂（`<inline-N>`）无法跨线程，因此工作线程托管的子代理在没有这些工厂的情况下运行，主线程会记录警告（[扩展加载](../extension-loading.md#restricted-children-and-revival)）。
   - 工作线程在运行中退出时，该运行会失败，错误中指明工作线程；其智能体被分离为 `parked`（带会话记录）或 `aborted`，复活时按新派生的方式放置。
- 批量模式（`task.batch`，默认开启）
   - 开启：`{ context, tasks[] }`：每个条目独立派生一个，必填的 `context` 在本次调用的各个派生之间共享，每个条目有各自的 `agent`、`outputSchema` 和 `schemaMode`。仅在相应设置启用时显示 `effort`；`isolated` 还要求禁用计划模式。生命周期、复活和并发语义与 N 次并行单独调用相同。
   - 关闭：每次调用派生一个；拒绝 `tasks`/`context` 并将其从模式中移除，`effort`/`isolated` 字段具有相同的条件性。
- 推测性启动（`task.speculativeLaunch`，默认开启；仅限批量模式）：在 `{ context, tasks[] }` 调用流式传输期间，工具的流式会话（`src/task/speculative-launch.ts`）会在每个条目的 JSON 对象闭合后立即启动该条目的 `SpawnRun`（`context` 须已闭合），并在调用流式传输结束时启动剩余条目。分派会接管归一化派生参数仍然匹配的运行；最终调用无效、已启动条目与最终调用不同、阻止钩子或轮次中止，都会中止所有已启动运行。启动需要宿主授权（`authorizeLaunch`）：`task` 审批自动允许，且没有扩展的 `tool_call`/`tool_result`/审批生命周期处理器。
- 当 `task.isolation.enabled` 为 true 时可以使用隔离：每个任务须设置 `isolated: true` 才会使用单独的检出目录；省略此项或设为 `false` 的任务共享父级检出目录。`isolation.backend` 选择 `auto`、`apfs`、`btrfs`、`zfs`、`reflink`、`overlayfs`、`projfs`、`block-clone` 或 `rcopy`，PAL 会解析实际后端并支持回退；`auto` 在找到 ovnfs 时会将其用于隔离子代理（见下文）。
- ovnfs（找到二进制文件即激活，`ovnfs.path` 默认使用 PATH 上的 `ovnfs`）：系统提示词新增“独立检出目录”一节，指示智能体打开 ovnfs 检出目录（`ovnfs new`、`diff`、`apply`、`land`、`pull`、`rm`），而非使用 `git worktree add`、`git clone` 或 `cp -r`。当 `task.isolation.enabled` 也允许隔离任务，且 `isolation.backend` 为 `auto` 时，每个隔离子代理都会在 ovnfs 检出目录中工作，这是由 ovnfs 守护进程提供、具有私有 git 目录的仓库写时复制视图，而不是原生克隆。omp 运行 `ovnfs --json start` 以确保守护进程运行并获取其管理套接字，然后通过该 Unix 套接字为每个运行打开（`new`）和移除（`rm`）一个检出目录。捕获、合并和应用与原生工作区相同。运行的任务隔离目录会记录检出目录（`.omp-ovnfs-checkout.json`），以便 `omp worktree clear` 移除崩溃运行的检出目录；无法捕获更改的检出目录会像原生工作区一样被保留。没有该二进制文件时，隔离仍使用原生方式；一旦找到 ovnfs，就不再回退：若其失败，隔离任务也会失败并说明原因。
- 隔离合并策略：`task.isolation.merge` 选择补丁模式（捕获/应用根级补丁）或分支模式（提交到 `omp/task/<id>`，再拣选到父级）。`task.isolation.apply=false` 保留捕获的更改而不应用；嵌套仓库会得到单独的补丁产物。
- eval 定义的工具：`tools` 跨父级保留的 Python/JS 内核解析名称。未知名称、禁用共享，或两个内核都定义了相同名称，都会导致预检失败；计划模式下不可使用这些工具。
- 智能体来源优先级按精确名称采用首个匹配项：项目 `.omp/agents`；用户 `.omp/agent/agents`；OMP 扩展包的 `agents/` 根目录，按 CLI → 项目设置 → 用户设置 → 已安装 npm/link 插件的顺序；Claude 市场插件智能体（项目先于用户）；最后是内置智能体（`scout`、`reviewer`、`security-reviewer`、`task`、`sonic`）。
- 预遍历：智能体 frontmatter 的 `prewalk` 或 `task.agentPrewalk[agentName]` 可先使用常规模型，在首次编辑/写入时移交给解析得到的更便宜模型。`task.prewalk`（默认关闭）为内置通用 `task` 智能体启用此行为。目标缺失/未配置以及模型+推理强度完全相同而无需更改的情况，会跳过移交而不是使派生失败。
- 自动预遍历：`task.agentPrewalkAuto[agentName]`（`"on"` / `"off"` / 模型模式）让原生判定器按指派决定没有无条件预遍历的智能体是否移交；`"on"` 使用 `prewalk.autoTarget`，其他值则使用给定目标。来自 frontmatter、`task.prewalk` 或 `task.agentPrewalk` 的无条件预遍历优先，且不会接受判定；跳过的派生、不可用的目标或判定器失败都会使派生不启用预遍历。
- 顾问：智能体 frontmatter 的 `advisor` 或 `task.agentAdvisor[agentName]`（`"on"` / `"off"` / 模型模式）为子会话配备顾问；显式模式会设置到子级的 `modelRoles.advisor`。子代理默认没有顾问。

## 副作用 \{#side-effects}

- 文件系统
   - 在会话产物目录或临时任务目录下写入 `<id>.jsonl` 和 `<id>.md`；隔离补丁模式写入 `<id>.patch`。
   - 创建/移除工作树或覆盖挂载目录；分支模式创建临时工作树和任务分支。
- 网络
   - 子会话可使用其活动工具集所允许的任何联网工具/模型。
   - MCP 代理工具复用父级连接及其配置的传输截止时间，包括 `OMP_MCP_TIMEOUT_MS` 覆盖和 `timeout: 0`；没有单独的子代理截止时间来限制工具调用。
- 子进程 / 原生绑定
   - 隔离后端通过 `omp-natives` PAL（`crates/iso`）运行：Linux 上使用内核 `overlay`，并以 `fuse-overlayfs`/`fusermount[3]` 回退，另外包括 APFS/Btrfs/ZFS/reflink 克隆、Windows 上的 ProjFS，以及作为最后手段的递归复制。
   - 用于基线捕获、补丁应用、工作树、分支、暂存更改、拣选和提交的 Git 操作。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 创建具有隔离设置快照的子级 `AgentSession` 实例；已结束会话在进程全局 `AgentRegistry` 中保持注册，状态为 `idle`/`parked`，直到进程拆除或显式释放。
   - 在 `async.enabled=true` 时，向 `session.asyncJobManager` 为每个派生注册一个异步作业；完成结果作为异步结果消息注入父级。
   - 在 `AgentLifecycleManager` 中启动空闲 TTL 计时器（已取消引用；不会阻止进程退出）。
   - 在父级事件总线上发出 `task:subagent:event`、`task:subagent:progress` 和 `task:subagent:lifecycle`。
   - 通过 `AgentOutputManager` 分配会话级输出 ID，使 `agent://` 在多次调用间保持唯一。
   - 与子代理共享父级 `local://` 根目录和 `ArtifactManager`。
- 后台工作 / 取消
   - `write proc://<jobId>/kill`（空 `content`）或父级工具调用中止会取消后台作业；父级工具调用中止通过调用信号取消同步运行。取消的运行会停止，但其智能体保持 `idle` 且可恢复。对于归属当前智能体、正在运行但没有作业的子代理，可通过 `proc://<agentId>/kill` 取消，这会中止并释放其会话。
   - 缺失 `yield` 的恢复机制向子会话发送最多三次内部提醒提示词。

## 限制与上限 \{#limits--caps}

- 工具模式：`approval="exec"`、`strict=false`、`lenientArgValidation=true`、`loadMode="essential"`。
- 分步派生需要选择启用：`task.steps` 默认为 `false`；每个派生最多 `MAX_STEPS = 4` 个提示词（`packages/coding-agent/src/task/steps.ts`）。
- 单次派生的推理强度需要选择启用：`task.enableEffort` 默认为 `false`；为 false 时，面向模型的动态模式中会省略 `effort`。
- 并发：`task.maxConcurrency` 默认为 `32`；`0` 表示无限制。一个会话级 `Semaphore` 在每次获取/释放前根据实时设置调整大小，并对跨 task 调用的每个 `SpawnRun` 施加限制，包括同步和推测性运行。
- 隔离基线：每个仓库的未提交快照上限为 `1 GiB`（`task/worktree.ts` 中的 `ISOLATION_BASELINE_MAX_CONTENT_BYTES`）。过大的快照在派生前失败，而不是无界缓冲内容。
- 空闲 TTL：`task.agentIdleTtlMs`，默认 `420_000` 毫秒（7 分钟）；`<= 0` 禁用停驻，并使空闲会话保持活动直到退出。
- 工作线程：`task.workerThreads`，默认 `4`（使用数上限）；`0` 使子代理留在主线程。少于 9 个并发子代理（`SUBAGENT_WORKER_THRESHOLD`）时绝不使用工作线程；之后每翻倍增加一个工作线程（9、18、36、72）。没有运行中子代理且没有打开会话的工作线程，在空闲 60 秒后退出，最后一个工作线程也如此。
- 每个子代理的输出截断：`packages/coding-agent/src/task/types.ts` 中的 `MAX_OUTPUT_BYTES = 500_000` 和 `MAX_OUTPUT_LINES = 5000`（可通过 `PI_TASK_MAX_OUTPUT_BYTES` / `PI_TASK_MAX_OUTPUT_LINES` 覆盖）。完整原始输出仍会写入 `<id>.md`。
- 进度合并：`PROGRESS_COALESCE_MS = 150`；近期输出尾部：`RECENT_OUTPUT_TAIL_BYTES = 8 * 1024`（最后 8 个非空行）。
- 缺失 `yield` 的提醒重试：`packages/coding-agent/src/task/executor.ts` 中的 `MAX_YIELD_RETRIES = 3`。
- 软请求预算：`task.softRequestBudget` 默认 200 次请求（`0` 禁用）。超过预算时，若启用 `task.softRequestBudgetNotice`，会注入收尾通知；达到预算的 1.5 倍时，运行被强制停止以交出部分发现。内置 scout/sonic 智能体的上限为 100；此设置可以降低该上限，但不能提高。精确名称的 `task.agentSoftRequestBudget` 条目（`lead: 400`）会替换该智能体的上述两项限制，可以提高也可以降低；此处的 `0` 禁用其防护。
- 硬性挂钟时限：`task.maxRuntimeMs` 适用于每个派生；默认 `0` 禁用。
- 递归深度：`task.maxRecursionDepth` 默认为 `2`；负值禁用上限。深度从顶层会话计数：`0` 从顶层会话本身移除 `task`（完全没有子代理），`1` 允许顶层会话派生子代理，但这些子代理不能派生自己的子代理。工具注册表和共享预检会实施此限制，`runSubprocess(...)` 在达到最大深度时移除子级对 `task` 的访问。
- 内联摘要会完整携带不超过 `INLINE_OUTPUT_CHARS`（11500）字符的输出（`packages/coding-agent/src/task/result-summary.ts`），使封装保持低于异步交付的 `ASYNC_INLINE_RESULT_MAX_CHARS`（12000）；如果过长的 `<error>` 或 `<merge-summary>` 会让封装超过该上限，或者输出本身更长，则改为提供 `PREVIEW_CHARS = 5000` 的开头预览，这要求存在完整输出产物。`agent://<id>` 指向该产物。

## 错误 \{#errors}

- 结构/预检失败返回 `isError: true`、说明文本和空 `results`：
   - `schema`（从不接受）
   - 禁用 `task.batch` 时的 `tasks` / `context`
   - 批量调用：缺失/为空的 `tasks`、所提供名称重复、缺失共享 `context`、在 `tasks` 之外同时提供顶层 `task` 或 `steps`
   - 任意条目或平铺调用：`task` 和 `steps` 均未提供或同时提供、任务文本为空，或 `steps` 列表或其中的步骤为空
   - 无效的推理强度、未知/被设置禁用的智能体、深度/派生策略拒绝、无效的调用方输出模式、隔离被禁用，或计划模式下使用隔离/eval 工具控制项
   - 未知的 eval 工具、禁用 eval 共享，或父级两个内核中都定义了同一名称
   - 单次调用 `model`：`task.perCallModel` 不允许此调用类型（在选择器验证前报告）；精确选择器无效；通过 SDK 同时提供宿主 `model` 和单次调用 `model`；存在冲突的 `task.agentModelOverrides` 条目；或提及智能体的 `^provider/model:level` 标签指定了级别，即使 `model` 重复了标签中的选择器也如此
   - 单次调用模型不是聊天模型、不可用、未获得当前授权批准，或被 `task.perCallModelAllow` 排除
   - 单次调用模型在 `task.maxEffort` 或以下没有受支持的推理强度
- 隔离准备失败返回 `Isolated subagent execution could not be prepared: ...`。它会区分缺失 Git 仓库、没有并置 Git 的纯 Jujutsu 工作区，以及过大的快照。不可用后端会沿 PAL 候选列表回退；其他设置/捕获失败会保留可用的输出和恢复产物。
- 作业注册失败返回 `Failed to start background task job(s): ...`；仅调度了部分作业的批次会在即时文本中报告失败的 ID，并让已启动的作业继续运行。
- 子级失败表现为 `SingleResult.exitCode = 1`，并填充 `stderr`/`error`；异步作业标记为失败，但交付文本仍包含输出以及后续消息/会话记录提示。
- 单次调用工作智能体还会在凭据不可用，或后续主循环请求失去批准、无法遵守所请求推理强度上限时失败；它们不会舍弃 `model` 或使用自动模型回退。由其他模型提供的 Factory 响应，或携带回退移交块的响应，会使工作智能体失败：请求省略了 Factory 的拒绝链，因此移交属于违规，而不是回答。冷复活会拒绝以下情况：旧版单次调用记录缺少规范的 `perCallModelIdentity` 和保存的 `perCallThinkingLevel`、保存的精确路由不可用、模型不再获得授权（已移除/禁用的智能体或非活动的实际父级不提供任何授权），或推理强度下限高于实时 `task.maxEffort`。复活在精确查找前会等待已在进行中的模型注册表刷新；它不会启动刷新，因此冷注册表会使复活失败并返回 `Cannot revive subagent "<id>": its per-call model <provider/model-id> is no longer available. A per-call worker revives only on its exact saved model.`
- 若子级省略 `yield`，`finalizeSubprocessOutput(...)` 会注入警告，例如 `SYSTEM WARNING: Subagent exited without calling yield tool after 3 reminders.`
- `agent://<id>` 读取会报告不可用的会话/产物目录、缺失的 ID，或字段提取时的无效 JSON。`agent://all` 仅可写；消息目标不能携带 JSON 路径后缀。

## 说明 \{#notes}

- 并行是指在一条助手消息中并行调用 `task`，或者启用 `task.batch` 时在一次调用中使用 `tasks[]` 批次；两种情况下，会话级信号量都会限制扇出。在 `async.enabled=true` 时，每个派生都是独立的后台作业。
- 不使用批量模式时的共享背景约定：将背景写入一个 `local://` 文件，并在各个派生的 `task` 中引用该路径，子代理共享父级的 `local://` 根目录。使用 `task.batch` 时，必填的 `context` 参数将共享背景直接带入每个派生的系统提示词。
- 对于后续工作，优先通过 `write agent://<id>` 向现有智能体发消息，而不是新建派生：它已经持有所需上下文。裸 `history://` 发现已注册的会话记录；向已停驻智能体发消息会使其复活。`history://<id>` 显示智能体已执行的工作。
- 对等消息可用性由条件推导，而非配置（消息辅助函数中的 `isIrcEnabled`）：要求调用方有 `write` 且有可发消息的对象，即会话可以派生子代理，或自身就是子代理。没有对等消息功能时，后续提示不会建议使用它。
- 子代理的结果（其 `yield`，或消息结果的最后一轮报告）回答其父级。若来自父级和自身子代理之外的任何人的消息，或任何 `agent://all` 广播，在它不调用工具而结束轮次时仍在排队，则结果发出后，这条消息会获得自己的唤醒轮次；如果此类消息到达时，它的运行（首次运行或后续运行）处于空闲状态，包括正在等待后台工作，也会如此。直接发送方会收到该轮回复，广播方不会收到。子代理工作期间到达的消息仍会在下一个工具调用边界送达，来自其父级或自身子代理的消息会在运行内得到回答。
- 智能体发现优先级按精确名称采用首个匹配项：项目 `.omp` 智能体先于用户 `.omp`，然后是 OMP 扩展包根目录、Claude 市场插件智能体（项目先于用户）和内置智能体。跳过直接的 `.claude/agents` 和 `.codex/agents` 根目录。创建时发现按 cwd/有效扩展根目录进行记忆缓存；执行时发现保持最新。
- 子会话不继承对话历史。内置的继承内容包括工作区树/技能/规则、父级上下文文件中除名为 `AGENTS.md` 的文件之外的文件（其他名称和通过 `@` 导入的文本会传递）、共享的 `local://` 根目录，以及存在时的获批计划引用。不使用工作树隔离时，子级还会获得父级额外工作区根目录，并重新发现每个根目录的上下文文件，同样排除任何名为 `AGENTS.md` 的文件。
- 当父级传入 `mcpManager` 时，子会话禁用独立 MCP 发现，并获得复用父级连接的代理工具。
- 分支模式合并在拣选前会临时暂存父仓库更改；恢复暂存更改发生冲突时，已落地的提交仍留在 HEAD，暂存内容也予以保留，并报告为 `stashConflict`。补丁模式在应用根级补丁前使用 `repo.canApplyPatch(...)`；只能反向应用时视为已应用，而正向检查失败时会保留产物以供恢复。
- 嵌套 git 仓库在隔离工作区内独立比较差异，并通过 `applyNestedPatches(...)` 单独合并。
- `AgentOutputManager` 按名称生成 `agent://` ID（首次为 `Task`，仅在名称重复时才使用 `Task-2`/`Task-3`，嵌套形式如 `Parent.Child`）；这可防止重复或嵌套调用之间的产物冲突。

## 自动并行 \{#auto-parallel}

`task.autoParallel`（默认为 `off`，另有 `suggest`、`on`）向原生判定器询问每个新顶层提示词的哪些部分可并发运行。归属：`auto-parallel/planner.ts`（分段、判定、划分），`session/auto-parallel.ts`（模式、通知、提示），问题位于 `prompts/judge/auto-parallel.json`。

- **判定对象：** 主会话中用户键入的提示词和排队的后续消息，不包括引导、技能提示词、子代理或计划模式。须启用 `task` 工具，且 `judge` 角色须首先解析到原生后端（`find.enabled: auto` 条件）。
- **条目：** 每个顶层列表项和列表外的每一行都是一个条目；嵌套条目、缩进到条目正文层级的行，以及围栏块都归属于其条目。少于 2 个或多于 16 个条目的提示词不进行判定。
- **计划：** 一次判定询问每个条目的角色（`context`：背景和列表引导语，发送给每个子任务；`task`；`wrapup`：在所有子任务后完成的检查、提交、变更日志），以及每对条目是否耦合（相同文件或组件、一方需要另一方的结果/设计/API、一方涉及另一方触及的重命名，或一方细化另一方）。通过 P(coupled) ≥ 0.35 的条目对相连的任务条目，会传递性地归入同一个子任务。阈值设得较低，因为漏掉一次拆分只会花费时间，而错误拆分会让两个工作智能体处理耦合代码。
- **`suggest`** 对每个已判定提示词报告 `Auto-parallel: 3 subtasks: … | … | …` 或 `Auto-parallel: no split`，不做任何更改。
- **`on`：** 拆分成两个或更多子任务时，会在提示词中添加隐藏提醒，列出子任务、共享上下文和收尾条目，并告诉智能体先确定跨子任务契约，再通过一次并行 `task` 调用委派子任务。没有拆分的提示词不添加任何内容。

与自动预遍历一样，它在失败时放行：缺少原生判定器、判定器错误或答案格式错误、4 秒超时、中止或提示词被替代，都会让轮次保持不变。判定以 `auto-parallel` 为用途记录到模型用量日志中。
