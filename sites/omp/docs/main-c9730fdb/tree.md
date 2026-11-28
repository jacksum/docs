---
title: "/tree 命令参考"
description: "Oh My Pi 官方仓库文档：/tree 命令参考。"
---

# `/tree` 命令参考 \{#tree-command-reference}

`/tree` 打开交互式**会话树**导航器。你可以跳转到当前会话文件中的任意条目，并从该处继续。

这是文件内的叶节点移动，不是导出新会话。

## `/tree` 的作用 \{#what-tree-does}

- 根据当前会话条目构建树（`SessionManager.getTree()`）
- 打开 `TreeSelectorComponent`，提供键盘导航、过滤和搜索
- 选择后调用 `AgentSession.navigateTree(targetId, { summarize, customInstructions })`
- 根据新的叶节点路径重建可见聊天内容
- 选择用户/自定义消息时，可选地预填编辑器文本

主要实现：

- `packages/coding-agent/src/slash-commands/builtin-session.ts`（`/tree`、`/branch` 命令路由）
- `packages/coding-agent/src/modes/controllers/input-controller.ts`（快捷键接线、双击 Escape 行为）
- `packages/coding-agent/src/modes/controllers/selector-controller.ts`（树 UI 启动 + 摘要提示流程）
- `packages/coding-agent/src/ui/overlays/pickers/tree-selector.tsx`（导航、过滤、搜索、标签、渲染）
- `packages/coding-agent/src/session/agent-session.ts`（`navigateTree` 叶节点切换 + 可选摘要）
- `packages/coding-agent/src/session/session-manager.ts`（`getTree`、`branch`、`branchWithSummary`、`resetLeaf`、标签持久化）

## 如何打开 \{#how-to-open-it}

以下任一方式都会打开同一个选择器：

- `/tree`
- 为 `app.session.tree` 操作配置的快捷键

在空编辑器中双击 Escape 遵循 `doubleEscapeAction`：`rewind`（默认）打开全屏会话记录回退选择器，`tree` 打开此树选择器，`none` 则禁用快捷方式。会话记录回退会对每个目标调用 `navigateTree(..., { summarize: false })`，并留在当前会话文件中。用户请求草稿会替换编辑器文本。

回退打开时显示最近约 600 个条目，同时保留完整用户轮次（因此可能超过该上限）。按 `a` 查看全部更早历史，而不改变选定点或分支。
按 `f` 过滤回放的会话记录（加载整个分支）；存在同级分支栏时，Left/Right 可在回退选择器的同级分支栏中导航。这些控件属于会话记录回退，而非下述树选择器。

## 树 UI 模型 \{#tree-ui-model}

树根据会话条目的父指针（`id` / `parentId`）渲染。

- 子节点按时间戳升序排列
- 包含活动叶节点的分支在选择器中排在首位；其他历史仍然可以访问
- 活动分支（根到叶路径）用圆点标记
- 标签以 `[label]` 形式显示在节点文本之前
- 父节点缺失、父节点为自身和显式 null 父节点的条目成为根；多个根共享一个虚拟分支根

```text
Example tree view (active path marked with •):

├─ user: "Start task"
│  └─ assistant: "Plan"
│     ├─ • user: "Try approach A"
│     │  └─ • assistant: "A result"
│     │     └─ • [milestone] user: "Continue A"
│     └─ user: "Try approach B"
│        └─ assistant: "B result"
```

选择器围绕当前选择重新居中，最多显示：

- `max(1, min(max(5, floor(terminalHeight / 2)), terminalHeight - 8))` 行，在较矮终端上为面板装饰预留空间

## 树选择器内的快捷键 \{#keybindings-inside-tree-selector}

- `Up` / `Down`：移动选择（循环）
- `Alt+Up` / `Alt+Down`：跳到上一个/下一个用户或助手轮次
- `app.tree.previousBranch` / `app.tree.nextBranch`（默认未绑定；在 [`keybindings.yml`](./keybindings.md) 中绑定，例如绑定为 `Shift+Left` / `Shift+Right`）：按渲染顺序跳到上一个/下一个可见分支（循环），可跨越嵌套派生分支。如果分支头部被过滤掉，则落在其第一个可见后代上。
- `Page Up` / `Page Down`，或 `Left` / `Right`：翻页
- `Home` / `End`：第一个/最后一个可见项目
- `Enter`：选择节点
- `Shift+Enter`：生成摘要并切换，不打开摘要选择提示
- `Esc`：搜索处于活动状态时清除搜索；否则关闭选择器
- `Ctrl+C`：关闭选择器
- `Type`：追加到搜索查询
- `Backspace`：删除搜索字符
- `Shift+L`：搜索为空时编辑/清除标签
- `Ctrl+O`：向前循环切换过滤器
- `Shift+Ctrl+O`：向后循环切换过滤器
- `Alt+D/T/U/L/A`：直接跳到某个过滤器

