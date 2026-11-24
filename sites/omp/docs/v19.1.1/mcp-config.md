---
title: "MCP 配置"
description: "Oh My Pi v19.1.1 仓库文档：MCP 配置。"
---

# 在 OMP 中配置 MCP \{#mcp-configuration-in-omp}

本指南说明如何为 OMP 编码智能体添加、编辑和校验 MCP 服务器。

对应实现：

- 运行时配置类型：`packages/coding-agent/src/mcp/types.ts`
- 配置写入器：`packages/coding-agent/src/mcp/config-writer.ts`
- 加载器与校验：`packages/coding-agent/src/mcp/config.ts`
- 独立 `mcp.json` 文件的发现：`packages/coding-agent/src/discovery/mcp-json.ts`
- Schema：`packages/coding-agent/src/config/mcp-schema.json`
- 托管凭据查找：`packages/coding-agent/src/mcp/oauth-credentials.ts`
- 可移植插件的 MCP 发现：`packages/coding-agent/src/discovery/agent-plugins.ts`

## 推荐的配置位置 \{#preferred-config-locations}

OMP 可以从多个工具发现 MCP 服务器，例如通过 `.claude/`、`.cursor/`、`.vscode/`、`opencode.json` 等。写 OMP 原生配置时，通常使用以下主配置文件之一：

