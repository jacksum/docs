---
title: "pi-native auth-gateway 传输"
description: "Oh My Pi 官方仓库文档：pi-native auth-gateway 传输。"
---

# pi-native auth-gateway 传输 \{#pi-native-auth-gateway-transport}

`pi-native` 是 pi-ai 客户端与
`omp auth-gateway` 之间的无损传输。它**不是文本工具调用方言**：当前实现中没有
`<call:NAME>` 语法、解析器、渲染器或 `PI_DIALECT=pi-native` 值。
工具调用仍以标准 pi-ai `ToolCall` 内容
块存在于 `Context` 和 `AssistantMessageEvent` 内。

当客户端已使用 pi-ai 协议，而网关掌管
提供方凭据时，可使用此传输，例如容器化 omp 与宿主机
网关通信，或 robomp 槽位与其 sidecar 通信。OpenAI/Anthropic 兼容
路由会进行转换，可能丢失 pi 特有字段；pi-native 直接发送
标准类型，保留服务层级、缓存标记、思考
预算、工具选择变体、图像及工具调用 ID。

### 已移除的 omp 工具调用方言 \{#removed-omp-tool-call-dialect}

历史上，“pi-native”曾指一种带内工具调用序列化格式：使用 `<call:NAME …>` 块的 XML
方言，后来被 sigil 分隔格式取代
（v16.0.10，`f743ddc`，2026-06-18），之后连同选择开关（`tools.format: "pi"`、
`PI_DIALECT=pi`）一起彻底删除（v16.2.2，
`053da98`，2026-06-27）。`packages/ai` 中没有任何内容输出或解析这两种写法。
将 `<call:…>` 块或 `§` 头部称为“omp 工具调用
格式”的旧引用，描述的是已不存在的格式；剩余的带内方言
服务于第三方模型家族（当前列表见
`packages/ai/src/dialect/factory.ts` 中的注册表）。

## 配置与分派 \{#configuration-and-dispatch}

在 `models.yml` 的提供方条目上设置以下字段：

```yaml
transport: pi-native
baseUrl: http://gateway.internal:4000
```

提供方的 `transport` 和网关 `baseUrl` 适用于
该提供方下的每个模型，包括自定义模型。解析后的模型携带
`transport: "pi-native"`；这独立于 `tools.format`。

`baseUrl` 必须指向 `omp auth-gateway`（或兼容服务）。缺少
`baseUrl` 时会失败，报错为：

```text
pi-native transport requires `baseUrl` on model MODEL_ID (set it on the provider config in models.yml)
```

当 `model.transport === "pi-native"` 时，`streamSimple` 跳过普通的
逐 API 提供方实现，调用 `streamPiNative`。客户端移除
`baseUrl` 末尾的斜杠，并向 `/v1/pi/stream` 发起 POST。

网关 bearer 凭据是解析后的模型/API 密钥。它以
`Authorization: Bearer …` 发送，绝不放入 JSON options。模型头部也会
转发；显式的 `model.headers.Authorization` 优先于
解析后的密钥。

客户端还发送 `x-omp-install-id`、`x-omp-hostname` 和 `x-omp-app`，
用于使用量归属统计。这些身份头部不会转发到上游。

`transport` 只改变分派。定价、上下文窗口、最大 token 数和
思考元数据仍在本地从模型目录解析。
线上只发送限定后的模型 ID，而不是客户端的模型对象。
网关自行解析上游模型和提供方凭据。

## 请求 \{#request}

```http
POST /v1/pi/stream
Content-Type: application/json
Accept: text/event-stream

{
  "modelId": "provider/model-id",
  "context": {
    "systemPrompt": ["..."],
    "messages": [],
    "tools": []
  },
  "options": {},
  "stream": true
}
```

客户端始终将 `modelId` 限定为 `${provider}/${id}`，且始终
请求流式传输。服务器也接受 `modelId`、字符串 `model` 或
`model.id`；其底层请求解析器将 `stream` 默认为 `true`。

网关边界的验证有意保持浅层：

- 正文必须是对象；
- 必须存在非空模型标识符；
- `context` 必须是带有 `messages` 数组的对象；
- `context.systemPrompt` 和 `context.tools` 存在时必须为数组。

无效结构会产生验证错误。标准消息/工具内部结构
不会在此边界重新验证；下游失败会表现为网关
上游错误。

## 线上传输的选项 \{#options-crossing-the-wire}

服务器接受以下 `SimpleStreamOptions` 子集：

`temperature`、`topP`、`topK`、`minP`、`presencePenalty`、
`frequencyPenalty`、`repetitionPenalty`、`stopSequences`、`maxTokens`、
`cacheRetention`、`cachedContent`、`userProfileId`、`headers`、
`initiatorOverride`、`maxRetryDelayMs`、`metadata`、`sessionId`、
`promptCacheKey`、`promptCache`、`statefulResponses`、
`streamFirstEventTimeoutMs`、`streamIdleTimeoutMs`、`reasoning`、
`disableReasoning`、`forceReasoningOff`、`hideThinkingSummary`、
`thinkingBudgets`、`toolChoice`、`serviceTier`、`guardrailIdentifier`、
`guardrailVersion`、`guardrailTrace`、`requestMetadata`、`kimiApiFormat`、
`syntheticApiFormat`、`preferWebsockets`、`openrouterVariant`、`loopGuard`、
`acceptEmptyResponse` 和 `anthropicCompaction`。

