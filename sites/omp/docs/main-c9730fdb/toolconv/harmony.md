---
title: "OpenAI Harmony 响应格式"
description: "Oh My Pi 官方仓库文档：OpenAI Harmony 响应格式。"
---

# OpenAI Harmony 响应格式 \{#openai-harmony-response-format}

Harmony 是 OpenAI 训练其开放权重 `gpt-oss` 模型时采用的响应格式（`gpt-oss-20b`、`gpt-oss-120b`，于 2025 年 8 月发布）。它定义了对话封装、多通道推理/答案分离，以及函数调用传输语法。不采用此格式构造提示词，模型将无法正常工作。这种格式有意对应 OpenAI 的 _Responses_ API（角色、通道、接收方），而不是较早的 Chat Completions 结构。

Token 使用 `o200k_harmony` 编码生成（`o200k_base` BPE 词表加上一组 Harmony 特殊 token；见下表）。参考渲染器/解析器是 Rust crate `openai-harmony`（Python 绑定：`pip install openai-harmony`；编码名称 `HarmonyEncodingName.HARMONY_GPT_OSS`）。

只有在构建自己的推理循环时，才会直接处理原始 Harmony。通过 OpenAI 兼容端点提供服务时，服务器会代为处理：

- **Ollama / LM Studio / HuggingFace**：内部应用 Harmony；发送普通 OpenAI 风格 JSON 即可。
- **vLLM**：`vllm serve openai/gpt-oss-120b --enable-auto-tool-choice --tool-call-parser openai --reasoning-parser openai_gptoss`。注意工具调用解析器标志为 `openai`（不是 `harmony`）。vLLM 还通过 `/v1/responses` 端点提供 Harmony 原生路径。
- **SGLang**：`python3 -m sglang.launch_server --model-path openai/gpt-oss-20b --reasoning-parser gpt-oss --tool-call-parser gpt-oss`（在 NVIDIA Dynamo 分离模式中：`--dyn-tool-call-parser harmony --dyn-reasoning-parser gpt_oss`）。

gpt-oss 权重随附的聊天模板根据标准 `messages`/`tools` 数组渲染这些相同的 token 序列。

OMP 的自有 `harmony` 方言是一个独立的解码文本转换器，实现在 `packages/ai/src/dialect/harmony.ts` 中；它不使用 `openai-harmony` 或分词器 ID。其宽容扫描器、会话记录渲染和模型提供方历史编码在下文 OMP 章节中说明。不应假定原生服务器/模板行为也适用于这条路径。

## 特殊 token \{#special-tokens}

所有 Harmony 控制 token 都采用字面形式 `<|type|>`（ASCII 竖线 `|`，U+007C，没有 Unicode 变体）。它们是 `o200k_harmony` 中真正的单个 token，不是经 BPE 拆分的文本。具有结构意义的 token 如下：

| Token（原样） | Token ID | 用途 |
| :--- | :--- | :--- |
| `<\|start\|>` | `200006` | 开始一条消息；紧接头部（角色、可选接收方/通道/内容类型）。 |
| `<\|end\|>` | `200007` | 结束一条完整消息。 |
| `<\|message\|>` | `200008` | 头部 → 内容的转换点。其后的全部内容（直到停止/结束 token）都是消息主体。 |
| `<\|channel\|>` | `200005` | 引入头部的通道字段（`analysis` / `commentary` / `final`）。 |
| `<\|constrain\|>` | `200003` | 标记工具调用头部中的内容类型 / 受约束解码格式（例如 `<\|constrain\|>json`）。 |
| `<\|return\|>` | `200002` | 停止 token：模型已完成最终答案。仅用于解码时（见规范化说明）。 |
| `<\|call\|>` | `200012` | 停止 token：模型正在输出工具调用，并希望执行它。 |

`<|return|>` 和 `<|call|>` 是两个有效的生成停止 token，遇到任一个都应停止推理。

