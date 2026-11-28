---
title: "retain"
description: "Oh My Pi 官方仓库文档：retain。"
---

# retain \{#retain}

> 通过当前长期记忆后端存储持久事实。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/memory-retain.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/retain.md`
- Hindsight 协作组件：
   - `packages/coding-agent/src/hindsight/state.ts`：各会话的队列、刷新调度、自动保留。
   - `packages/coding-agent/src/hindsight/outbox.ts`：用于工具保留操作的持久磁盘发件箱及其投递。
   - `packages/coding-agent/src/hindsight/backend.ts`：会话引导、提示词注入、子代理别名。
   - `packages/coding-agent/src/hindsight/bank.ts`：记忆库 ID 派生、标签作用域、首次使用时的记忆库/任务设置。
   - `packages/coding-agent/src/hindsight/client.ts`：HTTP `retain` / `retainBatch` 调用。
   - `packages/coding-agent/src/hindsight/content.ts`：保留用会话记录整形、记忆标签剥离。
   - `packages/coding-agent/src/hindsight/mental-models.ts`：记忆库作用域的心智模型种子初始化和缓存渲染。
   - `packages/coding-agent/src/hindsight/seeds.json`：内置心智模型种子定义。
   - `packages/coding-agent/src/hindsight/transcript.ts`：为自动保留提取用户/助手轮次。
- Mnemopi 协作组件：
   - `packages/coding-agent/src/mnemopi/backend.ts`：本地后端引导、提示词注入、子代理别名、入队/清除。
   - `packages/coding-agent/src/mnemopi/state.ts`：限定作用域的召回/保留状态和本地写入。
   - `packages/coding-agent/src/mnemopi/config.ts`：本地 SQLite 路径、记忆库、作用域、提供方设置。
   - `packages/mnemopi/src/core/memory.ts`：`remember(...)` 使用的本地记忆运行时。

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`strict = true`、`loadMode = "discoverable"`。批准级别是动态的：包含任意 `scope: "global"` 条目的调用使用 `approval = "write"`，因为该写入会影响每个项目的召回；否则为 `approval = "read"`，尽管成功调用会将记忆写入入队或执行写入。
- 工具仅在 `memory.backend = "hindsight"` 或 `"mnemopi"` 时注册；在 `"off"` 和 `"local"` 时不存在。Hindsight 还要求已配置非空的 API URL（`isHindsightConfigured(loadHindsightConfig(...))`）。
- 在具有显式工具列表的不受限会话中，对任一受支持后端，注册时都会自动包含共享的 `recall`/`retain`/`reflect` 工具集。受限列表不会被扩展。
- 在启用 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具会作为工具命令呈现（在 `bash` 中使用 `retain --help`、`retain <args>`）；显式请求的工具仍保持顶层形式。
- 执行返回一个最终结果，没有进度回调或取消参数。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | ---: | --- |
| `items` | `Array<{ content: string; context?: string; scope?: "project" \| "global" }>` | 是 | 要存储的一条或多条记忆。`minItems: 1`。每个条目都须自包含；`context` 是各条目可选的来源信息。只有当前后端具有每个项目都会召回的目标时，模式和工具说明中才包含 `scope`：即 `memory.backend = "mnemopi"` 且 `mnemopi.scoping` 为 `global` 或 `per-project-tagged`，或 `memory.backend = "hindsight"` 且 `hindsight.globalScope = true`（默认为 `false`）并且 `hindsight.scoping` 为 `global` 或 `per-project-tagged`；省略表示 `project`。对于 Hindsight，这两个设置都从会话的 Hindsight 状态读取，即保留队列所强制执行的配置，因此子代理遵循其启动时父级所具有的配置。 |

## 输出 \{#outputs}

输出取决于当前的 `memory.backend`。

Hindsight：

- `content[0].type = "text"`
- `content[0].text = "<count> memory queued."` 或 `"<count> memories queued."`
- `details = { count: number }`
- 工具返回前条目已写入磁盘；尚未确认服务器投递。投递失败会发出会话警告通知，不会返回给模型。

Mnemopi：

- `content[0].type = "text"`
- `content[0].text = "<count> memory stored."` 或 `"<count> memories stored."`
- `details = { count: number }`
- 工具通过 `rememberScoped(...)` 同步写入每个条目。存储失败会抛出异常、停止批次，并报告失败条目、先前已保留条目的 ID，以及后续条目是否未尝试。成功计数确认所有同步写入，而非后台提取完成。

## 流程 \{#flow}

1. 当 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"` 时，`MemoryRetainTool.createIf(...)` 会公开该工具。
2. `execute(...)` 重新读取 `memory.backend`，并分派给匹配的会话状态。
3. 如果后端为 `mnemopi`：
   - 获取 `session.getMnemopiSessionState()`，如果后端尚未启动则抛出异常；
   - 如果任意条目具有 `scope: "global"`，则首先解析 `state.getGlobalRetainTarget()`；在 `per-project` 作用域下会抛出 `Mnemopi global scope requires global or per-project-tagged scoping.`，且批次中不会存储任何内容；
   - 对于每个条目，使用 `source: "coding-agent-retain"`、`importance: 0.75`、`scope: "bank"`、`extract: true`、`extractEntities: true`、`veracity: "tool"`、`memoryType: "fact"` 和元数据 `{ session_id, cwd, context, tool: "retain" }` 调用 `state.rememberScoped(item.content, ...)`；
   - 项目条目进入限定作用域的保留记忆库，全局条目进入全局目标（作为 `rememberScoped` 的第三个参数传入）；同一会话中完全重复的内容会更新 Mnemopi 核心中已有的工作记忆行。
   - 内容和选项在存储前会经过 `redactRememberWrite(...)`。
