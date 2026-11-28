---
title: "提供方端点约束"
description: "Oh My Pi 官方仓库文档：提供方端点约束。"
---

# 提供方端点约束 \{#provider-endpoint-constraints}

提供方集成并不会因为采用 OpenAI 形态的 HTTP 协议就可以互换。请求同时受到四个层面的塑造：

1. 端点系列：`openai-completions`、`openai-responses`、`openai-codex-responses`、`anthropic-messages` 等。
2. 网关/认证接口：OpenRouter、Vercel AI Gateway、Azure OpenAI、Copilot、Alibaba Coding Plan、Kimi Code、Fireworks/Firepass 及类似主机
3. 模型元数据和 `compat` 覆盖
4. 请求上下文：工具、图像、推理模式、有状态会话、服务层级

添加提供方、添加兼容性标志，或将逻辑移出提供方特定分支时，请使用本页。目标是在实际拥有该行为的最窄层面，将端点约束编码一次。

相关参考：

- [提供方](./providers.md)：提供方可用性、凭据、自定义提供方
- [模型和提供方配置](./models.md)：`models.yml`、路由和兼容性字段
- [提供方流式传输内部机制](./provider-streaming-internals.md)：流事件规范化
- [提供方兼容性参考](./provider-compat-reference.md)：每个兼容性标志、推理级别、各提供方的工具处理
- [提供方特殊行为](./provider-quirks.md)：各提供方的特殊处理、流行为、认证/用量、目录处理
- [添加提供方](./adding-a-provider.md)：新提供方的目录/认证接线

## 基本规则 \{#baseline-rules}

- 当行为可按模型或端点配置时，优先使用兼容性元数据，而非提供方名称分支。内置策略编写在 `packages/catalog/src/compat/rules/` 中；`packages/catalog/src/compat/resolve.ts` 中的 `resolveModelPolicy` 依次叠加 API 默认值、端点检测、KDL 级联，再应用稀疏的模型覆盖/修正。思考元数据随后解析。
- 将传输机制保留在各自的传输内部。Codex websocket 重放、Responses 条目路由和 Chat Completions SSE 解码属于协议行为，而不是通用兼容性标志。
- 将回退限定到失败的能力。严格工具失败不应禁用无关功能。过期的 Responses 链应重置链状态，而不是完全禁用 Responses。
- 不要生成会改变网关路由的默认值。OpenRouter 的默认 `max_tokens` 是已知案例，但任何网关都可能将可选字段视为路由提示。
- 出现可见副作用后停止重试。一旦文本或工具调用对用户/会话可见，重试策略就必须避免重复输出和重复工具执行。

## 1. 先选择端点系列 \{#1-choose-the-endpoint-family-first}

### 兼容 OpenAI Chat Completions \{#openai-chat-completions-compatible}

保留这些差异，而不是把每个主机都当成原版 OpenAI：

- 只有兼容性表明支持流式用量时，`stream_options.include_usage` 才是安全的。
- 只有部分主机接受 `store: false`。
- 最大输出上限使用 `max_tokens` 或 `max_completion_tokens`。
- 在当前类 OpenAI 端点集合中，停止序列和频率惩罚位于此路径。
- 除非兼容性明确表明可以，否则 OpenRouter 风格的推理和路由字段不可移植到其他兼容 OpenAI 的主机。

### 兼容 OpenAI Responses \{#openai-responses-compatible}

Responses 请求形态自成一种方言：

- 使用 `input`、`instructions`、`store`、`prompt_cache_key`、可选的 `previous_response_id` 和 `max_output_tokens`
- 可以让官方 OpenAI 请求默认使用有状态链接，采用 `previous_response_id` 加 `store: true`
- 第三方 Responses 代理可能拒绝原生推理历史、加密推理重放或 `previous_response_id`
- 流完成需要一个可识别的终止事件：`response.completed`、`response.incomplete` 或兼容的 `response.done` 信封；在这些事件之一出现前关闭会视为失败，而不是将部分输出作为成功呈现
- 瞬态流故障可以在出现重放不安全的输出之前重试；一旦观察到这类输出，就会提交该部分尝试

