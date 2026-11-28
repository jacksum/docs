---
title: "模型与模型提供方配置（models.yml / models.yaml）"
description: "Oh My Pi 官方仓库文档：模型与模型提供方配置（models.yml / models.yaml）。"
---

# 模型与模型提供方配置（`models.yml` / `models.yaml`） \{#model-and-provider-configuration-modelsyml--modelsyaml}

本文介绍 coding-agent 当前如何加载模型、应用覆盖项、解析凭据，以及在运行时选择模型。

## 什么控制模型行为 \{#what-controls-model-behavior}

主要实现文件：

- `packages/coding-agent/src/config/model-registry.ts`：加载内置 + 自定义模型、模型提供方覆盖项、运行时发现、身份验证集成
- `packages/coding-agent/src/config/model-resolver.ts`：解析模型匹配模式并选择初始/smol/slow 模型
- `packages/coding-agent/src/config/model-settings.ts`：模型选择设置（`modelRoles`、`enabledModels`、`disabledProviders`、`modelProviderOrder`、`cycleOrder`）
- `packages/coding-agent/src/session/settings.ts`：模型提供方传输偏好（`providers.*`）
- `packages/coding-agent/src/config/models-config.ts` 和 `models-config-schema-bundle.ts`：自定义模型提供方/模型验证
- `packages/coding-agent/src/session/auth-storage.ts`：从 `@oh-my-pi/pi-ai` 重新导出 `AuthStorage`；凭据优先级在 `packages/ai/src/auth/cascade.ts` 中实现
- `packages/catalog/src/compat/resolve.ts` 和 `compat/rules/`：兼容性和模型策略解析
- `packages/catalog/src/models.ts` 和 `packages/catalog/src/types.ts`：内置模型提供方/模型和公共模型类型

## 配置文件位置与旧版行为 \{#config-file-location-and-legacy-behavior}

默认配置档案的配置路径，按优先级排列：

- `~/.omp/agent/models.yml`
- `~/.omp/agent/models.yaml`

这些路径相对于 `getAgentDir()` 返回的当前智能体目录。具名配置档案使用
`~/.omp/profiles/<name>/agent/`；`PI_CONFIG_DIR` 更改配置根目录名称，
`PI_CODING_AGENT_DIR` 可覆盖默认配置档案的智能体目录。以编程方式传入的
`ModelRegistry` 路径会覆盖根据目录派生的位置。

仍然存在的旧版行为：

- 如果两个 YAML 文件都缺失，但同一位置存在 `models.json`，则将其迁移为 `models.yml`。
- 以编程方式传入 `ModelRegistry` 时，仍支持显式的 `.json` / `.jsonc` 配置路径。

## `models.yml` / `models.yaml` 结构 \{#modelsyml--modelsyaml-shape}

```yaml
providers:
   <provider-id>:
      # provider-level config
```

`provider-id` 是模型选择和身份验证查找中统一使用的规范模型提供方键。

`providers` 是注册表使用的唯一根键。当前配置模式不会拒绝未知根键，但它们不会配置模型行为。

## 模型提供方级字段 \{#provider-level-fields}

```yaml
providers:
   my-provider:
      baseUrl: https://api.example.com/v1
      apiKey: MY_PROVIDER_API_KEY
      api: openai-completions
      headers:
         X-Team: platform
      authHeader: true
      auth: apiKey
      disableStrictTools: false # set true for Anthropic-compatible endpoints that reject the strict field
      discovery:
         type: ollama
         timeoutMs: 10000 # optional per-provider HTTP probe timeout in milliseconds
      modelOverrides:
         some-model-id:
            name: Renamed model
      models:
         - id: some-model-id
           name: Some Model
           api: openai-completions
           reasoning: false
           input: [text]
           imageInputDecoder: stb # local STB decoder; OMP converts WebP before dispatch
           cost:
              input: 0
              output: 0
              cacheRead: 0
              cacheWrite: 0
           contextWindow: 128000
           maxContextWindow: 256000 # optional extended-context window
           maxTokens: 16384
           headers:
              X-Model: value
           compat:
              supportsStore: true
              supportsDeveloperRole: true
              supportsReasoningEffort: true
              maxTokensField: max_completion_tokens
              openRouterRouting:
                 only: [anthropic]
              vercelGatewayRouting:
                 order: [anthropic, openai]
              extraBody:
                 gateway: m1-01
                 controller: mlx
```

`maxContextWindow` 在 `models` 条目和 `modelOverrides` 上均可用。
将 `contextWindow` 设为常规提示词窗口，将 `maxContextWindow` 设为
模型提供方接受的更大提示词窗口。`/extended-context on` 选择
更大窗口；`off` 恢复常规窗口。只指定
`contextWindow` 的覆盖项在两种模式下都保持固定，与之前一样。这改变的是 OMP 的
本地上下文预算，而非模型提供方的服务端限制；请确认端点
接受配置大小的请求。
配置的最大值不会取代模型提供方公布的容量。受目录覆盖上限
约束的模型（如 Codex Astra）仍会限制在该上限内。
在选择扩展窗口前，会先解析逐模型覆盖项，
包括已停用的变体别名。

自定义 `models` 条目可设置自身的 `baseUrl`；否则继承模型提供方 URL。
对于内置模型，模型提供方 `baseUrl` 覆盖项的作用域限定为继承该 URL 的自定义模型
所使用的实际 API，或在仅含覆盖项的配置中限定为模型提供方的 `api`。若两种
作用域均不存在，则应用于整个模型提供方。`transport: pi-native` 始终将网关 URL 应用于整个模型提供方。
无作用域限定的 OpenRouter `baseUrl` 指定 `/api/v1` 聊天根地址，因此 OpenRouter Decisions（评判）
模型使用同一主机上的同级 `/api/alpha`，例如 `.../api/v1` 中继在
`.../api/alpha/decisions` 提供评判服务。

`omitMaxOutputTokens` 省略从模型派生的输出上限。

语音（`openai-speech`/`xai-tts`）模型接受 `voice`，当 `tts` 工具或语音播报器未指定声音时发送它（某些 OpenAI 兼容网关，如 Bifrost，会对未指定声音的语音请求返回 400 `voice is required`），还接受 `speechFormats`，表示端点仅返回的容器格式（`mp3`、`wav`、`pcm`、`opus`、`aac`、`flac`；未设置表示任意格式）。向仅支持 WAV 的模型请求 MP3 时，实际会改为请求 WAV，`tts` 工具则写入同级 `.wav` 文件：

```yaml
providers:
  my-gateway:
    baseUrl: https://gateway.example.com/v1
    api: openai-completions
    apiKey: GATEWAY_API_KEY
    models:
      - id: gemini/gemini-2.5-flash-preview-tts
        api: openai-speech
        voice: kore
        speechFormats: [wav]
```

`compat.base64SkipThoughtSignature`（Google API，默认为 `false`）：将无签名工具调用的绕过哨兵值以 base64 编码发送。如果某个网关将 `thoughtSignature` 按 base64 解码，并对原始的 `skip_thought_signature_validator` 字面量返回 400，则为该网关后方的 `google-generative-ai` 模型设置它，例如 Gemini 重放其他模型的工具调用历史时：

```yaml
providers:
   my-gemini-gateway:
      baseUrl: https://gateway.example.com/gemini/v1beta
      api: google-generative-ai
      models:
         - id: gemini-3.8-flash
           compat:
              base64SkipThoughtSignature: true
```

### 标准 Responses WebSocket \{#standard-responses-websockets}

标准 Responses 默认使用 HTTP/SSE，官方 OpenAI
端点也是如此。若要从 OMP 中启用，请在 `config.yml` 中设置：

```yaml
providers:
  openaiResponsesWebsockets: true
```

目录中的 `supports-websockets` KDL 规则标记的是能力，而非启用状态。
它涵盖 OpenAI `openai-responses`，包括继承该
模型提供方类型的自定义模型提供方。Copilot、OpenRouter 和其他未标记的模型提供方/API 组合
仍使用 HTTP/SSE。独立的 `providers.openaiWebsockets: auto|off|on` 设置
和 `PI_CODEX_WEBSOCKET` 继续仅控制 Codex。

模型和请求中的 `preferWebsockets` 只能收紧 OMP 的设置：**任一方显式
设为 `false` 都会禁用 WS**，即使另一方为 `true`。关闭该设置后无法
被覆盖。独立的 pi-ai SDK 调用方不依赖 OMP 设置：它们
必须在请求或模型上显式设为 `true` 才能启用；任一方为 `false` 仍可否决。

对于支持程度不一致的网关，保留 `models.yml` 中现有的模型提供方条目，
并为受影响的模型禁用 WS：

```yaml
providers:
  openai:
    api: openai-responses
    baseUrl: https://gateway.example.com/v1
    modelOverrides:
      gpt-5:
        preferWebsockets: false
```

自定义 `models` 条目接受相同的布尔值。WS 使用现有的 `/responses`
端点和身份验证；网关必须实现 `response.create`。
SDK 的 `fetch` 覆盖影响 HTTP/SSE，不影响套接字。显式启用 WS 会使套接字
绕过该 HTTP 覆盖；HTTP 回退仍使用它。

载荷构造和 `onPayload` 发生在连接之前，已取消的
请求也不例外。发送前握手网络故障、连接超时或升级响应
404/405/426/501 会按正常的存储/链式调用
规则重新构建完整 HTTP 候选请求，并再次调用 `onPayload`。钩子可以替换每个候选请求；它
看不到最终的套接字本地增量。其他升级状态保留正常的错误
分类。诊断保留状态和可用响应头，而不是缓冲的
升级拒绝响应体。

握手头可用时，`onResponse` 会报告一次物理 WS
握手，并标记 `metadata.transport="websocket"` 和
`metadata.phase="handshake"`。复用套接字不会再次发出握手。
这些不是逐次生成的响应头；不会虚构生成请求 ID。
当响应元数据使传输可观测时，`omp bench --json` 会包含该传输。
标准 WS 缓存基准仍测量生成用量，但
无法声称具有逐次生成的请求 ID 或 HTTP 响应缓存头。

保留且健康的套接字可发送增量 `previous_response_id` 轮次，
包括在 `store: false` 时。历史/选项变更、凭据变更、并发
临时套接字，或在**30 秒空闲限制**后替换套接字，均要求
提供完整输入，不带旧套接字的锚点。继续调用遵循与 HTTP 链式调用相同的禁用方式：
`statefulResponses: false`、`PI_OPENAI_STATEFUL=0`，或模型的
`compat.statefulResponses: false` 会在每个 WS 轮次发送完整历史，因此对
忽略 `previous_response_id` 的网关应设置该兼容标志。连续三次
过期锚点拒绝会使该逻辑会话停止发送锚点。官方 HTTP
本就可以独立于套接字生命周期使用已存储的有状态链式调用；因此 WS
并不保证在该场景节省流量或降低延迟。

注入的 `previous_response_id` 和 `background: true` 会被拒绝。明确的
首帧过期锚点拒绝允许在出现生成证据之前，在同一个
健康套接字上重发一次完整历史。WS 不继承 HTTP 的瞬时错误、
恢复或空补全重试；成功但为空的 WS 响应只提交一次。

在发送结果不确定后，传输故障或流超时会使调用失败，
不会暗中通过 HTTP 重放。部分输出仍然可用；现有的智能体
恢复机制可能按其自身规则开始 SSE 续接，保留已完成的
工具结果，并且绝不执行不完整的参数。调用方中止和协议/
队列错误不会将传输标记为不兼容。

升级拒绝（404/405/426/501）或发送后传输故障会使
SSE 降级对该逻辑会话、端点和模型持续生效，直到
`releaseSession`/模型提供方状态的 `close` 或新作用域出现。发送前网络故障或
连接超时仅对该次请求回退；第二次连续发生则变为
持续降级，而完成一次 WS 交互会重置计数。保留模型提供方
状态的嵌入式调用方必须释放已完成的会话。没有逻辑会话 ID 的调用不
共享持续降级状态；没有 `providerSessionState` 时，该状态只持续到本次调用结束。
正常的空闲退役不属于降级。Codex 的协议和恢复机制保持
独立。

### Bedrock 请求选项 \{#bedrock-request-options}

模型提供方级的 `guardrailIdentifier`、`guardrailVersion` 和 `guardrailTrace` 为
Converse 请求附加防护栏。设置了标识符时，版本默认为 `"DRAFT"`；trace 接受
`enabled`、`disabled` 或 `enabled_full`。`requestMetadata` 提供调用日志标签。无效
条目和超出 Bedrock 16 个条目上限的条目会在分发前丢弃；逐请求标签
覆盖匹配的模型标签。这些字段不会配置 Anthropic Messages 路由。

### 上下文压缩选项 \{#compaction-options}

- `compactionModel`（逐模型，包括 `modelOverrides`）：首选上下文压缩模型，在当前模型、聊天角色候选项和最大上下文回退项之前尝试。它不会切换当前对话模型。
- `remoteCompaction`（模型提供方级或逐模型）：让符合条件的模型启用模型提供方原生上下文压缩。支持的键：`enabled`、`api`、`endpoint`、`model`、`v2StreamingEnabled`、`v2Endpoint`、`streamingEndpoint`。模型提供方级设置是基线；逐模型键覆盖它们。

