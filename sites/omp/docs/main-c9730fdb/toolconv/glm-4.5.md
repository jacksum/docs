---
title: "GLM-4.5 / GLM-4.6 工具调用格式"
description: "Oh My Pi 官方仓库文档：GLM-4.5 / GLM-4.6 工具调用格式。"
---

# GLM-4.5 / GLM-4.6 工具调用格式 \{#glm-45--glm-46-tool-calling-format}

智谱 AI / Z.ai 的 **GLM-4.5** 系列（`zai-org/GLM-4.5` 355B-A32B 和 `zai-org/GLM-4.5-Air` 106B-A12B，`model_type: "glm4_moe"`）的原生工具调用约定，**GLM-4.6** 逐字节共用此约定。与大多数系列使用的标签内 JSON 约定不同，GLM 将每个工具调用输出为**类 XML** 块：`<tool_call>{name}` 后跟交替的 `<arg_key>`/`<arg_value>` 元素对，由 `</tool_call>` 结束。提示词是以 `[gMASK]<sop>` 开始的 GLM 风格序列，带有轮次标记 `<|system|>`、`<|user|>`、`<|assistant|>`、`<|observation|>`。推理服务器通过解析器加推理解析器将原始流转换为 OpenAI 风格的 `tool_calls`：vLLM 和 SGLang 都提供 `--tool-call-parser glm45 --reasoning-parser glm45`（vLLM 还需要 `--enable-auto-tool-choice`）。工具调用和推理完全由随附的 `chat_template.jinja` 驱动；思考模式默认开启，可按请求通过 `chat_template_kwargs={"enable_thinking": False}` 禁用。

本文根据 HF 仓库中的权威 `chat_template.jinja`（获取原始内容并**在本地使用 Jinja2 渲染**，采用 `trim_blocks=True, lstrip_blocks=True` 和 transformers 的 `tojson` 过滤器，生成下文字节精确的流）、用于核对精确 token ID 和停止 token 的 `tokenizer_config.json` 与 `generation_config.json`、模型卡，以及 vLLM（`Glm4MoeModelToolParser`）和 SGLang（`Glm4MoeDetector`）解析器源码进行了核验。HF 的 `resolve`/`blob` 网页路径会重定向到模型卡 API；字节精确的源码通过 `resolve/main/...:raw` 缓存获取（模板提交 `cbb2c7cfb52fa128a9660cb1a7a78e017899e115`）。GLM-4.5 和 GLM-4.6 的 `chat_template.jinja` 文件相同（内容哈希同为 `41478957…`）。

下文的原生模板/服务器章节提供格式背景。OMP 在 `packages/ai/src/dialect/glm.ts` 中实现了自己的解码文本 `glm` 扫描器和渲染器，而不是上游 Jinja 模板或 Python 解析器。其不同的历史、思考、强制转换和恢复行为在 _omp / pi 转换器行为_中说明。

## 特殊 token \{#special-tokens}

Token ID 来自 `tokenizer_config.json`（`added_tokens_decoder`）。注意其中的区别：轮次/角色标记注册为**特殊** token，而结构性工具调用和思考标签各自是一个专用词表 token，但标记为 **`special: false`**（它们作为普通文本输出/打印，不会作为控制 token 被移除）。

| Token（原样） | ID | `special` | 用途 |
| --- | --- | --- | --- |
| `[gMASK]` | 151331 | true | GLM 前缀 / 空白填充哨兵；每个提示词的第一个 token |
| `<sop>` | 151333 | true | “Start of piece”，紧跟 `[gMASK]` 以开启序列 |
| `<eop>` | 151334 | true | “End of piece”（聊天模板不输出） |
| `<\|system\|>` | 151335 | true | 开始系统轮次（以及注入的工具轮次） |
| `<\|user\|>` | 151336 | true | 开始用户轮次（也是一个 EOS id，见下文） |
| `<\|assistant\|>` | 151337 | true | 开始助手轮次 / 生成提示词 |
| `<\|observation\|>` | 151338 | true | 开始工具结果（观察）轮次（也是一个 EOS id） |
| `<\|endoftext\|>` | 151329 | true | 文本结束；`eos_token` 和 `pad_token` |
| `<think>` | 151350 | false | 开始助手轮次内的推理区段 |
| `</think>` | 151351 | false | 结束推理区段 |
| `<tool_call>` | 151352 | false | 开始一次工具调用；函数名称紧随其后，位于同一行 |
| `</tool_call>` | 151353 | false | 结束一次工具调用 |
| `<arg_key>` | 151356 | false | 开始参数名称元素 |
| `</arg_key>` | 151357 | false | 结束参数名称元素 |
| `<arg_value>` | 151358 | false | 开始参数值元素 |
| `</arg_value>` | 151359 | false | 结束参数值元素 |
| `<tool_response>` | 151354 | false | 包装观察轮次内的一个工具结果 |
| `</tool_response>` | 151355 | false | 结束一个工具结果 |
| `/nothink` | 151360 | true | 附加到用户文本以抑制思考的软开关 |

