---
title: "规则手册匹配流水线"
description: "Oh My Pi 官方仓库文档：规则手册匹配流水线。"
---

# 规则手册匹配流水线 \{#rulebook-matching-pipeline}

本文描述 coding-agent 如何从受支持的配置格式中发现规则，将其规范化为统一的 `Rule` 结构，解决优先级冲突，并将结果划分为：

- **规则手册规则**（通过系统提示 + `rule://` URL 提供给模型）
- **TTSR 规则**（时间旅行流规则）

本文反映当前实现，包括部分实现的语义，以及已解析但未强制执行的元数据。

## 实现文件 \{#implementation-files}

- [`packages/coding-agent/src/capability/rule.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/rule.ts)
- [`packages/coding-agent/src/capability/rule-buckets.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/rule-buckets.ts)
- [`packages/coding-agent/src/capability/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/capability/index.ts)
- [`packages/coding-agent/src/discovery/index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/index.ts)
- [`packages/coding-agent/src/discovery/helpers.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/helpers.ts)
- [`packages/coding-agent/src/discovery/builtin.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/builtin.ts)
- [`packages/coding-agent/src/discovery/omp-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/omp-plugins.ts)
- [`packages/coding-agent/src/discovery/builtin-defaults.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/builtin-defaults.ts)
- [`packages/coding-agent/src/discovery/agents.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/agents.ts)
- [`packages/coding-agent/src/sdk.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/sdk.ts)
- [`packages/coding-agent/src/system-prompt.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/system-prompt.ts)
- [`packages/coding-agent/src/internal-urls/rule-protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/internal-urls/rule-protocol.ts)
- [`packages/coding-agent/src/cli/ttsr-cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/cli/ttsr-cli.ts)
- [`packages/utils/src/frontmatter.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/utils/src/frontmatter.ts)

发现的 Markdown 规则使用 `discoverRuleFromMarkdown`；frontmatter 中的 `enabled: false` 会在按名称去重之前排除该文件。`buildRuleFromMarkdown` 是显式加载变体，不应用此发现过滤器。

## 1. 规范规则结构 \{#1-canonical-rule-shape}

所有提供方都将源文件规范化为 `Rule`：

```ts
interface Rule {
	name: string;
	path: string;
	content: string;
	globs?: string[];
	alwaysApply?: boolean;
	description?: string;
	condition?: string[];
	astCondition?: string[];
	question?: string;
	scope?: string[];
	agents?: string[];
	interruptMode?: "never" | "prose-only" | "tool-only" | "always";
	repeatMode?: "once" | "after-gap" | "always";
	_source: SourceMeta;
}
```

能力标识为 `rule.name`（`ruleCapability.key = rule => rule.name`）。

这意味着：优先级和去重**仅基于名称**。具有相同 `name` 的两个不同文件会被视为同一条逻辑规则。

## 2. 发现来源与规范化 \{#2-discovery-sources-and-normalization}

`src/discovery/index.ts` 自动注册提供方。对于 `rules`，当前提供方为：

- `native`（优先级 `100`）
- `omp-plugins`（优先级 `90`）：已配置扩展包根目录内的 `rules/*.{md,mdc}`，通过共享的 `buildRuleFromMarkdown` 路径进行规范化
- `agents`（优先级 `70`）
- `builtin-defaults`（优先级 `1`）

### 原生提供方（`builtin.ts`） \{#native-provider-builtints}

从以下位置加载 `.omp` 规则：

- 项目规则：当 cwd 的 `.omp/` 目录非空时，加载 `<cwd>/.omp/rules/*.{md,mdc}`
- 用户规则：`<active-native-agent-dir>/rules/*.{md,mdc}`
- 用户常驻规则：`<active-native-agent-dir>/RULES.md`
- 项目常驻规则：从 cwd 向仓库根目录遍历时选中的最近的非空 `.omp/` 目录中的 `RULES.md`；若该目录缺少此文件，OMP 不会继续向更远处查找

当前原生智能体目录默认为 `~/.omp/agent`，会随具名配置档案变化，并遵循 `PI_CODING_AGENT_DIR`。

