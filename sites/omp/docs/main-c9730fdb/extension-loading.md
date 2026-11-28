---
title: "扩展加载（TypeScript/JavaScript 模块）"
description: "Oh My Pi 官方仓库文档：扩展加载（TypeScript/JavaScript 模块）。"
---

# 扩展加载（TypeScript/JavaScript 模块） \{#extension-loading-typescriptjavascript-modules}

本文介绍编程智能体如何在启动时发现和加载扩展模块。扫描原生/配置的目录时会自动发现 `.ts` 和 `.js`；显式指定的文件和已安装插件的清单条目也可以使用 `.mjs` 和 `.cjs`。

## 此子系统的作用 \{#what-this-subsystem-does}

扩展加载会构建一个有序的模块入口文件列表，使用 Bun 并发导入模块，然后按路径顺序依次绑定它们的工厂。它返回：

- 已加载的扩展定义
- 按路径记录的导入/工厂错误（不会中止其他模块的加载）
- 之后供 `ExtensionRunner` 使用的共享扩展运行时对象
- 已准备好的工厂，可重新绑定到新会话，而无需重新求值模块图

## 主要实现文件 \{#primary-implementation-files}

- `src/extensibility/extensions/loader.ts`：路径发现 + 导入/执行
- `src/extensibility/extensions/directory-resolution.ts`：共享的配置/插件清单及目录优先级
- `src/extensibility/extensions/index.ts`：公共导出
- `src/extensibility/extensions/runner.ts`：加载后的运行时/事件执行
- `src/discovery/builtin.ts`：扩展模块的原生自动发现提供方
- `src/extensibility/plugins/legacy-pi-compat.ts`：原位模块图加载与宿主包兼容性重写
- `src/config/settings.ts`：加载合并后的 `extensions` / `disabledExtensions` 设置
- `src/sdk.ts`：会话专属发现、已准备工厂的重新绑定，以及实时来源协调
- `src/discovery/omp-extension-roots.ts`：扩展包中的同级能力根目录

---

## 扩展加载的输入 \{#inputs-to-extension-loading}

### 1) 自动发现的原生扩展模块 \{#1-auto-discovered-native-extension-modules}

`discoverExtensionPaths()` 使用 `providers: ["native"]` 过滤器加载 `extension-module` 能力。此加载器不扫描外部扩展模块提供方。

原生 `extension-module` 发现来自：

- 项目目录：`<cwd>/.omp/extensions`
- 用户目录：活动智能体目录的 `extensions/`（默认为 `~/.omp/agent/extensions`）
- 原生旧版/设置 JSON 条目：`<cwd>/.omp/settings.json#extensions` 和活动智能体目录的 `settings.json#extensions`

