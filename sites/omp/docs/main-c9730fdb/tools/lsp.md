---
title: "lsp"
description: "Oh My Pi 官方仓库文档：lsp。"
---

# lsp \{#lsp}

> 查询语言服务器，获取诊断、导航、符号、重命名、代码操作、能力及原始请求结果。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/lsp/tool.ts`（`LspTool`）；`packages/coding-agent/src/lsp/index.ts` 重新导出该工具。
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/lsp.md`
- 关键协作模块：
   - `packages/coding-agent/src/lsp/client.ts`：客户端进程生命周期和 JSON-RPC
   - `packages/coding-agent/src/lsp/config.ts`：配置加载、自动检测、服务器选择
   - `packages/coding-agent/src/lsp/lspmux.ts`：可选的 `lspmux` 命令包装
   - `packages/coding-agent/src/lsp/mux/daemon.ts`：代理服务共享的 LSP 传输及私有进程回退
   - `packages/coding-agent/src/lsp/edits.ts`：应用 `WorkspaceEdit` 和文本编辑；支持回滚安全的引用编辑及文件系统重命名
   - `packages/coding-agent/src/lsp/servers.ts`：导航路由、启动发现与预热、重新加载、只读操作集合
   - `packages/coding-agent/src/lsp/diagnostics.ts`：推送和拉取诊断的新鲜度、等待预算、位置格式化、引用与符号限制
   - `packages/coding-agent/src/lsp/workspace-diagnostics.ts`：根标记检测及限制并发的工作区检查器
   - `packages/coding-agent/src/tools/details/lsp.ts` / `packages/coding-agent/src/ui/tools/lsp.tsx`：结果详情和 TUI 渲染
   - `packages/coding-agent/src/lsp/utils.ts`：符号解析、格式化、glob 展开
   - `packages/coding-agent/src/lsp/uri.ts`：文件 URI 转换及以 URI 为键的映射
   - `packages/coding-agent/src/lsp/types.ts`：工具模式和协议类型
   - `packages/coding-agent/src/lsp/clients/index.ts`：自定义 lint 客户端缓存与工厂
   - `packages/coding-agent/src/lsp/clients/lsp-linter-client.ts`：基于 LSP 的 lint 适配器
   - `packages/coding-agent/src/lsp/clients/biome-client.ts`：Biome CLI 诊断与格式化适配器
   - `packages/coding-agent/src/lsp/clients/swiftlint-client.ts`：SwiftLint CLI 诊断适配器
   - `packages/coding-agent/src/tools/index.ts`：工具注册及 `lsp.enabled` 开关控制
   - `packages/coding-agent/src/tools/tool-timeouts.ts`：超时默认值及范围钳制
   - `packages/coding-agent/src/lsp/defaults.json`：用于自动检测的内置服务器定义

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `action` | string enum | 是 | `diagnostics`、`definition`、`references`、`hover`、`symbols`、`rename`、`rename_file`、`code_actions`、`type_definition`、`implementation`、`status`、`reload`、`capabilities`、`request` 之一。 |
| `file` | string | 否 | 文件路径；对于 `diagnostics` 也可以是 glob；工作区形式使用 `"*"`；对于 `rename_file`，这是源路径。 |
| `line` | number | 否 | 从1开始计数的行号，用于基于位置的操作。在单文件操作路径上默认为 `1`。 |
| `symbol` | string | 否 | 用于解析 `line` 上列位置的文本；裸标识符要求匹配标识符边界，其他文本按子字符串匹配。优先精确匹配大小写，其次进行不区分大小写匹配。支持 `name#N` 出现次数选择器；`N` 从1开始计数，默认为 `1`。面向感知项目的服务器执行 `definition`/`references`/`rename` 时，如果提供了 `line`，则必须提供此字段。 |
| `query` | string | 否 | 工作区符号查询、代码操作选择器或筛选条件，或在 `action=request` 时作为 LSP 方法名。 |
| `new_name` | string | 否 | `rename` 和 `rename_file` 必填。 |
| `apply` | boolean | 否 | 对于 `rename`/`rename_file`，除非显式为 `false`，否则应用更改。对于 `code_actions`，除非显式为 `true`，否则只列出。 |
| `timeout` | number | 否 | 单位为秒；模式接受 `5..300`。同时设置调用截止时间和感知项目的诊断等待时间，可提高或降低默认值（调用为 `max(20, lsp.requestTimeout)`，等待为 `lsp.requestTimeout`）。`resolveLspTimeouts()` 先应用正值的 `tools.maxTimeout` 上限，再应用工具的 `5..300` 范围，因此5秒下限仍优先于更低的全局上限。 |
| `payload` | string | 否 | 用于 `action=request` 的 JSON 字符串；覆盖自动构造的参数。 |

## 输出 \{#outputs}

