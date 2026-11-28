---
{
  "name": "authoring-extensions",
  "description": "创建新的 omp 扩展时使用。涵盖 ExtensionAPI、工厂签名、工具/命令/事件注册，以及本地开发测试。",
  "title": "编写扩展"
}
---


# 编写扩展 \{#authoring-extensions}

扩展是为 `omp` 添加能力的主要方式。单个扩展模块可以注册供 LLM 调用的工具、供用户调用的斜杠命令，以及贯穿会话生命周期运行的事件处理程序，全部来自一个 TypeScript 文件。其默认工厂可以同步初始化，也可以返回 promise。

## 最小可用扩展 \{#minimum-viable-extension}

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify("My extension loaded!", "info");
	});
}
```

这就是一个可工作的扩展。将其放入 `~/.omp/agent/extensions/hello.ts` 并重启 omp，即可看到通知。

## 完整示例 \{#full-example}

下面的扩展注册了一个斜杠命令、一个工具和一个会话启动钩子：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
	const z = pi.zod;

	// Runs once when the session loads
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify(`Session ready in ${ctx.cwd}`, "info");
	});

	// Slash command: /greet
	pi.registerCommand("greet", {
		description: "Send a greeting into the conversation",
		handler: async (args, ctx) => {
			const name = args.trim() || "world";
			pi.sendMessage(
				{
					customType: "greeting",
					content: `Hello, ${name}!`,
					display: true,
					attribution: "user",
				},
				{ triggerTurn: false },
			);
			ctx.ui.notify(`Greeted ${name}`, "info");
		},
	});

	// LLM-callable tool
	pi.registerTool({
		name: "word_count",
		label: "Word Count",
		description: "Count the words in a string",
		parameters: z.object({
			text: z.string().describe("Text to count"),
		}),
		async execute(_id, params, _signal, _onUpdate, _ctx) {
			const count = params.text.split(/\s+/).filter(Boolean).length;
			return {
				content: [{ type: "text", text: String(count) }],
				details: { count },
			};
		},
	});
}
```

## 发现路径 \{#discovery-paths}

omp 从以下来源加载扩展模块：

1. 通过能力系统发现的原生 `.omp` 位置：
   - `<cwd>/.omp/extensions/`（只限启动目录；不会扫描祖先目录的 `.omp/extensions/` 目录，因此应从该目录启动，或通过 `--extension` 显式传入父目录中的模块）
   - `~/.omp/agent/extensions/`
   - `.omp/settings.json#extensions` 或 `~/.omp/agent/settings.json#extensions` 中列出的旧版扩展路径
2. 发现的 JavaScript/TypeScript 钩子工厂（`hooks/pre/` 和 `hooks/post/`），通过扩展 runner 绑定。
3. `~/.omp/plugins/node_modules` 或项目插件根目录下已启用的已安装插件，包括 npm、市场和 `omp plugin link` 安装，通过其 `omp.extensions`/`pi.extensions` 清单加载。
4. CLI 传入的显式配置路径（`omp --extension ./my-ext.ts`，也可用 `-e`；`--hook` 被视为别名），以及配置中 `extensions:` 设置提供的路径。

运行时按解析后的绝对路径去重，首次出现的生效。

`--no-extensions` 禁用环境发现，但仍允许显式 `--extension`/`--hook` 路径及其捆绑能力。要使用精确模块文件允许列表，可重复指定 `--trusted-extension /absolute/path/to/module.ts`：路径应存在且为文件，环境中的扩展发现会被禁用，这些文件不会被视为用于发现同级能力的包根目录。它不能与 `--extension`、`-e` 或 `--hook` 组合使用；受信任模块加载错误会中止启动。这是发现控制，不是扩展代码的沙箱。

用户目录是活动配置档案的智能体目录：默认为 `~/.omp/agent`，而在默认布局下，`omp --profile <name>` 使用 `~/.omp/profiles/<name>/agent`。`PI_CODING_AGENT_DIR` 覆盖默认配置档案的智能体目录；具名配置档案则派生自己的目录。已初始化的 XDG 根目录可以更改这些位置。

路径指向目录时，omp 按以下顺序解析入口点：

1. 带有 `omp.extensions`（或旧版 `pi.extensions`）字段的 `package.json`
2. `index.ts`
3. `index.js`

扫描 `extensions/` 目录时，omp 还会加载直接的 `*.ts`/`*.js` 文件，以及带有 `index.ts`、`index.js` 或清单的单层子目录。

扩展包也可以捆绑同级能力目录。当包通过 `extensions:` 或 `--extension`/`-e` 加载时，`omp-plugins` 提供方会发现其 `skills/`、`hooks/pre|post/`、`tools/`、`commands/`、`rules/`、`prompts/` 和 `.mcp.json`。

## package.json 清单 \{#packagejson-manifest}

要将扩展打包为可安装插件，请向 `package.json` 添加 `omp` 字段：

```json
{
	"name": "my-omp-extension",
	"omp": {
		"extensions": ["./src/main.ts"]
	}
}
```

为向后兼容，也接受旧版 `pi` 键：

