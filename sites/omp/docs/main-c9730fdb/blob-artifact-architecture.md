---
title: "Blob 与产物存储架构"
description: "Oh My Pi 官方仓库文档：Blob 与产物存储架构。"
---

# Blob 与产物存储架构 \{#blob-and-artifact-storage-architecture}

本文介绍 coding-agent 如何在会话 JSONL 之外存储大型/二进制载荷，如何持久保存被截断的工具输出，以及内部 URL（`local://N.log` 溢出文件、`agent://`）如何解析回已存储数据。

## 为什么存在两套存储系统 \{#why-two-storage-systems-exist}

运行时针对不同数据形态使用两种持久化机制：

- **内容寻址 blob**（`blob:sha256:<hash>`）：全局存储，用于将持久保存会话条目中的图像 base64 载荷、保留的图像/帧归档、生成图像结果以及提供方图像 data URL 外置。
- **会话范围的产物**（位于 `<sessionFile-without-.jsonl>/` 下的文件）：每个会话的文本文件，用于存储子代理输出，以及在 `local/` 子目录（会话的 `local://` 根目录）中存储完整工具输出（溢出文件）。

两者有意分离：

- blob 存储针对去重和基于内容哈希的稳定引用进行优化，
- 产物存储针对仅追加的会话工具处理，以及人员/工具通过本地 ID 检索进行优化。

## 存储边界与磁盘布局 \{#storage-boundaries-and-on-disk-layout}

### Blob 存储边界（全局） \{#blob-store-boundary-global}

`SessionManager` 构造 `BlobStore(getBlobsDir())`，因此 blob 文件位于共享的全局 blob 目录，而不在会话文件夹中。

Blob 文件命名：

- 文件路径：`<blobsDir>/<sha256-hex>`
- 规范文件没有扩展名；提供有效扩展名（图像 MIME 类型）时，会在其旁边硬链接或复制一个带类型的附属文件 `<sha256-hex>.<ext>`，使操作系统打开程序能够检测类型
- 存储在条目中的引用字符串：`blob:sha256:<sha256-hex>`，其中哈希必须恰好为 64 个小写十六进制字符

这意味着：

- 跨会话的相同二进制内容会解析到相同哈希/路径，
- 写入在内容层面是幂等的，
- blob 可以比任何单个会话文件存续更久。

## 产物边界（会话本地） \{#artifact-boundary-session-local}

`ArtifactManager` 根据会话文件路径派生产物目录：

- 会话文件：`.../<timestamp>_<sessionId>.jsonl`
- 产物目录：`.../<timestamp>_<sessionId>/`（去除 `.jsonl`）

以下产物类型位于该目录：

- 溢出文件（被截断的工具输出、整形/聚焦处理的原文、shake 占位内容、最小化的 bash 原始输出、异步作业输出）：位于 `<session-dir>/local/` 中的 `<numericId>.log`，该目录是会话的 `local://` 根目录，读取形式为 `local://<numericId>.log`
- 子代理输出文件：`<outputId>.md`（用于 `agent://`），直接位于会话目录中
- 子代理会话 JSONL 附属文件：任务执行接收到产物目录时为 `<outputId>.jsonl`

溢出根目录为 `resolveLocalRoot()`：`<session-dir>/local`，但 Windows 路径达到 180 个或更多字符时会回退到 `$TMPDIR/omp-local/<sessionId>`。没有会话文件（`--no-session`）的会话会溢出到磁盘上的 `$TMPDIR/omp-local/<sessionId>`；不存在内存产物。

子代理采用父智能体的 `ArtifactManager`；父智能体与子代理树共享一个 `local://` 根目录和一个数字溢出 ID 空间。

## ID 与名称分配方案 \{#id-and-name-allocation-schemes}

### Blob ID：内容哈希 \{#blob-ids-content-hash}

`BlobStore.put()` / `putSync()` 对传入的字节计算 SHA-256，并返回：

- `hash`：十六进制摘要，
- `path`：`<blobsDir>/<hash>`，
- `displayPath`：提供扩展名时为 `<blobsDir>/<hash>.<ext>`，否则为规范路径，
- `ref`：`blob:sha256:<hash>`。

不使用会话本地计数器。

### 产物 ID：会话本地单调递增整数 \{#artifact-ids-session-local-monotonic-integer}

`ArtifactManager` 延迟创建 `local://` 根目录，在首次分配时扫描已有 `<N>.log` 文件，找到最大的数字 ID，并设置 `nextId = max + 1`。并发的首次分配共享同一个初始化 Promise，因此无法重新设定计数器并分发重复 ID。

