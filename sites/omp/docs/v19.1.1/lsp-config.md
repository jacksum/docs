---
title: "LSP 配置"
description: "Oh My Pi v19.1.1 仓库文档：LSP 配置。"
---

# OMP 中的 LSP 配置 \{#lsp-configuration-in-omp}

本指南说明如何为 OMP 编程代理配置语言服务器。

以以下代码中的定义为准：

- 服务器配置类型：`packages/coding-agent/src/lsp/types.ts`（`ServerConfig`）
- 配置加载器：`packages/coding-agent/src/lsp/config.ts`
- 内置服务器定义：`packages/coding-agent/src/lsp/defaults.json`

## 自动检测 \{#auto-detection}

OMP 以内置服务器定义为基础，应用配置覆盖项，然后仅保留同时符合以下两个条件的已启用服务器：

1. 当前工作目录包含该服务器的 `rootMarkers` 中指定的至少一项。
2. 服务器的可执行文件可用：先在受支持的项目本地可执行文件目录中查找（例如 `node_modules/.bin/`、Python 虚拟环境、Ruby binstub，以及 Go 项目的 `bin/`），再到 `$PATH` 中查找。

启动时只在当前工作目录检测根标记，不搜索上级目录。`*.cabal` 等通配符标记只匹配工作目录下的直接条目，不递归查找。常见环境无需配置；完整的内置定义见 [`defaults.json`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/lsp/defaults.json)。

## 配置文件位置 \{#config-file-locations}

OMP 合并来自多个来源的 LSP 配置，优先级从低到高如下：

| 优先级 | 位置 |
| -----: | ---- |
| 最低 | `~/lsp.json`、`~/.lsp.json`、`~/lsp.yaml`、`~/.lsp.yaml`、`~/lsp.yml`、`~/.lsp.yml` |
| | 插件的 LSP 配置（插件市场或 `--plugin-dir` 的根目录） |
| | 用户配置目录：当前生效的原生代理目录，然后是 `~/.claude/lsp.*`、`~/.codex/lsp.*`、`~/.gemini/lsp.*` |
| | 工作目录下的配置目录：`<cwd>/.omp/lsp.*`、`<cwd>/.claude/lsp.*`、`<cwd>/.codex/lsp.*`、`<cwd>/.gemini/lsp.*` |
| 最高 | 工作目录根目录：`<cwd>/lsp.*` 和 `<cwd>/.lsp.*` |

在列出配置目录的各行中，目录按优先级从高到低排列。每个位置都接受 `.json`、`.yaml` 和 `.yml`，包括隐藏文件变体。同一位置存在多个变体时，优先级从高到低依次为 `lsp.json`、`.lsp.json`、`lsp.yaml`、`.lsp.yaml`、`lsp.yml`、`.lsp.yml`。所有可读取的变体都会合并，不会在找到第一个文件后停止查找。

合并以单个服务器为单位，且仅做浅层合并：优先级较高的服务器对象只覆盖其顶层字段。对于 `settings`、`initOptions`、`capabilities` 和 `workspaceReadyTimings` 等值为对象的字段，高优先级的值会整个替换低优先级的值，不做深度合并。配置覆盖文件中未列出的服务器继续使用内置默认配置。

原生用户配置目录就是当前生效的代理目录：该目录取决于 `PI_CONFIG_DIR`、当前生效的配置档案，以及在使用默认配置档案时的 `PI_CODING_AGENT_DIR`；`~/.omp/agent/lsp.json` 是默认配置档案下的路径写法。Claude 的用户目录遵循 `CLAUDE_CONFIG_DIR`。其他代理的用户配置来源（Claude、Codex、Gemini）只有在配置中启用对应的提供方后才会纳入；设置 `CLAUDE_CONFIG_DIR` 也会启用 Claude，除非显式禁用。项目和工作目录中的配置来源不会向上查找，也不受上述用户配置来源启用规则的限制。

**推荐位置：**

- 用户级偏好设置：当前生效的原生代理目录中的 `lsp.json`
- 项目专用的配置覆盖项：`<cwd>/.omp/lsp.json`

> **注意：** 没有单独的“已配置服务器”模式。内置默认配置、部分配置覆盖项和新增的自定义服务器都按同样的根标记、可执行文件和 `disabled` 条件筛选。只设置 `idleTimeoutMs` 不会改变选中的服务器。

配置按工作目录缓存。更改 LSP 配置文件、根标记或已安装的可执行文件后，请调用 `lsp` 工具并传入 `action: "reload", file: "*"`（也可省略 `file`），以重新读取配置并关闭配置已过时的客户端。

## 文件结构 \{#file-shape}

支持 JSON 和 YAML。顶层对象既可使用 `servers` 键包裹服务器映射，也可直接使用扁平映射：

```json
{
  "servers": {
    "server-name": { ... }
  },
  "idleTimeoutMs": 300000
}
```

或者（扁平形式，不使用 `servers` 包裹）：

```json
{
  "server-name": { ... },
  "idleTimeoutMs": 300000
}
```

顶层键：

