---
title: "Hermes 工具调用格式"
description: "Oh My Pi 官方仓库文档：Hermes 工具调用格式。"
---

# Hermes 工具调用格式 \{#hermes-tool-calling-format}

这一工具调用约定起源于 NousResearch 的 **Hermes 2 Pro**（基于 Llama-3 的开放模型），由 **Hermes 3** 系列及大量社区微调模型延续使用。外层封装为 **ChatML**：每个轮次都是 `<|im_start|>{role}\n{body}<|im_end|>\n`。可用工具以 OpenAI 风格的 JSON 工具对象形式，在系统轮次的 `<tools>…</tools>` 块中公布；模型将每次调用输出为 `<tool_call>\n{json}\n</tool_call>` 块，其中 `arguments` 是**嵌套 JSON 对象**（不是字符串化的 JSON）；工具结果在**专用的 `<|im_start|>tool` 轮次**中回传，用 `<tool_response>…</tool_response>` 包裹一个 `{"name": …, "content": …}` 对象。结果携带函数名，因此能够自行说明调用了哪个函数，但仍依赖顺序绑定，因为线上格式没有唯一调用 ID。Qwen3 采用了这一约定，并作了两处调整（将结果以裸内容并入 `user` 轮次，去掉 `FunctionCall` 模式说明行），参见 [qwen3.md](./qwen3.md)。Hermes 3 在调用前增加了可选的 GOAP `<scratch_pad>` 推理框架；经典 Hermes 2 Pro 函数调用规范**没有**专用思考通道，不过 omp 扫描器也识别 R1 风格微调模型的 `<think>…</think>`（见 omp 一节）。

下面的经典格式示例来自 NousResearch 的 `Hermes-Function-Calling` README。OMP 当前的实现位于 `packages/ai/src/dialect/hermes.ts`；其自主管理模式下的提示词和提供方历史处理行为与经典模板不同，详见下文。

## 特殊 token \{#special-tokens}

只有 ChatML 标记是控制 token；工具和推理标记是轮次正文中的文本级字符串。Token **ID 因模型而异**（每个 Hermes 版本都有自己的分词器），因此这里有意不列出它们。

| 标记（原样） | 类型 | 用途 |
| --- | --- | --- |
| `<\|im_start\|>` | ChatML 控制 token | 开始一个轮次；后面紧接角色名 + `\n` |
| `<\|im_end\|>` | ChatML 控制 token | 结束一个轮次 |
| `<tool_call>` | 文本级标记 | 开始一次工具调用 |
| `</tool_call>` | 文本级标记 | 结束一次工具调用 |
| `<tool_response>` | 文本级标记 | 开始一个工具结果 |
| `</tool_response>` | 文本级标记 | 结束一个工具结果 |
| `<tools>` … `</tools>` | 纯文本 | 包裹系统轮次中的工具列表 |
| `<scratch_pad>` … `</scratch_pad>` | 文本级标记（Hermes 3） | 调用前的 GOAP 推理部分 |
| `<think>` … `</think>` | 不在 Hermes 2 Pro 规范中 | omp 扫描器识别的思考标记（R1 风格微调模型） |

精确性说明：

- 所有标记都使用 ASCII 竖线 `|`（U+007C）和 ASCII 尖括号。
- README 将 ChatML 描述为添加“特殊 token……以标示任何轮次的开始和结束，以及轮次的角色”；分割轮次时只有 `<|im_start|>`/`<|im_end|>` 起作用。工具标记是普通文本，所以正则表达式/子字符串解析器能从解码后的输出中提取它们。
- `<tools>`/`</tools>` 完全不具备 token 身份，它们只是提示词正文中包裹 JSON 工具列表的标记。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

采用 ChatML。每条消息渲染为：

```text
<|im_start|>{role}
{body}<|im_end|>
```

