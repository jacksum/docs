---
title: "配置发现与解析"
description: "Oh My Pi 官方仓库文档：配置发现与解析。"
---

# 配置发现与解析 \{#configuration-discovery-and-resolution}

本文说明编码智能体目前如何解析配置：扫描哪些根目录、优先级如何生效，以及设置、技能、钩子、工具和扩展如何使用解析后的配置。

## 范围 \{#scope}

主要实现：

- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/config/config-file.ts`（从 `config.ts` 重新导出）
- `packages/coding-agent/src/config/settings.ts`
- `packages/coding-agent/src/config/registry.ts`（设置定义、带类型的句柄）
- `packages/coding-agent/src/config/all-settings.ts`（导入各领域的 `settings.ts` 定义）
- `packages/coding-agent/src/discovery/builtin.ts`
- `packages/coding-agent/src/discovery/helpers.ts`

关键集成点：

- `packages/coding-agent/src/capability/index.ts`
- `packages/coding-agent/src/discovery/index.ts`
- `packages/coding-agent/src/extensibility/skills.ts`
- `packages/coding-agent/src/extensibility/custom-tools/loader.ts`
- `packages/coding-agent/src/extensibility/extensions/loader.ts`

---

## 解析流程图 \{#resolution-flow-visual}

```text
         Generic helper order (`config.ts`)
┌───────────────────────────────────────┐
│ 1) ~/.omp/agent                       │
│ 2) <cwd>/.omp                         │
└───────────────────────────────────────┘
                    │
                    ▼
        capability providers enumerate items
 (native provider scans project .omp before user .omp;
  other providers have their own loading rules)
                    │
                    ▼
      provider priority sort + capability dedup
                    │
                    ▼
          subsystem-specific consumption
   (settings, skills, hooks, tools, extensions)
