# MCP 服务器 \{#mcp-servers}

Pi 通过 stdio 或可流式传输的 HTTP 连接[模型上下文协议](https://modelcontextprotocol.io)服务器，让模型可以使用这些服务器提供的工具和资源。

## 快速配置 \{#quick-setup}

添加一个本地 stdio 服务器，检查连接，然后启动 Pi：

```bash
pi mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem .
pi mcp list
pi
```

添加远程服务器时，请使用以下命令：

```bash
pi mcp add docs --url https://example.com/mcp --bearer-token-env-var DOCS_TOKEN
pi mcp list
```

这些命令默认添加用户级服务器。要改为写入项目配置，请加上 `--local` 或 `-l`：

```bash
pi mcp add -l tools --env API_KEY='${TOOLS_KEY}' -- uvx tools-mcp
```

在交互式会话中，使用 `/mcp` 查看连接、登录、重新连接、更改暴露方式，或启用和禁用服务器。在会话外添加、移除或更改服务器后，请运行 `/reload`。

## 配置服务器 \{#configure-servers}

Pi 从 `~/.pi/agent/mcp.json` 读取用户级服务器配置，从 `.pi/mcp.json` 读取项目级服务器配置。只有在[信任项目](./security.md#understand-project-trust)后，Pi 才会读取项目配置。项目级条目会替换同名的用户级条目。

如果项目级条目没有指定 `command`、`url` 或 `type`，它只覆盖同名用户级服务器的 `enabled`、`exposure` 和 `toolExposure`，保留其余设置，包括 `env`、`headers` 和 `auth`。例如，以下配置只在一个项目中禁用某个用户级服务器：

```json
{
  "mcpServers": {
    "internal-tools": { "enabled": false }
  }
}
```

配置格式与其他 MCP 客户端一致：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    },
    "docs": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${DOCS_TOKEN}" },
      "description": "Search and read the product documentation"
    }
  }
}
```

stdio 服务器使用 `command`、`args`、`env` 和 `cwd`。`cwd` 的相对路径以会话目录为基准解析。`command`、命令参数或 `cwd` 开头的 `~/` 指向用户主目录。

HTTP 服务器使用 `url`、`headers` 和 `oauth`（参阅[使用 OAuth 进行身份验证](#authenticate-with-oauth)）。Pi 不支持旧版 SSE 传输方式。

两种服务器都支持以下设置：

- `timeout`：单个请求的超时时间，以秒为单位，默认为 60。收到进度通知时重新计时。
- `enabled: false`：保留配置条目，但不连接该服务器。
- `exposure` 和 `toolExposure`：控制模型访问工具的方式（参阅[控制工具暴露方式](#control-tool-exposure)）。
- `description`：用一句话说明服务器提供的功能。系统提示词用这段描述列出服务器（参阅[控制工具暴露方式](#control-tool-exposure)），工具搜索据此为该服务器的工具排序，codemode 的 `describeNamespace()` 也会返回这段描述。如果未设置，服务器连接后会改用其说明的第一行。

个人服务器和带凭据的服务器应放在用户级配置文件中。只有在受信任的项目中，才应使用项目级配置文件，且只配置该项目所需的服务器。

### 配置规则 \{#configuration-rules}

- 服务器名只能包含字母、数字、`_` 和 `-`。工具命名为 `mcp__<server>__<tool>`，其中字母、数字和 `_` 之外的字符都替换为 `_`。如果同一服务器的工具名称因此冲突，所有冲突名称都会加上哈希后缀。仅在 `-` 和 `_` 上有区别的名称视为同一服务器：Pi 会拒绝第二个服务器，且 `mcp.json` 中配置的服务器会覆盖已注册的服务器。
- `type` 可省略。指定 `command` 时使用 stdio，指定 `url` 时使用可流式传输的 HTTP。指定 `type` 时，其值必须为 `stdio`、`http` 或 `streamable-http`。
- Pi 拒绝 `sse`。在文档中列出 SSE 端点的服务器通常也提供可流式传输的 HTTP，端点一般是 `/mcp` 而非 `/sse`。
- `command` 只能指定一个可执行文件，不能填写 shell 命令字符串。`args` 存放传给该程序的参数。
- `env` 和 `headers` 的值可以使用 `${GITHUB_TOKEN}` 等环境变量，也可以通过 `!command` 运行命令。使用命令时，它必须占据整个值，例如 `"Authorization": "!echo Bearer $(gh auth token)"`。
- Pi 会报告并跳过无效条目，不影响其他服务器连接。

在 shell 中，可使用 `pi mcp add` 和 `pi mcp remove` 进行常见更改。有关选项，请参阅 [MCP 命令](./cli.md#mcp-commands)。

### 查看或更改服务器 \{#inspect-or-change-a-server}

`/mcp` 列出已配置的服务器及其状态、工具数量、暴露方式和配置来源。需要处理的服务器排在最前面。选中服务器后，可以查看其工具和连接详情、重新连接、登录或退出登录、更改暴露方式，或启用和禁用服务器。

更改暴露方式或启用状态时，Pi 会写入定义该服务器的文件，并保留无关内容。在受信任的项目中，选择“在此项目中启用”（Enable in this project）或“在此项目中禁用”（Disable in this project）会为用户级服务器添加项目级覆盖。此后对该服务器的更改会保存到该覆盖条目。禁用的服务器仍会列在列表中。在交互式终端界面之外，`/mcp` 会输出服务器状态；`/mcp login <server>`、`/mcp logout <server>` 和 `/mcp reconnect <server>` 会直接执行相应操作。

无需启动会话即可运行以下 shell 命令：`pi mcp add`、`pi mcp remove`、`pi mcp list`、`pi mcp login` 和 `pi mcp logout`。这些 shell 命令不会加载扩展。

### 诊断连接问题 \{#diagnose-connection-problems}

运行 `pi mcp list` 可连接所有已启用的服务器，并输出状态、工具和错误信息。如果有条目无效，或有已启用的服务器未连接，命令会以状态码 1 退出。`/mcp` 会显示完整的连接错误，以及连接失败的 stdio 服务器的 stderr 末尾内容。

Pi 在启动后会报告一次配置错误、连接失败和待登录的服务器。服务器发送的日志通知会按 `<time> [<server>] <level> <logger>: <message>` 格式追加到 `~/.pi/agent/mcp.log`。文件大小超过 5 MB 后会移至 `mcp.log.1`。

会话启动时，Pi 会在后台连接所有已启用的服务器。服务器连接后，其工具就会出现。`codemode` 的描述不会列出这些工具，因此不会随服务器连接而变化。处理首条提示词时，Pi 只等待提供 `direct` 工具的服务器，最多等待 10 秒。这些工具必须在该提示词对应的请求中声明。其他服务器会按需等待：codemode 脚本会等待脚本中指定的服务器（`mcp__<server>`）；调用 `searchTools()` 或读取 `ALL_TOOLS` 时，则会等待所有服务器。`tool_search` 和资源工具也会等待所有服务器。遇到 HTTP 网络错误或临时状态码（408、429 和 5xx）时，Pi 会重试两次。连接中断时，服务器会显示为已断开，并在下一次调用时重新连接。服务器通知 Pi 工具列表有变更时，Pi 会添加新工具，已撤回的工具则无法再访问。

停止 stdio 服务器时，Pi 会关闭其 stdin，发送 SIGTERM，然后向其进程组发送 SIGKILL。这也会停止通过 `npx` 或 `uvx` 等封装程序启动的服务器。

## 从其他客户端迁移配置 \{#migrate-configuration-from-another-client}

将转换后的条目放到 `mcp.json` 的 `mcpServers` 下，然后运行 `pi mcp list` 验证。

| 客户端 | 转换方法 |
|---|---|
| Claude Desktop、Claude Code 或 Cursor | 复制现有的 `mcpServers` 条目。 |
| VS Code | 从顶层 `servers` 对象移出一个条目，并将 `${input:...}` 提示替换为 `${NAME}` 环境变量。 |
| Codex | 将 TOML 的 `[mcp_servers.<name>]` 中的 `command`、`args`、`env` 和 `url` 等字段转换为 JSON。 |
| OpenCode | 将 `"type": "local"` 转换为 stdio 条目，把其中的 `command` 数组拆为 `command` 和 `args`，将 `environment` 改名为 `env`，并将 `{env:NAME}` 替换为 `${NAME}`。将 `"type": "remote"` 转换为 URL 条目。 |

## 使用 OAuth 进行身份验证 \{#authenticate-with-oauth}

对于 Sentry 等使用 OAuth 的远程服务器，无需在 `mcp.json` 中设置凭据：

```json
{
  "mcpServers": {
    "sentry": { "url": "https://mcp.sentry.dev/mcp" }
  }
}
```

如果服务器拒绝未经身份验证的连接，`/mcp` 会显示需要登录。选择“登录”（Sign in），或运行 `/mcp login sentry` 或 `pi mcp login sentry`。Pi 会打开授权页面并等待批准。如果浏览器运行在另一台机器上，例如通过 SSH 使用 Pi 时，请将浏览器重定向后的 URL 粘贴到登录界面。正在运行的会话会在下一轮使用新的凭据。

Pi 向授权服务器表明身份时，会使用客户端 ID 元数据文档（Client ID Metadata Document）或注册客户端。Pi 将令牌保存在 `~/.pi/agent/mcp-auth.json`，并在访问令牌过期或被服务器拒绝时刷新它。如果服务器之后请求额外的权限范围，Pi 会要求重新登录。退出登录会删除已保存的凭据。

凭据与服务器名称及 URL 绑定。URL 相同但名称不同的服务器需要分别登录，例如为每个账户分别配置一个服务器。不同 `mcp.json` 文件中名称和 URL 都相同的服务器共用一次登录。

OAuth 适用于没有 `Authorization` 标头的 HTTP 服务器。如果服务器不支持动态客户端注册，请配置已注册的客户端：

```json
{
  "mcpServers": {
    "example": {
      "url": "https://mcp.example.com/mcp",
      "oauth": { "clientId": "my-client", "clientSecret": "${EXAMPLE_SECRET}", "callbackPort": 8765 }
    }
  }
}
```

重定向 URI 必须与已注册的 URI 一致。`callbackPort` 使用 `http://127.0.0.1:<port>/callback`。要使用其他 URI，请设置 `callbackUrl`。该 URL 必须使用 HTTP，主机必须是 `localhost`、`127.0.0.1` 或 `[::1]`。Pi 会原样发送该 URL。如果 `callbackUrl` 未指定端口，Pi 会使用 `callbackPort` 或一个空闲端口，并将其加到 URI 中；RFC 8252 允许这样构造环回重定向。`clientSecret` 可省略，也可以使用环境变量或命令。

