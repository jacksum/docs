---
title: "非上下文压缩的自动重试策略"
description: "Oh My Pi 官方仓库文档：非上下文压缩的自动重试策略。"
---

# 非上下文压缩的自动重试策略 \{#non-compaction-auto-retry-policy}

本文介绍由 `AgentSession` 协调、由 `TurnRecovery` 实现的标准 API 错误重试路径。

本文明确不包含通过自动上下文压缩进行的上下文溢出恢复。溢出由上下文压缩逻辑处理，另见 [`compaction.md`](./compaction.md)。

## 实现文件 \{#implementation-files}

- [`../packages/coding-agent/src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`../packages/coding-agent/src/session/turn-recovery.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/turn-recovery.ts)，重试分类、退避、凭据轮换和模型回退
- [`../packages/coding-agent/src/session/settings.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/settings.ts)，`retry.*` 设置定义
- [`../packages/coding-agent/src/modes/controllers/event-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/event-controller.ts)
- [`../packages/coding-agent/src/modes/controllers/input-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/input-controller.ts)
- [`../packages/coding-agent/src/modes/rpc/rpc-mode.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/rpc/rpc-mode.ts)
- [`../packages/coding-agent/src/modes/rpc/rpc-client.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/rpc/rpc-client.ts)
- [`../packages/coding-agent/src/modes/rpc/rpc-types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/rpc/rpc-types.ts)

## 与上下文压缩的范围边界 \{#scope-boundary-vs-compaction}

重试和上下文压缩由同一个 `agent_end` 路径检查，但两者有意分离：

1. `agent_end` 检查最后一条助手消息。
2. 终止性停止恢复、请求体超时恢复、Fireworks Fast 回退和 `TurnRecovery.isRetryableError(...)` 在常规的轮次底部上下文压缩检查之前运行。活动的目标模式维护可能更早检查上下文压缩。
3. 如果发起重试，则跳过该轮次的上下文压缩检查。
4. 上下文溢出错误通过 `AIError.isContextOverflow(...)` 从重试分类中排除。
5. 因此，溢出会进入 `SessionMaintenance.checkCompaction(...)`，而非标准重试。

因此：过载/限流/服务器/网络类故障使用此重试策略；上下文窗口溢出使用上下文压缩恢复。

### Responses 请求体读取超时例外 \{#responses-request-body-read-timeout-exception}

只有在提供方记录了**实际提交的请求**是完整重放，而非 `previous_response_id` 增量时，明确为 OpenAI Responses HTTP 408、且错误文本说明 `Timed out reading request body` 的错误 才属于特殊情况。传输层会在第一次响应后暴露这种完整重放情况。增量及未知/旧版请求形式保留普通的传输层重试行为：增量后修改历史记录可能迫使发起更大的完整重放，因此自动本地省略不能仅凭诊断信息推断安全性。在任何完整重放恢复之前，会话保留正常的重放安全否决机制和重试预算，要求已启用上下文压缩且 `compaction.methodOrder` 中包含 `shake`，然后执行一次保守的、以产物为后盾的本地 `shake elide`。单次标记的作用域是逻辑提示词序列，任何产生了输出的轮次都会清除它，因此持续取得进展的长提示词可在新增长的历史记录上恢复后续超时，而连续超时仍只会得到恰好一次更改后的请求；提示词代次仍作为取消/会话转换的边界。只有该操作重写了符合条件的历史记录时才会重试；禁用、无进展、产物保存失败、取消、重试预算耗尽或第二次出现匹配错误，都会终止轮次，不进行未更改的重放。

自动请求体超时恢复仅省略符合条件的工具结果文本。它绝不重写助手/用户文本、围栏/XML 块、推理、图像或原生 Responses 重放载荷；没有符合条件的工具结果时，会话会终止，而非再次提交不变的请求。

这不是上下文溢出或载荷拒绝处理，也不构成存在提供方字节限制或网关原因的证据。它绝不遍历已配置的上下文压缩方法，因此不会选择远程上下文压缩、handoff 或 snapcompact；普通的 408/429/5xx 重试保持不变。

## 重试分类 \{#retry-classification}

`TurnRecovery.isRetryableError(...)` 要求满足以下所有条件：

