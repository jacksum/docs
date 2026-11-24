---
title: "上下文文件"
description: "Oh My Pi v19.1.1 仓库文档：上下文文件。"
---

# 上下文文件 \{#context-files}

上下文文件是 Markdown 指令文件。`omp` 会在会话启动前自动发现这些文件，并将它们注入智能体的项目上下文。可以用这些文件记录仓库约定、架构说明、测试和审查要求，以及应随用户账号或项目保留的指令。

无需让智能体自行读取 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 等文件。会话开始时，相关文件已被发现、加载并放入上下文。

## 上下文文件与相关概念 \{#how-context-files-relate-to-other-concepts}

以下四种概念名称相近，行为不同：

- **上下文文件**按普通 Markdown 读取，并通过生成的项目指令提供给智能体。默认提示词模板将它们放在 `<repo-rules>` 内。这些文件提供会话开始时要遵循的指令，以及在仓库中工作的背景。
- **常驻规则**来自原生顶层 `RULES.md`。OMP 将其转换为始终应用的规则，在每次请求中携带完整正文。即使可见的对话继续增长，规则也会留在上下文中并继续生效。见下文「常驻规则与普通上下文」。
- **发现提供程序**是配置来源适配器，了解各工具将文件保存在何处。完整注册列表包括 `native`、`omp-plugins`、`claude`、`agent-plugins`、`codex`、`agents`、`claude-plugins`、`gemini`、`opencode`、`cursor`、`windsurf`、`cline`、`github`、`vscode`、`agents-md`、`claude-md`、`custom-context`、`mcp-json`、`ssh-json`、`ssh-config` 和 `builtin-defaults`。其中只有 `native`、`claude`、`codex`、`gemini`、`opencode`、`github`、`agents`、`agents-md`、`claude-md`、`custom-context` 提供上下文文件；其余提供规则、MCP 服务器、技能、命令、钩子、工具或 SSH 主机等能力。提供上下文文件的同一提供程序还可以提供 MCP 服务器、斜杠命令、技能、钩子、工具、提示词和设置。
- **模型提供方**是推理后端，例如 `anthropic`、`openai`、`google`、`groq`、`ollama` 和 `openrouter`。模型提供方不处理上下文文件，但它的 ID 和发现提供程序的 ID 共用同一个 `disabledProviders` 列表。见下文「禁用发现提供程序」和[模型提供方](./providers.md)。

如何编写**技能**和**规则**文件（不同于常驻 `RULES.md`），见[技能](./skills.md)。如何用 `SYSTEM.md` 定制系统提示词，见[系统提示词定制](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md)。

## 原生 `.omp` 文件 \{#native-omp-files}

新项目推荐使用原生提供程序的格式。它从用户智能体目录和项目内的 `.omp/` 目录读取文件。它的发现优先级最高，因此在相同作用域，其文件优先于其他约定。

