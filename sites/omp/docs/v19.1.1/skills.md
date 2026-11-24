---
title: "技能"
description: "Oh My Pi v19.1.1 仓库文档：技能。"
---

# 技能 \{#skills}

技能是以文件保存的能力包。OMP 在启动时发现技能，并通过以下方式向模型或用户提供：

- 在系统提示词中提供轻量元数据（名称和描述）。
- 按需用 `read` 工具读取 `skill://...` 中的内容。
- 可选的交互式 `/skill:<name>` 命令。

本文描述目前在 `packages/coding-agent/src/extensibility/skills.ts`、`packages/coding-agent/src/discovery/builtin.ts`、`packages/coding-agent/src/internal-urls/skill-protocol.ts` 和 `packages/coding-agent/src/discovery/agents-md.ts` 中实现的运行时行为。

## 技能的数据结构 \{#what-a-skill-is-in-this-codebase}

发现的技能表示为：

- `name`
- `description`
- `filePath`（`SKILL.md` 的路径）
- `baseDir`（技能目录）
- 来源元数据（`provider`、`level`、路径）

能力校验器只要求 `name` 和 `path`；各提供程序可以另行规定前置元数据要求。`description` 是否有实质内容会影响匹配质量。

## 目录和 SKILL.md 要求 \{#required-layout-and-skillmd-expectations}

### 目录结构 \{#directory-layout}

对于常规提供程序的根目录（原生、Claude、Codex、Agents 和插件），只在 **`skills/` 下一级**查找技能：

- `<skills-root>/<skill-name>/SKILL.md`

不会递归发现 `<skills-root>/group/<skill>/SKILL.md` 一类的嵌套路径。Claude 插件提供程序除了检查清单所声明技能目录的直接子目录，也接受在该目录内直接放置 `SKILL.md`。Agent Plugins 包只使用固定的 `skills/<name>/SKILL.md` 布局；通过注册表安装的 Skillshare 包在根目录放置 `SKILL.md`。

扫描 `skills.customDirectories` 时也使用同样的非递归结构（`*/SKILL.md`）。

```text
Provider-discovered layout (non-recursive under skills/):

<root>/skills/
  ├─ postgres/
  │   └─ SKILL.md      ✅ discovered
  ├─ pdf/
  │   └─ SKILL.md      ✅ discovered
  └─ team/
      └─ internal/
          └─ SKILL.md  ❌ not discovered by provider loaders

Custom-directory scanning is also non-recursive, so nested paths are ignored unless you point `customDirectories` at that nested parent.
```

### `SKILL.md` 前置元数据 \{#skillmd-frontmatter}

技能类型支持以下前置元数据字段：

- `name?: string`
- `description?: string`
- `globs?: string[]`
- `alwaysApply?: boolean`
- `hide?: boolean`
- `disableModelInvocation?: boolean`（Agent Skills 中与 `hide` 等价的字段，由连字符形式 `disable-model-invocation` 归一化而来）
- 常规扫描器将其他键保留为未知元数据。
- 常规扫描器和 Skillshare 发现遇到 `enabled: false` 时跳过该技能。

此处的 `globs` 和 `alwaysApply` 是元数据，不控制技能自动调用。Agent Plugins 包使用更严格的 Agent Skills 校验，而不是宽松的扫描器：必须提供名称和描述，名称须与目录名相符并符合命名规则，前置元数据只允许规定的字段。该校验不接受 `hide`、`enabled` 等 OMP 专用字段。

目前的运行时行为：

- `name` 默认使用技能目录名。
- 下列情况要求提供 `description`：
   - 原生 `.omp` 提供程序发现技能时（`requireDescription: true`）。
   - `omp-plugins` 扩展包中的技能和 `github` 提供程序（`.github/skills/`）；两者同样传入 `requireDescription: true`。
   - 通过 `src/discovery/helpers.ts` 中的 `scanSkillsFromDir` 扫描 `skills.customDirectories` 时（非递归）。
- claude、codex、agents、opencode 和 claude-plugins 提供程序可加载没有描述的技能。
- `agent-plugins` 按 Agent Skills 规范校验必填的 `name` 和 `description`。

## 发现流程 \{#discovery-pipeline}

`packages/coding-agent/src/extensibility/skills.ts` 中的 `loadSkills()` 分三步处理：

