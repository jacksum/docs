# JSON 事件流 \{#json-event-stream}

JSON 模式为单次调用输出结构化进度：

```bash
pi --mode json "Review this repository"
```

Pi 先写出一个会话头，再写出会话事件。传入的提示词全部处理完毕后，进程退出。RPC 模式输出相同格式的会话事件，但不输出会话头，因为它是双向、长期运行的协议。参阅 [RPC 模式](./rpc.md)。

本页定义 JSON 模式和 RPC 模式共用的事件。消息值遵循[共享消息类型](./message-types.md)。

## 记录边界与进程 I/O \{#framing-and-process-io}

事件流严格使用 JSONL 划分记录。每条记录都是一个以 LF（`\n`）结尾的 JSON 对象。只用 LF 分割记录，并去掉它前面可能存在的回车符。Unicode 行分隔符和段落分隔符在 JSON 字符串中是有效字符，不是记录边界。

Node.js 的 `readline` 也会把这些 Unicode 分隔符视为边界，因此不适用于此事件流。请使用字节流或 UTF-8 流解码器，并按 LF 分割。

持续读取标准输出。如果停止读取，管道缓冲区填满后可能阻塞 Pi。标准输出专供 JSONL，诊断信息和应用日志写入标准错误。

## 会话头 \{#session-header}