- 单次返回的 `AgentToolResult`；`content` 始终只有一个文本块：`[{ type: "text", text: string }]`。
- `details` 为 `LspToolDetails`：包含 `action`、`success`、可选的 `serverName` 及可选的原始 `request`。
- `No definition found` 之类的空导航或符号查询结果还会标记 `useless: true`，以便上下文压缩时省略；无问题的诊断结果会作为验证证据保留。
- 没有流式更新、产物 URI 或后台任务。内联 TUI 渲染器合并调用和结果，按操作类型格式化，并支持折叠与展开视图。
- 此工具通过发现加载，而不是预先加载。只读操作（`diagnostics`、导航、悬浮信息、符号、`status`、`capabilities`）请求读取审批；`rename`、`rename_file`、`code_actions`、`reload` 和 `request` 无论 `apply` 如何，都请求写入审批。
- 许多校验失败会作为普通文本结果返回，并带有 `details.success: false`；中止则抛出 `ToolAbortError`。

## 流程 \{#flow}

1. `packages/coding-agent/src/tools/index.ts` 注册 `lsp: LspTool.createIf`。只有 `session.enableLsp !== false` 和 `lsp.enabled`（默认为 `true`）都允许时，工具才存在。带有 `lspReadOnly` 的会话会拒绝 `LSP_READONLY_ACTIONS` 以外的所有操作；受限会话默认禁用 LSP，若显式重新启用，则默认只读。
2. `packages/coding-agent/src/lsp/tool.ts` 中的 `LspTool.execute()` 使用 `resolveLspTimeouts()` 解析 `timeout` 和 `lsp.requestTimeout` 设置，包括可选的全局 `tools.maxTimeout` 上限，为调用截止时间创建 `AbortSignal.timeout(...)`，并与调用方信号组合。
3. `getConfig()` 按 cwd 加载并缓存 `LspConfig`，后续调用复用该缓存配置。工作区 `reload` 是显式例外：它会在重新加载新选择的服务器之前，清除并重建该 cwd 的配置缓存。
4. `packages/coding-agent/src/lsp/config.ts` 中的配置加载，会将 `defaults.json` 与来自项目、项目配置目录、用户配置目录、插件根目录或插件市场元数据，以及主目录的 JSON/YAML 覆盖项合并。所有情况下，都会筛除已禁用的服务器，要求匹配根标记且本地或 PATH 中存在可解析的可执行文件，然后选择一个 TypeScript 服务器。文件名、优先级和服务器字段，参见 [LSP 配置](../lsp-config.md)。
5. 服务器路由使用 `config.ts` 中的 `getServersForFile()` / `getServerForFile()`：先匹配扩展名或基本文件名，再将主服务器排在 lint 服务器之前。`servers.ts` 中的辅助函数通过 `getLspServersForFile()` / `getLspServerForFile()`，将自定义 `createClient` 适配器排除在导航与重构路径之外。
6. `getOrCreateClient()` 按解析后的启动命令、cwd、参数、初始化选项、设置和语言 ID 缓存。启用 `lsp.shared` 时（在 SDK 会话中默认为 `true`），它会先向代理服务管理的项目 mux 请求共享传输；失败时回退到私有的 `ptree.spawn()`。外部 `lspmux` 包装器优先于代理服务共享。在会话中切换 `lsp.shared` 会影响之后冷启动的服务器；已经运行的客户端保留原传输。客户端启动消息读取器，发送 `initialize`，保存能力，再发送 `initialized`。
   如果初始化超时，错误会指出解析后的可执行文件，omp 会停止失败的启动程序及其子进程。只有完成握手的共享服务器才会保持预热状态以供复用。
7. `client.ts` 中的消息读取器解析 LSP 帧、完成待处理请求、缓存 `publishDiagnostics`、跟踪表示项目加载完成的 `$/progress` 令牌、回答 `workspace/configuration`、处理动态能力注册，并通过 `applyWorkspaceEditWithLsp()` 应用 `workspace/applyEdit`。
8. 语义单文件操作和指定具体文件的原始请求，会在查询前调用 `reconcileFileFromDisk()`：尚未打开的文件会被打开；外部更改过的文件发送 `didChange` 并丢弃过期诊断。`definition`、`type_definition`、`implementation`、`references`、`hover`、`code_actions` 和 `rename` 还会在项目加载等待之后、紧接请求之前调用 `reconcileOpenFilesFromDisk()`，使其他所有已打开文档也与磁盘一致；已打开文档若无法再读取，会使 `rename` 和应用代码操作失败，对其他操作则关闭该文档。打开、协调及刷新文档和解析符号列位置时，会拒绝非普通文件（FIFO、设备、套接字），而不是读取它们；返回位置中的非普通文件会像缺失文件一样，只列出位置，不附上下文行。正在进行的 OMP 写入不会被协调回较旧的磁盘内容。列位置解析在目标行上使用 `utils.ts` 的 `resolveSymbolColumn()`，并遵循 `#N` 出现次数选择器。
   在文档首次 `didOpen` 之前，`client.ts` 中的 `ensureWorkspaceFolder()` 会查找文件所属的检出目录（解析符号链接后，最近的持有 `.git` 的祖先目录）。当它不是会话 cwd 所在的检出目录（同级工作树，或嵌套在两者任一者中的工作树或检出目录）、不包含主目录，且服务器声明支持 `workspace.workspaceFolders.changeNotifications` 时，会通过 `workspace/didChangeWorkspaceFolders` 将该检出目录添加一次：延长待处理的项目加载等待（或启动新的等待），且只有在添加之后开始的进度才会结束该等待；`workspace/workspaceFolders` 的回答会列出它，其下被监视的文件更改也会送达服务器。客户端每次只交付一个添加操作，因此写入失败只会撤销自身的项目加载等待。不声明支持此能力的服务器只保留会话根目录。添加了检出目录时，如果服务器以 ContentModified（`-32801`）取消了 `workspace/executeCommand` 之外的请求，会在项目加载后、请求超时范围内重试一次。`diagnostics` 在等待项目加载之前添加检出目录；`rename_file` 在发送 `workspace/willRenameFiles` 之前，通过一条通知添加每个源文件和目标文件所属的检出目录。