规范化：

- `name` = 去掉 `.md`/`.mdc` 的文件名
- frontmatter 通过 `parseFrontmatter` 解析
- `content` = 正文（去除 frontmatter）
- `globs`、`alwaysApply`、`description`、`condition`/旧版 `ttsr_trigger`、`astCondition`、`question`、`scope`、`agents`、`interruptMode` 和 `repeatMode` 由 `buildRuleFromMarkdown` 解析
- 用户常驻 `RULES.md` 命名为 `RULES`；项目常驻 `RULES.md` 命名为 `RULES@project`；两者都被强制设为 `alwaysApply: true`

不同的常驻名称允许用户和项目内容共存。原生条目的追加顺序为项目规则、用户规则、用户常驻 `RULES.md`，然后是项目常驻 `RULES.md`；较早出现且使用任一常驻名称的普通规则，仍可能遮蔽该常驻文件。

重要注意事项：看起来像文件 glob 的 `condition` 值会转换为 `tool:edit(...)` / `tool:write(...)` 作用域简写，并使用匹配所有内容的条件 `.*`。

### Agents 提供方（`agents.ts`） \{#agents-provider-agentsts}

从 `.agent` 和 `.agents` 两种目录中加载：

- 项目：从 `cwd` 向上遍历到仓库根目录，加载 `<ancestor>/.agent/rules/*.{md,mdc}` 和 `<ancestor>/.agents/rules/*.{md,mdc}`
- 用户：`~/.agent/rules/*.{md,mdc}` 和 `~/.agents/rules/*.{md,mdc}`

规范化使用共享的 `buildRuleFromMarkdown` 路径：名称从文件名派生，正文去除 frontmatter，并解析 `globs`、`alwaysApply`、`description`、`condition`/旧版 `ttsr_trigger`、`astCondition`、`question`、`scope`、`agents`、`interruptMode` 和 `repeatMode`。

## 3. Frontmatter 解析行为与歧义 \{#3-frontmatter-parsing-behavior-and-ambiguity}

所有提供方都使用 `parseFrontmatter`（`utils/frontmatter.ts`），其语义如下：

1. 仅当内容以 `---` 开头且存在闭合的 `\n---` 时，才解析 frontmatter。
2. 提取 frontmatter 后，会去除正文首尾空白。
3. 如果整份文档的 YAML 解析失败：
   - 记录一条警告，
   - 解析器回退到简单的 `key: value` 逐行解析（`^([\w-]+):\s*(.*)$`），
   - 每个捕获值都会独立重新按 YAML 解析，只有仍无法解析的值才保留为去除首尾空白的原始字符串。

回退限制：

- 不会重建多行数组、嵌套对象以及其他依赖缩进的 YAML 结构。有效的单行流式值（例如 `[text, thinking]`）仍可在逐值重新解析后保留。
- 单个格式错误的值会保留为原始字符串；需要布尔值、列表或对象的提供方可能会丢弃该元数据。
- `ttsr_trigger` 在回退时有效（下划线键）；`thinking-level` 等带连字符的键也会被解析，并规范化为驼峰形式（`thinkingLevel`），键规范化也适用于 YAML 路径。
- 没有有效 frontmatter 的文件仍会作为规则加载，元数据为空，内容正文为全文。作用域解析器还容忍常见的格式错误回退值 `scope: "text","thinking"`，但推荐使用有效 YAML（`"text, thinking"` 或 `[text, thinking]`）。

## 4. 提供方优先级与去重 \{#4-provider-precedence-and-deduplication}

`loadCapability("rules")`（`capability/index.ts`）合并提供方输出，然后按 `rule.name` 去重。

### 优先级模型 \{#precedence-model}

- 提供方按优先级降序排列。
- 去重采用先到先得：保留首次遇到的规则名称；后续同名条目在 `all` 中标记为 `_shadowed`，并从 `items` 中排除。

当前生效的规则提供方顺序为：

1. `native`（100）
2. `omp-plugins`（90）
3. `agents`（70）
4. `builtin-defaults`（1）

