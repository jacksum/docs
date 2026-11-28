---
title: "自定义工具"
description: "Oh My Pi 官方仓库文档：自定义工具。"
---

# 自定义工具 \{#custom-tools}

自定义工具是可由模型调用的函数，接入与内置工具相同的工具执行流水线。

自定义工具是一个导出工厂函数的 TypeScript/JavaScript 模块。工厂函数接收宿主 API（`CustomToolAPI`），并返回一个工具或工具数组。

## 它是什么，以及不是什么 \{#what-this-is-and-is-not}

- **自定义工具**：模型可在轮次中调用（`execute` + 参数模式）。
- **扩展**：生命周期/事件框架，可以注册工具并拦截/修改事件。
- **钩子**：通过扩展运行器加载的旧版事件驱动拦截器 API。
- **技能**：静态指导/上下文包，不是可执行工具代码。

如果需要模型直接调用代码，请使用自定义工具。

## 当前代码中的集成路径 \{#integration-paths-in-current-code}

目前有两种集成方式：

1. **SDK 提供的自定义工具**（`options.customTools`）
   - 转换为扩展工具定义，并适配到会话注册表中。
   - 不受限会话会自动启用它们，除非实际生效的定义被隐藏/默认不激活。
   - 在受限会话（`restrictToolNames: true`）中，SDK 提供的自定义工具会被排除，除非设置 `allowRestrictedCustomTools: true`；选择纳入的工具还需名称出现在 `toolNames` 中才会激活。

2. **从文件系统发现的模块**（`discoverCustomToolPaths` / `loadCustomTools`）
   - 不受限会话的引导过程会发现并加载配置/提供方/插件工具模块，然后通过生成的扩展注册它们。
   - 这些函数以及组合辅助函数 `discoverAndLoadCustomTools` 也是 `packages/coding-agent/src/extensibility/custom-tools/loader.ts` 中的库 API。
   - 子代理可以复用 `preloadedCustomToolPaths` 来跳过发现，但工厂函数会重新绑定到每个会话自身的 API。
   - 发现的工具按工作目录加载。执行 `/move` 后（或从另一个项目恢复会话后），顶层会话会发现目标目录的工具，将它们绑定到目标 cwd，并暂停上一个目录的工具；移回时恢复它们。之后启动的子代理会继承目标目录的路径。

```text
Model tool call flow

LLM tool call
   │
   ▼
Tool registry (built-ins + registered custom definitions)
   │
   ▼
CustomTool.execute(toolCallId, params, onUpdate, ctx, signal)
   │
   ├─ onUpdate(...)  -> streamed partial result
   └─ return result  -> final tool content/details
```

## 发现位置（加载器 API） \{#discovery-locations-loader-api}

`discoverAndLoadCustomTools(configuredPaths, cwd, builtInToolNames, pushPendingAction?, agentDir?)` 合并以下来源：

1. 能力提供方（`toolCapability`），包括：
   - 原生 OMP 配置（`<agentDir>/tools`，默认为 `~/.omp/agent/tools`；`.omp/tools`）
   - OMP 包根目录和市场插件
2. 已启用的已安装插件清单（通过插件加载器读取用户 `~/.omp/plugins` 和当前项目 `.omp/plugins` 注册表；项目包会遮蔽同名用户包）
3. 传给加载器的显式配置路径

`discoverCustomToolPaths(..., { ambient: false })` 跳过来源 1-2，但 OMP 包根目录除外，此时后者仅列出显式扩展根目录。带有 `disableExtensionDiscovery`（CLI `--no-extensions`）的会话以此方式发现。

### 重要行为 \{#important-behavior}

- 原生用户发现遵循当前配置档案和提供的 `agentDir`。
- 发现过程会对重复的解析路径去重；`loadCustomTools` 本身加载所提供的路径列表。
- 文件系统工具名称若与所提供的内置名称或已加载的自定义工具冲突，则会被拒绝。配置路径是追加项，不是按名称覆盖。
- 无效的工厂函数结果按数组条目报告；同一工厂函数中的有效条目仍可加载。导入/工厂函数失败收集在 `errors` 中，不会阻止后续模块。
- 自动工具目录扫描会发现 `.ts` 和 `.js` 模块；原生 OMP 发现还会检查直接子目录中的 `index.ts`。可执行文件发现会排除 `.d.ts`，并在工具名称去重之前过滤掉元数据和脚本。`.md` 和 `.json` 等声明式元数据仍可供能力使用方使用，但不会作为可执行工具加载。
- `.mjs` 和 `.cjs` 模块可以通过显式配置路径或声明的插件工具条目加载，但上述工具目录扫描不会自动发现它们。显式配置的 `.md` 或 `.json` 路径仍会产生加载错误。
- 相对配置路径从 `cwd` 解析；会展开 `~`。

## 模块约定 \{#module-contract}

自定义工具模块必须导出一个函数（推荐默认导出）：