项目根目录是原生提供方的 `.omp` 目录（`SOURCE_PATHS.native.projectDir`），仅限 cwd；不会向上遍历祖先目录。原生发现会在提供了 `LoadContext.agentDir` 时使用它，否则使用 `getAgentDir()`。使用默认用户配置根目录时，`omp --profile <name>` 会选择 `~/.omp/profiles/<name>/agent/extensions`。`PI_CONFIG_DIR` 会更改此用户配置根目录；`PI_CODING_AGENT_DIR` 只在默认配置档案中覆盖智能体目录，不影响具名配置档案。见[配置档案](./config-usage.md#profiles)。

注意：

- 原生自动发现目前基于 `.omp`。
- 包清单（`pi.extensions`）和项目覆盖查找仍接受旧版 `.pi`，但此处 `.pi/extensions` 不是原生根目录。

### 2) 发现的 JS/TS 钩子工厂 \{#2-discovered-jsts-hook-factories}

完成原生自动发现后，`discoverAndLoadExtensions()` 还会从 `hook` 能力中追加 JS/TS 钩子工厂，也就是入口路径为 `.ts`/`.js` 文件的钩子，使它们通过相同的模块流水线加载。原生提供方只在 `<cwd>/.omp/hooks/pre|post/` 和 `<agentDir>/hooks/pre|post/` 下发现这些钩子；所需的 `pre/`/`post/` 布局见[钩子：原生发现位置](./hooks.md#native-discovery-location)。

钩子能力加载已经应用其自身的钩子专属禁用 id，因此不会再用 `disabledExtensions` 的扩展模块名称过滤这些路径。

### 3) 已安装插件的扩展条目 \{#3-installed-plugin-extension-entries}

钩子发现后，`discoverAndLoadExtensions()` 通过 `listPackageExtensionModules()` 追加已启用的已安装插件的扩展入口点。

插件扩展条目来自包的 `omp.extensions` / `pi.extensions` 清单，包括已启用的功能条目。

已安装插件的清单解析接受显式的 `.ts`、`.js`、`.mjs` 和 `.cjs` 文件。对于指定目录的清单条目，它识别 `index.ts`、`index.js`、`index.mjs` 或 `index.cjs`；扩展目录展开也使用这四种后缀。这比原生和配置目录的自动扫描范围更广，后两者仍限于 `.ts` 和 `.js`。

已安装插件的扩展目录解析首先使用目录自身
非空的 `omp.extensions` / `pi.extensions` 清单，然后使用直接索引文件，
最后进行排序后的单层扫描。该扫描跳过声明文件
（`*.d.ts`、`*.d.mts`、`*.d.cts`）；显式声明的文件条目不
按后缀过滤。

### 4) 显式配置的路径 \{#4-explicitly-configured-paths}

插件扩展条目之后，会追加并解析配置的路径。

主会话启动路径（`sdk.ts`）中，配置的路径来源为：

1. CLI 提供的路径（`--extension/-e`，`--hook` 也被视为扩展路径）
2. 生效设置中的 `extensions` 数组（设置层会替换数组，而不是拼接）

原生设置文件：

- 用户：活动智能体目录的 `config.yml`，以 `config.yaml` 为后备（默认根目录为 `~/.omp/agent`；具名配置档案使用 `~/.omp/profiles/<name>/agent`）。智能体目录覆盖遵循上述配置档案规则。
- 项目/原生设置能力：`<cwd>/.omp/config.yml` 和 `<cwd>/.omp/settings.json`

其他已启用的设置提供方和 `--config` 叠加层也可以提供
生效的 `extensions` 值。见[设置](./config-usage.md)。

原生扩展模块发现还会从以下位置读取旧版 JSON 扩展列表：

- 活动智能体目录的 `settings.json`（默认为 `~/.omp/agent/settings.json`）
- `<cwd>/.omp/settings.json`

示例：

```yaml
# ~/.omp/agent/config.yml
extensions:
   - ~/my-exts/safety.ts
   - ./local/ext-pack
```

```json
{
	"extensions": ["./.omp/extensions/my-extra"]
}
```

---

## 启用/禁用控制 \{#enabledisable-controls}

### 禁用发现 \{#disable-discovery}

- CLI：`--no-extensions`
- SDK 选项：`disableExtensionDiscovery`

行为区别：

- SDK：当 `disableExtensionDiscovery=true` 时，排除环境中的扩展工厂，
  而 `additionalExtensionPaths` 仍正常解析
  （包括带有 `package.json#omp.extensions` 的包目录）。
- CLI：`--no-extensions` 遵循同样的仅显式加载约定。显式
  `-e/--extension` 和 `--hook` 路径仍会加载，且只有显式指定的扩展包中的
  同级能力根目录仍有资格参与。项目/用户的
  `extensions:` 设置和已安装的 OMP 扩展包会被排除在
  这一同级能力面之外。
- 可执行的自定义工具和自定义命令模块遵循同样的
  仅显式加载约定：不会导入环境中的 `.omp/tools`、
  市场和已安装插件的工具，也不会加载任何自定义
  命令模块。显式指定的扩展包的
  `tools/` 目录下的工具仍会加载。

此标志控制扩展工厂、可执行自定义工具/命令模块，
以及 OMP 扩展包的同级根目录；它不是整个进程的
能力隔离开关。技能、MCP 服务器、提示词、规则，以及
启动目录的 `.env` 保留各自的控制方式。

### 精确模块允许列表 \{#exact-module-allowlist}

CLI `--trusted-extension <absolute-file>` 可重复指定，并且只加载这些
扩展模块文件，绕过发现和包目录展开。
路径应为绝对路径且指向现有文件；加载前会解析符号链接。
它不能与 `-e`/`--extension` 或 `--hook` 组合使用。加载失败会中止
启动，而不是静默丢弃允许列表中的模块。

与显式扩展包目录不同，允许列表中的文件不会
授权同级钩子、工具、命令、技能、规则、提示词或 MCP 配置。
这仍是进程内模块允许列表，不是沙箱，也不是禁用
其他发现子系统的开关。

### 禁用特定扩展模块 \{#disable-specific-extension-modules}

对于环境中的扩展模块、已安装插件条目，以及从配置目录
展开的条目，`disabledExtensions` 按扩展 id 格式进行过滤：

- `extension-module:<derivedName>`

`derivedName` 基于入口路径（`getExtensionNameFromPath`），例如：

- `/x/foo.ts` -> `foo`
- `/x/bar/index.ts` -> `bar`

示例：

```yaml
disabledExtensions:
   - extension-module:foo
```

显式配置的文件路径会绕过此名称过滤器。仅显式加载的
会话（`--no-extensions` / `disableExtensionDiscovery`）还会完全省略设置中的
禁用列表。

`/extensions` 列出此过滤器管辖的每个模块，包括原生模块、已安装插件
条目，以及从配置目录展开的条目（位于 OMP 扩展
包下），并切换相同的 id。配置的文件路径没有对应行，因为
该列表无法禁用它们。

### 实时来源变更 \{#live-source-changes}

在主会话中，更改 `extensions` 或 `disabledExtensions`，以及
更改会话工作目录（`/move`、从
另一个项目恢复会话），都会重新划定受设置管辖的来源范围。离开
发现集合的来源会被暂停：其处理程序、命令、工具、渲染器、
快捷键、标志和文件回退不再参与，之后派生的子代理
也不再继承它们。在交互式 UI 中，其编辑器组件
会被隐藏，来自已暂停扩展的更新会被忽略。重新出现的来源
会带着此前的组件恢复；新发现的来源会被导入并加入
实时会话（此时运行其 `session_start` 处理程序）。暂停不会
停止扩展自有的定时器。对内置工具的覆盖被暂停时，会恢复
原生工具。模块永远不会被卸载或重新求值。受管辖的来源包括从
会话曾划入范围的每个目录中发现的来源。受管辖发现集合之外的内联和
调用方预加载来源不受影响。
仅显式加载的会话会忽略这些设置和目录变更。

### 禁用其他能力的特定条目 \{#disable-specific-items-of-other-capabilities}

`disabledExtensions` 不限于扩展模块。每个定义了
`toExtensionId` 的能力都会向同一列表贡献 id，而加载会在
条目到达会话之前将它们过滤掉。

上下文文件使用 `context-file:<level>:<basename>`，其中 `<level>` 为 `user`
或 `project`：

```yaml
disabledExtensions:
   - context-file:user:CLAUDE.md
```

该 id 不含目录和深度，因此 `project` 条目会在
发现遍历所到达的每个深度禁用该名称的文件。见
[上下文文件](./context-files.md#disabling-a-single-context-file)。

---

## 路径与入口解析 \{#path-and-entry-resolution}

### 路径规范化 \{#path-normalization}

对于配置的路径：

1. 规范化 Unicode 空格和受支持的路径简写（包括 `file://`、`@/absolute/path`，以及绝对/相对路径前多余的 `:`）
2. 展开 `~`
3. 如果是相对路径，则相对于当前 `cwd` 解析
4. 拒绝内部 URL 路由器处理的协议方案（包括 `local://`）；它们应由其协议处理程序解析，而不是作为文件系统路径处理

### 配置的路径是文件时 \{#if-configured-path-is-a-file}

直接将它用作模块入口候选。支持显式的 `.ts`、`.js`、`.mjs` 和 `.cjs` 文件。

### 配置的路径是目录时 \{#if-configured-path-is-a-directory}

解析顺序：

1. 该目录中的 `package.json` 带有非空的 `omp.extensions`（或旧版 `pi.extensions`）数组 -> 使用声明的条目
2. `index.ts`
3. `index.js`
4. 否则进行单层扫描，寻找扩展入口：
   - 直接的 `*.ts` / `*.js`
   - 子目录的 `index.ts` / `index.js`
   - 带有 `omp.extensions` / `pi.extensions` 的子目录 `package.json`

规则与约束：

- 不会递归发现超过一层子目录的内容
- 声明的 `extensions` 清单条目相对于该包目录解析
- 非空的声明数组具有决定性：即使所有声明条目都不存在，也仍抑制基于约定的索引/扫描回退
- 两个清单对象都存在时，`omp` 优先于 `pi`
- 缺失或不可访问的声明条目会逐个跳过，因此部分条目缺失的清单中，现有条目仍会加载
- 在 `*/index.{ts,js}` 对中，TypeScript 优先于 JavaScript
- 符号链接被视为符合条件的文件/目录

### 忽略行为因来源而异 \{#ignore-behavior-differs-by-source}

- 原生自动发现（发现辅助函数中的 `discoverExtensionModulePaths`）使用带有 `gitignore: true` 和 `hidden: false` 的原生 glob。
- `loader.ts` 中显式配置目录的扫描使用 `readdir` 规则，**不**应用 gitignore 过滤。

---

## 加载顺序与优先级 \{#load-order-and-precedence}

`discoverAndLoadExtensions()` 组合 `discoverExtensionPaths()` 和 `loadExtensions()`。
SDK 通常先发现路径，并可为子会话复用已导入/已准备的
工厂。

顺序：

1. 原生自动发现的模块
2. 发现的 JS/TS 钩子工厂
3. 已安装插件的扩展条目
4. 显式配置的路径（按提供的顺序）

在 `sdk.ts` 中，配置顺序为：

1. CLI 附加路径
2. 设置中的 `extensions`

去重：

- 基于绝对路径
- 首次出现的路径生效
- 后续重复项被忽略

这意味着：如果同一模块路径既被自动发现，又被显式配置，它只会在首次出现的位置（自动发现阶段）加载一次。

去重不使用真实路径：不同符号链接写法可能仍被视为
不同的发现条目。模块求值并发运行，因此顶层
模块副作用不保证按路径顺序发生。工厂调用和
注册仍按发现顺序依次进行。

---

## 模块导入与工厂约定 \{#module-import-and-factory-contract}

每个候选路径都通过 `loadLegacyPiModule()`（`src/extensibility/plugins/legacy-pi-compat.ts`）加载：

- 先解析入口的真实路径，再使用每次加载独有的 `?mtime` 缓存破坏标记动态导入。该标记由入口路径的哈希后接进程已加载该入口的次数构成，因此新进程加载未变更文件时会生成相同的重写源码，并复用 Bun 的运行时转译器缓存，而不是每次启动都增加缓存条目。加载器使用文件系统路径说明符（Windows 上不带扩展长度前缀），而不使用 `file://` URL，因为 Bun 会忽略后者的查询字符串；相同标记会传播到扩展自有的相对导入、包 `imports` 别名（`#alias/*`）和扩展本地依赖，从而让同进程内重新导入能够获取模块图的修改。由宿主解析的重写（pi 包说明符和 TypeBox 垫片）保持不带标记，因为它们指向进程内宿主代码
- 如果入口的路径或真实路径含有 `?`，会在导入前被拒绝，错误会指出该路径，并说明 Bun 无法从这样的路径加载模块（`src/extensibility/module-path.ts`）：无论说明符采用何种形式，Bun 都会读取在 `?` 处截断的路径。带有 `#`、`%`、空格或 `'` 的路径可以加载和重新加载。入口导入的源码模块（TypeScript 或 JavaScript），如果通过链接使其真实路径含有 `?`，仍能加载，因为模块图的 `onLoad` 钩子会提供其源码；非源码模块（JSON、WASM、资源）交由 Bun 自身的加载器处理，因此受该限制。明确写出 `?` 的相对说明符会从那里开始查询字符串，与任何 ESM 加载器一样。钩子、自定义命令和分享脚本加载器执行与入口相同的检查
- 作用域限定的 Bun `onLoad` 钩子会在求值前，将旧版 pi 包说明符（`@mariozechner/*`、`@earendil-works/*`）和裸 `@sinclair/typebox` 重写为宿主捆绑的副本。旧版 Pi 包根导入通过兼容垫片解析：移至 `@oh-my-pi/pi-catalog/models` 的目录符号（`calculateCost`、`modelsAreEqual`、`getBundledProviders`，以及 `getModel`/`getModels` 别名）由旧版 pi-ai 垫片（`src/extensibility/legacy-pi-ai-shim.ts`）重新导出，而旧版 `@oh-my-pi/pi-coding-agent` 导入，包括 `DefaultResourceLoader`，会解析到 `src/extensibility/legacy-pi-coding-agent-shim.ts` 中的兼容加载器
- 模块图自有的 CommonJS 模块使用同步 Bun `onLoad` 对象模块，暴露运行时自有字符串导出键，包括计算得出的名称和不可枚举名称；`default` 仍是完整的 `module.exports` 值。共享求值器保留循环依赖和 `require`/导入的身份一致性，而所需的宿主 ESM 垫片会在同步求值前准备好。无需生成外观文件或通过 AST 重建具名导出
- 捆绑的宿主模块使用 Bun 原生对象加载器。导出 `theme` 的模块会添加一层轻量 ESM 绑定桥接，使现有 `theme` 导入同步跟随宿主赋值，而不替换 UI 的变更监听器
- 包的 `imports` 和 `exports` 模式优先选择 `*` 之前前缀最长的模式，其次选择完整模式最长的模式；精确匹配优先，被排除的目标永远不会回退到更宽泛的模式
- 工厂由 `getExtensionFactory(module)` 选择：如果模块自身是函数，就使用它，否则使用 `module.default`
- 工厂应为函数（`ExtensionFactory`），可以返回 `void` 或 promise；加载会等待其完成，再继续下一个路径

自定义工具（`docs/custom-tools.md`）通过相同函数加载，但使用 `reload: false`：入口及其相对导入不带 `?mtime` 标记，因此每个模块在每个进程中只求值一次，并由工具和会话共享，而宿主包重写仍然生效。

如果导出不是函数，该路径会以结构化错误失败，加载继续。

---

## 失败处理与隔离 \{#failure-handling-and-isolation}

### 加载期间 \{#during-loading}

对于每个扩展路径，导入和工厂失败会被捕获为 `{ path, error }`，
不会阻止其他路径加载。失败工厂对共享的
待处理提供方注册队列所作的变更会回滚。发现本身不在
此逐模块错误结果的覆盖范围内：意外的文件系统或插件
枚举错误可能在导入开始前就导致路径收集被拒绝。

导入和基于文件的工厂调用在 `withHostGuard()` 下运行：加载期间的
`process.exit` / `process.reallyExit` 调用会抛出 `ExtensionExitError`，stdin
监听器以及暂停/原始输入状态会恢复到加载前的快照。这保护的是宿主启动，而不是任意运行时扩展代码。

常见情况：

- 导入失败/文件缺失
- 无效的工厂导出（非函数）
- 执行工厂时抛出异常

### 受限子会话与恢复 \{#restricted-children-and-revival}

受限的 task/eval 子会话将父会话已导入的扩展
工厂重新绑定到自身会话。无需发现环境中的扩展，钩子和提供方
也仍然可用。扩展工具不能扩大受限工具
集合，也不能替换内置工具，包括通过延迟注册进行替换。新的扩展
路径、已加载的父会话绑定实例，以及附加内联工厂仍然
被排除。

恢复的子会话继承当前所属会话的扩展根目录和
已准备的工厂，而不会从保存的会话记录中继承扩展权限。在没有
已准备工厂的情况下进行冷发现时，会遵循所属会话的仅显式加载或
合并根目录设置。

调用方提供的 `CreateAgentSessionOptions.extensions` 会以
合成的 `<inline-N>` 来源 ID 记录在 `preparedExtensions` 中，并且只会在
进程内子会话中重新绑定。`topLevelExtensions`（`@internal`；交互式 CLI 的
Warp 事件桥接）以及会话自身的自动研究和自定义工具工厂
仍归该会话所有。工作线程只重新导入
`resolvedPath` 为文件系统路径的条目；`<inline-N>` 条目到达时不带
工厂，主线程会为每个内联扩展记录一条警告，指出其
ID 和工厂。

扩展工厂在重新绑定时仍会执行宿主代码；工具限制
不是扩展沙箱。现有的逐模块加载失败处理保持不变。

### 运行时隔离模型 \{#runtime-isolation-model}

- 扩展**不在沙箱中运行**（同一进程/运行时）。
- 它们共享一个 `EventBus` 和一个 `ExtensionRuntime` 实例。
- 加载期间，运行时操作方法会有意抛出 `ExtensionRuntimeNotInitializedError`；操作的连接稍后在 `ExtensionRunner.initialize()` 中进行。

### 加载之后 \{#after-loading}

事件通过 `ExtensionRunner` 运行时，处理程序异常会被捕获，
并作为扩展错误发出，而不会导致 runner 循环崩溃。大多数分派
处理程序有 30 秒的时间预算；`session_shutdown` 处理程序并发运行，
预算为 2 秒。`tool_call` 使用
`extensionHandlers.toolCallTimeoutMs`（默认 30,000 ms），等待扩展 UI 对话框时
暂停计时，并在错误或超时时采取关闭策略。
原始的分离回调仍在此隔离之外；请使用
[扩展](./extensions.md#background-work-ctxsetinterval--ctxsettimeout)中介绍的受管定时器。

---

## 最小用户/项目布局示例 \{#minimal-userproject-layout-examples}

### 用户级 \{#user-level}

```text
~/.omp/agent/
  config.yml
  extensions/
    guardrails.ts
    audit/
      index.ts
```

### 项目级 \{#project-level}

```text
<repo>/
  .omp/
    settings.json
    extensions/
      checks/
        package.json
      lint-gates.ts
```

`checks/package.json`：

```json
{
	"omp": {
		"extensions": ["./src/check-a.ts", "./src/check-b.js"]
	}
}
```

仍接受旧版清单键：

```json
{
	"pi": {
		"extensions": ["./index.ts"]
	}
}
```