4. 如果后端为 `hindsight`：
   - 获取 `session.getHindsightSessionState()`，如果后端尚未启动则抛出异常；
   - 如果任意条目具有 `scope: "global"`，则首先调用 `state.assertGlobalRetainAvailable()`；当 `hindsight.globalScope` 关闭时，它会抛出 `Hindsight global scope is off; set hindsight.globalScope to true to enable it.`，在 `per-project` 作用域下则抛出 `Hindsight global scope requires global or per-project-tagged scoping.`；两种情况下批次中都不会有任何内容入队；
   - 整个调用交给 `HindsightSessionState.enqueueRetain(toolCallId, items)`；`HindsightRetainQueue.enqueue(...)` 执行相同的 `global` 检查（导出的队列也强制执行，而不只是工具），然后 `HindsightOutbox.enqueue(...)` 在 `<agentDir>/hindsight-outbox/<destination>/` 下为每个条目写入一个事件文件，要么全部写入，要么全不写入：每个文件先同步并原子重命名到位，随后同步目录（Windows 除外）。事件内容、上下文、标签和会话 ID 会先剥离终端控制符、bearer 令牌和可识别的秘密；
   - 每个事件 ID 由会话 ID、工具调用 ID、条目索引、作用域、上下文和内容计算哈希得出。它会成为服务器的 `document_id`，并使用 `update_mode: "replace"`，因此重试的调用或在响应含糊后重新发送会替换同一文档，而复用工具调用 ID 但内容不同的情况会形成新文档；
   - 每个事件还会记录一个 `sequence`，在目标队列锁保护下取待处理事件中的最大值加一，因此跨会话和进程的发布顺序遵循调用及其条目的顺序，绝不使用文件时间或目录列表顺序。旧版写入的事件没有序号，会按修改时间排列在所有有序号的事件之前；因此，当旧版仍与此版本并行运行时，它在有序号事件之后写入的事件会排在前面；
   - 当有 16 个新事件待处理时，队列立即刷新，否则在经过 `RETAIN_FLUSH_INTERVAL_MS` 防抖时间后刷新；安装主状态时也会刷新，投递先前进程为同一 API URL 和记忆库留下的事件；
   - 刷新会获取目标的排空租约（进程退出时释放的操作系统锁；租约忙时会让当前持有者处理，并在防抖时间后重试），尽力确保记忆库存在，并按发布顺序为每组标签发送异步 `retainBatch(...)` 请求，每次最多 16 个事件；各标签组按其首个事件的顺序处理：项目条目携带其捕获的标签，全局条目不带标签。每个标签组都有独立请求，因为 Hindsight 会用请求中各条目标签的并集标记该请求生成的文档，而且文档级重新标记会级联到其中的每条记忆。2xx 响应会删除这些事件；它表示服务器已接受，而非提取完成。

## 模式 / 变体 \{#modes--variants}