未知选项以及值为 `null` 和 `undefined` 的选项会被服务器
静默丢弃。客户端还剥离运行时/服务器掌管的字段：
`signal`、`apiKey`、`fetch`、`onPayload`、`onResponse`、`onSseEvent`、
`execHandlers`、`cursorExecHandlers`、`cursorOnToolResult` 和
`providerSessionState`。`onResponse` 仍在本地针对网关的
HTTP 响应运行；回调和运行时句柄本身绝不在线上传输。

对于 Bedrock 模型，`streamSimple` 将模型配置的护栏字段
和请求元数据复制到线上选项。逐次调用的请求元数据条目
按键优先。它还会通过 `options.headers` 转发模型的 `User-Agent`，除非
调用方已提供该头部。

网关注入自己的凭据、中止信号和提供方会话
状态。它为同一网关会话跨请求保留该状态，
而不是尝试序列化客户端的 `providerSessionState` 映射。

## 流式响应 \{#streaming-response}

每个标准 `AssistantMessageEvent` 都不经结构改写而进行 JSON 序列化，
并封装为 SSE 帧：

```text
data: {"type":"start",...}

data: {"type":"text_delta",...}

data: {"type":"done","reason":"stop","message":{...}}

data: [DONE]

```

服务器在标准 `done` 或 `error` 事件之后停止，然后写入
`[DONE]`。如果其事件迭代器先抛出异常，它会尽力发出
`{"type":"error","reason":"error","errorMessage":"..."}`，后接 `[DONE]`。
取消 HTTP 正文会将取消传播到网关请求。

客户端解析每个事件并将其原样推入
`AssistantMessageEventStream`；没有部分内容重建或
工具转换。调用方中止会取消响应正文。首事件和
空闲监视器在提供请求选项时使用这些选项，否则使用标准
`PI_STREAM_FIRST_EVENT_TIMEOUT_MS` / `PI_STREAM_IDLE_TIMEOUT_MS` 策略。
对于空闲监视器，初始 `start` 事件不算进展。

如果 SSE 连接在没有终止事件的情况下关闭，且调用方没有
取消，客户端会以 `ProviderResponseError` 使流失败，分类
为 `kind: "incomplete-stream"`：

```text
pi-native stream read error: stream closed before a terminal response event
```

迭代和 `.result()` 都会拒绝；不完整连接不会被转换
为成功的空回答。如果迭代在调用方取消后
未收到终止事件就结束，客户端会发出
`{type:"error", reason:"aborted", error: syntheticAssistant}`。嵌套
消息具有 `stopReason:"aborted"` 和
`errorMessage:"stream closed without terminal event"`。Fetch/读取异常
以及请求前已中止的信号会直接使流失败。
`reason` 是顶层事件字段；`stopReason` 属于嵌套的
`AssistantMessage`。

客户端只消费流式响应。服务器端点也
支持 `stream: false`，返回：

```json
{ "message": { "role": "assistant", "content": [] } }
```

其中 `message` 包含完整的标准 `AssistantMessage`。

## 错误 \{#errors}

到达 pi-native 路由的提供方/处理器失败使用：

```json
{ "error": { "type": "rate_limit_error", "message": "..." } }
```

并带有相应的 HTTP 状态、`Content-Type: application/json` 和
`Cache-Control: no-store`。客户端将此结构转换为
`AuthGatewayError`，保留状态、响应头部和 `type`。

Bearer 身份验证在路由处理器之前运行。缺失或无效的
网关 bearer 凭据会以 `{"error":"unauthorized"}` 拒绝，而不是使用
结构化的提供方封装；因此客户端使用其通用的
`auth-gateway STATUS: BODY_OR_STATUS_TEXT` 回退，且没有提供方错误
`type` 可保留。其他不合规的错误正文使用同一回退。
没有正文的成功响应也会成为 `AuthGatewayError`。

## 事实依据 \{#source-of-truth}

- `packages/catalog/src/types.ts`：`Model.transport`
- `packages/coding-agent/src/config/model-patch.ts` 和 `model-registry.ts`：
  提供方范围的传输与网关 URL 继承
- `packages/ai/src/stream.ts`：pi-native 分派
- `packages/ai/src/providers/pi-native-client.ts`：请求、身份验证、SSE 和
  超时行为
- `packages/ai/src/providers/pi-native-server.ts`：请求验证、SSE 和
  错误封装
- `packages/ai/src/auth-gateway/caller-options.ts`：请求可
  携带的选项，以及受限作用域客户端 token 会失去的选项
- `packages/ai/src/auth-gateway/server.ts`：`/v1/pi/stream` 路由及网关
  模型/凭据解析
