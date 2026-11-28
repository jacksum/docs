---
title: "MCP 运行时生命周期"
description: "Oh My Pi 官方仓库文档：MCP 运行时生命周期。"
---

# MCP 运行时生命周期 \{#mcp-runtime-lifecycle}

MCP 服务器如何被发现、托管、在会话间共享、作为工具暴露以及停止。

## 生命周期概览 \{#lifecycle-at-a-glance}

1. **发现**（`loadAllMCPConfigs`）从能力来源解析服务器配置，并筛除已禁用、项目级、Exa 和浏览器条目。
2. **连接**（`MCPManager.connectServers`）：会话为每个服务器解析凭据，向 **MCP 宿主**查询服务器所属的协议时代，将隧道附加到服务器的宿主单元，并通过隧道读取 `server/discover` 和 `tools/list`。
3. **宿主**（`src/mcp/host/`，由守护进程的 `mcp` 模块或进程内提供服务）：拥有每个服务器进程和远程连接。它从共享存储回答发现和列表请求，只有请求需要服务器时才启动它。
4. **启动窗口**：`connectServers` 最多等待 `mcp.startupTimeoutMs`（250 毫秒）。已响应的服务器贡献工具；其余服务器准备好后再合并进来。
5. **运行中的会话**：列表变化以隧道通知形式到达；`/mcp reload` 重新发现；`/mcp reconnect <name>` 重启单个服务器。
6. **清理**：关闭链路会释放会话对该单元的租约。无人持有的单元和进程由宿主停止。

会话从不生成 MCP 服务器、不打开到服务器的 HTTP 连接，也不执行 `initialize` 握手。它只使用 MCP 2026-07-28 与宿主通信。

## 会话侧 \{#session-side}

### 发现与启动 \{#discovery-and-startup}

当 `enableMCP` 为 true 且工具名称未受限制时，`createAgentSession()`（`src/sdk.ts`）会启动 MCP。若提供了 `mcpManager`，则直接复用而不进行发现。否则：

- **无界面/SDK**：等待 `discoverAndLoadMCPTools()`。随后打印模式会在首个提示前等待每个已配置服务器列出工具或失败，受 `OMP_MCP_TIMEOUT_MS` 限制（默认 30 秒；`0` 无限期等待）；`OMP_MCP_REQUIRE_READY=1` 会以退出码 1 退出，而不是发出警告。
- **交互式**（`hasUI: true`）：立即构造 `MCPManager` 并在后台运行 `discoverAndConnect()`。第一轮最多为此等待 1.5 秒。

绑定进程状态的会话在整个生命周期内持有 `holdSharedMcp(mcp.shared)`；该持有状态决定链路附加到守护进程还是进程内宿主。不持有时（嵌入方、测试、`omp read`）使用进程内宿主。

发现失败会被隔离：配置发现异常产生空工具集和一个合成的 `.mcp.json` 错误；单个服务器失败会在 `errors` 映射中产生条目，其他服务器继续运行。

### 连接流水线 \{#connect-pipeline}

对于每个服务器，`connectServers()` 会：

1. 验证配置（`validateServerConfig`），
2. 解析 OAuth 凭据和 `!command`/环境变量值（`#resolveAuthConfig`），
3. 构建 `McpServerSpec`（`buildServerSpec`）：绝对 cwd、声明的环境变量、完整的生成进程环境，或 URL 与最终的头，
4. `connectToServer()`：创建 `HostLink`，解析服务器所属时代、附加到其单元并发送其根目录；然后通过 `server/discover` 获取能力、服务器信息和指令，
5. 执行 `listTools()`，然后在后台获取资源、模板和提示，
6. 打开一个列表变化订阅；启用 `mcp.notifications` 时会打开资源订阅。

发现和列表请求携带 `stale-ok` 提示，因此宿主已知的服务器无需进程即可在启动窗口内响应。过时条目会立即返回，并由宿主重新验证；存在差异时通过列表变化通知送达。宿主从未见过的服务器会先被探测，耗时取决于服务器启动所需时间。

会话中没有延迟或缓存的工具句柄：启动窗口结束时尚未响应的服务器，在响应之前不会贡献任何工具，响应后则通过管理器的工具变化回调注册。

### 管理器状态 \{#manager-state}

`MCPManager` 保留连接、待完成连接、按稳定名称顺序排列的工具、来源元数据、未解析配置（以便重连时重新解析凭据）、监听器、各会话的工具作用域、跟踪的资源订阅，以及各服务器最新的上游状态。每个管理器拥有一个实例 id，随每次附加发送；它用于标识管理器为握手时代服务器持有的私有单元。