编码还定义了（同属 `o200k_harmony` 块，ID 为 `199998`-`200013`）`<|startoftext|>`（199998）、`<|endoftext|>`（199999）和保留位置 `<|reserved_200000|>`、`<|reserved_200001|>`、`<|reserved_200004|>`、`<|reserved_200009|>`-`<|reserved_200011|>`、`<|reserved_200013|>`，以及大段保留范围 `<|reserved_200014|>`…`<|reserved_201088|>`。渲染器还知道 `<|refusal|>`、`<|untrusted|>`、`<|end_untrusted|>`、`<|meta_end|>` 这些名称，但它们不属于已提交的 gpt-oss 词表，不会出现在正常传输中。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

**消息封装。** 每条消息均为：

```text
<|start|>{header}<|message|>{content}<|end|>
```

`{header}` 始终以角色开头，可携带可选接收方（`to=...`）、通道和内容类型。已完成的消息以 `<|end|>` 结束；正在生成的助手消息则以停止 token（`<|return|>` 或 `<|call|>`）结束。

**角色**（五种）。用于解决冲突的指令层级为 `system` > `developer` > `user` > `assistant` > `tool`。

| 角色 | 用途 |
| :--- | :--- |
| `system` | 身份、知识截止日期 / 当前日期、推理强度、有效通道声明、内置工具。不是面向用户的“系统提示词”。 |
| `developer` | 通常所说的“系统提示词”：指令 + `# Tools` 函数声明 +（可选）结构化输出模式。 |
| `user` | 最终用户输入。 |
| `assistant` | 模型输出。携带通道，工具调用时还携带接收方。 |
| `tool` | 已执行工具的输出。消息的_作者/角色是工具自身的名称_（例如 `functions.get_current_weather`），而不是字面单词 `tool`。 |

**通道**（仅助手输出；每条助手消息都要求有通道）：

| 通道 | 用途 |
| :--- | :--- |
| `analysis` | 原始思维链（推理）。不受与 `final` 相同的安全标准约束；不要向最终用户展示。内置 `python`/`browser` 调用通常位于此处。 |
| `commentary` | 函数工具调用，以及调用多个工具之前用户可见的“前言”（行动计划）。 |
| `final` | 面向用户的答案。 |

**推理强度**在系统消息中设为 `Reasoning: high`（或 `medium` / `low`；默认为 medium）。模型向 `analysis` 输出思维链，向 `final` 输出答案。

**思维链沿用规则。** 在下一轮中，_如果_最后一个助手轮次以 `final` 消息结束，则丢弃先前的 `analysis` 消息。例外是进行中的工具调用轮次：工具调用之前的 `analysis` 必须与工具结果一起传回，让模型可以继续推理（`openai-harmony` 渲染器通过 `RenderConversationConfig { auto_drop_analysis: true }` 实现）。

## 工具定义 \{#tool-definitions}

函数工具在 **developer** 消息的 `# Tools` 章节下、TypeScript 风格的 `namespace functions { ... }` 内声明。（内置 `browser`/`python` 工具则在 **system** 消息中各自的 `# Tools` / `## browser` / `## python` 标题下声明。）渲染器按以下规则将每个 JSON Schema 转换为 TS 类型：

- 无参数函数 → `type name = () => any;`
- 有参数 → 唯一的参数名为 `_`，其对象类型内联：`type name = (_: { ... }) => any;`
- 返回类型始终为 `any`。
- 属性 `description` 变为字段_上方_一行的 `//` 注释；JSON Schema 的 `title` 渲染为 `// TITLE`，后接一行 `//` 空注释；`examples` 渲染为 `// Examples:`，后接若干 `// - "value"` 行。
- 可选（非 `required`）字段末尾添加 `?`。`default` 渲染为尾部 `// default: <value>` 注释；`enum` 变为 `"a" | "b"` 联合；`oneOf` 变为多行 `|` 联合；JSON `integer` 映射为 TS `number`。
- 函数定义之间用一个空行分隔；块以 `} // namespace functions` 结束。

如果 developer 消息没有指令文本，则省略 `# Instructions` 标题，消息只有 `# Tools` 块。定义了任意函数时，系统消息会增加路由行 `Calls to these tools must go to the commentary channel: 'functions'.`。