1. **能力提供程序**：通过 `loadCapability("skills")` 加载。此阶段跳过托管或自动学习提供程序中的技能，留到第 3 步处理。
2. **自定义目录**：通过 `scanSkillsFromDir(..., { requireDescription: true })` 枚举一级目录。自定义目录的技能优先于同名的默认提供程序技能；后者仍可通过带命名空间的名称访问，除非两者正文相同。
3. **托管技能（自动学习）**：最后解析 `omp-managed` 提供程序。来自提供程序或自定义目录的同名、已启用的编写型技能均优先。

如果 `skills.enabled` 为 `false`，发现过程不会返回任何技能。

### 内置技能提供程序与优先级 \{#built-in-skill-providers-and-precedence}

提供程序先按优先级排序，数值较高的优先。优先级相同时，按注册顺序排序。

目前注册的技能提供程序如下：

1. `native`（优先级 100）：由 `src/discovery/builtin.ts` 提供 `.omp` 下的用户和项目技能。
2. `skillshare`（优先级 95）：从 Skillshare 存储加载由项目 `.omp/skills.lock.json` 或用户智能体目录中的 `skills.lock.json` 锁定的包。同名的编写型技能仍优先。
3. `omp-plugins`（优先级 90）：通过 `extensions:`、`--extension`/`-e` 加载的扩展包所附带的 `skills/`，或 `~/.omp/plugins/node_modules` 中已安装插件所附带的技能目录。
4. `claude`（优先级 80）。
5. `agent-plugins`（优先级 75）：根目录含标准 `plugin.json` 的可移植包。常规插件提供程序将这些包的技能和 MCP 发现交给它。
6. 优先级 70 组（按注册顺序）：
   - `claude-plugins`
   - `agents`
   - `codex`
7. `opencode`（优先级 55）。
8. `github`（优先级 30）：`.github/skills/<name>/SKILL.md`（GitHub Agent Skills 目录结构，仅项目级）。
9. `omp-managed`（优先级 5）：`~/.omp/agent/managed-skills` 下的自动学习技能，由 `src/discovery/builtin.ts` 注册，始终进行发现。`autolearn.enabled` 只控制写入和提示。只要存在同名的编写型技能，就优先采用后者。

能力层以技能名称去重：去重后的 `items` 视图只保留每个名称下的第一项。`loadSkills()` 自行处理重名，见下文「重名与重复项处理」。

### 来源开关和筛选 \{#source-toggles-and-filtering}

`loadSkills()` 应用以下控制项：

- 来源开关：`enableCodexUser`、`enableClaudeUser`、`enableClaudeProject`、`enablePiUser`、`enablePiProject`、`enableAgentsUser`、`enableAgentsProject`。
- `disabledExtensions` 中的 `skill:<name>` 条目。
- `ignoredSkills`：排除列表，支持 glob 模式。
- `includeSkills`：纳入白名单，支持 glob 模式，空列表表示全部纳入。

筛选顺序如下：

1. 未被 `disabledExtensions` 禁用。
2. 来源已启用。
3. 未被忽略。
4. 如有纳入列表，则必须匹配。

`agents` 提供程序（`.agent[s]/skills`）使用独立的 `enableAgentsUser`/`enableAgentsProject` 开关；禁用 Claude、Codex 或 Pi **不会**关闭它。其他工具的用户级提供程序需要通过 `enabledProviders` 显式启用，其项目根目录仍默认加载。OMP 原生来源和 `~/.omp/plugins` 下已注册的市场插件也默认加载。对于 `claude-plugins`，显式启用的设置只控制由 Claude Code 自身用户注册表提供的插件。

### 仅手动调用的技能 \{#manual-only-skills}

`skills.manualSkills` 采用 glob 模式，默认 `[]`。匹配的技能仍会加载，但会从模型的技能目录中隐藏，效果与设置前置元数据 `hide: true` 相同，无需修改其 `SKILL.md`。若更新会覆盖第三方技能的文件，可使用此设置：

```yaml
skills:
  manualSkills: ["third-party-*", "pdf"]
```

