# 选择模型 \{#choose-a-model}

如果使用 Pi 内置的模型提供方，先运行 `/login`，再通过 `/model` 选择模型。只有在 Pi 尚未内置所需的模型提供方或端点时，才需要自定义模型配置。

## 选择接入方式 \{#choose-a-connection}

| 已有资源 | 推荐配置 |
|---|---|
| Pi 支持的订阅 | 通过 `/login` 登录 |
| 模型提供方的 API 密钥 | 通过 `/login` 保存密钥，或设置对应的环境变量 |
| 本地 GGUF 模型 | 将 Pi 连接到 llama.cpp 路由器 |
| 兼容 OpenAI、Anthropic 或 Google 的端点 | 将端点添加到 `models.json` |
| 使用自定义协议或认证流程的模型提供方 | 编写或安装模型提供方扩展 |

[模型目录](https://pi.dev/models)列出了当前的模型提供方、模型 ID、能力、上下文上限和价格。Pi 启动时使用内置目录，并可用 pi.dev 上较新的目录数据覆盖内置数据。离线时仍可使用缓存的目录数据。运行 `pi update --models` 可强制刷新。

## 认证 \{#authenticate}

运行 `/login` 并选择模型提供方。Pi 将凭据保存在 [`auth.json`](./configuration.md#agent-directory) 中。运行 `/logout` 可删除某个模型提供方的已保存凭据。

也可以通过模型提供方对应的环境变量提供 API 密钥。这适用于 CI 等不应让 Pi 写入凭据的环境。环境变量和各模型提供方的配置方式见[模型提供方](./providers.md)。

若配置了多个凭据来源，Pi 会依次使用运行时传入的 `--api-key`、`auth.json` 中保存的凭据、`models.json` 中的 `apiKey`，最后才使用模型提供方对应的环境变量或运行环境中可用的云凭据。模型提供方扩展可以定义自己的认证行为。

请勿公开 `auth.json` 和用于获取凭据的命令。信任项目后，项目设置和扩展可以在 Pi 进程中执行代码。从不受信任的目录加载配置前，请查阅[安全指南](./security.md)。

## 选用可用模型 \{#select-a-model}

运行 `/model` 搜索可用模型。选择器只显示其模型提供方已有可用身份验证凭据的模型。选中模型后按 `Ctrl+S`，将其保存为新会话的默认模型。

运行 `/thinking` 为当前模型选择思考级别。在该界面按 `Ctrl+S` 可保存启动时使用的级别。Pi 只提供所选模型支持的级别。

按 `Ctrl+P` 可在可用模型之间循环切换。使用 `/scoped-models` 可限定切换范围并保存所选范围，也可以在[设置](./settings.md#model-cycling)中配置模型匹配模式。

会话会记录模型和思考级别的变更。恢复会话时，Pi 会还原这些选择，不会更改新会话的默认设置。

## 连接本地模型 \{#connect-local-models}

Pi 直接集成了 llama.cpp 路由器。路由器会查找 GGUF 文件并按需加载模型。Pi 的 `/llama` 命令用于管理路由器，`/model` 用于从路由器已加载的模型中选择一个。

服务器启动、模型文件的目录结构、下载和连接故障排查见[通过 llama.cpp 使用本地模型](./llama-cpp.md)。

对于 Ollama、LM Studio、vLLM、SGLang 和其他兼容服务器，请在 `models.json` 中[配置兼容端点](#configure-a-compatible-endpoint)。

## 配置兼容端点 \{#configure-a-compatible-endpoint}

如果端点使用 Pi 已支持的 API，请使用 [`models.json`](./configuration.md#agent-directory) 配置。这适用于大多数 Ollama、LM Studio、vLLM、SGLang 和代理服务部署。

```json
{
  "$schema": "https://pi.dev/schemas/models.schema.json",
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "models": [
        { "id": "qwen2.5-coder:7b" }
      ]
    }
  }
}
```

示例中的占位密钥让模型可在 Pi 中使用；Ollama 会忽略这个密钥。对于需要认证的端点，`apiKey` 和请求头的值可以通过 `$NAME` 或 `${NAME}` 插入环境变量，也可以直接填写字面值，或通过 `!command` 指定命令。`$$` 和 `$!` 分别生成字面字符 `$` 和 `!`。Pi 在发起请求时执行 `models.json` 中的命令，不缓存命令结果。

打开 `/model` 时，Pi 会重新加载该文件。`models` 中的条目会添加模型，或替换同一模型提供方下具有相同 ID 的模型。使用 `modelOverrides` 可更改已有的内置模型或由扩展提供的模型的元数据，而无需替换模型提供方的模型列表。Pi 会忽略无法匹配的覆盖配置 ID。

若要通过代理访问内置模型提供方，仅设置它的 `baseUrl` 即可。其模型和认证方式保持不变：

```json
{
  "providers": {
    "anthropic": { "baseUrl": "https://proxy.example.com/v1" }
  }
}
```

[模型配置](./models-configuration.md)列出了全部字段。

### 声明模型输入限制和缓存时长 \{#describe-model-input-and-caching}

使用 `inputLimits.images.resize` 控制 Pi 如何编码新的图片附件、`read` 结果中的图片以及工具结果中的图片，再将它们写入对话历史：

```json
{
  "id": "vision-model",
  "input": ["text", "image"],
  "inputLimits": {
    "images": {
      "resize": {
        "maxWidth": 1568,
        "maxHeight": 1568,
        "maxBytes": 524288,
        "jpegQuality": 75
      }
    }
  }
}
```

`maxBytes` 限制经 base64 编码后的数据大小。省略的缩放字段采用保守的默认值：2000 × 2000 像素、编码后 4.5 MiB、JPEG 质量 80。图片只编码一次，切换模型不会重写历史图片。目录也可以通过 `inputLimits.maxRequestBytes`、`images.maxPerMessage` 和 `images.maxPerRequest` 声明请求的硬性限制，但 Pi 尚不会根据这些限制重写或拒绝对话历史。

<a id="prompt-cache-lifetimes"></a>

使用 `promptCache` 声明模型提供方尽力维持缓存的时长，单位为秒，对应 `short` 或 `long` 保留级别：

```json
{ "id": "claude-sonnet-5", "promptCache": { "short": 300, "long": 3600 } }
```

如果模型提供方公布了时长范围，请选择较保守的一端。如果模型未声明当前保留级别的缓存时长，Pi 不会为它预热缓存。`modelOverrides` 条目可为内置模型或由扩展提供的模型设置 `inputLimits` 或 `promptCache`，也适用于通过已验证的代理访问的模型。参阅 [`cacheWarming`](./settings.md#model-and-thinking)。

### 按思考级别配置采样参数 \{#configure-sampling-by-thinking-level}

兼容 OpenAI 的 API 支持自由指定 `samplingParams` 作为模型的默认采样参数，并通过 `samplingParamsByThinkingLevel` 按思考级别覆盖这些参数。后者使用 Pi 的思考级别键（`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 和 `max`），不使用 `thinkingLevelMap` 中的模型提供方值：

```json
{
  "id": "qwen-thinking-model",
  "reasoning": true,
  "samplingParams": {
    "temperature": 1.0,
    "top_p": 0.95
  },
  "samplingParamsByThinkingLevel": {
    "off": {
      "temperature": 0.7,
      "top_p": 0.8
    },
    "high": {
      "top_k": 20
    }
  }
}
```

Pi 首先将不受支持的思考级别限制在模型支持的范围内，然后按顺序合并模型的 `samplingParams`、实际生效级别的覆盖参数和请求级 `samplingParams`。同一个键以较后的值为准。没有单独配置的级别继承模型的默认值。`modelOverrides` 会按思考级别将其中的条目与基础模型的配置逐键合并。这些字段仅适用于 `openai-completions`、`openai-responses` 和 `azure-openai-responses`，其他 API 会忽略它们。

兼容性设置应反映已经验证过的端点请求或响应行为差异。不要仅凭端点宣称兼容 OpenAI 或 Anthropic 就启用这些设置。

## 使用分类模型 \{#use-classifier-models}

分类模型不参与对话。它们根据 JSON 状态回答指定类型的问题：从多个选项中选一个、回答是或否，或给出分数。每种答案都附带概率。Pi 支持通过多家模型提供方使用 TypeSafe 的 Jev，也支持通过 Workers AI 和 OpenRouter 使用 Cloudflare 的 Clef、Clef Flash 和 Clef Omni，通过 [Decisions API](https://developers.openai.com/api/docs/guides/decisions) 使用 OpenAI 的 GPT-6 Luna，以及通过 GitHub Copilot 使用 Microsoft-Decision-1：

| 模型提供方 | 模型 ID | 认证方式 |
|---|---|---|
| `typesafe` | `jev-latest` | `TYPESAFE_API_KEY` |
| `openrouter` | `typesafe/jev-1.13`, `typesafe/jev-1.14`, `~typesafe/jev-latest`, `cloudflare/clef`, `cloudflare/clef-flash`, `cloudflare/clef-omni` | `OPENROUTER_API_KEY` 或 `/login` |
| `cloudflare-workers-ai` | `typesafe/jev`, `typesafe/jev-1.14.0`, `@cf/cloudflare/clef`, `@cf/cloudflare/clef-flash`, `@cf/cloudflare/clef-omni` | `CLOUDFLARE_API_KEY` 和 `CLOUDFLARE_ACCOUNT_ID` |
| `vercel-ai-gateway` | `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` |
| `opencode` | `jev-1.13`, `jev-1.13-free` | `OPENCODE_API_KEY` |
| `openai` | `gpt-6-luna` | `OPENAI_API_KEY` |
| `github-copilot` | `microsoft-decision-1` | `COPILOT_GITHUB_TOKEN` 或 `/login` |

[llama.cpp 路由器](./llama-cpp.md#classification)上的对话模型也会列为分类模型。

OpenAI 的 Decisions API 需要 API 密钥，不支持 ChatGPT 登录凭据。因此，通过 `/login` 登录 `openai` 后，即使设置了 `OPENAI_API_KEY`，`gpt-6-luna` 也不会出现在可用模型列表中。退出 `openai` 登录才能使用该密钥。API 会拒绝超过 922K token 的输入，但处理时间超过约五秒的请求会因网关超时而失败，目前这通常对应输入超过约 600K token 的请求。

分类模型不会出现在 `/model` 中。模型通过 [`codemode`](./cli.md#enable-codemode) 工具访问这些分类模型。除非 MCP 服务器启用了该工具，否则它默认关闭。可在[设置](./settings.md#tools)中使用 `"defaultTools": ["+codemode"]` 启用它。随后，脚本可以通过 `models.getAvailableOfType("classifier")` 列出分类模型，并调用 `models.classify(model, { state, questions })`：

```js
const jev = await models.getModelOfType("classifier", "typesafe", "jev-latest");
const result = await models.classify(jev, {
  state: { message: "The change works, thanks." },
  questions: {
    approved: {
      type: "bool",
      instructions: "Does the user approve of the result?",
      criteria: { true: "Approval", false: "No approval" },
    },
  },
});
return result.answers;
```

[Codemode](./codemode.md#classify) 说明了问题和答案的类型。

如果分类模型的 `input` 包含 `"image"`，它也会判断通过 `images` 传入的图片；其他分类模型收到图片时会报错。支持图片输入的模型包括 GPT-6 Luna、`typesafe` 和 `cloudflare-workers-ai` 提供的 Jev、`cloudflare-workers-ai` 提供的 Clef，以及 OpenRouter 目录中标明支持图片输入的模型。Jev 接受 PNG 和 JPEG 图片，图片输入在 TypeSafe 自有 API 上属于实验功能。Clef 接受 PNG、JPEG 和 WebP 图片，每次请求最多四张。`vercel-ai-gateway` 和 `opencode` 提供的 Jev 仅接受文本。

各 System One 服务接收图片的请求格式各不相同，由模型的 `compat.imageInput` 指定。内置模型已设置此属性，因此覆盖模型提供方的 `baseUrl` 不会改变它。如果自定义模型提供方代理其他服务的分类模型，应在 `models.json` 的模型提供方级 `compat` 中设置此属性（见 [System One 兼容性](./models-configuration.md#typesafe-system-one)）。具体来说，OpenRouter 收到 TypeSafe 格式的请求时不会报错，但会丢弃图片。

如果服务报告 token 数量（所有 System One 服务都会报告），`result.usage` 会包含 token 数量和对应费用。Pi 会将脚本调用分类模型的用量计入 `codemode` 工具结果，因此也会计入界面底部和 `/session` 中显示的会话费用。费用按模型目录中的价格计算；未标价的模型（如 TypeSafe 直接提供的 `jev-latest`）会报告 token 数量，费用记为零。

扩展可以直接调用 `ctx.modelRegistry.classify()` 使用分类模型，无需 codemode。[虚拟模型](./virtual-models.md#route-requests)可借助分类模型为请求选择路由，参见 `jev-router.ts` 示例。

## 使用图像模型 \{#use-image-models}

图像模型根据提示词和可选的输入图片生成图片。Pi 将 OpenRouter 的图像模型（如 `google/gemini-2.5-flash-image` 和 `black-forest-labs/flux.2-pro`）列在 `openrouter` 模型提供方下。它们与其对话模型共用 `OPENROUTER_API_KEY` 或 `/login` 凭据。

和分类模型一样，图像模型不会出现在 `/model` 中；模型通过 [`codemode`](./cli.md#enable-codemode) 工具访问它们。脚本通过 `models.getAvailableOfType("image")` 列出图像模型，并调用 `models.generateImages(model, { input })`。结果的 `output` 包含 base64 图片块，`image()` 会将这些块附加到 `codemode` 的结果中，供模型查看：

```js
const painter = await models.getModelOfType("image", "openrouter", "google/gemini-2.5-flash-image");
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A red fox in the snow, watercolor" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) if (block.type === "image") image(block);
```

`input` 也可以包含 `{ type: "image", data, mimeType }` 块，用于提供要编辑或参考的图片。与调用分类模型一样，Pi 将脚本调用图像模型的用量计入 `codemode` 工具结果。生成的图片不会保存到磁盘。完整的 API 见 [Codemode](./codemode.md#generate-images)。

扩展可以直接调用 `ctx.modelRegistry.generateImages()` 生成图片，无需 codemode。

## 添加自定义模型提供方 \{#add-a-custom-provider}

如果模型提供方需要自定义流式传输、模型发现或认证行为，请使用扩展。扩展的开发流程见[自定义模型提供方](./custom-provider.md)。

## 故障排查 \{#troubleshooting}

### 模型未出现在列表中 \{#a-model-does-not-appear}

确认该模型提供方已有可用的认证凭据。Pi 可以从 `models.json` 加载自定义模型，但在取得可用凭据前，该模型不会出现在 `/model` 中。对于 llama.cpp，只会显示路由器当前加载的模型。

### 只有在一个 shell 中能通过认证 \{#authentication-works-in-one-shell-only}

检查密钥是否来自环境变量，而不是 `auth.json`。该环境变量必须存在于启动 Pi 的进程环境中。

### 登录时在远程机器上打开浏览器 \{#sign-in-opens-a-browser-on-a-remote-machine}

如果模型提供方支持无界面认证流程，请使用该流程完成认证。有些模型提供方允许将最终的重定向 URL 或授权码粘贴回 Pi。参阅[交互式认证](./providers.md#authenticate-interactively)。

### 兼容端点拒绝请求 \{#a-compatible-endpoint-rejects-requests}

检查 `models.json` 中该端点的 API 类型和兼容性设置。上游服务器必须支持相应的请求字段和行为。