- 项目：`.omp/mcp.json`
- 用户：`~/.omp/agent/mcp.json`（使用命名配置档案时为 `~/.omp/profiles/<name>/agent/mcp.json`，见[配置档案](#profiles)）

为兼容既有配置，原生提供程序也读取 `.omp/.mcp.json` 和 `~/.omp/agent/.mcp.json`，但 OMP 写入上面的主 `mcp.json` 路径。

这些用户路径是默认值。`PI_CONFIG_DIR` 可以改变用户配置根目录，`PI_CODING_AGENT_DIR` 可以覆盖默认配置档案的智能体目录。命名配置档案会自行确定智能体目录，不继承这个覆盖项。项目配置仍在 `.omp/` 内。

OMP 也接受项目根目录下的独立后备文件：

- `mcp.json`
- `.mcp.json`

要让 OMP 管理配置，请使用 `.omp/mcp.json` 或 `~/.omp/agent/mcp.json`。只有想提供其他 MCP 客户端也能读取的可移植后备文件时，才使用根目录的 `mcp.json` / `.mcp.json`。

### 从其他工具导入配置 \{#imported-tool-configs}

OMP 也会转译以下工具当前使用的原生配置：

- Claude Code：`~/.claude.json`、`~/.claude/mcp.json` 和项目中的 `.claude/.mcp.json` / `.claude/mcp.json`。
- Codex：`~/.codex/config.toml` 和 `.codex/config.toml`（`[mcp_servers.*]`）。
- Gemini CLI：`~/.gemini/settings.json` 和 `.gemini/settings.json`。
- OpenCode：`~/.config/opencode/`、项目根目录及项目 `.opencode/` 内的 `opencode.json` / `opencode.jsonc`（`mcp` 映射）。
- Cursor：`~/.cursor/mcp.json` 和 `.cursor/mcp.json`。
- Windsurf：`~/.codeium/windsurf/mcp_config.json` 和 `.windsurf/mcp_config.json`。
- VS Code：仅项目中的 `.vscode/mcp.json`，使用 `mcp.servers`。
- 声明了 MCP 服务器的已安装 Claude 市场插件、OMP 扩展包和可移植 Agent Plugins（`plugin.json` 加根目录 `mcp.json`）。

对 Claude Code、Codex、Gemini CLI、Cursor 和 Windsurf，项目条目先于同名用户条目。这与 OMP 原生配置一致，项目条目优先于当前配置档案的用户条目。因此，项目设置 `enabled: false` 会禁用同名用户服务器。OpenCode 会按层深度合并每个服务器的定义：项目覆盖用户，`.opencode/` 覆盖项目根目录，同目录下 `.jsonc` 覆盖 `.json`。部分覆盖会继承低优先级层的字段。不同提供程序之间的优先级见[发现与优先级](#discovery-and-precedence)。

### 配置档案 \{#profiles}

命名配置档案（`omp --profile <name>` 或 `OMP_PROFILE` / `PI_PROFILE`）隔离用户级 MCP 配置。`omp --profile <name> --alias <command>` 会创建选择该配置档案的 shell 快捷命令。使用配置档案时，**用户**作用域解析到该档案的智能体目录，而非默认目录：

- 默认配置档案：`~/.omp/agent/mcp.json`。
- 配置档案 `<name>`：`~/.omp/profiles/<name>/agent/mcp.json`。

发现、`/mcp` 命令和配置写入器都遵循当前生效的配置档案。因此，一个档案**只**能看到自己的用户级服务器，不会读取默认档案的 `~/.omp/agent/mcp.json`。要在某个配置档案中添加服务器，可在该档案下启动（`omp --profile <name>`），运行 `/mcp add` 并选择 User 级别，也可直接编辑 `~/.omp/profiles/<name>/agent/mcp.json`。

项目级 MCP 配置（`.omp/mcp.json`）取决于工作目录，不取决于配置档案，因此适用于所有档案。外部工具配置（`.claude/`、`.cursor/` 等）也不随 OMP 档案变化，因为它们属于相应工具，而不属于 OMP 档案。

MCP 遵循与其他 OMP 原生配置相同的配置档案规则，见[配置发现中的配置档案](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/config-usage.md#profiles)。

## 添加 Schema 引用 \{#add-a-schema-reference}

在文件顶部加入以下行，以启用编辑器的自动补全和校验：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {}
}
```

当 `/mcp add`、`/mcp enable`、`/mcp disable`、`/mcp reauth` 或其他写入配置的流程创建或更新由 OMP 管理的 MCP 文件时，OMP 会自动写入这一行。

## 文件结构 \{#file-shape}

OMP 支持以下顶层结构：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"server-name": {
			"type": "stdio",
			"command": "npx",
			"args": ["-y", "some-mcp-server"]
		}
	},
	"disabledServers": ["server-name"]
}
```

顶层键：

- `$schema`：供工具使用的可选 JSON Schema URL。
- `mcpServers`：从服务器名称到服务器配置的映射。
- `disabledServers`：当前配置档案的用户级拒绝列表。按名称隐藏已发现的服务器，不考虑来源条目的 `enabled` 值。
- `enabledServers`：当前配置档案的用户级允许列表。它可以强制启用来源设为 `enabled: false` 或会被[内置转换](#built-in-transforms)排除的同名条目，但优先级仍低于 `disabledServers`。

配置写入器接受最长 100 个字符的名称。名称可以包含字母、数字、`_`、`-`、`.`、`:`，非空白部分之间允许一个空格。随包提供的 schema 未在名称匹配规则中包含冒号或空格，因此 `cloudflare:cloudflare-api` 或 `MaaS Slack` 等名称可能在运行时有效，却在编辑器里报 schema 错误。

## 支持的服务器字段 \{#supported-server-fields}

所有传输方式共用的字段：

- `enabled?: boolean`：设为 `false` 时跳过该服务器，除非当前配置档案的用户级 `enabledServers` 允许列表包含它。
- `timeout?: number`：MCP 请求超时，单位为毫秒。设为 `0` 可关闭客户端的 MCP 超时。
- `requestIdFormat?: "number" | "string"`：发出的 JSON-RPC 请求 ID 的编码。默认使用各传输方式的整数 ID；`"string"` 使用抗碰撞的雪花 ID。这个 OMP 专用字段只从 OMP 原生文件、根目录的 `mcp.json` / `.mcp.json` 和 OMP 扩展包读取；从其他工具转译的配置会忽略它。
- `instructions?: boolean`：将服务器提供的指令纳入系统提示词，默认 `true`。设为 `false` 会省略该服务器的指令，但不会禁用其工具。与 `requestIdFormat` 一样，这是 OMP 专用字段，从其他工具转译的配置会忽略它。
- `auth?: { ... }`：已存储凭据的元数据。托管凭据注入仅针对 OAuth 实现。
- `oauth?: { ... }`：认证或重新认证时使用的显式 OAuth 客户端和回调配置。

如果服务器的指引与工具策略冲突，或给每次请求（包括子代理请求）带来不需要的上下文，可以关闭指令。没有已连接的服务器提供指令时，系统会省略整个 MCP Server Instructions 小节。`instructions` 不区分连接：两个不同名称的条目指向同一端点时，只保留优先级较高的条目及其自身的 `instructions` 值。因此应在胜出的条目上设置此选项，可用 `/mcp list` 查询。对于已经连接的服务器，运行 `/mcp reload` 后生效。

`OMP_MCP_TIMEOUT_MS` 在整个进程内优先于各服务器的 `timeout`。设为 `0` 可以关闭客户端超时，也可设为 `120000` 等正毫秒值。未设置或设置无效时，OMP 先使用服务器的配置值，再回退到默认值（工具调用 10 分钟，其他请求 30 秒）；无效值会记入日志并忽略。

Claude 市场插件遵循 [Claude Code 的逐服务器超时规则](https://code.claude.com/docs/en/mcp)：其 `.mcp.json` 值的单位为毫秒。小于 `1000` 的值会被忽略，并产生发现警告，随后采用 OMP 的常规超时回退。此限制不改变 OMP 原生配置，原生配置仍可用 `0` 禁用超时。

这些请求截止时间也适用于经父会话借用连接的子代理 MCP 调用。代理不会加独立超时；调用者取消时，仍会终止子代理的等待。

初始 MCP 发现通常在 250 ms 的时间窗口后返回，较慢的连接继续在后台进行。通过 `mcp.startupTimeoutMs` 设置这个窗口；若同时设置了 `OMP_MCP_STARTUP_TIMEOUT_MS`，以环境变量为准。生效值为 `0` 时，等待所有初始连接尝试结束。在输出模式（`-p`、`--mode text|json`）下，OMP 还会在首轮前等待所有已配置服务器加载工具或失败，最长等待 `OMP_MCP_TIMEOUT_MS`（默认 30 秒）。`OMP_MCP_TIMEOUT_MS=0` 也会关闭这道等待的截止时间，未响应服务器可能无限期阻塞输出模式。到截止时间仍不可用的服务器会在标准错误中列出；设置 `OMP_MCP_REQUIRE_READY=1` 则改为在该轮之前以状态码 1 退出。这些输出模式的等待不影响交互式、RPC 或 ACP 启动。在后台连接 MCP 服务器的交互式和 `--mode rpc-ui` 会话中，首轮最多等待 1.5 秒，让系统提示词包含届时已连接的服务器。较慢的服务器稍后注册，并影响下一轮的提示词。

客户端自动生成的远程协议请求头优先于同名配置请求头，比较时不区分大小写。Streamable HTTP 管理 `MCP-Protocol-Version`，对采用 2026-07-28 版协议的服务器也管理 `Mcp-Method` / `Mcp-Name`。配置中这些同名头会被忽略。可移植 Agent Plugins 的配置请求头绑定到初始来源，不会在重定向时转发给其他来源。

远程 HTTP 和 SSE 传输不额外设置套接字空闲超时。没有适用的 MCP 截止时间时，静默连接可以无限等待；取消调用或关闭传输即可停止。消息流没有数据，不能说明远端仍然可达。

## 服务器运行位置与共享条件 \{#where-servers-run-and-when-they-are-shared}

OMP 会话本身不启动 MCP 服务器。每个已配置的服务器都由每用户的 omp 守护进程托管，每个会话接入它。关闭 `mcp.shared` 或无法连接守护进程时，相同的宿主在会话内部运行，只在同一进程的会话之间共享。

服务器如何共享取决于它使用的协议版本。OMP 会对每个服务器检测一次并记住结果：

- **MCP 2026-07-28 服务器**按规范无状态。一个进程（或一个远程来源）服务于所有配置匹配的会话。首次有会话需要它时启动；超过 `mcp.idleStopMinutes` 分钟（默认 5 分钟）未使用时停止，下次调用会再次启动。
- **要求 `initialize` 握手的服务器**（2025-11-25 及更早版本，以及所有 `sse` 服务器）在进程内保持会话。每个 OMP 会话有独立进程，在该会话首次调用服务器时启动，会话结束时停止。

只要服务器声明工具、提示词和资源列表仍有效，OMP 就按服务器缓存这些列表。采用握手的旧版服务器不声明有效期，OMP 缓存 30 天。因此，会话从不调用某个服务器时，不会为它启动进程。列表超过有效期后仍立即显示，并在后台刷新。

两个会话只有在下列各项都相同时，才共享 stdio 服务器：

- `command`、`args` 和工作目录（`cwd`，未设置时使用会话的项目目录）。
- 服务器 `env` 中所有变量解析后的值。
- 所有名称中包含 `TOKEN`、`SECRET`、`PASSWORD`、`PASSWD`、`CREDENTIAL`、`API_KEY`、`ACCESS_KEY`、`PRIVATE_KEY`、`PROFILE`、`ACCOUNT`、`TENANT`、`CONFIG`、`CCNAME` 或 `AUTH` 的继承环境变量。

其他继承变量（`PATH`、终端和 shell 状态）来自启动进程的会话。实际配置时：

- 未指定 `cwd` 的服务器按项目共享。如果服务器不依赖项目，为它设置 `cwd`（例如用户主目录），各项目就能共用一个进程。
- 如果服务器需要读取在不同会话间取值不同的变量，请在 `env` 中声明（`"env": { "AWS_REGION": "${AWS_REGION}" }`）。变量值不同的会话就会使用不同进程。

发送相同 URL 和请求头的会话可以共享远程服务器。刷新 OAuth 令牌后，请求头已不同，不再使用同一份连接配置。

`/mcp list` 会显示每个服务器是运行还是空闲、进程 ID，以及有多少个会话共享它。`omp ps` 列出托管进程。

### `stdio` 传输 \{#stdio-transport}

直接传给运行时的配置及配置写入器，在省略 `type` 时默认使用 `stdio`。发现时，只含 URL 的条目会推断为 `http`，含命令的条目会推断为 `stdio`。要让配置可移植且符合 schema，请显式指定 `type`。

必填：

- `command: string`

可选：

- `type?: "stdio"`
- `args?: string[]`
- `env?: Record<string, string>`
- `cwd?: string`

示例：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"filesystem": {
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/alice/projects", "/Users/alice/Documents"]
		}
	}
}
```

这遵循官方 Filesystem MCP 服务器包（`@modelcontextprotocol/server-filesystem`）的用法。

### `http` 传输 \{#http-transport}

必填：

- `type: "http"`
- `url: string`

可选：

- `headers?: Record<string, string>`

示例：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"github": {
			"type": "http",
			"url": "https://api.githubcopilot.com/mcp/"
		}
	}
}
```

这与 GitHub 托管的 GitHub MCP 服务器端点一致。

### `sse` 传输 \{#sse-transport}

必填：

- `type: "sse"`
- `url: string`

可选：

- `headers?: Record<string, string>`

示例：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"legacy-remote": {
			"type": "sse",
			"url": "https://example.com/mcp/sse"
		}
	}
}
```

`sse` 仍受支持以兼容旧配置，但 MCP 规范现在建议为新服务器使用 Streamable HTTP（`type: "http"`）。

## 认证字段 \{#auth-fields}

OMP 识别两个与认证有关的对象。

### `auth` \{#auth}

```json
{
	"type": "oauth",
	"credentialId": "optional-stored-credential-id",
	"tokenUrl": "optional-token-endpoint",
	"clientId": "optional-client-id",
	"clientSecret": "optional-client-secret",
	"resource": "optional-mcp-resource-uri"
}
```

对于托管 OAuth，`auth` 告诉 OMP 如何查找并刷新已存储的凭据。虽然 `"apikey"` 是可接受的 `type`，但它不会从认证存储加载或注入 API 密钥。将 API 密钥直接放入 stdio 的 `env` 或远程传输的 `headers` 中（优先使用下文所述的环境变量或 `!command` 间接取值）。

通常无需手动编写这段配置。OMP 为 `http` / `sse` 服务器完成 OAuth 流程后，用当前配置档案和服务器 URL 推导出确定性的 ID（`mcp_oauth:profile:<profile>:<url>`），并将凭据和刷新所需材料存入此 ID。指向相同 URL 的任何配置都会自动解析到当前档案自己的凭据，包括共享项目 `mcp.json` 中仅有服务器定义、完全没有 `auth` 块的条目。认证存储由共享认证代理支持时也一样。项目级服务器可以安全地跨配置档案使用：提交服务器定义后，各档案各自用 `/mcp reauth <name>` 授权，并保持登录到各自的账号。如果显式指定的 `credentialId` 可以解析，OMP 仍会使用它；如果它指向其他配置档案的记录，则回退到当前档案中按 URL 绑定的凭据。

在仅含服务器定义的条目上运行 `/mcp reauth` 不会修改文件。凭据及刷新所需材料完全保留在当前档案的认证存储中（本地 `agent.db` 或认证代理），所以提交到仓库的项目配置不会带入本地认证状态。显式配置 `Authorization` 请求头（不区分大小写）会禁用自动按 URL 查找凭据的回退方式。显式解析的 `auth.credentialId` 仍可提供托管 OAuth，并替换该请求头。

绑定按配置档案区分，不按项目区分。某个档案一旦授权某 URL，_任何_在 `mcp.json` 中定义了该 URL 服务器的检出目录都会自动使用该档案的凭据连接。已提交的 MCP 定义是受信任的输入，能够运行任意命令的 `stdio` 条目本来也是如此。如果某个配置档案持有重要凭据，请先审查仓库的 `mcp.json` 再用该档案打开仓库，或为不受信任的检出目录使用专用配置档案。

### `oauth` \{#oauth}

```json
{
	"clientId": "...",
	"clientSecret": "...",
	"scope": "optional space-separated scopes",
	"redirectUri": "...",
	"callbackPort": 3334,
	"callbackPath": "/oauth/callback",
	"prompt": "consent"
}
```

MCP 服务器要求显式设置 OAuth 客户端、作用域或回调时，使用 `oauth`。回调监听器默认使用端口 `3000` 和路径 `/callback`。HTTP 环回 `redirectUri` 会提供自己的端口和路径，除非显式覆盖。HTTPS 环回重定向需要为 TLS 终结器之后的本地 HTTP 监听器指定不同的 `callbackPort`。

运行 `/mcp reauth` 时，受保护资源或其认证质询声明的作用域优先；`oauth.scope` 提供后备值。授权服务器的 `scopes_supported` 只是受支持作用域的清单，不是授权所有作用域的请求。OMP 不会把清单复制到登录请求中。如果资源未声明作用域，请将 `oauth.scope` 设为已注册客户端允许的作用域，例如 OpenID Connect 登录的 `"openid"`。也可不设置，以使用授权服务器的默认值。

资源服务器托管的 `/oauth/metadata` 和 `/.mcp/auth` 文档中的作用域也会保留，包括嵌套的 `oauth`、`authorization` 和 `auth` 块。当 OMP 在已显式识别的授权服务器上探测这些路径时，不把它们的 `scopes_supported` 数组当作资源要求。

`prompt` 控制 OAuth 的 `prompt` 授权参数。OMP 默认省略它。例外是请求 `offline_access` 作用域时，默认使用 `"consent"`，以便提供方发放刷新权限。可以显式设为提供方支持的值，例如 `"consent"` 或 `"select_account"`，也可设为 `""` 强制省略。

示例：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"slack": {
			"type": "http",
			"url": "https://mcp.slack.com/mcp",
			"oauth": {
				"clientId": "YOUR_SLACK_CLIENT_ID",
				"clientSecret": "YOUR_SLACK_CLIENT_SECRET"
			},
			"auth": {
				"type": "oauth",
				"tokenUrl": "https://slack.com/api/oauth.v2.user.access",
				"clientId": "YOUR_SLACK_CLIENT_ID",
				"clientSecret": "YOUR_SLACK_CLIENT_SECRET"
			}
		}
	}
}
```

