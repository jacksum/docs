---
title: "recall"
description: "Oh My Pi 官方仓库文档：recall。"
---

# recall \{#recall}

> 搜索当前长期记忆后端，并返回匹配的记忆。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/memory-recall.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/recall.md`
- Hindsight 协作组件：
   - `packages/coding-agent/src/hindsight/state.ts`：会话状态、召回查询默认值、提示词侧自动召回。
   - `packages/coding-agent/src/hindsight/content.ts`：结果格式化和 UTC 时间戳格式化。
   - `packages/coding-agent/src/hindsight/client.ts`：HTTP `recall` 调用和错误映射。
   - `packages/coding-agent/src/hindsight/bank.ts`：记忆库 ID 和标签过滤作用域。
- Mnemopi 协作组件：
   - `packages/coding-agent/src/mnemopi/state.ts`：限定作用域的本地召回以及带 ID 的结果格式化。
   - `packages/coding-agent/src/mnemopi/config.ts`：本地记忆库作用域和召回限制。
   - `docs/tools/retain.md`：共享的后端、存储、作用域和保留行为。

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "read"`、`strict = true`、`loadMode = "discoverable"`。
- 工具仅在 `memory.backend = "hindsight"` 或 `"mnemopi"` 时注册；在 `"off"` 和 `"local"` 时不存在。Hindsight 还要求已配置非空的 API URL（`isHindsightConfigured(loadHindsightConfig(...))`）。
- 在具有显式工具列表的不受限会话中，对任一受支持后端，注册时都会自动包含共享的 `recall`/`retain`/`reflect` 工具集。受限列表不会被扩展。
- 在启用 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具会作为工具命令呈现（在 `bash` 中使用 `recall --help`、`recall <args>`）；显式请求的工具仍保持顶层形式。
- 执行是一次性的。工具不会发出流式参数/结果更新。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | ---: | --- |
| `query` | `string` | 是 | 自然语言搜索查询。工具原样传递该查询，但 Mnemopi `per-project-tagged` 可能运行内部共享记忆库回退查询。 |

## 输出 \{#outputs}

返回一次性工具结果。

存在匹配项时：

- `content[0].type = "text"`
- `content[0].text = "Found <n> relevant memory/memories (as of YYYY-MM-DD HH:MM UTC):\n\n<bullet list>"`
- `details = {}`

Hindsight 项目符号格式来自 `formatMemories(...)`：

- 每个项目符号为 `- <text> [<type>] (<mentioned_at>)`；类型和时间戳后缀仅在这些字段存在时显示。

Mnemopi 项目符号格式来自 `formatScopedRecallWithIds(...)`：

- 每个项目符号为 `- <content> (id: <id>) [<source>] (<YYYY-MM-DD>) c:<score>`；ID 不可用时呈现为 `(id unavailable)`，来源、日期和分数在缺失时省略。
- Mnemopi 召回内容是预览，默认上限为 500 个字符（`packages/mnemopi/src/core/beam/recall.ts` 中的 `RECALL_CONTENT_PREVIEW_CHARS` / `RecallOptions.contentPreviewChars`；`0` 或负数限制会禁用裁剪，显式工具路径使用默认值）。被裁剪的预览以 `…` 结尾；在通过 `memory_edit update` 整体更新之前，应使用 `read memory://<id>` 获取完整行。
- 尽管内部召回行带有 `truncated` 和 `full_length`，此工具返回的是格式化文本和 `details = {}`，不会公开这些字段。

不存在匹配项时：

- `content[0].text = "No relevant memories found."`
- `details = {}`
- `useless = true`，允许调用方/渲染器将结果视为不贡献内容的上下文。

## 流程 \{#flow}

1. 当 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"` 时，`MemoryRecallTool.createIf(...)` 会公开该工具。
2. `execute(...)` 将操作包装在 `untilAborted(...)` 中。
3. 如果后端为 `mnemopi`：
   - 读取 `session.getMnemopiSessionState()`，如果后端尚未启动则抛出异常；
   - 调用 `state.recallResultsScoped(params.query)`；
   - 限定作用域的召回使用 `recallEnhanced(query, recallLimit, { includeFacts: true, channelId: bank })` 查询每个已解析的召回记忆库，按 ID/内容合并并去重结果，排序后截断至 `recallLimit`；
   - 按项目划分的模式可能包含安全的旧版记忆库，这些库的工作记忆行全部属于当前绝对 cwd；启动扫描上限为 64 个候选记忆库目录；
   - 在 `per-project-tagged` 中，共享记忆库可能收到一次额外的回退查询，该查询剥离项目记忆库字面量词元，以便宽泛的全局记忆仍能匹配；
   - 结果会格式化为带 ID 的形式，供后续完整行读取和 `memory_edit` 使用。
