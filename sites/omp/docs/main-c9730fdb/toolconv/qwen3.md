---
title: "Qwen3 工具调用格式（Hermes 约定）"
description: "Oh My Pi 官方仓库文档：Qwen3 工具调用格式（Hermes 约定）。"
---

# Qwen3 工具调用格式（Hermes 约定） \{#qwen3-tool-calling-format-hermes-convention}

这是阿里巴巴 **Qwen3** 家族（`Qwen/Qwen3-*`：稠密模型 `0.6B–32B` 和 MoE `30B-A3B`/`235B-A22B`；与 `Qwen2.5-*` 和 `QwQ-32B` 属于同一模板系列）的工具调用约定。它采用 **Hermes** 约定，即 NousResearch 的 Hermes 2 Pro 开创、Qwen 原样采用的 XML+JSON 格式，众多社区微调模型也采用了它。外层封装为 **ChatML**：每个轮次都是 `<|im_start|>{role}\n{body}<|im_end|>\n`。可用工具在系统轮次的 `<tools>…</tools>` 块中声明（每行一份 JSON 规范）；模型将每次调用输出为 `<tool_call>\n{json}\n</tool_call>` 块，其中 `arguments` 是**嵌套 JSON 对象**（不是字符串化的 JSON）；工具结果在 `<tool_response>…</tool_response>` 中回传。混合推理通过 `<think>…</think>` 承载。该格式随模型自身的 `chat_template` 提供，因此推理服务器无需额外模板即可启用：vLLM 使用 `--enable-auto-tool-choice --tool-call-parser hermes`（配合 `--reasoning-parser deepseek_r1` 分离思考）；SGLang 提供相应解析器（例如 `--reasoning-parser qwen3`）。

核实依据：Qwen 的标准函数调用指南（`qwen.readthedocs.io/en/latest/framework/function_call.html`，已完整阅读，包括 Qwen-Agent + vLLM 部分）、`Qwen/Qwen3-8B` 的 `tokenizer_config.json` 中逐字节精确的 `chat_template` 字段（HF resolve-cache 提交 `b968826d9c46dd6066d109eabc6255188de91218`，使用 Jinja2 在本地渲染出下文的原始流）及用于核实 token ID 的 `added_tokens_decoder`、NousResearch 的 `Hermes-Function-Calling` README，以及 vLLM 工具调用文档（`hermes` 解析器 + Qwen 模型部分）。

