---
title: "ast_grep"
description: "Oh My Pi 官方仓库文档：ast_grep。"
---

# ast_grep \{#ast_grep}

> 通过原生 ast-grep 对受支持的源文件执行结构化代码搜索。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/ast-grep.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/ast-grep.md`
- 主要协作组件：
   - `crates/natives/src/ast.rs`：原生扫描、解析、匹配引擎
   - `crates/ast/src/language/mod.rs`：原生封装器使用的语言别名和扩展名推断。
   - `crates/ast/src/ops.rs`：模式编译和 JSON 成员片段回退
   - `packages/coding-agent/src/tools/path-utils.ts`：路径/glob 解析（宿主路径和内部 URL）及多路径解析
   - `packages/coding-agent/src/internal-urls/url-filesystem.ts`：`InternalUrlFilesystem`，原生 ast-grep 用于遍历和读取的 URL 文件系统
   - `packages/coding-agent/src/utils/render-utils.ts`：解析错误去重和显示上限
   - `packages/coding-agent/src/tools/match-line-format.ts`：hashline 匹配渲染
   - `packages/coding-agent/src/utils/file-display-mode.ts`：hashline 与行号输出模式
   - `packages/natives/native/index.d.ts`：JS 可见的原生绑定契约

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `pat` | `string` | 是 | 单个 AST 模式。封装器会去除其首尾空白，并拒绝空字符串。 |
| `path` | `string` | 否 | 一个文件、目录、glob、内部 URL 或内部 URL glob，或获取的 Web URL，也可以是其中多项组成的分号分隔列表（`"src; tests"`）。省略或为空时默认为 `.`（工作区根目录）。空条目会被拒绝。 |
| `lang` | `string` | 否 | 所有候选文件的语言覆盖值，例如为有歧义的 `.h` 文件指定 `cpp`。未提供时，按文件推断语言。原生层将空白覆盖值视为省略。 |
| `skip` | `number` | 否 | 匹配偏移量。默认为 `0`，然后经 `Math.floor(...)` 处理；负数和非有限值会导致失败。 |

向模型提供的模式语法和语言支持：

- `$NAME`：捕获一个 AST 节点。
- `$_`：匹配一个 AST 节点，但不绑定。
- `$$$NAME`：捕获零个或多个 AST 节点；ast-grep 会在下一个可满足的节点处惰性停止。
- `$$$`：匹配零个或多个 AST 节点，但不绑定。
- 元变量名称必须为大写，并且必须代表完整的 AST 节点，而不是部分词元或字符串片段。
- 复用同一元变量要求其每次出现时的代码完全相同。
- 提示词指导要求模式是推断或显式选择的语言中的一个有效 AST 节点。原生编译器也接受诸如 `"key": $V` 的 JSON 成员片段，做法是将其包装在对象中并选择 `pair` 节点；此回退仅适用于 `MultipleNode` 解析失败。
- `.cu` 和 `.cuh` 推断为 C++；C++ 表达式语句模式需要末尾的 `;`。
- 受支持的规范语言名称来自 `crates/ast/src/language/mod.rs` 中的 `SupportLang::all_langs()`：`astro`、`bash`、`c`、`cmake`、`cpp`、`csharp`、`dart`、`clojure`、`css`、`diff`、`dockerfile`、`emacs-lisp`、`elixir`、`erlang`、`fortran`、`go`、`graphql`、`haskell`、`hcl`、`html`、`ini`、`java`、`javascript`、`json`、`just`、`julia`、`kotlin`、`lua`、`make`、`markdown`、`nix`、`objc`、`ocaml`、`odin`、`php`、`powershell`、`protobuf`、`python`、`r`、`regex`、`ruby`、`rust`、`scala`、`solidity`、`sql`、`starlark`、`svelte`、`swift`、`toml`、`tlaplus`、`tsx`、`typescript`、`verilog`、`vue`、`xml`、`yaml`、`zig`。

`ast_grep` 默认禁用（`astGrep.enabled = false`），启用后属于可发现工具。

## 输出 \{#outputs}

- 一次性工具结果。
- 面向模型的 `content` 是一个文本块：
   - 目录/多文件搜索按文件分组，
   - 匹配行在 `[PATH#HASH]` 下渲染，hashline 模式为 `*LINE:text`，其他模式为 `*LINE|text`，
   - 多行匹配的续行以一个前导空格渲染，
   - ast-grep 捕获元变量时，每个匹配可附带一行 `meta: NAME=value, …`。
- 如果没有找到匹配，文本为 `No matches found`，或 `No matches found. Parse issues mean the query may be mis-scoped; narrow \`path\` before concluding absence.` 加上格式化的解析问题。
- 如果封装器截断了可见结果，文本以 `Result limit reached; narrow path or use skip to page through results.` 结尾。
- `details` 包括计数和元数据，而不是完整的匹配载荷：
   - `matchCount`、`fileCount`、`filesSearched`、`limitReached`
   - 可选的 `parseErrors`、`parseErrorsTotal`、`scopePath`、`searchPath`、`cwd`、`files`、`fileMatches`、`displayContent`、`meta`
- 原生范围（`byteStart`、`byteEnd`、`startLine`、`startColumn`、`endLine`、`endColumn`）只存在于原生结果中；封装器不会直接向模型输出它们。

## 流程 \{#flow}

1. `AstGrepTool.execute()` 验证 `pat`，规范化 `skip`，然后将路径解析委托给 `packages/coding-agent/src/tools/path-utils.ts` 中的 `resolveToolSearchScope()`，后者规范化条目、展开分号分隔列表（以及有条件的逗号/空白拆分），并拒绝空的 `path` 条目。
2. 调用从 `sessionResolveContext()` 按其审批级别构建一个 `InternalUrlFilesystem`（通常为 `read`，原始 `path` 指向 `ssh://` 时为 `exec`，与 `grep` 相同）。内部 URL 保持为 URL（URL glob 像宿主 glob 一样拆分为基础 URL + glob）；原生 ast-grep 通过该文件系统解析它们，因此虚拟协议（`omp://`）也可搜索。可读的外部 URL 会被实体化为不可变的本地文件以供搜索。
3. 对于多个路径输入，`partitionExistingPaths()` 通过 URL 文件系统对每个基础路径执行 stat，并且只有在至少保留一个存在的基础路径时才丢弃缺失的基础路径；如果所有基础路径都缺失，调用会失败。
4. `parseSearchPathPreferringLiteral()` 将单个路径拆分为 `basePath` 加可选的 `glob`。`resolveExplicitSearchPaths()` 将多个宿主输入折叠为共同基础路径加大括号并集 glob，或在共同祖先本身不属于所请求路径之一时拆分为独立的 `targets`；每个内部 URL 输入都是独立目标。
5. 封装器通过 URL 文件系统对解析后的基础路径执行 stat，以决定输出是否应按目录结果分组。
6. 执行会分派至以下两者之一：
   - 对单个已解析基础路径执行一次原生 `astGrep(...)` 调用，或
   - `runMultiTargetAstGrep(...)`，它对每个目标调用一次原生绑定，将宿主路径重新基于共同根目录表示（URL 命中保持完整 URL），全局排序，然后应用 `skip` 和封装器限制。
     每个原生调用都会获得 `filesystem: urlFilesystem.shellFilesystem()`。
7. `crates/natives/src/ast.rs` 中的原生 `ast_grep`：
   - 规范化模式并去重，
   - 解析 `MatchStrictness`（默认为 `smart`），
   - 从文件或遵循 gitignore 的目录扫描中收集候选文件，
   - 省略 `lang` 时过滤为受支持的源文件；非空白的 `lang` 会将每个候选文件都视为该语言，
   - 除非提供了 `lang`，否则根据扩展名逐个推断候选文件的语言，
   - 为存在的每种语言分别编译模式，
   - 读取每个文件，将语法错误树报告为解析问题，运行 `find_all`，并按需捕获元变量绑定。
8. 原生结果按路径和源码位置排序，然后通过 `offset`/`limit` 分页。
9. TS 封装器规范化解析错误字符串、去重、按格式化路径对匹配分组、渲染锚点行、追加限制/解析通知，并返回 `toolResult(...).text(...).done()`。

## 模式 / 变体 \{#modes--variants}

- 单文件：原生路径为该文件；输出是渲染后匹配行的平铺列表。
- 目录 + 可选 glob：原生扫描遍历目录，然后按编译后的 glob 过滤。
- 多个显式路径/glob：封装器将其合并为一个合成范围，或在路径只在根目录相交时对每个目标分别运行原生调用。
- 内部 URL 输入：通过 URL 文件系统进行原生遍历和读取；命中项以完整 URL 命名（`local://src/a.ts`）。可读的外部 URL 会实体化为不可变的临时文件。
- hashline 输出模式与普通行号模式：由 `resolveFileDisplayMode()` 控制；hashline 模式需要 edit 工具和 hashline 编辑模式，逐文件锚点还要求成功生成整文件快照（`getEditStore(session).recordSnapshotFile()`），超过上限或不可读的文件会回退为普通输出。不可变协议的 URL 命中不会获得锚点；以文件为后端的可变 URL（`local://`）会针对 `router.locate()` 返回的宿主文件生成快照。

## 副作用 \{#side-effects}

- 文件系统
   - 在 TS 封装器中通过 URL 文件系统对输入路径执行 stat。
   - 原生代码通过 URL 文件系统读取匹配文件并扫描目录（宿主路径保持原生形式，使用 `fs_cache`）。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 除常规工具会话记录/结果元数据外，无其他影响。
- 后台工作 / 取消
   - 原生工作通过 `task::blocking(...)` 在阻塞工作线程上运行。
   - 取消和可选的原生超时通过 `CancelToken::heartbeat()` 协作处理。

## 限制与上限 \{#limits--caps}

- 封装器可见的结果上限：`packages/coding-agent/src/tools/ast-grep.ts` 中的 `DEFAULT_AST_LIMIT = 50`。
   - 单目标调用依赖 `crates/natives/src/ast.rs` 中值为 50 的原生默认限制。
   - 多目标调用为每个目标获取 `skip + 50 + 1` 个匹配，然后在全局排序后重新分页。
- 在 `crates/natives/src/ast.rs` 中，原生 `limit` 被限制为至少 `1`；省略的 `offset` 默认为 `0`。
- 在 `packages/coding-agent/src/utils/render-utils.ts` 中，解析问题最多渲染 `PARSE_ERRORS_LIMIT = 20` 行；`capParseErrors()` 也将 `details.parseErrors` 限制为这 20 个唯一条目，`details.parseErrorsTotal` 保存限制前去重后的总数。
- `crates/natives/src/ast.rs` 中的目录扫描使用 `include_hidden: true`、`use_gitignore: true`，并跳过 `node_modules`，除非 glob 文本显式提及 `node_modules`。
- 封装器和原生 `ast_grep` 均不施加硬性文件数量上限；候选数量取决于解析后的路径/glob 在 gitignore 过滤后展开的结果。
- 多路径并集在 `resolveExplicitSearchPaths()` 中解析之前，会先对相同的路径输入去重。

## 错误 \{#errors}

- TS 封装器会对以下情况抛出 `ToolError`：空模式、无效的 `skip`、空路径条目、URL 文件系统无法 stat 的内部 URL（`Cannot search <url>: <handler diagnosis or tier refusal>`）以及缺失的路径。受支持的外部读取 URL 会在搜索前实体化，而不是被拒绝。
- 原生代码会对以下情况返回硬错误：
   - 搜索根目录不可读或 glob 编译错误，
   - 取消（`Aborted: Signal`）或超时（`Aborted: Timeout`）。
- 文件级解析失败和逐语言的模式编译失败不是致命错误：它们累积在 `parseErrors` 中，与成功匹配一同呈现；如果某个文件的语言没有可编译的模式，该文件会被跳过。
- `no matches` 不是错误，即使记录了解析问题也是如此。封装器会将零匹配结果标记为对上下文维护无用。
- 不受支持的 `lang` 会被报告为非致命的逐候选文件解析问题；如果范围内没有候选文件，就没有语言解析错误可报告。

## 备注 \{#notes}

- TS 工具始终将 `pat` 包装为只含一个元素的 `patterns` 数组；即使原生绑定支持，模型也不能通过 `ast_grep` 发送多个模式。
- `ast_grep` 可以搜索混合语言树，因为原生编译按发现的语言分别进行，但提示词仍要求模型尽可能保持单次调用针对单一语言，以减少解析噪声。
- 模式编译针对候选集中存在的每种语言进行。同一轮运行中，一个模式可能对某些语言成功，对其他语言则生成逐文件解析错误。
- 含有 tree-sitter 错误节点的文件仍会被搜索；语法警告是附加信息，不是跳过条件。
- 对于 glob 语义，`*.ts` 只匹配直接子项，而 `**/*.ts` 会递归；`crates/natives/src/ast.rs` 中的原生测试覆盖了这一点。
- 输出锚点供后续工具使用，但确切的锚点格式取决于会话编辑模式（`hashline` 与行号模式）。
