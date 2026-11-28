---
title: "glob"
description: "Oh My Pi 官方仓库文档：glob。"
---

# glob \{#glob}

> 通过 glob 查找文件系统路径；需要匹配内容而非路径时，请使用 `grep`。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/glob.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/glob.md`
- 主要协作模块：
   - `packages/coding-agent/src/tools/path-utils.ts`：规范化输入；拆分基路径与 glob（主机路径和内部 URL）。
   - `packages/coding-agent/src/internal-urls/url-filesystem.ts`：`InternalUrlFilesystem`，原生 glob 遍历所用的 URL 文件系统。
   - `packages/coding-agent/src/tools/list-limit.ts`：应用结果数量上限。
   - `packages/coding-agent/src/tools/streaming-output.ts`：按字节上限截断文本输出。
   - `packages/coding-agent/src/tools/tool-result.ts`：构建 `content` 和 `details.meta`。
   - `packages/coding-agent/src/tools/output-meta.ts`：限制 / 截断元数据。
   - `packages/coding-agent/src/tools/tool-errors.ts`：面向用户的错误和取消处理。
   - `packages/coding-agent/src/tools/index.ts`：注册内置本地实现。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `path` | `string` | 否 | glob、文件、目录、内部 URL 或内部 URL glob；主机路径可组成分号分隔的列表（`"src/**/*.ts; test/**/*.ts"`）。省略时默认为 `.`；显式空字符串会被拒绝。已注册的内置实现还会将 `/` 等仅含斜杠的输入视为会话 cwd。包含分隔符的已有路径按字面值保留；其他情况下，按分号拆分无需检查存在性，按逗号/空白拆分则会验证存在性。每个目标各自成为遍历根，多目标扫描并发运行。内部 URL 在其根下进行 glob 匹配（`local://*.md`、`omp://**/*.md`）；`ssh://` 路径会将调用提升到 `exec` 审批级别。 |
| `hidden` | `boolean` | 否 | 包含隐藏文件。默认为 `true`。 |
| `gitignore` | `boolean` | 否 | 本地原生 glob 匹配时遵循 `.gitignore`。默认为 `true`；设为 `false` 可包含被 gitignore 忽略的文件。 |
| `limit` | `number` | 否 | 返回路径的最大数量。默认为 `200`；有限正数输入先向下取整，再限制在 `1..200` 范围内。 |

`glob` 默认启用（`glob.enabled = true`），是基本工具。

## 输出 \{#outputs}

工具返回一个文本块和结构化的 `details`。

- 成功文本：匹配路径按多层级、折叠前缀的目录树分组（`formatGroupedPaths()`）：每层嵌套对应一个 `#`，单子目录链折叠为一个标题（`# a/b/c/`），文件不加修饰地列在所属最深层标题下；根级匹配不带标题。目录匹配项带有末尾 `/`。精确文件输入会以一行返回该文件路径。
- 已完成但为空的扫描：`No files found matching pattern`，后面可附缺失路径提示；标记为 `useless`。
- 超时扫描返回成功但被截断的部分结果。没有匹配时，只返回扫描未完成提示，不会声称不存在；该结果也标记为 `useless`。
- `limit > 200` 时，非空结果包含 `Requested limit <N> clamped to the max of 200`。达到硬上限时，不会给出无法使用的增大限制建议。
- 多路径部分缺失：在结果块后或空结果行后追加 `Skipped missing paths: ...`。
- `details` 可能包含：
   - `scopePath`：搜索根或合并根的显示形式；`cwd`：超链接基路径。
   - `fileCount`：应用结果限制后返回的路径数。
   - `files`：以数组形式返回的路径。
   - `truncated`：是否发生结果数量截断或字节截断。
   - `resultLimitReached`：是否达到结果限制。
   - `missingPaths`：多路径调用中跳过的缺失输入。
   - `truncation` / `meta.limits`：供渲染器使用的结构化截断和限制元数据。
- 流式输出：运行时提供 `onUpdate` 时，本地实现会在 glob 匹配期间发出以换行分隔的增量文本快照，节流间隔为 200 ms。最终输出会分组；流式快照不会分组。

## 流程 \{#flow}

