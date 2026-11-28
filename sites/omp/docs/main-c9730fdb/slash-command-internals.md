---
title: "斜杠命令内部机制"
description: "Oh My Pi 官方仓库文档：斜杠命令内部机制。"
---

# 斜杠命令内部机制 \{#slash-command-internals}

本文介绍 `coding-agent` 如何发现斜杠命令、去重、在交互模式中呈现，以及在提交提示词时展开。

## 实现文件 \{#implementation-files}

- [`src/extensibility/slash-commands.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/slash-commands.ts)
- [`src/capability/slash-command.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/slash-command.ts)
- [`src/discovery/builtin.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/builtin.ts)
- [`src/discovery/omp-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/omp-plugins.ts)
- [`src/discovery/claude.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/claude.ts)
- [`src/discovery/claude-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/claude-plugins.ts)
- [`src/discovery/agents.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/agents.ts)
- [`src/discovery/opencode.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/opencode.ts)
- [`src/capability/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/index.ts)
- [`src/discovery/helpers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/helpers.ts)
- [`src/discovery/omp-extension-roots.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/omp-extension-roots.ts)
- [`src/utils/command-args.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/utils/command-args.ts)
- [`src/slash-commands/builtin-registry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-registry.ts)
- [`src/slash-commands/acp-builtins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/acp-builtins.ts)
- [`src/slash-commands/available-commands.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/available-commands.ts)
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`src/modes/interactive-mode.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/interactive-mode.ts)
- [`src/modes/controllers/input-controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/controllers/input-controller.ts)
- [`src/modes/utils/ui-helpers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/modes/utils/ui-helpers.ts)

## 1) 发现模型 \{#1-discovery-model}

斜杠命令是一项能力（`id: "slash-commands"`），以命令名称为键（`key: cmd => cmd.name`）。

能力注册表并行加载已启用的提供方，按提供方优先级从高到低使用其结果，并按键以**先到者优先**的语义去重。`disabledProviders` 移除整个提供方；`disabledExtensions` 中的 `slash-command:<name>` 等条目会在正常加载时排除单个命令。

### 提供方优先级 \{#provider-precedence}

当前斜杠命令提供方及其优先级：

1. `native`（OMP）：优先级 `100`
2. `omp-plugins`（扩展包）：优先级 `90`
3. `claude`：优先级 `80`
4. `claude-plugins`：优先级 `70`
5. `agents`（`.agent`/`.agents` 标准目录）：优先级 `70`
6. `opencode`：优先级 `55`

同优先级行为：优先级相同的提供方保持注册顺序。当前导入顺序先注册 `claude-plugins`，再注册 `agents`，因此名称冲突时插件命令胜出。

Claude 和 OpenCode 命令只从项目加载；从不读取其主目录中的命令。

### 名称冲突行为 \{#name-collision-behavior}

对于 `slash-commands`，冲突严格由能力去重机制解决：

- 优先级最高的条目保留在 `result.items` 中
- 优先级较低的重复项仅保留在 `result.all` 中，并标记为 `_shadowed = true`

这既适用于不同提供方之间，也适用于同一提供方返回重复名称的情况。

扩展注册的处理器命令使用另一条规则：最后加载并注册某个名称的扩展胜出，命令列表和处理器查找都是如此。这不是能力去重。

内置命令不属于这个文件能力中的条目。它们位于统一的内置命令注册表中，在 TUI 和 ACP/RPC 模式中，先于会话级扩展/自定义/文件展开进行分派。自动补全/ACP 可用命令也会优先保留内置名称和别名。

### 文件扫描行为 \{#file-scanning-behavior}

提供方大多使用 `loadFilesFromDir(...)`，它目前：

- 默认采用非递归匹配（`*.md`）
- 使用原生 glob，参数为 `gitignore: true`、`hidden: false`、`fileType: File`
- 并行读取匹配文件，并将其转换为 `SlashCommand` 条目

因此，不会加载隐藏文件/目录，会跳过被忽略的路径；除非提供方加入自己的排序，否则文件顺序遵循原生 glob 的结果顺序。

## 2) 各提供方的来源路径和本地优先级 \{#2-provider-specific-source-paths-and-local-precedence}

## `native` 提供方（`builtin.ts`） \{#native-provider-builtints}

搜索根目录来自 `.omp` 目录：

- 项目：`<cwd>/.omp/commands/*.md`
- 用户：活动配置档案的智能体目录中的 `commands/*.md`（默认配置档案为 `~/.omp/agent/commands/*.md`；具名配置档案为 `~/.omp/profiles/<name>/agent/commands/*.md`）

`getConfigDirs()` 先返回项目，再返回用户，因此名称冲突时，**项目原生命令优先于用户原生命令**。
上述默认路径可以通过 `PI_CONFIG_DIR`、默认配置档案的 `PI_CODING_AGENT_DIR` 或 SDK 发现参数 `agentDir` 迁移；项目目录仍为 `.omp`。

## `omp-plugins` 提供方（`omp-plugins.ts`） \{#omp-plugins-provider-omp-pluginsts}

依次扫描显式扩展包目录、有效的 `extensions` 设置以及已启用的 npm/link 插件中的 `commands/*.md`。配置数组遵循设置替换优先级；项目数组和用户数组不会拼接。重新加载时复用会话提供的有效根目录。仅显式发现模式会排除配置和已安装的根目录，文件入口点不提供子目录资源。此处排除市场根目录以避免重复发现，它们由 `claude-plugins` 处理。

## `claude` 提供方（`claude.ts`） \{#claude-provider-claudets}

由 `commands.enableClaudeProject` 控制（默认 `true`）。加载 `<cwd>/.claude/commands/**/*.md`（递归）。

子目录中的命令还会获得带命名空间的别名：`foo/bar.md` 同时注册为 `bar` 和 `foo:bar`（`addClaudeCommandNamespaceAliases`）。

## `opencode` 提供方（`opencode.ts`） \{#opencode-provider-opencodets}

由 `commands.enableOpencodeProject` 控制（默认 `true`）。加载 `<cwd>/.opencode/commands/*.md`。解析 OpenCode 命令内容时会剥离 frontmatter，命令名称可以通过 frontmatter 的 `name` 覆盖，否则使用文件名。