原样的 developer 消息示例（指令 + 两个函数），与渲染器输出完全一致：

```text
<|start|>developer<|message|># Instructions

Use a friendly tone.

# Tools

## functions

namespace functions {

// Gets the location of the user.
type get_location = () => any;

// Gets the current weather in the provided location.
type get_current_weather = (_: {
// The city and state, e.g. San Francisco, CA
location: string,
format?: "celsius" | "fahrenheit", // default: celsius
}) => any;

// Gets the current weather in the provided list of locations.
type get_multiple_weathers = (_: {
// List of city and state, e.g. ["San Francisco, CA", "New York, NY"]
locations: string[],
format?: "celsius" | "fahrenheit", // default: celsius
}) => any;

} // namespace functions<|end|>
```

## 工具调用格式 \{#tool-call-format}

函数调用是 **commentary** 通道上的一条 **assistant** 消息，通过接收方 `to=functions.<name>` 发送给工具，主体为 JSON 参数，以 `<|call|>` 停止 token 终止。

接收方可以出现在头部的_角色部分_或_通道部分_，两者都是有效 Harmony，解析器都接受。模型通常将其输出在通道部分。pi 渲染器省略可选的内容类型标记：

```text
<|start|>assistant<|channel|>commentary to=functions.get_current_weather<|message|>{"location":"San Francisco, CA"}<|call|>
```

某些 Harmony 序列化器包含显式 JSON 内容类型，并将接收方改放在角色部分：

```text
<|start|>assistant to=functions.get_current_weather<|channel|>commentary <|constrain|>json<|message|>{"location":"San Francisco, CA"}<|call|>
```

参数主体是原始 JSON 对象。可选的 `<|constrain|>json` 内容类型表示 JSON（也是受约束/基于语法解码的接入点）；内容类型也可以是 `code` 这样的裸词（见于内置工具）。内置工具只在通道和接收方上有所不同：它们通常渲染在 `analysis` 上，接收方为 `browser.search` / `browser.open` / `browser.find`，或者始终为 `python`。

### OMP `harmony` 方言行为 \{#omp-harmony-dialect-behavior}

OMP 输出上面的第一种形式：没有 `<|constrain|>` 标记，接收方位于通道部分，参数为紧凑 JSON。由于 Harmony 不携带调用 id，它在接收时合成一个。有状态扫描器接受接收方位于头部任一部分，从对外提供的工具名称中移除开头的 `functions.`，并将除 `assistant` 以外的任何非空接收方视为工具调用（包括 `browser.search` 这样的内置工具）。

OMP 的 `HarmonyInbandScanner`（`packages/ai/src/dialect/harmony.ts`）累积参数，并使用 JSON 修复进行解析。空、非对象或仍无法解析的参数会变为 `{}`。带接收方的头部到达 `<|message|>` 时，它输出 `toolStart`，不输出参数增量。`<|call|>`、`<|end|>` 和 `<|return|>` 结束主体；新的 `<|start|>` 或 `<|channel|>` 也会在开始另一个头部之前隐式结束主体。`analysis` 块作为思考增量流式输出，其他助手主体作为可见文本流式输出。非助手封装会被跳过。补全文本可以仅以 `<|channel|>` 开始；省略角色时视为助手，扫描器也不要求通道。其工厂忽略 `parseThinking`，因此 `analysis` 始终被解析为思考。

EOF 恢复取决于缓冲字节。如果 `flush()` 仍有主体字节，则结束主体，并在没有终止符的情况下输出 `toolEnd`。如果最后一次 feed 已经清空缓冲区，`flush()` 不输出任何内容，只留下 `toolStart`；由于没有发布参数增量，规范调用保留 `{}`。正常停止时，自有投影器可以保留并分派该调用。这些是宽松的恢复路径，不是有效的 Harmony 终止符规则。

## 多个 / 并行工具调用 \{#multiple--parallel-tool-calls}

