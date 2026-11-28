---
title: "上下文压缩和分支摘要"
description: "Oh My Pi 官方仓库文档：上下文压缩和分支摘要。"
---

# 上下文压缩和分支摘要 \{#compaction-and-branch-summaries}

上下文压缩和分支摘要是让长会话保持可用、同时不丢失先前工作上下文的两种机制。

- **上下文压缩**将旧历史重写为当前分支上的摘要。
- **分支摘要**在 `/tree` 导航期间捕获被放弃的分支上下文。

两者都作为会话条目持久化，并在重建 LLM 输入时转换回用户上下文消息。

## 关键实现文件 \{#key-implementation-files}

- `packages/agent/src/compaction/compaction.ts`（上下文满时的摘要生成和交接生成）
- `packages/snapcompact/src/snapcompact.ts`（snapcompact 策略：将历史归档为密集位图图像）
- `packages/agent/src/compaction/branch-summarization.ts`
- `packages/agent/src/compaction/pruning.ts`
- `packages/agent/src/compaction/compaction-v2-streaming.ts`（提供方原生流式上下文压缩）
- `packages/agent/src/compaction/shake.ts`（机械式内容省略）
- `packages/agent/src/compaction/utils.ts`
- `packages/agent/src/compaction/openai.ts`
- `packages/agent/src/compaction/messages.ts`（共享的 LLM 转换和摘要包装）
- `packages/coding-agent/src/session/session-context.ts`（上下文和会话记录组装）
- `packages/coding-agent/src/session/session-manager.ts`
- `packages/coding-agent/src/session/agent-session.ts`
- `packages/coding-agent/src/session/session-maintenance.ts`（自动维护编排）
- `packages/coding-agent/src/session/messages.ts`
- `packages/coding-agent/src/extensibility/hooks/types.ts`
- `packages/coding-agent/src/session/context-settings.ts`（`compaction.*`、`snapcompact.*`、`branchSummary.*` 定义）

## 会话条目模型 \{#session-entry-model}

上下文压缩和分支摘要是一等会话条目，不是普通的助手/用户消息。

- `CompactionEntry`
   - `type: "compaction"`
   - `summary`，可选的 `shortSummary`
   - `firstKeptEntryId`（上下文压缩边界）
   - `tokensBefore`
   - 可选的 `details`、`preserveData`、`fromExtension`
   - 可选的 `method`、`tokensAfter`、`warning`（维护/显示元数据）
   - 可选的 `providerReplayThroughEntryId`（原生重放快照覆盖的最后一个条目）
- `BranchSummaryEntry`
   - `type: "branch_summary"`
   - `fromId`、`summary`
   - 可选的 `details`、`fromExtension`

重建上下文时（`buildSessionContext`）：

1. 活动路径上 `options.model` 能读取的最新上下文压缩（省略该选项时可使用任意上下文压缩，会话记录始终如此；见下文）会转换为一条 `compactionSummary` 消息。
2. 重新包含从 `firstKeptEntryId` 到上下文压缩点的保留条目。
3. 追加路径上更晚的条目。
4. 将 `branch_summary` 条目转换为 `branchSummary` 消息。
5. 将 `custom_message` 条目转换为 `custom` 消息。

这些自定义角色随后在 `convertToLlm()` 中转换为面向 LLM 的消息：`compactionSummary` 和 `branchSummary` 变为通过以下静态模板渲染的用户消息：

- `packages/agent/src/compaction/prompts/compaction-summary-context.md`
- `packages/agent/src/compaction/prompts/branch-summary-context.md`
- `packages/agent/src/compaction/prompts/handoff-summary-context.md`（当 `method === "handoff"` 时）

具有有序归档块的 snapcompact 摘要绕过这些包装，直接发送引导文本和归档块。`custom` 消息通常以原始内容作为开发者消息传递（没有摘要模板）。

原生重放还要求活动模型具有匹配的提供方和 Responses 家族 API。单独的原生上下文压缩端点并不会赋予 Chat Completions 或 Anthropic 编码器消费其输出的能力。

禁用后续原生上下文压缩不会禁用对现有负载的正常重放。上下文压缩准备有单独且更严格的复用策略：本地摘要生成必须重新展开原始消息，而不能将不透明占位符当作可读摘要。

LLM 上下文针对读取它的模型构建。当活动模型无法重放最新的 OpenAI 负载时（其他提供方，包括 `openai` ↔ `openai-codex`），上下文会以它能读取的最新上下文压缩为基础，并携带不可读压缩背后的原始历史；当两个模型基于不同边界时，模型切换会重建智能体消息。提示词前阈值随后测量该历史，因此窗口容不下它的目标模型会在首次请求前执行上下文压缩。重试回退和上下文提升会根据候选模型将读取的上下文判断其窗口，而先压缩再切换（`/switch`、Alt+P、计划批准）会跳过目标模型无法重放负载的原生方法。

## 上下文压缩管线 \{#compaction-pipeline}

### 触发方式 \{#triggers}

上下文压缩/上下文维护可以通过六种方式运行：

1. **手动上下文压缩**：`/compact [instructions]` 调用 `AgentSession.compact(...)`。它遍历 `compaction.methodOrder`，并在顺序中省略 `soft` 时回退到该方法，因此手动执行总会压缩；`/compact <mode>` 保持该模式固定的方法链。
2. **自动溢出恢复**：在同模型助手错误匹配上下文溢出之后触发。
3. **自动输出不完整恢复**：在同模型助手消息以 `stopReason === "length"` 结束后触发（包括 OpenAI/Codex `response.incomplete` 和 Anthropic 输出/上下文限制），受下文输出上限检查约束。
4. **自动阈值维护**：成功轮次之后，上下文超过解析出的阈值时触发。
5. **轮次中途阈值维护**：工具循环轮次越过阈值，且 `compaction.midTurnEnabled !== false` 时，在下一次提供方请求前触发。子代理会话始终运行此检查：`createSubagentSettings` 为子代理固定开启 `compaction.midTurnEnabled`，因为整个任务就是一个轮次，所以轮次后维护只会在运行已经结束后触发。
6. **空闲维护**：`runIdleCompaction()` 可以使用原因 `"idle"` 调用相同的自动维护路径。

### ACP 通知 \{#acp-notifications}

ACP 会话将自动维护作为 JSON-RPC 扩展通知转发：

| 方法 | 参数 |
| --- | --- |
| `_omp/compaction/start` | `sessionId`、`reason`、`action` |
| `_omp/compaction/end` | `sessionId`、`action`、`aborted`、`willRetry`，可选的 `skipped`、`errorMessage`、`tokensBefore` |

未实现这些通知的客户端可以忽略它们。

### 上下文压缩形态（示意图） \{#compaction-shape-visual}

```text
Before compaction:

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴──────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               messagesToSummarize            kept messages
                                   ↑
                          firstKeptEntryId (entry 4)

After compaction (new entry appended):

  entry:  0     1     2     3      4     5     6      7      8     9      10
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬──────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool │ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴──────┴─────┘
               └──────────┬──────┘ └──────────────────────┬───────────────────┘
                 not sent to LLM                    sent to LLM
                                                         ↑
                                              starts from firstKeptEntryId

What the LLM sees:

  ┌────────┬─────────┬─────┬─────┬──────┬──────┬─────┬──────┐
  │ system │ summary │ usr │ ass │ tool │ tool │ ass │ tool │
  └────────┴─────────┴─────┴─────┴──────┴──────┴─────┴──────┘
       ↑         ↑      └─────────────────┬────────────────┘
    prompt   from cmp          messages from firstKeptEntryId
```

