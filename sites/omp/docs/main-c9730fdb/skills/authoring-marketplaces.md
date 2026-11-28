---
{
  "name": "authoring-marketplaces",
  "description": "创建新的 omp 市场时使用。涵盖 marketplace.json 模式、来源类型、安装命令和发布。",
  "title": "编写市场"
}
---


# 编写市场 \{#authoring-marketplaces}

市场是一个 Git 仓库（或本地目录），在 `.omp-plugin/marketplace.json`（omp 专用目录的首选位置）或 `.claude-plugin/marketplace.json`（兼容 Claude Code，作为回退位置）包含目录文件。任何人都可以编写市场。用户通过 `/marketplace add owner/repo` 添加市场，然后从中安装各个插件。

## 最小可用市场 \{#minimum-viable-marketplace}

```
my-marketplace/
  .claude-plugin/
    marketplace.json
  plugins/
    my-plugin/
      skills/
        my-skill/
          SKILL.md
```

```json
{
	"name": "my-marketplace",
	"owner": { "name": "Your Name" },
	"plugins": [
		{
			"name": "my-plugin",
			"description": "What it does",
			"source": "./plugins/my-plugin"
		}
	]
}
```

推送到 GitHub。用户通过以下命令安装：

```
/marketplace add your-github-username/my-marketplace
/marketplace install my-plugin@my-marketplace
```

## marketplace.json 模式 \{#marketplacejson-schema}

目录文件位于仓库根目录中的 `.omp-plugin/marketplace.json` 或 `.claude-plugin/marketplace.json`。omp 优先使用 `.omp-plugin/` 路径，再回退到 Claude 路径；仓库可以同时发布二者，以从同一源代码树提供特定工具的目录。

### 顶层字段 \{#top-level-fields}

| 字段 | 必需 | 描述 |
| --- | --- | --- |
| `name` | 是 | 市场名称。ASCII 字母数字、连字符、点号。必须以字母数字开头和结尾。最多 64 个字符。忽略大小写后相同的市场名称不能共存。 |
| `owner` | 是 | 至少包含 `owner.name`（字符串）的对象 |
| `owner.name` | 是 | 市场所有者名称 |
| `owner.email` | 否 | 所有者联系邮箱 |
| `plugins` | 是 | 插件条目数组（见下文） |
| `metadata.description` | 否 | 市场简短描述 |
| `metadata.version` | 否 | 目录元数据版本字符串 |
| `metadata.pluginRoot` | 否 | 裸名称来源的目录，以及市场根目录下缺失的 `./` 来源的旧版回退目录 |
| 额外顶层字段 | 否 | 解析器会保留，但市场安装/运行时逻辑不使用 |

### 插件条目字段 \{#plugin-entry-fields}

| 字段 | 必需 | 描述 |
| --- | --- | --- |
| `name` | 是 | 插件名称（命名规则与市场名称相同）；目录中忽略大小写后重复的条目会被跳过 |
| `source` | 是 | 查找插件的位置，字符串或对象（见下文来源类型） |
| `description` | 否 | 插件简短描述 |
| `version` | 否 | 版本字符串；依次回退到 `.claude-plugin/plugin.json`、根目录 `plugin.json`、`package.json`、来源的显式 SHA（前 7 个字符），最后为 `0.0.0` |
| `author` | 否 | `{ name, email? }` |
| `homepage` | 否 | URL |
| `category` | 否 | 例如 `development`、`productivity`、`security` |
| `tags` / `keywords` | 否 | 字符串标签/关键词数组 |
| `repository` | 否 | 仓库 URL |
| `license` | 否 | 许可证字符串 |
| `strict` | 否 | 布尔元数据标志；会保留，但安装/运行时逻辑不使用 |
| `commands`, `agents`, `hooks`, `mcpServers` | 否 | 解析器保留的目录元数据；运行时发现来自已安装的插件树和清单 |
| `skills` | 否 | 当插件来源恰为 `"./"` 时，用于技能路径选择的额外目录字段；其他情况下，运行时技能发现使用插件树/清单 |
| `lspServers` | 否 | 内联服务器映射或插件内的路径；安装会写入 `.lsp.json` |
| `dapAdapters` | 否 | 内联适配器映射或插件内的 JSON/YAML 路径；安装会写入 `.dap.json`、`.dap.yaml` 或 `.dap.yml` |