Harmony 没有专门的“并行”封装。多个调用只是多条连续消息。模型可能先输出一段可选**前言**，即 `commentary` 通道上_用户可见_的助手消息（与 `analysis` 不同，这是供用户查看的），然后每个函数输出一条工具调用消息。每个独立调用仍以自己的 `<|call|>` 停止 token 结束，因此在 `<|call|>` 处停止的宿主会逐个收集调用、执行、传回结果，然后恢复：

```text
<|channel|>analysis<|message|>{reasoning}<|end|><|start|>assistant<|channel|>commentary<|message|>**Action plan**:
1. Generate an HTML file
2. Generate a JavaScript for the Node.js server
3. Start the server
---
Will start executing the plan step by step<|end|><|start|>assistant<|channel|>commentary to=functions.generate_file<|message|>{"template": "basic_html", "path": "index.html"}<|call|>
```

## 工具结果格式 \{#tool-result-format}

已执行工具的输出以消息形式传回，其**作者/角色为工具名称**，发回助手（`to=assistant`），位于 **commentary** 通道，以 `<|end|>` 结束。这是规范（推荐）形式：

```text
<|start|>functions.get_current_weather to=assistant<|channel|>commentary<|message|>{"sunny": true, "temperature": 20}<|end|>
```

头部顺序为 `{toolname} to=assistant<|channel|>commentary`。内置工具结果遵循相同结构（例如 `<|start|>browser.search to=assistant<|channel|>commentary<|message|>{"result": "https://openai.com/"}<|end|>`）。消息未设置通道/接收方时，渲染器接受的最小形式只是 `<|start|>{toolname}<|message|>{output}<|end|>`，但输出完整的 `to=assistant<|channel|>commentary` 头部才是参考解析器往返转换的形式，也是推荐形式。附加结果后，通过输出下一个 `<|start|>assistant` 重新开始生成。

OMP 渲染上面展示的完整结果头部，并原样传递 `result.text`。其 `harmonyRecipient` 辅助函数会为每个缺少 `functions.` 的名称（包括传入的 `browser.search` 名称）添加 `functions.` 前缀；不会对内置接收方做特殊处理。Harmony 没有专用错误位，因此 `isError` 不单独表示。

## 端到端示例 \{#end-to-end-example}

完整的多轮天气交互：system + developer 提示词 → 用户问题 → 助手 analysis 思维链 → 助手 commentary 工具调用 → 工具结果 → 助手 final 答案。这是单个连续的 token 流（为便于阅读，头部中的换行只位于顶层消息之间；实际中消息无分隔符地拼接）。

```text
<|start|>system<|message|>You are ChatGPT, a large language model trained by OpenAI.
Knowledge cutoff: 2024-06
Current date: 2025-06-28

Reasoning: high

# Valid channels: analysis, commentary, final. Channel must be included for every message.
Calls to these tools must go to the commentary channel: 'functions'.<|end|><|start|>developer<|message|># Instructions

Use a friendly tone.

# Tools

## functions

namespace functions {

// Gets the current weather in the provided location.
type get_current_weather = (_: {
// The city and state, e.g. San Francisco, CA
location: string,
format?: "celsius" | "fahrenheit", // default: celsius
}) => any;

} // namespace functions<|end|><|start|>user<|message|>What is the weather like in SF?<|end|><|start|>assistant<|channel|>analysis<|message|>User wants the weather in San Francisco. Use get_current_weather.<|end|><|start|>assistant<|channel|>commentary to=functions.get_current_weather<|message|>{"location":"San Francisco, CA"}<|call|><|start|>functions.get_current_weather to=assistant<|channel|>commentary<|message|>{"sunny": true, "temperature": 20}<|end|><|start|>assistant<|channel|>final<|message|>It's sunny and about 20°C in San Francisco right now.<|return|>
```

轮次边界：

- 宿主在 `<|call|>` 处停止生成，解析 `commentary` 调用，运行 `get_current_weather`，并附加 `functions.get_current_weather to=assistant` 结果消息。
- 然后附加 `<|start|>assistant` 并恢复。先前的 `analysis` 消息得以保留（轮次以工具调用结束，而不是 `final`），让模型可以继续推理。
- 生成在 `<|return|>` 处停止。将此轮次持久化到历史供_后续_轮次使用时，将尾部 `<|return|>` 规范化为 `<|end|>`（见下一条说明）。

