---
title: "write"
description: "Oh My Pi 官方仓库文档：write。"
---

# write \{#write}

> 创建或覆盖文件、可写内部资源、归档条目、SQLite 行，或合并冲突解决内容。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/write.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/write.md`
- 关键协作组件：
   - `packages/utils/src/ar`（`@oh-my-pi/pi-utils/ar`）：归档选择器解析、成员加载和序列化；write 工具提供原子临时文件/重命名边界。
   - `packages/coding-agent/src/tools/sqlite-reader.ts`：检测 SQLite 路径并执行行插入/更新/删除。
   - `packages/coding-agent/src/tools/conflict-detect.ts` / `conflict-uri.ts`：注册/验证冲突区域，展开冲突侧令牌，并通过内部 URL 处理器解析写入。
   - `packages/coding-agent/src/internal-urls/router.ts`：内置内部资源及其写入语义。
   - `packages/coding-agent/src/lsp/writethrough.ts`：写入时格式化和诊断直写。
   - `packages/coding-agent/src/tools/auto-generated-guard.ts`：阻止覆盖生成文件。
   - `packages/coding-agent/src/tools/plan-mode-guard.ts`：解析路径并执行计划模式写入策略。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `path` | `string` | 是 | 目标路径。普通路径写入文件。可写内部 URL 委派给其处理器。`archive.ext:inner/path` 写入归档条目，支持 `.zip` 和 ZIP 格式别名（`.jar`、`.war`、`.ear`、`.apk`、…）、`.tar`、`.tar.gz`/`.tgz`、`.tar.zst`/`.tzst` 或 `.asar`。`db.sqlite:table` 插入行；`db.sqlite:table:key` 更新/删除行。`conflict://<id>` 解决已注册的冲突，`conflict://*` 执行批量解决。接受复制的 `[path#TAG]` 包装并将其移除。 |
| `content` | `string` | 是 | 完整的替换文件/归档/内部资源内容、冲突替换内容或 SQLite 行载荷。对于 `/kill` 会忽略。SQLite 非删除写入必须能解析为 JSON5 对象；空内容或纯空白内容会删除带键的行。 |

完整示例：

```text
path: "src/config.json"
content: "{\n  \"enabled\": true\n}\n"
```

```text
path: "fixtures/archive.zip:templates/email.txt"
content: "hello\n"
```

```text
path: "data/app.sqlite:users:42"
content: "{name: 'Ada', active: true}"
```

## 输出 \{#outputs}

一次性结果。

- 成功时始终返回至少一个文本块。
   - 普通文件写入：`Successfully wrote <bytes> bytes to <relative-path>`（最终格式化内容的 UTF-8 字节长度；ACP 桥接回执统计提交的内容）。
   - 内部 URL 写入：存在处理器提供的回执/状态文本时使用它；否则为 `Successfully wrote <bytes> bytes to <url>`。基于文件的 URL 写入（`local://`、`vault://`）也使用 URL，绝不使用底层路径。
   - 归档写入：`Successfully wrote <bytes> bytes to <relative-archive-path>:<entry-path>`（成员内容的 UTF-8 大小）。
   - SQLite 写入：`Inserted row into <table>`、`Updated row '<key>' in <table>`、`No row updated ...`、`Deleted row ...`、`No row deleted ...` 之一。
   - 冲突解决：冲突专用成功文本，适用时带有新的 hashline 快照头。批量解决可能在部分文件成功、其他文件失败后返回 `isError: true`。
- 执行期间，`onUpdate` 可能使用 UTF-8 字节长度发出 `Writing <bytes> bytes to <path>...`。
- 如果从 `read` 输出复制了 hashline 前缀并先将其剥离，第一个文本块会附带一条额外说明。
- 在 hashline 显示模式下，普通文件写入（包括 ACP 桥接写入）和冲突解决会在前面添加新的 `[<relative-path>#TAG]` 头（基于文件的 URL 写入则为 `[<url>#TAG]`）。快照不带已读行出处信息：锚定编辑仍需读取其锚定行。批量冲突解决会追加 `Snapshots:` 块，为每个成功写入的文件列出一个头。
- 启用 LSP 写入时诊断后，普通文件写入还可能返回 `details.diagnostics` 及 `details.meta.diagnostics`；带 shebang 的文件获得执行位时还会返回 `details.madeExecutable`。
- 普通/归档/单个冲突结果在底层为文件时设置 `details.resolvedPath`。SQLite 写入还会通过 `sourcePath(...)` 设置 `details.meta.source`。处理器拥有的 URL 写入保留处理器详情（例如 `details.proc`）；通用处理器回执使用空详情。

