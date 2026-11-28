---
title: "TTSR 注入生命周期"
description: "Oh My Pi 官方仓库文档：TTSR 注入生命周期。"
---

# TTSR 注入生命周期 \{#ttsr-injection-lifecycle}

本文介绍当前 Time Traveling Stream Rules（TTSR，时间旅行流规则）的运行时路径，从规则发现到流中断、重试注入、扩展通知以及会话状态处理。

## 实现文件 \{#implementation-files}

- [`packages/coding-agent/src/sdk.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/sdk.ts)
- [`packages/coding-agent/src/export/ttsr.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/ttsr.ts)
- [`packages/coding-agent/src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`packages/coding-agent/src/session/ttsr-coordinator.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/ttsr-coordinator.ts)
- [`packages/coding-agent/src/session/ttsr-outputs.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/ttsr-outputs.ts)
- [`packages/coding-agent/src/export/ttsr-settings.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/ttsr-settings.ts)
- [`packages/coding-agent/src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)
- [`packages/coding-agent/src/prompts/system/ttsr-interrupt.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/ttsr-interrupt.md)
- [`packages/coding-agent/src/prompts/system/ttsr-prose-notice.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/ttsr-prose-notice.md)
- [`packages/coding-agent/src/prompts/system/ttsr-warning.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/ttsr-warning.md)
- [`packages/coding-agent/src/prompts/system/ttsr-tool-reminder.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/ttsr-tool-reminder.md)
- [`packages/coding-agent/src/capability/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/index.ts)
- [`packages/coding-agent/src/extensibility/extensions/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/extensions/types.ts)
- [`packages/coding-agent/src/extensibility/hooks/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/hooks/types.ts)
- [`packages/coding-agent/src/extensibility/custom-tools/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/custom-tools/types.ts)
- [`packages/coding-agent/src/modes/controllers/event-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/event-controller.ts)

## 1. 发现输入与规则注册 \{#1-discovery-feed-and-rule-registration}

创建会话时，`createAgentSession()` 加载发现的规则，构造 `TtsrManager`，并通过 `bucketRules(...)` 对规则分组：

```ts
const ttsrSettings = cfgTtsr.get(settings);
// Live source: enable/repeat/interrupt/context changes apply on the next check.
const ttsrManager = new TtsrManager(() => cfgTtsr.get(settings));
const rulesResult =
	options.rules !== undefined
		? { items: options.rules, warnings: undefined }
		: await loadCapability<Rule>(ruleCapability.id, { cwd, agentDir });
const { rulebookRules, alwaysApplyRules } = bucketRules(rulesResult.items, ttsrManager, {
	builtinRules: ttsrSettings.builtinRules,
	disabledRules: ttsrSettings.disabledRules,
	agentName: resolvedAgentName,
});
```

`bucketRules(...)` 会丢弃名称列在 `ttsr.disabledRules` 中的规则，在 `ttsr.builtinRules === false` 时丢弃嵌入的内置默认规则，丢弃 `agents` glob 模式与当前会话智能体不匹配的规则，注册接受的 TTSR 规则，然后将剩余规则分配到始终应用/规则手册分组。

会话作用域内的提示词重建会重新发现规则并重新分组（显式规则集仅重新分组）。`replaceRules()` 会替换注册项并清空流缓冲区，同时保留仍已注册名称的注入记录。移除的名称会丢失其记录；禁用 TTSR 时，记录会保留，以便重新启用。会话本地与顶层的活动规则 URL 快照也会刷新。

### 注册前去重行为 \{#pre-registration-dedupe-behavior}

`loadCapability("rules")` 按 `rule.name` 去重，采用先到者优先语义（提供方优先级高的在前）。被遮蔽的重复规则会在 TTSR 注册前移除。

### `TtsrManager.addRule()` 行为 \{#ttsrmanageraddrule-behavior}

以下情况会跳过注册：

