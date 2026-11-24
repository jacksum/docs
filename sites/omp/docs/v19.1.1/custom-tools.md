---
title: "自定义工具"
description: "Oh My Pi v19.1.1 仓库文档：自定义工具。"
---

# 自定义工具 \{#custom-tools}

自定义工具是模型可调用的函数，接入与内置工具相同的执行流程。

自定义工具由 TypeScript 或 JavaScript 模块定义，模块导出一个工厂函数。函数接收宿主 API（`CustomToolAPI`），返回一个工具或一个工具数组。

## 自定义工具与其他扩展方式 \{#what-this-is-and-is-not}

- **自定义工具**：由模型在轮次中调用，包含 `execute` 和参数 schema。
- **扩展**：生命周期和事件框架，可以注册工具、拦截或修改事件。
- **钩子**：由扩展运行器加载的旧版事件拦截 API。
- **技能**：提供静态指引或上下文的包，不含可执行的工具代码。

如果需要模型直接调用代码，请使用自定义工具。

## 当前集成方式 \{#integration-paths-in-current-code}

目前支持两种集成方式：

1. **由 SDK 提供的自定义工具**（`options.customTools`）
   - 转为扩展工具定义，再适配到会话注册表中。
   - 在不受限的会话中自动启用，除非实际生效的定义为隐藏或默认不启用。
   - 受限会话（`restrictToolNames: true`）会排除 SDK 提供的自定义工具，除非设置 `allowRestrictedCustomTools: true`。即使选择允许，也只有名称出现在 `toolNames` 中的工具才会启用。

2. **从文件系统发现的模块**（`discoverCustomToolPaths` / `loadCustomTools`）
   - 不受限的会话在初始化时发现并加载配置、提供程序和插件中的工具模块，再由生成的扩展注册。
   - 这两个函数及组合辅助函数 `discoverAndLoadCustomTools` 也是 `packages/coding-agent/src/extensibility/custom-tools/loader.ts` 中的库 API。
   - 子代理可复用 `preloadedCustomToolPaths` 跳过发现，但工厂函数会重新绑定到各自会话的 API。
   - 工具按工作目录发现和加载。执行 `/move` 或从另一个项目恢复会话后，顶层会话会发现目标目录的工具，将它们绑定到目标工作目录，并暂停原目录的工具。移回原目录会恢复原工具。此后启动的子代理会继承目标目录的工具路径。

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

1. 能力提供程序（`toolCapability`），包括：
   - OMP 原生配置（`<agentDir>/tools`，默认为 `~/.omp/agent/tools`；`.omp/tools`）。
   - Claude 配置（`<Claude config dir>/tools`，默认为 `~/.claude/tools`；`.claude/tools`）。
   - Codex 配置（`~/.codex/tools`、`.codex/tools`）。
   - OMP 包根目录和 Claude 插件市场的插件。
2. 已安装且启用的插件清单，通过插件加载器使用用户的 `~/.omp/plugins` 和当前项目的 `.omp/plugins` 注册表。项目包优先于同名用户包。
3. 显式传给加载器的配置路径。

### 发现与冲突处理 \{#important-behavior}

- 通过 `enabledProviders`（例如 `"claude"` 或 `"codex"`）启用其他工具的用户目录。除非禁用整个提供程序，否则仍会发现这些工具的项目目录。`CLAUDE_CONFIG_DIR` 也会启用 Claude 用户来源。
- 原生用户工具的发现遵循当前配置档案和传入的 `agentDir`。
- 发现过程会对解析后重复的路径去重；`loadCustomTools` 本身按提供的路径列表加载。
- 文件系统工具如果与指定的内置工具或已加载的自定义工具同名，会被拒绝。配置路径追加到列表中，不能覆盖同名工具。
- 工厂函数返回数组时，会逐项报告无效结果，同一工厂的有效条目仍可加载。导入或调用工厂函数失败会记入 `errors`，不会阻止后续模块加载。
- 自动扫描工具目录时会发现 `.ts` 和 `.js` 模块。OMP 原生发现还会检查直接子目录中的 `index.ts`。发现可执行工具时跳过 `.d.ts`，并在工具名去重前过滤元数据和脚本。`.md`、`.json` 等声明式元数据仍可供能力使用方访问，但不会作为可执行工具加载。
- 可通过显式配置路径或已声明的插件工具条目加载 `.mjs` 和 `.cjs` 模块，但上述目录扫描不会自动发现它们。即使显式配置，传入 `.md` 或 `.json` 路径仍会导致加载错误。
- 相对路径以 `cwd` 为起点解析，`~` 会展开。

