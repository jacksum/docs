---
title: "RPC 协议参考"
description: "Oh My Pi v19.1.1 仓库文档：RPC 协议参考。"
---

# RPC 协议参考 \{#rpc-protocol-reference}

RPC 模式通过标准输入输出，以换行符分隔的 JSON 协议运行编码智能体。

- **stdin**：命令（`RpcCommand`）、扩展界面响应、宿主工具的更新和结果，以及宿主 URI 结果。
- **stdout**：就绪帧、命令响应（`RpcResponse`）、会话和智能体事件、扩展界面请求，以及宿主工具和宿主 URI 的请求和取消。

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

启动与退出行为：

- RPC 模式拒绝 `@file` CLI 参数。
- `--no-ui`（与 `--mode rpc` 或 `--mode rpc-ui` 同用）让扩展在无界面模式下运行。此时 `ctx.hasUI` 为 `false`，对话框返回默认值，扩展的界面展示更新会被丢弃。使用 `rpc-ui` 时，`ask` 等工具界面仍可用。使用 `rpc` 的无界面组合时，除宿主发出的 `login` 外，不发出任何界面请求。确切边界见[扩展界面子协议](#extension-ui-sub-protocol)。
- CLI 的 RPC 模式关闭会话标题自动生成（`PI_NO_TITLE=1`），以免多调用一次模型。`rpc-ui` 还会设置 `PI_NO_PTY=1`。
- RPC 和 ACP 对声明了相应 `protocolDefault` 的设置固定使用中性默认值，包括任务隔离与执行、记忆、顾问模式和顾问档位。RPC 还固定异步作业及 Bash、Eval 自动后台运行的默认值。显式项目或全局配置、`--config` 及隔离设置仍然优先；长时间运行的 CLI RPC 进程会监听磁盘配置变化。Todo 设置没有宿主专用默认值。
- 进程在发现扩展前接管 stdin，随后逐行解析非空的 JSONL 输入。JSON 格式错误时发出可恢复的 `command: "parse"` 失败，不会终止循环。
- 启动时先写出 `ready` 帧，再处理命令。此帧声明受支持的协议版本和传输限制。
- 扩展启动（`session_start`）在 `ready` 之后运行。启动期间只处理 `extension_ui_response`（扩展可能在等待对话框）和 `set_ask_dialog`。其他有效帧会被读取，并按顺序等到启动结束再处理；格式错误的行仍会立即收到 `parse` 失败。启动中 stdin 如果关闭，扩展正在等待的对话框会被拒绝，让启动流程可以结束。
- stdin 关闭后，拒绝仍待处理的扩展界面、宿主工具和宿主 URI 请求，处理完已接收的命令，销毁会话，并发送待发的 stdout。正常退出的状态码为 `0`。如果销毁时仍保留会话持久化失败状态，则发送相应 `notice` 帧后以状态码 `1` 退出。
- 每个响应或事件都写成一行 JSON 对象。

## 传输与分帧 \{#transport-and-framing}

协议 v1 的 stdout 帧是一个 JSON 对象，后跟 `\n`。服务器限制每个物理 stdout 帧最多 1 MiB，包括换行符。传入帧始终是一个未分块的 JSONL 对象；客户端**应该**将其控制在声明的物理帧上限内。输入不会由 `rpc_chunk` 帧重新组装。

最初的就绪帧使用协议 v1，并声明可选择使用的无损传输：

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

支持协议 v2 的客户端**应该**立即发送：

```json
{ "id": "protocol-1", "type": "negotiate_protocol", "protocolVersion": 2 }
```

收到成功响应后，过大的 stdout 对象会用连续的 `rpc_chunk` 帧发送，不再截断内容。每个分块携带 UTF-8 JSON 对象的一段 Base64 数据：

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

客户端**必须**校验 `chunkId`、`index`、`count` 和 `byteLength`，拒绝交错或中断的序列，并强制执行声明的重组上限。按索引顺序拼接已解码的字节，再按严格 UTF-8 解码，最后解析为一个 JSON 对象。`@oh-my-pi/pi-coding-agent/modes/rpc/rpc-frame` 导出的 TypeScript `RpcFrameDecoder` 实现了这些校验。如果就绪帧声明支持 v2，随附的 TypeScript 和 Python `RpcClient` 实现及 Rust 和 Go 客户端会自动协商 v2。

两种协议处理过大的 `agent_end` 时，编码器会先移除已通过 `message_end` 帧原样发送的前缀消息，并添加 `messageCount` 保存原始数量。宿主必须保留流式收到的消息，不能将 `agent_end.messages` 视为完整会话记录。

旧客户端可忽略新增的就绪字段，继续使用 v1。在 v1 中，过大的响应会变成 `success: false`，错误为 `error: "RPC response exceeded the transport limit"`；过大事件中的字符串、数组或对象字段可能会省略。如果 v2 的逻辑帧在压缩末尾帧后仍超过 64 MiB，响应会收到同样的溢出错误，其他事件会产生 `rpc_frame_error`，而 `agent_end` 会回退到空 `messages` 数组加 `messageCount`。读取大量历史的 API 应使用分页，不应依赖尺寸无限的逻辑帧。

读取方跟得上时，输出直接写入 stdout。出现背压时，服务器把待发送的字节转存到私有临时文件，再按 64 KiB 分块发送，保持帧顺序。这可以减少待发输出占用的内存，但会产生磁盘读写及临时磁盘占用；磁盘占用可能一直增长，直到读取方赶上。积压发送完或进程关闭时删除临时文件。输出或转存失败时，系统会记录错误、销毁会话，并以状态码 `1` 退出。

客户端关闭 stdin 后**必须**继续读取 stdout。正常 EOF 和扩展请求的关闭都会等待发送完待发输出。如果客户端保持 stdout 管道打开却不读取，进程可能无限期延迟退出。

### 出站帧类别（stdout） \{#outbound-frame-categories-stdout}

1. 就绪帧（`{ type: "ready" }`）。
2. `RpcResponse`（`{ type: "response", ... }`）。
3. `AgentSessionEvent` 对象（`agent_start`、`message_update` 等）。
4. `RpcExtensionUIRequest`（`{ type: "extension_ui_request", ... }`）。
5. 宿主工具请求或取消（`host_tool_call`、`host_tool_cancel`）。
6. 宿主 URI 请求或取消（`host_uri_request`、`host_uri_cancel`）。
7. 扩展错误（`{ type: "extension_error", extensionPath, event, error }`）。
8. 可用命令更新（`{ type: "available_commands_update", commands }`），启动时和命令元数据每次变化时发出。
9. 提示词完成（`{ type: "prompt_result", id?, agentInvoked, status, error?, sessionSettled }`），除非响应已在本地完成提示词。见 [`prompt` 载荷](#prompt-payload)。
10. 会话静止（`{ type: "session_settled" }`），见[交出执行与会话静止](#yield-vs-settled)。
11. 子代理帧（`subagent_lifecycle`、`subagent_progress`、`subagent_event`），由 `set_subagent_subscription` 控制。
12. 旁问帧（`btw_delta`、`btw_record`），见[旁问](#side-questions-btw)。
13. 内置斜杠命令的旁路帧（`command_output`、`session_info_update`、`config_update`）。
14. 传输溢出通知（`rpc_frame_error`），事件超过传输限制时发出。
15. 实时语音帧（`live_phase`、`live_levels`、`live_transcript`、`live_end`），见[实时语音子协议](#live-voice-sub-protocol)。
16. 仅作为草稿的听写帧（`dictation_state`、`dictation_transcript`、`dictation_end`），见[听写子协议](#dictation-sub-protocol)。

协议 v2 可以将这些类别中超限的逻辑帧封装为 `rpc_chunk` 帧。

### 入站帧类别（stdin） \{#inbound-frame-categories-stdin}

1. `RpcCommand`
2. `RpcExtensionUIResponse`（`{ type: "extension_ui_response", ... }`）
3. 宿主工具更新或结果（`host_tool_update`、`host_tool_result`）
4. 宿主 URI 结果（`host_uri_result`）

## 请求与响应的关联 \{#requestresponse-correlation}

所有命令都接受可选的 `id?: string`。

- 如果传入，普通命令响应会带回相同的 `id`。
- `RpcClient` 依赖该字段匹配待处理的请求。

需要注意以下运行时边界行为：

- 未知命令的响应也会带回请求提供的 `id`。
- JSON 格式错误及同步分发失败会发出 `command: "parse"`，不包含 `id`。处理已识别命令时发生异常，会发出带该命令 `type` 和 `id` 的失败响应。
- 普通 `prompt` 会在消息获准处理后确认，即加入队列、分配一个空闲轮次或路由到扩展命令之后。它不会在原生 `input` 处理器或图片准备结束之前确认，也不会等待智能体运行完成。`abort_and_prompt` 先等待中止，再确认。获准之前的失败是该命令的错误响应；获准之后的失败仍可能用同一个 `id` 发出后续错误响应。
- 获准的 `prompt` 或 `abort_and_prompt` 恰好完成一次：若已在本地结束，成功响应带 `data.agentInvoked: false`；否则，之后用具有同一 `id` 的 `prompt_result` 帧报告处理结果。`prompt_result` 始终在该 `id` 的响应之后写出。

## 命令 Schema（正式定义） \{#command-schema-canonical}

`RpcCommand` 在 `packages/coding-agent/src/modes/rpc/rpc-types.ts` 中定义：

### 提示词 \{#prompting}

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

`get_available_models` 会等待后台模型发现完成才返回。如果请求的模型尚未出现在可用目录，`set_model` 也会等待。它返回选中的 `Model`，或发出 `Model not found: <provider>/<modelId>` 失败。可选的 `role` 记录这次切换所属的模型角色（快速角色选择会传入它的角色）。无论是否传入，都不会持久化。

`get_model_picker` 返回 `{ rows, recent, total }`，把 omp 会话模型选择器（Alt+P）提供给任何客户端。因此远程选择器和终端界面的模型列表及排序完全相同。`query` 为空时，浏览列表把 Recent 区块排在最前（`recent` 是该区块的前导行数，涵盖分配给角色或最近使用的模型）。`provider/` 把匹配限制到一个模型提供方，以 `@` 开头的查询列出 Ctrl+P 快速角色。每行包含模型已分配的角色（`roles`）、思考滑块的档位（`thinking`）、会话运行该模型时会使用的档位（`thinkingLevel`），以及 `overContext` 和 `current`。快速角色行还带有 `role`，可传回 `set_model`。

### 思考档位 \{#thinking}

- `{ id?, type: "set_thinking_level", level: ConfiguredThinkingLevel }`
- `{ id?, type: "cycle_thinking_level" }`
- `{ id?, type: "get_available_thinking_levels" }`

`ThinkingLevel` 取值为 `"inherit" | "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"`。发现结果先返回 `"off"`，再列出当前模型支持的思考强度，省略 `"inherit"` 和仅用于会话的 `"auto"` 选择项。`set_thinking_level` 本身接收 `ConfiguredThinkingLevel`，即上述取值加上 `"auto"`，因此客户端可以启用逐轮自动思考强度。

### 队列模式 \{#queue-modes}

- `{ id?, type: "set_steering_mode", mode: "all" | "one-at-a-time" }`
- `{ id?, type: "set_follow_up_mode", mode: "all" | "one-at-a-time" }`
- `{ id?, type: "set_interrupt_mode", mode: "immediate" | "wait" }`

### 上下文压缩 \{#compaction}

- `{ id?, type: "compact", customInstructions?: string }`
- `{ id?, type: "set_auto_compaction", enabled: boolean }`

压缩结束后，`compact` 返回 `CompactionResult`。进度通过 `manual_compaction_start` 和 `manual_compaction_end` 事件报告，见[进度事件](#progress-events)。

### 缓存预热 \{#cache-warming}

- `{ id?, type: "set_cache_warming", mode: "off" | "streaming" | "idle" }`

为当前会话设置 `providers.cacheWarming`，不写入 `config.yml`。`off` 清除已安排的刷新，并中止正在进行的刷新；`streaming` 在智能体活动期间预热；`idle` 也在两次运行之间预热。启用预热不会重放先前已取消的运行，要到下一次真正发出模型提供方请求时才启动预热。模式无效时，返回常规 `success: false` 响应。成功时报告应用覆盖项后的实际模式：

```json
{ "id": "warming-off", "type": "response", "command": "set_cache_warming", "success": true, "data": { "mode": "off" } }
```

TypeScript 客户端提供 `setCacheWarming(mode): Promise<CacheWarmingMode>`。

### 重试 \{#retry}

- `{ id?, type: "set_auto_retry", enabled: boolean }`
- `{ id?, type: "abort_retry" }`

### Bash \{#bash}

- `{ id?, type: "bash", command: string, excludeFromContext?: boolean }`
- `{ id?, type: "abort_bash" }`

`excludeFromContext: true` 使这次运行不进入模型上下文，效果类似终端里的 `!!`。输出仍会返回并记录到会话记录中，扩展和 `get_messages` 均可看到。非布尔值会被拒绝。

旧运行时会忽略未知字段，仍会共享输出。因此只在 `ready` 帧包含 `supportsBashExcludeFromContext: true` 时发送 `excludeFromContext: true`。`RpcClient.bash()` 会强制进行此检查；使用 Python、Go 或 Rust SDK 时，分别检查 `client.ready` / `Ready()` / `ready()`。

`bash` 并发分发。shell 命令运行时，RPC 服务器继续读取命令，因此在长时间运行的 `bash` 期间发送的 `abort_bash`（或其他命令）无需等待它自行完成。`bash` 命令结束后才发送其响应，宿主按 `id` 关联。并发命令之间不保证顺序，客户端**必须**按 `id` 匹配响应，不能按发出顺序匹配。

### 会话 \{#session}

- `{ id?, type: "get_session_stats" }`
- `{ id?, type: "get_session_lease", sessionIds: string[] }` → `data: { held: string[], unknown: string[] }`：检查运行中的 omp（含本进程）持有哪些会话，不取得会话的所有权租约。两个列表都未包含的 ID 不被占用；`unknown` 中的 ID 无法探测。`omp session lease --json -- <id>...` 不需要 RPC 子进程，也能返回相同的信息（`--` 防止以 `-` 开头的 ID 被解析为选项）。
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

响应流式输出时，`handoff` 会失败。成功时载荷为 `{ savedPath? }`；未生成交接时为 `null`。扩展阻止会话转换时，转换命令（`new_session`、`switch_session`、`branch`、`fork`、`open_session`）会报告取消。

`fork` 将进程切换到新的会话文件，并返回 `{ cancelled }`。用 `get_state` 读取新的 `sessionFile` / `sessionId`。若指定 `entryId`（来自 `get_entries` 的任一 `message` 条目，例如用户或助手消息），新文件保留从根节点到该条目的路径，含该条目本身，并保留会话产物（包括磁盘转存文件），因此保留的 `local://N.log` 引用仍可解析。新文件头部的 `parentSession` 为旧会话文件。如果 `entryId` 位于助手的一批工具调用中（是助手消息本身或该批次的某条工具结果），截取范围会延伸到这批已记录工具结果的末尾，因此派生会话不会停在没有后续结果的工具调用上。此方式以 `"fork"` 为原因运行 `session_before_branch` / `session_branch` 钩子，钩子的 `entryId` 是最后保留的条目。未提供 `entryId` 时，命令复制整个会话及其产物（`/fork`），将旧会话 ID 记录为 `parentSession`，以 `"fork"` 为原因运行 `session_before_switch` / `session_switch`，并在会话未持久化时报告 `cancelled: true`。若 `entryId` 不是消息条目，则失败。响应正在流式输出，或正在运行 Bash、Eval、上下文压缩、交接或重试时，两种方式都会以 `code: "session_busy"` 失败。这也包括等待派生钩子或刷新写入期间启动的工作。被拒绝的派生保留当前会话、会话记录、排队的下一轮消息及后台作业。Python 客户端提供 `fork(entry_id=None) -> CancellationResult`。

`navigate_tree` 将会话叶节点移动到同一个会话文件中的 `entryId`，与交互式 `/tree` 选择器相同。若它是用户消息，则回退到该消息之前（叶节点移到其父节点，`editorText` 携带其文本）；其他条目则直接成为叶节点。提供 `summarize` 时，会话模型会总结离开的分支（如提供了 `customInstructions` 则一并使用），并把摘要条目放在目标位置。拒绝导航时绝不会移动叶节点或写入会话记录。未知 `entryId`（`code: "entry_not_found"`）和命令运行时会话已忙（与 `fork` 同样返回 `code: "session_busy"`）都在产生任何副作用前被拒绝，因此正在运行的 `btw` 旁问或等待继续的目标不受影响。另有两种拒绝发生在导航已开始之后，仍会取消正在运行的 `btw` 旁问（等待执行的目标续接会被暂缓，随后恢复）：一是生成摘要期间启动了其他工作，返回 `code: "session_busy"`；二是遇到交互式选择器可以重新打开的问题所对应的 `ask` 工具结果，返回 `code: "ask_reanswer_unsupported"`，因为重新作答需要该选择器。如果 `ask` 结果的原始问题无法恢复，则只移动叶节点。等待启动的目标续接会一直暂缓到导航结束，然后在新叶节点上运行。用 `get_messages` 读取新的会话记录。`abort_branch_summary` 会停止正在生成的摘要；对应 `navigate_tree` 返回 `{ cancelled: true, aborted: true }`，不移动叶节点。它绕过命令队列，否则会排在需要停止的 `navigate_tree` 之后。

`set_label` 设置条目的标签，省略 `label` 则清除标签。`entryId` 未知时失败。

### 消息 \{#messages}

- `{ id?, type: "get_messages" }`
- `{ id?, type: "get_messages_page", cursor?: string, limit?: number }`

`get_messages_page` 返回稳定的时间顺序分页，其中包含 `messages`、`totalMessages`，若还有更多消息则包含不透明的 `nextCursor`。游标绑定到会话 ID、已持久化的叶节点及消息数量。两次请求之间如果会话变化，服务器会拒绝过时游标；会话正在流式输出或压缩上下文时，也拒绝启动分页读取。分页请求失败时，错误响应包含机器可读的 `code`，值为 `session_busy`（正在流式输出或压缩上下文）或 `stale_cursor`（游标对应的快照已变化，例如后台 Bash 在两次翻页之间追加了消息）。客户端无需匹配错误文本即可处理。每页默认为 100 条消息；`limit` 必须是 1 到 256 的整数。分页构造器通常将消息内容序列化后的大小限制为 768 KiB，但总会至少包含一条消息，因此单条大消息可能超出此预算。v1 调用方可分页读取一般的历史记录，但如果单条消息的响应超过 1 MiB 物理帧上限，则会收到溢出错误；无损读取它必须协商使用 v2 分帧。

随附的 TypeScript `RpcClient.getMessages()` 和 Python `RpcClient.get_messages()` 在协商 v2 后会自动读取完该分页端点。连接 v1 服务器时仍使用旧的一次性命令；收到 `session_busy` 或 `stale_cursor` 时，则丢弃已部分读取的分页，回退到旧版尽力获取快照的方式。直接调用 `getMessagesPage()` 和 `get_messages_page()` 仍然严格检查，以免增量宿主混用不同快照而不自知。

### 登录 \{#login}

- `{ id?, type: "get_login_providers" }`
- `{ id?, type: "login", providerId: string }`
- `{ id?, type: "get_logout_accounts", providerId: string }` → `data: { accounts: LogoutAccount[] }`
- `{ id?, type: "logout", providerId: string, credentialId: number }` → `data: { remainingSource?: string }`

仅在模型提供方发出授权 URL 后，登录才转发普通 OAuth 输入提示。对于标记为 `secret: true` 的提示，RPC 不协商宿主是否遮蔽 `secret` 输入，因此不发出普通 `input` 请求，而是返回失败的 `login` 响应，引导用户改用终端界面。（扩展和工具的 `input` 对话框仍可在 `extension_ui_request` 上附加未经过协商的 `secret?: boolean` 提示，见下文。）

退出登录与终端界面的 `/logout` 一样，针对一条已存储的凭据执行，因为同一个模型提供方可保存多个账号。`get_logout_accounts` 列出这些账号，包括 `credentialId`、`provider`、`label`、`detail`、`type`，以及表示会话可能正在使用该凭据的 `active`，活跃账号在前。`logout` 移除一条凭据并刷新该模型提供方的模型；凭据已不在存储中时会失败。`remainingSource` 标明仍为该模型提供方提供身份验证的来源：另一条已存储的凭据、环境变量或配置键。

### 单词预测 \{#word-prediction}

- `{ id?, type: "predict_word", text: string, cursor: number }` → `data: { suffix: string | null }`
- `{ id?, type: "predict_word_feedback", text: string, cursor: number, suggestion: string, accepted: boolean }`

供自行渲染输入框的宿主显示补全提示文字。`text` 是整个草稿，`cursor` 是其中的 UTF-16 偏移。服务器应用与终端编辑器相同的条件：光标必须位于当前行末尾，且在正文单词的末尾；代码、路径和斜杠命令不提示。服务器使用 `spelling.autocomplete` 选定的引擎生成响应；`off` 始终返回 `suffix: null`。

`predict_word` 与 `bash` 一样并发分发，因此慢预测不会阻塞其他命令。按 `id` 匹配响应。每个会话只保留一个正在执行的引擎请求。执行期间收到的新请求会等待；更新的请求会替换正在等待的请求，并向被替换的请求返回 `suffix: null`。宿主可以每次按键都发送请求，但只有最新草稿会传给引擎。

共享预测守护进程需要启动并加载引擎，第一条请求可能耗时数秒，最坏约两分钟。守护进程无法启动或无法响应时，`predict_word` 失败（`success: false`），在守护进程约 30 秒的退避期间持续快速失败。把失败视为「不显示补全提示」，不要每次按键都显示错误。

发送 `predict_word_feedback` 时，传入显示建议时的 `text` 和 `cursor`。用户接受补全时用 `accepted: true`，继续键入而略过它时用 `false`。反馈会调整引擎的学习状态。

### 旁问 \{#side-questions}

- `{ id?, type: "btw", question: string, recordId?: string }` → `data: { record: BtwHistoryRecord }`
- `{ id?, type: "btw_cancel", recordId?: string }` → `data: { cancelled: boolean }`
- `{ id?, type: "get_btw_history" }` → `data: { records: BtwHistoryRecord[] }`

详见[旁问（`/btw`）](#side-questions-btw)。

## 响应 Schema \{#response-schema}

所有命令结果均使用 `RpcResponse`：

- 成功：`{ id?, type: "response", command: <command>, success: true, data?: ... }`
- 失败：`{ id?, type: "response", command: string, success: false, error: string, code?: string }`

数据载荷因命令而异，定义在 `rpc-types.ts` 中。

### `prompt` 载荷 \{#prompt-payload}

`prompt` 在消息获准处理时确认，不等待模型轮次结束。获准处理包括：已为它启动空闲轮次；智能体忙时已放入引导、后续或旁白队列；或者已路由到注册的扩展命令，但该命令的处理器还未执行。获准处理前会先完成图片归一化；对开启了视觉描述的纯文本模型，还会调用视觉描述。这些处理都在确认前结束。视觉描述调用上限是 20 秒，使确认能在随附客户端 30 秒的请求超时内返回。超过上限时，仍会保存图片，并告知模型无法提供描述。通过 `prompt` 发送的 `/skill:` 调用也遵循同样规则。如果提示词在获准前就结束（被 `abort` 丢弃或先发生错误），结束时才确认。确认条件不改变完成行为：提示词仍恰好完成一次，通过 `data.agentInvoked: false` 或其 `prompt_result`（见下文）报告。

`prompt` 会等之前收到的普通命令（如 `new_session` 或 `set_model`）处理完后才开始。此后在后台处理是否接收这条提示词。RPC 服务器无需等待缓慢的图片归一化或视觉描述，可继续处理之后的 `abort`、`steer`、`follow_up`、`get_state` 等命令。若图片仍在准备时收到 `abort`，则取消视觉描述调用并丢弃提示词，无论该提示词会启动空闲轮次，还是依照 `streamingBehavior` 排队。

```json
{
	"id": "req_1",
	"type": "response",
	"command": "prompt",
	"success": true,
	"data": { "agentInvoked": false }
}
```

对于同步完成且不启动智能体轮次的内置斜杠命令，`data.agentInvoked: false` 是完成信号，此后不会发出 `prompt_result`。其他每条获准的 `prompt`（以及每条 `abort_and_prompt`）都通过带命令 `id` 的一条 `prompt_result` 帧报告完成。只要本地结果已知，或智能体已交出执行，就会发出该帧，不必等待后台工作结束：

```json
{ "type": "prompt_result", "id": "req_1", "agentInvoked": true, "status": "completed", "sessionSettled": true }
```

- `agentInvoked: false`：提示词在本地完成（未启动轮次的扩展或自定义命令），或到达智能体之前已失败。
- `agentInvoked: true`：提示词已分发给智能体，或已排队等候处理。正常完成在智能体**交出执行**时报告，见[交出执行与会话静止](#yield-vs-settled)。如果中止在分发前生效，仍可能返回 `true`，并带 `status: "aborted"`。作为新轮次分发的提示词报告获准处理后开始的第一个运行结果，因此较早运行延迟到来的 `agent_end` 不会完成它。排入活动运行的提示词（`streamingBehavior`）在其消息离开队列后的第一次交出执行时报结果。带 `yielded: false` 的 `agent_end`（智能体正在重试、压缩上下文或回答停止时的提醒）永远不会完成提示词。
- `status`：`"completed"`、`"aborted"`（被 `abort`、`abort_and_prompt` 或会话转换中断，或在分发前被中止丢弃），或 `"error"`。
- `error`（仅当 `status: "error"`）：`{ message, provider?, model?, httpStatus?, retryable, code? }`。`message` 是模型提供方的错误文本，已移除 OMP 本地诊断信息，例如保存请求转储的路径。`retryable` 表示暂时性故障，OMP 自身的自动重试已用尽。`code: "cost_cap"` 表示会话已达到 `session.maxCost`，OMP 未发出下一个请求。服务器继续运行，后续提示词会以相同方式结束，直到调高上限。在到达智能体前失败的提示词，还会在 `prompt_result` 之前收到同一 `id` 的旧版错误响应。
- `sessionSettled`：写出结果时会话是否已经完全结束，见[交出执行与会话静止](#yield-vs-settled)。`false` 表示后台工作仍可能唤醒智能体；结束后会发出 `session_settled` 帧。

模型提供方的轮次失败并不是命令失败。提示词响应仍为 `success: true`，该轮以普通的终结 `agent_end` 结束，最后一条助手消息的 `stopReason: "error"`。使用 `prompt_result.status`，不要解析该消息。

仅在本地运行的斜杠命令可能在完成前发出 `command_output` 帧，但不会发出 `agent_end`。

### 交出执行与会话静止 \{#yield-vs-settled}

对于调用智能体的工作，提示词的 `prompt_result` 报告**智能体交出执行**：智能体完成了轮次（带 `yielded: true` 的 `agent_end`），或提示词在分发前被中止，或被会话转换中止。仅在本地完成的结果，以及分发前的错误，不要求发出 `agent_end`。只有再无任何工作能唤醒会话时，**会话才完全结束**：没有正在进行或已获准启动的智能体运行，没有排队的引导或后续消息，也没有会注入结果并启动后续轮次的后台作业（自动转入后台的 `bash`、异步 `task`、`eval`）或待投递内容。

- 每段智能体活动结束且会话完全结束时，写出一次 `session_settled`。如果交出执行时仍有待处理的后台工作，OMP 会等它结束；它触发的后续运行照常流式输出（`agent_start` 到 `agent_end`），然后才发出 `session_settled`。它始终在最后一次交出执行对应的 `prompt_result` 帧之后发出。未到达智能体的提示词不会触发它。
- `prompt_result.sessionSettled` 报告交出执行时会话是否已完全结束，因此值为 `true` 时宿主可以立即清理。
- 对于在流式输出中途接入的宿主，`get_state` 会报告 `isSettled`（判定条件相同）和 `hasPendingAsyncWork`。

要展示本轮回答，等待 `prompt_result`；要将对话视为已完成，例如暂停或回收沙箱之前，等待 `session_settled`（或检查 `isSettled`）。

### `open_session` 载荷 \{#open_session-payload}

`open_session` 将进程绑定到由宿主确定的会话目录，相当于运行时执行 `--session-dir <dir> --continue`。这样，预先启动的进程也能在启动后接手一个对话。它会继续 `sessionDir` 中最新的非空会话。如果该会话在另一个文件中继续过，则与终端没有上次会话记录时执行 `--continue` 一样，使用该会话对话中包含最新轮次的副本。如果不存在会话，就在该目录中新建。重新打开当前活跃的会话（包括同一目录下仍为空的新会话）是空操作，不会中断正在运行的轮次。否则，和 `switch_session` 一样会中止当前运行，仍打开的提示词以 `status: "aborted"` 完成。

```json
{ "cancelled": false, "resumed": true, "sessionId": "01a0...", "sessionFile": "/srv/threads/t1/2026-...jsonl" }
```

新建了会话时，`resumed` 为 `false`。进程未启用持久化（`--no-session`）时，命令失败。

`open_session` 成功后，也会将尚未关闭的 RPC 提示词票据标记为已中止，即使目录已经打开也一样。对于这种空操作，底层轮次仍继续流式输出。`cancelled: true` 会保留当前活跃会话和提示词票据不变。

恢复会话会恢复其已保存的模型，与 `--continue` 相同。如果所有保存的模型都无法恢复，例如模型 ID 更名或没有该提供方的凭据，`open_session` 返回 `Could not restore model <provider/id>`，不会将会话记录发给另一个模型。原会话仍为活跃会话，进程继续提供服务，但其中原来运行的轮次已经像其他会话切换一样被中止。`switch_session` 也会以相同方式失败。

若要绑定到特定模型，可像 `set_model` 一样同时传入 `provider` 和 `modelId`。与启动时的 `--model` 一样，它们替换已保存的模型并跳过对它的检查。未知的组合会在发生任何会话变更前返回 `Model not found: <provider>/<modelId>`。若指定模型不同于原先保存的模型，恢复的会话会记录该模型。已打开的会话或新建会话会像 `set_model` 一样选择该模型。`switch_session` 接受同样的参数组合。

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

从选定的待处理队列中移除第一条匹配的用户消息：

```json
{"id":"req_2","type":"remove_queued_message","message":"Use the existing parser","queue":"steering"}
{"id":"req_2","type":"response","command":"remove_queued_message","success":true,"data":{"removed":true}}
```

`message` 优先匹配改写斜杠或自定义命令、展开提示词模板、替换 `^model` 提及之前保存的原始提交文本。没有匹配时，再精确匹配队列条目显示的文本。移除不会重新执行命令或模板以查找匹配。排队的 RPC 技能命令保留其原始 `/skill:<name>` 调用作为条目文本。移除时还会丢弃该消息的附件及紧挨着它之前的连续隐藏用户伴随项（关键词提示、图片描述和视频源路径），保留其他消息和另一条队列。

伴随项与其提示词作为一个完整的组入队和出队，`one-at-a-time` 模式也一样。一旦此组离开待处理队列进入投递流程，移除请求不能在只发出该组部分上下文后还报告成功。

智能体编写的条目永不匹配，包括带 `role: "user"` 和 `attribution: "agent"` 的内部交接。文本重复时，每个请求只移除第一个匹配项；再次发送刚刚成功的请求，可以移除另一个匹配项。

检查和移除是同步的。`data.removed: false` 表示命令分发时，队列中没有匹配的待处理用户消息。已经出队的消息和仍在预处理的输入不能用此命令取消。实时引导输入在会话记录写入前，可能仍显示在队列快照中，但已离开可移除的待处理队列。此命令不会重新发送输入、中止轮次或改变中断行为。`message` 非字符串，或者缺少 `queue` 或其值无效时，会返回错误响应。

只有收到 `removed: true` 后，移除请求才可隐藏对应的队列条目或恢复其草稿；正常投递仍通过队列快照移除条目。旧运行时拒绝此命令，客户端不得回退到中止或重新发送排队消息。TypeScript 客户端提供 `removeQueuedMessage(message, queue): Promise<{ removed, images?, imagesDropped? }>`。

若移除的消息含图片，`data.images` 会列出它们（与 `abort_and_restore_queue` 返回的 `ImageContent` 条目相同），客户端可以同时恢复草稿和附件。纯文本消息和 `removed: false` 的响应会省略这个字段。如果图片超过协商的传输限制（见 `abort_and_restore_queue`），服务器会省略图片并设置 `data.imagesDropped: true`，而不是返回失败；消息仍然会移除。旧运行时不返回这两个字段。

官方 Python 客户端提供 `remove_queued_message(message, queue) -> RemoveQueuedMessageResult`。请检查其 `.removed` 布尔值，不要根据结果对象本身的真假判断。

### `promote_queued_message` 载荷 \{#promote_queued_message-payload}

将第一条匹配的用户后续消息移至引导队列末尾：

```json
{"id":"req_3","type":"promote_queued_message","message":"Use the existing parser"}
{"id":"req_3","type":"response","command":"promote_queued_message","success":true,"data":{"promoted":true}}
```

命令移动现有的排队消息，包括附件和紧挨它之前的连续隐藏用户伴随项，不会重新处理或复制。`message` 的匹配方式与 `remove_queued_message` 完全相同，因此智能体编写的条目永不匹配。文本重复时，每个请求只移动第一条匹配的后续消息；再次发送刚刚成功的请求，可以移动另一个匹配项。

`data.promoted: false` 表示命令分发时不存在匹配的待处理用户后续消息，例如该消息已经投递。`message` 非字符串时返回错误响应。现有的引导、后续和中断模式继续生效。提升不会中止模型流，也不保证取消运行中的工具。智能体空闲时，提升消息会立即开启轮次，包括用户执行 `abort` 之后；提升是现在就引导的显式请求。该移动以一条 `queue_update` 报告，其中消息已离开 `followUp`，进入 `steering`。

`prompt` 只在消息获准处理后确认（见上文），因此在排队 `prompt` 获得确认后立即发送的 `promote_queued_message` 一定能看到该消息。旧运行时拒绝此命令，客户端不得回退到 `steer`，否则会把重复消息加入队列。TypeScript 客户端提供 `promoteQueuedMessage(message): Promise<{ promoted: boolean }>`，其 `prompt(message, images?, streamingBehavior?)` 接受 `"steer"` 或 `"followUp"`，用来让智能体忙时收到的提示词进入队列。

官方 Python 客户端提供 `promote_queued_message(message) -> PromoteQueuedMessageResult`。请检查其 `.promoted` 布尔值，不要根据结果对象本身的真假判断。

### `abort_and_restore_queue` 载荷 \{#abort_and_restore_queue-payload}

原子地取回排队的用户输入并中止，相当于在终端界面按 Esc：

```json
{"id":"req_4","type":"abort_and_restore_queue"}
{"id":"req_4","type":"response","command":"abort_and_restore_queue","success":true,"data":{"steering":[{"text":"Use the existing parser"}],"followUp":[{"text":"Then run the tests","images":[{"type":"image","mimeType":"image/png","data":"..."}]}]}}
```

中止前，服务器撤回用户编写的所有引导和后续消息，包括运行已从队列取走、但从未记入会话记录的输入：被中止的响应在运行中取走的引导，以及为其下一次模型调用出队的引导或后续消息。由扩展或智能体发送、处于队列中且可见的消息（来自 `pi.sendMessage` 的扩展卡片、父智能体的引导、归属于智能体的提示词及其隐藏伴随项、顾问卡片）不会返回给调用方，也不会丢失。运行停止后，中止会将这些消息记入会话记录，但不启动轮次，所以模型在下次处理提示词时会看到它们。其余排队的隐藏上下文被丢弃，包括 `display: false` 的自定义消息（目标、计划、预算提示）及合成的开发者指令。中止不会用旧队列启动轮次；如果中止完成前其他来源启动了轮次，可见消息会作为后续消息进入那个轮次。普通 `abort` 则会把滞留的引导重新入队，并将它们投递到新轮次。如果先用 `remove_queued_message` 撤回这些消息，会与智能体循环竞争。

`data.steering` 和 `data.followUp` 都按从旧到新的顺序列出撤回的消息，条目为 `{ text, images? }`，其中 `text` 是队列条目显示的文本。这样客户端可将它们恢复到编辑器。除此之外，命令与 `abort` 一样：停止目标续接，取消在它之前收到但尚未获准的输入（这些输入被丢弃，不会返回），并在中止完成后响应。旧运行时拒绝此命令。TypeScript 客户端提供 `abortAndRestoreQueue(): Promise<{ steering, followUp }>`。

即使撤回的输入过大，在协商的协议下无法装入一条响应（v1 每帧 1 MiB，v2 重组后 64 MiB），也始终返回成功。服务器不会返回传输上限错误，因为这样会丢失已撤回的输入。它先省略每个条目的 `images`，设置 `data.imagesDropped: true`，保留全部文本。如果纯文本仍无法装下，只返回能装下的最早条目（先引导，后后续），并设置 `data.truncated: true`；列表中最后一项之后的条目会丢失。完整结果能装下时，不返回这两个标志。

### `abort_and_deliver_queue` 和 `resume` 载荷 \{#abort_and_deliver_queue-and-resume-payloads}

对应终端界面空输入按 Enter，以及 `.` / `c` 续跑快捷键：

```json
{"id":"req_5","type":"abort_and_deliver_queue"}
{"id":"req_5","type":"response","command":"abort_and_deliver_queue","success":true,"data":{"aborted":true}}
{"id":"req_6","type":"resume"}
{"id":"req_6","type":"response","command":"resume","success":true}
```

`abort_and_deliver_queue` 中断含有排队用户输入（或正在运行的响应实时取走的引导）的流式运行，再用该输入继续。如果没有运行在流式输出，或没有内容排队，则不执行操作，并返回 `aborted: false`。

`resume` 继续运行智能体。先中断正在运行的轮次。若有输入排队，就用该输入继续运行，不使用继续指令。模型尚未回答的提示词会原样再运行一次。续跑开始后返回；如果会话没有可继续的对话，则返回 `Nothing to resume`。

两个命令都在先前收到的用户输入之后执行，因此紧接在它们之前发送的 `prompt` 会在它们运行时已入队，并成为它们投递的输入。与 `abort` 不同，它们不会取消先前的输入，也不会停止目标续接。之后收到的 `abort` 会取消尚未开始的这两种命令。旧运行时拒绝两者。TypeScript 客户端提供 `abortAndDeliverQueue(): Promise<boolean>` 和 `resume(): Promise<void>`。

### `get_state` 载荷 \{#get_state-payload}

能获得输出吞吐量时，`tokensPerSecond` 为数字，否则为 `null`。`fastModeEnabled` 报告会话选定的模型系列档位（`priority` 或 `ultrafast`），`fastModeActive` 则报告计算出的实际启用状态。对于 Fireworks，`providers.fireworksTier: priority` 独立于 `/fast` 的模型系列设置，因此对 `/fast` 无法切换的模型，`fastModeActive` 仍可能为 `true`。Fireworks 的 `-fast` 服务变体不使用优先档位。

对于直连 Anthropic，如果模型提供方拒绝 `speed: "fast"`，回退状态会按解析出的端点和确切模型持续生效。因此 `fastModeEnabled` 可能仍为 `true`，而 `fastModeActive` 为 `false`。显式通过 `set_fast_mode` 启用表示要重试，会清除该回退，让下一次请求可再尝试。

`slowModeSupported` 报告 `/slow` 是否适用于当前模型：OpenAI 和 Google 系列模型对应 `flex` 服务档位，直连 Anthropic 模型对应低优先级通道。`slowModeEnabled` 报告当前模型是否启用慢速模式，因此 `slowModeSupported` 为 `false` 时，它总为 `false`。这不表示已持久化的设置被关闭。`slowModeScope` 说明当前模型的设置位于何处：`global` 表示持久化配置，在模型切换后仍保留，并应用于每个会话和终端（Claude 低优先级，`providers.anthropic.slowMode`）；`session` 表示当前会话按模型系列使用的灵活档位。不支持时省略此字段。切换模型后重新读取这三个字段；其他会话引起的 `global` 更改不会发出事件。

`usageLimit` 以不依赖模型提供方的结构报告当前模型的账号已超出用量上限。`stage` 在达到上限后仍可短时间使用时为 `wrap_up`，在账号改用空闲容量提供服务后为 `low_priority`。`resetsAtSec` 是供客户端按本地格式显示的纪元时间戳。低优先阶段还可能报告 `allowanceLeftPercent`，短时收尾阶段则报告后续是否有 `extraUsage`。目前只有 Claude 订阅提供这项数据。不在这两个阶段时省略该字段。没有事件携带它，因此应在运行期间、收到 `agent_end` 之后以及执行斜杠命令后重新读取 `get_state`。

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

值为 `undefined` 的字段不会出现在 JSON 中，包括未设置的模型、思考档位、会话名称、会话文件，以及不可用的 `contextUsage`。`dumpTools` 也可能在每个工具的 schema 旁附带其 `examples`。它只列出智能体的**顶层工具定义**，不列出完整的挂载清单。使用默认设置 `tools.commands: true` 时，已启用的可发现工具（包括 MCP 工具）会改为挂载成 Bash 工具命令。某个 MCP 工具不在 `dumpTools` 中，**不表示**它的服务器连接失败。`--mode rpc` 和 `--mode rpc-ui` 均遵循这一规则。

智能体通过在 `bash` 调用中运行命令来调用已挂载的工具：

- `<tool> --help` 打印从工具的 JSON Schema 推导出的用法。
- `<tool> --flag value` 运行工具。必填的顶层标量也可作为位置参数，`-j '{"flag":"value"}'` 则传递原始 JSON 参数。

这些是**智能体工具调用**，不是额外的 RPC 命令类型。因此，外层 `tool_execution_start` / `tool_execution_end` 事件及结果的工具名是 `bash`。要识别挂载为命令的宿主工具，请查看它触发的 `host_tool_call` 请求，以及 Bash 结果中 `details.toolCommands` 的分发记录。使用工具的实际名称。MCP 运行时名称经过规范化，可能不同于服务器原始的工具名称。确认调用时，应检查当前轮次的帧和结果，不能只看助手文本或先前会话记录中的条目。

MCP 配置遵循[常规配置规则](./mcp-config.md)：`disabledServers` 和 `enabledServers` 是当前配置档案的**用户级**列表，拒绝列表优先于允许列表。项目配置可对单个服务器设置 `enabled: false` 来禁用它；项目级 `disabledServers` 列表不能替代用户级拒绝列表。在外部编辑 MCP 配置文件后，重启 RPC 进程以应用并验证新配置。

`queuedMessages` 持有与下文 `queue_update` 事件相同的可显示队列条目文本。可将该文本传给 `remove_queued_message`，但仅在消息仍待处理时可移除。实时引导输入在写入会话记录前仍然可见，但已无法移除。客户端应根据这些快照渲染队列，不要另行追踪队列条目；移除响应是确认，不是第二个状态来源。`queuedMessageCount` 还包括顾问卡片和等待下一轮的消息，因此不一定等于用户编写的队列条目数量。

### `goal` 载荷 \{#goal-payload}

`goal` 管理目标模式，与交互式 `/goal` 命令的生命周期相同。每种操作都返回 `{ goal: Goal | null, state: GoalModeState | null }`；`get_state` 携带与 `goal` 相同的状态。`goal_updated` 事件报告所有变更，包括智能体的 `goal` 工具所做的变更。

- `get` 仅查询，不启动轮次。
- `create` 要求启用 `goal.enabled`、提供非空的 `objective`，且没有活动或暂停的目标。计划模式下拒绝创建，`token_budget` 必须为正整数。创建后将 `goal` 工具加入启用的工具。
- `resume` 恢复已暂停的目标，计划模式下拒绝恢复。`pause` 和 `drop` 将启用的工具恢复到目标开始前。
- 失败返回普通的 `success: false` 响应。

除非 `goal.continuationModes` 包含 `"rpc"`，目标不会在 RPC 中自动续接。这一设置同时涵盖 `--mode rpc` 和 `--mode rpc-ui`。启用时，在执行 `create` / `resume` 及每次终结的 `agent_end` 后，系统决定是否启动一个目标轮次，作为隐藏的 `goal-continuation` 消息发送。

- 交出执行的轮次完全退出后，目标轮次才会启动。此时目标必须仍处于活动状态，会话空闲且没有排队内容，未开启计划模式，也未在销毁该会话。
- 当轮次已确定但尚未启动时，`get_state.isSettled`、`prompt_result.sessionSettled` 和 `session_settled` 都将会话视为忙。如果放弃该次续接，则随后发出 `session_settled`。
- `abort` 在中止生效前停止续接，并暂停被中断的目标。因此下一条提示词不会重启它，只有 `goal resume` 会恢复它（也可 `drop` 后再 `create`）。
- 某个目标轮次没有新的工具活动时，也会停止续接。下一个本身不是目标续接的轮次（如宿主提示词、引导或后续消息）会重新预备续接。
- 会话变化时，原会话保留其目标和工具，系统恢复目标会话记录中的目标。这涵盖 `new_session`、`switch_session`、`branch`、`fork` 和 `open_session`，也涵盖由扩展命令引起的相同变更。与 TUI 一样，活跃目标在这种变更后仍然活跃，并继续运行；进程启动时恢复的目标会暂停，直到 `goal resume`。会话变化按会话记录 ID 检测，因此宿主固定 `--provider-session-id` 也不会掩盖它。会话变更期间，已经等待或到期的目标轮次会暂缓。如果变更被取消，或会话实际上不变（导航会话树、重新打开已打开的会话），目标会继续。暂缓这样的轮次时，不会报告会话已完全结束。

智能体完成目标后，目标工具会再次移除，`get_state.goal` 变为 `null`。

### `set_slow_mode` 载荷 \{#set_slow_mode-payload}

`set_slow_mode` 对当前模型开启或关闭 `/slow`，与斜杠命令完全相同。对于 OpenAI 或 Google 模型，设置或清除当前会话针对该模型系列的 `flex` 档位。对于直连 Anthropic 模型，写入已持久化的全局 `providers.anthropic.slowMode` 设置（`auto` / `off`）；启用时进入可用的低优先级窗口，禁用时停止活动的低优先级窗口。

```json
{ "id": "req_slow_on", "type": "set_slow_mode", "enabled": true }
```

成功时，`data.enabled` 报告当前模型是否已开启 `/slow`：

```json
{
	"id": "req_slow_on",
	"type": "response",
	"command": "set_slow_mode",
	"success": true,
	"data": { "enabled": true }
}
```

在不支持慢速模式的模型上启用会返回 `"Slow mode is unavailable for the current model."`。对这类模型禁用则成功并返回 `{ "enabled": false }`，不改变任何状态，因此永远不会清除另一个模型提供方已持久化的设置。非布尔的 `enabled` 会被拒绝并返回 `"set_slow_mode requires boolean enabled"`。运行期间的改动从下次请求开始生效（停止正在使用的 Claude 低优先级窗口立即生效）。不会发出事件，需重新读取 `get_state`。

### `set_fast_mode` 载荷 \{#set_fast_mode-payload}

`set_fast_mode` 改变当前会话是否启用快速模式。请求如下：

```json
{ "id": "req_fast_on", "type": "set_fast_mode", "enabled": true }
```

成功时，`data` 始终同时包含 `enabled` 和 `active`。两者都是实际计算值：`enabled` 报告会话的设置，`active` 报告计算得到的启用状态，包括模型提供方层面设置的 Fireworks 优先档位：

对于直连 Anthropic，即使快速模式已启用，显式启用也会在先前拒绝而持续回退后，重新允许向模型提供方发起尝试。

```json
{
	"id": "req_fast_on",
	"type": "response",
	"command": "set_fast_mode",
	"success": true,
	"data": { "enabled": true, "active": true }
}
```

在不具备服务档位系列的模型，或不提供优先档位的 OpenAI 系列模型上启用快速模式时，返回以下错误：

```json
{
	"id": "req_fast_on",
	"type": "response",
	"command": "set_fast_mode",
	"success": false,
	"error": "Fast mode is unavailable for the current model."
}
```

禁用快速模式是幂等操作，对不支持快速模式的模型也一样。它会成功并返回已关闭或无操作的结果。但禁用 `/fast` 不会覆盖模型提供方层面的设置，因此禁用成功并不保证 `active: false`。例如，不受支持的 `fireworks/deepseek-v4-flash` 模型设置了 `providers.fireworksTier: priority` 时，响应报告会话设置已禁用，但模型提供方的优先档位让实际启用状态仍为真：

```json
{
	"id": "req_fast_off",
	"type": "response",
	"command": "set_fast_mode",
	"success": true,
	"data": { "enabled": false, "active": true }
}
```

对应的 `get_state` 结果会报告同样的计算状态：

```json
{
	"fastModeEnabled": false,
	"fastModeActive": true
}
```

### `set_ask_dialog` 载荷 \{#set_ask_dialog-payload}

`set_ask_dialog` 让宿主选择为扩展的 `ui.askDialog` 调用接收 `ask` 扩展界面请求，见[扩展界面子协议](#extension-ui-sub-protocol)。默认关闭；在启用之前，这些调用使用 `select` 和 `editor`。该设置不影响 `ask` 工具，后者始终发送整个 `form`。不支持此命令的构建会返回失败的 `response`。因此，如果启用失败，宿主应继续使用 `select` 和 `editor` 处理扩展对话框。

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

替换当前会话的待办状态，并返回 `{ todoPhases }`。列表记在当前会话分支中，在重新加载、压缩或恢复该分支时还原，与交互式 `/todo` 编辑相同。
阶段采用 `{ name, tasks }`，任务保留 `{ content, status }`。阶段和任务都没有 ID。状态为 `"pending"`、`"in_progress"`、`"completed"` 或 `"abandoned"`。复制快照时会丢弃额外字段，包括任务的 `details` 和 `notes`。

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

宿主可以用此命令在第一条提示词之前预先填写计划。

### `set_host_tools` 载荷 \{#set_host_tools-payload}

替换当前由宿主管理、RPC 服务器可经 stdio 回调的工具集合：

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

这些工具在下次模型调用前注册。新注册的非隐藏工具自动启用，新注册的隐藏工具不会启用。再次发送 `set_host_tools` 会替换之前的宿主工具集合，原来存在且仍保留的宿主工具维持其启用状态。名称必须唯一，且不能与现有的非宿主工具冲突。

定义也接受 `hidden?: boolean`、`loadMode?: "essential" | "discoverable"` 和 `readsSkillUris?: boolean`。工具可以读取 `skill://` 中的指令内容时，设置 `readsSkillUris: true`，让提示词构建器据此决定是否包含技能指引。显式指定的加载模式优先。省略时，已知的必需内置工具名称仍为 `"essential"`，其他宿主工具默认 `"discoverable"`。响应的 `toolNames` 列出已注册的名称。

### `set_host_uri_schemes` 载荷 \{#set_host_uri_schemes-payload}

替换当前由宿主管理、RPC 服务器应通过其分发读取和写入的 URL 协议名：

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

协议名会去掉首尾空白并转为小写，且必须匹配 `[a-z][a-z0-9+.-]*`。`writable` 和 `immutable` 默认 `false`。再次发送 `set_host_uri_schemes` 会替换之前的整个集合。新列表中缺少的协议会取消注册；空列表清除所有宿主协议。

所有内置协议（`local://`、`skill://`、`security://`、`mcp://` 等）均为保留名称。RPC 宿主不得注册或遮蔽它们，违者返回 `Host URI scheme is reserved by OMP: <scheme>://`。

## 事件流 Schema \{#event-stream-schema}

RPC 模式转发来自 `AgentSession.subscribe(...)` 的 `AgentSessionEvent` 对象。

常见事件类型：

- `agent_start`、`agent_end`
- `turn_start`、`turn_end`
- `message_start`、`message_update`、`message_end`
- `tool_execution_start`、`tool_execution_update`、`tool_stream_update`、`tool_execution_end`
- `auto_compaction_start`、`auto_compaction_end`、`manual_compaction_start`、`manual_compaction_end`
- `auto_retry_start`、`auto_retry_end`
- `cache_warming_start`、`cache_warming_end`
- `retry_fallback_applied`、`retry_fallback_succeeded`
- `model_changed`、`thinking_level_changed`、`config_warnings_changed`
- `advisor_cost_changed`、`advisor_yielded`
- `ttsr_triggered`（规则注入）
- `todo_reminder`、`todo_auto_clear`
- `irc_message`、`notice`、`goal_updated`
- `queue_update`

### `queue_update` 事件 \{#queue_update-event}

```json
{ "type": "queue_update", "steering": ["Use the existing parser"], "followUp": [] }
```

可显示的引导或后续队列变化时发出。`steer`、`follow_up` 或排队的 `prompt` 会添加消息；投递到会话记录、`remove_queued_message`、丢弃在途排队消息的中止操作，或会话切换，会移除消息或清空队列。服务器与上次发出的值比较并合并更新；如果修改未改变快照，例如智能体发出的旁白从不渲染为队列条目，就不会再发。`steering` / `followUp` 与 `get_state` 的 `queuedMessages` 字段一致，并携带消息仍在等待处理时 `remove_queued_message` 接受的队列条目文本。实时引导消息在写入会话记录前仍会显示，即使已不可移除。根据该事件渲染队列，不要独立追踪每个条目；移除响应是变更确认，不是独立的队列状态。

扩展运行器的错误单独按如下形式发出：

```json
{
	"type": "extension_error",
	"extensionPath": "...",
	"event": "...",
	"error": "..."
}
```

`message_update` 在 `assistantMessageEvent` 中携带流式增量，包括文本、思考和工具调用增量。

`message_start`、`message_update` 和 `message_end` 携带由 RPC 模式分配的 `messageId` 字符串。同一消息从开始、每次更新到结束均使用相同 ID；ID 在同一进程内唯一。流式输出中途注入的记录（顾问卡片、IRC 消息）各有自己的 ID，不干扰在它们前后流式输出的回复 ID。

`set_event_filter` 限制写出的会话事件帧。传入要转发的事件 `type` 字符串，或传入 `null` 转发全部（默认）。响应以 `{ events, messageUpdates }` 带回当前选择。筛选适用于通过会话订阅发出的所有事件，不只上列常见类型。其他所有出站类别均不受影响，包括响应、`prompt_result`、`session_settled`、扩展界面及宿主工具和 URI 请求、`extension_error`、`available_commands_update`、子代理帧、旁问帧、内置斜杠命令的旁路帧，以及会话持久化和 `btw-history` 的 `notice` 帧。遇到未知事件类型即拒绝的宿主可在此固定自己理解的集合，以免 OMP 新增事件时中断。

可选的 `messageUpdates: "delta"` 只将 `message_update` 帧投影为 `{ type: "message_update", messageId, message: { role }, assistantMessageEvent }`。它省略 `assistantMessageEvent.partial`，保留其余所有事件字段，包括子类型、`delta` 和 `contentIndex`，并添加客户端重建消息所需的信息。`text_start`、`thinking_start` 和 `toolcall_start` 携带 `block`，也就是 `contentIndex` 处内容块的结构，但清空其中的流式内容：`text` 与 `thinking` 为 `""`，工具调用的 `arguments` 为 `{}`，保留其 `id`、`name` 及其他元数据。因此后续增量总是从空内容开始应用。服务器在处理事件时而非模型发出事件时获取内容块快照，所以起始快照可能已经含有某个后续增量会发送的文本，这正是清空内容的原因。`text_end` 与 `thinking_end` 保留 `content`，并附带 `block`，即同一个去掉文本的块，因此签名及其他元数据（`textSignature`、`thinkingSignature` 等）仍然可用。请用 `{ ...block, text: content }` 或 `{ ...block, thinking: content }` 重建该块。`image_end` 的 `content` 是完整图片，`toolcall_end` 的 `toolCall` 是完整工具调用；它们各自是 `contentIndex` 处的块。`start` 表示轮次内重新开始流式消息，携带完整的重启起点 `message`；该快照同样可能领先于后续增量，因此以各块的 `*_end` 为其最终内容的准绳。`text_delta` 和 `thinking_delta` 携带要追加到 `contentIndex` 所指块的文本。`toolcall_delta` 携带工具调用参数 JSON 的片段，只有 `toolcall_end` 的 `toolCall` 才提供完整参数。重建范围是消息的 `content`；`usage`、`responseId`、`stopReason` 和其他消息字段只在 `message_end` 中到达。`message_start`、`message_end` 和其他帧不变。`message_end` 仍携带完整消息，并以它为准。其内容可能与重建结果不同，例如行内编辑恢复可能从文本块中提取编辑载荷，并紧挨该块之前合成一个 `edit` 工具调用。没有起始事件的块类型也只会在这里完整发出。宿主仍必须接受较大的块和完整消息使用协议 v2 分块发送。消息传输中途切换模式不会改变其 `messageId`。投影只影响会话自身的帧。在 `set_subagent_subscription` 档位为 `"events"` 时转发的 `subagent_event` 载荷会保留完整的 `message_update` 快照。

每条命令都会替换整个筛选状态。省略 `messageUpdates` 时重置为默认值 `"full"`，保留原始完整快照。`events` 的结构无效（既不是 `null` 也不是非空字符串组成的数组），或模式不是 `"full"` 和 `"delta"` 时，返回错误，两项设置均不改变。事件名称不会按固定目录校验，可以传入未知的非空名称。协议 v1 和 v2 都支持投影，`events: null` 时也支持。通过响应带回的 `data.messageUpdates` 字段探测支持情况：较早的服务器会忽略该选项且不带回该字段。这项选择仅用于原始协议；TypeScript `RpcClient` 与 Python 客户端保留其完整消息监听器约定。

除可选的遥测字段外，会话级 `agent_end` 的结构如下：

```ts
{
  type: "agent_end";
  messages: AgentMessage[];
  isTerminal?: boolean;
  yielded?: boolean;
  awaitingAsyncWork?: boolean;
}
```

智能体完成轮次时，`yielded` 为 `true`。此时，结束是终结性的，或会话只可能因排队输入或后台作业结果而恢复。智能体继续处理自己的工作（重试、压缩后继续、停止时的提醒）时为 `false`。较早运行时的帧省略此字段；只有终结性结束才应视为已交出执行。

`isTerminal: false` 表示该次运行尚未结束，将由续接、排队输入或外部工作恢复。`awaitingAsyncWork: true` 标识一种非终结性结束，只有外部工作可能恢复它，例如后台作业结果、仍在运行的子代理发来的消息，或排队的同级消息。每次运行恰好发出一个终结性的 `agent_end`，即使外部工作消失但没有恢复它，也会发出（如作业被取消、子代理完成但没有回信）。这些可选字段使较早的帧在缺少 `isTerminal` 时仍可兼容终结性结束。用 `yielded` 判定提示词交出执行，用 `session_settled` 判定会话静止。

### 进度事件 \{#progress-events}

这些事件报告应由宿主在对话中显示为提示的工作。RPC 模式始终转发它们，只受 `set_event_filter` 限制。早于 `manual_compaction_start` 和 `manual_compaction_end` 的服务器，只通过 `compact` 的响应报告手动上下文压缩。

| 事件 | 触发时机 | 载荷 |
| --- | --- | --- |
| `manual_compaction_start` | 手动压缩开始，例如 `compact` 命令、`/compact` 或扩展的 `ctx.compact()`。活动轮次已被中止。 | `mode?`：`/compact <mode>` 的子命令 |
| `manual_compaction_end` | 该次压缩结束。 | `aborted`，及以下之一：`result`（已提交），`skipped: true` 和 `errorMessage`（无内容可压缩），或 `errorMessage`（失败或取消） |
| `auto_compaction_start`、`auto_compaction_end` | 自动压缩开始或结束，原因可为阈值、溢出、空闲或不完整响应。手动压缩不发出。 | `reason`、`action`；`result?`、`aborted`、`willRetry`、`errorMessage?`、`skipped?` |
| `retry_fallback_applied` | 可重试故障使会话切换到 `retry.fallbackChains` 链的下一个模型。 | `from`、`to`（模型选择器）、`role`、`reason?`（错误） |
| `retry_fallback_succeeded` | 回退模型给出回答。 | `model`、`role` |
| `ttsr_triggered` | 规则注入：TTSR 规则匹配流式输出，将规则文本注入对话。 | `rules`：每条规则至少有 `name`、`path` 和 `content` |
| `goal_updated` | 目标模式因 `goal` 命令或智能体的 `goal` 工具发生变化。 | `goal`（或 `null`）、`state?` |

每次手动压缩恰好发出一对开始和结束事件。如果配置的某种方法失败并尝试下一种，回退仍处于同一对事件内。`compact` 在开始前即被拒绝时不会发出事件对，例如另一次压缩已在运行，或 `/compact <mode>` 收到它不接受的重点说明。

```json
{ "type": "manual_compaction_start" }
{ "type": "manual_compaction_end", "aborted": false, "result": { "summary": "…", "firstKeptEntryId": "…", "tokensBefore": 48210, "details": {} } }
{ "type": "manual_compaction_end", "aborted": false, "skipped": true, "errorMessage": "Already compacted" }
{ "type": "retry_fallback_applied", "from": "anthropic/claude-sonnet-4-5:high", "to": "openai/gpt-4o-mini", "role": "default", "reason": "Request failed: overloaded_error: provider returned error 503" }
{ "type": "ttsr_triggered", "rules": [{ "name": "no-forbidden", "path": "/repo/.omp/rules/no-forbidden.md", "content": "Never write the forbidden word." }] }
```

### 缓存预热事件 \{#cache-warming-events}

每次提交到模型提供方流的刷新都会发出一个开始事件和一个对应的结束事件；刷新期间销毁会话则不发出结束事件。没有发出刷新的决策（如停止，或用压缩跨过等待期）都不发出。这些是会话事件，因此启用筛选时，**必须在 `set_event_filter` 中列出两种事件**，才能观察到完整的刷新生命周期：

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

- `hit`：刷新读取了缓存 token，没有写入新缓存条目。
- `miss`：没有读取缓存 token，或写入了缓存 token。预热停止。
- `error`：未获得响应，或响应包含错误。预热停止，但有一个例外：端点拒绝 `prewarm`（HTTP 400）后，会在同一轮预热机会发出一对 `replay` 的开始和结束事件，随后会话余下时间对该模型使用重放。
- `aborted`：刷新还在进行时，运行被取消或替换。

只有刷新作为 `model_usage` 条目记录时才有 `usage`（`purpose: "cache-warm"`，扩展强制刷新时为 `"cache-warm:extension-override"`）。包括产生费用的未命中、错误，以及模型提供方已经接收的 `aborted` 刷新（取消前已报告用量）。模型提供方响应前中止则没有用量。累加 `usage.cost.total` 可归集已计入 `get_session_stats` 的预热费用，不是再加一笔费用。

这些是普通会话事件，因此 `--mode json` 的输出也包含它们。

`warmingStopReason` 解释为什么因刷新而停止预热，或为何在刷新期间停止，例如 `"refresh missed the cache"`、`"refresh failed"`、`"cache warming disabled"` 或 `"conversation context changed"`。预热继续时，如已重新安排刷新或新的请求替换了运行，不包含此字段。

### 可用命令 \{#available-commands}

`get_available_commands` 返回 `{ commands }`。启动时以及命令元数据变化后，也会在 `available_commands_update` 帧中推送同一个数组。每条命令包含 `name`、`source`，以及可选的 `aliases`、`description`、`input.hint` 和 `subcommands`。

命令发现有意采用 OMP 的协议变体。不提供 Pi 的 `get_commands`（将扩展、提示词模板、技能依次投影为 `RpcSlashCommand[]` 的命令），因为 OMP 的命令目录更丰富，包括内置、自定义、MCP 和文件命令，`source` 枚举取值范围更宽，也没有 Pi 的 `sourceInfo`，在传输格式上与其不兼容。

### 兼容 Pi 的历史与会话树命令，使用 OMP 原生条目载荷 \{#pi-compatible-historytree-commands-with-omp-native-entry-payloads}

下列命令及其协调语义兼容 Pi，但返回的 `SessionEntry` 载荷联合类型是 OMP 原生的，传输格式并不与 Pi 完全相同。具体来说，Pi 的 `model_change` 携带 `provider` 和 `modelId`，OMP 使用合并后的 `model`，加上角色或回退元数据；Pi 使用 `usage` 条目，OMP 使用 `model_usage`；OMP 还有其他条目类型，例如服务档位、标题、模式、凭据和重置记录。能接受共同结构子集（`id` / `parentId` 与消息条目）的宽松客户端，可以在二者间共享一套持久化历史读取算法；严格的 Pi `SessionEntry` 解码器不能假定载荷相同。

`get_entries` 读取正式的追加历史，而不只读取活动分支，返回 `{ entries, leafId }`。未指定 `since` 时，按追加顺序返回所有条目；指定 `since` 时，只返回匹配的持久化条目 ID 之后的条目，不含该条目。未知的 `since` 会明确以 `code: "unknown_since"` 失败。`get_tree` 直接从 `SessionManager` 返回 `{ tree, leafId }` 形式的原始会话树，而不是用于界面显示的投影。

`get_available_thinking_levels` 返回 `{ levels }`，即当前模型可选择的档位，`"off"` 排在最前（`set_thinking_level` 接受它，但只处理推理强度的模型辅助函数不包含它）。OMP 专用的 `auto` / `inherit` 选择项有意从发现结果中省略。

生命周期仍采用 OMP 格式。`agent_end` 携带 `isTerminal`、`yielded` 和可选的 `awaitingAsyncWork`；`prompt_result` 关联提示词完成情况；`session_settled` 报告会话静止。没有 Pi 的 `agent_settled` 帧。上述字段和帧，以及 `agentInvoked`、`open_session`、`set_event_filter`、`messageId`、`ready`、协议协商、分块、宿主工具和子代理，均是面向 Pi 系列的适配器必须另行适配的 OMP 扩展。

### 子代理订阅 \{#subagent-subscriptions}

子代理转发默认为 `"off"`。`set_subagent_subscription` 可选择：

- `"off"`：不转发子代理帧。
- `"progress"`：转发生命周期与进度帧。
- `"events"`：转发生命周期、进度及完整的子代理事件帧。

`get_subagents` 返回注册表快照，按子代理索引及 ID 排序。`get_subagent_messages` 通过 `subagentId` 或已注册的 `sessionFile` 选择会话记录（`subagentId` 优先），任意文件路径会被拒绝。`fromByte` 支持增量读取，默认为 0，限制为非负整数。非有限值会失败。结果包含 `sessionFile`、`fromByte`、`nextByte`、`reset`、原始会话记录 `entries`，以及来自消息条目的 `messages`。只读取以换行结束的完整记录；下一次请求应复用 `nextByte`。会话记录缺失时返回空数组。如果 `fromByte` 超过当前文件大小，从第 0 个字节重新读取，并报告 `reset: true`。

### 取消子代理 \{#cancelling-subagents}

`cancel_subagent` 强制停止 `get_subagents` 当前所列的一个子代理，不管在前台还是后台，也不管嵌套深度，不中止父轮次。它使用与智能体中心终止操作相同的路径：中止子代理的活动轮次，在注册表将其条目标记为 `aborted` 留档，因此启动它的 `task` 调用以已中止结果完成。终止操作停止子代理但不丢弃其记录。之后发送 `write agent://<id>` 消息或从智能体中心唤醒时，会从子代理的会话记录恢复它。
当 `set_subagent_subscription` 为 `"progress"` 或 `"events"` 时，随后会发出带 `status: "aborted"` 的 `subagent_lifecycle` 帧。

```json
{ "id": "req_1", "type": "cancel_subagent", "subagentId": "OmpWorker" }
{ "id": "req_1", "type": "response", "command": "cancel_subagent", "success": true, "data": { "cancelled": true } }
```

ID 不属于本会话中运行的子代理时，`cancelled` 为 `false`。包括未知 ID、其他会话中的同名智能体、已完成的子代理（父智能体已经接收结果的情况也算，即使生命周期结束帧尚未发出）或已取消的子代理。因此宿主可以将其视为幂等操作。如果无法持久化 `aborted` 标记，仍会中止并销毁子代理，但命令会返回含写入故障的错误响应。

### 引导子代理 \{#steering-subagents}

`steer_subagent` 以运行中的子代理的用户身份向其发送消息，类似智能体中心里的对话。子代理正在执行轮次时，会在下一个步骤边界收到引导；子代理处于两轮之间时，则启动下一轮。该消息记在子代理自己的会话记录中，不归属于父智能体。父智能体只会看到该子代理最终返回的结果。隔离的（工作树）子代理也在同一进程内运行，接受引导的方式相同。

```json
{ "id": "req_1", "type": "steer_subagent", "subagentId": "OmpWorker", "message": "Drop the glob, keep the direct path." }
{ "id": "req_1", "type": "response", "command": "steer_subagent", "success": true }
```

消息获准处理后返回响应，即加入正在运行的轮次的队列，或子代理已开始新轮次。响应不等待轮次结束。与 `prompt` 一样，命令按队列顺序开始，但在后台等待消息获准，因此不会让之后的命令（包括 `abort`）排在它后面。与智能体中心对话一样，不同于 RPC 的 `steer`，消息经过子代理的 `prompt()`：扩展、自定义及文件中的斜杠命令会运行，提示词模板也会展开。

返回失败的情况：

- 缺少 `subagentId`、其值为空，或 `message` 为空白：校验错误。
- `get_subagents` 当前未将 `subagentId` 列为正在运行，例如未知、已完成、已取消、属于另一个会话的智能体，或父智能体已接收其结果：`error: "Subagent not running: <id>"`。
- 子代理在接收消息前丢弃或拒绝它，例如先发生中止，或用量上限预检先拒绝：`error: "Subagent refused the message: <reason>"`。

### 旁问（`/btw`） \{#side-questions-btw}

`btw` 发起终端界面的 `/btw` 旁问：基于当前会话上下文（包括仍在流式输出的轮次），运行一次临时模型轮次，以文本回答，不使用工具。问题和回答不会加入会话记录，而是保存到会话的 BTW 历史附属文件中，终端界面的 `/btw` 历史也读取此文件。提供 `recordId` 时，问题是该主题的后续提问，并重放较早轮次作为上下文。

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

一条记录的最新轮次是其最后一次后续提问；没有后续提问时是记录本身。`interrupted` 标记运行期间进程终止的轮次。

```json
{ "id": "req_1", "type": "btw", "question": "why does this test need a lock?" }
{ "type": "btw_record", "record": { "id": "1596…", "question": "why does this test need a lock?", "answer": "", "status": "running", "leafId": "a1b2c3d4", … } }
{ "id": "req_1", "type": "response", "command": "btw", "success": true, "data": { "record": { … } } }
{ "type": "btw_delta", "recordId": "1596…", "delta": "Two workers " }
{ "type": "btw_record", "record": { "id": "1596…", "answer": "Two workers …", "status": "complete", … } }
```

问题的运行状态保存后，先收到本轮开始的 `btw_record` 帧，再收到响应。随后轮次才启动，因此每个 `btw_delta` 和之后的 `btw_record` 都在响应之后。每次生命周期变更（开始、完成、取消、错误）都用 `btw_record` 帧携带完整记录，同一 ID 以最后一条为准。旁问与主智能体并行运行，不等待正在运行的提示词，也不阻塞它。

每个会话一次只能运行一个旁问。`btw_cancel` 绕过命令队列，取消正在运行的旁问或仍在启动、随后会失败的 `btw`。若给出 `recordId`，则只取消该主题。没有匹配项目正在运行时返回 `cancelled: false`，包括 `btw` 仍在其他命令后面排队的情况。`new_session`、`switch_session`、`branch`、`fork`、`open_session`、扩展发起的会话变更和关闭都会取消正在运行的旁问，并先等待其保存状态，即使之后该变更被阻止。

`get_btw_history` 先列出当前会话的最新记录。运行中的记录包含已产生的部分回答，以便重新连接的宿主重建视图。没有旁问运行时会从磁盘重新读取历史，因此也会列出终端界面添加的主题并支持继续追问；另一个进程仍在回答的主题会读成 `interrupted`。列表不分页。超出传输上限的历史与普通超大响应一样会失败（协议 v2 可分块）。

`btw` 返回失败的情况：

- `question` 为空白。
- 另一个旁问仍在运行或启动。
- `recordId` 未知。
- 没有当前模型。
- 无法保存历史，包括另一个进程仍占用对应主题。
- 问题开始前被 `btw_cancel` 或会话变更取消。

如果响应发出后保存状态失败，会通过 `{ type: "notice", level: "error", source: "btw-history", message }` 帧报告。回答保留在内存中。下次 `btw` 和每次会话变更都会先重试保存；如果仍无法保存，则以 `/btw history could not be saved: …` 失败，会话停留在原处。关闭时进程仍会退出，并通过同类通知报告丢失情况。重试时如果发现磁盘上的主题已删除或重写（例如由另一个进程修改），则不可能再保存成功。系统会另发同类通知报告回答丢失并丢弃该回答，`btw` 或会话变更照常继续。

## 提示词与队列的并发和顺序 \{#promptqueue-concurrency-and-ordering}

普通命令在串行队列中运行。扩展界面响应、宿主工具或 URI 的更新和结果绕过这个队列，因此可以在命令处理器等待时完成请求。`bash` 也绕过串行队列，作为后台命令处理，其响应可能不按顺序到达。`prompt` 和 `steer_subagent` 按队列顺序开始，但在后台等待输入获准，因此它们的响应也可能在之后的命令响应之后到达。

### 命令确认与工作完成 \{#immediate-ack-vs-completion}

普通 `prompt` 请求**不等待智能体运行结束就确认**；`abort_and_prompt` 先等待中止。内置斜杠命令处理器和技能文件加载可能推迟确认：

```json
{ "id": "req_1", "type": "response", "command": "prompt", "success": true }
```

因此：

- 接收命令不等于运行完成。
- 提示词通过响应中的 `data.agentInvoked: false` 或其自己的 `prompt_result` 报告完成。
- 运行在 `agent_end` 帧中 `isTerminal !== false` 时完成。这个帧不带提示词的标识，因此应通过 `prompt_result` 关联提示词。
- 原生 `input` 处理器在分发到命令、技能或队列之前，按提交顺序各运行一次。后续输入会等待前一条提交获准，包括空闲时调用技能的视觉描述，但不等待其模型轮次。`abort` 会取消在它之前收到且尚未获准的输入，即使该输入仍在钩子中。成功的 `new_session`、`switch_session`、`branch`、`fork` 或 `open_session` 也会同样取消在它之前收到的输入。如果变更被阻止，则不取消任何输入；会话变更后发送的输入在新会话中运行。
- 会话只有在 `session_settled` 时才完全结束，后台作业可以在智能体交出执行后再次唤醒它。

### 流式输出期间 \{#while-streaming}

流式输出期间，`AgentSession.prompt()` 要求指定 `streamingBehavior`：

- `"steer"`：进入引导消息队列，走中断路径。
- `"followUp"`：进入后续消息队列，走轮次结束后投递的路径。

如果在流式输出期间省略该字段，提示词失败。

支持实时引导的模型提供方可以在流式响应中使用排队的引导；否则在轮次或工具批次边界投递。`follow_up` 会等到智能体原本要停止时才投递。

### 队列默认值 \{#queue-defaults}

来自 `packages/coding-agent/src/modes/settings.ts`，也是核心 `Agent` 的默认值：

- `steeringMode`：`"one-at-a-time"`
- `followUpMode`：`"one-at-a-time"`
- `interruptMode`：`"immediate"`

CLI 设置可以修改这些初始值。`set_steering_mode`、`set_follow_up_mode` 和 `set_interrupt_mode` 只影响发起调用的会话，不写入全局 `config.yml`。`set_auto_compaction` 和 `set_auto_retry` 同样使用仅对当前会话生效的设置覆盖项。

### 模式行为 \{#mode-semantics}

- `set_steering_mode` / `set_follow_up_mode`
   - `"one-at-a-time"`：每次处理队列时，只让一组待投递内容出队，隐藏伴随项与用户消息一起保留。
   - `"all"`：一次将整个队列出队。
- `set_interrupt_mode`
   - `"immediate"`：排队的引导向前台工具发出协作式中断信号，让可以自动转入后台的工作先让出执行。它不会强制终止或跳过不可中断的工具。
   - `"wait"`：不发送该协作式引导信号，让有副作用的工作先完成，再在工具批次边界注入引导。
   - 两种模式下，收到引导时都取消或跳过可中断的等待。此设置不等同于 `abort`。

## 扩展界面子协议 \{#extension-ui-sub-protocol}

RPC 模式下的扩展用请求和响应帧与界面交互。`--no-ui` 在两种 RPC 模式下都禁用扩展运行器的界面：扩展看到 `ctx.hasUI === false`，对话框采用默认值且不发帧，界面展示更新（`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`）会被丢弃。

`--mode rpc-ui` 独立启用工具的界面上下文，即使同时使用 `--no-ui`：

- `ask` 工具发出一个包含完整 HTML 表单的 `form` 请求，不需要先发送启用命令。宿主必须渲染表单，并用提交的 `data` 或取消回复。该工具不再通过 RPC 用 `select`、`input` 或 `editor` 逐个处理字段。在扩展界面未禁用时，扩展的 `ui.formDialog` 调用在两种 RPC 模式下都发送相同的 `form` 请求。
- 使用工具界面上下文的其他调用方保留受支持的对话框方法（`select`、`confirm`、`input`、`editor` 和取消）及展示方法（`notify`、`setStatus`、接受字符串数组的 `setWidget`、`set_editor_text`，以及需显式启用的 `setTitle`）。`--no-ui` 不会在传输层筛除这些方法。
- 工具审批提示使用扩展运行器，而非工具界面上下文。在 `--no-ui` 下，要求审批的工具会因没有交互界面而拒绝执行，不会发送审批对话框，与 `--mode rpc --no-ui` 下相同。
- 两种模式都不会为 MCP 认证质询提供 RPC 界面处理器；不会安装交互模式的 MCP 认证处理器。
- 由宿主发出的 `login` 独立于这两种界面设置。它可以发出 `open_url`、进度 `notify`，以及在授权 URL 之后发出的非密钥 `input` 请求。仍然不支持模型提供方标记为 `secret: true` 的登录提示，以及在授权 URL 之前发出的提示。

宿主没有工具界面时，用 `--mode rpc --no-ui`。若要回答工具对话框，但保持扩展无界面，用 `--mode rpc-ui --no-ui`。只用 `--mode rpc-ui` 会同时启用扩展界面和工具界面。

### 出站请求 \{#outbound-request}

`RpcExtensionUIRequest`（`type: "extension_ui_request"`）的方法：

- `select`、`confirm`、`input`、`editor`、`ask`、`form`、`cancel`
   - `select` 将选项标签保留在 `options: string[]` 中，只要有一个选项带描述，就发送按位置对齐的 `optionDetails: Array<{ description?: string }>` 数组。不渲染描述的宿主可以继续只使用 `options`。如果调用方提供这些字段，还会携带 `initialIndex?: number`（初始聚焦的选项）、`selectionMarker?: "radio" | "checkbox"`、`checkedIndices?: number[]`（复选列表中已勾选的选项）和 `markableCount?: number`（前面多少个选项显示选择标记；余下的为操作项；如果设置了 `selectionMarker` 但未指定数量，则每个选项均有标记）。以 `checkedIndices` 为已勾选状态的准绳。
   - `input` 携带 `title: string`，以及可选的 `placeholder?: string`、`timeout?: number` 和 `secret?: boolean`。`secret` 是来自 `ExtensionUIDialogOptions.secret`、未经协商的宿主提示；支持遮蔽输入的宿主应在 `secret: true` 时隐藏输入字符。
   - `ask` 仅在 `set_ask_dialog` 启用后发出。它携带一次扩展 `ui.askDialog` 调用的全部问题（`ask` 工具则发出 `form` 请求）：`questions: Array<{ id: string, question: string, header?: string, options: Array<{ label: string, description?: string, preview?: string }>, multi?: boolean, recommended?: number }>` 及 `timeout?: number`。`options` 永远不含「Other」条目；宿主总会提供自由文本选项。
   - `form` 不需要显式启用。它把一次 `ui.formDialog` 调用的 HTML `<form>` 放在 `html: string` 中，并携带 `timeout?: number`。宿主应渲染完整表单。包含至少两个选项的单选组和复选组会提供自由文本「Other」，除非该组已有标签为 `Other` 的选项。宿主必须用提交的 `data` 或 `{ cancelled: true }` 响应每个 `form` 请求；没有表单渲染器的宿主必须取消。未回答的 `form` 可能无限期阻塞 `ask` 调用，因为计划模式下会关闭 ask 的超时。
- `notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`
- `open_url`（RPC 登录流程发出）：包含 `url`、可选的 `launchUrl` 和可选的 `instructions`。`launchUrl` 存在时是较短的环回重定向地址，推荐复制这一地址，防止终端截断导致 OAuth 查询参数损坏。

运行时说明：

- RPC 模式禁用会话标题的自动生成。由于大多数宿主没有合适的终端标题显示位置，`setTitle` 界面请求也默认不发送。设置 `PI_RPC_EMIT_TITLE=1` 可重新启用该界面事件，不会重新启用自动生成标题。

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

取消、超时或信号中止时，`select` 和 `input` 返回 `undefined`，`confirm` 返回 `false`。信号中止会发出带 `targetId` 的 `cancel` 请求。`editor` 支持取消和信号中止，但协议上没有超时。展示方法和 `open_url` 发出后不等待，无需响应。

对话框设有超时时，超时或中止触发后 RPC 模式采用默认值，并发出 `{ method: "cancel", targetId }` 让宿主关闭对话框，之后收到的答案会被忽略。对 `ask` 来说，超时（omp 计时器触发，或宿主返回 `cancelled: true, timedOut: true`）会给每道问题选择推荐选项，没有推荐项时选第一项。

`answers` 必须按请求顺序为每道问题列出一项，每项 `id` 必须等于相应问题的 `id`。`selectedOptions` 包含准确且不重复的选项标签，多选可为空。单选（`multi` 缺失或为 false）最多接受一个选项，不能同时提供选项和 `customInput`。`customInput` 去掉首尾空白，结果为空时忽略。不符合上述结构时，`ask` 工具调用失败，不会猜测用户意图。

`data` 按控件的 `name` 保存提交值，与 HTML 表单的提交方式相同。单选组、单选 `<select>` 或单个复选框给出一个选项的 `value`，未选择时省略。至少有两个选项的复选组或多选控件给出不含重复项的选项值数组，省略时视为空数组；只有一个选项时，与单个复选框一样给出单个值。文本字段提交其文本，`number` 或 `range` 输入则提交数字（缺失的文本字段视为空）。至少有两个选项的单选组或复选组，如果没有标签为 `Other` 的选项，还接受一个不等于任何选项值的字符串作为「Other」回答。隐藏输入保留表单自己的值。未知名称、禁用选项、错误类型，或违反 `required`、`min` / `max`、`minlength` / `maxlength`、`email` / `url` 或 `pattern` 的回答，都会使 `ask` 工具调用失败，不会猜测。`form` 超时（omp 的计时器或宿主返回 `cancelled: true, timedOut: true` 时）会提交表单默认值。表单帧如果超过传输上限（协议 v1 为 1 MiB，在 `negotiate_protocol` 到 v2 后为 64 MiB），`ask` 工具调用会失败，宿主不会收到该表单帧。

有效的选择答案优先于同名隐藏值，包括允许的「Other」回答。无效的选择值如果恰好等于该隐藏值，则视为未选择，不能满足必填要求。在复选组或多选数组中，如果没有选项使用隐藏值，或者保留该值会令数组无效，则丢弃一个等于隐藏值的条目，将其视为浏览器表单数据发送的隐藏输入回传。

共用一个 `name` 的字段共用它的一条提交项。每个结构与该提交项相符的字段都使用它；不能接收该项的同名字段（例如复选组旁的单选组，或文本输入旁没有「Other」的组）视为未填写，并仍须通过自己的约束。若没有任何同名字段能接收某一项，调用失败。

无效的 `data` 响应使整个 `ask` 调用失败，不再提供一轮纠正字段的机会。宿主必须在发送前执行表单约束：`required`（仅包含空白的文本回答视为空）、`min` / `max`、`minlength` / `maxlength`、`email`、`url` 和 `pattern`（匹配整个值；忽略无效模式）。

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

仅终端可用的界面功能不受支持，包括组件工厂、自定义页眉或页脚或编辑器、原始终端输入、补全输入、主题切换及展开工具。`getEditorText()` 返回 `""`；`pasteToEditor()` 回退到 `set_editor_text`。

## 宿主工具子协议 \{#host-tool-sub-protocol}

RPC 宿主可以发送 `set_host_tools`，向智能体提供自定义工具，再通过同一个传输处理执行请求。

### 出站请求 \{#outbound-request-1}

当智能体需要宿主执行这类工具时，RPC 模式发出：

```json
{
	"type": "host_tool_call",
	"id": "host_1",
	"toolCallId": "toolu_123",
	"toolName": "echo_host",
	"arguments": { "message": "hello" }
}
```

如果工具执行随后被中止，RPC 模式发出：

```json
{
	"type": "host_tool_cancel",
	"id": "host_cancel_1",
	"targetId": "host_1"
}
```

### 入站更新与完成 \{#inbound-updates-and-completion}

宿主可选择流式报告进度：

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

在 `host_tool_result` 顶层设置 `isError: true`，拒绝待处理的宿主工具调用，并将返回的文本内容作为工具错误显示。

## 实时语音子协议 \{#live-voice-sub-protocol}

RPC 宿主可以运行绑定到 RPC 会话的 GPT 实时语音会话，即终端 `/live` 背后的实时交互。实时模型使用机器的麦克风和扬声器与用户交流，把工作作为普通轮次委派给 RPC 会话。受委派的工作使用会话的模型，以及通过 `set_host_tools` 注册的宿主工具。每个 RPC 服务器最多运行一个实时会话。

### 命令 \{#commands}

- `{ id?, type: "live_start", voice?: string, instructions?: string }` → `data: { voice: string }`
- `{ id?, type: "live_connect", sdpOffer: string, voice?: string, instructions?: string }` → `data: { voice: string, sdpAnswer: string }`
- `{ id?, type: "live_stop" }`
- `{ id?, type: "live_mute", muted?: boolean }` → `data: { muted: boolean }`

`live_start` 在会话已连接且开始录音时响应，因此像 `bash` 一样并发分发。期间若收到 `live_stop`，连接会取消，待处理的 `live_start` 随后失败。`voice` 默认为 `live.voice` 设置，响应会报告所用音色。`instructions` 替换随附的实时语音提示词，并作为 Handlebars 模板渲染，其 `{{username}}` 和 `{{firstName}}` 来自本地操作系统账号。已经有会话正在连接、活动或关闭，或者听写处于活动状态时，启动会失败。

`live_connect` 启动同类会话，但将音频放在客户端自己的 WebRTC 对等连接上，而不使用宿主的麦克风和扬声器。`sdpOffer` 是该对等端的提议，包含一条双向 Opus 音轨和一个 `oai-events` 数据通道。立即把返回的 `sdpAnswer` 应用到该对等端；呼叫信令完成且控制套接字打开时返回响应。缺少 `sdpOffer` 或值为空时，直接失败，不启动会话。对等端负责回声消除和静音：`live_mute` 只把阶段切换到 `muted`，在该阶段应将对等端的麦克风音轨设为静音。服务器不会为此类会话发送 `live_levels` 或 `speaking` 阶段。`voice`、`instructions`、`live_stop` 和其他帧与 `live_start` 相同。服务器看不到客户端的对等端，因此当它断开连接（`connectionstatechange` 变为 `failed` 或 `closed`）时，需要发送 `live_stop`，否则会话会保持打开。

`live_stop` 在会话已停止后响应，没有活动会话时也成功。`live_mute` 设置麦克风静音，省略 `muted` 时则切换当前状态；没有活动会话时失败。

```json
{ "id": "l1", "type": "live_start", "instructions": "You are Carly. Greet {{firstName}}." }
{ "id": "l1", "type": "response", "command": "live_start", "success": true, "data": { "voice": "sol" } }
```

### 帧 \{#frames}

实时语音帧不是会话事件，`set_event_filter` 不会丢弃它们。

- `{ type: "live_phase", phase }`：每次阶段变化发出；`phase` 是 `connecting`、`listening`、`working`、`speaking`、`muted`、`error` 之一。
- `{ type: "live_levels", input: number, output: number }`：麦克风和扬声器的均方根电平，范围 `[0, 1]`，每 100 ms 最多一帧。丢弃中间值，始终发送最新的值。不为 `live_connect` 会话发送。
- `{ type: "live_transcript", role: "user" | "assistant", turn: number, text: string, final: boolean }`：一轮累积的文本；同一 `role` 和 `turn` 的后续帧替换较早的帧，直到 `final: true`。
- `{ type: "live_end", error?: string }`：每个会话结束时恰好发送一次。因失败而结束时携带错误，包括失败的 `live_start` 或 `live_connect`。

关闭 stdin，或调用 `pi.shutdown()`，会在进程退出前停止活动的实时语音会话。

### 自定义实时语音端点 \{#custom-live-endpoint}

实时语音会话借助当前会话的 ChatGPT（Codex）登录向 Codex 发起信令。把 `live.endpoint` 设为服务器的基础 URL（例如 `http://127.0.0.1:8080/v1`），即可改用该服务器运行所有实时语音会话（`/live`、`live_start`、`live_connect`、扩展 `startLive`），不需要 Codex 登录，离线模式（`models.offline`）也允许使用。留空则使用 Codex。服务器按以下相对于基础 URL 的路径提供公开 OpenAI Realtime WebRTC API：

1. 以 SDP 提议作为正文发送 `POST {base}/realtime/calls`（`Content-Type: application/sdp`）。响应正文是 SDP 应答，`Location` 响应头指向呼叫地址，该地址的最后一个路径段是呼叫 ID（`/v1/realtime/calls/rtc_123` → `rtc_123`）。只跟随同源的 307 或 308 重定向。
2. 在 `{base}/realtime?call_id=<id>` 打开 WebSocket（`http` → `ws`，`https` → `wss`；保留基础 URL 的尾部斜杠和查询参数）。omp 在这里发出的第一条消息是 `{ "type": "session.update", "session": { "type": "realtime", "instructions", "audio": { "output": { "voice" } }, "delegation": { "type": "client" } } }`，模型由服务器选择。随后会话运行与 Codex 相同的事件：服务器发出 `session.started` / `session.updated`、`input_transcript.added`、`output_transcript.added`、`turn.done`、`delegation.created`、`error`，omp 发出 `delegation.context.append`、`session.context.append`、`session.close`。

设置了 `live.apiKey` 时，只向这个端点发送 `Authorization: Bearer <key>`，两次请求都会携带。不会向该端点发送 Codex 凭据或认证证明。与 `models.yml` 中的模型提供方 API 密钥一样，它可以是字面值、环境变量名，或通过输出提供密钥的 `!command`。`live.voice` 保持原样传递，应设置为服务器接受的音色。

## 听写子协议 \{#dictation-sub-protocol}

仅作为草稿的听写功能从机器的麦克风采集音频，使用会话配置的 `modelRoles.dictation` 语音转文本引擎及 `stt.language`。此功能要求 `stt.enabled: true`；禁用时会在打开麦克风或初始化语音模型前启动失败。它不提交提示词，不解释语音提交触发词，也不播放音频。实时语音与听写互斥，在其中任一功能启动或停止期间也一样。

- `{ id?, type: "dictation_start", captureId: string }` 开始采集，录音开始后响应。`captureId` 必须是非空白的字符串，长度最多 128 个 UTF-16 码元；宿主须为每次采集选择唯一 ID。
- `{ id?, type: "dictation_stop" }` 停止麦克风并处理完待转写内容，随后返回 `data: { text: string }`。没有采集时也成功，文本为空。失败时返回错误响应。

随附的客户端为两条听写命令预留 600 秒：启动可能需要下载和加载尚未就绪的语音模型；停止可能需要等待较慢的本地或云端转写完成。TypeScript 的 `RpcClient.dictationStart(captureId, timeoutMs)` 和 `RpcClient.dictationStop(timeoutMs)` 接受调用方指定的毫秒数。客户端超时只会停止等待，不会取消服务器操作。发送 `dictation_stop`（或调用 `dictationStop()`）可取消尚未完成的启动或停止活动采集。保留 `dictation_end` 订阅，以接收超过请求截止时间后到达的最终转写结果。

启动尚未完成时也可发送停止。它取消启动，等待麦克风关闭，并使待处理的启动失败。终结帧可能早于两条响应到达，因此应在启动前订阅，并按 `captureId` 关联，不要依赖响应顺序。

以下主动发送的帧绕过 `set_event_filter`：

- `{ type: "dictation_state", captureId, state: "starting" | "recording" | "transcribing" }`
- `{ type: "dictation_transcript", captureId, text }`：完整的累积预览；用它替换本次采集的上一个预览，不要追加。
- `{ type: "dictation_end", captureId, text, error? }`：每次已开始的采集恰好一个终结帧，含累积结果及可选错误。停止结果与终结帧描述的是同一份文本，只向发起采集的草稿插入一次。

变更会话前，先停止听写并处理完待转写内容，包括扩展发起的会话变更。转写失败在终结帧中报告，但释放采集后不会阻止会话变更。stdin 到达 EOF、RPC 输出失败或进程关闭时，会销毁活动采集并关闭麦克风，不等待转写。

## 宿主 URI 子协议 \{#host-uri-sub-protocol}

RPC 宿主也可管理自定义 URL 协议（虚拟文件）。执行 `set_host_uri_schemes` 后，每次读取 `<scheme>://…` 或写入 `<scheme>://…`（注册为 `writable` 时）都会经同一传输转回宿主处理。

### 出站请求 \{#outbound-request-2}

会话工具解析由宿主管理的 URL 时，RPC 模式发出：

```json
{
	"type": "host_uri_request",
	"id": "uri_1",
	"operation": "read",
	"url": "db://users/42"
}
```

写入请求结构相同，但使用 `"operation": "write"`，并另带包含完整替换文本的 `"content": "..."` 字段。

如果请求随后被中止（调用方取消或会话结束），RPC 模式发出：

```json
{
	"type": "host_uri_cancel",
	"id": "uri_cancel_1",
	"targetId": "uri_1"
}
```

### 入站结果 \{#inbound-result}

读取成功：

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

写入成功时省略内容：

```json
{ "type": "host_uri_result", "id": "uri_1" }
```

若拒绝请求，设置 `isError: true`，可在 `error` 填写错误消息，也可回退到 `content` 显示文本错误：

```json
{
	"type": "host_uri_result",
	"id": "uri_1",
	"isError": true,
	"error": "row 42 not found"
}
```

### 约束 \{#constraints}

- 智能体的 `edit` 工具不适用于宿主 URI。需要修改虚拟文件的宿主可提供 `write`，让模型用 `write` 工具写入完整替换内容。
- 协议名在整个进程内全局可见。`set_host_uri_schemes` 替换先前的集合，并取消注册新列表中没有的协议。
- 协议名在注册前统一转为小写。
- 读取成功时应发送 `content`，当前桥接层将省略的值视为空字符串。`contentType` 默认为 `text/plain`，声明值为 `"text/plain"`、`"text/markdown"` 或 `"application/json"`。结果层面的 `immutable` 会覆盖该次读取所用的已注册协议值。

## 错误模型与恢复 \{#error-model-and-recoverability}

### 命令级失败 \{#command-level-failures}

失败以 `success: false` 和字符串 `error` 表示。

```json
{
	"id": "req_2",
	"type": "response",
	"command": "set_model",
	"success": false,
	"error": "Model not found: provider/model"
}
```

### 可恢复性 \{#recoverability-expectations}

- 大多数命令失败可以恢复，进程继续运行。
- JSONL 格式错误或解析循环异常时，发出 `parse` 错误响应，并继续读取后续行。
- 空的 `set_session_name` 会被拒绝（`Session name cannot be empty`）。
- 使用未知 `id` 的扩展界面响应及有效的宿主工具或宿主 URI 更新或结果会被忽略。这些旁路帧不接收命令响应帧。
- 正常结束发生在 stdin 关闭或扩展发起关闭时。输出或磁盘转存失败，以及未恢复的会话持久化失败，都是致命错误。
- 会话持久化错误会发出未经筛选的 `{ type: "notice", level: "error", message, source: "session-persistence" }` 帧，并在 stderr 输出同样的信息。失败恢复后仍可正常关闭；销毁时仍保留的失败会在 stdout 发送完后以状态码 `1` 退出。

## 简短的命令流程 \{#compact-command-flows}

### 1）发送提示词并流式接收 \{#1-prompt-and-stream}

stdin：

```json
{ "id": "req_1", "type": "prompt", "message": "Summarize this repo" }
```

stdout 序列（简化，省略了消息内容）：

```json
{ "id": "req_1", "type": "response", "command": "prompt", "success": true }
{ "type": "agent_start" }
{ "type": "message_update", "messageId": "msg-2", "assistantMessageEvent": { "type": "text_delta", "delta": "..." }, "message": { "role": "assistant", "content": [] } }
{ "type": "agent_end", "messages": [], "isTerminal": true, "yielded": true }
{ "type": "prompt_result", "id": "req_1", "agentInvoked": true, "status": "completed", "sessionSettled": true }
{ "type": "session_settled" }
```

### 2）流式输出期间发送提示词并显式指定队列策略 \{#2-prompt-during-streaming-with-explicit-queue-policy}

stdin：

```json
{
	"id": "req_2",
	"type": "prompt",
	"message": "Also include risks",
	"streamingBehavior": "followUp"
}
```

### 3）检查并调整队列行为 \{#3-inspect-and-tune-queue-behavior}

stdin：

```json
{ "id": "q1", "type": "get_state" }
{ "id": "q2", "type": "set_steering_mode", "mode": "all" }
{ "id": "q3", "type": "set_interrupt_mode", "mode": "wait" }
```

### 4）扩展界面请求与响应 \{#4-extension-ui-round-trip}

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

### 传输 Schema 和生成的客户端 \{#wire-schema-and-generated-clients}

`packages/coding-agent/src/modes/rpc/wire` 用 omptype schema 描述每条命令（参数、成功响应的 `data`、可空性、超时），以及所有主动发送的帧和共享类型。`bun run gen:rpc` 生成：

- `rpc-wire.schema.json`：JSON Schema 2020-12 集合及 `x-rpc` 部分。它包含命令表、stdout 帧联合类型（`serverFrame`，包括响应、宿主请求及通知）、通知和会话事件的联合类型，以及宿主发往服务器的帧联合类型（`inbound`）。它用作客户端生成器的语言无关输入，解码规则如下：
   - 标有 `"x-open": true` 的对象是开放记录，例如消息、内容、用量和助手流式事件。解码器检查 `role` / `type` 判别字段并保留每个键，因此缺少较新字段的已持久化消息仍可解码。
   - 属性的 `default` 指定旧服务器省略该字段时解码器使用的值。
   - 字符串枚举取值封闭。未知值会使帧解码失败，客户端会将其显示为未知通知，不会停止。
   - 属性上的 `x-unknown-fallback`（子代理的转发事件）允许把解码失败的值降级为未知通知，而不使整帧失败；`x-scalar-or-array` 标记旧服务器以单个标量发送的数组。
- `rpc-wire.generated.ts`：TypeScript 传输类型。
- `sdk/python/omp-rpc/src/omp_rpc/_wire.py`：`omp-rpc` 包的 Python 类型、解码器、命令方法和帧监听器。
- `sdk/rust/omp-rpc/src/wire.rs`：Rust serde 类型、帧解码器及 `Command` trait（crate 为 `omp-rpc`），每条命令由一个参数结构体实现该 trait。
- `sdk/go/omp-rpc/wire.go`：Go 类型、帧解码器，以及每条命令对应的一个 `Commands` 方法（模块为 `github.com/can1357/oh-my-pi/sdk/go/omp-rpc`）。

Rust 和 Go 包在生成的类型上附带手写的进程传输层。它们协商 v2 并重组分块、分页读取消息历史、等待提示词的 `prompt_result`（`prompt_and_wait` / `PromptAndWait`），并提供宿主管理的工具和 URI 协议。API 见各自的 README。

`packages/coding-agent/test/rpc-wire` 在已提交的生成产物过时时失败，并将生成的 TypeScript 类型与 `rpc-types.ts` 及其底层内部类型核对。服务器新增命令、命令参数、事件、事件字段或枚举值时，`bun check` 会失败，直到 schema 涵盖它。

### TypeScript 辅助工具 \{#typescript-helper}

`packages/coding-agent/src/modes/rpc/rpc-client.ts` 是便捷封装，不定义协议。

当前辅助工具的行为：

- 默认启动 `bun <cliPath> --mode rpc`（`cliPath` 默认 `dist/cli.js`）。使用 `command` 参数前缀时，将生成的智能体参数加在前缀后；命令构造器则返回完整参数列表。自定义 `spawn` 传输优先。
- 按生成的 `req_<n>` ID 关联响应，协商 v2，重组分块并分页读取消息历史。
- 通过 `onEvent()` 分发识别的核心 `AgentEvent` 类型，通过 `onSessionEvent()` 分发识别的会话事件；原始服务器流可能包含其他事件类型。
- 提供 `onPromptResult()`、`onSessionSettled()`、命令可用性及子代理监听器，还有扩展界面请求。
- 通过 `setCustomTools()` 支持宿主管理的自定义工具，并自动处理 `host_tool_call` / `host_tool_cancel`。
- 用 `liveStart()`、`liveStop()`、`liveMute()` 控制实时语音会话，通过 `onLive()` 投递实时帧。
- 用 `dictationStart(captureId)`、`dictationStop()` 和 `onDictation()` 控制仅作为草稿的语音输入。
- `promptAndWait()` 等待该提示词的结果，或同步的本地完成；`waitForSettled()` 也等待会话静止。`waitForIdle()` 与 `collectEvents()` 在下一个 `agent_end` 结束，包括非终结性结束，因此不能用来等待会话静止。
- 封装常用协议命令，包括 OAuth 的 `getLoginProviders()` / `login(...)` 与 `getLogoutAccounts(...)` / `logout(...)`。未封装的功能，例如宿主 URI 注册或仅发送消息增量，使用原始协议帧。

### Python 包 \{#python-package}

随附的 [`omp-rpc`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/sdk/python/omp-rpc/pyproject.toml) 分发包提供基于进程的 Python 客户端。导入包名是 `omp_rpc`。包 API、带类型的命令和事件、宿主工具及宿主 URI 辅助函数与编排示例均在 [`omp-rpc` README](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/sdk/python/omp-rpc/README.md) 中维护。

```python
from omp_rpc import RpcClient

with RpcClient(provider="anthropic", model="claude-sonnet-4-5") as client:
    state = client.get_state()
    turn = client.prompt_and_wait("Reply with just the word hello")
    print(turn.require_assistant_text())
```

默认情况下，`RpcClient` 启动 `omp --mode rpc`；传入 `command=[...]` 可自行指定准确的子进程命令。客户端处理请求关联、带类型的通知、v2 协商及分块重组、消息分页、扩展界面（包括选择启用的 `ask` 对话框），以及宿主管理的工具和 URI 协议。命令方法和 `on_<frame type>` 监听器从传输 schema 生成，因此封装了上列所有命令；`messageUpdates: "delta"` 投影仍然只能用原始协议。Python 包负责该客户端 API 与进程生命周期；本文与 `rpc-types.ts` 仍是正式的传输协议约定。需要使用客户端库尚未封装的功能时，请使用原始协议帧。
