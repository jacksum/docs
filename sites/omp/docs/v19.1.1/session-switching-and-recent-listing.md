---
title: "切换与列出会话"
description: "Oh My Pi v19.1.1 仓库文档：切换与列出会话。"
---

# 会话切换与最近会话列表 \{#session-switching-and-recent-session-listing}

本文说明 coding-agent 如何查找最近会话、解析 `--resume` 的目标、显示会话选择器，以及在运行时切换当前会话。

本文聚焦当前实现的行为，包括回退路径和注意事项。

## 实现文件 \{#implementation-files}

- [`../src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/session-manager.ts)
- [`../src/session/session-listing.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/session-listing.ts)
- [`../src/session/session-paths.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/session-paths.ts)
- [`../src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/agent-session.ts)
- [`packages/tui/src/apps/session-picker.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/tui/src/apps/session-picker.ts)
- [`packages/tui/src/overlays/session-selector.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/tui/src/overlays/session-selector.ts)
- [`../src/modes/controllers/selector-controller.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/modes/controllers/selector-controller.ts)
- [`../src/main.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/main.ts)
- [`../src/sdk.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/sdk.ts)
- [`../src/modes/interactive-mode.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/modes/interactive-mode.ts)
- [`../src/modes/utils/ui-helpers.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/modes/utils/ui-helpers.ts)

## 查找最近会话 \{#recent-session-discovery}

### 目录范围 \{#directory-scope}

默认情况下，`SessionManager` 将基于文件的会话存放在按规范化后的当前工作目录划分的存储目录中：

- `~/.omp/agent/sessions/<encoded-cwd>/*.jsonl`

`<encoded-cwd>` 是规范化后的当前工作目录经路径编码得到的结果（在用户主目录下用 `-<relative>`，在临时目录根目录下用 `-tmp-<relative>`，其他情况用 `--<encoded-absolute>--`；见 [session.md](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/session.md#on-disk-layout)）。系统会尽力迁移 17.2.5-17.2.8 中后来撤回的哈希方案所使用的存储目录。`SessionManager.list(cwd, sessionDir?)` 仅读取解析出的存储目录，除非显式提供 `sessionDir`。

### 返回不同数据的两种列表流程 \{#two-listing-paths-with-different-payloads}

会话列表有两种生成流程：

1. `getRecentSessions(sessionDir, limit = 4)`（欢迎界面和摘要视图）
   - 列出文件，按 `mtime` 降序排列。
   - 借助 `history.db` 中的会话标题索引，避免读取已编入索引的文件。
   - 对于标题未编入索引的文件，采用与完整列表相同的文件头尾扫描与助手消息检测回退逻辑，跳过无标题的空会话占位文件，并将找到的标题补录到索引中。
   - 支持当前采用固定宽度标题槽的文件，以及旧版以会话头开头的文件。
   - 返回轻量的 `RecentSessionInfo`（`path`、`name`、`timeAgo`）。

2. `SessionManager.list(...)` / `SessionManager.listAll()`（恢复选择器和 ID 匹配）
   - 通常读取每个文件开头的 4 KiB 和末尾最多 32 KiB。如果这两个窗口都未找到助手轮次，则存储层提供的回退逻辑可能逐行扫描正文，直到找到一轮，以免将会话误判为空。
   - 构建 `SessionInfo`（`path`、`id`、`cwd`、标题和父会话元数据、日期、大小、消息预览和计数以及生命周期状态）。
   - 通过解析文件开头并统计标记来生成列表文本，通过解析文件末尾来确定最后一条消息的生命周期状态。超出文件开头扫描范围的后续消息可能不在 `allMessagesText` 中。
   - 状态为 `complete`、`interrupted`、`aborted`、`error`、`pending` 或 `unknown`。
   - 底层扫描结果按 `modified` 降序排列，管理器 API 则将置顶会话放在最前面。扫描结果以文件状态信息为键缓存；较大的列表由数量受限的并行工作单元处理。

选择器调用 `listForPicker(...)` / `listAllForPicker()`，也会过滤无标题的空会话占位文件，除非会话已置顶。有标题或可发现首条提示词的零轮次会话会保留；从文件末尾获得的生命周期状态可避免将已有回复的会话误判为空会话占位文件。显式解析 ID 时，仍使用未过滤的扫描结果。

常规的逐目录扫描会修复最新的孤立 `.bak`：它是 EPERM 原子重写回退所创建的备份，而主 JSONL 文件已不存在。`listSessionsReadOnly` 是不修改文件的版本。

### 元数据的回退行为 \{#metadata-fallback-behavior}

对于最近会话摘要（`RecentSessionInfo`）：

- 显示名称的优先顺序（`sessionDisplayName`）：`title`、首条用户消息、`Untitled · <time>` 标签（刻意不使用原始 `id`）
- 欢迎界面会按可用列宽截断显示的名称，没有固定长度
- 从标题或消息取出的名称只保留首行，并移除控制字符（`sanitizeSessionName`）

对于 `SessionInfo` 列表条目：

- `title` 优先使用固定标题槽的值，其次使用 `header.title`，再其次使用从文件开头读到的最后一个上下文压缩条目的 `shortSummary`
- `firstMessage` 是从文件开头能找到的首条用户消息的文本，找不到时为 `"(no messages)"`
- 选择器还显示修改时间、文件大小、活动会话的 `current` 标记、生命周期状态（`unknown` 除外）、派生标记，以及所有项目范围下的当前工作目录

## `--continue` 的解析与终端续接线索优先规则 \{#--continue-resolution-and-terminal-breadcrumb-preference}

`SessionManager.continueRecent(cwd, sessionDir?, storage?, { onSessionContinuation? })` 按以下顺序解析目标：

1. 读取终端专属的续接线索（`~/.omp/agent/terminal-sessions/<terminal-id>`）
2. 验证线索。目标文件已实际创建时可用；目标缺失时，仅当线索的可选第三行为 `fresh` 时可用，表示 `/new` 划定了新会话边界，但会话文件尚未按需创建。
3. 新会话目标缺失时，启动新会话，不回退到并恢复之前的对话记录。
4. 将修复前留下的过时子代理续接线索解析到其交互式父会话。
5. 如果线索中的工作目录与当前目录不同且已不存在，并且没有真正属于当前工作目录的会话优先，则仅当记录的设备号和 inode 与当前目录匹配时，才将会话重新归到当前目录（`open` + `moveTo`）。项目被删除、被卸载或跨文件系统移动，都不足以证明目录已重命名。
6. 否则，使用工作目录与当前目录一致的线索（如果显式提供了 `sessionDir`，其指向的会话文件还必须位于该目录内）；若工作目录不匹配，则使用当前存储目录中最新的非空会话。
7. 没有可用线索时，按 mtime 选取最新的非空会话；如果没有，则创建新会话。
8. 如果所选会话（包括第 5 步中重新归到当前目录的会话）在同一目录的另一个文件中续接（同级文件的会话头用 `continuationOf` 指明原会话），则改为打开该副本，并向 `onSessionContinuation` 报告。续接线索指定的会话仍采用 `--resume` 的规则（`findSessionContinuation`）；按 mtime 选取的会话使用 `findRecentSessionContinuation`，双向查找关联副本。

终端 ID 优先根据 TTY 路径生成，否则使用基于环境变量的标识符（`ZELLIJ_PANE_ID`、`TMUX_PANE`、`CMUX_SURFACE_ID`、`KITTY_WINDOW_ID`、`WEZTERM_PANE`、`TERM_SESSION_ID`、`WT_SESSION`）。如果存在 `ZELLIJ_SESSION_NAME`，Zellij 的 ID 也包含它，并对路径分隔符做规范化处理。

系统会尽力写入续接线索，写入失败不影响继续运行。

如果唯一的位置参数符合会话 ID 的格式，`-c <value>` 会规范化为显式恢复目标；其他位置参数文本仍作为 `--continue` 的初始提示词。

## 启动时解析恢复目标（`main.ts`） \{#startup-time-resume-target-resolution-maints}

### `--resume <value>` \{#--resume-value}

`createSessionManager(...)` 以两种模式处理值为字符串的 `--resume`：

1. 形似路径的值（含 `/` 或 `\\`，或以 `.jsonl` 结尾）
   - 先调用 `findSessionContinuation(sessionArg)`，再调用 `SessionManager.open(<continuation or sessionArg>, parsed.sessionDir, undefined, { throwIfMissing: true })`；路径不存在时会报错 `Session "<path>" not found.`，不会在那里创建会话

2. 用于恢复的键值
   - `resolveResumableSession(...)` 先查找本地会话，再查找所有会话；自定义 `sessionDir` 时禁用全局回退
   - 匹配不区分大小写，接受 `id` 前缀、完整 JSONL 文件名的前缀，或时间戳之后的会话 ID 后缀
   - 使用按修改时间降序排列的第一个匹配项，不询问如何消解歧义
   - 没有匹配项时，解析器（`resolveResumeTarget`）会在相同范围内查找文件名相符但已无法作为会话读取的 `<timestamp>_<id>.jsonl` 文件（列表会跳过它）

两种模式都会沿会话的续接关系查找。如果对话在同级文件中继续，且该文件的会话头通过 `continuationOf` 指向原会话，就改为打开含最新轮次的副本，除非指定的文件含有该副本没有的轮次；通知会列出两个文件。若文件内已不再保存其生成文件名所记录的会话，说明该文件被替换了。如果该文件已无法解析，就按其文件名中的 ID 继续查找；如果恢复键只匹配到文件名，而文件中保存的是另一个会话，也会按该 ID 继续查找。

如果匹配会话记录的工作目录已不存在，CLI 会询问 `Move (re-root) it into the current directory? [Y/n]`。同意后会打开会话，并用 `moveTo(cwd)` 将其迁移到当前目录；拒绝则正常退出。非 TTY 环境无法回答，会抛出 `SessionResolutionError`。在 `--mode rpc`、`--mode rpc-ui` 和 `--mode acp` 下，无论是否有 TTY 都不会询问：会话在存储位置打开，以启动目录作为工作目录。如果会话记录的工作目录是启动时检出所在仓库中已删除的工作树，则在所有模式下都直接将会话移到启动目录，无需询问。

其他情况下，会话在所记录的项目中打开，全局匹配项也一样。启动时会切换进程的工作目录，重新加载项目范围内的设置和插件，并在构建代理之前重新解析启用的模型。系统**不会**仅因为匹配项来自其他项目就派生会话。

如果没有匹配项，也没有未列出但存在续接副本的已替换文件，就会抛出 `Session "..." not found.`。

### `--resume`（不带值） \{#--resume-no-value}

在初次构建会话管理器后处理：

1. 使用 `SessionManager.listForPicker(cwd, parsed.sessionDir)` 列出当前文件夹的会话
2. 如果为空，只探查 `SessionManager.listAllForPicker()`，用于区分是否全局都为空，并为 Tab 切换范围预加载列表；选择器本身从不自动切换到所有项目范围
3. 两个列表都为空时，输出 `No sessions found` 并退出
4. 打开全屏 TUI 选择器（`selectSession`）
5. 取消时，输出 `No session selected` 并退出
6. 选中后，调用 `SessionManager.open(selected.path)`，再将进程及项目范围内的状态切换到该会话的工作目录（`switchToResumedProject`：`setProjectDir`、重置插件缓存、重新加载设置），并重新解析该范围内的模型

### `--continue` \{#--continue}

直接调用 `SessionManager.continueRecent(...)`，按上文的规则优先采用续接线索。

## 基于选择器的选择机制 \{#picker-based-selection-internals}

## CLI 选择器（`packages/tui/src/apps/session-picker.ts`） \{#cli-picker-packagestuisrcappssession-pickerts}

`selectSession(sessions, options)` 使用 `SessionSelectorComponent` 创建一个采用终端备用屏幕的全屏 TUI，且只会完成一次：

- 选中：以选中的 `SessionInfo` 完成
- 取消（Esc）：以 `null` 完成
- 强制退出（Ctrl+C）：停止 TUI 并退出
- Tab 在当前文件夹和所有项目范围之间切换；所有项目列表按需加载，也可以预加载后传入
- 短暂的防抖延迟后，搜索会将会话元数据和文件开头文本中的匹配项与 `history.db` 中的历史提示词匹配项合并
- 在全屏选择器中，滚动鼠标滚轮可移动选中项，左键单击可选定会话
- `app.session.delete`（默认是 Backspace 或 Delete）会弹出确认提示，确认后删除 JSONL 文件及会话产物；如果绑定的按键也能向后删除字符，则先编辑已输入的搜索词

## 交互式会话内选择器（`SelectorController.showSessionSelector`） \{#interactive-in-session-picker-selectorcontrollershowsessionselector}

流程：

1. 通过 `SessionManager.listForPicker(currentCwd, currentSessionDir)` 获取当前文件夹的会话；即使当前文件夹范围为空，所有项目列表仍按需加载
2. 将 `SessionSelectorComponent` 通过 `ctx.ui.showOverlay` 显示为使用终端备用屏幕的全屏浮层（从左上角铺满屏幕，下方的对话记录保持不变），并接入所有项目列表的按需加载（`loadAllSessions`）、`history.db` 提示词匹配、删除功能、置顶会话标记及当前会话标记
3. 回调：
   - 选中：锁定选择器输入并调用 `handleResumeSession(sessionPath, { followContinuation: true })`；成功后隐藏浮层并将焦点还给编辑器，切换前若发生可恢复的失败，则解锁选择器并保持浮层打开
   - 取消：隐藏浮层，将焦点还给编辑器，然后重新渲染
   - 退出：隐藏浮层，然后调用 `ctx.shutdown()`

`/resume <id-prefix>` 使用 `resolveResumeTarget` 先在本地匹配，再在全局匹配，并切换到解析器选定的副本。这与 CLI 的 `--resume <id>` 使用的是同一个解析器。`/resume @claude` 和 `/resume @codex` 则打开只读源导入选择器：所选外部对话记录会先持久化为 OMP 会话，然后切换到该会话。这类选择器不提供删除、历史记录补充或所有项目范围。

## 会话选择器组件的行为 \{#session-selector-component-behavior}

`SessionList` 支持：

- 用 Up/Down 和 Page Up/Page Down 导航（到达边界后停止，不循环）
- 按 Enter 选中
- 用 `app.session.delete`（默认是 Backspace 或 Delete；Backspace 会优先编辑已输入的搜索词）在确认后删除
- 按 Esc 取消，按 Ctrl+C 退出
- 按 Tab 在当前文件夹和所有项目范围之间切换
- 在全屏选择器中滚动鼠标滚轮或单击
- 用多个词项搜索 ID、标题、工作目录、首条消息、文件开头的消息文本和路径：字面匹配优先并按时间从近到远排序，其后是匹配程度足够高的模糊匹配；停止输入片刻后，`history.db` 中历史提示词的匹配项可能提前显示
- 提供 `currentSessionPath` 时，活动会话的元数据行会标记为 `current`，打开选择器时及按 Tab 切换范围后都会将焦点移到该会话

空列表的显示及操作：

- 当前文件夹范围显示 `No sessions in current folder. Press Tab to view all.`，所有项目范围显示 `No sessions found`
- 列表为空时，按 Enter、Delete 或 Backspace 不执行任何操作
- Esc 和 Ctrl+C 仍有效

## 运行时切换（`AgentSession.switchSession`） \{#runtime-switch-execution-agentsessionswitchsession}

`switchSession(sessionPath)` 是在进程内切换会话的核心路径。

生命周期与状态转换：

1. 记录切换前的文件，并触发可取消的 `session_before_switch`（`reason: "resume"`，目标文件）
2. 取消订阅代理事件，中止正在进行的工作，运行切换前协调器，并写出待处理的 bash 和会话数据
3. 保存用于回滚的状态快照（管理器、队列、消息、模型、思考级别、服务层级、工具、提示词、模型提供方缓存标识、检查点和回退状态），然后清空消息队列
4. 切换到不同会话时，处理完顾问记录器中的待处理内容并将其分离
5. `sessionManager.setSessionFile(sessionPath)`：更新续接线索，加载、迁移、解析条目引用的 blob 并为条目建立索引，在工作目录策略允许时采用所记录且存在的工作目录
6. 同步会话 ID、记忆键、继承的模型提供方缓存键和显示上下文；解析记录的模型（见下文）；恢复检查点和回退状态
7. 触发 `session_switch`，替换消息，重置顾问会话状态并同步待办事项
8. 切换到不同会话，或重新加载同一会话但回放内容有变化时，关闭模型提供方会话
9. 应用解析出的模型，或采用调用方显式传入的 `model`
10.   如果载入的分支以中断的工具流程结束，则追加一条合成的中止消息，并重建显示上下文
11.   恢复配置的思考级别（`auto` 仍为自动）和各模型系列的服务层级；没有对应条目时回退到当前设置
12.   按需重置记忆和工具会话状态，重新订阅事件，运行模式协调，并刷新与工作区相关的基础系统提示词
13.   切换到不同会话时恢复顾问开销，完成 bash 的切换，通知会话变更回调，并在成功时返回 `true`
      如果切换前钩子取消切换，或工作目录策略拒绝切换，`switchSession()` 会返回 `false`。没有工作目录变更回调时，会拒绝跨项目切换，不会静默采用目标工作目录；回调拒绝时也会取消切换。

保存快照之后发生失败时，会恢复原来的管理器和运行时状态，重新连接并协调其状态，并把 bash 切换标记为失败。工作目录策略拒绝时返回 `false`，其他失败则重新抛出。切换成功时，若模式协调或基础提示词刷新失败，只记录日志，不回滚切换。

解析记录中的模型时，采用与启动时恢复相同的规则：选用第一个已注册、已启用且已配置凭据的候选角色模型或默认模型。未能解析时，在按模型提供方刷新模型发现结果后重试一次。切换到不同会话时若仍找不到可用模型，会抛出 `Could not restore model <provider/id>`，在触发 `session_switch` 之前回滚。使用 `hasUI` 和 `allowSessionModelFallback` 创建的会话（TUI）在开启 `retry.modelFallback` 时改为保留当前模型，并报告 `Could not restore model <provider/id>. Using <provider/id>`，由 `onModelFallback` 或 `notice` 事件传达。重新加载同一个文件时会保留当前模型。自行选择模型的调用方传入 `model`（RPC `open_session`/`switch_session` 同时传入 `provider` 和 `modelId`）；协作副本传入 `keepModel`，因为它们的模型由共享端状态提供。

## 交互式切换后的界面状态重建 \{#ui-state-rebuild-after-interactive-switch}

`SelectorController.handleResumeSession` 先调用 `switchSession`；如果存在续接副本，则传入由 `followContinuation` 找到或由调用方提供的副本。如果返回 `false`，选择器会在应用任何新会话的界面更新之前停止，保留现有会话和界面。切换成功后，它会：

- 停止加载动画
- 清空状态容器
- 清空待处理消息界面和待处理工具映射
- 重置流式组件和消息的引用
- 如果恢复的会话与原会话的工作目录不同，则让进程及依赖工作目录的缓存改用该目录（`applyCwdChange`）
- 清空聊天容器，并根据会话上下文重新渲染（`renderInitialMessages`）
- 从新会话的产物中重新加载待办事项
- 显示 `Resumed session`（跨项目恢复时显示 `Resumed session in <dir>`），然后在发生模型回退时显示相应警告

因此，界面中可见的对话和待办事项状态都根据新会话文件重建。

## 启动时恢复与会话内切换的对比 \{#startup-resume-vs-in-session-switch}

### 启动时恢复（`--continue`、`--resume`、直接打开） \{#startup-resume---continue---resume-direct-open}

- 在 `createAgentSession(...)` 之前选定会话文件。
- `sdk.ts` 在创建代理会话时构建已有的会话上下文。
- 代理的消息和回放状态在构建期间只恢复一次。
- 模型、思考级别和服务层级使用已保存的状态，以当前配置作为回退。
- 随后，交互模式协调已保存的模式状态。

### 会话内切换（`/resume` 式选择器路径） \{#in-session-switch-resume-style-selector-path}

- 在已运行的会话上调用 `AgentSession.switchSession(...)`。
- 就地重建消息、模型、思考级别、服务层级以及会话范围内的运行时状态。
- 触发 `session_before_switch`/`session_switch` 钩子。
- 刷新界面中的聊天记录和待办事项。
- 通过已注册的会话切换协调器执行交互模式协调。

## 失败和边界情况 \{#failure-and-edge-case-behavior}

### 取消路径 \{#cancellation-paths}

- 取消 CLI 选择器：返回 `null`，调用方输出 `No session selected`，进程退出。
- 取消交互式选择器：关闭浮层，不更换会话。
- 核心钩子或工作目录策略取消切换：`switchSession()` 返回 `false`；交互式选择器在刷新界面和更新状态之前停止，保留原会话和界面。没有回调的跨项目切换会被拒绝，不会静默采用目标工作目录。
- 无法恢复已保存的模型，且不允许模型回退：`switchSession()` 抛出 `Could not restore model <provider/id>`；选择器和 `/resume <id>` 都会显示错误并保留原会话。

### 空列表路径 \{#empty-list-paths}

- CLI `--resume`（不带值）：只有当前文件夹列表**和**全局列表都为空时，才输出 `No sessions found` 并退出；否则，文件夹范围为空的选择器会提示按 Tab。
- 交互式选择器：文件夹范围为空时显示 Tab 提示，仍可取消。

### 目标会话文件缺失或无效 \{#missinginvalid-target-session-file}

打开或切换到指定路径时（`setSessionFile`）：

- 将显式路径传给 `setSessionFile` 时，如果文件不存在或为空，就在该路径初始化并持久化新会话。
- 非空文件的会话头缺失或格式不正确时，抛出 `Cannot resume session "...": the session header is missing or malformed. The file was not modified.`
- 严格的打开或恢复流程可能会拒绝没有条目的文件，而不是创建会话。
- 如果会话头有效，对其后的格式不正确的正文记录会作宽容恢复，并将加载的文件标记为待重写。

从无效会话头恢复时，绝不会覆盖原始文件。

### 严重故障 \{#hard-failures}

发生实际的 I/O 故障时（权限错误、重写失败等），切换或打开会话仍可能抛出异常，异常会继续向调用方传播。

### ID 前缀匹配的注意事项 \{#id-prefix-matching-caveats}

- 将会话 ID、JSONL 文件名以及文件名时间戳之后的 ID 后缀转换为小写，然后用 `startsWith` 匹配。
- 采用按修改时间降序排列的第一个匹配项；多个会话共用一个前缀时，没有供用户消解歧义的界面。
- 文件开头扫描得到的列表元数据刻意保持轻量，因此搜索文本可能不包含会话文件前 4 KB 之外的消息。