Slack 文档中的相关端点：

- MCP 端点：`https://mcp.slack.com/mcp`
- 授权端点：`https://slack.com/oauth/v2_user/authorize`
- 令牌端点：`https://slack.com/api/oauth.v2.user.access`

## 常用配置示例 \{#common-copy-paste-examples}

### 通过 stdio 配置文件系统服务器 \{#filesystem-server-via-stdio}

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"filesystem": {
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-filesystem", "/absolute/path/one", "/absolute/path/two"]
		}
	}
}
```

### 通过 HTTP 配置 GitHub 托管服务器 \{#github-hosted-server-via-http}

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"github": {
			"type": "http",
			"url": "https://api.githubcopilot.com/mcp/"
		}
	}
}
```

### 通过 Docker 配置 GitHub 本地服务器 \{#github-local-server-via-docker}

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"github": {
			"command": "docker",
			"args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
			"env": {
				"GITHUB_PERSONAL_ACCESS_TOKEN": "GITHUB_PERSONAL_ACCESS_TOKEN"
			}
		}
	}
}
```

这与 GitHub 官方本地 Docker 镜像 `ghcr.io/github/github-mcp-server` 的用法一致。

### 通过 OAuth 配置 Slack 托管服务器 \{#slack-hosted-server-via-oauth}

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {
		"slack": {
			"type": "http",
			"url": "https://mcp.slack.com/mcp",
			"oauth": {
				"clientId": "YOUR_SLACK_CLIENT_ID",
				"clientSecret": "YOUR_SLACK_CLIENT_SECRET"
			},
			"auth": {
				"type": "oauth",
				"tokenUrl": "https://slack.com/api/oauth.v2.user.access",
				"clientId": "YOUR_SLACK_CLIENT_ID",
				"clientSecret": "YOUR_SLACK_CLIENT_SECRET"
			}
		}
	}
}
```