## 过滤与搜索语义 \{#filters-and-search-semantics}

初始模式来自 `treeFilterMode`（默认 `default`）。模式按以下顺序循环：

1. `default`
2. `no-tools`
3. `user-only`
4. `labeled-only`
5. `all`

### `default` \{#default}

显示对话节点以及未被显式隐藏的任何条目类型。它隐藏以下设置/簿记条目类型：

- `label`
- `custom`
- `model_change`
- `thinking_level_change`
- `model_usage`
- `service_tier_change`
- `title_change`
- `credential_pin`
- `session_init`
- `ttsr_injection`
- `mode_change`
- `reset_boundary`

`all` 过滤器将这些条目渲染为元数据行；没有专用渲染的条目使用其类型名称，而不是空白行。

### `no-tools` \{#no-tools}

与 `default` 相同，但还会隐藏 `toolResult` 消息。

### `user-only` \{#user-only}

用户请求：普通用户消息，以及用户调用的技能/协作自定义提示词。

### `labeled-only` \{#labeled-only}

仅显示当前可解析到标签的条目。

### `all` \{#all}

会话树中的全部内容，包括簿记/自定义条目。

### 仅含工具的助手节点行为 \{#tool-only-assistant-node-behavior}

仅包含工具调用（没有规范文本）的助手消息在所有过滤模式中都会隐藏，包括 `all`，除非：

- 消息为错误/已中止（`stopReason` 既不是 `stop` 也不是 `toolUse`），或
- 它是当前叶节点

### 搜索行为 \{#search-behavior}

- 查询按空格分词
- 使用不区分大小写的模糊（子序列）匹配（`fuzzyMatch`）
- 所有词元都必须匹配（AND 语义）
- 可搜索文本包含标签、角色以及类型专有内容（消息文本、分支摘要文本、自定义类型、工具命令片段等）
- 消息/自定义消息文本限于 200 个字符的搜索预览；搜索不会索引长消息的每一个字节。

## 选择结果（重要） \{#selection-outcomes-important}

`navigateTree` 根据所选条目类型计算新的叶节点行为：

### 选择 `user` 消息 \{#selecting-user-message}

- 新叶节点变为所选条目的 `parentId`
- 根用户消息将叶节点重置到根
- 文本和图像附件被重建为可编辑草稿
- 选择器仅在编辑器当前为空时写入该草稿

### 选择 `custom_message` \{#selecting-custom_message}

- 普通自定义消息使用与用户消息相同的父叶节点规则和文本预填
- 用户调用的技能/协作自定义提示词使用父叶节点规则，恢复原始用户草稿和图像附件
- 智能体/自动加载的 `skill-prompt` 注入不可编辑；选择它会像其他非用户条目一样落在该节点上

### 选择过去的 `ask` 工具结果 \{#selecting-a-past-ask-tool-result}

- 交互式 `/tree` 会重新打开原始表单，而不是复用过期答案
- 取消会保持树不变
- 新答案作为同级工具结果追加，保留旧答案分支，然后智能体从新答案继续
- 如果旧版/损坏数据无法恢复原始表单 `html`，则选择回退为普通叶节点移动

### 选择其他节点 \{#selecting-other-nodes}

- 新叶节点变为所选节点 id
- 不预填编辑器

### 选择当前叶节点 \{#selecting-current-leaf}

- 通常会关闭并显示 `Already at this point`
- `/tree` UI 将当前叶节点上的用户提示词视为无操作；会话记录 `/branch` 回退和直接 `navigateTree()` 调用仍然可以回退到该提示词之前
- 当前叶节点上的 `ask` 结果仍允许重新作答流程