## `claude-plugins` 提供方（`claude-plugins.ts`） \{#claude-plugins-provider-claude-pluginsts}

通过 `listClaudePluginRoots(...)` 加载根目录，该函数读取活动 OMP 插件目录中的 `installed_plugins.json`（支持配置档案/XDG）以及最近的项目 `.omp/plugins/installed_plugins.json`。已禁用的注册表条目会被排除。

对于每个根目录，通常扫描 `<pluginRoot>/commands/*.md`。清单中的 `commands`/`slash-commands` 条目也可以改为选择目录或单独的 Markdown 文件；第一个有内容的键生效。存在插件名称时，命令名称会添加插件名称前缀：`<plugin>:<command>`。

这些来源的根目录按优先级合并，而不是排序：先是 `--plugin-dir` 注入的根目录，然后是项目级条目（它们会遮蔽相同插件 id 的用户条目），最后是用户条目。在各个注册表内，保留 JSON 数据中每个插件的条目顺序，不额外排序。

## `agents` 提供方（`agents.ts`） \{#agents-provider-agentsts}

从 cwd 向上直到仓库根目录（没有仓库时直到主目录），扫描各级 `.agent/` 和 `.agents/` 下的非递归 `commands/*.md`，然后扫描 `~/.agent/commands` 和 `~/.agents/commands`。不会再次将主目录作为项目根目录扫描。在 WSL 下，如果能发现 Windows 宿主主目录候选位置，会将其追加进去。在此提供方内，最近的项目根目录排在前面；`.agent` 先于 `.agents`；项目条目先于用户条目。

## 3) 物化为运行时 `FileSlashCommand` \{#3-materialization-to-runtime-fileslashcommand}

`src/extensibility/slash-commands.ts` 中的 `loadSlashCommands()` 将能力条目转换为提交提示词时使用的 `FileSlashCommand` 对象。

对于每个命令：

1. 解析 frontmatter/正文（`parseFrontmatter`）
2. 描述来源：
   - 如果存在，使用 `frontmatter.description`
   - 否则使用正文中第一个非空行（最多 60 个字符，带 `...`）
3. 将解析后的正文保留为可执行模板内容
4. 计算显示来源字符串，例如 `via Claude Code Project`
5. 保留发现阶段的 `argumentHint`，或解析 frontmatter 中的 `argumentHint`/`argument-hint`，用于自动补全的幽灵文本和 ACP 输入提示
6. 当 frontmatter 含有布尔值 `side: true` 时设置 `side`（带引号的 `"true"` 不算）

OpenCode 提供方在这一阶段之前剥离 frontmatter。发现的参数提示和 `side` 标志会保留，但运行时描述目前会回退到正文，而不使用单独发现的描述。

frontmatter 解析的严重程度取决于级别：

- 发现的用户/项目命令使用警告级解析，并回退到键/值解析
- 显式标记为 `native` 的能力条目会使用致命错误级解析
- 捆绑的后备模板使用致命错误级解析

### 捆绑的后备命令 \{#bundled-fallback-commands}

在文件系统/提供方命令之后，如果尚不存在同名命令，则追加嵌入式命令模板（`EMBEDDED_COMMAND_TEMPLATES`）。

当前嵌入集合是来自 `src/task/commands.ts` 的 `/init`，用作后备（`source: "bundled"`）。

## 4) 交互模式：命令列表的来源 \{#4-interactive-mode-where-command-lists-come-from}

交互模式结合多个命令来源，用于自动补全和命令路由。

在构造时，它根据以下来源构建待用命令列表：

- 内置命令（`buildTuiBuiltinSlashCommands(...)`，从 `BUILTIN_SLASH_COMMAND_DEFS` 物化，带实时参数补全和行内提示）
- 扩展注册的斜杠命令（`extensionRunner.getRegisteredCommands(...)`）
- TypeScript 自定义命令（`session.customCommands`），映射为斜杠命令标签
- 启用 `skills.enableSkillCommands` 时，可选的技能命令（`/skill:<name>`）

然后，`init()` 调用 `refreshSlashCommandState(...)`，在可用时复用会话启动时发现的命令，以安装基础自动补全提供方（`createPromptActionAutocompleteProvider`），其中包含：

- 上述待用命令
- 发现的基于文件的命令
- 发现的提示词模板命令，且名称尚未被内置/钩子/自定义/技能/文件命令占用

`refreshSlashCommandState(...)` 还会更新 `session.setSlashCommands(...)`，使提示词展开使用同一组已发现的文件命令。
扩展注册的自动补全工厂按注册顺序包装此基础提供方；格式错误或抛出异常的工厂会被跳过。

### 刷新生命周期 \{#refresh-lifecycle}

斜杠命令状态会在以下情况下刷新：

- 交互初始化期间
- cwd 更改之后，包括 `/move`（`applyCwdChange` 重新加载项目设置，清除插件根目录缓存，并刷新会话技能/命令）
- 编辑器组件被替换时
- 通过 `/reload-plugins` 等显式插件重新加载流程
- 收到会话命令元数据通知时，包括实时设置更改、技能管理和 MCP 提示词更新（自动补全会根据当前会话状态重建）
- `/wt` 运行新工作树的 `post-checkout` 钩子之后（链接的 git 工作树或 ovnfs 检出）：移动和 `worktree.cleanSource` 完成并报告后，`/wt` 使用 `git worktree add` 提供给钩子的参数运行钩子（`vcs.runPostCheckoutHook`，即 `omp worktree add` 背后的辅助方法），然后刷新会话技能/命令，使其包含钩子新增的内容。钩子失败会保留工作树并显示警告；钩子不可取消。ovnfs 检出有自己的 git 目录，其中没有 `hooks/`：在那里只运行通过 `core.hooksPath` 找到的钩子，不运行源仓库 `.git/hooks` 中的钩子

命令目录没有持续运行的文件监视器。

### 其他呈现位置 \{#other-surfacing}

扩展仪表板也会加载 `slash-commands` 能力，并显示活动/被遮蔽的命令条目，包括 `_shadowed` 重复项。

## 5) 路由及其在提示词流水线中的位置 \{#5-routing-and-prompt-pipeline-placement}

