---
title: "memory_edit"
description: "Oh My Pi 官方仓库文档：memory_edit。"
---

# memory_edit \{#memory_edit}

> 按 id 更新、遗忘或使 Mnemopi 长期记忆失效。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/memory-edit.ts`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/memory-edit.md`
- 后端协作模块：`packages/coding-agent/src/mnemopi/state.ts`（`editScopedMemory(...)`）

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "read"`、`strict = true`、`loadMode = "discoverable"`，尽管成功的调用会修改本地记忆。
- 注册要求 `memory.backend = "mnemopi"`；对于 `"off"`、`"local"` 和 `"hindsight"`，该工具不存在。
- 在带有显式工具列表的不受限会话中，注册会为 Mnemopi 自动包含 `memory_edit`。不会扩大受限列表。
- 在启用了 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具作为工具命令呈现（在 `bash` 中使用 `memory_edit --help`、`memory_edit <args>`）；显式请求的工具仍保持为顶层工具。
- 执行同步且为一次性操作，没有进度回调或取消参数。

## 输入 \{#inputs}

| 字段 | 类型 | 是否必填 | 说明 |
| --- | --- | ---: | --- |
| `op` | `"update" \| "forget" \| "invalidate"` | 是 | 要应用的编辑操作。 |
| `id` | `string` | 是 | `recall` 返回的记忆 id。 |
| `content` | `string` | 否 | 用于 `update` 的替换记忆文本。 |
| `importance` | `number` | 否 | 用于 `update` 的替换重要性；钳制至 `0..1`。 |
| `replacement_id` | `string` | 否 | 为 `invalidate` 记录的替代记忆 id。 |

## 输出 \{#outputs}

- `content[0].type = "text"`
- 成功的变更渲染为 `Memory <id> updated|deleted|invalidated in bank <bank> (<store>).`
- 未知或不符合操作条件的 id 渲染为 `Memory <id> was not found...`；这是状态为 `not_found` 的正常结果。
- 事实 id 渲染为 `Memory <id> is a read-only fact...; it cannot be edited. Read it with memory://<id>.`；这是状态为 `not_editable` 的正常结果。
- `details` 为 `{ status, bank?, store? }`，其中 status 为 `"updated" | "deleted" | "invalidated" | "not_found" | "not_editable"`，解析到记录行时 store 为 `"working" | "episodic" | "fact"`。

## 流程 \{#flow}

1. `MemoryEditTool.createIf(...)` 仅在 `memory.backend == "mnemopi"` 时暴露工具。
2. `execute(...)` 获取 `session.getMnemopiSessionState()`，如果后端尚未初始化则失败。
3. `update` 要求至少提供 `content` 或 `importance` 之一。
4. 在调用后端前，将 `importance` 钳制至 `0..1`。
5. 工具调用 `state.editScopedMemory(op, id, { content, importance, replacementId })`。
6. 后端按顺序搜索去重后的 retain、recall 和全局目标。返回第一个成功的可编辑结果，否则返回第一个解析到但不符合条件的结果，否则返回 `not_found`。
7. 工具渲染返回的状态，并将后端结果不作更改地放入 `details`。

## 模式 / 变体 \{#modes--variants}

- `update` 替换工作记忆文本和/或重要性。内容替换是整体替换，不是补丁，并会在存储前经过 `redactMemorySecrets(...)` 处理。
- `forget` 永久删除工作记忆记录行。
- `invalidate` 以软方式取代工作或情景记忆记录行，并可记录 `replacement_id`。
- 事实记录行可读但不可变；每种操作都返回 `not_editable`。
- 对情景记忆 id 执行 `update`/`forget` 会返回 `not_found` 并附带其 bank/store 位置，因为这些操作只支持工作记忆。

## 副作用 \{#side-effects}

- 文件系统：修改包含已解析记录行的本地 Mnemopi SQLite 数据库，它可能是 retain、recall、共享或安全发现的旧版记忆库。
- 网络：无；编辑操作不调用嵌入或提取提供方。
- 会话状态：读取活动会话限定范围内的 Mnemopi 状态；不会重写已注入的 `<memories>` 上下文。

## 限制与上限 \{#limits--caps}

- 可用性要求 `memory.backend = "mnemopi"`；Hindsight 和本地文件支持的记忆不暴露此工具。
- 必须直接提供 `id`；工具不按内容搜索。
- 召回预览默认上限为 500 个字符。每次 `update` 前都要获取 `read memory://<id>`；该 URL 从调用会话限定范围的记忆库中解析完整记录行。
- 未提供 `content` 或 `importance` 的 `update` 会在任何后端写入之前被拒绝。
- 超出 `0..1` 的 `importance` 值会被钳制，而不是被拒绝。

## 错误 \{#errors}

- 工具已暴露但会话状态缺失时，抛出 `Mnemopi backend is not initialised for this session.`。
- 空更新会抛出 `memory_edit update requires content or importance.`。
- 缺失的 id、用于更新/遗忘的情景记忆 id，以及事实 id 都是正常结果，而非抛出的错误；请检查 `details.status`。
- 当该会话的记忆库不包含记录行时，`read memory://<id>` 会抛出 `Mnemopi memory <id> not found in the calling session's scoped bank`；仅由另一个活动会话持有的记录行无法访问。

## 注意事项 \{#notes}

- 每次更新之前都要读取完整的 `memory://<id>` 记录行。将截断的召回预览复制到 `content` 会删除未看到的尾部内容。
- 对于历史可能仍有用处的陈旧工作/情景记忆，优先使用 `invalidate`。
- 只有当工作记忆记录行应被硬删除时才使用 `forget`。
