---
title: "rewind"
description: "Oh My Pi 官方仓库文档：rewind。"
---

# rewind \{#rewind}

> 通过裁剪探索性上下文并保留简明报告，结束当前检查点。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/checkpoint.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/rewind.md`
- 关键协作组件：
   - `packages/coding-agent/src/session/agent-session.ts`：验证待处理的回退状态、应用实际回退，并注入保留的报告。
   - `packages/coding-agent/src/session/session-manager.ts`：为持久化会话树创建分支，并追加持久化摘要/报告条目。
   - `packages/coding-agent/src/session/session-context.ts`：`buildSessionContext()` 在重建上下文时，将持久化的 `branch_summary` 条目转换为 LLM 可见的 `branchSummary` 消息。
   - `packages/coding-agent/src/tools/index.ts`：注册工具，并共享 `checkpoint.enabled` 开关。

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "read"`、`strict = true`、`loadMode = "discoverable"`。执行是一次性的；回退副作用会延后应用，而不是以进度更新的形式流式发出。
- 注册要求 `checkpoint.enabled = true`（默认为 `false`）。
- 启用时，顶层会话会获得此工具。子代理默认不会发现它，但可通过显式 `tools:`/请求工具列表获得它。
- `checkpoint` 和 `rewind` 是一对安全配套工具：功能启用时，显式请求其中任意一个都会自动包含另一个。
- 在启用 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具会作为工具命令呈现（在 `bash` 中使用 `rewind --help`、`rewind <args>`）；显式请求的工具仍保持顶层形式。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `report` | `string` | 是 | 调查结果。`execute()` 会去除其首尾空白，并拒绝空结果。 |

## 输出 \{#outputs}

工具返回一个文本结果及结构化详情：

- 文本正文：
   - `Rewind requested.`
   - `Report captured for context replacement.`
- `details`：
   - `report: string`：去除首尾空白后的报告文本
   - `rewound: true`

返回的工具结果并非最终回退。`AgentSession` 会等到 `turn_end`，然后异步应用回退副作用。

## 流程 \{#flow}

1. `packages/coding-agent/src/tools/index.ts` 中的工具注册会强制执行 `checkpoint.enabled` 以及顶层/显式子代理可见性规则。`RewindTool.createIf()` 自身总会构造该工具。
2. 没有当前检查点时，`execute()` 会区分两种状态：
   - 存在保留的已完成回退：`ToolError("Checkpoint already completed; continue from the retained rewind report instead of calling rewind again.")`
   - 不存在已完成回退：`ToolError("No active checkpoint. Create a checkpoint before calling rewind.")`
3. 它会去除 `params.report` 的首尾空白；如果为空，则抛出 `ToolError("Report cannot be empty.")`。
4. 它返回带有 `details.report` 和 `details.rewound = true` 的 `toolResult()`。
5. 当回退工具结果成功时，`AgentSession` 从 `details.report` 或首个文本内容块中提取报告，并将其存入 `#pendingRewindReport`。
6. 在 `turn_end` 时，`#extractRewindReport()` 找到待处理或成功的回退结果，并调用 `#applyRewind()`。
7. `#applyRewind()` 首先调用 `sessionManager.branchWithSummary(checkpointEntryId, report, { startedAt })`，在检查点分支点记录一个 `branch_summary`。如果该条目已无法解析，它会记录警告，改为从根创建分支。
8. 它追加一条隐藏的持久化 `rewind-report` 自定义消息。其内容由 `prompts/system/rewind-report.md` 渲染，该模板告知下一轮检查点已完成、不要再次调用 `rewind`，并包含报告；详情包含 `{ report, startedAt, rewoundAt }`。
9. 它将同一助手批次中已完成的同级工具调用和结果重新挂到保留的分支上；携带成功 `rewind` 命令的 `bash` 结果会像直接的 `rewind` 结果一样被排除。它设置 `#lastCompletedRewind`，重建显示/LLM 上下文，并替换当前消息。更早的探索内容和成功的回退工具结果不会出现在下一次提供方调用中；已完成的同级工作仍然可见，并会在恢复后保留。
10.   它重置顾问会话状态，同时保留费用，从新分支同步待办和模型提及状态，并关闭历史记录被重写的提供方会话。
11.   最后，它清除 `#checkpointState` 和 `#pendingRewindReport`。后续恢复或树导航时，持久化的保留报告会重新加载 `#lastCompletedRewind`。

## 模式 / 变体 \{#modes--variants}