精确性说明：

- 所有竖线都是 ASCII `|`（U+007C）；GLM 不使用全角 `｜`（U+FF5C）或 `▁`（U+2581）变体（与 DeepSeek 不同）。请精确复现 `<|system|>`、`<|user|>`、`<|assistant|>`、`<|observation|>`，以及带字面方括号的 `[gMASK]`。
- 由于 `<tool_call>`、`<arg_key>`、`<arg_value>`、`<tool_response>`、`<think>`（及其结束符）各自恰好映射到**一个** token ID，它们在流中各消耗一个 token，但由于是 `special: false`，它们经反分词往返后仍为普通文本。因此解析器将它们作为解码文本中的字面子字符串匹配，而不是控制 token id。
- `eos_token_id` 是一个**列表**：`[151329, 151336, 151338]` = `<|endoftext|>`、`<|user|>`、`<|observation|>`（来自 `generation_config.json`）。工具调用轮次正是这样结束的：在 `</tool_call>` 后，模型输出 `<|observation|>`，它是一个 EOS id，因此生成停止，服务器报告工具调用（见轮次结构）。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

每个提示词都以字面的双 token 前缀 `[gMASK]<sop>` 开始（后面没有换行）。随后拼接各轮次，每个轮次由其角色标记引入；渲染后的历史中没有逐轮终止 token（下一个标记，或生成过程中的 EOS id，会结束轮次）。

- **系统**（`<|system|>`）：角色标记、换行，然后是消息文本。提供 `tools` 时，会**先**渲染一个合成的工具系统轮次，位于任何用户提供的系统轮次之前（两者是独立的 `<|system|>` 块，见工具定义）。
- **用户**（`<|user|>`）：角色标记、换行，然后是文本。如果 `enable_thinking` 为 false，则向用户文本附加字面 `/nothink`（除非它已以 `/nothink` 结尾）。
- **助手**（`<|assistant|>`）：角色标记，后接推理区段和/或可见内容和/或工具调用。推理区段为 `\n<think>{reasoning}</think>`；可见内容另起一行；工具调用随后以 `<tool_call>…</tool_call>` 块出现。
- **工具结果**（`<|observation|>`）：引入一个或多个 `<tool_response>…</tool_response>` 块的角色标记（见工具结果格式）。

思考 / 推理通道：

- 推理位于助手轮次内的 `<think>…</think>` 中。`--reasoning-parser glm45` 将其提取到独立的 `reasoning_content` 字段；可见答案是 `</think>` 之后的内容。
- **只保留最后一条用户消息之后的助手轮次推理。** 模板将此前每个助手轮次渲染为空的 `<think></think>`，并丢弃其 `reasoning_content`（或嵌入 `content` 中的任何行内 `<think>…</think>`）。这可使过时的思维链不进入后续轮次的上下文。
- 既没有保留的推理，也没有显式思维链的助手轮次会渲染出 `\n<think></think>`（空），然后是内容/工具调用。

生成提示词（`add_generation_prompt=True`）：

- **思考模式（默认）：** 提示词以裸 `<|assistant|>` 结尾；模型继续输出 `\n<think>…</think>`，然后是答案或工具调用。
- **非思考模式**（`enable_thinking=false`）：提示词以 `<|assistant|>\n<think></think>` 结尾，预填一个空推理区段，使模型直接输出答案。

工具调用轮次如何终止：没有专用的“工具调用后停止”token。模型输出 `</tool_call>`，然后输出 `<|observation|>`（token 151338），后者是三个 EOS id 之一，因此解码停止。服务器检查文本，找到 `<tool_call>`，并返回 `finish_reason: "tool_calls"`。