```json
{
	"pi": {
		"extensions": ["./index.ts"]
	}
}
```

支持多个入口点：

```json
{
	"omp": {
		"extensions": ["./src/safety.ts", "./src/tools.ts"]
	}
}
```

已安装插件的清单条目可以是 `.ts`、`.js`、`.mjs` 或 `.cjs`；指定目录的清单条目会解析 `index.ts`、`index.js`、`index.mjs` 或 `index.cjs`。原生/配置扩展目录的自动扫描仍限于 `.ts` 和 `.js`。

## 注册命令 \{#registering-commands}

```ts
pi.registerCommand("my-cmd", {
	description: "What the command does",
	handler: async (args, ctx) => {
		// args: everything the user typed after /my-cmd
		// ctx: ExtensionCommandContext — includes ctx.ui, ctx.cwd, session controls
		ctx.ui.notify("Running!", "info");
		await ctx.waitForIdle();
		await ctx.newSession();
	},
});
```

`ExtensionCommandContext` 会话控制方法：

| 方法 | 效果 |
| --- | --- |
| `waitForIdle()` | 等待智能体完成流式输出 |
| `newSession(opts?)` | 打开新会话 |
| `switchSession(path)` | 切换到现有会话文件 |
| `branch(entryId)` | 从特定历史条目派生新会话 |
| `navigateTree(id, opts?)` | 跳转到会话树中的其他位置 |
| `reload()` | 重新加载会话运行时 |
| `compact(instructionsOrOptions?)` | 压缩当前上下文；基础 `ExtensionContext` 上也可用 |

使用命令上下文进行切换、分支、树导航和重新加载。`compact()` 接受指令字符串或 `CompactOptions`。

## 注册工具 \{#registering-tools}

工具由 LLM 调用。参数定义可以使用注入的
兼容 Zod 的 omptype 构建器；`pi.arktype` 和兼容旧版的
`pi.typebox` 也可用：

```ts
const z = pi.zod;

pi.registerTool({
	name: "search_notes", // snake_case, unique
	label: "Search Notes", // human-readable label for TUI
	description: "Full-text search through project notes",
	parameters: z.object({
		query: z.string().describe("Search query"),
		limit: z.number().default(10).optional().describe("Max results"),
	}),
	async execute(toolCallId, params, signal, onUpdate, ctx) {
		if (signal?.aborted) {
			return { content: [{ type: "text", text: "Cancelled" }], details: { query: params.query, count: 0 } };
		}
		onUpdate?.({ content: [{ type: "text", text: "Searching..." }], details: { query: params.query, count: 0 } });
		// ... do work ...
		return {
			content: [{ type: "text", text: `Found N results for "${params.query}"` }],
			details: { query: params.query, count: 0 },
		};
	},
});
```

工具定义还可以设置 `loadMode: "essential" | "discoverable"`（默认 `"discoverable"`）、`approval: "read" | "write" | "exec"`（默认 `"exec"`），以及用于提供方结构化输出语法行为的 `strict`。只有能读取技能指令 URL 的工具才应设置 `readsSkillUris: true`；此能力允许系统提示词暴露发现的技能。`hidden` 要求显式选择工具；`defaultInactive` 则将激活交给扩展的 `setActiveTools()`。

## 订阅事件 \{#subscribing-to-events}

```ts
pi.on("tool_call", async (event, ctx) => {
	// event.toolName, event.input, event.toolCallId
	if (event.toolName !== "bash") return;

	const command = String((event.input as { command?: unknown }).command ?? "");
	if (command.includes("rm -rf /")) {
		return { block: true, reason: "Blocked by safety policy" };
	}
});

pi.on("turn_end", async (_event, ctx) => {
	ctx.ui.setStatus("tokens", `~${ctx.getContextUsage()?.tokens ?? "?"} tokens`);
});

pi.on("session_stop", async event => {
	if (event.stop_hook_active) return;
	return { continue: true, additionalContext: `Review final status after turn ${event.turn_id}.` };
});
```

完整事件目录：见[扩展编写指南](../extensions.md)。

## 更改会话记录块的绘制方式 \{#changing-how-transcript-blocks-are-drawn}

`pi.registerTranscriptPresenter(block => …)` 为主会话记录中的每个块选择 `"full"`、`"compact"`、`"hidden"` 或 `{ compact: { label, rows } }`：包括工具调用（`block.type === "toolCall"`，`block.id` 为其 `toolCallId`）、消息块（`"message"`：顾问、技能、迟到诊断、`!`/`$` 运行、后台作业和受监督进程通知；`block.id` 是 `String(message.timestamp)`），以及事件通知（`"event"`：TTSR、待办提醒）；也可返回 `undefined`，交给下一个呈现器处理。对于不认识的块类型，请返回 `undefined`；后续版本会添加更多类型。它返回一个释放函数。只有用户开启 `extensionRenderers.transcriptPresenters` 时，呈现器才会运行（默认关闭）。