### 溢出/输出不完整恢复与阈值/空闲维护 \{#overflowincomplete-recovery-vs-thresholdidle-maintenance}

这些自动路径有意采用不同的行为：

- **溢出恢复**
   - 触发条件：当前模型的助手错误被检测为上下文溢出，且该错误不早于最新上下文压缩。
   - 重试前，从活动智能体状态中移除导致失败的助手错误消息。
   - 首先尝试上下文提升；如果存在已配置的更大模型，智能体会切换模型并重试，不进行上下文压缩。
   - 如果无法提升且已启用上下文压缩，自动维护会以 `reason: "overflow"` 和 `willRetry: true` 遍历 `compaction.methodOrder`；交接会被跳过，因为它的请求将复用已溢出的输入。
   - 成功后，调度 `agent.continue()` 重试该轮次。

- **输出不完整恢复**
   - 触发条件：同模型助手消息以 `stopReason === "length"` 结束，且该消息不早于最新上下文压缩。
   - 当窗口占用低于上下文压缩阈值，且该轮次已交付文本或工具调用时，会保留被截断的轮次并显示输出限制警告；上下文压缩无法提高输出上限。
   - 否则，从活动状态移除不完整的助手消息，并首先尝试上下文提升。
   - 启用维护时，低于阈值且无输出的轮次不经上下文压缩便重试；仅有推理的输出上限停止还会收到一条开发者提醒，要求以更小的步骤行动。
   - 超过阈值（或窗口未知）时，自动维护会以 `reason: "incomplete"` 和 `willRetry: true` 遍历 `compaction.methodOrder`。与溢出不同，可达的 `handoff` 可以运行，因为输入仍然可用。
   - 没有文本或工具调用的连续恢复最多三次；新的用户输入或可执行输出会重置计数器。达到最终上限会阻止自动继续，并报告可采取行动的失败信息。
   - 成功恢复会调度继续执行。

- **阈值维护**
   - 触发条件：成功的、非错误助手消息，其调整后的上下文 token 数超过 `resolveThresholdTokens(...)`。测量计数来自 `calculateContextTokens(...)`，它会减去提供方侧的编排 token（计费，但绝不会重放到对话前缀中），从而避免它们抬高自动上下文压缩和上下文提升的阈值计数。
   - 当 `compaction.midTurnEnabled !== false` 时，轮次中途维护还会在下一次提供方请求前检查安全的工具循环边界。
   - 初始触发使用调整后的提供方用量，并以已存储对话估算值为下限；剪枝不会追溯减少刚计费的提示词。回收的 token 会影响后续维护目标。早于最新上下文压缩的用量会被忽略，改用实时存储估算值。
   - 轮次后上下文压缩之前会先尝试上下文提升。
   - 如果无法提升，自动维护会以 `reason: "threshold"` 和 `willRetry: false` 遍历 `compaction.methodOrder`。
   - 每种方法，包括 `handoff`，都以内联方式运行：轮次后维护会在运行的 `agent_end` 完成前生成交接文档，并将其作为上下文压缩条目提交，因此完成状态的 `willContinue`/`yielded` 反映的是是否实际调度了继续执行。
   - 成功后，如果 `compaction.autoContinue !== false`，轮次后维护会根据 `prompts/system/auto-continue.md` 调度一条由智能体编写的开发者自动继续提示词；轮次中途维护绝不会调度单独的继续执行，因为核心循环已经负责下一次提供方请求。

