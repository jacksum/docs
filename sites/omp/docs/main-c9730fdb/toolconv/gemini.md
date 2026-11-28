---
title: "Gemini Python 风格工具调用格式（tool_code / default_api）"
description: "Oh My Pi 官方仓库文档：Gemini Python 风格工具调用格式（tool_code / default_api）。"
---

# Gemini Python 风格工具调用格式（`tool_code` / `default_api`） \{#gemini-pythonic-tool-calling-format-tool_code--default_api}

OMP 的 **`gemini` 自有方言**处理的 Python 风格文本约定，用于提示词驱动的 **Gemma 3** 工具调用，也见于格式错误的托管 **Gemini** 输出。调用是 `default_api.<function_name>(<kwargs>)` 这样的类 Python 表达式，可选用 `print(...)` 包装，位于带围栏的 ` ```tool_code ` 块内；结果通过 ` ```tool_outputs ` 块返回。这不是托管 Gemini 的原生 API 协议，后者使用结构化的 `functionCall` / `functionResponse` 部分。

下文的 OMP 行为依据 `packages/ai/src/dialect/gemini.ts`、共享渲染辅助函数以及自有历史/流转换器。_来源_中列出的外部指南和格式错误调用报告提供了这种文本约定的背景。

## “特殊”token \{#special-tokens}

OMP 将这些标记作为字面解码文本进行匹配；其扫描器不检查分词器 ID。外围模型聊天模板可能有自己的控制 token。载荷标记如下：

| 标记（原样） | 作用 |
| --- | --- |
| ` ```tool_code ` | 开始一个包含类 Python 调用的围栏块，供应用解析，而不是作为 Python 执行。由 ` ``` ` 结束。 |
| ` ```tool_outputs ` | 开始一个将执行结果传回模型的围栏块。由裸 ` ``` ` 结束。 |
| `default_api` | 托管栈将无命名空间的工具归入的合成模块命名空间。调用形式为 `default_api.<name>(...)`。 |
| `print(...)` | 托管 Gemini 形式中调用的惯用包装（模型经过训练会“打印”调用）。没有语义作用，运行时解析调用，不执行 Python。 |

这种文本约定中**没有**每个调用的 id。原生 Gemini 思考摘要使用标记为 `thought: true` 的部分；`thoughtSignature` 是不透明的重放元数据，本身不标识思考部分。

> **OMP 方言说明：**`gemini` 方言为带内推理添加了带围栏的 ` ```thinking ` 块。其开始标记要求换行，除非设置 `parseThinking: false`，否则启用解析。思考结束匹配器保留嵌套的带语言标签的 Markdown 围栏；裸嵌套反引号围栏与外层结束符无法区分。未终止的思考在刷新时结束。这是 OMP 约定，不是原生 Gemini API 格式。

## 角色 / 轮次结构 \{#roles--turn-structure}

Python 风格载荷独立于封装，而封装因部署方式而异：

- **托管 Gemini** 使用 `contents[]`（`role: "user" | "model"`）。原生工具是结构化部分；改用这种文本约定时，其块位于轮次文本中。
- **Gemma 3**（开放权重）使用 Gemma 聊天模板（`<start_of_turn>user … <end_of_turn>` / `<start_of_turn>model`）；工具提示词添加到第一个用户轮次前面，块位于模型/用户轮次内部。

本文规定的是**载荷**（两个围栏块 + Python 调用形式）；外围轮次 token 属于承载它的模板。

## 工具定义 \{#tool-definitions}

工具在提示词中以 JSON-Schema 目录声明。Gemma 3 官方指南提供**两个**可互换的系统提示词模板，差别仅在于如何要求模型作答：

1. **Python 风格**（本规范针对的形式）：

   > 你可以使用函数。如果决定调用任何函数，你必须采用 `[func_name1(params_name1=params_value1, params_name2=params_value2...), func_name2(params)]` 格式
   > 如果调用函数，你不应在响应中包含任何其他文本

2. **JSON**（同类约定，密切相关的 Hermes 形式见 `qwen3.md`）：
   > … 你必须采用 `{"name": function name, "parameters": dictionary of argument name and its value}` 格式

OMP 的自有提示词在 `<tools>` 内以每行一个紧凑 OpenAI 风格 JSON 对象（`{"type":"function","function":{name,description,parameters}}`）声明工具，使用每个工具的规范化传输模式，后接 Gemini 格式指南。原生 Gemini 请求则使用 `functionDeclarations`。OMP 的文本渲染器输出不带 `print` 的 `default_api.NAME(...)`；其扫描器也接受下列带包装和裸调用变体。

## 工具调用格式 \{#tool-call-format}

一个调用是一个 Python 调用表达式。托管 Gemini 通常对 `default_api` 方法输出一个 `print()`：

````text
```tool_code
print(default_api.get_current_temperature(location="London", unit="celsius"))
```
````

以下各项都是实际出现过且在不同 Gemma/Gemini 变体中可接受的等价形式；健壮的解析器会将它们规范化为 `{name, arguments}`：

- `print(default_api.NAME(KWARGS))`：托管 Gemini 报告中出现的包装形式。
- `default_api.NAME(KWARGS)`：`print`/命名空间是可选的语法糖。
- `NAME(KWARGS)`：裸调用（Gemma 3 Python 风格提示词）。
- `result = NAME(KWARGS)`：赋值形式（Gemma 3 文档使用 `result = convert(...)`）。

参数值是 **Python 字面量**，不是 JSON：

| Python 字面量 | 示例 | 解码后 |
| --- | --- | --- |
| 字符串 | `'London'` 或 `"London"` | `"London"` |
| 整数 / 浮点数 | `42`、`3.14` | `42`、`3.14` |
| 布尔值 | `True` / `False` | `true` / `false` |
| 空值 | `None` | `null` |
| 列表 | `["a", "b"]` | `["a","b"]` |
| 字典 | `{"k": 1}` | `{"k":1}` |

字符串使用 Python 转义（`\n`、`\t`、`\\`、`\'`、`\"`）；托管 Gemini 输出单引号（`location='London'`），Gemma 示例使用双引号，两者都有效。参数采用关键字形式（`name=value`）；不使用位置参数，因为运行时映射到具名模式。