**`<|return|>` 规范化。** `<|return|>` 只是解码时的停止 token。将助手回复存入历史供下一轮使用时，把尾部 `<|return|>` 替换为 `<|end|>`，让每条存储的消息都是格式完整的 `<|start|>{header}<|message|>{content}<|end|>`。（对于监督训练目标，以 `<|return|>` 结束示例是正确的。）

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

服务器（vLLM/SGLang/Ollama）将 Harmony 桥接到 Chat Completions JSON 时：

- **`finish_reason`**：生成在 `<|call|>` 处停止时为 `tool_calls`；在 `<|return|>` 处停止时为 `stop`。
- **`message.tool_calls[]`**：每个 `commentary` `to=functions.*` 调用对应一个条目。`function.name` 是去掉 `functions.` 命名空间的接收方（`get_current_weather`）。`function.arguments` 是 **JSON 字符串**（原样的 `<|message|>` 主体），与 OpenAI 语义一致，不是已解析的对象。
- **`tool_call_id`**：Harmony 没有原生调用 ID。服务器合成一个（例如 `call_abc123`），并负责将后续 `role:"tool"` 消息关联回 Harmony 工具结果封装（接收方 `to=functions.<name>` / 调用顺序）。
- **工具结果消息**（`{"role":"tool","tool_call_id":...,"content":...}`）渲染为 `<|start|>{toolname} to=assistant<|channel|>commentary<|message|>{content}<|end|>`。服务器将 `tool_call_id` → 原始函数名称映射，以构建 `{toolname}` 作者。
- **推理**：`analysis` 通道文本以 `reasoning_content`（vLLM/SGLang）或 `reasoning`/`thinking` 字段提供，通常不会在后续请求中回传。`final` 通道文本是普通的 `message.content`。`commentary` 前言若被提供，也会映射为助手内容。
- **OMP 会话记录渲染：**`renderTranscript` 将 `developer`/`user` 直接映射为封装，依次输出助手思考（`analysis`）、可见文本（`final`），然后是调用（`commentary`）。空助手轮次变为空 `final` 消息。文本/analysis 历史消息以 `<|end|>` 结束，调用消息以 `<|call|>` 结束；连续工具结果变为连续的工具作者封装。它保留所有提供的思考，不附加生成提示词，与配置为丢弃已完成轮次 analysis 的参考渲染器不同。
- **OMP 自有请求历史：**`encodeInbandToolHistory` 是独立路径：带调用的助手轮次变为普通文本加调用封装，并丢失思考/图片块；不带调用的助手轮次保持不变。连续工具结果变为包含工具作者封装的合成**用户**消息，结果图片单独保留。
- **原生服务器/聊天模板编译：**在原生 vLLM/SGLang 路径中，请求的 `tools` / `tool_choice` 由服务器聊天模板编译为 developer 消息的 `namespace functions { ... }` 块；系统消息增加 commentary 路由行。
- **OMP 自有方言声明：**有工具时，自有模式省略原生工具/`tool_choice`，并将紧凑的 `<tools>` JSON 目录和 Harmony 指南附加到系统提示词，而不是规范的 developer 命名空间。将 `tools.format` 设为 `harmony` 可强制使用它。默认的 `auto` 只有在 `supportsTools === false` 时才选择自有方言；OpenAI 和 GPT-OSS 模型类别映射到 `harmony`。当配置的解析器没有返回自有方言时，`PI_DIALECT=harmony` 作为回退。
- **OMP 流边界：**伪造的 `<|start|>functions.` 结果封装会停止投影。`tools.abortOnFabricatedResult` 默认为 `true`；禁用它会读完输出，但仍丢弃后续内容。如果在自有模式下仍输出具名原生调用，则转发它们，最先出现的原生/带内调用通道生效。

## 解析说明与陷阱 \{#parsing-notes--gotchas}

