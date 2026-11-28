---
title: "tts"
description: "Oh My Pi 官方仓库文档：tts。"
---

# tts \{#tts}

> 使用语音模型角色从文本生成语音音频文件，并写入 `output_path`。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/tts.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/tts.md`
- 语音角色选择：`packages/coding-agent/src/config/model-resolver.ts`，角色默认链位于 `packages/catalog/src/compat/rules/runtime/behavior.kdl`（`roleDefaultModels()`）
- 云端传输：`packages/ai/src/speech/`
- 本地音色目录：`packages/coding-agent/src/tts/models.ts`
- 本地工作进程客户端：`packages/coding-agent/src/tts/tts-client.ts`
- 会话注入：`packages/coding-agent/src/sdk.ts`（`speechgen.enabled`）

当 `speechgen.enabled=true`（默认 `false`）时，SDK 会注册这个需要写入批准的自定义工具，除非工具注册受到限制或已注册同名工具。实时设置变更会添加或移除 SDK 所有的条目。此工具的 `strict=false`。

## 输入 \{#inputs}

| 字段 | 类型 | 是否必填 | 描述 |
| --- | --- | ---: | --- |
| `text` | `string` | 是 | 要合成的文本。须为 `1..15000` 个 JavaScript 字符串字符。 |
| `voice_id` | `string` | 否 | 云端音色 ID。省略时使用模型配置的 `voice`，否则使用 xAI 的 `eve`；兼容 OpenAI 的语音在两者均没有时不发送音色。本地合成改用 `tts.localVoice`。 |
| `language` | `string` | 否 | xAI 的语音语言；省略时发送 `auto`（自动检测）。本地及兼容 OpenAI 的语音忽略此项。 |
| `output_path` | `string` | 是 | 相对于会话 cwd 解析的目标路径。不区分大小写的 `.wav` 请求 WAV；其他所有后缀请求 MP3。 |
| `sample_rate` | `number.integer` | 否 | xAI 采样率覆盖。本地及兼容 OpenAI 的语音忽略此项。 |
| `bit_rate` | `number.integer` | 否 | xAI MP3 比特率覆盖。WAV、本地及兼容 OpenAI 的语音忽略此项。 |

## 输出 \{#outputs}

- 成功时返回一个文本块和 `details = { bytes, voiceId, codec, backend }`。
   - 云端：`Saved <bytes> bytes to <path> (model=<provider>/<model>, voice=<voice>, codec=<codec>).`
   - 本地：指明实际 WAV 路径、`<model>/<voice>`、采样率和任何容器替换。
   - `backend` 为 `"local-inference"`、`"xai-tts"` 或 `"openai-speech"`。
- 没有匹配的语音模型、缺失密钥/HTTP 失败耗尽所有候选，或本地工作进程响应为 `null` 时，返回 `isError: true`，包含一个文本块且没有 `details`。
- 其他异常、调用方取消和传输超时向外传播。

## 流程 \{#flow}

1. 解析 cwd、目标路径和请求的编解码器。
2. 构建可用的 `tts` 类型模型池，并解析 `modelRoles.speech` 和 `retry.fallbackChains.speech`。没有显式配置时，优先级列表为 `local/phonon-31m`、`xai/grok-tts`、`xai-oauth/grok-tts`。
3. 对于 MP3，仅重新排列非显式候选，使云端模型优先于本地模型。显式的主模型/回退槽位保留原位置。WAV 保持解析所得的链顺序。
4. 依次尝试候选：
   - `local-inference` 使用选定的模型 ID、`tts.localVoice` 和 `tts.localSpeed` 调用本地工作进程，编码为 PCM16 WAV 并写入。忽略单次调用的音色、语言、采样率和比特率。
   - `xai-tts` 通过模型注册表凭据解析器调用选定模型的 `<baseUrl>/tts`。它发送文本、音色和 `language`（调用方未提供时为 `auto`），仅在 WAV 或非默认采样率/MP3 比特率需要时才发送显式 `output_format`。
   - `openai-speech` 以 `{ model, input, response_format, voice? }` 调用选定模型的 `<baseUrl>/audio/speech`；音色为 `voice_id`，否则为模型配置的 `voice`，再否则省略。这包括 DeepInfra 等兼容提供方，而不只是 OpenAI。
   - 如果云端模型的 `speechFormats` 缺少所请求的编解码器，则请求另一种（MP3 ↔ WAV），结果写入带该扩展名的同级路径；两种均不返回的模型会记录为失败并跳过。
5. 缺失 API 密钥和提供方 HTTP 错误会推进到下一个候选。本地 `null` 响应会立即返回其错误；其他失败不会触发回退。

## 模式 / 变体 \{#modes--variants}

- 本地：Phonon 31M 设备端推理（原生 omp-natives 运行时，仅支持英语，24 kHz）；始终为 WAV/PCM16。本地推理运行前可能需要下载模型权重（约 68 MB）。
- xAI：Grok Voice 云端合成；MP3 或 WAV。
- 兼容 OpenAI 的语音：选定的云端模型和端点；MP3 或 WAV。
- 旧版 `providers.tts` 值（`local`、`xai`、`deepinfra`）在加载设置时迁移为语音角色选择器。`providers.tts` 和 `tts.localModel` 被移除；本地模型选择现在来自语音角色。

## 副作用 \{#side-effects}

- 文件系统：写入目标路径；对于非 WAV 目标，若链推进到本地（或仅支持 WAV 的云端模型），则写入同级 `.wav`；若仅支持 MP3 的云端模型处理 `.wav` 目标，则写入同级 `.mp3`。
- 网络：云端合成调用选定端点；本地模型加载可能下载/缓存权重。
- 会话状态：读取 cwd、模型注册表、会话 ID、语音角色设置、`tts.localVoice` 和 `tts.localSpeed`。
- 取消：云端请求将调用方信号与 60 秒超时结合；本地合成接收调用方信号。
- 流式传输：一次性；没有 `onUpdate` 进度。

## 限制与上限 \{#limits--caps}

- 文本限制：每个后端均为 `1..15_000` 个 JavaScript 字符串字符。
- xAI 默认值：音色 `eve`、采样率 `24000`、MP3 比特率 `128000`。
- 内置 xAI 音色：`ara`、`eve`、`leo`、`rex`、`sal`；接受自定义音色 ID。
- 默认本地模型：`local/phonon-31m`（`gradium/phonon-31m-en`，固定修订版本，q8 GGUF 64.5 MB + 12 个音色嵌入）。
- 默认本地音色：`harper`；设置目录还包括 `hadley`、`delia`、`everly`、`easton`、`preston`、`miles`、`trevor`、`maeve`、`bryony`、`edwin` 和 `hugh`。语速（`tts.localSpeed`）被限制在 `0.8`-`1.3`。

## 错误 \{#errors}

- 候选链为空：`No available speech model matches the speech role.`
- 所有可重试候选均失败：`Speech synthesis failed for every candidate: <provider/model>: <error>; ...`。
- 云端 HTTP 错误包含状态，以及提供方详情的前最多 300 个字符。
- 本地工作进程的 `null` 响应会报告模型 ID 和可能的工作进程/模型下载问题。
- 调用方取消、云端超时、文件系统写入错误、不支持的语音 API 和本地工作进程抛出的失败都会向外传播，而不会转化为回退结果。

## 说明 \{#notes}

- 未内置本地 MP3 编码器。本地对 `speech.mp3` 的请求会写入 `speech.wav` 并报告替换情况。
- 没有单次调用模型选择器。请配置语音角色和回退链；本地音色选择仍是一项设置。
- 除非开启 `speech.cloud`，否则 `speech.enabled`（语音播报器）始终使用本地 Phonon。开启后，角色链中排在首位、显式配置的云端模型会将每个片段生成为 WAV（跳过 `speechFormats` 缺少 `wav` 的模型）。失败的模型会在本次话语剩余部分中被弃用；如果失败原因是缺失密钥、除 408/425/429 之外的 4xx，或音频无法解码为 WAV，则会跳过该模型五分钟。云端片段使用模型配置的 `voice` 和提供方默认速率；`speech.voice` 和 `speech.speed` 仅适用于本地合成。采样率不同的回退模型音频会被重采样到该话语的首个采样率；链中每个模型都失败时会记录警告。
