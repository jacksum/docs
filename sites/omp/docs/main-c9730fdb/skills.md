---
title: "技能"
description: "Oh My Pi 官方仓库文档：技能。"
---

# 技能 \{#skills}

技能是基于文件的能力包，在启动时发现，并以下列形式公开给模型：

- 系统提示中的轻量元数据（名称 + 描述）
- 通过 `read` 工具按需读取 `skill://...` 内容
- 可选的交互式 `/skill:<name>` 命令

本文介绍 `packages/coding-agent/src/extensibility/skills.ts`、`packages/coding-agent/src/discovery/builtin.ts`、`packages/coding-agent/src/internal-urls/skill-protocol.ts` 和 `packages/coding-agent/src/discovery/agents-md.ts` 中当前的运行时行为。

## 本代码库中的技能是什么 \{#what-a-skill-is-in-this-codebase}

已发现的技能表示为：

- `name`
- `description`
- `filePath`（`SKILL.md` 路径）
- `baseDir`（技能目录）
- 来源元数据（`provider`、`level`、路径）

能力验证器只要求 `name` 和 `path`；各提供方会施加额外的 frontmatter 要求。匹配质量取决于 `description` 是否有实际意义。

## 必需的布局与 SKILL.md 要求 \{#required-layout-and-skillmd-expectations}

### 目录布局 \{#directory-layout}

对于常规提供方根目录（原生/Claude/Codex/Agents/插件），技能发现范围为 **`skills/` 下的一级目录**：

- `<skills-root>/<skill-name>/SKILL.md`

不会递归发现 `<skills-root>/group/<skill>/SKILL.md` 这样的嵌套模式。Claude 插件提供方除了接受直接子目录外，还接受清单声明的、直接包含 `SKILL.md` 的技能目录。Agent Plugins 包只使用固定的 `skills/<name>/SKILL.md` 布局；从注册表安装的 Skillshare 包在根目录包含 `SKILL.md`。

对于 `skills.customDirectories`，扫描采用相同的非递归布局（`*/SKILL.md`）。

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

### `SKILL.md` frontmatter \{#skillmd-frontmatter}

技能类型支持的 frontmatter 字段：

- `name?: string`
- `description?: string`
- `globs?: string[]`
- `alwaysApply?: boolean`
- `hide?: boolean`
- `disableModelInvocation?: boolean`（Agent Skills 中等同于 `hide` 的字段；从短横线形式 `disable-model-invocation` 规范化而来）
- 常规扫描器将额外键保留为未知元数据
- `enabled: false` 在常规扫描器和 Skillshare 发现中跳过该技能

这里的 `globs` 和 `alwaysApply` 是元数据，不是自动技能调用控制项。Agent Plugins 包采用更严格的 Agent Skills 验证，而不是宽松扫描器：必需的名称/描述、目录名一致、命名有效，以及封闭的 frontmatter 字段集。那里不接受 `hide` 和 `enabled` 等 OMP 专有字段。

当前运行时行为：

- `name` 默认为技能目录名
- 以下情况要求提供 `description`：
   - 原生 `.omp` 提供方技能发现（`requireDescription: true`）
   - `omp-plugins` 扩展包技能，同样传入 `requireDescription: true`
   - `skills.customDirectories` 通过 `src/discovery/helpers.ts` 中的 `scanSkillsFromDir` 扫描（非递归）
- claude/codex/agents/opencode/claude-plugins 提供方可加载不含描述的技能
- `agent-plugins` 根据 Agent Skills 规范验证必需的 `name` 和 `description`

## 发现流水线 \{#discovery-pipeline}

`packages/coding-agent/src/extensibility/skills.ts` 中的 `loadSkills()` 分三轮执行：

1. 通过 `loadCapability("skills")` 加载**能力提供方**（此处跳过托管/自动学习提供方的技能，在第 3 轮处理）
2. 通过 `scanSkillsFromDir(..., { requireDescription: true })` 加载**自定义目录**（一级目录枚举）。自定义目录中的技能覆盖默认提供方的同名技能；被取代的提供方技能仍可通过其命名空间名称访问，除非其正文相同。
3. 最后解析**托管（自动学习）技能**（`omp-managed` 提供方），因此提供方或自定义目录中任何已启用的同名编写技能都具有优先权

