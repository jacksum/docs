---
title: "read"
description: "Oh My Pi 官方仓库文档：read。"
---

# read \{#read}

> 通过一个 `path` 字符串读取文件、目录、归档、SQLite 数据库、内部资源、图像、文档和 URL。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/read.ts`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/read.md`
- 按需文档主题（`ReadTool.docTopics()`）：`help://read/sources`（`prompts/tools/read-sources.md`：SQLite、归档、JSON 查询、可执行文件、视频、SVG 和合并冲突选择器，以及归档和 SQLite 的 `write` 目标）和 `help://read/urls`（各内部 URL 方案的 `promptReference()`：其系统提示单行条目省略的子路径、查询和限制）。
- 关键协作模块：
   - `packages/coding-agent/src/tools/path-utils.ts`：优先使用字面文件名；规范化本地路径，并恢复误用分隔符组成的路径列表。
   - `packages/coding-agent/src/tools/details/read.ts` / `packages/coding-agent/src/tools/line-ranges.ts`：拆分尾部选择器并解析行范围；`packages/coding-agent/src/tools/read-selector.ts` 解析原始、范围和尾部选择器。
   - `packages/coding-agent/src/tools/read-archive.ts`、`read-sqlite.ts`、`read-binary.ts`、`read-pdf.ts` 和 `read-format.ts`：专用读取器以及共享的格式化/分页。
   - `packages/utils/src/ar`（`@oh-my-pi/pi-utils/ar`）：统一归档注册表：检测 `archive.ext:inner/path`、索引归档、列出/读取条目。
   - `packages/coding-agent/src/tools/sqlite-reader.ts`：检测 SQLite 目标、解析选择器、渲染表格。
   - `packages/coding-agent/src/tools/fetch.ts`：URL 解析、获取/渲染流水线、URL 缓存/产物。
   - `packages/coding-agent/src/internal-urls/router.ts`：内置内部资源注册表，包括 `ssh://` 和 `help://`；MCP 可以通告其他方案。
   - `crates/natives/src/edit.rs`（`notebook_to_editable_text`，暴露为 `notebookToEditableText`）：将 `.ipynb` 转换为可编辑的单元格文本。
   - `packages/coding-agent/src/utils/cpuprofile.ts` / `sample-profile.ts`：汇总识别出的性能分析器报告。
   - `packages/coding-agent/src/utils/file-display-mode.ts`：决定使用 hashline、行号还是原始显示。
   - `packages/coding-agent/src/workspace-tree.ts`：渲染目录树。
   - `packages/coding-agent/src/edit/store.ts`：会话范围内的原生 `EditStore`，用于快照和 hashline 验证/恢复。
   - `packages/coding-agent/src/tools/index.ts`：注册 `read: s => new ReadTool(s)`。

## 注册 / 可见性 \{#registration--visibility}

- 元数据：`strict = true`、`loadMode = "essential"`。审批通常使用内部方案的读取层级；PDF 页面截图需要 `"exec"`。
- 面向模型的提示根据实时显示模式渲染 hashline 指引；它列出特殊来源，并链接到 `help://read/sources` 以提供其选择器，后者仅在能解析到反汇编器后端（`disassembler.backend`）时列出可执行文件分析视图。

## 输入 \{#inputs}

| 字段 | 类型 | 是否必填 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 是 | 文件系统路径、内部 URL 或 Web URL。可带有 `:50-100` 或 `:raw` 等尾部选择器。 |

### 选择器语法 \{#selector-grammar}

对于普通的类文件读取，`packages/coding-agent/src/tools/details/read.ts` 中的 `splitPathAndSel()` 仅在最后一个后缀匹配以下形式之一时才会识别它：

| 后缀 | 含义 |
| --- | --- |
| `:raw` | 原始/原样模式。禁用结构摘要和行前缀。 |
| `:img` | 将本地 `.svg`/`.svgz` 文件栅格化，作为图像块返回以供视觉输入。仅支持本地 SVG/SVGZ 文件。 |
| `:conflicts` | 扫描本地文件中的未解决 Git 合并冲突区域，将其注册到会话冲突历史，并渲染紧凑的 `#N Lx-Ly` 索引。 |
| `:N` / `:LN` / `:N-` / `:N..` | 从以 1 为起点的第 `N` 行开始，不限定结束位置。 |
| `:A-B` / `:LA-LB` / `:A..B` | 以 1 为起点、两端均包含的行范围（`..` 是宽松别名，会规范化为 `-`）。 |
| `:A+C` / `:LA+LC` | 从 `A` 开始的 `C` 行；工具将其转换为结束行 `A + C - 1`。 |
| `:-N` | 最后 `N` 行；`N` 必须为正数。也可与 `:raw` 以及逗号列表中的范围组合（`:1-12,-15`）。 |
| `:R1,R2,...` | 多个范围，读取前排序并合并（例如 `:5-16,960-973`）。 |
| `:range:raw` 或 `:raw:range` | 相同的行选择，但输出为原始内容。例外：单独的裸 `N` 表示单行 `N`（`:17:raw`）；`:N-:raw` 仍不限定结束位置。 |

`parseLineRangeChunk()` 中的验证：

- 行号从 1 开始；`:0` 会抛出异常。
- `+` 计数必须 `>= 1`。
- `-` 的结束值必须 `>= start`。

选择器解析会有意放过无法识别的尾部 `:...`；归档和 SQLite 路径会处理自己的冒号语法。

逗号列表可以在逗号后重复选择器冒号（`:1-30,:-30` 按 `:1-30,-30` 读取，也可在任一侧包含 `:raw`）。`splitPathAndSel(path, { foldListColons: false })` 将该冒号保留在路径中，优先采用字面路径的拆分器使用此行为，因此名称与列表头部相似的现有文件（`a:1-30,`）仍优先匹配。

URL 选择器在 `packages/coding-agent/src/tools/fetch.ts` 中单独解析，但对 `:raw`、`:N`、`:A-B`、`:A+C`、`:5-10,20-30` 和 `:range:raw` / `:raw:range` 使用同一个行范围解析器。由于 URL 端口也使用 `:`，在主机/端口 URL 上添加选择器前，要先加一个尾部斜杠，例如 `https://example.com/:80`。
字面的文件系统路径优先于选择器解释，因此以类似选择器文本结尾的现有 POSIX 文件名会按字面读取。

## 输出 \{#outputs}