分配行为：

- 文件格式：`{id}.log`（名称中没有工具类型；传给 `allocateOutputArtifact()` 的工具类型会被忽略）
- ID 是连续字符串（`"0"`、`"1"`、……）
- 每个 ID 的文件在内容写入前以排他方式（`wx`）占用，因此模型在 `local://` 根目录写入的 `7.log` 会被跳过，绝不会被覆盖；溢出根目录与智能体自身的 `local://` 写入共享
- 恢复不会覆盖已有溢出文件，因为扫描发生在分配之前

根目录缺失时，初始化会创建它，分配从 `0` 开始。

`ArtifactManager.save()` 使用 `writeArtifact()`：写入同级临时文件，验证字节数、文件大小和可读性，然后原子发布。失败会移除临时文件，并保留已有目标文件。

溢出文件是普通的 `local://` 文件：与该目录中的其他文件一样可写、可列出并支持补全。任何 `local://` 文件的按行分页读取都获得完整页面预算（`SchemeSpec.unspilledPages`）。

### 智能体输出 ID（`agent://`） \{#agent-output-ids-agent}

`AgentOutputManager` 根据请求的名称分配 ID，首次原样使用，仅在重复时添加后缀（`-2`、`-3`、……）。嵌套输出使用点分隔的父级前缀（例如 `Parent.Child`）。初始化会同时扫描 `.md` 输出和 `.jsonl` 子会话文件，避免恢复时覆盖其中任一种；顾问会话记录的主文件名和固定 HUD 切换哨兵名称会被保留。

## 持久化数据流 \{#persistence-dataflow}

### 1）会话条目持久化重写路径 \{#1-session-entry-persistence-rewrite-path}

在写入会话条目之前，无论是增量追加（`#appendToSessionFile`）还是全文件重写（`#rewriteSynchronously` / `#rewriteAtomically`），`SessionManager` 都会通过 `#lineFor()` 序列化它，该方法在截断流水线上运行 `prepareEntryForPersistence()`。

关键行为：

1. **大字符串截断**：超过 500,000 个字符的普通字符串会被截断，并加上 `"[Session persistence truncated large content]"` 后缀。已签名块、签名字段、已脱敏/加密推理、Anthropic 服务器工具历史以及 Anthropic 上下文压缩载体会原样保留，以便提供方有效重放。
2. **重复/临时字段剥离**：移除 `jsonlEvents`。已被原生提供方载荷涵盖的 OpenAI Responses 思考签名会从持久保存副本中省略，渲染输出已溢出到产物的 MCP `structuredContent` 也会省略。内存中的条目保持完整。
3. **将图像外置到 blob**：
   - `content` 中的图像块、`images[]` 中的图像载荷、snapcompact `frames[]` 以及 `image_generation_call.result` 在尚不是 blob 引用且 base64 长度至少达到阈值（`BLOB_EXTERNALIZE_THRESHOLD = 1024`）时会被外置，
   - 提供方风格的 `image_url` data URL 在以 `data:image/` 开头且包含 `;base64,` 时会被外置，
   - 图像块的 `data` 作为解码后的二进制字节存储，
   - 提供方 data URL 作为原始 UTF-8 data URL 字符串存储，
   - 持久保存的值替换为 `blob:sha256:<hash>`。

这样既保持会话 JSONL 紧凑，又保留可恢复性。

### 2）会话加载还原路径 \{#2-session-load-rehydration-path}

打开会话（`setSessionFile`）时，完成迁移后，`SessionManager` 会运行 `resolveBlobRefsInEntries()`。

对于带有 `blob:sha256:<hash>` 的持久保存图像块/图像载荷、生成图像结果以及提供方 `image_url` 字段：

- 从 blob 存储读取 blob 字节，
- 将图像块字节转换回 base64，
- 将提供方 `image_url` blob 转换回原始字符串，
- 修改内存中的条目字段，供运行时使用方使用。

Snapcompact 保留的帧在预先加载时仍保持为 blob 引用。上下文重建会检查存储的字节大小，仅解析帧预算内保留的帧；缺失帧会被丢弃，而不是以存储引用形式发送给提供方。

如果 blob 缺失：

- 图像块解析会记录警告，并在内存中保留原始 `blob:sha256:` 引用字符串，
- 提供方 `image_url` 解析会记录警告，并保留原始引用字符串，
- 加载继续进行。

