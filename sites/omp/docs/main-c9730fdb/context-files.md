---
title: "上下文文件"
description: "Oh My Pi 官方仓库文档：上下文文件。"
---

# 上下文文件 \{#context-files}

上下文文件是 Markdown 指令文件，`omp` 会在会话开始前自动发现它们，并将其注入智能体的项目上下文。可用它们记录仓库约定、架构说明、测试和审查要求，以及应随用户账号或项目携带的指令。

你无需要求智能体去读取 `AGENTS.md`、`CLAUDE.md` 或类似文件，会话开始时，相关文件就已被发现、加载并放入上下文。

## 上下文文件与其他概念的关系 \{#how-context-files-relate-to-other-concepts}

四个名称相近的概念，其行为各不相同。请分清它们：

- **上下文文件**以纯 Markdown 形式读取，并在生成的项目指令中展示给智能体（默认提示模板中位于 `<repo-rules>` 内）。它们是会话开始时的指令，也是仓库工作的背景。
- **常驻规则**来自顶层原生 `RULES.md`。它们被转换为始终应用的规则，每次请求都会携带其完整正文，因此即使可见对话不断增长，它们仍留在上下文中并保持约束力。参见下文“常驻规则与普通上下文”。
- **发现提供方**是配置来源适配器，知道各工具将文件存放在哪里。完整注册表为 `native`、`omp-plugins`、`claude`、`agent-plugins`、`codex`、`agents`、`claude-plugins`、`opencode`、`agents-md`、`claude-md`、`custom-context`、`mcp-json`、`ssh-json`、`ssh-config`、`skillshare`、`omp-managed` 和 `builtin-defaults`。其中只有一部分提供上下文文件（`native`、`claude`、`codex`、`opencode`、`agents`、`agents-md`、`claude-md`、`custom-context`）；其余提供规则、MCP 服务器、技能、命令、钩子、工具或 SSH 主机等其他能力。同一个提供上下文文件的提供方，也可能提供 MCP 服务器、斜杠命令、技能、钩子、工具、提示和设置。
- **模型提供方**是 `anthropic`、`openai`、`google`、`groq`、`ollama` 和 `openrouter` 等推理后端。它们与上下文文件没有关系，唯一的关联是两类 ID 共用一个 `disabledProviders` 列表，参见下文“禁用发现提供方”和[提供方](./providers.md)。

**技能**和**规则**文件（不同于常驻的 `RULES.md`）的编写方式见[技能](./skills.md)。通过 `SYSTEM.md` 自定义系统提示的方法见[系统提示自定义](./system-prompt-customization.md)。

## 原生 `.omp` 文件 \{#native-omp-files}

推荐新项目使用原生提供方格式。它从用户智能体目录和项目内的 `.omp/` 目录读取文件，且发现优先级最高，因此在同一作用域内，它的文件优先于所有其他约定。