9. 操作通过 `tool.ts` 中的专用分支在 `LspTool.execute()` 内分派：工作区及多服务器分支（`status`、`diagnostics`、`rename_file`、工作区 `symbols`、工作区 `reload`、`capabilities`、`request`）先于单文件 switch 执行；其他操作共用一次客户端查找。
10.   请求经由 `client.ts` 中的 `sendRequest()` 发送，它分配递增的 JSON-RPC ID，安装中止和超时处理，在中止时发送 `$/cancelRequest`，并在超时或进程退出时拒绝请求。
11.   返回的编辑通过 `formatWorkspaceEdit()` 预览，或通过 `applyWorkspaceEditWithLsp()` 应用，后者会更新受影响的活动 LSP 文档。`rename_file` 使用 `applyEditsThenRename()` 执行引用编辑和文件系统移动，然后发送 `workspace/didRenameFiles`。
12.   单文件操作块内的普通失败会变为 `LSP error: ...`；`ToolError` 和中止会继续抛出。许多前置条件失败会直接返回明确文本，不抛出异常。

## 模式 / 变体 \{#modes--variants}

### 路由与工作区作用域 \{#routing-and-workspace-scope}

- `file: "*"` 只对 `diagnostics`、`symbols` 和 `reload` 有特殊含义。
- `status` 忽略 `file`。
- `capabilities` 未提供 `file` 或为 `"*"` 时检查所有非自定义 LSP 服务器；提供具体文件时，范围限定为匹配的非自定义服务器。
- `request` 未提供 `file` 或为 `"*"` 时选择第一个可用的非自定义 LSP 服务器；提供具体文件时选择该文件的主服务器，而非 lint 服务器。
- `rename_file` 向 `getLspServers(config)` 中 `fileTypes` 匹配源路径、目标路径或任一已枚举重命名文件对的所有非自定义 LSP 服务器发送 `workspace/willRenameFiles` 和 `workspace/didRenameFiles`，而不只是一个按文件选定的服务器。
- 诊断是唯一同时查询普通 LSP 服务器和自定义 lint 客户端（`BiomeClient`、`SwiftLintClient` 或 `LspLinterClient`）的工具操作。

### `diagnostics` \{#diagnostics}

**输入**

- 必填：`file`，除非使用 `file: "*"` 的工作区模式。
- 可选：`timeout`。

**执行**

- `file: "*"`：`runWorkspaceDiagnostics()` 按 Rust → TypeScript → Go → Python 的顺序检测所有受支持的根标记语言，并最多并发运行两个检查器。它对 `Cargo.toml` 运行 `cargo check --message-format=short`，对 `tsconfig.json` 运行 `npx tsc --noEmit`，对 `pyproject.toml` / `pyrightconfig.json` 运行 `pyright`，对 `go.work` / `go.mod` 运行 `go build`。`go.work` 优先于 `go.mod`：它读取 `go work edit -json`，构建每个 `Use[].DiskPath/...` 模式（回退为 `./...`）；单模块使用 `./...`。多语言输出包含按顺序排列的逐语言分区。未知项目只返回受支持标记的提示，不启动检查器。
- 具体文件或 glob：`resolveDiagnosticTargets()` 将非 glob 视为单个目标，否则使用 `Bun.Glob` 展开，最多为 `MAX_GLOB_DIAGNOSTIC_TARGETS` 个目标。
- 对每个文件，运行所有匹配的服务器：自定义客户端调用 `lint(file)`；真实 LSP 服务器可选地等待项目加载，记录 `diagnosticsVersion`，执行 `refreshFile()`，然后调用 `waitForDiagnostics()`。它接受新的推送诊断（文档版本精确匹配时立即接受，否则等待一次稳定的发布），并在服务器支持拉取诊断时发出 `textDocument/diagnostic`。拉取失败且没有可用的新发布结果时，视为服务器失败，而不是无问题结果。
- 结果按范围加消息去重，并按严重程度排序。

**输出文本**

- 单个目标，至少一台成功的服务器未发现问题：`OK`，若其他服务器失败则附警告。所有服务器均失败时，返回 `details.success: false` 和明确失败消息。
- 单个目标有问题：`<summary>:\n<grouped diagnostics>`。
- 批量或 glob 目标：每个文件一个分区，glob 超过文件数量上限时，开头附截断警告。
- 工作区模式：`Workspace diagnostics (<detected descriptions>):\n<command output>`。检查器成功但输出为空时，报告 `No issues found`；非零退出且输出为空时，报告该工作区尚未验证。

### `definition` \{#definition}

**输入**

- 必填：`file`。
- 可选：`line`、`symbol`、`timeout`。

**执行**

