---
title: "generate_image"
description: "Oh My Pi 官方仓库文档：generate_image。"
---

# generate_image \{#generate_image}

> 生成或编辑图像，并将生成的图像文件写入临时路径。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/image-gen.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/image-gen.md`
- 会话注入：`packages/coding-agent/src/sdk.ts`（`imageGenTool`）
- 提供方传输实现：`packages/ai/src/images/`
- 图像角色/候选解析：`packages/coding-agent/src/config/model-roles.ts`、`packages/coding-agent/src/config/model-resolver.ts`

只有在 `generate_image.enabled=true`（默认为 `false`），且会话的显式工具过滤器（如果有）请求 `generate_image` 时，才会注册此自定义工具。切换设置会在运行中的会话内协调其注册状态；同名扩展工具具有优先权。它请求 `write` 审批，采用非严格模式，并且不发出进度更新。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | ---: | --- |
| `subject` | `string` | 是 | 主要图像提示词。编辑时，描述期望结果及每张输入图像的角色。 |
| `action` | `string` | 否 | 主体正在做什么。 |
| `scene` | `string` | 否 | 地点或环境。 |
| `composition` | `string` | 否 | 相机角度和取景构图。 |
| `lighting` | `string` | 否 | 光照设置。 |
| `style` | `string` | 否 | 艺术风格。 |
| `text` | `string` | 否 | 要在图像中渲染的文本。保持简短，必要时明确可读性要求。 |
| `changes` | `string[]` | 否 | 针对输入图像的编辑说明。 |
| `aspect_ratio` | `"1:1" \| "3:4" \| "4:3" \| "9:16" \| "16:9" \| "3:2" \| "2:3"` | 否 | 请求的输出宽高比。 |
| `image_size` | `"1024x1024" \| "1536x1024" \| "1024x1536"` | 否 | 所选模型传输实现支持时，请求的输出尺寸。 |
| `input` | `Array<{ path?: string; data?: string; mime_type?: string }>` | 否 | 通过本地路径或内联 base64 数据提供的输入图像。 |
| `model` | `string` | 否 | 本次请求的图像模型选择器，例如 `openrouter/google/gemini-3-pro-image` 或 `xai/grok-imagine-image`。省略时使用配置的 `image` 角色链。 |

## 输出 \{#outputs}

- 成功并带有图像数据：
   - `content[0].type = "text"`
   - `content[0].text` 汇总提供方/模型及保存的图像路径；提供方返回各图像的尺寸/质量时，也会包含这些信息。
   - `details = { provider, model, imageCount, imagePaths, images, responseText?, usage? }`；每张图像包含 base64 `data` 和 `mimeType`。
   - 提供方回显实际运行的图像模型时（托管 OpenAI 传输实现），`model` 为该模型，否则为所选目录模型 id。两者不同时，文本会同时显示两者，例如 `Model: gpt-image-2-codex (catalog entry openai-codex/gpt-image-2)`。每个 `images[]` 条目可能携带提供方报告的 `size` 和 `quality`。
- 模型响应不含图像数据时，返回 `No image data returned.`、`imageCount: 0`、空的 `imagePaths` / `images`，以及任何可用的响应文本/用量。不返回图像内容块；请用 `read` 打开保存的路径。

## 流程 \{#flow}

1. 只有功能门控和工具过滤器允许时，SDK 才会将 `imageGenTool` 作为 `generate_image` 自定义工具注入。
2. 带有 `model` 的请求会针对可用的 `image` 类型目录模型解析该选择器，并且只尝试所选模型。不提供该字段时，候选的顺序为：显式配置的图像角色/回退条目，当前模型配置的 `imageModel` 目标，然后是支持托管图像时的当前模型自身，最后是非显式的角色链默认值。重复的提供方/模型条目会被移除。`retry.fallbackChains.image: []` 会移除角色链中的回退选择器，但不会抑制当前模型的图像候选。
3. 工具会跳过 API 传输不受支持、凭据不可用或托管承载模型不可用的候选。提供方 HTTP 失败时会进入解析链中的下一个模型；验证、解析、本地 I/O、取消和超时失败则不会。
4. 找到第一个可用模型后，输入图像会被解析一次。`path` 相对于会话 cwd 解析，并检查是否为普通文件、检查大小以及嗅探内容。内联 `data` 可以是原始 base64（需要 `mime_type`），或 `data:<mime>;base64,...` URL。
5. 所选目录模型的 `api` 决定传输方式：
   - `openai-images`：兼容 OpenAI 的 `/images/generations` 和 `/images/edits` 请求。OpenAI 对编辑使用 multipart 上传；xAI 和 xAI OAuth 使用各自的 JSON 格式。其他提供方接收 JSON `images: [{ image_url: "data:…" }]`。编辑端点返回 `404` 时，会携带编辑载荷重试生成端点。
   - `openrouter-images`：OpenRouter 原生的 `/images` 端点，而非聊天补全。直接发送目录中的请求模型 id，例如选择器 `openrouter/google/gemini-3-pro-image` 对应 `google/gemini-3-pro-image`。
   - `google-generative-ai`：Gemini `:generateContent`，带有 `responseModalities: ["IMAGE"]`。
   - `openai-responses`：OpenAI 托管 Responses 图像生成。
   - `openai-codex-responses`：通过已连接订阅进行的 ChatGPT/Codex 托管 Responses 图像生成。
   - `factory-droid-agent`：通过 Factory 代理使用 Factory Droid 图像模型，客户端身份与聊天相同。GPT Image 模型使用 Factory 的 `/images/generations`，或使用 `/images/edits`，将参考图像作为 JSON 内联；Gemini 3 Pro Image 使用 Factory 的 Gemini 路由，带有 `responseModalities: ["TEXT", "IMAGE"]` 以及 Factory 的生成或编辑指令。
6. 托管 Responses 传输使用目录中具有 `hostedImage` 能力的模型作为承载模型。所选模型支持托管时，由其承载自身的请求；否则，只有当前模型具备该能力且属于同一提供方时才优先选用它，然后选择可用的同提供方承载模型中输入成本最低的模型。对于 `openai-responses` 图像类型条目，图像工具会指定所选图像模型。对于 Codex，或承载自身图像请求的聊天模型，则由宿主选择图像模型。请求始终选择 `image_generation` 并请求 WebP；两种托管传输都会发送解析后的尺寸。
7. 成功响应中的内联图像会保存为临时文件；返回路径及 base64/MIME 图像元数据。不含图像数据的响应会返回正常的零图像结果，而非 `isError`。

## 模式/变体 \{#modes--variants}

- 文生图：提供 `subject` 及可选的风格/构图字段，不提供 `input`。
- 图像编辑：提供一张或多张 `input` 图像，以及 `changes` 和标明每张图像角色的主体描述。
- 文本渲染：使用 `text`；提示词会指导调用方请求清晰、易读、拼写正确的简短文本。
- 模型选择：设置 `model`，为该请求固定一个可用的目录图像模型。省略时使用 `image` 角色及其回退链。

## 副作用 \{#side-effects}

- 文件系统：读取本地输入图像，并将生成的输出图像写入操作系统临时目录下的 `omp-image-<snowflake>.<ext>` 文件。
- 网络：通过所选目录模型的 API 传输发送提示词和可选图像。响应中的 OpenRouter/xAI 图像 URL 会先下载再保存。
- 会话状态：读取当前模型及其图像能力/目标、会话 id、cwd、凭据、`modelRoles.image`、`retry.fallbackChains.image`、模型端点/请求头，以及可选的注入 `fetch`。
- 后台工作/取消：提供方调用使用调用方中止信号，并结合 3 分钟超时。

## 限制与上限 \{#limits--caps}

- 本地路径输入上限为 `35 * 1024 * 1024` 字节（`MAX_IMAGE_SIZE`）。内联 base64 输入没有独立的工具级大小上限。
- 路径输入必须存在、为普通文件，且内容嗅探出的图像类型受支持。每个输入对象必须包含 `path` 或 `data`；两者都有时，`path` 优先。
- 原始 base64 `data` 需要 `mime_type`；data URL 自带 MIME 类型。
- 请求超时为 `3 * 60 * 1000` 毫秒。
- OpenAI 托管输出请求为 WebP。其他响应文件使用根据 MIME 派生的扩展名（`png`、`jpg`、`gif` 或 `webp`；未知 MIME 类型回退为 `.png`）。
- 模式接受 `1:1`、`3:4`、`4:3`、`9:16`、`16:9`、`3:2` 和 `2:3`；上游支持情况取决于所选模型的传输实现。xAI/xAI OAuth 接收原样的比例，默认为 `1:1`。
- `image_size` 接受 `1024x1024`、`1536x1024` 和 `1024x1536`。在 xAI 上，它们映射为 `1k`、`2k` 和 `2k`；省略时默认为 `1k`。
- OpenAI 兼容传输和托管传输优先采用显式的 `image_size`；否则 `1:1` 映射为 `1024x1024`，`3:4` / `9:16` 映射为 `1024x1536`，`4:3` / `16:9` 映射为 `1536x1024`。`3:2` / `2:3` 不会推导出 OpenAI 尺寸。OpenRouter 和 Gemini 直接接收请求的比例/尺寸。上游是否接受以及实际尺寸仍取决于提供方。
- ChatGPT/Codex 订阅后端选择图像模型；工具会发送请求的/解析后的尺寸，而不是丢弃它。有相关信息时，结果会报告后端返回的模型、尺寸和质量。
- xAI/xAI OAuth 编辑请求最多支持 3 张输入图像。
- Factory Droid GPT Image 编辑接受 1-16 张 PNG、JPEG 或 WebP 参考图。每张 Factory 参考图上限为 5 MiB。Factory 的 Images 路由不接收尺寸，因此 `aspect_ratio` 和 `image_size` 只会传到其 Gemini 模型。

## 错误 \{#errors}

- 解析链中没有可用模型：汇总错误会列出尝试过的模型，以及因传输不受支持、凭据不可用、凭据无效或托管承载模型不可用而跳过的候选。
- 输入无效：文件不存在、非普通文件、文件超过 35 MiB、内容嗅探出的图像类型不受支持、缺少 `path`/`data`、图像数据为空，或原始 base64 未提供 `mime_type`。
- 托管图像模型没有可用的同提供方 `hostedImage` 承载模型时，会以 `hosted chat carrier unavailable` 跳过；承载模型没有可用凭据时，会以 `carrier credentials unavailable` 跳过。
- 超过三张 xAI/xAI OAuth 编辑参考图：`<provider> image edits accept up to 3 reference images; got <N>`。
- 超过 16 张 Factory Droid 编辑参考图、参考图超过 5 MiB，或 GPT Image 参考图不是 PNG、JPEG 或 WebP 时，会在发送前被拒绝。
- Factory Droid 响应不含图像时（例如 Gemini 提示词被阻止），会抛出带原因的异常并结束链；Factory HTTP 拒绝则与其他提供方一样进入后续候选。
- 已有凭据的模型发生 HTTP 失败时，会进入图像链中的后续候选。如果每个候选都失败或被跳过，工具会抛出 `AggregateError`，列出尝试过的模型，并包含收集的提供方 HTTP 错误。
- 取消、三分钟超时、格式错误的提供方响应及本地 I/O 错误会直接抛出。

## 说明 \{#notes}

- 此工具是自定义工具，而非内置的 `AgentTool` 类，因此即使面向模型的提示词位于 `src/prompts/tools/image-gen.md`，其根文档仍位于此处。
- 多张输入图像应在 `subject` 中命名为 `Image 1`、`Image 2` 等，使提供方收到明确无歧义的编辑说明。