- TTSR 已禁用（`ttsr.enabled === false`）
- `rule.condition`（正则表达式）、`rule.astCondition`（ast-grep 模式）和 `rule.question`（判定式）全部缺失，或者所有正则条件编译都失败，且既没有 AST 条件也没有问题
- 此管理器中已经注册了相同 `rule.name` 的规则
- 解析后的规则作用域排除了所有受监控的流

无效的正则条件和不可达的作用域会记录为警告并被忽略；会话启动会继续。AST 解析/匹配失败会在尝试匹配时记录，并视为不匹配。如果 TTSR 规则定义了 `globs`，则会将这些 glob 模式编译为匹配时使用的全局文件路径门控。

没有显式 `scope` 时，规则监控助手文本和所有工具参数，但不监控思考内容。显式作用域标记可启用 `text`、`thinking`、任意工具（`tool`/`toolcall`）、具名工具，以及可选的逐工具路径 glob 模式。

### AST 条件（`astCondition`） \{#ast-conditions-astcondition}

AST 条件仅在提供重建的 `matcherDigest` 或逐文件 `matcherEntries` 的工具参数流上求值，而且要求候选路径提供可用于推断语言的文件扩展名。内置 edit/write 工具提供了这些接口，但协调器会从活动工具中以通用方式解析它们。它们匹配的是工具重建的源码快照，有逐文件 `matcherEntries` 摘要时使用这些摘要，否则使用合并的 `matcherDigest`，而非原始传输增量；没有可用文件路径的流（正文、思考内容、无路径工具调用）会完全跳过 AST 条件。规则可以混用 `condition` 和 `astCondition`：正则路径继续在每个作用域上工作，而 AST 路径只适用于这些工具流。

快照是承载源码的载荷，而非整个预期文件：调用中未重复给出的既有目标内容不可见。当前 edit 模式在 replace 形式中提供 `new_string`，在 JSON patch、hashline 和 apply-patch 形式中提供新增行，在 create 形式中提供完整内容；write 提供整个 `content`。多文件 hashline/apply-patch 调用被拆分为独立的 `{ path, digest }` 条目，因此 AST 语言、路径作用域/glob 模式、缓冲区和匹配都逐文件求值。匹配通过原生 `astMatch` 在内存中进行，使用 Smart 严格度。

### 设置门控 \{#setting-gating}

`TtsrSettings.enabled` 对管理器进行门控：当 `ttsr.enabled === false` 时，`addRule()` 拒绝注册，`checkDelta()`/`checkSnapshot()`/`checkAstSnapshot()`/`hasRules()`/`hasAstRules()` 全部返回空值/false，因此不会运行任何匹配。

省略设置时的管理器默认值：

| 设置 | 默认值 |
| --- | --- |
| `enabled` | `true` |
| `judge` | `"auto"`（由会话使用，不用于匹配） |
| `contextMode` | `"discard"` |
| `interruptMode` | `"always"` |
| `repeatMode` | `"once"` |
| `repeatGap` | `10` 个已完成轮次 |
| `builtinRules` | `true`（由 `bucketRules` 使用，不用于匹配） |
| `disabledRules` | `[]`（由 `bucketRules` 使用，不用于匹配） |

## 2. 流式监控生命周期 \{#2-streaming-monitor-lifecycle}

`AgentSession.#handleAgentEvent` 将 TTSR 检测委托给会话拥有的 `TtsrCoordinator`。

### 轮次开始 \{#turn-start}

在 `turn_start` 时，重置流缓冲区：

- `ttsrManager.resetBuffer()`

每次助手 `message_start` 时，以及后续提供方 `start` 替换部分响应时，也会重置缓冲区，防止将已丢弃尝试或重试中的内容拼接在一起。

### 流传输期间（`message_update`） \{#during-stream-message_update}

当助手更新到达且存在规则时：