```

## 1) 配置根目录与来源顺序 \{#1-config-roots-and-source-order}

## 标准根目录 \{#canonical-roots}

`src/config.ts` 定义了固定的来源优先级列表：

1. `.omp`（原生）是唯一来源；其他工具的目录由各自的发现提供程序处理，不由这些辅助函数处理

用户级基础目录（只有一个；omp 永远不会读取其他工具的主目录配置）：

- OMP 原生：当前活动的智能体目录，即 `getAgentDir()`（通常为 `~/.omp/agent`；`PI_CONFIG_DIR`、命名配置档案或默认配置档案中的 `PI_CODING_AGENT_DIR` 会按下文所述改变它）

项目级基础目录：

- `<cwd>/.omp`

`CONFIG_DIR_NAME` 为 `.omp`（`packages/utils/src/dirs.ts`）。`PI_CONFIG_DIR` 会改变通用辅助函数使用的 OMP 用户根目录。在默认配置档案中，`PI_CODING_AGENT_DIR` 替换整个智能体目录，因此除了原生发现、设置和运行时状态之外，还会迁移通用 `getConfigDirs()` / `findConfigFile()` 的 OMP 用户基础目录。项目基础目录仍为 `<cwd>/.omp`。命名配置档案忽略 `PI_CODING_AGENT_DIR`。

## 配置档案 \{#profiles}

命名配置档案（通过 `omp --profile <name>`、`OMP_PROFILE` 或旧版后备变量 `PI_PROFILE` 选择）会迁移 OMP 用户基础目录。只要定义了 `OMP_PROFILE`，它就优先，包括显式设为空值的情况；`default`、空值或空白值会选择默认配置档案。配置档案生效时，本文所有写作 `~/.omp/agent/...` 的 OMP 原生用户级路径，通常解析为 `~/.omp/profiles/<name>/agent/...`。`--alias <command>` 本身不会选择配置档案：它与 `--profile` 配合使用时，会为该配置档案创建 shell 快捷命令。

命名配置档案生效时，状态栏的 `pi` 分段会在品牌标记上附加配置档案名称（`π-work`，或在轮次运行时显示 `⠋-work 12s`），便于一眼区分不同配置档案的会话。默认配置档案只显示符号本身。设置 `statusLine.segmentOptions.pi.showProfile: false` 可使所有配置档案都只显示该符号，例如每个配置档案已有独立主题时。

原生提供程序（`builtin.ts`）与通用 `config.ts` 辅助函数中的路径迁移保持一致，因此涵盖斜杠命令、规则、提示词、指令、钩子、工具、扩展、设置、技能和 MCP，以及顶层的 `SYSTEM.md` / `RULES.md` / `AGENTS.md` 文件和运行时状态（会话、blob、`agent.db`）。配置档案只会看到自己的 OMP 配置，绝不会看到默认配置档案的智能体配置。

快捷键是唯一例外：命名配置档案会将默认配置档案的 `~/.omp/agent/keybindings.*` 合并到自己的 `~/.omp/profiles/<name>/agent/keybindings.*` 之下，配置档案文件按每个绑定分别覆盖（[#4867](https://github.com/can1357/oh-my-pi/issues/4867)）。快捷键描述的是用户面前的终端和键盘，它们不会随活动配置档案改变，因此用户级重映射会在所有配置档案中继续生效，除非配置档案显式覆盖。继承文件对配置档案进程为只读，只有默认配置档案自身运行时，才会对默认配置档案文件进行旧格式迁移。

在 macOS 和 Linux 上，已有的 `$XDG_DATA_HOME/omp`、`$XDG_STATE_HOME/omp` 或 `$XDG_CACHE_HOME/omp` 可以迁移相应的数据、状态或缓存路径。对于命名配置档案，只有某个 XDG 类别中已包含 `omp/profiles/<name>` 时，OMP 才会使用该类别；否则该类别仍保留在 `~/.omp/profiles/<name>` 下。依赖 XDG 路径之前，请先运行 `omp config init-xdg`。

其他来源的基础目录不按配置档案划分，在所有配置档案下以相同方式加载：项目级基础目录（`<cwd>/.omp`）以工作目录为依据。本文中，除非正在讨论环境变量覆盖或 XDG 路径，否则 `~/.omp/agent` 都是当前活动配置档案智能体目录的简写。

## 重要限制 \{#important-constraint}

`src/config.ts` 中的通用辅助函数**不会**将 `.pi` 纳入来源发现顺序。

---

## 2) 核心发现辅助函数（`src/config.ts`） \{#2-core-discovery-helpers-srcconfigts}

## `getConfigDirs(subpath, options)` \{#getconfigdirssubpath-options}

按顺序返回条目：

- 先返回用户级条目（`~/.omp/agent`）
- 再返回项目级条目（`<cwd>/.omp`）

选项：

- `user`（默认为 `true`）
- `project`（默认为 `true`）
- `cwd`（默认为 `getProjectDir()`）
- `existingOnly`（默认为 `false`）

此 API 用于基于目录的配置查找，例如命令、钩子、工具和智能体等。

## `findConfigFile(subpath, options)` / `findConfigFileWithMeta(...)` \{#findconfigfilesubpath-options--findconfigfilewithmeta}

按基础目录的顺序搜索第一个已存在的文件，返回首个匹配项（仅路径，或路径加元数据）。

## `findAllNearestProjectConfigDirs(subpath, cwd)` \{#findallnearestprojectconfigdirssubpath-cwd}

逐级向上遍历父目录，返回**最近的已存在 `.omp` 目录**。

项目配置需要从祖先目录继承时，使用此函数（monorepo 或嵌套工作区行为）。

---

## 3) 文件配置包装器（`src/config/config-file.ts` 中的 `ConfigFile<T>`，从 `src/config.ts` 重新导出） \{#3-file-config-wrapper-configfilet-in-srcconfigconfig-filets-re-exported-from-srcconfigts}

`ConfigFile<T>` 是单个配置文件的模式校验加载器。

支持的格式：

- `.yml` / `.yaml`
- `.json` / `.jsonc`

行为：

- 根据提供的 omptype 模式校验解析后的数据。
- 目标为 `.yml` 时，若 `.yml` 不存在，会回退到同目录同名的 `.yaml`；已有的 `.yaml` 也会阻止 JSON 迁移。`.yaml` 目标不会回退到 `.yml`。
- `.json` 和 `.jsonc` 都按 JSONC 解析。
- 缓存加载结果，直到调用 `invalidate()`。
- 通过 `tryLoad()` 返回三态结果：
   - `ok`
   - `not-found`
   - `error`（带有模式或解析上下文的 `ConfigError`）

仍支持旧版迁移：

- 目标路径为 `.yml`/`.yaml` 时，同目录同名的 `.json` 会自动迁移一次（`migrateJsonToYml`）。

---

## 4) 设置解析模型（`src/config/settings.ts`） \{#4-settings-resolution-model-srcconfigsettingsts}

### 定义（`src/config/registry.ts`） \{#definitions-srcconfigregistryts}

每项设置在所属领域的设置模块中，通过 `register({ id, type, default, env?, protocolDefault?, validate?, pathScoped?, credential?, ui? })` 定义一次，例如 `src/tools/settings.ts`、`src/session/settings.ts`、`src/config/model-settings.ts`。`src/config/all-settings.ts` 按设置面板的顺序导入各领域。`register` 返回带类型的 `Setting` 句柄（`cfgX`）；代码通过该句柄读写，而不是使用字符串键：

- `cfgX.get(scope)`：获取生效值；`scope` 是 `Settings` 实例或携带该实例的对象（`AgentSession`、`ToolSession`）。读取结果按作用域记忆化缓存。
- `cfgX.set(scope, v)`：写入**全局**层，并将后台保存加入队列；定义类型不接受的值会抛出错误。
- `cfgX.unset(scope)`：从全局层删除该键（`omp config reset` 和清空设置面板文本字段执行的操作），使后续默认值变更仍可生效。
- `cfgX.setEntry(scope, key, v)` / `cfgX.setMember(scope, item, { member })`：写入记录型设置中的一个条目（`undefined` 表示删除），或在全局层列表型设置中添加、移除一项；保存时只改变 `config.yml` 中的该条目或项目，因此其他层（例如 `--config` 叠加层）提供的条目绝不会被写入该文件。
- `cfgX.override(scope, v)` / `cfgX.clearOverride(scope)`：仅运行时覆盖，永不持久化。
- `cfgX.map(fn)` / `combine({...}, fn)`：记忆化缓存的派生值；`.listen(scope, cb)` 观察句柄或派生值的变化。
- `cfgX.provenance(scope)`：提供该值的设置层：`"env" | "runtime" | "overlay" | "project" | "global" | "default"`。
- `cfgX.layered(scope)`：仅来自设置层的值，忽略环境变量（即设置面板所显示和编辑的值）。

不符合所声明类型或枚举值的已配置值，会被忽略并发出警告，随后使用默认值；定义中的 `validate` 会在加载、每次重新加载以及每次写入之前，拒绝格式错误的值。保留上次有效值的监听器重新加载，以及合并 `config.yml` 外部修改的保存操作，都只会将无效文件所属的层保持在上次有效值（警告会指出文件），其他层仍会刷新。配置为 `null` 通常视为未设置。模型角色和模型预设等记录条目，可以在运行时层或叠加层中使用 `null` 作为墓碑标记，隐藏较低层的条目；项目或全局层中的 null 条目仍视为未设置。

### 设置层（`src/config/settings.ts`） \{#layers-srcconfigsettingsts}

生效优先级从高到低为：

1. 定义上声明的环境变量（`env: "NAME"`），按设置类型解析；无法解析的文本视为未设置。布尔值遵循 `parseFlag`：空值为未设置，`1`/`y`/`true`/`yes`/`on`（小写或大写）为 true，其他文本均为 false
2. 运行时覆盖项：保存在内存中，不持久化
3. 配置叠加层：`PI_CONFIG_FILES`（平台路径列表），然后是重复的 `omp --config <path>` 文件；全部按 `config.yml` 风格的 YAML 加载，仅对当前进程生效
4. 项目设置：通过设置能力发现（提供程序中的 `settings.json` 和 `config.yml`）
5. 全局设置：`~/.omp/agent/config.yml` 和 `config.yaml` 中第一个存在的文件
6. 定义的默认值

定义也可以声明 `env: { name, fallback: true }`：该变量只替换默认值，任何层只要配置了非 null 值，就优先于该变量（用于 `SEARXNG_BASIC_*`）。`fallback: "blank"` 还允许该变量覆盖配置中的空字符串或空白字符串（用于 `SEARXNG_ENDPOINT`、`SEARXNG_TOKEN` 和 `MNEMOPI_EMBEDDING_MODEL`）。

在叠加层列表内，后面的文件覆盖前面的文件（`PI_CONFIG_FILES` 条目在 `--config` 文件之前加载）。叠加层路径相对于当前活动项目目录解析（先展开 `~`）。

定义中的 `protocolDefault: ["rpc", "acp"]` 会使 RPC/ACP 宿主从定义默认值启动：启动时，`applyProtocolDefaults`（`src/main.ts`）将默认值固定为软运行时覆盖项，除非该值已被配置。对该设置调用 `cfgX.set`/`cfgX.unset`/`cfgX.setEntry`/`cfgX.setMember`（设置面板、智能体中心、`cfg://`）、重新加载发现某个持久化层配置了该设置（RPC 文件监听器捕获的 `config.yml` 编辑），以及重新设定作用域或克隆到配置了该设置的项目（ACP 会话自己的项目配置）时，都会解除这一固定。

