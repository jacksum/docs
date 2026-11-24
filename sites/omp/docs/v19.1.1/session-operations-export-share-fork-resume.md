---
title: "会话操作"
description: "Oh My Pi v19.1.1 仓库文档：会话操作。"
---

# 会话操作：导出、转储、共享、重置提供方状态、清空、派生新会话、恢复与继续 \{#session-operations-export-dump-share-fresh-clear-fork-resumecontinue}

本文介绍当前实现中用户可见的行为，涵盖会话导出、共享、对话重置、生命周期管理、派生新会话和恢复会话。

## 实现文件 \{#implementation-files}

- [`src/slash-commands/builtin-collaboration.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)：导出、转储和共享命令的定义
- [`src/slash-commands/builtin-lifecycle.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts)：生命周期命令的定义
- [`src/modes/controllers/command-controller.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/modes/controllers/command-controller.ts)：TUI 命令执行
- [`src/modes/controllers/selector-controller.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/modes/controllers/selector-controller.ts)：恢复或导入会话的选择器，以及工作目录切换
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/agent-session.ts)
- [`src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/session/session-manager.ts)
- [`src/export/html/index.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/export/html/index.ts)
- [`src/export/share.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/export/share.ts)
- [`src/export/custom-share.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/export/custom-share.ts)
- [`src/cli/flag-tables.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/cli/flag-tables.ts)：重写重启参数
- [`src/main.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/main.ts)

## 操作对照表 \{#operation-matrix}

| 操作 | 入口 | 是否修改会话 | 会话文件的创建或切换 | 输出产物 |
| ----------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `/dump [all]` | 斜杠命令（TUI/无界面） | 否 | 否 | 剪贴板文本或命令输出文本，另尽可能生成临时 JSON 附属文件；`all`：临时 ZIP 文件 |
| `/export [--themes] [path]` | 斜杠命令（TUI/无界面） | 否 | 否 | HTML 文件 |
| `--export <session.jsonl> [outputPath]` | CLI 启动时的快速路径 | 不修改运行中的会话 | 不启动活动会话，只读取目标文件 | HTML 文件 |
| `/share` | 斜杠命令（TUI/无界面） | 否 | 否 | 加密共享链接（Gist 或共享服务器）；仅 TUI 自定义处理器使用临时 HTML |
| `/new` | 交互式斜杠命令 | 是（启动空白对话） | 切换会话标识；在持久化模式下将新文件头写入磁盘 | 无 |
| `/fresh` | 斜杠命令（TUI/无界面） | 是（仅修改与模型提供方交互时使用的内存标识和状态） | 不切换，保留当前会话文件和文件头 | 无 |
| `/clear` | 交互式斜杠命令 | 是（清空当前对话及模型使用的对话上下文） | 保留会话标识、文件和历史；延迟写入的会话仍遵循常规持久化条件 | 追加 `reset_boundary` |
| `/delete` | 交互式斜杠命令 | 是（启动空白对话） | 尝试删除当前已持久化的会话及其产物，再切换到延迟写入的新会话（有内容才写文件，不留空文件） | 无 |
| `/fork` | 交互式斜杠命令 | 是（切换活动会话的标识） | 创建新会话文件并将当前会话切换过去（仅限持久化模式） | 若有产物目录，将其复制到新会话的命名空间 |
| `/fork pane`、`/fork window`、`/fork tab` | 交互式斜杠命令 | 否（保留父会话） | 将当前会话记录写入磁盘，再从该记录在终端复用器的窗格或组中启动子 OMP 进程（tmux 窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区） | 子进程获得单独派生的新会话 |
| `--fork <id\|path>` | CLI 启动时 | 是（会话创建后） | 从选定的源会话派生新会话，写入当前工作目录对应的会话目录 | 默认递归复制源会话的产物 |
| `/resume [id\|@claude\|@codex]` | 交互式斜杠命令 | 是（替换当前内存中的活动会话状态） | 切换到选定或匹配的会话，或导入选定的外部会话 | 无 |
| `--resume` | CLI 启动时的选择器 | 是（会话创建后） | 打开选定的现有会话文件（选择器打开时仅显示当前文件夹范围；预加载全局列表仅用于在所有范围都为空时提前退出，以及按 Tab 即时切换范围） | 无 |
| `--resume <id\|path>` | CLI 启动时 | 是（会话创建后） | 打开现有会话；如果记录的工作目录已不存在，则可能改用当前目录（协议模式下会按原位置打开，但来自已移除工作树的会话除外） | 无 |
| `/restart` | 交互式斜杠命令 | 是（重新启动进程） | 保留配置选项；若会话已写入磁盘则恢复该会话（`--restore`），否则启动新会话 | 无 |
| `--continue` | CLI 启动时 | 是（会话创建后） | 打开终端会话定位记录指向的会话或最近的会话；若没有会话，则创建新会话 | 无 |

## 导出与转储 \{#export-and-dump}

### `/export [--themes] [outputPath]`（斜杠命令） \{#export---themes-outputpath-slash-command}

执行流程：

1. 协作命令定义（`src/slash-commands/builtin-collaboration.ts`）用 `parseExportArgs` 解析无界面模式的参数。TUI 则委托同样使用这个解析器的 `CommandController.handleExportCommand` 处理。
2. `--themes` 选用已配置的 TUI 深色和浅色主题，而不是独立网页配色。移除此选项后，按空白字符分隔的参数中最多只能有一个路径；若还有其他参数，则显示 `Usage: /export [--themes] [path]`。
3. `AgentSession.exportToHtml()` 调用 `exportSessionToHtml(sessionManager, state, { outputPath, palette, themeNames })`。
4. TUI 显示路径，并在浏览器中打开文件。无界面模式下执行命令只输出路径，不打开文件。

在 TUI 中，`/export` 以 `viewSession` 为目标：聚焦某个子代理时，导出的是该子代理
及其下级子代理的会话记录，不是主会话。`/dump` 和 `/share` 仍以
主会话为目标。

行为细节：

