---
title: "插件市场"
description: "Oh My Pi v19.1.1 仓库文档：插件市场。"
---

# 插件市场系统 \{#marketplace-plugin-system}

插件市场支持从 Git、本地目录或直接指向目录清单的 URL 查找、安装和管理插件。它兼容 Claude Code 插件注册表格式。

## 快速开始 \{#quick-start}

```
/marketplace add anthropics/claude-plugins-official
/marketplace install wordpress.com@claude-plugins-official
```

在终端界面中，不带参数运行 `/marketplace` 会打开交互式插件浏览器。由 ACP 或 RPC 处理命令时，`/marketplace` 会列出已配置的市场，用 `/marketplace discover` 浏览插件。

## 概念 \{#concepts}

**市场**是包含目录文件的 Git 仓库或本地目录。优先使用 `.omp-plugin/marketplace.json`；作为兼容 Claude Code 的后备，也可以使用 `.claude-plugin/marketplace.json`。目录文件列出可用插件及其来源、描述和元数据。

**插件**是包含 Claude 或 OMP 插件内容的目录，例如技能、命令、智能体、规则、钩子、工具、MCP 服务器、LSP 服务器或 DAP 适配器。根目录 `plugin.json` 声明 Agent Plugins 1.0.0 schema 的包，会用可移植的 `agent-plugins` 发现提供程序查找技能和 `mcp.json`；混合包仍可提供 OMP 专用内容。市场安装也会加载 `package.json` 中 `omp.extensions` 声明的扩展模块：安装过程将缓存的插件符号链接到对应作用域的 `node_modules` 树，并在 `omp-plugins.lock.json` 中记录。通过 npm 安装或通过 `omp plugin link` 链接的插件在运行时也使用这两处。插件以 `name@marketplace` 标识，例如 `code-review@claude-plugins-official`。

**作用域**：市场插件可安装到两个作用域：

- **用户**（默认）：在所有项目中可用，记录在用户插件数据根目录下的 `installed_plugins.json` 中，默认为 `~/.omp/plugins/installed_plugins.json`。
- **项目**：只在当前项目中可用，记录在 `.omp/plugins/installed_plugins.json` 中。该路径位于最近一个含 `.omp/` 的父目录下；若不存在 `.omp/`，则使用最近的 Git 根目录。两个定位点都不存在时，显式进行项目安装可在当前工作目录创建这套目录。主目录不视为项目。

已启用的项目级插件优先于已启用的同名用户级插件。项目级插件处于禁用状态时，不会遮蔽用户级插件。

在 Linux 和 macOS 上，`omp config init-xdg` 会初始化 XDG 数据、状态和缓存根目录，不迁移现有数据。设置了 `XDG_DATA_HOME` 并初始化其 `omp/` 目录后，用户市场和插件的状态位于 `$XDG_DATA_HOME/omp` 下，包括 `marketplaces.json` 和 `plugins/`。命名配置档案使用各自的根目录；按 XDG 路由需要对应的 `omp/profiles/<name>/` 目录。下文的 `~/.omp` 路径适用于默认档案且未使用 XDG 的情况。

首次确定 XDG 注册表路径时，如果目标不存在，系统会尽力复制配置根目录中已有的 `marketplaces.json`，旧文件仍保留。此辅助操作不会复制插件安装目录树。

## 命令 \{#commands}

### 交互模式 \{#interactive-mode}

| 命令 | 效果 |
| --- | --- |
| `/marketplace` 或 `/marketplace install` | 打开交互式插件浏览器进行安装 |

### 市场管理 \{#marketplace-management}

| 命令 | 效果 |
| --- | --- |
| `/marketplace add <source>` | 添加市场来源 |
| `/marketplace remove <name>` | 移除市场 |
| `/marketplace update [name]` | 重新获取目录；省略名称则更新所有目录 |
| `/marketplace list` | 列出已配置的市场 |

### 插件操作 \{#plugin-operations}

