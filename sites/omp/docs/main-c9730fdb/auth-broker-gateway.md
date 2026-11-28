---
title: "认证代理与认证网关"
description: "Oh My Pi 官方仓库文档：认证代理与认证网关。"
---

# 认证代理与认证网关 \{#auth-broker-and-auth-gateway}

认证代理集中管理凭据存储和 OAuth 刷新。认证网关让客户端无需接收提供方凭据即可向提供方发送请求。直接连接代理的客户端是受信任的：快照会暴露 OAuth 访问令牌和已存储的 API 密钥，但绝不会暴露真正的 OAuth 刷新令牌。

- **`omp auth-broker serve`** 持有权威的 SQLite 凭据保险库，执行 OAuth 刷新，并在 `/v1` 下提供快照、凭据、封锁、用量和健康状态 API。
- **`omp auth-gateway serve`** 是正向代理。它接受 OpenAI Chat Completions、Anthropic Messages、OpenAI Responses、pi-native 流、TypeSafe System One 判断，以及 OpenAI/OpenRouter 风格的图像、语音、转写、嵌入、重排序和视频请求，解析代理支持的凭据，并通过 `pi-ai` 提供方逻辑派发。客户端（容器化 omp、llm-git、macOS 用量小组件等）绝不会看到访问令牌。
- **`omp auth-gateway stdio`** 使用 CLI 自身的凭据和模型角色，通过 stdin/stdout 上的 JSON 行向父进程提供相同路由；见 [stdio](#stdio)。

运维人员、代理与网关之间的传输安全由运维人员负责（Tailscale / Wireguard / 反向代理 + TLS）。除代理的 `/v1/healthz` 和网关的 `/healthz` 外，所有端点默认都要求 bearer 令牌。网关也会在无认证时响应 CORS `OPTIONS` 预检；`--no-auth` 会禁用网关入站认证。

来源：`packages/ai/src/auth-broker/`、`packages/ai/src/auth-gateway/`、`packages/ai/src/auth/`、`packages/coding-agent/src/cli/auth-broker-cli.ts`、`packages/coding-agent/src/cli/auth-gateway-cli.ts`、`packages/coding-agent/src/cli/auth-gateway-stdio.ts`、`packages/coding-agent/src/session/auth-broker-config.ts`。

## 数据流 \{#data-flow}

```
                ┌────────────────────────────────────────────────────────────┐
                │ broker host                                                │
                │                                                            │
  developer ──▶ │  ┌──────────────────────────┐    ┌────────────────────┐    │
  laptop /      │  │  omp auth-broker serve   │◀──▶│  SQLite agent.db    │    │
  CI / robomp   │  │  - holds refresh tokens  │    │  (canonical writer)│    │
                │  │  - background refresher  │    └────────────────────┘    │
                │  │  /v1/{snapshot,refresh,…}│                              │
                │  └─────────┬────────────────┘                              │
                │            │  bearer ($CONFIG_DIR/auth-broker.token)       │
                │            ▼                                               │
                │  ┌──────────────────────────┐                              │
                │  │  omp auth-gateway serve  │  RemoteAuthCredentialStore   │
                │  │  /v1/{chat,messages,…}   │  receives snapshot stream,   │
                │  │  /v1/usage,/v1/models    │  refreshes credentials by id │
                │  │  /v1/credentials/check   │  via the broker on expiry    │
                │  └─────────┬────────────────┘                              │
                └────────────┼───────────────────────────────────────────────┘
                             │  bearer ($CONFIG_DIR/auth-gateway.token)
                             ▼
                  gateway clients
                  (llm-git, macOS widget, robomp containers, IDE plugins, …)
                                │
                                ▼ provider request with broker-resolved credential
                  api.anthropic.com / api.openai.com / …
```

代理是 OAuth 刷新令牌的唯一写入者。客户端（包括网关本身）加载已脱敏快照，其中每个 `refresh` 字段都被替换为 `REMOTE_REFRESH_SENTINEL`；访问令牌过期时，客户端调用 `POST /v1/credential/:id/refresh`，由代理在服务端执行刷新。通过 `RemoteAuthCredentialStore` 写入凭据时，会等待代理完成持久化，并在返回前更新其本地快照；代理始终是权威写入者。

## auth-broker \{#auth-broker}

### CLI \{#cli}

```
omp auth-broker serve     [--bind=host:port] [--trust-proxy-headers]  # boot the broker
omp auth-broker token     [--regenerate] [--json]               # print or rotate the bearer token
omp auth-broker login     [<provider>] [--via=user@host] [--dry-run]
omp auth-broker logout    [<provider>]
omp auth-broker list      [--json]
omp auth-broker import    <file|dir> [--provider=<id>] [--include-disabled] [--dry-run] [--json]
omp auth-broker migrate   --from-local [--include-oauth] [--include-env] [--dry-run] [--json]
omp auth-broker status    [--json]
```

- `serve` 打开位于 `getAgentDbPath()` 的本地 SQLite 存储，并绑定 HTTP 监听器（默认为 `127.0.0.1:8765`）。启动时确保 `<config-dir>/auth-broker.token` 中存在令牌（权限模式为 `0600`，新建父目录为 `0700`）。后台刷新器会立即运行，之后每隔 `refreshIntervalMs`（默认 60 秒）运行一次，目标是距到期时间不超过 `refreshSkewMs`（默认 5 分钟）的 OAuth 凭据。
- 收到 SIGTERM 或 SIGINT 时，`serve` 停止监听，然后等待仍在进行中的刷新保存轮换后的令牌后以 0 退出，最多等待 125 秒。应给进程管理器设置超过该等待时间的停止超时（systemd 的 `TimeoutStopSec=130` 或更长）；等待期间强制终止会使存储留下已用过的刷新令牌。
- 日志将请求归属到套接字对端地址。位于可信反向代理之后时，传入 `--trust-proxy-headers`，可对已认证请求使用 `X-Forwarded-For` / `X-Real-IP`；未授权请求始终记录套接字对端地址，代理路由之外的路径则记录为 `<unrouted>`。
- `token` 打印已存储的 bearer 令牌，或生成新令牌。`--regenerate` 替换令牌文件；正在运行的代理需重启，才能将替代令牌加载到内存允许列表中。
- `login [<provider>]` 在本地运行已注册的登录流程（OAuth 或提供方的 API 密钥登录）。不指定提供方时，显示带编号的交互式选择器。`--via=user@host` 在远程主机上运行登录，并通过 SSH 转发回调端口；凭据保留在远程主机上。`--via` 要求指定提供方，`--dry-run` 会打印远程命令。默认端口：`anthropic:54545`、`openai-codex:1455`、`gitlab-duo:8080`、`devin:59653`、`openrouter:54549`、`stencil:54547`。对于 Anthropic，可在发起 SSH 的机器上设置 `PI_ANTHROPIC_OAUTH_CALLBACK_PORT`，以使用另一个固定端口；远程监听器使用转发后的端口。`gitlab-duo-agent` 和 `zai-coding-plan` 使用非回环或手动回调；应直接在主机上运行这些流程。
- `logout [<provider>]` 以原因 `logged out by user` 禁用该提供方的活跃行；已禁用的墓碑记录仍可通过代理 API 获取。不带参数时，显示已存储提供方的带编号交互式选择器。
- `list` 枚举 `getOAuthProviders()` 返回的登录提供方（可见的内置提供方加上 `registerOAuthProvider` 自定义提供方），而不是已存储的账户。`--json` 输出 `{ id, name }` 数组。
- `import <file|dir>` 将 CLIProxyAPI 风格的 JSON 凭据导入本地 SQLite 存储。将 `type` 字段映射到 omp 提供方（`claude → anthropic`、`codex → openai-codex`）。
- `migrate --from-local` 将本地 SQLite 凭据上传到已配置的代理（`POST /v1/credential`）。默认包含本地 API 密钥；除非设置 `--include-oauth`，否则跳过本地 OAuth 行；除非设置 `--include-env`，否则跳过源于环境变量的 API 密钥。重复运行相对于代理快照具有幂等性。
- `status` 对已配置的远程代理进行健康探测。

### 端点 \{#endpoints}

| 方法 | 路径 | 认证 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/v1/healthz` | 无 | 存活状态与版本 |
| `GET` | `/v1/snapshot` | bearer | 已脱敏快照（刷新令牌替换为哨兵值） |
| `GET` | `/v1/snapshot/stream` | bearer | 带增量事件和保活的 SSE 快照流 |
| `POST` | `/v1/credential` | bearer | 更新或插入一个 OAuth 或 API 密钥凭据 |
| `POST` | `/v1/credential/:id/refresh` | bearer | 强制刷新一个 OAuth 凭据 |
| `POST` | `/v1/credential/:id/disable` | bearer | 禁用一个凭据并记录原因 |
| `GET` | `/v1/credentials/disabled` | bearer | 列出已禁用凭据；可选 `provider` 查询筛选器 |
| `POST` | `/v1/credential/:id/block` | bearer | 更新或插入提供方或作用域的速率限制封锁 |
| `DELETE` | `/v1/credential/:id/block` | bearer | 删除由请求体中的 `providerKey` 和 `blockScope` 指定的一个封锁 |
| `DELETE` | `/v1/credential/:id/blocks` | bearer | 删除某凭据的所有速率限制封锁 |
| `GET` | `/v1/usage` | bearer | 当前 `UsageReport[]`；可选 `provider` 查询筛选器 |
| `GET` | `/v1/usage/history` | bearer | 持久化用量历史；可选 `sinceMs` 和 `provider` 筛选器 |
| `POST` | `/v1/usage/observed` | bearer | 记录代理客户端观测到的用量 |
| `GET` | `/v1/usage/clients` | bearer | 汇总可选 `sinceMs` 以来客户端观测到的用量 |
| `POST` | `/v1/usage/stale` | bearer | 使代理用量缓存失效；可选 `provider` 作用域 |

请求使用 `Authorization: Bearer <token>`。服务器与内存令牌允许列表进行比较；网关的实现使用时序安全比较。

快照包含 `generation`、`generatedAt`、`serverNowMs`、`refresher`（`enabled`、`intervalMs`、`skewMs`、`nextSweepInMs`）和 `credentials`。每个凭据携带其 ID、提供方、已脱敏凭据、`identityKey`、`rotatesInMs` 以及可选的速率限制 `blocks`。

SSE 流以完整的 `snapshot` 事件开始，后续是表示变更的 `entry` 事件和表示删除或禁用的 `removed` 事件。SSE 事件名称也会以 JSON `kind` 出现；增量携带 `generation`、`serverNowMs` 和 `refresher`，以及 `entry` 或被移除的 `id`。保活消息是 SSE 注释，不是 JSON 事件。

直接调用 `POST /v1/credential/:id/refresh` 会强制刷新。`?reason=auth-recovery` 形式可能复用代理在此前五分钟内签发、且仍可使用的令牌，以避免上游故障期间反复重新签发。

#### 条件快照长轮询 \{#conditional-snapshot-long-polling}

`GET /v1/snapshot?wait=<ms>` 支持基于代数的条件轮询。在 `If-None-Match` 中发送先前响应的代数。代理接受非负整数代数，格式可以是裸标签、`"42"` 这样的带引号标签，或 `W/"42"` 这样的带引号弱标签。

`wait` 会解析为数字，截断为整数毫秒，并限制在 0-30,000 毫秒范围内；缺失或非数字值按 `0` 处理。响应状态机如下：

- 如果标签缺失或无效、与当前代数不同，或 `wait <= 0`，立即以 `200` 返回当前已脱敏快照。
- 如果标签匹配且 `wait > 0`，等待代数变化。变化时以 `200` 返回新快照；等待到期且未变化时返回空的 `304`；调用方断开连接时返回空的 `499`。

每个 `200`、`304` 和 `499` 快照响应都携带带引号的代数 `ETag`，以及 `Cache-Control: no-store` 和 `Vary: OMP-Auth-Broker-Capabilities`。断开连接响应使用等待前捕获的代数。

### Codex 封锁作用域兼容性 \{#codex-block-scope-compatibility}

理解按计量项划分 Codex 封锁的客户端会发送 `OMP-Auth-Broker-Capabilities: codex-meter-block-scopes`。快照响应随后会携带规范的 `chat` 和 `spark` 作用域。没有该能力时，代理会在传输中将这些行投影到旧版 `shared` 作用域。

本地 SQLite 模式 8 保留 `chat` 和 `spark`，作为当前存储 API 暴露的规范作用域。它还为直接读取 `agent.db` 的计量项引入前的二进制程序维护一个物理 `shared` 兼容镜像。SQLite 触发器从计量项行中分别推导该镜像的截止时间和更新时间，并将旧版进程对 `shared` 的写入复制回两个计量项。当前存储 API 省略该物理镜像，因此代理快照和模型选择不会重复计算它。

在此能力推出前发布的客户端（包括 17.1.4）在升级前会收到保守的 `shared` 投影。在现有传输格式上无法区分这些客户端，因此混合版本部署优先让受速率限制的凭据保持封锁，而不是允许重复向提供方请求并收到 429 响应。

依赖能力的响应包含 `Vary: OMP-Auth-Broker-Capabilities`，避免中间层将一种表示复用于另一个客户端。加密客户端快照缓存也使用新的格式版本：旧缓存文件会被忽略并重新获取，以防不同客户端版本间混用旧版表示和按计量项划分作用域的表示。

### 后台刷新器 \{#background-refresher}

`AuthBrokerRefresher` 在每次扫描前重新加载活跃凭据，扫描不会重叠。手动刷新和后台刷新共用 `OAuthRefresher` 中按凭据划分的单次并发机制；SQLite 刷新租约还会协调跨进程写入者。

- **确定性失败**由 `isDefinitiveOAuthFailure()` 分类，只禁用失败的那个凭据版本。比较并设置的持久化机制会保护由并发登录或刷新轮换的凭据；刷新器记录结果，而不会再次禁用该行。
- **暂时性失败**（例如网络超时）保留凭据，供下次扫描使用。当访问令牌的有效期超过下次扫描时间时，以 `debug` 级别记录；一旦它会在下次重试前过期，则以 `warn` 级别记录，因此持续刷新失败的登录会在失效前后都显现出来。

CLI 代理刷新钩子也会使用已存储的 MCP 令牌端点和客户端元数据，处理受管理的 `mcp_oauth:*` 凭据；它无需加载 MCP 管理器。

## auth-gateway \{#auth-gateway}

### CLI \{#cli-1}

```
omp auth-gateway serve   [--bind=host:port] [--no-auth] [--trust-proxy-headers] [--clients=<file>]
omp auth-gateway stdio
omp auth-gateway token   [--regenerate] [--json]
omp auth-gateway status  [--json]
omp auth-gateway check   [--strict] [--json]
```

- `serve` 要求设置 `OMP_AUTH_BROKER_URL`（或 `config.yml` 中的 `auth.broker.url`），因为网关本身就是代理客户端。它获取实时快照，将其包装在 `RemoteAuthCredentialStore` 中，并使用已配置的账户池和账户策略构造 `AuthStorage`。与正常客户端发现不同，网关启动不使用加密快照缓存。默认绑定为 `127.0.0.1:4000`。网关令牌存储在 `<config-dir>/auth-gateway.token`（`0600`）；`--no-auth` 完全禁用 bearer 检查。仅应在可信回环监听器上使用此标志；它不强制绑定回环地址。
- 日志将请求归属到套接字对端地址。位于可信反向代理之后时，传入 `--trust-proxy-headers`，可对已认证请求使用 `X-Forwarded-For` / `X-Real-IP`；未授权请求始终记录套接字对端地址。如果已认证请求还在其 URL、转发标头、日志记录标头或身份标头中携带网关令牌或自身的客户端令牌，则会在任何凭据查找之前以 `400` 拒绝。每条 `auth-gateway request` 日志行都携带请求开始时使用的代理 `credentialId`，对于[客户端令牌](#client-tokens)还携带 `client`。
- `token` 管理令牌文件；使用 `--regenerate` 后，正在运行的网关需要重启才能接受替代令牌。`status` 检查本地令牌文件和已认证的代理快照；它不探测网关监听器。
- `check` 构造自己的代理支持存储，并探测网关将使用的凭据，不调用正在运行的网关。不使用 `--strict` 时，它使用提供方用量探测。`--strict` 还会尝试合适的内置聊天模型，可能消耗配额；没有合适候选模型的提供方（包括 pi-native 转发、Bedrock、Vertex 和 Cursor 传输）无法进行补全探测。

### 客户端令牌 \{#client-tokens}

`serve --clients=<file>` 除网关令牌外还允许其他 bearer 令牌，每个令牌的限制由网关自身执行。该文件将每个客户端名称映射到其令牌摘要和限制：

```json
{
	"ci": {
		"tokenSha256": "<hex SHA-256 of the client's token>",
		"models": ["anthropic/claude-sonnet-4-5", "openai-codex/*"],
		"accounts": {
			"anthropic": ["email:ci@example.com|org:org-team"],
			"openai-codex": ["email:ci@example.com|org:ws-team"]
		}
	}
}
```

- `tokenSha256` 是客户端作为 `Authorization: Bearer <token>` 发送的令牌的十六进制 SHA-256（`printf %s "$TOKEN" | shasum -a 256`）；文件绝不保存原始令牌。两个客户端共用同一摘要，或摘要与网关令牌相同，都会被拒绝。
- `models` 列出精确的 `provider/id` 授权或 `provider/*`。缺失时允许所有提供服务的模型；`[]` 不允许任何模型。列表之外的模型会在任何凭据查找之前返回 `404 Unknown model`，`GET /v1/models` 也只列出已授权模型。裸 ID 解析为该客户端可调用、具有该 ID 且排名最高的已提供模型；带提供方限定的 ID 绝不会被重新解释为另一提供方的裸 ID。
- `accounts` 将提供方映射到向该提供方发出的请求可使用的 OAuth 身份键（即[账户池](#client-account-pools)的 `identityKey` 值，可用 `omp usage accounts` 列出）。选择、刷新、用量限制封锁和认证恢复轮换都限定在列表内，绝不使用已存储、运行时或环境变量 API 密钥；请求宁可失败，也不会借用其他账户。空列表不允许任何账户。存在 `accounts` 时，它同时也是提供方允许列表：它省略的提供方会像 `models` 之外的模型一样被拒绝，因此无法通过另一提供方绕过绑定。若 `models` 授权了 `accounts` 省略的提供方，会拒绝该文件；提供方 ID 前后带空白也会如此。没有 `accounts` 时，每个提供方都按网关令牌的方式解析凭据。
- 一个客户端的各段对话对每个列出的提供方共用一个固定账户：列出多个账户时，该客户端流量会留在其中一个账户上，直到用量限制封锁或认证恢复使其转移，而不是将各段对话分散到这些账户。它们绝不会与另一客户端或网关令牌流量共用保留的提供方状态（学到的回退方式、Codex 传输会话）。
- `/v1/usage` 和 `/v1/credentials/check` 涵盖网关持有的每个账户，因此客户端令牌在这些端点会收到 `403`。
- 聊天路由保留客户端令牌对模型提出的要求（采样、输出限制、推理、工具选择、提示缓存身份），而丢弃那些说明请求来自谁、由谁付费或网关如何连接提供方的信息：请求标头，包括 pi-native 的 `options.headers` 以及网关令牌会透传的标头（`anthropic-beta`、`anthropic-user-profile-id`、OpenAI 组织和项目、`chatgpt-account-id`、`x-stainless-*` 等），再加上 `userProfileId`、`initiatorOverride`、`metadata`、`requestMetadata`、`serviceTier`、`cacheRetention`、重试和流超时，以及 `packages/ai/src/auth-gateway/caller-options.ts` 中其余 `gateway` 层级选项。提供方请求只携带提供方客户端为绑定账户设置的标头。响应仍遵循客户端请求：其 `anthropic-beta` 仍会选择它所请求的 `/v1/messages` 流字段。
- 网关令牌仍然有效，且不受作用域限制。`--clients` 不能与 `--no-auth` 结合使用。
- 未知字段或格式错误的条目会导致整个文件被拒绝；`serve` 会因此无法启动。服务期间，每 10 秒重新读取文件：令牌被移除或更改后，从下一次请求起被拒绝；已在进行中的请求则使用获准时的模型和账户完成，包括重试。条目变更会开始新的账户固定绑定。文件无法读取或解析时，所有客户端令牌都会被拒绝，直到文件修复；修复后，每个客户端都开始新的账户固定绑定。应原子替换该文件（先写临时文件，再重命名以覆盖原文件），避免重新加载时读到只写了一半的文件。

### stdio \{#stdio}

`omp auth-gateway stdio` 是供一个可信父进程（编辑器、终端中的 git 界面、脚本）使用的网关：没有监听器，没有令牌，也不要求代理。它使用与其他 `omp` 命令相同的凭据、模型（包括 `models.yml` 和扩展提供方）与设置：配置了代理时使用代理，否则使用本地存储。请求和响应采用 JSON 行格式：

```
→ {"id": 1, "path": "/v1/chat/completions", "body": {"model": "@commit,@smol", "messages": [...]}}
← {"ready": true, "version": "18.4.11"}
← {"id": 1, "status": 200, "body": {"object": "chat.completion", "choices": [...]}}
```

- 首个输出行是 `{"ready": true, "version": …}`。请求有 `body` 时，`method` 默认为 `POST`，否则为 `GET`；提供[端点](#endpoints-1)中除 `/healthz` 之外的所有路由。
- 请求并发运行，按完成顺序响应；`id`（字符串或数字）用于建立对应关系。不是请求的行会返回 `400`，如果带有 ID，则在响应中携带其 `id`。
- JSON 响应体以 JSON 嵌入；文本响应体（`stream: true` 请求的 SSE）在流结束后作为一个字符串返回；其他内容（音频、视频）以 base64 返回，并带有 `"encoding": "base64"`。
- `model` 接受与 `--model` 相同的选择器：精确的 `provider/id`、模糊名称、角色（`@smol`）和逗号列表。第一个成功解析的逗号条目生效；`modelRoles` 未设置的角色会像 `--model` 一样解析为其内置默认值。某次尝试的状态大于 `400` 且不为 `499` 时，会转到下一个回退项，而回退项只来自配置的 `retry.fallbackChains`：角色使用自己的条目（即使 `modelRoles` 没有设置该角色），否则聊天角色继承 `default` 链；角色的内置优先级列表绝不会增加回退项，因此重试无法转到你未选择的模型。空角色链（`[]`）禁用这些回退项。更具体的按模型键指定的链和通配链保持其优先级，回退模型也可有自己的链。响应中的 `model` 指明实际回答的模型。
- 进程持续提供服务，直到 stdin 结束；它会响应仍在进行中的请求，然后退出。

### 端点 \{#endpoints-1}

| 方法 | 路径 | 认证 | 用途 |
| --- | --- | --- | --- |
| `GET` | `/healthz` | 无 | 存活状态与版本 |
| `GET` | `/v1/usage` | bearer | 聚合 `UsageReport[]`（通过 `AuthStorage` 代理） |
| `GET` | `/v1/models` | bearer | 按具有凭据的提供方筛选的注册表目录 |
| `GET` | `/v1/pi/models` | bearer | 以 omp 模型规格形式提供的 `/v1/models` 目录（限制、思考级别、价格）；pi-native 客户端从中加载提供方模型列表 |
| `GET` | `/v1/credentials/check` | bearer | 按凭据进行认证健康探测 |
| `POST` | `/v1/chat/completions` | bearer | OpenAI Chat Completions 传输格式 |
| `POST` | `/v1/messages` | bearer | Anthropic Messages 传输格式 |
| `POST` | `/v1/responses` | bearer | OpenAI Responses 传输格式 |
| `POST` | `/v1/pi/stream` | bearer | 原生 `pi-ai` 流传输格式 |
| `POST` | `/v1/systemone` | bearer | TypeSafe System One 判断（`judge` 模型，例如 `typesafe/jev-latest`）；`/alpha/decisions` 是 OpenRouter Decisions 别名 |
| `POST` | `/v1/images/generations` | bearer | 图像生成，OpenAI Images JSON 传输格式；`/v1/images` 是 OpenRouter 别名（`image` 模型） |
| `POST` | `/v1/images/edits` | bearer | 图像编辑：OpenAI multipart 或 OpenRouter JSON 输入图像 |
| `POST` | `/v1/audio/speech` | bearer | 文本转语音，OpenAI/OpenRouter JSON 传输格式；返回原始音频字节（`tts` 模型：`xai-tts`、`openai-speech`） |
| `POST` | `/v1/audio/transcriptions` | bearer | 语音转文本，OpenAI multipart `file` 或 OpenRouter JSON `input_audio` base64（`openai-transcriptions`/`xai-stt` 上的 `stt` 模型；上限 25 MiB）。`xai-stt` 模型对 `prompt` 和 `temperature` 返回 400 拒绝 |
| `POST` | `/v1/embeddings` | bearer | 嵌入，OpenAI 传输格式（`openai-embeddings` 上的 `embedding` 模型；OpenAI + OpenRouter；上限 8 MiB） |
| `POST` | `/v1/rerank` | bearer | 重排序，OpenRouter 传输格式（`openrouter-rerank` 上的 `rerank` 模型） |
| `POST` | `/v1/videos` | bearer | 提交视频生成任务，OpenRouter 传输格式（`openrouter-video` 上的 `video` 模型）；返回 `202`，并附带网关重写的轮询和内容 URL |
| `GET` | `/v1/videos/:id` | bearer | 轮询视频任务。`:id` 由网关签发且无状态：编码了提供方、模型和上游任务 ID |
| `GET` | `/v1/videos/:id/content` | bearer | 使用上游内容类型流式传输已完成的视频字节 |

对于 `POST /v1/systemone`，TypeSafe 模型接受 TypeSafe 的内联 `assets` 形式（仅限 `data_base64`；multipart `part` 资源会被拒绝），且每个资源都必须在 `state`、`instructions` 或 `criteria` 中被引用；其他原生 API 对该形式返回 `422`。现有的 `images` 字段仍可供兼容后端使用，仅接受内联数据，例如 `images: [{type:'image',data:'<base64>',mimeType:'image/png',detail:'high'}]`；不支持文件路径。图像数据必须是非空标准 base64，填充有效且尾随位规范；可以省略填充。可选的 `detail` 必须为 `auto`、`low`、`high` 或 `original`。无效图像字段，或向不支持图像输入的 judge 模型发送图像，都会在提供方凭据查找或任何上游请求之前返回 `422`；图像绝不会被静默丢弃。

发送给 `POST /v1/images/generations`（及其 `/v1/images` 别名）和 `POST /v1/images/edits` 的图像输入，必须包含非空的规范 base64 数据（可以省略填充）和语法有效的图像 MIME 类型。Data-URL 输入拒绝包含 `#` 的 MIME 类型，因为数据 URL 无法承载它；multipart 文件类型可以包含它，但以数据 URL 接收图像的提供方会拒绝这类输入。网关 bearer 认证通过后，格式错误的输入会在提供方凭据查找或刷新之前返回 `400 invalid_request_error`。支持的图像格式仍由各提供方决定。

对于外部传输格式，模型 ID 从顶层 `model` 字段读取；对于 `/v1/pi/stream`，则从 pi-native 请求体读取。它可以带提供方限定（`typesafe/jev-latest`），也可以是裸 ID（`jev-latest`）。网关根据提供服务的目录解析它。该目录涵盖网关有路由的每种类型（`chat`、`judge`、`image`、`tts`、`stt`、`embedding`、`rerank`、`video`）的所有注册表模型，并限定为代理持有凭据的提供方。随后网关解析入站传输格式，从代理支持的 `AuthStorage` 解析提供方凭据，通过匹配的 `pi-ai` 客户端派发（聊天使用 `streamSimple()`；判断使用 `NativeJudge`，并转换成已解析模型自己的判断 API，例如 OpenAI Decisions；各模态路由使用 `generateImage` / `synthesizeSpeech` / `transcribeAudio` / `embed` / `rerank` / `submitVideo`），再将结果重新编码为入站格式（流式聊天响应用 SSE）。

聊天路由对非聊天模型返回 `400` 拒绝，并指明应改用的路由（`Model typesafe/jev-latest is a judge model; use POST /v1/systemone`）。`GET /v1/models` 为这类行标注 `kind`（`judge` | `image` | `tts` | `stt` | `embedding` | `rerank` | `video`）；缺失表示聊天。

提供服务的目录包括内置模型、缓存模型和代理发现的模型。网关忽略宿主的 `models.yml` 覆盖和自定义模型，因此本地基础 URL、标头和密钥无法重定向代理支持的流量。列在网关有效设置的 `disabledProviders` 中的提供方（与提供 `auth.accountPolicies` 的是同一份 `config.yml`）不会被发现、公布或路由；`serve` 将其账户排除在 `/v1/usage` 和 `/v1/credentials/check` 之外，`check` 跳过其凭据。网关每 15 分钟重建目录，每 10 秒检查凭据变更；凭据变更会强制进行在线发现。带提供方限定的 ID 不存在歧义。多个持有凭据的提供方提供同一裸 ID 时，会选择优先级最高的提供方：先按 `modelProviderOrder`，再按内置顺序，将原生账户（`openai-codex`、`anthropic`、`openai` 等）排在聚合商和编辑器或代理提供方之前。排名相同的提供方中，优先选择使用该路由自身传输格式的模型（`/v1/messages` 对应 `anthropic-messages`，`/v1/chat/completions` 对应 `openai-completions`，`/v1/responses` 对应 `openai-responses`），然后按提供方 ID 排序。目录刷新绝不会改变这一选择。模型列表行还包含 `api`、`display_name`、`input_modalities`、可用的 `context_length`/`max_output_tokens`，并且只有目录明确声明不支持工具时才带 `supports_tools: false`。

实时 OpenRouter 发现涵盖图像和 Decisions 模型列表、`/embeddings/models`、`/videos/models`，以及标有 rerank 的 `/models` 行。语音和转写模型使用目录类型和种子数据。内置回退项和 `kind-apis` 运行器映射编写在 `packages/catalog/src/compat/rules/providers/openrouter.kdl` 中。目录没有按搜索次数、秒数和字符数计费的成本维度，因此这些行的令牌成本为零，响应中提供方报告的 `cost` 才是权威值。

推理路由根据 `x-omp-install-id`、`x-omp-hostname` 和 `x-omp-app` 记录观测用量；未标注的请求回退到网关宿主身份。这些归属标头不会转发到上游。完成的非流式响应会在已知成本时，通过 `x-litellm-response-cost` 携带计算出的成本；流式聊天响应在用量到达前就发送标头，因此不包含该成本标头。视频成本可能直到轮询时才可用。对于只报告令牌数的上游（TypeSafe），按目录模型定价；响应体自身的 `cost` 字段（OpenRouter 形状）只有在上游实际计费时才存在。

使用默认基础 URL 解析器的 TypeSafe 客户端，可设置 `TYPESAFE_BASE_URL=http://gateway:4000` 和 `TYPESAFE_API_KEY=<gateway token>`。omp 由目录支持的 `judge` 角色传入模型的显式 `baseUrl`，其优先级高于该环境变量回退；要使用网关，请在 `models.yml` 中配置 TypeSafe 提供方的 `baseUrl` 和 `apiKey`。OpenAI SDK 风格客户端使用 `http://gateway:4000/v1`。

没有原始提供方透传路径。所有支持的路由都通过 `pi-ai` 提供方逻辑，以便集中处理凭据专属请求整形、认证错误时的 OAuth 刷新，以及提供方特性。

底层 `Bun.serve` 的 `idleTimeout` 设为 `255 s`，避免思考预算较长的调用被 Bun 默认空闲超时终止。

## 用量缓存：服务端 5 分钟抖动与客户端 15 秒单次并发 \{#usage-cache-server-side-5-min-jitter--client-side-15-s-single-flight}

提供方用量有两层缓存。在代理上，`GET /v1/usage?provider=anthropic` 只获取该提供方的凭据；省略 `provider` 则返回完整聚合结果。客户端也可复用现有的聚合获取，如下所述。

### 服务端缓存（代理 `AuthStorage`） \{#server-side-cache-broker-authstorage}

`AuthStorage` 在代理的 SQLite 存储中缓存每个凭据成功获取的 `UsageReport`，**TTL 为 5 分钟，抖动为 ±25 %**，以错开上游探测。缓存的有效值会从最后一次成功获取（`fetchedAt`）起保留 24 小时。获取失败时，提供方通常保留最近一次有效报告，并应用短暂且带抖动的冷却期（默认 10 秒）；提供方可覆盖此策略。反复失败绝不会延长这 24 小时窗口：超出后，账户不报告用量，直到某次获取成功。确定性的认证失败（用量提供方抛出 401/403）会清除过期用量，显式失效也不会重放已失效的最近有效数据。

常量：`packages/ai/src/auth/sqlite-credential-store.ts` 中的 `USAGE_REPORT_TTL_MS = 5 * 60_000`；`packages/ai/src/auth/usage-cache.ts` 中的 `USAGE_LAST_GOOD_RETENTION_MS = 24 * 60 * 60_000` 和 `USAGE_FAILURE_BACKOFF_MS = 10_000`。获取策略位于 `packages/ai/src/auth/usage.ts`。

### 客户端单次并发（`RemoteAuthCredentialStore`） \{#client-side-single-flight-remoteauthcredentialstore}

`RemoteAuthCredentialStore` 按提供方合并并发用量调用，并将每个结果在内存中缓存 **15 秒**。`getUsageReport(provider, credential)` 只请求该提供方；不限定作用域的 `fetchUsageReports()` 请求完整聚合结果。新鲜或正在获取中的聚合结果可以服务于提供方查找，但仅针对提供方的结果绝不会替代聚合结果。

- `USAGE_CACHE_TTL_MS = 15_000`（`packages/ai/src/auth-broker/remote-store.ts`）。
- 同一作用域内的调用共用一个正在进行中的 promise；每个调用方的 `AbortSignal` 与它进行**竞速**，而不是传入其中，因此一个调用方的中止绝不会取消其他调用方的请求。
- 获取失败时，会记录错误，并在该作用域中将 `null` 缓存 15 秒，避免后续调用方立即重试失败的代理。按凭据查找仍可使用新鲜的客户端观测标头覆盖值。
- 新鲜的提供方响应标头提示会覆盖到匹配报告上，最长持续 15 秒。

客户端窗口短于代理按凭据划分的缓存窗口。旧版代理会忽略 `provider`；客户端能正确筛选其响应，但要避免无关提供方造成的延迟，需要升级代理。

会话启动时调用 `authStorage.keys.prefetchUsage(provider, sessionId, options)`，让所需的用量读取与工具及上下文加载重叠进行。它使用选择器的资格规则，但不选择账户、不推进轮询顺序，也不建立会话固定绑定；正常的请求时选择仍具有权威性。

## 客户端快照缓存 \{#client-snapshot-cache}

`discoverAuthStorage()` 委托给 `packages/ai/src/auth-broker/discover.ts`，默认将初始实时快照和后续来自代理的完整快照持久化到 `~/.omp/cache/auth-broker-snapshot.enc`。该文件使用解析出的代理 bearer 令牌（无论来自环境变量、配置还是文件）的 SHA-256 进行 AES-256-GCM 加密，并使用代理 URL 和缓存格式元数据进行认证。更改令牌或 URL 会使缓存无法读取。写入是原子的，权限模式为 `0600`。

新鲜度以 `snapshot.generatedAt` 为基准，而不是本地写入时间。默认 TTL 为 1 小时（`OMP_AUTH_BROKER_SNAPSHOT_TTL_MS`）；`0` 禁用缓存读写。新鲜缓存会立即使用，不执行阻塞式重新验证，也不受启动请求预算约束。之后 `RemoteAuthCredentialStore` 在后台通过 SSE 或长轮询同步，因此不保证一次性命令能观测到缓存写入之后的变更。代理令牌被撤销会通过该后台路径显现，不一定导致使用缓存的启动失败。过期的 OAuth 访问令牌仍需要代理刷新端点。

如果启动时代理不可用，但存在新鲜缓存，启动会使用缓存成功完成。如果缓存缺失、过期、损坏、不兼容、为另一 URL 写入，或使用另一令牌加密，启动就需要实时快照。交互式 omp 在该获取失败时立即失败。其他所有宿主（CLI 和打印模式命令，以及 SDK `discoverAuthStorage`，除非设置了 `retryUnreachableBroker: false`）都会对连接失败（包括响应中途断开）、超时或 5xx/408/429 响应执行退避重试（从 0.5 秒倍增到 8 秒），最多持续 30 秒，因此代理重启或短暂网络故障不会使运行失败；其他任何响应，例如令牌被撤销导致的 401 或格式错误的快照，都会立即失败。第一次重试时，CLI 向 stderr 打印 `Waiting for auth broker at <url> …`；SDK 宿主通过 `onBrokerRetry` 收到每次重试通知。会话期间通过设置切换代理时不重试：第一次失败会保留当前存储。启动绝不会静默改为打开本地凭据存储。

<a id="client-account-pools-routing-not-authorization"></a>

## 客户端账户池 \{#client-account-pools}

代理客户端可将 `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE` 设为 JSON 文件，以限制它们可见的代理凭据。每个键是提供方 ID（或 `"*"`，见下文）；每个值是该提供方凭据的规则：

```json
{
	"anthropic": ["email:alice@example.com|org:org-team"],
	"openai-codex": []
}
```

数组列出代理快照协议中的精确 `identityKey` 值。`identityKey` 是每个已认证 `/v1/snapshot` 凭据条目已经携带、不含令牌的身份字段。运维工具应只投影 `provider` 和 `identityKey`；不得保留或打印随附的凭据载荷。专门的账户列表 CLI 有意不属于此路由功能的范围。

| 值 | 可见的 OAuth 账户 | 可见的 API 密钥 |
| --- | --- | --- |
| `["id", …]` | 只显示身份精确匹配的账户，包括组织或工作区限定；`[]` 隐藏全部 | 是 |
| `true` | 全部 | 是 |
| `false` | 无 | 否 |
| `{ "accounts"?: ["id", …], "apiKeys"?: boolean }` | `accounts` 与数组形式相同；省略表示全部 | `apiKeys`；省略表示是 |

没有自身键的提供方遵循 `"*"` 规则；没有 `"*"` 键时不受限制。`"*": false` 将文件变为允许列表：只有列出的提供方可见，OAuth 和 API 密钥均如此。例如，以下配置只暴露一个 Codex 账户和 OpenRouter API 密钥，不暴露其他内容：

```json
{
	"*": false,
	"openai-codex": { "accounts": ["account:acct-123"], "apiKeys": false },
	"openrouter": true
}
```

SDK 宿主可在 `discoverAuthStorage()` 或 `RemoteAuthCredentialStore` 中通过 `accountPool` 提供相同规则（以提供方或 `"*"` 为键，值为身份 `Set`，或 `{ accounts?: Set, apiKeys?: boolean }`）。显式的程序化账户池优先于环境变量指定的文件。

代理支持的认证存储启动时，会解析该文件一次。文件不可读、JSON 格式错误或条目无效时，会中止初始化，而不是静默扩大账户池。完整快照、SSE 更新、刷新响应和聚合用量都会一致地进行筛选。对于 OAuth 账户或 API 密钥受限的提供方，只有聚合报告可归属于可见 OAuth 身份时才返回；只能归属于 API 密钥或缺少匹配身份元数据的报告会按封闭失败原则处理。加密快照缓存仍保留原始代理快照，以便共用该缓存的可信进程应用不同账户池。

账户池应用的位置决定其保护范围：

- **直接连接代理的客户端：**一种**可信客户端路由策略，不是授权边界**。客户端持有代理 bearer 令牌，在应用本地视图前会收到原始代理响应，也能直接调用代理端点。
- **`omp auth-gateway serve` 的客户端：**账户池在网关进程内运行，网关客户端只持有网关令牌。账户池隐藏的凭据不在网关的凭据视图中，因此网关路由无法列出、使用或报告它们。对这些客户端而言，只要它们无法读取网关宿主的环境变量、账户池文件或代理令牌，账户池就是有效边界。

需要阻止持有代理令牌的进程获取其他凭据时，应使用服务端代理授权，而不是账户池。

### 按智能体和会话划分的账户池 \{#per-agent-and-per-session-pools}

进程级账户池决定客户端可见哪些账户；会话账户池使用相同的身份键，进一步缩小某个会话的范围，`omp usage accounts` 会列出进程可见的每个 OAuth 账户的这些身份键（带组织名称，不含令牌）。可设置 `task.agentAccountPools`，按精确名称为任务智能体指定账户池（[设置](./settings.md#providers-and-services)）；也可向 `createAgentSession()` 传入 `oauthAccountPools`，或直接调用 `authStorage.sessions.restrict(provider, sessionId, identityKeys)`。对于每个列出的提供方，会话只使用其列表内可见的 OAuth 账户认证：选择、固定绑定、回退遍历、轮换以及已保存重置的恢复都限定在该列表内；绝不使用已存储、运行时或环境变量 API 密钥；没有账户可提供服务时，请求宁可失败，也不会借用其他账户。配置密钥（`models.yml` 的 `apiKey`，通常用于代理 `baseUrl`）也会使账户池受限请求失败，因此不会向该端点发送任何池内 OAuth 令牌。空列表不允许任何账户。无论账户是否在池内，仍会对每个账户即将到期的已保存重置进行挽救，因为挽救服务于持有该重置的账户。使用 `oauthAccountPools` 创建的会话，会在通过其模型注册表进行的每次密钥查找上强制应用账户池，无论该查找携带哪个提供方会话 ID（标题生成、技能压缩、顾问，以及它启动且没有自身条目的子代理）；没有会话 ID 的查找会以该会话自身的 ID 解析。会话释放时会解除其账户池；若运行超过释放截止时间，则在该运行结束后解除。直接调用 `restrict` 的调用方，在会话结束后，将 `restrict` 返回的租约传给 `authStorage.sessions.unrestrict(provider, sessionId, lease)`；租约绝不会解除此后在同一会话上安装的限制。`authStorage.sessions.permits(provider, sessionId, credentialId)` 告知某个已存储账户是否可为会话提供服务。会话账户池与客户端账户池一样，是可信客户端路由策略，而非授权边界。

## 代理不提供服务的登录 \{#logins-the-broker-does-not-serve}

代理可能存储了某个登录，却将其排除在所有快照之外，例如该代理版本暂停了相应提供方。仅使用代理的客户端会报告登录已保存，却在下次快照或重启时丢失它。代理客户端会检测这种情况：每次上传后都会重新读取快照，如果该提供方的行一条也没有返回（`AuthBrokerUnservedProviderError`），则改为将登录保存在本机的 `agent.db` 中，并在其中记录该提供方。此后，该机器上每个进程都在本地读取、刷新和注销该提供方的登录；代理中该提供方的行会被忽略。注销该提供方最后一个本地登录后，会清除这条记录，所以下次登录会再次尝试代理（例如代理升级后）。本地保留的登录在客户端进程内刷新，不使用跨进程刷新租约，也不通过代理报告用量。

## 运维人员选择启用 \{#operator-opt-in}

除非设置了 `OMP_AUTH_BROKER_URL`（或智能体 `config.yml`/`config.yaml` 中的 `auth.broker.url`），否则代理支持的凭据存储处于**关闭**状态。SDK 发现通过 `packages/coding-agent/src/session/auth-broker-config.ts` 委托给共享的 `pi-ai` 解析器，并选择 `RemoteAuthCredentialStore`（位于 `HybridAuthCredentialStore` 内）而不是本地 SQLite。运行时、配置和环境变量密钥覆盖仍参与正常的凭据优先级阶梯；选择代理存储并不会使这些密钥变为远程密钥。

### 环境变量 \{#environment-variables}

| 变量 | 用途 | 何时需要 |
| --- | --- | --- |
| `OMP_AUTH_BROKER_URL` | 远程 auth-broker 的基础 URL（例如 `https://broker.tailnet:8765`）。选择它会使客户端进入代理模式，本地 SQLite 只保存[代理不提供服务的登录](#logins-the-broker-does-not-serve)。 | 只要 omp 客户端应通过代理解析凭据就需要（`omp auth-gateway serve` 也要求它）。 |
| `OMP_AUTH_BROKER_TOKEN` | 用于除 `/v1/healthz` 之外所有代理端点的 bearer 令牌。 | 已设置 `OMP_AUTH_BROKER_URL`，且无法从 `auth.broker.token` 或 `<config-dir>/auth-broker.token` 获取令牌时。 |
| `OMP_AUTH_BROKER_SNAPSHOT_TTL_MS` | 本地加密快照缓存的新鲜度窗口。默认 `3600000`（1 小时）；`0` 禁用缓存读写。 | 代理模式下可选。 |
| `OMP_AUTH_BROKER_SNAPSHOT_CACHE` | 本地加密快照缓存的路径覆盖。默认 `~/.omp/cache/auth-broker-snapshot.enc`（或对应的 XDG 缓存位置）。 | 代理模式下可选。 |
| `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE` | 为代理凭据定义各提供方可见性规则的 JSON 文件（OAuth `identityKey` 列表、API 密钥开关，以及未列出提供方的 `"*"` 默认规则）。解析一次；无效文件会中止初始化。 | 代理模式下可选。 |

`resolveAuthBrokerConfig()` 中的解析顺序：

1. `OMP_AUTH_BROKER_URL` 环境变量（否则使用 `config.yml` 中的 `auth.broker.url`，通过 `resolveConfigValue` 解析）；
2. `OMP_AUTH_BROKER_TOKEN` 环境变量（否则使用 `config.yml` 中的 `auth.broker.token`，再否则使用 `<config-dir>/auth-broker.token`）；
3. 已设置 URL 但无法解析令牌 → 硬错误，指向令牌文件路径。

网关使用相同的代理 URL 和令牌解析方式，以及相同的账户池环境变量文件。其 `serve`/`check` 命令直接获取实时快照，因此客户端快照缓存路径和 TTL 变量不影响这些命令。

### `config.yml` 键 \{#configyml-keys}

| 键 | 默认值 | 用途 |
| --- | --- | --- |
| `auth.broker.url` | 未设置 | 与 `OMP_AUTH_BROKER_URL` 相同；环境变量优先。在设置界面中隐藏。值可以解析为字面量、环境变量名称，或 `!<shell command>`，后者使用去掉首尾空白的 stdout。 |
| `auth.broker.token` | 未设置 | 与 `OMP_AUTH_BROKER_TOKEN` 相同；环境变量优先。值按相同方式解析。 |
| `auth.accountPolicies` | `[]` | 按账户划分的 OAuth 路由规则：`provider`、身份选择器 `account`（`email`、`accountId`、`projectId`、可选 `orgId`）、可选 `priority`、`reservePct`（0-100）和 `reclaimAbovePct`。设置 `reclaimAbovePct`（高于账户的有效保留比例，最多 100）后，一旦该账户剩余配额达到此比例，自动固定到较低优先级账户的会话会在下次请求时移回；显式选择的账户绝不会移动。 |
| `retry.usageReservePct` | `10` | 账户没有 `reservePct` 覆盖时，默认受保护的剩余配额百分比。 |

代理连接值来自智能体的主配置文件，而非项目设置。账户策略和保留比例使用有效设置（包括项目和显式配置层）。长时间运行的 SDK 会话跟随策略变更，并可在有效代理设置变化时原地替换凭据存储；变更失败会让当前存储保持活跃。

#### 会话选择与保持账户的方式 \{#how-sessions-choose-and-keep-an-account}

提供方有账户策略时，OMP 每次选择或重新考虑账户时都会对其账户排序（不是每次请求：已就绪的显式固定绑定或唯一账户会跳过排序）。按顺序，账户会因被封锁（触及限制）、不在所需套餐内、超出可续期额度或进入保留区而落选；然后优先选择 5 小时窗口尚未使用的 Codex 账户，5 小时窗口已使用至少 85% 的账户靠后，之后 `priority` 越高越优先。同一优先级内，有用量报告的账户优于无法获取报告的账户。仍然并列时，选择配额若不用就会最早过期的账户。因此，`priority` 对健康账户排序，也包括用量报告暂时缺失的账户；它不会覆盖封锁、保留比例或排在它之前的其他检查。保留比例、已用额度和高使用率窗口检查需要用量报告，因此账户没有报告时，待报告恢复后会再次受这些检查约束；无论有无报告，封锁都适用。

该排序为**新**会话选择账号。运行中的会话会记住上次使用的账号（即其固定账号），并在固定状态仍然有效时继续使用它，从而保持提供方的提示词缓存和已签名推理有效：

- Anthropic 的固定状态在一小时未发出请求后失效；其他提供方的固定状态无限期有效。固定状态失效或账号被阻止时会重新排序。
- 自动固定状态有效时，会从状态不佳的账号切走：当固定账号进入其预留额度范围，而另一个账号测得仍在自身预留额度范围之外时，或当其额度耗尽，而未被阻止的同组账号仍有额度时。
- 自动固定状态有效时，仅通过 `reclaimAbovePct` 切回已恢复的账号：排序下一步会选中的同组账号，其 `priority` 高于固定账号，且剩余额度至少达到其 `reclaimAbovePct`。每次请求都会根据提供方为所请求模型计算的配额检查这一条件（对于 Anthropic，是共享窗口加上该模型系列自身的窗口），所依据的用量报告约每五分钟刷新一次；用量获取失败期间，沿用上一次成功的报告。未设置 `reclaimAbovePct` 时，新会话使用已恢复的账号，运行中的会话则保持原账号，直到上述某种情况发生。
- 用户为会话明确选择的账号不会因排序、预留额度或回收而切换。在账号被阻止、令牌刷新失败或未通过必需的套餐检查时，仍会跳过该账号；会话随后回退到同组账号。
- 固定账号随会话保存。恢复的会话会还原其固定账号及原始的最后使用时间，子代理启动时使用父智能体的固定账号。在同一会话中重新激活已停放的子代理时，其保存的固定账号优先于父智能体的自动亲和选择；父智能体明确固定的账号仍然优先，但受子代理账号池的限制。

### 令牌文件 \{#token-files}

| 路径 | 所有者 | 模式 |
| --- | --- | --- |
| `<config-dir>/auth-broker.token` | `omp auth-broker token` 或 `serve` | `0600`；新建父目录为 `0700` |
| `<config-dir>/auth-gateway.token` | `omp auth-gateway token` 或 `serve`（在 `--no-auth` 下 serve 会跳过它） | `0600`；新建父目录为 `0700` |

`<config-dir>` 是 `getConfigRootDir()`：默认为 `~/.omp/`，遵循 `PI_CONFIG_DIR` 和当前配置档案（默认配置档案布局为 `~/.omp/profiles/<name>/`）。创建令牌不会收紧已存在父目录的权限。

## 与本地 API 密钥解析顺序的交互 \{#interaction-with-the-local-api-key-resolution-order}

代理管理写在其主机上或通过其 API 上传的凭据。[models.md](./models.md) 中的标准凭据优先级保持不变：

- `AuthStorage.keys.setConfig()` / `.removeConfig()` / `.clearConfig()` 管理配置密钥。显式的 `models.yml` `apiKey` 优先于已存储的 OAuth，**但不会**覆盖 `--api-key`；`setConfig(..., { fallback: true })` 则将默认密钥引用排在已存储的 OAuth 和 `/login` 密钥之后。网关有意忽略本地模型配置覆盖。

## 另请参阅 \{#see-also}

- [`secrets.md`](./secrets.md)：针对_确实_泄露出来的令牌进行秘密信息混淆（例如 shell 输出中的 `OMP_AUTH_BROKER_TOKEN`）。
- [`models.md`](./models.md)：提供方身份验证解析顺序；代理提供已存储凭据层。
- [`environment-variables.md`](./environment-variables.md)：完整的环境变量参考，包括 `OMP_AUTH_BROKER_URL` / `OMP_AUTH_BROKER_TOKEN`。