下文模板/分词器细节指的是上面列出的 Qwen3-8B 参考，
并非所有后续 Qwen 部署。OMP 的自主管理转换器不执行
该模板，也不应用 `enable_thinking`；已实现的
请求和扫描器行为见
[omp / pi 转换器行为](#omp--pi-converter-behavior)。

## 特殊 token \{#special-tokens}

只有三个 ChatML 标记是“特殊”控制 token（`special=true`，会被 `skip_special_tokens` 跳过）。推理和工具标记也都是单个词表 token（各有一个 ID），但注册为 `special=false`，即渲染为普通文本，**不会**被 `skip_special_tokens` 剥离。`<tools>`/`</tools>` 包装完全**没有**专用 token，它是会被 BPE 拆成多个 token 的纯文本。ID 来自 `Qwen/Qwen3-8B` 的 `added_tokens_decoder`。

| Token（原样） | ID | `special` | 用途 |
| --- | --- | --- | --- |
| `<\|im_start\|>` | 151644 | true | 开始一个轮次；后面紧接角色名 + `\n` |
| `<\|im_end\|>` | 151645 | true | 结束一个轮次；聊天停止 token |
| `<\|endoftext\|>` | 151643 | true | 基础 EOS / 填充 token |
| `<think>` | 151667 | false | 开始推理块 |
| `</think>` | 151668 | false | 结束推理块 |
| `<tool_call>` | 151657 | false | 开始一次工具调用 |
| `</tool_call>` | 151658 | false | 结束一次工具调用 |
| `<tool_response>` | 151665 | false | 开始一个工具结果 |
| `</tool_response>` | 151666 | false | 结束一个工具结果 |
| `<tools>` … `</tools>` | 无 | 无 | 系统轮次中包裹工具列表的纯文本标记（不是单个 token） |

精确性说明：

- 所有标记都使用 ASCII 竖线 `|`（U+007C）和 ASCII 尖括号。Qwen3 **没有**全角（`｜` U+FF5C）或 `▁`（U+2581）变体，那属于 DeepSeek/SentencePiece，而非 Qwen。
- `<|im_start|>` 和 `<|im_end|>` 是分割轮次时唯一起作用的 token。由于 `<tool_call>`、`</tool_call>`、`<tool_response>`、`<think>`、`</think>` 均为 `special=false`，它们会在 `skip_special_tokens=True` 解码后保留，这正是基于正则表达式的 `hermes` 解析器能够从解码文本中恢复它们的原因。
- 模型卡确认 `</think>` = token `151668`（参考解析片段 `output_ids[::-1].index(151668)` 使用了它）。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

采用 ChatML。每条消息渲染为：

```text
<|im_start|>{role}
{body}<|im_end|>
```

- 角色：`system`、`user`、`assistant`、`tool`。没有独立的“通道”概念；唯一的子流是助手轮次内的 `<think>` 推理块。
- `<|im_end|>\n` 结束每个轮次。使用 `add_generation_prompt=True` 时，提示词以 `<|im_start|>assistant\n` 结尾，模型从这里继续生成。
- **系统轮次：**如果调用方提供 `system` 消息，它就成为第一个轮次。存在 `tools` 时，工具声明会合并**进**同一个系统轮次（先是用户的系统文本，再是 `\n\n`，然后是 `# Tools` 块，见下文）。未提供系统提示词时，Qwen3 不注入默认系统提示词。
- **工具结果轮次使用 `user` 封装。**Qwen3 模板将每条 `role: "tool"` 消息映射为携带 `<tool_response>` 块的 `<|im_start|>user` 轮次（连续工具消息合并为一个用户轮次）。这与经典 Hermes 2 Pro 不同，后者使用专用的 `<|im_start|>tool` 轮次承载结果，Qwen 则将其并入 `user`。
- **思考/推理：**由助手轮次开头的 `<think>…</think>` 承载（开关及历史重新渲染规则见“解析说明”）。

## 工具定义 \{#tool-definitions}

工具在系统轮次内声明。模板先输出固定前导文字，再将每个工具对象用 `tool | tojson`（`json.dumps(..., ensure_ascii=False)`）序列化，**每个对象独占一行**，最后输出固定的结尾文字。每个列表元素都是完整的 OpenAI 工具对象 `{"type": "function", "function": {...}}`（带有 JSON-Schema `parameters` 对象）。Qwen3 生成的精确包装，原文如下：

```text
<|im_start|>system
{optional original system content}

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_current_temperature", "description": "Get current temperature at a location.", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "The location to get the temperature for, in the format \"City, State, Country\"."}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "The unit to return the temperature in. Defaults to \"celsius\"."}}, "required": ["location"]}}}
{"type": "function", "function": {"name": "get_temperature_date", "description": "Get temperature at a location and date.", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "The location to get the temperature for, in the format \"City, State, Country\"."}, "date": {"type": "string", "description": "The date to get the temperature for, in the format \"Year-Month-Day\"."}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "The unit to return the temperature in. Defaults to \"celsius\"."}}, "required": ["location", "date"]}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call><|im_end|>
```

- 如果第一条消息是 `system` 消息，其内容会放在 `# Tools` 前（以空行分隔）；否则该轮次直接以 `# Tools` 开头。
- 末尾指令是提示词的字面组成部分，包括占位行 `{"name": <function-name>, "arguments": <args-json-object>}`（这些尖括号 token 是指令，不是要输出的内容）。
- 版本说明：原始 Hermes 2 Pro 系统提示词还嵌入了一行 `FunctionCall` pydantic 模式（`{"title": "FunctionCall", "type": "object", "properties": {"name": …, "arguments": …}}`）。Qwen3 删除了这一行；上面的包装就是 Qwen3 的精确输出。

## 工具调用格式 \{#tool-call-format}

模型将每次调用输出为一行 `<tool_call>`、一个单行 JSON 对象，再加上 `</tool_call>`。最小单次调用：

```text
<tool_call>
{"name": "get_current_temperature", "arguments": {"location": "San Francisco, CA, USA", "unit": "celsius"}}
</tool_call>
```

- `arguments` 是**嵌套 JSON 对象**，不是 JSON 编码的字符串。在线上格式中它是 `"arguments": {"location": "..."}`，绝不是 `"arguments": "{\"location\": ...}"`。（模板通过 `tojson` 渲染字典参数；只有调用方将 `arguments` 存为预序列化字符串时，才会原样传递。）
- 调用对象恰有两个键：`name`（字符串）和 `arguments`（对象）。线上没有逐调用 ID，OpenAI 风格的 `tool_call_id` 由服务器而非模型生成（见 API 映射）。
- 发起工具调用的助手轮次也可以在第一个 `<tool_call>` 前包含自然语言 `content`；模板会在该内容与第一次调用之间插入 `\n`。

## 多次 / 并行工具调用 \{#multiple--parallel-tool-calls}

并行调用在同一个助手轮次中输出为连续的 `<tool_call>…</tool_call>` 块，各块之间用换行分隔：

```text
<|im_start|>assistant
<tool_call>
{"name": "get_current_temperature", "arguments": {"location": "San Francisco, CA, USA"}}
</tool_call>
<tool_call>
{"name": "get_temperature_date", "arguments": {"location": "San Francisco, CA, USA", "date": "2024-10-01"}}
</tool_call><|im_end|>
```

解析器按输出顺序将它们作为 `tool_calls[0]`、`tool_calls[1]` 等返回。应用必须执行这些调用，并按相同顺序为每次调用返回一个 `<tool_response>`。

## 工具结果格式 \{#tool-result-format}

每个已执行的结果都包裹在 `<tool_response>…</tool_response>` 中。Qwen3 将它们放在 **`user`** 轮次内，并将连续工具结果**合并**为一个轮次（每个结果对应一个 `<tool_response>` 块，以换行分隔，共用一个结束的 `<|im_end|>`）：

```text
<|im_start|>user
<tool_response>
{"temperature": 26.1, "location": "San Francisco, CA, USA", "unit": "celsius"}
</tool_response>
<tool_response>
{"temperature": 25.9, "location": "San Francisco, CA, USA", "date": "2024-10-01", "unit": "celsius"}
</tool_response><|im_end|>
```

- 标签之间的正文是工具返回值（通常是 JSON 字符串，但允许任何文本）。Qwen3 的 `<tool_response>` 内**不**重复函数名，结果按顺序关联到调用。（经典 Hermes 2 Pro 则在 `tool` 轮次下的 `<tool_response>` 中嵌套 `{"name": ..., "content": ...}`；Qwen3 模板在 `user` 轮次下输出裸内容。）
- 在 OpenAI API 层，结果消息是 `{"role": "tool", "content": "...", "tool_call_id": "..."}`；模板仅将其 `content` 渲染进 `<tool_response>` 块。

## 端到端示例 \{#end-to-end-example}

以下是**非思考模式**（`enable_thinking=False`）下完整的多轮天气交互，与 `apply_chat_template` 为实际流程渲染的内容完全一致。禁用思考时，每个生成步骤会在 `<|im_start|>assistant\n` 后注入空的 `<think>\n\n</think>\n\n`；模型随后输出工具调用 / 最终回答。内容可复制粘贴，并逐字节精确：

```text
<|im_start|>system
You are a helpful assistant. Current Date: 2024-09-30.

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_current_temperature", "description": "Get current temperature at a location.", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "The location to get the temperature for, in the format \"City, State, Country\"."}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"], "description": "The unit to return the temperature in. Defaults to \"celsius\"."}}, "required": ["location"]}}}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call><|im_end|>
<|im_start|>user
What's the temperature in San Francisco now?<|im_end|>
<|im_start|>assistant
<think>

</think>

<tool_call>
{"name": "get_current_temperature", "arguments": {"location": "San Francisco, CA, USA", "unit": "celsius"}}
</tool_call><|im_end|>
<|im_start|>user
<tool_response>
{"temperature": 26.1, "location": "San Francisco, CA, USA", "unit": "celsius"}
</tool_response><|im_end|>
<|im_start|>assistant
<think>

</think>

The current temperature in San Francisco is 26.1°C.<|im_end|>
```

在**思考模式**（`enable_thinking=True`，默认值）下，生成提示词改为以裸 `<|im_start|>assistant\n` 结尾，模型自行在 `<tool_call>` 前生成 `<think>…real reasoning…</think>` 块。（重新渲染存储的历史时，模板只为最后一条助手消息或携带 `reasoning_content` 的消息保留 `<think>` 块，并剥离更早轮次的推理，见“解析说明”。）

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

使用 `--enable-auto-tool-choice --tool-call-parser hermes` 时，vLLM 将原始流转换为标准 Chat Completions 响应：

- `finish_reason`：轮次以工具调用结束时为 `"tool_calls"`（否则为 `"stop"`）。
- `message.role`：`"assistant"`；`message.content`：纯工具调用轮次为 `null`（调用前的正文会成为 `content`）。
- `message.tool_calls[]`：每个 `<tool_call>` 块对应一个条目，每个条目包含：
   - `id`：服务器生成，例如 `"chatcmpl-tool-924d705adb044ff88e0ef3afdd155f15"`（模型不输出 ID）。
   - `type`：`"function"`。
   - `function.name`：调用的 `name`。
   - `function.arguments`：在 API 边界为 **JSON 字符串**，例如 `'{"location": "San Francisco, CA, USA"}'`。线上格式是嵌套对象，但服务器在这里将其重新序列化为字符串（使用前对它执行 `json.loads(...)`），与 OpenAI 和 Qwen-Agent 一致。
- 使用思考 + `--reasoning-parser deepseek_r1` 时，`<think>…</think>` 内容被分离到 `message.reasoning_content`，并从 `content` 移除。
- 回传结果：为每个结果追加 `{"role": "tool", "content": <result>, "tool_call_id": <id-from-the-call>}`。`tool_call_id` 将结果链接到调用（Qwen3 模板渲染时忽略 ID，传达给模型的是顺序，但 API 仍要求它）。

两次调用查询返回的助手消息示例：

```text
finish_reason='tool_calls'
message.content = None
message.tool_calls = [
  {id:'chatcmpl-tool-924d…', type:'function', function:{name:'get_current_temperature', arguments:'{"location": "San Francisco, CA, USA"}'}},
  {id:'chatcmpl-tool-7e30…', type:'function', function:{name:'get_temperature_date',   arguments:'{"location": "San Francisco, CA, USA", "date": "2024-10-01"}'}},
]
```

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

仓库的 `qwen3` 方言是**自主管理的带内转换器**。通过智能体配置中的
`tools.format: qwen3` 或 `PI_DIALECT=qwen3` 选择它。
每次提供方请求都会重新计算选择。`PI_DIALECT` 在配置
未解析出自主管理方言时作为回退，因此选择
`native` 时应取消设置它，以确保使用提供方原生调用。

存在工具时，智能体向系统提示词追加 Qwen3 格式指南和共享的紧凑
工具目录，移除提供方原生工具及工具
选择，将先前的调用/结果改写为文本，并将流式输出扫描回
标准 pi 事件。`hermes` 仍是独立可选的方言，
尽管两者都输出相同的基本 `<tool_call>` 内嵌 JSON 约定（见
[hermes.md](./hermes.md)）。OMP 使用 `packages/ai/src/dialect/prompt-template.md`，
而非上游 Qwen 模板逐字节精确的系统前导文字。

目录的家族关联辅助函数将归类为 `qwen` 的模型 ID 映射到
`qwen3`，包括 Coder 家族。它使用目录分类体系，而非
简单的子字符串检查。默认的 `tools.format: auto` 仅在
模型设置 `supportsTools: false` 时使用此回退；否则保留原生
工具。对于需要原生 XML 协议的 Coder 端点，设置
`tools.format: native`，取消设置 `PI_DIALECT`，并配置服务端点的
`qwen3_xml` 解析器。`qwen3_xml` 不是 OMP 自主管理方言，也不是有效的
`tools.format` 值。

`packages/ai/src/dialect/qwen-xml.ts` 中有独立的
`QwenXmlInbandScanner`，用于标记修复器显式的
`pattern: "qwen"` 模式。它只在区段闭合后才解析
`<tool_calls>` 内的自闭合 `<TOOL arg="value" />`
元素，属性值为字符串。这是恢复辅助工具，不是可选的自主管理方言。
修复器自动选择目前会选择 Kimi、DSML 或仅思考模式，
不会选择此模式。

omp 渲染器始终写出嵌套的 `arguments` 对象，并将
并行调用以换行分隔渲染。结果变为合成用户历史消息内
以换行分隔的 `<tool_response>` 块。结果
既不携带名称也不携带 ID，且没有成功/错误标记；图像保留在
渲染文本之后。带调用的助手历史变为正文加
渲染后的调用，并省略原始思考块。独立的
`renderTranscript` API 保留思考并输出 ChatML 轮次。

扫描器生成 ID（`ptc_…`），且仅当 `name`
是第一个 JSON 字段并具有完整非空字符串值时，才提前发出 `toolStart`。其他字段
顺序仍可在块闭合时产生调用。它等待
`</tool_call>` 才发出 `toolEnd`，且从不发出参数增量。
闭合时，它使用共享的修复型 JSON 解析器。为了兼容，它还
接受字符串化的 `arguments` 并再次解析，尽管自主管理
渲染器从不输出这种形式。字符串解析失败、参数缺失或
非对象参数都会规范化为 `{}`。额外的外层字段被忽略；
扫描器不检查工具是否在目录中，也不验证参数模式。
成功的 `toolEnd` 包含带标签的精确 `rawBlock`。

如果 EOF 在名称恢复之后、`</tool_call>` 之前到达，就不会
发出 `toolEnd`，但由 `toolStart` 创建的标准调用会保留，
参数为空，并可能在正常停止时派发。
提前发出 `toolStart`，但完整外层 JSON 无法解析时，
同样会保留部分调用：块被消费而不发出
`toolEnd`，空的标准调用仍保留。始终未产生
名称的块不会创建调用。提供方的 `length` 停止仍为 `length`，而非 `toolUse`。

思考解析默认启用：`<think>…</think>` 变为思考
事件，并从可见文本中排除。创建扫描器的调用方可以设置
`parseThinking: false`，此时思考标记保留为普通
文本。未终止的思考会保留其内容，并在
刷新时发出 `thinkingEnd`。

模型自行编写的第一个 `<tool_response>` 是伪造结果边界。
默认的 `tools.abortOnFabricatedResult: true` 会在此中止生成；
禁用它会继续排空提供方流，但丢弃后续内容。如果
提供方仍输出原生调用，第一个具名原生或带内调用
会选择该轮次的通道；另一个通道会被丢弃，避免
重复派发。

## 解析说明与易错点 \{#parsing-notes--gotchas}

- **参数对象与字符串：**在线上格式中，`arguments` 是嵌套 JSON 对象；OpenAI 层将其作为 JSON 字符串返回。读取原始流的代码必须解析对象；读取 API 的代码必须对字符串执行 `json.loads`。不要双重编码。
- **`<tools>` 不是 token。**只能依赖 `<|im_start|>`/`<|im_end|>`（以及 `*tool_call*`/`*tool_response*`/`*think*` 单个 token）具有原子性。`<tools>`/`</tools>` 是纯文本。
- **正则表达式/流式解析：**vLLM 的 `hermes` 解析器（`vllm/tool_parsers/hermes_tool_parser.py`，`Hermes2ProToolParser`）以字面子字符串 `<tool_call>` / `</tool_call>` 为依据，对正文进行 JSON 解码，支持每轮多个块。流式处理时，它从 `<tool_call>` 开始缓冲，直到能增量解析 `name`，随后解析 `arguments`；部分参数 JSON 以参数增量形式输出。第一个 `<tool_call>` 前的文本按普通内容流式输出。
- **思考开关：**`enable_thinking=False`（通过 OpenAI API 的 `chat_template_kwargs={"enable_thinking": False}`，或 `tokenizer.apply_chat_template(..., enable_thinking=False)` 传入）向生成提示词注入空的 `<think>\n\n</think>\n\n`，强制抑制推理。启用思考时，用户/系统消息中的软开关 `/think` 和 `/no_think` 可逐轮切换思考。不建议 Qwen3 使用贪心解码（有重复风险）。
- **历史重新渲染的不对称性：**`apply_chat_template` 重新渲染已存储的对话时，只为最后一条助手消息或携带 `reasoning_content` 的消息输出 `<think>` 块；更早轮次的推理会被丢弃。因此，存储的中间工具调用助手轮次没有 `<think>` 块，而产生它的实时生成步骤却以该块作为前缀（非思考模式下）。推理仅在当前多步工具序列内保留（最后一个真实用户查询之后）。
- **推理模型 + 停用词模板：**Qwen 警告不要为 Qwen3 使用 ReAct 风格的停用词工具模板，因为推理文本可能包含这些停用词并破坏解析，应改用这一原生 Hermes 模板。
- **健壮性：**该格式由提示词/模板驱动，因此可能出现格式错误的输出
  （截断的 JSON、缺少 `</tool_call>`、调用中混入正文，或字符串化的
  参数）。vLLM 可能根据其解析器路径回退为内容；omp 的
  自主管理扫描器会消费已识别的块；无法恢复名称的块
  不产生调用，但已开始的部分调用会在后续解析
  失败后保留。使用 vLLM 原生工具时，具名 / `required` 工具选择可以
  通过 vLLM 的结构化输出后端路由，但
  自主管理模式不发送提供方原生工具定义，因此不能依赖
  该后端。
- **版本/范围：**此 `hermes` 模板涵盖 `Qwen3-*`、`Qwen2.5-*` 和 `QwQ-32B`。它**不**涵盖 `Qwen3-Coder`，后者使用另一种 XML 方案，由服务引擎的 `qwen3_xml` 解析器解析。OMP 没有 `qwen3_xml` 自主管理方言；请使用 `tools.format=native`，并在端点配置该解析器。

## 来源 \{#sources}

- `packages/ai/src/dialect/qwen3.ts`、`coercion.ts` 和 `qwen3.md`：自主管理扫描器、渲染和指南。
- `packages/ai/src/dialect/catalog.ts`、`history.ts`、`rendering.ts` 和 `owned-stream.ts`：提示词/历史转换、结果和投影。
- `packages/ai/src/dialect/qwen-xml.ts` 和 `packages/ai/src/utils/stream-markup-healing.ts`：独立的 XML 恢复辅助工具与修复器选择。
- `packages/catalog/src/identity/dialect.ts`、`compat/rules/taxonomy/qwen.kdl` 和 `packages/coding-agent/src/sdk.ts`：分类体系关联和设置解析。
- `packages/agent/src/agent-loop.ts`：逐请求选择、环境回退及原生工具选择抑制。

- Qwen 函数调用指南：https://qwen.readthedocs.io/en/latest/framework/function_call.html
- Qwen3-8B 聊天模板 + token ID（`tokenizer_config.json`，`chat_template` + `added_tokens_decoder`）：https://huggingface.co/Qwen/Qwen3-8B/resolve/main/tokenizer_config.json （通过 HF resolve-cache 提交 `b968826d9c46dd6066d109eabc6255188de91218` 核实）
- Qwen3-8B 模型卡（思考模式、`enable_thinking`、`</think>`=151668）：https://huggingface.co/Qwen/Qwen3-8B
- NousResearch Hermes-Function-Calling（该约定的起源）：https://github.com/NousResearch/Hermes-Function-Calling
- vLLM 工具调用文档（`hermes` 解析器、Qwen 模型、自动工具选择）：https://docs.vllm.ai/en/latest/features/tool_calling/