如果 `skills.enabled` 为 `false`，发现过程不返回任何技能。

### 内置技能提供方与优先级 \{#built-in-skill-providers-and-precedence}

提供方先按优先级排序（较高者胜出），相同优先级则按注册顺序排序。

当前注册的技能提供方：

1. `native`（优先级 100）：通过 `src/discovery/builtin.ts` 加载 `.omp` 用户/项目技能
2. `skillshare`（优先级 95）：固定在项目 `.omp/skills.lock.json` 或用户智能体目录的 `skills.lock.json` 中、从 Skillshare 存储加载的包；名称冲突时，编写的技能仍优先于它们
3. `omp-plugins`（优先级 90）：与扩展包并列的 `skills/`，扩展包通过 `extensions:`、`--extension`/`-e` 或 `~/.omp/plugins/node_modules` 下已安装插件加载
4. `claude`（优先级 80）
5. `agent-plugins`（优先级 75）：根目录具有标准 `plugin.json` 的可移植包；常规插件提供方将其技能/MCP 发现交由此提供方处理
6. 优先级 70 组（按注册顺序）：
   - `claude-plugins`
   - `agents`
   - `codex`
7. `opencode`（优先级 55）
8. `omp-managed`（优先级 5）：位于 `~/.omp/agent/managed-skills` 的自动学习技能，在 `src/discovery/builtin.ts` 中注册，并无条件发现（只有写入/提醒受 `autolearn.enabled` 控制）；始终让位于同名编写技能。每个技能都携带 `x-omp-provenance` frontmatter（写入工具、创建/更新时间、贡献会话和项目）；`/skills learned` 会列出它们及其来源，包括被遮蔽的技能，`/skills forget <name>` 则删除其中一个

能力去重键是技能名；去重后的 `items` 视图中，给定名称的第一项胜出。`loadSkills()` 自行处理同名冲突（参见“冲突与重复处理”）。

### 来源开关与过滤 \{#source-toggles-and-filtering}

`loadSkills()` 应用以下控制项：

- 来源开关：`enableClaudeProject`、`enablePiUser`、`enablePiProject`、`enableAgentsUser`、`enableAgentsProject`
- 带有 `skill:<name>` 的 `disabledExtensions` 条目
- `ignoredSkills`（排除；glob 模式）
- `includeSkills`（包含允许列表；glob 模式；为空表示包含全部）

过滤顺序为：

1. 未被 `disabledExtensions` 禁用
2. 来源已启用
3. 未被忽略
4. 已被包含（若存在包含列表）

`agents` 提供方（`.agent[s]/skills`）有自己的 `enableAgentsUser`/`enableAgentsProject` 开关，禁用 Claude/Codex/Pi **不会**将其关闭。Claude、Codex 和 OpenCode 技能只从项目根目录（`.claude/skills`、`.codex/skills`、`.opencode/skills`）加载；从不读取它们在主目录中的技能。原生 OMP 来源和注册在 `~/.omp/plugins` 下的市场插件默认加载。

### 仅手动调用的技能 \{#manual-only-skills}

`skills.manualSkills`（glob 模式，默认为 `[]`）使匹配的技能保持加载，但将它们从模型的技能目录中移除，效果与 frontmatter 的 `hide: true` 相同，且不编辑其 `SKILL.md`。可将它用于文件会被更新覆盖的第三方技能：

```yaml
skills:
  manualSkills: ["third-party-*", "pdf"]
```