## 工具定义 \{#tool-definitions}

请求携带 `tools` 时，模板在前面添加一个 `<|system|>` 轮次，其中包含固定前言、由 `<tools>…</tools>` 包装的工具列表，以及输出格式的字面描述。每个工具通过 `tool | tojson(ensure_ascii=False)` 序列化，即**原样序列化整个 OpenAI 工具对象**，包括 `{"type": "function", "function": {…}}` 包装，并采用默认 JSON 空格（`", "` / `": "`）。每行一个工具。

```text
<|system|>
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_weather", "description": "Get current weather for a city", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "City name"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, "required": ["location"]}}}
</tools>

For each function call, output the function name and arguments within the following XML format:
<tool_call>{function-name}
<arg_key>{arg-key-1}</arg_key>
<arg_value>{arg-value-1}</arg_value>
<arg_key>{arg-key-2}</arg_key>
<arg_value>{arg-value-2}</arg_value>
...
</tool_call>
```

上面的 `<tool_call>{function-name}` / `<arg_key>` / `<arg_value>` 行属于**提示词文本**（要求模型遵循的格式规范），不是示例调用。只有 `tools` 非空时才输出这个工具轮次，它由下一个角色标记隐式结束（例如用户提供的 `<|system|>` 或第一个 `<|user|>`），两者之间没有空行。

## 工具调用格式 \{#tool-call-format}

模型将调用输出为 `<tool_call>` 块：函数**名称与开始标签位于同一行**，接一个换行，然后每个参数对应一对 `<arg_key>…</arg_key>` + `<arg_value>…</arg_value>`，最后由 `</tool_call>` 结束。最小单次调用（思考模式下的助手生成；为贴近实际而展示推理）：

```text
<think>The user wants the weather in Beijing. I'll call get_weather.</think>
<tool_call>get_weather
<arg_key>location</arg_key>
<arg_value>Beijing</arg_value>
<arg_key>unit</arg_key>
<arg_value>celsius</arg_value>
</tool_call>
```

组成结构和值编码（这是最容易出错的部分）：

- 函数名称是 `<tool_call>` 与第一个换行之间的文本，名称外**没有**包装标签，`<tool_call>` 后也**没有**空格。
- 每个参数是两个相邻元素：先 `<arg_key>name</arg_key>`，再 `<arg_value>value</arg_value>`，惯例是每行一对。
- **参数值并非统一为 JSON。** 模板按 `value | tojson(ensure_ascii=False) if value is not string else value` 渲染每个值：
   - **字符串**值**原样输出，不带外围引号** → `<arg_value>Beijing</arg_value>`（不是 `"Beijing"`）。
   - **非字符串**值（数字、布尔值、空值、对象、数组）进行 JSON 编码 → `<arg_value>3</arg_value>`、`<arg_value>true</arg_value>`、`<arg_value>{"k": 1}</arg_value>`。
- **零参数**调用没有元素对：名称后是换行和结束符，即 `<tool_call>get_time\n</tool_call>`。

由于字符串值丢失了引号，解析器必须逐参数决定是进行 JSON 解码，还是将值视为字面字符串。两个参考解析器都通过查询工具的 JSON Schema 来决定：如果参数类型为 `string`，则原样采用原始文本；否则对值进行 JSON 解码（以 `ast.literal_eval` 和原始字符串作为回退）。模型经过训练会遵循模式，因此恰好在参数为字符串类型时输出裸字符串。

## 多个 / 并行工具调用 \{#multiple--parallel-tool-calls}

一个轮次中的两个或更多调用会输出为连续的 `<tool_call>…</tool_call>` 块，以单个换行分隔（没有包围整组调用的包装元素）。两个参数类型混合的并行调用的原始助手输出：

```text
<think>Two cities. Call get_weather twice in parallel.</think>
<tool_call>get_weather
<arg_key>location</arg_key>
<arg_value>Beijing</arg_value>
<arg_key>unit</arg_key>
<arg_value>celsius</arg_value>
</tool_call>
<tool_call>get_weather
<arg_key>location</arg_key>
<arg_value>Shanghai</arg_value>
<arg_key>days</arg_key>
<arg_value>3</arg_value>
<arg_key>verbose</arg_key>
<arg_value>true</arg_value>
</tool_call>
```

