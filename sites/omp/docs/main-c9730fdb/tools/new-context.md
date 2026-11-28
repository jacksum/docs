---
title: "new_context"
description: "Oh My Pi 官方仓库文档：new_context。"
---

# new_context \{#new_context}

> 请求一个全新的实验性上下文窗口，同时保留当前笔记本和可恢复的分支历史。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/context-notes.ts`（`NewContextTool`）
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/new-context.md`
- 请求消费：`packages/coding-agent/src/session/agent-session.ts`
- 切换生命周期：`packages/coding-agent/src/session/session-maintenance.ts`
- 注册：`packages/coding-agent/src/tools/index.ts`

## 注册 / 可见性 \{#registration--visibility}

- 要求 `compaction.experimentalContextManagement = true`、会话尚未释放，以及会话日志的 ID 与工具会话的所有者 ID 匹配。
- 该设置默认是 `false`。在 `/settings` → Context → Compaction 下启用 **笔记支持的上下文窗口（实验性）**；运行中的会话会立即获得此工具。
- 元数据：`approval = "write"`、`strict = true`、`loadMode = "essential"`。
- 笔记支持的切换要求四个工具全部处于活动状态：`context_notes`、`new_context`、`read` 和 `grep`。不受支持的工具配置会保留现有的上下文压缩行为。

## 输入 \{#inputs}

空对象：`{}`。工具不接受指令、笔记本文本或目标会话 ID。请求切换前，请使用 [context_notes](./context-notes.md) 保存工作笔记本。

## 输出 \{#outputs}

- 文本：`New context window requested.`
- 详情：`{ requested: true }`。

此结果表示已确认请求。工具本身不会提交上下文压缩边界，也不会同步重置对话。

## 流程与副作用 \{#flow-and-side-effects}

1. 验证所属会话并检查取消。
2. 返回本轮局部的切换请求。
3. 所属智能体消费成功的工具结果，包括在 `bash` 调用内运行的工具命令的结果，并在下一次提供方请求之前，通过其维护生命周期处理该请求。
4. 实验性生命周期会提交一个普通的上下文压缩边界，不再生成另一个递归摘要。它使用最新笔记本和保留的近期消息重建活动上下文，原始日志条目仍可通过 `history://current/full` 访问。

显式的 `new_context` 请求会绕过 Auto-Compact 开关。切换仍依赖实验性能力和维护防护；在提交之前，会重新验证会话、分支、模型、取消状态和活动工具的变化。如果在确认请求之后该能力消失，则丢弃过期请求，而不是回退到摘要提供方的上下文压缩。

## 限制与错误 \{#limits-and-errors}

- 已禁用、已释放或所有者不匹配的工具会话会以 `ToolError` 失败。
- 返回请求前会检查取消。
- 维护生命周期处理取消、扩展钩子、并发上下文压缩以及过期的会话或分支状态。工具请求成功并不能证明后续切换已提交。
- 此工具不会创建新会话、更改工作文件或删除原始日志历史。

关于自动切换、笔记本提醒和手动上下文压缩行为，参见[上下文压缩与分支摘要](../compaction.md)。