- 角色：`system`、`user`、`assistant`、`tool`。没有独立的“通道”概念；仅有的子流是助手轮次开头可选的 Hermes 3 `<scratch_pad>`（或 R1 风格的 `<think>`）块。
- `<|im_end|>\n` 结束每个轮次。使用 `add_generation_prompt=True` 时，提示词以 `<|im_start|>assistant\n` 结尾，模型从这里继续生成。
- **系统轮次：**如果调用方提供 `system` 消息，它就成为第一个轮次。存在工具时，工具声明**就是**该系统轮次的内容（下文引用的函数调用提示词），没有独立的工具轮次。
- **工具结果轮次使用专用的 `tool` 角色。**每个已执行的结果都以携带 `<tool_response>` 块的 `<|im_start|>tool` 轮次回传。这是经典 Hermes 2 Pro 的形式；Qwen3 的模板则将相同的块并入 `user` 轮次（[qwen3.md](./qwen3.md) 的“角色”一节）。
- **思考/推理：**Hermes 2 Pro 函数调用规范中没有思考通道。Hermes 3 的工具使用模板可以在 `<tool_call>` 前插入 `<scratch_pad>…</scratch_pad>` GOAP 块（目标 / 动作 / 观察 / 反思部分）。

## 工具定义 \{#tool-definitions}

工具声明**就是系统提示词本身**。NousResearch README 中的标准 Hermes 2 Pro 提示词，原文如下：

```text
<|im_start|>system
You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags. You may call one or more functions to assist with the user query. Don't make assumptions about what values to plug into functions. Here are the available tools: <tools> [{"type": "function", "function": {"name": "get_stock_fundamentals", "description": "Get fundamental data for a given stock symbol using yfinance API.", "parameters": {"type": "object", "properties": {"symbol": {"type": "string"}}, "required": ["symbol"]}}}] </tools> Use the following pydantic model json schema for each tool call you will make: {"title": "FunctionCall", "type": "object", "properties": {"name": {"title": "Name", "type": "string"}, "arguments": {"title": "Arguments", "type": "object"}}, "required": ["name", "arguments"]} For each function call return a json object with function name and arguments within <tool_call></tool_call> XML tags as follows:
<tool_call>
{"name": <function-name>, "arguments": <args-dict>}
</tool_call><|im_end|>
```

- 每个列表元素都是完整的 OpenAI 工具对象 `{"type": "function", "function": {...}}`（带有 JSON-Schema `parameters` 对象）。2 Pro 提示词将整个 JSON **数组内联**嵌入；Hermes 3 模板将 `<tools>` 块放在单独的行上，JSON 载荷相同。
- 末尾的指令是提示词的字面组成部分，包括占位行 `{"name": <function-name>, "arguments": <args-dict>}`（这些尖括号 token 是指令，不是要输出的内容）。
- `FunctionCall` pydantic 模式说明句描述了双键调用对象；Qwen3 采用该约定时删除了这句话（[qwen3.md](./qwen3.md) 的“工具定义”一节）。
- Hermes 3 模板还指示模型在调用函数前将 GOAP 推理记录在 `<scratch_pad>…</scratch_pad>` 内，其中 `Actions` 写成 `result_var = functions.name(param=value, …)` 行。

## 工具调用格式 \{#tool-call-format}

模型将每次调用输出为一行 `<tool_call>`、一个单行 JSON 对象，再加上 `</tool_call>`。最小单次调用（README 示例，原样引用）：

```text
<tool_call>
{"name": "get_stock_fundamentals", "arguments": {"symbol": "TSLA"}}
</tool_call>
```

- `arguments` 是**嵌套 JSON 对象**，不是 JSON 编码的字符串。在线上传输时它是 `"arguments": {"symbol": "TSLA"}`，绝不是 `"arguments": "{\"symbol\": \"TSLA\"}"`。
- 调用对象恰有两个键：`name`（字符串）和 `arguments`（对象），与 `FunctionCall` 模式一致。**线上格式没有逐调用 ID**，OpenAI 风格的 `tool_call_id` 由服务层生成（见 API 映射）。
- 发起工具调用的助手轮次也可以在第一个 `<tool_call>` 前包含自然语言正文。

## 多次 / 并行工具调用 \{#multiple--parallel-tool-calls}

并行调用在同一个助手轮次中输出为连续的 `<tool_call>…</tool_call>` 块。系统提示词明确允许“一个或多个函数”；每个块独立解析，每次调用必须返回一个 `<tool_response>`。

## 工具结果格式 \{#tool-result-format}

每个已执行的结果都以 `<|im_start|>tool` 轮次回传，其正文为一个 `<tool_response>` 块，包裹包含函数**名称**和**内容**的 JSON 对象（README 示例，原样引用）：