- 正常回退：检查点条目存在；会话历史从该条目所在的确切位置创建分支。
- 回退后备方案：当前会话树中缺少检查点条目 ID；回退从根创建分支，并记录警告。
- 延迟到轮次结束应用：工具结果只请求回退；分支创建和上下文替换发生在外围助手轮次结束后。
- 恢复的检查点：当前持久化分支上尚未完成的成功检查点工具结果会重新加载检查点状态，使进程恢复后能够回退。

## 副作用 \{#side-effects}

- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 根据检查点分支加上保留的摘要/报告重建当前对话历史；不会恢复文件或进程状态。
   - 添加一条隐藏的自定义消息 `rewind-report`，携带渲染后的恢复指导和报告。
   - 记录 `#lastCompletedRewind`，清除当前检查点和待处理报告，重置顾问，重新同步待办状态，并关闭因历史重写而失效的提供方会话。
   - 将持久化会话叶节点重新定位到检查点分支点，并追加新的会话条目。
- 文件系统
   - 通过正常的 `SessionManager` 追加持久化机制，将新的 `branch_summary` 和 `custom_message` 条目持久化到会话 `.jsonl` 文件。
   - 会话目录中的会话文件名为 `<ISO-timestamp-with-:-and-.-replaced>_<uuidv7>.jsonl`；未传入覆盖设置时，默认目录选择为 `~/.omp/agent/sessions/<encoded-cwd>/`。
- 用户可见提示 / 交互式 UI
   - 工具结果在轮次结束应用之前可见。
   - 重建上下文时，持久化的 `branch_summary` 会成为 LLM 可见的 `branchSummary` 消息；上下文压缩渲染会将其呈现为用户角色的 `<summary>` 块。
   - 隐藏的 `rewind-report` 自定义消息会成为下一次提供方调用的开发者角色保留指导。
- 后台工作 / 取消
   - 回退应用延后到 `turn_end`。没有独立的作业对象或取消句柄。

## 限制与上限 \{#limits--caps}

- 可用性由 `checkpoint.enabled` 控制，默认为 `false`。
- 子代理需要显式的请求工具条目；请求任一检查点工具都会自动包含其配套工具。
- 一个会话最多有一个当前检查点；没有命名或在多个检查点之间选择的途径。
- 报告文本在 `trim()` 后须非空。
- 回退只恢复当前对话/会话树上下文；没有文件、产物、blob、进程或 git 恢复路径。
- 持久化的报告/摘要内容受全局会话持久化上限 `MAX_PERSIST_CHARS = 500_000` 约束。

## 错误 \{#errors}

- `ToolError("Checkpoint already completed; continue from the retained rewind report instead of calling rewind again.")`：当前分支已包含保留的完成记录时抛出。
- `ToolError("No active checkpoint. Create a checkpoint before calling rewind.")`：既不存在当前检查点，也不存在已完成回退时抛出。
- `ToolError("Report cannot be empty.")`：去除首尾空白后的报告为空时抛出。
- 应用期间缺少检查点条目 ID 不会使已完成的工具调用失败；`#applyRewind()` 会记录 `Rewind branch checkpoint missing, falling back to root`，并从根创建分支。

## 备注 \{#notes}

- 检查点选择是隐式的。`rewind` 始终针对单个 `#checkpointState`，该状态从最后一个尚未完成的成功 `checkpoint` 捕获或重新加载；没有检查点列表、标签或 ID 参数。
- 恢复的状态是当前对话/会话树上下文：
   - 持久化分支重置为 `checkpointEntryId` 或回退到根
   - 被放弃的探索路径的分支摘要
   - 保留的 `rewind-report` 自定义消息
   - 根据该分支重建的内存中消息
- 不会恢复：
   - 文件系统或 git 状态
   - `packages/coding-agent/src/session/artifacts.ts` 下的产物
   - `packages/coding-agent/src/session/blob-store.ts` 下的 blob 存储载荷
   - `packages/coding-agent/src/session/history-storage.ts` 中的提示词历史行
   - `packages/coding-agent/src/session/agent-storage.ts` 中的身份验证或其他智能体存储
- 没有并发编辑协调机制。回退既不会合并，也不会还原代码或会话关联的外部状态。
- 回退不会破坏持久化会话历史。`branchWithSummary()` 会追加一个新的 `branch_summary` 条目并移动叶节点；被放弃的条目仍保留在 `.jsonl` 日志中，但会离开当前分支。