### OpenRouter API 分派 \{#openrouter-api-dispatch}

目录的 `openrouter` API 是路由 API，而不是另一种传输模式。`stream.ts` 默认将其分派到 Responses 适配器；设置 `PI_OPENROUTER_RESPONSES=0` 则选择 Chat Completions。显式的 `openai-responses` 或 `openai-completions` 模型 API 会直接分派。

### OpenAI Codex Responses \{#openai-codex-responses}

Codex 并不是换了 URL 的普通 Responses。将以下内容保留为 Codex 传输策略：

- Codex 账户标头和 beta 标头
- `x-codex-turn-state` 和 `x-models-etag`
- 可选的 websocket 传输加 SSE 回退
- `responsesLite`
- 用作传输状态的提示缓存/会话 ID
- 仅限 websocket 的 `previous_response_id` 链接；SSE 从不链接
- Codex 重试/重放规则，包括重连和 SSE 重放边界
- 仅在尚未生成用户可见内容之前进行提供方重试
- 仅含空白的工具调用参数循环中断器

Codex 有意不转发调用者的最大 token 上限，因为后端会拒绝它们。

### Anthropic/OpenAI 双接口提供方 \{#anthropicopenai-dual-surface-providers}

Kimi Code 和 Synthetic 可以通过 OpenAI 兼容或 Anthropic 兼容方式调用。垫片可能需要：

- 切换 `format`
- 按需重建 Anthropic 模型
- 将内部推理映射为 Anthropic 思考预算
- 委托回 OpenAI Completions

不要将这些编码为单向提供方迁移；它们是运行时接口选择决策。

## 2. 应用网关和认证覆盖层 \{#2-apply-gateway-and-auth-overlays}

这些约束位于端点系列之上。它们影响认证、标头、路由、模型 ID 或用量计量。

### Azure OpenAI \{#azure-openai}

