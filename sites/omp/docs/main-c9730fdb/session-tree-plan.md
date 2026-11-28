---
title: "会话树架构（当前）"
description: "Oh My Pi 官方仓库文档：会话树架构（当前）。"
---

# 会话树架构（当前） \{#session-tree-architecture-current}

参考：[session.md](./session.md)

本文档描述当前会话树导航的工作方式：内存树模型、叶节点移动规则、分支行为，以及扩展/事件集成。

## 此子系统是什么 \{#what-this-subsystem-is}

会话存储为仅追加的条目日志，但运行时行为基于树：

- 每个非头部条目都有 `id` 和 `parentId`。
- 活动位置是 `SessionManager` 中的 `leafId`。
- 追加条目总会创建当前叶节点的子节点。
- 分支**不会**重写历史；它只会在下次追加前改变叶节点指向的位置。

关键文件：

- `packages/coding-agent/src/session/session-manager.ts`：树数据模型、遍历、叶节点移动、分支/会话提取
- `packages/coding-agent/src/session/session-context.ts`：`buildSessionContext` 上下文重建（解析后的根→叶 LLM 上下文、上下文压缩/分支摘要回放）
- `packages/coding-agent/src/session/agent-session.ts`：`/tree` 导航流程、摘要生成、钩子/事件发出
- `packages/coding-agent/src/ui/overlays/pickers/tree-selector.tsx`：交互式树 UI 行为和过滤
- `packages/coding-agent/src/modes/controllers/selector-controller.ts`：`/tree` 和 `/branch` 的选择器编排
- `packages/coding-agent/src/slash-commands/builtin-session.ts`：命令路由（`/tree`、`/branch`）
- `packages/coding-agent/src/modes/controllers/input-controller.ts`：双击 Escape 行为以及 `app.session.tree`/`app.session.fork` 快捷键接线
- `packages/coding-agent/src/session/messages.ts`：将 `branch_summary`、`compaction` 和 `custom_message` 条目转换为 LLM 上下文消息

## `SessionManager` 中的树数据模型 \{#tree-data-model-in-sessionmanager}

运行时索引位于 `SessionEntryIndex` 辅助对象中，由 `SessionManager` 的 `#index` 持有，并与日志数组 `#entries` 保持同步：

- `#entriesById: Map<string, SessionEntry>`：快速查找任意条目
- `#children: Map<string | null, SessionEntry[]>`：父→子邻接关系
- `#labels: Map<string, string>`：按目标条目 id 解析后的标签
- `#leaf: string | null`：树中的当前位置
- `#usage`：累计用量

树 API：

- `getBranch(fromId?)` 沿父链接遍历到根，并返回根→节点路径
- `getTree()` 返回 `SessionTreeNode[]`（`entry`、`children`、`label`）
   - 父链接转换为子节点数组
   - 父节点缺失、为 null 或为自身的条目视为根
   - 子节点按时间戳从旧→新排序
- `getChildren(parentId)` 返回直接子节点
- `getLabel(id)` 从索引的 `#labels` 映射中解析当前标签

`getTree()` 是运行时投影；持久化仍使用仅追加的 JSONL 条目。

## 叶节点移动语义 \{#leaf-movement-semantics}

有三种叶节点移动原语：

1. `branch(entryId)`
   - 验证条目存在
   - 设置 `leafId = entryId`
   - 不写入新条目

2. `resetLeaf()`
   - 设置 `leafId = null`
   - 下次追加创建新的根条目（`parentId = null`）

3. `branchWithSummary(branchFromId, summary, details?, fromExtension?)`
   - 接受 `branchFromId: string | null`
   - 设置 `leafId = branchFromId`
   - 追加一个 `branch_summary` 条目，作为该叶节点的子节点
   - 当 `branchFromId` 为 `null` 时，`fromId` 持久化为 `"root"`

## `/tree` 导航行为（同一会话文件） \{#tree-navigation-behavior-same-session-file}

`AgentSession.navigateTree()` 是导航，不是文件派生。

流程：

1. 验证目标并计算放弃的路径（`collectEntriesForBranchSummary`）。
2. 如果交互式选择了一个 `ask` 工具结果，且可以恢复其原始表单 `html`，则返回 `reopenAsk` 请求，而不修改树。选择器重新打开表单，然后使用替换结果再次调用 `navigateTree`；第二次调用会在原答案的父节点下追加一个新的同级 `toolResult`。
3. 发出带 `TreePreparation` 的 `session_before_tree`。
4. 可选地汇总放弃的条目（使用钩子提供的摘要或内置摘要器）。
5. 计算新的叶节点目标：
   - 选择**用户**消息或由用户调用的技能/协作自定义提示词：叶节点移动到其父节点；返回原始草稿和图像附件以恢复编辑器
   - 选择技能提示词注入以外的其他 **custom_message**：使用相同的父节点/预填规则（仅文本）
   - 选择智能体/自动加载的技能提示词注入或其他任何条目：叶节点 = 选定条目 id