JSON 模式的第一条记录是当前的[会话头](./session-format.md#sessionheader)：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path"}
```

RPC 模式不会输出这一记录。请使用 [`get_state`](./rpc-commands.md#get_state)获取当前的会话 ID 和文件。

## 事件顺序 \{#event-sequence}

一次基本运行会生成类似下面的记录：

```json
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":"Review this repository","timestamp":1733234401000}}
{"type":"message_end","message":{"role":"user","content":"Review this repository","timestamp":1733234401000}}
{"type":"message_start","message":{"role":"assistant","content":[],"stopReason":"pending","...":"..."}}
{"type":"message_update","usage":{"...":"..."},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello"}}
{"type":"message_end","message":{"role":"assistant","...":"..."}}
{"type":"turn_end","message":{"role":"assistant","...":"..."},"toolResults":[]}
{"type":"agent_end","messages":[{"...":"..."}],"willRetry":false}
{"type":"agent_settled","aborted":false}
```

`agent_end` 结束一次底层智能体运行。自动重试、溢出恢复、压缩重试、引导消息或后续工作仍可能继续。`agent_settled` 表示这次会话级运行已没有剩余的自动工作。

## 智能体与轮次事件 \{#agent-and-turn-events}

| 事件 | 字段 | 含义 |
|---|---|---|
| `agent_start` | 无 | 一次底层智能体运行开始。 |
| `agent_end` | `messages`、`willRetry` | 此次底层运行结束。`messages` 包含该次运行生成的消息。 |
| `agent_settled` | `aborted` | Pi 不会再因重试、压缩恢复或排队消息而自动继续。运行因中止而结束时，`aborted` 为 `true`。 |
| `turn_start` | 无 | 一个助手轮次开始。 |
| `turn_end` | `message`、`toolResults` | 一次助手回复及其引发的工具调用已完成。 |

一个轮次包含一次助手回复，以及该回复产生的所有工具调用和工具结果。

## 消息事件 \{#message-events}

| 事件 | 字段 | 含义 |
|---|---|---|
| `message_start` | `message` | 一条消息开始。 |
| `message_update` | `usage`、`assistantMessageEvent` | 一条助手消息输出了内容块更新。 |
| `message_end` | `message` | 一条消息完成。以此事件携带的消息作为最终版本。 |

### 重建流式消息 \{#reconstruct-streaming-messages}

协议传输的 `message_update` 记录只含增量。它们省略 SDK 事件中累积的 `message` 字段和所有 `assistantMessageEvent.partial` 快照，使事件流大小保持线性增长。

嵌套事件取以下类型之一：

| 类型 | 除 `type` 外的字段 | 含义 |
|---|---|---|
| `start` | 无 | 模型提供方的事件流开始。传输时省略其累积的 `partial` 字段。 |
| `text_start` | `contentIndex` | 文本块开始。 |
| `text_delta` | `contentIndex`、`delta` | 向文本块追加文本。 |
| `text_end` | `contentIndex`、`content` | 文本块结束，以此事件携带的内容为准。 |
| `thinking_start` | `contentIndex` | 思考块开始。 |
| `thinking_delta` | `contentIndex`、`delta` | 向块中追加思考文本。 |
| `thinking_end` | `contentIndex`、`content` | 思考块结束，以此事件携带的内容为准。 |
| `toolcall_start` | `contentIndex`、`id`、`toolName` | 工具调用块开始。 |
| `toolcall_delta` | `contentIndex`、`delta` | 追加序列化的参数数据。 |
| `toolcall_end` | `contentIndex`、`toolCall` | 工具调用结束，携带完整的 `ToolCall`。 |
| `done` | `reason`、`message` | 模型提供方的事件流成功完成。 |
| `error` | `reason`、`error` | 模型提供方的事件流结束，携带错误或中止消息。 |

正常的智能体循环会把提供方级别的 `start`、`done` 和 `error` 转成 `message_start` 和 `message_end` 会话事件，而不是作为 `message_update` 输出。调用方自行构造匹配的会话事件时，导出的 `JsonAgentSessionEvent` 转换仍接受这些类型。

使用 `contentIndex` 识别内容块。实时显示时可以缓存 `delta` 字段，但应使用 `text_end`、`thinking_end` 或 `toolcall_end` 中的完整内容替换重建的数据。收到 `message_end.message` 时，用它替换整条未完成的消息。

顶层的 `usage` 是模型提供方对此次助手回复报告的最新累计用量。有些提供方在流式传输期间不报告用量，此值可能直到回复完成前都是零。

```json
{"type":"message_update","usage":{"input":100,"output":1,"cacheRead":0,"cacheWrite":0,"totalTokens":101,"cost":{"input":0,"output":0,"cacheRead":0,"cacheWrite":0,"total":0}},"assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"Hello "}}
```

## 工具执行事件 \{#tool-execution-events}

| 事件 | 字段 | 含义 |
|---|---|---|
| `tool_execution_start` | `toolCallId`、`toolName`、`args` | 工具开始执行。 |
| `tool_execution_update` | `toolCallId`、`toolName`、`args`、`partialResult` | 工具报告了部分结果。 |
| `tool_execution_end` | `toolCallId`、`toolName`、`result`、`isError`、`durationMs` | 工具执行结束。`durationMs` 是用单调时钟测量的 `execute()` 耗时。工具未运行时没有该字段。 |

使用 `toolCallId` 关联同一次工具执行的各个事件。`partialResult` 是该工具提供的最新部分结果。它替换之前的更新，还是在其基础上增补，取决于该工具对返回结果的约定。

```json
{"type":"tool_execution_start","toolCallId":"call_abc123","toolName":"bash","args":{"command":"ls -la"}}
{"type":"tool_execution_update","toolCallId":"call_abc123","toolName":"bash","args":{"command":"ls -la"},"partialResult":{"content":[{"type":"text","text":"partial output"}],"details":{}}}
{"type":"tool_execution_end","toolCallId":"call_abc123","toolName":"bash","result":{"content":[{"type":"text","text":"complete output"}],"details":{}},"isError":false}
```

## 队列与状态事件 \{#queue-and-state-events}

| 事件 | 字段 | 含义 |
|---|---|---|
| `queue_update` | `steering`、`followUp` | 待处理的引导消息或后续消息队列发生变化。两个字段都包含各自当前的完整队列。 |
| `entry_appended` | `entry` | 扩展通过 `pi.appendEntry()` 追加了自定义会话条目。 |
| `session_info_changed` | `name` | 会话显示名称已更改。没有 `name` 表示名称已清除。 |
| `thinking_level_changed` | `level` | 当前思考级别已更改。 |

`entry` 使用持久化的[会话条目类型](./session-format.md#entry-types)。

## 上下文压缩事件 \{#compaction-events}

`compaction_start` 报告开始压缩的原因：

```json
{"type":"compaction_start","reason":"threshold"}
```

`reason` 为 `"manual"`、`"threshold"` 或 `"overflow"`。

压缩成功时，`compaction_end` 包含结果：

```json
{
  "type": "compaction_end",
  "reason": "threshold",
  "result": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "estimatedTokensAfter": 32000,
    "usage": {"...": "..."},
    "details": {}
  },
  "aborted": false,
  "willRetry": false
}
```

如果压缩已中止，则没有 `result`，且 `aborted` 为 `true`。如果压缩失败，则没有 `result`，`aborted` 为 `false`，并由 `errorMessage` 描述失败原因。溢出恢复成功后，在 Pi 重试提示词前会将 `willRetry` 设为 `true`。

结果的具体含义见[上下文压缩与分支摘要](./compaction.md)。

## 重试事件 \{#retry-events}

助手轮次重试输出：

```json
{"type":"auto_retry_start","attempt":1,"maxAttempts":3,"delayMs":2000,"errorMessage":"529 overloaded"}
{"type":"auto_retry_end","success":true,"attempt":2}
```

最终失败时，`auto_retry_end` 包含 `success: false` 和字符串 `finalError`。

上下文压缩和分支摘要重试输出：

```json
{"type":"summarization_retry_scheduled","attempt":1,"maxAttempts":3,"delayMs":2000,"errorMessage":"terminated"}
{"type":"summarization_retry_attempt_start","source":"compaction","reason":"threshold"}
{"type":"summarization_retry_finished"}
```

对于分支摘要，`source` 为 `"branchSummary"`，不包含 `reason`。压缩重试的 `reason` 为 `"manual"`、`"threshold"` 或 `"overflow"`。

## RPC 专用事件 \{#rpc-only-events}

直接调用 RPC [`bash`](./rpc-commands.md#bash)命令时，每个输出块都会产生一个 `bash_execution_update` 事件。可选的 `id` 与命令 ID 一致。最终命令响应中可能包含截断后的输出，但这些事件会流式传输完整输出：

```json
{"type":"bash_execution_update","id":"req-1","delta":"total 48\n"}
```

扩展处理器抛出异常时，RPC 还会输出 `extension_error`：

```json
{"type":"extension_error","extensionPath":"/path/to/extension.ts","event":"tool_call","error":"Error message"}
```

扩展界面记录属于独立的 RPC 子协议，不是 `AgentSessionEvent` 值。参阅 [RPC 扩展界面](./rpc-extension-ui.md)。

## TypeScript 类型 \{#typescript-types}

SDK 的 `AgentSessionEvent` 为进程内使用方提供累积的流式快照。JSON 模式和 RPC 模式只转换 `message_update`：

```typescript
type WithoutPartial<T> = T extends { partial: unknown } ? Omit<T, "partial"> : T;

type JsonAssistantMessageEvent<T> = T extends { type: "toolcall_start"; partial: unknown }
  ? WithoutPartial<T> & { id: string; toolName: string }
  : WithoutPartial<T>;

type JsonAgentSessionEvent =
  | Exclude<AgentSessionEvent, { type: "message_update" }>
  | {
      type: "message_update";
      usage: Usage;
      assistantMessageEvent: JsonAssistantMessageEvent<AssistantMessageEvent>;
    };
```

使用 `@earendil-works/pi-coding-agent` 导出的 `JsonAgentSessionEvent` 类型。具体实现见 [`json-event.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/modes/json-event.ts)。

## 示例 \{#example}

打印单次运行输出的完整消息：

```bash
pi --mode json "List files" 2>/dev/null | jq -c 'select(.type == "message_end")'
```
