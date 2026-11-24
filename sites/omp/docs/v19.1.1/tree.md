---
title: "会话树命令"
description: "Oh My Pi v19.1.1 仓库文档：会话树命令。"
---

# `/tree` 命令参考 \{#tree-command-reference}

`/tree` 打开交互式**会话树**导航器。你可以跳转到当前会话文件中的任意条目，并从那里继续。

这只会在同一个文件内移动叶节点，不会导出新会话。

## `/tree` 的行为 \{#what-tree-does}

- 根据当前会话的条目构建树（`SessionManager.getTree()`）
- 打开支持键盘导航、筛选和搜索的 `TreeSelectorComponent`
- 选中条目后调用 `AgentSession.navigateTree(targetId, { summarize, customInstructions })`
- 根据新叶节点所在的路径重建可见的聊天记录
- 选择用户消息或自定义消息时，可预填编辑器文本

主要实现：

- `packages/coding-agent/src/slash-commands/builtin-session.ts`（`/tree`、`/branch` 命令路由）
- `packages/coding-agent/src/modes/controllers/input-controller.ts`（快捷键绑定、连按两次 Esc 的行为）
- `packages/coding-agent/src/modes/controllers/selector-controller.ts`（打开会话树界面、分支摘要提示流程）
- `packages/tui/src/overlays/tree-selector.ts`（导航、筛选、搜索、标签、渲染）
- `packages/coding-agent/src/session/agent-session.ts`（`navigateTree` 切换叶节点并按需生成摘要）
- `packages/coding-agent/src/session/session-manager.ts`（`getTree`、`branch`、`branchWithSummary`、`resetLeaf`、标签持久化）

## 打开会话树 \{#how-to-open-it}

以下方式打开的是同一个选择器：

- `/tree`
- 为 `app.session.tree` 操作配置的快捷键

编辑器为空时，连按两次 Esc 的行为由 `doubleEscapeAction` 控制：`rewind`（默认）打开全屏对话回退选择器，`tree` 打开此会话树选择器，`none` 禁用该快捷键。对话回退对每个目标调用 `navigateTree(..., { summarize: false })`，并保留在当前会话文件中。用户请求草稿会替换编辑器中的文本。

回退选择器打开时显示最新约 600 个条目，并保留完整的用户轮次（因此可能超出上限）。按 `a` 可查看此前的全部历史，不改变选中的位置或分支。
按 `f` 可筛选回放的对话记录（会加载整个分支）；回退选择器显示同级分支栏时，可用左、右方向键在其中导航。这些操作仅适用于对话回退，不适用于下文的会话树选择器。

## 会话树的界面模型 \{#tree-ui-model}

界面根据会话条目的父节点指针（`id` / `parentId`）渲染会话树。

- 子节点按时间戳升序排列
- 包含当前叶节点的分支在选择器中排在首位，其他历史仍可访问
- 活动分支（从根到叶节点的路径）用圆点标记
- 标签以 `[label]` 的形式显示在节点文本之前
- 父节点缺失、将自身作为父节点或显式将父节点设为空值的条目会成为根节点；多个根节点共享一个虚拟根节点来分出各支

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

选择器会以当前选中项重新居中，最多显示：

- `max(1, min(max(5, floor(terminalHeight / 2)), terminalHeight - 8))` 行，在高度较小的终端中留出面板界面元素所需的空间

## 会话树选择器的快捷键 \{#keybindings-inside-tree-selector}

- `Up` / `Down`：移动选中项（首尾循环）
- `Alt+Up` / `Alt+Down`：跳到上一轮或下一轮用户或助手消息
- `app.tree.previousBranch` / `app.tree.nextBranch`（默认未绑定，可在 [`keybindings.yml`](./keybindings.md) 中绑定，例如绑定到 `Shift+Left` / `Shift+Right`）：按显示顺序跳到上一个或下一个可见分支（首尾循环），可跨越嵌套的派生层级。如果分支起始节点被筛选掉，则跳到该分支的第一个可见后代节点。
- `Page Up` / `Page Down`，或 `Left` / `Right`：翻页
- `Home` / `End`：跳到第一个或最后一个可见条目
- `Enter`：选择节点
- `Shift+Enter`：生成摘要并切换，不打开摘要选项提示
- `Esc`：正在搜索时清除搜索，否则关闭选择器
- `Ctrl+C`：关闭选择器
- `Type`：将输入追加到搜索词
- `Backspace`：删除搜索词中的一个字符
- `Shift+L`：搜索为空时编辑或清除标签
- `Ctrl+O`：向前循环切换筛选模式
- `Shift+Ctrl+O`：向后循环切换筛选模式
- `Alt+D/T/U/L/A`：直接跳到某个筛选模式