注意，`Beijing`/`Shanghai`/`celsius`（字符串）是裸值，而 `3`（数字）和 `true`（布尔值）是 JSON 字面量。解析器按非贪婪的 `<tool_call>.*?</tool_call>` 正则表达式拆分，因此支持任意数量的调用；每个调用成为 `tool_calls[]` 中的独立条目。

## 工具结果格式 \{#tool-result-format}

结果在**观察**轮次中返回。对于单个结果：`<|observation|>` 标记、换行，然后是由 `<tool_response>` / `</tool_response>` 包装的结果：

```text
<|observation|>
<tool_response>
{"temperature": 26, "unit": "celsius", "condition": "Sunny"}
</tool_response>
```

标签之间的内容**原样**插入（调用方通常传入 JSON 字符串，但允许任意文本）。对于一组并行调用的**多个**结果，`<|observation|>` 标记出现**一次**，每个结果都有自己的 `<tool_response>` 块（连续的 `tool` 角色消息合并到一个观察轮次下）：

```text
<|observation|>
<tool_response>
{"temperature": 26, "condition": "Sunny"}
</tool_response>
<tool_response>
{"temperature": 30, "condition": "Cloudy"}
</tool_response>
```

聊天模板**只**读取工具消息的 `content`，不查询任何 `tool_call_id`。因此，结果通过**位置 / 顺序**与调用关联，而不是嵌入的 id（GLM 的传输格式不携带每个调用的 id；见 API 映射）。

## 端到端示例 \{#end-to-end-example}

一次完整的多轮天气交互。这些是精确的本地渲染流；轮次内部的换行是实际换行，除此之外各轮次连续相接（标记之间没有分隔符）。

**阶段 1：提供给模型的提示词**（设置 `tools`，有一条先前的系统消息，`add_generation_prompt=True`，思考模式）：

```text
[gMASK]<sop><|system|>
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_weather", "description": "Get current weather for a city", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "City name"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, "required": ["location"]}}}
</tools>

For each function call, output the function name and arguments within the following XML format:
<tool_call>{function-name}
<arg_key>{arg-key-1}</arg_key>
<arg_value>{arg-value-1}</arg_value>
<arg_key>{arg-key-2}</arg_key>
<arg_value>{arg-value-2}</arg_value>
...
</tool_call><|system|>
You are a helpful assistant.<|user|>
What's the weather in Beijing?<|assistant|>
```

**助手生成**（模型输出；以输出 EOS id `<|observation|>` 结束，因此解码在此停止；服务器返回 `finish_reason: "tool_calls"`）：

```text
<think>The user wants the weather in Beijing. I'll call get_weather.</think>
<tool_call>get_weather
<arg_key>location</arg_key>
<arg_value>Beijing</arg_value>
<arg_key>unit</arg_key>
<arg_value>celsius</arg_value>
</tool_call>
```

**阶段 2：下一轮的提示词**，附加助手工具调用轮次和工具结果后，再设置 `add_generation_prompt=True`：

```text
[gMASK]<sop><|system|>
# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>
{"type": "function", "function": {"name": "get_weather", "description": "Get current weather for a city", "parameters": {"type": "object", "properties": {"location": {"type": "string", "description": "City name"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, "required": ["location"]}}}
</tools>

For each function call, output the function name and arguments within the following XML format:
<tool_call>{function-name}
<arg_key>{arg-key-1}</arg_key>
<arg_value>{arg-value-1}</arg_value>
<arg_key>{arg-key-2}</arg_key>
<arg_value>{arg-value-2}</arg_value>
...
</tool_call><|system|>
You are a helpful assistant.<|user|>
What's the weather in Beijing?<|assistant|>
<think>The user wants the weather in Beijing. I'll call get_weather.</think>
<tool_call>get_weather
<arg_key>location</arg_key>
<arg_value>Beijing</arg_value>
<arg_key>unit</arg_key>
<arg_value>celsius</arg_value>
</tool_call><|observation|>
<tool_response>
{"temperature": 26, "unit": "celsius", "condition": "Sunny"}
</tool_response><|assistant|>
```

**最终助手生成**（自然语言答案，由 `<|endoftext|>` 终止；`finish_reason: "stop"`）：

```text
<think>Got it, 26C and sunny.</think>
It's 26°C and sunny in Beijing right now.
```