## 密钥和变量解析 \{#secrets-and-variable-resolution}

这部分配置容易出错。

### 发现时展开 `${...}` \{#discovery-time--expansion}

OMP 发现来自 OMP 原生文件和独立后备文件的 MCP 配置时，会展开 `${VAR}` 和 `${VAR:-default}` 占位符。展开会递归应用于 `command`、`args`、`env`、`cwd`、`url`、`headers`、`auth` 和 `oauth` 中的字符串值。无法解析的占位符保留为字面字符串。

示例：

```json
{
	"mcpServers": {
		"github": {
			"type": "http",
			"url": "https://api.githubcopilot.com/mcp/",
			"headers": {
				"Authorization": "Bearer ${GITHUB_TOKEN}"
			}
		}
	}
}
```

### 建立连接前解析环境变量和请求头 \{#pre-connect-envheader-resolution}

可移植 Agent Plugins 的密钥规则不同。只展开 `${PLUGIN_ROOT}` 和 `${PLUGIN_DATA}`。环境变量与请求头的值（包括空字符串）按字面保留，不求值 `!command` 或只含变量名的值。由提供程序展开过的市场环境变量键也按字面保留。

在 OMP 启动 stdio 服务器或发出 HTTP/SSE 请求前，按以下方式解析 stdio 的 `env` 值及 HTTP/SSE 的 `headers` 值：