- 通过 `packages/coding-agent/src/tools/tool-result.ts` 中的 `toolResult()` 构建的一次性 `AgentToolResult`。
- `content` 通常为一个文本块。图像读取可能返回 `[text, image]`。
- `details` 依路径而异。`ReadToolDetails` 可能包含：
   - `kind: "file" | "url"`（URL 路径使用 `kind: "url"`；文件读取通常省略 `kind`）
   - `isDirectory`
   - `resolvedPath`
   - `suffixResolution`
   - URL 字段：`url`、`finalUrl`、`contentType`、`method`、`notes`
   - `truncation`（`ReadTruncationStats`：只有计数器和标志；没有重复的 `content` 字段）
   - `displayContent`（无前缀的文本及起始行，用于 TUI 渲染）
   - 结构摘要的 `summary`（`lines`、`elidedSpans`、`elidedLines`）
   - `<path>:conflicts` 的 `conflictCount`
   - 工具恢复误用分隔符组成的路径列表时，用于 TUI 显示的 `displayReadTargets`
   - 来自 `packages/coding-agent/src/tools/output-meta.ts` 的 `meta`
- `details.meta.source` 设置为底层路径、URL 或内部 URL。
- `details.meta.truncation` 携带显示范围、总行数/字节数、下一个偏移量，以及缓存 URL 输出的可选 `artifactId`。
- 读取结果正文位于 `content`；`details.displayContent` 仍是无前缀的 TUI 表示。以前读取 `details.truncation.content` 的扩展必须改用这些字段。包含该额外字段的旧会话记录仍可加载和渲染，无需迁移。
- 目录/归档列表和 SQLite 表列表在触发列表限制时还会设置 `details.meta.limits`。

## 流程 \{#flow}

1. `ReadTool.execute()` 接受 `{ path }`。首先通过 `expandPath()` 展开 `file://...` 输入。
2. 通过 `packages/coding-agent/src/tools/fetch.ts` 中的 `parseReadUrlTarget()` 尝试处理 Web URL。
   - 普通 URL 读取调用 `executeReadUrl()`。
   - 带行选择器的 URL 读取会按需获取/渲染内容到 URL 缓存，再在本地对渲染后的文本分页。
3. 检查内部 URL 路由器，包括内置方案和 MCP 通告的方案。
   - 对于由文件支持且被路由器定位到本地文件的方案（`local://`，包括溢出内容、`agent://`、`skill://`、`memory://root/...`、`vault://` 等），通过文件系统流水线读取该文件，因此图像、`:img`、转换、选择器、流式读取和快照的行为与文件系统读取相同，而 URL 仍作为结果的来源。图像问题（`?q=`）只对 `local://` 和 `attachment://` 图像拆分；在其他方案中，`?q=` 保留为 URL 的一部分。
   - `agent://` 路径提取（`/path`）返回绕过分页的独立值。
   - 其他内部资源在内存中分页。
4. 优先采用现有的字面文件系统路径，然后才将类似选择器的冒号视为归档、SQLite、PDF 图像或行选择器语法。
5. 接着通过 `read-archive.ts` 中的 `resolveArchiveReadPath()` 尝试解析归档。
   - `parseArchivePathCandidates()` 在 `:sub/path` 之前使用统一归档扩展名注册表。
   - 成功时，`readArchive()` 列出目录，或将条目解码为 UTF-8 文本。
6. 通过 `read-sqlite.ts` 中的 `resolveSqliteReadPath()` 尝试解析 SQLite。
   - `parseSqlitePathCandidates()` 在任何 `:table`、`:key` 或 `?query` 后缀之前扫描 `.sqlite`、`.sqlite3`、`.db`、`.db3`。
   - `readSqlite()` 根据 `parseSqliteSelector()` 分派。归反汇编器后端管理的文件不会作为 SQLite 读取：Binary Ninja 的 `.bndb` 虽是 SQLite 文件，却走反汇编器路径。随后，可执行文件和反汇编器数据库分析视图目标由 `resolveBinaryViewPath()` 和 `readBinary()` 处理。
7. 否则将输入视为本地文件系统路径。
   - `resolveReadPath()` 展开 `~`，相对于会话 cwd 解析，将裸 `/` 视为会话 cwd，并重试 macOS 截图/NFD/弯引号变体。
   - 如果路径不存在，`findUniqueWorkspaceSuffix()` 尝试在整个工作区中进行唯一后缀匹配（远程挂载时跳过）。cwd 根目录下与活动 `local://` 计划基名匹配的文件名可能恢复该计划。作为最后一道受防护的恢复手段，会逐部分读取误用分隔符组成的现有路径列表；调用方仍应为每个路径发出一次 `read`。
   - 如果解析出的目标既不是普通文件也不是目录（字符或块设备、FIFO、套接字），则以指明其种类的 `ToolError` 拒绝。读取在进程内运行，因此读取 `/dev/stdin` 或 FIFO 会阻塞，而 `/dev/zero` 会永不结束，占用的原生线程无法通过任何超时或中止取消。
8. 目录走 `#readDirectory()`。
9. 非目录按内容类型分支：
   - 图像元数据 / 内联图像
   - 汇总的 macOS `sample` 或 V8 `.cpuprofile` 报告
   - 可编辑的笔记本文本
   - markit 转换的文档
   - 二进制文件提示，除非显式指定了 `:raw`
   - 可解析代码/文本的结构摘要
   - 流式文本/行范围读取
10.   不超过 `SNAPSHOT_MAX_BYTES`（4 MiB）的本地文件会一次性缓冲，用于检测、摘要、范围和快照；更大的文本文件使用 `streamLinesFromFile()`。单个有界的非原始文本范围会在受限的两端添加 `1` 行前置和 `3` 行后置上下文；原始和多范围读取保持精确。
11.   符合 hashline 条件的本地读取会在会话的原生 `EditStore` 中记录快照和已见行，用于后续 hashline 验证/恢复。
12.   如果发生后缀解析，第一个文本块会加上前缀 `[Path '...' not found; resolved to '...' via suffix match]`。

## 模式 / 变体 \{#modes--variants}

### 本地文本文件 \{#local-text-files}

- 无选择器：如果启用了摘要且文件符合条件，`trySummarize()`（`packages/coding-agent/src/tools/read-summary.ts`）调用 `summarizeCodeAsync()`。
   - 默认值：`read.summarize.enabled = true`；普通文本（`.md` 变体和 `.txt`）保持不作摘要，除非 `read.summarize.prose = true`；少于 `read.summarize.minTotalLines = 100` 行的文件保持原样。
   - 硬性防护：文件大小 `<= 2 MiB`（`MAX_SUMMARY_BYTES`），行数 `<= 20_000`（`MAX_SUMMARY_LINES`）。
   - 摘要输出保留选定声明，并以 `…` 或包含 `{ … }` 的合并花括号配对行替换省略区域。只要省略了至少一个区域，文本内容就会以类似 `[…NNln elided; re-read needed ranges, e.g. <path>:5-16,40-80]` 的页脚结尾，使用实际省略位置中的具体范围。
   - 当省略块位于匹配的花括号行之间时，`renderSummary()` 可能将它们合并为一个带锚定信息的行，而不是分别输出开始/结束行。
