---
title: "OMP 中的 LSP 配置"
description: "Oh My Pi 官方仓库文档：OMP 中的 LSP 配置。"
---

# OMP 中的 LSP 配置 \{#lsp-configuration-in-omp}

本指南说明如何为 OMP 编码智能体配置语言服务器。

代码中的权威来源：

- 服务器配置类型：`packages/coding-agent/src/lsp/types.ts`（`ServerConfig`）
- 配置加载器：`packages/coding-agent/src/lsp/config.ts`
- 内置服务器定义：`packages/coding-agent/src/lsp/defaults.json`

## 自动检测 \{#auto-detection}

OMP 从内置服务器定义开始，应用配置覆盖，然后保留同时满足以下两个条件的已启用服务器：

1. 当前工作目录中至少包含服务器的一个 `rootMarkers`。
2. 服务器二进制文件可用，先检查支持的项目本地二进制目录（例如 `node_modules/.bin/`、Python 虚拟环境、Ruby binstub，以及 Go 的项目 `bin/`），再检查 `$PATH`。

启动时的根标记检测仅针对 cwd，不搜索父目录。`*.cabal` 等通配符标记匹配 cwd 直接包含的条目，不递归。常见设置无需配置；完整的内置集合参见 [`defaults.json`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/lsp/defaults.json)。

## 配置文件位置 \{#config-file-locations}

OMP 从多个来源合并 LSP 配置，优先级由低到高：

| 优先级 | 位置 |
| ---: | --- |
| 最低 | `~/lsp.json`、`~/.lsp.json`、`~/lsp.yaml`、`~/.lsp.yaml`、`~/lsp.yml`、`~/.lsp.yml` |
|  | 插件 LSP 配置（市场 / `--plugin-dir` 根目录） |
|  | 用户配置目录：当前原生智能体目录（`~/.omp/agent/lsp.*`） |
|  | Cwd 配置目录：`<cwd>/.omp/lsp.*` |
| 最高 | Cwd 根目录：`<cwd>/lsp.*` 和 `<cwd>/.lsp.*` |

每个位置都接受 `.json`、`.yaml` 和 `.yml`，包括隐藏变体。当同一位置存在多个变体时，优先级由高到低为 `lsp.json`、`.lsp.json`、`lsp.yaml`、`.lsp.yaml`、`lsp.yml`、`.lsp.yml`。所有可读的变体都会合并；并非只搜索第一个文件。

合并按服务器进行浅合并：高优先级的服务器对象只覆盖其顶层字段，但 `settings`、`initOptions`、`capabilities` 和 `workspaceReadyTimings` 等对象值字段会整体替换低优先级的值，而非深度合并。覆盖文件中未出现的服务器保留内置默认值。

原生用户配置目录是当前智能体目录：它遵循 `PI_CONFIG_DIR`、当前配置档案，以及默认配置档案中的 `PI_CODING_AGENT_DIR`；`~/.omp/agent/lsp.json` 是默认配置档案下的路径形式。

**推荐位置：**

- 用户全局偏好 → 当前原生智能体目录的 `lsp.json`
- 项目专属覆盖 → `<cwd>/.omp/lsp.json`

> **注意：** 不存在独立的已配置服务器模式：内置默认值、部分覆盖和新增自定义服务器都经过同样的根标记/二进制文件/`disabled` 过滤。只设置 `idleTimeoutMs` 的配置不会改变服务器选择。

配置按 cwd 缓存。修改 LSP 文件、根标记或已安装的二进制文件后，调用 `lsp` 工具并传入 `action: "reload", file: "*"`（或省略 `file`），以重新读取配置并关闭配置不再匹配当前状态的客户端。

## 文件结构 \{#file-shape}

JSON 和 YAML 均可接受。顶层对象可以使用 `servers` 包装键，也可以直接使用扁平映射：

```json
{
  "servers": {
    "server-name": { ... }
  },
  "idleTimeoutMs": 300000
}
```

或使用扁平形式，不带 `servers` 包装：

```json
{
  "server-name": { ... },
  "idleTimeoutMs": 300000
}
```

顶层键：

- `servers`：服务器名称到 `ServerConfig` 的映射（可选包装；扁平形式等效）
- `idleTimeoutMs`：空闲语言服务器在经过此毫秒数后关闭；省略时默认为 `900000`（15 分钟）；零或负数禁用空闲关闭

不要混用包装形式和扁平服务器条目：当 `servers` 是对象时，除 `idleTimeoutMs` 外的同级键不会被视为服务器。

## ServerConfig 字段 \{#serverconfig-fields}

