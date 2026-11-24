# 上下文压缩参考 \{#compaction-reference}

本页介绍自动压缩、分支摘要、持久化条目和扩展钩子。用户操作见[会话与上下文](./sessions.md#manage-conversation-context)。

[Pi 仓库](https://github.com/earendil-works/pi)中的源码：

- [`packages/coding-agent/src/core/compaction/compaction.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/compaction.ts)：自动压缩逻辑。
- [`packages/coding-agent/src/core/compaction/branch-summarization.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/branch-summarization.ts)：分支摘要。
- [`packages/coding-agent/src/core/compaction/utils.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/utils.ts)：通用函数，包括文件跟踪与序列化。
- [`packages/coding-agent/src/core/session-manager.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/session-manager.ts)：条目类型（`CompactionEntry`、`BranchSummaryEntry`）。
- [`packages/coding-agent/src/core/extensions/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/extensions/types.ts)：扩展事件类型。

项目内的 TypeScript 类型定义见 `node_modules/@earendil-works/pi-coding-agent/dist/`。

## 概览 \{#overview}

Pi 提供两种摘要机制：

| 机制 | 触发条件 | 用途 |
|---|---|---|
| 上下文压缩 | 上下文超出阈值，或运行 `/compact` | 总结旧消息以释放上下文空间。 |
| 分支摘要 | 使用 `/tree` 导航 | 切换分支时保留上下文。 |

两种机制使用相似的结构化格式，并累计跟踪文件操作。生成摘要的请求禁用提示词缓存写入，因为这些一次性提示词通常不会复用。

## 上下文压缩 \{#compaction}

### 触发条件 \{#when-it-triggers}

下列条件满足时，Pi 触发自动压缩：

```
contextTokens > contextWindow - reserveTokens
```

`reserveTokens` 默认为 16384 个 token，可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置。它只决定何时开始压缩。生成摘要的请求使用模型的输出上限；如有需要，Pi 会降低该上限，使输入和输出都能容纳在上下文窗口内。

一次智能体运行包含多个轮次时，Pi 在工具执行完毕、结果已追加之后检查用于模型的正式上下文投影，再开始下一次助手回复。超过阈值时，Pi 在 `prepareNextTurn` 中执行压缩，然后在 `turn_start` 前进行原有的补查，以处理可能已到达的引导消息。如果刚结束的工具批次会终止运行，且没有排队消息需要进一步回复，Pi 会跳过这次轮次间检查。Pi 还会在处理新的用户提示词前检查，并在底层运行结束后恢复最后一次尝试中的溢出。

如果模型提供方报告上下文溢出错误，或运行提前以 `stopReason: "length"` 结束，Pi 可以选择进行一次压缩并重试的恢复尝试。如果因长度限制而结束的回复包含工具调用，Pi 会保留为这些调用合成的失败工具结果，继续使用常规的工具与队列调度器，不会强制结束运行。

也可用 `/compact [instructions]` 手动触发。通过可选的指令指定摘要的重点。

### 压缩流程 \{#how-it-works}

1. **确定截断点**：从最终的会话投影向前回溯，累计估算 token 数，达到 `keepRecentTokens` 时停止。默认值为 20k，可在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置。
2. **提取消息**：收集从上次保留边界（或会话开头）到截断点之间的投影消息。
3. **生成摘要**：调用大语言模型按结构化格式总结消息。已有上一份摘要时，将其作为本次迭代的上下文。
4. **追加条目**：保存 `CompactionEntry`，其中包含摘要和 `firstKeptEntryId`。
5. **重建上下文**：会话为下次请求重建上下文，使用摘要和从 `firstKeptEntryId` 开始的消息。

```
Before compaction:

  entry:  0     1     2     3      4     5     6      7      8     9
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┘
                └────────┬───────┘ └──────────────┬──────────────┘
               messagesToSummarize            kept messages
                                   ↑
                          firstKeptEntryId (entry 4)

After compaction (new entry appended):

  entry:  0     1     2     3      4     5     6      7      8     9     10
        ┌─────┬─────┬─────┬──────┬─────┬─────┬──────┬──────┬─────┬─────┬─────┐
        │ hdr │ usr │ ass │ tool │ usr │ ass │ tool │ tool │ ass │ tool│ cmp │
        └─────┴─────┴─────┴──────┴─────┴─────┴──────┴──────┴─────┴─────┴─────┘
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

重复压缩时，待摘要的范围从上次压缩的保留边界（`firstKeptEntryId`）开始，不从压缩条目本身开始。如果在当前路径上找不到该保留条目，则从上次压缩条目之后的条目开始。如果压缩不保留任何消息，会把自己的 ID 记为 `firstKeptEntryId`；下一次压缩从该条目之后开始。这使得上次压缩保留下来的消息也会纳入本次摘要。Pi 还会根据重建后已应用上下文编辑的会话投影重新计算 `tokensBefore`，然后写入新的 `CompactionEntry`。这样，token 数能反映实际要替换的压缩前上下文。被排除的原始条目仍会保存，但不参与截断点选择、摘要、检查点或 token 估算。

### 溢出与长度限制的恢复顺序 \{#overflow-and-length-recovery-ordering}

恢复不会改变原有的生命周期和队列顺序。`turn_end` 和 `agent_end` 仍可查看已经结束的尝试。随后，运行后的恢复流程会先修复持久化模型上下文，再发起新的尝试：

```text
persist final assistant response
→ extension/public turn_end
→ extension/public agent_end
→ append context_edit omissions for the selected attempt
→ for overflow/length: run session_before_compact and append compaction on success
→ start the retry as a fresh run
```

如果恢复压缩失败或被取消，Pi 会保留排除条目的编辑，不追加压缩条目，也不安排内部重试。已排队的工作仍按常规的引导消息和后续消息规则处理。恢复处理完成后，`agent_before_settle` 看到的是已修复的投影。原始会话历史、导出结果、计费用量汇总和历史搜索扩展仍可检查被排除的尝试。

### 截断点落在用户消息范围内 \{#split-user-message-spans}

一个用户消息范围始于一条用户消息，包含下一条用户消息前的所有轮次。通常，Pi 在用户消息的边界处截断。

如果一个用户消息范围超出 `keepRecentTokens`，截断点会落在该范围内的一条助手消息上，此时用户消息范围被分割：

```
Split user-message span (one span exceeds budget):

  entry:  0     1     2      3     4      5      6     7      8
        ┌─────┬─────┬─────┬──────┬─────┬──────┬──────┬─────┬──────┐
        │ hdr │ usr │ ass │ tool │ ass │ tool │ tool │ ass │ tool │
        └─────┴─────┴─────┴──────┴─────┴──────┴──────┴─────┴──────┘
                ↑                                     ↑
         turnStartIndex = 1                  firstKeptEntryId = 7
                │                                     │
                └──── turnPrefixMessages (1-6) ───────┘
                                                      └── kept (7-8)

  isSplitTurn = true
  messagesToSummarize = []  (no earlier user-message spans)
  turnPrefixMessages = [usr, ass, tool, ass, tool, tool]
```

Pi 对分割后的用户消息范围生成两份摘要，再将它们合并：

1. **历史摘要**：先前的上下文（如有）。
2. **用户消息范围前段摘要**：被分割范围的前一部分。

### 截断点规则 \{#cut-point-rules}

可在以下消息处截断：

- 用户消息。
- 助手消息。
- BashExecution 消息。
- 自定义消息（custom_message、branch_summary）。

不要在工具结果处截断。工具结果必须与对应工具调用一起保留。

只有在后缀包含一条已排除的助手尝试、且没有任何未排除的会产生上下文的条目时，准备阶段才会把保留边界向后推进到这个对上下文不可见的后缀。恢复过程中的 `context_edit` 排除项满足该规则，原本就对上下文不可见的元数据可与它们共存。只有元数据时不会移动截断点，新追加的自定义消息也不会移动截断点。如果替换编辑影响候选输入或待摘要的前缀，同样不得推进，因为被排除的助手尝试回答的是编辑前的输入。替换最终会被排除的后缀条目仍是安全的。这样，在摘要超出预算的已恢复输入时，可以保留让已放弃的尝试继续被排除的编辑，不会因为记录维护方式而改变是否逐字保留新的模型输入。

### CompactionEntry 的结构 \{#compactionentry-structure}

定义在 [`session-manager.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface CompactionEntry<T = unknown> {
  type: "compaction";
  id: string;
  parentId: string | null;
  timestamp: string;
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  usage?: Usage;       // LLM usage that generated the summary
  fromHook?: boolean;  // true if provided by extension (legacy field name)
  details?: T;         // implementation-specific data
}

// Default compaction uses this for details (from compaction.ts):
interface CompactionDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

扩展可以在 `details` 中保存任意可序列化为 JSON 的数据。默认压缩会跟踪文件操作，扩展的自定义实现可以使用自己的结构。自动生成和扩展提供的摘要在能够取得大语言模型 `usage` 时会保存该值，使会话用量合计包含生成摘要的开销。

实现见 [`prepareCompaction()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/compaction.ts) 和 [`compact()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/compaction.ts)。直接从程序生成摘要时，`generateSummary()` 返回摘要文本，`generateSummaryWithUsage()` 返回 `{ text, usage }`。

## 分支摘要 \{#branch-summarization}

### 触发条件 \{#when-it-triggers-1}

使用 `/tree` 切换到其他分支时，Pi 会询问是否为即将离开的分支生成工作摘要。该摘要将原分支的上下文带入新分支。

### 工作原理 \{#how-it-works-1}

1. **查找共同祖先**：找到切换前后两个位置共有的最深节点。
2. **收集条目**：从原分支的叶节点向上回溯到共同祖先。
3. **按预算准备消息**：从最新的消息开始纳入，直到达到 token 预算。
4. **生成摘要**：调用大语言模型，按结构化格式生成摘要。
5. **追加条目**：在导航位置保存 `BranchSummaryEntry`。

```
Tree before navigation:

         ┌─ B ─ C ─ D (old leaf, being abandoned)
    A ───┤
         └─ E ─ F (target)

Common ancestor: A
Entries to summarize: B, C, D

After navigation with summary:

         ┌─ B ─ C ─ D
    A ───┤
         └─ E ─ F ─ [summary of B,C,D] (new leaf)
```

### 累积跟踪文件 \{#cumulative-file-tracking}

默认的上下文压缩和分支摘要都会累积跟踪文件。两者都从待摘要消息的工具调用中提取文件操作。上下文压缩还会沿用上一次由 Pi 生成的压缩摘要中的文件列表。分支摘要则会沿用待摘要条目中由 Pi 生成的分支摘要所记录的文件列表。

因此，文件跟踪信息会在多次默认上下文压缩和多层嵌套的默认分支摘要中不断累积。如果摘要由扩展生成且 `fromHook` 为 `true`，Pi 不会自动沿用其文件列表。扩展自行管理 `details` 的格式。

### BranchSummaryEntry 结构 \{#branchsummaryentry-structure}

定义见 [`session-manager.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/session-manager.ts)：

```typescript
interface BranchSummaryEntry<T = unknown> {
  type: "branch_summary";
  id: string;
  parentId: string | null;
  timestamp: string;
  summary: string;
  fromId: string;      // Entry we navigated from
  usage?: Usage;       // LLM usage that generated the summary
  fromHook?: boolean;  // true if provided by extension (legacy field name)
  details?: T;         // implementation-specific data
}

// Default branch summarization uses this for details (from branch-summarization.ts):
interface BranchSummaryDetails {
  readFiles: string[];
  modifiedFiles: string[];
}
```

与上下文压缩一样，扩展可以在 `details` 中存储自定义数据。

实现见 [`collectEntriesForBranchSummary()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/branch-summarization.ts)、[`prepareBranchEntries()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/branch-summarization.ts)和 [`generateBranchSummary()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/branch-summarization.ts)。

## 摘要格式 \{#summary-format}

两种摘要都包含目标（`Goal`）、约束与偏好（`Constraints & Preferences`）、进度（`Progress`）、关键决策（`Key Decisions`）和后续步骤（`Next Steps`）。上下文压缩摘要还包含关键上下文（`Critical Context`）；分支摘要的最后一个固定栏目是后续步骤。需要时，Pi 会在任一种摘要末尾追加文件列表。

上下文压缩摘要采用以下格式：

```markdown
## Goal
[What the user is trying to accomplish]

## Constraints & Preferences
- [Requirements mentioned by user]

## Progress
### Done
- [x] [Completed tasks]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues, if any]

## Key Decisions
- **[Decision]**: [Rationale]

## Next Steps
1. [What should happen next]

## Critical Context
- [Data needed to continue]

<read-files>
path/to/file1.ts
path/to/file2.ts
</read-files>

<modified-files>
path/to/changed.ts
</modified-files>
```

### 消息序列化 \{#message-serialization}

生成摘要前，Pi 通过 [`serializeConversation()`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/compaction/utils.ts) 将消息序列化为文本：

```
[User]: What they said
[Assistant]: Response text
[Assistant tool calls]: read(path="foo.ts"); edit(path="bar.ts", ...)
[Tool result]: Output from tool
```

这样可以避免模型把这些消息当成需要继续的对话。

序列化时会省略思考内容块。模型提供方返回的是实际推理过程的摘要，而重放的思考内容通常不属于模型的当前上下文。纳入这些内容可能导致摘要请求比待摘要的上下文还大。

序列化时，工具结果最多保留 2000 个字符。超出限制的内容会替换为标记，注明截去的字符数。工具结果通常占用最多的上下文，尤其是 `read` 和 `bash` 的结果。截断可以将摘要请求控制在合理的 token 预算内。

## 通过扩展自定义摘要 \{#custom-summarization-via-extensions}

扩展可以拦截并自定义上下文压缩和分支摘要。事件类型定义见 [`extensions/types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/extensions/types.ts)。

### session_before_compact \{#session_before_compact}

在自动上下文压缩或执行 `/compact` 前触发。扩展可以取消压缩或提供自定义摘要。参阅类型定义文件中的 `SessionBeforeCompactEvent` 和 `CompactionPreparation`。

```typescript
pi.on("session_before_compact", async (event, ctx) => {
  const { preparation, branchEntries, customInstructions, reason, willRetry, signal } = event;

  // preparation.messagesToSummarize - messages to summarize
  // preparation.turnPrefixMessages - user-message-span prefix (if isSplitTurn)
  // preparation.previousSummary - previous compaction summary
  // preparation.fileOps - extracted file operations
  // preparation.tokensBefore - context tokens before compaction
  // preparation.firstKeptEntryId - where kept messages start
  // preparation.settings - effective settings after applying model overrides

  // branchEntries - all entries on current branch (for custom state)
  // reason - "manual" (/compact), "threshold", or "overflow"
  // willRetry - whether the aborted turn is retried after compaction (overflow recovery)
  // signal - AbortSignal (pass to LLM calls)

  // Cancel:
  return { cancel: true };

  // Custom summary:
  return {
    compaction: {
      summary: "Your summary...",
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      // usage: summaryResponse.usage, // Optional; included in session totals
      details: { /* custom data */ },
    }
  };
});
```

#### 将消息转换为文本 \{#converting-messages-to-text}

要使用自己的模型生成摘要，请用 `serializeConversation` 将消息转换为文本：

```typescript
import { convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

pi.on("session_before_compact", async (event, ctx) => {
  const { preparation } = event;
  
  // Convert AgentMessage[] to Message[], then serialize to text
  const conversationText = serializeConversation(
    convertToLlm(preparation.messagesToSummarize)
  );
  // Returns:
  // [User]: message text
  // [Assistant]: response text
  // [Assistant tool calls]: read(path="..."); bash(command="...")
  // [Tool result]: output text

  // Now send to your model for summarization
  const { summary, usage } = await myModel.summarize(conversationText);
  
  return {
    compaction: {
      summary,
      firstKeptEntryId: preparation.firstKeptEntryId,
      tokensBefore: preparation.tokensBefore,
      usage,
    }
  };
});
```

使用其他模型的完整示例见 [custom-compaction.ts](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/custom-compaction.ts)。

### session_compact_failed \{#session_compact_failed}

手动或自动上下文压缩失败或中止时触发。遥测扩展可用此事件将 `session_before_compact` 对应的压缩尝试与最终结果关联起来。

```typescript
pi.on("session_compact_failed", async (event, ctx) => {
  const { reason, errorMessage, aborted, willRetry, fromExtension } = event;
  // reason - "manual" (/compact), "threshold", or "overflow"
  // errorMessage - present for non-abort failures
  // aborted - true for canceled/aborted compactions
  // willRetry - whether the aborted turn would have retried after compaction
  // fromExtension - whether extension-provided compaction content was being used
});
```

### session_before_tree \{#session_before_tree}

在 `/tree` 导航前触发，无论用户是否选择生成摘要。扩展可以取消导航或提供自定义摘要。

```typescript
pi.on("session_before_tree", async (event, ctx) => {
  const { preparation, signal } = event;

  // preparation.targetId - where we're navigating to
  // preparation.oldLeafId - current position (being abandoned)
  // preparation.commonAncestorId - shared ancestor
  // preparation.entriesToSummarize - entries that would be summarized
  // preparation.userWantsSummary - whether user chose to summarize

  // Cancel navigation entirely:
  return { cancel: true };

  // Provide custom summary (only used if userWantsSummary is true):
  if (preparation.userWantsSummary) {
    return {
      summary: {
        summary: "Your summary...",
        // usage: summaryResponse.usage, // Optional; included in session totals
        details: { /* custom data */ },
      }
    };
  }
});
```

参阅类型定义文件中的 `SessionBeforeTreeEvent` 和 `TreePreparation`。

## 设置 \{#settings}

在 `~/.pi/agent/settings.json` 或 `<project-dir>/.pi/settings.json` 中配置上下文压缩：

```json
{
  "compaction": {
    "enabled": true,
    "reserveTokens": 16384,
    "keepRecentTokens": 20000
  }
}
```

| 设置项 | 默认值 | 说明 |
|---------|---------|-------------|
| `enabled` | `true` | 启用自动上下文压缩。 |
| `reserveTokens` | `16384` | 上下文的剩余 token 数低于此值时开始自动压缩。 |
| `keepRecentTokens` | `20000` | 保留的最新 token 数。这部分内容不做摘要。 |

将 `"enabled": false` 写入设置即可禁用自动上下文压缩。仍可使用 `/compact` 手动压缩。

### 按模型覆盖设置 \{#per-model-overrides}

使用 `compaction.modelOverrides` 为不同模型调整 token 预算：

```json
{
  "compaction": {
    "reserveTokens": 16384,
    "keepRecentTokens": 20000,
    "modelOverrides": {
      "some-provider/big-model": {
        "reserveTokens": 400000
      }
    }
  }
}
```

对于上下文窗口为 1M 的模型，此覆盖设置会在 token 数超过 600K 时触发压缩，并按常规设置保留最新的 20000 个 token。其他模型继续按常规设置预留 16384 个 token。

键必须与区分大小写的 `provider/modelId` 完全匹配，包括模型 ID 本身包含的斜杠。`reserveTokens` 和 `keepRecentTokens` 分别按以下优先级取值：模型覆盖设置、常规设置、内置默认值。模型覆盖条目必须是对象。无论在常规设置还是模型覆盖设置中，`reserveTokens` 和 `keepRecentTokens` 都必须是非负安全整数。读取匹配的模型覆盖条目时，无效值会报错；只有未填写的字段才会回退到常规设置。即使当前模型有有效的覆盖设置，读取无效的常规 token 设置时也会报错。只有未填写的常规设置才使用内置默认值。`enabled` 始终是全局设置，不按模型区分。

解析得到的设置用于手动上下文压缩、所有自动阈值检查和溢出恢复，扩展也可通过 `preparation.settings` 读取这些值。切换模型会影响后续的检查和压缩，常规设置保持不变。已开始的压缩继续使用为该次操作记录的模型和设置。分支摘要设置不受影响。

全局设置和项目设置都支持按模型覆盖。Pi 在查找模型设置之前会递归合并两个文件，因此全局设置中针对特定模型的值优先于项目设置中的通用回退值。项目若要改变该值，必须覆盖对应的模型条目。详见[设置参考](./settings.md#per-model-compaction-overrides)。
