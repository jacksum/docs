---
title: "Stream：直播你的终端"
description: "Oh My Pi 官方仓库文档：Stream：直播你的终端。"
---

# Stream：直播你的终端 \{#stream-livestream-your-terminal}

`omp stream` 将你的 omp 会话广播到 `live.omp.sh/<username>`，这是一个类似 Twitch 的页面，包含实时终端和聊天栏。观众看到的内容与你的终端显示的内容完全一致（秘密信息除外）；他们无法在会话中输入。

Stream 独立于 [Collab](./collab.md)。Collab 将会话本身（条目、事件、提示词）复制给能够操控智能体的来宾；Stream 则将渲染后的屏幕行单向发送给观众。

## 快速开始 \{#quick-start}

直播需要 stencil.so 账户。在任意 omp 会话中通过 `/login` → **Stencil (invite only)** 登录一次；凭据与你的其他登录凭据一起存储，并自动刷新。对于脚本和本地开发，`STENCIL_API_KEY=<token>` 会覆盖已存储的凭据；`STENCIL_AUTH_URL` 将登录服务（`auth.stencil.so`）、`STENCIL_BASE_URL` 将 Stencil API（`api.stencil.so`）的基地址改为本地服务器。

你的 Stencil 用户名就是频道。服务器从 bearer 令牌中推导出它，因此 `omp stream` 不接受频道参数。

在你的工作目录中：

```
omp stream --title "Refactoring the parser"
```

输出

```
● live.omp.sh/your_username  "Refactoring the parser"
  waiting for sessions in /work/proj …
```

然后从另一个终端在同一目录中启动交互式 omp（次数不限）。在 `omp stream` 运行期间启动的每个交互式会话都会自动接入，并在页脚显示 `● LIVE 3`（`3` = 当前观众数）。观众页面将每个会话显示为独立窗格；会话退出时，对应窗格消失。在直播进程中按 Ctrl-C 会结束广播，所有已接入的会话都会移除徽标。

在 `omp stream` 启动之前就已运行的会话不会接入，请重启它们。

对于给定目录，只能有一个 `omp stream` 进程监听，服务器会拒绝同一频道的第二个直播主机。如果远程连接断开，直播进程会重新连接并重放每个窗格的当前视口和有界历史记录；它不会重放错过的聊天消息。

### 直播进程控制台 \{#streamer-console}

在终端上，`omp stream` 是一个全屏聊天控制台：顶部显示直播徽标、频道、标题、你的 stencil.so 用户名、观众 URL、观众数量和已接入窗格；中间显示聊天和事件日志；底部是一行输入框。

| 输入 | 效果 |
| --- | --- |
| `<text>` + Enter | 以频道所有者身份发送聊天消息 |
| `/title <text>` | 更改直播标题 |
| `/quit`、Ctrl-C | 停止直播（会话断开接入，频道离线） |
| Up / Down | 调出之前的消息 |

`--no-tui`（或非 TTY 的 stdout/stdin）会回退到逐行日志模式，stdin 行作为聊天消息发送（仍识别 `/title`；`/quit` 只适用于 TUI）。Ctrl-C 可以停止这两种控制台。

### 选项与设置 \{#options-and-settings}

| 标志 / 设置 | 含义 |
| --- | --- |
| 频道 | 你的 Stencil 用户名，由服务器从 bearer 令牌中推导 |
| `--title <text>` | 直播标题（默认值：目录名；最多 120 个字符） |
| `--server <url>` | 直播服务器基地址（默认值：`stream.serverUrl`） |
| `--no-tui` | 使用逐行日志控制台，而非全屏聊天 |
| `STENCIL_API_KEY` | 覆盖 bearer 令牌；否则使用 `/login` 的 Stencil 凭据 |
| `stream.serverUrl` | 默认服务器，`https://live.omp.sh` |
| `stream.redactPatterns` | 从每个直播行中遮蔽内容的附加正则表达式 |

## 哪些内容会离开本机 \{#what-leaves-the-machine}

屏幕数据流包含终端行和窗格元数据（标题与尺寸），而非会话条目。聊天使用独立的消息通道。会话进程会：

1. 获取 TUI 刚绘制的行（滚屏历史提交内容和实时视口）。
2. 去除文本样式（SGR）和超链接（OSC 8）以外的所有转义序列；内联图像变为 `[image]`。
3. 对行进行**脱敏**（见下文）。
4. 与上次发送的视口比较差异，并发送行补丁，绝不会将会话条目、提示词、工具参数或文件内容作为数据发送。

行通过私有本地 Unix 套接字（`0600`，位于每个目录的 omp 运行时目录下；Windows 上使用命名管道）传给 `omp stream` 进程，该进程将多个会话复用为窗格，并默认通过 WSS 将 JSON 屏幕帧转发到服务器。自定义 `http`/`ws` 服务器使用未加密的 WS。服务器在内存中保存每个窗格的视口和最近 2000 行历史记录，以便后来加入的观众获得快照；不会持久化任何内容。

