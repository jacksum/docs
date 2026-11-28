---
title: "暂存操作命令运行时"
description: "Oh My Pi 官方仓库文档：暂存操作命令运行时。"
---

# 暂存操作命令运行时 \{#staged-action-command-runtime}

待处理的预览和计划审批通过 `packages/coding-agent/src/tools/resolve.ts` 中实现的特殊命令完成最终处理。`specialToolCommands(session)` 返回这些命令背后的工具：`resolve`、`reject`、`propose`，以及启用 Auto-QA 时的 `report_issue`。每个工具都有一个必填的字符串字段，因此命令形式为：

- `resolve "<reason>"`：应用待处理的暂存预览
- `reject "<reason>"`：丢弃待处理的暂存预览
- `propose "<slug>"`：在计划模式处于活动状态时提交计划以供审批；slug 对应 `local://<slug>-plan.md`
- `report_issue "<tool>: <concise description>"`：Auto-QA 报告命令，属于 `write` 级别

调用可直接运行其中一个命令（作为顶层工具调用，以其自身名称匹配），也可将其作为首词为该命令的 `bash` 行运行：对于 `bash` 调用，`toolCommandCallName(toolCall)` 返回该首词，而 `isPreviewResolutionToolCall`、`isProposeToolCall` 和 `isReportIssueToolCall` 则将此规则应用于特定命令。会话中启用 `bash` 工具时，它们作为命令运行；否则，相同的 Tool 对象会注册为普通顶层工具，因此无论哪种方式，这些名称都可使用。

`resolveDispatchDetails(toolName, result)` 会从执行界面读取已完成的 `resolve`/`reject`：直接结果在 `details` 上携带 `ResolveDetails`；对于 `bash` 结果，则反向搜索其 `details.toolCommands` 记录，找到 `resolve`/`reject` 最后一次 `execute` 分派，并从该记录的 `inner` 解析。`ResolveDetails` 包含 `action`（`apply` 或 `discard`）、`reason`、待处理操作的 `label`、其 `sourceToolName`，以及被封装工具结果中的任何 `sourceResultDetails`。

## 预览流程 \{#preview-flows}

预览生成方调用 `queueResolveHandler(...)`，传入 `apply(reason)` 和可选的 `reject(reason)` 回调。每个预览都会在 `ToolChoiceQueue` 中获得唯一的待处理调用器 ID，因此堆叠的预览不会相互覆盖。

当没有硬性工具选择指令优先执行时，待处理预览会使 `AgentSession.nextToolChoiceDirective()` 返回一项软性要求：

- 工具命令启用时为 `toolName: "bash"`，否则为 `resolve`
- `satisfies: isPreviewResolutionToolCall`
- 来自 `resolve-unsatisfied.md` 的 `unsatisfiedNotice`：如果某次 `bash` 调用运行的不是 `resolve` 或 `reject`，其跳过结果会指明实际运行的命令，并说明整个命令必须是 `resolve` 或 `reject`，前面不能有任何内容
- 来自 `resolve-reminder.md` 的提醒

模型通过在该轮只运行 `resolve` 或 `reject` 来遵守要求，在工具命令已挂载时作为命令运行，否则作为工具运行。调用其他工具，或将其中一个命令与绕行调用放在同一批次中，都不符合要求：这些调用会被跳过，下一轮会强制使用能够运行该解析操作的工具（`bash`，否则为 `resolve`）。反复不遵守要求最终会中止运行，而不是无限循环。

分派会先选择执行中的队列调用器，然后选择待处理预览队首，并通过 `runResolveInvocation(...)` 调用其回调。`queueResolveHandler(...)` 需要会话工具选择队列；没有该队列时，它不会注册预览。

- 成功应用或丢弃后，该待处理调用器会被消费一次，且不会重复消费。
- 如果应用时抛出异常，同一预览会重新注册，以便模型拒绝它，或在修复原因后重试。
- 没有待处理操作时执行拒绝，会成功返回 `Nothing to reject; no pending action remains.`。
- 没有待处理操作时执行解析，会抛出 `No pending action to apply — …`。
- 应用回调抛出的普通错误会转换为 `ToolError("Apply failed: ...")`；已有的 `ToolError` 会予以保留。

## 计划审批 \{#plan-approval}

计划模式通过 `setPlanProposalHandler(...)` 安装独立的提案处理器。

- 交互模式将 `PlanApprovalDetails` 交给计划审查 UI。
- ACP 模式运行征询/审批并发出模式更新。
- PlanYolo 自动批准并切换到执行目标。

`propose` 将其标题交给已安装的计划提案处理器，并且只在计划模式处于活动状态时有效；没有处理器时，它会失败并返回 `No plan is awaiting approval — …`。处理器会验证是否存在真实的计划产物。基于 slug 的 `local://<slug>-plan.md` 查找可以回退到记录的计划路径或发现的计划产物；提交提案不会重命名文件。

普通打印模式没有交互式审查界面，并且会忽略 `plan.defaultOnStartup`；受支持的无界面审批并执行流程请使用 `--plan-yolo`。

## 命令可用性 \{#command-availability}

`bash` 是命令传输载体，因此是否挂载取决于它。当未设置 `restrictToolNames` 且启用 `tools.commands` 时，`createTools(...)` 会注册特殊工具，并在启用 `bash` 时将它们呈现为命令；关闭 `bash` 时，`specialToolApplies(name, { tools, planModeEnabled })` 只会在顶层保留有可处理对象的工具：`resolve`/`reject` 需要可延后执行的工具，`propose` 需要活动的计划模式，而 `report_issue` 始终适用。`SPECIAL_TOOL_NAMES` 是这些名称的集合。

## 渲染 \{#rendering}

TUI 通过 `packages/coding-agent/src/ui/tools/resolve.tsx` 中各命令各自的呈现器进行渲染。`resolveToolPresenter` 和 `rejectToolPresenter` 绘制一行待处理的 `Resolve`，其中包含 `proposed -> resolved` / `proposed -> rejected` 徽标及原因，然后绘制根据 `ResolveDetails` 构建的带边框的 `Accept` / `Discard` / `Failed` 区块（标签、可选的来源工具徽标、原因）。`proposePresenter`（`packages/coding-agent/src/ui/tools/propose.tsx`）绘制带计划标题的 `Propose`，随后绘制审批结果，`reportIssuePresenter` 则绘制 `Report Tool Issue`。在 `bash` 内运行的命令会通过其分派记录绘制相同的卡片：bash 渲染器将每个 `details.toolCommands` 条目传给 `renderToolCommandDispatch`，后者解析工具自身的渲染器，并将分派记录中解析后的 `args` 作为调用、`inner` 作为结果交给它。

## 自定义工具 \{#custom-tools}

自定义工具通过 `pushPendingAction(...)` 暂存预览；加载器将其转发至 `queueResolveHandler(...)`。自定义工具预览 API 保持不变，只有面向模型的最终处理步骤有所不同：后续使用 `resolve` 或 `reject` 命令（或顶层工具）。
