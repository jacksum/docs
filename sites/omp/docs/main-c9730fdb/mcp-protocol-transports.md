---
title: "MCP 协议与传输内部机制"
description: "Oh My Pi 官方仓库文档：MCP 协议与传输内部机制。"
---

# MCP 协议与传输内部机制 \{#mcp-protocol-and-transport-internals}

coding-agent 如何使用 MCP 通信：使用哪个修订版、各项协议职责位于何处，以及宿主如何访问服务器。

## 两跳 \{#two-hops}

```
session ── tunnel: NDJSON, MCP 2026-07-28 + omp/* ──► host unit ── upstream transport ──► server
(client.ts, link.ts)                                  (endpoint.ts)  (stdio / http / sse)
```

- **会话 → 宿主。** 会话只使用 MCP 2026-07-28。`HostLink`（`src/mcp/link.ts`）是其唯一传输方式：在通向服务器宿主单元的隧道上使用换行分隔的 JSON-RPC（守护进程隧道，或通向进程内宿主的内存管道）。这是 stdio 分帧方式，规范将其扩展到任意字节流。
- **宿主 → 服务器。** 单元的对端（`src/mcp/host/peers.ts`）通过上游传输访问服务器。现代服务器会被原样转发。握手时代服务器位于旧版适配器之后，适配器持有其 `initialize` 会话，并以现代协议语义响应。

`docs/mcp-runtime-lifecycle.md` 介绍各部分的所有权以及进程何时启动和停止。

## 会话使用的协议（2026-07-28） \{#the-sessions-protocol-2026-07-28}

常量和辅助函数位于 `src/mcp/protocol.ts`。

- **无状态请求。** 每个请求携带 `_meta`，其中包含 `io.modelcontextprotocol/protocolVersion`、`clientCapabilities`（`{ roots: {} }`）和 `clientInfo`。没有 `initialize`、`notifications/initialized` 或 `ping`。
- **发现。** `server/discover` 返回能力、指令，并在结果 `_meta` 中返回服务器信息。
- **结果**携带 `resultType`；缺失意味着 `complete`。未知值属于错误。
- **服务器询问（MRTR）。** `tools/call`、`prompts/get` 和 `resources/read` 可以返回 `input_required`。客户端从连接的根目录回答 `roots/list`，并使用 `inputResponses` 和回传的 `requestState` 重试，最多 8 轮；由于未声明其他能力，任何其他询问都会使调用失败。
- **订阅。** `subscriptions/listen` 替代 `resources/subscribe` 和 HTTP GET 流。会话为每个服务器打开一个列表变化订阅，需要资源更新时再打开一个持有当前 URI 集合的资源订阅；集合变化时打开新订阅并取消旧订阅。每条流以 `notifications/subscriptions/acknowledged` 开始；其通知标记有监听请求的 id。
- **缓存提示。** 列表和发现结果携带 `ttlMs` 和 `cacheScope`；宿主存储遵循它们。
- **取消。** `notifications/cancelled { requestId }`。

### 隧道扩展 \{#tunnel-extensions}

声明于 `src/mcp/host/contract.ts`；在任何内容到达服务器前，宿主会剥离 `omp/*` `_meta` 键。

| 扩展 | 方向 | 含义 |
| --- | --- | --- |
| `_meta["omp/cache"] = "stale-ok"` | 请求 | 即使超过 TTL，也从存储响应而不启动服务器；宿主重新验证，并在变化时通知 |
| `_meta["omp/cache"] = "no-store"` | 请求 | 询问服务器本身，不改动存储（连接测试、身份验证探测） |
| `_meta["omp/stale"] = true` | 结果 | 返回的条目已超过 TTL |
| `omp/status` | 宿主 → 会话 | 时代、状态（`idle`、`starting`、`running`、`failed`）、pid、已附加会话、上次退出情况 |
| `omp/restart` | 会话 → 宿主 | 立即停止上游并清除其崩溃历史 |
| `omp/roots` | 会话 → 宿主 | 会话根目录，供握手时代服务器的 `roots/list` 使用 |

### 错误 \{#errors}

