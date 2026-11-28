---
title: "/handoff 生成流水线"
description: "Oh My Pi 官方仓库文档：/handoff 生成流水线。"
---

# `/handoff` 生成流水线 \{#handoff-generation-pipeline}

本文介绍 coding-agent 如何实现 `/handoff`：触发路径、单次生成、会话内上下文压缩提交、持久化以及 UI 行为。

## 范围 \{#scope}

涵盖：

- 交互式 `/handoff` 命令派发
- `AgentSession.compact(focus, { mode: "handoff" })` 生命周期
- `SessionHandoff.generateDocument(...)` 和 `generateHandoffFromContext(...)` 的请求形式与兼容性重试
- 如何将交接文档提交为上下文压缩条目
- 成功、取消和失败时的 UI 行为

不涵盖：

- 通用树导航/分支内部机制
- 会话命令（`/new`、`/fork`、`/resume`）

## 实现文件 \{#implementation-files}

- [`src/slash-commands/builtin-registry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-registry.ts)
- [`src/modes/controllers/command-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/command-controller.ts)
- [`src/modes/controllers/input-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/input-controller.ts)
- [`src/session/session-handoff.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-handoff.ts)
- [`src/session/session-maintenance.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-maintenance.ts)
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`packages/agent/src/compaction/compaction.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/compaction/compaction.ts)
- [`packages/agent/src/compaction/messages.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/compaction/messages.ts)，方法专用的交接上下文包装器
- [`packages/agent/src/telemetry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/telemetry.ts)，带观测埋点的单次调用和暂时性故障重试
- [`src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)

## 触发路径 \{#trigger-path}

`/handoff [focus]` 是 `/compact handoff [focus]` 的别名。两者通过相同的上下文压缩命令处理器派发。SDK 通过 `session.compact(focus, { mode: "handoff" })` 选择模式。

## 端到端生命周期 \{#end-to-end-lifecycle}

### 1) 准备提交 \{#1-prepare-the-commit}

当选定模式在后台运行时，`SessionMaintenance.compact()` 会对活动分支和实时消息制作快照，而非中止智能体。它使用与前台模式相同的 `prepareCompaction(...)`、`session_before_compact` 钩子和手动上下文压缩生命周期事件。准备过程确定 `firstKeptEntryId` 和 `tokensBefore`；没有内容需要摘要的会话不会启动提供方请求。

### 2) 生成文档 \{#2-generate-the-document}

`SessionHandoff.generateDocument(focus, options)` 为此次上下文压缩提供文档：

- 要求已选定模型，并有该模型的 API key/解析器。
- 通过**与实时轮次相同的侧请求流水线**构建交接请求，该流水线也与临时轮次共用：
   1. 渲染交接提示词（`renderHandoffPrompt(...)`，可带关注点，在密钥混淆后），并作为归属于智能体的 `user` 消息追加到捕获的消息中。
   2. 为交接模型使用 `convertMessagesToLlm(...)` 转换快照（该模型可读取的 snapcompact 归档视图、会话 `transformContext`、LLM 转换和混淆）。
   3. 使用 `agent.buildSideRequestContext(llmMessages, baseSystemPrompt)` 构建提供方 `Context`，工具规范化和提供方上下文转换与循环一致。基础系统提示词被固定，因此提交的摘要不会继承逐轮的 `before_agent_start` 覆盖。
   4. 构建 simple-stream 选项，包含实时提供方缓存键、唯一的侧请求 `sessionId`（`<sid>:side:<snowflake>`）、服务层级/载荷钩子、`preferWebsockets: false`、`initiatorOverride: "agent"` 和中止信号。
- 混淆最终的提供方上下文，并通过宿主侧流传输调用 `generateHandoffFromContext(...)`。
- 对返回的交接文本解混淆。
- 对启用了 `compaction.handoffSaveToDisk` 的自动触发生成，在会话产物目录下写入带时间戳的 `handoff-*.md` 产物。

`generateHandoffFromContext(...)` 位于 `packages/agent/src/compaction/compaction.ts` 中，与摘要生成相邻。它针对调用方构建的 `Context` 发起一个带 OTEL 埋点、等效于 `completeSimple` 的单次调用，用受限的上下文压缩推理设置、`toolChoice: "none"` 和 `maxTokens: MAX_SUMMARY_TOKENS`（摘要输出上限，防止没有自身限制的服务器无限流传输）覆盖传入的流选项。

单次调用前，会在本地对照模型上下文窗口统计准备好的上下文（包括交接指令、系统提示词和工具模式）（`packages/agent/src/output-budget.ts` 中的 `countContextOverrun`）。如果请求没有为传输层最低可适配输出留出空间，则不进行网络 I/O 就会失败。计数不包含 tokenizer 余量，因此接近满载的请求仍会发送。

如果提供方因仅支持自动工具选择而拒绝显式 `toolChoice: "none"`，函数会用 `toolChoice: "auto"` 重试一次。工具仍会保留，以兼容缓存前缀，但返回的工具调用块会被忽略；仅拼接文本块。

每条工具选择路径还会启用共享的暂时性故障单次调用重试策略（三次尝试、500ms 基础退避，遵循提供方重试时序）。这独立于会话的 `auto_retry_*` 生命周期。

```ts
await generateHandoffFromContext(context, model, {
	streamOptions,
	completeImpl,
	telemetry,
	thinkingLevel,
});
```

`generateHandoff(messages, …)` 仍作为导出供下游调用方使用。它从 `systemPrompt`、`tools` 和 `convertToLlm` 构造基础上下文，然后委托给 `generateHandoffFromContext`；coding-agent 使用感知上下文的函数，使宿主转换、混淆、侧流路由和缓存键与实时轮次一致。

重要生成特性：

- 请求共用实时提供方缓存前缀，因为 `Context` 由与循环完全相同的转换 + 规范化流水线构建，并使用该轮次的同一个 `promptCacheKey` 路由。
- 交接指令是末尾的 `user` 消息，而非 developer 消息，因此缓存前缀与前一轮保持对齐（末尾消息是唯一分歧点）。
- `toolChoice: "none"` 在正常提供方上防止有意派发工具；兼容性重试仅在显式工具选择被拒绝后才使用 `"auto"`。
- 返回的助手内容会筛选为文本块，并用 `\n` 拼接；工具调用块被忽略。
- 兼容性重试后若 `stopReason === "error"`，则抛出生成错误。

直接从单次调用响应中捕获结果；不涉及智能体循环事件或最新助手消息扫描。

### 3) 取消与验证 \{#3-cancellation-and-validation}

`abortCompaction()` 或调用方的中止信号会取消生成，或取消正在等待提交边界的已准备结果。取消会引发 `CompactionCancelledError`，以信号原因为 `cause`；没有取消时的提供方失败则报告为失败。正值的 `compaction.handoffTimeoutSeconds`（默认 `0`，关闭）会在该截止时间以失败（`Handoff timed out after Ns`）而非取消的方式中止生成，并丢弃任何部分文本。缺少内容或缺少 `## Goal` 节会拒绝手动上下文压缩。自动维护可以转而尝试下一个已配置的方法。

### 4) 提交为上下文压缩条目 \{#4-commit-as-a-compaction-entry}

摘要在当前轮次及其工具结果持久化之后、下一次提供方调用之前，或在会话空闲时应用。如果快照已不在活动分支上，或被更新的上下文压缩或重置取代，则丢弃结果。

标准上下文压缩提交会：

1. 将文档包装为上下文压缩摘要：`upsertFileOperations(document, readFiles, modifiedFiles, …)` 从准备阶段的文件操作中追加累计的 `<files>` 标签；`{ readFiles, modifiedFiles }` 成为条目的 `details`。
2. 通过 `appendCompaction(summary, undefined, firstKeptEntryId, tokensBefore, options)` 追加常规 `CompactionEntry`，包含 `details`、`fromExtension: false`、`method: "handoff"` 和预计的 `tokensAfter` 计数。
3. 重建显示上下文、替换实时智能体消息、重新锚定统计（`rebaseAfterCompaction`）、重置计划引用、advisor 运行时（`"handoff"`）和待办阶段，并关闭历史记录已被重写的提供方会话。
4. 携带保存的条目发出 `session_compact` 扩展钩子。
5. 返回 `CompactionResult`。

会话 ID、会话文件和提供方提示词缓存键保持不变。提交会保留从 `firstKeptEntryId` 起的所有内容，包括 handoff 运行时到达的消息。在工具轮次之间应用时，它还会在实时循环的下一次请求前更新其上下文。

在 LLM 转换时，`method: "handoff"` 会选择 `packages/agent/src/compaction/prompts/handoff-summary-context.md`，而非通用上下文压缩包装器。这将文档标识为先前智能体实例的工作上下文，而非新的用户指令。

### 自动 handoff \{#automatic-handoff}

无论上下文维护方法顺序如何，手动 `/handoff` 都可工作。若要自动使用此流水线，请在 `compaction.methodOrder` 中包含 `handoff`（默认顺序为 `remote`、`snapcompact`、`handoff`、`shake`、`soft`）。阈值触发的 handoff（轮次后、提示词前、轮次中途）和 `incomplete` 恢复会在当前流程中生成并提交文档；轮次后的 handoff 会在运行的 `agent_end` 处理完成前结束。输入 `overflow` 会跳过 handoff 生成，因为请求将携带相同的过大输入，但已就绪的推测 handoff 结果仍可在溢出恢复期间应用。

异步上下文压缩（`compaction.asyncEnabled`）也可能在阈值前区间推测生成交接文档，并在跨过阈值时立即提交；参见 `docs/compaction.md`。

如果自动生成没有返回文档、失败或超时，维护过程会转向下一个已配置的方法。`compaction.handoffSaveToDisk` 默认为 `false`；启用时，只有自动触发的 handoff 才会写入额外的 markdown 产物。

## 交互行为 \{#interactive-behavior}

摘要在后台运行时，正常工作行保持可见。在主视图中，`Esc` 会取消待处理的上下文压缩，但不中断实时响应。成功提交后，共用的上下文压缩 UI 会重建会话记录，并保留实时工具和消息组件。