子代理接收 `parent.overlay(overrides)`：读取会实时回退到父智能体，而覆盖项及后续写入都保留在子代理中，绝不持久化。

通用设置句柄写入以全局层为目标；配置叠加层为只读。模型角色提供显式的项目写入 API：`setProjectModelRole()` / `clearProjectModelRole()` 更新项目层，并仅将改变的角色持久化到 `<cwd>/.omp/config.yml`。若已有运行时覆盖项会遮蔽该角色，设置项目角色时会暂时替换该覆盖项；清除角色时会移除这一运行时槽位。原始覆盖项会被保存，以便改变项目作用域时恢复。

### 设置加载失败 \{#settings-load-failures}

- 缺失的全局或项目 YAML 视为空配置。
- 无效的全局或原生项目 YAML 会在文件锁保护下，移到同目录中唯一的 `.broken-<timestamp>-<pid>-<uuid>` 备份，然后启动失败并报告原路径及备份路径。不可读文件会导致失败，但不会移动。
- 每个 `PI_CONFIG_FILES` / `--config` 叠加层都采用严格模式：文件缺失、无效 YAML 和非映射文档根节点都是硬错误。不会隔离叠加层文件。

## 仍在生效的迁移行为 \{#migration-behavior-still-active}

启动时，如果全局 `config.yml` 和 `config.yaml` 都不存在：

