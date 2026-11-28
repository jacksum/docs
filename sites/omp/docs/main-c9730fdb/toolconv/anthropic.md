---
title: "Anthropic Claude 工具使用（Messages API 内容块）"
description: "Oh My Pi 官方仓库文档：Anthropic Claude 工具使用（Messages API 内容块）。"
---

# Anthropic Claude 工具使用（Messages API 内容块） \{#anthropic-claude-tool-use-messages-api-content-blocks}

Anthropic 的 Claude 是托管模型系列，不是带有 `--tool-call-parser` 标志的本地模型。规范的工具调用约定是 **Messages API**（`POST /v1/messages`，请求头 `anthropic-version: 2023-06-01`）：工具在顶层 `tools` 数组中声明，模型返回结构化的 `tool_use` **内容块**，并带有 `stop_reason: "tool_use"`，你再将结果作为 `user` 消息内的 `tool_result` 内容块反馈。包含 `tools` 即可启用工具使用（可选配 `tool_choice`）。OMP 的原生 `anthropic-messages` 模型提供方消费这些结构化块；单独选择的 `anthropic` 方言则使用提示驱动的 XML。

在底层，模型经过训练会输出 **XML** 函数调用语法（`<function_calls>` / `<invoke>` / `<parameter>`）；API 将你的 JSON-Schema 工具序列化到系统提示中，并将模型的 XML 输出转换为 JSON `tool_use` 块。下文将该底层格式记为_次要_约定，同时介绍更早、现已退役的基于提示的**旧版 XML** 格式（`<tool_name>` / `<parameters>` / `<function_results>`），后者早于 Messages API，在纯粹通过提示使用工具时仍会出现。

对于原生 Messages API 适配器，权威结构是 JSON 内容块格式。XML 章节描述的是另一条带内转换路径；它们不是原生模型提供方的传输格式。

---

## 内容块类型与停止原因 \{#content-block-types--stop-reasons}

Anthropic 的公开 API 中没有 token 级工具分隔符。其单位是**内容块**：每个 `message.content` 都是带类型的块数组。工具调用增加两种块类型和一个停止原因；流式处理增加一种增量类型。

| 项目 | 位置 | 结构/含义 |
| --- | --- | --- |
| `text` 块 | 助手与用户 | `{"type":"text","text":"..."}`。普通文本。助手可以在工具调用_之前_输出文本。 |
| `tool_use` 块 | 助手 | `{"type":"tool_use","id":"toolu_...","name":"<tool>","input":{...}}`。函数调用。`input` 是**嵌套 JSON 对象**（已解析），符合工具的 `input_schema`。 |
| `tool_result` 块 | 用户 | `{"type":"tool_result","tool_use_id":"toolu_...","content":<string \| block[]>,"is_error":<bool?>}`。执行结果，通过 `user` 消息发回。 |
| `server_tool_use` 块 | 助手 | `{"type":"server_tool_use","id":"srvtoolu_...","name":"web_search","input":{...}}`。由 Anthropic 执行的服务端工具发出；你**不应**为这些调用返回 `tool_result`。 |
| `web_search_tool_result`（及类似类型） | 助手 | 服务端工具输出，由 Anthropic 内联注入助手轮次。 |
| `thinking` / `redacted_thinking` 块 | 助手 | `thinking` 携带推理文本和 `signature`；`redacted_thinking` 携带不透明的 `data`，而不是签名字段。重放思考/工具轮次时保留这些字段。 |
| `stop_reason: "tool_use"` | 响应顶层 | 模型调用了一个或多个工具，正在等待结果。驱动智能体循环。 |
| `stop_reason: "end_turn"` | 响应顶层 | 自然完成（无工具调用）；循环退出。 |
| 其他 `stop_reason` | 响应顶层 | `"max_tokens"`、`"stop_sequence"`、`"pause_turn"`（较长的服务端工具轮次，原样重发以继续）、`"refusal"`、`"sensitive"`（输出被安全过滤器标记）、`"model_context_window_exceeded"`（输出在上下文窗口处被截断，按 `max_tokens` 处理）、`"compaction"`（服务端上下文压缩摘要后的暂停）。 |
| `id` 前缀 | 无 | 消息 `msg_…`；客户端工具调用 `toolu_…`；服务端工具调用 `srvtoolu_…`。 |