- 发送 `textDocument/definition`，参数为 `{ textDocument, position }`。
- 接受 `Location`、`Location[]`、`LocationLink` 或 `LocationLink[]`；`normalizeLocationResult()` 将 `LocationLink` 转换为 `targetSelectionRange ?? targetRange`。
- 面向感知项目的服务器时，如果提供了 `line`，则必须提供 `symbol`（此操作禁用首个非空白列的回退）。
- 请求前等待项目加载。

**输出文本**

- `No definition found`，或 `Found N definition(s):`，后接 `file:line:col` 及每个位置上下各一行上下文。

### `type_definition` \{#type_definition}

使用与 `definition` 相同的位置规范化方式和输出结构，但发送 `textDocument/typeDefinition` 并报告 `type definition(s)`。与 `definition` 不同，此实现在提供 `line` 时不要求显式指定 `symbol`；未提供时会解析到第一个非空白列。

### `implementation` \{#implementation}

使用与 `definition` 相同的位置规范化方式和输出结构，但发送 `textDocument/implementation` 并报告 `implementation(s)`。与 `definition` 不同，此实现在提供 `line` 时不要求显式指定 `symbol`；未提供时会解析到第一个非空白列。

### `references` \{#references}

**输入**

- 必填：`file`。
- 可选：`line`、`symbol`、`timeout`。

**执行过程**

- 发送带有 `includeDeclaration: true` 的 `textDocument/references`。
- 对于具备项目感知能力的服务器，在给出 `line` 时要求提供 `symbol`（此操作禁用了回退到第一个非空白列的行为）。
- 对于具备项目感知能力的服务器，当结果为空或唯一命中项是所查询的声明时，最多重试 `REFERENCES_RETRY_COUNT` 次；重试之间会等待项目加载，并休眠 `REFERENCES_RETRY_DELAY_MS`。
- 前 `REFERENCE_CONTEXT_LIMIT` 个引用包含周围上下文；其余引用仅包含位置。

**输出文本**

- `No references found`，或 `Found N reference(s):`，后接带上下文的条目；截断时，随后显示 `... M additional reference(s) shown without context`。

### `hover` \{#hover}

**输入**

- 必填：`file`。
- 可选：`line`、`symbol`、`timeout`。

**执行过程**

- 发送 `textDocument/hover`。
- `extractHoverText()` 将字符串、标记内容、带标记的字符串对象或数组展开为纯文本。

**输出文本**

- `No hover information`，或提取出的悬停文本。

### `symbols` \{#symbols}

**输入**

- 工作区模式：必填 `file: "*"`，并且必填 `query`。省略 `file` 目前会在分派工作区符号操作之前返回 `Error: file parameter required...`。
- 文档模式：必填 `file`。
- 可选：`timeout`。

**执行过程**

- 工作区模式将每个非自定义 LSP 服务器打开的文档与磁盘同步（`reconcileOpenFilesFromDisk()`，关闭已无法读取的文档），向其发送 `workspace/symbol`，用 `filterWorkspaceSymbols()` 对匹配结果做后置过滤，用 `dedupeWorkspaceSymbols()` 去重，然后截断至 `WORKSPACE_SYMBOL_LIMIT`。
- 文档模式向主服务器发送 `textDocument/documentSymbol`。如果第一项包含 `selectionRange`，则按层级格式化 `DocumentSymbol`；否则按扁平格式处理 `SymbolInformation`。

**输出文本**

- 工作区模式：`Found N symbol(s) matching "query":`，后接格式化的 `name @ file:line:col`，超出限制时带一行省略说明。
- 文档模式：`Symbols in <file>:`，后接层级或扁平的符号行。

### `rename` \{#rename}

**输入**

- 必填：`file`、`new_name`。
- 可选：`line`、`symbol`、`apply`、`timeout`。

**执行过程**

- 对于具备项目感知能力的服务器，在给出 `line` 时要求提供 `symbol`，随后等待项目加载，发送 `textDocument/rename`，接收 `WorkspaceEdit`。
- `apply !== false` 会通过 `applyWorkspaceEdit()` 立即应用编辑。
- `apply === false` 会通过 `formatWorkspaceEdit()` 渲染预览。

**输出文本**

- `Rename returned no edits`、`Applied rename:` 后接已应用的更改行，或 `Rename preview:` 后接编辑摘要。

### `rename_file` \{#rename_file}

**输入**

- 必填：源路径 `file`、目标路径 `new_name`。
- 可选：`apply`、`timeout`。

**执行过程**

- 解析源和目标的绝对路径，拒绝相同路径、源不存在、目标已存在、重命名集合为空或目录内文件数超过 `MAX_RENAME_PAIRS` 的情况。
- 对文件，`enumerateRenamePairs()` 返回一个 `{oldUri,newUri}` 对；对目录，则遍历目录树中的每个普通文件。
- 向 `fileTypes` 匹配受影响路径的每个非自定义 LSP 服务器发送带有 `{ files: pairs }` 的 `workspace/willRenameFiles`；收集返回的 `WorkspaceEdit` 和服务器说明。
- 预览模式（`apply === false`）仅格式化这些编辑。
- 应用模式下，如果任何相关服务器的 `workspace/willRenameFiles` 因方法未找到以外的错误而失败，则拒绝修改。否则，按 URI 合并文本编辑（重叠时优先采用具备项目感知能力的服务器的编辑；被丢弃的编辑会附带说明），验证所有编辑分组，然后调用 `applyEditsThenRename()`。文件系统移动失败会回滚引用编辑。移动后，为重命名的已打开文件发送 `textDocument/didClose`，移除其 `openFiles` 条目，然后发送 `workspace/didRenameFiles`。