4. 如果后端为 `hindsight`：
   - 读取 `session.getHindsightSessionState()`，如果后端尚未启动则抛出异常；
   - 使用 `bankId`、查询、配置的 `budget`、`maxTokens`、`types` 以及记忆库作用域标签过滤器调用 `state.client.recall(...)`；
   - `HindsightApi.recall(...)` 向 `/v1/default/banks/{bank_id}/memories/recall` 发送 POST 请求；
   - 使用 `formatMemories(...)` 将结果格式化为纯文本列表。
5. 后端失败会通过 `logger.warn("recall failed", ...)` 记录，并在需要时以 `Error` 实例重新抛出。

## 模式 / 变体 \{#modes--variants}

- 工具路径：显式的纯查询召回。它不会从最近的轮次构建上下文。
- 后端自动召回在 `HindsightSessionState.beforeAgentStartPrompt(...)` / `maybeRecallOnAgentStart(...)` 和 `MnemopiSessionState.beforeAgentStartPrompt(...)` / `maybeRecallOnAgentStart(...)` 中具有更丰富的查询构建路径。
- Hindsight 记忆库作用域：
   - `global`：无标签过滤器。
   - `per-project`：每个项目标签使用独立的记忆库 ID（git 主检出根目录的基本名；仓库外则为 cwd 基本名）。
   - `per-project-tagged`：共享记忆库 ID 加上 `project:<project label>` 过滤器，并使用 `tagsMatch = "any"`，因此带项目标签的记忆和无标签的全局记忆都能出现。
- Mnemopi 记忆库作用域：
   - `global`：召回读取共享记忆库。
   - `per-project`：召回读取由绝对 cwd 基本名加该绝对 cwd 的哈希派生的记忆库。
   - `per-project-tagged`：召回读取由 cwd 派生的项目记忆库和共享记忆库，然后合并结果。
   - 按项目划分的模式还可能读取经安全识别、仅基于 cwd 的旧版记忆库，以恢复早期基于 git 根目录的方案下创建的记忆。
- 会话作用域：使用当前会话缓存的配置和作用域，读取跨会话记忆数据。子代理别名使用父级的后端作用域。

## 副作用 \{#side-effects}

- 网络
   - Hindsight：`POST /v1/default/banks/{bank_id}/memories/recall`。
   - Mnemopi：无，除非所配置的本地运行时提供方在召回期间执行嵌入/LLM 工作。
- 会话状态
   - 显式工具路径成功时无影响。与后端自动召回不同，此工具不会更新 `lastRecallSnippet` 或刷新系统提示词。
- 后台工作 / 取消
   - 工具调用信号被取消时，通过 `untilAborted(...)` 中止。

## 限制与上限 \{#limits--caps}

- 工具可用性要求 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"`；默认 `memory.backend` 为 `"off"`。
- 对于原始 `HindsightApi.recall(...)`，Hindsight 客户端默认预算为 `"mid"`；此工具会使用配置覆盖它。
- Hindsight 召回设置：
   - `hindsight.recallBudget = "mid"`
   - `hindsight.recallMaxTokens = 1024`
   - `hindsight.recallTypes = ["world", "experience"]`
   - `hindsight.recallTimeoutMs = 30_000`
- Mnemopi 召回设置：
   - `mnemopi.recallLimit = 8`（运行时限定为至少 1）
   - `mnemopi.scoping = "per-project"`
   - 内容预览上限为每个结果 500 个字符
- 显式工具路径不应用 `hindsight.recallContextTurns`、`hindsight.recallMaxQueryChars`、`mnemopi.recallContextTurns` 或 `mnemopi.recallMaxQueryChars`；这些上限只影响后端自动召回的查询构建。

## 错误 \{#errors}

- 当 `memory.backend == "mnemopi"` 但不存在状态时，抛出 `Mnemopi backend is not initialised for this session.`。
- 当 `memory.backend == "hindsight"` 但不存在状态时，抛出 `Hindsight backend is not initialised for this session.`。
- Hindsight HTTP、获取和超时失败会变为 `HindsightError`；HTTP 错误会在可用时包含 `statusCode` 和解析后的 `details`。
- Mnemopi 召回会按目标捕获失败并记录。健康目标仍会贡献结果；如果所有尝试的目标都失败，则抛出原始错误（单个目标）或带有记忆库详情的 `AggregateError`（多个目标），而不是转换为空结果。
- 工具捕获到的非 `Error` 失败会在重新抛出之前规范化为 `new Error(String(err))`。

## 备注 \{#notes}

- 共享后端详情见 `docs/tools/retain.md`：存储、子代理别名、记忆库作用域、任务设置和心智模型行为。
- 此工具不会获取 Hindsight 心智模型。它们可能已存在于智能体的开发者指令中，因为后端会独立于召回结果缓存一个 `<mental_models>` 块。
- Mnemopi 开发者指令可能包含自动召回生成的 `<memories>` 块；此显式工具不会更新该块。
- 工具返回记忆命中项，不会综合这些内容。远程 Hindsight 综合请使用 `reflect`；Mnemopi 的 `reflect` 变体是本地召回加格式化。