## 筛选和搜索规则 \{#filters-and-search-semantics}

初始模式由 `treeFilterMode` 决定（默认为 `default`）。模式按以下顺序循环：

1. `default`
2. `no-tools`
3. `user-only`
4. `labeled-only`
5. `all`

### `default` \{#default}

显示对话节点，以及未被明确隐藏的各类条目。以下设置和内部记录类条目会被隐藏：

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

`all` 筛选模式将这些条目显示为元数据行。没有专用渲染方式的条目会显示其类型名称，不会显示为空白行。

### `no-tools` \{#no-tools}

与 `default` 相同，但还会隐藏 `toolResult` 消息。

### `user-only` \{#user-only}

显示用户请求：普通用户消息，以及用户调用技能或协作时产生的自定义提示。

### `labeled-only` \{#labeled-only}

只显示当前有有效标签的条目。

### `all` \{#all}

显示会话树中的所有内容，包括内部记录和自定义条目。

### 仅含工具调用的助手节点 \{#tool-only-assistant-node-behavior}

仅含工具调用、不含规范文本的助手消息在所有筛选模式中都会隐藏，包括 `all`，除非：

- 消息出错或已中止（`stopReason` 既不是 `stop`，也不是 `toolUse`），或者
- 该消息是当前叶节点

### 搜索行为 \{#search-behavior}

- 按空格将搜索词拆成多个词项
- 使用模糊匹配（子序列匹配），不区分大小写（`fuzzyMatch`）
- 所有词项都必须匹配（AND 语义）
- 可搜索文本包括标签、角色和特定于条目类型的内容（例如消息文本、分支摘要文本、自定义类型、工具命令片段）
- 消息和自定义消息的搜索预览以 200 个字符为限；搜索不会索引长消息的每个字节。

## 选择节点的结果（重要） \{#selection-outcomes-important}

`navigateTree` 根据选中的条目类型决定如何设置新叶节点：

### 选择 `user` 消息 \{#selecting-user-message}

- 新叶节点设为所选条目的 `parentId`
- 选择作为根节点的用户消息时，叶节点重置到根
- 文本和图片附件会重建为可编辑草稿
- 只有当前编辑器为空时，选择器才会写入草稿

### 选择 `custom_message` \{#selecting-custom_message}

- 普通自定义消息与用户消息一样，将父节点设为叶节点并预填文本
- 用户调用技能或协作时产生的自定义提示会恢复原始用户草稿和图片附件，并将父节点设为叶节点
- 由代理注入或自动加载的 `skill-prompt` 不可编辑；选中时会与其他非用户条目一样跳到该节点

### 选择过去的 `ask` 工具结果 \{#selecting-a-past-ask-tool-result}

- 交互式 `/tree` 会重新打开原表单，不会复用旧答案
- 取消后，会话树不变
- 新答案会作为一个同级工具结果追加，保留旧答案所在的分支，之后代理从新答案继续
- 如果由于旧版数据或数据损坏而无法恢复原表单的 `html`，则退回到只移动叶节点

### 选择其他节点 \{#selecting-other-nodes}

- 新叶节点设为所选节点 ID
- 不预填编辑器

### 选择当前叶节点 \{#selecting-current-leaf}

- 通常会关闭选择器并显示 `Already at this point`
- `/tree` 界面在选中作为当前叶节点的用户提示时不执行操作；通过 `/branch` 回退对话，或直接调用 `navigateTree()`，仍可回退到该提示之前
- 如果当前叶节点是 `ask` 的结果，仍可重新回答

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

