---
title: "MCP 服务器与工具编写"
description: "Oh My Pi 官方仓库文档：MCP 服务器与工具编写。"
---

# MCP 服务器与工具编写 \{#mcp-server-and-tool-authoring}

本文介绍 MCP 服务器定义如何在 coding-agent 中成为可调用的 `mcp__*` 工具，以及配置无效、重复、禁用或受身份验证限制时，运维人员应预期什么。

## 架构概览 \{#architecture-at-a-glance}

```text
Config sources (.omp/.claude/.codex/opencode.json, mcp.json, etc.)
  -> discovery providers normalize to canonical MCPServer
  -> loadAllMCPConfigs supplies scope filters and user enablement suppression
  -> capability loader dedupes by server name and equivalent connection (higher priority wins)
  -> MCPManager attaches to the MCP host for each server (auth/header/env resolved first) and lists tools
  -> the host (omp daemon, or in-process) owns the server process or connection and shares it between sessions
  -> manager best-effort loads resources/prompts and subscribes to resource updates when enabled
  -> MCPTool bridge exposes tools as mcp__<server>_<tool>
  -> AgentSession.refreshMCPTools replaces live MCP tools immediately
```

## 1) 服务器配置模型与验证 \{#1-server-config-model-and-validation}

`src/mcp/types.ts` 定义了 MCP 配置写入器与运行时使用的编写结构：

- `stdio`（缺少 `type` 时写入器的默认值）：要求 `command`，可选 `args`、`env`、`cwd`
- `http`：要求 `url`，可选 `headers`
- `sse`：要求 `url`，可选 `headers`（旧版 HTTP+SSE 传输）
- 共用字段：`enabled`、`timeout`、`requestIdFormat`（`"number"` 或 `"string"`）、`instructions`（`boolean`，默认 `true`）、`auth`、`oauth`

`timeout` 以毫秒为单位，默认值为 30,000，接受 `0` 以禁用
客户端超时。有效的 `OMP_MCP_TIMEOUT_MS` 环境变量值会覆盖
逐服务器超时。`requestIdFormat` 和 `instructions` 为 OMP 专有字段；
原生配置、独立 MCP JSON 和 OMP 插件会解析它们，而外部
工具格式提供方通常不会。

`validateServerConfig()`（`src/mcp/config.ts`）强制执行基本传输要求：

- 拒绝同时设置 `command` 和 `url` 的配置
- stdio 要求 `command`
- http/sse 要求 `url`
- 拒绝未知 `type`

`config-writer.ts` 在添加和更新操作时应用此验证，还会验证服务器名称：

- 非空
- 最长 100 个字符
- 由单个空格分隔的 `[a-zA-Z0-9_.:-]` 字符组；不允许首尾空格或重复空格（例如 `cloudflare:cloudflare-api` 或 `MaaS Slack`）

已连接服务器的初始化指令会附加到系统提示的
`MCP Server Instructions` 下，并带有由服务器控制、未经验证的提示。
每个服务器的文本上限为 4,000 个字符。设置 `instructions: false` 可
排除该服务器的指令区块；这不会禁用其工具。

### 传输常见问题 \{#transport-pitfalls}

- 写入器验证将省略的 `type` 视为 stdio，因此添加和更新要求 `command`。能力发现则根据端点推断省略的传输方式（`command` → stdio，否则 `url` → http）。使用显式 `type` 可避免这种差异。
- `sse` 选择旧版协议修订版 2024-11-05 的 HTTP+SSE 传输：持久 GET 流提供 `endpoint` 事件，其 URL 接收 JSON-RPC POST。它与 `"http"` Streamable HTTP 传输不同。
- 传出 JSON-RPC 请求 ID 默认使用递增数字，以兼容生态系统。只有服务器要求旧式雪花字符串行为时，才设置 `requestIdFormat: "string"`；发现时会对无效值发出警告并忽略。
- 验证检查结构，而非可达性：语法有效的 URL 在连接时仍可能失败。

## 2) 发现、规范化与优先级 \{#2-discovery-normalization-and-precedence}

### 基于能力的发现 \{#capability-based-discovery}

`loadAllMCPConfigs()`（`src/mcp/config.ts`）通过 `loadCapability(mcpCapability.id)` 加载规范的 `MCPServer` 条目。

能力层（`src/capability/index.ts`）随后：

1. 并发调用已启用的提供方，然后按优先级顺序汇总
2. 根据 `server.name` 和语义上的连接等价性去重（首个胜出，即最高优先级）
3. 验证保留下来的条目

