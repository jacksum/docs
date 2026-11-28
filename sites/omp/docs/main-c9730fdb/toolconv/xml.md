---
title: "通用 XML 自有工具调用格式（<invoke> / <tool_response>）"
description: "Oh My Pi 官方仓库文档：通用 XML 自有工具调用格式（<invoke> / <tool_response>）。"
---

# 通用 XML 自有工具调用格式（`<invoke>` / `<tool_response>`） \{#generic-xml-owned-tool-calling-format-invoke--tool_response}

OMP 的 `xml` 方言是一种通用的、由提示驱动的带内协议。模型直接在助手文本中为每次工具调用写入一个 `<invoke>` 元素；OMP 解析这些调用，并在下一个用户轮次中为每个结果按顺序返回一个 `<tool_response>` 块。双方都不携带工具调用 ID，结果块也不携带工具名称，因此依靠顺序建立对应关系。

本参考文档描述了 `packages/ai/src/dialect/xml.ts` 实现的转换器。常规的 `tools.format: xml` 路径使用共享的 Anthropic 风格 invoke 扫描器。导出的扫描器 API 也可以选择 DeepSeek 的竖线包裹 DSML 标签集；下文单独介绍这一仅供扫描器使用的选项。

## 选择与请求转换 \{#selection-and-request-conversion}

在 `~/.omp/agent/config.yml`、项目配置或覆盖配置中选择方言：

```yaml
tools:
   format: xml
```

