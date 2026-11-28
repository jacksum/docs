---
title: "grep"
description: "Oh My Pi 官方仓库文档：grep。"
---

# grep \{#grep}

> 使用正则表达式在文件、目录、glob 和内部 URL 中搜索文件内容。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/grep.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/grep.md`
- 主要协作模块：
   - `packages/coding-agent/src/tools/match-line-format.ts`：面向模型的锚点格式化。
   - `packages/coding-agent/src/tools/path-utils.ts`：路径规范化、glob 拆分（主机路径和内部 URL）、结果路径拼接。
   - `packages/coding-agent/src/internal-urls/url-filesystem.ts`：`InternalUrlFilesystem`，原生 grep 遍历和读取所用的 URL 文件系统。
   - `packages/coding-agent/src/tools/file-recorder.ts`：分组输出的文件排序。
   - `packages/coding-agent/src/tools/grouped-file-output.ts`：按文件分组的文本布局。
   - `packages/coding-agent/src/tools/streaming-output.ts`：内联输出预算和最终字节截断。
   - `packages/coding-agent/src/edit/store.ts`：会话作用域的原生 `EditStore` 快照和已见行跟踪。
   - `packages/coding-agent/src/tools/settings.ts`：默认上下文行数。
   - `packages/natives/native/index.d.ts`：向 TS 公开的原生 `grep()` 类型。
   - `crates/natives/src/grep.rs`：原生正则表达式/文件搜索实现。
   - `docs/natives-text-search-pipeline.md`：原生搜索流水线概览。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `pattern` | `string` | 是 | 正则表达式模式。`grep.ts` 拒绝仅含空白的输入，但会原样保留模式。原生匹配器先尝试 Rust regex，再为环视/反向引用等特性尝试 PCRE2，最后对格式错误的花括号/圆括号进行针对性的字面值恢复。仅在模式包含实际换行符或双字符序列 `\\n` 时启用多行模式。 |
| `path` | `string` | 否 | 一个文件路径、目录路径、类 glob 路径、归档成员、可读外部 URL、内部 URL，或 `src/foo.ts:50-100` 这样的单文件行选择器；也可以是其中多项组成的分号分隔列表（`"src; tests"`）。省略或为空时默认为 `.`。空条目会被拒绝。分号分隔列表无条件拆分；意外用逗号或空白连接的条目仅在存在性验证后展开；包含分隔符的已有路径保持完整。内部 URL 可在其根下进行 glob 匹配（`local://*.md`、`omp://**/*.md`）。 |
| `case` | `boolean` | 否 | 区分大小写搜索。默认为 `true`。传递给原生 `ignoreCase`。 |
| `gitignore` | `boolean` | 否 | 目录扫描时遵循 `.gitignore`。默认为 `true`。 |
| `skip` | `number \| null` | 否 | 多文件结果的文件分页偏移。省略或为 `null` 表示 `0`；`grep.ts` 对有限数向下取整，并拒绝负数或非有限值。单文件搜索忽略此字段，因为它不按文件分页。 |

`grep` 默认启用（`grep.enabled = true`），属于可发现工具，而非基本工具。默认上下文可通过 `grep.contextBefore` 和 `grep.contextAfter` 配置。

## 输出 \{#outputs}

工具在 `content[0].text` 中返回一个文本块，另附结构化 `details`。

- 匹配行由 `formatMatchLine()` 格式化：匹配为 `*LINE:content`，上下文为 ` LINE:content`，在 hashline 模式下位于 `[PATH#TAG]` 标题下。
   - Hashline 模式：`[src/login.ts#1F2A]`、`*5:content`、` 9:content`。
   - 普通模式：`*5|content`、` 9|content`。
