# RPC 模式 \{#rpc-mode}

RPC 模式把 Pi 作为长期运行的子进程启动，并通过标准输入和标准输出上的 JSON 记录控制它。它适用于不依赖特定语言的集成、进程隔离、IDE 和自定义用户界面。

在 Node.js 或 Bun 中做进程内集成时，优先使用 [SDK](./sdk.md)。在 TypeScript 中做子进程集成时，优先使用导出的 `RpcClient`。它会启动 Pi、关联响应、提供带类型的命令方法，并把事件传给监听器。

| 接口 | 进程边界 | 控制方式 | 适用场景 |
|---|---|---|---|
| [SDK](./sdk.md) | 进程内 | 直接使用 TypeScript 方法和事件 | 需要使用完整 API 的 Node.js 或 Bun 宿主 |
| RPC | 子进程 | JSONL 命令、响应和事件 | 其他语言、隔离进程、IDE 或自定义客户端 |

## 启动 RPC 模式 \{#start-rpc-mode}

```bash
pi --mode rpc --no-session
```

仍可用常规 CLI 选项选择工作目录、模型、工具、资源和会话行为。常用选项包括 `--provider`、`--model`、`--name`、`--no-session` 和 `--session-dir`。完整的版本接口见[命令行](./cli.md)；当前安装版本以 `pi --help` 为准。

