---
title: "钩子"
description: "Oh My Pi 官方仓库文档：钩子。"
---

# 钩子 \{#hooks}

本文介绍 `packages/coding-agent/src/extensibility/hooks/*` 中的**当前钩子子系统代码**。

## 运行时中的当前状态 \{#current-status-in-runtime}

默认 CLI 运行时初始化的是**扩展 runner** 路径。在当前启动流程中：

- `--hook` 被视为 `--extension` 的别名（CLI 路径会合并到 `additionalExtensionPaths`）
- 通过 `hookCapability` 发现的 JS/TS 钩子工厂（例如 `.omp/hooks/pre/*.ts`）作为扩展模块加载，使其 `pi.on(...)` 处理程序绑定到运行时事件总线
- 工具由 `ExtensionToolWrapper` 包装，而不是 `HookToolWrapper`
- 上下文转换和生命周期事件发出都通过 `ExtensionRunner` 进行

因此，本文记录的是旧版钩子子系统本身的实现（类型/加载器/runner/包装器），以及发现的钩子路径由扩展 runner 加载时仍接受的工厂形式。

在正常会话中，发现的工厂收到的是 `ExtensionAPI`/`ExtensionContext`，
而不是 `HookAPI`/`HookContext` 实例。共享的 `pi.on(...)`
处理程序可以工作，但不会为旧版专属的上下文名称提供垫片：例如，
在扩展中使用 `ctx.hasPendingMessages()`，而不是旧版的
`ctx.hasQueuedMessages()`。新的运行时集成优先使用[扩展](./extensions.md)。
除非另有说明，下文的 runner/包装器行为专指旧版
库路径。

## 关键文件 \{#key-files}

- `packages/coding-agent/src/extensibility/hooks/types.ts`：钩子上下文、事件类型与结果约定
- `packages/coding-agent/src/extensibility/hooks/loader.ts`：模块加载与钩子发现桥接
- `packages/coding-agent/src/extensibility/hooks/runner.ts`：事件分派、命令查找、错误信号
- `packages/coding-agent/src/extensibility/hooks/tool-wrapper.ts`：工具执行前/后的拦截包装器
- `packages/coding-agent/src/extensibility/hooks/index.ts`：导出/重新导出
- `packages/coding-agent/src/extensibility/shared-events.ts`：共享事件/结果约定
- `packages/coding-agent/src/extensibility/extensions/loader.ts`：当前运行时发现
- `packages/coding-agent/src/extensibility/extensions/wrapper.ts`：当前工具包装器与审批门控

## 什么是钩子模块 \{#what-a-hook-module-is}

钩子模块应默认导出一个工厂：

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

工厂可以：

- 使用 `pi.on(...)` 注册事件处理程序
- 使用 `pi.sendMessage(...)` 发送持久化的自定义消息
- 使用 `pi.appendEntry(...)` 持久化非 LLM 状态
- 通过 `pi.registerCommand(...)` 注册斜杠命令
- 通过 `pi.registerMessageRenderer(...)` 注册自定义消息渲染器
- 通过 `pi.exec(...)` 运行 shell 命令，并通过 `pi.logger` 记录日志
- 使用注入的兼容 Zod 的构建器 `pi.zod`、原生 omptype 构建器 `pi.arktype`、旧版 `pi.typebox`，以及通过 `pi.pi` 提供的包导出

## 发现与加载 \{#discovery-and-loading}

启用环境发现时，会话通过扩展 runner 加载由
`hookCapability` 发现的 JS/TS 钩子工厂。
`discoverExtensionPaths(configuredPaths, cwd, disabledExtensionIds?, options?)`：

1. 只从原生提供方加载扩展模块
2. 从钩子能力注册表加载可导入的 `.ts`/`.js` 钩子工厂（除非 `includeAmbientHooks: false`）
3. 追加已启用的插件扩展入口点
4. 解析显式配置的文件/目录

路径按绝对路径去重。使用 `ambient: false` 时，跳过原生/已安装来源的
发现，但配置的包根目录仍可贡献钩子
工厂。

### 原生发现位置 \{#native-discovery-location}

原生提供方在每个配置根目录下只扫描两个子目录，**直接**放在 `hooks/` 中的工厂不会被发现：

- 项目：`<cwd>/.omp/hooks/pre/*.{ts,js}` 和 `<cwd>/.omp/hooks/post/*.{ts,js}`
- 用户：`<agentDir>/hooks/pre/*.{ts,js}` 和 `<agentDir>/hooks/post/*.{ts,js}`（默认为 `~/.omp/agent/hooks/...`；识别配置档案和 `PI_CODING_AGENT_DIR`）

