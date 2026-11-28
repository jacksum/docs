---
title: "Gemma 4 工具调用格式（token 分隔的 call:NAME{…}）"
description: "Oh My Pi 官方仓库文档：Gemma 4 工具调用格式（token 分隔的 call:NAME{…}）。"
---

# Gemma 4 工具调用格式（token 分隔的 `call:NAME{…}`） \{#gemma-4-tool-calling-format-token-delimited-callname}

Google **Gemma 4** 开放权重系列（`google/gemma-4-*-it`）的工具调用约定。它不同于 Gemma 3 和格式错误的托管 Gemini 输出所用的提示词驱动 Python 风格 `tool_code` 约定（见 [gemini.md](./gemini.md)）：调用使用 **token 分隔的花括号语法**，字符串使用 `<|"|>` 而不是 ASCII 引号。模型输出 `<|tool_call>call:NAME{key:value,…}<tool_call|>`；应用解析它、运行工具，并附加 `<|tool_response>response:NAME{output:…}<tool_response|>`。托管 Gemini 的原生结构化 API 独立于这两种文本方言。

OMP 的 `gemma` 方言实现在 `packages/ai/src/dialect/gemma.ts` 中：`GemmaInbandScanner` 解析这些块，`renderAssistantToolCalls`、`renderToolResults` 和 `renderTranscript` 生成它们。OMP 匹配解码后的标记字符串，而不是分词器 ID。

## 特殊 token \{#special-tokens}

Gemma 4 用成对 token 包装每个结构元素。注意**竖线位置不对称**，开始符的竖线在左边（`<|x>`），结束符的竖线在右边（`<x|>`）：

| 开始 | 结束 | 用途 |
| --- | --- | --- |
| `<bos>` | 无 | 序列开始 |
| `<\|turn>` | `<turn\|>` | 一个对话轮次；角色名称是主体的第一行 |
| `<\|tool_call>` | `<tool_call\|>` | 模型输出的一次工具**调用** |
| `<\|tool_response>` | `<tool_response\|>` | 传回模型的一个工具**结果** |
| `<\|channel>` | `<channel\|>` | 推理通道；`<\|channel>thought` 在可见回复之前开启模型的思维链（由 `<channel\|>` 结束） |
| `<\|"\|>` | `<\|"\|>` | 字符串字面量分隔符（两端使用相同 token） |
| `<eos>` | 无 | 序列结束 |

由于字符串分隔符是一个 token（`<|"|>`），值可以包含未经转义的原始 ASCII 引号和逗号，只有字面 `<|"|>` token 序列不能出现在字符串内部。

思考变体在专用通道中输出推理，即在模型轮次开头、任何回复文本或工具调用之前的 `<|channel>thought\n…<channel|>`。`gemma` 扫描器将该通道路由到思考事件（不放入可见回复中），同时仍解析其后的工具调用；`renderThinking` 将思考往返转换回相同的 `<|channel>thought\n…<channel|>` 块。设置 `parseThinking: false` 时，该通道会留在可见文本中。

## 角色 / 轮次结构 \{#roles--turn-structure}

每个轮次为 `<|turn>{role}\n{body}<turn|>`，轮次之间无分隔符地拼接。`renderTranscript` 使用 `system`、`user` 和 `model`（`developer` 渲染为 `system`），以 `<bos>` 开始非空历史，且不附加生成提示词。它将助手轮次与紧随其后的工具结果合并为一个 `model` 轮次；一组独立的连续结果也渲染为一个 `model` 轮次。

## 工具定义 \{#tool-definitions}

自有 `gemma` 提示词**确实**携带每个工具的规范化传输模式。`renderInbandToolPrompt` 在 `<tools></tools>` 内每行序列化一个紧凑 OpenAI 风格对象，后接 Gemma 格式指南：

```text
<tools>
{"type":"function","function":{"name":"get_current_temperature","description":"Gets the current temperature for a given location.","parameters":{"type":"object","properties":{"location":{"type":"string","description":"The city name, e.g. San Francisco"}},"required":["location"]}}}
</tools>
```