- `--copy`、`clipboard` 和 `copy` 参数会被明确拒绝，命令会提示改用 `/dump`。
- 导出文件嵌入会话文件头、条目和叶节点，以及代理当前状态中的 `systemPrompt` 和工具描述。导出的文件头不含 `previousSessionFiles`。
- 查看器沿用 `/stats` 的界面设计，提供 Auto、Light 和 Dark 主题；Light 主题使用浅灰色背景和高对比度的次要文字。侧栏列出主会话、嵌套子代理和顾问；选择会话或任务卡片中的代理，会打开相应的会话记录和对话树。会话链接和消息链接会保留所选的会话记录。
- 与会话文件一同存放的子代理会话记录（`<session>/<AgentId>.jsonl`，嵌套启动的子代理按此结构递归存放）会嵌入 `subSessions`，包括顾问的会话记录和经 gzip 压缩的会话记录。查找时只进入实际的子目录，并将有删除标记的代理标记为 `aborted`。设置 `includeSubSessions: false`（`ExportOptions` 中的选项）会排除子代理的会话记录及其追踪轨道。
- 底部的 **Timeline** 抽屉和 **Trace** 视图复用 `/trace` 的跨度组装逻辑与查看器，支持时长、轮次和调用三种坐标轴，以及空闲时段压缩、搜索、缩放、嵌套轨道、条目详情和工具调用汇总。**Jump to transcript** 会打开对应的会话和消息。所有会话记录和追踪数据均嵌入 HTML，无需统计服务器。源码开发版和发布版导出的 HTML 都从 `stencil.so` 加载共享库，因此打开文件需要联网。
- 工具调用使用 `<omp-tool-view>`（与 collab-web 共用）；追踪使用 `<omp-session-trace>`（与统计功能共用）。`bun gen:export-viewer` 将这些组件与外壳、样式和默认主题一同打包。从源码检出版本导出时，每个导出文件都会内嵌生成的查看器；打包的发布版从 `build.stencil.so` 加载对应版本的查看器。两者都从按内容寻址的 `stencil.so/assets/omp/` URL 加载共享的 Markdown 和语法高亮库，并通过子资源完整性（SRI）固定库的内容。上传的只有查看器代码，不会上传会话数据。
- 打包发布版的导出文件包含约 2 KiB 的固定 HTML 开销；从源码导出的文件还包含生成的查看器。使用 `--themes` 时，除了会话数据，还会嵌入所选 TUI 主题的覆盖样式。
- 导出时不会追加会话条目。
- 默认在当前目录生成 `omp-session-<session-file-stem>.html`。HTML 导出既不对秘密信息脱敏，也不加密，可能包含原始上下文、图像数据和扩展载荷。

注意事项：

- 参数按空白字符拆分，因此即使用引号包住，含空格的路径也无法完整保留。请使用不含空格的路径。
- 从源码检出的版本需要先运行 `bun gen:export-viewer` 才能导出。若缺少生成的查看器，程序会提示要运行的命令；随包发布的查看器资源在发布 CI 发布后可用。

### `--export <inputSessionFile> [outputPath]`（CLI） \{#--export-inputsessionfile-outputpath-cli}

`main.ts` 中的执行流程：

1. 提前处理此选项，在启动交互界面或会话之前执行。
2. 调用 `exportFromFile(inputPath, outputPath?)`。
3. `SessionManager.open(inputPath, ..., { suppressBreadcrumb: true, throwIfMissing: true })` 加载条目，然后生成并写入 HTML。
4. 进程输出 `Exported to: ...` 后退出。

行为细节：

- 输入文件不存在时会报 `File not found: <path>`；文件为空或文件头格式错误时，导出会失败，不会创建或替换输入文件。
- 这条路径不会创建 `AgentSession`，不会更新终端会话定位记录，也不会修改任何运行中的会话。
- 独立导出无法访问代理的实时状态，因此不会添加当前的系统提示词或工具描述。它会嵌入已加载的条目和子代理的会话记录。

### `/dump`（导出文本到剪贴板或无界面输出） \{#dump-clipboardheadless-text-export}

执行流程：

1. 命令调用 `session.formatSessionAsText()`。
2. 如果返回空字符串，命令会显示 `No messages to dump yet.`
3. 否则，命令还会尝试调用 `session.dumpLlmRequestToTmpDir()`，并将得到的路径附加到会话记录末尾。TUI 将合并后的文本复制到剪贴板；无界面模式或 ACP 则将其作为命令输出返回。

转储使用代理当前的消息数组，不包含所有分支或全部历史 JSONL 条目。
执行 `/clear` 或进行上下文压缩后，转储反映的是当前有效的上下文；
要获取持久化的对话图，请使用 HTML 导出。

转储的会话记录包括：

- 系统提示词
- 当前使用的模型和思考级别
- 工具定义和参数
- 用户、开发者和助手消息
- 思考块和工具调用
- 工具结果和执行块（标记为 `excludeFromContext` 的 Bash/Python 条目除外）
- 自定义条目、钩子条目、文件提及条目、分支摘要和上下文压缩摘要

命令会尽可能在操作系统的临时目录下生成名为 `omp-llm-request-<id>.json` 的 JSON 附属文件。其中包含当前模型、思考级别、服务层级、系统提示词、传输时使用的工具结构定义，以及转换为 LLM 格式的消息。命令结束后文件仍会保留，可能包含原始上下文或秘密信息，请妥善保护或删除。附属文件生成失败时仍会输出会话记录（TUI 会报告失败，无界面模式则直接省略路径）。

转储不会追加任何会话持久化条目。

### `/dump all`（按代理打包转储的 ZIP 文件） \{#dump-all-zip-of-per-agent-dumps}

`/dump all` 调用 `session.dumpSessionArchiveToTmpDir()`，在操作系统的临时目录中写入
`omp-dump-<id>.zip`，其中包含：

- `session.md`：与 `/dump` 复制的主会话记录相同
- `llm-request.json`：与 `/dump` 的附属文件载荷相同（尽可能生成；转换失败时省略）
- `subagents/<path>.md`：`collectSubSessions` 找到的每个已持久化子代理各有一个文件（例如 `subagents/Scout.md`、`subagents/Scout/Helper.md`），标题为 `# Subagent: <path>`。文件包含已持久化的模型和思考级别、被终止的代理的 `Status: aborted` 状态，以及子代理最后一条条目所在分支的消息。消息与主会话一样会解除混淆。

子代理的系统提示词和工具清单不会持久化，因此子代理文件不包含这些内容。没有消息的子代理会被跳过。如果查找子代理失败，归档仍包含主会话的转储，命令报告也会说明缺少子代理的原因。TUI 将归档路径复制到剪贴板并列出其中的文件；无界面模式或 ACP 将同一份报告作为命令输出返回。与附属文件一样，归档在命令结束后仍会保留，可能包含原始上下文或秘密信息。

## 共享 \{#share}