直接位于 `<cwd>/.omp/hooks/` 下的工厂不会被原生环境
发现找到；请将其放入 `pre/` 或 `post/`，或显式提供其路径。点前缀
条目和非文件会被跳过。目录和基本名称提供能力
元数据/去重键，而不会自动注册事件：工厂仍应
调用 `pi.on(...)`。只有钩子能力中的 `.ts`/`.js`
工厂会被追加到扩展流水线。
显式扩展路径使用共享模块解析器。加载顺序和禁用控制见
[扩展加载](./extension-loading.md)。

旧版 `discoverAndLoadHooks(configuredPaths, cwd)` 辅助函数仍存在，并执行：

1. 从能力注册表加载发现的钩子（`loadCapability("hooks")`）
2. 追加显式配置的路径（按绝对路径去重）
3. 调用 `loadHooks(allPaths, cwd)`

`loadHooks` 随后导入每个路径，并期待得到一个 `default` 函数。

### 路径解析 \{#path-resolution}

`loader.ts` 按以下方式解析钩子路径：

- 绝对路径：原样使用
- `~` 路径：展开
- 相对路径：相对于 `cwd` 解析

## 事件接口 \{#event-surfaces}

钩子事件在 `types.ts` 中采用强类型定义。

### 会话事件 \{#session-events}

- `session_start`
- `session_before_switch` → 可返回 `{ cancel?: boolean }`
- `session_switch`
- `session_clear`
- `session_before_branch` → 可返回 `{ cancel?: boolean; skipConversationRestore?: boolean }`
- `session_branch`
- `session_before_compact` → 可返回 `{ cancel?: boolean; compaction?: CompactionResult }`
- `session.compacting` → 可返回 `{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }`
- `session_compact`
- `session_before_tree` → 可返回 `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }`
- `session_tree`
- `session_shutdown`

`session_before_branch` 和 `session_branch` 携带 `reason`，它决定 `session_before_branch.entryId` 的含义。对于 `"branch"`（`branch(entryId)`、`/branch`），它是正在回退的用户消息：该消息及其之后的全部内容都会被丢弃。对于 `"fork"`（`AgentSession.fork(entryId)`、带有 `entryId` 的 RPC `fork`）和 `"btw"`（`/btw` 提升），它是新会话中保留的最后一个条目。

`session_clear` 是在 `/clear`（或
`AgentSession.resetSessionContext()`）成功原位重置上下文后发出的不可取消通知。
用它使缓存的“已注入”指令失效；处理程序会在
重置返回前完成。成功清空的内容为空时也会触发，忙碌/被拒绝的重置则
永远不会触发，而且不会更改会话 id、文件或历史。

### 智能体/上下文事件 \{#agentcontext-events}

- `context` → 可返回 `{ messages?: Message[] }`
- `before_agent_start` → 可返回 `{ message?: { customType; content; display; details; attribution } }`
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

### 工具事件（执行前/后模式） \{#tool-events-prepost-model}

- `tool_call`（执行前）→ 可返回 `{ block?: boolean; reason?: string; input?: Record<string, unknown>; additionalContext?: string }`。返回 `input` 的非阻止型处理程序会替换工具实际执行所用的参数（原始执行输入，而不是规范化的 `event.input` 视图）；当 `block` 为 true 时忽略它。所有非阻止型处理程序中不同的非空 `additionalContext` 值，携带可信的、由处理程序编写的指令，在工具结果之后、下一次提供方请求之前传递，并在传输支持时具有开发者/系统优先级；原始工具输出和其他不可信数据应留在工具结果中。
- `tool_result`（执行后）→ 可返回 `{ content?; details?; isError?; additionalContext?: string }`。无论成功还是失败，上下文都会在工具输出之外传递；如果引导只适用于一种结果，请检查 `event.isError`。覆盖按字段跨处理程序合并，因此后续返回如果省略某个字段（包括只返回上下文的情况），永远不会抹去前一个处理程序对该字段设置的值。

返回的 `input` 不适用于提供方原生 `computer` 调用，因为其事件
输入是合成视图，而不是执行参数。`edit` 事件
输入也可能包含派生的 `path`/`paths` 字段；它们用于策略
检查，不一定是有效的执行参数。

在正常的扩展 runner 路径中，模型发起的 `tool_call` 在
参数准备期间运行，早于调度、`tool_execution_start` 和审批。
替换后的输入会重新验证，并成为显示/持久化/执行的
调用。对于循环未处理的嵌套或直接分派，扩展包装器会发出该事件，
审批则评估修订后的输入。这与下文介绍的
独立 `HookToolWrapper` 不同。

