# 命令行集成 \{#cli-integration}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 CLI Integration](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/cli-integration.md)。[上游 MIT 许可证](./license.md)。

运行 `pi` 默认打开交互式终端界面。如果通过管道或重定向传入或传出数据，Pi 会使用输出模式。脚本和应用也可以显式选择输出、JSON 或 RPC 模式。

四种模式使用相同的智能体、会话、资源和工具。模式决定输入怎样进入 Pi、输出以何种形式提供，以及进程是否保持运行以接收更多命令。

SDK 不属于 CLI 模式。它在 Node.js 或 Bun 进程中直接嵌入智能体。如果希望直接通过 TypeScript 访问，不需要进程边界，请使用 [SDK](./sdk.md)。

## 选择模式 \{#choose-a-mode}

| 模式 | 接口 | 运行时长 | 适用场景 |
|---|---|---|---|
| 交互 | 终端界面 | 直到用户退出 | 人直接使用 Pi。 |
| 输出 | 最终文本写入标准输出 | 单次调用 | 脚本需要最终助手回复。 |
| JSON | JSONL 事件写入标准输出 | 单次调用 | 进程需要获取一次运行的结构化进度。 |
| RPC | JSONL 命令、响应和事件 | 长期运行 | 进程需要双向控制。 |

CLI 选项仍可选择工作目录、模型、工具、资源和会话持久化方式，不受模式选择影响。完整的启动选项见[命令行](./cli.md)。

## 将最终文本写入标准输出 \{#print-to-stdout}

输出模式（print mode）处理传入的提示词，将最终助手回复文本写入标准输出，然后退出：

```bash
pi --print "Summarize the changes in this repository"
```

只需要最终文本时，请使用输出模式，例如命令替换、管道和一次性任务。该模式不提供中间事件。

输出模式将错误写入标准错误。最终助手回复的停止原因为 `error` 或 `aborted` 时，进程以非零状态退出。若回复达到模型输出 token 上限而被截断（停止原因为 `length`），Pi 仍会把部分文本写入标准输出，并将警告写入标准错误，同时以非零状态退出。

未显式选择模式时，标准输入或标准输出只要不是 TTY，Pi 也会选用输出模式。因此使用管道传入或传出数据时，无需加上 `--print`。

## 流式输出 JSON 事件 \{#stream-json-events}

JSON 模式先写入会话头，再将智能体和会话事件写成逐行分隔的 JSON：

```bash
pi --mode json "Review this repository" > events.jsonl
```

这是结构化事件输出，不是单个 JSON 结果，也不限制模型回复的格式。

进程启动时须提供全部提示词。进程流式输出本次运行的事件后退出，不再接受后续命令。

失败或中止的助手回复会出现在事件流中，但仅此不会产生非零退出状态。若需要区分成功与失败，请检查事件。如果调用抛出异常，Pi 仍以非零状态退出。

流式 `message_update` 记录包含增量，而不是不断增长的消息快照。实时展示时从增量事件组装输出，之后用 `message_end` 提供的最终消息替换。

`agent_end` 之后仍可能进行自动恢复或执行排队任务。`agent_settled` 标记当前运行的自动工作已结束。

标准输出专供 JSONL，诊断信息和应用日志写入标准错误。记录边界、事件结构和消息重建规则见 [JSON 事件流](./json.md)。

## 通过 RPC 控制 Pi \{#control-pi-with-rpc}

在 RPC 模式下，Pi 保持运行，另一进程可发送命令并接收响应和事件：

```bash
pi --mode rpc --no-session
```

命令是写入标准输入的 JSON 对象。响应和事件是写入标准输出的 JSON 对象。每条记录占一行。

需要关联命令与响应时，在命令中加上 `id`。匹配的响应会返回同一个 ID。事件通常没有命令 ID，因为事件描述的是会话活动，而不是单次请求。

成功的 `prompt` 响应表示提示词已被接受、加入队列或处理，并不表示该次运行已经结束。需要等待完成时，请持续读取事件，直到收到 `agent_settled`。

RPC 命令可以更换模型、检查状态、管理会话、运行 shell 命令，以及响应扩展界面的请求。

扩展对话框使用请求与响应子协议。扩展界面的其他更新是通知，客户端可以显示它们，也可以忽略。仅适用于 TUI 的扩展功能在交互模式外不可用或功能受限。

在 Node.js 或 TypeScript 中集成时，优先使用 `@earendil-works/pi-coding-agent` 的 `RpcClient`。它会启动 Pi RPC 子进程、关联请求、提供带类型的命令方法，并把会话事件传递给监听器。

[RPC 客户端示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/rpc-client.ts)会发送一条提示词，流式读取文本与工具活动，等待 `agent_settled`，然后关闭子进程。该示例包含在仓库的 TypeScript 检查范围内。

`RpcClient.promptAndWait()` 会在发送提示词前注册事件监听器，以免错过很快完成的运行。如果分开执行这些操作，请先订阅事件，再调用 `prompt()`；只在运行仍处于活动状态时调用 `waitForIdle()`。

客户端需要指向可运行的 Pi CLI 路径。仓库示例指向 `dist/cli.js`，因此从源码检出仓库之后，需要先构建此包才能运行示例。

如果不使用 `RpcClient` 构建客户端，请先阅读 [RPC 协议](./rpc.md)，再将 [RPC 命令](./rpc-commands.md)和 [JSON 事件流](./json.md)作为协议传输格式的参考。

## 派生 Pi 并更改产品名称 \{#fork-and-rebrand-pi}

基于源码的派生项目可通过 `package.json` 更改 CLI 名称和配置目录：

```json
{
  "piConfig": {
    "name": "my-agent",
    "configDir": ".my-agent"
  }
}
```

修改顶层 `bin` 字段可设置可执行文件名。这些设置会影响 CLI 启动画面的标识、配置路径，以及由此派生的环境变量名称。

## 示例和参考资料 \{#examples-and-references}

- [RPC 客户端](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/rpc-client.ts)：带类型的 Node.js 集成。
- [RPC 扩展界面示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/rpc-extension-ui.ts)：带扩展对话框的自定义终端客户端。
- [命令行](./cli.md)：启动选项和模式选择。
- [JSON 事件流](./json.md)：JSON 事件参考。
- [RPC 协议](./rpc.md)：RPC 生命周期、记录边界、错误和关闭。
- [RPC 命令](./rpc-commands.md)：命令和响应参考。
- [RPC 扩展界面](./rpc-extension-ui.md)：扩展交互子协议。
- [SDK 示例](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/sdk/)：进程内 TypeScript 集成。