## 流程 \{#flow}

1. `WriteTool.execute()` 解包复制的 `[path#TAG]` 参数，并从内部 URL 剥离有效的读取选择器，使写入和读取指向同一资源。可写 URL 上格式错误的选择器/范围选择器会被拒绝。
2. 模式要求每个目标都提供 `content`，包括会忽略它的 `proc://<id>/kill`：否则严格模式提供方会将可选 `content` 声明为可为 null，而模型会发送 `null`。计划模式允许协调写入、回复和 `local://` 沙箱草稿；其他目标会在变更前被拒绝。文本载荷中的 hashline 显示前缀会被剥离，但消息、进程输入、设置和冲突指令会原样传到其处理器。
3. 验证类似 URI 的目标。未知协议会失败，而不是变成本地文件名；若要有意创建看起来像 URI 的 POSIX 文件名，请加上 `./` 前缀。
4. 如果 `path` 是内部 URL，且其处理器暴露了 `write`，工具会委派给它。`local://` 会继续走会话本地文件系统路径。
5. `conflict://...` 是这类由处理器拥有的写入之一，由 `ConflictProtocolHandler` 和 `tools/conflict-uri.ts` 实现。`conflict://<id>/ours` 之类的作用域读取为只读；可写冲突 URI 不带作用域。替换前会重新验证已注册的标记。
6. 调用 `#resolveArchiveWritePath()`。候选归档文件按最长优先检查；都不存在时，使用最短的候选归档路径创建新容器。
7. 归档写入调用 `enforcePlanModeWrite(..., { op: exists ? "update" : "create" })`，然后调用 `#writeArchiveEntry()`。
   - 递归创建父目录。
   - 通过 `readArchiveEntries()` 加载现有条目，在条目映射中替换目标，然后由 `writeArchive()` 序列化完整替换内容。
   - 拒绝向缺失且形似选择器的成员写入空内容。也拒绝用不完整的读取投影替换现有文本成员。
   - 将替换内容写入同级临时路径，再重命名覆盖目标。先解析现有归档符号链接，以便更新其目标而不是替换符号链接。
   - ZIP 格式别名仍保持 ZIP。`.tar.gz`/`.tgz` 选择 Tar gzip 压缩，`.tar.zst`/`.tzst` 选择 zstd；`.asar` 容器通过相同边界重写。拒绝只读格式（`.7z`、`.rar`、…）。
8. 如果不是归档，则尝试 SQLite 候选项。现有非 SQLite 文件会阻止按 SQLite 解释；既不是普通文件也不是目录的候选项（FIFO、设备、套接字）会在读取 SQLite 头之前被拒绝。
9. SQLite 写入调用 `enforcePlanModeWrite(..., { op: "update" })`，然后调用 `#writeSqliteRow()`。
   - 数据库必须已经存在。
   - 以 `{ create: false, strict: true }` 和 `PRAGMA busy_timeout = 3000` 打开 Bun SQLite。
   - 带行键的纯空白 `content` 会删除行。
   - 非空 `content` 使用 `Bun.JSON5.parse()` 解析，必须为对象，并路由到插入/更新辅助函数。
   - 连接在 `finally` 中关闭。
10.   否则，将 `path` 视为普通文件系统文件。

- 拒绝可高度确信为错误分发的读取目标：不存在且形似选择器的文件名配空内容，或不存在的、用分号连接的选择器路径列表。现有字面路径优先；对于单个有意使用的选择器形状文件名，可用非空内容绕过此限制。
- 计划模式策略和路径解析在变更前运行。既不是普通文件也不是目录的现有目标（包括通过符号链接指向的目标）会被拒绝；之后现有普通文件通过生成文件防护检查，该检查在主线程打开并读取文件头，遇到此类目标可能永远阻塞。
- 如果提交的内容以 OMP 读取截断通知结尾，且覆盖范围小于当前源内容，会拒绝覆盖；目标不存在时也会拒绝，因为新文件会成为不完整的副本。这也适用于处理器拥有的文本资源。
- 可用时先尝试 ACP 桥接的 `writeTextFile`；否则会话直写机制写入内容。LSP 设置可能对写入进行格式化、同步和诊断。
- 当写入后（格式化后）的内容以 `#!` 而非 `#![` 开头时，在这些字节落盘后添加执行位（`mode | 0o111`、`chmod a+x`），即在 ACP `writeTextFile` 之后，或在直写过程中、`textDocument/didSave` 和 LSP 诊断之前（诊断在结果中返回或延迟交付）。