### 提供方内部排序注意事项 \{#intra-provider-ordering-caveat}

在提供方内部，条目顺序来自 `loadFilesFromDir` 的 glob 结果顺序以及显式追加顺序。对正常使用而言，这种顺序具有足够的确定性，但代码中没有显式排序。

值得注意的来源顺序差异：

- `native` 依次追加项目 `.omp/rules`、用户 `~/.omp/agent/rules`、用户 `RULES.md`，最后是最近的项目 `RULES.md`。
- `omp-plugins` 按已配置的扩展包根目录追加 `rules/` 结果。
- `agents` 先追加项目遍历中的 `.agent`/`.agents` 规则目录，然后追加用户主目录中的目录。
- `builtin-defaults` 使用内嵌规则的源顺序。

## 5. 划分到规则手册、始终应用和 TTSR 桶 \{#5-split-into-rulebook-always-apply-and-ttsr-buckets}

在 `createAgentSession`（`sdk.ts`）中发现规则后，`bucketRules(...)` 会应用会话级过滤并分配桶：

1. 丢弃列入 `ttsr.disabledRules` 的规则。
2. 当 `ttsr.builtinRules === false` 时，丢弃来自 `builtin-defaults` 提供方的规则。
3. 丢弃 `agents` glob 不匹配会话智能体名称的规则（顶层会话为 `main`，否则为智能体定义名称）；没有 `agents` 的规则适用于每个智能体。
4. 将具有非空 `condition`、`astCondition` 或 `question` 的规则注册到 `TtsrManager`；注册成功后，该规则只属于 TTSR。
5. 将剩余的 `alwaysApply === true` 规则放入 `alwaysApplyRules`。
6. 将剩余的带有 `description` 的规则放入 `rulebookRules`。

### 桶的行为 \{#bucket-behavior}

- **TTSR 桶**：任何已启用、具有非空且已解析的 `condition`（正则表达式）、`astCondition`（ast-grep 模式）或 `question`（由模型评判），且被 `TtsrManager.addRule(...)` 接受的规则。优先于其他桶。
- **始终应用桶**：`alwaysApply === true`，且不属于 TTSR。完整内容注入系统提示。可通过 `rule://` 解析。
- **规则手册桶**：必须有描述，不得属于 TTSR，也不得为 `alwaysApply`。在系统提示中按名称和描述列出；通过 `rule://` 按需读取内容。
- 同时具有触发条件和 `alwaysApply` 的规则，只有在 TTSR 注册接受它时才只进入 TTSR；否则可能继续落入始终应用桶。
- 同时具有 `alwaysApply` 和 `description` 的规则，只进入始终应用桶（不进入规则手册）。

## 6. 元数据如何影响运行时呈现 \{#6-how-metadata-affects-runtime-surfaces}

### `description` \{#description}

- 纳入规则手册的必要条件。
- 在系统提示的规则手册块中呈现（默认模板中的 `<domain-rules>`，自定义提示模板中的 `<rules>`）。
- 缺少描述会使规则不出现在规则手册列表中；除非它属于始终应用规则或被接受的 TTSR 规则，否则也无法通过 `rule://` 寻址。

### `globs` \{#globs}

- 随 `Rule` 一同传递。
- 在默认提示的规则手册列表中内联呈现（`- <name> (<glob>, ...): <description>`）；自定义提示模板将其呈现为 `<glob>...</glob>` 条目。
- 暴露在规则 UI 状态中（`extensions` 模式列表）。
- 被 TTSR 用作全局路径门槛：如果 TTSR 规则有 glob，匹配上下文必须包含至少一个匹配的文件路径。
- 不用于为 `rule://` 自动选择规则手册规则；规则手册匹配仍是建议性的提示行为。

### `alwaysApply` \{#alwaysapply}

- 由提供方解析并保留。
- 用于 UI 显示（扩展状态管理器中的 `"always"` 触发标签）。
- 用作从 `rulebookRules` 中排除的条件。
- **完整规则内容会自动注入系统提示**（位于规则手册规则部分之前）。
- 规则也可通过 `rule://<name>` 寻址，以便重新读取。

