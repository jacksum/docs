---
title: "插件管理器与安装器底层机制"
description: "Oh My Pi 官方仓库文档：插件管理器与安装器底层机制。"
---

# 插件管理器与安装器底层机制 \{#plugin-manager-and-installer-plumbing}

本文介绍 `omp plugin` 的 npm/git/link 和市场操作如何修改磁盘上的插件状态，并将其转变为运行时能力。市场安装维护自己的注册表和缓存，再通过 npm/git/link 安装所使用的同一套 `node_modules` 和 `omp-plugins.lock.json` 运行时接口注册缓存的插件；参见 `docs/marketplace.md`。

## 范围与架构 \{#scope-and-architecture}

代码库中有两套插件管理实现：

1. **CLI 命令使用的现行路径**：`PluginManager`（`src/extensibility/plugins/manager.ts`）
2. **旧版辅助模块**：安装器函数（`src/extensibility/plugins/installer.ts`）

`omp plugin` 的 npm/git/link 操作通过 `PluginManager` 执行；市场操作通过 `MarketplaceManager` 执行。`install` 会对每个目标进行分类（`cli/classify-install-target.ts` 中的 `classifyInstallTarget`）：本地路径路由至 `PluginManager.link()`，而 `name@marketplace` 仅在该市场已配置时才路由至市场管理器。带作用域的 npm 规范、常见的 npm dist-tag 和类似版本的后缀仍视为 npm 目标。Git 和 npm 规范交给 `PluginManager.install()`。

`installer.ts` 仍记录了重要的安全检查和文件系统行为，但它不是 `src/commands/plugin.ts` + `src/cli/plugin-cli.ts` 使用的路径。

## 生命周期：从 CLI 调用到运行时可用 \{#lifecycle-from-cli-invocation-to-runtime-availability}

```text
omp plugin <npm/link action> ...
  -> src/commands/plugin.ts
  -> runPluginCommand(...) in src/cli/plugin-cli.ts
  -> PluginManager method (install/list/uninstall/link/...)
  -> mutate user plugins data root {package.json,node_modules,omp-plugins.lock.json}
  -> enabled-plugin enumeration discovers user and nearest project plugin roots
  -> direct loaders resolve manifest-declared tool/extension entries
  -> `omp-plugins` capability discovery scans conventional skills/hooks/tools/commands/rules/prompts/MCP content; task discovery scans `agents/`

omp plugin install name@marketplace / omp install name@marketplace
  -> MarketplaceManager
  -> mutate scope registry and shared cache
  -> symlink the cached package into the scope's node_modules and update omp-plugins.lock.json
  -> `claude-plugins` discovery loads legacy marketplace content; `agent-plugins` handles portable skills/MCP for standard root plugin.json packages
  -> task discovery loads `agents/`; extension loader imports `package.json#omp.extensions`