流式处理增加以下 SSE 事件/增量类型（完整列表见[角色/通道](#roles--channels--turn-structure)和[工具调用格式](#tool-call-format)）：

| 流式项目 | 结构/含义 |
| --- | --- |
| `message_start` | 携带 `Message` 骨架，`content` 为空，`stop_reason: null`。 |
| `content_block_start` | 在 `index` 处打开一个块。对于工具调用：`content_block.{type:"tool_use",id,name,input:{}}`，`input` 初始为**空对象**。 |
| `content_block_delta` / `input_json_delta` | `{"type":"input_json_delta","partial_json":"<chunk>"}`，`tool_use.input` 的**部分 JSON 字符串**片段。 |
| `content_block_delta` / `text_delta` | `{"type":"text_delta","text":"..."}`。 |
| `content_block_delta` / `thinking_delta`, `signature_delta` | 扩展思考内容/签名。 |
| `content_block_stop` | 关闭 `index` 处的块；此时累积的 `partial_json` 已完整，可以安全地进行 `JSON.parse`。 |
| `message_delta` | 顶层更新；携带最终的 `delta.stop_reason`（例如 `"tool_use"`）及**累积** `usage`。 |
| `message_stop` | 流结束。 |
| `ping` / `error` | 保活；`error`（例如 `overloaded_error`）可能在流中途出现。 |

### 旧版 XML 标签（基于提示，早于 Messages API） \{#legacy-xml-tags-prompt-based-pre-messages-api}

已退役的基于提示的格式使用以下标签。它们是嵌套元素标签（无属性），不同于现代的属性形式（`<invoke name="…">`）。已对照 Anthropic 归档的“Legacy tool use”文档核实（参阅[来源](#sources)）。

| 标签 | 作用 | 备注 |
| --- | --- | --- |
| `<tools>` … `</tools>` | 工具声明 | 系统提示中的容器，包裹所有 `<tool_description>` 条目。 |
| `<tool_description>` | 工具声明 | 每个工具一个：包含 `<tool_name>`、`<description>`、`<parameters>`。 |
| `<tool_name>` | 两者皆用 | 函数名称（用于定义、调用和结果）。 |
| `<parameters>` / `<parameter>` | 定义 | `<parameters>` 包裹 `<parameter>` 条目，每个条目包含 `<name>`、`<type>`、`<description>`。 |
| `<function_calls>` | 模型输出 | 包裹一个或多个 `<invoke>` 块。 |
| `<invoke>` | 模型输出 | 一个函数调用；包含 `<tool_name>`，以及由 `<paramName>value</paramName>` 子标签组成的 `<parameters>` 块。 |
| `<function_results>` | 工具结果（反馈） | 包裹 `<result>`（成功）或 `<error>`（失败）。 |
| `<result>` / `<stdout>` | 工具结果 | `<result>` 包含 `<tool_name>` + `<stdout>`；输出文本放在 `<stdout>` 中。 |
| `<error>` | 工具结果 | 函数抛出异常时替代 `<result>`。 |
| `</function_calls>` | 停止序列 | 作为 `stop_sequence` 传入，使生成在调用后停止。 |
| `<scratchpad>` / `<answer>` | 模型输出 | 旧版提示中通常用于思维链和最终答案。 |

---

## 角色/通道/轮次结构 \{#roles--channels--turn-structure}

Messages API 主要交替使用两种对话角色：`user` 和 `assistant`。**没有**专用的 `tool`/`function` 角色，标准系统提示是单独的顶层 `system` 参数（字符串或文本块数组），不是消息角色。（Claude Opus 4.8+ 和 Fable/Mythos 5 代模型还接受可选启用的对话中途 `system` **消息**角色，受 `mid-conversation-system-2026-04-07` beta 控制；否则只有 `user`/`assistant` 有效。）工具数据位于普通角色内部：

- `assistant` 消息包含 AI 生成的 `text`、`thinking` 和 `tool_use`（以及 `server_tool_use`）块。
- `user` 消息包含你的 `text`/`image`/`document` 内容和 `tool_result` 块。

没有具名的“通道”。最接近推理通道的是扩展思考的 `thinking` 内容块（带有密码学签名（`signature`）的一等块），它与用户可见的 `text` 块分开。在启用思考并使用工具时，后续请求必须原样传回工具调用轮次中的 `thinking` 块。

智能体循环以 `stop_reason` 为依据：

1. 发送 `tools` + 用户消息。
2. Claude 返回 `stop_reason: "tool_use"` 和一个或多个 `tool_use` 块（前面可有一个 `text` 块）。
3. 执行各工具；为每次调用构建一个 `tool_result` 块。
4. 追加助手消息，**以及**一条携带所有 `tool_result` 块的 `user` 消息；重新发送。
5. 当 `stop_reason == "tool_use"` 时重复；遇到 `end_turn`（或其他终结原因）时退出。

严格的顺序规则（否则返回 400）：

- `tool_result` 块必须位于 `user` 消息 `content` 数组的**最前面**（任何文本放在它们之后）。
- `tool_result` 的 `user` 消息必须**紧接**助手 `tool_use` 消息，中间不能有其他内容。
- 每个 `tool_use.id` 都必须由下一条消息中的一个 `tool_result.tool_use_id` 回应。

---

## 工具定义 \{#tool-definitions}

工具通过顶层 `tools` 数组传入。每个用户定义的（客户端）工具都是**扁平**对象，没有 `{"type":"function", "function":{…}}` 包装器（该包装器属于 OpenAI）。字段：

- `name`：匹配 `^[a-zA-Z0-9_-]{1,64}$`。
- `description`：详细的纯文本（影响工具调用质量的最主要因素）。
- `input_schema`：JSON Schema 对象（**不是** `parameters`），描述模型必须生成的输入。
- 可选：`cache_control`（提示缓存断点）、`strict`（结构化输出 beta）、`eager_input_streaming`（细粒度工具流式处理 beta）。

```json
{
	"name": "get_weather",
	"description": "Get the current weather in a given location",
	"input_schema": {
		"type": "object",
		"properties": {
			"location": {
				"type": "string",
				"description": "The city and state, e.g. San Francisco, CA"
			},
			"unit": {
				"type": "string",
				"enum": ["celsius", "fahrenheit"],
				"description": "The unit of temperature, either 'celsius' or 'fahrenheit'"
			}
		},
		"required": ["location"]
	}
}
```

Anthropic 模式的客户端工具（`bash`、`text_editor`、`computer`、`memory`）和服务端工具（`web_search`、`web_fetch`、`code_execution`、`tool_search`）则携带带版本号的 `type`，例如 `{"type": "web_search_20250305", "name": "web_search"}`。

### OMP 原生适配器模式归一化 \{#omp-native-adapter-schema-normalization}

原生 Anthropic 模型提供方不会原样转发 pi 工具的 JSON Schema。在将其放入 `input_schema` 之前，OMP 会保留以下关键字：

- 每个节点上：`$ref`、`$defs`、`$schema`、`definitions`、`type`、`enum`、`const`、`description`、`title`、`default` 和 `nullable`；
- 嵌套的 `anyOf` 和 `allOf`（不保留根组合器，也不在任何深度保留 `oneOf`）；
- 对象上：`properties`、`required` 和 `additionalProperties`；
- 数组上：`items`、`prefixItems`，以及值为 `0` 或 `1` 时的 `minItems`；
- 字符串上：仅在值为 `date-time`、`time`、`date`、`duration`、`email`、`hostname`、`uri`、`ipv4`、`ipv6` 或 `uuid` 时保留 `format`。

其他约束，包括 `pattern`、字符串长度限制、数值范围、`maxItems`、不支持的格式和不支持的组合器，都会追加到该节点的 `description`。它们仍是模型可见的指导，但不再是机器强制执行的模式关键字。对象节点默认为 `additionalProperties: false`；显式的 `true` 或值为模式的 `additionalProperties` 保持开放（空模式归一化为 `true`）。

OMP 仅为符合条件的内置工具（`bash`、`python`、`edit` 和 `find`）发送 `strict: true`，条件是 `PI_NO_STRICT` 和模型提供方兼容性/运行时回退均未禁用严格工具、工具没有主动退出、原始模式不含 `oneOf`、`allOf`、`$ref`、`patternProperties` 和 `propertyNames`，且每个对象都封闭。每个请求最多选择 20 个严格工具，并共享 24 个可选属性和 16 次联合使用的预算：可选属性预算耗尽后，另一个可选属性必须使用联合预算转换为必需且可空，否则该工具保持非严格。其他工具使用归一化后的非严格模式。OMP 仅在模型兼容性数据和生效端点支持时发送 `eager_input_streaming: true`：第一方 Anthropic 端点符合条件，明确配置了该能力的自定义端点也符合；规范模型若被重新路由到不符合条件的非 Anthropic 端点，则不符合。

`tool_choice` 控制调用（四个选项）：

- `{"type":"auto"}`：由模型决定（存在 `tools` 时的默认值）。
- `{"type":"any"}`：必须调用某个工具。
- `{"type":"tool","name":"get_weather"}`：必须调用该指定工具。
- `{"type":"none"}`：不使用工具（没有 `tools` 时的默认值）。

使用 `any` 或 `tool` 时，API 会预填充助手轮次，因此 `tool_use` 块之前不会出现自然语言文本。在 `tool_choice` 内添加 `"disable_parallel_tool_use": true`，可将每轮限制为一个工具。（扩展思考只支持 `auto`/`none`。）

OMP 的 `AnthropicOptions.toolChoice` 接受 `"auto"`、`"any"`、`"none"` 或 `{ type: "tool", name }`。对于上下文压缩请求，或兼容性数据禁用强制工具选择的模型，强制选择会降级为 `auto`。否则，OMP 会为强制选择移除显式思考配置；仅支持自适应思考且支持输出 effort 的模型会固定为 `effort: "low"`。高层选项不暴露 `disable_parallel_tool_use`。

原生适配器将 `tool_use` 块映射为规范的 `toolCall` 块，并将 `input_json_delta` 投影为 `toolcall_delta`。它在流式处理期间尽力维护参数对象，并使用修复型 JSON 解析器完成最终处理，而不要求每个片段都是有效 JSON。最终解析失败时保留已恢复的参数；如果没有恢复任何参数，则提供 `__parseError` 和有长度限制的 `__rawJson` 摘录。

连续的规范 `toolResult` 消息会变为一条包含多个 `tool_result` 块的 `user` 消息。空的成功结果使用 `content: ""`；空错误变为 `"Tool failed with no output."`。错误结果中的图像会移到结果块之后。带有 `requiresToolResultId` 的端点还会收到与 `tool_use_id` 匹配的 `id`。标记为 `deferLoading` 的工具会带着 `defer_loading: true` 发送。

原生停止原因映射到 pi 的 `stopReason`：`tool_use` → `toolUse`；`max_tokens` 和 `model_context_window_exceeded` → `length`；`refusal` 和 `sensitive` → `error`；`end_turn`、`stop_sequence`、`pause_turn` 和 `compaction` → `stop`。未知原因会被报告并视为 `stop`。

### API 如何将其转换为提示（通往 XML 的桥梁） \{#how-the-api-turns-this-into-a-prompt-the-bridge-to-xml}

存在 `tools` 时，API 会按以下骨架构建工具使用系统提示（已根据“Define tools”核实）：

```text
In this environment you have access to a set of tools you can use to answer the user's question.
{{ FORMATTING INSTRUCTIONS }}
String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.
Here are the functions available in JSONSchema format:
{{ TOOL DEFINITIONS IN JSON SCHEMA }}
{{ USER SYSTEM PROMPT }}
{{ TOOL CONFIGURATION }}
```

`{{ TOOL DEFINITIONS IN JSON SCHEMA }}` 是序列化为 JSON Schema 的 `tools` 数组。`{{ FORMATTING INSTRUCTIONS }}` 是教模型使用带有 `antml:` 命名空间前缀的 XML 语法的块（未公开，见[工具调用格式 → 底层 XML](#underlying-xml-modern-attribute-form-with-antml-namespace)）。“使用正则表达式解析”这一说明，解释了为什么输出不必是格式良好的 XML。

---

## 工具调用格式 \{#tool-call-format}

应用消费的传输格式是 JSON。单次调用是助手消息中的一个 `tool_use` 内容块，顶层带有 `stop_reason: "tool_use"`：

```json
{
	"id": "msg_01Aq9w938a90dw8q",
	"type": "message",
	"role": "assistant",
	"model": "claude-opus-4-8",
	"content": [
		{
			"type": "text",
			"text": "I'll check the current weather in San Francisco for you."
		},
		{
			"type": "tool_use",
			"id": "toolu_01A09q90qw90lq917835lq9",
			"name": "get_weather",
			"input": { "location": "San Francisco, CA", "unit": "celsius" }
		}
	],
	"stop_reason": "tool_use",
	"stop_sequence": null,
	"usage": { "input_tokens": 472, "output_tokens": 65 }
}
```

解析器需要了解的关键事实：

- `tool_use.input` 是已解析的**对象**，绝不是 JSON 字符串。
- 前导 `text` 块可有可无，仅提供信息；不要依赖其具体措辞。
- 通过 `id` → `tool_use_id` 将调用与结果匹配。

### 底层 XML（带 antml: 命名空间的现代属性形式） \{#underlying-xml-modern-attribute-form-with-antml-namespace}

在 API 转换之前，模型实际输出的是 XML 块。当前（Claude 3+）形式基于属性：

```text
<function_calls>
<invoke name="get_weather">
<parameter name="location">San Francisco, CA</parameter>
<parameter name="unit">celsius</parameter>
</invoke>
</function_calls>
```

当前 Claude 模型会为这些标签添加 `antml:` XML 命名空间前缀，例如 `antml:function_calls`、`antml:invoke name="…"`、`antml:parameter name="…"`。API 会剥离这些内容，只暴露 JSON `tool_use` 块；集成方应面向 JSON，而不是 XML。

### OMP 的 `anthropic` 方言 \{#omp-anthropic-dialect}

通过 `PI_DIALECT=anthropic` 或智能体的 `dialect`/`getDialect` 配置选择自管方言。存在工具时，智能体会在系统提示词中附加方言指南和紧凑的 JSON 工具目录，从请求中移除原生工具，并将此前的工具调用和结果重新编码为文本。此机制与原生 `anthropic-messages` 适配器相互独立。

方言渲染器始终输出上面的无前缀属性形式，将多个调用放在同一个 `<function_calls>` 块中，并将每个参数渲染为 `<parameter name="…">` 子元素。存在工具模式时，仅接受字符串的参数（包括可为空的字符串）按字面文本插入；其他值序列化为 JSON。工具名和参数名会进行 XML 属性转义，但参数正文不进行 XML 转义。扫描器不解码 XML 实体。它接受带 `antml:` 前缀的标签、作为包装器别名的 `<tool_calls>`，以及位于这两种包装器之外的独立 `<invoke name="…">`。不支持使用子标签的旧版 `<invoke><tool_name>…` 格式。

由于这种 XML 没有调用 ID，扫描器会生成 `ptc_…` 调用 ID。它有状态地扫描流式文本，在每个命名参数的正文到达时发出 `toolArgDelta` 事件，并在 `</invoke>` 之后通过 `toolEnd` 发布经过类型转换的参数对象。单个参数值的上限为1,000,000个 JavaScript 字符串代码单元；溢出时会附加明确的截断后缀。模式声明的字符串保持为字符串；其他非空值使用带修复的 JSON 解析，失败时回退到原始文本。显式 `string` 属性会覆盖模式：`false`、`0` 和 `no`（不区分大小写）启用解析；其他提供的值使正文保持为字符串。空正文保持为字符串。

独立使用的 `AnthropicInbandScanner` 默认为 `parseThinking: false`；自管流投影器会将其启用。设置 `parseThinking: true` 时，`<thinking>`、`<think>` 和 `<scratchpad>`（带或不带前缀）会转换为思考事件。关闭时，这些标签在工具包装器之外仍然可见；工具包装器内的附带文本则被丢弃。

`</invoke>` 决定何时发出 `toolEnd`，但不决定何时创建标准调用。起始 `<invoke name="…">` 一旦发出 `toolStart`，EOF 就只会重置扫描器本地状态。流正常停止时，OMP 保留该调用，将轮次改为 `toolUse`，即使没有收到 `toolEnd` 也可能派发它。已经累积的 `toolArgDelta` 文本会保留在调用中（不会执行闭合时的类型转换）；未累积任何参数文本的调用使用 `{}` 运行。`length` 停止仍不允许执行。

历史编码会将连续结果合并到一条 `user` 消息中，并将结果图像保留为 XML 之后独立的图像块。包含工具调用的助手轮次会以文本加渲染后的调用重放，不包含思考块。独立的会话记录渲染器是另一种接口：它使用 `Human:` / `Assistant:` 文本轮次，并将思考渲染为 `<thinking>…</thinking>`，而不是 Messages API JSON。

自管流会在 `<function_results>` 或 `<tool_response>` 处截断伪造结果（默认中止），保留该边界之前已解析的调用。如果提供方仍返回原生结构化调用，本轮第一个真实的原生或带内调用会选定通道，以防重复派发。

---

## 多个工具调用与并行工具调用 \{#multiple--parallel-tool-calls}

默认支持并行调用。Claude 会在**单条助手消息中发出多个 `tool_use` 块**：

```json
{
	"role": "assistant",
	"content": [
		{ "type": "text", "text": "Let me check both cities." },
		{
			"type": "tool_use",
			"id": "toolu_01weather_sf",
			"name": "get_weather",
			"input": { "location": "San Francisco, CA" }
		},
		{
			"type": "tool_use",
			"id": "toolu_02weather_nyc",
			"name": "get_weather",
			"input": { "location": "New York, NY" }
		}
	]
}
```

你应在**一条** `user` 消息中返回**所有**结果，每个调用对应一个 `tool_result`，结果放在最前面：

```json
{
	"role": "user",
	"content": [
		{
			"type": "tool_result",
			"tool_use_id": "toolu_01weather_sf",
			"content": "San Francisco: 68F, partly cloudy"
		},
		{
			"type": "tool_result",
			"tool_use_id": "toolu_02weather_nyc",
			"content": "New York: 45F, clear skies"
		}
	]
}
```

同一轮次中的调用**没有顺序约束**，可以并发运行。如果同批两个调用实际上相互依赖，请在带 `"is_error": true` 的 `tool_result` 中返回自然产生的错误；Claude 会在后续轮次重新发出依赖调用。（旧版 XML 格式通过同一个 `<function_calls>` 中的多个 `<invoke>` 块表示并行。）

---

## 工具结果格式 \{#tool-result-format}

结果是 `user` 消息中的一个 `tool_result` 块：

- `tool_use_id`（必填）：所响应的 `tool_use` 的 `id`。
- `content`（可选）：字符串，**或** `text`/`image`/`document` 块数组。空结果可省略。
- `is_error`（可选）：执行失败时设为 `true`；在 `content` 中放入有用的消息。

```json
{
	"role": "user",
	"content": [
		{
			"type": "tool_result",
			"tool_use_id": "toolu_01A09q90qw90lq917835lq9",
			"content": "15 degrees"
		}
	]
}
```

错误结果：

```json
{
	"role": "user",
	"content": [
		{
			"type": "tool_result",
			"tool_use_id": "toolu_01A09q90qw90lq917835lq9",
			"content": "ConnectionError: the weather service API is not available (HTTP 500)",
			"is_error": true
		}
	]
}
```

富结果（文本 + 图像块）：

```json
{
	"role": "user",
	"content": [
		{
			"type": "tool_result",
			"tool_use_id": "toolu_01A09q90qw90lq917835lq9",
			"content": [
				{ "type": "text", "text": "15 degrees" },
				{
					"type": "image",
					"source": { "type": "base64", "media_type": "image/jpeg", "data": "/9j/4AAQSkZJRg..." }
				}
			]
		}
	]
}
```

服务器工具**不需要**你提供 `tool_result`，Anthropic 会执行这些工具，并将结果内联注入助手轮次。（旧版 XML 通过 `<function_results><result><tool_name>…</tool_name><stdout>…</stdout></result></function_results>` 返回结果，失败时使用 `<error>…</error>`。）

OMP 由提示词驱动的方言不同于 Anthropic 的服务器工具行为。它将客户端结果渲染为：

```text
<function_results>
<result>
<tool_name>get_weather</tool_name>
<stdout>15 degrees</stdout>
</result>
<error>
<tool_name>other_tool</tool_name>
<stderr>execution failed</stderr>
</error>
</function_results>
```

这种 XML 中没有结果 ID，因此按调用顺序关联结果。OMP 会在成功和错误条目中都包含工具名，不会在其他位置编码 `isError`。

---

## 端到端示例 \{#end-to-end-example}

下面是一段完整的多轮天气交互。所有 JSON 都有效。

**请求1：系统提示词 + 工具 + 用户问题：**

```json
{
	"model": "claude-opus-4-8",
	"max_tokens": 1024,
	"system": "You are a helpful weather assistant. Use the provided tools to answer.",
	"tools": [
		{
			"name": "get_weather",
			"description": "Get the current weather in a given location",
			"input_schema": {
				"type": "object",
				"properties": {
					"location": { "type": "string", "description": "The city and state, e.g. San Francisco, CA" },
					"unit": {
						"type": "string",
						"enum": ["celsius", "fahrenheit"],
						"description": "Unit for the temperature"
					}
				},
				"required": ["location"]
			}
		}
	],
	"messages": [{ "role": "user", "content": "What's the weather in San Francisco?" }]
}
```

**响应1：助手请求工具（`stop_reason: "tool_use"`）：**

```json
{
	"id": "msg_01Aq9w938a90dw8q",
	"type": "message",
	"role": "assistant",
	"model": "claude-opus-4-8",
	"content": [
		{ "type": "text", "text": "I'll check the current weather in San Francisco for you." },
		{
			"type": "tool_use",
			"id": "toolu_01A09q90qw90lq917835lq9",
			"name": "get_weather",
			"input": { "location": "San Francisco, CA", "unit": "celsius" }
		}
	],
	"stop_reason": "tool_use",
	"stop_sequence": null,
	"usage": { "input_tokens": 472, "output_tokens": 65 }
}
```

**请求2：重放历史，追加助手轮次和 `tool_result`：**

```json
{
	"model": "claude-opus-4-8",
	"max_tokens": 1024,
	"system": "You are a helpful weather assistant. Use the provided tools to answer.",
	"tools": [
		{
			"name": "get_weather",
			"description": "Get the current weather in a given location",
			"input_schema": {
				"type": "object",
				"properties": {
					"location": { "type": "string", "description": "The city and state, e.g. San Francisco, CA" },
					"unit": {
						"type": "string",
						"enum": ["celsius", "fahrenheit"],
						"description": "Unit for the temperature"
					}
				},
				"required": ["location"]
			}
		}
	],
	"messages": [
		{ "role": "user", "content": "What's the weather in San Francisco?" },
		{
			"role": "assistant",
			"content": [
				{ "type": "text", "text": "I'll check the current weather in San Francisco for you." },
				{
					"type": "tool_use",
					"id": "toolu_01A09q90qw90lq917835lq9",
					"name": "get_weather",
					"input": { "location": "San Francisco, CA", "unit": "celsius" }
				}
			]
		},
		{
			"role": "user",
			"content": [
				{
					"type": "tool_result",
					"tool_use_id": "toolu_01A09q90qw90lq917835lq9",
					"content": "15 degrees Celsius, partly cloudy"
				}
			]
		}
	]
}
```

**响应2：助手的最终回答（`stop_reason: "end_turn"`）：**

```json
{
	"id": "msg_01EeFG3hijk2lmno4PqrSt",
	"type": "message",
	"role": "assistant",
	"model": "claude-opus-4-8",
	"content": [{ "type": "text", "text": "It's currently 15 degrees Celsius and partly cloudy in San Francisco." }],
	"stop_reason": "end_turn",
	"stop_sequence": null,
	"usage": { "input_tokens": 530, "output_tokens": 18 }
}
```

### 工具调用的流式（SSE）形式 \{#streaming-sse-shape-of-the-tool-call}

同一个工具调用的流式形式如下。注意，`tool_use` 以空 `input` 开始，参数以 `input_json_delta.partial_json` 片段到达，最终 `stop_reason` 出现在 `message_delta` 中。下面的块逐字摘自 Anthropic 的流式文档：

```text
event: message_start
data: {"type":"message_start","message":{"id":"msg_014p7gG3wDgGV9EUtLvnow3U","type":"message","role":"assistant","model":"claude-opus-4-8","stop_sequence":null,"usage":{"input_tokens":472,"output_tokens":2},"content":[],"stop_reason":null}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: ping
data: {"type": "ping"}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Okay"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" let"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"'s"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" check"}}

event: content_block_stop
data: {"type":"content_block_stop","index":0}

event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01T1x1fJ34qAmk2tNTrN7Up6","name":"get_weather","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"location\":"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" \"San"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" Francisc"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"o,"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":" CA\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}

event: message_delta
data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":89}}

event: message_stop
data: {"type":"message_stop"}
```

重组方式：为某个 `index` 拼接全部 `partial_json`（`"" + "{\"location\":" + " \"San" + " Francisc" + "o," + " CA\"}"` → `{"location": "San Francisco, CA"}`），然后在该块的 `content_block_stop` 时执行 `JSON.parse`。工具使用也支持细粒度流式输出（逐工具设置 `eager_input_streaming`），使 `partial_json` 分块更细。

---

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

Anthropic 将工具集成到 `user`/`assistant` 消息结构中，而不是使用 OpenAI 独立的 `tool` 角色和 `function` 包装器。逐字段对照如下：

| 概念 | Anthropic Messages API | OpenAI Chat Completions |
| --- | --- | --- |
| 工具定义包装器 | `tools[]` 中扁平的 `{"name","description","input_schema"}` | `tools[]` 中的 `{"type":"function","function":{"name","description","parameters"}}` |
| 工具模式键 | `input_schema`（JSON Schema） | `parameters`（JSON Schema） |
| “必须调用工具” | `tool_choice:{"type":"any"}` / `{"type":"tool","name":…}` | `tool_choice:"required"` / `{"type":"function","function":{"name":…}}` |
| 禁用并行调用 | `tool_choice:{…,"disable_parallel_tool_use":true}` | `parallel_tool_calls:false`（顶层） |
| 助手调用容器 | `content[]` 中的 `tool_use` **内容块** | 助手 `message` 上的 `tool_calls[]` |
| 调用 ID | `tool_use.id` = `toolu_…` | `tool_calls[].id` = `call_…` |
| 函数名 | `tool_use.name` | `tool_calls[].function.name` |
| 函数参数 | `tool_use.input` = **嵌套 JSON 对象**（已解析） | `tool_calls[].function.arguments` = **JSON 字符串**（必须执行 `JSON.parse`） |
| “调用了工具”的信号 | `stop_reason:"tool_use"` | `finish_reason:"tool_calls"` |
| 结果消息角色 | 包含一个或多个 `tool_result` 块的 `user` 消息 | 专用的 `{"role":"tool",…}` 消息 |
| 结果与调用关联 | `tool_result.tool_use_id` | `tool` 消息中的 `tool_call_id` |
| 结果载荷 | `tool_result.content` = 字符串**或**块数组（文本/图像/文档） | `tool` 消息中的 `content` = 字符串 |
| 错误结果 | 带 `is_error:true` 的 `tool_result` | 没有专用标志，在 `content` 中编码 |
| 系统提示词 | 顶层 `system` 参数；受支持的测试版模型还可能接受对话中途的 `system` 消息 | `{"role":"system",…}` 消息 |
| 流式参数 | `input_json_delta.partial_json` 片段 | `tool_calls[].function.arguments` 字符串增量 |

转换时的注意事项：

- **对象与字符串：** 输出 OpenAI 形式时使用 `JSON.stringify(tool_use.input)`；将 OpenAI 形式转换为 Anthropic 时使用 `JSON.parse(arguments)`。
- **角色重组：** 将 N 条 OpenAI `tool` 消息合并为一条包含 N 个 `tool_result` 块的 Anthropic `user` 消息（排在任何文本之前），反向转换同理。
- Anthropic 自定义工具**没有 `type:"function"`** 包装器；转换时需要添加或移除。
- ID 前缀不同（`toolu_` 与 `call_`）；绝不能假定一种格式的 ID 在另一种格式中也有效。

---

## 解析说明与注意事项 \{#parsing-notes--gotchas}

- **`input` 是对象，不是字符串。** 与 OpenAI 的 `arguments` 不同，不要对非流式响应中的 `tool_use.input` 执行 `JSON.parse`，它已经是对象。只有_流式_ `partial_json` 片段是字符串。
- **流式工具参数需要重组。** 普通的 `tool_use` 起始块具有 `input: {}`；OMP 还会保留块开始时提供的任何输入。按 `index` 缓冲 `partial_json`，在 `content_block_stop` 时完成；流中途的片段本身不是有效 JSON，例如 `{"location":`。细粒度流式输出可以将一个值拆分到多个块中。
- **`stop_reason` 的位置。** 流式输出中，`message_start` 中的 `stop_reason` 为 `null`，最终值（`"tool_use"`/`"end_turn"`）在 `message_delta` 到达，而不是 `message_stop`。`message_delta` 中的 `usage` 是**累计值**。
- **强制执行顺序约束。** `tool_result` 块必须位于其 `user` 消息最前面，并紧接助手的 `tool_use` 消息；每个 `tool_use.id` 都需要对应的 `tool_result.tool_use_id`，否则会得到 HTTP 400（“tool_use ids were found without tool_result blocks immediately after”）。
- **`tool_choice:any`/`tool` 会抑制前言。** API 会预填助手轮次，因此 `tool_use` 前不会出现引导性的 `text` 块；解析器不要依赖解释性文本的存在。
- **并行结果放在同一条消息中。** 将并行的 `tool_result` 拆到多条 `user` 消息中会违反约定；应一起发送。
- **将结果内容视为不可信数据。** 工具结果可能携带间接提示词注入，应将其保留在 `tool_result` 块中，绝不能提升为 `system`/`user` 文本。
- **服务器工具有所不同。** `server_tool_use` / `web_search_tool_result` 块由 Anthropic 生成和使用，绝不能为它们合成 `tool_result`。`stop_reason:"pause_turn"` 表示按原样重新发送响应，让长时间运行的服务器工具轮次继续。
- **扩展思考与工具。** 跨轮次保留 `thinking.signature` 和 `redacted_thinking.data`。原生适配器会重放带签名的推理，但会将无签名推理降级为文本，除非端点允许无签名重放。OMP 按上文所述调整强制工具选择，而不是发送不兼容的思考配置。
- **输出不是有效 XML。** Anthropic 使用正则表达式而不是 XML 解析器解析底层模型输出（“不要求输出为有效 XML”）。如果在令牌级重建提示词，不要假定格式良构；应依赖 API 返回的 JSON。
- **旧版和现代 XML 使用不同的标签集。** 旧版：`<invoke>` + 子元素 `<tool_name>` + 含各参数名称子标签的 `<parameters>`；结果位于 `<function_results>/<result>/<stdout>`。现代：`<invoke name="…">` + `<parameter name="…">`。混用会导致错误解析。旧格式还要求将 `</function_calls>` 作为 `stop_sequence` 传入，且未针对 Claude 3+ 优化。

### 旧版 XML 格式（次要，基于提示词，已完整验证，现已停用） \{#legacy-xml-format-secondary-prompt-based--fully-verified-now-retired}

Messages API 出现之前，工具完全在提示词中定义和调用。Anthropic 归档的“Legacy tool use”文档逐字规定了这一格式。

工具定义（位于系统提示词的 `<tools>` 块内）：

```text
<tool_description>
<tool_name>get_weather</tool_name>
<description>
Retrieves the current weather for a specified location.
Returns a dictionary with two fields:
- temperature: float, the current temperature in Fahrenheit
- conditions: string, a brief description of the current weather conditions
Raises ValueError if the provided location cannot be found.
</description>
<parameters>
<parameter>
<name>location</name>
<type>string</type>
<description>The city and state, e.g. San Francisco, CA</description>
</parameter>
</parameters>
</tool_description>
```

模型发出的调用（并行调用使用多个 `<invoke>`；将 `</function_calls>` 作为 `stop_sequence` 传入）：

```text
<function_calls>
<invoke>
<tool_name>get_weather</tool_name>
<parameters>
<location>San Francisco, CA</location>
</parameters>
</invoke>
</function_calls>
```

在下一个用户轮次中返回的结果：

```text
<function_results>
<result>
<tool_name>get_weather</tool_name>
<stdout>
59 degrees Fahrenheit, partly cloudy
</stdout>
</result>
</function_results>
```

错误结果：

```text
<function_results>
<error>
error message goes here
</error>
</function_results>
```

旧版系统提示词的前言（逐字摘自归档文档）如下：

```text
In this environment you have access to a set of tools you can use to answer the user's question.
You may call them like this:
<function_calls>
<invoke>
<tool_name>$TOOL_NAME</tool_name>
<parameters>
<$PARAMETER_NAME>$PARAMETER_VALUE</$PARAMETER_NAME>
...
</parameters>
</invoke>
</function_calls>

Here are the tools available:
<tools>
...one <tool_description> per tool...
</tools>
```

旧版说明：没有内置工具（所有工具都在提示词中定义）；Anthropic 建议工具数量不超过3-5个；模型通常将推理放在 `<scratchpad>` 中，将最终输出放在 `<answer>` 中。这种格式“已过时”，且“未针对 Claude 3 优化”，当前用途应使用 JSON Messages API。

---

## 来源 \{#sources}

仓库实现：

- [原生 Anthropic 适配器](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/providers/anthropic.ts)：`convertTools`、`normalizeAnthropicToolSchema`、`convertAnthropicMessages`、流式块转换及停止原因映射。
- [Anthropic 带内方言](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/anthropic.ts)：`AnthropicInbandScanner` 和 XML 渲染器。
- [共享渲染](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/rendering.ts)、[参数类型转换](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/coercion.ts)、[历史编码](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/history.ts)及[自管流投影](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/owned-stream.ts)。
- [工具目录](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/dialect/catalog.ts)和[智能体请求准备](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/agent/src/agent-loop.ts)。

外部格式参考：

- 工具使用概览：https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview
- 工具使用原理：https://docs.claude.com/en/docs/agents-and-tools/tool-use/how-tool-use-works
- 定义工具（工具模式、`input_schema`、`tool_choice`、构造的系统提示词）：https://docs.claude.com/en/docs/agents-and-tools/tool-use/define-tools
- 处理工具调用（`tool_use`/`tool_result`、`is_error`、顺序规则）：https://docs.claude.com/en/docs/agents-and-tools/tool-use/handle-tool-calls
- 并行工具使用：https://docs.claude.com/en/docs/agents-and-tools/tool-use/parallel-tool-use
- 流式消息（SSE 事件、`input_json_delta`、逐字摘录的工具使用流）：https://docs.claude.com/en/docs/build-with-claude/streaming
- Messages API 参考（`stop_reason` 枚举、响应形式、`tools`）：https://docs.claude.com/en/api/messages
- 旧版工具使用（归档，原样的 XML 标签与提示词）：https://web.archive.org/web/20240528231249/https://docs.anthropic.com/en/docs/legacy-tool-use ；另有仍在线的本地化副本，例如 https://docs.anthropic.com/de/docs/legacy-tool-use （英文路径现已重定向到工具使用概览）