**输出文本**

- 预览：`Rename preview: <file-count label> → <dest>`，后接各服务器的编辑摘要和可选的服务器说明。
- 应用：`Renamed <file-count label> → <dest>`，后接已应用编辑的摘要、文件系统重命名行和可选的服务器说明。

### `code_actions` \{#code_actions}

**输入**

- 必填：`file`。
- 可选：`line`、`symbol`、`query`、`apply`、`timeout`。

**执行过程**

- 使用已打开 URI 的缓存诊断；如果磁盘协调发送了 `didChange`，或重新打开了因空闲而关闭的文档，则先等待该版本的新诊断（发生非中止类失败时回退到缓存）。为解析出的位置处的零宽度范围发送 `textDocument/codeAction`。
- 当 `apply !== true` 时，将 `query` 作为 `context.only: [query]` 传递；这是服务器端的种类过滤器。
- 当 `apply === true` 且 `query` 非空时，它是客户端选择器：可以是从零开始的数字索引，也可以是操作标题中不区分大小写的子字符串。
- 当 `apply === true` 但省略 `query` 时，当前实现会转入列表模式，不应用操作。
- 应用 `CodeAction` 时使用 `applyCodeAction()`：可选的 `codeAction/resolve`，然后是 `applyWorkspaceEdit(edit)`，再执行可选的 `workspace/executeCommand`。
- 应用单独的 `Command` 时仅运行 `workspace/executeCommand`。

**输出文本**

- 列表模式：`N code action(s):`，后接 `index: [kind] title` 行。
- 应用模式成功：`Applied "title":`，后接 `Workspace edit:` 和/或 `Executed command(s):` 章节。
- 应用模式未命中：`No code action matches "query". Available actions:`。
- 应用模式下没有编辑/命令：`Action "title" has no workspace edit or command to apply`。

### `status` \{#status}

**输入**

- 无。

**执行过程**

- 从缓存的 `LspConfig` 读取已配置的服务器，并与 `getActiveClients()` 交叉核对，以便将每个服务器标记为 `(configured, not started)` 或其活动客户端状态。
- 调用 `detectLspmux()`，并在已安装 `lspmux` 时追加状态文本。

**输出文本**

- `Language servers: <name (configured, not started) | name (<status>)>` 后接一行解释说明，或 `No language servers configured for this project`，之后可选地跟随 `lspmux: active (multiplexing enabled)` 或 `lspmux: installed but server not running`。

### `reload` \{#reload}

**输入**

- 工作区模式：`file: "*"` 或省略 `file`。
- 单文件模式：必填 `file`。
- 可选：`timeout`。

**执行过程**

- 工作区模式使按 cwd 缓存的配置失效，从磁盘重新加载配置，停止初始化标识不在新配置中的客户端，然后重新加载每个新配置的非自定义 LSP 服务器。拆除失败会显式报告，而不是让重复的陈旧客户端悄悄继续运行。作为工作区文件夹添加的检出目录会一直保留到客户端退出。
- 单文件模式保留缓存的配置，并重新加载该文件的主服务器。
- 两种模式都会在启动服务器之前清除匹配的近期初始化失败记录。对于 rust-analyzer，`reloadServer()` 首先发送 `rust-analyzer/reloadWorkspace`；成功则立即返回，方法未找到则回退，其他错误则向上传播。通用重新加载会发送携带已配置设置的 `workspace/didChangeConfiguration` 通知，然后刷新已打开的文件。如果发送失败，则拆除客户端并确认进程已退出，以便下次请求冷启动它。共享 mux 的拆除会先发送 mux 重启通知。

**输出文本**

- 每个服务器一行：`Reloaded <server>`、`Restarted <server>` 或 `Failed to reload <server>: ...`；工作区重新加载可能先报告因配置被取代而停止的服务器。

### `capabilities` \{#capabilities}

**输入**

- 可选：`file`、`timeout`。

**执行过程**

- 提供具体的 `file` 时，检查该文件匹配的非自定义服务器。
- 省略 `file` 或设为 `"*"` 时，检查每个已配置的非自定义服务器。
- 按需启动服务器，并将 `client.serverCapabilities ?? {}` 以美化后的 JSON 转储。

**输出文本**

- 每个服务器：`<server>:` 后接缩进的 `capabilities: { ... }`，或 `<server>: failed to start (...)`。

### `request` \{#request}

**输入**

- 必填：方法名 `query`。
- 可选：`file`、`line`、`symbol`、`payload`、`timeout`。

**执行过程**

- 选择一个非自定义服务器：文件范围内的主服务器，否则选择第一个已配置的非自定义服务器。
- 参数构建优先级：
   1. 如果存在 `payload`，解析 JSON 并原样使用。
   2. 否则，如果 `file` 为具体文件且存在 `line`，则使用 `resolveSymbolColumn()` 构建 `{ textDocument: { uri }, position: { line: line - 1, character } }`。
   3. 否则，如果 `file` 为具体文件，构建 `{ textDocument: { uri } }`。
   4. 否则使用 `{}`。
