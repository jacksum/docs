---
title: "设置"
description: "Oh My Pi v19.1.1 仓库文档：设置。"
---

# 设置 \{#settings}

`omp` 根据内置默认值、持久化的全局配置文件、可选的项目本地配置、一次性 CLI 配置叠加层以及内存中的运行时覆盖项，确定设置的生效值。如果某个仓库需要采用不同于全局默认设置的模型提供方集合、模型角色、工具策略、记忆后端或界面行为，可以使用项目设置，无需改动整台机器的配置。

设置以普通的 YAML 映射保存。各设置的键、类型、默认值和枚举值均来自该设置的定义。定义通过 `register(...)` 在归属功能的代码旁声明（例如 `packages/coding-agent/src/tools/settings.ts`），并由 `packages/coding-agent/src/config/all-settings.ts` 汇总。`omp config` 提供完整的配置模式；交互式 `/settings` 面板显示有受支持界面编辑器的设置项。部分设置项仅在满足条件时显示。没有界面选项的数值和数组只能通过配置文件设置，除非该设置明确启用了面板的 JSON 编辑器（例如 `contextFiles.extra`）。

- 模型或模型提供方的凭据、`.env` 文件以及用于解析 API 密钥的环境变量表，参见[模型提供方](./providers.md)。
- 如何在 `models.yml` 中定义自定义模型，参见[模型](./models.md)。
- 关于被发现并载入智能体上下文的指令文件（`AGENTS.md`、`.omp/` 等），参见[上下文文件](./context-files.md)。
- 环境变量的完整列表，参见[环境变量](./environment-variables.md)。
- 用于在单轮对话中启用特定行为的提示词，参见[触发关键词](./magic-keywords.md)。

## 设置存放位置 \{#where-settings-live}

| 作用域 | 路径 | 读取行为 | 写入行为 |
| --- | --- | --- | --- |
| 全局 | `~/.omp/agent/config.yml`（或已有的 `config.yaml`） | 主要的持久化设置文件。`config.yml` 是标准写入目标；如果使用已有的 `config.yaml`，则读取并直接更新该文件。 | `/settings`、`omp config set` 和 `omp config reset` 都写入此处。 |
| 全局旧版 | `~/.omp/agent/settings.json` | 仅当两个主 YAML 文件名均不存在时，才考虑迁移此文件。 | 不写入；成功保存非空的迁移后 YAML 文件后，将此文件重命名为 `settings.json.bak`。 |
| 项目 | `<cwd>/.omp/config.yml`（以及 `.omp/settings.json`） | 进程工作目录下的 `.omp/` 非空时加载。 | 设置命令不会写入任意项目设置键。配置 `modelRoleStorage: project` 后，通过模型选择器分配角色仅更新此处的 `modelRoles`；其他键需手动编辑。 |
| 项目旧版 | `<cwd>/.omp/settings.json` | 仍会读取；随后将项目的 `config.yml` 合并到这一层之上。 | 设置命令不会写入此文件。 |
| CLI 配置叠加层 | 通过 `--config <file>` 传入的任意文件 | 在全局和项目设置之后加载，仅对该次进程有效。此参数可以重复指定。 | 不会持久化。 |
| 运行时覆盖项 | 仅保存在内存中 | 由 `--approval-mode`、角色选项和功能环境变量等设置覆盖项指定。 | 不会持久化。 |

上述全局路径适用于默认配置档案。`omp --profile work` 改用 `~/.omp/profiles/work/agent`，将设置、认证信息、会话和缓存与其他配置档案隔离。`OMP_PROFILE` 也可选择配置档案；`PI_PROFILE` 是兼容性后备变量，仅在 `OMP_PROFILE` 不存在时生效。显式指定的 `--profile` 优先于这两个变量，`--profile default` 则选择默认配置档案。

`PI_CODING_AGENT_DIR` 可更改默认配置档案的智能体目录，`config.yml` 及该智能体的数据也随之改用新位置。命名配置档案会自行确定智能体目录，忽略此覆盖项。使用 `omp config path`（或 `omp --profile work config path`）可输出当前生效的设置目录。

在 Linux 和 macOS 上，如果已设置 `XDG_DATA_HOME`、`XDG_STATE_HOME` 和 `XDG_CACHE_HOME`，且相应的 `omp` 目录存在，就可以重定向数据、状态和缓存的位置。命名配置档案需要相应的 `omp/profiles/<name>` 目录。这不会移动 `config.yml`：该文件仍在当前生效的智能体目录下，`agent.db` 和其他分类存放的数据则可能位于别处。`omp config init-xdg` 会创建基础目录，但不会迁移文件或设置环境变量。