```

### 命令入口 \{#command-entrypoints}

- `src/commands/plugin.ts` 定义命令/标志，并转发给 `runPluginCommand`。
- `src/cli/plugin-cli.ts` 将 npm/link 子命令映射到 `PluginManager` 方法：
   - `install`、`uninstall`、`list`、`link`、`doctor`、`features`、`config`、`enable`、`disable` 和 npm/git `upgrade`
- `discover`、市场 `upgrade` 和 `marketplace ...` 子命令使用 `MarketplaceManager`。
- `upgrade <package-name>` 更新 npm/git 插件；若裸名称匹配一个已安装的市场插件，则改为解析到该市场 ID。存在多个市场匹配项时，需要加以限定。不带目标的 `upgrade` 只升级已过时的市场插件。

## 磁盘模型 \{#on-disk-model}

用户插件状态位于插件数据根目录下（默认为 `~/.omp/plugins`）。在 Linux 和 macOS 上，`omp config init-xdg` 会初始化 XDG 数据、状态和缓存根目录，但不会移动现有插件树。设置了 `XDG_DATA_HOME` 且其 `omp/` 目录已初始化时，默认配置档案的状态解析到 `$XDG_DATA_HOME/omp/plugins` 下。命名配置档案使用各自的根目录，需要特定于配置档案的 XDG 目录才能选择采用该路由。市场注册表辅助程序会在其 XDG 目标不存在时，另行尽力复制旧版 `marketplaces.json`。

插件根目录包含：

- `package.json`：`bun install`/`bun uninstall` 用于 npm 安装插件的依赖清单
- `node_modules/`：已安装的 npm 包，以及链接和市场缓存符号链接
- `omp-plugins.lock.json`：npm/link/市场插件的运行时状态：
   - 每个插件的启用/禁用状态
   - 每个插件选定的功能集
   - 持久化的插件设置

项目根目录解析首先向上查找最近的 `.omp/`；仅在不存在时才使用最近的 `.git` 锚点。项目运行时插件位于 `<anchor>/.omp/plugins/{node_modules,omp-plugins.lock.json}`。当两个锚点都不存在时，显式的市场项目安装可以创建 `<cwd>/.omp/plugins/`（cwd 为主目录时除外）。已启用的项目包会遮蔽同包名的用户包；已禁用的项目包不会。npm/git/link CLI 操作仍限于用户作用域；其安装处理程序会发出警告并忽略 `--scope`。

项目本地覆盖项通过项目配置目录中的 `plugin-overrides.json` 查找（通常为 `<project>/.omp/plugin-overrides.json`）。从管理器/加载器角度看，覆盖项是只读的，可以禁用插件或覆盖功能/设置。

市场安装会在这些运行时条目之外添加注册表和缓存状态：

- 用户数据根目录中的 `marketplaces.json`（默认为 `~/.omp/marketplaces.json`）：已配置的市场目录
- 用户插件数据根目录中的 `installed_plugins.json`（默认为 `~/.omp/plugins/installed_plugins.json`）：用户作用域的市场安装
- `<anchor>/.omp/plugins/installed_plugins.json`：项目作用域的市场安装
- 用户插件数据根目录中的 `cache/{marketplaces,plugins}/`：缓存的目录和插件目录
- 用户插件数据根目录中的 `project_registries.json`：其中记录安装链接到共享插件缓存的项目 `installed_plugins.json` 文件；删除缓存插件目录之前会查询它，因此在项目外运行清理不会移除该项目仍在使用的目录
- `<scope>/plugins/node_modules/<package>`：指向缓存插件的符号链接，使其 `package.json` 的 `omp.extensions` 和工具能够加载
- `<scope>/plugins/omp-plugins.lock.json`：与运行时插件加载器共享的启用和功能状态

## 插件规范解析与元数据解读 \{#plugin-spec-parsing-and-metadata-interpretation}

## 安装规范语法 \{#install-spec-grammar}

`parsePluginSpec`（`parser.ts`）支持：

- `pkg` -> `features: null`（默认行为）
- `pkg[*]` -> 启用清单中的全部功能
- `pkg[]` -> 不启用任何可选功能
- `pkg[a,b]` -> 启用指定名称的功能
- `@scope/pkg@1.2.3[feat]` -> 带作用域和版本的包，并显式选择功能

`PluginManager.install` 也接受 git 来源（由 `validateGitSpec` 验证，而非 npm 正则表达式）：带命名空间的简写 `github:user/repo[#ref]`、`gitlab:`、`bitbucket:`、`codeberg:`、`sourcehut:`/`srht:`，pi 风格的 `git:github.com/user/repo` 和 `git:git@github.com:user/repo`，以及完整 git URL（`https://github.com/user/repo`、`git@github.com:user/repo`、`ssh://…`、`git+https://…`）。Git 规范不编码包名，因此安装时会比较 `bun install` 前后 `plugins/package.json#dependencies` 的差异，以解析包名。

pi 风格的 `git:` GitHub 来源在调用 bun 之前会规范化为 HTTPS 或 SSH URL，否则 bun 会将 `git` 视为主机。其他 GitHub 规范原样转发。非 GitHub 的 `https://`/`ssh://` 规范会加上 `git+` 前缀后传给 bun（bun 只会为 GitHub 托管的 URL 自动检测 git，因此若无此前缀，该规范会被误读为 npm tarball）。内联的 userinfo 凭据（`https://user:token@host/group/repo.git`）会从这些 `git+` 规范中移除：`bun install` 会将规范原样持久化到 `plugins/package.json` 和 `bun.lock` 中，长期有效的仓库令牌不得写入这些用户文件。私有仓库改为通过 SSH、git 凭据辅助程序或 `.netrc` 进行身份验证，bun 原生支持这些方式。

`extractPackageName` 会移除可选的 `npm:` 前缀和版本后缀，以便在安装后查找磁盘路径。

## 清单来源与必需字段 \{#manifest-source-and-required-fields}

清单按以下顺序解析：

1. `package.json.omp`
2. 回退到 `package.json.pi`
3. 回退到 `{ version: package.version }`

这意味着：

- 管理器/加载器中没有严格的模式验证。
- 缺少 `omp`/`pi` 的包仍可安装和列出。
- 运行时插件加载（`getEnabledPlugins`）会跳过没有 `omp`/`pi` 清单的包。
- `manifest.version` 总会被包的 `version` 覆盖。

格式错误的 `package.json` JSON 会在读取时直接失败；清单结构格式错误则可能到后续使用特定字段时才失败。

## 安装/更新流程（`PluginManager.install`） \{#installupdate-flow-pluginmanagerinstall}

下面每次 Bun 包管理器调用（`install`、`update`、`uninstall`、`pm cache`）都通过 `runBunCli`（`src/extensibility/plugins/bun-cli.ts`）执行，它会设置 `BUN_BE_BUN=1` 后重新运行当前可执行文件，而不是在 `PATH` 中查找 `bun`。独立的 `omp` 二进制文件内嵌 Bun，因此 npm/Git 插件安装不需要另行安装 Bun；Git 来源仍需要 `PATH` 上存在 `git`。

1. 从安装规范解析功能方括号语法。
2. 验证规范：git 规范通过 `validateGitSpec` 验证；npm 规范使用包名正则表达式和 shell 元字符拒绝列表验证。
3. 确保插件 `package.json` 存在（`omp-plugins`，私有依赖映射）。
4. 在用户插件目录中，对 npm 运行 `bun install --no-cache <packageSpec>`，对 Git 运行 `bun install <gitSpec>`；请求了 `--force` 时会转发该标志。重新安装会先清除过时的依赖条目。重新安装现有 Git 插件还会刷新 Bun 中匹配的 Git 缓存，并运行 `bun update <resolved-name>` 刷新锁文件修订版本。
5. 解析已安装的包名（npm：通过 `extractPackageName` 移除版本；git：比较前后 `dependencies` 的差异），并读取 `node_modules/<name>/package.json`。
6. 解析清单并计算 `enabledFeatures`：
   - `[*]`：所有已声明的功能（若无功能映射则为 `null`）
   - `[a,b]`：清单存在功能映射时验证每个功能；没有映射时保留名称而不验证
   - `[]`：空功能列表
   - 裸规范：`null`（稍后在加载器中使用默认策略）
7. 验证声明的扩展条目（`#validateInstalledExtensions`）：清单中的每个 `extensions` 条目都必须能解析到磁盘位置、导入为工厂函数，并在一次性注册接口上成功初始化。失败时回滚安装，恢复先前的 `plugins/package.json`，移除新安装的包，并从 `bun install` 前创建的备份中恢复任何先前版本，然后中止。
8. 插入或更新锁文件运行时状态：`{ version, enabledFeatures, enabled: true }`。

### 更新语义 \{#update-semantics}

- `omp plugin install pkg@newVersion` 更新依赖和运行时版本。普通的重新安装会将启用状态重置为 true，并将功能选择重置为默认值，除非显式提供了功能；设置仍保留在单独的设置映射中。
- `omp plugin upgrade <package-name>` 使用 `plugins/package.json` 中记录的来源：npm 更新到最新发布版本，Git 则重新解析其记录的 ref。它保留启用状态和功能选择，并移除新功能映射中不存在的已选功能。本地链接和 `file:`/`link:`/`workspace:`/`portal:` 依赖没有可升级的内容，因此会被拒绝。
- 升级同时比较包版本和 Bun 锁文件解析结果，因此移动的 Git ref 可以在版本未提升时报告修订版本变化。
- 安装会为先前的包树、`package.json` 和 `bun.lock` 创建快照。在安装、功能/扩展验证或运行时配置保存期间失败时，会尝试恢复这三者。
- 没有独立的 npm 插件启动更新检查或迁移操作。

## 移除流程（`PluginManager.uninstall`） \{#remove-flow-pluginmanageruninstall}

1. 验证包名。
2. 在插件目录中运行 `bun uninstall <name>`。
3. 成功后显式移除 `node_modules/<name>`，包括依赖清单中不存在的链接。
4. 从锁文件中移除插件运行时状态：
   - `config.plugins[name]`
   - `config.settings[name]`

若卸载命令失败，则不更改运行时状态。

## 列表流程（`PluginManager.list`） \{#list-flow-pluginmanagerlist}

1. 读取依赖映射和锁文件运行时条目；两者的并集包含 npm 安装和仅链接的插件。
2. 加载项目覆盖项。
3. 从 `node_modules` 解析每个包；跳过市场运行时符号链接，因为市场摘要会单独列出。
4. 构建 `InstalledPlugin` 记录并合并有效状态：
   - 以锁文件（或默认值）为基础
   - 项目覆盖项可以替换功能选择
   - 项目 `disabled` 列表将插件屏蔽为禁用状态

`omp plugin list` 将此结果与 `MarketplaceManager.listInstalledPlugins()` 合并。

`PluginManager.getPlugin()` 直接解析一个运行时包，包括 `list()` 有意省略的市场符号链接。显式的可信路径优先；否则，已启用的项目包会遮蔽用户包。配置命令通过此路径查找清单/模式，而设置读写仍使用用户锁文件加只读项目覆盖项。`config validate` 包含市场包，但不会在列表/状态输出中重复市场条目。

## 链接流程（`PluginManager.link`） \{#link-flow-pluginmanagerlink}

`link` 通过将本地包符号链接到 `~/.omp/plugins/node_modules/<pkg.name>` 来支持本地插件开发。

行为：

1. 相对于管理器 cwd 解析 `localPath`。
2. 要求存在本地 `package.json`，且 `name` 能通过管理器的包名验证。
3. 确保插件目录存在。
4. 对带作用域的名称，创建作用域目录。
5. 移除目标链接位置的现有路径。
6. 创建目录符号链接（Windows 上为联接）。
7. 添加已启用且使用默认功能（`null`）的运行时锁文件条目。

注意：`PluginManager.link` 验证包名，但不像旧版 `installer.ts` 那样将来源限制在 cwd 内。相对路径相对于管理器 cwd 解析；波浪号展开由 shell/调用方负责。

## 运行时加载：从已安装插件到可调用能力 \{#runtime-loading-from-installed-plugin-to-callable-capabilities}

## 发现关卡 \{#discovery-gate}

`getEnabledPlugins(cwd)`（`plugins/loader.ts`）读取：

- 插件依赖清单（`package.json`），与锁文件插件条目取并集，因此没有依赖条目、仅通过 `plugin link` 链接的插件仍能被发现
- 锁文件运行时状态
- 通过 `getConfigDirPaths("plugin-overrides.json", { user: false, cwd })` 读取项目覆盖项

过滤规则：

- 没有插件 package.json 时跳过
- 缺少清单（`omp`/`pi`）时跳过
- 在锁文件中全局禁用时跳过
- 被项目禁用时跳过
- 根目录存在依赖清单时，跳过仅存在于锁文件中的条目，除非其 `node_modules` 路径是符号链接（链接和市场注册仍然有效）
- 遇到 `EACCES`/`EPERM` 时，跳过不可读的根目录或个别插件包并发出警告；格式错误的 JSON 仍会继续向上传播

## 能力路径解析 \{#capability-path-resolution}

对每个已启用插件：

- `resolvePluginExtensionPaths(plugin)`
- `resolvePluginToolPaths(plugin)`
- `resolvePluginHookPaths(plugin)`
- `resolvePluginCommandPaths(plugin)`

每个解析器都包含基础条目加功能条目：

- 基础条目始终包含在内
- 显式功能列表 -> 只包含选定功能
- `enabledFeatures === null` -> 启用标记为 `default: true` 的功能

清单条目可以指向文件。工具/钩子/命令目录要求直接包含 `index.ts`、`index.js`、`index.mjs` 或 `index.cjs`。扩展目录则使用以下优先级：自身 `package.json` 中的 `omp`/`pi.extensions`，然后是直接包含的 index，最后对模块文件和包含 index 的子目录进行排序后的一层扫描。声明文件不参与该扫描。运行时解析会省略缺失路径；安装时会验证已启用且已声明的扩展条目。

## 当前运行时接线 \{#current-runtime-wiring}

- 清单声明的**工具**通过 `getAllPluginToolPaths(cwd)` 传入 `discoverAndLoadCustomTools`。
- 清单声明的**扩展**通过 `listPackageExtensionModules()` 传入 `discoverAndLoadExtensions`（`/extensions` 也会列出这些模块）。
- `omp-plugins` 能力提供方会另行扫描已启用 npm/link 插件根目录下约定的 `skills/`、`hooks/pre|post/`、`tools/`、`commands/`、`rules/`、`prompts/` 和 `.mcp.json`/`mcp.json`。任务智能体发现会扫描相同根目录中的 `agents/`。市场根目录不参与此处的扫描，而是通过 `claude-plugins` 加市场任务智能体发现来处理。
- 根目录 `plugin.json` 以 Agent Plugins 1.0.0 为目标的包，会使用 `agent-plugins` 从市场和扩展包根目录中发现可移植的 `skills/` 和根目录 `mcp.json`。旧版提供方会跳过这两个接口，但仍可从混合包中加载客户端特定内容；存在致命错误的标准清单会阻止旧版发现。
- 清单钩子/命令路径解析器仍然导出，但运行时钩子/斜杠命令发现使用约定的能力提供方扫描，而非 `getAllPluginHookPaths()` 或 `getAllPluginCommandPaths()`。
- 直接指定的自定义工具和扩展路径列表按解析后的绝对路径去重（`seen`，第一个路径优先）。

## 锁文件/状态管理细节 \{#lockstate-management-details}

`PluginManager` 为每个实例在内存中缓存运行时配置（`#runtimeConfig`），并按需加载一次。

管理器加载行为：

- 锁文件缺失 -> `{ plugins: {}, settings: {} }`
- 锁文件读取/解析失败 -> 警告加相同的空默认值

已启用插件发现会独立加载每个用户/项目根目录：缺失的锁文件视为空，拒绝访问的根目录会被跳过并发出警告，其他读取/解析失败则向上传播。其按 cwd/home 缓存的 promise 会在插件缓存失效时清除。

保存行为：

- 每次变更都以美化格式写入完整的锁文件 JSON

不存在跨进程锁定或合并策略；并发写入者可能相互覆盖。

## 安全检查与信任边界 \{#safety-checks-and-trust-boundaries}

## 输入/包验证 \{#inputpackage-validation}

现行管理器路径会强制执行包名验证：

- npm 规范：`VALID_PACKAGE_NAME` 在移除 `npm:` 和版本后缀后检查依赖名称；它不是完整的版本/范围验证器。
- npm shell 元字符拒绝列表：`;`、`&`、`|`、反引号、`$`、`(`、`)`、`{`、`}`、`[`、`]`、`<`、`>`、`\`，在 `parsePluginSpec` 移除功能方括号后应用，因此普通的 `pkg[feat]` 规范不会进入该检查。
- git 规范：`validateGitSpec` 只拒绝共享的 `SHELL_METACHARS` 集合（`;`、`&`、`|`、反引号、`$`、`(`、`)`、`{`、`}`、`<`、`>`、`\`、换行、CR、制表符），而不使用 npm 正则表达式，因此允许 `:`、`/`、`#`、`+`、`.`、`-`、`_`、`~`、`@`。

这限制了调用 `bun install/uninstall` 时的命令注入风险。

## 文件系统信任边界 \{#filesystem-trust-boundary}

- 导入自定义工具模块时，插件代码在进程内执行；没有沙箱隔离。
- 清单中的相对路径相对于插件包目录拼接，只检查是否存在。
- 插件包一旦安装，就被视为可信代码。

## 仅旧版安装器具有的检查 \{#legacy-installer-only-checks}

`installer.ts` 将链接来源路径限制在项目 cwd 内，并应用自己的包名/路径检查。`PluginManager.link` 改为应用现行包名验证，但允许 cwd 之外的来源路径。旧版 cwd 限制不在 CLI 路径上。

## 失败、部分成功与回滚行为 \{#failure-partial-success-and-rollback-behavior}

插件管理器不具备事务性。

| 操作阶段 | 失败行为 | 回滚 |
| --- | --- | --- |
| `bun install` 或后续 git `bun update` 失败 | 安装中止并输出 stderr | 恢复先前的 `package.json`、`bun.lock` 和包快照 |
| 功能或扩展验证失败 | 命令失败 | 执行相同的安装回滚 |
| 运行时锁文件写入失败 | 命令失败 | 执行相同的安装回滚；回滚失败会追加到报告的错误中 |
| `bun uninstall` 成功，锁文件写入失败 | 命令失败 | 包已移除，可能留下过时的运行时状态 |
| `link` 移除旧目标后创建符号链接失败 | 命令失败 | 不恢复先前的链接/目录 |

实际操作中，`doctor --fix` 可以修复一些偏差（`bun install`、孤立配置清理、无效功能清理），但只是尽力而为。

## 清单格式错误/缺失行为摘要 \{#malformedmissing-manifest-behavior-summary}

- 缺少 `omp`/`pi` 字段：
   - 安装/列表：容许（使用最小清单）
   - 运行时已启用插件发现：作为非插件跳过
- 安装规范或功能变更引用未知功能：清单声明了功能映射时，会报硬错误并列出可用功能；没有映射时，可以不经验证保留名称
- `plugin-overrides.json` 无效或不可读：记录路径和错误，然后忽略，并回退到下一个项目配置路径或 `{}`。文件缺失时保持静默。
- 清单引用的工具/钩子/命令文件路径缺失：解析器展开期间静默忽略；只有 `doctor` 会将其标记为错误

## 模式差异与优先级 \{#mode-differences-and-precedence}

- `--dry-run`（安装）：返回合成的安装结果，不运行 `bun install`、不访问网络、不写入任何内容（连插件 `package.json` 骨架也不写入）。
- 本地链接/安装路径的 `--dry-run` 会在不读取包的情况下打印预览；市场安装/卸载预览会执行本地验证，但不做变更。市场 `upgrade --dry-run` 只读取注册表、缓存目录和本地清单：不带 id 时，列出 `checkForUpdates` 报告的过时配对（即 `upgradeAllPlugins` 处理的对象）；带 id 时，列出 `upgradePlugin`/`upgradePluginAcrossScopes` 将强制重新安装的所有作用域，包括目录版本相同或更旧的情况（`previewUpgradePlugin`，它与这两个方法共享作用域解析，并采用 `checkForUpdates` 的 `classifyVersionChange` 规则）。其他变更操作（`marketplace add|remove|update`、npm/git 插件的 `upgrade`、`enable`、`disable`、`features` 更改、`config set|delete`、`doctor --fix`）会在写入任何内容之前以退出码 1 拒绝 `--dry-run`（npm/git `upgrade` 会先像真实命令一样报告未知插件或链接插件）；只读操作会忽略它。
- `--json`：请求的输出格式，不是事务性保证；市场变更处理程序并非全部输出 JSON。
- 对于功能/设置视图，项目覆盖项始终优先于全局锁文件。
- 有效启用状态为 `runtimeEnabled && !projectDisabled`。

## 实现文件 \{#implementation-files}

- [`src/commands/plugin.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/commands/plugin.ts)：CLI 命令声明和标志映射
- [`src/cli/plugin-cli.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/cli/plugin-cli.ts)：操作分发、面向用户的命令处理程序
- [`src/extensibility/plugins/manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/plugins/manager.ts)：现行安装/移除/列表/链接/状态/诊断实现
- [`src/extensibility/plugins/installer.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/plugins/installer.ts)：旧版安装器辅助程序和额外的链接安全检查
- [`src/extensibility/plugins/loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/plugins/loader.ts)：已启用插件发现，以及清单工具/钩子/命令/扩展路径解析
- [`src/extensibility/plugins/parser.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/plugins/parser.ts)：安装规范和包名解析辅助程序
- [`src/extensibility/plugins/types.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/plugins/types.ts)：清单/运行时/覆盖项类型契约
- [`src/discovery/omp-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/omp-plugins.ts)：npm/link 扩展包的约定能力发现
- [`src/task/discovery.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/task/discovery.ts)：扩展和市场插件根目录的约定 `agents/` 发现
- [`src/discovery/claude-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/claude-plugins.ts)：市场插件能力发现
- [`src/discovery/agent-plugins.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/discovery/agent-plugins.ts)：可移植的 Agent Plugins 技能和 MCP 发现
- [`src/extensibility/extensions/directory-resolution.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/extensions/directory-resolution.ts)：共享的扩展目录优先级
- [`src/extensibility/custom-tools/loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/custom-tools/loader.ts)：清单声明的插件工具模块运行时接线
- [`src/extensibility/extensions/loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/extensibility/extensions/loader.ts)：插件扩展模块的运行时接线