- 匹配项仍可通过 `/skill:<name>`（启用技能命令时）和 `skill://<name>` 访问，并在 `omp skill list --json` 中显示 `hide: true`。
- 每个模式同时匹配前置元数据中的原始名称和最终名称。按原始名称匹配涵盖所有重名别名：`calendar` 也会隐藏 `second/calendar` 和 `second/calendar~2`。`<namespace>/*` 模式只匹配重名别名。技能发生重名时才会获得命名空间，因此这个模式不会选中某个插件下的全部技能。
- `*` 不跨越 `/`；要同时匹配带命名空间的名称，请用 `**`。
- `manualSkills` 只增加隐藏项：被前置元数据隐藏的技能仍然隐藏，`ignoredSkills` 仍会完全移除技能。
- 与其他数组设置一样，项目 `manualSkills` 替换全局列表；项目 `manualSkills: []` 会清空列表。

### 重名与重复项处理 \{#collision-and-duplicate-handling}

- 能力层去重时，`items` 视图只保留每个名称的第一个技能，即优先级最高的提供程序中的对应技能。`loadSkills()` 使用去重之前的全集，因此仍能检查优先级较低的副本。
- `extensibility/skills.ts` 随后执行以下操作：
   - 按 `realpath` 对相同文件去重，可正确处理符号链接。
   - 如果随后遇到一个同名技能，其正文相同、解析后的前置元数据与已加载技能深度相等，则不提示，直接丢弃。例如，同一技能安装两次，将插件副本镜像到 `~/.agents/skills` 即属此类。如果新技能的优先级高于当前无命名空间名称的持有者，则丢弃被它替代的相同副本，包括无命名空间的原持有者和所有带命名空间的别名。这样覆盖不会重新引入自己的重复项。
   - 同名技能内容不同时，优先级较高者保留无命名空间的名称，其他版本使用 `<namespace>/<name>` 形式。重名警告会列出路径。优先顺序如下：编写型技能优先于从注册表安装的包（`skillshare` 提供程序、`omp skill install`）；自定义目录中的技能优先于提供程序中的技能（#7190）；其余情况下，最早纳入的技能保留无命名空间的名称。提供程序按优先级排序，自定义目录按 `skills.customDirectories` 的数组顺序排序。若提供程序记录了插件标识，命名空间使用其元数据中的插件标识。所有基于注册表的提供程序均提供标识：`claude-plugins`、`agent-plugins` 使用插件名，`omp-plugins` 使用扩展包名，`skillshare` 使用包名。因此已安装插件按自身名称分配命名空间，不使用缓存路径中的版本段；插件更新后，命名空间保持不变。如果提供程序未记录插件标识，则使用持有该技能 `skills/` 目录树的目录名，或技能根目录名。对于 `~/.claude/skills` 等名称以点开头的主目录，可回退到提供程序 ID。如果带命名空间的名称已被另一个不同技能占用，将追加 `~2`、`~3` 等后缀。任何内容不同的技能都不会在无警告的情况下被丢弃。
   - 对所有提供程序和自定义目录中的技能，如果原始前置元数据 `name` 含 `/` 或 `\`，则拒绝该技能并警告。这两个分隔符保留给命名空间形式和 `skill://<name>/<path>` 的解析，因此原始名称不能占用带命名空间的地址。
   - 将便捷 API `loadSkillsFromDir({ dir, source })` 保留为 `scanSkillsFromDir` 的轻量适配层。
- 带命名空间的技能可通过 `skill://<namespace>/<name>[/<path>]` 或 `/skill:<namespace>/<name>` 标记解析。命令标记可出现在提示词开头或中间；位于中间时只接受一个 `/`，更深的路径按正文保留。技能名称从不包含 `/`，因此精确匹配 `<host>/<first segment>` 不会产生歧义。该匹配优先于将该段解释为与该命名空间同名的无命名空间技能下的相对路径。
- 自定义目录技能在提供程序技能之后合并，但无论纳入顺序如何，都优先于默认路径下的同名提供程序技能（#7190）。自定义目录的技能保留无命名空间的名称；提供程序技能若内容不同，则使用带命名空间的名称重新纳入（如该名称已被占用，再加后缀），内容相同则丢弃。两个自定义目录有同名技能时，在 `skills.customDirectories` 中先出现的保留原名称，另一个加命名空间。
- `disabledExtensions`（`skill:<name>`）和 `skills.ignoredSkills` 同时按原始名称及最终名称匹配，带命名空间的别名不能绕过排除规则。`skills.includeSkills` 只在所有名称解析完毕后应用于最终列表。因此 `second/*` 可以选中带命名空间的技能，即使与它重名的无命名空间技能未被纳入。

