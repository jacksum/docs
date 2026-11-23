# 自定义模型提供方 \{#custom-providers}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Custom Providers](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/custom-provider.md)。[上游 MIT 许可证](./license.md)。

如果模型服务需要自定义认证、模型发现、请求处理或流式传输，可通过模型提供方扩展将其接入 Pi。如果服务已经支持 Pi 能调用的 API，直接在 `models.json` 中配置即可。

模型提供方扩展在 Pi 进程内运行，可以查看凭据、提示词、工具定义、模型响应和用量。请将其视为受信任的代码，不要把密钥等秘密信息或模型提供方的载荷写入日志。

## 选择满足需求的最简集成方式 \{#choose-the-smallest-integration}

| 需求 | 集成方式 |
|---|---|
| 通过受支持的 API 添加模型 | [`models.json`](./models.md#configure-a-compatible-endpoint) |
| 修改现有模型提供方的端点或请求头 | `models.json` 或只包含必要逻辑的模型提供方扩展 |
| 动态发现模型 | 实现 `refreshModels` 的模型提供方 |
| 添加 `/login` 登录流程 | 使用原生或旧版 OAuth 配置的模型提供方 |
| 实现尚不支持的通信协议 | 实现 `stream` 或 `streamSimple` 的模型提供方 |

模型提供方扩展也是一种[扩展](./extensions.md)，遵循相同的加载、信任、重载和错误处理规则。

## 注册模型提供方 \{#register-a-provider}

在扩展工厂函数中调用 `pi.registerProvider()`。Pi 会等待异步工厂函数执行完毕再继续启动，因此启动时选择模型和执行 `pi --list-models` 时，都能使用在此处注册的模型提供方。

注册有两种形式：

- 注册 `@earendil-works/pi-ai` 中的完整 `Provider`，使用原生的认证、过滤、发现、刷新和流式传输机制。
- 提供模型提供方名称和 `ProviderConfig` 进行注册，沿用现有扩展采用的旧版配置形式。

如果新集成除了提供静态端点和模型元数据，还需要处理其他行为，建议注册完整的模型提供方。Pi 会将 `models.json` 中的覆盖配置应用到已注册的原生模型提供方上。

为现有模型提供方仅注册 `baseUrl` 或 `headers` 时，其内置模型仍会保留。使用旧版形式提供 `models` 时，会替换该提供方的所有对话、图像和分类模型。省略 `type` 表示 `"chat"`。图像模型和分类模型必须显式声明类型，并分别在 `images` 和 `classifiers` 字段中提供以各自 `api` 值为键的实现。

### 重定向现有模型提供方 \{#redirect-an-existing-provider}

只注册需要更改的字段，即可保留该模型提供方的内置模型目录、认证方式、API 实现和兼容性设置：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("anthropic", {
    baseUrl: "https://gateway.example.com/anthropic",
    headers: {
      "X-Gateway-Key": "$GATEWAY_API_KEY",
    },
  });
}
```

如果代理或网关沿用上游协议，请使用这种形式。不要将内置模型列表复制到扩展中，否则原本只需覆盖端点，却会替换整个模型目录，使其可能与内置目录脱节。

### 注册兼容端点 \{#register-a-compatible-endpoint}

如果服务实现了受支持的协议，但拥有自己的模型目录，请注册其端点，并且只注册该服务实际提供的模型：

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("acme", {
    name: "Acme AI",
    baseUrl: "https://api.acme.example/v1",
    apiKey: "$ACME_API_KEY",
    api: "openai-completions",
    models: [
      {
        type: "chat",
        id: "acme-chat",
        name: "Acme Chat",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      },
    ],
  });
}
```

如果不需要运行扩展代码，优先使用 `models.json`。如果注册依赖运行时发现、自定义认证，或需要与扩展的其他功能共用代码，请使用扩展。

### 注册支持多种操作的模型 \{#register-mixed-operation-models}

支持多种操作的模型提供方可以同时注册非对话模型及其实现：

