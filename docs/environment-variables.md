# 环境变量 \{#environment-variables}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Environment Variables](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/environment-variables.md)。[上游 MIT 许可证](./license.md)。

Pi 以三种方式使用环境变量：

- `PI_OFFLINE` 等变量用于配置 Pi 进程。
- Pi 设置进程标记，让子进程能够识别出启动它们的是 Pi。
- 大语言模型（LLM）通过 shell 工具执行命令时，命令会收到描述当前会话的 `PI_*` 变量。

用于提供 API 密钥的环境变量单独列在[模型提供方](./providers.md#use-an-api-key-from-the-environment)一页。

## 进程标记 \{#process-marker}

CLI 和 RPC 入口会设置两个进程标记：

- `AI_AGENT=pi` 是通用标记，让工具知道启动该进程的是 Pi。
- `PI_CODING_AGENT=true` 是 Pi 专用标记，让子进程知道自己在 Pi 中运行。

子进程继承这两个标记。它们与具体会话无关。通过 SDK 嵌入 Pi 时，Pi 不会自动设置这些标记。

## Shell 工具的会话环境变量 \{#shell-tool-session-environment}

`bash` 和 `powershell` 工具执行的命令会收到当前 Pi 会话的状态：

| 变量 | 说明 |
|----------|-------------|
| `PI_SESSION_ID` | 当前会话 ID |
| `PI_SESSION_FILE` | 当前会话 JSONL 文件的绝对路径；临时会话不设置此变量 |
| `PI_PROVIDER` | 当前选中的模型提供方 |
| `PI_MODEL` | 当前选中的模型 ID |
| `PI_REASONING_LEVEL` | 当前生效的思考级别：`off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max` |

Pi 在每条命令启动时确定这些值。因此，切换模型或更改思考级别后，无需重启 Pi，下一条 shell 命令就会收到新值。`PI_PROVIDER` 和 `PI_MODEL` 标识 Pi 中选定的模型，路由器在内部选用其他上游模型时不会改变这两个值。

有人询问当前使用哪个模型或模型提供方时，请查看这些变量，无需根据系统提示词推测：

```bash
printf '%s/%s\n' "$PI_PROVIDER" "$PI_MODEL"
printf 'reasoning=%s session=%s\n' "$PI_REASONING_LEVEL" "$PI_SESSION_ID"
```

如果会话已持久保存，可以直接查看会话文件：

```bash
if [ -n "$PI_SESSION_FILE" ]; then
  tail -n 1 "$PI_SESSION_FILE"
fi
```

Pi 将这些变量注入模型可调用的 `bash` 和 `powershell` 工具，不会注入用户输入的 `!` 或 `!!` 命令。

### 自定义 Shell 工具 \{#custom-shell-tools}

使用 `createBashTool()` 或 `createPowerShellTool()` 创建的工具在 Pi 中注册后，默认会提供会话环境变量。Pi 在运行 `spawnHook` 前注入这些变量，因此钩子可以在 `ctx.env` 中读取它们：

```typescript
const bashTool = createBashTool(cwd, {
  spawnHook: (ctx) => ({
    ...ctx,
    env: { ...ctx.env, CI: "1" },
  }),
});
```

无需改动进程启动钩子，就可以关闭会话元数据的注入：

```typescript
const powershellTool = createPowerShellTool(cwd, {
  exposeSessionEnvironment: false,
  spawnHook: (ctx) => ctx,
});
```

关闭后，Pi 会移除这些变量继承来的值，避免嵌套的 Pi 进程将父会话已经过时的元数据暴露给工具。

## Pi 进程配置 \{#pi-process-configuration}

Pi 自身读取下列变量：

| 变量 | 说明 |
|----------|-------------|
| `PI_CODING_AGENT_DIR` | 覆盖配置目录，默认为 `~/.pi/agent` |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖会话存储位置；`--session-dir` 的优先级更高 |
| `PI_PACKAGE_DIR` | 覆盖包目录，适用于指定 Nix/Guix 存储路径 |
| `PI_OFFLINE` | 禁用自动网络操作，包括模型目录刷新 |
| `PI_SKIP_VERSION_CHECK` | 禁止向 `pi.dev` 发送查询最新版本的请求 |
| `PI_SELF_UPDATE_COMMAND` | `pi update` 用来更新 Pi 本身的命令。按空白字符拆分，支持 `{packageName}`、`{version}` 和 `{installSpec}` 占位符。优先于 `selfUpdateCommand` 设置。参阅[自定义更新命令](./cli.md#custom-update-command) |
| `PI_TELEMETRY` | 覆盖安装及更新遥测和模型提供方归因请求头的行为：`1`/`true`/`yes` 或 `0`/`false`/`no` |
| `PI_CODEMODE_MAX_WORKERS` | 同一进程的所有会话中，codemode 可同时运行的 worker 数量上限，默认为 `2`。每个 worker 上的脚本最多可使用 256 MB 内存。当同一进程运行多个会话（例如使用进程内的子代理）时，可提高此上限。其余脚本会等待空闲的 worker。参阅 [Codemode](./codemode.md) |
| `PI_CACHE_RETENTION` | 设为 `long`，在模型提供方支持时延长提示词缓存保留时间 |
| `PI_SHARE_VIEWER_URL` | 覆盖 `/share` 使用的基础 URL |
| `PI_RADIUS_GATEWAY` | 覆盖 `/bug` 上传报告所用的 Radius 网关源地址 |
| `PI_CLEAR_ON_SHRINK` | 设为 `1`，在渲染内容缩短时清除空行；`terminal.clearOnShrink` 设置优先。参阅[设置](./settings.md) |
| `PI_HARDWARE_CURSOR` | 设为 `1` 以显示硬件光标；参阅[终端设置](./terminal-setup.md) |
| `PI_CLIPBOARD_OSC52` | 设为 `1`，在写入本地剪贴板后也通过 OSC 52 将复制的文本发送给终端，与 Pi 通过 SSH 连接时的行为一致。适用于远程客户端连接到 Pi 却没有 SSH 环境变量的情形，例如从另一台机器接入的终端复用器或远程 IDE 守护进程 |
| `PI_HYPERLINKS` | 用 `1`、`0` 或 `auto` 覆盖 OSC 8 超链接检测 |
| `PI_PROGRAM_STATUS` | 覆盖 OSC 7501 程序状态检测：`1` 始终报告，`0` 从不报告；其他情况下，Pi 只在终端确认支持后报告。参阅[终端设置](./terminal-setup.md#program-status) |
| `PI_IMAGE_PROTOCOL` | 用 `kitty`、`iterm2`、`none` 或 `auto` 覆盖行内图片检测 |
| `PI_TRUE_COLOR` | 用 `1`、`0` 或 `auto` 覆盖真彩色检测 |
| `PI_TUI_ESC_TIMEOUT` | 收到单独的 ESC 后，等待多少毫秒才将其当作 Escape 键；通过 SSH 时默认为 `100`，其他情况下为 `10`。如果 Alt 组合键被误识别为 Escape，请增大此值 |
| `VISUAL`、`EDITOR` | 未设置 `externalEditor` 时，用于指定备用的外部编辑器 |
| `HTTP_PROXY`、`HTTPS_PROXY` | 为出站 HTTP 请求设置代理 |

`ANTHROPIC_API_KEY`、`OPENAI_API_KEY` 等凭据变量和各模型提供方的配置列在[模型提供方](./providers.md#use-an-api-key-from-the-environment)一页。
