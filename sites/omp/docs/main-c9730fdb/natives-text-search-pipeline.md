---
title: "原生文本/搜索流水线"
description: "Oh My Pi 官方仓库文档：原生文本/搜索流水线。"
---

# 原生文本/搜索流水线 \{#natives-textsearch-pipeline}

本文将 `@oh-my-pi/pi-natives` 的文本/搜索/代码接口，从生成的 JS/TS 导出映射到 Rust N-API 模块，再映射回 JS 结果对象。

术语遵循 `docs/natives-architecture.md`：

- **生成的绑定**：`packages/natives/native/index.d.ts` 中的公共 API。
- **Rust 模块层**：`crates/natives/src/*` 中的 N-API 导出。
- **共享列表缓存**：`omp-xfs` 的进程级按目录划分的列表缓存（`crates/xfs/src/walk/cache.rs`），供发现流程使用；N-API 文件系统 DTO/转换位于 `crates/natives/src/glob.rs`。参见 `docs/fs-scan-cache-architecture.md`。

## 实现文件 \{#implementation-files}

- `packages/natives/native/index.d.ts`
- `crates/natives/src/grep.rs`
- `crates/natives/src/glob.rs`
- `crates/natives/src/fd.rs`
- `crates/xfs/src/fs/root.rs`
- `crates/xfs/src/lib.rs`
- `crates/xfs/src/walk/mod.rs`
- `crates/xfs/src/walk/cache.rs`
- `crates/xfs/src/glob.rs`
- `crates/xfs/src/grep/mod.rs`
- `crates/natives/src/ast.rs`
- `crates/ast/src/ops.rs`
- `crates/natives/src/shell/vfs.rs`
- `crates/vfs/`
- `crates/natives/src/text.rs`
- `crates/natives/src/highlight.rs`
- `crates/natives/src/tokens.rs`
- `crates/natives/src/utok/`

## JS API ↔ Rust 导出映射 \{#js-api--rust-export-mapping}

| JS API | Rust N-API 符号 | Rust 模块 |
| --- | --- | --- |
| `grep(options, onMatch?)` | `grep` | `grep.rs` |
| `search(content, options)` | `search` | `grep.rs` |
| `hasMatch(content, pattern, ignoreCase?, multiline?)` | `has_match` | `grep.rs` |
| `fuzzyFind(options)` | `fuzzy_find` | `fd.rs` |
| `glob(options, onMatch?)` | `glob` | `glob.rs` |
| `astGrep(options)` | `ast_grep` | `ast.rs` |
| `astMatch(options)` | `ast_match` | `ast.rs` |
| `astEdit(options)` | `ast_edit` | `ast.rs` |
| `wrapTextWithAnsi(text, width, tabWidth)` | `wrap_text_with_ansi` | `text.rs` |
| `truncateToWidth(text, maxWidth, ellipsis, pad, tabWidth)` | `truncate_to_width` | `text.rs` |
| `sliceWithWidth(line, startCol, length, strict, tabWidth)` | `slice_with_width` | `text.rs` |
| `extractSegments(line, beforeEnd, afterStart, afterLen, strictAfter, tabWidth)` | `extract_segments` | `text.rs` |
| `visibleWidth(text, tabWidth)` | `visible_width` | `text.rs` |
| `setHangulCompatJamoWidthOverride(value)` | `set_hangul_compat_jamo_width_override` | `text.rs` |
| `highlightCode(code, lang, colors)` | `highlight_code` | `highlight.rs` |
| `new HighlightStream(lang, colors)` / `.push(chunk)` | `HighlightStream` | `highlight.rs` |
| `warmHighlighter()` | `warm_highlighter` | `highlight.rs` |
| `supportsLanguage(lang)` | `supports_language` | `highlight.rs` |
| `getSupportedLanguages()` | `get_supported_languages` | `highlight.rs` |
| `countTokens(input, encoding?)` | `count_tokens` | `tokens.rs` |

## 按子系统划分的流水线概览 \{#pipeline-overview-by-subsystem}

