---
title: "Mnemopi 记忆后端"
description: "Oh My Pi 官方仓库文档：Mnemopi 记忆后端。"
---

# Mnemopi 记忆后端 \{#mnemopi-memory-backend}

omp 可以使用 `@oh-my-pi/pi-mnemopi` 作为本地长期记忆后端。

设置：

```yaml
memory:
   backend: mnemopi
```

示例：

```yaml
memory:
   backend: mnemopi
mnemopi:
   scoping: per-project-tagged
```

启用此后端后，编码智能体会：

1. 根据配置的记忆库作用域，打开一个或多个本地 Mnemopi SQLite 数据库。
2. 在会话的第一个模型轮次中，将相关记忆召回到 `<memories>` 块中；如果召回发生在 `agent_start` 监听器中，则刷新基础提示。
3. 在智能体轮次结束后，将已完成的对话轮次保留到保留库中，频率不超过 `mnemopi.retainEveryNTurns`。
4. 当上下文压缩向记忆后端请求 `preCompactionContext` 时，将召回的记忆作为额外的上下文压缩上下文加入。
5. 通过共享记忆后端接口使用常规的 `/memory view`、`/memory stats`、`/memory diagnose`、`/memory clear` 和 `/memory enqueue` 命令。

召回的记忆是背景上下文，不是指令。当它与当前用户消息和工具输出冲突时，以当前用户消息和工具输出为准。

## 智能体工具 \{#agent-tools}

选择 Mnemopi 后，以下工具可被发现：

- `recall`：搜索作用域内的记忆。结果为预览，并包含记忆 ID。
- `retain`：显式存储持久事实。
- `reflect`：综合召回的记忆生成答案。
- `memory_edit`：按 ID 对可编辑记忆执行 `update`、`forget` 或 `invalidate`。事实表中的行是只读的。

替换召回结果前，先用 `read memory://<memory-id>` 读取其完整内容和元数据；被截断的召回预览不能安全地用作更新载荷。当 `autolearn.enabled: true` 时，可选的 `learn` 工具也能将内容保留到 Mnemopi。

首次轮次的召回属于会话记录历史的一部分，以 `memory_recall` 条目存储在会话文件中。恢复、切换到该会话或从该会话派生新会话时，会原样发送此块，而不会再次召回，因此系统提示（以及基于它建立的提供方提示缓存）在不同进程间保持一致。如果某条已召回记忆此后被删除、失效、过期，或其召回预览发生变化（包括通过 `/memory clear` 或 `memory_edit` 发生的变化），下一次由提示发起的轮次会携带一条一次性的隐藏说明，列出变化内容；原始块不会被重写。上下文重置后、改用不同的记忆数据库时，以及在编辑了首条提示的分支上，会话会重新召回。即使记忆已从存储中删除，召回文本仍保留在会话文件中。

## 设置 \{#settings}