### 脱敏 \{#redaction}

脱敏不可逆，并且刻意采用过度匹配。任何匹配都会将匹配片段替换为 `••••••`；包含匹配的行会不带样式发送。来源：

- 名称看起来像秘密信息的环境变量值（`*_KEY`、`*_TOKEN`、`*_SECRET`、`*PASSWORD*` 等），以及从该目录的 `.env` 文件加载的所有值，不论名称如何（8 个及以上字符）。
- `.omp/secrets.yml` 和 `~/.omp/agent/secrets.yml` 条目。
- 凭据形式（GitHub/GitLab/OpenAI/Anthropic/AWS/Slack/Stripe/npm/HF 令牌、JWT、PEM 块、`Bearer …`）。供应商前缀匹配**没有**长度门槛，因此令牌在逐字符输入或流式传输时就会被遮蔽。
- `NAME=value`、`NAME: value`、`"NAME": "value"`，其中 `NAME` 看起来像秘密信息时，其值会被遮蔽（涵盖屏幕上的 `read .env` 和配置文件）。
- 连接 URL 中的密码（`scheme://user:password@host`）。
- `stream.redactPatterns`。

已知的明文值还会按前缀匹配（6 个及以上字符），因此尚未输入完整的秘密信息也会被遮蔽。

脱敏无法识别从未见过的秘密信息：从其他地方粘贴且不匹配任何形式或已配置值的令牌会被显示。对于不常见的内容，请使用 `stream.redactPatterns` 或 `secrets.yml`。在直播会话期间编辑 `stream.redactPatterns` 会重新加载脱敏器并重绘其视口；它无法撤回之前已发送的行。聊天消息单独发送，不经过终端行脱敏。

## 录制 \{#recording}

在任意交互式会话中使用 `/record`，会通过同一条处理管线，将该会话的屏幕内容（已规范化、已脱敏的行、视口补丁、滚屏历史提交内容）捕获到本地文件，而非套接字。不需要账户或直播进程，也可以在直播的同时使用。录制期间页脚显示 `● REC`；再次使用 `/record` 会停止录制并输出路径。

录制内容写入 `<tmpdir>/omp-recordings/<utc-time>-<session>.ompcast`，这是一个类似 asciicast 的 JSON Lines 文件：先是一行头信息 `{"ompcast":1,"cols":…,"rows":…,"title":…,"createdAt":…}`，然后每个屏幕帧对应一行 `[ms, frame]`（`reset`、`history`、`resize`、`viewport`、`patch`）。

```
omp play                      # newest recording
omp play <file> -s 2 -i 1     # 2× speed, pauses capped at 1s
```

回放需要交互式终端，并在普通屏幕上运行：录制的视口占据终端底部，录制的滚屏历史会滚入你终端的滚屏历史，因此回放结束后输出仍会保留。空格暂停/继续；`q`、Esc 或 Ctrl-C 退出。

### 片段 \{#clips}

```
omp clip                                          # newest recording
omp clip <file> -t "Streaming the lexer" -d "…"   # title and description
```

`omp clip` 使用与 `omp stream` 相同的 Stencil 凭据，将录制内容上传到 `live.omp.sh`，并输出其页面 `live.omp.sh/c/<id>`。`--server <url>` 覆盖 `stream.serverUrl`；标题限制为 120 个字符，描述限制为 5000 个字符。页面在直播查看器的终端窗格中播放片段，下方显示标题、描述和评论串；使用 Stencil 登录后，观众可以发表评论，所有者可以编辑标题和描述。行在录制时就已脱敏；上传时不会重新读取你机器上的任何内容。

## 服务器 \{#server}

`live.omp.sh` 是一个小型 Go 服务（stencil `apps/live`）：提供频道目录（`GET /api/channels`、`GET /api/channels/<name>`）、主页预览（`GET /api/channels/<name>/preview`，即第一个窗格的视口，绝不计为观众）、根据身份确定的主机套接字（`/ws/host`）、观众套接字（`/ws/watch/<name>`）、按观众限流的聊天，以及 Web UI（终端行使用从 `/fonts/` 提供的完整 Berkeley Mono Nerd Font 渲染）。传输结构定义位于 `@oh-my-pi/pi-wire/stream`。

主机使用 stencil.so bearer 令牌进行身份验证（主机套接字上的 `Authorization: Bearer …`）；服务器对照签发者的 JWKS（`LIVE_ISSUER`、`LIVE_TOKEN_AUDIENCE`）验证它，本地开发时则可使用与 `STENCIL_API_KEY` 配套的静态 `LIVE_DEBUG_TOKENS` 列表。它直接从经过身份验证的 Stencil 用户名推导每个主机的频道，因此观众总能在 `live.omp.sh/<username>` 找到账户。观众保持匿名。
