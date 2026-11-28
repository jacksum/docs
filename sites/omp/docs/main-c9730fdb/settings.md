---
title: "设置"
description: "Oh My Pi 官方仓库文档：设置。"
---

# 设置 \{#settings}

`omp` 从内置默认值、持久化全局配置文件、可选的项目本地配置、单次 CLI 叠加层和内存中的运行时覆盖解析设置。当某个仓库需要不同于全局默认值的提供方集合、模型角色、工具策略、记忆后端或 UI 行为时，可使用项目设置，而不必改动整台机器的配置。

设置存储为普通 YAML 映射。每个键及其类型、默认值和枚举值都来自该设置的定义（通过 `register(...)` 声明在所属功能旁，例如 `packages/coding-agent/src/tools/settings.ts`，并由 `packages/coding-agent/src/config/all-settings.ts` 汇集）。`omp config` 提供完整的配置模式；交互式 `/settings` 面板提供支持 UI 编辑器的条目。部分条目有条件限制；没有 UI 选项的数字和数组仍只能通过配置文件设置，除非该设置选择启用面板的 JSON 编辑器（例如 `contextFiles.extra`）。

- 模型/提供方凭据、`.env` 文件，以及用于解析 API key 的环境变量表，参见[提供方](./providers.md)。
- `models.yml` 中的自定义模型定义，参见[模型](./models.md)。
- 发现后纳入智能体上下文的指令文件（`AGENTS.md`、`.omp/` 等），参见[上下文文件](./context-files.md)。
- 完整的环境变量目录，参见[环境变量](./environment-variables.md)。
- 激活专门的逐轮行为的提示词词语，参见[魔法关键词](./magic-keywords.md)。

## 设置存储位置 \{#where-settings-live}

| 作用域 | 路径 | 读取行为 | 写入行为 |
| --- | --- | --- | --- |
| 全局 | `~/.omp/agent/config.yml`（或已有的 `config.yaml`） | 主要的持久化设置文件。`config.yml` 是规范写入目标；已有的 `config.yaml` 会被加载并原地更新。 | `/settings`、`omp config set` 和 `omp config reset` 写入此处。 |
| 旧版全局 | `~/.omp/agent/settings.json` | 仅在两个主要 YAML 文件名均不存在时才考虑迁移。 | 不写入；非空迁移 YAML 文件成功保存后，重命名为 `settings.json.bak`。 |
| 项目 | `<cwd>/.omp/config.yml`（以及 `.omp/settings.json`） | 进程工作目录下存在非空 `.omp/` 时加载。 | 设置命令不会写入任意项目键。设置 `modelRoleStorage: project` 时，模型选择器的角色分配仅更新此处的 `modelRoles`；其他键需手动编辑。 |
| 旧版项目 | `<cwd>/.omp/settings.json` | 仍会读取；项目 `config.yml` 在其上合并。 | 设置命令不写入。 |
| CLI 叠加层 | 通过 `--config <file>` 传入的任意文件 | 在全局和项目设置之后加载，仅用于该进程。可重复指定。 | 绝不持久化。 |
| 运行时覆盖 | 仅在内存中 | 由 `--approval-mode`、角色标志和功能环境变量等设置覆盖项设定。 | 绝不持久化。 |

上述全局路径描述的是默认配置档案。`omp --profile work` 改为选择 `~/.omp/profiles/work/agent`，隔离设置、认证、会话和缓存。`OMP_PROFILE` 也可选择配置档案；仅在没有 `OMP_PROFILE` 时，`PI_PROFILE` 才作为兼容性回退。显式 `--profile` 优先于两者，`--profile default` 选择默认配置档案。

`PI_CODING_AGENT_DIR` 会迁移默认配置档案的智能体目录位置，包括 `config.yml` 及其智能体数据。具名配置档案派生自己的智能体目录，并忽略此覆盖。使用 `omp config path`（或 `omp --profile work config path`）打印活动设置目录。

在 Linux 和 macOS 上，如果对应的 `omp` 目录存在，已配置的 `XDG_DATA_HOME`、`XDG_STATE_HOME` 和 `XDG_CACHE_HOME` 可以重定向数据/状态/缓存。具名配置档案要求存在对应的 `omp/profiles/<name>` 目录。这不会移动 `config.yml`：它仍留在活动智能体目录下，而 `agent.db` 和其他分类数据可能位于别处。`omp config init-xdg` 创建基础目录，但不会迁移文件或设置环境变量。

原生项目设置有意限定于进程工作目录的 `.omp/` 文件夹，设置发现**不会**向上遍历祖先目录来寻找最近的 `.omp/`。其他工具的设置文件（例如 `.claude/settings.json`）不会合并到 `omp` 设置中。

## 配置文件格式 \{#config-file-formats}

规范的全局文件是 `config.yml` 中的 YAML；`config.yaml` 是可接受的兼容文件名。用于其他文件（例如 `models.yml`）的通用配置加载器接受 `.yml`、`.yaml`、`.json` 和 `.jsonc`：

- 请求 `.yml`/`.yaml` 路径但仅存在同目录同名 `.json` 时，会自动迁移为 YAML（幂等，每个进程一次）。
- `.json` 和 `.jsonc` 配置按原样读取，不进行迁移。
- 空 YAML（或 YAML `null`）视为空设置映射。其他非映射顶层值无效。在可写启动时，`omp` 会将语法无效或非映射的持久化设置文件移动为名称唯一的 `.broken-*` 备份，并带着原始错误和备份路径退出。包含裸数组/标量的 `--config` 叠加层也是硬错误，但不会被移动。
- 普通配置模式条目的无效值会产生警告，读取时使用其配置模式默认值。带有显式验证器的设置，例如逐智能体上下文压缩触发值或提供方并发限制，可能会直接拒绝配置。手写文件中的未知键不能代替已注册设置。

## 读取与写入设置 \{#reading-and-writing-settings}