| 设置 | 默认值 | 描述 |
| --- | --- | --- |
| `memory.backend` | `off` | 设为 `mnemopi` 以启用此后端。 |
| `mnemopi.dbPath` | 智能体记忆目录 | 可选的 SQLite 数据库路径。开头的 `~` 表示主目录。 |
| `mnemopi.bank` | 未设置 | 传给 `Mnemopi` 的可选共享记忆库基名；编码智能体封装层根据 `mnemopi.scoping` 从此基名划分作用域。未设置 → 共享记忆库 `default`；按项目划分的模式会使用工作目录的基本名称，加上其绝对路径的稳定哈希来派生项目记忆库。 |
| `mnemopi.scoping` | `per-project` | 记忆可见性模式：`global` = 一个共享记忆库，`per-project` = 隔离的项目记忆，`per-project-tagged` = 项目本地写入加全局召回可见性。 |
| `mnemopi.autoRecall` | `true` | 在会话的第一个轮次召回记忆。 |
| `mnemopi.recallRelevance` | `off` | 向 `judge` 角色询问注入预算内呈现的每条记忆是否与任务相关，丢弃所有未获 `relevant` 回答的记忆（包括 `uncertain`）。`auto` 仅在使用原生后端时评判，`on` 则对任何模型评判（设备端评判模型可能在 10 秒内只能回答一部分）。检查失败时不注入任何内容。 |
| `mnemopi.autoRetain` | `true` | 自动保留已完成的轮次。 |
| `mnemopi.polyphonicRecall` | `false` | 将标准排名与向量、图、事实和时间通道按倒数排名融合，使情景图中关联的记忆（由 `mnemopi.proactiveLinking` 或整合建立关联）或通过整合提取的事实关联的记忆，即使没有关键词匹配也能浮现。设置了 `MNEMOPI_POLYPHONIC_RECALL` 时，以其为准。 |
| `mnemopi.enhancedRecall` | `false` | 按查询缓存召回结果，最长 5 分钟。缓存条目的键包含所有召回选项（数量上限、事实、通道、时间、记忆库），相似查询仅在选项完全相同时复用条目，对记忆库的任何写入都会清除缓存。设置了 `MNEMOPI_ENHANCED_RECALL` 时，以其为准。 |
| `mnemopi.proactiveLinking` | `false` | 在存储新记忆时，将其纳入情景图，并关联到相关实体/记忆；设置了 `MNEMOPI_PROACTIVE_LINKING` 时，以其为准。 |
| `mnemopi.retainEveryNTurns` | `4` | 两次自动保留写入之间的最少用户轮次数。 |
| `mnemopi.recallLimit` | `8` | 提示块中召回记忆的最大数量。 |
| `mnemopi.recallContextTurns` | `3` | 召回查询中包含的、以用户消息划界的先前轮次数。 |
| `mnemopi.recallMaxQueryChars` | `4000` | 组合后的召回查询的最大长度。 |
| `mnemopi.injectionTokenLimit` | `5000` | 记忆提示注入的近似 token 预算。 |
| `mnemopi.debug` | `false` | 为后端故障启用调试日志。 |
| `mnemopi.noEmbeddings` | `false` | 将 `noEmbeddings` 传给 `Mnemopi`，并强制仅使用 FTS 召回。 |
| `mnemopi.embeddingVariant` | `en` | 本地嵌入模型变体：`en` = `BAAI/bge-base-en-v1.5`（768 维），`multilingual` = `intfloat/multilingual-e5-large`（1024 维）。`mnemopi.embeddingModel`/`MNEMOPI_EMBEDDING_MODEL` 会覆盖它；更改后，会在下一次以可写方式启动时重建已存储的嵌入。 |
| `mnemopi.embeddingModel` | 变体默认值 | 显式指定的嵌入模型 ID；覆盖 `mnemopi.embeddingVariant`。优先级：此设置 > `MNEMOPI_EMBEDDING_MODEL` 环境变量 > 变体默认值；空白或 `null` 设置视为未设置。 |
| `mnemopi.embeddingApiUrl` | 环境变量/默认值 | 传给 `Mnemopi` 的 OpenAI 兼容嵌入端点。 |
| `mnemopi.embeddingApiKey` | 环境变量/默认值 | 传给 `Mnemopi` 的嵌入 API 密钥；环境变量名会解析为该变量的值。 |
| `mnemopi.embeddingQueryPrefix` | 未设置 | 对于指令微调的嵌入模型（Qwen3-Embedding、E5），在嵌入前添加到召回查询前面的文本。已存储记忆的嵌入方式保持不变。未设置时使用 `MNEMOPI_EMBEDDING_QUERY_PREFIX`。 |
| `mnemopi.embeddingInputType` | `false` | 在嵌入 API 请求中发送 `input_type`：召回查询为 `query`，已存储记忆为 `passage`。NVIDIA NIM 非对称嵌入模型（NeMo Retriever、`nv-embedqa-*`）会拒绝不带此字段的请求。 |
| `mnemopi.llmMode` | `smol` | `smol` 解析 `memory` 模型角色及其重试链；`remote` 使用下列设置；`none` 禁用 LLM 调用。 |
| `mnemopi.llmBaseUrl` | 环境变量/默认值 | 用于 `llmMode: remote` 的 OpenAI 兼容 LLM 端点。 |
| `mnemopi.llmApiKey` | 环境变量/默认值 | 用于 `llmMode: remote` 的 LLM API 密钥；环境变量名会解析为该变量的值。 |
| `mnemopi.llmModel` | 环境变量/默认值 | 用于 `llmMode: remote` 的 LLM 模型 ID。 |

