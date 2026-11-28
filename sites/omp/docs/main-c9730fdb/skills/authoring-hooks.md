---
{
  "name": "authoring-hooks",
  "description": "创建新的 omp 钩子时使用。涵盖 HookAPI、事件目录、阻止或覆盖工具调用，以及上下文修改。",
  "title": "编写钩子"
}
---


# 编写钩子 \{#authoring-hooks}

钩子是伴随智能体循环运行的事件驱动拦截器。它们最适合处理横切关注点：安全策略、密钥脱敏、上下文裁剪、审计日志。钩子模块通过 `pi.on(event, handler)` 注册处理器，可以阻止工具执行、覆盖工具输出，或在每次 LLM 调用之前重写消息上下文。

> **与扩展的关系：** `HookAPI` 和独立的 `HookRunner` 是旧版 SDK API。普通会话会发现 JS/TS 钩子工厂，并通过扩展运行器使用 `ExtensionAPI` 绑定它们，其中包括 `hooks/pre/` 和 `hooks/post/` 下的工厂。新开发应使用 `ExtensionAPI`。以下旧版契约适用于使用方显式使用 `HookRunner` 的情形；共享事件在扩展运行器中可能具有不同的链式处理行为。

## 工厂签名 \{#factory-signature}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function myHook(omp: HookAPI): void {
	omp.on("tool_call", async (event, ctx) => {
		// intercept every tool call
	});
}
```

默认导出必须是函数（不是类）。它接收一个 `HookAPI` 实例，应在工厂执行期间注册处理器；加载器会等待返回的 promise，因此支持异步初始化。

也可以使用 `ExtensionAPI`（推荐）：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI): void {
	pi.on("tool_call", async (event, ctx) => {
		/* ... */
	});
}
```

## 事件目录 \{#event-catalog}

### 工具生命周期 \{#tool-lifecycle}

| 事件 | 触发时机 | 可返回值 |
| --- | --- | --- |
| `tool_call` | 每次工具执行之前 | `{ block?: boolean; reason?: string; input?: Record<string, unknown>; additionalContext?: string }` |
| `tool_result` | 每次工具执行之后 | `{ content?; details?; isError?: boolean; additionalContext?: string }` |

### 会话生命周期 \{#session-lifecycle}

| 事件 | 触发时机 | 可返回值 |
| --- | --- | --- |
| `session_start` | 初次加载会话时 | - |
| `session_before_switch` | 切换会话之前 | `{ cancel?: boolean }` |
| `session_switch` | 切换会话之后 | - |
| `session_clear` | `/clear` 重置上下文之后 | - |
| `session_before_branch` | 创建会话分支之前 | `{ cancel?: boolean; skipConversationRestore?: boolean }` |
| `session_branch` | 创建会话分支之后 | - |
| `session_before_compact` | 上下文压缩之前 | `{ cancel?: boolean; compaction?: CompactionResult }` |
| `session.compacting` | 上下文压缩期间（注入上下文） | `{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }` |
| `session_compact` | 上下文压缩之后 | - |
| `session_before_tree` | 树导航之前 | `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }` |
| `session_tree` | 树导航之后 | - |
| `session_shutdown` | 会话关闭时 | - |

### 智能体/轮次生命周期 \{#agentturn-lifecycle}

| 事件 | 触发时机 | 可返回值 |
| --- | --- | --- |
| `before_agent_start` | 智能体开始一个轮次之前 | `{ message?: { customType; content; display; details; attribution? } }` |
| `agent_start` | 智能体循环开始 | - |
| `agent_end` | 智能体循环结束（`willContinue` 表示循环尚未稳定结束；`awaitingAsyncWork` 表示正在等待后台作业，而不是已经安排了自动继续） | - |
| `turn_start` | 循环内一次助手响应/工具结果迭代开始 | - |
| `turn_end` | 该次迭代结束；携带消息和工具结果 | - |
| `context` | 每次 LLM API 调用之前 | `{ messages?: Message[] }` |
| `auto_compaction_start` | 自动上下文压缩开始 | - |
| `auto_compaction_end` | 自动上下文压缩结束 | - |
| `auto_retry_start` | 自动重试开始 | - |
| `auto_retry_end` | 自动重试结束 | - |
| `ttsr_triggered` | 触发 TTSR（响应过短） | - |
| `todo_reminder` | 待办提醒触发 | - |

`tool_execution_start`、`tool_execution_update`、`tool_execution_end`、`input`、`user_bash` 和 `user_python` 等扩展专属事件需要使用 `ExtensionAPI`。

## 工具执行前的阻止契约 \{#pre-tool-blocking-contract}

从 `tool_call` 处理器返回 `{ block: true, reason: "..." }` 可阻止执行：