```typescript
pi.registerProvider("media-tools", {
  apiKey: "$MEDIA_TOOLS_API_KEY",
  models: [
    {
      type: "image",
      id: "image-v1",
      name: "Image V1",
      api: "media-images",
      baseUrl: "https://media.example.com/v1",
      input: ["text"],
      output: ["image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    },
    {
      type: "classifier",
      id: "classifier-v1",
      name: "Classifier V1",
      api: "media-classifier",
      baseUrl: "https://media.example.com/v1",
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 64000,
    },
  ],
  images: {
    "media-images": { generateImages: async (model, context, options) => result },
  },
  classifiers: {
    "media-classifier": { classify: async (model, context, options) => result },
  },
});
```

模型级 `baseUrl` 优先于模型提供方的端点。如果未提供 `models` 列表，所有操作的内置模型都会保留。不同操作中的同名模型 ID 仍相互独立，各自的模型级请求头也不会混用。

扩展完成初次加载后，注册调用会立即生效。调用 `pi.unregisterProvider()` 可以移除动态注册的模型提供方，恢复它所替换的内置行为。

[GitLab Duo 模型提供方](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/extensions/custom-provider-gitlab-duo)是经过验证的完整注册示例，它使用内置 API 实现处理流式传输。

## 提供认证 \{#provide-authentication}

静态模型提供方可以从字面值、环境变量插值或命令输出获取 API 密钥。取值语法与 `models.json` 相同：

- `$NAME` 和 `${NAME}` 读取环境变量。
- 以 `!command` 开头的值使用命令输出。
- `$$` 生成字面字符 `$`。
- `$!` 在开头生成字面字符 `!`。

需要保存凭据、自定义凭据解析、使用模型提供方专用的环境变量或支持多种登录方式时，请使用原生认证机制。

支持 OAuth 的模型提供方需要提供显示名称、登录流程、令牌刷新和访问令牌解析。注册后，该提供方会出现在 `/login` 中，Pi 会将返回的凭据保存到 `~/.pi/agent/auth.json`。

OAuth 回调不依赖特定界面。它们可以打开授权 URL、显示设备码、报告进度、请求输入，或让用户选择登录方式。发起网络请求时，要处理取消操作并响应传入的中止信号。

按 Enter（`tui.select.confirm`）可打开设备登录 URL 并复制设备码，也可以手动登录。模型提供方可以在 `onDeviceCode` 或原生 `AuthEvent` 通知中设置 `openBrowserOnConfirm: false` 或 `copyCodeOnConfirm: false`，分别禁用这两项操作。

不要把访问令牌、刷新令牌、授权请求头或模型提供方的完整响应写入常规日志。

## 提供和刷新模型 \{#supply-and-refresh-models}

每个模型都需要提供 ID、显示名称、输入能力和费用元数据。对话模型和分类模型还需要上下文窗口。对话模型须注明输出上限以及是否支持推理；图像模型须声明输出模态。通常在模型提供方级选择 API 实现，只有在特定模型需要时才覆盖。

如果需要 Pi 在空闲期间保持提示词缓存有效，请将 `promptCache.short` 或 `promptCache.long` 设为模型提供方尽力维持该缓存的时长，单位为秒。对应字段未设置时，Pi 不会为该保留级别预热缓存。

兼容性标志用于描述已确认的、与受支持 API 标准行为的差异。不要仅凭端点声称兼容就启用这些标志。

以实际服务器为准，确认请求字段和响应行为。

如果模型目录来自正在运行的服务，请使用 `refreshModels`。将 `context.signal` 传给阻塞式 I/O 操作，让调用方可以取消刷新。

两种注册形式的刷新约定不同：

- 完整的 `Provider` 不返回值。它调用 `context.publish({ update })` 写入由提供方管理的模型状态，之后同步的 `getModels()` 方法会提供最新列表。
- 旧版 `ProviderConfig.refreshModels` 返回可包含不同操作类型的模型定义。Pi 用返回的列表替换本次注册的实时模型，并按要求持久化。

只有需要在下次运行时保留目录数据，才发布需要持久化的数据。llama.cpp 等正在运行的服务可以只更新内存中的列表；远程目录则可以保留快照，供离线启动使用。

## 复用受支持的流式 API \{#reuse-a-supported-streaming-api}

只要模型提供方的协议与 Pi AI 的某个 API 实现相匹配，就使用该实现。

