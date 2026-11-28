---
title: "自主记忆"
description: "Oh My Pi 官方仓库文档：自主记忆。"
---

# 自主记忆 \{#autonomous-memory}

omp 支持五种记忆模式。记忆默认禁用；通过 `/settings` 或 `config.yml` 选择一个后端：

| `memory.backend` | 存储与行为 | 指南 |
| --- | --- | --- |
| `off` | 无记忆后端 | 无 |
| `local` | 从持久化会话生成的项目作用域摘要和经验 | 本页 |
| `hindsight` | 远程、bank 作用域的 Hindsight 记忆 | [Hindsight](#hindsight-remote-backend) |
| `mnemopi` | 本地 Mnemopi SQLite 记忆 | [Mnemopi 记忆后端](./mnemosyne-memory-backend.md) |
| `sharpshooter` | 由阻力门控的项目决策文件（架构、产品、风格），在后台整合 | [Sharpshooter](#sharpshooter-backend) |

启用本地摘要流水线：

```yaml
memory:
   backend: local
```

## 用法 \{#usage}

### 注入的内容 \{#what-gets-injected}

会话启动时，如果当前项目存在已整合摘要或手动捕获的经验，就会将其作为**记忆指导**区块注入系统提示。摘要和经验共用 `memories.summaryInjectionTokenLimit`。

如果启动整合在首次构建提示之后完成，活动会话的摘要快照会刷新。捕获的经验仍固定于初始快照，因此并发的 `learn` 调用仍只影响后续会话。

- 将记忆视为启发式上下文，可用于流程和先前决策，但不是当前仓库状态的权威依据。
- 记忆改变计划时，引用记忆产物路径，并在行动前结合当前仓库证据。
- 仓库状态和用户指令与记忆冲突时，优先采用前两者；将冲突记忆视为过时。

### 读取记忆产物 \{#reading-memory-artifacts}

智能体可以通过 `read` 工具，使用 `memory://` URL 直接读取记忆文件：

| URL | 内容 |
| --- | --- |
| `memory://root` | 启动时注入的精简摘要 |
| `memory://root/MEMORY.md` | 完整的长期记忆文档 |
| `memory://root/learned.md` | `learn` 工具捕获的经验 |
| `memory://root/skills/<name>/SKILL.md` | 生成的技能操作手册 |
| `memory://<memory-id>` | 完整的 Mnemopi 记忆行（工作记忆或情景记忆），带有 YAML frontmatter 元数据头；仅在 `memory.backend` 为 `mnemopi` 时可用 |

`memory://<memory-id>` 形式返回完整的已存储行，而不是截短的召回预览（超过预览上限的召回内容以 `…` 结尾）；智能体会被要求在任何 `memory_edit update` 前先读取它。

`memory://root[/…]` 行基于文件，只有使用 `memory.backend: local` 时才存在，该后端通过整合流水线填充磁盘上的记忆根目录。在 `hindsight` 或 `mnemopi` 下从不写入根目录，因此这些 URL 无法解析，请改用 `recall`/`reflect`（在 `mnemopi` 上还可用 `read memory://<memory-id>`）。

### `/memory` 斜杠命令 \{#memory-slash-command}

| 子命令 | 效果 |
| --- | --- |
| `view` | 显示当前后端的注入载荷 |
| `stats` | 支持时显示后端专属记忆统计 |
| `diagnose` | 支持时显示后端专属诊断 |
| `queue` | 显示等待整合的待处理记忆增量 |
| `sync` | 立即运行记忆整合 |
| `clear` / `reset` | 删除当前后端的记忆数据或产物 |
| `enqueue` / `rebuild` | 强制为当前后端执行整合或留存工作 |
| `mm …` | Hindsight 心智模型维护（`list`/`show`/`refresh`/`history`/`seed`/`delete`/`reload`）；ACP 模式不支持 |

### 捕获经验 \{#capturing-lessons}

启用 `autolearn.enabled`，使 `learn` 工具可用：

```yaml
autolearn:
   enabled: true
```

`learn` 调用（或 `manage_skill`）也可以在 `~/.omp/agent/managed-skills` 下创建或更新托管技能，并标记其学习来源会话和项目。使用 `/skills learned` 审查，使用 `/skills forget <name>` 删除某个技能。

本地后端激活时，`learn` 将显式的持久经验保存到项目的 `learned.md`。经验按最新在前排序、去重、对密钥脱敏，上限为 100 条，从下一个会话开始注入；`learn` 调用不会修改活动会话的提示缓存前缀。每条经验的内容上限为 2,000 个字符，可选上下文上限为 400 个字符。本地后端不提供结构化记忆搜索、`recall`、`retain`、`reflect` 和 `memory_edit`。

## 工作原理 \{#how-it-works}

本地摘要记忆由启动时运行的后台流水线构建；`/memory enqueue` 标记整合工作，供下次启动处理。子代理以及未持久化到会话文件的会话会跳过该流水线。

**阶段 1，逐会话提取：** 对于自上次处理以来发生变化的每个历史会话，模型读取会话历史并提取持久信息：技术决策、约束、已解决的失败、反复出现的工作流。太新、太旧、当前活动中，或超出配置扫描及年龄限制的会话会被跳过。每次提取生成该会话的原始记忆块和简短梗概。

**阶段 2，整合：** 提取后，第二次模型处理读取所有逐会话提取结果，生成三个输出并写入磁盘：

- `MEMORY.md`：整理后的长期记忆文档
- `memory_summary.md`：会话启动时注入的精简文本
- `skills/`：可复用的流程操作手册，每个放在独立子目录中

单独维护的 `learned.md` 不会被整合覆盖。

阶段 2 使用租约和心跳，防止多个进程同时启动时重复运行。以前运行留下的过时技能目录会被自动清理。

整合输出在写入 `MEMORY.md`、`memory_summary.md` 或生成的技能之前，会针对常见密钥和 token 模式进行脱敏。

### 提取行为 \{#extraction-behavior}

记忆提取和整合行为由 `packages/coding-agent/src/prompts/memories/` 中的静态提示文件驱动。

| 文件 | 用途 | 变量 |
| --- | --- | --- |
| `stage_one_system.md` | 逐会话提取的系统提示 | 无 |
| `stage_one_input.md` | 包装会话内容的用户轮次模板 | `{{thread_id}}`、`{{response_items_json}}` |
| `consolidation_system.md` | 跨会话整合的系统提示 | 无 |
| `consolidation.md` | 跨会话整合的用户轮次提示 | `{{raw_memories}}`、`{{rollout_summaries}}` |
| `read-path.md` | 注入实时会话的记忆指导 | `{{memory_summary}}`、`{{learned}}` |

### 模型选择 \{#model-selection}

记忆复用模型角色系统。

| 阶段 | 角色 | 用途 |
| --- | --- | --- |
| 阶段 1（提取） | `default` | 逐会话知识提取 |
| 阶段 2（整合） | `smol`（回退到 `default`，再回退到当前模型或注册表中的首个模型） | 跨会话综合 |

如果未配置请求的记忆角色，记忆模型解析会回退到 `default` 角色，然后是活动会话模型，最后是注册表中的首个模型。

## 配置 \{#configuration}

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `memory.backend` | `off` | 为此流水线选择 `local`；未设置显式后端时，旧版 `memories.enabled: true` 会迁移为 `memory.backend: local` |
| `memories.maxRolloutAgeDays` | `30` | 不处理早于此天数的会话 |
| `memories.minRolloutIdleHours` | `12` | 距上次活动不足此小时数的会话会被跳过 |
| `memories.maxRolloutsPerStartup` | `64` | 单次启动处理的会话数量上限 |
| `memories.threadScanLimit` | `300` | 启动时扫描的最近会话记录数量上限 |
| `memories.maxRawMemoriesForGlobal` | `200` | 提供给全局整合的逐会话提取结果数量上限 |
| `memories.stage1Concurrency` | `8` | 并发逐会话提取作业数 |
| `memories.stage1LeaseSeconds` | `120` | 提取作业租约时长 |
| `memories.stage1RetryDelaySeconds` | `120` | 失败提取可再次被认领前的延迟 |
| `memories.phase2LeaseSeconds` | `180` | 整合租约时长 |
| `memories.phase2RetryDelaySeconds` | `180` | 失败整合重试前的延迟 |
| `memories.phase2HeartbeatSeconds` | `30` | 整合租约心跳间隔 |
| `memories.rolloutPayloadPercent` | `0.7` | 所选模型上下文预算中可用于 rollout 载荷的比例 |
| `memories.phase1InputTokenLimit` | `4000` | 逐会话提取输入上限 |
| `memories.fallbackTokenLimit` | `16000` | 模型未声明有限上下文窗口时使用的模型 token 预算 |
| `memories.summaryInjectionTokenLimit` | `5000` | 注入系统提示的摘要和捕获经验共用的近似 token 上限 |

## Hindsight 远程后端 \{#hindsight-remote-backend}

Hindsight 需要可访问的 [Hindsight](https://hindsight.vectorize.io/) 服务器。默认端点为 `http://localhost:8888`；服务器要求身份验证时，请设置 token：

```yaml
memory:
   backend: hindsight
hindsight:
   apiUrl: http://localhost:8888
   apiToken: ${HINDSIGHT_API_TOKEN}
```

`HINDSIGHT_*` 环境变量覆盖 `hindsight.*` 设置，后者覆盖内置默认值。有关全部 18 个受支持覆盖项、可接受值、解析规则、优先级和默认值，请参见[完整的 Hindsight 环境变量表](./environment-variables.md#hindsight-memory-backend)。

默认情况下，Hindsight 使用 `per-project-tagged` 作用域：写入共享 bank 并带有项目标签，召回则包含带项目标签的记忆和未标记的全局记忆。启用 `hindsight.globalScope: true`（默认关闭）后，`retain` 和 `learn` 接受 `scope: "global"`，以写入这种未标记记忆，让适用于所有地方的偏好或经验能够到达每个项目。召回会在每个项目中找到该全局事实本身。逐项目心智模型刷新时严格匹配项目标签，因此绝不会包含全局记忆；未标记的 `user-preferences` 模型则会包含。整合也可能将全局事实并入现有的带项目标签的观察，因此其他项目的观察结果可能遗漏这种整合形式。为提取事实添加标签的 bank 配置（带有 `tag: true` 的 `entity_labels` 组）会为每个带此类标签的事实添加标签，而以这种方式添加标签的全局事实将不再出现在其他项目中。`per-project` 将每个工作目录项目隔离到自己的 bank，不提供 `scope: "global"`；`global` 使用一个共享 bank。显式 `hindsight.bankId` 选择 bank 基础名称。更改 bank ID、前缀或作用域会重建主会话状态，使后续操作使用新作用域。

两种项目作用域模式以相同方式命名项目：取仓库的主检出根目录（这样，同一仓库的每个链接工作树都会解析到相同目录），再将其目录基本名称转为小写。因此，位于 `~/code/General` 的检出副本会标记为 `project:general`。标签按字面匹配，因此这种大小写折叠使同一仓库无论路径大小写如何，都处于同一记忆作用域。

主会话在首个模型轮次召回（`hindsight.autoRecall: true`），默认每三个用户轮次自动留存已完成的对话轮次。`/memory enqueue` 排空工具留存队列，并强制留存当前会话。智能体结束时，主状态会调度按频次进行的留存并排空留存队列；会话释放会在释放状态前排空该队列。请求失败和配置的超时会被记录，编码会话仍可使用。子代理在显式 `recall`、`retain` 和 `reflect` 调用中复用父级的客户端、bank 和作用域，但不运行自己的自动召回或留存。

工具发起的 `retain` 和 `learn` 写入经过持久化发件箱：工具报告已排队前，每条记忆会写入 `<agentDir>/hindsight-outbox/` 下的私有文件（不含 bearer token，可识别的密钥已脱敏），服务器接受后删除该文件。投递失败的内容保留在磁盘上，并以指数退避重试；使用相同 API URL 和 bank 的下一个主会话会投递先前进程留下的内容。每条记忆的 id 同时充当服务器的 `document_id`，因此重新发送会替换而不是重复创建。被服务器拒绝的请求（HTTP 400、413、422）、格式错误的文件，以及 7 天未投递的事件，会被移到 `hindsight-outbox/quarantine/` 并发出警告，30 天后删除。2xx 响应意味着服务器已接受，而不是已完成提取。自动会话记录留存不使用发件箱。

召回内容作为背景上下文而非指令注入，召回记忆也会在上下文压缩期间作为额外上下文提供。首轮召回存储在会话文件中，因此恢复、切换到该会话或从其派生新会话时，会原样发送而不是重新召回；上下文重置、不同的 bank 或标签筛选器，或编辑首个提示的分支会重新召回。Hindsight 记忆无法按 id 查找，因此召回之后的记忆变化不会被报告。新进程启动时仍会重新加载心智模型。选择 Hindsight 会暴露 `recall`、`retain` 和 `reflect`；`memory_edit` 不可用，因为此后端不编辑上游 Hindsight 记忆。

`/memory view`、`/memory stats`、`/memory diagnose` 和 `/memory enqueue` 通过当前激活的 Hindsight 状态运行。`/memory clear` 先排空待处理留存，再只清除本地会话状态和召回缓存。它**不会删除服务器端 bank**；请使用 Hindsight UI 或 API 删除该 bank。

## Sharpshooter 后端 \{#sharpshooter-backend}

Sharpshooter 保留三个简短的项目决策文件：`architecture.md`、`product.md` 和 `style.md`，并将其注入系统提示。它不需要服务器；文件位于 `<agentDir>/memories/sharpshooter/<bank>/` 下，bank 从工作目录推导，因此每个项目都有自己的决策。

```yaml
memory:
   backend: sharpshooter
sharpshooter:
   minPromptLength: 4
   intervalMinutes: 5
```

**提取：** 主会话中的每个用户提示（跳过子代理）都会发送给提取模型，模型将用户作出的持久决策，包括架构、产品和风格决策、约束、被拒绝的方案以及纠正，作为增量记录到逐会话队列中。斜杠命令和短于 `sharpshooter.minPromptLength` 个字符的提示不会发送；一个会话一次运行一个提取，提取运行时到达的提示不会被提取。诸如“选项 2”的简短回复会结合前一条助手消息解析，但默认阈值为 16 个字符时，它们太短而不会发送，请调低 `sharpshooter.minPromptLength` 以捕获它们。

**整合：** 调度器每分钟检查一次，距上次运行经过 `sharpshooter.intervalMinutes` 后，在一次模型处理中将排队增量应用到三个文件，并从队列中移除。`/memory enqueue` 立即整合；`/memory queue` 列出待处理增量，`/memory clear` 删除项目文件和队列。

| 设置 | 默认值 | 说明 |
| --- | --- | --- |
| `memory.backend` | `off` | 设为 `sharpshooter` 以启用此后端 |
| `sharpshooter.model` | 未设置 | 用于提取和整合的模型选择器；未设置时使用 `smol` 角色 |
| `sharpshooter.minPromptLength` | `16` | 短于此字符数的提示不会发送去提取；小于 `2` 的值按 `2` 处理。字符按显示形式计数（一个中日韩字符或 emoji 算一个），所有语言的计数方式相同，因此中文用户可以降低此值，以捕捉“用方案二”等简短回复 |
| `sharpshooter.intervalMinutes` | `5` | 两次整合运行之间的最短分钟数 |
| `sharpshooter.injectionTokenLimit` | `15000` | 注入系统提示的决策文件的近似 token 上限 |

## 关键文件 \{#key-files}

- `packages/coding-agent/src/memories/index.ts`：流水线编排、注入、清除/入队入口（`/memory` 命令经由 `packages/coding-agent/src/memory-backend/local-backend.ts` 路由到此处）
- `packages/coding-agent/src/memories/storage.ts`：基于 SQLite 的任务队列和线程注册表
- `packages/coding-agent/src/prompts/memories/`：记忆提示模板
- `packages/coding-agent/src/internal-urls/memory-protocol.ts`：`memory://` URL 处理器