```ts
omp.on("tool_call", async (event, ctx) => {
	if (event.toolName === "bash") {
		const cmd = String(event.input.command ?? "");
		if (/\brm\s+-rf\s+\//.test(cmd)) {
			return { block: true, reason: "Refusing rm -rf with an absolute-path target" };
		}
	}
});
```

契约：

- 如果**任意**处理器返回 `{ block: true }`，执行会立即停止。
- `reason` 成为 LLM 看到的工具错误文本。
- 如果处理器**抛出异常**，工具也会被阻止（故障时关闭）。
- 不阻止执行的处理器可以返回 `additionalContext`，携带处理器编写的可信指令，用于下一次模型提供方请求。所有处理器返回的不同非空值按注册顺序保留，并在该批次的工具结果之后按助手调用顺序发出，在支持的情况下使用开发者/系统优先级；若某次调用合并后的上下文与同批次中更早的调用相同，则只发出一次。这些内容只会在调用运行并返回非错误结果时交付：后续阻止、拒绝批准、中断跳过或执行失败都会将其丢弃。原始工具输出和其他不可信数据必须保留在工具结果中。
- 不阻止执行的处理器可以返回 `input`，替换传给工具的原始参数。最后一次替换生效，处理器看不到之前的输入修订。应返回真实的工具参数，而不是 `event.input` 中派生的、仅供门控使用的字段。计算机提供方调用不应用修订。在由扩展支持的普通智能体循环中，修订会在调度、显示、持久化和批准之前通过模式验证；独立的 `HookToolWrapper` 则将处理器持有的原始替换值直接传给执行环节。
- eval 前导调用，例如 `browser.open(...)`、直接调用的 `BrowserTab` 辅助方法、`tab.run(...)`、直接调用的 `computer` 辅助方法以及 `computer.run(fnOrCode, options)`，都不是工具调用，不会发出这些钩子事件。

## 工具执行后的覆盖契约 \{#post-tool-override-contract}

从 `tool_result` 处理器返回 `{ content, details, isError, additionalContext }`，可修改 LLM 看到的内容，和/或在工具输出之外附加可信引导：

```ts
omp.on("tool_result", async (event, ctx) => {
	if (event.toolName === "read" && !event.isError) {
		const redacted = event.content.map(chunk => {
			if (chunk.type !== "text") return chunk;
			return {
				...chunk,
				text: chunk.text.replace(/(?:sk|pk)-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]"),
			};
		});
		return {
			content: redacted,
			additionalContext: "Use the redacted result for subsequent reasoning.",
		};
	}
});
```

契约：

- 处理器按注册顺序运行。对于 `HookAPI`，每个处理器都接收原始工具结果事件；返回的 `content`/`details`/`isError` 按字段合并，因此后一个处理器已定义的字段生效，而未设置的字段保留之前的覆盖值（只返回 `details`、`isError` 或 `additionalContext` 的处理器不会抹去之前的 `content` 脱敏结果）。
- `content` 替换供 LLM 使用的完整内容数组。
- `details` 替换结构化详情对象。
- `additionalContext` 不属于工具结果。不同的非空白值按注册顺序保留（忽略首尾空白后比较，重复值会被丢弃），并在该次调用的 `tool_call` 上下文之前交付；若某次调用合并后的上下文与同批次中更早的调用相同，则只交付一次。
- 共享结果类型中存在 `isError`，但 `HookToolWrapper` 忽略该覆盖值。返回的结果若带有 `isError: true`，即使其内容/详情被修改，也会保留该标记；工具抛出的错误会在处理器完成后重新抛出。
- 工具失败时，仍会发出带有 `isError: true` 的 `tool_result`，并交付返回的 `additionalContext`。应根据 `event.isError` 进行筛选，避免仅适用于成功或仅适用于失败的处理器在相反结果下触发。

## 上下文修改契约 \{#context-modification-contract}

从 `context` 处理器返回 `{ messages: [...] }`，可在每次 LLM API 调用之前重写消息列表。筛选自定义会话消息时，应使用 `ExtensionAPI`，如下例所示：

```ts
pi.on("context", async (event, ctx) => {
	// Remove debug-only custom messages from LLM context
	const filtered = event.messages.filter(msg => !(msg.role === "custom" && msg.customType === "debug-only"));
	return { messages: filtered };
});
```

契约：

- `event.messages` 是当前累积的列表。
- 处理器按顺序运行；每个处理器接收上一个处理器的输出。
- 返回 `undefined`（或不返回任何值）可让消息原样通过。

## 三个完整示例 \{#three-complete-examples}

### 1. rm-rf 阻止器 \{#1-rm-rf-blocker}