1. 如果值以 `!` 开头，OMP 会在项目目录中把后面的内容作为 shell 命令运行，超时为 10 秒，并取去掉首尾空白的标准输出。成功结果在进程内缓存，并发解析会共用同一次命令执行。服务器重新连接时（`/mcp reconnect`、自动重连或 `/mcp reload`）会再次运行这些命令。对 HTTP/SSE 的 `headers`，服务器返回 401 或 403 时也会再次运行命令，并用新值重试一次请求。这样，生成短期令牌的命令在令牌过期后仍能工作。
2. 如果命令失败、超时或只输出空白字符，省略这一项 `env` 或 `headers`。失败命令在等待 30 秒后，可在后续解析时重试。
3. 否则，OMP 检查整个值是否是某个环境变量的名称。
4. 如果该环境变量已设置且值非空，OMP 使用其值；否则按字面使用原字符串。

示例：

```json
{
	"env": {
		"GITHUB_PERSONAL_ACCESS_TOKEN": "GITHUB_PERSONAL_ACCESS_TOKEN"
	},
	"headers": {
		"X-MCP-Insiders": "true"
	}
}
```

因此，以下写法都可用于本地密钥：

- `"GITHUB_PERSONAL_ACCESS_TOKEN": "GITHUB_PERSONAL_ACCESS_TOKEN"`：从当前 shell 环境复制值。
- `"Authorization": "Bearer hardcoded-token"`：使用字面值。
- `"Authorization": "!printf 'Bearer %s' \"$GITHUB_TOKEN\""`：用命令生成请求头。

