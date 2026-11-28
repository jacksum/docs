---
title: "ast_edit"
description: "Oh My Pi 官方仓库文档：ast_edit。"
---

# ast_edit \{#ast_edit}

> 通过原生 ast-grep 预览并应用源文件的结构化改写。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/ast-edit.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/ast-edit.md`
- 主要协作组件：
   - `crates/natives/src/ast.rs`：原生改写规划和文件修改
   - `crates/ast/src/language/mod.rs`：原生封装器使用的语言别名和扩展名推断。
   - `crates/ast/src/ops.rs`：模式编译、JSON 成员片段回退和编辑重叠验证
   - `packages/coding-agent/src/tools/path-utils.ts`：路径/glob 解析（宿主路径和内部 URL）及多路径解析
   - `packages/coding-agent/src/internal-urls/url-filesystem.ts`：`InternalUrlFilesystem`，原生 ast-edit 用于读写的 URL 文件系统
   - `packages/coding-agent/src/tools/resolve.ts`：预览/应用排队
   - `packages/coding-agent/src/utils/render-utils.ts`：解析错误去重和显示上限
   - `packages/coding-agent/src/utils/file-display-mode.ts`：hashline 与行号差异引用
   - `packages/coding-agent/src/tools/hashline-format.ts`：预览锚点的稳定 hashline 头部格式
   - `packages/natives/native/index.d.ts`：JS 可见的原生绑定契约

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `ops` | `{ pat: string; out: string }[]` | 是 | 一个或多个改写规则。`pat` 不得为空。重复的 `pat` 值会在原生执行前导致失败。空 `out` 会删除匹配的节点。 |
| `paths` | `string[]` | 是 | 一个或多个文件、目录、glob、可写文件型内部 URL（`local://`），或其下的 glob。至少需要一个非空条目。获取的外部 URL 为只读，不能改写。 |