### 允许的模型提供方/模型 `api` 值 \{#allowed-providermodel-api-values}

- `openai-completions`
- `openai-responses`
- `openai-codex-responses`
- `azure-openai-responses`
- `anthropic-messages`
- `bedrock-converse-stream`
- `google-generative-ai`
- `google-vertex`
- `typesafe`
- `openrouter-decisions`
- `openai-decisions`
- `google-decisions`
- `workers-ai-systemone`

`typesafe`、`openrouter-decisions`、`openai-decisions`、`google-decisions` 和 `workers-ai-systemone` 是判断 API，而非聊天传输：声明为其中一种的模型响应判断请求，并由 `judge` 模型角色选择。`typesafe` 将 TypeSafe 的 System One 请求体 POST 到 `{baseUrl}/v1/systemone`（任意 System One 服务器：TypeSafe、OpenJEV、Kev、自托管 Clef）；`openrouter-decisions` 将相同请求体 POST 到 `{baseUrl}/decisions`；`openai-decisions` 将问题和答案转换为 OpenAI 的 Decisions API 格式，发到 `{baseUrl}/decisions`（内置的 `openai/gpt-6-luna-decisions` 条目在线上传输时发送的模型为 `gpt-6-luna`）；`google-decisions` 将它们转换为 Google 的 Gemini Decisions API 格式，发到 `{baseUrl}/decisions`，密钥放在 `x-goog-api-key` 中（内置的 `google/gemini-decision-1` 条目）；`workers-ai-systemone` 将 System One 请求体 POST 到 Cloudflare Workers AI 的 `{baseUrl}/{model id}`，其中基 URL 中的 `<account>` 由已存储凭据的账户 ID 或 `CLOUDFLARE_ACCOUNT_ID` 填入。其 `headers` 为这些流量携带网关路由或自定义身份验证头。
判断请求可与视觉聊天请求共享图像附件。原生 OpenAI Decisions、Gemini Decisions、TypeSafe Jev、OpenRouter Jev 和 Workers AI 评判模型，以及通过提示词驱动的视觉聊天模型均支持图像；图像请求会跳过纯文本候选项。`Judge.supportsImages` 标识兼容候选项，没有可处理图像模型的评判链会明确失败，而不是丢弃图像。通过提示词驱动的判断会针对所选候选项规范化图像，包括放大尺寸不足的栅格图，以及为使用 STB 解码器的模型转换 WebP；原生评判模型继续接收原始图像字节。直接为 System One 构造 `NativeJudge` 时，设置 `supportsImages: true`；`createNativeJudge` 从目录推导此标志。

基于目录的原生评判模型应用所选模型的图像边界。直接使用 `NativeJudge` 构造函数时，可显式提供 `imageInput` 边界；启用图像并不会让不相关的 System One 模型继承 Jev 的尺寸限制。