同名项不会合并。当 `isSameMCPConnection()` 发现传输输入匹配时，
不同名称的定义也可能被遮蔽：包括身份验证、
OAuth、有效的请求 ID 格式，以及 stdio 的命令、参数、环境变量、字面值
键、cwd，或远程的 URL 和头。名称、超时和指令设置不用于
区分等价连接。

被抑制的服务器仍占用其名称，因此被禁用的更高优先级
定义不会回退到同名的更低优先级服务器。它们不会
遮蔽不同名称的等价连接。禁用项目配置会
在去重前丢弃项目条目。

### `.mcp.json` 及相关文件 \{#mcpjson-and-related-files}

`src/discovery/mcp-json.ts` 中专用的回退提供方读取项目根目录的 `mcp.json` 和 `.mcp.json`（低优先级）。

实际使用中，MCP 服务器也来自更高优先级的提供方（例如原生 `.omp/...` 和工具专用配置目录）。编写建议：

- 优先使用 `.omp/mcp.json`（项目）或 `<getAgentDir()>/mcp.json`（用户，默认 `~/.omp/agent/mcp.json`），以便显式控制。原生用户 MCP 配置遵循当前激活的配置档案。
- 需要回退兼容时，使用根目录的 `mcp.json` / `.mcp.json`。
- 在多个来源中复用同一服务器名称会导致按优先级遮蔽，而不是合并。

### 规范化行为 \{#normalization-behavior}

`convertToLegacyConfig()`（`src/mcp/config.ts`）将规范的 `MCPServer` 映射为运行时 `MCPServerConfig`。

关键行为：

- 传输方式按 `server.transport ?? (command ? "stdio" : url ? "http" : "stdio")` 推断
- 保留 `requestIdFormat`；省略意味着数字 ID
- 当前激活配置档案的用户级 `disabledServers` 列表中的名称始终被抑制；`enabled === false` 的服务器会被抑制，除非同一用户配置在 `enabledServers` 中列出它
- 可选字段存在时保留

### 发现期间的环境变量展开 \{#environment-expansion-during-discovery}

OMP 原生 MCP 配置（`.omp/mcp.json`、`~/.omp/agent/mcp.json`，以及它们的 `.mcp.json` 变体）在转换为运行时配置前，会递归展开 `${VAR}` 和 `${VAR:-default}` 占位符。它还接受 `enabled` 的布尔或字符串形式（`true`、`false`、`1`、`0`）和 `timeout` 的数字字符串。`requestIdFormat` 只接受 `"number"` 或 `"string"`；其他值会发出警告并回退为数字 ID。

`src/discovery/mcp-json.ts` 中的独立回退提供方读取项目根目录的 `mcp.json` 和 `.mcp.json`，在端点和身份验证字段中展开相同的 `${...}` 占位符，并对 `enabled`/`timeout` 进行类型检查，不强制转换字符串值。两个提供方都要求超时为有限非负数，并验证 `requestIdFormat` 和布尔型 `instructions`。

无效的 `enabled`/`timeout` 值会被忽略并发出警告，而不会使整个文件失败。

## 3) 身份验证与运行时值解析 \{#3-auth-and-runtime-value-resolution}

`MCPManager.prepareConfig()`/`#resolveAuthConfig()`（`src/mcp/manager.ts`）是连接前的最后处理阶段。

### OAuth 凭据注入 \{#oauth-credential-injection}

对于 `http`/`sse` 服务器，`auth: { type: "oauth", credentialId: "..." }`
区块是可选的。显式 `auth.type: "apikey"` 会禁用 OAuth 凭据
查找。显式指定的任意或旧版 OAuth 凭据 ID
若能解析，OMP 就会采用。托管且按配置档案划分的
`mcp_oauth:profile:<profile>:<url>` ID 只有在其配置档案
已激活，且 URL 与服务器展开后或字面的 URL 匹配时才会接受；不匹配则
忽略。如果接受的显式 ID 无法解析，或者没有 `auth`
区块，OMP 会按从展开后和字面服务器 URL 推导的确定性 ID
查找凭据。这些以 URL 为键的凭据限定于
当前激活配置档案，因此共享的仅定义服务器条目可以使用各个
配置档案独立存储的 OAuth 凭据。

显式配置的 `Authorization` 头（不区分大小写）会抑制
该 URL 键回退。`stdio` 服务器没有可绑定的 URL：其显式
任意或旧版凭据 ID 必须能解析，而以 URL 为键、
按配置档案划分的 ID 会被忽略。

