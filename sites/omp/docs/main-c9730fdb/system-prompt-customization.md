---
title: "系统提示词自定义"
description: "Oh My Pi 官方仓库文档：系统提示词自定义。"
---

# 系统提示词自定义 \{#system-prompt-customization}

介绍编程智能体如何组装系统提示词，以及用户可以通过 `SYSTEM_TEMPLATE.md`、`SYSTEM.md`、`APPEND_SYSTEM.md`、`TITLE_SYSTEM.md` 和 CLI 标志控制哪些内容。编程 API 选项提供相同路径或完整替换能力的地方会另行说明。

主要实现：

- `packages/coding-agent/src/main.ts`（`applyResolvedSystemPromptInputs`）
- `packages/coding-agent/src/sdk.ts`（`CreateAgentSessionOptions`、提示词构建）
- `packages/coding-agent/src/system-prompt.ts`（`discoverSystemPromptOverride`、`buildSystemPrompt`、`BuildSystemPromptOptions`）
- `packages/coding-agent/src/prompts/system/system-prompt.md`（默认指令模板）
- `packages/coding-agent/src/prompts/system/custom-system-prompt.md`（纯文本 `SYSTEM.md` 模板）
- `packages/coding-agent/src/prompts/system/project-prompt.md`（生成的 `<project-context>` 页脚）

## 块布局与提示词缓存 \{#block-layout-and-prompt-caching}

面向提供方的提示词是一个有序块数组。静态且不依赖 cwd 的块排在最前：块 0（默认、自定义或模板指令块）和 eval 前置指导。所有根据工作目录生成的部分都放在末尾的一个页脚块中，以 `<project-context>` 开头：工作站数据、带路径的上下文文件（`<repo-rules>`）、`<dir-context>` 指针、`<workspace-tree>`、`<workspace-roots>`、当前嵌套仓库上下文、最终完成要求以及追加文本。任务子代理会在页脚之后追加每次启动特有的角色/任务块。

在 Anthropic 上，系统缓存断点位于第一个 `<project-context>`（或 `<memories>`）块之前的最后一个块，因此同一智能体在不同目录中的会话和子代理启动（例如每个任务使用一个 git 工作树）能够将静态提示词作为缓存前缀共享。其他提供方接收相同的有序块。

## 输入与优先级 \{#inputs-and-precedence}