## 1) 正则搜索（`grep`、`search`、`hasMatch`） \{#1-regex-search-grep-search-hasmatch}

### 输入/选项流程 \{#inputoptions-flow}

1. 调用方直接调用生成的原生导出；不存在将 `search` 重命名为 `searchContent` 的包本地 TS 包装器。
2. `grep.rs` 中的 Rust 选项结构体反序列化 camelCase 字段，包括 `ignoreCase`、`maxCount`、`maxCountPerFile`、`contextBefore`、`contextAfter`、`maxColumns` 和 `timeoutMs`。
3. `grep` 从 `timeoutMs` 加 `AbortSignal` 创建 `CancelToken`，并在 `task::filesystem_future(...)` 内运行，后者是 Tokio 上的异步任务。模式通过 `omp_xfs::grep::Engine::compile` 编译一次，搜索在 `omp_xfs::grep::grep` 中运行。文件系统 grep 不暴露也不使用共享列表缓存。`filesystem?: ShellFilesystem` 提供宿主注入的 stat/walk/read 操作，包括绝对 `scheme://` 路径。
4. `search` 和 `hasMatch` 操作提供的字符串/`Uint8Array` 内容，不扫描文件系统。

### 执行分支 \{#execution-branches}

- **内存内分支**
   - `search`（`search_sync` -> `omp_xfs::grep::search` -> `Scanner::scan`）扫描提供的内容字节，并进行二进制检测：前 64 KiB 中出现 NUL 时返回零个匹配，`SearchResult` 不含错误或二进制标志；超过 64 KiB 后，在报告的匹配行或上下文行中出现 NUL 则结束扫描。
   - `hasMatch` 针对提供的内容编译/检查模式，并返回布尔值。
   - 不进行文件系统扫描，也不使用列表缓存。
- **单文件分支**
   - `grep` 通过选定的文件系统解析路径，检查元数据，并将显式文件根按文本搜索（`ScanParams.text = true`；流式扫描只用于文件根，从不应用二进制检测）。在按行模式下，原生的超大文件根（`> 4 MiB`）通过 `grep-searcher` 的读取器内联完整流式读取，提供方文件则异步完整读取；在多行模式下，超大文件根只读取开头的 4 MiB。
- **目录分支**
   - `omp_xfs::grep::grep` 遍历时将 `walk::Options::cache` 保持为 `false`：目录搜索从不读取或填充共享列表缓存。
   - glob 编译为 `omp_xfs::glob::Selector::scope`（它匹配的文件，加上它匹配的目录下的所有文件），同时也会裁剪遍历；`exclude` 模式编译为 `Selector::exclude`。
   - 大于 4 MiB 的文件排在所有其他文件之后，搜索其前 4 MiB。
   - 二进制检测会跳过前 64 KiB 中含 NUL 字节的文件，只探测它的第一个匹配；如果后续报告的匹配行或上下文行包含 NUL，则停止扫描（保留之前的匹配）。跳过内容中存在匹配的文件会以相对于遍历根的路径排序列入 `binaryMatches`（`binary_matches`）；没有匹配的二进制文件，或最后一个匹配之后的上下文中出现 NUL 的文件，不会被列出。

### 搜索/收集语义 \{#searchcollection-semantics}

- 匹配器选择：首先尝试 Rust 正则引擎，然后针对环视/反向引用等功能尝试 PCRE2。`OMP_PCRE2_JIT=0`/`false` 禁用 PCRE2 JIT，`1` 启用它；未设置时，除 macOS 外均启用 JIT。
- 对于简单 glob 过滤器，文件系统 grep 默认为 `hidden=true`、`gitignore=true` 和 `recursive=true`。目录遍历跳过 `.git`，并跳过 `node_modules`，除非 glob 提及它。
- 上下文解析：
   - `contextBefore/contextAfter` 覆盖旧版 `context`。
   - 非内容模式不收集上下文。
