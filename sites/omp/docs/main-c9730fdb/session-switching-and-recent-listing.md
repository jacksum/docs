---
title: "会话切换与最近会话列表"
description: "Oh My Pi 官方仓库文档：会话切换与最近会话列表。"
---

# 会话切换与最近会话列表 \{#session-switching-and-recent-session-listing}

本文档描述编码智能体如何发现最近会话、解析 `--resume` 目标、呈现会话选择器，以及切换活动运行时会话。

重点是当前实现行为，包括回退路径和注意事项。

## 实现文件 \{#implementation-files}

- [`../src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)
- [`../src/session/session-listing.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-listing.ts)
- [`../src/session/session-paths.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-paths.ts)
- [`../src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`packages/coding-agent/src/cli/session-picker.tsx`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/cli/session-picker.tsx)
- [`packages/coding-agent/src/ui/overlays/pickers/session-selector.tsx`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/ui/overlays/pickers/session-selector.tsx)
- [`../src/modes/controllers/selector-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/selector-controller.ts)
- [`../src/main.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/main.ts)
- [`../src/sdk.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/sdk.ts)
- [`../src/modes/interactive-mode.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/interactive-mode.ts)
- [`../src/modes/utils/ui-helpers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/utils/ui-helpers.ts)

## 最近会话发现 \{#recent-session-discovery}

### 目录作用域 \{#directory-scope}

`SessionManager` 默认将文件会话存储在规范 cwd 的存储桶下：

- `~/.omp/agent/sessions/<encoded-cwd>/*.jsonl`

`<encoded-cwd>` 是路径编码后的规范 cwd（主目录下为 `-<relative>`，临时根目录下为 `-tmp-<relative>`，其他情况为 `--<encoded-absolute>--`；参见 [session.md](./session.md#on-disk-layout)）。已撤回的 17.2.5-17.2.8 哈希方案产生的存储桶会被尽力迁移。除非显式提供 `sessionDir`，否则 `SessionManager.list(cwd, sessionDir?)` 只读取解析得到的存储桶。

### 载荷不同的两条列表路径 \{#two-listing-paths-with-different-payloads}

有两条不同的列表流水线：

1. `getRecentSessions(sessionDir, limit = 4)`（欢迎/摘要视图）
   - 列出文件，并按 `mtime` 降序排序。
   - 使用 `history.db` 的会话标题索引，避免读取已建立索引的文件。
   - 对于没有索引标题的文件，使用与完整列表相同的前缀/尾部扫描和助手检测回退，跳过无标题的空占位会话，并将发现的标题回填到索引中。
   - 识别当前固定宽度标题槽文件和旧版头部开头的文件。
   - 返回轻量的 `RecentSessionInfo`（`path`、`name`、`timeAgo`）。

2. `SessionManager.list(...)` / `SessionManager.listAll()`（恢复选择器和 ID 匹配）
   - 通常读取每个文件的 4 KiB 前缀和最多 32 KiB 尾部。如果两个窗口都找不到助手轮次，存储提供的回退机制可能扫描正文行，直到找到一个，以避免将会话错误归类为空。
   - 构建 `SessionInfo`（`path`、`id`、`cwd`、标题/父级元数据、日期、大小、消息预览/计数和生命周期状态）。
   - 对列表文本使用前缀解析和标记计数，对最终消息的生命周期状态使用尾部解析；前缀以外的后续消息可能不包含在 `allMessagesText` 中。
   - 状态为 `complete`、`interrupted`、`aborted`、`error`、`pending` 或 `unknown`。
   - 底层扫描按 `modified` 降序排序；管理器 API 将置顶会话放在前面。以 stat 为键的扫描结果会缓存；大型列表使用有界并行工作进程。

选择器调用方使用 `listForPicker(...)` / `listAllForPicker()`，它们还会丢弃未置顶的无标题空占位会话。有标题或可发现的首条提示词时，会保留零轮次会话；尾部生命周期状态可防止将已有回答的会话误认为空占位会话。显式 ID 解析保留未过滤的扫描。

常规逐目录扫描会在主 JSONL 缺失时，修复由 EPERM 原子重写回退创建的最新孤立 `.bak`。`listSessionsReadOnly` 是不修改数据的变体。

### 元数据回退行为 \{#metadata-fallback-behavior}

对于最近会话摘要（`RecentSessionInfo`）：

- 显示名称优先顺序（`sessionDisplayName`）：`title` -> 首条用户消息 -> `Untitled · <time>` 标签（有意绝不使用原始 `id`）
- 欢迎屏幕按可用列宽截断渲染的名称（没有固定长度）
- 对从标题/消息派生的名称，只保留第一行，并去掉控制字符（`sanitizeSessionName`）

对于 `SessionInfo` 列表条目：

- `title` 在存在固定标题槽值时取该值，否则取 `header.title`，再否则取前缀中看到的最后一个上下文压缩 `shortSummary`
- `firstMessage` 是可从前缀中发现的首条用户消息文本，或 `"(no messages)"`
- 选择器还会显示修改时间、文件大小、实时会话上的 `current` 标记、生命周期状态（`unknown` 除外）、派生标记，以及全项目作用域下的 cwd

## `--continue` 解析与终端面包屑优先规则 \{#--continue-resolution-and-terminal-breadcrumb-preference}

`SessionManager.continueRecent(cwd, sessionDir?, storage?, { onSessionContinuation? })` 按以下顺序解析目标：

1. 读取终端作用域的面包屑（`~/.omp/agent/terminal-sessions/<terminal-id>`）
2. 验证面包屑。已实体化的目标可用；缺失目标仅在其可选第三行为 `fresh` 时可用，表示延迟尚未实体化的 `/new` 边界。
3. 缺失的 fresh 目标会启动新会话，而不是回退并恢复先前的会话记录。
4. 将修复前遗留的过期子代理面包屑解析到其交互式父会话。
5. 如果面包屑的 cwd 不同、已不存在，且没有真正的当前 cwd 会话享有优先权，则仅在其记录的设备/inode 与当前目录匹配时重新定位根目录（`open` + `moveTo`）。项目被删除、卸载或跨文件系统移动，并不是发生重命名的确凿证据。
6. 否则使用 cwd 与当前 cwd 匹配的面包屑（提供显式 `sessionDir` 时，还必须位于该目录中）；cwd 不匹配时，使用当前存储桶中最新的非空会话。
7. 没有可用面包屑时，按 mtime 选择最新的非空会话；如果不存在，则创建新会话。
8. 如果所选会话（包括第 5 步中重新定位根目录的会话）在同目录另一个文件中继续了对话（其头部通过 `continuationOf` 指明原会话的同级文件），则改为打开该副本，并向 `onSessionContinuation` 报告。面包屑指向的会话沿用 `--resume` 规则（`findSessionContinuation`）；按 mtime 选出的会话则使用 `findRecentSessionContinuation`，该函数会双向查看链接的副本。

终端 ID 派生优先使用 TTY 路径，回退到基于环境变量的标识符（`ZELLIJ_PANE_ID`、`TMUX_PANE`、`CMUX_SURFACE_ID`、`KITTY_WINDOW_ID`、`WEZTERM_PANE`、`TERM_SESSION_ID`、`WT_SESSION`）。存在 `ZELLIJ_SESSION_NAME` 时，Zellij ID 还会包含它，并规范化路径分隔符。

面包屑写入是尽力而为的，失败不会致命。

当唯一的位置参数值符合会话 id 形态时，`-c <value>` 会规范化为显式恢复目标；其他位置参数文本仍作为 `--continue` 的初始提示词。

## 启动时恢复目标解析（`main.ts`） \{#startup-time-resume-target-resolution-maints}

### `--resume <value>` \{#--resume-value}

`createSessionManager(...)` 以两种模式处理字符串值的 `--resume`：

1. 类路径值（包含 `/`、`\\`，或以 `.jsonl` 结尾）
   - 先执行 `findSessionContinuation(sessionArg)`；然后执行 `SessionManager.open(<continuation or sessionArg>, parsed.sessionDir, undefined, { throwIfMissing: true })`；路径缺失时以 `Session "<path>" not found.` 失败，而不是在该处创建会话

2. 恢复键值
   - `resolveResumableSession(...)` 先搜索本地会话，然后搜索所有会话，除非自定义 `sessionDir` 禁用了全局回退
   - 匹配不区分大小写，接受 `id` 前缀、完整 JSONL 文件名前缀，或时间戳后的会话 id 后缀
   - 使用按修改时间降序排列的第一个匹配项（没有歧义提示）
   - 没有匹配时，解析器（`resolveResumeTarget`）会在相同作用域中查找名称匹配、但内容已不再能读作会话的 `<timestamp>_<id>.jsonl` 文件（列表会跳过它）

两种模式都会跟随会话的延续副本：当对话在某个头部通过 `continuationOf` 指明原会话的同级文件中继续时，会打开具有最新轮次的副本（除非指定文件具有该副本缺少的轮次），并用通知列出两个文件。如果一个文件已不再包含其生成名称所记录的会话，则说明该会话所在文件被替换；当文件已无法解析，或恢复键仅匹配了文件名而文件包含另一个会话时，会按该名称中的 id 跟随原会话。

如果匹配会话所记录的 cwd 已不存在，CLI 会提示 `Move (re-root) it into the current directory? [Y/n]`。接受会打开会话，并由 `moveTo(cwd)` 将其重定位；拒绝则正常退出。非 TTY 无法回答，会引发 `SessionResolutionError`。在 `--mode rpc`、`--mode rpc-ui` 和 `--mode acp` 下，无论是否存在 TTY，都不询问：会话在存储位置打开，并以启动目录作为工作目录。如果会话记录在启动检出目录所属仓库的某个现已移除的工作树中，则在所有模式下都会直接移到启动目录，不询问。

否则，会话会在其记录的项目中打开，全局匹配也一样；启动过程会切换进程 cwd、重新加载项目作用域的设置/插件，并在构建智能体之前重新解析已启用的模型。它**不会**仅因匹配跨项目就派生新会话。

没有匹配项，且没有未列出但被替换并带延续副本的文件时，抛出 `Session "..." not found.`。

### `--resume`（不带值） \{#--resume-no-value}

在初始会话管理器构建后处理：

1. 使用 `SessionManager.listForPicker(cwd, parsed.sessionDir)` 列出当前文件夹会话
2. 如果为空，则探测 `SessionManager.listAllForPicker()`，仅用于区分全局为空的状态并预加载 Tab 作用域；选择器本身绝不会自动切换到全项目作用域
3. 如果两个列表均为空，则打印 `No sessions found` 并退出
4. 打开全屏 TUI 选择器（`selectSession`）
5. 如果取消，则打印 `No session selected` 并退出
6. 选择后执行 `SessionManager.open(selected.path)`，然后将进程/项目作用域状态切换到该会话的 cwd（`switchToResumedProject`：`setProjectDir`、插件缓存重置、设置重载），并重新解析作用域内模型

### `--continue` \{#--continue}

直接使用 `SessionManager.continueRecent(...)`（遵循上述面包屑优先行为）。

## 基于选择器的选择内部机制 \{#picker-based-selection-internals}

## CLI 选择器（`packages/coding-agent/src/cli/session-picker.tsx`） \{#cli-picker-packagescoding-agentsrcclisession-pickertsx}

`selectSession(sessions, options)` 使用 `SessionSelectorComponent` 创建一个全屏备用屏幕 TUI，并且只兑现一次：

- 选择 -> 兑现为选定的 `SessionInfo`
- 取消（Esc）-> 兑现为 `null`
- 强制退出（Ctrl+C 路径）-> 停止 TUI 并退出
- Tab 切换当前文件夹/全项目作用域；全项目列表按需延迟加载，或由调用方预加载提供
- 搜索在短暂防抖后，将会话元数据/前缀文本与 `history.db` 中的提示词历史匹配项结合
- 在全屏选择器中，鼠标滚轮改变选择，左键单击进行选择
- `app.session.delete`（默认 Backspace 或 Delete）打开确认并删除 JSONL 及会话产物；如果绑定键同时具有向后删除功能，则优先编辑已输入的搜索内容

## 会话内交互式选择器（`SelectorController.showSessionSelector`） \{#interactive-in-session-picker-selectorcontrollershowsessionselector}

流程：

1. 通过 `SessionManager.listForPicker(currentCwd, currentSessionDir)` 获取当前文件夹会话；即使文件夹作用域为空，全项目列表也保持延迟加载
2. 通过 `ctx.ui.showOverlay` 将 `SessionSelectorComponent` 作为全屏备用屏幕覆盖层呈现（以左上角为锚点，占满尺寸；下方的会话记录不受影响），并接入延迟全项目加载（`loadAllSessions`）、`history.db` 提示词匹配器、删除、置顶会话标记和当前会话标记
3. 回调：
   - 选择 -> 锁定选择器输入并调用 `handleResumeSession(sessionPath, { followContinuation: true })`；成功时隐藏覆盖层并恢复编辑器焦点，可恢复的切换前失败则解锁选择器并保持打开
   - 取消 -> 隐藏覆盖层、恢复编辑器焦点、重新渲染
   - 退出 -> 隐藏覆盖层，然后调用 `ctx.shutdown()`

`/resume <id-prefix>` 使用 `resolveResumeTarget` 先解析本地再解析全局匹配项，与 CLI 的 `--resume <id>` 使用同一个解析器，并切换到它选中的副本。`/resume @claude` 和 `/resume @codex` 则打开源只读的导入选择器：选中的外部会话记录会持久化为 OMP 会话，然后切换到它；这些选择器不提供删除、历史补充和全项目作用域。

## 会话选择器组件行为 \{#session-selector-component-behavior}

`SessionList` 支持：

- Up/Down 和 Page Up/Page Down 导航（限制在边界，不循环）
- Enter 选择
- `app.session.delete`（默认 Backspace 或 Delete；Backspace 优先编辑已输入的搜索内容）在确认后删除
- Esc 取消；Ctrl+C 退出
- Tab 切换当前文件夹/全项目作用域
- 全屏选择器中的鼠标滚轮/单击
- 跨 id/标题/cwd/首条消息/前缀消息文本/路径的多词元搜索：字面匹配按最近优先排在前面，随后是足够强的模糊匹配；输入暂停后，可能会提升来自 `history.db` 的提示词历史匹配项
- 实时会话（提供了 `currentSessionPath` 时）在元数据行中标记为 `current`，并在打开以及 Tab 切换作用域后获得焦点

空列表渲染行为：

- 当前文件夹作用域显示 `No sessions in current folder. Press Tab to view all.`；全项目作用域显示 `No sessions found`
- 列表为空时，Enter/Delete/Backspace 无操作
- Esc/Ctrl+C 仍然有效

## 运行时切换执行（`AgentSession.switchSession`） \{#runtime-switch-execution-agentsessionswitchsession}

`switchSession(sessionPath)` 是核心的进程内切换路径。

生命周期/状态转换：

1. 捕获先前的文件，并发出可取消的 `session_before_switch`（`reason: "resume"`，目标文件）
2. 断开智能体监听器，中止活动工作，运行切换前协调器，并刷写待处理的 bash/会话写入
3. 保存回滚状态快照（管理器、队列、消息、模型/思考/层级、工具/提示词、提供方缓存标识以及检查点/回退状态），然后清空消息队列
4. 对于不同的会话，排空并分离顾问记录器
5. `sessionManager.setSessionFile(sessionPath)`：更新面包屑，加载/迁移/解析 blob/索引条目，并在 cwd 策略允许时采用已记录且存在的 cwd
6. 同步会话 id、记忆键、继承的提供方缓存键和显示上下文；解析已记录的模型（见下文）；重新载入检查点/回退状态
7. 发出 `session_switch`，替换消息，重置顾问会话状态，并同步待办事项
8. 对于不同的会话，或重放发生变化的同一会话重新加载，关闭提供方会话
9. 应用解析出的模型，或调用方显式指定的 `model`
10.   如果加载的分支以中断的工具流程结束，则追加一条合成的中止消息，并重建显示上下文
11.   恢复已配置的思考设置（`auto` 仍保持为 auto）和各模型家族的服务层级，没有对应条目时回退到当前设置
12.   按需重置记忆/工具会话状态，重新连接监听器，运行模式协调，并刷新可感知工作区的基础系统提示词
13.   对于不同的会话，恢复顾问费用，完成 bash 过渡，通知会话变更回调，并在成功时返回 `true`
      当切换前钩子取消，或 cwd 策略拒绝过渡时，`switchSession()` 返回 `false`。没有 cwd 变更回调的跨项目切换会被拒绝，而不是静默采用目标 cwd；回调拒绝也视为取消。

快照之后发生的失败会恢复先前的管理器和运行时状态，重新连接并协调这些状态，并将 bash 过渡标记为失败。cwd 策略拒绝会返回 `false`；其他失败会重新抛出。成功路径上的模式协调和基础提示词刷新失败会被记入日志，而不会回滚切换。

已记录模型的解析方式与启动时恢复相同：选择第一个已注册、已启用且已配置凭据的角色/默认候选项，并在按提供方范围刷新发现结果后重试一次。如果切换到不同会话时没有候选项能够解析，切换会在 `session_switch` 之前抛出 `Could not restore model <provider/id>`，并回滚。使用 `hasUI` 和 `allowSessionModelFallback` 创建的会话（TUI）在开启 `retry.modelFallback` 时则会保留当前模型，并通过 `onModelFallback` 或 `notice` 事件报告 `Could not restore model <provider/id>. Using <provider/id>`。重新加载同一文件会保留当前模型。自行选择模型的调用方传入 `model`（RPC `open_session`/`switch_session` 搭配 `provider`/`modelId`）；协作副本传入 `keepModel`，因为其模型由宿主状态提供。

## 交互式切换后的 UI 状态重建 \{#ui-state-rebuild-after-interactive-switch}

`SelectorController.handleResumeSession` 首先调用 `switchSession`（针对续接指向的副本，此处通过 `followContinuation` 找到，或由调用方传入）。如果返回 `false`，选择器会在应用任何新会话 UI 更新之前停止，保持现有会话/UI 不变。切换成功后，它会：

- 停止加载动画
- 清空状态容器
- 清空待处理消息 UI 和待处理工具映射
- 重置流式组件/消息引用
- 如果恢复会话的 cwd 与先前不同，将进程和由 cwd 派生的缓存重新指向该目录（`applyCwdChange`）
- 清空聊天容器，并根据会话上下文重新渲染（`renderInitialMessages`）
- 从新会话产物中重新加载待办事项
- 显示 `Resumed session`（跨项目恢复时则显示 `Resumed session in <dir>`），然后显示模型回退警告（如有）

因此，可见的对话/待办事项状态会根据新的会话文件重建。

## 启动时恢复与会话内切换 \{#startup-resume-vs-in-session-switch}

### 启动时恢复（`--continue`、`--resume`、直接打开） \{#startup-resume---continue---resume-direct-open}

- 在 `createAgentSession(...)` 之前选择会话文件。
- `sdk.ts` 在创建期间构建现有会话上下文。
- 智能体消息和重放状态在构造期间恢复一次。
- 模型/思考/服务层级使用持久化状态，并以当前配置作为回退。
- 交互模式随后协调持久化的模式状态。

### 会话内切换（`/resume` 风格的选择器路径） \{#in-session-switch-resume-style-selector-path}

- 对已经运行的会话使用 `AgentSession.switchSession(...)`。
- 就地重建消息/模型/思考/层级和会话范围内的运行时状态。
- 发出 `session_before_switch`/`session_switch` 钩子。
- 刷新 UI 聊天/待办事项。
- 交互模式协调通过已注册的会话切换协调器运行。

## 失败和边界情况行为 \{#failure-and-edge-case-behavior}

### 取消路径 \{#cancellation-paths}

- 取消 CLI 选择器 -> 返回 `null`，调用方打印 `No session selected`，进程退出。
- 取消交互式选择器 -> 关闭浮层，不更改会话。
- 核心钩子或 cwd 策略取消 -> `switchSession()` 返回 `false`；交互式选择器会在进入 UI 刷新/状态路径之前停止，保留旧会话和 UI。没有回调的跨项目切换会被拒绝，而不是静默采用目标 cwd。
- 已保存的模型无法恢复且未获准回退 -> `switchSession()` 抛出 `Could not restore model <provider/id>`；选择器和 `/resume <id>` 显示错误，并保留旧会话。

### 空列表路径 \{#empty-list-paths}

- CLI `--resume`（不带值）：仅当当前文件夹列表**和**全局列表均为空时，才打印 `No sessions found` 并退出；否则，空的文件夹范围选择器会提示使用 Tab。
- 交互式选择器：文件夹范围为空时显示 Tab 提示，且仍可取消。

### 目标会话文件缺失/无效 \{#missinginvalid-target-session-file}

打开/切换到特定路径时（`setSessionFile`）：

- 传给 `setSessionFile` 的显式路径不存在或内容为空时，会在该路径初始化并持久化一个新会话。
- 非空文件的头部缺失/格式错误时，会抛出 `Cannot resume session "...": the session header is missing or malformed. The file was not modified.`
- 严格的打开/恢复路径可能会拒绝没有条目的文件，而不是创建它们。
- 有效头部之后格式错误的正文记录会以宽松方式恢复，并将加载的文件标记为需要重写。

无效头部恢复绝不会覆盖原始文件。

### 硬失败 \{#hard-failures}

切换/打开仍可能因真正的 I/O 失败（权限错误、重写失败等）而抛出异常，这些异常会传播给调用方。

### ID 前缀匹配注意事项 \{#id-prefix-matching-caveats}

- 匹配对转为小写的会话 id、转为小写的 JSONL 文件名，以及文件名时间戳之后转为小写的 id 后缀使用 `startsWith`。
- 按修改时间降序排列后的第一个匹配项胜出；多个会话共享前缀时，不提供歧义选择 UI。
- 前缀列表元数据有意保持轻量，因此搜索文本可能不包含会话文件前 4KB 以外的消息。