### 3）工具输出溢出/截断路径 \{#3-tool-output-spilltruncation-path}

`OutputSink` 为 bash/python/ssh 及相关执行器提供流式输出支持。

行为：

1. 每个数据块都通过 `sanitizeWithOptionalSixelPassthrough(..., sanitizeText)` 清理，并追加到内存统计中。
2. 可选的实时 `onChunk` 接收尚未应用列数限制的已清理数据块，配置节流时会进行节流。
3. 每行列数限制或调用方提供的有界 `inline` 表示可以缩短面向 LLM 的缓冲区；产物镜像随后保留完整的已清理流。回车进度更新被规范化为行边界，拆开的 CRLF 会合并。
4. 当内存尾部缓冲区即将超过溢出阈值（`DEFAULT_MAX_BYTES`，50KB）时，接收器将输出标记为已截断，并在产物路径可用时开始产物镜像。
5. 如果打开文件接收器，它会先写入当前缓冲区，再写入所有已排队/后续的已清理数据块。
6. 内存缓冲区被裁剪为尾部窗口，或在配置保留头部时裁剪为头部 + 省略标记 + 尾部。
7. `dump()` 完成捕获，仅在未观察到产物 I/O 失败时返回 `artifactId`。`artifactError` 记录首个失败操作（`open`、`write`、`flush` 或 `end`），不持久保存原始文件系统错误文本。

实际效果：

- UI/工具返回显示有界输出，
- 以文件为后端的产物镜像成功时，完整的已清理输出（不超过产物上限）保存在溢出文件中，并以 `local://<id>.log` 引用。

产物 I/O 失败时，接收器停止进一步捕获尝试，保留已有的有界内联输出，并仍会关闭写入器。工具执行结果不变；其输出元数据和终端警告会说明完整输出未完全保存，不会将不完整产物宣称为完整恢复来源。`dump()` 和 `dispose()` 共享完成过程，避免并发收尾在异步写入或关闭失败确定之前发布成功。失败的捕获不会重试。接收器将产物文件限制为 `artifactMaxBytes`（默认为 16 MiB；工具执行器传入 `tools.artifactMaxBytes`，其中 `0` = 无界）：保留头部窗口（`artifactHeadBytes`，默认为 3 MiB，但最多为上限的一半）以及滚动尾部，两者以 `ARTIFACT TRUNCATED` 通知连接。上限导致字节被丢弃时，`dump()` 将其报告为 `artifactElidedBytes`，输出通知会将 `local://<id>.log` 标注为头尾样本，而不是完整输出。

捕获警告也会在后台作业交付、`wait` 恢复、不消费结果的 `read proc://<id>` 检查、取消以及会话记录重建后保留。捕获失败属于单个作业，而不是汇总报告。过大的恢复快照可以持久保存完整的带注释报告，包括正常作业的结果，并将其称为“完整报告”，而不是完整的原始命令日志。每个源捕获警告在面向模型的文本中出现一次，并在其自身的实时或重建终端行上出现一次。单个不完整捕获仍不会被再次溢出并宣称为完整原始输出。

会话记录重建还会从历史的每作业字段读取捕获错误。没有作业标识来源时，会保留历史汇总警告；如果某行已经携带相同失败，则不会重复。

## URL 访问模型 \{#url-access-model}

### `blob:` 引用 \{#blob-references}

`blob:sha256:<hash>` 是会话条目载荷内部的持久化引用，不是路由器处理的内部 URL scheme。`SessionManager` 在加载时解析它。格式错误的后缀会在任何路径拼接之前被 `parseBlobRef()` 拒绝，记录日志并保持不变，而不会从 blob 目录读取。

### `local://<id>.log`（溢出文件） \{#localidlog-spills}

溢出文件没有自己的 scheme：`local://<id>.log` 由普通的 `LocalProtocolHandler` 在会话的 `local://` 根目录上处理（参见 `src/internal-urls/local-root.ts`）：

- ID 是文件名的一部分，因此适用通常的 `local://` 规则（在 `local://` 列出、补全、`write`、`:1-30` 和 `:raw:1-3000` 等选择器）
- 解析固定在调用会话的根目录，不会跨已注册会话搜索
- `read` 以外的使用方进行完整资源解析时，上限为 1 MiB（`LOCAL_TEXT_RESOURCE_MAX_BYTES`）；更大的文件会返回通知，指向有界 `read` 选择器或文件系统路径处理方式