- 当 `file` 为具体文件时，在发送请求前将文件与磁盘协调。

**输出文本**

- 成功：`<server> ← <method>:\n<formatted result>`，其中非字符串结果使用 `JSON.stringify(..., null, 2)`，空值转为 `null`。
- 失败：`LSP error from <server> on <method>: ...`，后接回显请求参数的 `  params: <preview>`（截断至 400 个字符）。

## 副作用 \{#side-effects}

- 文件系统
   - 读取配置文件、目标文件和根标记。绝不读取非普通文件（FIFO、设备、套接字）：打开、协调、刷新、符号列读取和文本编辑应用都会拒绝它们，位置上下文也会跳过它们。
   - 除非服务器配置了 `watchFiles: false`，否则会通告 `workspace/didChangeWatchedFiles` 动态注册，监视服务器注册的文件，使服务器无需运行自己的监视器，并通过批量通知报告其变化，包括在 omp 之外进行的更改（`lsp/watched-files.ts`）。共享服务器的监视器位于 LSP mux 中，每个服务器一个；私有服务器的监视器位于其客户端中。只有当 glob 涉及直接子项以下的路径时，才会递归监视每个模式的基目录；对于尚不存在的基目录，会在其最近的现有祖先目录上进行非递归监视，等待它出现，一旦出现，其中已有的文件就会被报告为已创建。基目录下被 VS Code 默认的 `files.watcherExclude` 跳过的路径（`node_modules`、`.git/objects`、`.git/subtree-cache`、`.hg/store` 下的所有内容）不会被报告或遍历；在这些路径内部注册的基目录则正常监视。监视范围下出现的目录（创建或移入），其文件会被报告为已创建；消失的目录（删除或移出）则将目录本身报告为已删除，因为其中的文件没有产生各自的事件；在 Windows 监视范围内重命名的目录，还会将每个文件的旧路径报告为已删除。10 秒内重复出现的创建或删除（事件和重新扫描发现同一个文件）只发送一次。只有在基目录或其祖先之一被创建、删除或重命名时，才重新解析受监视的目录。omp 已自行报告的更改（其自身的写入），只要此后文件未变，就不会再次回传。目录检查异步进行，每轮对每个路径执行一次 stat。在 Windows 上，监视器是原生的 `DirectoryWatcher`（在自己的线程上运行 `ReadDirectoryChangesW`，一个文件流使用 512 KiB 缓冲区，网络共享上为 64 KiB，另一个流用于目录，因此每项更改都会说明是否为目录；每次读取一个批次；在 JS 线程之外打开；`close()` 不等待待处理的读取被取消）；其他平台上则是 `fs.watch`。监视器报告丢失更改时，会重新报告自上次已送达的更改以来被触及的文件（不包括该时间窗口内的删除）；该窗口还会覆盖上次观察到文件系统时钟落后于 omp 时钟的差值，例如网络驱动器上的情况。在 Linux 上，递归监视触及 inotify 的 `max_user_watches`（`ENOSPC`）时，会回退为每个目录一个监视器，跳过排除目录并记录无法再容纳的目录，而不是丢失整棵树。在现有目录上因其他原因失败的监视会被记录，并在仍有监视需求期间保持关闭，而不是重新启用。移出 Linux 或 macOS 监视范围的目录在消失后无法再被识别为目录（逐目录回退模式除外），因此只会报告它们的文件事件。
   - `rename` 和 `code_actions` 可能通过 `applyWorkspaceEdit()` 编辑/创建/删除/重命名文件。
   - `rename_file` 在应用模式下始终会重命名磁盘上的源路径。
   - 服务器发起的 `workspace/applyEdit` 请求也会通过 `applyWorkspaceEdit()` 修改文件。
- 网络 / IPC
   - 在 `lsp.shared=true`（默认值）时，SDK 会话尝试通过本地 Unix 套接字或 Windows 命名管道连接由 broker 管理的逐项目 LSP mux。如果无法连接或启动 mux，客户端会静默回退到私有子进程。
   - 私有服务器和外部多路复用服务器通过本地 stdio JSON-RPC 通信；工具本身不发出远程网络请求。