## 模块约定 \{#module-contract}

自定义工具模块必须导出一个函数，优先使用默认导出：

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

以值形式导入 `@oh-my-pi/*` 宿主包（以及旧版 `@mariozechner/*` 和 `@earendil-works/*` 作用域）时，使用 omp 自身运行的那份包，编译后的二进制文件也一样。工具的其他依赖从工具所在位置解析。每个工具模块及其相对导入在同一进程中只求值一次，各会话会分别调用工厂函数。

参数 schema 可以使用兼容 Zod 的 omptype 构造器（`pi.zod`）、原生 omptype 构造器（`pi.arktype`）或兼容旧版的 TypeBox 适配层（`pi.typebox`）。它们使用同一套验证和传输流程。

工厂函数的返回类型：

- `CustomTool`
- `CustomTool[]`
- `Promise<CustomTool | CustomTool[]>`

## 传入工厂函数的 API（`CustomToolAPI`） \{#api-surface-passed-to-factories-customtoolapi}

来自 `types.ts` 和 `loader.ts`：

- `cwd`：宿主工作目录。
- `exec(command, args, options?)`：执行进程的辅助函数。
- `ui`：界面上下文，在无界面模式中可以为空操作。
- `hasUI`：在非交互流程中为 `false`。
- `logger`：共享的文件日志记录器。
- `arktype`：注入的 omptype `type(...)` 构造器。
- `zod`：注入的兼容 Zod 的 omptype 构造器。
- `typebox`：兼容旧版 TypeBox 风格 schema 的适配层。
- `pi`：注入的 `@oh-my-pi/pi-coding-agent` 导出项。
- `pushPendingAction(action)`：暂存待预览的操作，之后通过带纯文本理由的 `resolve` 或 `reject` 命令确认或丢弃。

加载器初始使用空操作界面上下文，且 `hasUI: false`。真实界面就绪后，库宿主可以调用返回的 `setUIContext(...)`。普通 SDK 的文件系统工具初始化目前不调用该设置函数，因此即使会话具有终端界面，工厂 API 中的界面也保持空操作。如果运行时未提供待处理操作存储，调用 `pushPendingAction` 会抛出 `Pending action store unavailable for custom tools in this runtime.`。

## 执行约定与类型 \{#execution-contract-and-typing}

`CustomTool.execute` 的签名：

```ts
execute(toolCallId, params, onUpdate, ctx, signal);
```

- `params` 通过 `Static<TParams>` 从 omptype 或 TypeBox schema 推导静态类型。
- 智能体循环会在执行前校验运行时参数。
- `onUpdate` 发送部分结果，供界面流式展示。
- `ctx` 包含 `sessionManager`、`modelRegistry`、当前 `model`、`isIdle()`、`hasQueuedMessages()`、`abort()` 和 `localProtocolOptions`。公开的上下文类型还允许 `settings`、`fetch` 和 `autoApprove`，但通常的 SDK 转换路径不填充这三个字段。
- `signal` 用于传递取消请求，也可能是 `undefined`。

会话初始化桥接层把自定义工具转换为扩展 `ToolDefinition`，并按正确的参数顺序转发调用。需要把自定义工具直接适配到智能体工具接口时，库的使用方仍可使用 `CustomToolAdapter`。

工具定义也可声明 `strict`、`hidden`、`loadMode`、`deferrable`、`readsSkillUris`、`mcpServerName`、`mcpToolName`、`legacyName` 和 `approval`。如果未指定 `loadMode`，自定义工具的名称默认按 `"discoverable"` 加载。使用必需内置工具标准名称的定义（`read`、`write`、`bash`、`edit`、`glob`、`find`、`eval`、`task`、`wait`、`learn`、`manage_skill`、`context_notes` 和 `new_context`）则默认按 `"essential"` 加载，避免封装或重新注册降低工具的优先级。显式的 `loadMode` 始终优先；用 `"essential"` 可让其他工具保持为顶层工具。

公开的 `CustomTool` 类型也声明了 `formatApprovalDetails`、`describeCall` 和 `describeResult`，但 SDK 或发现路径的转换不会把这些回调传入注册定义。直接使用 `CustomToolAdapter` 时仍可保留这些回调。