- Chat Completions 将基础 URL 重塑为 `/deployments/{deployment}/chat/completions?api-version=...`。
- Responses 使用 `/responses?api-version=...`，不采用部署范围的 URL；部署名称改为作为请求的 `model` 发送。
- 两种接口都可以通过 `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 将模型 ID 映射到部署名称。
- Responses 使用 `api-key` 标头认证，API 版本默认为 `v1`，使用无状态的 `store: false`，并拒绝显式提示缓存。

### GitHub Copilot \{#github-copilot}

- API 密钥会被解析为访问令牌。
- 动态 Copilot 标头取决于消息/图像。
- `premiumRequests` 必须在用量填充和替换后保留下来。
- 基础 URL 可以从原始密钥解析。

### OpenRouter \{#openrouter}

- 添加归属/缓存标头。
- 支持 `:nitro` 和 `:floor` 等路由后缀。
- 只有模型 ID 的最后一个提供方路径段之后没有显式后缀时，才附加路由后缀。
- 使用嵌套的 `reasoning` 请求字段。
- 通过 OpenRouter `provider` 对象路由提供方。
- 具有特殊的缓存写入用量计量。
- 为 Anthropic 语法大小失败提供严格工具回退。
- 除非调用者显式设置，否则省略目录默认的输出上限，但具有 `alwaysSendMaxTokens` 的模型除外。这同时适用于 `max_tokens` 和 Responses 的 `max_output_tokens`，以免影响上游路由倾向。
- 流式 `usage.cost` 若存在，会覆盖基于目录的成本估算。

### Vercel AI Gateway \{#vercel-ai-gateway}

- 路由偏好放在 `providerOptions.gateway.only` 和 `providerOptions.gateway.order` 下。
- Chat Completions 自动缓存使用 `providerOptions.gateway.caching`。
- Responses 使用顶层 `caching: "auto"`、可选的 `cache_anchor_items` 和 `cache_ttl`；`1h` TTL 需要长缓存保留能力。
- 不要复用 OpenRouter 的 `provider` 对象。

### Alibaba Coding Plan \{#alibaba-coding-plan}

- API 密钥字节可能是携带 `{ token, enterpriseUrl }` 的 JSON。
- 认证和基础 URL 解析是提供方特定的。

### Alibaba Token Plan \{#alibaba-token-plan}

- 使用专用 Token Plan 凭据，而不是回退到通用的 `OPENAI_API_KEY`。
- 结构化凭据可以同时提供令牌及其区域基础 URL。
- 将它与 Alibaba Coding Plan 的企业 URL 编码分开。

### Amazon Bedrock Mantle \{#amazon-bedrock-mantle}

- 使用带有 AWS 自有认证的 OpenAI Responses，而不是 Converse 协议。
- 接受 Bedrock bearer 令牌或经签名的 AWS 凭据链请求。
- 注册表中的已认证哨兵是来源标记，不是要转发到端点的 bearer 凭据。

### Kimi Code \{#kimi-code}

- OpenAI 兼容路径需要通用 Kimi 标头。
- 它也参与 OpenAI/Anthropic 双接口垫片。

### ClinePass \{#clinepass}

- 请求携带官方 Cline CLI 客户端身份（`X-CLIENT-TYPE`、`X-CLIENT-VERSION`、`X-PLATFORM`、`X-CORE-VERSION`、`User-Agent` 及相关标头）。推理还将 OMP 的稳定会话键作为 `X-Task-ID` 携带；账户和发现调用省略它。这是受 Cline 门控的名单条目所支持的标识契约。
- 公共目录 ID 省略网关的 `cline-pass/` 命名空间；Chat Completions 在传输时添加它。免费层级 ID 保留完整的 OpenRouter 风格命名空间，因为网关收到的已经是传输形式。
- 公共 `recommended-models` 端点是成员资格的权威来源。必需的 `clinePass` 桶提供订阅模型，可选的 `free` 桶提供免费模型。订阅桶缺失或没有有效 ID 时会被拒绝，以保留生成的回退；无效的单个条目会被跳过。
- 已知 ID 使用 Cline 编写的元数据快照，获取精确限制、订阅价格、输入模态和推理控制。未知 ID 从捆绑的上游参考和实时 OpenRouter 元数据中丰富信息，之后回退到保守限制，不编造推理控制。
- 订阅模型显示 Cline 的 API 等效标价，但流式 `usage.cost` 才是实际计费/折后费用的权威值。免费层级模型保持真正的 $0。
- 推理取决于具体模型：推理强度模型只发送其声明的传输档位，Qwen3.7 Plus 将 OMP 推理强度映射到 Cline 嵌套的 `reasoning.max_tokens` 预算，而在 Cline 声明开关的地方，关闭思考会发送 `reasoning: { enabled: false }`。
- Cline 托管的 Qwen 和 Anthropic 路由接收 Anthropic 风格的临时缓存断点。所需推理历史在助手 `reasoning` 中重放；传入推理文本从 `delta.reasoning` 读取。
- 登录通过 `/users/me` 验证密钥，不进行补全探测，也不消耗订阅配额。它不证明可以访问名单中的每个模型。
- 订阅窗口耗尽（`clinepass limit`）和免费层级上限（`free limit reached on model ...`）归类为用量限制。名单轮换和账户策略错误会获得提供方特定的恢复指引。
- 仪表板的 `/users/me/plan/usage-limits` 路由接受推理 API 密钥，并报告五小时、每周和每月使用率；`/users/me` 提供账户标签。用量报告不需要账户 OAuth。

### Command Code \{#command-code}

- 运行时 API 路由来自 `rules/runtime/behavior.kdl`：Claude ID 使用 Anthropic Messages，列出的 GPT ID 使用 Responses，其他 ID 使用 Chat Completions。
- 公共模型列表不携带推理/模态契约。经审查的推理强度阶梯、价格、模态和限制来自 `providers/commandcode.kdl`，而不是其他主机上同 ID 的模型。
- Responses 拒绝具名对象 `tool_choice`；只保留请求的函数，并发送 `"required"`。托管网页搜索可用，但未启用托管图像生成。
- `typesafe/jev` 是基于 System One 端点的独立 `judge` 运行器。

### Fireworks 和 Firepass \{#fireworks-and-firepass}

- 传输模型 ID 需要提供方特定的映射。
- 合并额外请求体字段后，如果同时存在 DeepSeek 风格的 `thinking` 和 OpenAI 风格的 `reasoning_effort`，Fireworks 可能发生冲突。

## 3. 按方言序列化请求参数 \{#3-serialize-request-parameters-by-dialect}

添加或转发字段前，请检查以下内容：

- **模型 ID。**某些模型根据推理强度解析传输 ID。ClinePass、Firepass 和 Fireworks 会转换 ID。OpenRouter 后缀处理会识别路径段。
- **最大输出 token。**即使调用者未设置，Kimi 系列模型也可能需要最大 token 字段。OpenRouter 应省略目录默认值，除非显式指定，但 `alwaysSendMaxTokens` 要求上限时除外。Codex 丢弃调用者上限。Responses 使用 `max_output_tokens`；Chat Completions 使用 `max_tokens` 或 `max_completion_tokens`。`omitMaxOutputTokens` 为上游限制未知的代理抑制上限；否则应用模型和提供方限幅。
- **服务层级。**Completions、Responses 和 Codex 都处理服务层级，但允许值和定价不同。使用解析后的 `model.serviceTierCost` 元数据，而不是模型名称定价分支。OpenAI Responses 回退到 Flex 0.5×/Priority 2×；Codex 将未定价层级保留为 1×。
- **提示缓存/会话。**OpenAI Responses 使用 `prompt_cache_key`。OpenRouter Responses 使用 `session_id`。Codex 将提示缓存/会话 ID 用作传输状态。Anthropic 风格的缓存控制需要文本部分上的 `cache_control`。
- **有状态链接。**官方 OpenAI Responses 可能默认链接。第三方端点通常不应如此。Codex 只在 websocket `response.create` 上链接。

## 4. 显式映射推理和思考 \{#4-map-reasoning-and-thinking-explicitly}

推理字段不可互换。

### OpenAI 风格的 `reasoning_effort` \{#openai-style-reasoning_effort}

- 推理强度值来自兼容性/模型元数据。
- 如果推理已禁用，但主机没有真正的关闭开关，则映射到最低支持强度，而不是编造不受支持的值。

### Responses `reasoning` \{#responses-reasoning}

- 使用 `reasoning: { effort, summary }`。
- 可以包含 `reasoning.encrypted_content` 用于重放。
- xAI Grok 模型可能要求省略 `reasoning.effort`。
- 当模型具有 `requiresReasoningOffJuiceInstruction`（GPT-5.6+ 类策略）且设置了 `forceReasoningOff` 时，会追加末尾 developer 条目 `# Juice: <N> !important`，其中 `N` 从请求的推理强度映射（`none`→0、`minimal`→2、`low`→4、`medium`→8、`high`→48、`xhigh`→112、`max`→960；默认 8），见 `packages/ai/src/providers/openai-shared.ts` 中的 `getJuiceValue` 和 `packages/ai/src/providers/openai-responses.ts` 中的 `forceReasoningOff` 路径。