`openrouter-decisions` 评判模型与 OpenRouter 聊天模型一样，在任何基 URL 下都遵循模型的 `compat.openRouterRouting` 和 `compat.extraBody`：路由（包括 `@provider` 选择器固定项）成为请求的 `provider` 字段，然后将 `extraBody` 合并到请求体之上。`openRouterRouting` 仅接受 `only` 和 `order`；对于其他[模型提供方偏好](https://openrouter.ai/docs/provider-routing)，如 `allow_fallbacks` 或 `data_collection`，请在 `extraBody` 中设置完整的 `provider` 对象，它会替换路由块。其他判断 API 忽略这两个键。

```yaml
providers:
   openrouter:
      modelOverrides:
         typesafe/jev-1.14:
            compat:
               extraBody:
                  provider: { only: [typesafe], allow_fallbacks: false, data_collection: deny }
```

OpenAI Decisions 转发嵌入的 `ImageContent.detail`，不同的显式保真度设置保留独立的原生图像判断缓存条目。TypeSafe Jev 没有等效的图像细节字段：在线传输和缓存标识中都会忽略 detail，因此仅 detail 不同的请求可以复用答案。省略 detail 和显式 `auto` 共享默认设置。

图像输入会在任何候选项运行前验证；格式错误的图像作为调用方错误失败，而不是耗尽整条链。模型提供方可能施加额外限制。Workers AI Clef 最多接受 4 张 PNG、JPEG 或 WebP 图像，每张最大 4 MiB、16 MP，总计 8 MiB。有效的带填充和不带填充 base64，以及不同大小写的 MIME 形式，共享同一个缓存标识。

图像过滤后，采用与文本判断相同的仅原生尾部策略：失败的原生评判模型可以转到另一个兼容的原生评判模型，绝不会转到通过提示词驱动的聊天模型。过滤会移除不支持图像的原生模型，以及请求超出其图像数量上限的原生模型，因此当没有兼容的原生模型留下时，符合条件的提示词驱动候选项和支持视觉的会话模型回退项仍可作答。尺寸边界从不用于过滤原生模型：每张图像都会先适配到这些边界内（见下文）。

#### Jev 图像（实验性） \{#jev-images-experimental}

Jev 的原生图像判断功能处于实验阶段。直接 TypeSafe Jev 支持 `jev-latest`、`jev-preview`、`jev-1.13.0` 和 `jev-1.14.0`（默认 `judge` 角色使用 `typesafe/jev-1.14.0`；`jev-latest` 是 TypeSafe 的稳定别名，自 2026-10-22 起提供 `jev-1.14.0`）。OpenRouter 支持 `typesafe/jev-1.13`、`typesafe/jev-1.14` 和 `~typesafe/jev-latest`。

图像会加入 `state`，而不会替换它：对象根保留其字段，并在避免冲突的 `__omp_judgment_images` 键下添加图像（如果键已被占用，则加上数字后缀）；数组根在末尾添加图像；字符串根变为 `[original, ...images]`。直接 TypeSafe 请求将每张图像添加为一个被引用的 `assets` 条目，并将其引用放入 `state`，在附加图像时才设置 `TypeSafe-Danger-Zone-Images: true`；调用方提供的资产（认证网关）必须分别在 `state`、`instructions` 或 `criteria` 中被引用，每个拆分请求只携带它所引用的资产。OpenRouter 将每张图像编码为 `image_url` 数据 URL 部分，不使用 TypeSafe 请求头，也不使用顶层 `images` 字段。

纯文本请求保留其原始请求形状和字节。图像支持限于所列的 TypeSafe Jev 和 OpenRouter Jev 模型；这不意味着支持其他 System One 兼容服务器或 OpenRouter Decisions 模型。

两条路径都接受每边 280-1568 像素、总计 78,400-2,458,624 像素的 PNG 和 JPEG，并拒绝其他图像，而不是调整其大小。因此，评判链会在发送前将每张图像调整到原生评判模型的边界内：已在边界内的图像保留原始字节；其他图像不失真地缩小到最大值以内，或在最大值允许的范围内向最小值放大，然后在极端宽高比仍导致某边不足时用左上角像素填充（一张 401×41 的工具栏裁剪图会变为 1568×160，并居中放在 1568×280 的画布上），再重新编码为 PNG，或在 PNG 超过字节上限时编码为 JPEG。TypeSafe Jev 没有与图像细节等级对应的设置，因此直接 TypeSafe 请求会忽略 `ImageContent.detail`。

[边界框问题](https://docs.typesafe.ai/primitives/box)（`{ type: "box", instructions, image }`）需要 Jev 1.14，并发送给 TypeSafe 和 OpenRouter Decisions 评判模型；对于包含此类问题的请求，评判链会跳过所有其他候选模型，不回退到提示方式或会话模型。`image` 是请求的 `images` 索引，不会传输到线上，因此在多张图像中搜索时，`instructions` 仍须指明图像。Jev 返回的边缘坐标是相对于它收到的图像的比例；如果适配时填充了该图像，评判链会将边缘映射回你传入的图像，并将落在填充区域的边缘钳制到边界。

图像约束参见 TypeSafe 的[图像文档](https://docs.typesafe.ai/images)和 OpenRouter 的[多模态 Decisions 指南](https://openrouter.ai/docs/guides/community/multimodal-decisions)。

OpenRouter 的指南列出的最短边为 256 px，但一份[实际 Jev 1.14 请求报告](https://github.com/can1357/oh-my-pi/pull/15887#issuecomment-6218295982)称，270×300 的 PNG 收到了 HTTP 400；280 px 的最短边是有意设置的，且仍然生效。

例如，将 TypeSafe Jev 配置为评判模型，并在 JavaScript 或 Python 中附加图像：

```yaml
modelRoles:
   judge: typesafe/jev-1.14.0
```

```js
await judge(state, question, { images: ["./chart.png"] });
```

```python
await judge(state, question, images=["./chart.png"])
```

模型或 `modelOverrides` 条目也可以使用运行器 API，这类 API 提供一种模型 `kind`；`packages/catalog/src/types.ts` 中的 `RUNNER_API_KINDS` 列出了这些 API（例如 `openai-images` 提供 `image`，`openai-embeddings` 提供 `embedding`，`openai-speech` 提供 `tts`）。`web-search` 是内置的，不能在此指定，因此也不能指定 `kind: search`。`kind` 默认为该 API 的种类（聊天传输为 `chat`），显式 `kind` 必须是其 API 提供的种类。聊天传输提供 `chat` 和 `tiny`（用于 `tiny`、`memory` 和 `judge` 角色的小模型）；`generate_image` 使用的传输（`openai-responses`、`openai-codex-responses`、`google-generative-ai`）还提供 `image`：在 `openai-responses` 上，图像通过 Responses 的 `image_generation` 工具生成，由同一模型提供方上的 GPT-5+ 聊天模型承载，而不是通过 `/images/generations`。以下配置将发现的网关模型移至图像角色：

```yaml
providers:
   my-gateway:
      api: openai-responses
      discovery:
         type: openai-models-list
      modelOverrides:
         gpt-image-2:
            api: openai-images # kind: image, generated via /images/generations
         gpt-image-1.5:
            kind: image # stays on openai-responses, generated via the hosted image tool
```

配置的 `kind`，无论是显式指定还是由运行器 API 隐含指定，都优先于捆绑目录对同一 ID 的分类，并在应用 `modelOverrides` 和刷新后保留。

加载 models.yml 时，只会针对文件中指定的 API 检查 `modelOverrides` 的 `kind`：即覆盖条目自身的 `api`，或同 ID 的 `models` 条目的 API。内置或发现的模型稍后才获得其 API，因此会在覆盖生效时针对该 API 检查覆盖的 `kind`；API 不提供的种类会被忽略并记录日志。没有 `kind` 的 `api` 覆盖会采用运行器 API 的种类，保留新 API 仍提供的种类，否则将模型设为 `chat`。在不同 API 上重新定义内置 ID 的 `models` 条目遵循相同规则，因此在 `openai-completions` 上重新定义图像行会使其成为 `chat`。

### 允许的认证/发现值 \{#allowed-authdiscovery-values}

- `auth`：`apiKey`（默认）、`none` 或 `oauth`。`none` 和 `oauth` 免除自定义模型提供方的 `apiKey` 要求，但 `oauth` 不会创建凭据或注册登录流程。它强制使用 OAuth 风格的请求形状；可用凭据必须来自已存储的认证、环境或配置的密钥。自定义 `anthropic-messages` 模型在省略 `auth` 时也使用 OAuth 风格的请求形状；设置 `auth: apiKey` 可使用普通 API 密钥请求形状。
- `discovery.type`：`ollama`、`llama.cpp`、`lm-studio`、`openai-models-list`、`proxy`、`litellm`、`openrouter` 或 `apple-foundation-models`。Apple 的传输会在受支持的 Mac 上隐式注册；`apple-foundation-models` 不是此 YAML 模式允许的 `api` 值。
- `discovery.injectV1`：可选布尔值，默认 `true`，用于 `openai-models-list`。设为 `false` 可从 `{baseUrl}/models` 获取模型列表而不注入 `/v1`，适用于将 OpenAI 兼容接口根路径设在带版本路径（例如 `https://api.opper.ai/v3/compat`）的网关，这些网关被强制使用 `/v1/models` 时会返回不同且更小的模型列表。`baseUrl` 中的查询字符串会被忽略，与默认模式一致。
- `discovery.advertisedReasoning`：可选布尔值，默认 `true`，用于 `openai-models-list`、`lm-studio` 和 `proxy`。发现过程读取 `/v1/models` 行对自身推理接口的声明（顶层或 `metadata` 下的 `supported_reasoning_levels` / `default_reasoning_level` / `reasoning`），并使其优先于捆绑参考目录的推测，因此使用自身目录进行分发的网关会提供其路由接受的等级。列出 `none` 的行会获得 `reasoningDisableMode: none-effort`，因此关闭思考的请求会发送关闭开关，而不是被钳制到最低等级。声明的等级序列还会将 `defaultLevel` 固定在其中，避免目录策略注入该行未列出的等级。报告 `reasoning: false` 的行会覆盖该 ID 已启用推理的参考条目。当端点声明了其路由拒绝的等级时，将此标志设为 `false`：发现过程随后会根据捆绑参考目录构建各模型的思考接口。未声明推理信息的行在两种情况下都不受影响。显式 `modelOverrides.<id>.thinking` 和 `compat.supportsReasoningEffort` 仍优先于两者。`litellm` 不接受此标志：其权威推理元数据来自 `/model_group/info`，因此该设置只会影响其 `/v1/models` 回退。
- `transport`：可用值为 `pi-native`。设置后，该模型提供方下的每个模型都通过 `POST /v1/pi/stream` 发送到兼容 `omp auth-gateway` 的 `baseUrl`；`apiKey` 是网关的 bearer 凭据。模型提供方的模型列表来自网关：omp 从 `GET /v1/pi/models` 读取，因此网关在运行时发现的模型可以选择，无法路由的模型则消失。不提供该路由的网关会使模型提供方继续使用捆绑列表。
- `imageInputDecoder`：可用值为 `stb`。当服务后端使用无法接受 WebP 的 STB 兼容图像解码器时，在自定义模型或 `modelOverrides` 条目上设置此项；OMP 会在分发到模型提供方之前转换附加图像和历史 WebP 图像。
- `imageCountBudget`：正整数。在自定义模型或 `modelOverrides` 条目上设置此项，以声明其主机的单个请求可以携带多少张图像。它会替换目录预算；对于未被目录规则指定的模型提供方，预算为 5。位于限制更高的厂商前面的网关需要此项：一旦会话中的图像超过预算，OMP 会丢弃最旧的图像，从而改变缓存的提示前缀。
- `snapcompactShape`：`{ variant, frameSize? }`。在自定义模型或 `modelOverrides` 条目上设置此项，选择归档页面使用的 snapcompact 帧形状，替代 OMP 为该模型系列选择的形状。`variant` 是除 `auto` 之外的 `snapcompact.shape` 值（例如 `11on16-bw`）；`frameSize` 是以 px 为单位的帧边长，为 64 到 2576 的整数，默认采用变体自身的值。`snapcompact.shape` 设置在非 `auto` 时仍优先，帧仍会缩小到主机的 `image-max-edge`，计费估算仍遵循模型。
- `tokenizer`：当代理的模型 ID 含义不明或不规范时，选择使用特定的嵌入式本地分词器。允许值：`claude-v3`、`claude-v47`、`claude-v5`、`claude-v5-sonnet`、`qwen3`、`deepseek-v3`、`kimi-k2`、`glm5`、`cl100k`（OpenAI GPT-3.5 和 GPT-4）及 `o200k`（OpenAI GPT-5 及更新版本）。省略时使用目录身份策略；没有对应策略的模型使用 o200k 计数。

## 验证规则（当前） \{#validation-rules-current}

### 完整自定义模型提供方（`models` 非空） \{#full-custom-provider-models-is-non-empty}

必填：

- `baseUrl`
- `apiKey`，除非设置了 `auth: none` 或 `auth: oauth`
- 模型提供方级别或每个模型上的 `api`

### 覆盖型模型提供方（`models` 缺失或为空） \{#override-only-provider-models-missing-or-empty}

必须至少定义以下一项：

- `baseUrl`
- `apiKey`
- `auth: none`
- `headers`
- `compat`
- `disableStrictTools: true`
- `guardrailIdentifier`
- `requestMetadata`
- 非空的 `modelOverrides`
- `discovery`
- `remoteCompaction`

### 发现 \{#discovery}

- `discovery.timeoutMs` 以毫秒为单位覆盖该模型提供方运行时 HTTP 探测的超时。它必须是正有限数。
- 未覆盖时，Ollama 和 llama.cpp 回环探测使用较短的、针对端点的预算（150-250 ms）；远程/局域网探测使用 10 s。通用模型列表和代理探测默认为 10 s。
- `discovery` 要求模型提供方级别的 `api`，但 `discovery.type: proxy` 除外（自动检测各模型的传输格式）。

### 远程上下文压缩 \{#remote-compaction}

`remoteCompaction` 可独立满足覆盖型模型提供方的要求。
它支持 `enabled`、`api`、`endpoint`、`model`、`v2StreamingEnabled`、
`v2Endpoint` 和 `streamingEndpoint`。

位于 Amazon Bedrock OpenAI 路由上的 `openai-responses` 模型（`bedrock-runtime.<region>.amazonaws.com` 或 `bedrock-mantle.<region>.api.aws` 上的 `/openai/…`、
Mantle 的 `/v1` 基础路径、runtime FIPS 主机，以及两个端点的 PrivateLink 主机）
会使用原生 OpenAI 上下文压缩，无需选择启用，且适用于任何模型提供方 ID。设置
`enabled: false` 可关闭，或设置 `v2StreamingEnabled: false` 以保留
V1 `/responses/compact` 请求。参见[上下文压缩](./compaction.md)。

Bedrock Converse Claude 模型在 AWS 端点上通过 Bedrock Runtime 旁路请求进行原生上下文压缩；
自定义非 AWS `baseUrl` 需要 `remoteCompaction.enabled: true`，而 `enabled: false` 可退出。参见
[上下文压缩](./compaction.md#summary-generation)。独立的 Anthropic Messages `/anthropic` 路由有
自己的[设置方式](./models.md#claude-on-bedrocks-anthropic-messages-api-anthropic)。

### 模型值检查 \{#model-value-checks}

- `id` 为必填且非空；可选的 `name`、模型 `baseUrl`、`contextPromotionTarget` 和 `compactionModel` 也必须非空
- 自定义 `models` 条目在提供 `contextWindow` 和 `maxTokens` 时要求它们为正数；当前辅助正数检查不涵盖 `modelOverrides`
- 对自定义模型和覆盖条目，`maxContextWindow` 都必须是正安全整数，且在同时设置两者时不小于 `contextWindow`

### 未知兼容性键 \{#unknown-compatibility-keys}

模型提供方、模型和 `modelOverrides` 的 `compat` 块中的未知键会产生非致命警告：交互式启动时显示通知，在打印和 RPC 模式以及列出模型时向 stderr 输出一行（包括 JSON 输出；stdout 不变）。每条警告都指出配置文件和以点分隔的键路径；模型数组条目使用从零开始的索引，与模式错误相同。配置仍会加载，未知键会保留以实现向前兼容。一个注册表对每个未知键路径只报告一次，即使强制刷新或重新读取未更改的文件也一样。

`compat` 顶层及其 `whenThinking` 覆盖内的已知记录级键，同时来自 models.yml 兼容性模式和运行时兼容性词汇（传输轴）。模式验证的是经过筛选的子集，因此运行时识别的键（如 `streamFirstEventTimeoutMs`）不会因为文件模式未包含它就产生警告。嵌套的 `whenThinking.whenThinking` 仍会警告：思考覆盖不能包含另一个思考覆盖。思考轴和目录轴属于 `compat` 之外，不包括在内。其他嵌套检查遵循模式声明的固定字段对象，包括路由块和 `reasoningEffortMap`；`extraBody` 等开放映射接受任意键和嵌套载荷。运行时扩展的模型提供方注册不会按文件模式检查：它们可以注册具有自身兼容性字段的自定义 API。

运行时词汇不会按模型提供方的 `api` 筛选：即使某个传输键在此处没有效果，因为它由另一个 API 系列读取（例如 `openai-completions` 模型提供方中的 Anthropic 专用键），也不会产生警告。

### 命令解析的密钥 \{#command-resolved-secrets}

模型提供方的 `apiKey` 值以及模型提供方/模型的 `headers` 值可以以 `!` 开头，从命令 stdout 读取密钥。命令异步运行，超时为 10 s；stdout 会去除首尾空白，空输出/失败命令会被省略。加载或检查目录不会执行它们：凭据会在请求或在线凭据探测需要时解析。

```yaml
providers:
   openai:
      apiKey: "!op read op://dev/openai/api-key"
      headers:
         X-Team-Key: "!bw get password omp-team-key"
```

成功的命令输出会在进程生命周期内缓存，并发请求共享正在进行的执行。失败会退避 30 秒。请求 `refreshCommandCredentials` 的刷新调用方（包括模型中心的显式刷新）和 401 凭据恢复会使相关缓存 API 密钥和请求头失效；普通目录刷新不会。运行时 API 密钥覆盖（包括 `--api-key`）优先于配置的凭据。

## 合并与覆盖顺序 \{#merge-and-override-order}

ModelRegistry 的组合顺序：

1. 加载 `models.yml` / `models.yaml`，建立模型提供方覆盖、自定义模型、模型覆盖和发现配置。
2. 从 `@oh-my-pi/pi-catalog`（`getBundledProviders` / `getBundledModels`）加载内置模型，应用模型提供方覆盖和上下文策略。
3. 合并缓存行和运行时发现的行。权威模型提供方目录可以替换其捆绑的聊天模型名单。
4. 合并配置的自定义 `models`，然后合并扩展注册的模型：
   - 匹配的 `provider + id` 会替换传输元数据，并修补已定义的模型字段
   - 否则追加模型，从捆绑参考条目或本地默认值填充省略的元数据
5. 折叠推理强度等级变体，应用 `modelOverrides`，并选择配置的扩展窗口。
6. 应用模型提供方的 Bedrock 字段、运行时模型提供方覆盖、发现传输策略和扩展 OAuth 目录投影。

后台发现会重复合并，在发现的行之后应用自定义定义和模型覆盖，
因此显式用户配置仍然有效。

### 模型提供方模型缓存和静态指纹 \{#provider-model-cache-and-static-fingerprint}

各模型提供方的缓存模型列表以物化模型的形式持久化在 `models.db`（模式版本 13）中。
物化策略标记包含应用版本、构建器版本和
已编译规则哈希；不兼容的行会失效。请求头值从不持久化，
必须从受信任的本地元数据或配置恢复。

`static_fingerprint` 对当前静态切片和合并策略计算哈希。它根据
数组当前内容重新计算，不存储在数组上。当新鲜的权威缓存匹配且没有
尚未解析的请求头时，`resolveProviderModels` 可以跳过完整合并。增量共享目录
缓存仍会重新应用静态行，返回的模型会经过变体折叠。
模型管理器的默认缓存 TTL 为两小时（各模型提供方可覆盖）；
非权威快照使用五分钟重试间隔。

### 共享目录刷新 \{#shared-catalog-refresh}

捆绑目录仍是启动和离线基线。启动时加载配置和缓存行，按需物化模型提供方切片；在选择器验证之前，先进行一轮限于本地、按凭据范围进行的数据补全。后台刷新通过 `https://catalog.stencil.so/models.json.zstd` 为受支持的模型提供方获取共享 models.dev 目录。新模型 ID 以增量方式合并到各模型提供方的捆绑切片中，通过该模型提供方的目录描述符规范化，并持久化到模型缓存数据库。这使新发布的模型无需等待新的 OMP 二进制版本即可出现。

远程行可以为新增 ID 提供当前限制、定价、模态和能力标志，但不能引入代码、任意请求头或未注册的模型提供方。描述符声明端点发现为权威来源的模型提供方，会使用该结果作为其可用聊天模型名单。共享目录不是权威来源：远程行消失时，它不会移除捆绑模型。

新鲜的缓存快照可避免网络请求。如果刷新失败，OMP 会保留最后一个可用的缓存快照并标记其过期；没有缓存时则回退到捆绑目录。模型提供方发现状态记录 `source`（`bundled`、`models.dev`、`provider` 或 `cache`）和 `fetchedAt`，以便调用方区分当前远程数据与离线回退。

## 模型提供方和模型身份 \{#provider-and-model-identity}

注册表保留具体的 `provider` + `id` 身份。当同一模型 ID 存在于多个模型提供方下时，
使用精确的 `provider/modelId` 选择器。会话状态
和会话记录会记录执行该轮的具体模型提供方/模型。

模型提供方默认值与逐模型覆盖：

- 模型提供方的 `headers`、`compat` 和 `remoteCompaction` 是基线。
- 模型的 `headers` 覆盖模型提供方的请求头键。
- `modelOverrides` 可以覆盖模型元数据（`name`、`api`、`kind`、`reasoning`、`thinking`、`input`、
  `imageInputDecoder`、`imageCountBudget`、`snapcompactShape`、`tokenizer`、`supportsTools`、`cost`、`promptCache`、`premiumMultiplier`、`voice`、`speechFormats`、`contextWindow`、
  `maxContextWindow`、`maxTokens`、`omitMaxOutputTokens`、`preferWebsockets`、`headers`、`compat`、
  `contextPromotionTarget`、`compactionModel` 和 `remoteCompaction`）。
- 对嵌套路由块（`openRouterRouting`、`vercelGatewayRouting`、
  `extraBody` 和 `whenThinking`），`compat` 进行深度合并。

## 提示缓存存活时间 \{#prompt-cache-lifetimes}

`promptCache` 声明对于 OMP 可请求的各保留等级，模型提供方让提示缓存条目保持有效的时间
（`short` 通常是默认值；Anthropic OAuth 订阅者请求在受支持时默认为
`long`，除非被显式保留设置或 `PI_CACHE_RETENTION` 覆盖）。值以秒为单位，且为
估计值：模型提供方公布的是范围，因此应选择保守的一端。

```yaml
providers:
   anthropic:
      modelOverrides:
         claude-sonnet-5:
            promptCache: { short: 300, long: 3600 }
```

显式 `promptCache` 会替换模型的目录存活时间，而不是
与之合并：`promptCache: {}` 会禁用该模型的预热，
只包含 `short` 的值不会继承目录中的 `long` 存活时间。对于匹配的
模型，`modelOverrides.promptCache` 优先级最高。运行时注册的
模型定义在选择存活时间时会替换匹配的 YAML `models` 定义，
即使运行时省略了 `promptCache` 也如此：此时使用实际生效
模型的目录默认值，而不是 YAML 存活时间。没有运行时
替换时，使用匹配的 YAML 存活时间，未提供则使用目录默认值。

普通的 `bun run gen:models` 命令会根据当前目录策略重新计算捆绑提示缓存
存活时间；没有独立的缓存重新生成
命令。

直接 Anthropic 保持现有的 5 分钟 / 1 小时存活时间（`short: 300`、`long: 3600`），
API 密钥默认为 5 分钟，OAuth 订阅者会话默认为 1 小时；API 密钥可以
显式选择 `long`。Factory Droid 的 Claude 模型具有相同的 5 分钟 / 1 小时存活时间，
默认为 5 分钟；`long` 在 Anthropic、Vertex、Bedrock 和 Azure 上游写入 1 小时条目，
在其他上游仍为 5 分钟。原生 Amazon Bedrock Converse 上的 Claude 具有 5 分钟 TTL；
在目录元数据和请求传输均支持时才可使用 1 小时。Bedrock Runtime 或 Mantle 的 Anthropic Messages 路由上的 Claude
在现有请求支持下具有 5 分钟存活时间；不支持时，显式 `long` 请求会回退到 `short`。其他 Amazon Bedrock 模型，
包括 Nova 和 GPT，未启用预热。对于实际使用的保留等级，模型若没有对应存活时间，
就不会预热；在明确底层缓存行为后，自定义模型和 `modelOverrides` 可以
通过 `promptCache` 选择启用。参见[设置](./settings.md)中的
`providers.cacheWarming`。

## 使用成本与分时定价 \{#usage-costs-and-time-based-pricing}

OMP 根据所选模型提供方/模型的目录定价估算 token 成本，有服务器报告的货币成本时优先采用。已完成的消息保留其记录的成本：跨越定价边界、切换模型或重新打开会话，不会对累计用量重新定价。

对于第一方 `deepseek` 模型提供方，目录遵循 [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing)：

- 高峰时段为 **UTC 周一至周五，01:00-04:00 和 06:00-10:00**（含起始时间，不含结束时间）。其他所有时间（包括周末）的成本为**高峰费率的 50%**。
- Flash 定价涵盖 `deepseek-flash`，以及已退役但仍接受的 `deepseek-v4-flash` 和 `deepseek-v4-flash-vision-exp` ID，均按 Flash 价目计费。高峰费率为每百万 token：未缓存输入 $0.30、缓存输入 $0.006、输出 $1.20。
- `deepseek-v4-pro` 最初使用的高峰费率为每百万 token：未缓存输入 $1.32、缓存输入 $0.044、输出 $3.96。自 **2026-09-14 04:00 UTC** 起，其估算使用 Flash 价目，高峰/非高峰时段安排相同。

一些目录价格在特定日期变化，但没有高峰/非高峰费率。`google`、`google-vertex` 和 `cursor` 上的 Gemini 4 Argon，截至 2026-11-30 按每百万 token 输入 $2 / 缓存输入 $0.10 / 输出 $10 估算，自 **2026-12-01 08:00 UTC**（美国太平洋时间午夜）起采用 Google 的 $4 / $0.20 / $20 标价。请求时间戳决定价格，因此在变化前加载的模型会对之后的请求按新费率定价，无需更新目录，模型浏览器和 `omp models --json` 会显示生效的价格。

本地估算使用助手消息的**请求开始时间戳**，为整个请求选择价目和费率。这是 OMP 的估算约定：DeepSeek 定价页面未指定服务器如何对跨越边界的请求计费。导入没有已记录成本的历史用量时，如果无法恢复请求时间戳，统计导入器会让定时定价保持未定价状态，而不是选择当前时钟对应的费率。

状态行的 `cost` 段根据当前时钟，为**当前活动的模型提供方/模型**追加表示高峰定价的 **↑** 或非高峰定价的 **↓**。即使空闲，它也会在费率边界刷新；箭头不是累计会话总额的标签。没有高峰/非高峰费率的模型，包括按日期变价和显式固定价格覆盖，不显示箭头。

`models.yml` 中的显式模型 `cost`（包括 `modelOverrides`）是固定价格覆盖，会禁用该模型继承的分时定价。省略 `cost` 会保留目录定价。`models.yml` **不**配置 `timeBased` 时刻表；该元数据属于目录的 [KDL 定价规则](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/catalog/src/compat/rules/README.md#time-based-pricing)。

`models.yml` 中省略 `cost` 的新自定义模型会继承其捆绑参考行的价目，
包括时刻表。参考条目按模型 ID 匹配，优先选择上下文/输出限制更大的条目，
其次是缓存定价完整的条目和第一方 OpenAI 行。同模型提供方、同 ID 的自定义条目
在省略 `cost` 时则保留现有模型的定价。通用代理和
OpenAI 模型列表发现会将定价保持为本地未知（零），而不借用上游
价格；LiteLLM 等信息丰富的模型提供方发现可以提供自己的价格。

## 运行时发现集成 \{#runtime-discovery-integration}

### 隐式 Ollama 发现 \{#implicit-ollama-discovery}

如果没有显式配置 `ollama`，注册表会添加一个隐式的可发现模型提供方：

- 模型提供方：`ollama`
- API：`openai-responses`
- 基础 URL：`OLLAMA_BASE_URL`，或 `OLLAMA_HOST`，或 `http://127.0.0.1:11434`
- 上下文窗口：若设置了 `OLLAMA_CONTEXT_LENGTH` 则使用该值，否则使用 Ollama `/api/show` 元数据，再否则使用 `128000`
- 认证模式：无密钥（`auth: none` 行为）

运行时发现会调用 Ollama 端点，将发现的 OpenAI 兼容模型规范化为 `openai-responses`。

`OLLAMA_CONTEXT_LENGTH` 不会配置 Ollama 运行时的 `num_ctx`；需在 Ollama/模型配置中另行设置。

### 隐式 llama.cpp 发现 \{#implicit-llamacpp-discovery}

如果没有显式配置 `llama.cpp`，注册表会添加一个隐式的可发现模型提供方：

- 模型提供方：`llama.cpp`
- API：`openai-responses`
- 基础 URL：`LLAMA_CPP_BASE_URL` 或 `http://127.0.0.1:8080`
- 认证模式：无密钥（`auth: none` 行为）

运行时发现会调用 llama.cpp 模型端点，并用本地默认值合成模型条目。

模型提供方的 `api` 是发现模型的默认值；目录规则可按模型类别覆盖它。任何 `discovery.type: llama.cpp` 模型提供方（隐式或显式）上的 Qwen 类模型都会被发现为 `openai-completions`，因为 Responses API 无法承载聊天模板的思考控制（`enable_thinking` / `chat_template_kwargs`）。该覆盖位于 `packages/catalog/src/compat/rules/providers/llama.cpp.kdl`（`discovery-api`）。

首个响应加载延迟加载的 llama.cpp 模型后，OMP 会重新探测其运行时上下文和输入
元数据。显式自定义模型和 `modelOverrides` 限制优先于该探测。
隐式模型提供方在未配置凭据来源时才无须密钥。

### 隐式 LM Studio 发现 \{#implicit-lm-studio-discovery}

如果没有显式配置 `lm-studio`，注册表会添加一个隐式的可发现模型提供方：

- 模型提供方：`lm-studio`
- API：`openai-completions`
- 基础 URL：`LM_STUDIO_BASE_URL` 或 `http://127.0.0.1:1234/v1`
- 认证模式：无密钥（`auth: none` 行为）

运行时发现会获取 OpenAI 兼容模型列表，以及可用时的原生 LM Studio 元数据。
原生 `loaded_context_length` 优先于训练窗口；首个
响应 JIT 加载模型后，OMP 会刷新该运行时元数据。显式自定义模型和
`modelOverrides` 限制仍是权威值。发现的 LM Studio 模型使用 `imageInputDecoder: stb`。

决策模型（LM Studio 原生 `GET /api/v1/models` 中的 `type: "decision"`）会被发现为
使用 `openai-decisions` API 的 `judge` 模型：判断请求提交到 `{baseUrl}/decisions`，即 LM Studio 的
OpenAI 兼容 Decisions 端点，而不是聊天补全端点。LM Studio
报告 `has_vision_adapter: true` 时，它们接受图像。用 `modelRoles.judge: lm-studio/<model>` 选择其中一个。

此路径也适用于并非 LM Studio 的本地 OpenAI 兼容服务器。例如，如果 oMLX 绑定到 Ollama 常用端口，设置 `LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1` 可通过现有 `/v1/models` 流程发现它。并行运行 oMLX 和 Ollama 时，需要为其中一个分配不同端口。不要将 oMLX 配置为 `ollama`：Ollama 发现使用原生 `/api/tags` 和 `/api/show` 端点，而不是 OpenAI `/v1/models`。

### 隐式 Apple Foundation Models 发现 \{#implicit-apple-foundation-models-discovery}

在 Apple Silicon macOS 上，未配置且未禁用的 `apple` 模型提供方会通过
进程内 Foundation Models 桥接进行探测。桥接报告可用时，`apple/on-device`
无需凭据即可使用，其上下文大小、推理、图像输入和工具支持均来自
桥接元数据。它不会被自动选择：其设备端上下文窗口可能
小于默认编程智能体提示和项目指令。请通过
`--model apple/on-device` 或 `/model` 主动选择；否则使用 `/login` 或配置另一个本地模型。
不符合条件的设备、禁用的 Apple Intelligence，以及不含桥接的构建都不会产生模型。
其内部 API 为 `apple-foundation-models`；不使用 HTTP 端点。

### LiteLLM 模型提供方发现 \{#litellm-provider-discovery}

当 `litellm` 处于活动状态时（例如通过 `LITELLM_API_KEY` 或已存储的认证），运行时发现使用 LiteLLM 代理：

- 模型提供方：`litellm`
- API：对于具有 `mode: decisions` 的模型组，使用 `openai-decisions`（种类为 `judge`）；对于由 OpenAI 支持的模型，使用 `openai-responses`；其他模型使用 `openai-completions`
- 基础 URL：显式模型提供方 `baseUrl` / `models.yml` 配置，否则使用 `LITELLM_BASE_URL`，再否则使用 `http://localhost:4000/v1`
- 认证模式：代理要求密钥时，使用 `LITELLM_API_KEY` 或已存储的 LiteLLM 认证

运行时发现按顺序探测 LiteLLM 管理元数据：`GET /model_group/info`、`GET /v2/model/info`、`GET /model/info` 和 `GET /v1/model/info`。配置的密钥必须获准读取这些路由中的至少一个；对于限制管理端点的部署，通过 LiteLLM 的 `allowed_routes` 访问控制授权该路由，或使用主密钥/管理员密钥进行发现。

如果所有元数据路由都不可用，发现会回退到 OpenAI 兼容的 `GET /models` 列表。被禁止或失败的元数据请求会连同端点和状态记录一次日志；`404` 被视为路由不存在。两条路径都会排除显式标记为已知任务专用 LiteLLM 模式的模型：`audio_speech`、`audio_transcription`、`batch`、`embedding`、`guardrail`、`image_edit`、`image_generation`、`moderation`、`ocr`、`rerank`、`search`、`vector_store` 和 `video_generation`。缺失、null 及无法识别的模式仍可选择，以便路由器别名继续工作。丰富元数据会映射逐模型的上下文、能力和上游模型提供方字段。由 OpenAI 支持的模型使用 LiteLLM 的 Responses 路由，以便保留推理摘要；混合模型提供方组继续使用 Chat Completions。裸回退 ID 使用已知 OpenAI 模型系列进行路由，并在可用时使用捆绑参考元数据。回退定价仍为未知（表示为零）；当端点和捆绑参考条目都未提供限制时，配置的通用发现使用 128,000 token 的默认上下文。丰富管理元数据可以提供模型提供方特定的价格。后续探测会填充或覆盖首个可用名单中模型所报告的元数据，而不是对每个端点的名单求并集。

### Bifrost 模型提供方发现 \{#bifrost-provider-discovery}

当 `bifrost` 具有凭据（`BIFROST_API_KEY` 或已存储的 `/login bifrost` 认证）时，运行时发现从模型提供方 `baseUrl` / `models.yml` 配置读取网关的 `GET /models` 名单，否则使用 `BIFROST_BASE_URL`，再否则使用 `http://localhost:8080/v1`。模型 ID 保留 Bifrost 的 `<bifrost-provider>/<model>` 形式。聊天模型使用 `openai-completions`；决策模型成为通过 `POST {baseUrl}/decisions` 请求的 `openai-decisions` 评判模型。该名单是权威来源，并按密钥和基础 URL 缓存。行映射、决策模型检测及评判重试指南见 [Bifrost](./provider-quirks.md#bifrost-bifrost)。

### OpenRouter 前置端点发现 \{#openrouter-fronting-discovery}

`discovery.type: openrouter` 适用于在自身 URL 和认证下提供 OpenRouter API 的端点。
发现无需凭据即可读取 OpenRouter 的公开
`https://openrouter.ai/api/v1/models` 名单：模型提供方的 `apiKey` 和
`headers` 从不会发送到 openrouter.ai。支持工具的行会保留 OpenRouter 的上下文和输出限制、
输入模态、推理等级序列和价格；这些价格是 OpenRouter 的标价，而不是
前置主机的计费价格。请求会使用模型提供方的 `api` 和凭据发送到其 `baseUrl`（省略时为 OpenRouter 本身），
并遵循 OpenRouter 的模型提供方规则，因此思考会发送为
`reasoning: { effort }`。

```yaml
providers:
   my-gateway:
      baseUrl: https://gateway.example.com/openrouter/v1
      api: openai-completions
      apiKey: GATEWAY_API_KEY
      discovery:
         type: openrouter
```

### 通用 OpenAI 兼容发现 \{#generic-openai-compatible-discovery}

`openai-models-list` 默认读取 `{baseUrl}/v1/models`（不会添加第二个 `/v1`）。
`discovery.injectV1: false` 将配置的 URL 视为完整 API 根路径。报告的
`max_model_len` 优先于 `context_length`。如果两者都缺失，嵌套的
`limits.max_input_tokens` 和 `limits.max_output_tokens` 在均为
正安全整数且总和安全时，才以其总和提供上下文。有效的 `limits.max_output_tokens` 会独立设置
聊天输出上限，并钳制到解析后的上下文；不完整或无效的上下文数值对不会
丢弃有效的输出限制。没有它时，有效的顶层 `max_output_tokens`，其次是
`max_completion_tokens`，再其次是 `top_provider.max_completion_tokens`，最后是通用 `max_tokens`
会设置上限，优先于任何捆绑参考限制。每种拼写都单独验证，因此某个
不可用值不会抑制可用的同级值。否则，上下文和输出遵循
现有的原生/参考/默认回退。
不报告相关信息的端点可以继承捆绑参考限制、推理和输入模态；未知模型
使用 128,000 上下文和 32,768 输出作为通用聊天默认值。输出上限不超过解析后的上下文；
通过 Anthropic 路由的模型使用 8,192 token 的回退输出上限。

当配置、发现和目录都未确定推理支持时，思考处于
**未验证**状态，而不是禁用。第一个带有思考等级的请求（包括会话默认值）
会在发送你的轮次之前运行小型、独立的能力探测。先尝试请求的等级；
所有六个等级都会并行测试。如果该格式失败，会为该 API 尝试其他强度、开关或 token 预算
格式。探测只包含固定算术问题，不包含你的对话
或工具。首次使用未知模型时，它们会增加请求和延迟。

接受的等级、请求格式和观察到的推理会保存在 `models.db` 中，范围按模型提供方、
API、端点和传输模型 ID 划分。后续轮次复用结果，并钳制不支持的等级。肯定
结果在 30 天后过期；没有推理控制的结果在一天后过期。认证失败、
限流、服务中断和超时均无法得出结论，不会被保存为不支持。即使模型提供方没有返回可见推理，
接受参数也算支持。显式能力设置，
包括 `reasoning: false`，优先于探测。

声明输出为纯图像的行会成为图像生成运行器；纯嵌入输出
会成为嵌入运行器。输出只有 `speech` 时会成为使用 `openai-speech` 的 `tts` 运行器，
`transcription` 则成为使用 `openai-transcriptions` 的 `stt` 运行器。输出来自该行的
模态数组或 OpenRouter 的 `architecture.modality` 摘要
（`text->speech`）。混合输出、裸 `audio` 输出（Poe 将 TTS 音色和音乐生成器
都列为 `text->audio`），以及未声明模态的行仍是聊天模型。这些运行器
在 `omp models --kind all` 中可见，不在默认聊天列表中显示。

### 显式模型提供方发现 \{#explicit-provider-discovery}

你可以自行配置发现：

```yaml
providers:
   ollama:
      baseUrl: http://127.0.0.1:11434
      api: openai-responses
      auth: none
      discovery:
         type: ollama

   llama.cpp:
      baseUrl: http://127.0.0.1:8080
      api: openai-responses
      auth: none
      discovery:
         type: llama.cpp
```

自定义 LiteLLM 网关可以使用相同的丰富发现路径：

```yaml
providers:
   litellm-gateway:
      baseUrl: http://gateway.example:4000/v1
      apiKey: LITELLM_API_KEY
      api: openai-completions
      discovery:
         type: litellm
```

LiteLLM 元数据端点使用配置的基础 URL，但在发现时会去掉尾部 `/v1`，保留之前的任何代理路径。运行时模型调用保留配置的 OpenAI 兼容 `/v1` 基础 URL。

### 代理发现（`discovery.type: proxy`） \{#proxy-discovery-discoverytype-proxy}

适用于兼容 Anthropic+OpenAI 的代理（new-api / one-api / 类似代理），
它们在同一主机后提供 `/v1/messages` 和 `/v1/chat/completions`。
发现会请求 `GET /v1/models`（10 秒超时，OpenAI 风格载荷），并
根据条目的 `supported_endpoint_types` 推导各模型的 `api`：

- 包含 `"anthropic"` -> `api: anthropic-messages`（通过 `/v1/messages` 路由）
- 包含 `"openai"` -> `api: openai-completions`（通过 `/v1/chat/completions` 路由）
- 否则 -> 回退到模型提供方级别的 `api`，省略时使用 `openai-completions`

使用 `discovery.type: proxy` 时，模型提供方级别的 `api` 是**可选的**，因为
会自动检测各模型的传输格式。Anthropic SDK 会从 `baseUrl` 中去掉尾部 `/v1`，
再追加 `/v1/messages`，因此单个发现 `baseUrl`
（以 `/v1` 结尾）可以正确往返于两种传输格式。

```yaml
providers:
   newapi-reseller:
      baseUrl: https://api.example.com/v1
      apiKey: xxxx
      authHeader: true # injects Authorization: Bearer for openai models
      disableStrictTools: true # most anthropic-fronted proxies reject `strict`
      discovery:
         type: proxy
```

### 扩展模型提供方注册 \{#extension-provider-registration}

扩展可以在运行时注册模型提供方（`pi.registerProvider(...)`），包括：

- 替换/追加模型提供方的模型
- 为新 API ID 注册自定义流处理器
- 注册自定义 OAuth 模型提供方
- 通过 `fetchDynamicModels` 获取感知凭据的实时名单（默认以 24 小时 TTL 缓存）
- 在目录重建后重新应用的自定义用量报告和 OAuth `modifyModels` 投影

## 认证和 API 密钥解析顺序 \{#auth-and-api-key-resolution-order}

请求模型提供方的密钥时，生效顺序为：

1. 运行时覆盖（CLI `--api-key`）
2. 配置覆盖（`models.yml` 的 `providers.<name>.apiKey`）
3. 已存储的 OAuth 凭据（含刷新）
4. 登录来源的已存储 API 密钥
5. 扩展注册的配置回退（`keys.setConfig(..., { fallback: true })`）
6. 环境变量映射（`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等）
7. 其他已存储的 API 密钥，例如从凭据代理迁移的副本

回退层级用于有自身登录流程的已注册模型提供方。在
`models.yml` 中显式提供的密钥属于第 2 层，而不是此回退层。

`models.yml` 的 `apiKey` 行为：

- 首先将值视为环境变量名。
- 如果环境变量未设置或为空，则将字面字符串用作 token。

如果设置了 `authHeader: true` 和模型提供方 `apiKey`，模型会获得：

- 注入的 `Authorization: Bearer <resolved-key>` 请求头。

解析不会因变量缺失而失败：在 `apiKey: MY_PROVIDER_API_KEY`
和 `authHeader: true` 下，未设置或为空的 `MY_PROVIDER_API_KEY` 会产生
`Authorization: Bearer MY_PROVIDER_API_KEY`。使用环境变量密钥的启动器必须
在启动 OMP 前检查变量已设置且非空。

[命令解析的密钥](#command-resolved-secrets)不使用此字面值
回退：失败命令或去除首尾空白后为空的 stdout 会解析为无值，因此
不会添加派生的 bearer 请求头。

无密钥模型提供方：

- 标记为 `auth: none` 的模型提供方、隐式本地模型提供方，以及以无密钥模式存储的可选密钥登录，都可以在没有凭据时可用。
- 当模型提供方无须密钥且未配置真实凭据来源时，`ModelRegistry.getApiKey*` 返回 `kNoAuth`；配置的凭据仍优先。

### 凭据代理模式 \{#broker-mode}

设置 `OMP_AUTH_BROKER_URL`（或 `auth.broker.url`）后，本地 SQLite 凭据存储会被 `RemoteAuthCredentialStore` 替代。上述第 3、4 和 7 层（已存储的 OAuth 和 API 密钥凭据）由凭据代理提供的快照供应，其中 `refresh` token 已脱敏；过期时会触发凭据代理上的 `POST /v1/credential/:id/refresh`，而不是本地刷新。

`AuthStorage.keys.setConfig` 让 `models.yml` 的 `apiKey` 优先于凭据代理解析的 OAuth token，但不会覆盖运行时 `--api-key`。完整的凭据代理/网关设计和环境变量接口（`OMP_AUTH_BROKER_URL`、`OMP_AUTH_BROKER_TOKEN`、`auth.broker.url`、`auth.broker.token`）参见 [`auth-broker-gateway.md`](./auth-broker-gateway.md)。

## 模型可用性与所有模型 \{#model-availability-vs-all-models}

- `getAll()` 默认返回聊天模型；`getAll("all")` 包含目录的所有种类。
- `getAvailable()` 默认也返回聊天模型；传入种类或 `"all"` 会包含对应运行器。
- 可用性排除 `disabledProviders`，并要求模型提供方无须密钥或已配置凭据来源。它不会执行密钥命令或刷新 OAuth token。

模型可以存在于注册表中但不可用，配置的凭据也仍可能
在为请求解析时失败。

## 运行时模型解析 \{#runtime-model-resolution}

### CLI 和模式解析 \{#cli-and-pattern-parsing}

`model-resolver.ts` 支持：

- 精确的 `provider/modelId`
- 精确模型 ID（推断模型提供方）
- 裸 ID 的模糊/子串匹配（`opus`、`gpt-5.2`）；`provider/modelId` 选择器必须精确匹配
- `--models` 中的 glob 范围模式（例如 `openai/*`、`*sonnet*`）
- 可选的 `:thinkingLevel` 后缀（`off|minimal|low|medium|high|xhigh|max|auto|inherit`）
- OpenRouter 和 Vercel Gateway 选择器上的 `@upstream` 路由后缀（例如 `openrouter/anthropic/claude-sonnet-5@anthropic:high`）；精确的字面模型 ID 仍优先

`--provider` 为旧式用法；优先使用 `--model`。精确的 `provider/modelId` 没有歧义；裸 ID
和模糊模式会针对可用的具体模型解析。

精确选择器的解析优先级：

1. 精确的 `provider/modelId` 引用
2. 精确的裸 ID（不区分大小写）；当多个模型提供方包含同一 ID 时，通过偏好排序选出胜者（见下文）
3. 已退役的推理强度等级变体别名（已折叠的目录条目，例如 `X`/`X-thinking` 成对条目）
4. 按别名与日期版本选择的子串匹配（适用于裸 ID）

模型提供方已知的 `provider/modelId` 选择器会在精确阶段后停止：它不会运行名称相似的同级模型。未命中会以 `Model "…" not found` 失败，并建议该模型提供方下最多三个相近 ID。配置的默认模型未命中时，会发出警告，指出该模型以及实际替代运行的模型，除非配置的 `retry.fallbackChains` 条目接管；配置的听写模型未命中时也会以相同方式警告。

glob 范围模式（由 `enabledModels` 和 CLI `--models` 使用）会在精确匹配后，单独针对具体模型运行。

当裸 ID 匹配多个模型提供方的模型时，偏好顺序为：

1. 最近使用的模型变体
2. 模型提供方优先级（先按 `modelProviderOrder` 设置，再按内置目录模型提供方优先级）
3. 最近使用的模型提供方
4. 注册表顺序

### 初始模型选择优先级 \{#initial-model-selection-priority}

启动时，会话模型按以下顺序选择：

1. 显式 CLI `--model`
2. 当模型范围生效（`--models` 或 `enabledModels`）且不是恢复会话时：
   - 如果该范围在启动时解析成功：若配置的 `default` 角色在范围内解析成功，则使用它；否则使用范围内的首个模型，但在配置了 `default` 的 `enabledModels` 下除外（见最后一种情况）
   - 如果 `--models` 范围在启动时未解析出任何模型（其选择器指定的都是扩展或发现模型提供方稍后才注册的模型）：这些模型提供方注册后，按顺序尝试 `--models` 选择器；不查询 `default` 角色
   - 如果 `enabledModels` 范围在启动时为空，或配置的 `default` 尚未在其中解析成功：扩展注册后，会在 `enabledModels` 内重试 `default` 角色；如果仍未解析成功，选择会转入下方的模型提供方默认值，但限制在 `enabledModels` 内，不一定是列出的首个模型
3. 已保存的默认模型提供方/模型
4. 可用模型中的已知模型提供方默认值（例如 OpenAI/Anthropic 等）；发现过程标记了账户默认模型的模型提供方（`isProviderDefault`，例如 Devin）会使用它替代捆绑的 `default-model`
5. 首个可用模型

自动回退在存在具有具体凭据的模型提供方（包括
无密钥本地模型提供方）时，会先将候选池限制为这些模型提供方。环境中的 AWS/Vertex 凭据哨兵仍可用，但不会
挤掉具有显式凭据的模型提供方。会话恢复单独处理，并检查
已保存的模型仍存在且能解析出可用凭据。

### 角色别名和设置 \{#role-aliases-and-settings}

模型角色为工作负载分配模型选择器。在 `config.yml` 的 `modelRoles` 下配置，而不是在 `models.yml` 中；`models.yml` 定义模型提供方和模型元数据。

内置角色在模型选择器中分组显示：

- **聊天角色：**`default`、`smol`、`slow`、`vision`、`plan`、`commit`、`tiny`、`memory`、`task` 和 `advisor`。`tiny` 和 `memory` 角色既接受普通聊天模型，也接受 `tiny` 目录模型。
- **模型种类角色：**`image`、`web`、`speech`、`dictation` 和 `judge`。它们分别选择图像生成、搜索/基于检索依据的聊天、文本转语音、语音转文本和判断运行器。`judge` 角色也接受 tiny 和聊天模型。

`vision` 和 `image` 是不同的工作负载：`vision` 选择用于图像分析的聊天模型，例如 `read screenshot.png?q=...`；`image` 为 `generate_image` 选择目录种类为 `image` 的模型。将模型分配给 `vision` 不会赋予它图像输入支持：图像问题还会检查模型能否向其模型提供方发送图像输入。

`tiny` 角色为会话标题等后台工作选择轻量模型；未设置时通过 `@smol` 解析。`memory` 角色未设置时通过 `@tiny` 解析。配置和回退链示例见[模型设置](./settings.md#models)。

在 `/models` 中分配非默认角色通常会保存其选择器，而不切换活动对话模型。工作负载会在调用时使用该角色；分配 `plan` 本身不会进入计划模式，调用 `todo` 本身也不会选择计划模型。计划模式活动期间，更改 `plan` 角色会重新应用其模型。分配 `default` 通常也会切换活动模型，除非优先级更高的设置层覆盖了所编辑的分配。会话专用模型选择器会更改活动模型，而不重写角色分配。

`@smol` 等角色别名通过 `settings.modelRoles` 展开；`*` 选择 `@default`。在 YAML 值中用引号包围 `@` 别名（`plan: "@slow"`）。聊天角色值可以追加思考选择器，如 `:minimal`、`:low`、`:medium` 或 `:high`；模型种类角色不使用聊天思考后缀。

角色值可以包含逗号分隔的选择器；选择时使用第一个可用匹配项，
而不是逐请求重试链。请求失败回退单独配置在
`retry.fallbackChains` 下（角色、精确模型或模型提供方通配符键；参见[设置](./settings.md)）。
可以通过 `modelRoles`、`modelTags` 或 `cycleOrder`
引入自定义角色名；它们使用聊天模型。
未设置的 `smol` 和 `slow` 会先继承显式配置的 `default`，然后才使用其内置优先级
列表。顾问使用显式配置的 `slow`，否则使用自身的强模型优先级
链，而不是继承活动对话模型。

如果角色指向另一个角色，目标模型仍按正常方式继承，引用角色上的任何显式后缀在该角色专用场景下优先。

### 模型预设 \{#model-presets}

模型预设是每个角色分配及 `defaultThinkingLevel` 的命名快照，便于一次切换整套设置：

```text
/modelpreset save cheap      # save the current roles and thinking level
/modelpreset switch deep     # apply a saved preset
/modelpreset                 # pick one from a list (interactive)
/modelpreset list | delete <name>
```

使用 `omp --preset <name>`，可在不切换作用域的情况下按预设启动会话。预设的角色和 `defaultThinkingLevel` 在该次运行中作为运行时覆盖生效，不向配置写入任何内容，`--model`、`--smol`、`--slow` 和 `--plan` 对其指定的角色仍然优先。显式 `--thinking` 或选择器等级优先于预设的 `defaultThinkingLevel`；恢复会话所保存的模型和强度也优先，`--preset` 不会重新应用它们。在新会话中，预设的 `defaultThinkingLevel` 优先于模型自身的默认值，与 `/modelpreset switch` 一致。项目配置定义的预设可为运行选择路由，但绝不会扩大逐调用模型授权，这些授权由操作者授予。`--preset` 是保留的内置标志名，因此同名扩展标志不再生效。缺失或格式错误的预设会以错误停止启动，裸 `--preset` 则属于用法错误。

在 `/models` 的角色视图中按 `s`，可将当前设置保存为一个名称。预设位于 `config.yml` 的 `modelPresets` 下：

```yaml
modelPresets:
   deep:
      modelRoles:
         default: anthropic/claude-opus-4-5:high
         smol: anthropic/claude-sonnet-4-5
      defaultThinkingLevel: high
```

切换时按模型选择器的方式写入角色：写入 `modelRoleStorage` 选择的作用域，清除预设未包含的角色，并替换 `--model`/`--smol` 会话覆盖。预设的 `defaultThinkingLevel` 写入全局配置。然后，它会将活动模型切换到最终的 `default`（预设没有时自动选择模型提供方默认值），并根据该选择器上的 `:level` 后缀设置会话思考等级，否则使用预设的 `defaultThinkingLevel`；`:inherit` 后缀保留模型切换所设置的等级。如果预设的 `default` 模型不可用，则不作任何更改。仍由其他层决定的角色（`--config` 文件、`global` 存储中的项目配置，或 `project` 存储中的全局配置）会在切换消息中列出并指出生效的层，而不是报告为已切换。项目配置或 `--config` 文件设置的 `defaultThinkingLevel` 也一样：会话仍切换到预设等级，但消息会指出该层，下次启动时会恢复该层的等级。

多个配置层定义同名预设时，最高层（命令行，其次 `--config` 文件，再其次项目配置，最后全局配置）整体优先：条目绝不跨层合并，因此只设置 `default` 的项目 `deep` 会生效，而不会带上全局 `deep` 的其他角色。`--config` 文件中的 `null` 条目（或命令行覆盖）会从列表和切换中隐藏预设；项目配置中的 `null` 条目会被忽略，因此同名全局预设仍然生效。保存始终将命名条目写入全局配置，并在更高层仍对该名称优先时报告。

保存会捕获有效分配，包括任何 `--model` 会话覆盖，以及配置的 `defaultThinkingLevel`，而不是会话的实时思考等级。

相关设置：

- `modelRoles`（记录）
- `enabledModels`（限定范围的模式列表）
- `modelProviderOrder`（等效的具体选项共享同一 ID 时，模型提供方的优先顺序）
- `providers.kimiApiFormat`（`auto|openai|anthropic`；`auto` 遵循服务器声明的模型元数据）
- `providers.openaiWebsockets`（OpenAI Codex 传输的 `auto|off|on` WebSocket 偏好）
- `providers.openaiResponsesWebsockets`（可选择启用的标准 Responses 传输；参见[标准 Responses WebSocket](#standard-responses-websockets)）
- `providers.openaiLiveSteering`（通过 Codex WebSocket 将响应中途的用户消息传入 GPT-6 响应）

`modelRoles` 存储 `provider/modelId` 等模型选择器；`enabledModels` 和 CLI `--models`
接受精确选择器、glob 和模糊匹配。所得范围限制聊天模型
（Ctrl+P 循环切换、启动模型、`/model` 中的聊天角色）；评判、搜索、图像和语音
模型仍可用于各自角色，因此指定它们的条目会被接受，但没有效果。

`enabledModels` 和 `disabledProviders` 条目也可以限定到路径前缀：

```yaml
enabledModels:
   - claude-sonnet-4-5
   - path: ~/work
     models:
        - anthropic/claude-opus-4-5
disabledProviders:
   - ollama
   - path: ~/private
     providers:
        - anthropic
```

字符串条目适用于所有位置。当当前工作目录为配置的路径或其子目录之一时，带作用域的条目生效。使用 `path`、`paths`、`pathPrefix` 或 `pathPrefixes`；对 `enabledModels` 使用 `models`，对任一模型提供方设置使用 `providers`，或对其中任何设置使用 `values`。

## `/model` 和 `omp models` \{#model-and-omp-models}

两个界面都让带模型提供方前缀的具体模型保持可见且可选。

- `/model` / `/models` 打开带角色分配和模型提供方目录的模型中心；会话专用选择器更改活动模型，而不保存角色分配。
- `omp models`（默认 `ls` 操作）打印按模型提供方分组的可用**聊天**模型表；`--kind <kind>` 选择其他目录种类，`--kind all` 包含所有种类。
- `omp models find <substring>` 按模型提供方、ID 或名称筛选；`omp models refresh` 强制在线重新获取目录，忽略模型缓存 TTL；模型提供方名称也可作为 `ls` 筛选器（例如 `omp models openai-codex`）。
- 其他标志：`--json`、`-e <path>` / `--extension <path>`（可重复）、`--no-extensions`（跳过环境中的自动发现；显式 `-e` 仍会加载）和 `--config <overlay>`（可重复）。

JSON 包含 `provider`、`kind`、`id`、`selector`、`name`、限制、推理/思考元数据、
声明的 `input` 和 `cost`；它不暴露模型的传输 `api`。

选择模型提供方行会存储其显式 `provider/modelId`。

表格的 `images` 列报告传输实际会发送的内容，因此图像被
剥离的模型（`compat.stripImageInput`，参见[图像处理](#compatibility-and-routing-fields)）会显示 `no`，
即使其规格声明 `input: [text, image]`；`--json` 保留声明的 `input`。

## 上下文升级 \{#context-promotion}

上下文升级会在上下文压缩之前切换到显式配置的更大上下文模型。
它会在上下文溢出错误时，以及提示前或轮次后的上下文压缩阈值处尝试进行。

上下文升级和[重试模型回退](./non-compaction-retry-policy.md)相互独立。
关闭**自动升级上下文**（`contextPromotion.enabled`）不会禁用
`retry.fallbackChains`：在 `retry.modelFallback`
开启时，模型提供方错误仍会切换活动模型，即使回退模型碰巧有更大的上下文窗口。要停止这些
切换，请设置 `retry.modelFallback: false`；同模型重试（`retry.enabled`）和自动
上下文压缩（`compaction.enabled`）不受影响。

### 触发与顺序 \{#trigger-and-order}

当轮次因上下文溢出错误（例如 `context_length_exceeded`）而失败时，`AgentSession` 会在回退到上下文压缩**之前**尝试升级：

1. 如果 `contextPromotion.enabled` 为 true，解析升级目标（见下文）。
2. 如果找到目标，则切换到该目标并重试请求，无需上下文压缩。
3. 如果没有可用目标，则转入当前模型的自动上下文压缩。

### 目标选择 \{#target-selection}

选择是显式且由模型驱动的：

1. `currentModel.contextPromotionTarget`（如已配置）

只考虑配置的目标；上下文升级不会自动选择同模型提供方/API 下更大上下文的同级模型。目标必须可用、不同于当前模型、具有已知且严格更大的上下文窗口，并能解析出可用凭据（`ModelRegistry.getApiKey(...)`）。

### OpenAI Codex WebSocket 交接 \{#openai-codex-websocket-handoff}

如果切换涉及从/到 `openai-codex-responses`，会在模型切换前关闭会话模型提供方状态键 `openai-codex-responses`。这会丢弃 WebSocket 传输状态，使下一轮在升级后的模型上全新开始。

### 持久化行为 \{#persistence-behavior}

升级使用临时切换（`setModelTemporary`）：

- 记录为带临时角色 `"fallback"` 的 `model_change`（不是持久的用户模型选择）
- 不重写已保存的角色映射

### 配置升级目标 \{#configuring-promotion-targets}

通过 `contextPromotionTarget` 直接在模型元数据中配置目标。

`contextPromotionTarget` 接受以下任一形式：

- `provider/model-id`（显式）
- `model-id`（在当前模型提供方内解析）

显式 OpenAI 升级目标的示例（`models.yml`）：

```yaml
providers:
   openai-codex:
      modelOverrides:
         gpt-5.5:
            contextPromotionTarget: openai-codex/gpt-5.4
```

不要依赖从模型名称推导的链：显式配置目标，或使用模型提供方发现元数据
提供的目标。

## 兼容性与路由字段 \{#compatibility-and-routing-fields}

`compat` 块向 `packages/catalog/src/compat/resolve.ts` 提供稀疏覆盖，应用于
端点检测及 `packages/catalog/src/compat/rules/` 中的 KDL 模型提供方/模型规则之后。
YAML 模式在 `packages/coding-agent/src/config/models-config-schema-bundle.ts` 中构建。
解析后的形状取决于模型 API：`OpenAICompat` 是稀疏 OpenAI 输入类型，而
chat-completions 和 Responses 传输使用
`packages/catalog/src/types.ts` 中各自对应的已解析记录。

与这些字段相互作用的端点特定例外列于[模型提供方端点约束](./provider-endpoint-constraints.md)。

`models.yml` 支持以下键（均可选；未设置时使用目录规则和端点默认值）。
字段会影响已解析兼容性记录中声明了它们的 API：

请求形状：

- `supportsStore`：在请求中发出 `store: false`。默认：自动（非标准端点关闭）。
- `supportsDeveloperRole`：对推理模型使用 `developer` 系统角色而不是 `system`。默认：自动。
- `supportsMultipleSystemMessages`：保留分开的前置 system/developer 消息，而不将它们合并。默认：自动（已知的 OpenAI 兼容托管 API 保留；严格模板/本地主机合并）。
- `supportsUsageInStreaming`：发送 `stream_options: { include_usage: true }`，以在流式响应中接收 token 用量。默认：自动（通常开启，Cerebras 主机关闭）。
- `maxTokensField`：`"max_completion_tokens"` 或 `"max_tokens"`。默认：自动。
- `supportsToolChoice`：允许 `tool_choice` 参数。默认：自动。对因 `tool_choice` 返回 400 的端点（例如开启推理时的 DeepSeek）设为 `false`。
- `supportsForcedToolChoice`：接受要求使用特定工具的强制 `tool_choice`。默认：自动。为 `false` 时，强制选择器降级为 `auto`，使工具在拒绝强制工具调用的端点（例如某些要求思考的 OpenAI 兼容模型）上仍然可用。
- `disableReasoningOnForcedToolChoice`：当 `tool_choice` 强制调用时，移除 `reasoning_effort` / OpenRouter `reasoning`。默认：自动（Kimi/Anthropic 前置端点）。
- `disableReasoningOnToolChoice`：每当发送任何 `tool_choice` 时移除推理字段。默认：自动（DeepSeek 推理模型）。
- `disableReasoningWithTools`：存在工具时抑制推理，即使没有强制工具选择。默认：`false`，除非目录策略覆盖。
- `alwaysSendMaxTokens`：调用方未提供最大 token 字段时始终发送该字段。默认：自动（Kimi 系列模型从 `max_tokens` 推导 TPM 限制）。
- `strictResponsesPairing`：Responses API 的工具调用/结果历史必须严格配对。默认：自动（Azure OpenAI、GitHub Copilot）。
- `statefulResponses`：为 `openai-responses` 启用或禁用已存储的 `previous_response_id` 链接。启用时发送 `store: true`，并在后续轮次发送增量输入；禁用时以 `store: false` 重放完整上下文。优先级：调用选项 > `PI_OPENAI_STATEFUL` > `compat.statefulResponses` > `compat.officialEndpoint`（官方 OpenAI 开启，其他端点关闭）。此键不启用 `officialEndpoint` 或 `text.verbosity` 等官方专用字段；不改变 Codex 或 Azure Responses 的行为。
- `streamIdleTimeoutMs`：慢速推理主机的流看门狗空闲超时下限，单位为 ms。默认：自动（GLM 编程套餐主机、直接 DeepSeek 推理）。
- `streamMarkupHealingPattern`：使用 `kimi`、`dsml`、`qwen` 或 `thinking` 语法恢复泄漏的流控制标记。默认：端点/模型策略。
- `cacheControlFormat`：`"anthropic"` 表示在 chat-completions 载荷中包含 Anthropic 风格的提示缓存标记。默认：自动（OpenRouter `anthropic/*` 模型）。
- `supportsLongPromptCacheRetention`：主机在 Responses API 上遵守 `prompt_cache_retention: "24h"`。默认：自动（api.openai.com）。
- `supportsImageDetailOriginal`：在端点支持时，允许 Responses API 的非标准 `detail: "original"` 图像
  模式。默认：OpenAI、Azure OpenAI 和 Codex 为 `true`；
  其他主机为 `false`，包括自定义/本地端点、xAI 和 Copilot。自定义主机对
  snapcompact 帧和计算机截图会收到 `auto`，除非通过
  `compat.supportsImageDetailOriginal: true` 选择启用。显式 `false` 也会覆盖已知主机的默认值。
- `supportsConfigurationUpdate`：让 Responses API 通过 `configuration_update` 输入项在会话中途更改 `reasoning.effort`，同时让请求级强度保持固定以便提示缓存（GPT-6 Astra）。默认：自动（每个主机上的 `gpt-6-astra` 为 `true`，其他为 `false`）。对于以 HTTP 400 拒绝该项类型的自定义 `openai-responses` / `openai-codex-responses` 端点，设为 `false`；之后强度变化会作为顶层 `reasoning.effort` 发送，不会发出更新项。
- `supportsSteering`：让 Codex WebSocket 传输发送 `response.steer`，使模型响应期间输入的消息加入该响应，而不是等待下一个请求。默认：自动（GPT-6 系列为 `true`）。对于拒绝该事件的代理，设为 `false`。
- `extraBody`：合并到每个请求体中的额外顶层字段（网关提示、控制器选择器等）。

图像处理：

- `stripImageInput`：在编码 `openai-completions` 请求前丢弃图像部分（包括 OpenRouter 聊天回退，`PI_OPENROUTER_RESPONSES=0`）。目录的
  类别规则会为端点通常以纯文本方式提供的模型系列（例如 DeepSeek 类别）设置此项，
  独立于模型提供方自身的 `input` 声明，因此模型可以声明 `input: [text, image]`
  却仍不发送图像。逐模型 `compat` 会在这些规则之上深度合并并优先：对于端点确实接受 `image_url` 的 ID，
  设置 `stripImageInput: false`，例如提供视觉增强的
  代理。默认：自动（目录类别和模型提供方规则）。Responses 和 Anthropic/Google
  编码器会发送模型声明的模态，`pi-native` 传输也一样（它将
  原始上下文转发到网关，因此防护不会在客户端运行，`images` 列报告
  声明的 `input`）。

推理/思考：

自定义模型和覆盖条目可定义 `thinking`，其中 `mode` 和 `efforts` 为必填，还可包含
`defaultLevel`、`effortMap`、`supportsDisplay` 和 `requiresEffort`。模式为 `effort`、`budget`、
`google-level`、`anthropic-adaptive` 和 `anthropic-budget-effort`。强度按
`minimal|low|medium|high|xhigh|max` 排序。旧式 `levels` 或 `minLevel`/`maxLevel` 形状会规范化为
`efforts`；显式 `efforts` 优先于这两种形式。
`requiresEffort` 默认自动检测；只有确认
配置的后端接受显式关闭推理的
请求后，才设为 `false`。这使 `:off` 选择器不会被钳制到最低强度。

对于采用默认 `thinkingFormat: openai` 的自定义模型，`--thinking off`
在 `openai-completions` 上没有显式关闭载荷：发送 `reasoning_effort` 时，
它会请求 `efforts` 中列出的第一个强度，即使
`requiresEffort: false` 也如此（例如，`efforts: [low, medium, high]` 会发送
`reasoning_effort: low`），因此请按从低到高的顺序列出强度。关闭推理
需要服务器视为关闭的请求形状；例如，
`thinkingFormat: qwen-chat-template` 会发送
`chat_template_kwargs: { enable_thinking: false }`。

- `supportsReasoningEffort`：接受 `reasoning_effort`。默认：端点/模型策略；同一模型提供方内支持的方言可能不同。
- `supportsReasoningParams`：请求形状处理是否可以发送任何推理参数。默认：自动（GitHub Copilot chat-completions 关闭）。
- `supportsReasoningSummary`：允许 Responses 推理摘要。默认：端点/模型策略；对于拒绝 `reasoning.summary` 的端点，设为 `false`。
- `reasoningEffortMap`：从内部强度等级（`minimal|low|medium|high|xhigh|max`）到模型提供方特定字符串的部分映射（例如 Fireworks GLM 将 `minimal -> "none"`）。
- `thinkingFormat`：思考的请求形状：`"openai"`（`reasoning_effort`）、`"openrouter"`（`reasoning: { effort }`）、`"zai"`（`thinking: { type: "enabled" }`）、`"qwen"`（顶层 `enable_thinking`）或 `"qwen-chat-template"`（`chat_template_kwargs.enable_thinking`）。默认：端点/模型策略，通常为 `"openai"`。
- `qwenTemplateReasoningEffort`：将所选强度路由到 Qwen 3.8+ 聊天模板的 `reasoning_effort` 关键字参数（`chat_template_kwargs.reasoning_effort`，以及 `qwen` 方言上的顶层字段）。默认：目录策略（在 LM Studio、llama.cpp 发现和 vLLM 上为 Qwen 3.8+ 启用）。对于拒绝未知 `chat_template_kwargs` 的严格服务器，设为 `false`；之后 Qwen 方言不会发送强度选择，模板按自身默认值运行。
- `reasoningContentField`：承载思维链的助手字段：`"reasoning_content"`、`"reasoning"` 或 `"reasoning_text"`。默认：自动。
- `requiresReasoningContentForToolCalls`：助手工具调用轮次必须往返传递推理字段。默认：端点/模型策略（包括 DeepSeek、Kimi 和启用推理的 OpenRouter）。
- `allowsSyntheticReasoningContentForToolCalls`：当先前助手工具调用轮次缺少模型提供方推理内容时，允许占位推理字段。默认：端点/模型策略；对于验证精确推理值的模型提供方，设为 `false`。
- `requiresAssistantContentForToolCalls`：助手工具调用轮次必须包含非空文本内容。默认：端点/模型策略（包括 Kimi 和直接 DeepSeek 推理）。
- `whenThinking`：在请求实际启用思考模式时应用的部分 compat 覆盖（在基线 compat 之上深度合并）。

工具/消息规范化：

- `requiresToolResultName`：工具结果消息需要 `name` 字段（Mistral）。默认：自动。
- `requiresAssistantAfterToolResult`：工具结果后的用户消息需要在中间插入助手轮次。默认：自动。
- `requiresThinkingAsText`：将思考块转换为包裹在 `<thinking>` 分隔符中的文本（Mistral）。默认：自动。
- `requiresMistralToolIds`：将工具调用 ID 规范化为恰好 9 个字母数字字符。默认：自动。
- `supportsStrictMode`：接受工具模式上的逐工具 `strict` 字段。默认：按模型提供方/baseUrl 保守地自动检测。
- `toolStrictMode`：`"all_strict"` 强制对每个工具启用严格模式，`"none"` 强制关闭；未设置时使用端点/模型策略（通常为混合，Cerebras 主机上全部严格）。

网关路由（在 `baseUrl` 匹配网关时应用）：

- `openRouterRouting.only` / `openRouterRouting.order`：`openrouter.ai` 上的模型提供方路由（参见 <https://openrouter.ai/docs/provider-routing>）。
- `vercelGatewayRouting.only` / `vercelGatewayRouting.order`：`ai-gateway.vercel.sh` 上的模型提供方路由（参见 <https://vercel.com/docs/ai-gateway/models-and-providers/provider-options>）。

模型提供方级别的 `compat` 是基线；逐模型 `compat` 在其之上深度合并，
其中 `openRouterRouting`、`vercelGatewayRouting`、`extraBody` 和 `whenThinking` 按嵌套对象合并。

### Anthropic 兼容性（`anthropic-messages`） \{#anthropic-compatibility-anthropic-messages}

对于 `anthropic-messages` 模型，运行时使用独立的 `AnthropicCompat` 形状
（`packages/catalog/src/types.ts`）。`models.yml` 模式将严格工具退出选项暴露为
顶层模型提供方字段；在 `compat` 内，它接受所有同时也是
`AnthropicCompat` 字段名的共享键：`supportsContextManagement`、`supportsEagerToolInputStreaming`、
`supportsForcedToolChoice`、`allowAnthropicHeaderOverrides`、`requiresToolResultId`、
`replayUnsignedThinking`、`bedrockMessagesApi`、`stripImageInput` 和 `streamIdleTimeoutMs`。其他 Anthropic 侧选项
由内置目录元数据提供，不能在此配置，`applyCompatOverrides`
会丢弃已解析形状未声明的覆盖键。

### Bedrock 兼容性（`bedrock-converse-stream`） \{#bedrock-compatibility-bedrock-converse-stream}

同一个 `compat` 槽位对 Bedrock 模型接受 `promptCacheMode`（`none`、`automatic` 或 `explicit`）、
`supportsLongPromptCacheRetention`、`promptCacheMinimumTokens`、
`promptCacheMaximumCheckpoints`、`supportsForcedToolChoice`（为 `false` 时，强制 `any`/`tool` 选择
回退到 `auto`；Claude Opus/Sonnet 5.5 已内置），以及
`supportsThinkingBindingControls`。前缀绑定的 Claude 模型（Fable 5.1+、
Opus/Sonnet/Haiku 5.5）默认发送 `thinking.block_binding`、`thinking-binding-controls-2026-08-01`
beta 和 `/input_transformations` 响应路径；对于
拒绝它们的网关或区域，设置 `supportsThinkingBindingControls: false`。本地
前缀绑定防护仍然开启，前缀不匹配的拒绝会在
剥离绑定思考后重试一次。

默认情况下，`bedrock-converse-stream` 请求发送到 `bedrock-runtime.{region}.amazonaws.com`。
显式逐请求区域或模型 ARN 的区域优先。否则，若
`AWS_REGION`/`AWS_DEFAULT_REGION`/AWS 配置档案中的环境区域与推理
配置档案的地理前缀兼容，则使用该区域；兼容的防护栏 ARN 区域或该地理位置的默认区域作为
回退。没有已识别地理前缀的模型使用环境区域，其次防护栏 ARN
区域，再其次区域性 `baseUrl` 区域，最后 `us-east-1`。在 `providers.amazon-bedrock`
（或使用
`api: bedrock-converse-stream` 的自定义模型提供方）上设置 `baseUrl` 可将请求改发到其他位置，例如 VPC/PrivateLink
端点、FIPS 主机或网关。`baseUrl` 上的任何路径或查询字符串都会保留，路径
作为前缀，查询追加到最终 URL（签名时也包含在 SigV4 的规范请求中），
因此最终 URL 为 `{baseUrl}/model/{id}/converse-stream[?query]`。这涵盖了
通过查询参数而不是请求头认证的网关：

```yaml
providers:
   amazon-bedrock:
      baseUrl: https://vpce-0123456789abcdef0.bedrock-runtime.us-east-1.vpce.amazonaws.com
```

有一种主机形状不会按字面使用：`baseUrl` 恰为
`bedrock-runtime.{region}.amazonaws.com` 时，它是 AWS 自身的端点，其区域部分会替换
为解析出的区域，签名必须匹配其发送到的区域，且每个捆绑 Bedrock
模型都已经携带这样的 `baseUrl`。使用不同的主机（VPC 端点、`-fips`、网关）可
精确固定源站。

对于没有已识别地理前缀的模型，当环境区域
和防护栏 ARN 区域未设置时，区域性 `baseUrl` 会设置区域。SigV4 使用该区域签名，而不是默认的 `us-east-1`。
环境区域或区域限定的模型 ID/ARN 会覆盖它。接受 bearer token
而不是 SigV4 的网关不需要 AWS 签名凭据：设置
模型提供方的 `apiKey`（或 `AWS_BEARER_TOKEN_BEDROCK`），就会跳过签名。区域解析仍然
控制 AWS 的默认主机。

### Bedrock Anthropic Messages API（`/anthropic`）上的 Claude \{#claude-on-bedrocks-anthropic-messages-api-anthropic}

Amazon Bedrock 还通过 Anthropic Messages API 提供 Claude，位于其两个
端点的 `/anthropic` 下。AWS 建议新应用使用 `bedrock-runtime`
（[使用 Anthropic Messages API 进行推理](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html)）。
Claude Opus 4.7 及更新版本在此提供；Opus 4.6 及更早版本继续使用 Converse
（[Amazon Bedrock 中的 Claude](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)）。

| 路由 | 基础 URL | 模型提供方 | 模型 ID |
| --- | --- | --- | --- |
| bedrock-runtime | `https://bedrock-runtime.<region>.amazonaws.com/anthropic` | `amazon-bedrock` | 推理配置档案，例如 `us.anthropic.claude-opus-5-5` |
| bedrock-mantle | `https://bedrock-mantle.<region>.api.aws/anthropic` | `bedrock-mantle` | `anthropic.claude-opus-5-5` |

FIPS 主机（`bedrock-runtime-fips.<region>.amazonaws.com`）和 AWS PrivateLink 端点专用
主机（`<vpce-id>[-<az>].bedrock-runtime.<region>.vpce.amazonaws.com`，
`bedrock-runtime-fips` 和 `bedrock-mantle` 也一样）会被识别为相同路由。启用了
私有 DNS 的 VPC 端点无需更改：它会在公共主机名上响应
（[Bedrock VPC 端点](https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-interface-endpoints.html)）。

在表中所示的模型提供方下定义模型，使用 `api: anthropic-messages`。这两个
模型提供方 ID 带有启用 Claude 按需上下文压缩的目录规则
（[上下文压缩](./compaction.md)）。设置 `auth: apiKey`，使 OMP 发送普通 API 密钥请求；没有
它，自定义 `anthropic-messages` 模型会采用 Claude Code 请求形状。示例使用
[Amazon Bedrock API 密钥](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)进行认证；
OMP 不会用 SigV4 对 runtime 路由请求签名。将区域写入 runtime URL。Mantle
URL 可以保留 `{region}`，OMP 会根据你的 AWS 区域设置填充。

```yaml
providers:
   amazon-bedrock:
      baseUrl: https://bedrock-runtime.us-east-1.amazonaws.com
      apiKey: AWS_BEARER_TOKEN_BEDROCK
      auth: apiKey
      models:
         - id: us.anthropic.claude-opus-5-5
           api: anthropic-messages
           baseUrl: https://bedrock-runtime.us-east-1.amazonaws.com/anthropic
           reasoning: true
           input: [text, image]
   bedrock-mantle:
      baseUrl: https://bedrock-mantle.{region}.api.aws/openai/v1
      apiKey: AWS_BEARER_TOKEN_BEDROCK
      auth: apiKey
      models:
         - id: anthropic.claude-opus-5-5
           api: anthropic-messages
           baseUrl: https://bedrock-mantle.{region}.api.aws/anthropic
           reasoning: true
           input: [text, image]
```

这些路由上的请求由 `compat.bedrockMessagesApi` 塑形，OMP 会根据任何模型提供方 ID 下的 Bedrock
`/anthropic` `baseUrl` 检测它。两条路由都拒绝工具的 `strict` 字段，因此 OMP 会移除
它。OMP 还会使 `metadata.user_id` 符合
Bedrock 的[请求元数据模式](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)，
runtime 路由会强制执行此模式：符合模式的值会保留，否则发送其会话 ID，
再否则省略。两项处理均在所有 `onPayload` 钩子之后执行。两条路由都会验证思考
签名，因此 OMP 默认不向它们重放未签名思考。

URL 检查无法看到代理后面的 Bedrock 路由，或第一方 `anthropic` 模型提供方通过 `ANTHROPIC_BASE_URL` 进行的
重路由；除非你选择启用，否则它们继续使用普通 Anthropic 请求。在
`compat` 中（模型提供方级别或 `modelOverrides` 下）设置该标志以启用，或设为 `false` 让 Bedrock URL
退出：

```yaml
providers:
   anthropic:
      compat:
         bedrockMessagesApi: true # ANTHROPIC_BASE_URL points at bedrock-runtime /anthropic
```

按需上下文压缩仍需要目录授予该能力的模型系列（`amazon-bedrock`、
`bedrock-mantle`、`anthropic` 或 `google-vertex` 模型提供方 ID）；任意代理模型提供方 ID 不会
因为 `bedrockMessagesApi` 就获得该能力。

### 严格工具模式（`disableStrictTools`） \{#strict-tool-schemas-disablestricttools}

Anthropic API 支持工具定义上的 `strict` 字段，强制模型始终精确遵循提供的模式。OMP 默认为一小部分高频内置 `anthropic-messages` 工具（`python`、`edit` 和 `find`）允许列表启用它，这些工具的模式符合 Anthropic 的严格语法限制；其他工具仍发送规范化模式，但省略 `strict`。`bash` 不在其中：严格解码固定属性顺序，因此调用一旦写出了 `async`，就不能再发出声明在它之前的 `timeout`。

前置 Anthropic API 的第三方模型提供方（AWS Bedrock、Azure、自托管代理）不一定实现该字段，并会拒绝包含它的请求。在模型提供方级别设置 `disableStrictTools: true`，可让允许列表内的工具退出严格模式：

```yaml
providers:
   bedrock-anthropic:
      baseUrl: https://bedrock-runtime.us-east-1.amazonaws.com/anthropic
      apiKey: AWS_BEARER_TOKEN
      api: anthropic-messages
      disableStrictTools: true
      models:
         - id: claude-sonnet-4-20250514
           name: Claude Sonnet 4 (Bedrock)
           input: [text, image]
           contextWindow: 200000
           maxTokens: 16384
           cost:
              input: 3.00
              output: 15.00
              cacheRead: 0.30
              cacheWrite: 3.75
```

`disableStrictTools` 是模型提供方级别的标志，适用于该模型提供方内的所有模型。它会为 OMP 原本会标记为严格的工具禁用 Anthropic `strict` 标记；不会改变运行时工具参数验证。Anthropic 在首个流式 token 之前报告严格语法过大错误后，OMP 可以自动以非严格工具重试，但因其他原因拒绝 `strict` 字段的代理应显式设置此标志。当 GCP 组织策略 `vertexai.allowedPartnerModelFeatures` 不允许 `structured_outputs` 时，`google-vertex` 上的 Claude 也可能拒绝严格工具；OMP 会去掉 `strict` 重试一次，并在会话中固定 `strictToolsDisabled`。为 `google-vertex` 设置 `disableStrictTools: true` 可跳过该失败的首个请求。

在线上传输的工具模式由
`packages/ai/src/utils/schema/normalize.ts` 中的统一流程规范化（Google/MCP 分发器
以及 OpenAI 严格模式的清理+强制执行流水线）。严格模式
边界情况（本地 `$ref` 内联、单项 `allOf` 折叠、
`anyOf` 包装器描述提升、enum/const 基本类型推断）
和逐模型提供方分发器映射，参见
[`ai-schema-normalize.md`](./ai-schema-normalize.md)。

## 实用示例 \{#practical-examples}

### 本地 OpenAI 兼容端点（无认证） \{#local-openai-compatible-endpoint-no-auth}

```yaml
providers:
   local-openai:
      baseUrl: http://127.0.0.1:8000/v1
      auth: none
      api: openai-completions
      models:
         - id: Qwen/Qwen2.5-Coder-32B-Instruct
           name: Qwen 2.5 Coder 32B (local)
```

对于 oMLX 或其他具有可发现 `/v1/models` 端点的本地 OpenAI 兼容服务器，优先使用发现，而不是手动列出模型。将 `api` 设为服务器实际暴露的端点系列：`openai-completions` 使用 `/v1/chat/completions`；暴露 `/v1/responses` 的服务器则需要 `openai-responses`。

```yaml
providers:
   omlx:
      baseUrl: http://127.0.0.1:11434/v1
      auth: none
      api: openai-completions
      discovery:
         type: openai-models-list
```

内置 vLLM 模型提供方可以指向非默认端点，无需声明自定义发现类型。OMP 使用 vLLM 的 `/v1/models` 元数据，并将 vLLM 的 `max_model_len` 字段保留为发现的上下文窗口。

```yaml
providers:
   vllm:
      baseUrl: http://192.168.5.3:8085/v1
      auth: none
```

对于多个 vLLM 端点，使用任意模型提供方 ID，配合通用 OpenAI 兼容发现路径。本地无认证服务器设置 `auth: none`，需要认证的服务器设置 `apiKey`。通用发现先读取 `max_model_len`，再读取 `context_length` 作为通用 OpenAI 兼容回退。

```yaml
providers:
   vllm-fast:
      baseUrl: http://host-a:8000/v1
      auth: none
      api: openai-completions
      discovery:
         type: openai-models-list
   vllm-long:
      baseUrl: http://host-b:8000/v1
      auth: none
      api: openai-completions
      discovery:
         type: openai-models-list
```

### 使用环境变量密钥的托管代理 \{#hosted-proxy-with-env-based-key}

```yaml
providers:
   anthropic-proxy:
      baseUrl: https://proxy.example.com/anthropic
      apiKey: ANTHROPIC_PROXY_API_KEY
      api: anthropic-messages
      auth: apiKey
      authHeader: true
      disableStrictTools: true # if the proxy doesn't support strict tool schemas
      models:
         - id: claude-sonnet-4-20250514
           name: Claude Sonnet 4 (Proxy)
           reasoning: true
           input: [text, image]
```

### 覆盖内置模型提供方路由和模型元数据 \{#override-built-in-provider-route--model-metadata}

```yaml
providers:
   openrouter:
      baseUrl: https://my-proxy.example.com/v1
      headers:
         X-Team: platform
      modelOverrides:
         anthropic/claude-sonnet-4:
            name: Sonnet 4 (Corp)
            compat:
               openRouterRouting:
                  only: [anthropic]
```

## 旧版使用方注意事项 \{#legacy-consumer-caveat}

现在，大多数模型配置通过 `ModelRegistry` 流经 `models.yml` / `models.yaml`。
通过编程方式传入时，仍支持显式 `.json` / `.jsonc` 路径；活动智能体
目录的 `models.yml` 优先于 `models.yaml`。

## 失败模式 \{#failure-mode}

如果 `models.yml` / `models.yaml` 未通过模式或验证检查：

- 注册表继续使用内置模型运行
- 错误通过 `ModelRegistry.getError()` 暴露，并显示在 UI/通知中