原生项目设置的作用域仅限进程工作目录下的 `.omp/` 文件夹。设置发现**不会**逐级向上查找最近的 `.omp/`。其他配置发现来源（Claude、Codex、Gemini、Cursor、OpenCode）也可以从各自的文件提供项目级设置。`omp` 的设置命令只能读取这些设置；可以按发现来源 ID 禁用它们（参见[禁用模型提供方和发现来源](#provider-and-source-disabling)）。

## 配置文件格式 \{#config-file-formats}

全局设置的标准文件是 YAML 格式的 `config.yml`；为兼容旧配置，也接受文件名 `config.yaml`。其他文件（例如 `models.yml`）使用通用配置加载器，支持 `.yml`、`.yaml`、`.json` 和 `.jsonc`：

- 请求 `.yml` 或 `.yaml` 路径，但只有同目录下同名的 `.json` 文件时，会将其自动迁移为 YAML（操作幂等，每个进程只执行一次）。
- `.json` 和 `.jsonc` 配置按原样读取，不执行迁移。
- 空 YAML（或 YAML 的 `null`）视为空设置映射。其他非映射的顶层值无效。启动时如果允许写入，`omp` 会把语法无效或顶层不是映射的持久化设置文件移到一个名称唯一的 `.broken-*` 备份，并在退出时报告原始错误和备份路径。如果 `--config` 叠加层的顶层是数组或标量，也会报错退出，但不会移动该文件。
- 对普通配置模式项，值无效时会发出警告，并按该项的模式默认值读取。带有显式校验器的设置则可能拒绝整个配置，例如按智能体指定的上下文压缩触发条件，以及模型提供方的并发限制。手写配置文件中未识别的键不能替代已注册的设置项。

## 读取和写入设置 \{#reading-and-writing-settings}

在会话中使用交互式 `/settings` 面板，或在 shell 中使用 `omp config` 命令。CLI 读取生效值，其中包括设置项的环境变量提供的值。面板显示并编辑合并各设置层后得到的值，不直接显示或编辑环境变量提供的值。说明会指出当前生效的环境变量覆盖项，因此来自环境变量的凭据不会被预填或持久化。普通持久化写入都落在**全局**文件中；设有 `modelRoleStorage: project` 时，通过模型选择器更改角色是例外（参见[写入位置](#where-writes-go)）。

```bash
omp config list                 # all settings with current effective values
omp config list --json          # same, machine-readable
omp config list --scope global --json   # only what config.yml sets, as written
omp config get theme.dark       # one value
omp config get theme.dark --json
omp config set compaction.enabled false
omp config set defaultThinkingLevel medium
omp config reset steeringMode   # remove a key from config.yml so its default applies
omp config path                 # print the active agent directory
```

如果希望常规启动时也播放完整的首次运行启动动画，请设置 `startup.showSplash`：

```bash
omp config set startup.showSplash true
```

此项仅控制启动画面的动画，不会重新运行初始设置流程或改变其状态。`startup.quiet: true` 仍会隐藏包括启动画面在内的所有启动界面元素。

### 子命令 \{#subcommands}

| 命令 | 效果 |
| --- | --- |
| `omp config list` | 按选项卡分组输出所有设置及其当前值和类型。`--json` 输出一个以设置路径为键、以 `{ value, type, description }` 为值的对象。面向读者的输出会把已配置的凭据字段遮盖为 `********`；JSON 输出省略这些字段的 `value`，并输出 `redacted: true`。指定 `--scope global` 或 `--scope project` 时，仅列出该层（`config.yml` 或当前目录的项目设置文件）设定的键，并按该层保存的值输出。限定路径作用域的数组（`enabledModels`、`enabledProviders`、`disabledProviders`）保留其中的 `{ path, … }` 条目，不按当前目录解析；`--json` 为每个键输出 `{ value, type, description }`。此时不会读取默认值、其他设置层或环境变量。 |
| `omp config get <key>` | 输出单个键的生效值。键未知时以非零状态退出。`--json` 输出 `{ key, value, type, description }`。这是对某个键的显式请求，因此凭据值不会被遮盖。 |
| `omp config set <key> <value>` | 按键在配置模式中的类型解析 `<value>`，写入全局主 YAML 文件，并输出写入的值。如果生效值仍来自其他来源，则会指出该来源（在 `--json` 输出中，`overriddenBy` 为环境变量名，或为 `project`、`overlay`、`runtime`；`fallbackEnv` 指出保存值为空白时使用的后备环境变量）。 |
| `omp config reset <key>` | 从全局配置删除该键，让其他已配置的设置层或模式默认值生效。输出删除后的生效值，将非空凭据遮盖为 `********`；JSON 会省略凭据的 `value`，并输出 `{ key, redacted: true }`。 |
| `omp config path` | 输出当前生效的智能体目录（遵循 `PI_CODING_AGENT_DIR`）。 |
| `omp config init-xdg` | 在 Linux 和 macOS 上，在当前生效的 XDG 数据、状态和缓存根目录下创建 `omp` 目录。不会移动已有文件或设置 XDG 环境变量。其他平台上以非零状态退出。 |

`omp config` 不带子命令时会列出设置。`--help` 或 `-h` 显示命令帮助。`--json` 选项适用于 `list`、`get`、`set` 和 `reset`。`--scope` 仅适用于 `list`。

### 值的解析 \{#value-parsing}

`omp config set` 按目标键在配置模式中的类型解析值字符串。解析前会去掉字符串首尾的空白。

| 类型 | 接受的输入 | 说明 |
| --- | --- | --- |
| 布尔型（boolean） | `true`、`false`、`yes`、`no`、`on`、`off`、`1`、`0` | 不区分大小写，拒绝其他值。 |
| 数值型（number） | 任意有限的 JavaScript 数值 | 拒绝 `Infinity` 和 `NaN`。 |
| 枚举（enum） | 该键允许的值之一，可以直接输入或用 JSON 引号括起 | 必须精确匹配。出错时会列出有效值。 |
| 数组（array） | JSON 数组 | 例如 `'["anthropic","openai"]'`。必须能成功解析，且结果必须是数组。 |
| 记录（record） | JSON 对象 | 例如 `'{"bash":"prompt"}'`。必须能成功解析，且结果必须是非数组对象。 |
| 字符串（string） | 裸文本或带 JSON 引号的字符串 | 裸文本会去掉首尾空白，JSON 字符串的内容会被解码。由多个词组成的参数用空格连接。 |

键必须与配置模式中实际存在的路径完全一致，不支持简写。请设置 `theme.dark`，而非 `theme`。

解析后仍会对各设置项执行相应的规范化和校验。例如，模型提供方的并发限制必须是正数，并会向下取整为请求数。

### 写入位置 \{#where-writes-go}

`omp config set`、`omp config reset`、`/settings` 和持久化的运行时设置变更都写入当前生效的智能体目录下的全局主 YAML 文件。仅在运行时生效的覆盖项不会保存。设置命令不会向 `<cwd>/.omp/config.yml` 写入任意键。配置 `modelRoleStorage: project` 时，分配或清除模型角色只更新该文件中受影响的角色；项目缺少的角色回退到全局角色。如需为项目添加其他本地覆盖项，请直接编辑项目配置文件（参见[项目本地配置](#project-local-config)）。

保存操作经过防抖，并在持有锁时重新读取文件。外部修改与本地修改不重叠时会予以保留。如果本地变更进入待保存状态后，外部写入方更改了同一个全局设置或模型角色，就会跳过已过时的本地变更并发出警告，不会覆盖文件中较新的值。

通过符号链接保存主配置时，会保留链接并更新其解析后的目标。包含 `.` 或 `..` 的目标遵循操作系统的规则：Windows 在跟随中间链接前先归并这些路径段，POSIX 则逐一遍历磁盘上的路径组成部分。因此，`alias/../config.yml` 这类目标在这两个平台上可能指向不同的文件。

### 实时文件变更 \{#live-file-changes}

交互式会话以及 RPC/RPC-UI 宿主会监视全局主文件、项目设置来源和配置叠加层。文件变更后会经短暂的防抖再重新加载，并保留运行时覆盖项。某一层无法解析或未通过校验时，会保留该层上一次有效的值并记录警告；其他有效层仍可刷新。实时重新加载不会把无效文件移到 `.broken-*` 备份。

通过符号链接访问的配置会跟踪目标文件的修改，也会跟踪任一中间文件或目录符号链接的替换，包括配置档案的链接。当链接切换目标后，也会监视新目标的后续修改。

重新加载会更新各功能可读取的设置值，但不会重做只在启动时执行的操作。配置发现来源的开关会在下一轮发现时生效。分派任务或 eval 时，也会先重新加载持久化设置，再确定子智能体的策略。

`modelRoles`、`retry.fallbackChains` 和 `task.agentModelOverrides` 的路由变更会应用于后续启动的子智能体和后续的回退决策，无需重启宿主。`auth.accountPolicies` 和 `retry.usageReservePct` 也会更新常驻的账户路由器，供后续选择凭据和检查配额时使用。重新加载不会重启正在运行的子智能体，也不会切换正常运行的活动会话所用的模型；显式的运行时覆盖项仍优先。

## 优先级 \{#precedence}

设置的生效值按以下顺序确定，优先级从低到高：

```text
built-in defaults  <-  global config  <-  project config  <-  CLI overlays  <-  setting env var  <-  runtime overrides
```

从高到低的优先级如下：

1. **运行时覆盖项**：在内存中为当前进程应用的设置，包括 `--smol`、`--slow`、`--plan`、`--approval-mode`、`--auto-approve`/`--yolo`、`--hide-thinking`、`--advisor`、`--external-thinking`、`--motion`、`--spinner-interval`、`--max-fps`、仅写入当前会话的设置值、SDK 的 `overrides` 和协议模式默认值。它们都不会持久化。命令行选项优先于设置项的环境变量，因此 `PI_MOTION=none omp --motion full` 会启用完整动效。`--model`、`--thinking`、`--service-tier`、`--no-lsp`、`--no-pty` 和 `--api-key` 等其他一次性选项影响会话、模型或传输选项，不能一概视为注册表中的设置。仅当该项未通过其他方式配置（包括环境变量）时，协议模式默认值（RPC/ACP）才生效。写入或重置该设置、重新加载时读到的 `config.yml` 或项目配置修改，以及 ACP 会话自身的项目配置，都会取代该默认值。
2. **设置项环境变量**：在设置项定义中声明的环境变量，例如 `PI_PY` 对应 `eval.py`，`OMP_AUTH_BROKER_URL` 对应 `auth.broker.url`。除非设置项声明了自定义解析器，否则按设置项类型解析。无法解析的文本（例如 `PI_EDIT_VARIANT=auto`）视为未设置。布尔值遵循 `parseFlag` 约定：空值视为未设置，`1`/`y`/`true`/`yes`/`on`（全小写或全大写）表示真，其他值表示假。少数环境变量被声明为后备值（`SEARXNG_*`、`MNEMOPI_EMBEDDING_MODEL`）。它们只替换内置默认值，所以任何已经配置该项的设置层都优先，但配置为 `null` 时视为未设置。`SEARXNG_ENDPOINT`、`SEARXNG_TOKEN` 和 `MNEMOPI_EMBEDDING_MODEL` 也会在设置值为空白字符串时生效。
3. **CLI 配置叠加层**：每个 `--config <file>` 都构成一层，靠后的叠加文件覆盖靠前的文件。
4. **项目设置**：先读取 `<cwd>/.omp/settings.json`，再读取 `<cwd>/.omp/config.yml`（也纳入其他配置发现来源提供的项目级设置）。
5. **全局设置**：当前生效的智能体或配置档案目录下的 `config.yml`（或已有的 `config.yaml`）。
6. **内置默认值**：来自设置项定义。

如果某个键在所有设置层中均未设置，读取时就采用其默认值。

### 环境变量覆盖项 \{#environment-overrides}

环境变量绝不会写回 `config.yml`。在设置项定义中声明的变量组成一个设置层，优先级仅次于上文所述的运行时覆盖项。其他变量由相关功能直接读取（`PI_NO_PTY`），或作为运行时覆盖项应用（`PI_SMOL_MODEL` 为当前进程设置 `smol` 模型角色）。相关的设置覆盖项及配置选择项如下：

| 环境变量 | 覆盖的设置 | 说明 |
| --- | --- | --- |
| `PI_SMOL_MODEL` | `modelRoles.smol` | 也可通过 `--smol` 设置。 |
| `PI_SLOW_MODEL` | `modelRoles.slow` | 也可通过 `--slow` 设置。 |
| `PI_PLAN_MODEL` | `modelRoles.plan` | 也可通过 `--plan` 设置。 |
| `PI_NO_PTY=1` | （禁用 Bash 的 PTY） | 对当前进程等同于 `--no-pty`。 |
| `PI_PY` | `eval.py` | `PI_PY=0` 禁用 Python eval 后端。 |
| `PI_JS` | `eval.js` | `PI_JS=0` 禁用 JavaScript eval 后端。 |
| `PI_TINY_DEVICE` | `providers.tinyModelDevice` | 本地微型模型的 ONNX 执行提供方或 `mlx` 后端。 |
| `PI_TINY_DTYPE` | `providers.tinyModelDtype` | 本地微型模型的 ONNX 精度。 |
| `OMP_AUTH_BROKER_URL` | `auth.broker.url` | 环境变量值优先于配置值。 |
| `OMP_AUTH_BROKER_TOKEN` | `auth.broker.token` | 环境变量值优先于配置值。 |
| `PI_CODING_AGENT_DIR` | （更改默认配置档案的智能体目录） | 命名配置档案忽略此覆盖项。 |
| `OMP_PROFILE` / `PI_PROFILE` | （选择配置档案） | `OMP_PROFILE` 存在时优先；`--profile` 优先于环境变量。 |
| `PI_EDIT_VARIANT` | `edit.mode` | `apply_patch`、`hashline`、`patch`、`replace`、`sloppy`、`magic` 或 `none`；`auto` 视为未设置。 |
| `PI_EDIT_FUZZY` | `edit.fuzzyMatch` | 仅 `1` 或小写 `true` 启用，`0` 或小写 `false` 禁用；其他文本以配置为准。 |
| `PI_EDIT_FUZZY_THRESHOLD` | `edit.fuzzyThreshold` | 解析为 0-1 的浮点阈值；无效值或超出范围的值视为未设置。 |
| `PI_INTENT_TRACING` | `tools.intentTracing` | 使用布尔型环境变量解析器。 |
| `PI_AUTO_QA` | `dev.autoqa` | 启用或禁用自动报告工具问题，受已保存的同意状态约束。 |
| `PI_NO_THINKING_LOOP_GUARD` | `model.loopGuard.enabled` | 仅 `1` 会禁用；其他值不会覆盖此设置。 |
| `SEARXNG_ENDPOINT` / `SEARXNG_TOKEN` | `searxng.endpoint` / `searxng.token` | 设置缺失、为 null 或为空白时用作后备值。 |
| `SEARXNG_BASIC_USERNAME` / `SEARXNG_BASIC_PASSWORD` | `searxng.basicUsername` / `searxng.basicPassword` | 仅在设置缺失或为 null 时用作后备值；配置的空字符串仍是有效的凭据。 |
| `MNEMOPI_EMBEDDING_MODEL` | `mnemopi.embeddingModel` | 设置缺失、为 null 或为空白时用作后备值。 |
| `PI_CONFIG_FILES` | CLI 配置叠加层 | 采用平台的路径列表分隔符（Unix 为 `:`，Windows 为 `;`）；按列表顺序加载文件，然后才加载 `--config` 叠加层。 |

模型提供方的 API 密钥单独解析（来源包括已存储的认证信息、OAuth、`models.yml`、环境变量和 `.env` 文件）。参见[模型提供方](./providers.md)和完整的[环境变量](./environment-variables.md)参考。

## 合并规则 \{#merge-rules}

设置层通过深度合并组合：

- **对象按键深度合并**：仅在下层出现的键会保留；上层出现同名键时，以上层的值为准。
- **标量和大多数数组由优先级更高的层整体替换**。采用 `merge: "prepend"` 的规则列表数组（`bash.patterns` 和 `bashInterceptor.patterns`）是例外：项目和 `--config` 叠加层的条目放在全局条目之前（若全局层未设置该列表，则放在配置模式默认条目之前）。配置为 `null` 或空数组 `[]` 会重置列表。运行时覆盖项仍会整体替换列表。
- **配置为 `null` 时，读取时视为未设置**。此时使用配置模式的默认值（或后备环境变量），不使用下层值。项目的 `modelRoles` 条目是例外：清除或设为 null 的项目角色会回退到全局角色。
- **命名模型预设以整项为单位解析**，不会跨层深度合并。同名的项目预设会替换全局预设。运行时或叠加层中值为 `null` 的条目可隐藏下层预设。

对于带点号的设置路径，请使用嵌套的 YAML 映射：

```yaml
theme:
   dark: titanium
   light: light

tools:
   approvalMode: write
   approval:
      bash: prompt
      read: allow
```

### Bash 命令审批匹配模式 \{#bash-command-approval-patterns}

`tools.approval` 是以工具名为键的记录。`tools.approval.eval` 和 `tools.approval.computer` 等带点号的写法指向该记录中的条目，并非独立的设置 ID。每个条目设置相应工具的默认策略。其中有一项不对应工具：字面键 `computer.control`（即 `tools.approval["computer.control"]`，在 YAML 中写作 `computer.control: allow`，不能嵌套在 `computer` 下）用于处理 `computer` 工具对前台控制权的请求，参见[计算机操作](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/computer-use.md#menus-held-input-and-task-control)。对于 Bash，可以通过 `bash.patterns` 添加有序的命令规则，第一条匹配的规则生效。模式支持字面文本和通配符 `*`。空白字符另行处理：匹配前，模式和命令中每段连续的空格、制表符或换行符都合并为一个空格，并去掉首尾空白。因此，模式中的换行符可以匹配任意空白：`match: "*\n*"` 的行为与 `"* *"` 相同，会匹配所有含空格的命令。要拦截以换行符分隔的列表中的危险命令，无须针对换行符另设规则，`deny` 和 `prompt` 规则会检查每个命令段（见下文）。`allow` 规则拒绝以未加引号的换行符作为命令分隔符的用法，但当整条命令匹配时，可以批准包含用引号括起或转义的字面换行符的命令。

来自项目配置（`.omp/config.yml`）和 `--config` 叠加层的 `bash.patterns` 条目会**添加到**全局 `~/.omp/agent/config.yml` 规则之前，不会替换全局规则。因此，可以在项目本地声明该仓库特有的构建或 lint 放行规则，而无须重复全局规则。

命令开头的 `KEY=VALUE` 环境变量赋值不会匹配 `allow` 规则，除非模式显式包含这些赋值，或变量名与 `bash.allowedEnvVars`（或单条规则的 `env` 列表）中的条目完全一致。条目必须是字面名称，不支持通配符：

```yaml
bash:
   allowedEnvVars:
      - GOOS
      - GOARCH
      - CGO_ENABLED
      - CARGO_TARGET_DIR
   patterns:
      - match: "go test*"
        approval: allow
      - match: "bun run build:native*"
        approval: allow
        env: [CMAKE_GENERATOR]
```

只按名称放行意味着该变量可以取任意值，因此只应列出无害的构建或测试变量。切勿列入控制执行的变量（`PATH`、`LD_PRELOAD`、`DYLD_INSERT_LIBRARIES`、`BASH_ENV`、`GIT_SSH_COMMAND`、`GOFLAGS`、`RUSTC_WRAPPER`、`CARGO_TARGET_<triple>_RUNNER` 以及类似的 `*_RUNNER`/`*_WRAPPER` 名称），否则命令可能执行任意代码。`deny` 和 `prompt` 规则总是检查每个命令段保留和移除开头裸 `KEY=VALUE` 赋值后的两种形式，因此 `FOO=1 rm -rf build` 无法绕过 `match: "rm -rf *"` 的限制。规则不会剥除命令的包装程序：`env FOO=1 rm -rf build` 和 `nice rm -rf build` 都不以 `rm` 开头，因此不匹配这条规则。

默认情况下，`allow` 规则必须匹配整条命令，无法批准一行复合命令。设置 `bash.allowCompoundCommands: true` 后，还可以按保守规则判定仅由 `&&` 连接的两个或更多字面命令组成的命令链：
```yaml
tools:
   approvalMode: write
   approval:
      bash: allow

bash:
   allowCompoundCommands: true
   patterns:
      - match: "rm -f *"
        approval: allow
```

采用此配置后，`cmp tmp/result.json artifacts/result.json && rm -f tmp/result.json` 可以不经提示直接运行。OMP 会为每个原始命令段独立按顺序解析规则：`rm` 被显式放行，未匹配的 `cmp` 命令段则沿用单独执行 Bash 命令时的常规策略。只要有一个命令段未匹配，整条命令就保留 `exec` 层级且没有显式策略，通用策略解析器因此先应用 `tools.approval.bash`，再应用当前生效的审批模式。只有该工具的整体策略或审批模式要求时，未匹配的命令段才会触发提示。

命令链中的显式限制按保守原则合并：如果解析出 `deny`，则以它为准；否则以解析出的 `prompt` 为准。只匹配整条命令链、不匹配任何单个命令段的 `deny` 或 `prompt` 规则仍对整条命令链生效（例如 `cmp * && rm *`）。所有匹配的整链限制都会纳入判定：靠后的整链 `deny` 会覆盖靠前的整链 `prompt`。其余情况下，命令段规则沿用首次匹配的顺序：在判定 `git status` 的放行规则和 `git *` 的拒绝规则时，如果前者排在前面，后者就不会在执行 `git status && git status` 的判定中覆盖前者。

因此，如果适用范围较窄的命令段放行规则排在宽泛的兜底拒绝规则之前，启用此设置后，默认策略原本拒绝的复合命令可能获准执行。必须始终生效的命令段拒绝规则，应排在与之重叠的放行规则之前。

选择启用后，仅接受无嵌套的 `&&` 命令链，参数必须是字面值，也可以用引号括起。不接受展开、变量赋值、其他控制流、重定向、通配符展开、换行、错误语法，以及 `cd`、`source` 和 `eval` 等会改变 shell 状态的命令。这些不接受的形式沿用旧版审批行为。启用该设置不会扩大 `allow` 模式可以批准的非链式命令范围。命令链及其各段的显式限制会先于现有的高危命令检查判定。该检查仍会检查整条命令和每个命令段的原始及规范化形式，因此宽泛的放行规则无法掩盖后续命令段中的高危命令。

只有明确识别为使用 POSIX 引号规则的 shell，才能启用这一行为：`sh`、`bash`、`dash`、`ash`、`ksh` 或 `zsh`，包括带 `.exe` 的名称。统一的分类器会检查 Windows 和 POSIX 路径中可执行文件的基本名称。其他 shell，包括 cmd、PowerShell、fish 及未知包装程序，沿用旧版审批行为。它们的引号规则可能与识别器不同：fish 将单引号内的 `\'` 视为转义后的引号，而 POSIX shell 不这样处理。

规则的有效审批取值为 `allow`、`prompt` 和 `deny`。无论是否启用上述设置，`deny` 和 `prompt` 规则都可以匹配整条命令，也可以匹配其他复合形式经词法切分后的命令段（按 `&&`、`||`、`;`、`|`、单个 `&`、子 shell 和换行切分）。对每个命令段，以匹配的第一条限制规则为准；合并各段的限制时，任何 `deny` 均优先于 `prompt`。因此，`match: "rm -rf *"` 可以拒绝 `cd /tmp && rm -rf build`、`sleep 1 & rm -rf build` 和 `curl http://example.com; rm -rf build`，即使列表中靠前的 `curl *` 被配置为 `prompt` 也是如此。

项目设置只能收紧 `bash.patterns`，不能放宽它。由于智能体可写入仓库设置文件，即使项目的 `bash.patterns` 会放行某条命令，操作者配置层（全局配置、`--config` 叠加层和运行时覆盖项）中的 `deny` 和 `prompt` 规则仍然适用。

`bash.patterns` 定义的是审批策略，不提供隔离。获准执行的程序仍具有 Bash 进程的文件系统、网络和子进程访问权限，看似用途有限的程序也可通过自身的选项或配置执行范围更广的操作。这些规则只管控 `bash` 工具，不涵盖通过 `eval` 启动的 shell。若要堵住这一途径，还需添加 `tools.approval.eval` 策略（`prompt` 或 `deny`），参见[工具审批模式](./approval-mode.md)。

### Bash 拦截器匹配模式 \{#bash-interceptor-patterns}

`bashInterceptor` 独立于 `bash.patterns`。它将 Bash 命令转给专用工具，本身不定义命令是否获准执行。请显式启用它，并为正则表达式匹配模式配置替代工具和面向模型的消息：

```yaml
bashInterceptor:
   enabled: true
   patterns:
      - pattern: '^\s*(cat|head|tail)\s+'
        tool: read
        message: "Use the read tool instead."
```

指定的替代工具必须在当前会话中可用，否则拦截器不会阻止 Bash 调用。权限策略与专用工具路由的详细对比，包括复合命令的行为和处理顺序，参见 [Bash 工具文档](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/bash.md#command-policy-and-dedicated-tool-routing)。

### 示例：全局与项目配置 \{#worked-example-global-vs-project}

```yaml
# ~/.omp/agent/config.yml
tools:
   approvalMode: write
   approval:
      bash: prompt
      read: allow
disabledProviders:
   - anthropic
   - openai
   - google

# <repo>/.omp/config.yml
tools:
   approval:
      bash: allow
disabledProviders:
   - groq
```

`<repo>` 内的生效设置：

```yaml
tools:
   approvalMode: write # kept from global (object deep-merge)
   approval:
      bash: allow # overridden by project
      read: allow # kept from global
disabledProviders:
   - groq # project array REPLACES the global array
```

对不合并的列表，最容易忽略的是数组替换：项目的 `disabledProviders` 不会扩充全局列表，而是成为该项目的完整列表。`enabledModels`、`cycleOrder`、`extensions` 及其他所有数组设置也是如此，只有 `bash.patterns` 和 `bashInterceptor.patterns` 例外（项目条目会添加到全局条目之前）。

## 项目本地配置 \{#project-local-config}

仓库需要独立设置时，请创建 `<repo>/.omp/config.yml`：

```yaml
# <repo>/.omp/config.yml
modelRoles:
   default: anthropic/claude-sonnet-4-5
   smol: openai/gpt-4.1-mini
   slow: anthropic/claude-opus-4-5:high

tools:
   approvalMode: write
   approval:
      bash: prompt

compaction:
   methodOrder: [snapcompact, remote, soft]
   thresholdPercent: 80

theme:
   dark: titanium
```

除非仓库策略允许，否则不要把秘密信息写入要提交的项目配置。凭据优先通过环境变量、已存储的认证信息、认证代理或未纳入版本控制的 `--config` 叠加层提供。

### 一次性配置叠加层 \{#one-shot-overlays}

使用 `--config` 可添加不会持久化的临时设置层：

```bash
omp --config ./local/ci-settings.yml "check this failure"
omp --config ./base.yml --config ./experiment.yml "try this model"
```

默认启动命令以及 `acp`、`models` 和 `dry-balance` 均接受 `--config`。对于 `models` 和 `dry-balance`，应将该选项放在命令名之后（`omp dry-balance --config ./policy.yml`）；放在命令名之前则会被忽略。

包装程序也可以改为将 `PI_CONFIG_FILES` 设为按平台分隔的路径列表（Unix 用 `:`，Windows 用 `;`）。由环境变量指定的叠加层按列表顺序加载，然后才加载显式指定的 `--config` 叠加层。

叠加层路径相对于进程的工作目录解析（并展开 `~`）。每个叠加层都必须能解析成 YAML 映射。文件缺失、YAML 无效或顶层为数组或标量时，都会报错退出，**不会**静默回退到优先级较低的设置。

## 按路径限定作用域的数组 \{#path-scoped-arrays}

以下五个数组设置除了接受不限定作用域的条目，还接受按路径限定作用域的条目：`enabledModels`、`enabledProviders`、`disabledProviders`、`bash.patterns` 和 `bashInterceptor.patterns`。这样，一份全局配置就可以按目录采用不同的行为，无须为各仓库分别维护 `<repo>/.omp/config.yml` 文件：

```yaml
enabledModels:
   - claude-sonnet-4-5 # applies everywhere
   - path: ~/work/high-context
     models:
        - anthropic/claude-opus-4-5

disabledProviders:
   - ollama # applies everywhere
   - paths:
        - ~/projects/sensitive
        - ~/clients/acme
     providers:
        - anthropic
        - openai

bash:
   patterns:
      - path: ~/work/service-repo
        patterns:
           - match: "make lint*"
             approval: allow
           - match: "make test*"
             approval: allow
      - match: "git status*" # applies everywhere
        approval: allow
```

不限定作用域的条目（模型或模型提供方列表中的裸字符串，或 `bash.patterns` 和 `bashInterceptor.patterns` 中直接写入的规则对象）在任何位置都适用。当当前工作目录**就是**配置的路径，或**位于该路径下**时，限定了作用域的条目才适用。`~` 展开为用户主目录；相对路径在匹配前解析。

可用的**路径**键（任选，也可组合）：`path`、`paths`、`pathPrefix`、`pathPrefixes`。

可用的**值**键：

- `models`（适用于 `enabledModels`）、`providers`（适用于 `enabledProviders` 和 `disabledProviders`），或 `patterns`（适用于 `bash.patterns` 和 `bashInterceptor.patterns`）
- `values` 或 `items`（适用于任何支持按路径限定作用域的设置）

对于 `bash.patterns` 和 `bashInterceptor.patterns`，限定了作用域的条目可以在 `patterns` / `values` / `items` 下包含一个列表，也可直接包含规则字段（`{ path, match, approval }`），或者同时采用这两种写法。在其作用域内，先应用条目自身的规则，再按顺序应用列表中的规则。列表中的规则也可以按路径限定作用域，从而缩小外层作用域。若条目的路径键均不含字符串（例如 `path: ~` 会被 YAML 读取为 null；要指向用户主目录，请写成带引号的 `"~"`），该条目不限定作用域，在任何位置都适用。若 `bashInterceptor.patterns` 仅包含按路径限定作用域的条目，则内置拦截器规则仍会在所有匹配的限定作用域规则之后应用。该列表有一条不限定作用域的规则，就会整体替换内置规则，但项目或 `--config` 叠加层在列表前添加的规则不会造成这种替换。其他设置中，格式错误的限定作用域条目会被忽略。路径作用域在各层合并**之后**解析，因此使用的是当前工作目录对应的最终生效数组。

## 禁用模型提供方和发现来源 \{#provider-and-source-disabling}

`enabledProviders` 用于将外部的用户级配置来源纳入发现范围。它默认是空数组，因此通常不会发现 Cursor、Codex、Claude、Claude 市场插件、Gemini、OpenCode、Windsurf 和 GitHub 的用户级配置根目录，除非列出了相应的发现来源 ID（或列出 `*`/`all`）。启用 `claude` 会一并启用 `claude-plugins`；显式设置 `CLAUDE_CONFIG_DIR` 则会把 Claude 的用户级配置根目录纳入发现范围，无须添加列表条目。显式选择的发现根目录也可以纳入范围。`disabledProviders` 仍然优先。

项目级配置根目录仍然启用。OMP 原生和 `.agents` 配置根目录（包括原生市场插件）不属于外部来源，无须在列表中添加条目。

`disabledProviders` 使用一个共享的 ID 命名空间，在检查任何凭据之前控制两个不同的子系统：

| 条目类型 | ID 示例 | 效果 |
| --- | --- | --- |
| 模型提供方 | `anthropic`、`openai`、`google`、`groq`、`ollama`、`openrouter` | 即使有可用凭据，也会从模型选择中移除这些后端。参见[模型提供方](./providers.md)。 |
| 发现来源 | `native`、`claude`、`codex`、`gemini`、`github`、`opencode`、`cursor`、`agents-md` | 阻止该来源提供上下文文件、MCP 服务器、命令、技能、钩子、工具、提示词或设置。参见[上下文文件](./context-files.md)。 |

大部分控制模型提供方的场景都会列出模型提供方 ID。禁用 `claude` 发现来源会停止发现 Claude 格式的配置；禁用 `anthropic` 模型提供方则会停用 Anthropic 模型后端。

数组采用替换而非追加，因此项目设置 `disabledProviders` 时必须列出希望禁用的所有项：

```yaml
# ~/.omp/agent/config.yml
disabledProviders:
   - anthropic
   - openai

# <repo>/.omp/config.yml — inside this repo ONLY groq is disabled
disabledProviders:
   - groq
```

默认值为空数组（不禁用任何项）。两个子系统各自的 ID 及顺序，参见[模型提供方](./providers.md)和[上下文文件](./context-files.md)。

原生项目的 `modelRoles` 也会直接从 `.omp/config.yml` 中读取；禁用 `native` 发现来源不会阻止读取这一层的模型角色。

### 暂停的模型提供方 \{#paused-providers}

部分模型提供方在认证规则中处于暂停状态，因为使用它们会给账户带来风险（例如 `google-antigravity`）。处于暂停状态的模型提供方不提供登录入口，拒绝令牌刷新和请求，并忽略已存储的凭据及环境变量中的凭据。`auth.unpausedProviders` 会重新启用列出的模型提供方，并接受暂停原因所述的风险；此前保存的登录状态会原样恢复。仅全局配置、`--config` 文件和运行时覆盖项可以取消暂停；项目的 `.omp/config.yml` 无法取消暂停。可以在 `/settings` 的 **取消暂停的模型提供方（Unpaused Providers）** 中选择，也可以在 `~/.omp/agent/config.yml` 中设置：

```yaml
auth:
   unpausedProviders:
      - google-antigravity
```

修改立即应用于正在运行的会话：下次查找时即可重新取得已保存的凭据，刚取消暂停的模型提供方也会像登录后一样刷新模型列表。如果使用认证代理，也要在代理宿主上设置该项（`omp auth-broker serve` 会在启动时读取它）：认证代理会先丢弃暂停的模型提供方的凭据，客户端不会看到这些凭据。

## 会话恢复选择器的作用域 \{#resume-picker-scope}

默认情况下，`omp --resume` 和 `/resume` 会在当前文件夹列表中列出本仓库
其他工作树中的会话。若要将长期使用的工作区相互隔离，
请运行 `omp config set session.worktreeScope directory`（或在
`/settings` 中选择 **恢复会话时的工作树作用域**）。将其设为 `repo` 可恢复默认行为。
所有项目选项卡仍会显示所有目录的会话，包括
已删除工作树中的会话。此设置只缩小当前文件夹列表的范围。

## 设置目录 \{#settings-catalog}

以下列出常用设置，未涵盖完整的配置架构。`omp config list` 是查询每个键及其当前值、类型和说明的权威参考。此处的默认值和枚举值均来自配置架构。凡支持通过环境变量或命令行选项覆盖的设置，都有相应注明。此类覆盖项仅对当前进程生效，不会持久化。

### 模型 \{#models}

`modelRoles` 为每种工作负载指定主要选择器。`retry.fallbackChains` 按顺序指定回退项；不要在服务专属设置中指定模型提供方或后端。聊天选择器可以带有思考档位后缀（`:off`、`:minimal`、`:low`、`:medium`、`:high`、`:xhigh`、`:max`、`:auto` 或 `:inherit`）。非聊天运行器不使用聊天思考预算。角色值也可以是按顺序以逗号分隔的选择器或角色别名，例如 `@smol`；角色的回退链需另行配置。

```yaml
modelRoles:
   default: anthropic/claude-sonnet-4-5
   smol: openai/gpt-4.1-mini
   slow: anthropic/claude-opus-4-5:high
   vision: google/gemini-3.1-pro-preview
   plan: anthropic/claude-opus-4-5
   advisor: anthropic/claude-sonnet-4-5:medium

   # Lightweight chat/tiny workloads
   tiny: local/lfm2.5-230m
   memory: local/lfm2-1.2b

   # Model-kind workloads
   image: openai/gpt-image-2
   web: web/duckduckgo
   speech: local/phonon-31m
   dictation: local/parakeet-tdt-0.6b-v3
   judge: typesafe/jev-1.14.0

retry:
   fallbackChains:
      tiny: [] # explicit empty chain: do not fall back
      memory:
         - openai/gpt-4.1-mini
      web:
         - web/parallel
         - web/perplexity
         - web/exa
         - web/firecrawl
      speech: []
      dictation: []
      judge:
         - typesafe/jev-preview
         - "@tiny"
         - "@smol"
         - "@default"

cycleOrder:
   - smol
   - default
   - slow

modelProviderOrder:
   - anthropic
   - openai

enabledModels:
   - claude-sonnet-4-5
```

内置聊天角色包括 `default`、`smol`、`slow`、`vision`、`plan`、`commit`、`tiny`、`memory`、`task`、`advisor` 和 `widget`。`tiny` 和 `memory` 角色既接受目录中的 `tiny` 模型，也接受普通聊天模型。`widget` 为每个后台作业的实时小组件编写规范，未分配模型时按与 `smol` 相同的规则解析。内置模型类别角色包括 `image`、`web`、`speech`、`dictation` 和 `judge`，分别选择图像、搜索或有资料支撑的聊天、TTS、STT 和评判运行器。`judge` 也接受微型模型和聊天模型，因此 `@tiny` 等别名是有效的回退项。目录中的模型类别有 `chat`、`tiny`、`image`、`tts`、`stt`、`search` 和 `judge`；未指定 `kind` 的自定义模型仍属于聊天模型。

打开 `/model`，进入 **角色**视图即可分配角色模型并编辑对应的回退项。聊天角色和模型类别角色分别显示在不同的能力分区中，选择器只列出所选角色可用的模型。也可以直接运行 `omp models --kind chat`、`omp models --kind tiny`、`omp models --kind image`、`omp models --kind tts`、`omp models --kind stt`、`omp models --kind search` 或 `omp models --kind judge` 列出同一目录中的对应模型；使用 `--kind all` 可列出全部模型。

对于某个角色，`modelRoles.<role>` 指定主要选择器，`retry.fallbackChains.<role>` 指定回退列表。对模型类别角色，未设置回退链时使用该角色的内置优先级列表；`[]` 明确表示**不回退**。`retry.fallbackChains.default` 链用于聊天角色或会话回退，不会替代模型类别角色自己的回退链。`web/parallel`、`web/perplexity`、`web/exa` 和 `web/firecrawl` 等显式指定的搜索条目会作为已配置的候选项尝试，其中包括各自支持的匿名模式；若缺少必需凭据，对应条目仍会报不可用错误。

执行单次搜索时，`omp search`、`omp q` 和 `omp web-search` 接受通过 `--model` 传入的目录选择器，例如 `omp web-search --model web/duckduckgo "current Bun release"`。会话内的 `web_search` 工具不允许为单次调用覆盖模型设置，而是遵循 `modelRoles.web` 和 `retry.fallbackChains.web`。

图像模型同样通过完整的目录模型选择器指定，不使用模型提供方名称。设置 `modelRoles.image`、它的回退链，或 `generate_image` 请求中的可选字段 `model` 即可选择模型。OpenRouter 的图像模型通过 OpenRouter 原生图像 API 运行。

加载现有配置时会自动迁移。`providers` 下已停用的后端选择器（`webSearch`、`webSearchOrder`、`webSearchExclude`、`webSearchGeminiModel`、`image`、`imageOrder`、`tts`、`judgmentProvider`、`autoThinkingModel`、`unexpectedStopModel`、`tinyModel` 和 `memoryModel`）会在适用时转换为 `modelRoles` 和 `retry.fallbackChains` 中的设置，随后被移除。已停用的 `tts.localModel` 键会被移除（Phonon 31M 是标准本地 TTS 模型）。旧版 Kokoro 语音 ID（`tts.localVoice` / `speech.voice`）和 `local/kokoro`（位于 `modelRoles.speech` 中）会迁移到 Phonon 的对应值；`stt.modelName` 的值会先迁移为标准 `modelRoles.dictation` 选择器，再移除原键。设备、数据类型、语音、超时和 `live.*` 行为等其他服务控制项仍是常规设置。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `modelRoles` | record | `{}` | 将角色名称映射到主要选择器或按顺序排列的主要候选项。可以通过角色分配、`modelTags` 或 `cycleOrder` 添加自定义聊天角色。`--smol`/`--slow`/`--plan` 及其对应的 `PI_*_MODEL` 环境变量可覆盖本次运行中的相应角色；`--model` 用于选择当前聊天模型。 |
| `modelRoleStorage` | enum | `global` | `global` 将角色的模型选择器分配保存到当前生效的全局配置或配置档案中；`project` 仅将这些角色分配保存到 `<cwd>/.omp/config.yml` 中。项目配置中缺少的角色回退到全局角色。 |
| `modelPresets` | record | `{}` | 命名的模型预设，每项为 `{ modelRoles, defaultThinkingLevel }`。可通过 `/modelpreset save` 或在 `/models` 的角色视图中按 `s` 保存，通过 `/modelpreset switch` 应用。保存时只将指定名称的条目写入全局配置；项目中定义的预设会列出并可应用，但不会复制到全局配置。参见[模型预设](./models.md#model-presets)。 |
| `modelTags` | record | `{}` | 自定义角色和标签的元数据，可添加聊天角色。 |
| `modelProviderOrder` | array | `[]` | 模型 ID 存在歧义时，模型提供方的优先顺序。 |
| `cycleOrder` | array | `["smol","default","slow"]` | 模型切换器循环切换的聊天角色。 |
| `enabledModels` | array | `[]` | 允许使用的模型列表，支持[按路径限定作用域的条目](#path-scoped-arrays)。列表为空表示允许所有可用模型。 |
| `enabledProviders` | array | `[]` | 要加载的外部用户级发现源，支持按路径限定作用域的条目。参见[上文](#provider-and-source-disabling)。 |
| `disabledProviders` | array | `[]` | 禁用的模型提供方或发现源，支持[按路径限定作用域的条目](#path-scoped-arrays)。参见[上文](#provider-and-source-disabling)。 |
| `includeModelInPrompt` | boolean | `true` | 在系统提示词中包含当前模型名称。 |

有关 `models.yml` 的配置架构和自定义模型提供方的定义，参见[模型](./models.md)。

### 评判 \{#judgments}

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `judgment.attemptTimeoutMs` | number | `3000` | 尚有 `retry.fallbackChains.judge` 条目可尝试时，单个原生评判候选项的时限，以正整数毫秒表示。时限涵盖处理凭据和 HTTP 标头、重试以及读取响应体，不含本地图像准备。通过提示词执行和在设备端运行的评判不受影响。 |

仅当配置了评判回退项时才有这一时限。候选项超时后会被取消，系统会尝试下一个已配置的回退项，并在同一会话和模型注册表中跳过该候选项的路由 30 秒（没有会话 ID 的评判器有自己的冷却期）。超时不会将评判交给未配置的模型，例如内置默认模型或会话模型。未配置回退项时，缓慢的原生评判仍会运行至完成。调用方一旦取消，评判就会结束，不会切换到其他候选项。

默认的 3 秒时限让 `find` 在 20 秒总时限内有余量尝试第二和第三个候选项。速度较慢但运行正常的候选项也可能超时并触发回退；冷却期不会将它从链中移除。对于一贯较慢的评判器，可用 `omp config set judgment.attemptTimeoutMs 10000` 提高时限。调高此设置不会延长外层工具或调用方的时限。

无论是否触发上述时限，如果候选项的路由拒绝账户（`401`、`402`、`403`）、不提供该模型（`404`），或者是返回 `502` 且错误类型或错误代码为 `upstream_credentials_exhausted` 的网关（该模型的所有上游密钥都失败），使用同一模型注册表的所有评判器都会在 5 分钟内跳过该候选项。遇到这种网关 `502` 时只请求一次，不重试；其他 `5xx` 响应仍视为暂时性错误，会重试。

### 顾问 \{#advisor}

顾问按可配置的频率审查主代理轮次，并可插入建议。通过 `advisor.enabled`、`/advisor on` 或 `--advisor` 启用顾问。对于默认的单个顾问，`modelRoles.advisor` 用于选择模型；未设置时，使用已配置的 `slow` 角色或按内置慢速模型的优先顺序解析。显式指定的顾问模型不可用时，不会静默改用其他模型。

`WATCHDOG.yml`（或 `WATCHDOG.yaml`）可定义一组命名顾问，各自拥有模型、工具、指令、意见条数预算、审查频率和补审策略。有关配置架构、共用的 `WATCHDOG.md` 指令、审查频率控制和补审行为，参见[顾问配置](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/advisor-watchdog.md)。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `advisor.enabled` | boolean | `false` | 当 `modelRoles.advisor` 解析为可用模型时，启用顾问运行机制。 |
| `task.agentAdvisor` | record | `{}` | 为各子代理配置顾问，将代理名称映射到 `"on"`、`"off"` 或顾问模型模式。此设置覆盖代理头部元数据中的 `advisor`，通过 `/agents` 管理界面配置。 |
| `advisor.syncBacklog` | enum | `off` | 默认补审策略。`off` 从不等待；`1`、`3` 或 `5` 表示达到相应积压阈值时最多等待 30 秒；`strict` 等待计划中的审查，不限制实际等待时长。中止、失败、配额暂停、状态切换和销毁都会结束等待。可选的 `WATCHDOG.yml` 顾问级 `syncBacklog` 覆盖此策略，省略时继承默认策略。 |
| `advisor.immuneTurns` | number | `3` | 一条问题意见或阻断意见触发中断后，在指定数量的后续主代理轮次内（包括继续执行工具循环），将后续问题意见作为不中断流程的附注处理。阻断意见不受此限制。 |
| `advisor.continueSeverity` | enum | `concern` | 代理已给出最终答复时，能重新唤醒代理的意见的最低严重级别（`nit`、`concern`、`blocker`）。更低级别的意见会以卡片形式留在会话记录末尾，并随你的下一条消息送达代理。对所有顾问即时生效。 |
| `advisor.reviewMode` | enum | `turn` | 未通过 `WATCHDOG.yml` 定义顾问名单时的默认审查频率：在主代理的每一轮审查，或用 `agent-end` 仅在给出最终答复时审查。名单中的条目各自设置 `reviewMode`（默认 `turn`）。即时生效。 |
| `advisor.reviewInterval` | number | `1` | 仅适用于默认顾问：每累计 N 次符合条件的更新审查一次。跳过的更新会随下次计划审查发送；待送达的建议不受审查频率影响。即时生效。 |
| `advisor.maxNotesPerUpdate` | number | `4` | 每次顾问审查可接收的非阻断意见条数，范围为 1 到 32。严重级别更高的意见只能替换同一次审查中待处理的意见。`WATCHDOG.yml` 中的顶层设置或顾问级设置会覆盖此默认值。 |
| `advisor.evictStaleResults` | boolean | `true` | 每次审查前，用简短的占位文本替换顾问在较早审查中的 `read`/`grep`/`glob` 输出。保留最近一次审查。 |

### 思考 \{#thinking}

```yaml
defaultThinkingLevel: high
hideThinkingBlock: false
thinkingBudgets:
   minimal: 1024
   low: 2048
   medium: 8192
   high: 16384
   xhigh: 32768
   max: 32768
```

对于接受推理 token 预算的传输层，`thinkingBudgets.<level>` 会覆盖所选思考档位的 token 预算。这些传输层包括 Anthropic、Google/Gemini、Bedrock Claude、GitLab Duo 的 Anthropic 路径、Anthropic 兼容层、认证网关，以及预算模式下的 `cline-pass`。此设置不控制基于推理强度的 OpenAI 兼容请求。本地 llama.cpp 和 Ollama 等 `openai-completions` 模型提供方使用各自的思考或推理强度控制项，因此更改这些预算不会影响它们的请求体。使用 `defaultThinkingLevel` 或 `--thinking` 为这些模型选择可用的推理强度档位。

| 键 | 类型 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `defaultThinkingLevel` | enum | `high` | `minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`auto`。可通过 `--thinking` 为单次运行覆盖此设置。 |
| `hideThinkingBlock` | boolean | `false` | 在输出中隐藏思考块。`--hide-thinking` 可在本次运行中启用此设置（只影响显示）。 |
| `thinkingBudgets.minimal` | number | `1024` | `minimal` 档位的 token 预算。 |
| `thinkingBudgets.low` | number | `2048` | `low` 档位的 token 预算。 |
| `thinkingBudgets.medium` | number | `8192` | `medium` 档位的 token 预算。 |
| `thinkingBudgets.high` | number | `16384` | `high` 档位的 token 预算。 |
| `thinkingBudgets.xhigh` | number | `32768` | `xhigh` 档位的 token 预算。 |
| `thinkingBudgets.max` | number | `32768` | `max` 档位的 token 预算。 |
| `providers.autoThinkingMaxEffort` | enum | `xhigh` | `defaultThinkingLevel: auto` 可解析出的最高推理强度。`xhigh` 将分类器的上限设为比最高档低一档，因此只有 `ultrathink` 能达到 `max`；设为 `max` 后，分类器可为支持最高档的模型选用该档并按该档计费。无论如何设置，本地设备端分类器的上限仍是 `xhigh`。此设置约束的是 `auto` _解析出的档位_：模型若没有不超过上限的档位，就不会得到自动选出的档位。如果模型元数据要求显式指定推理强度，传输层仍会发送该模型支持的最低档位；若档位列表为 `["max"]`，发送的就是 `max`，因为该模型不接受其他档位。 |

### 采样 \{#sampling}

数值型采样设置为负值（通常是 `-1`）时，表示使用模型提供方或模型的默认值，`omp` 不会发送该参数。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `temperature` | number | `-1` | 采样温度。 |
| `topP` | number | `-1` | 核采样。 |
| `topK` | number | `-1` | Top-K 采样。 |
| `minP` | number | `-1` | 最低概率阈值。 |
| `presencePenalty` | number | `-1` | 存在惩罚。 |
| `repetitionPenalty` | number | `-1` | 重复惩罚。 |
| `textVerbosity` | enum | `low` | `low`、`medium`、`high`。由 OpenAI Responses 和 Codex 发送。 |
| `tier.openai` | enum | `none` | `none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。对于 OpenAI / OpenAI-Codex 以及 OpenRouter 上的 OpenAI 系列模型，此值以 `service_tier` 发送。`ultrafast` 仅发送给 OpenAI API，以及发现时列出的 `service_tiers` 包含该档位的 Codex 模型和 OpenAI 兼容中转模型（`/fast ultra`）。启动时使用 `--service-tier <value>` 可覆盖单个会话中的 OpenAI 设置；该选项不会持久化（`none` 表示不发送 `service_tier`）。 |
| `tier.anthropic` | enum | `none` | `none`、`priority`。`priority` 为支持此档位且直连的 Claude 模型启用快速模式（通过 Bedrock、Vertex 或 OpenRouter 使用时，此值会被忽略）。 |
| `tier.google` | enum | `none` | `none`、`flex`、`priority`。使用 Gemini API 时，该值随请求体发送；使用 Vertex 时，`priority` 通过请求头发送（`flex` 在 Vertex 上不生效）。 |
| `tier.subagent` | enum | `inherit` | `inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。应用于所启动代理使用的模型系列；`inherit` 表示跟随主代理。 |
| `task.agentServiceTierOverrides` | record | `{}` | 对任务或评估分派启动的代理，按精确名称逐个指定覆盖项（Vibe 工作进程仍使用 `tier.subagent`）。可用值：`inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。条目会覆盖 `tier.subagent`；若条目指定了具体档位，只有解析出的模型所属的模型提供方系列支持该档位时才会生效。若此设置不是映射，加载设置会失败。 |
| `tier.advisor` | enum | `none` | `inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。应用于顾问使用的模型系列。 |
| `encourageEdits` | boolean | `true` | 系统提示词包含一条关键规则：编辑文件必须使用 `edit` 工具，禁止用 sed、perl 或 Python 编辑。`false` 表示省略编辑指引。 |
| `personality` | enum | `default` | `default`、`friendly`、`pragmatic`、`none`。用户级的 `<agent dir>/PERSONALITY.md` 会替换所选预设的文本；`none` 仍会省略这一段。参见[自定义系统提示词](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md)。 |

### 重试与回退 \{#retry-and-fallback}

```yaml
retry:
   enabled: true
   maxRetries: 10
   baseDelayMs: 500
   maxDelayMs: 300000
   modelFallback: true
   fallbackOn: any
   fallbackRevertPolicy: cooldown-expiry
   fallbackChains:
      # Chat roles without their own chain may inherit "default". Model-kind
      # roles use their own built-in defaults instead.
      default:
         - anthropic/claude-opus-4-5
         - openai/gpt-5.5
         - google/gemini-3-pro
      # Per-role chains override inherited or built-in fallbacks. An explicit
      # [] disables fallback for that role. Chat selectors accept an optional
      # thinking suffix, e.g. openai/gpt-5.5:low.
      smol:
         - openai/gpt-5.5-mini
         - anthropic/claude-haiku-4-5
      web: []
      # Model-selector keys (any key containing "/") attach the chain to the
      # model itself: it applies whenever that model is active, no matter
      # which role it is assigned to, and survives role reassignment.
      google/gemini-3-pro:
         - google-vertex/gemini-3-pro
      # A `provider/*` KEY covers every model of a provider — current or
      # future. A `provider/*` ENTRY keeps the failing model's id and swaps
      # the provider: google-antigravity/x -> google/x -> google-vertex/x.
      # Ids missing on the target provider are skipped (near-miss ids resolve
      # fuzzily); exact model keys override the wildcard for a specific model.
      google-antigravity/*:
         - google/*
         - google-vertex/*

providers:
   anthropic:
      serverSideFallback: false
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `retry.enabled` | boolean | `true` | 对模型提供方的暂时性错误进行重试。 |
| `retry.maxRetries` | number | `10` | 单个请求的最大重试次数。 |
| `retry.baseDelayMs` | number | `500` | 初始退避时长。 |
| `retry.maxDelayMs` | number | `300000` | 退避上限（5 分钟）。若模型提供方给出的等待时间超过此上限，且凭据或模型回退均未成功，则立即报错；但 `retry.waitForUsageReset` 允许按可信的配额重置时间等待时除外。`0` 表示禁用上限。 |
| `retry.modelFallback` | boolean | `true` | 聊天模型不可用时，回退到另一个聊天模型。设为 `false` 时，遵循此开关的角色驱动型辅助功能（包括在线生成会话标题）只尝试第一个可解析的候选项。此设置独立于 `contextPromotion.enabled`：要禁止 `retry.fallbackChains` 切换模型，应关闭此开关。 |
| `retry.fallbackOn` | enum | `any` | 指定会话轮次（含子代理）或顾问轮次中，哪些请求失败后可以沿 `retry.fallbackChains` 回退。`any` 在模型提供方返回任何错误时都切换模型。`usage-limit` 仅在触发用量限制（配额窗口、支出上限或余额耗尽）时切换模型；会话轮次中的其他可重试错误会按常规退避重试同一模型，达到 `retry.maxRetries` 后报错，不可重试的错误（包括拒绝）则立即报错。`except-usage-limit` 在遇到其他错误时切换模型，遇到用量限制则等待限制解除或报错。不使用回退链的顾问仍按自己的规则重试和放弃（参见 `docs/advisor-watchdog.md`）。凭据轮换和 `retry.usageAwareFallback` 不受影响。 |
| `retry.rateLimitWalksChain` | boolean | `false` | 启用后，触发速率限制时立即尝试 `retry.fallbackChains` 中的回退项，即使当前轮次的思考内容由出错模型签名。默认情况下，这类轮次会重试受速率限制的模型，直到用完 `retry.maxRetries` 才尝试回退链。 |
| `retry.fallbackChains` | record | `{}` | 将角色、模型选择器或 `provider/*` 通配符映射到按顺序排列的回退选择器。包含 `/` 的键按模型匹配，优先于角色：`provider/model-id` 匹配指定的模型，`provider/*` 匹配该模型提供方的所有模型。`provider/*` _作为列表条目_ 时，会保留出错模型的 ID，只替换模型提供方。模型类别角色未设置回退链时使用内置链，设为 `[]` 时不回退；`default` 链从不适用于这类角色。启动时会对未知的模型或模型提供方，以及格式有误的回退链发出配置警告。 |
| `retry.fallbackRevertPolicy` | enum | `cooldown-expiry` | `cooldown-expiry` 在主模型被暂时跳过的时段结束后恢复使用主模型；`never` 一直使用回退模型，直到手动切换。 |
| `retry.waitForUsageReset` | boolean | `false` | 当重置提示或完整用量报告给出可信的重置时间时，允许按模型提供方给出的时间等待用量限制解除，即使等待时长超过 `retry.maxDelayMs`。等待可以中止，也可能使子代理暂停。 |
| `retry.usageAwareFallback` | boolean | `false` | 在轮次开始前，根据可靠的编程套餐配额报告，优先选择同一模型提供方中状态正常的账户，再考虑已配置的回退模型。用量未知时保留当前模型；不考虑普通 API 密钥。 |
| `retry.usageReservePct` | number | `10` | 用量感知回退所保护的剩余配额百分比。 |
| `retry.usageReservePolicy` | enum | `confirm` | `confirm`、`auto`、`fail-closed`。达到保留阈值时，如果可进行交互式确认，`confirm` 会请求确认，否则自动回退；配额耗尽时可直接回退，无须确认。`fail-closed` 会阻止使用已知达到保留阈值或已耗尽的配额。 |
| `providers.anthropic.serverSideFallback` | boolean | `false` | 为符合条件的直连 Claude Fable/Mythos 请求启用 Anthropic 的 `server-side-fallback-2026-06-01` 测试功能。模型目录定义的服务端回退链当前指向 `claude-opus-5`，并非 `claude-opus-5-5`；不受支持的模型和主机没有回退链。 |

当前聊天模型持续失败（如 429 错误、触及配额上限或模型提供方服务中断）且 `retry.modelFallback` 已启用时，会话会按匹配的精确程度选择该模型所属的回退链：先找精确的 `provider/model-id` 键，再找 `provider/*` 通配符，接着找当前角色的链，最后找 `default` 链。不属于任何角色的当前模型（通过 `/model` 切换或临时切换得到）也归最后这条链。实际生效的链先列所属角色的主选择器，再列已配置的条目；若当前选择器不在链中，则可尝试整条链。如果多个角色分配了同一个模型，YAML 的键顺序不决定优先级：当前会话角色优先；若会话未使用这些角色，则 `default` 优先于其他匹配的聊天角色。会话会跳过选择器仍处于冷却期的聊天候选项，并在本轮剩余时间内使用切换后的模型。模型类别运行器单独解析其所属角色的链，不使用 `default`。如果子代理定义列出多个模型模式，每次启动该子代理时都会创建独立的回退链：第一个可解析的模式为主选择器，其余为回退项。`agent:<name>` 不是 `fallbackChains` 支持的键。基于单一模型启动的子代理继承其角色的链（`@reviewer` → `fallbackChains.reviewer`）；角色没有链时，继承 `default` 链。显式设为 `[]` 表示不回退，即使 `default` 分配了同一个模型。精确模型键和 `provider/*` 键的优先级仍高于继承的链。

`openrouter/google/*` 等带前缀的通配符可用作回退链的键或条目。作为键时匹配带该前缀的 ID；作为条目时，在切换模型提供方时将前缀加到出错模型不带前缀的 ID 上。未带后缀的回退条目继承失败轮次的思考档位（包括 `auto`）；显式提供的后缀（包括 `:auto`）仅在该回退项生效期间替换思考档位。恢复主模型（冷却期结束、恢复会话或重新唤醒子代理）时会还原到回退前的档位，除非你在此期间改过档位。用尽一条回退链后，恢复流程还可查找当前回退模型自己的链；每次切换仍占用一次重试机会。恢复顺序和配额行为见[重试策略](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/non-compaction-retry-policy.md)。

如果当前模型没有可用凭据，系统会在发送提示之前尝试同一条回退链，而非直接报 `No API key found` 错误。

重试时的模型回退和上下文提升是两套机制。`contextPromotion.enabled: false` 只禁止通过[上下文提升](./models.md#context-promotion)切换到模型的 `contextPromotionTarget`；设置 `retry.modelFallback: false` 则可阻止 `retry.fallbackChains` 在模型提供方出错后切换当前模型。重试同一模型和上下文压缩仍可用。

### 工具与审批 \{#tools-and-approvals}

```yaml
tools:
   format: auto
   approvalMode: yolo # default
   approval:
      bash: prompt
      edit: allow
   maxTimeout: 0
   intentTracing: true
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `tools.format` | enum | `auto` | 工具调用的传输格式：`auto`、`native`、`glm`、`hermes`、`kimi`、`xml`、`anthropic`、`deepseek`、`harmony`、`qwen3`、`gemini`、`gemma` 或 `minimax`。`native` 始终使用模型提供方的原生工具调用。`auto` 也使用原生调用，除非所选模型明确设有 `supportsTools: false`；这种情况下会改用该模型系列对应的方言，若没有已知的专用方言，则回退到 GLM。其他值强制使用对应的带内方言。`xml` 是[通用 XML 格式](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/xml.md)；`minimax` 是 [MiniMax 格式](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/minimax.md)。参见 [GLM](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/glm-4.5.md)、[Qwen3/Hermes](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/qwen3.md)、[Kimi](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/kimi-k2.md)、[Anthropic](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/anthropic.md)、[DeepSeek](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/deepseek.md)、[Harmony](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/harmony.md)、[Gemini](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/gemini.md) 和 [Gemma](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/toolconv/gemma.md)。 |
| `tools.approvalMode` | enum | `yolo` | `always-ask`（自动批准只读操作）、`always-ask-cached`（_询问并记住_：读取文件前也会询问，并可记住文件或文件夹；见[工具审批模式](./approval-mode.md)）、`write`（自动批准读取和工作区写入）、`yolo`（自动批准所有级别的操作）。`--approval-mode` 和 `--auto-approve`/`--yolo` 可覆盖单次运行的设置。 |
| `tools.approval` | record | `{}` | 按工具名称指定各工具的策略，每个值为 `allow`、`deny` 或 `prompt`。例如 `omp config set tools.approval '{"bash":"prompt"}'`。 |
| `tools.restrictedFolders` | array | `[]` | 在这些文件夹及其所有子路径中，无论之前记住了哪些审批决定，在任何工具审批模式（包括 `yolo`）下进行的每次读取、写入、编辑、搜索或命令执行都需要明确批准。命令按其运行目录匹配。见[工具审批模式](./approval-mode.md#restricted-folders)。 |
| `tools.maxTimeout` | number | `0` | 代理可请求的最大超时时长，单位为秒；`0` 表示此设置不限制上限。 |
| `tools.intentTracing` | boolean | `true` | 要求代理说明每次工具调用的意图。未设置时，仅在交互式 TUI（终端或 Tern）及其子代理中开启，在打印、RPC、ACP 和 SDK 会话中关闭。显式配置的值在各处都生效。`PI_INTENT_TRACING` 可覆盖此设置。 |
| `tools.outputMaxColumns` | number | `768` | 流式输出每行的字节上限；`0` 表示不限制。 |
| `tools.artifactSpillThreshold` | number | `50` | 工具输出超过此阈值时转存到产物文件，单位为 KB。 |
| `tools.artifactHeadBytes` | number | `20` | 转存后内联保留的开头大小，单位为 KB；`0` 表示仅保留尾部。 |
| `tools.artifactTailBytes` | number | `20` | 转存后内联保留的尾部大小，单位为 KB。 |
| `tools.artifactTailLines` | number | `500` | 转存后内联保留的尾部最大行数。 |
| `tools.artifactMaxBytes` | number | `16` | 保存流式工具输出（bash、Python、JS 求值）的产物文件大小上限，单位为 MB。输出超出上限时，保留其开头（最多 3 MB）和最新的尾部，中间插入截断提示。`0` 表示不限制。 |
| `tools.commands` | boolean | `true` | 将不常用但可发现的工具挂载为 bash 命令，并根据工具结构定义生成 `--help`，以免在每个请求中发送这些定义。此功能需要启用 `bash` 工具；没有该工具的会话会将所有已启用的工具保留为顶层工具。关闭此设置会将所有已启用的工具暴露为顶层工具。 |
| `tools.commandDocs` | enum | `catalog` | `inline` 内联提供所有已挂载命令的帮助；`builtins` 内联提供内置命令的帮助（按需获取 MCP 和扩展命令的帮助）；`catalog` 列出所有命令，并按需获取帮助。 |
| `tools.commandInline` | array | `[]` | 在 `builtins` 模式下匹配需要内联帮助的动态命令名称的 glob 模式；`catalog` 模式忽略此设置。 |
| `tools.commandNotices` | boolean | `true` | MCP 或扩展工具挂载或卸载为命令时显示通知。关闭时仅隐藏通知；模型仍会在下一条提示中获知变化。`startup.quiet: true` 也会隐藏通知。 |
| `async.enabled` | boolean | `true` | 启用异步 bash 命令和后台任务执行。 |
| `async.maxJobs` | number | `100` | 同时运行的后台作业数上限，至少为 1；挂起或排队的作业不占用执行名额。 |
| `async.printWake` | boolean | `false` | 打印模式（`-p`、`--mode json`）等待本次运行的后台作业，而不在退出时取消它们。每收到一个结果，就带着该结果在同一会话中开始新一轮。等同于 `--wait-async`。 |
| `launch.persist` | boolean | `false` | Bash 服务（`name`）以持久模式启动：项目中最后一个 omp 进程退出后仍继续运行，直到自行停止或由 `proc://<name>/kill` 停止。打印（`-p`、`--mode json`）、RPC 和 ACP 模式始终启用该设置，因此代理留下的服务器可在 omp 进程退出后继续运行。 |
| `async.widgets` | boolean | `true` | 在 `wait` 卡片、作业状态徽标及其悬浮卡片、作业面板中显示运行中后台作业的实时小组件，包括根据作业输出生成的图表、条形图和状态网格。`widget` 模型角色为每个作业编写一份规范，后续更新均在本地计算，无须调用模型。关闭后仅显示普通作业行。 |
| `out.enabled` | boolean | `true` | 允许代理在任务执行中回复而不结束当前轮次，方法是向 `out://` 写入 Markdown（使用 `write` 工具，或在 bash 中使用 `> out://`；上限为 64 KiB）。回复会渲染为助手正文。未设置时，只在交互式 TUI（终端或 Tern）中开启，在打印、RPC 和 ACP 会话中关闭。显式配置的值在各处都生效。关闭时，系统提示词不包含 `out://`，写入请求会被拒绝。子代理的写入请求始终会被拒绝。 |
| `todo.midRunNudges` | enum | `capped` | 当一轮操作持续产生更改时，发送隐藏的轮中提醒，提示更新待办列表。更改次数按 `bash`、`eval`、`edit`、`write` 和 `ast_edit` 的成功结果计数，以最后一次 `todo` 调用为起点。`off` 从不提醒；`capped` 在达到 12 次时提醒，在待办列表发生变化或你发送消息前最多提醒两次；`backoff` 持续提醒，每次忽略提醒后将间隔加倍：依次间隔 12、24、48、96 次更改，此后每隔 192 次更改提醒。 |
| `todo.backend` | string | `native` | 主会话的待办列表要镜像到的扩展待办后端。设置值为 `id`，即扩展通过 `pi.registerTodoBackend()` 注册待办后端时指定的标识符；可在 `/settings` 的「工具 → 待办」中选择。`native` 不镜像到其他后端。无论如何选择，omp 都会保留待办列表；如果没有任何已启用的扩展注册该 ID，则报告扩展错误，不影响其他行为。 |

将工具挂载为命令要求会话启用 `bash` 工具；未启用该工具的会话会将所有已启用的工具保留为顶层工具。

各内置工具和 Eval 前导模块由各自的配置键控制，例如 `bash.enabled`、`launch.enabled`、`eval.py`、`eval.js`、`glob.enabled`、`grep.enabled`、`fetch.enabled`、`browser.enabled`、`computer.enabled`、`ratchet.enabled`（默认为 `false`，用于 Eval 和爬山优化的 `ratchet(flow)` 前导模块可由 `/ratchet` 仅在当前会话中启用）、`archive.enabled`（默认为 `true`，只读 Eval 前导模块 `archive` 涵盖提示历史、近期项目、过往会话和回顾）、`commit.enabled`（默认为 `true`，Eval 前导模块 `commit` 和 `/commit` 只提交当前代理及其子代理写入的行）、`astEdit.enabled`、`astGrep.enabled`、`find.enabled`（`auto`/`on`/`off`；若第一个可用评判器是原生评判器，`auto` 会启用 `find`）和 `web_search.enabled`。图像问答使用 `read <image>?q=<question>`，并遵循 `images.questionTimeoutMs`。

`find.hitThreshold`（大于 0 且不超过 1 的数值，未设置时为 `0.2`）是经验证的段落可使 `find` 将文件报告为命中的概率阈值，也是所列行范围的最低概率。默认值适合 TypeSafe Jev。其他判定模型的概率校准可能不同；如果评判器对无关段落给出的概率较高，则需要提高阈值以排除置信度较低的命中（参见 [find](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/find.md)）。

`find.verifyModel`（默认未设置的模型选择器，例如 `openrouter/liquid/d1-ultra`）会优先尝试指定模型来验证段落；文件名和内容速览的排序仍使用 `judge` 角色。该选择器在评判角色的候选项中解析，随后按相同的回退规则使用该角色的回退链，并去除重复项。选择器未匹配任何候选项时会记录警告，验证仍使用原有的 `judge` 链（参见 [find](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/tools/find.md)）。空值或纯空白值视为未设置。

### 窗口作用域下的计算机操作 \{#window-scoped-computer-use}

默认关闭的 `computer` Eval 前导模块通过操作系统原生 API 捕获并控制宿主机上的实际窗口。窗口句柄将操作限制在单个应用内，无须让其获得焦点或移动真实鼠标指针。`desktop` 对象保留选定显示器的合成画面和全局输入行为。此模块独立于 `browser` Eval 前导模块，后者管理 Chromium/CDP 标签页和结构化的页面自动化任务。

```yaml
computer:
   enabled: true
   display: active
   maxWidth: 3840
   maxHeight: 2400
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `computer.enabled` | boolean | `false` | 启用支持窗口操作的 `computer` Eval 前导模块；斜杠命令 `/computer` 仅在当前会话中切换此功能。 |
| `computer.display` | string | `active` | 仅控制 `desktop` 目标。`active` 捕获与焦点窗口重叠面积最大的显示器，找不到时回退到主显示器；`all` 合成所有显示器的画面。也可指定原生显示器 ID。 |
| `computer.maxWidth` | number | `3840` | 合成截图的最大宽度，单位为像素。无法保留原始细节的图像传输层（包括 GitHub Copilot Responses 和 xAI OAuth）将实际宽度限制为 `1280`；Claude 系列模型使用相同上限作为兼容性回退方案。 |
| `computer.maxHeight` | number | `2400` | 合成截图的最大高度，单位为像素。上述保障坐标准确的传输层将实际高度限制为 `896`；其他模型保留配置的上限。 |
| `computer.takeover` | enum | `fallback` | 决定窗口输入调用的后台路径不可用时如何处理，以及由谁决定是否接管。`fallback` 以接管方式重跑这一次调用，将焦点还给用户的应用（在 macOS 上，即使用户继续打字也会还回焦点；X11 和 Windows 按普通接管处理），并在结果中说明。模型可在调用中传入 `takeover`，传入时该调用不会重跑。`refuse` 让此类调用以 `BackgroundUnavailable` 失败，不接管任何输入；模型自行指定的 `takeover: true`、`raise()`、会激活应用的 `apps.open`、`control.acquire`、桌面根目标输入、非 macOS 平台上的 `el.focus()`，以及 macOS 上会打开菜单的调用，均会在发送任何输入前被拒绝。这些打开菜单的调用包括右键单击、按住 Control 单击、`AXShowMenu`、`menu` 选项；对弹出按钮或菜单按钮的按压、左键单击、按住或拖动；以及对弹出按钮调用 `setValue`。主动启用的 `foreground` 和 `always` 模式由 omp 决定是否接管，模型不能决定。`foreground` 接管对持有输入焦点的窗口的输入，`always` 接管每次窗口和元素输入调用。两者都会像 `fallback` 一样重跑被拒绝的后台调用，且输入调用不接受 `takeover` 选项。 |

每次调用时都会读取计算机操作设置和当前模型保障坐标准确的图像限制。运行时变更和成功重载的文件编辑会在下一次调用时生效。直接调用 `computer` 辅助函数或通过 `computer.run(fnOrCode, options)` 传入代码时，可通过桌面根目标或 `window(...)` 选择目标。切换目标会使之前的坐标系失效，因此发送指针输入前要先捕获新目标。启用输入前，请配置 `tools.approvalMode` 或 `tools.approval.computer`，并授予平台权限。参见[窗口作用域下的计算机操作](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/computer-use.md)。

### Shell、求值与 LSP \{#shell-eval-and-lsp}

设置 `display.shellVisualization: false` 后，bash 命令将显示为纯 Shell 文本，不再使用交互式执行可视化。此设置对流式调用和保存的会话记录均生效。系统仍会记录执行轨迹，重新启用可视化后可回放。

```yaml
bash:
   enabled: true
   allowCompoundCommands: false
   autoBackground:
      enabled: true
      thresholdMs: 60000

eval:
   py: true
   js: true

python:
   kernelMode: session # session, per-call
   interpreter: ""

lsp:
   enabled: true
   lazy: true
   diagnosticsOnWrite: true
   diagnosticsOnEdit: false
   formatOnWrite: false
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `bash.enabled` | boolean | `true` | 启用 bash 工具。 |
| `bash.allowCompoundCommands` | boolean | `false` | 将无嵌套的字面 `&&` 命令链分段求值；未匹配的命令段沿用常规 bash 工具审批策略和模式。 |
| `bash.gitGuard` | boolean | `false` | 用于多个代理并行共享检出目录的场景。在仓库的主检出目录中，拒绝 `git stash`（`list`/`show`/`create` 除外）、`reset --hard`、`reset` 到其他提交、`switch`、切换分支的 `checkout`，以及针对路径的 `checkout` 或在工作树上执行的 `restore`，但解决合并或变基冲突时除外。取消暂存仍然允许。在非裸仓库的关联工作树中允许执行这些命令，但命令要丢弃的未提交更改会先保存到 `refs/omp/discarded` 的 reflog 中（可用 `git stash apply --index <id>` 恢复）；`stash pop`/`apply`/`drop`/`branch`/`clear` 会拒绝处理保存在其他分支上的条目。这些限制由内嵌 Shell 的 `git` 内置命令执行，因此能识别展开后的命令和实际工作目录。服务、客户端终端、`pty` 调用，以及按路径或通过其他程序启动的 git 不受此保护。 |
| `launch.enabled` | boolean | `true` | 为项目中共享的长时间运行进程启用命名 `bash` 服务和 `proc://` 进程监管；没有单独的 launch 工具。 |
| `bash.autoBackground.enabled` | boolean | `true` | 自动在后台运行耗时较长的命令。 |
| `bash.autoBackground.thresholdMs` | number | `60000` | 命令在多长时间后自动转入后台。 |
| `bash.direnv` | enum | `auto` | `auto` 将仓库中已获准的 `.envrc` 加载到内嵌 bash 会话；`off` 禁用集成。此功能不会绕过 `direnv allow`。 |
| `bash.direnvLoadTimeoutMs` | number | `30000` | 首次执行 `direnv export` 的最长等待时间；超时后，会话不会加载 direnv 环境。 |
| `eval.py` | boolean | `true` | Python 求值后端。`PI_PY=0` 可在当前进程中禁用。 |
| `eval.js` | boolean | `true` | JavaScript 求值后端。`PI_JS=0` 可在当前进程中禁用。 |
| `eval.autoProvision` | boolean | `true` | 首次使用 `%bun add` 时创建受管理的 JavaScript 求值包环境。 |
| `eval.tools.enabled` | boolean | `true` | 将内核定义的 `@tool` / `tool(fn)` 函数提供给 `task`、`agent()` 和 `workpool()` 子代理。 |
| `eval.workpool.freshAgents` | boolean | `false` | 为工作池中的每一项新建代理，不复用空闲工作进程，也不批量处理排队项。 |
| `python.kernelMode` | enum | `session` | `session`（持久内核）或 `per-call`。 |
| `python.interpreter` | string | `""` | Python 解释器路径，留空则自动检测。 |
| `lsp.enabled` | boolean | `true` | 启用语言服务器集成。`--no-lsp` 可在本次运行中禁用。 |
| `lsp.lazy` | boolean | `true` | 按需启动服务器。 |
| `lsp.shared` | boolean | `true` | 通过协调进程管理的项目级 LSP 多路复用器启动语言服务器。每个连接使用自己的服务器。释放后的服务器最多保持就绪 5 分钟，供下一个连接使用，但前提是还有其他 omp 进程维持项目多路复用器运行。最后一个 omp 进程退出后，多路复用器会在几秒内停止。协调进程不可用时，回退到独立服务器。 |
| `lsp.diagnosticsOnWrite` | boolean | `true` | 写入后运行诊断。 |
| `lsp.diagnosticsOnEdit` | boolean | `false` | 编辑后运行诊断。 |
| `lsp.formatOnWrite` | boolean | `false` | 写入时格式化文件。 |
| `lsp.diagnosticsDeduplicate` | boolean | `true` | 合并重复的诊断结果。 |
| `lsp.requestTimeout` | number | `10` | 代理未传入 `timeout` 时，等待语言服务器的诊断、悬停提示等响应的秒数（调用时限至少为 20 秒）。编辑后的诊断若延迟返回，也至少等待这么久。单次调用可通过 `lsp` 工具的 `timeout` 调长或调短等待时间，取值范围为 5 到 300 秒，并受 `tools.maxTimeout` 约束。 |
| `shellPath` | string | _(未设置)_ | 服务、终端和 `!` 使用的外部 Shell。普通 bash 工具调用使用内嵌 bash。 |
| `shellCommandPrefix` | string | _(未设置)_ | 传给自行构建 Shell 工具的旧版 Pi 扩展；OMP 原生 Shell 不使用此设置。 |

### 文件编辑与读取 \{#files-editing-and-reading}

```yaml
edit:
   mode: hashline # apply_patch, hashline, patch, replace, sloppy
   fuzzyMatch: true
   fuzzyThreshold: 0.95
   blockAutoGenerated: true
   blackbox:
      enabled: false

read:
   defaultLimit: 300
   toolResultPreview: false
   summarize:
      enabled: true
      prose: false
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `edit.mode` | enum | `hashline` | `apply_patch`、`hashline`、`patch`、`replace`、`sloppy`、`magic`（描述改动，由模型写入）。`PI_EDIT_VARIANT` 可固定使用的模式。 |
| `edit.magic.model` | string | 未设置 | 填写模型选择器或 `@slow` 等角色别名，以选择写入 `magic` 改动的模型；未设置时使用 `smol` 角色。除非选择器带有思考档位后缀（`…:low`），否则关闭推理。 |
| `edit.modelVariants` | record | `{}` | 将不区分大小写的模型选择器子字符串映射到编辑模式。匹配的键中最长者优先，长度相同时按配置顺序。 |
| `edit.fuzzyMatch` | boolean | `true` | 允许模糊匹配锚点。 |
| `edit.fuzzyThreshold` | number | `0.95` | 模糊匹配的相似度阈值。 |
| `edit.blockAutoGenerated` | boolean | `true` | 拒绝编辑生成文件或类似锁文件的文件。 |
| `edit.streamingAbort` | boolean | `false` | 流式编辑不匹配时中止。 |
| `edit.enforceSeenLines` | boolean | `true` | 如果作为锚点的行在此前的读取或搜索结果中从未完整显示，则拒绝编辑。 |
| `edit.recoverInlineEdits` | boolean | `true` | 从助手文本中恢复识别出的编辑片段。 |
| `edit.autoRepair.enabled` | boolean | `false` | 请 `smol` 模型修复新引入的 AST 解析回归问题。仅接受能重新成功解析的修复，否则发出警告。 |
| `edit.blackbox.enabled` | boolean | `false` | 出现 AST 解析回归问题时附加完整源代码。 |
| `read.defaultLimit` | number | `300` | 不带选择器调用 `read` 时的默认行数。 |
| `read.summarize.enabled` | boolean | `true` | 读取代码时生成结构化摘要。 |
| `read.summarize.prose` | boolean | `false` | 也为非代码文本文件生成摘要。 |
| `read.toolResultPreview` | boolean | `false` | 内联预览工具结果。 |
| `read.renderMarkdown` | boolean | `false` | 在 TUI 中渲染读取的 Markdown 文档。 |
| `readLineNumbers` | boolean | `false` | 显示普通行号。 |

### 上下文、上下文压缩与记忆 \{#context-compaction-and-memory}

`/extended-context on` 启用更大的上下文窗口；`/extended-context off` 恢复标准窗口和高价计费上限。对于 `openai-codex/gpt-6-astra`、`openai-codex/gpt-6.1-sol` 及其 `-wm` 路由，关闭时使用 Codex 默认窗口（Astra 为 272,000 token，GPT-6.1 Sol 为 500,000 token）；开启时使用预设的 922,000 token 输入窗口（总上下文为 1.05M，其中 128K 用于输出），或者采用发现的更高上限。预设上限会纠正发现机制返回的过时偏低值。按模型显式设置的 `contextWindow` 覆盖项（位于 `models.yml`）在两种模式下都优先；若要让此开关重新控制某个模型，请移除对应的覆盖项。Codex 覆盖项仍受服务器实际支持的上限约束，可以采用预设上限或实时发现的更高上限，不能任意扩大窗口。

自定义模型提供方也可以支持这个开关：设置 `contextWindow`（标准窗口）
和 `maxContextWindow`（扩展窗口），将两项写在模型或 `modelOverrides` 条目中，配置文件为
`models.yml`。只设置 `contextWindow` 覆盖项而不设置 `maxContextWindow` 时，窗口大小
在两种模式下保持不变。参见[模型配置](./models.md)。这些值控制的是
本地预算，而非上游端点接受的请求大小。

上下文压缩的预留空间独立于此开关。按默认预留 15% 计算，Astra 文档所列扩展窗口的自动上下文压缩阈值为 783,700 token。即使没有额外的长上下文计费倍率，较大的窗口也可能消耗更多用量。

```yaml
extendedContext: false

contextPromotion:
   enabled: false

compaction:
   enabled: true
   methodOrder: [remote, snapcompact, handoff, shake, soft]
   midTurnEnabled: true # check thresholds between tool-loop provider requests
   thresholdPercent: -1 # -1 = default reserve-based behavior
   thresholdTokens: -1 # fixed token limit when > 0
memory:
   backend: off # off, local, hindsight, mnemopi
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `extendedContext` | boolean | `false` | 启用更大的模型上下文窗口；可用 `/extended-context on`、`off` 或 `status`。 |
| `workspace.additionalDirectories` | array | `[]` | 为每个会话添加的其他工作区根目录，相对路径从当前工作目录解析。`/add-dir` 和 `/remove-dir` 可即时管理这些目录。 |
| `contextPromotion.enabled` | boolean | `false` | 上下文溢出时，切换到当前模型显式指定的 `contextPromotionTarget`。此设置不影响 `retry.fallbackChains`；该回退链的切换由 `retry.modelFallback` 控制。 |
| `compaction.enabled` | boolean | `true` | 自动压缩会话上下文。 |
| `compaction.asyncEnabled` | boolean | `true` | 上下文接近压缩阈值时，提前在后台生成摘要；超过阈值时，将已生成的摘要接入上下文。 |
| `compaction.midTurnEnabled` | boolean | `true` | 在一轮中工具循环的安全边界处、向模型提供方发起下一次请求之前检查阈值。设为 `false` 只影响配置了该值的会话。子代理始终检查，因为其整个任务只有一轮。 |
| `compaction.methodOrder` | array | `remote, snapcompact, handoff, shake, soft` | 按顺序尝试的回退方法。`remote` 使用模型提供方原生的服务端上下文压缩（OpenAI Responses 的压缩接口、Anthropic 上下文压缩测试版）。方法不可用或执行失败时，尝试下一种。 |
| `compaction.thresholdPercent` | number | `-1` | 按上下文窗口百分比触发；`-1` 表示使用按预留空间计算的默认阈值。 |
| `compaction.thresholdTokens` | number | `-1` | 值 `> 0` 时，按固定 token 数触发。 |
| `compaction.modelThresholds` | record | `{}` | 按模型设置上下文压缩阈值，以 `provider/model-id` 或以 `*` 结尾的前缀（`deepseek/*`）为键。值可以是上下文压缩策略用于换算的 token 基数（`90000`）、固定 token 阈值（`"f90000"`），或窗口百分比（`"80%"`）。详见下文。 |
| `compaction.modelThresholdsEnabled` | boolean | `true` | 是否应用 `compaction.modelThresholds`。存在 `task.agentCompactionThresholdOverrides` 条目的子代理会关闭此设置运行。 |
| `task.agentCompactionThresholdOverrides` | record | `{}` | 按精确名称将任务或求值代理映射到上下文压缩阈值，值为正 token 数（`90000`）或百分比字符串（`"80%"`）。详见下文。 |
| `compaction.reserveTokens` | number | _(未设置)_ | 预留空间的绝对下限。未设置时，实际预留空间取 `16384` 和上下文窗口的 15% 中较大的值。如果这个默认值使小窗口没有足够的可用预算，则改为预留 15%。 |
| `compaction.keepRecentTokens` | number | `20000` | 摘要式上下文压缩时，为近期历史保留的 token 预算。 |
| `compaction.autoContinue` | boolean | `true` | 上下文压缩后自动继续。 |
| `memory.backend` | enum | `off` | `off`、`local`、`hindsight`、`mnemopi`。各后端有各自的调优配置键，即 `hindsight.*` / `mnemopi.*` / `memories.*`。 |
| `autolearn.enabled` | boolean | `false` | 实验功能：启用持续记录经验的指引和 `manage_skill`（启用记忆后端时还启用 `learn`）。受管理的技能位于 `<agent dir>/managed-skills` 下。 |
| `autolearn.autoContinue` | boolean | `false` | 主代理在符合条件的情况下停止后，执行一个不公开的经验记录轮次（消耗额外 token）。关闭时只保留持续指引，不会在下一轮插入隐藏提醒。跳过已中止的轮次、计划模式轮次和目标循环轮次。 |
| `autolearn.minToolCalls` | number | `5` | 主代理在单轮中必须完成的最少工具调用次数，达到后才允许自动记录。 |

正值 `compaction.thresholdTokens` 优先于 `thresholdPercent`。如果固定阈值（此设置或模型的 `f` 条目）达到或超过模型的上下文窗口，例如模型提供方将窗口限制得更小，触发点会和按预留空间计算的默认值一样，取窗口大小减去预留空间；`/models` 预览会标为 `capped by window`。其他情况下，正百分比会限制在 1% 到 99% 之间；非正百分比使用按预留空间计算的阈值。

触发阈值以你的配置为准。窗口较小或受模型提供方限制时，上下文压缩会减少近期历史保留量：保留的尾部上限为 `0.8 × trigger − reserveFloor`（若仅预留下限就占满这一额度，则取 `0.8 × trigger` 的一半），使压缩后的上下文低于该阈值的恢复区间。其中 `reserveFloor` 取实际预算预留量与 `compaction.reserveTokens`（未设置时为 `16384`）中较小的值。例如，100k 的窗口设为 `thresholdPercent: 40` 时，会在 40,000 token 触发压缩，最多保留 15,616 token 的近期历史，而非配置的 20,000 token。

`compaction` 还有其他调优配置键（如空闲时压缩、替代和丢弃启发式规则），可以用 `omp config list` 查看。完整的策略说明见[上下文压缩](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/compaction.md)。

按模型设置的上下文压缩阈值适用于匹配的模型。若条目为 token 数，则该值是常规策略用于换算的基数：omp 计算阈值时视其为模型的窗口大小。默认配置在基数减去预留空间时触发压缩（基数大于约 109k 时为 85%）；设为 `compaction.thresholdPercent: 80` 时，在基数的 80% 触发。全局 `compaction.thresholdTokens` 不适用于该模型。在 token 数前加 `f`（如 `f400k`，保存为 `"f400000"`），可将其设为精确阈值。百分比条目会取代两项 `compaction.threshold*` 设置，并按实际窗口大小计算。请求和溢出处理仍使用实际窗口。`/models` 预览会显示每个模型触发压缩的阈值。要设置阈值，请在 **角色**视图中选中角色行或回退项所在的行，按 `k`（或点击 **上下文压缩阈值**），然后输入 `400k`、`f400k`、`1M` 或 `80%`（留空可重置）。这样会将精确的 `provider/model-id` 键写入全局配置。也可以手动配置：

```yaml
compaction:
   thresholdPercent: 80
   modelThresholds:
      "deepseek/*": 90000
      "openrouter/anthropic/*": "60%"
      anthropic/claude-opus-5.5: 150000 # base: compacts at 80% of 150k
      openai/gpt-5.6-terra: "f400000" # fixed: compacts at exactly 400k
```

- 精确匹配的 `provider/model-id` 键优先；否则应用匹配的最长前缀，前缀以 `*` 结尾。`*` 只能出现在末尾，每个键都必须包含 `provider/` 部分。
- 条目值按下文 `task.agentCompactionThresholdOverrides` 的方式解析（`null` 清除较低配置层的条目），但另外支持 `"fN"` 固定阈值格式。按代理设置的条目中，token 数始终表示精确阈值，不接受 `f` 前缀。
- 触发阈值随当前模型变化：切换模型、上下文提升后以及顾问运行时，各自使用对应模型的条目。
- 对某个代理，`task.agentCompactionThresholdOverrides` 条目优先于模型条目，包括在该代理运行期间新增的条目。
- 如果项目配置设置了相同的模型键，管理界面会拒绝编辑；请改在项目配置中修改。
- 如果 token 基数大于模型的标准窗口，或固定阈值达到或超过标准窗口，系统会为该模型启用扩展窗口（即 `extendedContext` 会为它启用的窗口，包括长上下文计费档位），无须开启 `extendedContext`。基数表示所需的窗口大小，因此，即使换算后的阈值落在标准窗口内，也会启用扩展窗口。例如，对标准窗口为 272K 的模型，`300k` 基数会在 255K 时触发压缩，但模型仍在更大的窗口中运行，留出预留空间。若要继续使用标准窗口，请设定不大于标准窗口的基数，或设定小于标准窗口的 `f` 阈值。管理界面会先发出警告，再按一次 Enter 才保存。它会拒绝大于该模型最大可用窗口的基数，以及达到或超过该窗口的固定阈值。有适用的 `task.agentCompactionThresholdOverrides` 条目的子代理会忽略模型条目，因此仍使用标准窗口。

按代理设置任务或求值子代理的上下文压缩阈值。以下配置将主会话的阈值保持为 40,000 token，同时让 `scout` 在其窗口的 80% 触发压缩，让 `task` 在 90,000 token 时触发压缩：

```yaml
compaction:
   thresholdTokens: 40000

task:
   agentCompactionThresholdOverrides:
      scout: "80%"
      task: 90000
```

- 键是精确且区分大小写的代理名称（`scout` 不匹配 `Scout`）。
- 数值为固定 token 阈值（正整数）；`"N%"` 字符串表示上下文窗口的百分比，`0 < N ≤ 100`。条目会取代该代理的 `compaction.thresholdTokens` 和 `compaction.thresholdPercent` 两项设置。
- `null` 清除优先级较低的设置层指定的条目。其他任何值都会导致加载设置失败。
- 没有条目的代理使用主会话的 `compaction.*` 阈值，包括由具有覆盖项的代理启动的代理。主会话和 Vibe 工作进程不受影响。
- 解析后的触发阈值随子代理会话保存，子代理被重新唤醒时会复用该阈值。

### 外观与终端 \{#appearance-and-terminal}

```yaml
theme:
   dark: titanium
   light: light
symbolPreset: unicode # unicode, nerd, ascii
colorBlindMode: false

statusLine:
   preset: default # default, minimal, compact, full, nerd, ascii, custom
   separator: powerline-thin
   transparent: false
   showHookStatus: true

terminal:
   showImages: true
images:
   autoResize: true
   blockImages: false
tui:
   hyperlinks: auto # off, auto, always
```

| 键 | 类型 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `theme.dark` | string | `titanium` | 终端背景为深色时使用的主题。 |
| `theme.light` | string | `light` | 终端背景为浅色时使用的主题。 |
| `symbolPreset` | enum | `unicode` | `unicode`、`nerd`、`ascii`。 |
| `colorBlindMode` | boolean | `false` | 在差异中用蓝色代替绿色显示新增内容。 |
| `showHardwareCursor` | boolean | `true` | 显示终端硬件光标。 |
| `statusLine.preset` | enum | `default` | `default`、`minimal`、`compact`、`full`、`nerd`、`ascii`、`custom`。 |
| `statusLine.separator` | enum | `powerline-thin` | `powerline`、`powerline-thin`、`slash`、`pipe`、`block`、`none`、`ascii`。 |
| `statusLine.sessionAccent` | boolean | `true` | 用会话颜色为编辑器边框着色。 |
| `statusLine.transparent` | boolean | `false` | 使用终端背景作为状态栏背景。 |
| `statusLine.showHookStatus` | boolean | `true` | 显示钩子状态消息。 |
| `terminal.showImages` | boolean | `true` | 在终端支持时内联渲染图像。 |
| `images.autoResize` | boolean | `true` | 调整大图像的大小，以兼容模型。 |
| `images.blockImages` | boolean | `false` | 一律不向模型提供方发送图像。 |
| `tui.hyperlinks` | enum | `auto` | `off`、`auto`、`always`。 |
| `tui.motion` | enum | `full` | 动画预设：`full` 保留各动画自己的设置；`reduced` 以 250 毫秒的间隔播放加载指示器，关闭流光、闪烁和淡入淡出；`none` 还会让加载指示器、思考脉动和标题保持静止。流式文本不受影响（见 `tui.maxFps`）。显式设置的 `tui.spinnerInterval` 优先于预设。也可通过 `--motion` 和 `PI_MOTION` 设置。 |
| `tui.spinnerInterval` | number | 未设置 | 加载动画帧之间的毫秒数，包括终端标题中的动画；`0` 显示静态符号。未设置时遵循 `tui.motion`（`80` 为 `full` 模式下的值）。每一帧都是终端必须处理的一次重绘；所有处于控制模式的 tmux 客户端也必须处理它。也可通过 `--spinner-interval` 和 `PI_SPINNER_INTERVAL` 设置。 |
| `tui.maxFps` | number | `30` | 每秒重绘帧数上限（`1` 到 `120`），包括流式文本；按键回显仍保持 30 fps。也可通过 `--max-fps` 和 `PI_MAX_FPS` 设置。 |
| `tui.autoGraph` | enum | `auto` | 在能显示图形的终端上，用主题颜色把代理回答中的数值表格绘制成图表。`always` 使用内置规则选取最合适的图表；`smart` 会让评判模型对内置规则选中的每个表格改进图表，包括图表类型、列、行名称及分组、刻度和参考行、各指标的数值越大还是越小越好、焦点行和标题，也可以决定不绘图。评判角色解析到原生 TypeSafe jev 模型时，`auto` 使用 `smart`，否则使用 `always`；`off` 不处理表格。Tern 以 SVG 接收图表。此设置仅适用于 TUI 中的主会话：子代理会话记录以及打印、RPC 和 ACP 输出保持为纯文本，相应的系统提示词不包含示意图和图表指引。 |
| `tui.mouse` | boolean | `false` | 在主会话中捕获鼠标点击，可点击聚焦实时子代理卡片和 HUD 行，鼠标悬停时会高亮目标。点击[扩展管理的链接](./extensions.md#extension-link-schemes)时，点击事件会交给对应扩展（也可用 `app.links.hint` 不借助鼠标选择链接）。开启时，原生文本选择改为按住 Shift 拖动，鼠标滚轮也不再滚动终端，因为终端会把滚轮事件传给 omp。可用终端的滚动历史快捷键滚动，或关闭此设置。 |
| `display.pinnedAgents` | enum | `collapsed` | 编辑器上方的已固定实时代理跳转列表：`off` 隐藏，`collapsed` 只显示几行并提供展开控件，`full` 列出全部。 |
| `display.subagentLivePreview` | boolean | `false` | 在每个已固定子代理的跳转列表行下方显示其当前或最近的工具调用。 |
| `tui.resizeScrollback` | enum | `rebuild` | 终端宽度调整结束后，刷新终端滚动历史中会话记录行的方式。`append` 按新宽度在保留的历史记录下方重放会话记录；`rebuild` 清空窗格的滚动历史，再按当前宽度重放一份会话记录；`preserve` 只重绘可视区域。 |

要自定义状态栏，请设置 `statusLine.preset: custom`，并配置 `statusLine.leftSegments`、`statusLine.rightSegments` 和 `statusLine.segmentOptions`。在任一端的区段列表中加入 `status`，即可显示通过 `ctx.ui.setStatus()` 注册的扩展状态。这些状态按键排序，并在同一行中拼接显示。由 ANSI 渲染的状态栏会保留各状态自行设置的前景色，未设置的则使用强调色（Rex/Tern 的原生状态栏仍以强调色绘制所有状态）。设置 `statusLine.showHookStatus: false` 可在页脚隐藏这些状态。

`path` 区段将用户主目录缩写为 `~`。在 Windows 上，共用的路径格式化逻辑既能识别用户主目录的长名称，也能识别其现有的 8.3 别名（如 `ADMINI~1`），工具标签和错误文本中的路径也不例外。只有主目录前缀会被缩写；其余路径部分保持原有拼写，格式化不会改变工作目录或环境。设置 `statusLine.segmentOptions.path.abbreviate: false` 可在状态栏中保留完整路径。

`pi` 区段在品牌标识上标注当前生效的命名配置档案（如 `π-work`；见[配置档案](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/config-usage.md#profiles)）。设置 `statusLine.segmentOptions.pi.showProfile: false` 可隐藏该标记。

`cost` 区段显示已记录的会话费用。如果当前模型提供方或模型采用分时计费，高峰时段追加 `↑`，非高峰时段追加 `↓`，即使空闲也会在时段切换时刷新。箭头表示当前费率，不表示过去的支出；固定费率模型或设有显式费率覆盖项时不显示箭头。UTC 时段和费用估算方式见[用量费用和分时计费](./models.md#usage-costs-and-time-based-pricing)。

`cache` 区段（包含在 `full` 和 `nerd` 预设中）在发送前显示下一条消息是否会读取提示缓存。会读取时，显示暗色的数据库符号；缓存条目过期、omp 预热刷新未命中、上下文已压缩，或模型、思考档位、工具、系统提示词或缓存保留策略发生变化时，显示带删除线的警告色符号。Unicode 符号预设显示 `●`/`⊘`，ASCII 预设显示 `cache`/`!cache`。尚未使用过缓存、模型未声明缓存有效期，或当前会话属于子代理时，该区段隐藏。模型提供方无限期保留的条目（如已登录的 Codex）永不过期。重新打开会话时，根据最新的缓存回复判断，并显示为可能命中缓存。在 Tern 中，将鼠标悬停在标记上可以查看条目有效到何时（或为何无效），以及下一条消息发送的数据量；点击标记会打开 `/session`，其中的提示缓存部分还会显示缓存档位和预热计划。

`tree` 区段不包含在任何预设中，需要手动添加。当会话不再位于一条直线的末端时，该区段显示会话在树中的位置：`2/3` 表示会话经过的最深分叉处所在的分支，`3 ahead` 表示最新续接分支中回退点之后的用户轮次数。只统计包含用户轮次的分支，所以 omp 丢弃失败回复并重新回答不会产生分叉。ANSI 输入区的边框会在该区段旁标注 `/tree`；在 Tern 中，点击该区段会打开 `/tree`。聚焦子代理时隐藏此区段。要启用此区段，请设置 `statusLine.preset: custom`，并将 `tree` 添加到 `statusLine.leftSegments` 或 `statusLine.rightSegments`，例如 `leftSegments: ["vim", "model", "mode", "tree", "path", "git", "pr"]`。

### 交互 \{#interaction}

| 键 | 类型 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `steeringMode` | enum | `one-at-a-time` | `all`、`one-at-a-time`。控制如何投递排队的引导消息。 |
| `followUpMode` | enum | `one-at-a-time` | `all`、`one-at-a-time`。 |
| `interruptMode` | enum | `immediate` | `immediate`、`wait`。 |
| `btw.inject` | boolean | `false` | `/btw` 的答复会将你要求生成的引导提示词包在 `<inject>…</inject>` 中并高亮显示；`app.btw.inject`（`Alt+I`）会将它发送到主会话。主会话运行时作为引导消息发送，否则开启新一轮。 |
| `doubleEscapeAction` | enum | `rewind` | `rewind`、`tree`、`none`：分别打开回退选择器、打开会话树或不执行操作。 |
| `autoResume` | boolean | `false` | 自动恢复当前工作目录中最近一次会话。如果恢复其保存的模型必须使用不允许的回退方式，则在交互式启动时，隐式恢复会发出警告并启动不含旧历史的新会话。显式恢复和无界面运行的行为不变。 |
| `plan.enabled` | boolean | `true` | 启用计划模式。 |
| `plan.defaultOnStartup` | boolean | `false` | 启用计划模式时，每个新交互式会话都以计划模式启动。打印或 JSON 模式（`--print`）忽略此设置并输出提示；无界面的计划流程请使用 `--plan-yolo`。 |
| `ask.timeout` | number | `0` | 等待指定秒数后，提交 `ask` 表单的当前值（模型预选的答案）；`0` 禁用此行为。此设置也限制 `cfg://` 审批提示的等待时间；审批未获答复时拒绝写入，不会自动提交。 |
| `ask.notify` | enum | `on` | `on`、`off`。 |
| `pty.notify` | enum | `on` | `on`、`off`。当 bash `pty` 控制台中的程序等待你按键时发出通知，例如 `sudo` 等待输入密码。 |
| `input.bareExitOnEmptySession` | boolean | `true` | 在第一条消息之前，仅提交 `exit`、`quit` 或 `q`（不区分大小写）即可退出。 |
| `input.bareSlashCommands` | boolean | `false` | 可省略 `/`，用完整且精确的命令名执行命令；会话已有消息后，必须按两次 Enter 确认。 |
| `tui.vimMode` | boolean | `false` | 启用提示词的模态编辑；`tui.vimModeDisplay` 可选择 `text`、`icon` 或 `none`（默认为 `text`）。 |
| `startup.quiet` | boolean | `false` | 隐藏欢迎和启动界面元素，包括启动画面。 |
| `startup.showSplash` | boolean | `false` | 在正常的交互式启动时显示完整的设置动画，无须重新运行设置流程。 |
| `startup.changelogMode` | enum | `summary` | `summary`、`expanded`、`hidden`：选择启动时版本说明的显示方式。 |
| `startup.setupWizard` | boolean | `true` | 对每个设置版本，新增的入门步骤只显示一次。 |
| `update.auto` | boolean | `false` | 交互式启动时，通过当前安装使用的方式（独立二进制文件、Homebrew、mise、bun、npm）在后台安装更新的版本。进度显示在欢迎横幅的版本号之后，下次启动运行新版本。Tern、Nix 和从源码检出运行时忽略此设置。状态和工作进程日志位于 `~/.omp/update/`。 |

### 模型提供方与服务 \{#providers-and-services}

图像生成、网页搜索、语音、听写和评判使用的模型或后端顺序，通过 `modelRoles` 和 `retry.fallbackChains` 的对应条目配置，见[模型](#models)。本节列出的传输和服务行为独立于模型选择。

```yaml
providers:
   fetch: auto
   webSearchTimeoutSeconds: 60
   tinyModelDevice: default
   tinyModelDtype: default
   openaiWebsockets: auto
   openaiLiveSteering: false
   openai-codex:
      daybreak: true
   openrouterVariant: default
   kimiApiFormat: auto
   cacheRetention: auto
   maxInFlightRequests:
      anthropic: 2

provider:
   appendOnlyContext: auto # auto, on, off

tts:
   localVoice: harper
   localSpeed: 1

speech:
   enabled: false
   voice: harper
   speed: 1

stt:
   enabled: false
   language: en
   submitTrigger: never

exa:
   enabled: true
   searchDelayMs: 1000

searxng:
   endpoint: https://search.example.com
   token: SEARXNG_TOKEN
```

`providers.openaiResponsesWebsockets` 可为标准 Responses 启用 WebSocket，默认值
为 `false`；`providers.openaiWebsockets` 和 `PI_CODEX_WEBSOCKET` 只控制 Codex。
[标准 Responses WebSocket](./models.md#standard-responses-websockets) 介绍
能力限制、模型和请求层面的禁用、钩子、请求衔接，以及恢复机制的取舍。

| 键 | 类型 | 默认值 | 取值／说明 |
| --- | --- | --- | --- |
| `providers.webSearchTimeoutSeconds` | number | `60` | 每个网页搜索候选项的传输超时时长。大于 `300` 的值按 5 分钟计算。此设置不限制整条回退链的时长；候选项超时后，`web` 角色会尝试下一项。 |
| `providers.fetch` | enum | `auto` | `auto`、`native`、`trafilatura`、`lynx`、`parallel`、`firecrawl`、`jina`。 |
| `providers.webKeyless` | boolean | `true` | 允许 `web_search` 和 URL 阅读器使用你没有凭据的第三方服务，包括无密钥模式的 Parallel、Exa、Firecrawl、Keenable 和 Perplexity，Jina 阅读器，以及通过抓取访问的搜索引擎（Startpage、DuckDuckGo、Ecosia、Google、Mojeek、Hacker News、Public Web）。`false` 将两者限制为已配置的服务，包括显式配置的 `web` 角色；只有通过 `omp q --model` 为单次请求指定选择器，才仍可运行无密钥搜索引擎。 |
| `providers.tinyModelDevice` | enum | `default` | 本地微型模型使用的 ONNX 执行提供程序，或 `mlx`（Apple 芯片，通过 mlx-lm）。可由 `PI_TINY_DEVICE` 覆盖。 |
| `providers.maxInFlightRequests` | record | `{}` | 按模型提供方为 LLM HTTP 请求设置并发上限，值必须为正数。使用同一配置根目录的本地 `omp` 进程共享这些上限。未列出的模型提供方不受限制。`omp config set` 拒绝非正数或非数值。 |
| `providers.tinyModelDtype` | enum | `default` | 本地微型模型使用的 ONNX 精度。可由 `PI_TINY_DTYPE` 覆盖。 |
| `tts.localVoice` | enum | `harper` | 本地 Phonon TTS 运行器使用的语音。可用的本地语音可独立于 `modelRoles.speech` 配置。 |
| `tts.localSpeed` | number | `1` | 本地 Phonon TTS 运行器（`tts` 工具、`omp say`）的语速。`1` 为正常速度；取值限制在 `0.8` 到 `1.3`。 |
| `speech.voice` | enum | `harper` | 启用助手输出朗读时使用的 Phonon 语音。 |
| `speech.speed` | number | `1` | 朗读助手输出的语速。`1` 为正常速度；取值限制在 `0.8` 到 `1.3`。 |
| `stt.enabled` | boolean | `false` | 启用麦克风语音转文本；通过 `modelRoles.dictation` 选择识别模型。 |
| `stt.language` | string | `en` | 语音转文本的源语言提示。 |
| `stt.submitTrigger` | enum | `never` | 听写完成后自动提交的时机：`never`、`release`、`release-complete` 或 `say-submit`。 |
| `live.voice` | string | `sol` | 实时语音会话使用的语音。Codex 提供 `arbor`、`breeze`、`cove`、`ember`、`juniper`、`maple`、`sol`、`spruce`、`vale`；自定义 `live.endpoint` 使用该端点自己的语音名称。 |
| `live.endpoint` | string | _(未设置)_ | 兼容 OpenAI Realtime WebRTC 的服务器基础 URL（例如 `http://127.0.0.1:8080/v1`）。该服务器代替 Codex 提供实时语音，无须登录 Codex；参见[自定义实时端点](./rpc.md#custom-live-endpoint)。留空则使用 Codex。 |
| `live.apiKey` | string | _(未设置)_ | 仅发送到 `live.endpoint` 的 Bearer 密钥，可填字面值、环境变量名或 `!command`。这是凭据字段。 |
| `providers.openaiWebsockets` | enum | `auto` | `auto`、`off`、`on`；仅适用于 OpenAI Codex。 |
| `providers.openaiResponsesWebsockets` | boolean | `false` | 为模型目录中支持此功能的模型启用标准 Responses WebSocket。模型或请求层面的设置为 `false` 时禁用。 |
| `providers.streamFirstEventTimeoutSeconds` | number | `-1` | 监控流中首个事件的超时：`-1` 使用模型提供方或环境变量的默认值，`0` 禁用，正值指定秒数。 |
| `providers.streamIdleTimeoutSeconds` | number | `-1` | 流中相邻事件之间允许的最长静默时长，`-1` 和 `0` 的含义同上。 |
| `providers.anthropic.slowMode` | enum | `off` | `off`、`auto`。Anthropic 订阅达到 5 小时限额且提供低优先级通道时，可通过该通道恢复请求；`/slow on` 可启用此功能。 |
| `providers.openaiLiveSteering` | boolean | `false` | 将 GPT-6 流式响应期间输入的消息立即投递到该响应中（通过 Codex WebSocket 发送 `response.steer`），不必等到下一个工具调用边界。默认关闭；Codex 原生轮次通道可能拒绝响应中途插入的消息（`unsupported_native_inflight_message`）。 |
| `providers.openai-codex.daybreak` | boolean | `true` | 自动为符合资格的 ChatGPT 账户请求 Daybreak Blue 网络安全访问计划（`access_programs.cyber`）的权限。OpenAI 可能使用 Daybreak Blue 会话中的内容来改进模型；设为 `false` 可选择不使用此计划。每个会话读取各自的设置值。不适用于 Daybreak Blue 专用模型（`gpt-daybreak-blue-*`）。 |
| `providers.openrouterVariant` | enum | `default` | `default`、`nitro`、`floor`、`online`、`exacto`。 |
| `providers.kimiApiFormat` | enum | `auto` | `auto`、`openai`、`anthropic`。`auto` 遵循实时模型元数据。 |
| `providers.cacheRetention` | enum | `auto` | `auto`、`short`、`long`、`none`。将提示缓存保留设置转发给支持该设置的模型提供方。`auto` 保留模型提供方的默认值（Anthropic 的 OAuth 订阅会话条目保留 1 小时，API 密钥会话条目保留 5 分钟），并遵循 `PI_CACHE_RETENTION`；`short` 强制保留 5 分钟；`long` 在支持时使用 1 小时有效期；`none` 禁用提示缓存和缓存亲和性路由。 |
| `providers.cacheWarming` | enum | `idle` | `off`、`streaming`、`idle`。提示缓存预热会在最近一次请求的缓存条目即将到期时刷新该请求。直连 Anthropic 使用 `max_tokens: 0` 预热（不收取输出费用；如果模型端点拒绝此方式，则该会话改用回退方式）；其他情况以 1 个输出 token 的预算重放请求（Anthropic Messages 在产生第一个输出时停止；Converse 会跑完总 token 数为 1 的请求，以读取结束时返回的缓存用量）。刷新成本按本会话中重放请求实际计费的输出 token 数计算（首次重放前按 512 token 估算）。只有避免缓存未命中所节省的成本比刷新成本至少高 $0.05 时才会预热。代理运行期间，自上次实际请求以来的刷新支出加上下次刷新的成本只要不超过最便宜的退出方案，就会继续刷新。退出方案包括让条目过期（重新写入提示词），或依据 `providers.cacheWarmingStrategy` 在条目过期前压缩历史。刷新未命中缓存或失败时，停止预热，直到下次实际请求。`off` 禁用预热；`streaming` 在工具长时间运行时保护缓存前缀，并在代理结束运行时停止（任务子代理的预热最多只到 `streaming`）；`idle` 在两次运行之间也刷新（继续概率为 15%），最迟到上次实际请求后的 30 分钟，因此只适用于有效期比这段时间短的缓存条目（如 Anthropic 和 AWS Claude 的 5 分钟条目，不包括 OAuth 订阅会话等使用的 1 小时条目）。预热按实际使用的缓存保留档位的有效期运行；`providers.cacheRetention: none` 会禁止预热。模型未声明当前保留档位的有效期时（见[模型](./models.md)），不会对该模型预热。 |
| `providers.cacheWarmingStrategy` | enum | `auto` | `auto`、`keepalive`、`compact`。决定刷新不再划算时如何应对长时间的工具调用。若上下文压缩（读取提示词、生成摘要、重新写入压缩后的上下文）比让条目过期至少便宜 $0.05，`auto` 会执行上下文压缩，否则让条目过期；`keepalive` 从不压缩上下文；`compact` 在第一个决策点执行上下文压缩。仅达到下方阈值的提示词才会触发上下文压缩，并且必须有一种支持自动、异步、轮中执行的非 `soft` 压缩方法（`remote` 或 `handoff` 位于 `compaction.methodOrder` 首位）。存在 `session_before_compact` 扩展处理程序时不会执行。压缩请求会在条目过期前 1 分钟发出，为尚未完成的工具调用之前的历史生成摘要。工具返回时，摘要替换原有历史。如果请求在被模型提供方接受之前失败，则改为刷新一次。 |
| `providers.cacheWarmingCompactPercent` | number | `60` | 要通过上下文压缩应对长时间的工具调用，提示词须达到的上下文窗口占比。此阈值与 `providers.cacheWarmingCompactTokens` 换算为 token 数后取较低值。 |
| `providers.cacheWarmingCompactTokens` | number | `150000` | 要通过上下文压缩应对长时间的工具调用，提示词须达到的 token 数。此阈值与 `providers.cacheWarmingCompactPercent` 换算为 token 数后取较低值。 |
| `provider.appendOnlyContext` | enum | `auto` | `auto`、`on`、`off`。 |
| `exa.enabled` | boolean | `true` | 启用 Exa 网页搜索服务。 |
| `exa.searchDelayMs` | number | `1000` | Exa 网页搜索请求之间的最短间隔，单位为毫秒；设为 `0` 可取消间隔限制。 |
| `searxng.endpoint` | string | _(未设置)_ | SearXNG 实例的 URL。 |
| `searxng.token` | string | _(未设置)_ | SearXNG 令牌；另有 `searxng.basicUsername`/`searxng.basicPassword`/`searxng.categories`/`searxng.language`/`searxng.engines`（以逗号分隔的引擎名称或 bang 快捷指令，例如 `ddg, br, startpage`，作为 API 的 `engines=` 参数发送）/`searxng.safesearch`。 |
| `auth.broker.url` | string | _(未设置)_ | 认证代理的 URL。实际凭据连接优先使用环境变量，其次使用主全局配置，不使用项目配置或配置覆盖层的值。 |
| `auth.broker.token` | string | _(未设置)_ | 认证代理的令牌。`OMP_AUTH_BROKER_TOKEN` 优先于主全局配置，认证代理令牌文件作为回退。项目配置和配置覆盖层的值不会改变凭据的去向。 |
| `task.agentAccountPools` | record | `{}` | 将任务或求值代理的精确名称映射到模型提供方 ID，再映射到 OAuth 身份键（即 `identityKey` 值，见[客户端账户池](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md#client-account-pools-routing-not-authorization)，如 Anthropic 的 `email:<address>\|org:<id>`；可用 `omp usage accounts` 列出）。代理为每个列出的模型提供方进行身份验证时，只能使用指定账户，不会使用其他账户或 API 密钥。如果没有可用账户，代理执行会失败；空列表表示不允许使用任何账户。条目格式错误会导致设置加载失败。参见[任务代理发现](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/task-agent-discovery.md#model-and-structured-output-precedence)。 |
| `secrets.enabled` | boolean | `false` | 向模型提供方发出请求前，启用已配置的秘密信息混淆，并由内置规则遮蔽形式类似凭据的令牌。参见[秘密信息混淆](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/secrets.md)。 |

模型提供方的凭据和自定义模型定义分别配置，参见[模型提供方](./providers.md)和[模型](./models.md)。

#### 自动使用已存重置额度 \{#saved-reset-auto-consumption}

`codexResets.autoRedeem5h` / `autoRedeemWeekly` 和 `claudeResets.autoRedeem5h` / `autoRedeemWeekly` / `autoRedeemFable` 按窗口控制已存重置额度的使用方式。`yes` 自动使用，`no` 从不使用，`unset` 先询问，不会在未提示的情况下使用（例如 `omp -p` 这类没有提示界面的会话，只会显示指向 `/usage reset` 的通知）。每次使用额度由一个窗口管辖：为解除限制而使用额度时，若任何受限窗口是每周窗口（对 Claude 而言，是除 `anthropic:5h` 之外的任何覆盖限额），则由每周配置键决定，否则由 5 小时配置键决定；为避免额度过期而使用时，由它能恢复的用量占比最高的窗口决定。如果只知道 Codex 因 429 错误需要等待不超过 6 小时，则两个窗口都有可能，必须检查两个 Codex 配置键。若可恢复多个账户，配置键为 `yes` 的账户优先于需要询问的账户。对提示的回答会保存到仍为 `unset` 的适用配置键。旧版单一 `autoRedeem` 的值会迁移到 5 小时和每周配置键；Fable 的初始值为 `unset`。

Claude Fable 的上线重置额度用于恢复 Fable 的每周用量配额（清除 5 小时用量只是附带效果），因此只由 `claudeResets.autoRedeemFable` 控制。只有限制涉及 Fable 每周上限时，它才会用于解除限制；是否为避免过期而使用，只根据报告中的 Fable 用量判断。Fable 用量为零或报告中没有 Fable 一行时，既不会使用，也不会发出警告。

用量刷新发现符合条件的已存重置额度将在接下来 **5 分钟**内过期时，即使用量极少或为零、设有额度储备，或配置为 `salvageHorizonHours: 0`，也会尝试自动使用。仍须满足同意、模型提供方资格、覆盖限额和冷却期等条件，且防止重复使用的保护仍然生效。

`salvageHorizonHours` 控制是否根据用量提前使用即将过期的额度；设为 `0` 时，最后 5 分钟的规则仍生效。要停用某个模型提供方的自动使用功能，请将该模型提供方的所有窗口配置键设为 `no`。

要手动使用一个重置额度，可在会话中使用 `/usage reset`，或从 Shell 使用 `omp usage reset`。后者无须会话或 TTY，也可从认证代理客户端使用。不带参数时，按 `<provider>/<credential id>` 列出各账户的已存重置额度；传入一个账户参数时，使用该账户的一个重置额度。

如果已存重置额度能恢复的窗口中，用量占比最高的窗口已使用至少 25%，`omp usage` 和当前账户状态栏的用量区段会标记将在 **7 天**内过期的额度。距离过期不足 **24 小时**时，`omp usage` 启动时会按账户显示横幅，说明上述自动检查会直接使用额度、先询问（仅当交互式 omp 会话已打开时）还是不使用，并在模型提供方允许时列出可立即使用该额度的 `/usage reset` 目标。在额度过期前的最后 6 小时，交互式 TUI 会显示一行警告；跨所有对话和 omp 窗口只提醒一次（`agent.db` 记录已提醒的额度）。

### 费用上限 \{#cost-limits}

```yaml
session:
   warnCost: 5 # USD: warn once when the session's spend reaches it
   maxCost: 10 # USD: stop sending model requests from this spend on
```

两项设置默认均未设置，接受以美元计的正数金额。`--warn-cost` 和 `--max-cost` 可覆盖单次运行的设置；会话打开期间设置或更改任一项，都会从下一次请求起生效。费用按模型目录中的价格统计，涵盖会话及其子代理的每次模型请求：代理轮次、附带请求（上下文压缩、交接、顾问审查、`/btw`、缓存预热）、求值中的 `completion()`/`judge()`/`judge_batch()`、由评判器支持的 `find`、图像问答、面向纯文本模型的图像描述、编辑自动修复和作业小组件。达到上限后，这些请求也会被拒绝，且不会生成会话标题。记忆提取（Mnemopi 和记忆整合）在后台运行，既不计入上述费用统计，也不会因上限被拒绝。每次请求发送前都会检查上限，因此已发出的请求仍可完成，即使最终超出上限。通过 `--resume`/`--continue` 启动或切换到某个会话时，以会话文件记录的费用为起点（即页脚和 `/usage` 显示的总额），其中不包含早先运行的后台子代理费用和附带请求费用。`/new` 从零开始；派生会话、创建分支和 `/btw` 会保留既有会话费用。若达到费用上限而停止运行，交互式 TUI 会显示原因，并将被拒绝的提示词放回编辑器；打印模式以状态码 `3` 退出；RPC 报告 `error.code: "cost_cap"`。

### Spotlight 实验 \{#spotlight-experiment}

通过 Stencil Spotlight 对工具输出做实验性整形，并为 `find` 排序（`POST https://cloud.stencil.so/v1/spotlight`，使用 `omp token stencil` 输出的 Stencil 凭据进行身份验证）。开启后，所有会话（包括子代理会话，不包括辅助会话）都会使用 Spotlight 整形工具结果并排序 `find` 候选项，并在日志中记录整形操作。随机留出的未整形结果作为对照。没有凭据时，整形会回退到无需排序的规则；每次凭据变为不可用时，会话都会警告一次。

```yaml
spotlight:
   experiment:
      enabled: true
      holdout: 0.05
      scoreFree: 0.15
      tools: ["*"]
   thinking: med
   timeoutMs: 5000
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `spotlight.experiment.enabled` | boolean | `false` | 为新建和恢复的会话开启实验。`PI_SPOTLIGHT_EXPERIMENT` 可覆盖此设置。 |
| `spotlight.experiment.holdout` | number | `0.05` | 随机留出而不应用的拟裁剪结果比例，范围为 0 到 1（见下文）。`PI_SPOTLIGHT_HOLDOUT` 可覆盖此设置。 |
| `spotlight.experiment.scoreFree` | number | `0.15` | 未留出的结果中，不使用 Spotlight 整形的比例，范围为 0 到 1（见下文）。`PI_SPOTLIGHT_SCORE_FREE` 可覆盖此设置。 |
| `spotlight.experiment.tools` | array | `["*"]` | 按名称指定实验中要整形结果并记录日志的工具；`*` 表示所有工具。未列出的工具返回原样结果，不写入日志条目。`PI_SPOTLIGHT_TOOLS`（以逗号分隔的名称）可覆盖此设置。 |
| `spotlight.url` | string | `https://cloud.stencil.so/v1/spotlight` | 排序端点。`STENCIL_SPOTLIGHT_URL` 可覆盖此设置。 |
| `spotlight.model` | string | `whiskers-latest` | Spotlight 模型。 |
| `spotlight.thinking` | enum | `med` | `low`、`med`、`high` 或 `max`：思考档位越高，费用越高。 |
| `spotlight.timeoutMs` | number | `5000` | 单次工具调用中一次排序的时间预算；超时后，整形回退到不需要排序的规则。 |

整形会改写代理调用的每个工具提供给模型的结果（`spotlight.experiment.tools` 可缩小范围）。`read`、`bash` 和 `eval` 各自整形自己的结果，TUI 仍显示完整输出。其他工具（`grep`、`find`、`glob`、`edit`、`wait`、`task`、`web_search`、MCP 和扩展工具）在调用返回时，经过 pi 的产物转存和输出通知处理后，再按命令输出整形：压缩数据转储（JSON 和其他结构化输出），折叠已显示过的行，并限制大小，保留显示行所属的 `# dir/` / `## file` 标题。不超过约 3,900 字符且少于 40 行的结果会完整保留（`stats.short`），但连续至少 3 行已显示过、且这段文本（含换行）比占位标记至少长 80 个字符时，会折叠为 `… [N lines as shown before: read T:A-B]`。`T` 对于文件读取是读取的文件；对于从完整产物整形出的 bash 输出，是该次运行自身的产物文件；其他情况则是仅在应用折叠时保存的副本。命令输出的最后一行从不折叠（即使输出重复了较早的运行而提前结束，也仍显示结束的位置）。调用的 `i` 意图中提到的行也照常折叠，因为代理的上下文中已有这些行。若 bash 输出的长行被输出端截断至 `tools.outputMaxColumns`，整形会像处理转存结果一样读取完整产物，其裁剪结果可能比输出端预览更长（见**节省量**）。只整形文本块，图像等其他块保持不变；已转存结果基于工具自己的完整文本整形（最多 4 MiB），其卡片显示模型实际收到的文本。不整形工具或脚本自行发起的调用（如 eval 的工具桥接、挂载的工具命令）。`read` 读取 URL（`https://`、`pr://`、`issue://` 等）或任何不按文件行显示的内容时，按命令输出整形。读取 `local://`（包括分页取回隐藏文本的转存文件及其他临时文件）、`agent://`、`skill://` 或 `rule://` 时，以及其他工具的调用以 `path` 指定其中之一时，保留完整结果。读取 Markdown 文件、所有行范围都有结束位置的读取（`file.ts:120-180`、`:1-10,40-60`、`:-30`），以及带 `:raw` 的读取也不裁剪（日志条目中记为 `stats.rawReads`）。使用 `;`/`,` 分隔路径的 `read` 按一次调用整形：各部分按各自单独读取时的规则处理（由文件读取窗口、`:raw` 或有界行范围决定），共用一个日志条目和一条跟踪记录，后者的原始内容信息将每个部分列为一个窗口（`original.windows`）。不会根据同一列表的另一部分折叠当前部分的已显示行。如果整形无法比它读取的完整输出减少 token，则原样显示（日志条目中记为 `stats.reverted`）。

读取超过约 12,000 字符的代码时生成大纲，长文档折叠为所需章节，测试日志只保留失败内容，数据转储无损压缩，已显示过的行折叠，超过 400 字符的行截断。其他超过约 3,900 字符的结果，裁剪为 Spotlight 排名最高的约 3,000 字符；以下内容除外：不超过约 12,000 字符的大纲、源代码读取、子代理报告（`task` 和 `wait` 的结果，以及 `omp -p` / `claude -p` / `codex exec` 的运行结果）、编辑结果、拉取请求和议题讨论（`pr://N`、`issue://N`）及差异（来自任意工具的统一差异文本），以及 ASCII 图画和不超过约 7,800 字符的代理自身程序输出。裁剪时会保留每个选中行的相邻行，并越过只含括号的行，使 C 函数的签名显示在单独一行的 `{` 上方。大纲会展开对话中提到的代码体，包括签名跨多行的函数体。裁剪长大纲时，优先保留这些代码体和包含意图中罕见词的行；为容纳代码体，可超出约 3,000 字符，最多到约 12,000 字符。如果命令输出中有 1 到 3 种行样式反复出现（至少 50 行，抹去数字后这些样式共占 95%），只保留首行、末行和不同的行，不保留这些行的常规相邻行；用一行 `[uniform: hidden lines: N match "…" (N: any number); 19 lines differ (15 like "WARN …", 4 like "ERROR …"), all shown]` 统计各样式隐藏的行数，并指明有哪些不同的行（最多 3 行时按行号指明；否则，如果不同的样式最多 3 种，则按样式指明）。词汇选择优先保留包含意图词、且含该词的行不超过 6 行的行（意图词从 4 个字母起算，`gen:rpc` 或 `index.ts` 等由较短部分构成的复合词算作一个词）。若某词出现太频繁，无法用来确定特定的行，会先选其首个和最后一个匹配行；无论输出按最新内容在前还是在后排列，都会选到最新内容。对于经评分且不属于重复样式的结果，Spotlight 还尝试保留热度最高的行周围的完整段落。如果常规选择遗漏了较长的高热度段落，且所有段落合计不超过常规窗口的两倍，也不超过未整形预览的六分之一，就将它们加入，而无需移除其他内容。否则，在原窗口预计占用大小内，以完整段落替换优先级较低的文本。它会保留窗口框架、已显示的意图匹配，以及已显示的高热度上下文；先尝试纳入遗漏段落中评分最高的一个，再选择补齐成本最低的段落。新纳入的文本最多占窗口的一半。对大型源代码大纲，保留排名最高的源代码行、其紧邻行以及所在代码块的签名（含多行签名），不会让整个函数占用代码体的保留额度。最终窗口沿用这些原始行标识；若多段摘录共用同一签名，只计一次。整份文件视图已有评分时，复用源代码评分，不重新给呈现出来的折叠标记排序。未显示的部分保留精确的文件行范围以便恢复。孤立的分隔线并入周围的省略区间。抓取到的 Markdown 页面会随内容保留章节标题和表格列名。若结果来自读取，裁剪结果中的省略标记（`… [A-B]`）和被截断的行使用文件本身的行号；其他情况下使用保存副本的行号，副本由结果最后一行指明（`[cut: local://N.log]`）。系统提示词中的整形规则会对这两种情况说明一次。裁剪 `git log` 输出时，每个显示的行上方都会保留对应的提交头（`commit`、`Author:`、`Date:`）和主题；如果省略区间隐藏了完整提交，会标明这些提交（`… [161-227] (2 commits: 3102b08 "fix(task): …", 9b72b7e "…")`，超过 4 个时只列哈希）。压缩后的数据视图会在省略标记中写明如何读取（`… [N lines: read T:A-B]`），避免被误认为数据值。命令输出的省略标记不缩进；发生变化的命令输出以 `[exit code N]` 开头。如果结果取回了先前裁剪隐藏的行，视为代理再次请求，仅在结果不超过约 12,000 字符时完整显示；更长的重跑结果照常裁剪。系统提示词中的一条规则要求代理缩小读取范围并批量调用。Spotlight 根据调用意图字段 `i` 对每个结果排序（需启用 `tools.intentTracing`），因此实验会话采用 `Brief label: detail` 格式。工具活动显示由 2 到 6 个词组成的标签；Spotlight 和会话保留完整意图，包括代理希望从输出中获得什么以及已经知道什么。没有冒号加空格分隔符的意图会完整显示。提示词可配置：`i` 的结构定义说明和系统提示词中的相关指引来自 `prompts/spotlight/intent-field.md` 和 `intent-guidance.md`；`PI_INTENT_DESC` / `PI_INTENT_PROMPT` 仍可覆盖它们。

实验会为会话关闭 pi 的读取摘要器（`read.summarize.*`）和 bash 输出精简器（`shellMinimizer.*`）。因此，一次调用的**原样**结果，即整形的对照基准及留出结果所用的文本，是工具自身的输出，仍受 pi 的常规截断和限制。没有选择器的 `read` 会将文件读取窗口扩大到产物转存阈值，而不是限制为 `read.defaultLimit` 行，因此整形会像摘要器一样为整个文件生成大纲。隐藏文本保存为会话转存文件，结果中的标记会给出位置（可用 `read local://N.log:A-B` 读回）。排序失败或超时不会导致工具调用失败：整形会回退到不需要排序的规则，整形出错则保留未整形的结果。`find` 会使用 Spotlight 而非 `judge` 角色为候选文件排序；Spotlight 失败时，回退到评判器。

**留出。** 每个要整形的结果都会在整形前随机抽取是否留出（概率为 `spotlight.experiment.holdout`），无论抽取结果如何都会执行整形。如果抽中留出且整形会改变文本，模型会收到同一次调用的原样结果；整文件 `read` 会按原样读取窗口重新分页。这样，随机留出的结果可用于对照实际应用的裁剪。整形前后不变的结果从不留出。日志条目和结果的跟踪信息会描述本会进行的裁剪，Tern 会以暗色提示「已留出 · 原可节省 N token」，打开面板可查看模型未收到的裁剪结果。

**已显示过的行。** 结果到达时仍在模型上下文中的内容才算已显示，其中包括用户消息、助手文本和助手的调用命令（不含 `read` 的路径）、模型实际收到的工具结果，以及同一轮尚未送达的其他并列调用的结果。若某行因上下文压缩、旧结果裁剪或省略、上下文清除或切换分支而移出上下文，就不会再被折叠。

**无评分。** 未抽中留出时，会再次随机抽取（概率为 `spotlight.experiment.scoreFree`），决定是否不使用 Spotlight 而直接整形。抽中时不调用 Spotlight，各步骤均使用其无评分规则（大纲保留对话中提到的代码体，文档保留对话中提到标题的章节，窗口和数据转储保留头尾）。模型会收到该裁剪结果，以便通过比较无评分裁剪和评分裁剪，衡量 Spotlight 排序带来的增益。

**节省量。** 节省量以调用的原样结果（`plainChars`、`plainTokens`）为基准：已转存的 `bash` 输出以截断后的文本及截断提示为准，`read` 以第一页为准，`eval` 以截断后的输出为准，其他工具以经过产物转存和输出通知处理后留下的结果为准；不以整形读取的完整输出为准。整形不会给模型发送比原样结果更多的内容：若某次裁剪相对原样结果节省不到 100 token，则不会应用该裁剪，也不会留出。模型收到原样文本，`plain-cap` 会加入 `steps`，而拟裁剪结果的大小记录为 `cappedChars`/`cappedTokens`。唯一的例外是长行被输出端截断的 `bash` 输出（上限为 `tools.outputMaxColumns`）。预览中剩余内容要通过读取产物文件获得，因此只要完整输出的裁剪结果不超过约 3,900 字符，即使其 token 数比预览更多，也会应用该裁剪。模型收到原样结果时（无论是保留还是受上限限制），`outChars`/`outTokens` 为原样文本的大小。已应用或留出的裁剪，其 `savedTokens` 为 `plainTokens − outTokens`（当按列截断的输出经裁剪后比预览长时为负值）；其他情况为 0，包括受条件限制的读取。

会话日志（`session.jsonl`）以 `custom` 条目记录实验：

- `spotlight:session`：`{model, thinking, urlHost, piVersion, holdout, scoreFree, tools}`。每次启动会话时写入；切换到某文件，且该文件最后一条 `spotlight:session` 的比例或工具不同，也会再次写入。`holdout` 和 `scoreFree` 是当前生效的抽取比例，`tools` 是要整形的工具（`["*"]` 表示全部）。实验成为可开关功能之前的日志记录 `spotlight:assignment` 条目，其中标明会话的 `arm`。
- `spotlight:shape`：每个被整形的工具结果记录一条（`tool` 是代理调用的名称）：`{toolCallId, tool, steps, inChars, outChars, inTokens, outTokens, plainChars, plainTokens, ms, spotlight: {calls, failures, failureCauses?, ms, tokens, costUsd}, stats, holdout?, scoreFree?, error?}`。`failureCauses` 按原因统计失败的调用（`no_credential`、`timeout`、`transport`、`rate_limited`、`bad_reply`、`http_<status>` 等），至少有一次调用失败时才存在。`steps` 列出改写结果的步骤（`outline`、`docs`、`tests`、`dump`、`window`、`seen`、`lines`），若无改写则为 `["none"]`。`plainChars`/`plainTokens` 记录原样结果大小；`cappedChars`/`cappedTokens` 记录因过长而未应用的裁剪结果大小（`plain-cap`）。`holdout: true` 标记留出结果；它的 `steps`、`outChars`、`outTokens` 和 `stats` 都是拟裁剪结果的数据。`scoreFree: true` 标记抽中无评分后未使用 Spotlight 整形的结果，无论文本是否改变。
- `spotlight:find`：会话执行的每次 `find` 调用记录一条。`ranker` 为 `spotlight`；若 Spotlight 失败且改由评判器排序，则为 `judge`。

结果的 `details.spotlight` 跟踪信息包含同样的大小和抽取结果、`savedTokens`，以及文本变化时的 `original`（作为会话产物保存的原始内容、保留的连续行段及原因、逐行热度，即每一行在 Spotlight 评分的行中的排名，范围为 `0` 到 `9`）。留出结果的跟踪信息增加 `holdout: true`；`savedTokens` 是预计节省量，`original.kept` 是拟保留的行段，`original.shapedUrl` 是保存拟裁剪文本的会话产物。

### 其他设置组 \{#other-groups}

本目录未逐项列入表格的配置结构路径，均以 `omp config list` 为准。其他设置组包括：

- 代理行为与安全：`ask.*`、`dev.*`、`eval.*`、`features.*`、`goal.*`、`loop.*`、`model.loopGuard.*`、`model.toolCallLoopGuard.*`、`prewalk.*`、`recap.*`、`sharpshooter.*`、`task.*`、`tools.*` 和 `vault.*`。
- 执行与内容：`commit.*`、`completion.*`、`edit.*`、`error.*`、`extensionHandlers.*`、`generate_image.*`、`git.*`、`images.*`、`live.*`、`paste.*`、`power.*`、`read.*`、`shellMinimizer.*`、`speech.*`、`terminal.*` 和 `title.*`。
- 界面与启动：`composer.*`、`display.*`、`extensionRenderers.*`、`input.*`、`marketplace.*`、`spelling.*`、`statusLine.*`、`startup.*`、`stt.*`、`tui.*`、`ttsr.*` 和 `update.*`。`extensionRenderers.assistantText`（默认为 `false`）启用[助手文本渲染器](./extensions.md#assistant-text-renderer)和[扩展链接方案](./extensions.md#extension-link-schemes)；`extensionRenderers.transcriptPresenters`（默认为 `false`）启用[会话记录呈现器](./extensions.md#transcript-presenter)。
- 发现、共享与认证：`auth.*`、`browser.*`、`claudeResets.*`、`codexResets.*`、`collab.*`、`commands.*`、`contextFiles.*`、`gc.*`、`ida.*`、`mcp.*`、`share.*`、`skills.*`、`stream.*` 和 `telemetry.*`。有关 `contextFiles.extra` 的说明，见[上下文文件](./context-files.md#extra-filenames)。
- 未分组的键：`setupVersion`、`proseOnlyThinking`、`omitThinking`、`externalThinking`、`includeWorkspaceTree`、`autocompleteMaxVisible`、`emojiAutocomplete`、`disabledExtensions`、`inlineToolDescriptors` 和 `treeFilterMode`。

这些设置依然遵循上文的规则，类型和默认值由配置结构定义。

## 旧版配置迁移 \{#legacy-migration}

`omp` 会自动迁移旧版配置格式，无需采取任何操作。下面列出你可能在 `config.yml` 中看到的变化。

### 启动时迁移到 `config.yml` \{#startup-migration-to-configyml}

当前代理目录下既没有 `config.yml`，也没有兼容的 `config.yaml` 时，允许写入的启动流程会按以下顺序合并旧版配置源：

1. `<agent dir>/settings.json`。
2. 保存在 `agent.db` 中的设置（覆盖与之冲突的 JSON 值）。

非空迁移结果会写入 `config.yml`。只有写入成功后，已解析的旧版 JSON 文件才会重命名为 `settings.json.bak`，数据库中的已迁移设置才会被清除。结果为空时不创建 YAML 文件。

只要任一主 YAML 文件已存在，就不再读取这些旧版配置源。对于其他配置文件，通用配置加载器也会执行从 `.json` 到 `.yml` 的迁移，前提是只存在 `.json` 格式。

### 字段级迁移 \{#field-level-migrations}

加载原始设置（全局、项目、配置覆盖层和构造函数覆盖项）时会应用下列迁移。转换为标准格式的内容会在后续保存时写入文件：

| 旧配置 | 新配置 |
| --- | --- |
| `inspect_image.enabled` / `inspect_image.mode` | 已移除 |
| `inspect_image.timeoutMs` | `images.questionTimeoutMs` |
| `queueMode` | `steeringMode` |
| 平铺的 `theme: "<name>"` 字符串 | `theme.dark` / `theme.light`（根据亮度选择对应项；内置的 `light`/`dark` 值会被丢弃，改用默认值） |
| 旧版 `task.isolation.mode: none` | `task.isolation.enabled: false` |
| 旧版 `task.isolation.mode: <backend>` | `task.isolation.enabled: true` + `isolation.backend: <backend>` |
| `task.simple` | 已移除 |
| 旧版隔离后端（`worktree`、`fuse-overlay`、`fuse-projfs`） | `rcopy`、`overlayfs`、`projfs` |
| `lastChangelogVersion` | 已移至标记文件，并从 `config.yml` 中移除 |
| `doubleEscapeAction: branch` | `doubleEscapeAction: rewind` |
| `collapseChangelog` | `startup.changelogMode`（`true` → `summary`，`false` → `expanded`） |
| `edit.mode` / `edit.modelVariants` 的值 `atom`、`vim` | `hashline` |
| `readHashLines` | 已移除；哈希锚点由 `edit.mode` 决定 |
| `compaction.strategy` / `compaction.remoteEnabled` | `compaction.methodOrder`，保留显式选择的策略和禁用远程压缩的设置 |
| `snapcompact.systemPrompt` 布尔值 | `all` / `none` |
| `task.eager` / `todo.eager` 布尔值 | `always` / `default` |
| `features.unexpectedStopDetection` 布尔值 | `smart` / `none` |
| `inlineToolDescriptors` / `find.enabled` 布尔值 | `on` / `off` |
| `spelling.autocomplete` 布尔值 | `auto` / `off` |
| `search.enabled` / `search.contextBefore` / `search.contextAfter` | 对应的 `grep.*` 配置键 |
| `serviceTier` / `serviceTierSubagent` / `serviceTierAdvisor` | 按系列划分的 `tier.*`；`fastModeScope` 已移除 |
| `advisor.subagents` | `task.agentAdvisor.task`（`on` / `off`） |
| `dev.autoqa.consent` / `todo.reminders.max` | `dev.autoqaConsent` / `todo.remindersMax` |
| `providers.parallelFetch` | 已移除；请使用 `providers.fetch` |
| `providers` 模型或后端选择器、`tts.localModel`、`stt.modelName` | 按[模型](#models)中说明的方式迁移到角色和回退链设置；已停用的键会被移除 |
| `exa.enableSearch` / `exa.enableResearcher` / `exa.enableWebsets` | 搜索开关并入 `exa.enabled`；Researcher 和 Websets 开关已移除 |
| `computer.backgroundFallback` | `computer.takeover`（`takeover` 变为默认值 `fallback`；`refuse` 保持不变） |
| `computer.backend`、`tools.discoveryMode`、`tools.essentialOverride`、`mcp.discoveryMode`、`mcp.discoveryDefaultServers` | 已移除 |

## 故障排查 \{#troubleshooting}

### 项目设置未生效 \{#a-project-setting-is-not-taking-effect}

- 请在启动 `omp` 前进入包含 `.omp/config.yml` 的目录。设置发现仅检查当前工作目录中的 `.omp/`，不检查上级目录。
- 确认 `.omp/` 非空；空配置目录会被忽略。
- 确认文件是有效的 YAML，且顶层为映射。
- 在该目录运行 `omp config get <key>`，查看实际生效的值。
- `--config` 配置覆盖层和运行时选项会覆盖项目配置。

### 全局数组在项目中消失 \{#a-global-array-disappeared-in-a-project}

大多数数组采用替换而非追加（`bash.patterns` 和 `bashInterceptor.patterns` 则将项目条目放到全局条目前面）。若项目设置了 `disabledProviders`、`enabledModels`、`cycleOrder`、`extensions` 或其他采用替换方式的数组，请在项目配置层提供所需的**完整**值，因为全局数组会被整体替换。

### 编辑配置后模型提供方仍可用 \{#a-provider-is-still-available-after-editing-config}

- 检查禁用的是模型提供方 ID（例如 `anthropic`），还是发现源 ID（例如 `claude`）。两者同属 `disabledProviders` 命名空间，但 ID 不同，效果也不同。
- 检查项目配置或配置覆盖层的 `disabledProviders` 数组是否替换了全局数组。
- 凭据仍可能来自环境变量、`.env`、OAuth、已保存的认证信息或 `models.yml`。禁用模型提供方后，无论凭据来自哪里都无法选择该模型提供方；请确认编辑了正确的配置层。参见[模型提供方](./providers.md)。
- 检查是否出现实时重载保留最后一个有效配置层的警告。模型提供方和发现源的开关会影响下一轮发现；已打开的目录或选择器可能需要刷新。

### `omp config set` 修改了错误的文件 \{#omp-config-set-changed-the-wrong-file}

`omp config set` 和 `omp config reset` 写入当前代理或配置档案目录下的主全局 YAML 文件（`config.yml` 或已存在的兼容文件 `config.yaml`）。运行 `omp config path` 可查看该目录，并检查 `--profile`、`OMP_PROFILE` 和 `PI_CODING_AGENT_DIR`。仅适用于项目的配置键应直接在 `<repo>/.omp/config.yml` 中编辑。

### `--config` 配置覆盖层在启动时出错 \{#a---config-overlay-fails-at-startup}

`--config` 文件是仅对当前进程生效的 YAML 映射。文件缺失、YAML 无效或顶层为数组或标量时，会直接报错，不会静默回退到优先级更低的设置。请修正路径或文件内容。

### 环境变量覆盖了配置 \{#an-environment-variable-beats-my-config}

为方便按机器配置，某些设置（模型角色、求值后端、微型模型的设备或精度、认证代理、PTY）可由环境变量或命令行选项覆盖，其优先级高于 `config.yml`。取消设置该变量或省略相应选项，即可使用已保存的值。参见[环境覆盖项](#environment-overrides)和[环境变量](./environment-variables.md)。

### `omp config set <key>` 报告“Unknown setting” \{#omp-config-set-key-says-unknown-setting}

配置键必须与配置结构中的路径完全匹配，不支持简写。应使用 `theme.dark`，而非 `theme`。运行 `omp config list` 查看所有有效的键。