`renderToolInventory` 是系统提示词和 `/dump` 使用的独立详细清单。它输出一个 `## functions` TypeScript `namespace functions { … }` 块。工具描述是 `type NAME = (_: PARAMS);` 声明上方的 `//` 注释；配置的示例以 JSDoc 风格的 `// @example` 条目出现，其中调用使用 Python 关键字参数语法。它不输出逐工具 Markdown 章节，也不输出原生 Gemma `<|tool_call>` 示例。

## 工具调用格式 \{#tool-call-format}

模型在每个 `<|tool_call>…<tool_call|>` 块中输出一个调用。主体为 `call:NAME{ARGS}`，其中 `ARGS` 是逗号分隔的 `key:value` 对列表：

```text
<|tool_call>call:get_current_temperature{location:<|"|>London<|"|>}<tool_call|>
```

`{…}` 内的值语法：

| 值类型 | 编码 | 示例 |
| --- | --- | --- |
| 字符串 | `<\|"\|>text<\|"\|>` | `location:<\|"\|>London<\|"\|>` |
| 整数 / 浮点数 | 裸值 | `count:42` |
| 布尔值 | 裸值 | `flag:true` |
| 空值 | 裸值 | `unit:null` |
| 列表 | `[v,v,…]` | `tags:[<\|"\|>a<\|"\|>,<\|"\|>b<\|"\|>]` |
| 嵌套对象 | `{k:v,…}` | `config:{theme:<\|"\|>dark<\|"\|>}` |

OMP 解析器是流式的 `GemmaInbandScanner`（`packages/ai/src/dialect/gemma.ts`），不是简单正则表达式。对于每个 `<|tool_call>` 块，它会：

1. 查找匹配的 `<tool_call|>` 结束符，跳过所有 `<|"|>…<|"|>` 字符串区段，以免字符串值中出现的 `<tool_call|>` 序列提前结束该块；
2. 匹配 `call:NAME{` 头部，然后取出截至深度匹配的 `}` 的花括号主体；
3. 在顶层逗号处将该主体拆分为 `key:value` 对，跳过括号深度（`[]`、`{}`）和 `<|"|>` 字符串区段，并按上述语法解码每个值，因此嵌套列表和对象可以正确解析（单层正则表达式做不到）。
   只有完整结束标记到达后才输出调用；没有部分参数事件。如果流在工具块未终止时刷新，OMP 会丢弃这个不完整的块。语法上已闭合但缺少最后一个参数花括号的块，仍会根据可用主体进行解析。

调用名称和对象键必须匹配 `[A-Za-z_]\w*`；键无效或没有顶层冒号的片段会被跳过。此限制也适用于嵌套对象键。一旦存在工具结束标记，解析器允许缺失列表/对象结束分隔符；格式错误的头部会被消费，但不产生调用。

## 多个 / 并行工具调用 \{#multiple--parallel-tool-calls}

并行调用是连续的 `<|tool_call>…<tool_call|>` 块（每块一个调用），按顺序返回。应用按相同顺序为每个调用返回一个 `<|tool_response>`。

## 工具结果格式 \{#tool-result-format}

每个结果为 `<|tool_response>response:NAME{output:VALUE}<tool_response|>`。`renderToolResults` 始终将结果包装在单个 `output` 键下，并先对工具文本执行 `JSON.parse`，因此 JSON 输出在花括号语法中变为嵌套对象/数组，而普通字符串由 `<|"|>…<|"|>` 包装：

```text
<|tool_response>response:get_current_weather{output:{temperature:15,weather:<|"|>sunny<|"|>}}<tool_response|>
<|tool_response>response:read{output:<|"|>FILE<|"|>}<tool_response|>
```

Gemma 传输形式没有专用的成功/错误字段。OMP 将 `isError` 结果渲染为与成功结果相同的 `response:NAME{output:…}` 结构，因此任何失败指示都必须存在于结果文本本身中。

## 端到端示例 \{#end-to-end-example}

带开发者指令（渲染为 `system`）的天气查询的 `renderTranscript` 输出。调用与其后结果合并为一个 `model` 轮次，最终答案是下一个 `model` 轮次。轮次直接相邻，没有分隔符。这个底层渲染器自身不注入目录；自有请求会将其单独附加到模型提供方的系统提示词：