- Hindsight 工具路径：持久发件箱，分批投递。
- Mnemopi 工具路径：直接通过本地 `remember(...)` 写入限定作用域的保留记忆库。
- 来自 `computeBankScope(...)` 的 Hindsight 记忆库作用域：
   - `global`：一个共享记忆库，无项目标签。
   - `per-project`：记忆库 ID 追加 `-<project label>`，其中标签是 git 主检出根目录的基本名（仓库外则为 cwd 基本名）。
   - `per-project-tagged`：共享记忆库，加上保留记忆上的 `project:<project label>` 标签；当 `hindsight.globalScope` 开启时，`scope: "global"` 条目不带标签地保留，召回（`tagsMatch = "any"`）会在每个项目中显示它们。
- 来自 `computeMnemopiBankScope(...)` 的 Mnemopi 记忆库作用域：
   - `global`：保留和召回使用共享记忆库；`scope: "global"` 也写入该库。
   - `per-project`：保留和召回使用由绝对 cwd 基本名加该绝对 cwd 的哈希派生的项目记忆库；不提供 `scope: "global"`。
   - `per-project-tagged`：保留写入由 cwd 派生的项目记忆库，或将 `scope: "global"` 条目写入共享记忆库；召回也读取共享记忆库。
   - 按项目划分的召回可能添加安全的旧版记忆库，其存储的工作记忆行全部匹配当前 cwd；扫描上限为 64 个候选记忆库目录。
- 会话作用域：
   - 工具调用的保留操作是当前后端按会话处理的工作；
   - 持久化的 Hindsight 记忆是跨会话的服务器端记忆库数据；
   - 持久化的 Mnemopi 记忆是本地 SQLite 数据；
   - 两种受支持后端的子代理都通过别名使用父级记忆状态。

## 副作用 \{#side-effects}

- 文件系统
   - Hindsight：未投递的工具保留内容以 JSON 事件文件保存在 `<agentDir>/hindsight-outbox/` 下（目录权限 0700，文件权限 0600）；被拒绝、格式错误和过期的事件会移入 `hindsight-outbox/quarantine/`，并在 30 天后由其删除。
   - Mnemopi：写入 `mnemopi.dbPath` 下的本地 SQLite，默认位于智能体记忆目录下（`mnemopi/mnemopi.db`），需要时每个限定作用域的记忆库使用一个数据库文件。
- 网络
   - Hindsight：通过 `retainBatch(...)` 发出 `POST /v1/default/banks/{bank_id}/memories`，并在每个会话状态的每个记忆库首次写入前，可选地通过 `ensureBankExists(...)` 发出 `PUT /v1/default/banks/{bank_id}`（该集合随主会话状态创建，并与子代理别名共享）。
   - Mnemopi：无，除非配置的嵌入或 LLM 提供方在提取期间发起调用。
- 会话状态
   - Hindsight：在确认前记录每个事件的作用域、捕获的标签、原始时间戳、上下文和 `metadata.session_id`；子代理共享父级的目标。
   - Mnemopi：通过会话的限定作用域 `Mnemopi` 实例写入，包含 `session_id`、`cwd` 和可选的 `context`，并与子代理共享限定作用域资源。
- 用户可见提示 / 交互式 UI
   - Hindsight 异步刷新失败会发出 `session.emitNotice("warning", ...)`；不会告知模型。
   - Mnemopi 显式写入失败会作为带部分批次信息的工具错误返回；先前成功的写入不会回滚。
- 后台工作 / 取消
   - Hindsight 刷新在防抖计时器触发、队列大小达到阈值、安装主状态、智能体结束和会话释放时运行；后端 `enqueue(...)` 和 `clear(...)` 会显式排空队列。未投递事件在会话和进程结束后仍会保留；没有 omp 进程运行时不会投递任何内容。
   - Mnemopi 事实/实体提取和嵌入可能在同步行写入后继续。后端 `enqueue(...)` 请求完整整合；后端清除会在删除数据库文件之前释放限定作用域实例。
   - `retain.execute()` 自身不处理中止信号。

## 限制与上限 \{#limits--caps}

- 输入模式要求 `items.length >= 1`；条目字符串在模式层面没有最小长度限制。
- 工具可用性要求 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"`；默认 `memory.backend` 为 `"off"`。
- Hindsight 队列刷新阈值和请求批次大小：16 个事件。
- Hindsight 发件箱容量：每个目标 1000 个未投递事件；会导致超出容量的调用会失败，不写入任何内容，也不驱逐较早事件。
- Hindsight 发件箱保留时间：未投递事件在写入 7 天后被隔离；隔离事件在隔离 30 天后被删除。
- Hindsight 队列防抖：`RETAIN_FLUSH_INTERVAL_MS = 5_000`。
- Hindsight 队列写入使用 `retainBatch(..., { async: true })`；客户端请求超时默认为 `hindsight.retainTimeoutMs = 60_000`，但不会等待服务器端整合。
- Hindsight 自动保留设置：
   - `hindsight.autoRetain = true`
   - `hindsight.retainEveryNTurns = 3`
   - `hindsight.retainOverlapTurns = 2`
   - `hindsight.retainContext = "omp"`
   - `hindsight.retainMode = "full-session"`