- 显式选择器或未生成摘要：流式文本读取。
   - 默认的不限定结束位置的限制为 `read.defaultLimit = 300`，钳制至 `[1, DEFAULT_MAX_LINES]`。
   - 单个有界的非原始文本范围会在受限的两端添加 `RANGE_LEADING_CONTEXT_LINES = 1` / `RANGE_TRAILING_CONTEXT_LINES = 3`。原始和多范围读取保持精确；目录列表选择器切取渲染后的条目，不附带上下文。
   - 非原始输出使用 `resolveFileDisplayMode()`：
      - 当编辑模式为 hashline、读取不是原始模式、来源可变且存在 edit 工具时，使用 hashline 编号输出
      - 否则在 `readLineNumbers === true` 时可选地显示行号
      - 原始模式抑制两者
- hashline 模式的前缀格式为 `[PATH#TAG]` 头部，后接 `LINE:TEXT`，例如 `[src/foo.ts#0A1B]` 和 `41:def alpha():`，由会话快照存储及 `formatNumberedLine()` / `formatHashlineHeader()` 生成。
- `edit`/hashline 路径之后会使用该头部和裸行号；四位十六进制标签是整个规范化文件的内容派生哈希，可通过记录它的会话快照存储解析。不可变来源和 `:raw` 会有意抑制 hashline 头部。
- 原始逗号范围用单个换行符连接选定源代码行，不包含省略行。有限原始范围会省略末尾换行符，并在范围满足时不带续读页脚；到达 EOF 的开放范围保留末尾换行符。实际字节/行数上限仍会带来截断诊断。冲突标记在原始读取中仍是源文本：保留注册和 `conflictCount`，而冲突指令移到 `details.notes`，不放在正文中。
- 越界的原始选择不贡献源文本；跳过范围和单行边界诊断保留在 `details.notes` 中。重复的原始读取也将循环提示保留在 `details.notes` 中，恢复的路径则保留在 `details.suffixResolution` 中，不加正文前缀。`details.raw` 将解析出的模式传递给这些共享提示生成器，包括字面文件名看起来像选择器的情况。

### 目录列表 \{#directory-listings}

- `#readDirectory()` 使用以下参数调用 `buildDirectoryTree()`：
   - `maxDepth = 2`
   - `perDirLimit = 12`
   - `rootLimit = null`
   - `lineCap = null`；随后选择器切取完整渲染列表，包括尾部选择器
- `buildDirectoryTree()` 按新近程度对同级项排序，显示文件大小和相对时间，并可能在树截断时标记 `limits.resultLimit`。
- 空目录渲染为 `(empty directory)`。

### 归档 \{#archives}

