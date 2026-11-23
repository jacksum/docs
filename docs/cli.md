<a id="cli-and-modes-reference"></a>

# 命令行 \{#command-line}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 CLI](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/cli.md)。[上游 MIT 许可证](./license.md)。

本页介绍 Pi 命令行内置的命令和选项。运行 `pi --help`，或在命令末尾添加 `--help`，即可查看所安装版本的确切用法。顶层帮助还会列出已加载扩展注册的选项。

```sh
pi [options] [--] [@files...] [messages...]
pi install <source> [options]
pi remove <source> [options]
pi uninstall <source> [options]
pi update [target] [options]
pi list
pi config [options]
pi auth login <provider> [--api-key] [--no-browser]
pi auth logout <provider>
pi auth <check|print-api-key|print-bearer-token> [options]
pi mcp <add|remove|list|login|logout> [options]
```

<a id="modes"></a>

## 调用方式与输出 \{#invocation-and-output}

```sh
pi
pi --print "Summarize this repository"
git diff | pi --print "Review this change"
pi --mode json "Inspect this repository" > events.jsonl
```

当标准输入（stdin）和标准输出（stdout）都连接到终端时，Pi 会打开终端界面，除非通过 `--print`、`--mode json` 或 `--mode rpc` 选择其他界面。如果其中任一输入输出流被重定向，且未选择 JSON 或 RPC 模式，Pi 会使用输出模式。如何在交互、输出、JSON、RPC 和 SDK 集成之间选择，请参阅[命令行集成](./cli-integration.md)。

| 输入 | 行为 |
|---|---|
| `message` | 提供初始提示词 |
| `@path` | 将文本文件或图片附加到首条提示词 |
| 通过管道传入的 stdin | 将其内容加在首条提示词之前 |
| `--` | 停止解析选项，使提示词可以 `-` 开头 |

Pi 以当前工作目录为基准解析 `@path`。工作目录还决定使用哪份项目配置、在哪发现资源，以及如何对会话分组。

`--print` 控制 Pi 是否只运行一次便退出。`--mode` 选择输出接口。当 stdin 和 stdout 都连接到终端时，`--mode text` 不会强制单次运行；需要这种行为时，请用 `--print`。

| 选项 | 行为 |
|---|---|
| `-p`、`--print` | 运行提供的提示词，将助手的最终文本写入 stdout，然后退出 |
| `--mode text` | 选择文本输出；当 stdin 和 stdout 都连接到终端时，仍会打开终端界面 |
| `--mode json` | 运行提供的提示词，将 JSONL 事件写入 stdout，然后退出 |
| `--mode rpc` | 从 stdin 读取 JSONL 命令，将响应和事件写入 stdout，直到进程关闭 |
| `--export <input> [output]` | 将会话文件导出为 HTML，然后退出；省略 `output` 时会自动确定输出位置 |

RPC 模式不接受 `@file` 参数。JSON 和 RPC 模式的 stdout 仅用于输出协议记录。参阅 [JSON 事件流](./json.md)和 [RPC 协议](./rpc.md)。

<a id="model-options"></a>

## 模型 \{#models}

```sh
pi --model sonnet:high
```

关于模型选择，请参阅[选择模型](./models.md)；关于凭据，请参阅[提供商](./providers.md)。

- `--provider <name>`<br>
  将 `--model` 的查找范围限定为一个提供商。必须同时指定 `--model`。
- `--model <pattern>`<br>
  按精确 ID 或模糊匹配的 ID 或名称选择模型。支持 `provider/id` 和可选的 `:<thinking>` 后缀。如果有多个匹配的提供商，Pi 会优先选择已有凭据的提供商，否则会要求指定 `--provider`。
- `--api-key <key>`<br>
  临时覆盖 API 密钥，不会保存。必须通过 `--model` 或 `--models` 选择模型。此选项不会在提供同一模型的多个提供商之间作出选择。