- 目录和多文件结果通过 `formatGroupedFiles()` 分组为多层级、折叠前缀的目录树：每层嵌套对应一个 `#`，目录标题以 `/` 结尾，可用可编辑 hashline 锚点时，文件标题带有 `#TAG` 后缀。
- `details` 可能包含：
   - `scopePath`：格式化后的搜索作用域。
   - `matchCount`、`fileCount`、`files`、`fileMatches`：返回页面的计数。
   - `fileLimitReached`：当前 20 文件页面之后还有更多匹配文件。
   - `perFileLimitReached`：高匹配量文件被裁剪到单文件匹配上限。
   - `linesTruncated`：一个或多个匹配行超过 `512` 字节 UTF-8 预算。首个匹配能容纳在行首区域时，原生输出保留行首加 `...`；否则保留以该匹配为中心的窗口，每个被切去的侧边加上 `...`（例如 `*1|...aaaadeadline [s120]bbbb... [col 12001]`）。被截断的匹配行以 `[col N]` 结尾，表示首个匹配开始位置的字符列号，从 1 起算。上下文行保留行首加 `...`。
   - `truncated`：是否达到任何文件/匹配/原生/行/输出限制；`truncation` 和 `meta.truncation` 描述 `truncateHead()` 的最终字节截断。
   - `displayContent`：仅供 TUI 渲染的文本，使用 `│` 边栏而非模型锚点。
   - `missingPaths`：因基路径不存在而跳过的多路径条目。
   - `binaryMatches`：目录或 glob 扫描中，内容虽匹配却被作为二进制文件跳过的文件路径，相对于 cwd。
- 无匹配结果文本为 `No matches found`（仅有被跳过的二进制文件匹配时为 `No matches in text files`；多行搜索将大文件限制为前 4MB 时为 `No matches in searched content`；`skip` 指向最后一页文件之后时为 `No more results (<total> files total; skip=<N> is past the end)`），后面可附跳过缺失路径、不可读归档、超大文件或二进制匹配提示。二进制匹配提示最多列出五个匹配的二进制文件。有匹配的结果会在结尾附加相同提示，且 `grepPresenter`（`packages/coding-agent/src/ui/tools/grep.tsx`）会在终端（`renderResult`）和原生 Tern（`describeResult`）视图中显示 `binary matches` 计数。

## 流程 \{#flow}

1. `GrepTool.execute()` 在 `packages/coding-agent/src/tools/grep.ts` 中验证并规范化输入：
   - 拒绝仅含空白的模式，同时原样保留模式；
   - 省略或为空的 `path` 默认为 `["."]`（工作区根目录）；
   - 将 `skip` 规范化为非负整数；
   - 使用 `expandDelimitedPathEntries()` 展开由分隔符连接的 `path` 条目，保留包含分隔符的已有路径，无条件拆分分号分隔列表，至少一部分能解析时接受逗号拆分，每部分都能解析时才接受空白拆分；
   - 从每个所得条目中剥离行范围选择器；
   - 从会话设置读取 `grep.contextBefore` 和 `grep.contextAfter`（默认分别为 `0` 和 `0`：仅匹配行）；
   - 仅在 `pattern` 包含 `\n` 或实际换行符时启用多行模式。
2. 在共享作用域解析期间，每个 `path` 根会再次通过 `normalizePathLikeInput()` 规范化；对于已经过分隔符展开规范化的条目，此操作不产生变化。
3. `bundle.zip:src/foo.ts` 等归档成员路径，会在原生 grep 前物化为临时 UTF-8 工作文件。二进制或非 UTF-8 归档成员会报告为已跳过/不可读。
4. 每次调用根据会话的 `sessionResolveContext()` 和调用获批的级别（`resolveToolTier()`，即对原始路径调用 `router.readTier()`），构建一个 `InternalUrlFilesystem`。内部 URL 保持为 URL（单斜杠别名由 `router.normalize()` 规范化）；工具从不对其进行本地定位或物化：
   - 内部 URL glob 像主机 glob 一样拆分（`parseSearchPath()`）：基路径保持为 URL，glob 尾部（百分号解码后；编码的元字符保持字面含义）匹配原始条目名。`router.isGlob()` 决定 URL 是否使用 glob，因此查询（`?key=…`，例如 `issue://?search=fix*`）、片段和URL authority 部分的方括号（IPv6 主机）都不会作为 glob 语法；
   - 可读外部 URL（`http(s)://`、缩减的 `http(s):/host`、不存在本地路径时的 `www.` 写法）会被获取并物化为不可变本地文件；`ftp`/`ws`/`wss` 和被拒绝的获取会以明确错误失败。
5. 对于多路径调用，`partitionExistingPaths()` 通过 URL 文件系统查询每个基路径的状态，仅跳过 ENOENT 条目。所有条目均缺失时，工具报错。
6. 路径解析分支：
   - 一个条目：`parseSearchPath()` 拆分 `basePath` 和可选 glob；
   - 多个条目：`resolveExplicitSearchPaths()`（通过 `resolveToolSearchScope()`）针对主机条目计算共同基目录、花括号联合 glob、精确文件列表或各条目目标列表；每个内部 URL 条目各自成为目标。当共同祖先本身不是请求的作用域，或普通文件条目原本会被降为目录遍历的 glob 联合时（`fanOutFileTargets`），目标会扇出。