## 用户级启用和禁用覆盖项 \{#user-level-enable-and-disable-overrides}

当前配置档案的用户文件提供两个跨来源的覆盖项：

- `disabledServers` 是优先级最高的拒绝列表，可以隐藏任意来源的同名服务器。
- `enabledServers` 强制启用来源设为 `enabled: false` 或会被[内置转换](#built-in-transforms)排除的同名条目，不能覆盖 `disabledServers`。

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"disabledServers": ["github"],
	"enabledServers": ["tool-owned-server"]
}
```

服务器定义位于 OMP 管理且可写的文件中时，`/mcp enable` 和 `/mcp disable` 直接更新 `enabled`。OMP 不会修改其他工具的配置。对于这类来源，两个命令改为维护用户级允许或拒绝列表，并清除与此冲突的过时覆盖项。

## 内置转换 \{#built-in-transforms}

OMP 会识别一些 MCP 服务器，自动调整它们的处理方式。目前唯一的转换是排除：如果 OMP 自带工具已能完成某个服务器的工作，就不连接该服务器。

| 服务器 | 识别条件 | 排除条件 |
| --- | --- | --- |
| Codex Desktop 自带的 Node REPL（Codex 在 `~/.codex/config.toml` 中将它注册为 `node_repl`） | 不论服务器名是什么，stdio 命令的文件名是 `node_repl` 或 `node_repl.exe` | `eval` 工具已启用且 `eval.js` 开启 |

在发现阶段（启动及运行 `/mcp reload` 时），系统根据服务器配置决定是否排除，早于服务器启动。`/mcp list` 会在 **Replaced by built-ins** 下显示被排除的服务器，也会显示原因和来源文件；`/extensions` 面板将它们显示为已禁用。

显式启用始终优先：

- `/mcp enable <name>` 连接并保留已排除的服务器。它对 OMP 管理的条目写入 `enabled: true`；若配置属于其他工具，则把名称加到 `enabledServers`。
- 手动在条目中设置 `enabled: true`，或把名称加到 `enabledServers`，效果相同。
- `mcp.builtinTransforms: false` 禁用全部内置转换。

`omp read` 不应用内置转换。

## `/mcp add` 与直接编辑 JSON \{#mcp-add-vs-editing-json-directly}

需要引导式配置时，使用 `/mcp add`。

以下情况可直接编辑 JSON：

- 需要向导暂未提供的传输或认证选项。
- 要从其他 MCP 客户端粘贴服务器定义。
- 希望编辑器使用 schema 校验配置。

编辑后可使用以下命令：

- `/mcp reload`：在当前会话重新发现并连接服务器。
- `/mcp list`：查看服务器来自哪个配置文件。
- `/mcp test <name>`：测试单个服务器。
- `/mcp reconnect <name>`：重启单个服务器，不重新发现所有配置。共享的 2026-07-28 服务器重启会影响所有使用它的会话。
- `/mcp reauth <name>`：替换托管 OAuth 凭据；用 `/mcp unauth <name>` 可删除凭据。
- `/mcp resources`、`/mcp prompts`、`/mcp notifications`：检查工具以外的 MCP 能力。

## OMP 的校验规则 \{#validation-rules-omp-enforces}

`packages/coding-agent/src/mcp/config.ts` 中的 `validateServerConfig()` 施加以下规则：

- `stdio` 必须提供 `command`。
- `http` 和 `sse` 必须提供 `url`。
- 同一个服务器不能同时设置 `command` 和 `url`。
- 拒绝无法识别的 `type` 值。

这些规则适用于直接传给校验器或写入器的配置。发现流程会先转换规范化条目：对只提供 URL 的条目推断为 `http`，对提供命令的条目推断为 `stdio`，并保留所选传输方式对应的字段。不要依赖发现流程拒绝冲突的原始字段或未知类型。应显式编写符合 schema 的传输定义。

`sse` 为兼容仍然有效，但新托管的服务器通常应配置为 `http`。

## 发现与优先级 \{#discovery-and-precedence}

OMP 按优先级从高到低加载提供程序。提供 MCP 的来源按以下顺序排列：

1. OMP 原生配置。
2. OMP 扩展包。
3. Claude Code。
4. Agent Plugins。
5. Claude 市场插件和 Codex。
6. Gemini CLI。
7. OpenCode。
8. Cursor 和 Windsurf。
9. VS Code。
10. 根目录 `mcp.json` / `.mcp.json` 后备文件。

在不同提供程序之间，最先找到的定义有效。同名条目不合并，但上文所述 OpenCode 自身的配置层是例外。不同名称的定义，如果传输方式、端点或命令输入、认证和请求 ID 模式都与优先级更高的定义等效，也会被后者遮蔽。

在 OMP 原生配置中，项目的 `.omp/mcp.json` 优先于 `.omp/.mcp.json`，之后才是当前档案的用户 `mcp.json` 和 `.mcp.json`。根目录后备文件中，`mcp.json` 优先于 `.mcp.json`。实际使用时：

- 需要 OMP 专用覆盖配置时，优先选择 `.omp/mcp.json` 或当前档案的用户 `mcp.json`。
- 如有可能，在不同工具间保持名称和端点定义唯一。
- 如果第三方配置不断重新引入不需要的服务器，使用用户 `disabledServers` 列表。
- 设置 `mcp.enableProjectConfig: false` 可在去重之前排除全部项目级来源，使同名用户条目得以保留。

## 排查问题 \{#troubleshooting}

### `Server "name": stdio server requires "command" field` \{#server-name-stdio-server-requires-command-field}

对于直接传给写入器或客户端的远程配置，请设置 `type: "http"`。发现流程会把只提供 URL 的条目推断为 HTTP；显式设为 stdio 的条目仍需要命令。

### `Server "name": both "command" and "url" are set` \{#server-name-both-command-and-url-are-set}

只选一种传输方式。OMP 将 `command` 视为 stdio，将 `url` 视为 HTTP 或 SSE。

### `/mcp add` 成功但服务器仍无法连接 \{#mcp-add-worked-but-the-server-still-does-not-connect}

JSON 有效，但服务器仍可能不可达。使用 `/mcp test <name>`，并检查：

- 可执行文件或 Docker 镜像是否存在。
- 必需的环境变量是否已设置。
- 远程 URL 是否可访问。
- OAuth 或 API 令牌是否有效。

### 其他工具的配置中有服务器，但 OMP 中没有 \{#the-server-exists-in-another-tools-config-but-not-in-omp}

运行 `/mcp list`。OMP 能发现许多第三方 MCP 文件，但也可通过 `mcp.enableProjectConfig` 禁用项目级加载，用户级 `disabledServers` 条目也可按名称排除服务器。

### 已配置 Codex 的 `node_repl` 服务器，但从未加载 \{#codexs-node_repl-server-is-configured-but-never-loads}

当 `eval` 可以运行 JavaScript 时，[内置转换](#built-in-transforms)会排除它。运行 `/mcp enable node_repl` 可照常连接。

### 已配置浏览器 MCP 服务器，但从未加载 \{#a-browser-mcp-server-is-configured-but-never-loads}

内置浏览器预置 API 可调用时，OMP 在加载配置时排除识别到的浏览器自动化服务器，早于发起连接。可调用条件是 `browser.enabled` 为 true（默认值），Eval 已注册并启用，且会话没有限制为只使用显式指定的工具。筛选条件包括：名称为 `playwright`、`puppeteer`、`browserbase`、`browser-tools`、`browser-use` 或 `browser` 的服务器；其命令或参数与一组固定的浏览器 MCP 包模式匹配的 stdio 服务器（`@playwright/mcp`、`@modelcontextprotocol/server-puppeteer`、`@browserbasehq/mcp-server-browserbase`、`@agentdeskai/browser-tools-mcp`、`@agent-infra/mcp-server-browser`、`puppeteer-mcp`、`playwright-mcp`、`pptr-mcp`、`browser-use-mcp`、`mcp-browser-use`）；以及 URL 指向 browserbase.com 或 browser-use.com 的 HTTP/SSE 服务器。其他包不会匹配，例如使用上述名单以外服务器名称的 `chrome-devtools-mcp`。这一筛选独立于 `disabledServers`。

排除不发出提示，但在各个位置是否可见不同。两个主文件（`~/.omp/agent/mcp.json` 和 `.omp/mcp.json`）之外的服务器不会进入 `/mcp list`。第三方配置、根目录后备 `mcp.json` / `.mcp.json`，以及 OMP 扩展包中的服务器，筛选后均不再显示。来自两个主文件的条目仍会显示为 `not connected`。因此，主文件中有条目但实际未连接的服务器可能被筛选了。两种情况都不记录错误或警告。

如果要用浏览器 MCP 服务器取代原生浏览器工具，将 `browser.enabled: false` 写入设置。`omp read` 不应用此筛选。

### 带命名空间的服务器可以使用，但编辑器拒绝名称 \{#a-namespaced-server-works-but-the-editor-rejects-its-name}

运行时和配置写入器接受 `:` 和名称内部的单个空格，但随包提供的 JSON Schema 中，`propertyNames` 的模式目前不接受它们。这是 schema 与运行时不一致，并非连接失败。

### 配置文件未出现在列表中，也没有报错 \{#a-config-file-is-silently-absent-from-the-list}

JSON 格式错误、缺少服务器映射或映射无效，都会使提供程序不从该文件提供条目。OMP 会根据提供程序的不同发出发现警告或记录解析失败，而不会让会话失败。修正 JSON 结构后，运行 `/mcp reload` 和 `/mcp list`。

## 参考资料 \{#references}

- MCP 规范，当前修订版：https://modelcontextprotocol.io/specification/2026-07-28
- 握手时期的传输方式：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- 文件系统服务器包：https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem
- GitHub MCP 服务器：https://github.com/github/github-mcp-server
- Slack MCP 服务器文档：https://docs.slack.dev/ai/slack-mcp-server/