- 监控 `text_delta`、`thinking_delta`、`toolcall_delta` 以及最终确定的 `toolcall_end` 参数；即使提供方不发出参数增量，最终参数也会用于初始化快照
- 按来源或工具调用流键隔离缓冲区
- 匹配上下文中的文件路径优先使用工具的 `matcherPaths(args)` 钩子，edit 策略会提供嵌在传输载荷中的路径（hashline 的 `[path#TAG]` 节标头、apply_patch 的 `*** Add/Update/Delete File:` 封装标记），并容忍尚未流传输完整的缓冲区；然后回退到通用的顶层 `path`/`paths` 参数扫描
- 对于提供 `matcherEntries(args)` 的工具，流式载荷会按涉及的文件投影为 `{ path, digest }` 条目（仅新增行，合并同路径的节/差异块）；每个条目都以自己的文件路径和流键（`<toolcall>#<path>`），通过 `checkSnapshot(entry.digest, perFileContext)` 单独检查，因此像 `tool:edit(*.ts)` 这样的路径作用域规则，绝不会因多文件载荷中属于相邻 Markdown 差异块的文本而触发
- 否则，对于提供合并的 `matcherDigest` 的工具（edit/write），用重建的源码快照替换该作用域缓冲区，并调用 `checkSnapshot(snapshot, matchContext)`；其他情况下，将增量追加到该作用域的管理器缓冲区，并调用 `checkDelta(delta, matchContext)`（两种情况均为同步正则匹配）
- 对于文本/思考来源，如果没有已注册规则允许该来源（`canMatchText`/`canMatchThinking`），`checkDelta` 会完全跳过缓冲，因此不会匹配的正文/思考增量不产生缓冲开销
- 非最终检查只对能够中断该流来源的规则求值（`TtsrManager.interrupts`：使用规则的 `interruptMode`，否则使用全局值）。不能中断的规则（`never`，所有内置规则都属于此类；工具调用上的 `prose-only`；文本/思考内容上的 `tool-only`）无论如何都会在输出结束后交付，因此会等待 `*_end` 检查，不产生逐增量开销。当可中断规则在流中途匹配时，延后处理的规则会在同一次调用中对同一缓冲区进行最终检查，因此中断提醒仍会列出被丢弃输出违反的所有规则。对于没有任何可中断规则作用于其中的调用（`interruptsToolStream`，不考虑路径 glob 模式），其 `toolcall_delta` 会被整体跳过：直到 `toolcall_end` 才检查和缓冲其参数
- 在成功响应的 `message_end` 时，`TtsrCoordinator` 对文本和思考缓冲区，以及每个从未到达 `toolcall_end` 的工具调用，运行延后规则的最终检查（`TtsrCheckOptions.deferredOnly`），因此提供方即使省略结束事件，也不会丢失任何非中断规则
- 条件编译为 `LinearRegExp`（`packages/utils/src/regex/linear-regexp.ts`），这是一种匹配时不会发生灾难性回溯的 `RegExp`：自动机基于 JSC 针对条件标志自行计算的字符类（因此大小写折叠和行终止符与 `RegExp` 自身一致）判断是否存在匹配，再由具有 ECMAScript 语义的记忆化回溯器找到匹配本身。每个缓冲区只将每个增量馈入自动机一次，因此一次检查仅产生与增量相关的开销；对于没有环视或反向引用的条件，其结果与对整个缓冲区执行 `RegExp.test` 完全一致。回溯量爆炸的条件（惰性循环下的重叠备选项、缩进反向引用）无法阻塞流
- 对于带环视、反向引用或字符串 Unicode 属性的条件，自动机会近似处理，因此未命中即为最终结果，命中则通过使用该条件扫描来确认。这些确认，以及引擎拒绝处理的条件（例如超出节点限制的变宽重复），会使用增量扫描。无法跨越换行的条件（没有 `s` 标志，且其中没有内容能匹配 `\n`）仅从包含上一次缓冲区末尾的那一行开头重新测试。可以跨行的条件，仅在整个缓冲区 ≤4 KB，或自上次完整扫描以来增长了 25% 时，才重新扫描整个缓冲区
- `text_end`、`thinking_end` 和 `toolcall_end` 会运行最终的整缓冲区检查（`TtsrCheckOptions.final`），因此因增长节流而延后的跨行 `RegExp` 匹配，仍能在块关闭前被捕获；`checkDelta` 默认为 `final: false`，`checkSnapshot` 默认为 `final: true`（CLI 等一次性调用方保持精确）。判定式规则预筛选和 `omp ttsr test`/`scan` 使用同样的线性匹配