7. 行范围选择器在路径/归档解析后验证。它们仅允许用于单个文件（主机文件、归档成员或内部 URL 文件）；glob（包括内部 URL glob）/目录的行范围选择器会报错。
8. `resolveToolSearchScope()` 通过 URL 文件系统查询解析后基路径的状态，以确定采用文件还是目录行为。失败的 URL 会携带其处理器的诊断（例如缺失的 `local://` 文件）；协议需要更高审批级别的 URL 会以文件系统的审批错误失败。
   文件选择器将匹配起始位置和上下文过滤到请求的行范围。`test:1-2` 等已有字面文件名优先于选择器解析。内部 URL 还接受 `:raw` / `:conflicts` 作为整资源搜索，并保留随附范围；主机路径仅接受行范围。
9. 它调用 `@oh-my-pi/pi-natives` 的原生 `grep()`，传入：
   - `pattern`、`ignoreCase`、`multiline`、`gitignore`；
   - `hidden: true`；
   - 设置中的 `contextBefore` / `contextAfter`；
   - `maxColumns: DEFAULT_MAX_COLUMN`（`512` 个 UTF-8 字节，包含 `...` 标记）；
   - 普通搜索使用 `maxCount: INTERNAL_TOTAL_CAP`（`2000`）；
   - `maxCountPerFile`：普通搜索为单文件匹配上限加一。行范围搜索会在过滤前增大两个原生获取上限，以免前面的范围外匹配耗尽范围内可见结果的预算；
   - `mode: content`；
   - 组合后的中止 `signal` 和 `timeoutMs: SEARCH_GREP_TIMEOUT_MS`（`30_000`）；
   - `filesystem`：URL 文件系统的 `shellFilesystem()`。URL 路径通过它进行原生解析：基于文件的协议（`local://`、`skill://`）重定向到对应主机文件，虚拟协议（`omp://`、`history://`）提供渲染后的只读文件和枚举目录。主机路径始终在原生代码内处理。
10.   原生执行位于 `crates/natives/src/grep.rs`：

- `build_matcher()` 清理不表示量词的花括号，并先尝试 Rust regex 引擎；
- Rust regex 不支持的模式（包括环视/反向引用）会使用 PCRE2 重试；
- 分组不平衡错误会将圆括号按字面值处理后重试；如果两个引擎仍拒绝该模式，则按字面值搜索原始模式。

11. Grep 分发因解析后的路径集合而异：

- 精确的显式文件或扇出的多目标：JS 循环遍历目标，自行合并 `grep()` 结果，并按绝对路径 + 行号对重叠目标去重；
- 单个文件/目录基路径：一次 `grep()` 调用处理原生扫描。

12. 原生结果路径相对于根，使用原始条目名；在 URL 根下，`resolveSearchResultPath()` 将它们重新拼接为路径段经过百分号编码的完整 URL（`local://notes/a%20b.md`）。归档工作文件路径会在渲染前映射回面向用户的选择器。
13. 随后 JS 整理输出：

- 将多文件输出限制为每页 20 个文件（`DEFAULT_FILE_LIMIT`），使用 `skip` 作为下一页文件偏移；
- 将多文件作用域的每文件匹配数限制为 10，单文件作用域限制为 50，并在字节上限之后放置的结尾行中指出哪些渲染文件被上限裁剪（`More than 10 matches in a.ts; grep keeps the first 10 per file when searching several. Search one file alone for up to 50.`；单文件使用 `More than 50 matches; …`，并附行范围提示）。只有原生 grep 因 `INTERNAL_TOTAL_CAP` 停止时，页面标签的总数才显示为 `N+`，而非触发单文件上限时；
- 轮流选取各文件的匹配，防止一个文件独占页面；
- 使用 `sanitizeText()`（`packages/utils/src/sanitize-text.ts`，剥离 ANSI 转义序列、NUL 和其他控制字符）清理输出的匹配行和上下文行，再通过 `formatMatchLine()` 为模型格式化行，通过 `formatCodeFrameLine()`（`packages/coding-agent/src/utils/render-utils.ts`）为 TUI 格式化行；
- 在 hashline 模式下，对每个符合条件的渲染文件调用 `getEditStore(session).recordSnapshotFile()`，生成 `#TAG` 锚点，再用 `recordSeenLinesFromBody()` 记录已输出行。归档条目、不可变外部物化文件和不可变 URL 协议会被跳过；可变的文件型 URL（`local://`）会针对其后备主机文件创建快照（`resultSnapshotPath()`）。文件太大或不可读而无法创建快照时，回退到普通行输出。

