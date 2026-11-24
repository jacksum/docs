---
title: "钩子"
description: "Oh My Pi v19.1.1 仓库文档：钩子。"
---

# 钩子 \{#hooks}

本文描述 `packages/coding-agent/src/extensibility/hooks/*` 中**当前的钩子子系统代码**。

## 当前运行时的加载路径 \{#current-status-in-runtime}

默认 CLI 运行时初始化**扩展运行器**路径。当前启动流程如下：

- `--hook` 视为 `--extension` 的别名，CLI 路径合并到 `additionalExtensionPaths`。
- 通过 `hookCapability` 发现的 JavaScript 或 TypeScript 钩子工厂（如 `.omp/hooks/pre/*.ts`）作为扩展模块加载，使其 `pi.on(...)` 处理器能绑定到运行时事件总线。
- 工具由 `ExtensionToolWrapper` 封装，不由 `HookToolWrapper` 封装。
- 上下文转换和生命周期事件通过 `ExtensionRunner` 处理。

因此，本文记录旧版钩子子系统本身的实现（类型、加载器、运行器、封装器），也说明扩展运行器加载已发现钩子路径时仍接受的工厂函数形式。

普通会话中，已发现的工厂接收的是 `ExtensionAPI` / `ExtensionContext`，不是 `HookAPI` / `HookContext` 的实例。两者共有的 `pi.on(...)` 处理器可用，但旧版专用的上下文名称没有兼容层。例如，在扩展中使用 `ctx.hasPendingMessages()`，而非旧版 `ctx.hasQueuedMessages()`。新的运行时集成建议使用[扩展](./extensions.md)。除非另有说明，下文的运行器和封装器指旧版库路径。

## 关键文件 \{#key-files}

- `packages/coding-agent/src/extensibility/hooks/types.ts`：钩子上下文、事件类型和结果约定。
- `packages/coding-agent/src/extensibility/hooks/loader.ts`：模块加载以及钩子发现桥接。
- `packages/coding-agent/src/extensibility/hooks/runner.ts`：事件分发、命令查找及错误通知。
- `packages/coding-agent/src/extensibility/hooks/tool-wrapper.ts`：执行前后拦截工具的封装器。
- `packages/coding-agent/src/extensibility/hooks/index.ts`：导出与再导出。
- `packages/coding-agent/src/extensibility/shared-events.ts`：共享事件及结果约定。
- `packages/coding-agent/src/extensibility/extensions/loader.ts`：当前运行时的发现逻辑。
- `packages/coding-agent/src/extensibility/extensions/wrapper.ts`：当前工具封装器和审批检查。

## 钩子模块 \{#what-a-hook-module-is}

