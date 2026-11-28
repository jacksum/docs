---
title: "市场插件系统"
description: "Oh My Pi 官方仓库文档：市场插件系统。"
---

# 市场插件系统 \{#marketplace-plugin-system}

市场系统让你从 Git、本地或直接目录来源中发现、安装和管理插件。它兼容 Claude Code 插件注册表格式。

## 快速开始 \{#quick-start}

```
/marketplace add anthropics/claude-plugins-official
/marketplace install wordpress.com@claude-plugins-official
```

在 TUI 中，不带参数的 `/marketplace` 打开交互式插件浏览器。在 ACP/RPC 命令处理中，`/marketplace` 列出已配置的市场；使用 `/marketplace discover` 进行浏览。

## 概念 \{#concepts}

**市场**是一个 Git 仓库（或本地目录），包含位于 `.omp-plugin/marketplace.json`（首选）或 `.claude-plugin/marketplace.json`（兼容 Claude Code 的回退位置）的目录文件。目录列出可用插件及其来源、描述和元数据。

**插件**是包含 Claude/OMP 插件内容的目录，例如技能、命令、智能体、规则、钩子、工具、MCP 服务器、LSP 服务器或 DAP 适配器。根目录的 `plugin.json` 声明 Agent Plugins 1.0.0 模式的包，使用可移植的 `agent-plugins` 发现提供方来发现技能和 `mcp.json`；混合包仍可公开 OMP 专有内容。市场安装还会加载由 `package.json` 的 `omp.extensions` 声明的扩展模块：安装时将缓存插件通过符号链接放入相应作用域的 `node_modules` 树，并记录到 `omp-plugins.lock.json`，这与通过 npm 安装和通过 `omp plugin link` 链接的插件使用相同的运行时接入点。插件以 `name@marketplace` 标识（例如 `code-review@claude-plugins-official`）。

**作用域**：市场插件可安装到两个作用域：

- **用户**（默认）：在所有项目中可用，存储在用户插件数据根目录的 `installed_plugins.json` 中（默认为 `~/.omp/plugins/installed_plugins.json`）
- **项目**：只在活动项目中可用，存储在最近的、包含 `.omp/` 的祖先目录下的 `.omp/plugins/installed_plugins.json` 中；若不存在 `.omp/`，则位于最近的 Git 根目录下。两个锚点都不存在时，显式项目安装可以在 cwd 中创建此目录树；主目录不会被视为项目。

已启用的项目作用域安装会遮蔽同一插件已启用的用户作用域安装。被禁用的项目安装不会遮蔽用户安装。

在 Linux 和 macOS 上，`omp config init-xdg` 初始化 XDG 数据、状态和缓存根目录；不会移动现有数据。设置 `XDG_DATA_HOME` 且其 `omp/` 目录已初始化后，用户市场/插件状态会解析到 `$XDG_DATA_HOME/omp` 下（包括 `marketplaces.json` 和 `plugins/`）。命名配置档案使用自己的根目录；XDG 路由要求存在相应的 `omp/profiles/<name>/` 目录。下文的 `~/.omp` 路径是默认配置档案、不使用 XDG 时的默认值。

首次解析 XDG 注册表时，如果 XDG 目标不存在，会尽力复制已有的配置根目录中的 `marketplaces.json`；旧文件保留。该辅助操作不复制插件安装目录树。

## 命令 \{#commands}

### 交互模式 \{#interactive-mode}

| 命令 | 效果 |
| --- | --- |
| `/marketplace` 或 `/marketplace install` | 打开交互式插件浏览器（安装） |

### 市场管理 \{#marketplace-management}

| 命令 | 效果 |
| --- | --- |
| `/marketplace add <source>` | 添加市场来源 |
| `/marketplace remove <name>` | 移除市场 |
| `/marketplace update [name]` | 重新获取目录；省略名称则更新全部 |
| `/marketplace list` | 列出已配置的市场 |

### 插件操作 \{#plugin-operations}

| 命令 | 效果 |
| --- | --- |
| `/marketplace discover [marketplace]` | 浏览可用插件 |
| `/marketplace install [--force] [--scope user\|project] name@marketplace` | 安装插件 |
| `/marketplace uninstall [--scope user\|project] name@marketplace` | 卸载插件；不带参数则打开 TUI 选择器 |
| `/marketplace installed` | 列出已安装的市场插件 |
| `/marketplace upgrade [--scope user\|project] [name@marketplace]` | 升级一个或全部插件 |
| `/plugins list` | 列出 npm/链接插件及市场插件 |
| `/plugins enable [--scope user\|project] <plugin>` | 启用 npm/链接插件或市场插件 |
| `/plugins disable [--scope user\|project] <plugin>` | 禁用 npm/链接插件或市场插件 |