14. 最终文本经过 `truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER })`，因此有效上限是 `packages/coding-agent/src/tools/streaming-output.ts` 的默认字节上限，而非默认行数上限。
15. `toolResult()` 附加文本及限制/截断元数据。

## 模式 / 变体 \{#modes--variants}

1. **单个文件路径**
   - 原生 `grep()` 将单个文件作为文本搜索，包括含有 NUL 字节的缓冲文件、流式读取的超大文件，以及前 4 MiB 窗口内的多行搜索；显式指定的文件绝不会由 ovnfs 守护进程响应（见说明）。
   - 输出为匹配/上下文行的平面列表。
   - 可见上限是经过原生匹配和 JS 单文件限额后，前 `50` 个匹配。
2. **单个目录路径或单个类 glob 路径**
   - `parseSearchPath()` 可能将输入拆分为 `path` + `glob`。
   - 一次原生 `grep()` 使用 `gitignore` 和 `hidden:true` 扫描目录树。
   - 二进制检测会跳过前 64 KiB 含有 NUL 字节的文件，并在后续报告的匹配行或上下文行包含 NUL 时停止扫描该文件（保留之前的匹配）；被跳过但内容匹配的文件列在 `details.binaryMatches` 中。
   - 结果分为每页 20 个文件；使用限制消息显示的下一个文件偏移设置 `skip`。
   - JS 轮流选取所选文件的匹配。
3. **多个显式路径/glob**
   - `resolveExplicitSearchPaths()` 将它们合并为共同基路径，以及花括号联合 glob、显式文件列表，或在共同祖先本身不是请求作用域（或普通文件条目会被降为目录遍历）时，逐目标搜索。
   - 缺失条目会被跳过而不导致失败，除非全部缺失。
   - 以 `!` 开头的条目（除非它指定已有路径）是排除 glob，而非搜索根：`!*.test.ts` 排除任意深度的匹配文件，`!vendor` 排除任意位置的该文件夹，`!src/legacy`（或 `!./gen`）仅相对于 cwd 排除。与 `rg -g '!…'` 一样，排除项过滤每个指定路径下要遍历的内容，绝不排除指定路径本身（`src/app.test.ts;!*.test.ts` 仍搜索该文件）。仅有排除项时，搜索覆盖 `.`。`exclusionsForRoot()` 将它们重新定位到各原生搜索根，以 `exclude` 传入，并为相对于 cwd 的排除项加上前导 `/`，标记为根锚定；遍历器的 `WalkFilter::exclude` 跳过匹配文件，不遍历匹配文件夹，因此被排除文件绝不会计入匹配上限或 20 文件页面。`approvalCacheTargets` 会移除排除条目，因此它们不授予任何权限；对于含有排除项的列表，还将 cwd 纳入键，因为执行时可能搜索 cwd。
4. **归档成员路径**
   - 仅支持 UTF-8 文本条目。成员会提取到临时工作文件供原生 grep 使用，然后以 `archive.ext:member` 显示。
5. **内部 URL 路径**
   - 原生 grep 通过 URL 文件系统遍历和读取它们（`skill://<name>` 搜索技能目录；`omp://` 遍历所有嵌入式文档文件，因此可作为文档搜索根）。命中项使用完整 URL 命名。
   - URL glob 拆分为基 URL + glob（`local://notes/**/*.md`、`local://*.md`）。
   - 远程 `ssh://` 目录通过 URL 文件系统公开结构化条目，因此目录和 glob 作用域会搜索真实的远程文件内容，并保留 `ssh://` 标识。超过 1 MiB 的列表响应会被拒绝，而非静默截断；现有的每文件 1 MiB UTF-8 限制仍然适用。
   - 不可变协议的来源不显示可编辑 hashline 锚点；`local://` 命中保留锚点。

## 副作用 \{#side-effects}