`getConnectionStatus(name)` 在链路当前附加上的发现和 `tools/list` 成功后报告 `connected`，在连接、重连或重新附加期间报告 `connecting`，其他情况下报告 `disconnected`；`waitForStartup` 和打印模式就绪判断使用相同测试，因此即使先前工具仍保持注册，重载失败的服务器也不会被计为已就绪。`getServerRuntime(name)` 返回宿主视角（`McpUpstreamStatus`）：时代、`idle`/`starting`/`running`/`failed`、pid、已附加会话数量以及上次退出情况。`/mcp list` 会显示这些内容。

### 工具调用 \{#tool-calls}

`MCPTool` 通过连接的链路调用。截止时间、基于进度的截止时间延长和中止由链路负责；中止或到达截止时间时，它发送 `notifications/cancelled`。宿主标记为可重试的失败（请求从未到达服务器）会在重连后重试一次；可能已到达服务器的请求绝不重放。工具结果中的身份验证质询可触发身份验证处理器和一次重试。

### 重连 \{#reconnect}

会话中没有逐级重连、崩溃熔断器或后台重试计划；重启服务器是宿主的工作。

- `reconnectServer(name, { manual })` 重新解析凭据。如果凭据变化，链路重新指向新身份。手动重连（`/mcp reconnect`）还会发送 `omp/restart`，停止上游并清除宿主的崩溃防护；自动恢复从不重启上游，因为现代服务器与其他会话共享。随后重新加载发现结果和目录。
- 隧道丢失时（守护进程重启），链路将进行中的请求以不可重试方式置为失败，重新附加、重新发送根目录，管理器重新打开订阅并重载目录。
- 远程服务器返回 401/403（包括首次时代探测中的响应）时，会调用管理器的刷新钩子一次；新的头使链路重新指向新身份，并重试请求一次。旧身份的资源订阅不会重放；管理器从重载的目录中重新推导它们。
- 会话已过期的握手时代 HTTP 服务器返回 404：宿主废弃该会话，重试的调用打开新会话。
- `/mcp test`、OAuth 发现探测及其他一次性连接传入 `live: true`，发送 `no-store` 提示，以便每次响应都来自服务器，而非存储。

### 通知 \{#notifications}

管理器在收到相应列表变化通知时刷新工具、资源或提示，为已订阅 URI 转发 `notifications/resources/updated`，并将每个通知扇出给监听器（`addNotificationListener`），在首个监听器附加前最多缓冲 100 条。

### 重载与 cwd 变化 \{#reload-and-cwd-changes}

`/mcp reload` 运行 `disconnectAll()`、清除提示命令、重新发现并重新绑定工具。工作目录变化会调用 `setCwd()`，重新指向项目配置发现位置，在每个链路上重新发送根目录并重连，因为 stdio 服务器的身份包含其工作目录。

## 宿主侧 \{#host-side}

### 单元与时代 \{#units-and-eras}

一个宿主单元（`McpEndpoint`）对应一个上游服务器。共享方式遵循服务器的协议时代，宿主会探测一次并记录：

- **现代**（响应 `server/discover`）：按规范无状态。每个身份一个单元，服务所有会话，将其请求多路复用到一个进程或来源。
- **握手时代**（需要 `initialize`；包括 `sse`）：服务器保有会话。每个管理器获得以其实例 id 为键的独立单元，宿主的旧版适配器持有 `initialize` 会话，并将其呈现为现代端点。

身份（`mcpIdentity`）：对于 stdio，包括命令、参数、工作目录、声明的 `env`，以及名称看起来像凭据或账户选择器的每个继承变量；对于远程服务器，包括 URL 和所有头。因此，刷新后的 token 对应另一个单元。

### 单元做什么 \{#what-a-unit-does}