嵌入模型更改后，记忆库会在打开时重建其已存储的嵌入。记忆库先用新模型为整个语料库生成嵌入，等每个批次都成功后才替换已存储的嵌入，因此缺少密钥、端点不可达或请求被拒绝都不会抹掉旧嵌入；下次打开时会再次尝试。每个嵌入 API 请求最多携带 `MNEMOPI_EMBEDDING_BATCH_SIZE` 段文本（默认 `64`）；如果提供方的上限更低，应设为提供方的上限，例如 DashScope 为 `10`。

嵌入 API 请求失败（密钥被拒绝、模型未知、缺少 `input_type`、超时）时，会显示包含提供方响应的会话警告，每种端点、模型和状态组合显示一次；打印模式将其写入 stderr。在请求成功之前，召回仍会仅依靠关键词继续工作。

## 作用域 \{#scoping}

编码智能体封装层在底层 `Mnemopi` 包之上应用作用域：

- `global` 使用一个共享记忆库进行召回和写入。
- `per-project` 写入和召回的记忆库完全由当前工作目录派生：使用其基本名称，加上其绝对路径的稳定哈希，与周围的 git 布局无关。
- `per-project-tagged` 写入项目本地记忆库，并从项目本地记忆库和共享全局记忆库中召回，合并重复的召回结果。

在 `global` 和 `per-project-tagged` 下，`retain` 和 `learn` 工具也接受 `scope: "global"`，将条目或经验写入共享记忆库，让每个项目都能召回。在 `per-project` 下不提供此选项，因为不存在每个项目都会召回的记忆库。

非全局模式还会从旧版同级记忆库中召回，前提是其工作记忆行的 `metadata.cwd` 全部包含当前绝对 cwd；包含混合 cwd、为空、损坏或不可读的记忆库会被排除。启动时最多探查 64 个额外记忆库目录。新写入仍使用当前项目记忆库。

项目与全局相结合的行为位于封装层中。`@oh-my-pi/pi-mnemopi` 包本身仍直接暴露记忆库和构造函数选项，包括用于选择记忆库名称的 `bank`。共享记忆库以外的项目本地记忆库，作为同级记忆库数据库存储，由 Mnemopi 的 `BankManager` 管理。

## 召回预览与完整行读取 \{#recall-previews-and-full-row-reads}

召回结果携带的是被截断的内容预览，而非完整行。超过预览上限的内容会被截断，并在末尾附加 `…`；结果还会设置 `truncated: true` 和 `full_length`（原始字符数），让调用方无需解析标记即可检测截断。上限为 `RecallOptions.contentPreviewChars`（默认 `500`；`0` 禁用截断）。

始终可以通过读取 `memory://<memory-id>` 获取完整行，它会解析当前的工作记忆行或情景记忆行，并在一个简短的 YAML frontmatter 头部（`id`、`bank`、`store`、`memory_type`、时间戳、`importance`、`veracity`、`session_id`、`metadata`）之后返回完整内容。编码智能体面向模型的提示要求在任何 `memory_edit update` 之前执行此读取，因为 `update` 会整体替换内容，否则会丢弃被截断预览中未见的尾部。

保留操作会写入不带标记的会话记录投影：当宿主在存储的会话记录之外还提供 `embedText` 覆盖值时，该投影会用于嵌入、工作记忆 FTS 索引（`COALESCE(embed_text, content)`）以及重建时重新嵌入，因此存储会话记录中的保留协议标记不会污染向量和全文召回。

## 召回排名权重 \{#recall-ranking-weights}

召回会将每条记忆的分数乘以其已存储 `veracity` 标签对应的权重；对于情景记忆，还会乘以其退化层级对应的权重。每次召回都会从相应环境变量读取各项权重：