- 文件系统
   - 查询解析后的搜索根和输入路径状态。
   - 通过原生 `grep()` 读取匹配文件。
   - 在会话的原生 `EditStore` 中记录符合条件的整文件快照及已输出的已见行，用于 hashline 锚点。
   - 将可搜索归档成员提取到临时 UTF-8 工作文件，并在 `finally` 中删除；外部网页内容可能通过读取缓存物化。
- 会话状态（会话记录、内存、作业、检查点、注册表）
   - 读取会话设置中的默认上下文。
   - 使用会话的 `sessionResolveContext()`，通过 `InternalUrlFilesystem` 解析内部 URL；`router.locate()` 仅为 hashline 快照，将可变 URL 命中映射到其主机文件。
   - 在工具的 `details.meta` 中填入截断/限制元数据。
- 后台工作 / 取消
   - JS 层由 `untilAborted(signal, ...)` 包装。
   - `grep.ts` 将中止 `signal` 和 `timeoutMs: SEARCH_GREP_TIMEOUT_MS`（`30_000`）传入原生 `grep()`，因此原生扫描可取消且有时间限制。

## 限制与上限 \{#limits--caps}

- 文件分页限制：`20` 个文件（`packages/coding-agent/src/tools/grep.ts` 中的 `DEFAULT_FILE_LIMIT`）。
- 单文件匹配上限：多文件作用域为 `10`（`MULTI_FILE_PER_FILE_MATCHES`），单文件作用域为 `50`（`SINGLE_FILE_MATCHES`）。
- 普通原生预选上限：每次调用 `2000` 个匹配（`INTERNAL_TOTAL_CAP`）。行范围过滤器会在 JS 过滤前增大获取上限。
- 行截断：每个输出行内容最多 `512` 个 UTF-8 字节，包含原生 `...` 标记，但不包含行前缀或 `[col N]` 后缀（`packages/coding-agent/src/tools/streaming-output.ts` 中的 `DEFAULT_MAX_COLUMN`）。原生 grep 围绕搜索器找到的首个匹配为截断行选取窗口（像 ripgrep 的打印器一样，从行首开始重新搜索缓冲区），并报告其 `column`；JS 报告 `linesTruncated`。
- 最终文本截断：`truncateHead()` 默认字节上限为 `50 * 1024` 字节（`packages/coding-agent/src/tools/streaming-output.ts` 中的 `DEFAULT_MAX_BYTES`）。`grep.ts` 将 `maxLines` 覆盖为 `Number.MAX_SAFE_INTEGER`，因此普通 grep 输出按字节限制，而非按行数限制。
- 默认上下文：`packages/coding-agent/src/tools/settings.ts` 中的 `grep.contextBefore = 0`、`grep.contextAfter = 0`。
- 分页：`skip` 是多文件作用域的文件分页偏移。仍有更多文件时，结果文本显示 `Use skip=<N> for the next page`。
- 原生目录扫描缓存：此工具在原生层禁用缓存，`GrepOptions` 没有 `cache` 字段；`crates/natives/src/grep.rs` 中的 `build_grep_walk_request` 硬编码为 `.cache(false)`。
- 原生 grep 实际耗时预算：每次调用 `30_000ms`（`packages/coding-agent/src/tools/grep.ts` 中的 `SEARCH_GREP_TIMEOUT_MS`）；达到预算会触发 `Grep timed out after 30s; ...`。
- 原生单文件搜索窗口：`4 * 1024 * 1024` 字节（`crates/natives/src/grep.rs` 中的 `MAX_FILE_BYTES`，在 `grep.ts` 中对应为 `NATIVE_GREP_MAX_FILE_BYTES`）。超大的主机文件和内部 URL 文件仅搜索其开头窗口；目录扫描会推迟搜索它们，直到搜索完正常大小的文件，并可能在满足匹配预算后省略这一轮。显式超大文件作用域会收到部分覆盖提示；无法读取开头内容的超大文件会计入跳过文件数量。

## 错误 \{#errors}