`locate` 对任何大小的文件都返回底层文件路径，不加载其字节；`read`、搜索和 bash URL 文件系统都经过它。嵌入式 shell 挂载 `local://` 根目录，涵盖溢出文件；不存在每个 ID 单独的挂载。

失败行为：

- 没有可用会话时：抛出 `No session - local:// unavailable`，
- 读取缺失溢出文件与读取任何缺失的 `local://` 文件相同：`Local file not found: local://<id>.log`。

旧会话的 `artifact://N` 链接不会迁移，也不再可解析。`omp stats` 仍能识别旧会话中记录的 `artifact://N` 读取。

### `agent://<id>` \{#agentid}

由 `AgentProtocolHandler` 在已注册的活动会话产物目录和 `<artifactsDir>/<id>.md` 上处理：

- `agent://<id>` 返回 markdown 文本；嵌套子代理输出使用点分隔 ID（`agent://Parent.Child` 读取 `Parent.Child.md`）
- 调用会话文件可用时，解析会刷新持久保存的智能体名册引用，并先搜索该根会话的产物目录，再搜索进程全局注册表目录
- IRC 可用时，`write agent://<id>` 会发送同级消息；`agent://all` 是供主智能体使用的只写广播（子代理调用会被拒绝），不是输出文件
- `write agent://<id>/model` 选择允许的任务智能体类型的配置模型，包括 `m1` 等用户标记类型。可添加可选的推理力度后缀（`task:high`）。`write agent://<id>/effort` 只更改当前模型的推理力度（`high`、`auto` 等）。两者都只作用于调用智能体或同一实例中其仍在运行的直接子智能体。它们报告已应用的选择，将不支持的推理力度限制为可用级别，并且不更改用户默认值。
- 读取时的斜杠路径表示 JSON 提取：`agent://<id>/<key>/<index>/…` 遍历对象键和数组索引（`agent://Parent.Child/reports/0/data`）
- 提取在 `<id>.json` 附属文件存在时读取它，否则解析 `<id>.md`；要求有效 JSON，并返回 `application/json`（字符串叶节点以 `text/markdown` 文本返回）
- 对于尚无 `<id>.md` 但已注册到智能体注册表（即 `write agent://<id>` 投递的注册表）的 ID，会解析为进度文档，而不是报错：包括智能体状态、迄今所有接受的 `yield` 载荷（含非终结部分），以及从实时会话或其保留的会话文件中读取的最新助手文本。`<id>.md` 一旦存在便优先。对此类 ID 进行 JSON 路径提取会抛出 `Output <id> is not published yet`

失败行为：

- 如果没有注册产物目录，且该 ID 不是已注册智能体：抛出 `No session - agent outputs unavailable`，
- 如果存在已注册目录，但磁盘上一个也不存在，且该 ID 不是已注册智能体：抛出 `No artifacts directory found`，
- 未知 ID 会抛出 `Not found: <id>`，后面最多跟五个相近 ID（`Did you mean: …`，对 `.md` 输出 ID 和已注册智能体进行模糊匹配），或在没有相近项时指向 `history://`。

read 工具集成：

- `read` 支持对非提取式内部 URL 读取使用行范围和原始选择器
- `agent://` JSON 路径提取不接受行选择器；提取直接返回，不分页

## 恢复、派生新会话与移动语义 \{#resume-fork-and-move-semantics}

### 恢复 \{#resume}

- `ArtifactManager` 在首次分配时扫描一次 `local://` 根目录中已有的 `{id}.log` 文件，并继续编号。
- `AgentOutputManager` 扫描已有的 `.md` 和子会话 `.jsonl` ID，并继续添加名称后缀。
- `SessionManager` 在加载时将 blob 引用还原为 base64/data URL。

### 派生新会话 \{#fork}

`SessionManager.fork()` 创建具有新会话 ID 和 `parentSession` 链接的新会话文件，然后返回新旧文件路径。产物复制由 `AgentSession.fork()` 处理：

- 先刷新当前会话，
- 尝试将旧产物目录（包括溢出文件）递归复制到新产物目录，
- 允许旧目录不存在，
- 非 ENOENT 复制错误会作为警告记录，派生仍会完成。

派生新会话后的 ID 影响：

- 如果复制成功，新 `ArtifactManager` 首次扫描时，新会话中的产物计数器会从已复制的最大 ID 之后继续，
- 如果复制失败/跳过，新会话产物 ID 从 `0` 开始。

派生新会话后的 blob 影响：

- blob 是全局且内容寻址的，因此不需要复制 blob 目录。