### 对话中稳定的推理强度 \{#conversation-stable-effort}

对于具有 `supportsConfigurationUpdate` 的模型（目前为 GPT-6 Astra），Responses 和 Codex 保留对话的请求级推理强度，并将后续更改编码为 `configuration_update` 输入条目。这需要会话身份和提供方会话状态；独立请求直接发送自己的推理强度。Codex 上下文压缩绕过此策略。

### OpenRouter `reasoning` \{#openrouter-reasoning}

- 使用嵌套的 `reasoning: { effort }`。
- 禁用推理必须发送 `reasoning: { enabled: false }`；否则 OpenRouter 可能让推理模型默认进入思考。

### Z.AI / GLM \{#zai--glm}

- 使用 `thinking: { type: "enabled" }` 或 `thinking: { type: "disabled" }`。
- GLM 5.2 推理强度模型也可能接收 `reasoning_effort`。
- Chat Completions 只有在存在工具且解析后的兼容性启用 Z.AI 推理强度方言时，才生成 `tool_stream: true`。

### Qwen \{#qwen}

- 一种方言使用顶层 `enable_thinking`。
- 另一种使用 `chat_template_kwargs.enable_thinking`；不要把顶层字段泄漏到严格的 NIM/vLLM/SGLang 请求模式中。
- 本地 Qwen 重放还可能要求 `preserve_thinking`。具有 `qwenTemplateReasoningEffort` 的模型会将推理强度映射到模板 kwargs 中（只有兼容方言才同时使用顶层字段）。