- 输出模式：
   - `content` -> 每次命中一个 `GrepMatch`。
   - `count` 输出每文件条目，其中 `lineNumber=0`、`line=""`，并设置 `matchCount`。
   - `filesWithMatches` 为每个匹配文件输出一个仅含路径的条目（`lineNumber=0`、`line=""`，省略 `matchCount`）。
   - `offset` 和 `maxCount` 在跨已排序文件结果的聚合期间应用；`maxCountPerFile` 还可以防止一个高匹配量文件消耗内容模式的预算。
   - 目录执行模型（`omp_xfs::grep::grep`）：
      - 没有匹配预算时，每个遍历器工作线程列出一个目录，并自行扫描所选文件，复用其文件系统会话、扫描器和读取缓冲区。文件相对于活动目录句柄打开，对于缓存列表则通过绝对路径打开。只有完成的搜索结果会经过有界输出通道；不存在第二个搜索池或候选项移交。随后将每文件结果按路径排序。
      - 有匹配预算（`maxCount`）时，一个 `walk::Tree`（`Order::Paths`，串行异步游标）向 `exec::ordered` 供给数据：后者是具有工作线程本地会话和扫描器的固定池。候选项按每批最多 16 个分组，同时在处理的候选项最多为 `parallelism*16` 个。结果严格按路径顺序消费；满足预算后会丢弃流并停止生产者和工作线程。按路径排序的首页结果是确定的。
      - `maxCountPerFile`（内容模式）限制每文件收集的匹配数，使一个高匹配量文件无法在搜索到其他文件之前耗尽全局 `maxCount` 预算。
      - 超过 4 MiB 的文件排在所有其他文件之后，并且只搜索其前 4 MiB。
      - `offset` 和 `maxCount` 在聚合每文件结果时应用。位置参数 `onMatch(error, match)` 回调在目录聚合后发出；直接文件分支返回其匹配，不调用该回调。

### 批量交付（`onMatches`） \{#batched-delivery-onmatches}

`GrepOptions.onMatches(matches)` 是独立的流式 API，没有错误优先参数。它在扫描期间交付每批最多 1024 个条目，不保证文件顺序。它支持内容、计数和含匹配文件输出。它不能与 `maxCount` 或非零 `offset` 组合使用；`maxCountPerFile` 仍可用。

批次通过有界的 `tokio::sync::mpsc::Sender<Vec<Match>>`（每批来自一个文件）流向转发器；转发器等待每次 JS 调用（`call_async_catch`），并将排队的批次合并为最多 1024 个匹配；通道容纳 4 个批次，因此背压端到端传递到扫描端。成功完成会等待每个回调，返回带有 `matches: []` 的计数器，且不调用位置参数 `onMatch`。回调抛出异常会以该错误拒绝 promise。取消会丢弃搜索 future，但已在 JS 上排队的回调仍可能运行。

### 结果整形并返回 JS \{#result-shaping-back-to-js}

- Rust 的 `SearchResult`/`GrepResult` 字段通过 N-API 对象转换映射到 TS 接口。
- 需要时，计数器会在跨越 N-API 边界之前钳制。
- `GrepResult.limitReached` 是可选的，在为 true 时输出；`skippedOversized` 和 `binaryMatches` 只在非空时输出（`skippedOversized` 统计连 4 MiB 前缀都无法搜索的超大文件）。
- `onMatches` 在扫描期间接收整形后的批次；目录的位置参数 `onMatch` 回调在聚合后接收一个整形后的条目。

### 失败行为 \{#failure-behavior}

- `search` 对正则/搜索失败返回 `SearchResult.error`，而不是抛出异常。
- `grep` 在无效路径或取消超时/中止等硬错误时拒绝 promise。被两个正则引擎都拒绝的模式回退为字面量搜索，而不是产生正则错误。
- `hasMatch` 成功时返回布尔值；匹配器构造使用相同的宽容回退。
- 不可读/非普通文件会被跳过。成功搜索的超大文件前缀不计入跳过数量；`skippedOversized` 报告无法通过前缀扫描轮次搜索的超大文件。

