---
title: "MiniMax 自主管理工具调用格式（<minimax:tool_call>）"
description: "Oh My Pi 官方仓库文档：MiniMax 自主管理工具调用格式（<minimax:tool_call>）。"
---

# MiniMax 自主管理工具调用格式（`<minimax:tool_call>`） \{#minimax-owned-tool-calling-format-minimaxtool_call}

OMP 的 `minimax` 方言是用于 MiniMax 家族模型的提示词驱动带内工具协议。调用是普通助手文本：一个 `<minimax:tool_call>` 封装包含一个或多个 `<invoke>` 元素。OMP 执行解析出的调用，并在下一个用户轮次中返回 `<function_results>` 块。该格式不携带工具调用 ID，因此调用与结果按顺序关联。

本参考描述 OMP 实现的转换器，而非 MiniMax 的提供方原生结构化工具 API。已对照 `packages/ai/src/dialect/minimax.ts`、`packages/ai/src/dialect/anthropic.ts` 中的共享 XML 扫描器、`packages/ai/src/dialect/catalog.ts` 中的提示词组装，以及 `packages/ai/src/dialect/owned-stream.ts` 中的流式投影核实。

## 选择与请求转换 \{#selection-and-request-conversion}

在 `~/.omp/agent/config.yml` 或项目/覆盖配置中显式设置格式：

```yaml
tools:
   format: minimax
```