在 TUI 和 ACP/RPC 模式中，先检查统一的内置命令注册表，再调用 `AgentSession.prompt(...)`。内置命令可以消费输入，或返回剩余的提示词文本。仅用于 TUI 的内置命令不会出现在 ACP 可用命令和分派中；ACP 可见的内置命令是具有文本模式 `handle` 的条目。

内置命令解析在第一个空白字符或冒号处拆分，因此 `/model:opus` 是一次内置命令调用。扩展/自定义/文件解析则只在第一个字面空格处拆分，保留 `plugin:command` 这样的名称。在 TUI 中，如果内置命令的规范未声明 `allowArgs`，带参数的调用会继续向后处理；ACP 分派器将参数验证交给处理器。

越过这一边界后，当 `expandPromptTemplates !== false` 时，`AgentSession.prompt(...)` 按以下顺序处理斜杠输入：

1. **扩展命令**（`#tryExecuteExtensionCommand`）  
   如果 `/name` 匹配扩展注册的命令，则立即执行其处理器，提示词调用返回。
2. **TypeScript 自定义命令和 MCP 提示词命令**（`#tryExecuteCustomCommand`）
   匹配后可能返回：
   - 非空 `string` -> 将提示词文本替换为该字符串
   - 空字符串或 `void/undefined` -> 视为已处理；不向 LLM 提交提示词
3. **基于文件的斜杠命令**（`expandSlashCommand`）  
   如果文本仍以 `/` 开头，尝试展开 markdown 命令。
4. **提示词模板**（`expandPromptTemplate`）  
   在斜杠/自定义处理之后应用。
5. **交付**
   - 空闲时：立即将提示词发送给智能体
   - 流式输出时：按 `streamingBehavior`（`steer`、`followUp` 或 `aside`）将提示词排队

`runCommands: false` 跳过扩展/自定义处理器，但仍展开文件命令和提示词模板。`expandPromptTemplates: false` 绕过全部四个展开阶段。普通用户提示词随后会进行模型提及展开和魔法关键词匹配；合成提示词不会触发魔法通知。

这解释了为什么内置命令会在考虑文件命令之前保留名称、斜杠命令展开位于提示词模板展开之前，以及自定义命令为什么能在文件命令匹配之前通过转换移除开头的斜杠。

## 6) 基于文件的斜杠命令展开语义 \{#6-expansion-semantics-for-file-based-slash-commands}

`expandSlashCommand(text, fileCommands)` 的行为：

- 仅在文本以 `/` 开头时运行
- 在 `/` 后的第一个字面空格处拆分命令名称（制表符/换行符不分隔名称）
- 通过 `parseCommandArgs` 从剩余文本解析参数
- 在已加载的 `fileCommands` 中查找精确名称匹配
- 若匹配，则应用：
   - 位置替换：`$1`、`$2`、...
   - 切片替换：`$@[start]` / `$@[start:length]`，使用从 1 开始的位置
   - 聚合替换：`$ARGUMENTS` 和 `$@`
   - 通过 `prompt.render` 使用 `{ args, ARGUMENTS, arguments }` 渲染模板
   - 当模板未使用行内参数占位符时，采用行内参数后备追加

### `parseCommandArgs` 注意事项 \{#parsecommandargs-caveats}

解析器采用能够识别引号的简单拆分方式：

- 支持 `'single'` 和 `"double"` 引号以保留空格；引号在参数开头或选项的 `=` 之后出现时作为分隔符，匹配的引号结束参数（其后为空格、制表符或输入末尾）
- 剥离作为分隔符的引号；其他引号字符，例如 `user's` 或 `don't` 中的撇号，保持字面含义
- 不实现反斜杠转义规则
- 开头的引号如果没有匹配的闭引号，会按字面处理，不报错
- 在这种默认的非严格解析模式中，空的带引号参数会被丢弃

参数替换只遍历模板一次；参数值中的美元符号占位符不会再次替换。缺失的位置值、起始位置/长度为零的切片，以及起始位置越界的切片，都会渲染为空字符串。

### 旁支命令（`side: true`） \{#side-commands-side-true}