- 助手 `stopReason === "error"`
- 消息**不是**上下文溢出
- 不是用量预检阻止、特殊处理的完整重放 Responses 请求体读取超时，或拒绝修改最新助手思考内容的 Anthropic HTTP 400
- 满足以下之一：
   - 停止属于分类器拒绝（`stopDetails.type` 为 `"refusal"` 或 `"sensitive"`）
   - 错误属于可进行凭据轮换的账户级策略拒绝
   - 规范化的 `AIError` 分类允许重试（包括过期的 Responses 重放、暂时性的传输/提供方故障以及用量限制）

重试分类通过 `AIError.classifyMessage(...)` 进行，存在已持久化的 `errorId`/状态时会使用它们，并结合了解提供方的消息分类加以补充。它不只是正则策略，不过旧式/纯字符串的提供方故障仍使用文本分类。

重试还要求不存在重放不安全的输出：已提交的非空白可见文本、图像、工具调用和 Anthropic 服务端工具块通常会阻止重放。仅思考内容和仅空白的部分输出可以安全丢弃并重试。分类器拒绝使用相同的否决机制。

对于分类器拒绝、格式错误的函数响应和可重试故障，存在一个已证实未执行工具的例外：每个已发出的调用都必须有后续合成结果，且 `details.executed === false`，同时没有图像、服务端工具或已提交文本。任何真实结果或缺少证明的情况都会保留否决。恢复会保留这些助手/结果配对，以便继续执行时重新发出未执行的调用。

当前可重试类别包括：

- 暂时性传输/封装故障，包括 `message_start` 之前的 Anthropic 流封装故障
- 过载/提供方返回错误的措辞
- 速率限制/用量限制/请求过多
- 类 HTTP 服务器状态：429、500、502、503、504
- 服务不可用/服务器/内部错误
- 提供方建议重试的措辞，包括 OpenAI 的 `retry your request` 故障
- 网络/连接/socket 故障、连接被拒绝/关闭、上游连接/响应头前重置、socket 挂断、超时/已超时、fetch 失败、终止、重试延迟措辞，以及意外 socket 关闭消息
- `response.completed` 之前的上游 WebSocket 提前关闭，包括在 HTTP 200 SSE 响应内交付的网关 `stream_incomplete` 故障；终止性的 HTTP 客户端错误和重放不安全输出仍会阻止重试

规范化分类器从结构化标志/状态和了解提供方的文本模式中识别上述暂时性类别。分类器拒绝仍由单独的类型化 `stopDetails` 决策处理。

除 `isRetryableError(...)` 外，在没有用户中止、dispose 中止或流式编辑保护中止正在进行时，空的通用中止也可能进入同一个重试引擎。工具调用已有匹配结果的中断轮次，也可以安全地继续：失败的助手/工具结果序列会被保留，因此已完成的副作用不会重放。已解决的流停滞和 HTTP/2 流重置（`NGHTTP2_INTERNAL_ERROR`、`NGHTTP2_REFUSED_STREAM`、`HTTP2StreamReset`）使用相同的保留并继续路径。Cursor 空闲停滞恢复会在每个已发出的工具调用都有结果后继续；Connect 流已被空闲中止关闭。HTTP/2 RST 也是如此：流已经终止。仅文本轮次（无工具调用）在回复文本渲染后于流中途失败时，无法在不重复该文本的情况下重放，因此会保留部分轮次，并带上 developer 提醒（`stream-stall-continue.md`）继续，从停止处接着完成；启用自动重试时，每个提示词最多尝试 3 次（`TurnRecovery.handleCommittedTextStreamStall`）。

如果切换模型是恢复方式，不可重试的硬错误可以查询已配置的回退链；未成功切换时，它们不会退避并重试同一个失败模型。`retry.fallbackOn` 缩小会查询回退链的错误范围：`usage-limit` 让其他所有错误留在当前模型上（可重试错误退避并重试，直到预算耗尽；硬错误直接呈现），`except-usage-limit` 则让用量限制不进入回退链。Fireworks Fast 到基础模型的降级是内置的单次安全网，即使 `retry.enabled` 为 false 也可以运行。