如果服务器未公布所需的权限范围，请将 `scope` 设为以空格分隔的列表。否则，Pi 会请求服务器公布的权限范围。之后请求的权限范围会追加到已配置的值中。

Pi 以 `pi` 为客户端名称注册。有些服务器只接受已知客户端的注册。设置 `clientName` 可发送其他名称：

```json
{
  "mcpServers": {
    "figma": { "url": "https://mcp.figma.com/mcp", "oauth": { "clientName": "Claude Code" } }
  }
}
```

Pi 只在注册客户端时发送这个名称。要用新名称重新注册，请先退出登录。

如果未设置 `clientId`，且授权服务器声明支持元数据文档和公共客户端，Pi 会使用 pi.dev 上的客户端 ID 元数据文档表明身份。否则，Pi 会动态注册客户端。只要此前注册的客户端的重定向 URI 仍然匹配，Pi 就会继续使用该客户端，直到你退出登录。使用元数据文档时，客户端 ID 为 `https://pi.dev/oauth/client.json`，重定向 URI 为 `http://127.0.0.1:<port>/callback`。如果授权服务器未在授权响应中发送 `iss` 参数（RFC 9207），Pi 会改用该 MCP 服务器专用的元数据文档和重定向路径：`https://pi.dev/oauth/<id>/client.json` 和 `http://127.0.0.1:<port>/callback/<id>`。