frontmatter 带有 `side: true` 的文件命令，在交互式 TUI 中作为 [`/btw`](#11-built-in-command-note-btw) 旁支问题运行。经过相同参数替换后展开的模板就是问题。有无参数时行为相同。问题和回答不会进入会话记录，命令在轮次流式输出期间运行而不对其进行引导，回答支持 `/btw` 历史、追问和创建分支。面板和历史会将键入的调用（`/sitrep`、`/sitrep the migration`）显示为话题标题，而模型接收的是展开后的模板。标题存储在记录 JSON 旁的 `entry-<id>.title` 文件中，使旧版本仍能读取记录。可将其用于有关会话的只读问题，例如状态报告或说明：

```markdown
---
description: Situation report for this session
argument-hint: "[focus]"
side: true
---

Situation report. Focus on $ARGUMENTS if given, else the whole session.
```

此路由适用于 Enter、Ctrl+Enter 和聚焦的子代理视图；聚焦视图回答的是有关当前查看的智能体的问题。同名的扩展命令、TypeScript 自定义命令或 `/skill:` 命令仍然优先。如果模板渲染失败，会显示错误，并将键入的命令放回编辑器。其他模式（RPC、ACP、打印）没有 `/btw` 界面，因此会将旁支命令展开为普通提示词。

## 7) 未知 `/...` 的行为 \{#7-unknown--behavior}

核心斜杠逻辑**不会拒绝**未知的斜杠输入。

如果没有内置、扩展、自定义或文件命令处理它，`expandSlashCommand` 会返回原始文本，字面的 `/...` 提示词会继续进行提示词模板展开并交付给 LLM。

TUI 和 ACP/RPC 会在 `session.prompt(...)` 之前分派共享内置命令注册表中的命令。仅用于 TUI 的内置命令不会在 ACP 中公布或处理，因此在 ACP 中，未被其他处理器接管的写法仍可能作为普通提示词文本继续向后处理。

## ACP/RPC 可用命令 \{#acprpc-availability}

`buildAvailableSlashCommands(...)` 按以下顺序以先到者优先的规则公布命令：支持文本的内置命令、可选的技能命令、扩展命令、TypeScript/MCP 自定义命令，最后是发现的文件命令。内置命令的主名称和别名会被保留；`model:foo` 等前缀会被解析为内置命令的扩展名称，会从 ACP 可用命令中筛除。同一次文件命令加载也会更新会话展开集合。

## 8) 流式输出期间与空闲时的差异 \{#8-streaming-time-differences-vs-idle}

## 空闲路径 \{#idle-path}

- `session.prompt("/x ...")` 运行命令流水线，然后立即执行命令或直接发送展开后的文本。

## 流式输出路径（`session.isStreaming === true`） \{#streaming-path-sessionisstreaming--true}

- `prompt(...)` 仍先运行扩展/自定义/文件/模板转换
- 然后要求提供 `streamingBehavior`：
   - `"steer"` -> 将中断消息排队（`agent.steer`）
   - `"followUp"` -> 将轮次后消息排队（`agent.followUp`）
   - `"aside"` -> 在下一个步骤边界注入，不中断正在执行的工具批次（正在运行且可中断的 `wait` 会结束）
- 如果省略 `streamingBehavior`，提示词调用会抛出错误

### 各命令重要的流式输出行为 \{#important-command-specific-streaming-behavior}

- 即使正在流式输出，扩展命令也会立即执行（不会作为文本排队）。
- `steer(...)`/`followUp(...)` 辅助方法拒绝扩展命令（`#throwIfExtensionCommand`），以免将必须同步运行的处理器的命令文本排队。
- 这些辅助方法会展开提示词模板，但不运行自定义处理器，也不展开文件命令。需要完整命令流水线时，应使用 `prompt(..., { streamingBehavior })`。
- 上下文压缩队列重放使用 `isKnownSlashCommand(...)` 判断排队条目是通过 `session.prompt(...)` 重放（对于已知斜杠命令），还是通过原始引导/后续消息方法重放。

## 9) 错误处理和失败呈现 \{#9-error-handling-and-failure-surfaces}

- 提供方加载失败彼此隔离；注册表收集警告并继续处理其他提供方。
- 无效的斜杠命令条目（缺少名称/路径/内容或级别无效）会被能力验证丢弃。
- frontmatter 解析失败：
   - 显式标记为 `level: "native"` 的条目和捆绑模板：致命解析错误向上抛出
   - 发现的用户/项目命令（包括原生 OMP 提供方）：警告 + 后备键/值解析
- 扩展/自定义命令处理器的异常会被捕获，通过扩展错误通道报告（没有扩展运行器的自定义命令则回退到日志记录器），并视为已处理（不发生意外的后备执行）。

## 10) 内置命令说明：`/pause` \{#10-built-in-command-note-pause}

`/pause`（仅宿主交互式会话）将智能体暂停在安全边界；正在执行的调用会完成。界面统计正在收尾的轮次和运行中的作业；已停驻或已完成的轮次不再计数。当两个计数都归零时，隐藏这些行并发出就绪信号。

中断键（默认 Esc）、Enter、Space 或 Ctrl+C 都可恢复；Ctrl+C 不会中止智能体。

## 11) 内置命令说明：`/btw` \{#11-built-in-command-note-btw}

`/btw <question>` 针对当前查看的会话记录提出独立的旁支问题：
聚焦某个子代理时使用该子代理的会话，否则使用主
会话。它使用该会话的活动模型和上下文，包括部分
流式输出的助手文本。不带参数的 `/btw` 打开该视图的历史，并选中最新
问题。

在交互式输入框中，以一个 `?` 开头并紧跟问题文本是
`/btw <question>` 的快捷写法。单独的 `?` 或以连续
问号（`??`）开头的草稿会作为普通提示词提交。

保存的旁支问题不会追加到主会话记录，也不会作为历史发送
给无关轮次。每个新的 `/btw <question>` 都保持独立；显式
追问只包含所选旁支对话以及当前
查看会话的上下文。

之前的问题和回答会作为独立的 `user` 和 `assistant`
消息重放，然后跟上新的用户问题，而不是嵌入一个提示词中。
原始问题模板在追问期间保持相同的位置。
历史在异步转换之前创建快照，并使用普通的
模型提供方规范化和密钥混淆流水线。

保留被查看会话的提示词缓存键和静态系统/工具前缀。每个 BTW
话题都有自己稳定的模型提供方侧对话标识，与
所属会话的对话及其他话题分离。成功的串行追问会复用该标识；
在轮次取消、失败或中断之后，下次请求使用新的
传输代次，因此正在退出的请求无法共享其状态。
没有对话键的独立临时调用方保留逐请求 ID。
实际缓存命中取决于模型提供方。被查看会话的上下文仍是
当前的，而非冻结在第一个问题时；推进会话或压缩其上下文都可能改变
前缀。
保存的 BTW 记录包含可见的回答文本，不包含不透明的模型提供方推理或
重放签名，因此恢复会保留对话角色和文本，而非
逐字节还原模型提供方原生会话记录。

- 行内 BTW 运行时，`Esc` 取消请求，并让部分
  回答保持可见，标记为 `Cancelled`。再次按 `Esc` 关闭面板。
- 在历史中，`Esc` 取消选中且正在运行的话题，而不关闭历史；
  否则关闭历史。如果其他话题仍在运行，会恢复其行内
  面板，避免其隐藏在后台。
- 已完成、已取消和失败的面板可用 `Esc` 关闭；其历史仍会
  保存。没有隐藏并继续运行的操作，也没有独立的 `x` 取消键。
- `c` 复制已完成的行内回答，或所选话题最新的非空回答。
- 开启 `btw.inject`（`/settings` → 交互 → “/btw 引导注入”）后，如果旁支
  问题要求为主会话提供引导、纠正或指令提示词，
  回答会在单个 `<inject>…</inject>` 区块中提供该提示词（提示词会给出确切格式）。
  回答将此区块与正文分开显示，旁边有 `btw.rail`（`▎`，待发送时为粉色），
  下方一行显示“注入主会话”；Tern 自行换行，因此
  区块显示为浅色卡片。`app.btw.inject`（默认 `Alt+I`；参见
  [快捷键](./keybindings.md)）将显示的文本（去除首尾空白、剥离控制序列、
  展开制表符）作为用户消息发送至主会话：主
  智能体正在运行时作为引导，否则作为新轮次。它从不作为斜杠命令运行，也不展开为
  提示词模板；`^model` 提及和魔法关键词与手动输入时一样生效。
- 主会话接纳消息后才算发送成功；发送会使竖线变绿，在每行
  预留列填入发送箭头（`nav.selected`，默认为 `➤`），并将
  下方行标签改为“已注入主会话”，不移动行或文本
  列。如果会话在分派之前丢弃它（Esc 竞态、用量预检拒绝、
  费用上限），或在它进入会话记录之前拒绝它（没有模型或 API 密钥），
  区块会返回待发送状态，并显示原因或“未发送”状态，此时该按键是
  重试的唯一方式：文本不会同时进入编辑器。消息
  进入会话记录或引导队列后发生的失败会保留区块的已发送状态；当引导仍
  在队列中等待时按 Esc，会像其他排队消息一样将其交回编辑器。发送正在
  进行或正在创建分支、移动会话时，该按键不起作用。
- 只有回答正在流式输出或标签已闭合时，区块才会独立呈现：已完成回答中未闭合的
  区块保持为纯文本。区块取最后一个有闭合标签的起始标签，
  与其后第一个闭合标签配对。只有本次运行中
  在开启 `btw.inject` 时提问所得的回答可以发送，每个一次：历史中，最新
  轮次的区块显示为待发送，已发送的轮次保留标记，来自较早轮次或
  较早运行的区块显示为纯文本。关于聚焦子代理的旁支回答，以及协作访客，都
  不会获得该指令或区块。
- 行内 BTW 回答完成后，`f` 直接打开该话题的追问输入框，
  不需要先输入 `/btw`。主编辑器必须为空且处于聚焦状态。
- 在历史中，`f` 或 `Enter` 为所选话题打开原生追问输入框。
  在输入框内，`Enter` 发送非空问题，`Esc` 取消草稿
  并返回历史；`f`、`c` 和 `x` 都是普通文本。
  在已提交追问的启动写入仍待完成时，Escape 也会取消它，
  不会启动模型请求。如果初始检查点已经在进行，
  则会先将该轮次保存为已取消，然后才允许开始另一次追问。
- 追问追加到同一话题中，保留之前的回答和已取消的部分
  输出，并在恢复后保留。原始问题保持为历史列表标题；
  `Details` 按时间顺序显示每个问题和回答。
- 在历史中，`Up`/`Down` 选择话题；`Tab` 在历史和
  详情之间切换。`Right` 聚焦详情，`Left` 返回历史。
- 聚焦的详情支持滚动、`Page Up`/`Page Down` 和 `Home`/`End`。
  狭窄终端一次显示一个窗格。
- 在 Tern 中，回答是会话记录中的一条注记，位于提问时屏幕上内容的
  后面，而不是行内面板；它仅供显示，从不成为会话消息。点击
  注记会让输入框指向它（角色为 `omp.editor.btw`，带 `btw` 标签，注记带边框）：
  普通草稿作为追问发送给它所属的话题，回答显示在同一条注记中，而 `/`
  命令和 `!`/`$` shell 草稿照常运行。`Esc`、标签或再次点击
  注记会让输入框返回聊天，不取消正在运行的回答。其 `×`
  将其折叠为一行，点击会再次展开，并让输入框指向它。右键点击（手机上
  长按）可选择复制、注入、创建分支、停止、在历史中打开和
  折叠。会话记录重建或恢复后，当前显示分支上提出的问题注记会以折叠状态恢复，
  各自位于第一条时间晚于它的消息之前。
- 任何 BTW 请求正在运行时，都会拒绝新问题和追问。
  不会隐式取消，也不会排队。
- 追问提交被拒绝时，会保留草稿供重试；
  提交待完成期间反复按 Enter 不会产生重复请求。

历史以每话题私有文件的形式保存在会话产物
目录的 `btw-history/` 子目录中。聚焦子代理的历史使用
共享产物目录中的 `btw-history/sessions/<session-id>/`，
与主会话及兄弟子代理隔离。这些内容与会话一起
保留在本地。即使会话仅包含
旁支问题，也会使其可恢复。`--no-session` 仅将历史保存在内存中。
普通会话记录导出/共享不包含这些附属记录。

每个话题使用操作系统支持的跨进程租约，并在
原子替换之前检查修订版本。运行中的轮次会持有租约直到终止检查点；
其他进程无法覆盖活跃所有者或陈旧话题快照。
发生冲突的追问会在任何模型请求之前被拒绝，重新打开或
重试时会读取最新保存的历史。被拒绝的写入不会替换
已提交的内存视图。
根问题和追问时间戳必须非负，且处于 JavaScript 支持的
Date 范围内（最多 `8.64e15` 毫秒）；无效记录会在
渲染历史之前被拒绝。

在选择并验证目标位置之前，迁移不会造成破坏。
BTW 请求正在启动或运行时，`/move`、`/wt` 和独立的持久化 `!cd` 会拒绝迁移，
要求操作者显式完成或取消请求。
对于 `/move`，会在确认或创建缺失的
目标目录之前获取同一门控，并在整个迁移过程中持有。因此，请求忙碌或
检查点未保存时，既不会留下新目录，也不会移动会话。
`/wt` 会在创建分支或检出之前获取门控，并在
会话迁移和配置的源清理期间持续持有，因此因忙碌而拒绝时
不会留下未使用的工作树。
`!cd` 防护在 shell 执行之前运行，并在采用 cwd
或回滚期间持续持有，因此被拒绝的命令不会使 shell 留在其他目录。
取消选择器、无效目标位置以及移动失败都会保留 BTW 对话。
成功迁移只会在移动已保存产物之后清除旧视图。

从路径、会话选择器或导入的会话恢复时，会取消 BTW，
等待其终止检查点完成后再切换。确认删除
活动会话时，也会先执行相同清理，再分离会话并删除其产物。
BTW 持久化失败会保留源会话及其产物。
拒绝删除或删除非活动会话不会取消当前 BTW。
使用 `context.newSession`、`context.switchSession` 或
`context.branch` 的扩展命令，也会在改变会话状态或清除
扩展 UI 之前运行此清理。这既适用于扩展初始化，
也适用于其命令上下文重新初始化。

会话操作最多等待 10 秒，让未完成的 BTW 持久化结束。
超时会停止操作并保持当前会话；它
不会取消底层文件系统写入，也不会允许迁移/删除在
写入完成之后再执行。终止检查点失败也会在其
待完成 promise 落定后停止这些操作；未保存的回答仍
可供查看和复制。重试操作时，会以原始磁盘修订版本为基础重试保留的快照。
临时 I/O 失败可以恢复，但
冲突绝不会静默地在其他写入方的更改上变基。初始
检查点被拒绝仍会阻止模型分派，且可以正常重新加载历史。
可见的 BTW 错误使用长度受限的单行文本，移除控制序列，
缩短内嵌主目录路径；原始错误仍保留在诊断
日志和异常原因中，供故障排查使用。

开始提问时会保存运行状态。完成、出错和显式
取消都会保存最终检查点；已取消的回答保留
已经收到的文本。崩溃可能丢失尚未写入检查点的流式文本，但已保存的运行中
记录会以 `Interrupted` 状态重新打开，绝不会自动重新提交。
历史始终附属于会话产物，随复制或删除这些产物的
操作一起处理；它不会移动对话叶节点。

现有行内 `b` 操作只有在原始会话/叶节点未改变且主会话
空闲时，才会将已完成的单轮回答提升为聊天
分支。聚焦子代理的回答不能提升为主会话分支。
多轮旁支对话保留在 BTW 历史中；只提升其
最新的一问一答会丢弃之前的上下文。浏览历史不会提升
回答，也不会放宽这些分支防护条件。

## 12) 捆绑命令说明：`/annotate` \{#12-bundled-command-note-annotate}

`/annotate` 让操作者在智能体采取行动之前，为差异或文本附加注释。不带参数时会打开来源菜单。

| 命令 | 来源 |
| --- | --- |
| `/annotate code-review [focus]` | 本地基准分支、工作副本或提交差异，GitHub PR 或 GitLab MR |
| `/annotate last` | 活动分支上最新的非空助手回复 |
| `/annotate session` | 在 `/copy` 选择器中选取的消息或区块 |
| `/annotate path/to/file` | 从文件读取的文本 |
| `/annotate "text"` | 字面文本 |

`/copy` 和 `/annotate session` 使用同一个选择器。高亮一条消息，在 Tern 中选择**区块**（或按 Right）以浏览其区块。选择**复制**或**选择**（或按 Enter）以接受高亮的消息或区块。当 Tern 有空间显示侧边预览时，也可点击预览部分，接受其完整文本并关闭选择器。

`/annotate` 后的全部剩余内容都是一个来源规格（`CustomCommand.execute` 将其作为 `rawArgs` 原样接收）：

- 用匹配的 `"` 或 `'` 包裹的剩余内容是字面文本；只剥离最外层引号，内部内容逐字节保留。
- 不带引号的 `last`、`session` 和 `code-review …` 选择相应模式。要批注路径以这些词之一开头的文件，请添加 `./` 前缀（例如 `/annotate ./code-review notes.md`）。
- 其他内容都作为一个文件路径，包含其中的空格，使用 `resolveReadPath` 相对于会话实时 cwd 解析。路径缺失或不是普通文件时，会通知用户，绝不回退为字面文本。

参数补全提供模式、`./` 文件路径起始项和引号起始项。`CustomCommand.getArgumentCompletions(prefix, cwd)` 接收会话实时 cwd，因此文件建议会随 `/move` 和 `/wt` 更新。

批注窗格会在 ANSI 终端和 Tern 中，对支持的文件类型、已知语言的选定代码块以及差异内容进行语法高亮。在 ANSI 中，即使启用了语法颜色，新增和删除的代码也保持不同的背景色调。行注释仍指向原始源行或差异中的旧/新行，即使显示时发生换行也是如此。

**代码审查。** 菜单先列出对话中引用的最多三个 GitHub PR 或 GitLab MR，再列出本地差异类型。`/annotate code-review` 接受与 `/review` 相同的参数；引用或 `#N`/`!N` 会跳过菜单。差异在审查检出中解析一次并冻结（`ResolvedReviewTarget`）；浮层和审查者提示词读取同一快照，并按与 `/review` 相同的排除规则筛选（`src/extensibility/custom-commands/bundled/review/diff.ts`）。浮层提供**继续使用 LLM 审查**（提交 `/review` 提示词，并将注释作为操作者关注点）和**将批注粘贴到提示词**。两者都包含可选的 `[focus]` 文本。不会向 GitHub 或 GitLab 发布任何内容。

没有交互式 UI 时，`code-review` 会委派给 `/review`，而不是打开批注浮层；文本来源批注会拒绝发送消息。

**文本来源。** 反馈始终粘贴到输入框中，从不提交。文件和字面来源按原样嵌入。最新回复以“你的上一条回复”引用，只引用批注的行。超过 1,000 个字符的较早会话正文消息，会调用一次当前会话模型来压缩（使用其凭据，不使用后备模型）；如果调用失败或返回不可用结果，会嵌入完整来源并附带警告。

**扩展 API。** 扩展通过 `ctx.annotations.submit`（调用方提供注释，无 UI，任何模式）和 `ctx.annotations.open`（在选定来源上打开浮层，仅 TUI）使用同一流水线；参见 `docs/extensions.md`。命令与 API 共享 `buildTextReviewPrompt`、`buildCodeReviewFeedback`，以及 `annotate/direct-source.ts`、`annotate/text-source.ts` 和 `review/index.ts`（`fetchPrReviewTarget`）中会抛出异常的来源读取器；交互包装器只是将其错误转换为通知。`submit` 会从来源重新推导每条注释的引用或差异块行。`text`/`diff` 来源是调用方输入的冻结快照；`file`、`last`、`uncommitted` 和 `pr` 会在调用时重新读取，因此行号与当前内容匹配，只有越界行会单独失败。调用方通过可选的 `quote`（文本）或 `rawLine`（带前缀的差异行）锚点固定内容；不匹配时会拒绝，并返回指明该注释的错误，而不是引用错误的行。`open` 会在挂载浮层前检查所提供补丁的审查边界。提供的差异属于 `patch` 目标：它绝不会从浮层打开工作树文件。

**ANSI 布局。** 差异和文本来源行按终端单元格硬换行，保留缩进、展开的制表符、内部/尾部空格、空行和完整字素，而非按正文单词换行。差异续行与内容对齐，每个物理行都会关闭前景样式；每个续行都保留相同的原始逻辑注释锚点。PgUp/PgDn 按视觉行翻页，`g`/`G` 到达开头/末尾，包括单条长源行的续行。聚焦的截断文件名浮在现有行之上，不使文件列表重排；需要时向上移动以适应空间，失去焦点时折叠。高于整个窗格的路径显示明确的省略标记，并保留文件名后缀。与询问工具注释一样，注释编辑器遵循所配置的终端硬件光标偏好，启用时使用终端原生光标，禁用时使用软件光标。最后一个字形在文本宽度边界处保持可见；第一个溢出字形换行。

**浮层按键。** `a` 添加行注释，`A` 添加整个文件/整个文本的注释，`e` 编辑光标处的注释（有多条适用时提供选择器），`u` 撤销上次添加/编辑/删除。外部编辑器键（`app.editor.external`，默认 Ctrl+G）打开 `$VISUAL` 或 `$EDITOR`。编写注释时，它会替换草稿但不保存。其他情况下，对于文件来源，它原地编辑文件并重新读取；对于键入的提示词，它替换粘贴时使用的文本；对于本地差异审查（非 PR），它从仓库根目录打开当前文件，而审查仍使用冻结快照。会话消息不可编辑，因为粘贴时会省略或概括它们，对编辑后文本所作的注释会引用模型永远看不到的行。来源编辑后，如果行注释的引用仍匹配所在行，则保留；如果引用移动到了唯一一行，则重新定位；其他行注释会被丢弃，并清空撤销历史。编辑器以非零状态退出会发出警告，但仍使用编辑器保存的内容。在注释编辑器中，Enter 保存，Shift+Enter 插入换行，Escape 丢弃草稿。注释保存时会去除首尾空白；将已有注释编辑为空再保存会删除它，新建的空注释会被忽略。行锚点（引用的源行、差异块标题和原始行）按原样保留。

## 13) 内置命令说明：`/plan-review` \{#13-built-in-command-note-plan-review}

`/plan-review` 为最新计划重新打开计划审查浮层（仅计划模式）。在目录侧栏中，`a` 批注选定章节；在计划正文中，`a` 批注顶部可见行。`e` 编辑该章节或行的批注（有多条适用时提供选择器），`u` 撤销最近的章节删除或批注更改。注释编辑器与 `/annotate` 的行为相同：Enter 保存，Shift+Enter 插入换行，Escape 丢弃草稿，外部编辑器键替换草稿但不保存，将已有批注编辑为空再保存会删除它。

决策选项包括批准选项和**保存**，后者将计划写入所选路径、报告目标位置，并保持审查打开（计划模式和会话保持不变）。只有计划存在反馈（批注或已删除章节）时，才显示**完善计划**；此时它是第一个且预选的选项，会携带该反馈重新提示模型。

在 Tern 中，计划是一份可编辑文档：双击可原地编辑（编辑同步至计划文件，批注随对应文本移动），选择文本会提供评论气泡，其评论成为完善计划的反馈（章节标题下先写 `> "quote"`，再写注释）。其下方的停靠栏包含批准拆分按钮（计划有评论时为完善；菜单列出所有批准选项）、执行模型标签、保存和取消；Enter 执行主按钮，←/→ 更换模型，↑/↓ 浏览目录（计划有评论时隐藏）。较旧的 Tern 版本仍为每个章节保留一个 Markdown 区块和选项栏。

## 14) 内置命令说明：`/context` \{#14-built-in-command-note-context}

`/context` 根据活动系统提示词、已加载的指令文件和技能列表、工具定义及消息的快照，打开只读上下文查看器，显示每个条目和类别的估算 token 数。快照在打开时生成，不会刷新；关闭并重新打开可更新。它不运行扩展钩子（`context`、`before_provider_request`），因此检查上下文不会触发其副作用。消息使用与 `convertToLlm` 相同的逐消息转换，引导由 `wrapSteeringForModel` 包装，模型提供方拒绝按实时重放的方式丢弃，但不执行图像阻止、混淆、请求规范化、模型提供方编码或模型提供方转换，因此内容和 token 数可能与模型提供方请求不同。

指令文件和技能列表仍保留在面向模型提供方的系统提示词中，但显示在各自类别中，即使使用字面的自定义提示词或自定义模板也是如此。`buildSystemPrompt` 使用 `prompt.renderTracked` 渲染其区块，将上下文文件和技能对象作为跟踪条目传入：模板引擎记录对它们进行的每次 `{{#each}}` 迭代的输出范围，覆盖完整行的每次迭代会单独格式化，并作为一个区块加入格式化模板，因此其区块索引和范围在构造时就已确定。会话将这些来源与基础提示词一起提交（重建、准备好的提交和会话切换回滚）。查看器打开时，会为有效提示词中在同一索引处保持不变的每个区块归属来源。系统提示词条目将已归属的来源以 `[Shown in <category>: <source>]` 标记显示在原始位置，使用该类别的主题颜色；标记不计 token。构建后发生更改或移动的区块中的来源会留在系统提示词中，概览会说明有多少指令文件和技能因为提示词在构建后改变而留在那里；向区块 0 追加内容的扩展 `before_agent_start` 钩子或 SDK `systemPrompt` 回调会使所有技能留在那里。在 `{{#list}}` 等辅助区块内、与其他文本共享一行，或位于模板打开的代码围栏内的迭代，会就地格式化且不归属，因此该来源留在系统提示词中，不附注释。状态行的上下文明细通过同一归属机制统计指令文件和技能（`packages/coding-agent/src/session/context-usage.ts` 中的 `claimPromptSources`），因此数字与 `/context` 一致。如果某个文件留下未闭合的代码围栏，会在文件末尾将其闭合，使提示词其余部分照常格式化。

估算规则：概览类别行和逐工具行按各行的估算占比分摊报告的已使用总量，而条目标题显示各自未经缩放的估算值，因此类别中条目的总和不必等于其概览行；概览在图例下说明了这一点。同一消息中的多个思考区块共享一个总量，显示在分组标题中，组内条目显示 `—`；没有用量数据的空中断思考显示 `N/A · Interrupted`，而不是零。保留的 Anthropic 网页搜索和工具搜索调用及结果，会在工具调用和工具输出中以 JSON 显示；不透明的模型提供方数据（思考签名、`encrypted_content`、`encrypted_index`）只显示其大小，例如 `signature · 1,024 chars`，但仍参与统计。

导航使用 `tui.select.*` 绑定：上/下选择和滚动，确认打开条目，取消返回或关闭，Page Up/Down 滚动完整内容视图（参见[快捷键](./keybindings.md)）。在 Tern 中，单击选择、双击打开，鼠标滚轮滚动。没有条目的类别无法打开。打开查看器不会提交输入框草稿，也不会中断后台轮次。

## 15) 捆绑命令说明：`/review` \{#15-bundled-command-note-review}

`/review` 本身不运行审查者。它构建提示词并将其返回主会话，随后主会话以 `agent: "reviewer"` 调用 `task` 工具。审查者是普通任务智能体，因此发现、模型路由和派生限制遵循[任务智能体发现](./task-agent-discovery.md)。

**目标。** `/review [<dir>] [<ref> | #N | !N] [instructions]`。引用可以是 GitHub PR URL、`pr://owner/repo/N`、`owner/repo#N`、GitLab MR URL，或完全限定的 `mr://host/group/project/iid`；它不需要检出，剩余文字成为额外指令。URL 和协议形式的引用可以出现在参数的任何位置；`owner/repo#N` 只在开头位置识别，因此正文中引用相关 PR 仍会作为指令。若第一个参数形似路径（`.`、`..`、`~`、绝对路径，或以这些形式之一加分隔符开头）且是现有目录，则将该目录用作审查检出位置，而不是会话 cwd；其他路径仍作为指令文本。紧跟其后的 `#N` 是该检出仓库中的 GitHub PR，`!N` 是 GitLab MR（不指定目录时则放在首位）；更后面的 `#N` 文本仍作为指令。

**菜单。** 没有引用时，交互式会话会打开审查模式菜单：对话中提及的最多三个 PR 或 MR、基准分支、未提交更改、特定提交、特定开放 PR 或 MR，以及自定义指令（最后一项仅在未给出额外指令时提供）。检出位置不在任何仓库内时，本地选项和开放 PR 选项会先要求选择其直接子仓库之一。本地审查的检出位置不同于会话 cwd 时，会在提示词中写明仓库根目录，因为差异路径相对于它，而审查者任务从会话 cwd 启动。既没有 UI 也没有引用时，提示词会要求针对近期代码更改启动一个审查者任务。

**扇出。** 差异少于 100 个更改行或最多涉及两个文件时，提示词要求启动一个审查者任务。更大的差异会要求更多审查者，按位置相近性分组，差异达到 5000 个更改行时最多 16 个。超过 50,000 个字符或 20 个文件的差异不会内联。此时提示词携带每个文件的简短预览，并指示各审查者读取自己的差异。

**结果。** 捆绑的 `reviewer` 在 frontmatter 中声明以下 `output` 模式：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `overall_correctness` | `correct` 或 `incorrect` | 更改是否存在缺陷或阻塞问题 |
| `explanation` | 字符串 | 结论摘要，1 至 3 句 |
| `confidence` | 数字，0.0 至 1.0 | 对结论的置信度 |
| `findings`（可选） | 列表 | 每个问题一个条目：`title`、`body`、`priority`（0 表示阻止发布，3 表示有则更好）、`confidence`、`file_path`、`line_start`、`line_end` |

此模式仅适用于结构化运行：开启 `task.structured`，或在智能体定义中设置 `structured: true`。捆绑的 `reviewer` 未设置 `structured`，因此在默认 `task.structured: false` 下，任务结果是审查者最终消息的文本。`/review` 请求还要求审查者通过增量 `yield` 章节报告，而 `yield` 工具只存在于结构化运行中。参见[模型和结构化输出优先级](./task-agent-discovery.md#model-and-structured-output-precedence)。

**替换审查者。** `/review` 按名称查找智能体，因此任何 frontmatter 含有 `name: reviewer` 的任务智能体都会替换捆绑版本。按以下顺序，第一个匹配项生效：

1. 最近项目的 `.omp/agents/*.md`
2. 用户的 `~/.omp/agent/agents/*.md`
3. 已启用 OMP 扩展包的 `agents/`
4. Claude 市场插件智能体
5. 捆绑的 `reviewer`

第 4 项只在启用 `claude-plugins` 提供方时适用。Claude 方言插件智能体（清单声明 Claude 格式的包）会丢弃其 frontmatter 的 `model`。OMP 原生包和 Agent-Plugins 标准包会保留它。对于 Claude 方言的 `reviewer`，应改为设置 `task.agentModelOverrides.reviewer`。

名称来自 frontmatter，而非文件名。替换针对整个定义。不会与捆绑文件合并，因此如果替代版本需要 `tools`、`spawns`、`model` 和 `output`，须重新声明它们。如果只想更改模型，应改为设置 `task.agentModelOverrides.reviewer`。参见[文件系统和插件发现](./task-agent-discovery.md#filesystem-and-plugin-discovery)以及[合并与冲突规则](./task-agent-discovery.md#merge-and-collision-rules)。

```md
---
name: reviewer
description: Review a change against the team rubric.
tools: read, grep, find, bash
model: "@slow"
autoloadSkills: [team-review-rubric]
---

Apply the rubric from the loaded skill. Report only issues introduced by the patch.
```

**`autoloadSkills` 和 `spawns`。** 捆绑的 `reviewer` 不设置 `autoloadSkills`，并设置 `spawns: scout`。

- `autoloadSkills` 指定父会话中的技能名称。每个技能都会在审查者的第一个提示词之前作为隐藏消息注入，类似 `/skill:<name>`。父会话不认识的名称会被忽略。
- `spawns` 限制审查者可以通过 `task` 启动哪些智能体。`scout` 只允许名称为 `scout` 的智能体，`*` 允许任意智能体，省略它（且 `tools` 中没有 `task`）则不允许派生。声明了 `tools` 且设置了 `spawns` 时，`task` 会加入工具列表。达到最大递归深度时，`task` 会被移除，并关闭派生。
