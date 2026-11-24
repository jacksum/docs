---
title: "自主记忆"
description: "Oh My Pi v19.1.1 仓库文档：自主记忆。"
---

# 自主记忆 \{#autonomous-memory}

omp 支持五种记忆模式。记忆默认关闭；可以通过 `/settings` 或 `config.yml` 选择一个后端：

| `memory.backend` | 存储与行为 | 指南 |
| ---------------- | ---------- | ---- |
| `off` | 无记忆后端 | 无 |
| `local` | 根据已持久化的会话生成项目范围内的摘要和经验 | 本页 |
| `hindsight` | 以记忆库为范围的远程 Hindsight 记忆 | [Hindsight](#hindsight-remote-backend) |
| `mnemopi` | 本地 Mnemopi SQLite 记忆 | [Mnemopi 记忆后端](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/mnemosyne-memory-backend.md) |
| `sharpshooter` | 设有采集门槛的项目决策文件（架构、产品、风格），在后台整合 | [Sharpshooter](#sharpshooter-backend) |

启用本地摘要流水线：

```yaml
memory:
   backend: local
```

## 用法 \{#usage}

### 注入内容 \{#what-gets-injected}

会话开始时，如果当前项目有已整合的摘要或手动记录的经验，这些内容会以 **记忆指引（Memory Guidance）** 块的形式注入系统提示词。摘要和经验共用 `memories.summaryInjectionTokenLimit` 的额度。

如果启动时的整合在首次构建提示词后才完成，当前会话的摘要快照会刷新。已记录的经验仍固定在初始快照上，因此并发调用 `learn` 仍只会影响后续会话。

- 将记忆作为参考信息：它有助于了解流程和以往决策，但不能作为判断仓库当前状态的权威依据。
- 如果记忆改变了计划，请说明记忆产物的路径，并在采取行动前结合当前仓库中的证据核对。
- 如果记忆与仓库当前状态或用户指令冲突，以仓库当前状态和用户指令为准，并将冲突的记忆视为已过时。

### 读取记忆产物 \{#reading-memory-artifacts}

对于 `memory://` URL，智能体可以用 `read` 工具直接读取记忆文件：

| URL | 内容 |
| --- | ---- |
| `memory://root` | 启动时注入的精简摘要 |
| `memory://root/MEMORY.md` | 完整的长期记忆文档 |
| `memory://root/learned.md` | 由 `learn` 工具记录的经验 |
| `memory://root/skills/<name>/SKILL.md` | 生成的技能操作指南 |
| `memory://<memory-id>` | 完整的 Mnemopi 记忆记录（工作记忆或情景记忆），带有 YAML frontmatter 元数据头；仅在 `memory.backend` 为 `mnemopi` 时可用 |

`memory://<memory-id>` 这种形式返回完整的存储记录，不受召回预览的截断限制（超过预览上限的召回内容末尾会有 `…`）。智能体收到指示，必须在执行任何 `memory_edit update` 前读取该记录。

表中 `memory://root[/…]` 形式的条目以文件为基础，仅在 `memory.backend: local` 下存在；此时整合流水线会填充磁盘上的记忆根目录。`hindsight` 或 `mnemopi` 不会写入该根目录，所以这些 URL 无法解析。请改用 `recall` 或 `reflect`（`read memory://<memory-id>` 也可在 `mnemopi` 下使用）。

### `/memory` 斜杠命令 \{#memory-slash-command}

| 子命令 | 作用 |
| ------ | ---- |
| `view` | 显示当前后端注入的内容 |
| `stats` | 在后端支持时显示该后端的记忆统计信息 |
| `diagnose` | 在后端支持时显示该后端的诊断信息 |
| `queue` | 显示等待整合的记忆增量 |
| `sync` | 立即运行记忆整合 |
| `clear` / `reset` | 删除当前后端的记忆数据或产物 |
| `enqueue` / `rebuild` | 强制当前后端执行整合或保留任务 |
| `mm …` | 维护 Hindsight 心智模型（`list`/`show`/`refresh`/`history`/`seed`/`delete`/`reload`）；ACP 模式不支持 |

### 记录经验 \{#capturing-lessons}

启用 `autolearn.enabled` 后即可使用 `learn` 工具：

```yaml
autolearn:
   enabled: true
```

使用本地后端时，`learn` 将明确且可长期沿用的经验保存到项目的 `learned.md` 中。经验按时间从新到旧排列、去重并遮盖敏感信息，最多保留 100 条，从下一次会话开始注入。调用 `learn` 不会改变当前会话的提示词缓存前缀。每条经验的正文最多 2,000 个字符，可选的上下文最多 400 个字符。本地后端不支持结构化记忆搜索、`recall`、`retain`、`reflect` 和 `memory_edit`。

## 工作原理 \{#how-it-works}

本地摘要记忆由启动时运行的后台流水线生成。`/memory enqueue` 会标记待整合的任务，供下次启动时处理。此流水线不会在子代理或未持久化到会话文件的会话中运行。

**阶段 1：逐会话提取。** 对于自上次处理后有变化的每个历史会话，模型读取会话历史并提取可长期沿用的信息，包括技术决策、约束、已解决的故障和反复使用的工作流程。流水线会跳过时间过近、过旧、仍处于活动状态或超出所配置扫描范围或时间限制的会话。每次提取都为该会话生成一块原始记忆和一份简短概要。

**阶段 2：整合。** 提取完成后，模型再运行一轮，读取所有会话的提取结果，生成三类产物并写入磁盘：

- `MEMORY.md`：筛选整理后的长期记忆文档
- `memory_summary.md`：在会话开始时注入的精简文本
- `skills/`：可复用的操作指南，每份各存于一个子目录

整合不会覆盖单独维护的 `learned.md`。

阶段 2 使用租约和心跳，防止多个进程同时启动时重复运行。系统会自动清理以往运行遗留的过时技能目录。

将 `MEMORY.md`、`memory_summary.md` 或生成的技能写入磁盘前，流水线会遮盖整合结果中符合常见密钥或令牌模式的内容。

### 提取行为 \{#extraction-behavior}

记忆提取和整合的行为由 `packages/coding-agent/src/prompts/memories/` 中的静态提示词文件决定。

| 文件 | 用途 | 变量 |
| ---- | ---- | ---- |
| `stage_one_system.md` | 逐会话提取的系统提示词 | 无 |
| `stage_one_input.md` | 封装会话内容的用户轮次模板 | `{{thread_id}}`, `{{response_items_json}}` |
| `consolidation_system.md` | 跨会话整合的系统提示词 | 无 |
| `consolidation.md` | 跨会话整合的用户轮次提示词 | `{{raw_memories}}`, `{{rollout_summaries}}` |
| `read-path.md` | 注入当前会话的记忆指引 | `{{memory_summary}}`, `{{learned}}` |

### 模型选择 \{#model-selection}

记忆功能沿用模型角色系统。

| 阶段 | 角色 | 用途 |
| ---- | ---- | ---- |
| 阶段 1（提取） | `default` | 逐会话提取知识 |
| 阶段 2（整合） | `smol`（回退到 `default`，再回退到当前模型或注册表中的首个模型） | 跨会话综合 |

如果没有为所请求的记忆角色配置模型，模型选择会依次回退到 `default` 角色、当前会话的模型和注册表中的首个模型。

## 配置 \{#configuration}

| 设置 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `memory.backend` | `off` | 选择 `local` 即可使用此流水线；没有显式设置后端时，旧配置 `memories.enabled: true` 会迁移为 `memory.backend: local` |
| `memories.maxRolloutAgeDays` | `30` | 超过此天数的会话不处理 |
| `memories.minRolloutIdleHours` | `12` | 距上次活动不足此小时数的会话会被跳过 |
| `memories.maxRolloutsPerStartup` | `64` | 每次启动处理的会话数上限 |
| `memories.threadScanLimit` | `300` | 启动时扫描的近期会话记录数上限 |
| `memories.maxRawMemoriesForGlobal` | `200` | 提供给全局整合的逐会话提取结果数上限 |
| `memories.stage1Concurrency` | `8` | 逐会话提取任务的并发数 |
| `memories.stage1LeaseSeconds` | `120` | 提取任务的租约时长 |
| `memories.stage1RetryDelaySeconds` | `120` | 提取任务失败后，须等待多久才能再次领取该任务 |
| `memories.phase2LeaseSeconds` | `180` | 整合任务的租约时长 |
| `memories.phase2RetryDelaySeconds` | `180` | 整合失败后重试前的等待时长 |
| `memories.phase2HeartbeatSeconds` | `30` | 整合租约的心跳间隔 |
| `memories.rolloutPayloadPercent` | `0.7` | 所选模型可分配给会话轨迹载荷的上下文预算比例 |
| `memories.phase1InputTokenLimit` | `4000` | 逐会话提取的输入上限 |
| `memories.fallbackTokenLimit` | `16000` | 模型未声明有限的上下文窗口时使用的 token 预算 |
| `memories.summaryInjectionTokenLimit` | `5000` | 注入系统提示词的摘要和已记录经验共用的大致 token 上限 |

## Hindsight 远程后端 \{#hindsight-remote-backend}

Hindsight 需要能够访问 [Hindsight](https://hindsight.vectorize.io/) 服务器。默认端点为 `http://localhost:8888`；如果服务器要求身份验证，请设置令牌：

```yaml
memory:
   backend: hindsight
hindsight:
   apiUrl: http://localhost:8888
   apiToken: ${HINDSIGHT_API_TOKEN}
```

`HINDSIGHT_*` 环境变量的优先级高于 `hindsight.*` 设置，后者又高于内置默认值。有关全部 18 个受支持的覆盖项，以及它们接受的值、解析规则、优先级和默认值，请参阅 [Hindsight 环境变量完整表格](./environment-variables.md#hindsight-memory-backend)。

Hindsight 默认采用 `per-project-tagged` 范围模式：记忆写入共享记忆库，并加上项目标签；召回范围包括带当前项目标签的记忆和不带标签的全局记忆。启用 `hindsight.globalScope: true`（默认关闭）后，`retain` 和 `learn` 接受 `scope: "global"` 来写入一条不带标签的记忆，使适用于所有项目的偏好或经验能够在每个项目中使用。每个项目都能召回这条全局事实本身。各项目的心智模型刷新时严格匹配项目标签，因此不会纳入全局记忆；不带标签的 `user-preferences` 模型则会纳入。整合也可能将全局事实并入已有的、带项目标签的观察记录，因此其他项目返回的观察结果可能不包含这种整合后的形式。如果记忆库配置为给提取出的事实添加标签（即某个 `entity_labels` 组设置了 `tag: true`），每条带有这类实体标签的事实都会被加上标签。这样被标记的全局事实不会再出现在其他项目中。`per-project` 将每个按工作目录区分的项目隔离在自己的记忆库中，不提供 `scope: "global"`；`global` 使用一个共享记忆库。显式设置 `hindsight.bankId` 可以选择记忆库的基础标识。更改记忆库 ID、前缀或范围设置会重建主会话状态，使后续操作使用新的范围。

两种按项目划分范围的模式都以相同方式命名项目：先取仓库的主检出根目录（因此同一仓库的所有关联工作树都解析到同一目录），再将该目录的名称转为小写。因此，检出目录 `~/code/General` 对应的标签是 `project:general`。标签按字面匹配，因此转为小写能确保无论路径大小写如何，同一仓库都使用同一个记忆范围。

主会话在模型的首轮调用时执行召回（`hindsight.autoRecall: true`），默认每经过三个用户轮次就自动保留已完成的对话轮次。`/memory enqueue` 会处理完队列中工具发起的保留请求，并强制保留当前会话。智能体结束时，主会话状态会按既定频率安排保留操作，并处理完保留队列；会话销毁时，会在释放状态前处理完该队列。请求失败或达到配置的超时时间时，系统会记录日志，编码会话仍可使用。子代理在显式调用 `recall`、`retain` 和 `reflect` 时共用父智能体的客户端、记忆库和范围，但不会自行执行自动召回或保留。

工具发起的 `retain` 和 `learn` 写入通过持久化发件箱处理。工具在报告记忆已入队之前，先将每条记忆写入 `<agentDir>/hindsight-outbox/` 下的私有文件（不包含 Bearer 令牌，并遮盖可识别的敏感信息），服务器接受后即删除该文件。投递失败的记忆保留在磁盘上，按指数退避重试；使用同一 API URL 和记忆库的下一个主会话会投递先前进程留下的记忆。每条记忆的 ID 也用作服务器端的 `document_id`，因此重发会替换原有记录，不会产生重复记录。服务器拒绝的请求（HTTP 400、413、422）、格式错误的文件，以及 7 天仍未投递的事件，都会移入 `hindsight-outbox/quarantine/` 并触发警告，30 天后删除。2xx 响应表示服务器已接受请求，不表示提取已完成。自动保留会话记录不使用发件箱。

召回内容作为背景信息注入，不作为指令；在上下文压缩期间，召回的记忆也可用作额外上下文。首轮召回结果存入会话文件，因此恢复、切换到或从该会话派生新会话时，会原样发送这份结果，无须再次召回。重置上下文、使用不同的记忆库或标签过滤器，或者在分支中编辑第一条提示词，都会重新召回。Hindsight 记忆无法按 ID 查询，因此召回后记忆发生的变更不会报告。新进程启动时仍会重新加载心智模型。选择 Hindsight 后可使用 `recall`、`retain` 和 `reflect`；无法使用 `memory_edit`，因为不能通过这个后端编辑上游 Hindsight 记忆。

`/memory view`、`/memory stats`、`/memory diagnose` 和 `/memory enqueue` 都通过当前 Hindsight 状态执行。`/memory clear` 会先处理完待处理的保留请求，然后仅清除本地会话状态和召回缓存。它**不会删除服务器端的记忆库**；要删除该记忆库，请使用 Hindsight UI 或 API。

## Sharpshooter 后端 \{#sharpshooter-backend}

Sharpshooter 维护三个简短的项目决策文件（`architecture.md`、`product.md` 和 `style.md`），并将它们注入系统提示词。它不需要服务器；文件存放在 `<agentDir>/memories/sharpshooter/<bank>/` 下，记忆库由工作目录确定，因此每个项目都有各自的决策记录。

```yaml
memory:
   backend: sharpshooter
sharpshooter:
   minPromptLength: 4
   intervalMinutes: 5
```

**提取：** 主会话中的每条用户提示词都会送给提取模型（跳过子代理）。模型把用户做出的可长期沿用的决定，包括架构、产品和风格方面的决策、约束、否决的做法和更正，作为增量记录到该会话的队列中。斜杠命令和字符数低于 `sharpshooter.minPromptLength` 的提示词不会发送。每个会话同时只运行一次提取，运行期间收到的提示词不会被提取。「opt 2」之类的简短回复会结合上一条助手消息解析，但按默认的 16 个字符计算，它们太短而无法发送。要记录这类回复，可以调低 `sharpshooter.minPromptLength`。

**整合：** 调度器每分钟检查一次。当距上次运行已过去 `sharpshooter.intervalMinutes` 分钟后，模型会在一轮运行中将排队的增量应用到三个文件，并从队列移除这些增量。`/memory enqueue` 会立即整合；`/memory queue` 列出待处理的增量，`/memory clear` 则删除该项目的文件和队列。

| 设置 | 默认值 | 说明 |
| ---- | ------ | ---- |
| `memory.backend` | `off` | 设为 `sharpshooter` 即可启用此后端 |
| `sharpshooter.model` | 未设置 | 用于提取和整合的模型选择器；未设置时使用 `smol` 角色 |
| `sharpshooter.minPromptLength` | `16` | 字符数低于此值的提示词不会发送去提取；低于 `2` 的值按 `2` 处理。字符按显示的单位计数（一个中日韩文字符或一个表情符号都计为一个字符），所有语言规则相同，因此中文用户可以调低此值，以记录「用方案二」之类的简短回复 |
| `sharpshooter.intervalMinutes` | `5` | 两次整合之间至少间隔的分钟数 |
| `sharpshooter.injectionTokenLimit` | `15000` | 注入系统提示词的决策文件的大致 token 上限 |

## 关键文件 \{#key-files}

- `packages/coding-agent/src/memories/index.ts`：流水线编排、注入、清除和入队的入口（`/memory` 命令通过 `packages/coding-agent/src/memory-backend/local-backend.ts` 路由到这里）
- `packages/coding-agent/src/memories/storage.ts`：基于 SQLite 的任务队列和会话线程注册表
- `packages/coding-agent/src/prompts/memories/`：记忆提示词模板
- `packages/coding-agent/src/internal-urls/memory-protocol.ts`：`memory://` URL 处理程序