### CLI 等效命令 \{#cli-equivalents}

相同操作也可从命令行执行：

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

TUI 的 `/plugins enable` 和 `/plugins disable` 会立即刷新活动会话的技能、斜杠命令、任务智能体和 MCP 服务器；需要时，`--scope` 用于选择市场安装，npm/链接插件的开关则全局生效。其他 TUI 市场变更（显式命令和选择器）会更新磁盘状态并使发现缓存失效，但不会刷新活动会话。执行这些变更后，运行 `/reload-plugins` 来刷新任务智能体、技能、斜杠命令和 MCP 服务器；新安装的非 MCP 工具、钩子或扩展模块需要重启会话。ACP/RPC 市场处理器自动刷新技能和斜杠命令；ACP 还会刷新任务智能体发现。这两个远程处理器都不会重新连接 MCP 服务器，也不会重建每个已初始化的能力集合。

CLI 的 `--dry-run` 安装会验证缓存目录、作用域、现有安装以及可在本地检查的来源约束，不获取插件仓库，也不写入插件状态。卸载预览保留已安装作用域的歧义检查，不移除任何内容。不带 id 的 `upgrade --dry-run` 会对照缓存目录，以 `from -> to` 列出每个过时插件及其作用域，即实际 `upgrade` 会重新安装的组合；`omp update --plugins --check` 输出相同列表。`upgrade name@marketplace --dry-run` 列出实际命令会重新安装的每个作用域，标记为升级、重装（相同版本）或降级，因为指定插件名称始终会强制重新安装目录中的当前版本。这两者都不会安装任何内容。npm/git 插件的 `upgrade`、`marketplace add`、`remove` 和 `update`、`enable` 和 `disable` 会以错误拒绝 `--dry-run`，且不做任何变更。TUI/ACP/RPC 斜杠命令不接受 `--dry-run`。

## 市场来源 \{#marketplace-sources}

运行 `/marketplace add <source>` 时，系统会对来源进行分类：

| 来源格式 | 类型 | 示例 |
| --- | --- | --- |
| `owner/repo` | GitHub 简写 | `anthropics/claude-plugins-official` |
| `https://...*.json` | 直接目录 URL | `https://example.com/marketplace.json` |
| `https://...` / `http://...` | Git 仓库，除非 URL 路径以 `.json` 结尾 | `https://github.com/org/repo` |
| `git@...` / `ssh://...` | Git 仓库 | `git@github.com:org/repo.git` |
| `./path` 或 `~/path` 或 `/path` | 本地目录 | `./my-marketplace` |

Git 和本地来源要求在 `.omp-plugin/marketplace.json`（首选）或 `.claude-plugin/marketplace.json`（兼容 Claude Code 的回退位置）包含目录。直接目录 URL 只缓存 JSON 目录；URL 来源目录中的插件不能使用 `"./plugins/foo"` 这样的相对字符串来源。

## 目录格式（marketplace.json） \{#catalog-format-marketplacejson}

市场目录位于仓库根目录的 `.omp-plugin/marketplace.json`。当 omp 是唯一预期使用方时，优先使用此路径。要保持 Claude Code 兼容性（omp 从两个路径加载的结构相同），则改为发布在 `.claude-plugin/marketplace.json`，当 `.omp-plugin/marketplace.json` 缺失时，omp 使用它作为回退。仓库可以同时提供两者：omp 读取 `.omp-plugin/` 副本，Claude Code 读取 `.claude-plugin/` 副本。两种方式采用相同的目录格式：

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

| 字段 | 描述 |
| --- | --- |
| `name` | 市场名称。使用 ASCII 字母、数字、连字符和点号。要求以字母或数字开头和结尾。最多 64 个字符。 |
| `owner.name` | 市场所有者名称 |
| `plugins` | 插件条目数组 |

顶层的 `metadata.description`、`metadata.version` 和 `metadata.pluginRoot` 可选。`metadata.pluginRoot` 指定裸名称插件来源（`"my-plugin"`）的解析目录；以 `./` 开头的来源从市场根目录解析。为 omp 早期规则编写的目录仍可继续安装，该早期规则会将 `pluginRoot` 前置到 `./` 来源上：若某个 `./` 来源在根目录下不存在或不是目录，则会在 `pluginRoot` 下尝试。其他文件系统错误会停止验证。

安装版本解析依次尝试目录的 `version`、`.claude-plugin/plugin.json`、根目录的 `plugin.json`，再到 `package.json`；随后回退为来源定义 SHA 的前七个字符或 `0.0.0`。缓存路径中使用的版本要求由 1-128 个 ASCII 字母/数字或 `._+-` 组成，且不能包含 `..`。