无法重放已提交文本的格式错误函数故障，会保留轮次并追加纠正性的 developer 提醒，每个提示词最多继续三次。这些终止性停止后的继续执行独立于标准重试生命周期。

重试状态由 `TurnRecovery` 拥有：

- 重试尝试计数器（`0` 表示空闲）
- 重试生命周期 promise 及其 resolver
- 重试退避中止控制器

流程（`#handleRetryableError`）：

1. 读取 `retry` 设置组，禁用重试时停止（内置的单次 Fireworks Fast 到基础模型回退除外）。
2. 增加重试次数，并在第一次尝试时创建共享重试生命周期 promise。
3. 计算当前模型的重试预算是否耗尽。
4. 对错误分类、解析重试时序，并计算带上限和抖动的退避：`min(retry.baseDelayMs * 2^(attempt-1), 8000ms) * (75–100% jitter)`。过期的 OpenAI Responses 重放错误会重置提供方会话并使用延迟 `0`。
5. 对于用量限制，如果对应重置策略允许，则立即应用成功的凭据切换或已储备的 Claude/Codex 重置；否则等待提供方提示时间与下一个暂时受阻的同级凭据可用时间中较早的一个。
6. 当请求把其他模型的推理作为文本重放（`demotedReasoningBlocks > 0`），且模型目录设置了 `classifier-cot-extraction` 时，其 `reasoning_extraction` 分类器拒绝会在仍有重试预算的情况下，在任何回退链之前，以延迟 `0` 在同一模型上重试一次，并省略该推理（`omitDemotedReasoning`）。会话之后会在这类模型的主请求和侧请求中持续省略它；该决策不会保存，因此重新加载的会话会从下一次此类拒绝重新学得。如果剔除后仍被拒绝，则继续下一步。
7. 允许时查询已配置的模型回退链。`retry.fallbackOn` 决定此错误类别是否可以查询（`any`、`usage-limit`、`except-usage-limit`）。切换使用延迟 `0`；否则，分类器拒绝和账户策略拒绝仅在凭据或模型切换成功时才继续。思考循环重定向保留在同一模型上；在等待上限内暂时受阻的同级凭据优先于模型回退。
8. 当前模型重试预算耗尽时，除非模型切换或已确认的凭据重置允许继续，否则停止。回退模型获得新的重试预算；凭据恢复保留累计计数。已知的仅思考流关闭路径最多重试一次，而非使用完整配置预算。
9. 如果最终延迟超过 `retry.maxDelayMs`，且未发生凭据/模型切换，则不休眠，直接发出最终失败，但 `retry.waitForUsageReset` 显式允许的权威用量重置等待除外。
10. 记录可恢复错误，发出 `auto_retry_start`，并从活动上下文中移除失败的助手消息，除非正在保留已解决的中断工具轮次，或已证实未执行的工具调用/结果配对。
11. 进行支持中止的休眠，然后通过提示词后任务调度器，为同一提示词代次安排 `agent.continue()`。

### 哪些情况重置重试计数器 \{#what-resets-retry-counters}

以下情况会将 `#retryAttempt` 重置为 `0`：

- 重试开始后，第一条成功、无错误且未中止的助手消息（发出 `auto_retry_end { success: true }`）
- 在退避休眠期间取消重试
- 超出最大重试次数路径
- 超出最大延迟路径
- 分类器拒绝或硬错误，且未应用回退模型
- 后续错误处理结束，且没有重试或上下文压缩后的继续执行

重试链结束时，重试 promise 总会被解除并清空。

## 退避与最大尝试次数语义 \{#backoff-and-max-attempt-semantics}

设置：

- `retry.enabled`（默认 `true`）
- `retry.maxRetries`（默认 `10`）
- `retry.baseDelayMs`（默认 `500`）
- `retry.maxDelayMs`（默认 `300000`，5 分钟；`<= 0` 禁用快速失败上限）
- `retry.waitForUsageReset`（默认 `false`；允许由提供方确定时序的用量重置超过延迟上限）

尝试编号：

- 尝试计数器在最大值检查之前递增
- 开始事件使用当前尝试次数（从 1 开始）
- 超出最大值的结束事件报告 `attempt: this.#retryAttempt - 1`（最后实际尝试的重试次数）