| 文件 | 作用域 | 行为 |
| --- | --- | --- |
| `~/.omp/agent/AGENTS.md` | 用户 | 用户级上下文，除非禁用了 `native` 提供方。主会话和顾问会接收它；任务子代理不会接收，即使它们重新发现了额外的工作区根目录也一样。参见[按会话类型划分的输入](./system-prompt-customization.md#inputs-by-session-type)。 |
| `<nearest-non-empty-ancestor>/.omp/AGENTS.md` | 项目 | 项目上下文，但仅当从 cwd 向仓库根目录遍历时找到的**最近的非空 `.omp/` 目录**中存在 `AGENTS.md` 时才会加载。若最近的目录缺少此文件，OMP 不会继续查找更远的 `.omp/` 目录。主会话和顾问会接收它；任务子代理不会继承它。 |
| `~/.omp/agent/RULES.md` | 用户 | 用户级常驻规则内容。作为始终应用的规则加载，而不是作为上下文文件加载。 |
| `<nearest-non-empty-ancestor>/.omp/RULES.md` | 项目 | 项目常驻内容，但仅当遍历选中的同一个最近的非空 `.omp/` 目录中存在 `RULES.md` 时才会加载。 |

有两个重要细节：

- **最近的非空 `.omp/` 目录负责原生项目发现。**发现从当前工作目录开始，向仓库根目录逐级向上查找。一旦找到非空的 `.omp/`，就会停止；原生 `AGENTS.md` 和 `RULES.md` 均只从该目录读取。缺少文件不会让发现继续向上进行。
- **空目录和空文件不提供任何内容。**遍历时会跳过空的 `.omp/` 目录。在选中的非空目录内，空的 `AGENTS.md` 或 `RULES.md` 不提供任何内容。

`~/.omp/agent` 是当前原生智能体目录的简写。`PI_CODING_AGENT_DIR` 可将其迁移到其他位置。具名配置档案（`omp --profile <name>`、`OMP_PROFILE` 或 `PI_PROFILE`）默认使用 `~/.omp/profiles/<name>/agent`。

### 单体仓库示例 \{#monorepo-example}

```text
repo/
  .omp/
    AGENTS.md
    RULES.md
  packages/api/
    .omp/
      AGENTS.md
```

在 `repo/packages/api` 中启动会话时：

- 原生上下文文件是 `repo/packages/api/.omp/AGENTS.md`（最近的文件）。**不会**同时包含 `repo/.omp/AGENTS.md`。
- 由于 `repo/packages/api/.omp/` 是最近的非空原生目录，项目常驻内容只能来自 `repo/packages/api/.omp/RULES.md`。如果该文件不存在，**不会**使用 `repo/.omp/RULES.md`。

将广泛适用、长期有效的项目背景放在 `AGENTS.md` 中。将 `RULES.md` 留给简短、严格且在长对话中必须持续可见的要求。任务子代理会丢弃所有名为 `AGENTS.md` 的上下文文件，无论是从父级继承的，还是为额外工作区根目录发现的，但仍会获得 `RULES.md`，因此应将辅助智能体必须遵守的内容放在 `RULES.md` 中。过滤仅依据文件名：通过其他文件（例如 `CLAUDE.md`）中的 `@` 导入引入的 `AGENTS.md` 文本，以及 `AGENTS.local.md` 等 `contextFiles.extra` 文件，仍会传给子代理。

## 其他受支持的上下文约定 \{#other-supported-context-conventions}

`omp` 也会发现其他智能体工具的项目级上下文文件，让现有仓库无需迁移即可继续使用。它从不读取其他工具的主目录配置（`~/.claude`、`~/.codex`、`~/.config/opencode` 等）；用户级上下文仅来自原生智能体目录以及 `~/.agent` / `~/.agents`。如果你此前通过 `enabledProviders` 选择启用了这些来源，omp 会在首次交互式启动时提供一次性迁移，将你继承的内容复制或符号链接到 `~/.omp/agent`。

| 提供方 ID | 约定路径 | 作用域 | 说明 |
| --- | --- | --- | --- |
| `native` | `.omp/AGENTS.md` | 用户 + 项目 | 推荐的 OMP 格式。用户文件位于当前原生智能体目录；项目文件仅从向仓库根目录遍历时找到的最近的非空 `.omp/` 目录读取。 |
| `claude` | `.claude/CLAUDE.md` | 项目 | 仅限 `<cwd>/.claude/CLAUDE.md`（不向上遍历祖先目录）。 |
| `agents` | `.agent/AGENTS.md`、`.agents/AGENTS.md` | 用户 + 项目 | 用户文件来自 `~/.agent/` 和 `~/.agents/`；项目文件通过从当前目录向上遍历到仓库根目录来发现。 |
| `agents-md` | `AGENTS.md` | 项目 | 独立的（不位于配置目录内的）`AGENTS.md` 文件，通过从当前目录向上遍历到仓库根目录来发现；如果该仓库嵌套在用户主目录下，还会穿过外围工作区目录，直到主目录，但不包含主目录。没有仓库根目录时，对于位于主目录下的会话，发现以主目录为边界，并包含边界处的文件。父目录名以 `.` 开头的文件会被忽略，因为它们应归属配置目录提供方。 |
| `claude-md` | `CLAUDE.md` | 项目 | 独立的（不位于配置目录内的）`CLAUDE.md` 文件，通过从当前目录向上遍历到仓库根目录来发现；如果该仓库嵌套在用户主目录下，还会穿过外围工作区目录，直到主目录，但不包含主目录。没有仓库根目录时，对于位于主目录下的会话，发现以主目录为边界，并包含边界处的文件。父目录名以 `.` 开头的文件会被忽略，因为它们应归属配置目录提供方。 |
| `custom-context` | `contextFiles.extra` 中的名称 | 用户 + 项目 | 选择启用的基本文件名，例如 `AGENTS.local.md`。项目遍历方式与 `agents-md` 相同。此外还会检查用户智能体目录，以及会话位于链接工作树时的主检出根目录。以叠加方式加载：不占用也不遮蔽每个深度的单一名额。配置前为空。 |

标记为“（不向上遍历祖先目录）”的提供方，只查找当前工作目录的配置目录。如果需要向上遍历祖先目录，优先使用原生 `.omp/AGENTS.md` 格式，或独立的 `AGENTS.md` 或 `CLAUDE.md`（`agents-md` / `claude-md` 提供方），也可以从包含配置目录的目录启动 `omp`。

发现注册表还包含完全不提供上下文文件的提供方：`codex`（`<cwd>/.codex/config.toml` MCP 服务器和 `.codex/skills`）、`opencode`（`opencode.json[c]` MCP 服务器、`.opencode/skills`、`.opencode/commands`）、`mcp-json`（MCP 服务器）、`claude-plugins`（OMP 市场安装项、项目插件注册表、`--plugin-dir`：技能、命令、规则、钩子、工具、MCP 服务器）、`omp-plugins`（OMP 插件：技能、命令、规则、提示、钩子、工具、MCP 服务器）、`agent-plugins`（Agent Plugins 标准包：技能和 MCP 服务器）、`ssh-json`（SSH 主机）、`ssh-config`（来自 `~/.ssh/config` 和 `/etc/ssh/ssh_config` 的 `Host` 别名）、`skillshare`（使用 `omp skill install` 安装的注册表技能）、`omp-managed`（位于 `~/.omp/agent/managed-skills` 下的自动学习技能）和 `builtin-defaults`（内置默认规则）。这些提供方与规则及其他能力相关，也与下文共享的 `disabledProviders` 开关有关。

## 额外文件名 \{#extra-filenames}

内置发现只识别固定名称（`AGENTS.md`、`CLAUDE.md`）。将其他基本文件名列入 `contextFiles.extra`，即可同时加载它：

```yaml
# ~/.omp/agent/config.yml
contextFiles:
   extra:
      - AGENTS.local.md
```

也可在 `/settings` → **Context** → **Extra Context Files** 中编辑**全局**列表。输入 `["AGENTS.local.md", "TEAM.md"]` 这样的 JSON 数组即可；`[]` 会禁用全局额外文件，清空字段则会移除全局覆盖值。当项目配置（`.omp/config.yml`）设置了 `contextFiles.extra` 时，此行会隐藏，因此仓库的列表绝不会被复制到你的全局配置中；要更改它，请编辑或删除项目设置。启动新会话后会加载更新后的文件。

此列表默认为空。条目是文件名，不是路径，加载设置时会拒绝 `../AGENTS.local.md`，也会拒绝内置名称 `AGENTS.md` 和 `CLAUDE.md`（它们已有对应的提供方，列出它们会导致文件重复或绕过遮蔽）。这是硬编码的 `.local.md` 同级文件发现机制的可配置替代方案（[#12496](https://github.com/can1357/oh-my-pi/pull/12496)）：由你选择名称，未设置列表时不会发现任何内容。

每个名称的查找方式与独立的 `AGENTS.md` 相同（`agents-md` 遍历：从 cwd 向上到仓库根目录，采用相同的主目录边界）。父目录名以 `.` 开头的文件会被跳过。空文件不提供任何内容。

对每个名称还会检查另外两个位置：

- 当前用户智能体目录（`~/.omp/agent/<name>`，或配置档案 / `PI_CODING_AGENT_DIR` 目录），作为用户级文件。当生效列表来自项目配置（`.omp/config.yml`）时会跳过，因此仓库无法将你智能体目录中的 `config.yml` 等文件拉入提示。
- 当会话位于链接的 git 工作树中时，检查 `<primary-checkout>/<name>`。常规遍历在工作树的 `.git` 处停止，因此通过此机制可以找到只存在于主检出中、被 git 忽略的 `AGENTS.local.md`。仅检查主检出的根目录，不检查其中与你的 cwd 对应的目录。

额外文件不占用每个深度的单一作用域名额，也不会被占用该名额的文件遮蔽。`AGENTS.local.md` 会与 `AGENTS.md` 并行加载。在同一深度，额外文件在作用域胜出文件之后注入，因此两者中它更加突出。额外文件中的 `@` 导入相对于该文件自身的目录解析。

使用 `disabledExtensions`（`context-file:project:AGENTS.local.md` 或 `context-file:user:AGENTS.local.md`）可关闭某个名称。使用 `disabledProviders: [custom-context]` 可关闭此提供方。与所有数组设置一样，高优先级层会替换列表，而不是向其追加。

## 加载顺序与遮蔽 \{#load-order-and-shadowing}

当两个提供方描述_同一_作用域时，优先级更高的提供方胜出。完整注册表优先级如下：

| 优先级 | 提供方 ID |
| ---: | --- |
| 100 | `native` |
| 90 | `omp-plugins` |
| 80 | `claude` |
| 75 | `agent-plugins` |
| 70 | `agents`、`claude-plugins`、`codex` |
| 55 | `opencode` |
| 10 | `agents-md` |
| 10 | `claude-md` |
| 9 | `custom-context` |
| 5 | `mcp-json`、`ssh-json` |
| 3 | `ssh-config` |
| 1 | `builtin-defaults` |

然后按作用域对发现的文件去重：

- **所有提供方合计保留一个用户上下文文件。**由于 `native` 优先级最高，`~/.omp/agent/AGENTS.md` 会遮蔽所有其他用户级上下文文件。
- **额外文件名不使用此名额。**来自 `contextFiles.extra` 的文件会与作用域胜出文件并行加载。参见[额外文件名](#extra-filenames)。
- **每个目录深度保留一个项目上下文文件。**深度从当前目录开始计算：cwd 为深度 0，其父目录为深度 1，依此类推。祖先目录的配置子目录（`.claude/`、`.omp/` 等）与该祖先目录计为相同深度。
- **在同一深度，优先级更高的提供方会遮蔽其余提供方。**
- **跨深度时，多个文件会保留。**在单体仓库中，祖先目录的 `AGENTS.md` 和包级文件处于不同深度，因此两者都会加载。
- **导入展开后会折叠被包含的文件。**当后面的、更近的文件连续包含较远祖先文件的全部规范化段落序列时，会省略该祖先文件。这包括完全相同的副本；改写过或交错排列的段落不会被视为重复。在此包含关系检查中，没有深度的用户文件排在项目文件之前，因此匹配的项目副本会保留。

最终注入顺序是**先注入保留下来的用户作用域文件**，然后是较远的项目祖先文件，再是更接近 cwd 的项目文件。越晚的文件越靠近生成上下文的末尾，也越突出。

### 遮蔽的完整示例 \{#worked-shadowing-example}

```text
repo/
  AGENTS.md
  packages/api/
    AGENTS.md
    .claude/CLAUDE.md
```

从 `repo/packages/api` 启动时：

- `agents-md` 在深度 2 找到 `repo/AGENTS.md`，并将其保留。
- `repo/packages/api/AGENTS.md`（`agents-md`，优先级 10）和 `repo/packages/api/.claude/CLAUDE.md`（`claude`，优先级 80）都解析为深度 0。Claude 的优先级更高，遮蔽了包级独立 `AGENTS.md`，因此 Claude 文件在该深度胜出。
- 保留的两个文件按根目录在先、包在后的顺序排列，因此 `packages/api` 的文件更突出。
- 如果加入 `repo/packages/api/.omp/AGENTS.md`，`native`（优先级 100）会直接在深度 0 胜出，遮蔽两个优先级较低的文件。

## 注入行为 \{#injection-behavior}

发现的上下文文件会作为一个 `<repo-rules>` 块注入，每个保留下来的文件对应一个 `<file>` 元素，按上述顺序排列。该块位于末尾的 `<project-context>` 系统块中，在静态系统提示之后，与所有其他从工作目录派生的部分（`<dir-context>`、`<workspace-tree>`、`<workspace-roots>`）放在一起，因此不同目录中的会话可将静态提示作为缓存前缀共享：

```xml
<repo-rules>
MUST follow these context files for all tasks:
<file path="/abs/path/to/repo/AGENTS.md">
...root content...
</file>
<file path="/abs/path/to/repo/packages/api/.claude/CLAUDE.md">
...package content...
</file>
</repo-rules>
```

当 `SYSTEM.md` 选择内置自定义提示模板或自定义模板时，也会生成相同的末尾块。在每种模式下，智能体都能看到各文件的绝对路径和完全展开的 Markdown 内容（`@` 导入已解析）。

加载是自动的，无需在会话期间指示智能体搜索 `AGENTS.md`、`CLAUDE.md` 或类似文件。

启用工作区树扫描（`includeWorkspaceTree`）时，_未_自动加载的更深层目录中的 `AGENTS.md` 文件（例如当前目录下方的文件），会在单独的 `<dir-context>` 块中呈现；该块列出其路径，并告知智能体在编辑这些目录前先读取它们。这些文件以指针形式呈现，而非注入完整内容。

`<workspace-tree>` 和 `<dir-context>` 背后的工作区扫描是一份快照：在启动时采集，并在会话目录更改（`/move`，或从另一个项目恢复会话）或开始新对话（`/clear`、`/new`）时重新采集。它不会跟随对话中的文件编辑或分支检出而更新；在同一目录中恢复会话时也会保留，因此现有对话的提示前缀仍可缓存。

## `@` 导入 \{#-imports}

在任意上下文文件中，`@path` 标记会在注入前，内联展开为所引用文件的内容：

```markdown
# Project notes

Read @docs/architecture.md before changing storage code.
Shared release steps live in @../RELEASE.md and personal aliases in @~/.notes/aliases.md.
```

具体规则：

- **相对路径从导入文件自身的目录解析**，而不是会话的工作目录。
- **`~/` 和 `~`** 从用户主目录解析；绝对路径按原样使用。
- **围栏代码块和行内代码片段中的标记保持不变**，这适用于你想_描述_ `@token` 而不展开它的情况。
- **`git@github.com:org/repo.git` 和 `user@example.com` 形式的标记不会被当作导入。**只有当 `@` 位于行首，或空格、制表符之后时，标记才算导入。
- **路径末尾的句子标点会被裁去**（`. , ; : ! ? ) ] } " '`），因此 `@docs/setup.md.` 导入的是 `docs/setup.md`。
- **导入最多递归五跳。**被导入的文件自身也可包含 `@` 导入，总深度最多为五。
- **重复导入和循环会被跳过。**已经拉入当前展开树的文件不会再次展开，即使从另一个分支导入也是如此；后续的 `@token` 会保留为字面文本。
- **目标缺失或不可读时，会保留原始 `@token` 文本**，而不是报错。

## 常驻规则与普通上下文 \{#sticky-rules-vs-normal-context}

大部分指导内容使用普通上下文文件（`AGENTS.md`、`CLAUDE.md`、`.claude/CLAUDE.md` 等）：仓库概览、代码风格、构建和测试命令、审查要求以及本地约定。它们会加载到开场时生成的项目上下文中。

对于少量严格要求，如果它们必须在长对话已将开场上下文推到会话记录上方很远的位置后仍持续生效，应使用顶层 **`RULES.md`**：

```markdown
# ~/.omp/agent/RULES.md

Never commit or push unless the user explicitly asks.
Do not edit generated files.
```

`RULES.md` 的特殊之处在于：

- 它**仅**在原生位置读取：当前用户智能体目录，以及从 cwd 向仓库根目录遍历时选中的最近的非空项目 `.omp/` 目录。如果该项目目录没有 `RULES.md`，OMP 不会回退到更远的 `.omp/RULES.md`。
- 它作为**始终应用的规则**加载，而不是作为上下文文件，因此每次请求都会携带其完整正文，绝不会降为按需加载的规则手册条目，并会在长会话中持续保持约束力。默认情况下，它随系统提示传送；对于启用了 `snapcompact.systemPrompt` 图像化的视觉模型，系统提示（包括此规则）也可能改以附加图像帧传送，但无论哪种方式，正文都会随请求发送。
- 会话启动以及 `/clear` 和 `/new` 等会话级重建时，会从磁盘重新发现它，因此在 OMP 运行期间创建或编辑它，会在下一次重置时生效，无需重启。
- 它**始终常驻**：frontmatter 无法使其变为非常驻。如果需要条件式或选择启用的行为，请改为编写普通规则文件（参见[技能](./skills.md)）。
- 用户和项目候选项使用不同的规则名：`RULES` 和 `RULES@project`。两者可以一起加载。规则去重基于名称，因此请避免让普通规则使用这些名称：原生普通规则加载更早，可能会遮蔽常驻候选项。
- 如果始终应用的内容已出现在自定义提示、追加文本或上下文文件中，生成的始终应用部分会通过规范化段落包含关系检查省略这些内容；内容仍会随包含它的来源传送。

保持 `RULES.md` 简短。较长背景应放在 `AGENTS.md` 中；生成的上下文和始终应用的规则都会占用请求中的系统提示上下文。

## 禁用发现提供方 \{#disabling-discovery-providers}

通过 `~/.omp/agent/config.yml`、项目的 `.omp/config.yml` 或 `--config` 叠加配置中的 `disabledProviders` 设置，可以关闭某个提供方：

```yaml
# .omp/config.yml
disabledProviders:
   - claude
   - codex
```

`disabledProviders` 是一个**共用同一 ID 命名空间的整提供方开关**，由两个互不相关的子系统使用：

| ID 类型 | 示例 | 列入后的效果 |
| --- | --- | --- |
| 发现提供方 ID | `native`、`claude`、`codex`、`opencode`、`agents`、`agents-md`、`claude-md`、`custom-context` | 移除整个配置来源，不仅包括其上下文文件，还包括它原本会提供的任何 MCP 服务器、斜杠命令、技能、钩子、工具、提示和设置。 |
| 模型提供方 ID | `anthropic`、`openai`、`google`、`groq`、`ollama`、`openrouter` | 即使存在凭据，也会从可选项中移除该模型后端。参见[提供方](./providers.md)。 |

ID 是精确匹配的，这两个命名空间不会意外冲突：`google` 禁用 Google 模型后端，而 `claude` 禁用 Claude 的发现文件。禁用发现提供方的影响比看起来更广，例如禁用 `claude` 还会移除由 Claude 发现的 MCP 服务器、命令、技能、钩子、工具和设置，而不仅是 `CLAUDE.md`。若只想移除上下文文件，并保留该提供方提供的其他所有内容，请改用 [`disabledExtensions`](#disabling-a-single-context-file)。

只有 `enabledModels` 和 `disabledProviders` 支持**按路径限定作用域**的条目，因此可按子树改变提供方可用性：

```yaml
disabledProviders:
   - codex # disabled everywhere
   - path: ~/work/legacy-claude
     providers:
        - claude # disabled only under this directory
```

当 cwd 等于配置路径或位于其下方时，作用域条目生效；`~` 会展开为主目录。纯字符串条目在所有位置生效。

请记住，优先级更高的设置层会**替换**数组设置，而不是向其追加。如果全局配置禁用了 `claude`，但项目配置设置了 `disabledProviders: [codex]`，那么在该项目内，Claude 发现会重新启用，只有 Codex 被禁用。完整的层级优先级、合并规则以及路径作用域数组的详细信息，见[设置](./settings.md)。

## 禁用单个上下文文件 \{#disabling-a-single-context-file}

`disabledProviders` 会移除整个配置来源。若要移除一个上下文文件并保留其提供方提供的其余内容，请将其扩展 ID 列入 `disabledExtensions`：

```yaml
# ~/.omp/agent/config.yml, .omp/config.yml, or a --config overlay
disabledExtensions:
   - context-file:project:CLAUDE.md
```

上下文文件 ID 的形式为 `context-file:<level>:<basename>`，其中 `<level>` 为 `user` 或 `project`，`<basename>` 是不含目录部分的文件名：

| ID | 禁用内容 |
| --- | --- |
| `context-file:project:CLAUDE.md` | 所有项目级 `CLAUDE.md`，而 Claude 的 MCP 服务器、命令和技能仍继续加载。 |
| `context-file:project:AGENTS.md` | 遍历所到达的每个目录深度中的**所有**项目级 `AGENTS.md`，此 ID 不携带深度。 |
| `context-file:user:AGENTS.md` | 所有名为 `AGENTS.md` 的用户级文件，无论由哪个提供方提供。 |

匹配仅依据级别和文件名，因此一个条目会覆盖所有在该级别提供同名文件的提供方，项目条目也无法缩小到单一深度。需要逐目录控制时，请在应有差异的子树中使用项目 `.omp/config.yml`，或使用上述按路径限定作用域的 `disabledProviders` 形式。

禁用不等于遮蔽，差异是可见的：禁用文件在去重之前就被丢弃，因此不会占用其作用域。**它原本遮蔽的文件会加载到其位置。**在同时拥有 `.claude/CLAUDE.md` 和 `AGENTS.md` 的项目中，`CLAUDE.md` 通常会赢得深度 0 的作用域；禁用 `context-file:project:CLAUDE.md` 后，`AGENTS.md` 会成为项目上下文，而不是让作用域变空。若要让该作用域完全没有文件，请禁用每个候选名称。

两个常见用途：

- **非交互式运行。**为你自己的交互式会话编写的用户级上下文文件，通常不适用于由另一个程序驱动的 `-p` 运行，因为这种运行会自带指令。在 `--config` 叠加配置中禁用它，可使你的交互式设置保持不变。
- **委派工作。**当一个智能体驱动另一个智能体时，调用方自身的操作指令会以用户级上下文的形式进入被调用方的提示，可能与其实际收到的任务相矛盾。

`disabledExtensions` 不按路径限定作用域：只有 `enabledModels`、`disabledProviders`、`bash.patterns` 和 `bashInterceptor.patterns` 接受 `path:` 形式。与其他数组设置一样，它会被优先级更高的层替换，而不是合并。

可通过 `/extensions` 交互式浏览这些 ID，它会列出每个已发现上下文文件的级别、来源和当前状态，并切换同一个设置。

## 故障排查 \{#troubleshooting}

### 文件未加载 \{#a-file-is-not-loaded}

- 原生项目上下文仅从最近的非空 `.omp/` 目录读取。该目录必须包含非空的 `AGENTS.md`；否则发现不会继续查找更远的原生目录。
- 独立的 `CLAUDE.md` 由 `claude-md` 处理，而不是 `native`。
- `.claude/CLAUDE.md` 仅从当前工作目录的配置目录读取，不会从每个祖先目录读取。
- 其他工具的主目录文件（`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md` 等）从不读取。请将其中的指导内容移到 `~/.omp/agent/AGENTS.md`。
- 对原生和独立文件提供方而言，空文件不提供任何内容。
- 被禁用的发现提供方不提供任何内容，请检查全局、项目和 `--config` 各层中的 `disabledProviders`。
- 单个文件也可以单独关闭，请检查 `disabledExtensions` 中是否有匹配的 `context-file:<level>:<basename>` 条目，并记住项目条目在所有深度生效。若这是原因，`/extensions` 会将该文件显示为 `disabled`。
- 不为 `AGENTS.md` 或 `CLAUDE.md` 的名称，只有列入 `contextFiles.extra` 后才会被发现。除非设置了该选项，否则链接工作树看不到主检出中的副本；常规遍历会在工作树处停止。

### 错误的文件胜出 \{#the-wrong-file-wins}

在同一用户作用域或项目深度，优先级更高的提供方会遮蔽其他提供方（native > claude > agents > agents-md > claude-md）。要强制实现确定性行为，可将指导内容移到 `.omp/AGENTS.md`（native 始终胜出），或禁用竞争的发现提供方。

### 用户上下文消失 \{#user-context-disappeared}

只会保留一个用户级上下文文件，且 `~/.omp/agent/AGENTS.md` 优先级最高；它会遮蔽 `~/.agent`/`~/.agents` 文件。其他工具的用户级文件（`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md` 等）完全不会被读取；请将其中的指导内容整合到原生文件中。

### `RULES.md` 文件被忽略 \{#a-rulesmd-file-is-ignored}

只有原生 `RULES.md` 位置的内容才会常驻：当前用户智能体目录，以及从 cwd 向仓库根目录查找时选中的最近的非空项目 `.omp/` 目录。如果存在更近的非空 `.omp/` 目录，它会阻止查找更远的原生目录，即使其中没有 `RULES.md` 也是如此。其他位置的 `RULES.md` 不属于可识别的约定。

### `@` 导入未展开 \{#an--import-did-not-expand}

确认目标相对于导入文件（而非 cwd）存在。围栏代码块或行内代码片段中的导入有意保留为字面文本，`git@`/看起来像电子邮件的标记从不导入，循环会被跳过，展开在五跳后停止，缺失目标会让原始 `@path` 文本保持不变。
