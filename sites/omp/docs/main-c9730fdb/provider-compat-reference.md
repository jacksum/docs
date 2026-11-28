---
title: "提供方兼容性参考：OpenAI 兼容性标志、推理级别和工具处理"
description: "Oh My Pi 官方仓库文档：提供方兼容性参考：OpenAI 兼容性标志、推理级别和工具处理。"
---

# 提供方兼容性参考：OpenAI 兼容性标志、推理级别和工具处理 \{#provider-compat-reference-openai-compat-flags-reasoning-levels-and-tool-handling}

`packages/ai` 四个子系统的参考（类型定义位于 `packages/catalog`）：

1. [OpenAI 兼容性标志](#1-openai-compat-flags)：解析后的策略和传输效果
2. [推理级别](#2-reasoning-levels)：推理强度/思考预算如何流向各提供方
3. [各提供方的工具处理](#3-tool-handling-per-provider)：模式转换、流式传输、结果编码
4. [强制工具选择](#4-forced-tool-choice)：`toolChoice` 语义、传输映射、模拟

相关参考：

- [提供方端点约束](./provider-endpoint-constraints.md)：新约束应放在哪里
- [提供方流式传输内部机制](./provider-streaming-internals.md)：流事件规范化
- [提供方特殊行为](./provider-quirks.md)：各提供方的特殊处理、流行为、认证/用量、目录处理
- [模型和提供方配置](./models.md)：`models.yml` 和面向用户的 `compat` 覆盖

## 1. OpenAI 兼容性标志 \{#1-openai-compat-flags}

### 架构 \{#architecture}

兼容性标志分两个阶段解析：

1. **目录构建时**：`buildModel`（`packages/catalog/src/build.ts`）调用 `resolveModelPolicy(spec)`（`packages/catalog/src/compat/resolve.ts`）。后续层覆盖先前层：逐 API 默认值 → 端点检测 → `packages/catalog/src/compat/rules/` 中的 KDL 级联 → 稀疏的 `spec.compat` 覆盖和最终修正。模型身份、兼容性、思考元数据和目录修正一并解析；`compat/openai.ts` 现在只包含第一方 xAI 推理强度重映射辅助函数。
   如果适用 `whenThinking` 策略（显式覆盖、直连 DeepSeek 推理或网关规则），就会预先构建一个**完整的替代已解析兼容性对象**，作为 `compat.whenThinking`。
   OpenRouter 是伪 API：解析器将完整的 chat-completions 视图与 Responses 专有字段合并为 `ResolvedOpenRouterCompat`。运行时分派默认使用 Responses；`PI_OPENROUTER_RESPONSES=0` 选择 Chat Completions。
2. **请求时**（`packages/ai/src/providers/openai-shared.ts`）：`resolveOpenAICompatPolicy(model, options)` 将已解析的兼容性与逐请求选项（`reasoning`、`disableReasoning`、`toolChoice` 等）组合为 `OpenAICompatPolicy`，其中包含 `reasoning`、`tools`、`messages` 和 `stream` 子策略。当思考处于活动状态且存在 `whenThinking` 时，策略会**切换指针**到预构建的变体，不会逐请求合并或分配替代兼容性对象：

   ```ts
   const compat = enabled && baseCompat.whenThinking ? baseCompat.whenThinking : baseCompat;
   ```

使用者包括 `applyChatCompletionsCompatPolicy`（`openai-shared.ts`）、`openai-completions.ts` / `openai-responses.ts` 中的请求构建器、`buildResponsesInput`（`openai-shared.ts`）、`transform-messages.ts`，以及提供方/共享流看门狗。

这些表格描述重要的默认值和效果，而非详尽的部署矩阵。KDL 提供方/类别/模型规则、发现元数据和显式覆盖都可能改变基线；以构建模型解析后的兼容性为准。

### 共享标志（chat-completions + responses） \{#shared-flags-chat-completions--responses}

类型：`packages/catalog/src/types.ts` 中的 `OpenAICompat` / `ResolvedOpenAISharedCompat`。

“共享”表示字段存在于两个已解析视图中，**不表示**两个 API 都使用每个字段或检测出相同的默认值。`resolveModelPolicy` 的 chat-completions 和 Responses 分支计算各自的基线；下表在存在差异时使用 _Chat:_ / _Responses:_ 标注。

#### 消息整形 \{#message-shaping}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsDeveloperRole` | Chat: OpenAI/Azure 主机。Responses: 另含 GitHub Copilot 主机；模型/提供方规则可以选择退出 | 在支持推理的模型上，系统提示使用角色 `developer` 而非 `system` 发送 |
| `requiresToolResultName` | Chat: Mistral 为 `true`。Responses: 始终为 `false` | 在 `role: "tool"` 消息中添加 `name: <toolName>` |
| `requiresAssistantAfterToolResult` | Chat: Mistral 为 `true`。Responses: 始终为 `false` | 在工具结果与随后用户消息之间插入合成助手消息（严格角色交替） |
| `requiresThinkingAsText` | Chat: Mistral 为 `true`。Responses: 始终为 `false` | 将助手思考作为 `<thinking>...</thinking>` 文本而非原生推理字段重放（`transform-messages.ts`） |
| `requiresMistralToolIds` | Chat: Mistral 为 `true`。Responses: 始终为 `false` | 工具调用 ID 规范化为恰好 9 个字母数字字符（`normalizeMistralToolId`） |
| `requiresAssistantContentForToolCalls` | Chat: Kimi、直连 DeepSeek 推理。Responses: 仅 Kimi | 工具调用轮次中的空助手内容变为 `"."`，以避免 HTTP 400 |
| `usesOpenAIToolCallIdLimit` | 官方 OpenAI 为 `true` | 工具调用 ID 截断为 40 个字符 |

#### 推理传输格式 \{#reasoning-wire-format}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsReasoningEffort` | Chat 基线：Grok、MiMo/Xiaomi 和 5.2 之前的 Z.AI/Zhipu GLM 为 `false`。Responses 基线：xAI 上为 `false`；规则为受支持的第一方 Grok SKU 启用 | 控制传输时是否生成推理强度（`reasoning_effort` / `reasoning.effort`） |
| `omitReasoningEffort` | `supportsReasoningEffort` 为 `false` 时为 `true` | 即使思考开启，也抑制 `reasoning_effort`（思考开关字段仍会发送） |
| `reasoningEffortMap` | 基线 `{}`；KDL 添加 Kimi K3、MiMo、GLM 和第一方 xAI 映射 | 在模型的 `thinking.effortMap` 之前重映射 `Effort` 值（例如 Grok `minimal` → `low`；支持 xhigh 的 SKU 保留 `xhigh`） |
| `thinkingFormat` | Chat 基线：`"zai"`（原生 Kimi K2.x/Z.AI/Zhipu/MiMo）、`"qwen"`（DashScope/Qwen）、`"qwen-chat-template"`（NVIDIA Qwen）、`"openrouter"` 或 `"openai"`；规则还会选择 `"kimi"` / `"chat-template"` | 编码为 `thinking: { type: "enabled" }`（zai）、`thinking: { type: "enabled", effort }`（kimi）、`enable_thinking: true`（qwen）、`chat_template_kwargs.enable_thinking: true`（qwen-chat-template）、`chat_template_kwargs: { thinking: true, reasoning_effort }`（chat-template）、`reasoning: { effort }`（openrouter）或 `reasoning_effort`（openai） |
| `reasoningDisableMode` | 从 `thinkingFormat` 派生，可由端点/规则覆盖 | 显式关闭编码：Venice `disable_thinking`、Z.AI/Kimi 的 disabled `thinking`、Qwen `enable_thinking: false`（顶层或模板 kwargs）、`chat-template-thinking-false` → `chat_template_kwargs.thinking: false`、OpenRouter/Cline `reasoning.enabled: false`、`none-effort`、`lowest-effort` 或 `omit`（`encodeChatCompletionsDisabledReasoning`） |
| `supportsReasoningParams` | Chat: GitHub Copilot 为 `false`。Responses: 始终为 `true` | 为 `false` 时抑制**所有**推理参数 |
| `reasoningContentField` | 默认 `"reasoning_content"`；其他选项为 `"reasoning"`、`"reasoning_text"` | 在历史消息中重放助手思考时使用的键 |
| `requiresReasoningContentForToolCalls` | Chat: Kimi（OpenCode 别名除外）、DeepSeek 推理、MiMo、OpenRouter 推理请求。Responses: Kimi/DeepSeek/OpenRouter，仅在支持推理时 | 历史中的助手工具调用轮次必须携带推理内容（真实或合成） |
| `requiresReasoningContentForAllAssistantTurns` | 直连 DeepSeek 推理、MiMo | 将上述要求扩展到每个助手轮次 |
| `allowsSyntheticReasoningContentForToolCalls` | Chat: DeepSeek 推理系列和 MiMo 为 `false`。Responses: DeepSeek 推理为 `false` | 为 `true` 时，`"."` 占位符可以替代已剥离的推理；为 `false` 时，仅重放真实内容 |
| `replayReasoningContent` | Chat: 本地后端（llama.cpp、LM Studio、vLLM、Ollama、回环/私有 baseUrl）为 `true`。Responses: 始终为 `false`（改为通过加密条目重放推理） | 在每个助手轮次上以 `reasoning_content` 重放保留的思考，使本地聊天模板可以重建 `<think>` 块并保持前缀 KV 缓存命中 |
| `qwenPreserveThinking` | Chat: 启用 `replayReasoningContent` 的本地后端上的 Qwen 思考格式。Responses: 始终为 `false`（模板开关仅用于 chat-completions） | 生成 `preserve_thinking: true`（在顶层和/或 `chat_template_kwargs` 中），使 Qwen 3.6+ 模板也为较早轮次渲染 `<think>`，这是历史控制项，而非逐轮次开关（`applyChatCompletionsCompatPolicy`） |
| `qwenTemplateReasoningEffort` | 经审查的本地后端上的 Qwen 3.8+；选定的 YOLO 条目 | 生成模板 `reasoning_effort` kwargs，对 `"qwen"` 方言还会生成顶层字段；支持选择推理强度，而不只是二元开关 |
| `kimiApiFormat` | 逐模型协议元数据 | Kimi Code 模型的 `"openai"` 与 `"anthropic"` 传输（`providers/kimi.ts`） |
| `includeEncryptedReasoning` | 基线为 `true`，包括第一方 xAI；规则会为选定部署禁用 | 通过 `include` 请求 Responses 加密推理条目 |
| `filterReasoningHistory` | OpenRouter Anthropic 和选定的 Muse 部署；第一方 xAI 保留历史 | 从重放的 Responses 历史中滤除原生推理条目 |

#### 工具选择 / 严格模式交互 \{#tool-choice--strict-interaction}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsToolChoice` | Chat: 直连 DeepSeek 推理为 `false`。Responses: 始终为 `true` | 为 `false` 时，完全省略 `tool_choice` |
| `supportsForcedToolChoice` | Chat: 选定的要求思考的模型、OpenCode DeepSeek 和 Cline Qwen 为 `false`。Responses: OpenCode Go/Zen 为 `false` | 为 `false` 时，`required`/具名选择降级为 `auto` |
| `supportsNamedToolChoice` | 只支持字符串的主机（llama.cpp、LM Studio）为 `false` | 为 `false` 时，具名选择变为：将 `tools` 过滤为该单个函数 + `tool_choice: "required"` |
| `disableReasoningOnForcedToolChoice` | Chat: Kimi（原生 K3 除外）或 Anthropic 模型 ID。Responses: 所有 Kimi | 工具选择被强制时移除推理字段 |
| `disableReasoningOnToolChoice` | DeepSeek 推理（通过 OpenRouter 的除外） | 存在**任何** `tool_choice` 时移除推理字段 |
| `disableReasoningWithTools` | 默认为 `false`；Azure GPT-6 Astra 规则选择启用 | 只要声明了函数工具，就抑制推理，即使没有 `tool_choice` |
| `rejectRootObjectUnion` | 第一方 xAI | 展平可表示的根对象联合，并隔离仍违反端点根联合约束的严格模式 |
| `retryWithoutStrictOnGrammarError` | OpenRouter Anthropic | 编译语法过大的错误发生时，允许以非严格模式重试 |
| `supportsStrictMode` | OpenAI、OpenRouter、Cerebras、Together、Copilot、Zenmux、Azure、DeepSeek 为 `true` | 为 `false` 时，从不在工具定义上设置 `strict: true` |
| `toolSchemaFlavor` | Kimi/Moonshot 为 `"moonshot-mfjs"`，本地后端为 `"grammar"`，GitHub Copilot Gemini（KDL）为 `"google"` | 额外的模式规范化：`normalizeSchemaForMoonshot`、`sanitizeSchemaForGrammar` 或 `normalizeSchemaForGoogle`（`utils/schema/normalize.ts`） |

#### 采样、token、缓存、路由 \{#sampling-tokens-caching-routing}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsSamplingParams` | o1/o3/gpt-5+ 类模型为 `false` | 为 `false` 时省略 `temperature`/`top_p`/惩罚参数（它们会导致 400） |
| `supportsPenaltyAndStopParams` | Chat: 推理型 Grok 为 `false`。Responses: xAI 主机上为 `false` | 分别控制存在/频率惩罚和 Chat Completions 停止序列 |
| `clampOutputToModelMax` | 本地后端和选定的提供方/模型规则 | 使用声明的模型输出上限，而不是保守的 64k OpenAI 兼容限幅 |
| `stripImageInput` | 多模态模型系列的选定纯文本部署 | 在传输编码之前分离出图像输入 |
| `alwaysSendMaxTokens` | Kimi 系列 | 始终发送最大输出 token 字段（默认为模型最大值），以保持 Kimi TPM 计量正确 |
| `openRouterRouting` | 未设置 | 在 OpenRouter 上添加 `provider: { only, order }` 请求体字段（`applyOpenAIGatewayRouting`） |
| `promptCacheSessionHeader` | 第一方 xAI API/OAuth 路由上为 `"x-grok-conv-id"` | 生成该 HTTP 标头，值为提示缓存会话键 |
| `sessionHeader` | `litellm` 提供方和 `discovery.type: "litellm"` 别名上为 `"x-litellm-session-id"` | 生成该 HTTP 标头，值为显式对话 `sessionId`，独立于提示缓存；已配置的标头优先 |
| `supportsPromptCacheBreakpoints` / `promptCacheBreakpointTtl` | 官方 OpenAI GPT-5.6+ | 控制显式提示缓存断点；请求不受支持的功能时抛出 `ConfigurationError`。TTL 默认为 `"30m"` |
| `isOpenRouterHost` | OpenRouter 端点检测 | 省略默认最大 token 上限（可选字段在 OpenRouter 上是路由提示）并附加路由 |
| `wireModelIdMode` | 基线为 `"raw"`；网关/发现规则选择 `"cline-pass"`、`"firepass"`、`"fireworks"` 或 `"openrouter"` | 为网关分派重写模型 ID |

#### 流解析 / 看门狗 \{#stream-parsing--watchdogs}

| 标志 | 默认检测 | 传输/流效果 |
| --- | --- | --- |
| `reasoningDeltasMayBeCumulative` | MiniMax 主机 | 流解析器将推理增量视为累积快照，而非增量 |
| `stripDeepseekSpecialTokens` | NVIDIA NIM 或直连 API 上的 DeepSeek | 从可见文本中剥离泄漏的聊天模板 token（`<｜User｜>` 等） |
| `neutralizeDeepseekSpecialTokens` | 任何 DeepSeek 类模型（chat-completions） | 在传出消息文本中引用的 `<｜…｜>` / `｜DSML｜` token 内插入零宽空格 |
| `streamMarkupHealingPattern` | `"kimi"`（K2 系列或 Kimi/Moonshot 提供方）、`"dsml"`（任何主机上的任何 DeepSeek 类模型，包括本地后端和自定义提供方），其他情况为 `"thinking"`；官方 OpenAI 上不设置 | 选择泄漏标记修复器；`"qwen"` 也是显式支持的模式 |
| `emptyLengthFinishIsContextError` | Ollama | 带有 `finish_reason: "length"` 的空补全 → 上下文溢出错误 |
| `streamFirstEventTimeoutMs` | 本地后端为 `0` | 首事件看门狗提示（`0` = 不限制预填充/模型加载时间） |
| `streamIdleTimeoutMs` | GLM/Alibaba 编码计划为 600 秒；选定的 MiMo/Kimi/DeepSeek 和本地后端为 300 秒；某些部署使用 `0` | 回退空闲预算；请求选项和超时环境变量优先 |
| `streamRevision` | Kimi 为 `"possible"`；其他情况不设置，除非已声明 | 声明已流式传输的内容是否可能被修订；使用者可以避免过早提交内容 |

### 仅用于 chat-completions 的标志（`ResolvedOpenAICompat`） \{#chat-completions-only-flags-resolvedopenaicompat}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsStore` | 标准 OpenAI 形态主机为 `true`，非标准主机（Cerebras、Grok、Mistral、Fireworks、Z.AI 等）为 `false` | 为 `true` 时发送 `store: false`（选择退出数据保留）；为 `false` 时省略该字段，因为主机会拒绝它 |
| `supportsMultipleSystemMessages` | `compat/resolve.ts` 中的规范主机允许列表；MiniMax/Alibaba/Qwen 默认为 `false` | 为 `false` 时，开头的系统消息合并为一条（用 `\n\n` 连接）；为 `true` 时，分别保留以复用 KV 缓存 |
| `supportsUsageInStreaming` | Cerebras 为 `false` | 添加 `stream_options: { include_usage: true }` |
| `maxTokensField` | Mistral、原生 Moonshot、Z.AI、Zhipu、Chutes、Fireworks、直连 DeepSeek 为 `"max_tokens"`；其他为 `"max_completion_tokens"` | 输出 token 字段名（`resolveOpenAIOutputTokenParam`） |
| `thinkingKeep` | 原生 Moonshot Kimi K2.6 为 `"all"` | 添加 `thinking.keep: "all"` |
| `cacheControlFormat` | OpenRouter Anthropic 和 Cline Qwen/Anthropic 为 `"anthropic"` | 添加 Anthropic `cache_control: { type: "ephemeral" }` 标记；OpenRouter Anthropic 的 Responses 视图上也存在此字段 |
| `toolStrictMode` | Cerebras 为 `"all_strict"`；默认为 `"mixed"` | `all_strict` 只有在每个工具都可适配时才使用严格模式，否则降为 `none`；`none` 省略严格模式字段；`mixed` 遵循逐工具严格性 |
| `vercelGatewayRouting` / `isVercelGatewayHost` | Vercel AI Gateway 主机（Responses 视图上也有） | `providerOptions.gateway` 下的路由 |
| `dropThinkingWhenReasoningEffort` | Fireworks | 存在 `reasoning_effort` 时删除 `thinking` 块（Fireworks 拒绝两者同时存在） |
| `extraBody` | 未设置（由 DeepSeek 推理策略使用） | 合并到请求体中的任意 JSON（`applyOpenAIExtraBody`） |
| `whenThinking` | OpenCode 网关、直连 DeepSeek 推理、显式覆盖 | 预构建的完整替代 `ResolvedOpenAICompat`，思考处于活动状态时通过指针切换引入（仅 chat-completions 视图；OpenRouter 的合并兼容性会继承它） |
| `supportsPromptCacheKey` | Kimi Code | 生成规范化的顶层 `prompt_cache_key` |
| `nativeKimiK3Reasoning` | 原生 Kimi/Moonshot 路由上的 K3 | 在强制 `"required"` 时保留原生推理强度 |
| `zaiReasoningEffortDialect` | Z.AI/Zhipu 上的 GLM-5.2 | 使用工具时添加 `tool_stream: true`，并使用模型输出上限 |

### 仅用于 Responses 的标志（`ResolvedOpenAIResponsesCompat`） \{#responses-only-flags-resolvedopenairesponsescompat}

| 标志 | 默认检测 | 传输效果 |
| --- | --- | --- |
| `supportsLongPromptCacheRetention` | 官方 OpenAI | 请求时发送 `prompt_cache_retention: "24h"` |
| `strictResponsesPairing` | Azure OpenAI、Copilot Responses | 构建 Responses 输入条目时，强制工具调用/工具结果严格 1:1 配对 |
| `statefulResponses` | 未设置；请求时回退到 `officialEndpoint` | 在 OpenAI Responses 处理器上（包括 OpenRouter Responses 分派），启用 `previous_response_id` 加增量输入，并强制 `store: true`；`false` 使用完整重放和 `store: false`。不改变 Codex 或 Azure 处理器 |
| `connectionBoundNativeHistory` | GitHub Copilot（`connection-bound-native-history` 提供方规则） | 恢复的会话从消息内容重建先前轮次，丢弃加密推理和条目 ID，直到首次成功响应；其他主机从首个请求起重放原生历史。所有主机在过期条目重置之后都重建，直到下一次成功 |
| `supportsImageDetailOriginal` | OpenAI、Azure OpenAI 和 Codex 为 `true`；其他主机为 `false` | 禁用时，将输入图像的 `detail: "original"` 限制为 `"auto"`。接受 `original` 的自定义主机可通过 `compat.supportsImageDetailOriginal: true` 选择启用；显式覆盖在两个方向上都优先 |
| `supportsReasoningSummary` | 第一方 xAI 上为 `false` | 在拒绝该字段的主机上省略 `reasoning.summary` |
| `supportsAllTurnsReasoningContext` | Codex 上的 GPT-5.4+ | 控制显式 `reasoning.context: "all_turns"` 覆盖；Responses Lite 始终要求此范围 |
| `requiresReasoningOffJuiceInstruction` | GPT-5.6+ 类规则 | 强制关闭的请求添加 developer 指令 `# Juice: … !important` |
| `officialEndpoint` | 官方端点上的 `openai` 提供方 | 控制默认开启的有状态 `previous_response_id` 链接及 `text.verbosity` |
| `harmonyLeakMitigation` | Codex 提供方 | 启用 Harmony 协议泄漏检测/缓解 |
| `supportsConfigurationUpdate` | `gpt-6-astra` 为 `true`（类规则，任何主机）；其他为 `false` | 将请求级 `reasoning.effort` 固定到会话基线，并将后续更改作为 `configuration_update` 输入条目携带；对于遇到该条目类型会返回 400 的自定义代理，在 `models.yml` 中设为 `false`，更改后的推理强度就会在请求级发送，且不生成条目 |
| `supportsSteering` | GPT-6+ 为 `true`（类规则，任何主机）；其他为 `false` | Codex WebSocket 轮次将排队的用户引导以 `response.steer` 发送到正在流式传输的响应中；下一请求读取服务端的自动继续执行，或只发送待处理的工具输出 |
| `supportsObfuscationOptOut` | 官方 OpenAI | 允许 `stream_options: { include_obfuscation: false }` |

有状态链接的优先级依次是调用的 `statefulResponses` 选项、`PI_OPENAI_STATEFUL`、`compat.statefulResponses`、`compat.officialEndpoint`。环境变量值为 `1`、`y`、`yes`、`true` 或 `on`（全小写或全大写）时启用链接，任何其他非空值都会禁用；未设置或为空则保留模型默认值。该兼容性键不隐含 `officialEndpoint`，也不会启用 `text.verbosity`、退出混淆或任何其他官方专有行为。链接需要 `sessionId` 和 `providerSessionState`。

## 2. 推理级别 \{#2-reasoning-levels}

### 推理强度模型 \{#the-effort-model}

规范强度量表为 `Effort` 枚举（`packages/catalog/src/effort.ts`）：`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。

逐模型能力位于 `ThinkingConfig`（`packages/catalog/src/types.ts`），由 `resolveModelPolicy`（`packages/catalog/src/compat/resolve.ts`）在构建时解析。显式规格元数据优先；KDL 规则以及身份/API 回退填充缺失字段：

- `mode`：传输机制：`effort`（OpenAI 风格）、`budget`（token 预算）、`google-level`（枚举级别）、`anthropic-adaptive`、`anthropic-budget-effort`
- `efforts`：按规范顺序排列的受支持级别
- `defaultLevel`：声明时的模型特定初始推理强度
- `supportsDisplay`：Anthropic 思考摘要显示支持
- `prefixBinding`：思考签名绑定到前面的对话前缀
- `effortMap`：预置的上游传输字符串重映射（例如在不支持 xhigh 的模型上将 `xhigh` → `high`）
- `effortRouting`：推理强度（或 `"off"`）→ 动态模型 ID 变体（`resolveWireModelId` 选择传输 ID）
- `effortBudgets`：为合并后的推理强度档位预计算的 token 预算
- `requiresEffort`：不能禁用思考
- `suppressWhenOff`：必须在传输时显式发送“关闭”（`includeThoughts: false` / `thinkingBudget: 0`），而不只是省略

运行时辅助函数：`clampThinkingLevelForModel`（将请求的推理强度限制到模型支持的范围）、`mapEffortToGoogleThinkingLevel`、`mapEffortToAnthropicAdaptiveEffort`。

### 各提供方的传输映射 \{#per-provider-wire-mapping}

| 提供方 | 模式 | 传输编码 |
| --- | --- | --- |
| Anthropic（`providers/anthropic.ts`） | `anthropic-adaptive`、`budget` 或 `anthropic-budget-effort` | 自适应：`thinking: { type: "adaptive", display? }` 加受支持的 `output_config.effort`；预算：`thinking: { type: "enabled", budget_tokens: N, display }`，可选地与输出推理强度组合。推理强度/交错 beta 标头受能力控制；较新的支持显示的模型原生支持交错。`ensureMaxTokensForThinking` 预留 1024-token 输出缓冲区，当模型上限不允许把 `max_tokens` 提高到足够值时减少预算 |
| OpenAI Responses（`providers/openai-responses.ts`） | `effort` | `reasoning: { effort }` 加 `reasoning.summary: "auto" \| "detailed" \| "concise" \| null` |
| OpenAI Chat Completions（`providers/openai-completions.ts`） | `effort` | 默认为 `reasoning_effort`；实际开关字段取决于 `thinkingFormat`（见[标志表](#reasoning-wire-format)） |
| Google Gemini / Vertex（`providers/google-shared.ts`） | `google-level` 或 `budget` | `thinkingConfig: { includeThoughts, thinkingLevel: MINIMAL…HIGH, thinkingBudget: N }` |

### OpenAI 兼容性解析管线 \{#the-openai-compat-resolution-pipeline}

`resolveOpenAICompatPolicy`（`providers/openai-shared.ts`）逐请求决定：

1. **启用/禁用**：请求的推理强度与模型推理支持相对照，再减去抑制规则（`disableReasoningOnForcedToolChoice`、`disableReasoningOnToolChoice`、`disableReasoningWithTools`、`none` 推理强度处理）。对于只要存在工具选择就会抑制所请求推理的主机，先省略冗余的 `"auto"` 工具选择。
2. **`whenThinking` 切换**：启用 + 存在变体 → 当前兼容性变为预构建的变体。
3. **传输推理强度**：通过 `compat.reasoningEffortMap` / `model.thinking.effortMap` 映射请求的 `Effort`；`omitReasoningEffort` 抑制该字段，同时保留思考开关。
4. **禁用编码**：推理关闭但传输需要显式关闭信号时，`encodeChatCompletionsDisabledReasoning` 生成 `reasoningDisableMode` 指定的格式。

如果主机以 400/422 拒绝生成的推理强度，`resolveOpenAIReasoningEffortFallback`（`providers/openai-reasoning-fallback.ts`）会解析错误文本，提取可接受值或移除参数，然后重试。

### 从流中取回思考 \{#getting-thinking-back-out-of-the-stream}

- **结构化增量**：提供方生成 `thinking_start` / `thinking_delta` / `thinking_end` 流事件。
- **历史重放**：先前思考通过助手消息上的 `reasoningContentField` 重放（在 DeepSeek/Z.AI/Qwen/本地后端上保留 KV 缓存）；要求工具调用轮次具有推理内容的模型会按 `allowsSyntheticReasoningContentForToolCalls` 获得真实内容或 `"."` 占位符。
- **切换主机或模型**：较早轮次的思考在目标就是其生成方时原生重放（相同的提供方、传输和模型 ID）。来自**另一主机上同一模型**的轮次，在以下条件全部满足时也会原生重放：其系列在 `compat/rules/classes/*.kdl` 中声明了 `portable-reasoning`（存储的文本是模型的完整轨迹，身份固定到一组权重；主机可在其 `providers/*.kdl` 中通过 `portable-reasoning #false` 退出），两个主机都被归入相同的类、系列和修订版（`compat/reasoning-carry.ts`），目标编码器已经会原生重放自己的推理（`providers/transform-messages.ts` 中的 `targetReplaysPlaintextReasoning`：chat-completions 推理字段、在要求推理重放的主机上无 ID 的 Responses 推理条目，或 Devin 的 `thinking` 字段），且传输将该块作为未标记为摘要的推理交付（`ThinkingContent.summary === false`，针对 chat-completions 推理字段、Responses `reasoning_text` 和 Devin `thinking` 设置；系列的 `portable-reasoning` 声明为其是完整轨迹提供保证）。摘要（`summary: true`、Responses `summary_text` 和 Gemini thoughts）以及没有该状态的块，包括该状态出现之前记录的轮次，仍保留文本回退。目前已声明的有：Kimi K3、DeepSeek V4、GLM 5+、MiniMax M3。来自不同模型的轮次保留旧规则：只在 `thinkingFormat: "zai"` 聊天目标和 Anthropic 格式的 `replayUnsignedThinking` 目标上原生重放，否则按目标方言降为可见文本（`renderDemotedThinking`）。
- **泄漏思考修复**：`wrapLeakedThinkingStream`（`utils/leaked-thinking-stream.ts`）将行为异常主机在带内发送的 ` ```thinking ` / `<think>` 围栏实时转换为结构化思考块。
- **循环防护**：`withThinkingLoopGuard`（`utils/thinking-loop.ts`）检测失控推理（逐字重复、近似重复的三元组簇、进展词汇停滞），并以可重试的 `AIError.Flag.ThinkingLoop` 终止流。

### 交互 \{#interactions}

- **采样限制**：推理处于活动状态的模型（Opus 4.7+、Fable/Mythos 5、o 系列/GPT-5）拒绝显式的 `temperature`/`top_p`；`anthropic.ts` 和兼容性策略（`supportsSamplingParams`）会抑制它们。
- **强制工具选择**：见[§4](#interaction-with-reasoning)；若干提供方在强制工具调用时必须移除思考。无法禁用的前缀绑定思考则会使强制选择降级。

## 3. 各提供方的工具处理 \{#3-tool-handling-per-provider}

所有提供方都从相同的中立传输模式 `toolWireSchema(tool)`（`utils/schema/wire.ts`）开始，在规范化、流式形态和结果编码上有所不同。

### Anthropic（`providers/anthropic.ts`） \{#anthropic-providersanthropicts}

- **模式**：`buildAnthropicToolSchemaPlans` 逐工具决定严格性：允许列表（`ANTHROPIC_STRICT_TOOL_ALLOWLIST`）、没有不兼容关键字（`oneOf`/`allOf`/`$ref`/`patternProperties`/`propertyNames`），以及预算上限（`MAX_ANTHROPIC_STRICT_TOOLS`、可选/联合参数限制）。严格模式会经过 `normalizeAnthropicStrictSchema`（`additionalProperties: false`）；开放映射保持非严格，以保留映射语义。传输：`{ name, description, input_schema, eager_input_streaming?, strict? }`。
- **流式传输**：`content_block_start`（`tool_use`，携带 `id`+`name`）→ `input_json_delta` 片段 → 在 `content_block_stop` 时通过 `parseStreamingJson` 解析。信封异常会被记录（`reportAnthropicEnvelopeAnomaly`），而非致命错误。
- **结果**：带有 `tool_result` 块（`tool_use_id`）的 `user` 消息。图像嵌入 `tool_result.content` 内；对于**错误**结果，Anthropic 拒绝嵌入图像，因此文本留在块中，图像提升到连续 `tool_result` 块之后。Z.AI 的 Anthropic 形态端点还需要块上的 `id`（`requiresToolResultId`）。
- **重放特殊行为**：助手轮次稳定分区为 `[...non_tool_use, ...tool_use]`，使 `tool_use` 块位于末尾，否则 Anthropic 会返回 400，消息为 "tool_use ids were found without tool_result blocks immediately after"。
- **严格模式回退**：400 严格模式拒绝会设置 `providerSessionState.strictToolsDisabled`，并在不带 `strict` 的情况下重试。

### OpenAI Chat Completions（`providers/openai-completions.ts`） \{#openai-chat-completions-providersopenai-completionsts}

- **模式**：`convertTools` + `adaptSchemaForStrict`；严格性来自 `toolStrictMode`（`all_strict` / `mixed` / `none`），受 `supportsStrictMode` 和逐工具的 `strict` 控制。`toolSchemaFlavor` 选择 Moonshot MFJS 规范化或本地语法清理。含有不可能的 enum/const 值或被禁止的残余根联合的模式会被隔离。传输：`{ type: "function", function: { name, description, parameters, strict? } }`。
- **流式传输**：`choice.delta.tool_calls`（`index`、`id`、`function.name`、`function.arguments` 片段）。MiniMax 将参数作为原始 JSON **对象**而不是字符串流式传输，两种形态都会合并（`mergeStreamingArgumentObjects`）。按 `stripDeepseekSpecialTokens` 剥离泄漏的 DeepSeek 模板 token。发现过结构化调用时，`finish_reason: "stop"` 会提升为 `"tool_calls"`。
- **结果**：`{ role: "tool", tool_call_id, content }`；Mistral ID 会被规范化；助手重放设置 `tool_calls` 数组和内容 `""`（在 `requiresAssistantContentForToolCalls` 下为 `"."`）。非视觉模型通过 `partitionVisionContent` 获得图像占位符。

### OpenAI Responses（`providers/openai-responses.ts`） \{#openai-responses-providersopenai-responsests}

- **模式**：`sanitizeSchemaForOpenAIResponses` + `adaptSchemaForStrict`，在兼容性要求时进行 Moonshot 规范化和根联合处理。支持函数工具、自由形式的**自定义工具**和原生**计算机工具**（`model.supportsComputerUse`）。传输：扁平的 `{ type: "function", name, description, parameters, strict? }`。作者显式指定的 `strict: false` 仅在传输的 strict 字段门控允许时保留；`PI_NO_STRICT` 绕过严格模式强制执行。
- **流式传输**：`response.output_item.added` → `response.function_call_arguments.delta` / `response.custom_tool_call_input.delta` → `response.output_item.done`。工具调用 ID 为复合的 `callId|itemId`（`normalizeResponsesToolCallId`）。
- **结果**：`function_call_output` 和 `custom_tool_call_output` 条目通过 `call_id`（复合 ID 中的 `callId` 部分）与调用配对。其 `output` 是字符串，或由规范的 `input_text` 和 `input_image` 块组成的数组。支持视觉的模型将工具结果图像保留在该数组中，而不是创建合成用户消息；不支持图像输入的模型接收文本占位符。认证网关解析也接受旧式 `output_text`、`text` 和 `refusal` 块，将内联 data-image URL 解码为图像内容，并将远程图像 URL 或 OpenAI 图像文件 ID 保留为引用。文件 ID 需要兼容 Responses 的上游，因为其他提供方传输无法解析它们。请求消息仍支持 `input_file`，但工具输出会拒绝它，直到规范工具结果能够无损重放其字节和引用。有状态 `previous_response_id` 链接在官方 OpenAI 端点上默认开启，其他情况需要选择启用；已保存的基线匹配时，它只发送输入后缀。

### Google Gemini / Vertex（`providers/google-shared.ts`、`google.ts`） \{#google-gemini--vertex-providersgoogle-sharedts-googlets}

- **模式**：函数包裹在 `{ functionDeclarations }` 中。常规路径使用 `parametersJsonSchema: normalizeSchemaForGoogle(...)`。
- **流式传输**：`part.functionCall` 到达时带有 `name` 和完整的 `args` **对象**（不进行参数片段流式传输）。原生唯一 ID 会保留；缺失或重复的 ID 通过 `nextToolCallId(name)` 合成。
- **Vertex 特殊行为**：Vertex `GenerateContent` 拒绝函数部分上的 `id`。`supportsFunctionPartId` 兼容性标志控制是否编码这些 ID；Vertex 提供方规则将其设为 `false`。
- **结果**：带有 `functionResponse` 部分的 `user` 消息。所有并行响应必须合并为**单条连续的** `user` 消息，否则 Google 报错 "number of function response parts is not equal to number of function call parts"。图像：`compat.multimodalFunctionResponse` 将图像保留在 `functionResponse.parts` 中（Gemini 3+）；否则先缓冲它们（`pendingToolImageParts`），在响应后作为独立用户轮次刷新输出。

### Amazon Bedrock（`providers/amazon-bedrock.ts`） \{#amazon-bedrock-providersamazon-bedrockts}

- **模式**：`convertToolSpec` → `{ toolSpec: { name, description, inputSchema: { json } } }`。
- **流式传输**：`start.toolUse`（`toolUseId`、`name`），随后是 `delta.toolUse.input` 片段。
- **结果**：所有连续工具结果分组到一条带有 `toolResult` 数组的 `user` 消息中（Converse API 要求）；图像嵌入 `content` 数组。
- **哨兵特殊行为**：存在 `toolChoice: "none"`、工具使用历史且没有活动工具时，`planToolConfig` 注入 `NO_TOOLS_SENTINEL`（`__no_tools__`，描述为 "do not call"）及 `{ auto: {} }`；哨兵调用被丢弃。有活动工具和工具历史时，保留真实工具规格，但省略显式选择。其他无工具请求省略 `toolConfig`。

### 差异汇总 \{#differences-summary}

|  | Anthropic | OpenAI Completions | OpenAI Responses | Google | Bedrock |
| --- | --- | --- | --- | --- | --- |
| 模式规范化器 | 严格模式允许列表 + 预算 | `adaptSchemaForStrict` | `sanitizeSchemaForOpenAIResponses` | `normalizeSchemaForGoogle` | 原始 JSON 模式 |
| 参数流式传输 | JSON 字符串片段 | JSON 字符串片段（MiniMax：对象） | JSON 字符串片段 | 完整对象，无片段 | JSON 字符串片段 |
| 调用 ID | 原生 | 原生（加上 Mistral 9 字符、OpenAI 40 字符规则） | 复合 `callId\|itemId` | 原生或合成；Vertex 省略传输 ID | 原生 |
| 结果编码 | `user` + `tool_result` 块 | `role: "tool"` 消息 | 函数/自定义输出条目 | `user` + `functionResponse` 部分，单条消息 | `user` + 分组的 `toolResult` 数组 |
| 结果中的图像 | 嵌入；错误时提升 | 占位符分离 | 在输出数组内；无图像输入时使用占位符 | Gemini 3+ 嵌入，否则放在末尾用户轮次 | 嵌入 |
| 并行调用 | 原生 | 原生 | 原生 | 原生 | 原生 |

### 严格工具生命周期 \{#strict-tools-lifecycle}

`OpenAIStrictToolsState`（`providers/openai-shared.ts`）按作用域 `${provider}:${baseUrl}:${modelId}` 跟踪严格模式失败：识别到 400/422 严格模式拒绝时调用 `disableStrictToolsForScope`，`isStrictToolsDisabledForScope` 会让该作用域内所有后续请求以非严格模式运行，重试一次后便记住，不会每轮都付出 400 的代价。Anthropic 有类似的逐会话 `strictToolsDisabled` 标志。

### 基于文本的工具调用方言（`src/dialect/`） \{#text-based-tool-call-dialects-srcdialect}

原生工具 API 不可用，或历史需要为不同模型系列重新编码时使用：

1. **带内工具调用**：`renderInbandToolPrompt(tools, dialect)` 将工具清单注入提示；`InbandScanner` / `wrapInbandToolStream` 将流式文本解析回结构化工具调用。方言：`harmony`、`gemini`、`qwen3`、`deepseek`、`kimi`、`glm`、`gemma`、`hermes`、`minimax`、`xml`、`anthropic`。
2. **跨模型历史重放**：会话中途切换模型时，按目标的 `preferredDialect(modelId)` 重新渲染先前的思考/工具轮次（`renderDemotedThinking`、`encodeInbandToolHistory`）。
3. **Harmony**（`dialect/harmony.ts`）：GPT-5/Codex 控制 token（`<|start|>`、`<|call|>`、`<|channel|>`、`<|return|>`）；`utils/harmony-leak.ts` 在通过非 Harmony 端点重放时对其转义。
4. **修复**：`StreamMarkupHealing`（`utils/stream-markup-healing.ts`）使用相同的扫描器，从托管模型泄漏到可见文本中的标记重建工具调用和思考。

### 边界防护 \{#edge-guards}

- **`utils/tool-call-loop-guard.ts`**：`ToolCallLoopGuard` 规范化参数（排序键，剥离 `i` / 旧式 `__intent`），并跨连续轮次比较排序后的整轮调用集合。达到配置的重复阈值时，返回 `RepeatedToolCallDetection`；没有调用的轮次和全部豁免的轮次会重置计数器。
- **`utils/deterministic-id.ts`**：`deterministicUuid(seed)`（SHA-256 → UUID 形态）使 Cursor/Devin 历史消息 ID 稳定。缺失的工具调用 ID 使用提供方特定的回退；Google 使用 `nextToolCallId`。
- **`providers/transform-messages.ts`**：在提供方特定转换之前，进行共享的预检处理：工具调用去重、清理、ID 规范化。

## 4. 强制工具选择 \{#4-forced-tool-choice}

### 统一的 `ToolChoice`（`src/types.ts`） \{#unified-toolchoice-srctypests}

```ts
type ToolChoice =
	| "auto"
	| "none"
	| "any"
	| "required"
	| { type: "function"; name: string }
	| { type: "function"; function: { name: string } }
	| { type: "tool"; name: string }
	| { type: "computer" };
```

- `auto`：由模型决定（存在工具时的默认值）
- `none`：此轮次不调用工具
- `required` / `any`：至少一次工具调用（OpenAI 与 Anthropic 的写法；可互换）
- 具名固定选择：将工具选择限制为此工具（不是一次调用的数量限制）
- `{ type: "computer" }`：分派到原生计算机使用工具

在 `packages/ai` 内，`toolChoice` **逐请求一次性生效**，不会粘滞；由调用者每轮决定。

### 映射工具函数（`src/utils/tool-choice.ts`） \{#mapping-utilities-srcutilstool-choicets}

| 导出 | 语义 |
| --- | --- |
| `isForcedToolChoice(choice)` | 除 `undefined`/`"auto"`/`"none"` 外均为 `true`，即 `required`、`any` 和所有固定选择。用于提供方必须对强制选择做出反应的各处 |
| `mapToOpenAICompletionsToolChoice` | → `"auto" \| "none" \| "required" \| { type: "function", function: { name } }`（`any` → `required`，嵌套名称形态） |
| `mapToOpenAIResponsesToolChoice` | → 相同字符串，加上**扁平的** `{ type: "function", name }` 和 `{ type: "computer" }`；Responses 构建器另行将函数固定选择转换为自定义工具固定选择 |
| `mapToAnthropicToolChoice` | → `"auto" \| "none" \| "any" \| { type: "tool", name }`（`required` → `any`） |

### 各提供方的传输映射 \{#per-provider-wire-mapping-1}

| 提供方 | 传输字段 | 值 | 降级 / 防护 |
| --- | --- | --- | --- |
| OpenAI Completions | `tool_choice` | 字符串 + 嵌套函数对象 | 仅支持字符串时，具名固定选择 → 过滤工具 + `"required"`；原生 K3 推理固定选择 → 保留完整提供列表的 `"required"`；不支持的强制选择 → `"auto"`；不存在的固定选择以及没有工具时的 `"none"` 被丢弃 |
| OpenAI Responses | `tool_choice` | 字符串 + 扁平函数/自定义/计算机对象 | 仅支持字符串时的具名固定选择和不支持的强制选择按兼容性降级；对照**模式隔离后剩余**的工具验证选择，指向已移除工具的固定选择被删除；没有原生支持时，`{ type: "computer" }` 变为函数固定选择（`azure-openai-responses.ts` 中也如此） |
| Anthropic | `tool_choice` | `{ type: "auto" \| "none" \| "any" \| "tool", name? }` | 名称通过 `encodeAnthropicToolName` 编码；`!supportsForcedToolChoice` 或强制的前缀绑定思考 → `auto` |
| Google Gemini/Vertex | `toolConfig.functionCallingConfig` | `mode: AUTO \| NONE \| ANY`（固定选择另带 `allowedFunctionNames`） | 无 |
| Bedrock | `toolConfig.toolChoice` | `{ auto: {} } \| { any: {} } \| { tool: { name } }` | `planToolConfig`；`"none"` + 工具历史 + 无工具 → `NO_TOOLS_SENTINEL`，带有 `{ auto: {} }` |
| Ollama | `tool_choice` | 仅 `"none"` / `"required"` | 通过 `selectToolsForToolChoice` 模拟固定选择：将工具过滤到目标，发送 `"required"` |

### 模拟和回退路径 \{#emulation-and-fallback-paths}

1. **仅支持字符串的主机**（`supportsNamedToolChoice: false`，LM Studio、llama.cpp、Ollama）：主机会拒绝对象固定选择，因此提供方**只声明被固定选择的工具**，并发送 `tool_choice: "required"`，只提供一个工具时，`required` 等同于固定选择。
   原生 Kimi K3 推理有所不同：具名强制选择变为 `"required"`，但不过滤其他工具，保留强制工具使用，却不保留具名工具限制。
2. **Bedrock 哨兵**：见[§3](#amazon-bedrock-providersamazon-bedrockts)。
3. **计算机固定选择回退**：不具备原生支持的 `{ type: "computer" }` 降级为具名函数固定选择。
4. **过期固定选择剪除**：最终工具列表中缺失的强制工具（活动工具过滤、模式隔离）会静默移除 `tool_choice`，而不是生成无效请求。

### 与推理的交互 \{#interaction-with-reasoning}

若干后端拒绝思考与强制工具选择同时存在：

- **Anthropic**：`disableThinkingIfToolChoiceForced` 删除 `params.thinking`；仅支持自适应的模型固定 `output_config.effort = "low"`，使默认自适应思考不会重新介入。
- **Bedrock**：强制 `any`/`tool` 清除 `additionalModelRequestFields`（思考配置所在位置），除非必须保留前缀绑定思考；此时工具选择降级为 `auto`。
- **OpenAI 兼容性**：`resolveOpenAICompatPolicy` 遵循 `disableReasoningOnForcedToolChoice` / `disableReasoningOnToolChoice`。例外：Kimi K3 在强制 `"required"` 时保留推理强度（`openai-completions.ts` 中的 `hasActiveNativeKimiK3Reasoning`）。

### 智能体循环如何驱动它（`packages/agent`） \{#how-the-agent-loop-drives-it-packagesagent}

- **逐轮次解析**：`agent-loop.ts` 在每轮开始时解析 `config.getToolChoice()`：
   ```ts
   const effectiveToolChoice = ownedDialect ? undefined : (hostToolChoice ?? forcedToolChoice ?? config.toolChoice);
   ```
   自有带内方言处于活动状态时，原生工具会被剥离，因此 `tool_choice` 必须为 `undefined`（没有原生 `tools` 的原生 `tool_choice` 会导致 400）。
- **软性要求**（`SoftToolRequirement`、`packages/agent/src/types.ts`）：每轮强制 `tool_choice` 会使提供方提示缓存反复变动。软性要求（`{ soft: true, toolName, reminder }`）先注入提醒文本，将 `toolChoice` 保留为 auto；只有模型未调用 `toolName` 时，下一轮才会升级为硬性 `{ type: "tool", name }`，仅生效一轮。
- **活动工具刷新**：`refreshToolChoiceForActiveTools`（`packages/agent/src/agent.ts`）丢弃工具已不在活动集合中的排队强制选择。
- **上下文压缩/交接**：以 `toolChoice: "none"` 运行，在强制纯文本输出的同时保留提示缓存前缀；遇到仅支持 auto 的 400 时，以 `"auto"` 重试一次（`packages/agent/src/compaction/compaction.ts`）。