`tools.format: xml` 为会话强制启用通用 XML 自有方言。`auto` **不会**将通用 XML 用作未知模型家族的回退选项：当模型的 `supportsTools: false` 时，解析器会选择已知模型家族的方言，如果没有特定偏好则选择 GLM。需要这种语法时，请显式使用 `xml`。参见 [`tools.format`](../settings.md#tools-and-approvals)。

当配置未解析出自有方言时，也支持用 `PI_DIALECT=xml` 作为回退。选择 `native` 时应取消设置它，因为在 `tools.format` 解析为原生工具之后，它仍会生效。选择过程在每次请求时执行。

工具列表非空时，OMP 会从请求中移除原生结构化工具和工具选择，将带内目录和 XML 指南追加到系统提示中，把先前的调用和结果转换为文本，并将助手文本扫描回结构化工具调用事件。

## 工具定义与提示注入 \{#tool-definitions-and-prompt-injection}

OMP 注入共享的 `# Tools` 提示。可用函数列在 `<tools></tools>` 内，每行一个紧凑的 OpenAI 风格函数对象，使用各工具规范化后的传输模式：

```text
<tools>
{"type":"function","function":{"name":"read","description":"Read a file","parameters":{"type":"object","properties":{"path":{"type":"string"},"count":{"type":"number"}},"required":["path"]}}}
</tools>
```

目录后面是来自 `packages/ai/src/dialect/xml.md` 的 XML 专用指南。该指南要求使用已列出的函数名称、字面字符串正文、JSON 非字符串值、按序返回结果，并在模型停止前完成调用。调用是文本，绝不是原生 `tool_calls` JSON。

## 规范调用格式 \{#canonical-call-format}

一次调用对应一个 invoke：

```text
<invoke name="read"><parameter name="path">src/main.ts</parameter><parameter name="count">40</parameter></invoke>
```

| 元素 | 含义 |
| --- | --- |
| `<invoke name="TOOL">…</invoke>` | 一次工具调用。提示约定要求使用已列出的工具名称。 |
| `<parameter name="ARG">VALUE</parameter>` | 一个具名参数。 |
| `<tool_calls>…</tool_calls>` | 模型可选输出的包装器，指南和扫描器均接受；OMP 的渲染器不会添加它。 |

`renderAssistantToolCalls` 输出以换行分隔的连续 invoke，不带外层包装器。默认扫描器还接受作为包装器别名的 `<function_calls>`、带 `antml:` 前缀的 Anthropic 标签变体，以及不带包装器的 invoke。它接受的输入范围有意比规范渲染器的输出更宽。

OMP 渲染属性时，会对工具名称和参数名称进行 XML 转义。参数正文不做 XML 转义，因为这种格式通过分隔符匹配，而不是通过 XML DOM 解析。应写成 `a & b < c`，而不是 `a &amp; b &lt; c`；只有字面的 `</parameter>` 会与正文的结束分隔符冲突。

## 参数编码与强制转换 \{#argument-encoding-and-coercion}

渲染器使用提供的工具模式来决定某个值是否为字面字符串：

| 声明或值的类型 | 渲染后的正文 | 默认扫描器结果 |
| --- | --- | --- |
| 模式声明为字符串，且运行时值为字符串 | 原样输出，保留空白 | 原样字符串 |
| 模式按字符串处理的参数，其运行时值为非字符串 | JSON | 将该 JSON 文本保留为字符串 |
| 不按字符串处理的参数 | JSON，运行时字符串也带引号 | 有效时解析为 JSON |

示例：

```text
<invoke name="write"><parameter name="path">notes/a & b.txt</parameter><parameter name="options">{"append":false,"tags":["draft","xml"]}</parameter></invoke>
```

字符串分类使用提供的模式或显式的 `stringArgs` 回调。允许为 null 的字符串模式仍算字符串；枚举、常量和联合分支也参与类型检测。默认扫描器接受在每个参数上用 `string` 覆盖：

- `string="true"`（或除 `false`、`0`、`no` 以外的任何值）会强制将原始正文保留为字符串。
- `string="false"`、`string="0"` 或 `string="no"` 会强制进行 JSON 解析，即使模式声明为字符串也是如此。

非字符串正文会先去掉首尾空白，再交给 OMP 支持修复的 JSON 解析器。如果修复失败，原始正文会保留为字符串。空正文仍为空字符串。没有可用名称的参数会被丢弃。

扫描器不验证工具是否属于工具列表，也不验证完整的参数模式。参数名称重复时，会在调用完成时用后面的值覆盖前面的值。属性值不会进行实体解码，因此需要实体转义的工具名称或参数名称，无法像通过 XML 那样经由此分隔符解析器往返还原。

## 多次调用与并行调用 \{#multiple-and-parallel-calls}

OMP 将一批调用渲染为连续的 invoke：

```text
<invoke name="read"><parameter name="path">src/a.ts</parameter></invoke>
<invoke name="read"><parameter name="path">src/b.ts</parameter></invoke>
```

模型也可以选择给这批调用加上包装器：

```text
<tool_calls>
<invoke name="read"><parameter name="path">src/a.ts</parameter></invoke>
<invoke name="read"><parameter name="path">src/b.ts</parameter></invoke>
</tool_calls>
```

扫描器为每个 invoke 生成一个内部调用 ID；XML 中没有 ID。OMP 可以批量派发这些调用。结果必须保持调用顺序，因为 `<tool_response>` 既没有 ID，也没有名称。

## 工具结果格式 \{#tool-result-format}

OMP 将每个结果放在各自的块中返回：

```text
<tool_response>
file contents
</tool_response>
<tool_response>
ENOENT: file not found
</tool_response>
```

连续的结果块以换行分隔，并放入一条合成的 `user` 消息中。结果文本原样插入。工具结果中的图像块会保留在该消息渲染文本之后。

通用 XML 协议**没有成功或错误标记**。`renderToolResults` 有意将 `isError: true` 渲染成与成功结果相同的 `<tool_response>` 形状；错误必须能从其文本中看明白。模型绝不能自行生成 `<tool_response>`。

## 思考与可见文本 \{#thinking-and-visible-text}

OMP 将保留的思考渲染为：

```text
<thinking>
reasoning text
</thinking>
```

当输入完全由完整的 `<thinking>` 包装器组成时，`renderThinking` 和直接会话记录渲染器会先展平嵌套或相邻的包装器，再添加这对分隔符。对于含调用的助手消息，常规历史转换会保留正文和渲染后的调用，但会丢弃原始思考块。

常规自有工具流会启用 `parseThinking`。使用默认 Anthropic 标签集时，`<thinking>`、`<think>` 和 `<scratchpad>`（包括支持的带前缀形式）会转换为独立的思考事件，不出现在可见文本中。直接使用扫描器时，默认禁用思考解析；此时这些标签在包装器之外仍作为普通文本保留。包装器内的非调用文本会被丢弃。未终止的思考块会在 flush 时逻辑闭合，并保留其内容。

可见正文可以出现在无包装器的 invoke 之前或之间。在已识别的 `<tool_calls>` 或 `<function_calls>` 包装器内，非调用文本会被丢弃。

## 扫描器标签集 \{#scanner-tagsets}

`XmlInbandScanner` 根据 `InbandScannerOptions.xmlTagset` 委托给两个扫描器之一：

| `xmlTagset` | 扫描器 | 接受的调用语法 | 参数规则 |
| --- | --- | --- | --- |
| 省略或 `anthropic` | `AnthropicInbandScanner` | 普通或带 `antml:` 前缀的 `<invoke>/<parameter>`，可放在 `<tool_calls>` 或 `<function_calls>` 内 | 工具模式决定字符串；`string` 属性可覆盖 |
| `dsml` | `DeepSeekInbandScanner` | 竖线包裹的 DSML 封装和 invoke（以及该扫描器的 DeepSeek 标记语法） | 参数默认为字符串；只有 `string="false"` 会请求 JSON 强制转换 |

直接使用 API 的调用方可以请求 DSML 解析：

```ts
import { createInbandScanner } from "@oh-my-pi/pi-ai/dialect";

const scanner = createInbandScanner("xml", {
	xmlTagset: "dsml",
	parseThinking: true,
});
```

DSML 接受全角竖线标签：

```text
<｜DSML｜tool_calls>
<｜DSML｜invoke name="read">
<｜DSML｜parameter name="path" string="true">src/a.ts</｜DSML｜parameter>
<｜DSML｜parameter name="count" string="false">2</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
```

它也接受 ASCII 竖线等价形式，例如 `<|DSML|tool_calls>`。在 DSML 模式下，`string="false"` 会解析经修复的 JSON；无效 JSON 会回退为原始字符串。DSML 思考使用 `<think>…</think>`，默认会被解析，除非设置 `parseThinking: false`。

`xmlTagset` **只改变扫描器的选择**。`xml` 定义的调用、结果、思考和会话记录渲染器始终输出上述通用普通 XML 形式。常规 `tools.format: xml` 自有流路径不传入 `xmlTagset`，因此使用 Anthropic 标签集。OMP 目前将 DSML 选择器用于修复泄漏 DSML 输出的流标记，而不是改变 `tools.format: xml` 渲染器。

## 流式处理、格式错误的输出与恢复 \{#streaming-malformed-output-and-recovery}

### 默认 Anthropic 标签集 \{#default-anthropic-tagset}

解析以增量方式进行，可以安全跨越提供方的分块边界。对于每个非空的 `<invoke name="…">`，扫描器会：

1. 在 invoke 起始标签完整后立即发出 `toolStart`；
2. 在参数正文流入时发出带键的 `toolArgDelta` 事件；以及
3. 仅在匹配的 `</invoke>` 之后执行最终强制转换并发出 `toolEnd`。

完成事件包含精确的原始 invoke 块，用于诊断。包装器文本不属于该原始块。

失败行为有明确规定：

- 名称缺失或为空白的 invoke 不会发出工具生命周期事件；
- 名称缺失或为空白的参数会被忽略；
- 格式错误的 JSON 会回退为原始文本；
- 保留的参数值和参数增量上限为 1,000,000 个 JavaScript 字符串代码单元，溢出时会在完成后的值末尾追加显式标记；`rawBlock` 仍捕获完整 invoke，因此输入总量和原始捕获量不受该限制约束；
- 不完整的参数或 invoke 在 flush 时不会发出 `toolEnd`；以及
- 即使外层包装器始终未闭合，完整的 invoke 仍然有效。

OMP 的流投影器会在 `toolStart` 时创建规范调用，早于 `toolEnd`。因此，当提供方响应正常停止时，未终止的 invoke 可能作为部分完成但可运行的调用保留下来：流式参数文本保持未强制转换的状态，如果没有收到参数，则参数为 `{}`。提供方的 `length` 停止仍是不可运行的 `length`。此行为适用于常规自有 `xml` 路径，诊断在标签中途停止的模型输出时尤其重要。

### DSML 标签集 \{#dsml-tagset}

DSML 扫描器同样将每个参数作为带键的增量流式输出，并且只有遇到 `</｜DSML｜invoke>` 或其 ASCII 等价形式时才会发出 `toolEnd`。不完整的 DSML 参数会在 flush 时重置部分调用，不产生完成事件。由于 `xmlTagset: dsml` 是直接扫描器选项，而不是常规自有渲染器路径，消费这些事件的调用方需自行处理没有匹配结束事件的 `toolStart`。

在 DSML 模式下，孤立的 invoke 或 parameter 结束标签会与已识别的 DeepSeek 控制标记一起从可见文本中剥离。这种恢复行为不适用于默认 Anthropic 标签集。

### 伪造结果 \{#fabricated-results}

对于通用 XML 方言，第一个由模型编写的 `<tool_response>` 会被视为伪造结果边界。OMP 会保留它之前的调用和文本，并在此处停止投影。默认的 `tools.abortOnFabricatedResult: true` 会中止提供方生成；禁用该设置后，仍会接收完但丢弃伪造的后续内容。

如果提供方仍输出原生结构化调用，该轮次中第一个具名的原生或带内调用将决定所用通道。另一个通道会被丢弃，以防重复派发。

## 端到端示例 \{#end-to-end-example}

注入的目录行：

```text
<tools>
{"type":"function","function":{"name":"get_weather","description":"Get weather","parameters":{"type":"object","properties":{"city":{"type":"string"},"days":{"type":"number"}},"required":["city"]}}}
</tools>
```

助手调用批次：

```text
I'll compare both cities.
<invoke name="get_weather"><parameter name="city">Tokyo</parameter><parameter name="days">2</parameter></invoke>
<invoke name="get_weather"><parameter name="city">Oslo</parameter><parameter name="days">2</parameter></invoke>
```

OMP 生成的下一个用户轮次：

```text
<tool_response>
{"forecast":["clear","rain"]}
</tool_response>
<tool_response>
{"forecast":["rain","cloudy"]}
</tool_response>
```

随后助手正常回答，或再输出一系列 invoke。

## 解析说明与注意事项 \{#parsing-notes-and-gotchas}

- **并非真正的 XML。** 参数正文通过分隔符匹配，且有意不进行转义。XML 解析器或实体解码器会改变其值。
- **渲染器和扫描器的接受范围不同。** OMP 渲染无包装器的连续 invoke；默认扫描器还接受两种包装器和 `antml:` 变体。
- **没有调用 ID 或结果名称。** 并行批次中要保持调用与结果的顺序。
- **错误仅以文本表达。** 通用 `<tool_response>` 不编码 `isError`。
- **模式上下文很重要。** 向渲染器和扫描器 API 提供工具，使模式声明的字符串保持为字面值，而不是被 JSON 加引号或强制转换。
- **`xmlTagset` 仅用于扫描器。** 选择 DSML 不会让 XML 渲染器输出 DSML。
- **结束标签使调用最终完成。** `toolStart` 和参数增量会提前流式发出，但只有 `</invoke>` 才会生成最终强制转换后的参数对象和 `toolEnd`。

## 来源 \{#sources}

- `packages/ai/src/dialect/xml.md`：注入的通用 XML 格式指南。
- `packages/ai/src/dialect/xml.ts`：渲染器定义和 Anthropic/DSML 扫描器选择。
- `packages/ai/src/dialect/anthropic.ts`：默认的增量 invoke/parameter 扫描器、强制转换、思考以及不完整调用行为。
- `packages/ai/src/dialect/deepseek.ts`：DSML 封装扫描器和 `string="false"` 强制转换。
- `packages/ai/src/dialect/catalog.ts` 和 `prompt-template.md`：工具目录和系统提示注入。
- `packages/ai/src/dialect/rendering.ts`、`history.ts` 和 `owned-stream.ts`：结果渲染、历史转换、投影和伪造结果处理。
- `packages/ai/src/utils/stream-markup-healing.ts`：当前的 DSML 扫描器集成。
- `packages/coding-agent/src/sdk.ts`：`tools.format` 解析。
- `packages/agent/src/agent-loop.ts`：环境变量回退、非空工具门控和原生工具选择抑制。
- `packages/ai/src/dialect/coercion.ts`：基于模式的字符串分类。
- `packages/ai/test/inband-tools.test.ts` 和 `dialect-thinking.test.ts`：往返转换、分块参数增量、原始块、结果渲染和思考行为。