eval 前置环境调用，例如 `browser.open(...)`、直接的 `BrowserTab`
辅助方法、`tab.run(...)`、直接的 `computer` 辅助方法，以及
`computer.run(fnOrCode, options)`，都是宿主桥接调用，而不是 AgentTool 调用，
因此不会发出 `tool_call` 或 `tool_result`。

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

## 执行模型与变更语义 \{#execution-model-and-mutation-semantics}

### 1) 执行前：`tool_call` \{#1-pre-execution-tool_call}

`HookToolWrapper.execute()` 在工具执行前发出 `tool_call`。

- 如果任意处理程序返回 `{ block: true }`，执行停止，并丢弃已为该调用收集的上下文
- 如果处理程序抛出异常，包装器采取失败时关闭策略，阻止执行，并丢弃已收集的上下文
- 只有工具返回非错误结果后，才会转发收集的上下文；抛出异常或 `isError` 结果会将其丢弃
- 返回的 `reason` 成为抛出的错误文本

### 2) 工具执行 \{#2-tool-execution}

未被阻止时，底层工具正常执行。

### 3) 执行后：`tool_result` \{#3-post-execution-tool_result}

工具返回后（包括返回错误结果），包装器发出
`tool_result`，其中包含：

- `toolName`、`toolCallId`，以及表示实际执行参数的规范化 `input`
- 在扩展 runner 中，由 JS 或 Python eval 单元或内核定义工具发起的调用，其 `tool_call` 和 `tool_result` 都包含 `parentToolCallId`。它标识直接包裹当前调用的那次调用，直接调用中则不存在。
- `content`
- `details`
- `isError: result.isError === true`

如果处理程序返回覆盖值：

- `content` 可以替换结果内容
- `details` 可以替换结果详情
- `additionalContext` 在工具结果之外携带可信引导；每个处理程序中不同的非空白值按注册顺序连接（比较时忽略首尾空白，重复值会被丢弃），并在该调用的 `tool_call` 上下文之前传递。同一批次内，如果某次调用合并后的上下文与更早调用的相同，只会传递一次

如果执行抛出异常，包装器会发出带有 `isError: true` 和
错误文本内容的 `tool_result`，传递返回的 `additionalContext`，然后重新抛出
原始错误；返回的 content/details 补丁不能替换该异常。
如果工具改为返回 `isError: true` 结果，则会应用 content/details 补丁，
但错误标志保持 true。只应在失败后运行的处理程序
应检查 `event.isError`；与 `PostToolUse` 等效的处理程序应拒绝这种情况。

### 钩子可以修改的内容 \{#what-hooks-can-mutate}

- 通过 `context` 修改单次调用的 LLM 上下文（`messages` 替换链）
- 通过 `tool_call` 或 `tool_result` 的 `additionalContext` 修改下一次提供方请求的被动上下文
- 通过从 `tool_call` 返回 `input` 修改工具的原始执行参数
- 返回结果上的工具输出内容/详情，包括返回的错误结果（`tool_result` 路径）
- 通过 `before_agent_start` 修改智能体启动前注入的消息
- 通过 `session_before_*` 和 `session.compacting` 修改取消/自定义上下文压缩/树行为

### 此实现中钩子无法修改的内容 \{#what-hooks-cannot-mutate-in-this-implementation}

- 工具抛出错误后的执行延续（错误路径会重新抛出）
- 包装器行为中的最终成功/错误状态（返回的 `isError` 有类型定义，但 `HookToolWrapper` 不会应用它）

这些限制不是当前扩展包装器的约定：
`ExtensionToolWrapper` 会应用 `tool_result` 的 content/details/`isError` 补丁，
也包括应用于它转换出的执行错误结果。该路径请参阅
扩展文档。

## 顺序与冲突行为 \{#ordering-and-conflict-behavior}

### 发现层级的顺序 \{#discovery-level-ordering}

能力提供方按优先级排序（高的在前）。按能力键去重，首次出现的生效。

对于 `hooks`，能力键为 `${type}:${tool}:${name}`。来自低优先级提供方、被遮蔽的重复项会被标记，并从有效发现列表中排除。

### 加载顺序 \{#load-order}

`discoverAndLoadHooks` 构建一个扁平的 `allPaths` 列表，按解析后的绝对路径去重，然后 `loadHooks` 按该顺序遍历。
每个发现目录内的文件顺序取决于 `readdir` 输出；钩子加载器不会额外排序。

### 运行时处理程序顺序 \{#runtime-handler-order}

在 `HookRunner` 内，顺序由注册先后确定：

1. 钩子数组顺序
2. 每个钩子/事件的处理程序注册顺序

