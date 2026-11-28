---
title: "checkpoint"
description: "Oh My Pi 官方仓库文档：checkpoint。"
---

# checkpoint \{#checkpoint}

> 标记当前顶层对话状态，以便稍后通过 `rewind` 将探索性上下文收拢为报告。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/checkpoint.ts`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/checkpoint.md`
- 主要协作组件：
   - `packages/coding-agent/src/session/agent-session.ts`：工具成功后捕获活动检查点。
   - `packages/coding-agent/src/session/session-manager.ts`：持久保存常规会话条目流，不保存活动检查点标记。
   - `packages/coding-agent/src/tools/index.ts`：注册工具，并通过 `checkpoint.enabled` 控制是否启用。
   - `packages/coding-agent/src/tools/settings.ts`：定义默认禁用的功能标志（`cfgCheckpointEnabled`）。

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "read"`、`strict = true`、`loadMode = "discoverable"`。执行为一次性操作；工具不以流式方式更新进度。
- 注册要求 `checkpoint.enabled = true`（默认为 `false`）。
- 启用后，顶层会话会获得此工具。子代理默认无法发现它，但可以通过显式 `tools:`/请求工具列表获得它。
- `checkpoint` 和 `rewind` 是一对安全工具：启用此功能时，只要显式请求其中一个名称，注册就会自动包含另一个。
- 在启用了 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具会作为工具命令呈现（在 `bash` 中使用 `checkpoint --help`、`checkpoint <args>`）；显式请求的工具仍保持顶层形式。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `goal` | `string` | 是 | 调查目标。模式要求此字段，工具结果会原样回显它；实现不会去除其首尾空白，也不拒绝空字符串。 |

## 输出 \{#outputs}

工具返回单个文本结果和结构化详情：

- 文本正文：
   - `Checkpoint: <goal>`
   - `Finish exploration and formulate findings.`
- `details`：
   - `goal: string`
   - `startedAt: string`：在 `CheckpointTool.execute()` 内创建的 ISO 时间戳

不返回检查点 ID、产物 URI、作业句柄、文件路径或恢复令牌。

## 流程 \{#flow}

1. `packages/coding-agent/src/tools/index.ts` 中的工具注册强制执行 `checkpoint.enabled` 以及顶层/显式子代理可见性规则。`CheckpointTool.createIf()` 本身始终构造工具。
2. 当 `session.getCheckpointState?.()` 已设置时，`CheckpointTool.execute()` 会以 `ToolError("Checkpoint already active.")` 拒绝嵌套检查点。
3. 它创建 `startedAt = new Date().toISOString()`，并返回常规 `toolResult()` 载荷。工具方法本身不修改检查点状态。
4. 检查点成功的 `message_end` 发生时，`AgentSession` 同步捕获：
   - `checkpointMessageCount`：当前 `agent.state.messages.length`，此时检查点工具结果已追加
   - `checkpointEntryId`：初始为 `null`，随后根据消息身份，回填已持久保存的检查点工具结果条目自身的 ID
   - `startedAt`：从工具详情复制或重新生成
5. 它清空 `#pendingRewindReport` 和 `#lastCompletedRewind`，并在任何需等待的工作之前，将隐藏的 `checkpoint-active-reminder` 作为引导加入队列。该提醒会到达下一次提供方调用，并持久保存在检查点条目之后；rewind 的分支截断会移除它。
6. 恢复、切换会话或树导航时，`#rehydrateCheckpointRewindState()` 会扫描当前持久保存的分支。最近一次成功的检查点如果后面没有保留的 rewind 报告，就会重建活动检查点边界和保护机制。

## 副作用 \{#side-effects}

- 会话状态（会话记录、内存、作业、检查点、注册表）
   - 在内存中设置 `AgentSession.#checkpointState`。
   - 将检查点边界记录为消息数量及已持久保存的检查点工具结果条目 ID。
   - 普通的成功工具结果条目足以在恢复后重建尚未完成的检查点；没有单独的检查点标记条目。
   - 启用后续稳定结束保护：如果检查点处于活动状态且没有待处理的 rewind 报告，`#enforceRewindBeforeYield()` 会注入 developer 角色警告，并安排下一轮。
- 用户可见提示 / 交互式 UI
   - 工具提示和隐藏的检查点活动提醒会告诉模型在调查后调用 `rewind`。
   - 如果智能体试图先 `yield`，`AgentSession` 会注入：

```text
<system-warning>
You are in an active checkpoint. You MUST call rewind with your investigation findings before yielding. Do NOT yield without completing the checkpoint.
</system-warning>
```

## 限制与上限 \{#limits--caps}

- 可用性由 `checkpoint.enabled` 控制，默认为 `false`。
- 每个会话或子代理只允许有一个活动检查点。
- 子代理需要显式的请求工具条目；请求任意一个检查点工具会自动包含另一个。
- 检查点状态不作为专用条目持久保存。它从活动分支上成功的检查点工具结果条目重建，包括进程恢复之后。
- 会话持久化适用于普通的检查点工具调用/结果消息。全局会话持久化截断值为 `packages/coding-agent/src/session/session-persistence.ts` 中的 `MAX_PERSIST_CHARS = 500_000`。

## 错误 \{#errors}

- `ToolError("Checkpoint already active.")`：先前的检查点尚未回退或清除时抛出。
- 工具体没有局部 `try/catch`；意外异常会向上传播。

## 说明 \{#notes}

- 尽管摘要字符串为 `Create a git-based checkpoint to save and restore session state`，实现并不调用 git，也不对文件系统状态创建快照。
- 捕获的状态仅为对话/会话元数据：
   - 内存中的消息数量
   - 会话树中已持久保存的检查点工具结果条目 ID
   - 时间戳
- 不捕获：
   - 工作树内容或已暂存的更改
   - 产物或 blob 存储内容
   - `packages/coding-agent/src/session/history-storage.ts` 中的 SQLite 提示历史记录行
   - `packages/coding-agent/src/session/agent-storage.ts` 中的认证或智能体记录
