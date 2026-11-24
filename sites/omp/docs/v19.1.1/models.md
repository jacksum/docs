---
title: "模型和模型提供方配置"
description: "Oh My Pi v19.1.1 仓库文档：模型和模型提供方配置。"
---

# 模型与模型提供方配置（`models.yml` / `models.yaml`） \{#model-and-provider-configuration-modelsyml--modelsyaml}

本文介绍 coding-agent 如何加载模型、应用覆盖配置、解析凭据，以及如何在运行时选择模型。

## 控制模型行为的配置与实现 \{#what-controls-model-behavior}

主要实现文件：

- `packages/coding-agent/src/config/model-registry.ts`：加载内置和自定义模型，应用模型提供方覆盖配置，执行运行时发现并集成身份验证
- `packages/coding-agent/src/config/model-resolver.ts`：解析模型匹配模式，并选择初始、smol 和 slow 模型
- `packages/coding-agent/src/config/model-settings.ts`：模型选择设置（`modelRoles`、`enabledModels`、`enabledProviders`/`disabledProviders`、`modelProviderOrder`、`cycleOrder`）
- `packages/coding-agent/src/session/settings.ts`：模型提供方的传输方式偏好设置（`providers.*`）
- `packages/coding-agent/src/config/models-config.ts` 和 `models-config-schema-bundle.ts`：校验自定义模型提供方和模型
- `packages/coding-agent/src/session/auth-storage.ts`：重新导出 `AuthStorage`，其来源为 `@oh-my-pi/pi-ai`；凭据优先级在 `packages/ai/src/auth/cascade.ts` 中实现
- `packages/catalog/src/compat/resolve.ts` 和 `compat/rules/`：解析兼容性与模型策略
- `packages/catalog/src/models.ts` 和 `packages/catalog/src/types.ts`：内置模型提供方、内置模型及公开的模型类型

## 配置文件位置与旧版兼容行为 \{#config-file-location-and-legacy-behavior}

默认配置档案的配置路径，按优先级排列：

- `~/.omp/agent/models.yml`
- `~/.omp/agent/models.yaml`

这些路径以 `getAgentDir()` 返回的当前智能体目录为基准。命名配置档案使用
`~/.omp/profiles/<name>/agent/`；`PI_CONFIG_DIR` 更改配置根目录的名称，
`PI_CODING_AGENT_DIR` 可覆盖默认配置档案的智能体目录。通过代码为
`ModelRegistry` 指定的路径优先于根据目录推导出的位置。

仍保留以下旧版兼容行为：

- 如果两个 YAML 文件都不存在，而同一位置有 `models.json`，则将它迁移为 `models.yml`。
- 显式指定的 `.json` / `.jsonc` 配置路径仍受支持，但须通过代码传入 `ModelRegistry`。

## `models.yml` / `models.yaml` 的结构 \{#modelsyml--modelsyaml-shape}

```yaml
providers:
   <provider-id>:
      # provider-level config
```

`provider-id` 是选择模型提供方和查找其身份验证信息时统一使用的模型提供方键。

`providers` 是模型注册表唯一读取的根级键。当前校验规则不会拒绝未知的根级键，但这些键不影响模型行为。

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

`maxContextWindow` 可用于 `models` 条目和 `modelOverrides`。
将 `contextWindow` 设为常规提示词窗口大小，将 `maxContextWindow` 设为
模型提供方接受的更大窗口。`/extended-context on` 选用较大的窗口；
`off` 恢复常规窗口。如果覆盖配置只指定了
`contextWindow`，窗口在两种模式下都保持不变。此设置只调整 OMP 的
本地上下文预算，模型提供方的服务端限制不变。请确认端点
接受相应大小的请求。
配置的最大值不会取代模型提供方声明的容量。对受目录覆盖规则上限约束的
模型（例如 Codex Astra），目录上限仍然有效。
OMP 会先解析模型级覆盖配置（包括已停用的变体别名），
再选择扩展窗口。

自定义 `models` 条目可以指定自己的 `baseUrl`，否则继承模型提供方的 URL。
对于内置模型，模型提供方的 `baseUrl` 覆盖仅适用于继承该地址的自定义模型实际使用的 API；
若配置仅用于覆盖，则以模型提供方的 `api` 为作用范围。两者都未限定时，
该覆盖适用于整个模型提供方。`transport: pi-native` 始终将网关 URL 应用于整个模型提供方。
未限定作用范围的 OpenRouter `baseUrl` 指向 `/api/v1` 聊天根路径，因此 OpenRouter Decisions（裁决）
模型使用同一主机上的同级路径 `/api/alpha`。例如，`.../api/v1` 的中转服务在
`.../api/alpha/decisions` 提供裁决服务。

`omitMaxOutputTokens` 会省略根据模型得出的输出上限。

`compat.base64SkipThoughtSignature`（Google API，默认值 `false`）：将用于绕过未签名工具调用验证的特殊值进行 Base64 编码后发送。如果 `google-generative-ai` 模型使用的网关会将 `thoughtSignature` 按 Base64 解码，并在收到原始字面值 `skip_thought_signature_validator` 时返回 HTTP 400，就为该模型设置此选项。例如，Gemini 重放另一个模型的工具调用历史时可能遇到这种情况：

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

### 标准 Responses API 的 WebSocket \{#standard-responses-websockets}

标准 Responses API 默认使用 HTTP/SSE，OpenAI 官方端点也一样。
要在 OMP 中启用 WebSocket，请在 `config.yml` 中设置：

```yaml
providers:
  openaiResponsesWebsockets: true
```

目录中的 `supports-websockets` KDL 规则只标记是否支持 WebSocket，不会启用它。
此规则涵盖 OpenAI 的 `openai-responses`，包括继承这种模型提供方类型的自定义模型提供方。
Copilot、OpenRouter 以及其他未标记的模型提供方与 API 组合
仍使用 HTTP/SSE。独立设置 `providers.openaiWebsockets: auto|off|on`
和 `PI_CODEX_WEBSOCKET` 仍只控制 Codex。

模型级和请求级 `preferWebsockets` 只能进一步限制 OMP 的设置：**任一层显式设为
`false` 就会禁用 WebSocket**，即使另一层设为 `true`。OMP 的关闭设置无法被覆盖。
直接使用 pi-ai SDK 不依赖 OMP 设置：调用方必须在请求或模型上显式设为
`true` 才能启用；任一层为 `false` 仍会禁用它。

如果网关只支持部分模型使用 WebSocket，请保留 `models.yml` 中现有的模型提供方条目，
并为受影响的模型禁用 WebSocket：

```yaml
providers:
  openai:
    api: openai-responses
    baseUrl: https://gateway.example.com/v1
    modelOverrides:
      gpt-5:
        preferWebsockets: false
```

自定义 `models` 条目也接受同一布尔值。WebSocket 沿用现有的 `/responses`
端点和身份验证机制；网关必须实现 `response.create`。
覆盖 SDK 的 `fetch` 只影响 HTTP/SSE，不影响 WebSocket。显式启用 WebSocket 时，
套接字不使用这一 HTTP 覆盖；回退到 HTTP 时仍会使用它。

OMP 在连接前构建请求载荷并调用 `onPayload`，已取消的请求也一样。
如果发送前握手遇到网络故障、连接超时，或协议升级返回
404/405/426/501，OMP 会按 HTTP 的常规存储与请求串联规则重建完整的候选 HTTP 请求，
并再次调用 `onPayload`。该钩子可替换每个候选请求，但看不到
最终仅通过该套接字发送的增量。其他升级状态码仍按常规规则分类。
诊断信息会保留状态码和可用的响应头，
不会缓冲被拒绝的升级响应体。

握手响应头可用时，`onResponse` 会针对实际的 WebSocket
握手报告一次，并标记 `metadata.transport="websocket"` 和
`metadata.phase="handshake"`。复用套接字不会再报告一次握手。
这些响应头并非每次生成的响应头；OMP 不会凭空生成相应的请求 ID。
响应元数据能辨识传输方式时，`omp bench --json` 会输出该方式。
标准 WebSocket 的缓存基准测试仍会统计生成用量，但不会报告
每次生成的请求 ID 或 HTTP 响应缓存头。

保持连接且状态正常的套接字可以用 `previous_response_id` 发送增量轮次，
即使设为 `store: false` 也可以。历史或选项变化、凭据变化、并发使用临时套接字，
或超过 **30 秒空闲上限**后更换套接字时，都必须发送完整输入，不能沿用
旧套接字的锚点。续接遵循与 HTTP 请求串联相同的关闭条件：
`statefulResponses: false`、`PI_OPENAI_STATEFUL=0` 或模型的
`compat.statefulResponses: false` 都会让每个 WebSocket 轮次发送完整历史，因此，如果网关忽略
`previous_response_id`，请设置此兼容性选项。锚点连续三次因失效而被拒绝后，
该逻辑会话不再发送锚点。官方 HTTP 端点已经能利用存储状态串联请求，
且不受套接字生命周期限制，
因此在该端点上使用 WebSocket 不一定能减少流量或延迟。

请求中注入的 `previous_response_id` 和 `background: true` 会被拒绝。如果首帧明确
报告锚点失效，且没有迹象表明已开始生成，OMP 可以在同一个状态正常的套接字上
重发一次完整历史。WebSocket 不沿用 HTTP 对暂时性故障、恢复或空补全结果的重试机制；
WebSocket 请求成功返回空结果时，也只提交一次。

发送结果不确定时，如果出现传输故障或流超时，该调用会失败，且不会在后台用 HTTP 重发。
已收到的部分输出仍可使用；现有的智能体恢复机制可按自身规则启动 SSE 续接，
保留已完成的工具调用结果，
且不会用不完整的参数执行工具调用。
调用方中止、协议错误或队列错误不会被标记为传输不兼容。

升级被拒绝（404/405/426/501）或发送后发生传输故障，会让同一逻辑会话、
端点和模型持续降级为 SSE，直到调用 `releaseSession` 或模型提供方状态的
`close`，或进入新的作用范围。发送前的网络故障或连接超时只会让当前请求回退；
连续发生两次才会持续回退，完成一次 WebSocket 交互会重置计数。
保留模型提供方状态的集成方必须释放已完成的会话。
没有逻辑会话 ID 的调用不共享这种持续降级状态；
未提供 `providerSessionState` 时，该状态仅在当前调用内有效。
正常的空闲关闭不算降级。
Codex 的协议与恢复机制仍然独立。

### Bedrock 请求选项 \{#bedrock-request-options}

模型提供方级的 `guardrailIdentifier`、`guardrailVersion` 和 `guardrailTrace` 为
Converse 请求附加防护规则。指定标识符时，版本默认为 `"DRAFT"`；跟踪选项接受
`enabled`、`disabled` 或 `enabled_full`。`requestMetadata` 提供调用日志标签。
OMP 在发送前丢弃无效条目和超出 Bedrock 16 条限制的条目；请求级标签覆盖同名的
模型级标签。这些字段不适用于 Anthropic Messages 路由。

### 压缩选项 \{#compaction-options}

- `compactionModel`（模型级，包括 `modelOverrides`）：首选压缩模型，先于当前模型、聊天角色的候选模型和上下文窗口最大的回退模型尝试。它不会切换当前会话使用的模型。
- `remoteCompaction`（模型提供方级或模型级）：为符合条件的模型启用模型提供方的原生压缩。支持的键：`enabled`、`api`、`endpoint`、`model`、`v2StreamingEnabled`、`v2Endpoint`、`streamingEndpoint`。以模型提供方级设置为基础，模型级键可覆盖这些设置。

### 模型提供方和模型允许使用的 `api` 值 \{#allowed-providermodel-api-values}

- `openai-completions`
- `openai-responses`
- `openai-codex-responses`
- `azure-openai-responses`
- `anthropic-messages`
- `bedrock-converse-stream`
- `google-generative-ai`
- `google-gemini-cli`
- `google-vertex`
- `typesafe`
- `openrouter-decisions`
- `openai-decisions`
- `google-decisions`
- `workers-ai-systemone`