### Anthropic 兼容格式 \{#anthropic-compatible-format}

- 使用模型本身的思考模式：预算思考、自适应思考，或预算加推理强度。不要把所有模型都映射为固定 token 预算。
- 自适应思考使用 Anthropic 的 `thinking` 和 `output_config.effort`，而不是 OpenAI 风格的 `reasoning_effort`。
- 关闭思考并不一律等于 `thinking.type: "disabled"`：具有 `supportsBetweenToolsThinking` 的模型使用 `"between_tools"`；仅支持自适应思考的模型则省略 thinking 字段，并使用低推理强度。

### DeepSeek 推理历史 \{#deepseek-reasoning-history}

- DeepSeek 兼容的推理模型可能要求精确重放 `reasoning_content`。
- 某些变体要求在每个助手轮次中重放，而不只是工具调用轮次。
- Kimi/OpenRouter 风格兼容可以接受合成的 `"."` 占位符，但 DeepSeek V4 的精确重放不能接受。

### 推理与工具选择的组合 \{#reasoning-plus-tool-choice}

- DeepSeek 推理模型可能在启用思考时拒绝 `tool_choice`。
- Kimi 可能在启用思考时拒绝强制工具选择。
- 兼容层需要支持两种策略：对任意工具选择禁用推理，以及仅对强制工具选择禁用推理。

### 通过 Responses 使用 xAI Grok（`xai` 和 `xai-oauth`） \{#xai-grok-through-responses-xai-and-xai-oauth}

付费 API 密钥提供方（`xai` / `XAI_API_KEY`）和 SuperGrok OAuth（`xai-oauth`）均通过 `https://api.x.ai/v1/responses` 聊天。以下要求应保持相互独立：

- 省略 `reasoning.effort`，除非模型位于支持推理强度的 Grok 允许列表中
- 省略 `reasoning.summary`（宿主会拒绝它；不要回退为 `"auto"`）
- 省略存在惩罚和频率惩罚（`/v1/responses` 对每个 Grok 模型都会拒绝它们）
- 在请求中包含 `reasoning.encrypted_content`
- 在后续轮次中重放加密的推理条目

某些模型只会拒绝上述字段中的一个；不要把这些要求合并为单一的“Grok 模式”分支。

## 5. 按端点规范化工具和模式 \{#5-normalize-tools-and-schemas-per-endpoint}

### 严格工具 \{#strict-tools}

严格模式不是普遍具备的能力：

- 某些提供方支持严格工具
- 某些提供方拒绝混合使用严格与非严格工具
- 某些提供方拒绝经过严格化的模式
- OpenRouter Anthropic 模型可能因“compiled grammar too large”而失败

不使用严格模式重试，应当是一种作用于当前会话/提供方路径的兼容恢复策略。

### Responses 和 Codex 自定义工具 \{#responses-and-codex-custom-tools}

Responses 和 Codex 都支持用于 `apply_patch` 的自由格式自定义语法工具。自定义语法工具不会强制设置请求级 `parallel_tool_calls`。Codex 的 `responsesLite` 会强制关闭并行调用，将声明移入前置的 `additional_tools` developer 条目，把 instructions 移入行内，并移除顶层 `tools`/`instructions`。具名函数选择和 computer 选择会隔离所选声明，并使用 `"required"`；其他托管工具选择会变为 `"auto"`。Responses 还会：

- 以不同方式清理模式
- 隔离存在无效 enum/const 矛盾的模式
- 将孤立的工具输出修复为助手说明
- 为孤立的工具调用合成占位输出

Codex 在发送前会应用自己的请求转换。

### 工具选择 \{#tool-choice}