`/share` 发布会话的端到端加密快照，并输出
查看链接。实现见 [`../packages/coding-agent/src/export/share.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/export/share.ts)。

### TUI 第一阶段：自定义共享处理器（如有） \{#tui-phase-1-custom-share-handler-if-present}

交互式 TUI 的 `loadCustomShare()` 会在当前生效的代理目录
（默认 `~/.omp/agent`）中按顺序查找以下文件，使用第一个存在的文件：

- `share.ts`
- `share.js`
- `share.mjs`

要求：

- 模块必须默认导出一个函数 `(htmlPath) => Promise<CustomShareResult | string | undefined>`。

如果找到有效的处理器，则沿用原有约定：将会话导出为临时 HTML 文件
（`${os.tmpdir()}/${Snowflake.next()}.html`），将文件路径传给处理器，
随后删除临时文件。
处理器返回值的处理方式：

- 字符串：作为 URL 显示并打开
- 对象：显示 `url` 和/或 `message`，并打开 `url`
- `undefined` 或其他假值：显示通用提示 `Session shared`

回退规则：

- 如果自定义处理器存在但加载失败，命令会报错并返回。
- 如果自定义处理器在执行时抛出异常，命令会报错并返回。
- 这两种失败情况下，均**不会**回退到默认流程。
- 仅在不存在自定义共享脚本时才走默认流程。
- 在无界面模式或 ACP 中执行斜杠命令不会加载自定义共享脚本，始终使用默认的加密流程。

自定义处理器收到的是普通 HTML 导出文件，不是默认的脱敏加密
快照。发布方式、加密方式和隐私政策完全由处理器自行决定。
受 HTML 导出约定限制，自定义处理器也无法通过这条路径
共享内存会话。

### 默认加密共享 \{#default-encrypted-share}

在无界面模式下，或 TUI 未找到自定义共享处理器时，`shareSession()` 执行以下操作：

1. 构建主会话快照（`header`、`entries`、`leafId`，以及代理状态中当前的
   `systemPrompt` 和工具描述），省略文件头中的
   `previousSessionFiles`。与 HTML 导出不同，此流程不会收集
   子代理的会话记录文件。
2. 如果启用了 `share.redactSecrets`（默认启用），且混淆器有预先配置或通过正则表达式发现的秘密信息，程序会按字段类型逐一脱敏，改写文件头、提示词、工具、条目、子会话以及消息中的文本字段。内嵌图像的字节留待后续大小限制处理。不透明的模型提供方重放字段和无类型的扩展载荷（`details`、`data`、`outputSchema`、上下文压缩时保留的数据）直接丢弃，不遍历其内容。
3. 用 gzip 压缩 JSON，并用新生成的 AES-256-GCM 密钥加密
   （`[12B IV][ciphertext+tag]`）。
4. 由 `share.store` 决定上传目标：
   - **共享服务器**（默认，`store: "blob"`）：通过 `POST <share.serverUrl>`
     （默认 `https://my.omp.sh/s`）上传原始二进制数据，大小上限为 1 MB。
     超限时会裁减快照直到符合限制：先移除内嵌图像，
     再截短长字符串（字符数上限依次为 32,768 → 8,192 → 2,048 → 512），最后
     去掉最早的条目。裁减后的快照若仍超出上限，共享会失败，
     不会上传超限数据。
   - **私密 Gist**（`store: "gist"`）：如果已安装 `gh` 且已通过身份验证，
     则将加密后的数据用 Base64 编码，再以
     `session.ompshare.txt` 上传（加密后大小上限为 5 MB；Gist 原始内容的获取上限为
     10 MB）。如果 `gh` 不可用或创建 Gist 失败，则回退到
     共享服务器。
5. 两种方式生成的链接都是 `<share.serverUrl>/<id>#<base64url key>`。
   该链接上的查看器页面会获取加密数据（十六进制标识通过 GitHub Gist
   API 获取，其余标识从服务器的二进制存储获取），并在客户端
   解密。密钥只存在于 URL 的片段部分，不会出现在
   任何 HTTP 请求中。

界面会显示共享 URL（适用时还会显示对应的 Gist URL 和裁减提示）。
无界面模式下，`/share` 会输出相同的内容。与
`/export` 不同，`/share` 支持内存会话（`--no-session`）：
快照由当前条目构建，不需要会话文件。

共享的取消行为：

- 加载器的 `onAbort` 钩子会恢复编辑器界面，并显示 `Share cancelled`。
- 取消只影响界面，不会中断正在进行的上传；
  程序会在上传返回后检查是否已取消。

## 新建与删除 \{#new-and-delete}

交互式 `/new` 为新对话分配新的会话标识。TUI 首先终止正在进行的
上下文压缩；`AgentSession.newSession()` 发出可取消的
`session_before_switch` 事件，随后终止原有运行、取消所属的异步任务、
关闭模型提供方状态，等候待写入数据写完和顾问记录器处理完毕。持久化模式下，
`SessionManager.newSession()` 会在返回前写入新的文件头，
不必等到助手首次回复。

新会话保留当前的模型、设置和已配置的思考级别选择器，但会清空
对话和队列，以及待办事项、检查点和工具状态，还会清除继承的
缓存标识、顾问开销和已提升的记忆上下文。工作区根目录根据
当前设置初始化，项目指令从磁盘重新加载。
TUI 会退出当前聚焦的子代理视图，并清空界面上的会话记录。

`/delete` 使用同样的切换流程，并设置 `drop: true`。它要求有会话文件
路径，并会尝试删除原来的 JSONL 文件和产物目录树，不予保留。
即使删除失败，也会启动新会话。与 `/new` 不同，后继会话
会延迟写入：有内容才写入文件头，因此未发送消息就退出时，
不会留下零轮次的会话。切换前钩子可以
取消任一操作。vibe 模式激活时，两项操作都会被拒绝。

## 重置提供方状态 \{#fresh}

`/fresh`（TUI/无界面模式）会重置当前会话与模型提供方交互所用的流式状态，
**不改动本地会话记录、会话文件或文件头**。如果模型提供方的流式交互
卡住或状态损坏（例如提示词缓存过期、轮次进行中出现故障，
或服务器端会话标识不再匹配），可用此命令恢复，
同时保留可见的对话。

`AgentSession.freshSession()`：

- 代理正在进行流式输出时，命令会被拒绝。请等待回复结束，或先
  终止回复。
- 关闭缓存的所有模型提供方会话状态条目（服务器端会话或
  提示词缓存句柄），并报告清理数量。
- 生成新的模型提供方会话标识，为内存状态更换键，并使仅追加的
  上下文失效，以便下一轮根据本地对话重建上下文。
- 保持本地会话记录、会话文件和 OMP 会话管理器的标识不变；
  仅更改模型提供方所用的 `AgentSession.sessionId`。

`/fresh` 会同时保留可见的对话和模型使用的对话，因此不同于
`/clear`（在当前会话中清空界面和模型中的对话）、`/new`
（启动全新的空会话）和 `/delete`（尝试删除当前
会话并启动新会话）。只有 `/fresh` 会在保留现有对话的同时，
重置与模型提供方交互所用的流式状态。

## 清空 \{#clear}

交互式 `/clear` 会在当前会话中清空对话上下文。
此命令仅在 TUI 中可用；正在流式输出回复，或正在前台执行
Bash/Python 时，命令会被拒绝。如果正在进行上下文压缩，
命令会先终止压缩并等待其停止，再重置上下文。

`AgentSession.resetSessionContext()`：

- 丢弃当前消息、排队的引导和后续轮次、待处理的工具调用、错误
  状态、检查点和回退状态、延迟工具状态，以及会话停止后的继续
  状态。它还会取消该代理排队等待继续的工作，以及
  异步 Bash 或任务作业。
- 更换模型提供方一侧的会话状态，重新初始化顾问，使仅追加的
  模型上下文失效，并重置记忆提升，以便下一轮
  根据基础系统提示词和当前项目指令重建上下文。
- 保留会话标识、标题、工作目录、模型、设置、当前计划的路径和
  会话记录文件。
- 通过常规持久化流程追加 `reset_boundary`。对于已写入磁盘的会话，
  该标记会持久保存；如果是内存会话或尚未写入磁盘的会话，
  标记会保留在内存中。折叠后的当前会话记录和重建的
  模型上下文从最近的边界之后开始，但已持久化的 JSONL 文件
  和完整的会话记录导出仍会保留重置前的历史。
- 重置和系统提示词刷新成功后，向钩子和扩展发送 `session_clear`
  通知并等待处理完毕，以便它们使依赖上下文的
  缓存失效。即使原本没有内容，只要清空成功也会发送通知；因忙碌而无法重置或重置被拒绝时则不会发送。
  此操作不会发出 `session_switch`，也不允许处理器取消清空。

清空成功后，TUI 会清除界面上已渲染的会话记录。这与以下操作不同：
`/fresh` 更换与模型提供方交互所用的流式状态，但不清空对话；
`/new` 创建新的会话标识和会话记录文件；
`/delete` 则尝试先删除已持久化的原有会话，再启动
新会话。

## BTW 历史记录 \{#btw-history}

`/btw` 历史记录与会话产物一起存放，不进入主对话。
有关键盘操作、后续追问、持久化和迁移安全性的说明，
见 [BTW 命令参考](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/slash-command-internals.md#11-built-in-command-note-btw)。

## 派生新会话 \{#fork}

不带参数的 `/fork` 从当前会话派生新会话，并切换活动会话的
标识。`/fork pane` 在新窗格中启动独立的 OMP 进程；
`/fork window` 和 `/fork tab` 则在终端复用器的新组中启动进程（tmux
窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区）。子会话以当前已
持久化的会话记录为起点，父会话仍处于活动状态，
并继续运行。

输入 `/fork ` 时，`[pane|window|tab]` 会以浅色行内提示显示，按 Enter 仍会
在当前界面执行不带参数的派生操作。输入参数前缀（`/fork w`）会打开建议列表，
以浅色行内提示显示所选参数的剩余部分；按 Tab 接受该建议。

指定打开位置的命令会自动从终端检测 tmux、Zellij、Herdr、CMUX 或 Orca；
`/fork auto` 不是子命令（有效参数为 `pane`、`window` 和
`tab`）。`window` 对应 tmux 窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区。
普通终端、`screen` 和 `wmux` 不支持在指定位置派生新会话，操作时会收到
明确的错误提示；在这些环境中请改用不带参数的 `/fork`。

### 前提条件与即时限制 \{#preconditions-and-immediate-guards}

- 代理正在进行流式输出时，不带参数的 `/fork` 会被拒绝，并显示警告。
- 在流式输出期间指定位置派生新会话，会在启动前请求确认。子会话可能不包含
  尚未完成的回复，确认后也不会中断父会话的回复。
- vibe 模式激活时，派生新会话的操作会被拒绝。
- 指定位置派生新会话要求当前会话记录已持久化；子进程启动前会完成所有待处理的
  写入操作。父会话不会切换到其他
  会话。
- CLI 的 `--api-key` 覆盖值无法通过终端复用器命令安全传递；
  指定位置派生新会话会拒绝这种覆盖，以免暴露密钥。
- 仅在原有的不带参数的 `/fork` 流程中，
  才会清除界面的状态和加载指示。

### 在终端指定位置的执行流程 \{#terminal-placement-flow}

对于指定打开位置的命令，控制器根据当前 CLI 入口和可安全用于重启的启动选项
重建子进程的 CLI 命令（舍弃 `--goal` 等一次性选择参数和位置提示词
参数）。它将过时的启动选项（模型、思考级别、配置档案、提示词缓存键和工作目录）
替换为活动会话的值。子会话固定使用父会话的提示词缓存键，
以便读取父会话填充的缓存。子进程还会收到实际生效的
代理目录和配置目录、解析后的叠加配置（在 `/move` 后仍保留
原始路径）、父会话的会话目录和 XDG 基础目录。
父进程未设置的作用域变量保持未设置，不会以空值导出。
子进程使用 `--fork` 和当前会话记录的绝对路径启动。
通用终端启动器按终端复用器各自的方式执行，并在 TUI 中报告
功能不可用或启动失败。启动 CMUX 和 Orca 时，必须
明确确认目标端配置的交互式 shell 支持 POSIX 语法；
程序不会根据本机操作系统或 `SHELL` 推断这一点。
拒绝确认会中止操作，不写出会话的待写入数据，也不启动
终端。`window` 和 `tab` 都对应在终端复用器的新组中打开。Orca
CLI 按 Orca 文档规定的顺序查找（先查 `ORCA_CLI_COMMAND`，然后在
Orca 开发源码检出目录中查找 `orca-dev`，接着在 Linux 上且不在 Orca 终端中时
查找 `orca-ide`，最后查找
`orca`）。

Orca CLI 的 `--command` 接受 shell 文本，而不是 argv，并且不支持 `--cwd`；
获得确认后，OMP 生成 `cd <quoted-cwd> && <quoted-command>`，使用
共用的 POSIX shell 引用规则。如果 Orca 无法显示新标签页，改在
后台终端启动子进程，`/fork` 会发出警告，不会报告
已打开可见标签页。

### 会话层面的执行流程 \{#session-level-flow}

原有的不带参数的 `/fork` 使用 `AgentSession.fork()`：

1. 发出 `session_before_switch`，并传入 `reason: "fork"`（可取消）。
2. 完成待处理的 Bash 和会话写入，等待顾问记录器处理完毕并解除其关联。
3. 调用 `SessionManager.fork()`，保留对话及其用量归属。
4. 尽可能将产物目录从原会话命名空间复制到新会话命名空间。非 ENOENT 的复制错误会记入日志，但不会中止操作。
5. 更新 `agent.sessionId`，并继承原会话的模型提供方提示词缓存键，除非已显式固定提示词缓存键。
6. 发出 `session_switch`，并传入 `reason: "fork"`。

`SessionManager.fork()` 的行为：

- 要求使用持久化模式并且已分配会话文件路径；源会话不必已经写入磁盘。
- 创建新的会话标识和新的 JSONL 文件路径。
- 按以下规则重写文件头：
   - 写入新的 `id`
   - 写入新的时间戳
   - `cwd` 保持不变
   - 将 `parentSession` 设为原会话标识
   - 将 `providerPromptCacheKey` 设为从原会话文件头继承的键；若未固定键，则使用原会话标识
- 在新文件中原样保留所有非文件头条目。

### 非持久化模式下的行为 \{#non-persistent-behavior}

- 内存会话管理器返回 `undefined` 作为 `fork()` 的结果。
- `AgentSession.fork()` 返回 `false`。
- 界面显示 `Fork failed (session not persisted or cancelled)`。

### 从指定条目派生新会话（`AgentSession.fork(entryId)`、RPC `fork`） \{#fork-at-an-entry-agentsessionforkentryid-rpc-fork}

`AgentSession.fork(entryId)` 从会话记录中的指定位置派生新会话，而不是基于整个会话。RPC `fork` 命令在提供 `entryId` 时调用这个方法，否则调用不带参数的 `fork()`。

- 与从整个会话派生新会话一样，vibe 模式开启时，此操作会被拒绝。
- `entryId` 必须指向 `message` 条目（用户、助手或其他任意消息角色）；否则会抛出 `Invalid entry ID for forking`。
- 当 `AgentSession.isBusyForSnapshot` 为真时，会抛出 `SessionBusyError`（此时响应正在流式输出，或用户发起的 bash/eval 操作、上下文压缩、交接、重试正在运行）。此检查会在 `session_before_branch` 之前、之后各执行一次，并在待处理的 bash 输出和会话写入都刷新后再执行一次。最后一次检查先于丢弃旧会话的任何内容（等待下一轮处理的消息、异步作业、自动学习记录），所以派生新会话被拒绝时，原会话保持不变。如果在剩余刷新等待期间有提示词被接收，切换时会递增提示词代号并丢弃该提示词，与 `branch()` 一致。`/btw` 分支也用同一条件判断。
- 如果 `entryId` 位于某批助手发起的工具调用中（即助手消息本身，或响应其中一次调用的工具结果），就沿会话树从 `entryId` 向后保留到该批次已记录的工具结果，途中跳过结果之间单独出现的非消息条目。因此，只要工具调用在原会话中已有结果，派生的新会话就不会在该调用处截断。从未收到结果的调用保持原样。
- 切换流程与 `AgentSession.branch()` 相同，但保留到解析出的条目为止，而非在该条目之前截断：触发 `session_before_branch`，原因为 `"fork"`（可取消；此时 `entryId` 是最后一个保留的条目，在 `branch()` 中则是被丢弃的条目）。随后调用 `SessionManager.createBranchedSession(leafId, { copyArtifacts: true })`，重建代理消息，再触发 `session_branch`，原因为 `"fork"`。
- 新文件保留从根到解析出的条目的完整路径（包含该条目）、所保留条目的标签及会话标题，并将 `parentSession` 设为原会话文件。整个产物目录会在后台复制（包括仅被丢弃条目引用的产物）。新会话的产物管理器会等复制完成后再分配 ID 或查找溢写文件，因此保留下来的 `local://N.log` 引用仍能解析，新溢写文件也会获得新的 ID。与从整个会话派生新会话不同，这种方式不继承模型提供方的提示词缓存键（与 `branch()` 一致）。
- 与从整个会话派生新会话不同，此操作支持非持久化模式（在内存中替换会话）。
- `AgentSession.fork(undefined, { requireIdle: true })` 对从整个会话派生新会话也应用相同的空闲检查（在 `session_before_switch` 之前检查，刷新完成后再次检查）。RPC `fork` 对两种派生方式都传入该选项，因此忙碌时两者都会被拒绝，并返回 `code: "session_busy"`。交互式 `/fork` 不传入此选项，因此仍可让正在运行的 bash 命令在新会话中继续执行。

### CLI `--fork <id|path>` \{#cli---fork-idpath}

启动时，在常规会话创建之前解析 `--fork`：

1. `--fork` 不能与 `--no-session` 同用。
2. 看起来像路径的值（含 `/`、`\` 或 `.jsonl`）直接从指定路径派生新会话。
3. 其他值通过 `resolveResumableSession(...)` 解析：先查找本地会话，未显式指定 `sessionDir` 时再全局查找。可按转为小写的会话 ID 前缀、完整 JSONL 文件名的前缀，或去掉时间戳后文件名中的 ID 后缀匹配。
4. 派生出的文件在当前工作目录和会话目录所确定的范围内创建，其会话管理器在启动时生效。默认递归复制原会话的产物。如果源文件不存在，操作会失败，不会派生出空会话。
   复制的活动分支中，如果工具调用尚无结果，子会话会为它配上一条
   “结果未知”的结果，而非标记为从未执行。
   如果因长度限制而停止，则仅在没有开始执行标记时保留
   “从未执行”的保护机制。如果原会话在最后一条消息之后已记录进程退出，
   这一步不会修复它：子会话会对待处理的调用发出警告，
   并通过常规的进程退出恢复流程为它们配对结果。
   父会话的会话记录保持不变。
5. 派生新会话时，如果保留完整上下文，系统会自动用源文件头中继承的键初始化 `providerPromptCacheKey`，没有该键时则用原会话 ID。启动时若显式指定 `--model`、`--thinking`、`--system-prompt`、`--system-prompt-template`、`--append-system-prompt`、`--tools`、`--no-tools`，或有适用于当前作用域的模型覆盖，就不再自动继承该键。

使用 `--prompt-cache-key <key>` 可显式固定模型提供方的提示词缓存标识，不受 OMP 会话 ID 或 `--provider-session-id` 影响。`--provider-session-id` 仍控制发给模型提供方的会话及路由请求头，以及是否沿用同一凭据；`--prompt-cache-key` 在受支持时控制 OpenAI Responses 请求体中的 `prompt_cache_key`。

## 恢复与继续 \{#resume-and-continue}

## 交互式 `/resume [value]` \{#interactive-resume-value}

不带参数时：

1. 打开会话选择器，通过 `SessionManager.listForPicker(currentCwd, currentSessionDir)` 填充列表。置顶会话排在最前面；既无标题也无提示词的零轮会话占位项默认隐藏，置顶的除外。选择器始终在当前目录范围打开；如果列表为空，会提示按 Tab 切换到所有项目，不会自动切换。
2. 按 Tab 可切换到所有项目的范围，首次需要时才加载并缓存 `SessionManager.listAllForPicker()` 的结果。
3. 选定会话后，`SelectorController.handleResumeSession(sessionPath, { followContinuation: true })` 先通过 `findSessionContinuation` 找到包含最新一轮的副本（见 CLI `--resume <value>`），然后调用 `session.switchSession(<that path>)`。如果切换被拒绝，会返回 `false`，选择器随即停止，不应用新会话的界面状态。
4. 切换成功后，界面会清空并重建聊天内容和待办事项，然后显示 `Resumed session`。如果恢复的是另一个项目的会话，则显示 `Resumed session in <dir>`，并通过 `applyCwdChange` 调整进程工作目录及其派生缓存。

带参数时：

- `/resume <id>` 按 ID 或文件名前缀解析，先查本地，再回退到全局查找。它打开 `resolveResumeTarget` 选出的副本，与 CLI 的 `--resume <id>` 打开的是同一份（见 CLI `--resume <value>`）。无法识别该值时会报告 `Session "<value>" not found`。
- `/resume @claude` 和 `/resume @codex` 会打开外部会话选择器。选中会话后，先转换它并用新的 OMP 会话标识持久化，再切换到该新会话。

## CLI `--resume` \{#cli---resume}

### `--resume`（不带值） \{#--resume-no-value}

- `main.ts` 针对当前工作目录和会话目录使用 `SessionManager.listForPicker()`，并在当前目录范围打开选择器。如果列表为空，则预加载 `SessionManager.listAllForPicker()` 的结果，让用户按 Tab 时可立即切换。系统不会自动切换范围；只有全局会话列表也为空时，才输出 `No sessions found`。
- 创建会话前，先通过 `SessionManager.open(selectedPath)` 打开选定路径；随后进程和项目范围切换到恢复会话的工作目录（`switchToResumedProject`），重新加载该目录范围内的设置和插件缓存，并重新解析该范围的模型。

### `--resume <value>` \{#--resume-value}

`createSessionManager()` 的解析顺序：

1. 如果值看起来像路径（含 `/`、`\` 或 `.jsonl`），就直接打开。路径不存在时会报 `Session "<path>" not found.`，不会在该处创建会话。
2. 否则，`resolveResumableSession(...)` 会查找：
   - 当前范围（`SessionManager.list(cwd, sessionDir)`）
   - 全局会话（`SessionManager.listAll()`），仅在未显式指定 `sessionDir` 时查找
3. 可匹配不区分大小写的会话 ID 前缀、完整 JSONL 文件名的前缀，以及 `<timestamp>_<sessionId>.jsonl` 中时间戳之后的 ID 后缀。
4. 如果没有匹配项，解析器（`resolveResumeTarget`）会在相同范围内查找文件名匹配但已无法作为会话读取的 `<timestamp>_<sessionId>.jsonl` 文件（列表会跳过它），并选取延续其会话的副本（见下文）。如果仍未找到可用的副本，解析失败并报 `Session "<value>" not found.`

这两种方式随后都会查找会话的延续副本（使用 `findSessionContinuation`，按标识查找时经由 `resolveResumeTarget`）：如果对话在同一目录中的另一个文件里继续（同目录文件的文件头在 `continuationOf` 中指向原文件），就改为打开包含最新一轮的副本，除非指定的文件中含有该副本没有的对话轮次。提示会列出两个文件。若文件已不再保存其自动生成的 `<timestamp>_<sessionId>.jsonl` 文件名所标识的会话，说明该会话原先使用的文件已被替换（冲突恢复不会改动当时找到的文件）。此时，若存在延续该会话的副本，恢复操作就打开它。这适用于按路径指定但已无法解析的文件，也适用于按标识查找时只匹配文件名（文件实际保存的是另一个会话），或在第 4 步中找到未列出的文件。如果按路径指定的文件保存了另一个会话，就会打开那个会话。非自动生成的文件名不记录会话 ID，因此这类文件不会被视为已替换。

匹配 ID 或文件名前缀时的行为（无论本地还是全局）：

- 如果匹配会话记录的目录已不存在，CLI 会询问 `Session's directory no longer exists (...). Move (re-root) it into the current directory? [Y/n]`。
   - 选择是（默认）时，`SessionManager.open()` 通过 `initialCwd` 仍以已不存在的源工作目录为基准打开会话，然后 `manager.moveTo(cwd, sessionDir)` 将现有会话的根目录迁移到当前目录，不复制会话。
   - 选择否时，取消启动。非 TTY 模式下，启动会失败，并报错提示用户以交互模式运行。
   - 使用 `--mode rpc`、`--mode rpc-ui` 或 `--mode acp` 时，协议占用标准输入和标准输出，因此不会询问。会话从原存储位置打开，以启动目录为工作目录，与按路径恢复相同。
   - 如果会话记录的目录是启动目录所在仓库中已移除的工作树，无论哪种模式，都会直接将会话迁移到启动目录，不作询问。
- 如果记录的目录仍存在，就直接打开匹配的会话。随后，启动流程把进程和项目范围切换到恢复会话的工作目录，并重新加载该目录范围内的设置和插件缓存。此过程不会自动派生新会话。

按路径恢复会直接打开会话，不会因目录缺失而询问是否迁移。
如果记录的工作目录不存在或没有访问权限，启动时会保留启动目录为工作目录，
不移动会话记录。如果无法切换工作目录或调整作用域，
还会输出一条回退警告。
选择器选中的会话也适用相同的目录访问规则。直接指定的路径不存在时，
会报 `Session "<path>" not found.`；文件存在但为空，或非空的文件头格式有误时，
恢复会停止且不修改该文件，除非原文件已被替换，且原会话在同目录的另一个文件中继续
（见上文）。

## CLI `--restore` \{#cli---restore}

`--restore [value]` 选择和打开会话的方式与 `--resume [value]`
完全相同。交互式 TUI 启动后，它会继续该会话上一个进程结束时
尚未完成的工作（`task/restore.ts`、`restoreSession`）。发生崩溃后，Tern 的
会话守护进程用此选项重新启动 omp 窗格：omp 会在报告会话文件的同时报告
`omp_restore=1`（OSC 1337 用户变量），表示支持此选项。`/restart` 也用此选项
重新启动。

进程关闭时若打断了子代理的一轮，即使进程正常关闭，
子代理也视为在轮次中途停止：其所属代理在关闭时用
`INTERRUPTED_TURN_ERROR` 中止这次运行，并将子代理的 `session_exit` 记录为进程退出
（`postmortem.Reason.EXIT`）。无论是任务执行器驱动的首次运行，
还是由生命周期清理流程终止的已唤醒代理的轮次，都适用此规则。

1. **先处理子代理。** 对会话下每份已持久化的子代理会话记录
   （`<session>/<AgentId>.jsonl`，包括嵌套子代理），如果进程结束时该子代理仍在轮次中、
   未被终止（没有墓碑标记），且可以冷唤醒重建
   （有 `session_init` 契约且未隔离），它就会再运行一轮受监控的任务。
   任务使用该子代理的 ID，作为父代理的后台作业运行。生命周期恢复器
   根据会话记录重建子代理，该轮按下文所述继续，父代理则通过该作业
   常规的 `async-result` 收到结果，因此此前正在等待该作业的父代理
   仍能找到它。
2. **再处理会话自身的轮次**（`AgentSession.restoreInterruptedTurn`）。若某轮被打断且没有
   `session_exit` 记录（崩溃、SIGKILL 或断电都不会留下该记录），
   会先按已有退出记录时的退出恢复方式结束该轮：
   为未完成的工具调用补上“结果未知”的结果，
   然后中止这个被打断的轮次。接着按 `/retry` 的方式重试这一轮：
   如果某批调用全部被打断，就重新运行该批调用；否则模型会从
   会话记录中断处继续作答。

如果上一轮已完成、已失败或被用户中断，或该轮之后记录了正常退出
（用户在该轮中断后退出），就不会继续任何工作。
`--restore` 仅适用于交互模式，不接受提示词，也不能与
`--continue`、`--fork`、导入选项、`--goal` 或 `--no-session` 同用。
`/restart` 会像移除其他一次性会话选择参数一样移除启动时传入的 `--restore`，
并为当前会话重新添加此选项。

## CLI `--continue` \{#cli---continue}

`SessionManager.continueRecent(cwd, sessionDir)`：

1. 解析当前工作目录对应的会话目录。
2. 读取当前终端范围内的会话定位记录。若定位记录是新写入的，且对应的延迟创建 JSONL 文件还不存在，就启动新会话，不会重新打开较早的对话。显式调用 `newSession()` 划定的新会话已有持久化的文件头。
3. 如果定位记录指向嵌套的产物会话或子代理会话，就向上查找顶层交互式父会话（最多八层）。
4. 工作目录匹配时，使用该定位记录；若显式指定了会话目录，该记录还必须位于此范围内。否则，查找流程会选取最近一个有可恢复内容的会话，跳过既无标题也无提示词的零轮会话占位项。
5. 如果记录中的工作目录既不同于当前目录、也已不存在，自动迁移会话根目录还要求当前目录的设备号和 inode 与定位记录中的目录标识一致，并且当前项目没有应优先使用的会话。路径已删除或卸载、旧版定位记录缺少目录标识，或目录跨文件系统移动，都不足以作为迁移会话历史的依据。
6. 如果选中的会话在同一目录中的另一个文件里继续（其文件头在 `continuationOf` 中指向所选会话），就改选该副本，并通过 `onSessionContinuation` 选项报告（CLI 会输出提示）。第 5 步迁移的是这个副本，而非定位记录所指的文件。与 `--resume` 一样，如果定位记录所指会话中含有延续副本没有的对话轮次，仍保留该会话；如果按写入时间选取，则不论关联指向哪个方向，都选含有最新一轮的副本。
7. 打开选中的会话；如果没有候选项，则创建新会话。

为保持兼容，UUID 是唯一的位置消息参数时，`--continue <full-UUID>` 会转换为 `--resume <UUID>`。未显式提供会话选项或会话目录时，`autoResume` 设置会采用相同的 `continueRecent` 行为；如果找到以前的会话记录，还会恢复会话的模型和思考状态。

如果交互模式下的隐式自动恢复已试过所有保存的模型，而模型回退策略又不允许更换模型，启动流程会关闭被跳过的会话、发出警告，并启动新会话，不沿用原会话的历史或模型提供方缓存标识。启动流程不会重试更早的会话记录，也不会放宽恢复策略。设置了 `--max-time` 时，新会话沿用本次启动原有的绝对截止时间；恢复失败所花的时间不会补回预算。在同一策略下，显式的 `--continue`/`--resume`、运行时的 `/resume`、无界面或 SDK 宿主仍会拒绝恢复。要改用另一模型恢复会话记录，仍可显式覆盖模型。

此行为仅在启动时生效；交互模式下没有 `/continue` 斜杠命令。

## 重启 \{#restart}

交互式 `/restart` 执行常规关闭流程，完成退出后清理并刷新标准输出，
然后重新启动 CLI。`restartArgv()` 保留启动配置选项，但移除原始提示词、
`@file` 位置参数，以及一次性会话选择参数
（`--session`、`--resume`、`--restore`、`--continue`、`--fork` 和
外部会话导入参数）。只有会话确实已写入磁盘时，才会添加
`--restore <session-file>`，让关闭时在轮次中途被打断的子代理在新进程中继续
（见 [CLI `--restore`](#cli---restore)）。如果会话只存在于内存中，
或从未写入磁盘，重启后会开启新会话。

POSIX 在支持时替换进程映像。Windows 上或执行替换失败时，
则回退到启动替代进程，并让它继承终端流。

## 会话切换对运行时状态的影响 \{#how-session-switching-actually-mutates-runtime-state}

`AgentSession.switchSession(sessionPath)` 执行恢复类操作所用的运行时切换：

1. 触发 `session_before_switch`，附带 `reason: "resume"` 和 `targetSessionFile`（可取消）。
2. 断开代理事件订阅，中止正在执行的工作，并运行可选的切换前协调器。
3. 刷新待处理的 bash 和会话写入，保存回滚所需的状态：会话管理器状态、代理消息和所有队列、模型与思考级别及服务层级、工具与提示词、模型提供方与缓存 ID、记忆提升状态，以及检查点回退状态。
4. 清空代理队列和下一轮队列。如果切换到不同文件，先处理完顾问记录器的待办工作，再将其分离。
5. 调用 `sessionManager.setSessionFile(sessionPath)`，更新模型提供方缓存和会话 ID 以及记忆键，构建显示上下文，解析记录的模型，并还原检查点状态。切换到不同文件时，如果无法恢复任何已记录的模型，切换会在此处失败并报 `Could not restore model <provider/id>`（见下文）。
6. 触发 `session_switch`，附带 `reason: "resume"`。
7. 替换代理消息，重置顾问状态，并同步待办事项。如果切换到不同文件，或重新加载同一文件但回放消息发生了变化，就关闭缓存的模型提供方会话。
8. 应用解析出的模型或显式请求的模型。如果载入的分支以一次中断的轮次结尾，就追加为该轮生成的中止消息，并重建上下文。
9. 恢复配置的思考级别、实际生效的思考级别，以及每个模型系列的服务层级。如果目标分支没有相应条目，就使用当前设置。
10.   如果切换到不同的会话记录，就重置记忆上下文。凡是改写对话内容的切换，都会清除会话范围内的工具状态。
11.   重新订阅代理事件，运行可选的会话切换协调器（交互模式用它重新进入计划模式等已持久化的模式），并尽力刷新工作区根目录的系统提示词区块。协调器或提示词刷新出错时，只记录错误，不回滚已提交的切换。
12.   恢复目标会话的顾问费用状态，完成 bash 切换；若会话 ID 已更改，则通知会话变更回调，最后返回 `true`。
      如果切换前钩子取消操作，或工作目录策略拒绝切换，`switchSession()` 会返回 `false`。跨项目切换缺少工作目录变更回调时会被拒绝，不会静默改用目标工作目录；回调拒绝也会取消切换。交互式选择器会检查此结果，并保持现有会话和界面不变。

如果受保护的切换过程有步骤抛出异常，`switchSession()` 会恢复先前保存的会话、代理队列和消息、工具和提示词、模型与思考及服务层级、模型提供方与缓存、记忆及检查点状态。随后重新连接原代理事件订阅，再执行一次模式协调，最后重新抛出异常。

常规恢复会打开已有的会话记录。由于切换委托给
`setSessionFile()`，显式指定的目标缺失或为空时，可能会在该路径创建
新会话；非空但格式有误的文件头会被拒绝。

和启动时恢复一样，无法恢复模型时默认拒绝切换，不会静默改用会话记录中未指定的模型。只有创建会话时启用了 `hasUI` 和 `allowSessionModelFallback`（TUI），且 `retry.modelFallback` 已开启，才会保留当前模型并警告 `Could not restore model <provider/id>. Using <provider/id>`。显式指定 `model` 选项（RPC `open_session`/`switch_session` 的 `provider`/`modelId`）会覆盖记录的模型；重新加载同一文件会保留当前模型。

## 事件触发与取消时机 \{#event-emissions-and-cancellation-points}

### 会话切换与派生新会话的生命周期钩子 \{#switchfork-lifecycle-hooks}

适用于 `newSession`、`fork` 和 `switchSession`：

- 操作前事件：`session_before_switch`
   - 原因：`new`、`fork`、`resume`
   - 返回 `{ cancel: true }` 可取消操作
- 操作后事件：`session_switch`
   - 原因取值相同
   - 包含 `previousSessionFile`

`ExtensionRunner.emit()` 收到第一个取消操作的前置事件结果时，就提前返回。
切换前钩子取消操作时，`switchSession()` 返回 `false`，且不会触发切换后事件。

### 自定义工具的 `onSession` 行为 \{#custom-tool-onsession-behavior}

SDK 将扩展的会话事件转发给自定义工具的 `onSession` 回调：

- `session_switch` -> `onSession({ reason: "switch", previousSessionFile })`
- `session_branch` -> `reason: "branch"`
- `session_start` -> `reason: "start"`
- `session_tree` -> `reason: "tree"`
- `session_shutdown` -> `reason: "shutdown"`

这些回调只用于观察，不能取消会话切换或派生新会话。

### 其他取消或阻止操作的情况 \{#other-cancellation-surfaces-relevant-to-this-doc}

- 流式输出期间无法使用 `/fork`，用户必须先等待当前响应完成或中止它。
- 用户可关闭 `/resume` 选择器来取消操作。
- 跨项目执行 `--resume <id>` 时，可以在目录缺失的迁移提示中选择否来取消恢复。
- `/share` 可在界面取消（`Share cancelled`）；已开始的上传不会被中途终止。

## 非持久化（内存）会话的行为 \{#non-persistent-in-memory-session-behavior}

用 `SessionManager.inMemory()`（`--no-session`）创建会话管理器时：

- 没有会话文件路径。
- `/export` 会以 `Cannot export in-memory session to HTML` 失败（错误会传递到命令错误界面）。`/share` 仍可用，因为快照直接从当前条目构建。
- `/fork` 会失败，因为 `SessionManager.fork()` 要求会话持久化。
- `/dump` 仍可用，因为它序列化的是内存中的代理状态。
- CLI 原生的 `--resume`、`--continue` 和 `--fork` 不能与 `--no-session` 同用。启动时的初步参数解析可能会分配一个内存会话管理器，但校验会在正常执行前拒绝这些组合。

## 当前实现的已知限制 \{#known-implementation-caveats-as-of-current-code}

- `/share` 的自定义共享失败时，不会回退到默认的加密共享流程；TUI 命令会报错并结束。
- `/export` 拆分参数时，即使用引号括起路径，也无法保留含空格的路径。
- `/delete` 只会尽力删除：它尝试删除当前会话的 JSONL 和产物目录，
  记录删除过程中发生的任何错误，
  然后仍会创建并切换到新会话。
  如果删除失败或仅部分成功，旧会话或其产物可能仍留在磁盘上，
  因此 `/delete` 不保证彻底擦除。