- **多路复用**：请求 id、进度 token 和订阅 id 按链路隔离；链路的 `_meta`（修订版、能力、客户端信息）原样到达服务器。
- **存储**：`server/discover`、四种列表方法和 `resources/read` 的结果保存在所有单元共享的 sqlite 存储中，遵循 `ttlMs` 和 `cacheScope`。不声明 TTL 的握手时代结果保留 30 天，并在服务器运行时进行协调。
- **延迟启动**：打开单元不会启动任何内容。上游在存储无法回答的首个请求到来时启动。
- **新鲜度**：每次启动后、超过 TTL 的 `stale-ok` 命中时，以及收到上游列表变化通知时，宿主都会重新获取数据，并通知订阅该列表的每个会话。
- **订阅**：服务器运行时，单元持有一个上游列表变化订阅并进行扇出；会话的列表变化订阅从不启动服务器。资源订阅会被转发，并使服务器保持运行。
- **崩溃防护**：在 30 秒内启动失败或意外退出达到 5 次后，单元会在 30 秒内拒绝启动，并以最近的错误使请求失败；`omp/restart` 会清除该防护。

### 生命周期与垃圾回收 \{#lifetime-and-garbage-collection}

| 资源 | 结束条件 |
| --- | --- |
| 会话对单元的租约 | 链路关闭，或会话进程死亡（租约绑定到守护进程连接） |
| 单元 | 无人持有租约持续 `mcp.idleStopMinutes`（现代），或立即结束（握手时代）；守护进程关闭 |
| 现代服务器进程 | 其单元停止，或连续 `mcp.idleStopMinutes` 没有进行中的请求且没有资源订阅；下次请求会再次启动它 |
| 握手时代服务器进程 | 其单元停止，即管理器断开连接或死亡；或者迄今只服务过列表和读取（尚无会话状态），且空闲持续 `mcp.idleStopMinutes` |
| 上游请求 | 得到响应，或其链路取消或断开连接 |
| 探测进程 | 总是在探测返回前结束 |
| 已存储结果 | 重新获取时替换、列表变化时失效、30 天未读取后丢弃 |

子进程单元及其管道会在守护进程重新执行后继续存活；会话随后重新附加。

### 宿主在哪里运行 \{#where-the-host-runs}

共享持有状态开启且守护进程公布该模块时，`mcpHostAccess()` 选择守护进程的 `mcp` 模块；否则，或发生任何错误时，进程内宿主（`LocalMcpHost`）会在会话内运行同样的单元，只在该进程的管理器之间共享，并随最后一个租约的结束而停止。

## 失败模式 \{#failure-modes}

| 场景 | 行为 |
| --- | --- |
| 配置发现抛出异常 | 空工具集加一个合成的 `.mcp.json` 错误；会话启动 |
| 服务器配置无效 | 跳过该服务器并附验证错误 |
| 服务器无法启动或连接 | 为该服务器记录错误；状态为 `failed`，带退出码和 stderr 尾部；其他服务器继续 |
| 服务器慢于启动窗口 | 启动时没有工具；响应后注册 |
| 服务器在有进行中请求时退出 | 这些请求失败（不可重试），带退出码和 stderr；下次请求启动新进程 |
| 服务器反复崩溃 | 崩溃防护：30 秒内请求立即失败；`/mcp reconnect` 清除防护 |
| 守护进程重启 | 链路重新附加；进行中的请求失败且不重放 |
| 守护进程不可达 | 使用进程内宿主 |
| 所属会话被释放 | 其管理器断开连接（最多 3 秒）；租约释放，宿主回收未使用的内容 |

## 实现文件 \{#implementation-files}

- [`src/mcp/manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/manager.ts)：连接流程、目录、工具作用域、重连、状态。
- [`src/mcp/client.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/client.ts)：MCP 2026-07-28 操作：发现、列表、带输入轮次的调用、订阅。
- [`src/mcp/link.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/link.ts)：`HostLink`：隧道、截止时间、取消、重新附加、身份验证重定向。
- [`src/mcp/protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/protocol.ts)：修订版常量、`_meta` 键、结果类型。
- [`src/mcp/host/contract.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/contract.ts)：服务器规格、身份、单元键和策略、隧道扩展、宿主错误。
- [`src/mcp/host/endpoint.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/endpoint.ts)：单元：多路复用、存储、延迟启动、崩溃防护、订阅。
- [`src/mcp/host/peers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/peers.ts)：现代对端、旧版适配器、时代探测。
- [`src/mcp/host/store.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/store.ts)：时代记录和缓存结果。
- [`src/mcp/host/local.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/local.ts)、[`access.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/access.ts)：进程内宿主与宿主选择。
- [`src/daemon/modules/mcp.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/daemon/modules/mcp.ts)：守护进程模块。
- [`src/mcp/tool-bridge.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/tool-bridge.ts)：`MCPTool`。
- [`src/mcp/loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/loader.ts)、[`src/sdk.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/sdk.ts)：启动接线。