### 插件条目字段 \{#plugin-entry-fields}

| 字段 | 必填 | 描述 |
| --- | --- | --- |
| `name` | 是 | 插件名称（与市场名称规则相同） |
| `source` | 是 | 插件所在位置（见下文） |
| `description` | 否 | 简短描述 |
| `version` | 否 | 版本字符串；安装版本回退到插件清单、来源 SHA，再到 `0.0.0` |
| `author` | 否 | `{ name, email? }` |
| `homepage` | 否 | URL |
| `repository` | 否 | 仓库 URL/字符串 |
| `license` | 否 | 许可证字符串 |
| `keywords` | 否 | 关键词字符串数组 |
| `category` | 否 | 分类字符串（例如 `development`、`productivity`、`security`） |
| `tags` | 否 | 标签字符串数组 |
| `strict` | 否 | 布尔元数据标志；保留，但安装/运行时逻辑不使用 |
| `commands` | 否 | 命令元数据；保留，但运行时命令从已安装插件目录树发现 |
| `agents` | 否 | 智能体元数据；保留，但市场安装不使用 |
| `hooks` | 否 | 钩子元数据；保留，但运行时钩子从已安装插件目录树发现 |
| `mcpServers` | 否 | MCP 元数据；此处保留；运行时 MCP 配置来自插件清单/目录树 |
| `lspServers` | 否 | 内联映射或插件内路径；安装时复制到 `.lsp.json` |
| `dapAdapters` | 否 | 内联映射或插件内 JSON/YAML 路径；复制到 `.dap.json`、`.dap.yaml` 或 `.dap.yml` |

### 插件来源格式 \{#plugin-source-formats}

`source` 字段支持以下格式。字符串来源要求以 `./` 开头，或在设置了 `metadata.pluginRoot` 时使用裸名称，且在市场根目录内解析：

**相对路径**（在市场仓库内，从其根目录起）：

```json
"source": "./plugins/my-plugin"
```

**裸名称**（`metadata.pluginRoot` 下的单个目录名；当 `"pluginRoot": "./plugins"` 时，`"my-plugin"` 为 `./plugins/my-plugin`）：

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

**Git 子目录**（单体仓库）：

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

当前安装器会以 `npm plugin sources are not yet supported` 拒绝 npm 市场来源；请使用相对路径、GitHub、URL 或 git-subdir 来源。

无效的目录 JSON 或无效的顶层必填字段会导致目录被拒绝。无效的插件条目会被记录并跳过，使其他有效条目仍然可用。目录内的插件名称，以及已配置的市场名称，不得出现忽略大小写后的冲突，即使在区分大小写的文件系统上也是如此。

## 更新、移除与作用域 \{#updates-removal-and-scope}

- `/marketplace update [name]` 只刷新目录，不重新安装插件。
- 省略 `--scope` 时，`omp plugin upgrade name@marketplace` 会重新安装每个已安装作用域。当插件同时存在于两个作用域时，`/marketplace upgrade name@marketplace`、卸载及启用/禁用要求提供 `--scope user|project`。
- 升级所有插件时，只比较声明了 `version` 的目录条目。Semver 版本要求更新；非 semver 版本在不相等时视为已变更。每个已安装作用域独立检查。单个插件失败会被跳过，因此全插件升级可能部分成功。升级所有插件时，CLI 的 `--scope` 被忽略。
- 重装/升级保留禁用状态、功能选择和设置。用户与项目安装共享以版本为键的缓存目录，因此强制重装同一版本会替换两个作用域共同使用的内容。与其他插件发生运行时包名和缓存路径冲突时会被拒绝。
- `marketplace.autoUpdate` 控制启动检查：`off`、`notify`（默认）或 `auto`。版本检查前，会尽力刷新超过 24 小时的目录。尽管名为 `notify`，当前该模式只将可用更新写入调试日志，不显示面向用户的通知。
- 移除市场会移除其注册表条目和目录缓存；不会卸载已缓存并注册的插件。

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

锁文件还保存插件设置，包括插件标记为 `secret` 的值，因此写入时使用仅所有者可访问的权限（`0600`）。

## 命名规则 \{#naming-rules}

市场和插件名称要求：

- 以 ASCII 字母或数字开头和结尾
- 只包含 ASCII 字母、数字、连字符和点号
- 最多 64 个字符

构建插件 ID（`name@marketplace`）时强制执行总计 128 个字符的限制。名称保留大小写；引用插件时使用目录中的拼写。

有效示例：`my-plugin`、`code-review`、`wordpress.com`、`ai-firstify`、`MixedCase`
无效示例：`-bad`、`bad-`、`.bad`、`under_score`
