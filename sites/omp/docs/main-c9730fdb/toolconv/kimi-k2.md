---
title: "Kimi K2 工具调用格式"
description: "Oh My Pi 官方仓库文档：Kimi K2 工具调用格式。"
---

# Kimi K2 工具调用格式 \{#kimi-k2-tool-calling-format}

这是 Moonshot AI **Kimi K2** 系列（`moonshotai/Kimi-K2-Instruct` 和 `-Base`，`model_type: "kimi_k2"`，1 万亿参数 MoE）的原生工具调用约定。它采用基于 TikToken 分词器（160K 词表）的类 ChatML 封装：每个轮次都是 `<|im_{class}|>{name}<|im_middle|>{body}<|im_end|>`，工具调用在助手轮次中输出，由专用的 `<|tool_calls_section_begin|>…<|tool_calls_section_end|>` 块包裹。所有控制 token 都是纯 ASCII 的 `<|…|>` 形式（与 DeepSeek 不同，没有全角/Unicode 变体）。推理服务器通过解析器将原始流转换为 OpenAI 风格的 `tool_calls`：vLLM 和 SGLang 都提供 `--tool-call-parser kimi_k2`（vLLM 还要求 `--enable-auto-tool-choice`）。聊天模板（自 2025.8.11 更新起为独立的 `chat_template.jinja`）注入工具模式并渲染逐轮标记。

本文已对照模型卡、官方 `docs/tool_call_guidance.md` 和 `docs/deploy_guidance.md`（GitHub `MoonshotAI/Kimi-K2`）、HF 仓库中的原始 `chat_template.jinja` 和 `tokenizer_config.json`（在本地渲染以生成下文逐字节精确的流），以及 vLLM 的 `kimi_k2` 工具解析器源码进行核实。