### 移动到新 cwd \{#move-to-new-cwd}

`SessionManager.moveTo()` 将会话文件和产物目录都重命名到新的默认会话目录，并在后续步骤失败时执行回滚逻辑。这在重新定位会话范围的同时保留产物身份。

目标产物目录已存在时，例如会话返回某个项目，而子进程一直在向该项目的旧产物路径写入时，会递归合并目录。名称已被占用的条目，或溢出 ID（`local/<id>.log`）已被占用的条目，会留在源位置；移动失败的条目也会滞留并记录日志。任一副本都不会被覆盖或重新编号。合并移动不会通过将目录重命名回原处来回滚；只有会话文件移动会这样回滚。跨设备迁移使用复制/删除回退方式。

## 失败处理与回退路径 \{#failure-handling-and-fallback-paths}

| 情况 | 行为 |
| --- | --- |
| 图像块还原期间 blob 文件缺失 | 警告并在内存中保留 `blob:sha256:` 引用字符串 |
| 提供方 `image_url` 还原期间 blob 文件缺失 | 警告并在内存中保留 `blob:sha256:` 引用字符串 |
| 通过 `BlobStore.get` 读取 blob 时发生 ENOENT | 返回 `null` |
| `local://` 根目录缺失（`ArtifactManager.listFiles`） | 返回空列表（分配可以从头开始） |
| `local://` 没有会话 | 抛出 `No session - local:// unavailable` |
| 没有已注册产物目录（`agent://`） | 抛出 `No session - agent outputs unavailable` |
| 已注册产物目录在磁盘上缺失 | 明确抛出 `No artifacts directory found` |
| 找不到溢出文件（`local://<id>.log`） | 抛出 `Local file not found` |
| 完整 `local://` 解析超过 1 MiB | 返回通知；基于 `locate` 的读取和搜索仍可用 |
| OutputSink 产物写入器初始化失败 | 仅使用有界内存输出继续运行 |
| 没有会话文件的会话（`saveArtifact`） | 溢出到磁盘上的 `$TMPDIR/omp-local/<sessionId>` |
| 移动目标处已存在产物目录 | 合并目录；名称或产物 ID 已被占用的条目留在源位置，并记录日志（警告） |

## 二进制 blob 外置与文本输出产物 \{#binary-blob-externalization-vs-text-output-artifacts}

- **Blob 外置**用于持久保存会话条目内容中的图像载荷和提供方图像 data URL；它将 JSONL 中的内联载荷字符串替换为稳定的内容引用。
- **产物**是用于执行输出和子代理输出的纯文本文件；溢出文件可通过会话本地 ID 以 `local://<id>.log` 寻址，子代理输出则通过 `agent://` 寻址。

这两套系统只有间接交集：都能减少会话 JSONL 膨胀，但身份、生命周期和检索路径各不相同。

## 实现文件 \{#implementation-files}

- [`src/session/blob-store.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/blob-store.ts)：blob 引用格式、哈希、put/get、外置/解析辅助函数。
- [`src/session/artifacts.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/artifacts.ts)：`local://` 根目录中的溢出存储，以及数字溢出 ID/路径分配。
- [`src/internal-urls/local-root.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/local-root.ts)：会话的 `local://` 根目录（以及其中的溢出文件）所在位置。
- [`packages/coding-agent/src/tools/streaming-output.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/streaming-output.ts)：`OutputSink` 截断/溢出到文件行为及摘要元数据。
- [`src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)：`BlobStore`/`ArtifactManager` 构造、持久化转换和 blob 还原调用点、会话派生/移动交互。
- [`src/session/session-persistence.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-persistence.ts)：`prepareEntryForPersistence()`：大字符串截断、临时字段剥离，以及同步图像 blob 外置。
- [`src/session/session-loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-loader.ts)：`resolveBlobRefsInEntries()`：加载时将 blob 引用还原为 base64 / data URL。
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)：交互式派生新会话期间的产物目录复制。
- [`src/internal-urls/local-protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/local-protocol.ts)：`local://` 解析器，同时提供溢出文件服务。
- [`src/internal-urls/agent-protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/agent-protocol.ts)：`agent://` 解析器 + JSON 提取。
- [`src/internal-urls/router.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/router.ts)：内部 URL 路由器连接。
- [`src/task/output-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/output-manager.ts)：`agent://` 的会话范围智能体输出 ID 分配。
- [`src/task/executor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/executor.ts)：子代理输出产物写入（`<id>.md`）和会话 JSONL 附属文件。