```text
<|im_start|>tool
<tool_response>
{"name": "get_stock_fundamentals", "content": {"symbol": "TSLA", "company_name": "Tesla, Inc.", "sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "market_cap": 611384164352, "pe_ratio": 49.604652, "pb_ratio": 9.762013, "dividend_yield": null, "eps": 4.3, "beta": 2.427, "52_week_high": 299.29, "52_week_low": 152.37}}
</tool_response>
<|im_end|>
```

- `{"name": …, "content": …}` 嵌套结构使每个结果都能自行说明调用了哪个函数，但与某次特定调用的绑定仍依赖位置。同一函数的两个并行调用具有相同的 `name`，原始格式不提供唯一调用 ID。（Qwen3 则在 `user` 轮次下输出裸内容，并依赖顺序，见 [qwen3.md](./qwen3.md) 的“工具结果格式”一节。）
- 在 OpenAI API 层，结果消息是 `{"role": "tool", "content": "...", "tool_call_id": "..."}`；上面的渲染形式是模板根据它生成的。

## 端到端示例 \{#end-to-end-example}

以下完整交互由 NousResearch README 函数调用演示中连续的四个代码块原样拼接而成（每个轮次都已与源内容逐字节核对）：

```text
<|im_start|>user
Fetch the stock fundamentals data for Tesla (TSLA)<|im_end|>
<|im_start|>assistant
<tool_call>
{"name": "get_stock_fundamentals", "arguments": {"symbol": "TSLA"}}
</tool_call><|im_end|>
<|im_start|>tool
<tool_response>
{"name": "get_stock_fundamentals", "content": {"symbol": "TSLA", "company_name": "Tesla, Inc.", "sector": "Consumer Cyclical", "industry": "Auto Manufacturers", "market_cap": 611384164352, "pe_ratio": 49.604652, "pb_ratio": 9.762013, "dividend_yield": null, "eps": 4.3, "beta": 2.427, "52_week_high": 299.29, "52_week_low": 152.37}}
</tool_response>
<|im_end|>
<|im_start|>assistant
The stock fundamentals data for Tesla (TSLA) are as follows:
- **Symbol**: TSLA
- **Company Name**: Tesla, Inc.
- **Sector**: Consumer Cyclical
- **Industry**: Auto Manufacturers
- **Market Capitalization**: $566,160,130,480
- **Forward Price-to-Earnings Ratio (PE Ratio)**: 42.73
- **Price-to-Book Ratio (PB Ratio)**: 9.04
- **Dividend Yield**: N/A
- **Trailing Earnings Per Share (EPS)**: $4.3
- **Beta Value of the Stock**: 2.42
- **52-Week High Price of the Stock**: $299.29
- **52-Week Low Price of the Stock**: $152.37

This information provides a snapshot of Tesla's financial position and performance based on the fundamental data obtained from the yfinance API. It shows that Tesla has a substantial market capitalization and a relatively high P/E and P/B ratio compared to other stocks in its industry. The company does not pay a dividend at the moment, which is reflected by a 'Dividend Yield' of 'None'. The Beta value indicates that Tesla's stock has a moderate level of volatility relative to the market. The 52-week high and low prices give an idea of the stock's range over the past year. This data can be useful when assessing investment opportunities and making investment decisions.<|im_end|>
```

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

服务引擎通过 **`hermes` 工具调用解析器**暴露这一约定（vLLM：`--enable-auto-tool-choice --tool-call-parser hermes`、`Hermes2ProToolParser`，Qwen3 使用同一解析器；已核实的流式细节参见 [qwen3.md](./qwen3.md) 的“OpenAI 兼容 API 映射”和“解析说明”两节）：

- `finish_reason`：轮次以工具调用结束时为 `"tool_calls"`（否则为 `"stop"`）。
- `message.role`：`"assistant"`；`message.content`：纯工具调用轮次为 `null`（调用前的正文会成为 `content`）。
- `message.tool_calls[]`：每个 `<tool_call>` 块对应一个条目，包含服务器生成的 `id`（模型不输出 ID）、`type: "function"`、`function.name`，以及在 API 边界重新序列化为 **JSON 字符串**的 `function.arguments`（使用前对它执行 `json.loads(...)`）。
- 回传结果：为每个结果追加 `{"role": "tool", "content": <result>, "tool_call_id": <id-from-the-call>}`；引擎将其渲染为上面的 `<tool_response>` 形式。

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

