---
title: "OMP 中的 MCP 配置"
description: "Oh My Pi 官方仓库文档：OMP 中的 MCP 配置。"
---

# OMP 中的 MCP 配置 \{#mcp-configuration-in-omp}

本指南介绍如何为 OMP 编码智能体添加、编辑和验证 MCP 服务器。

代码中的权威来源：

- 运行时配置类型：`packages/coding-agent/src/mcp/types.ts`
- 配置写入器：`packages/coding-agent/src/mcp/config-writer.ts`
- 加载器与验证：`packages/coding-agent/src/mcp/config.ts`
- 独立 `mcp.json` 发现：`packages/coding-agent/src/discovery/mcp-json.ts`
- 模式：`packages/coding-agent/src/config/mcp-schema.json`
- 托管凭据查找：`packages/coding-agent/src/mcp/oauth-credentials.ts`
- 可移植插件 MCP 发现：`packages/coding-agent/src/discovery/agent-plugins.ts`

## 首选配置位置 \{#preferred-config-locations}

OMP 可以从其他工具的项目配置（`.claude/`、`.codex/`、`opencode.json`）中发现 MCP 服务器，但对于 OMP 原生配置，通常应使用以下主要文件之一：

- 项目：`.omp/mcp.json`
- 用户：`~/.omp/agent/mcp.json`（激活命名配置档案时为 `~/.omp/profiles/<name>/agent/mcp.json`，参见[配置档案](#profiles)）

原生提供方还会读取 `.omp/.mcp.json` 和 `~/.omp/agent/.mcp.json` 以保持兼容，但 OMP 会写入上述主要 `mcp.json` 路径。

这些用户路径是默认值：`PI_CONFIG_DIR` 会更改主目录配置根路径，`PI_CODING_AGENT_DIR` 可以覆盖默认配置档案的智能体目录。命名配置档案会推导自己的智能体目录，而不会继承该覆盖。项目配置仍位于 `.omp/`。

OMP 还接受项目根目录中的独立回退文件：

- `mcp.json`
- `.mcp.json`

希望由 OMP 管理配置时，使用 `.omp/mcp.json` 或 `~/.omp/agent/mcp.json`。只有希望提供其他 MCP 客户端也可能读取的可移植回退文件时，才使用根目录的 `mcp.json` / `.mcp.json`。

### 导入的工具配置 \{#imported-tool-configs}

OMP 还会转换以下项目级工具原生来源（绝不读取其他工具的主目录配置）：

- Claude Code：`<cwd>/.claude/.mcp.json` / `<cwd>/.claude/mcp.json`
- Codex：`<cwd>/.codex/config.toml`（`[mcp_servers.*]`）
- OpenCode：项目根目录和项目 `.opencode/` 中的 `opencode.json` / `opencode.jsonc`（其中的 `mcp` 映射；支持 `{env:}` / `{file:}` 替换）
- 声明了 MCP 服务器的已安装市场插件、OMP 扩展包和可移植 Agent Plugins（`plugin.json` 加根目录 `mcp.json`）

OpenCode 会跨层深度合并每个服务器：`.opencode/` 覆盖项目根目录，同一目录中 `.jsonc` 覆盖 `.json`。部分覆盖会继承较低层的字段。跨提供方的优先级列于[发现与优先级](#discovery-and-precedence)。

### 配置档案 \{#profiles}

命名配置档案（`omp --profile <name>` 或 `OMP_PROFILE`/`PI_PROFILE`）隔离用户级 MCP 配置。`omp --profile <name> --alias <command>` 创建选择该配置档案的 shell 快捷命令。配置档案激活后，**用户**作用域会解析到该配置档案的智能体目录，而不是默认目录：

- 默认配置档案：`~/.omp/agent/mcp.json`
- 配置档案 `<name>`：`~/.omp/profiles/<name>/agent/mcp.json`

发现流程、`/mcp` 命令和配置写入器都遵循当前激活的配置档案，因此配置档案**只**能看到自己的用户级服务器，绝不会看到默认配置档案的 `~/.omp/agent/mcp.json`。要向配置档案添加服务器，可使用该配置档案启动（`omp --profile <name>`），运行 `/mcp add` → 用户级，或直接编辑 `~/.omp/profiles/<name>/agent/mcp.json`。

项目作用域的 MCP 配置（`.omp/mcp.json`）与工作目录绑定，而不是与配置档案绑定，因此在每个配置档案下都会生效。外部工具的项目配置（`.claude/`、`.codex/` 等）也与配置档案无关，因为它们属于那些工具，而不是 OMP 配置档案。

MCP 遵循与其他 OMP 原生配置相同的配置档案规则；参见[配置发现 → 配置档案](./config-usage.md#profiles)。

## 添加模式引用 \{#add-a-schema-reference}

在文件顶部添加以下行，以获得编辑器自动补全和验证：

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"mcpServers": {}
}
```

当 `/mcp add`、`/mcp enable`、`/mcp disable`、`/mcp reauth` 或其他写入配置的流程创建或更新 OMP 管理的 MCP 文件时，OMP 现在会自动写入该行。

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

- `$schema`：供工具使用的可选 JSON Schema URL
- `mcpServers`：服务器名称到服务器配置的映射
- `disabledServers`：当前激活配置档案的用户级拒绝列表；无论来源条目的 `enabled` 值是什么，它都会按名称隐藏已发现的服务器
- `enabledServers`：当前激活配置档案的用户级允许列表；它可以强制启用来源声明为 `enabled: false` 或被[内置转换](#built-in-transforms)丢弃的同名条目，但 `disabledServers` 仍优先

配置写入器接受最长 100 个字符的名称，允许包含字母、数字、`_`、`-`、`.`、`:`，以及非空格名称片段之间的单个空格。内置模式的名称匹配模式不包含冒号和空格，因此 `cloudflare:cloudflare-api` 或 `MaaS Slack` 等名称在运行时可能有效，但编辑器会报告模式错误。

## 支持的服务器字段 \{#supported-server-fields}

所有传输方式共用的字段：

- `enabled?: boolean`：为 `false` 时跳过此服务器，除非当前激活配置档案的用户级 `enabledServers` 允许列表列出了它
- `timeout?: number`：MCP 请求超时，单位为毫秒；`0` 禁用客户端 MCP 超时
- `requestIdFormat?: "number" | "string"`：传出 JSON-RPC 请求 id 的编码；默认使用各传输方式的整数。`"string"` 使用抗碰撞的雪花 ID。此 OMP 专有字段只从 OMP 原生文件、根目录 `mcp.json` / `.mcp.json` 和 OMP 扩展包读取；从其他工具转换的配置会忽略它。
- `instructions?: boolean`：将服务器提供的指令包含在系统提示中（默认值：`true`）。设置为 `false` 可省略该服务器的指令，而不禁用其工具。与 `requestIdFormat` 一样，这是 OMP 专有字段，从其他工具转换的配置会忽略它。
- `auth?: { ... }`：已存储凭据的元数据；托管凭据注入已针对 OAuth 实现
- `oauth?: { ... }`：身份验证或重新验证期间使用的显式 OAuth 客户端与回调设置

如果服务器的指导与工具策略冲突，或向每个请求（包括子代理请求）添加了不需要的上下文，请禁用指令。如果没有已连接服务器提供指令，MCP 服务器指令章节会整体省略。`instructions` 不用于区分连接：当两个不同名称的条目描述同一端点时，只保留优先级较高的条目及其自身的 `instructions` 值，因此应在胜出的条目上设置该选项（参见 `/mcp list`）。更改后的值会在 `/mcp reload` 后应用于已连接的服务器。

`OMP_MCP_TIMEOUT_MS` 在整个进程范围内优先于每个服务器的 `timeout`。将它设为 `0` 可禁用客户端超时，或设置为正的毫秒值，例如 `120000`。若未设置或值无效，OMP 会使用服务器值，然后回退到默认值（工具调用为 10 分钟，其他请求为 30 秒）；无效值会被记录并忽略。

Claude 市场插件遵循 [Claude Code 的逐服务器超时规则](https://code.claude.com/docs/en/mcp)：其 `.mcp.json` 值以毫秒为单位，小于 `1000` 的值会被忽略并产生发现警告，从而应用 OMP 的正常超时回退。此限制不改变 OMP 原生配置，在原生配置中 `0` 仍会禁用超时。

这些请求截止时间也适用于通过借用父级连接进行的子代理 MCP 调用。代理层不添加独立超时；调用方取消仍会停止子代理的等待。

初始 MCP 发现会在 250 毫秒窗口后返回，较慢的连接继续在后台进行。设置 `mcp.startupTimeoutMs` 或使用 `OMP_MCP_STARTUP_TIMEOUT_MS` 覆盖它可更改该窗口；`0` 会等待初始连接尝试结束。在打印模式（`-p`、`--mode text|json`）下，OMP 还会在第一轮前等待所有已配置服务器加载工具或失败，最长等待 `OMP_MCP_TIMEOUT_MS`（默认 30 秒）。`OMP_MCP_TIMEOUT_MS=0` 也会禁用此屏障截止时间，因此无响应的服务器可能无限期阻塞打印模式。截止时仍不可用的服务器名称会输出到 stderr；设置 `OMP_MCP_REQUIRE_READY=1` 则会在轮次开始前以退出码 1 退出。这些打印模式等待不会影响交互式、RPC 或 ACP 启动。在后台连接 MCP 服务器的交互式和 `--mode rpc-ui` 会话中，第一轮最多等待 1.5 秒以供 MCP 启动，使系统提示包含届时已连接的服务器；较慢的服务器稍后注册，并改变下一轮的提示。

客户端生成的远程协议头优先于配置头，比较时不区分大小写。Streamable HTTP 管理 `MCP-Protocol-Version`（对于 2026-07-28 修订版的服务器，还管理 `Mcp-Method`/`Mcp-Name`）：配置中的同名项会被忽略。可移植 Agent Plugins 配置的头锁定于来源，不会在重定向时转发到另一个来源。

远程 HTTP 和 SSE 传输不会施加额外的套接字空闲超时。没有适用的 MCP 截止时间时，静默连接可能无限期等待；可取消调用或关闭传输来停止它。仅凭流没有活动，并不能证明对端仍可访问。

## 服务器在哪里运行，以及何时共享 \{#where-servers-run-and-when-they-are-shared}

OMP 会话本身不启动 MCP 服务器。每个已配置服务器都由每用户的 omp 守护进程托管，各会话附加到它。关闭 `mcp.shared` 或无法连接守护进程时，同一托管程序会在会话内运行，并且只在该进程的会话之间共享。

服务器如何共享，取决于它使用的协议修订版，OMP 会为每个服务器检测一次并记住结果：

- **MCP 2026-07-28 服务器**按规范是无状态的。一个进程（或一个远程来源）服务于配置匹配的所有会话。会话首次需要它时启动，在连续 `mcp.idleStopMinutes`（默认 5）分钟未使用后停止；下次调用会再次启动它。
- **需要 `initialize` 握手的服务器**（2025-11-25 及更早版本，以及所有 `sse` 服务器）在进程内保有会话。每个 OMP 会话获得独立进程，在该会话首次调用时启动，在会话结束时停止。

工具、提示和资源列表按服务器缓存，缓存有效期取决于服务器声明的新鲜度（握手时代的服务器不作声明，因此为 30 天），所以从不调用某服务器的会话不会为其启动进程。超过新鲜度窗口的列表仍会立即显示，并在后台刷新。

当以下各项全部相同时，两个会话会共享一个 stdio 服务器：

- `command`、`args` 和工作目录（`cwd`，未设置时为会话的项目目录），
- 服务器 `env` 中的每个变量，使用解析后的值，
- 名称包含 `TOKEN`、`SECRET`、`PASSWORD`、`PASSWD`、`CREDENTIAL`、`API_KEY`、`ACCESS_KEY`、`PRIVATE_KEY`、`PROFILE`、`ACCOUNT`、`TENANT`、`CONFIG`、`CCNAME` 或 `AUTH` 的每个继承环境变量。

其他所有继承变量（`PATH`、终端和 shell 状态）来自启动该进程的会话。实际使用中：

- 未设置 `cwd` 的服务器按项目共享。对于不依赖项目的服务器，设置 `cwd`（例如设为主目录）后，每个项目就会共享一个进程。
- 如果服务器需要看到一个在不同会话间取值不同的变量，请在 `env` 中声明它（`"env": { "AWS_REGION": "${AWS_REGION}" }`）；这样，不同取值的会话会获得独立进程。

发送相同 URL 和头的会话会共享远程服务器；刷新的 OAuth token 会形成一组不同的头。

`/mcp list` 会为每个服务器显示它处于运行还是空闲状态、其 pid 以及共享它的会话数量。`omp ps` 列出托管的进程。

### `stdio` 传输 \{#stdio-transport}

直接运行时配置和配置写入器在省略 `type` 时默认使用 `stdio`。发现流程对仅有 URL 的条目推断为 `http`，对命令条目推断为 `stdio`；要获得可移植且符合模式的配置，请显式指定 `type`。

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

此示例遵循官方 Filesystem MCP 服务器包（`@modelcontextprotocol/server-filesystem`）。

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

此示例对应 GitHub 托管的 GitHub MCP 服务器端点。

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

`sse` 仍受支持以保持兼容，但 MCP 规范现在更推荐新服务器使用 Streamable HTTP（`type: "http"`）。

## 身份验证字段 \{#auth-fields}

OMP 理解两个与身份验证相关的对象。

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

对于托管 OAuth，`auth` 告诉 OMP 如何查找和刷新已存储凭据。虽然 `"apikey"` 是可接受的 `type`，但它不会从身份验证存储中加载或注入 API 密钥。请将 API 密钥直接放在 stdio `env` 或远程 `headers` 中（优先使用下文介绍的环境变量或 `!command` 间接引用）。

通常无需编写此区块：OMP 为 `http`/`sse` 服务器完成 OAuth 流程后，会将凭据存储在由当前激活配置档案和服务器 URL 推导的确定性 id（`mcp_oauth:profile:<profile>:<url>`）下，其中嵌入刷新材料。任何
指向同一 URL 的配置，包括共享项目 `mcp.json` 中完全没有 `auth` 区块的
_仅定义_条目，都会自动解析当前激活
配置档案自己的凭据，即使身份验证存储由
共享身份验证代理提供支持也是如此。这使项目作用域服务器能够安全地跨
配置档案使用：提交定义后，各配置档案通过 `/mcp reauth <name>` 授权自己的账户，
并保持以该账户登录。显式 `credentialId`
若能解析仍会被采用；如果它指向其他配置档案的行，OMP 会回退
到按配置档案划分、以 URL 为键的绑定。

对仅定义条目执行 `/mcp reauth` 不会改动文件，
凭据（包括刷新材料）完全位于当前激活配置档案的
身份验证存储（本地 `agent.db` 或代理）中，因此已提交的项目配置不会
混入本地身份验证状态。显式
配置的 `Authorization` 头（不区分大小写）会禁用自动的 URL 键回退。显式解析的 `auth.credentialId` 仍可提供托管 OAuth 并替换该头。

绑定按配置档案划分，但不按项目划分：配置档案一旦授权某个
URL，_任何_在 `mcp.json` 中定义了该 URL 服务器的检出副本，都会自动使用
该配置档案的凭据连接。已提交的 MCP 定义是
受信任输入，这也早已适用于可运行
任意命令的 `stdio` 条目。因此，在使用持有重要凭据的配置档案打开仓库前，
请审查其 `mcp.json`，或者为不受信任的检出副本使用专用
配置档案。

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

当 MCP 服务器需要显式 OAuth 客户端、权限范围或回调设置时，使用 `oauth`。回调监听器默认使用端口 `3000` 和路径 `/callback`；HTTP 环回 `redirectUri` 会提供自己的端口和路径，除非显式覆盖。HTTPS 环回重定向要求为 TLS 终止器后的本地 HTTP 监听器提供不同的 `callbackPort`。

配置的 `oauth.scope` 就是 OMP 在初次授权和 `/mcp reauth` 时请求的确切权限范围集合；它优先于受保护资源或其身份验证质询公布的范围。没有它时，OMP 请求公布的范围。`insufficient_scope` 升级质询仍会将其指定的范围添加到已授予的范围中。授权服务器的 `scopes_supported` 是可用范围的目录，并非授予全部范围的请求。OMP 不会将该目录复制到登录请求中。如果资源未公布范围，请将 `oauth.scope` 设为已注册客户端获准使用的范围（例如 OpenID Connect 登录使用 `"openid"`），或保持不设置以使用授权服务器默认值。

资源服务器托管的 `/oauth/metadata` 和 `/.mcp/auth` 文档中的范围也会保留，包括嵌套的 `oauth`、`authorization` 和 `auth` 区块。在明确标识的授权服务器上探测这些路径时，其中的 `scopes_supported` 数组不会被视为资源要求。

`prompt` 控制 OAuth 的 `prompt` 授权参数。默认情况下 OMP 省略它，但请求 `offline_access` 范围时默认使用 `"consent"`，以便提供方签发刷新访问权限。可显式设为提供方支持的值，如 `"consent"` 或 `"select_account"`，或设为 `""` 强制省略。

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

Slack 文档中的相关 Slack 端点：

- MCP 端点：`https://mcp.slack.com/mcp`
- 授权端点：`https://slack.com/oauth/v2_user/authorize`
- Token 端点：`https://slack.com/api/oauth.v2.user.access`

## 常用的可复制粘贴示例 \{#common-copy-paste-examples}

### 通过 stdio 使用 Filesystem 服务器 \{#filesystem-server-via-stdio}

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

### 通过 HTTP 使用 GitHub 托管服务器 \{#github-hosted-server-via-http}

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

### 通过 Docker 使用 GitHub 本地服务器 \{#github-local-server-via-docker}

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

此示例对应 GitHub 官方本地 Docker 镜像 `ghcr.io/github/github-mcp-server`。

### 通过 OAuth 使用 Slack 托管服务器 \{#slack-hosted-server-via-oauth}

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

## 密钥与变量解析 \{#secrets-and-variable-resolution}

这一部分通常容易让人出错。

### 发现时的 `${...}` 展开 \{#discovery-time--expansion}

OMP 从 OMP 原生文件和独立回退文件中发现 MCP 配置时，会展开 `${VAR}` 和 `${VAR:-default}` 占位符。展开会递归应用于 `command`、`args`、`env`、`cwd`、`url`、`headers`、`auth` 和 `oauth` 中的字符串值；无法解析的占位符保留为字面字符串。

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

### 连接前的环境变量与头解析 \{#pre-connect-envheader-resolution}

可移植 Agent Plugins 使用不同的密钥语义：只展开 `${PLUGIN_ROOT}` 和 `${PLUGIN_DATA}`。其环境变量和头的值保留为字面值，包括空字符串；不会求值 `!command` 和裸环境变量名称。由提供方展开的市场插件环境变量键也保持字面值。

在 OMP 启动 stdio 服务器或发出 HTTP/SSE 请求前，它会按以下方式解析 stdio `env` 值和 HTTP/SSE `headers` 值：

1. 如果值以 `!` 开头，OMP 会在项目目录中将剩余部分作为 shell 命令运行，超时为 10 秒，并使用去除首尾空白后的 stdout。成功结果会在进程内缓存；并发解析共享同一次命令执行。服务器重新连接时（`/mcp reconnect`、自动重连、`/mcp reload`），以及对于 HTTP/SSE `headers` 在服务器返回 401/403 时，都会重新运行该服务器的命令，随后使用新值重试请求一次。这使生成短期 token 的命令在 token 过期后仍可正常工作。
2. 如果命令失败、超时或只输出空白，则省略该 `env`/`headers` 条目。失败命令会在 30 秒退避后的后续解析中重试。
3. 否则，OMP 检查整个值是否为环境变量名称。
4. 如果该环境变量已设置为非空值，OMP 使用环境变量值；否则按字面使用该字符串。

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

这意味着以下写法对本地密钥有效且方便：

- `"GITHUB_PERSONAL_ACCESS_TOKEN": "GITHUB_PERSONAL_ACCESS_TOKEN"` → 从当前 shell 环境复制
- `"Authorization": "Bearer hardcoded-token"` → 使用字面值
- `"Authorization": "!printf 'Bearer %s' \"$GITHUB_TOKEN\""` → 从命令构造头

## 用户级启用与禁用覆盖 \{#user-level-enable-and-disable-overrides}

当前激活配置档案的用户文件提供两种跨来源覆盖：

- `disabledServers` 是最高优先级的拒绝列表。它会隐藏来自任意来源的同名服务器。
- `enabledServers` 强制启用来源中为 `enabled: false` 或被[内置转换](#built-in-transforms)丢弃的同名条目；它无法覆盖 `disabledServers`。

```json
{
	"$schema": "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json",
	"disabledServers": ["github"],
	"enabledServers": ["tool-owned-server"]
}
```

定义位于 OMP 拥有的可写文件中时，`/mcp enable` 和 `/mcp disable` 会直接更新 `enabled`。OMP 不会修改其他工具的配置：对于这类来源，这些命令转而维护用户级允许列表或拒绝列表，并移除冲突的过时覆盖。

## 内置转换 \{#built-in-transforms}

OMP 会识别某些 MCP 服务器，并在无需用户要求的情况下改变处理方式。目前唯一的转换是丢弃：如果服务器的工作已由 OMP 自带工具完成，就不会连接该服务器。

| 服务器 | 识别依据 | 丢弃条件 |
| --- | --- | --- |
| Codex Desktop 内置的 Node REPL（Codex 在 `~/.codex/config.toml` 中将其注册为 `node_repl`） | 文件名为 `node_repl` 或 `node_repl.exe` 的 stdio 命令，服务器名称不限 | `eval` 工具处于活动状态且 `eval.js` 已开启 |

丢弃决定在发现时（启动和 `/mcp reload`）根据服务器配置作出，发生在服务器启动前。`/mcp list` 会在**已由内置工具替代**下显示被丢弃的服务器及原因和各自的来源文件，`/extensions` 仪表板将其显示为已禁用。

显式启用始终优先：

- `/mcp enable <name>` 会连接被丢弃的服务器并保留它：对 OMP 拥有的条目写入 `enabled: true`，对于其他工具的配置则将名称添加到 `enabledServers`。
- 手动在条目上写入 `enabled: true`，或将名称写入 `enabledServers`，效果相同。
- `mcp.builtinTransforms: false` 关闭所有内置转换。

`omp read` 不应用内置转换。

## `/mcp add` 与直接编辑 JSON \{#mcp-add-vs-editing-json-directly}

希望使用引导式设置时，使用 `/mcp add`。

以下情况使用直接编辑 JSON：

- 需要向导尚未询问的传输或身份验证选项
- 希望粘贴来自其他 MCP 客户端的服务器定义
- 希望在编辑器中使用模式支持的验证

编辑后，使用：

- `/mcp reload` 在当前会话中重新发现并连接服务器
- `/mcp list` 查看服务器来自哪个配置文件
- `/mcp test <name>` 测试单个服务器
- `/mcp reconnect <name>` 重启单个服务器，而不重新发现所有配置；共享的 2026-07-28 服务器会为使用它的每个会话重启
- `/mcp reauth <name>` 替换托管 OAuth 凭据，或用 `/mcp unauth <name>` 移除它们
- `/mcp resources`、`/mcp prompts` 和 `/mcp notifications` 检查非工具类 MCP 能力

## OMP 强制执行的验证规则 \{#validation-rules-omp-enforces}

来自 `packages/coding-agent/src/mcp/config.ts` 中的 `validateServerConfig()`：

- `stdio` 要求有 `command`
- `http` 和 `sse` 要求有 `url`
- 服务器不能同时设置 `command` 和 `url`
- 未知 `type` 值会被拒绝

这些规则适用于直接传给验证器或写入器的配置。发现流程会先转换规范条目：对仅有 URL 的条目推断为 `http`，对命令条目推断为 `stdio`，并保留所选传输方式的字段。不要依赖发现流程来拒绝冲突的原始字段或未知类型；请编写显式且符合模式的传输定义。

`sse` 仍有效以保持兼容，但新托管服务器通常应配置为 `http`。

## 发现与优先级 \{#discovery-and-precedence}

OMP 按优先级从高到低加载提供方。支持 MCP 的顺序为：

1. OMP 原生配置
2. OMP 扩展包
3. Claude Code
4. Agent Plugins
5. 市场插件和 Codex
6. OpenCode
7. 根目录 `mcp.json` / `.mcp.json` 回退文件

跨提供方时，首个定义胜出。同名项不会合并；OpenCode 内部配置层是上文说明的例外。如果不同名称的定义在传输方式、端点或命令输入、身份验证和请求 id 模式上与更高优先级定义等价，也会被遮蔽。

在 OMP 原生配置中，项目 `.omp/mcp.json` 先于 `.omp/.mcp.json`，之后是当前激活配置档案用户级的 `mcp.json` 和 `.mcp.json`。根目录回退 `mcp.json` 先于根目录 `.mcp.json`。实际使用中：

- 对于 OMP 专用覆盖，优先使用 `.omp/mcp.json` 或当前激活配置档案的用户级 `mcp.json`
- 尽可能让不同工具间的名称和端点定义保持唯一
- 第三方配置不断重新引入不需要的服务器时，使用用户级 `disabledServers` 列表
- 设置 `mcp.enableProjectConfig: false` 可在去重前排除每个项目级来源，使同名用户条目得以保留

## 故障排查 \{#troubleshooting}

### `Server "name": stdio server requires "command" field` \{#server-name-stdio-server-requires-command-field}

对于直接传给写入器或客户端的远程配置，设置 `type: "http"`。发现的仅有 URL 的条目会推断为 HTTP；显式 stdio 条目仍需要命令。

### `Server "name": both "command" and "url" are set` \{#server-name-both-command-and-url-are-set}

选择一种传输方式。OMP 将 `command` 视为 stdio，将 `url` 视为 http/sse。

### `/mcp add` 成功，但服务器仍无法连接 \{#mcp-add-worked-but-the-server-still-does-not-connect}

JSON 有效，但服务器可能仍不可达。使用 `/mcp test <name>` 并检查：

- 二进制文件或 Docker 镜像是否存在
- 必需的环境变量是否已设置
- 远程 URL 是否可达
- OAuth 或 API token 是否有效

### 服务器存在于其他工具配置中，但不在 OMP 中 \{#the-server-exists-in-another-tools-config-but-not-in-omp}

运行 `/mcp list`。OMP 会发现许多第三方 MCP 文件，但也可以通过 `mcp.enableProjectConfig` 设置禁用项目级加载，用户级 `disabledServers` 条目也可以按名称抑制服务器。

### Codex 的 `node_repl` 服务器已配置，但始终不加载 \{#codexs-node_repl-server-is-configured-but-never-loads}

当 `eval` 能运行 JavaScript 时，[内置转换](#built-in-transforms)会丢弃它。运行 `/mcp enable node_repl` 可仍然连接它。

### 浏览器 MCP 服务器已配置，但始终不加载 \{#a-browser-mcp-server-is-configured-but-never-loads}

只要内置浏览器前导代码可调用，OMP 就会在加载配置时、任何连接尝试之前丢弃已识别的浏览器自动化服务器：`browser.enabled` 为 true（默认值）、Eval 已注册且处于活动状态，并且会话未限制为显式指定的工具。筛选器会匹配名称为 `playwright`、`puppeteer`、`browserbase`、`browser-tools`、`browser-use` 或 `browser` 的服务器，命令或参数匹配固定的一组已识别浏览器 MCP 包模式（`@playwright/mcp`、`@modelcontextprotocol/server-puppeteer`、`@browserbasehq/mcp-server-browserbase`、`@agentdeskai/browser-tools-mcp`、`@agent-infra/mcp-server-browser`、`puppeteer-mcp`、`playwright-mcp`、`pptr-mcp`、`browser-use-mcp`、`mcp-browser-use`）之一的 stdio 服务器，或 URL 指向 browserbase.com 或 browser-use.com 的 HTTP/SSE 服务器。其他包（例如服务器名称不在上述列表中的 `chrome-devtools-mcp`）不会被匹配。该筛选器独立于 `disabledServers`。

丢弃静默进行，但在各处的可见性不同：除两个主要文件（`~/.omp/agent/mcp.json` 和 `.omp/mcp.json`）以外任何来源的服务器都不会出现在 `/mcp list` 中。第三方配置、根目录 `mcp.json` / `.mcp.json` 回退文件以及来自 OMP 扩展包的服务器一旦被筛选，都会消失。两个主要文件之一中的条目仍会在那里显示为 `not connected`，因此在主要文件中有条目但缺失的服务器可能已被筛除。无论哪种情况，都不会记录错误或警告。

要运行浏览器 MCP 服务器而不是原生浏览器工具，请在设置中配置 `browser.enabled: false`。`omp read` 不应用此筛选器。

### 带命名空间的服务器可以使用，但编辑器拒绝其名称 \{#a-namespaced-server-works-but-the-editor-rejects-its-name}

运行时和配置写入器接受名称中的 `:` 及内部单个空格。内置 JSON 模式的 `propertyNames` 匹配模式目前不接受；这是模式与运行时不一致，而不是连接失败。

### 配置文件静默缺席于列表 \{#a-config-file-is-silently-absent-from-the-list}

格式错误的 JSON 或缺失、无效的服务器映射，会使该提供方不从文件提供任何条目；根据提供方不同，OMP 会记录发现警告或解析失败日志，而不是使会话失败。修正 JSON 结构，然后运行 `/mcp reload` 和 `/mcp list`。

## 参考资料 \{#references}

- MCP 规范，当前修订版：https://modelcontextprotocol.io/specification/2026-07-28
- 握手时代的传输：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- Filesystem 服务器包：https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem
- GitHub MCP 服务器：https://github.com/github/github-mcp-server
- Slack MCP 服务器文档：https://docs.slack.dev/ai/slack-mcp-server/