共享 AST 模式语法和语言目录：见 [`ast_grep`](./ast-grep.md#inputs)。

- `ast_edit` 使用相同的 `$NAME`、`$_`、`$$$NAME` 和 `$$$` 元变量语义。
- 工具提示词增加了改写专属约束：
   - 元变量名称必须为大写，并且必须代表完整的 AST 节点，
   - 从 `pat` 捕获的内容会代入 `out`，
   - 每次改写都是 1:1 的结构替换；一个捕获不能展开为多个同级节点，除非语法本身允许在该位置进行这种展开。

`ast_edit` 通过 `astEdit.enabled` 默认启用。它属于可发现工具，而非基础工具集的一部分。

## 输出 \{#outputs}

- `ast_edit` 本身给出一次性预览结果。非空提案以 `Staged as a proposal — files NOT modified yet...` 开头，并指出 `resolve` 和 `reject` 命令。
- 面向模型的 `content` 是一个展示拟议编辑的文本块，对目录/多文件运行按文件分组。
   - 每项更改渲染为两行。hashline 模式在 `[PATH#TAG]` 头部下使用 `-LINE:before` / `+LINE:after`；普通模式使用 `-LINE:COLUMN before` / `+LINE:COLUMN after`。
   - 每个 `before`/`after` 片段只显示第一行，并在封装器中截断至 120 个字符。
   - 适用时追加 `Limit reached; narrow paths.` 和格式化的解析问题。
- 如果没有匹配的改写，文本为 `No replacements made`，存在解析问题时另加格式化的解析问题。
- `details` 包括汇总的预览元数据：
   - `totalReplacements`、`filesTouched`、`filesSearched`、`applied`、`limitReached`
   - 可选的 `parseErrors`、`parseErrorsTotal`、`scopePath`、`files`、`fileReplacements`、`displayContent`、`searchPath`、`cwd`、`meta`
- 工具始终先预览（直接结果中为 `applied: false`）。实际文件写入只会在之后通过 `resolve` 命令发生，该命令的参数是一句话的原因。
- 预览产生替换时，`ast_edit` 还会将待处理的 resolve 操作加入队列。成功应用后，会返回单独的 resolve 分派结果（在 `resolve` 调用上），而不是另一个 `ast_edit` 结果。

## 流程 \{#flow}

1. `AstEditTool.execute()` 在 `packages/coding-agent/src/tools/ast-edit.ts` 中验证每个 op：
   - 空 `pat` 导致失败，
   - 至少需要一个 op，
   - 重复的 `pat` 值导致失败，
   - ops 转换为 `Record<pattern, replacement>`。
2. 封装器通过 `$envpos(..., 1000)` 读取 `PI_MAX_AST_FILES`，并将其用作预览和应用的原生 `maxFiles` 上限。
3. 路径规范化、内部 URL 处理、缺失路径分区和多路径解析遵循与 `ast_grep` 相同的 `path-utils.ts` 流程，其中 `fileWritableOnly` 会在任何文件系统访问之前拒绝其协议不允许工具写入的 URL（`router.fileWritable()`）。调用的 `InternalUrlFilesystem` 携带其审批级别（`paths` 中最严格的 `router.writeTier()`），因此，向 URL 的原生写入若超过该级别就会被拒绝。
4. 范围的 `isDirectory` 标志（在 `resolveToolSearchScope` 中通过 URL 文件系统执行 stat 设置）决定是否渲染分组目录输出。
5. `runAstEditOnce(...)` 在第一遍始终以 `dryRun: true` 和 `failOnParseError: false` 运行原生 `astEdit(...)`。
6. `crates/natives/src/ast.rs` 中的原生 `ast_edit`：
   - 规范化改写映射，并按模式字符串排序规则，
   - 解析严格度（默认为 `smart`），
   - 从文件或遵循 gitignore 的目录扫描中收集候选文件，
   - 除非内部提供了 `lang`，否则独立推断每个候选文件的语言，
   - 为每种发现的语言编译每条改写规则；某条规则无法在一种语言中解析时，会跳过该语言的文件并报告解析问题，
   - 解析每个文件，跳过具有语法错误树的文件，为每个匹配收集 `replace_by(...)` 编辑，执行替换和文件上限限制，并返回文本形式的前后片段及源码范围。
7. TS 封装器对解析错误去重并限制数量，按文件对更改分组，并渲染预览差异行。
8. 如果预览找到替换且 `applied` 为 false，`queueResolveHandler(...)` 会注册非强制性的待处理 resolve 调用器。在其待处理期间，会话会提供携带 resolve 提醒的 `SoftToolRequirement`：工具命令已挂载时，其 `toolName` 为 `bash`，否则为 `resolve`，其 `satisfies` 谓词为 `isPreviewResolutionToolCall`（以 `resolve`/`reject` 开头的 bash 命令行，或直接的 `resolve`/`reject` 调用）。智能体运行时注入提醒，并且只在模型未履行该轮要求时升级为强制调用该工具。
9. 在 `resolve` 调用时（作为工具命令的 `resolve <reason>`，或工具命令未挂载时的顶层 `resolve` 工具），队列中的回调会使用 `dryRun: false` 重新运行相同的改写集，重新计算计数，并在实时结果不再匹配预览时返回错误结果（`stalePreview`）。当前实现在重新运行后比较替换总数和逐文件计数；如果新一轮运行已经写入了不同数量的更改，结果会被标记为错误。
10.   应用的预览未过期时，回调返回 `Applied N replacements in M files.`（在 hashline 模式下，后接从应用后内容重新记录的最新 `[path#tag]` 快照头部）；丢弃时（`reject <reason>`），调用返回丢弃消息，不修改文件。

## 模式 / 变体 \{#modes--variants}

- 单文件：针对一个文件预览或应用。
- 目录 + 可选 glob：原生扫描遍历目录，然后按编译后的 glob 过滤。
- 多个显式路径/glob：封装器将其合并为一个合成范围，或在路径只在根目录相交时对每个目标分别运行原生调用。
- 内部 URL 输入：仅允许可写文件型协议（`local://`）；只读协议和由处理器写入的协议会提前被拒绝。原生预览和应用通过 URL 文件系统读写它们，该文件系统会重定向到它们的宿主文件；应用阶段在相同级别构建自己的文件系统（没有调用信号）。审批采用目标协议中最高的写入级别；命中项以完整 URL 命名，hashline 快照绑定到定位到的宿主文件。
- 预览模式：始终是直接的 `ast_edit` 工具结果。
- 应用模式：只能在预览之后通过队列中的 resolve 回调进入，即作为工具命令的 `resolve <reason>` 或 `reject <reason>`，或者工具命令未挂载时的顶层 `resolve`/`reject` 工具。
- hashline 输出模式与普通行/列模式：由 `resolveFileDisplayMode()` 控制。

## 副作用 \{#side-effects}

- 文件系统
   - 预览读取文件并扫描目录。
   - 每次原生应用都会先在内存中暂存其更改的文件，再写入；该次运行中的计算/重叠失败不会部分修改先前的文件。写入循环中的写入失败或取消仍可能使先前的写入保持已应用状态。多目标调用分别执行各轮处理，因此后续目标的失败不会回滚之前的目标。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 通过 `queueResolveHandler(...)` 注册非强制性的待处理 resolve 调用器。
   - 待处理期间提供 `SoftToolRequirement`（带有 resolve 提醒）；智能体运行时只在不遵守要求时升级为强制调用其 `toolName`（工具命令已挂载时为 `bash`，否则为 `resolve`），不使用引导消息，也不为每次预览强制选择工具。
- 用户可见的提示 / 交互式 UI
   - 直接的 `ast_edit` 结果是预览。
   - 后续应用/丢弃通过 `resolve` 和 `reject` 命令提供（工具命令未挂载时为顶层工具）。
- 后台工作 / 取消
   - 原生预览/应用工作通过 `task::blocking(...)` 在阻塞工作线程上运行。
   - 取消和可选的原生超时通过 `CancelToken::heartbeat()` 协作处理。

## 限制与上限 \{#limits--caps}

- 封装器提供的文件上限：`packages/coding-agent/src/tools/ast-edit.ts` 中的 `PI_MAX_AST_FILES`，默认值为 `1000`。此上限独立传给每个原生目标，不在多目标调用之间全局执行。
- 在 `crates/natives/src/ast.rs` 中，提供的原生 `maxFiles` 和 `maxReplacements` 都会被限制为至少 `1`。
- 封装器从不设置 `maxReplacements`；因此原生行为默认为一次运行中的替换数量实际上不设上限。
- 解析问题通过 `packages/coding-agent/src/utils/render-utils.ts` 中的 `capParseErrors(...)` 去重，并限制为 `PARSE_ERRORS_LIMIT = 20` 个条目；`details.parseErrors` 携带受限后的列表，`details.parseErrorsTotal` 携带限制前去重后的数量。
- `crates/natives/src/ast.rs` 中的目录扫描使用 `include_hidden: true`、`use_gitignore: true`，并跳过 `node_modules`，除非 glob 文本显式提及 `node_modules`。
- 不存在单独的 glob 展开数量上限。候选数量取决于解析后的路径/glob 在 gitignore 过滤后展开的结果，然后原生 `maxFiles` 会在触及配置数量的文件后停止修改。
- 在 `packages/coding-agent/src/tools/ast-edit.ts` 中，预览文本将每个渲染的 `before` 和 `after` 首行截断为 120 个字符。

## 错误 \{#errors}

- TS 封装器会对以下情况抛出 `ToolError`：空模式、重复的改写模式、空路径条目、其协议不允许工具写入的内部 URL（`Cannot rewrite <url>: <scheme>:// URLs are not editable files`）、URL 文件系统无法 stat 的内部 URL（`Cannot rewrite <url>: <reason>`）以及缺失的路径。
- 原生代码会对以下情况返回硬错误：
   - 路径/glob 中没有受支持的源文件（`ast_edit found no supported source files for the given path/glob`），
   - 无法解析候选语言（在尽力处理模式下作为解析问题报告），
   - 内部/原生调用中显式提供了不受支持的 `lang`，
   - glob 编译错误或搜索根目录不可读，
   - 计算出的编辑重叠（`Overlapping replacements detected; refine pattern to avoid ambiguous edits`），
   - 编辑范围越界或替换文本不是 UTF-8，
   - 应用期间写入失败，
   - 取消或超时。
- 使用 `failOnParseError: false` 时（封装器始终使用此值），模式编译失败和文件解析失败会成为 `parseErrors`，而不会中止整个运行。
- 如果每个改写模式都编译失败，原生 `ast_edit` 会返回成功的零替换结果，并填充 `parseErrors`。
- 包含 tree-sitter 错误节点的文件会被跳过改写；它们不会获得部分编辑。
- 如果预览过期，即使预览成功，应用仍可能失败。resolve 回调比较替换总数和逐文件计数，对于不匹配的预览返回错误结果，而不是悄悄报告成功。

## 备注 \{#notes}

- `ast_edit` 不向模型提供原生的 `lang`、`strictness`、`selector`、`maxReplacements`、`failOnParseError` 或 `timeoutMs` 字段。运行时将调用结构固定为先预览、smart 严格度、尽力解析模式。
- 支持混合语言范围：原生层推断每个候选文件的语言，并针对发现的每种语言编译每条规则。只能在部分语言中解析的模式会改写这些文件，并为不兼容的语言报告解析问题。
- 不强制幂等。诸如 `foo($A) -> foo($A)` 的恒等改写仍会在预览中报告匹配的替换；应用时，如果文件的结果内容未改变，则跳过实际写入。其输出仍可被自身匹配的改写，在重复调用时仍可能报告替换。
- 改写按文件累积，然后在重叠检查后从文件末尾向前应用。来自多条规则的完全重复编辑（相同范围和替换内容）只计一次。其他重叠编辑会中止应用；试运行预览不执行这一应用时检查。
- 原生改写规则顺序按模式字符串排序，而不是原始 `ops` 数组顺序，因为 `normalize_rewrite_map(...)` 会对 `(pattern, rewrite)` 对进行排序。
- 预览/应用的一致性通过应用重新运行后的总数和逐文件计数验证，而不是对每个替换载荷进行逐字节差异比较。