1. 从 `~/.omp/agent/settings.json` 迁移（成功后重命名为 `.bak`）
2. 与 `agent.db` 中的旧数据库设置合并（冲突时数据库值优先）
3. 将合并结果写入 `config.yml`

`#migrateRawSettings` 中的字段级迁移：

- `queueMode` -> `steeringMode`
- 旧的扁平 `theme: "..."` -> `theme.dark/theme.light` 结构

---

## 5) 能力与发现集成 \{#5-capabilitydiscovery-integration}

大多数非核心配置加载通过能力注册表完成（`src/capability/index.ts` + `src/discovery/index.ts`）。

## 提供程序顺序 \{#provider-ordering}

提供程序按数值优先级排序（较高者优先）。完整集合：

- 原生 OMP（`builtin.ts`）：`100`
- OMP 插件（`omp-plugins`）：`90`
- Claude：`80`
- Agent Plugins 标准（`agent-plugins`）：`75`
- Codex / agents / Claude 插件市场：`70`
- OpenCode：`55`
- agents-md（`AGENTS.md` 文件）/ claude-md（独立的 `CLAUDE.md` 文件）：`10`
- mcp-json / ssh-json / managed-skills（自动学习）：`5`
- ssh-config（`~/.ssh/config` 主机别名）：`3`
- 内置默认规则（`builtin-defaults`）：`1`

```text
Provider precedence (higher wins)

native (.omp)           priority 100
omp-plugins             priority  90
claude                  priority  80
agent-plugins           priority  75
codex / agents /
  claude-plugins        priority  70
opencode                priority  55
agents-md / claude-md   priority  10
mcp-json / ssh-json /
  managed-skills        priority   5
ssh-config              priority   3
builtin-defaults        priority   1
```

## 去重语义 \{#dedup-semantics}

能力定义一个 `key(item)`：

- 相同键 => 保留第一项（优先级较高或较早加载的条目）
- 无键（`undefined`）=> 不去重，保留全部条目

相关键：

- 技能：`name`
- 工具：`name`
- 钩子：`${type}:${tool}:${name}`
- 扩展模块：`name`
- 设置：不去重（保留全部条目）

---