如果设置了 `clientName`，或 `callbackUrl` 不是 `localhost` 或 `127.0.0.1` 上的 `/callback`，Pi 会注册客户端。设置 `clientRegistration` 可选择方式：`auto`（默认）按上述规则选择，`dcr` 始终注册客户端，`cimd` 始终使用元数据文档。使用 `cimd` 时，如果授权服务器不支持公共客户端使用元数据文档，登录就会失败。如果授权页面显示客户端无效，请使用 `dcr`：

```json
{
  "mcpServers": {
    "example": { "url": "https://mcp.example.com/mcp", "oauth": { "clientRegistration": "dcr" } }
  }
}
```

添加服务器时，可使用 `pi mcp add --oauth-client-registration <mode>` 设置此选项。`cimd` 不能与 `clientId` 或 `clientName` 同时使用。使用 `cimd` 时，如果设置 `callbackUrl`，主机必须为 `localhost` 或 `127.0.0.1`，路径必须为 `/callback`。

Pi 通过 MCP 服务器的受保护资源元数据（RFC 9728）查找授权服务器，并检查授权服务器的元数据是否声明了预期的签发方（RFC 8414）。有些服务器公布了错误的授权服务器，或根本没有公布，导致登录时打开的页面不存在。请将 `authServerMetadataUrl` 设为正确的授权服务器元数据文档的 URL：

```json
{
  "mcpServers": {
    "example": {
      "url": "https://mcp.example.com/mcp",
      "oauth": { "authServerMetadataUrl": "https://example.okta.com/.well-known/openid-configuration" }
    }
  }
}
```