各事件类型的冲突行为：

- `tool_call`：每个不同的非空 `additionalContext` 都按处理程序顺序保留（与同次调用中前一个处理程序相同的值会被丢弃，同一批次中与更早调用相同的合并上下文也会被丢弃）；`input` 仍是后者生效；首次阻止会短路，并丢弃为该调用收集的上下文。处理程序看不到彼此对输入的修订
- `tool_result`：`content`/`details`/`isError` 覆盖按字段跨处理程序合并（不短路）：后续处理程序定义的字段生效，未设置的字段保留前一个处理程序的值，因此只返回 details、isError 或上下文时，永远不会抹去此前的脱敏结果。每个不同的非空 `additionalContext` 都按处理程序顺序保留，采用与 `tool_call` 相同的去重方式
- `context`：链式处理；每个处理程序接收前一个处理程序输出的消息
- `before_agent_start`：保留首个返回的消息；后续消息被忽略
- `session_before_*`：跟踪最新返回的结果；`cancel: true` 立即短路
- `session.compacting`：最新返回的结果生效

命令/渲染器冲突：

- `getCommand(name)` 返回跨钩子的首个匹配项（先加载的生效）
- `getMessageRenderer(customType)` 返回首个匹配项
- `getRegisteredCommands()` 返回所有命令（不去重）

## UI 交互（`HookContext.ui`） \{#ui-interactions-hookcontextui}

`HookUIContext` 包括：

- `select`、`confirm`、`input`、`editor`
- `notify`
- `setStatus`
- `custom`
- `setEditorText`、`getEditorText`
- `theme` getter

`ctx` 包括 `hasUI`、`cwd`、`sessionManager`、`modelRegistry`、当前 `model`、`isIdle()`、`abort()` 和 `hasQueuedMessages()`。

无 UI 运行时，默认的空操作上下文行为是：

- `select/input/editor/custom` 返回 `undefined`
- `confirm` 返回 `false`
- `notify`、`setStatus`、`setEditorText` 不执行任何操作
- `getEditorText` 返回 `""`

### 状态行行为 \{#status-line-behavior}

通过 `ctx.ui.setStatus(key, text)` 设置的钩子状态文本会：

- 按键分别存储
- 按键名排序
- 进行清理（剥离 OSC/DCS/其他 ANSI/VT 转义序列；将控制字符映射为空格；合并重复空格；去除首尾空白）。在 ANSI 渲染的状态栏中，会保留 SGR 前景色和文本样式（`status` 分段还会移除背景色）；原生 Rex/Tern 状态行仍显示强调色文本
- 拼接后按显示宽度截断

## 错误传播与回退 \{#error-propagation-and-fallback}

### 加载时 \{#load-time}

- 模块无效或缺少默认导出 → 记录在 `LoadHooksResult.errors` 中
- 继续加载其他钩子

### 事件执行时 \{#event-time}

`HookRunner.emit(...)` 会捕获大多数事件的处理器错误，并向监听器发出 `HookError`（`hookPath`、`event`、`error`），然后继续处理。

`emitToolCall(...)` 更严格：处理器错误不会在这里被吞掉，而是向调用方传播。在 `HookToolWrapper` 中，这会阻止当前工具调用（故障安全处理）。

旧版运行器不对 `tool_call` 施加超时限制；它可以等待界面输入。
扩展运行器则有独立的处理器超时和取消行为。

## 实际 API 示例 \{#realistic-api-examples}

### 阻止不安全的 bash 命令 \{#block-unsafe-bash-commands}

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

### 执行后对工具输出脱敏 \{#redact-tool-output-on-post-execution}

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

### 每次 LLM 调用时修改模型上下文 \{#modify-model-context-per-llm-call}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function (pi: HookAPI): void {
	pi.on("context", async event => {
		const filtered = event.messages.filter(msg => !(msg.role === "custom" && msg.customType === "debug-only"));
		return { messages: filtered };
	});
}
```

### 使用命令安全的上下文方法注册斜杠命令 \{#register-slash-command-with-command-safe-context-methods}

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

## 导出接口 \{#export-surface}

`packages/coding-agent/src/extensibility/hooks/index.ts` 和包子路径 `@oh-my-pi/pi-coding-agent/extensibility/hooks` 导出：

- 加载 API（`discoverAndLoadHooks`、`loadHooks`）
- 运行器和包装器（`HookRunner`、`HookToolWrapper`）
- 全部钩子类型
- `execCommand` 的重新导出

包根入口（`@oh-my-pi/pi-coding-agent`）不会重新导出 `HookAPI`；请从 hooks 子路径导入旧版钩子类型。