11. 工具返回文本及可选的诊断、可执行或已解析路径元数据。

## 模式 / 变体 \{#modes--variants}

### 普通文件路径 \{#plain-file-path}

- 目标为任何既不解析为归档选择器，也不解析为已有或新建 SQLite 选择器的路径。
- 现有文件会被覆盖。
- `write.ts` 不会在此路径上调用 `fs.mkdir()`；显式创建父目录只存在于归档分支，但 `Bun.write()` 本身会为普通文件写入创建缺失的父目录。

示例：

```text
path: "tmp/output.txt"
content: "hello\n"
```

### 归档条目写入 \{#archive-entry-write}

- 选择器语法：`archive.ext:inner/path`。
- 支持的后缀：`.zip` 和 ZIP 格式别名（`.jar`、`.war`、`.ear`、`.apk` 及其他 zip 系列扩展名）、`.tar`、`.tar.gz`/`.tgz`、`.tar.zst`/`.tzst` 和 `.asar`。
- 内部路径规范化为 `/`，剥离空段和 `.` 段，拒绝 `..`，并拒绝以 `/` 结尾的目录目标。
- 替换一个条目后，通过临时文件和重命名重写整个归档。
- 需要时为归档文件创建父目录。

示例：

```text
path: "build/assets.tar.gz:css/app.css"
content: "body { color: black; }\n"
```

### SQLite 表插入 \{#sqlite-table-insert}

- 选择器语法：`db.sqlite:table`。
- `content` 必须能解析为 JSON5 对象。
- 允许空对象，会变为 `INSERT INTO <table> DEFAULT VALUES`。
- SQLite 写入拒绝查询参数。

示例：

```text
path: "data/app.db:users"
content: "{name: 'Ada', active: true}"
```

### SQLite 行更新 / 删除 \{#sqlite-row-update--delete}

- 选择器语法：`db.sqlite:table:key`。
- 非空 `content` 更新行。
- 空或纯空白 `content` 删除行。
- 存在单列主键时，行查找使用该主键，包括 `WITHOUT ROWID` 表。否则回退到 `rowid`。拒绝复合主键和无法使用 rowid 回退的情况。

更新示例：

```text
path: "data/app.sqlite:users:42"
content: "{email: 'ada@example.com'}"
```

删除示例：

```text
path: "data/app.sqlite:users:42"
content: ""
```

<a id="writable-internal-resources-and-tool-devices"></a>

### 可写内部资源 \{#writable-internal-resources}

- `agent://<id>` 携带非空 `content` 会向该对等智能体发送消息（交付回执文本）；`agent://all` 向可见的在线对等智能体广播；只有主智能体可以广播，子代理写入 `agent://all` 会失败，错误会提示改用直接消息。消息传递可用时，此写入按读取审批，且在计划模式下允许。`agent://` 读取仍然是输出产物。
- `agent://<id>?progress` 将消息标记为对该对等智能体所提请求的确认或进度说明：它既不回答也不提问，因此对等智能体的 `wait` 会继续阻塞以等待真正回复，即之后的任何普通消息。它不会唤醒中继轮次。拒绝 `agent://all?progress`。
- `proc://<id>` 将 `content` 发送到服务标准输入（除非已以换行结尾，否则追加 Enter）；空内容发送 Enter，绝不取消。`write({ path: "proc://<id>/kill", content: "" })` 取消作业或所拥有的子代理，或停止服务；忽略 `content`。`proc://<id>/mode` 要求 `content` 为 `persist` 或 `session` 以切换持久化，或为 `detached` 以在不使用 PTY 的情况下重启并在代理服务结束后继续持久运行。Proc 写入需要执行审批。计划模式阻止标准输入和 `/mode` 写入；允许 `/kill`。Proc 读取不消费作业交付。`/kill` 和 `/mode` 为只写。
- `out://` 将 `content`（Markdown，最多 64 KiB）作为回复展示给用户，但不结束轮次：会话记录将此调用绘制为随参数流式显示的助手正文，而非工具卡片，并在隐藏工具活动时保持可见。忽略 URL 路径，该协议为只写。此写入按读取审批，且在计划模式下允许。对子代理及关闭 `out.enabled` 的环境会拒绝此写入，默认情况下除交互式 TUI（终端或 Tern）外均关闭，因此除非显式设置 `out.enabled`，打印、RPC 和 ACP 会话既看不到也不接受它。只有开启它的会话才会获得对应的系统提示词条目。
- 带有 `write` 钩子的已注册内部处理器拥有其资源语义（例如 `cfg://`、`agent://`、`proc://`）。基于文件的协议（`local://`、`vault://`）没有钩子：路由器定位目标文件（`local://` 位于会话本地产物沙箱，`vault://` 位于 vault 根目录下），写入遵循普通文件路径流程。
- 拒绝未知的类似 URI 协议，以防止静默创建本地文件。只有确实要使用该文件名时，才使用 `./scheme://...`。
- 已注册的只读协议（没有写入策略：`skill://`、`history://`、…）会在审批门禁处被拒绝（`<scheme>:// URLs are read-only`），不会提示审批；`edit` 和 `ast_edit` 目标也以相同方式拒绝。写入、编辑或 bash URL 目标上的尾部行选择器（`local://notes.md:5`）会被拒绝，而不是被丢弃；只剥离 `:raw`/`:conflicts`。

