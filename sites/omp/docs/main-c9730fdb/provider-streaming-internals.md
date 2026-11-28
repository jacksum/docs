---
title: "模型提供方流式处理内部机制"
description: "Oh My Pi 官方仓库文档：模型提供方流式处理内部机制。"
---

# 模型提供方流式处理内部机制 \{#provider-streaming-internals}

本文说明 token/工具流式处理如何在 `@oh-my-pi/pi-ai` 中归一化，然后经由 `@oh-my-pi/pi-agent-core` 和 `coding-agent` 会话事件传播。

## 端到端流程 \{#end-to-end-flow}

1. `streamSimple()`（`packages/ai/src/stream.ts`）解析凭据、映射通用选项，并分派到模型提供方的流函数。内置模型提供方使用 `packages/ai/src/providers/register-builtins.ts` 中立即导入的适配器；路由包装器和扩展注册的 API 各有自己的分派路径。共享分派还会应用模型提供方在途请求限制、泄漏思考内容修复及思考循环防护。
2. 模型提供方流函数将模型提供方原生流事件转换为统一的 `AssistantMessageEvent` 序列。内置实现包括 Anthropic、OpenAI Responses/Completions/Codex/Azure Responses、Google Gemini/Vertex、Bedrock Converse、Ollama、Cursor、Devin、Apple Foundation Models 和 pi-native 网关传输，以及 GitLab Duo、GitLab Duo Workflow、Kimi 和 Synthetic 包装器。xAI Grok 使用共享的 OpenAI Responses 路径，并应用目录级兼容性。OpenRouter 默认使用 Responses；`PI_OPENROUTER_RESPONSES=0` 选择 Chat Completions。
3. 各模型提供方将事件推送到 `AssistantMessageEventStream`（`packages/ai/src/utils/event-stream.ts`），它提供：
   - 用于增量更新的异步迭代
   - 用于获取最终 `AssistantMessage` 的 `result()`
4. 在模型提供方不自行负责的情况下，内置转发包装器提供看门狗。Anthropic 和 OpenAI 系列自行负责首事件及空闲处理；合成的 `start` 事件不算首次进展。模型提供方可使用 `trackLocalWork()` 标记服务端请求的本地工作（并用 `forwardLocalWorkFrom()` 转发该状态），使其不会被视为停滞。
5. `agentLoop`（`packages/agent/src/agent-loop.ts`）消费这些事件，更新进行中的助手状态，并发出 `message_update` 事件，携带助手事件和消息的只读快照。未结束的块会增量复制；已完成的块在快照之间共享。
6. `AgentSession`（`packages/coding-agent/src/session/agent-session.ts`）订阅智能体事件、持久保存消息、驱动扩展钩子，并应用会话行为（重试、上下文压缩、TTSR、流式编辑中止检查）。

## `@oh-my-pi/pi-ai` 中的统一流契约 \{#unified-stream-contract-in-oh-my-pipi-ai}

所有模型提供方都发出相同的结构（`packages/ai/src/types.ts` 中的 `AssistantMessageEvent`）：

- `start`
- 内容块生命周期三元组：
   - 文本：`text_start` → `text_delta`\* → `text_end`
   - 思考：`thinking_start` → `thinking_delta`\* → `thinking_end`
   - 工具调用：`toolcall_start` → `toolcall_delta`\* → `toolcall_end`
- 完整图像块：`image_end`
- 终结事件：
   - `done`，带有 `reason: "stop" | "length" | "toolUse"`
   - 或 `error`，带有 `reason: "aborted" | "error"`

`AssistantMessageEventStream` 保证：

- `done` 或 `error` 事件将 `result()` 兑现为该事件的最终助手消息
- `fail(error)` 则会拒绝迭代和 `result()`；没有最终结果时调用 `end()` 会拒绝 `result()`，而不是让它一直等待
- 事件按推送顺序立即交付给消费者（不批处理或合并）

## 增量节流行为 \{#delta-throttling-behavior}