| 命令 | 效果 |
| --- | --- |
| `/marketplace discover [marketplace]` | 浏览可用插件 |
| `/marketplace install [--force] [--scope user\|project] name@marketplace` | 安装插件 |
| `/marketplace uninstall [--scope user\|project] name@marketplace` | 卸载插件；不带参数时打开终端选择器 |
| `/marketplace installed` | 列出已安装的市场插件 |
| `/marketplace upgrade [--scope user\|project] [name@marketplace]` | 升级单个或所有插件 |
| `/plugins list` | 列出通过 npm 安装、链接或从市场安装的插件 |
| `/plugins enable [--scope user\|project] <plugin>` | 启用通过 npm 安装、链接或从市场安装的插件 |
| `/plugins disable [--scope user\|project] <plugin>` | 禁用通过 npm 安装、链接或从市场安装的插件 |

### 对应的 CLI 命令 \{#cli-equivalents}

命令行也支持相同操作：

```
omp plugin marketplace add <source>
omp plugin marketplace remove <name>
omp plugin marketplace update [name]
omp plugin marketplace list
omp plugin discover [marketplace]
omp plugin install [--dry-run] [--force] [--scope user|project] name@marketplace
omp plugin uninstall [--dry-run] [--scope user|project] name@marketplace
omp plugin upgrade [--dry-run] [--scope user|project] [name@marketplace]
omp plugin enable [--scope user|project] name@marketplace
omp plugin disable [--scope user|project] name@marketplace
omp plugin list

```

终端界面中的 `/plugins enable` 和 `/plugins disable` 会立即刷新当前会话的技能、斜杠命令、任务智能体和 MCP 服务器。需要区分市场插件的安装时，用 `--scope` 选择作用域；通过 npm 安装或链接的插件使用全局开关。终端界面中其他改变市场状态的操作（显式命令及选择器）会更新磁盘状态并使发现缓存失效，但不会刷新当前会话。操作之后可运行 `/reload-plugins`，刷新任务智能体、技能、斜杠命令和 MCP 服务器。新安装的非 MCP 工具、钩子或扩展模块需要重新启动会话。ACP 或 RPC 市场处理器会自动刷新技能和斜杠命令；ACP 也会重新发现任务智能体。两者都不会重新连接 MCP 服务器，也不会重建每项已初始化的能力集。

CLI 安装使用 `--dry-run` 时，会检查缓存目录、作用域、现有安装，以及本地可检查的来源约束，不拉取插件仓库，也不写入插件状态。卸载预览保留安装作用域是否有歧义的检查，不删除任何内容。不指定 ID 的 `upgrade --dry-run` 会用缓存目录比较版本，以 `from -> to` 列出每个需要更新的插件及其作用域。这些条目就是正式运行 `upgrade` 会重装的对象；`omp update --plugins --check` 打印同一列表。`upgrade name@marketplace --dry-run` 列出实际命令会重新安装的各个作用域，并分别标明升级、重装（同版本）或降级，因为指定插件名始终会强制安装目录中当前的版本。这两种预览都不安装插件。对 npm 或 Git 插件运行 `upgrade`，以及运行 `marketplace add`、`remove`、`update`、`enable` 或 `disable` 时，传入 `--dry-run` 会报错，不改变状态。终端界面、ACP 和 RPC 的斜杠命令不接受 `--dry-run`。

## 市场来源 \{#marketplace-sources}

运行 `/marketplace add <source>` 时，系统会按以下规则识别来源：

| 来源格式 | 类型 | 示例 |
| --- | --- | --- |
| `owner/repo` | GitHub 简写 | `anthropics/claude-plugins-official` |
| `https://...*.json` | 直接指向目录的 URL | `https://example.com/marketplace.json` |
| `https://...` / `http://...` | Git 仓库，除非 URL 路径以 `.json` 结尾 | `https://github.com/org/repo` |
| `git@...` / `ssh://...` | Git 仓库 | `git@github.com:org/repo.git` |
| `./path`、`~/path` 或 `/path` | 本地目录 | `./my-marketplace` |

Git 或本地来源必须提供目录文件，优先用 `.omp-plugin/marketplace.json`，兼容 Claude Code 时则可用 `.claude-plugin/marketplace.json` 作为后备。直接指向目录的 URL 只缓存 JSON 目录；来自 URL 目录的插件不能使用 `"./plugins/foo"` 之类的相对路径字符串作为来源。

## 目录格式（marketplace.json） \{#catalog-format-marketplacejson}