上面可见两处细节：(1) 助手工具调用轮次的推理在阶段 2 中得以**保留**，只是因为它位于最后一条用户消息之后；如果其后还有另一个用户轮次，那个 `<think>…</think>` 就会被重新渲染为空。(2) 工具调用轮次与观察轮次直接相邻（`</tool_call><|observation|>`），观察轮次与下一个助手标记直接相邻（`</tool_response><|assistant|>`）。

对于**非思考**模式，用户文本携带软开关，生成提示词预填空思考区段：

```text
<|user|>
Hi there/nothink<|assistant|>
<think></think>
```

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

启用服务器解析器（`--tool-call-parser glm45 --reasoning-parser glm45`）时，原始流按如下方式映射到 Chat Completions：

- 输出包含至少一个 `<tool_call>` 时，`choices[].finish_reason` = `"tool_calls"`（否则为 `"stop"`）。
- `choices[].message.content` = 第一个 `<tool_call>` **之前**的文本（空或只有空白时规范化为 `null`）。`<think>…</think>` 推理由推理解析器移除，并单独通过 `message.reasoning_content` 提供。
- `choices[].message.tool_calls[]`：每个 `<tool_call>…</tool_call>` 块对应一个条目：
   - `.id` = **服务器生成的** id（例如 vLLM 的 `make_tool_call_id()`），模型输出中**不存在**。GLM 不在流中输出逐调用 id。
   - `.type` = `"function"`。
   - `.function.name` = `<tool_call>` 之后直到第一个换行的文本。
   - `.function.arguments` = **JSON 字符串**（一个对象），根据 `<arg_key>`/`<arg_value>` 对重建，并按工具模式逐参数确定类型。vLLM 返回 `json.dumps(arg_dct, ensure_ascii=False)`，例如 `"{\"location\": \"Beijing\", \"unit\": \"celsius\"}"`。客户端在使用前对其执行 `json.loads()`。
- **请求侧：工具结果**以 `role: "tool"` 消息发回，例如：

   ```json
   {
   	"role": "tool",
   	"tool_call_id": "call_abc123",
   	"content": "{\"temperature\": 26, \"unit\": \"celsius\", \"condition\": \"Sunny\"}"
   }
   ```

   聊天模板只渲染 `content`（位于 `<tool_response>` 内）；**模板忽略** `tool_call_id`，它只对客户端自身记录有意义。请按调用顺序排列结果。

- **请求侧：助手工具调用历史**：OpenAI 结构将 `function.arguments` 作为 JSON **字符串**携带，但聊天模板遍历 `arguments.items()`，因此需要**对象**。vLLM/SGLang 在渲染前将字符串解析回字典；如果直接调用 `tokenizer.apply_chat_template`，请将 `arguments` 作为字典传入（并可选地将 `reasoning_content` 作为字符串传入），否则模板会抛出异常。
- 通过 `extra_body={"chat_template_kwargs": {"enable_thinking": False}}`（OpenAI Python 客户端）禁用思考，这会将模板切换到 `/nothink` + 预填 `<think></think>` 路径。

## 解析说明与陷阱 \{#parsing-notes--gotchas}

