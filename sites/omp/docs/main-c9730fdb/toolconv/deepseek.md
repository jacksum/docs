---
title: "DeepSeek 工具调用传输格式"
description: "Oh My Pi 官方仓库文档：DeepSeek 工具调用传输格式。"
---

# DeepSeek 工具调用传输格式 \{#deepseek-tool-calling-wire-format}

DeepSeek-V3、V3-0324、R1、R1-0528 和 V3.1 使用一种独特的聊天封装，由 `<｜begin▁of▁sentence｜>` 和 `<｜User｜>` 等**全角竖线** token 构成。其工具调用使用专用标记（`<｜tool▁calls▁begin｜>` … `<｜tool▁calls▁end｜>`）包围 JSON 参数。本文以 OMP 的 `deepseek` 方言输出的 **V3.1** 约定为中心，区分较早的 **V3-0324 / R1-0528** 编码，并介绍扫描器接受的较新的 XML 风格 [DSML 封装](#dsml-envelope-newer-deepseek-models)。V3.1 参考聊天模板与 OMP 的历史记录/会话记录渲染方式并不相同。

推理服务器通过聊天模板和工具调用解析器启用它：

- vLLM V3.1：`--enable-auto-tool-choice --tool-call-parser deepseek_v31 --chat-template examples/tool_chat_template_deepseekv31.jinja`（可选 `--reasoning-parser deepseek_r1`）。
- vLLM V3-0324 / R1-0528：`--enable-auto-tool-choice --tool-call-parser deepseek_v3 --chat-template examples/tool_chat_template_deepseekv3.jinja`（V3-0324）或 `tool_chat_template_deepseekr1.jinja`（R1-0528）。
- 模型自身的 `tokenizer_config.json` 中的 `chat_template`（以及与之相同的 `assets/chat_template.jinja`）会渲染 V3.1 封装、工具调用和工具输出；它**不会**合成 `## Tools` 声明块，因此 vLLM 提供了一个会生成该块的模板（见下文）。

> 核验依据：DeepSeek-V3.1 模型卡的“Chat Template”/“ToolCall”章节、`tokenizer_config.json` 和 `assets/chat_template.jinja` 中字节完全相同的 `chat_template`、`tokenizer.json` 中的 `added_tokens`（token ID）、`config.json`（bos/eos ID）、DeepSeek-V3-0324 和 DeepSeek-R1-0528 的 `tokenizer_config.json` 聊天模板、vLLM 的 `tool_chat_template_deepseekv31.jinja`，以及 vLLM 的工具调用/推理输出文档。

## 关于特殊 Unicode 的说明（不要替换为 ASCII） \{#a-note-on-the-unusual-unicode-do-not-substitute-ascii}

DeepSeek 的标记**不使用** ASCII 竖线 `|`（U+007C）或 ASCII 下划线 `_`。它们使用：

- `｜`：**U+FF5C FULLWIDTH VERTICAL LINE**，作为尖括号内侧的分隔符。
- `▁`：**U+2581 LOWER ONE EIGHTH BLOCK**（SentencePiece 的词边界字形），作为 token 内部_单词之间_的分隔符，例如 `begin▁of▁sentence`、`tool▁calls▁begin`。

因此，`<｜tool▁calls▁begin｜>` 是 `<` + `｜`(FF5C) + `tool` + `▁`(2581) + `calls` + `▁`(2581) + `begin` + `｜`(FF5C) + `>`。将这些 token 复制成 `<|tool_calls_begin|>`（ASCII 竖线 + 下划线）会产生模型训练时从未见过的 token，并在不报错的情况下破坏解析和生成。思考标签 `<think>` / `</think>` 不含竖线分隔符，而很少使用的 `<|EOT|>` 使用 ASCII 竖线。DSML 也接受一种 ASCII 竖线写法。

## 特殊 token \{#special-tokens}

Token ID 来自 DeepSeek-V3.1 的 `tokenizer.json`（`added_tokens`）；`vocab_size` 为 129280。`special` 列反映分词器的 `"special"` 标志（它控制 `skip_special_tokens`）；注意角色/思考/工具标记均为 `special: false`。

| Token（原样） | ID | `special` | 用途 |
| --- | --- | --- | --- |
| `<｜begin▁of▁sentence｜>` | 0 | true | BOS；在提示词的最开头添加一次。 |
| `<｜end▁of▁sentence｜>` | 1 | true | EOS；结束每个助手/工具轮次，也是停止 token。 |
| `<｜▁pad▁｜>` | 2 | true | 填充（`pad_token`；模型卡/配置也将 EOS 复用为填充）。 |
| `<｜search▁begin｜>` | 128796 | false | 搜索智能体查询开始（思考模式搜索工具）。 |
| `<｜search▁end｜>` | 128797 | false | 搜索智能体查询结束。 |
| `<think>` | 128798 | false | 开始推理/思考区段。使用 ASCII 括号。 |
| `</think>` | 128799 | false | 结束推理区段；**在非思考模式下也会输出**（见下文）。 |
| `<｜fim▁hole｜>` / `<｜fim▁begin｜>` / `<｜fim▁end｜>` | 128800-128802 | false | 中间填充（非聊天）。 |
| `<｜User｜>` | 128803 | false | 用户角色标记。 |
| `<｜Assistant｜>` | 128804 | false | 助手角色标记。 |
| `<\|EOT\|>` | 128805 | true | 轮次结束（旧版；使用 ASCII 竖线，在聊天中很少使用）。 |
| `<｜tool▁calls▁begin｜>` | 128806 | false | 开始助手的一批工具调用。 |
| `<｜tool▁calls▁end｜>` | 128807 | false | 结束这批工具调用。 |
| `<｜tool▁call▁begin｜>` | 128808 | false | 开始批次中的单个工具调用。 |
| `<｜tool▁call▁end｜>` | 128809 | false | 结束单个工具调用。 |
| `<｜tool▁outputs▁begin｜>` | 128810 | false | 开始一批工具结果（**仅限 R1-0528 / V3-0324**）。 |
| `<｜tool▁outputs▁end｜>` | 128811 | false | 结束一批工具结果（**仅限 R1-0528 / V3-0324**）。 |
| `<｜tool▁output▁begin｜>` | 128812 | false | 开始单个工具结果。 |
| `<｜tool▁output▁end｜>` | 128813 | false | 结束单个工具结果。 |
| `<｜tool▁sep｜>` | 128814 | false | 工具调用内部的分隔符（位于名称和参数之间）。 |

`config.json` 确认了 `bos_token_id: 0`、`eos_token_id: 1`。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

没有 OpenAI 风格的 `system`/`developer` 通道 token。角色是行内标记，提示词是一个扁平字符串：

```text
<｜begin▁of▁sentence｜>{system_prompt}<｜User｜>{query}<｜Assistant｜>{response}<｜end▁of▁sentence｜>
```

- **系统提示词**没有标记。所有 `system` 消息会拼接起来（有多个时用 `\n\n` 连接），紧接在 `<｜begin▁of▁sentence｜>` 后输出，位于第一个 `<｜User｜>` 之前。有工具时，`## Tools` 块会附加到这段系统文本后（用 `\n\n` 分隔）。
- **用户轮次**：`<｜User｜>` + 内容。（V3.1 中用户文本后没有 EOS；助手标记直接跟在后面。）
- **助手轮次**：以 `<｜Assistant｜>` 开始，接着是思考标签，再是内容，最后是 `<｜end▁of▁sentence｜>`。
- **思考与非思考（V3.1 混合模式）**：由模板选择，而不是由模型选择：
   - 非思考生成前缀：`…<｜Assistant｜></think>`，模型从一个无需自己开启的 `</think>` _之后_开始。与 DeepSeek-V3 不同，V3.1 始终注入这个 `</think>`。
   - 思考生成前缀：`…<｜Assistant｜><think>`，模型输出思维链，用 `</think>` 结束，然后输出答案。
   - 在多轮上下文中，**每个**已存储的助手轮次都保留一个 `</think>`；只有最后一轮开头的思考标签反映所请求的模式。渲染已存储的助手消息时，会先从 `content` 中移除截至 `</think>`（含该标签）的所有文本，再重新输出（模板执行 `content.split('</think>', 1)[1]`）。
- **工具调用在非思考模式下运行。** 模型卡写明“非思考模式支持工具调用”，V3.1 工具模板以 `<｜Assistant｜></think>` 开始工具调用轮次。在 vLLM 中，V3.1 推理默认禁用；通过 `chat_template_kwargs={"thinking": true}` 启用。
- **搜索智能体通道**：一种独立的思考模式协议，使用 `<｜search▁begin｜>` / `<｜search▁end｜>`（见模型卡的 `assets/search_tool_trajectory.html`）；不属于普通函数调用的范围。

## 工具定义 \{#tool-definitions}

工具通过**注入系统区域的 Markdown 块**声明（位于系统提示词之后、第一个 `<｜User｜>` 之前）。`tokenizer_config.json` 中的聊天模板不会根据 `tools=[…]` 参数构建这个块；它由调用方（或 vLLM 的 `tool_chat_template_deepseekv31.jinja`）构造。按 DeepSeek-V3.1 模型卡原样复现，完整布局为 `<｜begin▁of▁sentence｜>{system prompt}\n\n{tool_description}<｜User｜>{query}<｜Assistant｜></think>`，其中 `{tool_description}` 为：

```text
## Tools
You have access to the following tools:

### {tool_name1}
Description: {description}

Parameters: {json.dumps(parameters)}

IMPORTANT: ALWAYS adhere to this exact format for tool use:
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>tool_call_name<｜tool▁sep｜>tool_call_arguments<｜tool▁call▁end｜>{additional_tool_calls}<｜tool▁calls▁end｜>

Where:
- `tool_call_name` must be an exact match to one of the available tools
- `tool_call_arguments` must be valid JSON that strictly follows the tool's Parameters Schema
- For multiple tool calls, chain them directly without separators or spaces
```

每个工具提供一个 `### {name}` 章节，包含一行 `Description:` 和一行 `Parameters: {…}`，后者的值是 JSON-Schema 参数对象的紧凑 JSON（模型卡中为 `json.dumps(parameters)`，vLLM 模板中为 `parameters | tojson`）。`IMPORTANT:` 指令块在最后一个工具后附加一次。

## 工具调用格式 \{#tool-call-format}

模型输出一个包含一个或多个调用的批次封装。每个调用都是 `name <｜tool▁sep｜> arguments`，其中 **arguments 是原始 JSON 对象字符串**（无代码围栏）。最小单次调用（模型在 `<｜Assistant｜></think>` 前缀之后生成的内容）：

```text
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>get_weather<｜tool▁sep｜>{"location": "San Francisco, CA"}<｜tool▁call▁end｜><｜tool▁calls▁end｜>
```

语法（V3.1）：

```text
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>{name}<｜tool▁sep｜>{json_args}<｜tool▁call▁end｜>{…more calls…}<｜tool▁calls▁end｜>
```

- `{name}` 必须与所声明的工具名称完全一致。它位于**最前面**，紧跟在 `<｜tool▁call▁begin｜>` 之后。
- `{json_args}` 是符合工具参数模式的有效 JSON，直接内联。
- 随后模板/服务器用 `<｜end▁of▁sentence｜>` 结束整个助手轮次。

（V3.1 **没有** `type` 字段，参数外也**没有** ` ```json ` 围栏，那是较早的 R1/V3-0324 约定；见版本差异。）

## 多个 / 并行工具调用 \{#multiple--parallel-tool-calls}

所有调用都位于一个 `<｜tool▁calls▁begin｜>…<｜tool▁calls▁end｜>` 封装内。在第一个 `<｜tool▁call▁begin｜>…<｜tool▁call▁end｜>` 之后，每个额外调用都是**直接串接的另一个 `<｜tool▁call▁begin｜>…<｜tool▁call▁end｜>`，调用之间没有分隔符、换行或空格**（模型卡：“直接串接，不加分隔符或空格”）：

```text
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>get_weather<｜tool▁sep｜>{"location": "San Francisco, CA"}<｜tool▁call▁end｜><｜tool▁call▁begin｜>get_weather<｜tool▁sep｜>{"location": "Seattle, WA"}<｜tool▁call▁end｜><｜tool▁calls▁end｜>
```

注意，`<｜tool▁calls▁begin｜>`（复数，id 128806）恰好出现一次；每个调用使用单数形式的 `<｜tool▁call▁begin｜>`（id 128808）/ `<｜tool▁call▁end｜>`（id 128809）。

## 工具结果格式 \{#tool-result-format}

执行结果以 `tool` 角色消息传回。在 **V3.1** 中，每个结果都由单数形式的输出 token 包围，**没有**复数形式的 `<｜tool▁outputs▁…｜>` 封装，并紧接在助手工具调用轮次的 `<｜end▁of▁sentence｜>` 后输出：

```text
<｜tool▁output▁begin｜>{result_text}<｜tool▁output▁end｜>
```

`{result_text}` 是原始工具输出（通常是 JSON 字符串，但也可以是任意文本）。对于多个结果，V3.1 模板为每条 `tool` 消息输出一个 `<｜tool▁output▁begin｜>…<｜tool▁output▁end｜>`，直接拼接。**传输格式中没有工具调用 ID**，结果与调用按**位置**匹配（输出顺序 ↔ 调用顺序）。

随后，模型**直接在 `<｜tool▁output▁end｜>` 之后**生成最终答案，不带 `<｜Assistant｜>` 标记，也不带 `</think>`（见解析说明，V3.1 参考模板特意将工具后的助手内容渲染为 `content<｜end▁of▁sentence｜>`）。

> R1-0528 / V3-0324 则不同：结果包含在 `<｜tool▁outputs▁begin｜>` … `<｜tool▁outputs▁end｜>` 批次封装中，每个结果为 `<｜tool▁output▁begin｜>…<｜tool▁output▁end｜>`，多个结果以换行分隔。

## 端到端示例 \{#end-to-end-example}

一段完整的 DeepSeek-V3.1 **非思考**多轮交互。所有内容都是一个扁平字符串；行内 `←` 注释标出模型生成的起点（它们不是流的一部分）。`## Tools` 块内的空白是实际的换行。

```text
<｜begin▁of▁sentence｜>You are a helpful assistant.

## Tools
You have access to the following tools:

### get_weather
Description: Get the current weather for a location

Parameters: {"type": "object", "properties": {"location": {"type": "string", "description": "City and state, e.g. San Francisco, CA"}, "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}}, "required": ["location"]}

IMPORTANT: ALWAYS adhere to this exact format for tool use:
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>tool_call_name<｜tool▁sep｜>tool_call_arguments<｜tool▁call▁end｜>{additional_tool_calls}<｜tool▁calls▁end｜>

Where:
- `tool_call_name` must be an exact match to one of the available tools
- `tool_call_arguments` must be valid JSON that strictly follows the tool's Parameters Schema
- For multiple tool calls, chain them directly without separators or spaces
<｜User｜>What's the weather in San Francisco?<｜Assistant｜></think><｜tool▁calls▁begin｜><｜tool▁call▁begin｜>get_weather<｜tool▁sep｜>{"location": "San Francisco, CA", "unit": "celsius"}<｜tool▁call▁end｜><｜tool▁calls▁end｜><｜end▁of▁sentence｜><｜tool▁output▁begin｜>{"temperature": 18, "unit": "celsius", "condition": "Foggy"}<｜tool▁output▁end｜>It's currently 18°C and foggy in San Francisco.<｜end▁of▁sentence｜>
```

各区段的含义：

1. `<｜begin▁of▁sentence｜>` + 系统文本 + `\n\n` + `## Tools…` 块：提示词前缀。
2. `<｜User｜>What's the weather in San Francisco?`：用户轮次。
3. `<｜Assistant｜></think>`：非思考生成前缀（提示词）。**模型从这里开始生成。**
4. `<｜tool▁calls▁begin｜>…<｜tool▁calls▁end｜>`：模型的工具调用；服务器附加 `<｜end▁of▁sentence｜>`，并以 `finish_reason: "tool_calls"` 停止。
5. `<｜tool▁output▁begin｜>…<｜tool▁output▁end｜>`：执行得到的结果，附加到提示词中。
6. `It's currently 18°C and foggy in San Francisco.<｜end▁of▁sentence｜>`：**模型直接在工具输出后生成最终答案**（没有新的 `<｜Assistant｜>` 标记），以 EOS 结束。

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

在前面接入 OpenAI 兼容服务器时（例如使用 `--tool-call-parser
deepseek_v31` 的 vLLM）：

- **`finish_reason`**：模型输出 `<｜tool▁calls▁begin｜>…` 批次时为 `"tool_calls"`；否则为 `"stop"`。
- **`message.tool_calls[]`**：每个 `<｜tool▁call▁begin｜>…<｜tool▁call▁end｜>` 对应一个元素。
   - `.type` = `"function"`。
   - `.function.name` = `<｜tool▁call▁begin｜>` 与 `<｜tool▁sep｜>` 之间的文本。
   - `.function.arguments` = `<｜tool▁sep｜>` 与 `<｜tool▁call▁end｜>` 之间的文本，以 **JSON 字符串**返回（遵循 OpenAI 规范），不是嵌套对象。模型已经在此处输出原始 JSON，因此直接透传。
   - `.id` = **由服务器合成**（例如 `chatcmpl-tool-…`）。DeepSeek 的传输格式不携带调用 ID。
- **工具结果消息**：`{"role": "tool", "tool_call_id": "<id>", "content": "<result>"}`。服务器将 `content` 渲染为 `<｜tool▁output▁begin｜>…<｜tool▁output▁end｜>`。由于提示词没有 ID，`tool_call_id` 仅用于客户端记录；**模型依赖顺序**，因此请保持结果与调用的对应顺序。
- **助手重放**：将带有 `tool_calls` 的先前助手轮次发回时，模板会内联 `function.arguments`。HF 参考模板**原样**内联它（假定它已经是 JSON 字符串）；vLLM 的 `tool_chat_template_deepseekv31.jinja` 则将它传入 `| tojson`。按照 OpenAI 规范，将 `arguments` 作为 JSON **字符串**发送（参见下文有关二次编码的陷阱）。

## 解析说明与陷阱 \{#parsing-notes--gotchas}

- **Unicode 至关重要。** 精确匹配 `｜` = U+FF5C 和 `▁` = U+2581。ASCII 形式的 `<|tool_calls_begin|>` 不会被分词为这些特殊 token。`<think>`/`</think>` 使用 ASCII 括号；少见的 `<|EOT|>` 使用 ASCII 竖线。
- **工具/角色标记为 `special: false`。** 只有 `<｜begin▁of▁sentence｜>`、`<｜end▁of▁sentence｜>`、`<｜▁pad▁｜>` 和 `<|EOT|>` 标记为 `special: true`。因此，使用 `skip_special_tokens=True` 解码**不会**移除 `<｜tool▁calls▁begin｜>`、`<｜tool▁sep｜>`、`<｜Assistant｜>`、`</think>` 等，它们会留在解码后的字符串中，供解析器查找。（反过来说，不要假定特殊 token 过滤会移除它们。）
- **V3.1 中没有代码围栏 / 没有 `type` 字段。** R1/V3-0324 语法（`function<｜tool▁sep｜>name` + ` ```json ` 块）不同于 V3.1 的 `name<｜tool▁sep｜>raw_json`。OMP 两者都接受，但仅支持一种语法的解析器并不如此。
- **V3.1 串接调用时没有分隔符。** 调用直接相邻：`…<｜tool▁call▁end｜><｜tool▁call▁begin｜>…`。不要按换行/空白拆分；应按 `<｜tool▁call▁begin｜>` / `<｜tool▁call▁end｜>` 边界拆分。（R1/V3-0324 在每个后续调用前放置一个 `\n`。）
- **传输中没有工具调用 ID。** 按位置将结果与调用匹配。服务器必须为 OpenAI 结构生成合成的 `tool_call_id`。
- **即使在非思考模式下也会出现 `</think>`。** 在将剩余部分视为可见答案之前，移除开头的 `</think>`（以及之前的所有推理）；模板在重放已存储轮次时执行 `content.split('</think>', 1)[1]`。
- **工具后的生成提示词特性。** V3.1 参考聊天模板只有在**最后一条消息为 `user`** 时才附加 `<｜Assistant｜></think>` 生成前缀。在 `tool` 消息后，它不附加任何内容，模型直接在 `<｜tool▁output▁end｜>` 后继续。对以工具结果结尾的对话重新应用模板的智能体循环，不得期待那里有助手标记（也不得重复插入）。
- **`arguments` 的二次编码风险。** 重放时，vLLM 示例模板应用 `arguments | tojson`。如果 `arguments` 已经是 JSON 字符串（OpenAI 约定），这个管道会再次对该字符串进行 JSON 编码（加上引号并转义）。模板预期 `| tojson` 时传入对象，模板原样内联时传入字符串，应匹配实际运行的模板。
- **流式传输。** 工具调用逐 token 到达；名称直到 `<｜tool▁sep｜>` 处才完整，参数在 `<｜tool▁call▁end｜>` 之前都是不完整的 JSON。按调用边界缓冲；不要在工具调用结束 token 之前尝试对参数执行 `json.loads`。
- **格式错误的输出。** 使用 `tool_choice="auto"` 且没有结构标签约束（`VLLM_ENFORCE_STRICT_TOOL_CALLING=false`）时，模型可能在 `tool_call_arguments` 中输出无效 JSON，或输出与任何工具都不匹配的 `tool_call_name`；解析器尽力提取。指定名称/`required` 工具选择使用结构化输出后端，保证参数符合模式。

## 版本差异：V3.1 与 V3-0324 / R1-0528 \{#version-differences-v31-vs-v3-0324--r1-0528}

V3.1 之前的模型（DeepSeek-V3-0324 和 DeepSeek-R1-0528）共用一种较早的工具调用编码，在 vLLM 中通过 `--tool-call-parser deepseek_v3` 提供服务。每个调用的主体为：

````text
<｜tool▁call▁begin｜>function<｜tool▁sep｜>{name}
```json
{json_args}
```<｜tool▁call▁end｜>
````

与 V3.1 的差异：

| 方面 | V3.1（`deepseek_v31`） | V3-0324 / R1-0528（`deepseek_v3`） |
| --- | --- | --- |
| 调用中的字段顺序 | `{name}<｜tool▁sep｜>{args}` | `function<｜tool▁sep｜>{name}`（先是字面 `type`，再是名称） |
| 参数包装 | 原始 JSON，内联 | 带围栏的 ` ```json … ``` ` 块（名称与参数用 `\n` 分隔） |
| 调用串接 | 直接相邻，**无分隔符** | 每个后续调用前加 `\n` |
| 工具结果 | 每条消息为 `<｜tool▁output▁begin｜>…<｜tool▁output▁end｜>`，无批次封装 | 包在 `<｜tool▁outputs▁begin｜>…<｜tool▁outputs▁end｜>` 中，结果以换行分隔 |
| 用户→助手边界 | 用户轮次 = `<｜User｜>{q}`；生成时添加 `<｜Assistant｜></think>` | 用户轮次 = `<｜User｜>{q}<｜Assistant｜>`（在用户分支中附加助手标记） |
| 思考 | 混合模式；`thinking` 关键字参数切换 `<think>` 与 `</think>` 前缀 | R1-0528 始终推理（生成前缀是裸 `<｜Assistant｜>`，模型自行开启 `<think>`）；V3-0324 不推理 |
| vLLM 解析器 | `--tool-call-parser deepseek_v31` | `--tool-call-parser deepseek_v3` |

R1-0528 / V3-0324 并行调用及其结果批次示例：

````text
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>function<｜tool▁sep｜>get_weather
```json
{"location": "San Francisco, CA"}
```<｜tool▁call▁end｜>
<｜tool▁call▁begin｜>function<｜tool▁sep｜>get_weather
```json
{"location": "Seattle, WA"}
```<｜tool▁call▁end｜><｜tool▁calls▁end｜><｜end▁of▁sentence｜><｜tool▁outputs▁begin｜><｜tool▁output▁begin｜>{"temperature": 18}<｜tool▁output▁end｜>
<｜tool▁output▁begin｜>{"temperature": 14}<｜tool▁output▁end｜><｜tool▁outputs▁end｜>
````

`deepseek_r1` **推理**解析器（`--reasoning-parser deepseek_r1`）适用于 R1 系列，**也**适用于 DeepSeek-V3.1；它将 `<think>…</think>` 区段提取到响应的 `reasoning` 字段中。它独立于工具调用解析器。

## DSML 封装（较新的 DeepSeek 模型） \{#dsml-envelope-newer-deepseek-models}

较新的 DeepSeek 模型（例如 `deepseek-v4-pro`）使用第二种 XML 风格的封装 **DSML** 输出工具调用，而不是 `<｜tool▁calls▁begin｜>` 特殊 token 序列。标签名称复用相同的全角竖线（`｜`，U+FF5C），但主体是 Anthropic 风格的 `invoke` / `parameter` 块，而不是 `name<｜tool▁sep｜>{json}` 对：

```text
<｜DSML｜tool_calls>
<｜DSML｜invoke name="get_weather">
<｜DSML｜parameter name="location" string="true">San Francisco, CA</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
```

- 一个 `<｜DSML｜tool_calls>…</｜DSML｜tool_calls>` 封装容纳一个或多个 `<｜DSML｜invoke name="…">…</｜DSML｜invoke>` 调用；标签间的空白无关紧要。
- 每个参数都是一个 `<｜DSML｜parameter name="…" string="…">value</｜DSML｜parameter>`。`string` 默认为 `"true"`（值保留为原始字符串）；`string="false"` 将值解析为 JSON，因此 `…string="false">15</…>` 解码为数字 `15`。
- 传输中除了全角形式，也会出现 ASCII 竖线变体（`<|DSML|tool_calls>`、`<|DSML|invoke …>`、`<|DSML|parameter …>`）。
- OpenAI 兼容宿主可能将这种封装泄漏到可见 `content` 中，而不是返回结构化的 `tool_calls`。OMP 的原生修复与选择自有 `deepseek` 方言相互独立；是否启用 DSML 恢复由其兼容性策略决定。

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

仓库的 `deepseek` 方言是一个**自有带内转换器**，不是 vLLM 解析器的包装器。通过 `PI_DIALECT=deepseek` 或智能体的 `dialect`/`getDialect` 配置选择它。有工具时，智能体会将方言指南和紧凑工具目录附加到系统提示词，从请求中移除模型提供方的原生工具，使用此语法重新编码先前的调用/结果，并将流式助手文本扫描回规范的 pi 事件。目录每行是一个 OpenAI 风格的 JSON 函数定义，不是上面展示的模型卡 `## Tools` 块。

当前扫描器接受上述三种形式：

- V3.1 的 `name<｜tool▁sep｜>{json}` 调用；
- 旧版的 `function<｜tool▁sep｜>name` 加带围栏的 JSON 主体；以及
- DSML `tool_calls` 封装内的全角或 ASCII DSML `invoke` / `parameter` 块。

V3.1/旧版的 `<｜tool▁call▁begin｜>` 也可以出现在复数封装之外。这些形式的名称会去除首尾空白。DSML 开始标签要求双引号括起的 `name="…"` 属性；没有 `tool_calls` 封装的裸 DSML `invoke` 不会被识别。DSML 值是原始文本，不进行 XML 实体解码，且除非标签恰好具有 `string="false"`，否则均为字符串。扫描器不验证工具名称或模式；验证/执行发生在下游。

对于 V3.1 调用，扫描器在 `<｜tool▁sep｜>` 使名称完整时输出 `toolStart`；旧版调用会等到 ` ```json ` 围栏使名称完整。两者都将参数缓冲到 `<｜tool▁call▁end｜>`，然后输出 `toolEnd`，其中的参数经过修复式 JSON 解码。已完成的参数若缺失、无效或不是对象，会变为 `{}`。

刷新不会为未完成的调用输出 `toolEnd`。不过，一旦投影出 `toolStart`，规范调用就会保留下来，正常停止的轮次可能会分派它：未完成的 V3.1/旧版调用保留 `{}`，而 DSML 调用保留已通过 `toolArgDelta` 发布的参数文本，不进行结束时的强制转换。`length` 停止不可执行。DSML 是增量处理的：参数主体文本作为这些增量流式输出。在完整的参数结束标签处，`string="false"` 的值会经过修复式 JSON 解码，失败时回退为原始文本。完整对象会在 `</｜DSML｜invoke>`（或其 ASCII 等价形式）处替换不完整的原始字符串。调用 ID 合成为 `ptc_…`。

扫描器从可见文本中移除泄漏的 DeepSeek 聊天模板控制 token 和尾部模板空白。孤立的 DSML `invoke`/`parameter` 结束标签也会被移除。默认情况下，它将 `<think>…</think>` 映射为思考事件；使用 `parseThinking: false` 时，它将主体输出为可见文本，但仍移除思考标签。未闭合的思考区段在 EOF 处结束。

渲染器输出 V3.1 调用，以无分隔符方式连接并行调用，并将多个结果渲染为以换行分隔的单数输出块。这些结果块只包含结果文本：不编码 id、名称和 `isError`。历史编码将连续结果归入一条 `user` 消息，并将结果图片保留为文本之后的独立图片块。带工具调用的助手轮次重放为普通文本加已渲染的调用，不带其思考块。

独立会话记录渲染器以 `<｜begin▁of▁sentence｜>` 开始，将每个助手轮次渲染为 `<｜Assistant｜>` + 思考/文本/调用 + `<｜end▁of▁sentence｜>`，并且只对非空思考使用 `<think>…</think>`。它不会像 V3.1 参考模板那样添加非思考的 `</think>` 前缀，或省略结果后的助手标记。开发者文本无标记；用户轮次使用 `<｜User｜>`。

自有流会在 `<｜tool▁outputs▁begin｜>` 或 `<｜tool▁output▁begin｜>` 处截断伪造结果（默认中止），保留边界前的调用。如果仍有原生结构化调用到达，第一个真实的原生或带内调用会为该轮次选择通道，避免重复分派。

### 原生泄漏标记修复 \{#native-leaked-markup-healing}

OpenAI-completions 修复使用 `model.compat.streamMarkupHealingPattern`。目录默认在 `ollama`、`ollama-cloud`、`nvidia`、`deepseek`、`fireworks`、`nanogpt`、`opencode-go`、`openrouter`、`litellm` 和 `nous` 上将 DeepSeek 类模型设为 `dsml`；显式编写的兼容性配置可以覆盖该模式。原生 Ollama 适配器直接为 `model.identity.class === "deepseek"` 选择 `dsml`。

使用 `dsml` 模式的 `StreamMarkupHealing` 会委托给带有 `xmlTagset: "dsml"` 的 `XmlInbandScanner`，因此也使用相同的 `DeepSeekInbandScanner`。与自有流投影器不同，修复器只根据 `toolEnd` 重建调用：未完成的调用不会产生合成调用。修复后的调用获得 `call_…` id 和 JSON 字符串参数。上游块同时提供结构化工具调用时，OpenAI-completions 和 Ollama 适配器使用 `feedEventsWithoutCalls` 移除标记，而不合成重复调用。清理后的文本还会经过通用的泄漏思考修复器。DSML 可用于恢复，但不是自有方言输出的历史格式。

## 来源 \{#sources}

仓库实现：

- [DeepSeek 方言](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/deepseek.ts)：`DeepSeekInbandScanner`、V3.1 渲染器和会话记录渲染。
- [通用 XML 选择器](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/xml.ts)和[原生标记修复](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/utils/stream-markup-healing.ts)。
- [目录修复默认值](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/catalog/src/compat/resolve.ts)和 [DeepSeek 兼容性规则](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/catalog/src/compat/rules/classes/deepseek.kdl)。
- [自有流投影](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/owned-stream.ts)、[历史编码](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/history.ts)、[工具目录](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/catalog.ts)和[调用 ID 生成](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/coercion.ts)。
- [智能体请求准备](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/agent-loop.ts)。

外部格式参考：

- DeepSeek-V3.1 模型卡（Chat Template / ToolCall 章节）：<https://huggingface.co/deepseek-ai/DeepSeek-V3.1>
- DeepSeek-V3.1 `assets/chat_template.jinja`：<https://huggingface.co/deepseek-ai/DeepSeek-V3.1/resolve/main/assets/chat_template.jinja>
- DeepSeek-V3.1 `tokenizer_config.json`（`chat_template`，与 jinja 字节完全相同）：<https://huggingface.co/deepseek-ai/DeepSeek-V3.1/resolve/main/tokenizer_config.json>
- DeepSeek-V3.1 `tokenizer.json`（`added_tokens` → token ID 和 `special` 标志）：<https://huggingface.co/deepseek-ai/DeepSeek-V3.1/resolve/main/tokenizer.json>
- DeepSeek-V3.1 `config.json`（`bos_token_id`、`eos_token_id`、`vocab_size`）：<https://huggingface.co/deepseek-ai/DeepSeek-V3.1/resolve/main/config.json>
- DeepSeek-R1-0528 模型卡和 `tokenizer_config.json`（较早的工具格式）：<https://huggingface.co/deepseek-ai/DeepSeek-R1-0528> · <https://huggingface.co/deepseek-ai/DeepSeek-R1-0528/resolve/main/tokenizer_config.json>
- DeepSeek-R1 模型卡：<https://huggingface.co/deepseek-ai/DeepSeek-R1>
- DeepSeek-V3-0324 `tokenizer_config.json`（较早的工具格式）：<https://huggingface.co/deepseek-ai/DeepSeek-V3-0324/resolve/main/tokenizer_config.json>
- vLLM 的 V3.1 工具调用模板（`## Tools` 注入 + `| tojson`）：<https://github.com/vllm-project/vllm/blob/main/examples/tool_chat_template_deepseekv31.jinja>
- vLLM 工具调用文档（`deepseek_v3`、`deepseek_v31` 解析器标志）：<https://docs.vllm.ai/en/latest/features/tool_calling/>
- vLLM 推理输出文档（`deepseek_r1` 推理解析器；V3.1 思考默认值）：<https://docs.vllm.ai/en/latest/features/reasoning_outputs/>