Pi 会跳过自动发现，直接信任并使用配置的文档，因此只应指向你信任的文档。URL 必须使用 HTTPS，`localhost`、`127.0.0.1` 和 `[::1]` 除外。

## 控制工具暴露方式 \{#control-tool-exposure}

服务器的每个工具都以 `mcp__<server>__<tool>` 的名称注册。服务器的 `exposure` 决定模型如何访问这些工具：

| 暴露方式 | 行为 | 典型用途 |
|---|---|---|
| `codemode`（默认） | [`codemode`](./cli.md#tools) 脚本可以调用该工具。Pi 不向模型声明该工具，也不在 codemode 的说明中列出它。脚本可通过 `searchTools()`、`describeTool()` 或 `ALL_TOOLS` 查找工具。 | 通用 MCP 服务器，尤其适合需要用脚本组合或筛选调用的场景。 |
| `deferred` | 只有在 [`tool_search`](./cli.md#tools) 加载匹配的工具后，才会在下一次模型调用中声明该工具。 | 工具较多的服务器，其工具适合在发现后直接调用。 |
| `direct` | 像内置工具一样向模型声明，也可由 codemode 脚本调用。 | 数量少、使用频繁的工具集。 |
| `hidden` | 工具已注册，但无法访问。 | 应保持不可用的服务器或工具。 |

`codemode-deferred` 可作为 `codemode` 的别名。

系统提示词的 `mcp_servers` 部分列出拥有 `codemode` 或 `deferred` 工具的服务器，并说明如何访问这些工具。每个服务器还附有一行说明：优先使用配置中的 `description`，否则在连接后使用服务器说明中的一行。Pi 开始处理提示词时，会先等待拥有 `direct` 工具的服务器，再更新这一部分。这一部分有变动时（例如服务器连接后可获取其摘要），Pi 会把更新后的内容追加到对话中，保持工具声明不变，使较早的消息仍可沿用缓存。`describeNamespace()` 和 `searchTools()` 的 `namespace` 选项接受 `mcp__dev-radius`、`mcp__dev_radius`、`dev-radius` 或 `dev_radius`。

采用 `codemode` 暴露方式的服务器连接后，Pi 会启用 `codemode`。对采用 `deferred` 暴露方式的服务器，Pi 会启用 `tool_search`。若要让模型无需搜索就能看到某个工具，请通过 `toolExposure` 将该工具的暴露方式设为 `direct`。

`toolExposure` 可为单个工具覆盖服务器级暴露方式。键可以是准确的服务器工具名称，也可以是匹配模式，其中 `*` 匹配任意字符。准确名称优先于模式；多个模式匹配时，以第一个为准。采用 `hidden` 暴露方式的服务器可以只暴露选定的工具：

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "exposure": "deferred",
      "toolExposure": {
        "search_code": "direct",
        "get_*": "codemode",
        "delete_*": "hidden"
      }
    }
  }
}
```

`pi mcp list` 会标出暴露方式与所属服务器不同的工具。`/mcp` 的工具（Tools）视图也会显示实际生效的暴露方式。

采用 `codemode` 或 `deferred` 暴露方式的工具可通过两种间接机制访问：codemode 脚本可以调用这些工具，`tool_search` 可以加载这些工具。codemode 调用不依赖已启用的工具集，因此在使用 `/tree` 导航、恢复会话或创建会话分支后仍可使用。Pi 会在对话记录中记下通过 `tool_search` 加载的工具，并在该分支上保留这些工具的声明。

除非列表项中有以 `mcp__` 开头的项，否则 `--tools` 不会移除 MCP 工具。`pi --tools read,codemode,'mcp__radius__*'` 只保留 `radius` 的 MCP 工具。`--exclude-tools` 接受相同的匹配模式，`--no-mcp` 则只在本次运行中禁用 MCP（参阅[工具](./cli.md#mcp-tools)）。

要在没有 MCP 服务器时仍启用 `codemode`，请在[设置](./settings.md#tools)中添加 `"defaultTools": ["+codemode"]`。要阻止 Pi 自动启用 codemode，请在 `mcpServers` 所在层级设置 `"autoEnableCodemode": false`。项目级设置覆盖用户级设置。当 `codemode` 和 `tool_search` 都未启用，且无法调用非直接暴露的工具时，Pi 会发出一次警告。

文本结果超过 20 KB 时，Pi 会省略中间的内容，在截断处加上 `…N chars truncated…` 标记，再发送给模型。Pi 会将完整文本保存到结果所指明的临时文件中。codemode 脚本收到完整结果，可以在向模型返回输出前精简内容。

codemode 脚本收到完整的 MCP `CallToolResult`，其中包含 `content`、`structuredContent` 和 `isError`。`isError` 表示出错时，脚本仍能收到结果；直接调用则会报告错误。`image(result.content[0])` 会转发一个图像块。工具描述不包含服务器说明。脚本可使用 `describeNamespace("mcp__<server>")` 读取说明，该方法还会返回服务器的工具名称。

## 使用资源 \{#use-resources}

连接的服务器提供[资源](https://modelcontextprotocol.io/specification/2025-11-25/server/resources)时，Pi 会添加 Codex 和 OpenCode 使用的资源工具：

- `list_mcp_resources` 以 JSON 列出资源：`{ server?, resources: [{ server, uri, name, ... }], nextCursor? }`。指定 `server` 时，列出该服务器的一页资源；使用 `cursor` 可继续读取下一页。不指定 `server` 时，列出所有服务器上的全部资源。
- `list_mcp_resource_templates` 列出服务器未直接列出的资源所用的 URI 模板。
- `read_mcp_resource` 按 `server` 和 `uri` 读取资源。模型按原类型收到文本或图像。Pi 将其他二进制资源保存到临时文件中，并将路径传给模型。脚本收到 `{ server, uri, contents }`。

这些工具可以访问所有已启用、未隐藏且提供资源的服务器。工具采用这些服务器中开放范围最广的暴露方式：`direct` 优先，其次是 `codemode` 或 `deferred`。工具结果中的资源链接会指明 `read_mcp_resource` 和对应的服务器。

Pi 不渲染 MCP 应用，因此会略过以 `ui://` URI 或 `text/html;profile=mcp-app` 标识的应用资源。Pi 也会略过资源图标。