### 完整目录示例 \{#full-catalog-example}

```json
{
	"$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
	"name": "acme-plugins",
	"owner": {
		"name": "Acme Corp",
		"email": "plugins@acme.example"
	},
	"metadata": {
		"description": "Official Acme plugins for omp"
	},
	"plugins": [
		{
			"name": "acme-linter",
			"description": "Enforce Acme coding standards",
			"category": "development",
			"source": "./plugins/linter"
		},
		{
			"name": "acme-deploy",
			"description": "One-command deploy to Acme cloud",
			"category": "devops",
			"source": {
				"source": "github",
				"repo": "acme-corp/omp-deploy-plugin",
				"ref": "main"
			}
		}
	]
}
```

## 插件来源类型 \{#plugin-source-types}

### 1. 相对路径字符串 \{#1-relative-path-string}

指向市场仓库自身内部的子目录。必须以 `./` 开头，除非它是 `metadata.pluginRoot` 下的裸名称。

```json
"source": "./plugins/my-plugin"
```

路径相对于市场仓库根目录解析。超出仓库根目录的路径穿越会被拒绝。

使用 `metadata.pluginRoot` 避免重复公共前缀。裸名称（单个目录名，不含 `/`）在其下解析；以 `./` 开头的来源仍从仓库根目录解析，而 `team-a/plugin-c` 这样的嵌套名称仍需要 `./` 前缀：

```json
{
	"metadata": { "pluginRoot": "./plugins" },
	"plugins": [
		{ "name": "plugin-a", "source": "plugin-a" },
		{ "name": "plugin-b", "source": "./plugins/plugin-b" }
	]
}
```

两个条目都会解析到 `./plugins/<name>`。这与 Claude Code 一致。

### 2. Git URL \{#2-git-url}

完整的 Git 仓库 URL。可选固定到分支/标签（`ref`）或精确提交（`sha`）：

```json
"source": {
  "source": "url",
  "url": "https://github.com/org/my-plugin.git",
  "ref": "main",
  "sha": "a1b2c3d4..."
}
```

### 3. GitHub 简写 \{#3-github-shorthand}

GitHub 仓库的简写。在功能上等同于 Git URL，但更简洁：

```json
"source": {
  "source": "github",
  "repo": "org/my-plugin",
  "ref": "v2.1.0",
  "sha": "a1b2c3d4..."
}
```

### 4. Git 子目录（monorepo） \{#4-git-subdirectory-monorepo}

适用于位于较大仓库子目录中的插件。`url` 接受完整 HTTPS URL 或 GitHub `owner/repo` 简写：

```json
"source": {
  "source": "git-subdir",
  "url": "https://github.com/org/monorepo.git",
  "path": "packages/my-plugin",
  "ref": "main",
  "sha": "a1b2c3d4..."
}
```

`path` 必须解析到克隆仓库内部，目录逃逸会被拒绝。

### 5. NPM 包 \{#5-npm-package}

将插件声明为 npm 包。`version` 可选：

```json
"source": {
  "source": "npm",
  "package": "@acme/omp-plugin",
  "version": "1.2.0"
}
```

> 注意：目录解析接受 npm 插件来源，但安装会拒绝它们并提示 `npm plugin sources are not yet supported`。目前请使用相对路径或基于 Git 的来源。

## 插件结构 \{#plugin-structure}

插件目录（无论来源类型如何）在约定位置提供内容，这些内容都可选：

```
my-plugin/
  skills/<name>/SKILL.md         ← skills
  commands/*.md                  ← slash commands
  agents/*.md                    ← subagent definitions
  hooks/pre/, hooks/post/        ← hooks
  tools/                         ← custom tools
  .mcp.json                      ← MCP server definitions (default location)
  .claude-plugin/plugin.json     ← optional paths for skills/commands and other manifest metadata
  package.json                   ← optional version and `omp.extensions`
  README.md                      ← recommended: description + usage
```

> 注意：MCP 服务器也可以通过清单的 `mcpServers` 字段声明，可以是内联服务器映射，也可以是插件根目录内配置文件的路径（`{ "mcpServers": "./mcp-omp.json" }`）。omp 先读取 `.omp-plugin/plugin.json`，再读取 `.claude-plugin/plugin.json`；清单声明会替换默认的 `.mcp.json`，而不是与其合并，因此一个已发布的树可以携带针对不同 harness 的 MCP 配置。