6. 应用叶节点移动：
   - 带摘要：`branchWithSummary(newLeafId, ...)`
   - 不带摘要且 `newLeafId === null`：`resetLeaf()`
   - 否则：`branch(newLeafId)`
7. 从新叶节点重建智能体上下文，重置分支作用域的 todo/顾问/检查点状态，关闭历史被重写的 Codex 模型提供方会话，并发出 `session_tree`。

重要：摘要条目附加在**新的导航位置**，而不是被放弃分支的尾部。

## `/branch` 与编程式文件分支 \{#branch-and-programmatic-file-branching}

两个面向用户的命令都留在当前会话文件中：

- `/tree` 打开条目树选择器，提供过滤、标签和可选摘要。
- `/branch`（别名 `/rewind`）打开全屏会话记录回退选择器。
- 会话记录回退调用 `navigateTree(entryId, { summarize: false })`。用户请求目标会回退到提示词之前并替换编辑器草稿；其他目标则落在选定条目上。
- `doubleEscapeAction` 仅控制编辑器为空时双击 Escape 的快捷方式：`rewind`（默认）、`tree` 或 `none`。它不改变 `/branch` 路由。

单独的 `AgentSession.branch(entryId)` API 由扩展/钩子命令上下文使用，仍会创建新文件（或替换内存内容）：

- 来源必须是**用户消息**。
- 返回选定的用户文本和图像附件，以恢复草稿。
- 根提示词启动 `newSession({ parentSession: previousSessionFile })`，携带先前的标题和标题来源。
- 否则调用 `createBranchedSession(selectedEntry.parentId)`，复制直到提示词边界的历史。

`SessionManager.createBranchedSession(leafId)` 的具体行为：

- 通过 `getBranch(leafId)` 构建根→叶路径；缺失时抛出错误。
- 从复制路径中排除现有 `label` 条目。
- 为路径中保留的条目，根据解析后的标签映射（`labelsInEffect()`）重建新的标签条目。
- 持久化模式：写入新的 JSONL 文件，并将管理器切换到该文件；返回新文件路径。
- 内存模式：替换内存条目；返回 `undefined`。

## 上下文重建与摘要/自定义集成 \{#context-reconstruction-and-summarycustom-integration}

`buildSessionContext()`（位于 `session-context.ts`，通过 `SessionManager.buildSessionContext()` 暴露）解析活动的根→叶路径，并构建有效的 LLM 上下文状态：

- 跟踪路径上最新的已配置/生效思考级别、角色模型、按家族划分的服务层级、模式/数据，以及注入的 TTSR 状态。
- 处理路径上读取模型（`options.model`）能够回放的最新上下文压缩：
   - 先输出上下文压缩摘要
   - 回放从 `firstKeptEntryId` 到压缩点的保留消息
   - 然后回放压缩后的消息
- 将 `branch_summary` 和 `custom_message` 条目作为 `AgentMessage` 对象包含在内。

随后，`session/messages.ts` 将这些消息类型映射为模型输入：

- `branchSummary` 和 `compactionSummary` 转换为用户角色的模板化上下文消息
- 普通 `custom`/`hookMessage` 内容使用开发者角色转换；用户调用的技能提示词转换为带归属信息的用户消息，引导用户消息使用其专用包装器。带图像的自定义内容有单独的转换路径。

因此，树移动通过改变活动叶节点路径来改变上下文，而不是修改旧条目。

## 标签与树 UI 行为 \{#labels-and-tree-ui-behavior}

标签持久化：

- `appendLabelChange(targetId, label?)` 在当前叶节点链上写入 `label` 条目。
- `#labels`（在 `SessionEntryIndex` 中）立即更新（设置或删除）。
- `getTree()` 将当前标签解析到每个返回节点上。

树选择器行为（`tree-selector.ts`）：

- 将树展平以便导航，保留活动路径高亮，并优先显示活动分支。
- 支持过滤模式：`default`、`no-tools`、`user-only`、`labeled-only`、`all`。
   - `default` 隐藏设置/簿记条目：`label`、`custom`、模型/思考/服务层级/标题更改、`model_usage`、凭据固定、会话初始化、TTSR 注入、模式更改和重置边界。
   - `user-only` 包含普通用户消息以及用户调用的技能/协作自定义提示词。