### `agents` \{#agents}

- 将规则限制为适用于匹配的智能体。接受 YAML 序列、单个字符串或逗号分隔字符串；模式是转为小写的 glob 模式，与智能体定义名称（`scout`、`reviewer`、`foreman-*`）进行不区分大小写的匹配。允许 `{a, b}` glob 花括号组中逗号周围存在空白，并会将其规范化去除。
- 字面值 `main` 匹配顶层会话；没有定义名称的子代理回退为 `sub`。`main` 和 `sub` 都是保留名称：自定义智能体定义不能使用任一名称（`parseAgentFields` 会拒绝），因此这两个哨兵值都不会被真实智能体遮蔽。
- 省略（或空列表）意味着规则适用于每个智能体，这是原有行为。
- 过滤发生在会话创建及会话级提示重建期间的 `bucketRules(...)` 中，位于 TTSR 注册之前：不匹配的规则不加入任何桶，不会编译进 `TtsrManager`，也无法在该会话中通过 `rule://` 寻址。
- 子代理接收父级未过滤的已发现规则列表，并以自己的名称重新评估 `agents`，因此仅适用于 scout 的规则只会在 scout 中加载，不会在其他地方加载。

   ```yaml
   agents: [scout, "foreman-*"]
   ```

   ```yaml
   # Main agent only; every subagent ignores this rule:
   agents: main
   ```

### `condition`、`astCondition`、`question`、`scope`、`interruptMode` 和 `repeatMode` \{#condition-astcondition-question-scope-interruptmode-and-repeatmode}

- `condition` 是正则表达式 TTSR 触发字段；解析时接受旧版 `ttsr_trigger` / `ttsrTrigger` 作为回退输入。开头的 `(?i)`、`(?m)` 或 `(?s)` 内联标志组会转换为等效的 JavaScript `RegExp` 标志。
- `astCondition` 是 ast-grep 触发字段：一个结构模式字符串或 YAML 序列，按原样保留（不推断 glob）。它匹配暴露 `matcherEntries` 或 `matcherDigest` 的工具所提供的最终源快照（内置 edit/write 会暴露），语言从文件路径推断。它不会在部分流式增量上运行。规则可以设置 `condition`、`astCondition`，或同时设置两者。
- `question` 使规则成为**由模型评判的规则**：由 `judge` 模型角色针对每个已完成且在作用域内的输出（回复、推理或工具调用），回答一个自然语言的是/否问题。它从不在流式输出中途匹配，也从不中断；回答“是”会将规则作为警告送达（见 `ttsr-injection-lifecycle.md` 第 10 节）。同时设置 `condition`/`astCondition` 时，它们只决定是否提出问题，从而降低评判成本。运行方式遵循 `ttsr.judge`（`auto` 要求原生 TypeSafe jev 评判模型）。

   ```yaml
   question: "Does the reply claim tests pass without showing they were run?"
   scope: text
   ```

- `scope` 将 TTSR 匹配缩小到流式输出面的允许列表。它接受逗号分隔的 YAML 字符串或 YAML 序列。省略时会监视助手正文（`text`）和所有工具参数（`tool`），但不监视思考内容。

   ```yaml
   # Prose and thinking; equivalent forms:
   scope: "text, thinking"
   ```

   ```yaml
   scope: [text, thinking]
   ```

   ```yaml
   # A block-style YAML sequence is also valid:
   scope:
      - text
      - thinking
   ```

   ```yaml
   # Only TypeScript source snapshots produced by edit/write:
   scope: "tool:edit(*.ts), tool:write(*.ts)"
   ```

   有效标记为 `text`、`thinking`、`tool`（或 `toolcall`）以及 `tool:<name>(<path-glob>)`。解析器容忍格式错误的回退写法 `scope: "text","thinking"`，但可移植的规则文件应将逗号放在一个 YAML 字符串内，或使用 YAML 序列。