| 文件 | 作用域 | 行为 |
| --- | --- | --- |
| `~/.omp/agent/AGENTS.md` | 用户 | 用户级上下文，除非禁用了 `native` 提供程序。主会话和顾问会收到此文件，任务子代理不会收到，即使它们为额外的工作区根目录重新进行发现。见[按会话类型提供的输入](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md#inputs-by-session-type)。 |
| `<nearest-non-empty-ancestor>/.omp/AGENTS.md` | 项目 | 项目级上下文，仅当从当前工作目录向仓库根目录查找时，**最近的非空 `.omp/` 目录**中存在 `AGENTS.md` 才会加载。如果最近的目录缺少该文件，OMP 不会继续查找更远的 `.omp/` 目录。主会话和顾问会收到此文件，任务子代理不会继承。 |
| `~/.omp/agent/RULES.md` | 用户 | 用户级常驻规则内容，按始终应用的规则加载，不按上下文文件加载。 |
| `<nearest-non-empty-ancestor>/.omp/RULES.md` | 项目 | 项目级常驻内容，仅当同一次向上查找选定的最近非空 `.omp/` 目录中存在 `RULES.md` 才会加载。 |

原生项目发现遵循以下两条规则：

- **最近的非空 `.omp/` 目录决定原生项目发现的范围。** 发现从当前工作目录向仓库根目录查找。找到非空的 `.omp/` 后即停止，只从该目录读取原生 `AGENTS.md` 和 `RULES.md`。缺少文件时也不会继续向上查找。
- **空目录和空文件不提供内容。** 查找时跳过空的 `.omp/` 目录。选中的非空目录里，空的 `AGENTS.md` 或 `RULES.md` 不提供任何内容。

`~/.omp/agent` 是当前生效的原生智能体目录的简称。`PI_CODING_AGENT_DIR` 可改变其位置。命名配置档案（`omp --profile <name>`、`OMP_PROFILE` 或 `PI_PROFILE`）默认使用 `~/.omp/profiles/<name>/agent`；`~/.claude` 等外部工具的用户根目录不随配置档案变化。

### Monorepo 示例 \{#monorepo-example}

```text
repo/
  .omp/
    AGENTS.md
    RULES.md
  packages/api/
    .omp/
      AGENTS.md
```

在 `repo/packages/api` 中启动会话：

- 原生上下文文件是最近的 `repo/packages/api/.omp/AGENTS.md`。**不会**同时纳入 `repo/.omp/AGENTS.md`。
- 由于 `repo/packages/api/.omp/` 是最近的非空原生目录，项目级常驻内容只能来自 `repo/packages/api/.omp/RULES.md`。如果该文件不存在，**不会**使用 `repo/.omp/RULES.md`。

将通用且长期有效的项目背景放在 `AGENTS.md`。将简短且必须在长对话中始终可见的硬性要求放在 `RULES.md`。任务子代理会丢弃所有名为 `AGENTS.md` 的上下文文件，无论它们来自父会话还是额外工作区根目录的发现，但仍会收到 `RULES.md`。因此，子代理必须遵循的要求应放在 `RULES.md`。该筛选只按文件名执行。通过 `@` 从其他文件（例如 `CLAUDE.md`）导入的 `AGENTS.md` 文本，以及 `contextFiles.extra` 中的 `AGENTS.local.md` 等文件仍会传给子代理。

## 其他受支持的上下文约定 \{#other-supported-context-conventions}

`omp` 也会发现其他智能体工具的上下文和规则文件，因此现有项目无需迁移即可继续使用。

外部工具的**用户级**来源（下表中的 `claude`、`codex`、`gemini`、`opencode` 和 `github`）需要通过 `enabledProviders` 显式启用；它们的项目级文件仍默认启用。原生来源和 `.agent`、`.agents` 用户来源默认启用。显式设置 `CLAUDE_CONFIG_DIR` 也会启用 Claude 用户级发现，并改变其用户根目录。例如：

```yaml
enabledProviders:
   - claude
   - github
```

`"*"` 或 `"all"` 可启用所有外部用户级来源。`disabledProviders` 的优先级仍更高。

| 提供程序 ID | 约定路径 | 作用域 | 说明 |
| --- | --- | --- | --- |
| `native` | `.omp/AGENTS.md` | 用户和项目 | 推荐的 OMP 格式。用户文件从当前生效的原生智能体目录读取；项目文件只从朝仓库根目录查找时遇到的最近非空 `.omp/` 目录读取。 |
| `claude` | `.claude/CLAUDE.md` | 用户和项目 | 用户文件是 `~/.claude/CLAUDE.md`；项目文件仅为 `<cwd>/.claude/CLAUDE.md`，不向上查找。 |
| `codex` | `.codex/AGENTS.md` | 用户 | 用户文件仅为 `~/.codex/AGENTS.md`。项目级 Codex 上下文由 `agents-md` 提供程序从独立的 `AGENTS.md` 加载，不是从 `<cwd>/.codex/AGENTS.md` 加载。 |
| `gemini` | `.gemini/GEMINI.md` | 用户和项目 | 用户文件是 `~/.gemini/GEMINI.md`；项目文件仅为 `<cwd>/.gemini/GEMINI.md`，不向上查找。 |
| `opencode` | `.config/opencode/AGENTS.md` | 用户 | 用户文件仅为 `~/.config/opencode/AGENTS.md`。 |
| `github` | `.github/copilot-instructions.md` | 用户和项目 | 项目文件仅为 `<cwd>/.github/copilot-instructions.md`，不向上查找。另支持用户级 `~/.copilot/copilot-instructions.md`，可用 `COPILOT_HOME` 改变其位置。用户作用域也会考虑 `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` 提供的 `AGENTS.md` 候选文件，遵循每个用户只保留一个文件的常规去重规则。 |
| `agents` | `.agent/AGENTS.md`、`.agents/AGENTS.md` | 用户和项目 | 用户文件来自 `~/.agent/` 和 `~/.agents/`；项目文件从当前目录向仓库根目录查找。 |
| `agents-md` | `AGENTS.md` | 项目 | 从当前目录向仓库根目录查找独立的 `AGENTS.md` 文件，不包括配置目录下的同名文件。如果该仓库位于用户主目录下，则继续查找外层工作区目录，直到主目录，但不含主目录。如果没有仓库根目录，对于位于主目录下的会话，以主目录为边界，并纳入该处的文件。忽略父目录名以 `.` 开头的文件。这些文件由配置目录提供程序处理。 |
| `claude-md` | `CLAUDE.md` | 项目 | 从当前目录向仓库根目录查找独立的 `CLAUDE.md` 文件，不包括配置目录下的同名文件。如果该仓库位于用户主目录下，则继续查找外层工作区目录，直到主目录，但不含主目录。如果没有仓库根目录，对于位于主目录下的会话，以主目录为边界，并纳入该处的文件。忽略父目录名以 `.` 开头的文件。这些文件由配置目录提供程序处理。 |
| `custom-context` | `contextFiles.extra` 中的文件名 | 用户和项目 | 显式选择 `AGENTS.local.md` 等不含目录的文件名。项目查找方式与 `agents-md` 相同，也会查找用户智能体目录。当会话位于关联工作树中时，还会查找主检出根目录。它以追加方式加载，不占用或遮蔽每个深度只保留一个文件的位置。未配置时为空。 |
| `github` | `.github/instructions/**/*.instructions.md` | 项目规则 | GitHub Copilot 或 VS Code 指令文件会转换为规则。`applyTo: '*'`、`applyTo: '**'` 或 `applyTo: '**/*'` 会作为始终应用的内容注入。其他 `applyTo` glob 会在需要时连同生成的描述列入规则簿，可通过 `rule://<name>` 读取。缺少 `applyTo` 时也会创建规则簿条目，并发出发现警告。 |

标明「不向上查找」的提供程序只检查当前工作目录下的配置目录。需要向上查找时，建议使用原生 `.omp/AGENTS.md` 格式或独立的 `AGENTS.md`、`CLAUDE.md`（`agents-md` 或 `claude-md` 提供程序），也可以从包含配置目录的目录启动 `omp`。

发现注册表还包含完全不提供上下文文件的来源：`cursor`（`.cursor/rules/*.mdc` 和旧版 `.cursorrules` 规则，以及 MCP 服务器和设置）、`windsurf`（`.windsurf/rules/*.md`、旧版 `.windsurfrules`、全局 Windsurf 规则和 MCP 服务器）、`cline`（`.clinerules` 规则）、`vscode` 和 `mcp-json`（MCP 服务器）、`claude-plugins`（Claude 市场插件，包括技能、命令、规则、钩子、工具、MCP 服务器）、`omp-plugins`（OMP 插件，包括技能、命令、规则、提示词、钩子、工具、MCP 服务器）、`agent-plugins`（Agent Plugins 标准包，包括技能和 MCP 服务器）、`ssh-json`（SSH 主机）、`ssh-config`（`~/.ssh/config` 和 `/etc/ssh/ssh_config` 中的 `Host` 别名）以及 `builtin-defaults`（内置默认规则）。这些来源会影响规则及其他能力，也受下文所述的共享 `disabledProviders` 开关控制。

## 额外文件名 \{#extra-filenames}

内置发现只识别固定名称（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`copilot-instructions.md`）。若需要加载其他文件名，在 `contextFiles.extra` 中列出不含目录的文件名：

```yaml
# ~/.omp/agent/config.yml
contextFiles:
   extra:
      - AGENTS.local.md
```

也可以在 `/settings` → **Context** → **Extra Context Files** 编辑**全局**列表。输入 `["AGENTS.local.md", "TEAM.md"]` 之类的 JSON 数组。`[]` 禁用全局额外文件，清空输入框则移除全局覆盖项。如果项目配置（`.omp/config.yml`）设置了 `contextFiles.extra`，界面会隐藏这一行，避免将仓库的列表复制到全局配置。编辑或移除项目设置可更改该列表。启动新会话以加载更新后的文件。

列表默认为空。条目是文件名，不是路径。加载设置时会拒绝 `../AGENTS.local.md`，也会拒绝内置名称 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 和 `copilot-instructions.md`。内置名称已有各自的提供程序，重复列出可能重复加载文件或绕过遮蔽行为。这是固定查找 `.local.md` 同级文件的可配置替代方案（[#12496](https://github.com/can1357/oh-my-pi/pull/12496)）。由用户选择名称，未设置列表时不会发现任何额外文件。

每个名称都按查找独立 `AGENTS.md` 的方式发现：使用 `agents-md` 从当前工作目录向上查找到仓库根目录，沿用相同的用户主目录边界。跳过父目录名以 `.` 开头的文件。空文件不提供任何内容。

还会为每个名称检查两个位置：

- 当前生效的用户智能体目录（`~/.omp/agent/<name>`，或配置档案或 `PI_CODING_AGENT_DIR` 指定的目录），作为用户级文件。如果生效列表来自项目配置（`.omp/config.yml`），则跳过此位置，防止仓库将用户智能体目录中的 `config.yml` 等文件带入提示词。
- 如果会话位于关联 Git 工作树中，还会检查 `<primary-checkout>/<name>`。常规查找在工作树的 `.git` 处停止，因此这里可以发现仅在主检出存在且被 Git 忽略的 `AGENTS.local.md`。只检查主检出的根目录，不检查其中与当前工作目录对应的位置。

额外文件不占用每个深度只保留一个文件的作用域位置，也不被占用该位置的文件遮蔽。`AGENTS.local.md` 与 `AGENTS.md` 可以同时加载。同一深度中，额外文件在该作用域中优先级最高的文件之后注入，因此位置更靠后。额外文件中的 `@` 导入相对于该文件所在目录解析。

要禁用某一个名称，可用 `disabledExtensions`（`context-file:project:AGENTS.local.md` 或 `context-file:user:AGENTS.local.md`）。要禁用整个提供程序，可用 `disabledProviders: [custom-context]`。与其他数组设置一样，优先级较高的层会替换整个列表，不会追加条目。

## 加载顺序与遮蔽 \{#load-order-and-shadowing}

两个提供程序对应 *同一* 作用域时，优先级较高者生效。完整的注册优先级如下：

| 优先级 | 提供程序 ID |
| ---: | --- |
| 100 | `native` |
| 90 | `omp-plugins` |
| 80 | `claude` |
| 75 | `agent-plugins` |
| 70 | `agents`、`claude-plugins`、`codex` |
| 60 | `gemini` |
| 55 | `opencode` |
| 50 | `cursor`、`windsurf` |
| 40 | `cline` |
| 30 | `github` |
| 20 | `vscode` |
| 10 | `agents-md` |
| 10 | `claude-md` |
| 9 | `custom-context` |
| 5 | `mcp-json`、`ssh-json` |
| 3 | `ssh-config` |
| 1 | `builtin-defaults` |

随后按作用域对发现的文件去重：

- **所有提供程序合计只保留一个用户上下文文件。** `native` 优先级最高，因此 `~/.omp/agent/AGENTS.md` 遮蔽所有其他用户级上下文文件。
- **额外文件不占用这个位置。** `contextFiles.extra` 提供的文件与该作用域中优先级最高的文件一起加载。见[额外文件名](#extra-filenames)。
- **每个目录深度保留一个项目上下文文件。** 深度从当前目录计算：当前工作目录是深度 0，父目录是深度 1，依此类推。祖先目录下的配置子目录（`.claude/`、`.github/`、`.gemini/` 等）与它所在的祖先目录有相同深度。
- **深度相同时，优先级较高的提供程序遮蔽其余提供程序。**
- **深度不同时，可以保留多个文件。** 在 monorepo 中，祖先目录的 `AGENTS.md` 和包级文件在不同深度，都会加载。
- **展开导入后合并被包含的文件。** 如果顺序靠后且距离更近的文件连续包含较远祖先文件归一化后的完整段落序列，则省略祖先文件。这包括内容相同的副本；改写或交错的段落不视为重复。进行包含关系检查时，无深度的用户级文件排在项目级文件之前，因此匹配的项目副本会被保留。

最终的注入顺序为**先放保留的用户作用域文件**，再放距离较远的项目祖先文件，最后放距离当前工作目录较近的项目文件。后加载的文件更靠近生成上下文的末尾，因此位置更显著。

### 遮蔽示例 \{#worked-shadowing-example}

```text
repo/
  AGENTS.md
  packages/api/
    AGENTS.md
    .github/copilot-instructions.md
```

在 `repo/packages/api` 中启动：

- `agents-md` 在深度 2 发现并保留 `repo/AGENTS.md`。
- `repo/packages/api/AGENTS.md`（`agents-md`，优先级 10）和 `repo/packages/api/.github/copilot-instructions.md`（`github`，优先级 30）都处于深度 0。GitHub 的优先级较高，遮蔽包级独立 `AGENTS.md`，因此该深度保留 Copilot 文件。
- 两个保留文件先根目录、后包目录排列，因此 `packages/api` 的文件更靠后。
- 如果添加 `repo/packages/api/.omp/AGENTS.md`，`native`（优先级 100）会在深度 0 胜出，遮蔽两个优先级较低的文件。

## 注入行为 \{#injection-behavior}

发现的上下文文件以一个 `<repo-rules>` 块注入，每个保留的文件按上述顺序对应一个 `<file>` 元素。此块位于静态系统提示词之后、尾部的 `<project-context>` 系统块内，与其他根据工作目录生成的部分（`<dir-context>`、`<workspace-tree>`、`<workspace-roots>`）放在一起。因此不同目录的会话可以共用静态提示词作为缓存前缀：

```xml
<repo-rules>
MUST follow these context files for all tasks:
<file path="/abs/path/to/repo/AGENTS.md">
...root content...
</file>
<file path="/abs/path/to/repo/packages/api/.github/copilot-instructions.md">
...package content...
</file>
</repo-rules>
```

当 `SYSTEM.md` 选择内置的自定义提示词模板或自定义模板时，也会生成同一个尾部块。在所有模式中，智能体看到的是每个文件的绝对路径和完整展开的 Markdown 内容（`@` 导入已解析）。

加载由 OMP 自动完成。会话中无需让智能体查找 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.cursorrules` 等文件。

启用工作区树扫描（`includeWorkspaceTree`）时，*未*自动加载的更深目录下的 `AGENTS.md`（例如当前目录下层的文件）会单独出现在 `<dir-context>` 块内。此块列出它们的路径，并提示智能体在编辑对应目录前先读取。这些条目是文件指引，不会注入完整内容。

`<workspace-tree>` 和 `<dir-context>` 所依据的工作区扫描是一份快照。OMP 在启动时扫描；会话更改目录（`/move` 或从其他项目恢复会话）或开始新对话（`/clear`、`/new`）时重新扫描。对话中的文件编辑或分支切换不会触发扫描；在同一目录恢复会话时仍使用原快照，因此现有对话的提示词前缀可继续缓存。

## `@` 导入 \{#-imports}

任何上下文文件内的 `@path` 标记都会在注入之前就地展开为目标文件的内容：

```markdown
# Project notes

Read @docs/architecture.md before changing storage code.
Shared release steps live in @../RELEASE.md and personal aliases in @~/.notes/aliases.md.
```

具体规则如下：

- **相对路径按导入文件所在目录解析**，不是按会话工作目录解析。
- **`~/` 和 `~`** 按用户主目录解析；绝对路径原样使用。
- **代码围栏和行内代码中的标记保持原样**。如果需要说明 `@token` 而不展开它，可以放在代码中。
- **`git@github.com:org/repo.git` 和 `user@example.com` 一类的标记不视为导入。** 只有 `@` 位于行首，或前面是空格或制表符时才视为导入标记。
- **移除路径末尾的句子标点**（`. , ; : ! ? ) ] } " '`），所以 `@docs/setup.md.` 会导入 `docs/setup.md`。
- **导入最多递归五层。** 导入文件本身也可以包含 `@` 导入，总深度不超过五层。
- **跳过重复导入和循环。** 已在当前展开树中引入的文件不会再次展开，即使从另一个分支导入；后续的 `@token` 保持原样。
- **目标不存在或不可读时，保留原始 `@token` 文本**，不会报错。