1. `GlobTool.execute()` 将可选的 `path` 字符串规范化为多个根（省略时默认为 `.`）。除非注入自定义操作，否则 `expandDelimitedPathEntries(..., parseFindPattern)` 会保留包含分隔符的已有路径和内部 URL 输入。其他复合条目按分号拆分时不检查各部分；至少一部分能解析时按逗号拆分；每部分都能解析时按空白拆分。
2. 工具使用 `normalizePathLikeInput()`、`/\\/g -> "/"` 和 `router.normalize()`（单斜杠 URL 别名）规范化每个条目。已注册的工厂设置 `rootPathAlias: true`，将仅含斜杠的输入重新映射为 `.`。其他解析为 `/` 的根会被拒绝。规范化后为空的条目会以 `` `path` must contain non-empty globs or paths `` 失败。工具通过 `sessionResolveContext()`，以调用的审批级别构建一个 `InternalUrlFilesystem`（`read`，或与 `grep` 一样，在原始 `path` 指定 `ssh://` 时为 `exec`）。
3. 对于多路径本地调用，`partitionExistingPaths(..., parseFindPattern, urlFilesystem)`（`packages/coding-agent/src/tools/path-utils.ts`）通过 URL 文件系统查询每个基路径的状态。缺失条目会被跳过；全部缺失时，工具抛出 `Path not found: ...`。单个缺失路径仍会直接失败。
4. 多条目调用会执行 `resolveExplicitFindPatterns()`；它将每个条目解析为各自的 `(basePath, globPattern, hasGlob)` 目标，让每个路径作为独立根遍历（合并到共同祖先会扫描无关的同级路径）。单条目调用直接使用 `parseFindPattern()` 解析。
5. `parseFindPattern()` 确定 `(basePath, globPattern, hasGlob)`：
   - 没有 glob 字符（`*`、`?`、`[`、`{`）=> 使用隐式 `**/*` 搜索该路径。
   - glob 位于首段 => 从 `.` 搜索，并在模式尚未以 `**/` 开头时，为其添加 `**/` 前缀。
   - glob 位于路径后续部分 => 在第一个包含 glob 的路径段处拆分。
   - glob 以 `/`（或 Windows `\` 分隔符）结尾 => 从匹配器中移除末尾分隔符，将匹配限制为目录，包括目录符号链接；排除名称匹配的文件。
   - 内部 URL => 像后续路径段的 glob 一样，在其 `scheme://` 根下拆分（`local://*.md` → 基路径 `local://`、非递归的 `*.md`）；glob 尾部会进行百分号解码，但编码后的元字符仍按字面值处理，`router.isGlob()` 会将查询、片段和URL 的 authority 部分排除在 glob 之外。
6. `resolveSearchBase()` 将基路径转换为会话 cwd 下的绝对路径；内部 URL 保持为 URL。解析后仍为 `/` 时，会以 `Searching from root directory '/' is not allowed` 拒绝。直接构造且未启用 `rootPathAlias` 的 `GlobTool` 也会拒绝仅含斜杠的输入。
7. `limit` 默认为 `DEFAULT_LIMIT`（`200`），必须是有限正数，先向下取整，再限制到 `MAX_LIMIT`（`200`）。`hidden` 和 `gitignore` 均默认为 `true`。通过 `AbortSignal.timeout(...)` 建立 `5` 秒（`5000` ms）的内部超时。
8. 随后执行分支：
   - **自定义操作分支**：如果存在 `GlobToolOptions.operations.glob`，工具会使用 `operations.exists()` 检查存在性，在可用时通过 `operations.stat()` 对精确文件输入短路返回，然后调用 `operations.glob(globPattern, searchPath, options)`，传入完整的 `GlobOperationsOptions` 参数集合：`ignore`（`["**/node_modules/**", "**/.git/**"]`）、`limit`（限制后的 `effectiveLimit`）、`hidden` 和 `gitignore`（调用方解析后的标志），以及 `signal`（调用方信号与截止时间信号的组合）。每次自定义操作调用都会与该信号竞争，因此永不结束的后端会在截止时间到达时被放弃，而不是阻塞工具；截止时间触发时仍未响应的调用会报告为超时，绝不会报告为路径缺失。
   - **内置本地分支**：工具查询每个目标 `searchPath` 的状态（URL 目标通过 URL 文件系统查询）。精确文件输入立即返回。目录输入调用 `natives.glob()`，传入 `hidden`、`maxResults: effectiveLimit`、`sortByMtime: true`、`gitignore: useGitignore`、`recursive: false`（递归来自 `parseFindPattern()` 添加的 `**/` 前缀）、组合后的中止信号，以及 `filesystem: urlFilesystem.shellFilesystem()`，使 URL 根也可原生遍历；多目标调用会并发运行各自的 glob。