读取或列出资源时，如果遇到暂时性 HTTP 错误（408、429 或 5xx），Pi 会重试一次。Pi 不重试工具调用，因为服务器可能已经执行了调用。

## 权限 \{#permissions}

所有 MCP 调用都经过 Pi 的工具处理流程，因此扩展的 `tool_call` 和 `tool_result` 处理器也适用于 MCP 工具，包括其中的权限检查。从 codemode 脚本发起的调用会以 `parentToolCallId` 携带 codemode 调用的 ID。

`pi.getAllTools()` 报告各服务器声明的注解：`readOnlyHint`、`destructiveHint`、`idempotentHint` 和 `openWorldHint`。权限扩展可以根据这些提示决定哪些调用需要确认（参阅[工具暴露方式](./extensions.md#tool-exposure)）。资源工具标记为只读。

## 扩展与 SDK \{#extensions-and-sdk}

### 从扩展添加服务器 \{#add-servers-from-extensions}

扩展可通过 `pi.registerMcpServer(name, config)` 为当前会话添加服务器。配置结构与 `mcpServers` 条目相同（参阅[扩展中的 MCP 服务器](./extensions.md#mcp-servers)）。通过扩展注册的服务器与通过配置添加的服务器采用相同的连接方式；`/mcp` 会列出这些服务器，并将对应的扩展标为来源。

对启用状态或暴露方式的修改只在当前会话中生效。如果配置文件中有同名服务器，则以文件中的配置为准，`/mcp` 会列出被覆盖的注册项。Shell 中的 `pi mcp` 命令不会加载扩展，只能访问配置文件中的服务器。

### 替换内置 MCP 支持 \{#replace-the-built-in-mcp-support}

如果安装了注册 `/mcp` 的扩展（如 `pi-mcp-adapter`），此扩展会替换会话中的内置 MCP 支持。Pi 不再在会话中读取 `mcp.json` 或连接其中的服务器，`/mcp` 改由该扩展提供。移除此扩展即可恢复内置行为。如果只想禁用内置 MCP 支持，不使用其他实现，请在 `pi config` 的内置（Built-in）分类中禁用 `mcp`，或在[设置](./settings.md#resources)中设为 `"extensions": ["-builtin:mcp"]`。`--no-mcp` 只在本次运行中禁用内置 MCP 支持。

扩展注册 `codemode` 或 `tool_search` 时，同样会替换同名的内置工具。只有替代工具声明了 [`reachesTools`](./extensions.md#tool-exposure)，Pi 才会为 MCP 服务器启用该工具，并等待其调用所需的服务器。Shell 中的 `pi mcp` 命令始终使用内置实现。

### 在 SDK 中使用 MCP \{#use-mcp-from-the-sdk}

SDK 会话不加载内置扩展。请在资源加载器中加入 MCP 扩展，并为 `codemode` 服务器加入 codemode 扩展，为 `deferred` 服务器加入工具搜索扩展。参阅 [Codemode 与 MCP](./sdk.md#codemode-mcp)。