- `servers`：从服务器名称到 `ServerConfig` 的映射（可选的外层键，扁平形式与之等效）
- `idleTimeoutMs`：语言服务器空闲达到指定毫秒数后关闭；若省略此项，或设为零或负数，则不会因空闲而关闭

不要混用包裹形式和扁平形式的服务器条目：当 `servers` 为对象时，其他同级键除 `idleTimeoutMs` 外不会被当作服务器条目。

## ServerConfig 字段 \{#serverconfig-fields}

| 字段 | 类型 | 新增服务器时是否必填 | 说明 |
| ---- | ---- | -------------------: | ---- |
| `command` | `string` | 是 | 可执行文件名（通过本地可执行文件目录或 PATH 解析），或绝对路径 |
| `args` | `string[]` | 否 | 传给可执行文件的参数 |
| `fileTypes` | `string[]` | 是 | 扩展名或文件基名，例如 `[".ts", ".tsx", "Dockerfile"]`；不区分大小写，开头的点可省略 |
| `languageId` | `string` | 否 | 在 `textDocument/didOpen` 中发送的 LSP 语言 ID；省略时根据文件路径推断 |
| `rootMarkers` | `string[]` | 是 | 用于标识项目根目录的文件或目录；支持 `*.cabal` 等单层通配符模式 |
| `initOptions` | `object` | 否 | 在 LSP 握手时作为 `initializationOptions` 发送 |
| `settings` | `object` | 否 | 通过 `workspace/didChangeConfiguration` 推送 |
| `disabled` | `boolean` | 否 | 设为 `true` 可禁用此服务器 |
| `warmupTimeoutMs` | `number` | 否 | 预热时的初始化超时时间，单位为毫秒（默认 5000；内置的 marksman 使用 2000） |
| `isLinter` | `boolean` | 否 | 专用代码检查器或格式化工具：在单服务器操作中作为备用选择；`rename_file` 会查询所有匹配的 LSP 服务器；`formatOnWrite` 优先选用此类服务器 |
| `watchFiles` | `boolean` | 否 | 向服务器声明支持动态注册 `workspace/didChangeWatchedFiles`：OMP 监视服务器注册的文件，服务器自身不运行文件监视器。默认开启；设为 `false` 可保留服务器自身的文件监视器。共享（mux）服务器沿用启动它的会话的设置；后续会话复用该服务器时，无论自身如何设置，都沿用该服务器的文件监视机制 |
| `capabilities` | `object` | 否 | 可按需启用的服务器专有功能；见[能力](#capabilities) |
| `workspaceReadyTimings` | `object` | 否 | rust-analyzer 工作区就绪时间参数的高级配置覆盖项；见下文 |

为内置服务器指定配置覆盖项时，可以省略必填字段，因为验证前会先继承它们。全新服务器通常需要同时提供这三个字段。`resolvedCommand` 和 `createClient` 由运行时管理，不得配置。

对于兼容插件格式的定义，`initializationOptions` 可在 `initOptions` 不是对象时使用。`extensionToLanguage` 可用自身的键提供 `fileTypes`，并在缺少 `rootMarkers` 时将其设为默认值 `["."]`。该映射的值不用于设置各扩展名的语言 ID。插件市场条目可以提供内联的 `lspServers` 映射，或指向插件根目录内配置文件的路径。

### 能力 \{#capabilities}

`capabilities` 对象用于启用 OMP 针对各服务器支持的可选专有功能：

```json
{
	"capabilities": {
		"flycheck": true,
		"ssr": true,
		"expandMacro": true,
		"runnables": true,
		"relatedTests": true
	}
}
```

所有字段均为可选的布尔值，目前由 `rust-analyzer` 使用。

### rust-analyzer 就绪时间参数的高级设置 \{#advanced-rust-analyzer-readiness-timings}

`workspaceReadyTimings` 用于调整 rust-analyzer 工作区就绪检测的轮询时间参数：

```json
{
	"servers": {
		"rust-analyzer": {
			"workspaceReadyTimings": {
				"timeoutMs": 30000,
				"pollMs": 250,
				"settleMs": 2000,
				"statusRequestTimeoutMs": 2000
			}
		}
	}
}
```

这四个字段都是可选的，单位为毫秒。默认值为 `timeoutMs: 5000`、`pollMs: 100`、`settleMs: 2000` 和 `statusRequestTimeoutMs: 1000`。这些是高级调节选项，常规配置应使用默认值。

## 常见配置示例 \{#common-recipes}

### 覆盖内置服务器的设置 \{#override-a-built-in-servers-settings}

部分配置覆盖项会合并到内置默认配置中。只需指定要更改的字段。

```json
{
	"servers": {
		"typescript-language-server": {
			"args": ["--stdio", "--log-level", "4"]
		}
	}
}
```

```yaml
servers:
   gopls:
      settings:
         gopls:
            gofumpt: false
            staticcheck: false
```

### 禁用内置服务器 \{#disable-a-built-in-server}

```json
{
	"servers": {
		"eslint": {
			"disabled": true
		}
	}
}
```

### 注册自定义服务器 \{#register-a-custom-server}

采用原生格式新增服务器时，`command`、`fileTypes` 和 `rootMarkers` 均不能为空。配置加载器会忽略无效的新定义并发出警告；配置覆盖项无效时，保留原有服务器定义。如果配置文件不可读取，或其中的 JSON/YAML 无效，加载器会忽略该文件并继续处理其余来源。

```json
{
	"servers": {
		"my-lsp": {
			"command": "my-lsp-server",
			"args": ["--stdio"],
			"fileTypes": [".xyz"],
			"rootMarkers": [".xyz-project", ".git"]
		}
	}
}
```

### 设置全局空闲超时 \{#set-a-global-idle-timeout}

关闭超过五分钟未活动的语言服务器：

```json
{
	"idleTimeoutMs": 300000
}
```

### 仅在单个项目中禁用服务器，保留全局设置 \{#disable-a-server-for-one-project-keep-it-globally}

将配置覆盖项放在 `<project>/.omp/lsp.json` 中：

```json
{
	"servers": {
		"pylsp": {
			"disabled": true
		}
	}
}
```

`~/.omp/agent/lsp.json` 中的用户级配置不受影响；只在此项目中禁用 pylsp。

## 内置服务器列表 \{#built-in-server-list}

以下服务器随 `defaults.json` 一同提供，可自动检测：

| 服务器键 | 语言 | 可执行文件 |
| -------- | ---- | ---------- |
| `rust-analyzer` | Rust | `rust-analyzer` |
| `clangd` | C, C++, ObjC, CUDA | `clangd` |
| `zls` | Zig | `zls` |
| `gopls` | Go | `gopls` |
| `typescript-language-server` | TypeScript, JavaScript (≤ 6) | `typescript-language-server` |
| `typescript-native` | TypeScript, JavaScript (7+) | `tsc --lsp --stdio` |
| `denols` | TypeScript, JavaScript (Deno) | `deno` |
| `biome` | TS/JS/JSON/CSS（代码检查器） | `biome` |
| `eslint` | TS/JS/Vue/Svelte（代码检查器） | `vscode-eslint-language-server` |
| `vscode-html-language-server` | HTML | `vscode-html-language-server` |
| `vscode-css-language-server` | CSS, SCSS, Less | `vscode-css-language-server` |
| `vscode-json-language-server` | JSON | `vscode-json-language-server` |
| `tailwindcss` | HTML, CSS, TS/JS | `tailwindcss-language-server` |
| `svelte` | Svelte | `svelteserver` |
| `vue-language-server` | Vue | `vue-language-server` |
| `astro` | Astro | `astro-ls` |
| `pyright` | Python | `pyright-langserver` |
| `basedpyright` | Python | `basedpyright-langserver` |
| `pylsp` | Python | `pylsp` |
| `ty` | Python | `ty` |
| `ruff` | Python（代码检查器） | `ruff` |
| `jdtls` | Java | `jdtls` |
| `kotlin-lsp` | Kotlin | `kotlin-lsp` |
| `metals` | Scala | `metals` |
| `hls` | Haskell | `haskell-language-server-wrapper` |
| `ocamllsp` | OCaml | `ocamllsp` |
| `elixirls` | Elixir | `elixir-ls` |
| `expert` | Elixir | `expert` |
| `erlangls` | Erlang | `erlang_ls` |
| `gleam` | Gleam | `gleam` |
| `solargraph` | Ruby | `solargraph` |
| `ruby-lsp` | Ruby | `ruby-lsp` |
| `rubocop` | Ruby（代码检查器） | `rubocop` |
| `bashls` | Bash, Zsh | `bash-language-server` |
| `lua-language-server` | Lua | `lua-language-server` |
| `intelephense` | PHP | `intelephense` |
| `phpactor` | PHP | `phpactor` |
| `omnisharp` | C# | `omnisharp` |
| `yamlls` | YAML | `yaml-language-server` |
| `terraformls` | Terraform | `terraform-ls` |
| `dockerls` | Dockerfile | `docker-langserver` |
| `helm-ls` | Helm | `helm_ls` |
| `nixd` | Nix | `nixd` |
| `nil` | Nix | `nil` |
| `ols` | Odin | `ols` |
| `dartls` | Dart | `dart` |
| `marksman` | Markdown | `marksman` |
| `texlab` | LaTeX | `texlab` |
| `graphql` | GraphQL | `graphql-lsp` |
| `prismals` | Prisma | `prisma-language-server` |
| `vimls` | Vim 脚本 | `vim-language-server` |
| `emmet-language-server` | HTML, CSS, JSX | `emmet-language-server` |
| `sourcekit-lsp` | Swift | `sourcekit-lsp` |
| `swiftlint` | Swift（代码检查器） | `swiftlint` |
| `tlaplus` | TLA+ | `tlapm_lsp` |

每个项目只保留一个 TypeScript 服务器。如果找到的 `tsc` 来自不含 `lib/tsserver.js` 的 TypeScript 安装（TypeScript 7 及以上），或者它报告的版本为 7 及以上且来自不含 npm `package.json` 的安装（例如 nixpkgs），则保留 `typescript-native`，舍弃 `typescript-language-server`；否则舍弃 `typescript-native`，因为旧版 `tsc` 不接受 `--lsp`。