### 合并冲突解决 \{#merge-conflict-resolution}

- 读取 `<file>:conflicts`（或显示标记的读取窗口）以注册在会话内稳定的 ID。`conflict://<N>` 只替换该记录的标记块，并针对文件重新验证。复制的相邻上下文若会重复块外的行，就会被裁去，并在回执中说明。
- 操作前，`conflict://<N>` 会将其文件中已注册的 ID 与当前标记块重新核对（`conflict://*` 会重新核对每个已注册文件）。未变化的块在线号偏移后保留其 ID；已变化或消失的块（合并中止、重置、外部解决、文件删除）会被注销，同一行出现的不同块会获得新 ID。检查以流式方式读取文件，内存受最大已注册块约束，因此也覆盖超出发现字节上限的块。`:conflicts` 读取会注销其文件的过期 ID，但超过扫描上限的部分除外。
- 与 `@ours`、`@theirs`、`@base` 或 `@both` 完全相等的行会展开为记录的对应侧内容（`@both` 先是 ours，再是 theirs）。`@base` 要求存在 diff3 基础版本。其他内容按字面处理。
- `conflict://*` 携带普通内容时，会对每个已注册冲突应用相同的替换/令牌展开。`1: @ours\n2: @theirs` 之类的按 ID 指令内容只解决列出的 ID；每个非空指令行必须使用一个侧令牌，且 ID 不可重复。
- 批量处理以文件为单位，要么全部成功，要么全部不应用，并自下而上执行。其他文件仍可成功；跨文件部分成功返回 `isError: true`，而全部失败会抛出异常。成功的 ID 失效，失败文件的 ID 保持注册以供重试。
- 标记仍存在时，冲突写入绕过 LSP 格式化/诊断；不同位置的相同块仍可分别寻址。
- `/ours`、`/theirs` 和 `/base` URI 作用域为只读。读取行选择器不改变写入指令语法。

## 副作用 \{#side-effects}

- 文件系统
   - 创建或覆盖普通文件。
   - 写入条目时，通过同级临时文件和重命名原子地重写整个归档文件。
   - 显式为归档文件创建父目录；普通文件后端也支持缺失的父目录。
   - 修改现有 SQLite 数据库；绝不创建新的 SQLite 数据库。
   - 对 `conflict://...` 写入，解决文件中的冲突标记。
   - 在文件系统支持 chmod 时，对最终内容以 `#!`（而非 `#![`）开头的普通文件写入添加执行位（`mode | 0o111`、`chmod a+x`），发生在收集 LSP 诊断之前。
- 子进程 / 原生绑定
   - 通过 `bun:sqlite` 使用 Bun SQLite 绑定。
   - 使用 `packages/utils/src/ar` 中的统一归档工具：tar 序列化，压缩 tar 的 gzip/zstd 封装，基于 `node:zlib` 的 ZIP DEFLATE 封装，以及 ASAR 编码器。
   - 可能通过 `packages/coding-agent/src/lsp/index.ts` 与配置的 LSP 服务器通信。
- 会话状态
   - 在修改目标前执行计划模式写入限制。
   - 更新普通文件和冲突解决的文件变更/快照状态；已解决的冲突 ID 会失效。
- 后台工作 / 取消
   - 在 `WriteTool` 中将工具标记为 `concurrency = "exclusive"`。
   - 写入主体由 `untilAborted` 包装；LSP 直写可在内联等待到期时延迟交付诊断，或在其 `5_000` 毫秒操作超时后安排延后获取，两种情况都发生在写入最终内容并应用任何 shebang `chmod a+x` 之后。

## 限制与上限 \{#limits--caps}