`hermes` 方言在 `packages/ai/src/dialect/factory.ts` 中注册，在 `packages/ai/src/dialect/hermes.ts` 中实现。存在工具时，自主管理模式会向系统提示词追加格式指南/目录，省略原生工具和 `tool_choice`，将调用/结果历史改写为文本，并将助手输出投影回标准 pi 事件。尽管 `qwen3` 与它共享基本的 `<tool_call>` 内嵌 JSON 形式，前者仍是独立可选的方言。

### 选择 \{#selection}

将 `tools.format` 设为 `hermes` 可强制使用此方言（`cfgToolsFormat`，`packages/coding-agent/src/session/context-settings.ts`）。当智能体配置的解析器没有返回自主管理方言时，`PI_DIALECT=hermes` 作为回退（`resolveOwnedDialectFromEnv`，`packages/agent/src/agent-loop.ts`）；它不会覆盖显式的自主管理设置。

默认的 `auto` 使用原生调用，除非 `supportsTools === false`，此时会选择模型类别对应的方言，并以 GLM 回退（`resolveDialect`，`packages/coding-agent/src/sdk.ts`）。没有任何类别会自动映射到 `hermes`：`packages/catalog/src/identity/dialect.ts` 中的 `preferredDialect` 从不返回它。其他可选的自主管理值为 `glm`、`kimi`、`xml`、`anthropic`、`deepseek`、`harmony`、`qwen3`、`gemini`、`gemma` 和 `minimax`；`native` 让工具保持提供方原生形式，除非环境回退选择了自主管理方言。

### 提示词和目录 \{#prompt-and-catalog}

`packages/ai/src/dialect/catalog.ts` 中的 `renderInbandToolPrompt` 使用 `prompt-template.md`：先是 `# Tools` 标题，再是 `<tools>` 中每行一个的紧凑 OpenAI 风格工具 JSON 对象，最后是 `hermes.md` 的格式指南。工具模式通过 `toolWireSchema` 规范化。指南要求 `arguments` 的值为对象，使用普通 JSON 字符串转义而非 HTML 转义，在停止前完成调用，并且禁止模型自行编写 `<tool_response>`。这是 OMP 的提示词，不是经典 2 Pro 的正文/`FunctionCall` 模式。

### 渲染 \{#rendering}

该方言写出：

- 调用为 `<tool_call>\n{single-line JSON}\n</tool_call>`，带有嵌套的 `arguments`；并行调用用换行分隔；
- 结果为 `<tool_response>\n{bare result text}\n</tool_response>`，没有经典的 `{"name": …, "content": …}` 包装，也没有独立的错误位；
- 底层 `renderTranscript` 输出为 ChatML，其中 `developer` 映射为 `system`，连续结果合并到一个 **`tool`** 轮次。助手思考位于正文和调用之前。思考通过 `renderDelimitedThinking` 渲染为 `<think>\n{text}\n</think>`，并去掉嵌套/重复的外围 think 块。不追加生成提示词。

提供方请求历史使用 **`encodeInbandToolHistory`**，而不是上述会话记录渲染器（`packages/ai/src/dialect/history.ts`）。带调用的助手轮次变为正文加调用块，并丢弃思考/图像块；不带调用的助手轮次保持不变。连续的结果变为一条合成的 **`user`** 消息，包含裸响应块，结果图像保留在文本之后。因此，上述专用 `tool` 角色描述的是会话记录渲染器，而非自主管理请求路径。

### 扫描 \{#scanning}

`HermesInbandScanner` 识别字面量 `<tool_call>`/`</tool_call>`，并可选识别 `<think>`/`</think>`，在数据块之间暂存不完整的标记后缀。它生成 `ptc_…` ID，并在 `parseStreamingJson` 恢复出非空字符串 `name` 时立即发出 `toolStart`；这可能是不完整的名称字符串。它不发出参数增量。在 `</tool_call>` 处，`parseJsonWithRepair` 解析正文，重新解析字符串化的 `arguments`，并将缺失/非对象参数规范化为 `{}`。成功的 `toolEnd` 保留原始块，并用最终解析值替换投影的名称/参数。