`typesafe`、`openrouter-decisions`、`openai-decisions`、`google-decisions` 和 `workers-ai-systemone` 是裁决 API，不用于传输聊天请求。声明使用这些 API 的模型回答裁决请求，由 `judge` 模型角色选择。`typesafe` 将 TypeSafe 的 System One 请求体发送到 `{baseUrl}/v1/systemone`（可使用任何 System One 服务端，例如 TypeSafe、OpenJEV、Kev 或自托管的 Clef）；`openrouter-decisions` 将相同的请求体发送到 `{baseUrl}/decisions`；`openai-decisions` 按 `{baseUrl}/decisions` 上 OpenAI Decisions API 的格式转换问题和答案（内置的 `openai/gpt-6-luna-decisions` 条目在请求中发送的模型标识为 `gpt-6-luna`）；`google-decisions` 按 `{baseUrl}/decisions` 上 Google Gemini Decisions API 的格式转换问题和答案，并在 `x-goog-api-key` 中传入密钥（内置的 `google/gemini-decision-1` 条目）；`workers-ai-systemone` 将 System One 请求体发送到 Cloudflare Workers AI 的 `{baseUrl}/{model id}`，其中基础 URL 中的 `<account>` 由已存储凭据中的账户 ID 或 `CLOUDFLARE_ACCOUNT_ID` 填充。其 `headers` 为这类请求提供网关路由或自定义身份验证所需的请求头。
裁决请求可以与视觉聊天请求共用图片附件。原生 OpenAI Decisions、Gemini Decisions、TypeSafe Jev、OpenRouter Jev 和 Workers AI 裁决模型，以及通过提示词执行裁决的视觉聊天模型，都支持图片；收到带图片的请求时会跳过纯文本候选模型。`Judge.supportsImages` 标识兼容的候选模型；如果裁决链中没有支持图片的模型，请求会明确报错，不会丢弃图片后继续。通过提示词进行裁决时，会针对选中的候选模型规范化图片，包括放大尺寸不足的位图，以及为使用 STB 解码器的模型转换 WebP；原生裁决模型仍接收原始图片字节。为 System One 直接构造 `NativeJudge` 时，请设置 `supportsImages: true`；`createNativeJudge` 根据目录确定这个标志。

以目录为依据构造的原生裁决模型会采用所选模型的图片尺寸限制。直接构造 `NativeJudge` 时可显式传入 `imageInput` 限制；为其他 System One 模型启用图片支持时，不会继承 Jev 的尺寸限制。