### 格式错误的正则处理 \{#malformed-regex-handling}

`grep.rs` 在正则编译之前清理花括号：

- 无效的类似重复量词的花括号在无法构成 `{N}`、`{N,}`、`{N,M}` 时会被转义（`{`/`}` -> `\{`/`\}`）。
- 这可以防止常见的字面量模板片段（例如 `${platform}`）因重复量词格式错误而失败。
- 因分组未闭合/缺少开头而编译失败时，会触发一次针对性重试，将未转义的圆括号转义，同时保留正则的其余部分。
- 如果两个引擎仍然拒绝该模式，则将整个原始模式转义并按字面量搜索。

## 2) 文件发现（`glob`）和模糊路径搜索（`fuzzyFind`） \{#2-file-discovery-glob-and-fuzzy-path-search-fuzzyfind}

`glob` 和 `fuzzyFind` 共享可选的 `omp-xfs` 列表缓存；匹配逻辑不同。两个 API 的缓存使用默认都为 `false`。

### `glob` 流程 \{#glob-flow}

1. 调用方直接传入 `GlobOptions`。生成的类型中，`pattern` 和 `path` 为必需字段。
2. Rust 使用选定的文件系统，通过 `omp_xfs::fs::resolve_dir` 解析搜索路径，并运行 `omp_xfs::glob::glob`，后者将模式规范化并编译为 `omp_xfs::glob::Selector`。空/纯空白模式变为 `"*"`。
3. 条目来源：由选择器裁剪的 `omp_xfs::walk::collect` 遍历（不超出模式能到达的深度，绝不进入不可能存在匹配的子树）。来自 `GlobOptions.cache` 的 `walk::Options::cache` 为原生文件系统上的最小详情遍历启用列表缓存。
   - 默认不跟随后代链接。`followLinks: true` 使用遍历器的防循环链接跟随；文件系统提供方负责挂载范围约束。Glob 和 find 只对显式 `skill://` 根启用它，并在其 URL 文件系统中强制遵守插件/技能边界。
4. 过滤：
   - 始终跳过 `.git`；
   - 提供 `includeNodeModules` 时，由它控制是否包含 node 模块；省略时，根据模式是否提及 `node_modules` 推断是否包含；
   - 应用 glob 匹配；
   - 在遍历器收集之后应用 `FileType` 枚举过滤；符号链接的 `File`/`Dir` 过滤器通过选定的文件系统解析目标元数据，并在接受的匹配中保留其 mtime 和普通文件大小。悬空链接被这些目标类型过滤器排除。
5. 可选地按 mtime 降序（`sortByMtime`）排序，再按路径升序排序，然后截断到 `maxResults`。回调接收返回的有序匹配集；`totalMatches` 是其长度，而不是未截断的总数。

### `fuzzyFind` 流程 \{#fuzzyfind-flow}

1. Rust 实现位于 `fd.rs`；生成的导出为 `fuzzyFind`。
2. 条目来自原生文件系统上的 `omp_xfs::walk::collect`，使用相同的缓存选择启用机制（`FuzzyFindOptions.cache`）。
3. 评分：
   - 精确 / 前缀 / 包含 / 基于子序列的模糊评分；
   - 不含 `/` 的查询只匹配基本名称；路径式查询也可以匹配完整相对路径；
   - 对分隔符/标点规范化后的评分；
   - 目录加分和确定性的同分排序（`score desc`，然后按路径深度升序，再按 `path asc`）。
4. 排除符号链接条目，但遍历会跟随符号链接目录。目录结果路径以 `/` 结尾；`totalMatches` 统计 `maxResults` 前 N 项限制（默认 100）之前所有已评分的匹配。

### 失败行为 \{#failure-behavior-1}

- 无效的 glob 模式会从选择器编译返回错误（`omp_xfs::glob::GlobError::Pattern`）。
- 对于目录发现流程，搜索根必须解析为现有目录。
- 取消/超时作为中止错误传播：`task::filesystem_future` 在中止/超时时丢弃 omp-xfs future，并由丢弃守卫设置停止标志，取消其派生的任务。`walk::Tree` 为每个条目消耗 tokio 的协作预算，因此参与竞速的遍历也会取消。