默认设置下、抖动前的退避序列：

- 第 1 次尝试：500 ms
- 第 2 次尝试：1000 ms
- 第 3 次尝试：2000 ms
- 第 4 次尝试：4000 ms
- 第 5 次及以后：8000 ms

实际本地休眠为名义值的 75-100%，与 Anthropic 风格的重试抖动一致，避免并发会话同步重试。

延迟覆盖输入可以来自解析后的重试响应头（`retry-after-ms`、`retry-after`、`x-ratelimit-reset-ms`、`x-ratelimit-reset`）或用量限制退避。没有提供方时序时，已识别的并发/速率限制原因可以施加自己的等待窗口。凭据/模型回退切换将延迟设为 `0`；其他情况下，解析后的提示可以延长有上限的本地延迟。

如果延迟超过 `retry.maxDelayMs`，且未成功切换，重试通常立即失败。`retry.waitForUsageReset: true` 仅在时序具有权威性时（解析到的提供方重置时序，或完整用量报告中的未来重置时间）允许更长的用量限制等待，而非猜测的耗尽退避。长等待仍可中止，并会分块以避免定时器溢出；它们也会阻塞无人值守/子代理运行。

用量限制等待采用墙上时钟截止时间，因此机器睡眠时间也计入重置等待；普通退避保持单调计时。

## 中止机制 \{#abort-mechanics}

### 显式重试中止 \{#explicit-retry-abort}

`abortRetry()`：

- 中止 `#retryAbortController`（如存在）
- 解除重试 promise（`#resolveRetry()`），使等待方不再阻塞

如果在休眠时中止，catch 路径会发出：

- `auto_retry_end { success: false, finalError: "Retry cancelled" }`
- 重置尝试次数/控制器

### 与全局操作中止的交互 \{#global-operation-abort-interaction}

`abort()` 在中止活动智能体流之前调用 `abortRetry()`。这保证用户发起通用中止时，会取消重试退避。

### TUI 交互 \{#tui-interaction}

在 `auto_retry_start` 时，EventController（`#handleAutoRetryStart`）：

- 停止工作加载动画，并清空状态容器
- 渲染 `retryLoader`，文本为：`Retrying (attempt/maxAttempts) in Ns… (esc to cancel)`

`Esc` 取消根据实时会话状态派发，而非替换过的处理器：输入控制器检查 `viewSession.isRetrying` 并调用 `viewSession.abortRetry()`（同时也检查上下文压缩/handoff 中止）。

在 `auto_retry_end`（`#handleAutoRetryEnd`）时，它会停止并清除 `retryLoader` 和状态容器。

## 流传输与提示词完成行为 \{#streaming-and-prompt-completion-behavior}

`prompt()` 在 `agent.prompt(...)` 返回后，最终会等待 `#waitForPostPromptRecovery()`；该循环会一起等待重试生命周期 promise、TTSR 恢复和延后的提示词后任务。

重试生命周期 promise 属于逻辑提示词执行，但其解除并不是持久化或事件交付屏障。核心事件订阅者异步运行：即使重试 promise 已解除，成功的重试恢复仍可能正在重写已持久化的错误注释，之后才发出 `auto_retry_end`。

提示词完成后会解除监听器或释放会话的无界面调用方，应先等待会话稳定：

```ts
await session.prompt(input);
await session.waitForIdle();
unsubscribe();
await session.dispose();
```

`AgentSession.waitForIdle()` 会排空核心流传输、待处理的 advisor 卡片事件、内部会话事件处理器和延后恢复。它会重新检查稳定过程中启动的流传输和事件处理器。这使成功重试的 `auto_retry_end` 在调用方取消订阅前仍可被观察到，同时不改变重试策略，也不改变 `agent_end` 相对于 `auto_retry_end` 的顺序。

此屏障不会等待公共订阅者启动的任意异步工作。应在其完成会被会话自身等待的回调之外调用它，否则排空过程可能等待自己的调用方。屏障自身没有超时，因此宿主仍需为停滞工作设置外部截止时间。

## 控制：设置与 RPC \{#controls-settings-and-rpc}