服务器的 JSON-RPC 错误会携带其代码、消息和数据穿过两跳。上游自身的失败（生成进程失败、退出、HTTP 状态、超时）以 JSON-RPC 错误 `1001` 发送，其 `data` 与 `MCPTransportError` 的字段逐一对应（`transport`、`stage`、`failure`、`retryable`、`code`、`data`、`traceId`，以及进程死亡时的退出码和 stderr 尾部）；链路重建同样的错误对象。因此，工具诊断和重试分类的工作方式与传输位于会话内时相同。

### 截止时间、进度、中止 \{#deadlines-progress-abort}

`HostLink.request` 应用截止时间：先用 `OMP_MCP_TIMEOUT_MS`，否则用服务器的 `timeout`，否则 `tools/call` 为 10 分钟（会提高到工具自身超时参数加 30 秒），其他为 30 秒；`0` 禁用。未配置超时时，每个进度通知会重新开始工具调用的截止时间，最长一小时。`onProgress` 添加 `_meta.progressToken`；进度只送达该请求的回调。中止或到达截止时间时，链路立即拒绝并发送 `notifications/cancelled`；预先已中止的请求绝不会写出。订阅只在得到确认之前有截止时间。

链路重新附加期间发出的请求会等待其完成。隧道丢失时，进行中的请求以不可重试方式失败（`failure: "closed"`）：它们可能已经运行。

## 请求 id \{#request-ids}

链路和各上游分配自己的 id。上游 id 默认是递增整数，Apple 的 `xcrun mcpbridge` 等服务器要求这种格式；`requestIdFormat: "string"` 会将服务器切换为雪花字符串。单元将各会话 id 映射到上游 id 并反向映射，因此不同会话的 id 在共享服务器上绝不会冲突；进度 token 和订阅 id 也以相同方式隔离。

## 时代检测 \{#era-detection}

`mcpUpstreams.probe` 在临时上游上检测服务器的时代，存储会记住结果。
握手时代判定会在 7 天后重新检查，以便升级后的服务器开始共享。
v1 到 v2 的缓存升级会清除旧时代判定一次，但保留缓存结果。

- **stdio**：探测先写入 `server/discover`，再写入 `initialize`。
  列出 `2026-07-28` 的发现结果或现代错误优先；任何其他发现响应都会回退到 `initialize`，其结果意味着握手时代。
  探测进程总会被终止。
- **http**：探测发送现代 `server/discover` POST。
  列出 `2026-07-28` 的发现结果或现代错误意味着现代协议；任何其他发现响应都会回退到旧版 `initialize`。无法识别的 JSON-RPC 回复或符合条件的 HTTP 状态（`400`、`404`、`405`）可以回退到旧版 `initialize`。
  列出握手时代修订版的不支持版本错误，在任何状态下都会回退。
  `401`/`403` 原样呈现，以便 OAuth 发现读取质询。
- **sse**：总是握手时代。

错误码 `-32020` 和 `-32021` 表示现代服务器。
不支持版本错误（`-32022`）也表示现代服务器，除非其 `data.supported` 显式列出兼容的握手时代修订版（`2025-11-25`、`2025-06-18`、`2025-03-26` 或 `2024-11-05`）。
缺失、格式错误或只包含未来版本的版本列表不会触发旧版握手。

如果现代单元的上游返回 `-32022`，宿主会使其现代判定过期，而不改动结果或更新的握手时代判定。
随后，链路会为该附加上每个遭拒请求重新探测一次，且只有探测确认属于握手时代后，才会重新连接到独立的握手时代单元。
每个遭拒请求在自身信号和剩余截止时间范围内等待重新探测，因此其调用方的下一个请求会发现链路已迁移。
随后该请求以原始错误失败；如果调用方在此期间取消，则以中止原因失败；绝不会自动重放。
重新探测属于链路：调用方停止等待既不会结束探测，也不会使链路脱离。

## 上游传输 \{#upstream-transports}

所有上游传输都实现 `MCPTransport`（`src/mcp/types.ts`），不施加自身的请求截止时间；它们遵循调用方的中止信号。

### stdio（`host/stdio-upstream.ts`） \{#stdio-hoststdio-upstreamts}