如果块无法解析，或在闭合时缺少非空名称，它会被消费而不发出 `toolEnd`。如果部分名称已产生 `toolStart`，该投影调用不会撤回。调用中途遇到 EOF 同样不会发出 `toolEnd`；正常停止可能保留并派发已开始的调用，参数为空（`InbandStreamProjector`，`packages/ai/src/dialect/owned-stream.ts`）。

自主管理流会丢弃从伪造的 `<tool_response>` 开始的输出。`tools.abortOnFabricatedResult` 默认为 `true`（`packages/coding-agent/src/tools/settings.ts`），并在该边界中止提供方；禁用它会继续排空流，但仍丢弃后续内容。如果提供方意外输出了具名原生调用，这些调用会被转发；先出现的原生/带内调用通道优先，避免重复派发。

### 思考解析默认值 \{#thinking-parsing-default}

直接扫描器默认**关闭**思考解析：其构造函数使用 `options.parseThinking === true`。没有该选项时，`<think>` 仍是可见文本，其中的调用仍可被扫描。`<scratch_pad>` 从来都不是此扫描器的思考分隔符。

自主管理投影器始终传入 `parseThinking: true`，因此智能体使用时会将 `<think>` 内容路由到思考事件，且不扫描该区间内的调用。直接扫描器仅在有缓冲文本可消费时才在 EOF 发出 `thinkingEnd`；如果最后一次输入已在思考状态下排空缓冲区，`flush()` 就不会发出该事件。自主管理投影器会在结束消息时关闭任何尚未关闭的思考块。

## 解析说明与易错点 \{#parsing-notes--gotchas}

- **参数对象与字符串：**在线上格式中，`arguments` 是嵌套 JSON 对象；OpenAI 层将其作为 JSON 字符串返回。读取原始流的代码必须解析对象；读取 API 的代码必须对字符串执行 `json.loads`。不要双重编码。（omp 扫描器出于健壮性考虑容忍字符串化形式；其渲染器从不输出该形式。）
- **`<tools>` 不是控制 token。**只有 `<|im_start|>`/`<|im_end|>` 划分轮次；其余都通过对解码文本进行子字符串匹配来处理。
- **正则表达式/流式解析：**vLLM 的 `hermes` 解析器以字面子字符串 `<tool_call>`/`</tool_call>` 为依据，对正文进行 JSON 解码，从 `<tool_call>` 开始缓冲，直到能增量解析 `name`，然后解析 `arguments`，完整细节见 [qwen3.md](./qwen3.md) 的“解析说明”一节。
- **结果绑定：**经典 Hermes 2 Pro 在 `tool` 轮次下的 `{"name": …, "content": …}` 嵌套结构中将函数名作为元数据，但调用/结果绑定仍依赖位置，因为名称不一定唯一。Qwen3 也依赖顺序，在 `user` 轮次下使用裸内容。
- **没有经典思考通道：**Hermes 2 Pro 未定义思考通道。OMP 将 `<scratch_pad>` 标记保留在可见文本中；R1 风格的 `<think>` 仅在启用思考解析时处理。
- **会话记录与请求历史：**`renderTranscript` 为每个已存储的助手轮次渲染思考。自主管理的提供方历史会剥离包含调用的助手轮次中的思考，不带调用的轮次则保持不变。
- **健壮性：**格式错误的已闭合块可能不产生 `toolEnd`，不完整的块可能留下参数为空的已开始调用。解析容错不等于模式验证。

## 来源 \{#sources}

- NousResearch Hermes-Function-Calling README（标准提示词格式、调用/结果形式、推理示例）：https://github.com/NousResearch/Hermes-Function-Calling
- vLLM 工具调用文档（`hermes` 解析器、自动工具选择）：https://docs.vllm.ai/en/latest/features/tool_calling/
- [qwen3.md](./qwen3.md)：Qwen3 对此约定的采用、共享的 vLLM 解析器行为，以及 `qwen3`/`hermes` 方言的区分
- OMP 实现：`packages/ai/src/dialect/hermes.ts`、`factory.ts`、`rendering.ts`、`catalog.ts`、`history.ts`、`owned-stream.ts`；JSON 解析：`packages/utils/src/json-parse.ts`；选择：`packages/catalog/src/identity/dialect.ts`、`packages/coding-agent/src/sdk.ts`（`resolveDialect`）、`packages/agent/src/agent-loop.ts`（`resolveOwnedDialectFromEnv`）。
