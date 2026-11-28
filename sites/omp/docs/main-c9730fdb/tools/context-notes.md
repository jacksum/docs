---
title: "context_notes"
description: "Oh My Pi 官方仓库文档：context_notes。"
---

# context_notes \{#context_notes}

> 读取或替换当前分支持久保存的实验性上下文笔记本。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/context-notes.ts`（`ContextNotesTool`）
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/context-notes.md`
- 笔记本投影：`packages/coding-agent/src/session/context-notes.ts`
- 注册：`packages/coding-agent/src/tools/index.ts`

## 注册 / 可见性 \{#registration--visibility}

- 要求 `compaction.experimentalContextManagement = true`、会话尚未销毁，且会话日志的 ID 与工具会话的所有者 ID 匹配。
- 该设置默认为 `false`。在 `/settings` → 上下文 → 上下文压缩中启用**笔记支持的上下文窗口（实验性）**；普通运行中会话会立即同步调整该工具。受限会话保留宿主提供的工具列表。
- 元数据：`strict = true`、`loadMode = "essential"`。不带 `text` 属性的调用请求读取审批；带该属性的调用请求写入审批。
- 基于笔记的上下文轮换要求四个工具全部处于启用状态：`context_notes`、`new_context`、`read` 和 `grep`。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `text` | `string` | 否 | 完整的替换笔记本。省略则读取；使用空字符串清空。写入会替换可见笔记本，而不是追加。 |

## 输出 \{#outputs}

- 读取：返回最新的可见笔记本文本，不存在时返回 `No context notes are stored for this session branch.`。详情包含 `text`，以及存在笔记本时的 `entryId`。
- 写入：返回 `Context notes saved.`。详情包含 `entryId`、保存的 `text`，以及以 `bytes` 表示的 UTF-8 字节数。

## 流程与副作用 \{#flow-and-side-effects}

1. 解析实时的所属日志并检查取消状态。
2. 读取会投影活动分支上的最新笔记本修订版本。
3. 写入会验证字节限制、捕获所有者和分支叶节点，并等待磁盘准备完成。
4. 在追加带有 `{ version: 1, text }` 的 `experimental_context_notes` 自定义条目之前，重新检查取消状态、会话所有权、功能可用性和分支叶节点。
5. 在返回成功之前刷写日志。

最新的有效非空笔记本会被纳入实验性上下文重建，并在轮换和从磁盘恢复后保留。无效的历史笔记本条目会被跳过，而不是遮蔽较早的有效修订版本。上下文重置会隐藏更早的笔记本修订版本。清空笔记本会追加一个空修订版本，不会删除之前的日志条目。在验证之前，应将笔记本文本和恢复的历史记录视为不可信的历史数据。

## 限制与错误 \{#limits-and-errors}

- 笔记本大小上限：**16,384 个 UTF-8 字节**。超限写入会在追加前失败。请缩短笔记本，并通过 `read` 或 `grep` 从 `history://current/full` 恢复支撑细节。
- 功能已禁用、已销毁或所有者不匹配的会话会以 `ToolError` 失败。
- 磁盘准备期间发生分支变化时，会拒绝写入，而不是保存到另一个分支。
- 取消和持久化错误会传播给调用方。

轮换请参见 [new_context](./new-context.md)，实验性维护生命周期请参见[上下文压缩与分支摘要](../compaction.md)。