| 输入 | 来源 | 效果 |
| --- | --- | --- |
| `--system-prompt-template <path>` | CLI | 严格将 `<path>` 作为 Handlebars 源码读取，并替换内置默认指令块。具有最高的自定义提示词优先级。 |
| `--system-prompt <text-or-file>` | CLI | 现有纯文本自定义路径。具有最高的自定义提示词优先级。与模板标志互斥。 |
| `SYSTEM_TEMPLATE.md` | 发现的配置文件 | 原始 Handlebars 源码。在未提供显式覆盖且未提供发现的 `SYSTEM.md` 时使用。 |
| `SYSTEM.md` | 发现的配置文件 | 现有纯文本自定义路径。在未提供显式覆盖时使用。 |
| `--append-system-prompt <text-or-file>` | CLI | 向渲染后的提示词添加纯文本。具有最高的追加优先级。 |
| `APPEND_SYSTEM.md` | 发现的配置文件 | 现有纯文本追加路径；未提供追加标志时使用。 |
| `systemPromptTemplates` | `config.yml` 设置 | 按模型指定的 Handlebars 模板文件。在上述自定义提示词均不适用时使用。参见[按模型指定模板](#per-model-templates)。 |

**CLI 优先级：**显式 `--system-prompt` 或 `--system-prompt-template` 标志优先于发现的 `SYSTEM_TEMPLATE.md` 和 `SYSTEM.md`；显式 `--append-system-prompt` 优先于发现的 `APPEND_SYSTEM.md`。两个自定义提示词标志互斥，同时提供会明确报错。显式提供空的 `--system-prompt` 字面值仍算作显式输入，并会阻止自定义提示词发现。

编程 API 选项使用独立约定，而非 CLI 标志；参见[编程 API 选项](#programmatic-api-options)。

该空字面值会阻止发现的 `SYSTEM.md` 和 `SYSTEM_TEMPLATE.md` 生效，但不会禁用 OMP 生成的指令；只有编程选项 `CreateAgentSessionOptions.systemPrompt` 的完整替换功能才会这样做。

没有显式自定义来源时，发现顺序为项目级优先，其次是用户级。在每个范围内，字面文本优先于模板：项目 `SYSTEM.md` 优先于项目 `SYSTEM_TEMPLATE.md`，后者优先于用户 `SYSTEM.md`，再后是用户 `SYSTEM_TEMPLATE.md`。`SYSTEM.md` 是长期沿用的覆盖方式，因此已有字面文本会继续工作，直到作者主动删除它并改用模板。两个文件名都通过相同的能力提供方解析，因此向上查找祖先目录（从嵌套 cwd 查找仓库根目录的 `.omp`）以及 `.agent` / `.agents` 目录对模板的适用方式与字面文本完全相同。

原生用户路径遵循当前配置档案：使用 `omp --profile work` 时，`~/.omp/agent` 变为 `~/.omp/profiles/work/agent`。`PI_CONFIG_DIR` 会更改原生配置目录名称。能力发现（`SYSTEM.md`、`SYSTEM_TEMPLATE.md`）和共享配置基目录查找（`APPEND_SYSTEM.md`、`TITLE_SYSTEM.md`，后者仅搜索 `<cwd>/.omp/` 和智能体目录）都通过 `getAgentDir()` 解析原生用户基目录，因此在默认配置档案中，`PI_CODING_AGENT_DIR` 会重新定位这四个文件；命名配置档案会忽略它。显式 CLI 标志或编程 API 选项仍优先于所有发现的文件。共享配置目录约定参见[配置用法](./config-usage.md)。

`--system-prompt-template <path>` 是严格的文件路径：模板缺失、不可读、为空或格式错误都会报错，绝不会作为字面提示词。发现的空 `SYSTEM_TEMPLATE.md` 会被跳过（如果发现了字面文本，它已经在发现过程中胜出）。`buildSystemPrompt()` 直接发现的格式错误模板会触发警告，并渲染内置提示词。CLI 发现会将加载的源码作为显式 SDK 模板传递，因此发现的模板格式错误会导致 CLI 启动失败。同一范围内的字面文本始终在发现过程中胜出，因此与字面文本并列的格式错误模板不会被渲染。发现的模板通过能力发现读取一次；之后的运行时重建会重新渲染该内存中的源码。

### 文本或文件解析 \{#text-or-file-resolution}

现有纯文本标志保持原有解析规则。对于单行的 `--system-prompt` 或 `--append-system-prompt` 值，OMP 首先尝试将该值作为文件路径读取。如果因路径不存在（或太长而无法作为路径）导致读取失败，则按字面文本使用该值。包含换行符的值会直接按字面文本使用，不读取文件。其他文件读取失败会被记录，原始值仍按字面文本使用。此回退**不**适用于 `--system-prompt-template`。

## 纯文本 `SYSTEM.md` 替换什么 \{#what-plain-systemmd-replaces}

`SYSTEM.md` 不会变成一条原始且独立的系统消息。CLI 将其存储为 `CreateAgentSessionOptions.customSystemPrompt`，而 `buildSystemPrompt` 会渲染 `custom-system-prompt.md`，而不是默认的 `system-prompt.md`。

纯文本自定义模板保留以下生成内容：

- 自定义文本；
- 发现的技能；
- 始终应用的规则和规则手册列表；
- 启用时的秘密信息脱敏指导。

独立的 `<project-context>` 页脚仍然保留，包含工作站数据、发现的上下文文件、更深目录的上下文指针、可选工作区信息、当前嵌套仓库上下文、最终完成要求以及追加文本。计算机工具安全等可选额外系统块在适用时也会保留。提供方可调用的工具模式仍由面向提供方的会话生成。

消失的是默认指令模板特有的内容：内置角色/个性文本、工具清单和通用工具策略、内部 URL 目录、探索/委派/工作流规则以及已挂载工具命令目录。生成的技能和规则**不会**丢失；内置纯文本自定义模板会显式渲染它们。

因此：

- 要在保留完整默认提示词的同时添加少量指令，只使用 `APPEND_SYSTEM.md` 或 `--append-system-prompt`。
- 要替换默认指令模板，同时保留内置纯文本自定义模板的生成部分，使用 `SYSTEM.md` 或 `--system-prompt`。
- 如果纯文本自定义提示词仍需要默认工具策略或工作流，请自行复制并维护所需指导；不支持从 `system-prompt.md` 选择性继承。

### 追加位置 \{#append-placement}

没有 `SYSTEM.md` 或 `SYSTEM_TEMPLATE.md` 时，追加文本在 `project-prompt.md` 末尾渲染，位于默认指令块和项目/环境内容之后。

使用 `SYSTEM.md` 时，追加文本同样在 `project-prompt.md` 末尾渲染；`custom-system-prompt.md` 包含自定义文本、技能和规则，页脚（带上下文文件和追加文本）位于该块之后。

使用 `SYSTEM_TEMPLATE.md`（或 `--system-prompt-template`）时，追加文本仍由常规项目/页脚路径生成；原始模板控制块 0，不会隐式获得追加文本的副本。

OMP 生成的追加内容（用于已启用的记忆/自动学习功能和 MCP 指导）会合并在用户提供的追加文本之前。
这些生成块可能以 `## MCP Server Instructions` 结尾，其文本声明
自身由服务器控制且未经验证。只要生成块位于
用户提供的文本之前，该文本就会在独立的 `## User Instructions` 标题下渲染，
避免看起来像服务器所有部分的末尾段落。单独使用时，即没有
生成块时，追加文本原样输出，不带标题。

## 按会话类型划分的输入 \{#inputs-by-session-type}

哪些自动输入会到达各类会话。输入在存在或启用时才适用，个性指默认模板的个性块。顾问构建专用提示词，其中还包含记忆指令、共享指令以及每位顾问的指令；`WATCHDOG.md` 中的 `@path` 导入会被展开。

| 会话类型 | `AGENTS.md` | `CLAUDE.md` | `APPEND_SYSTEM.md` / `--append-system-prompt` | MCP 工具 | MCP 服务器指令 | `WATCHDOG.md` | 个性 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 主会话 | 发现 | 发现 | 是 | 是 | 是 | 否 | 按配置 |
| 任务子代理 | 不继承 | 继承 | 否 | 继承 | 继承 | 否 | `none` |
| 顾问/看门狗 | 继承 | 继承 | 否 | 否 | 否 | 是 | 无 |

1. 任务子代理会丢弃所有基本文件名为 `agents.md`（不区分大小写）的上下文文件，无论是从父智能体继承，还是为额外工作区根目录发现的文件，包括用户级 `~/.omp/agent/AGENTS.md`。通过 `@` 导入引入的文本不会被过滤。
2. 上下文发现在每个目录深度选择一个用户文件和一个项目文件，优先级更高的提供方胜出。不会读取其他工具的主目录文件。支持独立的 `CLAUDE.md`。
3. 任务智能体的 `tools:` 列表不会移除 MCP 工具或服务器指令：工具仍可在顶层使用，或作为 bash 工具命令使用。计划模式任务和受限会话的子任务使用 `restrictToolNames` 运行，它会丢弃这两者。

## Handlebars 模板路径 \{#handlebars-template-route}

`SYSTEM_TEMPLATE.md` 和 `--system-prompt-template <path>` 从文件中选择原始 Handlebars 源码。编程调用方也可以通过 `CreateAgentSessionOptions.systemPromptTemplate` 或 `buildSystemPrompt({ systemPromptTemplate })` 传入原始 Handlebars 源码；这些编程选项是模板本身，而不是路径。每种路径都会替代内置的 `system-prompt.md` 进行渲染，使用与内置模板相同的实时数据和已注册辅助函数。

块 0 之外的生成块保持正常：保留 `<project-context>` 页脚（包括生成的上下文、当前嵌套仓库上下文和追加材料）、计算机安全以及提供方工具模式。通常位于内置模板内部的数据驱动部分不会自动追加。模板可以使用 `skills`、`rules`、`alwaysApplyRules`、`toolInventory`、`internalUrls`（会话中每个可用内部 URL scheme 各渲染一行）、`internalUrlReference`（上述行未包含的子路径、查询和限制语法，每个 scheme 一行；内置模板仅在没有 `read` 时内联它，因为 `read help://read/urls` 可按需提供）、`mountedCommands`、`toolCommandDocs` 和 `hasDynamicToolCommands`，但每项都只有在模板引用它时才会输出。特别是，省略 `{{toolInventory}}` 或 `{{toolCommandDocs}}` 就会省略块内对应目录。内置模板的 `# Tool Commands` 部分以 `{{#if mountedCommands.length}}` 为条件：它说明每个列出的工具也是 `{{toolRefs.bash}}` 中的命令，其 `--help` 用法由模式派生，然后插入 `{{toolCommandDocs}}` 以提供目录和内联用法。已挂载工具的 `{{toolRefs.<tool>}}` 是其裸名称，也是要运行的命令；当任何已挂载命令带有动态摘要时，`hasDynamicToolCommands` 为 true。挂载通知渲染 `tool-command-mount-notice.md`，已挂载 MCP 指导渲染 `mcp-tool-command-guidance.md`。挂载通知去重遵循渲染输出：重建仅在渲染后的块 0 确实包含 `toolCommandDocs` 文本时才认领目录名称，因此引用 `{{toolCommandDocs}}` 的模板会保留去重，而省略该部分的模板不会虚报。纯文本自定义提示词路径（`SYSTEM.md` / `--system-prompt`）从不认领它。

生成的项目/页脚路径已经渲染过一次 `contextFiles` 和 `appendPrompt`。模板不应在块 0 中渲染这些字段，除非有意需要重复副本。

当 `{{#each}}` 迭代在 `{{#list}}` 等辅助函数块之外，将每个上下文文件和技能分别渲染为独立行时，`/context` 会将它们显示在各自类别中；在单行中列出技能或通过辅助函数列出技能的模板，会将它们留在系统提示词中。指令文件来自项目块，因此模板不会影响其归属。

使用实际生效的会话设置和实时工具数据，而不是复制当前渲染的文本。渲染任务子代理提示词时，`subagent` 为 true；内置模板使用它将验证职责替换为向主智能体交接。`eagerTasks` 和 `eagerTasksAlways` 反映会话启动时捕获的任务设置，而 `toolCommandDocs`、`toolInventory` 和 `toolRefs` 则在每次提示词重建时反映已挂载工具命令和工具状态。`toolCommandDocs` 还反映该次重建所用的 `tools.commandDocs` / `tools.commandInline` 设置。

模板拥有与内置提示词相同的辅助函数集（`if`、`each`、`unless`、`list`、`when`、`has`、`ifAny`、`includes` 以及其他已注册辅助函数）。不会为用户文件额外创建辅助函数。插入模板的值是数据，不会进行第二次模板处理：`toolCommandDocs`、上下文文件、工具描述或其他值中看起来像 Handlebars 的文本不会递归渲染。

将此边界两侧都视为提示词输入。像保护其他系统级配置一样保护模板文件，并在将工作区、扩展、MCP 和已挂载工具命令描述视为可信策略之前审查它们；动态命令摘要是第三方文本。CLI 在启动时读取模板文件一次。编程方式提供的原始源码已经在内存中。之后的运行时提示词重建会用当前实时数据和设置重新渲染该内存源码，但不会重新读取已更改的文件；编辑文件后请重启 OMP。

## 纯文本与模板约定 \{#plain-text-and-template-contracts}

`SYSTEM.md`、`APPEND_SYSTEM.md`、`--system-prompt` 和 `--append-system-prompt` 仍是纯文本。它们是插入内置 Handlebars 模板的值；其内容不会递归编译为 Handlebars。

例如，如果 `SYSTEM.md` 包含：

```handlebars
Working in
{{cwd}}
on
{{date}}.
{{#if internalUrls.length}}Internal URLs available.{{/if}}
```

这些字符会原样传给模型。`cwd`、`skills`、`rules` 和 `toolRefs` 等内部值仍是纯文本路径的私有实现细节。日历日期不作为模板值暴露，而是在首个用户轮次的每请求提醒中与会话 cwd 一同提供。

只有主动选择的 `SYSTEM_TEMPLATE.md` / `--system-prompt-template` / `systemPromptTemplates` / 编程选项 `CreateAgentSessionOptions.systemPromptTemplate` 和 `buildSystemPrompt({ systemPromptTemplate })` 路径才会编译 Handlebars。显式提供的格式错误或空模板会明确报错，绝不会降级为纯文本。发现的空模板会被跳过。`buildSystemPrompt()` 发现的格式错误模板会警告并回退到内置提示词；CLI 发现的源码会作为显式 SDK 输入传递，因此 Handlebars 格式错误会导致失败。

## 用法示例 \{#recipes}

### 向默认提示词添加规则 \{#add-rules-to-the-default-prompt}

创建 `APPEND_SYSTEM.md`，不要创建 `SYSTEM.md` 或 `SYSTEM_TEMPLATE.md`：

```text
# ~/.omp/agent/APPEND_SYSTEM.md
Prefer Bun APIs over Node APIs in this project.
When you change a public function, run `bun check` before yielding.
```

### 提供自定义基础提示词 \{#supply-a-custom-base-prompt}

```text
# <cwd>/.omp/SYSTEM.md
You are a code reviewer. Read changes, surface concrete issues, and never edit files.
Cite paths with backticks.
```

OMP 仍会添加生成的上下文、技能、规则和项目/环境页脚，但不会添加默认指令模板中的工具和工作流指导。

### 迁移内置提示词 \{#migrate-the-bundled-prompt}

1. 将 `packages/coding-agent/src/prompts/system/system-prompt.md` 复制到 `~/.omp/agent/SYSTEM_TEMPLATE.md` 或 `<cwd>/.omp/SYSTEM_TEMPLATE.md`。
2. 编辑文本，同时保留所需的 Handlebars 块和实时数据占位符。
3. 绝不要复制渲染后的 `/dump` 提示词：这会将设置、工具目录和已挂载工具命令数据固定下来。
4. 更新 OMP 时，将模板与随附的源码路径进行差异比较。
5. 删除或重命名同一范围内的所有 `SYSTEM.md`：发现的字面文本优先于发现的模板，因此只有移除字面文本后模板才会生效。

### 提供 Handlebars 模板 \{#supply-a-handlebars-template}

创建 `<cwd>/.omp/SYSTEM_TEMPLATE.md`（或将同一文件传给 `--system-prompt-template`）：

```handlebars
# Delegation
{{#if eagerTasksAlways}}
After settling the design, MUST delegate substantial work through `{{toolRefs.task}}`.
{{else}}
{{#if eagerTasks}}
After settling the design, SHOULD delegate substantial work through `{{toolRefs.task}}`.
{{else}}
Delegate only when the request or repository guidance calls for it.
{{/if}}
{{/if}}

# Tools
{{toolInventory}}

{{#if mountedCommands.length}}
# Tool Commands
The commands documented below (not the Tool Inventory above) run inside `{{toolRefs.bash}}`: `<tool> <positional> [--flag value]`; `<tool> --help` prints usage derived from its schema.
Raw JSON arguments object: `-j '<json>'`, `@file`, or `-` (stdin); bad arguments exit 2 with a usage hint.
{{toolCommandDocs}}
{{/if}}
```

这是一个完整、可运行的 Handlebars Markdown 模板。它只使用内置块辅助函数和实时字段。它有意引用 `eagerTasksAlways`、`eagerTasks`、`toolInventory`、`mountedCommands`、`toolRefs` 和 `toolCommandDocs`；省略的字段不会自动插入。

### 按模型指定模板 \{#per-model-templates}

`config.yml` 中的 `systemPromptTemplates` 将模型选择器子串映射到 Handlebars 模板文件。匹配的模板会替换该模型的内置 `system-prompt.md`：

```yaml
systemPromptTemplates:
  "openrouter/qwen": ~/.omp/agent/prompts/qwen-openrouter.md
  "qwen": ~/.omp/agent/prompts/qwen.md
```

#### 从内置模板开始 \{#start-from-the-bundled-template}

每个按模型指定的模板都应以内置默认指令模板为基础。参考副本：[GitHub 上的 `system-prompt.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/system-prompt.md)（在检出目录中：[`packages/coding-agent/src/prompts/system/system-prompt.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/system-prompt.md)）；请使用与已安装版本对应标签中的文件。复制该文件，然后针对目标模型调整文本。它包含从零编写模板会丢失的工具策略、委派和工作流指导，以及只有模板才会插入的部分（`{{toolInventory}}`、`{{skills}}`、`{{rules}}`、`{{alwaysApplyRules}}`、`{{internalUrls}}`、`{{toolCommandDocs}}`、`{{#if subagent}}`）；模板省略其中某项时，渲染结果就不包含该部分。按照[迁移内置提示词](#migrate-the-bundled-prompt)操作，并在每次 OMP 更新后将副本与随附文件进行差异比较。

#### 匹配 \{#matching}

- 键以不区分大小写的子串方式匹配当前 `provider/model-id`。
- 多个键匹配时，最长者胜出，不受配置顺序影响（与 `edit.modelVariants` 的规则相同）：上例中，`openrouter/qwen/qwen3-coder` 使用 `qwen-openrouter.md`，其他 qwen 模型都使用 `qwen.md`。
- 不接受空白键。对于应用于所有模型的提示词，请使用 `SYSTEM.md`、`SYSTEM_TEMPLATE.md` 或 `APPEND_SYSTEM.md`。
- 路径必须为绝对路径或以 `~/` 开头。不接受相对路径，因为它们会在每个项目和子代理工作树中解析为不同文件。

#### 运行时行为 \{#runtime-behavior}

- 模板也适用于子代理会话；保留内置模板中的 `{{#if subagent}}` 分支。
- 所选模板变化时，提示词会重新渲染：包括 `/model` 和角色切换、重试回退跳转，以及会话中途编辑 `systemPromptTemplates`。
- 显式和发现的提示词（`--system-prompt`、`--system-prompt-template`、`SYSTEM.md`、`SYSTEM_TEMPLATE.md`）优先；其中任一项适用时，不会读取按模型指定的文件。
- 文件的读取方式与发现的 `SYSTEM_TEMPLATE.md` 相同：文件缺失、为空或格式错误时会记录警告并回退到内置提示词。

### 替换个性块 \{#replace-the-personality-block}

默认模板根据 `personality` 设置（`default`、`friendly`、`pragmatic`、`none`）渲染选定的个性块。用户级 `PERSONALITY.md` 会替换所选预设的文本：

```text
# ~/.omp/agent/PERSONALITY.md
Follow ASD-STE100 Simplified Technical English for all responses.
```

只检查智能体目录（默认为 `~/.omp/agent`；支持配置档案和 XDG），不进行项目级或其他配置基目录查找。`personality: none` 仍会完全省略该块（子代理始终以 `none` 运行），空文件或不可读文件会回退到配置的预设，并记录警告。

### 自定义自动会话标题 \{#customize-automatic-session-titles}

`SYSTEM.md` 和 `APPEND_SYSTEM.md` 不影响标题生成调用。请使用 `TITLE_SYSTEM.md`：

```text
# ~/.omp/agent/TITLE_SYSTEM.md
Generate a session name using lowercase `<type>:<primary-objective>`.
If the message has no concrete task, output exactly `none`.
```

`TITLE_SYSTEM.md` 首先在 `<cwd>/.omp/` 中查找，然后在 `~/.omp/agent/` 中查找，不向上遍历祖先目录；不搜索 `.claude/` 和 `.codex/` 目录。缺少该文件时，OMP 从新会话首个回复的派生分支生成标题（使用会话自身的模型和缓存提示词），以内置的小型模型标题提示词作为回退。该覆盖同时用于初始自动标题和由重新规划驱动的标题刷新，并会关闭回复派生分支：标题改由小型标题模型生成。

即使用自定义提示词，生成的标题输出也会强制遵循规范化约定。OMP 只考虑去除首尾空白后的第一行，移除外围引号、`<title>...</title>` 标记和末尾标点，并将 `none` 或 `<title/>` 视为“尚无标题”。超过 80 个字符或 12 个单词的结果会被拒绝，而不是截断。空、延后或被拒绝的输出会使会话保持未命名，以便后续符合条件的标题尝试为其命名。

## 编程 API 选项 \{#programmatic-api-options}

编程 API 调用方使用独立选项，而非 CLI 标志：`CreateAgentSessionOptions.systemPromptTemplate` 和 `buildSystemPrompt({ systemPromptTemplate })` 接受原始 Handlebars 源码；`CreateAgentSessionOptions.customSystemPrompt` 是已经加载的字面文本，而 `buildSystemPrompt` 的 `customPrompt` 是按路径或字面值解析的纯文本（或使用 `resolvedCustomPrompt` 表示已经加载的文本）。

模板源码与字面自定义提示词不能组合：在 `CreateAgentSessionOptions` 中，`systemPromptTemplate` 与 `customSystemPrompt` 冲突；在 `buildSystemPrompt` 中，它与 `customPrompt` / `resolvedCustomPrompt` 冲突。这些组合会明确报错，而不是静默选择其一。

## 完整替换面向提供方的内容（仅限编程 API） \{#full-provider-facing-replacement-programmatic-api-only}

`CreateAgentSessionOptions.systemPrompt` 是另一种更底层的编程 API。固定字符串或数组（包括空字符串或空数组）会替换所有 OMP 生成的块，并跳过未使用的系统提示词模板的发现/渲染。它不会跳过选项验证：同时定义 `systemPromptTemplate` 和 `customSystemPrompt` 会被拒绝，即使任一值为空，或 `systemPrompt` 为固定替换内容。回调则在正常模板/自定义组装完成后接收生成的块数组，并返回替换内容；该路径仍适用正常的模板发现和错误处理。两种形式都可以省略所有生成的上下文块和安全块。

`CreateAgentSessionOptions.systemPromptTemplate` 是上述组合式编程 API：它接受原始 Handlebars 源码，替换块 0，并保留 OMP 生成的页脚（上下文、当前仓库上下文、追加文本）、安全块和提供方工具模式。它与 `customSystemPrompt` 互斥。导出的 `buildSystemPrompt({ systemPromptTemplate })` 选项具有相同的原始文本约定和冲突行为；其 `customPrompt` 选项仍是按路径或字面值解析的纯文本。

CLI 标志和文件**不会**设置 `systemPrompt`：它们选择纯文本/模板自定义路径和追加路径，继续经过上述 OMP 生成的块。

## 速查 \{#quick-reference}

| 目标 | 用法 |
| --- | --- |
| 在保留完整默认提示词的同时添加指令 | `APPEND_SYSTEM.md` 或 `--append-system-prompt` |
| 用纯文本替换默认指令块 | `SYSTEM.md` 或 `--system-prompt` |
| 用 Handlebars 替换默认指令块 | `SYSTEM_TEMPLATE.md` 或 `--system-prompt-template <path>` |
| 为特定模型替换默认指令块 | `systemPromptTemplates` 设置，从 [`system-prompt.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/system/system-prompt.md) 的副本开始 |
| 通过编程 API 提供原始 Handlebars | `CreateAgentSessionOptions.systemPromptTemplate` 或 `buildSystemPrompt({ systemPromptTemplate })` |
| 替换所有面向提供方的系统块 | `CreateAgentSessionOptions.systemPrompt` |
| 自定义自动会话标题 | `TITLE_SYSTEM.md` |
| 替换个性块，同时保留默认提示词的其余部分 | `PERSONALITY.md` |
| 在纯文本用户文件中使用 `{{cwd}}` 或其他内部变量 | 不支持；纯文本用户内容原样插入 |
| 在模板中包含实时设置、工具清单或已挂载工具命令文档 | 引用相应的 Handlebars 字段，例如 `{{eagerTasks}}`、`{{toolInventory}}` 和 `{{toolCommandDocs}}` |
| 自动继承选定的默认模板部分 | 不支持；模板必须引用其所需的数据 |
| 按目录覆盖 | 支持的项目配置基目录；原生 `.omp` 和 `.agent` / `.agents` 自定义提示词也支持祖先目录发现 |
| 全局覆盖 | 当前原生智能体目录，或其他支持的用户配置基目录 |