## 6) 原生 `.omp` 提供程序行为（`packages/coding-agent/src/discovery/builtin.ts`） \{#6-native-omp-provider-behavior-packagescoding-agentsrcdiscoverybuiltints}

原生提供程序（`id: native`）从以下位置读取原生配置：

- 项目：`<cwd>/.omp/...`
- 用户：`~/.omp/agent/...`

### 目录接纳规则 \{#directory-admission-rules}

- 斜杠命令、目录规则、提示词、指令、钩子、工具、扩展模块和设置，仅在项目/用户根目录存在且非空时才使用该根目录。
- 技能会扫描从当前工作目录到仓库根目录/主目录边界的每一级祖先目录下的 `<ancestor>/.omp/skills`，以及 `~/.omp/agent/skills`，不要求根 `.omp` 目录本身非空。
- `SYSTEM.md`、`SYSTEM_TEMPLATE.md`、`RULES.md` 和 `.omp/AGENTS.md` 直接读取用户级文件，项目文件则使用最近的非空祖先 `.omp` 目录。项目系统提示词条目先于用户条目加载。`RULES.md` 会成为始终应用的常驻规则。完整的 `SYSTEM.md` / `APPEND_SYSTEM.md` 约定见 [`docs/system-prompt-customization.md`](./system-prompt-customization.md)。
- MCP 不使用非空根目录准入辅助函数。它直接依次读取项目的 `.omp/mcp.json`、`.omp/.mcp.json`，然后读取用户的 `mcp.json`、`.mcp.json`。

### 按作用域加载 \{#scope-specific-loading}

- 技能：`<ancestor>/.omp/skills/*/SKILL.md` 和 `~/.omp/agent/skills/*/SKILL.md`
- 托管技能：`~/.omp/agent/managed-skills/*/SKILL.md`，通过一个独立的、优先级为 5 的配置发现来源加载；发生名称冲突时，任何其他配置发现来源中编写的技能均优先。发现始终执行；`autolearn.enabled` 控制写入/提醒，而非加载。
- 斜杠命令：`commands/*.md`
- 规则：`rules/*.{md,mdc}` 加上顶层的 `RULES.md`
- 提示词：`prompts/*.md`
- 指令：`instructions/*.md`
- 钩子：`hooks/pre/*`、`hooks/post/*`
- 工具：`tools/*.{json,md,ts,js,sh,bash,py}` 和 `tools/<name>/index.ts`
- 扩展模块：在 `extensions/` 下发现（另加旧版 `settings.json.extensions` 字符串数组）
- 设置能力：先 `settings.json`，再 `config.yml`
- 上下文文件：`.omp/AGENTS.md`；独立的祖先目录 `AGENTS.md` 文件由低优先级的 `agents-md` 配置发现来源另行加载

### 最近项目查找的细节 \{#nearest-project-lookup-nuance}

对于 `SYSTEM.md`、`SYSTEM_TEMPLATE.md`、`RULES.md` 和 `.omp/AGENTS.md`，原生配置发现来源向上遍历，查找最近的非空项目 `.omp` 目录。

## 7) 主要子系统如何使用配置 \{#7-how-major-subsystems-consume-config}

## 设置子系统 \{#settings-subsystem}

- `Settings.init()` 按上述优先级加载全局 YAML 文件、发现的项目设置、`PI_CONFIG_FILES` / `--config` 覆盖层和运行时覆盖项。
- 只有满足 `level === "project"` 的能力条目才会合并到项目层。

### 会话标题提示词覆盖 \{#session-title-prompt-override}

在任意通用配置基目录中创建 `TITLE_SYSTEM.md`：

```text
# ~/.omp/agent/TITLE_SYSTEM.md
Generate a session name using lowercase `<type>:<primary-objective>`.
```

