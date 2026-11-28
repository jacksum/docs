---
title: "RPC 协议参考"
description: "Oh My Pi 官方仓库文档：RPC 协议参考。"
---

# RPC 协议参考 \{#rpc-protocol-reference}

RPC 模式通过 stdio，以换行分隔的 JSON 协议运行编程智能体。

- **stdin**：命令（`RpcCommand`）、扩展 UI 响应、宿主工具更新/结果，以及宿主 URI 结果
- **stdout**：就绪帧、命令响应（`RpcResponse`）、会话/智能体事件、扩展 UI 请求，以及宿主工具/宿主 URI 请求和取消

这是自定义 JSONL 协议，不是 JSON-RPC 2.0。

主要实现：

- `packages/coding-agent/src/modes/rpc/rpc-mode.ts`
- `packages/coding-agent/src/modes/rpc/rpc-types.ts`
- `packages/coding-agent/src/session/agent-session.ts`
- `packages/coding-agent/src/session/agent-session-events.ts`
- `packages/agent/src/agent.ts`
- `packages/agent/src/agent-loop.ts`

## 启动 \{#startup}

```bash
omp --mode rpc [regular CLI options]
```

行为说明：

- RPC 模式拒绝 `@file` CLI 参数。
- `--no-ui`（与 `--mode rpc` 或 `--mode rpc-ui` 一起使用）以无头方式运行扩展：`ctx.hasUI` 为 `false`，对话框解析为其默认值，扩展呈现更新会被丢弃。使用 `rpc-ui` 时，`ask` 等工具 UI 仍启用。使用 `rpc` 时，除了宿主发起的 `login`，不会发出 UI 请求。具体边界参见[扩展 UI 子协议](#extension-ui-sub-protocol)。
- CLI RPC 模式禁用自动会话标题生成（`PI_NO_TITLE=1`），以免产生额外模型调用。`rpc-ui` 还会设置 `PI_NO_PTY=1`。
- RPC/ACP 对声明了相应 `protocolDefault` 的设置固定使用中性默认值，包括任务隔离/执行、记忆、顾问和顾问层级设置。RPC 还会固定异步作业以及 bash/eval 自动后台化默认值。显式项目/全局配置、`--config` 和隔离设置仍具决定权；长时间运行的 CLI RPC 进程会监视磁盘配置更改。待办设置不采用宿主默认值。
- 进程在扩展发现之前接管 stdin，随后每次解析一个非空 JSONL 行。格式错误的 JSON 会发出可恢复的 `command: "parse"` 失败，不会终止循环。
- 启动时，在处理命令之前写入 `ready` 帧。该帧公布支持的协议版本和传输限制。
- 启动恢复（`--continue`、`--resume`）时，如果保存的模型已无法解析（模型提供方更名或移除、模型 id 改变，或缺少凭据），会以故障关闭方式失败，而不是将会话记录发送给另一个模型：进程向 stdout 写入 `{ type: "notice", level: "error", message: "Could not restore model <provider/id>", source: "session-model-restore" }`，随后以代码 `1` 退出，不发送 `ready` 帧。启动时使用 `--model` 可显式选择模型并跳过检查。需要在进程内恢复的宿主应在启动时不使用 `--continue`/`--resume`，并通过 [`open_session`](#open_session-payload) 或 `switch_session` 绑定会话；它们在相同条件下会以可恢复的命令错误失败，并接受显式 `provider`/`modelId`。
- 扩展启动（`session_start`）在 `ready` 之后运行。运行期间只处理 `extension_ui_response`（扩展可能正在等待对话框）和 `set_ask_dialog`；其他所有有效帧都会被读取并按顺序等待，直到启动结束（格式错误的行仍会立即收到 `parse` 失败）。如果 stdin 在启动期间关闭，会拒绝扩展正在等待的对话框，使启动得以结束。
- stdin 关闭时，待处理的扩展 UI、宿主工具和宿主 URI 请求会被拒绝；已接纳的命令会处理完毕，会话被释放，待发送的 stdout 得以交付，正常关闭以代码 `0` 退出。如果释放时仍锁存会话持久化失败，则在交付其 `notice` 帧后以代码 `1` 退出。
- 响应/事件每行写入一个 JSON 对象。

## 传输与分帧 \{#transport-and-framing}

协议 v1 的 stdout 帧是后跟 `\n` 的单个 JSON 对象。服务端将每个物理 stdout 帧限制为 1 MiB，包含换行符。入站帧始终是一个未分块的 JSONL 对象；客户端应将其保持在公布的物理帧限制内。输入不会从 `rpc_chunk` 帧重新组装。

初始就绪帧使用协议 v1，并公布可选择启用的无损传输：

```json
{
	"type": "ready",
	"protocolVersion": 1,
	"supportedProtocolVersions": [1, 2],
	"maxFrameBytes": 1048576,
	"maxReassembledFrameBytes": 67108864,
	"supportsBashExcludeFromContext": true
}
```

支持协议 v2 的客户端应立即发送：

```json
{ "id": "protocol-1", "type": "negotiate_protocol", "protocolVersion": 2 }
```

成功响应之后，超大 stdout 对象使用连续不中断的 `rpc_chunk` 帧序列，而不是截断内容。每个分块携带 UTF-8 JSON 对象的一段 base64 数据：

```json
{
	"type": "rpc_chunk",
	"chunkId": "rpc-1",
	"index": 0,
	"count": 7,
	"byteLength": 1600042,
	"data": "eyJ0eXBlIjoicmVzcG9uc2UiLC4uLn0="
}
```

客户端必须验证 `chunkId`、`index`、`count` 和 `byteLength`，拒绝交错或中断的序列，强制执行公布的重组限制，按索引顺序拼接解码后的字节，以严格 UTF-8 解码，并将结果解析为一个 JSON 对象。从 `@oh-my-pi/pi-coding-agent/modes/rpc/rpc-frame` 导出的 TypeScript `RpcFrameDecoder` 实现了此验证。捆绑的 TypeScript 和 Python `RpcClient` 实现以及 Rust 和 Go 客户端，在就绪帧公布支持 v2 时会自动协商 v2。

对于任一版本中过大的 `agent_end`，编码器先移除已经在 `message_end` 帧中原样交付的前导消息，并添加包含原始数量的 `messageCount`。宿主必须保留流式消息，而不能把 `agent_end.messages` 当作完整会话记录。

旧客户端可以忽略新增的就绪字段，继续使用 v1。在 v1 中，超大响应会变成 `success: false`，并带有 `error: "RPC response exceeded the transport limit"`；超大事件可能省略字符串、数组或对象字段。如果 v2 逻辑帧经过终止帧压缩后仍超过 64 MiB，响应会收到相同的溢出错误，其他事件产生 `rpc_frame_error`，而 `agent_end` 回退为空 `messages` 数组加 `messageCount`。大型历史 API 应使用分页，而不是依赖任意大的逻辑帧。

读取方跟得上时，输出直接写入 stdout。出现背压时，服务端将待发送字节溢写到私有临时文件，再以 64 KiB 块排出，保持帧顺序。这以磁盘 I/O 和临时磁盘用量为代价，限制排队输出的内存；在读取方赶上之前，临时磁盘用量可能持续增长。积压排空或进程关闭时会删除该文件。输出或假脱机失败会被记录，释放会话，并以代码 `1` 退出。

客户端必须在关闭 stdin 后继续读取 stdout。正常 EOF 和扩展请求的关闭都会等待待发送输出交付；如果客户端保持 stdout 管道打开却不读取，可能无限推迟退出。

### 出站帧类别（stdout） \{#outbound-frame-categories-stdout}

1. 就绪帧（`{ type: "ready" }`）
2. `RpcResponse`（`{ type: "response", ... }`）
3. `AgentSessionEvent` 对象（`agent_start`、`message_update` 等）
4. `RpcExtensionUIRequest`（`{ type: "extension_ui_request", ... }`）
5. 宿主工具请求/取消（`host_tool_call`、`host_tool_cancel`）
6. 宿主 URI 请求/取消（`host_uri_request`、`host_uri_cancel`）
7. 扩展错误（`{ type: "extension_error", extensionPath, event, error }`）
8. 可用命令更新（`{ type: "available_commands_update", commands }`），在启动时及命令元数据发生变化时发出
9. 提示词完成（`{ type: "prompt_result", id?, agentInvoked, status, error?, sessionSettled }`），除非响应已在本地完成该提示词；参见 [`prompt` 载荷](#prompt-payload)
10.   会话静止（`{ type: "session_settled" }`）；参见[让出与稳定结束](#yield-vs-settled)
11.   子代理帧（`subagent_lifecycle`、`subagent_progress`、`subagent_event`），由 `set_subagent_subscription` 控制
12.   旁支问题帧（`btw_delta`、`btw_record`）；参见[旁支问题](#side-questions-btw)
13.   内置斜杠命令旁路通道（`command_output`、`session_info_update`、`config_update`）
14.   传输溢出通知（`rpc_frame_error`），在事件无法容纳于传输限制内时发出
15.   实时语音帧（`live_phase`、`live_levels`、`live_transcript`、`live_end`）；参见[实时语音子协议](#live-voice-sub-protocol)
16.   仅草稿听写帧（`dictation_state`、`dictation_transcript`、`dictation_end`）；参见[听写子协议](#dictation-sub-protocol)

协议 v2 可以将这些类别中过大的逻辑帧包装为 `rpc_chunk` 帧。

### 入站帧类别（stdin） \{#inbound-frame-categories-stdin}

1. `RpcCommand`
2. `RpcExtensionUIResponse`（`{ type: "extension_ui_response", ... }`）
3. 宿主工具更新/结果（`host_tool_update`、`host_tool_result`）
4. 宿主 URI 结果（`host_uri_result`）

## 请求/响应关联 \{#requestresponse-correlation}

所有命令都接受可选的 `id?: string`。

- 提供时，普通命令响应会回显相同的 `id`。
- `RpcClient` 依赖它来解析待处理请求。

运行时的重要边界行为：

- 如果请求提供了 `id`，未知命令响应会回显它。
- 格式错误的 JSON 和同步分派失败会发出不带 `id` 的 `command: "parse"`。处理已识别命令期间的异常，会发出带有该命令 `type` 和 `id` 的失败。
- 普通 `prompt` 处理会在消息被接纳后确认（排队、获得空闲轮次槽位，或路由至扩展命令），不会在原生 `input` 处理器或图像准备结束之前确认，也不会等待智能体运行结束。`abort_and_prompt` 先等待中止，然后确认。接纳前的失败就是该命令的错误响应。接纳后的失败仍可能随后发出带有相同 `id` 的错误响应。
- 已接纳的 `prompt` 或 `abort_and_prompt` 恰好完成一次：要么成功响应携带 `data.agentInvoked: false`（本地完成），要么稍后的同 `id` 的 `prompt_result` 帧报告其工作如何结束。`prompt_result` 始终在该 `id` 的响应之后写入。

## 命令模式（规范定义） \{#command-schema-canonical}

`RpcCommand` 定义于 `packages/coding-agent/src/modes/rpc/rpc-types.ts`：

### 提示词提交 \{#prompting}

- `{ id?, type: "prompt", message: string, images?: ImageContent[], streamingBehavior?: "steer" | "followUp" }`
- `{ id?, type: "steer", message: string, images?: ImageContent[] }`
- `{ id?, type: "follow_up", message: string, images?: ImageContent[] }`
- `{ id?, type: "remove_queued_message", message: string, queue: "steering" | "followUp" }`
- `{ id?, type: "promote_queued_message", message: string }`
- `{ id?, type: "abort" }`
- `{ id?, type: "abort_and_prompt", message: string, images?: ImageContent[] }`
- `{ id?, type: "abort_and_restore_queue" }`
- `{ id?, type: "abort_and_deliver_queue" }`
- `{ id?, type: "resume" }`
- `{ id?, type: "new_session", parentSession?: string }`
- `{ id?, type: "clear_context" }`：像 TUI 的 `/clear` 一样原地清空对话：保留会话 ID、标题、模型、设置和会话记录文件，追加重置边界，扩展收到 `session_clear`。成功时，之前排队的输入不会在清空的对话中运行，未完成的提示词会落定。返回 `{ droppedCount }`；响应正在流式输出或前台 bash/eval 正在运行时，以 `session_busy` 失败。
- `{ id?, type: "open_session", sessionDir: string, provider?: string, modelId?: string }`

### 协议 \{#protocol}

- `{ id?, type: "negotiate_protocol", protocolVersion: 2 }`

### 状态 \{#state}

- `{ id?, type: "get_state" }`
- `{ id?, type: "set_fast_mode", enabled: boolean }`
- `{ id?, type: "set_slow_mode", enabled: boolean }`
- `{ id?, type: "goal", op: "get" | "create" | "resume" | "pause" | "drop", objective?: string, token_budget?: number }`
- `{ id?, type: "set_ask_dialog", enabled: boolean }`
- `{ id?, type: "get_available_commands" }`
- `{ id?, type: "get_entries", since?: string }`
- `{ id?, type: "get_tree" }`
- `{ id?, type: "set_todos", phases: TodoPhase[] }`
- `{ id?, type: "set_host_tools", tools: RpcHostToolDefinition[] }`
- `{ id?, type: "set_host_uri_schemes", schemes: RpcHostUriSchemeDefinition[] }`
- `{ id?, type: "set_subagent_subscription", level: "off" | "progress" | "events" }`
- `{ id?, type: "set_event_filter", events: string[] | null, messageUpdates?: "full" | "delta" }`
- `{ id?, type: "get_subagents" }`
- `{ id?, type: "get_subagent_messages", subagentId?: string, sessionFile?: string, fromByte?: number }`
- `{ id?, type: "cancel_subagent", subagentId: string }`
- `{ id?, type: "steer_subagent", subagentId: string, message: string }`

### 模型 \{#model}

- `{ id?, type: "set_model", provider: string, modelId: string, thinkingLevel?: ConfiguredThinkingLevel, role?: string }`
- `{ id?, type: "cycle_model" }`
- `{ id?, type: "get_available_models" }`
- `{ id?, type: "get_model_picker", query?: string, limit?: number }`

`get_available_models` 等待后台模型发现完成后再返回。当请求的模型尚不在可用目录中时，`set_model` 也会等待；它返回选中的 `Model`，或 `Model not found: <provider>/<modelId>` 失败。可选的 `role` 记录此次切换所属的模型角色（快捷角色选择会传入其角色）；无论是否提供，都不会持久化任何内容。

`get_model_picker` 返回 `{ rows, recent, total }`：向任意客户端提供 omp 的会话模型选择器（alt+p），使远程选择器与 TUI 以完全相同的方式列出模型并排序。空白 `query` 进入浏览模式，最近区块在前（`recent` 统计其前导行数；包含承担角色的模型和最近使用的模型），`provider/` 将匹配限制在一个模型提供方内，以 `@` 开头的查询列出 ctrl+p 快捷角色。每行携带模型承担的角色（`roles`）、思考滑块的档位（`thinking`）以及会话将使用的档位（`thinkingLevel`）、`overContext` 和 `current`；快捷角色行携带 `role`，可传回给 `set_model`。

### 思考 \{#thinking}

- `{ id?, type: "set_thinking_level", level: ConfiguredThinkingLevel }`
- `{ id?, type: "cycle_thinking_level" }`
- `{ id?, type: "get_available_thinking_levels" }`

`ThinkingLevel` 为 `"inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`。发现返回 `"off"`，然后是当前模型支持的推理强度，省略 `"inherit"` 和仅会话使用的 `"auto"` 选择器。`set_thinking_level` 本身接受 `ConfiguredThinkingLevel`（上述类型加 `"auto"`），因此客户端可以选择逐轮次自动推理强度。

### 队列模式 \{#queue-modes}

- `{ id?, type: "set_steering_mode", mode: "all" | "one-at-a-time" }`
- `{ id?, type: "set_follow_up_mode", mode: "all" | "one-at-a-time" }`
- `{ id?, type: "set_interrupt_mode", mode: "immediate" | "wait" }`

### 上下文压缩 \{#compaction}

- `{ id?, type: "compact", customInstructions?: string }`
- `{ id?, type: "set_auto_compaction", enabled: boolean }`

`compact` 在上下文压缩结束后以 `CompactionResult` 应答。进度
通过 `manual_compaction_start` 和 `manual_compaction_end` 事件到达（参见
[进度事件](#progress-events)）。

### 缓存预热 \{#cache-warming}

- `{ id?, type: "set_cache_warming", mode: "off" | "streaming" | "idle" }`

为当前会话设置 `providers.cacheWarming`，不写入 `config.yml`。
`off` 清除已安排的刷新，并中止正在进行的刷新；`streaming`
在智能体活动运行期间预热；`idle` 还会在两次运行之间预热。启用预热
不会重放旧的已取消运行：下一次真实的模型提供方请求才会将其激活。
无效模式返回通常的 `success: false` 响应。成功时报告
应用覆盖后的有效模式：

```json
{ "id": "warming-off", "type": "response", "command": "set_cache_warming", "success": true, "data": { "mode": "off" } }
```

TypeScript 客户端公开 `setCacheWarming(mode): Promise<CacheWarmingMode>`。

### 重试 \{#retry}

- `{ id?, type: "set_auto_retry", enabled: boolean }`
- `{ id?, type: "abort_retry" }`

### Bash \{#bash}

- `{ id?, type: "bash", command: string, excludeFromContext?: boolean }`
- `{ id?, type: "abort_bash" }`

`excludeFromContext: true` 将此次运行排除在模型上下文之外，类似终端的
`!!`：输出仍会返回并记录在会话记录中，扩展
和 `get_messages` 都能看到。非布尔值会被拒绝。

旧运行时会忽略未知字段并共享输出，因此仅当
`ready` 帧包含
`supportsBashExcludeFromContext: true` 时才发送 `excludeFromContext: true`。`RpcClient.bash()` 会强制检查这一点；使用
Python、Go 和 Rust SDK 时，请检查 `client.ready` / `Ready()` / `ready()`。

`bash` 会并发分派：shell 命令运行期间，RPC 服务端继续读取命令，
因此在长时间运行的 `bash` 期间发送的 `abort_bash`（或任何其他命令）
会得到处理，而不用等待其自行
结束。`bash` 响应在命令完成时发出；宿主
通过 `id` 将其关联。并发命令之间不保证顺序，
客户端必须根据 `id` 匹配响应，不能根据发出顺序。

### 会话 \{#session}

- `{ id?, type: "get_session_stats" }`
- `{ id?, type: "get_session_lease", sessionIds: string[] }` → `data: { held: string[], unknown: string[] }`：探测哪些会话由运行中的 omp（包括本进程）持有，而不获取它们的所有权租约。不在任一列表中的 id 为空闲；`unknown` 中的 id 无法探测。`omp session lease --json -- <id>...` 无需 RPC 子进程即可给出相同答案（`--` 防止以 `-` 开头的 id 被解析为选项）。
- `{ id?, type: "export_html", outputPath?: string }`
- `{ id?, type: "switch_session", sessionPath: string, provider?: string, modelId?: string }`
- `{ id?, type: "branch", entryId: string }`
- `{ id?, type: "fork", entryId?: string }`
- `{ id?, type: "navigate_tree", entryId: string, summarize?: boolean, customInstructions?: string }` → `data: { cancelled: boolean, aborted?: true, editorText?: string }`
- `{ id?, type: "abort_branch_summary" }`
- `{ id?, type: "set_label", entryId: string, label?: string }`
- `{ id?, type: "get_branch_messages" }`
- `{ id?, type: "get_last_assistant_text" }`
- `{ id?, type: "set_session_name", name: string }`
- `{ id?, type: "handoff", customInstructions?: string }`

响应正在流式输出时，`handoff` 会失败。成功时，其载荷为 `{ savedPath? }`，如果未生成交接内容则为 `null`。会话转换（`new_session`、`switch_session`、`branch`、`fork`、`open_session`）在扩展阻止转换时报告取消。

`fork` 将进程转移至一个新会话文件，并返回 `{ cancelled }`；使用 `get_state` 读取新的 `sessionFile`/`sessionId`。提供 `entryId` 时（来自 `get_entries` 的任意 `message` 条目，例如用户或助手消息），新文件包含从根到该条目的路径，包含该条目及会话产物（包括溢写文件），因此保留的 `local://N.log` 引用仍可解析，其头部的 `parentSession` 为旧会话文件。当 `entryId` 位于助手工具调用批次内部（助手消息本身或其工具结果之一）时，截取范围延伸至该批次已记录的工具结果，使派生新会话绝不会以结果被丢弃的工具调用结束。这会以原因 `"fork"` 运行 `session_before_branch`/`session_branch` 钩子，钩子的 `entryId` 是最后保留的条目。不提供 `entryId` 时，它复制整个会话及其产物（`/fork`），将旧会话 id 记录为 `parentSession`，以原因 `"fork"` 运行 `session_before_switch`/`session_switch`，并在会话未持久化时报告 `cancelled: true`。非消息类型的 `entryId` 会失败。两种形式都会在响应正在流式输出，或 bash、eval、上下文压缩、交接、重试工作正在运行时以 `code: "session_busy"` 失败，包括等待派生钩子或刷新落盘期间开始的工作；被拒绝的派生会保留当前会话、其会话记录、排队的下一轮消息和后台作业。Python 客户端公开 `fork(entry_id=None) -> CancellationResult`。

`navigate_tree` 将同一会话文件中的会话叶节点移至 `entryId`，如同交互式 `/tree` 选择器：用户消息会回退到其自身之前（叶节点移至其父节点，`editorText` 携带其文本），其他条目则成为叶节点。提供 `summarize` 时，会话模型会总结被放弃的分支（如给出 `customInstructions` 则使用），摘要条目落在目标位置。拒绝绝不会移动叶节点或写入会话记录。未知的 `entryId`（`code: "entry_not_found"`）和命令运行时已经忙碌的会话（`code: "session_busy"`，与 `fork` 相同），会在任何副作用之前被拒绝，因此运行中的 `btw` 问题和等待中的目标继续任务都保持不变。有两种拒绝发生在导航开始之后，因此仍会取消运行中的 `btw` 问题（等待中的目标继续任务会先被挂起，随后恢复）：摘要生成期间开始了工作时的 `code: "session_busy"`，以及对于交互选择器可重新打开其问题的 `ask` 工具结果的 `code: "ask_reanswer_unsupported"`，因为重新回答需要该选择器（无法恢复原始问题的 `ask` 结果只会进行普通叶节点移动）。等待启动的目标继续任务会一直挂起到导航结束，然后在新叶节点上运行。使用 `get_messages` 读取新会话记录。`abort_branch_summary` 停止正在运行的摘要：该 `navigate_tree` 应答 `{ cancelled: true, aborted: true }`，且不发生移动；它会绕过命令队列，否则会被排在其要停止的 `navigate_tree` 之后。

`set_label` 设置条目的标签，省略 `label` 时清除标签；未知 `entryId` 会失败。

### 消息 \{#messages}

- `{ id?, type: "get_messages" }`
- `{ id?, type: "get_messages_page", cursor?: string, limit?: number }`

`get_messages_page` 返回稳定的按时间排序页面，包含 `messages`、`totalMessages`，以及在还有更多消息时提供的不透明 `nextCursor`。游标绑定到会话 ID、持久化叶节点和消息数量。如果会话在请求之间发生改变，服务端会拒绝陈旧游标，并在会话正在流式输出或压缩上下文时拒绝开始分页遍历。失败的页面请求在错误响应中携带机器可读的 `code`，为 `session_busy`（会话正在流式输出或压缩上下文）或 `stale_cursor`（游标背后的快照发生变化，例如后台 bash 在两页之间追加了消息），因此客户端无需匹配错误消息文本即可响应。默认每页 100 条消息；`limit` 必须是 1 至 256 的整数。页面构建器通常将序列化消息内容限制为 768 KiB，但始终包含至少一条消息，因此单条大型消息可能超过该预算。v1 调用方可以对普通历史分页，但如果单条消息的响应超过 1 MiB 物理帧上限，就会产生溢出错误；无损获取它需要协商 v2 分帧。

捆绑的 TypeScript `RpcClient.getMessages()` 和 Python `RpcClient.get_messages()` 在协商 v2 后，会自动读完此分页端点。连接到 v1 服务端时，它们保留旧的整体命令；遇到 `session_busy` 或 `stale_cursor` 时，会丢弃部分页面，回退到旧的尽力而为快照。直接调用 `getMessagesPage()` 和 `get_messages_page()` 仍保持严格，以免增量宿主静默混合快照。

### 登录 \{#login}

- `{ id?, type: "get_login_providers" }`
- `{ id?, type: "login", providerId: string }`
- `{ id?, type: "get_logout_accounts", providerId: string }` → `data: { accounts: LogoutAccount[] }`
- `{ id?, type: "logout", providerId: string, credentialId: number }` → `data: { remainingSource?: string }`

只有模型提供方发出
授权 URL 后，登录才转发普通 OAuth 输入提示。标记为 `secret: true` 的提示始终会被拒绝，
返回失败的 `login` 响应，指引用户转到终端 UI；不会发出普通
`input` 请求，因为 RPC 不协商宿主是否遮蔽
`secret` 输入。（扩展和工具的 `input` 对话框仍可能在
`extension_ui_request` 上附带未经协商的 `secret?: boolean` 提示；参见下文。）

注销与 TUI 中的 `/logout` 一样，针对每个已存储凭据操作，因为一个
模型提供方可以拥有多个账户。`get_logout_accounts` 列出它们（`credentialId`、
`provider`、`label`、`detail`、`type`，以及会话可能
正在使用的凭据的 `active`），活动凭据优先。`logout` 移除一个凭据并刷新该模型提供方的模型；
凭据已不再存储时会失败。`remainingSource` 指出
仍为该模型提供方提供身份验证的来源：另一个已存储凭据、环境
变量或配置键。

### 单词预测 \{#word-prediction}

- `{ id?, type: "predict_word", text: string, cursor: number }` → `data: { suffix: string | null }`
- `{ id?, type: "predict_word_feedback", text: string, cursor: number, suggestion: string, accepted: boolean }`

为自行渲染输入框的宿主提供输入框幽灵文本。`text` 是
整个草稿，`cursor` 是其中的 UTF-16 偏移量。服务端应用与
终端编辑器相同的门控（光标必须位于当前行末尾，且
位于正文单词末尾；代码、路径和斜杠命令不会得到结果），并使用
`spelling.autocomplete` 选中的引擎应答；`off` 始终回答 `suffix: null`。

`predict_word` 像 `bash` 一样并发分派，因此缓慢的预测
绝不会延迟其他命令；应按 `id` 匹配响应。每个会话的服务端
保持一个正在执行的引擎请求：运行期间到达的请求会等待，
更新的请求会替换它，并向被替换的请求回答 `suffix: null`。
宿主可以在每次按键时发送；只有最新草稿会到达引擎。

首次请求可能需要数秒（最坏情况约两分钟），因为共享
预测守护进程需要启动并加载引擎。守护进程无法
启动或应答时，`predict_word` 会失败（`success: false`），并在
守护进程退避的约 30 秒内持续快速失败。应将失败视为
“没有幽灵文本”，而不是每次按键都向用户显示。

发送 `predict_word_feedback` 时，使用显示建议时的 `text` 和 `cursor`：
用户接受建议时设为 `accepted: true`，继续输入越过建议时设为 `false`。
反馈会调整引擎学习到的状态。

### 旁支问题 \{#side-questions}

- `{ id?, type: "btw", question: string, recordId?: string }` → `data: { record: BtwHistoryRecord }`
- `{ id?, type: "btw_cancel", recordId?: string }` → `data: { cancelled: boolean }`
- `{ id?, type: "get_btw_history" }` → `data: { records: BtwHistoryRecord[] }`

参见[旁支问题（`/btw`）](#side-questions-btw)。

## 响应模式 \{#response-schema}

所有命令结果都使用 `RpcResponse`：

- 成功：`{ id?, type: "response", command: <command>, success: true, data?: ... }`
- 失败：`{ id?, type: "response", command: string, success: false, error: string, code?: string }`

数据载荷因命令而异，定义于 `rpc-types.ts`。

### `prompt` 载荷 \{#prompt-payload}

`prompt` 在消息被接纳后确认，即已为其启动空闲轮次、智能体忙碌时将其推入引导/后续/旁路队列，或将其路由至已注册的扩展命令（在该命令处理器运行之前），而不是在模型轮次完成之后。接纳先运行图像规范化（对于启用视觉描述的纯文本模型，还会运行视觉描述调用），因此这些工作在确认之前完成。视觉描述调用上限为 20 秒，使确认保持在捆绑客户端 30 秒的请求超时范围内；超过上限仍会保存图像，并告知模型描述不可用。通过 `prompt` 发送的 `/skill:` 调用也遵循相同规则。提示词若从未被接纳就落定（被 `abort` 丢弃，或提前失败），会在落定时确认。对确认进行门控不会改变完成机制：提示词仍恰好完成一次，通过 `data.agentInvoked: false` 或其 `prompt_result`（下文）。

`prompt` 会在之前收到的普通命令（如 `new_session` 或 `set_model`）完成之后开始。接纳过程随后在后台运行：RPC 服务端继续处理后续命令，如 `abort`、`steer`、`follow_up`、`get_state` 等，不等待缓慢的图像规范化或视觉描述。提示词的图像仍在准备期间到达的 `abort` 会取消视觉描述调用并丢弃提示词，无论它原本会启动空闲轮次，还是通过 `streamingBehavior` 排队。

```json
{
	"id": "req_1",
	"type": "response",
	"command": "prompt",
	"success": true,
	"data": { "agentInvoked": false }
}
```

`data.agentInvoked: false` 是同步完成且不启动智能体轮次的内置斜杠命令的完成信号；之后不会跟随 `prompt_result`。其他每个已接纳的 `prompt`（以及每个 `abort_and_prompt`）在本地结果或智能体让出状态已知时，由一个携带命令 `id` 的 `prompt_result` 帧完成。后台工作不需要已经稳定结束：

```json
{ "type": "prompt_result", "id": "req_1", "agentInvoked": true, "status": "completed", "sessionSettled": true }
```

- `agentInvoked: false`：提示词在本地完成（未启动轮次的扩展或自定义命令），或在到达智能体之前失败。
- `agentInvoked: true`：提示词已分派或排队，等待智能体处理；正常完成会在智能体**让出**时报告，参见[让出与稳定结束](#yield-vs-settled)。分派之前抢先生效的中止仍可能报告 `true`，并带有 `status: "aborted"`。作为新轮次分派的提示词，报告其接纳后启动的第一次运行，因此较早运行中迟到的 `agent_end` 绝不会使其完成。排入正在进行的运行中的提示词（`streamingBehavior`），会在其消息离开队列后的第一次让出时报告。带有 `yielded: false` 的 `agent_end`（智能体正在重试、压缩上下文或回答停止时提醒）绝不会使提示词完成。
- `status`：`"completed"`、`"aborted"`（被 `abort`、`abort_and_prompt` 或会话转换中断，或在分派前被中止丢弃），或 `"error"`。
- `error`（仅在 `status: "error"` 时）：`{ message, provider?, model?, httpStatus?, retryable, code? }`。`message` 是模型提供方的错误文本，移除了 OMP 本地诊断信息（例如已保存的请求转储路径）。`retryable` 标记临时失败；OMP 自身的自动重试已经耗尽。`code: "cost_cap"` 表示会话达到 `session.maxCost`，OMP 没有发送下一次请求；服务端继续运行，在提高上限之前，后续提示词都会以同样方式结束。提示词若在到达智能体之前失败，还会在其 `prompt_result` 之前收到带有相同 `id` 的旧式错误响应。
- `sessionSettled`：写入结果时会话是否已经结束，参见[让出与稳定结束](#yield-vs-settled)。`false` 表示后台工作仍可唤醒智能体；待其稳定结束后会跟随一个 `session_settled` 帧。

模型提供方轮次失败并不意味着命令失败：提示词响应仍为 `success: true`，轮次以正常终止的 `agent_end` 结束，其中最后一条助手消息带有 `stopReason: "error"`。应使用 `prompt_result.status`，而不是解析该消息。

仅本地执行的斜杠命令可能在完成之前发出 `command_output` 帧。它们不发出 `agent_end`。

### 让出与稳定结束 \{#yield-vs-settled}

对于调用智能体的工作，提示词的 `prompt_result` 报告的是**智能体让出**：它完成了轮次（带有 `yielded: true` 的 `agent_end`），或者提示词在分派前或因会话转换被中止。仅本地结果和分派前错误不需要 `agent_end`。只有再无任何工作能唤醒会话时，**会话才算结束**，即没有正在运行或已接纳的运行，没有排队的引导/后续消息，也没有后台作业（自动转入后台的 `bash`、异步 `task`、`eval`）或待交付结果会注入结果并启动后续轮次。

- `session_settled` 在每段智能体活动中写入一次，时间为会话结束时。如果让出时仍有后台工作待完成，OMP 会等待；其触发的任何后续运行都会在 `session_settled` 之前正常流式输出（`agent_start` … `agent_end`）。它始终在最后一次让出的 `prompt_result` 帧之后发出，不会为从未到达智能体的提示词发出。
- `prompt_result.sessionSettled` 在让出时回答同一问题，因此为 `true` 时宿主可以立即拆除运行环境。
- `get_state` 报告 `isSettled`（相同判断条件）和 `hasPendingAsyncWork`，供中途附加的宿主使用。

等待 `prompt_result` 以呈现轮次回答；在将对话视为结束之前，等待 `session_settled`（或 `isSettled`），例如在暂停或回收沙箱之前。

### `open_session` 载荷 \{#open_session-payload}

`open_session` 将进程绑定至由宿主指定键的对话目录，相当于运行时的 `--session-dir <dir> --continue`，使预先启动的进程能在启动后接管一个对话线程。它继续 `sessionDir` 中最新的非空会话（或者，像终端中没有上次会话记录时的 `--continue` 一样，如果该会话的对话在另一个文件中继续，则使用拥有最新轮次的对话副本），如果没有会话，则在该目录启动新会话。重新打开已处于活动状态的会话（包括同一目录中仍为空的新会话）是无操作，不会中断正在运行的轮次；否则，当前运行会像 `switch_session` 一样被中止，未完成提示词以 `status: "aborted"` 完成。

```json
{ "cancelled": false, "resumed": true, "sessionId": "01a0...", "sessionFile": "/srv/threads/t1/2026-...jsonl" }
```

启动新会话时，`resumed` 为 `false`。进程以无持久化模式运行（`--no-session`）时，该命令会失败。

成功的 `open_session` 还会将仍未完成的 RPC 提示词票据标记为已中止，即使目录已经打开也是如此；在该无操作情况下，底层轮次仍继续流式输出。`cancelled: true` 会保持活动会话和提示词票据不变。

恢复的会话会像 `--continue` 一样还原保存的模型。如果所有保存模型都无法还原（例如模型 id 更名，或没有模型提供方凭据），`open_session` 会以 `Could not restore model <provider/id>` 失败，而不是将会话记录发送给另一个模型。之前的会话保持活动，进程继续服务，但其中正在运行的轮次会像任何会话切换一样被中止。`switch_session` 也以相同方式失败。

如果要改为绑定特定模型，请像 `set_model` 一样同时传入 `provider` 和 `modelId`。与启动时的 `--model` 一样，它们会替换保存的模型，并跳过其检查。未知组合会在任何会话更改之前以 `Model not found: <provider>/<modelId>` 失败。恢复的会话会在模型与保存模型不同时记录该模型，已打开或新建的会话则像 `set_model` 一样选择它。`switch_session` 接受同一对参数。

```json
{
	"id": "open-1",
	"type": "open_session",
	"sessionDir": "/srv/threads/t1",
	"provider": "anthropic",
	"modelId": "claude-sonnet-4-5"
}
```

### `remove_queued_message` 载荷 \{#remove_queued_message-payload}

从所选待处理队列中移除第一条匹配的用户编写消息：

```json
{"id":"req_2","type":"remove_queued_message","message":"Use the existing parser","queue":"steering"}
{"id":"req_2","type":"response","command":"remove_queued_message","success":true,"data":{"removed":true}}
```

`message` 首先匹配斜杠/自定义命令重写、提示词模板展开或 `^model` 提及替换之前保留的原始提交文本；如果找不到，则匹配精确的队列标签文本。移除操作绝不会重新运行命令或模板来寻找匹配项。排队的 RPC 技能命令将原始 `/skill:<name>` 调用保留为标签文本。移除还会丢弃该消息的附件及紧邻其前的隐藏用户伴随消息（关键词通知、图像描述和视频源路径），保留其他消息和另一队列。

伴随消息和其提示词会作为完整组入队和出队，包括在 `one-at-a-time` 模式下。一旦该组离开待处理队列进行交付，移除请求就不能在其上下文仅部分发出后报告成功。

智能体编写的条目绝不会匹配，包括带有 `role: "user"` 和 `attribution: "agent"` 的内部交接。文本重复时，每个请求只移除第一个匹配项；重复一次成功的请求可能移除另一个匹配项。

检查和移除是同步的：`data.removed: false` 表示分派时该队列中没有匹配的待处理用户消息。已经出队的消息和仍在预处理的输入，不能由此命令取消。实时引导输入在会话记录将其记下之前，仍可能在队列快照中可见，即使它已离开可移除的待处理队列。该命令不会重新发送输入、中止轮次或改变中断行为。非字符串的 `message` 值以及缺失或无效的 `queue` 值都会产生错误响应。

移除请求只有在 `removed: true` 之后才可以隐藏标签或恢复草稿；正常交付仍通过队列快照移除标签。旧运行时拒绝此命令；客户端不得回退为中止或重新发送排队消息。TypeScript 客户端公开 `removeQueuedMessage(message, queue): Promise<{ removed, images?, imagesDropped? }>`。

被移除的消息带有图像时，`data.images` 会列出它们（与 `abort_and_restore_queue` 返回的 `ImageContent` 条目相同），使客户端能恢复草稿及其附件；纯文本消息和 `removed: false` 响应会省略此字段。如果图像会超过协商的传输限制（参见 `abort_and_restore_queue`），服务端会省略它们，并设置 `data.imagesDropped: true`，而不是失败；消息仍会被移除。旧运行时两个字段都不返回。

官方 Python 客户端公开 `remove_queued_message(message, queue) -> RemoveQueuedMessageResult`；应检查其 `.removed` 布尔值，而不是结果对象的真值。

### `promote_queued_message` 载荷 \{#promote_queued_message-payload}

将第一条匹配的用户编写后续消息移至引导队列末尾：

```json
{"id":"req_3","type":"promote_queued_message","message":"Use the existing parser"}
{"id":"req_3","type":"response","command":"promote_queued_message","success":true,"data":{"promoted":true}}
```

该命令移动现有排队消息，包括其附件和紧邻其前的隐藏用户伴随消息，不重新处理或复制它。`message` 的匹配方式与 `remove_queued_message` 完全相同，因此智能体编写的条目绝不会匹配。文本重复时，每个请求只移动第一条匹配的后续消息；重复一次成功的请求可能移动另一个匹配项。

`data.promoted: false` 表示分派时没有匹配的待处理用户后续消息（例如已经交付）。非字符串的 `message` 值产生错误响应。现有引导、后续和中断模式仍然适用；提升不会中止模型流，也不保证取消正在运行的工具。智能体空闲时，提升的消息会立即启动轮次，包括在用户 `abort` 之后，因为提升是现在进行引导的显式请求。该移动通过一次 `queue_update` 报告，其中消息已经离开 `followUp` 并加入 `steering`。

由于 `prompt` 只在消息被接纳后确认（参见上文），紧跟排队 `prompt` 的确认发送的 `promote_queued_message` 能可靠地观察到该消息。旧运行时拒绝此命令；客户端不得回退为 `steer`，否则会将重复消息入队。TypeScript 客户端公开 `promoteQueuedMessage(message): Promise<{ promoted: boolean }>`，其 `prompt(message, images?, streamingBehavior?)` 接受 `"steer"` 或 `"followUp"`，以便对智能体忙碌时发送的提示词排队。

官方 Python 客户端公开 `promote_queued_message(message) -> PromoteQueuedMessageResult`；应检查其 `.promoted` 布尔值，而不是结果对象的真值。

### `abort_and_restore_queue` 载荷 \{#abort_and_restore_queue-payload}

以原子方式取回排队的用户输入并中止，相当于 RPC 中的 TUI Esc 操作：

```json
{"id":"req_4","type":"abort_and_restore_queue"}
{"id":"req_4","type":"response","command":"abort_and_restore_queue","success":true,"data":{"steering":[{"text":"Use the existing parser"}],"followUp":[{"text":"Then run the tests","images":[{"type":"image","mimeType":"image/png","data":"..."}]}]}}
```

中止之前，服务端撤回每条用户编写的引导和后续消息，包括运行已从队列取出但从未记录到会话记录的输入：被中止响应实时认领的引导，以及为下一次模型调用出队的引导或后续消息。由扩展或智能体发送的可见排队消息（来自 `pi.sendMessage` 的扩展卡片、父智能体的引导、归属于智能体的提示词及其隐藏伴随消息、顾问卡片）不会返回，也不会丢失：运行停止后，中止操作会将其记录到会话记录中，但不启动轮次，因此模型会随下一个提示词看到它们。其他隐藏排队上下文会被丢弃：`display: false` 自定义消息（目标/计划/预算通知）和合成开发者指令。中止不会从旧队列启动轮次；如果它结束期间其他来源启动了轮次，可见消息会作为后续消息加入该轮次。普通 `abort` 则会将搁置的引导重新排队，并将其排入新轮次；先用 `remove_queued_message` 撤回它们会与智能体循环产生竞态。

`data.steering` 和 `data.followUp` 按从旧到新列出已撤回消息，格式为 `{ text, images? }`，其中 `text` 为队列标签文本，使客户端可以将它们放回编辑器。该命令在其他方面与 `abort` 一样：停止目标继续任务，取消此前收到但尚未接纳的输入（这些输入被丢弃，不会返回），并在中止完成后响应。旧运行时拒绝此命令。TypeScript 客户端公开 `abortAndRestoreQueue(): Promise<{ steering, followUp }>`。

即使撤回的输入过大，无法容纳在协商协议的一次响应中（v1 每帧 1 MiB，v2 重组后 64 MiB），响应也始终成功。服务端不会以传输限制错误失败，因为那会丢失已撤回的输入；它会先省略每个条目的 `images`，设置 `data.imagesDropped: true`，保留全部文本。如果仅文本仍放不下，则只返回能够容纳的最早条目（先引导，再后续消息），并设置 `data.truncated: true`；最后一个列出条目之后的条目都会丢失。完整结果能容纳时，两个标志都不出现。

### `abort_and_deliver_queue` 和 `resume` 载荷 \{#abort_and_deliver_queue-and-resume-payloads}

TUI 的空输入 Enter 及其 `.`/`c` 继续快捷操作：

```json
{"id":"req_5","type":"abort_and_deliver_queue"}
{"id":"req_5","type":"response","command":"abort_and_deliver_queue","success":true,"data":{"aborted":true}}
{"id":"req_6","type":"resume"}
{"id":"req_6","type":"response","command":"resume","success":true}
```

`abort_and_deliver_queue` 中断一个已有排队用户输入（或正在执行的响应已实时取走引导）的流式运行，并使用该输入继续运行。没有流式运行或没有排队内容时，它不做任何事，并回答 `aborted: false`。

`resume` 使智能体继续运行。正在运行的轮次会先被中断；有输入排队时，会由这些输入而不是继续指令来继续运行。模型尚未回答的提示词会按原样再次运行。继续运行开始后，它就应答；如果会话没有可继续的对话，则以 `Nothing to resume` 失败。

两者都会等待此前收到的用户输入，因此紧接在它们之前发送的 `prompt`，到它们运行时已经入队，并成为它们交付的输入。与 `abort` 不同，它们不会取消更早的输入，并保持目标继续任务运行；它们之后收到的 `abort` 会在它们尚未开始时取消它们。旧运行时拒绝这两个命令。TypeScript 客户端公开 `abortAndDeliverQueue(): Promise<boolean>` 和 `resume(): Promise<void>`。

### `get_state` 载荷 \{#get_state-payload}

输出吞吐量可用时，`tokensPerSecond` 是数字，
否则为 `null`。`fastModeEnabled` 报告会话选定的模型家族层级
（`priority` 或 `ultrafast`），而 `fastModeActive` 报告实际计算出的
活动状态。对于 Fireworks，`providers.fireworksTier: priority` 独立于
`/fast` 家族设置，因此对于 `/fast` 无法切换的模型，
`fastModeActive` 仍可能保持 `true`。Fireworks 的 `-fast` 服务变体不使用优先级。

对于直接连接的 Anthropic，模型提供方拒绝 `speed: "fast"` 时，会使用以
解析后的端点和精确模型为范围的持续后备机制：`fastModeEnabled` 可能
保持 `true`，而 `fastModeActive` 为 `false`。显式启用 `set_fast_mode`
表示重试意图，并清除此后备状态，使模型提供方尝试
重新激活。

`slowModeSupported` 表示 `/slow` 是否适用于当前模型：OpenAI 和 Google 系列模型的
`flex` 服务层级，或直连 Anthropic 模型的低优先级
通道。`slowModeEnabled` 表示当前模型是否已开启该模式，
因此当 `slowModeSupported` 为 `false` 时，它始终为 `false`。
这并不意味着持久化设置已被关闭。`slowModeScope` 表示
当前模型的设置保存在哪里：`global` 表示持久化配置，
它在切换模型后仍然保留，并适用于每个会话和终端（Claude 低
优先级，`providers.anthropic.slowMode`）；`session` 表示此会话的
按模型系列划分的 flex 层级。不支持时不包含此字段。模型变更后重新读取这三个字段；
其他会话进行的 `global` 变更不会发出事件。

`usageLimit` 以模型提供方无关的形式报告当前模型所用账户超出使用限额的状态。
`stage` 在超出限额后的短暂宽限期间为
`wrap_up`，在账户开始使用空闲容量提供服务后为 `low_priority`。
`resetsAtSec` 是供客户端按本地格式显示的纪元时间戳；低优先级状态
还可能报告 `allowanceLeftPercent`，而收尾阶段会报告后续是否进入
`extraUsage`。目前只有 Claude 订阅会产生该字段。
在这两个阶段之外不包含该字段。没有事件携带它，因此应在运行
期间、`agent_end` 之后以及斜杠命令之后重新读取 `get_state`。

```json
{
	"model": { "provider": "...", "id": "..." },
	"thinkingLevel": "off|minimal|low|medium|high|xhigh|max",
	"configuredThinkingLevel": "auto|off|minimal|low|medium|high|xhigh|max",
	"thinkingLevels": ["off", "auto", "low", "medium", "high"],
	"isStreaming": false,
	"isCompacting": false,
	"steeringMode": "all|one-at-a-time",
	"followUpMode": "all|one-at-a-time",
	"interruptMode": "immediate|wait",
	"sessionFile": "...",
	"sessionId": "...",
	"sessionName": "...",
	"fastModeEnabled": false,
	"tokensPerSecond": null,
	"fastModeActive": false,
	"slowModeSupported": true,
	"slowModeEnabled": true,
	"slowModeScope": "global",
	"usageLimit": {
		"stage": "low_priority",
		"resetsAtSec": 1770000000,
		"allowanceLeftPercent": 62
	},
	"autoCompactionEnabled": true,
	"messageCount": 0,
	"queuedMessageCount": 0,
	"hasPendingAsyncWork": false,
	"isSettled": true,
	"queuedMessages": { "steering": [], "followUp": [] },
	"todoPhases": [
		{
			"name": "Todos",
			"tasks": [
				{
					"content": "Map the tool surface",
					"status": "in_progress"
				}
			]
		}
	],
	"systemPrompt": ["..."],
	"dumpTools": [
		{
			"name": "read",
			"description": "Read files and URLs",
			"parameters": {}
		}
	],
	"contextUsage": {
		"tokens": 1100,
		"contextWindow": 200000,
		"percent": 0.55
	},
	"goal": null
}
```

值为 `undefined` 的字段会从 JSON 中省略，包括未设置的
模型/思考级别、会话名称/文件，或不可用的 `contextUsage`。
`dumpTools` 还可能在各工具的模式之外包含其 `examples`。
它列出的只是智能体的**顶层工具定义**，而非完整的已挂载
工具清单。在默认的 `tools.commands: true` 设置下，已启用的可发现工具，
包括 MCP 工具，会改为挂载为 bash 工具命令。MCP 工具
未出现在 `dumpTools` 中，**并不**意味着其服务器连接失败。这
同时适用于 `--mode rpc` 和 `--mode rpc-ui`。

智能体通过在 `bash` 调用中将已挂载工具作为命令运行来调用它：

- `<tool> --help` 输出根据工具 JSON 模式生成的用法。
- `<tool> --flag value` 运行工具；必填的顶层标量也可按位置传入，`-j '{"flag":"value"}'` 则传入原始 JSON 参数。

这些是**智能体工具调用**，而非额外的 RPC 命令类型，因此外层的
`tool_execution_start` / `tool_execution_end` 事件和结果名称为 `bash`。
挂载为命令的宿主工具可通过它触发的 `host_tool_call` 请求，
以及 bash 结果中 `details.toolCommands` 内的分发记录识别。
请使用工具的实际名称；MCP 运行时名称经过规范化处理，可能
与服务器原始工具名称不同。验证调用时，
应检查当前轮次的帧和结果，而不只是助手文本或
更早的会话记录条目。

MCP 配置遵循常规的 [MCP 配置规则](./mcp-config.md)：
`disabledServers` 和 `enabledServers` 是当前配置档案的**用户**列表，
拒绝列表优先于允许列表。项目配置可以通过每台服务器的
`enabled: false` 禁用服务器；项目的 `disabledServers` 列表不能替代
用户拒绝列表。在外部编辑 MCP 配置文件后，重启
RPC 进程以应用并验证新配置。

`queuedMessages` 保存与下文 `queue_update`
事件相同的可显示队列标签文本。将此文本用于 `remove_queued_message` 时，要遵循其待处理队列
边界：实时引导输入在记录前仍然可见，但已无法移除。
客户端应根据这些快照呈现队列，而不是独立跟踪标签，
并将移除响应视为确认，而不是第二个
事实来源。`queuedMessageCount` 还包含顾问卡片和待处理的
下一轮消息，因此不一定等于用户编写的标签数量。

### `goal` 载荷 \{#goal-payload}

`goal` 管理目标模式，其生命周期与交互式 `/goal` 命令相同。
每个操作都返回 `{ goal: Goal | null, state: GoalModeState | null }`；`get_state`
携带与 `goal` 相同的状态。`goal_updated` 事件报告每次变更，
包括智能体的 `goal` 工具所做的变更。

- `get` 只读取，绝不会启动轮次。
- `create` 需要 `goal.enabled`、非空的 `objective`，且不存在活动或暂停的
  目标。在计划模式下会被拒绝，`token_budget` 要求为正整数。
  它会将 `goal` 工具添加到活动工具中。
- `resume` 恢复暂停的目标（在计划模式下会被拒绝）。`pause` 和 `drop` 恢复
  目标启动前的活动工具。
- 失败时返回普通的 `success: false` 响应。

除非 `goal.continuationModes`
包含 `"rpc"`，否则目标不会通过 RPC 自行继续；这同时涵盖 `--mode rpc` 和 `--mode rpc-ui`。启用后，
`create`/`resume` 以及每次终结性的 `agent_end` 都会决定是否启动另一个目标
轮次，该轮次以隐藏的 `goal-continuation` 消息发送。

- 让出执行权的运行完全退栈后，轮次才会启动。此时目标
  仍需处于活动状态，会话空闲且队列为空，计划模式关闭，
  并且会话未处于释放过程中。
- 已决定启动轮次但尚未实际启动时，`get_state.isSettled`、
  `prompt_result.sessionSettled` 和 `session_settled` 将会话视为忙碌。
  如果放弃继续，则随后发出 `session_settled`。
- `abort` 会在中止生效前停止继续，并暂停
  被中断的目标，因此之后的提示不会使它重新启动；只有 `goal resume` 才会
  重新启动（或先 `drop`，再执行新的 `create`）。
- 如果目标轮次没有新的工具活动，继续也会停止。下一个
  本身不是目标继续的轮次（例如宿主提示、引导或后续消息）
  会重新使其具备继续条件。
- 会话变更会留下原先的目标及其工具，并恢复
  记录在目标会话中的目标。这涵盖 `new_session`、`switch_session`、
  `branch`、`fork` 和 `open_session`，以及扩展命令所做的相同变更。与
  TUI 一样，活动目标在这种变更后仍保持活动并继续；
  进程启动时恢复的目标则会暂停，直到执行 `goal resume`。变更
  通过会话记录 id 检测，因此宿主固定的 `--provider-session-id` 不会
  掩盖它。若目标轮次正在等待，或在变更进行期间到达启动时机，
  则会被暂缓。如果变更被取消，或会话没有发生变化（树
  导航、重新打开已打开的会话），目标会继续。此类轮次
  被暂缓时，会话不会报告为已稳定。

智能体完成目标时，目标工具会再次被移除，
`get_state.goal` 变为 `null`。

### `set_slow_mode` 载荷 \{#set_slow_mode-payload}

`set_slow_mode` 为当前模型开启或关闭 `/slow`，行为与
斜杠命令完全相同：对于 OpenAI/Google 模型，它设置或清除此会话中该系列的 `flex`
层级；对于直连 Anthropic 模型，它写入持久化的全局
`providers.anthropic.slowMode` 设置（`auto`/`off`），启用时进入所提供的
低优先级窗口，禁用时停止正在使用的窗口。

```json
{ "id": "req_slow_on", "type": "set_slow_mode", "enabled": true }
```

成功时，`data.enabled` 表示当前模型的 `/slow` 现在是否已
开启：

```json
{
	"id": "req_slow_on",
	"type": "response",
	"command": "set_slow_mode",
	"success": true,
	"data": { "enabled": true }
}
```

在没有慢速模式的模型上启用会失败，错误为
`"Slow mode is unavailable for the current model."`。在此类模型上禁用
会成功返回 `{ "enabled": false }`，但不做任何变更，因此它绝不会清除
其他提供方的持久化设置。非布尔类型的 `enabled` 会被拒绝，错误为
`"set_slow_mode requires boolean enabled"`。运行期间所做的变更从
下一个请求开始生效（停止活动的 Claude 低优先级窗口会立即
生效）；没有事件通告此变更，因此应重新读取 `get_state`。

### `set_fast_mode` 载荷 \{#set_fast_mode-payload}

`set_fast_mode` 改变会话是否启用快速模式。
请求如下：

```json
{ "id": "req_fast_on", "type": "set_fast_mode", "enabled": true }
```

成功时，`data` 始终包含 `enabled` 和 `active`。它们是
实际计算出的值：`enabled` 表示会话设置，`active`
表示由此得到的活动状态，其中包含提供方级别的 Fireworks
优先级设置：

对于直连 Anthropic，显式启用还会在粘性拒绝回退后重新允许
尝试提供方，即使快速模式已经启用也是如此。

```json
{
	"id": "req_fast_on",
	"type": "response",
	"command": "set_fast_mode",
	"success": true,
	"data": { "enabled": true, "active": true }
}
```

在没有服务层级系列的模型上，或不提供优先级层级的 OpenAI 系列
模型上启用快速模式，会失败并返回以下错误：

```json
{
	"id": "req_fast_on",
	"type": "response",
	"command": "set_fast_mode",
	"success": false,
	"error": "Fast mode is unavailable for the current model."
}
```

禁用快速模式是幂等的，不支持的模型也不例外。它
会以关闭/无操作结果成功返回，但禁用 `/fast` 不会覆盖
提供方级别的设置，因此禁用成功并不保证
`active: false`。例如，对于不受支持的
`fireworks/deepseek-v4-flash` 模型，在设置 `providers.fireworksTier: priority` 时，
响应会报告会话设置已禁用，而提供方
优先级会使计算出的活动状态保持为 true：

```json
{
	"id": "req_fast_off",
	"type": "response",
	"command": "set_fast_mode",
	"success": true,
	"data": { "enabled": false, "active": true }
}
```

相应的 `get_state` 结果报告相同的计算状态：

```json
{
	"fastModeEnabled": false,
	"fastModeActive": true
}
```

### `set_ask_dialog` 载荷 \{#set_ask_dialog-payload}

`set_ask_dialog` 让宿主选择接收扩展 `ui.askDialog` 调用所用的 `ask` 扩展 UI 请求（参见[扩展 UI 子协议](#extension-ui-sub-protocol)）。默认关闭；启用之前，这些调用使用 `select` 和 `editor`。此设置不影响 `ask` 工具，该工具始终发送完整的 `form`。不含此命令的构建会返回失败的 `response`，因此启用失败时，宿主应继续通过 `select` 和 `editor` 处理扩展对话框。

```json
{ "id": "req_ask", "type": "set_ask_dialog", "enabled": true }
```

```json
{
	"id": "req_ask",
	"type": "response",
	"command": "set_ask_dialog",
	"success": true,
	"data": { "enabled": true }
}
```

### `set_todos` 载荷 \{#set_todos-payload}

替换当前会话的待办状态，并返回 `{ todoPhases }`。该列表记录在当前会话分支上，并像交互式 `/todo` 编辑一样，在重新加载、压缩上下文或恢复该分支时还原。
阶段使用 `{ name, tasks }`；任务保留 `{ content, status }`。没有
阶段或任务 ID。状态为 `"pending"`、`"in_progress"`、`"completed"`、
或 `"abandoned"`。快照克隆会丢弃额外字段，包括
任务的 `details` 和 `notes`。

```json
{
	"id": "req_2",
	"type": "set_todos",
	"phases": [
		{
			"name": "Evaluation",
			"tasks": [
				{
					"content": "Map the read tool surface",
					"status": "in_progress"
				},
				{
					"content": "Exercise edit operations",
					"status": "pending"
				}
			]
		}
	]
}
```

这适用于希望在首次提示前预先设置计划的宿主。

### `set_host_tools` 载荷 \{#set_host_tools-payload}

替换当前由宿主持有、RPC 服务器可通过 stdio 回调的
工具集合：

```json
{
	"id": "req_3",
	"type": "set_host_tools",
	"tools": [
		{
			"name": "echo_host",
			"label": "Echo Host",
			"description": "Echo a value from the embedding host",
			"parameters": {
				"type": "object",
				"properties": {
					"message": { "type": "string" }
				},
				"required": ["message"],
				"additionalProperties": false
			}
		}
	]
}
```

响应载荷如下：

```json
{
	"toolNames": ["echo_host"]
}
```

这些工具会在下一次模型调用前注册。新的非隐藏工具
会自动启用；新的隐藏工具会注册，但不会启用。
重新发送 `set_host_tools` 会替换先前由宿主持有的集合，同时保留
仍存在的宿主工具的启用状态。名称要求唯一，并且不能与
现有非宿主工具冲突。

定义还接受 `hidden?: boolean`、
`loadMode?: "essential" | "discoverable"` 和 `readsSkillUris?: boolean`。
当工具能够读取 `skill://` 指令内容时，设置 `readsSkillUris: true`；
提示构建器使用此能力来决定是否包含技能指引。
显式指定的加载模式优先。省略时，已知的必要内置名称仍为
`"essential"`；其他宿主工具默认为 `"discoverable"`。响应中的 `toolNames`
列出已注册的名称。

### `set_host_uri_schemes` 载荷 \{#set_host_uri_schemes-payload}

替换当前由宿主持有、RPC 服务器应通过其分发
读写操作的 URL scheme 集合：

```json
{
	"id": "req_4",
	"type": "set_host_uri_schemes",
	"schemes": [
		{
			"scheme": "db",
			"description": "Virtual db row files",
			"writable": true,
			"immutable": false
		}
	]
}
```

响应载荷如下：

```json
{
	"schemes": ["db"]
}
```

scheme 名称会去除首尾空白并转为小写，且要求匹配 `[a-z][a-z0-9+.-]*`。
`writable` 和 `immutable` 默认为 `false`。重新发送 `set_host_uri_schemes`
会替换之前的整个集合，新列表中缺失的 scheme
会取消注册；空列表会清除所有宿主 scheme。

所有内置 scheme（`local://`、`skill://`、`security://`、
`mcp://` 等）均为保留项：RPC 宿主无法注册或遮蔽它们，
请求会失败并返回 `Host URI scheme is reserved by OMP: <scheme>://`。

## 事件流模式 \{#event-stream-schema}

RPC 模式转发来自 `AgentSession.subscribe(...)` 的 `AgentSessionEvent` 对象。

常见事件类型：

- `agent_start`, `agent_end`
- `turn_start`, `turn_end`
- `message_start`, `message_update`, `message_end`
- `tool_execution_start`, `tool_execution_update`, `tool_stream_update`, `tool_execution_end`
- `auto_compaction_start`, `auto_compaction_end`, `manual_compaction_start`, `manual_compaction_end`
- `auto_retry_start`, `auto_retry_end`
- `cache_warming_start`, `cache_warming_end`
- `retry_fallback_applied`, `retry_fallback_succeeded`
- `model_changed`, `thinking_level_changed`, `config_warnings_changed`
- `advisor_cost_changed`, `advisor_yielded`
- `ttsr_triggered`（规则注入）
- `todo_reminder`, `todo_auto_clear`
- `irc_message`, `notice`, `goal_updated`
- `queue_update`

### `queue_update` 事件 \{#queue_update-event}

```json
{ "type": "queue_update", "steering": ["Use the existing parser"], "followUp": [] }
```

每当可显示的引导/后续消息队列发生变化时发出：`steer`、
`follow_up` 或排队的 `prompt` 会向其中添加内容；写入会话记录、
`remove_queued_message`、丢弃传递中排队消息的中止操作，
或会话切换会从中移除内容或清空队列。服务器会将它
与上次发送的值合并处理，不改变快照的修改
（例如从未呈现为标签的智能体旁白）不会
再次触发事件。`steering`/`followUp` 对应 `get_state` 的 `queuedMessages` 字段，
并携带消息仍待处理时 `remove_queued_message` 所接受的队列标签文本。
实时引导消息在写入会话记录之前会一直列出，
即使它们已无法移除。应根据此
事件呈现队列，而不是独立跟踪标签，并将移除回复视为
变更确认，而非独立的队列状态。

扩展运行器错误会单独发出，形式如下：

```json
{
	"type": "extension_error",
	"extensionPath": "...",
	"event": "...",
	"error": "..."
}
```

`message_update` 在 `assistantMessageEvent` 中包含流式增量（文本/思考/工具调用增量）。

`message_start`、`message_update` 和 `message_end` 携带由 RPC 模式分配的 `messageId` 字符串。一条消息从开始到每次更新直至结束都使用相同的 id；id 在进程内唯一。在流式传输期间注入的记录（顾问卡片、IRC 消息）会获得自己的 id，不会干扰其前后流式回复的 id。

`set_event_filter` 限制写出的会话事件帧：传入要转发的事件 `type` 字符串，或传入 `null` 以转发全部事件（默认值）。响应以 `{ events, messageUpdates }` 回显当前选择。过滤器适用于通过会话订阅发出的所有事件，而不只是上面列出的常见类型；所有其他出站类别（响应、`prompt_result`、`session_settled`、扩展 UI 和宿主工具/URI 请求、`extension_error`、`available_commands_update`、子代理帧、旁路问题帧、内置斜杠命令旁路通道，以及会话持久化和 `btw-history` 的 `notice` 帧）均不受此过滤器影响。对于遇到未知事件类型就采取拒绝策略的宿主，可以在此固定其理解的集合，而不必在 OMP 添加事件时失效。

可选的 `messageUpdates: "delta"` 仅将 `message_update` 帧投影为 `{ type: "message_update", messageId, message: { role }, assistantMessageEvent }`：省略 `assistantMessageEvent.partial`，保留所有其他事件字段（包括子类型、`delta` 和 `contentIndex`），并添加足够的信息供客户端重建消息。`text_start`、`thinking_start` 和 `toolcall_start` 携带 `block`：它是 `contentIndex` 处内容块的外壳，其中流式内容已清空（`text` 和 `thinking` 为 `""`，工具调用的 `arguments` 为 `{}`；保留其 `id`、`name` 和其他元数据），因此后续增量始终从空内容开始应用。服务器在处理事件时对块制作快照，而非在模型发出事件时，因此开始事件的快照可能已包含后续增量才会传送的文本；这就是清空内容的原因。`text_end` 和 `thinking_end` 保留 `content` 并添加 `block`：即去掉文本的同一个块，从而提供其签名和其他元数据（`textSignature`、`thinkingSignature` 等）；使用 `{ ...block, text: content }` 或 `{ ...block, thinking: content }` 重建该块。`image_end` 以 `content` 携带完整图像，`toolcall_end` 以 `toolCall` 携带完整工具调用；它们各自都是 `contentIndex` 处的块。`start`（轮次内重新开始流式消息）携带 `message`：用于重新开始的完整消息；该快照同样可能领先于后续增量，因此应将各块的 `*_end` 作为其最终内容的权威依据。`text_delta` 和 `thinking_delta` 携带要追加到 `contentIndex` 处块中的文本；`toolcall_delta` 携带工具调用参数 JSON 的片段，参数只有在 `toolcall_end` 的 `toolCall` 中才完整。重建涵盖消息的 `content`：`usage`、`responseId`、`stopReason` 和其他消息字段只在 `message_end` 中到达。`message_start`、`message_end` 和所有其他帧不变；`message_end` 仍携带完整消息并具有权威性：它可能与重建内容不同，例如行内编辑恢复会从文本块中提取编辑载荷文本，并在其前面合成一个 `edit` 工具调用。没有开始事件的块类型也只会在那里完整到达。宿主仍需接受大型块和完整消息的分块协议 v2 帧。消息中途切换模式不会改变其 `messageId`。投影只适用于会话自身的帧：在 `set_subagent_subscription` 级别为 `"events"` 时转发的 `subagent_event` 载荷保留完整的 `message_update` 快照。

每条命令都会替换整个过滤器状态：省略 `messageUpdates` 会将其重置为默认的 `"full"`，保留原始完整快照。无效的 `events` 形式（除 `null` 或非空字符串数组之外的任何值），或 `"full"`、`"delta"` 以外的模式，都会返回错误，且不改变任何一项设置。事件名称不会对照固定目录检查；未知的非空名称也会被接受。投影在协议 v1 和 v2 中均有效，也适用于 `events: null`。通过回显的 `data.messageUpdates` 字段检测支持情况：旧服务器会忽略此选项，也不会回显它。此可选功能仅适用于原始协议；TypeScript `RpcClient` 和 Python 客户端保留其完整消息监听器契约。

`agent_end` 具有以下会话级形式（另有可选的遥测字段）：

```ts
{
  type: "agent_end";
  messages: AgentMessage[];
  isTerminal?: boolean;
  yielded?: boolean;
  awaitingAsyncWork?: boolean;
}
```

智能体完成其轮次时，`yielded` 为 `true`：该结束是终结性的，或会话只会因排队输入或后台作业结果而恢复。当智能体继续自身工作时（重试、上下文压缩后继续、停止时提醒），它为 `false`。旧运行时的帧不包含它；只有在终结时才将这些帧视为已让出执行权。

`isTerminal: false` 表示运行仍在继续：继续执行、排队输入或
外部工作会使其恢复。`awaitingAsyncWork: true` 标识一种非终结性结束，
其唯一可能的恢复来源是外部工作：后台作业结果、
仍在运行的子代理发来的消息，或排队的对等智能体消息。每次运行都以
恰好一个终结性的 `agent_end` 结束，即使该外部工作消失而没有
使其恢复（作业被取消、子代理结束但未回信）也是如此。这些
可选字段使旧帧在缺少 `isTerminal` 时仍兼容终结行为。
使用 `yielded` 判断提示的让出执行权，使用 `session_settled` 判断静止状态。

### 进度事件 \{#progress-events}

这些事件报告宿主应作为线程通知展示的工作。RPC 模式
始终转发它们，只受 `set_event_filter` 限制。
早于 `manual_compaction_start` 和 `manual_compaction_end` 的
服务器只通过 `compact` 响应报告手动上下文压缩。

| 事件 | 时机 | 载荷 |
| --- | --- | --- |
| `manual_compaction_start` | 手动上下文压缩开始：`compact` 命令、`/compact` 或扩展的 `ctx.compact()`。当前轮次此时已中止。 | `mode?`：`/compact <mode>` 子命令 |
| `manual_compaction_end` | 该次上下文压缩结束。 | `aborted`，以及以下之一：`result`（已提交）、`skipped: true` 与 `errorMessage`（没有可压缩的内容），或 `errorMessage`（失败或取消） |
| `auto_compaction_start`, `auto_compaction_end` | 自动上下文压缩（阈值、溢出、空闲、响应不完整）开始或结束。手动上下文压缩绝不会发送这些事件。 | `reason`, `action`; `result?`, `aborted`, `willRetry`, `errorMessage?`, `skipped?` |
| `retry_fallback_applied` | 可重试失败使会话切换到 `retry.fallbackChains` 链中的下一个模型。 | `from`、`to`（模型选择器）、`role`、`reason?`（错误） |
| `retry_fallback_succeeded` | 回退模型作出回答。 | `model`, `role` |
| `ttsr_triggered` | 规则注入：TTSR 规则匹配流式输出，其文本被注入对话。 | `rules`：每个规则对象至少携带 `name`、`path` 和 `content` |
| `goal_updated` | 目标模式通过 `goal` 命令或智能体的 `goal` 工具发生变更。 | `goal`（或 `null`）、`state?` |

每次手动上下文压缩都会发送恰好一对开始/结束事件。当已配置的
方法失败并尝试下一个方法时，回退仍处于同一对事件之内。
如果 `compact` 调用在开始前被拒绝（另一项上下文压缩正在运行，或
为 `/compact <mode>` 提供了它不接受的聚焦文本），则不发送这对事件。

```json
{ "type": "manual_compaction_start" }
{ "type": "manual_compaction_end", "aborted": false, "result": { "summary": "…", "firstKeptEntryId": "…", "tokensBefore": 48210, "details": {} } }
{ "type": "manual_compaction_end", "aborted": false, "skipped": true, "errorMessage": "Already compacted" }
{ "type": "retry_fallback_applied", "from": "anthropic/claude-sonnet-4-5:high", "to": "openai/gpt-4o-mini", "role": "default", "reason": "Request failed: overloaded_error: provider returned error 503" }
{ "type": "ttsr_triggered", "rules": [{ "name": "no-forbidden", "path": "/repo/.omp/rules/no-forbidden.md", "content": "Never write the forbidden word." }] }
```

### 缓存预热事件 \{#cache-warming-events}

每次交给提供方流的刷新都会发出一个开始事件和一个对应的结束事件
（刷新中途释放会话不会发出结束事件）。
不发送刷新的决策（停止，或通过上下文压缩衔接等待）
两者都不会发出。这些是
会话事件，因此**过滤器启用时，必须在 `set_event_filter` 中列出这两种类型**，
才能观察完整的刷新生命周期：

```ts
{
  type: "cache_warming_start";
  phase: "streaming" | "idle";
  method: "prewarm" | "replay"; // max_tokens 0 pre-warm, or a one-token replay
  provider: string;
  model: string; // model id
}
{
  type: "cache_warming_end";
  phase: "streaming" | "idle"; // same phase as the matching start
  method: "prewarm" | "replay"; // same method as the matching start
  provider: string;
  model: string;
  outcome: "hit" | "miss" | "error" | "aborted";
  usage?: Usage;
  warmingStopReason?: string;
}
```

- `hit`：刷新读取了已缓存的 token，没有写入新的缓存条目。
- `miss`：未读取任何缓存 token，或写入了缓存 token；预热停止。
- `error`：没有可用响应，或响应报告错误；预热停止，但
  端点拒绝 `prewarm`（HTTP 400）时，会在同一
  时隙内紧接一对 `replay` 开始/结束事件，且该模型在会话剩余期间使用重放。
- `aborted`：刷新进行期间，运行被取消或替换。

只有当刷新被记录为 `model_usage` 条目时，才存在 `usage`
（`purpose: "cache-warm"`，或扩展强制刷新时为 `"cache-warm:extension-override"`）。
这包括付费的未命中、错误，以及提供方
已接受的 `aborted` 刷新（在取消前报告了用量）；
提供方响应前的中止不含用量。对 `usage.cost.total` 求和
是在归集已包含于 `get_session_stats` 中的预热成本，
而不是新增一笔费用。

这些事件是普通会话事件，因此 `--mode json` 的输出也
包含它们。

`warmingStopReason` 解释因刷新或在刷新期间导致预热停止的原因，
例如 `"refresh missed the cache"`、`"refresh failed"`、
`"cache warming disabled"` 或 `"conversation context changed"`。当预热
继续时，不包含此字段：刷新已重新调度，或新请求替换了
该运行。

### 可用命令 \{#available-commands}

`get_available_commands` 返回 `{ commands }`，相同数组也会在启动时
和命令元数据变更后，通过 `available_commands_update` 帧
推送。每条命令包含 `name`、`source`，以及可选的 `aliases`、
`description`、`input.hint` 和 `subcommands`。

命令发现有意采用 OMP 方言：不提供 Pi 的 `get_commands`（对
扩展 → 提示模板 → 技能的 `RpcSlashCommand[]` 投影），
因为 OMP 更丰富的目录（内置/自定义/MCP/文件命令、
更广的 `source` 枚举、不含 Pi 的 `sourceInfo`）与其传输格式不兼容。

### 与 Pi 兼容的历史/树命令，采用 OMP 原生条目载荷 \{#pi-compatible-historytree-commands-with-omp-native-entry-payloads}

下面的命令和协调语义与 Pi 兼容，但
返回的 `SessionEntry` 载荷联合类型是 OMP 原生的，传输格式与
Pi 并不相同。具体来说：Pi 的 `model_change` 携带 `provider` + `modelId`，而 OMP
携带组合后的 `model` 以及角色/回退元数据；Pi 使用 `usage`
条目，OMP 则使用 `model_usage`；OMP 还有额外的条目类型（例如
服务层级、标题、模式、凭据和重置记录）。
消费共同结构子集
（`id`/`parentId` 以及消息条目）的宽松客户端可以在两者之间共用一套持久历史
算法，而严格的 Pi `SessionEntry` 解码器不能假定
载荷相同。

`get_entries` 读取规范的追加历史（而不只是活动分支），
返回 `{ entries, leafId }`。不带 `since` 时，按追加顺序返回
全部条目；带 `since` 时，返回严格位于匹配的
持久条目 id 之后的条目。未知的 `since` 会明确失败，
返回 `code: "unknown_since"`。`get_tree` 直接从
`SessionManager` 返回原始会话树 `{ tree, leafId }`，而非 UI 投影。

`get_available_thinking_levels` 返回 `{ levels }`：当前模型可选择的
级别，`"off"` 排在首位（`set_thinking_level`
接受它，但只含思考力度的模型辅助函数不包含它）。OMP 专有的
`auto`/`inherit` 选择器有意不纳入发现结果。

生命周期仍采用 OMP：`agent_end` 携带 `isTerminal`、`yielded` 和可选的
`awaitingAsyncWork`；`prompt_result` 关联提示完成，
`session_settled` 报告静止状态。不存在 Pi 的 `agent_settled` 帧。
这些，以及 `agentInvoked`、`open_session`、`set_event_filter`、`messageId`、`ready`、
协商、分块、宿主工具和子代理，都是
Pi 系列适配器需要处理方言差异的 OMP 扩展。

### 子代理订阅 \{#subagent-subscriptions}

子代理转发默认为 `"off"`。`set_subagent_subscription` 可选择：

- `"off"`：不转发子代理帧
- `"progress"`：生命周期和进度帧
- `"events"`：生命周期、进度以及完整的子代理事件帧

`get_subagents` 返回按子代理索引和 id 排序的注册表快照。
`get_subagent_messages` 通过 `subagentId` 或已注册的
`sessionFile` 选择会话记录（`subagentId` 优先）；任意文件路径会被拒绝。
`fromByte` 支持增量读取，默认为零，并被限制为
非负整数。非有限值会失败。结果包含 `sessionFile`、
`fromByte`、`nextByte`、`reset`、原始会话记录 `entries`，以及来自
消息条目的 `messages`。只消费以换行符结尾的完整记录；下一次请求
复用 `nextByte`。会话记录缺失时返回空数组。
如果 `fromByte` 超过当前文件大小，读取会从字节零重新开始，
并报告 `reset: true`。

### 取消子代理 \{#cancelling-subagents}

`cancel_subagent` 强制终止一个当前由 `get_subagents` 列出的子代理
（前台或后台，任意嵌套深度），而不中止父级
轮次。它使用与 Agent Hub 终止操作相同的路径：中止子代理的当前轮次，
将其注册表条目变为 `aborted` 墓碑记录，因此所属的
`task` 调用会以中止结果结束。终止会停止子代理，但不会
丢弃它：之后的 `write agent://<id>` 消息或 Agent Hub 复活操作可从其会话记录
将其恢复。
当 `set_subagent_subscription` 为 `"progress"` 或 `"events"` 时，随后会发出
带有 `status: "aborted"` 的 `subagent_lifecycle` 帧。

```json
{ "id": "req_1", "type": "cancel_subagent", "subagentId": "OmpWorker" }
{ "id": "req_1", "type": "response", "command": "cancel_subagent", "success": true, "data": { "cancelled": true } }
```

当该 id 不是此会话中正在运行的子代理时，`cancelled` 为 `false`：
未知 id、其他会话的同名智能体、已完成的子代理（包括父级
已接受其结果的子代理，即使其终结生命周期
帧尚未发出），或已取消的子代理，因此宿主可将其视为幂等操作。如果
无法持久化 `aborted` 墓碑记录，子代理仍会中止并
被释放，命令则返回包含写入失败信息的错误响应。

### 引导子代理 \{#steering-subagents}

`steer_subagent` 以用户身份向正在运行的子代理发送消息，方式与
Agent Hub 聊天相同：轮次中的子代理会在下一个步骤
边界收到引导，处于轮次间隙的子代理则会启动下一轮。消息记录
在子代理自己的会话记录中，不归属于父智能体，
父级只会看到子代理最终的结果。隔离的（工作树）
子代理在进程内运行，并以相同方式接受引导。

```json
{ "id": "req_1", "type": "steer_subagent", "subagentId": "OmpWorker", "message": "Drop the glob, keep the direct path." }
{ "id": "req_1", "type": "response", "command": "steer_subagent", "success": true }
```

消息被接受后即返回响应：加入运行中轮次的队列，
或启动了子代理的新轮次。它不会等待轮次
完成。与 `prompt` 一样，该命令按队列顺序启动，但在后台等待
接受，因此后续命令（包括 `abort`）不会
被它阻塞。与 Agent Hub 聊天一样（不同于 RPC `steer`），消息经过
子代理的 `prompt()`：扩展、自定义和文件斜杠命令
会运行，提示模板会展开。

失败响应：

- 缺失/空的 `subagentId` 或空白的 `message` → 验证错误
- `get_subagents` 当前未将 `subagentId` 列为运行中（未知、
  已完成、已取消、其他会话的智能体，或父级
  已接受其结果）→ `error: "Subagent not running: <id>"`
- 子代理在接受消息之前丢弃或拒绝了它（例如
  中止或使用限额预检拒绝先发生）→
  `error: "Subagent refused the message: <reason>"`

### 旁路问题（`/btw`） \{#side-questions-btw}

`btw` 提出 TUI 的 `/btw` 旁路问题：基于
当前会话上下文（包括仍在流式传输的轮次）进行一次临时模型轮次，
以文本回答，不使用工具。问题和答案从不加入
会话记录；它们以检查点形式保存在会话的 BTW 历史附属文件中，
TUI 的 `/btw` 历史也读取该文件。使用 `recordId` 时，问题是该主题中的
后续问题，会重放其之前的轮次作为上下文。

```ts
type BtwStatus = "running" | "complete" | "cancelled" | "error" | "interrupted";
interface BtwHistoryTurn {
	question: string;
	answer: string;
	status: BtwStatus;
	createdAt: number;
	updatedAt: number;
	error?: string;
}
interface BtwHistoryRecord extends BtwHistoryTurn {
	id: string;
	leafId: string | null;
	followUps?: BtwHistoryTurn[];
}
```

记录的最新轮次是它最后一次后续提问，否则为记录本身。
`interrupted` 标记运行过程中进程终止的轮次。

```json
{ "id": "req_1", "type": "btw", "question": "why does this test need a lock?" }
{ "type": "btw_record", "record": { "id": "1596…", "question": "why does this test need a lock?", "answer": "", "status": "running", "leafId": "a1b2c3d4", … } }
{ "id": "req_1", "type": "response", "command": "btw", "success": true, "data": { "record": { … } } }
{ "type": "btw_delta", "recordId": "1596…", "delta": "Two workers " }
{ "type": "btw_record", "record": { "id": "1596…", "answer": "Two workers …", "status": "complete", … } }
```

问题以运行中状态写入检查点后，先到达该启动轮次的 `btw_record` 帧，
再到达响应；轮次只会在此之后启动，因此
每个 `btw_delta` 和后续 `btw_record` 都在响应之后。`btw_record`
帧在每次生命周期变化（启动、完成、
取消、错误）时携带完整记录；同一 id 以最后一个为准。旁路问题与
主智能体并行运行：既不等待，也不阻塞正在运行的提示。

每个会话同时运行一个旁路问题。`btw_cancel` 绕过
命令队列，取消正在运行的问题，或仍在启动的 `btw`
（后者随后失败）；若给出主题 `recordId`，则只在匹配时取消。如果没有匹配的运行中问题，
它返回 `cancelled: false`，这也包括仍排在其他命令之后的
`btw`。`new_session`、`switch_session`、
`branch`、`fork`、`open_session`、扩展发起的会话变更以及关闭
都会先取消运行中的问题并等待其检查点完成，即使
随后变更被否决也是如此。

`get_btw_history` 按从新到旧的顺序列出当前会话记录；运行中的
记录携带部分答案，因此重新连接的宿主可以重建其
视图。没有问题运行时，它会从磁盘重新读取历史，因此 TUI
添加的主题也会列出，并可接受后续提问；其他进程仍在
回答的主题会被读取为 `interrupted`。列表不分页：超过
传输限制的历史会像任何超大响应一样失败（协议 v2 会对其分块）。

`btw` 的失败响应：

- `question` 为空白
- 另一个旁路问题仍在运行或启动中
- `recordId` 未知
- 没有活动模型
- 无法保存历史（包括主题仍被其他进程占用）
- 启动前被 `btw_cancel` 或会话变更取消

响应之后检查点写入失败，会通过
`{ type: "notice", level: "error", source: "btw-history", message }` 帧报告。
答案保留在内存中：下一次 `btw` 和每次会话变更都会先重试
保存；只要仍无法保存，它们就会以
`/btw history could not be saved: …` 失败，且会话保持原状。
关闭时，进程仍会退出，并通过另一条此类通知报告丢失。
如果重试发现主题已在磁盘上被删除或改写（例如被
其他进程修改），则永远无法成功：答案会通过另一条
此类通知报告为丢失并被丢弃，随后继续执行 `btw` 或会话变更。

## 提示/队列的并发与顺序 \{#promptqueue-concurrency-and-ordering}

普通命令在串行队列上运行。扩展 UI 响应和宿主
工具/URI 更新/结果绕过该队列，因此能在
命令处理器等待期间完成请求。`bash` 也绕过串行队列，
并作为后台命令工作跟踪；其响应可能乱序到达。
`prompt` 和 `steer_subagent` 按队列顺序启动，但在后台等待准入，
因此它们的响应也可能在后续命令的响应之后到达。

### 立即确认与完成 \{#immediate-ack-vs-completion}

普通 `prompt` 请求**无需等待智能体运行便会得到确认**；
`abort_and_prompt` 则先等待中止。内置斜杠命令处理器和
技能文件加载可能延迟确认：

```json
{ "id": "req_1", "type": "response", "command": "prompt", "success": true }
```

这意味着：

- 命令接受 != 运行完成
- 提示通过其响应上的 `data.agentInvoked: false` 或自身的 `prompt_result` 完成
- 运行在 `isTerminal !== false` 的 `agent_end` 帧上完成；该帧不携带提示身份，因此应通过 `prompt_result` 关联提示
- 原生 `input` 处理器按提交顺序运行一次，发生在命令、技能或队列分发之前。后续输入会等待先前提交获准进入，包括空闲技能的视觉描述，但不等待其模型轮次。`abort` 会取消在它之前收到且尚未获准进入的输入，即使该输入仍处于钩子中。成功的 `new_session`、`switch_session`、`branch`、`fork` 或 `open_session` 会对它之前收到的输入执行相同操作；被否决的变更不取消任何内容，会话变更之后发送的输入在新会话中运行。
- 会话只有在 `session_settled` 时才算结束：智能体让出执行权后，后台作业仍可唤醒它

### 流式传输期间 \{#while-streaming}

活动流式传输期间，`AgentSession.prompt()` 要求提供 `streamingBehavior`：

- `"steer"` => 排队的引导消息（中断路径）
- `"followUp"` => 排队的后续消息（轮次结束后路径）

流式传输期间若省略此项，提示会失败。

支持实时引导的提供方可能在流式响应期间
消费排队引导；否则会在轮次/工具批次边界投递。
`follow_up` 会等待智能体原本即将停止时再投递。

### 队列默认值 \{#queue-defaults}

来自 `packages/coding-agent/src/modes/settings.ts`（也是核心 `Agent` 的默认值）：

- `steeringMode`：`"one-at-a-time"`
- `followUpMode`：`"one-at-a-time"`
- `interruptMode`：`"immediate"`

CLI 设置可以改变这些初始值。`set_steering_mode`、
`set_follow_up_mode` 和 `set_interrupt_mode` 只影响调用它们的会话，
不写入全局 `config.yml`。`set_auto_compaction` 和
`set_auto_retry` 同样使用会话范围的设置覆盖。

### 模式语义 \{#mode-semantics}

- `set_steering_mode` / `set_follow_up_mode`
   - `"one-at-a-time"`：每次排空队列时取出一个投递组，将隐藏的伴随内容与其用户消息保持在一起
   - `"all"`：一次取出整个队列
- `set_interrupt_mode`
   - `"immediate"`：排队引导向前台工具发出协作式信号，使可自动转入后台的工作让位；不会强制终止或跳过不可中断工具
   - `"wait"`：不发出该协作式引导信号，让有副作用的工作先完成，再在工具批次边界注入引导
   - 两种模式下，引导到达时都会取消或跳过可中断等待。此设置不等同于 `abort`。

## 扩展 UI 子协议 \{#extension-ui-sub-protocol}

RPC 模式下的扩展使用请求/响应 UI 帧。`--no-ui` 在两种 RPC 模式下都会禁用扩展运行器的 UI：扩展看到 `ctx.hasUI === false`，对话框直接解析为默认值而不发出帧，呈现更新（`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`）则被丢弃。

`--mode rpc-ui` 独立启用工具 UI 上下文，包括与 `--no-ui` 同时使用时：

- `ask` 工具发送一条携带完整 HTML 表单的 `form` 请求，不需要启用命令。宿主必须呈现表单并回复提交的 `data` 或取消；该工具在 RPC 上不再通过 `select`、`input` 或 `editor` 逐字段处理。扩展的 `ui.formDialog` 调用在两种 RPC 模式下都发送相同的 `form` 请求。
- 使用工具 UI 上下文的其他调用方保留其支持的对话框方法（`select`、`confirm`、`input`、`editor` 和取消）及呈现方法（`notify`、`setStatus`、字符串数组 `setWidget`、`set_editor_text` 和选择启用的 `setTitle`）。`--no-ui` 不是这些方法的传输层过滤器。
- 工具审批提示使用扩展运行器，而非工具 UI 上下文。在 `--no-ui` 下，需要审批的工具会以无交互 UI 错误采取拒绝策略，而不是发送审批对话框，与 `--mode rpc --no-ui` 相同。
- 两种模式都不会为 MCP 身份验证质询增加 RPC UI 处理器；不会安装交互模式的 MCP 身份验证处理器。
- 宿主发出的 `login` 独立于这两项 UI 设置：它可以在授权 URL 之后发出 `open_url`、进度 `notify` 和非秘密的 `input` 请求。标记为 `secret: true` 的提供方登录提示，以及授权 URL 之前的提示，仍不受支持。

没有工具 UI 界面的宿主使用 `--mode rpc --no-ui`；要回答工具对话框同时保持扩展无界面，则使用 `--mode rpc-ui --no-ui`。单独使用 `--mode rpc-ui` 会同时启用扩展 UI 和工具 UI。

### 出站请求 \{#outbound-request}

`RpcExtensionUIRequest`（`type: "extension_ui_request"`）的方法：

- `select`, `confirm`, `input`, `editor`, `ask`, `form`, `cancel`
   - `select` 将标签保留在 `options: string[]` 中；任何选项包含
     描述时，还会发出按位置对齐的
     `optionDetails: Array<{ description?: string }>` 数组。不呈现
     描述的宿主可继续单独使用 `options`。
     调用方提供相应值时，它还携带 `initialIndex?: number`
     （首先聚焦的选项）、`selectionMarker?: "radio" | "checkbox"`、
     `checkedIndices?: number[]`（复选框列表中当前选中的
     选项）和 `markableCount?: number`（前面带标记的选项数量；
     后面的选项是操作；设置 `selectionMarker` 时，若省略此项，则表示
     所有选项）。`checkedIndices` 是选中状态的权威依据。
   - `input` 携带 `title: string` 和可选的 `placeholder?: string`、
     `timeout?: number` 及 `secret?: boolean`。`secret` 是来自
     `ExtensionUIDialogOptions.secret`、未经协商的宿主提示；支持
     掩码输入的宿主应在 `secret: true` 时隐藏键入的字符。
   - `ask` 只有在 `set_ask_dialog` 启用后才会发出。它携带一次
     扩展 `ui.askDialog` 调用的所有问题（`ask` 工具则发送 `form` 请求）：
     `questions: Array<{ id: string, question: string, header?: string, options: Array<{ label: string, description?: string, preview?: string }>, multi?: boolean, recommended?: number }>`
     以及 `timeout?: number`。`options` 从不包含“其他”条目；宿主
     始终提供自由文本输入。
   - `form` 不需要选择启用。它以 `html: string` 携带一次 `ui.formDialog` 调用的 HTML `<form>`，以及 `timeout?: number`。宿主整体呈现表单；包含两个或更多选项的单选和复选组会提供自由文本的“其他”答案，除非组内已有标签为 `Other` 的选项。宿主必须使用提交的 `data` 或 `{ cancelled: true }` 回答每条 `form` 请求；没有表单渲染器的宿主必须取消。未回答的 `form` 可能无限期阻塞 `ask` 调用，因为计划模式会禁用 ask 超时。
- `notify`, `setStatus`, `setWidget`, `setTitle`, `set_editor_text`
- `open_url`（由 RPC 登录流程发出）：包含 `url`、可选的 `launchUrl` 和可选的 `instructions`。存在时，`launchUrl` 是一个简短的环回重定向地址，是推荐的复制目标，以免终端截断破坏 OAuth 查询参数。

运行时说明：

- RPC 模式禁用自动会话标题生成，且默认也会抑制 `setTitle` UI
  请求，因为大多数宿主没有适合的
  终端标题界面。设置 `PI_RPC_EMIT_TITLE=1` 可仅重新启用
  该 UI 事件。

示例：

```json
{
	"type": "extension_ui_request",
	"id": "123",
	"method": "confirm",
	"title": "Confirm",
	"message": "Continue?",
	"timeout": 30000
}
```

### 入站响应 \{#inbound-response}

`RpcExtensionUIResponse`（`type: "extension_ui_response"`）：

- `{ type: "extension_ui_response", id: string, value: string }`
- `{ type: "extension_ui_response", id: string, confirmed: boolean }`
- `{ type: "extension_ui_response", id: string, cancelled: true, timedOut?: boolean }`
- `{ type: "extension_ui_response", id: string, answers: Array<{ id: string, selectedOptions: string[], customInput?: string }> }`（回答 `ask` 请求）
- `{ type: "extension_ui_response", id: string, data: Record<string, string | number | string[]> }`（回答 `form` 请求）

取消、超时或信号中止时，`select` 和 `input` 解析为 `undefined`，
`confirm` 解析为 `false`。信号中止会发出带有
`targetId` 的 `cancel` 请求。`editor` 支持取消和信号中止，但没有传输层超时。
呈现方法和 `open_url` 发送后即不再等待，不需要响应。

如果对话框设置了超时，RPC 模式会在超时/中止触发时解析为默认值，并发出
`{ method: "cancel", targetId }`，让宿主关闭对话框；之后到达的答案会被忽略。对于 `ask`，超时
（omp 的计时器，或宿主的 `cancelled: true, timedOut: true` 回复）会用每个问题的推荐
选项作答，没有推荐项则使用第一个选项。

`answers` 必须按请求顺序为每个问题列出一个条目，各 `id` 与对应问题的 `id` 相同。
`selectedOptions` 保存精确的选项标签，不得重复；多选可以为空。单选
（`multi` 缺失或为 false）最多接受一个选项，且不能同时包含选项和 `customInput`。`customInput`
会去除首尾空白，为空时被忽略。任何其他形式都会使 `ask` 工具调用失败，而不是猜测。

`data` 按控件 `name` 保存提交值，与 HTML 表单的提交方式相同。单选组、单个
`<select>` 或独立复选框提供一个选项的 `value`（未选择时省略）；包含两个或更多选项的复选组或
多选提供不重复的选项值数组（省略时为空），而只有一个
选项的情况则像独立复选框一样提供该值；文本字段提供文本，或在
`number`/`range` 输入时提供数字（缺失的文本字段视为空）。包含两个或更多选项的单选或复选组，
除非已存在标签为 `Other` 的选项，否则会接受一个不属于选项值的额外字符串作为其“其他”
答案。隐藏输入保留表单自身的值。
未知名称、禁用选项、错误类型，以及违反 `required`、`min`/`max`、
`minlength`/`maxlength`、`email`/`url` 或 `pattern` 的答案，都会使 `ask` 工具调用失败，而不是猜测。`form` 超时
（omp 的计时器，或宿主的 `cancelled: true, timedOut: true` 回复）会提交表单默认值。若表单帧
超过传输限制（协议 v1 为 1 MiB，通过 `negotiate_protocol` 协商为 v2 后为 64 MiB），则 `ask` 工具
调用会失败且不发送，而不是让宿主收到截断内容。

有效的选项答案，包括获准的“其他”答案，优先于同名隐藏值。其他情况下无效、但与该隐藏值完全匹配的选项值，视为未选择；它不能满足必填字段。在复选组或多选的数组内，若没有选项携带该值，或保留该值会使数组无效，则会删除一个等于隐藏值的条目，将其视为隐藏输入的回显（如浏览器表单数据的发送方式）。

共享 `name` 的字段共用它的一个条目。形式适合该条目的每个字段都会采用它；无法承载该条目的同名字段（单选组旁的复选组、不含“其他”的组旁的文本输入）视为未作答，仍须通过自身约束。若同名字段中没有任何字段能够承载该条目，则调用失败。

无效的 `data` 回复会使整个 `ask` 调用失败，不提供修正字段的轮次，因此宿主必须在发送前执行表单约束：`required`（仅含空白的文本答案视为空）、`min`/`max`、`minlength`/`maxlength`、`email`、`url` 和 `pattern`（匹配整个值；无效模式会被忽略）。

```json
{
	"type": "extension_ui_request",
	"id": "ui_9",
	"method": "ask",
	"questions": [
		{
			"id": "db",
			"question": "Which database?",
			"options": [{ "label": "Postgres" }, { "label": "SQLite" }],
			"recommended": 1
		},
		{
			"id": "features",
			"question": "Which features?",
			"options": [{ "label": "Auth" }, { "label": "Billing" }, { "label": "Search" }],
			"multi": true
		}
	]
}
```

```json
{
	"type": "extension_ui_response",
	"id": "ui_9",
	"answers": [
		{ "id": "db", "selectedOptions": [], "customInput": "DuckDB" },
		{ "id": "features", "selectedOptions": ["Auth", "Search"] }
	]
}
```

不支持仅面向终端的 UI 功能：组件工厂、自定义
页眉/页脚/编辑器、原始终端输入、自动补全组合、主题
切换和工具展开。`getEditorText()` 返回 `""`；
`pasteToEditor()` 回退为 `set_editor_text`。

## 宿主工具子协议 \{#host-tool-sub-protocol}

RPC 宿主可以发送 `set_host_tools`，向智能体公开自定义工具，随后
通过同一传输通道处理执行请求。

### 出站请求 \{#outbound-request-1}

智能体希望宿主执行其中一个工具时，RPC 模式会发出：

```json
{
	"type": "host_tool_call",
	"id": "host_1",
	"toolCallId": "toolu_123",
	"toolName": "echo_host",
	"arguments": { "message": "hello" }
}
```

如果之后中止了工具执行，RPC 模式会发出：

```json
{
	"type": "host_tool_cancel",
	"id": "host_cancel_1",
	"targetId": "host_1"
}
```

### 入站更新与完成 \{#inbound-updates-and-completion}

宿主可选择流式发送进度：

```json
{
	"type": "host_tool_update",
	"id": "host_1",
	"partialResult": {
		"content": [{ "type": "text", "text": "working" }]
	}
}
```

完成时使用：

```json
{
	"type": "host_tool_result",
	"id": "host_1",
	"result": {
		"content": [{ "type": "text", "text": "done" }]
	}
}
```

在 `host_tool_result` 上设置顶层 `isError: true`，可拒绝待处理的宿主工具调用，并将返回的文本内容作为工具错误呈现。

## 实时语音子协议 \{#live-voice-sub-protocol}

RPC 宿主可以运行一个绑定到 RPC 会话的 GPT 实时语音会话
（终端 `/live` 背后的实时功能）。实时模型通过
机器的麦克风和扬声器与用户交谈，并将工作委派给
RPC 会话，作为普通轮次执行，因此受委派的工作使用会话的模型
及通过 `set_host_tools` 注册的任何宿主工具运行。每台 RPC 服务器最多
运行一个实时会话。

### 命令 \{#commands}

- `{ id?, type: "live_start", voice?: string, instructions?: string }` → `data: { voice: string }`
- `{ id?, type: "live_connect", sdpOffer: string, voice?: string, instructions?: string }` → `data: { voice: string, sdpAnswer: string }`
- `{ id?, type: "live_stop" }`
- `{ id?, type: "live_mute", muted?: boolean }` → `data: { muted: boolean }`

`live_start` 在会话连接成功并开始录音后响应，因此它
像 `bash` 一样并发分发；此期间发送的 `live_stop` 会取消
连接，待处理的 `live_start` 随后失败。`voice` 默认为
`live.voice` 设置，响应报告实际使用的声音。`instructions`
替换内置实时提示；它作为 Handlebars 模板渲染，使用
本地操作系统账户的 `{{username}}` 和 `{{firstName}}`。当会话
正在连接、活动或关闭中，或听写处于活动状态时，启动会失败。

`live_connect` 启动相同的会话，但音频使用客户端自身的
WebRTC 对等端，而非宿主的麦克风和扬声器。`sdpOffer` 是该
对等端的 offer：一条 sendrecv Opus 音轨加一个 `oai-events` 数据通道。
立即将返回的 `sdpAnswer` 应用于该对等端；当通话
信令完成且控制套接字打开时，响应才会返回。缺失或空的
`sdpOffer` 会失败，且不会启动任何内容。对等端负责回声消除
和静音：`live_mute` 只会将阶段切换为 `muted`，因此在该阶段
持续期间，应将对等端的麦克风音轨静音。对于这些会话，服务器不发送 `live_levels`，
也不发送 `speaking` 阶段。`voice`、`instructions`、`live_stop` 和
帧的行为与 `live_start` 相同。服务器无法看到客户端的对等端，因此
当该对等端断开连接时（`connectionstatechange` 变为 `failed`
或 `closed`），应发送 `live_stop`；否则会话会保持打开。

`live_stop` 在会话停止后响应，没有活动会话时也会
成功。`live_mute` 设置麦克风静音，省略 `muted` 时则
切换静音状态；没有活动会话时会失败。

```json
{ "id": "l1", "type": "live_start", "instructions": "You are Carly. Greet {{firstName}}." }
{ "id": "l1", "type": "response", "command": "live_start", "success": true, "data": { "voice": "sol" } }
```

### 帧 \{#frames}

实时帧不是会话事件：`set_event_filter` 从不会丢弃它们。

- `{ type: "live_phase", phase }` 在每次阶段变更时发送；`phase` 为 `connecting`、`listening`、`working`、`speaking`、`muted`、`error` 之一。
- `{ type: "live_levels", input: number, output: number }`：麦克风和扬声器的 RMS，范围为 `[0, 1]`，每 100 ms 最多一帧。中间值会被丢弃；最新值始终会送达。不为 `live_connect` 会话发送。
- `{ type: "live_transcript", role: "user" | "assistant", turn: number, text: string, final: boolean }`：一个轮次的累积文本；同一 `role` 和 `turn` 的后续帧替换早先帧，直至 `final: true`。
- `{ type: "live_end", error?: string }`：每个会话结束时恰好发送一次，若因失败而结束则携带失败信息（包括失败的 `live_start` 或 `live_connect`）。

关闭 stdin 或调用 `pi.shutdown()`，会在
进程退出前停止活动的实时会话。

### 自定义实时端点 \{#custom-live-endpoint}

实时会话使用会话的 ChatGPT（Codex）登录状态与 Codex 进行信令交互。将
`live.endpoint` 设置为服务器基础 URL（例如 `http://127.0.0.1:8080/v1`），
可改为在该服务器上运行每个实时会话（`/live`、`live_start`、`live_connect`、扩展
`startLive`）；不需要 Codex 登录，离线模式
（`models.offline`）也允许使用。为空则使用 Codex。服务器相对于基础地址实现公开的
OpenAI Realtime WebRTC API：

1. `POST {base}/realtime/calls`，请求体为 SDP offer
   （`Content-Type: application/sdp`）；响应体是 SDP answer，
   其 `Location` 标头指明通话地址，最后一个路径段为通话 ID
   （`/v1/realtime/calls/rtc_123` → `rtc_123`）。只跟随指向同源的 307/308
   重定向。
2. 位于 `{base}/realtime?call_id=<id>` 的 WebSocket（`http` → `ws`、`https` → `wss`；
   保留基础地址末尾的斜杠及其查询参数）。omp 在此发送的第一条消息是
   `{ "type": "session.update", "session": { "type": "realtime", "instructions", "audio": { "output": { "voice" } }, "delegation": { "type": "client" } } }`；
   由服务器选择模型。随后会话运行与 Codex 相同的事件：
   服务器发送 `session.started`/`session.updated`、`input_transcript.added`、
   `output_transcript.added`、`turn.done`、`delegation.created` 和 `error`，
   omp 发送 `delegation.context.append`、`session.context.append` 和 `session.close`。

设置 `live.apiKey` 后，它会在这两个
请求上以 `Authorization: Bearer <key>` 发送，且只发送到此端点；Codex 凭据和证明信息绝不会
发送到那里。与 `models.yml` 中的提供方 API 密钥一样，它可以是字面值、
环境变量名，或输出为密钥的 `!command`。`live.voice`
原样传递，因此应将其设为服务器接受的声音。

## 听写子协议 \{#dictation-sub-protocol}

仅写入草稿的听写通过机器的麦克风采集，使用会话所
配置的 `modelRoles.dictation` 语音转文本引擎和 `stt.language`。
它要求 `stt.enabled: true`；禁用时，启动会在打开
麦克风或初始化语音模型之前失败。它不提交提示，
不解释语音提交触发词，也不播放音频。
实时语音和听写互斥，包括任一功能正在启动
或停止时。

- `{ id?, type: "dictation_start", captureId: string }` 开始采集，并在录音开始时响应。`captureId` 要求为非空白字符串，最多 128 个 UTF-16 代码单元；宿主必须为每次采集选择唯一 ID。
- `{ id?, type: "dictation_stop" }` 停止麦克风并完成转写刷新，随后以 `data: { text: string }` 响应。没有采集时会成功返回空文本。失败时返回错误响应。

随附客户端为这两条听写命令都允许 600 秒：启动可能需要下载并加载尚未就绪的语音模型，停止可能需要完成较慢的本地或云端转写刷新。TypeScript 的 `RpcClient.dictationStart(captureId, timeoutMs)` 和 `RpcClient.dictationStop(timeoutMs)` 接受调用方选定的毫秒超时。客户端超时只会停止等待，不会取消服务器操作。发送 `dictation_stop`（或调用 `dictationStop()`）以取消待处理的启动或停止活动采集，并保持 `dictation_end` 订阅处于活动状态，以接收请求截止时间之后到达的刷新结果。

启动待处理时也可发送停止：它会取消启动，等待
麦克风关闭，并使待处理的启动失败。终结帧
可能先于任一响应到达，因此应在启动前订阅，并通过
`captureId` 而非响应顺序进行关联。

这些主动发送的帧绕过 `set_event_filter`：

- `{ type: "dictation_state", captureId, state: "starting" | "recording" | "transcribing" }`
- `{ type: "dictation_transcript", captureId, text }`：完整的累积预览；替换该次采集的先前预览，而不是追加。
- `{ type: "dictation_end", captureId, text, error? }`：每次已启动的采集恰好有一个终结帧，包含累积结果及可选错误。停止结果和终结帧描述相同文本；只将它插入发起采集的草稿一次。

会话变更会在切换前停止并完成听写刷新，包括
扩展发起的变更。转写失败会在
终结帧中报告，但在采集资源释放后，不会否决会话变更。
发生 stdin EOF、RPC 输出失败或进程关闭时，活动采集
会被释放，麦克风会关闭，不等待转写完成。

## 宿主 URI 子协议 \{#host-uri-sub-protocol}

RPC 宿主也可以持有自定义 URL scheme（虚拟文件）。执行
`set_host_uri_schemes` 后，每次读取 `<scheme>://…` 和写入
`<scheme>://…`（注册为 `writable` 时），都会通过
同一传输通道转回宿主。

### 出站请求 \{#outbound-request-2}

会话工具解析宿主持有的 URL 时，RPC 模式会发出：

```json
{
	"type": "host_uri_request",
	"id": "uri_1",
	"operation": "read",
	"url": "db://users/42"
}
```

写入形式相同，但使用 `"operation": "write"`，并额外携带
`"content": "..."` 字段，包含完整替换文本。

如果请求之后被中止（调用方取消、会话结束），RPC 模式
会发出：

```json
{
	"type": "host_uri_cancel",
	"id": "uri_cancel_1",
	"targetId": "uri_1"
}
```

### 入站结果 \{#inbound-result}

读取成功时：

```json
{
	"type": "host_uri_result",
	"id": "uri_1",
	"content": "id=42\nname=Alice\n",
	"contentType": "text/plain",
	"notes": ["fresh from cache"],
	"immutable": false
}
```

写入成功时，省略内容：

```json
{ "type": "host_uri_result", "id": "uri_1" }
```

要拒绝请求，设置 `isError: true`，并在 `error` 中
填入消息，或回退使用 `content` 来呈现文本错误：

```json
{
	"type": "host_uri_result",
	"id": "uri_1",
	"isError": true,
	"error": "row 42 not found"
}
```

### 约束 \{#constraints}

- 智能体的 `edit` 工具不以宿主 URI 为目标。希望
  修改虚拟文件的宿主应公开 `write`，让模型使用 `write` 工具
  传入替换内容。
- scheme 在进程内全局生效；`set_host_uri_schemes` 替换
  先前集合，并取消注册新列表中未包含的所有项。
- scheme 在注册前会规范化为小写。
- 读取成功时发送 `content`；当前桥接实现将省略的
  值视为空字符串。`contentType` 默认为 `text/plain`，其
  声明值为 `"text/plain"`、`"text/markdown"` 或 `"application/json"`。
  结果级别的 `immutable` 会为该次读取覆盖已注册 scheme 的值。

## 错误模型与可恢复性 \{#error-model-and-recoverability}

### 命令级失败 \{#command-level-failures}

失败响应为 `success: false`，并带有字符串 `error`。

```json
{
	"id": "req_2",
	"type": "response",
	"command": "set_model",
	"success": false,
	"error": "Model not found: provider/model"
}
```

### 可恢复性预期 \{#recoverability-expectations}

- 大多数命令失败可恢复；进程继续存活。
- 格式错误的 JSONL / 解析循环异常会发出 `parse` 错误响应，并继续读取后续行。
- 空的 `set_session_name` 会被拒绝（`Session name cannot be empty`）。
- 扩展 UI 响应以及有效的宿主工具/宿主 URI 更新/结果，如果携带未知的 `id`，都会被忽略。这些旁路通道帧不会收到命令响应帧。
- 正常终止发生在 stdin 关闭或扩展触发关闭时。输出/暂存失败和未恢复的会话持久化失败是致命错误。
- 启动恢复时，若无法还原保存的模型，会在 `ready` 之前发生致命错误；其 `notice` 帧具有 `source: "session-model-restore"`（参见[启动](#startup)）。
- 会话持久化错误会发出不经过滤的 `{ type: "notice", level: "error", message, source: "session-persistence" }` 帧，并向 stderr 输出镜像信息。已恢复的失败仍可正常关闭；释放时仍处于锁存状态的失败，会在排空 stdout 后以代码 `1` 退出。

## 简明命令流程 \{#compact-command-flows}

### 1) 提示与流式输出 \{#1-prompt-and-stream}

stdin：

```json
{ "id": "req_1", "type": "prompt", "message": "Summarize this repo" }
```

stdout 序列（简化版；省略消息内容）：

```json
{ "id": "req_1", "type": "response", "command": "prompt", "success": true }
{ "type": "agent_start" }
{ "type": "message_update", "messageId": "msg-2", "assistantMessageEvent": { "type": "text_delta", "delta": "..." }, "message": { "role": "assistant", "content": [] } }
{ "type": "agent_end", "messages": [], "isTerminal": true, "yielded": true }
{ "type": "prompt_result", "id": "req_1", "agentInvoked": true, "status": "completed", "sessionSettled": true }
{ "type": "session_settled" }
```

### 2) 流式传输期间使用显式队列策略提交提示 \{#2-prompt-during-streaming-with-explicit-queue-policy}

stdin：

```json
{
	"id": "req_2",
	"type": "prompt",
	"message": "Also include risks",
	"streamingBehavior": "followUp"
}
```

### 3) 检查并调整队列行为 \{#3-inspect-and-tune-queue-behavior}

stdin：

```json
{ "id": "q1", "type": "get_state" }
{ "id": "q2", "type": "set_steering_mode", "mode": "all" }
{ "id": "q3", "type": "set_interrupt_mode", "mode": "wait" }
```

### 4) 扩展 UI 往返交互 \{#4-extension-ui-round-trip}

stdout：

```json
{
	"type": "extension_ui_request",
	"id": "ui_7",
	"method": "input",
	"title": "Branch name",
	"placeholder": "feature/...",
	"secret": false
}
```

stdin：

```json
{ "type": "extension_ui_response", "id": "ui_7", "value": "feature/rpc-host" }
```

## 客户端库 \{#client-libraries}

### 传输模式与生成的客户端 \{#wire-schema-and-generated-clients}

`packages/coding-agent/src/modes/rpc/wire` 以 omptype 模式描述每条命令（参数、
成功时的 `data`、可空性、超时）、每个主动发送的帧以及每种共享
类型。`bun run gen:rpc` 生成：

- `rpc-wire.schema.json`：JSON Schema 2020-12 包，附带 `x-rpc` 节：
  命令表、stdout 帧联合类型（`serverFrame`：响应、宿主
  请求、通知）、通知和会话事件联合类型，以及
  宿主到服务器帧联合类型（`inbound`）。它是供
  客户端生成器使用的语言无关输入，采用以下解码规则：
   - 标有 `"x-open": true` 的对象是开放记录（消息、内容、用量、
     助手流式事件）：解码器检查 `role`/`type` 判别字段，
     并保留每个键，因此缺少较新字段的持久化消息仍可解码；
   - 属性的 `default` 是旧服务器
     省略该字段时解码器代入的值；
   - 字符串枚举是封闭的：未知值会使帧解码失败，客户端随后
     将其呈现为未知通知，而不是停止；
   - 属性上的 `x-unknown-fallback`（子代理转发的事件）会将
     无法解码的值降级为未知通知，而不会使其
     所在帧失败；`x-scalar-or-array` 标记旧服务器以裸
     标量发送的数组。
- `rpc-wire.generated.ts`：TypeScript 传输类型。
- `sdk/python/omp-rpc/src/omp_rpc/_wire.py`：`omp-rpc` 包的 Python 类型、解码器、命令方法
  和帧监听器。
- `sdk/rust/omp-rpc/src/wire.rs`：Rust serde 类型、帧解码器，以及
  每条命令各有一个参数结构体实现的 `Command` 特征（crate 为 `omp-rpc`）。
- `sdk/go/omp-rpc/wire.go`：Go 类型、帧解码器，以及每条
  命令对应的一个 `Commands` 方法（模块为 `github.com/can1357/oh-my-pi/sdk/go/omp-rpc`）。

Rust 和 Go 包在生成类型之上附带手写的
进程传输层：它们协商 v2 并重组分块、分页读取消息历史、
等待提示的 `prompt_result`（`prompt_and_wait` / `PromptAndWait`），并提供
宿主持有的工具和 URI scheme 服务。各自的 README 介绍了这些 API。

当已提交的输出过时时，`packages/coding-agent/test/rpc-wire` 会失败，
并会对照 `rpc-types.ts` 及其背后的内部类型，检查生成的 TypeScript 类型：
服务器新增命令、命令参数、事件、事件字段或枚举值，
都会使 `bun check` 失败，直到模式覆盖该变更。

### TypeScript 辅助封装 \{#typescript-helper}

`packages/coding-agent/src/modes/rpc/rpc-client.ts` 是便利封装，而非协议定义。

当前辅助封装的特征：

- 默认生成 `bun <cliPath> --mode rpc` 子进程（`cliPath` 默认为 `dist/cli.js`）。`command` argv 前缀会接收生成的智能体参数；命令构建器返回完整 argv。自定义 `spawn` 传输优先。
- 通过生成的 `req_<n>` id 关联响应，协商 v2，重组分块，并分页读取消息历史
- 通过 `onEvent()` 分发已识别的核心 `AgentEvent` 类型，通过 `onSessionEvent()` 分发已识别的会话事件；原始服务器流可包含其他事件类型
- 公开 `onPromptResult()`、`onSessionSettled()`、命令可用性及子代理监听器，以及扩展 UI 请求
- 通过 `setCustomTools()` 和对 `host_tool_call` / `host_tool_cancel` 的自动处理，支持宿主持有的自定义工具
- 使用 `liveStart()`、`liveStop()`、`liveMute()` 驱动实时语音会话，并通过 `onLive()` 投递实时帧
- 使用 `dictationStart(captureId)`、`dictationStop()` 和 `onDictation()` 驱动仅写入草稿的语音输入
- `promptAndWait()` 等待该提示的结果（或同步本地完成）；`waitForSettled()` 还会等待会话静止。`waitForIdle()` 和 `collectEvents()` 在下一个 `agent_end` 处停止，包括非终结性的结束，它们不是会话稳定屏障。
- 封装常用协议命令，包括 OAuth 的 `getLoginProviders()` / `login(...)` 和 `getLogoutAccounts(...)` / `logout(...)`；对于宿主 URI 注册或仅增量消息更新等未封装功能，使用原始协议帧。

### Python 包 \{#python-package}

随附的 [`omp-rpc`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/sdk/python/omp-rpc/pyproject.toml) 发行包提供基于进程的 Python 客户端。其导入包为 `omp_rpc`；包 API、带类型的命令与事件、宿主工具/宿主 URI 辅助函数及编排示例维护在 [`omp-rpc` README](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/sdk/python/omp-rpc/README.md) 中。

```python
from omp_rpc import RpcClient

with RpcClient(provider="anthropic", model="claude-sonnet-4-5") as client:
    state = client.get_state()
    turn = client.prompt_and_wait("Reply with just the word hello")
    print(turn.require_assistant_text())
```

默认情况下，`RpcClient` 启动 `omp --mode rpc`；传入 `command=[...]` 可精确控制子进程命令。它处理请求关联、带类型的通知、v2 协商和分块重组、消息分页、扩展 UI（包括选择启用的 `ask` 对话框），以及宿主持有的工具和 URI scheme。其命令方法和 `on_<frame type>` 监听器由传输模式生成，因此封装了上面的每条命令；`messageUpdates: "delta"` 投影仍只适用于原始协议。Python 包负责该客户端 API 和进程生命周期；本文档和 `rpc-types.ts` 仍是规范的传输契约。当客户端库未封装所需功能时，使用原始协议帧。