查找成功时：

- `http`/`sse`：注入 `Authorization: Bearer <access_token>` 头
- `stdio`：注入 `OAUTH_ACCESS_TOKEN` 环境变量

如果没有解析到凭据，OMP 会连接，但不注入 OAuth 值。
刷新或凭据解析失败会被记录；可能时，OMP
继续使用现有访问 token。

### 头与环境变量值解析 \{#headerenv-value-resolution}

连接前，管理器通常通过 `resolveConfigValue()`（`src/config/resolve-config-value.ts`）解析 stdio `env` 值和 HTTP/SSE `headers` 值：

- 值以 `!` 开头 => 执行 shell 命令，超时为 10 秒，使用去除首尾空白后的 stdout；成功输出会缓存，并发请求共享一次执行，失败后退避 30 秒。`MCPManager` 会在每次重连、`disconnectAll()` 以及 HTTP/SSE 401/403 时使服务器的命令值失效（`onAuthError`，随后会使用重新解析的头重试一次）
- 失败、超时或只输出空白的命令产生 `undefined`，因此省略该条目
- 否则，使用名称完全匹配的非空环境变量值，回退到字面值；解析结果为空的条目会被省略

插件来源策略标记会改变此行为：`envPolicy: "literal"` 保持
所有环境变量值原样不变，`envLiteralKeys` 保留指定键（包括
空值）。`headerPolicy: "origin-locked"` 保持配置头为字面值，
并将其限制于配置 URL 的来源；客户端生成的头以
不区分大小写的方式优先。发现流程为适用的包
格式提供这些标记，而不是对包数据应用普通密钥命令解析。

运维注意事项：拼错的 `!` 密钥命令可能静默移除该头或环境变量条目，导致下游 401/403 或服务器启动失败。拼错的环境变量名称会按字面发送，除非该字面值碰巧对服务器有意义。

## 4) 工具桥接：MCP -> 智能体可调用工具 \{#4-tool-bridge-mcp---agent-callable-tools}

`src/mcp/tool-bridge.ts` 将 MCP 工具定义转换为 `CustomTool`。

### 命名与冲突域 \{#naming-and-collision-domain}

工具名称生成方式如下：

```text
mcp__<sanitized_server_name>_<sanitized_tool_name>
```

规则：

- 转为小写
- 非 `[a-z0-9_]` 字符变为 `_`
- 连续下划线合并，并去除首尾下划线
- 清理后为空的部分变为 `server` 或 `tool`
- 工具名称中冗余的 `<server>_` 前缀会被剥离一次
- 超过 64 个字符的名称保留可读前缀，并附加 `_` 及对完整、未截断生成名称计算的 `Bun.hash()` 的前八个三十六进制
  字符

不同原始名称仍可能清理为相同标识符（例如
`my-server` 和 `my.server` 的清理结果相似）。插入注册表前，
`deduplicateMCPToolsByName()` 通过按字典序比较
原始 `<server-name>\0<tool-name>` 来源键，确定一个胜出项。
落败来源会被记录并省略，因此重连或发现顺序
不会改变所有权。

在数字得以保留之前，含数字的服务器会生成去除数字的名称
（`context7` → `mcp__context_query_docs`）。用户 `tools.approval` 的 `deny`/`prompt`
策略若以这样的旧名称为键，仍会应用于改名后的工具
（按默认拒绝原则保留限制，即 fail-closed）；旧 `allow` 条目不会继承，必须重新指定键。

### 模式映射 \{#schema-mapping}

`tool-bridge.ts` 在将每个 MCP `inputSchema` 注册为 `CustomTool` 模式前，先将其传入 `normalizeSchemaForMCP()`。MCP 工具声明 `strict: false` 和审批级别 `"write"`；这会禁用提供方的严格输出语法，而不会禁用共享的运行时参数验证器。

分派前，共享工具参数验证在规范化 null 占位符时，会优先使用已匹配的
`anyOf`/`oneOf` 分支。该分支中必填且可空的
属性保留显式 `null` 值；不匹配的封闭
分支不能将它们作为未知字段移除。null 清理和默认值替换
可与判别字段空白修复、按模式进行的类型
强制转换结合，在分支局部候选值内使用有界修复流水线。
如果没有分支接受该候选值，其修复会被丢弃。完整
模式仍会被验证，包括必填字段、不可空属性
和 `oneOf` 互斥性。
分支验证保留完整模式的局部引用上下文、
推测性联合对有损修复的限制，以及防止
标识符空白裁剪的内容祖先保护。
当后续规范化（如标识符空白裁剪）使某个分支可行时，
有界修复轮次会重新考虑 null 清理；无效
候选值绝不会仅因发生变化就被继续传递。