AST 匹配不在流监听器中运行。被等待的 `beforeToolCall` 钩子使用同样的逐文件或合并源码快照，检查最终确定且已验证的执行参数。中断会在工具产生副作用之前阻止它，将助手轮次标记为已中止，并进入现有的 TTSR 注入/重试路径；`never` 模式允许执行，并将提醒附加到结果。流式正则匹配仍保持同步。

`checkDelta()`/`checkSnapshot()` 遍历已注册规则，返回所有通过作用域、全局路径 glob 模式、正则条件和重复策略检查的匹配规则。`checkAstSnapshot()` 应用相同的作用域/路径/重复门控，从候选文件路径推断语言，然后测试每个候选规则的 AST 模式。正则和 AST 匹配数组都会传入同一个触发决策处理器。

## 3. 触发决策与立即中止路径 \{#3-trigger-decision-and-immediate-abort-path}

每条规则的 `interruptMode`（如有）会覆盖全局设置：

- `always` 中断任何匹配的来源
- `prose-only` 仅中断文本/思考匹配
- `tool-only` 仅中断工具匹配
- `never` 从不中断

如果没有匹配规则会中断，则按下文中特定于来源的延后路径处理。

当一条或多条规则匹配，且至少一条匹配规则允许中断时：

1. 将匹配规则去重后加入协调器的待处理注入。
2. 设置待中止标志，并创建 TTSR 恢复门控。
3. 立即调用 `agent.abort()`。对于工具匹配，中止原因限定于该工具调用 id，因此同级调用会收到单独的 `TTSR interrupt on another tool call` 原因。
4. 异步发出 `ttsr_triggered`（发出后不等待）。
5. 通过提示词后任务调度器，以 50ms 延迟安排重试工作，并标记当前提示词代次与重试令牌。

中止不会等待扩展回调。

## 4. 重试调度、上下文模式与提醒注入 \{#4-retry-scheduling-context-mode-and-reminder-injection}

50ms 超时后，已调度任务首先验证其重试令牌、提示词代次、待中止状态和目标助手消息是否仍为当前项。如果任一检查失败，则清空待处理的 TTSR 状态并解除恢复门控，不进行重试。否则，它会：

1. 清除待中止标志和逐工具提醒分组
2. 读取 `ttsrManager.getSettings().contextMode`
3. 如果 `contextMode === "discard"`，使用 `agent.replaceMessages(...slice(0, targetAssistantIndex))` 丢弃目标助手的部分输出
4. 使用 `ttsr-interrupt.md` 从待处理规则构建注入内容，这是中止/重试路径，规则确实中断了输出，因此中断模板才符合事实
5. 追加一条隐藏的运行时自定义消息，并持久化对应的 `custom_message` 条目，其中包含 `customType: "ttsr-injection"` 和 `details.rules`
6. 通过 `ttsr_injection` 条目标记/持久化这些规则名称，并使用会话的智能体继续调度器安排继续执行。如果被中断的运行仍忙碌，调度器会等待其结束后重试；跳过或失败的继续执行会释放恢复门控。

模板载荷为：

```xml
<system-interrupt reason="rule_violation" rule="{{name}}" path="{{path}}">
...
{{content}}
</system-interrupt>
```

内容生成后会清空待处理注入。

### `contextMode` 对部分输出的行为 \{#contextmode-behavior-on-partial-output}

- `discard`：重试前移除部分/已中止的助手消息。
- `keep`：部分助手输出保留在对话状态中；提醒追加在其后。

### 非中断匹配 \{#non-interrupting-matches}

非中断匹配按 `matchContext.source` 区分：