- 缺少 `TITLE_SYSTEM.md` 时保留内置标题提示词。新会话的首个标题随后来自其首次回复的分叉：回复的第一个文本块或工具调用块开始时，会话自身的模型在已缓存前缀上通过一个侧分支轮次回答 `src/prompts/system/title-fork.md`，给出标题及一个卡片索引（Nerd Fonts 图标、表情符号、1-6 个字符的代码），窗口标题显示为 `<icon> <CODE>: <title>`。当分叉失败、超时、拒绝，或回复始终未开始时，微型标题模型接手。
- 存在 `TITLE_SYSTEM.md` 时，首个标题跳过分叉，由微型标题模型结合覆盖提示词生成，重新规划时的标题刷新也是如此。
- 发现过程先检查当前项目目录（`<cwd>/.omp`），再检查用户基目录（`~/.omp/agent`）。与原生 `SYSTEM.md` 不同，项目标题发现**不会**遍历祖先目录。
- 该覆盖仅替换自动会话标题生成的系统提示词；正常的 `SYSTEM.md` / `APPEND_SYSTEM.md` 提示词自定义不受影响。
- 在线路径要求标题模型将标题包在 `<title>...</title>` 中，并宽松地从文本解析它（普通句子、被截断/未闭合的标签，或意外回显的 `{"title": "..."}` JSON 都仍然有效）。`TITLE_SYSTEM.md` 覆盖内容之后会追加包裹在 `<title>` 中的指令。本地微型标题路径保留 `<title>...</title>` 预填充/停止包装，并将此文件用作其系统轮次。

## 技能子系统 \{#skills-subsystem}

- `extensibility/skills.ts` 通过 `loadCapability(skillCapability.id, { cwd })` 加载。
- 应用来源开关和过滤器（`ignoredSkills`、`includeSkills`、自定义目录）。
- 旧名称开关仍然存在（`skills.enablePiUser`、`skills.enablePiProject`），但它们控制的是原生配置发现来源（`provider === "native"`）。

## 钩子子系统 \{#hooks-subsystem}

- `discoverExtensionPaths()`（位于 `extensibility/extensions/loader.ts`）将钩子能力中的 `.ts`/`.js` 钩子路径追加到扩展模块列表。
- 随后，这些模块与其他扩展一样，通过扩展加载器和运行器加载并执行。

## 工具子系统 \{#tools-subsystem}

- `discoverAndLoadCustomTools()` 根据工具能力 + 插件工具路径 + 显式配置路径解析工具路径。
- 声明式 `.md/.json` 工具文件仅提供元数据；可执行加载要求代码模块。

## 扩展子系统 \{#extensions-subsystem}

- `discoverAndLoadExtensions()` 加载原生扩展模块能力条目、JS/TS 钩子工厂、已安装插件的入口点，以及显式配置路径。
- 环境中的扩展模块能力发现明确限制为 `provider: "native"`；此步骤不会扫描外部配置发现来源。

---

## 8) 可依赖的优先级规则 \{#8-precedence-rules-to-rely-on}

可采用以下理解模型：

1. `config.ts` 中的来源目录排序决定候选路径顺序。
2. 能力配置发现来源的优先级决定跨配置发现来源的优先顺序。
3. 能力键去重决定冲突行为（对于带键的能力，先出现者优先）。
4. 子系统特定的合并逻辑可能进一步改变实际优先级（尤其是设置）。

### 设置特有的注意事项 \{#settings-specific-caveat}

设置能力条目不会去重；`Settings.#loadProjectSettings()` 按返回顺序深度合并项目条目，因此后面的条目会覆盖前面的条目。配置发现来源按从高到低的优先级访问，这意味着低优先级配置发现来源的设置可以覆盖高优先级设置。在原生配置发现来源内部，项目 `config.yml` 位于 `settings.json` 之后，并覆盖它。随后，原生 `.omp/config.yml` 模型角色会作为权威的项目模型角色层重新应用。

---

## 9) 仍然存在的旧版/兼容行为 \{#9-legacycompatibility-behaviors-still-present}

- 对以 YAML 为目标格式的文件进行 `ConfigFile` JSON -> YAML 迁移。
- 将设置从 `settings.json` 和 `agent.db` 迁移到 `config.yml`。
- 字段迁移涵盖重命名/移除的设置和值结构变化，包括 `queueMode`、更新日志设置、扁平的 `theme`、已停用的图像工具设置、任务隔离/预启动设置、已移除的编辑和上下文压缩模式、`inlineToolDescriptors`、状态栏片段、模型提供方/搜索设置、记忆/hindsight 设置，以及嵌套叶字段重命名。当前完整清单见 `Settings.#migrateRawSettings()`。
- 旧设置名称 `skills.enablePiUser` / `skills.enablePiProject` 仍是控制原生技能来源的有效开关。

如果在代码中移除这些兼容路径，请立即更新本文档；当前仍有多种运行时行为依赖它们。