```text
<bos><|turn>system
You are a helpful assistant.<turn|><|turn>user
Hey, what's the weather in Tokyo right now?<turn|><|turn>model
<|tool_call>call:get_current_weather{location:<|"|>Tokyo, JP<|"|>}<tool_call|><|tool_response>response:get_current_weather{output:{temperature:15,weather:<|"|>sunny<|"|>}}<tool_response|><turn|><|turn>model
The current weather in Tokyo is 15 degrees Celsius and sunny.<turn|>
```

## 解析说明与陷阱 \{#parsing-notes--gotchas}

- **字符串分隔符是 token，不是引号。** 在 `<|"|>…<|"|>` 内，字节 `"` 和 `,` 是字面数据，示例 `<|"|>The city and state, e.g. "San Francisco, CA"…<|"|>` 同时包含两者。只有在 `<|"|>…<|"|>` 区段**之外**才按 `,`/`}` 拆分参数。
- **不对称竖线。** 结束符是 `<tool_call|>`，不是 `</tool_call>` 或 `<|tool_call>`。匹配错误一侧的竖线将永远无法闭合该块。
- **每块一个调用。** 与 JSON `tool_calls[]` 数组不同，并行是“更多块”，而不是“同一块内更多条目”。
- **裸标量。** 未由 `<|"|>` 包装的值按如下方式处理：`true`/`false` → 布尔值，`null`/`none`/`None` → 空值，数值 → 数字，否则为裸字符串（例如不带引号的枚举或 `STRING` 这样的类型名称）。
- **工具调用 id 是合成的。** 该格式不携带 id；收到完整闭合块后，OMP 解析它，并以新生成的 id 输出相邻的 `toolStart`/`toolEnd` 事件。渲染后的响应通过外围消息顺序/名称关联。
- **不是 Gemini 方言。** Gemma 3 的 Python 风格提示使用 [gemini.md](./gemini.md) 中的约定；托管 Gemini 原生工具调用使用结构化 API 部分。两者都不是这种 token 语法。
- **Gemma 3 自动选择注意事项。** OMP 当前的系列关联将 Gemma 3 和 Gemma 4 模型 ID 映射到 `gemma`。如果 Gemma 3 模型被标记为 `supportsTools: false`，`tools.format=auto` 因此会选择这种 Gemma 4 语法，尽管 Gemma 3 要求 `gemini.md` 中的 Python 风格约定；请显式设置 `tools.format=gemini`。

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

将 `tools.format` 设为 `gemma` 可强制使用此方言。默认的 `auto` 保留原生工具，除非 `supportsTools === false`，此时使用模型类别关联。只有配置的方言解析器没有返回自有方言时，才会查询 `PI_DIALECT=gemma`。

有工具时，自有模式附加紧凑目录和格式指南，省略原生工具/`tool_choice`，并使用 `encodeInbandToolHistory`，而不是 `renderTranscript`。带调用的助手轮次变为普通文本加调用块，不带其思考/图片块；不带调用的助手轮次保持不变。连续结果变为包含响应块的合成**用户**消息，结果图片单独保留。在这条模型提供方请求路径中，它们不会合并到模型轮次中。

自有流启用思考解析，并从伪造的 `<|tool_response>` 起丢弃输出。`tools.abortOnFabricatedResult` 默认为 `true`，会在该边界中止模型提供方；禁用它只改变是否读完被丢弃的后续内容。如果模型提供方仍输出具名原生调用，则转发它们；最先产生调用的原生/带内通道生效。

## 来源 \{#sources}

- OMP `gemma` 方言：`packages/ai/src/dialect/gemma.ts`（扫描器/渲染器）、`catalog.ts` + `prompt-template.md`（工具目录）、`gemma.md`（格式指南）、`history.ts`（模型提供方历史）、`owned-stream.ts`（投影）；选择：`packages/catalog/src/identity/dialect.ts`、`packages/coding-agent/src/sdk.ts`（`resolveDialect`）、`packages/agent/src/agent-loop.ts`（`resolveOwnedDialectFromEnv`）。
- 使用 Gemma 4 进行函数调用：https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4
- Gemma 4 提示词格式：https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4