9. 在本地分支中，可选的 `onMatch` 回调会将每个匹配项转换为显示路径（主机路径相对于 cwd；URL 根下通过 `resolveSearchResultPath()` 得到路径段经过百分号编码的完整 URL），并发出经过节流的进度更新。
10.   原生 glob 返回后，JS 合并各目标结果，对重复显示路径去重，然后按 `mtime` 降序排列合并列表，再格式化路径。
11.   `buildResult()` 应用 `applyListLimit()`，再次将数组限制为 `effectiveLimit`，使用 `formatGroupedPaths()`（来自 `@oh-my-pi/pi-utils`）格式化路径，追加超时/限幅/缺失路径提示，然后以 `maxLines: Number.MAX_SAFE_INTEGER` 运行 `truncateHead()`。实际上，这会保留 50 KiB 字节上限，同时禁用默认的 3000 行上限。
12.   `toolResult()` 打包文本和 `details`，并为渲染器记录结果限制 / 截断元数据。

## 模式 / 变体 \{#modes--variants}

- **精确文件路径**：如果解析后的输入没有 glob，且解析后路径的状态表明它是文件，则输出该单个路径。
- **目录路径**：如果解析后的输入没有 glob，且状态表明它是目录，工具会使用隐式 `**/*` 搜索该目录。
- **单个 glob 路径**：由 `parseFindPattern()` 解析的单个输入。
- **多路径搜索**：多个输入由 `resolveExplicitFindPatterns()` 解析为各条目目标，每个目标并发地作为独立根遍历，之后合并。
- **存在缺失输入的部分多路径搜索**：本地多路径调用跳过缺失的基路径，并通过 `missingPaths` / `Skipped missing paths: ...` 显示它们。
- **内部 URL 输入**：原生 glob 通过 URL 文件系统遍历 URL：基于文件的协议（`skill://<name>` 遍历技能目录、`local://notes/*.md`、`memory://root/**/*.md`）重定向到对应的主机文件，虚拟协议列出其渲染条目（`omp://tools/*.md`），远程 `ssh://` 目录无需本地挂载即可公开结构化条目。结果为完整 URL。`ssh://` 需要 `exec` 审批，审批门会在任何处理器解析它之前提出审批请求；超过 1 MiB 的目录列表响应会被拒绝。
- **自定义委托搜索**：使用注入的 `GlobOperations`，而非本地文件系统加原生 glob。

## 副作用 \{#side-effects}

- 文件系统
   - 查询解析后的基路径状态，在本地多路径模式下还会预先查询每个候选基路径的状态。
   - 不写入文件。
- 子进程 / 原生绑定
   - 内置本地模式调用原生 `@oh-my-pi/pi-natives` glob 实现。
- 会话状态（会话记录、内存、作业、检查点、注册表）
   - 提供 `onUpdate` 时，发出结构化进度更新。
   - 向工具结果添加截断 / 限制元数据。
- 后台工作 / 取消
   - 两个分支均可通过调用方中止信号和内部超时取消。自定义分支还会在截止时间停止_等待_：忽略 `signal` 且永不结束的后端会被丢弃，而不是继续等待；其延迟到来的拒绝会被吸收，不会成为未处理的拒绝。

## 限制与上限 \{#limits--caps}

- 默认结果限制：`200`（`packages/coding-agent/src/tools/glob.ts` 中的 `DEFAULT_LIMIT`）。
- 最大结果限制：`200`（`MAX_LIMIT`）；更大的输入会被限制到此值。
- 扫描超时：固定为 `5000` ms，应用于内置本地分支和自定义操作分支。在自定义分支中，它限制等待时长，而非后端自身的工作时长：截止时间到达时仍未完成的调用会被放弃，已响应的根会保留，结果作为标记为 `timedOut` 的部分扫描返回。
- 输出字节上限：`50 * 1024` 字节（`packages/coding-agent/src/tools/streaming-output.ts` 中的 `DEFAULT_MAX_BYTES`）。
- `truncateHead()` 默认通用行数上限为 `3000`，但 `glob` 将 `maxLines` 覆盖为 `Number.MAX_SAFE_INTEGER`，因此实际输出截断上限取决于字节大小，而非行数。
- 流式更新节流：两次 `onUpdate` 发出之间间隔 `200` ms。
- 排序顺序：内置本地分支在目录分组前，按 `mtime` 从新到旧排列。工具会在 JS 中对合并后的原生结果重新排序。按修改时间排序仍需遍历搜索树；在巨大根目录上使用狭窄的文件名模式，并不能避免这一成本。