### 传出参数规范化 \{#outbound-argument-normalization}

实时或延迟工具发送 `tools/call` 前，桥接层都会按以下
顺序规范化调用参数：

1. 顶层的非对象值、`null` 和数组变为空
   参数对象。
2. 移除 harness 注入的意图字段 `i`，除非 MCP 工具自身的
   模式声明或约束该字段（包括通过
   模式组合器或局部引用到达的声明）。
3. 对 MCP 模式已声明但未列入 `required` 的属性，
   其值为 `undefined`、空字符串或空的非数组对象时会
   被省略。必填属性、未声明属性、`0`、`false`、`null`
   和数组（包括空数组）会保留。到此时，共享验证已移除模式不接受 `null` 的可选属性上的 `null`；属性模式接受的 `null`（例如 `type: ["string", "null"]`）会到达服务器。
4. 递归遍历嵌套对象和数组中的字符串值。
   已注册的基于文件的内部 URL（不只是 `local://`）会传入
   `InternalUrlRouter.locate()`，并在可用时转换为底层文件系统路径。
   定位前会剥离读取选择器。定位器
   返回 `null` 时保留原始字符串；定位器错误会在
   `tools/call` 前中止规范化。对于 `local://`，现有目录和
   会话根目录也会解析为路径，不存在的目标保持不变，
   无效或越界路径、缺少会话上下文则抛出异常。

因此，服务器作者应针对规范化后的载荷进行验证，而不能
假定模型生成调用中的每个字段都会到达服务器。

### 执行映射 \{#execution-mapping}

`MCPTool.execute()`：

- 调用 MCP `tools/call`
- 合并文本和资源内容，同时保留图像块
- 返回包含 `serverName`、`mcpToolName`、原始内容、MCP `_meta` 和提供方元数据的详情
- 在详情中保留 `structuredContent`，并添加围栏 JSON 文本块，除非已有文本块包含相同 JSON 值
- 将服务器报告的 `isError` 映射为 `Error:` 前缀和 `isError: true`
- 存在重连回调时，通过携带身份验证质询重连并重试一次，处理带有 `_meta["mcp/www_authenticate"]` 的 `isError` 结果
- 对宿主标记为可重试的失败（请求从未到达服务器）尝试重连并重试一次
- 将捕获的传输或运行时失败格式化为 `MCP failure`，包含服务器与工具、传输方式、阶段、失败、可重试性、消息和后续步骤字段
- 将 AbortError 转换为 `ToolAbortError`，保留中止语义

## 5) 运维生命周期：添加、编辑、移除与实时更新 \{#5-operator-lifecycle-addeditremove-and-live-updates}

交互模式在 `src/modes/controllers/mcp-command-controller.ts` 中暴露 `/mcp`。

支持的操作：

- `list`
- `add`（向导或快速添加）
- `remove` / `rm`
- `enable` / `disable`
- `test`
- `reauth` / `unauth`
- `reconnect`
- `reload`
- `resources`、`prompts`、`notifications`

配置写入是原子的（`writeMCPConfigFile`：唯一临时文件加重命名），
读、改、写操作持有逐文件锁。

完整重载使用 `MCPCommandController.reloadServers()`：

1. `mcpManager.disconnectAll()`
2. 清除 MCP 提示命令和能力文件系统缓存
3. 使用当前项目与浏览器筛选条件以及会话扩展根目录执行 `mcpManager.discoverAndConnect()`
4. `session.refreshMCPTools(mcpManager.getTools())`

某些修改只重新连接或断开受影响的服务器，然后刷新
工具。`refreshMCPTools()` 串行化注册表修改，协调
管理器拥有和扩展拥有的 MCP 工具，并立即启用已连接的管理器
工具（`bash` 工具处于活动状态时，作为 bash 工具命令挂载；
在系统提示目录中以裸
`mcp__<server>__<tool>` 名称列出，并带有单行摘要；`<name> --help`
打印从模式推导的用法）。扩展拥有的 MCP 工具保留此前的
选择。更改无需重启即可生效。

### 模式差异 \{#mode-differences}

- **交互式/TUI 模式**：`/mcp` 提供应用内用户体验（向导、OAuth 流程、连接状态文本、即时运行时重新绑定）。
- **SDK/无界面集成**：`discoverAndLoadMCPTools()`（`src/mcp/loader.ts`）返回管理器、已加载工具、逐服务器错误、已连接服务器名称以及提取的 Exa 密钥；没有 `/mcp` 命令的用户体验。连接在后台继续时，缓存定义可能作为延迟工具返回。