- 普通/内部文件内容除内存处理限制外，没有工具级字节上限。归档读取器默认的内存输入上限为 `256 MiB`，每个成员上限为 `64 MiB`。条目数量较大时，ZIP 输出会发出 ZIP64 记录，但成员大小以及中央目录/成员偏移仍低于 32 位哨兵值。
- 生成文件防护委派给 `crates/natives/src/edit.rs` 中的 `editAutoGeneratedMessage`，最多读取 `1024` 字节；`crates/edit/src/path_policy.rs` 最多检查 `40` 行头部。`edit.blockAutoGenerated` 控制该防护。
- SQLite 写入设置 `PRAGMA busy_timeout = 3000`。
- LSP 直写（`packages/coding-agent/src/lsp/writethrough.ts`）在 `runLspWritethrough()` 中使用 `5_000` 毫秒操作超时，并可能使用 `AbortSignal.timeout(25_000)` 安排延后诊断。
- Shebang 可执行处理取决于宿主文件系统对 chmod 的支持。

## 错误 \{#errors}

- 无效归档子路径会抛出 `ToolError`，消息例如：
   - `Archive write path must target a file inside the archive`
   - `Archive write path must target a file, not a directory`
   - `Archive path cannot contain '..'`
- SQLite 路径解析会对不支持的形式抛出异常：
   - `SQLite write paths do not support query parameters`
   - `SQLite write path must target a table`
   - `SQLite row writes require a non-empty row key`
- 缺失的 SQLite 数据库显示为 `SQLite database '<path>' not found`。
- SQLite 内容错误包括无效 JSON5、非对象载荷、未知列、非标量值、空更新对象、复合主键和不可用的 rowid 回退。读取风格的 `?where=` 选择器不能作为写入的变通方法。
- 现有普通文件看起来是生成文件时，可能被 `assertEditableFile()` 拒绝。
- 既不是普通文件也不是目录的现有普通文件目标和 SQLite 数据库候选项会被拒绝，消息为 `Cannot write '<path>': it is a <kind>, not a regular file or directory.`。在进程内打开或读取它们可能永远阻塞（没有写入方的 FIFO、终端）。
- 基于文件的 URL 写入如果目标为现有目录，会失败并显示 `<scheme>:// URL must resolve to a file: <url>`。
- 类似 URI 的未知目标会失败，而不是写入本地文件。
- 对不存在且形似选择器的目标和分号连接的选择器列表进行空写入，会因可能是读/写错误分发而被拒绝。
- 会丢弃未读源内容的不完整读取投影，或用其创建新文件，都会被拒绝；请重新读取省略范围并替换整个文件，或使用 `edit` 做部分修改。
- 冲突作用域写入为只读；无效/过期 ID、格式错误的批量指令、缺失的 `@base` 和过期标记位置会抛出 `ToolError`。
- 归档读/写失败和意外 SQLite 异常会包装为 `ToolError(error.message)`。
- 如果没有匹配的 LSP 服务器，或 LSP 格式化/诊断超时，文件写入仍会完成；可能省略诊断。

## 说明 \{#notes}

- 归档路径检测先于 SQLite 检测运行。匹配归档选择器的路径绝不会被视为 SQLite。
- 当后缀为 `.sqlite` / `.db` 的现有文件缺少 SQLite 魔数字节时，SQLite 检测会放弃；该路径回退到普通文件写入。
- 归档重写使用统一的 `readArchiveEntries()` / `writeArchive()` 边界以及临时文件重命名。字符串成员编码为 UTF-8。
- 对于现有归档符号链接，写入器从解析后目标的后缀推断格式，后缀未知时回退到未压缩 tar；选择器的后缀不会覆盖它。
- 提示词禁止两种常见反模式：对本应使用 `edit` 的常规编辑使用 `write`，以及未经明确要求创建 `*.md` / `README` 文件。它还禁止在未获要求时使用表情符号。
- 通用写入回执使用 `Buffer.byteLength(...)` 统计 UTF-8 字节；处理器拥有的回执自行定义内容/状态措辞。
- `stripWriteContent()` 只在会话的文件显示模式启用了 `hashLines` 时移除 hashline 前缀；否则原样写入内容。即便如此，它也只会在每一内容行都带有前缀，且除空白行、省略行或头部行之后外，每个编号都比上一行多一时才移除它们（即 `read` 和 `grep` 为行编号的方式）；会跳跃的编号，如十六进制转储地址或日志时间戳，保持原样，未带标记便跳过行的部分视图（编辑预览、`ast_grep` 匹配）也保持原样。无论哪种情况，复制的 `LINE:` 前缀后面的 `conflict://*` 按 ID 指令都会被识别。

- 该工具具有 `strict = true`、`loadMode = "essential"` 和独占并发。原生会话记录视图预览前 8 行内容。