## 常驻规则与普通上下文 \{#sticky-rules-vs-normal-context}

大部分指引适合用普通上下文文件（`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`.github/copilot-instructions.md` 等），例如仓库概览、代码风格、构建和测试命令、审查要求及本地约定。这些文件会加载到会话开头生成的项目上下文中。

少量必须始终生效的硬性要求适合放在顶层 **`RULES.md`**。即使长对话将开头上下文推到会话记录的较早位置，这些要求仍会生效：

```markdown
# ~/.omp/agent/RULES.md

Never commit or push unless the user explicitly asks.
Do not edit generated files.
```

`RULES.md` 的特殊行为：

- **仅**在原生位置读取：当前生效的用户智能体目录，以及从当前工作目录向仓库根目录查找时选定的最近非空项目 `.omp/` 目录。如果这个项目目录没有 `RULES.md`，OMP 不会回退到更远处的 `.omp/RULES.md`。
- 它以**始终应用的规则**加载，而非上下文文件。每次请求都携带全文，不会降级为按需读取的规则簿条目，长会话中仍会生效。默认在系统提示词中发送。对于启用了 `snapcompact.systemPrompt` 成像功能的视觉模型，系统提示词（含这条规则）也可能以附件图片帧发送；两种方式都会随请求携带正文。
- 会话启动时会从磁盘重新发现；`/clear` 和 `/new` 等会话级重建也会重新发现。在 OMP 运行时创建或编辑此文件，下一次重置后即生效，无需重启。
- 它**始终常驻**，前置元数据不能关闭这一行为。如果需要有条件或显式启用的规则，请编写普通规则文件（见[技能](./skills.md)）。
- 用户级和项目级候选规则使用不同名称：`RULES` 和 `RULES@project`。可以同时加载两种候选。规则按名称去重，因此避免给普通规则使用这些名称：原生普通规则加载较早，可能遮蔽常驻规则候选项。
- 已经出现在自定义提示词、追加文本或上下文文件中的始终应用内容，会按归一化段落的包含关系从生成的始终应用部分省略。内容仍会随包含它的来源一同发送。

保持 `RULES.md` 简短。长篇背景放入 `AGENTS.md`；生成的项目上下文和始终应用的规则都会占用请求的系统提示词上下文。

## 禁用发现提供程序 \{#disabling-discovery-providers}

要禁用提供程序，在 `~/.omp/agent/config.yml`、项目的 `.omp/config.yml` 或 `--config` 叠加层中设置 `disabledProviders`：

```yaml
# .omp/config.yml
disabledProviders:
   - claude
   - github
