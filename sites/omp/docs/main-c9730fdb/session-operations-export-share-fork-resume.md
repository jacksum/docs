---
title: "会话操作：export、dump、share、fresh、clear、fork、resume/continue"
description: "Oh My Pi 官方仓库文档：会话操作：export、dump、share、fresh、clear、fork、resume/continue。"
---

# 会话操作：export、dump、share、fresh、clear、fork、resume/continue \{#session-operations-export-dump-share-fresh-clear-fork-resumecontinue}

本文描述当前实现中，操作者可见的会话导出、分享、对话重置、生命周期、派生新会话和恢复操作行为。

## 实现文件 \{#implementation-files}

- [`src/slash-commands/builtin-collaboration.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)：export/dump/share 命令规范
- [`src/slash-commands/builtin-lifecycle.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-lifecycle.ts)：生命周期命令规范
- [`src/modes/controllers/command-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/command-controller.ts)：TUI 执行
- [`src/modes/controllers/selector-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/selector-controller.ts)：恢复/导入选择器和 cwd 过渡
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)
- [`src/export/html/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/html/index.ts)
- [`src/export/share.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/share.ts)
- [`src/export/custom-share.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/custom-share.ts)
- [`src/cli/flag-tables.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/cli/flag-tables.ts)：重启参数重写
- [`src/main.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/main.ts)

## 操作矩阵 \{#operation-matrix}

| 操作 | 入口路径 | 会话变更 | 会话文件创建/切换 | 输出产物 |
| --- | --- | --- | --- | --- |
| `/dump [all]` | 斜杠命令（TUI/无界面） | 否 | 否 | 剪贴板/命令文本，加上尽力生成的临时 JSON 附属文件；`all`：临时 zip |
| `/export [--themes] [path]` | 斜杠命令（TUI/无界面） | 否 | 否 | HTML 文件 |
| `--export <session.jsonl> [outputPath]` | CLI 启动快速路径 | 不变更运行时会话 | 没有活动会话；读取目标文件 | HTML 文件 |
| `/share` | 斜杠命令（TUI/无界面） | 否 | 否 | 加密分享链接（gist 或分享服务器）；仅 TUI 自定义处理器使用临时 HTML |
| `/new` | 交互式斜杠命令 | 是（开始空对话） | 切换标识，并在持久化模式下落盘新的头部 | 无 |
| `/fresh` | 斜杠命令（TUI/无界面） | 是（仅更改面向提供方的内存 id/状态） | 否；保留当前会话文件/头部 | 无 |
| `/clear` | 交互式斜杠命令 | 是（清空实时/模型对话上下文） | 保留标识/文件/历史；延迟创建的会话仍遵循正常持久化门控 | 追加 `reset_boundary` |
| `/delete` | 交互式斜杠命令 | 是（开始空对话） | 尝试删除当前持久化会话和产物，然后切换到延迟创建的后继会话（有内容前不创建空文件） | 无 |
| `/fork` | 交互式斜杠命令 | 是（活动会话标识发生变化） | 创建新的会话文件，并将当前会话切换到该文件（仅限持久化模式） | 存在产物目录时，将其复制到新会话命名空间 |
| `/fork pane`, `/fork window`, `/fork tab` | 交互式斜杠命令 | 否（保留父会话） | 根据已刷写的当前会话记录，在多路复用器窗格/分组（tmux 窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区）中打开子 OMP 进程 | 子进程获得独立的派生会话 |
| `--fork <id\|path>` | CLI 启动 | 是，在会话创建之后 | 从选定来源派生新会话到当前 cwd/会话目录 | 默认递归复制来源产物 |
| `/resume [id\|@claude\|@codex]` | 交互式斜杠命令 | 是（替换活动内存状态） | 切换到选中/匹配的会话，或导入选中的外部会话 | 无 |
| `--resume` | CLI 启动选择器 | 是，在会话创建之后 | 打开选中的现有会话文件（选择器以当前文件夹范围打开；仅为全部为空时提前退出和即时 Tab 切换而预加载全局列表） | 无 |
| `--resume <id\|path>` | CLI 启动 | 是，在会话创建之后 | 打开现有会话；记录的 cwd 缺失时，可能将其重新定位到当前目录（协议模式原地打开，但来自已移除工作树的会话除外） | 无 |
| `/restart` | 交互式斜杠命令 | 是（重新启动进程） | 保留配置标志；恢复已落盘的会话（`--restore`），否则重新开始 | 无 |
| `--continue` | CLI 启动 | 是，在会话创建之后 | 打开终端面包屑指向的会话或最近会话；没有现有会话时创建一个新会话 | 无 |

## 导出和转储 \{#export-and-dump}

### `/export [--themes] [outputPath]`（斜杠命令） \{#export---themes-outputpath-slash-command}

流程：

1. 协作命令规范（`src/slash-commands/builtin-collaboration.ts`）使用 `parseExportArgs` 解析无界面参数；TUI 委托给 `CommandController.handleExportCommand`，后者使用相同的解析器。
2. `--themes` 选择已配置的深色/浅色 TUI 主题，而不是独立网页配色。移除此标志后，最多接受一个以空白分隔的路径；多余的词元会产生 `Usage: /export [--themes] [path]`。
3. `AgentSession.exportToHtml()` 调用 `exportSessionToHtml(sessionManager, state, { outputPath, palette, themeNames })`。
4. TUI 显示路径，并在浏览器中打开文件。无界面命令执行打印路径，但不打开文件。

在 TUI 中，`/export` 的目标是 `viewSession`：聚焦的子代理会导出自身的
会话记录及其后代，而不是主会话。`/dump` 和 `/share` 仍然
以主会话为目标。

行为细节：

- `--copy`、`clipboard` 和 `copy` 参数会被明确拒绝，并警告应使用 `/dump`。
- 导出内容嵌入会话头部/条目/叶节点，以及智能体状态中的当前 `systemPrompt` 和工具描述。导出的头部省略 `previousSessionFiles`。
- 查看器采用 `/stats` 设计，提供自动/浅色/深色主题；浅色主题使用柔和的灰色表面和高对比度次级文本。侧边栏列出主会话、嵌套子代理和顾问；选择会话或任务卡片中的智能体会打开其会话记录和对话树。会话和消息链接会保留所选的会话记录。
- 存储在会话文件旁边的子会话记录（`<session>/<AgentId>.jsonl`，对嵌套生成递归处理）以 `subSessions` 嵌入，包括顾问和 gzip 压缩的会话记录。发现过程仅进入真实的子目录，并将已标记删除的智能体标记为 `aborted`。`ExportOptions` 中的 `includeSubSessions: false` 会排除子会话记录及其追踪轨道。
- 底部的 **时间线** 抽屉和 **追踪** 视图复用 `/trace` 的 span 组装和查看器：时长/轮次/调用轴、空闲压缩、搜索、缩放、嵌套轨道、条目详情和工具汇总。**跳转到会话记录** 会打开对应的会话和消息。所有会话记录和追踪数据都保留在嵌入内容中；不需要统计服务器。开发版和发布版导出都会从 `stencil.so` 加载共享库，因此打开 HTML 需要网络访问。
- 工具调用使用 `<omp-tool-view>`（与 collab-web 共享）；追踪使用 `<omp-session-trace>`（与 stats 共享）。`bun gen:export-viewer` 将这些组件与外壳、样式和默认主题一起打包。源码检出版本会将生成的查看器内联到每次导出中；打包发布版从 `build.stencil.so` 加载其版本化查看器。两者都从按内容寻址的 `stencil.so/assets/omp/` URL 加载共享 Markdown 和高亮库，并通过子资源完整性校验固定。上传的只有查看器代码，绝不会上传会话数据。
- 打包版导出增加约 2 KiB 的固定 HTML 开销；源码版导出还包含生成的查看器。除会话数据外，`--themes` 还会嵌入所选 TUI 主题的覆盖设置。
- 导出期间不会追加任何会话条目。
- 默认文件名是当前目录中的 `omp-session-<session-file-stem>.html`。HTML 导出不会对秘密进行脱敏，也不会加密；它可能包含原始上下文、图像数据和扩展负载。

注意事项：

- 解析基于空白，因此带空格的引号包裹路径不会被保留。请使用不含空格的路径。
- 源码检出版本需要在导出前运行 `bun gen:export-viewer`。缺少生成的查看器时会报告需要运行的命令；打包版查看器资源会在发布 CI 发布后可用。

### `--export <inputSessionFile> [outputPath]`（CLI） \{#--export-inputsessionfile-outputpath-cli}

`main.ts` 中的流程：

1. 提前处理（在交互式/会话启动之前）。
2. 调用 `exportFromFile(inputPath, outputPath?)`。
3. `SessionManager.open(inputPath, ..., { suppressBreadcrumb: true, throwIfMissing: true })` 加载条目，然后生成并写入 HTML。
4. 进程打印 `Exported to: ...` 并退出。

行为细节：

- 输入文件缺失时显示 `File not found: <path>`；文件为空或头部格式错误时会失败，但不创建或替换输入文件。
- 此路径不会创建 `AgentSession`、更新终端面包屑，也不会变更任何正在运行的会话。
- 独立导出没有实时智能体状态，因此不会添加当前系统提示词/工具描述。它会嵌入加载的条目和子代理会话记录。

### `/dump`（剪贴板/无界面文本导出） \{#dump-clipboardheadless-text-export}

流程：

1. 命令调用 `session.formatSessionAsText()`。
2. 如果返回空字符串，命令报告 `No messages to dump yet.`
3. 否则，它还会尝试调用 `session.dumpLlmRequestToTmpDir()`，并将生成的路径追加到会话记录。TUI 将组合文本复制到剪贴板；无界面/ACP 命令执行将其作为命令输出返回。

转储使用实时智能体消息数组，而不是每个分支或每条历史
JSONL 条目。在 `/clear` 或上下文压缩之后，它反映当前实时上下文；
对于持久化的对话图，请使用 HTML 导出。

转储的会话记录内容包括：

- 系统提示词
- 活动模型/思考级别
- 工具定义 + 参数
- 用户/开发者/助手消息
- 思考块和工具调用
- 工具结果和执行块（不包括 `excludeFromContext` bash/python 条目）
- 自定义/钩子/文件提及/分支摘要/上下文压缩摘要条目

尽力生成的 JSON 附属文件位于操作系统临时目录下，名为 `omp-llm-request-<id>.json`。它包含当前模型、思考级别、服务层级、系统提示词、传输用工具模式，以及转换为 LLM 格式的消息。命令结束后它仍会保留，并可能包含原始上下文或秘密；请据此保护或删除它。附属文件失败不会阻止输出会话记录（TUI 会报告失败；无界面执行则静默省略该路径）。

转储不会追加任何会话持久化条目。

### `/dump all`（各智能体转储的 zip 压缩包） \{#dump-all-zip-of-per-agent-dumps}

`/dump all` 调用 `session.dumpSessionArchiveToTmpDir()`，在操作系统临时目录下
写入 `omp-dump-<id>.zip`，其中包含：

- `session.md`：与 `/dump` 复制的主会话记录相同
- `llm-request.json`：与 `/dump` 附属文件相同的负载（尽力生成；转换失败时省略）
- `subagents/<path>.md`：`collectSubSessions` 发现的每个持久化子代理各有一个文件（例如 `subagents/Scout.md`、`subagents/Scout/Helper.md`），以 `# Subagent: <path>` 为标题，包含持久化的模型、思考级别、被终止智能体的 `Status: aborted`，以及子代理最后一条目所在分支上的消息，像主会话一样解除混淆

子代理系统提示词和工具清单不会持久化，因此子代理文件省略它们。没有消息的子代理会被跳过。如果子代理发现失败，压缩包仍保留主转储，且报告会说明缺少子代理的原因。TUI 将压缩包路径复制到剪贴板，并列出其成员；无界面/ACP 将相同报告作为命令输出返回。与附属文件一样，压缩包会保留，并可能包含原始上下文或秘密。

## 分享 \{#share}

`/share` 发布会话的端到端加密快照，并打印
查看器链接。实现：[`../packages/coding-agent/src/export/share.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/export/share.ts)。

### TUI 阶段 1：自定义分享处理器（如有） \{#tui-phase-1-custom-share-handler-if-present}

交互式 TUI 的 `loadCustomShare()` 在活动智能体目录
（默认为 `~/.omp/agent`）中查找第一个存在的候选文件：

- `share.ts`
- `share.js`
- `share.mjs`

要求：

- 模块必须默认导出一个函数 `(htmlPath) => Promise<CustomShareResult | string | undefined>`。

如果存在且有效，会保留旧契约：将会话
导出到临时 HTML 文件（`${os.tmpdir()}/${Snowflake.next()}.html`），
处理器接收其路径，随后删除临时文件。
处理器结果的解释方式：

- 字符串 => 视为 URL，显示并打开
- 对象 => 显示 `url` 和/或 `message`；打开 `url`
- `undefined`/假值 => 通用的 `Session shared`

关键回退行为：

- 如果自定义处理器存在但加载失败，命令报错并返回。
- 如果自定义处理器执行时抛出异常，命令报错并返回。
- 在这两种失败情况下，**都不会**回退到默认流程。
- 仅在没有自定义分享脚本时运行默认流程。
- 无界面/ACP 斜杠命令执行不会加载自定义分享脚本；它始终使用默认加密流程。

自定义处理器接收普通 HTML 导出，而不是默认的已脱敏/加密
快照。其发布、加密和隐私策略完全由其
自行决定。HTML 导出契约还意味着，自定义处理器无法通过
此路径分享内存中的会话。

### 默认加密分享 \{#default-encrypted-share}

对于无界面执行，或仅当 TUI 中未找到自定义分享处理器时，`shareSession()` 会：

1. 构建主会话快照（`header`、`entries`、`leafId`，以及智能体状态中的当前
   `systemPrompt` 和工具描述），省略头部的
   `previousSessionFiles`。与 HTML 导出不同，此流程不收集
   子代理会话记录文件。
2. 如果启用 `share.redactSecrets`（默认启用），且混淆器中存在已配置或通过正则表达式发现的秘密，则会进行按类型、按字段的脱敏处理，重写头部、提示词、工具、条目、子会话和消息中的文本字段。内联图像字节会保留，留待后续大小处理。不透明的提供方重放字段和无类型的扩展负载（`details`、`data`、`outputSchema`、上下文压缩保留数据）会被丢弃，而不是遍历。
3. JSON 经 gzip 压缩，并使用新生成的 AES-256-GCM 密钥封装
   （`[12B IV][ciphertext+tag]`）。
4. 上传目标由 `share.store` 选择：
   - **分享服务器**（默认，`store: "blob"`）：通过 `POST <share.serverUrl>`
     （默认为 `https://my.omp.sh/s`）上传原始 blob，上限为 1 MB。
     超大快照会被裁剪直至符合限制：先裁剪内联图像，
     再裁剪长字符串（字符上限依次为 32,768 → 8,192 → 2,048 → 512），然后
     裁剪最早的条目。如果缩减后的快照仍超出预算，分享会
     失败，而不是上传超大 blob。
   - **私密 gist**（`store: "gist"`）：当 `gh` 已安装且
     已通过身份验证时，将封装后的 blob 以 base64 编码推送为
     `session.ompshare.txt`（封装后预算为 5 MB；gist 原始内容获取上限为
     10 MB），当 `gh` 不可用或 gist
     创建失败时回退到分享服务器。
5. 两种情况下的链接都是 `<share.serverUrl>/<id>#<base64url key>`。
   该地址提供的查看器页面获取 blob（十六进制 id 通过 GitHub gist
   API 获取，其他 id 从服务器的 blob 存储获取），并在
   客户端解密；密钥只存在于 URL 片段中，绝不会出现在
   任何 HTTP 请求里。

UI 会报告分享 URL（适用时还会提供底层 gist URL 和截断
说明）。无界面 `/share` 打印相同的内容。与
`/export` 不同，`/share` 支持内存中（`--no-session`）的会话：
快照根据实时条目构建，无需会话文件。

分享中的取消/中止语义：

- 加载器具有 `onAbort` 钩子，用于恢复编辑器 UI 并报告 `Share cancelled`。
- 上传本身不会在传输中途中止；取消发生在 UI 层，
  并在上传返回后检查。

## 新建和删除 \{#new-and-delete}

交互式 `/new` 开始一个新的对话标识。TUI 首先中止任何
活动的上下文压缩；`AgentSession.newSession()` 发出可取消的
`session_before_switch` 事件，中止旧运行，取消其拥有的异步任务，
关闭提供方状态，并排空待写出内容/顾问记录器。持久化模式的
`SessionManager.newSession()` 会在返回前写入新头部，甚至早于
第一条助手响应。

新会话保留当前模型/设置和已配置的思考
选择器，但清空对话/队列、待办事项/检查点/工具状态、继承的
缓存标识、顾问支出和已提升的记忆上下文。工作区根目录
根据当前设置初始化，项目指令从磁盘刷新。
TUI 退出聚焦的子代理视图，并清空其会话记录。

`/delete` 使用相同的过渡，并设置 `drop: true`。它要求存在会话文件
路径，尝试删除旧 JSONL 和产物树，而不是保留
它们，且即使删除失败也会启动新会话。与 `/new` 不同，这个
后继会话采用延迟创建：在有内容之前不写入头部，因此
不发送消息便退出不会留下零轮次会话。切换前钩子可以
取消任一操作。vibe 模式活动期间，两者都会被拒绝。

## Fresh \{#fresh}

`/fresh`（TUI/无界面）重置当前会话面向提供方的流状态，
**不触碰本地会话记录、会话文件或头部**。可以
用它从卡住或损坏的提供方流中恢复（过期的提示词缓存、
轮次中途的故障，或已漂移的服务端对话 id），同时
保留可见的对话。

`AgentSession.freshSession()`：

- 智能体正在流式输出时会被拒绝，请等待响应完成或
  先将其中止。
- 关闭每个缓存的提供方会话状态条目（服务端对话 /
  提示词缓存句柄），并报告清理的数量。
- 生成新的提供方会话 id，重新设置记忆状态的键，并使
  仅追加上下文失效，从而让下一轮根据本地对话重建。
- 保持本地会话记录、会话文件和 OMP 会话管理器标识
  不变；面向提供方的 `AgentSession.sessionId` 会改变。

因为同时保留可见对话和面向模型的对话，`/fresh`
不同于 `/clear`（就地清空实时/模型对话）、`/new`
（开始全新的空会话）和 `/delete`（尝试删除当前
会话并开始新会话）。只有 `/fresh` 能在保留现有对话的
同时，让提供方流状态重新开始。

## 清空 \{#clear}

交互式 `/clear` 就地清空当前对话上下文。它
仅在 TUI 中可用，在响应流式输出或
前台 bash/Python 执行正在运行时会被拒绝。如果上下文压缩正在进行，
命令会中止它，并等待其停止后再重置。

`AgentSession.resetSessionContext()`：

- 丢弃实时消息、排队的引导/后续轮次、待处理工具调用、错误
  状态、检查点/回退和延迟工具状态，以及会话停止
  续接状态。它还会取消此智能体排队的续接工作和
  异步 bash/task 任务。
- 轮换提供方侧会话状态，重新初始化顾问，使
  仅追加模型上下文失效，并重置记忆提升，从而使下一轮
  根据基础系统提示词和当前项目指令重建。
- 保留会话 id、标题、cwd、模型、设置、活动计划路径和
  会话记录文件。
- 通过正常持久化管线追加 `reset_boundary`。对于
  已落盘的会话，它会持久保存；内存中或仍处于延迟创建状态的
  会话则在内存中保留该标记。折叠后的实时会话记录和
  重建的模型上下文从最新边界之后开始，而持久化 JSONL
  和完整会话记录导出会保留重置前的历史。
- 重置和系统提示词刷新成功后，等待向钩子/扩展发送的 `session_clear`
  通知完成，以便它们使依赖上下文的
  缓存失效。成功清空空上下文也会通知；忙碌/被拒绝的重置不会通知。
  此过程不会发出 `session_switch`，也不允许处理器取消清空。

清空成功后，TUI 清除其已渲染的会话记录。这不同于
`/fresh`，后者轮换提供方流状态但不清空
对话；也不同于创建新会话标识和会话记录文件的 `/new`；
以及在开始新会话前尝试删除旧持久化会话的
`/delete`。

## BTW 历史 \{#btw-history}

`/btw` 历史与会话产物一起存储，并保持在主
对话之外。有关键盘控制、后续追问、持久化和迁移安全，
请参阅 [BTW 命令参考](./slash-command-internals.md#11-built-in-command-note-btw)。

## 派生新会话 \{#fork}

不带参数的 `/fork` 根据当前会话创建新会话，并切换活动
会话标识。`/fork pane` 在新窗格中打开独立的 OMP 进程；
`/fork window` 和 `/fork tab` 在新的多路复用器分组（tmux
窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区）中打开它。子进程从当前
持久化的会话记录开始，而父会话保持活动并继续
运行。

输入 `/fork ` 会显示暗色内联文本 `[pane|window|tab]`，按 Enter 仍
执行不带参数的就地派生。输入前缀（`/fork w`）会打开建议，
并以暗色内联文本显示所选参数的剩余部分；Tab 接受该建议。

位置命令根据终端自动检测 tmux、Zellij、Herdr、CMUX 或 Orca；
`/fork auto` 不是子命令（有效参数是 `pane`、`window` 和
`tab`）。`window` 映射到 tmux 窗口、Zellij/Herdr/Orca 标签页或 CMUX 工作区。
普通终端、`screen` 和 `wmux` 无法承载此类派生位置操作，会收到
明确错误；在这些环境中请改用不带参数的 `/fork`。在没有
运行多路复用器的 Tern 窗格内，Tern 会打开派生会话：`/fork pane`（与该环境下不带参数的 `/fork`
一样）在当前窗格旁的新窗格中打开，`/fork window` 和 `/fork tab` 在
紧接当前标签页之后的新标签页中打开，并受该标签页的资源限制约束。如果 Tern 的
会话守护进程版本早于派生标签页功能，则会改为打开窗格，omp 会说明这一点。在
不带参数的 `/fork` 会回退为就地派生的情况下，位置命令会报告 Tern
未打开派生会话的原因。

### 前置条件和即时防护 \{#preconditions-and-immediate-guards}

- 智能体正在流式输出时，不带参数的 `/fork` 会被拒绝并给出警告。
- 流式输出期间按指定位置派生会在启动前询问。子进程可能省略
  未完成的响应，确认不会停止父进程的响应。
- vibe 模式活动期间禁止派生。
- 按指定位置派生要求会话记录已经持久化；子进程启动前会刷写
  待处理的写入。父进程绝不会切换
  会话。
- CLI `--api-key` 覆盖值无法安全地通过多路复用器命令传递；
  按指定位置派生会拒绝此操作，而不是暴露密钥。
- 仅原始的不带参数 `/fork` 流程会清除 UI 状态/加载
  指示器。

### 终端位置流程 \{#terminal-placement-flow}

对于位置命令，控制器根据当前 CLI 入口点和
可安全用于重启的启动标志重建子进程 CLI 命令（会丢弃诸如
`--goal` 和位置提示词这样的一次性选择项）。它将过期的启动
模型、思考、配置档案、提示词缓存键和工作目录标志替换为
活动会话值；子进程固定使用父进程的提示词缓存键，以便
读取父进程填充的缓存。子进程还接收有效的
智能体/配置目录、解析后的配置覆盖层（在 `/move` 后保留其
原始路径），以及父进程的会话目录和 XDG 基础
目录；父进程未设置的范围变量会被取消设置，而不是
导出为空值。它以 `--fork` 和当前会话记录的绝对路径启动。
通用终端启动器处理特定提供方的执行，并在 TUI 中报告
能力限制或启动失败。CMUX 和 Orca 启动要求
明确确认目标所配置的交互式 shell
接受 POSIX 语法；绝不会根据本地操作系统或 `SHELL` 推断。
拒绝确认会在刷写会话或启动终端之前
停止。`window` 和 `tab` 都映射到多路复用器分组位置。Orca
CLI 按 Orca 文档规定的顺序解析（`ORCA_CLI_COMMAND`，然后是
Orca 开发检出目录中的 `orca-dev`，然后是在 Orca 终端之外的 Linux 上的
`orca-ide`，最后是 `orca`）。

Orca 的 CLI `--command` 接受 shell 文本，而不是 argv，且没有 `--cwd`；
确认后，OMP 使用共享的 POSIX shell 引号处理提供
`cd <quoted-cwd> && <quoted-command>`。当 Orca 无法显示新标签页，改为在
后台终端中启动子进程时，`/fork` 会将其报告为警告，而不是
可见标签页。

### 会话级流程 \{#session-level-flow}

原始的不带参数 `/fork` 使用 `AgentSession.fork()`：

1. 发出带有 `reason: "fork"` 的 `session_before_switch`（可取消）。
2. 刷写待处理的 bash/会话写入，并排空/分离顾问记录器。
3. 调用 `SessionManager.fork()`，保留对话及其用量归属。
4. 将产物目录从旧会话命名空间复制到新命名空间（尽力执行；非 ENOENT 复制失败会记入日志，不致命）。
5. 更新 `agent.sessionId`，并继承先前的提供方提示词缓存键，除非已固定显式提示词缓存键。
6. 发出带有 `reason: "fork"` 的 `session_switch`。

`SessionManager.fork()` 行为：

- 要求持久化模式和已分配的会话文件路径；来源不必已经落盘。
- 创建新的会话 id 和新的 JSONL 文件路径。
- 重写头部，包含：
   - 新的 `id`
   - 新的时间戳
   - `cwd` 不变
   - `parentSession` 设置为先前的会话 id
   - `providerPromptCacheKey` 设置为先前头部的继承键，未固定键时则设为先前的会话 id
- 在新文件中保持所有非头部条目不变。

### 非持久化行为 \{#non-persistent-behavior}

- 内存中的会话管理器的 `fork()` 返回 `undefined`。
- `AgentSession.fork()` 返回 `false`。
- UI 报告 `Fork failed (session not persisted or cancelled)`。

### 在某条目处派生（`AgentSession.fork(entryId)`、RPC `fork`） \{#fork-at-an-entry-agentsessionforkentryid-rpc-fork}

`AgentSession.fork(entryId)` 从会话记录中的某一点派生，而不是从整个会话派生。RPC `fork` 命令在给定 `entryId` 时调用它，否则调用普通的 `fork()`。

- 与整会话派生一样，vibe 模式活动期间会拒绝此操作。
- `entryId` 必须是 `message` 条目（用户、助手或任何其他消息角色）；其他类型都会抛出 `Invalid entry ID for forking`。
- 当 `AgentSession.isBusyForSnapshot` 为真时（响应正在流式输出，或用户 bash/eval、上下文压缩、交接或重试工作正在运行），会抛出 `SessionBusyError`。检查会在 `session_before_branch` 之前、之后，以及待处理 bash 输出和会话写入刷写完成后再各执行一次。最后一次检查发生在丢弃旧会话的任何内容（待处理的下一轮消息、异步任务、自动学习捕获）之前，因此被拒绝的派生会保持会话原状。在余下排空等待期间获准进入的提示词，会像 `branch()` 一样在截断点通过提升提示词代次而丢弃。`/btw` 分支使用相同的判定条件。
- 当 `entryId` 位于助手工具调用批次内时（助手消息或回答它的工具结果），截断点会扩展到覆盖该批次已记录的工具结果，从 `entryId` 沿树前进，并跨过结果之间孤立的非消息条目。因此，派生会话绝不会以来源会话中已有结果的工具调用结束；从未获得结果的调用则保持原样。
- 此过渡与 `AgentSession.branch()` 使用的过渡相同，但在解析后的条目处截断，而不是在它之前截断：先发出原因是 `"fork"` 的 `session_before_branch`（可取消；`entryId` 是最后保留的条目，而不是像 `branch()` 那样是被丢弃的条目），再调用 `SessionManager.createBranchedSession(leafId, { copyArtifacts: true })`，重建智能体消息，然后发出原因是 `"fork"` 的 `session_branch`。
- 新文件保留从根到该条目的路径，包含解析后的条目，携带保留条目的标签，保留标题，并将 `parentSession` 设置为先前的会话文件。整个产物目录会在后台复制（包括仅被丢弃条目引用的产物），且新会话的产物管理器在分配 id 或解析溢出内容前会等待复制完成，因此保留的 `local://N.log` 引用仍可解析，新溢出内容则会获得新的 id。与整会话派生不同，不会继承提供方提示词缓存键（与 `branch()` 相同）。
- 与整会话派生不同，它在非持久化模式下也能工作（在内存中替换）。
- `AgentSession.fork(undefined, { requireIdle: true })` 对整会话派生应用相同的空闲规则（在 `session_before_switch` 之前，以及各次刷写后再次检查）。RPC `fork` 为两种变体都传入此选项，因此两者都会以 `code: "session_busy"` 拒绝。交互式 `/fork` 不传此选项，因此它仍可将正在运行的 bash 命令带入新会话。

### CLI `--fork <id|path>` \{#cli---fork-idpath}

启动时的 `--fork` 在正常会话创建之前解析：

1. `--fork` 不能与 `--no-session` 一起使用。
2. 类似路径的值（`/`、`\` 或 `.jsonl`）会直接从给定路径派生。
3. 其他值通过 `resolveResumableSession(...)` 解析：先查本地会话，再在未强制指定 `sessionDir` 时进行全局搜索。匹配接受转为小写的会话 id 前缀、完整 JSONL 文件名前缀，以及剥除时间戳后的文件名 id 后缀。
4. 派生文件在当前 cwd/会话目录范围内创建，并成为启动时的活动会话管理器。默认递归复制来源产物。来源文件缺失会失败，而不是产生空派生会话。
   复制的活动分支上未解决的工具调用，会在子会话中配上一条
   结果未知的结果，而不是标记为从未执行。
   对于因长度而停止的情况，仅在没有
   执行开始标记时才保留从未执行的防护。如果来源在最后一条消息之后记录了
   进程退出，此处不会修复：子会话会警告有
   待处理调用，并通过正常的进程退出恢复为其配对。
   父会话记录保持不变。
5. 全上下文派生会自动根据来源头部的继承键初始化 `providerPromptCacheKey`，并回退到来源会话 id。启动时，如果存在显式的 `--model`、`--thinking`、`--system-prompt`、`--system-prompt-template`、`--append-system-prompt`、`--tools` 或 `--no-tools` 覆盖，或适用的范围模型覆盖，则会丢弃这种自动继承。

使用 `--prompt-cache-key <key>` 可以显式固定提供方提示词缓存标识，且独立于 OMP 会话 id 和 `--provider-session-id`。`--provider-session-id` 继续控制提供方会话/路由头部和粘性凭据选择；`--prompt-cache-key` 在受支持时控制 OpenAI Responses 的 `prompt_cache_key` 负载。

## 恢复和继续 \{#resume-and-continue}

## 交互式 `/resume [value]` \{#interactive-resume-value}

不带参数时：

1. 打开通过 `SessionManager.listForPicker(currentCwd, currentSessionDir)` 填充的会话选择器。置顶会话优先；未命名、无提示词的零轮次存根会被隐藏，除非已置顶。选择器始终以当前文件夹范围打开；空状态会提示使用 Tab 进入所有项目，而不是自动切换。
2. Tab 切换到所有项目范围，延迟加载并缓存 `SessionManager.listAllForPicker()`。
3. 选定后，`SelectorController.handleResumeSession(sessionPath, { followContinuation: true })` 首先沿 `findSessionContinuation` 找到包含最新轮次的副本（见 CLI `--resume <value>`），然后调用 `session.switchSession(<that path>)`。如果切换被拒绝，它会返回 `false`，且选择器停止，不应用新会话的 UI 状态。
4. 切换成功后，UI 清空/重建聊天和待办事项，然后报告 `Resumed session`（如果恢复的会话属于其他项目，则报告 `Resumed session in <dir>`，此时会通过 `applyCwdChange` 重新指向进程 cwd 和由 cwd 派生的缓存）。

带参数时：

- `/resume <id>` 按先本地、再全局回退的方式解析 id/文件名前缀，并打开 `resolveResumeTarget` 选出的副本，与 CLI 的 `--resume <id>` 打开的副本相同（见 CLI `--resume <value>`）；未知值会报告 `Session "<value>" not found`。
- `/resume @claude` 和 `/resume @codex` 打开外部会话选择器。选择一个会话会以新的 OMP 会话标识转换并持久化它，然后切换到该新会话。

## CLI `--resume` \{#cli---resume}

### `--resume`（不带值） \{#--resume-no-value}

- `main.ts` 对当前 cwd/sessionDir 使用 `SessionManager.listForPicker()`，并以当前文件夹范围打开选择器。如果此列表为空，会预加载 `SessionManager.listAllForPicker()`，以便用户主动使用 Tab 时立即切换；不会自动切换范围。仅当全局选择器列表也为空时才打印 `No sessions found`。
- 选定路径在会话创建之前通过 `SessionManager.open(selectedPath)` 打开；随后进程/项目范围切换到恢复会话的 cwd（`switchToResumedProject`），重新加载 cwd 范围内的设置和插件缓存，并重新解析范围模型。

### `--resume <value>` \{#--resume-value}

`createSessionManager()` 的解析顺序：

1. 如果值看起来像路径（`/`、`\` 或 `.jsonl`），则直接打开。不存在的路径会以 `Session "<path>" not found.` 失败，而不是在那里创建会话。
2. 否则，`resolveResumableSession(...)` 会搜索：
   - 当前范围（`SessionManager.list(cwd, sessionDir)`）
   - 仅在未显式提供 `sessionDir` 时搜索全局会话（`SessionManager.listAll()`）
3. 匹配接受不区分大小写的会话 id 前缀、完整 JSONL 文件名前缀，以及 `<timestamp>_<sessionId>.jsonl` 中时间戳之后的 id 后缀。
4. 没有匹配项时，解析器（`resolveResumeTarget`）会在相同范围内查找名称匹配但已无法读作会话的 `<timestamp>_<sessionId>.jsonl` 文件（列表会跳过它），并采用续接它的副本（见下文）。否则，解析以 `Session "<value>" not found.` 失败。

两种形式随后都会跟随会话的续接（`findSessionContinuation`，对于键则通过 `resolveResumeTarget`）：当其对话在同一目录下的另一文件中继续时（兄弟文件的头部在 `continuationOf` 中指向它），会改为打开包含最新轮次的副本，除非指定文件中有该副本所没有的轮次，并通过通知列出两个文件。如果某文件已不再保存其生成的 `<timestamp>_<sessionId>.jsonl` 名称所记录的会话，说明该会话对应的文件被替换了（冲突恢复会保持发现时的文件原状）；恢复时若存在续接所命名会话的副本，就会打开该副本。这适用于文件已无法解析的路径，也适用于仅匹配文件名的键（文件中保存的是另一个会话），或第 4 步中发现的未列出文件。若路径中的文件保存的是另一个会话，则打开该会话；没有生成式名称的文件不记录会话 id，绝不会被视为已替换。

id/文件名前缀匹配行为（本地或全局）：

- 如果匹配会话记录的目录已不存在，CLI 会询问 `Session's directory no longer exists (...). Move (re-root) it into the current directory? [Y/n]`。
   - 选择是（默认）时，`SessionManager.open()` 通过 `initialCwd` 锚定到缺失的来源 cwd，然后由 `manager.moveTo(cwd, sessionDir)` 重新定位现有会话，而不复制它。
   - 选择否时，取消启动。在非 TTY 模式下，启动会失败，并通过错误提示用户以交互方式运行。
   - 在 `--mode rpc`、`--mode rpc-ui` 和 `--mode acp` 下不会询问，因为协议拥有标准输入和标准输出：会话在其存储位置打开，以启动目录作为工作目录，与使用路径值的恢复一样。
   - 如果会话记录在启动检出目录所属仓库中一个已被移除的工作树内，则在所有模式下都会不经询问将它移动到启动目录。
- 如果记录的目录仍存在，则直接打开匹配的会话。启动稍后会将进程/项目范围改为恢复会话的 cwd，并重新加载 cwd 范围内的设置和插件缓存。不会隐式派生新会话。

使用路径值的恢复会直接打开，而不使用目录缺失时的移动
提示。如果记录的 cwd 缺失或被权限阻止，启动会保留
启动 cwd，不移动会话记录；cwd 切换/范围重设失败时，
还会打印回退警告。
相同的可进入性策略也适用于选择器选项。直接路径缺失时
以 `Session "<path>" not found.` 失败；现有的空文件或非空文件中格式错误的
头部会以安全拒绝方式失败，不修改文件，除非该文件对应的会话
被替换后在兄弟文件中继续（见上文）。

## CLI `--restore` \{#cli---restore}

`--restore [value]` 选择并打开会话的方式与 `--resume [value]`
完全相同，随后在交互式 TUI 启动后，继续执行该会话上次
进程结束时未完成的工作（`task/restore.ts`、`restoreSession`）。Tern 的
会话守护进程在崩溃后用它重新启动 omp 窗格：omp 会在其会话文件旁报告
`omp_restore=1`（OSC 1337 用户变量），表明它
理解此标志。`/restart` 重新启动时也会使用它。

如果子代理的轮次被进程拆卸截断，即使拆卸正常完成，
也视为停在轮次中途：其所有者关闭时会使用
`INTERRUPTED_TURN_ERROR` 中止运行，并将其 `session_exit` 记录为进程退出
（`postmortem.Reason.EXIT`），这既适用于任务执行器驱动的首次运行，也适用于
生命周期拆卸所释放的已复活智能体轮次。

1. **先处理子代理。** 会话下每个持久化子代理会话记录
   （`<session>/<AgentId>.jsonl`，包括嵌套记录），如果被进程留在
   轮次中途、没有被终止（没有墓碑标记），并且可通过冷复活重建
   （具有 `session_init` 契约，且不是隔离的），就会以
   子代理 id 作为其父代理的后台任务再运行一个受监控的轮次。生命周期复活器
   根据会话记录重建它，轮次按下文继续，父代理
   通过任务的普通 `async-result` 接收结果，因此等待该
   任务的父代理能够再次找到它。
2. **然后处理会话自身的轮次**（`AgentSession.restoreInterruptedTurn`）。如果轮次
   在没有 `session_exit` 记录的情况下被截断（崩溃、SIGKILL 或断电都
   不会留下此记录），首先按退出恢复处理已有退出记录轮次的方式结束它：
   未完成的工具调用获得“结果未知”的结果，并用一次轮次中断
   中止将其结束。然后像 `/retry` 一样重试该轮次：如果批次中每个
   调用都被截断，则重新运行；否则模型从
   会话记录停止处继续回答。

如果最后一轮已完成、失败或被用户中断，
或在它之后记录了正常退出（用户在轮次中断状态下退出），则不会继续
任何内容。`--restore` 仅用于交互式模式，不接受提示词，且不能
与 `--continue`、`--fork`、导入、`--goal` 或 `--no-session` 组合使用。
`/restart` 会像处理其他一次性选择项一样丢弃启动时的 `--restore`，并为
当前会话添加自己的该标志。

## CLI `--continue` \{#cli---continue}

`SessionManager.continueRecent(cwd, sessionDir)`：

1. 解析当前 cwd 的会话目录。
2. 读取终端范围的面包屑。如果处于 fresh 状态的面包屑所指向的延迟创建 JSONL 仍不存在，则重新开始，而不是重新打开较早的对话。显式 `newSession()` 边界已经有持久化头部。
3. 如果它指向嵌套的产物/子代理会话，解析会向上遍历至顶层交互式父会话（最多八层）。
4. 优先使用 cwd 匹配的面包屑；若显式提供了会话目录，还要求该面包屑位于该目录内。没有符合条件的面包屑时，发现过程选择包含可恢复内容的最新会话，跳过未命名、无提示词的零轮次存根。
5. 对于另一个已缺失的记录 cwd，自动重新定位还要求当前目录的设备/inode 与面包屑记录的目录标识匹配，且没有真正的当前项目会话应当优先。已删除/已卸载的路径、没有标识的旧式面包屑，或跨文件系统移动，都不足以作为移动历史的证据。
6. 当所选会话的对话在同一目录中的另一个文件里继续时（其头部在 `continuationOf` 中指定所选会话），改为选择该副本，并通过 `onSessionContinuation` 选项报告它（CLI 打印通知）；第 5 步重新定位的是该副本，而不是面包屑命名的文件。与 `--resume` 一样，如果面包屑指定的会话有其续接副本所没有的轮次，则保留它；按写入时间选择时，会在两个方向上选取包含最新轮次的链接副本。
7. 打开选定会话，或在没有候选项时创建新会话。

为保持兼容，当 UUID 是唯一的位置消息时，`--continue <full-UUID>` 会规范化为 `--resume <UUID>`。未显式提供会话标志/会话目录时，`autoResume` 设置会调用相同的 `continueRecent` 行为，并在找到先前会话记录时恢复会话的模型/思考状态。

如果隐式交互式自动恢复尝试完所有已保存的模型，而模型回退策略禁止替换，启动会关闭被跳过的会话，发出警告，并开始一个不带其历史或提供方缓存标识的新会话。它不会重试更早的会话记录，也不会放宽恢复策略。当设置了 `--max-time` 时，新会话保留本次启动原有的绝对截止时间；失败恢复所耗费的时间不会补回预算。在相同策略下，显式 `--continue`/`--resume`、运行时 `/resume` 和无界面/SDK 宿主仍以安全拒绝方式失败；显式模型覆盖仍是有意使用另一个模型恢复会话记录的方式。

此行为仅发生在启动时；没有交互式 `/continue` 斜杠命令。

## 重启 \{#restart}

交互式 `/restart` 执行正常拆卸，刷写事后清理和
stdout，然后重新启动 CLI。`restartArgv()` 保留启动配置
标志，但剥除原始提示词/`@file` 位置参数和一次性会话
选择项（`--session`、`--resume`、`--restore`、`--continue`、`--fork` 和
外部导入）。仅在会话确实存在于磁盘上时，它才添加 `--restore <session-file>`，
从而使拆卸过程中在轮次中途被截断的子代理在
新进程中继续（见 [CLI `--restore`](#cli---restore)）；内存中或
从未落盘的会话会重新开始。

POSIX 在可用时使用进程映像替换。Windows 或 exec 失败时
会回退为生成替代进程，并继承终端流。

## 会话切换实际如何变更运行时状态 \{#how-session-switching-actually-mutates-runtime-state}

`AgentSession.switchSession(sessionPath)` 执行恢复类操作使用的运行时过渡：

1. 发出带有 `reason: "resume"` 和 `targetSessionFile` 的 `session_before_switch`（可取消）。
2. 断开智能体事件订阅，中止进行中的工作，并运行可选的切换前协调器。
3. 刷写待处理的 bash/会话写入，并捕获回滚状态：会话管理器状态；智能体消息和所有队列；模型/思考/服务层级；工具和提示词；提供方/缓存 id；记忆提升；以及检查点回退状态。
4. 清空智能体队列和下一轮队列。对于不同的文件，排空/分离顾问记录器。
5. `sessionManager.setSessionFile(sessionPath)`，更新提供方缓存/会话 id 和记忆键，构建显示上下文，解析已记录的模型，并重新载入检查点状态。如果不同文件中记录的模型均无法恢复，切换会在此以 `Could not restore model <provider/id>` 失败（见下文）。
6. 发出带有 `reason: "resume"` 的 `session_switch`。
7. 替换智能体消息，重置顾问状态，并同步待办事项。对于不同文件，或重放消息已改变的同文件重新加载，关闭缓存的提供方会话。
8. 应用解析出的（或显式请求的）模型。如果加载的分支以中断的轮次结束，则追加其合成中止消息，并重建上下文。
9. 恢复配置的/有效的思考设置和各模型家族的服务层级，目标分支没有对应条目时回退到当前设置。
10.   对于不同的会话记录，重置记忆上下文；对于任何对话重写，清空会话范围内的工具状态。
11.   重新连接智能体事件，运行可选的会话切换协调器（交互模式用它重新进入 plan 等持久化模式），并尽力刷新工作区根目录系统提示词块。协调器/提示词刷新错误会被记入日志，而不是回滚已提交的切换。
12.   恢复目标顾问费用状态，完成 bash 过渡，在会话 id 改变时通知会话变更回调，并返回 `true`。
      当切换前钩子取消，或 cwd 策略拒绝过渡时，`switchSession()` 返回 `false`。没有 cwd 变更回调的跨项目切换会被拒绝，而不是静默采用目标 cwd；回调拒绝也视为取消。交互式选择器会检查此结果，并保持现有会话/UI 不变。

如果受保护过渡中会抛出异常的步骤失败，`switchSession()` 会恢复捕获的会话、智能体队列/消息、工具/提示词、模型/思考/服务层级、提供方/缓存、记忆和检查点状态；它会重新连接先前的智能体订阅，并在重新抛出前再次运行模式协调。

正常的恢复切换会打开现有会话记录。由于它委托给
`setSessionFile()`，缺失/空的显式目标可能改为在
该路径落盘一个新会话；格式错误的非空头部会被拒绝。

模型恢复像启动时恢复一样以安全拒绝方式失败：切换绝不会静默地将会话记录移到其中未记录的模型上。只有使用 `hasUI` 和 `allowSessionModelFallback` 创建的会话（TUI），在开启 `retry.modelFallback` 时才会改为保留当前模型，并警告 `Could not restore model <provider/id>. Using <provider/id>`。显式 `model` 选项（RPC `open_session`/`switch_session` 搭配 `provider`/`modelId`）会替换已记录的模型，同文件重新加载则保留当前模型。

## 事件发出和取消点 \{#event-emissions-and-cancellation-points}

### 切换/派生生命周期钩子 \{#switchfork-lifecycle-hooks}

对于 `newSession`、`fork` 和 `switchSession`：

- 前置事件：`session_before_switch`
   - 原因：`new`、`fork`、`resume`
   - 可通过返回 `{ cancel: true }` 取消
- 后置事件：`session_switch`
   - 原因集合相同
   - 包含 `previousSessionFile`

`ExtensionRunner.emit()` 在第一个取消操作的前置事件结果出现时提前返回。
切换前钩子取消时，`switchSession()` 返回 `false`，且不会发出切换后事件。

### 自定义工具 `onSession` 行为 \{#custom-tool-onsession-behavior}

SDK 将扩展会话事件桥接到自定义工具的 `onSession` 回调：

- `session_switch` -> `onSession({ reason: "switch", previousSessionFile })`
- `session_branch` -> `reason: "branch"`
- `session_start` -> `reason: "start"`
- `session_tree` -> `reason: "tree"`
- `session_shutdown` -> `reason: "shutdown"`

这些回调仅用于观察；不会取消切换/派生。

### 与本文相关的其他取消入口 \{#other-cancellation-surfaces-relevant-to-this-doc}

- 流式输出期间 `/fork` 被阻止（用户必须先等待当前响应结束或将其中止）。
- 用户可以通过关闭选择器来取消 `/resume` 选择器。
- 可以通过拒绝目录缺失时的移动/重新定位提示，取消跨项目 `--resume <id>`。
- `/share` 有 UI 中止路径（`Share cancelled`）；上传本身不会在传输中途被终止。

## 非持久化（内存中）会话行为 \{#non-persistent-in-memory-session-behavior}

当会话管理器使用 `SessionManager.inMemory()`（`--no-session`）创建时：

- 不存在会话文件路径。
- `/export` 以 `Cannot export in-memory session to HTML` 失败（传播到命令错误 UI）。`/share` 仍然有效：快照根据实时条目构建。
- `/fork` 失败，因为 `SessionManager.fork()` 要求持久化。
- `/dump` 仍然有效，因为它序列化内存中的智能体状态。
- 原生 CLI `--resume`、`--continue` 和 `--fork` 不能与 `--no-session` 一起使用；初步启动解析可能会分配内存中的管理器，但验证会在正常执行前拒绝这些组合。

## 已知实现注意事项（以当前代码为准） \{#known-implementation-caveats-as-of-current-code}

- `/share` 的自定义分享失败不会降级到默认加密分享流程；它们会以错误终止 TUI 命令。
- `/export` 的参数分词不保留带空格的引号包裹路径。
- `/delete` 将删除视为尽力操作：它尝试删除当前
  会话 JSONL 和产物目录，记录任何删除失败，并且仍然
  创建并切换到新会话。失败或部分完成的删除可能会将
  旧会话或其产物留在磁盘上，因此 `/delete` 并不保证
  擦除边界。