```ts
const finished = new Set<string>(); // tool calls of runs that have ended
pi.on("agent_end", (event, ctx) => {
	const ids: string[] = [];
	for (const message of event.messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.content) if (part.type === "toolCall") ids.push(part.id);
	}
	for (const id of ids) finished.add(id);
	ctx.ui.refreshTranscript(ids); // omp asks on its own only when a block's data changes
});
pi.registerTranscriptPresenter(block => {
	if (block.type !== "toolCall") return undefined;
	return block.toolName !== "edit" && finished.has(block.id) ? "hidden" : "compact";
});
```

- 块的数据变化时，以及每次重建会话记录时，omp 都会再次询问；自身状态变化后，请调用 `ctx.ui.refreshTranscript(ids)`。根据块和以其 `id` 为键的状态作出应答，绝不要使用按运行区分的状态。呈现器在会话记录绘制期间运行：请保持开销低。
- 获得焦点的子代理、协作访客和会话记录叠层（链接浏览器、回退、`/copy`）绘制标准卡片。
- 展开的块（`Ctrl+O`、Tern 的开关）始终完整绘制；只影响显示，会话和模型上下文不变。`block.args` 和 `block.result` 是 omp 的实时对象：可以读取，绝不要修改。
- 更改已滚入终端滚屏历史的块会回放一次整个滚屏历史；避免频繁更改旧块。

详情：[会话记录呈现器](../extensions.md#transcript-presenter)。

## 扩展与钩子，何时使用哪种 \{#extension-vs-hook--when-to-use-which}

| 需求 | 使用 |
| --- | --- |
| 在一个模块中提供工具 + 命令 + 事件 | **扩展**（`ExtensionAPI`） |
| 纯事件拦截（策略、脱敏） | **扩展**或**钩子**（两者均可；优先使用扩展） |
| 已有旧版钩子模块 | **钩子**（来自 `@oh-my-pi/pi-coding-agent/extensibility/hooks` 的 `HookAPI`） |
| 注册提供方、快捷键或 CLI 标志 | **仅扩展** |
| 作为市场插件发布 | **扩展**（使用 `package.json` 清单） |

新编写的模块应使用 `ExtensionAPI`。正常会话中，发现的 JS/TS 钩子工厂通过此 API 加载；独立的 `HookRunner` 仍为旧版 SDK 使用方保留。事件名称相同并不意味着两个 runner 的结果链式处理行为完全一致。

## 调试 \{#debugging}

omp 在活动状态根目录的 `logs/` 目录下写入结构化日志（默认为 `~/.omp/logs/`；调试级别始终开启，不向控制台写入任何内容，因为那会破坏 TUI）。记录批量写入，因此调试行最多可能要一秒才出现，而 `warn` 和 `error` 行会立即写入。每个文件名都包含进程 ID，进程只在首次记录日志时创建其文件。持续查看今天默认配置档案的日志，以了解扩展加载诊断：

```
tail -f ~/.omp/logs/omp.$(date +%F).*.log
```

扩展加载失败时会记录其路径和错误。已加载的扩展也可以通过 `pi.logger` 发出自己的调试日志。

要按名称临时禁用特定扩展模块而不移除文件：

```yaml
# ~/.omp/agent/config.yml
disabledExtensions:
   - extension-module:my-ext
```

派生名称是文件名主干（对于 `index.ts` 风格的入口，则为目录名）：`/path/to/my-ext.ts` → `my-ext`。

## 重要约束 \{#important-constraints}

- **不要在加载期间调用运行时操作。** 如果在模块求值期间（会话激活前）同步调用 `pi.sendMessage()` 等方法，会抛出 `ExtensionRuntimeNotInitializedError`。加载期间注册处理程序/工具/命令；只从事件处理程序、工具或命令中执行运行时操作。
- **`tool_call` 错误采取失败时关闭策略。** 如果 `tool_call` 处理程序抛出异常，工具会被阻止。
- **自行调度的回调在进程内运行，没有隔离。** 原始 `setInterval`/`setTimeout`/分离 promise 回调抛出的异常会越过处理程序分派的 try/catch，导致整个会话崩溃（`uncaughtException`）。后台工作请使用 `ctx.setInterval` / `ctx.setTimeout`，它们会限制回调异常的影响，并在 `session_shutdown` 时自动清除。使用原始定时器时，应自行添加 `try/catch` 和清理逻辑。
- **命令名称不能与内置命令冲突。** 冲突会被跳过，并记录诊断日志。
- **保留快捷键会被忽略**（`ctrl+c`、`ctrl+d`、`ctrl+z`、`ctrl+k`、`ctrl+p`、`ctrl+l`、`ctrl+o`、`ctrl+t`、`ctrl+g`、`ctrl+q`、`alt+m`、`shift+tab`、`shift+ctrl+p`、`alt+enter`、`escape`、`enter`）。在处理程序中使用 `pi.getShortcutConflict(chord)` 检查组合键。

## 延伸阅读 \{#further-reading}

- `docs/extensions.md`：运行时内部机制与完整 API 面参考
- `docs/extension-loading.md`：详细路径解析规则
- `docs/hooks.md`：钩子子系统内部机制
- `docs/skills/examples/hello-extension/`：完整可用示例
