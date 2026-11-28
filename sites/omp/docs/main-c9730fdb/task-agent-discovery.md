---
title: "Task 智能体发现与选择"
description: "Oh My Pi 官方仓库文档：Task 智能体发现与选择。"
---

# Task 智能体发现与选择 \{#task-agent-discovery-and-selection}

本文介绍 task 子系统如何发现智能体定义、合并多个来源，并在执行时解析所请求的智能体。

内容涵盖当前实现的运行时行为，包括优先级、无效定义处理，以及可能使智能体实际上不可用的启动/深度约束。

## 实现文件 \{#implementation-files}

- [`src/task/discovery.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/discovery.ts)
- [`src/task/agents.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/agents.ts)
- [`src/task/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/types.ts)
- [`src/task/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/index.ts)
- [`src/task/structured-subagent.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/structured-subagent.ts)
- [`src/task/spawn-policy.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/spawn-policy.ts)
- [`src/task/commands.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/commands.ts)
- [`src/prompts/agents/task.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/agents/task.md)
- [`src/prompts/tools/task.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/tools/task.md)
- [`src/discovery/helpers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/helpers.ts)
- [`src/discovery/omp-extension-roots.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/omp-extension-roots.ts)
- [`src/config.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/config.ts)
- [`src/task/executor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/executor.ts)

---

## 智能体定义结构 \{#agent-definition-shape}

Task 智能体规范化为 `AgentDefinition`（`src/task/types.ts`）：

- 必填 `name`、`description` 和 `systemPrompt`
- 可选 `tools`、`spawns`、按优先级排列的 `model` 列表、`thinkingLevel`、`output`、`blocking`、`structured`、`autoloadSkills`、`readSummarize`、`prewalk`、`advisor`
- `source`：`"bundled" | "user" | "project"`（扩展智能体会按其扩展根目录标记为项目级或用户级）
- 可选 `filePath`

通过 `parseAgentFields()`（`src/discovery/helpers.ts`）从 frontmatter 解析：

- `name` 或 `description` 缺失/非字符串 => 无效（`null`），调用方视为解析失败
- `main` 和 `sub` 是保留名称（去除首尾空白并转为小写后检查）；使用这些名称的定义无效
- `tools` 接受 CSV 或数组；旧版工具别名会规范化，混合数组保留其中的字符串条目。省略或 YAML-null 的 `tools` 选择默认内置工具集。任何不含工具名称的其他声明（包括 `tools: []`、空 CSV 或格式错误的标量/数组值）都不选择内置工具。结构化子代理仍会获得所需的 `yield` 工具；MCP、扩展和自定义工具仍作为附加工具提供。
- `spawns` 接受 `*`、CSV 或数组
- 向后兼容行为：如果缺少 `spawns`，但 `tools` 包含 `task`，则 `spawns` 变为 `*`
- `output` 作为不透明模式数据直接传递
- `read-summarize: false`（规范化为 `readSummarize`）禁用子代理 `read` 工具的结构摘要，`runSubprocess` 会在子代理隔离的设置上应用 `read.summarize.enabled: false` 覆盖（`src/task/executor.ts`）。随附的 `scout` 已禁用此功能。该字段缺省时，子代理继承父级的读取摘要设置。
- `model` 接受单个选择器、CSV 或数组。展开角色别名后，按顺序尝试各条目。
- `thinking-level` / `thinking` 选择智能体配置的推理强度。当 `task.enableEffort`（默认 `false`）将其暴露时，task 条目的粗粒度 `effort`（`lo`、`med`、`hi`）在启动时优先，但标签指定了级别的[用户标记模型智能体](#effort-level-suffix)和带显式 `:level` 的[单次调用 `model`](#per-call-model) 除外。OMP 将该提示映射为所选模型支持的最低、中间或最高推理强度，再限制到 `task.maxEffort`（默认 `max`）。该上限在重试回退的模型切换中延续。如果所选模型不支持任何不高于该上限的推理强度，启动失败；没有可控推理强度接口的模型则回退到其普通选择器。
- `blocking: true` 使父级即使在异步 task 执行已启用时也等待该智能体
- `structured: true` 会在 `task.structured`（默认 `false`）关闭时仍为该智能体保留结构化结果：其 task 启动会获得 `yield` 工具，并以与 `task.structured: true` 完全相同的方式解析输出模式（参见[模型和结构化输出优先级](#model-and-structured-output-precedence)）。当 `task.structured` 开启时，该字段不改变行为；`false` 或缺省则遵循设置。设置关闭时，调用方的 `outputSchema`/`schemaMode` task 参数仍然隐藏。决策在 `resolveEffectiveSubagentPolicy()` 中根据解析后的智能体做出，因此计划模式启动会保留该行为，冷恢复也会从子代理持久化的工具列表中恢复 `yield`。
- `autoloadSkills` 指定要在子代理首条提示前注入的父会话技能名称；未知名称会被忽略
- `prewalk: true` 在解析出的模型上启动子代理，并在其首次编辑/写入时移交给默认 prewalk 目标（`smol` 角色），行为与会话级 `--prewalk` 完全相同；字符串值（例如 `prewalk: "@smol"` 或 `prewalk: "openai/gpt-5-mini"`）选择自定义目标。`task.agentPrewalk` 设置记录（智能体名称 → `"on"` / `"off"` / 模式，通过 `/agents` 中枢的 prewalk 条按智能体配置）覆盖 frontmatter。解析在 `runSubprocess`（`src/task/executor.ts`）中进行。不可用的目标会被跳过，而不是导致启动失败。只有在模型限制处理后，目标的模型身份和有效思考模式/级别都与起始选择相同时，才会跳过已解析目标；同模型的推理强度降级属于真正的移交，仍会预备切换，并在首次编辑/写入时切换。
- `task.agentPrewalkAuto` 是仅存在于设置中的记录（智能体名称 → `"on"` / `"off"` / 模式；没有 frontmatter 字段），它按每次任务进行判断，而不是无条件预备切换。如果智能体的 frontmatter、`task.prewalk` 和 `task.agentPrewalk` 均未解析出目标，`"on"` 或模式条目会在启动时将任务文本发送一次给自动 prewalk 使用的同一原生判定器；`"on"` 会移交给 `prewalk.autoTarget`，其他值则作为目标模型模式或角色。无条件 prewalk 优先，且不会经过判定。参见[子代理 prewalk](./prewalk.md#subagent-prewalk)。
- `advisor: true` 会为该智能体启动的会话配备顾问，其运行模型由 `advisor` 角色解析得到；字符串值（例如 `advisor: "deepseek/deepseek-v4-flash"` 或 `advisor: "@smol:high"`）设置显式顾问模型模式（可选 `:level` 后缀），应用为新启动会话的 `modelRoles.advisor`。`task.agentAdvisor` 设置记录（智能体名称 → `"on"` / `"off"` / 模式，通过 `/agents` 中枢的 advisor 条按智能体配置）覆盖 frontmatter。解析在 `runSubprocess`（`src/task/executor.ts`）中进行；子代理默认没有顾问，有效的启用选择会持久化到 `session_init`，以便冷恢复时恢复。

## 基于角色的自定义智能体 \{#role-backed-custom-agents}

OMP 从 `~/.omp/agent/agents/*.md` 发现用户智能体，从 `.omp/agents/*.md` 发现项目智能体。

在 frontmatter 中为智能体指定角色别名，然后按名称派发。对于模型路由，task 派发只设置 `agent`，不设置工作模型：

`~/.omp/agent/agents/reviewer.md`：

```md
---
name: reviewer
description: Review a change for correctness.
model: "@review"
---

Review the assigned change and report concrete findings.
```

在 `~/.omp/agent/config.yml` 中设置角色映射：

```yaml
modelRoles:
   review: openai/gpt-5.4:high
```

`@review` 通过 `modelRoles.review` 解析。每个 `modelRoles.<role>` 值存储一个具体模型选择器，并可附加 `:high` 等思考后缀（`src/config/model-resolver.ts`）。更改该映射会影响后续 task 解析，无需编辑智能体定义。Task/eval 预检会在重新发现智能体之前重新加载当前全局、项目及显式叠加设置，因此在活动会话期间添加的智能体文件及其角色别名会基于同一个刷新后的配置状态解析。

使用默认批量 task 模式时，提供共享 `context`，以及每项的 `task` 和 `solutionSpace`。`solutionSpace` 描述任务的开放程度，而非其规模。仅在选择非默认智能体时设置 `agent`：

```json
{
	"context": "Review the current change in this repository.",
	"tasks": [
		{
			"agent": "reviewer",
			"task": "Report concrete correctness findings.",
			"solutionSpace": "Review cause and failure modes are open; no known defect."
		}
	]
}
```

`/model` 的 Roles 视图可以分配并持久化 `review`、`fast` 和 `good` 等自定义角色映射。仅更改当前或默认会话选择不会重新映射这些角色。

## 用户标记的模型智能体 \{#user-tagged-model-agents}

在输入框中键入 `^`，从与 `Alt+P` 会话选择器相同的范围和排序中选择模型。接受补全会插入显示其名称的原子标签块。例如，键入 `Have ^`，选择模型，再接着输入 `review this change`。

提交时，每个首次提及的模型会获得分支内的化名（`m1`、`m2`、…）。用户消息携带 `<model agent="m1" name="Display Name"/>`；task 描述列出其提供方/模型选择器。`task`、eval `agent()` 和 `workpool()` 接受该化名作为其 `agent`。这些智能体使用内置通用 task 模板，而非专用模板，且仅用于明确指定被标记模型的请求。

标记模型绝不会在会话中途重写面向模型的 `task` 描述：描述列出固化在当前基础提示中的化名，后续标签则在下一个用户回合以隐藏的 `session-agents` 系统通知送达。该通知与 eval 前置代码和工具清单增量使用相同通道，因此提供方缓存前缀保持字节级稳定。下一次基础提示重建时，会将当前集合纳入描述。

化名在 `/resume` 后仍保留；回退到模型首次提及之前会释放其编号。重复同一选择器会复用其化名。未知选择器保留为字面文本，`!`/`$` 本地执行草稿中的提及也是如此。标记要求以空白字符为边界：自动补全会添加尾随空格。当一个草稿中两个模型的显示名称相同时，第二个保留为字面选择器，以避免展开歧义。

### 推理强度级别后缀 \{#effort-level-suffix}

标签可以通过完整选择器上的级别后缀设置子代理初始推理强度，例如 `^anthropic/claude-opus-5-5:high`。在输入框中，在提及后键入 `:` 会列出冒号前文本排名最高的三个模型支持的级别。例如，键入 `^opus:` 并选择一行，即可插入 `^anthropic/claude-opus-5-5:high`。包含已输入文本的模型 ID，例如 `qwen3:8b` 或 `glm-4.7:max`，会列在级别行之前。注册需要精确的 `provider/id`，可以带或不带级别。标签块显示级别（"Claude Opus 5.5 · high"），每个模型与级别组合都有自己的化名：在一个会话中分别以 `high` 和 `low` 标记同一模型，会获得 `m1` 和 `m2`。

- 不带级别时，智能体遵循常规 task 推理强度策略：task 模板的 `auto` 思考，或在 `task.enableEffort` 暴露时采用 task 条目的 `effort` 提示。`:auto` 与无后缀是同一标签。
- 带级别时，标记的级别就是子代理的初始推理强度。task 条目的 `effort` 提示会被忽略，`task.maxEffort` 和 `providers.autoThinkingMaxEffort` 都不会限制标记的级别。
- 为带级别标签的智能体指定[单次调用 `model`](#per-call-model) 会在预检时因冲突错误而失败，即使它重复的是标签中的选择器。省略 `model` 以使用标记的模型和推理强度。
- 部分路由仍会在启动前更改模型或级别：`task.agentModelOverrides`、替换模型模式的 `before_subagent_spawn` 处理程序，以及回退到父会话模型的认证回退。
- 启动后，对焦子代理上的 `/effort`、prewalk 移交或重试回退都可以更改级别，与任何其他子代理相同。
- 只有模型支持的级别才能注册标签；`:off`、`:inherit`、不支持的级别，以及完整选择器是另一模型 ID 的缩写（在字面模型 `…:max` 旁使用 `:ma`）都会保留为字面文本。
- 级别名称接受与 `--thinking` 相同的无歧义缩写，标签块显示完整名称。`:hi` 表示 `high`，`:lo` 表示 `low`。task 工具的 `effort` 提示则是相对的：`effort: "hi"` 选择模型支持的最高级别，`effort: "lo"` 选择最低级别，后者可能是 `minimal`。
- 在正文中要求某个推理强度，例如“以高推理强度使用此模型”，不会设置级别。委派模型只能传递粗粒度 `effort` 提示，且仅在 `task.enableEffort` 开启时可以。要自行选择级别，请为标签添加后缀。

会话定义追加在发现的智能体之后，因此已有的同名智能体优先。常规启动限制和模型覆盖优先级仍适用。合成提示不能注册模型。

## 查看运行中的智能体 \{#watch-running-agents}

派发后，按 `Alt+A` 打开[智能体中枢](./agent-hub.md)。其实时清单显示每个 task 智能体的状态、当前活动、模型、存续时间和用量。选择智能体可阅读其会话记录并直接引导它；停放的智能体也可从同一视图恢复。启用 `tui.mouse` 后，还可以点击实时 task 卡片和跳转列表行，或查看编辑器上方固定的 `Subagents` 区块。

### `vibe_spawn` 层级路由 \{#vibe_spawn-tier-routing}

`vibe_spawn` 将 `fast` 映射到内置 `sonic`，将 `good` 映射到内置 `task`。两者都会先通过 `task.agentModelOverrides` 解析，再使用内置智能体的模型默认值（`src/vibe/runtime.ts`、`src/task/agents.ts`）。

将别名保留在 `task.agentModelOverrides` 中，将具体选择器仅放在 `modelRoles` 中，即可通过角色路由这些层级：

```yaml
task:
   agentModelOverrides:
      sonic: "@fast_worker"
      task: "@good_worker"
modelRoles:
   fast_worker: openai/gpt-5-mini
   good_worker: openai/gpt-5.4:high
```

`vibe_spawn` 的 `cli` 仍为 `fast` 或 `good`；更新 `modelRoles` 即可更改工作模型。

## 内置智能体 \{#bundled-agents}

内置智能体在构建时使用文本导入嵌入（`src/task/agents.ts`）。

`EMBEDDED_AGENT_DEFS` 定义：

- 来自提示文件的 `scout`、`reviewer` 和 `security-reviewer`
- 来自共享 `task.md` 正文加注入 frontmatter 的 `task` 和 `sonic`；没有内置智能体设置 `prewalk`，通用 `task` 智能体的移交由 `task.prewalk` 设置（默认关闭）预备，也可通过 `/agents` / `task.agentPrewalk` / 用户智能体 frontmatter 按智能体预备，或通过 `task.agentPrewalkAuto` 按任务判定

加载路径：

1. `loadBundledAgents()` 使用 `parseAgent(..., "bundled", "fatal")` 解析嵌入的 markdown
2. 结果缓存在内存中（`bundledAgentsCache`）
3. `clearBundledAgentsCache()` 是仅用于测试的缓存重置

由于内置解析使用 `level: "fatal"`，不可恢复的 YAML 错误或无效必填字段会抛出异常，可能导致整个发现过程失败。

## 文件系统与插件发现 \{#filesystem-and-plugin-discovery}

`discoverAgents(cwd, home, extensionRoots?)`（`src/task/discovery.ts`）先合并来自 OMP 原生根目录、OMP 扩展包和 Claude 市场插件根目录的智能体，再追加内置定义。`.claude/agents` 和 `.codex/agents` 等直接跨 harness 根目录会被有意跳过，它们的 frontmatter 模式不符合 OMP task 智能体约定（`TASK_AGENT_CONFIG_SOURCE = ".omp"` 会过滤原生配置目录列表）。

### 发现输入与优先级 \{#discovery-inputs-and-precedence}

1. 来自 `findAllNearestProjectConfigDirs("agents", cwd)` 的最近项目 `.omp/agents` 目录（只取第一个 `.omp` 匹配）
2. 来自 `getConfigDirs("agents", { project: false })` 的用户 `.omp/agents` 目录（只取第一个 `.omp` 匹配）
3. `listOmpExtensionRoots(...)` 返回的每个已启用 OMP 扩展包的 `<extension-root>/agents`，顺序如下：
   - 显式 CLI `--extension` / SDK `additionalExtensionPaths` 目录根路径
   - 会话有效的 `extensions:` 数组，按配置顺序
   - 已安装的 npm/link 插件
     项目和用户的 `extensions:` 数组不会拼接：设置采用数组替换优先级。会话叠加/运行时覆盖，以及配置数组的项目/用户来源信息会保留。在 `explicit-only` 模式（`--no-extensions` 或 SDK `disableExtensionDiscovery`）下，只有显式根目录会贡献此包接口；文件入口点没有可扫描的 `agents/` 子目录。
4. 带 `agents/` 子目录的市场插件根目录（`listClaudePluginRoots(home, cwd)`：OMP 市场安装、项目插件注册表和 `--plugin-dir` 根目录），仅在 `isProviderEnabled("claude-plugins")` 时使用；项目范围插件排在用户范围之前。不读取 Claude Code 自己的 `~/.claude/plugins` 注册表。
5. 内置智能体（`loadBundledAgents()`）

当 `omp-plugins` 能力提供方被禁用时，OMP 扩展包接口也会禁用。市场根目录不包含在 `listOmpExtensionRoots` 中，只通过单独受开关控制的 Claude 插件路径进入。

Claude 方言插件智能体会丢弃其 frontmatter 中的 `model`，防止将 Claude 别名误读为 OMP 选择器，并将其 `tools` 从 Claude Code 名称（`Read`、`WebFetch`、`TodoWrite`、`AskUserQuestion`、`MultiEdit`、`Agent`、…）转换为 OMP 内置工具；没有等效项的名称（如 `ExitPlanMode`）保持不变。这适用于外部 Claude 根目录，以及清单声明为 Claude 格式的包，包括 OMP 安装或 `--plugin-dir` 根目录。OMP 原生包和 Agent-Plugins 标准包保留其模型选择器和 OMP 工具名称。

## 合并与冲突规则 \{#merge-and-collision-rules}

发现过程按精确的 `agent.name` 去重，先出现者优先：

- 使用 `Set<string>` 跟踪已出现的名称。
- 加载的智能体按目录顺序展开，仅保留尚未出现的名称。
- 内置智能体针对同一集合过滤，只有名称仍未出现时才添加。

由此可知：

- 项目 `.omp` 覆盖用户 `.omp`。
- 较早的扩展根目录覆盖较晚的扩展根目录、Claude 市场插件和内置智能体。
- 非内置智能体覆盖同名内置智能体。
- 名称匹配区分大小写（`Task` 和 `task` 不同）。
- 同一目录内，markdown 文件在去重前按文件名的字典顺序读取。

## 无效/缺失智能体文件的行为 \{#invalidmissing-agent-file-behavior}

按目录处理（`loadAgentsFromDir`）：

- 不可读/缺失的目录：视为空（`readdir(...).catch(() => [])`）
- 文件读取或解析失败：记录警告，跳过文件
- 解析路径使用 `parseAgent(..., level: "warn")`

Frontmatter 失败行为来自 `parseFrontmatter`：

- 默认宽容解析器会规范化换行符和 kebab-case 键，替换 YAML 中的制表符，并能在报告失败前修复有歧义的普通标量
- 在 `warn` 级别下，无法恢复的解析错误会记录警告，然后回退到顶层 `key: value` 行
- 回退值会在可能时逐个按 YAML 解析，保留标量/数组类型
- 如果必填字段仍无效，`parseAgentFields` 失败，随后抛出 `AgentParsingError`，由目录加载器捕获（跳过文件）

最终效果是：一个有问题的自定义智能体文件不会中止其他文件的发现。

## 智能体查找与选择 \{#agent-lookup-and-selection}

查找采用精确名称的线性搜索：

- `getAgent(agents, name)` => `agents.find(a => a.name === name)`
- 不受限制的会话将省略的 `agent` 字段默认为 `task`
- 受限父级的 `spawns` 列表会将省略的 `agent` 字段默认为列表中的第一个智能体

`resolveEffectiveSubagentPolicy()` 由 task 和基于 eval 的子代理启动共享。它在分配产物之前：

1. 原子地重新加载活动会话持久化的全局、项目和显式叠加设置，同时保留运行时覆盖
2. 从父级启动策略解析省略或显式指定的智能体名称
3. 执行深度、阻止自递归和父级启动策略防护检查
4. 使用会话的 cwd 和有效扩展根目录配置重新发现智能体，追加用户标记的会话智能体，并进行精确查找
5. 检查 `task.disabledAgents`
6. 解析计划模式限制、输出模式、模型策略和隔离策略

缺失的名称会在预检时以 `Unknown agent "...". Available: ...` 失败；不会运行子进程。

### 描述与执行时发现 \{#description-vs-execution-time-discovery}

`TaskTool.create()` 在构建面向模型的工具描述时，按解析后的工作目录和完整有效扩展根目录配置记忆缓存发现结果。每次读取描述还会包含冻结在当前基础提示接口中的用户标记模型智能体（参见[用户标记的模型智能体](#user-tagged-model-agents)），而非实时集合，因此在会话中途标记模型不会改变提供方工具前缀。执行时会重新发现智能体并合并实时会话智能体，因此如果智能体或扩展文件在会话中途变化，运行时集合可能与较早的描述不同。阻塞行为在策略解析后确定，而非依据过时的描述阶段智能体对象。

## 模型与结构化输出优先级 \{#model-and-structured-output-precedence}

对于 task 派发，模型优先级为：

1. `task.agentModelOverrides[agentName]`
2. 智能体 frontmatter 中按优先级排列的 `model` 列表
3. 父级的当前模型，然后是其配置的/默认模型回退

调用中的单次调用 `model`（task 条目 / 扁平调用、eval `agent()` / `workpool()`；见下文）在获批后替代第 2 和第 3 步。对于具有第 1 步条目的智能体，或标签指定了级别的提及智能体，它会引发冲突错误，而不是取得更高优先级。第 1 和第 2 步中的角色别名通过 `modelRoles` 展开。宿主调用方（SDK `runStructuredSubagent({ model })`、`omp cleanse --model`）在设置覆盖之前提供不受门控的模型。

### 单次调用 `model` \{#per-call-model}

`task.perCallModel` 决定面向模型的调用可以在哪些接口选择模型：

| 值 | 行为 |
| --- | --- |
| `off`（默认值） | 传入 `model` 的 task 条目、扁平调用、`agent()` 或 `workpool()` 在预检时失败。task 模式不声明该字段，但传入的字段仍会到达预检；空的 task `model`（`""`）视为省略。 |
| `eval` | 仅由 eval `agent()` 和 `workpool()` 接受；task 条目行为与 `off` 相同。可用它从脚本中路由专用智能体（例如固定模型的 `reviewer`），而普通委派仍保持配置的路由。 |
| `on` | 所有接口都接受。 |

只有操作员的配置层可以开启它：项目的 `task.perCallModel` 可以降低模式（`on` → `eval` → `off`），但不能提高。

对于每一种单次调用选择器，空值或空白字符串形式的 `model`，以及空数组，都视为省略：task 条目、扁平调用、`agent()` 或 `workpool()` 会使用智能体配置的模型，而不是在门控检查时失败。

单次调用 `model` 是一个精确的 `provider/model-id[@upstream][:level]`（例如 `anthropic/claude-sonnet-4-5:high`）。可选的 `@upstream` 固定项仅由聚合器支持，属于模型身份的一部分：在审批中，固定路由与未固定路由是不同模型。可选的 `:level` 会限制到模型支持的级别，仍受 `task.maxEffort` 约束；字面目录 ID 优先于拆分看似级别的后缀。显式 `:level` 也优先于同一条目的粗粒度 `effort` 提示；没有显式级别或使用 `:auto` 时，由提示选择级别。角色别名（包括 `@default` 以及指定内置或已配置自定义角色的旧版 `pi/<role>`）、数组、逗号列表、通配模式和部分 ID 都会在预检时失败；当 `task.perCallModel` 拒绝该调用时，会先报告这一错误。它会与可用聊天模型进行字面匹配；不进行模糊解析，非聊天模型会以该原因被拒绝。

该模型必须是操作员已路由到的模型之一：

- 操作员配置层中已配置聊天角色的 `modelRoles` 值（全局配置、`--config` 文件、运行时覆盖或 SDK 宿主设置，绝不包括项目设置；`image`、`web` 和 `judge` 等非聊天角色不授予任何许可，值内部的角色别名也不会展开为内置默认值），
- 所选智能体自身 frontmatter 中的 `model`，仅限该智能体为内置或用户级、仍被发现且未被禁用时（项目智能体的 frontmatter 从不直接授予许可，仓库智能体文件也无法向 `task.perCallModelAllow` 添加条目；但其 frontmatter 模型与任何智能体的实时模型一样，可以被批准供其单次调用子代理及更下层传递使用；其他智能体的 frontmatter 不授予任何许可），
- 父级的实时模型，仅限其路由可写为一个精确选择器时（多个 `only` 上游、`order` 列表或任何其他路由字段均不授予许可）。

未标记级别的用户标记 `^provider/model` 提及智能体（`m<N>`）使用内置 task 模板，并以标记的模型作为其自身 frontmatter，因此选择它也会授予该模型许可，但仍须通过相同的发现、禁用智能体和允许列表检查。

许可值的匹配方式：

- 字面 ID 会对照完整目录检查，包括不可用的模型。不可用的 `x:low` ID 绝不会授予基础模型 `x` 的许可，ID 中的方括号（`[1m]`）按字面处理。
- 包含 `*` 或 `?` 的值无论在角色还是智能体 frontmatter 中都不授予许可。它仍照常路由该角色或智能体；要允许单次调用模型，操作员需精确指定其名称。
- 任何其他值都会授予其解析到的一个模型的许可，解析使用在启动或恢复时捕获的最近使用顺序和操作员的 `modelProviderOrder`；后续模型切换不会改变该解析结果。

目录成员身份、凭据、内置角色默认值和保存的会话记录不授予任何许可。设置 `task.perCallModelAllow` 时，它会缩小结果范围：每个去除首尾空白的条目都与模型规范化的 `provider/id[@upstream]` 做字面比较（不解析、不拆分 `:level`、不使用通配模式或裸 ID），模型必须同时已获许可且位于列表中。项目列表会进一步缩小范围：模型必须同时列在两者中，因此项目列表，包括空列表，绝不会替换操作员的列表。

许可来自操作员的设置或 SDK 宿主的设置实例；宿主创建的普通 `Settings.overlay()` 自身就是权限依据，包括其中的角色和允许列表。项目设置（`.omp/config.yml`、`.omp/settings.json`）和为子代理派生的设置叠加从不授予许可，而是服从操作员的权限依据；它们只能通过 `task.perCallModel`、`task.perCallModelAllow` 和 `task.disabledAgents` 缩小范围。智能体可以写入仓库文件，而且每次启动前都会重新加载设置，因此若不如此，会话中途写入其中的角色就可能批准它自己的模型。角色和允许列表编辑会实时生效，因此移除角色会使其停止授予许可。

操作员自己的文件仍受信任：全局配置、`--config` 文件和用户级智能体文件按其内容授予许可，任何能够编辑它们的主体都可以像更改其他设置一样更改许可。门控仅覆盖传入 `model` 的调用；不带该字段的调用仍与之前一样通过 `task.agentModelOverrides`、智能体 frontmatter 和 `modelRoles` 路由，包括项目层。

当某个接口启用单次调用选择时，task/eval 工具描述会列出已批准的角色模型和用于缩小范围的允许列表。带提供方限定的角色值按配置列出，不检查可用性；裸值通过当前注册表解析为精确的 `provider/model-id` 选择器，无法解析时省略。通配模式角色值不授予许可，也不会列出。声明内容与派发使用相同的字面允许列表比较。

为具有 `task.agentModelOverrides` 条目的智能体指定 `model` 会在预检时因冲突错误而失败，因此不会静默替换操作员的覆盖。为标签指定了级别的提及智能体指定 `model` 也会同样失败，即使它重复标签中的选择器，因为单次调用选择会将用户选择的推理强度限制到 `task.maxEffort`（[推理强度级别后缀](#effort-level-suffix)）。

单次调用工作智能体绝不会转到未经批准的主循环模型。重试回退、上下文提升和智能体 prewalk 均关闭；请求模型不可用或缺少有效凭据会导致调用失败，而不是使用父级模型。其请求绝不携带服务端回退链，包括调用方提供的回退链。提供方附加服务端回退链的工厂模型不会因此被拒绝：单次调用请求会省略该链，如果响应由另一个模型提供（或携带回退移交块），则在转发任何内容之前就使工作智能体失败。每个主循环请求都会根据当前操作员许可检查，因此扩展替换或设置变化无法将工作智能体移至未批准模型；该判定会复用，直到设置或模型目录发生变化。如果预检时注册表尚未就绪，或模型在后台发现期间尚未找到，则在发现完成后、创建子会话前再次检查。

冷恢复会等待模型发现，只恢复保存的精确 `perCallModelIdentity` 路由和 `perCallThinkingLevel` 选择器，并在创建子会话前及每个主循环请求时重新检查当前许可。所选智能体通过活动的真实父会话重新发现，包括该父级本地的提及智能体；当嵌套工作智能体的父级不处于活动状态时，根级发现只提供文件定义的智能体，绝不提供根级本地的提及智能体。当前配置的角色以及已发现且已启用的内置/用户 frontmatter 即使没有活动父级也仍可授予许可。父级模型仅在工作智能体的真实父级处于活动状态时授予许可（对于根会话的直接子代理，即根会话）；缺失父级本地许可时，会拒绝恢复，并报错指示操作员先恢复父级。恢复绝不会自动唤醒父级，也不会将保存的许可元数据视为授权。缺少任一规范字段的旧版单次调用记录会被拒绝恢复，而不是从 `resolvedModel` 猜测。更改 `task.perCallModel` 只影响新调用。

会话为维护而发起的附带请求（上下文压缩摘要和顾问调用）不受主循环审批检查覆盖：上下文压缩会尝试模型的 `compactionModel`、会话模型和内置聊天角色的模型，然后还会尝试可用模型中上下文窗口最大的模型。

对于单次调用 `model`，`task.maxEffort` 约束每次单次调用模型的启动，而非端点最终的行为：显式 `:level` 会被限制到不高于上限的最高受支持推理强度，省略 `:level` 则继承智能体的思考级别，并以此值为上限。未设置、`:inherit` 和 `:off` 保持原有含义；该上限不会将它们替换为显式推理强度，也不会更改提供方默认值。如果模型在上限以下没有受支持的推理强度，启动及后续每个请求都会失败。冷恢复会对保存的推理强度选择器重新应用当前上限。端点自身的推理强度协商重试仍可能取到最近的受支持档位，包括高于请求的档位（例如 `minimal` → `low` 或 `xhigh` → `max`）。

策略解析后，`before_subagent_spawn` 扩展钩子会针对实际派发运行一次。它可以阻止启动或替换已解析的模型模式；路由说明会带入进度元数据。

`Alt+P` 的 task 模型选择仅在当前会话生效；在 `/agents` 中保存模型会替换当前会话的运行时选择，并将新值持久化供未来会话使用。

上下文压缩触发条件独立于模型和服务层级选择：精确且区分大小写的
`task.agentCompactionThresholdOverrides[agentName]` 条目（`90000` 或 `"80%"`）只会替换
该智能体的 `compaction.threshold*` 设置；没有条目的智能体，包括它启动的智能体，
使用主会话阈值。参见[设置](./settings.md#context-compaction-and-memory)。

请求预算遵循相同的精确名称模式：`task.agentSoftRequestBudget[agentName]` 条目
（非负整数）是该智能体的软请求预算，同时替换 `task.softRequestBudget`
和内置 scout/sonic 上限，因此可以提高全局设置只能降低的预算；`0`
禁用该智能体的防护，`null` 清除较低设置层的条目。没有
条目的智能体保留全局设置，并受其内置上限约束。参见 [task](./tools/task.md#limits--caps)。

服务层级优先级独立于模型选择：精确且区分大小写的
`task.agentServiceTierOverrides[agentName]` 条目覆盖 `tier.subagent`；缺少条目则保留
全局行为。`inherit` 会为下一次启动快照父会话当前按模型家族划分的层级（包括
`/fast` 更改）。子会话会根据最终确定的模型解析具体值，
这发生在认证回退以及只有会话能解析的模式（例如
扩展注册的模型）处理之后；只有在该模型的提供方家族支持该值时，才填充该家族，
因此同家族重试回退保留层级，而跨家族回退绝不会
继承它。解析后的映射会随子会话持久化，即使为空也是如此，因此
停放的智能体在重启后恢复时会保留其按智能体设置的层级，而不是重新推导
`tier.subagent`。该条目只由 task/eval 派发查找；通过
同一执行器启动的 Vibe 工作智能体保留 `tier.subagent`。服务层级只通过配置设置；智能体 frontmatter 和
task/eval 传输格式不暴露层级字段或自动 Fast 策略。

账户选择独立于模型和服务层级选择：精确且区分大小写的
`task.agentAccountPools[agentName]` 条目将提供方 ID 映射到 OAuth 身份键（代理器
[客户端账户池](./auth-broker-gateway.md#client-account-pools)使用的 `identityKey`
值，例如 Anthropic 的 `email:<address>|org:<id>`；[`omp usage accounts`](./cli-reference.md)
会列出这些值）。对于每个列出的提供方，子代理
只使用这些账户认证：排名、从父级复制的账户亲和性、恢复的固定选择、回退
轮次、凭据轮换和已保存重置恢复均保持在池内，而且不会使用运行时、
环境和存储的 API 密钥；
如果提供方在 `models.yml` 中有 `apiKey`，会导致请求失败，而不是向该端点发送池中的
令牌。当没有池内账户可以服务时，请求以 `No API key for
provider: … restricted to its OAuth account pool` 失败，而不是借用其他账户；空
列表不允许任何账户。即将过期的已保存重置仍会在每个账户上被挽救，因为
挽救服务于持有该重置的账户。池不选择模型，因此模型和重试回退策略仍决定
子代理调用哪个提供方。池涵盖智能体执行的每次密钥查找，无论其携带哪个提供方
会话 ID：新会话或重置会话、顾问、标题生成、技能压缩，以及
它启动的、没有自身条目的子代理（子代理自己的条目会替换继承项）。Vibe 工作智能体从
第一回合就使用该池，在同一进程中或重启后恢复的停放智能体
会采用其智能体名称对应的当前条目。自定义 SDK `getApiKey` 解析器会绕过池。

运行时输出模式优先级为：

1. task 条目显式指定的 `outputSchema`
2. 智能体 frontmatter 的 `output`
3. 父会话的 `outputSchema`

Task 条目可选的 `schemaMode` 覆盖父会话模式；默认值为 `permissive`。

这些模式仅适用于结构化运行。`task.structured` 关闭时（默认），task 启动不会获得输出模式或 `yield` 工具，而是返回最终助手消息，但定义设置了 `structured: true` 的智能体除外；由于 task 条目的 `outputSchema` 不暴露，这些智能体先解析智能体 `output`，再解析父会话模式。Eval `agent()` 和 workpool 启动始终是结构化的。

两种模式下，显式调用方模式都会在预检期间验证。当有效模式为 `strict` 时，智能体/会话模式也会在预检时验证。无效模式会在子代理执行前导致失败。

面向模型的提示（`src/prompts/tools/task.md`）会标记只读智能体，并警告不要将推理工作交给 `scout`/`sonic`。

## 命令发现的交互 \{#command-discovery-interaction}

`src/task/commands.ts` 是用于工作流命令（而非智能体定义）的并行基础设施，但遵循相同的总体模式：

- 先从能力提供方发现
- 按名称去重，先出现者优先
- 如果仍未出现，则追加内置命令
- 通过 `getCommand` 按精确名称查找

在 `src/task/index.ts` 中，命令辅助函数与智能体发现辅助函数一起重新导出。智能体发现本身在运行时不依赖命令发现。

## 发现之外的可用性约束 \{#availability-constraints-beyond-discovery}

智能体可能可以被发现，却仍因执行防护而无法运行。

### 禁用智能体设置 \{#disabled-agent-settings}

`resolveEffectiveSubagentPolicy()` 在解析智能体后检查 `task.disabledAgents`。被禁用的名称会在预检时失败，并在存在可用替代项时列出它们。

### 父级启动策略 \{#parent-spawn-policy}

解析器检查 `session.getSessionSpawns()`：

- `"*"`（以及 `true`、`null` 或缺省）=> 允许任意智能体；省略 `agent` 时默认为 `task`
- `""` 或 `false` => 全部拒绝
- CSV 列表 => 只允许列出的名称；省略 `agent` 时默认为第一个名称

被拒绝时：`Cannot spawn '...'. Allowed: ...`。

### 阻止自递归的环境防护 \{#blocked-self-recursion-env-guard}

`PI_BLOCKED_AGENT`（或内部请求覆盖）会在发现前拒绝启动同一个被阻止智能体的尝试。

### 递归深度门控 \{#recursion-depth-gating}

`task.maxRecursionDepth` 默认值为 `2`；负值禁用上限。深度从顶层会话（深度 `0`）开始计数，因此 `0` 会从顶层会话移除 `task` 并完全禁用子代理，而 `1` 允许一代无法嵌套的子代理。当当前 task 深度已达到上限时，共享策略会拒绝启动。当子代理达到上限时，`runSubprocess` 还会从其工具列表中移除 `task`，并将其启动策略设为空。

对于显式智能体工具列表，当声明了 `spawns` 且深度允许时，`runSubprocess` 会自动添加 `task`。旧版 `exec` 条目在 eval 后端可用时会展开为 `bash` 加 `eval`。包含 `task` 或 `bash` 的列表还会获得 `wait`，除非父级要求严格受限的工具列表；没有异步、IRC 或服务唤醒来源时，工具构造仍会省略 `wait`。向外发送同级消息要求子代理工具列表包含 `write` 且 IRC 已启用；接收引导则不需要。

## 计划模式行为 \{#plan-mode-behavior}

当父级计划模式启用时，`resolveEffectiveSubagentPolicy()` 会在启动子进程前构建 `effectiveAgent`：

- 前置计划模式子代理系统提示
- 将工具限制为 `read`、`grep`、`glob` 和 `web_search`，如果智能体自己的工具列表声明了 `ast_grep`，也包含它
- 清空子代理启动能力
- 清除 `prewalk`（只读探索不应收到 prewalk 计划/实现引导提示）

计划模式还会拒绝 eval 定义的工具，以及每次启动的隔离、应用和合并控制。子进程启动、模型/思考覆盖和输出模式选择均使用同一个 `effectiveAgent`。