是否弹出摘要提示由 `branchSummary.enabled` 控制（默认为 `false`）。不论此设置如何，`Shift+Enter` 都会直接请求生成摘要。必须有可用的模型；只有运行内置摘要生成器时才检查模型提供方凭据（钩子提供摘要或离开的路径为空时不检查）。

启用提示时，直接按 Enter 会提供以下选项：

- `No summary`
- `Summarize`
- `Summarize with custom prompt`

流程细节：

- 在摘要提示中按 Esc 会重新打开会话树选择器
- 取消自定义提示会返回摘要选项
- 生成摘要期间，界面会显示加载指示，并将 Esc 绑定到 `abortBranchSummary()`
- 如果摘要生成中止，会话树选择器会重新打开，叶节点不会移动

`navigateTree` 的内部流程：

- 写出待处理的 bash 输出，并校验目标
- 收集离开的分支上从旧叶节点到共同祖先的条目
- 触发可取消的 `session_before_tree`；扩展可以提供请求的摘要
- 仅当请求了摘要、有条目需要总结、且没有钩子提供摘要时，才运行默认的摘要生成器
- 视情况调用 `branchWithSummary(...)`、`branch(newLeafId)` 或 `resetLeaf()`
- 重建模型上下文、检查点与回退状态、顾问状态、待办事项，以及受历史重写影响的模型提供方会话
- 触发 `session_tree`；如果处理函数可能追加了条目，则再次重建

如果请求了摘要但没有可总结的内容，导航会继续，但不会添加摘要条目。

## 标签 \{#labels}

在会话树界面中编辑标签会调用 `appendLabelChange(targetId, label)`。

- 非空标签会设置或更新当前有效标签
- 空标签会清除当前有效标签
- 标签存储为仅追加的 `label` 条目
- 会话树节点显示当前有效标签，不显示原始的标签条目历史

## `/tree` 与相关操作 \{#tree-vs-adjacent-operations}

| 操作 | 范围 | 结果 |
| --------------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `/tree` | 当前会话文件 | 将叶节点移到所选位置（同一文件） |
| `/branch`（别名 `/rewind`） | 当前会话文件 | 打开对话回退选择器；在原文件内移动叶节点，并恢复用户请求草稿 |
| `/fork` | 整个当前会话 | 将会话复制到新的持久化会话文件 |
| `/resume` | 会话列表 | 切换到另一个会话文件 |

主要区别：`/tree` 和 `/branch` 在同一个会话文件内导航。`/fork` 复制文件，`/resume` 切换文件。通过程序调用 `AgentSession.branch()` API 仍会创建一个独立的分支会话。

## 常见操作流程 \{#operator-workflows}

### 从较早的用户提示重新运行，保留当前分支 \{#re-run-from-an-earlier-user-prompt-without-losing-current-branch}

1. `/tree`
2. 搜索并选择较早的用户消息
3. 选择 `No summary`（或按需生成摘要）
4. 在编辑器中修改预填文本
5. 提交

结果：新分支从所选位置开始，在同一会话文件内继续。

### 离开当前分支时留下上下文线索 \{#leave-current-branch-with-context-breadcrumb}

1. 启用 `branchSummary.enabled`
2. 使用 `/tree` 并选择目标节点
3. 选择 `Summarize`（或使用自定义提示）

结果：继续之前，会在目标位置追加一条 `branch_summary` 条目。

### 查看隐藏的内部记录条目 \{#investigate-hidden-bookkeeping-entries}

1. `/tree`
2. 按 `Alt+A`（全部）
3. 搜索 `model`、`thinking`、`custom` 或标签

结果：可以检查完整的内部时间线，而不只是对话节点。

### 为关键位置添加书签以便日后跳转 \{#bookmark-pivot-points-for-later-jumps}

1. `/tree`
2. 移到要标记的条目
3. 按 `Shift+L` 并设置标签
4. 之后用 `Alt+L`（`labeled-only`）快速跳转

结果：可以在分支中持久保存的标记位置之间快速导航。