市场目录位于仓库根目录下的 `.omp-plugin/marketplace.json`。如果只有 omp 会读取目录，建议使用此路径。若需要兼容 Claude Code，则发布到 `.claude-plugin/marketplace.json`；两处使用同一种格式，omp 在没有 `.omp-plugin/marketplace.json` 时回退到兼容路径。仓库也可同时提供两份文件：omp 读取 `.omp-plugin/` 中的版本，Claude Code 读取 `.claude-plugin/` 中的版本。两处的目录格式相同：

```json
{
	"$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
	"name": "my-marketplace",
	"owner": {
		"name": "Your Name",
		"email": "you@example.com"
	},
	"metadata": {
		"description": "A collection of plugins",
		"version": "1.0.0",
		"pluginRoot": "./plugins"
	},
	"plugins": [
		{
			"name": "my-plugin",
			"description": "What this plugin does",
			"source": "./plugins/my-plugin",
			"category": "development",
			"homepage": "https://github.com/you/my-plugin"
		}
	]
}
```

### 必填字段 \{#required-fields}

| 字段 | 说明 |
| --- | --- |
| `name` | 市场名称。仅可使用 ASCII 字母、数字、连字符和点。开头和结尾必须为字母或数字。最多 64 个字符。 |
| `owner.name` | 市场所有者的名称 |
| `plugins` | 插件条目数组 |

顶层的 `metadata.description`、`metadata.version` 和 `metadata.pluginRoot` 均为可选字段。仅用名称表示的插件来源（例如 `"my-plugin"`）在 `metadata.pluginRoot` 指定的目录下解析；以 `./` 开头的来源从市场根目录解析。按 omp 旧规则编写的目录仍可用于安装。旧规则会给 `./` 来源加上 `pluginRoot` 前缀。因此，如果根目录中不存在该 `./` 来源，或该路径不是目录，系统会改在 `pluginRoot` 中尝试解析。其他文件系统错误会中止验证。

安装时，版本依次从目录中的 `version`、`.claude-plugin/plugin.json`、根目录 `plugin.json`、`package.json` 解析。若均未找到，则取来源定义中的前七位 SHA 字符或 `0.0.0`。用于缓存路径的版本必须包含 1 到 128 个 ASCII 字母、数字或 `._+-` 中的字符，且不得包含 `..`。

### 插件条目字段 \{#plugin-entry-fields}

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `name` | 是 | 插件名称，规则同市场名称 |
| `source` | 是 | 插件的位置，见下文 |
| `description` | 否 | 简短描述 |
| `version` | 否 | 版本字符串。安装版本依次回退到插件清单、来源 SHA 和 `0.0.0` |
| `author` | 否 | `{ name, email? }` |
| `homepage` | 否 | URL |
| `repository` | 否 | 仓库 URL 或字符串 |
| `license` | 否 | 许可证字符串 |
| `keywords` | 否 | 字符串关键词数组 |
| `category` | 否 | 类别字符串，例如 `development`、`productivity`、`security` |
| `tags` | 否 | 字符串标签数组 |
| `strict` | 否 | 布尔型元数据标志，会保留，但安装和运行时逻辑均不使用 |
| `commands` | 否 | 命令元数据，会保留；运行时命令从已安装的插件目录树发现 |
| `agents` | 否 | 智能体元数据，会保留，但市场安装不使用 |
| `hooks` | 否 | 钩子元数据，会保留；运行时钩子从已安装的插件目录树发现 |
| `mcpServers` | 否 | 此处保留 MCP 元数据；运行时 MCP 配置来自插件清单或目录树 |
| `lspServers` | 否 | 内联映射或插件内路径；安装时复制到 `.lsp.json` |
| `dapAdapters` | 否 | 内联映射或插件内 JSON/YAML 路径；安装时复制到 `.dap.json`、`.dap.yaml` 或 `.dap.yml` |

### 插件来源格式 \{#plugin-source-formats}

`source` 字段支持以下格式。字符串来源必须以 `./` 开头；设有 `metadata.pluginRoot` 时也可只填名称。两种情况都在市场根目录内解析：

**相对路径**（从市场仓库根目录起算）：

```json
"source": "./plugins/my-plugin"
```