下文的上游模板/分词器参考与 OMP 的
提示词驱动实现不同。OMP 不运行该模板，也不注入其
默认系统提示词；其当前行为见
[omp / pi 转换器行为](#omp--pi-converter-behavior)。

## 特殊 token \{#special-tokens}

手动解析所需的五个工具调用标记，以及 ChatML 外层封装标记。Token ID 来自 `tokenizer_config.json`（`added_tokens_decoder`）。

| Token（原样） | ID | 用途 |
| --- | --- | --- |
| `<\|tool_calls_section_begin\|>` | 163595 | 开始助手轮次内的工具调用区段 |
| `<\|tool_call_begin\|>` | 163597 | 开始一次独立的工具调用 |
| `<\|tool_call_argument_begin\|>` | 163598 | 分隔工具调用 ID 与其 JSON 参数 |
| `<\|tool_call_end\|>` | 163599 | 结束一次独立的工具调用 |
| `<\|tool_calls_section_end\|>` | 163596 | 结束工具调用区段 |
| `<\|im_system\|>` | 163594 | 系统类轮次的开始标记（`system`、`tool`、`tool_declare`） |
| `<\|im_user\|>` | 163587 | 用户轮次的开始标记 |
| `<\|im_assistant\|>` | 163588 | 助手轮次的开始标记 |
| `<\|im_middle\|>` | 163601 | 分隔角色/名称头部与消息正文 |
| `<\|im_end\|>` | 163586 | 结束任意轮次 |
| `[BOS]` | 163584 | 序列开始 token（见说明；聊天模板不输出它） |
| `[EOS]` | 163585 | 序列结束 token |

精确性说明：

- 五个工具 token 使用 ASCII 竖线 `|`（U+007C）和下划线；请精确复现。Kimi K2 中没有全角竖线（`｜`）或 `▁` 变体。
- `<|im_middle|>` 是唯一 ID（163601）与其他 token（163586-163599）不连续的封装 token；`163600` 槽位未使用。
- 图像输入通过内容宏渲染为字面序列 `<|media_start|>image<|media_content|><|media_pad|><|media_end|>`。这些媒体标记出现在模板中，但**没有**注册到 `added_tokens_decoder`，因此会作为普通文本而非单个特殊 token 分词。它们与文本工具调用无关，这里列出只是为了完整性。

## 角色 / 通道 / 轮次结构 \{#roles--channels--turn-structure}

Kimi K2 使用 ChatML 风格的封装。每条消息渲染为：

```text
<|im_{class}|>{name}<|im_middle|>{body}<|im_end|>
```

- 开始标记 token 恰有**三个**，由 `role` 选择：
   - `user` → `<|im_user|>`
   - `assistant` → `<|im_assistant|>`
   - 其他所有角色（`system`、`tool` 和合成的 `tool_declare`）→ `<|im_system|>`
- 标记与 `<|im_middle|>` 之间的 `{name}` 段是 `message.name or message.role`。这是 Kimi K2 唯一的“通道”/子角色标签。普通轮次中，它就是字面量 `system`、`user` 或 `assistant`；工具结果轮次中，如果提供了工具的 `name`（函数名），就使用它，否则使用 `tool`；工具模式轮次中，它是字面量 `tool_declare`。
- `<|im_end|>` 结束每个轮次。聊天模板**不**输出 `[BOS]`/`[EOS]`；轮次边界完全由 `<|im_*|>` 标记确定（分词器基于 TikToken，未设置 `add_bos_token`/`add_eos_token`，手动解析流程将渲染后的模板直接送入 `/completions`）。
- **默认系统提示词：**如果第一条消息不是 `system` 消息，模板会在第一个轮次前注入 `<|im_system|>system<|im_middle|>You are Kimi, an AI assistant created by Moonshot AI.<|im_end|>`。
- **生成提示词：**使用 `add_generation_prompt=True` 时，模板以 `<|im_assistant|>assistant<|im_middle|>` 结尾，模型从这里开始生成。
- **思考/推理：**`Kimi-K2-Instruct` 是没有长思考的“反射级”模型，因此此格式没有推理通道。（思考变体单独处理，vLLM 提供以 `</think>` token 为依据的独立 `kimi_k2` 推理解析器，但这不在本文记录的 Instruct 工具调用格式范围内。）

## 工具定义 \{#tool-definitions}

可用工具在提示词最顶部（任何系统/用户轮次之前）的单个专用轮次中声明，使用 `<|im_system|>` 标记下的合成子角色 `tool_declare`：

```text
<|im_system|>tool_declare<|im_middle|>{TOOLS_JSON}<|im_end|>
```

`{TOOLS_JSON}` 是标准 OpenAI 风格的 `tools` 数组，使用**紧凑分隔符** `(',', ':')` 序列化为 JSON（无空格）。数组元素原样传入，即每个元素都是带有 JSON-Schema `parameters` 对象的 `{"type":"function","function":{"name":…,"description":…,"parameters":{…}}}`。示例（单个工具，与实际输出完全一致）：

```text
<|im_system|>tool_declare<|im_middle|>[{"type":"function","function":{"name":"get_weather","description":"Get weather information. Call this tool when the user needs to get weather information","parameters":{"type":"object","required":["city"],"properties":{"city":{"type":"string","description":"City name"}}}}}]<|im_end|>
```

只有 `tools` 非空时才渲染 `tool_declare` 轮次。

## 工具调用格式 \{#tool-call-format}

模型决定调用函数时，会在助手轮次内、自然语言内容之后输出一个工具调用区段。最小单次调用（这是 `<|im_assistant|>assistant<|im_middle|>` 后的助手生成内容）：

```text
<|tool_calls_section_begin|><|tool_call_begin|>functions.get_weather:0<|tool_call_argument_begin|>{"city": "Beijing"}<|tool_call_end|><|tool_calls_section_end|>
```

单次调用的结构：

```text
<|tool_call_begin|>  functions.{func_name}:{idx}  <|tool_call_argument_begin|>  {JSON arguments}  <|tool_call_end|>
```

- `<|tool_call_begin|>` 和 `<|tool_call_argument_begin|>` 之间的 token 是**工具调用 ID**，固定形式为 `functions.{func_name}:{idx}`。
   - `functions.` 是字面前缀（不是从工具模式推导而来）。
   - `{func_name}` 是被调用函数的名称；函数名通过反向解析此 ID 恢复，而非从独立字段获取。
   - `{idx}` 是当前助手轮次内**从 0 开始的调用索引**（第一次调用为 `0`，第二次为 `1`，以此类推）。
- `<|tool_call_argument_begin|>` 之后是原始 JSON 参数对象（例如 `{"city": "Beijing"}`），以 `<|tool_call_end|>` 结束。
- 此轮次的所有调用都位于一对 `<|tool_calls_section_begin|>` / `<|tool_calls_section_end|>` 之间。所有助手文本内容都位于 `<|tool_calls_section_begin|>` 之前。
- 整个助手轮次仍由 `<|im_end|>` 关闭，补全的 `finish_reason` 变为 `tool_calls`。

## 多次 / 并行工具调用 \{#multiple--parallel-tool-calls}

一个轮次中的两次或更多调用会在同一区段内输出为连续的 `<|tool_call_begin|>…<|tool_call_end|>` 块，索引逐调用递增。两次并行调用的原始助手输出：

```text
<|tool_calls_section_begin|><|tool_call_begin|>functions.get_weather:0<|tool_call_argument_begin|>{"city": "Beijing"}<|tool_call_end|><|tool_call_begin|>functions.get_weather:1<|tool_call_argument_begin|>{"city": "Shanghai"}<|tool_call_end|><|tool_calls_section_end|>
```

注意 ID `functions.get_weather:0` 和 `functions.get_weather:1`：函数相同，末尾索引不同。索引按轮次计数（下一助手轮次重置为 `0`）。

## 工具结果格式 \{#tool-result-format}

工具执行结果以 `role: "tool"` 轮次回传。由于 `tool` 不是 `user`/`assistant`，它在 `<|im_system|>` 标记下渲染；子角色标签在消息有 `name`（函数名）时使用该值，否则为 `tool`。正文是字面的 `## Return of {tool_call_id}` 标题行，后接结果内容：

```text
<|im_system|>get_weather<|im_middle|>## Return of functions.get_weather:0
{"weather": "Sunny"}<|im_end|>
```

- `{tool_call_id}` 原样回显发起调用的 ID（`functions.get_weather:0`），模型据此将结果关联到产生它的调用。
- 结果 `content` 原样插入标题之后的一行；调用方通常传入 JSON 字符串（例如 `json.dumps(tool_result)`）。
- 如果 `tool` 消息省略了 `name`，封装就变为 `<|im_system|>tool<|im_middle|>## Return of …`。

## 端到端示例 \{#end-to-end-example}

一次完整的多轮天气交互。以下是精确的渲染流（显式提供 system + user；轮次内的换行是字面换行，轮次之间则连续相接）。

**阶段 1：送入模型的提示词**（已设置 `tools`，`add_generation_prompt=True`）：

```text
<|im_system|>tool_declare<|im_middle|>[{"type":"function","function":{"name":"get_weather","description":"Get weather information. Call this tool when the user needs to get weather information","parameters":{"type":"object","required":["city"],"properties":{"city":{"type":"string","description":"City name"}}}}}]<|im_end|><|im_system|>system<|im_middle|>You are Kimi, an AI assistant created by Moonshot AI.<|im_end|><|im_user|>user<|im_middle|>What's the weather like in Beijing today? Use the tool to check.<|im_end|><|im_assistant|>assistant<|im_middle|>
```

**助手生成内容**（模型输出；服务器报告 `finish_reason: "tool_calls"`）：

```text
<|tool_calls_section_begin|><|tool_call_begin|>functions.get_weather:0<|tool_call_argument_begin|>{"city": "Beijing"}<|tool_call_end|><|tool_calls_section_end|><|im_end|>
```

**阶段 2：下一轮次的提示词**，追加助手工具调用轮次和工具结果轮次之后（`add_generation_prompt=True`）：

```text
<|im_system|>tool_declare<|im_middle|>[{"type":"function","function":{"name":"get_weather","description":"Get weather information. Call this tool when the user needs to get weather information","parameters":{"type":"object","required":["city"],"properties":{"city":{"type":"string","description":"City name"}}}}}]<|im_end|><|im_system|>system<|im_middle|>You are Kimi, an AI assistant created by Moonshot AI.<|im_end|><|im_user|>user<|im_middle|>What's the weather like in Beijing today? Use the tool to check.<|im_end|><|im_assistant|>assistant<|im_middle|><|tool_calls_section_begin|><|tool_call_begin|>functions.get_weather:0<|tool_call_argument_begin|>{"city": "Beijing"}<|tool_call_end|><|tool_calls_section_end|><|im_end|><|im_system|>get_weather<|im_middle|>## Return of functions.get_weather:0
{"weather": "Sunny"}<|im_end|><|im_assistant|>assistant<|im_middle|>
```

**最终助手生成内容**（模型生成以 `<|im_end|>` 结束的自然语言回答；`finish_reason: "stop"`）：

```text
It's sunny in Beijing today.<|im_end|>
```

## OpenAI 兼容 API 映射 \{#openai-compatible-api-mapping}

启用服务器解析器（`--tool-call-parser kimi_k2`）后，原始流按如下方式映射到 Chat Completions 结构：

- `choices[].finish_reason` = `"tool_calls"`，当轮次包含工具调用区段时（否则为 `"stop"`）。
- `choices[].message.tool_calls[]`：每个 `<|tool_call_begin|>…<|tool_call_end|>` 块对应一个条目：
   - `.id` = 原样保留的原始调用 ID，例如 `"functions.get_weather:0"`。
   - `.type` = `"function"`。
   - `.function.name` = 从 ID 中解析出的函数名。vLLM 计算 `id.split(":")[0].split(".")[-1]` → `"get_weather"`。
   - `.function.arguments` = **JSON 字符串**（从 `<|tool_call_argument_begin|>` 与 `<|tool_call_end|>` 之间捕获的原始文本），例如 `"{\"city\": \"Beijing\"}"`。客户端使用前对它执行 `json.loads()`。
- 工具结果以如下形式的消息回传：

   ```json
   {
   	"role": "tool",
   	"tool_call_id": "functions.get_weather:0",
   	"name": "get_weather",
   	"content": "{\"weather\": \"Sunny\"}"
   }
   ```

   `tool_call_id` 必须等于调用返回的 `id`；`name` 成为 `<|im_system|>{name}<|im_middle|>` 子角色；`content` 成为 `## Return of …` 之后的正文。

- 流式传输：增量以带有 `index` 的 `choices[].delta.tool_calls[]` 到达；调用头部完整后，函数 `name`/`id` 开始流式输出，随后 `function.arguments` 以需拼接的增量字符串片段流式输出（标准 OpenAI 工具调用流式组装）。

Moonshot 托管 API（`platform.moonshot.ai`）同时提供 OpenAI 和 Anthropic 兼容端点；Anthropic 兼容端点按 `real_temperature = request_temperature * 0.6` 缩放温度。`Kimi-K2-Instruct` 的推荐采样温度为 `0.6`。

## 解析说明与易错点 \{#parsing-notes--gotchas}

- **各参考实现的 ID → 名称解析不同。**官方
  `tool_call_guidance.md` 使用 `function_id.split('.')[1].split(':')[0]`，
  而 vLLM 和 omp 取冒号前按点分隔的最后一段。
  后者容忍额外的命名空间段，但两种约定
  都无法将字面点号保留为函数名的一部分；工具名应当
  遵循文档所述的 `functions.{name}:{idx}` 形式，
  `{name}` 中不含点号。
- **提取正则表达式也不同。**指导文档：`<\|tool_call_begin\|>\s*(?P<tool_call_id>[\w\.]+:\d+)\s*<\|tool_call_argument_begin\|>\s*(?P<function_arguments>.*?)\s*<\|tool_call_end\|>`。vLLM：ID 字符类为 `[^<]+:\d+`，参数正文使用否定前瞻 `(?:(?!<\|tool_call_begin\|>).)*?`，避免合并相邻调用。两者都使用 `DOTALL` 运行。
- **`skip_special_tokens` 必须为 False。**解析器依赖字面标记文本在反分词后保留下来；启用工具且 `tool_choice != "none"` 时，vLLM 强制设置 `skip_special_tokens = False`。如果标记被剥离，就检测不到工具调用。
- **参数是未经验证的原始文本。**模型在参数标记和 `<|tool_call_end|>` 之间输出的任何内容都会直接作为 `arguments` 字符串传递；它必须是有效 JSON，才能供下游 `json.loads` 使用，而模型可能输出格式错误/截断的 JSON。执行前请验证。
- **索引语义。**`{idx}` 是从 `0` 开始的逐轮调用计数器，不是全局计数器，每个助手轮次都会重置。不要假定 ID 跨轮次唯一，持久化历史时应结合轮次消除歧义。
- **流式标记拆分。**区段和调用标记可能被拆到不同 token 边界。
  vLLM 暂存与标记部分匹配的末尾后缀，并流式输出
  参数片段。omp 的自主管理扫描器也暂存部分标记，但会缓冲
  调用参数直到 `<|tool_call_end|>`，且不发出 `toolArgDelta` 事件。
- **`finish_reason` 因引擎而异。**官方指南明确警告，工具调用的终止 `finish_reason`“可能因引擎不同而变化”；以 `finish_reason == "tool_calls"` 为条件循环，但要做好防御性处理。
- **引擎回退。**Kimi K2 复用 DeepSeek-V3 架构；`config.json` 设置 `model_type: "kimi_k2"`，使引擎应用正确的解析器。如果为了兼容而强制设置 `model_type: "deepseek_v3"`，就没有原生 Kimi 工具解析器可用，必须手动解析 `<|tool_calls_section_*|>` 标记。
- **解析器可用性。**vLLM 同时提供 Python（`KimiK2ToolParser`）和较新的 Rust 工具解析器；SGLang 实现了自己的 `kimi_k2` 解析器。它们都以本文记录的同一组五个标记和 `functions.{name}:{idx}` ID 约定为依据。
- **空白附带现象。**未提供 `system` 消息时，模板注入默认系统提示词，第一个 `<|im_user|>` 标记之前可能出现少量 `\n  `（换行 + 两个空格）。这无害（会在标记周围分词），但提供显式系统消息可得到上文展示的干净流。

## omp / pi 转换器行为 \{#omp--pi-converter-behavior}

仓库的 `kimi` 方言是**自主管理的带内转换器**。可通过智能体配置中的
`tools.format: kimi` 或 `PI_DIALECT=kimi` 选择它。
默认的 `tools.format: auto` 保留提供方原生工具，除非
模型设置了 `supportsTools: false`；此时归类为 Kimi 的模型 ID 会解析
为 `kimi`。每次提供方请求都会重新计算选择。`PI_DIALECT`
在配置解析未得到自主管理方言时作为回退，因此选择 `native` 时
应取消设置它，以确保使用提供方原生调用。

存在工具时，智能体向系统提示词追加 Kimi 指南和共享的紧凑
`<tools>` 目录，移除提供方原生工具和
工具选择，将先前的调用/结果改写为文本，并将流式
输出转换回标准 pi 事件。此目录不是上文展示的上游
`tool_declare` 轮次。

渲染器为每批助手调用输出一个区段。它会保留
已经以 `functions.` 开头的现有 ID；否则生成
`functions.{name}:{batchIndex}`。工具结果渲染为连续的
`<|im_system|>{name}<|im_middle|>## Return of …<|im_end|>` 轮次，标准
工具结果消息则折叠为一条包含
这些文本的合成用户消息。结果图像仍作为图像块放在渲染文本之后。
带调用的助手历史缩减为正文加渲染后的调用；
原始思考块被省略。独立的 `renderTranscript`
API 可以渲染思考和完整的 Kimi 轮次封装。

扫描器只识别区段内的调用。参数标记
到达后，它会修剪头部取得调用 ID，从
第一个冒号前按点分隔的最后一段推导名称，并发出 `toolStart`。它
缓冲参数正文直到 `<|tool_call_end|>`，然后应用共享的
修复型 JSON 解析器并发出 `toolEnd`；它**不**发出增量
参数变化。无效/非对象的完整参数规范化为 `{}`。
`toolEnd.rawBlock` 保留精确的调用内容，包括头部/参数
空白，但不包括外围区段。扫描器不
验证 `functions.NAME:INDEX` 约定、工具是否在目录中或参数
模式；即使头部为空，也可以发出 `toolStart`。
如果 EOF 在 `toolStart` 之后、闭合标记之前到达，就不会发出 `toolEnd`，
但标准的 `{}` 调用仍保留，并可能在正常
停止时派发。只有始终未到达参数标记的不完整输入
才会在不创建调用的情况下被丢弃。已识别区段内的区段标记不会出现在可见
文本中，而区段外孤立的调用标记或区段结束
标记仍是普通文本。区段内的非调用文本
会被丢弃。已完成的调用不要求区段闭合；
提供方的 `length` 停止仍保持为 `length`，而非 `toolUse`。

工具区段外默认启用思考解析，将
`<think>…</think>` 映射为思考事件。未终止的块会保留其
内容，并在刷新时发出 `thinkingEnd`。`parseThinking: false` 会让
区段外的思考标记保留为可见文本。

模型自行编写的第一个 `<|im_system|>` 是
自主管理流中的伪造结果边界。默认的 `tools.abortOnFabricatedResult: true` 会在此中止
生成；禁用它会继续排空流，但丢弃后续内容。
如果提供方仍输出原生结构化调用，第一个具名原生
或带内调用将决定该轮次使用的通道；另一个
通道的调用会被丢弃，以避免重复派发。

## 来源 \{#sources}

- `packages/ai/src/dialect/kimi.ts`、`coercion.ts` 和 `kimi.md`：自主管理扫描器、渲染及注入的指南。
- `packages/ai/src/dialect/catalog.ts`、`history.ts` 和 `owned-stream.ts`：提示词/历史转换、投影及伪造结果边界。
- `packages/agent/src/agent-loop.ts`：逐请求选择、`PI_DIALECT` 及原生工具选择抑制。
- `packages/catalog/src/identity/dialect.ts` 和 `packages/coding-agent/src/sdk.ts`：模型家族关联和 `tools.format` 解析。

- 模型卡（工具调用一节、OpenAI 风格示例、部署/API 说明）：https://huggingface.co/moonshotai/Kimi-K2-Instruct
- 官方工具调用指导（标记、ID 约定、手动解析器、`extract_tool_call_info`）：https://raw.githubusercontent.com/MoonshotAI/Kimi-K2/main/docs/tool_call_guidance.md （HF 的 `resolve`/`blob` 路径重定向到了模型卡；已对照此 GitHub 原始文件核实）
- 部署指南（`--tool-call-parser kimi_k2`、`--enable-auto-tool-choice`、SGLang 标志、`model_type` 回退）：https://raw.githubusercontent.com/MoonshotAI/Kimi-K2/main/docs/deploy_guidance.md
- 聊天模板（`chat_template.jinja`，在本地渲染以生成逐字节精确的流）：https://huggingface.co/moonshotai/Kimi-K2-Instruct/resolve/main/chat_template.jinja
- 分词器配置（`added_tokens_decoder` 中的特殊 token ID）：https://huggingface.co/moonshotai/Kimi-K2-Instruct/resolve/main/tokenizer_config.json
- vLLM `kimi_k2` 工具解析器（标记、正则表达式、名称解析、`skip_special_tokens`、流式传输）：https://github.com/vllm-project/vllm/blob/main/vllm/tool_parsers/kimi_k2_tool_parser.py
- vLLM 添加该解析器的 PR：https://github.com/vllm-project/vllm/pull/20789
- vLLM 工具调用文档：https://docs.vllm.ai/en/latest/features/tool_calling/