- 去除首尾空白后的 `pattern` 为空时，返回 `Pattern must not be empty`。
- `skip` 为负数或非有限值时，返回 `Skip must be a non-negative number`。
- 任何规范化后的 `path` 条目为空时，返回 `Search scope entries must be non-empty paths or globs`。
- 通过 URL 文件系统无法查询内部 URL（或 URL glob 的基路径）状态时，返回 `Cannot search <url>: <reason>`：原因可能是处理器的诊断（缺失的 `local://` 文件；对 `skill://*/SKILL.md` 返回 `skill:// URL requires a skill name`），或审批级别拒绝（`ssh:// access needs exec approval; …`）。
- 对既没有结构化条目也没有本地路径的目录资源，返回 `… lists only through the read tool`（来自原生 grep）。
- 对无法获取的外部 URL 协议（`ftp`/`ws`/`wss`）或被拒绝的获取，返回 ``Cannot search external URL: ... Use \`read\` to fetch web content, then search the returned text.``。
- 行范围选择器错误包括 `Line-range selector requires a single file, not a glob: ...`、`Line-range selector requires a single file: ... is a directory` 和 `Path not found for line-range selector: ...`。
- 所有归档选择器均不可读、为二进制或非 UTF-8 时，返回 `Cannot search archive member(s): ...`。
- 基于文件系统的解析后基路径缺失时，返回 `Path not found: ...`（多路径调用会追加提示 ``(\`path\` list entries must each exist relative to cwd)``）；每个多路径文件系统条目均缺失时，返回 `` Path not found: ...; list each target in the semicolon-delimited \`path\` ``（不可读归档成员也参与导致缺失时，附归档提示）。
- 原生搜索通常从 Rust regex 回退到 PCRE2，最后回退到字面值模式，而不是拒绝正则表达式语法；残留的原生正则错误显示为 `Invalid regex: ...`。
- 多文件原生扫描会在 `grep.rs` 内跳过各文件的打开/搜索失败；扫描继续处理其余文件。
- 原生 grep 达到 `SEARCH_GREP_TIMEOUT_MS` 时，返回 ``Grep timed out after 30s; narrow paths or pattern, or scope with `glob` first``。

## 说明 \{#notes}

- 每次搜索，无论主机路径还是内部 URL，都先使用 Rust regex，模式需要环视或反向引用等特性时使用 PCRE2。
- 原生 `build_matcher()` 自动转义无法成为有效量词的花括号。`a{2,4}` 等有效量词保留正则语法。
- 如果 Rust regex 和 PCRE2 都拒绝分组语法，原生编译会在转义未转义的圆括号后重试，最后将原始模式按字面值处理。
- 工具中的内部 URL 绝不会变为主机路径：原生 grep 通过 URL 文件系统解析它们，命中保留 URL 写法。
- 审批采用路由器对原始 `path` 文本的 `readTier`（子字符串扫描，因此分隔列表无法隐藏 `ssh://` 这样的执行级别协议）；URL 文件系统会拒绝读取级别超过当前级别的任何协议。
- `*.ts` 这样的裸 glob 匹配任意深度。`dir/*.ts` 仅匹配直接子项；递归需使用 `dir/**/*.ts`。包含 glob 字符的已有字面路径优先于主机路径 glob 解析。
- `hidden:true` 在 `grep.ts` 中硬编码；没有面向模型的标志用于排除点文件。
- `gitignore:false` 仅影响原生目录遍历。它不会禁用工具自身的路径规范化或显式文件处理。
- `path` 解析为多个精确文件时，每个目标在 JS 分组前都会获得独立的原生获取上限（通常为 `2000`；行范围过滤时增大）。
- hashline 模式的节标签是会话快照存储中的四位十六进制不透明快照标签；`grep` 尽可能记录整文件快照，并在标题下打印不带修饰的行号。
- 在 ovnfs 检出目录下，原生 `grep()` 会请求为其提供服务的 ovnfs 守护进程，而不是遍历 NFS 挂载（`crates/xfs/src/ovnfs.rs`）：omp-xfs 从主机挂载表中发现 ovnfs 挂载，并从挂载来源或 ovnfs 状态目录发现守护进程的管理套接字，守护进程在进程内搜索检出目录的覆盖层。不涉及 ovnfs 设置或二进制程序。显式指定的文件、`onMatches` 流式输出和 `type` 过滤器始终使用原生遍历器；任何守护进程故障（没有守护进程、协议版本不同、守护进程服务于另一挂载、错误响应）都会回退到原生遍历，取消搜索会关闭守护进程连接，从而取消其搜索。守护进程响应不带二进制匹配字段，因此由守护进程响应的目录搜索不会设置 `binaryMatches`。