- Mnemopi 保留设置：
   - `mnemopi.autoRetain = true`
   - `mnemopi.retainEveryNTurns = 4`
   - `mnemopi.scoping = "per-project"`

## 错误 \{#errors}

- 当 `memory.backend == "mnemopi"` 但不存在状态时，抛出 `Mnemopi backend is not initialised for this session.`。
- 当 `memory.backend == "hindsight"` 但不存在状态时，抛出 `Hindsight backend is not initialised for this session.`。
- Hindsight 队列在已释放状态下入队会抛出 `Hindsight retain queue is closed.`
- 当发件箱已满或无法写入、无法读取待处理事件以将调用排在其后（期间被排空操作删除的文件或非 JSON 文件会跳过），或调用的序号将超过最大安全整数时，Hindsight 入队会使工具调用失败，最后一种情况只有损坏事件才会导致（`Hindsight outbox full (...)` / `Hindsight outbox write failed; memory NOT queued.`）；该调用的任何内容都不会保留。
- Hindsight HTTP 400、413 和 422 表示拒绝请求正文：被拒绝的事件会移入隔离区，并发出警告通知；被拒绝的多条目请求会逐条重新发送，从而只移动被拒绝的条目。其他所有失败（连接错误、超时、401/403/404、408、429、5xx）都会保留事件并停止排空；队列按指数退避重试，从 5 秒增加到最多 30 分钟（±20% 抖动），并在每次故障期间警告一次，包含保留的数量。
- Hindsight 记忆库/任务创建失败会以 debug 级别记录，并在 `ensureBankExists(...)` 中被忽略；后续写入仍会运行。
- Mnemopi 显式 `rememberScoped(...)` 失败会停止批次，并抛出 `Mnemopi did not store item <n> of <total>: <reason>. ...`，标明先前已存储的 ID 和未尝试的条目。后台自动保留则使用 `rememberInScope(...)`，它会记录并忽略存储失败。

## 备注 \{#notes}

- Hindsight 存储位于服务器端。`hindsightBackend.clear(...)` 会排空本地队列、清除本地缓存/状态，并警告上游删除须在 Hindsight UI 中或通过 `deleteBank` 完成。
- Mnemopi 存储是本地 SQLite。`mnemopiBackend.clear(...)` 会删除每个当前限定作用域记忆库的数据库文件，然后在会话仍活跃时重新加载后端状态。
- Hindsight 自动保留使用相同记忆库，但路径与此工具不同：`retainSession(...)` 提取纯用户/助手会话记录，剥离 `<memories>` / `<mental_models>` 块，并调用单条目 `retain(...)`。
- Mnemopi 自动保留使用 `source: "coding-agent-transcript"`、`importance: 0.65`、`veracity: "unknown"` 和 `memoryType: "episode"` 存储准备好的会话记录。
- Hindsight 心智模型引导位于共享后端中：`HindsightSessionState.runMentalModelLoad(...)` 可选地解析种子、创建缺失模型，然后缓存渲染后的 `<mental_models>` 块，用于提示词注入。
- 内置 Hindsight 种子为 `user-preferences`、`project-conventions` 和 `project-decisions`。`projectTagged: true` 种子继承当前作用域的保留标签；无标签种子读取整个记忆库。
- Hindsight 心智模型默认值：`hindsight.mentalModelsEnabled = true`、`hindsight.mentalModelAutoSeed = true`、`hindsight.mentalModelMaxRenderChars = 16_000`。渲染后的 `<mental_models>` 块在当前会话记录中保持冻结；后台反思在下一个会话记录/会话边界重新加载该块时生效，而 `/memory mm reload` 会强制在会话内显式刷新。首轮加载最多等待 `MENTAL_MODEL_FIRST_TURN_DEADLINE_MS = 1500`。
- Hindsight 种子的生命周期只包含创建。修改 `packages/coding-agent/src/hindsight/seeds.json` 不会改变已有的服务器端模型。
- `recall.md` 和 `reflect.md` 依赖相同的后端选择和作用域行为。