- **`source === "tool"`（工具来源匹配）。** 规则被归入 `TtsrCoordinator.#perToolInjections`，以匹配工具调用的 `id` 为键，并立即在内存中标记为已注入。**不会**安排延后的后续轮次，也不会中止流。当工具实际产出结果时，`afterToolCall` 钩子返回渲染后的 `ttsr-tool-reminder.md` 块，作为被动的 `additionalContext`；agent-core 在工具结果之后以独立的 developer 消息发出它，绝不会把它作为工具输出的一部分（在智能体循环外派发的调用见下一项）。它还会持久化一个 `ttsr_injection` 条目，包含已使用的规则名称。模板载荷为：

   ```xml
   <system-reminder reason="rule_violation" rule="{{name}}" path="{{path}}">
   ...
   {{content}}
   </system-reminder>
   ```

   开头一行取决于规则来源：随附的 `builtin-defaults` 规则会说明匹配了内置风格规则，要求模型对照规则检查所写内容，包括例外情况，并仅修复真正的违规；其他所有规则都会说明匹配了用户定义规则，且必须遵守。

- **桥接的 AgentTool 调用（Cursor exec 处理器、eval）。** 这些派发绕过智能体循环，因此不会运行 `afterToolCall`。最终确定的内部调用会在 `ExtensionToolWrapper` 边界接受检查，该边界将调用的工具上下文传给 `TtsrCoordinator.afterBridgedToolCall`。如果上下文携带 `addAdditionalContext` 接收器，提醒会通过它作为被动上下文交付（只要会话提供了工具上下文，Cursor exec 桥就会安装接收器，并在下一次提供方请求中于其缓冲结果之后交付），桥接结果则保持不变。没有接收器的桥接调用没有可信通道，因此改为将提醒作为开头的文本块添加到结果前；目前 eval 桥接调用采用此回退方式。Prelude 宿主调用（`browser.*`、`computer.*`、`tab.run`）不是 AgentTool 派发，不进入此路径。

- **`source === "text"` / `"thinking"`（正文来源匹配）。** 规则进入待处理注入队列。在一条成功、无错误且未中止的助手消息之后，`TtsrCoordinator` 通过 `agent.followUp()` 将隐藏的 `ttsr-injection` 自定义消息排队，并安排在 1ms 后继续。这些延后的非中断正文匹配不会发出 `ttsr_triggered`；该事件在实际中断路径以及非中断逐工具提醒中发出。延后消息使用 `ttsr-prose-notice.md` 渲染：规则匹配了它没有中断的输出，因此通知会说明输出未被该规则中断。它有意不对输出作出任何其他断言，`length` 停止会截断输出，而 `toolUse` 停止会继续进入工具调用。

  ```xml
  <system-reminder reason="rule_violation" rule="{{name}}" path="{{path}}">
  ...
  {{content}}
  </system-reminder>
  ```

在一个匹配批次内，每条规则恰好附加到一个同级工具调用：如果多个同级调用满足同一规则，则先认领的分组优先。多个不同规则仍可共用一个工具调用的被动上下文。

#### 对工具作者和会话记录读者的影响 \{#implications-for-tool-authors-and-transcript-readers}

- 工具自身的 `toolResult` 内容原样保留。agent-core 在批次内每个结果都完成之后、下一次提供方请求之前，以独立的 developer 消息发出渲染后的提醒。
- 会话记录读者若要查找工具来源规则的非中断 TTSR 活动，必须检查工具结果批次之后的 developer 消息（以及已持久化的 `ttsr_injection` 条目列表），而非工具输出或合成的自定义消息条目。
- 一条 developer 消息可携带多个规则或工具调用的提醒，按助手调用顺序拼接，渲染后的模板之间以空行分隔。
- 如果助手消息在匹配工具运行前以 `stopReason === "aborted"` 或 `"error"` 结束，待处理的逐工具分组会被清空，也不会持久化 `ttsr_injection` 条目。匹配时的内存注入记录**不会**回滚：在 `once` 模式下，它会保持抑制，直到会话重新加载；在 `after-gap` 模式下，经过配置数量的已完成轮次后，它会再次符合条件。由于未交付的匹配没有持久化，重新加载也会使其再次符合条件。