| 字段 | 类型 | 新服务器是否必填 | 说明 |
| --- | --- | ---: | --- |
| `command` | `string` | 是 | 二进制文件名称（通过本地二进制目录 / PATH 解析）或绝对路径 |
| `args` | `string[]` | 否 | 传给二进制文件的参数 |
| `fileTypes` | `string[]` | 是 | 扩展名或基本文件名，例如 `[".ts", ".tsx", "Dockerfile"]`；不区分大小写，可带或不带前导点 |
| `languageId` | `string` | 否 | 在 `textDocument/didOpen` 中发送的 LSP 语言 ID；省略时从文件路径推断 |
| `rootMarkers` | `string[]` | 是 | 表示项目根目录的文件/目录；支持 `*.cabal` 等单层通配符模式 |
| `initOptions` | `object` | 否 | 在 LSP 握手期间作为 `initializationOptions` 发送 |
| `settings` | `object` | 否 | 通过 `workspace/didChangeConfiguration` 推送 |
| `disabled` | `boolean` | 否 | 设为 `true` 以禁用此服务器 |
| `warmupTimeoutMs` | `number` | 否 | 预热初始化超时，单位毫秒（默认 5000；内置 marksman 使用 2000） |
| `isLinter` | `boolean` | 否 | 专用检查器/格式化器：单服务器操作的回退选择；`rename_file` 查询所有匹配的 LSP 服务器；`formatOnWrite` 优先选用 |
| `watchFiles` | `boolean` | 否 | 声明支持 `workspace/didChangeWatchedFiles` 动态注册：omp 监听服务器注册的文件，服务器不运行自己的监听器。默认开启；设为 `false` 以保留服务器自己的监听器。共享（mux）服务器沿用启动它的会话设置；后续复用它的会话无论自身设置如何，都会使用其监听方式 |
| `capabilities` | `object` | 否 | 需主动启用的服务器专属功能；参见[能力](#capabilities) |
| `workspaceReadyTimings` | `object` | 否 | 高级 rust-analyzer 工作区就绪时序覆盖；见下文 |

覆盖内置服务器时可以省略必填字段，因为验证前会继承这些字段。全新的服务器通常需要全部三个必填字段。`resolvedCommand` 和 `createClient` 是运行时管理的字段，不得配置。

对于插件兼容定义，当 `initOptions` 不是对象时，会接受 `initializationOptions`。`extensionToLanguage` 可以从其键提供 `fileTypes`，并将缺失的 `rootMarkers` 默认为 `["."]`；其值不会设置按扩展名区分的语言 ID。市场条目可以提供内联 `lspServers` 映射，或位于插件根目录内部的配置文件路径。

### 能力 \{#capabilities}

`capabilities` 对象按服务器启用 OMP 支持的可选服务器专属功能：

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

所有字段都是布尔值且可选。目前由 `rust-analyzer` 使用。

### 高级 rust-analyzer 就绪时序 \{#advanced-rust-analyzer-readiness-timings}

`workspaceReadyTimings` 调整 rust-analyzer 的工作区就绪轮询：

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

全部四个字段都是可选的毫秒值。默认值为 `timeoutMs: 5000`、`pollMs: 100`、`settleMs: 2000` 和 `statusRequestTimeoutMs: 1000`。这是高级调优接口；常规配置应使用默认值。

## 常见配置方法 \{#common-recipes}

### 覆盖内置服务器的设置 \{#override-a-built-in-servers-settings}

部分覆盖会合并到内置默认值上。只需指定要更改的字段。

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

原生格式的新服务器要求 `command`、`fileTypes` 和 `rootMarkers` 非空。无效的新定义会被忽略并发出警告；无效的覆盖会保留之前的服务器定义。不可读的文件或无效 JSON/YAML 会被忽略；加载器继续处理剩余来源。

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

关闭不活动超过五分钟的语言服务器：

```json
{
	"idleTimeoutMs": 300000
}
```

### 为一个项目禁用服务器，但在全局保留 \{#disable-a-server-for-one-project-keep-it-globally}

将覆盖放入 `<project>/.omp/lsp.json`：

```json
{
	"servers": {
		"pylsp": {
			"disabled": true
		}
	}
}
```

`~/.omp/agent/lsp.json` 中的用户级配置不受影响；pylsp 只在此项目中被禁用。

## 内置服务器列表 \{#built-in-server-list}

以下服务器随 `defaults.json` 提供，可参与自动检测：

| 服务器键 | 语言 | 二进制文件 |
| --- | --- | --- |
| `rust-analyzer` | Rust | `rust-analyzer` |
| `clangd` | C、C++、ObjC、CUDA | `clangd` |
| `zls` | Zig | `zls` |
| `gopls` | Go | `gopls` |
| `typescript-language-server` | TypeScript、JavaScript（≤ 6） | `typescript-language-server` |
| `typescript-native` | TypeScript、JavaScript（7+） | `tsc --lsp --stdio` |
| `denols` | TypeScript、JavaScript（Deno） | `deno` |
| `biome` | TS/JS/JSON/CSS（检查器） | `biome` |
| `eslint` | TS/JS/Vue/Svelte（检查器） | `vscode-eslint-language-server` |
| `vscode-html-language-server` | HTML | `vscode-html-language-server` |
| `vscode-css-language-server` | CSS、SCSS、Less | `vscode-css-language-server` |
| `vscode-json-language-server` | JSON | `vscode-json-language-server` |
| `tailwindcss` | HTML、CSS、TS/JS | `tailwindcss-language-server` |
| `svelte` | Svelte | `svelteserver` |
| `vue-language-server` | Vue | `vue-language-server` |
| `astro` | Astro | `astro-ls` |
| `pyright` | Python | `pyright-langserver` |
| `basedpyright` | Python | `basedpyright-langserver` |
| `pylsp` | Python | `pylsp` |
| `ty` | Python | `ty` |
| `ruff` | Python（检查器） | `ruff` |
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
| `rubocop` | Ruby（检查器） | `rubocop` |
| `bashls` | Bash、Zsh | `bash-language-server` |
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
| `emmet-language-server` | HTML、CSS、JSX | `emmet-language-server` |
| `sourcekit-lsp` | Swift | `sourcekit-lsp` |
| `swiftlint` | Swift（检查器） | `swiftlint` |
| `tlaplus` | TLA+ | `tlapm_lsp` |

每个项目只保留一个 TypeScript 服务器：当解析到的 `tsc` 属于不含 `lib/tsserver.js` 的 TypeScript 安装（TypeScript 7+），或来自不含 npm `package.json` 的安装（如 nixpkgs）且报告版本为 7+ 时，保留 `typescript-native` 并移除 `typescript-language-server`；否则移除 `typescript-native`，因为旧版 `tsc` 不接受 `--lsp`。
