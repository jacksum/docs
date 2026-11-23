# 会话文件格式 \{#session-file-format}

Pi 将会话存储为 JSONL（JSON Lines）文件。每一行都是一个带有 `type` 字段的 JSON 对象。会话条目通过 `id`/`parentId` 字段组成树形结构，因此可以在同一个文件中创建分支，无需新建文件。

如需通过程序创建、持久化会话或在会话树中导航，参见 [`SessionManager` API](./sdk.md#sessionmanager-api)。


## 文件位置 \{#file-location}

```
~/.pi/agent/sessions/--<path>--/<timestamp>_<session-id>.jsonl
```

默认情况下，`<session-id>` 是 UUID。调用方可通过 SDK 或 `--session-id` 指定自定义 ID。对于 `<path>`，Pi 会移除开头的路径分隔符，并将 `/`、`\\` 和 `:` 替换为 `-`。

## 删除会话 \{#deleting-sessions}

删除会话对应的 `.jsonl` 文件即可删除该会话。这些文件位于 `~/.pi/agent/sessions/` 下。

也可以通过 `/resume` 交互式删除会话：选中会话，按 `Ctrl+D`，然后确认。如果 `trash` 命令行工具可用，Pi 会用它来避免永久删除。

## 会话版本 \{#session-version}

会话文件头包含版本字段：

- **版本 1**：条目按线性顺序排列（旧版，加载时自动迁移）
- **版本 2**：条目通过 `id`/`parentId` 相连，形成树形结构
- **版本 3**：为统一扩展机制，将角色 `hookMessage` 重命名为 `custom`

Pi 加载已有会话时，会自动将其迁移到当前版本（v3）。

## 源文件 \{#source-files}

GitHub 上的 [Pi v1.6.0 源码](https://github.com/earendil-works/pi/tree/v1.6.0)及相关参考：
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/session-manager.ts)：会话条目类型和 SessionManager
- [消息类型](./message-types.md)：通用消息和内容块参考
- [`packages/coding-agent/src/core/messages.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/messages.ts)：扩展的消息类型
- [`packages/ai/src/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/ai/src/types.ts)：基础消息和内容块类型
- [`packages/agent/src/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/agent/src/types.ts)：可扩展的 `AgentMessage` 联合类型

如需查阅项目中的 TypeScript 定义，请查看 `node_modules/@earendil-works/pi-coding-agent/dist/` 和 `node_modules/@earendil-works/pi-ai/dist/`。

## 消息 \{#messages}

`message` 条目存储一条 [`AgentMessage`](./message-types.md)。消息的内容块、角色、用量和时间戳见[消息类型](./message-types.md)。

会话条目的时间戳是 ISO 8601 字符串，条目内嵌消息的时间戳是以毫秒为单位的 Unix 时间戳。

## 条目的基础类型 \{#entry-base}

除 `SessionHeader` 外，所有条目类型都继承 `SessionEntryBase`：

```typescript
interface SessionEntryBase {
  type: string;
  id: string;           // Usually an 8-char hex ID; may fall back to a full UUID
  parentId: string | null;  // Parent entry ID (null for a root entry)
  timestamp: string;    // ISO timestamp
}
```

## 条目类型 \{#entry-types}

### SessionHeader \{#sessionheader}

文件的第一行，仅包含元数据。它不属于会话树，没有 `id`/`parentId` 字段。

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project"}
```

如果会话有父会话（通过 `/fork`、`/clone` 或 `newSession({ parentSession })` 创建）：

```json
{"type":"session","version":3,"id":"uuid","timestamp":"2024-12-03T14:00:00.000Z","cwd":"/path/to/project","parentSession":"/path/to/original/session.jsonl"}
```

### SessionMessageEntry \{#sessionmessageentry}

表示对话中的一条消息。`message` 字段包含一条 `AgentMessage`。系统消息记录提示词和工具配置。会话发起首个请求时，Pi 会持久化一条系统消息，其中包含所有提示词区段和工具声明。后续变更也会作为系统消息持久化，按名称修改 `sections`（`null` 表示移除该区段），并通过 `toolsAdded`/`toolsRemoved` 列出新增或移除的工具。按顺序重放这些系统消息即可得到当前提示词和工具。Pi 不另设条目存储提示词状态。

```json
{"type":"message","id":"a0b1c2d3","parentId":null,"timestamp":"2024-12-03T14:00:00.000Z","message":{"role":"system","content":"","sections":{"preamble":"You are an expert coding assistant...","tools":"<tools>\n- read: ...\n</tools>","cwd":"/project"},"toolsAdded":[{"name":"read","description":"...","parameters":{}}],"timestamp":1733234400000}}
{"type":"message","id":"d4e5f6g7","parentId":"c3d4e5f6","timestamp":"2024-12-03T14:04:00.000Z","message":{"role":"system","content":"","sections":{"skills":"<skills>...</skills>"},"toolsRemoved":[{"name":"write"}],"timestamp":1733234640000}}
```

在引入系统消息之前创建的会话没有位于开头的系统消息。这样的会话发起首个请求时，会在后续的一条系统消息中声明当前提示词，并按同样的方式重放这条消息。

```json
{"type":"message","id":"a1b2c3d4","parentId":"prev1234","timestamp":"2024-12-03T14:00:01.000Z","message":{"role":"user","content":"Hello","timestamp":1733234401000}}
{"type":"message","id":"b2c3d4e5","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Hi!"}],"api":"anthropic-messages","provider":"anthropic","model":"claude-sonnet-4-5","usage":{...},"stopReason":"stop","timestamp":1733234402000}}
{"type":"message","id":"c3d4e5f6","parentId":"b2c3d4e5","timestamp":"2024-12-03T14:00:03.000Z","message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash","content":[{"type":"text","text":"output"}],"isError":false,"timestamp":1733234403000}}
```

助手消息会记录生成该消息的模型。较新的消息还会记录 `thinkingLevel`，即 Pi 为此次响应请求的思考级别。

### ModelChangeEntry \{#modelchangeentry}

用户在会话中切换模型时，Pi 会生成此条目。最新条目记录当前选定的模型。该模型可以是[虚拟模型](./virtual-models.md)；此时，助手消息会标明实际响应的物理模型。

```json
{"type":"model_change","id":"d4e5f6g7","parentId":"c3d4e5f6","timestamp":"2024-12-03T14:05:00.000Z","provider":"openai","modelId":"gpt-4o"}
```

### ThinkingLevelChangeEntry \{#thinkinglevelchangeentry}

用户更改思考（推理）级别时，Pi 会生成此条目。

```json
{"type":"thinking_level_change","id":"e5f6g7h8","parentId":"d4e5f6g7","timestamp":"2024-12-03T14:06:00.000Z","thinkingLevel":"high"}
```

### UsageEntry \{#usageentry}

记录归属于模型、但不属于助手消息的用量。此条目不进入大语言模型的上下文。`kind` 是标识操作的任意字符串，例如缓存预热使用 `"cache_warm"`。

```json
{"type":"usage","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:08:00.000Z","kind":"cache_warm","provider":"anthropic","model":"claude-sonnet-4-5","usage":{"input":0,"output":0,"cacheRead":50000,"cacheWrite":0,"totalTokens":50000,"cost":{"input":0,"output":0,"cacheRead":0.015,"cacheWrite":0,"total":0.015}}}
```

用量条目计入会话的 token 用量和费用总计。Pi 不在对话树中显示此类条目。读取方应将未知 `kind` 值对应的条目作为普通用量处理，不应拒绝这些条目。

### CompactionEntry \{#compactionentry}

上下文压缩时创建此条目，其中包含较早消息的摘要，以及系统提示词和工具的完整检查点。

```json
{"type":"compaction","id":"f6g7h8i9","parentId":"e5f6g7h8","timestamp":"2024-12-03T14:10:00.000Z","summary":"User discussed X, Y, Z...","firstKeptEntryId":"c3d4e5f6","tokensBefore":50000,"systemMessage":{"role":"system","content":"You are a coding assistant.","toolsAdded":[],"timestamp":1733235000000}}
```

`firstKeptEntryId` 为必填字段，标识压缩条目之前保留下来的第一个条目。重建上下文时，Pi 用压缩摘要替换较早的、已纳入摘要的条目，并保留从该字段所指条目开始的范围。如果压缩不保留任何先前条目，压缩条目就在此字段中存储自己的 ID。

可选字段：
- `systemMessage`：在压缩边界重放得到的提示词区段和工具声明。它成为压缩后上下文的首条系统消息，保留条目中的系统消息会被省略。较旧的会话条目没有此字段。
- `usage`：生成摘要时的大语言模型用量，计入会话的 token 用量和费用总计。
- `details`：由具体实现定义的数据，例如默认实现使用 `{ readFiles: string[], modifiedFiles: string[] }`，扩展可使用自定义数据。
- `fromHook`：由扩展生成时为 `true`，由 Pi 生成时为 `false`/`undefined`。这是沿用的字段名。

### ContextEditEntry \{#contexteditentry}

以追加条目的方式编辑先前一条为模型提供上下文的条目。编辑仅影响此后的模型上下文。原始历史记录、界面、导出内容和会话用量统计中的目标条目及其元数据均保持不变。

```json
{"type":"context_edit","id":"g6h7i8j9","parentId":"f6g7h8i9","timestamp":"2024-12-03T14:11:00.000Z","targetId":"c3d4e5f6","replacement":null}
```

目标可以是用户消息、助手消息、工具结果或自定义消息条目。`replacement: null` 表示从模型上下文中省略目标。非 null 的 `replacement` 仅替换目标消息的内容。助手消息和工具结果的内容必须是数组，因此以字符串提供的替换内容会转换为只含一个文本块的数组。如果多次编辑同一条目，以当前分支上的最新编辑为准。编辑是否生效取决于当前分支及其位置：导航到编辑之前的位置时，目标条目会恢复为原来提供的上下文。

### BranchSummaryEntry \{#branchsummaryentry}

通过 `/tree` 切换分支并由大语言模型生成摘要时，Pi 会创建此条目。摘要保留从切换前的叶节点回溯到共同祖先这段路径上的上下文。

```json
{"type":"branch_summary","id":"g7h8i9j0","parentId":"a1b2c3d4","timestamp":"2024-12-03T14:15:00.000Z","fromId":"f6g7h8i9","summary":"Branch explored approach A..."}
```

新分支从 `parentId` 所指的条目继续。`fromId` 指向切换前的叶节点，也就是被总结的那条路径的末端。

可选字段：
- `usage`：生成摘要时的大语言模型用量，计入会话的 token 用量和费用总计。
- `details`：默认实现使用文件跟踪数据（`{ readFiles: string[], modifiedFiles: string[] }`），扩展可使用自定义数据。
- `fromHook`：由扩展生成时为 `true`，由 Pi 生成时为 `false`/`undefined`。这是沿用的字段名。

### CustomEntry \{#customentry}

用于持久化扩展状态。此类条目不进入大语言模型的上下文。

```json
{"type":"custom","id":"h8i9j0k1","parentId":"g7h8i9j0","timestamp":"2024-12-03T14:20:00.000Z","customType":"my-extension","data":{"count":42}}
```

重新加载时，可通过 `customType` 识别对应扩展的条目。在交互模式下，可以通过 `pi.registerEntryRenderer(customType, renderer)` 渲染自定义条目，但这些条目仍不进入大语言模型的上下文。

Pi 将[虚拟模型](./virtual-models.md)的路由器状态保存为自定义条目，其 `customType` 为 `pi.virtual-model-state`，`data` 为 `{ provider, modelId, state }`。

### CustomMessageEntry \{#custommessageentry}

由扩展注入的消息，会进入大语言模型的上下文。

```json
{"type":"custom_message","id":"i9j0k1l2","parentId":"h8i9j0k1","timestamp":"2024-12-03T14:25:00.000Z","customType":"my-extension","content":"Injected context...","display":true}
```

字段：
- `content`：字符串或 `(TextContent | ImageContent)[]`，与 UserMessage 相同。
- `display`：`true` = 在终端界面（TUI）中以专用样式显示，`false` = 隐藏。
- `details`：扩展专用的可选元数据，不发送给大语言模型。

### LabelEntry \{#labelentry}

用户为条目设置的书签或标记。

```json
{"type":"label","id":"j0k1l2m3","parentId":"i9j0k1l2","timestamp":"2024-12-03T14:30:00.000Z","targetId":"a1b2c3d4","label":"checkpoint-1"}
```

将 `label` 设为 `undefined` 可清除标签。

### SessionInfoEntry \{#sessioninfoentry}

会话元数据，例如用户指定的显示名称。可通过 `/name`、`--name` / `-n`，或者在扩展中调用 `pi.setSessionName()` 来设置会话名称。

```json
{"type":"session_info","id":"k1l2m3n4","parentId":"j0k1l2m3","timestamp":"2024-12-03T14:35:00.000Z","name":"Refactor auth module"}
```

如果已设置会话名称，会话选择器（`/resume`）会显示该名称，而不显示第一条消息。

## 树形结构 \{#tree-structure}

条目通常组成一棵树，但导航 API 可以创建多个根节点：
- 根条目使用 `parentId: null`。最初，第一个条目是根节点。
- 每个非根条目都通过 `parentId` 指向其父条目。
- 创建分支会为较早的条目添加新的子条目。
- “叶节点”是当前在树中的位置。
- 调用 `resetLeaf()` 或 `branchWithSummary(null, ...)` 后，后续条目可以成为另一个根节点。

```
[user msg] ─── [assistant] ─── [user msg] ─── [assistant] ─┬─ [user msg] ← current leaf
                                                            │
                                                            └─ [branch_summary] ─── [user msg] ← alternate branch
```

## 构建上下文 \{#context-building}

`buildContextEntries()` 从当前叶节点向上遍历到根节点，按以下方式确定当前条目列表，并处理路径上的压缩条目：

1. 收集路径上的所有条目。
2. 如果路径上有一个或多个 `CompactionEntry`，使用最新的一个：
   - 首先纳入该压缩条目。
   - 纳入从 `firstKeptEntryId` 开始、到该压缩条目之前的所有条目，系统消息除外。
   - 纳入该压缩条目之后的条目。
3. 保留所选范围内的非消息条目，以便交互模式渲染这些条目。

随后，`buildSessionProjection()` 对每个选中的目标应用最新的 `context_edit`，并返回模型可见的消息及其来源条目。被省略的目标不会产生消息；被替换的消息仅修改内容，仍沿用来源条目的角色和元数据。原始的所选条目保持不变。

`buildSessionContext()` 基于上述投影构建发送给大语言模型的消息列表：

1. 从完整路径提取当前的模型和思考级别设置。
2. 将选中的条目转换为消息：
   - `message` -> 已存储的 `AgentMessage`
   - `compaction` -> 完整的系统检查点，随后是 `compactionSummary`
   - `branch_summary` -> `branchSummary`
   - `custom_message` -> `CustomMessage`
   - `context_edit` -> 本身不产生上下文消息
   - `usage` 和 `custom` -> 不产生上下文消息

压缩摘要替换 `firstKeptEntryId` 之前的条目。Pi 将压缩前的系统消息合并到完整检查点中，不再从保留范围内逐条重放。除系统消息外，保留范围内的条目仍可供大语言模型使用；压缩条目之后的所有条目也仍可用。

## 解析示例 \{#parsing-example}

```typescript
import { readFileSync } from "fs";

const lines = readFileSync("session.jsonl", "utf8").trim().split("\n");

for (const line of lines) {
  const entry = JSON.parse(line);

  switch (entry.type) {
    case "session":
      console.log(`Session v${entry.version ?? 1}: ${entry.id}`);
      break;
    case "message":
      console.log(`[${entry.id}] ${entry.message.role}: ${JSON.stringify(entry.message.content)}`);
      break;
    case "compaction":
      console.log(`[${entry.id}] Compaction: ${entry.tokensBefore} tokens summarized`);
      break;
    case "branch_summary":
      console.log(`[${entry.id}] Branch from ${entry.fromId}`);
      break;
    case "usage":
      console.log(`[${entry.id}] Usage (${entry.kind}): ${entry.usage.totalTokens} tokens`);
      break;
    case "custom":
      console.log(`[${entry.id}] Custom (${entry.customType}): ${JSON.stringify(entry.data)}`);
      break;
    case "custom_message":
      console.log(`[${entry.id}] Extension message (${entry.customType}): ${entry.content}`);
      break;
    case "label":
      console.log(`[${entry.id}] Label "${entry.label}" on ${entry.targetId}`);
      break;
    case "model_change":
      console.log(`[${entry.id}] Model: ${entry.provider}/${entry.modelId}`);
      break;
    case "thinking_level_change":
      console.log(`[${entry.id}] Thinking: ${entry.thinkingLevel}`);
      break;
  }
}
```