输出 `tool_choice` 前：

- 确认端点支持它
- 如果不支持强制选择，将强制选择降级为 `auto`
- 未输出任何工具时，移除 `tool_choice: "none"`
- 如果被强制选择的具名工具已被筛除，移除该具名工具的强制选择
- 不支持具名对象但支持 `"required"` 时，先将输出的工具收窄到所指定的函数，再使用 `"required"`；否则其他工具也可能满足强制选择要求

### 通过 Chat Completions 代理传递 Anthropic 历史 \{#anthropic-history-through-chat-completions-proxies}

- 如果历史包含工具调用/结果，且 `context.tools` 未定义，则发送 `tools: []` 作为哨兵值。
- 如果 `context.tools = []`，则视为显式退出，不输出哨兵值。

### Mistral / Devstral \{#mistral--devstral}

- 工具调用 ID 必须恰好由9个字母或数字组成。
- 某些流程需要在工具结果之后、下一条用户消息之前，插入合成的助手桥接消息。

### 自定义工具输出 \{#custom-tool-outputs}

Responses/Codex 必须记住调用是否为 `custom_tool_call`；如果是，配对输出必须为 `custom_tool_call_output`，而不是 `function_call_output`。

### 原生 computer 工具 \{#native-computer-tools}

Responses 和 Codex 将受支持的原生 computer 工具序列化为 `{ type: "computer" }`，并保留原生调用/结果元数据以供重放。不支持的模型则将提供的 computer 工具作为普通函数使用。Azure Responses 有自己的序列化器；它不能继承通用 Responses 适配器接受的所有原生工具。

### MiniMax 兼容的流式参数 \{#minimax-compatible-streaming-arguments}

工具参数可能以对象而不是 JSON 字符串的形式流式传输。应深度合并对象增量，然后输出一个最终的、可安全拼接的 JSON 增量。

## 6. 安全转换消息并重放历史 \{#6-convert-messages-and-replay-history-safely}

- **System/developer 角色。** 推理模型可能要求使用 `developer`。不支持该角色的宿主应使用其支持的 system 角色策略，而不是无条件降级为 `user`。某些宿主会拒绝多条 system 消息，需要将其合并。
- **Responses 系统提示词。** Responses 通常使用顶层 `instructions`。支持 `developer` 的推理模型会将系统提示词以内联 developer 消息的形式放入消息中。
- **助手内容。** 某些 OpenAI 兼容后端会原样映射数组内容，因此会将助手内容规范化为字符串。工具调用重放可能要求使用 `content: ""` 或 `content: "."`，而不是 `null`。
- **思考重放。** 某些模型要求将思考作为可见文本。另一些需要提供方特有的推理字段。某些允许合成占位符，另一些则要求精确重放。
- **视觉。** 如果模型/提供方不能接受图像，应将输入图像及工具结果图像转换为占位符。某些 Qwen/Dashscope 兼容模式即使高层模型为多模态，也只支持文本。
- **原生 Responses 历史。** 原生提供方载荷的重放与模型绑定。应剥离或规范化外来推理签名。共享代码会规范化 Responses 以竖线分隔的工具 ID、对外来条目 ID 进行哈希，并可筛除推理历史。

## 7. 按提供方行为解码流，而不只看模式 \{#7-decode-streams-by-provider-behavior-not-just-schema}