## 运行时使用方式 \{#runtime-usage-behavior}

### 系统提示词中的技能 \{#system-prompt-exposure}

系统提示词构建（`src/system-prompt.ts`）按以下方式使用已发现的技能：

- 如果某个启用的工具声明 `readsSkillUris: true`：
   - 纳入发现的技能列表，但排除隐藏的技能。
   - 挂载的工具命令在其能力元数据得到投影时也计入。
- 否则：
   - 省略已发现的技能列表。

未提供工具元数据时，提示词构建器会回退到检查是否有 `read`，以保持兼容。

`hide: true` 不禁用技能。隐藏技能仍然加载，可通过 `skill://<name>` 访问；开启技能命令时，也可通过 `/skill:<name>` 访问。

Task 工具的子代理正常创建会话时会接收会话已发现或已提供的技能列表，没有按任务锁定技能的覆盖项。

### 交互式 `/skill:<name>` 命令 \{#interactive-skillname-commands}

`skills.enableSkillCommands` 为 true 时，交互模式为每个发现的技能注册一个斜杠命令。

`/skill:<name> [args]` 的行为：

- 支持传统的开头调用，也识别普通正文中由空白字符分隔的 `/skill:<name>` 标记。
- 对嵌入正文的标记，移除标记并将周围文本作为参数传入。
- 草稿以其他斜杠命令或本地 Bash、Python 执行标记开头时，不将嵌入的标记视作技能调用。
- 直接从 `filePath` 读取技能文件。
- 移除前置元数据。
- 将正文、技能名、基础目录和可选的用户参数包在一起，以自定义消息注入。
- 交付方式取决于**提交快捷键**：
   - **Enter**：流式输出时把技能调用放入 `steer` 队列，与自由文本按 Enter 同样作为引导；智能体不在流式输出时，作为普通空闲提示词处理。
   - **Ctrl+Q / Ctrl+Enter**（默认 `app.message.followUp` 绑定）：流式输出时把技能调用放入 `followUp` 队列；智能体不在流式输出时，作为普通空闲提示词处理。

没有参数、模式选择器或前置元数据项可覆盖交付方式。快捷键本身决定交付方式，与流式输出期间自由文本的路由一致。两种提交路径都由 `input-controller.ts` 中的 `#invokeSkillCommand` 分发，再交由 `src/modes/skill-command.ts` 中的 `invokeSkillCommandFromText` 处理。

被调用的技能内容按调用方式区分。每种方式有各自的提示词模板（位于 `src/prompts/skills/`，由 `src/extensibility/skills.ts` 中的 `buildSkillPromptMessage` 渲染）：

- **用户调用**（`user-invocation.md`，供 `/skill:<name>` 使用）：消息开头说明用户调用了该技能，随后嵌入技能正文，附上技能目录（`[Skill directory: <baseDir>]`），指示以该目录解析技能内的相对路径（脚本、模板），最后附上可选的 `User: <args>`。
- **自动加载**（`autoload.md`）：只注明出处的精简格式，正文后跟 `Skill: <path>` 及可选的 `User: <args>`。当子代理自动注入通过智能体前置元数据 `autoloadSkills` 声明的技能时使用。此类隐藏消息不得声称是用户调用的。

## `skill://` URL 行为 \{#skill-url-behavior}

`src/internal-urls/skill-protocol.ts` 支持：

- `skill://<name>`：对 `read` 解析为技能的 `SKILL.md`；在 `bash` 中表示技能目录（说明位于 `skill://<name>/SKILL.md`），`realpath` 和 `readlink` 会打印物理路径。
- `skill://<name>/<relative-path>`：解析为该技能目录内的路径。

```text
skill:// URL resolution

skill://pdf
  -> <pdf-base>/SKILL.md

skill://pdf/references/tables.md
  -> <pdf-base>/references/tables.md

Guards:
- reject absolute paths
- reject `..` traversal
- reject any resolved path escaping <pdf-base>
```

解析细节：