- **字符串值不带引号；确定类型需要模式。** 决定性规则：当且仅当参数在工具的 JSON Schema 中为字符串类型时，`<arg_value>` 才是字面字符串；否则为 JSON。vLLM 的 `_is_string_type` 和 SGLang 的 `get_argument_type` 都遍历 `properties[arg].type`（处理 `anyOf`/`oneOf`/`enum`/`allOf`/类型数组）。如果模式缺失/宽松，它们回退到“尝试 `json.loads`，再尝试 `ast.literal_eval`，然后视为字符串”，因此 `celsius` 这样的裸词会保留为字符串，而 `26` 会变为数字。一个_看起来_像 JSON 的字符串值（例如类型为 `string`、值为 `{"a":1}` 的参数），正是因为模式声明为 `string`，才会正确保留为字面字符串。
- **提取正则表达式（GLM-4.5/4.6）。** vLLM：通过 `<tool_call>.*?</tool_call>`（DOTALL）提取调用；通过 `<tool_call>([^\n]*)\n(.*)</tool_call>` 提取名称/主体；通过 `<arg_key>(.*?)</arg_key>\s*<arg_value>(.*?)</arg_value>` 提取元素对。名称正则表达式**要求名称后有换行**，与 4.5/4.6 模板一致。SGLang 使用等价的 `(?:\\n|\n)` 形式，因此也允许字面转义的 `\n`。
- **值中的 `</arg_value>` 会破坏解析。** 值以非贪婪方式捕获到下一个 `</arg_value>`；文本包含 `</arg_value>`（或 `</tool_call>`）的值会提前截断。传输格式中没有转义机制。
- **工具调用只从 `content` 解析，不从推理解析。** 在 `<think>…</think>` 内输出的 `<tool_call>` 会被工具解析器忽略（vLLM 的推理/工具解析器协同工作，只扫描 `</think>` 之后的内容）。不要期待“思考时”发出的调用会触发。
- **GLM 会抑制引导解码。** 对于 `tool_choice: "required"` 或具名工具，vLLM 有意**不**应用 JSON 结构化输出/引导解码，因为那会强制 JSON 输出，与 GLM 的 XML 语法冲突；解析器改为从自由形式 XML 中提取。
- **必须关闭 `skip_special_tokens`。** 尽管工具/思考标签是 `special: false`，vLLM 仍会在启用工具时强制 `skip_special_tokens = False`（防范 transformers 5.x 反分词变化），让字面的 `<tool_call>`/`</tool_call>` 文本保留下来供正则表达式使用。
- **流式传输。** 长字符串参数过去会缓冲到结束标签（vLLM issue #32829）；当前解析器在每次增量时重新解析累积文本，只输出差异，以先开引号再填充的策略流式输出增量字符串内容，并暂缓任何不完整的尾部标签（`partial_tag_overlap`）。流式工具名称是第一个 `\n` 或 `<arg_key>` 之前的文本。SGLang 以显式 XML→JSON 状态机（`INIT → IN_KEY → WAITING_VALUE → IN_VALUE`）实现相同行为。格式错误的尾部（`</tool_call>` 前缺少 `</arg_value>`）会以启发式方式闭合。
- **版本沿革：GLM-4.5 与 GLM-4.6：** 传输格式相同，`chat_template.jinja` 相同（内容哈希相同）；相同的 `glm45` 解析器服务于两者。
- **版本沿革：GLM-4.7 / GLM-5 改变了格式。** 较新的模型可能省略结构性换行：函数名称可以直接位于第一个 `<arg_key>` 前面，零参数调用可以是 `<tool_call>func</tool_call>`，并行调用可以直接相邻。vLLM/SGLang 要求对此变体使用各自独立的 GLM-4.7 解析器。omp 的仓库扫描器有意支持更广的范围：它接受换行、`<arg_key>` 或 `</tool_call>` 作为名称分隔符，因此同一个 `glm` 方言扫描器可以处理两种布局。

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

仓库的 `glm` 方言是一个**自有带内转换器**。将 `tools.format` 设为 `glm` 可强制使用它。当配置的方言解析器没有返回自有方言时，会查询 `PI_DIALECT=glm`（也接受 `1` 或 `true`）。默认的 `auto` 使用原生调用，除非 `supportsTools === false`，此时选择模型类别方言；GLM 关联和未知类别回退均选择 `glm`。有工具时，智能体附加紧凑的规范化工具目录和 GLM 指南，省略原生工具/`tool_choice`，重写历史，并将助手文本投影回规范的 pi 事件。

自有渲染器始终输出 GLM-4.5 换行布局。它查询每个工具的规范化模式：纯字符串属性原样输出，其他所有值进行 JSON 序列化。并行调用以换行分隔。在自有历史中，结果批次变为包含 `<observation>` 的合成用户消息，其中每个结果对应一个 `<tool_response>`；底层 GLM 会话记录渲染器则使用模型原生的 `<|observation|>` 角色标记。

这是两条独立路径：`encodeInbandToolHistory` 将带调用的助手轮次转换为普通文本加调用块，丢弃其思考/图片块；不带调用的助手轮次保持不变，结果图片位于合成用户消息的文本之后。`renderTranscript` 将 developer 映射为 system，渲染所有提供的助手思考，不采用上游模板的最后用户裁剪或空思考预填，也不附加生成提示词。两条路径都不会向用户文本注入 `/nothink`。