## 5. 重复策略与间隔逻辑 \{#5-repeat-policy-and-gap-logic}

`TtsrManager` 跟踪 `#messageCount` 和每条规则的 `lastInjectedAt`。

### `repeatMode: "once"` \{#repeatmode-once}

有注入记录的规则会在当前会话中持续受到抑制，包括 `/clear` 或上下文压缩之后。`/new` 和 RPC `new_session` 会启动新的会话记录，没有重复历史。

### `repeatMode: "after-gap"` \{#repeatmode-after-gap}

仅当满足以下条件时，规则才可再次触发：

- `messageCount - lastInjectedAt >= repeatGap`

`messageCount` 在 `turn_end` 时递增，因此间隔以已完成轮次数计量，而非流分块数。

### 逐规则覆盖与 `repeatMode: "always"` \{#per-rule-override-and-repeatmode-always}

规则自身的 `repeatMode` frontmatter 键（`once`、`after-gap` 或 `always`）会覆盖该规则的全局设置；间隔仍使用全局 `repeatGap`。

`always` 仅适用于规则级别，相当于以 `repeatGap = 1` 进行间隔检查：规则每轮最多触发一次，在其提醒落入的轮次结束后再次符合条件。记录的是提醒落入的轮次，绝不会早于当前轮次：

- 工具提醒（`afterToolCall`）和桥接块落入触发轮次，因此下一轮可以再次触发规则。
- 中断提醒落入 `ttsr-interrupt` 重试。协调器在中止时捕获该轮次（当前轮次 + 1），因此即使定时器驱动的重试任务在被中止轮次的 `turn_end` 处理前记录它，重试仍享有豁免。
- 延后提醒和判定式警告会在消息交付时再次记录，此时触发轮次已经结束；它们启动的 `ttsr-injection` 继续执行轮次或旁注轮次就是该轮次。

因此，由提醒派生的轮次无法再次触发同一规则：每次触发最多启动一个额外轮次，模型在回应提醒时即使重复匹配，也不会再次被中断或提示。

## 6. 事件发出与扩展/钩子接口 \{#6-event-emission-and-extensionhook-surfaces}

### 会话事件 \{#session-event}

`AgentSessionEvent` 包含：

```ts
{ type: "ttsr_triggered"; rules: Rule[] }
```

### 扩展运行器 \{#extension-runner}

`#emitSessionEvent()` 将事件路由到：

- 扩展监听器（`ExtensionRunner.emit({ type: "ttsr_triggered", rules })`）
- 本地会话订阅者

### 钩子与自定义工具类型 \{#hook-and-custom-tool-typing}

- 扩展 API 提供 `on("ttsr_triggered", ...)`
- 钩子 API 提供 `on("ttsr_triggered", ...)`
- 自定义工具收到 `onSession({ reason: "ttsr_triggered", rules })`

### 交互模式的渲染差异 \{#interactive-mode-rendering-difference}

交互模式使用 `session.isTtsrAbortPending`，在 TTSR 中断期间避免把已中止助手的停止原因显示为可见故障，并在事件到达时渲染 `TtsrNotificationComponent`。

## 7. 持久化与恢复状态（当前实现） \{#7-persistence-and-resume-state-current-implementation}

`SessionManager` 持久化已注入规则状态：

- 条目类型：`ttsr_injection`
- 追加 API：`appendTtsrInjection(ruleNames)`
- 查询 API：`getInjectedTtsrRules()`
- 上下文重建包含 `SessionContext.injectedTtsrRules`

`TtsrManager` 支持通过 `restoreInjected(ruleNames)` 恢复。

当前运行时连接方式：