- **两个停止 token。** 始终同时在 `<|return|>` 和 `<|call|>` 处停止。只在 `<|return|>` 处停止会越过工具调用；对于助手生成，只在 `<|end|>` 处停止是错误的。
- **接收方位置可变。** `to=functions.<name>` 可以位于角色部分（`<|start|>assistant to=...<|channel|>commentary`）或通道部分（`<|channel|>commentary to=...`）。解析器必须接受两者。
- **通道约定与宽容处理：**规范的助手消息包含通道。OMP 扫描器允许缺失通道，并默认将非 analysis 主体视为可见文本；这种宽容处理不是规范格式规则。
- **工具作者，不是 `tool`。** 工具结果消息的角色是工具_名称_（`functions.get_current_weather`），不是字面字符串 `tool`。将 `functions.x` 拆分为命名空间 + 函数是解析器的职责。
- **参考实现丢弃思维链是有条件的。** 参考渲染器可以丢弃已完成轮次的 `analysis`，同时保留进行中工具轮次的推理。OMP 会话记录渲染器不实现这条丢弃规则；其独立自有历史编码器会从带调用的助手轮次中移除思考。
- **`arguments` 是字符串。** 不要二次编码。`<|message|>` 之后的主体已经是序列化的 JSON；将其直接作为 `arguments` 字符串传递。
- **内容类型变体。** `<|constrain|>json` 是可选的。若存在，它是元数据，不保证 JSON 有效。通过受约束解码 / 自定义语法强制保证 JSON 有效，单靠提示词格式不保证遵循模式（结构化输出 `# Response Formats` 也有相同注意事项）。
- **流式传输。** 使用有状态解析器（库提供 `StreamableParser`），以便增量重建不完整的 UTF-8 以及头部/通道/接收方/内容类型字段；简单的子字符串扫描无法正确处理多字节拆分和可选头部字段。`parse_messages_from_completion_tokens` 接受 `strict=True|False`，`strict=False` 允许某些格式错误的头部。不要将尾部停止 token 传入解析器。
- **编码。** 使用 `o200k_harmony`（`o200k_base` 的秩加上上述 Harmony 特殊 token）。编码和解码时，都将 `<|...|>` token 视为原子特殊 token；将它们编码为普通文本会得到不同的秩，并破坏流。

## 来源 \{#sources}

- OMP 实现：`packages/ai/src/dialect/harmony.ts`、`rendering.ts`（`harmonyRecipient`）、`history.ts`、`owned-stream.ts`、`catalog.ts`；选择：`packages/catalog/src/identity/dialect.ts`、`packages/coding-agent/src/sdk.ts`（`resolveDialect`）、`packages/agent/src/agent-loop.ts`（`resolveOwnedDialectFromEnv`）。
- OpenAI Cookbook：OpenAI Harmony 响应格式：https://cookbook.openai.com/articles/openai-harmony
- openai/harmony 渲染器（README）：https://github.com/openai/harmony
- openai/harmony 规范格式指南：https://raw.githubusercontent.com/openai/harmony/main/docs/format.md
- openai/harmony 特殊 token 注册表（`o200k_harmony` ID）：https://raw.githubusercontent.com/openai/harmony/main/src/tiktoken_ext/public_encodings.rs
- openai/harmony 渲染器/解析器测试与模式→TS 逻辑：https://raw.githubusercontent.com/openai/harmony/main/src/tests.rs , https://raw.githubusercontent.com/openai/harmony/main/src/encoding.rs
- openai/harmony 测试样例（原样渲染的流）：`test-data/test_render_functions_with_parameters.txt`、`test-data/test_does_not_drop_if_ongoing_analysis.txt`、`test-data/test_tool_response_parsing.txt`、`test-data/test_streamable_parser.txt`、`test-data/test_browser_and_function_tool.txt`(https://github.com/openai/harmony/tree/main/test-data)
- vLLM 工具调用 / gpt-oss 解析器标志：https://docs.vllm.ai/en/latest/features/tool_calling/
- SGLang gpt-oss 用法（`--tool-call-parser gpt-oss`）：https://docs.sglang.io/basic_usage/gpt_oss.html