- 支持对渲染后的语义内容进行自由文本搜索。
- `Shift+L` 打开内联标签编辑，并通过 `appendLabelChange` 写入。

命令路由：

- `/tree` 始终打开树选择器。
- `/branch`（别名 `/rewind`）始终打开会话记录回退选择器，并执行同文件内导航。

## 树操作的扩展和钩子接入点 \{#extension-and-hook-touchpoints-for-tree-operations}

命令执行时的扩展 API（`ExtensionCommandContext`）：

- `branch(entryId)`：创建分支会话文件；返回 `{ cancelled }`
- `navigateTree(targetId, { summarize? })`：在当前树/文件内移动；返回 `{ cancelled }`

`HookCommandContext` 暴露相同的 `branch` 和 `navigateTree` 操作，但有意省略仅供扩展使用的会话切换/重载/上下文压缩操作。
树导航前后的事件：

- `session_before_tree`
   - 接收 `TreePreparation`：
      - `targetId`
      - `oldLeafId`
      - `commonAncestorId`
      - `entriesToSummarize`
      - `userWantsSummary`
   - 可以取消导航
   - 可以提供摘要载荷以替代内置摘要器
   - 接收中止 `signal`（Escape 取消路径）
- `session_tree`
   - 发出 `newLeafId`、`oldLeafId`
   - 创建摘要时包含 `summaryEntry`
   - `fromExtension` 指示摘要来源

相邻但相关的生命周期钩子：

- 用于 `/branch` 流程的 `session_before_branch` / `session_branch`
- 用于上下文压缩条目的 `session_before_compact`、`session.compacting`、`session_compact`，这些条目随后会影响树上下文重建

## 实际约束与边界条件 \{#real-constraints-and-edge-conditions}

- `branch()` 不能以 `null` 为目标；对于首个条目之前的根状态，应使用 `resetLeaf()`。
- `branchWithSummary()` 支持 `null` 目标，并记录 `fromId: "root"`。
- 在 `/tree` 中选择当前叶节点通常是 UI 无操作，但交互式 `ask` 重新作答除外。直接调用 `navigateTree()` 和会话记录回退仍可以回退到当前叶节点用户消息之前。
- 请求生成摘要需要有活动模型。内置摘要生成还需要模型提供方凭据；钩子提供的摘要以及没有放弃条目的导航不会调用该凭据检查。
- 如果摘要生成被中止，导航会取消，叶节点保持不变。
- 内存会话的 `createBranchedSession` 绝不返回分支文件路径，尽管其内存条目会被替换。
- 树上下文重建包含角色模型、已配置/生效思考级别、按家族划分的服务层级、模式数据，以及注入的 TTSR 状态；状态条目本身不会变成 LLM 消息。

## 计划批准时的会话命名 \{#plan-approval-session-naming}

当用户在计划模式中批准计划（`InteractiveMode.#approvePlan`）时，分派路径会以计划标题初始化会话名称，从而使生成的新会话、保留会话或压缩后会话不再保持未命名状态。

触发条件：

- 计划批准到达 `#approvePlan(...)`，且 `options.title` 已由计划批准详情填入。
- 这适用于每个到达执行分派的批准选项。如果批准时的上下文压缩被显式取消，就不会分派执行，也不会到达命名代码块；下一个操作员轮次会从保留的计划引用继续。

命名来源：

- 通过 `humanizePlanTitle(title)`（`packages/coding-agent/src/plan-mode/approved-plan.ts`）将规范化的计划标题转换为便于阅读的形式：
   - 将连续的 `-`/`_` 替换为单个空格
   - 修剪空白
   - 将首字符大写
   - 对仅含空白/分隔符的输入返回 `""`
- 仅当当前会话没有名称（`!sessionManager.getSessionName()`）时，才应用此便于阅读的名称。随后调用 `sessionManager.setSessionName(name, "auto")`，该方法也会拒绝覆盖用户命名的会话。
- 在执行提示词入队之前，会等待命名写入完成。

示例（来自 `humanizePlanTitle`）：

- `migrate-mcp-loader` → `Migrate mcp loader`
- `fix_session_naming` → `Fix session naming`
- `foo--bar__baz` → `Foo bar baz`
- `RefactorRouter` → `RefactorRouter`（没有需要展开的分隔符）
- `""` / `"---"` → `""`（不应用名称）

## 仍然保留的旧版兼容性 \{#legacy-compatibility-still-present}

会话迁移仍会在加载时运行：

- v1→v2 添加 `id`/`parentId`，并将上下文压缩索引锚点转换为 id 锚点
- v2→v3 将旧版 `hookMessage` 角色迁移为 `custom`

迁移后的当前运行时行为采用版本 3 的树语义。