- 匹配项仍可通过 `/skill:<name>`（技能命令启用时）和 `skill://<name>` 访问，并在 `omp skill list --json` 中报告 `hide: true`。
- 每个模式都会同时匹配原始 frontmatter 名称和最终名称。匹配原始名称涵盖所有冲突别名：`calendar` 也会隐藏 `second/calendar` 和 `second/calendar~2`。`<namespace>/*` 模式只匹配冲突别名，因为技能只有在名称冲突时才会获得命名空间；它不会选择某个插件的所有技能。
- `*` 不跨越 `/`；使用 `**` 也可匹配带命名空间的名称。
- `manualSkills` 只会增加隐藏：frontmatter 隐藏的技能继续隐藏，`ignoredSkills` 仍会完全移除技能。
- 与其他数组设置一样，项目的 `manualSkills` 替换全局列表；项目的 `manualSkills: []` 会将其清空。

### 冲突与重复处理 \{#collision-and-duplicate-handling}

- 能力去重在去重后的 `items` 视图中为每个名称保留第一个技能（优先级最高的提供方）；`loadSkills()` 使用去重前的超集，因此仍可检查较低优先级的副本。
- 随后 `extensibility/skills.ts` 会：
   - 通过 `realpath` 对相同文件去重（兼容符号链接）
   - 当后出现的同名技能正文相同，且解析后的 frontmatter 与已加载技能深度相等时，静默丢弃它（同一技能安装两次，例如插件副本被镜像到 `~/.agents/skills`）。如果传入技能的优先级高于裸名称持有者（见下文），则改为丢弃它所取代的相同副本（裸名称持有者及所有带命名空间的别名），因此覆盖不会重新纳入自身的重复副本
   - 当同名技能不同时，较高优先级的技能保留裸名称，其他每个变体都获得 `<namespace>/<name>` 后缀，并在冲突警告中列明路径。优先级：编写的技能优先于注册表安装包（`skillshare` 提供方、`omp skill install`）；自定义目录技能优先于提供方技能（#7190）；否则先被接纳者保留裸名称，提供方之间按提供方优先级顺序，自定义目录之间按 `skills.customDirectories` 数组顺序。若提供方跟踪插件身份，命名空间采用提供方元数据中的插件身份（每个基于注册表的提供方都会提供：`claude-plugins` 和 `agent-plugins` 使用插件名称，`omp-plugins` 使用扩展包名称，`skillshare` 使用包名称，因此已安装插件以自身名称而非缓存路径中的版本段作为命名空间，且命名空间在插件更新后保持不变）；否则使用包含该技能 `skills/` 树的目录，或技能根目录的名称，对于 `~/.claude/skills` 这种带点号的主目录则回退为提供方 id。如果命名空间位置本身已被不同技能占用，则添加 `~2`、`~3` 等后缀；不会在没有警告的情况下丢弃不同的技能。
   - 对每个提供方和自定义目录，拒绝原始 frontmatter 中包含 `/` 或 `\` 的 `name`（并发出警告）：分隔符保留用于命名空间形式和 `skill://<name>/<path>` 解析，因此原始名称无法占用命名空间地址
   - 将便捷 API `loadSkillsFromDir({ dir, source })` 保留为 `scanSkillsFromDir` 的薄适配层
- 带命名空间的技能可通过 `skill://<namespace>/<name>[/<path>]` 和 `/skill:<namespace>/<name>` 标记解析，既支持提示开头，也支持提示中间（提示中间的标记接受恰好一个 `/`；更深的路径保留为正文）。由于技能名从不包含 `/`，精确的 `<host>/<first segment>` 匹配没有歧义，且优先于将该段解读为与命名空间同名的裸技能的相对路径。
- 自定义目录技能在提供方技能之后合并，无论接纳顺序如何，都优先于默认路径提供方的同名技能（#7190）：自定义目录技能保留裸名称；提供方技能若不同则以命名空间名称重新纳入（该位置已占用时添加后缀），若相同则丢弃。两个自定义目录之间，`skills.customDirectories` 中的第一个保留裸名称，另一个获得命名空间。
- `disabledExtensions`（`skill:<name>`）和 `skills.ignoredSkills` 同时应用于原始名称和最终名称，因此命名空间别名不能绕过排除规则。`skills.includeSkills` 只在所有名称解析完成后应用于最终列表，因此 `second/*` 可选择命名空间技能，即使与它冲突的裸名称技能本身未被包含。