```ts
import type { CustomToolFactory } from "@oh-my-pi/pi-coding-agent";

const factory: CustomToolFactory = pi => ({
	name: "repo_stats",
	label: "Repo Stats",
	description: "Counts tracked TypeScript files",
	parameters: pi.zod.object({
		glob: pi.zod.string().optional(),
	}),

	async execute(toolCallId, params, onUpdate, ctx, signal) {
		onUpdate?.({
			content: [{ type: "text", text: "Scanning files..." }],
			details: { phase: "scan" },
		});

		const result = await pi.exec("git", ["ls-files", params.glob ?? "**/*.ts"], { signal, cwd: pi.cwd });
		if (result.killed) {
			throw new Error("Scan was cancelled");
		}
		if (result.code !== 0) {
			throw new Error(result.stderr || "git ls-files failed");
		}

		const files = result.stdout.split("\n").filter(Boolean);
		return {
			content: [{ type: "text", text: `Found ${files.length} files` }],
			details: { count: files.length, sample: files.slice(0, 10) },
		};
	},

	onSession(event) {
		if (event.reason === "shutdown") {
			// cleanup resources if needed
		}
	},
});

export default factory;
```

对 `@oh-my-pi/*` 宿主包（以及其旧版 `@mariozechner/*` / `@earendil-works/*` 作用域）的值导入会解析到 omp 自身运行的副本，编译后的二进制文件中也是如此；工具的其他依赖从其自身位置解析。工具模块及其相对导入每个进程求值一次；每个会话会再次调用工厂函数。

参数模式可以使用兼容 Zod 的 omptype 构建器（`pi.zod`）、原生 omptype 构建器（`pi.arktype`）或兼容旧版的 TypeBox 兼容层（`pi.typebox`），并经过共享的验证/传输流水线。

工厂函数返回类型：

- `CustomTool`
- `CustomTool[]`
- `Promise<CustomTool | CustomTool[]>`

## 传给工厂函数的 API 接口（`CustomToolAPI`） \{#api-surface-passed-to-factories-customtoolapi}

来自 `types.ts` 和 `loader.ts`：

- `cwd`：宿主工作目录
- `exec(command, args, options?)`：进程执行辅助函数
- `ui`：UI 上下文（无头模式下可能为空操作）
- `hasUI`：在非交互流程中为 `false`
- `logger`：共享文件日志记录器
- `arktype`：注入的 omptype `type(...)` 构建器
- `zod`：注入的兼容 Zod 的 omptype 构建器
- `typebox`：用于旧版 TypeBox 风格模式的兼容层
- `pi`：注入的 `@oh-my-pi/pi-coding-agent` 导出
- `pushPendingAction(action)`：暂存预览操作，通过运行带纯文本理由的 `resolve` 或 `reject` 命令最终处理

加载器以空操作 UI 上下文和 `hasUI: false` 启动。库宿主可以
在真实 UI 就绪后调用返回的 `setUIContext(...)`。常规 SDK
文件系统工具引导过程目前不会调用该设置函数，因此即使
会话有 TUI，工厂函数 API 的 UI 仍为空操作。如果运行时未
提供待处理操作存储，调用 `pushPendingAction` 会抛出
`Pending action store unavailable for custom tools in this runtime.`

## 执行约定与类型 \{#execution-contract-and-typing}

`CustomTool.execute` 签名：

```ts
execute(toolCallId, params, onUpdate, ctx, signal);
```

- `params` 通过 `Static<TParams>` 从其 omptype 或 TypeBox 模式获得静态类型。
- 运行时参数验证在智能体循环中、执行之前进行。
- `onUpdate` 发出部分结果，用于 UI 流式显示。
- `ctx` 包含 `sessionManager`、`modelRegistry`、当前 `model`、`isIdle()`、`hasQueuedMessages()`、`abort()` 和 `localProtocolOptions`。公开上下文类型也允许 `settings`、`fetch` 和 `autoApprove`，但常规 SDK 转换不会填充这三个字段。
- `signal` 携带取消信号，可能为 `undefined`。

会话引导桥接层将自定义工具转换为扩展 `ToolDefinition`，并按正确参数顺序转发调用。`CustomToolAdapter` 仍可供直接将自定义工具适配到智能体工具接口的库使用方使用。

工具定义还可以声明 `strict`、`hidden`、`loadMode`、`deferrable`、`readsSkillUris`、`mcpServerName`、`mcpToolName`、`legacyName` 和 `approval`。省略 `loadMode` 时，自定义工具名称默认为 `"discoverable"`，但规范的核心内置名称（`read`、`write`、`bash`、`edit`、`glob`、`find`、`eval`、`task`、`wait`、`learn`、`manage_skill`、`context_notes` 和 `new_context`）除外，它们默认为 `"essential"`，因此包装器或重新注册不会将它们降级。显式 `loadMode` 始终优先；使用 `"essential"` 可使其他任何工具保持在顶层。

虽然公开的 `CustomTool` 类型也声明了 `formatApprovalDetails`，但 SDK/发现转换不会将该回调传递到注册的定义中。直接使用 `CustomToolAdapter` 的使用方会保留它。