在会话内使用交互式 `/settings` 面板，或在 shell 中使用 `omp config` 命令。CLI 读取包括设置环境变量在内的有效值。面板显示并编辑合并后的设置层值，而非环境提供的值；描述会注明活动的环境覆盖，因此环境凭据绝不会被预填或持久化。普通持久化写入落在**全局**文件中；`modelRoleStorage: project` 时，模型选择器角色更改是例外（参见[写入位置](#where-writes-go)）。

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

若希望正常启动时也显示完整的首次运行动画，可设置 `startup.showSplash`：

```bash
omp config set startup.showSplash true
```

这仅控制启动闪屏动画。它不会重新运行设置流程或改变设置状态，`startup.quiet: true` 仍会抑制包括闪屏在内的所有启动界面元素。

### 子命令 \{#subcommands}

| 命令 | 效果 |
| --- | --- |
| `omp config list` | 打印每个设置，按选项卡分组，附带当前值和类型。`--json` 输出以设置路径为键的对象，值为 `{ value, type, description }`。已配置的凭据字段在可读输出中遮蔽为 `********`；JSON 中则省略其 `value` 并输出 `redacted: true`。使用 `--scope global` 或 `--scope project` 时，仅列出该层（`config.yml`，或当前目录的项目设置文件）设定的键，值保持该层存储时的形式：路径作用域数组（`enabledModels`、`disabledProviders`）保留其 `{ path, … }` 条目，不针对当前目录解析，`--json` 则为每个键输出 `{ value, type, description }`。不查询默认值、其他层或环境变量。 |
| `omp config get <key>` | 打印一个键的有效值。未知键以非零状态退出。`--json` 输出 `{ key, value, type, description }`。这是显式的单键请求，因此凭据值不经遮蔽直接返回。 |
| `omp config set <key> <value>` | 按键的配置模式类型解析 `<value>`，将其写入全局主要 YAML 文件，并打印写入值。如果仍由其他来源提供有效值，则会说明具体来源（`--json`：`overriddenBy` 为环境变量名，或 `project`、`overlay`、`runtime`；`fallbackEnv` 指出保存值为空白时使用的回退环境变量）。 |
| `omp config reset <key>` | 删除全局键，使其他已配置层或配置模式默认值生效。打印得到的有效值，将非空凭据遮蔽为 `********`；JSON 省略凭据的 `value` 并输出 `{ key, redacted: true }`。 |
| `omp config path` | 打印活动智能体目录（遵循 `PI_CODING_AGENT_DIR`）。 |
| `omp config init-xdg` | 在 Linux 和 macOS 上，在有效的 XDG 数据、状态和缓存主目录下创建 `omp` 目录。它不会移动已有文件或设置 XDG 环境变量。其他平台以非零状态退出。 |

不带子命令的 `omp config` 列出设置。`--help` 或 `-h` 显示命令帮助。`list`、`get`、`set` 和 `reset` 接受 `--json` 标志。仅 `list` 接受 `--scope`。

### 值解析 \{#value-parsing}

`omp config set` 根据目标键的配置模式类型解析值字符串。首先去掉字符串首尾空白。

| 类型 | 接受的输入 | 说明 |
| --- | --- | --- |
| 布尔值 | `true`、`false`、`yes`、`no`、`on`、`off`、`1`、`0` | 不区分大小写。其他内容均被拒绝。 |
| 数字 | 任何有限的 JavaScript 数字 | 拒绝 `Infinity`/`NaN`。 |
| 枚举 | 键允许值之一，可为裸值或 JSON 引号包裹形式 | 必须精确匹配；错误会列出有效值。 |
| 数组 | JSON 数组 | 例如 `'["anthropic","openai"]'`。必须能解析且为数组。 |
| 记录 | JSON 对象 | 例如 `'{"bash":"prompt"}'`。必须能解析且为非数组对象。 |
| 字符串 | 裸文本或 JSON 引号包裹的字符串 | 裸文本去掉首尾空白；JSON 字符串内容会被解码。多词参数以空格连接。 |

键必须精确匹配真实的配置模式路径。没有简写，应设置 `theme.dark`，而非 `theme`。

解析后仍会应用设置特定的规范化和验证。例如，提供方并发限制必须为正数，并向下取整为请求数。

### 写入位置 \{#where-writes-go}

`omp config set`、`omp config reset`、`/settings` 和持久化运行时设置更改会写入活动智能体目录下的全局主要 YAML 文件。仅运行时覆盖不会保存。设置命令不会向 `<cwd>/.omp/config.yml` 写入任意键。`modelRoleStorage: project` 下的模型角色分配或清除，仅更新其中受影响的角色；缺少的项目角色回退到全局角色。若要创建其他项目本地覆盖，请直接编辑项目文件（参见[项目本地配置](#project-local-config)）。

保存经过防抖处理，并在锁内重新读取文件。互不重叠的外部编辑会保留。如果外部写入方在本地更改暂存后修改了同一全局设置或模型角色，则会跳过过期的本地更改并发出警告，而不是覆盖文件中更新的值。

通过符号链接形式的主配置保存时，会保留链接并更新其解析后的目标。包含 `.` 或 `..` 的目标遵循操作系统规则：Windows 在跟随中间链接前折叠这些路径段，而 POSIX 会逐个遍历磁盘上的路径组件。因此，`alias/../config.yml` 这样的目标在两个平台上可能指向不同文件。

### 实时文件更改 \{#live-file-changes}

交互式会话和 RPC/RPC-UI 宿主会监视主要全局文件、项目设置来源和配置叠加层。短暂防抖后重新加载更改，并保留运行时覆盖。解析或验证失败的层会保留其最后一次有效值，并记录警告；其他有效层仍可刷新。实时重新加载不会将无效文件移至 `.broken-*` 备份。

符号链接配置会跟踪其目标的编辑，以及任意中间文件或目录符号链接的替换，包括配置档案链接。链接切换目标后，也会监视对新目标的后续编辑。

重新加载会改变使用方可用的设置值；仅启动时执行的工作不会重跑。提供方来源切换在下一次发现时生效。Task/eval 派发在解析子代理策略前也会重新加载持久化设置。

对 `modelRoles`、`retry.fallbackChains` 和 `task.agentModelOverrides` 的路由更改，无须重启宿主就会应用于后续子代理启动和回退决策。`auth.accountPolicies` 和 `retry.usageReservePct` 也会更新长期存活的账户路由器，用于后续凭据选择和配额检查。重新加载不会重启运行中的子代理，也不会切换健康活动会话的模型；显式运行时覆盖仍优先。

## 优先级 \{#precedence}

从最低到最高优先级，设置的有效值按以下方式构建：

```text
built-in defaults  <-  global config  <-  project config  <-  CLI overlays  <-  setting env var  <-  runtime overrides
```

从最高到最低：

1. **运行时覆盖**，在内存中为当前进程应用的设置，包括 `--smol`、`--slow`、`--plan`、`--preset`、`--approval-mode`、`--auto-approve`/`--yolo`、`--hide-thinking`、`--advisor`、`--external-thinking`、`--motion`、`--spinner-interval`、`--max-fps`、仅会话设置写入、SDK `overrides` 和协议模式默认值。绝不持久化。标志优先于设置的环境变量，因此 `PI_MOTION=none omp --motion full` 会以完整动效运行。其他单次选项，例如 `--model`、`--thinking`、`--service-tier`、`--no-lsp`、`--no-pty` 和 `--api-key`，影响的是会话/模型/传输选项，并非全都是注册表设置。协议模式默认值（RPC/ACP）仅在没有其他来源配置该设置时维持，环境变量也算其他来源：设置写入或重置、重新加载发现的 `config.yml` 或项目编辑，或 ACP 会话自身的项目配置都会替代它们。
2. **设置环境变量**，在设置定义上声明的环境变量（例如 `eval.py` 的 `PI_PY`、`auth.broker.url` 的 `OMP_AUTH_BROKER_URL`）。除非声明了自定义解析器，否则按设置类型解析；无法解析的文本（例如 `PI_EDIT_VARIANT=auto`）视为未设置。布尔值遵循 `parseFlag` 约定：空值视为未设置，`1`/`y`/`true`/`yes`/`on`（全小写或全大写）表示 true，其他任何值表示 false。少数变量被声明为回退（`SEARXNG_*`、`MNEMOPI_EMBEDDING_MODEL`）：它们仅替代内置默认值，因此任何已配置层都优先于它们，但配置的 `null` 除外，它视为未设置。设置为空白字符串时，`SEARXNG_ENDPOINT`、`SEARXNG_TOKEN` 和 `MNEMOPI_EMBEDDING_MODEL` 也会生效。
3. **CLI 配置叠加层**，每个 `--config <file>`；后面的叠加层文件覆盖前面的。
4. **项目设置**，先 `<cwd>/.omp/settings.json`，再 `<cwd>/.omp/config.yml`（以及其他发现提供方在项目级别提供的内容）。
5. **全局设置**，活动智能体/配置档案目录中的 `config.yml`（或已有的 `config.yaml`）。
6. **内置默认值**，来自设置定义。

所有层均未设置的键，会在读取时解析为其默认值。

### 环境覆盖 \{#environment-overrides}

环境变量绝不会写回 `config.yml`。在设置定义上声明的变量，构成上文所述紧低于运行时覆盖的一层；其他变量由拥有该值的功能直接读取（`PI_NO_PTY`），或作为运行时覆盖应用（`PI_SMOL_MODEL` 为进程设置 `smol` 模型角色）。相关设置覆盖与配置选择器：

| 环境变量 | 覆盖的设置 | 说明 |
| --- | --- | --- |
| `PI_SMOL_MODEL` | `modelRoles.smol` | 也可通过 `--smol` 使用。 |
| `PI_SLOW_MODEL` | `modelRoles.slow` | 也可通过 `--slow` 使用。 |
| `PI_PLAN_MODEL` | `modelRoles.plan` | 也可通过 `--plan` 使用。 |
| `PI_NO_PTY=1` | （禁用 PTY bash） | 对该进程等效于 `--no-pty`。 |
| `PI_PY` | `eval.py` | `PI_PY=0` 禁用 Python eval 后端。 |
| `PI_JS` | `eval.js` | `PI_JS=0` 禁用 JavaScript eval 后端。 |
| `PI_TINY_DEVICE` | `providers.tinyModelDevice` | 本地微型模型的 ONNX 执行提供方或 `mlx` 后端。 |
| `PI_TINY_DTYPE` | `providers.tinyModelDtype` | 本地微型模型的 ONNX 精度。 |
| `OMP_AUTH_BROKER_URL` | `auth.broker.url` | 环境值优先于配置。 |
| `OMP_AUTH_BROKER_TOKEN` | `auth.broker.token` | 环境值优先于配置。 |
| `OMP_AUTH_ENCRYPT` | `auth.encrypt` | `1` 加密新凭据，`0` 以未加密形式存储并解密已存储凭据；未设置则保留存储的模式。 |
| `PI_CODING_AGENT_DIR` | （重新定位默认配置档案的智能体目录） | 具名配置档案忽略此覆盖。 |
| `OMP_PROFILE` / `PI_PROFILE` | （选择配置档案） | 存在 `OMP_PROFILE` 时以它为准；`--profile` 优先于环境变量。 |
| `PI_EDIT_VARIANT` | `edit.mode` | `apply_patch`、`hashline`、`patch`、`replace`、`sloppy`、`magic` 或 `none`；`auto` 视为未设置。 |
| `PI_EDIT_FUZZY` | `edit.fuzzyMatch` | 精确的小写 `1`/`true` 启用；`0`/`false` 禁用；其他文本交由配置决定。 |
| `PI_EDIT_FUZZY_THRESHOLD` | `edit.fuzzyThreshold` | 解析为 0-1 的浮点阈值；无效/超出范围的值视为未设置。 |
| `PI_INTENT_TRACING` | `tools.intentTracing` | 使用布尔环境变量解析器。 |
| `PI_AUTO_QA` | `dev.autoqa` | 启用/禁用自动工具问题报告，受已保存的同意状态约束。 |
| `PI_NO_THINKING_LOOP_GUARD` | `model.loopGuard.enabled` | 只有 `1` 会禁用；其他值不覆盖设置。 |
| `SEARXNG_ENDPOINT` / `SEARXNG_TOKEN` | `searxng.endpoint` / `searxng.token` | 设置缺失、为 null 或空白时的回退。 |
| `SEARXNG_BASIC_USERNAME` / `SEARXNG_BASIC_PASSWORD` | `searxng.basicUsername` / `searxng.basicPassword` | 仅在缺失或为 null 时回退；配置的空字符串仍为有效凭据。 |
| `MNEMOPI_EMBEDDING_MODEL` | `mnemopi.embeddingModel` | 缺失、为 null 或空白时的回退。 |
| `PI_CONFIG_FILES` | CLI 配置叠加层 | 平台路径列表（Unix 用 `:`，Windows 用 `;`）；文件按顺序在 `--config` 叠加层之前加载。 |

提供方 API key 单独解析（已存储的认证、OAuth、`models.yml`、环境变量和 `.env` 文件）；参见[提供方](./providers.md)和完整的[环境变量](./environment-variables.md)参考。

## 合并规则 \{#merge-rules}

各层通过深度合并组合：

- **对象深度合并**，仅存在于较低层的键会保留；较高层存在的键会覆盖。
- **标量和大多数数组由较高优先级层整体替换**。配置了 `merge: "prepend"` 的规则列表数组（`bash.patterns` 和 `bashInterceptor.patterns`）是例外：项目和 `--config` 叠加层条目会添加在全局条目之前（全局层未设置列表时，则添加在配置模式默认值之前），而配置的 `null` 或空 `[]` 会重置列表，运行时覆盖仍会整体替换列表。
- **配置的 `null` 在读取时视为未设置**，因此应用配置模式默认值（或回退环境变量），而非较低层的值。项目 `modelRoles` 条目是例外：已清除/null 的项目角色回退到全局角色。
- **具名模型预设整体解析**，不会跨层深度合并。同名的项目预设替换全局预设。运行时/叠加层中的 `null` 条目可以隐藏较低层预设。

对于点分设置路径，使用嵌套 YAML 映射：

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

### Bash 命令批准模式 \{#bash-command-approval-patterns}

`tools.approval` 是以工具名为键的记录；`tools.approval.eval` 和 `tools.approval.computer` 这样的点分形式标识该记录中的条目，而非独立的设置 id。每个条目设置该工具的默认策略。有一个条目不是工具：字面键 `computer.control`（`tools.approval["computer.control"]`，在 YAML 中写为 `computer.control: allow`，绝不嵌套在 `computer` 下）响应 `computer` 工具的前台控制请求；参见[计算机使用](./computer-use.md#menus-held-input-and-task-control)。对于 bash，可以通过 `bash.patterns` 添加有序命令规则；第一个匹配的规则优先。模式支持字面文本和作为通配符的 `*`。空白是例外：匹配前，模式与命令中的每段连续空格、制表符或换行都会折叠为单个空格，并去掉首尾空白。因此，模式中的换行会匹配任意空白：`match: "*\n*"` 的行为与 `"* *"` 一样，匹配所有包含空格的命令。要捕获以换行分隔列表中的危险命令，无须专门的换行规则：`deny` 和 `prompt` 规则会检查每个片段（见下文）。`allow` 规则拒绝未加引号的换行命令分隔符，但当完整命令匹配时，可以批准包含引号包裹或转义的字面换行的命令。

项目（`.omp/config.yml`）和 `--config` 叠加层的 `bash.patterns` 条目会**前置**于全局 `~/.omp/agent/config.yml` 规则，而非替换它们，因此可以在本地声明仓库专用的构建或 lint 许可，无须复制全局规则。

开头的 `KEY=VALUE` 环境赋值不会匹配 `allow` 规则，除非模式显式包含它们，或变量名精确匹配 `bash.allowedEnvVars`（或逐规则 `env` 列表）中的条目；条目是字面名称，不是通配符：

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

由于仅含名称的允许列表允许该变量的任意值，因此只应列入无害的构建/测试变量；绝不要列入控制执行的变量（`PATH`、`LD_PRELOAD`、`DYLD_INSERT_LIBRARIES`、`BASH_ENV`、`GIT_SSH_COMMAND`、`GOFLAGS`、`RUSTC_WRAPPER`、`CARGO_TARGET_<triple>_RUNNER`，以及类似的 `*_RUNNER`/`*_WRAPPER` 名称），否则命令可以运行任意代码。`deny` 和 `prompt` 规则始终同时检查保留与移除开头裸 `KEY=VALUE` 赋值后的片段，因此 `FOO=1 rm -rf build` 无法绕过 `match: "rm -rf *"` 限制。命令包装器不会被剥离：`env FOO=1 rm -rf build` 或 `nice rm -rf build` 不以 `rm` 开头，因此不匹配该规则。

默认情况下，`allow` 规则必须匹配整个命令，且不能批准复合命令行。设置 `bash.allowCompoundCommands: true` 后，还会对仅由 `&&` 连接的两个或更多字面命令组成的保守命令链求值：
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

使用此配置时，`cmp tmp/result.json artifacts/result.json && rm -f tmp/result.json` 可以无须提示就运行。OMP 会对每个原始片段独立解析有序规则：`rm` 被显式允许，而未匹配的 `cmp` 片段继承普通的独立 bash 策略。当任何片段未匹配时，命令保留 `exec` 层级且没有显式策略，因此通用解析器会先应用 `tools.approval.bash`，再应用活动批准模式。所以，未匹配片段仅在该工具级策略或模式要求时才提示。

显式限制在整条链上保守组合：解析到的 `deny` 优先，否则解析到的 `prompt` 优先。匹配完整链但不匹配任何单个片段的 `deny` 或 `prompt` 规则，仍作为整链限制（例如 `cmp * && rm *`）。所有匹配的整链限制都会纳入考虑：较后的整链 `deny` 覆盖较前的整链 `prompt`。其他情况下，片段规则保留首个匹配优先的顺序：对 `git status && git status` 求值时，较前的 `git status` allow 不会被较后的 `git *` deny 覆盖。

因此，如果较前的窄范围片段 allow 排在宽泛的兜底 deny 前面，启用此设置可能允许原本被默认策略拒绝的复合命令。必须始终生效的片段 deny 应放在与其重叠的 allow 之前。

此选择启用功能仅接受使用字面参数（包括加引号的字面参数）的扁平 `&&` 链。它拒绝展开、变量赋值、其他控制流、重定向、glob 匹配、换行、格式错误语法，以及 `cd`、`source` 和 `eval` 等改变 shell 状态的命令。被拒绝的形式保留旧版批准行为；启用此设置绝不会扩大 `allow` 模式可批准的非链命令范围。显式整链和片段限制先于现有的原始与规范化关键命令检查解析，后者仍会检查整个命令和每个片段，因此宽泛的 allow 无法隐藏后续的关键片段。

此选择启用功能要求明确识别为采用 POSIX 引号规则的 shell：`sh`、`bash`、`dash`、`ash`、`ksh` 或 `zsh`，包括它们的 `.exe` 名称。集中式分类器会针对 Windows 和 POSIX 路径检查可执行文件的基本名称。其他 shell，包括 cmd、PowerShell、fish 和未知包装器，保留旧版批准行为。它们的引号规则可能不同于识别器：fish 将单引号内的 `\'` 视为转义引号，而 POSIX shell 不会。

有效的规则批准值是 `allow`、`prompt` 和 `deny`。无论是否启用此功能，`deny` 和 `prompt` 规则都可以匹配整个命令，或其他复合形式中分词后的片段（按 `&&`、`||`、`;`、`|`、单个 `&`、子 shell 和换行拆分），对每个片段按首个匹配的限制规则解析，再跨片段组合限制，因此任何 `deny` 都会覆盖 `prompt`。这让 `match: "rm -rf *"` 可以拒绝 `cd /tmp && rm -rf build`、`sleep 1 & rm -rf build` 和 `curl http://example.com; rm -rf build`，即使列表较前面已将 `curl *` 配置为 `prompt`。

项目设置可以收紧 `bash.patterns`，但绝不能放宽它们：即使项目的 `bash.patterns` 允许命令，操作者各层（全局配置、`--config` 叠加层和运行时覆盖）中的 `deny` 和 `prompt` 规则仍会应用，因为仓库设置文件可由智能体写入。

`bash.patterns` 是批准策略，而非隔离机制。获准程序仍拥有 bash 进程的文件系统、网络和子进程访问权限，看似范围狭窄的程序也可能通过自身选项或配置执行更广泛的操作。这些规则仅管控 `bash` 工具；不涵盖通过 `eval` 启动的 shell。要关闭此路径，还需添加 `tools.approval.eval` 策略（`prompt` 或 `deny`）；参见[工具批准模式](./approval-mode.md)。

### Bash 拦截器模式 \{#bash-interceptor-patterns}

`bashInterceptor` 独立于 `bash.patterns`：它将 Bash 命令重定向到专用工具，而非定义命令是否可以执行。需显式启用它，并配置正则表达式模式、替代工具和面向模型的消息：

```yaml
bashInterceptor:
   enabled: true
   patterns:
      - pattern: '^\s*(cat|head|tail)\s+'
        tool: read
        message: "Use the read tool instead."
```

具名替代工具必须在当前会话中可用，否则拦截器不会阻止 Bash 调用。权限策略与专用工具路由的详细比较，包括复合命令行为和顺序，参见 [Bash 工具文档](./tools/bash.md#command-policy-and-dedicated-tool-routing)。

### 实例：全局与项目 \{#worked-example-global-vs-project}

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

`<repo>` 内的有效设置：

```yaml
tools:
   approvalMode: write # kept from global (object deep-merge)
   approval:
      bash: allow # overridden by project
      read: allow # kept from global
disabledProviders:
   - groq # project array REPLACES the global array
```

对于非合并列表，数组替换是最常见的意外：项目的 `disabledProviders` 不会扩展全局列表，而会成为该项目的完整列表。`enabledModels`、`cycleOrder`、`extensions` 和除 `bash.patterns`、`bashInterceptor.patterns` 之外的所有数组设置都是如此（这两个设置会把项目条目前置于全局条目）。

## 项目本地配置 \{#project-local-config}

仓库需要自己的设置时，创建 `<repo>/.omp/config.yml`：

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

除非仓库策略允许，否则不要把密钥放入会提交的项目配置。凭据优先使用环境变量、已存储的认证、认证代理或不被跟踪的 `--config` 叠加层。

### 单次叠加层 \{#one-shot-overlays}

对于不应持久化的临时层，使用 `--config`：

```bash
omp --config ./local/ci-settings.yml "check this failure"
omp --config ./base.yml --config ./experiment.yml "try this model"
```

默认启动命令、`acp`、`models` 和 `dry-balance` 接受 `--config`。对于 `models` 和 `dry-balance`，将它放在命令名后（`omp dry-balance --config ./policy.yml`）；放在命令名前会被丢弃。

包装器也可以改为将 `PI_CONFIG_FILES` 设置为使用平台分隔符的路径列表（Unix 用 `:`，Windows 用 `;`）。环境叠加层按列出顺序在显式 `--config` 叠加层之前加载。

叠加层路径相对于进程工作目录解析（并展开 `~`）。每个叠加层都必须解析为 YAML 映射；文件缺失、无效 YAML 或顶层数组/标量都是硬错误，**不会**静默回退到较低优先级设置。

## 路径作用域数组 \{#path-scoped-arrays}

四个数组设置，`enabledModels`、`disabledProviders`、`bash.patterns` 和 `bashInterceptor.patterns`，除无作用域条目外，还接受路径作用域条目，因此单个全局配置可以按目录表现不同，而无须维护独立的 `<repo>/.omp/config.yml` 文件：

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

无作用域条目（模型/提供方列表中的裸字符串，或 `bash.patterns` 和 `bashInterceptor.patterns` 中的直接规则对象）适用于所有位置。当当前工作目录**就是**配置的路径，或**位于其下**时，作用域条目生效。`~` 展开为主目录，相对路径在匹配前解析。

接受的**路径**键（可任意组合）：`path`、`paths`、`pathPrefix`、`pathPrefixes`。

接受的**值**键：

- `models`（用于 `enabledModels`）、`providers`（用于 `disabledProviders`）或 `patterns`（用于 `bash.patterns` 和 `bashInterceptor.patterns`）
- `values` 或 `items`（用于任意路径作用域设置）

对于 `bash.patterns` 和 `bashInterceptor.patterns`，带作用域的条目可以在 `patterns` / `values` / `items` 下包装一个规则列表，也可以直接携带规则字段（`{ path, match, approval }`），还可以同时采用这两种形式；在其作用域内，先加入该条目自身的规则，再按顺序加入列表中的规则。列表中的规则本身也可以带路径作用域，从而进一步缩小外层作用域。路径键中不包含任何字符串的条目不具备作用域限制，会在所有位置生效（例如 `path: ~` 会被 YAML 读为 null；若要表示主目录，应将其写为带引号的 `"~"`）。当 `bashInterceptor.patterns` 只包含带路径作用域的条目时，匹配的作用域规则之后仍会应用内置拦截器规则；该列表中只要有一条不带作用域的规则，就会替换内置规则，但项目或 `--config` 叠加层前置加入的规则不会触发这种替换。对于其他设置，格式错误的作用域条目会被忽略。路径作用域在设置层合并**之后**解析，因此读取的是当前工作目录最终生效的数组。

## 禁用模型提供方和发现来源 \{#provider-and-source-disabling}

配置发现永远不会读取其他工具的主目录配置（`~/.claude`、`~/.codex`、`~/.config/opencode` 等），只加载它们的项目级文件。原生 OMP 和 `.agents` 根目录默认加载，包括原生插件市场中的插件。此前通过旧 `enabledProviders` 设置启用这些用户级来源的用户，会在首次交互式启动时看到一次性迁移对话框，将原先继承的内容复制或以符号链接的形式放入 `~/.omp/agent`。

`disabledProviders` 使用一个共享的 ID 命名空间，在检查凭据之前控制两个不同的子系统：

| 条目类型 | ID 示例 | 效果 |
| --- | --- | --- |
| 模型提供方 | `anthropic`、`openai`、`google`、`groq`、`ollama`、`openrouter` | 从模型选择中移除这些后端，即使已有可用凭据也不例外。参见[模型提供方](./providers.md)。 |
| 发现来源 | `native`、`claude`、`codex`、`opencode`、`agents`、`agents-md` | 阻止该来源提供上下文文件、MCP 服务器、命令、技能、钩子、工具、提示词或设置。参见[上下文文件](./context-files.md)。 |

大多数提供方控制场景列出的是模型提供方 ID。禁用 `claude` 发现来源与禁用 `anthropic` 模型提供方不同：前者停止发现 Claude 格式的配置，后者停止使用 Anthropic 模型后端。

由于数组会整体替换而不是追加，设置了 `disabledProviders` 的项目必须列出完整的目标集合：

```yaml
# ~/.omp/agent/config.yml
disabledProviders:
   - anthropic
   - openai

# <repo>/.omp/config.yml — inside this repo ONLY groq is disabled
disabledProviders:
   - groq
```

默认值为空数组（不禁用任何项）。两个子系统的提供方 ID 和顺序，参见[模型提供方](./providers.md)和[上下文文件](./context-files.md)。

原生项目的 `modelRoles` 还会直接从 `.omp/config.yml` 读取；禁用 `native` 发现提供程序不会屏蔽这一模型角色设置层。

### 暂停的提供方 \{#paused-providers}

某些提供方因使用时可能危及账户，而在认证规则中被暂停。暂停的提供方不提供登录，拒绝刷新令牌和发送请求，并忽略已存储的凭据及环境变量中的凭据。`auth.unpausedProviders` 会重新启用列出的提供方，表示接受暂停原因所指出的风险；已存储的登录状态会按原样恢复。只有全局配置、`--config` 文件和运行时覆盖项会生效，项目的 `.omp/config.yml` 无法解除提供方的暂停状态。在 `/settings` 的 **Unpaused Providers** 中选择，或在 `~/.omp/agent/config.yml` 中配置：

```yaml
auth:
   unpausedProviders:
      - <provider-id>
```

修改会立即作用于正在运行的会话：下一次查找时即可重新使用已存储的凭据，刚解除暂停的提供方也会像登录后一样刷新模型列表。使用认证代理时，也必须在代理主机上设置（`omp auth-broker serve` 会在启动时读取）：代理会在客户端看到凭据之前，丢弃暂停提供方的凭据。

## 会话恢复选择器的作用域 \{#resume-picker-scope}

默认情况下，`omp --resume` 和 `/resume` 会在当前文件夹列表中包含本仓库其他工作树中的会话。若要隔离长期使用的工作区，请运行 `omp config set session.worktreeScope directory`（或在 `/settings` 中选择 **Resume Worktree Scope**）。设为 `repo` 可恢复默认行为。所有项目选项卡仍会显示各目录中的会话，包括已删除工作树中的会话；此设置仅缩小当前文件夹列表的范围。

## 子仓库发现 \{#child-repository-discovery}

在任何仓库之外启动会话，且恰好只有一个直接子目录是 Git 检出目录时，`omp` 会将该检出目录作为当前活动仓库：状态栏显示 `cwd ↳ child`，Git 分支、状态和 PR 查询都在该目录进行，系统提示词和顾问也会获知这一情况。运行 `omp config set git.childRepoDiscovery false`（或在 `/settings` 中关闭 **Discover Child Repository**）可跳过扫描：不探测子目录，会话保留自己的 cwd。在检出目录、其子目录或关联工作树中启动的会话，无论此设置如何，都继续使用正常的 Git 检测。显式执行未指定目标的 `/review` 时，仍会列出子检出目录供选择。

## 设置目录 \{#settings-catalog}

以下目录重点列出常用设置，不是完整的配置模式。`omp config list` 是所有键、当前值、类型及说明的权威参考。这里展示的默认值和枚举值均来自配置模式。接受环境变量或选项覆盖的设置会加以注明；这些覆盖项只对当前进程生效，不会持久化。

### 模型 \{#models}

`modelRoles` 为每种工作负载指定主要选择器。`retry.fallbackChains` 提供其有序回退项；不要将提供方或后端选择混入特定服务的设置。聊天选择器可以带思考后缀（`:off`、`:minimal`、`:low`、`:medium`、`:high`、`:xhigh`、`:max`、`:auto` 或 `:inherit`）。非聊天运行器不使用聊天思考预算。角色值还可以包含按顺序排列、以逗号分隔的选择器，或 `@smol` 之类的角色别名；角色的回退链另行配置。

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
   dictation: local/fluid-speech-pro
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

内置聊天角色为 `default`、`smol`、`slow`、`vision`、`plan`、`commit`、`tiny`、`memory`、`task`、`advisor` 和 `widget`。`tiny` 和 `memory` 角色同时接受目录中的 `tiny` 模型与普通聊天模型。`widget` 为每个后台任务的实时小组件编写规格，在尚未分配模型时按 `smol` 的方式解析。内置模型类型角色为 `image`、`web`、`speech`、`dictation` 和 `judge`，分别选择图像、搜索或带来源依据的聊天、TTS、STT 和评判运行器。`judge` 也接受微型模型和聊天模型，因此 `@tiny` 之类的别名可以作为有效回退项。目录中的类型为 `chat`、`tiny`、`image`、`tts`、`stt`、`search` 和 `judge`；未指定 `kind` 的自定义模型仍视为聊天模型。

打开 `/model`，进入 **Roles** 视图以分配角色和编辑其回退行。聊天角色与模型类型角色显示在不同的能力分区中，选择器会将可分配模型筛选为所选角色接受的模型。也可以直接使用 `omp models --kind chat`、`omp models --kind tiny`、`omp models --kind image`、`omp models --kind tts`、`omp models --kind stt`、`omp models --kind search` 或 `omp models --kind judge` 列出同一目录；使用 `--kind all` 可列出全部内容。

对于某个角色，`modelRoles.<role>` 为主要选择器，`retry.fallbackChains.<role>` 为回退列表。对于模型类型角色，未设置回退链时会使用该角色的内置优先级列表；`[]` 则明确表示**不使用回退**。`retry.fallbackChains.default` 链用于聊天角色或会话回退，永远不会替换模型类型角色自己的回退链。`web/parallel`、`web/perplexity`、`web/exa` 和 `web/firecrawl` 等显式搜索条目，会作为已配置候选项尝试，包括它们支持的匿名模式；若缺少必需的凭据，该显式条目仍会产生可用性错误。

对于一次性搜索，`omp search`、`omp q` 和 `omp web-search` 可以通过 `--model` 接受目录选择器，例如 `omp web-search --model web/duckduckgo "current Bun release"`。会话内的 `web_search` 工具不提供逐次调用的模型覆盖选项，而是遵循 `modelRoles.web` 和 `retry.fallbackChains.web`。

图像选择同样使用完整的目录模型选择器，而不是提供方名称：可以设置 `modelRoles.image`、其回退链，或 `generate_image` 请求中可选的 `model`。OpenRouter 图像模型通过 OpenRouter 原生图像 API 运行。

已有配置会在加载时自动迁移。`providers` 下已停用的后端选择器（`webSearch`、`webSearchOrder`、`webSearchExclude`、`webSearchGeminiModel`、`image`、`imageOrder`、`tts`、`judgmentProvider`、`autoThinkingModel`、`unexpectedStopModel`、`tinyModel` 和 `memoryModel`）会在适用时转换为 `modelRoles` 和 `retry.fallbackChains`，随后删除。已停用的 `tts.localModel` 键会被删除（Phonon 31M 是标准的本地 TTS 模型）；`tts.localVoice` / `speech.voice` 中的旧 Kokoro 音色 ID，以及 `modelRoles.speech` 中的 `local/kokoro`，会迁移为对应的 Phonon 项；`stt.modelName` 的值会先迁移为标准的 `modelRoles.dictation` 选择器，再删除该键。其他服务控制项，包括设备、数据类型、音色、超时和 `live.*` 行为，仍是普通设置。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `modelRoles` | record | `{}` | 从角色名映射到主要选择器或有序主要候选项。可以通过角色分配、`modelTags` 或 `cycleOrder` 引入自定义聊天角色。`--smol`/`--slow`/`--plan` 及相应的 `PI_*_MODEL` 变量可为单次运行覆盖这些角色；`--model` 选择当前聊天模型。 |
| `modelRoleStorage` | enum | `global` | `global` 将模型选择器的角色分配保存到当前活动的全局配置或配置档案中；`project` 只将这些角色分配保存到 `<cwd>/.omp/config.yml`。缺失的项目角色回退到全局角色。 |
| `modelPresets` | record | `{}` | 命名模型预设，每项为 `{ modelRoles, defaultThinkingLevel }`。由 `/modelpreset save` 和 `/models` 的 Roles 视图（`s`）写入；通过 `/modelpreset switch` 应用。保存时只将指定名称的条目写入全局配置；项目定义的预设可以列出和应用，但永远不会复制到全局配置。参见[模型预设](./models.md#model-presets)。 |
| `modelTags` | record | `{}` | 自定义角色或标签元数据；可以引入额外的聊天角色。 |
| `modelProviderOrder` | array | `[]` | 模型 ID 存在歧义时，优先采用的提供方顺序。 |
| `cycleOrder` | array | `["smol","default","slow"]` | 模型切换器循环切换的聊天角色。 |
| `enabledModels` | array | `[]` | 模型允许列表；支持[路径作用域条目](#path-scoped-arrays)。为空表示所有可用模型。 |
| `disabledProviders` | array | `[]` | 禁用的模型提供方或发现提供程序；支持[路径作用域条目](#path-scoped-arrays)。参见[上文](#provider-and-source-disabling)。 |
| `includeModelInPrompt` | boolean | `true` | 在系统提示词中包含当前模型名称。 |

`models.yml` 的配置模式和自定义提供方定义，参见[模型](./models.md)。

### 评判 \{#judgments}

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `judgment.attemptTimeoutMs` | number | `3000` | 单个原生评判候选项可使用的毫秒数，必须为正整数；当 `retry.fallbackChains.judge` 中仍有其他条目可尝试时生效，包括凭据、请求头、重试及响应正文读取。排除本地图像准备时间；基于提示词和设备端的评判不变。 |

该截止时间仅在配置了评判回退时生效：超时的候选项会被取消，随后尝试下一个已配置的回退项，并在同一会话和模型注册表中跳过其路由30秒（没有会话 ID 的评判维护各自的冷却状态）。超时绝不会将评判交给你未配置的模型，例如内置默认模型或会话模型；未配置回退时，耗时较长的原生评判会一直运行到完成。调用方自身发出的取消总是会结束评判，不触发故障转移。

默认3秒会在 `find` 的20秒预算内，为第二、第三个候选项留下尝试时间。缓慢但正常的候选项也可能超时并转向下一项；冷却不会将其从链中移除。对于持续较慢的评判，可用 `omp config set judgment.attemptTimeoutMs 10000` 提高预算。提高该设置不会延长外层工具或调用方的截止时间。

与上述截止时间无关，如果某个评判候选项的路由拒绝账户（`401`、`402`、`403`）、不提供该模型（`404`），或网关返回 `502` 且错误类型或代码为 `upstream_credentials_exhausted`（该模型的所有上游密钥均已失败），则使用同一模型注册表的所有评判都会跳过该候选项5分钟。这种网关 `502` 只发送一次，不会重试；其他 `5xx` 响应仍视为临时错误并重试。

### 顾问 \{#advisor}

顾问按可配置的频率审阅主轮次，并可以注入建议。使用 `advisor.enabled`、`/advisor on` 或 `--advisor` 启用。对于默认的单个顾问，由 `modelRoles.advisor` 选择模型；未设置时，解析过程会使用已配置的 `slow` 角色或内置慢模型优先级。显式指定的顾问模型不可用时，不会静默选择其他模型。

`WATCHDOG.yml`（或 `WATCHDOG.yaml`）可以定义一组命名顾问，各自具有独立的模型、工具、指令、笔记预算、审阅频率和追赶策略。该配置模式、共享的 `WATCHDOG.md` 指令、频率控制和追赶语义，参见[顾问配置](./advisor-watchdog.md)。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `advisor.enabled` | boolean | `false` | 当 `modelRoles.advisor` 解析为可用模型时，启用顾问运行时。 |
| `task.agentAdvisor` | record | `{}` | 按智能体配置的子代理顾问：智能体名称 → `"on"` / `"off"` / 顾问模型匹配模式。覆盖智能体 frontmatter 中的 `advisor`；从 `/agents` 中心配置。 |
| `advisor.syncBacklog` | enum | `off` | 默认追赶策略。`off` 永远不等待；`1`、`3` 或 `5` 在相应积压阈值处最多等待30秒；`strict` 等待预定审阅，不设墙钟时间上限。中止、失败、配额暂停、状态转换和释放资源都会解除等待。`WATCHDOG.yml` 中可选的逐顾问 `syncBacklog` 覆盖此策略；省略时继承该策略。 |
| `advisor.immuneTurns` | number | `3` | concern 或 blocker 中断之后，在这么多个主轮次内，将后续 concern 作为不打断执行的旁注传递，包括工具循环中的继续执行。blocker 仍不受此限制。 |
| `advisor.continueSeverity` | enum | `concern` | 智能体完成最终回答后，能将其唤醒的最低笔记严重程度（`nit`、`concern`、`blocker`）。较低严重程度的笔记会保留为会话记录末尾的卡片，并在你的下一条消息到来时传给智能体。对所有顾问实时生效。 |
| `advisor.reviewMode` | enum | `turn` | 没有 `WATCHDOG.yml` 顾问列表时的默认审阅频率：审阅每个主轮次，或仅在最终交出执行权时通过 `agent-end` 审阅。列表中的条目可设置各自的 `reviewMode`（默认为 `turn`）。实时生效。 |
| `advisor.reviewInterval` | number | `1` | 仅适用于默认顾问：每隔 N 次符合条件的更新审阅一次。跳过的更新随下一次预定审阅一起发送；待交付建议的传递永远不依赖审阅频率。实时生效。 |
| `advisor.maxNotesPerUpdate` | number | `4` | 每次顾问审阅接受的非 blocker 笔记数量，范围为1-32。较高严重程度的笔记只能替换同一次审阅中仍待处理的笔记。`WATCHDOG.yml` 的顶层值或逐顾问值可覆盖此默认值。 |
| `advisor.evictStaleResults` | boolean | `true` | 每次审阅前，将顾问较早审阅中的 `read`/`grep`/`glob` 输出替换为简短占位内容。保留最近一次审阅。 |

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

`thinkingBudgets.<level>` 为接受推理令牌预算的传输方式覆盖所选思考档位的令牌预算，包括 Anthropic、Google/Gemini、Bedrock Claude、GitLab Duo 的 Anthropic 路径、Anthropic 兼容层、认证网关和预算模式下的 `cline-pass`。它不控制基于推理强度的 OpenAI 兼容请求：本地 llama.cpp 和 Ollama 等 `openai-completions` 提供方使用各自的思考或推理强度控制，因此修改这些预算不会影响它们的请求体。对于这些模型，请使用 `defaultThinkingLevel` 或 `--thinking` 选择可用的推理强度档位。

| 键 | 类型 | 默认值 | 取值 |
| --- | --- | --- | --- |
| `defaultThinkingLevel` | enum | `high` | `minimal`、`low`、`medium`、`high`、`xhigh`、`max`、`auto`。可通过 `--thinking` 为单次运行覆盖。 |
| `hideThinkingBlock` | boolean | `false` | 在输出中隐藏思考块。`--hide-thinking` 为本次运行设置此项（仅影响显示）。 |
| `thinkingBudgets.minimal` | number | `1024` | `minimal` 档位的令牌预算。 |
| `thinkingBudgets.low` | number | `2048` | `low` 的令牌预算。 |
| `thinkingBudgets.medium` | number | `8192` | `medium` 的令牌预算。 |
| `thinkingBudgets.high` | number | `16384` | `high` 的令牌预算。 |
| `thinkingBudgets.xhigh` | number | `32768` | `xhigh` 的令牌预算。 |
| `thinkingBudgets.max` | number | `32768` | `max` 的令牌预算。 |
| `providers.autoThinkingMaxEffort` | enum | `xhigh` | `defaultThinkingLevel: auto` 可以解析出的最高推理强度。`xhigh` 将分类器限制在最高档的下一档，因此只有 `ultrathink` 能达到 `max`；`max` 则允许分类器对提供最高档的模型使用该档位并计费。无论如何，本地设备端分类器仍以 `xhigh` 为上限。这控制的是 `auto` 的_解析结果_：若某个模型的档位阶梯在上限以下没有任何选项，就不会为其解析出自动档位；若模型元数据要求显式指定推理强度，传输层仍会发送它支持的最低档位，在 `["max"]` 阶梯上就是 `max`，因为该模型不接受其他档位。 |

### 采样 \{#sampling}

对于数值型采样设置，负数（通常为 `-1`）表示“使用提供方或模型的默认值”，`omp` 不会发送该参数。

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `temperature` | number | `-1` | 采样温度。 |
| `topP` | number | `-1` | 核采样。 |
| `topK` | number | `-1` | Top-K 采样。 |
| `minP` | number | `-1` | 最低概率截断。 |
| `presencePenalty` | number | `-1` | 存在惩罚。 |
| `repetitionPenalty` | number | `-1` | 重复惩罚。 |
| `textVerbosity` | enum | `low` | `low`、`medium`、`high`。由 OpenAI Responses 和 Codex 发送。 |
| `tier.openai` | enum | `none` | `none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。对于 OpenAI / OpenAI-Codex 及 OpenRouter 上的 OpenAI 系列模型，以 `service_tier` 发送。`ultrafast` 只发送给 OpenAI API，以及发现结果中的 `service_tiers` 列出该档位的 Codex 模型和 OpenAI 兼容中转模型。启动时使用 `--service-tier <value>` 可为单个会话覆盖 OpenAI 设置；此选项不会持久化（`none` 表示不发送 `service_tier`）。 |
| `tier.anthropic` | enum | `none` | `none`、`priority`。`priority` 为支持此档位的直连 Claude 模型启用快速模式（在 Bedrock/Vertex 以及通过 OpenRouter 使用时忽略）。 |
| `tier.devin` | enum | `none` | `none`、`priority`。Devin 模型具有快速通道时，`priority` 会发送其快速通道对应的传输 ID（`-fast`、`-priority`、`-lightning`）；与在 Devin 模型上使用 `/fast` 的开关相同。 |
| `tier.google` | enum | `none` | `none`、`flex`、`priority`。Gemini API 在请求体中发送此值；Vertex 通过请求头发送 `priority`（`flex` 在 Vertex 上不生效）。 |
| `tier.subagent` | enum | `inherit` | `inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。应用于所启动模型所属的系列；`inherit` 跟随主智能体。 |
| `task.agentServiceTierOverrides` | record | `{}` | 对通过 task/eval 分派启动的智能体，按精确名称稀疏指定覆盖项（Vibe 工作进程仍使用 `tier.subagent`）。取值：`inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。条目会覆盖 `tier.subagent`；具体档位只有在解析出的模型所属提供方系列支持时才生效。非映射值会导致设置加载失败。 |
| `tier.advisor` | enum | `none` | `inherit`、`none`、`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`。应用于顾问模型所属的系列。 |
| `encourageEdits` | boolean | `true` | 系统提示词包含一条关键规则，要求编辑文件时使用 `edit` 工具，禁止使用 sed/perl/python 编辑；`false` 表示省略编辑指引。 |
| `personality` | enum | `default` | `default`、`friendly`、`pragmatic`、`none`。用户级的 `<agent dir>/PERSONALITY.md` 会替换所选预设的文本；`none` 仍会省略该块。参见[自定义系统提示词](./system-prompt-customization.md)。 |

#### 快速档位与多个账户 \{#fast-tiers-and-multiple-accounts}

`/fast` 切换 Fast（`priority`）；`/ultrafast` 在支持时切换 Ultrafast。两者均接受显式 `on` 和 `off`。选择其中一个会替换另一个。`/session info` 报告所选速度模式，旧的 `/fast ultra` 仍会启用 Ultrafast，但不会将其切换为关闭。

为同一提供方存储多个凭据时，请求若指定了某个档位，就会路由到提供该档位的凭据，无需固定任何项：

- **Codex（`ultrafast`、`priority`）**：每个已登录的 ChatGPT 账户都会报告各模型自己的档位列表。Ultrafast 属于套餐权益（Pro $500；Pro $200 仅限 GPT-6.2 Sol；符合条件的 Enterprise/Edu 工作区），因此 `/ultrafast` 会使用列出此档位的账户；最终由其他账户处理的请求会省略该档位。
- **Claude（`priority`，快速模式）**：当 Claude 的可用性检查允许快速模式（已启用用量额度；Team/Enterprise 还需要所有者启用），且用量额度上限尚未耗尽时，OAuth 账户符合条件。没有符合条件的 OAuth 账户时，改用 API 密钥处理快速请求，顺序与通常一致：`/login` 密钥、环境变量（`ANTHROPIC_API_KEY`）、另一个已存储密钥。在提供方拒绝之前，均假定密钥支持快速模式。`--api-key` 和 `models.yml` 中的密钥保持正常优先级。

提供该档位的账户会尽可能持续处理请求，包括付费超额用量（Codex 额度）和其用量保留额度以内，因为你指定的档位值得支出；普通请求仍避免超额用量。该账户被阻止或被拒绝使用该档位后，请求会以标准速度在其他账户之间均衡分配，待其恢复后再切回。一次拒绝会使该凭据在30分钟内不再用于该档位（环境变量密钥没有存储记录，因此在本进程剩余时间内停用该档位）；显式重新启用该档位会立即重新检查。你明确固定的账户仍会持续处理请求，不受上述行为影响。

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
      # the provider: google/x -> google-vertex/x.
      # Ids missing on the target provider are skipped (near-miss ids resolve
      # fuzzily); exact model keys override the wildcard for a specific model.
      google/*:
         - google-vertex/*

providers:
   anthropic:
      serverSideFallback: false
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `retry.enabled` | boolean | `true` | 重试提供方的临时错误。 |
| `retry.maxRetries` | number | `10` | 每个请求的最大重试次数。 |
| `retry.baseDelayMs` | number | `500` | 初始退避时间。 |
| `retry.maxDelayMs` | number | `300000` | 退避上限（5分钟）。提供方要求的等待长于此值，且没有凭据或模型回退能够成功时，会快速失败，除非 `retry.waitForUsageReset` 允许按权威配额重置时间等待。`0` 禁用上限。 |
| `retry.modelFallback` | boolean | `true` | 一个聊天模型不可用时，回退到另一个聊天模型。遵循此开关的角色驱动辅助功能，包括在线生成会话标题，在此值为 `false` 时会在第一个可解析候选项处停止。与 `contextPromotion.enabled` 相互独立：这是阻止 `retry.fallbackChains` 切换模型的开关。 |
| `retry.fallbackOn` | enum | `any` | 决定会话轮次（包括子代理）或顾问轮次中哪些失败请求可以遍历 `retry.fallbackChains`。`any` 在每次提供方错误时切换。`usage-limit` 仅在用量限制时切换，包括配额窗口、支出上限和余额耗尽；在会话轮次中，其他可重试错误会按正常退避重试同一模型，最多达到 `retry.maxRetries`，然后呈现错误；不可重试错误（包括拒绝）立即呈现。`except-usage-limit` 对其他错误均进行切换，而对用量限制等待或呈现错误。未进入回退链的顾问保留各自的重试和丢弃行为（参见 `docs/advisor-watchdog.md`）。不影响凭据轮换和 `retry.usageAwareFallback`。 |
| `retry.rateLimitWalksChain` | boolean | `false` | 显式启用后，发生速率限制时立即遍历 `retry.fallbackChains`，而不是因当前轮次的思考由出错模型签名而继续等待该模型。默认情况下，这类轮次会先重试受速率限制的模型，直到耗尽 `retry.maxRetries`，才进入回退链。 |
| `retry.fallbackChains` | record | `{}` | 将角色、模型选择器或 `provider/*` 通配符映射到有序回退选择器。包含 `/` 的键面向模型，优先于角色：`provider/model-id` 匹配该具体模型，`provider/*` 匹配该提供方的所有模型。`provider/*` _条目_保留出错模型的 ID，只替换提供方。模型类型角色未设置回退链时使用各自的内置链，设为 `[]` 时不使用回退；`default` 链永远不适用于这些角色。未知模型、提供方或格式错误的回退链，会在启动时报告为配置警告。 |
| `retry.fallbackRevertPolicy` | enum | `cooldown-expiry` | `cooldown-expiry` 在主要模型的抑制窗口结束后切回该模型；`never` 一直使用回退模型，直到手动切换。 |
| `retry.waitForUsageReset` | boolean | `false` | 当重置提示或完整用量报告提供权威时间信息时，允许提供方声明的用量限制等待超过 `retry.maxDelayMs`。等待可以中止，但也可能使子代理一直等待。 |
| `retry.usageAwareFallback` | boolean | `false` | 轮次开始前，使用可靠的编码套餐配额报告，优先选择同提供方中配额正常的账户，然后选择配置的回退模型。用量未知时保留当前模型；不包括普通 API 密钥。 |
| `retry.usageReservePct` | number | `10` | 用量感知回退所保护的剩余配额百分比。 |
| `retry.usageReservePolicy` | enum | `confirm` | `confirm`、`auto`、`fail-closed`。达到保留额度时，`confirm` 会在交互式确认器可用时询问，否则自动回退；配额耗尽时可不经确认直接回退。`fail-closed` 会阻止使用已知的保留或耗尽配额，而不是继续消耗。 |
| `providers.anthropic.serverSideFallback` | boolean | `false` | 为符合条件的直连 Claude Fable/Mythos 请求启用 Anthropic 的 `server-side-fallback-2026-06-01` 测试版。由目录维护的服务端回退链当前指向 `claude-opus-5`，而不是 `claude-opus-5-5`；不支持的模型和主机没有回退链。 |

当前聊天模型持续失败（429、配额限制、提供方中断），且 `retry.modelFallback` 已开启时，会话会按具体程度选择出错模型所属的回退链：精确的 `provider/model-id` 键、`provider/*` 通配符、当前角色的链，最后是 `default`，后者也负责不属于任何角色的实时模型（通过 `/model` 切换或临时跳转）。实际链由所属角色的主要模型和其配置条目依次组成；若某个实时选择器没有出现在链中，就会向它提供整条链。多个角色分配同一模型时，不由 YAML 键顺序决定：当前会话角色优先；会话不处于那些角色时，`default` 优先于其他匹配的聊天角色。会跳过选择器仍在冷却中的聊天候选项，并在本轮剩余时间内切换模型。模型类型运行器单独解析各自命名角色的链，永远不使用 `default`。子代理的智能体定义列出多个模型匹配模式时，会在每次创建时获得自己的回退链：第一个可解析的模式是主要模型，其余为回退项；`fallbackChains` 中没有 `agent:<name>` 键。使用单个模型启动的子代理，会继承其角色的链（`@reviewer` → `fallbackChains.reviewer`），若该角色没有链则继承 `default` 的链；显式 `[]` 表示不使用回退，即使 `default` 也分配了同一模型。精确模型键和 `provider/*` 键仍优先于该继承链。

`openrouter/google/*` 这样的带前缀通配符可作为回退链键或条目：作为键时，匹配该前缀下的 ID；作为条目切换提供方时，将此前缀加到出错模型的裸 ID 之前。未带后缀的回退条目继承出错轮次的思考档位（包括 `auto`）；显式后缀（包括 `:auto`）仅在该回退项生效时替换原档位：恢复主要模型（冷却到期、恢复会话或重新激活子代理）时，会恢复回退前生效的档位，除非你在此期间修改了它。链耗尽时，恢复过程还可以查询当前回退模型自己的链，每次跳转仍会消耗一次重试。恢复顺序和配额行为，参见[重试策略](./non-compaction-retry-policy.md)。

如果提示词当前所用模型没有可用凭据，会在发送前遍历同一条链，而不是报出 `No API key found`。

重试时的模型回退不是上下文提升。`contextPromotion.enabled: false` 只会禁用向模型的 `contextPromotionTarget` 进行[上下文提升](./models.md#context-promotion)；若要阻止提供方错误后通过 `retry.fallbackChains` 切换当前模型，请设置 `retry.modelFallback: false`。同模型重试和上下文压缩仍可使用。

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
| `tools.format` | enum | `auto` | 工具传输格式：`auto`、`native`、`glm`、`hermes`、`kimi`、`xml`、`anthropic`、`deepseek`、`harmony`、`qwen3`、`gemini`、`gemma` 或 `minimax`。`native` 始终使用提供方原生工具调用。`auto` 也使用原生调用，除非所选模型明确设置了 `supportsTools: false`；此时会选择由该模型系列维护的方言，若没有已知的特定系列方言，则回退到 GLM。其他值会强制使用相应的带内方言。`xml` 是[通用 XML 格式](./toolconv/xml.md)；`minimax` 是 [MiniMax 格式](./toolconv/minimax.md)。参见 [GLM](./toolconv/glm-4.5.md)、[Qwen3/Hermes](./toolconv/qwen3.md)、[Kimi](./toolconv/kimi-k2.md)、[Anthropic](./toolconv/anthropic.md)、[DeepSeek](./toolconv/deepseek.md)、[Harmony](./toolconv/harmony.md)、[Gemini](./toolconv/gemini.md) 和 [Gemma](./toolconv/gemma.md)。 |
| `tools.approvalMode` | enum | `yolo` | `always-ask`（自动批准只读操作）、`always-ask-cached`（_询问并记住_：读取文件前也会询问，并可记住文件或文件夹；参见[审批模式](./approval-mode.md)）、`write`（自动批准读取和工作区写入）、`yolo`（自动批准所有级别）。`--approval-mode` 和 `--auto-approve`/`--yolo` 可为单次运行覆盖此设置。 |
| `tools.approval` | record | `{}` | 按工具名称指定的逐工具策略；每个值为 `allow`、`deny` 或 `prompt`。例如 `omp config set tools.approval '{"bash":"prompt"}'`。 |
| `tools.restrictedFolders` | array | `[]` | 在这些文件夹中，每次读取、写入、编辑、搜索或执行命令，都必须在所有审批模式下（包括 `yolo`）得到明确批准，无论此前记住了什么决定：限制涵盖该文件夹及其所有下级内容，命令按运行目录匹配。参见[审批模式](./approval-mode.md#restricted-folders)。 |
| `tools.maxTimeout` | number | `0` | 智能体可请求的最大超时，单位为秒；`0` 表示不设置此项上限。 |
| `tools.intentTracing` | boolean | `true` | 要求智能体描述每次工具调用的意图。未设置时，仅在交互式 TUI（终端或 Tern）及其子代理中开启，在打印、RPC、ACP 和 SDK 会话中关闭；显式配置的值在所有环境生效。`PI_INTENT_TRACING` 可覆盖此设置。 |
| `tools.outputMaxColumns` | number | `768` | 流式输出每行的字节上限；`0` 禁用。 |
| `tools.artifactSpillThreshold` | number | `50` | 工具输出超过该 KB 数时，溢出内容转存为产物。 |
| `tools.artifactHeadBytes` | number | `20` | 转存时内联保留的开头 KB 数；`0` 表示仅保留尾部。 |
| `tools.artifactTailBytes` | number | `20` | 转存时内联保留的尾部 KB 数。 |
| `tools.artifactTailLines` | number | `500` | 转存时内联保留的最大尾部行数。 |
| `tools.artifactMaxBytes` | number | `16` | 为流式工具输出（bash、python、js eval）保存的产物文件的 MB 上限；输出更大时，保留开头（最多3 MB）和最近的剩余部分，中间附截断提示。`0` 表示不限。 |
| `tools.commands` | boolean | `true` | 将不常用、可发现的工具挂载为 bash 命令，并提供从模式派生的 `--help`，而不在每次请求中携带其模式。需要 `bash` 工具；没有该工具的会话会将所有已启用工具保留为顶层工具。禁用此设置会将所有已启用工具暴露为顶层工具。 |
| `tools.commandDocs` | enum | `catalog` | `inline` 内联每个已挂载命令的帮助，`builtins` 内联内置帮助（MCP 和扩展帮助按需获取），`catalog` 列出所有命令并按需获取帮助。 |
| `tools.commandInline` | array | `[]` | 在 `builtins` 模式下内联帮助的动态命令名称 glob 模式；在 `catalog` 模式下忽略。 |
| `tools.commandNotices` | boolean | `true` | MCP 或扩展工具作为命令挂载、卸载时显示通知。关闭只隐藏通知，模型仍会在下一条提示词中获知变化。`startup.quiet: true` 也会隐藏通知。 |
| `async.enabled` | boolean | `true` | 启用异步 bash 命令和后台任务执行。 |
| `async.maxJobs` | number | `100` | 正在运行的后台任务数量上限，最低按1处理；暂停或排队中的任务不占执行槽位。 |
| `async.printWake` | boolean | `false` | 打印模式（`-p`、`--mode json`）会等待本次运行的后台任务，而不是退出时取消它们，并在每个结果到来时于同一会话启动新轮次；等同于 `--wait-async`。 |
| `wait.idleTimeout` | string | `ladder` | `wait` 在等待智能体自身的后台任务和服务、且没有新内容时，阻塞多久才返回仍在运行的快照。`ladder`：先5秒，连续等待时改为4分钟（参见 [wait](./tools/wait.md)）。时长值（`90s`、`30m`、`1h30m`）：每次都使用这一时间窗口。`none`：只有任务或服务完成、直接消息、引导或中断才结束等待。等待回复时（或子代理等待父智能体时）仍采用阶梯策略。其他值均被拒绝。 |
| `launch.persist` | boolean | `false` | Bash 服务（`name`）以持久方式启动：项目中最后一个 omp 进程退出后仍继续运行，直到自行停止或由 `proc://<name>/kill` 停止。打印（`-p`、`--mode json`）、RPC 和 ACP 模式始终开启此项，因此智能体留下的服务器会在 omp 进程退出后继续运行。 |
| `async.widgets` | boolean | `true` | 在 `wait` 卡片、任务标记及其悬浮卡片、任务面板中，为正在运行的后台任务显示实时小组件（从任务输出派生的图表、进度条和状态网格）。`widget` 模型角色为每个任务编写一份规格；后续更新均在本地计算，不调用模型。关闭时显示普通任务行。 |
| `out.enabled` | boolean | `true` | 允许智能体通过向 `out://` 写入 Markdown，在任务进行中回复而不结束轮次（使用 `write` 工具或在 bash 中使用 `> out://`，上限64 KiB）。回复显示为助手正文。未设置时，仅在交互式 TUI（终端或 Tern）中开启，在打印、RPC 和 ACP 会话中关闭；显式配置的值在所有环境生效。关闭时，系统提示词省略 `out://`，且写入会被拒绝。子代理始终被拒绝。 |
| `todo.midRunNudges` | enum | `capped` | 轮次持续修改内容时，隐藏式提醒智能体更新待办列表（统计自上次 `todo` 调用以来成功的 `bash`、`eval`、`edit`、`write` 和 `ast_edit` 结果）。`off` 从不提醒；`capped` 在12次后提醒，在待办列表变化或你发送消息之前最多提醒两次；`backoff` 持续提醒，每次提醒被忽略后将间隔加倍：12、24、48、96次后提醒，此后每192次提醒。 |
| `todo.backend` | string | `native` | 主会话待办列表所镜像到的扩展待办后端：扩展通过 `pi.registerTodoBackend()` 注册的 `id`，在 `/settings` 的 Tools → Todos 下选择。`native` 不进行镜像。无论如何，omp 都会保留列表；若没有已启用扩展注册指定 ID，会报告扩展错误，不改变其他内容。 |

以命令形式挂载需要会话中启用 `bash` 工具；没有该工具的会话会将所有已启用工具保留为顶层工具。

各个内置工具和 Eval 预置接口通过各自的键启用或禁用，例如 `bash.enabled`、`launch.enabled`、`eval.py`、`eval.js`、`glob.enabled`、`grep.enabled`、`fetch.enabled`、`browser.enabled`、`computer.enabled`、`ratchet.enabled`（默认为 `false`，控制 `ratchet(flow)` eval/hillclimb 预置接口；`/ratchet` 仅为当前会话将其开启）、`archive.enabled`（默认为 `true`，控制针对提示词历史、最近项目、过去会话和回顾的只读 `archive` Eval 预置接口）、`commit.enabled`（默认为 `true`，控制 `commit` Eval 预置接口及 `/commit`，只提交当前智能体及其子代理写入的行）、`astEdit.enabled`、`astGrep.enabled`、`find.enabled`（`auto`/`on`/`off`；`auto` 在第一个可用评判是原生评判时启用 `find`）以及 `web_search.enabled`。图像问答使用 `read <image>?q=<question>`，并遵循 `images.questionTimeoutMs`。

`find.hitThreshold`（大于0、不超过1的数值；未设置时为 `0.2`）是 `find` 将某个文件报告为命中项所要求的已验证段落概率，也是其列出行范围的最低概率。默认值适用于 TypeSafe Jev。其他决策模型的校准不同，若某个评判对不相关段落也给出较高概率，就需要提高此值以排除较弱命中（参见 [find](./tools/find.md)）。

`find.timeoutMs`（毫秒，`1000` 到 `600000` 之间的整数；默认为 `20000`）是一次 `find` 工具调用的墙钟时间预算；耗尽后，`find` 返回此前已验证的命中项。对于较慢或串行工作的评判，可提高该值；`omp find` CLI 不受此限制（参见 [find](./tools/find.md)）。

`find.verifyModel`（默认未设置的模型选择器，例如 `openrouter/liquid/d1-ultra`）会先尝试使用该模型验证段落；文件名和概略内容排序仍使用 `judge` 角色。它会针对 judge 角色的候选项解析，然后按相同回退规则转向角色链，并去除重复项；若选择器未匹配任何模型，则记录警告，并继续使用普通 `judge` 链进行验证（参见 [find](./tools/find.md)）。空值或仅含空白的值视为未设置。

### 窗口作用域的计算机操作 \{#window-scoped-computer-use}

默认关闭的 `computer` Eval 预置接口通过原生操作系统 API 截取和控制真实宿主窗口。窗口句柄可将目标限定到某个应用，而不让其获得焦点或移动真实指针；`desktop` 对象保留选定显示器的合成画面和全局输入行为。它与 `browser` Eval 预置接口相互独立，后者管理 Chromium/CDP 标签页及结构化页面自动化。

```yaml
computer:
   enabled: true
   display: active
   maxWidth: 3840
   maxHeight: 2400
```

| 键 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `computer.enabled` | boolean | `false` | 启用支持窗口感知的 `computer` Eval 预置接口；`/computer` 斜杠命令仅为当前会话切换此设置。 |
| `computer.display` | string | `active` | 仅控制 `desktop` 目标：`active` 截取与获得焦点的窗口重叠面积最大的显示器，无法确定时使用主显示器；`all` 合成所有显示器；也可以使用原生显示器 ID。 |
| `computer.maxWidth` | number | `3840` | 合成截图的最大像素宽度。无法保留原始细节的图像传输方式，包括 GitHub Copilot Responses 和 xAI OAuth，会将实际宽度限制为 `1280`；Claude 系列模型也采用相同上限作为兼容性回退。 |
| `computer.maxHeight` | number | `2400` | 合成截图的最大像素高度。上述坐标安全传输方式将实际高度限制为 `896`；其他模型保留配置的上限。 |
| `computer.takeover` | enum | `fallback` | 控制窗口输入调用的后台路径不可用时的行为，以及由谁决定接管。`fallback` 会以接管方式重新运行该次调用，将焦点归还用户应用（在 macOS 上，即使用户一直在输入也会归还；X11 和 Windows 则按普通接管执行），并在结果中说明；模型可以在调用中传入 `takeover`，而传入了该选项的调用绝不会被重新运行。`refuse` 使这类调用报出 `BackgroundUnavailable`，不接管任何内容；模型自身的 `takeover: true`、`raise()`、激活式 `apps.open`、`control.acquire`、桌面根目标输入、非 macOS 上的 `el.focus()`，以及 macOS 上打开菜单的调用（右键单击、Control 单击、`AXShowMenu`、`menu` 选项；在弹出按钮或菜单按钮上按下、左键单击、按住或拖动，以及对弹出按钮调用 `setValue`），都会在发送任何内容之前被拒绝。需显式启用的 `foreground` 和 `always` 由 omp 决定，绝不由模型决定：`foreground` 接管持有输入焦点的窗口输入，`always` 接管每次窗口及元素输入调用；两者都会像 `fallback` 一样重试被拒绝的后台调用，且输入调用不接受 `takeover` 选项。 |

每次调用都会读取计算机设置和当前模型的坐标安全图像限制；运行时修改和成功重新加载的文件修改会作用于下一次调用。直接调用 `computer` 辅助函数，以及传给 `computer.run(fnOrCode, options)` 的代码，都通过桌面根目标或 `window(...)` 选择目标。切换目标会使之前的坐标帧失效，因此指针输入之前必须先截取新目标。启用输入前，请配置 `tools.approvalMode` 或 `tools.approval.computer`，并授予平台权限。参见[窗口作用域的计算机操作](./computer-use.md)。

### Shell、eval 与 LSP \{#shell-eval-and-lsp}

设置 `display.shellVisualization: false`，可将 bash 命令显示为普通 shell 文本，而不是交互式执行可视化。此设置适用于流式调用和已保存的会话记录；执行跟踪仍会被记录，以便重新启用可视化时回放。

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
| `bash.allowCompoundCommands` | boolean | `false` | 对扁平、字面形式的 `&&` 链按段求值；未匹配的段继承正常的 bash 审批策略和模式。 |
| `bash.gitGuard` | boolean | `false` | 用于多个智能体并发共享的检出目录。在仓库主检出目录中，拒绝 `git stash`（`list`/`show`/`create` 除外）、`reset --hard`、重置到其他提交的 `reset`、`switch` 和分支 `checkout`、对路径执行的 `checkout` 或工作树 `restore`（正在解决合并或变基冲突时除外）、启动 `rebase`/`merge`/`pull`/`cherry-pick`/`revert`（相应操作进行中时，`--continue`/`--abort`/`--skip`/`--quit` 仍可执行）、`commit --amend`（试运行形式除外）以及 `clean`（`-n`/`--dry-run` 除外）；取消暂存仍被允许。在非裸仓库（`core.bare = false`）的关联工作树中，这些操作可以执行；它们通过 `reset`/`checkout`/`switch`/`restore` 丢弃的未提交修改，会先保存到 `refs/omp/discarded` 引用日志（使用 `git stash apply --index <id>` 恢复）；`stash pop`/`apply`/`drop`/`branch`/`clear` 会拒绝处理在其他分支上保存的条目。此保护由嵌入式 shell 的 `git` 内置命令执行，因此能看到展开后的命令和真实 cwd；服务、客户端终端、`pty` 调用以及通过路径或其他程序启动的 git 不受保护。 |
| `launch.enabled` | boolean | `true` | 为共享的长期运行项目进程启用命名 `bash` 服务和 `proc://` 监管；没有独立的 launch 工具。 |
| `bash.autoBackground.enabled` | boolean | `true` | 将长时间运行的命令自动转入后台。 |
| `bash.reapBackground` | boolean | `true` | 主智能体停止时，提醒其 bash 调用留下的、并非服务的运行进程（`cmd &`、`nohup cmd &`），并在会话结束时对使用 `&` 的进程及其进程树发送 SIGKILL；绝不终止使用 `nohup` 的进程。在 RPC 模式下强制关闭。 |
| `bash.autoBackground.thresholdMs` | number | `60000` | 自动转入后台前的时间阈值。 |
| `bash.direnv` | enum | `auto` | `auto` 通过嵌入式 direnv 内置功能加载已获允许的仓库 `.envrc` 文件。`off` 禁用集成。 |
| `bash.direnvLoadTimeoutMs` | number | `30000` | 等待嵌入式 `.envrc` 求值的最长时间；超时会使会话在没有 direnv 环境的状态下继续运行。 |
| `eval.py` | 布尔值 | `true` | Python eval 后端。`PI_PY=0` 对当前进程禁用它。 |
| `eval.js` | 布尔值 | `true` | JavaScript eval 后端。`PI_JS=0` 对当前进程禁用它。 |
| `eval.autoProvision` | 布尔值 | `true` | 首次执行 `%bun add` 时创建托管的 JavaScript eval 包环境。 |
| `eval.tools.enabled` | 布尔值 | `false` | 向 `task`、`agent()` 和 `workpool()` 子代理公开内核定义的 `@tool` / `tool(fn)` 函数。 |
| `eval.workpool.freshAgents` | 布尔值 | `false` | 为每个条目生成新的 workpool 智能体，而不是复用空闲工作者或批处理排队的条目。 |
| `python.kernelMode` | 枚举 | `session` | `session`（持久内核）或 `per-call`。 |
| `python.interpreter` | 字符串 | `""` | Python 解释器的路径；空值 = 自动检测。 |
| `lsp.enabled` | 布尔值 | `true` | 语言服务器集成。`--no-lsp` 对本次运行禁用它。 |
| `lsp.lazy` | 布尔值 | `true` | 按需启动服务器。 |
| `lsp.shared` | 布尔值 | `true` | 通过代理服务管理的项目级 LSP 多路复用器启动语言服务器。每个连接都有自己的服务器。释放的服务器最多保持热备 5 分钟，供下一个连接使用，但前提是另一个 omp 进程仍让项目的多路复用器保持运行；最后一个进程退出几秒后，多路复用器便会停止。代理服务不可用时回退到私有服务器。 |
| `lsp.diagnosticsOnWrite` | 布尔值 | `true` | 写入后运行诊断。 |
| `lsp.diagnosticsOnEdit` | 布尔值 | `false` | 编辑后运行诊断。 |
| `lsp.formatOnWrite` | 布尔值 | `false` | 写入时格式化文件。 |
| `lsp.diagnosticsDeduplicate` | 布尔值 | `true` | 合并重复诊断。 |
| `lsp.requestTimeout` | 数值 | `10` | 智能体未传入 `timeout` 时，等待语言服务器的诊断、悬停信息和其他答复的秒数（调用截止时间至少为 20 秒）；编辑后延迟到达的诊断至少等待这么长时间。`lsp` 工具的 `timeout` 可逐次调用提高或降低此值，范围为 5-300 秒，并受 `tools.maxTimeout` 限制。 |
| `shellPath` | 字符串 | _（未设置）_ | 用于服务、终端和 `!` 的外部 shell；普通 bash 工具调用使用内嵌 bash。 |
| `shellCommandPrefix` | 字符串 | _（未设置）_ | 传给自行构造 shell 工具的旧版 Pi 扩展；OMP 原生 shell 不应用此设置。 |

### 文件：编辑与读取 \{#files-editing-and-reading}

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
| `edit.mode` | 枚举 | `hashline` | `apply_patch`、`hashline`、`patch`、`replace`、`sloppy`、`magic`（描述更改，由模型写入）。`PI_EDIT_VARIANT` 固定所用模式。 |
| `edit.magic.model` | 字符串 | 未设置 | 用于写入 `magic` 更改的模型选择器或角色别名（如 `@slow`）；未设置时使用 `smol` 角色。除非选择器带有思考后缀（`…:low`），否则关闭推理。 |
| `edit.modelVariants` | 记录 | `{}` | 不区分大小写的模型选择器子串 → 编辑模式；匹配键最长者优先，长度相同时保持配置顺序。 |
| `edit.fuzzyMatch` | 布尔值 | `true` | 允许模糊锚点匹配。 |
| `edit.fuzzyThreshold` | 数值 | `0.95` | 模糊匹配的相似度阈值。 |
| `edit.blockAutoGenerated` | 布尔值 | `true` | 拒绝编辑生成文件或类似锁文件的文件。 |
| `edit.streamingAbort` | 布尔值 | `false` | 流式编辑不匹配时中止。 |
| `edit.enforceSeenLines` | 布尔值 | `true` | 如果先前的读取或搜索从未完整显示作为锚点的行，则拒绝编辑。 |
| `edit.recoverInlineEdits` | 布尔值 | `true` | 从助手文本中恢复识别出的编辑片段。 |
| `edit.autoRepair.enabled` | 布尔值 | `false` | 请求 `smol` 模型修复新引入的 AST 解析回归；仅接受重新解析成功的修复，否则发出警告。 |
| `edit.blackbox.enabled` | 布尔值 | `false` | 对 AST 解析回归附加完整源码。 |
| `read.defaultLimit` | 数值 | `300` | 不带选择器的 `read` 默认读取行数。 |
| `read.summarize.enabled` | 布尔值 | `true` | 为代码读取提供结构化摘要。 |
| `read.summarize.prose` | 布尔值 | `false` | 也对散文类文件生成摘要。 |
| `read.toolResultPreview` | 布尔值 | `false` | 内联预览工具结果。 |
| `read.renderMarkdown` | 布尔值 | `false` | 在 TUI 中渲染读取的 Markdown 文档。 |
| `readLineNumbers` | 布尔值 | `false` | 显示普通行号。 |

### 上下文、上下文压缩与记忆 \{#context-compaction-and-memory}

`/extended-context on` 启用更大的上下文窗口；`/extended-context off` 恢复标准窗口及高价计费上限。对于 `openai-codex/gpt-6-astra`、`openai-codex/gpt-6.1-sol` 及其 `-wm` 路由，关闭时使用 Codex 默认窗口（Astra 为 272,000 个 token，GPT-6.1 Sol 为 500,000 个），开启时使用精选的 922,000 token 输入窗口（总上下文 1.05M，输出 128K），或发现的更高上限。精选上限会纠正过时且偏低的发现值。`models.yml` 中显式指定的逐模型 `contextWindow` 覆盖值在两种模式下均优先；若想让开关再次控制该模型，请移除覆盖值。Codex 覆盖值仍受服务器实际接受的有效上限约束，允许使用精选上限或更高的实时上限，而不是任意更大的窗口。

自定义模型提供方可以通过在 `models.yml` 的模型或 `modelOverrides` 条目中设置 `contextWindow`（常规）
和 `maxContextWindow`（扩展），使用同一开关。
未设置 `maxContextWindow` 的 `contextWindow` 覆盖值
在两种模式下都保持固定。参见[模型配置](./models.md)；这些值控制
本地预算，而非上游端点接受的请求大小。

上下文压缩预留空间与此开关独立。默认预留 15% 时，Astra 文档中所述扩展窗口的自动上下文压缩阈值为 783,700 个 token。即使没有额外的长上下文定价倍率，更大的窗口也可能消耗更多用量。

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
| `extendedContext` | 布尔值 | `false` | 启用更大的模型窗口；使用 `/extended-context on`、`off` 或 `status`。 |
| `workspace.additionalDirectories` | 数组 | `[]` | 添加到每个会话的额外工作区根目录；相对路径从 cwd 解析。`/add-dir` 和 `/remove-dir` 可实时管理它们。 |
| `contextPromotion.enabled` | 布尔值 | `false` | 上下文溢出时升级到当前模型显式指定的 `contextPromotionTarget`。不影响 `retry.fallbackChains`；这些切换由 `retry.modelFallback` 控制。 |
| `compaction.enabled` | 布尔值 | `true` | 自动压缩对话上下文。 |
| `compaction.asyncEnabled` | 布尔值 | `true` | 上下文接近压缩阈值时，在后台预先生成摘要，超过阈值后拼接已就绪的结果。 |
| `compaction.midTurnEnabled` | 布尔值 | `true` | 在回合中途安全的工具循环边界处，于下次向模型提供方发起请求前检查阈值。设为 `false` 仅影响配置该值的会话；子代理始终检查，因为其整个任务只有一个回合。 |
| `compaction.methodOrder` | 数组 | `remote, snapcompact, handoff, shake, soft` | 按顺序尝试的回退方法。`remote` 使用模型提供方原生的服务器端压缩（OpenAI Responses compact、Anthropic compaction beta）；方法不可用或失败时尝试下一项。 |
| `compaction.handoffTimeoutSeconds` | 数值 | `0` | 交接文档允许生成的秒数，超时即失败；自动上下文压缩随后尝试下一种方法，`/handoff` 则报告超时。`0` = 无限制。 |
| `compaction.thresholdPercent` | 数值 | `-1` | 按上下文百分比触发；`-1` = 基于预留空间的默认值。 |
| `compaction.thresholdTokens` | 数值 | `-1` | `> 0` 时按固定 token 数触发。 |
| `compaction.modelThresholds` | 记录 | `{}` | 逐模型的上下文压缩限制，键为 `provider/model-id` 或以 `*` 结尾的前缀（`deepseek/*`）：可为压缩策略据以缩放的 token 基数（`90000`）、固定 token 触发值（`"f90000"`）或窗口百分比（`"80%"`）。见下文。 |
| `compaction.modelThresholdsEnabled` | 布尔值 | `true` | 是否应用 `compaction.modelThresholds`。有 `task.agentCompactionThresholdOverrides` 条目的子代理运行时会关闭它。 |
| `task.agentCompactionThresholdOverrides` | 记录 | `{}` | 按精确名称指定的 task/eval 智能体 → 上下文压缩触发值：正 token 数（`90000`）或百分比字符串（`"80%"`）。见下文。 |
| `compaction.reserveTokens` | 数值 | _（未设置）_ | 绝对预留下限。未设置时，有效预留量取 `16384` 与上下文窗口的 15% 中的较大值；如果该默认值会使小窗口没有实际可用预算，则回退到预留 15%。 |
| `compaction.summaryMaxTokens` | 数值 | _（未设置）_ | 常规上下文压缩摘要的输出预算，替代 `min(0.8 × reserve, 16384)`，并限制在模型输出上限以内。未设置时保留默认值；回合前缀摘要和远程摘要不受影响。 |
| `compaction.keepRecentTokens` | 数值 | `20000` | 摘要压缩时保留的近期历史 token 预算。 |
| `compaction.autoContinue` | 布尔值 | `true` | 上下文压缩后自动继续。 |
| `memory.backend` | 枚举 | `off` | `off`、`local`、`hindsight`、`mnemopi`。每个后端都有各自的 `hindsight.*` / `mnemopi.*` / `memories.*` 调优键。 |
| `autolearn.enabled` | 布尔值 | `false` | 实验性：启用常驻经验捕获指导和 `manage_skill`（启用记忆后端时还启用 `learn`）。托管技能位于 `<agent dir>/managed-skills` 下。 |
| `autolearn.autoContinue` | 布尔值 | `false` | 主回合在符合条件的情况下停止后，运行一次私有捕获回合（额外消耗 token）。关闭时仅保留常驻指导；不会向下个回合插入隐藏提醒。跳过已中止、计划模式和目标循环回合。 |
| `autolearn.minToolCalls` | 数值 | `5` | 主回合中至少完成多少次工具调用，才符合自动捕获条件。 |

正值 `compaction.thresholdTokens` 优先于 `thresholdPercent`。如果固定触发值（此设置或带 `f` 的模型条目）达到或超过模型上下文窗口，例如模型提供方将窗口限制得更小时，会在窗口减去预留量的位置进行压缩，与基于预留量的默认策略相同；`/models` 预览会标注 `capped by window`。否则，正百分比限制在 1-99%；非正百分比采用基于预留量的阈值：窗口减去其预留量，最多 690,000 个 token，因此 1M 级窗口（Claude 扩展上下文、窗口为 922K 的 GPT-6.2）在 690K 时压缩。百分比、固定触发值或模型基数不受此上限限制。

触发值严格按你的配置确定。在小窗口或模型提供方限制的窗口上，上下文压缩会转而减少保留的近期历史：保留的尾部上限为 `0.8 × trigger − reserveFloor`（若仅下限就已填满此值，则取 `0.8 × trigger` 的一半），使压缩后的上下文落在触发值的恢复区间以下，其中 `reserveFloor` 为有效预算预留量与 `compaction.reserveTokens`（未设置时为 `16384`）中的较小值。例如，100k 窗口设置 `thresholdPercent: 40` 时，在 40,000 个 token 处压缩，最多保留 15,616 个 token 的近期历史，而不是配置的 20,000 个。

`compaction` 还有额外的调优键（空闲压缩、取代/丢弃启发式策略），可通过 `omp config list` 查看。完整策略参考见[上下文压缩](./compaction.md)。

逐模型的上下文压缩限制适用于其匹配的模型。token 数是常规策略据以缩放的基数：计算阈值时 omp 将其视为模型窗口，因此在默认设置下，会在基数减去预留量的位置压缩（基数高于约 109k 时为 85%，不受 690K 上限限制），设置 `compaction.thresholdPercent: 80` 时则为基数的 80%；全局 `compaction.thresholdTokens` 不适用于该模型。在数值前加 `f`（`f400k`，存储为 `"f400000"`），可将其改为精确触发值。百分比条目会替代两个 `compaction.threshold*` 设置，按实际窗口缩放。请求和溢出处理仍使用实际窗口。`/models` 预览会显示每个模型的压缩位置；要设置限制，请在 **角色** 视图中选择角色行或回退行，按 `k`（或单击 **上下文压缩限制**），再输入 `400k`、`f400k`、`1M` 或 `80%`（输入为空则重置）。这会将精确的 `provider/model-id` 键写入全局配置。手动配置如下：

```yaml
compaction:
   thresholdPercent: 80
   modelThresholds:
      "deepseek/*": 90000
      "openrouter/anthropic/*": "60%"
      anthropic/claude-opus-5.5: 150000 # base: compacts at 80% of 150k
      openai/gpt-5.6-terra: "f400000" # fixed: compacts at exactly 400k
```

- 精确的 `provider/model-id` 键优先；否则应用匹配到的最长 `*` 结尾前缀。`*` 只允许出现在末尾，且每个键都需要有 `provider/` 部分。
- 条目值按下文 `task.agentCompactionThresholdOverrides` 的方式解析（`null` 清除较低层的条目），另支持 `"fN"` 固定值形式；智能体条目的 token 数始终是精确触发值，该处不接受 `f` 前缀。
- 触发值跟随当前模型：模型切换、上下文升级和顾问各自使用其模型的条目。
- `task.agentCompactionThresholdOverrides` 条目优先于该智能体的模型条目，包括其运行期间添加的条目。
- 项目配置设置了相同模型键时，管理中心会拒绝编辑；请改为在项目配置中修改。
- token 基数大于模型标准窗口，或固定触发值达到或超过该窗口时，会为该模型启用扩展窗口（即 `extendedContext` 会赋予它的窗口，包括长上下文定价档位），而不打开 `extendedContext`。基数就是你想要的窗口大小，因此即使缩放后的触发值落在标准窗口内，它也会开启扩展窗口（272K 模型上设置 `300k` 基数，会在 255K 压缩，但在更大窗口上运行，将预留量作为余量）；若要留在标准窗口，请使用不高于标准窗口的基数，或低于该窗口的 `f` 触发值。管理中心会先警告，再次按 Enter 才保存；它会拒绝大于模型可运行最大窗口的基数，以及达到或超过最大窗口的固定触发值。适用 `task.agentCompactionThresholdOverrides` 条目的子代理忽略模型条目，因此保留标准窗口。

为 task/eval 子代理设置逐智能体的上下文压缩触发值。以下配置让主会话保持在 40,000 个 token，而 `scout` 在其窗口的 80% 处压缩，`task` 在 90,000 个 token 处压缩：

```yaml
compaction:
   thresholdTokens: 40000

task:
   agentCompactionThresholdOverrides:
      scout: "80%"
      task: 90000
```

- 键为精确且区分大小写的智能体名称（`scout` 不匹配 `Scout`）。
- 数值为固定 token 触发值（正整数）；`"N%"` 字符串为上下文窗口的百分比，`0 < N ≤ 100`。条目会替代该智能体的 `compaction.thresholdTokens` 和 `compaction.thresholdPercent` 两个设置。
- `null` 清除由较低优先级设置层设置的条目。其他任何值都会导致设置加载失败。
- 没有条目的智能体（包括由已被覆盖设置的智能体生成的智能体）使用主会话的 `compaction.*` 阈值。主会话和 Vibe 工作者不受影响。
- 解析后的触发值随子代理会话存储，并在其恢复时复用。

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
   questionRouting: auto # auto, active
tui:
   hyperlinks: auto # off, auto, always
```

| 键 | 类型 | 默认值 | 值 |
| --- | --- | --- | --- |
| `theme.dark` | 字符串 | `titanium` | 深色终端背景使用的主题。 |
| `theme.light` | 字符串 | `light` | 浅色终端背景使用的主题。 |
| `symbolPreset` | 枚举 | `unicode` | `unicode`、`nerd`、`ascii`。 |
| `colorBlindMode` | 布尔值 | `false` | 差异中的新增内容使用蓝色而非绿色。 |
| `showHardwareCursor` | 布尔值 | `true` | 显示终端硬件光标。 |
| `statusLine.preset` | 枚举 | `default` | `default`、`minimal`、`compact`、`full`、`nerd`、`ascii`、`custom`。 |
| `statusLine.separator` | 枚举 | `powerline-thin` | `powerline`、`powerline-thin`、`slash`、`pipe`、`block`、`none`、`ascii`。 |
| `statusLine.sessionAccent` | 布尔值 | `true` | 用会话颜色为编辑器边框着色。 |
| `statusLine.transparent` | 布尔值 | `false` | 状态行使用终端背景。 |
| `statusLine.showHookStatus` | 布尔值 | `true` | 显示钩子状态消息。 |
| `terminal.showImages` | 布尔值 | `true` | 内联渲染图像（终端支持时）。 |
| `images.autoResize` | 布尔值 | `true` | 调整大图尺寸以兼容模型。 |
| `images.blockImages` | 布尔值 | `false` | 从不向模型提供方发送图像。 |
| `images.questionRouting` | 枚举 | `auto` | 回答 `read <image>?q=` 的模型：`auto`（依次尝试视觉角色、默认角色、当前模型，再尝试任意可用视觉模型，可能来自其他模型提供方）或 `active`（仅当前模型；无法读取图像时报错，因此图像永远不会离开当前模型）。 |
| `tui.hyperlinks` | 枚举 | `auto` | `off`、`auto`、`always`。 |
| `tui.motion` | 枚举 | `full` | 动画预设：`full` 让每种动画保持各自的设置；`reduced` 让旋转指示器以 250 毫秒间隔运行，不显示流光或闪烁/淡入淡出；`none` 还会让旋转指示器、思考脉冲和标题保持静态。流式文本不受影响（见 `tui.maxFps`）。自行设置的 `tui.spinnerInterval` 优先于预设。也可使用 `--motion` 和 `PI_MOTION`。 |
| `tui.spinnerInterval` | 数值 | 未设置 | 旋转指示器帧之间的毫秒数，包括终端标题；`0` 显示静态字形。未设置时遵循 `tui.motion`（`full` 下为 `80`，终端标题则为 `250`）。每一帧都会触发重绘，终端（以及每个 tmux 控制模式客户端）都必须处理。也可使用 `--spinner-interval` 和 `PI_SPINNER_INTERVAL`。 |
| `tui.maxFps` | 数值 | `30` | 重绘帧率上限，单位为每秒帧数（`1`-`120`），包括流式文本；按键回显保持 30 fps。也可使用 `--max-fps` 和 `PI_MAX_FPS`。 |
| `tui.showLinkUrl` | 布尔值 | `true` | 在有名称的 Markdown 链接后用括号显示目标 URL。关闭时，仅当标签是 OSC 8 超链接时才隐藏它；不使用终端超链接（`tui.hyperlinks`）时仍保留后缀，使目标保持可见。 |
| `tui.autoGraph` | 枚举 | `auto` | 在支持图形显示的终端上，使用主题颜色将智能体答复中的数值表格绘制成图表：`always` 使用内置最佳猜测；`smart` 让判定模型为猜测会绘图的每张表细化图表（种类、列、行名称与分组、刻度与参考行、每项指标的优劣方向、焦点行和标题，或完全不绘图）；`auto` 在判定角色解析为原生 TypeSafe jev 模型时采用 `smart`，否则采用 `always`；`off` 不改动表格。Tern 以 SVG 接收图表。仅适用于 TUI 中的主会话：子代理会话记录、打印、RPC 和 ACP 输出保持纯文本，其系统提示词也省略示意图和图表指导。 |
| `tui.mouse` | 布尔值 | `false` | 在主会话中捕获鼠标点击，使实时子代理卡片和 HUD 行可点击聚焦，并在悬停时高亮目标，且点击[扩展拥有的链接](./extensions.md#extension-link-schemes)会传给相应扩展（`app.links.hint` 可不用鼠标选择它们）。开启时原生文本选择改为 Shift+拖动；内联模式下，鼠标捕获会阻止原生滚轮滚动，终端会改为向 omp 报告滚轮刻度，因此请使用终端的键盘回滚快捷键滚动，或关闭此项。 |
| `display.pinnedAgents` | 枚举 | `collapsed` | 编辑器上方固定的实时智能体跳转列表：`off` 隐藏，`collapsed` 显示少量行并提供展开控件，`full` 列出全部。 |
| `display.subagentLivePreview` | 布尔值 | `false` | 在每个固定子代理的跳转列表行下显示其当前（或最近一次）工具调用。 |
| `display.toolActivity` | 枚举 | `detailed` | 模型工具调用在会话记录中的显示方式：`detailed` 绘制完整卡片；`concise` 每次调用显示一行（时间、状态、工具和意图，采用智能体管理中心的近期活动格式；失败调用会保留其最后一行错误），不显示参数或输出；`hidden` 不显示。`Ctrl+O` 打开完整卡片；`app.tools.toggleVisibility`（`Ctrl+Shift+O`）循环切换模式。 |
| `tui.resizeScrollback` | 枚举 | `rebuild` | 宽度调整稳定后，如何刷新终端回滚区中保留的会话记录行：`append` 在保留的历史下方按新宽度重放会话记录，`rebuild` 清除窗格回滚区后按当前宽度重放一份，`preserve` 仅重绘视口。 |
| `tui.screen` | 枚举 | `inline` | `inline` 使用终端回滚区。`fullscreen` 将输入区和 HUD 固定在应用管理的会话记录下方。拖动以选择，双击选词，三击选行；在边缘继续拖动即可滚动。`Alt+/` 查找文本，`Alt+C` 复制选区。Shift+拖动（iTerm2 中为 Option+拖动）仍可绕过鼠标报告。实时生效。Tern 使用自己的渲染器。 |
| `tui.fullscreenMouse` | 布尔值 | `true` | 在全屏会话记录中捕获拖动和滚轮报告。关闭后可不加修饰键使用原生选择，并仅用键盘滚动。模态选择器仍可请求鼠标报告。 |
| `tui.copyOnSelect` | 布尔值 | `true` | 全屏模式下，松开鼠标时复制会话记录文本。关闭后需使用 `app.transcript.copySelection`。远程选择使用客户端终端剪贴板（OSC 52）。 |
| `tui.scrollbar` | 布尔值 | `true` | 全屏模式下，内容溢出时在右侧边缘显示可交互滚动条，不预留指示器行。关闭滚动条后，已滚动的会话记录会在下方显示简洁计数。 |
| `tui.wheelLines` | 数值 | `0` | 全屏模式下每次滚轮报告滚动的行数；零表示自动选择滚轮速度。 |
| `tui.exitTranscript` | 布尔值 | `true` | 正常退出全屏模式时，将会话记录追加到常规屏幕。关闭后让原始屏幕保持原样。 |

要自定义状态行，请设置 `statusLine.preset: custom`，并配置 `statusLine.leftSegments`、`statusLine.rightSegments` 和 `statusLine.segmentOptions`。在任一片段列表中加入 `status`，即可渲染通过 `ctx.ui.setStatus()` 注册的扩展状态，按键排序并内联连接；在 ANSI 渲染的状态栏中，自行设置前景色的状态会保留该颜色，普通状态则使用强调色（原生 Rex/Tern 状态行仍以强调色绘制它们）。设置 `statusLine.showHookStatus: false` 可在页脚中隐藏相同的状态。

`path` 片段将主目录缩写为 `~`。在 Windows 上，共享路径格式化可识别主目录长名称及其现有的 8.3 别名（如 `ADMINI~1`），包括工具标签和错误文本中的这些形式。仅缩写主目录前缀；其余路径部分保留原拼写，格式化不会更改工作目录或环境。设置 `statusLine.segmentOptions.path.abbreviate: false` 可在状态行中保留完整路径。

`pi` 片段会将当前命名配置档案标记在品牌后（`π-work`；见[配置档案](./config-usage.md#profiles)）。设置 `statusLine.segmentOptions.pi.showProfile: false` 可隐藏该标记。

`model` 片段显示模型的显示名称。设置 `statusLine.segmentOptions.model.showProvider: true` 可加上模型提供方 ID 前缀（`anthropic/Opus 4.8`），从而区分由不同模型提供方或网关提供的同名模型。将 `statusLine.segmentOptions.model.display` 设为 `id` 可显示精确模型 ID，设为 `full` 则显示 ID，并在显示名称不同时将其放在后面的括号中（默认值为 `name`）。与默认标签一样，`full` 会去掉显示名称开头的 `Claude `（`claude-opus-4-8 (Opus 4.8)`）。设置 `statusLine.segmentOptions.model.maxLength` 可将过长标签截断为指定列数，并以 `…` 结尾。

`cost` 片段显示记录的会话费用。对于采用分时定价的当前模型提供方/模型，高峰时段会追加 `↑`，非高峰时段追加 `↓`，即使空闲也会在时段边界刷新。箭头反映当前费率，而非过去的支出；固定价格模型和显式费用覆盖值不显示箭头。UTC 时间安排及估算语义见[用量费用与分时定价](./models.md#usage-costs-and-time-based-pricing)。

`cache` 片段（位于 `full` 和 `nerd` 预设中）会在发送前显示下一条消息是否读取提示词缓存：可读取时显示暗色数据库字形；条目过期、omp 的预热刷新未命中、上下文已压缩，或模型、思考级别、工具、系统提示词或缓存保留时间发生更改时，以警告色加删除线显示。Unicode 符号预设绘制 `●`/`⊘`，ASCII 则绘制 `cache`/`!cache`。尚未使用过缓存、模型未声明缓存有效期，或会话属于子代理时会隐藏它；模型提供方无限期保留的条目（已登录的 Codex）永不过期。重新打开的会话会依据最新的已缓存答复读取状态，并显示为很可能已缓存。在 Tern 中，悬停标记会说明条目可保留到何时（或为何未保留），以及下一条消息会发送多少内容；点击会打开 `/session`，其中的提示词缓存部分还会显示档位和预热计划。

`tree` 片段（不属于任何预设，需自行添加）会在会话不再位于单线末端时，显示其在会话树中的位置：`2/3` 表示对话经过的最深派生点处的分支，`3 ahead` 则计算最新续接中超过回退点的用户回合数。仅计算包含用户回合的分支，因此 omp 丢弃失败答复并重新回答的情况不算派生。ANSI 输入区边框会在旁边标明 `/tree`；在 Tern 中点击会打开 `/tree`。聚焦子代理时会隐藏它。要启用，请设置 `statusLine.preset: custom`，并将 `tree` 加入 `statusLine.leftSegments` 或 `statusLine.rightSegments`，例如 `leftSegments: ["vim", "model", "mode", "tree", "path", "git", "pr"]`。

### 交互 \{#interaction}

| 键 | 类型 | 默认值 | 值 |
| --- | --- | --- | --- |
| `steeringMode` | 枚举 | `one-at-a-time` | `all`、`one-at-a-time`。排队的引导消息的投递方式。 |
| `followUpMode` | 枚举 | `one-at-a-time` | `all`、`one-at-a-time`。 |
| `interruptMode` | 枚举 | `immediate` | `immediate`、`wait`。 |
| `btw.inject` | 布尔值 | `false` | `/btw` 答复会用 `<inject>…</inject>` 包裹你请求的引导提示词，并高亮显示；`app.btw.inject`（`Alt+I`）将其发送到主会话（运行中则作为引导，否则作为新回合）。 |
| `doubleEscapeAction` | 枚举 | `rewind` | `rewind`、`tree`、`none`：打开回退选择器、打开会话树，或不执行操作。 |
| `autoResume` | 布尔值 | `false` | 自动恢复 cwd 中最近的会话。如果无法在不使用禁止的回退方式的情况下恢复其保存的模型，隐式交互启动会发出警告，并启动不含旧历史的新会话；显式恢复及无头行为不变。 |
| `plan.enabled` | 布尔值 | `true` | 启用计划模式。 |
| `plan.defaultOnStartup` | 布尔值 | `false` | 启用计划模式时，让每个新交互会话都以计划模式启动。打印/JSON（`--print`）模式忽略此项并打印提示；无头计划流程请使用 `--plan-yolo`。 |
| `ask.timeout` | 数值 | `0` | 经过指定秒数后提交 `ask` 表单的当前值（模型预选的答案）；`0` 禁用。也限制 `cfg://` 审批提示的等待时间；未回答的审批会拒绝写入，而不是自动提交。 |
| `ask.notify` | 枚举 | `on` | `on`、`off`。 |
| `pty.notify` | 枚举 | `on` | `on`、`off`。bash `pty` 控制台中的程序等待你按键时发出通知（例如 `sudo` 密码提示）。 |
| `input.bareExitOnEmptySession` | 布尔值 | `true` | 首条消息前提交完全一致的 `exit`、`quit` 或 `q`（不区分大小写）会退出。 |
| `input.bareSlashCommands` | 布尔值 | `false` | 无需 `/` 即可运行精确的命令名称；会话中已有消息后，必须按两次 Enter 确认。 |
| `tui.vimMode` | 布尔值 | `false` | 启用模态提示词编辑；`tui.vimModeDisplay` 可选择 `text`、`icon` 或 `none`（默认 `text`）。 |
| `tui.vimStartMode` | 枚举 | `insert` | `insert`、`normal`：每个提示词输入区和 Vim 模式对话框的初始模式。 |
| `tui.vimShowCommand` | 布尔值 | `true` | 像 Vim 的 `showcmd` 一样，在状态行回显输入了一半的 Vim 命令，即使模式指示器被隐藏也显示。 |
| `tui.vimYankToClipboard` | 布尔值 | `false` | 将每次 Vim 复制操作都复制到系统剪贴板，类似于 Vim 的 `clipboard=unnamed`；关闭时仅 `"+y` / `"*y` 会这样做。 |
| `startup.quiet` | 布尔值 | `false` | 隐藏欢迎/启动界面元素，包括启动画面。 |
| `startup.showSplash` | 布尔值 | `false` | 普通交互启动时显示完整设置动画，但不重新运行设置。 |
| `startup.changelogMode` | 枚举 | `summary` | `summary`、`expanded`、`hidden`：选择启动时发行说明的呈现方式。 |
| `startup.setupWizard` | 布尔值 | `true` | 每个设置版本显示一次新增的入门步骤。 |
| `update.auto` | 布尔值 | `false` | 交互启动时，通过管理该安装的方式（独立二进制文件、Homebrew、mise、bun、npm）在后台安装较新版本；进度显示在欢迎横幅的版本号后，下次启动运行新构建。在 Tern、Nix 和源码检出目录下忽略。状态和工作进程日志：`~/.omp/update/`。 |

### 模型提供方与服务 \{#providers-and-services}

图像生成、网页搜索、语音、听写和判定的模型/后端顺序，通过[模型](#models)中对应的 `modelRoles` 和 `retry.fallbackChains` 条目配置。本节包含独立于模型选择的传输与服务行为。

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

`providers.fetch=local` 使用进程内阅读器
引擎渲染获取的 HTML（`renderHtml` 和 `Reader`，见
[HTML 转换](./natives-media-system-utils.md#html-conversion-renderhtml-reader)）：
它选择文章正文，并从已经获取的 HTML 生成 Markdown 或纯文本，
不使用外部阅读器。服务提供方的自动选择顺序为
`local` > `parallel` > `firecrawl` > `jina`。

`providers.openaiResponsesWebsockets` 为标准 Responses 启用 WS，默认值
为 `false`；`providers.openaiWebsockets` 和 `PI_CODEX_WEBSOCKET` 仅控制 Codex。
能力门控、模型/请求否决、钩子、链式连接和恢复方面的取舍，参见
[标准 Responses WebSockets](./models.md#standard-responses-websockets)。

| 键 | 类型 | 默认值 | 值 / 说明 |
| --- | --- | --- | --- |
| `providers.webSearchTimeoutSeconds` | 数值 | `60` | 每个候选项的网页搜索传输超时。超过 `300` 的值被限制为五分钟。这不是整条链的截止时间；超时后 `web` 角色会尝试下一个候选项。 |
| `providers.fetch` | 枚举 | `auto` | `auto`、`local`、`parallel`、`firecrawl`、`jina`。 |
| `providers.webKeyless` | 布尔值 | `true` | 允许 `web_search` 和 URL 阅读器使用你未持有凭据的第三方服务：无密钥的 Parallel、Exa、Firecrawl、Keenable 和 Perplexity，Jina 阅读器，以及抓取式引擎（Startpage、DuckDuckGo、Ecosia、Google、Mojeek、Hacker News、Public Web）。`false` 将它们限制为已配置的服务，包括显式配置的 `web` 角色；此时只有逐请求的 `omp q --model` 选择器仍可运行无密钥引擎。 |
| `providers.tinyModelDevice` | 枚举 | `default` | 本地微型模型使用的 ONNX 执行提供程序，或 `mlx`（Apple 芯片，通过 mlx-lm）。由 `PI_TINY_DEVICE` 覆盖。 |
| `providers.maxInFlightRequests` | 记录 | `{}` | LLM HTTP 请求的逐模型提供方正数并发限制，使用相同配置根目录的本地 `omp` 进程共享这些限制。省略的模型提供方不受限制。`omp config set` 拒绝非正数或非数值。 |
| `providers.tinyModelDtype` | 枚举 | `default` | 本地微型模型的 ONNX 精度。由 `PI_TINY_DTYPE` 覆盖。 |
| `tts.localVoice` | 枚举 | `harper` | 本地 Phonon TTS 运行器使用的音色。可用本地音色仍可独立于 `modelRoles.speech` 配置。 |
| `tts.localSpeed` | 数值 | `1` | 本地 Phonon TTS 运行器（`tts` 工具、`omp say`）的语速。`1` 为正常语速；值限制在 `0.8`-`1.3`。 |
| `speech.voice` | 枚举 | `harper` | 启用助手输出朗读时使用的 Phonon 音色。 |
| `speech.speed` | 数值 | `1` | 助手输出朗读的语速。`1` 为正常语速；值限制在 `0.8`-`1.3`。 |
| `speech.cloud` | 布尔值 | `false` | 通过 `modelRoles.speech` 及其回退项中显式配置的 `openai-speech`/`xai-tts` 模型朗读，将每个朗读片段发送到该端点。关闭时，即使语音角色指定云模型，朗读仍使用本地 Phonon。 |
| `stt.enabled` | 布尔值 | `false` | 启用麦克风语音转文本；使用 `modelRoles.dictation` 选择识别模型。 |
| `stt.language` | 字符串 | `en` | 语音转文本的源语言提示。 |
| `stt.submitTrigger` | 枚举 | `never` | 完成的听写何时自动提交：`never`、`release`、`release-complete` 或 `say-submit`。 |
| `live.voice` | 字符串 | `sol` | 实时语音会话的音色；Codex 提供 `arbor`、`aube`、`breeze`、`bubbie`、`cove`、`ember`、`haetsal`、`hanul`、`himari`、`juniper`、`leher`、`maple`、`marin`、`miko`、`neer`、`porto`、`rindo`、`rio`、`rivage`、`selva`、`sol`、`sonna`、`spruce`、`tinta`、`vale`、`viola`，自定义 `live.endpoint` 使用其自己的音色名称。 |
| `live.endpoint` | 字符串 | _（未设置）_ | 兼容 OpenAI Realtime WebRTC 的服务器基础 URL（例如 `http://127.0.0.1:8080/v1`），由其代替 Codex 运行实时语音，无需登录 Codex；见[自定义实时端点](./rpc.md#custom-live-endpoint)。为空时使用 Codex。 |
| `live.apiKey` | 字符串 | _（未设置）_ | 仅发送给 `live.endpoint` 的 Bearer 密钥：可以是字面值、环境变量名或 `!command`。属于凭据。 |
| `providers.openaiWebsockets` | 枚举 | `auto` | `auto`、`off`、`on`；仅适用于 OpenAI Codex。 |
| `providers.openaiResponsesWebsockets` | 布尔值 | `false` | 为目录中支持的模型启用标准 Responses WS；模型/请求上的 `false` 会禁用它。 |
| `providers.streamFirstEventTimeoutSeconds` | 数值 | `-1` | 首个流事件看门狗：`-1` 使用模型提供方/环境默认值，`0` 禁用，正值指定秒数。 |
| `providers.streamIdleTimeoutSeconds` | 数值 | `-1` | 流事件之间允许的最长静默时间，采用相同的 `-1`/`0` 约定。 |
| `providers.anthropic.slowMode` | 枚举 | `off` | `off`、`auto`。达到 5 小时限额且提供相应通道时，使用 Anthropic 订阅的低优先级恢复；`/slow on` 启用它。 |
| `providers.openaiLiveSteering` | 布尔值 | `false` | 将 GPT-6 响应流式输出期间输入的消息投递到该响应中（通过 Codex WebSocket 的 `response.steer`），而不是等到下一个工具边界。默认关闭；Codex 原生回合通道可能拒绝响应中途的消息（`unsupported_native_inflight_message`）。 |
| `providers.openai-codex.daybreak` | 布尔值 | `true` | 对符合资格的 ChatGPT 账户自动请求 Daybreak Blue 网络安全访问计划（`access_programs.cyber`）。OpenAI 可能使用 Daybreak Blue 会话的内容来改进模型；设为 `false` 可选择退出。每个会话读取自己的值。不涵盖专用 Daybreak Blue 模型（`gpt-daybreak-blue-*`）。 |
| `providers.openrouterVariant` | 枚举 | `default` | `default`、`nitro`、`floor`、`online`、`exacto`。 |
| `providers.kimiApiFormat` | 枚举 | `auto` | `auto`、`openai`、`anthropic`。`auto` 遵循实时模型元数据。 |
| `providers.cacheRetention` | 枚举 | `auto` | `auto`、`short`、`long`、`none`。转发给支持此功能的模型提供方的提示词缓存保留设置。`auto` 保留模型提供方默认值（Anthropic：OAuth 订阅者会话为 1 小时条目，API 密钥为 5 分钟条目）并遵循 `PI_CACHE_RETENTION`；`short` 强制使用 5 分钟；`long` 在支持时使用 1 小时 TTL；`none` 禁用提示词缓存和缓存亲和路由。 |
| `providers.cacheWarming` | 枚举 | `idle` | `off`、`streaming`、`idle`。提示词缓存预热会在缓存条目即将过期前刷新最后一次请求：第一方 Anthropic 使用 `max_tokens: 0` 预热（不收取输出费用；端点拒绝它的模型会在该会话中回退），其他情况则以单 token 输出预算重放请求（Anthropic Messages 在首个生成输出处停止；Converse 完成总计一个 token 的请求，以消耗末尾缓存用量），定价依据该会话重放时实际计费的输出量（首次之前按 512 个 token）。仅当避免缓存未命中的费用比刷新费用至少高 $0.05 时才运行预热。智能体运行期间，只要上次真实请求以来的刷新支出加上下次刷新仍不超过最便宜的退出方案，就会继续刷新：让条目过期（重新写入提示词），或根据 `providers.cacheWarmingStrategy` 在条目过期前压缩历史。刷新未命中缓存或失败时，会停止预热，直到下次真实请求。`off` 禁用预热；`streaming` 在长时间工具执行期间保护前缀，并在智能体停止活动时停止（task 子代理的预热从不超出 `streaming`）；`idle` 还会在运行间隙刷新（继续概率为 15%），直至上次真实请求后 30 分钟，因此它仅涵盖比该时段更短的缓存有效期（Anthropic 和 AWS Claude 的 5 分钟条目，而非 OAuth 订阅者会话等 1 小时条目）。预热遵循实际使用的保留档位的有效期；`providers.cacheRetention: none` 会阻止预热。模型未声明所用保留档位的有效期时（见[模型](./models.md)），从不预热。 |
| `providers.cacheWarmingStrategy` | 枚举 | `auto` | `auto`、`keepalive`、`compact`。刷新不再划算时，如何跨过长时间工具调用。`auto` 在压缩（读取提示词、生成摘要、重新写入压缩后的上下文）比让条目过期至少便宜 $0.05 时压缩，否则让其过期；`keepalive` 从不压缩；`compact` 在首次决策时压缩。压缩仅适用于达到下述阈值的提示词，需要非 `soft` 的自动、异步、回合中途压缩方法（`compaction.methodOrder` 中以 `remote` 或 `handoff` 为首），且存在 `session_before_compact` 扩展处理器时绝不运行。它在条目过期前一分钟发出请求，对待处理工具调用之前的历史生成摘要；工具返回时，结果会替换历史；如果请求在被模型提供方接受前失败，则用一次刷新替代。 |
| `providers.cacheWarmingCompactPercent` | 数值 | `60` | 提示词必须达到上下文窗口的这一比例，长时间工具调用才可通过压缩衔接；此值与 `providers.cacheWarmingCompactTokens` 中较低的阈值生效。 |
| `providers.cacheWarmingCompactTokens` | 数值 | `150000` | 提示词达到此 token 数后，长时间工具调用才可通过压缩衔接；此值与 `providers.cacheWarmingCompactPercent` 中较低的阈值生效。 |
| `provider.appendOnlyContext` | 枚举 | `auto` | `auto`、`on`、`off`。 |
| `exa.enabled` | 布尔值 | `true` | 启用 Exa 网页搜索提供方。 |
| `exa.searchDelayMs` | 数值 | `1000` | Exa 网页搜索请求之间的最短延迟，单位为毫秒；设为 `0` 可禁用节流。 |
| `searxng.endpoint` | 字符串 | _（未设置）_ | SearXNG 实例 URL。 |
| `searxng.token` | 字符串 | _（未设置）_ | SearXNG 令牌；另有 `searxng.basicUsername`/`searxng.basicPassword`/`searxng.categories`/`searxng.language`/`searxng.engines`（逗号分隔的引擎名称或 bang 快捷方式，例如 `ddg, br, startpage`，作为 API 的 `engines=` 参数发送）/`searxng.safesearch`。 |
| `auth.broker.url` | 字符串 | _（未设置）_ | 身份验证代理服务 URL。实际凭据连接优先使用环境变量，再使用主全局配置，而非项目/配置叠加层的值。 |
| `auth.broker.token` | 字符串 | _（未设置）_ | 身份验证代理服务令牌。`OMP_AUTH_BROKER_TOKEN` 优先于主全局配置；代理服务令牌文件作为回退。项目/配置叠加层的值不会重定向凭据。 |
| `task.agentAccountPools` | 记录 | `{}` | 按精确名称指定的 task/eval 智能体 → 模型提供方 ID → OAuth 身份键（[客户端账户池](./auth-broker-gateway.md#client-account-pools)的 `identityKey` 值，例如 Anthropic 的 `email:<address>\|org:<id>`；`omp usage accounts` 可列出它们）。智能体对每个列出的模型提供方仅使用这些账户进行身份验证，绝不使用其他账户或 API 密钥，无账户可用时失败；空列表表示不允许任何账户。格式错误的条目会导致设置加载失败。见[Task 智能体发现](./task-agent-discovery.md#model-and-structured-output-precedence)。 |
| `secrets.enabled` | 布尔值 | `false` | 在向模型提供方发出请求前，启用配置的机密混淆和内置的凭据形态令牌脱敏。见[机密混淆](./secrets.md)。 |

模型提供方凭据和自定义模型定义单独配置，参见[模型提供方](./providers.md)和[模型](./models.md)。

如果休眠或其他延迟导致提示词缓存条目距离过期不足十秒，`providers.cacheWarming` 会停止，不发送计划的刷新请求。

#### 已保存重置的自动消耗 \{#saved-reset-auto-consumption}

`codexResets.autoRedeem5h` / `autoRedeemWeekly` 和 `claudeResets.autoRedeem5h` / `autoRedeemWeekly` / `autoRedeemFable` 控制各窗口的已保存重置使用策略：`yes` 自动使用，`no` 从不使用，`unset` 先询问，且从不在未提示的情况下使用（没有提示 UI 的会话，如 `omp -p`，仅显示指向 `/usage reset` 的通知）。每次使用都受一个窗口控制：恢复时，若任一受阻窗口为周窗口（对 Claude 而言，即除 `anthropic:5h` 外的任何涵盖限额），则由周窗口键控制，否则由 5h 键控制；到期利用则由它所恢复的使用最满窗口控制。仅从 6 小时以内的 429 等待获知的 Codex 阻塞可能属于任一窗口，因此需要两个 Codex 键都允许。多个账户都可恢复时，键为 `yes` 的账户优先于需要提示的账户。提示答案会保存到仍为 `unset` 的控制键中。旧的单一 `autoRedeem` 会迁移到 5h 和周窗口键；Fable 初始为 `unset`。

Claude Fable 发布重置会恢复 Fable 每周用量（清除 5h 用量只是附带效果），因此仅由 `claudeResets.autoRedeemFable` 控制；只有阻塞包含 Fable 每周上限时，它才会恢复阻塞；其到期利用仅依据报告的 Fable 用量判断：Fable 用量为零或报告没有 Fable 行时，绝不使用，也不发出相关警告。

用量刷新检测到符合条件的储备重置将在接下来 **5 分钟** 内过期时，即使用量很少或为零、存在额度保留量，或 `salvageHorizonHours: 0`，自动消耗也会尝试使用它。仍须遵守同意要求、模型提供方资格、涵盖限额要求、冷却时间和防重复使用保护。

`salvageHorizonHours` 控制更早进行的、基于用量的到期利用；将其设为 `0` 仍会保留五分钟最后机会规则。将某模型提供方的所有窗口键设为 `no`，可禁用其自动使用。

在窗口耗尽前利用额度会重置整个窗口，因此任何剩余余量（例如每周配额的 30%）都会作废，窗口重新开始。设置 `codexResets.expirySalvage: false` 可采用仅在耗尽时使用的策略：此时 Codex 重置仅会自动用于恢复因窗口耗尽而受阻的账户，即将过期的额度（包括五分钟最后机会）则任其失效。默认值为 `true`。

要手动使用一次重置，可在会话中执行 `/usage reset`，或在 shell 中执行 `omp usage reset`，后者无需会话或 TTY，且可在身份验证代理服务客户端上使用：不带参数时，按 `<provider>/<credential id>` 列出每个账户保存的重置；带一个参数时，则在该账户上使用一次重置。

当账户中可由储备重置恢复的使用最满窗口已使用至少 25% 时，`omp usage` 和当前账户的状态行用量片段会标记将在 **7 天** 内过期的储备重置。在 **24 小时** 内，`omp usage` 会在开头为每个账户显示横幅：上述扫描会使用重置还是先询问（仅在打开交互式 omp 会话时），或不会使用，以及模型提供方允许时可立即使用该重置的 `/usage reset` 目标。在重置的最后 6 小时内，交互式 TUI 会显示一次单行警告，所有对话和 omp 窗口共享这一次提示（`agent.db` 记录已通知的重置）。

### 费用限制 \{#cost-limits}

```yaml
session:
   warnCost: 5 # USD: warn once when the session's spend reaches it
   maxCost: 10 # USD: stop sending model requests from this spend on
```

两者默认均未设置，接受正的美元金额；`--warn-cost` 和 `--max-cost` 可为单次运行覆盖它们，会话打开期间设置或更改任一项会对下一次请求生效。支出按模型目录标价统计会话及其子代理的每次模型请求：智能体回合、辅助请求（上下文压缩、交接、顾问审查、`/btw`、缓存预热）、eval 的 `completion()`/`judge()`/`judge_batch()`、基于判定的 `find`、图像提问、为纯文本模型生成的图像描述、编辑自动修复和作业小组件；达到上限时这些也会被拒绝，且不生成会话标题。记忆提取（Mnemopi 和 memories 整合）在后台运行，既不计入支出，也不被拒绝。每次请求发出前检查上限，因此已在途的请求可能完成后才超过上限。以 `--resume`/`--continue` 启动或切换到的会话，从会话文件记录的支出开始计算（页脚和 `/usage` 显示的总额），其中不含先前运行中的后台子代理支出和辅助请求；`/new` 从零开始，而派生新会话、分支和 `/btw` 保留会话支出。上限导致运行停止时，交互式 TUI 会显示原因，并将被拒绝的提示词放回编辑器，打印模式以状态 `3` 退出，RPC 则报告 `error.code: "cost_cap"`。

### Spotlight 实验 \{#spotlight-experiment}

使用 Stencil Spotlight（`POST https://cloud.stencil.so/v1/spotlight`，通过 `omp token stencil` 打印的 Stencil 凭据进行身份验证）的实验性工具输出整形和 `find` 排序。开启后，每个会话（包括子代理，不含辅助会话）都用 Spotlight 对工具结果整形并对 `find` 候选项排序，还会记录整形所做的处理；随机保留的对照组用于与未整形（原样）的结果比较。没有凭据时，整形回退到不排序的规则，每次凭据缺失时会话都会警告一次。

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
| `spotlight.experiment.enabled` | 布尔值 | `false` | 为新建和恢复的会话开启实验。`PI_SPOTLIGHT_EXPERIMENT` 覆盖它。 |
| `spotlight.experiment.holdout` | 数值 | `0.05` | 原本会被裁剪的结果中随机保留为对照组的比例（0-1，见下文）。`PI_SPOTLIGHT_HOLDOUT` 覆盖它。 |
| `spotlight.experiment.scoreFree` | 数值 | `0.15` | 未被保留为对照组的结果中，不使用 Spotlight 进行整形的比例（0-1，见下文）。`PI_SPOTLIGHT_SCORE_FREE` 覆盖它。 |
| `spotlight.experiment.tools` | 数组 | `["*"]` | 实验要整形并记录的工具结果，按工具名称指定；`*` 表示所有工具。未包含的工具返回原样结果，不写入日志条目。`PI_SPOTLIGHT_TOOLS`（逗号分隔的名称）覆盖它。 |
| `spotlight.url` | 字符串 | `https://cloud.stencil.so/v1/spotlight` | 排序端点。`STENCIL_SPOTLIGHT_URL` 覆盖它。 |
| `spotlight.model` | 字符串 | `whiskers-latest` | Spotlight 模型。 |
| `spotlight.thinking` | 枚举 | `med` | `low`、`med`、`high` 或 `max`：级别越高费用越高。 |
| `spotlight.timeoutMs` | 数值 | `5000` | 工具调用中一次排序的时间预算；超过后，整形回退到无需排序的规则。 |

整形会重写智能体调用的每个工具面向模型的结果（`spotlight.experiment.tools` 可缩小范围）。`read`、`bash` 和 `eval` 自行整形结果，TUI 仍显示其完整输出。其他所有工具，包括 `grep`、`find`、`glob`、`edit`、`wait`、`task`、`web_search`、MCP 和扩展工具，都会在调用返回后、pi 完成产物溢出处理和输出通知之后，按命令输出方式整形：压缩数据转储（JSON 和其他结构化输出）、折叠已显示的行，并应用大小控制，同时保留所显示行的 `# dir/` / `## file` 标题；最多约 3,900 字符且少于 40 行的结果会完整通过（`stats.short`），但如果至少连续 3 行已经显示过，且这段文本（包括换行符）比标记至少长 80 个字符，则折叠为 `… [N lines as shown before: read T:A-B]`。文件读取时，`T` 为读取的文件；从完整产物整形的 bash 输出中，该值为该次运行自己的产物；其他情况下则为仅在应用折叠时保存的副本。命令输出的最后一行从不折叠（重复之前运行但提前停止的输出仍能显示停止位置）；调用的 `i` 意图中指定的行与其他行一样会折叠，因为智能体上下文中已有这些行。若 bash 输出中的长行被输出接收端截断为 `tools.outputMaxColumns`，会像溢出输出一样从其完整产物整形，裁剪结果可能比接收端的预览更长（见 **节省量**）。仅对文本块整形（图像和其他块保留）；溢出结果会从工具自身的文本中完整整形（最多 4 MiB），其卡片显示模型收到的文本。工具或脚本自行发起的调用（eval 的工具桥接、挂载的工具命令）不做整形。对 URL（`https://`、`pr://`、`issue://`、…）或其他不按文件行打印的内容执行 `read`，会按命令输出整形；读取 `local://`（分页取回隐藏文本的溢出文件及其他临时文件）、`agent://`、`skill://` 和 `rule://`，以及其他工具中 `path` 指向这些路径的调用，均保持完整；读取 Markdown 文件、所有范围都有结束位置的行区间（`file.ts:120-180`、`:1-10,40-60`、`:-30`），或带 `:raw` 的读取也保持完整（日志条目中的 `stats.rawReads`）。含 `;`/`,` 路径的 `read` 作为一次调用整形：每部分单独处理，如同单独读取（由其文件窗口、`:raw` 或有界范围决定），共用一个日志条目和一条追踪记录，其中原始结果将每部分列为一个窗口（`original.windows`）；同一列表中的部分绝不会因为另一部分而被当作已见内容折叠。如果整形后的结果相对于所读取的完整输出没有减少 token，则原样显示（日志条目中的 `stats.reverted`）。

超过约 12k 字符的代码读取生成大纲，长文档折叠到所需章节，测试日志裁剪到失败内容，数据转储无损压缩，已显示的行折叠，超过 400 字符的行截短；其他任何超过约 3.9k 字符的结果会裁剪为 Spotlight 排名最高的约 3k 字符，但以下情况除外：最多约 12k 字符的大纲、源码读取、子代理报告（`task` 和 `wait` 结果，`omp -p` / `claude -p` / `codex exec` 运行）、编辑结果、拉取请求和议题讨论串（`pr://N`、`issue://N`）以及差异（任意工具的统一差异文本），ASCII 图，以及最多约 7.8k 字符的智能体自身程序输出。裁剪会显示每个选中行及其相邻行，并越过仅含括号的行，因此 C 函数签名会显示在其独立 `{` 上方。大纲保持展开对话提及的主体，包括多行签名之后的函数；裁剪长大纲时，会优先保留这些主体及包含意图中罕见词的行，优先级高于其他所有内容，为容纳主体可超过约 3k 字符（最多约 12k）。对于重复一至三种行形态的命令输出（将数字留空后，合计占至少 50 行的 95%），仅保留首尾行和不同的行，不保留其常规相邻行，并用 `[uniform: hidden lines: N match "…" (N: any number); 19 lines differ (15 like "WARN …", 4 like "ERROR …"), all shown]` 行统计各形态的隐藏行数并指出不同行（最多三行时按行号，否则在不同行的形态最多三种时按其自身形态）。词法选择优先包含意图中某个词且该词最多出现在 6 行中的行（意图词从 4 个字母起算，由更短部分构成的复合词，如 `gen:rpc` 或 `index.ts`，算一个词）；词太常见而无法定位某一行时，优先选择其首次和末次出现的行，使最新在前和最新在后的输出都能包含最新内容。对于已评分的非均匀结果，Spotlight 还会尝试保留最高热度行周围的完整段落。如果常规选择漏掉一段较长的峰值内容，且所有段落能容纳在正常窗口两倍、未整形预览六分之一的范围内，则直接添加，不移除已有内容。否则，在原窗口估算容量内，用完整段落替换较低优先级文本。它保护框架、可见的意图匹配内容和已可见的峰值上下文，先尝试最强的缺失段落，再尝试补全成本最低的段落。新加入的文本最多占窗口一半。大型源码大纲保留排名最高的源码行及其紧邻行和外层签名（包括多行签名），而不是将主体额度花在整个函数上。最终窗口使用这些原始行标识；多个摘录共享的签名只计算一次。完全评分的文件视图复用其源码评分，而不对渲染后的折叠标记重新排序。未显示的部分保留其精确文件范围，供恢复。孤立分隔符折叠进周围的省略区间。获取的 Markdown 页面会将章节标题和表格列名与内容一起保留。对于读取，裁剪的缺口（`… [A-B]`）和截短行使用文件自身行号；其他情况使用保存副本的行号，副本由结果最后一行标明（`[cut: local://N.log]`），系统提示词中的整形规则会一次性解释两者。裁剪 `git log` 输出时，会在每个显示行上方保留提交头（`commit`、`Author:`、`Date:`）和主题，隐藏完整提交的缺口会列出这些提交（`… [161-227] (2 commits: 3102b08 "fix(task): …", 9b72b7e "…")`，超过四个时仅列哈希）；压缩数据视图中的缺口会标明其读取方式（`… [N lines: read T:A-B]`），避免被当作数据值；命令输出中的缺口标记不缩进，更改过的命令输出以 `[exit code N]` 开头。智能体再次请求而取回先前裁剪所隐藏的行时，只有结果最多约 12k 字符才完整显示；更长的重跑结果与其他结果一样裁剪。系统提示词中有一条规则，要求智能体窄范围读取并批量调用。Spotlight 针对调用意图（启用 `tools.intentTracing` 时的 `i`）对每个结果排序，因此实验会话使用 `Brief label: detail`。工具活动显示 2-6 个词的标签；Spotlight 和会话保留完整意图，包括智能体希望从输出中获得什么，以及它已知什么。没有冒号加空格分隔符的意图会完整显示。提示词可配置：`i` 模式描述及其系统提示词指导来自 `prompts/spotlight/intent-field.md` 和 `intent-guidance.md`，`PI_INTENT_DESC` / `PI_INTENT_PROMPT` 仍可覆盖它们。

实验会为会话关闭 pi 的读取摘要器（`read.summarize.*`）和 bash 精简器（`shellMinimizer.*`），因此调用的 **原样** 结果，即整形的比较基准和对照组收到的内容，是工具在 pi 常规截断与限制下的自身输出。不带选择器的 `read` 会将文件分页到产物溢出阈值，而非 `read.defaultLimit` 行，因此整形会像摘要器那样为整个文件生成大纲。隐藏文本保存为会话溢出文件，由结果中的标记指明（`read local://N.log:A-B` 可读回）。排序失败或超时绝不会让工具调用失败：整形会回退到不排序的规则，任何整形错误都会保留未整形结果。`find` 使用 Spotlight 而非 `judge` 角色对候选文件排序，Spotlight 失败时回退到判定模型。

**对照组。** 每个待整形结果在整形前都会抽签决定是否进入对照组（概率为 `spotlight.experiment.holdout`），但整形始终运行。抽中且整形会更改文本时，模型会收到同一次调用的完全原样结果，其中整文件 `read` 会按原样窗口再次分页，因此对照组结果是已应用裁剪的随机反事实对照。整形不会更改的结果绝不进入对照组。日志条目和结果的追踪记录描述原本会执行的裁剪，Tern 显示暗色的“已保留为对照组 · 本可节省 N 个 token”通知，其详情面板展示模型未收到的裁剪结果。

**已见行。** 结果到达时，仍在模型上下文中的内容才算已经显示：用户消息、助手文本及其调用命令（不含 `read` 的路径），以及模型实际收到的工具结果，再加上同回合尚未到达的同级调用结果。被上下文压缩、旧结果修剪或省略、上下文清空或切换到其他分支移出上下文的行，不再折叠。

**免评分。** 未抽中对照组时，第二次抽签（概率为 `spotlight.experiment.scoreFree`）决定结果是否不经 Spotlight 整形：不调用 Spotlight，每一步均使用其无评分规则（大纲保留对话提及的主体，文档保留对话提及标题的章节，窗口和转储保留头尾）。模型收到该裁剪，因此对比免评分裁剪和已评分裁剪，可衡量 Spotlight 排序带来的增益。

**节省量。** 结果的节省量以调用的原样结果（`plainChars`、`plainTokens`）为基准：溢出的 `bash` 输出为带截断通知的截短文本，`read` 为第一页，`eval` 为截断后的输出，其他工具为经过产物溢出处理和输出通知后的结果，而不是整形所读取的完整输出。整形结果不会给模型更多内容：如果裁剪相对于原样结果节省不足 100 个 token，则不应用裁剪（也不纳入对照组），模型收到原样文本，`steps` 中添加 `plain-cap`，原本裁剪的大小记入 `cappedChars`/`cappedTokens`。唯一例外是行被接收端截断到 `tools.outputMaxColumns` 的 `bash` 输出：其预览将剩余内容留给产物读取，因此完整输出裁剪后最多约 3,900 字符时，即使 token 数多于预览也会应用。模型收到原样结果（保留或受限）时，`outChars`/`outTokens` 为原样文本的值。对于已应用或保留为对照组的裁剪，`savedTokens` 为 `plainTokens − outTokens`（列上限裁剪长于其预览时为负数），其他情况均为 0（包括受门控限制的读取）。

会话日志（`session.jsonl`）以 `custom` 条目记录实验：

- `spotlight:session`：`{model, thinking, urlHost, piVersion, holdout, scoreFree, tools}`，在每次会话启动时写入；会话切换到另一个文件，且该文件最后一个 `spotlight:session` 条目的比例或工具不同时，也会再次写入。`holdout` 和 `scoreFree` 是当前生效的抽签比例，`tools` 为整形的工具（`["*"]`：全部）。实验成为开关之前的日志使用 `spotlight:assignment` 条目，指明会话的 `arm`。
- `spotlight:shape`：每个整形工具的结果一条（`tool` 是智能体调用的名称）：`{toolCallId, tool, steps, inChars, outChars, inTokens, outTokens, plainChars, plainTokens, ms, spotlight: {calls, failures, failureCauses?, ms, tokens, costUsd}, stats, holdout?, scoreFree?, error?}`。`failureCauses` 按原因统计失败调用（`no_credential`、`timeout`、`transport`、`rate_limited`、`bad_reply`、`http_<status>`、…），仅在调用失败时存在。`steps` 指明重写结果的处理步骤（`outline`、`docs`、`tests`、`dump`、`window`、`seen`、`lines`），或为 `["none"]`。`plainChars`/`plainTokens` 为原样结果的大小；`cappedChars`/`cappedTokens` 为因过长而未应用的裁剪大小（`plain-cap`）。`holdout: true` 标记保留为对照组的结果；其 `steps`、`outChars`、`outTokens` 和 `stats` 是原本会应用的裁剪值。`scoreFree: true` 标记由免评分抽签决定、未经 Spotlight 整形的结果，无论内容是否更改。
- `spotlight:find`：会话每执行一次 `find` 调用就记录一条：`ranker` 为 `spotlight`，或在 Spotlight 失败并改用判定模型排序时为 `judge`。

结果的 `details.spotlight` 追踪记录包含相同的大小和抽签结果、`savedTokens`，以及文本更改时的 `original`（作为会话产物的原始内容、保留的连续区间及其原因、逐行热度：每行在 Spotlight 已评分行中的排名，`0`-`9`）。对照组结果的追踪记录会添加 `holdout: true`；`savedTokens` 为原本可节省的量，`original.kept` 为原本会保留的连续区间，`original.shapedUrl` 为保存原本会生成文本的会话产物。

### 其他分组 \{#other-groups}

本目录中未单独列入表格的每个配置模式路径，都明确以 `omp config list` 为准。其他分组包括：

- 智能体行为与安全：`ask.*`、`dev.*`、`eval.*`、`features.*`、`goal.*`、`loop.*`、`model.loopGuard.*`、`model.toolCallLoopGuard.*`、`prewalk.*`、`recap.*`、`sharpshooter.*`、`task.*`、`tools.*` 和 `vault.*`。
- 执行与内容：`commit.*`、`completion.*`、`edit.*`、`error.*`、`extensionHandlers.*`、`generate_image.*`、`git.*`、`images.*`、`live.*`、`paste.*`、`power.*`、`read.*`、`shellMinimizer.*`、`speech.*`、`terminal.*` 和 `title.*`。
- 界面与启动：`composer.*`、`display.*`、`extensionRenderers.*`、`input.*`、`marketplace.*`、`spelling.*`、`statusLine.*`、`startup.*`、`stt.*`、`tui.*`、`ttsr.*` 和 `update.*`。`extensionRenderers.assistantText`（默认 `false`）启用[助手文本渲染器](./extensions.md#assistant-text-renderer)和[扩展链接方案](./extensions.md#extension-link-schemes)；`extensionRenderers.transcriptPresenters`（默认 `false`）启用[会话记录呈现器](./extensions.md#transcript-presenter)。
- 发现、共享与身份验证：`auth.*`、`browser.*`、`claudeResets.*`、`codexResets.*`、`collab.*`、`commands.*`、`contextFiles.*`、`gc.*`、`ida.*`、`mcp.*`、`share.*`、`skills.*`、`stream.*` 和 `telemetry.*`。`contextFiles.extra` 的文档见[上下文文件](./context-files.md#extra-filenames)。
- 未分组的键：`setupVersion`、`proseOnlyThinking`、`omitThinking`、`externalThinking`、`includeWorkspaceTree`、`autocompleteMaxVisible`、`emojiAutocomplete`、`disabledExtensions`、`inlineToolDescriptors` 和 `treeFilterMode`。

这些设置遵循上文所示的、由配置模式定义的类型与默认值规则。

## 旧版迁移 \{#legacy-migration}

`omp` 自动迁移较旧的配置结构。这些均无需操作；列在此处是为了让你了解 `config.yml` 中可能出现的变化。

### 启动时迁移到 `config.yml` \{#startup-migration-to-configyml}

当前智能体目录下既不存在 `config.yml` 也不存在兼容的 `config.yaml` 时，可写启动会按以下顺序合并旧版来源：

1. `<agent dir>/settings.json`。
2. `agent.db` 中持久化的设置（覆盖冲突的 JSON 值）。

非空迁移结果会写入 `config.yml`。仅在写入成功后，才会将已解析的旧版 JSON 重命名为 `settings.json.bak`，并清除已迁移的数据库设置。空结果不创建 YAML 文件。

任一主 YAML 文件存在后，便不再查询这些旧版来源。通用配置加载器也会在其他配置文件仅有 `.json` 形式时，执行 `.json` -> `.yml` 迁移。

### 字段级迁移 \{#field-level-migrations}

以下部分迁移会在每次加载原始设置（全局、项目、叠加层和构造函数覆盖值）时应用；规范化更改会在以后保存时写入文件：

| 旧值 | 新值 |
| --- | --- |
| `inspect_image.enabled` / `inspect_image.mode` | 已移除 |
| `inspect_image.timeoutMs` | `images.questionTimeoutMs` |
| `queueMode` | `steeringMode` |
| 扁平的 `theme: "<name>"` 字符串 | `theme.dark` / `theme.light`（按亮度选择槽位；内置 `light`/`dark` 被丢弃以使用默认值） |
| 旧版 `task.isolation.mode: none` | `task.isolation.enabled: false` |
| 旧版 `task.isolation.mode: <backend>` | `task.isolation.enabled: true` + `isolation.backend: <backend>` |
| `task.simple` | 已移除 |
| 旧版隔离后端（`worktree`、`fuse-overlay`、`fuse-projfs`） | `rcopy`、`overlayfs`、`projfs` |
| `lastChangelogVersion` | 移至标记文件，并从 `config.yml` 中去除 |
| `doubleEscapeAction: branch` | `doubleEscapeAction: rewind` |
| `collapseChangelog` | `startup.changelogMode`（`true` → `summary`、`false` → `expanded`） |
| `edit.mode` / `edit.modelVariants` 的值 `atom`、`vim` | `hashline` |
| `readHashLines` | 已移除；哈希锚点遵循 `edit.mode` |
| `compaction.strategy` / `compaction.remoteEnabled` | `compaction.methodOrder`，保留显式的策略/远程禁用选择 |
| `snapcompact.systemPrompt` 布尔值 | `all` / `none` |
| `task.eager` / `todo.eager` 布尔值 | `always` / `default` |
| `features.unexpectedStopDetection` 布尔值 | `smart` / `none` |
| `inlineToolDescriptors` / `find.enabled` 布尔值 | `on` / `off` |
| `spelling.autocomplete` 布尔值 | `auto` / `off` |
| `display.hideToolActivity` | `display.toolActivity`（`true` → `hidden`、`false` → `detailed`） |
| `search.enabled` / `search.contextBefore` / `search.contextAfter` | 对应的 `grep.*` 键 |
| `serviceTier` / `serviceTierSubagent` / `serviceTierAdvisor` | 按模型家族划分的 `tier.*`；移除 `fastModeScope` |
| `advisor.subagents` | `task.agentAdvisor.task`（`on` / `off`） |
| `dev.autoqa.consent` / `todo.reminders.max` | `dev.autoqaConsent` / `todo.remindersMax` |
| `providers.parallelFetch` | 已移除；使用 `providers.fetch` |
| `providers` 模型/后端选择器、`tts.localModel`、`stt.modelName` | [模型](#models)中所述的角色/链迁移；移除废弃键 |
| `exa.enableSearch` / `exa.enableResearcher` / `exa.enableWebsets` | 搜索启用设置并入 `exa.enabled`；移除 researcher/websets 开关 |
| `computer.backgroundFallback` | `computer.takeover`（`takeover` 变为默认值 `fallback`；`refuse` 保留） |
| `computer.backend`、`tools.discoveryMode`、`tools.essentialOverride`、`mcp.discoveryMode`、`mcp.discoveryDefaultServers` | 已移除 |

## 故障排查 \{#troubleshooting}

### 项目设置未生效 \{#a-project-setting-is-not-taking-effect}

- 从包含 `.omp/config.yml` 的目录启动 `omp`。设置发现仅检查当前工作目录的 `.omp/`，不检查祖先目录。
- 确保 `.omp/` 非空；空配置目录会被忽略。
- 确认文件是有效的 YAML，且顶层为映射。
- 从该目录运行 `omp config get <key>`，查看有效值。
- 记住，`--config` 叠加层和运行时标志会覆盖项目配置。

### 全局数组在项目中消失 \{#a-global-array-disappeared-in-a-project}

大多数数组采用替换而非追加（`bash.patterns` 和 `bashInterceptor.patterns` 会将项目条目前置到全局条目之前）。如果项目设置了 `disabledProviders`、`enabledModels`、`cycleOrder`、`extensions` 或其他采用替换方式的数组，请在项目层包含期望的 **完整** 值，全局数组会被完全替换。

### 编辑配置后模型提供方仍然可用 \{#a-provider-is-still-available-after-editing-config}

- 检查你禁用的是模型提供方 ID（例如 `anthropic`）还是配置发现来源 ID（例如 `claude`），它们是共享 `disabledProviders` 命名空间中的不同 ID，作用不同。
- 检查是否有项目（或叠加层）的 `disabledProviders` 数组替换了全局数组。
- 凭据仍可来自环境变量、`.env`、OAuth、已存储身份验证信息或 `models.yml`；无论凭据来自何处，禁用模型提供方都会阻止选择，但请核实你编辑了正确的层。见[模型提供方](./providers.md)。
- 检查是否有警告提示实时重载保留了上次有效的层。配置发现来源开关会影响下一轮发现；已打开的目录/选择器可能需要刷新。

### `omp config set` 更改了错误的文件 \{#omp-config-set-changed-the-wrong-file}

`omp config set` 和 `omp config reset` 写入当前智能体/配置档案目录下的主全局 YAML 文件（`config.yml`，或已存在的兼容 `config.yaml`）。运行 `omp config path` 打印该目录，并检查 `--profile`、`OMP_PROFILE` 和 `PI_CODING_AGENT_DIR`。项目本地键请直接编辑 `<repo>/.omp/config.yml`。

### `--config` 叠加层在启动时失败 \{#a---config-overlay-fails-at-startup}

`--config` 文件是进程本地的 YAML 映射。文件缺失、YAML 无效或顶层为数组/标量都会造成硬错误，不会静默回退到较低优先级的设置。请修复路径或内容。

### 环境变量优先于我的配置 \{#an-environment-variable-beats-my-config}

某些设置（模型角色、eval 后端、微型模型设备/精度、身份验证代理服务、PTY）可由环境变量或 CLI 标志覆盖，方便逐机器配置，且它们优先于 `config.yml`。取消设置变量或去掉标志，便可让持久化值优先。见[环境覆盖](#environment-overrides)和[环境变量](./environment-variables.md)。

### `omp config set <key>` 提示“未知设置” \{#omp-config-set-key-says-unknown-setting}

键必须与配置模式路径精确匹配，不支持简写。使用 `theme.dark`，而非 `theme`。运行 `omp config list` 查看所有有效键。