- `--thinking <level>`<br>
  将思考级别设为 `off`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max`。此选项覆盖 `--model` 的后缀设置，并将级别限制在模型支持的范围内。
- `--models <patterns>`<br>
  设置以逗号分隔的模型范围，供启动时选择和循环切换使用。支持精确 ID、模糊匹配、不区分大小写的 glob 模式，以及可选的 `:<thinking>` 后缀。如果多个提供商都提供同一个模型，Pi 会分别添加每个提供商的该模型，并发出警告。
- `--list-models [search]`<br>
  列出可用模型后退出。可用模糊搜索筛选结果。

<a id="session-options"></a>

## 会话 \{#sessions}

```sh
pi --continue
```

关于恢复会话、创建会话分支、命名和存储，请参阅[会话与上下文](./sessions.md)。

- `-c`、`--continue`<br>
  继续当前目录中最近的会话。
- `-r`、`--resume`<br>
  打开会话选择器，并在所选会话的工作目录中恢复该会话。按 Tab 可将其他目录的会话一并列出。
- `--session <path|id>`<br>
  按文件路径、完整 ID 或部分 ID 打开会话，并在其工作目录中恢复会话。如果这个 ID 只匹配存储在其他目录下的会话，Pi 会提示改为在当前目录创建该会话的分支。
- `--session-id <id>`<br>
  如果当前目录中已有该 ID 对应的会话，就打开它；否则创建会话。ID 可包含字母、数字、`.`、`_` 和 `-`。
- `--fork <path|id>`<br>
  按文件路径、完整 ID 或部分 ID 选择一个会话，在当前目录中从它创建一个新会话。
- `--session-dir <dir>`<br>
  覆盖会话的存储和查找位置。其优先级高于 `PI_CODING_AGENT_SESSION_DIR` 和 `sessionDir` 设置。
- `--no-session`<br>
  使用仅保存在内存中、不持久化的会话。
- `-n`、`--name <name>`<br>
  设置会话的显示名称。

限制：

- 会话 ID 必须以字母或数字开头并结尾。
- `--fork` 不能与 `--session`、`--continue`、`--resume` 或 `--no-session` 同时使用。
- `--session-id` 不能与 `--session`、`--continue` 或 `--resume` 同时使用。将它与 `--fork` 一起使用可指定新的 ID。

<a id="tool-options"></a>

## 工具 \{#tools}

```sh
pi --tools read,grep,find,ls --print "Review this project"
```

关于如何配置默认选用的工具，请参阅[设置](./settings.md#tools)。

- `-t`、`--tools <list>`<br>
  使用以逗号分隔的允许列表替换默认选用的工具。列表可包含内置工具、扩展工具或自定义工具。列表项可以是工具名称或模式，其中 `*` 可匹配任意字符。除非有列表项以 `mcp__` 开头，否则会保留 MCP 工具（参阅 [MCP 工具](#mcp-tools)）。如果列表仅由 `+name` 和 `-name` 项组成，它只调整默认选用的工具，不作为允许列表。
- `-xt`、`--exclude-tools <list>`<br>
  在其他所有工具筛选选项生效后，禁用以逗号分隔的名称或模式所匹配的工具，包括 MCP 工具。
- `-nbt`、`--no-builtin-tools`<br>
  禁用默认的内置工具，但保留扩展工具和自定义工具。
- `-nt`、`--no-tools`<br>
  启动时禁用所有内置工具、扩展工具、自定义工具和 MCP 工具。

默认启用的工具是 `read`、`bash`、`edit` 和 `write`，除非通过 `defaultTools` 更改。在 `--tools` 中使用不带前缀的名称会替换整组工具，因此请列出所有需要的工具。与 `defaultTools` 一样，此选项也接受仅由 `+name` 和 `-name` 项组成的列表，用于在默认选用的工具中增减工具：`pi --tools +codemode,-write` 会保留其余默认工具，启用 `codemode` 并禁用 `write`。这些项仅接受确切的工具名称，不支持 `*` 模式；如需按模式禁用工具，请使用 `--exclude-tools`。不带前缀的名称不能与 `+name` 或 `-name` 项混用。`/reload` 会启用新加入 `defaultTools` 的工具，但通过 `-name` 移除的工具仍不会启用。

<a id="mcp-tools"></a>

`--tools` 选择向模型声明的工具。此选项不会移除 MCP 工具，这些工具的可用范围由其[暴露方式](./mcp.md#control-tool-exposure)决定：使用 `pi --tools read,codemode` 时，codemode 脚本仍可调用所有 MCP 工具。无论暴露方式如何，未被任何列表项点名或匹配的 MCP 工具都不会直接向模型声明；只有在列表中包含 `tool_search` 时，才能通过它加载这类工具。只要有列表项以 `mcp__` 开头，`--tools` 也会筛选 MCP 工具，所以下面的用法只保留 `radius` 服务器的工具：

```sh
pi --tools read,bash,codemode,'mcp__radius__*'
```

MCP 资源工具（`list_mcp_resources`、`list_mcp_resource_templates`、`read_mcp_resource`）也属于 MCP 工具。要移除 MCP 工具，请使用 `--exclude-tools 'mcp__*'` 或 [`--no-mcp`](#resource-options)。

| 内置工具 | 用途 |
|---|---|
| `read` | 读取文本文件和受支持的图片 |
| `bash` | 运行 Shell 命令 |
| `powershell` | 在 Windows 上运行 PowerShell 命令 |
| `edit` | 对现有文件进行精确的文本替换 |
| `write` | 创建或覆盖文件 |
| `grep` | 搜索文件内容 |
| `find` | 使用 glob 模式查找路径 |
| `ls` | 列出目录内容 |

内置扩展还提供两个工具。这两个工具默认关闭；MCP 服务器需要它们时，MCP 扩展会启用它们（参阅 [MCP](./mcp.md#control-tool-exposure)）。要自行启用，请在 `--tools` 或 `defaultTools` 中列出工具名称。

| 内置扩展 | 用途 |
|---|---|
| `codemode` | 运行调用其他工具的 JavaScript 代码，例如通过 `Promise.allSettled` 并行调用工具；只有脚本的输出会传给模型 |
| `tool_search` | 搜索尚未向模型声明的工具（暴露方式为 `codemode` 或 `deferred` 的工具，如 MCP 工具），并为下一次模型调用声明匹配的工具 |

### 启用 codemode \{#enable-codemode}

要为每个会话启用 `codemode`，请将它添加到 `~/.pi/agent/settings.json` 或项目的 `.pi/settings.json` 中的默认工具列表：

```json
{
  "defaultTools": ["+codemode"]
}
```

这样会保留 `read`、`bash`、`edit` 和 `write`，并添加 `codemode`。若只需在一次调用中启用，请通过 `--tools` 添加：

```sh
pi --tools +codemode
```

即使不使用 MCP，也可以通过 codemode 脚本并行调用多个工具，在大量输出传给模型前进行筛选，通过 `models.classify()` 调用 TypeSafe 的 Jev 等分类模型（参阅[分类模型](./models.md#use-classifier-models)），以及通过 `models.generateImages()` 生成图片（参阅[图像模型](./models.md#use-image-models)）。

### codemode 的工作机制 \{#how-codemode-works}

脚本在 QuickJS 沙箱中运行，通过 `tools.<name>(args)` 调用其他工具。[Codemode](./codemode.md)介绍了脚本 API、如何列出和查找工具、`store()` 和 `models` 全局对象，以及相关限制。

### 工具搜索 \{#tool-search}

`tool_search` 默认关闭；可通过 `"defaultTools": ["+tool_search"]` 或 `--tools` 启用。它使用与 `searchTools()` 相同的排序方式对尚未声明的工具进行排序，并为下一次模型调用声明匹配的工具。与其他工具变更一样，已加载的工具会记录在会话中，因此在该分支上会保持声明状态。

<a id="resource-options"></a>

## 资源 \{#resources}

```sh
pi --extension ./review.ts
```

关于约定目录和项目可信设置，请参阅[配置](./configuration.md)；关于配置中的路径，请参阅[设置](./settings.md#resources)；关于软件包来源，请参阅 [Pi 软件包](./packages.md)。

- `-e`、`--extension <path>`<br>
  加载扩展文件、扩展目录或内置扩展（如 `builtin:mcp`）。可多次指定。
- `-ne`、`--no-extensions`<br>
  禁用自动发现的扩展、配置中的扩展和内置扩展。通过 `-e` 明确指定的路径仍会加载，因此 `pi -ne -e builtin:mcp` 只保留内置 MCP 支持。
- `--no-mcp`<br>
  禁用本次运行的内置 MCP 支持：不会连接任何服务器，也不会提供 MCP 工具或 `/mcp`。此选项不影响取代内置 MCP 支持的扩展。
- `--skill <path>`<br>
  加载技能文件或目录。可多次指定。
- `-ns`、`--no-skills`<br>
  禁用自动发现的技能和配置中的技能。通过 `--skill` 明确指定的路径仍会加载。
- `--prompt-template <path>`<br>
  加载提示词模板文件或目录。可多次指定。
- `-np`、`--no-prompt-templates`<br>
  禁用自动发现的模板和配置中的模板。通过 `--prompt-template` 明确指定的路径仍会加载。
- `--theme <path>`<br>
  加载主题文件或目录。可多次指定。
- `--use-theme <name[/name]>`<br>
  选择本次运行的交互界面初始主题。
- `--no-themes`<br>
  禁用自动发现的主题和配置中的主题。通过 `--theme` 明确指定的路径仍会加载。
- `-nc`、`--no-context-files`<br>
  禁止自动发现 `AGENTS.md` 和 `CLAUDE.md`。

资源路径仅对当前进程生效。相对路径以当前工作目录为基准解析。

<a id="prompt-and-display-options"></a>

## 提示词与进程 \{#prompts-and-process}

```sh
pi --append-system-prompt ./instructions.md
```

关于已保存的配置，请参阅[配置](./configuration.md)；关于项目可信设置，请参阅[安全](./security.md#understand-project-trust)；关于如何控制进程，请参阅[环境变量](./environment-variables.md)。

- `--system-prompt <text|path>`<br>
  用指定的文本或现有文件的内容替换默认系统提示词。
- `--append-system-prompt <text|path>`<br>
  将指定的文本或现有文件的内容追加到系统提示词。可多次指定。
- `--tui-mode <mode>`<br>
  使用 `fullscreen`（默认）或 `regular` 终端模式。
- `--verbose`<br>
  在以交互模式启动时显示详细信息，覆盖 `quietStartup` 设置。
- `-a`、`--approve`<br>
  在当前进程中信任项目本地的配置和资源。
- `-na`、`--no-approve`<br>
  在当前进程中忽略需要信任项目后才能加载的项目本地配置和资源。
- `--offline`<br>
  禁用自动网络活动，包括刷新模型目录。等同于 `PI_OFFLINE=1`。
- `-h`、`--help`<br>
  显示帮助（包括已加载扩展注册的选项），然后退出。
- `-v`、`--version`<br>
  显示 Pi 版本，然后退出。

扩展可以注册额外的长选项。Pi 会拒绝未知的短选项。

## 软件包命令 \{#package-commands}

```sh
pi install npm:@scope/package
```

关于来源格式、筛选、安装和项目作用域，请参阅 [Pi 软件包](./packages.md)。

### 常见任务 \{#common-tasks}

| 任务 | 命令 |
|---|---|
| 安装软件包 | `pi install <source>` |
| 列出已配置的软件包 | `pi list` |
| 移除软件包及其设置项 | `pi remove <source>` |
| 指定要加载的软件包资源 | `pi config` |

添加 `--local` 或 `-l` 可改用项目设置，而不是全局设置。此选项适用于 `install`、`remove`、`uninstall` 和 `config`。

### 更新 Pi 或软件包 \{#update-pi-or-packages}

运行 `pi update` 时若未指定目标，将更新 Pi 本身。

| 任务 | 命令 |
|---|---|
| 更新 Pi | `pi update` |
| 更新所有已安装的软件包 | `pi update --extensions` |
| 更新一个已安装的软件包 | `pi update <source>` |
| 刷新模型目录 | `pi update --models` |
| 更新 Pi 和所有已安装的软件包 | `pi update --all` |

如果所选更新包含 Pi，可添加 `--force` 来重新安装 Pi。

如果 Pi 由 Nix 等其他软件包管理器提供，`pi update` 无法更新 Pi 本身。请使用相应的软件包管理器更新 Pi，例如运行 `nix profile upgrade pi`。这不影响软件包和模型目录的更新。

#### 自定义更新命令 \{#custom-update-command}

如果 Pi 由包装程序或其他软件包管理器提供，可以设置 `PI_SELF_UPDATE_COMMAND`，让 `pi update` 执行其中指定的更新命令：

```sh
export PI_SELF_UPDATE_COMMAND="mise use -g npm:{packageName}@{version}"
```

`pi update` 只在 pi.dev 上有更新版本时运行该命令，并将 `{packageName}`、`{version}` 和 `{installSpec}`（`{packageName}@{version}`）替换为该版本的对应值。此设置值按空格拆分。如果参数中有空格，请改用 `selfUpdateCommand` 设置（位于 `~/.pi/agent/settings.json`），填入 argv 数组，例如 `["nix", "profile", "upgrade", "pi"]`。

### 别名和命令选项 \{#aliases-and-command-options}

- `pi uninstall <source>` 是 `pi remove <source>` 的别名。
- `pi update --self`、`pi update self` 和 `pi update pi` 都是 `pi update` 的别名。
- `pi update --extension <source>` 是 `pi update <source>` 的别名。
- `-a`、`--approve` 仅在执行当前命令时信任项目本地文件。`-na`、`--no-approve` 会忽略需要信任项目后才能加载的项目本地文件。
- 在命令末尾添加 `-h` 或 `--help`，即可查看确切用法和选项限制。

## 凭据命令 \{#credential-commands}

`pi auth login <provider>` 在终端中登录提供商，然后退出，不会启动会话。与 `/login <provider>` 一样，它会打开浏览器以登录账号。不支持账号登录的提供商会要求提供 API 密钥。登录 Radius 时，如果尚无全局服务器使用该登录凭据，此命令还会将 Radius MCP 服务器添加到 `~/.pi/agent/mcp.json`。此命令需要交互式终端。

| 选项 | 说明 |
|---|---|
| `--api-key` | 不登录账号，改为保存 API 密钥；读取密钥时不会回显 |
| `--no-browser` | 不打开浏览器，改用提供商支持的其他登录方式，例如通过 SSH 使用设备代码。若有多种方式，Pi 会提示选择。不能与 `--api-key` 同时使用 |

`pi auth logout <provider>` 会删除 `pi auth login` 或 `/login` 保存的凭据，行为与 `/logout` 相同。环境变量和 `models.json` 配置不变。如果没有已保存的凭据，该命令会以状态码 `0` 退出，因此可以安全地重复执行。

```sh
pi auth login radius
pi auth logout radius
pi auth check --provider openai --json
```

其他身份验证命令需要指定 `--provider <provider>` 或 `--model <model>`。关于支持的身份验证方式，请参阅[提供商](./providers.md)。

| 命令 | 说明 |
|---|---|
| `pi auth check` | 输出 `ready`、`not_ready` 或 `invalid`，分别以状态码 `0`、`1` 或 `2` 退出 |
| `pi auth print-api-key` | 输出解析得到的 API 密钥 |
| `pi auth print-bearer-token` | 输出解析得到的 OAuth 不记名令牌 |

| 选项 | 适用命令 | 说明 |
|---|---|---|
| `--provider <provider>` | 所有命令 | 解析指定提供商的凭据 |
| `--model <model>` | 所有命令 | 根据模型解析凭据，可与 `--provider` 同时使用 |
| `--json` | `auth check` | 以 JSON 格式输出结构化结果 |
| `--credentials` | `auth check` | 凭据就绪时输出解析得到的凭据 |
| `--no-refresh` | `auth check` | 不刷新已过期的 OAuth 凭据；默认会刷新 |
| `--min-expiry <duration>` | `print-bearer-token` | 指定令牌剩余有效期的下限，单位可为 `ms`、`s`、`m` 或 `h`，例如 `30m` |

输出凭据的命令会将机密信息写入 stdout。

## MCP 命令 \{#mcp-commands}

这些命令无需在会话中运行，因此代理可通过 `bash` 执行它们。参阅 [MCP 服务器](./mcp.md)。

| 命令 | 说明 |
|---|---|
| `pi mcp add <server> [options] -- <command> [args...]` | 在 `mcp.json` 中添加或替换一个 stdio 服务器；`--env KEY=VALUE`（可多次指定）设置其环境变量，`--cwd <dir>` 设置其工作目录。服务器启动命令之后的参数会传给该命令 |
| `pi mcp add <server> [options] --url <url>` | 添加或替换一个可流式传输的 HTTP 服务器；使用 `--header KEY=VALUE`（可多次指定）、`--bearer-token-env-var <NAME>`（发送 `Authorization: Bearer ${NAME}`）、`--oauth-client-id`、`--oauth-client-secret`、`--oauth-callback-port`、`--oauth-client-name` 和 `--oauth-client-registration`（`auto`、`cimd` 或 `dcr`）配置身份验证 |
| `pi mcp remove <server>` | 从 `mcp.json` 中移除服务器；已存储的 OAuth 凭据仍会保留 |
| `pi mcp list [--json]` | 连接每台已启用的服务器，输出其状态、工具和错误；如果有配置项无效或有已启用的服务器未连接，以状态码 `1` 退出 |
| `pi mcp login <server> [-l] [--timeout <seconds>]` | 登录 OAuth 服务器：打开授权页面并等待浏览器完成授权；也可以将重定向 URL 粘贴到终端中。`--timeout` 限制整个登录过程的时长，包括向授权服务器发送请求的时间（默认 300 秒）。使用 `-l` 时，必须在项目的 `.pi/mcp.json` 中定义该服务器 |
| `pi mcp logout <server> [-l]` | 删除服务器已存储的 OAuth 凭据 |

`add` 和 `remove` 默认修改 `~/.pi/agent/mcp.json`。要改为修改当前目录下的 `.pi/mcp.json`，请使用 `--local`（`-l`）。`add` 还接受 `--exposure <mode>`（参阅[暴露方式](./mcp.md#control-tool-exposure)）和 `--description <text>`，且不会连接服务器；请运行 `pi mcp list` 检查服务器。

只有已受信任的项目，其 `.pi/mcp.json` 文件才会被读取。