**仅名称**（`metadata.pluginRoot` 下的单个目录名；例如 `"my-plugin"` 配合 `"pluginRoot": "./plugins"` 指向 `./plugins/my-plugin`）：

```json
"source": "my-plugin"
```

**Git 仓库 URL**：

```json
"source": {
  "source": "url",
  "url": "https://github.com/org/repo.git",
  "sha": "abc123..."
}
```

**GitHub 简写**：

```json
"source": {
  "source": "github",
  "repo": "org/repo",
  "ref": "main",
  "sha": "abc123..."
}
```

**Git 子目录**（用于 monorepo）：

```json
"source": {
  "source": "git-subdir",
  "url": "https://github.com/org/monorepo.git",
  "path": "plugins/my-plugin",
  "ref": "main",
  "sha": "abc123..."
}
```

**npm 包**（可解析，但尚不能安装）：

```json
"source": {
  "source": "npm",
  "package": "@scope/my-plugin",
  "version": "1.0.0"
}
```

当前安装器会拒绝市场的 npm 来源，并显示 `npm plugin sources are not yet supported`。请使用相对路径、GitHub、URL 或 git-subdir 来源。

如果目录 JSON 无效，或顶层必填字段无效，系统会拒绝整个目录。如果某个插件条目无效，系统只将该错误记入日志并跳过该插件，其他有效条目仍可使用。无论文件系统是否区分大小写，同一目录内的插件名，以及已配置的市场名称，在不区分大小写时都不得重复。

## 更新、移除和作用域 \{#updates-removal-and-scope}

- `/marketplace update [name]` 只刷新目录，不重装插件。
- 省略 `--scope` 时，`omp plugin upgrade name@marketplace` 会在安装过该插件的所有作用域中重新安装。插件同时存在于两个作用域时，`/marketplace upgrade name@marketplace`、卸载及启用或禁用操作都要求指定 `--scope user|project`。
- 升级所有插件时，只比较声明了 `version` 的目录条目。SemVer 版本必须更高；不符合 SemVer 的版本只要不相同，就视为有变更。系统独立检查各个已安装作用域。如果单个插件升级失败，会跳过该插件，因此批量升级可能部分成功。CLI 升级所有插件时会忽略 `--scope`。
- 重装或升级会保留禁用状态、功能选择和设置。用户级与项目级安装共享按版本区分的缓存目录，因此强制重装同一版本会替换两个作用域都使用的内容。若插件的运行时包名或缓存路径与其他插件冲突，该操作会被拒绝。
- `marketplace.autoUpdate` 控制启动检查，可用值为 `off`、`notify`（默认）和 `auto`。检查版本之前，系统会尽力刷新超过 24 小时的目录。当前的 `notify` 模式只把可用更新记入调试日志，不向用户显示通知。
- 移除市场时，会移除注册条目和目录缓存，不卸载已缓存且已注册的插件。

## 磁盘布局 \{#on-disk-layout}

```
~/.omp/
  marketplaces.json              # Registry of added marketplaces
  plugins/
    installed_plugins.json       # User-scoped marketplace plugins (version: 2)
    omp-plugins.lock.json         # Runtime enable/feature state and plugin settings
    node_modules/<package>        # Symlink to the cached plugin
    cache/
      marketplaces/<name>/       # Cached marketplace clone/catalog
      plugins/<marketplace>___<plugin>___<version>/  # Cached plugin directories

<project>/.omp/
  plugins/
    installed_plugins.json       # Project-scoped marketplace plugins (version: 2)
    omp-plugins.lock.json         # Project runtime enable/feature state
    node_modules/<package>        # Symlink to the cached plugin
```

锁文件也保存插件设置，包括被插件标记为 `secret` 的值，因此写入时设为仅所有者可访问（`0600`）。

## 命名规则 \{#naming-rules}

市场和插件的名称必须符合以下条件：

- 开头和结尾均为 ASCII 字母或数字。
- 只包含 ASCII 字母、数字、连字符和点。
- 最多 64 个字符。

构造插件 ID（`name@marketplace`）时，总长度上限为 128 个字符。名称保留大小写；引用插件时应使用目录中的拼写。

有效示例：`my-plugin`、`code-review`、`wordpress.com`、`ai-firstify`、`MixedCase`
无效示例：`-bad`、`bad-`、`.bad`、`under_score`