`GLMInbandScanner` 合成 `ptc_…` id，在名称分隔符到达时输出 `toolStart`，并将参数主体作为带键的 `toolArgDelta` 事件流式输出。模式属性收集的类型在移除 null 后若只有字符串，则保持原样；其他所有完整值在去除首尾空白后使用严格的 `JSON.parse`，失败时回退为原始文本。这不是参考解析器的 Python 字面量回退。

在 EOF 处，没有分隔符的非空名称会被接受为零参数调用，并在没有 `</tool_call>` 的情况下同时输出开始/结束。其他未完成调用可能不输出结束：未完成的键/值可能使扫描器丢弃其私有调用状态，但已发布的开始/增量不会撤回。正常停止可能保留并分派该规范调用；其流式参数保持为原始字符串，直到 `toolEnd` 将其替换为解码后的对象。

修复限于以下情况：`</arg_key>` 错误地结束一个值，且后面跟着另一个键、工具结束符或真正的值结束符；以及完整的下一键/值开始符之前缺少值结束符。未闭合值内部的裸 `</tool_call>` 本身不是修复特征。

思考解析默认启用，将 `<think>…</think>` 排除在可见文本之外。设置 `parseThinking: false` 时，思考标记保持可见，其中的调用也可能被扫描。独立的 `<tool_response>` 会使扫描器丢弃当前缓冲块的其余部分。自有流跨块检测该伪造结果边界，并丢弃整个后续内容；`tools.abortOnFabricatedResult` 默认为 `true`，会在该处中止模型提供方（为 false 时则读完输出）。如果模型提供方输出具名原生调用，它们仍会被转发；最先出现的原生/带内通道生效。

## 来源 \{#sources}

- OMP 实现：`packages/ai/src/dialect/glm.ts`、`coercion.ts`（`buildArgShapes`、`decodeValue`）、`history.ts`、`owned-stream.ts`、`catalog.ts`；选择：`packages/catalog/src/identity/dialect.ts`、`packages/coding-agent/src/sdk.ts`（`resolveDialect`）、`packages/agent/src/agent-loop.ts`（`resolveOwnedDialectFromEnv`）。
- 聊天模板（权威来源；在本地渲染以生成字节精确的流），GLM-4.5 提交 `cbb2c7c…`：https://huggingface.co/zai-org/GLM-4.5/resolve/main/chat_template.jinja ，`blob`/网页路径重定向到模型卡 API；通过原始 `resolve/main` 缓存核验。
- 相同的 GLM-4.6 模板（内容哈希相同，确认共用格式）：https://huggingface.co/zai-org/GLM-4.6/resolve/main/chat_template.jinja
- 特殊 token ID 和 `special` 标志（`added_tokens_decoder`、`additional_special_tokens`）：https://huggingface.co/zai-org/GLM-4.5/resolve/main/tokenizer_config.json
- 停止 token（`eos_token_id = [151329, 151336, 151338]`）：https://huggingface.co/zai-org/GLM-4.5/resolve/main/generation_config.json
- 模型卡（服务器标志 `--tool-call-parser glm45 --reasoning-parser glm45`、`enable_thinking` 开关、解析器链接）：https://huggingface.co/zai-org/GLM-4.5
- vLLM GLM-4.5/4.6 工具解析器（`Glm4MoeModelToolParser`：正则表达式、模式驱动的字符串类型判断、JSON 字符串 `arguments`、流式传输、`skip_special_tokens`）：https://github.com/vllm-project/vllm/blob/main/vllm/tool_parsers/glm4_moe_tool_parser.py
- vLLM GLM-4.7 工具解析器（`Glm47MoeModelToolParser`：同一行名称、可选/零参数）：https://github.com/vllm-project/vllm/blob/main/vllm/tool_parsers/glm47_moe_tool_parser.py
- SGLang GLM-4.5/4.6 检测器（`Glm4MoeDetector`：格式文档字符串、XML→JSON 状态机、参数类型判断）：https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/function_call/glm4_moe_detector.py
- SGLang GLM-4.7 检测器（`Glm47MoeDetector`：无换行 / 紧邻调用）：https://github.com/sgl-project/sglang/blob/main/python/sglang/srt/function_call/glm47_moe_detector.py
- vLLM 工具调用文档：https://docs.vllm.ai/en/latest/features/tool_calling/