## 工具如何暴露给模型 \{#how-tools-are-exposed-to-the-model}

- 会话引导过程将纳入的 SDK 提供工具和发现的自定义工具包装为扩展工具定义；库使用方也可以直接使用 `CustomToolAdapter`。
- 它们按名称插入会话工具注册表。
- 不受限 SDK 引导过程会自动启用自定义工具和扩展注册的工具，除非注册表中实际胜出的定义被隐藏/默认不激活。显式 `toolNames` 可以启用隐藏工具。受限会话会排除 SDK 提供的自定义工具，除非设置 `allowRestrictedCustomTools: true`，且只有选择纳入的自定义工具名称出现在 `toolNames` 中时才会暴露该工具；环境文件系统工具发现会被跳过。
- 启用 `tools.commands` 且 `bash` 工具处于激活状态时，已启用的可发现工具会挂载为 bash 工具命令，而不是作为顶层函数公布；没有激活的 `bash` 工具时，它们仍是普通顶层工具。显式请求的工具和核心工具保持在顶层。
- 已挂载工具以裸名称呈现：系统提示词目录会列出它及其单行摘要（工具的 `summary`，否则取描述中的首个非空行），`<name> --help` 则打印由其 JSON 模式派生的用法：必需的顶层标量作为位置参数，每个字段同时可作为标志（`--flag value`；布尔值为 `--flag` / `--no-flag`），并可用 `-j '<json>'` 提供原始参数对象。
- CLI `--tools` 针对完整发现的会话注册表进行验证，包括已注册的自定义工具。未知名称和不可用的内置工具会产生不同的错误。

## 渲染钩子 \{#rendering-hooks}

可选渲染钩子：

- `renderCall(args, options, theme)`
- `renderResult(result, options, theme)`

每个钩子返回 pi-tui 节点（来自 `@oh-my-pi/pi-tui` 的 JSX）、行对象 `{ render(width): string[] }` 或 `undefined`；参见[扩展渲染](./extensions.md#migrating-from-pi-tui)。`theme` 是 pi-tui 的主题，外加 `bold`、`italic`、`underline`、`strikethrough` 和 `inverse`。

常规 SDK 和文件系统发现路径会将自定义工具包装为扩展。在这些路径上，`renderResult` 只接收上述三个参数；桥接层不会转发原始工具参数。公开的 `CustomTool` 类型保留可选的第四个 `args` 参数，供直接使用 `CustomToolAdapter` 的使用方使用。

在扩展适配器路径上，`renderCall` 的 `options` 参数还响应 `Theme` API，使上游 pi 渲染器能够用第二个参数设置样式。第三个参数仍是主题，而不是上游 pi 的上下文对象。

交互式 UI 中的运行时行为：

- 如果存在钩子，其输出绘制在带内边距的自定义工具框内，先调用、后结果。
- 节点由终端和 Tern 绘制。行对象仅由终端绘制；Tern 对它们显示通用工具卡片。
- `renderResult` 接收 `{ expanded, isPartial, spinnerFrame? }` 作为其 `options` 参数。
- 钩子抛出异常，或返回既不是节点也不是行的内容时，会报告错误；没有其他内容绘制时，显示通用工具卡片。行在绘制时抛出异常，会绘制一行错误。

## 会话/状态处理 \{#sessionstate-handling}

可选的 `onSession(event, ctx)` 接收会话生命周期事件，包括：

- `start`、`switch`、`branch`、`tree`、`shutdown`
- `auto_compaction_start`、`auto_compaction_end`
- `auto_retry_start`、`auto_retry_end`
- `ttsr_triggered`、`todo_reminder`

分支/会话上下文变化时，使用 `ctx.sessionManager` 从历史记录重建状态。

## 失败与取消语义 \{#failures-and-cancellation-semantics}

### 同步/异步失败 \{#synchronousasync-failures}

- `execute` 中抛出异常（或 Promise 被拒绝）会被视为工具失败。
- 智能体运行时将失败转换为工具结果消息，包含 `isError: true` 和错误文本内容。
- 使用扩展包装器时，`tool_result` 处理器可以进一步改写内容/详情，甚至覆盖错误状态。

### 取消 \{#cancellation}

- 智能体中止通过 `AbortSignal` 传播到 `execute`。
- 将 `signal` 转发到子进程工作（`pi.exec(..., { signal })`），以实现协作式取消。
- `ctx.abort()` 允许工具请求中止当前智能体操作。

### onSession 错误 \{#onsession-errors}

- 正常会话集成会捕获 `onSession` 错误，并将其作为警告记录；使用自身生命周期分派的库使用方必须自行提供错误处理。

## 设计时需要考虑的实际约束 \{#real-constraints-to-design-for}

- 工具名称必须在当前注册表中全局唯一。
- 优先在 `details` 中使用确定性的、符合模式的输出，以供渲染器/状态重建使用。
- 使用 `pi.hasUI` 保护 UI 调用。
- 将工具目录中的 `.md`/`.json` 视为元数据，而不是可执行模块。