这个适用范围较窄的正则表达式匹配后跟任意绝对路径的 `rm -rf`，包括 `/tmp/example`。它不是 shell 解析器，也不是完整的安全策略。

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function rmRfBlocker(omp: HookAPI): void {
	omp.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const cmd = String(event.input.command ?? "");
		if (!/\brm\s+-rf\s+\//.test(cmd)) return;

		// Allow if user explicitly confirms (interactive mode only)
		if (ctx.hasUI) {
			const allow = await ctx.ui.confirm(
				"Dangerous command",
				`This command recursively deletes an absolute-path target:\n${cmd}\n\nProceed?`,
			);
			if (allow) return;
		}

		return { block: true, reason: "rm -rf with an absolute-path target blocked by safety policy" };
	});
}
```

### 2. API 密钥脱敏器 \{#2-api-key-redactor}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

// Common API-key shapes. Not exhaustive — providers using bespoke formats
// (Anthropic `sk-ant-…`, JWT-style bearers, gateway-specific prefixes, etc.)
// need their own entries.
const SECRET_PATTERNS = [
	/\b(sk|pk)-[a-zA-Z0-9]{20,}\b/g,
	/\bAKIA[A-Z0-9]{16}\b/g,
	/\bghp_[a-zA-Z0-9]{36}\b/g,
	// Zhipu / GLM Coding Plan: `<id>.<secret>` (no `sk-` prefix).
	/\b[a-zA-Z0-9]{16,}\.[a-zA-Z0-9]{16,}\b/g,
	/\b[a-zA-Z0-9_-]{20,}\s*=\s*["']?[a-zA-Z0-9._/+=-]{20,}["']?/g,
];

export default function apiKeyRedactor(omp: HookAPI): void {
	omp.on("tool_result", async event => {
		if (event.isError) return;

		let changed = false;
		const redacted = event.content.map(chunk => {
			if (chunk.type !== "text") return chunk;
			let text = chunk.text;
			for (const pattern of SECRET_PATTERNS) {
				const next = text.replace(pattern, "[REDACTED]");
				if (next !== text) {
					changed = true;
					text = next;
				}
			}
			return { ...chunk, text };
		});

		if (changed) return { content: redacted };
	});
}
```

### 3. 上下文筛选器 \{#3-context-filter}

```ts
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export default function contextFilter(omp: HookAPI): void {
	omp.on("context", async event => {
		const MAX_TOOL_OUTPUT_CHARS = 8_000;

		const trimmed = event.messages.map(msg => {
			// Truncate very large tool results to keep context manageable
			if (msg.role !== "toolResult") return msg;
			const content = msg.content.map(chunk => {
				if (chunk.type !== "text" || chunk.text.length <= MAX_TOOL_OUTPUT_CHARS) return chunk;
				return {
					...chunk,
					text: chunk.text.slice(0, MAX_TOOL_OUTPUT_CHARS) + "\n[... truncated by context-filter hook]",
				};
			});
			return { ...msg, content };
		});

		return { messages: trimmed };
	});
}
```

## 钩子上下文中的 UI 方法 \{#ui-methods-in-hook-context}

`ctx.ui` 是一个 `HookUIContext`。可用方法：

| 方法 | 说明 |
| --- | --- |
| `notify(message, type?)` | 显示应用内通知 |
| `setStatus(key, text)` | 设置页脚状态文本（带键，按键排序） |
| `select(title, options)` | 显示选择对话框 |
| `confirm(title, message)` | 显示是/否对话框 |
| `input(title, placeholder?)` | 显示文本输入对话框 |
| `editor(title, prefill?, { signal }?, { promptStyle }?)` | 显示多行编辑器 |
| `setEditorText(text)` | 设置输入编辑器内容 |
| `getEditorText()` | 获取当前输入编辑器内容 |
| `custom(factory)` | 渲染自定义 TUI 组件 |
| `theme` | 当前主题对象 |

如果希望 Enter 提交、Shift+Enter 插入换行，应将 `{ promptStyle: true }` 作为第四个参数传入。钩子编辑器的默认行为是 Enter 换行，通过 `app.message.followUp` 组合键（`Ctrl+Q` 或 `Ctrl+Enter`）提交。

使用 `ctx.hasUI` 保护交互式调用；打印模式和普通无头/子代理会话没有交互式 UI。RPC 可以在扩展上下文中提供自己的 UI 桥接。对于自定义 TUI 组件等仅适用于终端的扩展 UI，应使用 `ctx.mode === "tui"`。

## 延伸阅读 \{#further-reading}

- `docs/hooks.md`：钩子子系统内部机制、顺序规则、错误传播
- `docs/extensions.md`：`ExtensionAPI`（`HookAPI` 的超集）
- `docs/skills/examples/safety-hook/`：完整可运行示例