- 子进程 / 原生绑定
   - 私有回退使用 `ptree.spawn()` 启动语言服务器；共享模式向由 broker 管理的项目 mux 请求服务器，每个连接一个。释放的服务器在 mux 运行期间最多保持预热 5 分钟（`lsp/mux/server.ts` 中的 `SERVER_LINGER_MS`）；mux 是非持久的 broker 守护进程，因此会在项目的最后一个 omp 进程退出后不久停止。在复用释放的服务器之前，mux 会关闭已离开会话的文档，并移除该会话添加的工作区文件夹。
   - 工作区诊断会启动 `cargo`、`npx`、`go` 或 `pyright`。
   - `BiomeClient` 和 `SwiftLintClient` 会启动 CLI 工具。
   - 可选的外部 `lspmux` 检测会启动 `lspmux status`；受支持的服务器可以通过 `lspmux client` 包装运行。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 在 `configCache` 中按 cwd 缓存配置；工作区 `reload` 会使该条目失效。
   - 按启动/初始化标识和 cwd 缓存 LSP 客户端，包括 `pendingRequests`、`diagnostics`、`openFiles`、`serverCapabilities` 和项目加载状态。传输层可能代表共享 mux 链接，而非拥有的进程。
   - 按 `serverName:cwd` 缓存自定义 linter 客户端。
   - 更新客户端的 `lastActivity`；空闲超时清理（默认 15 分钟）由工作区的 `idleTimeoutMs` 或 `setIdleTimeout()` 驱动。
   - 当操作打开、同步、保存、协调或显式刷新文档时，记录每个已打开文档的 `lastUsedAt`。在发送 `didOpen` 之前，客户端会为 5 分钟未使用的文档发送 `didClose`，让服务器可以丢弃其项目；即使打开操作先被取消，排队的关闭也会写出，因此后续使用总会通过携带当前文本的 `didOpen` 重新打开；如果打开操作取消时关闭消息仍在写入，则会拆除已停止读取 stdin 的服务器。重新打开会从高于旧版本的版本号继续；在延迟诊断窗口内，诊断等待会将空的发布或版本早于重新打开的发布视为暂定结果，因为它可能发生在关闭之前。领先于磁盘的覆盖层和正在操作中的文档保持打开；监视文件变化或 `reload` 后刷新每个已打开文档，或在查询或诊断前同步每个已打开文档，都不算作使用。
- 后台工作 / 取消
   - 每个请求都有可中止的超时信号。
   - 中止进行中的 LSP 请求会发送 `$/cancelRequest`。
   - 每个活动客户端的后台消息读取器会持续存在，直到进程退出/关闭。

## 限制与上限 \{#limits--caps}

- 工具超时钳制：默认 `20` 秒（当 `lsp.requestTimeout` 更大时提高至该值），最小 `5` 秒，最大 `300` 秒，见 `packages/coding-agent/src/tools/tool-timeouts.ts` 中的 `TOOL_TIMEOUTS.lsp` / `resolveLspTimeouts()`。
- `sendRequest()` 优先使用显式提供的请求超时；否则，由提供的中止信号控制截止时间。两者都未提供的调用才使用 `30_000ms`（`client.ts` 中的 `DEFAULT_REQUEST_TIMEOUT_MS`），因此工具的 `timeout` 不会被静默缩短为 30 秒。
- 预热初始化超时默认值：`5_000ms`，见 `packages/coding-agent/src/lsp/client.ts` 中的 `WARMUP_TIMEOUT_MS`。
- 项目加载等待回退值：`15_000ms`，见 `packages/coding-agent/src/lsp/client.ts` 中的 `PROJECT_LOAD_TIMEOUT_MS`。
- 启用时的空闲客户端扫描间隔：`60_000ms`，见 `packages/coding-agent/src/lsp/client.ts` 中的 `IDLE_CHECK_INTERVAL_MS`。
- 已打开文档的空闲窗口：`5 * 60 * 1000ms`，见 `packages/coding-agent/src/lsp/client.ts` 中的 `OPEN_FILE_IDLE_MS`。
- 初始化失败退避时间：`3 * 60 * 1000ms`，见 `INIT_FAILURE_BACKOFF_MS`；匹配的单文件或工作区 `reload` 会清除此负缓存，使重试立即进行。
- 单文件诊断等待：通常为 `3_000ms`（`diagnostics.ts` 中的 `SINGLE_DIAGNOSTICS_WAIT_TIMEOUT_MS`）；对于具备项目感知能力的服务器，使用 `lsp.requestTimeout` 设置（默认 `10` 秒）或调用的 `timeout`。两者均受工具超时约束。
- 编辑后的延迟诊断（edit/write 直写，在工具结果之后送达）：每个服务器等待 `max(12_000ms, lsp.requestTimeout)`，见 `diagnostics.ts` 中的 `deferredDiagnosticsWaitMs()`。
- 批量/glob 诊断使用与单文件相同的逐文件等待时间；工具超时约束整个批次。
- glob 诊断目标上限：前 `20` 个匹配项，见 `MAX_GLOB_DIAGNOSTIC_TARGETS`。
- 工作区符号上限：前 `200` 个条目，见 `WORKSPACE_SYMBOL_LIMIT`。
- 引用上下文上限：前 `50` 个引用包含源代码上下文，见 `REFERENCE_CONTEXT_LIMIT`。
- 引用重试次数：`2` 次重试，`250ms` 退避，见 `REFERENCES_RETRY_COUNT`、`REFERENCES_RETRY_DELAY_MS`。
- 目录重命名上限：`1_000` 个文件对，见 `MAX_RENAME_PAIRS`。
- `detectLspmux()` 状态缓存 TTL：`5 * 60 * 1000ms`；存活检查超时：`1_000ms`，见 `packages/coding-agent/src/lsp/lspmux.ts` 中的 `STATE_CACHE_TTL_MS`、`LIVENESS_TIMEOUT_MS`。
- 工作区诊断：最多 `2` 个并发检查器（`workspace-diagnostics.ts` 中的 `MAX_CONCURRENT_CHECKERS`），每种语言取前 `50` 行输出。