## 错误 \{#errors}

- `GlobTool.execute()` 面向用户的 `ToolError` 包括：
   - `` `path` must contain non-empty globs or paths ``
   - `Path not found: ...`
   - `Searching from root directory '/' is not allowed`
   - `Limit must be a positive number`
   - `Path is not a directory: ...`
   - 超时会返回部分匹配，并附扫描未完成提示，指引调用方选择更深的目录。零匹配时，会明确说明此次扫描 `NOT proof of absence`。这是成功但被截断的结果，不是抛出的错误。
   - 通过 URL 文件系统无法查询 URL 目标状态时，返回 `Cannot glob <url>: <reason>`：原因可能是处理器的诊断（缺失的 `local://` 文件；对 `skill://*/SKILL.md` 返回 `skill:// URL requires a skill name`），或审批级别拒绝（`ssh:// access needs exec approval; …`）。
- 调用方中止时，本地分支将 `AbortError` 转换为 `ToolAbortError`，自定义分支则以 `untilAborted()` 的 `AbortError`（而非 `ToolAbortError`）拒绝；后端的 `options.signal` 会被中止，不再运行后续后端调用。截止时间到期不属于调用方中止，会报告为超时，而非错误。
- 非 `ENOENT` 的状态查询失败及其他意外错误会被重新抛出。
- 空匹配不是错误；它们返回未找到文件的文本结果。

## 说明 \{#notes}

- 发现文件名 / 路径时使用 `glob`。选择条件是文件内容或正则匹配时使用 `grep`；`grep` 接受 `pattern` 并返回带定位信息的内容匹配，而 `glob` 仅返回匹配路径（`packages/coding-agent/src/prompts/tools/glob.md`、`packages/coding-agent/src/prompts/tools/grep.md`）。
- 不带路径的顶层 glob 会变为递归模式。`*.ts` 解析为基路径 `.` 加 glob `**/*.ts`；`src/*.ts` 仍以 `src` 为根，使用非递归的 `*.ts` 路径段；`src/**/*.ts` 保留显式递归。
- 以内部 URL 开头的输入会原样保留，不进行分隔符展开。多个 URL 作用域应分别调用，不要将它们拼接为一个分号字符串。
- 内置本地分支默认启用 `.gitignore`。使用 `gitignore: false` 可在原生遍历时禁用它。
- `hidden` 默认为 `true`；隐藏文件默认包含，需主动选择才会排除。
- 两个分支均容忍多路径中的缺失输入，但只有内置本地分支会显示 `missingPaths` / `Skipped missing paths: ...`。自定义操作分支仅在单输入调用中对缺失的 `searchPath` 直接失败；多输入调用中的缺失目标不会产生结果，也不会提示。
- 自定义 `GlobOperations.glob()` 钩子接收 `ignore`、`limit`、`hidden`、`gitignore` 和 `signal`（`GlobOperationsOptions`）。`hidden` 和 `gitignore` 传入时已解析为布尔值，因此委托实现可以直接应用调用方策略，而无需猜测默认值；`limit` 是限制后的有效上限。后端应遵循 `signal`，但工具并不依赖这一点：无响应的后端会在截止时间被放弃，并报告为超时的部分结果。
- 内置本地 glob 匹配不强制设置 `fileType: File`；它可以从原生 glob 返回文件和目录。目录路径是递归搜索作用域，而非直接返回精确目录。
- 显式 `skill://` 遍历会跟随目录链接，并使用遍历器的循环检测。插件技能限制在其插件包内；其他技能限制在其真实技能根目录内。链接的根及链接的后代路径保留 `skill://` 结果标识。普通主机目录树遍历仍不会进入目录链接。
- 在 ovnfs 检出目录下，原生 `glob()` 会请求为其提供服务的 ovnfs 守护进程，而不是遍历 NFS 挂载（`crates/xfs/src/ovnfs.rs`）：omp-xfs 从主机挂载表中发现 ovnfs 挂载，守护进程在进程内列出检出目录的覆盖层。跟随链接的遍历（`skill://`）仍使用原生方式，任何守护进程故障都会回退到原生遍历。