受支持的实现包括 Anthropic Messages、OpenAI Chat Completions 和 Responses、Google Generative AI 和 Vertex、Azure OpenAI Responses、Mistral Conversations 以及 Bedrock Converse。

模型提供方仍可自定义认证、基础 URL、请求头、模型过滤和发现，同时将请求转换和流式传输交给现有 API 实现。

复用现有实现比复制流式实现更安全，因为它保留了 Pi 的消息转换、工具处理、用量统计、取消和兼容性行为。

## 实现自定义流式传输 \{#implement-custom-streaming}

只有现有 API 实现均无法适配该服务时，才实现 `streamSimple`。请先阅读 [`packages/ai/src/api`](https://github.com/earendil-works/pi/tree/v1.6.0/packages/ai/src/api) 下的实现。

流式实现接收规范化的 `TranscriptContext`。系统提示词和工具声明保存在对话记录的系统消息中，应分别用 `getCurrentSystemPrompt(context.messages)` 和 `getCurrentTools(context.messages)` 读取，不要依赖 `context.systemPrompt` 或 `context.tools`。如果模型支持对话中途出现的系统消息，可以原样传入；否则，调用 `collapseSystemMessages(context)` 将后续的系统消息合并到开头的系统消息中。

自定义流式实现必须：

1. 创建助手消息，填入模型提供方、模型、时间戳、待定的停止原因和内容，并将用量清零。
2. 请求准备成功后，在发出任何内容事件之前发出一次 `start` 事件。
3. 一边更新消息，一边发出首尾配对的文本、思考和工具调用事件。
4. 确定最终的用量、费用、内容和停止原因。
5. 发出且只发出一个终止事件 `done` 或 `error`，随后关闭流。
6. 将取消操作转换为已中止的结果。

如果请求准备在 `start` 前失败，流可以直接发出 `error` 并终止。缺少请求认证信息时，也可能在返回流之前同步抛出异常。

内容索引对应助手消息中的各个内容块。先更新内容块，再发出通过 `partial` 字段展示该块状态的事件。到 `toolcall_end` 时，工具调用参数必须包含解析后的有效输入。

流式实现还必须处理 `SimpleStreamOptions` 提供的请求观测机制：

- 向模型提供方发送请求之前调用 `options.onPayload`。如果它返回替换载荷，则使用返回的载荷。
- 收到响应后、读取响应体前，调用 `options.onResponse`。
- 对每个已解析的模型提供方事件，在规范化前调用并等待 `options.onProviderStreamEvent?.(providerEvent, model)` 完成。
- 将中止信号和模型提供方专用的环境变量传下去。

这些钩子支持扩展检查请求、接收响应头事件以及观测模型提供方的事件流。省略这些钩子会使该提供方的行为与 Pi 的内置模型提供方不同。

## 报告失败和用量 \{#report-failures-and-usage}

设置明确的最终停止原因。发生错误或中止时，消息必须包含 `errorMessage`。请求成功时，消息必须准确报告输入、输出、缓存用量、token 总数和费用。

Pi 可以在识别到上下文溢出错误后压缩上下文并重试。如果服务返回 Pi 无法识别的错误消息，请在带条件检查的 `message_end` 处理函数中，仅将该模型提供方的溢出响应规范为 `context_length_exceeded`。

不要把速率限制或模型提供方的临时故障改写成上下文溢出错误。Pi 会按常规重试机制处理这些故障。

## 测试集成 \{#test-the-integration}

至少测试以下情况：

- 普通文本响应和空文本响应
- 工具调用和工具结果
- 图像输入和图像工具结果（如果支持）
- 用量和费用统计
- 中止行为
- 上下文溢出
- 格式错误或不完整的流
- Unicode 字符边界
- 会话在不同模型提供方之间切换
- 认证刷新和取消

[`packages/ai/test`](https://github.com/earendil-works/pi/tree/v1.6.0/packages/ai/test) 下的模型提供方测试定义了内置模型提供方的预期行为。请改用适合该集成的测试套件，不要仅靠手动发送提示词来验证。

开发时直接运行扩展，之后将其移到 Pi 能自动发现的位置，或通过 [Pi 包](./packages.md)分发。在活动会话中修改了自动发现的模型提供方扩展后，运行 `/reload`。