## 6) 用户可见的错误界面 \{#6-user-visible-error-surfaces}

用户或运维人员常见的错误字符串：

- 添加和更新验证失败：
   - `Invalid server config: ...`
   - `Server "<name>" already exists in <path>`
- 快速添加参数问题：
   - `Use either --url or -- <command...>, not both.`
   - `--token requires --url (HTTP/SSE transport).`
- 连接和测试失败：
   - `Failed to connect to "<name>": <message>`
   - 超时帮助文本建议增加超时时间
   - 针对 `401/403` 的身份验证帮助文本
- 身份验证/OAuth 流程：
   - `Authentication required ... OAuth endpoints could not be discovered`
   - `OAuth flow timed out. Please try again.`
   - `OAuth authentication failed: ...`
- 使用已禁用服务器：
   - `Server "<name>" is disabled. Run /mcp enable <name> first.`

发现时遇到错误的源 JSON 通常会作为警告或日志处理；配置写入器路径会抛出显式错误。

## 7) 实用编写建议 \{#7-practical-authoring-guidance}

要在此代码库中稳健地编写 MCP：

1. 在所有支持 MCP 的配置来源中保持服务器名称全局唯一。
2. 优先选择经过 MCP 工具名称清理后仍能保持区分的名称，避免生成的 `mcp__` 名称冲突。
3. 使用显式 `type`，避免意外采用 stdio 默认值。
4. 需要覆盖已发现服务器的 `enabled: false` 时，使用当前激活配置档案的用户级 `enabledServers` 列表；如果名称同时出现在两个列表中，`disabledServers` 始终优先。
5. 对于远程 OAuth 服务器，有效的显式 `credentialId` 是可选的：仅定义的 `http`/`sse` 条目可以使用当前激活配置档案绑定到相同 URL 的凭据。需要抑制该 URL 键回退时，使用显式 `Authorization` 头。
6. 使用基于命令的密钥解析（`!cmd`）时，验证命令输出稳定且非空。

## 8) 服务器协议修订版带来的变化 \{#8-what-the-protocol-revision-of-your-server-changes}

OMP 对每个服务器探测一次：响应 `server/discover` 的服务器被视为 MCP 2026-07-28，其他视为握手时代（参见 [`mcp-protocol-transports.md`](./mcp-protocol-transports.md)）。

- 2026-07-28 服务器以**一个进程服务某个用户所有配置相同的会话**，首次使用时启动，空闲 `mcp.idleStopMinutes` 后停止。它不得保留按连接划分的状态：按照规范要求，从工具返回显式句柄，并将句柄作为参数接受。进程内存中的状态会在空闲停止时丢失，并对共享该进程的每个会话可见。
- 在 `tools/list`、`prompts/list` 和 `resources/list` 上声明真实的 `ttlMs`。OMP 会在该时长内从存储提供这些列表，而不启动服务器；`ttlMs: 0` 会使每个新会话都启动它。
- 工具集变化时，在 `subscriptions/listen` 流上发送 `notifications/tools/list_changed`；OMP 会将其扇出给每个已附加会话。
- 握手时代服务器为每个会话分配一个进程，且绝不会因空闲而停止，因此进程内状态仍可工作，代价是每个调用它的会话都需要一个进程。

## 实现文件 \{#implementation-files}

- [`src/mcp/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/types.ts)
- [`src/mcp/config.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/config.ts)
- [`src/mcp/config-writer.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/config-writer.ts)
- [`src/mcp/tool-bridge.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/tool-bridge.ts)
- [`src/discovery/mcp-json.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/mcp-json.ts)
- [`src/modes/controllers/mcp-command-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/mcp-command-controller.ts)
- [`src/mcp/manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/manager.ts)
- [`src/mcp/host/endpoint.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/endpoint.ts)
- [`src/mcp/host/peers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/host/peers.ts)
- [`src/capability/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/index.ts)
- [`src/config/resolve-config-value.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/config/resolve-config-value.ts)
- [`src/mcp/loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/loader.ts)
- [`src/mcp/errors.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/errors.ts)
- [`src/mcp/timeout.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/timeout.ts)
- [`src/mcp/oauth-credentials.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/mcp/oauth-credentials.ts)
- [`src/session/session-tools.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-tools.ts)
- [`shared argument validation`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/ai/src/utils/validation.ts)