## 运行时使用行为 \{#runtime-usage-behavior}

### 在系统提示中公开 \{#system-prompt-exposure}

系统提示构建（`src/system-prompt.ts`）按以下方式使用已发现技能：

- 如果某个活动工具声明 `readsSkillUris: true`：
   - 包含已发现的技能列表，但排除隐藏技能
   - 已挂载的工具命令在其能力元数据被投影时也计入
- 否则：
   - 省略已发现的列表

未提供工具元数据时，提示构建器以是否存在 `read` 作为兼容性回退。

`hide: true` 不会禁用技能。隐藏技能仍会加载，并在技能命令启用时继续可通过 `skill://<name>` 和 `/skill:<name>` 访问。

Task 工具的子代理通过常规会话创建接收会话中已发现/已提供的技能列表；没有按任务固定技能的覆盖项。

### 交互式 `/skill:<name>` 命令 \{#interactive-skillname-commands}

如果 `skills.enableSkillCommands` 为 true，交互模式会为每个已发现技能注册一条斜杠命令。

`/skill:<name> [args]` 的行为：

- 识别传统的开头形式，以及嵌入普通正文中、以空白分隔的 `/skill:<name>` 标记
- 对于嵌入标记，移除标记，并将周围正文作为参数传递
- 如果草稿以其他斜杠命令或本地 bash/Python 执行标记开头，则不将嵌入标记视为调用
- 直接从 `filePath` 读取技能文件
- 去除 frontmatter
- 用技能名称、基础目录和可选用户参数包裹正文，随后作为自定义消息注入
- 投递模式遵循**提交快捷键**：
   - **Enter** → 流式传输期间在 `steer` 队列上调用技能（与同样执行引导的自由文本 Enter 一致），智能体未在流式传输时则作为普通空闲提示
   - **Ctrl+Q / Ctrl+Enter**（默认的 `app.message.followUp` 绑定）→ 流式传输期间在 `followUp` 队列上调用技能，智能体未在流式传输时则作为普通空闲提示

没有可覆盖投递模式的标志、模式选择器或 frontmatter 控制项，快捷键_就是_选择，与流式传输期间自由文本的路由一致。两种提交路径均经由 `input-controller.ts` 中的 `#invokeSkillCommand` 分发，后者委托给 `src/modes/skill-command.ts` 中的 `invokeSkillCommandFromText`。

被调用的技能内容按调用类型标识，每种类型有自己的提示模板（位于 `src/prompts/skills/`，由 `src/extensibility/skills.ts` 中的 `buildSkillPromptMessage` 渲染）：

- **用户调用**（`user-invocation.md`，用于 `/skill:<name>`）：消息开头声明用户调用了该技能，嵌入技能正文，追加技能目录（`[Skill directory: <baseDir>]`）及要求将技能相对路径（脚本、模板）相对于该目录解析的指令，并可附加 `User: <args>`。
- **自动加载**（`autoload.md`）：仅包含来源信息的最简格式，正文后跟 `Skill: <path>` 和可选的 `User: <args>`；用于子代理自动注入通过智能体 frontmatter 字段 `autoloadSkills` 声明的技能；这些隐藏消息不得声称技能由用户调用。

## `skill://` URL 行为 \{#skill-url-behavior}

`src/internal-urls/skill-protocol.ts` 支持：

- `skill://<name>` → 对 `read` 解析为该技能的 `SKILL.md`；在 `bash` 中则为技能目录（指令位于 `skill://<name>/SKILL.md`），`realpath`/`readlink` 输出物理路径
- `skill://<name>/<relative-path>` → 解析到该技能目录内

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