- 技能名必须完全匹配。
- 相对路径进行 URL 解码。
- 拒绝绝对路径。
- 拒绝路径穿越（`..`）。
- 解析后的路径在字面上必须位于 `baseDir` 内。
- 对于 Agent Plugins 和 Skillshare 的技能，还会按真实路径检查目标是否位于包根目录内，防止通过符号链接逃逸。指向同一包内其他位置的符号链接仍然允许。
- 读取目录会返回目录列表。
- 文件不存在时，返回明确的 `File not found` 错误。
- 如果没有已加载的技能使用该名称，报告失败前会重新发现主会话的技能。因此，在会话启动后新建或安装的技能也能解析，并加入会话的技能列表和系统提示词。此类未命中最多每 2 秒触发一次重新发现；子代理继承的列表不会新增技能。

内容类型：

- Markdown 路径：`text/markdown`。
- `.json`：`application/json`。
- 其他文件：`text/plain`。

资源缺失时不进行后备搜索。

MCP 声明的技能：

- 没有已加载技能占用 `skill://` URL 中的名称时，`read` 会提供 MCP 服务器以完全相同 URI 声明的资源，例如 Figma 的 `skill://figma/figma-use/SKILL.md`。用法类似 `mcp://skill://…`，但支持行选择器。名称归属按前述规则基于归一化后的 URL 判定，因此已加载的无命名空间或带命名空间技能始终优先。URI 模板只通过显式的 `mcp://` 匹配。
- 与 `mcp://` 读取一样，如果 MCP 服务器仍在连接或列举资源，读取会先等待，再报告 `Unknown skill`。等待受 MCP 连接和请求超时限制，取消读取也会终止等待。
- 需要本地文件的操作（`%load`、计划模式的写入检查、`:img` 选择器）直接报告 `Unknown skill`，不联系 MCP。
- MCP 提供的文本仍受 `read` 正常结果上限限制；只有本地技能文件会整份读取。
- `omp read` 只有在读取触及 MCP 资源时才启动 MCP 服务器，因此读取本地技能不会启动它们。

## 技能与指令文件、命令、工具和钩子的区别 \{#skills-vs-agentsmd-commands-tools-hooks}

### 技能与 AGENTS.md \{#skills-vs-agentsmd}

- **技能**：有名称的可选能力包，可按任务上下文选择，也可显式请求。
- **AGENTS.md 及上下文文件**：持久指令文件，作为上下文文件能力加载，并按级别与深度规则合并。

`src/discovery/agents-md.ts` 从 `cwd` 开始向父目录查找单独的 `AGENTS.md` 文件。如果仓库位于用户主目录下，会继续扫描包围该仓库的工作区目录，直到主目录，但不含主目录。如果主目录下没有识别到仓库根目录，则仍会包含作为边界的主目录。其他情况下，扫描到仓库根目录为止；若在主目录之外未识别到仓库根目录，则扫描到文件系统根目录。跳过直接存放在隐藏目录中的文件。

### 技能与斜杠命令 \{#skills-vs-slash-commands}

- **技能**：模型可读取的知识和工作流内容。
- **斜杠命令**：用户调用命令的入口。
- `/skill:<name>` 是注入技能文本的便捷命令，不改变技能发现的行为。

### 技能与自定义工具 \{#skills-vs-custom-tools}

- **技能**：通过提示词上下文和 `read` 加载的文档与工作流内容。
- **自定义工具**：模型可调用的可执行工具 API，带有 schema 和运行时副作用。

### 技能与钩子 \{#skills-vs-hooks}

- **技能**：被动加载的内容。
- **钩子**：事件驱动的运行时拦截器，可在执行时阻止或修改行为。

## 按发现规则编写技能 \{#practical-authoring-guidance-tied-to-discovery-logic}

- 每个技能放在独立目录中：`<skills-root>/<skill-name>/SKILL.md`。
- 务必显式提供 `name` 和 `description` 前置元数据。
- 将引用的素材放在同一技能目录下，并通过 `skill://<name>/...` 访问。
- 对于嵌套分类（`team/domain/skill`），将 `skills.customDirectories` 指向嵌套后的父目录；扫描本身仍不递归。
- 发生重名时，优先级较高的技能保留无命名空间的名称，相同的副本合并，内容不同的副本仍可通过命名空间访问。