- 子进程是守护进程的 `ManagedChild`：拥有独立进程组，以及在守护进程重新执行后仍存活的原始管道文件描述符。命令、参数、cwd 和完整环境来自会话规格，绝不来自宿主自身环境。
- Windows：命令会解析为完整路径（先 cwd，再 `PATH` × `PATHEXT`；npm shim 直接通过 `node` 运行），并以普通参数生成进程；对批处理目标，会拒绝包含 NUL、CR 或 LF 的参数。
- 每行一条 JSON-RPC 消息。跳过非 JSON 行。保留 stderr 最后 4 KiB，并附加到退出和启动失败信息中。
- 已写出请求被中止时，会发送 `notifications/cancelled`。
- 关闭：关闭 stdin，1 秒后向进程组发送 SIGTERM，2 秒后发送 SIGKILL，然后在 POSIX 上对后代进程进行一次进程组 SIGKILL 扫尾。
- 进程死亡前已写出帧的请求以不可重试方式失败。

### Streamable HTTP（`host/http-upstream.ts`） \{#streamable-http-hosthttp-upstreamts}

现代模式：

- 仅 POST，`Accept: application/json, text/event-stream`。每个请求携带 `MCP-Protocol-Version`、`Mcp-Method`，对于 `tools/call`、`prompts/get` 和 `resources/read` 还携带 `Mcp-Name`；非纯 ASCII 值以 `=?base64?…?=` 发送。
- `Mcp-Param-*` 头遵循工具的 `x-mcp-header` 注解；注解无效的工具会从 `tools/list` 中丢弃。
- 响应为 JSON 或以响应结束的 SSE 流。`subscriptions/listen` 是一个保持流打开的 POST。关闭流即为取消。
- 没有会话 id、GET 流、DELETE 或 `Last-Event-ID`。

旧版模式（握手时代服务器）使用 2025-11-25 绑定：`Mcp-Session-Id`、在 `notifications/initialized` 后启动的可选 GET 监听器、从不重放 POST 的 `Last-Event-ID` 恢复，以及关闭时的 DELETE。

两种模式共通：生成的头以不区分大小写的方式优先于配置头；来源锁定的头会在跨来源重定向时被丢弃。非 OK 响应变为 `HTTP <status>: <text>`，并附上 `WWW-Authenticate` 和 `Mcp-Auth-Server` 提示。传输不刷新凭据：在 `401`/`403` 时，会话的刷新钩子解析新头，链路重新指向该身份，并重试请求一次。

### 旧版 HTTP+SSE（`host/sse-upstream.ts`） \{#legacy-httpsse-hostsse-upstreamts}

修订版 2024-11-05：对配置 URL 执行 GET，读取 `endpoint` 事件（要求同源），向该地址 POST JSON-RPC，并在流上接收响应。流丢失会使已接受请求以不可重试方式失败。

## 旧版适配器 \{#legacy-adapter}

对于握手时代服务器，对端执行 `initialize`（修订版 2025-11-25，根目录能力）和 `notifications/initialized`，然后进行转换：

| 现代请求 | 适配器的处理 |
| --- | --- |
| `server/discover` | 根据 `initialize` 结果构建 |
| 列表方法 | 转发；在结果中补齐 `resultType`、30 天的 `ttlMs`、`cacheScope: "private"`；`resources/templates/list` 返回 `-32601` 时视为空列表 |
| `tools/call`、`prompts/get`、`resources/read` | 转发时去掉仅现代协议使用的 `_meta` 和 MRTR 字段 |
| `subscriptions/listen` | 按服务器能力支持的内容确认；资源 URI 变为带引用计数的 `resources/subscribe`/`unsubscribe`；服务器通知路由到匹配的订阅 |

服务器请求在适配器中回答：`ping` 返回 `{}`，`roots/list` 返回会话根目录（`omp/roots`），其他任何请求返回 `-32601`。

## `json-rpc.ts` \{#json-rpcts}

`callMCP()` 和 `readMcpJsonRpcResponse()` 是 Exa 和网络搜索提供方使用的独立轻量 HTTP 辅助函数。它不受宿主管理，不管理会话，调用方未提供信号时应用 60 秒超时。

## 谁重试什么 \{#who-retries-what}

- **上游传输**：不重试。
- **宿主单元**：在下次请求时启动已停止或崩溃的服务器，受崩溃防护约束。
- **链路**：在 `401`/`403` 刷新凭据后重试一次。
- **工具桥接层**：对标记为可重试的失败进行一次重连和重试；可能已到达服务器的请求绝不重试。