`tools.format: minimax` 强制会话使用此自主管理方言。在 `auto` 模式下，OMP 保留提供方原生工具调用，除非所选模型显式设置了 `supportsTools: false`；对于 MiniMax 家族模型 ID，该回退解析为 `minimax`。参见 [`tools.format`](../settings.md#tools-and-approvals)。

当配置未解析出自主管理方言时，`PI_DIALECT=minimax` 也会选择它。
选择 `native` 时应取消设置该环境变量：即使 `tools.format` 解析为原生工具，智能体
也会将它用作回退。
每次提供方请求都会运行方言解析。

使用自主管理方言且工具列表非空时，OMP 会：

1. 从提供方请求中移除原生结构化 `tools` 字段和工具选择；
2. 向系统提示词追加带内工具目录和 MiniMax 格式指南；
3. 将先前的结构化助手调用和工具结果消息改写为此文本协议；以及
4. 将模型文本流扫描回结构化工具调用事件。

## 工具定义与提示词注入 \{#tool-definitions-and-prompt-injection}

注入的提示词以 `# Tools` 开头，说明调用是文本而非提供方原生工具消息，并在 `<tools></tools>` 内列出可用函数。每行都是一个紧凑的 OpenAI 风格函数对象，包含规范化的线上模式：

```text
<tools>
{"type":"function","function":{"name":"read","description":"Read a file","parameters":{"type":"object","properties":{"path":{"type":"string"},"count":{"type":"number"}},"required":["path"]}}}
</tools>
```

目录之后是 `packages/ai/src/dialect/minimax.md` 中的 MiniMax 专用指南。其约定要求使用已列出的函数名、字面字符串/标量正文、JSON 列表/对象、每批一个封装，并禁止模型自行编写结果块。

## 工具调用封装 \{#tool-call-envelope}

单次调用如下：

```text
<minimax:tool_call>
<invoke name="read"><parameter name="path">src/main.ts</parameter><parameter name="count">40</parameter></invoke>
</minimax:tool_call>
```

精确结构：

| 元素 | 含义 |
| --- | --- |
| `<minimax:tool_call>…</minimax:tool_call>` | 提示词约定要求的模型输出封装。 |
| `<invoke name="TOOL">…</invoke>` | 一次调用。`name` 必须是已列出的工具。 |
| `<parameter name="ARG">VALUE</parameter>` | 一个具名参数。参数直接位于 invoke 内。 |

渲染器会对属性中的工具名和参数名进行 XML 转义。参数正文有意**不**进行 XML 转义：此协议按分隔符匹配，而非作为 XML 解析。例如，字符串正文是 `a & b < c`，不是 `a &amp; b &lt; c`。字面量 `</parameter>` 是唯一保留序列，因为它会关闭该参数。

扫描器比提示词约定更宽容。它接受上面的带命名空间包装、不带前缀的 `<tool_call>` 包装，或包装之外的裸 `<invoke>`。模型仍应输出标准的 `<minimax:tool_call>` 形式，以免行为依赖恢复路径。

## 参数编码与强制转换 \{#argument-encoding-and-coercion}

编码使用所选工具的模式：

| 声明/值类型 | 渲染后的参数正文 | 解析值 |
| --- | --- | --- |
| 模式声明为字符串且运行时值为字符串 | 原样文本，包括前后空格和换行 | 原样字符串 |
| 对于模式按字符串处理的参数，运行时值为非字符串 | JSON | 该 JSON 文本保留为字符串 |
| 未按字符串处理的参数 | JSON，包括运行时字符串外围的引号 | 有效时为解析后的 JSON |

示例：

```text
<invoke name="write"><parameter name="path">notes/a & b.txt</parameter><parameter name="options">{"append":false,"tags":["x","y"]}</parameter></invoke>
```

扫描器根据提供的工具模式或显式 `stringArgs` 回调确定字符串参数。仅含字符串的模式在允许 null 时仍是字符串模式；枚举、常量和联合分支也参与类型检测。参数属性可以覆盖该决定：

- `string="true"`（以及除 `false`、`0` 或 `no` 之外的任何值）强制按原样字符串处理。
- `string="false"`、`string="0"` 或 `string="no"` 强制执行 JSON 解析，即使模式声明为字符串也是如此。

对于非字符串参数，仅在 JSON 解析时修剪外围空白。OMP 使用其支持修复的 JSON 解析器；如果解析仍失败，原始正文会保留为字符串，而不是丢弃参数。空正文也仍保留为空字符串。没有可用 `name` 的参数会被忽略。

扫描器不验证工具是否在目录中，也不验证完整的参数模式。
调用完成时，重复参数名会覆盖先前的值。属性
值不进行实体解码；对于包含需要实体转义字符的工具/参数名，
分隔符解析器不能实现 XML 往返还原。

## 多次与并行调用 \{#multiple-and-parallel-calls}

并行调用是同一封装中的同级 `<invoke>` 元素，按输出顺序排列：

```text
<minimax:tool_call>
<invoke name="read"><parameter name="path">src/a.ts</parameter></invoke>
<invoke name="read"><parameter name="path">src/b.ts</parameter></invoke>
</minimax:tool_call>
```

由于线上格式没有 ID，扫描器为每个 invoke 生成内部 ID。OMP 可以批量派发所得调用。工具结果必须按相同顺序返回；结果协议没有可用于修复乱序的调用 ID。

## 工具结果封装 \{#tool-result-envelope}

OMP 将连续工具结果归入一个 `<function_results>` 块。成功和失败使用不同记录：

```text
<function_results>
<result>
<tool_name>read</tool_name>
<stdout>file contents</stdout>
</result>
<error>
<tool_name>read</tool_name>
<stderr>ENOENT: file not found</stderr>
</error>
</function_results>
```

对每个结果：

- 成功使用带 `<stdout>` 的 `<result>`；
- `isError: true` 使用带 `<stderr>` 的 `<error>`；
- `<tool_name>` 进行 XML 文本转义；
- stdout/stderr 原样插入；以及
- 没有调用 ID，因此模型按调用顺序读取记录。

OMP 将此文本放入合成的 `user` 消息。单个工具结果的文本块会拼接起来；图像结果块仍作为图像块位于渲染文本之后。模型绝不能自行输出 `<function_results>` 或 `<tool_response>`。

## 思考与可见文本 \{#thinking-and-visible-text}

OMP 将保留的推理块渲染为：

```text
<thinking>
reasoning text
</thinking>
```

`renderThinking` 和直接会话记录渲染器以此
形式保留推理。当输入完全由完整的 `<thinking>` 包装组成时，
会先将嵌套/相邻包装展平，再添加分隔符对。
正常历史转换对于带调用的助手消息只保留正文
和渲染后的调用，丢弃其原始思考块。

正常的自主管理工具流会启用思考解析。MiniMax
扫描器识别 `<thinking>`、`<think>` 和 `<scratchpad>`（包括
支持的带前缀形式），发出独立的思考事件，并使其
内容不出现在可见文本中。直接扫描器默认禁用思考解析；
此时，调用包装外的这些标签仍是可见文本。包装内的非调用
文本会被丢弃。未终止的思考块在刷新时逻辑关闭，
并保留累积内容。

可见正文可以出现在工具封装之前。调用外的文本仍是助手文本；包装内的非调用文本由扫描器丢弃。

## 流式处理、格式错误输出与恢复 \{#streaming-malformed-output-and-recovery}

扫描器支持增量处理，并能安全处理数据块边界：开始/结束标签和参数正文可以在不同的提供方增量中到达。其可观察生命周期为：

1. 非空的 `<invoke name="…">` 立即发出 `toolStart`；
2. 随着文本块到达，每个具名参数正文发出带键的 `toolArgDelta` 事件；以及
3. 匹配的 `</invoke>` 执行最终强制转换，并发出带有完整参数和精确原始 invoke 块的 `toolEnd`。

重要的失败行为：

- **缺少调用名称：**不为该 invoke 发出工具生命周期事件。
- **缺少参数名称：**忽略该参数。
- **格式错误的 JSON：**回退为原始参数文本。
- **超大参数：**保留的参数值及其参数增量以 1,000,000 个 JavaScript 字符串代码单元为上限；溢出时，完成后的值会带有显式截断标记。诊断用的 `rawBlock` 仍保留完整 invoke，因此这不是对总输入或原始捕获内容的限制。
- **不完整的 invoke：**刷新会重置扫描器本地调用状态，不发出 `toolEnd`。但 OMP 的流投影器已经根据 `toolStart` 实体化了调用；对于正常停止的响应，它会保留该部分调用，将轮次标记为工具使用，并可能派发它。已流式输出的参数文本仍未经强制转换，没有参数文本的调用则具有 `{}`。提供方的 `length` 停止仍为 `length`，不会变成可运行的工具使用。
- **完整 invoke 后的包装不完整：**已闭合的 invoke 仍有效；发出它们的 `toolEnd` 事件不要求包装闭合。
- **不完整的思考：**保留为思考，并在刷新时逻辑结束。

OMP 还防止模型在调用后伪造工具输出。对于此方言，第一个 `<function_results>` 或 `<tool_response>` 边界会停止投影。默认的 `tools.abortOnFabricatedResult: true` 会立即中止生成；禁用后，OMP 会排空提供方流，但丢弃伪造的后续内容。

如果提供方在自主管理模式下仍输出原生结构化调用，第一个
具名原生或带内调用将选择该轮次的通道。
另一个通道的调用会被丢弃，以避免重复派发。

## 端到端示例 \{#end-to-end-example}

注入的工具定义（缩略为相关目录行）：

```text
<tools>
{"type":"function","function":{"name":"get_weather","description":"Get weather","parameters":{"type":"object","properties":{"city":{"type":"string"},"units":{"type":"string"}},"required":["city"]}}}
</tools>
```

助手调用：

```text
I'll check both cities.
<minimax:tool_call>
<invoke name="get_weather"><parameter name="city">Tokyo</parameter><parameter name="units">celsius</parameter></invoke>
<invoke name="get_weather"><parameter name="city">Oslo</parameter><parameter name="units">celsius</parameter></invoke>
</minimax:tool_call>
```

OMP 生成的下一个用户轮次：

```text
<function_results>
<result>
<tool_name>get_weather</tool_name>
<stdout>{"temperature":28,"condition":"clear"}</stdout>
</result>
<result>
<tool_name>get_weather</tool_name>
<stdout>{"temperature":14,"condition":"rain"}</stdout>
</result>
</function_results>
```

随后，助手可以正常回答，或输出另一个完整的 MiniMax 调用封装。

## 解析说明与易错点 \{#parsing-notes-and-gotchas}

- **不是真正的 XML。**不要对参数正文做实体转义，也不要将其交给 XML DOM 解析器；匹配基于协议分隔符。
- **一个封装，多个 invoke。**并行通过 `<minimax:tool_call>` 内的同级调用实现，不是 JSON `tool_calls`，也不是每个所需批次一个封装。
- **模式决定字符串。**没有工具模式时，即使渲染器值是 JavaScript 字符串，也会加上 JSON 引号；要实现往返还原，请向渲染器/扫描器 API 提供工具定义。
- **线上没有 ID。**OMP 生成的 ID 是内部的。请保留调用/结果顺序。
- **错误是一等记录。**使用 `<error>/<stderr>`，不要使用含带外错误标志的成功 `<result>`。
- **标准包装与可接受的恢复语法。**解析器接受裸 invoke 和 `<tool_call>`，但注入的约定要求 `<minimax:tool_call>`。
- **停止前完成 invoke。**自然语言承诺调用工具不等于调用；结束的 `</invoke>` 才会完成强制转换和正常生命周期。

## 来源 \{#sources}

- `packages/ai/src/dialect/minimax.md`：注入的 MiniMax 格式指南。
- `packages/ai/src/dialect/minimax.ts`：调用、结果、思考和会话记录渲染器，以及扫描器配置。
- `packages/ai/src/dialect/anthropic.ts`：共享的增量 invoke/parameter 扫描器和强制转换行为。
- `packages/ai/src/dialect/catalog.ts` 和 `prompt-template.md`：工具目录和系统提示词注入。
- `packages/ai/src/dialect/history.ts` 和 `owned-stream.ts`：历史转换、流式投影、不完整调用行为及伪造结果边界。
- `packages/catalog/src/identity/dialect.ts` 和 `packages/coding-agent/src/sdk.ts`：MiniMax 家族关联和 `tools.format` 解析。
- `packages/agent/src/agent-loop.ts`：环境回退、非空工具门控及原生工具选择抑制。
- `packages/ai/src/dialect/coercion.ts` 和 `rendering.ts`：模式字符串检测、字面参数编码及思考包装展平。
- `packages/ai/test/inband-tools.test.ts`：提示词渲染、调用往返还原、分块参数增量、原始块、MiniMax 包装恢复及结果渲染。