| 变量 | 默认值 | 适用对象 |
| --- | --- | --- |
| `MNEMOPI_STATED_WEIGHT` | `1.0` | `veracity: stated`，由编码智能体的显式记忆保存操作（扩展 `memory.save` API）写入 |
| `MNEMOPI_UNKNOWN_WEIGHT` | `0.8` | `veracity: unknown`，由编码智能体的自动会话记录保留操作，以及任何未指定标签的写入操作写入 |
| `MNEMOPI_INFERRED_WEIGHT` | `0.7` | `veracity: inferred` |
| `MNEMOPI_IMPORTED_WEIGHT` | `0.6` | `veracity: imported` |
| `MNEMOPI_TOOL_WEIGHT` | `0.5` | `veracity: tool`，由编码智能体的 `retain` 和 `learn` 工具写入 |
| `MNEMOPI_TIER1_WEIGHT` | `1.0` | 退化层级为 1 的情景记忆 |
| `MNEMOPI_TIER2_WEIGHT` | `0.85` | 退化层级为 2 的情景记忆 |
| `MNEMOPI_TIER3_WEIGHT` | `0.7` | 退化层级为 3 或更高的情景记忆 |

休眠整合会将工作记忆的标签带到其生成的情景记忆上。

标签为 `true` 或 `likely_true` 的记忆权重始终为 `1.0`，`false` 的权重为 `0`。使用 `mnemopi.polyphonicRecall` 时，这些权重用于排列标准排名，标准排名随后成为融合后的 `hybrid` 通道；向量、图、事实和时间通道不应用这些权重。

## LLM 与嵌入 \{#llm-and-embeddings}

FTS 和嵌入路径使用下列设置。`llmMode: smol` 解析 `memory` 角色及其配置的重试链，在调用时获取凭据。未设置时，此角色复用 `tiny`，然后使用快速（`smol`）默认值。它支持本地推理模型和在线模型。`llmMode: remote` 使用 OpenAI 兼容端点设置；`llmMode: none` 禁用 LLM 调用。如果解析不到可用模型或凭据，Mnemopi 会继续运行，但不执行依赖 LLM 的工作。旧版 `providers.memoryModel` 设置会迁移到 `memory` 角色。

仅使用 FTS：

```yaml
memory:
   backend: mnemopi
mnemopi:
   noEmbeddings: true
```

等效的构造函数形式：

```ts
new Mnemopi({ noEmbeddings: true });
```

远程嵌入：

```yaml
mnemopi:
   embeddingModel: text-embedding-3-small
   embeddingApiUrl: https://api.openai.com/v1
   embeddingApiKey: ${OPENAI_API_KEY}
```

等效的构造函数形式：

```ts
new Mnemopi({
	embeddingModel: "text-embedding-3-small",
	embeddingApiUrl: "https://api.openai.com/v1",
	embeddingApiKey,
});
```

非对称嵌入模型对搜索查询和其应找到的文本采用不同的嵌入方式。指令微调模型使用查询前缀；NVIDIA NIM 检索器使用 `input_type`：

```yaml
mnemopi:
   embeddingModel: Qwen/Qwen3-Embedding-8B
   embeddingApiUrl: https://your-endpoint/v1
   embeddingQueryPrefix: "Instruct: Given a question, retrieve stored memories that answer it\nQuery: "
```

```yaml
mnemopi:
   embeddingModel: nvidia/nv-embedqa-e5-v5
   embeddingApiUrl: https://integrate.api.nvidia.com/v1
   embeddingInputType: true
```

`embeddingQueryPrefix` 仅更改召回查询。切换 `embeddingInputType` 不会重新嵌入已存储的记忆；要求此字段的 NIM 检索器在没有此字段时从未存储过向量。

远程 LLM：

```yaml
mnemopi:
   llmMode: remote
   llmBaseUrl: https://api.openai.com/v1
   llmApiKey: ${OPENAI_API_KEY}
   llmModel: gpt-4.1-mini
```

等效的构造函数形式：

```ts
new Mnemopi({ llm: { baseUrl, apiKey, model } });
new Mnemopi({ llmBaseUrl: baseUrl, llmApiKey: apiKey, llmModel: model });
```

用于轮换 OAuth 令牌的动态函数 LLM：

```ts
new Mnemopi({
	llm: async (prompt, opts) => {
		const token = await getFreshOauthToken();
		return await completeWithPiAi(prompt, {
			token,
			maxTokens: opts?.maxTokens,
			temperature: opts?.temperature,
		});
	},
});
```