```

`disabledProviders` 是**禁用整个提供程序的开关，使用同一个 ID 命名空间**，由两个互不相关的子系统使用：

| ID 类型 | 示例 | 列入后的效果 |
| --- | --- | --- |
| 发现提供程序 ID | `native`、`claude`、`codex`、`gemini`、`opencode`、`github`、`agents`、`agents-md`、`claude-md`、`custom-context` | 移除整个配置来源，包括它原本会提供的上下文文件、MCP 服务器、斜杠命令、技能、钩子、工具、提示词和设置。 |
| 模型提供方 ID | `anthropic`、`openai`、`google`、`groq`、`ollama`、`openrouter` | 将对应模型后端从可选项中移除，即使已有凭据也一样。见[模型提供方](./providers.md)。 |

ID 必须精确匹配，两个命名体系不会意外冲突：`google` 禁用 Google 模型后端，`gemini` 则禁用 Gemini CLI 的发现文件。禁用一个发现提供程序的影响不止涉及上下文文件。例如禁用 `claude` 时，除了 `CLAUDE.md`，还会移除从 Claude 发现的 MCP 服务器、命令、技能、钩子、工具和设置。要移除单个上下文文件并保留该提供程序的其他资源，请改用 [`disabledExtensions`](#disabling-a-single-context-file)。

只有 `enabledModels` 和 `disabledProviders` 支持**按路径限定作用域**的条目，因此可以为每个子目录树单独设置提供方可用性：

```yaml
disabledProviders:
   - github # disabled everywhere
   - path: ~/work/legacy-claude
     providers:
        - claude # disabled only under this directory