- **通用 OpenAI 兼容流。** 保活块、仅含角色的增量和空的 `choices: []` 都不算进展。空闲看门狗不能因为这些内容而永远不触发。
- **Mistral Medium 3.5 风格内容。** `delta.content` 可以是由文本片段构成的数组/对象，而不是字符串；应将其规范化为文本。
- **通过 NVIDIA/原生端点/代理使用 DeepSeek。** 某些端点会将 `<｜...｜>` 一类聊天模板标记泄漏到可见内容中。必须进行缓冲，因为标记可能跨块拆分。
- **DeepSeek/模板泄漏工具调用。** 某些提供方在生成结构化工具调用的同时，还会在文本中泄漏工具调用标记。标记修复应属于流解码器策略，而不是端点业务逻辑。
- **MiniMax-M3 累积推理。** 推理增量可能是累积快照。按推理字段签名去重。
- **Responses 流。** 按 `output_index`、`item_id`、call-id 别名及带前缀的 `fc_` 别名路由并行条目。容忍缺少 `content_part.added` 或 `output_item.added`。在终结事件处完成待处理工具调用。
- **终结行为。** Chat Completions 可以在收到 `finish_reason` 加用量后结束。Responses 在 `response.completed`、`response.incomplete` 或 `response.done` 时结束。带有 `stop` 的工具调用会提升为 `toolUse`；因 token 上限截断但可执行的调用，也可从 `length` 提升。如果没有适用的工具提升，Codex/Responses 的 `end_turn:false` 会设置 `stopDetails: { type: "pause_turn" }`，同时保留 `stopReason: "stop"`。Responses 托管网络搜索在没有可见回答时也会暂停轮次。
- **Ollama 长度失败。** 没有可见内容的 `finish_reason: length` 会被视为上下文窗口失败，并映射为错误。

## 8. 保留用量和计费语义 \{#8-preserve-usage-and-cost-semantics}

- OpenRouter 的 `prompt_tokens_details.cache_write_tokens` 采用不同计费方式：将其从输入 token 中扣除，并作为缓存写入用量输出。
- DeepSeek 原生的 `prompt_cache_miss_tokens` 是计费输入部分，而不是单独的缓存写入费用。不要重复计数。
- 填充或替换用量时，必须保留 GitHub Copilot 的 `premiumRequests`。
- OpenRouter 和 ClinePass 返回的 `usage.cost` 是权威值；应保留它，而不是用目录估算值替换。
- 服务层级定价使用响应回显的实际服务层级，只有缺少该值时才回退到请求值。标准 Responses 只调整 `openai` 提供方；Codex 使用自己解析出的计费元数据。

## 9. 在正确边界实现恢复 \{#9-implement-recovery-at-the-right-boundary}

- **严格工具回退。** `400`/`422` 模式或严格工具失败，应在适当的会话作用域内禁用严格工具，并以非严格模式重试。
- **OpenAI Responses 有状态回退。** 过期、无效或不受支持的 `previous_response_id` 会重置链状态，并携带完整上下文重试。零数据保留会立即禁用链式关联。
- **Codex websocket 回退。** 连接错误、过期套接字、连接上限或重试预算耗尽，都可能触发重新连接或 SSE 重放。已完成的工具调用一旦到达消费方，就拒绝重放；部分输出受特定传输的缓冲/重放规则约束。
- **Codex 空白工具循环熔断器。** Codex 可能无限地流式发送仅含空白的工具调用参数增量。应限制事件数/字符数，丢弃退化的部分工具调用，并且仅在安全时重试。
- **Codex `previous_response_id` 回退。** 过期或不受支持的 ID 会使链断开并使用完整上下文重试，但这仅适用于 websocket，因为 SSE 从不建立链式关联。
- **Responses 瞬态流重试。** 只在尚未观察到不安全重放输出时，重试不完整或瞬态失败的流；一旦尝试已提交，就保留部分输出并失败。
- **产生内容前的提供方重试。** Codex 只在已输出的文本/思考或已完成工具调用尚未提交本次尝试之前，重试可重试的提供方流错误。原始增量一经输出，即使只是空白也算。

## 10. 新约束检查清单 \{#10-checklist-for-a-new-constraint}

添加分支或兼容字段前，依次回答：

1. 这是端点族行为、网关行为、模型行为，还是请求上下文行为？
2. 能否用已有的 `compat` 元数据表示？
3. 如果不能，新兼容字段是否优于按提供方名称分支？
4. 该字段需要提供方级默认值、模型级覆盖，还是两者都需要？
5. 它是否与工具、图像、推理、有状态 Responses 链或服务层级相互影响？
6. 是否只能在出现可见文本/工具调用之前重试？
7. 用量核算是否仍保留缓存读取/写入、计费输入、服务层级倍数，以及提供方特有计数器，例如 Copilot 的 `premiumRequests`？
