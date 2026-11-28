---
title: "todo"
description: "Oh My Pi 官方仓库文档：todo。"
---

# todo \{#todo}

> 对会话待办列表应用一次变更，并返回文本摘要和完整的阶段/任务状态。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/todo.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/todo.md`
- 关键协作组件：
   - `packages/coding-agent/src/tools/index.ts`：注册工具、公开会话钩子，并控制可用性。
   - `packages/coding-agent/src/modes/controllers/event-controller.ts`：在工具完成时更新可见的待办 UI。
   - `packages/coding-agent/src/session/todo-tracker.ts`：拥有规范阶段状态、恢复分支快照，并管理完成提醒。
   - `packages/coding-agent/src/session/agent-session.ts`：公开待办状态钩子，并发出失败提醒。
   - `packages/coding-agent/src/modes/controllers/todo-command-controller.ts`：`/todo` 命令路径、自定义条目持久化、会话记录提醒注入。
   - `packages/coding-agent/src/utils/render-utils.ts`：渲染器树的折叠预览上限。

## 输入 \{#inputs}

参数对象**就是**一个操作，判别字段及其字段位于顶层（没有 `ops` 数组包装）。

| 操作 | 必填字段 | 可选字段 | 效果 |
| --- | --- | --- | --- |
| `init` | `list` **或**平铺的 `items` | `phase`（为平铺 `items` 形式指定阶段名称；默认为 `Tasks`） | 替换整个列表：使用 `list` 时采用给定阶段；使用平铺 `items` 数组时，合成一个阶段。归一化前，每个新任务都以 `pending` 开始。 |
| `start` | `task` | 无 | 将一个任务标记为 `in_progress`；其他所有 `in_progress` 任务降为 `pending`。 |
| `done` | `task` 或 `phase`，也可均不提供 | 无 | 将目标任务、阶段或所有任务标记为 `completed`。 |
| `drop` | `task` 或 `phase`，也可均不提供 | 无 | 将目标任务、阶段或所有任务标记为 `abandoned`。 |
| `rm` | `task` 或 `phase`，也可均不提供 | 无 | 移除目标任务、清空该阶段的任务列表，或清空所有任务列表。 |
| `append` | `items` | `phase`（默认使用活动/下一个任务的阶段，其次使用最后一个阶段，最后使用 `Tasks`） | 向选定阶段追加新的 `pending` 任务；阶段缺失时创建。 |
| `view` | 无 | 无 | 回显当前列表。`view` 调用是只读的：不归一化，也不写入状态。 |

### 字段 \{#fields}

| 字段 | 类型 | 是否必填 | 描述 |
| --- | --- | --- | --- |
| `op` | `"init" \| "start" \| "done" \| "rm" \| "drop" \| "append" \| "view"` | 在模式中必填 | 操作判别字段。执行时，只有对无歧义的 `list`/`items` 载荷才会修复省略的 op（见流程）。 |
| `list` | `{ phase: string; items: string[] }[]` | `init` 必填（除非提供平铺的 `items` 列表） | 完整替换载荷。每个阶段的 `items` 都有 `minItems: 1`；显式 `list: []` 清空所有阶段。 |
| `task` | `string` | `start` 必填；以任务为目标的 `done`/`drop`/`rm` 必填 | 精确匹配任务内容。 |
| `phase` | `string` | 以阶段为目标的 `done`/`drop`/`rm` 必填；`append` 和平铺 `init` 可选 | 精确匹配阶段名称。`append` 在指定名称的阶段缺失时创建它；省略名称时使用下述选择规则。平铺 `init` 默认为 `Tasks`。 |
| `items` | `string[]` | `append` 必填；或作为平铺 `init` 载荷 | 要追加的任务，或平铺 `init` 的完整任务列表。操作特定验证要求至少一个条目；在无关操作中意外提供的空数组符合模式，但会被忽略。 |

对于 `init`，缺失或为空的阶段名称变为 `Tasks`；应用此默认值后，会拒绝重复的阶段名称。

对于 `append`，省略 `phase` 时选择进行中任务的阶段，否则选择第一个待处理任务的阶段。没有可执行任务时，使用最后一个阶段；没有任何阶段时，创建 `Tasks`。显式阶段会覆盖此选择，但显式空字符串会被拒绝。已有列表时，同时省略 `op` 和 `phase` 仍有歧义，不会被推断为 `append`。

## 输出 \{#outputs}

工具返回一次性的 `AgentToolResult`：

- `content`：一个文本部分，包含来自 `formatSummary(...)` 的摘要。
   - 最终状态为空且无错误：`Todo list cleared.`（纯 `view` 调用则为 `Todo list is empty.`）。
   - 最终状态非空：剩余条目列表、当前阶段进度，然后是每个阶段的树。
   - 操作特定错误会在摘要前加上 `Errors: ...`；模式失败则返回 `Invalid todo arguments: ...`。两者均设置 `isError: true`，并使返回/持久化的阶段保持调用前状态。
- `details`：
   - `phases: TodoPhase[]`
   - `storage: "session" | "memory"`
   - `completedTasks?: TodoCompletionTransition[]`，在调用期间有任务从非完成状态变为 `completed` 时提供
   - `op?: TodoOperation` 标识解析后的操作，包括后来产生操作特定错误的变更；模式验证失败和旧版会话记录条目中没有此字段。

`TodoPhase` / `TodoItem` 状态模型：

- `TodoPhase`：`{ name: string, tasks: TodoItem[] }`
- `TodoItem`：`{ content: string, status: "pending" | "in_progress" | "completed" | "abandoned" }`

TUI 渲染器（`todoToolRenderer`）将调用和结果合并为一个会话记录块，并将阶段渲染为树。折叠的会话记录预览将树条目数限制为 `PREVIEW_LIMITS.COLLAPSED_ITEMS`（`8`）。

## 流程 \{#flow}

1. `TodoTool.execute(...)` 从 `session.getTodoPhases?.() ?? []` 克隆当前缓存阶段（`packages/coding-agent/src/tools/todo.ts`）。
2. `resolveTodoParams(...)` 验证原始的单操作载荷。启用 `lenientArgValidation` 时，可根据非空 `list`（`init`）、非空 `items` 加非空 `phase`（`append`），或不存在任何阶段时没有该 phase 的非空 `items`（`init`），推断省略的 `op`。仅凭目标字段无法推断操作。其他模式失败返回 `Invalid todo arguments: ...`。
3. `applyParams(...)` 使用 `applyEntry(...)` 应用解析后的操作。
4. 每个操作都会变更工作阶段数组：
   - `initPhases(...)` 从头重建列表。
   - `start` 通过精确 `content` 解析任务，将其他所有 `in_progress` 任务降为 `pending`，再将目标标记为 `in_progress`。
   - `done` / `drop` 使用 `getTaskTargets(...)` 指向一个任务、一个阶段或所有任务。
   - `rm` 移除一个任务、清空一个阶段的 `tasks`，或清空所有阶段的任务数组。
   - `appendItems(...)` 解析或创建目标阶段，并加入新的 `pending` 任务，除非任意位置已经存在相同任务内容。
5. 缺失的任务/阶段引用和操作特定失败会记录在 `errors` 数组中；有任何错误时，最终都会丢弃该操作的变更。
6. 成功变更后，`normalizeInProgressTask(...)` 强制维持单活动任务不变量：
   - 若多个任务为 `in_progress`，则只有第一个保持活动，其余变为 `pending`；
   - 若没有任务为 `in_progress`，则按阶段/任务顺序将第一个 `pending` 任务自动提升为 `in_progress`；
7. 仅当操作没有产生错误且不是 `view` 时，`execute(...)` 才使用 `session.setTodoPhases?.(...)` 存储更新后的阶段；失败操作会被丢弃。在主会话中，如果选定后端定义了 `apply`，则只有在后端接受后才提交更改。存在 `session.getSessionFile()` 时，`storage` 为 `"session"`，否则为 `"memory"`。
8. `getCompletionTransitions(...)` 比较之前和更新后的阶段（失败或 `view` 调用会跳过）；新完成的任务在 `details.completedTasks` 中返回。
9. 成功或操作特定失败时，详情包含解析后的 `op`，包括从省略的输入推断出的操作。无法通过模式验证的载荷会在获得操作之前返回。
10.   智能体运行时在 `packages/coding-agent/src/session/agent-session.ts` 中监视 `todo` 工具结果；成功结果刷新待办缓存，失败结果注入隐藏的下一轮提醒，告诉模型重试前待办进度不可见。被待办后端阻止提交的调用（被 `apply` 拒绝，或因其他原因在那里失败）是例外：由于载荷没有问题，不会收到提醒。
11.   事件控制器在成功时根据 `result.details.phases` 更新可见的待办 UI，或在出错时显示警告（`packages/coding-agent/src/modes/controllers/event-controller.ts`）。

## 模式 / 变体 \{#modes--variants}

### 状态转换 \{#state-transitions}

| 当前状态 | `start` | `done` | `drop` | `rm` | `append` |
| --- | --- | --- | --- | --- | --- |
| `pending` | 目标变为 `in_progress` | `completed` | `abandoned` | 移除 | 新任务以 `pending` 状态进入 |
| `in_progress` | 目标保持 `in_progress`；非目标的活动任务变为 `pending` | `completed` | `abandoned` | 移除 | 状态不变 |
| `completed` | 若为目标，可重新设为 `in_progress` | 保持 `completed` | 若为目标，变为 `abandoned` | 移除 | 状态不变 |
| `abandoned` | 若为目标，可重新设为 `in_progress` | 若为目标，变为 `completed` | 保持 `abandoned` | 移除 | 状态不变 |

随后，归一化会在操作运行后重新应用单活动任务规则。

### 操作目标规则 \{#op-targeting-rules}

- `done`、`drop`、`rm`：
   - 已设置 `task`：影响一个内容精确匹配的任务。
   - 否则，已设置 `phase`：影响该名称精确匹配的阶段中的每个任务。
   - 否则：影响每个阶段中的每个任务。
- `append` 是唯一会创建缺失阶段的操作。
- `init` 完全丢弃之前的阶段。

### Markdown 往返转换辅助函数 \{#markdown-round-trip-helpers}

同一文件还公开了供 `/todo` 使用的非工具辅助函数：

- `phasesToMarkdown(...)` 将阶段序列化为标题加核对清单项（`[ ]`、`[/]`、`[x]`、`[-]`）。
- `markdownToPhases(...)` 解析该格式，默认将孤立任务归入 `Todos` 阶段，也接受 `>` 表示 `in_progress`、`~` 表示 `abandoned`，并运行相同的归一化步骤。

## 副作用 \{#side-effects}

- 文件系统
   - 工具本身没有文件系统副作用。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 通过 `setTodoPhases` 变更会话待办缓存。
   - `storage` 报告会话是否有支撑会话文件，但工具本身不追加自定义会话条目。
   - 成功改变状态的工具结果消息携带 `details.phases`；`getLatestTodoPhasesFromEntries(...)` 恢复最新的规范快照。失败和纯 `view` 结果会被跳过。
   - 没有直接的 `todo` 工具结果条目时，eval 调用方使用 `committedTodoPhases(...)` 单独持久化变更。
   - 失败的 `todo` 结果会使 `agent-session` 将隐藏的下一轮提醒加入队列（`customType: "todo-error-reminder"`）。
   - 当 `todo.backend` 设为扩展的后端时，主会话列表的每次已提交更改随后都会作为完整列表交给它（`docs/extensions.md`，待办后端）。`replace` 在提交后获得通知，不能拒绝；后端的可选 `apply` 会在模型的 `todo` 调用提交前被询问，且可以拒绝。
- 用户可见提示 / 交互式 UI
   - 会话记录块由 `todoToolRenderer` 渲染，并与调用行合并。
   - `event-controller` 根据成功结果更新可见的待办面板。
   - 出错时，`event-controller` 显示 `Todo update failed...`；可见面板可能保持过期状态，直到后续调用成功。
   - `/todo expand` 在固定 HUD 中显示每个阶段和任务；`/todo collapse` 恢复其有界预览。两者都仅影响显示，不改变待办状态。
- 后台工作 / 取消
   - 当每个任务都为 `completed` 或 `abandoned` 时，TUI 会在 `tasks.todoClearDelay` 后隐藏 HUD。规范阶段不会被移除。该关闭状态作为与精确规范快照绑定的 `todo_hud_state` 自定义条目持久化（`packages/coding-agent/src/modes/interactive-mode.ts`）。

## 限制与上限 \{#limits--caps}

- `init.list`：适用于单个操作（`todoSchema`）。参数对象携带一个操作。
- `init.list[*].items`：模式级 `minItems: 1`。
- 平铺的 `init.items` 和 `append.items`：共享模式允许任意数组长度，但操作特定执行会拒绝缺失/为空的列表。
- 渲染器折叠预览：`PREVIEW_LIMITS.COLLAPSED_ITEMS = 8`（`packages/coding-agent/src/utils/render-utils.ts`）。
- 执行时修复：仅针对上述无歧义载荷推断省略的 `op`；模式本身仍要求 `op`。
- HUD 自动隐藏延迟：`tasks.todoClearDelay` 默认 `60` 秒；`< 0` 禁用隐藏，`0` 立即隐藏。仅在所有任务都已关闭时适用；待处理或进行中的工作会使 HUD 保持可见。规范状态在显示变化和会话恢复后仍然保留。
- 工具执行模式：`concurrency = "exclusive"`、`strict = true`、`loadMode = "discoverable"`。

## 错误 \{#errors}

- 普通的无效操作载荷会以人类可读字符串累计到 `errors` 中；结果标记为 `isError: true`，并丢弃变更，返回和持久化的状态保持为调用前的列表。
- 错误字符串来自 `packages/coding-agent/src/tools/todo.ts` 中的辅助函数，包括：
   - `Missing list for init operation`
   - `Missing task content`
   - `Duplicate phase "..." in init list` / `Duplicate task "..." in init list`
   - `Task "..." not found`，适用时附加空列表提示；或在缺失内容看起来像 ID 时，提示任务按内容引用，而非按 `task-N` ID 引用
   - `Missing phase name`
   - `Phase "..." not found`
   - `Missing phase name for append operation`（显式为空的 `phase`，而非省略）
   - `Missing items for append operation`
   - `Task "..." already exists`
- 一个 `todo` 调用携带一个操作；其中任何错误都会丢弃该操作所做的所有变更。
- 运行时级工具失败在工具主体之外处理：`agent-session` 注入隐藏提醒，事件控制器警告用户可见进度可能过期。
- 幂等性因操作而异：
   - `init` 是完整替换；重放相同载荷得到相同状态。
   - 对已有目标状态而言，`start`、`done` 和 `drop` 实际上是幂等的，不过 `start` 还会降低另一个活动任务的状态。
   - 以任务为目标的 `rm` 不具幂等性：第二次调用会因任务已不存在而报错。以阶段为目标的 `rm` 仅清空阶段，因此重复调用会成功；不指定目标的 `rm` 同样会清空任务列表，而不移除阶段对象。
   - `append` 不具幂等性：重复任务内容会被拒绝，并返回 `Task "..." already exists`；`append` 操作会预先验证，因此包含任何重复项的操作都不会追加任何内容。

## 说明 \{#notes}

- 工具内部通过字符串精确相等查找任务。面向模型的提示词说明，任务内容和阶段名称是标识符，应保持唯一；`append` 强制任务全局唯一，`init` 拒绝其载荷中重复的阶段名称和任务内容。
- `findTaskByContent(...)` 返回跨阶段的第一个匹配任务。重复的任务内容会使后续指定目标的操作产生歧义。
- `normalizeInProgressTask(...)` 在操作之后运行一次，而非在操作中途运行。单个操作（例如 `init`）可以构造无效的中间状态，并依赖最终归一化。
- `storage: "session"` 表示会话有会话文件支撑；并不表示此工具写入了持久的自定义条目。
- 重新加载时的持久化因路径而异：
   - 普通 `todo` 调用保留在会话记录的工具结果详情中；
   - `/todo` 命令编辑还会追加 `customType: "user_todo_edit"` 条目，并注入模型可见的 `<system-reminder>` 开发者消息，描述此次手动编辑。
- 在恢复、回退、派生新会话或分支重新载入时，`TodoTracker.syncFromBranch()` 恢复最新的成功变更/自定义条目快照，包括已完成和已放弃的任务。纯 `view` 结果不会替换规范状态。
- 工具可用性由 `todo.enabled` 控制；启用 `includeYield` 时，注册表会排除此工具，除非会话已启用预遍历（`packages/coding-agent/src/tools/index.ts`）。
- 子代理不继承 `todo`；`packages/coding-agent/src/task/executor.ts` 也会将其作为父级所有的工具从活动集合中过滤。两层均有例外：已启用预遍历的子代理会保留它，因为预遍历计划提示和待办门控要求子级在移交前提交自己的待办列表。