```

当前工作目录等于配置的路径或位于该路径下时，限定作用域的条目生效。`~` 会展开为用户主目录。单纯的字符串条目在所有位置生效。

优先级较高的设置层会**替换**数组设置，不会在原数组末尾追加。如果全局配置禁用了 `claude`，但项目配置指定 `disabledProviders: [github]`，该项目里会重新启用 Claude 发现，只禁用 GitHub。完整的配置层优先级、合并规则和按路径设定作用域的数组详见[设置](./settings.md)。

## 禁用单个上下文文件 \{#disabling-a-single-context-file}

`disabledProviders` 移除整个配置来源。要移除一个上下文文件并保留其提供程序贡献的其他资源，把该文件的扩展 ID 列入 `disabledExtensions`：

```yaml
# ~/.omp/agent/config.yml, .omp/config.yml, or a --config overlay
disabledExtensions:
   - context-file:user:CLAUDE.md
```

上下文文件的 ID 采用 `context-file:<level>:<basename>` 格式。其中 `<level>` 是 `user` 或 `project`，`<basename>` 是不含目录部分的文件名：

| ID | 禁用内容 |
| --- | --- |
| `context-file:user:CLAUDE.md` | 用户级 `CLAUDE.md`。Claude 的 MCP 服务器、命令、技能、钩子、工具和设置仍会加载。 |
| `context-file:project:AGENTS.md` | 查找所到达的每个目录深度里的**所有**项目级 `AGENTS.md`。ID 不包含深度。 |
| `context-file:user:AGENTS.md` | 所有名为 `AGENTS.md` 的用户级文件，无论由哪个提供程序提供。 |

仅按级别和文件名匹配，因此一个条目会覆盖所有在该级别提供同名文件的提供程序，项目级条目也无法限制到单个深度。需要逐目录控制时，在需要不同设置的子树中使用项目 `.omp/config.yml`，或使用前文按路径限定作用域的 `disabledProviders` 写法。

禁用与遮蔽的行为不同。文件在去重前即被排除，因此不会占用对应的作用域。**原先被它遮蔽的文件会取而代之。** 如果项目既有 `.claude/CLAUDE.md` 又有 `AGENTS.md`，通常由 `CLAUDE.md` 获得深度 0 的位置；禁用 `context-file:project:CLAUDE.md` 后，`AGENTS.md` 将成为项目上下文，而不是让该作用域留空。要让该作用域完全没有文件，逐一禁用每个候选名称。

两种常见用法：

- **非交互运行。** 为自己的交互会话编写的用户级上下文文件通常不适合另一个程序发起的 `-p` 运行，因为该程序会传入自己的指令。通过 `--config` 叠加层禁用此文件，交互设置不会受影响。
- **委派工作。** 一个智能体驱动另一个智能体时，调用方自己的操作指令会作为用户级上下文进入被调用方的提示词，可能与它实际接到的任务冲突。

`disabledExtensions` 不支持按路径限定作用域。只有 `enabledModels`、`enabledProviders`、`disabledProviders`、`bash.patterns` 和 `bashInterceptor.patterns` 接受 `path:` 写法。与其他数组设置一样，优先级较高的层会替换该列表，不会合并。

用 `/extensions` 交互式查看 ID。它会列出每个发现的上下文文件及其级别、来源和当前状态，并能切换同一设置。

## 排查问题 \{#troubleshooting}

### 文件未加载 \{#a-file-is-not-loaded}

- 原生项目上下文只读取最近的非空 `.omp/` 目录。该目录必须包含非空的 `AGENTS.md`。如果不包含，发现不会继续到更远的原生目录。
- 独立的 `CLAUDE.md` 由 `claude-md` 处理，不是由 `native` 处理。
- `.claude/CLAUDE.md`、`.gemini/GEMINI.md` 和 `.github/copilot-instructions.md` 只从当前工作目录下的配置目录读取，不从所有祖先目录读取。
- `~/.codex/AGENTS.md` 和 `~/.config/opencode/AGENTS.md` 只在用户级使用，没有对应的项目级文件。
- 对于原生和独立文件的提供程序，空文件不提供内容。
- 已禁用的发现提供程序不会提供任何资源。检查全局、项目和 `--config` 各层中的 `disabledProviders`。
- 其他工具的用户级来源需要显式启用。检查 `enabledProviders` 中是否有 `claude`、`codex`、`gemini`、`opencode` 或 `github`。项目来源无需这样启用。
- 也可单独禁用一个文件。检查 `disabledExtensions` 是否有匹配的 `context-file:<level>:<basename>` 条目，并注意项目级条目在每个目录深度生效。若这是原因，`/extensions` 会将该文件显示为 `disabled`。
- 文件如果不叫 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 或 `copilot-instructions.md`，只有列入 `contextFiles.extra` 才会发现。未设置此项时，关联工作树看不到主检出里的副本；常规查找会在工作树停止。

### 加载了错误的文件 \{#the-wrong-file-wins}

在同一用户作用域或项目深度内，优先级较高的提供程序遮蔽其他提供程序（native > claude > agents/codex > gemini > opencode > github > agents-md > claude-md）。需要固定加载结果时，将指引移至 `.omp/AGENTS.md`（原生提供程序始终优先），或禁用与它竞争的发现提供程序。

### 用户上下文消失 \{#user-context-disappeared}

只保留一个用户级上下文文件，`~/.omp/agent/AGENTS.md` 优先级最高。其他工具的用户来源还必须通过 `enabledProviders` 显式启用。如果原生文件存在，它会遮蔽用户级 `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、`~/.gemini/GEMINI.md`、`~/.config/opencode/AGENTS.md`、`~/.copilot/copilot-instructions.md` 以及 `~/.agent`、`~/.agents` 中的文件。可以把用户级指引合并到原生文件；如更想使用其他工具的文件，则移除原生文件。

### `RULES.md` 未加载 \{#a-rulesmd-file-is-ignored}

只有原生位置中的 `RULES.md` 才作为常驻规则加载：当前生效的用户智能体目录，以及从当前工作目录向仓库根目录查找时选定的最近非空项目 `.omp/` 目录。如果存在较近的非空 `.omp/`，它会阻止查找更远的原生目录，即使它没有 `RULES.md`。其他位置的 `RULES.md` 不是受支持的约定。

### `@` 导入未展开 \{#an--import-did-not-expand}

确认目标文件相对于导入文件的位置存在，不是相对于当前工作目录。代码围栏或行内代码中的导入标记会保留原样。类似 `git@` 或邮箱地址的标记不会导入；循环会跳过，最多展开五层。目标不存在时保留原始 `@path` 文本。