RPC 模式不接受 `@file` 提示词参数。请改用 [`prompt`](./rpc-commands.md#prompt) 命令发送提示词。

## 协议记录 \{#protocol-records}

协议有四类记录：

| 方向 | 记录 | 用途 |
|---|---|---|
| 标准输入 | 命令 | 请求 Pi 处理提示词、查看状态、更改配置或管理会话。 |
| 标准输出 | `response` | 报告单个命令是否成功，并返回命令产生的数据。 |
| 标准输出 | 会话事件 | 流式传输运行、消息、工具、队列、上下文压缩和重试活动。 |
| 双向 | 扩展界面记录 | 在 Pi 和客户端之间转发受支持的扩展交互。 |

完整的记录定义见 [RPC 命令](./rpc-commands.md)、[JSON 事件流](./json.md)和 [RPC 扩展界面](./rpc-extension-ui.md)。

### 关联命令和响应 \{#correlate-commands-and-responses}

每个命令都接受可选的字符串 `id`。对应的响应会返回相同的 ID：

```json
{"id":"req-1","type":"get_state"}
{"id":"req-1","type":"response","command":"get_state","success":true,"data":{"...":"..."}}
```

可能同时有多条未完成的命令时，请使用唯一的 ID。命令以异步方式处理，客户端应按 ID 关联，而不是按响应顺序关联。

会话事件一般不包含命令 ID，因为它们描述的是会话活动。`bash_execution_update` 例外：发起的 [`bash`](./rpc-commands.md#bash) 命令有 ID 时，对应的输出事件会返回相同的 ID。

`extension_ui_response` 使用 `extension_ui_request` 提供的 ID，不产生常规命令响应。

## 记录边界 \{#framing}

RPC 严格按 JSONL 划分记录。每条记录写入一个完整的 JSON 对象，以 LF（`\n`）结尾。将标准输出作为字节流或 UTF-8 流读取，只按 LF 分割记录。去掉 LF 前可能存在的回车符，即可接收 CRLF 输入。

不要使用将 Unicode 行分隔符或段落分隔符视为记录边界的通用行读取器。例如，Node.js `readline` 也会在 `U+2028` 和 `U+2029` 处分割。这两个字符在 JSON 字符串中是有效字符。

持续读取标准输出。Pi 会遵守标准输出的背压，但客户端停止读取可能阻塞进程。写入命令时，也应遵守标准输入的背压。标准输出专供协议记录，诊断信息和应用日志写入标准错误。

## 运行生命周期 \{#run-lifecycle}

`prompt` 响应成功表示提示词已被接受、加入队列或处理。不表示模型工作已经完成：

```json
{"id":"req-2","type":"prompt","message":"Review this repository"}
{"id":"req-2","type":"response","command":"prompt","success":true,"data":{"disposition":"started"}}
```

`data.disposition` 指明提示词的处理结果。如果值为 `"handled"`，这条提示词没有启动运行，不要等待 `agent_settled`。全部取值见 [RPC 命令](./rpc-commands.md#prompt)。

收到该响应后，继续读取[事件](./json.md)。`agent_end` 表示一次底层智能体运行结束，但之后仍可能继续重试、溢出恢复、压缩、处理引导消息或开展后续工作。如果客户端需要确认 Pi 不会自动继续，请等待 `agent_settled`。

在发送提示词前先订阅事件，避免错过很快就完成的运行。`RpcClient.promptAndWait()` 在内部完成这一步。若分开调用 `RpcClient` 的方法，请先设置事件监听器再调用 `prompt()`，并且只在运行仍处于活动状态时调用 `waitForIdle()`。

## 错误处理 \{#errors}

命令失败时返回一条含 `success: false` 的响应：

```json
{"id":"req-3","type":"response","command":"set_model","success":false,"error":"Model not found: invalid/model"}
```

格式错误的 JSON 会产生一条不含请求 ID 的解析响应：

```json
{"type":"response","command":"parse","success":false,"error":"Failed to parse command: Unexpected token..."}
```

成功响应只说明命令处理成功。提示词被接受之后发生的提供方故障和运行中止，会通过消息和事件流报告。

客户端还必须处理子进程启动失败、异常退出、标准错误上的诊断信息、取消操作和自身的截止时间。不要把标准错误当作协议数据解析。

## 关闭进程 \{#shutdown}

关闭子进程的标准输入，要求它有序退出。Pi 会释放活动中的运行时，等待尚未完成的工作结束后才退出。在强制终止进程前，请留出时间让它自行退出。客户端仍应处理进程信号和异常退出。

SIGTERM 和 SIGHUP 也会启动有序退出。无论有序退出是由标准输入的 EOF 还是由信号触发，开始后再遇到标准输入 EOF 或单次信号，都不会打断它；第二次信号会令进程立即退出。关闭标准输入与发送 SIGTERM 可以同时进行。

扩展还可以通过 `ctx.shutdown()` 请求退出。如果会话空闲且没有正在处理的命令，Pi 会立即退出。否则，Pi 会在当前命令完成后（`prompt` 命令要等提示词处理结束），或活动运行发出 `agent_settled` 后退出。若在扩展发起的压缩进行期间请求退出，则会等下一条命令或下一次运行完成。

## 最小客户端 \{#minimal-client}

以下 Python 示例以二进制方式读取管道，只按 LF 分割，不把 Unicode 分隔符当作协议记录边界：

```python
import json
import subprocess
import sys

process = subprocess.Popen(
    ["pi", "--mode", "rpc", "--no-session"],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
)

assert process.stdin is not None
assert process.stdout is not None

command = {"id": "prompt-1", "type": "prompt", "message": "Hello"}
process.stdin.write(json.dumps(command).encode("utf-8") + b"\n")
process.stdin.flush()

waiting_for_run = False
while line := process.stdout.readline():
    record = json.loads(line)
    if record.get("type") == "response" and record.get("id") == command["id"]:
        if not record["success"]:
            print(record["error"], file=sys.stderr)
            break
        waiting_for_run = record["data"]["disposition"] in ("started", "queued")
        if not waiting_for_run:
            break
    elif record.get("type") == "message_update":
        update = record["assistantMessageEvent"]
        if update["type"] == "text_delta":
            print(update["delta"], end="", flush=True)
    elif record.get("type") == "agent_settled" and waiting_for_run:
        print()
        break

process.stdin.close()
process.wait()
```

需要有维护的 TypeScript 客户端时，可参考经过检查的 [RPC 客户端示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/rpc-client.ts)。仓库中的示例指向 `dist/cli.js`，因此需要先构建 Pi CLI。

## 参考资料 \{#reference}

- [RPC 命令](./rpc-commands.md)：全部标准输入命令和响应。
- [JSON 事件流](./json.md)：共用的标准输出会话事件及流式消息重建方式。
- [RPC 扩展界面](./rpc-extension-ui.md)：对话框、通知、响应和限制。
- [消息类型](./message-types.md)：响应和事件使用的消息及内容块。
- [会话文件格式](./session-format.md)：会话命令返回的条目。
- [`rpc-types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/modes/rpc/rpc-types.ts)：导出的 TypeScript 协议定义。
- [`RpcClient`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/modes/rpc/rpc-client.ts)：子进程客户端实现。

## 参考链接兼容锚点 \{#moved-reference-anchors}

详细参考内容见各自的文档页。本节锚点保留已有链接的跳转位置。

<a id="prompt"></a>
<a id="steer"></a>
<a id="follow_up"></a>
<a id="abort"></a>
<a id="clear_queue"></a>
<a id="new_session"></a>
<a id="get_state"></a>
<a id="get_messages"></a>
<a id="set_model"></a>
<a id="cycle_model"></a>
<a id="get_available_models"></a>
<a id="set_thinking_level"></a>
<a id="cycle_thinking_level"></a>
<a id="get_available_thinking_levels"></a>
<a id="set_steering_mode"></a>
<a id="set_follow_up_mode"></a>
<a id="compact"></a>
<a id="set_auto_compaction"></a>
<a id="set_auto_retry"></a>
<a id="abort_retry"></a>
<a id="bash"></a>
<a id="abort_bash"></a>
<a id="get_session_stats"></a>
<a id="export_html"></a>
<a id="switch_session"></a>
<a id="fork"></a>
<a id="clone"></a>
<a id="get_fork_messages"></a>
<a id="get_entries"></a>
<a id="get_tree"></a>
<a id="get_last_assistant_text"></a>
<a id="set_session_name"></a>
<a id="get_commands"></a>

命令详情见 [RPC 命令](./rpc-commands.md)。

<a id="message_update-streaming"></a>
<a id="bash_execution_update"></a>
<a id="compaction_start--compaction_end"></a>
<a id="summarization_retry_scheduled--summarization_retry_attempt_start--summarization_retry_finished"></a>

事件详情见 [JSON 事件流](./json.md)。

<a id="extension-ui-protocol"></a>

扩展交互详情见 [RPC 扩展界面](./rpc-extension-ui.md)。