```text
Selection decision (simplified):

selected node
   │
   ├─ current leaf (not ask result)? ──> close selector (no-op)
   │
   ├─ ask tool result? ──> re-answer as a sibling branch when the form is recoverable
   │
   ├─ user or ordinary custom message? ──> leaf := parentId (or root)
   │                                         + prefill only into an empty editor
   │
   └─ otherwise ──> leaf := selected node id
                    + no editor prefill
```

## 切换时生成摘要的流程 \{#summary-on-switch-flow}

摘要提示由 `branchSummary.enabled` 控制（默认 `false`）。无论提示设置如何，`Shift+Enter` 都会直接请求生成摘要。必须有可用模型；仅在运行内置摘要器时检查模型提供方凭据（钩子提供摘要或放弃路径为空时不检查）。

启用提示时，普通 Enter 会提供：

- `No summary`
- `Summarize`
- `Summarize with custom prompt`

流程细节：

- 在摘要提示中按 Escape 会重新打开树选择器
- 取消自定义提示词会返回摘要选择
- 摘要生成期间，UI 显示加载指示器，并将 Esc 绑定到 `abortBranchSummary()`
- 如果摘要生成被中止，会重新打开树选择器，且不应用任何移动

`navigateTree` 内部行为：

- 刷写待处理的 bash 输出并验证目标
- 收集从旧叶节点到共同祖先的被放弃分支条目
- 发出可取消的 `session_before_tree`；扩展可以提供请求的摘要
- 仅在请求生成摘要、有条目需要汇总且没有钩子提供摘要时，才运行默认摘要器
- 按情况应用 `branchWithSummary(...)`、`branch(newLeafId)` 或 `resetLeaf()`
- 重建模型上下文、检查点/回退状态、顾问状态、todo，以及受历史重写影响的模型提供方会话
- 发出 `session_tree`，如果处理器可能追加了条目，则再次重建

如果请求了摘要但没有内容需要汇总，导航会继续，但不创建摘要条目。

## 标签 \{#labels}

树 UI 中的标签编辑调用 `appendLabelChange(targetId, label)`。

- 非空标签设置/更新解析后的标签
- 空标签清除标签
- 标签存储为仅追加的 `label` 条目
- 树节点显示解析后的标签状态，而非原始标签条目历史

## `/tree` 与相邻操作的比较 \{#tree-vs-adjacent-operations}

| 操作 | 范围 | 结果 |
| --- | --- | --- |
| `/tree` | 当前会话文件 | 将叶节点移到选定点（同一文件） |
| `/branch`（别名 `/rewind`） | 新会话文件 | 打开会话记录回退（也可按 Esc Esc）；将直到选定点的对话分支到新会话中，并恢复用户请求草稿 |
| `/fork` | 整个当前会话 | 将会话复制到新的持久化会话文件 |
| `/resume` | 会话列表 | 切换到另一个会话文件 |

关键区别：`/tree` 在一个会话文件内导航。`/branch` 移到一个包含截至选定点路径的新文件，并保持当前文件不变；`/fork` 复制文件；`/resume` 切换文件。

## 操作员工作流 \{#operator-workflows}

### 从更早的用户提示词重新运行，同时不丢失当前分支 \{#re-run-from-an-earlier-user-prompt-without-losing-current-branch}

1. `/tree`
2. 搜索/选择更早的用户消息
3. 选择 `No summary`（或按需生成摘要）
4. 在编辑器中编辑预填文本
5. 提交

效果：新分支从选定点开始，在同一会话文件内生长。

### 离开当前分支并留下上下文面包屑 \{#leave-current-branch-with-context-breadcrumb}

1. 启用 `branchSummary.enabled`
2. `/tree` 并选择目标节点
3. 选择 `Summarize`（或自定义提示词）

效果：继续之前，会在目标位置追加一个 `branch_summary` 条目。

### 调查隐藏的簿记条目 \{#investigate-hidden-bookkeeping-entries}

1. `/tree`
2. 按 `Alt+A`（全部）
3. 搜索 `model`、`thinking`、`custom` 或标签

效果：检查完整内部时间线，而非仅对话节点。

### 为转折点添加书签以便以后跳转 \{#bookmark-pivot-points-for-later-jumps}

1. `/tree`
2. 移动到条目
3. `Shift+L` 并设置标签
4. 之后使用 `Alt+L`（`labeled-only`）快速跳转

效果：在持久保留的分支地标之间快速导航。
