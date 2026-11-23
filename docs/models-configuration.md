# 模型配置 \{#models-configuration}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Models Configuration](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/models-configuration.md)。[上游 MIT 许可证](./license.md)。

<!-- 上游文件由 TypeScript 源码生成。不要手动编辑上游文件；请运行 npm run generate:references。 -->

本参考列出了 `models.json` 的字段。示例见[配置兼容端点](./models.md#configure-a-compatible-endpoint)，文件位置见[配置](./configuration.md#agent-directory)。

在 `models.json` 中添加 `"$schema": "https://pi.dev/schemas/models.schema.json"`，即可在编辑器中使用校验和自动补全。

## 模型提供方 \{#providers}

`providers` 下的每个键都是模型提供方 ID。使用内置模型提供方的 ID 会修改该提供方的配置。使用其他 ID 会添加模型提供方，需要设置 `baseUrl`，并在模型提供方级或模型级设置 `api`。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | string |  | 显示名称。 |
| `baseUrl` | string |  | API 的基础 URL，也适用于该模型提供方的内置模型。 |
| `apiKey` | string |  | 密钥字面值、以 `"$NAME"` 插入环境变量，或使用 `"!command"` 的输出。 |
| `api` | string |  | 该模型提供方的模型使用的 API，例如 `"openai-completions"`、`"openai-responses"`、`"anthropic-messages"` 或 `"google-generative-ai"`。 |
| `oauth` | `"radius"` |  | OAuth 登录流程。需要设置 `baseUrl`。 |
| `headers` | object |  | 请求头。值的解析方式与 `apiKey` 相同。 |
| `compat` | [object](#compatibility) |  | 模型提供方和模型的兼容性覆盖配置。 |
| `authHeader` | boolean | `false` | 是否以 `Authorization: Bearer` 请求头发送解析得到的 API 密钥。 |
| `models` | [`object[]`](#models) |  |  |
| `modelOverrides` | [object](#model-overrides) |  |  |

## 模型 \{#models}

`models` 中的每个条目都会为该模型提供方添加一个模型。如果条目的 `id` 与现有模型匹配，则替换该模型。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `id` | string |  | 必填。发送给 API 的模型 ID。 |
| `name` | string |  | 显示名称，也参与 `--model` 的模式匹配。 |
| `api` | string |  | 覆盖模型提供方的 `api`。 |
| `baseUrl` | string |  | 覆盖模型提供方的 `baseUrl`。 |
| `reasoning` | boolean | `false` | 模型是否支持思考。 |
| `thinkingLevelMap` | object |  | 为各思考级别指定发送给模型提供方的值。`null` 表示不支持该级别。对模型未映射的级别，`high` 及以下使用模型提供方的默认值，`xhigh` 和 `max` 不受支持。 |
| `input` | `("text" \| "image")[]` | `["text"]` |  |
| `inputLimits` | [object](#input-limits) |  |  |
| `cost` | object |  |  |
| `cost.input` | number |  | 必填。每百万 token 的输入费用，单位为美元。 |
| `cost.output` | number |  | 必填。每百万 token 的输出费用，单位为美元。 |
| `cost.cacheRead` | number |  | 必填。每百万 token 的缓存读取费用，单位为美元。 |
| `cost.cacheWrite` | number |  | 必填。每百万 token 的缓存写入费用，单位为美元。 |
| `cost.tiers` | `object[]` |  | 按整个请求计价的阶梯。满足条件的最高输入阈值适用于整个请求。 |
| `cost.tiers[].inputTokensAbove` | number |  | 必填。整个请求的输入超过此 token 数量时，使用此计价阶梯。 |
| `cost.tiers[].input` | number |  | 必填。每百万 token 的输入费用，单位为美元。 |
| `cost.tiers[].output` | number |  | 必填。每百万 token 的输出费用，单位为美元。 |
| `cost.tiers[].cacheRead` | number |  | 必填。每百万 token 的缓存读取费用，单位为美元。 |
| `cost.tiers[].cacheWrite` | number |  | 必填。每百万 token 的缓存写入费用，单位为美元。 |
| `promptCache` | object |  | 对于 `short` 和 `long` 两种保留级别，模型提供方尽力维持提示词缓存的时长，单位为秒。Pi 只为时长已知的级别预热缓存。 |
| `contextWindow` | number | `128000` | 上下文窗口大小，单位为 token。 |
| `maxTokens` | number | `16384` | 最大输出 token 数。 |
| `samplingParams` | object |  | 合并到每个请求体中的字段。仅适用于兼容 OpenAI 的 API。 |
| `samplingParamsByThinkingLevel` | object |  | 各思考级别专用的 `samplingParams`，在默认 `samplingParams` 的基础上合并，优先级更高。 |
| `headers` | object |  | 请求头。值的解析方式与 `apiKey` 相同。 |
| `compat` | [object](#compatibility) |  | 模型提供方和模型的兼容性覆盖配置。 |

## 模型覆盖配置 \{#model-overrides}

`modelOverrides` 的每个键都是内置模型或扩展提供的模型的 ID。Pi 会忽略未知的 ID。`cost` 等对象字段与模型原有的值逐字段合并，其他字段直接替换原有值。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `name` | string |  | 显示名称，也参与 `--model` 的模式匹配。 |
| `reasoning` | boolean |  | 模型是否支持思考。 |
| `thinkingLevelMap` | object |  | 为各思考级别指定发送给模型提供方的值。`null` 表示不支持该级别。对模型未映射的级别，`high` 及以下使用模型提供方的默认值，`xhigh` 和 `max` 不受支持。 |
| `input` | `("text" \| "image")[]` |  |  |
| `inputLimits` | [object](#input-limits) |  |  |
| `cost` | object |  |  |
| `cost.input` | number |  | 每百万 token 的输入费用，单位为美元。 |
| `cost.output` | number |  | 每百万 token 的输出费用，单位为美元。 |
| `cost.cacheRead` | number |  | 每百万 token 的缓存读取费用，单位为美元。 |
| `cost.cacheWrite` | number |  | 每百万 token 的缓存写入费用，单位为美元。 |
| `cost.tiers` | `object[]` |  | 按整个请求计价的阶梯。满足条件的最高输入阈值适用于整个请求。 |
| `cost.tiers[].inputTokensAbove` | number |  | 必填。整个请求的输入超过此 token 数量时，使用此计价阶梯。 |
| `cost.tiers[].input` | number |  | 必填。每百万 token 的输入费用，单位为美元。 |
| `cost.tiers[].output` | number |  | 必填。每百万 token 的输出费用，单位为美元。 |
| `cost.tiers[].cacheRead` | number |  | 必填。每百万 token 的缓存读取费用，单位为美元。 |
| `cost.tiers[].cacheWrite` | number |  | 必填。每百万 token 的缓存写入费用，单位为美元。 |
| `promptCache` | object |  | 对于 `short` 和 `long` 两种保留级别，模型提供方尽力维持提示词缓存的时长，单位为秒。Pi 只为时长已知的级别预热缓存。 |
| `contextWindow` | number |  | 上下文窗口大小，单位为 token。 |
| `maxTokens` | number |  | 最大输出 token 数。 |
| `samplingParams` | object |  | 合并到每个请求体中的字段。仅适用于兼容 OpenAI 的 API。 |
| `samplingParamsByThinkingLevel` | object |  | 各思考级别专用的 `samplingParams`，在默认 `samplingParams` 的基础上合并，优先级更高。 |
| `headers` | object |  | 请求头。值的解析方式与 `apiKey` 相同。 |
| `compat` | [object](#compatibility) |  | 模型提供方和模型的兼容性覆盖配置。 |

## 输入限制 \{#input-limits}

参阅[声明模型输入限制和缓存时长](./models.md#describe-model-input-and-caching)。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `maxRequestBytes` | integer |  | 发给模型提供方的请求在序列化后的最大大小，单位为字节。 |
| `images` | object |  |  |
| `images.resize` | object |  | 在新图片进入对话历史前应用的缩放配置，不影响缓存复用。 |
| `images.resize.maxWidth` | integer |  |  |
| `images.resize.maxHeight` | integer |  |  |
| `images.resize.maxBytes` | integer |  | 经 base64 编码后数据的最大大小，单位为字节。 |
| `images.resize.jpegQuality` | integer |  |  |
| `images.maxPerMessage` | integer |  | 发给模型提供方的单条消息可包含的最大图片数。 |
| `images.maxPerRequest` | integer |  | 发给模型提供方的整个请求可包含的最大图片数。 |

## 兼容性 \{#compatibility}

`compat` 描述已经验证的、与 API 标准请求和响应行为不同之处。模型级的值按字段覆盖模型提供方级的值。适用的字段取决于模型的 `api`。

### `openai-completions` \{#openai-completions}

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `supportsStore` | boolean |  | 模型提供方是否支持 `store` 字段。默认根据 URL 自动检测。 |
| `supportsDeveloperRole` | boolean |  | 是否为推理模型发送 `developer` 角色的系统消息（系统提示词和对话中的系统消息），以代替 `system` 角色。默认仅对 `api.openai.com` 为 `true`。 |
| `supportsReasoningEffort` | boolean |  | 模型提供方是否支持 `reasoning_effort`。默认根据 URL 自动检测。 |
| `supportsUsageInStreaming` | boolean | `true` | 模型提供方是否支持通过 `stream_options.include_usage` 在流式响应中报告 token 用量。 |
| `supportsFinishReason` | boolean | `true` | 流式响应是否包含 `finish_reason`。设为 `false` 时，Pi 在流结束时推断是 `stop` 还是 `toolUse`。 |
| `maxTokensField` | `"max_completion_tokens" \| "max_tokens"` |  | 用于设置最大 token 数的字段。默认根据 URL 自动检测。 |
| `requiresToolResultName` | boolean |  | 工具结果是否必须包含 `name` 字段。默认根据 URL 自动检测。 |
| `requiresAssistantAfterToolResult` | boolean |  | 工具结果之后如果是用户消息，中间是否必须插入一条助手消息。默认根据 URL 自动检测。 |
| `requiresNonNullAssistantContent` | boolean |  | 重放无文本的助手消息（例如只有工具调用的消息）时，是否必须发送 `""` 而不是 `null` 内容。默认为 `false`。 |
| `requiresToolsWithToolHistory` | boolean |  | 当对话中包含工具调用或工具结果时，不提供工具的请求是否必须发送 `"tools": []`。一些部署在 Anthropic 前端的代理需要此字段，例如旧版 LiteLLM。默认为 `false`，此时省略该字段。 |
| `requiresThinkingAsText` | boolean |  | 是否必须将思考块转换为使用 `<thinking>` 分隔符的文本块。默认根据 URL 自动检测。 |
| `requiresReasoningContentOnAssistantMessages` | boolean |  | 启用推理时，重放的所有助手消息是否必须包含空的 `reasoning_content` 字段。默认根据 URL 自动检测。 |
| `thinkingFormat` | `"openai" \| "openrouter" \| "deepseek" \| "together" \| "baseten" \| "zai" \| "qwen" \| "chat-template" \| "qwen-chat-template" \| "string-thinking" \| "ant-ling"` |  | 推理或思考参数的格式。省略时，Pi 根据模型提供方的 URL 自动检测。`"openai"` 使用 `reasoning_effort`；`"openrouter"` 使用 `reasoning.effort`；`"deepseek"` 使用 `thinking.type`，支持时还使用 `reasoning_effort`；`"together"` 使用 `reasoning.enabled`，支持时还使用 `reasoning_effort`；`"baseten"` 使用可配置的 `chat_template_args`，支持时还使用 `reasoning_effort`；`"zai"` 使用 `thinking.type`；`"qwen"` 使用顶层字段 `enable_thinking`；`"qwen-chat-template"` 使用 `chat_template_kwargs.enable_thinking` 和 `preserve_thinking`；`"chat-template"` 使用可配置的 `chat_template_kwargs`；`"string-thinking"` 使用顶层字段 `thinking`；`"ant-ling"` 仅在映射得到的思考强度不为 `null` 时使用 `reasoning.effort`。 |
| `chatTemplateKwargs` | object |  | 当 `thinkingFormat` 为 `"chat-template"` 时，作为 `chat_template_kwargs` 发送的关键字参数。对于由 Pi 控制的值，将 `$var` 与 `"thinking.enabled"`、`"thinking.effort"` 或 `"thinking.budget"` 一同使用。 |
| `chatTemplateArgs` | object |  | 当 `thinkingFormat` 为 `"baseten"` 时，作为 `chat_template_args` 发送的参数。对于由 Pi 控制的值，将 `$var` 与 `"thinking.enabled"`、`"thinking.effort"` 或 `"thinking.budget"` 一同使用。 |
| `openRouterRouting` | object |  | OpenRouter 的模型提供方路由偏好。控制 OpenRouter 将请求转发给哪些上游模型提供方，作为 OpenRouter API 请求体中的 `provider` 字段发送。参阅 <https://openrouter.ai/docs/guides/routing/provider-selection>。 |
| `vercelGatewayRouting` | object |  | Vercel AI Gateway 的模型提供方路由偏好。控制网关将请求转发给哪些上游模型提供方。参阅 <https://vercel.com/docs/ai-gateway/models-and-providers/provider-options>。 |
| `zaiToolStream` | boolean | `false` | z.ai 是否支持使用顶层 `tool_stream` 字段流式传输工具调用的增量数据。 |
| `thinkingTokenBudgetField` | `"thinking_token_budget" \| "thinking_budget" \| "thinking_budget_tokens"` |  | 用于按 `thinkingBudgets` 限制推理 token 数的顶层请求字段。在这些端点中，推理和答案共用 `max_tokens` 额度。`"thinking_token_budget"` 用于 vLLM，`"thinking_budget"` 用于 Qwen、DashScope 或 SGLang，`"thinking_budget_tokens"` 用于 llama.cpp。默认关闭，生成的目录也不设置此字段。 |
| `supportsThinkingTokenBudget` | boolean | `false` | `thinkingTokenBudgetField: "thinking_token_budget"`（vLLM）的别名。建议使用 `thinkingTokenBudgetField`。 |
| `supportsOpenAIGrammarTools` | boolean | `false` | 模型提供方是否支持使用 Lark 或正则表达式语法格式的 OpenAI 自定义工具。设为 `false` 时，带语法约束的工具会回退为普通函数工具。生成的目录会为支持此功能的模型启用该字段。 |
| `supportsMidConvoSystemMessages` | boolean | `false` | 该模型是否在对话开始后仍接受 `system` 或 `developer` 角色的消息。设为 `false` 时，后续系统消息会并入开头的系统消息。生成的目录会为已验证的模型启用该字段。 |
| `supportsMidConvoToolAdditions` | boolean | `false` | 系统消息是否可以在对话中添加工具。依赖 `supportsMidConvoSystemMessages`。生成的目录会为支持此功能的模型启用该字段。 |
| `supportsStrictMode` | boolean | `false` | 模型提供方是否支持在工具定义中使用 `strict` 字段。生成的目录会为支持此功能的模型显式启用该字段。 |
| `cacheControlFormat` | `"anthropic"` |  | 提示词缓存的控制格式。Anthropic 会将 `cache_control` 标记加到系统提示词、最后一个工具定义，以及最后一段用户、助手或工具结果的文本内容上。 |
| `sendSessionAffinityHeaders` | boolean |  | 是否发送源自 `options.sessionId` 的会话亲和性数据。对于 OpenRouter 端点默认为 `true`，其他端点为 `false`。 |
| `sessionAffinityFormat` | `"openai" \| "openai-nosession" \| "openrouter"` |  | 会话亲和性请求头的格式。`openai` 发送 `session_id`、`x-client-request-id` 和 `x-session-affinity`；`openai-nosession` 发送 `x-client-request-id` 和 `x-session-affinity`；`openrouter` 发送 `x-session-id`。不影响 `prompt_cache_key`。默认自动检测。 |
| `promptCacheKeyMode` | `"auto" \| "enabled" \| "disabled"` |  | 控制 `prompt_cache_key` 请求字段。`auto` 会向 `api.openai.com` 发送此字段，或在使用长期缓存且 `supportsLongCacheRetention` 为 `true` 时发送；`enabled` 在缓存生效时一律发送，适用于兼容的代理；`disabled` 从不发送。默认为 `auto`。 |
| `supportsLongCacheRetention` | boolean |  | 模型提供方是否支持长期保留提示词缓存（根据格式使用 `prompt_cache_retention: "24h"` 或 Anthropic 风格的 `cache_control.ttl: "1h"`）。默认根据模型提供方和 URL 自动检测。 |
| `vllmPriority` | number |  | vLLM 调度优先级，作为顶层请求字段 `priority` 发送。数值越小越先处理，服务器默认值为 `0`。仅在使用 `--scheduling-policy priority` 时有效。默认关闭，生成的目录也不设置此字段。 |

### `openai-responses` \{#openai-responses}

也适用于 `azure-openai-responses` 和 `openai-codex-responses`。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `supportsDeveloperRole` | boolean | `true` | 模型提供方是否支持用 `developer` 代替 `system` 角色。 |
| `supportsMidConvoSystemMessages` | boolean | `false` | 该模型是否在对话开始后仍接受 `developer` 或 `system` 角色的消息。设为 `false` 时，后续系统消息会并入开头的系统消息。生成的目录会为已验证的模型启用该字段。 |
| `sessionAffinityFormat` | `"openai" \| "openai-nosession" \| "openrouter"` |  | 会话亲和性请求头的格式。`openai` 发送 `session-id` 和 `x-client-request-id`；`openai-nosession` 发送 `x-client-request-id`；`openrouter` 发送 `x-session-id`。不影响 `prompt_cache_key`。默认自动检测。 |
| `promptCacheKeyMode` | `"auto" \| "enabled" \| "disabled"` |  | 控制 `prompt_cache_key` 请求字段。`auto` 和 `enabled` 在缓存生效时一律发送此字段；`disabled` 从不发送，适用于会拒绝该字段的兼容代理。默认为 `auto`。 |
| `supportsLongCacheRetention` | boolean | `true` | 模型提供方是否支持长期保留提示词缓存。GPT-5.6+ 使用 `prompt_cache_options.ttl: "30m"`，较早的模型使用 `prompt_cache_retention: "24h"`。 |
| `supportsStrictMode` | boolean |  | 模型提供方是否支持严格遵循 JSON Schema 的函数工具。默认值取决于 API；生成的目录为 OpenAI 模型显式启用该字段。 |
| `supportsOpenAIGrammarTools` | boolean | `false` | 是否发送使用 Lark 或正则表达式语法格式的 OpenAI 自定义工具。设为 `false` 时，带语法约束的工具会回退为普通函数工具。生成的目录会为支持此功能的模型启用该字段。 |
| `supportsAdditionalTools` | boolean | `false` | 模型是否支持与消息关联的 `additional_tools` 输入项。 |
| `supportsToolSearch` | boolean | `false` | 模型是否支持由客户端执行的工具搜索，并将新增的工具关联到会话记录。 |
| `supportsExplicitPromptCacheMode` | boolean | `false` | 模型是否接受 `prompt_cache_options`。较早的 OpenAI 模型会拒绝此参数。 |
| `supportsMidConvoEffort` | boolean | `false` | 更改思考级别时，是否发送 `configuration_update` 输入项以保留提示词缓存，而不改动 `reasoning.effort`。用于 `openai-responses` 和 `openai-codex-responses` API。通过 ChatGPT 登录 `openai` 模型提供方时会忽略此字段。 |
| `supportsMaxOutputTokens` | boolean | `true` | 模型提供方是否接受 `max_output_tokens`。部分使用 Codex 协议的网关会拒绝此字段。 |

### `anthropic-messages` \{#anthropic-messages}

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `supportsEagerToolInputStreaming` | boolean | `true` | 模型提供方是否接受按工具设置的 `eager_input_streaming`。设为 `false` 时，对于启用了工具的请求，Anthropic 模型提供方会省略 `tools[].eager_input_streaming`，并发送旧版 beta 请求头 `fine-grained-tool-streaming-2025-05-14`。 |
| `supportsLongCacheRetention` | boolean | `true` | 模型提供方是否支持通过 `cache_control.ttl` 启用 Anthropic 的长期缓存保留。 |
| `sendSessionAffinityHeaders` | boolean |  | 启用缓存时，是否根据 `options.sessionId` 发送 `x-session-affinity`。Fireworks 等使用会话亲和性为提示词缓存选择路由的模型提供方需要此字段；将请求发往同一副本可以尽量提高缓存命中率。对于 OpenRouter 端点默认为 `true`，其他端点为 `false`。 |
| `sessionAffinityFormat` | `"openrouter"` |  | 会话亲和性格式。`openrouter` 发送 `x-session-id`；未设置时发送 `x-session-affinity`。 |
| `supportsCacheControlOnTools` | boolean | `true` | 模型提供方是否支持在工具定义中使用 Anthropic 风格的 `cache_control` 标记。设为 `false` 时，工具参数中会省略 `cache_control`。部分兼容 Anthropic 的模型提供方（如 Fireworks）不支持在工具上使用此字段，可能会拒绝或忽略它。 |
| `supportsTemperature` | boolean | `true` | 模型是否接受 Anthropic 的 `temperature` 请求字段。Claude Opus 4.7+ 拒绝非默认值。 |
| `forceAdaptiveThinking` | boolean | `false` | 是否不区分模型 ID，强制使用自适应思考（`thinking.type: adaptive` 加 `output_config.effort`）。需要自适应思考的内置模型会在生成的元数据中启用此字段。兼容 Anthropic 的自定义模型提供方可以为任何上游要求自适应格式的模型将此字段设为 `true`。对内置模型应用覆盖配置时，可设为 `false` 以禁用。 |
| `allowEmptySignature` | boolean | `false` | 是否在重放时保留空的思考签名，而不把思考内容转成文本。 |
| `supportsStrictTools` | boolean | `false` | 模型提供方是否支持 Anthropic 的严格工具 schema。生成的目录为 Anthropic 模型显式启用该字段。 |
| `supportsMidConvoEffort` | boolean | `false` | 该模型的传输层是否支持仅调整思考强度的系统消息，以及思考绑定控制。 |
| `supportsMidConvoSystemMessages` | boolean | `false` | 该模型是否接受对话中的 `system` 角色消息。设为 `false` 时，后续系统消息会并入顶层系统提示词。 |
| `supportsMidConvoToolChanges` | boolean | `false` | 该模型是否接受对话中的 `tool_addition` 和 `tool_removal` 块。依赖 `supportsMidConvoSystemMessages`。 |
| `supportsMessageThreads` | boolean |  | 端点是否支持 Anthropic 消息线程。消息线程允许带有会话 ID 的请求只发送新消息，从上一条回复继续。如果 `baseUrl` 指向 `api.anthropic.com`，默认为 `true`，否则为 `false`。对于会转发线程请求字段的网关，将此字段设为 `true`。 |
| `allowedFallbackModels` | `object[]` |  | Anthropic 允许在服务器端拒绝请求时回退到的模型，附有用于计算回退响应费用的本地定价元数据。如果此列表缺失或为空，调用方必须省略 `fallbacks`。对于没有获准回退目标的模型，Anthropic 会拒绝该字段。 |

### `bedrock-converse-stream` \{#bedrock-converse-stream}

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `supportsStrictMode` | boolean | `false` | 模型是否支持 Bedrock 的严格工具 schema。 |

### `mistral-conversations` \{#mistral-conversations}

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `supportsMidConvoSystemMessages` | boolean | `false` | 该模型是否在对话开始后仍接受系统消息。设为 `false` 时，后续系统消息会并入开头的系统消息。 |
| `supportsStrictMode` | boolean | `false` | 模型是否支持严格遵循 schema 约束的函数工具。 |

### `typesafe-system-one` \{#typesafe-system-one}

也适用于 `cloudflare-workers-ai-system-one`。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `imageInput` | `"assets" \| "images" \| "state-image-urls"` |  | 服务接收分类用图片的方式。`"assets"` 发送 TypeSafe 的 `assets` 映射（PNG 和 JPEG），并在状态中引用图片，符合 TypeSafe 和 Workers AI 上 Jev 的要求。`"images"` 发送 Clef 的 `images` 数据 URL 列表（PNG、JPEG 和 WebP，最多四张），符合 Workers AI 上 Clef 的要求。`"state-image-urls"` 将 `image_url` 部分放在状态之前，符合 OpenRouter 的要求；OpenRouter 会丢弃 `assets` 而不报错。根据模型提供方、`baseUrl` 和模型 ID 自动检测。分类模型从模型提供方级的 `compat` 读取此字段；`models` 和 `modelOverrides` 条目只适用于对话模型。 |
| `sendImageOptInHeader` | boolean |  | 含图片的请求是否发送 `TypeSafe-Danger-Zone-Images: true` 请求头。TypeSafe 自有 API 的实验性图片输入需要此请求头。对于 `typesafe-system-one` API，默认为 `true`，除非检测到模型来自 OpenRouter。 |