### 配置选项 \{#configuration-knobs}

定义于 `packages/coding-agent/src/session/settings.ts`：

- `retry.enabled`
- `retry.maxRetries`
- `retry.baseDelayMs`
- `retry.maxDelayMs`
- `retry.waitForUsageReset`（默认 `false`）
- `retry.modelFallback`（默认 `true`；控制已配置的重试模型回退切换）
- `retry.fallbackOn`（默认 `"any"`；`"usage-limit"` 或 `"except-usage-limit"` 限制哪些错误遍历回退链）
- `retry.rateLimitWalksChain`（默认 `false`；`true` 会在速率限制导致轮次失败时立即遍历回退链，包括已产生签名思考内容之后，而非在整个重试预算期间保留失败模型）
- `retry.fallbackChains`
- `retry.fallbackRevertPolicy`（默认 `"cooldown-expiry"`；`"never"` 禁用自动恢复）
- `retry.usageAwareFallback`（默认 `false`；对受支持的编码套餐用量报告运行预检）
- `retry.usageReservePct`（默认 `10`；剩余配额预留阈值）
- `retry.usageReservePolicy`（默认 `"confirm"`；也支持 `"auto"` 和 `"fail-closed"`）

会话中的程序化开关：

- `setAutoRetryEnabled(enabled, persist = false)` 应用会话作用域的 `retry.enabled` 覆盖；将第二个参数传为 `true` 可写入全局设置
- `autoRetryEnabled` 读取 `retry.enabled`
- `isRetrying` 报告重试生命周期 promise 是否活动

### RPC 控制 \{#rpc-controls}

RPC 命令接口：

- `set_auto_retry` → `session.setAutoRetryEnabled(command.enabled)`
- `abort_retry` → `session.abortRetry()`

客户端辅助方法：

- `RpcClient.setAutoRetry(enabled)`
- `RpcClient.abortRetry()`

## 事件发出与失败呈现 \{#event-emission-and-failure-surfacing}

会话级重试事件：

- `auto_retry_start { attempt, maxAttempts, delayMs, errorMessage, errorId? }`
- `auto_retry_end { success, attempt, finalError?, retryErrors? }`
- `retry_fallback_applied { from, to, role, reason? }`
- `retry_fallback_succeeded { model, role }`

`from`、`to` 和 `role` 保留现有选择器语义。
可选的 `reason` 使用触发时的健康状况快照
或提供方错误来解释决策。TUI 会在
来源到目标的警告下显示经过净化且长度受限的预览；扩展和 RPC 接收完整原因。
用量预检通知区分不符合套餐资格的账户、已耗尽或
受阻的账户，以及配置的预留阈值。它们会在可用时包含
距离报告中最早的未来重置时间还有多久，
并说明本次尝试未向来源模型发送请求。
启动时的配额跳过在 `modelFallbackMessage` 中使用相同说明。
请求失败通知包含提供方错误，而非暗示发生了
预检跳过。由智能体循环自行结束的轮次（例如，
模型持续未满足软性工具要求后）显示 `Turn stopped: …`，而非
`Request failed: …`，因为并没有请求失败。每次切换还会在
回退的 `model_change` 条目上记录原因（参见 `docs/session.md`）。

成功时，`auto_retry_end` 还会携带新增的 `retryErrors`：重试链留下的每个已持久化错误条目各对应一个 `RetryErrorUpdate`（`entryId`、`persistenceKey?`、`note`、`retryRecovery`），记录恢复方式（`recovery`：`plain`/`wait`/`credential`/`model`，以及便于阅读的 `note`，例如 `rate-limited; switched account; retried`），并记录哪条成功消息取代了各个错误（`supersededBy`，含 timestamp/provider/model/responseId）。扩展和 RPC 使用方收到相同字段。

传播方式：

- 通过 `AgentSession.subscribe(...)` 发出
- 作为扩展事件转发给扩展运行器
- 在 RPC 模式下，直接作为 JSON 事件对象转发（`session.subscribe(event => output(event))`）
- 在 TUI 中，由 `EventController` 消费用于加载动画/错误 UI

最终失败呈现：