- 中断式注入追加一条带有 `customType: "ttsr-injection"` 的隐藏 `custom_message`，并追加一个 `ttsr_injection` 条目
- 延后的非中断正文来源注入，在其排队的自定义消息到达 `message_end` 时标记/持久化
- 非中断工具来源匹配在分组时于内存中标记，然后仅在匹配工具产生结果时，从 `afterToolCall`（或桥接调用的调用后处理）持久化
- `createAgentSession()` 将 `existingSession.injectedTtsrRules` 恢复到管理器中

因此，已注入规则的抑制状态从当前分支路径恢复。持久化存储的是名称，而非原始轮次年龄：`restoreInjected()` 在消息计数为零时记录每条恢复的规则。在 `repeatMode: "after-gap"` 下，恢复的规则会在新完成 `repeatGap` 个轮次后再次符合条件，无论重新加载前已经过多少轮次；恢复的 `repeatMode: "always"` 规则同样会跳过恢复后的第一轮，从第二轮起符合条件。

## 8. 竞态边界与顺序保证 \{#8-race-boundaries-and-ordering-guarantees}

### 中止与重试回调 \{#abort-vs-retry-callback}

- 从 TTSR 处理器角度看，中止是同步的（立即调用 `agent.abort()`）
- 重试由定时器延后（`50ms`）
- 扩展通知是异步的，并且有意不在中止/重试调度之前等待

### 同一流窗口中的多个匹配 \{#multiple-matches-in-same-stream-window}

`checkDelta()` 返回该作用域缓冲区当前所有符合条件的匹配规则。注入前，待处理注入按规则名称去重。触发通知按流键跟踪规则名称，因此在 `toolcall_end` 再次确认的增量匹配，不会对同一违规通知两次；该跟踪会在轮次结束时清空。

### 中止与继续之间 \{#between-abort-and-continue}

在定时器窗口期间，状态可能变化。重试受重试令牌、提示词代次、中止状态和目标消息身份保护；过期任务会清空待处理状态并解除其门控。`agent.continue()` 失败会被捕获，也会解除门控。

## 9. 边界情况汇总 \{#9-edge-cases-summary}

- 无效的 `condition` 正则表达式：发出警告并跳过；其他条件/规则继续。
- 能力层的重复规则名称：低优先级重复项在注册前被遮蔽。
- 管理器层的重复名称：忽略第二次注册。
- `ttsr.disabledRules`：列出的名称在 TTSR 注册前被丢弃，且不会通过始终应用/规则手册分组提供。
- `ttsr.builtinRules: false`：嵌入的 `builtin-defaults` 规则在 TTSR 注册前被丢弃；用户/项目规则仍会加载。
- TTSR 规则上的 `globs` 要求至少一个候选文件路径的规范化路径或基本文件名匹配；对于 hashline/apply_patch 编辑流，这些路径来自工具的 `matcherPaths` 钩子，而非顶层参数。
- 没有 `matcherPaths`/`matcherEntries` 的工具继续使用通用顶层路径扫描和合并的 `matcherDigest` 行为，逐文件钩子是增量补充。
- 默认作用域监控文本和工具，不监控思考内容。
- `contextMode: "keep"`：在提醒重试前，部分违规输出可能仍保留在上下文中。
- `interruptMode: "never"`：正文来源匹配在一条成功的助手消息后排入延后的隐藏注入；工具来源匹配通过 `afterToolCall.additionalContext` 返回由 OMP 编写的 `<system-reminder>`，agent-core 在匹配调用的工具结果之后将其作为独立的 developer 消息发出（不修改工具输出、不在流中途中止，也不增加后续轮次）。桥接调用以同样方式使用自己的被动上下文接收器；只有没有接收器的桥接调用（eval）才会把提醒合入结果。
- 工具来源的非中断分组，在父助手消息以 `stopReason === "aborted"` 或 `"error"` 结束时被清空。匹配时的内存抑制仍保留，直到重复策略允许再次触发（或重新加载丢弃未持久化的记录）。
- 间隔后重复依赖于 `turn_end` 时轮次计数的递增；重新加载后，恢复的注入年龄从零重新开始。
- 判定式（`question`）规则绝不会出现在 `checkDelta`/`checkSnapshot`/`checkAstSnapshot` 结果中；参见 §10。