- 技能名称要求精确匹配
- 相对路径会进行 URL 解码
- 绝对路径会被拒绝
- 路径遍历（`..`）会被拒绝
- 解析后的路径在词法上要求仍位于 `baseDir` 内
- Agent Plugins 和 Skillshare 技能还会通过 realpath 检查是否包含在其包根目录中，以防止符号链接逃逸；允许指向同一包内其他位置的符号链接
- 目录返回目录列表
- 缺失文件返回明确的 `File not found` 错误
- 如果名称不属于任何已加载技能，会在失败前重新发现主会话技能，因此会话启动后创建或安装的技能可以解析（并加入会话技能列表和系统提示）；此类未命中每 2 秒最多启动一次重新发现，子代理继承的列表不会新增技能

内容类型：

- Markdown 路径 => `text/markdown`
- `.json` => `application/json`
- 其他文件 => `text/plain`

不会对缺失资源执行回退搜索。

MCP 公布的技能：

- 当 `skill://` URL 中的名称不属于任何已加载技能时，`read` 会提供 MCP 服务器以该精确 URI 公布的资源（例如 Figma 的 `skill://figma/figma-use/SKILL.md`），类似于 `mcp://skill://…`，但支持行选择器。归属按上述规范化 URL 判断，因此已加载的裸名称或命名空间技能始终优先；URI 模板只通过显式的 `mcp://` 匹配。
- 与 `mcp://` 读取完全相同，读取会等待仍在连接或列举资源的 MCP 服务器，然后才报告 `Unknown skill`；等待受 MCP 连接/请求超时限制，并在读取被取消时结束。
- 需要本地文件的操作（`%load`、计划模式写入检查、`:img` 选择器）会直接报告 `Unknown skill`，不联系 MCP。
- MCP 提供的文本保留 `read` 的常规结果限制；只有本地技能文件会完整读取。
- `omp read` 只有在读取到 MCP 资源时才启动 MCP 服务器，因此读取本地技能从不会生成这些服务器进程。

## 技能与 AGENTS.md、命令、工具、钩子的区别 \{#skills-vs-agentsmd-commands-tools-hooks}

### 技能与 AGENTS.md 的区别 \{#skills-vs-agentsmd}

- **技能**：有名称、可选的能力包，根据任务上下文选择或由用户明确请求
- **AGENTS.md/上下文文件**：持久指令文件，作为上下文文件能力加载，并按层级/深度规则合并

`src/discovery/agents-md.ts` 从 `cwd` 开始沿祖先目录向上遍历，发现独立的 `AGENTS.md` 文件。对于嵌套在用户主目录下的仓库，它会继续遍历外围工作区目录，直到主目录但不包含主目录。如果主目录下没有仓库根目录，则仍包含主目录边界。其他情况下，它在仓库根目录处停止；若位于主目录之外且没有已知仓库根目录，则在文件系统根目录停止。位于隐藏所属目录中的文件会被跳过。

### 技能与斜杠命令的区别 \{#skills-vs-slash-commands}

- **技能**：模型可读取的知识/工作流程内容
- **斜杠命令**：用户调用的命令入口
- `/skill:<name>` 是注入技能文本的便捷封装；不会改变技能发现语义

### 技能与自定义工具的区别 \{#skills-vs-custom-tools}

- **技能**：通过提示上下文和 `read` 加载的文档/工作流程内容
- **自定义工具**：模型可调用的可执行工具 API，具有模式和运行时副作用

### 技能与钩子的区别 \{#skills-vs-hooks}

- **技能**：被动内容
- **钩子**：事件驱动的运行时拦截器，可在执行期间阻止/修改行为

## 与发现逻辑相关的实用编写指南 \{#practical-authoring-guidance-tied-to-discovery-logic}

- 将每个技能放在自己的目录中：`<skills-root>/<skill-name>/SKILL.md`
- 始终显式包含 `name` 和 `description` frontmatter
- 将引用资源保存在同一技能目录下，并通过 `skill://<name>/...` 访问
- 对于嵌套分类（`team/domain/skill`），将 `skills.customDirectories` 指向嵌套的父目录；扫描本身仍不递归
- 名称冲突时，较高优先级的技能保留裸名称；相同副本会合并，不同副本继续可通过命名空间访问。