- 超出最大次数、最大延迟失败或取消时，`auto_retry_end.success === false`
- TUI 显示：`Retry failed after N attempts: <finalError>`
- 扩展/钩子接收字段相同的 `auto_retry_end`
- RPC 使用方在 stdout 流上接收相同事件对象

## 永久停止条件 \{#permanent-stop-conditions}

出现以下任一情况时，重试停止，且不会自动继续：

- `retry.enabled` 为 false（内置的 Fireworks Fast 到基础模型降级和独立的终止性停止处理除外）
- 错误不属于可重试分类，且没有符合条件的硬错误模型切换成功
- 错误是上下文溢出（交给上下文压缩路径）
- 超出最大重试次数，且没有可用回退模型
- 提供方要求的延迟超过 `retry.maxDelayMs`，没有可用凭据/模型切换，且不适用权威用量重置的选择启用策略
- 用户取消重试（`abort_retry` 或重试加载动画期间按 `Esc`）
- 全局中止（`abort`）先取消重试

计数器重置后，未来出现可重试错误时，仍可以启动新的重试链。

## 运行注意事项 \{#operational-caveats}

- 分类使用规范化的 `AIError` 标志/状态以及了解提供方的文本回退；并非仅限于结构化错误，也并非仅限于正则匹配。
- 重试会在重新继续前从**运行时上下文**中剔除失败的助手错误，但会话历史记录仍保留该错误条目。重试链最终成功时，链中的每个已持久化错误条目都会带上 `retryRecovery` 标记（`status: "recovered"`，以及类型/尝试次数/注释和取代它的消息；错误已失去意义的条目则带有 `status: "superseded"`）。终端会话记录和会话树显示一条暗色注释，并附错误预览。对于模型回退，它指明成功请求的提供方/模型路由，而非该提供方选择的上游模型。此显示既适用于实时状态（通过成功事件的 `retryErrors`），也适用于重新打开会话后。这些错误条目仍不纳入重建的 LLM 上下文。
- `RpcSessionState` 当前提供 `autoCompactionEnabled`，但不提供 `autoRetryEnabled` 字段；RPC 调用方必须自行跟踪开关状态，或通过其他 API 查询设置。
- 模型回退更改会追加临时 `model_change` 条目，并可能在主模型冷却期结束后恢复它，具体取决于 `retry.fallbackRevertPolicy`。
- 如果最新助手轮次携带来自其他模型的签名或已脱敏思考内容，且接下来还会在签名模型上再尝试一次，则跳过同一提供方的 Anthropic 回退候选模型；分类器拒绝、账户策略拒绝、不可重试错误、等待超过 `retry.maxDelayMs`、重试预算耗尽，或（仅在 `retry.rateLimitWalksChain` 为 `true` 时）签名模型上的速率限制，都会使流程转到该候选模型，Anthropic 会丢弃新模型无法读取的早期思考块。例外情况是：用量限制等待超过 `retry.maxDelayMs`，但权威用量重置的选择启用策略（`retry.waitForUsageReset`）会等待其结束，此时重置后会重试签名模型，因此仍跳过候选模型。在分类器拒绝的回退额度仍可使用时，仅允许该额度的目标模型通过。
- 启用 `retry.usageAwareFallback` 时，用量感知预检在提供方请求之前运行。它优先选择同一提供方的健康编码套餐账户，其次才是已配置的模型回退；普通配置的 API key 被排除。未知/未映射的用量按开放方式放行。`retry.modelFallback` 控制模型切换，而不控制预检的账户选择或 `"fail-closed"` 策略。在预留阈值处，`"confirm"` 会询问交互式会话，拒绝时保留当前模型；没有确认 UI 的会话会自动应用符合条件的回退。`"auto"` 无须询问就应用符合条件的回退。`"fail-closed"` 会拒绝使用预留或已耗尽的用量，而非消耗它或选择回退。其他策略下，用量耗尽会直接应用符合条件的回退，无须预留确认。
- 活动模型没有可用凭据时，提示词会先遍历 `retry.fallbackChains`（受 `retry.modelFallback` 控制），然后才以 `No API key found` 失败。该切换不会固定，因此凭据恢复后，`cooldown-expiry` 会恢复主模型。