- 支持的归档容器（扩展名表位于 `packages/utils/src/ar/registry.ts`）：tar 系列 `.tar`、`.tar.gz`/`.tgz`、`.tar.bz2`/`.tbz2`/`.tbz`、`.tar.xz`/`.txz`、`.tar.zst`/`.tzst`、`.tar.z`；ZIP 系列 `.zip`、`.jar`、`.war`、`.ear`、`.apk`、`.whl`、`.ipa`、`.xpi`、`.vsix`、`.nupkg`、`.cbz`；独立格式 `.rar`/`.cbr`、`.7z`、`.iso`、`.cab`、`.cpio`、`.rpm`、`.ar`/`.a`/`.lib`、`.deb`、`.lzh`/`.lha`、`.arj`、`.asar`；单流格式 `.gz`、`.bz2`、`.xz`、`.zst`、`.z`、`.lzma`。
- 语法：`archive.ext`、`archive.ext:path/inside`、`archive.ext:path/inside:50-60`、`archive.ext:path/inside.json?q=.x`。
- `openArchive()` 通过 `@oh-my-pi/pi-utils/ar` 注册表（`packages/utils/src/ar/open.ts`）分派；限制位于 `packages/utils/src/ar/limits.ts`：内存中的归档上限为 256 MiB，索引读取上限为 64 MiB，单个成员提取上限为 64 MiB。
- 普通 TAR 索引通过字节范围读取头部和有界元数据，跳过成员载荷。其容器大小不受完整缓冲上限约束；选定的成员仍受提取上限约束。
- 归档路径会规范化 `/`、丢弃 `.` 段并拒绝 `..`。
- 目录读取列出直接子项；文件显示 `name`，当大小 > 0 时加上 ` (size)`。
- `readArchiveDirectory()` 中的目录列表默认限制为 `500` 个条目。
- 选定的 PDF 条目使用与普通 PDF 文件相同的 Markdown 转换，包括行、多范围、尾部和原始选择器。读取标识同时保留归档和成员路径，且不可变。
- 诸如 `a.zip:folder/sample document.pdf:page2.png` 的 PDF 页面图像读取，仅通过 Chromium 渲染选定成员。其受大小限制的临时 PDF 在成功、失败或取消后都会被移除；归档路径不会解包到工作目录中。
- 其他文件条目按 UTF-8 解码。不受支持的二进制条目返回 `[Cannot read binary archive entry '...' (...)]`，而不是字节。
- 文本归档条目作为不可变资源在内存中分页（无 hashline 锚点），并接受 [JSON 查询](#json-queries)。

### 可执行文件和反汇编器数据库 \{#executables-and-disassembler-databases}

- 不带选择器读取 ELF/PE/Mach-O 二进制文件（包括无扩展名文件）及反汇编器数据库文件（IDA `.i64`/`.idb`、Binary Ninja `.bndb`）时，只返回磁盘上的元数据（`entityLabel: "binary metadata"`）。不会打开分析数据库，也不会配置后端；行选择器对元数据文本分页。`:raw` 绕过此路径。`.bndb` 是 SQLite 文件，但无论不带选择器还是带视图，都会走此路径，而非 SQLite 路径。
- 元数据页脚列出显式分析选择器，并指向 eval 的 `dsm` 命名空间（`help://eval/dsm`）；或者，当 `disassembler.backend` 解析不到后端时，说明分析已禁用。
- 分析视图需显式选择启用：`:overview`（函数列表）、`:<func|0xaddr>`（伪代码）、`:<func>:asm`、`:imports`、`:exports`、`:strings` 和 `:xrefs:<func|0xaddr>`。保留的视图名称优先于同名函数，后者仍可通过地址访问。追加行选择器可对渲染的视图分页（`bin:main:10-40`）。它们通过选定的后端（IDA、Ghidra 或 Binary Ninja）打开数据库，首次使用时可能会配置 Ghidra；参见 [`dsm`](./dsm.md)。
- 通用 Mach-O 读取默认使用主机架构切片；`bin:@x86_64` 选择另一切片的元数据，`bin:@x86_64:main` 分析该切片。
- 没有可用后端时，分析选择器会失败。数据库文件只能由管理它的后端打开：`.i64`/`.idb` 分析要求 `disassembler.backend=ida`，`.bndb` 分析要求 `disassembler.backend=binja`；使用其他后端时，视图会抛出指明所属后端的 `ToolError`。视图是不可变的生成文本，不会为 hashline 编辑建立基础。

### 视频 \{#video}

- 需要 `ffmpeg` 和 `ffprobe`。不带选择器的视频读取会为支持图像的模型返回元数据和视频帧拼图预览；纯文本模型接收元数据和帧读取提示。
- `:412` 选择帧索引；`:1h5m42s`、`:90s` 或 `:01:23` 选择时间戳。这些是帧选择器，不是文本行号。
- 视频不支持 `?q=` 图像问题。

### 性能分析器报告 \{#profiler-reports}

- 对识别出的 macOS `sample` 调用树文件（`*.sample.txt`）或 V8 `.cpuprofile` JSON 进行整文件读取时，如果有效且不超过 `32 MiB`，会返回瓶颈摘要，而非原始转储。
- 摘要是生成文本：没有行号、hashline 头部或 `:N` 续读；超过 `tools.artifactSpillThreshold` 时，会像任何工具结果一样溢出到产物中。行选择器、尾部选择器和 `:raw` 读取原文件，因此其行号和快照标签属于该文件。
- 仅具有这些名称/扩展名之一，但不能解析为预期报告的文件，会转入普通文本处理。

### SQLite 数据库 \{#sqlite-databases}

- 数据库检测要求扩展名匹配且 SQLite 文件头有效（`isSqliteFile()`）。
- `parseSqliteSelector()` 提供的选择器形式：

#### `db.sqlite` \{#dbsqlite}

- `kind: "list"`
- 列出非 `sqlite_%` 表及其行数。
- `readSqlite()` 通过 `applyListLimit()` 将渲染列表限制为 `500` 个表。

#### `db.sqlite:table` \{#dbsqlitetable}

- `kind: "schema"`
- 返回 `sqlite_master.sql` 和样本行。
- 样本大小为 `DEFAULT_SCHEMA_SAMPLE_LIMIT = 5`。

#### `db.sqlite:table:key` \{#dbsqlitetablekey}

- `kind: "row"`
- 当表恰好有一个主键列时按主键解析；否则回退到 `rowid` 查找。
- 行查找不允许查询参数。

#### `db.sqlite:table?limit=...&offset=...&order=...&where=...` \{#dbsqlitetablelimitoffsetorderwhere}

- `kind: "query"`
- 默认值：`limit = 20`、`offset = 0`。
- `limit` 上限为 `500`。
- `order` 接受 `column` 或 `column:asc|desc`，且必须指定现有列。
- `where` 只有通过 `validateWhereClause()` 的检查后才会接受，该检查拒绝注释、分号和 `LIMIT`、`OFFSET`、`UNION`、`ATTACH`、`PRAGMA` 等控制关键字。
- 未知查询参数会抛出异常。

#### `db.sqlite?q=SELECT ...` \{#dbsqliteqselect-}

- `kind: "raw"`
- 不能与表选择器组合；其他查询参数只有 `limit` 和 `offset`，它们像对表分页一样对查询行分页（默认 `limit = 20`、`offset = 0`，`limit` 上限为 `500`），并添加指明下一页 `?q=…&limit=…&offset=…` 的页脚。任何其他参数都会抛出异常，并指明该参数。
- 空 `q` 会抛出异常。
- `executeReadQuery()` 准备 SQL 并拒绝绑定参数。带有 `limit`/`offset` 时，它会在 `LIMIT ? OFFSET ?` 下将查询作为子查询运行，因此不会构建被跳过的行；不能嵌套的语句（`PRAGMA`、`EXPLAIN`）则在迭代时跳过 `offset` 行。未提供这两个参数时，它从 `statement.iterate()` 收集行，上限为 `MAX_RAW_QUERY_ROWS = 1000`。它不验证 SQL 是否以 `SELECT` 开头。

- `packages/coding-agent/src/tools/sqlite-reader.ts` 中的渲染上限：
   - ASCII 表格宽度 `120`（`MAX_RENDER_WIDTH`）
   - 每列宽度 `40`（`MAX_COLUMN_WIDTH`）
- `sqlite-reader.ts` 中的 `openSqliteReadConnection()` 使用严格模式的 Bun SQLite，并设置 `PRAGMA query_only = ON` 和 `busy_timeout = 3000`。通常以只读方式打开；WAL 附属文件缺失或 `SQLITE_CANTOPEN` 会触发读写连接（`create: false`），仅用于初始化附属文件。

### JSON 查询 \{#json-queries}

- `file.json?q=<jq filter>` 运行嵌入式 jq 解释器。`raw=true` 返回不带引号的字符串；`compact=true` 将值保持在一行。`offset` 和 `limit` 对数组元素或整个 JSONL 结果分页，并带有续读提示。
- 显式 JSON 选择器也适用于 JSON 文件的备份（`config.json.bak`、带日期的后缀），以及内容以 JSON 对象或数组开头的其他文件，例如无扩展名文件。包含 `?` 的现有字面文件名优先于选择器；栅格图像、视频、SVG `:img` 和 PDF 页面问题保留其图像路径。JSON 命名文件中的无效 JSON 会报告 JSON 解析错误。
- 只有修饰符的选择器（`?limit=2`、`?offset=1`、`?raw=true`、`?compact=true`）以及空的 `q=`/`query=` 使用恒等过滤器 `.`。只包含未知参数的查询字符串不是 JSON 选择器。
- 每份 JSON 输入都允许一个前导 UTF-8 BOM，包括 JSONL。字符串中的 U+FEFF 和原始输入（`jq -R`）字节保持不变；格式错误的 JSON 仍会报告解析错误。
- `ssh://HOST/tmp/data.json?q=.items&limit=2` 解析不带查询的 SSH 文件 URI，并在本地对其受大小限制的文本运行相同的 JSON 渲染器。1 MiB 的 SSH 上限仍然适用。过滤器不会进入远程 shell，`%3F` 仍表示字面的 `?`，不受支持的 URL 参数仍是错误。临时查询输入由工具管理，并在成功、失败或取消时移除；尾部行选择器作用于查询输出。
- 归档成员接受 JSON 查询（`archive.tar:receipt.json?q=.x`）。包含 `?` 的字面成员名优先；否则，查询在提取出的 UTF-8 成员文本上运行，尾部行选择器作用于查询输出。带 JSON 选择器的目录、PDF 和二进制成员会抛出 `ToolError`。

### 文档 \{#documents}

- `packages/coding-agent/src/utils/markit.ts` 中的 `CONVERTIBLE_EXTENSIONS` 涵盖 `.pdf`、`.doc`、`.docx`、`.ppt`、`.pptx`、`.xls`、`.xlsx`、`.rtf`、`.epub`。
- `convertFileWithMarkit()` 将文件转换为文本/Markdown；行范围和 `:raw` 选择器随后应用于转换后的输出（`file.pdf:50-100`、`:5-16,40-80`）。
- 看似 PDF 成员的路径现在请求的是 Chromium 页面截图，而非嵌入图像提取。`doc.pdf:p11-img0.png` 或 `doc.pdf:page11.png` 选择第 11 页；空的或无法识别的成员默认选择第 1 页。只有 PDF 的文件系统路径接受该成员：URL 读取或 `local://` 路径不接受。没有成员列表或提取图像缓存。数字行选择器仍对转换后的文档文本分页。
- 页面截图使用共享无头浏览器、截图后关闭的 874x874 临时标签页，以及 30 秒的渲染截止时间。捕获的是视口，查看器会将页面适配到其中（`view=Fit`）；整页截图往往会缺失 PDF 插件的框架。方形标签页使纵向和横向页面具有相同的长边。它们支持 `?q=` 图像问题，其余行为遵循普通图像呈现。
- 没有可提取文本的 PDF 页面（扫描件）会在转换文本后附加说明，指明页码和 `:page<N>.png` 成员。
- 转换失败返回类似 `[Cannot read .pdf file: ...]` 的文本块。

### Jupyter 笔记本 \{#jupyter-notebooks}

- `.ipynb` 会经过原生 `notebookToEditableText()` 处理，除非请求了 `:raw`。
- 输出是可编辑的纯文本，带有如下标记：

```text
# %% [code] cell:0
...
```

- 原始模式绕过此转换，回退到文件文本读取。

### 图像 \{#images}

- 图像检测基于元数据（`readImageMetadata()`）。
- 可接受的图像大小上限为 `20 MiB`（`MAX_IMAGE_INPUT_BYTES`，以 `MAX_IMAGE_SIZE` 重新导出）。更大的文件会抛出异常。
- `read <image>?q=<question>` 为解析出的视觉模型加载图像，并以一个文本块返回其回答。
- 不带 `?q=` 时，支持图像的活动模型会收到文本说明和内联图像块。
- 不带 `?q=` 时，纯文本活动模型会收到元数据（MIME、字节数、尺寸、通道、alpha）及 `?q=<question>` 提示。
- `images.questionTimeoutMs` 限制每个委派的图像问题；`0` 禁用超时。
- `images.questionRouting: active` 只使用活动模型回答 `?q=`，当它无法读取图像时出错；默认的 `auto` 可能回退到另一提供方的视觉模型。此时纯文本活动模型会获得不带 `?q=` 提示的元数据。
- 不受支持/无法解码的图像格式会抛出 `ToolError`。

### 内部 URL \{#internal-urls}

- `read` 将内部方案和 MCP 通告的方案委派给 `InternalUrlRouter`；内置注册表目前包括 `agent://`、`attachment://`、`cfg://`、`conflict://`、`help://`、`history://`、`issue://`、`local://`、`mcp://`、`memory://`、`mr://`、`omp://`、`out://`（只写；读取会失败）、`pr://`、`proc://`、`rule://`、`security://`、`skill://`、`ssh://` 和 `vault://`。
   - `security://` 保留给 OMP 自有、不依赖特定生成方的只读安全分析存储。
   - `agent://<id>` 读取子代理最近完成的输出，包括恢复后成功的消息结果后续轮次，其由父代理请求，或由用户在聚焦的子代理会话中输入；较新的轮次运行期间，先前输出会标为已被取代。没有已发布输出的智能体返回状态和进度。`/key/index` 从最新发布的 JSON 结果中提取内容。由同级唤醒的消息回复，以及已取消或为空的消息结果后续轮次，不会替换已接受的结果，没有 `yield` 的结构化唤醒也不会。`agent://all` 只写。裸 `history://` 列出已注册的智能体和持久化的子代理；`history://<id>` 读取跨轮次的会话记录。
   - `proc://` 列出调用方可见的后台作业（包括没有作业记录行的运行中智能体）和项目服务；`proc://<id>` 返回状态及可用输出/日志，不会消耗异步结果交付。运行中子代理的记录行还会显示其最新请求、费用、上下文占用、完成预估和阶段，与 `wait` 中相同。服务日志文件可通过 `grep proc://<id>` 搜索。
   - `help://<tool>` 列出该工具的文档主题，每行一个 `help://<tool>/<topic>`；`help://<tool>/<topic>` 读取某个主题。此方案只读。
   - `ssh://host/<path>` 读取远程 UTF-8 文件或目录；裸 `ssh://` 列出已配置的主机。文件和目录列表响应限制为 1 MiB，并要求已验证的 POSIX 远程 shell。目录范围也可由搜索工具遍历，无需本地挂载。`ssh://host/~/path` 和 `ssh://host/~` 相对于已连接远程账户的 `HOME` 解析，绝不使用本地主目录；只有这种字面的 `/~/` 或 `/~` URI 写法会展开。`/%7E/` 仍为字面的绝对波浪号目录，`/~user` 不受支持，其他 shell 展开不会运行。路径中的字面 `:`、`?` 或 `#` 需使用百分号编码。
   - 启用 `compaction.experimentalContextManagement` 时，`history://current/full` 暴露调用方完整的当前分支。其中包括原始文本、工具输出、条目 ID 和上下文压缩边界。使用共享的行/原始选择器，例如 `history://current/full:raw:1-200`；查询、片段、额外路径和尾部斜杠会被拒绝。它要求匹配的活动会话所有者，绝不会回退到注册表或磁盘查找。裸 `history://current` 仍指向名为 `current` 的普通智能体。参见[实验性上下文窗口](../compaction.md#experimental-notes-backed-context-windows)。
- `#handleInternalUrl()` 的行为：
   - 使用 `parseInternalUrl()` 解析 URL，因此主机段中的冒号合法
   - 处理没有本地文件的 URL（虚拟、远程和设备方案，以及已定位但目标为目录或不存在的方案）
   - 不经分页返回独立值（`shape: "value"`，例如 `agent://` 路径提取）；否则在内存中对解析出的文本分页
   - 在此处拒绝 `:img`；它要求文件支持的 URL。如果文件支持的 URL 只是因为 locate 推迟到远程 resolve（MCP 可用时的未知 `skill://`）才到达此路径，则改为报告其本地未命中（`Unknown skill`）
   - 将 `immutable`（默认来自方案规范）传递给 `resolveFileDisplayMode()`，从而为技能、记忆和智能体输出等不可变资源抑制锚点
   - 对规范为 `unbounded` 的方案（`skill://`）设置 `ignoreResultLimits: true`，使全文仅由显式选择器分页，不受普通默认行数限制；资源可以覆盖它（`InternalResource.unbounded`），`skill://` 对 MCP 提供的技能文本就会这样做
- `conflict://` 块由 `<path>:conflicts` 选择器注册；`conflict://<N>` 读取某个已注册的标记块，`/ours`、`/theirs` 或 `/base` 选择一侧。普通的头部、尾部、逗号列表和 `:raw` 选择器作用于相对于该块或该侧的行（`conflict://1/theirs:1-3`、`conflict://1/theirs:raw:-20`）；显示的行号保留原文件坐标。`conflict://*` 只写。
- `issue://<N>` / `pr://<N>`（以及长形式 `issue://<owner>/<repo>/<N>` / `pr://<owner>/<repo>/<N>`）通过 `github` 工具写入的同一 SQLite 缓存路由；`?comments=0` 选择无评论渲染。裸 `issue://` / `pr://`（及限定仓库的变体）通过 `?state=`、`?limit=`、`?author=` 和 `?label=` 浏览实时列表。PR 差异使用 `pr://<N>/diff`、`/diff/<i>` 和 `/diff/all`。所有限定仓库的形式也接受 GitHub Enterprise 主机前缀（`pr://ghe.example.com/<owner>/<repo>/<N>`），不带点的主机（`pr://ghe/<owner>/<repo>/<N>`）在带编号的形式中也能被识别。短形式从会话检出目录解析主机，因此企业仓库无需前缀。
- `mr://` 列出当前项目的实时 GitLab 合并请求（其他项目使用 `mr://<host>/<group…>/<project>`），支持 `?state=`、`?limit=`、`?author=`、`?reviewer=`、`?label=` 和 `?source_branch=`。`mr://<iid>`（或 `mr://<host>/<group…>/<project>/<iid>`）返回缓存的 MR 概览，包含批准情况、头部流水线和讨论（`?comments=0`、`?unresolved=1`）。`mr://<iid>/diff`（及限定主机/项目的变体）通过 `glab` 列出已更改文件；`/diff/<i>` 返回一个文件，`/diff/all` 返回完整差异。记录行共享 `issue://`/`pr://` 的 SQLite 缓存。当设置了 `GITLAB_TOKEN` 风格的环境令牌时，只会联系 gitlab.com、`GITLAB_HOST`/`GITLAB_URI`/`GITLAB_URL`/`GL_HOST`、glab 配置中的主机或检出目录自身的 GitLab 主机。
- `memory://` 接受两种语法。`memory://root[/path]` 读取项目记忆根目录下由文件支持的记忆产物（`memory://root` 解析为精简的启动摘要 `memory_summary.md`；更深路径访问 `MEMORY.md` 和 `skills/<name>/SKILL.md` 等文件，`memory://root/...` 为 `glob` 支持 glob 模式）。`memory://<memory-id>` 按 id 查找活动的 Mnemopi 记忆记录行，可以是工作记忆或情景记忆，并在携带 `id`、`bank`、`store`、`memory_type`、`source`、`timestamp`/`created_at`、`importance`、`veracity`、`session_id` 和 `metadata` 的 YAML frontmatter 头部之后返回完整的存储内容（不是截断的召回预览）。id 语法针对调用会话解析：要求该会话使用 `memory.backend = mnemopi`，并且只搜索它自己限定范围的记忆库，因此另一活动会话持有的记录行无法访问；在 `hindsight` 下会返回纠正性指引（hindsight 记忆无法按地址访问），未知 id 则报错并指向 `recall` 以获取可用 id。这是 `memory_edit update` 对应的读取操作：覆盖截断的预览之前，应读取完整记录行。
- 溢出内容 `N`（截断的工具输出、整形或聚焦处理的原文、shake 占位符、最小化 bash 的原始输出、异步作业输出）是会话 `local://` 根目录下的普通文件 `<N>.log`，通过 `local://N.log` 读取；通常的选择器适用（`local://N.log:1-30`、`local://N.log:raw:1-3000`）。`local://` 定位底层文件，并通过文件系统流水线读取：任何大小都可流式读取，无界的 `:raw` 遵循下文已定位文件的原始读取上限。其他消费者在协议层进行整份资源解析时（`packages/coding-agent/src/internal-urls/local-protocol.ts` 中的 `LOCAL_TEXT_RESOURCE_MAX_BYTES`），上限为 1 MiB；更大的文件会返回提示，指向文件系统路径处理或行选择器。路径消费者（搜索/grep、bash URL 文件系统）使用 `locate`，可处理任何大小的文件。

### Web URL \{#web-urls}

- `parseReadUrlTarget()` 接受 `http://`、`https://` 或 `www.` 目标。
- 普通 URL 读取调用 `packages/coding-agent/src/tools/fetch.ts` 中的 `executeReadUrl()`。
- `:raw` 返回不带传输头部或空白规范化的响应正文；URL、Content-Type、Method 和说明保留在结构化详情中。普通 URL 读取优先使用已渲染/便于阅读的输出，并保留下文的传输头部。
- 当缓存输出可用时，`:N`、`:A-B`、`:A+C` 和逗号分隔的多范围不会重新获取。它们对前一次或当前 URL 渲染的缓存输出分页。
- `renderUrl()` 中的 URL 渲染流水线：
   1. 规范化方案（为裸 `www.` 添加 `https://`）
   2. 除原始模式外，原生读取器尝试对已知站点使用其站点处理器（`crates/web/src/sites/`）
   3. 使用 `loadPage()` 获取；当响应是机器人防护的质询页或拦截页时，它会指明该防护，并且绝不将其报告为 `ok`，因此通过 `loadPage()` 获取的替代内容会将其视为获取失败：在任何状态下，检测 Cloudflare 的 `cf-mitigated: challenge` 头部，或在不超过 64 KiB 的页面（中间页）上、位于注释和原始文本元素之外的 `js_challenge` `<input>`；在错误状态下还检测 `_cf_chl_opt`（Cloudflare）、`captcha-delivery.com`（DataDome）、`px-captcha`（PerimeterX）或“blocked by network security”。2xx 质询页不会被渲染：URL 只会交给远程读取器（Parallel、Firecrawl、Jina），跳过替代内容、内容协商、本地渲染器、`llms.txt` 和原始 HTML 回退；如果没有任何读取器返回超出 JavaScript 门禁页或简短拦截页的内容，读取就以 `method: "blocked"` 结束，并附带说明，指明防护及状态，并指向能运行质询脚本的 `browser` 工具。被防护阻挡的错误状态仍保持 `method: "failed"`，说明中会指明该防护
   4. 如果内容是图像/PDF/DOCX 等，尝试二进制获取和 markit/图像处理
   5. 直接处理 JSON，通过 feed 解析器处理订阅源，直接处理纯文本
   6. 对于 HTML 和非原始模式，依次尝试声明的 Markdown 替代内容、内容协商、订阅源替代内容、HTML 转文本渲染器、提取出的链接文档，然后是 `llms.txt`
   7. 回退到原始正文文本/HTML
- 原生 HTML 渲染器的 front matter 保留标题、canonical、base、`description`、`author` 和 `article:published_time`/`article:modified_time` 行。`pruneFrontMatter()` 将其他每个 `<meta>` 行折叠为一个 `meta_omitted` 行，列出标签名（最多 25 个，之后为 `+N more`），并指向 `:raw` 以获取其值；它仅在返回的副本上运行，位于读取器和回退检查完成对整个渲染结果的判断之后。
- 非原始的完整 URL 输出会包装一个小型头部；行选择器作用于正文行，而不是这些头部行。原始 URL 产物和搜索实体化使用相同的不带包装的正文坐标：

```text
URL: ...
Content-Type: ...
Method: ...
Notes: ...

---
```

- X URL（`x.com`、`twitter.com` 及其 `www.`/`mobile.` 主机）不会到达 `loadPage()`；X 会阻止抓取。原生读取器的 `twitter` 站点处理器（`crates/web/src/sites/twitter.rs`）对 URL 分类，并让 Grok 的 `x_search` 工具按 `crates/web/src/sites/x-read.md` 中固定的调用计划和输出格式读取：
   - 帖子（`/<handle>/status/<id>`、`/i/web/status/<id>`、尾部 `/photo/N` 等）→ `x_thread_fetch`：帖子、上级讨论串、引用帖子、回复、指标和媒体 URL；
   - 个人资料（`/<handle>`、`/with_replies`、`/media`）→ `x_user_search` 加上使用 `from:<handle>` 的 `x_keyword_search`（Latest，10 篇帖子），并将 `allowed_x_handles` 固定为该账号名；
   - 搜索（`/search?q=`；`f=live` → Latest、`f=media` → `filter:media`、`f=user` → `x_user_search`）和话题标签（`/hashtag/<tag>`）→ `x_keyword_search`。
   - 处理器使用 `x_search` 工具发出一次 xAI Responses 请求（`allowed_x_handles` 固定为个人资料的账号名），设置 `max_turns: 2` 和低推理强度；设置项 `x.model`（默认 `grok-4.5`）和 `x.baseUrl`（默认 `https://api.x.ai/v1`）连同 `x` 凭据选择模型和端点，因此该调用会按获取的每篇帖子和每份个人资料向 xAI 账户计费。回答是模型对工具输出的渲染，API 不暴露原始输出；`Notes:` 头部指明模型和获取次数，方法为 `x-search`。没有 `x` 凭据、访问应用路由及其他 X 页面（主页、探索、关注者、列表），或请求失败时，处理器会放弃处理，URL 转入普通页面获取，而 X 会阻止这种获取。
- `method` 记录最终采用的处理路径（`json`、`feed`、`text`、`alternate-markdown`、`content-negotiation`、`image`、`markit`、`llms.txt`、`raw`、`raw-html`、`blocked` 等）。
- 没有 Jina 密钥时，Jina 读取器（`r.jina.ai`）只在 `providers.webKeyless` 开启时运行；Parallel 和 Firecrawl 读取器始终要求各自凭据。
- 头部警告 `Target URL returned error` 的 Jina 渲染，或 `metadata.statusCode` 为 400 及以上的 Firecrawl 抓取，会像空结果一样被拒绝：读取器自己的获取拿到了目标的错误页或拦截页。最多 2 KB 且带有拦截页或 JavaScript 门禁措辞（“blocked by network security”、“verify you are human”、“are you a robot”、“access to this page has been denied”、“enable javascript”、“javascript required”）的 Parallel、Firecrawl 或 Jina 渲染，也会以同样方式跳过，让后续读取器仍能运行。
- 当获取的资源是受支持的图像且调整大小后仍可用时，URL 读取可能返回内联图像块。

## 副作用 \{#side-effects}

- 文件系统
   - 对不超过 4 MiB 的本地文件一次性缓冲；对更大的文本文件使用流式读取。SQLite 读取可能初始化 WAL 附属文件，但不允许 SQL 写入。
   - 在建立索引前将 tar/tgz 归档完整读入内存（上限为 256 MiB）；ZIP 归档通过对中央目录的范围读取建立索引。
   - 可能从会话的 `local://` 根目录读取 URL 缓存溢出文件（`<id>.log`）。
   - 在 URL 输出被截断或行范围分页需要持久化的缓存正文时，写入 URL 输出产物。
- 网络
   - URL 模式会执行 HTTP 获取、二进制重新获取和备用端点探测。
- 子进程 / 原生绑定
   - 对 `.db`/`.sqlite*` 使用 Bun SQLite。
   - 通过统一的 `@oh-my-pi/pi-utils/ar` 注册表读取归档；ZIP 的封装位于 `packages/utils/src/ar/zip.ts`，底层使用 `node:zlib` DEFLATE 编解码器。
   - URL 渲染会在获取之前尝试原生读取器的站点处理程序（`crates/web/src/sites/`），并且可以委托给 `packages/coding-agent/src/tools/fetch.ts` 中的 HTML 转文本后端。
   - 视频会调用 `ffmpeg`/`ffprobe`；PDF 页面截图使用无头 Chromium；可执行文件分析视图可能在当前反汇编器后端（IDA、Ghidra 或 Binary Ninja）中创建/打开数据库，并请求渲染后的视图。
- 会话状态
   - 在会话的原生 `EditStore` 中记录本地文本快照和已查看的行，用于后续恢复过期锚点。
   - 对内部 URL，将会话的 `cwd`、`settings` 和 `localProtocolOptions` 传入进程全局的 `InternalUrlRouter.instance().resolve()`。
   - 对缓存/截断的 URL 输出使用 `session.allocateOutputArtifact()`。
- 后台工作 / 取消
   - 不可中止的只有确定性的磁盘读取：普通文件的行/范围读取（`streamLinesFromFile`、多范围）和目录列表（`#readDirectory`）调用时传入 `undefined` 而非 `AbortSignal`，这样读取中途的中断就不会让本来瞬间即可完成的读取出现具有误导性的“Operation aborted”。其他所有分支都保留该信号，其辅助函数会调用 `throwIfAborted(signal)` 以便及时停止：URL/内部 URL 读取（网络）、归档、sqlite、文档转换、图像解码、结构摘要、冲突扫描以及后缀 glob 路径解析。

## 限制与上限 \{#limits--caps}

- 来自 `packages/coding-agent/src/tools/streaming-output.ts` 的共享文本截断默认值：
   - `DEFAULT_MAX_LINES = 3000`
   - `DEFAULT_MAX_BYTES = 50 * 1024`
- 本地文本开放式范围的默认行数限制：`read.defaultLimit`（默认为 `300`），限定在 `[1, DEFAULT_MAX_LINES]` 内。
- 单个有界非原始文本范围会在受限的一侧添加 `1` 行前置上下文和 `3` 行后置上下文。原始读取和多范围读取精确对应范围。
- 文件流式读取块大小：`8 * 1024` 字节（`READ_CHUNK_SIZE`）。
- 行读取的本地流式字节预算：`max(DEFAULT_MAX_BYTES, maxLinesToCollect * 512)`。带行号的读取对于被截至 `tools.outputMaxColumns` 的行，按截断后显示内容的 UTF-8 字节数计费，而不是按源大小；`:raw` 读取和上限为 `0` 时按源字节数计费。超过 4 MiB 缓冲上限后，长于 `3 * outputMaxColumns + 6` 字节的行（总会被截断）只保留显示所需的开头部分，无论页面预算还剩多少；此类窗口绝不会构建整个文件的 hashline 快照，也不会根据这些开头部分注册冲突块。如果多范围读取的预算导致某个范围提前停止，会追加 `[Range A-B stopped before line N at the … read budget. Use :N-B to continue]`。
- 结构摘要仅在文件大小 `<= 2 MiB` 且行数 `<= 20_000` 时运行。
- 性能分析摘要仅针对不超过 `32 MiB` 的已识别报告进行整文件读取时运行；行选择器和 `:raw` 会读取文件。
- 图像输入上限：`20 MiB`。
- 本地目录的目录树上限：深度 `2`，每个目录的子项数 `12`。
- 归档目录默认列表上限：`500` 项；归档成员上限为 `64 MiB`。整缓冲区归档读取上限为 `256 MiB`；普通 TAR 使用范围读取，大型 gzip/zstd TAR 使用有界解压遍历。
- SQLite：
   - 默认行查询限制 `20`
   - 模式样本限制 `5`
   - 最大查询限制 `500`
   - 原始 `?q=` 行数上限 `1000`（`MAX_RAW_QUERY_ROWS`）
   - 表列表上限 `500`
   - 渲染宽度 `120`，列宽 `40`
   - 忙等待超时 `3000` 毫秒
- 在 `executeReadUrl()` 中，向模型显示的 URL 读取结果会截断为 `300` 行和 `50 KiB`；完整缓存输出可作为产物附加。
- 内联显示的已获取 URL 图像：
   - 源字节上限 `20 MiB`
   - 调整大小后的内联输出上限 `300 KiB`
- 唯一后缀自动解析 glob 超时：`5000` 毫秒。
- 本地读取缓冲上限为 `4 MiB`（`SNAPSHOT_MAX_BYTES`）；更大的文件使用流式窗口，而不是整个文件的缓冲区。
- 对通过 URL 定位的文件（除 `skill://` 等 `unbounded` 方案之外的任何以文件为后端的方案），若无界 `:raw` 读取超过 `50 KiB`（`MAX_URL_RAW_INLINE_BYTES`），则会被拒绝，并提示有界范围（`<url>:raw:1-3000`、`<url>:1-3000`）以及后端文件路径。
- 不可变的 URL 定位文件（例如 `skill://`）的带行号页面超过 `50 KiB` 时，会追加相同的后端文件提示；可写方案（`local://`、`vault://`）从不附带该提示，因此回写不会将它持久化。对任何 `local://` 文件（包括溢出文件）的行分页读取都会获得完整页面预算，并跳过产物溢出（本地处理程序上的 `SchemeSpec.unspilledPages`），因为选择器会重新读取文件；其他所有 URL 读取则像普通文件一样，在超过 `tools.artifactSpillThreshold` 时溢出。

## 错误 \{#errors}

- 验证失败和操作失败会以 `ToolError` 呈现。
- 选择器错误包括：
   - `Line selector 0 is invalid; lines are 1-indexed. Use :1.`
   - 无效的 `A+B` / `A-B` 形式
   - 对 `agent://.../path:50` 报出 `Cannot combine query extraction with line selectors`
   - 对目录/归档目录列表使用多范围
- `conflict://*` 读取会被拒绝；未知/过期的冲突 ID 需要重新读取 `<path>:conflicts`。
- 本地/归档/sqlite 路径缺失时，首先尝试唯一后缀解析；如果既没有唯一匹配，也没有受保护的恢复方式，则报错。显式分号列表在按字面路径/归档/SQLite 优先级处理后展开，包括合并后的文件名过长的情况；每个成员保留各自的选择器和错误。单个过长文件名保留其文件系统错误。权限和 I/O 错误不会触发缺失路径恢复。
- 既不是常规文件也不是目录的目标（字符设备、块设备、FIFO、套接字）会抛出注明文件种类的 `ToolError`；SQLite 检测会跳过它们，而不探测其文件头。
- 越界行读取不会抛出异常。它们会返回说明文本，并给出诸如 `Use :1 ...` 或 `Use :<last line> ...` 的建议。
- 可能为二进制的本地文件会返回提示，除非请求了 `:raw`；可执行文件和反汇编器数据库则返回元数据（见[可执行文件与反汇编器数据库](#executables-and-disassembler-databases)）。
- 二进制归档条目会返回文本提示而不抛出异常，除非附加了 JSON 选择器（对目录、PDF 或二进制归档条目使用 JSON 选择器会抛出 `ToolError`）。
- 文档转换失败会返回文本提示。
- 图像超出大小限制、不受支持或无效时会抛出异常。
- SQLite 解析器会提前拒绝不受支持的参数组合；数据库/运行时错误会被捕获并以 `ToolError(message)` 重新抛出。
- HTTP 获取成功但 `response.ok === false` 时，URL 获取失败不会抛出异常；它会返回失败的 URL 读取结果，其中包含 `method: "failed"` 和说明性备注。
- 对 URL 定位文件进行大型无界原始读取时，会返回上述提示，而不是将文件加载到内存。

## 备注 \{#notes}

- 原始读取和不可变内部资源不显示 hashline 锚点，因为不存在可供后续 `edit` 使用的可编辑后端目标。
- `splitPathAndSel()` 有意将未知的尾随 `:...` 视为路径的一部分，因此 `archive.zip:inner/file` 和 `db.sqlite:table:key` 仍然有效。
- `resolveReadPath()` 包含 macOS 特定的文件名回退处理，用于截图时间戳、NFD Unicode 规范化以及弯单引号。
- 单独的 `/` 会解析为会话 cwd，而不是文件系统根目录。
- URL 缓存键以会话为作用域，并按请求 URL + 原始/渲染模式进行规范化；请求 URL 和最终重定向后的 URL 都会缓存。
- URL 行范围读取请求 `ensureArtifact: true, preferCached: true`，以便后续分页读取可从产物存储中重新打开同一份渲染正文。
- 原始 SQLite `q=` 执行除了“不允许绑定参数”之外，没有关键字限制；`PRAGMA query_only = ON` 会阻止数据库写入。
- 文件快照存储不是读取加速缓存。它用于在文件自读取后发生变化时，验证和恢复 hashline 编辑。
- 对同一路径从第三次相同的成功文本结果开始，每个会话的防循环提示会建议缩小选择器范围或继续编辑；输出变化时会重置跟踪。
- 如果一次读取与同一消息中较早的、可能写入的调用并行运行（仅以该调用的参数、不带上下文求得的审批类别不是 `read`，例如 `bash`），它会从智能体循环获取 `ctx.toolCall.earlierEffectsSettled`。`execute()` 会在读取前等待这些调用，因此返回它们处理后的文件；等待期间的中止会拒绝此次读取。单个 Web URL（不含 `;`）不会等待。