## 错误 \{#errors}

- 缺少输入或输入无效通常会以带有 `details.success: false` 的文本返回，而不是抛出异常：
   - 缺少 `file`/`query`/`new_name`
   - `payload` 中的 JSON 无效
   - 没有匹配的服务器
   - `rename_file` 的源/目标条件无效
- `resolveSymbolColumn()` 会针对文件缺失、符号缺失和越界的 `#N` 选择器抛出明确错误；这些错误以 `LSP error: ...` 或请求特定的错误文本呈现。
- `sendRequest()` 超时时会拒绝请求，错误为 `LSP request <method> timed out after <ms>ms`。
- 客户端进程退出时，会拒绝所有待处理请求，错误包含在 `getOrCreateClient()` 中组装的退出码/stderr 信息。
- 主 `try` 内普通的单文件操作失败会变为 `LSP error: <message>`；`ToolError` 则重新抛出。
- 在打开、协调或刷新文档，或解析符号列时拒绝非普通目标，会以 `Cannot open '<path>': it is a <kind>, not a regular file or directory.` 失败。它的呈现方式与其他读取错误相同：单文件操作返回 `LSP error: Cannot open …`，并带有 `details.success: false`；`request` 使用自己的封装，或者在给出 `line` 时抛出异常（与其他 `resolveSymbolColumn()` 错误一样）；`reload` 报告 `Failed to reload <server>: Cannot open …`；诊断将服务器记录为失败；后台监视文件刷新会记录该错误并继续。
- `request` 有自己的错误封装：`LSP error from <server> on <method>: <message>`。
- 有些服务器失败会被有意弱化处理：
   - 某个服务器失败时，诊断继续进行
   - `rename_file` 会抑制 `workspace/willRenameFiles` 的“方法未找到”错误；其他错误在预览模式下作为说明，在应用模式下则于修改前中止
   - `code_actions` 会忽略 `codeAction/resolve` 失败，并在可能时应用未解析的操作
- 调用方的中止不会被转换为文本。在主单文件操作块中，如果发生墙钟超时而调用方未取消，则抛出 `ToolError`：`LSP <action> timed out after <N>s on <server>. ...`；独立的原始请求分支将中止报告为 `ToolAbortError`。

## 注意事项 \{#notes}

- `status` 从 `LspConfig` 报告已配置的服务器，并通过 `getActiveClients()` 标记每个服务器：`(configured, not started)` 表示能在 PATH 上解析到二进制程序，但尚未有请求启动它；活动客户端则报告其状态。
- `getLspServerForFile()` 排除 `createClient` 适配器；导航/重构操作不会面向 Biome/SwiftLint 自定义客户端。标记为 `isLinter` 的普通 LSP 服务器仍可在主服务器之后被选用。
- `getServersForFile()` 会匹配 `fileTypes` 中的文件扩展名和精确基名；如果存在相应配置，就能面向 `Dockerfile` 这样的名称。
- `symbol` 对裸标识符使用标识符边界匹配，先精确匹配大小写，再进行不区分大小写的匹配，并且只选择指定行上的第 N 次出现。重复匹配默认取第一个；使用 `#N` 选择其他项。它不会扫描其他行。
- 对具备项目感知能力的服务器执行 `definition`、`references` 和 `rename` 时，如果传入 `line` 却省略 `symbol`，会以 `ToolError` 拒绝，而不是静默回退到第一个非空白列。
- `code_actions` 以两种不同方式使用 `query`：列表模式下作为服务器端的 `context.only` 过滤器；同时提供 `apply: true` 和非空 `query` 时，作为客户端的标题/索引选择器。尽管模型提示要求提供选择器，当前实现仍会在 `apply: true` 省略 `query` 时列出操作，而不是应用某项操作。
- `rename` 和 `rename_file` 默认执行应用。预览需要 `apply: false`。
- `request` 中的 `file: "*"` 与省略 `file` 的处理相同：不会构建工作区特定的参数。
- `reload` 不会在终止客户端后立即重新创建它；下一个请求触发重新初始化。
- `workspace/applyEdit` 可以在直接工具操作的结果路径之外应用服务器发起的编辑。
- 可用 `PI_DISABLE_LSPMUX=1` 禁用 `detectLspmux()`；`DEFAULT_SUPPORTED_SERVERS` 中只有 `rust-analyzer`。
- 启动时的 LSP 发现（`sdk.ts` 中的 `discoverStartupLspServers`）需要 `enableLsp`、`lsp.enabled` 和 `options.hasUI`；后台预热还需要 `!cfgLspLazy.get(settings)`。`lsp.lazy` 默认是 `true`，因此发现的服务器初始状态为 `"available"`，首次使用时通过 `getOrCreateClient()` 冷启动。不带 `hasUI` 的调用会跳过启动发现/预热。在 UI 会话中途关闭 `lsp.lazy` 会执行一次预热。参见 [SDK 启动性能](../sdk.md)。
- `configCache` 是逐进程的，不会自动失效。使用工作区 `reload`（省略 `file` 或设为 `file: "*"`）重新读取配置、根标记和插件配置；具体文件的重新加载只会重新加载该服务器，并保留缓存的配置。
