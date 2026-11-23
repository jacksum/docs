# 消息类型 \{#message-types}

Pi 在 SDK 状态、生命周期事件、RPC 响应和持久化的会话消息条目中使用 `AgentMessage`。本页定义这些通用消息及其内容块。

消息时间戳是以毫秒为单位的 Unix 时间戳，与[会话条目](./session-format.md#entry-base)使用的 ISO 8601 时间戳不同。

源码定义：

- [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts) 定义面向模型提供方的消息和内容块。
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/agent/src/types.ts) 定义可扩展的 `AgentMessage` 联合类型。
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/messages.ts) 添加 coding-agent 的消息角色。

## 内容块 \{#content-blocks}

### TextContent \{#textcontent}

```typescript
interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}
```

`textSignature` 包含模型提供方专用的消息元数据。应将其视为不透明数据。

### ImageContent \{#imagecontent}

```typescript
interface ImageContent {
  type: "image";
  data: string;
  mimeType: string;
}
```

`data` 是以 Base64 编码的图片数据。`mimeType` 标识媒体类型，例如 `image/png` 或 `image/jpeg`。

### ThinkingContent \{#thinkingcontent}

```typescript
interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}
```

思考签名包含模型提供方专用的重放数据。应将其视为不透明数据。标记为 `redacted` 的内容块可能不含可见的思考文本，但 `thinkingSignature` 仍可保留加密载荷。

### ToolCall \{#toolcall}

```typescript
interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
  thoughtSignature?: string;
  namespace?: string;
}
```

`thoughtSignature` 由模型提供方定义。`namespace` 标识动态加载或带命名空间的工具所使用的 OpenAI Responses 命名空间。

## 用量 \{#usage}

助手消息始终包含用量。如果工具内部执行了模型调用，工具结果也可以包含用量。

```typescript
interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
  reasoning?: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

如果存在 `reasoning`，它已经计入 `output`，不要重复相加。`cacheWrite1h` 是 `cacheWrite` 中保留期限为一小时的那部分写入用量。

## 基础消息 \{#base-messages}

### SystemMessage \{#systemmessage}

```typescript
interface SystemMessage {
  role: "system";
  content: string | TextContent[];
  sections?: Record<string, string | null>;
  toolsAdded?: Tool[];
  toolsRemoved?: ToolReference[];
  timestamp: number;
}
```

首条系统消息声明初始提示词和工具。后续系统消息可以追加指令，替换或移除具名提示词区段，也可以添加或移除工具。按顺序重放这些消息即可得到当前状态。

### UserMessage \{#usermessage}

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}
```

### AssistantMessage \{#assistantmessage}

```typescript
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: string;
  provider: string;
  model: string;
  responseModel?: string;
  responseId?: string;
  providerThinkingLevel?: string;
  thinkingLevel?: ModelThinkingLevel;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: "pending" | "stop" | "length" | "toolUse" | "error" | "aborted" | "deferred";
  deferred?: DeferredHandle;
  errorMessage?: string;
  rawStopReason?: string;
  endTurn?: boolean;
  timestamp: number;
}
```

如果模型提供方报告了具体模型，`responseModel` 会记录该模型。它可能与请求的模型相同。`responseId`、`providerThinkingLevel`、`thinkingLevel`、`diagnostics` 和 `rawStopReason` 保留模型提供方或运行时的详细信息。

助手消息仍在流式传输且尚未完整时使用 `"pending"`。`message_end` 中的完整消息具有表示终态的停止原因。Pi 不会把 `"pending"` 状态的助手消息写入会话 JSONL。

`"deferred"` 响应带有 `DeferredHandle`，其中包含取回该响应所需的模型提供方数据：

```typescript
interface DeferredHandle {
  provider: string;
  modelId: string;
  api: string;
  id: string;
  expiresAt?: number;
  pollAfterMs?: number;
  data?: JsonValue;
}
```

### ToolResultMessage \{#toolresultmessage}

```typescript
interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  usage?: Usage;
  nestedCalls?: NestedToolCalls;
  isError: boolean;
  timestamp: number;
}
```

`details` 由工具定义。可选的 `usage` 记录工具内部执行模型调用的用量，计入整个会话的统计，但不计入主模型调用的用量。`nestedCalls` 记录此工具调用其他工具时产生的元数据，记录范围有限：

```typescript
interface NestedToolCalls {
  calls: NestedToolCallRecord[];
  complete: boolean;
}

interface NestedToolCallRecord {
  id: string;
  name: string;
  arguments?: JsonObject;
  argumentsBytes?: number;
  status: "ok" | "error" | "unfinished";
  durationMs?: number;
  error?: string;
}
```

## Coding-agent 消息 \{#coding-agent-messages}

coding-agent 包为 `AgentMessage` 添加了四种消息角色。

### BashExecutionMessage \{#bashexecutionmessage}

由直接执行的 shell 命令创建，包括 RPC [`bash`](./rpc-commands.md#bash) 命令。这类消息不属于大语言模型的工具调用结果。

```typescript
interface BashExecutionMessage {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode: number | undefined;
  cancelled: boolean;
  truncated: boolean;
  fullOutputPath?: string;
  excludeFromContext?: boolean;
  timestamp: number;
}
```

除非 `excludeFromContext` 为 `true`，否则 Pi 会在下次模型请求前把此消息转换为用户角色的文本。

### CustomMessage \{#custommessage}

扩展发送上下文消息时创建此消息。

```typescript
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;
  content: string | (TextContent | ImageContent)[];
  display: boolean;
  details?: T;
  timestamp: number;
}
```

发起模型请求时，Pi 把此消息的内容转换为用户消息。`display` 控制消息是否在终端显示。隐藏消息不会阻止其内容进入模型上下文。`details` 不会发送给模型。

### BranchSummaryMessage \{#branchsummarymessage}

```typescript
interface BranchSummaryMessage {
  role: "branchSummary";
  summary: string;
  fromId: string | null;
  timestamp: number;
}
```

Pi 根据持久化的 `branch_summary` 条目创建这类上下文消息。

### CompactionSummaryMessage \{#compactionsummarymessage}

```typescript
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;
}
```

Pi 根据持久化的 `compaction` 条目创建这类上下文消息。

## AgentMessage 联合类型 \{#agentmessage-union}

在 coding-agent 包中，此联合类型等价于：

```typescript
type AgentMessage =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolResultMessage
  | BashExecutionMessage
  | CustomMessage
  | BranchSummaryMessage
  | CompactionSummaryMessage;
```

在底层 agent 包中，`AgentMessage` 的类型是 `Message | CustomAgentMessages[keyof CustomAgentMessages]`。应用可以通过 TypeScript 声明合并添加角色。因此，从扩展过角色的宿主接收消息时，消费者应允许出现未知的自定义角色。