无论使用哪个基础 URL，`openrouter-decisions` 裁决模型都会像 OpenRouter 聊天模型一样采用该模型的 `compat.openRouterRouting` 和 `compat.extraBody`：先将路由设置（包括通过选择器 `@provider` 固定的模型提供方）写入请求的 `provider` 字段，再将 `extraBody` 合并到请求体并覆盖同名字段。`openRouterRouting` 只接受 `only` 和 `order`；对于 `allow_fallbacks` 或 `data_collection` 等其他[模型提供方偏好设置](https://openrouter.ai/docs/provider-routing)，请将完整的 `provider` 对象设在 `extraBody` 中，以替换整个路由配置块。其他裁决 API 会忽略这两个键。

```yaml
providers:
   openrouter:
      modelOverrides:
         typesafe/jev-1.14:
            compat:
               extraBody:
                  provider: { only: [typesafe], allow_fallbacks: false, data_collection: deny }
```

OpenAI Decisions 会转发嵌入的 `ImageContent.detail`，不同的显式保真度设置在原生图片裁决缓存中分别存储。TypeSafe Jev 没有对应的图片细节设置：发送请求和确定缓存标识时都会忽略该设置，因此只有该设置不同的请求可以复用同一答案。省略图片细节设置与显式指定 `auto` 都使用同一默认设置。

运行任何候选模型之前都会校验图片输入；无效图片会直接报为调用方错误，不会遍历整个裁决链。模型提供方可能另有约束。Workers AI Clef 最多接受 4 张 PNG、JPEG 或 WebP 图片，每张不超过 4 MiB 和 1600 万像素，总计不超过 8 MiB。有效的 Base64 编码是否带填充，以及 MIME 类型的大小写写法，都不影响缓存标识。

按图片要求筛选后，仍采用文本裁决的规则：一旦进入原生裁决阶段，某个原生裁决模型失败后，可以尝试下一个兼容的原生裁决模型，但不会回退到通过提示词执行裁决的聊天模型。筛选会排除不支持图片的原生模型，以及图片数量上限低于请求所带图片数量的原生模型。因此，如果没有剩余的兼容原生模型，符合条件的提示词裁决候选模型和支持视觉输入的回退会话模型仍可作答。图片尺寸限制不会导致原生模型被筛除；每张图片都会先调整到限制以内（见下文）。

#### Jev 图片支持（实验性） \{#jev-images-experimental}

Jev 的原生图片裁决是实验性功能。直连 TypeSafe Jev 支持 `jev-latest`、`jev-preview`、`jev-1.13.0` 和 `jev-1.14.0`（默认的 `judge` 角色使用 `typesafe/jev-1.14.0`；`jev-latest` 是 TypeSafe 的稳定版别名，自 2026-10-22 起指向 `jev-1.14.0`）。OpenRouter 支持 `typesafe/jev-1.13`、`typesafe/jev-1.14` 和 `~typesafe/jev-latest`。

图片会加入 `state`，但不替换原有内容：如果根节点是对象，就保留原有字段，并将图片放在避免键名冲突的 `__omp_judgment_images` 键下（如果该键已被占用，就加数字后缀）；如果根节点是数组，就追加到末尾；如果根节点是字符串，则变为 `[original, ...images]`。直连 TypeSafe 的请求将每张图片添加为一项 `assets` 条目，并在 `state` 中引用该条目；只有附带图片时才设置 `TypeSafe-Danger-Zone-Images: true`。调用方提供的资源（身份验证网关）必须逐一在 `state`、`instructions` 或 `criteria` 中引用；拆分后的每个请求只携带它所引用的资源。OpenRouter 将每张图片编码为一个 `image_url` 数据 URL 部分，既不使用 TypeSafe 请求头，也不使用顶层 `images` 字段。

纯文本请求保留原来的请求结构和字节内容。图片支持仅限于列出的 TypeSafe Jev 和 OpenRouter Jev 模型，不代表其他兼容 System One 的服务端或 OpenRouter Decisions 模型也支持图片。

两条路径都只接受 PNG 和 JPEG，单边长度须为 280-1568 像素，总像素数须为 78,400-2,458,624。其他输入会被拒绝，不会由服务端调整尺寸。因此，裁决链会在发送前把每张图片调整到原生裁决模型允许的尺寸以内。已符合限制的图片保留原始字节；超出上限的按原比例缩小，不足下限的在上限允许的范围内按原比例放大。如果宽高比过于极端，导致某一边仍不足下限，就用图片左上角像素的颜色填充（例如，将 401×41 的工具栏截图缩放为 1568×160，再居中放在 1568×280 的画布上）。调整后的图片重新编码为 PNG；如果 PNG 超过字节上限，则使用 JPEG。TypeSafe Jev 没有对应的图片细节设置，因此直连 TypeSafe 的请求会忽略 `ImageContent.detail`。

[边界框问题](https://docs.typesafe.ai/primitives/box)（`{ type: "box", instructions, image }`）需要 Jev 1.14，只会发送给 TypeSafe 和 OpenRouter Decisions 裁决模型。请求中只要有一个这类问题，裁决链就会跳过所有其他候选，不会回退到提示词裁决模型或会话模型。`image` 是请求中 `images` 的索引，不会随请求发出。因此，有多张图片时，仍需在 `instructions` 中指明要搜索哪张图。Jev 返回各边在它收到的图片中的相对坐标。如果调整尺寸时加入了填充，裁决链会将各边映射回传入的原图，并将落在填充区域内的边限制在原图边界上。

图片限制见 TypeSafe 的[图片文档](https://docs.typesafe.ai/images)和 OpenRouter 的[多模态 Decisions 指南](https://openrouter.ai/docs/guides/community/multimodal-decisions)。

OpenRouter 指南列出的最小边长为 256 px，但一份[Jev 1.14 实际请求报告](https://github.com/can1357/oh-my-pi/pull/15887#issuecomment-6218295982)显示，270×300 的 PNG 收到了 HTTP 400。因此，OMP 刻意将最小边长设为 280 px，这一限制仍然有效。

例如，将 TypeSafe Jev 配置为裁决模型，再用 JavaScript 或 Python 附上图片：

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

模型或 `modelOverrides` 条目也可以使用运行器 API，每种运行器 API 对应一种模型 `kind`；完整列表由 `RUNNER_API_KINDS` 定义，位于 `packages/catalog/src/types.ts`（例如，`openai-images` 对应 `image`，`openai-embeddings` 对应 `embedding`，`openai-speech` 对应 `tts`）。`web-search` 是内置功能，不能在这里指定，因此也不能指定 `kind: search`。`kind` 默认为该 API 对应的类型（聊天传输使用 `chat`），显式指定的 `kind` 必须是该 API 支持的类型。聊天传输支持 `chat` 和 `tiny`（用于 `tiny`、`memory` 和 `judge` 角色的小模型）；`generate_image` 可调用的聊天传输（`openai-responses`、`openai-codex-responses`、`google-generative-ai`、`google-gemini-cli`）还支持 `image`。对于 `openai-responses`，图片由同一模型提供方的 GPT-5 或更高版本的聊天模型，通过 Responses API 的 `image_generation` 工具生成，不走 `/images/generations`。以下配置将发现的网关模型分配给图片角色：

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

无论是显式配置的 `kind`，还是由运行器 API 隐式确定的类型，都优先于内置目录对同一 ID 的分类，在应用 `modelOverrides` 或刷新后仍保留。

加载 models.yml 时，只根据文件中指定的 API 校验 `modelOverrides` 的 `kind`：即覆盖条目自身的 `api`，或同 ID 的 `models` 条目指定的 API。内置模型或发现的模型之后才会获得 API，因此在应用覆盖配置时才用该 API 校验其 `kind`；如果该 API 不支持指定的类型，OMP 会忽略此设置并写入日志。如果 `api` 覆盖未指定 `kind`，则优先采用运行器 API 对应的类型；否则，若新 API 仍支持原类型，就保留它；再否则，将模型设为 `chat`。如果 `models` 条目用不同的 API 重新定义内置 ID，也遵循相同规则，因此用 `openai-completions` 重新定义图片模型条目会将其类型改为 `chat`。

### 允许的身份验证和发现配置值 \{#allowed-authdiscovery-values}

- `auth`：`apiKey`（默认）、`none` 或 `oauth`。`none` 和 `oauth` 免除自定义模型提供方必须配置 `apiKey` 的要求，但 `oauth` 不会创建凭据或注册登录流程。它会强制采用 OAuth 请求格式；可用凭据必须来自已存储的身份验证信息、环境变量或已配置的密钥。自定义 `anthropic-messages` 模型在省略 `auth` 时也采用 OAuth 请求格式；要使用普通 API 密钥请求格式，请设为 `auth: apiKey`。
- `discovery.type`：`ollama`、`llama.cpp`、`lm-studio`、`openai-models-list`、`proxy`、`litellm` 或 `apple-foundation-models`。在受支持的 Mac 上，系统会隐式注册 Apple 的传输方式；此 YAML 模式不允许将 `apple-foundation-models` 用作 `api` 值。
- `discovery.injectV1`：可选布尔值，默认为 `true`，适用于 `openai-models-list`。设为 `false` 后，直接从 `{baseUrl}/models` 获取模型列表，不插入 `/v1`。这适用于将 OpenAI 兼容接口放在带版本号的路径下的网关（例如 `https://api.opper.ai/v3/compat`），如果强制改用 `/v1/models`，会得到另一份更短的模型列表。与默认模式一样，`baseUrl` 中的查询字符串会被忽略。
- `discovery.advertisedReasoning`：可选布尔值，默认为 `true`，适用于 `openai-models-list`、`lm-studio` 和 `proxy`。发现过程读取 `/v1/models` 条目声明的推理能力（`supported_reasoning_levels` / `default_reasoning_level` / `reasoning`，在顶层或 `metadata` 下），并优先采用这些值，胜过根据内置参考条目作出的推断。因此，按自有目录路由的网关会提供目标路由实际接受的思考档位。如果条目列出 `none`，就会设为 `reasoningDisableMode: none-effort`，在关闭思考时发送关闭选项，而不会改为使用最低档位。声明的档位列表也会把 `defaultLevel` 限定在该列表内，避免目录策略加入条目未列出的档位。条目报告 `reasoning: false` 时，会覆盖同 ID 的参考条目中启用推理的设置。如果端点声明了路由不接受的档位，可将该选项设为 `false`，让发现过程只依据内置参考条目确定各模型的思考能力。未声明推理能力的条目不受此设置影响。显式设置的 `modelOverrides.<id>.thinking` 和 `compat.supportsReasoningEffort` 仍优先于上述两种来源。`litellm` 不接受此选项：其权威推理元数据来自 `/model_group/info`，因此该设置只会影响它的 `/v1/models` 回退路径。
- `transport`：仅支持 `pi-native`。设置后，该模型提供方下的所有模型都会向与 `omp auth-gateway` 兼容的 `baseUrl` 发送请求，使用的路由为 `POST /v1/pi/stream`；`apiKey` 是网关的 Bearer 凭据。该模型提供方的模型列表来自网关：OMP 从 `GET /v1/pi/models` 读取列表，因此可选择网关在运行时发现的模型，网关无法路由的模型则不再显示。如果网关没有这条路由，模型提供方仍使用内置列表。
- `imageInputDecoder`：仅支持 `stb`。如果服务后端使用不支持 WebP 的 STB 兼容图像解码器，请在自定义模型或 `modelOverrides` 条目中设置此项。OMP 在向模型提供方发送请求前，会转换随请求附带的 WebP 图片和历史记录中的 WebP 图片。
- `imageCountBudget`：正整数。在自定义模型或 `modelOverrides` 条目中设置此项，可指定发送到其主机的单次请求最多携带多少张图片。它取代目录中的限额；对目录规则未指定的模型提供方，该限额为 5。若网关后端的供应商允许更多图片，则需要设置此项：会话中的图片超过限额时，OMP 会丢弃最早的图片，从而改变已缓存的提示词前缀。
- `snapcompactShape`：`{ variant, frameSize? }`。在自定义模型或 `modelOverrides` 条目中设置此项，可指定归档页面采用的 snapcompact 帧规格，取代 OMP 为该模型系列选定的规格。`variant` 取 `snapcompact.shape` 中除 `auto` 以外的值（例如 `11on16-bw`）；`frameSize` 是帧的边长，单位为 px，必须是 64 到 2576 之间的整数，默认使用该变体自身的值。`snapcompact.shape` 不为 `auto` 时仍优先；帧仍会缩小到符合主机的 `image-max-edge` 限制，费用估算也仍按模型计算。
- `tokenizer`：当代理返回的模型 ID 含义不明确或不规范时，可指定内嵌的本地分词器。允许的值：`claude-v3`、`claude-v47`、`claude-v5`、`claude-v5-sonnet`、`qwen3`、`deepseek-v3`、`kimi-k2`、`glm5`、`cl100k`（OpenAI GPT-3.5 和 GPT-4）以及 `o200k`（OpenAI GPT-5 及更高版本）。省略时使用目录的模型标识规则；没有匹配规则的模型用 o200k 计数。

## 当前校验规则 \{#validation-rules-current}

### 完整自定义模型提供方（`models` 非空） \{#full-custom-provider-models-is-non-empty}

必填项：

- `baseUrl`
- `apiKey`，除非设置了 `auth: none` 或 `auth: oauth`
- 在模型提供方级别或在每个模型中指定 `api`

### 仅覆盖配置的模型提供方（`models` 缺失或为空） \{#override-only-provider-models-missing-or-empty}

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

- `discovery.timeoutMs` 覆盖该模型提供方的运行时 HTTP 探测超时，以毫秒计。它必须为有限的正数。
- 不指定覆盖值时，Ollama 和 llama.cpp 的回环地址探测采用各端点的较短时限（150-250 ms），探测远程或局域网地址时使用 10 秒。通用模型列表和代理探测默认使用 10 秒。
- `discovery` 要求模型提供方级别的 `api`，但 `discovery.type: proxy` 例外（会自动检测每个模型的通信协议）。

### 远程压缩 \{#remote-compaction}

仅覆盖配置的模型提供方只需定义 `remoteCompaction` 即可满足校验要求。
它支持 `enabled`、`api`、`endpoint`、`model`、`v2StreamingEnabled`、
`v2Endpoint` 和 `streamingEndpoint`。

在 Amazon Bedrock 的 OpenAI 路由上，`openai-responses` 模型默认使用 OpenAI 原生压缩，
不受模型提供方 ID 限制。这些路由包括 `/openai/…`（位于 `bedrock-runtime.<region>.amazonaws.com` 或
`bedrock-mantle.<region>.api.aws` 上）、Mantle 的 `/v1` 基础路径、Runtime 的 FIPS 主机，以及两个端点的 PrivateLink 主机。
设为 `enabled: false` 可禁用它；设为
`v2StreamingEnabled: false` 则仅保留 V1
`/responses/compact` 请求。参见[压缩](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/compaction.md)。

Bedrock Converse 上的 Claude 模型通过向 AWS 端点发起单独的 Bedrock Runtime 请求进行原生压缩；
使用自定义的非 AWS `baseUrl` 时，需要设为 `remoteCompaction.enabled: true`，设为 `enabled: false` 可禁用。参见
[压缩](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/compaction.md#summary-generation)。独立的 Anthropic Messages `/anthropic` 路由有自己的
[配置方式](./models.md#claude-on-bedrocks-anthropic-messages-api-anthropic)。

### 模型字段值校验 \{#model-value-checks}

- `id` 必填且不能为空；可选的 `name`、模型级 `baseUrl`、`contextPromotionTarget` 和 `compactionModel` 在提供时也不能为空
- 自定义 `models` 条目中如果提供 `contextWindow` 和 `maxTokens`，值必须为正数；当前附加的正数校验不涵盖 `modelOverrides`
- 自定义模型和覆盖条目中的 `maxContextWindow` 都必须是正的安全整数；如果同时设置了 `contextWindow`，前者不得小于后者

### 未知的兼容性键 \{#unknown-compatibility-keys}

模型提供方、模型和 `modelOverrides` 的 `compat` 块中出现未知键时，只会发出警告，不会中断加载。交互模式启动时显示通知；打印模式、RPC 模式和列出模型时则向标准错误输出一行（JSON 输出时也如此，标准输出不变）。每条警告都指出配置文件和以点号分隔的键路径；与配置模式校验错误一样，模型数组条目使用从零开始的索引。配置仍会加载，并保留未知键以兼容后续版本。每个未知键路径在同一个注册表中只报告一次，即使强制刷新或重新读取未修改的文件也不例外。

`compat` 的顶层及其 `whenThinking` 覆盖中的已知对象字段，来自 models.yml 的兼容性配置模式和运行时兼容性键集合（协议层的配置项）。配置模式只校验其中一部分，因此文件模式未列出的键，只要运行时能识别（例如 `streamFirstEventTimeoutMs`），就不会仅因此警告。嵌套的 `whenThinking.whenThinking` 仍会触发警告：思考设置的覆盖块不能再包含另一个思考设置覆盖块。思考和目录配置项应放在 `compat` 外，不在此集合中。其他嵌套校验只涉及配置模式声明了固定字段的对象，包括路由块和 `reasoningEffortMap`；`extraBody` 等开放映射接受任意键和嵌套载荷。运行时扩展注册的模型提供方不受文件配置模式校验，可以注册自定义 API 和它们自己的兼容性字段。

运行时兼容性键集合不按模型提供方的 `api` 筛选。即使某个协议层配置键只由其他 API 系列读取（例如，将仅 Anthropic 读取的键放在 `openai-completions` 模型提供方中），也不会发出警告，但该键在这里不起作用。

### 通过命令获取密钥 \{#command-resolved-secrets}

模型提供方的 `apiKey` 值以及模型提供方或模型的 `headers` 值可用 `!` 开头，从命令的标准输出读取密钥。命令异步执行，超时为 10 秒；标准输出会去掉首尾空白，命令失败或输出为空时不使用相应值。加载或查看目录不会执行这些命令：只有请求或在线凭据探测需要凭据时才会解析。

```yaml
providers:
   openai:
      apiKey: "!op read op://dev/openai/api-key"
      headers:
         X-Team-Key: "!bw get password omp-team-key"
```

命令成功执行后，输出会在进程生命周期内缓存；并发请求共享正在执行的命令。失败后等待 30 秒再重试。如果调用方在刷新时请求 `refreshCommandCredentials`（包括模型中心的显式刷新），或触发 401 凭据恢复，相关的缓存 API 密钥和请求头会被清除；普通目录刷新不会清除它们。运行时 API 密钥覆盖（包括 `--api-key`）优先于配置中的凭据。

## 合并与覆盖顺序 \{#merge-and-override-order}

ModelRegistry 的组装顺序：

1. 加载 `models.yml` / `models.yaml`，确定模型提供方覆盖配置、自定义模型、模型覆盖配置和发现配置。
2. 从 `@oh-my-pi/pi-catalog`（`getBundledProviders` / `getBundledModels`）加载内置模型，并应用模型提供方覆盖配置和上下文策略。
3. 合并缓存中的条目和运行时发现的条目。模型提供方的权威目录可以替换该模型提供方的内置聊天模型列表。
4. 合并配置中的自定义 `models`，然后合并扩展注册的模型：
   - 如果 `provider + id` 匹配，则替换传输元数据，并更新已指定的模型字段
   - 否则追加模型，并从内置参考条目或本地默认值补齐缺失的元数据
5. 折叠思考档位变体，应用 `modelOverrides`，并选择已配置的扩展窗口。
6. 应用模型提供方的 Bedrock 字段、运行时模型提供方覆盖配置、发现使用的协议层策略，以及扩展的 OAuth 目录映射结果。

后台发现会重新合并模型，并在合入发现的条目后应用自定义定义和模型覆盖配置，
因此用户的显式配置仍然有效。

### 模型提供方的模型缓存与静态指纹 \{#provider-model-cache-and-static-fingerprint}

各模型提供方的模型列表以物化后的模型形式写入 `models.db`（数据库模式版本 13）。
物化策略标记包含应用版本、构建器版本和已编译规则的哈希；
不兼容的条目会失效。请求头的值一律不会持久化，
必须从可信的本地元数据或配置中恢复。

`static_fingerprint` 是根据当前静态模型子集和合并策略计算的哈希值。它根据数组的当前内容重新计算，
不存储在数组上。如果未过期的权威缓存与静态指纹匹配，且所有请求头都已解析，
`resolveProviderModels` 就可以跳过完整合并。只增补条目的共享目录缓存仍会重新应用静态条目，
返回的模型仍会经过变体折叠。
模型管理器的默认缓存 TTL 为两小时（各模型提供方可分别覆盖）；
非权威快照的重试间隔为五分钟。

### 共享目录刷新 \{#shared-catalog-refresh}

内置目录仍是启动和离线使用的基础。启动时加载配置和缓存条目，并按需物化各模型提供方的目录子集；验证选择器之前，仅用本地数据按凭据作用域补齐模型信息。后台刷新通过 `https://catalog.stencil.so/models.json.zstd` 获取 models.dev 共享目录中受支持的模型提供方数据。新模型 ID 会增补到各模型提供方的内置目录子集中，按其目录描述符规范化后写入模型缓存数据库。因此，新发布的模型无需等待新版 OMP 二进制文件即可出现。

对于新增的 ID，远程条目可以提供当前限制、价格、模态和能力标志，但不能引入代码、任意请求头或未注册的模型提供方。如果模型提供方的描述符指定以端点发现结果为准，就用该结果确定可用的聊天模型列表。共享目录不是权威来源：远程条目消失时，不会删除内置模型。

未过期的缓存快照可省去网络请求。刷新失败时，OMP 保留最近一次可用的缓存快照，并将其标记为过期；没有缓存时，回退到内置目录。模型提供方的发现状态会记录 `source`（`bundled`、`models.dev`、`provider` 或 `cache`）和 `fetchedAt`，便于调用方区分最新的远程数据和离线回退数据。

## 模型提供方与模型标识 \{#provider-and-model-identity}

注册表保留具体的 `provider` + `id` 组合。当多个模型提供方有相同的模型 ID 时，
请使用精确的 `provider/modelId` 选择器。会话状态和会话记录会保存实际执行该轮请求的
模型提供方和模型。

模型提供方默认值与模型级覆盖配置：

- 模型提供方的 `headers`、`compat` 和 `remoteCompaction` 是基础设置。
- 模型级 `headers` 会覆盖模型提供方的同名请求头键。
- `modelOverrides` 可覆盖模型元数据（`name`、`api`、`kind`、`reasoning`、`thinking`、`input`、
  `imageInputDecoder`、`imageCountBudget`、`snapcompactShape`、`tokenizer`、`supportsTools`、`cost`、`promptCache`、`premiumMultiplier`、`contextWindow`、
  `maxContextWindow`、`maxTokens`、`omitMaxOutputTokens`、`preferWebsockets`、`headers`、`compat`、
  `contextPromotionTarget`、`compactionModel` 和 `remoteCompaction`）。
- `compat` 中的嵌套配置块（`openRouterRouting`、`vercelGatewayRouting`、
  `extraBody` 和 `whenThinking`）会进行深度合并。

## 提示词缓存有效期 \{#prompt-cache-lifetimes}

`promptCache` 指定在 OMP 可以请求的各个保留档位下，模型提供方将提示词缓存条目保留多久。
通常默认为 `short`；Anthropic OAuth 订阅者的请求在支持时默认使用
`long`，除非显式的保留设置或 `PI_CACHE_RETENTION` 将其覆盖。数值以秒为单位，是估算值：
模型提供方公布的是范围，请采用较保守的一端。

```yaml
providers:
   anthropic:
      modelOverrides:
         claude-sonnet-5:
            promptCache: { short: 300, long: 3600 }
```

显式指定 `promptCache` 会完全替换目录中的模型缓存有效期，不与之合并。
`promptCache: {}` 禁用该模型的缓存预热；
只指定 `short` 不会继承目录中的 `long` 有效期。对匹配的
模型，`modelOverrides.promptCache` 优先级最高。确定有效期时，运行时注册的
模型定义会替换匹配的 YAML `models` 定义。即使运行时定义省略了
`promptCache`，也会使用实际生效模型在目录中的默认值，而非 YAML 指定的有效期。
如果没有运行时定义替换模型，则使用匹配的 YAML 有效期；
未指定时使用目录默认值。

常规命令 `bun run gen:models` 会根据当前目录策略
重新计算内置的提示词缓存有效期；
没有单独用于重新生成缓存有效期的命令。

直连 Anthropic 保留现有的 5 分钟 / 1 小时有效期（`short: 300`、`long: 3600`），
API 密钥默认使用 5 分钟，OAuth 订阅者会话默认使用 1 小时；API 密钥可显式选择
`long`。Factory Droid 的 Claude 模型同样使用 5 分钟 / 1 小时的有效期，
默认为 5 分钟；`long` 在 Anthropic、Vertex、Bedrock 和 Azure 上游写入有效期为 1 小时的条目，
在其他上游仍为 5 分钟。原生 Amazon Bedrock Converse 上的 Claude 缓存 TTL 为 5 分钟；
只有目录元数据和请求协议都支持时才有 1 小时选项。
Bedrock Runtime 或 Mantle 的 Anthropic Messages 路由上的 Claude，在现有请求支持下有效期为 5 分钟；
不支持显式请求的 `long` 时，会回退到 `short`。其他 Amazon Bedrock 模型，
包括 Nova 和 GPT，未启用缓存预热。如果模型未为实际使用的保留档位指定有效期，就不会进行预热；
确认后端缓存行为后，可为自定义模型和 `modelOverrides` 设置
`promptCache` 以启用预热。有关 `providers.cacheWarming` 的说明，参见
[设置](./settings.md)。

## 用量费用与分时定价 \{#usage-costs-and-time-based-pricing}

OMP 根据所选模型提供方和模型在目录中的价格估算 token 费用；有服务端报告的金额时，优先采用该金额。已完成的消息保留记录的费用：跨越计价时间边界、切换模型或重新打开会话，都不会重新计算累计用量的费用。

对于官方 `deepseek` 模型提供方，目录采用 [DeepSeek 官方定价](https://api-docs.deepseek.com/quick_start/pricing)：

- 高峰时段为 **UTC 周一至周五 01:00-04:00 和 06:00-10:00**（含开始时间，不含结束时间）。其他时段（包括周末）均按**高峰费率的 50%**计费。
- Flash 价格适用于 `deepseek-flash`，也适用于已停用但仍接受的 `deepseek-v4-flash` 和 `deepseek-v4-flash-vision-exp`，均按 Flash 费率表计费。每百万 token 的高峰费率为：未缓存输入 0.30 美元，已缓存输入 0.006 美元，输出 1.20 美元。
- `deepseek-v4-pro` 最初的高峰费率为每百万 token：未缓存输入 1.32 美元，已缓存输入 0.044 美元，输出 3.96 美元。从 **2026-09-14 04:00 UTC** 起，费用按 Flash 费率表估算，沿用相同的高峰和非高峰时段。

部分目录价格会在特定日期调整，但没有高峰和非高峰费率。`google`、`google-vertex`、`google-antigravity` 和 `cursor` 上的 Gemini 4 Argon，截至 2026-11-30，按每百万 token 的输入 2 美元、已缓存输入 0.10 美元、输出 10 美元估算；从 **2026-12-01 08:00 UTC**（美国太平洋时间午夜）起，采用 Google 的标价，依次为 4 美元、0.20 美元和 20 美元。价格由请求的时间戳决定，因此即使模型在调价前已加载，调价后的请求也会采用新费率，无需更新目录。模型浏览器和 `omp models --json` 会显示当前生效的价格。

本地估算根据助手消息的**请求开始时间戳**，为整个请求选择费率表和适用的时段费率。这是 OMP 的估算规则；DeepSeek 的定价页面未说明服务端如何为跨越计价边界的请求计费。导入没有费用记录的历史用量时，如果无法恢复请求时间戳，统计导入器会将需要按时间计价的用量留作未定价，不会套用当前时钟对应的费率。

状态栏的 `cost` 区段根据当前时钟，为**当前使用的模型提供方和模型**附上费率箭头：高峰为 **↑**，非高峰为 **↓**。即使处于空闲状态，箭头也会在计价时段切换时刷新，不用于标示会话累计费用。没有高峰和非高峰费率的模型，包括按日期调价或显式指定固定费率的模型，不显示箭头。

显式指定模型 `cost`（在 `models.yml` 中直接配置或通过 `modelOverrides` 指定）会将模型的定价覆盖为固定费率，并禁用该模型继承的分时定价。省略 `cost` 则保留目录价格。`models.yml` **不能**配置 `timeBased` 计价时间表；此元数据属于目录的 [KDL 定价规则](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/catalog/src/compat/rules/README.md#time-based-pricing)。

如果 `models.yml` 中新增的自定义模型省略 `cost`，就继承其内置参考条目的费率表，
包括计价时间表。参考条目按模型 ID 匹配，优先采用上下文和输出上限较大的条目，
其次考虑完整的缓存定价和 OpenAI 官方条目。如果自定义条目与现有条目的模型提供方
和 ID 都相同，省略 `cost` 时则保留现有模型的价格。通用代理和
OpenAI 模型列表发现会将本地无法确定的价格保留为零，不使用上游价格；
LiteLLM 等能提供更完整元数据的模型提供方发现机制可以提供自己的价格。

## 运行时发现集成 \{#runtime-discovery-integration}

### 隐式发现 Ollama \{#implicit-ollama-discovery}

如果未显式配置 `ollama`，注册表会隐式添加一个可发现的模型提供方：

- 模型提供方：`ollama`
- API：`openai-responses`
- 基础 URL：`OLLAMA_BASE_URL`，否则使用 `OLLAMA_HOST`，再否则使用 `http://127.0.0.1:11434`
- 上下文窗口：优先使用已设置的 `OLLAMA_CONTEXT_LENGTH`，否则使用 Ollama 的 `/api/show` 元数据，再否则使用 `128000`
- 身份验证模式：无需密钥（`auth: none` 的行为）

运行时发现会调用 Ollama 端点，将发现的 OpenAI 兼容模型规范化为 `openai-responses`。

`OLLAMA_CONTEXT_LENGTH` 不会配置 Ollama 的运行时 `num_ctx`；请在 Ollama 或模型配置中单独设置它。

### 隐式发现 llama.cpp \{#implicit-llamacpp-discovery}

如果未显式配置 `llama.cpp`，注册表会隐式添加一个可发现的模型提供方：

- 模型提供方：`llama.cpp`
- API：`openai-responses`
- 基础 URL：`LLAMA_CPP_BASE_URL`，否则使用 `http://127.0.0.1:8080`
- 身份验证模式：无需密钥（`auth: none` 的行为）

运行时发现会调用 llama.cpp 的模型端点，并用本地默认值生成模型条目。

模型提供方的 `api` 是发现的模型所用的默认值；目录规则可以按模型类别覆盖它。在任何 `discovery.type: llama.cpp` 模型提供方（无论是隐式添加还是显式配置）中，Qwen 类模型都会被识别为 `openai-completions`，因为 Responses API 无法携带聊天模板的思考控制参数（`enable_thinking` / `chat_template_kwargs`）。该覆盖规则位于 `packages/catalog/src/compat/rules/providers/llama.cpp.kdl`（`discovery-api`）。

首次响应触发 llama.cpp 模型的延迟加载后，OMP 会重新探测其运行时上下文和输入元数据。
自定义模型和 `modelOverrides` 显式指定的限制优先于探测结果。
只有未配置任何凭据来源时，隐式添加的模型提供方才无需密钥。

### 隐式发现 LM Studio \{#implicit-lm-studio-discovery}

如果未显式配置 `lm-studio`，注册表会隐式添加一个可发现的模型提供方：

- 模型提供方：`lm-studio`
- API：`openai-completions`
- 基础 URL：`LM_STUDIO_BASE_URL`，否则使用 `http://127.0.0.1:1234/v1`
- 身份验证模式：无需密钥（`auth: none` 的行为）

运行时发现会获取 OpenAI 兼容模型列表，以及可获取的 LM Studio 原生元数据。
原生 `loaded_context_length` 优先于训练时的上下文窗口。首次响应触发模型即时加载后，
OMP 会刷新运行时元数据。自定义模型和 `modelOverrides` 显式指定的限制仍然优先。
发现的 LM Studio 模型使用 `imageInputDecoder: stb`。

裁决模型（标记为 `type: "decision"`，来自 LM Studio 原生 `GET /api/v1/models`）
经发现后，会作为 `judge` 模型使用 `openai-decisions` API：裁决请求发送到 `{baseUrl}/decisions`，
即 LM Studio 兼容 OpenAI 的 Decisions 端点，而非聊天补全端点。
LM Studio 报告 `has_vision_adapter: true` 时，这些模型接受图片。用 `modelRoles.judge: lm-studio/<model>` 选择模型。

这条路径也适用于 LM Studio 之外的本地 OpenAI 兼容服务端。例如，如果 oMLX 绑定在 Ollama 的常用端口上，可设置 `LM_STUDIO_BASE_URL=http://127.0.0.1:11434/v1`，通过现有的 `/v1/models` 流程发现它。如果同时运行 oMLX 和 Ollama，需要为其中一个分配不同的端口。不要将 oMLX 配置为 `ollama`：Ollama 发现使用原生的 `/api/tags` 和 `/api/show` 端点，不使用 OpenAI 的 `/v1/models`。

### 隐式发现 Apple Foundation Models \{#implicit-apple-foundation-models-discovery}

在搭载 Apple 芯片的 macOS 上，如果 `apple` 模型提供方未配置且未禁用，OMP 会通过
进程内的 Foundation Models 桥接层探测它。桥接层报告可用时，`apple/on-device`
无需凭据即可使用；其上下文大小、推理能力、图片输入和工具支持取自桥接层元数据。
OMP 不会自动选择它，因为设备端上下文窗口可能不足以容纳 coding-agent 的默认提示词和项目指令。
请通过 `--model apple/on-device` 或 `/model` 主动选择它；
否则请使用 `/login` 或配置其他本地模型。
设备不符合条件、Apple Intelligence 被禁用，或构建产物不含桥接层时，都不会得到模型。
其内部 API 为 `apple-foundation-models`，不使用 HTTP 端点。

### 发现 LiteLLM 模型提供方 \{#litellm-provider-discovery}

`litellm` 处于活动状态时（例如通过 `LITELLM_API_KEY` 或已存储的身份验证信息），运行时发现会使用 LiteLLM 代理：

- 模型提供方：`litellm`
- API：`openai-decisions`（类型为 `judge`）用于 `mode: decisions` 的模型组；以 OpenAI 为后端的模型使用 `openai-responses`；其他模型使用 `openai-completions`
- 基础 URL：优先采用显式的模型提供方 `baseUrl` / `models.yml` 配置，其次是 `LITELLM_BASE_URL`，最后是 `http://localhost:4000/v1`
- 身份验证模式：代理要求密钥时，使用 `LITELLM_API_KEY` 或已存储的 LiteLLM 身份验证信息

运行时发现按顺序探测以下 LiteLLM 管理元数据端点：`GET /model_group/info`、`GET /v2/model/info`、`GET /model/info` 和 `GET /v1/model/info`。配置的密钥必须有权读取至少一条路由。如果部署限制了对管理端点的访问，可通过 LiteLLM 的 `allowed_routes` 访问控制授予路由权限，或使用主密钥或管理员密钥进行发现。

如果所有元数据路由都不可用，发现过程会回退到兼容 OpenAI 的 `GET /models` 列表。元数据请求被拒绝或失败时，只记录一次日志，包含端点和状态；`404` 视为路由不存在。两条路径都会排除显式标记为以下已知 LiteLLM 专用任务模式的模型：`audio_speech`、`audio_transcription`、`batch`、`embedding`、`guardrail`、`image_edit`、`image_generation`、`moderation`、`ocr`、`rerank`、`search`、`vector_store` 和 `video_generation`。模式缺失、为空值或无法识别的模型仍可选择，以便路由别名继续生效。详细元数据用于映射各模型的上下文、能力和上游模型提供方字段。以 OpenAI 为后端的模型使用 LiteLLM 的 Responses 路由，以保留推理摘要；混合模型提供方的模型组仍使用 Chat Completions。对于回退路径返回的不带模型提供方前缀的 ID，OMP 根据已知的 OpenAI 模型系列确定路由，并在可用时采用内置参考元数据。回退路径仍无法确定价格（以零表示）；显式配置的通用发现，在端点和内置参考条目都没有提供限制时，默认上下文窗口为 128,000 token。详细的管理元数据可以提供特定模型提供方的价格。后续探测只补充或覆盖首个可用列表中模型的元数据，不会合并各端点的模型列表。

### 发现 Bifrost 模型提供方 \{#bifrost-provider-discovery}

`bifrost` 有凭据时（`BIFROST_API_KEY` 或通过 `/login bifrost` 保存的身份验证信息），运行时发现从网关的 `GET /models` 读取模型列表。网关地址依次取自模型提供方的 `baseUrl` / `models.yml` 配置、`BIFROST_BASE_URL`，或 `http://localhost:8080/v1`。模型 ID 保留 Bifrost 的 `<bifrost-provider>/<model>` 格式。聊天模型使用 `openai-completions`；裁决模型使用 `openai-decisions`，通过 `POST {baseUrl}/decisions` 接收裁决请求。该列表是权威来源，按密钥和基础 URL 缓存。条目映射、裁决模型检测和裁决重试指南见 [Bifrost](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/provider-quirks.md#bifrost-bifrost)。

### 通用 OpenAI 兼容发现 \{#generic-openai-compatible-discovery}

`openai-models-list` 默认读取 `{baseUrl}/v1/models`（不会再加一段 `/v1`）。
`discovery.injectV1: false` 将配置的 URL 视为完整的 API 根地址。端点报告的
`max_model_len` 优先于 `context_length`。两者都未提供时，只有嵌套字段
`limits.max_input_tokens` 和 `limits.max_output_tokens` 都是正的安全整数，且两者之和仍是安全整数时，
才将该和用作上下文窗口。有效的 `limits.max_output_tokens` 可以独立设置
聊天输出上限，但不能超过已解析的上下文窗口；用于确定上下文窗口的这对值不完整或无效时，
仍保留有效的输出上限。该字段没有有效值时，按顺序取顶层 `max_output_tokens`、
`max_completion_tokens`、`top_provider.max_completion_tokens`，再到通用的 `max_tokens`，
首个有效值即为输出上限，优先于内置参考条目的限制。各字段独立校验，
一个字段的无效值不会使其他字段的有效值失效。如果仍无法确定，上下文窗口和输出上限沿用
现有的原生值、参考值和默认值回退规则。
端点未提供相关信息时，可以继承内置参考条目的限制、推理能力和输入模态；未知模型
默认采用通用聊天配置，即上下文窗口为 128,000 token，输出上限为 32,768 token。输出上限不得超过已解析的上下文窗口；
通过 Anthropic 路由的模型使用 8,192 token 的回退输出上限。

如果配置、发现结果和目录都未表明模型是否支持推理，思考能力将标记为
**未验证**，而不是禁用。首次带有思考档位的请求（包括使用会话默认档位）会在发送会话内容之前
运行独立的小型能力探测。探测优先尝试请求的档位，并行测试全部六个档位。
如果当前格式不成功，会尝试该 API 的其他格式，例如推理强度、开关或 token 预算参数。
探测只包含一道固定的算术题，不会发送会话内容或工具。
首次使用未知模型时，探测会增加请求数和延迟。

接受的档位、请求格式和观察到的推理能力会保存到 `models.db`，按模型提供方、
API、端点和协议层模型 ID 分开存储。后续轮次复用结果，并将不受支持的档位调整到支持范围内。支持推理的
结果在 30 天后过期；没有推理控制项的结果在一天后过期。身份验证失败、
限流、服务中断和超时都不能得出结论，不会被记录为不支持。
即使模型提供方未返回可见的推理内容，接受参数也算支持。显式的能力设置（包括
`reasoning: false`）优先于探测结果。

仅声明图片输出的条目会成为图片生成运行器；仅声明嵌入输出的条目会成为
嵌入运行器。如果唯一输出是 `speech`，则成为 `tts` 运行器，使用 `openai-speech`；
如果唯一输出是 `transcription`，则成为 `stt` 运行器，使用 `openai-transcriptions`。输出模态取自条目的
模态数组，或 OpenRouter 的 `architecture.modality` 概要
（`text->speech`）。混合输出、仅声明 `audio` 输出（Poe 将文本转语音音色和音乐生成器
都标为 `text->audio`），以及未声明模态的条目，仍为聊天模型。这些运行器可用
`omp models --kind all` 查看，不会出现在默认的聊天模型列表中。

### 显式配置模型提供方发现 \{#explicit-provider-discovery}

可手动配置发现：

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

自定义 LiteLLM 网关可以采用同一条详细元数据发现路径：

```yaml
providers:
   litellm-gateway:
      baseUrl: http://gateway.example:4000/v1
      apiKey: LITELLM_API_KEY
      api: openai-completions
      discovery:
         type: litellm
```

访问 LiteLLM 元数据端点时，发现过程仅去掉已配置基础 URL 末尾的 `/v1`，保留前面的代理路径。运行时调用模型仍使用已配置的 OpenAI 兼容 `/v1` 基础 URL。

### 代理发现（`discovery.type: proxy`） \{#proxy-discovery-discoverytype-proxy}

适用于在同一主机上同时提供 Anthropic 和 OpenAI 兼容接口的代理（如 new-api、one-api），
即同时提供 `/v1/messages` 和 `/v1/chat/completions`。
发现过程调用 `GET /v1/models`（超时 10 秒，使用 OpenAI 风格载荷），
并确定各模型的 `api`，依据是条目的 `supported_endpoint_types`：

- 包含 `"anthropic"`：使用 `api: anthropic-messages`（经 `/v1/messages` 路由）
- 包含 `"openai"`：使用 `api: openai-completions`（经 `/v1/chat/completions` 路由）
- 其他情况：回退到模型提供方级的 `api`；未配置该值时回退到 `openai-completions`

模型提供方级的 `api` 在 `discovery.type: proxy` 下是**可选**的，因为
每个模型的通信协议都会自动检测。Anthropic SDK 会去掉尾随的 `/v1`（如果
`baseUrl` 以此结尾），再追加 `/v1/messages`，因此只需配置一个发现用的 `baseUrl`
（以 `/v1` 结尾），就能正确访问两个协议的端点。

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

### 扩展注册模型提供方 \{#extension-provider-registration}

扩展可在运行时注册模型提供方（`pi.registerProvider(...)`），包括：

- 替换模型提供方已有的模型或追加模型
- 为新的 API ID 注册自定义流处理器
- 注册自定义 OAuth 提供方
- 通过 `fetchDynamicModels` 获取与凭据对应的实时模型列表（缓存 TTL 默认为 24 小时）
- 自定义用量报告和 OAuth `modifyModels` 映射，目录重建后重新应用

## 身份验证和 API 密钥解析顺序 \{#auth-and-api-key-resolution-order}

请求模型提供方的密钥时，按以下优先级解析：

1. 运行时覆盖（CLI 的 `--api-key`）
2. 配置覆盖（`models.yml` 的 `providers.<name>.apiKey`）
3. 已存储的 OAuth 凭据（含刷新）
4. 通过登录保存的 API 密钥
5. 扩展注册的配置回退（`keys.setConfig(..., { fallback: true })`）
6. 环境变量映射（`OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 等）
7. 其他已存储的 API 密钥，例如从凭据代理迁移的副本

回退层适用于已注册且有自身登录流程的模型提供方。在
`models.yml` 中显式提供的密钥属于第 2 层，不属于这一回退层。

`models.yml` 中 `apiKey` 的解析方式：

- 先将该值视为环境变量名。
- 如果环境变量未设置或为空，则直接用该字符串作为令牌。

如果 `authHeader: true` 且模型提供方设置了 `apiKey`，会为模型：

- 注入 `Authorization: Bearer <resolved-key>` 请求头。

变量不存在不会导致解析失败：如果配置了 `apiKey: MY_PROVIDER_API_KEY`
和 `authHeader: true`，而 `MY_PROVIDER_API_KEY` 未设置或为空，就会得到
`Authorization: Bearer MY_PROVIDER_API_KEY`。使用环境变量提供密钥的启动程序必须在
启动 OMP 前确认该变量已设置且非空。

[通过命令获取密钥](#command-resolved-secrets)不回退到字面值：
命令失败或去除首尾空白后的标准输出为空时，解析不到值，
因此也不会添加由此派生的 Bearer 请求头。

无需密钥的模型提供方：

- 标记为 `auth: none` 的模型提供方、隐式添加的本地模型提供方，以及以无密钥模式保存的可选密钥登录，可以在没有凭据时使用。
- 如果模型提供方无需密钥，且未配置实际的凭据来源，`ModelRegistry.getApiKey*` 会返回 `kNoAuth`；已配置的凭据仍优先。

### 凭据代理模式 \{#broker-mode}

设置 `OMP_AUTH_BROKER_URL`（或 `auth.broker.url`）后，`RemoteAuthCredentialStore` 会取代本地 SQLite 凭据存储。上面的第 3、4、7 层（已存储的 OAuth 和 API 密钥凭据）来自凭据代理提供的快照，其中的 `refresh` 令牌已脱敏；凭据过期时，会向凭据代理发出 `POST /v1/credential/:id/refresh`，而不是在本地刷新。

`AuthStorage.keys.setConfig` 让 `models.yml` 中的 `apiKey` 优先于凭据代理解析出的 OAuth 令牌，但不会覆盖运行时的 `--api-key`。参见 [`auth-broker-gateway.md`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md)，其中介绍了凭据代理与网关的完整设计及其配置项（`OMP_AUTH_BROKER_URL`、`OMP_AUTH_BROKER_TOKEN`、`auth.broker.url`、`auth.broker.token`）。

## 可用模型与全部模型的区别 \{#model-availability-vs-all-models}

- `getAll()` 默认返回聊天模型；`getAll("all")` 包含目录中的所有模型类型。
- `getAvailable()` 默认也只返回聊天模型；指定类型或 `"all"` 时，会包含相应的运行器。
- 可用模型不包括 `disabledProviders` 中模型提供方的模型。模型提供方必须无需密钥，或已配置凭据来源。检查可用性时不会运行获取密钥的命令或刷新 OAuth 令牌。

模型可以存在于注册表中，但不可用；即使配置了凭据，在请求时解析也可能失败。
`enabledProviders` 控制从外部配置来源发现模型提供方，
不充当模型传输方式的允许列表。

## 运行时模型解析 \{#runtime-model-resolution}

### CLI 与匹配模式解析 \{#cli-and-pattern-parsing}

`model-resolver.ts` 支持以下写法：

- 精确的 `provider/modelId`
- 精确的模型 ID（自动推断模型提供方）
- 不带模型提供方前缀的 ID 可做模糊或子串匹配（`opus`、`gpt-5.2`）；`provider/modelId` 选择器必须精确匹配
- `--models` 中用于限定范围的 glob 模式（例如 `openai/*`、`*sonnet*`）
- 可选的 `:thinkingLevel` 后缀（`off|minimal|low|medium|high|xhigh|max|auto|inherit`）
- OpenRouter 和 Vercel Gateway 选择器上的 `@upstream` 路由后缀（例如 `openrouter/anthropic/claude-sonnet-5@anthropic:high`）；按字面精确匹配的模型 ID 仍优先

`--provider` 是旧用法，推荐使用 `--model`。精确的 `provider/modelId` 不会产生歧义；
不带模型提供方前缀的 ID 和模糊模式则在具体的可用模型中解析。

精确选择器的解析优先级：

1. 精确的 `provider/modelId` 引用
2. 不带模型提供方前缀的精确 ID（不区分大小写）；多个模型提供方有同一 ID 时，按偏好顺序选择（见下文）
3. 已停用的思考档位变体别名（折叠后的目录条目，如 `X`/`X-thinking` 这一对）
4. 子串匹配，并在别名和带日期的 ID 之间选择（仅限不带模型提供方前缀的 ID）

如果 `provider/modelId` 选择器的模型提供方已知，解析在精确匹配阶段后停止，绝不会运行名称相似的同类模型。未匹配时会报错 `Model "…" not found`，并从该模型提供方建议至多三个相近的 ID。配置的默认模型未匹配时，会发出警告，指出未匹配的模型和实际使用的替代模型，除非已配置的 `retry.fallbackChains` 条目接管选择。配置的听写模型未匹配时也会以同样方式警告。

用于限定范围的 glob 模式（用于 `enabledModels` 和 CLI 的 `--models`）在精确匹配后单独匹配具体模型。

不带模型提供方前缀的 ID 同时匹配多个模型提供方的模型时，按以下优先级选择：

1. 最近使用的模型变体
2. 模型提供方优先级（先用 `modelProviderOrder` 设置，再用内置目录的模型提供方优先级）
3. 最近使用的模型提供方
4. 注册表顺序

### 初始模型选择优先级 \{#initial-model-selection-priority}

`findInitialModel(...)` 按以下优先级选择：

1. CLI 中显式指定的模型提供方与模型
2. 限定范围内的第一个模型（非恢复会话时）
3. 已保存的默认模型提供方与模型
4. 可用模型中已知模型提供方的默认模型（例如 OpenAI、Anthropic 等）；如果发现结果将某个账户的模型标为默认（`isProviderDefault`，如 Devin），则使用该模型，而不是该模型提供方内置的 `default-model`
5. 第一个可用模型

如果存在具有明确凭据的模型提供方（也包括无需密钥的本地模型提供方），自动回退会先把候选范围限制在其中。
从运行环境获取的 AWS/Vertex 凭据标记值仍可使用，但不会取代
具有显式凭据的模型提供方。会话恢复单独处理，会检查已保存的模型是否仍存在，
以及能否解析出可用凭据。

### 角色别名与设置 \{#role-aliases-and-settings}

模型角色为不同任务指定模型选择器。角色在 `modelRoles` 下配置，位置是 `config.yml`，不是 `models.yml`；`models.yml` 定义模型提供方和模型元数据。

模型选择器将内置角色分为两组：

- **聊天角色：** `default`、`smol`、`slow`、`vision`、`plan`、`commit`、`tiny`、`memory`、`task` 和 `advisor`。`tiny` 和 `memory` 角色都接受普通聊天模型和目录中的 `tiny` 模型。
- **模型类型角色：** `image`、`web`、`speech`、`dictation` 和 `judge`。这些角色分别选择图片生成、搜索或基于检索结果的聊天、文本转语音、语音转文本以及裁决运行器。`judge` 角色也接受轻量模型和聊天模型。

`vision` 和 `image` 面向不同任务：`vision` 选择用于分析图片的聊天模型，例如 `read screenshot.png?q=...`；`image` 选择目录类型为 `image` 的模型，供 `generate_image` 使用。将模型分配给 `vision` 不会让该模型获得图片输入能力：处理图片问题时，还会检查模型能否向其模型提供方发送图片输入。

`tiny` 角色为会话标题等后台任务选择轻量模型；未配置时通过 `@smol` 解析。`memory` 角色未配置时通过 `@tiny` 解析。配置与回退链示例见[模型设置](./settings.md#models)。

在 `/models` 中分配非默认角色通常只保存选择器，不切换当前会话模型。任务在被调用时使用相应角色；分配 `plan` 不会进入计划模式，调用 `todo` 也不会选用计划模型。计划模式启用期间，更改 `plan` 角色会重新应用其模型。分配 `default` 通常还会切换当前模型，除非更高优先级的设置层覆盖了此次修改。仅用于当前会话的模型选择器会切换当前模型，不改写角色分配。

`@smol` 等角色别名通过 `settings.modelRoles` 展开；`*` 选择 `@default`。在 YAML 值中使用 `@` 别名时，请加引号（`plan: "@slow"`）。聊天角色的值可以追加 `:minimal`、`:low`、`:medium` 或 `:high` 等思考档位选择器；模型类型角色不使用聊天角色的思考档位后缀。

角色的值可以包含以逗号分隔的多个选择器；选择时使用第一个可用的匹配项，
这些选择器不构成逐请求重试链。请求失败后的回退另行配置，使用
`retry.fallbackChains`（键可以是角色、精确的模型或模型提供方通配符；见[设置](./settings.md)）。
自定义角色名称
可通过 `modelRoles`、`modelTags` 或 `cycleOrder` 引入；这些角色使用聊天模型。
`smol` 和 `slow` 未配置时，先继承显式配置的 `default`，再考虑各自内置的
优先列表。顾问使用显式配置的 `slow`，否则按自身的高能力模型优先链选择，
不继承当前会话模型。

如果一个角色指向另一个角色，目标模型仍按常规规则继承；在该角色的特定用途中，引用方角色的显式后缀优先。

### 模型预设 \{#model-presets}

模型预设是包含所有角色分配和 `defaultThinkingLevel` 的命名快照，可以一次切换整套配置：

```text
/modelpreset save cheap      # save the current roles and thinking level
/modelpreset switch deep     # apply a saved preset
/modelpreset                 # pick one from a list (interactive)
/modelpreset list | delete <name>
```

在 `/models` 的角色视图中按 `s`，即可为当前配置命名并保存。预设存储在 `modelPresets` 下，位于 `config.yml`：

```yaml
modelPresets:
   deep:
      modelRoles:
         default: anthropic/claude-opus-4-5:high
         smol: anthropic/claude-sonnet-4-5
      defaultThinkingLevel: high
```

切换预设时，角色的写入方式与模型选择器相同：写入 `modelRoleStorage` 指定的作用范围，清除预设未包含的角色，并替换 `--model`/`--smol` 会话覆盖。预设的 `defaultThinkingLevel` 会写入全局配置。随后，当前模型切换为由此确定的 `default`（如果预设没有设置，则自动选择模型提供方的默认模型），会话思考档位取该选择器上的 `:level` 后缀，若没有则取预设的 `defaultThinkingLevel`；如果后缀为 `:inherit`，则保留切换模型时设定的档位。如果预设的 `default` 模型不可用，不会修改任何内容。如果角色仍由其他配置层决定（例如 `--config` 文件，`global` 存储模式下的项目配置，或 `project` 存储模式下的全局配置），切换提示会列出这些角色和实际生效的配置层，不会把它们报告为已切换。`defaultThinkingLevel` 如果由项目配置或 `--config` 文件设置，也会在提示中注明实际生效的配置层：本次会话仍会切换到预设档位，但下次启动时会恢复该配置层设置的档位。

当多个配置层定义了同名预设时，以最高优先级层的整个预设为准，顺序为命令行、`--config` 文件、项目配置、全局配置。条目不会跨层合并，因此，如果项目预设 `deep` 只设置了 `default`，就不会采用全局 `deep` 中的其他角色。`null` 条目如果出现在 `--config` 文件（或命令行覆盖）中，会让该预设不出现在列表中，也无法切换到它；项目配置中的 `null` 条目则被忽略，因此同名的全局预设仍会生效。保存时始终将命名条目写入全局配置。如果有更高优先级的配置层仍对该名称生效，保存时会提示。

保存时记录实际生效的角色分配（含 `--model` 会话覆盖）和配置中的 `defaultThinkingLevel`，而不是当前会话正在使用的思考档位。

相关设置：

- `modelRoles`（映射记录）
- `enabledModels`（用于限定范围的匹配模式列表）
- `modelProviderOrder`（等效的具体模型具有相同 ID 时，模型提供方的优先级）
- `providers.kimiApiFormat`（`auto|openai|anthropic`；`auto` 遵循服务端声明的模型元数据）
- `providers.openaiWebsockets`（`auto|off|on`，OpenAI Codex 传输的 WebSocket 偏好设置）
- `providers.openaiResponsesWebsockets`（选择启用标准 Responses 传输；见[标准 Responses API 的 WebSocket](#standard-responses-websockets)）
- `providers.openaiLiveSteering`（通过 Codex WebSocket 将用户在响应途中发送的消息传入 GPT-6 正在生成的响应）

`modelRoles` 存储 `provider/modelId` 等模型选择器；`enabledModels` 和 CLI 的 `--models`
接受精确选择器、glob 模式和模糊匹配。得到的范围仅限制聊天模型
（Ctrl+P 循环切换、启动模型和 `/model` 中的聊天角色）；裁决、搜索、图片及语音
模型仍可用于各自的角色，因此接受指向这些模型的条目，但这些条目不起作用。

`enabledModels`、`enabledProviders` 和 `disabledProviders` 条目还可按路径前缀限定作用范围：

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

字符串条目在所有位置生效。限定范围的条目仅当当前工作目录是配置的路径或其子目录时生效。用 `path`、`paths`、`pathPrefix` 或 `pathPrefixes` 指定路径；`models` 用于 `enabledModels`，`providers` 用于任一模型提供方设置，`values` 则适用于这三项设置。

## `/model` 和 `omp models` \{#model-and-omp-models}

两个入口都能显示和选择带模型提供方前缀的具体模型。

- `/model` / `/models` 打开模型中心，显示角色分配和各模型提供方的目录。仅用于当前会话的选择器会切换当前模型，不保存角色分配。
- `omp models`（默认执行 `ls`）按模型提供方分组，以表格输出可用的**聊天**模型；`--kind <kind>` 可选择另一种目录类型，`--kind all` 包含所有类型。
- `omp models find <substring>` 按模型提供方、ID 或名称筛选；`omp models refresh` 忽略模型缓存 TTL，强制在线重新获取目录；模型提供方的名称也可用于 `ls` 筛选（例如 `omp models openai-codex`）。
- 其他选项：`--json`、`-e <path>` / `--extension <path>`（可重复指定）、`--no-extensions`（跳过自动发现；显式指定的 `-e` 仍会加载）和 `--config <overlay>`（可重复指定）。

JSON 包含 `provider`、`kind`、`id`、`selector`、`name`、各项限制、推理和思考元数据、
声明的 `input` 及 `cost`，不公开模型的传输 `api`。

选中某个模型提供方下的条目时，会保存显式的 `provider/modelId`。

表格中的 `images` 列反映传输层实际会发送的内容。如果模型的图片输入会被移除
（`compat.stripImageInput`，见[图片处理](#compatibility-and-routing-fields)），该列显示 `no`，
即使模型规格声明 `input: [text, image]`；`--json` 保留声明的 `input`。

## 上下文升级 \{#context-promotion}

上下文升级会在压缩前切换到显式配置的更大上下文模型。
收到上下文溢出错误，或在发送提示词前或一轮结束后达到压缩阈值时，OMP 会尝试升级。

上下文升级与[重试时的模型回退](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/non-compaction-retry-policy.md)互相独立。
关闭 **自动升级上下文**（`contextPromotion.enabled`）不会禁用
`retry.fallbackChains`：只要 `retry.modelFallback` 仍启用，模型提供方报错时仍会切换当前模型，
即使回退模型恰好有更大的上下文窗口。要停止此类
切换，请设置 `retry.modelFallback: false`；同模型重试（`retry.enabled`）和自动
压缩（`compaction.enabled`）不受影响。

### 触发条件与顺序 \{#trigger-and-order}

某轮因上下文溢出错误（例如 `context_length_exceeded`）失败时，`AgentSession` 会在回退到压缩**之前**尝试升级：

1. 如果 `contextPromotion.enabled` 为 true，解析升级目标（见下文）。
2. 如果找到目标，切换到该模型并重试请求，无需压缩。
3. 如果没有可用目标，则在当前模型上执行自动压缩。

### 目标选择 \{#target-selection}

升级目标由模型配置显式指定：

1. `currentModel.contextPromotionTarget`（如果已配置）

OMP 只考虑已配置的目标，不会自动选择同一模型提供方和 API 下上下文窗口更大的其他模型。目标模型必须可用，不同于当前模型，有确定且严格大于当前模型的上下文窗口，并能解析出可用凭据（`ModelRegistry.getApiKey(...)`）。

### OpenAI Codex WebSocket 切换 \{#openai-codex-websocket-handoff}

从 `openai-codex-responses` 切出或切入时，会先关闭键为 `openai-codex-responses` 的会话级模型提供方状态，再切换模型。这会丢弃 WebSocket 传输状态，让下一轮在升级后的模型上使用新的传输状态。

### 持久化行为 \{#persistence-behavior}

升级使用临时切换（`setModelTemporary`）：

- 记为 `model_change` 事件，使用临时角色 `"fallback"`，不作为持久的用户模型选择
- 不改写已保存的角色映射

### 配置升级目标 \{#configuring-promotion-targets}

通过模型元数据中的 `contextPromotionTarget` 直接配置目标。

`contextPromotionTarget` 接受以下任一写法：

- `provider/model-id`（显式指定）
- `model-id`（在当前模型提供方内解析）

示例（`models.yml`）：显式配置 OpenAI 升级目标。

```yaml
providers:
   openai-codex:
      modelOverrides:
         gpt-5.5:
            contextPromotionTarget: openai-codex/gpt-5.4
```

不要依赖从模型名称推导出的升级链。请显式配置目标，或使用
模型提供方发现元数据中给出的目标。

## 兼容性与路由字段 \{#compatibility-and-routing-fields}

`compat` 块为 `packages/catalog/src/compat/resolve.ts` 提供按需覆盖的字段。覆盖发生在
端点检测及应用 `packages/catalog/src/compat/rules/` 中的 KDL 模型提供方与模型规则之后。
YAML 校验模式在 `packages/coding-agent/src/config/models-config-schema-bundle.ts` 中构建。
解析结果的结构取决于模型的 API：`OpenAICompat` 是允许省略字段的 OpenAI 输入类型，
而 Chat Completions 和 Responses 传输使用各自对应的已解析记录，类型定义见
`packages/catalog/src/types.ts`。

与这些字段有关的端点例外见[模型提供方端点限制](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/provider-endpoint-constraints.md)。

`models.yml` 支持以下键（均可选；未设置时使用目录规则和端点默认值）。
字段只影响在已解析的兼容性记录中声明该字段的 API：

请求格式：

- `supportsStore`：在请求中发送 `store: false`。默认自动判断（非标准端点关闭）。
- `supportsDeveloperRole`：推理模型用 `developer` 代替 `system` 作为系统角色。默认自动判断。
- `supportsMultipleSystemMessages`：保留开头各条独立的系统或开发者消息，不将其合并。默认自动判断（已知的托管式 OpenAI 兼容 API 会保留；严格使用模板的主机和本地主机会合并）。
- `supportsUsageInStreaming`：发送 `stream_options: { include_usage: true }`，以接收流式响应中的 token 用量。默认自动判断（通常开启，Cerebras 主机关闭）。
- `maxTokensField`：`"max_completion_tokens"` 或 `"max_tokens"`。默认自动判断。
- `supportsToolChoice`：允许 `tool_choice` 参数。默认自动判断。会对该参数返回 HTTP 400 的端点应设为 `false`，例如启用推理时的 DeepSeek 对 `tool_choice` 就会返回该错误。
- `supportsForcedToolChoice`：接受强制指定某个工具的 `tool_choice`。默认自动判断。设为 `false` 时，将强制选择器降级为 `auto`，使拒绝强制工具调用的端点仍可使用该工具（例如一些要求启用思考的 OpenAI 兼容模型）。
- `disableReasoningOnForcedToolChoice`：如果 `reasoning_effort` 或 OpenRouter 的 `reasoning` 已设置，只要 `tool_choice` 强制调用工具，就移除这些推理字段。默认自动判断（以 Kimi 或 Anthropic 接口为前端的端点）。
- `disableReasoningOnToolChoice`：只要发送了任何 `tool_choice`，就移除推理字段。默认自动判断（DeepSeek 推理模型）。
- `disableReasoningWithTools`：只要有工具，即使未强制选择工具，也抑制推理。默认 `false`，除非目录策略覆盖它。
- `alwaysSendMaxTokens`：调用方未提供 token 上限字段时，始终发送该字段。默认自动判断（Kimi 系列模型根据 `max_tokens` 推导 TPM 上限）。
- `strictResponsesPairing`：要求 Responses API 历史中的工具调用与结果严格配对。默认自动判断（Azure OpenAI、GitHub Copilot）。
- `statefulResponses`：为使用 `previous_response_id` 串联已存储响应的功能设置启用状态，适用于 `openai-responses`。启用后发送 `store: true`，后续轮次发送增量输入；禁用后以 `store: false` 重传完整上下文。优先级：调用选项 > `PI_OPENAI_STATEFUL` > `compat.statefulResponses` > `compat.officialEndpoint`（OpenAI 官方端点开启，其他端点关闭）。此键不会启用 `officialEndpoint` 或 `text.verbosity` 等官方端点专用字段，也不会改变 Codex 或 Azure Responses 的行为。
- `streamIdleTimeoutMs`：慢速推理主机的流监控空闲超时下限，以毫秒计。默认自动判断（GLM 编程套餐主机、直连 DeepSeek 推理）。
- `streamMarkupHealingPattern`：用 `kimi`、`dsml`、`qwen` 或 `thinking` 语法修复泄漏到流中的控制标记。默认遵循端点或模型策略。
- `cacheControlFormat`：设为 `"anthropic"` 时，在 Chat Completions 请求载荷中加入 Anthropic 风格的提示词缓存标记。默认自动判断（OpenRouter 的 `anthropic/*` 模型）。
- `supportsLongPromptCacheRetention`：表明主机在 Responses API 中遵循 `prompt_cache_retention: "24h"`。默认自动判断（api.openai.com）。
- `supportsImageDetailOriginal`：端点支持时，允许使用 Responses API 的非标准 `detail: "original"` 图片
  模式。默认值：OpenAI、Azure OpenAI 和 Codex 为 `true`；
  其他主机为 `false`，包括自定义端点、本地端点、xAI 和 Copilot。自定义主机默认收到
  snapcompact 帧和电脑截图的 `auto` 模式，除非显式启用
  `compat.supportsImageDetailOriginal: true`。显式设置 `false` 也会覆盖已知主机的默认值。
- `supportsConfigurationUpdate`：让 Responses API 在会话中途更改 `reasoning.effort`，通过 `configuration_update` 输入项发送修改，同时固定请求级推理强度以支持提示词缓存（GPT-6 Astra）。默认自动判断（`true` 适用于所有主机上的 `gpt-6-astra`，其他情况为 `false`）。遇到对该输入项类型返回 HTTP 400 的自定义端点，请设为 `false`（适用于 `openai-responses` / `openai-codex-responses`）；此时推理强度变更通过顶层 `reasoning.effort` 发送，不发送更新项。
- `supportsSteering`：允许 Codex WebSocket 传输发送 `response.steer`，让模型响应期间输入的消息加入本次响应，无需等下一次请求。默认自动判断（GPT-6 系列为 `true`）。拒绝该事件的代理应设为 `false`。
- `extraBody`：合并到每个请求体中的额外顶层字段（网关提示、控制器选择器等）。

图片处理：

- `stripImageInput`：在编码 `openai-completions` 请求前移除图片部分（包括 OpenRouter 聊天回退，`PI_OPENROUTER_RESPONSES=0`）。对于端点通常仅提供文本能力的模型系列（例如 DeepSeek 类），
  目录的模型类规则会设定此字段，
  不受模型提供方自身的 `input` 声明影响，因此模型可以声明 `input: [text, image]`，
  却不发送任何图片。模型级 `compat` 会与这些规则深度合并，并优先于它们。
  请为端点确实支持图片的模型 ID 设置 `stripImageInput: false`，例如可接受 `image_url` 的视觉增强代理。
  默认自动判断（依据目录的模型类和模型提供方规则）。Responses、Anthropic/Google 的编码器
  会发送模型声明的模态，`pi-native` 传输也是如此（它将原始上下文转发到网关，
  因此客户端不会执行图片过滤，`images` 列显示的是
  已声明的 `input`）。

推理与思考：

自定义模型和覆盖条目可以定义 `thinking`。其中 `mode` 和 `efforts` 必填，还可指定
`defaultLevel`、`effortMap`、`supportsDisplay` 和 `requiresEffort`。模式包括 `effort`、`budget`、
`google-level`、`anthropic-adaptive` 和 `anthropic-budget-effort`。思考档位按以下顺序排列：
`minimal|low|medium|high|xhigh|max`。旧写法 `levels` 或 `minLevel`/`maxLevel` 会规范化为
`efforts`；显式指定的 `efforts` 优先于这两种写法。
`requiresEffort` 默认自动检测；只有确认所配置的后端接受显式关闭推理的请求时，
才将其设为 `false`。这样可以避免
`:off` 选择器被调整到最低思考档位。

对于使用默认 `thinkingFormat: openai` 的自定义模型，`--thinking off`
在 `openai-completions` 上没有显式关闭推理的载荷：如果发送 `reasoning_effort`，
它会请求 `efforts` 列出的第一个档位，即使设置了
`requiresEffort: false` 也是如此（例如，`efforts: [low, medium, high]` 会发送
`reasoning_effort: low`）。因此请从最低档位开始排列。要关闭推理，
必须使用服务端认为表示关闭的请求格式。例如，
`thinkingFormat: qwen-chat-template` 会发送
`chat_template_kwargs: { enable_thinking: false }`。

- `supportsReasoningEffort`：接受 `reasoning_effort`。默认遵循端点或模型策略；同一模型提供方下支持的协议变体也可能不同。
- `supportsReasoningParams`：指定构建请求时是否允许发送任何推理参数。默认自动判断（GitHub Copilot 的 Chat Completions 关闭）。
- `supportsReasoningSummary`：允许 Responses 推理摘要。默认遵循端点或模型策略；可设为 `false`，用于拒绝 `reasoning.summary` 的端点。
- `reasoningEffortMap`：从内部思考档位（`minimal|low|medium|high|xhigh|max`）到模型提供方专用字符串的部分映射（例如 Fireworks GLM 使用 `minimal -> "none"`）。
- `thinkingFormat`：控制思考的请求格式，可设为 `"openai"`（`reasoning_effort`）、`"openrouter"`（`reasoning: { effort }`）、`"zai"`（`thinking: { type: "enabled" }`）、`"qwen"`（顶层 `enable_thinking`）或 `"qwen-chat-template"`（`chat_template_kwargs.enable_thinking`）。默认遵循端点或模型策略，通常为 `"openai"`。
- `qwenTemplateReasoningEffort`：将选定的思考档位传给 Qwen 3.8+ 聊天模板的 `reasoning_effort` 关键字参数（`chat_template_kwargs.reasoning_effort`；`qwen` 协议变体还会发送顶层字段）。默认遵循目录策略（LM Studio、llama.cpp 发现和 vLLM 上的 Qwen 3.8+ 启用此项）。可设为 `false`，用于拒绝未知 `chat_template_kwargs` 的严格服务端；此时 Qwen 协议变体不发送所选档位，模板按自身的默认档位运行。
- `reasoningContentField`：助手消息中承载思维链的字段，可以是 `"reasoning_content"`、`"reasoning"` 或 `"reasoning_text"`。默认自动判断。
- `requiresReasoningContentForToolCalls`：助手调用工具的轮次必须原样回传推理字段。默认遵循端点或模型策略（包括 DeepSeek、Kimi 和启用了推理的 OpenRouter）。
- `allowsSyntheticReasoningContentForToolCalls`：之前某次助手工具调用缺少模型提供方返回的推理内容时，允许发送占位的推理字段。默认遵循端点或模型策略；会校验推理值是否完全一致的模型提供方应设为 `false`。
- `requiresAssistantContentForToolCalls`：助手调用工具的轮次必须包含非空文本内容。默认遵循端点或模型策略（包括 Kimi 和直连 DeepSeek 推理）。
- `whenThinking`：仅在请求实际启用思考模式时应用的部分兼容性覆盖配置，与基础兼容性配置深度合并，并优先于基础配置。

工具与消息规范化：

- `requiresToolResultName`：工具结果消息需要 `name` 字段（Mistral）。默认自动判断。
- `requiresAssistantAfterToolResult`：工具结果之后如果是用户消息，两者之间必须插入一个助手轮次。默认自动判断。
- `requiresThinkingAsText`：将思考块转换成用 `<thinking>` 定界符包裹的文本（Mistral）。默认自动判断。
- `requiresMistralToolIds`：将工具调用 ID 规范化为恰好 9 个字母或数字字符。默认自动判断。
- `supportsStrictMode`：接受工具模式中每个工具的 `strict` 字段。默认按模型提供方和 baseUrl 保守地自动判断。
- `toolStrictMode`：`"all_strict"` 为所有工具强制启用严格模式，`"none"` 强制关闭；未设置时遵循端点或模型策略（通常混合使用严格和非严格模式，Cerebras 主机对所有工具启用严格模式）。

网关路由（仅当 `baseUrl` 与网关匹配时应用）：

- `openRouterRouting.only` / `openRouterRouting.order`：`openrouter.ai` 上的模型提供方路由（见 <https://openrouter.ai/docs/provider-routing>）。
- `vercelGatewayRouting.only` / `vercelGatewayRouting.order`：`ai-gateway.vercel.sh` 上的模型提供方路由（见 <https://vercel.com/docs/ai-gateway/models-and-providers/provider-options>）。

模型提供方级 `compat` 是基础配置；模型级 `compat` 与其深度合并，并优先于基础配置。
`openRouterRouting`、`vercelGatewayRouting`、`extraBody` 和 `whenThinking` 作为嵌套对象合并。

### Anthropic 兼容性（`anthropic-messages`） \{#anthropic-compatibility-anthropic-messages}

对于 `anthropic-messages` 模型，运行时使用单独的 `AnthropicCompat` 结构
（`packages/catalog/src/types.ts`）。`models.yml` 的校验模式将禁用严格工具模式的选项放在
模型提供方的顶层字段中；在 `compat` 内，凡是也属于
`AnthropicCompat` 字段的共享键，都会生效：`supportsContextManagement`、`supportsEagerToolInputStreaming`、
`supportsForcedToolChoice`、`allowAnthropicHeaderOverrides`、`requiresToolResultId`、
`replayUnsignedThinking`、`bedrockMessagesApi`、`stripImageInput` 和 `streamIdleTimeoutMs`。Anthropic 端的其他选项
由内置目录元数据提供，不能在这里配置。`applyCompatOverrides`
会丢弃解析后的结构未声明的覆盖键。

### Bedrock 兼容性（`bedrock-converse-stream`） \{#bedrock-compatibility-bedrock-converse-stream}

针对 Bedrock 模型，同一个 `compat` 字段接受 `promptCacheMode`（`none`、`automatic` 或 `explicit`）、
`supportsLongPromptCacheRetention`、`promptCacheMinimumTokens`、
`promptCacheMaximumCheckpoints`、`supportsForcedToolChoice`（强制指定 `any`/`tool` 时，
会回退到 `auto`，条件是该项为 `false`；Claude Opus/Sonnet 5.5 有内置设置）以及
`supportsThinkingBindingControls`。支持前缀绑定的 Claude 模型（Fable 5.1+、
Opus/Sonnet/Haiku 5.5）默认发送 `thinking.block_binding`、`thinking-binding-controls-2026-08-01`
测试版标记和 `/input_transformations` 响应路径。如果网关或区域拒绝这些内容，
请设置 `supportsThinkingBindingControls: false`。本地的
前缀绑定保护仍然启用；如果请求因前缀不匹配而被拒绝，则移除已绑定的思考内容后
重试一次。

默认情况下，`bedrock-converse-stream` 请求发送到 `bedrock-runtime.{region}.amazonaws.com`。
请求中显式指定的区域或模型 ARN 中的区域优先。否则，从
`AWS_REGION`、`AWS_DEFAULT_REGION` 或 AWS 配置档案取得环境区域；如果它与推理
配置档案的地理前缀兼容，就采用它；未取得兼容的环境区域时，回退到兼容的防护规则 ARN 区域或该地理范围的
默认区域。模型没有可识别的地理前缀时，依次尝试环境区域、防护规则 ARN 中的区域、
区域性 `baseUrl` 指定的区域和 `us-east-1`。如需将请求发往其他地址，请设置 `baseUrl`，位置可以是 `providers.amazon-bedrock`，
也可在使用
`api: bedrock-converse-stream` 的自定义模型提供方中设置，例如指向 VPC/PrivateLink
端点、FIPS 主机或网关。`baseUrl` 上的路径和查询字符串都会保留：路径作为前缀，
查询字符串追加到最终 URL，并在签名时纳入 SigV4 的规范请求。
因此最终 URL 为 `{baseUrl}/model/{id}/converse-stream[?query]`。这也适用于
通过查询参数而不是请求头进行身份验证的网关：

```yaml
providers:
   amazon-bedrock:
      baseUrl: https://vpce-0123456789abcdef0.bedrock-runtime.us-east-1.vpce.amazonaws.com
```

有一种主机不会按字面使用：如果 `baseUrl` 恰好是
`bedrock-runtime.{region}.amazonaws.com`，则表示 AWS 自有端点，OMP 会将其中的区域部分替换为
解析出的区域。签名必须与实际发送到的区域一致，而每个内置 Bedrock
模型都已带有这样的 `baseUrl`。请指定不同的主机（VPC 端点、`-fips` 主机或网关），
以固定使用该源站。

对于没有可识别地理前缀的模型，如果环境和防护规则 ARN 都未指定区域，则由区域性 `baseUrl` 决定区域。
SigV4 会使用该区域签名，而不是使用默认的 `us-east-1`。
环境区域或限定区域的模型 ID 或 ARN 优先。网关如果接受 Bearer 令牌
而不是 SigV4，就不需要 AWS 签名凭据：设置
模型提供方的 `apiKey`（或 `AWS_BEARER_TOKEN_BEDROCK`）后，OMP 会跳过签名。区域解析结果仍会
决定 AWS 的默认主机。

### Bedrock Anthropic Messages API 上的 Claude（`/anthropic`） \{#claude-on-bedrocks-anthropic-messages-api-anthropic}

Amazon Bedrock 也通过 Anthropic Messages API 提供 Claude，两个端点的路径均为 `/anthropic`。
AWS 建议新应用使用 `bedrock-runtime`
（[通过 Anthropic Messages API 执行推理](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-messages-api.html)）。
Claude Opus 4.7 及更高版本通过此 API 提供；Opus 4.6 及更早版本仍通过 Converse 提供
（[Amazon Bedrock 上的 Claude](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock)）。

| 路由 | 基础 URL | 模型提供方 | 模型 ID |
| --------------- | ---------------------------------------------------------- | ---------------- | ------------------------------------------------------ |
| bedrock-runtime | `https://bedrock-runtime.<region>.amazonaws.com/anthropic` | `amazon-bedrock` | 推理配置档案，例如 `us.anthropic.claude-opus-5-5` |
| bedrock-mantle  | `https://bedrock-mantle.<region>.api.aws/anthropic`        | `bedrock-mantle` | `anthropic.claude-opus-5-5`                            |

FIPS 主机（`bedrock-runtime-fips.<region>.amazonaws.com`）和 AWS PrivateLink 的端点专用主机
（`<vpce-id>[-<az>].bedrock-runtime.<region>.vpce.amazonaws.com`，
`bedrock-runtime-fips` 和 `bedrock-mantle` 同理）会被识别为相同路由。启用了
私有 DNS 的 VPC 端点不需要修改配置：它会在公共主机名上响应
（[Bedrock VPC 端点](https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-interface-endpoints.html)）。

请在表中对应的模型提供方下定义模型，并设置 `api: anthropic-messages`。这两个
模型提供方 ID 带有启用 Claude 按需压缩的目录规则
（见[压缩](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/compaction.md)）。将 `auth: apiKey` 设定后，OMP 会发送普通的 API 密钥请求；如果省略此项，
自定义 `anthropic-messages` 模型会采用 Claude Code 的请求格式。示例使用
[Amazon Bedrock API 密钥](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html)进行身份验证；
OMP 不会使用 SigV4 为 Runtime 路由请求签名。请把区域写入 Runtime URL。Mantle
URL 可以保留 `{region}`，OMP 会根据 AWS 区域设置填充它。

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

这些路由的请求格式由 `compat.bedrockMessagesApi` 控制。无论模型提供方 ID 是什么，只要 Bedrock 的
`/anthropic` 路由出现在 `baseUrl` 中，OMP 就能检测到。两条路由都拒绝工具的 `strict` 字段，因此 OMP 会移除
该字段。OMP 还会让 `metadata.user_id` 符合
Bedrock 的[请求元数据格式](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)，
Runtime 路由会强制校验该格式：原值符合格式就保留，否则发送其中的会话 ID，
再不行就省略。两项处理都在 `onPayload` 钩子（如果有）之后执行。两条路由都会验证思考内容的
签名，因此 OMP 默认不会向它们重放未签名的思考内容。

URL 检查无法识别代理背后的 Bedrock 路由，也无法识别通过 `ANTHROPIC_BASE_URL` 改写官方
`anthropic` 模型提供方地址所指向的 Bedrock 路由。如果不显式启用，这两种情况仍发送普通 Anthropic 请求。
可在 `compat` 中（模型提供方级或在 `modelOverrides` 下）启用此选项，也可设为 `false`，以便对 Bedrock URL
禁用它：

```yaml
providers:
   anthropic:
      compat:
         bedrockMessagesApi: true # ANTHROPIC_BASE_URL points at bedrock-runtime /anthropic
```

按需压缩仍要求目录为相关模型系列授予此能力（模型提供方 ID 为 `amazon-bedrock`、
`bedrock-mantle`、`anthropic` 或 `google-vertex`）。任意代理的模型提供方 ID 不会
仅凭 `bedrockMessagesApi` 获得这项能力。

### 工具模式的严格匹配（`disableStrictTools`） \{#strict-tool-schemas-disablestricttools}

Anthropic API 支持在工具定义中设置 `strict` 字段，强制模型始终完全遵守所提供的模式。OMP 默认只为少量常用的内置 `anthropic-messages` 工具启用该字段（`python`、`edit` 和 `find`），这些工具的模式符合 Anthropic 的严格语法限制。其他工具仍发送规范化后的模式，但省略 `strict`。`bash` 不在此列：严格解码会固定属性顺序，一旦某次调用写入 `async`，就不能再输出声明在它之前的 `timeout`。

为 Anthropic API 提供前端接口的第三方模型提供方（AWS Bedrock、Azure、自托管代理）不一定实现此字段，未实现时会拒绝包含它的请求。要关闭允许列表中工具的严格模式，请在模型提供方级设置 `disableStrictTools: true`：

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

`disableStrictTools` 是模型提供方级的标志，对其下所有模型生效。它只对原本会被 OMP 标为严格的工具禁用 Anthropic 的 `strict` 标记，不改变运行时对工具参数的校验。如果 Anthropic 在传输首个 token 前报告严格语法过大，OMP 可以自动关闭严格工具模式后重试；代理因其他原因拒绝 `strict` 字段时，应显式设置此标志。在 `google-vertex` 上，如果 GCP 组织策略 `vertexai.allowedPartnerModelFeatures` 不允许 `structured_outputs`，Claude 也可能拒绝严格工具。OMP 会省略 `strict` 重试一次，并在该会话中固定 `strictToolsDisabled`。将 `disableStrictTools: true` 用于 `google-vertex` 可跳过会失败的首次请求。

发送给服务端的工具模式由以下位置的统一流程规范化：
`packages/ai/src/utils/schema/normalize.ts`（包含 Google、CCA 和 MCP 的分派器，
以及 OpenAI 严格模式的清理与强制校验流程）。参见
[`ai-schema-normalize.md`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/ai-schema-normalize.md)，其中说明了严格模式的
特殊情况（内联本地 `$ref`、折叠单项 `allOf`、
将 `anyOf` 包装层的描述提升到外层、推断 enum/const 的原始类型），
以及各模型提供方与分派器的映射关系。

## 实用示例 \{#practical-examples}

### 本地 OpenAI 兼容端点（无身份验证） \{#local-openai-compatible-endpoint-no-auth}

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

对于提供可用于发现的 `/v1/models` 端点的 oMLX 或其他本地 OpenAI 兼容服务端，优先使用发现，无需手动列出模型。请将 `api` 设为服务端实际提供的端点类型：`openai-completions` 使用 `/v1/chat/completions`；提供 `/v1/responses` 的服务端应使用 `openai-responses`。

```yaml
providers:
   omlx:
      baseUrl: http://127.0.0.1:11434/v1
      auth: none
      api: openai-completions
      discovery:
         type: openai-models-list
```

无需声明自定义发现类型，就能将内置 vLLM 模型提供方指向非默认端点。OMP 使用 vLLM 的 `/v1/models` 元数据，并将 vLLM 的 `max_model_len` 字段保留为发现的上下文窗口大小。

```yaml
providers:
   vllm:
      baseUrl: http://192.168.5.3:8085/v1
      auth: none
```

要配置多个 vLLM 端点，可使用任意模型提供方 ID，走通用 OpenAI 兼容发现路径。对于无需身份验证的本地服务端，设置 `auth: none`；对于需要身份验证的服务端，设置 `apiKey`。通用发现先读取 `max_model_len`，再回退到 OpenAI 兼容端点通用的 `context_length`。

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

### 使用环境变量提供密钥的托管代理 \{#hosted-proxy-with-env-based-key}

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

### 覆盖内置模型提供方的路由和模型元数据 \{#override-built-in-provider-route--model-metadata}

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

## 旧版调用方的注意事项 \{#legacy-consumer-caveat}

大多数模型配置通过 `models.yml` / `models.yaml` 由 `ModelRegistry` 加载。
通过代码传入配置路径时，仍支持显式指定 `.json` / `.jsonc`；当前智能体目录中的
`models.yml` 优先于 `models.yaml`。

## 校验失败时的行为 \{#failure-mode}

如果 `models.yml` / `models.yaml` 不符合配置模式或未通过校验：

- 注册表继续使用内置模型运行
- 错误通过 `ModelRegistry.getError()` 提供，并显示在界面或通知中