`AssistantMessageEventStream` 不会节流或合并增量事件，每个模型提供方事件都按推送时的形式交付。工具调用参数解析使用 `parseStreamingJsonThrottled()`（`packages/utils/src/json-parse.ts`）：解析第一个非空缓冲区后，重新解析要求缓冲区增长 `max(STREAMING_JSON_PARSE_MIN_GROWTH, buffer.length >> 5)`，默认下限为 256 个字符串代码单元。几何增长门限可避免对大型参数按固定节奏反复解析整个缓冲区。工具调用边界处的最终解析是无条件的，并具有最终决定权。

不存在模型提供方背压：模型提供方仍全速产生事件，而本地流进行排队。

## 模型提供方归一化细节 \{#provider-normalization-details}

## Anthropic（`anthropic-messages`） \{#anthropic-anthropic-messages}

来源：`packages/ai/src/providers/anthropic.ts`

归一化要点：

- `message_start` 初始化用量（输入/输出/缓存 token）
- `content_block_start` 映射为文本/思考/工具调用开始事件
- `content_block_delta` 的映射：
   - `text_delta` → `text_delta`
   - `thinking_delta` → `thinking_delta`
   - `input_json_delta` → `toolcall_delta`
   - `signature_delta` 只更新 `thinkingSignature`（无事件）
- `content_block_stop` 发出对应的 `*_end`
- `message_delta.stop_reason` 通过 `mapStopReason()` 映射
- 带签名的 `compaction` 块只有在终结停止原因确认上下文压缩时，才保留在 `providerPayload` 中；不会为其合成普通文本/思考增量

工具调用参数流式处理：

- 每个工具块携带一个以 symbol 为键的 `kStreamingPartialJson` 缓冲区
- 每个 JSON 增量都追加到该缓冲区
- 追加增量时，通过 `parseStreamingJsonThrottled()` 重新解析 `arguments`（先解析第一个缓冲区，随后使用几何增长门限）
- `toolcall_end` 再次解析，然后移除内部流式状态

## OpenAI Chat Completions（`openai-completions`） \{#openai-chat-completions-openai-completions}

来源：`packages/ai/src/providers/openai-completions.ts`

- 可见内容增量变为文本块；推理字段变为思考块。
- 工具调用增量与流式调用索引/ID 关联。字符串参数片段累积，并使用节流 JSON 解析；值为对象的参数快照（MiniMax）则直接合并。
- 最终工具调用参数在块边界处解析。结构化调用会将无异常的 `"stop"` 结束提升为工具使用。
- 兼容性控制累积推理、泄漏模板 token 剥离、标记修复，以及内容为空且因长度限制结束时的上下文错误情形。
- 首事件/空闲处理和可安全重放的重试位于此模型提供方中，而不是共享转发器中。

## OpenAI Responses 系列（`openai-responses`、`openai-codex-responses`、`azure-openai-responses`） \{#openai-responses-family-openai-responses-openai-codex-responses-azure-openai-responses}

来源：`packages/ai/src/providers/openai-responses.ts`、`openai-codex-responses.ts` 和 `azure-openai-responses.ts`

归一化要点：

- `response.output_item.added` 开始推理/文本/函数调用/自定义工具块
- 推理摘要事件（`response.reasoning_summary_text.delta`）和原始推理事件（`response.reasoning_text.delta`）变为 `thinking_delta`
- 输出/拒绝增量变为 `text_delta`
- `response.function_call_arguments.delta` 和 `response.custom_tool_call_input.delta` 变为 `toolcall_delta`
- `response.output_item.done` 发出 `thinking_end` / `text_end` / `toolcall_end`
- `response.completed`、`response.incomplete` 和旧版 `response.done` 完成状态和用量记录，随后即使传输仍然打开也会停止读取
- `response.failed` / `error` 事件抛出异常，进入终结 `error` 路径；`incomplete_details.reason: "content_filter"` 是错误，而不是长度限制
- 原生计算机调用变为完整的工具调用块；已完成的图像生成项发出 `image_end`

工具调用参数流式处理：