> 注意：通过 `package.json` 的 `omp.extensions` 声明的扩展模块**会**从市场安装中加载，安装会将缓存的插件符号链接到该作用域的 `node_modules`，并在 `omp-plugins.lock.json` 中记录它，这与 npm 安装和通过 `omp plugin link` 链接的插件使用相同的运行时接口。

## 安装命令 \{#install-command}

```
/marketplace install name@marketplace-name
/marketplace install --force name@marketplace-name     # reinstall
/marketplace install --scope project name@marketplace  # project-scoped
```

等效 CLI 命令：

```
omp plugin marketplace add owner/repo
omp plugin install name@marketplace-name
```

作用域行为：

- **user**（默认）：安装到用户插件数据根目录的 `installed_plugins.json`（默认为 `~/.omp/plugins/installed_plugins.json`），在所有项目中可用。在 Linux 和 macOS 上，`omp config init-xdg` 会初始化 XDG 根目录（但不会将数据迁移进去）；设置 XDG 变量后，已初始化的根目录会将新的用户状态存储在 `$XDG_DATA_HOME/omp/plugins/installed_plugins.json`。
- **project**：安装到 `<project>/.omp/plugins/installed_plugins.json`，仅在该项目中可用

已启用的项目作用域安装会遮蔽相同 `name@marketplace` ID 的已启用用户作用域安装。已禁用的项目副本会让用户副本保持活动状态。

安装与发现细节：

- 无效插件条目会被记录并跳过；无效 JSON 或必需顶层字段无效会导致目录被拒绝。
- 可以通过 `.claude-plugin/plugin.json` 重新映射 `skills/` 和 `commands/`。声明的技能路径通常会添加到默认路径；对于目录来源恰为 `"./"` 的插件，它们会替换默认路径。声明的 `commands`（首选）或 `slash-commands` 会替换默认路径，除非显式包含 `./commands`。插件根目录之外的路径会被忽略并发出警告。
- 目录中的 `lspServers` 和 `dapAdapters` 值会在安装期间实体化。除此之外，目录中的 `commands`、`agents`、`hooks` 和 `mcpServers` 都是元数据，不会重新映射运行时发现。
- 带标准根目录 `plugin.json` 的可移植 Agent Plugins 包使用固定的 `skills/<name>/SKILL.md` 和 `mcp.json` 位置，而非旧版技能/MCP 清单。其技能 frontmatter 会经过严格验证，每个技能/MCP 资源都必须解析到包根目录内部。有效的可移植包仍可使用其他 OMP 专用组件；存在致命错误的标准清单会导致包被拒绝。

## 命名规则 \{#naming-rules}

市场名称和插件名称必须：

- 仅包含 ASCII 字母（大小写均可）、数字、连字符（`-`）和点号（`.`）
- 以 ASCII 字母或数字开头和结尾
- 最多 64 个字符

插件 ID（`name@marketplace`）总长度必须不超过 128 个字符。

有效：`my-plugin`、`code-review`、`acme.tools`、`ai-v2`、`HAS-CAPS`
无效：`-bad-start`、`bad-end-`、`.dot-start`、`Under_score`

名称保留其原始拼写，但冲突检查不区分大小写：`My-Plugin` 和 `my-plugin` 不能作为同一目录中的不同条目。优先使用小写，以获得可预测的 ID。

## 发布工作流 \{#publishing-workflow}

1. 在新 Git 仓库的 `.omp-plugin/marketplace.json`（仅限 omp）或 `.claude-plugin/marketplace.json`（与 Claude Code 共享）处创建 `marketplace.json`。
2. 添加指向子目录（或外部来源）的插件条目。
3. 推送到 GitHub。
4. 分享 `owner/repo` 字符串。用户通过 `/marketplace add owner/repo` 添加它。
5. 更新目录后，用户运行 `/marketplace update your-marketplace-name` 拉取最新内容。

发布前在本地测试：

```
/marketplace add ./path/to/my-marketplace
```

本地路径来源也接受 `~/` 和绝对路径。

## 延伸阅读 \{#further-reading}

- `docs/marketplace.md`：市场系统内部机制、磁盘布局、命令参考
- `docs/skills/authoring-extensions.md`：如何编写插件内的扩展模块
- `docs/skills/examples/mini-marketplace/`：最小可运行市场示例