- **空闲维护**
   - 触发条件：没有流式输出且未在执行上下文压缩时调用 `runIdleCompaction()`；它首先取消待处理的缓存预热刷新，避免预热重放与摘要生成竞争。空闲计时器属于会话的空闲维护调度器，交互式 TUI 会为屏幕上显示的会话启用它（见 [SDK 空闲维护](./sdk.md#idle-maintenance)）。当轮次已结束，没有实时、已准入、排队或已调度的工作，也没有可能唤醒会话的后台任务或投递，同时编辑器中没有草稿，且上下文达到或超过 `compaction.idleThresholdTokens` 时，它会启动；草稿会推迟计时器，直到草稿被清空，再以新的延迟重新启动。当响应确认有长时档（1h，Anthropic 长保留期）提示词缓存条目时，无论是读缓存还是写缓存，计时器都会在缓存预热器刷新点前 5s 触发，该刷新点为最后一次请求或预热命中之后的 `min(90% of TTL, TTL − 10s)`（约 54 分钟），因此摘要请求仍能读取缓存前缀；如果轮次在该时间点之后、过期之前结束，则立即压缩。5 分钟条目绝不会驱动计时器：它在轮次结束后过期得太快，不值得按其时刻启动上下文压缩。在这种情况下、生命周期未知时，或条目已过期时，计时器等待 `compaction.idleTimeoutSeconds`。
   - 短时档的权衡（有意为之）：回退延迟从轮次结束时开始计算，而缓存生命周期从请求发送时开始计算，因此使用默认 300s 延迟时，5 分钟条目后的空闲摘要总会在缓存过期后运行，并支付冷启动的完整前缀读取费用。接受这一点是为了避免短暂休息触发上下文压缩；更短的 `compaction.idleTimeoutSeconds` 值（最小 60s）仍可能落在条目生命周期内。
   - 在此轮处理重写历史期间，提示词、启动轮次的自定义消息、IRC 唤醒和后台结果投递会等待其完成，然后在压缩后的上下文上运行。
   - 使用 `reason: "idle"`，之后不会自动继续。

### 负载拒绝防护 \{#payload-rejection-guard}

HTTP 413 / 负载拒绝不会自动视为 token 溢出。如果窗口已知、本地估算至少还有 10% 余量且提供方输入用量在窗口内，或存在明确的图像限制证据而没有用量支持的溢出，则会阻止自动继续，并发出负载预算警告，而不是提升或压缩上下文。

当提供方用量证明 token 溢出时，维护仍可缩减上下文。对于因字节/媒体形态而拒绝的情况，会排除 snapcompact，除非用量证明 token 溢出且没有明确的媒体限制证据。窗口未知时，维护可能尝试可运行的溢出方法；恢复不可用或没有进展时会阻止自动继续，而不是重新提交未改变的历史。

### 实验性笔记支撑上下文窗口 \{#experimental-notes-backed-context-windows}

在 `/settings` 中启用**笔记支撑的上下文窗口（实验性）**；运行中的会话会立即获得这些工具。等效配置如下：

```yaml
compaction:
   experimentalContextManagement: true
```

此可选模式以本地上下文窗口
边界取代自动摘要再压缩。它也适用于没有显式模式或聚焦文本的 `/compact`。
显式上下文压缩模式和聚焦指令保留原有行为。

- `context_notes` 在省略 `text` 时读取当前笔记本，在提供 `text` 时
  替换它，并通过 `text: ""` 清空它。
- 笔记本修订是活动分支上的日志条目。只有最新
  可见修订会注入模型上下文，恢复或派生新会话后也是如此。
  上下文重置会清空可见笔记本。每次替换限于
  **16,384 个 UTF-8 字节**；超大写入会失败，不会替换笔记。
- `new_context` 请求在下一个安全工具循环边界滚动切换。滚动切换
  保留完整的近期工具调用/结果单元和笔记本，不调用
  摘要模型。接近自动阈值时，模型会收到
  每个窗口一次的提醒，要求保存其工作状态。
- `read` 和 `grep` 可以通过
  `history://current/full` 恢复原始消息和工具输出。文本包含稳定的条目 ID 和窗口
  边界。共享选择器可用，例如
  `history://current/full:1-200` 和 `history://current/full:raw:1-200`。
  查询、片段、尾部斜杠和额外路径组件都会被拒绝。
  拒绝将自身推理作为文本引用回传的模型（Claude）会获得
  不含助手推理的视图。
- 完整历史路由绑定到调用会话的当前分支。它
  绝不会回退到其他已注册智能体或磁盘会话搜索。
  现有的 `history://<id>` 路由保留其简洁会话记录行为。

实验性滚动切换要求有效工具集中包含 `context_notes`、
`new_context`、`read` 和 `grep`。未同时具备这四个工具的受限会话保留
原有维护方式。禁用该设置会恢复原有上下文压缩，并禁用
实验性工具和完整历史路由；现有笔记仍保留在日志
和提供方上下文中。

默认值为 `false`。这是持久化笔记
和可搜索历史的独立实现，仅以现有会话日志作为会话记录
存储。[^experimental-context-history]

[^experimental-context-history]:
    启用此设置无法撤销先前的剪枝或显式的破坏性历史
    操作。文本历史以标记表示
    图像。笔记本质量和及时更新仍由模型
    负责；此模式不会自动生成缺失的笔记。

### Shake 方法 \{#shake-method}

在 `compaction.methodOrder` 中包含 `shake` 会执行内联、本地缩减，而不是调用摘要模型。它使用受保护的近期 token 窗口和最小节省阈值，将符合条件的工具结果和大型围栏/XML 块替换为可恢复的 `local://N.log` 溢出引用。自动 shake 发出正常的自动上下文压缩事件，其中 `action: "shake"`。

对于阈值、输出不完整和溢出恢复，当 shake 无法回收足够的上下文以降至恢复区间以下时，会前进到下一个已配置方法；这可避免反复执行没有效果的 shake 循环。空闲 shake 不使用此回退，因为空闲计时器会在再次运行前重新检查用量。手动 `/shake` 是单独的、更激进的命令，可针对所有符合条件的历史。

`/shake thinking` 从活动分支中移除推理块和引用中断推理的隐藏笔记。它会保留当前提供方仍以原生方式重放的块，并将其报告为已保留。即使没有执行 shake，拒绝引用推理的模型在恢复会话时也不会收到这些笔记。

### Snapcompact 方法 \{#snapcompact-method}

在 `compaction.methodOrder` 中包含 `snapcompact` 会用本地、确定性的归档处理替代 LLM 摘要调用（来自 `@oh-my-pi/snapcompact` 的 `compact`）：

- 丢弃的历史会被序列化、压缩空白，并以适配模型的 PNG 帧排印，整个会话记录使用一种已安装字体。读取模型决定间距和帧宽度，高度紧贴排印的行。自动模式对 CJK 占比较高的文本使用具有 16×22 单元格的 `cjk16-bw` 网格。如果没有已安装字体能覆盖整个会话记录，正常的上下文压缩链会改用文本。显式 `/compact snapcompact` 绝不会将历史发送给摘要生成器。
- 序列化使归档保持高对话密度：工具结果按头部+尾部截断（默认 2,000 个字符，头部比例为 0.6），工具调用参数值分别按单值（500）和单次调用（2,000）限制，工具输出以暗灰色文字排印，使对话比工具噪声更显眼。所有预算和暗化均可通过 `SerializeOptions`（`toolResultMaxChars`、`toolArgMaxChars`、`toolCallMaxChars`、`truncateHeadRatio`、`dimToolResults`）配置。
- snapcompact 归档作为有界来源文本及渲染帧，持久化在 `CompactionEntry.preserveData.snapcompact` 下。每次重建上下文时，它会重建为有序的上下文压缩块：最旧一端的纯文本、中间的图像化部分，然后是最新一端的纯文本。条目的 `summary` 只是简短的恢复引导文本加上通常的文件操作列表。
- 后续上下文压缩会根据该有界来源文本（`Archive.text`）重新渲染，而不是盲目沿用旧 PNG。`maxFrames` 当前默认为 `MAX_FRAMES_DEFAULT`（80），且仅用作上限；当图像化中间部分较大时，它会在内部采用中央凹式处理（HQ/LQ/HQ），而时间顺序上的两端都保持为逐字文本。
- 不涉及模型、API 密钥或网络，因此 snapcompact 也可安全用于溢出恢复。它要求当前模型具备视觉能力（`model.input` 包含 `"image"`）；否则自动维护会跳过它，前进到下一个已配置方法。手动 `/compact` 遵循方法顺序，除非给出了自定义指令（这意味着进行定向 LLM 摘要）。
- 理由：形态表来自 `packages/snapcompact` 中的 snapcompact 200k-token 测试，对于具备视觉能力的模型，位图帧以低于原始文本的计费 token 成本保留了问答召回率。

归档大小根据上下文压缩触发阈值之下的空间确定，而不是根据窗口确定。该方案在解析后的阈值（已应用活动模型的 `compaction.modelThresholds` 条目）中，扣除系统提示词、工具、保留的近期轮次（按触发器的方式计数，不含不透明的推理重放签名）、归档文本，以及提示词前处理时的待处理提示词后，将剩余空间的一半分配给帧，让整个压缩后的上下文加上该提示词保持在阈值的 60% 以内，且绝不超出窗口能容纳的范围；它始终至少允许一帧（丢弃的文本能放入文本两端时则使用纯文本归档），因此即使这样仍没有空间，也只会记录警告并渲染一帧。当模型目录的 `image-tokenization` 规则已根据提供方计费标记为 `verified` 时，每帧按该形态在活动模型上的自身价格计入；否则取该价格与 `FRAME_TOKEN_ESTIMATE`（5,024）中的较高值。不论有多少空间，默认的 80 帧、部署目录的 `image-count-budget` 和帧负载预算（`frameDataBytesBudget`：部署目录中 `inline-image-byte-budget` 的一半，官方 Anthropic 端点为 60 MB，Codex 后端为 12 MB，其他情况为 3,000,000 字节；大小根据各形态的单帧估算确定）都会对结果施加上限。每次重建上下文都按活动模型的帧负载预算附加归档，每次请求都会丢弃超出请求模型预算的最旧归档帧，因此切换到预算更小的宿主模型绝不会发送更大的归档。60% 是大小目标，而不是保证：若渲染结果超过该目标或帧负载预算，会丢弃最旧帧，并以估算能同时满足两项限制的帧数重新渲染，最多两次（字节预算使用 `frames × budget / payload`），单帧归档无法继续缩小。结果随后由请求它的路径判断：仍超过字节预算或窗口的渲染结果会被拒绝/跳过，而不是作为不可用提示词提交；阈值处理中，如果结果（加上待处理提示词）高于 80% 恢复区间，会带着警告通知进入下一个已配置方法，或者，当后面除了 `shake` 以外没有其他方法可运行时，只要结果加上待处理提示词仍能装入窗口，就保留结果并发出警告通知；溢出和输出不完整恢复会重试轮次，只要求能装入窗口，而手动 `/compact` 只保留其缩减和窗口容纳检查。

### 维护进展防护 \{#maintenance-progress-guard}

自动维护在调度继续执行前，会检查重写后的上下文是否产生真实余量（通常达到或低于解析后阈值的 80%）。没有进展的处理可以尝试本地补救：以更小帧预算重新渲染现有 snapcompact 归档，将大型块省略为可恢复产物，或丢弃附加图像。归档补救可能截断沿用来源文本中最旧的部分；丢弃图像具有破坏性。如果维护仍无法产生余量，它会发出警告并阻止自动继续，而不是对相同的超大上下文循环处理。

### 显示会话记录 \{#display-transcript}

上下文压缩不再在视觉上重新开始对话。TUI 渲染**显示会话记录**（`buildSessionContext({ transcript: true })` / `AgentSession.buildTranscriptSessionContext()`）：按时间顺序显示每个路径条目，每次上下文压缩都在触发位置以内联细分隔线 `── 📷 compacted · ctrl+o ──` 显示。展开（ctrl+o）后显示摘要。只有 LLM 上下文在上下文压缩边界重置；分隔线上方的滚屏历史保持完整，跨会话恢复也是如此。

### 上下文压缩前剪枝 \{#pre-compaction-pruning}

上下文压缩检查之前，可能会运行工具结果剪枝（`pruneToolOutputs`）。

默认剪枝策略：

- 保护最新的 `40_000` 个工具输出 token。
- 要求总估算节省量至少为 `20_000`。
- 绝不清空低于 `50` token（`MIN_PRUNE_TOKENS`）的结果：`[Output truncated - N tokens]` 占位符约消耗 8 个 token，因此剪枝低于下限的结果反而会增加上下文，并无谓扰动提示词缓存。（已被取代和无用的结果保留各自规则：无用结果收集器已丢弃无节省候选项；被取代的读取则不论大小都为正确性而剪枝。）
- 绝不剪枝 `skill` 工具结果、`skill://` 路径的 `read` 结果，或活动计划引用文件的读取结果（通过 `AgentSession` 的计划保护添加）。

剪枝后的工具结果替换为：

- `[Output truncated - N tokens]`

如果剪枝改变了条目，会在作出上下文压缩决策前重写会话存储并刷新智能体消息状态。

### 无用结果省略 \{#useless-result-elision}

工具可以将已完成的结果标记为对上下文无用，例如零匹配的搜索，或等待窗口结束时只有仍在运行工作的 `wait`。标记源于工具结果（`AgentToolResult.useless`，通过 `ToolResultBuilder.useless()` 或直接在返回对象上设置），由智能体循环复制到持久化的 `ToolResultMessage`（绝不会与 `isError` 同时存在，错误始终优先），并在三处使用：

- **每轮过时结果处理**（`pruneSupersededToolResults`，由 `compaction.dropUseless` 控制，默认开启）：标记的结果会被清空为精确的占位符 `[Uneventful result elided]`（`USELESS_NOTICE`），使用与被取代读取相同的缓存感知时机：仅在候选项后缀较小（≤ 约 8k token），并且对于具有已知提示词缓存回溯范围的模型（目录 `prompt-cache-lookback`；Claude：20 个位置），位于保守界限内时，或会话空闲时间已超过提供方提示词缓存生命周期时执行。该界限通过会话的 `convertToLlm` 投影候选项发起的助手轮次、其工具结果批次及其后的全部内容（因此文件提及、带图像的命令输出和自定义消息图像拆分都按发送内容计入），并按 Anthropic 的方式计数位置（一连串连续的 `tool_use` 或 `tool_result` 块计为一个位置；从错误结果中提升出来的图像和填充轮次也计入）。它最多允许回溯范围减 6，为下一次请求输入和未计入的请求投影（孤立结果说明、重放的上下文压缩文件元数据、工具变更控制）保留 6 个位置。大于该余量的输入或投影仍可能导致一次缓存重建。没有已知回溯范围的模型会跳过该界限。阈值剪枝的热缓存防护应用相同限制。小于提示本身的结果绝不会被清空（没有节省），受保护工具也不受影响。
- **阈值剪枝**（`pruneToolOutputs`）：标记结果像被取代读取一样绕过近期保护窗口，并使用 `USELESS_NOTICE` 而不是 token 计数占位符。
- **摘要序列化**：`serializeConversation`（agent 和 snapcompact）从摘要生成器/归档输入中丢弃整个工具调用/结果对；该来源区域在摘要后本就会被丢弃，因此排除它不消耗缓存。

该标记绝不会到达提供方传输格式，且标记的配对绝不会从历史中移除（仅就地清空），因此工具调用/结果配对和提供方原生历史重放保持完整。

### 边界和截断点逻辑 \{#boundary-and-cut-point-logic}

`prepareCompaction()` 为估算、截断点选择，以及历史摘要、轮次前缀和保留消息区域构建同一个有效消息序列。

1. 找到最新的、其摘要或提供方原生历史可被活动模型复用的上下文压缩。
2. 遵循最新的 `/clear` `reset_boundary`：较新的重置会丢弃先前摘要，较旧的重置仍作为恢复保留消息的下界。
3. 对于本地摘要，恢复从 `firstKeptEntryId` 到先前上下文压缩记录的原始条目，然后追加该记录之后的条目。
4. 对于可复用的提供方原生历史，当 `providerReplayThroughEntryId` 指向较早快照时，从其后开始，但不跨越最新重置边界。这会恢复从快照到提交之间未覆盖的区间，而不是已被原生重放覆盖的原始消息。尾随的原生上下文压缩记录并不意味着该区间已被压缩。
5. 排除上下文压缩记录和其他非消息元数据。通过 `previousSummary` 单独传递先前摘要；保留承载消息的 `custom_message` 和 `branch_summary` 条目。
6. 使用测得的用量比例调整 `keepRecentTokens`，然后运行 `findCutPoint()`，并将同一序列划分为 `messagesToSummarize`、`turnPrefixMessages` 和 `recentMessages`。

更新本地摘要时，每条有效的原始消息都恰好属于这三个区域之一。例如，`summary(A) + B` 增长为 `summary(A) + B + C` 后，下次准备会同时分配 B 和 C，而不只是 C。新的 `firstKeptEntryId` 引用原始条目；准备过程不会移动、复制或重写日志条目。这是本地摘要准备保证，不是对提供方原生或推测性原生重放的端到端保证。

有效截断点包括：

- 角色为 `user`、`assistant`、`bashExecution`、`hookMessage`、`branchSummary`、`compactionSummary` 的消息条目
- `custom_message` 条目
- `branch_summary` 条目

硬性规则：绝不在 `toolResult` 处截断。

准备过程在选择保留消息边界之前，会过滤纯元数据（`model_change`、`thinking_level_change`、标签等）。这些记录仍保留在日志中，但不是对话输入。

### 拆分轮次处理 \{#split-turn-handling}

如果截断点不在用户轮次起点，上下文压缩会将其视为拆分轮次。

轮次起点检测将以下内容视为用户轮次边界：

- `message.role === "user"`
- `message.role === "bashExecution"`
- `custom_message` 条目
- `branch_summary` 条目

拆分轮次上下文压缩生成两个摘要：

1. 历史摘要（`messagesToSummarize`）
2. 轮次前缀摘要（`turnPrefixMessages`）

最终存储的摘要按以下方式合并：

```markdown
<history summary>

---

**Turn Context (split turn):**

<turn prefix summary>
```

### 摘要生成 \{#summary-generation}

`compact(...)` 根据序列化的对话文本构建摘要：

1. 通过 `convertToLlm()` 转换消息。
2. 使用目标模型偏好的方言，通过 `serializeConversationForSummary()` 序列化。
3. 包装在 `<conversation>...</conversation>` 中。
4. 可选地包含 `<previous-summary>...</previous-summary>`。
5. 可选地将扩展钩子上下文和活动记忆后端的上下文压缩上下文作为 `<additional-context>` 条目注入。
6. 使用 `SUMMARIZATION_SYSTEM_PROMPT` 执行摘要提示词。

超大的本地摘要输入会通过有预算限制的对话窗口折叠，并将每次摘要带入下一次更新。提供方上下文溢出拒绝会将被拒绝的窗口减半并重新规划，直至达到最小输入预算；其他失败则正常呈现。

提示词选择：

- 首次上下文压缩：`compaction-summary.md`
- 带先前摘要的迭代上下文压缩：`compaction-update-summary.md`
- 拆分轮次的第二次处理：`compaction-turn-prefix.md`
- 简短 UI 摘要：`compaction-short-summary.md`
- 交接文档：`handoff-document.md`（由 `generateHandoff(...)` 使用，而不是序列化上下文压缩）

远程摘要模式按顺序尝试（只要有下一阶段可用，每个阶段都会回退到下一阶段）：

- **V2 流式 Responses 上下文压缩**（首先尝试，通过 `compaction.remoteStreamingV2Enabled` 默认开启）：对于符合条件的模型，即 `shouldUseCompactionV2Streaming(...)` 判定通过的模型：使用 `openai-responses`、`azure-openai-responses` 或 `openai-codex-responses` API，具备 `remoteCompaction.v2StreamingEnabled`（Amazon Bedrock 的 OpenAI 路由默认开启，见下文），且 Responses 端点可解析，上下文压缩会将完整对话，包括提供方原生工具调用历史重放，转发到模型的常规 Responses 流式端点，并在输入末尾附加 `compaction_trigger` 项，要求恰好返回一个流式 `compaction` 输出项。请求携带会话路由和提示词缓存标识符（路由/会话 id 头部加上 `prompt_cache_key`），并以与正常轮次相同的方式解析模型的推理力度。替代历史采用 Codex 风格：先保留 `compaction.v2RetainedMessageBudget` 预算内的真实用户消息（默认 `64000` token，限制在此上限），再附加上下文压缩项，存储在 `preserveData.openaiRemoteCompaction` 中（版本为 `"v2"`）。瞬时流错误会在五分钟超时（`V2_COMPACTION_TIMEOUT_MS`，与 V1 相同）内，以指数退避最多重试 `V2_COMPACTION_MAX_RETRIES`（`2`）次；用户中止绝不会重试。
- **V1 原生 `/responses/compact`**：对于 OpenAI 模型、具有显式兼容 `remoteCompaction.endpoint` 的 OpenAI Codex 模型，以及 Amazon Bedrock OpenAI 路由上的 `openai-responses` 模型（`shouldUseOpenAiRemoteCompaction`），当远程上下文压缩已启用且 V2 未运行（不符合条件或失败）时，上下文压缩会尝试提供方原生 `/responses/compact` 端点。它在 `preserveData.openaiRemoteCompaction` 中保留提供方替代历史。原生失败会呈现其传输错误，而不是静默切换到通用摘要生成，除非设置了 `compaction.remoteEndpoint`，此时摘要生成会继续回退到该端点/本地摘要生成。
- **Anthropic 按需上下文压缩**（`compact-2026-09-04` beta）：当远程上下文压缩已启用且没有适用的 OpenAI 通道时，适用于 beta 支持的模型系列（`compat.supportsServerCompaction`，一条目录规则：`anthropic`、`google-vertex`、`amazon-bedrock` 和 `bedrock-mantle` 提供方上的 Opus 4.6+、Sonnet 4.6+、Fable/Mythos 5+），且有效端点实现了该功能（`shouldUseAnthropicNativeCompaction`：Claude API、Vertex、Foundry、Claude Platform on AWS 和 Amazon Bedrock 的 `/anthropic` 路由；其他提供方访问前四者之一时需要 `remoteCompaction.enabled`；其他 URL 仍被排除，除非它是模型自身配置的 `baseUrl`，且模型通过 `remoteCompaction: { api: "anthropic-messages", enabled: true }` 声明它）。同一声明也允许将模型分发到 Anthropic Messages 的扩展自定义 api（绝不会是内置适配器）使用此通道：其上下文压缩请求像任何轮次一样经过该自定义 api 自身的流，它委托的 Anthropic 提供方应用相同的模型和端点策略，而流在该委托对象上解析先前控制项留下的有效力度（`resolveAnthropicCompactionEffort`）。上下文压缩将待摘要历史与实时对话的系统提示词、工具和思考设置一起发送，并添加一个携带 harness 摘要提示词的顶层 `compaction: { type: "summarize", instructions }` 参数。API 返回一个带签名的 `compaction` 块（`stop_reason: "compaction"`），以 `anthropicCompaction` 负载呈现。其纯文本摘要成为条目的 `summary`（加上文件操作列表）**以及** `preserveData.anthropicCompaction`；后续发往支持上下文压缩端点的请求会将该块原样作为第一个块发回，而其他所有提供方读取摘要文本。块中带签名的 `tool_changes`（摘要范围内工具添加/移除的净变化）会随其一起持久化并逐字重放。截断点后保留的尾部像本地摘要一样从会话条目重放。不含签名摘要的响应，例如拒绝、输出限制，或摘要生成期间的工具调用，与 OpenAI 通道一样视为原生失败。较早的 `compact-2026-01-12` 阈值 beta 写入的块（`encryptedContent`）仅可重放。
   - 在 Amazon Bedrock 上，使用 `https://bedrock-runtime.<region>.amazonaws.com/anthropic` 或 `https://bedrock-mantle.<region>.api.aws/anthropic`（[设置](./models.md#claude-on-bedrocks-anthropic-messages-api-anthropic)）；下文为 OpenAI 路由列出的 FIPS 和 PrivateLink 主机名也适用。门控读取从此类 `baseUrl` 检测出的 `compat.bedrockMessagesApi`；可在 `models.yml` 中设置它以纳入代理或 `ANTHROPIC_BASE_URL` 重路由，或设为 `false` 以排除某个 Bedrock 路由。
   - 模型卡片列出该 beta 的 Bedrock Converse 模型（`bedrock-converse-stream`）（`compat.supportsServerCompaction`，一条 `providers/amazon-bedrock.kdl` 规则：Haiku 4.5/5.5、Sonnet 5/5.5、Opus 4.7/4.8/5/5.5）通过携带相同 Anthropic Messages 请求体的 Bedrock Runtime `InvokeModelWithResponseStream` 旁路请求执行上下文压缩；Converse 本身拒绝该 beta（[AWS 上下文压缩指南](https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-compaction.html)）。普通轮次保持使用 Converse 并读取摘要文本；签名块仅重放给后续上下文压缩请求。AWS bedrock-runtime 源站（公共、FIPS、PrivateLink）默认符合条件；其他任何 `baseUrl` 都视为可能仅实现 Converse 的网关，需要 `remoteCompaction.enabled: true`。`remoteCompaction.enabled: false` 会将模型排除。
- **自定义远程端点**：如果设置了 `compaction.remoteEndpoint` 且启用了远程上下文压缩，本地摘要生成会以 POST 发送两种传输格式之一：
   - 自定义 omp 摘要生成器端点接收 `{ systemPrompt, prompt, maxTokens }`，并且必须返回至少包含 `{ summary }` 的 JSON。
   - 路径以 `/chat/completions` 结尾的 OpenAI 兼容端点接收 `{ model, messages, stream: false, max_tokens }`，其中 `messages` 包含一条系统提示词和一条用户提示词。摘要从 `choices[0].message.content` 读取，因此 llama.cpp 和 vLLM 等自托管服务器无需单独的摘要适配层即可充当远程上下文压缩器。

Amazon Bedrock 的 OpenAI 路由无需主动启用就可获得两个 OpenAI 通道。对于任何具有 `api: openai-responses` 的提供方 id，会从模型 `baseUrl`（`packages/catalog/src/hosts.ts` 中的 `isBedrockOpenAIUrl`）检测路由：`bedrock-runtime` 或 `bedrock-mantle` 端点上的 HTTPS `/openai/…` 路径，或 Mantle 文档中的 `/v1` 基础路径。端点主机名包括公共名称（`bedrock-runtime.<region>.amazonaws.com`、FIPS `bedrock-runtime-fips.<region>.amazonaws.com`、`bedrock-mantle.<region>.api.aws`，包括内置 `bedrock-mantle` 提供方的 `{region}` 模板）和 AWS PrivateLink 特定端点名称（`<vpce-id>[-<az>].bedrock-runtime[-fips].<region>.vpce.amazonaws.com` 或 `….bedrock-mantle.<region>.vpce.amazonaws.com`）；使用私有 DNS 的 VPC 端点会在公共名称上响应（[Amazon Bedrock 支持的端点](https://docs.aws.amazon.com/bedrock/latest/userguide/endpoints.html)、[Bedrock 服务端点](https://docs.aws.amazon.com/general/latest/gr/bedrock.html)、[Bedrock VPC 端点](https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-interface-endpoints.html)、[PrivateLink DNS 名称](https://docs.aws.amazon.com/vpc/latest/privatelink/privatelink-access-aws-services.html)）。其他 Bedrock 路径，例如 `/anthropic`、bedrock-runtime 上的 `/v1`，或 Converse 根路径，均不算在内。仅在这些 Bedrock 路由上，两种上下文压缩请求都由 `prepareBedrockCompactionRequest`（`packages/agent/src/compaction/bedrock.ts`）构造成正常 Bedrock 轮次的形态：解析配置的头部，应用传输 fetch（提供方代理、额外 CA、User-Agent、请求记录），并运行提供方自身的请求钩子。因此，内置 `bedrock-mantle` 提供方会填入 `{region}`，并使用其 bearer token 或 SigV4 签名。其他提供方的上下文压缩请求保留各自的传输。要在 `models.yml` 中对某个模型或提供方关闭默认行为，设置 `remoteCompaction.enabled: false`（两个通道）或 `remoteCompaction.v2StreamingEnabled: false`（仅 V1）。AWS 文档说明两个端点均支持 Responses API（[Responses API](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-responses-api.html)），OpenAI 也列出 Bedrock 的功能覆盖范围（[Amazon Bedrock 中的 OpenAI 模型](https://developers.openai.com/api/docs/guides/amazon-bedrock)）。这些页面均未提到上下文压缩。因此，支持情况改为通过实际在线验证确认：2026-09-25 使用 Bedrock API 密钥（不是 SigV4）在公共 `/openai/v1` 基础路径上，在 `us-east-1`，V1 `POST {base}/responses/compact` 返回 `object: "response.compaction"`，V2 在 `bedrock-runtime`（`us.openai.gpt-6-astra`、`-sol`、`-luna`）和 `bedrock-mantle`（`openai.gpt-6-sol`、`gpt-6-luna`、`gpt-5.6-terra`、`gpt-5.5`、`gpt-5.4`）上流式返回了 `compaction` 输出项。FIPS、PrivateLink 和 Mantle `/v1` 基础路径通向相同服务，但未进行在线验证。Mantle 上的 `openai.gpt-oss-120b` 不支持 Responses API。

原生远程上下文压缩（V2、V1 或 Anthropic）成功时，会完全跳过本地 LLM 摘要生成。对于 OpenAI 通道，持久化历史位于提供方重放负载中，存储的 `summary` 是占位引导文本加文件操作列表；Anthropic 通道存储真实摘要文本，因此任何提供方的后续上下文压缩都可在其基础上继续。

原生上下文压缩从普通本地摘要开始时，该摘要会作为上下文消息与准备好的对话一同包含。后续原生处理复用提供方负载，而不是重新注入其占位摘要。snapcompact 来源文本保留其独立的归档迁移路径。

对于推测性原生上下文压缩，`providerReplayThroughEntryId` 记录快照的最后一个条目，而不是更晚的提交位置。上下文重建和下一次上下文压缩准备都会包含这两个位置之间追加的消息，随后是提交后消息。原生负载和未覆盖区间各重放一次；当 `/clear` 取代该上下文压缩时，两者都会被丢弃。

顾问运行时为后续维护保留原生 `preserveData`，并将其提供方负载附加到内存中的上下文压缩摘要，用于下一次模型请求。原生重放已包含保留尾部，因此顾问不会再将该尾部作为原始消息追加。本地摘要仍单独保留近期消息。顾问请求使用共享消息转换器，因此文本上下文压缩摘要和原生负载都能到达提供方。

### 交接生成 \{#handoff-generation}

`packages/agent/src/compaction/compaction.ts` 导出 `generateHandoff(...)` 和 `generateHandoffFromContext(...)`。Coding-agent 通过 `SessionHandoff` 使用感知上下文的函数：旁路请求使用基础系统提示词、规范化工具、转换后的实时历史和实时提示词缓存键，并使用唯一的旁路会话 id，以及尾随的、归属于智能体的 `user` 交接提示词。它以 `toolChoice: "none"` 开始，仅在明确的工具选择兼容性拒绝后使用 `"auto"` 重试一次。只返回连接后的文本块；绝不会分发工具。见[交接管线](./handoff-generation-pipeline.md)。

分发前，交接旁路请求在本地统计准备好的系统提示词、工具和消息。它忽略提供方用量报告，因为这些报告低估了在不可读原生上下文压缩背后重新展开的历史。当该计数使目标模型声明的窗口中没有空间容纳最小输出时，自动维护会前进到下一个已配置方法，不发送请求，而手动 `/handoff` 会报告大小错误。

`/handoff [focus]` 是 `/compact handoff [focus]` 的别名。它根据会话记录快照准备交接摘要，不中断实时响应，也不阻塞后续消息。准备就绪后，它会在工具轮次边界或空闲时通过标准 `CompactionEntry` 提交应用。`firstKeptEntryId` 始终锚定到快照，因此当前分支的近期历史和生成期间追加的所有消息都会逐字保留。重置、移除快照的分支更改或更新的上下文压缩会使结果失效。

交接输出受摘要预算（`MAX_SUMMARY_TOKENS`）限制，因此即使服务器没有自身输出限制，也仍会以 `stopReason: "length"` 结束失控增长的文档，这会使交接失败。`compaction.handoffTimeoutSeconds`（默认 `0`，关闭）还限制实际经过时间：到期时交接会失败而不是取消，自动维护会尝试下一个已配置方法，而 `/handoff` 会报告 `Handoff timed out after Ns`。默认关闭它是因为慢速本地模型完全可能需要很多分钟才能写出有效文档。

启用 `compaction.handoffSaveToDisk` 时，**自动触发的**交接还会在持久化会话的产物目录中写入 `handoff-<ISO timestamp>.md`。此设置不会写入手动交接，非持久化会话也没有产物目录。

### 摘要中的文件操作上下文 \{#file-operation-context-in-summaries}

上下文压缩通过助手工具调用跟踪累积文件活动：

- `read(path)` → 读取集合
- `write(path)` → 修改集合
- `edit(path)` → 修改集合

累积行为：

- 仅当先前条目由 pi 生成（`fromExtension !== true`）时，才包含先前上下文压缩详情。
- 拆分轮次中，也包含轮次前缀文件操作。
- `details.readFiles` 排除同时被修改的文件；`details.modifiedFiles` 携带其余文件（持久化形态不变）。

文件列表是按组、折叠前缀的目录树（find 工具形态），每个文件带有访问标记：`(Read)` 表示只读文件，`(Write)` 表示从未读取的已修改文件，`(RW)` 表示也存在于累积读取集合中的已修改文件。最多 20 个文件，并带有 `[…N files elided…]` 行。LLM 摘要策略将它作为 `<files>` 标签追加（通过 `upsertFileOperations`）；snapcompact 则在其摘要模板内将它渲染为 `FILES` 小节。

```xml
<files>
# packages/agent/src/compaction/
compaction.ts (Read)
utils.ts (RW)
## prompts/
file-operations.md (Write)
</files>
```

早期版本编写的摘要中遗留的 `<read-files>`/`<modified-files>` 标签会在重新追加前被移除（连同 `<files>` 一起），因此旧摘要会在下一次上下文压缩时自动修复。

### 持久化与重新加载 \{#persist-and-reload}

生成摘要（或由钩子提供摘要）后，智能体会话会：

1. 通过 `appendCompaction(...)` 追加 `CompactionEntry`；handoff 方法在同一会话上将生成的文档作为该条目的摘要提交。
2. 通过 `buildDisplaySessionContext()` 从活动叶节点重建显示上下文。
3. 用重建的上下文替换实时智能体消息。
4. 从重建的分支同步活动待办阶段，并关闭历史记录已被重写的提供方会话。
5. 发出 `session_compact` 钩子事件。

## 分支摘要流水线 \{#branch-summarization-pipeline}

分支摘要与树导航相关，而非由 token 溢出触发。

### 触发 \{#trigger}

在 `navigateTree(...)` 期间：

1. 使用 `collectEntriesForBranchSummary(...)` 计算从旧叶节点到共同祖先之间被放弃的条目。
2. 如果调用方请求了摘要（`options.summarize`），则在切换叶节点前生成摘要。
3. 如果存在摘要，则使用 `branchWithSummary(...)` 将其附加到导航目标上。

实际操作中，启用 `branchSummary.enabled` 后，通常由 `/tree` 流程驱动这一过程。

### 分支切换示意图 \{#branch-switch-shape-visual}

```text
Tree before navigation:

         ┌─ B ─ C ─ D (old leaf, being abandoned)
    A ───┤
         └─ E ─ F (target)

Common ancestor: A
Entries to summarize: B, C, D

After navigation with summary:

         ┌─ B ─ C ─ D (abandoned branch, unchanged)
    A ───┤
         └─ E ─ F ─ [summary of B,C,D] (new leaf)
```

### 准备与 token 预算 \{#preparation-and-token-budget}

`generateBranchSummary(...)` 按以下方式计算预算：

- `tokenBudget = (model.contextWindow || 128000) - branchSummary.reserveTokens`

随后，`prepareBranchEntries(...)` 会：

1. 第一遍：从所有待摘要条目收集累计文件操作，包括先前由 pi 生成的 `branch_summary` 详情。
2. 第二遍：按从新到旧的顺序遍历，添加消息，直到达到 token 预算。
3. 优先保留近期上下文。
4. 为保持连续性，在预算边界附近仍可能纳入较大的摘要条目。

在分支摘要输入中，上下文压缩条目会作为消息（`compactionSummary`）纳入。

### 摘要生成与持久化 \{#summary-generation-and-persistence}

分支摘要会：

1. 使用 `serializeConversationForSummary()` 和目标模型偏好的方言，对选中的消息进行转换和序列化。
2. 将其包裹在 `<conversation>` 中。
3. 如果提供了自定义指令，则使用自定义指令，否则使用 `branch-summary.md`。
4. 使用 `SUMMARIZATION_SYSTEM_PROMPT` 调用摘要模型，输出限制为 2,048 token。
5. 在开头添加 `branch-summary-preamble.md`。
6. 追加文件操作标签。

结果存储为 `BranchSummaryEntry`，可附带详情（`readFiles`、`modifiedFiles`）。

## 扩展与钩子接入点 \{#extension-and-hook-touchpoints}

### `session_before_compact` \{#session_before_compact}

上下文压缩前钩子。

可以：

- 取消上下文压缩（`{ cancel: true }`）：结束整次尝试，跳过 `methodOrder` 中所有剩余方法；自动尝试会以 debug 级别记录否决，并在 `auto_compaction_end` 中报告 `aborted: true`
- 提供完整的自定义上下文压缩载荷（`{ compaction: CompactionResult }`）

钩子的 `customInstructions` 仅携带公开的用户关注点。内部摘要生成指导（目前是计划模式下“批准并压缩上下文”的提炼提示词）通过 `CompactOptions` 上独立的 `internalGuidance` 通道传递，只到达原生摘要生成过程，绝不会传给此钩子或 `session.compacting`；两者都设置时，摘要生成器使用 `internalGuidance`，而钩子仍看到公开的 `customInstructions`（issue #4359）。

### `session.compacting` \{#sessioncompacting}

默认上下文压缩的提示词/上下文自定义钩子。

可以返回：

- `prompt`（覆盖基础摘要提示词）
- `context`（注入 `<additional-context>` 的额外上下文行）
- `preserveData`（存储在上下文压缩条目上）

### `session_compact` \{#session_compact}

上下文压缩后通知，包含已保存的 `compactionEntry` 和 `fromExtension` 标志。

### `session_before_tree` \{#session_before_tree}

在树导航时、默认分支摘要生成之前运行。

可以：

- 取消导航
- 提供自定义的 `{ summary: { summary, details } }`，在用户请求生成摘要时使用

### `session_tree` \{#session_tree}

导航后事件，提供新旧叶节点以及可选的摘要条目。

## 运行时行为与失败语义 \{#runtime-behavior-and-failure-semantics}

- 手动上下文压缩会先中止当前智能体操作。如果该中止打断了正在进行的轮次，则在摘要提交后恢复该轮次；如果因无须操作而拒绝压缩（会话过小/已经压缩），则立即恢复，因为此轮处理未更改历史记录。恢复时优先使用队列中的引导/后续消息，否则使用自动继续提示词。钩子取消或摘要生成器失败不会恢复轮次。当 `compaction.autoContinue` 为 `false` 或调用方传入 `suppressContinuation` 时，会跳过恢复（计划模式批准会自行派发执行轮次）。在空闲时发起的手动上下文压缩绝不会启动轮次。在上下文压缩运行时提交的提示词会等待压缩完成，如果它启动或排入了一个轮次，就会取代恢复操作；本地处理的扩展/自定义命令会交回恢复权，除非它触发的轮次（`pi.sendMessage(..., { triggerTurn: true })`、`pi.sendUserMessage()`）、后续提示词或任何其他轮次先启动。在这种恢复仍被暂缓时启动的第二次手动上下文压缩会接管它。
- 在 TUI 中，运行期间使用后续消息按键（`app.message.followUp`，Ctrl+Q / Ctrl+Enter）发送 `/compact` 不会中止运行：请求会在“After yield”队列中等待，并在运行结束后执行。在它之后发送的后续消息会等待此次上下文压缩；在它之前发送的后续消息则先运行。Alt+Up 会将其移出队列并放回编辑器；停止运行（Esc）、切换会话或转到树的其他分支时，会将它与排在其后的后续消息一起交回。Enter 仍保留立即中止并压缩的行为，空闲时两种按键都会立即压缩。
- `abortCompaction()` 会取消手动上下文压缩、自动上下文压缩和 handoff 生成控制器。
- 自动上下文压缩会发出开始/结束会话事件，用于更新 UI/状态。
- 自动上下文压缩可以尝试多个候选模型并重试暂时性故障；重试延迟较长时，如有下一个候选模型，则优先尝试它。
- 溢出错误不进入通用重试路径，因为它们由上下文提升/上下文压缩处理。
- 如果自动上下文压缩失败：
   - 溢出路径发出 `Context overflow recovery failed: ...`
   - 输出不完整路径发出 `Incomplete response recovery failed: ...`
   - 阈值/空闲路径发出 `Auto-compaction failed: ...`
- 自动摘要候选结果（包括已就绪的推测结果）会在提交前检查是否缩减上下文。无法缩减的候选结果会让流程转向下一个已配置的方法；如果都没有进展，则不提交上下文压缩条目。在保留历史记录的切分点向前推进之前，轮次中途重试（包括新的推测请求）始终受到抑制。
  原生 Responses 重放统计的是可见的替换历史记录和图像估算值，而非不透明的加密状态字节。两侧都使用重建后的活动上下文，因此 `/clear` 之前的历史记录无法抬高缩减基线。这些是本地估算值，不是提供方计费的 token 数。
- 分支摘要可以通过中止信号取消（例如 Escape），返回已取消/已中止的导航结果。

## 设置与默认值 \{#settings-and-defaults}

定义于 `packages/coding-agent/src/session/context-settings.ts`：

- `compaction.enabled` = `true`
- `compaction.experimentalContextManagement` = `false`。选择启用持久笔记、与分支绑定的原始历史记录检索，以及本地上下文窗口滚动切换；切换此项会在运行中的会话里添加或移除 `context_notes`/`new_context`。
- `compaction.methodOrder` = `["remote", "snapcompact", "handoff", "shake", "soft"]`。`remote` 在可用时使用提供方原生的服务端上下文压缩（OpenAI Responses compact、Anthropic compaction beta，包括 Bedrock Converse 的 Runtime 侧请求）；方法不可用或失败时会转向下一个偏好方法。
- `compaction.asyncEnabled` = `true`。异步（推测式）上下文压缩：当上下文进入阈值前区间 `[threshold − lead, threshold)`（lead = `clamp(threshold × 0.125, 8192, 32000)`）时，维护过程会基于分支快照，为首个已配置的、由 LLM 支持的方法（`remote`、`handoff` 或 `soft`）启动后台摘要生成，并通过独立会话 id 与实时轮次隔离。当真正跨过阈值时，会立即提交已就绪的结果，隐藏摘要生成延迟；快照后的轮次会原样追加在摘要之后。分支前缀发生变化（新的上下文压缩、重置边界、`/tree` 导航）、活动模型不再能读取提供方原生重放载荷，或自计算以来上下文增长超过 `keepRecentTokens` 时，会丢弃已就绪的结果（由新的推测替代）。扩展注册了 `session_before_compact` 时，会跳过推测。推测运行时，状态行中的自动压缩图标会脉动；结果就绪时则保持强调色。
- `compaction.reserveTokens` 默认未设置。有效预留量为 `max(floor(contextWindow × 0.15), configuredReserve ?? 16384)`。如果未设置时的默认值对小窗口不切实际，或有效预留量达到/超过整个窗口，预算检查会使用按比例的预留量。其他情况下，显式预留量仍保留 15% 的下限。
- `compaction.summaryMaxTokens` 默认未设置，因此常规历史摘要最多可输出 `min(floor(0.8 × reserve), 16384)` token。正值会替代常规摘要的该预算，并受摘要模型输出上限（`maxTokens`）约束；轮次前缀摘要和提供方原生（`remote`）摘要保留默认值。当密集会话因摘要不完整（达到长度上限）而停止压缩时，可调高此值。
- `compaction.keepRecentTokens` = `20000`。准备阶段会限制此预算，使压缩后的上下文落在恢复区间（触发值的 80%）内：至多为 `0.8 × trigger − reserveFloor`，其中 `reserveFloor` 是有效预算预留量与 `compaction.reserveTokens`（未设置时为 `16384`）中较小的值；如果仅下限就填满该区间，则取区间的一半。此限制在按实测用量调整前应用，因此对于小窗口或受提供方限制的窗口，较低的触发值会保留更少的历史记录，而不是立即再次压缩。
- `compaction.autoContinue` = `true`
- `compaction.midTurnEnabled` = `true`；`false` 值适用于配置它的会话，而不适用于派生的子代理，每个子代理仍保留运行中检查，以便其单轮任务仍在配置的阈值处执行上下文压缩。
- `compaction.handoffSaveToDisk` = `false`
- `compaction.handoffTimeoutSeconds` = `0`（无限制；正值会使生成时间超过该时长的 handoff 失败，从而让自动维护尝试下一个方法）
- `handoff` 方法通过实时缓存侧请求流水线生成交接文档，并在当前会话上提交。`/handoff` 和 `/compact handoff` 可手动选择该方法。
- `compaction.remoteEndpoint` = `undefined`
- `compaction.remoteStreamingV2Enabled` = `true`
- `compaction.v2RetainedMessageBudget` = `64000`
- `compaction.thresholdPercent` = `-1`，`compaction.thresholdTokens` = `-1`；正的固定 token 上限优先于百分比，否则使用基于预留量的阈值：窗口减去其预留量，最多为 `DEFAULT_THRESHOLD_CEILING_TOKENS`（690,000），因此 1M 级窗口会在 690K 时压缩。
- `compaction.modelThresholds` = `{}`；`provider/model-id` 或 `provider/…*` 前缀 → 在该模型活动期间，提供一个供阈值策略替代窗口进行缩放的 token 基数（忽略全局 `thresholdTokens`）、一个固定触发值（`"f90000"`），或一个替代两个阈值的百分比。可在 `/models` 的 Roles 视图（`k`）中编辑。参见[设置](./settings.md#context-compaction-and-memory)。
- `task.agentCompactionThresholdOverrides` = `{}`；精确名称的 task/eval 智能体 → token 数（`90000`）或百分比（`"80%"`），仅替代该智能体的两个阈值。参见[设置](./settings.md#context-compaction-and-memory)。
- `compaction.idleEnabled` = `false`
- `compaction.idleThresholdTokens` = `200000`
- `compaction.idleTimeoutSeconds` = `300`（回退值，除非已确认的 1h 提示词缓存条目确定了时序）
- `compaction.supersedeReads` = `true`
- `compaction.dropUseless` = `true`
- `snapcompact.systemPrompt` = `"none"`（`"agents-md"` 和 `"all"` 可选择启用临时系统提示词图像化）
- `snapcompact.toolResults` = `false`（对较大的工具结果进行临时图像化，包括最新的一个；`read` 结果保持文本形式，除非模型目录规则设置了 `snapcompact-image-reads`（Opus 5.5+）。图像化的 `read` 会把每行的前导缩进绘制为计数括号（`[»2]` 表示两个制表符，`[·4]` 表示四个空格），因为图像帧会折叠空白；同时在图像帧旁以文本保留其 `[path#TAG]` 标头，使编辑时能同时复制两者。规划器会让结果保持首次发送时的形式，直到 `snapcompact.*` 设置、模型或更早的历史记录发生变化，或后续图像将请求推过提供方的图像数量上限；下游请求字节限制仍可移除较旧的内联图像帧，与处理任何内联图像一样）
- `snapcompact.shape` = `"auto"`
- `branchSummary.enabled` = `false`
- `branchSummary.reserveTokens` = `16384`

这些值在运行时由 `AgentSession`、`SessionMaintenance` 以及上下文压缩/分支摘要模块使用。