- 函数调用 JSON 参数采用与 Anthropic 相同的以 symbol 为键的累积模式
- 自定义工具以流形式传输原始字符串输入，并将最终参数暴露为 `{ input: <raw> }`
- 只发送 `response.function_call_arguments.done` 的模型提供方仍会填充最终参数
- 工具调用 ID 归一化为 `"<call_id>|<item_id>"`

### 标准 Responses 传输职责 \{#standard-responses-transport-ownership}

面向用户的契约位于[标准 Responses WebSockets](./models.md#standard-responses-websockets)。`settings-stream-fn.ts` 在应用边界处适配独立的 API 设置；`resolveResponsesWebSocketPreference` 在标准模型提供方中应用最终目录能力和模型/请求否决条件，不依赖 Settings。

`providers/responses-websocket-connection.ts` 包含从 Codex 提取的单一物理通道实现。`ResponsesWebSocketConnection` 负责连接完成处理、套接字健康状态、有界队列、单个读取器、帧/序列防护、可选心跳、取消及类型化传输错误。`utils/websocket.ts` 继续负责共享 URL/请求头工具。`providers/openai-responses-session.ts` 负责标准 `response.create` 交换、套接字本地基线、租约和逻辑传输状态。`openai-codex-responses.ts` 组合使用相同通道，同时保留 Codex 的引导/控制帧、后继接收/附加、Lite 整形、旧版错误转换和恢复。共享通道不会将标准回退策略应用于 Codex，也不会改变其计时器/环境控制项。

每个标准租约允许一个活动交换。同一作用域的并发请求会获得一个独立的临时套接字，而不是占用中连接的读取器或基线。复用要求通道处于打开状态、近期有入站活动，且未超过 30 秒的空闲复用限制。标准通道使用 4096 的队列容量，不使用心跳。成功完成后正常关闭或因健康原因退役的套接字，会被带有完整输入且不含前一个套接字锚点的新 WS 连接替代；此替换不属于 SSE 降级。

#### 请求准备和生命周期 \{#request-preparation-and-lifetime}

`prepareRequest` 在套接字连接前构建每个候选请求并执行钩子。发送前 HTTP 回退通过同一准备路径重新构建；严格工具修正也复用该路径。物理握手回调仅对新连接的通道运行，而不是对保留套接字上的每次交换运行。

`timeResponsesStream` 负责标准流的截止时间。HTTP 保留其请求头看门狗和现有首事件语义；WS 在有界参数修正之间保留同一个首事件时间预算。预热向这些修正暴露明确的首帧拒绝；它不是第二个超时负责方。连接保留其独立的有界截止时间，而 Codex 保留自己的通道截止时间。

逻辑条目独立于保留连接统计活动租约。空闲退役或释放仅在条目没有连接、没有活动租约、没有粘性降级，也没有待处理失败计数（发送前连接失败、过时锚点拒绝或续接被禁用）时移除它。此类条目会一直保留，直到其现有会话/模型提供方所有者释放，因此临时的同级连接不能抹去后续的网络降级，也不能改变未完成租约的身份。

### OpenRouter 原生结束原因 \{#openrouter-native-finish-reasons}

Chat Completions 和 Responses 将显式 `native_finish_reason` 值 `MALFORMED_RESPONSE`、`MALFORMED_FUNCTION_CALL`、`UNEXPECTED_TOOL_CALL` 和 `network_error` 视为模型提供方错误，不论归一化后是否成功结束。用量和响应 ID 会保留，先前的工具调用片段也无法将失败轮次提升为 `toolUse`。未知原生原因保持向前兼容。

OpenRouter 默认使用 Responses，其转换可能省略原生原因。对于没有内容块、原生输出项或进展标记的终结 `stop`，Responses 适配器会在每次尝试中，针对配置的基础 URL 尽力执行一次 `GET /generation?id=...`。它复用请求身份验证、自定义 fetch 实现和取消机制，截止时间为两秒。匹配的生成元数据若包含已识别的失败，会改变结果。对于零输出项且存在非推理输出用量的轮次，元数据 `404` 会触发明确标为**推断**的 `MALFORMED_RESPONSE` 恢复，而不是已确认的原生原因。其他 HTTP 失败、传输/JSON 错误、仅推理用量，以及未知或不匹配的元数据，都会保留现有的空停止恢复行为。可见输出、带签名的推理和模型提供方托管工具进展不会触发此查询。终结的格式错误 Responses 会绕过适配器级重放，使智能体可在重试前添加纠正提醒。瞬态网络错误保留适配器级重试；现有智能体重试预算仍然适用，重试可能发起新的计费生成。

模型提供方报告的输出计数可能包含推理和失败的结构化生成。在没有显式失败原因时，仅凭用量既不能认定发生了内容过滤，也不能认定可交付输出已经生成后被丢弃。

## Google Generative AI（`google-generative-ai`） \{#google-generative-ai-google-generative-ai}

来源：`packages/ai/src/providers/google.ts`（轻量请求包装器）和 `google-shared.ts`（`streamGoogleGenAI`，共享的数据块到内容块转换）

归一化要点：

- 迭代 `candidate.content.parts`
- 通过 `isThinkingPart(part)` 将文本部分区分为思考或文本（`thought === true`；仅有签名不算思考标记）
- 思考签名保留在其原始文本/思考/工具调用块上，以供重放
- 块转换会在开始新块前关闭前一个块
- `part.functionCall` 被视为完整工具调用（立即发出开始/增量/结束事件）
- 结束原因由 `google-shared.ts` 中的 `mapStopReason()` 映射

工具调用参数流式处理：

- 函数调用参数以结构化对象形式到达，而不是增量 JSON 文本
- 实现会发出一个合成的 `toolcall_delta`，包含 `JSON.stringify(arguments)`
- 在此路径中，Google 不需要部分 JSON 解析器

## 部分工具调用 JSON 的累积和恢复 \{#partial-tool-call-json-accumulation-and-recovery}

共享行为使用 `parseStreamingJson()` / `parseStreamingJsonThrottled()`（`packages/utils/src/json-parse.ts`）：

1. 尝试 `JSON.parse`
2. 对于不完整片段，回退到内部实现的 `RelaxedJson` 解析器（宽松/修复型）
3. 如果两者都失败，返回 `{}`

由此带来的影响：

- 格式错误或截断的参数增量不会立即使流处理崩溃
- 进行中的 `arguments` 可能暂时为 `{}`
- 随着缓冲区增长，后续有效增量可以恢复结构化参数；流中重新解析使用几何增长门限
- 最终的 `toolcall_end` 会在发出前再尝试解析一次

## 停止原因与传输/运行时错误 \{#stop-reasons-vs-transportruntime-errors}

模型提供方停止原因映射为归一化的 `stopReason`：

- Anthropic：`end_turn`/`stop_sequence`/`pause_turn`/`compaction`→`stop`，`max_tokens`/`model_context_window_exceeded`→`length`，`tool_use`→`toolUse`，`refusal`/`sensitive`→`error`；未知原因会记录日志并视为 `stop`
- OpenAI Responses：`completed`→`stop`，`incomplete`→`length`，但内容过滤→`error`，`failed/cancelled`→`error`；已完成的工具调用可以将无异常的结束提升为 `toolUse`
- Google：`STOP`→`stop`，`MAX_TOKENS`→`length`，安全/禁止/格式错误函数调用类别→`error`；工具调用只会将无异常的停止/长度结束提升为 `toolUse`

错误语义分为两个阶段：

1. **模型完成语义**（模型提供方报告的结束原因/状态）
2. **传输/运行时失败**（网络/客户端/解析器/中止异常）

如果模型提供方流抛出异常或发出失败信号，各模型提供方包装器会捕获并发出终结 `error` 事件，带有：

- 调用方取消时为 `stopReason = "aborted"`
- 否则为 `stopReason = "error"`
- 模型提供方错误通常经过 `finalizeErrorMessage(error, rawRequestDump)`（`packages/ai/src/utils/http-inspector.ts`），它会格式化重试等待信息和捕获的 HTTP/请求诊断；共享包装器失败则使用所抛出错误的消息
- 看门狗触发的本地中止仍为 `"error"`，不会被误标为调用方取消

## 格式错误的数据块/SSE 解析失败行为 \{#malformed-chunk--sse-parse-failure-behavior}

OpenAI Completions/Responses 路径使用仓库内的 HTTP+SSE 传输 `postOpenAIStream()`（`packages/ai/src/utils/openai-http.ts`），通过 `readSseJson()` 解码帧，替代了 `openai` SDK 客户端。Anthropic 使用仓库内的 `AnthropicMessagesClient`（`packages/ai/src/providers/anthropic-client.ts`）；Google 路径和 Codex SSE 回退直接通过 `readSseJson()` 读取 SSE，websocket Codex 帧则经由同一个事件处理器归一化。

当前实现中观察到的行为：

- 格式错误的 SSE 帧结构或数据块 JSON 会表现为异常或流 `error` 事件
- 格式错误的 Codex SSE JSON/帧结构会从本地 SSE 读取器抛出异常
- 模型提供方不会从单个格式错误的数据块恢复。根据模型提供方以及是否已发出无法安全重放的输出，模型提供方自行负责的有界请求重试，可能会针对瞬态传输失败或格式错误的封装重新发起一次尝试。
- 模型提供方自行负责的恢复包括有界的空完成重试，以及能力回退，例如在去掉被拒绝的严格工具字段后重试；Azure 还有一次可安全重放的瞬态模型提供方错误重试
- Codex 只有在尚未发出无法安全重放的输出之前，才能从 websocket 回退到 SSE
- `AgentSession` 单独处理消息级自动重试；它不会从失败的数据块重放流

## 取消边界 \{#cancellation-boundaries}

取消分层处理：

- AI 模型提供方请求：`options.signal` 传入模型提供方客户端的流调用。
- 模型提供方包装器：流循环结束后，已中止的信号会强制进入错误路径（`"Request was aborted"`）。
- 智能体循环：处理每个模型提供方事件之前检查 `signal.aborted`，并可根据最新部分结果合成已中止的助手消息。
- 会话/智能体控制：`AgentSession.abort()` -> `agent.abort()` -> 共享中止控制器取消。

工具执行取消与模型流取消分开处理：

- 可中断的等待类工具观察组合后的外部/引导/IRC 中止信号
- 有副作用的前台工具只观察外部中止信号；引导和 IRC 通过协作式 `steeringSignal` 到达这些工具，而不是硬终止
- 排队中的中断在执行边界注入，同时保留已完成的工具结果

## 看门狗配置 \{#watchdog-configuration}

`packages/ai/src/utils/idle-iterator.ts` 将首事件和空闲预算都默认为 300,000 毫秒。调用方的 `streamFirstEventTimeoutMs` / `streamIdleTimeoutMs` 选项优先于环境变量值；`0` 禁用对应看门狗。通用传输使用 `PI_STREAM_IDLE_TIMEOUT_MS`（其次是旧版 OpenAI 别名）和 `PI_STREAM_FIRST_EVENT_TIMEOUT_MS`。OpenAI 系列传输优先使用 `PI_OPENAI_STREAM_IDLE_TIMEOUT_MS` 和 `PI_OPENAI_STREAM_FIRST_EVENT_TIMEOUT_MS`。没有 OpenAI 专用首事件覆盖项时，其首事件预算以解析后的空闲预算为下限。目录兼容性可提供模型提供方/模型回退值，包括本地后端上无界的首事件等待。

HTTP 尝试结束后，响应前计时器即被清除；它不是对正在流式传输的响应体设置的绝对截止时间。重试会启动新的计时器。

## 背压边界 \{#backpressure-boundaries}

模型提供方传输与下游消费者之间没有硬性背压机制：

- `EventStream` 使用没有最大大小限制的内存队列
- 节流的部分 JSON 重新解析会降低每个增量的 CPU 成本，但不会减慢模型提供方事件的接收
- 如果消费者明显落后，排队的事件可能持续增长，直到完成

当前设计更重视响应性和简单的顺序保证，而不是有界缓冲区流量控制。

## 流事件如何呈现为智能体/会话事件 \{#how-stream-events-surface-as-agentsession-events}

`agentLoop.streamAssistantResponse()` 将 `AssistantMessageEvent` 桥接到 `AgentEvent`：

- 收到 `start` 时：推入占位助手消息，并发出 `message_start`
- 收到块事件（`text_*`、`thinking_*`、`image_end`、`toolcall_*`）时：更新最后一条助手消息，并发出带有只读事件/消息快照的 `message_update`；消费者不得修改共享的已完成块
- 收到终结事件（`done`/`error`）时：从 `response.result()` 解析最终消息，发出 `message_end`

随后 `AgentSession` 消费这些事件以实现会话级行为：

- TTSR 监视 `message_update.assistantMessageEvent` 中的 `text_delta`、`thinking_delta` 和 `toolcall_delta`，并在 `text_end`、`thinking_end` 和 `toolcall_end` 时对整个缓冲区执行最终检查
- 工具参数流消费 `toolcall_*` 事件并发出 `tool_stream_update`；当 `edit` 最终预览（`streaming: false`）存在真实文件错误时，流式编辑防护会中止，而无变更诊断不会触发中止
- 持久化在 `message_end` 时写入已完成消息
- 自动重试通过结构化 `errorId` / AI 错误谓词对助手失败分类，以消息分类作为回退

## 统一职责与模型提供方专属职责 \{#unified-vs-provider-specific-responsibilities}

统一职责（公共契约）：

- 事件结构（`AssistantMessageEvent`）
- 最终结果提取（`done`/`error`）
- 立即按顺序交付事件
- 智能体/会话事件传播模型

模型提供方专属职责（未完全抽象）：

- 上游事件分类体系和映射逻辑
- 停止原因转换表
- 工具调用 ID 约定
- 推理/思考块语义和签名
- 用量 token 语义和可用时机
- 各 API 的消息转换约束

## 实现文件 \{#implementation-files}

- [`packages/ai/src/stream.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/stream.ts)：模型提供方分派、选项映射、凭据/会话衔接及自定义 API 分派。
- [`packages/ai/src/utils/event-stream.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/utils/event-stream.ts)：流队列和最终结果解析。
- [`packages/utils/src/json-parse.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/utils/src/json-parse.ts)：流式工具参数的部分 JSON 解析。
- [`packages/ai/src/providers/anthropic.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/anthropic.ts)：Anthropic 事件转换和工具 JSON 累积。
- [`packages/ai/src/providers/openai-shared.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/openai-shared.ts)：共享的 Responses 事件转换；[`openai-responses.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/openai-responses.ts)、[`openai-codex-responses.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/openai-codex-responses.ts) 和 [`azure-openai-responses.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/azure-openai-responses.ts)：传输/请求变体。
- [`packages/ai/src/providers/google-shared.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/google-shared.ts)：共享的 Gemini 转换和事件转换；[`google.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/google.ts) 和 [`google-vertex.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/google-vertex.ts)：请求/传输变体。
- [`amazon-bedrock.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/amazon-bedrock.ts)、[`openai-completions.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/openai-completions.ts)、[`ollama.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/ollama.ts)、[`cursor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/cursor.ts)、[`apple-foundation-models.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/apple-foundation-models.ts) 和 [`pi-native-client.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/pi-native-client.ts)：其他流适配器。
- [`packages/ai/src/providers/register-builtins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/register-builtins.ts) 和 [`packages/ai/src/utils/idle-iterator.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/utils/idle-iterator.ts)：内置转发、共享的首次进展/空闲看门狗，以及感知本地工作的停滞处理。
- [`packages/agent/src/agent-loop.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/agent-loop.ts)：模型提供方流消费和 `message_update` 快照。
- [`packages/coding-agent/src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)、[`stream-guards.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/stream-guards.ts) 和 [`ttsr-coordinator.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/ttsr-coordinator.ts)：会话更新、防护、中止和持久化。