- 看起来像文件 glob 的 `condition` 标记会变为 `tool:edit(<glob>)` 和 `tool:write(<glob>)` 作用域条目，并使用匹配所有内容的条件 `.*`；`astCondition` 标记从不触发此简写。
- `interruptMode` 可为该规则覆盖全局 TTSR 中断模式。
- `repeatMode` 可为该规则覆盖全局 TTSR 重复模式；`always`（仅限规则级）会在每个轮次后重新启用规则，但绝不会在其自身提醒所触发的重试或继续执行中触发（见 `ttsr-injection-lifecycle.md` 第 5 节）。

## 7. 系统提示纳入路径 \{#7-system-prompt-inclusion-path}

`buildSystemPromptInternal` 同时接收 `rules`（规则手册）和 `alwaysApplyRules`。

始终应用的规则会与生效的系统/自定义/追加提示来源，以及已加载的上下文文件正文去重。如果某条规则的规范化内容已经出现在其中某个来源中，就会从自动注入中省略。剩余的原始正文呈现在规则手册列表之前：默认模板中位于 `<generic-rules>` 内，内置自定义提示模板中则直接呈现。

规则手册规则在 `<domain-rules>` 块中呈现为 `- <name> (<globs>): <description>` 行；提示中的 URL 列表说明了 `rule://<name>`，工作流部分则告知模型先读取相关规则。自定义提示模板（`custom-system-prompt.md`）改为在明确的“你必须读取 `rule://<name>`”指令下，呈现带有 `<glob>` 子元素的 `<rule name="...">` 条目。

这是建议性/上下文性的：提示文本要求模型读取适用规则，但代码不会强制执行 glob 适用性。

## 8. `rule://` 内部 URL 行为 \{#8-rule-internal-url-behavior}

`RuleProtocolHandler` 优先使用解析上下文中提供的调用方会话本地规则，并回退到进程全局的活动规则快照。`sdk.ts` 在创建时安装这两份快照，并在会话级提示重建时刷新它们：

```ts
setActiveRules([...rulebookRules, ...alwaysApplyRules, ...ttsrManager.getRules()]);
```

由此可知：

- `rule://<name>` 针对 **rulebookRules**、**alwaysApplyRules** 和**已注册的 TTSR 规则**进行解析。
- TTSR 规则会在规则手册/始终应用分桶之前被分出，但 `ttsrManager.getRules()` 会将其重新加入快照，因此已触发的规则（例如内置规则）仍可寻址，以便重新读取。
- 没有描述、没有 `alwaysApply` 且没有被接受的 TTSR 条件的规则，无法通过 `rule://` 寻址。
- 解析采用精确名称匹配。
- 未知名称会返回错误，并列出可用规则名称。
- 返回内容为原始 `rule.content`（已去除 frontmatter），内容类型为 `text/markdown`。

### 规则刷新 \{#rule-refresh}

会话级提示重建会为当前 cwd 重新发现规则，使用实时的 `ttsr.*` 过滤器重新分桶，并更新提示、URL 解析和子代理继承快照。显式提供的规则集会重新分桶，但不从磁盘发现。`/clear` 和 `/new` 会清除能力缓存，因此在这些边界处能观察到编辑。TTSR 注册以原子方式替换；仍已注册的名称保留注入记录，被移除的名称则丢失其记录。在 TTSR 禁用时重建，会保留注入记录，供以后重新启用时使用。

## 9. 已知的部分实现/未强制执行的语义 \{#9-known-partial--non-enforced-semantics}

1. 当前为 `rules` 加载的规则提供方为 `native`、`omp-plugins`、`agents` 和内嵌的 `builtin-defaults`；其他工具的提供方文件可能会解析其他配置格式，但不会注册规则加载器。
2. `globs` 元数据会呈现在提示/UI 中，并作为 TTSR 匹配的全局路径门槛，但不用于为 `rule://` 自动选择规则手册规则。
3. `rule://` 的规则选择包含规则手册规则、始终应用规则和已注册 TTSR 规则（因此已触发的 TTSR 规则可以重新读取），但不包含未注册任何条件且既无描述也无 `alwaysApply` 的规则。
4. 发现警告（`loadCapability("rules").warnings`）会被生成，但 `createAgentSession` 当前不会在此路径中呈现/记录它们。