托管的记忆角色 LLM：

```yaml
mnemopi:
   llmMode: smol
```

编码智能体解析 `memory` 角色并传入动态补全函数，使每次 Mnemopi LLM 调用都能在调用时获取当前提供方凭据，并尝试该角色的回退候选项：

```ts
new Mnemopi({
	llm: async (prompt, opts) => completeMemoryRoleWithCurrentAuth(prompt, opts),
});
```

## 运维说明 \{#operational-notes}

- 默认共享数据库位于智能体记忆目录下的 `mnemopi/mnemopi.db`；项目作用域的记忆库使用该 Mnemopi 目录下的同级数据库路径。
- `/memory clear` 会删除当前配置作用域内的所有 Mnemopi SQLite 数据库及其附属 WAL/SHM 文件。
- `/memory enqueue` 会强制保留当前会话，刷新待处理的事实提取，并为符合条件的工作记忆行运行 Mnemopi 休眠/整合。
- Mnemopi 后端处于活动状态时，`/memory stats` 和 `/memory diagnose` 会呈现后端专属的记忆库统计/诊断信息。
- 子代理不拥有独立的 Mnemopi 保留循环；存在父级 Mnemopi 状态时，它们会引用父级状态，否则保持不活动。
- 主后端启动时，会先在其拥有的各记忆库间提升符合条件的工作记忆行，然后才允许首次写入按 TTL 修剪这些行。提升失败会记录日志，但不会禁用后端。
- 后端启动采用尽力而为的方式。如果数据库/模型初始化失败，会话仍会继续，Mnemopi 保持不活动，并记录警告；此时记忆工具会报告后端尚未初始化。
- 本地嵌入模型每台机器加载一次，而非每个会话加载一次：每个（模型、fastembed 缓存目录）组合由一个分离运行的 `omp mnemopi embed <model>` 服务器提供服务，该服务器拥有位于 `~/.omp/run/mnemopi/` 下的 IPC 端点（日志位于旁边）。第一个需要它的 omp 进程会启动它，其他进程则连接到它。推理在服务器私有的 `onnxruntime` 子进程中运行。服务器连续 15 分钟未收到请求后会退出，释放模型占用的内存；当另一个版本的 omp 进程连接时，服务器会被替换。稳态下的嵌入耗时超过 2 分钟时会失败，服务器会终止并重新启动其推理子进程。

## 关闭与持久性 \{#shutdown-and-durability}

正常的交互式退出和打印模式退出，采用有意设计得比 `/memory enqueue` 更轻量的路径：

1. 主状态保留当前会话记录，但禁用新的事实提取。
2. 它会刷新已在进行中的提取，但不运行单会话休眠或完整的跨会话提升。
3. 等待上述排空过程结束后，它才会关闭其拥有的 SQLite 记忆库句柄；由于排空过程仍可能生成嵌入，进程会在状态释放后才断开与嵌入服务器的连接。服务器会继续为其他会话运行（并完成已在进行中的模型下载），直到空闲超时。

引用父级状态的子代理状态不拥有也不关闭共享记忆库；父级状态负责最终保留、刷新和句柄关闭。

交互式退出和打印模式退出为此排空过程预留 1.5 秒。如果预算耗尽，关闭流程会分离仍在进行的排空操作，并安排在其结束后关闭句柄，而不是让写入与数据库关闭发生竞态。进程可能先行退出。已写入的工作记忆行仍具有持久性，但最后几个轮次的提升或嵌入可能尚未完成；此前在智能体结束时执行的轮次保留不受影响。

`/memory enqueue` 是显式的、更强的持久性边界：它强制保留，刷新待处理的提取，并在所拥有的各记忆库间运行完整的休眠/整合。它不会绕过 Mnemopi 的年龄门槛：`sleepAllSessions` 会选择存在时间超过 `Math.floor(workingMemoryTtlHours / 2)` 小时的、尚未整合的工作记忆行（默认 TTL 为 24 小时时，此值为 12 小时）。因此，立即执行入队后，新行仍会保留在工作记忆中。可在退出前使用此命令强制保留并刷新待处理工作，或在达到年龄门槛后提升符合条件的行；正常关闭不会提升这些行。