## 向模型提供工具 \{#how-tools-are-exposed-to-the-model}

- 初始化会话时，SDK 提供及已发现的自定义工具封装成扩展工具定义。库的使用方也可以直接使用 `CustomToolAdapter`。
- 这些工具按名称加入会话工具注册表。
- SDK 在初始化不受限的会话时，会自动启用自定义工具和扩展注册的工具，除非注册表中最终生效的定义为隐藏或默认不启用。显式 `toolNames` 可启用隐藏工具。受限会话排除 SDK 提供的自定义工具，除非使用 `allowRestrictedCustomTools: true`；即便允许，也只在名称出现在 `toolNames` 中时才向模型提供。发现环境中的文件系统工具的过程会跳过。
- 如果启用 `tools.commands` 且 `bash` 工具处于启用状态，已启用的可发现工具会挂载为 Bash 工具命令，而不作为顶层函数声明。如果没有启用 `bash` 工具，它们仍是普通的顶层工具。显式请求的工具和必需工具保持在顶层。
- 挂载的工具以不带前缀的名称呈现。系统提示词的工具目录会为其提供一行摘要，取自工具的 `summary` 或说明中的第一个非空行。`<name> --help` 根据 JSON schema 打印用法：顶层必填标量可作为位置参数，所有字段也都可用选项传入（`--flag value`，布尔值为 `--flag` / `--no-flag`），或用 `-j '<json>'` 传入原始参数对象。
- CLI 的 `--tools` 按完整发现的会话工具注册表进行校验，包括已注册的自定义工具。未知工具名称和不可用的内置工具会报不同的错误。

## 渲染钩子 \{#rendering-hooks}

可选的渲染钩子：

- `renderCall(args, options, theme)`
- `renderResult(result, options, theme)`

普通 SDK 和文件系统发现路径会把自定义工具封装成扩展。在这些路径中，`renderResult` 只接收上面列出的三个参数，桥接层不转发原始工具参数。公开的 `CustomTool` 类型保留可选的第四个 `args` 参数，供直接使用 `CustomToolAdapter` 的调用方使用。

通过扩展适配器时，`renderCall` 的 `options` 参数还兼容 `Theme` API，让上游 Pi 的渲染器可把第二个参数用于样式。第三个参数仍是主题，不是上游 Pi 的上下文对象。

终端界面的运行时行为：

- 存在钩子时，工具输出会在 `Box` 容器内渲染。
- `renderResult` 接收 `{ expanded, isPartial, spinnerFrame? }` 作为 `options` 参数。
- 渲染错误会被捕获并记入日志，界面回退到默认文本渲染。

## 会话与状态处理 \{#sessionstate-handling}

可选的 `onSession(event, ctx)` 接收会话生命周期事件，包括：

- `start`、`switch`、`branch`、`tree`、`shutdown`
- `auto_compaction_start`、`auto_compaction_end`
- `auto_retry_start`、`auto_retry_end`
- `ttsr_triggered`、`todo_reminder`

分支或会话的上下文变化时，用 `ctx.sessionManager` 从历史记录恢复状态。

## 失败和取消行为 \{#failures-and-cancellation-semantics}

### 同步与异步失败 \{#synchronousasync-failures}

- 在 `execute` 中抛出异常或返回被拒绝的 Promise，均视为工具失败。
- 智能体运行时将失败转为带 `isError: true` 和错误文本的工具结果消息。
- 使用扩展封装时，`tool_result` 处理器可以进一步改写内容或详情，甚至覆盖错误状态。

### 取消 \{#cancellation}

- 智能体的中止请求通过 `AbortSignal` 传到 `execute`。
- 将 `signal` 转发给子进程任务（`pi.exec(..., { signal })`），以配合取消操作。
- `ctx.abort()` 允许工具请求中止当前智能体操作。

### onSession 错误 \{#onsession-errors}

- 通常的会话集成会捕获 `onSession` 错误，并以警告记入日志。库的使用方如果自行调度生命周期事件，需自行处理错误。

## 设计约束 \{#real-constraints-to-design-for}

- 工具名称必须在当前注册表中全局唯一。
- `details` 中优先使用确定且符合 schema 的输出，供渲染器和状态重建使用。
- 使用界面前检查 `pi.hasUI`。
- 工具目录中的 `.md`/`.json` 只作为元数据，不是可执行模块。