### 格式错误的 glob 处理 \{#malformed-glob-handling}

`omp_xfs::glob::Selector` 的规范化是宽容的：

- 将 `\` 规范化为 `/`，
- 在 `recursive=true` 时为简单递归模式自动加上 `**/` 前缀，
- 在编译前自动闭合不平衡的 `{...` 选择分组。

## 3) AST 搜索/匹配/编辑（`astGrep`、`astMatch`、`astEdit`） \{#3-ast-searchmatchedit-astgrep-astmatch-astedit}

`ast.rs` 暴露语法感知的代码搜索和重写操作。

- `astGrep`/`astEdit` 使用解析后的 `omp_vfs::Fs`，在 `task::filesystem_future` 下运行；`omp-ast` 的 `discover`、`find`、`find_page` 和 `rewrite` 是异步的，每文件工作在 `tokio::spawn` 任务中执行，并保持候选项顺序。`astMatch` 使用同步的 `find_source`，在 `task::blocking` 上配合 `CancellationToken` 运行。
- `astGrep(options)` 返回带有字节/行/列坐标以及可选元变量绑定的匹配。
- `astMatch(options)` 针对内存中的 `source` 字符串而非文件运行相同模式；`lang` 为必需项（没有可供推断语言的路径），结果保留匹配、`totalMatches`、`limitReached` 和解析错误，但省略文件计数字段。
- `astEdit(options)` 返回替换更改、每文件计数、已搜索/已触及文件计数、解析错误以及是否已应用编辑。
- 实现中 `dryRun` 默认为 `true`。完全重复的编辑会被合并。应用时（`dryRun=false`），重写后的文件会在写入前暂存，重叠编辑通过 `omp-ast` 的编辑应用过程被拒绝；试运行预览不执行该应用时验证。文件按顺序写入，不是多文件事务。
- 选项包括语言覆盖、路径/glob/选择器、严格程度、限制、解析错误策略、`signal` 和 `timeoutMs`。`astGrep`/`astEdit` 还接受 `filesystem`；`astMatch` 在内存中执行。查找限制默认为 50（并钳制为至少 1）；严格程度默认为 `"smart"`。查找的 `context` 为保留项，当前未使用。
- 对于 `astGrep` 和 `astEdit`，目录 `path` 会在原生文件系统上请求共享列表缓存，可选 glob 则编译为 `Selector::scope`；注入的提供方绕过该缓存。直接文件会返回该候选项，不进行遍历或缓存访问。`astMatch` 保持在内存中执行。

这些导出是工具使用的直接原生 API；它们不经由 `packages/natives` 中的 TS 包装器中介。

## 4) 共享遍历/缓存生命周期（`omp-xfs`） \{#4-shared-walkcache-lifecycle-omp-xfs}

`omp-xfs` 负责遍历、原生/提供方根解析（`omp_xfs::fs`）以及缓存策略。N-API 模块只保留面向 JavaScript 的 DTO 转换和错误映射（`glob.rs` 保存 `FileType`/`GlobMatch`；`task::walk_failure` 映射遍历错误）。

缓存是进程级的，存储每目录列表，而不是每根的条目列表：每次启用缓存的遍历都共享它们，不受根或遍历选项影响；遍历器在每次遍历时重新应用隐藏/忽略策略、裁剪和过滤器。只有使用 `Detail::Minimal` 且 `walk::Options::cache = true` 的原生文件系统遍历参与缓存，而且只限于具有稳定戳记的文件系统（APFS；ext4/XFS/Btrfs/tmpfs/F2FS/ZFS/bcachefs；NTFS/ReFS）。任何注入的文件系统提供方都会禁用缓存，即使其根重定向到主机路径。

遍历并行度：omp-xfs 没有自己的运行时。每次遍历在当前 tokio 运行时上启动 `walk::Options::parallelism` 个长生命周期工作线程。工作线程共享目录队列，并保留各自的会话和缓冲区；不会为每个目录或文件派生任务。将 `PI_WALK_WORKERS` 设为正数 `N` 时使用 `N` 个工作线程；未设置或为 `0` 时使用每文件系统默认值（macOS 为 4，Linux 为 8，其他平台和提供方为 4），并受可用并行度上限约束。

### 缓存状态转换 \{#cache-state-transitions}

1. **禁用 / 不符合条件**
   - 重新列出目录，不读取或更新缓存。
2. **命中**
   - 目录戳记（dev/ino/mtime/ctime）及其忽略文件的戳记未变：只需一次元数据调用的代价即可复用缓存列表。
3. **未命中 / 已更改**
   - 重新列出目录；只有当戳记早于 50 ms 的竞态窗口时才存储列表。缓存分为 64 个分片，总容量约为 64 MiB，满时丢弃整个分片。

缓存无需失效操作也能保持正确，因为每次变更都会改变戳记，因此它不暴露失效操作；直接的原生 `astEdit` 写入和智能体变更无需进行缓存记账。

## 5) ANSI 文本工具（`text`） \{#5-ansi-text-utilities-text}

这些都是纯内存内工具。

### 边界和职责 \{#boundaries-and-responsibilities}

- `text.rs` 负责终端单元格语义：
   - ANSI 序列解析，
   - 感知字素的宽度和切片，
   - 换行/截断/切片行为，
   - 在宽度敏感 API 上提供显式制表符宽度参数。
- `grep.rs` 的行截断（`maxColumns`）是独立的：
   - 在简单字符边界处截断匹配行，并添加 `...`，
   - 不保留 ANSI 状态，也不感知终端单元格宽度。

### 关键行为 \{#key-behaviors}

- `wrapTextWithAnsi`：按可见宽度换行，跨换行携带活动 SGR 代码，并在行边界关闭/重新打开 OSC 8 超链接。
- `truncateToWidth`：按可见单元格截断，支持省略号策略（默认为 `Unicode`，另有 `Ascii`、`Omit`）以及可选的右侧填充（默认为 `false`）。
- `sliceWithWidth`：为列切片返回 `{ text, width }`；严格宽度强制默认设为 `false`。
- `extractSegments`：提取浮层前后的片段，同时为 `after` 片段恢复 ANSI 状态。
- `setHangulCompatJamoWidthOverride(value)` 控制 U+3131-U+318E 的宽度校正，以兼容客户端终端：`0` 使用平台回退，`1` 强制一个单元格，`2` 强制两个，`3` 遵循 Unicode 宽度。
- `sanitizeText` 不是原生导出。它位于 `@oh-my-pi/pi-utils`（`packages/utils/src/sanitize-text.ts`），使用 `Bun.stripANSI`、控制字符移除以及格式错误的代理项清理。
- `visibleWidth`：使用调用方提供的制表符宽度统计可见终端单元格。宽度敏感导出将制表符宽度钳制到 `1..16`；制表符占用该固定宽度，而不是展开到制表位。
- 文本处理直接使用 JS UTF-16，提供 ASCII 快速路径，并为非 ASCII 内容进行字素分段。OSC 66 缩放文本载荷会贡献可见宽度，而不是被视为零宽转义序列。

### 失败行为 \{#failure-behavior-2}

文本函数通常返回确定性的变换输出；错误仅限于 N-API 参数/字符串转换边界。

## 6) 语法高亮（`highlight`） \{#6-syntax-highlighting-highlight}

`highlight.rs` 是纯变换；不使用文件系统扫描缓存。

### 流程 \{#flow}

1. 调用方传入 `code`、可选的 `lang` 以及 ANSI 调色板。
2. Rust 依次通过令牌/名称查找、扩展名查找，再通过别名表回退来解析语法。语言缺失/未知时原样返回原始代码。
3. 每行通过 syntect 的 `ParseState` 和作用域栈解析。
4. 作用域映射到语义颜色类别，并注入/重置 ANSI 颜色代码。

`HighlightStream(lang, colors)` 跨 `push(chunk)` 调用保留解析器/作用域状态，并暴露 `supported`。请送入以换行符结尾的完整行，最后一个块可以省略换行符；任意行中间的块无法获得与一次性高亮相同的保证。未知语言会原样透传。

`warmHighlighter()` 在阻塞池上初始化语法/作用域匹配器，并解析代表性源代码。语法集包含 syntect 默认语法，以及捆绑的 Julia、Nix、Mermaid、TypeScript、TSX 和 Astro 语法。`getSupportedLanguages()` 返回语法名称；`supportsLanguage()` 还识别别名，其中一些映射到相关语言的语法。

调色板需要九种核心语义颜色（`comment`、`keyword`、`function`、`variable`、`string`、`number`、`type`、`operator`、`punctuation`）；差异的 `inserted`/`deleted` 颜色为可选项。

### 失败行为 \{#failure-behavior-3}

- 每行解析失败不会导致调用失败：该行不加高亮直接追加，然后继续处理。
- 语言缺失/未知时原样返回输入，而不是解析纯文本回退。

## 7) 令牌计数（`tokens`） \{#7-token-counting-tokens}

`countTokens(input, encoding?)` 是内存内工具。

- `input` 可以是单个字符串或字符串数组。
- 数组返回一个汇总计数；至少包含 16 项的批次在全局池可用时使用 Rayon，否则串行计数。
- 默认编码为 `O200kBase`。其他编码为 `Cl100kBase`、`ClaudeV3`、`ClaudeV47`、`ClaudeV5`、`ClaudeV5Sonnet`、`Qwen3`、`DeepSeekV3`、`KimiK2`、`Glm5` 和 `Jev`。
- `tokens.rs` 将 UTF-16 输入分派给内嵌的 `utok`；词表在首次使用时加载并复用。计数衡量内容，而不是请求/消息封装；普通 BPE 编码不解释特殊令牌。

## 纯工具与依赖文件系统的流程 \{#pure-utility-vs-filesystem-dependent-flows}

| 流程 | 文件系统访问 | 共享缓存 | 说明 |
| --- | --- | --- | --- |
| `search` / `hasMatch` | 否 | 否 | 只对提供的字节/字符串执行正则匹配 |
| `text` 模块函数 | 否 | 否 | 只有 ANSI/宽度工具 |
| `highlight` 模块函数 | 否 | 否 | 只有语法和 ANSI 着色 |
| `countTokens` | 否 | 否 | 只有分词 |
| `astMatch` | 否 | 否 | 内存内语法感知匹配（不访问磁盘） |
| `astGrep` / `astEdit` | 是 | 仅原生 | 目录发现请求缓存；直接文件/提供方绕过缓存 |
| `glob` | 是 | 可选 | 目录扫描和 glob 过滤（选择启用 `cache`） |
| `fuzzyFind` | 是 | 可选 | 目录扫描和模糊评分（选择启用 `cache`） |
| `grep`（文件/目录路径） | 是 | 从不 | 不缓存的并行遍历/搜索，结果按路径排序 |

## 端到端生命周期总结 \{#end-to-end-lifecycle-summary}

1. 调用方使用类型化选项调用生成的原生导出。
2. Rust 验证/规范化选项，并构建匹配器/搜索配置。
3. 对于文件系统流程，`omp-xfs` 遍历树（在适用缓存时复用未更改的目录列表），然后对条目进行过滤/评分/搜索。
4. 超时/中止会丢弃 omp-xfs future，取消其任务。
5. Rust 将输出整形为 N-API 对象（`lineNumber`、`matchCount`、`limitReached` 等）。
6. 生成的绑定返回类型化的 JS 对象。`glob` 在排序后输出返回的匹配；`grep` 支持聚合后的目录位置参数回调，或扫描期间的批量 `onMatches` 交付。