## 多个 / 并行工具调用 \{#multiple--parallel-tool-calls}

单个 `tool_code` 块内有两种编码方式：

- **OMP / Gemma 3 Python 风格形式**：调用表达式组成的 Python **列表**。两个或更多调用时，OMP 渲染这种形式：
   ````text
   ```tool_code
   [default_api.get_current_temperature(location="London"), default_api.get_temperature_date(location="London", date="2024-10-01")]
   ```
   ````
- **托管 Gemini 变体**：**每行一条** `print(default_api...)` 语句：
   ````text
   ```tool_code
   print(default_api.get_current_temperature(location="London"))
   print(default_api.get_temperature_date(location="London", date="2024-10-01"))
   ```
   ````

OMP 扫描器按源码顺序从任一种形式中提取调用，跳过字符串和 Python 注释。它记录每个匹配的调用括号前的最后一个标识符，忽略 `print` 包装，并跳过已恢复调用的参数主体。它不求值 Python 表达式。每个解析出的调用都会获得合成的 `ptc_…` id；文本约定本身没有 id。

## 工具结果格式 \{#tool-result-format}

执行结果通过 ` ```tool_outputs ` 块返回模型。OMP 按调用顺序为每个结果渲染一个完整块；不会单独编码 `isError`。Gemma 3 文档也展示了赋值风格的值（`result = 92.3`），而不透明输出可以作为文本/JSON 返回：

````text
```tool_outputs
{"temperature": 26.1, "location": "London", "unit": "celsius"}
```
````

然后模型继续输出自然语言答案或另一个 `tool_code` 块。

## 端到端示例 \{#end-to-end-example}

````text
<user>
What's the temperature in London?

<model>
```tool_code
print(default_api.get_current_temperature(location="London", unit="celsius"))
```

<user>
```tool_outputs
{"temperature": 11.4, "location": "London", "unit": "celsius"}
```

<model>
It's currently 11.4°C in London.
````

## OpenAI 兼容 / 原生 API 映射 \{#openai-compatible--native-api-mapping}

- 托管 Gemini 的原生 API 返回结构化的 `functionCall` 部分（`{name, args, id?}`）。OMP 保留提供的唯一 id，或合成一个，保留 `thoughtSignature`，并且只有在模型的 `compat.supportsFunctionPartId` 允许时才回传调用/结果 id。`packages/ai/src/providers/google-shared.ts` 中的 `convertMessages` 使用原始调用的名称作为 `functionResponse` 的名称，并保留有效的同模型/模型提供方签名。原生结果载荷使用 `{output: text}` 或 `{error: text}`，不同于文本方言无类型的 `tool_outputs` 块。
- 从 OpenAI 兼容适配层解析时，每个恢复的调用变为 `tool_calls[i] = {id (server-minted), type:"function", function:{name, arguments:<JSON string>}}`，Python 关键字参数在该边界重新序列化为 JSON 字符串。
- 将结果作为部署方式对应的工具/`functionResponse` 轮次（托管），或下一用户轮次中的 `tool_outputs` 块（提示词驱动）传回。

## 解析说明与陷阱 \{#parsing-notes--gotchas}

- **类 Python 字面量，不是 Python 解释器。** 接受 `True`/`False`/`None`、单引号字符串和尾逗号。OMP 也接受 JSON 的 `true`/`false`/`null`。不支持的表达式保留为原始字符串，不进行求值。
- **移除包装。** 读取调用名称之前，规范化并去掉 `print(...)`、`default_api.`（或任意 `module.`）前缀，以及 `LHS =` 赋值。`print` 从不是工具名称。
- **扫描时跳过字符串内容。** `search(pattern="foo(")` 这样的调用在字符串内含有 `(`；简单的 `\w+\(` 扫描会误将 `foo` 识别为被调用者。应跟踪字符串状态，只将顶层 `(` 视为调用开始符。
- **围栏歧义。** `tool_code` 主体在第一个 ` ``` ` 子字符串处终止，即使它位于参数字符串内部或行中间。这与识别围栏的思考结束匹配器不同。
- **文本与原生调用。** 格式错误的托管响应可能暴露这种文本约定。如果模型提供方在未收到原生工具的情况下仍输出具名原生工具调用，OMP 的自有流也会转发它们；最先出现的原生/带内调用通道生效，防止重复分派。
- **OMP 流式行为。** 扫描器缓冲整个 `tool_code` 主体，并且只在结束围栏之后输出工具事件；不会流式输出部分参数。未终止的块在刷新时丢弃，而不是暴露为文本。位置参数和格式错误的关键字片段会被跳过。除了普通引号字符串，字面量解码器还接受 Python 的 raw/byte/unicode 前缀、三引号、八进制转义，以及 `\x`/`\u`/`\U` 转义。
- **会话记录渲染。** `renderTranscript` 用 `<bos>` 和 Gemma 风格的 `<start_of_turn>user|model` 轮次包装历史。`developer` 文本添加到下一个用户轮次前面，或在其间的助手/结果之前作为独立用户轮次输出；连续结果合并为一个用户轮次。思考位于可见文本和调用之前。目前，即使助手没有调用，也会获得空 `tool_code` 列表（`[]`）；渲染器不附加生成提示词。
- **自有请求历史。** `encodeInbandToolHistory` 独立于 `renderTranscript`：带调用的助手轮次变为普通文本加带围栏的调用块，丢弃其思考/图片块；不带调用的助手轮次保持不变。连续结果合并为一条合成用户消息，结果图片保留在文本之后。
- **伪造结果。** 自有流从 ` ```tool_outputs ` 起丢弃助手输出。`tools.abortOnFabricatedResult` 默认为 `true`，会在该处中止模型提供方；禁用它会读完模型提供方的输出，但仍丢弃该后续内容。
- **变体分歧。** Gemma **4** 使用 [gemma.md](./gemma.md) 中记录的 token 分隔花括号语法（`<|tool_call>call:NAME{…}<tool_call|>`），而不是这种 Python 风格文本方言。
- **Gemma 3 自动选择注意事项。** OMP 当前的系列关联将每个识别出的 Gemma 版本，包括 Gemma 3，都映射到 `gemma` 方言。因此，当 Gemma 3 模型被标记为 `supportsTools: false` 并从原生工具回退时，`tools.format=auto` 会选择不兼容的 Gemma 4 语法。对于此处记录的 Python 风格 Gemma 3 约定，请显式设置 `tools.format=gemini`。

## 选择 \{#selection}

将 `tools.format` 设为 `gemini` 可强制使用此自有方言。默认的 `auto` 使用原生工具，除非 `supportsTools === false`，此时选择模型类别方言（未知类别回退到 GLM）。`preferredDialect` 将 Gemini 类别映射到 `gemini`，将 Gemma 类别映射到 `gemma`，不按 Gemma 版本区分。当智能体配置的解析器没有返回自有方言时，`PI_DIALECT=gemini` 作为回退；显式的自有设置优先。

有工具时，自有模式会将目录/指南附加到系统提示词，重写调用/结果历史，并从模型提供方请求中省略原生工具和 `tool_choice`。

## 来源 \{#sources}

- OMP 实现：`packages/ai/src/dialect/gemini.ts`、`fenced-thinking.ts`、`rendering.ts`、`catalog.ts`、`history.ts`、`owned-stream.ts`；选择：`packages/catalog/src/identity/dialect.ts`、`packages/coding-agent/src/sdk.ts`（`resolveDialect`）、`packages/agent/src/agent-loop.ts`（`resolveOwnedDialectFromEnv`）；原生映射：`packages/ai/src/providers/google-shared.ts`。
- Gemma 3 函数调用（两个推荐提示词）：https://ai.google.dev/gemma/docs/capabilities/function-calling
- Simon Willison，“使用 Gemma 进行函数调用”：https://simonwillison.net/2025/Mar/26/function-calling-with-gemma/
- Philipp Schmid，“Google Gemma 3 函数调用示例”：https://www.philschmid.de/gemma-function-calling
- Gemini 3 思考签名 + functionCall id：https://ai.google.dev/gemini-api/docs/gemini-3
- `default_api` / `tool_code` 泄漏证据：https://github.com/google/adk-go/issues/492 · https://github.com/google-gemini/cookbook/issues/929 · https://github.com/firebase/genkit/issues/2628 · https://discuss.ai.google.dev/t/gemini-2-flash-api-returns-raw-markdown-instead-of-function-call/71964