## 10. 判定式规则（`question`） \{#10-judged-rules-question}

带有 `question` 的规则是判定式规则：其自然语言问题会在输出完成后发送给 `judge` 模型角色，绝不会在流传输时发送，因此无法中断。

### 何时运行判定 \{#when-judgment-runs}

- `ttsr.judge`：`auto`（默认值）仅在 judge 角色解析为原生 System One 模型（TypeSafe jev）时判定；`on` 使用该角色解析到的任何模型判定，包括会话的聊天模型；`off` 从不判定。无论如何，问题规则仍会注册。
- 对于 `stopReason` 既非 `aborted` 也非 `error` 的助手消息，在 `message_end` 时，`TtsrCoordinator` 将消息拆分为多个输出：所有文本块合为一个 `text` 输出，所有思考块合为一个 `thinking` 输出，每个工具调用各作为一个 `tool` 输出。提供 `matcherEntries` 的工具会为每个文件产生一个输出，以 `{ path, digest }` 中的摘要作为内容；否则使用 `matcherDigest` 或原始 JSON 参数。
- 对于每个输出，`TtsrManager.judgedCandidates()` 选择通过作用域、`globs` 和重复策略检查的问题规则；当规则还声明了 `condition`/`astCondition` 时，还必须通过对已完成内容的预筛选。没有候选项 → 不发请求。
- 每个输出发起一个 judge 请求，将每个候选项的问题作为共享状态 `{ output, content }` 上的一个 `noul` 问题携带（内容截取为 32,000 个 Jev token 内的最长前缀，使用 `Encoding.Jev` 在本地计数，因此每个分支均保持在 Jev 约 33k token 的限制之下）。Jev 对每个请求的状态仅计费一次，因此共用输出的规则也分摊其成本。用量以用途 `ttsr` 记入 `model_usage` 日志。

### 交付 \{#delivery}

- 肯定答案概率 ≥ 0.7 时，规则被标记。被标记的规则经过 `TtsrManager.claim()`，它会丢弃已被其他判定认领或被重复策略阻止的规则，并在内存中将剩余规则标记为已注入；因此被多个输出标记的同一规则只会交付一次。
- 会话替换（`/new`、切换会话）之后到达的判定会被丢弃。
- 剩余规则发出 `ttsr_triggered`，使用 `ttsr-warning.md` 渲染为隐藏的 `ttsr-injection` 自定义消息（`details.rules`），并以 `deliverAs: "aside"` 发送：运行中时，它不打断运行，而是加入下一步（正在运行且可中断的 `wait` 会结束）；在空闲会话中，它会启动一轮。其 `message_end` 会持久化 `ttsr_injection` 条目。
- 会话的 `onBeforeYield` 钩子会在智能体循环排空旁注并停止前，等待进行中的判定（最多 5s），因此关于最终回复或最后一次工具调用的警告会落入同一次运行。更晚的判定仍会作为旁注到达。
- judge 失败（无凭据、超时、解析错误）会被记录，不交付任何内容。

### `/omfg` 与 CLI \{#omfg-and-cli}

`/omfg` 生成 `condition`、`astCondition` 或 `question` 规则，并被指示优先使用模式触发器。它通过相同的已完成输出视图（`TtsrToolInspector.outputs`），对照对话历史验证候选项；`question` 候选项必须通过其作用域/预筛选，并在最近 8 个作用域内输出中的某一个上得到 judge 的肯定答案。没有可用 judge 时，由用户决定是否在未确认状态下保存。

`omp ttsr list` 显示每条规则的 `question`。`omp ttsr test` 从不调用 judge，因此问题规则会报告为未触发，并显示其问题。`omp ttsr scan` 跳过问题规则：它们的条件是预筛选条件，而非违规。
