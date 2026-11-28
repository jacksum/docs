---
title: "模型提供方特性：特殊处理、流、认证与目录处理"
description: "Oh My Pi 官方仓库文档：模型提供方特性：特殊处理、流、认证与目录处理。"
---

# 模型提供方特性：特殊处理、流、认证与目录处理 \{#provider-quirks-special-casings-streams-auth-and-catalog-handling}

逐个深入介绍 `packages/ai` 传输中的模型提供方：各模型提供方在共享流水线之外有哪些特殊处理，
其流与普通 SSE/delta 模型有何不同，如何进行
认证和跟踪用量/配额，以及 `packages/catalog` 对其
模型做了哪些特殊处理（描述符、发现、身份、思考元数据、定价）。

相关参考：

- [模型提供方兼容性参考](./provider-compat-reference.md)：兼容性标志、推理级别、工具处理、强制工具选择
- [模型提供方端点约束](./provider-endpoint-constraints.md)：新约束应放在哪里
- [模型提供方流式处理内部机制](./provider-streaming-internals.md)：流事件规范化
- [模型提供方](./providers.md)：可用性、凭据、登录流程

目录条目编写于 `packages/catalog/src/compat/rules/providers/*.kdl`，通过 `packages/catalog/src/compat/providers.ts` 中的 `providerEntries()` / `providerEntry()` 暴露。`packages/catalog/src/provider-models/descriptors.ts` 包含运行时模型管理器工厂，并且只为有工厂的模型提供方构建 `PROVIDER_DESCRIPTORS`；它不是目录条目的来源。认证/登录/刷新策略另行编写于 `rules/auth/*.kdl`。

`packages/catalog/src/compat/taxonomy.ts` 中的 `classifyModel` 根据编译后的分类规则解析类别、系列和修订版本。`packages/catalog/src/compat/resolve.ts` 中的 `resolveModelPolicy` 将 API 默认值、主机事实、KDL 级联和显式规格覆盖合并，然后固化兼容性与思考元数据。`packages/catalog/src/model-thinking.ts` 在运行时读取该元数据，而不是重新对 ID 分类。经过审查的推理强度系列归并与别名使用 `packages/catalog/src/compat/collapse.ts` 中的 `reviewedCollapseTable`，由 `rules/taxonomy/_collapse.kdl` 提供支持。

## OpenAI Chat Completions \{#openai-chat-completions}

OpenAI Chat Completions 模型提供方针对标准 OpenAI `/chat/completions` 传输契约（`ChatCompletionCreateParamsStreaming` 请求模式和 `ChatCompletionChunk` 事件载荷），实现通过服务器发送事件（SSE）传输的 HTTP POST JSON 请求体流。它是 OpenAI 模型以及数十种 OpenAI 兼容网关和第三方模型提供方的主要传输方式，包括 Groq、Cerebras、Mistral、DeepSeek、Fireworks、Zhipu（Z.AI）、Qwen（DashScope）、Kimi（Moonshot）、Synthetic、GitLab Duo、OpenRouter、Vercel AI Gateway、CoreWeave、HuggingFace、Nvidia NIM、Novita、GMI Cloud、Baseten、NanoGPT 和 Sakana/Fugu。该传输的实现分布于 `packages/ai/src/providers/openai-completions.ts`（主流式运行器 `streamOpenAICompletions`）、`packages/ai/src/providers/openai-chat-wire.ts`（随项目保存的传输类型）、`packages/ai/src/providers/openai-shared.ts`（共享请求/策略/用量辅助函数）、`packages/ai/src/providers/openai-reasoning-fallback.ts`（400 推理强度恢复）、`packages/ai/src/utils/openai-http.ts`（HTTP SSE 客户端 `postOpenAIStream`）和 `packages/ai/src/utils/empty-completion-retry.ts`（`withReplaySafeStreamRetry` 包装器）。

### 特殊处理 \{#special-casings}

- **Azure 部署名称映射**：`packages/ai/src/providers/openai-shared.ts` 中的 `parseAzureDeploymentNameMap` 在 `createRequestSetup`（`packages/ai/src/providers/openai-completions.ts`）中解析 `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 环境变量（以逗号分隔的 `modelId=deploymentName` 对），将模型 ID 转换为 Azure 部署名称，未映射时默认为 `model.id`。
- **网关路由与变体转换**：`packages/ai/src/providers/openai-shared.ts` 中的 `applyOpenAIGatewayRouting` 注入 OpenRouter 模型提供方路由偏好（`params.provider`）。`applyOpenRouterRoutingVariant` 和 `applyWireModelIdTransform` 追加 OpenRouter 模型变体后缀（`:nitro`、`:floor`、`:online`、`:extended`）。`resolveSakanaRequestBaseUrl` 处理 Sakana/Fugu 基础 URL 覆盖（`SAKANA_BASE_URL` / `FUGU_BASE_URL`），`applyCoreWeaveProjectHeader` 注入 CoreWeave 项目标头。
- **空补全重试**：`streamOpenAICompletions` 由 `withReplaySafeStreamRetry`（`packages/ai/src/utils/empty-completion-retry.ts`）包装。如果一次尝试以 `finish_reason: "stop"` 正常结束，却没有输出可见的助手内容（`hasVisibleAssistantContent` 检查文本、思考、图像或工具调用）且输出 token 数 <= 1，该包装器会重试请求，最多重试 `MAX_EMPTY_COMPLETION_RETRIES` 次（2 次重试，指数退避，`EMPTY_COMPLETION_BASE_DELAY_MS` = 500ms）。包装器缓冲输出前的事件，使被丢弃的尝试永不重放；此外，在配置 `retryProviderErrors: true`、`maxProviderErrorRetries: 1` 时，也会在提交任何输出之前重试暂时性的模型提供方错误。
- **推理强度 400 回退**：`resolveOpenAIReasoningEffortFallback` 和 `applyOpenAIReasoningEffortFallback`（`packages/ai/src/providers/openai-reasoning-fallback.ts`）拦截由不受支持的 `reasoning_effort` 值引起的 400/422 HTTP 错误响应。它从错误消息中解析允许的级别（或解析出最接近的受支持级别/null），在模型提供方会话状态（`getOpenAICompletionsProviderSessionState`）中，按端点/模型键（`createOpenAIReasoningEffortFallbackKey`、`rememberOpenAIReasoningEffortFallback`）记住回退值，并透明地重试请求，不让该轮失败。
- **结束原因提升**：在 `streamOpenAICompletionsOnce`（`packages/ai/src/providers/openai-completions.ts`）中，如果后端报告 `finish_reason: "stop"`，但该轮产生了结构化 `toolCall` 块，或通过 `StreamMarkupHealing` 修复出了工具调用，则会将 `output.stopReason` 从 `"stop"` 提升为 `"toolUse"`，使智能体执行循环正确调用工具处理器。
- **Mistral 工具 ID 规范化**：`packages/ai/src/providers/openai-completions.ts` 中的 `normalizeMistralToolId` 将 Mistral 模型的工具调用 ID 限制为恰好 9 个字母数字字符（用确定性字符 `"ABCDEFGHI"` 补齐或截断）。
- **MiniMax 对象参数深度合并**：`packages/ai/src/providers/openai-completions.ts` 中的 `mergeStreamingArgumentObjects` 处理将 `function.arguments` 作为 JSON 对象而非字符串流式输出的 MiniMax 兼容后端，递归合并各流块中的部分对象增量。
- **DeepSeek 聊天模板与特殊 token 剥离**：`packages/ai/src/providers/openai-completions.ts` 中的 `stripDeepseekSpecialTokens` 和 `getTrailingPartialDeepseekToken` 缓冲并剥离 DeepSeek 端点（例如 NVIDIA NIM、DeepSeek 原生 API）在 `delta.content` 中泄漏的原始 `<｜...｜>` / `<|...|>` 聊天模板标记。
- **方言与模型提供方专有特性**：`packages/ai/src/providers/openai-shared.ts` 中的 `isZaiReasoningEffortDialect` 处理 GLM-5.2 `zai` 思考格式。`dropOpenRouterKimiForcedToolReasoning`、`hasActiveNativeKimiK3Reasoning` 和 `normalizeSchemaForMoonshot` 管理 Kimi（Moonshot）K3 工具模式和推理模式。`applyOpenAIChatCompletionsPromptCachePolicy` 注入提示词缓存断点（`cache_control: { type: "ephemeral" }`，或由 `normalizeOpenAIPromptCacheKey` 生成的带 `pc_` 前缀的 64 字符键）。

### 流行为 \{#stream-behavior}

- **SSE 增量解码与规范化**：`postOpenAIStream`（`packages/ai/src/utils/openai-http.ts`）使用 `readSseJson` 将原始 SSE `data:` 载荷解码为 `ChatCompletionChunk` 对象。`normalizeStreamingContentText`（`packages/ai/src/providers/openai-completions.ts`）对 `delta.content` 进行规范化，无论接收到的是字符串还是内容部分数组（`[{ type: "text", text: "..." }]`，例如 Mistral Medium 3.5），防止出现 `[object Object]` 字符串强制转换。
- **推理字段与 `reasoning_details`**：`streamOpenAICompletionsOnce` 检查 `delta.reasoning_content`（llama.cpp/vLLM）、`delta.reasoning` 和 `delta.reasoning_text`，每个块使用第一个非空字段，以防推理文本重复。`delta.reasoning_details` 条目按接收时的原样保存在该轮的第一个思考块中（同一条目流式传输的 `reasoning.text` / `reasoning.summary` 片段会拼接起来），该块的 `thinkingSignature` 成为一个 JSON 封装，包含这些条目和推理字段标记（`packages/ai/src/utils/reasoning-source.ts` 中的 `parseReasoningDetailsSignature`）；一轮若只有加密条目，则会生成一个空思考块来保存它们。OpenRouter 将其 `reasoning` 字符串镜像到 `reasoning.text` 条目中，因此该轮中两者先到达的流会呈现为思考，另一个不会再次呈现。`convertMessages` 将这些条目原样作为 `reasoning_details` 重放，但如果请求会丢弃模型自身的思考，则会省略没有 `signature` 或 `data` 的 `reasoning.text` / `reasoning.summary` 条目。这些条目覆盖整轮，因此当秘密混淆、凭据脱敏或 DSML 清理重写该轮的任何思考块或工具调用参数时，`dropReasoningDetailsEnvelopes` 会将每个封装缩减为其字段标记；分享导出也会这样做，并且还会丢弃保存在 `toolCall.thoughtSignature` 上的加密条目。带有 `id` 的 `reasoning.encrypted` 条目（数据块位于 `data` 或 `signature` 中）也会附加到匹配的 `toolCall.thoughtSignature` 上，当封装已不存在（或该轮早于封装机制）时由它重放；参数被重写的调用也会失去该签名。
- **部分 JSON 节流**：`parseStreamingJsonThrottled`（来自 `@oh-my-pi/pi-utils`）在 `streamOpenAICompletionsOnce` 的工具参数流式传输期间，对增量 JSON 解析进行节流，避免过高的 CPU 开销。
- **流标记修复**：配置 `policy.stream.markupHealingPattern` 时，会启用 `StreamMarkupHealing`（`packages/ai/src/utils/stream-markup-healing.ts`）。它检查流式文本中由 XML/Markdown 包裹的工具调用（例如 DSML 泄漏），解析完整的工具调用，发出 `toolcall_start`/`toolcall_delta`/`toolcall_end` 事件，并将 `stop` 结束原因提升为 `toolUse`。
- **降级思考与累积推理**：`renderDemotedThinking`（`packages/ai/src/dialect/demotion.ts`）处理降级的思考块（`isDemotedThinking`）。`lastCumulativeReasoningBySignature` 跨文本块切换跟踪累积推理流（例如 MiniMax-M3），防止在可见文本开始后将思考文本作为重复块再次输出。
- **看门狗与终止宽限窗口**：`iterateWithIdleTimeout`（`packages/ai/src/utils/idle-iterator.ts`）使用 `getOpenAIStreamFirstEventTimeoutMs` 和 `getOpenAIStreamIdleTimeoutMs` 监控流活动，向下游注入 `X-Stainless-Timeout` 标头。流结束时，`iterateWithTerminalGrace` 实施 2,500ms 的结束后宽限窗口（`OPENAI_COMPLETIONS_POST_FINISH_GRACE_MS`），允许带有缓存读取 token 详情（`awaitTrailingUsageDetails`）的尾随纯用量块（`stream_options.include_usage`）在关闭流之前到达。
- **用量块解析**：`packages/ai/src/providers/openai-completions.ts` 中的 `parseChunkUsage` 和 `applyUsagePayload` 处理来自 `chunk.usage` 或 `choice.usage` 的 token 用量。提取的字段包括 `prompt_tokens_details.cached_tokens`、`prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、`completion_tokens_details.reasoning_tokens`、`cache_write_tokens`，以及通过 `applyProviderReportedCost`（`packages/ai/src/providers/openai-shared.ts`）取得的模型提供方报告费用。

### 认证与用量 \{#auth--usage}

- **API 密钥验证**：`packages/ai/src/registry/api-key-validation.ts` 中的 `validateOpenAICompatibleApiKey` 通过发出轻量级 `POST /chat/completions` 请求来验证 API 凭据，请求包含 `messages: [{ role: "user", content: "ping" }]`、`max_tokens: 1`、`temperature: 0` 和 `Authorization: Bearer ${apiKey}`。
- **凭据解析**：`packages/ai/src/stream.ts` 中的 `getEnvApiKey` 委托给编译后的认证注册表。模型提供方环境密钥和钩子声明于 `packages/catalog/src/compat/rules/auth/*.kdl`；显式请求凭据和自定义模型提供方配置可以独立提供密钥。
- **用量核算与配额呈现**：`calculateOpenAIUsageAccounting`（`packages/ai/src/providers/openai-shared.ts`）将输入、输出、缓存读取和缓存写入 token 核算为标准 `Usage` 记录。OpenRouter 和 ClinePass 的权威网关费用通过 `applyProviderReportedCost` 填入 `output.usage.cost`。Copilot 请求计数保存在 `output.usage.premiumRequests` 中。传输层 HTTP 错误（例如 429 速率限制、408 超时、5xx 服务器错误）作为 `OpenAIHttpError`（`packages/ai/src/utils/openai-http.ts`）抛出，捕获状态、标头和错误封装详情，以供 `AIError.finalize` 中的上游错误映射使用。

### 目录模型处理 \{#catalog-model-handling}

- **模型提供方条目（`openai`）**：`packages/catalog/src/compat/rules/providers/openai.kdl` 声明默认模型为 `gpt-5.5`。环境密钥：`OPENAI_API_KEY`。
- **编写的种子条目**：`daybreak-blue-latest`、`daybreak-red-latest`、`gpt-5.6-cyber`、`gpt-transcribe`、`whisper-1`、`gpt-4o-transcribe`、`gpt-4o-mini-transcribe`、`text-embedding-3-small`、`text-embedding-3-large`、`text-embedding-ada-002`、`gpt-6-luna-decisions`；打包策略为 `always`。限制、能力和价格与这些行一起编写。`gpt-6-luna-decisions` 是 `openai-decisions` API 上的 `judge` 行，请求的传输ID为 `gpt-6-luna`；在重新生成的打包数据包含它之前，`openaiModelManagerOptions` 会将其追加到成功的发现结果中。
- **模型解析器与管理器**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `createOpenAICompatibleModelManagerOptions` 为 `openai-completions` 模型提供方构建模型管理器。它组合静态/精选模型定义、打包的参考规格（`getBundledModels`）以及从远程目录端点获取的实时模型。
- **目录发现**：`packages/catalog/src/discovery/openai-compatible.ts` 中的 `fetchOpenAICompatibleModels` 查询模型提供方的 `/models` 端点。它安全地解析封装（`data`、`models`、`result`、`items`），使用 `withOpenAICompatibleDiscoveryTimeout` 强制请求超时，验证模型记录模式（`openAICompatibleModelRecordSchema`），应用自定义映射器/过滤器，并按 ID 对模型去重。

## OpenAI Responses \{#openai-responses}

OpenAI Responses 模型提供方（`packages/ai/src/providers/openai-responses.ts`）通过 HTTP 服务器发送事件（SSE）或符合条件的 WebSocket 连接处理 OpenAI 的 `/v1/responses` 协议（类型位于 `openai-responses-wire.ts`，共享编码/解码位于 `openai-shared.ts`）。与聊天补全不同，Responses 操作的是结构化条目序列（`ResponseInput`），其中包含带类型的输入/输出条目（`input_text`、`input_image`、`input_file`、`message`、`function_call`、`custom_tool_call`、`computer_call`、`reasoning`），支持通过 `previous_response_id` 进行上下文串联、显式提示词缓存断点，以及原生推理摘要和加密内容块。

### 特殊处理 \{#special-casings-1}

- **Responses 输入条目模型与聊天消息的区别**：`openai-shared.ts` 中的 `buildResponsesInput` 将标准对话上下文转换为 `ResponseInput` 数组（`ResponseInputItem[]`）。系统指令默认使用顶层 `instructions`，或在 `policy.messages.systemRole === "developer"` 时使用 developer 角色条目（`{ role: "developer" }`）（推理模型需要这样做）。重放历史根据 `filterReasoningHistory` 剥离或保留推理条目，而 Harmony 方言模型（GPT-5+）则通过 `escapeReplayedControlTokens` 转义重放传输数据中的保留控制 token 拼写。
- **HTTP 已存储的 `previous_response_id` 串联与失效链重置**：`openai-responses.ts` 中的 `buildOpenAIResponsesChainedParams` 管理 HTTP 有状态轮次。当 `statefulResponses` 启用时（官方 OpenAI 端点通过 `PI_OPENAI_STATEFUL` 和固化的 `officialEndpoint` 标志默认开启；需要路由会话 ID 和 `providerSessionState`），请求强制设置 `store: true`，并计算以 `previous_response_id` 为锚点的增量载荷（`buildResponsesDeltaInput`）。如果历史被修改、选项变化或提示词缓存断点策略改变，链会重置为完整重放（`resetOpenAIResponsesChainState`）。如果端点返回失效 ID 错误（`isOpenAIResponsesStalePreviousResponseError`），模型提供方会递增 `staleFailures` 并回退为完整会话记录重放；连续失败达到 `OPENAI_RESPONSES_CHAIN_STALE_FAILURE_LIMIT`（3）次后，该会话禁用串联。零数据保留（ZDR）组织错误（`markOpenAIResponsesChainZeroDataRetention`）会立即对该会话禁用串联，并强制设置 `store: false`。这项 HTTP 策略及其优先级独立于连接本地的 WS 续接。
- **加密推理条目与摘要**：通过 `policy.reasoning.includeEncryptedReasoning` 支持 `include: ["reasoning.encrypted_content"]`。`ResponseReasoningItem` 对象包含加密内容载荷、推理文本增量（`response.reasoning_text.delta`）和摘要文本增量（`response.reasoning_summary_text.delta`）。携带序列化 JSON 的思考签名通过 `parseResponseReasoningReplayItem` 解析，并在 `filterReasoningHistory` 为 false 时作为原生 `reasoning` 条目重放。
- **复合 `callId|itemId` 工具 ID**：`packages/ai/src/utils.ts` 中的 `normalizeResponsesToolCallId` 处理工具调用 ID 规范化。Responses 中的工具调用标识符是格式为 `${callId}|${itemId}` 的复合字符串。该函数按 `|` 拆分传入的 ID，得到独立的 `callId`（带 `call_` 前缀，截断至 64 字符）和 `itemId`（以 `fc_` 或 `ctc_` 为前缀）。传入未合成的 ID 时，它生成基于哈希的一对标识符（`call_<hash>` 和 `fc_<hash>` / `ctc_<hash>`）。转换后的消息使用 `normalizeResponsesToolCallIdForTransform`，使工具调用与工具结果消息保持对齐。
- **自定义（自由格式）工具与计算机工具**：`convertTools` 中的工具转换处理函数工具、自定义工具和计算机工具。当 `model.applyPatchToolType === "freeform"`（通过 `supportsFreeformApplyPatch` 检查）时，自定义格式工具（如 `apply_patch`）会编码为带有语法定义（`compactGrammarDefinition`）的 `type: "custom"`。当 `model.supportsComputerUse === true` 时，原生计算机工具（`type: "computer"`）使用结构化 `ComputerAction` 列表输出 `computer_call` 和 `computer_call_output` 条目；没有原生计算机支持的模型回退为常规函数工具。工具模式通过 `sanitizeSchemaForOpenAIResponses` 和 `adaptSchemaForStrict` 清理，违反严格约束的模式会被隔离（`findStrictToolSchemaViolation`），防止无效 MCP 模式导致整个请求失败。
- **稳定的推理强度控制**：在 `supportsConfigurationUpdate` 模型上，`applyResponsesStableEffort` 使请求级推理强度保持字节级稳定，后续变化通过 `configuration_update` 输入条目携带。它需要路由会话 ID 和模型提供方会话状态；两者不齐备时，每个请求各自发送推理强度。
- **服务层级与退出混淆**：`serviceTier` 选项传递给采样参数，并通过 `processResponsesStream` 在输出用量中报告。当 `model.compat.supportsObfuscationOptOut` 为 true 时，采样参数包含 `stream_options: { include_obfuscation: false }`。
- **图像细节处理**：`convertResponsesInputContent` 和 `appendResponsesToolResultMessages` 中的图像内容转换遵循 `model.compat.supportsImageDetailOriginal`。其为 false 时，将 `"original"` 图像细节值映射为 `"auto"`，防止上游拒绝。[模型提供方兼容性参考](./provider-compat-reference.md) 是多模态工具结果编码契约的归属文档。

### 流行为 \{#stream-behavior-1}

- **流事件协议（`response.*` 生命周期）**：`openai-shared.ts` 中的 `processResponsesStream` 处理来自 SSE 和 WS 的相同 Responses 事件。生命周期事件包括 `response.created`、`response.output_item.added`、`response.output_text.delta`、`response.reasoning_text.delta`、`response.reasoning_summary_text.delta`、`response.function_call_arguments.delta`、`response.custom_tool_call_input.delta`、`response.output_item.done`、`response.completed` 和 `response.done`。交错的并行工具调用通过 `output_index`、`item_id` 和带前缀调用 ID 查找映射（`openItemsByOutputIndex`、`openItemsByItemId`、`openItemsByPrefixedCallId`）跟踪。
- **HTTP 看门狗与暂时性故障重试**：`streamOpenAIResponsesOnce` 使用 `iterateWithIdleTimeout`，带有两个超时阈值：`streamFirstEventTimeoutMs`（配合 `X-Stainless-Timeout` 请求标头）用于初始响应标头/事件，`streamIdleTimeoutMs` 用于事件间停滞。如果 HTTP 流在发出重放不安全的输出（`isOpenAIResponsesReplayUnsafeEvent`）之前提前终止，单次尝试的流式处理器会在延迟（`OPENAI_RESPONSES_TRANSIENT_STREAM_RETRY_DELAY_MS = 500ms`）之后进行一次暂时性故障重试（`OPENAI_RESPONSES_MAX_TRANSIENT_STREAM_RETRIES = 1`）。公共 HTTP 路径使用 `withReplaySafeStreamRetry` 包装执行，以重试空补全；这些生成重试不适用于标准 WS。
- **选择启用的标准 Responses WS**：传输设置、能力门控、钩子元数据、套接字本地串联和恢复边界统一记录于[标准 Responses WebSocket](./models.md#standard-responses-websockets)。组件归属见[流式处理内部机制](./provider-streaming-internals.md#standard-responses-transport-ownership)；Codex 保留其独立的协议策略。

### 认证与用量 \{#auth--usage-1}

- 标准 OpenAI 认证依赖 `OPENAI_API_KEY`（或模型提供方专有环境变量），通过 `getEnvApiKey` 和 `openai-shared.ts` 中的 `resolveOpenAIRequestSetup` 解析。请求传递标准 Bearer token 授权标头（`Authorization: Bearer <key>`）及可选的 Stainless/Copilot 标头。_（注意：`openai-codex` / ChatGPT 订阅套餐 OAuth 认证单独处理。）_

### 目录模型处理 \{#catalog-model-handling-1}

- **模型提供方条目（`openai`）**：`packages/catalog/src/compat/rules/providers/openai.kdl` 声明默认模型为 `gpt-5.5`。环境密钥：`OPENAI_API_KEY`。
- **编写的种子条目**：`daybreak-blue-latest`、`daybreak-red-latest`、`gpt-5.6-cyber`、`gpt-transcribe`、`whisper-1`、`gpt-4o-transcribe`、`gpt-4o-mini-transcribe`、`text-embedding-3-small`、`text-embedding-3-large`、`text-embedding-ada-002`、`gpt-6-luna-decisions`；打包策略为 `always`。限制、能力和价格与这些行一起编写。`gpt-6-luna-decisions` 是 `openai-decisions` API 上的 `judge` 行，请求的传输ID为 `gpt-6-luna`；在重新生成的打包数据包含它之前，`openaiModelManagerOptions` 会将其追加到成功的发现结果中。

## OpenAI Codex \{#openai-codex}

OpenAI Codex 模型提供方通过 SSE 或 WebSocket 传输，使用 OpenAI Responses API 接口集成 ChatGPT Plus/Pro 订阅模型。请求使用 ChatGPT OAuth token，按账号隔离，发往 ChatGPT 后端（`https://chatgpt.com/backend-api/codex/responses` 或自定义基础 URL）。入口模块包括：`packages/ai/src/providers/openai-codex-responses.ts` 中的流式处理、`packages/ai/src/providers/openai-codex/request-transformer.ts` 中的请求转换、`packages/ai/src/providers/openai-codex/response-handler.ts` 中的错误与速率限制解析、`packages/ai/src/usage/openai-codex.ts` 中的配额与用量跟踪、`packages/ai/src/usage/openai-codex-reset.ts` 中的重置管理、`packages/ai/src/usage/openai-codex-base-url.ts` 中的基础 URL 规范化、`packages/catalog/src/compat/rules/auth/openai-codex.kdl` 中的认证策略，以及 `packages/ai/src/registry/oauth/openai-codex.ts` 中的 OAuth 处理。

### 特殊处理 \{#special-casings-2}

`packages/catalog/src/compat/rules/providers/openai-codex.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 openai，修订版本 >=5.3.0 <5.7.0：`thinking.mode="effort"`。
- 对于类别 openai，修订版本 >=5.4.0：`supportsAllTurnsReasoningContext=true`。
- 对于类别 openai，修订版本 <5.4.0：`supportsReasoningSummary=false`。
- 对于类别 unknown，修订版本 >=5.4.0：`supportsAllTurnsReasoningContext=true`。
- 对于类别 unknown，修订版本 >=5.6.0：`requiresReasoningOffJuiceInstruction=true`。
- 模型提供方默认值：`harmonyLeakMitigation=true`。

- **WebSocket 与 SSE 双传输**：通过 `openai-codex-responses.ts` 中的 `CodexWebSocketConnection` 支持 WebSocket 流式传输（`v2StreamingEnabled: true`、标头 `OpenAI-Beta: responses_websockets=2026-02-06`、`preferWebsockets` 选项），它组合共享的 `ResponsesWebSocketConnection` 物理通道。Codex 保留其 30 秒空闲复用上限、10 秒 ping 间隔、60 秒 pong 超时和 4096 条目队列，以及自身的引导/后继附接和旧版错误转换。其现有的 `CODEX_WEBSOCKET_FATAL_PATTERNS`、`CodexWebSocketTransportError` 和重试策略负责 SSE 回退；标准 Responses 的粘性降级规则不适用于 Codex。
- **预热路由**：SDK 启动预热使用最终解析出的会话模型及其系列范围内符合条件的服务层级，使 WebSocket 路由提示与第一轮匹配。省略的层级和 `auto` 层级保持省略，显式 `default` 保持显式，不发送宣告但不受支持的层级。如果池中套接字未进行串联（`canAppend === false`，包括进入或离开 `ultrafast` 之后），且请求的 `x-codex-routing-hint` 与握手标头不同，套接字会重连（`routing-change`）。一轮会保留其选中的套接字，直到开始流式传输；迟到的预热会跳过已保留的套接字和存在已接受但待处理引导的套接字，并加入正在进行的握手，而不替换它。并发轮次仍存在竞争：先开始流式传输的轮次拥有该套接字，另一个回退为 SSE。重连（`closed`、`stale-reuse`、`token-refresh`、`routing-change`）会回退为完整的已转换会话记录，而不是发送增量；如果 `onPayload` 钩子删除了 `previous_response_id`，服务器保留的前缀会被加到其（可能已重写的）输入之前。
- **采样参数剥离**：`packages/ai/src/providers/openai-codex/request-transformer.ts` 的 `transformRequestBody` 中会剥离采样参数（`temperature`、`top_p`、`top_k`、`min_p`、`presence_penalty`、`repetition_penalty`、`frequency_penalty`、`stop`）；如果发送任何采样参数，Codex 后端都会返回 HTTP 400 `Unsupported parameter`（#3117）。
- **Responses Lite 传输**：正常推理默认使用完整 Responses；调用方通过 `responsesLite` 请求选项或 `PI_CODEX_RESPONSES_LITE=1` 选择启用 Lite，而模型提供方原生上下文压缩明确遵循目录的 `useResponsesLite` 标志。函数 `applyCodexResponsesLiteShape` 将声明的工具嵌入前置的 `additional_tools` developer 条目，将系统指令放入 developer 消息，剥离图像 `detail`，关闭并行工具调用，强制设置 `reasoning.context: "all_turns"`，并追加 `x-openai-internal-codex-responses-lite: true` 标头（或 WS `client_metadata` 中的 `ws_request_header_x_openai_internal_codex_responses_lite`）。如果没有匹配的已声明工具，托管工具选择（`tool_choice`）会回退为 `"auto"`（#5771）。
- **工具调用/输出配对修复**：`request-transformer.ts` 中的 `repairToolCallPairs` 将缺少先前调用的孤立 `function_call_output`/`custom_tool_call_output` 重写为助手消息（`[Previous tool result; call_id=...]`），并为缺少输出的孤立调用注入合成输出（`[No tool output recorded...]`），防止后端 HTTP 400 验证失败。
- **会话亲和性与标头**：输出会话标头，包括 `session-id`、`thread-id`、`x-codex-installation-id`、`x-codex-window-id`、`x-codex-turn-metadata`（包含 `turn_id`、`installation_id`、`parent_turn_id`、`request_kind` 的 JSON）、`x-codex-parent-thread-id` 和 `x-openai-subagent`，定义位于 `packages/catalog/src/wire/codex.ts` 和 `openai-codex-responses.ts`。
- **证明与压缩**：查询进程范围的 DeviceCheck 证明钩子 `setCodexAttestationProvider`，以获取 `x-oai-attestation` 标头（`getCodexAttestationHeader`）。发往 `chatgpt.com` 的请求体由共享的 `wrapFetchForRequestCompression`（`packages/ai/src/utils/request-compression.ts`）使用 zstd 压缩，受 `packages/catalog/src/compat/rules/providers/openai-codex.kdl` 中的 `request-encodings` 轴驱动，并以模型提供方自身端点（`isCatalogEndpointUrl`）为门控条件，除非设置 `PI_REQUEST_COMPRESSION=0`。
- **固定区域的工作区驻留**：企业 ChatGPT 工作区可以固定到某个数据驻留区域，并拒绝出口区域不同的任何 Codex 请求，返回 HTTP 401 `Workspace is not authorized in this region.`，除非客户端自行声明工作区驻留区域。Codex 请求构建器从 OAuth 访问 token 中读取它（`packages/catalog/src/wire/codex.ts` 中的 `getCodexResidency`，使用声明 `chatgpt_data_residency`，并以 `chatgpt_compute_residency` 为回退），在聊天 SSE 和 WebSocket 传输、网页搜索、远程上下文压缩以及 `generate_image` 上发送 `x-openai-internal-codex-residency`。没有该声明的账号（个人 ChatGPT、不是 JWT 的不透明代理密钥）不发送此标头，并且绝不覆盖调用方提供的同名标头。
- **Harmony 控制 token 转义**：对使用 Harmony 方言（`isHarmonyDialectModel`）的模型，通过 `escapeHarmonyControlTokens` 清理重放的输入文本。

### 流行为 \{#stream-behavior-2}

- **事件协议**：解析 SSE JSON 载荷或 WebSocket 帧（`response`、`sequence_number`、`type`）。触发进度事件（`isOpenAIResponsesProgressEvent`、`CODEX_ADDITIONAL_PROGRESS_EVENT_TYPES`，例如 `response.done` 和 `response.incomplete`）。
- **超时看门狗**：对首个事件实施 `CODEX_WEBSOCKET_FIRST_EVENT_TIMEOUT_MS`（300s），对稳态流空闲上限实施 `CODEX_WEBSOCKET_IDLE_TIMEOUT_MS`（300s），对 SSE 流使用 `iterateWithIdleTimeout`。
- **失效历史恢复**：遇到失效的 `previous_response_id` 错误（`CODEX_STALE_PREVIOUS_RESPONSE_CODES`）时，清除无效的串联响应指针并重试，以重新流式传输/重放。
- **重试预算与速率限制**：遇到暂时性错误（`model_error`、`server_error`、`internal_error` 或 `CODEX_RETRYABLE_EVENT_MESSAGE`）时，最多重试 `CODEX_MAX_RETRIES`（5）次。在 5 分钟预算（`CODEX_RATE_LIMIT_BUDGET_MS`）内，使用服务器重试延迟处理 HTTP 429 退避。
- **空白循环防护**：检测无限空白工具调用参数增量（`CODEX_WHITESPACE_TOOL_CALL_ARGUMENT_DELTA_EVENT_LIMIT` = 256，16KB 限制），以 `CodexWhitespaceToolCallLoopError` 中断执行，并尝试最多 2 次重试（`CODEX_WHITESPACE_LOOP_RETRY_LIMIT`）。

### 认证与用量 \{#auth--usage-2}

- **OAuth 登录流程**：实现 `packages/catalog/src/compat/rules/auth/openai-codex.kdl`（`login "oauth-code"`，引擎为 `packages/ai/src/registry/engine/oauth-code.ts`）和 `openai-codex-device.kdl` 中声明的 ChatGPT OAuth，钩子位于 `packages/ai/src/registry/oauth/openai-codex.ts`。浏览器流程使用 PKCE S256（`createOpenAICodexAuthorizationUrl`），固定本地端口为 1455（`http://localhost:1455/auth/callback`），客户端 ID 为 `app_EMoamEEZ73f0CkXaXp7hrann`，并使用简化 CLI 流程标志。无头设备码流程（`loginOpenAICodexDevice`）使用 `https://auth.openai.com/api/accounts/deviceauth/usercode`，并轮询 `deviceauth/token`。
- **Token 刷新与声明**：`packages/catalog/src/compat/rules/auth/openai-codex.kdl` 中的 `refresh` 请求向 `https://auth.openai.com/oauth/token` 提交刷新 token 授权；通用注册表刷新引擎执行该请求。`packages/ai/src/registry/oauth/openai-codex.ts` 中的 `getTokenProfile` 和 `openAICodexProfileHook` 提取账号与配置档案声明，并在刷新时保留已存储的组织身份。
- **账号轮换与速率限制排序**：账号身份通过 `ChatGPT-Account-Id` 标头（`getCodexAccountId`）设置。`packages/ai/src/usage/openai-codex.ts` 中的 `codexRankingStrategy` 将标准聊天限制（主窗口 5h，次窗口 7d）与 Spark 计量限制隔离（`-spark` 模型后缀消耗 `spark` 范围），防止 Spark 额度耗尽阻塞普通聊天请求。
- **用量跟踪**：`openaiCodexUsageProvider` 在规范 ChatGPT 源上查询 `/wham/usage`。解析 `primary_window`（5h）和 `secondary_window`（7d），以及 `additional_rate_limits`（Spark/额外计量项）。在 `parseCodexRateLimitHeaders`（`response-handler.ts` 的 `parseCodexError`）中摄取响应标头（`x-codex-primary-used-percent`、`x-codex-primary-window-minutes`、`x-codex-primary-reset-at`、`x-codex-secondary-*`）。
- **已保存的速率限制重置额度**：从 `/wham/usage` 读取 `rate_limit_reset_credits`。使用 `listCodexResetCredits`（`GET /wham/rate-limit-reset-credits`）列出可用额度，使用 `pickSoonestExpiringCredit` 选择最早到期的额度，并通过 `consumeCodexResetCredit`（`POST /wham/rate-limit-reset-credits/consume`，携带客户端 UUID `redeem_request_id`）兑换。
- **基础 URL 规范化**：`packages/ai/src/usage/openai-codex-base-url.ts` 中的 `normalizeCodexBaseUrl` 强制账号 API 请求（`wham/usage`、重置额度）使用规范 `chatgpt.com` 或 `chat.openai.com` 源（`/backend-api`），忽略会导致 404 的自定义代理覆盖（`providers.openai-codex.baseUrl`）。流 URL 通过 `openai-codex-responses.ts` 中的 `resolveCodexResponsesUrl` 解析。

### 目录模型处理 \{#catalog-model-handling-2}

- **模型提供方条目（`openai-codex`）**：`packages/catalog/src/compat/rules/providers/openai-codex.kdl` 声明默认模型为 `gpt-5.5`。环境密钥：`OPENAI_CODEX_OAUTH_TOKEN`。
- **编写的种子条目**：`gpt-image-2`；打包策略为 `always`。限制、能力和价格与这些行一起编写。
- **动态发现**：`packages/catalog/src/discovery/codex.ts` 中的 `fetchCodexModels` 使用 `v2StreamingEnabled: true` 查询 `/codex/models` 或 `/models`，将 `reasoning_presets`（`effort`、`summary`）解析进 `ModelSpec<"openai-codex-responses">`。
- **定价回退**：当 Codex 发现模型缺少显式费用元数据时，`packages/catalog/scripts/generate-models.ts` 中的 `applyCodexPricingFallback` 从模型 ID 匹配的 `openai` 模型提供方条目复制计费费用。

## Azure OpenAI \{#azure-openai}

Azure OpenAI Responses 模型提供方（`azure-openai-responses`）为通过 Azure OpenAI Responses API 提供的 OpenAI 系列模型（GPT-4/4.1/4o、GPT-5 系列、o 系列、Codex）处理传输、端点解析与兼容性包装。它使用内部 `postOpenAIStream` 传输（`packages/ai/src/utils/openai-http.ts`）发出 JSON-POST / SSE 请求。流生成在 `streamAzureOpenAIResponses`（`packages/ai/src/providers/azure-openai-responses.ts`）中初始化，共享 Responses 输入/输出处理逻辑则位于 `packages/ai/src/providers/openai-shared.ts`。

### 特殊处理 \{#special-casings-3}

`packages/catalog/src/compat/rules/providers/azure.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 openai：`thinking.mode="effort"`。
- 对于模型 codex-mini、gpt-chat-latest：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 gpt-5.1-codex、gpt-5.1-codex-max：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 gpt-6-astra*：`disableReasoningWithTools=true`、`reasoningDisableMode="none-effort"`。

- **部署名称映射**：Azure OpenAI 要求请求载荷使用部署名称。`resolveDeploymentName`（`packages/ai/src/providers/azure-openai-responses.ts`）检查 `options.azureDeploymentName`，然后检查 `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 环境变量（由 `openai-shared.ts` 中的 `parseAzureDeploymentNameMap` 解析为 `modelId=deploymentName` 对的映射，例如 `gpt-5-mini=my-mini-dep,o3=my-o3-dep`），默认为 `model.id`。
- **基础 URL / 资源解析**：`resolveAzureConfig`（`packages/ai/src/providers/azure-openai-responses.ts`）检查 `options.azureBaseUrl` 或 `$env.AZURE_OPENAI_BASE_URL`。若缺失，则根据 `options.azureResourceName` 或 `$env.AZURE_OPENAI_RESOURCE_NAME` 构造 `https://${resourceName}.openai.azure.com/openai/v1`。若仍缺失，则回退为 `model.baseUrl`；如果找不到端点，抛出 `AIError.ConfigurationError`。尾部斜杠会被剥离。
- **API 版本处理**：`resolveAzureConfig` 从 `options.azureApiVersion`、`$env.AZURE_OPENAI_API_VERSION` 解析 API 版本，或默认为 `"v1"`。它作为请求上的 `api-version` URL 查询参数传递（`${baseUrl}/responses?api-version=${apiVersion}`），而不是作为 HTTP 标头。
- **图像细节限制**：在 `appendResponsesToolResultMessages` / `convertResponsesInputContent` 中，如果 `supportsImageDetailOriginal` 为 `false`，`clampResponsesImageDetail` 会将 `detail: "original"` 限制为 `"auto"`。对于 Azure OpenAI，`supportsImageDetailOriginal` 为 `true`（与 GitHub Copilot 和 xAI OAuth 不同），因而保留原始图像分辨率。
- **计算机工具回退映射**：`modelForAzureEndpoint`（`packages/ai/src/providers/azure-openai-responses.ts`）验证解析出的端点主机是否以 `.openai.azure.com` 或 `models.inference.ai.azure.com` 结尾。如果通过未识别的代理路由，则禁用 `supportsComputerUse`。在 `buildParams` 中，如果工具的 `native.type === "computer"` 且 `model.supportsComputerUse` 为 `true`，则将其序列化为 `{ type: "computer" }`。如果 `supportsComputerUse` 为 `false`，则回退为将计算机工具序列化为标准 `{ type: "function", name: tool.name, ... }` 工具。`tool_choice` 会在 `computer` 和 `function` 目标之间自动转换。
- **与普通 Responses（`openai-responses`）的区别**：使用 `api-key` 标头（从不使用 `Authorization: Bearer`），使用固定端点路径 `${baseUrl}/responses?api-version=...`（`/responses` 路径不以部署为作用域，与 Chat Completions 的 `/deployments/{dep}/chat/completions` 不同），将部署名称作为 `model` 放在请求体中，根据环境变量/选项在运行时动态构造端点，并将 `strictResponsesPairing` 默认为 `true`。

### 流行为 \{#stream-behavior-3}

- **事件处理**：使用 `packages/ai/src/providers/openai-shared.ts` 中的 `processResponsesStream` 消费 SSE 流事件（`response.created`、`response.output_item.added`、`response.content_part.added`、`response.output_text.delta`、`response.completed`、`response.incomplete`）。终止性 `response.incomplete` 事件（输出 token 截断）更新用量计数器并设置 `stopReason: "length"`。
- **空闲与首事件看门狗**：由 `iterateWithIdleTimeout` 包装。如果首个 SSE 事件未在 `streamFirstEventTimeoutMs` 内到达，则以 `"Azure OpenAI responses stream timed out while waiting for the first event"` 中止。
- **无类型 SSE 载荷解析**：当标准 SSE 标头行中缺少事件类型标签时，`onSseEvent` 检查无类型 JSON 事件数据（`type` 或 `object` 属性）以附加该标签。
- **推理强度回退**：在流初始化期间捕获 `OpenAIHttpError`。如果端点拒绝请求的推理强度（例如 `xhigh`），`resolveOpenAIReasoningEffortFallback` 会确定较低的推理强度级别，降低 `params.reasoning`，并使用 `createOpenAIReasoningEffortFallbackKey("azure-responses", url, model)` 重试请求。

### 认证与用量 \{#auth--usage-3}

- **凭据来源**：来自 `options.apiKey` 或 `$env.AZURE_OPENAI_API_KEY`（通过 `packages/ai/src/stream.ts` 中的 `getEnvApiKey(model.provider)` 或 `buildAzureResponsesRequest` 获取）。作为 `api-key` 标头发送。
- **用量跟踪**：由 `processResponsesStream` 直接从终止性 `response.completed` / `response.incomplete` 流事件中提取（`input_tokens`、`output_tokens`、`reasoning_tokens`、`cached_tokens`）。`packages/ai/src/usage/` 下没有独立的用量跟踪器。
- **提示词缓存控制**：`prompt_cache_key` 通过 `getOpenAIPromptCacheKey(options)` 生成。显式提示词缓存模式会被拒绝（`AIError.ConfigurationError`），因为 Azure Responses 不支持显式缓存控制标头或保留指令。

### 目录模型处理 \{#catalog-model-handling-3}

- **模型提供方条目（`azure`）**：`packages/catalog/src/compat/rules/providers/azure.kdl` 声明默认模型为 `gpt-5.5`。环境密钥：`AZURE_OPENAI_API_KEY`。
- **打包模型为何没有 `baseUrl`**：Azure OpenAI 端点针对特定资源，目录生成期间无法得知（`models.json` 存储 `baseUrl: ""`）。运行时从 `AZURE_OPENAI_BASE_URL` 或 `AZURE_OPENAI_RESOURCE_NAME` 解析端点。兼容性检测（`packages/catalog/src/compat/resolve.ts` 中的 `isAzure`）匹配 `provider === "azure"`，确保 `baseUrl` 为空的打包模型仍获得 Azure 兼容性标志（`strictResponsesPairing`、`supportsDeveloperRole`、`supportsStrictMode`）。

## Anthropic Messages \{#anthropic-messages}

Anthropic 模型提供方（`packages/ai/src/providers/anthropic.ts`）通过向 `/v1/messages`（或 `/v1/messages?beta=true`）发出 HTTPS POST 实现 Anthropic Messages API 协议，使用服务器发送事件（SSE）进行流式传输。自定义 HTTP 客户端传输由 `AnthropicMessagesClient`（`packages/ai/src/providers/anthropic-client.ts`）提供，以内置重试和超时逻辑替代 `@anthropic-ai/sdk`。传输结构和 SSE 载荷的类型定义位于 `packages/ai/src/providers/anthropic-wire.ts`。客户端指纹常量（版本、用户代理、工具前缀）位于 `packages/ai/src/providers/claude-code-fingerprint.ts`，而 `packages/ai/src/providers/anthropic-http-options.ts` 负责端点解析，以及连接预热与流式处理使用的共享证书缓存。

### 特殊处理 \{#special-casings-4}

- **OAuth 与 API 密钥路径**：`packages/ai/src/providers/anthropic-headers.ts` 中的 `buildAnthropicHeaders` 通过 `options.isOAuth ?? isAnthropicOAuthToken(apiKey)` 检测 OAuth。OAuth 强制使用 Bearer 授权，默认设置 `Accept: application/json`；发往官方端点的 API 密钥请求使用 `X-Api-Key`。非官方端点通常使用 Bearer 授权。在 OAuth 和 Cloudflare 分支之外，会遵循调用方的授权设置；Cloudflare 使用 `cf-aig-authorization`。受控 OAuth 指纹覆盖仅在非官方且非 Cloudflare 的端点上获准。
- **Claude Code 指纹**：OAuth 使用 `packages/ai/src/providers/claude-code-fingerprint.ts` 中的 `getClaudeCodeUserAgent()`：`claude-cli/<version> (external, cli)`，回退版本为 `2.1.280`。`PI_AI_CLAUDE_CODE_VERSION` 可覆盖它；也可以采用服务器拒绝请求时要求的较新版本。`anthropic-headers.ts` 中的 `buildClaudeCodeBetas` 区分智能体调用和实用功能调用；智能体调用包含 OAuth、Claude Code、交错思考、token 计数、上下文管理、提示词缓存作用域和对话中途系统消息 beta，并为思考添加推理强度支持及回退额度支持。订阅凭据有意省略 1M 上下文 beta。计费证明和元数据使用 `generateClaudeCloakingUserId`、`deriveClaudeDeviceId` 和 `resolveAnthropicMetadataUserId`。
- **系统提示词注入**：对于 OAuth 凭据，`buildAnthropicSystemBlocks`（`packages/ai/src/providers/anthropic.ts`）自动将 `claudeCodeSystemInstruction`（"You are Claude Code, Anthropic's official CLI for Claude."）前置为 `system[0]`。通过 `mid-conversation-system-2026-04-07`，为 Opus 4.8+ / Sonnet 5+ 启用轮次历史中的对话中途系统消息。
- **思考签名与已脱敏思考**：重放被修改或未签名的思考块会引起 Anthropic API 错误（`invalid signature in thinking block`）。`convertAnthropicMessages` 转换 `ThinkingContent` 和 `RedactedThinkingContent`（`type: "redacted_thinking"`、`data`）。`maybeAddReplayUnsignedThinkingHint` 在签名错误时附加恢复提示，而 `unwrapAnthropicThinkingEnvelope` 剥离旧版 `<thinking>` XML 包装。
- **工具使用重放与前缀**：`encodeAnthropicToolName` / `decodeAnthropicToolName`（`packages/ai/src/providers/anthropic.ts`）在使用 OAuth 时为自定义工具名称添加 `_`（`claudeToolPrefix`）前缀，防止与内置工具（`web_search`、`code_execution`、`text_editor`、`computer`）冲突。服务器执行的网页搜索和工具搜索（`anthropic-wire.ts` 中的 `AnthropicServerToolHistoryBlockParam`）通过 `isAnthropicServerToolHistoryBlock` 检测，以供轮次重放。空工具错误由 `ensureErrorToolResultWireContent` 填充。
- **严格工具模式规范化与回退**：`normalizeAnthropicToolSchema` 和 `normalizeAnthropicStrictSchema` 为 `structured-outputs-2025-12-15` beta 剥离不受支持的 JSON 模式关键字（例如对象上的 `minItems`/`maxItems`）。如果严格工具模式导致 HTTP 400，`streamAnthropicOnce` 会调用 `dropAnthropicStrictTools` 并自动在不使用严格模式的情况下重试。
- **自适应思考与预算思考**：`ThinkingConfigParam`（`anthropic-wire.ts`）支持预算思考（`{ type: "enabled", budget_tokens: N }`，由 `ensureMaxTokensForThinking` 强制保障）和自适应思考（`{ type: "adaptive" }`，通过 `effort-2025-11-24` beta 与 `output_config: { effort: level }` 配合）。强制工具选择（`disableThinkingIfToolChoiceForced`）会自动禁用思考。思考和可见输出共享 `max_tokens`，因此 `streamSimple` 将调用方的 `maxTokens` 视为其想要的输出量，在每条 `anthropic-messages` 思考路径及 Bedrock 上的自适应 Claude 中，额外加上该推理强度的思考预算（受模型上限约束）；如果不这样做，自适应思考可能耗尽整个上限而没有任何返回，此时按需上下文压缩会在达到 `max_tokens` 时结束，没有 `compaction` 块。
- **消息线程**：`AnthropicThreadTurn`（`packages/ai/src/providers/anthropic-threads.ts`）以照常构建的完整请求体为基准，塑造会话（`sessionId` + `providerSessionState`）的每个请求。当上一个响应距今不到 4.5 分钟、固定字段和 beta 集合不变，且忽略 `cache_control` 后完整消息是已存储对话的扩展时，轮次会续接（`thread: {type: "continue", previous_message_id}`，仅包含追加的消息）；否则会创建。API 密钥续接省略 `system`/`tools`；OAuth 续接像 Claude Code 一样重新发送它们。被拒绝的续接（`thread_not_found`、指纹、已续接、进行中）会在同一轮中作为创建重放；`thread_unsupported_request`、被拒绝的创建，或重放后第二次被拒绝的续接，会停止该会话的线程化；线程请求发生无法解释的 400 时，会不带 `thread` 重发一次，并且只有重发成功时才禁用该链。上下文压缩、非 `clear_thinking` 上下文编辑、`clear_at` 消息、每次调用的上下文消息和回退额度兑换均不带线程。链以账号为作用域（`resetAnthropicThreads`）。线程内部的提示词缓存（根据 API 测量）：只有创建请求的系统、工具和非末尾消息断点会在后续轮次继续生效；续接的断点只作用于该请求，并遵循通常约 20 个块的回看范围，因此 `continueBreakpoints` 标记第一个追加块（它越过已存储的响应，触达上一个请求的缓存条目）以及最新块，并丢弃其余断点以保持在四个以内。
- **提示词缓存断点**：`packages/ai/src/providers/anthropic.ts` 中的 `applyPromptCaching` 与系统/工具标记共享四个断点的预算。它选择符合条件的滚动尾部消息，并在每 15 个对话用户轮次处选择稳定的历史检查点；轮次作用域/每次调用消息以及工具控制消息被排除在尾部锚点之外。尾部合成的 `Continue.` 填充消息会被跳过。思考、已脱敏思考和回退内容不是缓存锚点。长保留期仅在受支持时使用 `ttl: "1h"`。

### 流行为 \{#stream-behavior-4}

- **事件协议**：`streamAnthropicOnce`（`packages/ai/src/providers/anthropic.ts`）中的 SSE 流发出标准分帧事件：`message_start`（传递初始输入和缓存用量）、`content_block_start`（初始化块类型：text、thinking、tool_use、redacted_thinking、fallback）、`content_block_delta`（流式传输 `text_delta`、`thinking_delta`、`signature_delta`、`input_json_delta`）、`message_delta`（传递 `stop_reason` 和最终 `output_tokens`）、`content_block_stop`、`message_stop` 和 `ping`。
- **细粒度工具流式传输**：通过 `fine-grained-tool-streaming-2025-05-14` beta 启用。传入的 `input_json_delta` 块累积在 `kStreamingPartialJson` 中，由 `parseStreamingJsonThrottled` 持续解析，以呈现流式工具参数。
- **服务器端回退交接**：模型在响应中途拒绝继续时，会在 `fallback` 内容块处将响应交给回退模型。完成的轮次（`done` 或 `error`）丢弃最后一个标记之前拒绝继续的模型的思考、已脱敏思考和工具调用，并保留其文本（`withoutDeclinedFallbackOutput`）。携带 `fallbacks` 的请求会暂存 `toolcall_*` 事件，直到流结束，仅释放保留的调用，并使用流自身的内容索引；实时的 `partial` 消息保留所有流式传输的块。
- **流看门狗与修复**：在 `iterateWithIdleTimeout` 内，使用 `getStreamFirstEventTimeoutMs` 和 `getStreamIdleTimeoutMs` 监控流的停滞超时。`ping` 事件（`ANTHROPIC_PING_EVENT`）重置空闲超时倍数。空补全响应（0 token）通过 `withReplaySafeStreamRetry` 触发自动重试。快速模式（`speed: "fast"`）失败会清除会话快速模式状态（`clearAnthropicFastModeFallback`、`dropAnthropicFastMode`），回退为标准执行。

### 认证与用量 \{#auth--usage-4}

- **OAuth 认证**：`packages/catalog/src/compat/rules/auth/anthropic.kdl` 声明 PKCE 授权和 token 交换，由通用 OAuth-code 引擎执行。身份由 `packages/ai/src/registry/oauth/anthropic.ts` 中的 `anthropicIdentityHook` 和 `fetchAnthropicBootstrapIdentity` 解析。授权 TTL 为 30 天（`anthropic-constants.ts` 中的 `ANTHROPIC_OAUTH_GRANT_TTL_MS`），独立于刷新 token 轮换。
- **1 年登录**：`packages/catalog/src/compat/rules/auth/anthropic-long-lived.kdl` 运行相同的 PKCE 流程，在 token 请求中使用作用域 `user:inference user:profile` 和 `expires_in: 31536000`；服务器授予 365 天有效期，并附带账号/组织身份，`/api/oauth/profile`、`/usage` 和 `/api/claude_cli/bootstrap` 会响应它。完整 Claude Code 作用域集合搭配 `expires_in` 会被拒绝（`400 invalid_request`）。该行不存储刷新 token（`refresh literal=""`），而 `anthropic` 刷新规则的 `require "refresh"` 会在本地使其失败，因此它永不刷新。两种登录均记录获授的 `scope`；`resolveProviderFileCredential`（`packages/coding-agent/src/blob-broker/provider-files.ts`）会使不带 `user:file_upload` 的授权不使用 Files API，而常规 OAuth token 使用 Bearer 标头上传。行以 `anthropic`（`store-as`）存储，因此对于相同账号和组织，任一种登录都会替换另一种的行。`omp usage` 根据约 30d 的授权和访问 token 中有效期更长者，确定重新登录警告的日期。
- **配额跟踪与账号轮换**：`packages/ai/src/usage/claude.ts` 轮询 `https://api.anthropic.com/api/oauth/usage`，跟踪滚动的 `five_hour`、`seven_day`、`limits[]`（`weekly_scoped`）和 `anthropic-ratelimit-unified-*` 标头。匹配 `isUsageLimitOutcome`（`packages/ai/src/error/rate-limit.ts`）和 `parseRateLimitReason`（`QUOTA_EXHAUSTED`）的错误会触发自动凭据轮换。
- **错误分类**：HTTP 错误由 `parseRateLimitReason`（`packages/ai/src/error/rate-limit.ts`）分类为 `QUOTA_EXHAUSTED`（30m 退避/轮换）、`RATE_LIMIT_EXCEEDED`（30s 退避）、`CONCURRENT_LIMIT`（5s 退避）和 `MODEL_CAPACITY_EXHAUSTED`（45s ± 15s 退避）。暂时性 HTTP 408/409/429/5xx 错误由 `AnthropicMessagesClient`（`packages/ai/src/providers/anthropic-client.ts`）重试，并遵循 `retry-after-ms` / `retry-after` 标头。

### 目录模型处理 \{#catalog-model-handling-4}

- **模型提供方条目（`anthropic`）**：`packages/catalog/src/compat/rules/providers/anthropic.kdl` 声明默认模型为 `claude-opus-5-5`。环境密钥：`ANTHROPIC_API_KEY`。
- **编写的种子条目**：`claude-sonnet-5`、`claude-sonnet-5-5`、`claude-fable-5`、`claude-mythos-5`、`claude-fable-5-1`、`claude-mythos-5-1`；打包策略为 `always`。限制、能力和价格与这些行一起编写。
- **定价与倍数**：在模型目录生成期间，`packages/catalog/scripts/generate-models.ts` 中的 `COPILOT_PREMIUM_MULTIPLIERS` 为 GitHub Copilot Anthropic 模型分配高级请求倍数（例如 `claude-opus-4.6`：3x，`claude-haiku-4.5`：0.33x）。

## Google Gemini \{#google-gemini}

Google Gemini 集成使用通过 HTTP 传输的 REST/SSE（`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse`）。核心模型提供方入口为 `packages/ai/src/providers/google.ts`（`streamGoogle`）、`packages/ai/src/providers/google-shared.ts`（`streamGoogleGenAI`、`buildGoogleGenerateContentParams`、`convertMessages`、`consumeGoogleStream`）和 `packages/ai/src/providers/google-types.ts`。

### 特殊处理 \{#special-casings-5}

`packages/catalog/src/compat/rules/providers/google.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="budget"`。
- 对于模型 *latest：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="budget"`。
- 对于模型 gemini-2.5-computer-use-preview-10-2025、gemini-robotics-er-1.6-preview：`thinking.efforts=["minimal","low","medium","high"]`。

- **`generateContent` 协议**：系统提示词在 `buildGoogleGenerateContentParams` 中提升到 `{ systemInstruction: { parts: [{ text }] } }`。工具使用 `parametersJsonSchema` 格式化到 `tools[].functionDeclarations` 中（通过 `packages/ai/src/utils/schema/normalize.ts` 中的 `normalizeSchemaForGoogle` 清理）。
- **`thinkingConfig` 映射**：`buildGoogleGenerateContentParams` 设置 `includeThoughts: !options.hideThinkingSummary`。Gemini 3 模型将 `options.thinking.level` 映射为 `thinkingLevel`（`THINKING_LEVEL_UNSPECIFIED`、`MINIMAL`、`LOW`、`MEDIUM`、`HIGH`）。Gemini 2.x 模型将 `options.thinking.budgetTokens` 映射为 `thinkingBudget`。
- **连续 `functionResponse` 规则**：Gemini 要求并行工具调用结果位于单个连续的 `user` 角色消息中。`google-shared.ts` 中的 `convertMessages` 检查 `lastContent`，并将 `functionResponse` 部分合并到已有 `user` 轮次（`lastContent.parts.push(functionResponsePart)`）。Gemini 按位置将无 ID 的响应与调用配对，因此 `FunctionCallOrder` 将每个合并轮次的响应（以及 Gemini < 3 缓冲的工具结果图像）按调用顺序排序。智能体循环已经按调用顺序存储结果；此处防护乱序到达的历史（18.4.2 之前保存的会话、SDK 构建的上下文）。Factory Droid Gemini 传输也这样做。
- **安全设置与提示词反馈**：`PromptFeedback` 中的安全阻止（`blockReason`、`blockReasonMessage`）会抛出带有 `kind: "content-blocked"` 的 `AIError.ProviderResponseError`。`FinishReason` 值（`SAFETY`、`BLOCKLIST`、`PROHIBITED_CONTENT`、`SPII`、`IMAGE_SAFETY`、`RECITATION`、`MALFORMED_FUNCTION_CALL`、`UNEXPECTED_TOOL_CALL`、`NO_IMAGE`、`OTHER`）在 `mapStopReason` 中映射为 `stopReason: "error"`。

### 流行为 \{#stream-behavior-5}

- **`streamGenerateContent` SSE 协议**：流通过 `streamGoogleGenAI` 中的 `readSseJson<GenerateContentResponse>` 消费。
- **思考部分与签名保留**：`isThinkingPart` 在 `part.thought === true` 时识别推理文本。`GoogleTextBlocks` 将流式文本和思考部分合并成块，并将每个 `part.thoughtSignature` 保留在携带它的部分所属的块上，包括 Gemini 在文本回复最后一个块之后发送、用于签署该回复的空文本部分。在 `convertMessages` 中，只有消息模型提供方/模型与目标匹配（`msg.provider === model.provider && msg.model === model.id`）且通过 `isValidThoughtSignature`（base64 检查）时，才保留思考签名；该模型自身的思考无论是否签名，均作为 `thought: true` 部分重放，而其他模型的思考在到达之前已被 `transformMessages` 降级为文本。对于缺少有效签名的 Gemini 3 工具调用，公共 Gemini API 会在每个未签名调用上发出 `skip_thought_signature_validator` 绕过哨兵值。Vertex AI 只在一轮的第一个调用未签名时发出它；首个调用已签名的并行轮次，会在未签名的后续调用中省略它（#9638、#10602）。
- **空响应重试循环**：`streamGoogleGenAI` 防范 Gemini 返回 `finishReason: STOP`、内容空白且不调用工具的情况。`hasMeaningfulGoogleContent` 验证输出；如果为空，`streamGoogleGenAI` 会通过 `resetGoogleStreamOutputForRetry` 重置流输出，然后按指数退避（`EMPTY_STREAM_BASE_DELAY_MS * 2^attempt`）重试，最多 `MAX_EMPTY_STREAM_RETRIES` 次（2 次重试，总共 3 次尝试）。
- **思考循环防护**：实现在 `packages/ai/src/utils/thinking-loop.ts`（`ThinkingLoopDetector`）中。目录的 `thinking-loop-guard` 轴为每个模型行设置级别（`loopGuardLevel`）：Gemini、DeepSeek 和 Grok 为 `semantic`（包含下述所有形态），Claude 为 `off`，其他所有模型只获得形态 1：
   1. _尾部逐字重复_（`EXACT_TAIL_WINDOW = 4096`，重复字符 >= 180；当循环较长或跨越换行时为 >= 1024，因为摘要器会重复状态行）。
   2. _近似重复片段_（最近 16 个片段的三元组 Jaccard 相似度 >= 0.8）。
   3. _进展词汇停滞_（连续 8 个片段的新颖度 <= 0.2，且没有新的具体引用锚点）。
   4. Gemini 的 `GEMINI_HEADER_RUNAWAY_THRESHOLD = 24` 会停止输出过多带标题推理摘要却不采取行动的流。触发时发出带有 `AIError.Flag.ThinkingLoop` 标签的合成可重试 `error`。
- **结束原因映射与不完整流**：`candidate.finishReason` 通过 `mapStopReason` 映射；如果输出包含工具调用，`stop`/`length` 原因会升级为 `toolUse`。没有 `finishReason` 的中断会抛出带有 `kind: "incomplete-stream"` 的 `ProviderResponseError`。
- **UsageMetadata 核算**：附加在 `consumeGoogleStream` 的尾随块上。`input` 计算为 `promptTokenCount - (cachedContentTokenCount || 0)`；`output` 为 `candidatesTokenCount + (thoughtsTokenCount || 0)`；`cacheRead` 为 `cachedContentTokenCount || 0`；`reasoningTokens` 为 `thoughtsTokenCount`。Token 费用通过 `calculateCost(model, output.usage)` 计算。

### 认证与用量 \{#auth--usage-5}

- **凭据来源**：直接通过 `x-goog-api-key: apiKey` 标头认证（或使用在 `packages/ai/src/providers/google.ts` 中通过 `getEnvApiKey(model.provider)` 获取的 `GEMINI_API_KEY` 环境变量）。

### 目录模型处理 \{#catalog-model-handling-5}

- **模型提供方条目（`google`）**：`packages/catalog/src/compat/rules/providers/google.kdl` 声明默认模型为 `gemini-3.1-pro-preview`。环境密钥：`GEMINI_API_KEY`。
- **编写的种子条目**：`gemini-decision-1`；打包策略为 `always`。限制、能力和价格与这些行一起编写。`gemini-decision-1` 是 `google-decisions` API 上的 `judge` 行（`POST /v1beta/decisions`，密钥放在 `x-goog-api-key` 中）。

## Google Vertex AI \{#google-vertex-ai}

Google Vertex AI 模型提供方支持 Google Cloud Vertex AI 托管的 Gemini 模型，以及通过 Vertex 端点提供的第三方模型（如 Anthropic Claude）的流式生成。入口包括：为 Gemini 模型提供的 `packages/ai/src/providers/google-vertex.ts` 中的 `streamGoogleVertex`（API 类型为 `"google-vertex"`），为 Claude 模型提供的、通过 `packages/ai/src/stream.ts` 中的 `createVertexAuthenticatedFetch` 调用的 `streamAnthropic`（API 类型为 `"anthropic-messages"`），以及 `packages/ai/src/providers/google-auth.ts` 中的 ADC 认证。传输使用 HTTPS REST / SSE，采用应用默认凭据（ADC OAuth Bearer token）或 Vertex Express Mode API 密钥（`x-goog-api-key`）。

### 特殊处理 \{#special-casings-6}

- **端点与项目/位置解析**：在 ADC 模式下（`packages/ai/src/providers/google-vertex.ts`），请求 URL 遵循 `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model.id}:streamGenerateContent?alt=sse`。`project` 从 `options.project`、`$env.GOOGLE_CLOUD_PROJECT`、`$env.GCP_PROJECT` 或 `$env.GCLOUD_PROJECT` 解析（缺失则抛出 `ConfigurationError`）。`location` 从 `options.location`、`$env.GOOGLE_VERTEX_LOCATION`、`$env.GOOGLE_CLOUD_LOCATION` 或 `$env.VERTEX_LOCATION` 解析（缺失则抛出 `ConfigurationError`）。在 Express Mode 下（通过 `options.apiKey` 或 `$env.GOOGLE_CLOUD_API_KEY` 使用 API 密钥模式），URL 遵循 `https://${host}/v1/publishers/google/models/${model.id}:streamGenerateContent?alt=sse`，携带 `x-goog-api-key` 标头，`location` 默认为 `"global"`；如果环境中的区域主机失败，则回退到全局端点。
- **端点主机解析**：`packages/catalog/src/hosts.ts` 中的 `resolveVertexEndpointHost(location)` 将位置映射到主机名：`"global"` → `aiplatform.googleapis.com`；多区域 `"eu"` / `"us"` → `aiplatform.{location}.rep.googleapis.com`（防止标准插值导致 404）；区域（例如 `"us-central1"`、`"europe-west4"`）→ `${location}-aiplatform.googleapis.com`。
- **函数调用与响应 ID 剥离**：`packages/ai/src/providers/google-shared.ts` 中的 `supportsFunctionPartId(model)` 对 `google-vertex` 返回 `false`。`convertMessages` 在传输序列化之前显式删除 `part.functionCall.id` 和 `functionResponsePart.functionResponse.id`，因为函数部分包含 `id` 字段时，Vertex AI 会返回 `400 INVALID_ARGUMENT`。
- **安全设置默认值**：如果未配置，`packages/ai/src/providers/google-vertex.ts` 中的 `streamGoogleVertex` 会向 `params.config.safetySettings` 自动注入禁用所有危害类别的安全设置（将 `HARM_CATEGORY_HATE_SPEECH`、`HARM_CATEGORY_DANGEROUS_CONTENT`、`HARM_CATEGORY_SEXUALLY_EXPLICIT`、`HARM_CATEGORY_HARASSMENT` 设为 `threshold: "OFF"`）。
- **服务层级优先级标头**：Vertex 忽略直接放在请求体中的 `serviceTier` 字段；`options.serviceTier === "priority"` 作为请求标头 `X-Vertex-AI-LLM-Shared-Request-Type: priority` 传输（`google-vertex.ts`）。`flex` 没有文档规定的控制方式，不产生作用。
- **缓存内容透传**：将调用方提供的 `cachedContent` 资源名称不加解析地传入 `params.config.cachedContent`（`google-shared.ts`），绕过创建/刷新生命周期。

### 流行为 \{#stream-behavior-6}

- **Gemini 流式执行**：委托给 `packages/ai/src/providers/google-shared.ts` 中的 `streamGoogleGenAI` 和 `consumeGoogleStream`。处理 SSE 块解析、文本/思考块聚合（`thoughtSignature`）、工具调用 ID 合成（Vertex 省略 ID 时生成）和结束原因。
- **Vertex 上 Anthropic 的 RawPredict 处理**：`packages/ai/src/stream.ts` 中的 `isGoogleVertexAuthenticatedModel` 匹配 `model.provider === "google-vertex"`、`anthropic-messages` API 及 `:streamRawPredict` baseUrl。请求使用 `apiKey: "vertex-adc"` 和 `createVertexAuthenticatedFetch`，通过 `streamAnthropic` 路由。
- **Anthropic 请求重写**：`packages/ai/src/stream.ts` 中的 `createVertexAuthenticatedFetch` 调用 `resolveVertexRequest`，替换 URL 中的 `{project}` 和 `{location}` 占位符，将 `:streamRawPredict/v1/messages` 路径规范化为 `:streamRawPredict`，并应用 `transformVertexAnthropicBody` 剥离 `payload.model`（已编码在 URL 路径中），向 JSON 请求体注入 `payload.anthropic_version = "vertex-2023-10-16"`。
- **Anthropic 推理强度 beta 门控**：Vertex `rawPredict` 会以 400 错误拒绝 `anthropic-beta` HTTP 标头。在 `packages/ai/src/providers/anthropic.ts` 中，对于 `model.provider === "google-vertex"`，会通过门控关闭 `effortBeta`（`effort-2025-11-24`）、`contextManagementBeta` 和 `output_config.effort` 字段。`anthropic.ts` 中的回退载荷也会清除 Vertex 请求上的 `output_config.effort`（#5614）。

### 认证与用量 \{#auth--usage-6}

- **ADC 解析阶梯**：`packages/ai/src/providers/google-auth.ts` 按优先级顺序解析凭据：
   1. 指向 JSON 凭据文件的 `GOOGLE_APPLICATION_CREDENTIALS` 环境变量。支持 `type: "service_account"`（通过 WebCrypto `crypto.subtle` 签署的 RS256 JWT 断言，在 `https://oauth2.googleapis.com/token` 交换）、`type: "authorized_user"`（刷新 token 交换）或 `type: "impersonated_service_account"`（先交换源凭据，再调用 GCP IAM `generateAccessToken`）。
   2. 用户 ADC 文件 `~/.config/gcloud/application_default_credentials.json`（`authorized_user` 流程）。
   3. GCE / Cloud Run 元数据服务器（`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`）。
- **显式访问 token 覆盖**：`GOOGLE_CLOUD_ACCESS_TOKEN` 或 `CLOUDSDK_AUTH_ACCESS_TOKEN` 环境变量完全绕过文件/元数据查找和缓存。
- **Token 缓存与进行中请求去重**：访问 token 存储在以解析出的来源为键的 `tokenCache`（Map）中，并在到期前 `GOOGLE_VERTEX_REFRESH_SKEW_MS`（默认 60s）刷新。并发解析请求共享 `inflight` Map 中单个进行中的 promise，受 `SHARED_TOKEN_RESOLVE_TIMEOUT_MS`（30s）限制。各调用方通过 `raceWithSignal` 使其中止信号与共享 promise 竞争，使一个调用方的中止不会取消批量解析。请求的 OAuth 作用域为：`https://www.googleapis.com/auth/cloud-platform`。
- **用量与 token 规范化**：`packages/ai/src/providers/google-shared.ts` 中的 `consumeGoogleStream` 从响应提取 `usageMetadata`：`input` 计算为 `promptTokenCount - cachedContentTokenCount`，`output` 为 `candidatesTokenCount + thoughtsTokenCount`，`cacheRead` 为 `cachedContentTokenCount`，`reasoningTokens` 为 `thoughtsTokenCount`。将规范化用量传给 `calculateCost(model, output.usage)`。

### 目录模型处理 \{#catalog-model-handling-6}

- **模型提供方条目（`google-vertex`）**：`packages/catalog/src/compat/rules/providers/google-vertex.kdl` 声明默认模型为 `gemini-3.1-pro-preview`。模型管理允许未经认证的访问。

* **目录 API 解析**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `resolveGoogleVertexApi` 将 `@ai-sdk/google-vertex/anthropic` npm 包模型路由到 `api: "anthropic-messages"`，使用 `GOOGLE_VERTEX_ANTHROPIC_BASE_URL`（`https://{location}-aiplatform.googleapis.com/v1/projects/{project}/locations/{location}/publishers/anthropic/models/{model}:streamRawPredict`）。ID 含斜杠的模型或 `@ai-sdk/openai-compatible` 路由到 `api: "openai-completions"`。所有其他模型路由到 `api: "google-vertex"`，使用 `GOOGLE_VERTEX_BASE_URL`（`https://{location}-aiplatform.googleapis.com`）。
* **注册表凭据防护**：通过 `env hook="google-vertex-adc"`（`packages/ai/src/registry/hooks/env.ts`）声明于 `packages/catalog/src/compat/rules/auth/google-vertex.kdl`。如果设置了 `$env.GOOGLE_CLOUD_API_KEY`，则返回该值；或者，如果存在 ADC 凭据（`hasVertexAdcCredentials()`）并且存在项目环境变量（`GOOGLE_CLOUD_PROJECT`/`GCP_PROJECT`/`GCLOUD_PROJECT`）和位置环境变量（`GOOGLE_VERTEX_LOCATION`/`GOOGLE_CLOUD_LOCATION`/`VERTEX_LOCATION`），则返回 `AUTHENTICATED_SENTINEL`（`"<authenticated>"`）。否则返回 `undefined`，防止模型在缺少适当认证的情况下出现在目录列表中。

## Amazon Bedrock \{#amazon-bedrock}

Amazon Bedrock（`amazon-bedrock` 模型提供方，`bedrock-converse-stream` API）通过使用 AWS SigV4 签名或显式 Bearer token 的 HTTPS POST 请求，直接与 `bedrock-runtime.{region}.amazonaws.com/model/{modelId}/converse-stream` 通信，解码二进制 `application/vnd.amazon.eventstream` 响应。实现绕过了重量级 AWS SDK 依赖（`@aws-sdk/*`、`@smithy/*`），执行由 WebCrypto 签名、经轻量事件流解析器解码的原生 fetch。入口模块包括 `packages/ai/src/providers/amazon-bedrock.ts`（`streamBedrock`）、`packages/ai/src/registry/amazon-bedrock.ts`（`amazonBedrockTransport`）、`packages/catalog/src/compat/rules/auth/amazon-bedrock.kdl` 中的认证策略、`packages/ai/src/registry/aws.ts`、`packages/ai/src/providers/aws-credentials.ts`（`resolveAwsCredentials`）、`packages/ai/src/providers/aws-eventstream.ts`（`decodeEventStream`）和 `packages/ai/src/providers/aws-sigv4.ts`（`signRequest`）。

### 特殊处理 \{#special-casings-7}

`packages/catalog/src/compat/rules/providers/amazon-bedrock.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 anthropic、系列 opus、修订版本 >=4.6.0 <4.7.0：`thinking.mode="anthropic-adaptive"`。
- 对于类别 anthropic、修订版本 >=4.7.0 <5.1.0：`streamIdleTimeoutMs=900000`、`thinking.efforts=["low","medium","high","max"]`。
- 对于类别 anthropic、修订版本 >=5.1.0：`thinking.efforts=["low","medium","high","xhigh","max"]`。
- 对于类别 xai、系列 grok、修订版本 >=4.6.0：`thinking.mode="effort"`、`thinking.efforts=["low","medium","high","xhigh"]`。
- 对于类别 openai：`thinking.mode="effort"`。
- 对于类别 deepseek：`requiresReasoningContentForAllAssistantTurns=true`、`thinking.efforts=["minimal","low","medium","high"]`。
- 对于类别 minimax、系列 m2：`thinking.mode="budget"`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="budget"`。
- 对于模型 moonshot.kimi-k2-thinking：`thinking.requiresEffort=true`。
- 模型提供方默认值：`streamRevision="possible"`。

- **Converse API 载荷与消息映射**：请求构建 `ConverseStreamRequest`，包含 `messages`、`system`、`inferenceConfig`（`maxTokens`、`temperature`、`topP`）、`toolConfig` 和 `additionalModelRequestFields`。系统提示词规范化为带文本块和 `CachePoint` 标记（`{ cachePoint: { type: "default", ttl?: "1h" } }`）的 `SystemContent[]`。用户内容映射为 `text`、`image`（通过 `createImageBlock` 生成的 `jpeg`/`png`/`gif`/`webp` base64）、`toolResult` 或 `cachePoint`。Bedrock 要求将连续的工具结果块合并到单个 `user` 角色的 `WireMessage` 中（`convertMessages` 循环合并相邻的 `toolResult` 轮次）。空文本块和空内容数组会被过滤，以避免 HTTP 400 验证失败。
- **Anthropic Messages 路由（`/anthropic`）**：此模型提供方下的 `anthropic-messages` 模型通过 Anthropic 传输而非 Converse，发送到 `https://bedrock-runtime.{region}.amazonaws.com/anthropic`。该路由拒绝工具 `strict` 字段，以及任何不符合 Bedrock 请求元数据模式的 `metadata.user_id`。`compat.bedrockMessagesApi`（根据 `baseUrl` 检测，可在 `models.yml` 中覆盖）使 Anthropic 传输在任何 `onPayload` 钩子之后，丢弃 `strict` 并使元数据符合该模式（`fitBedrockAnthropicPayload`，`packages/ai/src/providers/bedrock-anthropic.ts`）。它支持按需上下文压缩。参见[模型](./models.md#claude-on-bedrocks-anthropic-messages-api-anthropic)。
- **Converse 上下文压缩**：Bedrock 专用于上下文压缩的流式 Runtime 路由及退出方式见[上下文压缩](./compaction.md#summary-generation)。
- **NO_TOOLS_SENTINEL（`__no_tools__`）**：Bedrock 会验证，任何包含先前 `toolUse` 或 `toolResult` 块的请求都必须提供 `toolConfig`。当某轮带有工具历史，但工具被禁用（`toolChoice: "none"`）或为空时，`planToolConfig` 注入占位工具 `NO_TOOLS_SENTINEL`（`name: "__no_tools__"`，虚拟模式）。每请求标志 `sentinelInjected` 跟踪注入情况（因此调用方名为 `__no_tools__` 的工具仍正常工作）。当 `sentinelInjected` 为 true 时，`handleContentBlockStart` 忽略合成工具使用开始事件，`messageStop` 将 `stopReason: "tool_use"` 降级为 `"stop"`。
- **思考与推理（`additionalModelRequestFields`）**：
   - `anthropic-adaptive` 模型（Claude Opus 4.7+、Sonnet/Opus 5、Fable/Mythos 5）：通过 `mapEffortToAnthropicAdaptiveEffort` 映射为 `{ thinking: { type: "adaptive", display? }, output_config: { effort } }`。在支持 display 的模型上，`thinkingDisplay` 默认为 `"summarized"`，以避免 Anthropic 的 `"omitted"` 默认值造成静默推理流（问题 #1373）。
   - 预算模式模型（例如 Claude 3.7 / 4.6）：映射为 `{ thinking: { type: "enabled", budget_tokens, display }, anthropic_beta? }`。当 `interleavedThinking` 为 true 时，设置 `anthropic_beta: ["interleaved-thinking-2025-05-14"]`。
   - 强制工具选择冲突：当 `toolChoice` 强制执行工具（`any` 或指定名称的 `{ tool: { name } }`）时，Bedrock 拒绝思考。强制工具选择启用时，`streamBedrock` 清除 `additionalModelRequestFields`。
   - 思考签名与降级：Claude 模型（支持签名的传输模型）上没有 `thinkingSignature` 的助手思考块通过 `renderDemotedThinking` 降级为文本。非 Claude 模型（Nova、Titan、Llama、Mistral）拒绝思考签名，并接收未签名的 `reasoningContent`。
- **区域与推理配置档案解析**：`resolveBedrockRegion` 按顺序解析运行时区域：显式 `options.region` -> ARN 内嵌区域（`inferRegionFromBedrockArn`）-> 环境/配置档案区域（`resolveAwsAmbientRegion`）。对于带地理前缀的跨区域推理配置档案（`us.`、`us-gov.`、`eu.`、`apac.`、`au.`、`jp.`），`regionServesGeo` 验证环境区域兼容性；环境区域不匹配或缺失时，回退到地理默认端点（`INFERENCE_PROFILE_GEO_DEFAULT_REGION`：`us` -> `us-east-1`、`us-gov` -> `us-gov-west-1`、`eu` -> `eu-west-1`、`apac` -> `ap-southeast-1`、`au` -> `ap-southeast-2`、`jp` -> `ap-northeast-1`）。`global.` 配置档案使用环境区域或 `us-east-1`。

### 流行为 \{#stream-behavior-7}

- **AWS 事件流二进制解码**：以大端整数分帧（`[total len u32][headers len u32][prelude CRC u32][headers][payload][message CRC u32]`）。`packages/ai/src/providers/aws-eventstream.ts` 中的 `decodeMessage` 检查总长度（至少 16 字节），通过 `Bun.hash.crc32(bytes) >>> 0`（`crc32`）计算 IEEE 802.3 CRC32，并验证前导部分（前 8 字节）和消息 CRC（整个帧减去 4 字节）。标头解析器（`parseHeaders`）读取带类型的标头（bool、byte、short、int、long、byte-array、string、timestamp、uuid）。`decodeEventStream` 使用可增长的 Uint8Array 缓冲区，从 `ReadableStream<Uint8Array>` 产出消息，并在中止时取消读取器锁。
- **事件分派与错误处理**：携带 `:message-type = "event"` 的流消息进行如下分派：
   - `messageStart`：验证 `role === "assistant"` 并推送流 `start`。
   - `contentBlockStart`：推送 `toolcall_start`（跳过哨兵）。
   - `contentBlockDelta`：推送 `text_delta`（若不存在则创建文本块）、`toolcall_delta`（在 `kStreamingPartialJson` 中累积 JSON 输入增量，通过 `parseStreamingJsonThrottled` 节流）或 `thinking_delta`（累积推理文本和签名）。
   - `contentBlockStop`：通过 `parseStreamingJson` 解析工具 JSON，并推送 `text_end`/`thinking_end`/`toolcall_end`。
   - `messageStop`：映射 `stopReason`（`end_turn`/`stop_sequence` -> `stop`、`max_tokens`/`model_context_window_exceeded` -> `length`、`tool_use` -> `toolUse`）。
   - `metadata`：提取用量（`inputTokens`、`outputTokens`、`cacheReadInputTokens`、`cacheWriteInputTokens`）并调用 `calculateCost`。
   - `:message-type = "exception"` 提取 `:exception-type` 和错误载荷，以抛出 `BedrockApiError`（400）。`:message-type = "error"` 提取 `:error-code` 和 `:error-message`。

### 认证与用量 \{#auth--usage-7}

- **双认证模式**：
   - Bearer token：如果存在 `options.bearerToken`、`options.apiKey` 或 `$env.AWS_BEARER_TOKEN_BEDROCK`（`resolveAwsBearerToken`），则设置 `Authorization: Bearer <token>` 并绕过 SigV4 签名。
   - AWS SigV4 签名：`signRequest`（`packages/ai/src/providers/aws-sigv4.ts`）使用 WebCrypto（`crypto.subtle`）签署标头。计算 SHA-256 载荷摘要（`x-amz-content-sha256`）、日期（`x-amz-date`）、主机和安全 token（`x-amz-security-token`）。派生 HMAC-SHA256 签名密钥链（`AWS4` + `secretAccessKey` -> `kDate` -> `kRegion` -> `kService`（“bedrock”）-> `kSigning`）。
- **5 层凭据解析链**：`resolveAwsCredentials`（`packages/ai/src/providers/aws-credentials.ts`）按 `profile\0region\0config` 键缓存解析后的凭据，刷新提前量为 60s（`REFRESH_SKEW_MS`），并对进行中的解析进行 single-flight 去重，受 30s 超时（`SHARED_RESOLVE_TIMEOUT_MS`）限制。链的优先级：
   1. 环境变量：`AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、可选的 `AWS_SESSION_TOKEN`。
   2. Web Identity / OIDC：`AWS_WEB_IDENTITY_TOKEN_FILE`、`AWS_ROLE_ARN`、`AWS_ROLE_SESSION_NAME`。在 `sts.{region}.amazonaws.com` 上调用 STS `AssumeRoleWithWebIdentity`。
   3. 共享配置 / 配置档案（`~/.aws/credentials`、`~/.aws/config`，通过 `parseAwsIni` 解析）：静态密钥（文件会话 token 的 TTL 通过 `FILE_SESSION_CREDS_TTL_MS` 限制为 5 min）、AWS SSO（`sso_account_id`、`sso_role_name`、旧版 `sso_start_url`/`sso_region` 或 `sso-session` 块；从 `~/.aws/sso/cache/*.json` 读取缓存 token，并调用 `portal.sso.{ssoRegion}.amazonaws.com/federation/credentials`）或 `credential_process`（使用 POSIX 分词 `tokenizeCredentialProcessCommand` 启动外部进程；Windows `.cmd`/`.bat` 通过 `cmd.exe /c` 路由；预期为 Version 1 JSON 封装）。
   4. ECS / 容器：`AWS_CONTAINER_CREDENTIALS_RELATIVE_URI`（位于 `http://169.254.170.2/`）或 `AWS_CONTAINER_CREDENTIALS_FULL_URI`，携带可选的认证 token/文件。
   5. EC2 IMDSv2：`169.254.169.254`（或 IPv6 `[fd00:ec2::254]`），从 `latest/api/token` 请求 PUT token，超时为 1s（`IMDS_TIMEOUT_MS`）。
- **缓存失效与注册表状态**：收到 401/403 HTTP 响应时，`streamBedrock` 调用 `invalidateAwsCredentialCache({ profile, region })` 丢弃缓存凭据，使后续轮次重新解析新凭据。`packages/catalog/src/compat/rules/auth/amazon-bedrock.kdl` 中的认证解析（`env hook="aws-bedrock"`）求值 `hasAwsCredentialSource()`（`packages/ai/src/registry/aws.ts`），在存在有效凭据或环境 token 时返回 `AUTHENTICATED_SENTINEL`。

### 目录模型处理 \{#catalog-model-handling-7}

- **模型提供方条目（`amazon-bedrock`）**：`packages/catalog/src/compat/rules/providers/amazon-bedrock.kdl` 声明默认模型为 `us.anthropic.claude-opus-5-5`。
- **models.dev 映射与跨区域配置档案**：`MODELS_DEV_PROVIDER_DESCRIPTORS`（`packages/catalog/src/provider-models/openai-compat.ts`）将 `modelsDevKey: "amazon-bedrock"` 映射到 API `bedrock-converse-stream`。`bedrockCrossRegionId` 为匹配的模型添加 `global.` 或 `us.` 前缀。对于 `anthropic.claude-*` 模型，`transformModel` 自动生成 EU（`eu.`）和 AWS GovCloud（`us-gov.`）跨区域推理配置档案规格变体。非工具模型和旧版模型（`ai21.jamba`、`titan-text-express`、`mistral-7b`）被过滤掉。

## Amazon Bedrock Mantle \{#amazon-bedrock-mantle}

Amazon Bedrock Mantle 是 AWS 的网关端点，通过 OpenAI Responses API（`openai-responses`）协议而非 Bedrock 原生 Converse JSON 传输（`amazon-bedrock`），提供 OpenAI 兼容模型（例如 `openai.gpt-5.4`、`openai.gpt-5.5`，以及 `openai.gpt-5.6` 的 Luna/Sol/Terra 变体）。请求使用 OpenAI Responses API 载荷（`/responses`），发往区域插值端点（`https://bedrock-mantle.{region}.api.aws/openai/v1`）。入口模块为 `packages/ai/src/providers/bedrock-mantle.ts`、`packages/ai/src/registry/bedrock-mantle.ts`，目录设置位于 `packages/catalog/src/provider-models/openai-compat.ts`。

### 特殊处理 \{#special-casings-8}

`packages/catalog/src/compat/rules/providers/bedrock-mantle.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 unknown：`thinking.mode="effort"`。
- 对于模型 openai.gpt-5.4、openai.gpt-5.5：`thinking.efforts=["low","medium","high","xhigh"]`。
- 对于模型 openai.gpt-5.6*：`thinking.efforts=["low","medium","high","xhigh","max"]`。

- **端点结构**：与标准 Bedrock Converse 端点（`bedrock-runtime.{region}.amazonaws.com`）不同，Mantle 请求发往 `https://bedrock-mantle.{region}.api.aws/openai/v1`。`model.baseUrl` 中的 `{region}` 模板占位符在请求准备时，由 `prepareBedrockMantleRequest`（`packages/ai/src/providers/bedrock-mantle.ts`）动态替换。
- **Anthropic Messages 路由**：Mantle 还通过 Anthropic Messages API，在 `https://bedrock-mantle.{region}.api.aws/anthropic` 提供 Claude（模型 ID 如 `anthropic.claude-opus-5-5`）。配置于该处的 `anthropic-messages` 模型使用 Anthropic 传输。此路由拒绝工具 `strict` 字段（与 bedrock-runtime 一样，在 `compat.bedrockMessagesApi` 下丢弃），验证思考签名，并支持按需上下文压缩。参见[模型](./models.md#claude-on-bedrocks-anthropic-messages-api-anthropic)。
- **原生上下文压缩**：此路由上的 `openai-responses` 模型默认使用 OpenAI 原生上下文压缩（V2 流式 `compaction_trigger`，然后是 V1 `/responses/compact`），由 `isBedrockOpenAIUrl`（`packages/catalog/src/hosts.ts`）检测。仅对于这些 Bedrock URL，上下文压缩请求会先运行 `prepareBedrockCompactionRequest`（`packages/agent/src/compaction/bedrock.ts`），应用模型提供方钩子，使 `{region}` 和 Bearer/SigV4 认证与正常轮次匹配；其他模型提供方的上下文压缩请求保留各自的传输。`enabled: false` 禁用两种方法；`v2StreamingEnabled: false` 仅禁用 V2。参见[上下文压缩](./compaction.md)。
- **区域解析层次**：`resolveAwsRegion`（`packages/ai/src/utils/aws-profile.ts`）中的区域替换按顺序求值：显式 `providerOptions.region` -> `AWS_REGION` -> `AWS_DEFAULT_REGION` -> `~/.aws/config` 中活动 AWS 共享配置档案的区域（`resolveAwsProfileRegion`）-> 回退默认值 `"us-east-1"`。
- **401/403 凭据失效**：在 `createSignedFetch`（`packages/ai/src/providers/bedrock-mantle.ts`）中使用 SigV4 签名请求时，HTTP 401 或 403 响应触发 `invalidateAwsCredentialCache({ profile, region })`（`packages/ai/src/providers/aws-credentials.ts`），使后续尝试从配置档案、环境或 STS 角色重新解析新凭据。
- **注册表哨兵与认证标志**：`packages/catalog/src/compat/rules/auth/bedrock-mantle.kdl` 设置 `allows-missing-api-key #true` 和 `env hook="aws-bedrock-mantle"`（传输位于 `packages/ai/src/registry/bedrock-mantle.ts`）。当存在环境 AWS 凭据（`packages/ai/src/registry/aws.ts` 中的 `hasAwsCredentialSource`）时，`resolveAwsRegistryApiKey` 返回 `AUTHENTICATED_SENTINEL`。`resolveAwsBearerToken` 剥离该哨兵值，因此除非存在实际 Bearer token，否则会选择 SigV4 认证。

### 流行为 \{#stream-behavior-8}

- **传输**：委托给 `openai-responses` 模型提供方流水线（`packages/ai/src/providers/openai-responses.ts`），消费 `response.created`、`response.text.delta`、`response.output_item.added` 和 `response.completed` 等 SSE 流事件。
- **错误处理**：非 2xx SSE 流将错误状态码传回流结果处理器；401/403 状态码会在 `createSignedFetch` 中使缓存的 AWS 凭据状态失效。

### 认证与用量 \{#auth--usage-8}

- **双认证模式**：
   - **Bearer token**：由 `resolveBearerToken`（`packages/ai/src/providers/bedrock-mantle.ts`）求值。提供 `AWS_BEARER_TOKEN_BEDROCK`、`providerOptions.bearerToken` 或显式的非哨兵 `apiKey` 时启用。`createBedrockMantleAuthenticatedFetch` 注入 `Authorization: Bearer <token>`。
   - **AWS SigV4 签名**：不存在 Bearer token，但环境凭据通过 `hasAwsCredentialSource` 时启用。请求标头由 `signRequest`（`packages/ai/src/providers/aws-sigv4.ts`）使用服务名称 `"bedrock-mantle"` 签名，设置 `Authorization: AWS4-HMAC-SHA256 ...` 和 `x-amz-security-token`（使用会话凭据时）。
- **认证优先级**：两者均可用时，Bearer token 优先于 SigV4 签名。
- **用量跟踪**：输入、输出、缓存和推理 token 用量由 `openai-responses` 直接从标准 OpenAI Responses 传输载荷解析（`usage.input_tokens`、`usage.output_tokens`、`usage.input_tokens_details.cached_tokens`、`usage.output_token_details.reasoning_tokens`）。

### 目录模型处理 \{#catalog-model-handling-8}

- **模型提供方条目（`bedrock-mantle`）**：`packages/catalog/src/compat/rules/providers/bedrock-mantle.kdl` 声明默认模型为 `openai.gpt-5.6-terra`。环境密钥：`AWS_BEARER_TOKEN_BEDROCK`。
- **发现替换**：成功的权威发现替换回退模型提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`openai.gpt-5.4`、`openai.gpt-5.5`、`openai.gpt-5.6-luna`、`openai.gpt-5.6-sol`、`openai.gpt-5.6-terra`；打包策略为 `always`。限制、能力和价格与这些行一起编写。
- **经认证的模型发现**：
   - `packages/ai/src/registry/bedrock-mantle.ts` 中的 `prepareModelDiscovery` 需要有效 Bearer token（`resolveAwsBearerToken`）。如果未认证或仅有 SigV4，则返回 `authenticated: false`，并绕过发现。
   - 经认证后，发现会剥离 `/openai/v1`，通过 `fetchOpenAICompatibleModels` 调用 `https://bedrock-mantle.{region}.api.aws/v1/models`。
- **权威动态模型替换**：`bedrockMantleModelManagerOptions` 中的 `dynamicModelsAuthoritative: true` 使成功的动态发现响应完全**替换**静态种子，移除未对该 AWS 账号/token 启用的模型。
- **参考属性合并**：`mapWithBundledReference` 将静态定义的费用、思考配置和上下文窗口合并到匹配 `BEDROCK_MANTLE_MODEL_BY_ID` 的动态发现模型定义上。

## Kimi Code \{#kimi-code}

Kimi Code（中国大陆使用 `kimi-code`，全球 kimi.ai 部署使用 `kimi-code-global`）和 Moonshot（`moonshot`）通过双传输执行方式，包装 OpenAI 兼容聊天补全（`/coding/v1/chat/completions`）和 Anthropic 兼容消息（`/coding/v1/messages`），提供对 Moonshot AI 模型系列的访问。入口为 `packages/ai/src/providers/kimi.ts`（`streamKimi`）和 `packages/ai/src/providers/openai-anthropic-shim.ts`（`streamOpenAIAnthropicShim`），模型发现与目录描述符配置位于 `packages/catalog/src/provider-models/descriptors.ts` 和 `packages/catalog/src/provider-models/openai-compat.ts`。

### 特殊处理 \{#special-casings-9}

`packages/catalog/src/compat/rules/providers/kimi-code.kdl` 和 `kimi-code-global.kdl` 中的模型提供方专有覆盖（两者相同；更具体的选择器覆盖模型提供方默认值）：

- 对于类别 kimi、系列 k3：`thinkingFormat="openai"`。
- 对于类别 kimi：`thinkingFormat="zai"`。
- 对于类别 unknown：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="kimi"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 kimi-for*：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 模型提供方默认值：`kimiApiFormat="anthropic"`、`supportsPromptCacheKey=true`、`thinking.mode="effort"`、`streamMarkupHealingPattern="kimi"`。

`packages/catalog/src/compat/rules/providers/moonshot.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 kimi、系列 k3：`thinkingFormat="openai"`。
- 对于类别 kimi：`thinkingFormat="zai"`、`thinking.mode="effort"`。

- **双传输路由**：`streamKimi` 委托给 `packages/ai/src/providers/openai-anthropic-shim.ts` 中的 `streamOpenAIAnthropicShim`，从 `model.compat.kimiApiFormat` 或 `KimiOptions` 中显式的 `options.format` 选择格式。
   - `anthropic`：以 `api: "anthropic-messages"` 重建模型规格，通过 `model.baseUrl.replace(/\/v1\/?$/, "")` 调整基础 URL（`https://api.kimi.com/coding`；`kimi-code-global` 为 `https://api.kimi.ai/coding`），注入 `getKimiCommonHeaders()`，将思考格式映射为 `anthropic-adaptive`，通过 `ANTHROPIC_THINKING` 计算 token 预算，并通过 `streamAnthropic` 进行流式传输。
   - `openai`：保留 `model.baseUrl`（`https://api.kimi.com/coding/v1`；`kimi-code-global` 为 `https://api.kimi.ai/coding/v1`），注入 `getKimiCommonHeaders()`，传递 `reasoning` 强度，并通过 `streamOpenAICompletions` 进行流式传输。
- **轮次与 token 不变量**：
   - `packages/catalog/src/compat/resolve.ts` 中的 `alwaysSendMaxTokens: isKimiModel`：Kimi 根据 `max_tokens` 而不是实际输出的 token 计算速率限制（TPM），要求每个请求都显式指定最大 token 数。
   - `requiresReasoningContentForToolCalls`：对于非 OpenCode 模型提供方上的 Kimi 模型为 true（`packages/catalog/src/compat/resolve.ts`）。在后续思考请求中，先前的助手工具调用轮次必须携带 `reasoning_content`；缺少原始推理时，允许合成占位符 `"."`（`allowsSyntheticReasoningContentForToolCalls`）。
   - `requiresAssistantContentForToolCalls`：强制助手工具调用轮次包含非空文本内容。

### 流行为 \{#stream-behavior-9}

- **带内控制标签与思考扫描**：`packages/ai/src/dialect/kimi.ts` 中的 `KimiInbandScanner` 处理原始输出流中的类 XML 工具控制标签（`<|tool_calls_section_begin|>`、`<|tool_call_begin|>`、`<|tool_call_argument_begin|>`、`<|tool_call_end|>`、`<|tool_calls_section_end|>`）和 `<think>...</think>` 思考块，发出结构化 `InbandScanEvent` 事件（`text`、`thinkingStart`、`thinkingDelta`、`thinkingEnd`、`toolStart`、`toolEnd`）。
- **空闲看门狗超时**：对于原生 K2.7 Code 模型，`streamIdleTimeoutMs` 下限延长为 300s（`packages/catalog/src/compat/resolve.ts`），防止长时间初始推理生成期间流过早中止。

### 认证与用量 \{#auth--usage-9}

- **设备 OAuth 流程**：在 `packages/catalog/src/compat/rules/auth/kimi-code.kdl` 和 `kimi-code-global.kdl` 中声明为 `login "device-code"` 规则（`packages/ai/src/registry/engine/device-code.ts`），标头钩子位于 `packages/ai/src/registry/oauth/kimi.ts`。使用 OAuth 2.0 设备授权（`urn:ietf:params:oauth:grant-type:device_code`），客户端 ID 为 `17e5f671-d194-4dfb-9706-5516cb48c098`，面向主机 `${resolveOAuthHost()}`（大陆为 `https://auth.kimi.com`，可通过 `KIMI_CODE_OAUTH_HOST` 或 `KIMI_OAUTH_HOST` 配置；全球为 `https://auth.kimi.ai`，优先遵循 `KIMI_GLOBAL_OAUTH_HOST` / `KIMI_GLOBAL_AUTH_HOST`，然后才是共享覆盖）。
   - 通过 `POST /api/oauth/device_authorization` 发起，用 `userCode` 和 `verificationUriComplete` 提示用户，并轮询 `POST /api/oauth/token`，在 `authorization_pending` 和 `slow_down` 时退避。Token 刷新使用 `grant_type: "refresh_token"`。
- **指纹标头与设备 ID**：`packages/ai/src/registry/oauth/kimi.ts` 中的 `getKimiCommonHeaders()` 注入设备跟踪标头：`User-Agent: KimiCLI/<ver>`、`X-Msh-Platform: kimi_cli`、`X-Msh-Version`、`X-Msh-Device-Name`、`X-Msh-Device-Model`、`X-Msh-Os-Version` 和 `X-Msh-Device-Id`。`getDeviceId` 将随机十六进制 UUID 持久保存到 `path.join(getAgentDir(), "kimi-device-id")`（模式 0600），或回退为临时进程 UUID。
- **用量与配额跟踪器**：`packages/ai/src/usage/kimi.ts` 中的 `kimiUsageProvider` / `kimiGlobalUsageProvider` 使用 OAuth 访问 token 或作为 Bearer token 的 API 密钥凭据，加上 `getKimiCommonHeaders()`，请求模型提供方区域主机上的 `GET /coding/v1/usages`（`https://api.kimi.com/coding/v1/usages`，可通过 `KIMI_CODE_BASE_URL` 配置；`kimi-code-global` 为 `https://api.kimi.ai/coding/v1/usages`）。
   - OAuth 凭据过期时短路返回（`credential.expiresAt <= nowMs`）。解析 `KimiUsagePayload`：将 `usage` 对象映射为 `Total quota` 汇总行，将 `limits` 数组（提取 `detail` 和 `window` 的 duration/timeUnit）映射为 `UsageLimit` 条目，通过 `parseResetTime`（`reset_at`、`resetTime`、`ttl`）解析重置时间戳。

### 目录模型处理 \{#catalog-model-handling-9}

- **模型提供方条目（`kimi-code`、`kimi-code-global`）**：`packages/catalog/src/compat/rules/providers/kimi-code.kdl` 和 `kimi-code-global.kdl` 声明默认模型为 `kimi-for-coding`。环境密钥：`KIMI_API_KEY`（`kimi-code` 的模型提供方级密钥）和 `KIMI_CODE_GLOBAL_API_KEY`（`kimi-code-global` 的模型提供方级密钥）；Moonshot 不使用这两者。
- **模型提供方条目（`moonshot`）**：`packages/catalog/src/compat/rules/providers/moonshot.kdl` 声明默认模型为 `kimi-k2.7-code`。环境密钥：`MOONSHOT_API_KEY`。
- **K2.x 与 K3 的推理差异**：
   - **K2.x**：原生 Moonshot K2.x 模型通过 `packages/catalog/src/compat/resolve.ts` 中的 `thinkingFormat: "zai"` 使用二元思考（`thinking: { type: "enabled" | "disabled" }`）。在 `moonshotModelManagerOptions` 中配置为 4 级推理强度范围 `[Minimal, Low, Medium, High]`。K2.6 保留完整思考上下文（`thinkingKeep: "all"`）。
   - **K3**：K3 模型使用 OpenAI 风格的 `reasoning_effort`（`thinkingFormat: "openai"`）。配置为 3 级传输尺度 `[low, high, max]`、`defaultLevel: Effort.Max` 和强制推理（`thinking.requiresEffort: true`）。`moonshotModelManagerOptions` 设定 1M 上下文窗口、131,072 maxTokens 和视觉输入（`["text", "image"]`）。

## Ollama \{#ollama}

Ollama 集成包含 `packages/ai` 中两个不同的模型提供方定义：`ollama` 用于本地 Ollama 实例（使用 `openai-responses` 或 `openai-completions` API，`baseUrl` 指向本地端点 `/v1`，默认为 `http://127.0.0.1:11434/v1`）；`ollama-cloud` 用于 Ollama Cloud（使用位于 `https://ollama.com/api/chat` 的原生 `ollama-chat` API 传输）。入口模块为负责原生流式处理的 `packages/ai/src/providers/ollama.ts`、负责本地 Ollama 目录选项（`ollamaModelManagerOptions`）的 `packages/catalog/src/provider-models/openai-compat.ts`，以及负责 Ollama Cloud 目录选项（`ollamaCloudModelManagerOptions`）的 `packages/catalog/src/provider-models/ollama.ts`。

### 特殊处理 \{#special-casings-10}

`packages/catalog/src/compat/rules/providers/ollama.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 模型提供方默认值：`emptyLengthFinishIsContextError=true`、`thinking.efforts=["low","medium","high","max"]`。

`packages/catalog/src/compat/rules/providers/ollama-cloud.kdl` 中的模型提供方专有覆盖（更具体的选择器覆盖模型提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 deepseek-v4-pro:preview：`thinking.efforts=["low","high","max"]`。
- 对于模型 glm-4*、glm-5、glm-5.1：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 glm-5.2：`thinking.efforts=["high","max"]`。
- 模型提供方默认值：`thinking.mode="effort"`。

- **传输路由**：本地 `ollama` 默认使用 OpenAI 兼容路径（`openai-responses` / `openai-completions`），而 `ollama-cloud` 使用原生 `ollama-chat` 协议。
- **工具选择模拟**：`packages/ai/src/providers/ollama.ts` 中的 `selectToolsForToolChoice` 在请求选择特定命名工具（`{ type: "function", function: { name } }` 或 `{ name }`）时，手动将 `context.tools` 过滤到仅保留目标工具。`toolChoice` 映射将 `"none"` 映射为 `"none"`，将 `"required"`/`"any"`/命名对象映射为 `"required"`，将 `"auto"` 映射为 `undefined`。
- **Developer 角色与历史清理**：Developer 系统提示词如果是初始系统提示词或归属于智能体，就保持在 Ollama 的 `system` 角色上；但归属于用户的 developer 轮次会降级为 `user`，以保持前缀缓存稳定。如果不存在 `user` 角色，`convertMessages` 会将最后一个系统轮次降级为 `user`，防止 Ollama 不生成输出就发出 `done_reason: "load"`。对于 `ollama-cloud`，助手历史消息中的 `thinking` 字段会被剥离（`convertMessages`），因为 Ollama Cloud 会以 HTTP 400 拒绝携带 `thinking` 的传入历史。
- **模式清理**：工具模式通过 `sanitizeSchemaForOllama(toolWireSchema(tool))` 处理，以确保兼容性。
- **模型加载 / `keep_alive` 与错误重写**：当请求不包含用户轮次或 Ollama 生成零 token 时，Ollama 返回 `done_reason: "load"`，映射为 stopReason `"error"`，并带有 `EMPTY_OLLAMA_LOAD_COMPLETION_MESSAGE`。来自本地 llama.cpp 后端的格式错误工具调用 JSON 错误（HTTP 500），由 `packages/ai/src/error/format.ts` 中的 `rewriteOllamaToolCallJsonError` 重写。`shouldRetryOllamaResponse` 重试 5xx 错误，除非匹配 `LLAMA_CPP_TOOL_CALL_PARSE_PATTERN`。

### 流行为 \{#stream-behavior-10}

- **NDJSON / JSONL 事件协议**：原生 `ollama-chat` 流式传输 NDJSON 块，通过 `readJsonl<OllamaChatChunk>` 解析。
- **推理与内容处理**：推理块以 `chunk.message.thinking` 到达（产出 `thinking_start`、`thinking_delta`、`thinking_end`）。内容文本以 `chunk.message.content` 到达。结构化工具调用以 `chunk.message.tool_calls` 到达。
- **流标记修复**：流标记修复（使用 `getStreamMarkupHealingPattern` 的 `StreamMarkupHealing`）用于恢复文本通道中的工具调用和推理。当存在原生 `chunk.message.thinking` 时，将 `suppressHealedThinking` 设为 `true`，避免重复计算推理块。
- **结束原因映射**：`mapDoneReason` 映射 `done_reason`：`"length"` -> `"length"`、`"tool_calls"` -> `"toolUse"`、`"load"` -> `"error"`，以及带工具调用的 `undefined` -> `"toolUse"`。产生工具调用时，自然结束的 `stop` 会提升为 `"toolUse"`。
- **看门狗与本地预填充**：通过 `armPreResponseTimeout` 以 `firstEventTimeoutMs`（由 `PI_STREAM_FIRST_EVENT_TIMEOUT_MS` 或 `idleTimeoutMs` 派生）启用响应前超时，同时向 `fetchWithRetry` 传递 `timeout: false`，避免繁重本地预填充期间 Bun fetch 过早超时中止。重试使用延迟 `[2000, 5000, 10000]`。
- **空补全重试**：`streamOllama` 由 `withReplaySafeStreamRetry` 包装，以透明重试仅含 EOS 的空补全。

### 认证与用量 \{#auth--usage-10}

- **凭据来源**：在 `packages/catalog/src/compat/rules/auth/ollama.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入可选 API 密钥（`allowEmpty: true`），默认在本地不使用认证；声明的环境变量为 `envVars: ["OLLAMA_API_KEY"]`。`packages/catalog/src/compat/rules/auth/ollama-cloud.kdl` 要求使用在 `https://ollama.com/settings/keys` 创建的 API 密钥，配置为 `envVars: ["OLLAMA_CLOUD_API_KEY"]`。
- **认证标头**：本地请求在提供密钥时附加 `Authorization: Bearer ${apiKey}`；`ollama-cloud` 要求 `Authorization: Bearer ${apiKey}`。
- **用量与配额**：配额跟踪通过 `packages/ai/src/usage/ollama.ts` 中的 `ollamaUsageProvider` 和 `ollamaCloudUsageProvider` 注册。两者均不提供独立的用量/配额 API（`validatesCredentials: false`、空 `limits`），而是依赖流完成块中返回的每响应 `prompt_eval_count`（输入）和 `eval_count`（输出）。

### 目录模型处理 \{#catalog-model-handling-10}

- **模型提供方条目（`ollama`）**：`packages/catalog/src/compat/rules/providers/ollama.kdl` 声明默认模型为 `gpt-oss:20b`。环境密钥：`OLLAMA_API_KEY`。模型管理允许未经认证的访问。
- **模型提供方条目（`ollama-cloud`）**：`packages/catalog/src/compat/rules/providers/ollama-cloud.kdl` 声明默认模型为 `gpt-oss:120b`。环境密钥：`OLLAMA_CLOUD_API_KEY`。
- **本地目录发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `ollamaModelManagerOptions` 首先尝试在 `/v1/models` 调用 `fetchOpenAICompatibleModels`。如果不可用，则回退为查询 `/api/tags` 的原生 `fetchOllamaNativeModels`。
- **云目录发现**：`packages/catalog/src/provider-models/ollama.ts` 中的 `ollamaCloudModelManagerOptions` 使用 `OLLAMA_CLOUD_API_KEY` 查询 `https://ollama.com` 上的 `/api/tags`。
- **通过 `/api/show` 检测上下文长度与能力**：本地和云发现均针对每个模型查询 Ollama 的 `/api/show`，以检查 `model_info` 和 `capabilities`。
   - 上下文长度从以 `.context_length`、`.num_ctx` 或 `.context_window` 结尾的 `model_info` 键提取。回退上下文窗口为 `128_000`（`OLLAMA_FALLBACK_CONTEXT_WINDOW`）。
   - 能力设定：`capabilities.includes("thinking")` 设置 `reasoning: true` 并配置 `thinking` 推理强度配置（`[minimal, low, medium, high]`）。`capabilities.includes("vision")` 设定 `input: ["text", "image"]`。
- **输出 token 上限限制**：Ollama Cloud 对 DeepSeek V4 Pro/Flash 模型（`isOllamaCloudOutputCapped`）实施 `OLLAMA_CLOUD_MAX_OUTPUT_TOKENS = 65_536`。`ollamaCloudModelManagerOptions` 将 `maxTokens` 限制为 `min(contextWindow, 65536)` 并设置 `omitMaxOutputTokens: true`。`packages/ai/src/providers/ollama.ts` 中的 `createChatBody` 进一步将传输载荷上的 `num_predict` 限制为 `65_536`。
- **缓存模型提供方 ID**：由 `packages/catalog/src/provider-models/cache-provider-id.ts` 中的 `resolveModelCacheProviderId` 解析，对 `ollama` 使用 `http://127.0.0.1:11434` 或端点哈希。

## Cursor \{#cursor}

`packages/ai` 中的 Cursor 集成通过 HTTP/2 Connect RPC 传输（`/agent.v1.AgentService/Run`）运行，发送带长度前缀的二进制 Protobuf 消息（`AgentClientMessage` 和 `AgentServerMessage`）。主要实现入口包括：负责连接生命周期、Connect 消息流式传输与帧分派的 `packages/ai/src/providers/cursor.ts`；负责纯参数与路径转换的 `packages/ai/src/providers/cursor-pi-args.ts`；负责本地工具结果帧构建器的 `packages/ai/src/providers/cursor/exec-modern.ts`；`packages/catalog/src/compat/rules/auth/cursor.kdl`（`login "custom" hook="cursor"`）中的认证策略，以及负责 PKCE 浏览器认证与 token 刷新的 `packages/ai/src/registry/oauth/cursor.ts`；负责多端点配额跟踪的 `packages/ai/src/usage/cursor.ts`；以及负责 Connect RPC 模型发现的 `packages/catalog/src/discovery/cursor.ts`。

### 特殊处理 \{#special-casings-11}

- **纯参数转换（`cursor-pi-args.ts`）**：路径与参数格式化函数（`piReadPath`、`piReadPathHasRange`、`piReadDisplayPath`、`piGrepSkip`、`piJoinPath`、`piLsPath`、`piEscapeRegexLiteral`、`piLimit`、`piTimeout`）严格保持与 Protobuf 导入无关，使旧版适配层可以共享它们，而不将 protobuf 模式打包进虚拟注册表。
- **拒绝空 Grep 模式**：`pattern` 为空而 `glob` 非空的 `grepArgs` 帧会预先被拒绝（`emptyGrepPatternRejection`），并给出说明性错误，促使模型重试或切换工具，而不是在块持久化之后触发本地工具失败。
- **原生工具与 `SoftToolRequirement` 的相互作用**：
   - 构建 `requestContext` MCP 工具定义时，会省略原生工具（`CURSOR_NATIVE_TOOL_NAMES`：`bash`、`read`、`write`、`delete`、`ls`、`grep`、`todo`）。
   - **外部执行器（auth-gateway）**：每个上下文工具，包括原生名称，均作为 MCP 宣告，并为该次运行发送 `x-cursor-agent-allowed-tools: mcp_tool_call,get_mcp_tools_tool_call`。因此，Cursor 的内置工具（文件、shell、编辑、todo、网页获取、SCM）无法通过网关使用；客户端自身的工具替代它们。
   - **例外**：只要宣告 pi-agent 工具，`buildMcpToolDefinitions` 就会显式重新包含 `bash`，尽管它是 Cursor 原生工具名称。暂存预览（例如 `ast_edit`）通过 `bash` 运行 `resolve` 或 `reject` 命令来最终确定；Cursor 原生目录可能不提供 shell 路径，因此如果不重新包含 `bash`，暂存预览就永远无法得到解决，`SoftToolRequirement('bash')` 升级会中止该轮。
- **`rootPromptMessagesJson` 与 Blob 存储**：
   - `buildGrpcRequest` 将对话历史作为 SHA-256 二进制 blob ID（`blobStore`）传入 `rootPromptMessagesJson` 和 `turns`。
   - 系统提示词作为各自独立的 JSON blob 存储（`buildCursorSystemPromptJsons`），使得仅下游提示词变化时，可以独立命中服务器端前缀 blob 缓存。
- **思考重放**：
   - 完成的轮次会将 Cursor 服务器在该次运行自身的用户消息之后为它写入的记录（助手与工具记录，连同推理、签名和已脱敏推理）保留为 `cursorHistory` `providerPayload`（`captureCursorHistoryPayload`），前提是该轮最后一个检查点在其所有输出和工具结果之后，并且捕获时，起始用户消息和每个已存储工具结果仍与该轮开始时、每次主机回调运行前取得的指纹匹配（因此，主机的原地编辑或回调之后的编辑都算在内）；摘要在主机已存储每个结果之后计算，包括服务器拥有的工具结果。之后，在相同传输路由上发往相同模型提供方和模型的请求，只要该轮起始用户消息、内容及配对工具结果仍与该摘要匹配，就会逐字节回送这些记录（`resolveCursorRecordReplays`）；其他模型或路由的轮次，以及用户消息、内容或结果此后被重写的轮次（裁剪、snapcompact、编辑、秘密脱敏、恢复时截断结果），则根据内容重建。
   - 传输路由（`cursorWireRoute`）是 `onPayload` 之后实际发送的 Run 请求的所请求模型 ID、模型详情 ID、max 模式和参数：规范化请求永不复用已发现回退模型的记录，并且重试发往不同路由的轮次不会被捕获。当钩子改变重放记录的请求路由时，钩子保持构建时原样的每个历史字段（`rootPromptMessagesJson`、`turns`，通过钩子之前取得的字节指纹比较）都会按发送路由重建；钩子编辑过的字段按钩子留下的状态发出。
   - 重建的轮次不携带推理，例外是没有可用记录的同模型 Kimi K3 轮次（`canReplayCursorThinking`、`assertCursorKimiK3HistoryReplayable`）。外来或隐藏的推理会被省略，防止将非 Cursor 思考块泄漏到原生对话轮次中。

### 流行为 \{#stream-behavior-11}

- **带长度前缀的 Connect 分帧**：
   - Connect HTTP/2 流使用 5 字节标头（1 字节标志 + 4 字节大端 uint32 载荷长度）。
   - `CONNECT_END_STREAM_FLAG`（`0b00000010`）标记携带 JSON 错误对象的终止帧（`parseConnectEndStream`）。
- **尾部标头与传输错误处理**：
   - 监控 HTTP/2 尾部标头（`grpc-status`、`grpc-message`），并使用 `mapH2TransportError` 映射套接字或 TLS 断连。
- **双向 RPC 分派**：
   - 服务器流式发送 `AgentServerMessage`（`interactionUpdate`、`execServerMessage`、`kvServerMessage`、`interactionQuery`）。
   - 客户端写入 `AgentClientMessage`（`runRequest`、每 5 秒周期性发送的 `clientHeartbeat`、交互查询响应）和 `ExecClientMessage` 工具响应（读取、写入、错误和请求上下文结果）。
- **交互查询握手**：
   - 托管网页搜索 / Exa / 未命名的字段 9 WebFetch 发送 `interactionQuery`，并阻塞该轮，直到客户端写入交互查询响应。
   - 心跳使 HTTP/2 保持存活，但不代表语义进展；未答复的查询会一直静默，直到触发 300s 空闲看门狗（`Provider stream stalled while waiting for the next event`）。
   - `handleInteractionQuery` 批准网络权限门控，拒绝交互式询问 / 切换模式 / 创建计划。VM 设置不予答复，因为其结果 oneof 只支持成功。
- **异步执行排空与轮次完成**：
   - `handleServerMessage` 异步处理帧，使套接字持续排空。分派在 `inFlightDispatches` 中跟踪，并在最终完成流之前受 `options.signal` 中止处理约束。
   - 流完成会验证 `turnEnded`（`sawTurnEnded`），否则抛出 `incomplete-stream`。
- **工具调用合成**：
   - `synthesizeCursorExecToolCall` 在助手输出消息上生成供展示的 `toolCall` 块，在 UI 和会话记录中反映本地工具执行。
   - 在标记了 `externalToolExecutor`（auth-gateway）的流上，没有本地处理器的 MCP 帧会合成**不带** `kCursorExecResolved` 的块，并且不配对任何结果：网关客户端是执行器，`isClientToolUse` 只为未解决的调用报告交接。
- **外部执行器中继（`CursorParkedRun`）**：
   - 当存在可用于停驻的 `providerSessionState`（auth-gateway 总会传入）且采用 HTTP/2 传输时，这样的 MCP 帧会被暂扣、不予答复，而不是交接。Cursor 在模型输出调用时发送该调用的 `toolCallStarted` 和 `mcpArgs` 执行帧，然后在该步骤调用全部列出后发送 `InteractionUpdate.tool_requests_listed`（字段 27，`ToolRequestsListedUpdate { call_count }`）。当每个已列出的调用都被暂扣时（Cursor 自行处理、没有执行帧的调用也计为已列出），响应以 `toolUse` 结束，该次运行停驻在 `providerSessionState["cursor-agent-relay"]` 下，流和心跳保持开启。Cursor 也可以逐个运行步骤中的调用，只在前一个调用得到答复后才发送下一个调用的执行帧和列表（在 Grok 上观察到），因此当 Cursor 在 1 s 内没有再发送任何内容（`CURSOR_RELAY_QUIET_MS`）时，暂扣的调用也会被交接；以这种方式答复的调用会计入该步骤的列表。
   - 当模型、传输模型 ID 和对话 ID 不变，并且客户端下一请求的历史以助手消息加上每个暂扣调用恰好一个 `toolResult` 结束时，该请求会恢复运行（Cursor 调用 ID 在该次运行内唯一；不比较系统提示词和工具，因为客户端可能在请求之间重新渲染它们，而该次运行与直接运行一样，保留开始时的目录）。这些结果以 `mcpResult`（本地 MCP 处理器结果所采用的形状）形式在带内写入，运行继续流式输出到新响应中；不发送 Run 请求。停驻期间到达的帧（KV 和心跳除外）会重放到该响应中。
   - 其他任何情况都会回退为根据历史重建该轮：不续接该运行的请求会取消它，30 分钟没有续接请求（`CURSOR_RELAY_IDLE_TIMEOUT_MS`）、会话被逐出或关闭（`close()`），以及停驻期间传输结束，也都会取消它。恢复请求的中止信号会取消运行；使其停驻的请求不再能取消它。
   - 停驻的运行保留开启它的凭据。如果恢复请求的网关选中了另一个账号（轮询、认证重试），它仍由原账号处理，因此该轮用量归于原账号。
   - 中继轮次的记录横跨多个助手消息，因此没有任何一个消息携带重放 `providerPayload`。其 `TurnEndedUpdate` 输出计数覆盖每个响应，因此最后一个响应报告该计数减去此前响应的输出。
   - 中继响应只有在 MCP 调用的执行帧被暂扣后才会流式输出该调用。在此之前，调用的 `toolCallStarted` 和 `partialToolCall` 参数文本不进入流，也不进入消息（`BlockState.unheldExternalCalls`）：网关的流式路由（Anthropic Messages、Chat Completions）在每个调用流式输出时将其传给客户端，客户端运行收到的每个调用，而流式输出的调用无法撤回。暂扣的调用随后整体发出：其开始、以一个增量形式发送的参数（执行帧的参数，合并并覆盖已流式输出的内容），以及结束。步骤交接时已宣告但尚未暂扣的调用，会在暂扣它的响应中发出。

### 认证与用量 \{#auth--usage-11}

- **凭据与标头**：
   - 通过在 `Authorization: Bearer <token>` 中发送的 `CURSOR_ACCESS_TOKEN` 认证。
   - 客户端标头：`x-ghost-mode: true`、`x-cursor-client-version: cli-2026.07.23-e383d2b`、`x-cursor-client-type: cli`、`x-request-id`。
- **PKCE OAuth 与轮询**：
   - 深层链接 PKCE 登录生成 verifier/challenge，并重定向到 `https://cursor.com/loginDeepControl`。
   - 按指数退避轮询 `https://api2.cursor.sh/auth/poll?uuid=...&verifier=...`（延迟 1s 至 10s，最多 150 次尝试）。
   - 刷新按 Cursor IDE 的方式续期登录会话：向 `https://api2.cursor.sh/oauth/token` 发送 POST，使用 IDE 客户端 ID 的 `refresh_token` 授权。续期的会话 token 同时作为访问和刷新凭据；`shouldLogout: true` 表示会话结束，该行被禁用。
   - 登录以及任何仍缺少账号邮箱的凭据刷新，都会从 `https://cursor.com/api/auth/me` 记录账号邮箱（`fetchCursorAccountEmail`），使账号策略和 `/session pin` 可以按名称标识该账号；查找失败时，凭据不带邮箱仍可使用。
- **用量与配额跟踪（`packages/ai/src/usage/cursor.ts`）**：
   - 从 `https://api2.cursor.sh/auth/usage` 获取标准配额（`parseCursorUsage`）。
   - 对带有 WorkOS 用户会话（`WorkosCursorSessionToken=${userId}::${accessToken}`）的 OAuth 凭据，从 `https://cursor.com/api/usage-summary` 获取个人用量（`parseCursorIndividualUsage`），并从 `https://cursor.com/api/auth/me` 获取用户配置档案邮箱。
- **轮次用量核算（`packages/ai/src/providers/cursor.ts`）**：
   - `tokenDelta` 帧累积滚动输出估计值；`TurnEndedUpdate` 随后报告该轮最终的 `input`/`output`/`cache_read`/`cache_write`/`reasoning` 计数器，每个报告的类别都会替换该估计值。没有计数器的帧会保留估计值。
   - `conversationCheckpointUpdate.tokenDetails.usedTokens` 是整个对话的占用量，存入 `usage.contextTokens`，独立于输出估计值；上下文压缩、交接和溢出检测据此确定上下文大小。

### 目录模型处理 \{#catalog-model-handling-11}

- **模型提供方条目（`cursor`）**：`packages/catalog/src/compat/rules/providers/cursor.kdl` 声明默认模型为 `claude-opus-5-high`。环境密钥：`CURSOR_ACCESS_TOKEN`。
- **缓存模型提供方 ID（`packages/catalog/src/provider-models/cache-provider-id.ts`）**：
   - 返回 `"cursor:max-mode-v3"`，以确保上下文窗口缓存失效。
- **模型发现（`packages/catalog/src/discovery/cursor.ts`）**：
   - `fetchCursorUsableModels` 通过 Connect RPC 调用 `GetUsableModels`（`/agent.v1.AgentService/GetUsableModels`）。
   - 根据 `details.maxMode` 设置 `cursorMaxMode`，指定 `api: "cursor-agent"`，映射 1M 的 max 模式上下文窗口和 200k 默认上下文窗口，并将 `maxTokens` 默认为 64,000。
   - 动态发现与 `models.json` 中打包的参考模型合并。

## Devin \{#devin}

Devin 集成（`devin-agent` API）通过 HTTP/1.1，使用 Connect 协议及 gRPC/Protobuf 消息与 Codeium Cascade 后端服务通信。其实现分布于 `packages/ai/src/providers/devin.ts` 中的模型提供方流逻辑（`streamDevin`、`DEVIN_API_URL`）、`packages/catalog/src/compat/rules/auth/devin.kdl` 中的认证策略（`login "oauth-code"` 规则，`packages/ai/src/registry/engine/oauth-code.ts`），以及位于 `packages/catalog/src/discovery/devin-gen/exa/*` 的 Connect protobuf 模式。

### 特殊处理 \{#special-casings-12}

- **Connect 二进制协议与帧包装：**传输通过 HTTP/1.1 使用 Connect 协议，目标为 `https://server.codeium.com`。请求载荷是序列化的 Protobuf（`GetChatMessageRequestSchema`），经 gzip 压缩后，包裹在 5 字节 Connect 流式二进制帧标头中（`CONNECT_COMPRESSED_FLAG = 0x01`，4 字节大端载荷长度）。流结束帧携带 `CONNECT_END_STREAM_FLAG = 0x02`，附带 JSON 错误尾部信息（`readConnectTrailerError`）。
- **帧大小防护：**`streamDevin` 中的读取器实施 16MB 帧载荷上限（`MAX_CONNECT_FRAME_PAYLOAD`），在缓冲之前拒绝损坏的帧长度标头。
- **消息格式映射：**系统提示词经规范化（`normalizeSystemPrompts`）后进入顶层 `prompt` 字段。消息在 `buildChatMessagePrompts` 中格式化：
   - 用户/developer 消息映射为 `ChatMessageSource.USER`，带有确定性消息 ID（`cascadeId\0index\0role`）。
   - 助手消息映射为 `ChatMessageSource.SYSTEM`，包含文本、`thinking`、`signature` 和 `toolCalls`。原生 Devin 助手轮次保留 `responseId`，或回退为 `bot-<uuid>`。
   - 工具结果映射为 `ChatMessageSource.TOOL`，包含 `toolCallId` 和 `toolResultIsError`。
- **会话线程化与停止模式：**会话线程化将 `options.conversationId` 或 `options.sessionId` 作为 `cascadeId` 传递。默认停止模式包括 `<|user|>`、`<|bot|>`、`<|context_request|>`、`<|endoftext|>` 和 `<|end_of_turn|>`（`DEVIN_DEFAULT_STOP_PATTERNS`）。工具选择指定 `auto` 选择和临时系统提示词缓存（`CacheControlType.EPHEMERAL`）；`disableParallelToolCalls` 与目录的 `compat.supportsParallelToolCalls` 互为反值，因此原生允许并行工具的配置可以使用并行工具。
- **路由器分配：**带有 `compat.modelRouter`（目前为 `adaptive`）的目录配置是服务器端分派器，不是有效的 `chatModelUid`。聊天之前，`assignDevinModel` 使用当前用户/developer 提示词和该轮的 `cascadeId` 调用 `AssignModel`，然后在匹配的 `GetChatMessage` 请求上发送返回的 `modelUid` 和 `modelAssignmentJwt`。缺少分配会导致该轮失败；响应的 `actualModelUid` 通过 `AssistantMessage.upstreamModel` 呈现。

### 流行为 \{#stream-behavior-12}

- **Protobuf 帧流式传输：**`streamDevin` 读取分块响应字节，解析 5 字节 Connect 标头。解压后的二进制载荷解码为 `GetChatMessageResponseSchema`。
- **不透明错误恢复（`invalid_argument`）：**带有 `invalid_argument` 错误码的流结束尾部信息（例如“发生内部错误”）会在 `streamDevin` 中触发历史恢复。当符合条件的历史请求大小超过 512KB（`LARGE_HISTORY_RECOVERY_BYTES`）时，错误被重新分类为 `AIError.Flag.ContextOverflow`，以调用自动上下文裁剪，而不是作为无效请求失败。
- **事件流转换：**
   - `deltaThinking` -> `thinking_start` / `thinking_delta`（签名从 `deltaSignature` 填入）。
   - `deltaText` -> `text_start` / `text_delta`。
   - `deltaToolCalls` -> `toolcall_start` / `toolcall_delta`。
- **流式工具参数节流：**流中途的参数解析使用 `parseStreamingJsonThrottled`（`toolLastParseLen`），对流式 JSON 增量保持 O(N) 性能，然后在 `toolcall_end` 时执行权威 `parseStreamingJson` 解析。
- **停止原因解析：**将 `StopReason.MAX_TOKENS` 映射为 `length`，将活动工具调用映射为 `toolUse`，默认为 `stop`。

### 认证与用量 \{#auth--usage-12}

- **双认证生命周期：**
   - **凭据编码：**`devinCliMetadata`/`devinDiscoveryMetadata`（`packages/catalog/src/wire/devin.ts`）根据已存储凭据的形状编码，而不考虑存储种类：`devin-session-token$...` 密钥保持原样，裸 JWT 形状会话 token 加上前缀，其他所有密钥（旧版 Windsurf Enterprise `sk-ws-...`，加前缀会被拒绝）均原样发送。每个 RPC 都使用这一种编码，不进行重试。
   - **JWT 交换：**`fetchDevinAuthMetadata` 使用 `MetadataSchema` 内的 `apiKey`，向 `/exa.auth_pb.AuthService/GetUserJwt` 发送初始 Connect 请求（`GetUserJwtRequestSchema`）。服务器返回 `userJwt`（以及可选的服务器基础 URL 覆盖），包含在后续聊天请求元数据中。
- **CLI OAuth 流程：**在 `packages/catalog/src/compat/rules/auth/devin.kdl` 中声明为 `login "oauth-code"` 规则（`packages/ai/src/registry/engine/oauth-code.ts`），使用 `https://app.devin.ai/auth/cli/continue` 执行 PKCE OAuth 流程。Token 在 `https://api.devin.ai/auth/cli/token` 交换，到期时间从 JWT 载荷派生，或默认回退为 1 年。
- **用量呈现：**流式响应帧包含 token 计数（`msg.usage`：`inputTokens`、`outputTokens`、`cacheReadTokens`、`cacheWriteTokens`），直接送入 `calculateCost(model, output.usage)`；此外还包含通过 `usage.credits` 呈现的额度计量（`creditCost`、`committedCreditCost`、`committedAcuCost`）。账号套餐与余额报告使用 `devinUsageProvider`（`packages/ai/src/usage/devin.ts`），它以原生 CLI 身份调用 `SeatManagementService/GetUserStatus`，将 prompt/flow/flex 额度类别、带日期的每日/每周配额窗口、套餐层级、超额余额和账号/组织身份映射到 `/usage`。按额度计费的套餐省略不带日期的百分比窗口，以免呈现为耗尽的配额。

### 目录模型处理 \{#catalog-model-handling-12}

- **模型提供方条目（`devin`）**：`packages/catalog/src/compat/rules/providers/devin.kdl` 声明默认模型为 `swe-1-6`，这是启动时的回退值。发现结果到达后，结果所报告的账号默认值（`defaultOverrideModelConfig`，标记为 `isProviderDefault`）转而成为模型提供方默认值。当某个推理强度路由到该通道（服务器系列元数据或静态归并表）时，其系列从该传输ID和推理强度起始；其他任何通道，例如不思考的 `off` 通道，都以自身默认值作为系列起点。环境密钥：`DEVIN_API_KEY`。
- **发现替换**：成功的权威发现替换回退模型提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`swe-1-6`；打包策略为 `always`。限制、能力和价格与此行一起编写。
- **丢弃 Fusion 配对**：跳过 `fusion-<lead>-sidekick-<sidekick>` uid（`isDevinFusionPairing`）。原生客户端在本地配对 sidekick；omp 只运行 lead，因此每种配对都会在一个固定推理强度上重复其 lead。
- **`/fast` 下的快速通道**：归并后，`foldDevinFastLanes` 将每个 `<id>-fast` 行（Claude `-fast`、GPT `-priority`、SWE `-lightning` uid）折叠到 `<id>` 中，作为 `priorityLane`：每个推理强度的标准传输 uid → 快速传输 uid，以及该通道的价格卡，`buildModel` 按通道 ID 的规则为其定价。这些行构成 `devin` 服务层级系列；`priority` 层级（`/fast`）使 `streamDevin` 发送路由后的 uid、按通道价格卡计费，并报告 `serviceTier: "priority"`。

* **动态发现：**`packages/catalog/src/discovery/devin.ts` 中的 `fetchDevinModels` 使用来自 `packages/catalog/src/wire/devin.ts` 的原生 `chisel` 发现元数据及每个受支持展示槽，调用一元 Connect RPC `GetCliModelConfigs`（`/exa.api_server_pb.ApiServerService/GetCliModelConfigs`）。`normalizeDevinModels` 丢弃已禁用/内部配置，将 `ClientModelConfig` 转换为 `ModelSpec<"devin-agent">` 条目（上下文窗口取自 `ClientModelConfig.maxTokens`，否则取当前目录中携带该值的 `ModelInfo.maxTokens`，再否则为 200k；最大 token 数默认为 64k），并保留服务器提供的输出上限、定价维度、工具/并行工具/图像支持、描述，以及 `new`/`beta`/`recommended` 徽标。例外：`DEVIN_IMAGE_BLIND_UIDS` 从 `swe-1-6`/`swe-1-6-fast` 剥离图像模态，因为其配置宣告 `supports_images`，但后端静默丢弃 `ChatMessagePrompt.images` 字段（已在线验证；其他每个模型都会读取它）。状态为 200 但内容为空的目录响应会记录一条失效身份固定警告。路由器配置（`displayOption MODEL_ROUTER` 或 `isModelRouter`）保持独立，并带有 `compat.modelRouter`。

## Kiro \{#kiro}

原生 Kiro 模型提供方（`kiro-api`）从 Kiro API 流式接收 AWS 事件流帧。流和请求映射位于 `packages/ai/src/providers/kiro/`（`stream.ts`、`transform.ts`），登录位于 `packages/ai/src/registry/oauth/kiro.ts`，用量位于 `packages/ai/src/usage/kiro.ts`，发现位于 `packages/catalog/src/discovery/kiro.ts`，路由和凭据编解码器位于 `packages/catalog/src/wire/kiro.ts`。面向用户的设置见 [Kiro](./kiro.md)。

### 特殊处理 \{#special-casings-13}

- **请求身份**：每个请求（聊天、模型和配置档案发现、AWS 登录、Google/GitHub 登录）都使用与官方 Kiro CLI 3.2.0 相同的标头和服务目标。唯一有意设置的差异是 `x-amzn-codewhisperer-optout: true`：OMP 选择退出内容共享，而 CLI 默认选择参与。
- **工具结果字节预算**：每个工具结果限制为 800,000 个 UTF-8 字节（Kiro 的服务限制），末尾带有说明省略量的标记。请求预算为每 200,000 token 上下文窗口对应 850,000 字节。超出预算时，先按从旧到新的顺序将历史工具结果缩减到 25,000 字节，再缩减当前轮次结果（绝不低于 25,000 字节）。仍超预算的请求会报告为上下文溢出，使 OMP 进行上下文压缩。
- **关闭思考**：省略 `additionalModelRequestFields` 时，Kiro 应用模型的模式默认推理强度，因此关闭思考（包括 `disableReasoning` 和 `forceReasoningOff`）会发送宣告的关闭值：自适应 Claude 模式使用 `thinking.type: "disabled"`，GPT 模式使用 `reasoning.effort: "none"`。发现将这类模型标记为 `suppressWhenOff`；不带关闭值的模式标记为 `requiresEffort`，因此关闭思考会以最低推理强度运行。

### 流行为 \{#stream-behavior-13}

- **暂时性故障重试**：对于原因是 `INSUFFICIENT_MODEL_CAPACITY` 的 `ThrottlingError`（通过 HTTP 或作为流内异常）以及 HTTP 400 `ValidationException: Invalid tool use format.`，请求最多重试一次，使用相同请求体和新的请求 ID，并且仅在任何输出之前重试。已计费的请求绝不重放；其他每种失败均为终止性失败。
- **停止原因**：`MAX_TOKENS` 映射为 `length`，参数被截断的工具调用会被丢弃。`CONTENT_FILTERED` 会作为拒绝报告，包含服务的类别和说明，不进行重试。
- **上下文大小**：`contextUsageEvent` 百分比按模型上下文窗口缩放后，报告为上下文大小。
- **上下文溢出**：HTTP 413、Kiro 的 `CONTENT_LENGTH_EXCEEDS_THRESHOLD` 错误原因，以及任何包含 `Input is too long.` 的错误体（包括 HTTP 429），都会报告为上下文溢出，以便 OMP 对对话进行上下文压缩。

### 认证与用量 \{#auth--usage-13}

- **Token 用量**：用量仅来自 `metadataEvent.tokenUsage`；没有收到时，用量为零，绝不估算。

### 目录模型处理 \{#catalog-model-handling-13}

- **按凭据发现**：模型名单按凭据发现，绝不打包；默认模型为 `auto`。模型缓存按 OAuth 登录（登录 ID、配置档案、区域）划定作用域，或按 API 密钥和区域划定作用域。

## GitLab Duo \{#gitlab-duo}

GitLab Duo 在 OMP 中通过两个不同的提供方集成：**GitLab Duo Non-Agentic** (`gitlab-duo`) 使用标准 HTTP/SSE 子提供方，经 GitLab AI Gateway 代理 LLM 请求；**GitLab Duo Agent** (`gitlab-duo-agent`) 则通过基于 WebSocket 的智能体执行协议连接 GitLab Duo Workflow Service (DWS)。`gitlab-duo` 的入口模块是 `packages/ai/src/providers/gitlab-duo.ts` 和 `packages/catalog/src/compat/rules/auth/gitlab-duo.kdl`（OAuth 钩子位于 `packages/ai/src/registry/oauth/gitlab-duo.ts`）；`gitlab-duo-agent` 的实现在 `packages/ai/src/providers/gitlab-duo-workflow.ts`、`packages/catalog/src/compat/rules/auth/gitlab-duo-agent.kdl` 中，目录发现位于 `packages/catalog/src/discovery/gitlab-duo-workflow.ts`。

### 特殊处理 \{#special-casings-14}

- **`gitlab-duo` 模型路由与代理**：通过 `MODEL_MAPPINGS`（`packages/ai/src/providers/gitlab-duo.ts`）将 Duo 模型标识符（`duo-chat-opus-4-6`、`duo-chat-sonnet-4-6`、`duo-chat-gpt-5-1`、`duo-chat-gpt-5-codex` 等）映射到底层提供方类型（`anthropic` 或 `openai`）和 API 变体（`anthropic-messages`、`openai-completions`、`openai-responses`）。请求使用通过 `getDirectAccessToken` 交换得到的直接访问令牌，代理到 GitLab AI Gateway 端点（`https://cloud.gitlab.com/ai/v1/proxy/anthropic/` 或 `https://cloud.gitlab.com/ai/v1/proxy/openai/v1`）。
- **`gitlab-duo-agent` ChatML 目标生成**：将 OMP 对话历史（`context.messages`）转换为一个展平并渲染后的 ChatML 提示字符串（`packages/ai/src/providers/gitlab-duo-workflow.ts` 中的 `buildGitLabDuoWorkflowGoal`、`renderGitLabDuoWorkflowChatMl`、`buildGitLabDuoWorkflowInlineFlowConfig`）。其行为受 `gitlab-duo-workflow-chatml-note.md` 中的系统提示指令引导。
- **`gitlab-duo-agent` 内联流程规范**：发送一个环境内联工作流定义（`buildGitLabDuoWorkflowInlineFlowConfig`），其中包含名为 `"omp_agent"` 的 `AgentComponent`，在其模板中携带 OMP 的系统提示，并使用用户模板 `{{goal}}`，附带 UI 日志事件（`on_agent_reasoning`、`on_agent_final_answer`、`on_tool_execution_success`、`on_tool_execution_failed`）。
- **`gitlab-duo-agent` 字节预算与溢出**：强制执行目标字节限制（`GITLAB_DUO_WORKFLOW_GOAL_SOFT_OVERFLOW_BYTES` = 1MB，`GITLAB_DUO_WORKFLOW_GOAL_HARD_OVERFLOW_BYTES` = 2MB）。目标超限会触发溢出错误消息（`buildGitLabDuoWorkflowGoalOverflowMessage`），推动会话循环自动进行上下文压缩。
- **`gitlab-duo-agent` 工具执行协议**：将 OMP 工具映射为 MCP 工具定义（`buildGitLabDuoWorkflowMcpTools`、`GitLabMcpToolDefinition`），通过 `startRequest.mcpTools` 发送。通过 WebSocket 收到的工具调用请求（`runMCPTool`、`run_mcp_tool`）会被提取（`extractGitLabDuoWorkflowAction`），分派给 OMP 工具执行（`mapGitLabDuoWorkflowActionToOmpTool`、`emitGitLabDuoWorkflowActionToolCall`），再通过 `buildGitLabDuoWorkflowActionResponse` 返回。
- **`gitlab-duo-agent` 命名空间设置自动启用**：REST 设置过程通常会调用 `ensureGitLabDuoWorkflowSettings`，将 `buildGitLabDuoWorkflowSettingsBody` 提交到 `/api/v4/ai/duo_workflows/settings`，以启用所需的命名空间标志（`duo_workflow`、`duo_workflow_service`、`duo_agent_platform`）。

### 流式行为 \{#stream-behavior-14}

- **`gitlab-duo` 委托流式传输**：在 `streamGitLabDuo`（`packages/ai/src/providers/gitlab-duo.ts`）内直接调用 `streamAnthropic`、`streamOpenAICompletions` 或 `streamOpenAIResponses`，注入 Direct Access 请求头（`Authorization: Bearer <direct_access_token>`）后，原样转发底层 SSE 事件。
- **`gitlab-duo-agent` WebSocket 智能体循环**：通过 WebSocket 连接（`wss://<instance>/api/v4/ai/duo_workflows/ws` 或 DWS runway 主机 `buildGitLabDuoWorkflowWebSocketUrl`）。接收原始 JSON 事件，由 `parseGitLabDuoWorkflowSocketData` 解析，并在 `runGitLabDuoWorkflowSocket`（`packages/ai/src/providers/gitlab-duo-workflow.ts`）中处理。
- **`gitlab-duo-agent` 事件处理与推理**：提取工作流检查点（`extractGitLabDuoWorkflowCheckpoint`），发出增量文本（`emitGitLabDuoWorkflowText`）和从 `on_agent_reasoning` UI 日志事件得出的思维链推理（`emitGitLabDuoWorkflowThinking`）。
- **`gitlab-duo-agent` 审批与完成信号**：监视工作流审批状态（`isGitLabWorkflowApprovalStatus`：`PLAN_APPROVAL_REQUIRED`、`TOOL_CALL_APPROVAL_REQUIRED`）和完成状态（`isGitLabWorkflowCompletionStatus`：`INPUT_REQUIRED`、`FINISHED`）。
- **`gitlab-duo-agent` 超时与健康期限**：为 WebSocket 实现 90 秒空闲期限（`GITLAB_DUO_WORKFLOW_IDLE_TIMEOUT_MS`）。连接无活动会触发中止，并在现有 `workflowID` 上恢复。REST 设置调用受 30 秒超时约束（`GITLAB_DUO_WORKFLOW_REST_TIMEOUT_MS`）。
- **`gitlab-duo-agent` 有界重启**：
   - 步数超限：服务器报告达到最大步数限制（`isGitLabDuoWorkflowStepLimitMessage`）时，最多使用新工作流重启 4 次（`GITLAB_DUO_WORKFLOW_MAX_STEP_LIMIT_RESTARTS`）。
   - 通用错误：针对暂时性处理故障（`isGitLabDuoWorkflowGenericProcessingError`），最多重试 1 次（`GITLAB_DUO_WORKFLOW_MAX_GENERIC_ERROR_RETRIES`）。
   - 停滞检测：当 `detectGitLabDuoWorkflowStall` 在工具边界检测到检查点内容长度连续未变（`lastToolBoundaryContentLength`）时，最多重启 2 次（`GITLAB_DUO_WORKFLOW_MAX_STALL_RESTARTS`）。

### 身份验证与用量 \{#auth--usage-14}

- **`gitlab-duo` 身份验证**：支持通过 `GITLAB_TOKEN` 提供 PAT，或使用 `packages/catalog/src/compat/rules/auth/gitlab-duo.kdl` 中声明的 OAuth（`login "oauth-code"`，引擎为 `packages/ai/src/registry/engine/oauth-code.ts`），其缓存清理钩子位于 `packages/ai/src/registry/oauth/gitlab-duo.ts`。Direct Access 令牌通过 `POST /api/v4/ai/third_party_agents/direct_access` 获取，并携带 `DuoAgentPlatformNext: true`（`packages/ai/src/providers/gitlab-duo.ts` 中的 `getDirectAccessToken`），缓存 25 分钟（`DIRECT_ACCESS_TTL_MS`）。OAuth 使用 PKCE 和 KDL 客户端 ID（可通过 `GITLAB_CLIENT_ID` / `GITLAB_REDIRECT_URI` 覆盖），回调端口为 8080。
- **`gitlab-duo-agent` 身份验证**：接受通过 `GITLAB_TOKEN` 提供的 PAT，或使用 `packages/catalog/src/compat/rules/auth/gitlab-duo-agent.kdl` 中以 `login "oauth-code"` 规则声明的 OAuth（`packages/ai/src/registry/engine/oauth-code.ts`）。Direct Access 工作流令牌通过 `POST /api/v4/ai/duo_workflows/direct_access` 获取（`requestGitLabDuoWorkflowDirectAccess`）。OAuth 依赖官方 GitLab VS Code 客户端 ID（`GITLAB_DUO_WORKFLOW_OAUTH_CLIENT_ID = "36f2a70cddeb5a0889d4fd8295c241b7e9848e89cf9e599d0eed2d8e5350fbf5"`），重定向到 `vscode://gitlab.gitlab-workflow/authentication`（`pasteCodeFlow: true`）。
- **`gitlab-duo-agent` 协议请求头**：请求包含 `x-gitlab-client-type: node-websocket`、`x-gitlab-language-server-version: 8.104.0`，以及由 `buildGitLabDuoWorkflowWebSocketHeaders` 构造的资源作用域请求头（`x-gitlab-project-id`、`x-gitlab-namespace-id`、`x-gitlab-root-namespace-id`）。
- **用量跟踪**：两个提供方均不使用 `packages/ai/src/usage/` 下的模块。对于 `gitlab-duo-agent`，上下文占用量从服务器检查点遥测中提取（`extractGitLabDuoWorkflowContextUsage` 读取 `agent_context_usage`），优先采用 `"Chat Agent"` 和 `"context_builder"` 条目，并在 `applyGitLabDuoWorkflowContextUsage` 中应用于提示 token 估算。

### 目录模型处理 \{#catalog-model-handling-14}

- **提供方条目（`gitlab-duo`）**：`packages/catalog/src/compat/rules/providers/gitlab-duo.kdl` 声明默认模型为 `duo-chat-opus-4-6`。环境变量键：`GITLAB_TOKEN`。
- **提供方条目（`gitlab-duo-agent`）**：`packages/catalog/src/compat/rules/providers/gitlab-duo-agent.kdl` 声明默认模型为 `claude_sonnet_4_6_vertex`。环境变量键：`GITLAB_TOKEN`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`claude_sonnet_4_6_vertex`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **命名空间自动发现**：`discoverGitLabDuoWorkflowNamespace`（`packages/catalog/src/discovery/gitlab-duo-workflow.ts`）从显式覆盖、配置或工作区 Git 远程地址（`discoverGitLabDuoWorkflowProject`）定位根命名空间。通过 GraphQL 查询 `aiChatAvailableModels(rootNamespaceId:)`（`fetchGitLabDuoWorkflowModels`）发现模型。
- **上下文窗口解析**：`packages/catalog/src/discovery/gitlab-duo-workflow.ts` 中的 `resolveGitLabDuoWorkflowContextWindow` 根据模型引用推断上下文窗口大小（Claude Opus/Sonnet：1,000,000；Haiku：200,000；GPT-5：400,000；默认：200,000）。
- **缓存分区**：`gitLabDuoWorkflowModelCacheProviderId`（`packages/catalog/src/provider-models/special.ts`）通过对 `apiKey`、`baseUrl`、`namespaceId`、`projectId` 和工作区 `cwd` 做哈希，为动态目录缓存键分区。
- **目录生成规则**：`scripts/generate-models.ts` 将 `gitlab-duo-agent` 排除在静态生成发现之外，以免将单个账号的命名空间模型捆绑进静态目录；只将 `buildGitLabDuoWorkflowFallbackModel` 捆绑为通用后备种子。

## Pi Native \{#pi-native}

Pi Native 是一种无损的内部服务器/客户端传输协议，用于 pi-ai 客户端（例如容器化的 `omp` 或边车智能体槽位）将请求执行委托给持有真实提供方凭据的 `omp auth-gateway`。当 `Model` 设置 `transport: "pi-native"` 时启用，`packages/ai/src/stream.ts` 中的 `streamSimple` 会跳过本地提供方解析，将规范化的 `Context` 直接 POST 到 `/v1/pi/stream`。主要入口模块包括客户端的 `packages/ai/src/providers/pi-native-client.ts`（`streamPiNative`）、传输成帧侧的 `packages/ai/src/providers/pi-native-server.ts`（`parseRequest`、`encodeStream`、`formatError`），以及服务器端的 `packages/ai/src/auth-gateway/server.ts`（`POST /v1/pi/stream` 路由处理器）。

### 特殊处理 \{#special-casings-15}

- **无损透传且无方言**：与 OpenAI/Anthropic 路由不同，`pi-native` 不是文本工具调用方言（`docs/toolconv/pi-native.md`）。工具调用在 `Context` 和 `AssistantMessageEvent` 内仍是规范化的 pi-ai `ToolCall` 内容块。它保留 pi-ai 的一等字段（服务层级、缓存标记、思考预算、工具选择变体、图像块、工具调用 ID），不经过外部传输格式的量化。
- **传输请求与最小边界验证**：客户端向 `${model.baseUrl}/v1/pi/stream` POST `{ modelId: "${provider}/${id}", context, options, stream: true }`（`packages/ai/src/providers/pi-native-client.ts` 中的 `resolveStreamUrl`）。`packages/ai/src/providers/pi-native-server.ts` 中的 `parseRequest` 接受 `modelId`、`model.id` 或字符串形式的 `model`（支持 `streamProxy` 目标替换）。验证检查对象形状和数组（`context.messages`、可选的 `context.systemPrompt`、`context.tools`），消息/工具内部内容留到下游提供方执行时再验证。
- **选项允许列表与非传输键剥离**：服务器在 `packages/ai/src/providers/pi-native-server.ts` 的 `parseRequest` 中，按 `WIRE_OPTION_KEYS`（`packages/ai/src/auth-gateway/caller-options.ts` 中 `OPTION_TIERS` 的 `client` 和 `gateway` 层级）过滤 `options`，静默丢弃服务器所有的键和未知键，以兼容不同版本。客户端通过 `packages/ai/src/providers/pi-native-client.ts` 的 `buildWireOptions` 中的 `NON_WIRE_KEYS`，剥离运行时专用字段和值为函数的字段（`signal`、`apiKey`、`fetch`、`onPayload`、`onResponse`、`onSseEvent`、`execHandlers`、`cursorExecHandlers`、`cursorOnToolResult`、`providerSessionState`）。
- **网关选项修改**：在 auth-gateway（`packages/ai/src/auth-gateway/server.ts`）上，对 `openai-codex-responses` 模型剥离采样控制参数（`temperature`、`topP`、`topK`、`minP`、`stopSequences`、惩罚参数），以防止 400 错误。随后 `applyCallerTrust`（`packages/ai/src/auth-gateway/caller-options.ts`）将捕获的透传请求头（`captureRequestHeaders`）合并到网关令牌自身的请求头之下，而受限作用域的客户端令牌（`serve --clients`）会失去所有 `gateway` 层级选项，包括请求头。
- **分派优先级与缓存绕过**：在 `packages/ai/src/stream.ts` 的 `streamSimple` 中，`model.transport === "pi-native"` 优先于扩展注册的自定义 API（`getCustomApi`）。`packages/ai/src/stream.ts` 中的 `assertExplicitOpenAIResponsesPromptCacheSupport` 对 `pi-native` 传输显式绕过提示缓存断言，因为验证被推迟到网关解析出的模型处。

### 流式行为 \{#stream-behavior-15}

- **原样 SSE 成帧**：服务器的 `encodeStream`（`packages/ai/src/providers/pi-native-server.ts`）将每个规范化的 `AssistantMessageEvent` 原样序列化为 JSON SSE 帧（`data: ${JSON.stringify(event)}\n\n`）并流式发送，以 `data: [DONE]\n\n` 结束。客户端（`packages/ai/src/providers/pi-native-client.ts` 中的 `streamPiNative`）使用 `readSseJson`，将事件直接推入 `AssistantMessageEventStream`。
- **二次方级部分消息成帧**：增量事件包含滚动的 `partial: AssistantMessage` 快照，使传输带宽相对于轮次长度呈 O(N²)。对于由提供方延迟主导的回环/边车拓扑，这一开销可以接受。
- **空闲与首事件看门狗**：客户端使用 `iterateWithIdleTimeout` 包装 SSE 流，并采用 `PI_STREAM_FIRST_EVENT_TIMEOUT_MS` 和 `PI_STREAM_IDLE_TIMEOUT_MS`。`packages/ai/src/providers/pi-native-client.ts` 中的 `isPiNativeProgressEvent` 忽略 `type: "start"` 事件，因此初始设置不会重置空闲超时。
- **缺少终止事件**：如果 pi-native SSE 在没有 `done` 或 `error` 的情况下关闭，调用方中止会产生一个合成的中止错误。否则 `streamPiNative` 会以 `AIError.ProviderResponseError`、`kind: "incomplete-stream"` 失败，而不是虚构一次成功完成。
- **服务器迭代器异常后备处理**：如果服务器的 `encodeStream` 事件迭代器抛出异常，它会依次将 `data: {"type":"error","reason":"error","errorMessage":"..."}\n\n` 和 `data: [DONE]\n\n` 加入队列，使客户端迭代器能够结束而非挂起。
- **思考循环防护**：`packages/ai/src/stream.ts` 中的 `streamSimple` 使用 `withThinkingLoopGuard` 和 `withProviderInFlightLimit` 包装 `streamPiNative`，确保 Gemini、DeepSeek 和 Grok 的失控思考流以内容为空的可重试错误中止。

### 身份验证与用量 \{#auth--usage-15}

- **Bearer 令牌授权**：客户端（`packages/ai/src/providers/pi-native-client.ts` 中的 `buildHeaders`）在 `Authorization: Bearer <apiKey>` 中传递 `options.apiKey`（网关 bearer 令牌），除非显式提供了 `model.headers.Authorization`。
- **网关凭据解析**：服务器路由处理器（`packages/ai/src/auth-gateway/server.ts`）先验证网关 bearer 令牌。令牌缺失或无效时，通过 `packages/ai/src/providers/pi-native-server.ts` 中的 `formatError` 返回 `401`。有效请求会实例化 `buildGatewayApiKeyResolver`，使用 `sessionId`/`promptCacheKey` 和格式 `"pi-native"`，从 `AuthStorage` 获取目标提供方凭据。
- **错误封装与网关映射**：服务器通过 `formatError` 发出 `{ error: { type, message } }` 形式的错误，附带 HTTP 状态、`application/json` 和 `Cache-Control: no-store`。客户端的 `decodeGatewayError` 将非 2xx 响应转换为 `AIError.AuthGatewayError`，保留 HTTP 状态、响应头和错误 `type`。
- **用量与响应头跟踪**：token 用量（`input`、`output`、`cacheRead`、`cacheWrite`、`cost`）直接包含在规范化的 `AssistantMessage` 事件中。客户端通过 `notifyProviderResponse` 通知响应元数据（`x-request-id`、响应头）。

### 目录模型处理 \{#catalog-model-handling-15}

- **传输覆盖属性**：仅在 `packages/catalog/src/types.ts` 的 `Model` 接口上定义为 `transport?: "pi-native"`。
- **本地目录解析**：元数据（价格、上下文窗口、最大 token 数、`ThinkingConfig` 中的思考配置、能力标志、提供方优先级）从目录模型定义（如 `anthropic/claude-3-5-sonnet`）在本地解析，而执行分派则路由到网关 `baseUrl`。

---

# 目录提供方 \{#catalog-providers}

目录提供方章节介绍叠加在上述传输之上的附加身份验证、发现和传输策略。较新或非聊天路由在末尾概述；其默认值、种子条目和发现标志以 KDL 条目为准。

## ai& (`aiand`) \{#ai-aiand}

ai& (`aiand`) 是兼容 OpenAI 的推理 API 提供方（aiand.com），提供开放权重模型和旗舰 LLM，支持动态模型目录发现、推理力度元数据和 token 用量定价。传输：OpenAI Chat Completions。

### 特殊处理 \{#special-casings-16}

- **基础 URL 规范化**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `normalizeAiandBaseUrl` 会修剪基础 URL，默认值为 `https://api.aiand.com/v1`，移除末尾斜杠，并在缺少 `/v1` 时追加该路径。除此之外，没有超出 OpenAI Chat Completions 管线的处理。

### 身份验证与用量 \{#auth--usage-16}

- **API 密钥身份验证**：支持通过 `AIAND_API_KEY` 环境变量（由 `packages/ai/src/stream.ts` 中的 `getEnvApiKey("aiand")` 解析）或显式 `apiKey` 选项配置 API 密钥身份验证。
- **控制台登录与验证**：在 `packages/catalog/src/compat/rules/auth/aiand.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示从 `https://console.aiand.com/api-keys` 获取 API 密钥，并通过 `https://api.aiand.com/v1/models` 验证凭据（`validate "models-endpoint"`）。注册于 `packages/ai/src/registry/registry.ts`。

### 目录模型处理 \{#catalog-model-handling-16}

- **提供方条目（`aiand`）**：`packages/catalog/src/compat/rules/providers/aiand.kdl` 声明默认模型为 `moonshotai/kimi-k3`。环境变量键：`AIAND_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`qwen/qwen3.6-27b`、`deepseek-ai/deepseek-v4-flash`、`google/gemma-4-31b-it`、`openai/gpt-oss-120b`、`deepseek-ai/deepseek-v4-pro`、`moonshotai/kimi-k2.7-code`、`moonshotai/kimi-k2.6`、`zai-org/glm-5.2`、`zai-org/glm-5.1`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **权威发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `aiandModelManagerOptions` 设置 `dynamicModelsAuthoritative: true`，并通过 `dropCachedModelIdsOnStaticMismatch: AIAND_STATIC_MODEL_IDS` 使静态 ID 失效。提供 `apiKey` 时，`fetchDynamicModels` 使用带有 `mapAiandModel` 的 `fetchOpenAICompatibleModels` 查询 `/v1/models`。
- **费用映射（`mapAiandCost`）**：`mapAiandCost` 通过 `toPositiveNumber` 提取美元 token 价格 `input_per_1m` 和 `output_per_1m`。组织使用非美元计费币种时（如 `currency !== "usd"`），回退到 `{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }`，以免破坏费用模型。
- **模型属性映射（`mapAiandModel`）**：`mapAiandModel` 映射模型描述或名称（`toModelName`），检查 `capabilities` 是否包含 `"reasoning"`（附加 `thinking`）和 `"vision"`（设置 `input: ["text", "image"]`），并解析 `context_window`。

## AIML API (`aimlapi`) \{#aiml-api-aimlapi}

AIML API 是 AI 模型聚合平台，通过统一的 OpenAI 兼容端点提供多家厂商的多种模型。它使用 OpenAI Chat Completions（`openai-completions`）传输管线。

### 特殊处理 \{#special-casings-17}

- **非聊天模型过滤**：动态模型列表通过 `isLikelyAimlApiChatModelId`（`packages/catalog/src/provider-models/openai-compat.ts`）过滤，排除匹配正则表达式 `/(?:^|[/:._-])(?:audio|embed|embedding|embeddings|i2i|i2v|image|speech|t2i|t2v|tts|video)(?:$|[/:._-])/i` 或子串（`dall-e`、`dalle`、`flux`、`imagen`、`sora`、`veo`、`whisper`）的音频、嵌入、图像、视频和 TTS 模型。
- **标准传输管线**：使用未经定制的 `openai-completions` 传输，没有自定义请求转换器或错误处理器（`packages/catalog/src/provider-models/openai-compat.ts`）。

### 身份验证与用量 \{#auth--usage-17}

- **环境身份验证**：配置为通过 `AIMLAPI_API_KEY` 环境变量发现凭据（`packages/catalog/src/compat/rules/providers/aimlapi.kdl`、`packages/catalog/src/compat/rules/auth/aimlapi.kdl`）。
- **API 授权**：通过 HTTP `Authorization: Bearer <key>` 请求头向目标主机 `https://api.aimlapi.com/v1` 传递密钥。
- **用量跟踪**：在 `packages/ai/src/usage/` 中没有注册专用的配额或用量解析模块。

### 目录模型处理 \{#catalog-model-handling-17}

- **提供方条目（`aimlapi`）**：`packages/catalog/src/compat/rules/providers/aimlapi.kdl` 声明默认模型为 `gpt-5.5-2026-04-23`。环境变量键：`AIMLAPI_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **动态发现**：通过 `packages/catalog/src/provider-models/openai-compat.ts` 中的 `aimlApiModelManagerOptions()` 管理，获取 `https://api.aimlapi.com/v1/models`，并通过 `filterModel`（`isLikelyAimlApiChatModelId`）和 `mapWithBundledReference` 映射候选模型。
- **规范化解析**：带多厂商命名空间的模型（如 `alibaba/qwen3-32b`、`x-ai/grok-4-3`）通过 `buildModelProviderPriorityRank` 解析规范化参数默认值，其中 `aimlapi` 参与跨提供方身份查找（`packages/catalog/src/identity/priority.ts`、`packages/catalog/test/canonical-limit-fallback.test.ts`）。

## Alibaba Coding Plan (`alibaba-coding-plan`) \{#alibaba-coding-plan-alibaba-coding-plan}

Alibaba Coding Plan 提供托管在阿里云 DashScope 平台上的面向编程的模型端点。它使用 `OpenAI Chat Completions` 传输（`openai-completions`），连接国际站（`https://coding-intl.dashscope.aliyuncs.com/v1`）或中国内地（`https://coding.dashscope.aliyuncs.com/v1`）端点。

### 特殊处理 \{#special-casings-18}

`packages/catalog/src/compat/rules/providers/alibaba-coding-plan.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 glm：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 *.5：`thinkingFormat="qwen"`。
- 对于模型 glm-5：`thinkingFormat="qwen"`。
- 提供方默认值：`thinkingFormat="qwen"`、`streamIdleTimeoutMs=600000`、`thinking.mode="effort"`。

- **结构化 API 密钥解析**：在 `packages/ai/src/providers/openai-shared.ts` 中，启用 `alibabaCodingPlanAuth`（`packages/ai/src/providers/openai-completions.ts`）时，会解析 JSON 格式的 API 密钥（由登录/OAuth 存储生成），以提取 bearer `token`，并通过 `enterpriseUrl` 覆盖 `baseUrl`。
- **主机分类**：归入 `packages/catalog/src/hosts.ts` 中的 `alibabaDashscope` 主机条目（`urlMarkers: ["dashscope", "token-plan."]`）。
- **结构化凭据**：在执行传输前，注册表将 Alibaba Coding Plan 凭据格式化为 JSON API 密钥封装，携带访问、刷新、到期时间和企业端点元数据。

### 身份验证与用量 \{#auth--usage-18}

- **交互式登录与端点选择**：在 `packages/catalog/src/compat/rules/auth/alibaba-coding-plan.kdl`（`login "custom" hook="alibaba-coding-plan"`）中声明，并在 `packages/ai/src/registry/oauth/alibaba-coding-plan.ts`（`loginAlibabaCodingPlan`）中实现，提示用户在国际站（`https://coding-intl.dashscope.aliyuncs.com/v1`）、中国内地（`https://coding.dashscope.aliyuncs.com/v1`）或自定义代理基础 URL 之间选择。
- **API 密钥验证**：对于预设端点，通过 `apiKeyValidation.validateOpenAICompatibleApiKey`（`packages/ai/src/registry/api-key-validation.ts`）使用模型 `qwen3.5-plus` 验证凭据；对于自定义 URL，使用 `validateApiKeyAgainstModelsEndpoint`（`packages/ai/src/registry/oauth/alibaba-coding-plan.ts`）。
- **环境变量**：通过 `ALIBABA_CODING_PLAN_API_KEY` 获取 API 密钥（`packages/catalog/src/compat/rules/providers/alibaba-coding-plan.kdl`）。
- **用量与配额跟踪**：与 `alibaba-token-plan` 不同，`alibaba-coding-plan` 在 `packages/ai/src/usage/` 中没有专用的用量提供方或配额跟踪。

### 目录模型处理 \{#catalog-model-handling-18}

- **提供方条目（`alibaba-coding-plan`）**：`packages/catalog/src/compat/rules/providers/alibaba-coding-plan.kdl` 声明默认模型为 `qwen3.7-plus`。环境变量键：`ALIBABA_CODING_PLAN_API_KEY`。
- **模型管理器选项**：`alibabaCodingPlanModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）通过 `createOpenAICompatibleModelManagerOptions` 创建管理器选项，配置 `providerId: "alibaba-coding-plan"`、`defaultBaseUrl: "https://coding-intl.dashscope.aliyuncs.com/v1"` 和 `mapWithBundledReference`。
- **模型来源**：模型规范捆绑在 `packages/catalog/src/models.json` 的 `"alibaba-coding-plan"` 下。

### 流式行为 \{#stream-behavior-16}

- **延长流空闲超时**：将 `streamIdleTimeoutMs` 设置为 600,000 毫秒（`packages/catalog/src/compat/resolve.ts` 中的 `ALIBABA_CODING_PLAN_STREAM_IDLE_TIMEOUT_MS = 600_000`），避免首个 SSE 事件前初始生成延迟较长时，流看门狗过早中止。

## QwenCloud Token Plan (`alibaba-token-plan`) \{#qwencloud-token-plan-alibaba-token-plan}

QwenCloud Token Plan 提供阿里云 Qwen 和 DeepSeek 模型系列的订阅访问。它使用 OpenAI Chat Completions 传输（`openai-completions` API 模式），通过 HTTP POST JSON 和服务器发送事件（SSE）流式传输运行（`packages/ai/src/providers/openai-shared.ts`）。

### 特殊处理 \{#special-casings-19}

- **显式凭据隔离**：`resolveOpenAIRequestSetup`（`packages/ai/src/providers/openai-shared.ts`）要求显式提供 `ALIBABA_TOKEN_PLAN_API_KEY` 或 `BAILIAN_TOKEN_PLAN_API_KEY` 凭据，并显式禁用通用的 `$env.OPENAI_API_KEY` 后备路径，以防密钥泄露到 QwenCloud 端点。
- **区域基础 URL 路由**：凭据支持区域锁定端点：国际站新加坡（`ALIBABA_TOKEN_PLAN_BASE_URL` = `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`）和中国北京（`ALIBABA_TOKEN_PLAN_CN_BASE_URL` = `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`）。不同区域的密钥不可互换；存储的 `baseUrl` 会覆盖推理和模型发现所用的目录默认值（`packages/catalog/src/provider-models/openai-compat.ts`）。
- **存储的复合凭据**：Alibaba Token Plan 密钥可序列化为 `{ token, cookie?, baseUrl? }`；`packages/catalog/src/wire/alibaba-token-plan.ts` 中的 `parseAlibabaTokenPlanCredential` 恢复传输用 bearer 令牌和可选的配额 cookie/端点。

### 身份验证与用量 \{#auth--usage-19}

- **环境与传输凭据**：先解析 `ALIBABA_TOKEN_PLAN_API_KEY`，再解析 `BAILIAN_TOKEN_PLAN_API_KEY`。支持纯 bearer 密钥（`sk-sp-...`）或序列化 JSON 字符串（`{ token, cookie?, baseUrl? }`），通过 `parseAlibabaTokenPlanCredential` 解析，并通过 `serializeAlibabaTokenPlanCredential` 格式化（`packages/catalog/src/wire/alibaba-token-plan.ts`）。
- **交互式登录**：在 `packages/catalog/src/compat/rules/auth/alibaba-token-plan.kdl`（`login "custom" hook="alibaba-token-plan"`）中声明，并在 `packages/ai/src/registry/oauth/alibaba-token-plan.ts`（`loginAlibabaTokenPlan`）中实现，提示选择区域（1=国际站，2=中国北京，3=自定义 URL），通过 `${baseUrl}/models` 验证 API 密钥（`validateApiKeyAgainstModelsEndpoint`），并接受可选的 `cs-data.qwencloud.com` 浏览器 `Cookie` 请求头，用于配额报告。
- **控制台配额抓取**：`alibabaTokenPlanUsageProvider`（`packages/ai/src/usage/alibaba-token-plan.ts`）使用存储的 `Cookie` 请求头，从 `https://home.qwencloud.com/tool/user/info.json` 获取 `secToken`，并携带 URL 编码参数向 `https://cs-data.qwencloud.com/data/api.json?product=sfm_bailian&action=IntlBroadScopeAspnGateway&api=zeldaHttp.apikeyMgr./tokenplan/personal/api/v2/usage` 发出 POST 请求。
- **配额窗口与排序**：解析 `per5HourPercentage`/`per5HourResetTime`（5 小时窗口，`credits:5h`）、`per1WeekPercentage`/`per1WeekResetTime`（7 天窗口，`credits:7d`），以及 `per1MonthPercentage`/`per1MonthResetTime`（`credits:monthly`，只有重置期限，控制台从不说明月份的跨度）。因此，只有月度配额的套餐仍会生成报告，状态行的用量区段会优先展示其月度窗口（`packages/coding-agent/src/modes/interactive/status-quota.ts` 中的 `MONTHLY_SUBSCRIPTION_PROVIDERS`）。`alibabaTokenPlanRankingStrategy` 将 `credits:5h` 配置为主要限制（5h 窗口），将 `credits:7d` 配置为次要限制（7d 窗口）；`credits:monthly` 仅用于显示。

### 目录模型处理 \{#catalog-model-handling-19}

- **提供方条目（`alibaba-token-plan`）**：`packages/catalog/src/compat/rules/providers/alibaba-token-plan.kdl` 声明默认模型为 `qwen3.7-plus`。环境变量键：`ALIBABA_TOKEN_PLAN_API_KEY`、`BAILIAN_TOKEN_PLAN_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`qwen3.8-max-preview`、`qwen3.8-max`、`qwen3.8-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.6-flash`、`glm-5.2`、`deepseek-v4-pro`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **权威发现**：配置为 `dynamicModelsAuthoritative: true`（`packages/catalog/src/compat/rules/providers/alibaba-token-plan.kdl`）。`/models` 发现限定于订阅范围；端点成功返回的响应具有权威性，即使为空也会覆盖静态后备目录（`packages/catalog/scripts/generate-models.ts`）。
- **发现过滤与覆盖**：`isAlibabaTokenPlanChatModelId`（`packages/catalog/src/provider-models/openai-compat.ts`）过滤非聊天前缀（`qwen-audio-`、`qwen-image-`、`text-embedding-`、`wan2.7-`）。发现的 `deepseek-v4*` 模型映射为 `reasoning: true`，并采用力度式思考（`[Effort.High, Effort.Max]`）。

## Baseten (`baseten`) \{#baseten-baseten}

Baseten 为托管开放权重 LLM 提供高性能基础设施（包括 Moonshot Kimi、DeepSeek、智谱 GLM 和 gpt-oss 系列）。请求通过 OpenAI Chat Completions 传输（`openai-completions` API）执行，默认目标基础 URL 为 `https://inference.baseten.co/v1`。

### 特殊处理 \{#special-casings-20}

- 没有超出 `openai-completions` 管线的处理。

### 身份验证与用量 \{#auth--usage-20}

- **API 密钥身份验证**：通过 `BASETEN_API_KEY` 验证身份（`packages/catalog/src/compat/rules/providers/baseten.kdl`）。登录流程在 `packages/catalog/src/compat/rules/auth/baseten.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），指向仪表盘 `https://app.baseten.co/settings/api_keys`，占位符为 `bt_...`。
- **端点验证**：`packages/catalog/src/compat/rules/auth/baseten.kdl` 中的 API 密钥验证通过 `GET https://inference.baseten.co/v1/models` 验证凭据（`models-endpoint` 验证类型）。
- **用量核算**：通过标准 OpenAI Chat Completions 用量处理（`packages/ai/src/providers/openai-shared.ts` 中的 `calculateOpenAIUsageAccounting`）核对 token 用量和价格。

### 目录模型处理 \{#catalog-model-handling-20}

- **提供方条目（`baseten`）**：`packages/catalog/src/compat/rules/providers/baseten.kdl` 声明默认模型为 `moonshotai/Kimi-K2.7-Code`。环境变量键：`BASETEN_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **模型管理器选项**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `basetenModelManagerOptions` 使用 `defaultBaseUrl: "https://inference.baseten.co/v1"` 和 `requireApiKey: true` 配置模型解析。
- **动态模型发现与定价**：`fetchDynamicModels` 查询 `https://inference.baseten.co/v1/models`。`mapModel` 解析原始记录元数据，包括 `supported_features`、`input_modalities`（`image` 表示视觉能力）、上下文与补全 token 边界（`context_length`、`max_completion_tokens`），以及每百万 token 价格（`prompt`、`completion`、`input_cache_read`）。
- **原生推理识别**：当动态特性列出 `reasoning` 或 `reasoning_effort` 时，为 `openai/gpt-oss-120b`、`deepseek-ai/DeepSeek-V4-Pro` 和 `zai-org/GLM-5.2` 标记 `reasoning: true`。

## Bifrost (`bifrost`) \{#bifrost-bifrost}

Bifrost 是自托管的开源 AI 网关，通过一个 OpenAI 兼容 API（默认 `http://localhost:8080/v1`）为所有已配置的上游提供方提供服务。聊天模型使用 OpenAI Chat Completions 传输（`openai-completions`）；决策模型使用网关的 OpenAI Decisions 路由（`openai-decisions`、`POST {baseUrl}/decisions`）。

### 特殊处理 \{#special-casings-21}

- **网关模型名册**：模型 ID 为 `<bifrost-provider>/<model>`（`anthropic/claude-opus-5-5`、`openrouter/google/gemini-decision-1`，或自定义提供方名称，如 `custom/drex-max-v1.1`）。不捆绑任何模型：`bifrost` 位于 `DISCOVERY_ONLY_PROVIDERS`（`packages/catalog/scripts/generate-models.ts`），运行时发现具有权威性（`dynamic-models-authoritative`）。
- **行映射（`packages/catalog/src/provider-models/openai-compat.ts` 中的 `bifrostModelManagerOptions`）**：对于模型数据表中已知的模型，Bifrost 行采用 OpenRouter 形状：`context_length` / `top_provider.context_length` / `max_input_tokens`、`max_output_tokens` / `top_provider.max_completion_tokens`、`architecture.input_modalities`、`supported_parameters`（`tools`、`reasoning`）、`reasoning` 能力对象，以及按 token 计的美元 `pricing`（`prompt`、`completion`、`input_cache_read`、`input_cache_write`）。设置了 `pricing.prompt` 或 `pricing.completion` 的行具有权威性，因此显式 `"0"` 保持免费。某行省略的字段，先回退到 ID 前缀指定的上游提供方的捆绑模型，再回退到裸 `<model>` ID 相同的捆绑模型，最后回退到完整 ID 相同的捆绑模型；不会继承参考模型的传输兼容配置。
- **决策用量**：Bifrost 的 `/decisions` 响应报告聊天样式的 `usage.prompt_tokens` / `completion_tokens`；当 Responses 样式的 `input_tokens` / `output_tokens` 缺失时，`openai-decisions` 解码器会读取它们。
- **决策模型**：Bifrost 在 `/decisions` 上响应各上游的决策模型，但它的 `/models` 行只为 OpenRouter 的模型声明 `decisions` 输出。判断一行是否为 `openai-decisions` 裁判时，采用最具体的证据：若存在 `architecture.output_modalities`，则使用它；否则使用同一模型在上游提供方中的捆绑行（因此 `nanogpt/cloudflare/clef` 保持为聊天模型）；再否则，检查完整 ID 或其 `<model>` 部分是否是任意位置的捆绑裁判 ID（`cloudflare/clef`、`custom/drex-max-v1.1`）。omp 未捆绑的决策 ID（自托管的 `ollama/nimble`、别名化的 `azure/Microsoft-Decision-1`）列为聊天模型。
- **裁判重试与后备**：omp 不向 `/decisions` 发送 `fallbacks`，但 Bifrost 仍可在自身一侧重试（提供方的 `network_config.max_retries`）和回退（路由规则的 `fallbacks`）。每个原生裁判候选在 `judgment.attemptTimeoutMs` 内也最多进行 3 次 HTTP 尝试，然后转向下一个 `retry.fallbackChains.judge` 条目，因此在服务故障期间，两层机制会成倍增加上游调用，且 omp 可能在自己的期限到达时放弃，而 Bifrost 仍在重试。保留一层后备：使用 omp 的裁判链（Bifrost 裁判路由将 `max_retries` 设为 0，且没有规则后备），或使用 Bifrost 的后备（一个 omp 裁判候选，其 `judgment.attemptTimeoutMs` 高于网关的最坏情况，且关闭 `judgment.hedgeAfterMs`）。
- **非聊天行**：`architecture.output_modalities` 既不包含 `text` 也不包含 `decisions` 的行在映射器中丢弃；无元数据的嵌入、语音、转写、图像和审核 ID 由 `runtime/behavior.kdl` 中的 `exclude-models provider="bifrost"` 丢弃。
- **代理而非本地服务器**：`bifrost` 位于 `PROXY_OPENAI_COMPAT_PROVIDERS`（`packages/catalog/src/compat/resolve.ts`），因此回环基础 URL 不会启用面向 llama.cpp、vLLM 和类似服务器的本地运行时请求整形（语法工具模式、推理内容重放、输出钳制）。
- **Gemini 推理**：Bifrost 只通过 `delta.reasoning_details` 流式发送 Gemini 思考，不提供 `reasoning` 字符串：包含 `reasoning.text` 条目，以及一个将数据块放在 `signature` 而非 OpenRouter 的 `data` 中的 `reasoning.encrypted` 条目（Gemini 3 添加了如 `tool_call_call_1` 这样的 `id`）。这些条目渲染为思考；Bifrost 会丢弃模型自身的思考，因此下一轮只重放加密条目（参见[流式行为](#stream-behavior)）。

### 身份验证与用量 \{#auth--usage-21}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/bifrost.kdl` 中声明，并要求输入 Bifrost 虚拟密钥（`sk-bf-...`）。环境变量键：`BIFROST_API_KEY`。未启用治理的网关接受任意值。
- `BIFROST_BASE_URL` 设置网关的 OpenAI 兼容根地址（`packages/catalog/src/provider-models/cache-provider-id.ts` 中的 `getDefaultModelDiscoveryBaseUrl`）；`models.yml` 中提供方的 `baseUrl` 覆盖优先。发现、聊天和裁判请求均使用它。
- 没有凭据时不运行发现：默认端口 `8080` 也是 llama.cpp 的默认端口，其模型不能显示为 Bifrost 模型。
- **缓存作用域**：模型缓存命名空间对 API 密钥和基础 URL 做哈希（`bifrost` 位于 `CREDENTIAL_SCOPED_MODEL_CACHE_PROVIDERS`），因为虚拟密钥可限制模型名册。

## Cerebras (`cerebras`) \{#cerebras-cerebras}

Cerebras 在晶圆级引擎硬件上为开放权重模型提供超高速推理，例如 `zai-glm-4.7`、`gpt-oss-120b`、`qwen-3-235b-a22b-instruct-2507` 和 `gemma-4-31b`。它通过 OpenAI Chat Completions（`openai-completions`）传输通信。

### 特殊处理 \{#special-casings-22}

`packages/catalog/src/compat/rules/providers/cerebras.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 qwen：`thinkingFormat="openai"`。
- 对于模型 qwen-3.8-27b：`reasoningDisableMode="none-effort"`、`thinking.efforts=["low","medium","high"]`。
- 对于模型 zai-glm-4.7：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 提供方默认值：`supportsStrictMode=true`、`supportsUsageInStreaming=false`、`toolStrictMode="all_strict"`、`thinking.mode="effort"`。

- **`supportsUsageInStreaming: false`**：通过 `packages/catalog/src/compat/resolve.ts` 中的 `supportsUsageInStreaming: !isCerebras` 配置，抑制 `openai-completions.ts` 中的 `stream_options: { include_usage: true }`，避免流式响应时 API 拒绝请求。
- **空 400/413 上下文溢出检测**：Cerebras 的上下文和载荷溢出错误返回空的 HTTP 400 或 413 响应体。`packages/ai/src/error/flags.ts` 通过 `OVERFLOW_NO_BODY_PATTERN`（`/\b4(00|13)\s*(status code)?\s*\(no body\)/i`）识别这种情况，使 `isContextOverflow` 能设置 `Flag.ContextOverflow`，让智能体会话自动压缩上下文，而不是终止失败。
- **Gemma 图像输入序列化**：匹配 `gemma-4-31b` 的模型在 `packages/ai/src/providers/openai-completions.ts` 的 `convertMessages` 处理时，会将附加的图像块序列化为 Chat Completions `image_url` 数据 URI（`data:image/png;base64,...`）。

### 身份验证与用量 \{#auth--usage-22}

- **API 密钥登录**：在 `packages/catalog/src/compat/rules/auth/cerebras.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），默认验证模型为 `gpt-oss-120b`，基础 URL 为 `https://api.cerebras.ai/v1`。
- **环境解析**：在目录描述符 `descriptors.ts` 和 `packages/catalog/src/compat/rules/auth/cerebras.kdl` 中注册，使用环境变量 `CEREBRAS_API_KEY`。

### 目录模型处理 \{#catalog-model-handling-21}

- **提供方条目（`cerebras`）**：`packages/catalog/src/compat/rules/providers/cerebras.kdl` 声明默认模型为 `zai-glm-4.7`。环境变量键：`CEREBRAS_API_KEY`。
- **管理器选项与发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `cerebrasModelManagerOptions` 使用 `createOpenAICompatibleModelManagerOptions`，设置 `providerId: "cerebras"` 和默认基础 URL `https://api.cerebras.ai/v1`。

## Cloudflare AI Gateway (`cloudflare-ai-gateway`) \{#cloudflare-ai-gateway-cloudflare-ai-gateway}

Cloudflare AI Gateway 使用 Anthropic Messages 传输，通过 Cloudflare 边缘基础设施向模型提供方代理请求。模型配置中的基础 URL 需要将路径占位符 `<account>` 和 `<gateway>` 替换为用户具体的 Cloudflare 账号 ID 和网关短名称。

### 特殊处理 \{#special-casings-23}

`packages/catalog/src/compat/rules/providers/cloudflare-ai-gateway.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于模型 deepseek/*：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 anthropic；修订版本 >=4.0.0 <4.6.0：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 openai/gpt-5.1-codex：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 workers-ai/@cf/nvidia/nemotron-3-120b-a12b：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 xai/grok-4.20-0309-reasoning：`thinking.requiresEffort=true`。

- **自定义授权请求头**：使用 `cf-aig-authorization: Bearer <key>`，而非标准 `x-api-key` 或 `Authorization` 请求头（`packages/ai/src/providers/anthropic-headers.ts:buildAnthropicHeaders`）。
- **抑制客户端凭据**：Anthropic 客户端选项对象上的 `apiKey` 和 `authToken` 均设为 `null`，使凭据完全通过预构建的默认请求头传输（`packages/ai/src/providers/anthropic.ts`）。
- **OAuth 会话保护**：不向它发送 Claude OAuth `account_uuid` 请求头，以防身份信息泄露给第三方代理（`packages/coding-agent/src/session/session-metadata.ts`）。

### 身份验证与用量 \{#auth--usage-23}

- **身份验证提示**：在 `packages/catalog/src/compat/rules/auth/cloudflare-ai-gateway.kdl`（`login "custom" hook="cloudflare-ai-gateway"`）中声明，在 `packages/ai/src/registry/oauth/cloudflare-ai-gateway.ts` 中实现（传输位于 `packages/ai/src/registry/cloudflare-ai-gateway.ts`），提示输入 Cloudflare AI Gateway 令牌/API 密钥（`cf-aig-...`），并引导用户查看 Cloudflare 的身份验证文档。
- **环境变量**：从 `CLOUDFLARE_AI_GATEWAY_API_KEY` 读取 API 密钥凭据（`packages/catalog/src/compat/rules/providers/cloudflare-ai-gateway.kdl`）。
- **账号与网关解析**：使用 `https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic` 作为基础 URL 模板，其中 `<account>` 和 `<gateway>` 占位符替换为用户的 Cloudflare 账号 ID 和网关短名称（`packages/catalog/src/provider-models/openai-compat.ts:cloudflareAiGatewayModelManagerOptions`）。

### 目录模型处理 \{#catalog-model-handling-22}

- **提供方条目（`cloudflare-ai-gateway`）**：`packages/catalog/src/compat/rules/providers/cloudflare-ai-gateway.kdl` 声明默认模型为 `anthropic/claude-opus-5`。环境变量键：`CLOUDFLARE_AI_GATEWAY_API_KEY`。
- **编写的种子条目**：`claude-sonnet-4-5`；捆绑策略为 `empty`。限制、能力和价格与这些行一同编写。
- **优先级接入**：在 `providerPriority`（`packages/catalog/src/identity/priority.ts`）中分配目录优先级 39。

## CoreWeave Serverless Inference (`coreweave`) \{#coreweave-serverless-inference-coreweave}

CoreWeave Serverless Inference 在 `https://api.inference.wandb.ai/v1` 提供由 Weights & Biases (W&B) 基础设施支撑的托管 AI 模型推理。它使用“OpenAI Chat Completions”传输运行。

### 特殊处理 \{#special-casings-24}

- **项目请求头注入**：`packages/ai/src/providers/openai-shared.ts` 中的 `applyCoreWeaveProjectHeader` 在 `resolveOpenAIRequestSetup` 中拦截 `coreweave` 模型请求，并注入所需的 `OpenAI-Project` HTTP 请求头。请求头解析由 `packages/catalog/src/wire/coreweave.ts` 中的 `resolveCoreWeaveProject` 和 `coreWeaveProjectHeaders` 处理，检查 `COREWEAVE_PROJECT`、`WANDB_INFERENCE_PROJECT` 或 `WANDB_ENTITY`/`WANDB_PROJECT`。`removeBlankCoreWeaveProjectHeaders` 移除空项目请求头，以允许回退到环境变量。
- **GPT-OSS 推理转换**：在 `openAiCompletionsDescriptor`（`packages/catalog/src/provider-models/openai-compat.ts`）中，以 `openai/gpt-oss-` 开头的模型会被转换为设置 `reasoning: true`，并配置基于力度的思考（`Effort.Low`、`Effort.Medium`、`Effort.High`）。

### 身份验证与用量 \{#auth--usage-24}

- **API 密钥与环境解析**：通过 `COREWEAVE_API_KEY` 验证身份，回退到 `WANDB_API_KEY`（`descriptors.ts`、`packages/ai/src/stream.ts` 中的 `getEnvApiKey`）。
- **登录流程与项目验证**：交互式登录在 `packages/catalog/src/compat/rules/auth/coreweave.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引用 `https://wandb.ai/settings` 的设置。`requireCoreWeaveProjectHeaders`（`packages/ai/src/registry/oauth/coreweave.ts`）在通过 `https://api.inference.wandb.ai/v1/models` 验证凭据之前，强制检查能否从环境变量构造有效的 `OpenAI-Project` 请求头。

### 目录模型处理 \{#catalog-model-handling-23}

- **提供方条目（`coreweave`）**：`packages/catalog/src/compat/rules/providers/coreweave.kdl` 声明默认模型为 `openai/gpt-oss-120b`。环境变量键：`COREWEAVE_API_KEY`、`WANDB_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **模型管理器与动态发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `coreWeaveModelManagerOptions` 通过 `createSimpleOpenAICompletionsOptions` 为 `https://api.inference.wandb.ai/v1` 构造提供方选项，在获取目录模型时动态提供 `coreWeaveProjectHeaders(Bun.env)`。

## DeepSeek (`deepseek`) \{#deepseek-deepseek}

DeepSeek 提供方使用 OpenAI Chat Completions 传输（`openai-completions`）直接与 DeepSeek API（`https://api.deepseek.com/v1`）对接。它支持 `deepseek-v4-pro` 和 `deepseek-v4-flash` 等官方 DeepSeek 模型，实现提供方专用的推理标志、剥离 token 的流过滤器、自定义提示缓存用量核算，以及清除 Bearer 前缀后的 API 密钥存储。

### 特殊处理 \{#special-casings-25}

`packages/catalog/src/compat/rules/providers/deepseek.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 deepseek：`thinking.mode="effort"`。
- 对于模型 deepseek-flash、deepseek-v4-flash、deepseek-v4-flash-vision-exp：`clampOutputToModelMax=true`。
- 对于模型 deepseek-flash、deepseek-v4-flash、deepseek-v4.1-flash-expires-on-0910：`maxTokensField="max_tokens"`、`reasoningContentField="reasoning_content"`、`requiresAssistantContentForToolCalls=true`、`requiresReasoningContentForToolCalls=true`、`allowsSyntheticReasoningContentForToolCalls=false`、`supportsToolChoice=false`、`thinking.upgradeNeutral=true`、`thinking.efforts=["low","high","max"]`。
- 提供方默认值：`extraBody={"thinking":{"type":"enabled"}}`、`supportsReasoningEffort=true`。

- **推理内容不变量**：在后续轮次中重放此前原封不动的 `reasoning_content`（`requiresReasoningContentForToolCalls` 和 `requiresReasoningContentForAllAssistantTurns`），拒绝合成的 `"."` 占位符（`allowsSyntheticReasoningContentForToolCalls: false`）。工具轮次中的空助手内容会提升为 `"."`（`requiresAssistantContentForToolCalls: true`）。
- **聊天模板 token 剥离与修复**：`packages/ai/src/providers/openai-completions.ts` 中的 `stripDeepseekSpecialTokens` 缓冲并剥离流式传输的原始聊天模板 token（`<｜User｜>`、`<｜Assistant｜>` 等）。对于任意主机上的每个 DeepSeek 类模型，带内 DSML 工具块（`<｜DSML｜tool_calls>`）通过模式为 `"dsml"` 的 `StreamMarkupHealing` 修复。这包括本地后端和自定义提供方；规则是 `classes/deepseek.kdl` 中的类级 `stream-markup-healing-pattern`。格式错误的封装（例如缺少 `<｜DSML｜tool_calls>`/`<｜DSML｜invoke>` 起始标签）不会被修复；一旦出现裸露的起始标签，修复器会保留该调用的结束标签，而不是将它们作为孤立标签剥离，因此仍能找到调用的结尾。当 DSML 模型（DeepSeek 类，或 `streamMarkupHealingPattern: "dsml"`；参见 `isDsmlLeakRecoveryTarget`）的此类轮次在没有工具调用的情况下停止时，智能体循环会在提交消息前移除损坏的标记（`packages/ai/src/utils/dsml-leak.ts` 中的 `removeDsmlToolMarkupLeak`），使其不会进入历史。这也包括写在 invoke 标签位置的工具名称行。随后循环会发送一条“Tool call failed”开发者消息，展示正确的封装，并再次对模型采样，最多连续执行 `MAX_DSML_LEAK_NUDGES`（2）次。代码围栏或行内代码中的 DSML 保持不变。

### 身份验证与用量 \{#auth--usage-25}

- **API 密钥规范化与登录**：在 `packages/catalog/src/compat/rules/auth/deepseek.kdl` 中声明为带有 `normalize "strip-bearer"` 的 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），修剪输入并剥离开头的 `Bearer ` 前缀（不区分大小写），通过 `/v1/models` 验证。运行时凭据依赖 `DEEPSEEK_API_KEY`。
- **提示缓存用量核算**：DeepSeek 返回顶层用量字段 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。`calculateOpenAIUsageAccounting`（`packages/ai/src/providers/openai-shared.ts`）检测 `isDeepSeekUsage`，将净输入 token 数映射为 `Math.max(0, promptTokens - cachedTokens)`（未命中数量），并将 `cacheWrite` 设为 `0`，避免把未缓存的提示 token 作为显式缓存写入重复计费。

### 目录模型处理 \{#catalog-model-handling-24}

- **提供方条目（`deepseek`）**：`packages/catalog/src/compat/rules/providers/deepseek.kdl` 声明默认模型为 `deepseek-v4-pro`。环境变量键：`DEEPSEEK_API_KEY`。

## Fire Pass (`firepass`) \{#fire-pass-firepass}

Fire Pass 是 Fireworks AI 的订阅层级，提供高吞吐路由器访问，并编写了 GLM-5.2 Fast 和 Kimi K3 Fast 后备行。它使用 OpenAI Chat Completions 传输（`https://api.fireworks.ai/inference/v1`），并进行 Fireworks 路由器端点转换。

### 特殊处理 \{#special-casings-26}

`packages/catalog/src/compat/rules/providers/firepass.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 glm：`thinking.mode="effort"`、`thinking.efforts=["minimal","low","medium","high","max"]`。
- 对于类别 kimi：`thinking.mode="effort"`、`thinking.efforts=["low","high","max"]`。
- 提供方默认值：`wireModelIdMode="firepass"`、`thinking.effortMap={"minimal":"none"}`。

- **最大输出 token 上限**：通过 `clampFireworksKimiMaxTokens`（`packages/catalog/src/provider-models/openai-compat.ts`）和 `applyKimiMaxTokensCap`（`packages/catalog/scripts/generate-models.ts`），将输出 token 上限设为 32,768（`FIREWORKS_KIMI_MAX_TOKENS`），防止 Kimi K2 模型产生失控的推理轨迹。

### 身份验证与用量 \{#auth--usage-26}

- **身份验证**：在 `packages/catalog/src/compat/rules/auth/firepass.kdl` 中定义为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），使用环境变量 `FIREPASS_API_KEY`（`fpk_...`）。
- **验证**：专用 `fpk_...` 密钥只授权路由器端点，在 `/v1/models` 上会失败。`packages/catalog/src/compat/rules/auth/firepass.kdl` 中的验证使用 `validate "chat-completions"`，直接以 `accounts/fireworks/routers/kimi-k2p6-turbo` 为目标。

### 目录模型处理 \{#catalog-model-handling-25}

- **提供方条目（`firepass`）**：`packages/catalog/src/compat/rules/providers/firepass.kdl` 声明默认模型为 `glm-5.2-fast`。环境变量键：`FIREPASS_API_KEY`。
- **编写的种子条目**：`glm-5.2-fast`、`kimi-k3-fast`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **管理器选项**：`firepassModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）返回没有动态发现的静态配置，依赖 `models.json` 中的规范化捆绑目录。

## Fireworks (`fireworks`) \{#fireworks-fireworks}

Fireworks（`packages/catalog/src/compat/rules/auth/fireworks.kdl`）是高吞吐 AI 推理提供方，通过 OpenAI 兼容的 HTTP REST API（`https://api.fireworks.ai/inference/v1`）提供无服务器模型和专用模型。它使用 OpenAI Chat Completions 传输（`packages/ai/src/providers/openai-completions.ts` 中的 `streamOpenAICompletions`），并提供自定义模型传输ID转换、思考参数冲突消解和优先级层级处理。

### 特殊处理 \{#special-casings-27}

`packages/catalog/src/compat/rules/providers/fireworks.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于模型 *-fast：`wireModelIdMode="firepass"`。
- 对于类别 qwen：`thinkingFormat="openai"`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 deepseek-v4-flash：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 glm-5.1*、glm-5：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 glm-5.2*：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 对于模型 qwen3-coder-480b-a35b-instruct：`thinkingFormat="openai"`。
- 对于模型 qwen3.6-plus：`supportsDeveloperRole=false`。
- 提供方默认值：`wireModelIdMode="fireworks"`、`dropThinkingWhenReasoningEffort=true`、`thinking.effortMap={"minimal":"none"}`、`thinking.mode="effort"`。

- **`wireModelIdMode: "fireworks"` 与模型传输ID转换**：`applyWireModelIdTransform`（`packages/ai/src/providers/openai-shared.ts`）由 `packages/catalog/src/compat/resolve.ts` 解析出的 `wireModelIdMode: "fireworks"` 启用，它调用 `toFireworksWireModelId`（`packages/catalog/src/fireworks-model-id.ts`），为公开目录模型 ID 添加 `accounts/fireworks/models/` 前缀，并将版本中的点转换为 `p`（例如 `glm-5.1` 映射为 `accounts/fireworks/models/glm-5p1`）。公开目录规范化使用 `toFireworksPublicModelId`。
- **`dropThinkingWhenReasoningEffort` 冲突消解**：`packages/catalog/src/compat/resolve.ts` 中为 Fireworks 将 `compat.dropThinkingWhenReasoningEffort` 设为 `true`。请求参数中存在 `reasoning_effort` 时，`applyOpenAIExtraBody`（`packages/ai/src/providers/openai-shared.ts`）会删除顶层 `thinking` 开关对象，防止 Fireworks 因同时收到两个参数而拒绝请求并返回 HTTP 400 错误。
- **服务层级/优先级控制**：`excludesInferredOpenAIServiceTier` 和 `shouldSendServiceTier`（`packages/ai/src/types.ts`）允许 `fireworks` 请求在启用 `providers.fireworksTier: priority`（或 `/fast` 模式）时发送 `service_tier: "priority"`，并抑制不必要的层级默认值。

### 身份验证与用量 \{#auth--usage-27}

- **API 密钥身份验证**：使用通过 `FIREWORKS_API_KEY` 配置的 HTTP Bearer 令牌（`Authorization: Bearer ${apiKey}`）验证身份（由 `packages/ai/src/stream.ts` 中的 `getEnvApiKey` 解析）。
- **控制平面登录验证**：`/login fireworks`（在 `packages/catalog/src/compat/rules/auth/fireworks.kdl` 中声明为 `login "api-key"` 规则，`packages/ai/src/registry/engine/api-key.ts`）通过静态控制平面目录 `GET /v1/accounts/fireworks/models?filter=supports_serverless%3Dtrue&pageSize=1` 验证凭据，而非 `/v1/models`（推理端点提供每个账号的部署，对没有活动部署的账号返回 500）。
- **用量核算**：token 用量通过 `calculateOpenAIUsageAccounting`（`packages/ai/src/providers/openai-shared.ts`）中的标准 `openai-completions` 核算处理，提取 `prompt_tokens`、`completion_tokens`、`prompt_tokens_details.cached_tokens` 和 `completion_tokens_details.reasoning_tokens`。

### 目录模型处理 \{#catalog-model-handling-26}

- **提供方条目（`fireworks`）**：`packages/catalog/src/compat/rules/providers/fireworks.kdl` 声明默认模型为 `kimi-k3`。环境变量键：`FIREWORKS_API_KEY`。
- **控制平面发现**：`fireworksModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）通过控制平面目录 `GET /v1/accounts/fireworks/models?filter=supports_serverless=true` 而非 `/v1/models` 枚举模型，使用 `toFireworksPublicModelId` 将资源名称（`accounts/fireworks/models/<id>`）转换为公开目录 ID。目录生成期间，`scripts/generate-models.ts` 会剪除内部账号资源 ID。发现模型的价格取自 Fireworks 自身的 models.dev 行（`fireworks-ai`，以传输ID为键），只有 Fireworks 未发布价格时才回退到裸 ID 参考模型的价格。
- **Fast 变体种子生成**：`buildFireworksFastSeed`（`packages/catalog/src/provider-models/openai-compat.ts`）以编程方式生成与精选基础模型配对的 `-fast` 目录种子（如 `kimi-k3-fast`、`glm-5.3-fast`），只将费用覆盖为 Fast 定价，同时以高速路由器传输路径为目标。
- **Kimi 系列输出 token 上限**：`clampFireworksKimiMaxTokens`（`packages/catalog/src/provider-models/openai-compat.ts`）对 Kimi K2.5/K2.6 模型（`isFireworksKimiK2ModelId`）将输出预算 `maxTokens` 钳制为 `FIREWORKS_KIMI_MAX_TOKENS = 32_768`，避免 Fireworks 报告的 `max_completion_tokens: 65536` 导致推理轨迹失控。`kimi-k2.7-code` 被显式排除在此上限之外，允许使用其完整输出预算（`FIREWORKS_KIMI_K27_CODE_MAX_TOKENS = 65_536`）。

## GitHub Copilot (`github-copilot`) \{#github-copilot-github-copilot}

GitHub Copilot 通过 GitHub 的统一代理端点（`https://api.githubcopilot.com` 或企业版 `copilot-api.<domain>`）路由多厂商模型执行（OpenAI GPT、Anthropic Claude、xAI Grok、Google Gemini）。该提供方在三种传输格式之间动态分派：OpenAI Chat Completions、OpenAI Responses 和 Anthropic Messages。

### 特殊处理 \{#special-casings-28}

`packages/catalog/src/compat/rules/providers/github-copilot.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 anthropic；修订版本 >=4.0.0 <4.6.0：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 gemini；系列 flash：`supportsDeveloperRole=false`。
- 对于类别 gemini；修订版本 >=2.5.0 <3.7.0：`thinking.mode="effort"`。
- 对于类别 kimi：`thinking.mode="effort"`。
- 对于类别 openai；修订版本 >=5.0.0 <5.7.0：`thinking.mode="effort"`。
- 对于类别 unknown：`thinking.mode="effort"`。
- 对于类别 xai；系列 grok：`thinking.mode="effort"`。
- 对于模型 gemini-2.5-pro、gemini-3.1-pro-preview、gpt-4.1：`supportsDeveloperRole=false`。
- 对于模型 gpt-5.1-codex、gpt-5.1-codex-max：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 grok-4.5、mai-code-1-flash-picker：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 grok-4.6、grok-4.6-1m：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 提供方默认值：`supportsStrictMode=true`、`disableStrictTools=true`、`supportsContextManagement=false`。

- **Copilot 传输身份**：`packages/catalog/src/wire/github-copilot.ts` 使用 `User-Agent: copilot/1.0.82`、与之匹配的 `Editor-Version`、`Copilot-Integration-Id: copilot-developer-cli`、`Copilot-Harness-Id: copilot-sdk` 和 Copilot API 版本 `2026-08-01`。聊天默认使用 `copilot-chat`，允许通过 `COPILOT_INTEGRATION_ID` 固定值，并可在策略拒绝时使用 CLI 集成重试一次。发现保留 CLI 身份；GitHub REST 请求不接收 Copilot API 版本请求头。
- **Responses 传输**：Copilot 标准 Responses 使用 HTTP/SSE；其目录策略不启用 WS，即使请求/模型设置了 `preferWebsockets: true` 也如此。HTTP 身份协商和凭据作用域内的成功缓存仍属于现有 HTTP 路径，而非 WS 升级协商。
- **动态 Copilot 请求头与发起方**：`buildCopilotDynamicHeaders`（`packages/ai/src/providers/github-copilot-headers.ts`）注入每请求请求头 `X-Initiator`（通过 `inferCopilotInitiator` 从消息历史推断为 `"user"` 或 `"agent"`，或通过 `getCopilotInitiatorOverride` 覆盖）、`Openai-Intent: conversation-edits`，并在 `hasCopilotVisionInput` 检测到用户或工具结果块中的图像载荷时注入 `Copilot-Vision-Request: true`。
- **基础 URL 与端点解析**：`resolveGitHubCopilotBaseUrl`（`packages/ai/src/providers/github-copilot-headers.ts`）和 `parseGitHubCopilotApiKey`（`packages/catalog/src/wire/github-copilot.ts`）解析嵌入 API 密钥或凭据中的自定义 `enterpriseUrl` 和 `apiEndpoint` 属性，默认使用 `https://api.githubcopilot.com`（`PERSONAL_GITHUB_COPILOT_BASE_URL`）。
- **OpenAI 与 Responses 兼容标志**：
   - `supportsReasoningParams`：在 `packages/catalog/src/compat/resolve.ts` 中禁用（`supportsReasoningParams: provider !== "github-copilot"`），因为 Copilot Chat Completions 端点会以 HTTP 400 拒绝 `reasoning_effort` 和推理字段。
   - `supportsDeveloperRole`：对 Chat Completions 规范（`openai-compat.ts`）禁用，但对 OpenAI Responses 规范启用。
   - `strictResponsesPairing`：在 `packages/catalog/src/compat/resolve.ts` 中启用（`spec.provider === "github-copilot"`），强制 Responses 端点上的工具调用与工具结果消息严格配对。
   - `supportsImageDetailOriginal`：禁用（`supportsImageDetailOriginal: false`），将图像细节从 `"original"` 钳制为 `"auto"`，避免代理返回 400/422 拒绝。
- **Anthropic 传输与签名兼容**：
   - `supportsEagerToolInputStreaming`：在 `packages/catalog/src/compat/anthropic.ts` 中禁用（`supportsEagerToolInputStreaming: false`），且省略细粒度工具流式传输 beta 请求头，因为 Copilot Anthropic 代理拒绝 `eager_input_streaming`（#2558）。
   - 识别为签名主机（解析后的签名端点策略），抑制 Claude 模型的未签名思考重放（#2851）。

### 身份验证与用量 \{#auth--usage-28}

- **设备流程 OAuth（`opencode` OAuth 应用）**：
   - 在 `packages/catalog/src/compat/rules/auth/github-copilot.kdl`（`login "custom" hook="github-copilot"`）中声明，`packages/ai/src/registry/oauth/github-copilot.ts` 中的 `loginGitHubCopilotHook` 使用客户端 ID `Ov23li8tweQw6odWQebz`（`CLIENT_ID`）和作用域 `read:user` 执行 GitHub 设备授权流程。
   - `startDeviceFlow` 携带共享的 GitHub OAuth 请求头，向 `https://<domain>/login/device/code` 发出 POST 请求。`pollForGitHubAccessToken` 轮询 `https://<domain>/login/oauth/access_token`，自动处理 `authorization_pending` 和 `slow_down` 限速退避。
   - 登录后，`discoverGitHubCopilotApiEndpoint` 查询 `https://api.github.com/copilot_internal/user`，`enableAllGitHubCopilotModels` 发出模型启用请求（`POST /models/{modelId}/policy`，携带 `{ state: "enabled" }` 和 `openai-intent: chat-policy`）。
- **令牌交换与刷新**：
   - `refreshGitHubCopilotToken`（`packages/ai/src/registry/oauth/github-copilot.ts`）直接使用长期有效的 GitHub OAuth 令牌，不进行二次 JWT 交换周期，将到期时间设为 `FAR_FUTURE_MS`（10 年）。
- **用量与配额核算**：
   - `packages/ai/src/usage/github-copilot.ts` 中的 `fetchInternalUsage` 携带共享的 GitHub OAuth 请求头，在 `resolveGitHubApiBaseUrl` 上查询 `GET /copilot_internal/user`。
   - `normalizeQuotaSnapshots` 和 `buildLimitFromQuota` 将 `quota_snapshots`（`chat`、`completions`、`premium_interactions`）和 `quota_reset_date` 转换为月度 `UsageLimit` 结构（`copilot:premium`、`copilot:chat`、`copilot:completions`）。`fetchBillingUsage` 提供补充的用户账单详情（`/settings/billing/premium_request/usage`）。
   - `getCopilotPremiumRequests`（`packages/ai/src/providers/github-copilot-headers.ts`）计算模型的高级请求费用：智能体轮次（`initiator === "agent"`）为 `0`，用户轮次为 `getCopilotPremiumMultiplier(premiumMultiplier, planTier)`。

### 目录模型处理 \{#catalog-model-handling-27}

- **提供方条目（`github-copilot`）**：`packages/catalog/src/compat/rules/providers/github-copilot.kdl` 声明默认模型为 `gpt-5.5`。环境变量键：`COPILOT_GITHUB_TOKEN`。
- **动态模型发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `fetchDynamicModels` 使用 `COPILOT_API_HEADERS` 获取 `/models`。从 `entry.capabilities.limits` 解析窗口/token 限制（`maxContextWindowTokens`、`maxPromptTokens`、`maxOutputTokens`），推断传输 API（`inferCopilotApi`），并配置视觉支持（`extractCopilotSupportsVision`）。
- **长上下文变体合成**：模型在 `billing.token_prices.long_context` 中声明长上下文定价时，会触发 `createCopilotLongContextVariant` 合成可选启用的 `-1m` 目录模型（例如 `claude-opus-4.7-1m`，设置 `requestModelId: "claude-opus-4.7"`）。基础模型会获得指向其长上下文同类模型的 `contextPromotionTarget`。
- **高级请求倍率**：模型专用的请求倍率映射在 `COPILOT_PREMIUM_MULTIPLIERS`（`packages/catalog/scripts/generate-models.ts`）中，赋值示例包括 `gpt-4o: 0`、`grok-code-fast-1: 0.25`、`claude-haiku-4.5: 0.33`、`gpt-5.4-mini: 0.33` 和 `claude-opus-4.6: 3`。

## GitLab Duo Non-Agentic (`gitlab-duo`) \{#gitlab-duo-non-agentic-gitlab-duo}

`GitLab Duo Non-Agentic`（`gitlab-duo`）将 Duo Chat LLM 补全请求代理到 GitLab AI Gateway 代理端点。根据目标模型映射，它将执行动态委托给 [Anthropic Messages](#anthropic-messages)、[OpenAI Chat Completions](#openai-chat-completions) 或 [OpenAI Responses](#openai-responses) 传输。它基于共享的 [GitLab Duo](#gitlab-duo) 传输章节所述机制运行。

### 特殊处理 \{#special-casings-29}

- **模型 ID 映射与路由：** `packages/ai/src/providers/gitlab-duo.ts` 中的 `MODEL_MAPPINGS` 将 Duo 模型标识符（`duo-chat-opus-4-6`、`duo-chat-sonnet-4-6`、`duo-chat-opus-4-5`、`duo-chat-sonnet-4-5`、`duo-chat-haiku-4-5`、`duo-chat-gpt-5-1`、`duo-chat-gpt-5-2`、`duo-chat-gpt-5-mini`、`duo-chat-gpt-5-codex`、`duo-chat-gpt-5-2-codex`）映射到后端提供方（`anthropic` 或 `openai`）、底层模型 ID、API 模式（`anthropic-messages`、`openai-completions`、`openai-responses`）和代理目标 URL（`ANTHROPIC_PROXY_URL` = `https://cloud.gitlab.com/ai/v1/proxy/anthropic/` 或 `OPENAI_PROXY_URL` = `https://cloud.gitlab.com/ai/v1/proxy/openai/v1`）。
- **规范化模型别名**：GitLab Duo 传输在分派前，将目录 Duo ID 映射到底层模型 ID 和传输 API；映射编写在其目录提供方策略中，并由传输使用。
- **Direct Access 令牌交换与缓存：** `packages/ai/src/providers/gitlab-duo.ts` 中的 `getDirectAccessToken` 携带 `{ feature_flags: { DuoAgentPlatformNext: true } }`，通过 `POST https://gitlab.com/api/v4/ai/third_party_agents/direct_access` 将用户的 GitLab 访问令牌交换为短期直接访问令牌。得到的令牌和请求头在 `directAccessCache` 中缓存 25 分钟（`DIRECT_ACCESS_TTL_MS`）。
- **委托流式分派：** `packages/ai/src/providers/gitlab-duo.ts` 中的 `streamGitLabDuo` 验证用户令牌（`MissingApiKeyError`），获取直接访问请求头，通过 `mapAnthropicToolChoice`（`packages/ai/src/stream.ts`）转换 Anthropic 工具选择，并使用合成模型规范（`buildModel`）分派到 `streamAnthropic`、`streamOpenAICompletions` 或 `streamOpenAIResponses`（`packages/ai/src/providers/register-builtins.ts`）。

### 身份验证与用量 \{#auth--usage-29}

- **PAT 与 OAuth 支持：** 在 `packages/catalog/src/compat/rules/auth/gitlab-duo.kdl`（`login "oauth-code"`，引擎 `packages/ai/src/registry/engine/oauth-code.ts`）中声明，缓存清理钩子位于 `packages/ai/src/registry/oauth/gitlab-duo.ts`，支持通过 `GITLAB_TOKEN` 提供个人访问令牌，或使用 PKCE 浏览器 OAuth。
- **OAuth 授权与客户端 ID：** 在 `packages/catalog/src/compat/rules/auth/gitlab-duo.kdl` 中声明，针对 `https://gitlab.com/oauth/authorize` 执行 PKCE OAuth（`scope: "api"`、`callbackPort: 8080`、`pasteCodeFlow: true`）。使用 `client-id`（`"da4edff2e6ebd2bc3208611e2768bc1c1dd7be791dc5ff26ca34ca9ee44f7d4b"`），可通过 `GITLAB_CLIENT_ID`（`env="GITLAB_CLIENT_ID"`）和 `GITLAB_REDIRECT_URI`（`redirect-uri-env="GITLAB_REDIRECT_URI"`）覆盖。
- **令牌刷新与缓存失效：** `packages/catalog/src/compat/rules/auth/gitlab-duo.kdl` 中的令牌刷新在 `https://gitlab.com/oauth/token` 交换刷新令牌。交换和刷新均通过 `gitLabDuoClearCacheHook`（`packages/ai/src/registry/oauth/gitlab-duo.ts`，调用 `packages/ai/src/providers/gitlab-duo.ts` 中的 `clearGitLabDuoDirectAccessCache`）清除缓存的直接访问令牌。
- **用量接口：** 没有超出 [GitLab Duo](#gitlab-duo) 管线的处理。

### 目录模型处理 \{#catalog-model-handling-28}

- **提供方条目（`gitlab-duo`）**：`packages/catalog/src/compat/rules/providers/gitlab-duo.kdl` 声明默认模型为 `duo-chat-opus-4-6`。环境变量键：`GITLAB_TOKEN`。

## GitLab Duo Agent (`gitlab-duo-agent`) \{#gitlab-duo-agent-gitlab-duo-agent}

`gitlab-duo-agent` 提供方将 OMP 连接到 GitLab Duo Workflow Service（DWS），通过 WebSocket 动作桥接协议执行智能体任务。它基于 `GitLab Duo` 传输章节所述机制运行。

### 特殊处理 \{#special-casings-30}

- **流直接绕过与思考修复**：在 `packages/ai/src/stream.ts` 中，`gitlab-duo-agent` 绕过 `withProviderInFlightLimit` 和标准 `iterateWithIdleTimeout` 包装器。`streamGitLabDuoWorkflow`（`packages/ai/src/providers/gitlab-duo-workflow.ts`）由 `healLeakedThinking` 包装后直接调用。
- **运行时命名空间解析与自动启用**：流初始化会调用 `resolveGitLabDuoWorkflowNamespaceSelection`（`packages/ai/src/providers/gitlab-duo-workflow.ts`），从选项、`GITLAB_DUO_NAMESPACE_ID`/`GITLAB_DUO_PROJECT_ID` 环境变量或工作区 git 远程地址解析根命名空间。`ensureGitLabDuoWorkflowSettings` 向 `/api/v4/ai/duo_workflows/settings` 发出 POST 请求（通过 `GITLAB_DUO_WORKFLOW_REST_TIMEOUT_MS` 设置 30 秒超时），自动启用所需的命名空间设置（`duo_workflow`、`duo_workflow_service`、`duo_agent_platform`）。
- **ChatML 目标与内联规范生成**：将对话历史渲染为 ChatML 目标字符串（`buildGitLabDuoWorkflowGoal`、`renderGitLabDuoWorkflowChatMl`），受 1MB 软限制（`GITLAB_DUO_WORKFLOW_GOAL_SOFT_OVERFLOW_BYTES`）和 2MB 硬限制（`GITLAB_DUO_WORKFLOW_GOAL_HARD_OVERFLOW_BYTES`）约束。发出以 `omp_agent` 为目标的环境内联工作流定义（`buildGitLabDuoWorkflowInlineFlowConfig`）。
- **WebSocket 动作桥接**：工具定义被转换为 MCP 格式（`buildGitLabDuoWorkflowMcpTools`），放入 `startRequest.mcpTools`。通过 WebSocket 传入的 `runMCPTool`/`run_mcp_tool` 动作被提取（`extractGitLabDuoWorkflowAction`）、在本地执行，并通过 `buildGitLabDuoWorkflowActionResponse` 返回。

### 身份验证与用量 \{#auth--usage-30}

- **注册表与凭据解析**：在 `packages/catalog/src/compat/rules/auth/gitlab-duo-agent.kdl` 中声明，要求 `GITLAB_TOKEN`（通过 `env "GITLAB_TOKEN"` 提供的 PAT 或 OAuth 令牌）。
- **OAuth PKCE 与官方客户端 ID**：在 `packages/catalog/src/compat/rules/auth/gitlab-duo-agent.kdl`（`login "oauth-code"`，引擎 `packages/ai/src/registry/engine/oauth-code.ts`）中声明的浏览器身份验证使用 S256 PKCE，并在 `vscode://gitlab.gitlab-workflow/authentication` 上设置 `manual-only=#true`。它使用官方 GitLab VS Code 客户端 ID（`36f2a70cddeb5a0889d4fd8295c241b7e9848e89cf9e599d0eed2d8e5350fbf5`），支持在 VS Code 拦截重定向时手动粘贴回调 URL。令牌刷新在 KDL 规则的 `refresh` 下声明（`packages/ai/src/registry/engine/refresh.ts`）。
- **Direct Access 令牌**：通过 `POST /api/v4/ai/duo_workflows/direct_access` 请求临时凭据（`packages/ai/src/providers/gitlab-duo-workflow.ts` 中的 `requestGitLabDuoWorkflowDirectAccess`）。`packages/ai/src/usage/` 下没有专用用量模块。
- **上下文遥测用量**：`extractGitLabDuoWorkflowContextUsage` 提取检查点遥测（`agent_context_usage`），优先采用 `"Chat Agent"` 和 `"context_builder"` 条目，并通过 `applyGitLabDuoWorkflowContextUsage` 更新 token 估算。

### 目录模型处理 \{#catalog-model-handling-29}

- **提供方条目（`gitlab-duo-agent`）**：`packages/catalog/src/compat/rules/providers/gitlab-duo-agent.kdl` 声明默认模型为 `claude_sonnet_4_6_vertex`。环境变量键：`GITLAB_TOKEN`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`claude_sonnet_4_6_vertex`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **指纹化作用域缓存**：`packages/catalog/src/provider-models/special.ts` 中的 `gitLabDuoWorkflowModelManagerOptions` 配置动态模型管理。`gitLabDuoWorkflowModelCacheProviderId` 使用 `Bun.hash`，对 `apiKey` 以及由 `baseUrl`、`namespaceId`、`projectId` 和工作区 `cwd` 组成的作用域字符串做哈希，划分动态目录缓存。
- **GraphQL 发现**：`fetchGitLabDuoWorkflowModels`（`packages/catalog/src/discovery/gitlab-duo-workflow.ts`）调用 `discoverGitLabDuoWorkflowNamespace` 定位根命名空间（通过显式配置、环境变量或匹配 `discoverGitLabRemoteProjectPath` 的 git 远程地址），并执行 GraphQL 查询 `aiChatAvailableModels(rootNamespaceId:)`，查询 `defaultModel`、`selectableModels` 和 `pinnedModel`。
- **模型规范与上下文窗口**：`buildGitLabDuoWorkflowModelSpec` 以 `reasoning: false` 构造模型规范（禁用思考 UI 控件，因为 Duo Agent Platform 在服务器端管理 Anthropic 推理参数）。`resolveGitLabDuoWorkflowContextWindow` 将模型引用映射到上下文窗口大小（Claude Opus/Sonnet：1,000,000；Haiku：200,000；Gemini：1,000,000；GPT-5：400,000；默认：200,000）。
- **后备模型种子生成**：`scripts/generate-models.ts` 将 `buildGitLabDuoWorkflowFallbackModel()`（`claude_sonnet_4_6_vertex`）作为种子，使未验证身份/全新安装包含默认模型条目。

## GMI Cloud (`gmi-cloud`) \{#gmi-cloud-gmi-cloud}

GMI Cloud 是 AI GPU 基础设施和云模型推理提供方，托管开放权重与专有模型端点。它使用 OpenAI Chat Completions 传输，通过托管在 `https://api.gmi-serving.com/v1` 的标准 `/v1` 传输协议运行。

### 特殊处理 \{#special-casings-31}

- 没有超出 OpenAI Chat Completions 管线的处理。

### 身份验证与用量 \{#auth--usage-31}

- **API 密钥登录与验证**：在 `packages/catalog/src/compat/rules/auth/gmi-cloud.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户前往 `https://console.gmicloud.ai`。密钥验证使用 `kind: "models-endpoint"`，访问 `https://api.gmi-serving.com/v1/models`。
- **环境变量**：主要凭据解析检查 `GMI_API_KEY`（`packages/catalog/src/compat/rules/providers/gmi-cloud.kdl` 中的 `envVars`）。
- **提供方注册表**：通过 `packages/ai/src/registry/build.ts`，从 `packages/catalog/src/compat/rules/auth/gmi-cloud.kdl` 编译到 `packages/ai/src/registry/registry.ts`。

### 目录模型处理 \{#catalog-model-handling-30}

- **提供方条目（`gmi-cloud`）**：`packages/catalog/src/compat/rules/providers/gmi-cloud.kdl` 声明默认模型为 `deepseek-ai/DeepSeek-V4-Flash`。环境变量键：`GMI_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **编写的种子条目**：`deepseek-ai/DeepSeek-V4-Flash`；捆绑策略为 `fallback`。限制、能力和价格与这些行一同编写。
- **动态模型发现**：配置 `catalogDiscovery: { label: "GMI Cloud" }`（`packages/catalog/src/compat/rules/providers/gmi-cloud.kdl`），通过 `fetchOpenAICompatibleModels`（`packages/catalog/src/discovery/openai-compatible.ts`）动态查询 `/v1/models`。当 API 凭据可用时，标记为权威的实时发现结果会覆盖缓存或静态条目。

## Groq (`groq`) \{#groq-groq}

Groq 使用 OpenAI Chat Completions 传输（`https://api.groq.com/openai/v1`），为开放权重模型提供由定制 LPU 硬件支撑的高速 LLM 推理。

### 特殊处理 \{#special-casings-32}

`packages/catalog/src/compat/rules/providers/groq.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 提供方默认值：`thinking.mode="effort"`。

- **上下文溢出**：当错误消息匹配 `OVERFLOW_PATTERNS` 中的 `/reduce the length of the messages/i` 时检测到（`packages/ai/src/error/flags.ts`）。

### 身份验证与用量 \{#auth--usage-32}

- **身份验证**：通过 `GROQ_API_KEY` 环境变量验证身份（`packages/catalog/src/compat/rules/providers/groq.kdl`）。
- **提供方注册表**：在 `packages/catalog/src/compat/rules/auth/groq.kdl` 中声明，并编译到 `packages/ai/src/registry/registry.ts`。
- **优先级**：在提供方优先级排序中列于第 19 位（`packages/catalog/src/identity/priority.ts`）。

### 目录模型处理 \{#catalog-model-handling-31}

- **提供方条目（`groq`）**：`packages/catalog/src/compat/rules/providers/groq.kdl` 声明默认模型为 `openai/gpt-oss-120b`。环境变量键：`GROQ_API_KEY`。
- **主机匹配**：在主机定义（`packages/catalog/src/hosts.ts`）中通过 URL 标记 `api.groq.com` 或提供方 `groq` 匹配。
- **管理器选项**：通过 `groqModelManagerOptions` 配置，目标为 `https://api.groq.com/openai/v1`（`packages/catalog/src/provider-models/openai-compat.ts`）。

## Hugging Face Inference (`huggingface`) \{#hugging-face-inference-huggingface}

Hugging Face Inference 使用指向 `https://router.huggingface.co/v1` 的 OpenAI Chat Completions 传输（`openai-completions`），提供对托管于 Hugging Face Hub 的开源模型无服务器端点的访问。该提供方支持包括 DeepSeek-R1 在内的模型进行无服务器 LLM 生成。

### 特殊处理 \{#special-casings-33}

`packages/catalog/src/compat/rules/providers/huggingface.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 Qwen/Qwen3-235B-A22B-Thinking-2507：`thinking.requiresEffort=true`。
- 对于模型 deepseek-ai/deepseek-v3.*：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 zai-org/glm-4*、zai-org/GLM-5、zai-org/GLM-5.1：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 zai-org/GLM-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 提供方默认值：`thinking.mode="effort"`。

- **标准传输管线**：没有超出 OpenAI Chat Completions 管线的处理（`packages/ai/src/providers/openai-completions.ts`）。

### 身份验证与用量 \{#auth--usage-33}

- **交互式 CLI 登录**：在 `packages/catalog/src/compat/rules/auth/huggingface.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入细粒度用户访问令牌（占位符 `hf_...`）。
- **细粒度令牌权限**：身份验证设置引导用户前往 `https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained`（`packages/catalog/src/compat/rules/auth/huggingface.kdl` 中的 `AUTH_URL`），该链接会自动选中具有所需“调用推理提供方”权限（`inference.serverless.write`）的细粒度令牌。
- **凭据验证**：在 `packages/catalog/src/compat/rules/auth/huggingface.kdl` 中声明，使用轻量聊天补全请求（`validate "chat-completions"`），针对基础 URL `https://router.huggingface.co/v1` 和验证模型 `openai/gpt-oss-120b` 验证 API 密钥。

### 目录模型处理 \{#catalog-model-handling-32}

- **提供方条目（`huggingface`）**：`packages/catalog/src/compat/rules/providers/huggingface.kdl` 声明默认模型为 `deepseek-ai/DeepSeek-R1`。环境变量键：`HUGGINGFACE_HUB_TOKEN`、`HF_TOKEN`。
- **模型管理器选项**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `huggingfaceModelManagerOptions` 通过 `createSimpleOpenAICompletionsOptions` 构造管理器选项，绑定默认基础 URL `https://router.huggingface.co/v1`，并使用捆绑的参考规范映射静态模型（`mapWithBundledReference`）。
- **目录描述符**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `openAiCompletionsDescriptor` 在 `PROVIDER_DESCRIPTORS` 中注册 `huggingface`，目标为 `https://router.huggingface.co/v1`。
- **目录发现**：通过 `catalogDiscovery` 参与目录生成，`generate-models.ts`（`packages/catalog/scripts/generate-models.ts`）通过 `resolveProviderApiKey` 解析 API 令牌，并针对 `https://router.huggingface.co/v1/models` 调用 `fetchOpenAICompatibleModels`（`packages/catalog/src/discovery/openai-compatible.ts`），发现可用的 Hub 推理端点。

## Kilo Gateway (`kilo`) \{#kilo-gateway-kilo}

Kilo Gateway（`kilo`）是 AI 模型聚合与代理服务（`https://api.kilo.ai/api/gateway`），使用 OpenAI Chat Completions 传输（`api: "openai-completions"`）。它支持通过 `KILO_API_KEY` 或设备代码 OAuth 流程（`/login kilo`）验证身份，并允许从其 OpenAI 兼容的 `/models` 目录端点进行未验证身份的动态模型发现。

### 特殊处理 \{#special-casings-34}

`packages/catalog/src/compat/rules/providers/kilo.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于模型 moonshotai/kimi-k2.6：`streamIdleTimeoutMs=300000`。
- 对于类别 glm；系列 turbo：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 *thinking-2507、arcee-ai/trinity-large-thinking、nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free：`thinking.requiresEffort=true`。
- 对于模型 deepseek/deepseek-chat-v3.1：`requiresReasoningContentForAllAssistantTurns=true`、`thinking.efforts=["high","max"]`。
- 对于模型 deepseek/deepseek-r1、deepseek/deepseek-r1-0528、deepseek/deepseek-v3.1-terminus、deepseek/deepseek-v3.2、deepseek/deepseek-v3.2-exp、deepseek/deepseek-v4-flash、deepseek/deepseek-v4-flash-0731、deepseek/deepseek-v4-flash:discounted、~deepseek/deepseek-v4-flash-latest：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 openai/gpt-5.1-codex、openai/gpt-5.1-codex-max：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 openai/gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 z-ai/glm-4.5*、z-ai/glm-4.7*、~google*、~openai*、z-ai/glm-4.6、z-ai/glm-4.6v、z-ai/glm-5、z-ai/glm-5.1、~moonshotai/kimi-latest：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 z-ai/glm-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 提供方默认值：`thinking.mode="effort"`。

- **设备代码 OAuth 身份验证**：在 `packages/catalog/src/compat/rules/auth/kilo.kdl`（`login "custom" hook="kilo"`）中声明，并在 `packages/ai/src/registry/oauth/kilo.ts`（`loginKilo`）中实现，通过 `POST https://api.kilo.ai/api/device-auth/codes` 发起设备授权，返回用户 `code`、`verificationUrl` 和以秒计的 `expiresIn`。它通过 `callbacks.onAuth` 显示说明，并每 5,000 毫秒轮询 `GET https://api.kilo.ai/api/device-auth/codes/<userCode>`，直至到期。处理 HTTP 202（待定）、403/410（拒绝/过期）和限速（HTTP 429），批准时（`pollData.status === "approved"`）返回有效期为 1 年的访问令牌。支持通过 `callbacks.signal` 取消。
- **主机 URL 匹配**：`packages/catalog/src/hosts.ts` 中的主机映射将 URL 标记 `api.kilo.ai` 与提供方 `"kilo"` 关联。
- **提供方优先级**：包含在 `packages/catalog/src/identity/priority.ts` 的提供方优先级序列中（`"opencode-go"`、`"kilo"`、`"vercel-ai-gateway"`）。

### 身份验证与用量 \{#auth--usage-34}

- **API 密钥与 OAuth 令牌**：通过静态环境变量 `KILO_API_KEY` 或设备代码流程（`/login kilo`）颁发的 OAuth 访问令牌验证身份。
- **Bearer 令牌请求头**：请求以标准 Bearer 令牌（`Authorization: Bearer <key>`）传递凭据，基础 URL 为 `https://api.kilo.ai/api/gateway`。

### 目录模型处理 \{#catalog-model-handling-33}

- **提供方条目（`kilo`）**：`packages/catalog/src/compat/rules/providers/kilo.kdl` 声明默认模型为 `anthropic/claude-opus-5`。环境变量键：`KILO_API_KEY`。
- **模型管理器与传输描述符**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `kiloModelManagerOptions` 将 `providerId: "kilo"` 映射到基础 URL `https://api.kilo.ai/api/gateway`，并将动态模型发现委托给 `fetchOpenAICompatibleModels`。与 `openAiCompletionsDescriptor("kilo", "kilo", "https://api.kilo.ai/api/gateway")` 关联。

## Kimi Code (`kimi-code`, `kimi-code-global`) \{#kimi-code-kimi-code-kimi-code-global}

Kimi Code 通过 Moonshot AI 的 `/coding/v1` API 端点，提供由订阅支持的 Kimi 模型（`kimi-for-coding`、`k3`）访问。Moonshot 运行两个独立的区域部署，账号和令牌受区域作用域限制，因此每个部署都是单独的提供方：`kimi-code` 对应中国内地（`auth.kimi.com`、`api.kimi.com`），`kimi-code-global` 对应全球（`auth.kimi.ai`、`api.kimi.ai`）。区域端点作为编译后的提供方目录 `base-url` 事实，声明在 `packages/catalog/src/compat/rules/providers/kimi-code.kdl` 和 `kimi-code-global.kdl` 中，并通过 `providerBaseUrl(...)`（`packages/catalog/src/compat/providers.ts`）使用；两个提供方共享下述所有传输、兼容和用量路径。它基于 [Kimi Code](#kimi-code) 传输管线运行，将请求执行委托给 `streamKimi`（`packages/ai/src/providers/kimi.ts`）和 `streamOpenAIAnthropicShim`（`packages/ai/src/providers/openai-anthropic-shim.ts`）。

### 特殊处理 \{#special-casings-35}

`packages/catalog/src/compat/rules/providers/kimi-code.kdl` 和 `kimi-code-global.kdl` 中的提供方专用覆盖（两者相同；更具体的选择器覆盖提供方默认值）：

- 对于类别 kimi；系列 k3：`thinkingFormat="openai"`。
- 对于类别 kimi：`thinkingFormat="zai"`。
- 对于类别 unknown：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="kimi"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 kimi-for*：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 提供方默认值：`kimiApiFormat="anthropic"`、`supportsPromptCacheKey=true`、`thinking.mode="effort"`、`streamMarkupHealingPattern="kimi"`、`kimiCodeEndpoint=true`（目录轴 `kimi-code-endpoint`）。

- **提示缓存键共享**：`isKimiCodeEndpoint`（`packages/catalog/src/compat/kimi-code.ts`，由两个 Kimi Code KDL 文件中提供方根级的 `kimi-code-endpoint #true` 规则支撑）控制提示缓存；Anthropic 兼容请求（`packages/ai/src/providers/anthropic.ts`）和 OpenAI 兼容请求（`packages/ai/src/providers/openai-completions.ts`）都会附加通过 `getOpenAIPromptCacheKey` 得出的 `prompt_cache_key`，以在传输切换时共享亲和性身份。
- **通用请求头前置**：`packages/ai/src/providers/openai-completions.ts` 中的 `prependHeaders` 将 `getKimiCommonHeaders()`（`packages/ai/src/registry/oauth/kimi.ts`）注入所有模型解析出 `kimi-code-endpoint` 能力的请求。
- **推理防护**：`stream.ts` 在执行前检查 `isKimiCodeEndpoint`，禁用 K3 上不受支持的推理配置（`packages/ai/src/providers/openai-completions.ts`）。

### 身份验证与用量 \{#auth--usage-35}

- **设备 OAuth 流程**：在 `packages/catalog/src/compat/rules/auth/kimi-code.kdl` 和 `kimi-code-global.kdl` 中声明为 `login "device-code"` 规则（`packages/ai/src/registry/engine/device-code.ts`），请求头钩子位于 `packages/ai/src/registry/oauth/kimi.ts`。使用 OAuth 2.0 设备代码授权（共享 `client-id` `17e5f671-d194-4dfb-9706-5516cb48c098`），`kimi-code` 针对 `https://auth.kimi.com`（可通过 `KIMI_CODE_OAUTH_HOST` 或 `KIMI_OAUTH_HOST` 覆盖），`kimi-code-global` 针对 `https://auth.kimi.ai`（可通过 `KIMI_GLOBAL_OAUTH_HOST` 或 `KIMI_GLOBAL_AUTH_HOST` 覆盖，然后是共享的 `KIMI_CODE_OAUTH_HOST` / `KIMI_OAUTH_HOST`）。
- **API 密钥身份验证**：`kimi-code` 声明提供方级 `env "KIMI_API_KEY"`，`kimi-code-global` 声明提供方级 `env "KIMI_CODE_GLOBAL_API_KEY"`，因此受区域作用域限制的 Kimi Code Console 密钥可在运行时对其区域部署验证身份（无需 `/login`），且不会削弱 OAuth；每个密钥只服务于一个区域。两个提供方均不使用 `MOONSHOT_API_KEY`。
- **指纹与设备持久化**：`getKimiCommonHeaders()` 注入跟踪请求头（`User-Agent: KimiCLI/<ver>`、`X-Msh-Platform`、`X-Msh-Version`、`X-Msh-Device-Name`、`X-Msh-Device-Model`、`X-Msh-Os-Version`、`X-Msh-Device-Id`）。`getDeviceId` 将随机十六进制 UUID 持久化到 `path.join(getAgentDir(), "kimi-device-id")`（模式 `0600`），文件写入失败时回退到内存中的临时 UUID。
- **用量与配额跟踪器**：`kimiUsageProvider` / `kimiGlobalUsageProvider`（`packages/ai/src/usage/kimi.ts`）在提供方的区域主机上获取 `GET /coding/v1/usages`（`https://api.kimi.com/coding/v1/usages`，可通过 `KIMI_CODE_BASE_URL` 配置；`kimi-code-global` 使用 `https://api.kimi.ai/coding/v1/usages`）。OAuth 访问令牌和 API 密钥凭据均作为 bearer 令牌接受；已过期 OAuth 令牌会直接短路（`credential.expiresAt <= nowMs`），而不是进行探测。将 `usage` 和 `limits` 解析为 `UsageLimit` 条目，窗口重置时间缺失时，将行级重置时间戳（`reset_at`、`resetTime`、`ttl`）带入窗口对象。绝不使用 Moonshot 密钥作为后备。

### 目录模型处理 \{#catalog-model-handling-34}

- **提供方条目（`kimi-code`、`kimi-code-global`）**：`packages/catalog/src/compat/rules/providers/kimi-code.kdl` 和 `kimi-code-global.kdl` 声明默认模型为 `kimi-for-coding`，环境变量键为 `KIMI_API_KEY`（`kimi-code`）/ `KIMI_CODE_GLOBAL_API_KEY`（`kimi-code-global`）；发现通过 `kimiCodeModelManagerOptions(config, provider)` 构建。生成期间未实时发现全球提供方时，生成器会将 `kimi-code` 行镜像到 `kimi-code-global`（`projectKimiCodeGlobalModels`）。
- **动态模型发现**：`kimiCodeModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）使用带有 `KimiCLI/1.0` 请求头的 `fetchOpenAICompatibleModels` 查询 `/coding/v1/models`。通过 `kimiSupportsReasoning`、`mapKimiThinking` 和 `mapKimiApiFormat` 映射模型（将 `compat.kimiApiFormat` 设为 `"anthropic"` 或 `"openai"`）。

## LiteLLM (`litellm`) \{#litellm-litellm}

LiteLLM 是开源 AI 代理和网关，通过一个 OpenAI 兼容 API 主机统一访问多个 LLM 提供方。在 `pi` 中，它使用 OpenAI Chat Completions（`openai-completions`）传输管线运行。

### 特殊处理 \{#special-casings-36}

- **Anthropic 与 Bedrock 工具兼容（`packages/ai/src/providers/openai-completions.ts`）**：
   - 当 `context.tools` 为 `undefined`，但对话历史包含工具调用时，将 `params.tools` 设为 `[]`，以兼容经 LiteLLM 访问 Anthropic。
   - 当 `context.tools` 显式为空（`[]`，如 `/btw` 或后台轮次）时，省略 `params.tools` 和 `tool_choice: "none"`，使 LiteLLM → Bedrock 路由不会生成无效的空 `toolConfig` 块。
- **遥测与网关响应头检测（`packages/agent/src/telemetry.ts`、`packages/ai/src/auth-gateway/http.ts`）**：`detectGatewayFromHeaders` 检查 `x-litellm-call-id`（回退到 `x-litellm-model-id` 或 `x-litellm-model-group`），以填充 `omp.gen_ai.gateway.*` span 属性。身份验证网关 HTTP 端点公开 `x-litellm-model-id`、`x-litellm-model-api-base`、`x-litellm-response-cost` 和 `x-litellm-response-duration-ms`。

### 身份验证与用量 \{#auth--usage-36}

- **凭据与环境变量（`packages/catalog/src/compat/rules/providers/litellm.kdl`、`packages/catalog/src/compat/rules/auth/litellm.kdl`）**：通过 `LITELLM_API_KEY` 验证身份。
- **登录引导（`packages/catalog/src/compat/rules/auth/litellm.kdl`）**：声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户查看设置文档（`https://docs.litellm.ai/docs/proxy/deploy`），提示输入主密钥/虚拟密钥（`sk-...`），并说明可使用 `LITELLM_BASE_URL` 指定自定义代理端点。CLI `login` 委托给 `SqliteAuthCredentialStore.login()`。
- **默认基础 URL（`packages/catalog/src/provider-models/cache-provider-id.ts`）**：解析为 `Bun.env.LITELLM_BASE_URL` 或 `http://localhost:4000/v1`。
- **用量报告（`packages/ai/src/usage/litellm.ts`）**：从管理基础地址（基础 URL 去掉末尾 `/v1`）读取 `GET /key/info`（仅 `sk-` 密钥）和 `GET /v2/user/info`，分别作为美元预算报告（支出、`max_budget`、`budget_duration` 窗口、重置），使用推理将发送的那一个密钥进行探测（`usesRequestKey`）。`ModelRegistry` 通过 `usage.replaceConfiguredProviders` 为 `litellm` 以及所有不在 `disabledProviders` 中的 `discovery.type: litellm` 提供方注册它。401 会丢弃该作用域；尝试的每个作用域都返回 401 时，会丢弃缓存报告。

### 目录模型处理 \{#catalog-model-handling-35}

- **提供方条目（`litellm`）**：`packages/catalog/src/compat/rules/providers/litellm.kdl` 声明默认模型为 `claude-opus-5-5`。环境变量键：`LITELLM_API_KEY`。
- **丰富管理端点发现（`packages/catalog/src/provider-models/openai-compat.ts`）**：`fetchLiteLLMRichModels` 探测 `/model_group/info`、`/v2/model/info`、`/model/info` 和 `/v1/model/info`。它过滤哨兵占位 ID（`all-team-models`、`all-proxy-models`、`no-default-models`）和已知任务专用模式（`audio_speech`、`audio_transcription`、`batch`、`embedding`、`guardrail`、`image_edit`、`image_generation`、`moderation`、`ocr`、`rerank`、`search`、`vector_store`、`video_generation`），同时保留 null、缺失、格式错误和未知模式。它解析上下文限制（`max_input_tokens`）、输出限制（`max_output_tokens`）、`supports_vision`、`supports_reasoning`、`supported_openai_params`（映射 `reasoning_effort`）以及按 token 计价的价格（`input_cost_per_token`、`output_cost_per_token`，缓存读写费用映射为美元/百万 token）。
- **后备发现与显示名称（`packages/catalog/src/provider-models/openai-compat.ts`）**：丰富端点失败时，发现回退到 `/v1/models`（`fetchOpenAICompatibleModels`），应用相同的模式过滤，并根据 `models.dev` 参考解析规范。从显示名称中剥离转售商倍率后缀（如 `(1.5x usage)`）。
- **兼容覆盖（`packages/catalog/src/provider-models/openai-compat.ts`）**：为所有解析出的模型硬编码 `compat.supportsStore: false` 和 `compat.supportsDeveloperRole: false`。

## LM Studio (`lm-studio`) \{#lm-studio-lm-studio}

LM Studio 是运行在用户硬件上的本地 OpenAI 兼容模型服务器（默认 `http://127.0.0.1:1234/v1`）。它使用 [OpenAI Chat Completions](#openai-chat-completions) 传输（`api: "openai-completions"`）流式发送聊天补全和工具调用。

### 特殊处理 \{#special-casings-37}

`packages/catalog/src/compat/rules/providers/lm-studio.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 提供方默认值：`supportsNamedToolChoice=false`。

- **语法模式规范化**：在目录兼容配置（`packages/catalog/src/compat/resolve.ts`）中配置 `toolSchemaFlavor: "grammar"`。工具 JSON 模式通过 `sanitizeSchemaForGrammar`（`packages/ai/src/utils/schema/normalize.ts`）清理，将属性位置的裸布尔值 `true` 或 `{}` 子模式扩展为基本类型联合，以避免 GBNF 语法解析器失败（`Unrecognized schema: true`，问题 #5914）。

### 流式行为 \{#stream-behavior-17}

- **看门狗超时下限**：配置 `streamFirstEventTimeoutMs: 0`（`packages/catalog/src/compat/resolve.ts`），在本地模型冷加载或提示预填充较长时禁用响应前首事件看门狗，并设置 `streamIdleTimeoutMs: 300_000`（事件间空闲超时下限为 300 秒；参见[提供方兼容参考](./provider-compat-reference.md)），防止 token 生成较慢时取消流。

### 身份验证与用量 \{#auth--usage-37}

- **无密钥本地身份验证**：在 `packages/catalog/src/compat/rules/auth/lm-studio.kdl` 中定义为无密钥提供方（`empty-fallback "lm-studio-local"`，`packages/catalog/src/compat/rules/providers/lm-studio.kdl` 中的 `allowUnauthenticated: true`）。未提供 `LM_STUDIO_API_KEY` 时，使用占位符 `"lm-studio-local"`。
- **端点与凭据**：基础 URL 默认为 `http://127.0.0.1:1234/v1` 或 `LM_STUDIO_BASE_URL`。交互式 CLI 登录在 `packages/catalog/src/compat/rules/auth/lm-studio.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。
- **用量核算**：使用标准 OpenAI Chat Completions 用量核算（`packages/ai/src/providers/openai-shared.ts` 中的 `calculateOpenAIUsageAccounting`）。

### 目录模型处理 \{#catalog-model-handling-36}

- **提供方条目（`lm-studio`）**：`packages/catalog/src/compat/rules/providers/lm-studio.kdl` 声明默认模型为 `llama-3-8b`。环境变量键：`LM_STUDIO_API_KEY`。模型管理允许未验证身份的访问。
- **原生元数据探测**：通过 `fetchLmStudioNativeModelMetadata` 探测 LM Studio 的原生端点 `/api/v0/models`（使用 `LM_STUDIO_NATIVE_METADATA_TIMEOUT_MS = 250`）。当 `type === "vlm"` 或能力包含 `vision`/`image` 时，设置 `input: ["text", "image"]`（发现期间设置 `imageInputDecoder: "stb"`）。
- **已加载上下文长度**：对于活动模型，`getLmStudioNativeContextWindow` 优先采用 `loaded_context_length`，而非架构上限（`max_context_length`、`context_length`、`max_model_len`），确保上下文窗口限制准确反映当前 VRAM/RAM 分配。

## Meta Model API (`meta`) \{#meta-model-api-meta}

Meta Model API 是 Meta 的商业 API 平台，托管 `muse-spark-1.1` 等第一方模型。它通过指向 `https://api.meta.ai/v1` 的 OpenAI Responses 传输与模型服务交互。

### 特殊处理 \{#special-casings-38}

- **输出 token 钳制绕过**：`resolveOpenAIResponsesOutputClamp`（`packages/ai/src/providers/openai-shared.ts`）检查 `model.provider === "meta"`，允许 Meta 请求输出至多 `model.maxTokens`（131,072 token），而非受默认 64,000 token 上限（`OPENAI_MAX_OUTPUT_TOKENS`）限制。

### 身份验证与用量 \{#auth--usage-38}

- **API 密钥登录**：在 `packages/catalog/src/compat/rules/auth/meta.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），仪表盘 URL 为 `https://developer.meta.com/ai/`。验证向 `https://api.meta.ai/v1/models` 发出 GET 请求（`validate "models-endpoint"`）。
- **环境变量**：密钥解析先检查 `MODEL_API_KEY`，再回退到 `META_API_KEY`（`packages/catalog/src/compat/rules/providers/meta.kdl`）。

### 目录模型处理 \{#catalog-model-handling-37}

- **提供方条目（`meta`）**：`packages/catalog/src/compat/rules/providers/meta.kdl` 声明默认模型为 `muse-spark-1.1`。环境变量键：`MODEL_API_KEY`、`META_API_KEY`。
- **编写的种子条目**：`muse-spark-1.1`、`muse-spark-1.2`、`muse-spark-1.2-contributor`、`muse-spark-1.3`、`muse-spark-1.3-contributor`；捆绑策略为 `always`。限制、能力和价格与这些行一同编写。

## MiniMax (`minimax`) \{#minimax-minimax}

MiniMax 提供可通过国际区域（`api.minimax.io`）和中国内地（`api.minimaxi.com`）端点访问的基础模型（包括 MiniMax-M3 和 M2 代）。标准 `minimax` / `minimax-cn` 和 MiniMax Token Plan `minimax-code` / `minimax-code-cn` 均使用 MiniMax 推荐的“Anthropic Messages”（`/anthropic`）协议；只有 Token Plan 的旧版 `*-lightning` 行保留在“OpenAI Chat Completions”（`/v1`）上。

### 特殊处理 \{#special-casings-39}

`packages/catalog/src/compat/rules/providers/minimax.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 提供方默认值：`reasoningDeltasMayBeCumulative=true`。

- **对象工具参数**：`packages/ai/src/providers/openai-completions.ts` 中的 `streamOpenAICompletions` 拦截将 `function.arguments` 作为原始 JSON 对象而非标准 JSON 字符串流式发送的 MiniMax 兼容主机，将对象增量深度合并到 `block.partialArgs`，并在 `toolcall_end` 之前于 `finishToolCallBlock` 序列化一个可安全拼接的字符串增量。
- **带内 XML 方言**：`packages/ai/src/dialect/minimax.ts` 注册 `minimax` 方言（`<minimax:tool_call>`），用于后备 XML 工具调用解析。
- **网关 API 覆盖**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `OPENCODE_ZEN_API_RESOLUTION` 和 `OPENCODE_GO_API_RESOLUTION` 强制 OpenCode 网关上的 `minimax-m3` / `minimax-m3-free` / `minimax-m2.7` 通过 `openai-completions` 路由到 `/v1/chat/completions`，而非 Anthropic `/v1/messages`。

### 身份验证与用量 \{#auth--usage-39}

- **身份验证密钥**：使用 `packages/catalog/src/compat/rules/providers/minimax.kdl` 中声明的 `MINIMAX_API_KEY`（`minimax`）、`MINIMAX_CODE_API_KEY`（`minimax-code`）和 `MINIMAX_CODE_CN_API_KEY`（`minimax-code-cn`）。
- **Token Plan 登录**：在 `packages/catalog/src/compat/rules/auth/minimax-code.kdl` 和 `minimax-code-cn.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），驱动提示链接到 `https://platform.minimax.io/subscribe/token-plan`（国际站）和 `https://platform.minimaxi.com/subscribe/token-plan`（中国），并使用 `MiniMax-M3` Anthropic Messages 请求验证密钥（`validate "anthropic-messages"`）。
- **用量配额**：`packages/ai/src/usage/minimax-code.ts` 中的 `minimaxCodeUsageProvider` 在配置的 `minimax-code` 基础 URL 的主机根地址轮询 `GET /v1/token_plan/remains`（默认 `https://api.minimax.io`；剥离末尾的 `/v1`、`/anthropic` 和 `/anthropic/v1` 后缀），将每个套餐桶的滚动区间与每周用量窗口解析为剩余百分比，供 `omp usage` 使用。只注册了国际站提供方；`minimax-code-cn` 没有用量提供方。

### 目录模型处理 \{#catalog-model-handling-38}

- **提供方条目（`minimax`）**：`packages/catalog/src/compat/rules/providers/minimax.kdl` 声明默认模型为 `MiniMax-M3`。环境变量键：`MINIMAX_API_KEY`。
- **上下文窗口策略**：`scripts/generated-policies.ts` 为 `minimax`、`minimax-code` 和 `minimax-code-cn` 将 `MiniMax-M3` 上下文限制覆盖为 1,000,000 token，与文档中的 1M 长上下文层级保持一致，而非采用上游定价边界。
- **OpenAI 路由标志**：对于仍在 `openai-completions` 上的 Token Plan 行（旧版 `*-lightning`），`classes/minimax.kdl` 设置 `supports-store #false`、`supports-developer-role #false`、`supports-reasoning-effort #false` 和 `reasoning-content-field "reasoning_content"`。

## MiniMax Token Plan (`minimax-code`) \{#minimax-token-plan-minimax-code}

MiniMax Token Plan 提供方（`minimax-code`，以及其中国内地区域变体 `minimax-code-cn`）通过 Anthropic Messages 传输（国际站为 `https://api.minimax.io/anthropic`，中国为 `https://api.minimaxi.com/anthropic`）提供对 `MiniMax-M3.1-Flash`、`MiniMax-M3` 和 `MiniMax-M2.5` 等 MiniMax 订阅模型的访问，与普通 `minimax` 使用相同的传输。与普通 `minimax`（静态按量付费 API 密钥）不同，`minimax-code` 使用交互式订阅登录流程，并通过 `omp usage` 提供 token 套餐配额监控。

### 特殊处理 \{#special-casings-40}

- **与普通 `minimax` 共享传输**：四个 MiniMax 提供方都通过 `anthropic-messages` 路由，因此 `packages/catalog/src/compat/rules/classes/minimax.kdl` 中的 `class "minimax"` 规则为它们提供相同的自适应思考。`MiniMax-M3.1-Flash` 将 `low`..`max` 作为 `output_config.effort` 发送。该模型始终思考（`thinking.type: "disabled"` 和力度 `none` 返回错误 2013），因此与 M2 系列一样，它标记为 `thinking-requires-effort`：关闭思考、强制关闭和无力度请求，会在到达传输之前，由 `normalizeMandatoryReasoningOptions`（`packages/ai/src/stream.ts`）钳制为 `low`（`test/anthropic-fable-request-shaping.test.ts`）。
- **旧版 lightning 行**：`MiniMax-M2.1-lightning` 和 `MiniMax-M2.5-lightning` 不存在于 models.dev、两个实时模型列表或 Anthropic 端点的受支持模型列表中，因此它们只作为先前快照行保留在 `openai-completions`（`https://api.minimax.io/v1`）上。`providers/minimax-code.kdl` / `minimax-code-cn.kdl` 中的 `models` 残留规则保留其力度模式思考。
- **OpenAI 路由处理（lightning 行、自定义覆盖）**：`classes/minimax.kdl` 为 `minimax-code` / `minimax-code-cn` 设置 `supports-store #false`、`supports-developer-role #false`、`supports-reasoning-effort #false` 和 `reasoning-content-field "reasoning_content"`。`packages/ai/src/providers/openai-completions.ts` 中的 `mergeStreamingArgumentObjects` 深度合并作为部分 JSON 对象流式传输的 `function.arguments`，流解析器则将内联 `<think>`...`</think>` 标签转换为思考块，同时在可见回答内容开始后，对 MiniMax-M3 累积推理快照去重。

### 身份验证与用量 \{#auth--usage-40}

- **交互式订阅登录流程**：在 `packages/catalog/src/compat/rules/auth/minimax-code.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。这是一个交互式 API 密钥提示：引导前往订阅门户（`https://platform.minimax.io/subscribe/token-plan`），提示输入密钥（`sk-...`），并使用 `MiniMax-M3` 通过 `POST /anthropic/v1/messages` 请求（`validate "anthropic-messages"`）验证密钥。
- **环境变量**：国际站 `minimax-code` 从 `MINIMAX_CODE_API_KEY` 解析凭据，中国 `minimax-code-cn` 从 `MINIMAX_CODE_CN_API_KEY` 解析凭据（普通 `minimax` 解析 `MINIMAX_API_KEY`）。
- **Token Plan 配额跟踪**：`packages/ai/src/usage/minimax-code.ts` 中的 `minimaxCodeUsageProvider` 携带 `Authorization: Bearer ${apiKey}` 在主机根地址查询 `GET /v1/token_plan/remains`，因此捆绑的 Anthropic 路由基础 URL（`https://api.minimax.io/anthropic`）仍会解析为 `https://api.minimax.io/v1/token_plan/remains`（`test/minimax-token-plan-usage.test.ts`）。
- **配额指标解析与规范化**：将 `model_remains[]` 条目解析为滚动区间窗口（`current_interval_*`）和 7 天窗口（`current_weekly_*`）。共享套餐配额 `general` 的作用域设为 `{ shared: true }`。通过 `(100 - remainingPercent) / 100` 计算 `usedFraction`，并在 `current_*_status === 2`（`STATUS_EXHAUSTED`）时覆盖状态。套餐外模型（状态 3 `STATUS_UNLIMITED` 且总量为零）被过滤到 `metadata.unavailableModels`。通过 `base_resp.status_code === 0` 验证成功，以捕获在 HTTP 200 响应下返回的 API 错误。

### 目录模型处理 \{#catalog-model-handling-39}

- **提供方条目（`minimax-code`）**：`packages/catalog/src/compat/rules/providers/minimax-code.kdl` 声明默认模型为 `MiniMax-M3`。环境变量键：`MINIMAX_CODE_API_KEY`。
- **目录接入**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `anthropicMessagesDescriptor` 注册描述符 `"minimax-coding-plan"` 和 `"minimax-cn-coding-plan"`，分别绑定基础 URL `https://api.minimax.io/anthropic` 和 `https://api.minimaxi.com/anthropic`。
- **1M 上下文层级覆盖**：策略生成（`packages/catalog/scripts/generated-policies.ts`）显式覆盖 `minimax-code` 和 `minimax-code-cn` 的 `MiniMax-M3` 上下文窗口，使其报告文档中的 1,000,000 token 层级，而非上游 512,000 token 定价边界。
- **等效按量付费定价**：上游为每个 Token Plan 模型报告 $0。`runtime/behavior.kdl` 中 `minimax-code` / `minimax-code-cn` 的 `pricing-peer` 规则在构建时按其 `minimax` / `minimax-cn` 标价为行定价（Credits 超额按 PAYG 标价计费），因此用量和 `omp stats` 显示等效 PAYG 费用。捆绑的 `MiniMax-M3.1-Flash-Preview` 没有公开价格，借用 `MiniMax-M3` 费率作为估算；`MiniMax-M3.1-Flash` 使用其自身的 `minimax` 标价。`applyPricingPeerFallback`（`packages/catalog/scripts/generated-policies.ts`）只填充零费用行，并按声明顺序跨同类提供方尝试，先尝试规则的别名 `peer-id`，再尝试行自身的 ID。
- **主机匹配**：`packages/catalog/src/hosts.ts` 中的提供方主机映射将 `urlMarkers` `api.minimax.io` 和 `api.minimaxi.com` 与 `minimax`、`minimax-code` 和 `minimax-code-cn` 关联。

## MiniMax Token Plan（中国）(`minimax-code-cn`) \{#minimax-token-plan-china-minimax-code-cn}

MiniMax Token Plan（中国）使用 Anthropic Messages 传输（`anthropic-messages`、`https://api.minimaxi.com/anthropic`），向中国内地订阅用户提供 MiniMax 模型访问；只有旧版 `*-lightning` 行使用 OpenAI Chat Completions（`https://api.minimaxi.com/v1`）。它连接中国区域端点，进行订阅开通、API 密钥验证和模型执行。

### 特殊处理 \{#special-casings-41}

- **OpenAI 路由流处理（lightning 行、自定义覆盖）**：`packages/ai/src/providers/openai-completions.ts` 中的 `mergeStreamingArgumentObjects` 处理 MiniMax 后端将 `function.arguments` 作为原始 JSON 对象而非标准 OpenAI JSON 字符串流式发送的情况（`test/openai-completions-object-tool-arguments.test.ts`）。内容流中的 `<think>` 标签被规范化为思考块（`test/stream-markup-healing.test.ts`），而 `packages/ai/src/dialect/demotion.ts` 中的 `lastCumulativeReasoningBySignature` 和 `streamOpenAICompletionsOnce` 跨文本块切换对 `MiniMax-M3` 的累积推理快照去重。这些测试构造显式 OpenAI 路由 Token Plan 模型（`packages/ai/test/helpers` 中的 `minimaxTokenPlanOpenAIModel`），因为捆绑行基于 Anthropic 路由运行。
- **不支持特性剥离**：在 OpenAI 路由上，请求省略不支持的思考选项（`test/openai-completions-compat.test.ts` 中的“MiniMax Token Plan request payload”，运行 OpenAI 路由 Token Plan 模型）；`classes/minimax.kdl` 应用 `supports-store #false`、`supports-developer-role #false`、`supports-reasoning-effort #false` 和 `reasoning-content-field "reasoning_content"`。

### 身份验证与用量 \{#auth--usage-41}

- **API 密钥与交互式登录**：通过 `MINIMAX_CODE_CN_API_KEY` 验证身份（`packages/catalog/src/compat/rules/providers/minimax-code-cn.kdl`）。交互式登录在 `packages/catalog/src/compat/rules/auth/minimax-code-cn.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），指向 `https://platform.minimaxi.com/subscribe/token-plan`，并针对 `https://api.minimaxi.com/anthropic` 使用 `MiniMax-M3` Anthropic Messages 请求验证粘贴的密钥。
- **端点与主机检测**：API 请求以 `https://api.minimaxi.com/anthropic` 为目标（lightning 行：`https://api.minimaxi.com/v1`）（`packages/catalog/src/models.json`）。在 `packages/catalog/src/hosts.ts` 中，`minimax` 主机分类下的 `urlMarkers` 包含 `api.minimaxi.com`。
- **用量遥测可用性**：与 `minimax-code`（通过 `packages/ai/src/usage/minimax-code.ts` 中的 `minimaxCodeUsageProvider`，从 `https://api.minimax.io/v1/token_plan/remains` 获取配额剩余百分比）不同，`minimax-code-cn` 没有注册用量提供方（`packages/ai/src/auth-storage.ts` 和 `test/minimax-token-plan-usage.test.ts` 中的 `storage.usageProviderFor("minimax-code-cn")` 返回 `undefined`），因此中国区域账号的用量遥测被禁用。

### 目录模型处理 \{#catalog-model-handling-40}

- **提供方条目（`minimax-code-cn`）**：`packages/catalog/src/compat/rules/providers/minimax-code-cn.kdl` 声明默认模型为 `MiniMax-M3`。环境变量键：`MINIMAX_CODE_CN_API_KEY`。
- **1M 上下文窗口覆盖**：`packages/catalog/scripts/generated-policies.ts` 为 `minimax-code-cn`（以及 `minimax-code`、`minimax`）将 `MiniMax-M3` 上下文窗口从上游 512K 定价边界覆盖为 1,000,000（1M）token（`model.contextWindow = 1_000_000`）。
- **目录策略覆盖**：OpenAI 路由行从 `classes/minimax.kdl` 获得 `reasoning-content-field "reasoning_content"`、`supports-store #false`、`supports-developer-role #false` 和 `supports-reasoning-effort #false`；Anthropic 路由行共享普通 `minimax-cn` 的自适应思考规则。

## Mistral (`mistral`) \{#mistral-mistral}

Mistral AI 通过 `api.mistral.ai/v1` 提供对 Mistral、Codestral、Devstral、Ministral 和 Pixtral 模型的访问。请求使用 OpenAI Chat Completions 传输（`openai-completions`）。

### 特殊处理 \{#special-casings-42}

- **兼容配置组（`packages/catalog/src/compat/resolve.ts`：`isMistral`）**：
   - `requiresMistralToolIds` / `toolCallIdKind: "mistral-9-alnum"`（`packages/ai/src/providers/openai-shared.ts`）：将工具调用 ID 限制为 9 字符的字母数字字符串（`[a-zA-Z0-9]{9}`）。
   - `requiresAssistantAfterToolResult`：在工具结果消息之后、后续内容之前，合成一条助手桥接消息（`packages/ai/src/providers/openai-completions.ts`）。
   - `requiresToolResultName`：要求工具结果消息上包含工具函数的 `name` 属性（`packages/ai/src/providers/openai-completions.ts`）。
   - `requiresThinkingAsText`：将推理和思考内容格式化为纯文本块，而非原生推理字段（`packages/catalog/src/compat/resolve.ts`）。
   - `maxTokensField: "max_tokens"`：在请求载荷中发出 `max_tokens`，而非 `max_completion_tokens`（`packages/catalog/src/compat/resolve.ts`）。
- **数组 `delta.content` 流式规范化（`packages/ai/src/providers/openai-completions.ts`：`normalizeStreamingContentText`）**：解包模型（如 `mistral-medium-2604`）以带类型的数组（`[{ type: "text", text: "..." }]`）形式提供 `delta.content` 的流式响应块，避免 `[object Object]` 字符串强制转换缺陷。

### 身份验证与用量 \{#auth--usage-42}

- **身份验证**：使用来自 `MISTRAL_API_KEY` 环境变量的 bearer 令牌验证身份（`packages/catalog/src/compat/rules/providers/mistral.kdl`：`mistral`）。
- **用量跟踪**：标准 OpenAI 聊天补全用量解析（`packages/ai/src/providers/openai-completions.ts`）。

### 目录模型处理 \{#catalog-model-handling-41}

- **提供方条目（`mistral`）**：`packages/catalog/src/compat/rules/providers/mistral.kdl` 声明默认模型为 `devstral-medium-latest`。环境变量键：`MISTRAL_API_KEY`。
- **主机匹配**：主机 URL 标记匹配检查 `mistral.ai`（`packages/catalog/src/hosts.ts`：`mistral`）。

## Modular (`modular`) \{#modular-modular}
Modular Cloud 在 `https://api.modular.com/v1` 通过 OpenAI 兼容 API 提供开放模型。请求使用 OpenAI Chat Completions 传输（`openai-completions`）。

### 特殊处理 \{#special-casings-43}
- **思考传输格式**：`packages/catalog/src/compat/rules/providers/modular.kdl` 对整个提供方使用 OpenRouter 的 `reasoning` 对象（`thinking-format "openrouter"`），API 对每个模型均接受它，因此 models.dev 后续新增的模型无需自己的规则：开启时发送 `reasoning.effort`，关闭时发送 `reasoning.enabled: false`。根据对 API 的测量，有两处按模型覆盖：MiniMax M3.1 Flash 接受嵌套的 `reasoning.effort`（low 到 max），且始终思考，因此使用 `thinking-requires-effort`。MiniMax M3 和 Gemma 4 31B 通过 `reasoning.enabled` 切换推理，并忽略力度，因此只支持开关，通过 `when-thinking` 额外请求体发送 `enabled: true`。

### 身份验证与用量 \{#auth--usage-43}
- **API 密钥登录**：`packages/catalog/src/compat/rules/auth/modular.kdl` 声明指向 Modular Console 的 `login "api-key"` 规则，并通过 `https://api.modular.com/v1/models` 验证密钥。环境变量键：`MODULAR_API_KEY`。

### 目录模型处理 \{#catalog-model-handling-42}
- **仅目录**：models.dev 的 `modular` 条目（`packages/catalog/src/provider-models/openai-compat.ts` 中的 `openAiCompletionsDescriptor`）提供模型、价格和限制，并在运行时接收 models.dev 的增补更新。不进行 `/v1/models` 发现：该端点只返回 ID，还会列出共享端点尚未销售的模型。

## Moonshot (`moonshot`) \{#moonshot-moonshot}

Moonshot 是 Moonshot AI 端点（`https://api.moonshot.ai/v1` 或中国内地 `https://api.moonshot.cn/v1`）的按量付费开放平台提供方。它基于 `OpenAI Chat Completions` 传输引擎（`openai-completions` API 接口）运行，共享 Kimi 系列方言和思考机制（`packages/catalog/src/compat/taxonomy.ts` 中的 Kimi 分类）。它不同于使用订阅设备 OAuth 和订阅端点（`api.kimi.com` / `api.kimi.ai`、`/coding/v1/*`）的 `kimi-code` / `kimi-code-global`。

### 特殊处理 \{#special-casings-44}

`packages/catalog/src/compat/rules/providers/moonshot.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 kimi；系列 k3：`thinkingFormat="openai"`。
- 对于类别 kimi：`thinkingFormat="zai"`、`thinking.mode="effort"`。

- **`MOONSHOT_BASE_URL` 覆盖**：`resolveOpenAIRequestSetup`（`packages/ai/src/providers/openai-shared.ts`）使用 `$env.MOONSHOT_BASE_URL` 覆盖默认目录基础 URL（`api.moonshot.ai/v1`）（例如，密钥被国际站端点拒绝的中国内地平台用户使用 `https://api.moonshot.cn/v1`；问题 #2883）。
- **推理内容重放要求**：`requiresReasoningContentForToolCalls`（`packages/catalog/src/compat/resolve.ts`）强制工具调用续接轮次重放此前的 `reasoning_content`（或合成占位符 `.`），防止 Moonshot 中止或从头重新推导推理。

### 身份验证与用量 \{#auth--usage-44}

- **API 密钥身份验证**：在 `packages/catalog/src/compat/rules/auth/moonshot.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户前往仪表盘 `https://platform.moonshot.ai/console/api-keys`。
- **端点验证**：通过 `GET ${MOONSHOT_BASE_URL || "https://api.moonshot.ai/v1"}/models` 验证密钥（`packages/catalog/src/compat/rules/auth/moonshot.kdl` 中的 `validate "models-endpoint"`，设置 `base-url-env="MOONSHOT_BASE_URL"`）。
- **环境变量解析**：`packages/catalog/src/compat/rules/providers/moonshot.kdl` 中的 `envVars: ["MOONSHOT_API_KEY"]` 只接受 `MOONSHOT_API_KEY`。旧版 `KIMI_API_KEY` 后备别名（问题 #2883）已被移除，因为只要设置了 Kimi Code 密钥，它就会静默地对 Moonshot 验证身份，从而暴露 Moonshot 模型；`KIMI_API_KEY` 现在属于中国内地 `kimi-code` 提供方，全球 `kimi-code-global` 提供方使用 `KIMI_CODE_GLOBAL_API_KEY`。
- **无专用用量跟踪器**：token 用量直接通过 `openai-completions` 中 OpenAI 流式块的 `usage` 对象返回；`packages/ai/src/usage/` 中没有单独的用量 API 或文件。

### 目录模型处理 \{#catalog-model-handling-43}

- **提供方条目（`moonshot`）**：`packages/catalog/src/compat/rules/providers/moonshot.kdl` 声明默认模型为 `kimi-k2.7-code`。环境变量键：`MOONSHOT_API_KEY`。
- **动态模型发现**：`moonshotModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）使用 `createOpenAICompatibleModelManagerOptions`，配置 `defaultBaseUrl: Bun.env.MOONSHOT_BASE_URL ?? "https://api.moonshot.ai/v1"`。
- **动态 K3 与 K2.x 模型映射**：在 `moonshotModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）中：
   - 没有参考模型的 `kimi-k3` 条目被赋予 `reasoning: true`、输入 `["text", "image"]`、`MOONSHOT_KIMI_K3_COST`、`contextWindow: 1_000_000`、`maxTokens: 131_072` 和基于力度的 `thinking` 配置（问题 #5756）。
   - `kimi-k2.x` 条目（如 `kimi-k2.5`、`kimi-k2.6`）标记为 `reasoning: true`、视觉 `["text", "image"]` 和多层级力度（`[Minimal, Low, Medium, High]`），确保生成 `thinking` 载荷，使模型不会停滞（问题 #2113）。
- **主机与优先级 token 分类**：`packages/catalog/src/hosts.ts` 中的主机标记 `moonshotNative`（`urlMarkers: ["api.moonshot.ai", "api.kimi.com", "api.kimi.ai"]`）映射原生 Moonshot 端点。`packages/catalog/src/identity/priority.ts` 中的系列优先级 token 将 `"moonshot"` 排在 `"kimi-code"` 之后紧邻的位置。

## NanoGPT (`nanogpt`) \{#nanogpt-nanogpt}

NanoGPT 是按 token 付费的 API 网关，通过 OpenAI 兼容接口公开多种开放权重和商业语言模型。它使用 OpenAI Chat Completions 传输（`openai-completions`）执行请求，默认基础 URL 为 `https://nano-gpt.com/api/v1`。

### 特殊处理 \{#special-casings-45}

`packages/catalog/src/compat/rules/providers/nanogpt.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于模型 moonshotai/kimi-k2.6:thinking：`streamIdleTimeoutMs=300000`。
- 对于类别 anthropic；修订版本 >=4.0.0 <4.5.0：`thinking.requiresEffort=true`。
- 对于类别 glm；系列 flash：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 glm；系列 turbo：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 openai；系列 o-series；修订版本 >=4.0.0 <4.1.0：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 *5.2:thinking、*glm-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 对于模型 _glm-5.1、aion-labs/aion-3_、google*latest、holo*、inclusionai*thinking、meta/*、nanogpt*、nex-agi/nex*、nousresearch/hermes-4*、nvidia*b、nvidia*thinking、poolside*、sakana*、sarvam*、tencent/hy*、thinkingmachines*thinking、z-ai/glm-4*、zai-org/glm-4*thinking、zai-org/glm-5-original*、TEE/glm-5-1、aion-labs/aion-2.0、arcee-ai/trinity-large、arcee-ai/trinity-mini、bytedance-seed/seed-2.0-lite、inclusionai/ring-2.6-1t、longcat-2.0:thinking、mercury-2、minimax/minimax-latest、mistralai/devstral-2-123b-instruct-2512、moonshotai/kimi-latest、nvidia/nvidia-nemotron-nano-9b-v2、openai/gpt-chat-latest、openai/gpt-latest、openai/o1、openai/o3、openai/o3-deep-research、openai/o3-pro-2025-06-10、pokee-isaac、sonar-pro、tngtech/tng-r1t-chimera、upstage/solar-pro-3、zai-org/glm-4.7、zai-org/glm-4.7-original、zai-org/glm-5、zai-org/glm-5.1:thinking、zai-org/glm-5:thinking、zai-org/glm-latest：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 Qwen/Qwen3-235B-A22B-Thinking-2507：`thinking.requiresEffort=true`。
- 对于模型 claw、hermes：`thinking.efforts=["low","medium","high"]`。
- 对于模型 deepseek/deepseek-latest：`requiresReasoningContentForAllAssistantTurns=true`、`thinking.efforts=["high","max"]`。
- 对于模型 deepseek/deepseek-v4-flash*、deepseek-ai/DeepSeek-R1-0528、deepseek/deepseek-v3.2:thinking：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 linkup-research：`thinking.defaultLevel="high"`、`thinking.efforts=["low","medium","high","xhigh"]`、`thinking.requiresEffort=true`。
- 对于模型 nvidia/nemotron-3-nano-omni-30b-a3b-reasoning：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.requiresEffort=true`。
- 对于模型 openai/gpt-5.1-codex、openai/gpt-5.1-codex-max：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 openai/gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-Derestricted、Qwen3.5-27B-Claude-4.6-Opus-Reasoning-Distilled-Derestricted-Lite：`disableReasoningOnForcedToolChoice=false`、`supportsStore=false`、`thinkingFormat="qwen"`。
- 对于模型 Gemma-4-31B-Claude-4.6-Opus-Reasoning-Distilled：`disableReasoningOnForcedToolChoice=false`、`thinking.requiresEffort=true`。
- 对于模型 _deepseek-r1-distill_：`streamMarkupHealingPattern="dsml"`。
- 提供方默认值：`thinking.mode="effort"`。

- **直接路由执行**：NanoGPT 避免在 DeepSeek 请求上追加 `:tools` 模型路由后缀，防止 NanoGPT 服务器端工具解析器处理复杂模式时触发带有 `code: "malformed_tool_call"` 的 `502` 错误。
- **带索引工具增量保留**：依赖 `streamOpenAICompletionsOnce`（`packages/ai/src/providers/openai-completions.ts`）中的 `tool_calls[].index` 跟踪，确保来自 NanoGPT 的并行流式工具调用不会在增量之间合并或丢失参数。

### 身份验证与用量 \{#auth--usage-45}

- **API 密钥与环境变量**：通过 `NANO_GPT_API_KEY` 验证身份（由 `packages/ai/src/stream.ts` 中的 `getEnvApiKey` 解析，并在目录描述符 `packages/catalog/src/compat/rules/providers/nanogpt.kdl` 中配置）。
- **交互式登录**：在 `packages/catalog/src/compat/rules/auth/nanogpt.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入从 `https://nano-gpt.com/api` 链接获取的 API 密钥，并通过针对 `https://nano-gpt.com/api/v1/models` 的 `validate "models-endpoint"` 验证凭据。

### 目录模型处理 \{#catalog-model-handling-44}

- **提供方条目（`nanogpt`）**：`packages/catalog/src/compat/rules/providers/nanogpt.kdl` 声明默认模型为 `openai/gpt-5.5`。环境变量键：`NANO_GPT_API_KEY`。

## Novita (`novita`) \{#novita-novita}

Novita AI 是 AI 云平台，为开放模型提供无服务器的 OpenAI 兼容 LLM 推理。它通过 `https://api.novita.ai/openai/v1` 使用 OpenAI Chat Completions 传输。

### 特殊处理 \{#special-casings-46}

- 没有超出 OpenAI Chat Completions 管线的处理。

### 身份验证与用量 \{#auth--usage-46}

- **身份验证**：在 `packages/catalog/src/compat/rules/auth/novita.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），使用标准 API 密钥提示（`sk_...`），链接到 `https://novita.ai/settings/key-management`。通过目录描述符（`packages/catalog/src/compat/rules/providers/novita.kdl`）检查环境变量 `NOVITA_API_KEY`。
- **基于推理的密钥验证**：在 `packages/catalog/src/compat/rules/auth/novita.kdl` 中，使用 `moonshotai/kimi-k2.7-code` 向 `/chat/completions` 发送请求来验证密钥（`validate "chat-completions"`）。Novita 的 Developer 和 Basic 团队角色缺少 `/openapi/v1/billing/balance/detail` 权限，因此推理验证避免拒绝有效的开发者密钥。

### 目录模型处理 \{#catalog-model-handling-45}

- **提供方条目（`novita`）**：`packages/catalog/src/compat/rules/providers/novita.kdl` 声明默认模型为 `moonshotai/kimi-k2.7-code`。环境变量键：`NOVITA_API_KEY`。
- **发现替换**：权威发现成功后会替换后备提供方行，而不是保留已退役的种子模型。
- **模型发现**：通过 `novitaModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）配置，设置 `defaultBaseUrl: "https://api.novita.ai/openai/v1"` 和 `dynamicModelsAuthoritative: true`。
- **未验证身份的发现**：描述符设置 `catalogDiscovery.allowUnauthenticated: true`（`packages/catalog/src/compat/rules/providers/novita.kdl`），允许在没有 API 密钥的情况下从 `/openai/v1/models` 获取公开目录。
- **模型过滤**：`filterModel` 验证活动状态（`status === 1` 或非数字），要求 `endpoints` 包含 `"chat/completions"`，检查正值 `max_output_tokens`，并使用 `isPublicNovitaModelId` 排除内部测试模型 ID（排除以 `ai_infer_test` 开头的前缀）。
- **费用缩放**：`toNovitaCostPerMillion` 将价格字段（`input_token_price_per_m`、`output_token_price_per_m`、`pricing.input_cache_read.price_per_m`）除以 10,000，将 Novita 每百万 token 以万分之一美元为单位的费率，缩放为标准的美元/百万 token。
- **能力与元数据**：`mapNovitaModel` 通过 `novitaArrayIncludes` 检查 `features` 中的 `"reasoning"` 和 `"function-calling"`，使用 `toInputCapabilities` 解析输入模态，并提取上下文/输出窗口边界。

## NVIDIA (`nvidia`) \{#nvidia-nvidia}

NVIDIA NIM（Inference Microservice，推理微服务）通过 OpenAI Chat Completions 传输（`openai-completions` API）提供对托管的开放和专有基础模型的访问。基础端点默认为 `https://integrate.api.nvidia.com/v1`。

### 特殊处理 \{#special-casings-47}

`packages/catalog/src/compat/rules/providers/nvidia.kdl` 中的提供方专用覆盖（更具体的选择器覆盖提供方默认值）：

- 对于类别 qwen：`thinkingFormat="qwen-chat-template"`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 nvidia/nemotron-3-nano-omni-30b-a3b-reasoning：`thinking.requiresEffort=true`。
- 对于模型 qwen/qwen3-next-80b-a3b-thinking：`thinkingFormat="qwen-chat-template"`。
- 对于模型 z-ai/glm-5.1、z-ai/glm4.7、z-ai/glm5：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 z-ai/glm-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 提供方默认值：`thinking.mode="effort"`。

- **工具选择与推理**：DeepSeek 推理模型在工具选择激活时禁用推理（`disableReasoningOnToolChoice`、`packages/catalog/src/compat/resolve.ts`），而标准模型支持强制工具选择（`supportsForcedToolChoice: true`、`packages/ai/test/openai-completions-compat.test.ts`）。

### 身份验证与用量 \{#auth--usage-47}

- **身份验证**：使用 NVIDIA NGC Personal Keys 进行基于密钥的身份验证（`packages/catalog/src/compat/rules/auth/nvidia.kdl` 中的 `auth-url "https://org.ngc.nvidia.com/setup/personal-keys"`），存储于 `NVIDIA_API_KEY`（`packages/catalog/src/compat/rules/providers/nvidia.kdl:316`）。基础 URL 为 `https://integrate.api.nvidia.com/v1`。
- **登录与验证**：在 `packages/catalog/src/compat/rules/auth/nvidia.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），针对 `nvidia/llama-3.1-nemotron-70b-instruct` 验证密钥（`validate "chat-completions"`，设置 `optional=#true`）。致命身份验证错误（`401`/`403`、`AIError.Flag.AuthFailed`）会中止登录；非致命验证错误会被捕获，以允许自定义或新部署的模型。
- **提供方注册**：通过 `packages/ai/src/registry/build.ts`，从 `packages/catalog/src/compat/rules/auth/nvidia.kdl` 编译到 `packages/ai/src/registry/registry.ts`。凭据存储和去重在 `packages/ai/test/auth-storage-email-dedupe.test.ts` 中测试。
- **用量**：标准 OpenAI Chat Completions 用量指标；没有自定义用量处理器或配额端点。

### 目录模型处理 \{#catalog-model-handling-46}

- **提供方条目（`nvidia`）**：`packages/catalog/src/compat/rules/providers/nvidia.kdl` 声明默认模型为 `nvidia/llama-3.1-nemotron-70b-instruct`。环境变量键：`NVIDIA_API_KEY`。
- **目录发现**：在目录描述符中注册，配置 `catalogDiscovery: { label: "NVIDIA" }`（`packages/catalog/src/compat/rules/providers/nvidia.kdl:318`）。

## Ollama (`ollama`) \{#ollama-ollama}

运行于本地或自托管 Ollama 实例上的本地 OpenAI 兼容提供方集成（默认基础 URL 为 `http://127.0.0.1:11434/v1`）。发现的模型基于共享的 Ollama 和 OpenAI Responses 传输引擎运行。

### 特殊处理 \{#special-casings-48}

`packages/catalog/src/compat/rules/providers/ollama.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 提供方默认值：`emptyLengthFinishIsContextError=true`、`thinking.efforts=["low","medium","high","max"]`。

- **工具调用错误重写**：`packages/ai/src/error/format.ts` 中的 `rewriteOllamaToolCallJsonError` 会拦截本地 `llama.cpp` 后端中匹配 `LLAMA_CPP_TOOL_CALL_PARSE_PATTERN` 的 HTTP 500 工具调用 JSON 解析失败，并重写错误，说明上下文溢出期间模型输出会发生确定性的退化。

### 认证与用量 \{#auth--usage-48}

- **交互式登录与可选密钥**：在 `packages/catalog/src/compat/rules/auth/ollama.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入可选的 API 密钥/令牌（`empty-fallback ""`，占位符为 `"ollama-local"`），并指向 `auth-url`；返回 `""` 表示本地无密钥模式。
- **用量提供方与配额呈现**：`packages/ai/src/usage/ollama.ts` 中的 `ollamaUsageProvider`（`id: "ollama"`）实现了 `fetchUsage`，返回的 `UsageReport` 包含空的 `limits`，并注明未公开独立的配额端点；`validatesCredentials` 设置为 `false`。

### 目录模型处理 \{#catalog-model-handling-47}

- **提供方条目（`ollama`）**：`packages/catalog/src/compat/rules/providers/ollama.kdl` 声明默认模型为 `gpt-oss:20b`。环境变量键：`OLLAMA_API_KEY`。模型管理允许未经认证的访问。
- **动态模型发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `ollamaModelManagerOptions` 通过 `normalizeOllamaBaseUrl` 规范化端点（默认为 `http://127.0.0.1:11434/v1`），并使用 `fetchOpenAICompatibleModels`（`packages/catalog/src/discovery/openai-compatible.ts`）查询 `/v1/models`。如果 `/v1/models` 不可用或为空，则回退到原生的 `fetchOllamaNativeModels`，在 `toOllamaNativeBaseUrl`（`http://127.0.0.1:11434`）上查询 `/api/tags`。
- **能力探测与上下文长度标注**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `fetchOllamaShowMetadata` 通过 `createOllamaMetadataResolver` 向 `/api/show` POST 发送 `{ model: modelId }`。它从 `model_info` 中匹配 `.context_length`、`.num_ctx` 或 `.context_window` 的键提取上下文长度（回退值为 `OLLAMA_FALLBACK_CONTEXT_WINDOW` = 128,000 和 `OLLAMA_DEFAULT_MAX_TOKENS` = 8,192）。`capabilities.includes("thinking")` 会设置 `reasoning: true` 并配置 `thinking` 强度（`[minimal, low, medium, high]`），而 `capabilities.includes("vision")` 会标注 `input: ["text", "image"]`。
- **模型缓存分区**：`ollamaModelManagerOptions` 中的 `cacheProviderId` 调用 `resolveModelCacheProviderId`（`packages/catalog/src/provider-models/cache-provider-id.ts`），按从 `baseUrl` 派生的 `ollama:ollama-models-v1:<hash>` 对本地模型缓存键进行分区。

## Ollama Cloud（`ollama-cloud`） \{#ollama-cloud-ollama-cloud}

Ollama Cloud 通过位于 `https://ollama.com` 的原生 `ollama-chat` 协议端点，提供对开放权重大语言模型的托管云端访问。它沿用 [Ollama](#ollama) 传输部分，与本地 Ollama 的区别在于要求显式 API 密钥认证，并实施云端特有的历史记录清理和输出 token 上限。

### 特殊处理 \{#special-casings-49}

`packages/catalog/src/compat/rules/providers/ollama-cloud.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 deepseek-v4-pro:preview：`thinking.efforts=["low","high","max"]`。
- 对于模型 glm-4*、glm-5、glm-5.1：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 glm-5.2：`thinking.efforts=["high","max"]`。
- 提供方默认值：`thinking.mode="effort"`。

- **剥离助手历史记录中的思考内容**：当 `model.provider === "ollama-cloud"` 时，`convertMessages`（`packages/ai/src/providers/ollama.ts`）会从助手历史消息中剥离 `thinking` 字段。Ollama Cloud 端点会以 HTTP 400 错误拒绝包含 `thinking` 的传入历史记录，而本地 `ollama` 会保留这些字段。
- **传输层输出 token 限制**：`createChatBody`（`packages/ai/src/providers/ollama.ts`）针对 `ollama-cloud` 模型，将 `options.num_predict` 限制为不超过 `OLLAMA_CLOUD_NUM_PREDICT_CAP`（65,536），在传入 `maxTokens` 或覆盖项时，作为防止 HTTP 400 错误的安全防线（#3392）。本地 `ollama` 端点不限制 `num_predict`。

### 认证与用量 \{#auth--usage-49}

- **交互式密钥认证**：在 `packages/catalog/src/compat/rules/auth/ollama-cloud.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入在 `https://ollama.com/settings/keys` 生成的 API 密钥，以 `ApiKeyRequiredError` 拒绝空输入。
- **环境变量解析**：`descriptors.ts`（`packages/catalog/src/compat/rules/providers/ollama-cloud.kdl`）和 `getEnvApiKey`（`packages/ai/src/stream.ts`）通过 `OLLAMA_CLOUD_API_KEY` 解析凭据。
- **用量统计**：`ollamaCloudUsageProvider`（`packages/ai/src/usage/ollama.ts`）使用 `fetchOllamaUsage` 处理 `ollama-cloud` 的用量。由于 Ollama Cloud 没有独立的配额 API（`validatesCredentials: false`），用量通过 `prompt_eval_count` 和 `eval_count` 流指标逐响应追踪。

### 目录模型处理 \{#catalog-model-handling-48}

- **提供方条目（`ollama-cloud`）**：`packages/catalog/src/compat/rules/providers/ollama-cloud.kdl` 声明默认模型为 `gpt-oss:120b`。环境变量键：`OLLAMA_CLOUD_API_KEY`。
- **动态模型发现与 `/api/show` 元数据**：`ollamaCloudModelManagerOptions`（`packages/catalog/src/provider-models/ollama.ts`）使用 Bearer 令牌认证，通过 `https://ollama.com` 上的 `GET /api/tags` 获取模型，然后逐模型查询 `POST /api/show`（`fetchShowMetadata`），检查能力（`thinking`、`vision`）和 `model_info` 上下文窗口大小（默认为 128,000）。未经认证时返回空列表。
- **输出 token 上限与 token 参数省略**：`isOllamaCloudOutputCapped`（`packages/catalog/src/provider-models/ollama.ts`）识别 DeepSeek V4 Pro/Flash 模型，将 `maxTokens` 固定为 `Math.min(contextWindow, OLLAMA_CLOUD_MAX_OUTPUT_TOKENS)`（65,536），以避免请求被后端拒绝（ollama/ollama#16890、#7266）。所有发现的云端模型均设置 `omitMaxOutputTokens: true`（也通过 `packages/catalog/scripts/generated-policies.ts` 中的 `applyGeneratedModelPolicy` 强制执行）。

## OpenCode Go（`opencode-go`） \{#opencode-go-opencode-go}

OpenCode Go 在 `https://opencode.ai/inference/go/v1` 提供订阅模型（包括 Kimi、DeepSeek、GLM、Qwen、MiniMax 和 Gemini）。模型根据 `api-routes` 使用 Chat Completions、Responses、Anthropic Messages 或原生 Google Generative AI；账户用量仍位于独立的 `/zen/go/v1/usage` 路由。

### 特殊处理 \{#special-casings-50}

`packages/catalog/src/compat/rules/providers/opencode-go.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于模型 deepseek-flash、deepseek-v4.1-flash：`stripImageInput=false`。
- 对于类别 deepseek，系列 flash：`supportsToolChoice=false`。
- 对于类别 deepseek：`thinking.mode="effort"`。
- 对于模型 deepseek-v4-flash-vision-exp：`supportsToolChoice=true`。
- 对于模型 deepseek-v4-flash、deepseek-v4-pro：`supportsToolChoice=false`、`maxTokensField="max_tokens"`、`reasoningContentField="reasoning_content"`、`requiresReasoningContentForToolCalls=true`。
- 对于类别 glm：`thinking.mode="effort"`。
- 对于类别 kimi：`thinking.mode="effort"`。
- 对于类别 meta，系列 muse-spark：`includeEncryptedReasoning=false`、`filterReasoningHistory=true`。
- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。
- 对于类别 mimo：`supportsToolChoice=false`。
- 对于类别 qwen，修订版本 >=3.5.0 <3.7.0：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="effort"`。
- 对于类别 qwen，修订版本 >=3.7.0 <3.9.0：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="effort"`。
- 对于模型 glm-5、glm-5.1：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 ox-alpha*：`thinking.efforts=["low","high","max"]`、`thinking.requiresEffort=true`。
- 对于模型 qwen3.8-flash：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="budget"`。
- 对于模型 glm-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 对于模型 gpt-5.6-luna、grok-4.5、minimax-m2.7、minimax-m3：`thinking.mode="effort"`。
- 对于模型 hy3：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="effort"`。
- 对于模型 kimi-k2.7-code：`supportsForcedToolChoice=false`。
- 对于模型 minimax-m2.5：`thinking.effortMap={"low":"adaptive","medium":"adaptive","high":"adaptive"}`、`thinking.mode="anthropic-adaptive"`。
- 提供方默认值：`whenThinking={"requiresReasoningContentForToolCalls":true,"allowsSyntheticReasoningContentForToolCalls":false,"reasoningContentField":"reasoning_content"}`。

- **API 解析与模型 ID 覆盖**：`createOpenCodeApiResolution`（`packages/catalog/src/provider-models/openai-compat.ts`）在 `https://opencode.ai/inference/go` 下解析模型端点。路由固定项优先于 npm 提示；`gemini-4-argon-contributor` 在 `/v1/models/{id}:streamGenerateContent` 使用 `google-generative-ai`，而 MiniMax M3 和选定的 Qwen ID 在 `/v1/chat/completions` 使用 `openai-completions`。
- **`X-Api-Key` 认证规范化**：在 `packages/ai/src/providers/anthropic.ts` 中，当 `model.provider === "opencode-go"` 时，传输层会删除自动生成的 `Authorization` Bearer 头，使 `AnthropicMessagesClient` 发出 `X-Api-Key`。向 OpenCode Anthropic 端点发送的纯 Bearer 请求会失败，返回 HTTP `401 Missing API key`（#6510）。

### 认证与用量 \{#auth--usage-50}

- **API 密钥登录流程**：在 `packages/catalog/src/compat/rules/auth/opencode-go.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。它引导用户前往 `https://opencode.ai/auth`，提示输入 API 密钥，并返回去除首尾空白后存储在 `OPENCODE_API_KEY` 下的密钥。
- **消费窗口**：`opencodeGoUsageProvider`（`packages/ai/src/usage/opencode-go.ts`）为每个存储的密钥轮询账户端点 `GET https://opencode.ai/zen/go/v1/usage`（Bearer + `User-Agent` + `x-opencode-session`）。内置的 `/inference/go[/v1]` 模型 URL 会映射回此路由；用户配置的代理 URL 保留各自的前缀。响应中的 `rolling`、`weekly` 和 `monthly` 窗口（`{status, percent, resetsAt}`）会转换为带有重置期限的百分比限额。排序使用滚动/每周的剩余额度；每月额度仅用于显示，因为即使每月窗口耗尽，控制台的“Use balance”（使用余额）回退仍可提供服务。
- **账户资金 402**：当账户无法为请求支付费用时，Go 可能返回 `402 Upstream request failed: Insufficient account funds (type=server_error)`。OMP 将其视为账户局部的用量上限，转而使用已存储的同组 API 密钥重试，而不是在已耗尽的密钥上退避（#13019）。

### 目录模型处理 \{#catalog-model-handling-49}

- **提供方条目（`opencode-go`）**：`packages/catalog/src/compat/rules/providers/opencode-go.kdl` 声明默认模型为 `kimi-k2.7-code`。环境变量键：`OPENCODE_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **权威动态模型**：`opencodeGoModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）使用 `dynamicModelsAuthoritative: true`。从 `https://opencode.ai/inference/go/v1/models` 成功发现模型后，会替换内置提供方条目，而不是合并已退役的 ID（`model-manager.ts`）；内置 Go 条目使用相同的推理端点作为启动回退。

## OpenCode Zen（`opencode-zen`） \{#opencode-zen-opencode-zen}

OpenCode Zen（`opencode-zen`）是一项订阅服务，通过位于 `https://opencode.ai/zen` 的统一代理端点路由，提供多家厂商 AI 模型（Anthropic Claude、DeepSeek、MiniMax、Gemini 等）的访问。请求根据目录解析规则，在多个底层传输 API 之间动态分派，主要包括“Anthropic Messages”（`/zen`）、“OpenAI Chat Completions”（`/zen/v1`）、“OpenAI Responses”（`/zen/v1`）和“Google Generative AI”（`/zen/v1`），其默认模型指定为 `claude-opus-5`。

### 特殊处理 \{#special-casings-51}

`packages/catalog/src/compat/rules/providers/opencode-zen.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 anthropic，修订版本 >=4.0.0 <4.6.0：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 deepseek：`thinking.mode="effort"`。
- 对于类别 glm：`thinking.mode="effort"`。
- 对于类别 kimi：`thinking.mode="effort"`。
- 对于类别 meta，系列 muse-spark：`includeEncryptedReasoning=false`、`filterReasoningHistory=true`。
- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。
- 对于类别 minimax，系列 m3：`thinking.mode="effort"`。
- 对于类别 openai，修订版本 >=5.0.0 <5.7.0：`thinking.mode="effort"`。
- 对于类别 unknown：`thinking.mode="effort"`。
- 对于类别 xai，系列 grok：`thinking.mode="effort"`。
- 对于模型 *plus：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="budget"`。
- 对于模型 big-pickle：`thinking.efforts=["high","max"]`。
- 对于模型 glm-4*、hy*、ling-3*、nemotron*、glm-5、glm-5.1、laguna-s-2.1-free、longcat-2.0-free、north-mini-code-free、ring-2.6-1t-free：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 glm-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 对于模型 gpt-5.1-codex、gpt-5.1-codex-max：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 minimax-m2.1、minimax-m2.5、minimax-m2.7：`thinking.mode="effort"`。
- 对于模型 ox-alpha*、x-preview-f-free：`thinking.efforts=["low","high","max"]`、`thinking.requiresEffort=true`。
- 对于模型 minimax-m2.5-free：`thinking.effortMap={"low":"adaptive","medium":"adaptive","high":"adaptive"}`、`thinking.mode="anthropic-adaptive"`。
- 对于模型 qwen3.6-plus-free：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.mode="effort"`。
- 提供方默认值：`whenThinking={"requiresReasoningContentForToolCalls":true,"allowsSyntheticReasoningContentForToolCalls":false,"reasoningContentField":"reasoning_content"}`、`supportsContextManagement=false`。

- **多 API 解析与端点连接**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `createOpenCodeApiResolution` 通过 `@ai-sdk/*` npm 元数据解析模型传输目标。`OPENCODE_ZEN_API_RESOLUTION` 定义逐 ID 的覆盖项，将 `"minimax-m3"` 和 `"minimax-m3-free"` 映射到 `https://opencode.ai/zen/v1` 上的 `"openai-completions"`，覆盖会导致 HTTP 400 错误或原始 `<invoke>`/`<|minimax|>`/`<tool_call>` 标记泄漏的上游 `@ai-sdk/anthropic` 标签（#1617）。
- **Anthropic 代理头与 beta 处理**：在 `packages/ai/src/providers/anthropic.ts` 中，`opencode-zen` 删除默认的 `Authorization` 头（`delete defaultHeaders.Authorization`），并提供 `apiKey` 来发出 `X-Api-Key` 头。`opencode-zen` 上的思考请求会抑制 `context_management_20251015` beta 头和请求体字段（`context_management`），因为 Zen Anthropic 代理会以 `400 Extra inputs are not permitted` 拒绝无法识别的字段（#6510）。

### 认证与用量 \{#auth--usage-51}

- **交互式 CLI 登录流程**：在 `packages/catalog/src/compat/rules/auth/opencode-zen.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）：它在浏览器中打开 `https://opencode.ai/auth`，并提示用户粘贴其 API 密钥。
- **传输认证**：在 Anthropic 和 OpenAI 兼容协议端点上，凭据都通过 `X-Api-Key` 头传递，而不是标准的 Bearer 令牌。
- **免费层限 OpenCode 应用使用**：对于来自任何其他客户端的免费模型（`big-pickle`、`*-free`、`*-contributor-free`）请求，Zen 都会返回 `403 FreeTierError`（“OpenCode's free tier can only be used from within OpenCode”，意为 OpenCode 的免费层只能在 OpenCode 内使用）。`AIError.isOpenCodeFreeTierGateMessage` 将此拒绝排除在凭据刷新与轮换之外，因此它不会阻止仍能为付费 Zen 模型提供服务的密钥，且 `formatMessage` 会在前面添加指向 `/model` 的说明（#12306）。

### 目录模型处理 \{#catalog-model-handling-50}

- **提供方条目（`opencode-zen`）**：`packages/catalog/src/compat/rules/providers/opencode-zen.kdl` 声明默认模型为 `claude-opus-5`。环境变量键：`OPENCODE_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **动态发现与基础 URL 规范化**：`opencodeZenModelManagerOptions` 调用 `openCodeModelManagerOptions("opencode-zen", config)`，从 `https://opencode.ai/zen/v1/models`（`discoveryBaseUrl`）获取动态的 OpenAI 兼容模型。模型会映射为正值的 `contextWindow`（`context_length`）和 `maxTokens`（`max_completion_tokens`），基础 URL 按 API 类型规范化（`openCodeBaseUrlForApi` / `normalizeOpenCodeBasePath`）。
- **Zen 与 Go 的区别**：
   - **基础 URL 根路径**：Zen 使用基础路径 `https://opencode.ai/zen`（补全位于 `/zen/v1`），而 OpenCode Go（`opencode-go`）指向 `https://opencode.ai/zen/go`（补全位于 `/zen/go/v1`）。
   - **默认模型**：Zen 默认为 `claude-opus-5`；Go 默认为 `kimi-k2.7-code`。
   - **API 解析覆盖项**：Zen（`OPENCODE_ZEN_API_RESOLUTION`）将 `"minimax-m3"` 和 `"minimax-m3-free"` 覆盖为 `"openai-completions"`。Go（`OPENCODE_GO_API_RESOLUTION`）将 `"minimax-m2.7"`、`"minimax-m3"`、`"minimax-m3-free"`、`"qwen3.5-plus"` 和 `"qwen3.6-plus"` 覆盖为 `"openai-completions"`，以防止网关 404 或 XML 标记泄漏（#887、#1617）。
   - **模型别名**：Zen 包含 `big-pickle` 别名（DeepSeek 推理），它通过经过审查的分类覆盖项被专门识别，用于应用 DeepSeek 兼容策略。

## OpenRouter（`openrouter`） \{#openrouter-openrouter}

OpenRouter 是一个统一的多提供方路由网关，通过 OpenAI 兼容接口提供数百个第三方模型。请求使用伪 API `openrouter` 执行，默认分派到 OpenAI Responses 传输，或根据环境配置回退到 OpenAI Chat Completions。

### 特殊处理 \{#special-casings-52}

`packages/catalog/src/compat/rules/providers/openrouter.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 anthropic：`retryWithoutStrictOnGrammarError=true`。
- 对于类别 meta，系列 muse-spark：`filterReasoningHistory=true`、`allowsSyntheticReasoningContentForToolCalls=false`。
- 对于类别 minimax，系列 m3：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于类别 openai，系列 o-series：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于类别 stepfun，系列 step：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 *thinking-2507、*thinking:free、arcee-ai/trinity-large-thinking、nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free：`thinking.requiresEffort=true`。
- 对于模型 deepseek/deepseek-chat-v3.1、deepseek/deepseek-v4-pro：`thinking.efforts=["high"]`。
- 对于模型 openai/gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 openai/o1:batch、openai/o3:batch：`thinking.efforts=["minimal","low","medium","high"]`、`thinking.requiresEffort=true`。
- 对于模型 qwen/qwen3-coder：`thinkingFormat="openrouter"`。
- 对于模型 z*5、z-ai/glm-4.6*、z-ai/glm-4.7*、amazon/nova-2-lite-v1、baidu/ernie-4.5-vl-28b-a3b、cohere/north-mini-code:free、minimax/minimax-m1、nvidia/llama-3.3-nemotron-super-49b-v1.5、openai/gpt-5.1-codex、openai/gpt-5.1-codex-max、openai/gpt-chat-latest、z-ai/glm-4.5v、z-ai/glm-5.1：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 z-ai/glm-5.2*：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 提供方默认值：`wireModelIdMode="openrouter"`、`supportsStrictMode=true`、`thinkingFormat="openrouter"`、`thinking.mode="effort"`。

- **路由变体转换（`:nitro` / `:floor`）**：指定 `openrouterVariant`（`"nitro"`、`"floor"`、`"online"`、`"exacto"`、`"extended"`）的选项通过 `applyOpenRouterRoutingVariant`（`packages/ai/src/providers/openai-shared.ts`）映射。请求时会将变体后缀（`:<variant>`）追加到 `model.id`，除非最后一个斜杠之后已经存在冒号（`lastColon > lastSlash`），从而保留用户或目录显式指定的变体覆盖项。
- **提供方顺序与排除偏好**：当 `compat.isOpenRouterHost` 为 true 时，`packages/ai/src/providers/openai-shared.ts` 中的 `applyOpenAIGatewayRouting` 会将目录的 `openRouterRouting` 偏好（带有 `only?: string[]` 和 `order?: string[]` 的 `OpenRouterRouting` 接口）注入顶层 `provider` 请求参数。
- **Anthropic `cache_control` 断点**：解析后的兼容字段 `cacheControlFormat === "anthropic"`（基准条件：OpenRouter 主机 + Anthropic 模型类别）选择 Anthropic 缓存标记方言。在 Chat Completions 传输格式中，`applyOpenAIChatCompletionsPromptCachePolicy`（`openai-completions.ts`）将 `cache_control: { type: "ephemeral" }` 附加到最新消息中最后一个非空文本部分。在 Responses 传输格式中，`applyOpenAIResponsesPromptCachePolicy`（`openai-responses.ts`）设置 `params.cache_control = cacheRetention === "long" ? { type: "ephemeral", ttl: "1h" } : { type: "ephemeral" }`。
- **省略目录默认最大 token 数**：当 `isOpenRouterHost` 为 true 且 `maxTokensExplicit` 为 false 时，`packages/ai/src/providers/openai-shared.ts` 中的 `resolveOpenAIOutputTokenParam` 会省略默认输出 token 限制（`max_tokens`、`max_completion_tokens`、`max_output_tokens`）。这可防止 OpenRouter 在执行 `provider.order` / `only` 回退时，过滤掉宣告的输出上限低于目录最大值的上游；调用方显式指定的 `maxTokens` 会保留。
- **自定义请求头**：`packages/ai/src/utils/openrouter-headers.ts` 中的 `getOpenRouterHeaders` 会为所有请求附加 `User-Agent: omp/<ver>`、`HTTP-Referer: https://omp.sh/`、`X-OpenRouter-Title: omp`、`X-OpenRouter-Categories: cli-agent`、`X-OpenRouter-Cache: true` 和 `X-OpenRouter-Cache-TTL: 3600`，用于边缘响应缓存。

### 认证与用量 \{#auth--usage-52}

- **通过 `/api/v1/auth/key` 验证认证密钥**：在 `packages/catalog/src/compat/rules/auth/openrouter.kdl` 中声明为 `login "oauth-code"` 规则（`packages/ai/src/registry/engine/oauth-code.ts`），其 `paste-key` 验证指向 `https://openrouter.ai/api/v1/auth/key`。公共 `/api/v1/models` 对未经认证的请求也返回 HTTP 200，因此使用 `/api/v1/auth/key` 作为规范的身份检查（有效密钥返回 200，否则返回 401）。密钥解析通过 `packages/ai/src/stream.ts` 中的 `getEnvApiKey` 检查 `OPENROUTER_API_KEY`。
- **权威报告费用对账**：`packages/ai/src/providers/openai-shared.ts` 中的 `applyProviderReportedCost` 提取 OpenRouter 和 ClinePass 回传的 `rawUsage.cost`。如果估算的 token 费用为有限正数，则按 `reportedCost / estimatedCost` 缩放输入、输出、缓存读取和缓存写入费用，使其与实际计费总额一致；否则，直接将报告费用赋给 `usage.cost.input`。

### 目录模型处理 \{#catalog-model-handling-51}

- **提供方条目（`openrouter`）**：`packages/catalog/src/compat/rules/providers/openrouter.kdl` 声明默认模型为 `openai/gpt-5.5`。环境变量键：`OPENROUTER_API_KEY`。
- **手工编写的种子条目**：`~typesafe/jev-latest`、`typesafe/jev-1.14`、`openai/whisper-1`、`openai/whisper-large-v3`、`openai/gpt-4o-transcribe`、`microsoft/mai-transcribe-1.5`、`microsoft/mai-transcribe-2`、`openai/gpt-transcribe`、`openai/whisper-large-v3-turbo`、`nvidia/nemotron-3.5-transcribe`、`elevenlabs/scribe-v2`、`assemblyai/universal-3-6-pro`、`deepgram/nova-3`、`qwen/qwen3-asr-1.7b`、`x-ai/grok-stt-2.0`、`cohere/rerank-v3.5`、`openai/text-embedding-3-small`、`qwen/qwen3-embedding-8b`、`google/veo-3.1`、`minimax/hailuo-3`、`alibaba/wan-2.7`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- **动态发现与过滤**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `openrouterModelManagerOptions` 使用带有 `api: "openrouter"` 的 `fetchOpenAICompatibleModels` 查询 `https://openrouter.ai/api/v1/models`。缓存条目在 `resolveModelCacheProviderId("openrouter", { apiKey, baseUrl })` 下分区，该函数对密钥和基础 URL 求哈希（`openrouter` 位于 `CREDENTIAL_SCOPED_MODEL_CACHE_PROVIDERS` 中），因此不会向受防护规则约束的密钥提供无密钥或权限更宽密钥的模型名册。发现的模型会过滤为满足 `supported_parameters.includes("tools")` 的条目。
- **受防护规则约束的名册**：带有密钥时，`/models` 返回该密钥工作区防护规则允许的模型（模型和提供方允许列表）；不带密钥时返回公共名册。因此，聊天发现具有权威性（`dynamic-models-authoritative`）：成功获取后会替换内置聊天条目，使 `/model` 不会列出工作区阻止的模型。聊天列表获取失败时不返回发现结果，因此媒体列表的单独成功不会裁剪聊天名册。`/images/models`、`/videos/models` 和 `/embeddings/models` 列表忽略防护规则（2026-11-12 已验证），因此被阻止的非聊天模型仍可能出现。
- **语音名册来自种子条目，而非发现**：`/models` 在 `?output_modalities=all` 下才列出转录（`audio->transcription`）和 TTS（`text->speech`）条目，因此内置 STT 条目来自手工编写的种子。OpenRouter 的 `/audio/speech` 使用 `openai-speech` 传输格式，但每个 TTS 上游都会拒绝未显式指定模型专属 `voice` 的请求（400 “An explicit voice is required for this TTS provider.”，意为此 TTS 提供方要求显式指定语音），且各自接受的格式有限（例如 Gemini TTS：`pcm`/`wav`；ElevenLabs、Kokoro、Grok、MAI-Voice：`mp3`/`pcm`）。`tts` 工具默认省略 `voice`，因此没有预置 OpenRouter TTS 条目。
- **规格映射**：`openrouterModelManagerOptions` 映射 `modality`（`text`/`image`）、每百万 token 定价（`prompt`、`completion`、`input_cache_read`、`input_cache_write`）、`context_length`、`top_provider.max_completion_tokens`，并通过 `mapOpenRouterThinking` 映射推理强度阶梯。

## 千帆（`qianfan`） \{#qianfan-qianfan}

千帆（百度云）通过 OpenAI 兼容的 v2 API，使用 OpenAI Chat Completions 传输，提供对百度托管模型系列的访问。入口包括负责认证策略和 API 密钥认证的 `packages/catalog/src/compat/rules/auth/qianfan.kdl`、负责目录注册的 `packages/catalog/src/compat/rules/providers/qianfan.kdl`（编译后的提供方条目），以及负责模型管理器选项的 `packages/catalog/src/provider-models/openai-compat.ts`（`qianfanModelManagerOptions`）。

### 特殊处理 \{#special-casings-53}

- 除 OpenAI Chat Completions 流水线之外，没有其他处理。

### 认证与用量 \{#auth--usage-53}

- **API 密钥认证与验证**：通过 `QIANFAN_API_KEY` 或已存储的凭据进行认证，使用从 `https://console.bce.baidu.com/qianfan/ais/console/apiKey` 获取的、格式为 `bce-v3/ALTAK-...` 的 API 密钥。CLI 登录流程在 `packages/catalog/src/compat/rules/auth/qianfan.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），通过向 `https://qianfan.baidubce.com/v2` 发送使用 `deepseek-v3.2` 的聊天补全请求（`validate "chat-completions"`）验证凭据。
- **用量与配额**：适用标准的 OpenAI Chat Completions token 用量追踪（`input`、`output`、`reasoning`）和 HTTP 状态码错误处理。

### 目录模型处理 \{#catalog-model-handling-52}

- **提供方条目（`qianfan`）**：`packages/catalog/src/compat/rules/providers/qianfan.kdl` 声明默认模型为 `deepseek-v3.2`。环境变量键：`QIANFAN_API_KEY`。
- **模型选项**：`qianfanModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）通过 `createSimpleOpenAICompletionsOptions` 构造绑定到 `https://qianfan.baidubce.com/v2` 的 `openai-completions` 选项。
- **内置模型**：`packages/catalog/src/models.json` 中的静态模型规格定义了千帆模型（例如，`deepseek-v3.2` 带有 `reasoning: true` 和 `baseUrl: "https://qianfan.baidubce.com/v2"`）。

## Otari（`otari`） \{#otari-otari}

Otari 是一个 AI 网关和控制平面，通过位于 `https://api.otari.ai/api/v1` 的 OpenAI 兼容 Chat Completions 接口，代表工作区将请求路由到上游模型提供方。

### 特殊处理 \{#special-casings-54}

- **工作区范围的名册**：工作区在 Otari 中启用上游提供方和模型，因此目录按凭据划分且动态变化。不内置任何模型，提供方注册在 `CREDENTIAL_SCOPED_PROVIDERS`（`packages/catalog/scripts/generate-models.ts`）中，因此目录生成不会获取或提交某个工作区的名册。运行时发现具有权威性（`dynamic-models-authoritative`）：成功获取密钥范围的 `/models` 后，结果即为完整目录，并会裁剪工作区此后禁用的项目。
- **实时条目的权威性**：`/models` 条目采用 OpenRouter 风格：`supported_parameters`（推理模型包含 `reasoning`）、`architecture.input_modalities` / `output_modalities`、上下文和输出上限，以及每百万 token 的美元定价（`input_price_per_million`、`output_price_per_million`，可选的 `cache_read_price_per_million` / `cache_write_price_per_million`）。由于没有内置参考可供合并，所有能力字段都以实时条目为准（`packages/catalog/src/provider-models/openai-compat.ts` 中的 `otariModelManagerOptions`）。网关没有对应 models.dev 元数据的条目会省略 `supported_parameters` 和 `architecture`，并映射为纯文本、不支持推理且限制未知的模型。
- **非聊天条目**：名册列出工作区启用的每个模型，包括嵌入、重排、语音、图像和实时模型。`architecture.output_modalities` 不含 `text` 的条目会在映射器中丢弃；没有元数据的非聊天条目会由 `runtime/behavior.kdl` 中的 `exclude-models provider="otari"` 丢弃。
- **不支持 `developer` 角色**：Otari 通过 any-llm 转发至上游，而某些上游拒绝 `developer` 角色（`anthropic/` 条目返回 400），因此 `supports-developer-role #false` 会将指令以 `system` 发送。`store`、`max_completion_tokens`、工具调用和 `reasoning_effort`（`minimal`..`xhigh`）会透传；网关将强度映射为各上游自己的控制方式。
- **没有稳定默认值**：由于名册取决于工作区，无法保证每个令牌都启用了某个模型 ID，且 `/models` 不标记工作区默认值。`default-model`（`deepseek/deepseek-v4.1-flash`，Otari 的 `/models` API 文档中的示例选择器）是一个占位项，用于给已有模型排序，不会凭空生成条目；工作区未启用它时，解析器回退到第一个可用模型。

### 认证与用量 \{#auth--usage-54}

- **交互式登录**：在 `packages/catalog/src/compat/rules/auth/otari.kdl` 中声明（`login "custom" hook="otari"`），在 `packages/ai/src/registry/oauth/otari.ts` 中实现（`loginOtari`）。托管工作区具有区域局部性，密钥只能在所属区域认证，因此登录会先提示选择区域（1=美国 `https://api.otari.ai/api/v1`，默认；2=欧洲 `https://eu.api.otari.ai/api/v1`；3=自定义 API 根路径），然后针对该端点的 `/models` 验证粘贴的密钥，该端点在无密钥和密钥被拒绝时都返回 401（2026-11-02 已验证），因此此探测不产生费用。设置 `OTARI_BASE_URL` 时，登录针对它验证，跳过区域提示，并存储普通密钥，因此该环境变量继续决定发现与请求的目标。
- **存储的复合凭据**：美国区域登录存储普通密钥；其他端点均存储 `{ token, baseUrl }`（`packages/catalog/src/wire/otari.ts` 中的 `serializeOtariCredential` / `parseOtariCredential`）。对于发现（`otariModelManagerOptions`）和请求（`resolveOpenAIRequestSetup`），存储的 `baseUrl` 优先于 `models.yml` 的 `baseUrl` 覆盖项及 `OTARI_BASE_URL`，因此不会将密钥发送到会拒绝它的区域。环境变量键：`OTARI_API_KEY`（普通密钥）。
- 自托管部署可在登录时选择 Custom，或将 `OTARI_BASE_URL` 设置为部署的 API 根路径（`https://host.example.com/api/v1`），对于未存储 `baseUrl` 的凭据，这会重定向登录、发现和请求。
- **缓存范围**：模型缓存命名空间对 API 密钥和基础 URL 求哈希（`resolveModelCacheProviderId`，`otari` 位于 `CREDENTIAL_SCOPED_MODEL_CACHE_PROVIDERS` 中），因此第二个工作区或部署不会读取另一方缓存的名册。

## Qwen Portal（`qwen-portal`） \{#qwen-portal-qwen-portal}

Qwen Portal 通过位于 `https://portal.qwen.ai/v1` 的 OpenAI 兼容端点提供对 Qwen 托管模型的访问。它使用 OpenAI Chat Completions 传输来执行模型和调用工具。

### 特殊处理 \{#special-casings-55}

- **系统消息限制**：主机匹配（`packages/catalog/src/hosts.ts` 中的 `qwenPortal`，匹配 `portal.qwen.ai`）设置 `supportsMultipleSystemMessagesDefault = false`（`packages/catalog/src/compat/resolve.ts`）。这会强制将多个系统消息块合并为一个块，以防止默认 Qwen 聊天模板触发 500 内部服务器错误。

### 认证与用量 \{#auth--usage-55}

- **环境变量**：自动从 `QWEN_OAUTH_TOKEN` 或 `QWEN_PORTAL_API_KEY` 解析凭据（`packages/catalog/src/compat/rules/providers/qwen-portal.kdl:385`）。
- **交互式登录**：在 `packages/catalog/src/compat/rules/auth/qwen-portal.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户从 `https://chat.qwen.ai` 复制令牌或 API 密钥，并提示输入。
- **凭据验证**：使用 `packages/catalog/src/compat/rules/auth/qwen-portal.kdl` 中的 `validate "chat-completions"`，针对 `coder-model`，向 `https://portal.qwen.ai/v1` 验证输入令牌。
- **用量追踪**：`packages/ai/src/usage/` 下不存在专用的用量报告模块。

### 目录模型处理 \{#catalog-model-handling-53}

- **提供方条目（`qwen-portal`）**：`packages/catalog/src/compat/rules/providers/qwen-portal.kdl` 声明默认模型为 `coder-model`。环境变量键：`QWEN_OAUTH_TOKEN`、`QWEN_PORTAL_API_KEY`。
- **目录配置**：在 `descriptors.ts` 中注册，默认模型为 `coder-model`，发现标签为 `"Qwen Portal"`，并设有 `oauthProvider: "qwen-portal"`。

## Sakana AI（`sakana`） \{#sakana-ai-sakana}

Sakana AI 提供通过 `api.sakana.ai` 托管的 Fugu 模型系列推理模型。
请求通过有状态的 OpenAI Responses 传输（`api: "openai-responses"`）路由。

### 特殊处理 \{#special-casings-56}

- **基础 URL 规范化与覆盖**：`packages/ai/src/providers/openai-shared.ts` 中的 `resolveSakanaRequestBaseUrl`
  和 `packages/catalog/src/provider-models/openai-compat.ts` 中的 `normalizeSakanaBaseUrl` 从 `SAKANA_BASE_URL`
  或回退变量 `FUGU_BASE_URL` 解析基础 URL 覆盖项。基础 URL 会规范化，移除尾部斜杠并确保
  具有 `/v1` 路径后缀，回退为 `https://api.sakana.ai/v1`。

### 认证与用量 \{#auth--usage-56}

- **API 密钥解析**：环境变量发现先检查 `SAKANA_API_KEY`，再回退到 `FUGU_API_KEY`
  （在描述符 `packages/catalog/src/compat/rules/providers/sakana.kdl` 中配置）。
- **交互式登录**：在 `packages/catalog/src/compat/rules/auth/sakana.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户
  前往 Sakana AI 控制台（`https://console.sakana.ai/api-keys`），针对 `https://api.sakana.ai/v1/models` 验证凭据。

### 目录模型处理 \{#catalog-model-handling-54}

- **提供方条目（`sakana`）**：`packages/catalog/src/compat/rules/providers/sakana.kdl` 声明默认模型为 `fugu`。环境变量键：`SAKANA_API_KEY`、`FUGU_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`fugu`、`fugu-ultra`、`fugu-ultra-20260615`；打包策略为 `fallback`。限制、能力和价格与这些条目一同手工编写。
- **动态模型管理器**：`sakanaModelManagerOptions` 将实时 `/models` 发现标记为权威来源
  （`dynamicModelsAuthoritative: true`），并通过 `dropCachedModelIdsOnStaticMismatch` 在种子变更时清除陈旧的缓存模型条目。

## SambaNova（`sambanova`） \{#sambanova-sambanova}

SambaNova Cloud 通过位于 `https://api.sambanova.ai/v1` 的 OpenAI Chat Completions 传输提供开放权重模型。

### 特殊处理 \{#special-casings-57}

- **思考传输格式**：`packages/catalog/src/compat/rules/providers/sambanova.kdl` 为 gpt-oss 和 MiniMax M3 发送 `reasoning_effort`（low/medium/high）。DeepSeek V3.1+ 和 Gemma 4 在设置 `chat_template_kwargs.enable_thinking` 时才进行思考，因此它们使用带有单个启用档位的 `qwen-chat-template` 格式。
- **Gemma 4 图像输入**：同一规则文件为 Gemma 4 及更新版本声明 `text` + `image` 输入；`/v1/models` 不报告模态。

### 认证与用量 \{#auth--usage-57}

- **API 密钥登录**：`packages/catalog/src/compat/rules/auth/sambanova.kdl` 声明一个指向 `https://cloud.sambanova.ai/apis` 的 `login "api-key"` 规则，并针对 `https://api.sambanova.ai/v1/models` 验证密钥。环境变量键：`SAMBANOVA_API_KEY`。

### 目录模型处理 \{#catalog-model-handling-55}

- **发现**：`sambanovaModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）在配置密钥时获取 `/v1/models`。实时名册是模型与价格的权威来源（`dynamicModelsAuthoritative`、`dynamicCostAuthoritative`）。每 token 的美元价格字符串转换为每百万 token 的费率；无法读取的价格表会标记为 `unknown`，而不是免费。
- **名册排除项**：嵌入、Whisper/音频和 CLIP SKU 通过 `runtime/behavior.kdl` 中的 `exclude-models provider="sambanova"` 规则丢弃。
- **手工编写的种子条目**：`gpt-oss-120b` 及其公布的每 1M token $0.22 / $0.59 价格表；打包策略为 `fallback`。它使提供方在登录前仍能在 `/model` 中显示，并在首次获取实时名册后被替换。SambaNova 在 `generate-models.ts` 中按凭据限定范围，因此内置数据不会携带生成器账户的名册。

## SiliconFlow（`siliconflow`） \{#siliconflow-siliconflow}

SiliconFlow 是一个高性能 AI 推理平台，提供对开源模型（如 DeepSeek 和 GLM）的访问。它使用 OpenAI Chat Completions 传输（全球区域为 `https://api.siliconflow.com/v1`，中国区域为 `https://api.siliconflow.cn/v1`）。

### 特殊处理 \{#special-casings-58}

- **运行时元数据填充与回退**：`loadSiliconFlowModelsDevReferences` 查询 models.dev，超时为 5,000ms（`SILICONFLOW_MODELS_DEV_REFERENCE_TIMEOUT_MS`）。缺失的模型回退到规范的内置规格（`resolveModelReference`），以推断上下文窗口、最大 token 数和推理能力，但不包含定价。

### 认证与用量 \{#auth--usage-58}

- **API 密钥登录**：通过存储在 `SILICONFLOW_API_KEY` 中的 API 密钥认证（`siliconflow-cn` 使用 `SILICONFLOW_CN_API_KEY`）。在 `packages/catalog/src/compat/rules/auth/siliconflow.kdl` 和 `siliconflow-cn.kdl` 中交互式声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。
- **端点验证**：登录期间通过向 `https://api.siliconflow.com/v1/models`（`https://api.siliconflow.cn/v1/models`）发送 `models-endpoint` 请求验证凭据。
- **控制台 URL**：密钥创建说明指向 `https://cloud.siliconflow.com/account/ak`（中国区域为 `https://cloud.siliconflow.cn/account/ak`）。

### 目录模型处理 \{#catalog-model-handling-56}

- **提供方条目（`siliconflow`）**：`packages/catalog/src/compat/rules/providers/siliconflow.kdl` 声明默认模型为 `zai-org/GLM-5.1`。环境变量键：`SILICONFLOW_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **管理器构造**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `siliconflowModelManagerOptions` 和 `siliconflowCnModelManagerOptions` 通过 `createSiliconFlowModelManagerOptions` 构造动态的 OpenAI 兼容模型管理器。
- **动态模型发现**：API 密钥可用时，`fetchDynamicModels` 调用 `fetchOpenAICompatibleModels` 从 `/v1/models` 获取实时模型，并关联 models.dev 的定价/限制（`mapWithBundledReference`）或规范的回退参考。

## SiliconFlow（中国）（`siliconflow-cn`） \{#siliconflow-china-siliconflow-cn}

SiliconFlow（中国）是 SiliconFlow AI 模型平台在中国境内的部署，针对区域可用性，为开放权重模型提供 OpenAI 兼容的大语言模型推理。它使用 OpenAI Chat Completions 传输（`openai-completions`），基础 URL 为 `https://api.siliconflow.cn/v1`。

### 特殊处理 \{#special-casings-59}

- **端点区别**：在 `siliconflowCnModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）中使用 `https://api.siliconflow.cn/v1` 作为模型端点，与全球 `siliconflow`（`https://api.siliconflow.com/v1`）不同。
- **非聊天模型过滤**：模型发现通过 `packages/catalog/src/provider-models/openai-compat.ts` 中的 `isLikelySiliconFlowChatModelId`，排除非聊天模型 ID（嵌入、重排、图像、TTS、音频和视频模型，其包含的词元如 `bge-`、`bce-`、`stable-diffusion`、`flux`、`kolors`、`sensevoice`、`cosyvoice`、`fish-speech`、`wan2` 等）。
- **内置上游参考回退**：models.dev 中缺失的模型从内置上游模型参考定义（`getBundledModelReferenceIndex`）恢复固有能力（`reasoning`、`input`）、上下文窗口和最大输出 token 数，同时省略提供方特定定价。

### 认证与用量 \{#auth--usage-59}

- **环境变量**：通过描述符 `envVars`（`packages/catalog/src/compat/rules/providers/siliconflow-cn.kdl`）中配置的 `SILICONFLOW_CN_API_KEY` 认证，与全球区域的 `SILICONFLOW_API_KEY` 分开。
- **API 密钥登录**：在 `packages/catalog/src/compat/rules/auth/siliconflow-cn.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），管理控制台 URL 为 `https://cloud.siliconflow.cn/account/ak`，验证端点为 `https://api.siliconflow.cn/v1/models`。
- **无用量追踪**：`packages/ai/src/usage/` 下没有专用的配额或用量解析模块。

### 目录模型处理 \{#catalog-model-handling-57}

- **提供方条目（`siliconflow-cn`）**：`packages/catalog/src/compat/rules/providers/siliconflow-cn.kdl` 声明默认模型为 `deepseek-ai/DeepSeek-V4-Pro`。环境变量键：`SILICONFLOW_CN_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **纯动态模型发现**：有意不纳入 `MODELS_DEV_PROVIDER_DESCRIPTORS` 和静态目录生成（`scripts/generate-models.ts`），从 `https://api.siliconflow.cn/v1/models` 实时获取可用聊天模型。
- **运行时参考填充**：`loadSiliconFlowModelsDevReferences`（`packages/catalog/src/provider-models/openai-compat.ts`）将实时发现的模型与 models.dev 目录条目（`SILICONFLOW_MODELS_DEV_DESCRIPTORS`）交叉参考，超时为 5 秒（`SILICONFLOW_MODELS_DEV_REFERENCE_TIMEOUT_MS`），以填充定价与限制元数据。

## StepFun（`stepfun`） \{#stepfun-stepfun}

StepFun 是位于 `https://api.stepfun.ai/v1` 的 OpenAI 兼容开放平台端点，提供 StepFun 自有聊天模型（`step-5-preview`、`step-3.7-flash`、`step-3.5-flash`、`step-3.5-flash-2603`）。它使用 OpenAI Chat Completions 传输（`openai-completions`）。StepFun 的中国部署（`api.stepfun.com`）和 Step Plan 订阅端点（`/step_plan/v1`）是独立部署，其 API 密钥不能与 `.ai` 密钥互换。

### 特殊处理 \{#special-casings-60}

- **仅使用 `max_tokens`**：提供方规则在 `packages/catalog/src/compat/rules/providers/stepfun.kdl` 中设置 `max-tokens-field "max_tokens"`。StepFun 文档列出 `max_tokens`（默认为 `INF`），没有列出 OpenAI 基准假定的 `max_completion_tokens` 写法，端点会静默忽略后者，导致输出预算不受限制。
- **提供方自有强度阶梯**：同一规则文件为 `stepfun` 类别/`step` 系列指定 `thinking-mode "effort"` 和 `thinking-efforts "low" "medium" "high"`。该类别的普查阶梯涵盖 `minimal`…`xhigh`，因为中继主机（OpenRouter、NanoGPT、NVIDIA、ZenMux）宣告这些档位；StepFun 自有 API 会拒绝它们，因此提供方范围的规则会覆盖中继默认值。
- **`reasoning_content` 推理字段**：推理流以 `reasoning_content` 增量到达（StepFun 的 `reasoning_format: "general"` 默认值返回 `reasoning` 字段，两者都会解析），由 `packages/ai/src/providers/openai-completions.ts` 中的通用分派处理。
- **非聊天名册过滤**：`/v1/models` 将 StepAudio（ASR/TTS/实时/生成）、图像生成及网页搜索（`dr-search-api`）SKU 与聊天模型混排。`packages/catalog/src/provider-models/openai-compat.ts` 中的 `isStepfunChatModelId` 使用 `packages/catalog/src/compat/rules/runtime/behavior.kdl` 中的 `exclude-models provider="stepfun"` 策略丢弃它们。
- **不跨主机回填限制**：提供方条目设置 `skip-cross-provider-reference-fills #true`，因此生成器不会将中继主机输出上限（例如 NanoGPT/Hugging Face 条目中的 256K 数值）复制到 StepFun 未公布上限的第一方条目中。

### 认证与用量 \{#auth--usage-60}

- **环境变量**：通过 `STEPFUN_API_KEY` 认证（`packages/catalog/src/compat/rules/providers/stepfun.kdl` 中的提供方条目）。密钥按区域限定范围：`.ai` 密钥用于 `api.stepfun.ai`，`.com` 密钥用于 `api.stepfun.com`。
- **API 密钥登录**：在 `packages/catalog/src/compat/rules/auth/stepfun.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），控制台 URL 为 `https://platform.stepfun.ai/interface-key`，聊天补全验证模型为 `step-5-preview`。
- **无用量追踪**：`packages/ai/src/usage/` 下没有专用的配额或用量解析模块；StepFun 按缓存未命中输入费率对提示缓存计费，因此条目带有 `cacheWrite: 0`。

### 目录模型处理 \{#catalog-model-handling-58}

- **提供方条目（`stepfun`）**：`packages/catalog/src/compat/rules/providers/stepfun.kdl` 声明默认模型为 `step-5-preview`。环境变量键：`STEPFUN_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`step-5-preview`、`step-3.7-flash`、`step-3.5-flash`、`step-3.5-flash-2603`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- **实时发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `stepfunModelManagerOptions` 将成功获取的 `/v1/models` 快照视为权威来源（`dynamicModelsAuthoritative`）：它替换种子条目，并由 `mapWithBundledReference` 填充，因此已退役模型会离开选择器，StepFun 后续发布的模型也无需等待 omp 发布即可选择。

## Synthetic（`synthetic`） \{#synthetic-synthetic}

Synthetic 是一个 AI 平台，为模型提供双 API 格式支持，同时公开 OpenAI 兼容（`https://api.synthetic.new/openai/v1/chat/completions`）和 Anthropic 兼容（`https://api.synthetic.new/anthropic/v1/messages`）端点。调用默认使用 `OpenAI Chat Completions` 传输，但配置后可动态切换到 `Anthropic Messages` 传输。

### 特殊处理 \{#special-casings-61}

- **双 API 接口**：`streamSynthetic`（`packages/ai/src/providers/synthetic.ts`）利用 `streamOpenAIAnthropicShim`（`packages/ai/src/providers/openai-anthropic-shim.ts`）包装 OpenAI 补全和 Anthropic 消息端点。API 格式可通过请求的 `syntheticApiFormat` 选项（`"openai"` | `"anthropic"`）选择，默认为 `"openai"`。
- **分派**：`streamSimple` 将 Synthetic 路由至 `streamSynthetic`，后者将 API 格式转换委托给 `streamOpenAIAnthropicShim`。
- **动态推理与特性**：在 `packages/catalog/src/provider-models/openai-compat.ts` 中，`syntheticModelManagerOptions` 映射来自 `GET /openai/v1/models` 的动态模型条目。它检查 `supported_features` 是否包含 `"reasoning"`，并解析传输中的强度档位（例如 `reasoning_parameters.efforts`），以构造 `thinking` 选项并适当设置 `reasoning` 标志。

### 认证与用量 \{#auth--usage-61}

- **认证**：使用 `SYNTHETIC_API_KEY` 进行基于密钥的认证（`packages/catalog/src/compat/rules/auth/synthetic.kdl`）。通过 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）针对 `GET https://api.synthetic.new/openai/v1/models` 验证。
- **用量与配额轮询**：`syntheticUsageProvider`（`packages/ai/src/usage/synthetic.ts`）使用 Bearer API 密钥轮询 `GET https://api.synthetic.new/v2/quotas`。它仅报告 `planWeeklyLimit`：从权威的 `percentRemaining` 得出的每周额度用量，以及增量再生元数据（`nextRegenAt`、`nextRegenPercent`）。该限额保留稳定 ID `synthetic:usd:7d`，使解析器变更后用量历史仍得以保留。没有可用 `planWeeklyLimit` 的载荷不产生报告。

### 目录模型处理 \{#catalog-model-handling-59}

- **提供方条目（`synthetic`）**：`packages/catalog/src/compat/rules/providers/synthetic.kdl` 声明默认模型为 `hf:zai-org/GLM-5.3-Flash`。环境变量键：`SYNTHETIC_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- 默认模型：`hf:zai-org/GLM-5.3-Flash`（`packages/catalog/src/compat/rules/providers/synthetic.kdl`）。
- `dynamicModelsAuthoritative: true`：通过 `syntheticModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）动态获取模型。
- 模态与视觉：`input` 模态（`"text"`、`"image"`）从 `input_modalities`、`supports_vision` 或回退参考规格动态解析。
- 能力过滤：`supported_features` 严格约束工具支持；如果此字段存在但不含 `"tools"`，则禁用该模型的工具调用。

## Together（`together`） \{#together-together}

Together 是一个云推理提供方，通过 OpenAI Chat Completions 兼容 API 提供对各种开源及专有基础模型的访问。

### 特殊处理 \{#special-casings-62}

`packages/catalog/src/compat/rules/providers/together.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 deepseek-ai/DeepSeek-V3-1：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 zai-org/GLM-4.7、zai-org/GLM-5、zai-org/GLM-5.1：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 zai-org/GLM-5.2：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 提供方默认值：`supportsStrictMode=true`、`thinking.mode="effort"`。

### 认证与用量 \{#auth--usage-62}

- **API 密钥认证**：使用 `TOGETHER_API_KEY` 环境变量，或在 `pi-ai login together` 期间输入的 API 密钥认证。
- **验证**：在 `packages/catalog/src/compat/rules/auth/together.kdl` 中作为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），针对 `https://api.together.xyz/v1/models` 验证密钥。
- **API 基础 URL**：`https://api.together.xyz/v1`。

### 目录模型处理 \{#catalog-model-handling-60}

- **提供方条目（`together`）**：`packages/catalog/src/compat/rules/providers/together.kdl` 声明默认模型为 `moonshotai/Kimi-K2.7-Code`。环境变量键：`TOGETHER_API_KEY`。
- **目录来源**：通过 `models.dev` 描述符生成模型，使用键 `togetherai` 映射到位于 `https://api.together.xyz/v1` 的提供方 `together`（`packages/catalog/src/provider-models/openai-compat.ts`）。
- **主机匹配**：列于 `packages/catalog/src/hosts.ts`，匹配主机 URL 标记 `api.together.xyz`，并在 `priority.ts` 身份映射中注册。

## Umans AI Coding Plan（`umans`） \{#umans-ai-coding-plan-umans}

Umans AI Coding Plan 是一项 AI 编码模型代理服务，使用 Anthropic Messages 传输格式（“Anthropic Messages”），默认基础 URL 设置为 `https://api.code.umans.ai`。

### 特殊处理 \{#special-casings-63}

- **认证头策略**：Anthropic 兼容的 Umans 请求强制使用 `X-Api-Key` 头认证（在 `packages/catalog/src/compat/rules/auth/umans.kdl` 中声明），而不是 `Authorization: Bearer`（`packages/ai/src/providers/anthropic.ts` 中的 `buildAnthropicClientOptions`）。
- **工具名转义**：配置 `compat.escapeBuiltinToolNames: true`（`packages/catalog/src/compat/anthropic.ts`），在出站请求中为客户端工具名添加 `_` 前缀，并在返回时去除，以避免与网关内置工具名冲突，除非网关网页搜索处于启用状态（`packages/ai/src/providers/anthropic.ts`）。
- **网关网页搜索**：通过检查调用方的 `X-Umans-Websearch-Provider` 头或 `UMANS_WEBSEARCH_PROVIDER`（`native` | `exa`）环境变量路由网页搜索请求（`packages/ai/src/providers/anthropic.ts`）。启用后，`web_search` 工具名不经转义直接透传。
- **思考/推理强度**：支持思考配置，级别通过 `UMANS_REASONING_EFFORT_BY_LEVEL` 映射（`packages/catalog/src/provider-models/openai-compat.ts`）。Umans 上的 GLM-5.2 使用 high/max 两档强度，其中 `max` 映射到 `anthropic-budget-effort` 模式（`xhigh` 强度）（`packages/catalog/src/model-thinking.ts`）。

### 认证与用量 \{#auth--usage-63}

- **认证**：使用 `UMANS_AI_CODING_PLAN_API_KEY` 环境变量或 `/login umans` 密钥提示（`packages/catalog/src/compat/rules/auth/umans.kdl`、`packages/ai/src/registry/engine/api-key.ts`）。密钥验证会向 `https://api.code.umans.ai` 执行轻量 Anthropic 消息调用（`max_tokens: 1`）。
- **用量端点**：使用 `Authorization: Bearer <key>`，从 `GET /v1/usage`（`packages/ai/src/usage/umans.ts`）获取配额和速率限制状态。
- **呈现的限额**：返回滚动 5 小时请求额度，将其分为按模型加权的软上限（`umans:requests:soft`，“effective requests”即有效请求契约）和原始突发流量上限（`umans:requests:hard`、`hard_cap`），另有即时会话并发限制（`umans:concurrency`）。软上限始终只发出警告，`exhausted` 留给实际开始限流的突发流量上限。没有报告突发流量上限（`hard_cap`）的载荷会合并为单个加权 `umans:requests` 条目，可在有效请求限额处耗尽，因此请求耗尽始终能够报告；没有加权计数器的旧版载荷回退为单个原始 `umans:requests` 条目。在这两种单条目形式中，加权计数器（若存在）仍为权威来源，超过限额的原始突发流量不会凭空产生耗尽状态。发生速率限制突发时，还会呈现低优先级状态说明。

### 目录模型处理 \{#catalog-model-handling-61}

- **提供方条目（`umans`）**：`packages/catalog/src/compat/rules/providers/umans.kdl` 声明默认模型为 `umans-coder`。环境变量键：`UMANS_AI_CODING_PLAN_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **视觉能力过滤**：`umansSupportsVision` 严格检查 `supports_vision === true`。哨兵字符串值（例如 `umans-glm-5.1` 和 `umans-glm-5.2` 的 `"via-handoff"`）映射为纯文本（`["text"]`），因此图像内容通过客户端视觉交接处理，而不是发送会导致 HTTP 400 错误的原始图像块（`packages/catalog/src/provider-models/openai-compat.ts`）。
- **定价与回退**：使用定价回退规则，为按量付费及技术别名模型生成目录条目，例如将 `umans-qwen3.6-35b-a3b` 映射到 `umans-flash`（`packages/catalog/scripts/generate-models.ts`）。

## Venice（`venice`） \{#venice-venice}

Venice 是一个注重隐私的 AI 平台，提供未经审查的模型和开源模型。它使用 OpenAI Chat Completions 传输（`api: "openai-completions"`），默认基础 URL 为 `https://api.venice.ai/api/v1`。

### 特殊处理 \{#special-casings-64}

`packages/catalog/src/compat/rules/providers/venice.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 qwen：`thinkingFormat="openai"`。
- 对于类别 gemini，修订版本 >=3.0.0 <3.1.0：`thinking.requiresEffort=true`。
- 对于类别 gemini，修订版本 >=3.1.0 <3.8.0：`thinking.requiresEffort=false`、`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 arcee-trinity-large-thinking：`thinking.requiresEffort=true`。
- 对于模型 deepseek-v4-flash*：`requiresReasoningContentForAllAssistantTurns=true`。
- 对于模型 gemini-3-flash-preview：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 gemini-3-pro-preview：`thinking.efforts=["low","high"]`。
- 对于模型 kimi-k2-thinking：`thinking.requiresEffort=true`。
- 对于模型 qwen3-235b：`thinkingFormat="qwen"`。
- 提供方默认值：`reasoningDisableMode="venice-disable-thinking"`、`thinking.mode="effort"`。

- **显式关闭思考**：`reasoningDisableMode: "venice-disable-thinking"` 将显式关闭选择编码为 `venice_parameters.disable_thinking: true`，保留其他同级 Venice 设置，例如 `include_venice_system_prompt`。

### 认证与用量 \{#auth--usage-64}

- **API 密钥登录与验证**：在 `packages/catalog/src/compat/rules/auth/venice.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户前往 `https://venice.ai/settings/api` 获取 API 密钥（占位符前缀为 `vapi_...`），并使用验证模型 `qwen3-4b` 通过轻量 `chat-completions` 请求验证凭据。在 `packages/ai/src/registry/registry.ts` 中注册。
- **用量统计**：推理用量使用标准 OpenAI Chat Completions 统计（`packages/ai/src/providers/openai-shared.ts` 中的 `calculateOpenAIUsageAccounting`）。`omp usage` 从 `GET /api_keys/rate_limits` 读取美元和 DIEM 余额、为正的内置额度以及 DIEM 周期重置时间。常规推理密钥即可。状态由 Venice 的推理访问标志决定，而非任一余额。

### 目录模型处理 \{#catalog-model-handling-62}

- **提供方条目（`venice`）**：`packages/catalog/src/compat/rules/providers/venice.kdl` 声明默认模型为 `llama-3.3-70b`。环境变量键：`VENICE_API_KEY`。
- **模型管理器选项**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `veniceModelManagerOptions` 使用 `createOpenAICompatibleModelManagerOptions`，基于 `https://api.venice.ai/api/v1` 配置模型管理。
- **流式用量兼容**：在 `veniceModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）中，映射后的模型通过设置 `compat: { ...model.compat, supportsUsageInStreaming: false }` 显式禁用流式用量载荷。
- **Kimi K2.7 Code 最大 token 数限制**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `clampKimiK27CodeMaxTokens`（以及 `packages/catalog/scripts/generate-models.ts` 中的 `applyKimiMaxTokensCap`）将 Kimi K2.7 Code 模型（`isKimiK27CodeModelId`）的输出 token 数（`maxTokens`）限制为不超过 `KIMI_K27_CODE_RECOMMENDED_MAX_TOKENS`。
- **目录转换**：`packages/catalog/src/provider-models/openai-compat.ts` 中 Venice 的 `openAiCompletionsDescriptor` 在模型目录构建和发现转换期间应用 `clampKimiK27CodeMaxTokens`。

## Vercel AI Gateway（`vercel-ai-gateway`） \{#vercel-ai-gateway-vercel-ai-gateway}

Vercel AI Gateway 通过统一代理（`https://ai-gateway.vercel.sh`）将大语言模型请求路由到下层上游提供方（如 Anthropic、OpenAI 或 Bedrock）。它根据模型配置，使用 Anthropic Messages（`anthropic-messages`）、OpenAI Chat Completions（`openai-completions`）和 OpenAI Responses（`openai-responses`）传输协议。

### 特殊处理 \{#special-casings-65}

- **主机检测**：`isVercelGatewayHost` 通过 `modelMatchesHost({ provider, baseUrl }, "vercelAIGateway")` 求值（`packages/catalog/src/compat/resolve.ts`、`packages/catalog/src/hosts.ts`），匹配 `provider === "vercel-ai-gateway"
- **转换后的严格工具**：来自非 Anthropic 上游的模型仍经由 Anthropic Messages 路由提供服务，网关将 Anthropic 结构化输出的 `strict: true` 应用于上游函数工具。OpenAI 严格模式还要求 `required` 包含每个 `properties` 键，而 Anthropic 的严格子集没有此要求，因此带有可选参数且在允许列表中的严格工具（`packages/ai/src/providers/anthropic.ts` 中的 `ANTHROPIC_STRICT_TOOL_ALLOWLIST`）在转换后才会被拒绝，返回 `400 Invalid schema for function '<tool>': … 'required' is required to be supplied and to be an array including every key in properties`。`matchesStrictToolsRejection`（`packages/ai/src/error/flags.ts`）将此措辞归类为 `Flag.Grammar`，因此 `streamAnthropic` 会不带严格工具重试一次，并在提供方会话上固定 `strictToolsDisabled`。

## vLLM（本地 OpenAI 兼容）（`vllm`） \{#vllm-local-openai-compatible-vllm}

vLLM 是一个开源高吞吐量大语言模型服务引擎，运行本地或自托管的 OpenAI 兼容推理服务器。它通过 HTTP/SSE 使用 OpenAI Chat Completions 传输。入口模块包括负责认证和凭据处理的 `packages/catalog/src/compat/rules/auth/vllm.kdl`，以及负责目录选项和动态模型发现的 `packages/catalog/src/provider-models/openai-compat.ts`（`vllmModelManagerOptions`）。

### 特殊处理 \{#special-casings-66}

`packages/catalog/src/compat/rules/providers/vllm.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 qwen：`thinkingFormat="qwen-chat-template"`。

### 认证与用量 \{#auth--usage-65}

- **凭据解析与默认值**：在 `packages/catalog/src/compat/rules/auth/vllm.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。从 `VLLM_API_KEY` 环境变量或通过 `omp auth-broker login vllm` 存储的凭据读取可选 API 密钥。
- **未经认证的本地模式**：未提供密钥时（`emptyKeyFallback: "vllm-local"`），默认使用基础 URL `http://127.0.0.1:8000/v1` 和占位令牌 `"vllm-local"`（`DEFAULT_LOCAL_TOKEN`）。描述符设置指定 `catalogDiscovery: { label: "vLLM", allowUnauthenticated: true }`。
- **文档与端点设置**：登录辅助程序指向 `https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html`，用于配置本地 vLLM OpenAI 兼容服务器端点。

### 目录模型处理 \{#catalog-model-handling-63}

- **提供方条目（`vllm`）**：`packages/catalog/src/compat/rules/providers/vllm.kdl` 声明默认模型为 `gpt-oss-20b`。环境变量键：`VLLM_API_KEY`。
- **动态模型发现**：`vllmModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）调用 `fetchOpenAICompatibleModels`，参数为 `api: "openai-completions"`、`provider: "vllm"`、基础 URL `config?.baseUrl ?? getDefaultModelDiscoveryBaseUrl("vllm")!`（`http://127.0.0.1:8000/v1`），超时为 10 秒（`VLLM_DISCOVERY_TIMEOUT_MS = 10_000`）。
- **上下文窗口提取**：`vllmModelManagerOptions` 中的自定义 `mapModel` 使用 `toPositiveNumber(entry.max_model_len, model.contextWindow)`，从 vLLM 的非标准 `/v1/models` 响应字段 `entry.max_model_len` 提取 `contextWindow`。
- **缓存提供方 ID**：由 `packages/catalog/src/provider-models/cache-provider-id.ts` 中的 `resolveModelCacheProviderId("vllm", { baseUrl })` 解析（使用 `getDefaultModelDiscoveryBaseUrl("vllm")`），生成按基础 URL 求哈希的缓存键，格式为 `vllm:${Bun.hash(baseUrl).toString(36)}`。

## Wafer Serverless（`wafer-serverless`） \{#wafer-serverless-wafer-serverless}

Wafer Serverless 是一个按量付费的提供方，通过位于 `https://pass.wafer.ai/v1` 的 OpenAI 兼容 API 代理多个上游模型（如智谱 GLM、Moonshot Kimi、阿里巴巴 Qwen 和 DeepSeek）。它依赖 OpenAI Chat Completions 传输（`openai-completions`）。

### 特殊处理 \{#special-casings-67}

- 上游思考参数选择通过 `resolveWaferServerlessThinkingFormat`（`packages/catalog/src/provider-models/openai-compat.ts`）根据 `wafer.provider` 封装提示动态配置：
   - 匹配 `zai`、`zhipu`、`moonshot` 或 `kimi` 的上游设置 `thinkingFormat: "zai"`。
   - 匹配 `qwen`、`alibaba` 或 `dashscope` 的上游设置 `thinkingFormat: "qwen"`。
   - 没有封装提示时的回退使用 GLM/Kimi 分类，选择 `"zai"`（`packages/catalog/src/provider-models/openai-compat.ts`）。
   - `generated-policies.ts` 中的静态策略为内置 GLM/Kimi 模型应用 `thinkingFormat: "zai"`（`packages/catalog/scripts/generated-policies.ts`）。
- 所有推理条目都配置 `reasoningContentField: "reasoning_content"`，并设置 `supportsDeveloperRole: false`（`packages/catalog/src/provider-models/openai-compat.ts`）。
- `wafer-pass` 已退役，改用 `wafer-serverless`（`packages/catalog/scripts/generate-models.ts`）。

### 认证与用量 \{#auth--usage-66}

- 使用通过 `WAFER_SERVERLESS_API_KEY` 环境变量提供的 Bearer API 密钥（`wfr_…` 前缀）认证（`packages/catalog/src/compat/rules/providers/wafer-serverless.kdl:465`）。
- 交互式登录在 `packages/catalog/src/compat/rules/auth/wafer-serverless.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户前往 `https://app.wafer.ai/usage`。
- 密钥验证探测 `https://pass.wafer.ai/v1/models`（`packages/catalog/src/compat/rules/auth/wafer-serverless.kdl` 中的 `validate "models-endpoint"`）。

### 目录模型处理 \{#catalog-model-handling-64}

- **提供方条目（`wafer-serverless`）**：`packages/catalog/src/compat/rules/providers/wafer-serverless.kdl` 声明默认模型为 `GLM-5.1`。环境变量键：`WAFER_SERVERLESS_API_KEY`。
- 在提供方描述符中注册，设有 `defaultModel: "GLM-5.1"`，基础 URL 为 `https://pass.wafer.ai/v1`（`packages/catalog/src/compat/rules/providers/wafer-serverless.kdl:463`）。
- 动态目录生成使用 `waferServerlessModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`），并通过 `readWaferRecord`（`packages/catalog/src/provider-models/openai-compat.ts`）解析 `/v1/models` 响应。
- 从 `wafer.capabilities` 映射模型能力：`vision` 启用 `["text", "image"]` 输入，`reasoning` 启用推理模式，`tools` 设置 `supportsTools`（`packages/catalog/src/provider-models/openai-compat.ts`）。
- 上下文窗口读取 `wafer.context_length`（回退为 `max_model_len`），`maxTokens` 限制为不超过 `65536`（`WAFER_MAX_TOKENS_CAP`、`packages/catalog/src/provider-models/openai-compat.ts`）。
- 定价使用 `cents * 125 / 10000`（`cents * 0.0125`），将 `wafer.pricing` 中的内部批发单位转换为美元/百万 token（`packages/catalog/src/provider-models/openai-compat.ts`）。
- 模型 ID 在传输中逐字保留，不进行大小写转换（`packages/catalog/src/provider-models/openai-compat.ts`）。

## xAI API（`xai`） \{#xai-api-xai}

xAI API（`xai`）使用标准 API 密钥认证，提供对 xAI 的 Grok 模型套件的访问。它通过 OpenAI Chat Completions 传输（`https://api.x.ai/v1`）路由推理请求，与使用 OAuth Bearer 令牌及 OpenAI Responses 传输的 `xai-oauth` 不同。

### 特殊处理 \{#special-casings-68}

`packages/catalog/src/compat/rules/providers/xai.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 xai，系列 grok：`filterReasoningHistory=false`、`includeEncryptedReasoning=true`、`reasoningEffortMap={"minimal":"low","xhigh":"high","max":"high"}`、`supportsReasoningSummary=false`、`thinking.mode="effort"`。
- 对于模型 grok-3-mini*、grok-4.20-multi-agent*、grok-4.3*、grok-4.5*、grok-4.6*、grok-4.7*：`supportsReasoningEffort=true`、`omitReasoningEffort=false`。
- 对于模型 grok-4.20-multi-agent*、grok-4.6*、grok-4.7*：`reasoningEffortMap={"minimal":"low"}`。
- 对于模型 _reasoning、grok-build_、grok-code-fast*、_composer_：`omitReasoningEffort=true`、`supportsReasoningEffort=false`。
- 对于模型 grok-4.20-0309-reasoning、grok-4.20-beta-latest-reasoning：`thinking.requiresEffort=true`。
- 提供方默认值：`promptCacheSessionHeader="x-grok-conv-id"`、`rejectRootObjectUnion=true`。

### 认证与用量 \{#auth--usage-67}

- **认证**：基于密钥的认证在 `packages/catalog/src/compat/rules/auth/xai.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。引导用户前往 `"https://console.x.ai/team/default/api-keys"`，提示为 `"Paste your xAI API key"`（占位符为 `"xai-..."`）。
- **验证**：通过 `models-endpoint` 针对 `"https://api.x.ai/v1/models"` 执行凭据检查（`packages/catalog/src/compat/rules/auth/xai.kdl` 中的 `validate "models-endpoint"`）。
- **环境变量回退**：配置为解析 `XAI_API_KEY`（`packages/catalog/src/compat/rules/providers/xai.kdl`，符号 `descriptors`）。
- **用量追踪**：除 `OpenAI Chat Completions` 流水线之外，没有其他处理。

### 目录模型处理 \{#catalog-model-handling-65}

- **提供方条目（`xai`）**：`packages/catalog/src/compat/rules/providers/xai.kdl` 声明默认模型为 `grok-4.6`。环境变量键：`XAI_API_KEY`。
- **手工编写的种子条目**：`grok-tts`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- **管理器选项**：通过 `createSimpleOpenAICompletionsOptions("xai", "https://api.x.ai/v1", config)` 构造（`packages/catalog/src/provider-models/openai-compat.ts`，符号 `xaiModelManagerOptions`）。
- **补全描述符**：以 `openAiCompletionsDescriptor("xai", "xai", "https://api.x.ai/v1")` 注册（`packages/catalog/src/provider-models/openai-compat.ts`，符号 `openAiCompletionsDescriptor`），通过 `openai-completions` API 提供 Grok 模型。

## xAI Grok OAuth（SuperGrok）（`xai-oauth`） \{#xai-grok-oauth-supergrok-xai-oauth}

xAI Grok OAuth 通过 OpenAI Responses 传输（`api: "openai-responses"`、`baseUrl: "https://api.x.ai/v1"`）提供基于订阅（SuperGrok / X Premium+）的 xAI Grok 模型访问。认证针对 `https://auth.x.ai` 使用 RFC 8628 设备代码流程，而用量追踪探测专用的 SuperGrok CLI 计费代理。

### 特殊处理 \{#special-casings-69}

`packages/catalog/src/compat/rules/providers/xai-oauth.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 xai，系列 grok，修订版本 >=0.1.0 <4.3.0：`omitReasoningEffort=true`。
- 对于类别 xai，系列 grok，修订版本 >=4.3.0 <4.20.0：`omitReasoningEffort=false`、`supportsReasoningEffort=true`。
- 对于类别 xai，系列 grok：`filterReasoningHistory=false`、`includeEncryptedReasoning=true`、`reasoningEffortMap={"minimal":"low","xhigh":"high","max":"high"}`、`supportsImageDetailOriginal=false`、`supportsReasoningSummary=false`、`thinking.mode="effort"`。
- 对于模型 *reasoning、grok-build：`omitReasoningEffort=true`、`supportsReasoningEffort=false`。
- 对于模型 grok-4.6*、grok-4.7*、grok-4.20-multi-agent*：`reasoningEffortMap={"minimal":"low"}`。
- 对于模型 grok-4.20-multi-agent-0309：`omitReasoningEffort=false`、`supportsReasoningEffort=true`。
- 提供方默认值：`promptCacheSessionHeader="x-grok-conv-id"`、`rejectRootObjectUnion=true`。

### 认证与用量 \{#auth--usage-68}

- **OAuth 认证**：在 `packages/catalog/src/compat/rules/auth/xai-oauth.kdl` 中声明为 `login "device-code"` 规则（`packages/ai/src/registry/engine/device-code.ts`），令牌钩子位于 `packages/ai/src/registry/oauth/xai-oauth.ts`。针对 `https://auth.x.ai` 执行 RFC 8628 设备授权（客户端 ID 为 `b1a00492-073a-47ea-816f-4c329264a828`，权限范围为 `openid profile email offline_access grok-cli:access api:access`）。端点验证与身份辅助程序位于 `packages/ai/src/registry/oauth/xai-oauth.ts`（`validateXAIEndpoint`、`fetchXAIOAuthIdentity`）。环境变量回退：先 `XAI_OAUTH_TOKEN`，再 `XAI_API_KEY`（`descriptors.ts`）。
- **用量追踪**：`xaiOauthUsageProvider`（`packages/ai/src/usage/xai-oauth.ts`）使用头 `X-XAI-Token-Auth: xai-grok-cli`（`getXAICliBillingHeaders`）查询 `https://cli-chat-proxy.grok.com/v1/billing`（`validateXAIBillingEndpoint` 固定为 HTTPS `*.grok.com`）。接受的凭据限有效 OAuth Bearer 凭据。探测旧版每周额度（`?format=credits`，`parseWeeklyBillingConfig` 解析 `creditUsagePercent` 和 `productUsage`）及统一每月配额（`parseMonthlyBillingConfig` 解析 `monthlyLimit` 和 `used`），另包含为正的 `onDemandCap` / `onDemandUsed` 限额。

### 目录模型处理 \{#catalog-model-handling-66}

- **提供方条目（`xai-oauth`）**：`packages/catalog/src/compat/rules/providers/xai-oauth.kdl` 声明默认模型为 `grok-4.6`。环境变量键：`XAI_OAUTH_TOKEN`、`XAI_API_KEY`。
- **手工编写的种子条目**：`grok-build`、`grok-build-0.1`、`grok-4.3`、`grok-4.5`、`grok-4.6`、`grok-4.7`、`grok-4.20-multi-agent-0309`、`grok-4.20-0309-reasoning`、`grok-4.20-0309-non-reasoning`、`grok-composer-2.5-fast`、`grok-tts`、`grok-imagine-image`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- **动态精选覆盖层**：`applyXAIOAuthCuration`（`openai-compat.ts`、`xaiOAuthModelManagerOptions`）过滤非聊天前缀（`grok-imagine-`、`grok-stt-`、`grok-voice-`），覆盖精选的上下文窗口（最高 1M；api.x.ai 在 Grok 4.20 0309 模型上拒绝更大的提示），将 `maxTokens` 设为等于 `contextWindow`，保留图像能力和推理标志，并注入缺失的精选模型。

## 小米 MiMo（`xiaomi`） \{#xiaomi-mimo-xiaomi}

小米 MiMo 通过 OpenAI 兼容端点提供小米专有的 MiMo 模型系列（例如 `mimo-v2.5` 和 `mimo-v2.5-pro`）。请求通过 OpenAI Chat Completions 传输执行，使用标准按量付费基础 URL（`https://api.xiaomimimo.com/v1`）或区域 Token Plan 基础 URL（`https://token-plan-{sgp,ams,cn}.xiaomimimo.com/v1`）。

### 特殊处理 \{#special-casings-70}

`packages/catalog/src/compat/rules/providers/xiaomi.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 mimo，系列 v2：`allowsSyntheticReasoningContentForToolCalls=false`、`reasoningContentField="reasoning_content"`、`requiresReasoningContentForToolCalls=true`、`supportsStore=false`、`thinkingFormat="zai"`、`thinking.mode="effort"`。
- 对于模型 mimo-v2.5：`allowsSyntheticReasoningContentForToolCalls=false`、`reasoningContentField="reasoning_content"`、`requiresReasoningContentForToolCalls=true`、`supportsStore=false`、`thinkingFormat="zai"`。

- **推理内容不变量**：
   - `requiresReasoningContentForToolCalls: true`（`packages/catalog/src/compat/resolve.ts`）：MiMo 模型在标准和 Token Plan 主机上的思考模式工具调用续接中，要求原样重放 `reasoning_content`。
   - `requiresReasoningContentForAllAssistantTurns: true`（`packages/catalog/src/compat/resolve.ts`）：在推理模式下，强制所有先前助手轮次都存在 `reasoning_content`（经由 OpenRouter 路由时除外）。
   - `allowsSyntheticReasoningContentForToolCalls: false`（`packages/catalog/src/compat/resolve.ts`）：拒绝工具调用轮次上的合成 `reasoning_content` 占位符（例如 `"."`）。
- **思考格式与强度映射**：
   - `thinkingFormat: "zai"`（`packages/catalog/src/compat/resolve.ts`）：使用 z.ai 二元 `thinking` 结构格式化思考模式载荷。
   - `supportsReasoningEffort: false`（`packages/catalog/src/compat/resolve.ts`）：抑制标准 `reasoning_effort` 参数。

### 流行为 \{#stream-behavior-18}

### 认证与用量 \{#auth--usage-69}

- **注册表与提供方定义**：主要提供方在 `packages/catalog/src/compat/rules/auth/xiaomi.kdl` 中声明；区域 Token Plan 提供方在 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-{ams,cn,sgp}.kdl` 中声明。
- **交互式密钥提示与验证**：标准小米登录（`packages/ai/src/registry/oauth/xiaomi.ts` 中的 `loginXiaomi`）提示输入标准（`sk-...`）或 Token Plan（`tp-...`/`ttp-...`，由 `packages/catalog/src/wire/xiaomi-token-plan.ts` 中的 `isXiaomiTokenPlanKey` 识别）API 密钥，并通过 `validateXiaomiApiKey` 验证，而区域 Token Plan 提供方使用各自 `.kdl` 文件中的声明式 `login "api-key"` 规则。两条路径都使用 `mimo-v2.6-flash` 验证；通用 Token Plan 登录复用区域认证规则的验证 URL 和模型，而标准 `sk-` 登录使用小米目录默认值。
- **Token Plan 验证回退**：使用 Token Plan（`tp-`/`ttp-`）密钥的标准 `xiaomi` 登录依次回退到 SGP（`https://token-plan-sgp.xiaomimimo.com/v1`）→ AMS（`https://token-plan-ams.xiaomimimo.com/v1`）→ CN（`https://token-plan-cn.xiaomimimo.com/v1`），为每个端点使用新的 `AbortSignal.timeout(15_000)` 信号，因此区域超时不会中止后续回退端点。只有 401（密钥对该集群无效）或传输失败才会进入下一区域；其他 HTTP 状态会立即呈现，避免后续区域的 401 掩盖它。区域 `xiaomi-token-plan-*` 登录针对其特定集群验证。
- **环境变量**：标准 `xiaomi` 使用 `XIAOMI_API_KEY`，区域 Token Plan 提供方使用 `XIAOMI_TOKEN_PLAN_AMS_API_KEY`、`XIAOMI_TOKEN_PLAN_CN_API_KEY`、`XIAOMI_TOKEN_PLAN_SGP_API_KEY`（`packages/catalog/src/compat/rules/providers/xiaomi.kdl`）。

### 目录模型处理 \{#catalog-model-handling-67}

- **提供方条目（`xiaomi`）**：`packages/catalog/src/compat/rules/providers/xiaomi.kdl` 声明默认模型为 `mimo-v2.6-flash`。环境变量键：`XIAOMI_API_KEY`。
- **动态模型发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `xiaomiModelManagerOptions` 检查密钥（Token Plan 的 `tp-`/`ttp-` 与 `sk-`）和提供方 ID，以查询标准或区域 `/models` 端点（`XIAOMI_TOKEN_PLAN_BASE_URLS`），并在返回模型上保留区域提供方 ID。
- **音频模型过滤**：在 `xiaomiModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）和 `scripts/generate-models.ts` 中，语音及音频模型被排除在发现和目录生成之外（`!model.id.includes("-tts") && !model.id.includes("-asr")`）。
- **主机匹配**：`modelMatchesHost`（`packages/catalog/src/hosts.ts`）将 `xiaomi` 提供方 ID、`xiaomi-token-plan-` 提供方前缀及 `xiaomimimo.com` URL 标记匹配到 `xiaomi` 主机类别。

## 小米 Token Plan（欧洲）（`xiaomi-token-plan-ams`） \{#xiaomi-token-plan-europe-xiaomi-token-plan-ams}

小米 Token Plan（欧洲）（`xiaomi-token-plan-ams`）通过小米欧洲 Token Plan 网关（`https://token-plan-ams.xiaomimimo.com/v1`）提供对小米 MiMo 模型系列（例如 `mimo-v2.5` 和 `mimo-v2-omni`）的区域访问。它使用 OpenAI Chat Completions 传输（`api: "openai-completions"`）。该区域提供方允许通过 CLI 登录（`omp login`）和动态模型查找，针对欧洲集群存储和验证 `tp-` API 密钥，而不跨区域回退。

### 特殊处理 \{#special-casings-71}

`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-ams.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。

- **TTS/ASR 模型过滤**：动态模型管理器选项（`packages/catalog/src/provider-models/openai-compat.ts` 中的 `xiaomiModelManagerOptions`）和模型生成脚本（`scripts/generate-models.ts`）会过滤音频模型（`!model.id.includes("-tts") && !model.id.includes("-asr")`）。
- **提供方 ID 保留**：`xiaomiModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）显式设置 `providerId: "xiaomi-token-plan-ams"`，并将动态发现条目映射回 `provider: "xiaomi-token-plan-ams"`，而不是将它们合并为通用 `xiaomi`。

### 认证与用量 \{#auth--usage-70}

- **注册表提供方与认证策略**：在 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-ams.kdl` 中，以 ID `"xiaomi-token-plan-ams"` 声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。
- **区域控制台说明**：`packages/catalog/src/compat/rules/auth/xiaomi-token-plan-ams.kdl` 中声明的交互式 CLI 登录会提示用户输入以 `tp-` 为前缀的 API 密钥，并引导其前往 Token Plan 控制台 URL（`https://platform.xiaomimimo.com/console/plan-manage`）。
- **单集群验证**：直接针对 `https://token-plan-ams.xiaomimimo.com/v1` 验证密钥（通过 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-ams.kdl` 中的 `validate "chat-completions"` 使用 `mimo-v2.6-flash`），绕过通用 `loginXiaomi` 所用的多区域回退序列。
- **头与错误**：请求传递标准的 `Authorization: Bearer tp-...` 头。认证或网络失败抛出 `AIError.OAuthError` 或 `AIError.ApiKeyRequiredError`。

### 目录模型处理 \{#catalog-model-handling-68}

- **提供方条目（`xiaomi-token-plan-ams`）**：`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-ams.kdl` 声明默认模型为 `mimo-v2.6-flash`。环境变量键：`XIAOMI_TOKEN_PLAN_AMS_API_KEY`。
- **动态模型管理器**：`xiaomiModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）为 `fetchDynamicModels` 将 `tokenPlanRegion: "ams"` 映射到基础 URL `https://token-plan-ams.xiaomimimo.com/v1`，使用 `createBundledReferenceMap("xiaomi")` 获取基准规格。
- **预打包目录模型**：内置模型（例如 `mimo-v2-omni`、`mimo-v2.5`）在 `packages/catalog/src/models.json` 中以键 `"xiaomi-token-plan-ams"` 注册，设置 `baseUrl: "https://token-plan-ams.xiaomimimo.com/v1"` 和 `api: "openai-completions"`。

## 小米 Token Plan（中国）（`xiaomi-token-plan-cn`） \{#xiaomi-token-plan-china-xiaomi-token-plan-cn}

小米 Token Plan（中国）是小米 MiMo Token Plan 订阅服务的中国区域端点（`https://token-plan-cn.xiaomimimo.com/v1`）。它使用区域 `tp-...` API 密钥提供 MiMo AI 模型访问。它使用“OpenAI Chat Completions”传输。

### 特殊处理 \{#special-casings-72}

`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-cn.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。

- **主机分类**：`packages/catalog/src/hosts.ts` 中的 `KNOWN_HOSTS.xiaomi` 通过 `providerPrefixes: ["xiaomi-token-plan-"]` 和 `urlMarkers: ["xiaomimimo.com"]` 匹配 `xiaomi-token-plan-cn`，在所有 Token Plan 端点上启用主机级兼容标志。
- **推理内容重放**：`packages/catalog/src/compat/resolve.ts` 将小米主机上的 MiMo 模型标记为 `requiresReasoningContentForToolCalls: true` 和 `requiresReasoningContentForAllAssistantTurns: true`，要求先前的助手工具调用轮次原样保留 `reasoning_content`。
- **合成推理拒绝**：对于 MiMo 模型，`packages/catalog/src/compat/resolve.ts` 中的 `allowsSyntheticReasoningContentForToolCalls` 求值为 `false`，拒绝工具调用续接中的合成 `.` 占位符。
- **音频 SKU 过滤**：`packages/catalog/scripts/generate-models.ts` 为 `xiaomi-token-plan-` 提供方过滤包含 `-tts` 或 `-asr` 的语音合成及识别 SKU。

### 认证与用量 \{#auth--usage-71}

- **环境变量与登录**：通过 `XIAOMI_TOKEN_PLAN_CN_API_KEY` 认证。在 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-cn.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`）。
- **区域 API 密钥验证**：提示输入来自 `https://platform.xiaomimimo.com/console/plan-manage` 的 `tp-...` 密钥，并通过声明式 API 密钥登录规则，限定向 `https://token-plan-cn.xiaomimimo.com/v1` 发送 `mimo-v2.6-flash` 的 `POST /v1/chat/completions` 请求进行验证，超时为 15 秒（`VALIDATION_TIMEOUT_MS`）。
- **用量统计**：适用标准 OpenAI Chat Completions 用量统计（`calculateOpenAIUsageAccounting`）；不存在提供方特定的用量或配额模块。

### 目录模型处理 \{#catalog-model-handling-69}

- **提供方条目（`xiaomi-token-plan-cn`）**：`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-cn.kdl` 声明默认模型为 `mimo-v2.6-flash`。环境变量键：`XIAOMI_TOKEN_PLAN_CN_API_KEY`。
- **手工编写的种子条目**：`mimo-v2.6-pro`、`mimo-v2.6-flash`、`mimo-v2.6-pro-ultraspeed`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- **区域发现与模型管理器**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `xiaomiModelManagerOptions` 将发现固定到 `XIAOMI_TOKEN_PLAN_BASE_URLS.cn`（`https://token-plan-cn.xiaomimimo.com/v1`）。动态模型发现保留 `providerId: "xiaomi-token-plan-cn"`，过滤 `-tts` 和 `-asr` 模型，并使用 `createBundledReferenceMap("xiaomi")` 从内置 `xiaomi` 参考规格合并元数据。

## 小米 Token Plan（新加坡）（`xiaomi-token-plan-sgp`） \{#xiaomi-token-plan-singapore-xiaomi-token-plan-sgp}

小米 Token Plan（新加坡）提供方（`xiaomi-token-plan-sgp`）使用 OpenAI Chat Completions 传输（`openai-completions`）将请求路由至小米新加坡 Token Plan 集群。它使用绑定区域且面向 `https://token-plan-sgp.xiaomimimo.com/v1` 的 `tp-...` API 密钥，提供小米 MiMo 模型（`mimo-v2.5`、`mimo-v2-omni`）的专门访问。该区域条目允许登录和模型存储与标准小米 MiMo（`xiaomi`）及其他区域 Token Plan 端点（`xiaomi-token-plan-ams`、`xiaomi-token-plan-cn`）隔离。

### 特殊处理 \{#special-casings-73}

`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-sgp.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。

- **区域基础 URL 绑定**：配置 `tokenPlanRegion: "sgp"` 时，`xiaomiModelManagerOptions`（`packages/catalog/src/provider-models/openai-compat.ts`）显式将 `baseUrl` 设置为 `https://token-plan-sgp.xiaomimimo.com/v1`（`XIAOMI_TOKEN_PLAN_BASE_URLS.sgp`），防止 Token Plan 密钥回到标准小米端点 `https://api.xiaomimimo.com/v1`（`XIAOMI_STANDARD_BASE_URL`）。

### 认证与用量 \{#auth--usage-72}

- **固定区域验证**：限定针对新加坡端点 `https://token-plan-sgp.xiaomimimo.com/v1` 验证密钥（通过 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-sgp.kdl` 中的 `validate "chat-completions"`）。与通用 `loginXiaomi`（对 `tp-` 密钥执行 SGP -> AMS -> CN 回退）不同，`xiaomi-token-plan-sgp` 在认证验证期间禁用跨区域回退。
- **计划管理认证 URL**：在 `packages/catalog/src/compat/rules/auth/xiaomi-token-plan-sgp.kdl` 中声明，向用户显示指向 `https://platform.xiaomimimo.com/console/plan-manage` 的说明，以获取区域 `tp-` 密钥（`placeholder="tp-..."`），不同于标准的 `https://platform.xiaomimimo.com/#/console/api-keys`。
- **验证握手**：验证通过 `POST /chat/completions` 测试凭据，使用模型 `mimo-v2.6-flash`（`packages/catalog/src/compat/rules/auth/xiaomi-token-plan-sgp.kdl` 中的 `validate "chat-completions"`）、`max_tokens: 1` 和 `messages: [{ role: "user", content: "ping" }]`，强制执行 15 秒超时。
- **用量统计**：token 消耗和缓存指标通过 `calculateOpenAIUsageAccounting`（`packages/ai/src/providers/openai-shared.ts`），使用标准 OpenAI Chat Completions 统计计算。

### 目录模型处理 \{#catalog-model-handling-70}

- **提供方条目（`xiaomi-token-plan-sgp`）**：`packages/catalog/src/compat/rules/providers/xiaomi-token-plan-sgp.kdl` 声明默认模型为 `mimo-v2.6-flash`。环境变量键：`XIAOMI_TOKEN_PLAN_SGP_API_KEY`。
- **内置规格映射**：动态模型映射使用 `createBundledReferenceMap`（`packages/catalog/src/provider-models/openai-compat.ts`），将动态模型与 `packages/catalog/src/models.json` 中 `"xiaomi"` 下定义的静态参考规格合并。

## Z.AI（GLM Coding Plan）（`zai`） \{#zai-glm-coding-plan-zai}

Z.AI 通过智谱 AI 的编程计划基础设施，使用 Anthropic Messages 传输（`https://api.z.ai/api/anthropic`）提供 GLM 系列模型（如 `glm-5.2`）。认证同时支持直接 API 密钥和可生成持久 API 密钥的 OAuth 浏览器登录流程。

### 特殊处理 \{#special-casings-74}

`packages/catalog/src/compat/rules/providers/zai.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 glm，系列 flash：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="budget"`。
- 对于类别 glm，系列 turbo：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="budget"`。
- 对于模型 *5、*v、glm-4.5-air、glm-4.6、glm-4.7、glm-5.1：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="budget"`。
- 对于模型 glm-5.2：`thinking.efforts=["high","max"]`、`thinking.mode="anthropic-budget-effort"`。
- 对于模型 glm-5.3-flash：`clampOutputToModelMax=true`、`thinking.mode="anthropic-budget-effort"`。
- 提供方默认值：`requiresToolResultId=true`。

- **推理内容续接重放**：在 `streamOpenAICompletionsOnce`（`packages/ai/src/providers/openai-completions.ts`）中，当 `compat.thinkingFormat === "zai"` 且 `model.reasoning` 为 true 时，在跨 API 提供方切换（例如 Anthropic → OpenAI）时，会将保留的思考块重新序列化到 `assistantMsg.reasoning_content`，以保留结构化推理历史，而不降级为文本（#3434）。
- **外来思考保留**：`packages/ai/src/providers/transform-messages.ts` 中的 `targetReadsForeignThinking` 对具有 `compat.thinkingFormat === "zai"` 的推理模型返回 true，在消息转换中保留非原生思考块。
- **最大输出 token 限制**：`packages/ai/src/providers/openai-shared.ts` 中的 `resolveOpenAICompletionsOutputClamp` 将 `isZaiReasoningEffortDialect` 模型（`glm-5.2`）的输出限制为 `model.maxTokens`，而不是默认的 64k 上限。
- **主机 URL 匹配**：`packages/catalog/src/hosts.ts` 中的 `hostMatchesUrl` 通过 `api.z.ai` URL 标记匹配 Z.AI 端点。

### 认证与用量 \{#auth--usage-73}

- **API 密钥登录**：在 `packages/catalog/src/compat/rules/auth/zai.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），提示输入 `ZAI_API_KEY`（控制台为 `https://z.ai/manage-apikey/apikey-list`），并使用模型 `glm-5.2`，通过针对 `https://api.z.ai/api/coding/paas/v4` 的聊天补全探测验证。
- **OAuth 流程与浏览器登录**：在 `packages/catalog/src/compat/rules/auth/zai-coding-plan.kdl` 中声明为 `login "oauth-code"` 规则（`packages/ai/src/registry/engine/oauth-code.ts`），密钥生成钩子位于 `packages/ai/src/registry/oauth/zai.ts`。它在 `https://chat.z.ai/api/oauth/authorize` 发起授权，使用 ZCode 注册的 CLI 重定向地址 `http://127.0.0.1:9999/callback`（可回退到粘贴代码），并在 `https://zcode.z.ai/api/v1/oauth/token` 交换授权码。
- **持久密钥生成**：`mintZaiApiKey`（`packages/ai/src/registry/oauth/zai.ts`）通过 `businessLogin`（`https://api.z.ai/api/auth/z/login`）将短期 OAuth 令牌交换为业务令牌，通过 `getCustomerInfo`（`BIZ_BASE` = `https://api.z.ai`）解析默认组织/项目，创建或复用密钥 `"oh-my-pi"`（`KEY_NAME`），并通过 `/copy/${apiKey}` 复制密钥秘密，输出持久的 49 字符 `${apiKey}.${secretKey}` 令牌，以 `storeCredentialsAs: "zai"` 保存。
- **用量与配额获取器**：`fetchZaiUsage` / `zaiUsageProvider`（`packages/ai/src/usage/zai.ts`）使用直接密钥授权，查询 `DEFAULT_ENDPOINT`（`https://api.z.ai`）上的 `QUOTA_PATH`（`/api/monitor/usage/quota/limit`）。`parseLimitItem` 将 `TOKENS_LIMIT` 解析为 token 配额（`zai:tokens:<window>`），将 `TIME_LIMIT` 解析为请求配额（`zai:requests:<window>`，或在 `isZaiFeatureRequestLimit` 匹配时为 `zai:features:zread:<window>`），并针对基于额度的 GLM Coding Plan 将 `CREDIT_LIMIT` 解析为额度配额（`zai:credits:<window>`，单位为 `credits`）（例如 12k 额度 / 5h + 60k 额度 / 周；`usage` 为分配额度，`currentValue` 为已花费额度）。载荷的 `data.level`（如 `"lite"`、`"pro"`、`"max"`）呈现为 `metadata.planType`。`buildZaiWindow` 将时间单位映射为 1h、1d、1mo 或 1w 窗口，并可选获取 `MODEL_USAGE_PATH`（`/api/monitor/usage/model-usage`）。
- **凭据排序**：`zaiRankingStrategy`（`packages/ai/src/usage/zai.ts`，在 `packages/ai/src/auth-storage.ts` 中注册）通过 `rankZaiRequestLimits` 对请求限额排序（不存在请求配额时，回退到完整凭据限额集，即 token/请求/额度），选择主要的 5 小时和次要的每周配额窗口。

### 目录模型处理 \{#catalog-model-handling-71}

- **提供方条目（`zai`）**：`packages/catalog/src/compat/rules/providers/zai.kdl` 声明默认模型为 `glm-5.3`。环境变量键：`ZAI_API_KEY`。
- **手工编写的种子条目**：`glm-5.3`、`glm-5.3-flash`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。

## ZenMux（`zenmux`） \{#zenmux-zenmux}

ZenMux 是一个根据模型归属使用双传输路由的多提供方网关。归属 Anthropic 的模型（通过 `owned_by: "anthropic"` 或 `anthropic/` 前缀识别）经由 Anthropic Messages（`https://zenmux.ai/api/anthropic`）路由，其他所有模型则经由 OpenAI Chat Completions（`https://zenmux.ai/api/v1`）路由。

### 特殊处理 \{#special-casings-75}

`packages/catalog/src/compat/rules/providers/zenmux.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 anthropic，修订版本 >=3.7.0 <4.6.0：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 baidu，系列 ernie：`thinking.mode="effort"`。
- 对于类别 bytedance，系列 doubao：`thinking.mode="effort"`。
- 对于类别 deepseek：`thinking.mode="effort"`。
- 对于类别 gemini，修订版本 >=2.5.0 <3.7.0：`thinking.mode="effort"`。
- 对于类别 glm，系列 flash：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 glm，系列 turbo：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于类别 glm：`thinking.mode="effort"`。
- 对于类别 kimi：`thinking.mode="effort"`。
- 对于类别 mimo，系列 v2：`thinking.mode="effort"`。
- 对于类别 minimax：`thinking.mode="effort"`。
- 对于类别 openai，修订版本 >=4.0.0 <5.7.0：`thinking.mode="effort"`。
- 对于类别 qwen，修订版本 >=3.0.0 <3.236.0：`thinking.mode="effort"`。
- 对于类别 stepfun，系列 step：`thinking.mode="effort"`。
- 对于类别 unknown：`thinking.efforts=["minimal","low","medium","high","xhigh"]`、`thinking.mode="effort"`。
- 对于类别 xai，系列 grok：`thinking.mode="effort"`。
- 对于模型 baidu/ernie-5.0-thinking-preview、tencent/hunyuan-2.0-thinking：`thinking.requiresEffort=true`。
- 对于模型 deepseek/deepseek-chat-v3.1：`requiresReasoningContentForAllAssistantTurns=true`、`thinking.efforts=["high","max"]`。
- 对于模型 deepseek/deepseek-reasoner：`requiresReasoningContentForAllAssistantTurns=true`、`thinking.efforts=["high","max"]`、`thinking.requiresEffort=true`。
- 对于模型 google/gemma-4-26b-a4b-it：`thinking.mode="effort"`。
- 对于模型 openai/gpt-5.1-codex：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 openai/gpt-5.1-codex-mini：`thinking.efforts=["medium","high"]`。
- 对于模型 z*5、z-ai/glm-4.5-air、z-ai/glm-4.6、z-ai/glm-4.6v、z-ai/glm-4.7、z-ai/glm-5.1：`thinking.efforts=["minimal","low","medium","high","xhigh"]`。
- 对于模型 z-ai/glm-5.2*：`thinking.efforts=["minimal","low","medium","high","max"]`。
- 提供方默认值：`supportsStrictMode=true`。

- **双传输基础 URL 规范化**：`normalizeZenMuxOpenAiBaseUrl` 和 `toZenMuxAnthropicBaseUrl`（`packages/catalog/src/provider-models/openai-compat.ts`）在端点 URL 之间转换。OpenAI 端点默认为 `https://zenmux.ai/api/v1`，Anthropic 路由到 `https://zenmux.ai/api/anthropic`，指定自定义基础 URL 时会自动转换路径。

### 认证与用量 \{#auth--usage-74}

- **API 密钥解析**：`ZENMUX_API_KEY` 在 `descriptors.ts`（`packages/catalog/src/compat/rules/providers/zenmux.kdl`）中注册，并通过 `packages/ai/src/stream.ts` 中的 `getEnvApiKey("zenmux")` 解析。
- **密钥验证与登录**：在 `packages/catalog/src/compat/rules/auth/zenmux.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），引导用户前往 `https://zenmux.ai/settings/keys`，并通过 `validate "models-endpoint"` 针对 `https://zenmux.ai/api/v1/models` 验证凭据。
- **未经认证的发现**：`descriptors.ts` 中的 `allowUnauthenticated: true` 启用不需要 API 密钥的模型目录发现。

### 目录模型处理 \{#catalog-model-handling-72}

- **提供方条目（`zenmux`）**：`packages/catalog/src/compat/rules/providers/zenmux.kdl` 声明默认模型为 `anthropic/claude-opus-5`。环境变量键：`ZENMUX_API_KEY`。模型管理允许未经认证的访问。
- **动态模型发现**：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `zenmuxModelManagerOptions` 使用 `fetchOpenAICompatibleModels` 查询 `https://zenmux.ai/api/v1/models`。`isZenMuxAnthropicModel` 检查 `entry.owned_by === "anthropic"` 或 ID 前缀 `anthropic/`，以设置 `api: "anthropic-messages"` 或 `api: "openai-completions"`。
- **定价提取**：`getZenMuxPricingValue` 和 `getZenMuxCacheWritePrice`（`packages/catalog/src/provider-models/openai-compat.ts`）从 `entry.pricings` 提取 token 费用：`prompt` 为输入费用，`completion` 为输出费用，`input_cache_read` 为缓存读取费用，并按层级查找 `input_cache_write_1_h`、`input_cache_write_5_min` 或 `input_cache_write` 以确定缓存写入费用。
- **能力与限制**：映射 `entry.display_name`、`entry.context_length`（`contextWindow`）、`entry.max_completion_tokens`（`maxTokens`）、`entry.input_modalities`（`input`）和 `capabilities.reasoning`（`reasoning`）。

## 智谱 Coding Plan（智谱）（`zhipu-coding-plan`） \{#zhipu-coding-plan-智谱-zhipu-coding-plan}

智谱 BigModel 的国内编程计划提供方，使用 OpenAI Chat Completions 传输（`openai-completions` API）。它将请求路由到智谱专用 Coding Plan 端点（`https://open.bigmodel.cn/api/coding/paas/v4`），而非通用 BigModel 端点，以确保 API 调用消耗编程计划配额，而非账户余额。

### 特殊处理 \{#special-casings-76}

`packages/catalog/src/compat/rules/providers/zhipu-coding-plan.kdl` 中的提供方特定覆盖项（更具体的选择器覆盖提供方默认值）：

- 对于类别 glm，系列 turbo：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 对于类别 glm：`thinking.mode="effort"`。
- 对于模型 *5、glm-4.6：`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 glm-4.5-air：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`。
- 对于模型 glm-4.6v、glm-4.7、glm-5.1：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`、`thinking.efforts=["minimal","low","medium","high"]`。
- 对于模型 glm-5.2*：`reasoningContentField="reasoning_content"`、`supportsDeveloperRole=false`、`thinkingFormat="zai"`、`thinking.efforts=["high","max"]`。
- 提供方默认值：`thinkingFormat="zai"`。

### 认证与用量 \{#auth--usage-75}

- **凭据与 API 基础地址**：通过 `ZHIPU_API_KEY`（`packages/catalog/src/compat/rules/providers/zhipu-coding-plan.kdl` 第 541 行）认证，API 基础 URL 为 `https://open.bigmodel.cn/api/coding/paas/v4`，控制台 URL 为 `https://bigmodel.cn/coding-plan/personal/overview`（`packages/catalog/src/compat/rules/auth/zhipu-coding-plan.kdl`）。
- **API 密钥登录与验证**：在 `packages/catalog/src/compat/rules/auth/zhipu-coding-plan.kdl` 中声明为 `login "api-key"` 规则（`packages/ai/src/registry/engine/api-key.ts`），密钥格式为 `<id>.<secret>`，在 `https://open.bigmodel.cn/api/coding/paas/v4` 针对 `glm-5.1` 验证。主机检测通过 `hosts.ts` 连接（`zhipu`，urlMarker 为 `open.bigmodel.cn`，`packages/catalog/src/hosts.ts`）。
- **中文 429 配额分类**：`packages/ai/src/error/rate-limit.ts` 中的 `CN_QUOTA_EXHAUSTED_PATTERN`（`/使用.{0,30}?上限|(?:额度|配额)已?(?:用|耗)(?:完|尽)|限额.{0,30}重置|余额不足/`）将智谱的 429 配额耗尽响应（`"429 已达到 5 小时的使用上限。您的限额将在 ... 重置。"`）归类为 `QUOTA_EXHAUSTED`，触发凭据轮换而非暂态退避。

### 目录模型处理 \{#catalog-model-handling-73}

- **提供方条目（`zhipu-coding-plan`）**：`packages/catalog/src/compat/rules/providers/zhipu-coding-plan.kdl` 声明默认模型为 `glm-5.1`。环境变量键：`ZHIPU_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。

# 其他目录路由 \{#additional-catalog-routes}

## Abliteration（`abliteration`） \{#abliteration-abliteration}

### 特殊处理 \{#special-casings-77}

- 使用 `openai-responses`；带凭据的 `/models` 发现具有权威性，并关联内置/精选参考。

### 认证与用量 \{#auth--usage-76}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/abliteration.kdl` 中声明。环境变量键：`ABLITERATION_API_KEY`、`ABLIT_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-74}

- **提供方条目（`abliteration`）**：`packages/catalog/src/compat/rules/providers/abliteration.kdl` 声明默认模型为 `abliterated-model`。环境变量键：`ABLITERATION_API_KEY`、`ABLIT_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`abliterated-model`、`abliterated-model-large-v2`、`abliterated-model-large`；打包策略为 `fallback`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `abliterationModelManagerOptions`。

## Apple Foundation Models（设备端）（`apple`） \{#apple-foundation-models-on-device-apple}

### 特殊处理 \{#special-casings-78}

- Apple Foundation Models 是一个进程内 omp-natives 桥接，用于 Apple silicon 上的 macOS 27+。可用性在运行时发现；不内置任何模型。

### 认证与用量 \{#auth--usage-77}

- 此路由未声明交互式登录。

### 目录模型处理 \{#catalog-model-handling-75}

- **提供方条目（`apple`）**：`packages/catalog/src/compat/rules/providers/apple.kdl` 声明默认模型为 `on-device`。模型管理允许未经认证的访问。

## Charm Hyper（`charm-hyper`） \{#charm-hyper-charm-hyper}

### 特殊处理 \{#special-casings-79}

- 使用 `openai-completions`；经过端点规范化的发现使用基础 URL 范围的缓存，并映射宣告的推理档位。

### 认证与用量 \{#auth--usage-78}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/charm-hyper.kdl` 中声明。环境变量键：`CHARM_HYPER_API_KEY`、`HYPER_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-76}

- **提供方条目（`charm-hyper`）**：`packages/catalog/src/compat/rules/providers/charm-hyper.kdl` 声明默认模型为 `glm-5.3`。环境变量键：`CHARM_HYPER_API_KEY`、`HYPER_API_KEY`。模型管理允许未经认证的访问。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `charmHyperModelManagerOptions`。

## ClinePass（`cline-pass`） \{#clinepass-cline-pass}

### 特殊处理 \{#special-casings-80}

- 使用 `openai-completions`；其专用目录获取逻辑将实时条目与内置参考映射。网关报告的费用通过 `openai-shared.ts` 中的 `applyProviderReportedCost` 成为权威来源。

### 认证与用量 \{#auth--usage-79}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/cline-pass.kdl` 中声明。环境变量键：`CLINE_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-77}

- **提供方条目（`cline-pass`）**：`packages/catalog/src/compat/rules/providers/cline-pass.kdl` 声明默认模型为 `kimi-k3`。环境变量键：`CLINE_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `clinePassModelManagerOptions`。

## Command Code（`commandcode`） \{#command-code-commandcode}

### 特殊处理 \{#special-casings-81}

- 其公共 `/v1/models` 发现从 OpenAI 兼容条目开始，并逐模型解析 API 路由；手工编写的回退种子使用 `typesafe`。缓存身份包含凭据和端点。

### 认证与用量 \{#auth--usage-80}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/commandcode.kdl` 中声明。环境变量键：`COMMAND_CODE_API_KEY`、`COMMANDCODE_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-78}

- **提供方条目（`commandcode`）**：`packages/catalog/src/compat/rules/providers/commandcode.kdl` 声明默认模型为 `claude-sonnet-5`。环境变量键：`COMMAND_CODE_API_KEY`、`COMMANDCODE_API_KEY`。模型管理允许未经认证的访问。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`typesafe/jev`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `commandCodeModelManagerOptions`。

## CoralBricks（`coralbricks`） \{#coralbricks-coralbricks}

### 特殊处理 \{#special-casings-82}

- 聊天发现使用 `openai-completions` 以及 CoralBricks 自有的 `/v1/models` 条目字段（每百万 token 的 `pricing`、`context_length`、`supports_image_input`、`supports_tools`）。端点未公布输出上限，因此该上限仍遵循内置参考。
- 实时模态和价格具有权威性（`dynamicInputAuthoritative`、`dynamicCostAuthoritative`）：纯文本条目会去除内置图像支持，显式 `0` 价格会替换内置费率。价格字段缺失时保留内置费率。
- 实时 `supports_reasoning` 和 `reasoning.supported_efforts` 提供推理能力和强度阶梯，也适用于新模型 ID 和别名。在刷新和缓存重新加载时，显式不支持推理及空强度词表会覆盖陈旧的内置控制；旧版元数据缺失时保留已审查的回退值。
- `reasoning.mandatory` 控制思考能否关闭。`reasoning.disable: {"reasoning_effort":"none"}` 将关闭映射为 `none`；强制思考模型会将显式关闭请求限制到支持的最低强度。具名的 `default_effort` 值在受支持时设置模型默认值。`none` 是服务器的默认关闭值，而非强度档位：未请求的强度会省略，但 OMP 已有的会话/用户思考选择仍然适用。Coral 模型不公开思考 token 预算。

### 认证与用量 \{#auth--usage-81}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/coralbricks.kdl` 中声明。环境变量键：先 `CORAL_API_KEY`，再 `CORALBRICKS_API_KEY`。验证使用 `models-endpoint`，Coral 的 `/v1/models` 受密钥保护，因此探测会拒绝错误密钥且不产生费用。
- 每个模型的缓存输入读取均免费（`cache-read 0`）；缓存写入通过 `prompt_tokens_details.cache_write_tokens` 按每个模型的缓存写入费率计费，共享的 OpenAI-completions 用量解析器已经读取此字段。

### 目录模型处理 \{#catalog-model-handling-79}

- **提供方条目（`coralbricks`）**：`packages/catalog/src/compat/rules/providers/coralbricks.kdl` 声明默认模型为 `glm-5.3-fast`。环境变量键：先 `CORAL_API_KEY`，再 `CORALBRICKS_API_KEY`。
- **发现结果替换**：成功的权威发现会替换内置提供方条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`glm-5.3-fast`、`deepseek-v4.1-flash-fast`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。GLM 5.3 Flash 于 2026-10-07 退役。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `coralbricksModelManagerOptions`。

## DeepInfra（`deepinfra`） \{#deepinfra-deepinfra}

### 特殊处理 \{#special-casings-83}

- 聊天发现使用 `openai-completions` 和专用的 DeepInfra 元数据映射。提供方还手工编写了 `openai-images` 种子，因此并非每个目录条目都是聊天模型。

### 认证与用量 \{#auth--usage-82}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/deepinfra.kdl` 中声明。环境变量键：`DEEPINFRA_API_KEY`。验证使用 `chat-completions`，模型为 `deepseek-ai/DeepSeek-V4-Flash-0731`。

### 目录模型处理 \{#catalog-model-handling-80}

- **提供方条目（`deepinfra`）**：`packages/catalog/src/compat/rules/providers/deepinfra.kdl` 声明默认模型为 `deepseek-ai/DeepSeek-V4-Flash-0731`。环境变量键：`DEEPINFRA_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`black-forest-labs/FLUX-2-pro`、`hexgrad/Kokoro-82M`、`Qwen/Qwen3-TTS`、`sesame/csm-1b`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `deepinfraModelManagerOptions`。

## Helmcode（`helmcode`） \{#helmcode-helmcode}

### 特殊处理 \{#special-casings-84}

- 在 `https://api.helmcode.com/v1` 使用 `openai-completions`；带凭据的发现会过滤被排除的 ID，并关联 HelmCode 或上游厂商参考元数据。

### 认证与用量 \{#auth--usage-83}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/helmcode.kdl` 中声明。环境变量键：`HELMCODE_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-81}

- **提供方条目（`helmcode`）**：`packages/catalog/src/compat/rules/providers/helmcode.kdl` 声明默认模型为 `deepseek-v4-flash`。环境变量键：`HELMCODE_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`deepseek-v4-flash`、`qwen3.6`、`gemma4`、`glm5.3`；打包策略为 `fallback`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `helmcodeModelManagerOptions`。

## 本地模型（`local`） \{#local-models-local}

### 特殊处理 \{#special-casings-85}

- 使用 `local-inference`。`localModelManagerOptions` 提供手工编写的本地模型种子及本地缓存命名空间，而不是远程 API 发现。

### 认证与用量 \{#auth--usage-84}

- 此路由未声明交互式登录。

### 目录模型处理 \{#catalog-model-handling-82}

- **提供方条目（`local`）**：`packages/catalog/src/compat/rules/providers/local.kdl` 声明默认模型为 `lfm2.5-230m`。模型管理允许未经认证的访问。
- **手工编写的种子条目**：`phonon-31m`、`fluid-speech-pro`、`parakeet-tdt-0.6b-v2`、`nemotron-streaming-en-0.6b`、`whisper-base`、`whisper-small`、`whisper-large-v3-turbo`、`lfm2.5-230m`、`lfm2.5-350m`、`falcon-h1-90m`、`qwen3-1.7b`、`llama3.2:3b`、`gemma-3-1b`、`qwen2.5-1.5b`、`lfm2-1.2b`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/special.ts` 中的 `localModelManagerOptions`。

## Muse Code（订阅）（`muse-code`） \{#muse-code-subscription-muse-code}

### 特殊处理 \{#special-casings-86}

- 在 Meta Model API 上使用 `openai-responses`，带有 `x-api-version: 1.0.0`。带凭据的权威发现会关联手工编写的 Muse 谱系参考，并按凭据/端点对缓存分区。

### 认证与用量 \{#auth--usage-85}

- 登录类型 `device-code` 在 `packages/catalog/src/compat/rules/auth/muse-code.kdl` 中声明。

### 目录模型处理 \{#catalog-model-handling-83}

- **提供方条目（`muse-code`）**：`packages/catalog/src/compat/rules/providers/muse-code.kdl` 声明默认模型为 `muse-spark-1.3`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`muse-spark-1.1`、`muse-spark-1.2`、`muse-spark-1.2-contributor`、`muse-spark-1.3`、`muse-spark-1.3-contributor`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `museCodeModelManagerOptions`。

## Scaleway（`scaleway`） \{#scaleway-scaleway}

### 特殊处理 \{#special-casings-87}
- 聊天发现于 `https://api.scaleway.ai/v1` 使用 `openai-completions`（fr-par 无服务器 Generative APIs）。`/v1/models` 返回没有能力元数据的裸 ID，因此文档中的目录是 `packages/catalog/src/compat/rules/providers/scaleway.kdl` 中手工编写的种子（`bundle="always" precedence="seed"`）：它是每次重新生成时的内置内容，也是实时条目合并名称、模态、价格和限制时所用的参考。发现具有权威性（`dynamic-models-authoritative`），因此成功获取会裁剪已退役条目（2026-11-16 之后，`glm-5.2` 路由到 `glm-5.3`），而 `skip-cross-provider-reference-fills` 会将其他主机上的同 ID 条目（zai 以 1M/131k 提供 `glm-5.3`）排除在内置内容之外。
- 名册混排非聊天 SKU（转录 `whisper-`、嵌入 `qwen3-embedding-`/`bge-`、OCR `lightonocr-`）；`runtime/behavior.kdl` 中的排除前缀使它们不会进入聊天模型列表。`gpt-oss-120b` 也被排除：Scaleway 的 Chat Completions 路由不支持它的工具调用（Scaleway 建议为它使用 Responses API）。
- 推理轨迹通过消息的 `reasoning` 字段流式返回；共享 OpenAI-completions 传输已经解析这两种形式。已验证的传输特性：Scaleway 上强度为 `low` 的 `glm-5.3` 确实不输出推理轨迹，这是服务行为，而不是解析缺口。
- 即使请求模式的枚举已经陈旧，传输中 `reasoning_effort` 仍接受 `max` 和 `xhigh`；`none` 完全禁用推理（`reasoning_tokens: 0`）。
- 价格是按 2026-10-21 欧洲央行参考汇率（1 EUR = 1.1234 USD）转换的欧元/百万 token 标价；Scaleway 未公布的缓存费率呈现为 `0`。上下文和输出上限将文档中的“k”按 1,000 token 读取，确保不高估无服务器上限（`glm-5.3`：256,000 / 16,000）。

### 认证与用量 \{#auth--usage-86}
- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/scaleway.kdl` 中声明。环境变量键：先 `SCW_SECRET_KEY`，再旧版 `SCW_API_KEY`。验证使用 `models-endpoint`：`/v1/models` 在没有 Bearer 密钥时返回 401，对被拒绝的密钥返回 403（2026-10-21 已验证），因此探测会拒绝错误密钥且不产生费用。

### 目录模型处理 \{#catalog-model-handling-84}
- **提供方条目（`scaleway`）**：`packages/catalog/src/compat/rules/providers/scaleway.kdl` 声明默认模型为 `glm-5.3`。环境变量键：先 `SCW_SECRET_KEY`，再 `SCW_API_KEY`。
- **思考控制**：每个推理模型卡片都将 `none` 记为关闭值，因此关闭思考会发送 `reasoning_effort: "none"`；省略该字段会回退到服务器默认值（`medium`）并保持推理开启。GLM 5.3/5.2 与 `classes/glm.kdl` 中的谱系 glob 规则（不能禁用思考）不同：精确 ID 的 `priority=20` 残留规则优先于它，因此 Scaleway 卡片保留其 `none` 档位。Qwen 3.8 保留原生 `xhigh` 档位；Mistral Medium 3.5 文档列出的强度限 `high`（其服务器默认值 `medium` 不是有效档位，因此 omp 默认固定为 `high`）。阶梯属于级联规则，而非种子思考配置，因此没有内置参考的裸发现条目仍会获得这些阶梯。
- **模态**：图像输入遵循 Scaleway 的模型表：DeepSeek V4.1 Flash、Qwen 3.8/3.6/3.5、Gemma 4、Mistral Medium 3.5 和 Mistral Small 3.2 接受图像；GLM、DeepSeek V4 Flash 0731、Qwen3 235B Instruct 和 Llama 3.3 为纯文本。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `scalewayModelManagerOptions`。

## SingularityAPI（`singularityapi-dev`） \{#singularityapi-singularityapi-dev}

### 特殊处理 \{#special-casings-88}

- 使用共享 SingularityAPI 管理器，带有面向 `.dev` 部署的元数据映射。

### 认证与用量 \{#auth--usage-87}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/singularityapi-dev.kdl` 中声明。环境变量键：`SINGULARITYAPI_DEV_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-85}

- **提供方条目（`singularityapi-dev`）**：`packages/catalog/src/compat/rules/providers/singularityapi-dev.kdl` 声明默认模型为 `deepseek-v4-flash`。环境变量键：`SINGULARITYAPI_DEV_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `singularityApiDevModelManagerOptions`。

## SingularityAPI 预留通道（`singularityapi-tech`） \{#singularityapi-reserved-lanes-singularityapi-tech}

### 特殊处理 \{#special-casings-89}

- 为预留槽位的 `.tech` DeepSeek 通道使用共享 SingularityAPI 管理器。其稀疏的 `{id}` 发现条目依赖已审查的 KDL 策略来确定传输形式、限制和强度阶梯。

### 认证与用量 \{#auth--usage-88}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/singularityapi-tech.kdl` 中声明。环境变量键：`SINGULARITYAPI_TECH_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-86}

- **提供方条目（`singularityapi-tech`）**：`packages/catalog/src/compat/rules/providers/singularityapi-tech.kdl` 声明默认模型为 `deepseek-ai/DeepSeek-V4.1-Flash`。环境变量键：`SINGULARITYAPI_TECH_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `singularityApiTechModelManagerOptions`。

## TypeSafe（`typesafe`） \{#typesafe-typesafe}

### 特殊处理 \{#special-casings-90}

- 使用 `typesafe`。`typesafeModelManagerOptions` 保留离线种子，遵循 `TYPESAFE_BASE_URL`，并在提供密钥时启用权威的账户可见模型发现。

### 认证与用量 \{#auth--usage-89}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/typesafe.kdl` 中声明。环境变量键：`TYPESAFE_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-87}

- **提供方条目（`typesafe`）**：`packages/catalog/src/compat/rules/providers/typesafe.kdl` 声明默认模型为 `jev-1.14.0`。环境变量键：`TYPESAFE_API_KEY`。
- **手工编写的种子条目**：`jev-1.14.0`、`jev-latest`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。实时发现列出的都是别名，因此其省略的种子 ID 会与发现条目一同保留。
- 运行时管理器：`packages/catalog/src/provider-models/special.ts` 中的 `typesafeModelManagerOptions`。

## Cloudflare Workers AI（`cloudflare-workers-ai`） \{#cloudflare-workers-ai-cloudflare-workers-ai}

### 特殊处理 \{#special-casings-91}

- 使用 `workers-ai-systemone`：Cloudflare 的 Clef 决策模型在 `POST https://api.cloudflare.com/client/v4/accounts/<account>/ai/run/@cf/cloudflare/<model>` 接收 System One 请求体。每次请求的 `<account>` 从存储凭据的账户 ID 解析，否则使用 `CLOUDFLARE_ACCOUNT_ID`。`judgment-questions-max` 将每个请求限制为最多 64 个问题（`providers/judgment-questions.kdl`）。

### 认证与用量 \{#auth--usage-90}

- 登录类型 `custom`（`hook="cloudflare-workers-ai"`）在 `packages/catalog/src/compat/rules/auth/cloudflare-workers-ai.kdl` 中声明，在 `packages/ai/src/registry/oauth/cloudflare-workers-ai.ts` 中实现；它通过 `serializeCloudflareCredential`（`packages/catalog/src/wire/cloudflare.ts`）存储 API 令牌和账户 ID。环境变量键：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_AUTH_TOKEN`。

### 目录模型处理 \{#catalog-model-handling-88}

- **提供方条目（`cloudflare-workers-ai`）**：`packages/catalog/src/compat/rules/providers/cloudflare-workers-ai.kdl` 声明默认模型为 `@cf/cloudflare/clef`。环境变量键：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_AUTH_TOKEN`。
- **手工编写的种子条目**：`@cf/cloudflare/clef`、`@cf/cloudflare/clef-flash`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/special.ts` 中的 `cloudflareWorkersAiModelManagerOptions`。

## 网页搜索引擎（`web`） \{#web-search-engines-web}

### 特殊处理 \{#special-casings-92}

- 使用 `web-search`。`webModelManagerOptions` 在专用缓存命名空间中提供手工编写的网页搜索模型，而不是聊天补全发现。

### 认证与用量 \{#auth--usage-91}

- 此路由未声明交互式登录。

### 目录模型处理 \{#catalog-model-handling-89}

- **提供方条目（`web`）**：`packages/catalog/src/compat/rules/providers/web.kdl` 声明默认模型为 `public`。模型管理允许未经认证的访问。
- **手工编写的种子条目**：`hosted`、`parallel`、`perplexity`、`zai`、`exa`、`tinyfish`、`jina`、`kagi`、`tavily`、`firecrawl`、`brave`、`kimi`、`synthetic`、`ollama`、`searxng`、`startpage`、`duckduckgo`、`ecosia`、`google`、`mojeek`、`public`、`hackernews`；打包策略为 `always`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/special.ts` 中的 `webModelManagerOptions`。

## Yolo-Auto（`yolo-auto`） \{#yolo-auto-yolo-auto}

### 特殊处理 \{#special-casings-93}

- 使用 `openai-completions`；动态发现期间，精选种子元数据优先于较旧的内置参考元数据。

### 认证与用量 \{#auth--usage-92}

- 登录类型 `api-key` 在 `packages/catalog/src/compat/rules/auth/yolo-auto.kdl` 中声明。环境变量键：`YOLO_AUTO_API_KEY`。验证使用 `models-endpoint`。

### 目录模型处理 \{#catalog-model-handling-90}

- **提供方条目（`yolo-auto`）**：`packages/catalog/src/compat/rules/providers/yolo-auto.kdl` 声明默认模型为 `qwen3.8-flash`。环境变量键：`YOLO_AUTO_API_KEY`。
- **发现结果替换**：成功的权威发现会替换提供方的回退条目，而不是保留已退役的种子模型。
- **手工编写的种子条目**：`deepseek-flash-v4`、`qwen3.8-flash`、`yolo`；打包策略为 `fallback`。限制、能力和价格与这些条目一同手工编写。
- 运行时管理器：`packages/catalog/src/provider-models/openai-compat.ts` 中的 `yoloAutoModelManagerOptions`。