钩子模块必须默认导出一个工厂函数：

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function hook(pi: HookAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash" && String(event.input.command ?? "").includes("rm -rf")) {
			return { block: true, reason: "blocked by policy" };
		}
	});
}
```

工厂函数可以执行以下操作：

- 用 `pi.on(...)` 注册事件处理器。
- 用 `pi.sendMessage(...)` 发送持久化的自定义消息。
- 用 `pi.appendEntry(...)` 保存不发送给大模型的状态。
- 用 `pi.registerCommand(...)` 注册斜杠命令。
- 用 `pi.registerMessageRenderer(...)` 注册自定义消息渲染器。
- 用 `pi.exec(...)` 运行 shell 命令，并用 `pi.logger` 记录日志。
- 使用注入的 Zod 兼容构造器 `pi.zod`、omptype 原生构造器 `pi.arktype`、旧版 `pi.typebox`，以及 `pi.pi` 提供的包导出项。

## 发现与加载 \{#discovery-and-loading}

启用环境自动发现时，会话通过扩展运行器加载由 `hookCapability` 发现的 JavaScript 或 TypeScript 钩子工厂。`discoverExtensionPaths(configuredPaths, cwd, disabledExtensionIds?, options?)` 按以下步骤执行：

1. 仅从原生提供程序加载扩展模块。
2. 从钩子能力注册表加载可导入的 `.ts` / `.js` 工厂，除非设置 `includeAmbientHooks: false`。
3. 追加已启用插件的扩展入口。
4. 解析显式配置的文件或目录。

路径按绝对路径去重。设为 `ambient: false` 时，跳过原生和已安装内容的发现，但已配置的包根目录仍可提供钩子工厂。外部工具的用户级来源须通过 `enabledProviders` 显式启用；项目级来源不受这一用户级限制。

### 原生发现位置 \{#native-discovery-location}

原生提供程序在每个配置根目录只扫描两个子目录。**直接**放在 `hooks/` 下的工厂不会被发现：

- 项目：`<cwd>/.omp/hooks/pre/*.{ts,js}` 和 `<cwd>/.omp/hooks/post/*.{ts,js}`。
- 用户：`<agentDir>/hooks/pre/*.{ts,js}` 和 `<agentDir>/hooks/post/*.{ts,js}`（默认 `~/.omp/agent/hooks/...`，随配置档案和 `PI_CODING_AGENT_DIR` 变化）。

原生环境发现不会找到直接放在 `<cwd>/.omp/hooks/` 下的工厂。将它放到 `pre/` 或 `post/`，或显式传入路径。跳过以点开头的条目及非文件。目录和不含路径的文件名提供能力元数据和去重键，不会自动注册事件：工厂仍须调用 `pi.on(...)`。这与 `.claude/hooks/pre|post/` 的行为一致。扩展流水线只追加钩子能力中的 `.ts` / `.js` 工厂。显式扩展路径使用共享模块解析器。加载顺序和禁用控制见[扩展加载](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/extension-loading.md)。

旧版 `discoverAndLoadHooks(configuredPaths, cwd)` 辅助函数仍然可用，按以下步骤执行：

1. 从能力注册表加载发现的钩子（`loadCapability("hooks")`）。
2. 追加显式配置的路径，并按绝对路径去重。
3. 调用 `loadHooks(allPaths, cwd)`。

`loadHooks` 随后导入各路径，并要求每个模块有一个 `default` 函数。

### 路径解析 \{#path-resolution}

`loader.ts` 按以下方式解析钩子路径：

- 绝对路径：原样使用。
- `~` 路径：展开主目录。
- 相对路径：相对于 `cwd` 解析。

## 事件 \{#event-surfaces}

`types.ts` 为钩子事件提供强类型定义。

### 会话事件 \{#session-events}

- `session_start`
- `session_before_switch`：可返回 `{ cancel?: boolean }`。
- `session_switch`
- `session_clear`
- `session_before_branch`：可返回 `{ cancel?: boolean; skipConversationRestore?: boolean }`。
- `session_branch`
- `session_before_compact`：可返回 `{ cancel?: boolean; compaction?: CompactionResult }`。
- `session.compacting`：可返回 `{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }`。
- `session_compact`
- `session_before_tree`：可返回 `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }`。
- `session_tree`
- `session_shutdown`

`session_before_branch` 和 `session_branch` 携带 `reason`，它决定 `session_before_branch.entryId` 的含义。对于 `"branch"`（`branch(entryId)`、`/branch`），它指回退到的用户消息：该消息及之后的一切都会被丢弃。对于 `"fork"`（`AgentSession.fork(entryId)` 或带 `entryId` 的 RPC `fork`）和 `"btw"`（将 `/btw` 提升为会话），它是新会话保留的最后一个条目。

`session_clear` 是 `/clear`（或 `AgentSession.resetSessionContext()`）成功在原会话中重置上下文后发出的不可取消通知。可以用它让「已注入」指令的缓存失效。所有处理器在重置返回前运行完毕。即使成功清除的上下文为空，也会触发该通知；会话忙或重置被拒绝时不会触发。它不改变会话 ID、会话文件或历史记录。

### 智能体与上下文事件 \{#agentcontext-events}

- `context`：可返回 `{ messages?: Message[] }`。
- `before_agent_start`：可返回 `{ message?: { customType; content; display; details; attribution } }`。
- `agent_start`
- `agent_end`
- `turn_start`
- `turn_end`
- `auto_compaction_start`
- `auto_compaction_end`
- `auto_retry_start`
- `auto_retry_end`
- `ttsr_triggered`
- `todo_reminder`

### 工具事件（模型调用前后） \{#tool-events-prepost-model}

- `tool_call`（执行前）：可返回 `{ block?: boolean; reason?: string; input?: Record<string, unknown>; additionalContext?: string }`。若处理器不阻止调用，返回的 `input` 会替换工具用于执行的参数，即原始执行输入，而不是归一化后的 `event.input`。当 `block` 为真时，忽略此输入。所有未阻止调用的处理器返回的不同非空 `additionalContext` 都携带由处理器编写的可信指令。这些指令在工具结果之后、下次向模型提供方发起请求之前传递；传输支持时，以开发者或系统优先级传递。原始工具输出及其他不可信数据必须留在工具结果内。
- `tool_result`（执行后）：可返回 `{ content?; details?; isError?; additionalContext?: string }`。无论成功还是失败，上下文均在工具输出之外传递。如果指引只适用于一种结果，请检查 `event.isError`。处理器的覆盖值按字段合并，因此后一个处理器省略某字段时，包括只返回上下文时，不会清除前一个处理器为该字段提供的值。

返回的 `input` 不适用于模型提供方原生的 `computer` 调用，其事件输入是构造出的视图，并非执行参数。`edit` 的事件输入也可能包含派生出的 `path` / `paths` 字段；这些字段仅供策略检查，不一定是有效的执行参数。

在普通扩展运行器路径中，模型发出的 `tool_call` 会在准备参数时运行，先于调度、`tool_execution_start` 和审批。替换输入会重新校验，并成为显示、持久化和执行的调用内容。智能体循环未处理的嵌套或直接分发由扩展封装器发出该事件。审批会评估修订后的输入。此行为与下文的独立 `HookToolWrapper` 不同。

Eval 预置 API 的调用（例如 `browser.open(...)`、直接调用 `BrowserTab` 辅助方法、`tab.run(...)`、直接调用 `computer` 辅助方法和 `computer.run(fnOrCode, options)`）属于宿主桥接调用，不属于 AgentTool 调用，因此不发出 `tool_call` 或 `tool_result`。

```text
Hook tool interception flow

tool_call handlers
   │
   ├─ any { block: true }? ── yes ──> throw (tool blocked)
   │
   └─ no
      │
      ▼
   execute underlying tool
      │
      ├─ success ──> tool_result handlers can override { content, details }
      │                    and attach passive additionalContext
      │
      └─ error   ──> emit tool_result(isError=true), deliver returned
                     additionalContext, then rethrow original error
```

## 执行过程与修改规则 \{#execution-model-and-mutation-semantics}

### 1）执行前：`tool_call` \{#1-pre-execution-tool_call}

`HookToolWrapper.execute()` 在工具执行前发出 `tool_call`。

- 任意处理器返回 `{ block: true }` 时，停止执行，并丢弃为该调用收集的上下文。
- 处理器抛出异常时，封装器按失败即阻止处理，阻止执行并丢弃已收集的上下文。
- 只有工具返回非错误结果后才转发已收集上下文。工具抛出异常或返回 `isError` 结果时丢弃上下文。
- 返回的 `reason` 作为抛出错误的文本。

### 2）工具执行 \{#2-tool-execution}

未被阻止时，底层工具正常执行。

### 3）执行后：`tool_result` \{#3-post-execution-tool_result}

工具返回后（包括返回错误结果的情况），封装器发出 `tool_result`，包含：

- `toolName`、`toolCallId` 和对实际执行参数归一化后得到的 `input`。
- 在扩展运行器中，由 JavaScript 或 Python Eval 单元发起的调用，以及内核定义的工具发起的调用，其 `tool_call` 和 `tool_result` 都包含 `parentToolCallId`。它标识直接包含该调用的外层调用；直接调用不包含它。
- `content`
- `details`
- `isError: result.isError === true`

处理器返回覆盖项时：

- `content` 可以替换结果内容。
- `details` 可以替换结果详情。
- `additionalContext` 在工具结果之外携带可信指引。按注册顺序拼接各处理器不同的非空白值，忽略首尾空白相同的重复项，并在该调用的 `tool_call` 上下文之前传递。同一批次的调用如果拼接后的上下文与先前某调用相同，只传递一次。

如果执行抛出异常，封装器发出含 `isError: true` 和错误文本内容的 `tool_result`，传递返回的 `additionalContext`，随后重新抛出原异常。返回的内容或详情补丁不能替换这个异常。如果工具返回的是 `isError: true` 结果，则仍应用内容与详情补丁，但错误标志保持为真。仅应在失败后运行的处理器必须检查 `event.isError`；与 `PostToolUse` 等价的处理器必须拒绝失败结果。

### 钩子可修改的内容 \{#what-hooks-can-mutate}

- 通过 `context` 修改单次大模型调用的上下文（按链式替换 `messages`）。
- 通过 `tool_call` 或 `tool_result` 的 `additionalContext` 为下一次请求提供背景上下文。
- 通过从 `tool_call` 返回 `input` 修改工具的原始执行参数。
- 修改工具返回结果的内容或详情，包括返回的错误结果（`tool_result` 路径）。
- 用 `before_agent_start` 注入智能体运行前的消息。
- 通过 `session_before_*` 和 `session.compacting` 控制取消、自定义上下文压缩及会话树行为。

### 此实现中钩子无法修改的内容 \{#what-hooks-cannot-mutate-in-this-implementation}

- 工具抛出异常后的执行流程不能恢复，错误路径会重新抛出异常。
- 无法修改封装器行为中的最终成功或错误状态。类型允许返回 `isError`，但 `HookToolWrapper` 不应用它。

这些是旧版封装器的限制，不是当前扩展封装器的约定。`ExtensionToolWrapper` 会应用 `tool_result` 的内容、详情及 `isError` 补丁，也会应用于它将执行异常转换成的错误结果。该路径见扩展文档。

## 顺序与冲突规则 \{#ordering-and-conflict-behavior}

### 发现顺序 \{#discovery-level-ordering}

能力提供程序按优先级排序，较高的在前。按能力键去重，首先发现的保留。

对于 `hooks`，能力键是 `${type}:${tool}:${name}`。优先级较低的重复项会标记为被遮蔽，并从实际发现列表中排除。

### 加载顺序 \{#load-order}

`discoverAndLoadHooks` 构建扁平的 `allPaths` 列表，按解析后的绝对路径去重；`loadHooks` 再按列表顺序处理。发现目录中的文件顺序取决于 `readdir` 的结果，钩子加载器不进行额外排序。

### 运行时处理器顺序 \{#runtime-handler-order}

在 `HookRunner` 中，处理顺序由注册顺序确定：

1. 钩子数组顺序。
2. 每个钩子或事件下的处理器注册顺序。

各事件类型的冲突处理规则：

- `tool_call`：按处理器顺序保留不同的非空 `additionalContext`。同一调用中，与较早处理器相同的值会丢弃；同一批次中，与较早调用拼接结果相同的上下文也会丢弃。`input` 仍以后者为准。第一次阻止即短路，并丢弃为该调用收集的上下文。处理器看不到其他处理器对输入所做的修改。
- `tool_result`：各处理器的 `content` / `details` / `isError` 覆盖值按字段合并，不会短路。后一个处理器已定义的字段优先；未设置的字段保留前一个处理器的值。因此，只返回详情、错误标志或上下文都不会清除先前的脱敏结果。按处理器顺序保留不同的非空 `additionalContext`，去重规则与 `tool_call` 相同。
- `context`：链式处理。每个处理器接收前一处理器输出的消息。
- `before_agent_start`：保留第一条返回的消息，忽略后续消息。
- `session_before_*`：保留最近返回的结果；`cancel: true` 会立即短路。
- `session.compacting`：最后返回的结果优先。

命令和渲染器冲突：

- `getCommand(name)` 返回各钩子中的第一个匹配项，先加载者优先。
- `getMessageRenderer(customType)` 返回第一个匹配项。
- `getRegisteredCommands()` 返回全部命令，不去重。

## 界面交互（`HookContext.ui`） \{#ui-interactions-hookcontextui}

`HookUIContext` 包含：

- `select`、`confirm`、`input`、`editor`
- `notify`
- `setStatus`
- `custom`
- `setEditorText`、`getEditorText`
- `theme` 读取器

`ctx` 包含 `hasUI`、`cwd`、`sessionManager`、`modelRegistry`、当前 `model`、`isIdle()`、`abort()` 和 `hasQueuedMessages()`。

没有界面时，默认空操作上下文的行为如下：

- `select/input/editor/custom` 返回 `undefined`。
- `confirm` 返回 `false`。
- `notify`、`setStatus`、`setEditorText` 不执行任何操作。
- `getEditorText` 返回 `""`。

### 状态栏行为 \{#status-line-behavior}

通过 `ctx.ui.setStatus(key, text)` 设置的钩子状态文本会按如下方式处理：

- 按键存储。
- 按键名排序。
- 清理文本：移除 OSC、DCS 和其他 ANSI/VT 转义序列，将控制字符转换为空格，合并连续空格，再去掉首尾空格。以 ANSI 渲染的状态栏保留 SGR 前景色和文本样式（`status` 段也会移除背景色）；Rex 或 Tern 原生状态栏仍以强调色显示文本。
- 拼接文本，并按可用宽度截断显示。

## 错误传播与回退 \{#error-propagation-and-fallback}

### 加载时 \{#load-time}

- 模块无效或缺少默认导出时，错误记录在 `LoadHooksResult.errors`。
- 继续加载其他钩子。

### 处理事件时 \{#event-time}

`HookRunner.emit(...)` 会捕获大多数事件的处理器错误，向监听器发出 `HookError`（`hookPath`、`event`、`error`），然后继续处理。

`emitToolCall(...)` 更严格：不会吞掉处理器错误，而是将其传播给调用方。在 `HookToolWrapper` 中，这会阻止工具调用，以保证失败时安全。

旧版运行器不为 `tool_call` 设置超时，可以等待界面输入。扩展运行器有独立的处理器超时和取消行为。

## API 示例 \{#realistic-api-examples}

### 阻止不安全的 Bash 命令 \{#block-unsafe-bash-commands}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function (pi: HookAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;
		const cmd = String(event.input.command ?? "");
		if (!cmd.includes("rm -rf")) return;

		if (!ctx.hasUI) return { block: true, reason: "rm -rf blocked (no UI)" };
		const ok = await ctx.ui.confirm("Dangerous command", `Allow: ${cmd}`);
		if (!ok) return { block: true, reason: "user denied command" };
	});
}
```

### 工具执行后脱敏输出 \{#redact-tool-output-on-post-execution}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function (pi: HookAPI): void {
	pi.on("tool_result", async event => {
		if (event.toolName !== "read" || event.isError) return;

		const redacted = event.content.map(chunk => {
			if (chunk.type !== "text") return chunk;
			return {
				...chunk,
				text: chunk.text.replaceAll(/API_KEY=\S+/g, "API_KEY=[REDACTED]"),
			};
		});

		return { content: redacted };
	});
}
```

### 为每次大模型调用调整上下文 \{#modify-model-context-per-llm-call}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function (pi: HookAPI): void {
	pi.on("context", async event => {
		const filtered = event.messages.filter(msg => !(msg.role === "custom" && msg.customType === "debug-only"));
		return { messages: filtered };
	});
}
```

### 用适用于命令的上下文方法注册斜杠命令 \{#register-slash-command-with-command-safe-context-methods}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function (pi: HookAPI): void {
	pi.registerCommand("handoff", {
		description: "Create a new session with setup message",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();
			await ctx.newSession({
				parentSession: ctx.sessionManager.getSessionFile(),
				setup: async sm => {
					sm.appendMessage({
						role: "user",
						content: [{ type: "text", text: "Continue from prior session summary." }],
						timestamp: Date.now(),
					});
				},
			});
		},
	});
}
```

## 导出项 \{#export-surface}

`packages/coding-agent/src/extensibility/hooks/index.ts` 和包子路径 `@oh-my-pi/pi-coding-agent/extensibility/hooks` 导出：

- 加载 API（`discoverAndLoadHooks`、`loadHooks`）。
- 运行器和封装器（`HookRunner`、`HookToolWrapper`）。
- 全部钩子类型。
- 再导出 `execCommand`。

包根路径（`@oh-my-pi/pi-coding-agent`）不会再导出 `HookAPI`。请从钩子子路径导入旧版钩子类型。
