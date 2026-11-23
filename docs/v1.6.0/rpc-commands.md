# RPC 命令 \{#rpc-commands}

本参考列出 [RPC 模式](./rpc.md#rpc-mode)通过标准输入接收的命令。每条命令和每条响应各是一个 JSON 对象。共用的消息值采用[消息类型](./message-types.md#message-types)中定义的格式。

## 发送提示词 \{#prompting}

### prompt \{#prompt}

向智能体发送用户提示词。Pi 接受提示词、将其加入队列或处理完毕后，会发出命令响应。接受提示词后，Pi 仍会以异步流的形式发出事件。

```json
{"id": "req-1", "type": "prompt", "message": "Hello, world!"}
```

附带图像：
```json
{"type": "prompt", "message": "What's in this image?", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

**流式输出期间**：如果智能体已在流式输出，必须指定 `streamingBehavior` 才能将消息加入队列：

```json
{"type": "prompt", "message": "New instruction", "streamingBehavior": "steer"}
```

- `"steer"`：在智能体运行期间将消息加入队列。当前助手轮次执行完工具调用后，Pi 会在下一次调用 LLM 前投递该消息。
- `"followUp"`：等待智能体完成工作。Pi 只在智能体停止运行后投递消息。

如果智能体正在流式输出，而命令未指定 `streamingBehavior`，则返回错误。

**扩展命令**：如果消息是一条扩展命令（例如 `/mycommand`），即使正在流式输出，也会立即执行。扩展命令通过 `pi.sendMessage()` 管理自身与 LLM 的交互。

**输入展开**：Pi 会先展开技能命令（`/skill:name`）和提示词模板（`/template`），再发送或将其加入队列。

响应：
```json
{"id": "req-1", "type": "response", "command": "prompt", "success": true, "data": {"disposition": "started"}}
```

如果扩展命令或输入处理器已处理该提示词，`data.disposition` 为 `"handled"`；如果 Pi 在运行期间将其加入队列，则为 `"queued"`；如果 Pi 接受该提示词并开始运行，则为 `"started"`。此字段仅描述提交的提示词，不描述扩展独立启动的工作，也不保证工作完成。

`success: true` 表示提示词已被接受、加入队列或立即处理。`success: false` 表示提示词在被接受前遭到拒绝。接受后的失败通过正常的事件流和消息流报告；Pi 不会针对同一个请求 ID 再发送一条 `response`。

`images` 字段为可选字段。每张图像采用 `ImageContent` 格式：`{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}`。

### steer \{#steer}

在智能体运行期间将引导消息加入队列。当前助手轮次执行完工具调用后，Pi 会在下一次调用 LLM 前投递该消息。Pi 会展开技能命令和提示词模板。不允许使用扩展命令，请改用 `prompt`。

```json
{"type": "steer", "message": "Stop and do this instead"}
```

附带图像：
```json
{"type": "steer", "message": "Look at this instead", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段为可选字段。每张图像采用 `ImageContent` 格式（与 `prompt` 相同）。

响应：
```json
{"type": "response", "command": "steer", "success": true, "data": {"disposition": "queued"}}
```

如果输入处理器已处理这条引导消息，`data.disposition` 为 `"handled"`。如果 Pi 将其加入队列（包括由处理器转换后再加入队列的情况），则为 `"queued"`。此字段不保证这条消息仍留在队列中。

如何控制引导消息的处理方式，见 [set_steering_mode](./rpc-commands.md#set_steering_mode)。

### follow_up \{#follow_up}

将后续消息加入队列，等智能体完成工作后再处理。只有当智能体没有待处理的工具调用或引导消息时，Pi 才会投递该消息。Pi 会展开技能命令和提示词模板。不允许使用扩展命令，请改用 `prompt`。

```json
{"type": "follow_up", "message": "After you're done, also do this"}
```

附带图像：
```json
{"type": "follow_up", "message": "Also check this image", "images": [{"type": "image", "data": "base64-encoded-data", "mimeType": "image/png"}]}
```

`images` 字段为可选字段。每张图像采用 `ImageContent` 格式（与 `prompt` 相同）。

响应：
```json
{"type": "response", "command": "follow_up", "success": true, "data": {"disposition": "queued"}}
```

`data.disposition` 的取值 `"handled"` 和 `"queued"` 与 `steer` 中的含义相同，但在这里描述的是这条后续消息。

如何控制后续消息的处理方式，见 [set_follow_up_mode](./rpc-commands.md#set_follow_up_mode)。

### abort \{#abort}

中止当前操作，等会话进入空闲状态后再响应。

```json
{"type": "abort"}
```

响应：
```json
{"type": "response", "command": "abort", "success": true}
```

### clear_queue \{#clear_queue}

移除排队的引导消息和后续消息，并返回这些消息的文本。

```json
{"type": "clear_queue"}
```

响应：
```json
{
  "type": "response",
  "command": "clear_queue",
  "success": true,
  "data": {
    "steering": ["Change direction"],
    "followUp": ["Summarize when finished"]
  }
}
```

要复现交互模式下按 Esc 的行为，先发送 `clear_queue`，再发送 `abort`，然后将返回的文本恢复到客户端编辑器中。如果会话队列中仍有消息，`abort` 会继续处理这些消息。

### new_session \{#new_session}

启动新会话。扩展中的 `session_before_switch` 事件处理器可以取消此操作。

```json
{"type": "new_session"}
```

启用可选的父会话跟踪：
```json
{"type": "new_session", "parentSession": "/path/to/parent-session.jsonl"}
```

响应：
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": false}}
```

如果扩展取消了操作：
```json
{"type": "response", "command": "new_session", "success": true, "data": {"cancelled": true}}
```

## 状态 \{#state}

### get_state \{#get_state}

获取当前会话状态。

```json
{"type": "get_state"}
```

响应：
```json
{
  "type": "response",
  "command": "get_state",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isStreaming": false,
    "isCompacting": false,
    "steeringMode": "all",
    "followUpMode": "one-at-a-time",
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "sessionName": "my-feature-work",
    "autoCompactionEnabled": true,
    "messageCount": 5,
    "pendingMessageCount": 0
  }
}
```

`model` 字段包含完整的 [Model](./rpc-commands.md#model-object) 对象。如果未选择模型，则省略该字段。`sessionName` 字段包含通过 `set_session_name` 设置的显示名称；如果未设置，则省略该字段。

### get_messages \{#get_messages}

获取对话中的所有消息。

```json
{"type": "get_messages"}
```

响应：
```json
{
  "type": "response",
  "command": "get_messages",
  "success": true,
  "data": {"messages": [...]}
}
```

消息是 `AgentMessage` 对象（见[消息类型](./message-types.md#message-types)）。

## 模型 \{#model}

### set_model \{#set_model}

切换到指定模型。

```json
{"type": "set_model", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514"}
```

响应包含完整的 [Model](./rpc-commands.md#model-object) 对象：
```json
{
  "type": "response",
  "command": "set_model",
  "success": true,
  "data": {...}
}
```

### cycle_model \{#cycle_model}

切换到下一个可用模型。如果只有一个模型可用，返回的数据为 `null`。

```json
{"type": "cycle_model"}
```

响应：
```json
{
  "type": "response",
  "command": "cycle_model",
  "success": true,
  "data": {
    "model": {...},
    "thinkingLevel": "medium",
    "isScoped": false
  }
}
```

`model` 字段包含完整的 [Model](./rpc-commands.md#model-object) 对象。

### get_available_models \{#get_available_models}

列出所有已配置的模型。

```json
{"type": "get_available_models"}
```

响应包含一个由完整 [Model](./rpc-commands.md#model-object) 对象组成的数组：
```json
{
  "type": "response",
  "command": "get_available_models",
  "success": true,
  "data": {
    "models": [...]
  }
}
```

## 推理 \{#thinking}

### set_thinking_level \{#set_thinking_level}

为支持推理的模型设置推理级别。

```json
{"type": "set_thinking_level", "level": "high"}
```

级别：`"off"`、`"minimal"`、`"low"`、`"medium"`、`"high"`、`"xhigh"`、`"max"`

只有选定的模型支持时，才会提供 `"xhigh"` 和 `"max"`。包括 GPT-5.6 在内的部分模型同时提供这两个级别。

响应：
```json
{"type": "response", "command": "set_thinking_level", "success": true}
```

### cycle_thinking_level \{#cycle_thinking_level}

在可用的推理级别之间循环切换。如果模型不支持推理，返回的数据为 `null`。

```json
{"type": "cycle_thinking_level"}
```

响应：
```json
{
  "type": "response",
  "command": "cycle_thinking_level",
  "success": true,
  "data": {"level": "high"}
}
```

### get_available_thinking_levels \{#get_available_thinking_levels}

列出当前模型支持的推理级别。如果模型不支持推理，则返回 `["off"]`。

```json
{"type": "get_available_thinking_levels"}
```

响应：
```json
{
  "type": "response",
  "command": "get_available_thinking_levels",
  "success": true,
  "data": {
    "levels": ["off", "minimal", "low", "medium", "high"]
  }
}
```

## 队列模式 \{#queue-modes}

### set_steering_mode \{#set_steering_mode}

控制通过 `steer` 提交的引导消息如何投递。

```json
{"type": "set_steering_mode", "mode": "one-at-a-time"}
```

模式：
- `"all"`：当前助手轮次执行完工具调用后，投递所有引导消息
- `"one-at-a-time"`：每完成一个助手轮次，投递一条引导消息（默认）

响应：
```json
{"type": "response", "command": "set_steering_mode", "success": true}
```

### set_follow_up_mode \{#set_follow_up_mode}

控制通过 `follow_up` 提交的后续消息如何投递。

```json
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

模式：
- `"all"`：智能体完成工作时，投递所有后续消息
- `"one-at-a-time"`：智能体每完成一次工作，投递一条后续消息（默认）

响应：
```json
{"type": "response", "command": "set_follow_up_mode", "success": true}
```

## 上下文压缩 \{#compaction}

### compact \{#compact}

手动压缩对话上下文，减少 token 用量。

```json
{"type": "compact"}
```

附带自定义指令：
```json
{"type": "compact", "customInstructions": "Focus on code changes"}
```

响应：
```json
{
  "type": "response",
  "command": "compact",
  "success": true,
  "data": {
    "summary": "Summary of conversation...",
    "firstKeptEntryId": "abc123",
    "tokensBefore": 150000,
    "estimatedTokensAfter": 32000,
    "usage": {
      "input": 32000,
      "output": 1200,
      "cacheRead": 0,
      "cacheWrite": 0,
      "totalTokens": 33200,
      "cost": {"input": 0.01, "output": 0.02, "cacheRead": 0, "cacheWrite": 0, "total": 0.03}
    },
    "details": {}
  }
}
```

上下文刚压缩完时，`estimatedTokensAfter` 根据重建后的消息上下文给出启发式 token 数估算。该值并非模型提供方统计的精确值。`usage` 报告一次或多次为生成摘要而进行的 LLM 调用的用量。自定义压缩处理器可以省略此字段。

### set_auto_compaction \{#set_auto_compaction}

启用或禁用上下文接近上限时的自动压缩。

```json
{"type": "set_auto_compaction", "enabled": true}
```

响应：
```json
{"type": "response", "command": "set_auto_compaction", "success": true}
```

## 重试 \{#retry}

### set_auto_retry \{#set_auto_retry}

启用或禁用遇到暂时性错误（过载、触发速率限制或 5xx）时的自动重试。

```json
{"type": "set_auto_retry", "enabled": true}
```

响应：
```json
{"type": "response", "command": "set_auto_retry", "success": true}
```

### abort_retry \{#abort_retry}

中止正在进行的重试（取消等待并停止重试）。

```json
{"type": "abort_retry"}
```

响应：
```json
{"type": "response", "command": "abort_retry", "success": true}
```

## Bash \{#bash}

### bash \{#bash-1}

执行 shell 命令，并将输出添加到对话上下文。命令运行期间，Pi 通过 `bash_execution_update` 事件流式发送输出；响应包含最终结果。

```json
{"id": "req-1", "type": "bash", "command": "ls -la"}
```

如果要将命令输出保存在会话中，但下次发送提示词时不将其纳入模型上下文，请将 `excludeFromContext` 设为 `true`。

附上 `id`，即可将流式发出的 `bash_execution_update` 事件与该命令关联起来。

响应：
```json
{
  "id": "req-1",
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "total 48\ndrwxr-xr-x ...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": false
  }
}
```

如果输出被截断，响应会包含 `fullOutputPath`：
```json
{
  "type": "response",
  "command": "bash",
  "success": true,
  "data": {
    "output": "truncated output...",
    "exitCode": 0,
    "cancelled": false,
    "truncated": true,
    "fullOutputPath": "/tmp/pi-bash-abc123.log"
  }
}
```

**Bash 结果传给 LLM 的方式：**

`bash` 命令会立即执行并返回 `BashResult`。在内部，Pi 会创建 `BashExecutionMessage`，并将它保存在智能体的消息状态中。

发送下一条 `prompt` 命令时，Pi 会先转换上下文中的消息，再将它们发送给模型。只要 `excludeFromContext` 不为 true，Pi 就会将 `BashExecutionMessage` 转为以下格式的 `UserMessage`：

````
Ran `ls -la`
```
total 48
drwxr-xr-x ...
```
````

因此：
1. 纳入上下文的 Bash 输出会在发送**下一条提示词**时传给模型，不会立即传送。
2. 发送提示词之前可以运行多条 Bash 命令。对于未设置 `excludeFromContext` 的命令，Pi 会纳入每条命令的输出。

### abort_bash \{#abort_bash}

中止正在运行的 Bash 命令。

```json
{"type": "abort_bash"}
```

响应：
```json
{"type": "response", "command": "abort_bash", "success": true}
```

## 会话 \{#session}

### get_session_stats \{#get_session_stats}

获取 token 用量、费用统计和当前上下文窗口的使用情况。

```json
{"type": "get_session_stats"}
```

响应：
```json
{
  "type": "response",
  "command": "get_session_stats",
  "success": true,
  "data": {
    "sessionFile": "/path/to/session.jsonl",
    "sessionId": "abc123",
    "userMessages": 5,
    "assistantMessages": 5,
    "toolCalls": 12,
    "toolResults": 12,
    "totalMessages": 22,
    "tokens": {
      "input": 50000,
      "output": 10000,
      "cacheRead": 40000,
      "cacheWrite": 5000,
      "total": 105000
    },
    "cost": 0.45,
    "contextUsage": {
      "tokens": 60000,
      "contextWindow": 200000,
      "percent": 30
    }
  }
}
```

`tokens` 和 `cost` 涵盖整个会话中的助手消息、工具报告的用量，以及上下文压缩和分支摘要生成的用量。`contextUsage` 包含压缩和底部状态栏实际使用的当前上下文窗口用量估算。

没有可用的模型或上下文窗口时，响应会省略 `contextUsage`。压缩刚完成时，`contextUsage.tokens` 和 `contextUsage.percent` 均为 `null`，直到压缩后的新助手响应提供有效的用量数据。

### export_html \{#export_html}

将会话导出为 HTML 文件。

```json
{"type": "export_html"}
```

指定自定义路径：
```json
{"type": "export_html", "outputPath": "/tmp/session.html"}
```

响应：
```json
{
  "type": "response",
  "command": "export_html",
  "success": true,
  "data": {"path": "/tmp/session.html"}
}
```

### switch_session \{#switch_session}

加载另一个会话文件。扩展中的 `session_before_switch` 事件处理器可以取消此操作。

```json
{"type": "switch_session", "sessionPath": "/path/to/session.jsonl"}
```

响应：
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": false}}
```

如果扩展取消了切换：
```json
{"type": "response", "command": "switch_session", "success": true, "data": {"cancelled": true}}
```

### fork \{#fork}

从活跃分支中先前的一条用户消息创建新的分支。扩展中的 `session_before_fork` 事件处理器可以取消此操作。命令返回作为分支起点的消息文本。

```json
{"type": "fork", "entryId": "abc123"}
```

响应：
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"text": "The original prompt text...", "cancelled": false}
}
```

如果扩展取消了分支创建：
```json
{
  "type": "response",
  "command": "fork",
  "success": true,
  "data": {"cancelled": true}
}
```

### clone \{#clone}

将当前活跃分支复制到新会话，并保留当前位置。扩展中的 `session_before_fork` 事件处理器可以取消此操作。

```json
{"type": "clone"}
```

响应：
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": false}
}
```

如果扩展取消了复制：
```json
{
  "type": "response",
  "command": "clone",
  "success": true,
  "data": {"cancelled": true}
}
```

### get_fork_messages \{#get_fork_messages}

获取可作为分支起点的用户消息。

```json
{"type": "get_fork_messages"}
```

响应：
```json
{
  "type": "response",
  "command": "get_fork_messages",
  "success": true,
  "data": {
    "messages": [
      {"entryId": "abc123", "text": "First prompt..."},
      {"entryId": "def456", "text": "Second prompt..."}
    ]
  }
}
```

### get_entries \{#get_entries}

按追加顺序获取所有会话条目（不含会话头）。会话是一棵只追加条目的树，每个条目的 ID 都保持不变，因此可用作持久游标。将最后看到的条目 ID 作为 `since` 传入，即可只获取该条目之后的条目，不含该条目本身。即使客户端重启，也可以接着读取。与 `get_messages` 不同，此命令还返回压缩前的历史和已放弃的分支。

```json
{"type": "get_entries"}
```

指定游标：
```json
{"type": "get_entries", "since": "abc123"}
```

响应：
```json
{
  "type": "response",
  "command": "get_entries",
  "success": true,
  "data": {
    "entries": [
      {"type": "message", "id": "def456", "parentId": "abc123", "timestamp": "...", "message": {"role": "user", "...": "..."}}
    ],
    "leafId": "def456"
  }
}
```

`leafId` 是当前叶条目的 ID（空会话为 `null`）。客户端只需一次请求和响应，即可判断活跃分支的位置是否有变化。如果 `since` 与任何条目的 ID 都不匹配，响应为 `success: false`。

### get_tree \{#get_tree}

以条目树的形式获取会话。每个节点的格式为 `{entry, children, label?, labelTimestamp?}`。由于导航 API 可能创建多个根节点，结果为数组。父级链断开的孤立条目也会作为根节点出现。

```json
{"type": "get_tree"}
```

响应：
```json
{
  "type": "response",
  "command": "get_tree",
  "success": true,
  "data": {
    "tree": [
      {
        "entry": {"type": "message", "id": "abc123", "parentId": null, "...": "..."},
        "children": [
          {"entry": {"type": "message", "id": "def456", "parentId": "abc123", "...": "..."}, "children": []}
        ]
      }
    ],
    "leafId": "def456"
  }
}
```

### get_last_assistant_text \{#get_last_assistant_text}

获取最近一条助手消息的文本内容。Pi 会跳过来自已中止或失败轮次且没有文本的消息，以及仅包含工具调用的消息。

```json
{"type": "get_last_assistant_text"}
```

响应：
```json
{
  "type": "response",
  "command": "get_last_assistant_text",
  "success": true,
  "data": {"text": "The assistant's response..."}
}
```

如果没有助手文本，`text` 的值为 `null`。

### set_session_name \{#set_session_name}

为当前会话设置显示名称。名称会出现在会话列表中，便于辨认会话。

```json
{"type": "set_session_name", "name": "my-feature-work"}
```

响应：
```json
{
  "type": "response",
  "command": "set_session_name",
  "success": true
}
```

`get_state` 返回的 `sessionName` 字段包含当前会话名称。要在启动 RPC 模式时设置初始名称，请将 `--name <name>` 或 `-n <name>` 作为参数传给 `pi --mode rpc` 进程。

## 可发现的命令 \{#discoverable-commands}

### get_commands \{#get_commands}

获取可用命令（扩展命令、提示词模板和技能）。要通过 `prompt` 运行其中一条命令，请在其名称前加上 `/`。

```json
{"type": "get_commands"}
```

响应：
```json
{
  "type": "response",
  "command": "get_commands",
  "success": true,
  "data": {
    "commands": [
      {
        "name": "fix-tests",
        "description": "Fix failing tests",
        "source": "prompt",
        "sourceInfo": {
          "path": "/home/user/myproject/.pi/agent/prompts/fix-tests.md",
          "source": "local",
          "scope": "project",
          "origin": "top-level"
        }
      }
    ]
  }
}
```

每条命令包含以下字段：
- `name`：命令名称（用 `/name` 调用）
- `description`：供人阅读的描述（扩展命令可省略）
- `source`：命令类型：
  - `"extension"`：在扩展中通过 `pi.registerCommand()` 注册
  - `"prompt"`：从提示词模板的 `.md` 文件加载
  - `"skill"`：从技能目录加载（名称带有 `skill:` 前缀）
- `sourceInfo`：注册此命令的资源的元数据：
  - `path`：资源的绝对路径
  - `source`：Pi 发现资源的方式，例如 `"local"`、`"auto"` 或 `"cli"`
  - `scope`：`"user"`、`"project"` 或 `"temporary"`
  - `origin`：直接加载的资源为 `"top-level"`，来自包的资源为 `"package"`
  - `baseDir`：包的基目录（如适用）

**注意**：内置 TUI 命令（如 `/settings`、`/hotkeys`）不在列表中。Pi 只在交互模式下处理这些命令，通过 `prompt` 发送不会执行。

## Model 对象 \{#model-object}

模型相关命令返回已配置模型的完整定义。费用单位为每百万 token 的美元金额。

```json
{
  "id": "claude-sonnet-4-20250514",
  "name": "Claude Sonnet 4",
  "api": "anthropic-messages",
  "provider": "anthropic",
  "baseUrl": "https://api.anthropic.com",
  "reasoning": true,
  "input": ["text", "image"],
  "contextWindow": 200000,
  "maxTokens": 16384,
  "cost": {
    "input": 3.0,
    "output": 15.0,
    "cacheRead": 0.3,
    "cacheWrite": 3.75
  }
}
```

有关模型配置，见[配置兼容端点](./models.md#configure-a-compatible-endpoint)。在 TypeScript 中，请使用 `Model` 类型，该类型由 `@earendil-works/pi-ai` 导出。
