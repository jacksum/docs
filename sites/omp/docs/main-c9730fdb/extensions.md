---
title: "扩展"
description: "Oh My Pi 官方仓库文档：扩展。"
---

# 扩展 \{#extensions}

在 `packages/coding-agent` 中编写运行时扩展的主要指南。

本文涵盖以下文件中的当前扩展运行时：

- `src/extensibility/extensions/types.ts`
- `src/extensibility/extensions/runner.ts`
- `src/extensibility/extensions/wrapper.ts`
- `src/extensibility/extensions/index.ts`
- `src/modes/controllers/extension-ui-controller.ts`

有关发现路径和文件系统加载规则，请参阅 [`extension-loading.md`](./extension-loading.md)。

有关已打包的面向用户的扩展 CLI/功能，请参阅 [`user-facing-packages.md`](./user-facing-packages.md)。

## 什么是扩展 \{#what-an-extension-is}

扩展是导出默认工厂函数的 TS/JS 模块。工厂函数可以同步初始化，也可以返回 promise：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
	// register handlers/tools/commands/renderers
}
```

扩展可以在一个模块中组合以下所有内容：

- 事件处理器 (`pi.on(...)`)
- 可供 LLM 调用的工具 (`pi.registerTool(...)`)
- 斜杠命令 (`pi.registerCommand(...)`)
- 键盘快捷键和标志
- 自定义消息渲染
- 会话/消息注入 API (`sendMessage`、`sendUserMessage`、`appendEntry`)

从包根入口 `@oh-my-pi/pi-coding-agent` 导入宿主值，从 `@oh-my-pi/pi-tui` 导入 UI（节点、JSX、信号）。两者都解析为 omp 二进制文件内部宿主自身的副本。更深层的 coding-agent 路径也能解析，但它们指向内部文件：文件移动后，对它的静态导入会导致整个扩展无法加载。`@oh-my-pi/pi-tui` 已被移除；导入它的扩展无法加载（参阅[从 pi-tui 迁移](#migrating-from-pi-tui)）。除了扩展类型和主题服务（`getThemeByName`、`onThemeChange` 等），根入口还导出以下辅助函数：

- `formatKeyHint` 和 `formatKeyHints`，用于按键提示
- `ansiSpans`，将带 ANSI 样式的文本转换为 `TspText` 片段，例如会话记录呈现器的 `{ compact: { label, rows } }`
- `toolCommandCallName`，读取 `bash` 调用所执行的命令词；以及 `toolCommandDispatches`，用于 bash 结果上的分派记录
- `unwrapHashlineHeaderPath`，将 `[path#TAG]` 写入/编辑目标转换为其普通路径
- `cfgExtensionTranscriptPresenters`，即 `extensionRenderers.transcriptPresenters` 设置的句柄

## 运行时模型 \{#runtime-model}

1. 扩展模块并发导入；随后其工厂函数按路径顺序依次运行。
2. 在该加载阶段，注册方法可用；会话操作方法尚未初始化。
3. `ExtensionRunner.initialize(...)` 为当前模式接入实时操作/上下文。
4. 会话/智能体/工具生命周期事件发送给处理器。
5. 注册表工具被封装，以供扩展拦截 (`tool_call` / `tool_result`)。

```text
Extension lifecycle (simplified)

load paths
   │
   ▼
import modules + bind factories (no session actions)
   │
   ▼
ExtensionRunner.initialize(mode/session/tool registry)
   │
   ├─ emit session/agent events to handlers
   ├─ wrap tool execution (tool_call/tool_result)
   └─ expose runtime actions (sendMessage, setActiveTools, ...)
```

`loader.ts` 中的重要约束：

- 在扩展加载期间调用 `pi.sendMessage()` 等操作方法会抛出 `ExtensionRuntimeNotInitializedError`
- 先注册；从事件/命令/工具中执行运行时行为
- `pi.exec()` 在加载期间可直接使用；提供方注册会排队等待会话设置
- 子会话复用已导入的工厂函数，但绑定全新的 API 和扩展注册；模块级变量在这些会话间仍然共享

## 快速开始 \{#quick-start}

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	const z = pi.zod;

	pi.setLabel("Safety + Utilities");

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify(`Extension loaded in ${ctx.cwd}`, "info");
	});

	pi.on("tool_call", async event => {
		const command = event.input.command;
		if (event.toolName === "bash" && typeof command === "string" && command.includes("rm -rf")) {
			return { block: true, reason: "Blocked by extension policy" };
		}
	});

	pi.registerTool({
		name: "hello_extension",
		label: "Hello Extension",
		description: "Return a greeting",
		parameters: z.object({ name: z.string() }),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			return {
				content: [{ type: "text", text: `Hello, ${params.name}` }],
				details: { greeted: params.name },
			};
		},
	});

	pi.registerCommand("hello-ext", {
		description: "Show queue state",
		handler: async (_args, ctx) => {
			ctx.ui.notify(`pending=${ctx.hasPendingMessages()}`, "info");
		},
	});
}
```

## 扩展 API 接口 \{#extension-api-surfaces}

## 1) 注册与操作 (`ExtensionAPI`) \{#1-registration-and-actions-extensionapi}

核心方法：

- `on(event, handler)`
- `registerTool`, `registerCommand`, `registerShortcut`, `getShortcutConflict`, `registerFlag`
- `registerMessageRenderer`, `registerAssistantThinkingRenderer`, `registerAssistantTextRenderer`, `registerTranscriptPresenter`, `registerLinkScheme`
- `registerComposerShape`
- `setLabel`, `getFlag`
- `sendMessage`, `sendUserMessage`, `appendEntry`, `exec`
- `getActiveTools`, `getAllTools`, `setActiveTools`
- `getCommands`
- `getSessionName`, `setSessionName`
- `setModel`, `getThinkingLevel`, `setThinkingLevel`（没有适用的具体思考力度时，`getThinkingLevel()` 返回 `undefined`，例如模型只支持 off/auto 且选中了 `auto`，不只是在会话初始化前如此）
- `getServiceTiers`, `setServiceTier`
- `registerProvider`, `unregisterProvider`
- `registerFileWriteFallback`, `registerFileDeleteFallback`
- `registerTodoBackend`
- `events`（共享事件总线）

`ExtensionAPI` 方法在被解构或作为回调传递时，仍保留其扩展绑定。

`setLabel(label)` 设置扩展的显示标签。它不是给会话条目
加标签的操作。`getAllTools()` 返回工具模式及来源元数据，而
`getActiveTools()` 返回已启用的名称。

`getServiceTiers()` 返回会话当前按系列划分的服务层级映射的独立快照。`setServiceTier(family, tier)` 为后续请求更改一个系列；传入 `undefined` 可清除此会话覆盖。OpenAI 接受 `auto`、`default`、`flex`、`scale`、`priority` 或 `ultrafast`；Anthropic 接受 `priority`；Google 接受 `flex` 或 `priority`。流式响应期间进行的更改不会影响正在处理的请求。

### 键盘快捷键 \{#keyboard-shortcuts}

在扩展工厂函数中注册快捷键；omp 在 `session_start` 之前绑定它们，因此后续注册会在下次启动时生效。

对于未占用的组合键，`getShortcutConflict(chord)` 返回 `undefined`，否则返回以下类型中的首个占用者：

- `{ kind: "reserved" }`：omp 保留该组合键（参阅[约束与陷阱](#constraints-and-pitfalls)）；注册在其上的快捷键永远不会绑定。
- `{ kind: "keybinding", keybindings }`：编辑器中绑定到它的键映射操作（当批准和后续输入的绑定被清空时，Ctrl+Enter 仍算作它们的绑定）。`app.*` 操作在适用时通常优先获得按键；编辑按键（`tui.editor.*`、`tui.input.*`，例如 `alt+y` 的 yank-pop）则让位于快捷键。
- `{ kind: "extension", extensionPath }`：另一个扩展的快捷键。多个扩展以任意写法注册同一组合键时，只绑定最后加载的那个。

组合键按 TUI 匹配方式比较：`alt+ctrl+x` 等同于 `ctrl+alt+x`，`?` 也涵盖 `shift+?`。调用方自身的注册不计入。按键绑定来自会话的 TUI 键映射，包含用户重新映射；没有 TUI 的会话（print、RPC、ACP、SDK）使用 omp 默认值。

扩展加载期间调用它会抛错，因此应从处理器（命令、`session_start`）中调用，例如验证用户选择的组合键；随后工厂函数在下次启动时注册它。

### 提供方注册 \{#provider-registration}

提供方的 `models` 条目及 `fetchDynamicModels` 返回的行接受与 `models.yml` 相同的 `api`/`kind` 配对（参阅[模型](./models.md)）：`openai-images` 等运行器 API 隐含其种类，因此模型会进入 `image` 角色及 `generate_image`，而不是注册为聊天模型。如果静态 `models` 条目的 `kind` 不受其 api 支持，`registerProvider` 会失败；这样的 `fetchDynamicModels` 行会被丢弃，并记录警告。

```ts
pi.registerProvider("my-gateway", {
	baseUrl: "https://gateway.example.com/v1",
	apiKey: "GATEWAY_API_KEY",
	models: [
		{
			id: "gpt-image-2",
			name: "GPT Image 2",
			api: "openai-images", // kind: "image" implied
			reasoning: false,
			input: ["text"],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 16384,
		},
	],
});
```

`pi.registerProvider(name, config)` 可以包含可选的 `usage` 字段，其中放置从
`@oh-my-pi/pi-ai` 导入的 `UsageProvider`。它的 `fetchUsage` 实现接收
规范化凭据并返回规范化的 `UsageReport`；随后宿主的 AuthStorage 缓存、历史及用量显示
会像处理内置提供方用量一样
处理该结果。

```ts
pi.registerProvider("my-provider", {
	baseUrl: "https://api.example.com/v1",
	api: "openai-completions",
	usage: {
		id: "my-provider",
		async fetchUsage(params, { fetch }) {
			const response = await fetch("https://api.example.com/usage", {
				headers: { Authorization: `Bearer ${params.credential.apiKey}` },
			});
			if (!response.ok) return null;
			const payload = (await response.json()) as {
				used: number;
				limit: number;
			};
			return {
				provider: "my-provider",
				fetchedAt: Date.now(),
				limits: [
					{
						id: "requests",
						label: "Requests",
						scope: { provider: "my-provider" },
						amount: {
							used: payload.used,
							limit: payload.limit,
							unit: "requests",
						},
					},
				],
			};
		},
	},
});
```

只要该扩展注册处于活动状态，扩展用量提供方就会覆盖同名的
内置提供方。`pi.unregisterProvider(name)`（以及
扩展来源清理）只会移除该运行时覆盖，恢复内置
或配置的用量解析器。

用量报告缓存在共享的 `agent.db` 中，以提供方名称、
用量提供方的 `cacheVersion`、规范化基础 URL 和凭据身份为键。覆盖内置提供方时，应设置一个
不同于内置值的 `cacheVersion`，使没有该扩展的进程（旧会话、
`--no-extensions` 运行、SDK 脚本）不会将它们的报告提供给你的提供方，反之亦然。

#### 接管内置提供方 \{#taking-over-a-built-in-provider}

四个字段让扩展无需重新定义模型就能替换现有提供方的部分功能。模型保留其 `api`，因此选项映射、凭据和目录策略的行为与之前相同：

- `stream(model, context, options)`：代替其 api 的内置适配器，处理发往该提供方模型的每个请求。`options` 已按该 api 映射（例如 `GoogleOptions`），并携带提供方的密钥。
- `generateImage(model, request, options)`：处理该提供方图像模型的图像生成。
- `webSearch(params)`：为该提供方的模型运行有来源依据的搜索请求。可用性检查和标签仍来自模型的依据检索后端。
- `discoverModels({ accounts, baseUrl, fetch })`：代替内置发现请求获取提供方模型列表。它会使用所有已登录账户运行一次（配置的密钥算一个账户）。返回 `null` 可保留缓存目录。内置发现仍会缓存这些行、合并它们并应用策略。
- `rules`：适用于该提供方每个模型的 KDL 规则指令，以指令名为键，其作用如同在 `provider "<id>" { … }` 块中设置它们（`{ "requires-native-tools": true }`）。未知指令和无效值会使 `registerProvider` 失败。运行时规则在同等条件下优先于随附规则，但仍低于更具体的规则，例如模型范围的规则。

```ts
pi.registerProvider("google-generative-ai", {
	stream: myGeminiStream,
	generateImage: myImageGenerator,
	rules: { "requires-native-tools": true },
});
```

这些覆盖只在注册处于活动状态时持续。注销提供方或卸载扩展会恢复内置行为。工作线程中的子代理会在主线程上运行这些钩子。线程本地的流状态，如 `providerSessionState`，仍留在工作线程中。

通过扩展注册的提供方 (`registerProvider`) 可以提供 `fetchDynamicModels` 进行运行时模型发现；这些获取操作具有 15 秒的硬性超时上限（`model-provider-discovery.ts` 中的 `RUNTIME_DYNAMIC_MODEL_FETCH_TIMEOUT_MS`），因此挂起的端点无法使发现停滞。

提供方的 `apiKey`（字面量密钥或环境变量名称）通常覆盖该提供方存储的任何 OAuth 或 `/login` 凭据。当注册同时提供 `oauth` 时，`apiKey` 转而作为后备：用户通过 `/login` 保存的密钥优先，只有不存在已存储的登录凭据时才使用 `apiKey`。这可避免将未设置的环境变量名称作为字面量密钥发送。因此，用 `oauth` 和网关 `apiKey` 同时注册内置提供方 id，会使已存储的上游凭据优先于网关密钥。

提供方登录回调可以通过
`callbacks.onPrompt({ message: "Consumer key", secret: true })` 请求遮蔽输入。原生 `/login`
和首次运行设置会保留提交值的精确内容，同时在
输入框、保留的答案和输入诊断预览中隐藏它。登录提示不
共享撤销或删除/粘贴历史。普通提示仍不遮蔽。

RPC 会拒绝机密提示，而不是将其作为普通输入转发。实现 `onPrompt` 的 SDK
宿主必须遵循 `secret`，否则应拒绝该提示。遮蔽
不提供加密、内存擦除或通用日志脱敏。

### 由命令支持的提供方 \{#command-backed-providers}

`registerProvider` 还支持由扩展自身实现传输的
提供方。`api` 值是扩展自有字符串（内置 API
名称为保留名称），`streamSimple` 返回标准的
`AssistantMessageEventStream`；它不需要是 HTTP 端点：

```ts
import { AssistantMessageEventStream } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerProvider("local-command", {
		// Required model metadata; the custom stream does not use this URL.
		baseUrl: "https://command-provider.invalid/",
		apiKey: "unused-by-extension",
		api: "local-command-api",
		streamSimple(model, context, options) {
			const stream = new AssistantMessageEventStream();
			// Spawn the command, translate its output, and push canonical OMP events.
			// The implementation owns process cleanup, cancellation, and errors; the
			// helper needs `context` for the conversation and `options` for `signal`,
			// `cwd`, and the stable `sessionId`.
			void runCommandAndPushEvents(stream, model, context, options);
			return stream;
		},
		models: [
			{
				id: "local-command-model",
				name: "Local command",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 128000,
				maxTokens: 16000,
			},
		],
	});
}
```

此模式适用于本地 CLI、stdio 服务或 JSONL 进程。它也
让提供方得以使用供应商仅通过 CLI 提供的套餐：
子进程使用自己的订阅凭据进行身份验证，而通过 API 密钥
访问同一个模型时，即使账户已付费购买
套餐，也仍按 token 计费。如果工具必须
由子进程掌控，由命令支持的提供方应将自己的工具循环保留在
子进程内部，并且只发出由此产生的助手事件。完整的子进程适配器还应移除
不应继承的凭据，遵循 `options.signal`，使用 `options.cwd`，将
一个稳定的会话 id 映射到一个子进程对话，并将非零退出转换为
流错误。`models.yml` 仍只支持 HTTP/配置；扩展是
非 HTTP 传输受支持的扩展途径。

在交互模式下，`input` 处理器在内置的首条消息自动标题检查之前运行。从 `input` 调用 `await pi.setSessionName(...)` 的扩展可以设置持久化会话名称，并阻止该会话运行默认的自动标题生成。

还公开了：

- `pi.logger`
- `pi.arktype`（omptype 的 `type(...)` 模式构建器）
- `pi.zod`（由 omptype 支持的 Zod 兼容构建器）
- `pi.typebox`（旧版 TypeBox 兼容垫片）
- `pi.pi`（包导出）

### 待办后端 (`registerTodoBackend`) \{#todo-backends-registertodobackend}

待办后端将会话的待办列表复制到外部存储：任务跟踪器、文件或仪表板。omp 保留该列表以及自身的 `todo` 工具、HUD、`/todo` 和提醒。`todo.backend` 设置指定的后端（默认 `native`：无后端）会在每次变更后收到完整列表。

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.registerTodoBackend({
		id: "my-tracker",
		label: "My tracker",
		description: "Mirrors the todo list into my tracker",
		async replace(phases, ctx) {
			await tracker.sync(ctx.sessionManager.getSessionId(), phases);
		},
	});
}
```

- **内容。** 主会话列表每次提交变更后发送完整列表，绝不发送操作；任务只携带 `content` 和 `status`。一次调用运行期间，后续列表会合并为最新列表。有两种调用会跳过：后端刚接收过的未变化列表，以及 omp 尚未调用任何后端时的空列表（`/new` 不会重新开始这一过程）。
- **会话。** 使用 `ctx.sessionManager.getSessionId()` 为存储设键，并在首次 `await` 前读取。`/new` 之后 id 会更新，空列表也随之归入该 id。调用与 `session_*` 事件之间没有顺序保证，也没有每会话独立实例：在 `session_shutdown` 时释放状态。
- **失败。** `replace` 无法拒绝变更，也不会获得中止信号。抛错或在扩展处理器超时内未响应，会报告为扩展错误；omp 的列表保持已提交状态，下次变更会再次发送完整列表。超时后，下一次调用可能在旧调用仍运行时启动：迟到的写入不得覆盖较新的列表。退出时，omp 等待仍在运行的调用，最长等待时间与 `session_shutdown` 处理器允许的耗时相同。
- **拒绝 `todo` 调用 (`apply`)。** 主会话的 `todo` 调用在提交前会先询问后端，包含 eval 单元；`/todo`、RPC、Cursor 内置待办同步及子代理则不会。返回 `{ block: true, reason }` 即可拒绝：调用以 `Todo backend "<id>" did not accept this change: <reason>` 失败，列表不变；原因显示为单行（换行变为空格，控制序列被移除）。抛错与超时一样属于扩展错误，会使调用失败，但不算拒绝。允许在 `apply` 中写入；`apply` 结算后（最迟在退出时），无论列表是否变化，omp 都通过 `replace` 重新同步。只有同一会话中未变化的列表在时限内（约 10 秒）被接受时，omp 才会提交；其他任何结果（拒绝、抛错、超时、迟到的响应、列表/会话/后端变更、中止）都会使列表保持不变。会话进入关闭阶段后，发起的调用或仍在决定中的调用会失败。
- **选择。** `todo.backend` 保存已注册的 `id`（字母、数字、`.`、`_`、`-`；`native` 为保留值）。缺少 `replace` 或 `apply` 不是函数时，注册会抛错。多个扩展注册选中的 id 时，先加载的扩展保留它，其他扩展报告为扩展错误。如果所选 id 没有被任何已启用扩展注册，会报告一次扩展错误（选择其他 id 后再次选中它时会再次报告），待办行为与 `native` 相同。会话中途选中的后端会在下次变更时收到列表，若在 `/settings` 中选择，则会立即收到。
- **范围。** 仅主会话：不镜像子代理和 `/tan` 克隆。
- **设置。** `/settings` → Tools → Todos → “Todo Backend” 列出 `Native` 及已启用扩展注册的每个后端，显示其 `label`（省略时使用 `id`）和 `description`。两者均可选；空白值会在注册时抛错。

### 运行时设置覆盖 \{#runtime-setting-overrides}

设置通过带类型的注册表句柄寻址（参阅 [config-usage.md](./config-usage.md#definitions-srcconfigregistryts) 中的“定义”）；字符串路径形式的 `settings.get`/`set`/`override` 方法已在 18.3 中移除。扩展从 `@oh-my-pi/pi-coding-agent/config/registry` 子路径通过 `lookup(id)` 按 id 解析句柄（并用 `all()` 枚举），然后将 `pi.pi.settings` 作为作用域传入：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

export default function (pi: ExtensionAPI) {
	const recap = lookup("recap.enabled");
	// Defer to the user: pin a default only when no env var or settings layer configures it.
	if (recap && !recap.isConfigured(pi.pi.settings)) recap.override(pi.pi.settings, false);
}
```

- `override(scope, value)` 写入内存运行时层；它从不持久化，且优先于项目、全局和 `--config` 层。设置的环境绑定通常优先；使用 `envFallback` 的定义则让位于已配置设置。定义拒绝的值会抛错，例如 `Invalid value for recap.enabled: "nope" (expected a boolean)`。
- `clearOverride(scope)` 释放覆盖，恢复持久化值/默认值。
- `isConfigured(scope)` / `provenance(scope)` 区分用户配置值与默认值 (`"env" | "runtime" | "overlay" | "project" | "global" | "default"`)。
- `get(scope)` 读取生效值；`listen(scope, cb)` 观察更改。写入通过设置存储执行，因此会触发变更监听器和实时效果。
- `lookup` 对未知 id 返回 `undefined`。

### 消息投递语义 \{#message-delivery-semantics}

`pi.sendMessage(message, options)` 支持：

- `deliverAs: "steer"`（流式输出期间的默认值）：引导当前运行
- `deliverAs: "followUp"`：流式输出期间排在当前运行之后
- `deliverAs: "nextTurn"`：不进入可编辑的待处理消息 UI；流式输出期间等待下一轮，空闲且未设置 `triggerTurn` 时，追加到上下文/历史中而不启动一轮
- `deliverAs: "aside"`：在下一个智能体步骤边界注入，不打断当前工具批次，但会结束正在运行的可中断 `wait`（等待返回 "Wait interrupted by message."，其作业继续运行）；空闲时通常无论 `triggerTurn` 如何都会启动一轮。计划模式或用户中断后的自动恢复抑制会改为将其并入上下文
- `triggerTurn: true`：空闲时启动一轮（也遵循 `deliverAs: "nextTurn"`：空闲时立即发起提示；流式输出期间，排队消息会安排内部续接）

空闲且没有 `triggerTurn` 时，普通 `sendMessage` 投递会追加
消息，而不启动一轮。`display: true` 消息会立即
渲染；`"nextTurn"` 投递不会发出该即时显示事件。
ACP 客户端可以延后智能体发起的轮次，此时原本会
启动一轮的请求会保留为隐藏的下一轮消息。

`pi.sendUserMessage(content, { deliverAs })` 提交文本/图像，不展开斜杠命令
或提示模板。省略 `deliverAs` 可在空闲时发起提示；
流式输出期间，省略则会将引导消息排队。显式 `"steer"` 或 `"followUp"`
会将提示排队。空闲时，队列排空可用该输入启动一轮，
即使它位于扩展消息或上下文压缩摘要之后。用户有意
中断后，已排队的后续消息仍会被保留，直至显式输入恢复
会话。`"aside"` 在运行进行中于下一个步骤边界注入，
空闲时启动一轮。除非传入
`attribution: "agent"`，否则消息以 `attribution: "user"` 记录；扩展生成或从其他智能体
转发的文本应使用 `"agent"`。

传给 `pi.sendMessage` 的载荷会在投递前规范化
（`packages/coding-agent/src/session/transcript/messages.ts` 中的 `normalizeCustomMessagePayload`，
由 `session/messages.ts` 重新导出）：非对象载荷会强制转换为默认自定义类型下的字符串
内容，缺失的 `customType`/`attribution` 字段
使用默认值，无效内容归为空字符串。

对于像 `!!` bash 运行那样会绘制并保存、
但从不发送给模型的行，例如每轮统计或状态行，
在载荷上设置 `excludeFromContext: true`。该标志持久化在 `custom_message` 条目上，因此该行在恢复、
上下文压缩和分支摘要后仍不进入上下文。这样的行从不
启动或延长一轮：`triggerTurn` 和 `"aside"` 会被忽略。在
运行进行中发送时，它会像 `!!` bash 行一样排队，在运行
结束或下次提示开始时绘制并保存；如果 `/new` 或会话切换打断
运行，则保存到离开的会话中。像 `!!` 和 `$$` 运行一样，它会保留
已显示的输入框预测，并且不会阻挡已排队的后续消息，
因为模型看到的内容没有变化。

## 2) 处理器上下文 (`ExtensionContext`) \{#2-handler-context-extensioncontext}

处理器和工具 `execute` 会收到包含以下内容的 `ctx`：

- `ui`
- `mode`：`"tui" | "rpc" | "json" | "print"`；ACP 使用 `"rpc"`。使用仅适用于终端的组件前应检查 `"tui"`
- `hasUI`：此运行器是否具有非空操作的 UI 上下文，而不是每个 UI 方法是否都受支持
- `cwd`
- `sessionManager`（只读）
- `modelRegistry`, `model`
- `models`（只读模型查询，见下文）
- `localProtocolOptions`（可选的调用会话 `local://` 根映射，用于外部工具桥接）
- `getContextUsage()`
- `getAsyncJobSnapshot()` 返回当前会话的只读异步作业快照；没有会话拥有该上下文时返回 `null`
- `cancelAsyncJob(id)` 取消此会话拥有的正在运行的异步作业（例如后台 `task` 工作线程），如同 `/jobs kill <id>`；如果会话不拥有该 id 的运行中作业，则返回 `false`。要全部停止，可遍历 `getAsyncJobSnapshot()?.running`
- `compact(instructionsOrOptions?)`：接受摘要重点文本或 `CompactOptions`，包括一次性的 `mode: "soft" | "remote" | "snapcompact"`、`onComplete`、`onError` 和 `suppressContinuation`
- `isIdle()`, `hasPendingMessages()`, `abort()`
- `shutdown()`
- `resolvePlanReview(reviewId, choice, input?)`：回答已打开的交互式计划审查；当审查或选项不可用时返回 `false`（使用 `input.role` 时，可用性按该层级判断，因此即使滑块未选中更大上下文层级，也可以为它接受 `keep`），`refine` 要求非空的 `input.feedback`；对于批准（`execute`、`compact`、`keep`），`input.role` 可以指定事件 `tiers` 中的一个层级来选择执行模型（未知角色，或在其他任何选项上提供 `role`，都会返回 `false`）
- `getPendingPlanReview()`：仍在等待回答的已打开交互式计划审查，采用 `plan_review_requested` 形式，`options` 按滑块当前选中的层级重新测量；或为 `undefined`；可用它回答在扩展加载或重新连接之前已打开的审查
- `openPlanReview()`：针对最新计划文件打开交互式计划审查，如同 `/plan-review`；审查开始等待回答时即兑现为 `true`，不等待选择。已打开的审查会保留，不会替换。与 `/plan-review` 不同，它从不中止工作：智能体正在流式输出或压缩上下文、计划模式未启用，或不存在非空计划文件时，它会静默兑现为 `false`
- `sessionModes`（仅交互式 TUI 会话；在 print、JSON、RPC、ACP 及子代理中为 `undefined`）：不通过斜杠命令或对话框，直接控制内置的计划、vibe、目标和循环模式。`getState()` 返回独立快照（`plan`/`goal`：`inactive | active | paused`，`vibe`：`inactive | active`，`loop`：`inactive | active | paused`，加上计划文件和目标内容/预算），因此延迟加载的扩展可以读取当前状态。`set(request)` 执行一次显式转换：`{ mode: "plan" | "vibe", action: "enter" | "exit" }`、`{ mode: "goal", action: "enter", objective, tokenBudget? }`、`{ mode: "goal", action: "pause" | "resume" | "drop" }`、`{ mode: "loop", action: "enter", prompt?, limit?, condition? }` 或 `{ mode: "loop", action: "exit" }`。请求已满足的状态会返回 `{ ok: true, changed: false }`。拒绝会返回 `{ ok: false, code, message, state }`，其中 `code` 为 `busy`（一轮、上下文压缩或另一次模式转换正在运行；会话仍在恢复保存的模式，例如在 `session_start` 或会话切换期间；或已完成目标仍在清理中）、`conflict`（另一模式阻止了它，与斜杠命令相同）、`disabled`（`extensionHandlers.modeControl` 关闭，或 `plan.enabled` / `goal.enabled` 关闭）或 `invalid_request`。任何转换都不提交提示，应单独发送；目标续接和循环重复会在下一轮结束后开始。循环的 `prompt` 是每轮之后重复的文本（未提供时，使用用户下一次键入的提示）；对活动循环设置它会替换该文本，对暂停的循环执行 `enter` 则会恢复。计划的 `exit` 会完全离开计划模式，恢复工具和模型，但不会批准计划或删除其草稿。设置 `extensionHandlers.modeControl: false` 会拒绝所有 `set()`，但 `getState()` 和 `mode_changed` 仍然有效。

   ```ts
   pi.registerCommand("mission", {
   	handler: async (args, ctx) => {
   		const entered = await ctx.sessionModes?.set({ mode: "plan", action: "enter" });
   		if (!entered?.ok) return ctx.ui.notify(entered?.message ?? "Mode control needs the TUI", "warning");
   		pi.sendUserMessage(args);
   	},
   });
   ```

- `getSystemPrompt()`
- `isProjectTrusted()`：始终为 `true`；OMP 在加载项目输入前不要求逐目录信任
- `agent`：此会话运行的智能体：`{ kind: "main" | "sub", id, name, depth, parentId? }`。工厂函数会为每个子代理会话（task 工具、eval `agent()`、`/tan` 克隆）重新绑定，因此处理器可以检查 `ctx.agent.kind === "sub"` 或小写的智能体定义 `name`（例如 `"explore"`），使其仅在子代理中行动。使用 `kind`，不要使用 `depth`：`depth` 只计算 `task` 嵌套，因此 `/tan` 克隆是深度为 0 的子代理，并报告 `name: "sub"`。顾问自身的工具调用会以 `{ kind: "sub", id: "advisor", name: "advisor", depth: 0, parentId }` 到达会话的 `tool_call`/`tool_result` 处理器，因此 `kind === "main"` 也会排除顾问活动
- `runEphemeralTurn(...)`（可选；见下文）
- `startLive(...)`（可选；仅交互模式；见下文）
- `memory`（可选的结构化记忆运行时，在配置的后端上提供状态/搜索/保存）
- `annotations`：供看板和远程客户端使用的 `/annotate` API。`submit({ source, notes, deliver?, review?, focus? })` 构造与 `/annotate` 相同的反馈，并在不使用任何 UI 的情况下投递；`open({ source, deliver?, focus? })` 在来源上挂载批注浮层，并兑现操作员的批注（关闭时为 `undefined`；仅适用于 `mode === "tui"`）。文本来源为 `{ kind: "text", text, label? }`、`{ kind: "file", path }`（相对于当前会话 cwd 解析）或 `{ kind: "last" }`；差异来源为 `{ kind: "diff", diff, label? }`、`{ kind: "uncommitted" }` 或 `{ kind: "pr", ref }`（`ref` 为 GitHub PR 或 GitLab MR URL、`pr://owner/repo/N` 或 `mr://<host>/<group>/<project>/N/diff`）。`review`/`focus` 仅适用于差异来源（用于文本来源时为类型错误）。文本批注为 `{ note, line?, quote? }`（从 1 开始；省略时针对整个来源，且会填入引用行）；差异批注为 `{ path, note, line?, side?, occurrence?, rawLine? }`（`side` 默认为 `"new"`；`rawLine` 是包含 `+`/`-`/空格前缀的差异行）。与来源不匹配的批注会被拒绝，而不是被丢弃。`text` 和 `diff` 来源是传入内容的冻结快照；`file`、`last`、`uncommitted` 和 `pr` 在调用时重新读取，行号与当前内容匹配，因此应传入 `quote`/`rawLine`，以便内容发生漂移时拒绝某条批注（并指出它）。`deliver` 默认为 `"auto"`：交互式 TUI 编辑器可用时，可粘贴批注进入输入框，否则发送；LLM 审查请求（差异上的 `review: true`）始终发送。发送使用 `pi.sendUserMessage`，智能体流式输出期间会作为后续消息排队。`"paste"`/`"send"` 强制指定渠道，`"none"` 只返回 `text`。结果通过 `kind` 区分：`"text"` 携带 `TextReviewAnnotation[]`；在 `open` 之后，如果操作员在外部编辑器中替换了来源，还会携带 `editedText`（此时反馈指向该文本）；`"diff"` 携带 `CodeReviewAnnotation[]` 和 `review`（表示 `text` 是否为 LLM 审查请求）。两者均携带渲染后的 `text` 和 `delivered` 渠道。
  显式粘贴要求 `ctx.ui.supportsEditor === true`：TUI 和非无头 RPC 提供输入框；ACP 和空操作 UI 上下文不提供。用于 LLM 审查的传入差异如果超过 50,000 字符或 20 个可审查文件，会在投递前被拒绝，`open` 也会在挂载浮层前拒绝这样的补丁；请将较大补丁拆成较小请求。仅提交批注时不受此审查提示上限限制。
- `setInterval(fn, ms, ...args)` / `setTimeout(fn, ms, ...args)` / `clearTimer(timer)`：托管定时器（见下文）

### 临时旁路轮次 (`ctx.runEphemeralTurn`) \{#ephemeral-side-turns-ctxrunephemeralturn}

使用当前模型和对话上下文，运行与 `/btw` 相同的旁路轮次流水线。问题和响应不会追加到会话历史中，请求可以在主轮次活动时运行。快照可能包含正在输出的助手文本。

```ts
if (!ctx.runEphemeralTurn) {
	throw new Error("This host does not support ephemeral turns");
}
await requireConsultationConsent(remoteCaller);
await auditConsultationRequest(remoteCaller, remoteQuestion);
const { replyText } = await ctx.runEphemeralTurn({
	promptText: remoteQuestion,
	tools: false,
	maxTokens: 4096,
	maxContextBytes: 1_048_576,
	onTextDelta: delta => sendRemoteChunk(delta),
	signal: requestAbortController.signal,
});
```

例如，Synadia/NATS 桥接可以从本地上下文回答另一智能体的问题，并流式返回响应，而无需注入实时用户消息。**旁路轮次会将当前对话快照发送到配置的模型提供方，并将其回答返回给调用扩展。** 桥接扩展必须在适当情形下获得用户同意，对调用方进行身份验证和权限校验，并在使用此 API 前审计每个远程请求。智能体间咨询扩展可以在推理前设置 `maxTokens` 及序列化、转换后的 `maxContextBytes` 上限（在机密混淆后测量）。会省略或覆盖调用方输出 token 限制的传输，包括 Codex Responses、Cursor、GitLab Duo Workflow 和 Ollama Cloud 发现模型，会在推理前拒绝 `maxTokens`，而不是静默启动无上限请求。请求上限会禁用可选的预算思考，因为这些传输原本可能提高传输限制以容纳思考预算；要求预算思考的模型会拒绝该上限。Cursor 的传输会独立于所提供的工具目录公开原生工具，因此 `tools: false` 在 Cursor 上也会在推理前被拒绝。两个上限都必须是正的安全整数。只有在可以接受无上限轮次时才省略 `maxTokens`，或选择支持输出限制的 API。扩展负责传输、访问控制、请求限制和取消（包括关闭）；此 API 不增加网络依赖。`onTextDelta` 可以返回 promise：投递会按序等待，包括最终刷新；投递错误会拒绝旁路轮次并中止提供方请求，而不是让它继续流式输出。

钩子可以启动旁路轮次，包括从延迟回调中启动。只有在运行中的旁路轮次_内部_到达的 `context`、`before_provider_request` 和 `after_provider_response` 钩子会拒绝嵌套的 `runEphemeralTurn` 调用，以限制递归；调用方的 `onTextDelta` 在该防护之外运行。旁路轮次继承当前事件处理器信号（仅在该处理器仍运行时），对于已注册工具，还会继承工具调用的中止信号。显式 `options.signal` 与这些信号合并，不替换它们。`maxContextBytes` 在 `before_provider_request` 钩子运行前检查；替换载荷的钩子不会触发重新测量。

工具调用始终被丢弃，不会执行。传入 `tools: false` 可在上下文转换后移除工具定义，并在提供方边界设置 `toolChoice: "none"`。省略它会保留 `/btw` 的工具目录以复用提示缓存；禁用可能降低缓存命中率。如果转换后的历史仍包含工具调用或结果，Bedrock Converse 会拒绝退出工具使用。现有上下文/提供方钩子仍会运行。这不是沙箱，也不保证任意扩展钩子没有副作用。模型推理会消耗配置提供方的资源。`dedupeReply` 默认为 `true`，会折叠连续超过三行的相同行，并将返回的回复限制为 4 KiB。设为 `false` 可禁用这些转换；`replyText` 仍会去除首尾空白。调用方应使用 `replyText` 获取最终结果。

`history` 仅用于独立的既往旁路轮次消息；它通过 `structuredClone` 克隆，因此应传入可克隆的消息数据。`conversationKey` 让相关旁路轮次保持在同一提供方会话谱系上。取消或失败后，在重试前应更换它。如果会话或具体模型实例在分派前改变，旁路轮次也会以可重试错误拒绝；调用方应从新的当前上下文快照重试，而不是复用旧快照。

### 在自有对等端上进行实时语音 (`ctx.startLive`) \{#live-voice-on-your-own-peer-ctxstartlive}

启动一个 `/live` 会话，让音频在扩展拥有的 WebRTC 对等端上运行，例如手机浏览器，而不是宿主的麦克风和扬声器。其余部分仍由 omp 负责：信令（使用会话 OpenAI Codex 登录的 Codex，或在设置 `live.endpoint` 时使用[自定义实时端点](./rpc.md#custom-live-endpoint)）、内置实时提示、作为普通轮次委派到此会话的工作，以及会话记录。TUI 显示实时可视化，`/live` 或停止键结束通话。

```ts
if (!ctx.startLive) throw new Error("This host does not run live sessions");
const live = await ctx.startLive({
	sdpOffer, // from the peer: one sendrecv Opus audio track plus an "oai-events" data channel
	onPhase: phase => relay({ phase }), // "muted": silence the peer's microphone track
	onTranscript: t => relay({ transcript: t }),
	onEnd: error => relay({ end: error?.message ?? null }),
});
await peer.setRemoteDescription({ type: "answer", sdp: live.sdpAnswer });
// later: await live.stop();
```

通话完成信令且控制套接字打开后，promise 即兑现；应立即应用 `sdpAnswer`。没有非空的 `sdpOffer` 或已有另一实时会话活动时，它会拒绝。`voice` 和 `instructions` 与 RPC `live_start` 的行为相同。对等端自行处理回声消除和静音：TUI 静音键只会将阶段改为 `muted`，因此在该阶段持续期间，应静音对等端的麦克风轨道。omp 不会为这些通话报告音频电平或 `speaking` 阶段。`onEnd` 恰好调用一次，包括通话启动失败时（在 promise 拒绝之前）。观察器回调抛错会被记录，但不会结束通话。

omp 对这些通话没有媒体对等端，因此无法判断你的对等端何时离开。对等端断开时（`connectionstatechange` 变为 `failed` 或 `closed`，或你的中继套接字关闭），应调用 `live.stop()`；否则通话保持打开，TUI 会继续显示实时可视化。

持有对等端的人可以通过语音引导此会话，包括运行工具的委派工作，因此应对提供 offer 的页面或中继进行身份验证。

### 后台工作 (`ctx.setInterval` / `ctx.setTimeout`) \{#background-work-ctxsetinterval--ctxsettimeout}

扩展**在进程内运行，没有隔离**。原生 `setInterval`/`setTimeout`/分离 promise 回调如果抛错，会在处理器分派的 try/catch 之外运行，表现为进程级 `uncaughtException`，全局事后处理器会将其视为致命错误：**整个会话都会被拆除**，而不只是出错的扩展。

对任何周期性或延迟后台工作，都使用 `ctx.setInterval` / `ctx.setTimeout`。它们与平台签名一致，但：

- 以与处理器分派相同的隔离方式运行回调：同步抛错或 promise 拒绝会被记录，并通过扩展错误渠道报告，会话继续运行；
- 返回可传给 `ctx.clearTimer(handle)` 的句柄；
- 已执行 `unref`（永远不会单独使进程保持存活），并在 `session_shutdown` 时自动清除。

```ts
pi.on("session_start", async (_event, ctx) => {
	const timer = ctx.setInterval(() => {
		// A throw here is contained — it will not crash the session.
		ctx.ui.notify("tick", "info");
	}, 60_000);
	// Optional: clear it yourself; otherwise it is cleared on shutdown.
	pi.on("session_shutdown", () => ctx.clearTimer(timer));
});
```

如果改用原生 `setInterval`/`setTimeout` 或分离 promise，则由你负责隔离：用自己的 `try/catch` 包裹回调主体（未处理的抛错会使会话终止），并在 `session_shutdown` 时清除定时器。

### 模型选择 (`ctx.models`) \{#model-selection-ctxmodels}

`ctx.models` 是一个只读门面，用于以与核心相同的方式选择和比较模型：

- `list()`：此会话中可用的已认证模型。
- `current()`：当前会话模型（延迟读取，因此会反映 `/model` 切换）。
- `resolve(spec)`：模型字符串（`provider/id`、单独的 id）或角色别名（`@slow`、已配置角色）→ `Model`，遵循与 `--model` 相同的基于设置的别名和匹配偏好。没有匹配项时返回 `undefined`。
- `family(model)`：用于“是否同一系列？”检查的不透明谱系令牌（Claude 的小版本共享一个令牌；Claude 与 GPT 不同）。可以比较，不要持久化它（其词汇会随新发布版本更新）。

```ts
// Pick a model from a different family than the current one (e.g. a cross-family reviewer).
const current = ctx.models.current();
const contrasting = ctx.models.list().find(m => current && ctx.models.family(m) !== ctx.models.family(current));
```

## 3) 命令上下文 (`ExtensionCommandContext`) \{#3-command-context-extensioncommandcontext}

命令处理器还会获得：

- `waitForIdle()`
- `newSession(...)`
- `switchSession(...)`
- `branch(entryId)`
- `navigateTree(targetId, { summarize })`
- `reload()`

会话控制流程应使用命令上下文；这些方法有意与通用事件处理器分离。

## 事件接口（当前名称与行为） \{#event-surface-current-names-and-behavior}

标准事件联合类型和载荷类型位于 `types.ts`。

### 会话生命周期 \{#session-lifecycle}

- `session_start`
- `session_before_switch` / `session_switch`
- `session_clear`
- `session_before_branch` / `session_branch`
- `session_before_compact` / `session.compacting` / `session_compact`
- `session_before_tree` / `session_tree`
- `session_before_shutdown` / `session_shutdown`

在交互式 TUI 中，如果某扩展的工厂函数不注册提供方、
快捷键、输入框形态或文件后备处理器，且先前启动已针对其当前
源代码记录了这一点，则会在输入框
接受输入后加载它。它的 `session_start` 仍会运行（在扩展
绑定时投递），并且首次提交消息和每个模型轮次都会等到它
加载完成，因此它的工具、命令及 `input`/`before_agent_start` 钩子从
首个请求起就生效。绑定之前发出的事件不会重放。恢复的
会话、`--tools` 以及带有 omp 不识别标志的启动，会在会话开始前加载所有
扩展。

成功就地重置上下文（`/clear` 或 `AgentSession.resetSessionContext()`）后，
`session_clear` 会收到 `{ type: "session_clear" }`，也包括
清空已为空的上下文。重置返回前会等待处理器，它们可以使已注入模型上下文的指令
缓存失效。会话 id、
文件和持久化历史不变；这不是 `session_switch`，且
无法取消重置。忙碌时或被拒绝的重置不发出事件。

`session.compacting` 接收 `{ sessionId, messages }`，并可以返回
`{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }`
以自定义摘要上下文、摘要器提示和存储的上下文压缩数据。
如果 `session_before_compact` 已提供替代的
上下文压缩结果，则跳过它。

可取消的前置事件：

- `session_before_switch` → `{ cancel?: boolean }`
- `session_before_branch` → `{ cancel?: boolean; skipConversationRestore?: boolean }`
- `session_before_compact` → `{ cancel?: boolean; compaction?: CompactionResult }`
- `session_before_tree` → `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }`
- `session_before_shutdown` → `{ cancel?: boolean }`

前置事件是关卡：处理器可以在决定前询问操作员，因此等待宿主对话框（`ctx.ui.select`、`confirm`、`input`、`askDialog`、`formDialog`、`approve`、`editor`、呈现的 `custom` 组件）的时间不计入 30 秒处理器预算。`session_before_compact` 和 `session_before_tree` 上的 `signal` 是协作式的：将它传给自己的工作，但操作仍会等待处理器。`session_before_shutdown` 上的 `signal` 会释放关闭流程：中止时，宿主停止等待，关闭待处理对话框，并忽略迟到的结果。

`session_before_branch` 和 `session_branch` 携带 `reason`，用于决定 `session_before_branch.entryId` 的含义。对于 `"branch"`（`branch(entryId)`、`/branch`），它是正在回退的用户消息：该消息及其之后的所有内容都会被丢弃。对于 `"fork"`（`AgentSession.fork(entryId)`、带 `entryId` 的 RPC `fork`）和 `"btw"`（`/btw` 提升），它是新会话中保留的最后一条条目。

#### 关闭会话 \{#closing-the-session}

`session_before_shutdown` 会在操作员通过仍可拒绝的关闭方式结束会话前询问扩展：在交互式 TUI 中，这包括 `/exit`、`/quit`、空编辑器上的 Ctrl+D、双击 Ctrl+C，以及从会话选择器退出。它在任何内容被停止之前运行，此时扩展 UI 仍可用，而且每次尝试都会再次触发。强制关闭从不发出它：致命工作区错误、`ctx.shutdown()`、操作系统信号、重启，以及 RPC/ACP/print/SDK/子代理释放。

首个 `{ cancel: true }` 会使会话保持打开。错误、超时和中止会让关闭继续。当关闭停止等待时，事件的 `signal` 会中止：再次请求关闭（又一次 `/exit` 或 Ctrl+D、致命关闭）、操作系统信号或 UI 停止。此后送达的取消会被忽略。操作员的对话框按键不变；关闭提示会将其兑现为 `undefined`，这会正常关闭。

提示期间到达的 `ctx.shutdown()` 请求不会随操作员退出的取消而取消；它仍会在下一个结算边界关闭会话。

```ts
pi.on("session_before_shutdown", async (event, ctx) => {
	const outcome = await ctx.ui.input("Did this session reach its goal?");
	if (event.signal.aborted || outcome === undefined) return;
	pi.appendEntry("session-outcome", { outcome });
});
```

取消会使宿主停止等待，但无法停止扩展代码或撤销其副作用；持久化迟到结果之前应检查 `signal`。`appendEntry` 遵循正常会话持久化规则，因此不会强制将空会话写入磁盘。

`session_shutdown` 保持不变：它是仅通知的清理事件，处理器并发运行，预算为 2 秒。应在 `session_before_shutdown` 中提问，不要在那里提问。

### 提示与轮次生命周期 \{#prompt-and-turn-lifecycle}

- `input`
- `before_agent_start`
- `before_provider_request`：接收 `{ payload }`；直接返回替代载荷本身（不是 `{ payload }`）。处理器串联。提供方传输必须调用 `onPayload`；`devin-agent` 不会调用。
- `after_provider_response`：消费响应体之前的通知：`{ status, headers, requestId?, metadata? }`。提供方请求/响应处理器在 `ctx.model` 中收到用于该请求的模型。
- `context`：接收对话消息，可返回 `{ messages }`；替代内容串联，但不重写持久化历史
- `agent_start` / `agent_end`：智能体循环生命周期通知；`agent_end` 仍然仅用于通知。
  对扩展而言，`agent_end.messages` 包含循环结束时的当前会话上下文，而不只是
  该循环产生的消息。较早消息可能在后续通知中再次出现；
  上下文压缩或分支变化可能改变该上下文中保留的消息。当某操作应对每条消息只执行一次时，应跟踪已处理的
  消息 ID，而不是把这个数组当作增量。
- `session_stop`：主会话停止钩子，在结算前等待。建议性的 `{ continue: true, additionalContext }` 请求最多允许 8 次续接。显式 `{ decision: "block", reason }` 拒绝优先于建议请求，不消耗该额度，并持续阻止，直到钩子允许完成或操作员中断。没有原因的拒绝会收到诊断性续接，而不是获准结束。此事件从不为 task/子代理会话触发，且会延后至智能体拥有的后台作业完全空闲（`session/agent-session.ts` 中的 `#hasPendingAsyncWake`）。
- `cache_warming_decision`：在每次提示缓存预热决策之前触发，携带预热器的经济性信息：`method`（对于 `max_tokens: 0` 预热为 `"prewarm"`，对于单 token 重放为 `"replay"`；请求无法安全刷新时缺省）、`warmCost`（读取提示缓存的费用，加上重放预期计费输出）、`missCost`（重新写入提示而非读取它的费用）、`compactCost`（通过上下文压缩衔接等待的费用；不能压缩时缺省）、`spentCost`（自上次实际请求以来的刷新花费）、`continuationProbability` 和 `action`（`"warm"`、`"compact"` 或 `"stop"`）。返回 `{ action }` 可覆盖；最后一个返回 action 的处理器生效，处理器失败或回答慢于 2 秒会保留预热器的决策，预热器无法执行的覆盖也一样（没有 `method` 的 `"warm"`，没有 `compactCost` 或晚于条目到期前一分钟的 `"compact"`）。`"stop"` 覆盖会结束预热，直至下次实际请求。主智能体循环在任何模式下都会预热，task 子代理则在最高至 `streaming` 模式时预热；一次性会话从不触发此事件。刷新本身经过与实际请求相同的提供方路径，因此也会触发 `before_provider_request` 和 `after_provider_response`；替代载荷必须与实际载荷逐字节相同，刷新才能命中缓存。
- `turn_start` / `turn_end`
- `assistant_message`：每条最终确定的助手消息会在进入智能体上下文、持久化、`message_end` 或工具分派之前等待一次。返回 `{ content }` 可替换历史、持久化、`message_end` 使用方及下次提供方请求中的文本；处理器串联。已通过流式更新（`message_update`、ACP/RPC 块）投递的文本不会撤回，因此从流渲染的客户端可能继续显示原始文本。文本块必须保留数量、顺序和位置；只能更改其文本。所有非文本块和其他块元数据必须保持不变。未更改的文本保留其原始 `textSignature`（即使处理器丢弃或更改了它）；编辑过的文本会失去签名，避免将提供方重放状态复用于不同文本。无效替换和处理器错误会被报告并跳过。处理器待处理期间若中止，则保留目前已完成的重写，并跳过剩余处理器。
- `message_start` / `message_update` / `message_end`：生命周期通知；`message_end` 接收独立快照，因此就地更改无法重写智能体或提供方上下文

```ts
pi.on("assistant_message", event => ({
	content: event.message.content.map(block =>
		block.type === "text" ? { ...block, text: block.text.replaceAll("teh", "the") } : block,
	),
}));
```

`before_agent_start` 为普通提示，以及每个包含用户工作的引导或后续批次，在该批次实际出队时准备策略（`reason: "prompt"`）。它不是入队通知：活动批次可以在没有另一次 `agent_start` 的情况下触发它。队列查看、提供方重试、仅工具迭代和仅合成内容的排队续接不会触发它。显式合成提示保留其普通提示生命周期。唤回停驻的子代理（用于唤醒、消息或仅聚焦）会在 `session_start` 之后触发它一次，使用 `reason: "revive"` 和空的 `prompt`，其结果被丢弃，使扩展可以重新注册它在子代理首次提示时注册的内容；执行逐提示工作的处理器（召回、分类、日志）应在 `reason: "revive"` 时提前返回，因为唤回会等待它们。唤醒轮次由智能体发起，不触发它，而之后的普通提示照常运行它。

对于排队批次，`prompt` 包含每条选中用户消息已转换的文本，消息之间以两个换行连接；同一消息内的文本块直接拼接。`images` 按投递顺序包含其已规范化图像。隐藏的智能体归属伴随消息不包含在这些事件输入中，但仍保留在投递批次中。输入钩子、命令、模板和原始附件预处理不会重新运行。

处理器从当前基础系统提示开始串联。它们最终的覆盖控制下次提供方请求及其续接，直到另一个提示或包含用户内容的批次准备策略。覆盖始终是完整替换，包括与基础无关的字符串或数组；宿主从不推断文本补丁或为其变基。返回的自定义消息在原始批次之后追加一次；原始消息保留顺序、身份、归属和元数据。如果处理器待处理期间轮次被中止，或会话/队列所有权改变，宿主会取消应用结果。

如果返回覆盖的来源基础在准备期间改变（例如处理器等待 `pi.setActiveTools()`），宿主会丢弃该次尝试返回的自定义消息及暂存记忆，然后从最终生效的基础重新准备策略。每次投递最多运行三次尝试；基础反复变化会引发错误，而不投递原始输入。排队的原始消息继续留在队列中，失败轮次结算不会自动重试它们。新提示或排队投递可以重新开启队列排空，包括扩展或顾问的合成后续消息和自定义消息；该暂停并不限制为只能由用户重试。普通文本通过丢弃提示回调返回。基础内容不变时不会触发重试，即使刷新替换了数组。没有覆盖的准备仍使用最终生效的基础，不重新运行处理器或召回。发布结果前会再次同步检查所有权；迟到的变化会拒绝投递，不提交记忆或上下文。

处理器必须容忍重入：来源基础重试可以为同一次提交再次调用整个 `before_agent_start` 链，取消的投递也可能在恢复时再次准备。只有接受的那次尝试返回的上下文和暂存记忆会被发布；处理器执行的外部副作用无法回滚。输入钩子、命令、模板和原始附件预处理绝不会因这些策略重试而重放。

如果之后的队列排空失败，尚未进入
会话记录的较早原始消息会恢复到较新入队消息之前。生成的准备上下文
不会重新入队，已显式清空或替换的队列也不会恢复。

#### 外部输入拦截 \{#external-input-interception}

`input` 在提交入口运行一次，先于命令解释、技能或
提示模板展开及队列插入：

| 提交方式 | `source` |
| --- | --- |
| 主会话 Enter 或 Ctrl+Enter | `"interactive"` |
| RPC 或 RPC UI 模式中的 `prompt`、`steer`、`follow_up` 或 `abort_and_prompt` | `"rpc"` |

处理器按扩展/注册顺序运行。返回的 `text` 和 `images`
替代值会传给后续处理器；省略字段会保留当前值，
`images: []` 则移除附件。替代文本在分派前去除首尾空白。
`handled: true` 会停止剩余处理器和正常分派。文本为空且
没有剩余图像也会停止正常分派。处理器通过
`sendUserMessage` 或 `sendMessage` 显式安排的工作不会被丢弃。

这是入口事件，不是用户角色消息事件。队列投递和重放
不会再次发出它。程序化的 `sendUserMessage`/`sendMessage` 调用和
合成续接不会自动发出 `input`。主会话 Enter 的
`.`/`c` 续接快捷方式保留其合成路径。聚焦的子代理
输入保留其仅聊天路由，不调用主会话输入钩子。
Print 和 ACP 输入不在此拦截契约之内。

Ctrl+Enter 会在等待原生处理器之前分离已提交草稿，因此
另一次提交无法复用它，之后的普通键入仍作为新草稿。
已处理/空输入只消耗分离的提交。分派失败
会将其文本和附件恢复到任何较新草稿旁。这并不使
既有的交互式输入处理器链变得可由 Esc 取消。
内置提交清理也会保留较新草稿，包括 `/clear`
和 `/new`。命令保留其显式预填和会话转换操作。

### 工具生命周期 \{#tool-lifecycle}

- `tool_call`（执行前，可阻止、修订工具执行的 `input`，或返回被动 `additionalContext`；对于模型发出的调用，它在智能体循环的参数准备时触发，因此修订会重新验证，并同时被并发调度、执行事件、持久化助手消息及批准关卡看到；非阻止型处理器的被动上下文在该批次工具结果之后，按助手调用顺序、在下次提供方请求之前投递）
- `tool_result`（执行后，可修改 content/details/isError，或返回被动 `additionalContext`；即使 `event.isError` 为 true，结果上下文也会在工具输出之外投递，因此针对失败的处理器可以引导模型下一步）
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`（可观测性）
- `tool_approval_requested` / `tool_approval_resolved`（可观测性；只有工具需要批准且注册了批准处理器时，才由 `wrapper.ts` 发出）

`tool_call` 和 `tool_result` 使用 `toolCallId` 标识调用。当 JS 或 Python eval 单元或内核定义的工具调用会话工具时，两个事件还会携带 `parentToolCallId`：它是发起嵌套调用的那次调用的 ID，而不是定义工具的 eval 的 ID。直接调用省略此字段。

`tool_result` 采用中间件风格：处理器按扩展顺序运行，每个都能看到先前修改。每个处理器中不同的非空白 `additionalContext` 会按注册顺序保留（比较时忽略首尾空白，重复项会被丢弃），并在该调用的 `tool_call` 上下文之前投递。

### 计划审查生命周期 \{#plan-review-lifecycle}

- `plan_review_requested` 报告交互式计划审查，携带其 `reviewId`、会话、标题、计划路径及内容，以及按显示顺序排列的选项。选项 id 稳定（`execute`、`compact`、`keep`、`refine`、`save`）；标签可能变化，`keep` 携带当前 token 数，按审查打开时选中层级的上下文窗口测量（移动滑块会重新测量；通过 `ctx.getPendingPlanReview()` 读取当前状态）。扩展可以在终端选择器保持可用时通过 `ctx.resolvePlanReview(...)` 回答它；第一个回答生效。`save` 不打开路径提示，而是按默认文件名写入计划，并保持审查打开，仍可回答（不会触发 `plan_review_resolved`）。浮层只有在计划含批注时才显示 Refine；带 `input.feedback` 的 `refine` 则无论哪种情况都会接受。
- 扩展回答的批准会在 `input.role` 指定的层级上运行；省略 `role` 时，则使用浮层模型滑块当前选中的层级；`plan_review_requested` 列出可选择的 `tiers`（`role`、`provider`、`model`，以及角色固定思考级别时的 `thinkingLevel`；解析出的层级少于两个时缺省）。批准执行的是选择时的计划：如有浮层内编辑则使用编辑内容，否则从磁盘重新读取计划文件。这可能与报告的 `planContent` 不同；扩展可以在回答前写入计划文件，以执行自己的修订。
- 层级顺序遵循配置的角色循环，而不是选中的层级。可用时，滑块初始选择 `default`；远程 `input.role` 会更新显示的层级并提交回答，防止之后的终端输入更改它。
- `plan_review_resolved` 报告审查如何关闭，携带选中的选项 id（关闭，或因会话切换、替代审查、关闭会话而取消时为 `undefined`）及 `by: "local" | "extension"`。它在浮层实际关闭时、所有 `plan_review_requested` 处理器返回之后触发，因此 `plan_review_requested` 处理器应交出长时间工作（远程往返、`ctx.ui` 对话框），而不是等待它。

### 模式生命周期 \{#mode-lifecycle}

- `mode_changed` 在内置模式更改提交后报告 `{ previous, state }`（采用 `ctx.sessionModes.getState()` 形式），无论由什么引起：`ctx.sessionModes.set()`、斜杠命令、goal 工具、自动完成目标或会话恢复。会话切换会在结算后报告一次，携带目标会话恢复的模式。目标 token/时间计量不属于状态，因此不会触发此事件。处理器可以调用 `ctx.sessionModes.set()`；另一转换仍在运行时发出的调用会返回 `busy`，而不是等待。

### 智能体视图生命周期 \{#agent-view-lifecycle}

- `agent_view_changed` 在交互式 TUI 切换显示的会话时报告 `{ agentId, previousAgentId, sessionId }`：聚焦子代理、跳转到另一个智能体（包括其父级），或返回主会话（显式返回，或因聚焦的智能体被停驻、中止、移除）。对主会话，`agentId`/`previousAgentId` 为 `undefined`，`sessionId` 是当前显示会话的 id。它在新视图附加后，于主会话扩展上触发，从不针对被取代或失败的聚焦请求触发，且仅在交互式 TUI 中触发。可用它将 `ctx.ui.setStatus` 内容的范围重新限定为屏幕上的智能体。

### 子代理生命周期 \{#subagent-lifecycle}

- `before_subagent_spawn` → `{ model?: string | string[]; block?: boolean; reason?: string; note?: string }`。每个生成的子代理（`task`、eval `agent()`、工作池工作线程）都会在父会话中恰好触发一次，发生在分派时、子代理解析模型之前，绝不在前端的验证预检期间触发，因此有状态路由器（轮询、配额）每个子代理只推进一次。事件携带 `agent`、`invocationKind`、`modelRole`（若存在，为展开前的角色别名）、核心本会使用的已展开 `patterns`，以及可选的稳定 `spawnKey`；由 `task` 工具分派的子代理还携带 `parentToolCallId`（该 `task` 调用的 id）和 `itemIndex`（该项在 `tasks[]` 中的位置，扁平形式为 0），因此可以将 `tool_call` 中的决定精确匹配到对应的生成。返回的 `model` 会替换该生成按尝试顺序排列的模式，同时保留角色身份，因此剩余条目成为子代理的重试后备链；处理器按扩展顺序运行，最后返回的 `model` 及其 `note` 生效，task UI 会在实时、异步和已结算行上将该说明显示为生成的路由原因。`block: true` 会以 `reason` 拒绝生成。取消生成会释放等待中的处理器（丢弃其结果并关闭待处理的 `ctx.ui` 对话框），而不是将生成阻塞至处理器超时。

### 可靠性/运行时信号 \{#reliabilityruntime-signals}

- `auto_compaction_start` / `auto_compaction_end`
- `auto_retry_start` / `auto_retry_end`
- `retry_fallback_applied`：自动重试切换模型/提供方时的 `{ from, to, role, reason? }`
- `retry_fallback_succeeded`：请求在该后备项上成功时的 `{ model, role }`
- `ttsr_triggered`
- `todo_reminder`
- `goal_updated`
- `credential_disabled`

### 链接激活 \{#link-activation}

- `link_activate`：用户通过点击或提示标签选中某链接，且该链接的 scheme 已由此扩展通过 [`registerLinkScheme`](#extension-link-schemes) 声明时，携带 `{ url, scheme }`。只投递给该扩展，没有处理器超时。`url` 不可信：模型可以写出此类链接，因此应像用户输入一样验证它。

### MCP 通知 \{#mcp-notifications}

- `mcp_notification`：对从已连接 MCP 服务器收到的每个 JSON-RPC 通知触发，发生在管理器自身处理已知列表/更新方法（`notifications/tools/list_changed`、`notifications/resources/list_changed`、`notifications/resources/updated`、`notifications/prompts/list_changed`）**之后**。未知或服务器自定义的方法也会投递。载荷：`{ server: string; method: string; params: unknown }`。多个扩展可以订阅；某个处理器抛错不会阻止其他处理器触发。任何监听器附加前收到的通知会被缓冲（有界 FIFO，上限 100，丢弃最旧项），并排空给首个订阅者，因此即使扩展在 MCP 发现之后才绑定，启动期间的帧也不会丢失。

将支持推送的 MCP 桥接为会话引导：

```ts
pi.on("mcp_notification", event => {
	if (event.server !== "peer-bus") return;
	if (event.method !== "notifications/peer_message") return;
	const params = event.params as { from: string; text: string };
	pi.sendUserMessage(`[from ${params.from}] ${params.text}`, {
		deliverAs: "steer",
		attribution: "agent",
	});
});
```

运行时先处理 JSON-RPC 传输及自身的列表/更新刷新；处理器随后运行，并可以通过 `pi.sendMessage` / `pi.sendUserMessage` 注入轮次中的引导消息。

### 用户命令拦截 \{#user-command-interception}

- `user_bash`（用 `{ result }` 覆盖）
- `user_python`（用 `{ result }` 覆盖）

### `resources_discover` \{#resources_discover}

`resources_discover` 存在于扩展类型和 `ExtensionRunner` 中。
当前运行时说明：`ExtensionRunner.emitResourcesDiscover(...)` 已实现，但当前代码库中没有调用它的 `AgentSession` 调用点。

## 工具编写细节 \{#tool-authoring-details}

`registerTool` 使用 `types.ts` 中的 `ToolDefinition`。它的 `parameters` 字段接受 omptype 模式；注入的 TypeBox 兼容垫片仍可用于旧版扩展。

优先在工厂函数中注册，但之后发现的工具（例如在
`session_start` 中）也会挂载到当前注册表。在已分派事件处理器内部进行的注册，
会在该处理器完成之前刷新；
`await pi.setActiveTools(...)` 也会等待待处理注册。受限
子代理不允许扩展工具，包括延迟注册的工具。宿主 RPC
和 SDK 自定义工具仍优先于冲突的扩展工具。

当前 `execute` 签名：

```ts
execute(
	toolCallId,
	params,
	signal,
	onUpdate,
	ctx,
): Promise<AgentToolResult>
```

### 在工具调用后添加被动上下文 \{#adding-passive-context-after-a-tool-call}

`tool_call` 处理器可以返回 `additionalContext`，而不更改工具结果：

```ts
pi.on("tool_call", async event => {
	if (event.toolName === "search") {
		return { additionalContext: "Use this result before searching again." };
	}
});
```

`additionalContext` 携带处理器编写的可信指令，供下次提供方请求使用。
所选传输支持时，宿主会在工具结果之后，以开发者/系统优先级
发出它们。重复项（比较时忽略首尾空白）会在两个层级被丢弃：同一调用上某处理器的值
与先前处理器相同，以及某调用拼接的上下文与同一批次中较早
调用的上下文相同。原始工具输出和其他不可信数据必须留在普通工具结果中。

每个非阻止型处理器中不同的非空上下文会按注册顺序保留。OMP 等待
工具批次结算，然后在对应工具结果之后，按
助手工具调用顺序、在下次提供方请求之前发出上下文。只有调用
实际运行并返回非错误结果时，处理器上下文才会投递：如果调用被当前或后续
处理器阻止、在批准提示中被拒绝、因中断跳过或失败，收集的上下文都会
被丢弃。

已注册工具可以在执行期间通过
`ctx.addAdditionalContext?.("...")` 添加上下文。工具自身添加的上下文即使在工具随后
返回错误时也会保留。在同一次调用内，工具自身的上下文（包括在嵌套 `bash` 调用中作为命令运行的工具）先于 `tool_call` 处理器上下文。
Cursor 在其 exec 通道上执行的调用，会在缓冲结果之后，于下次
提供方请求投递上下文。

### 委派给原生内置工具 (`ctx.invokeTool`) \{#delegating-to-a-native-built-in-ctxinvoketool}

重新注册内置名称的工具（例如封装 `write` 以添加日志或策略检查）可以
运行原始工具，而不必重新实现它。当注册的工具遮蔽内置工具时，传给 `execute` 的 `ctx`
会携带：

```ts
ctx.invokeTool?<TDetails>(
  params: Record<string, unknown>,
  options?: { signal?: AbortSignal; onUpdate?: AgentToolUpdateCallback },
): Promise<AgentToolResult<TDetails>>
```

它运行与该工具同名的**原生**内置工具（委派仅限同一工具，因此
无法访问任意目标，也不能超越此次调用已获批准的范围），并
返回其结果，包括原生工具自身的副作用和内部记账。
默认情况下，它继承外层调用的中止信号、进度回调和工具/提供方
元数据；显式 `signal` / `onUpdate` 选项会覆盖相应通道。它
只在存在该名称的原生内置工具时提供：对于
未遮蔽任何内置工具的全新工具，`ctx.invokeTool` 为 `undefined`。原生调用不会再次经过关卡，因为它就是
已经获准使用的同一工具，且委派深度受到防护，以避免意外自递归。

模板：

```ts
const z = pi.zod;

pi.registerTool({
	name: "my_tool",
	label: "My Tool",
	description: "...",
	parameters: z.object({}),
	hidden: false,
	defaultInactive: false,
	deferrable: false,
	async execute(_id, _params, signal, onUpdate, ctx) {
		if (signal?.aborted) {
			return { content: [{ type: "text", text: "Cancelled" }] };
		}
		onUpdate?.({ content: [{ type: "text", text: "Working..." }] });
		return { content: [{ type: "text", text: "Done" }], details: {} };
	},
	onSession(event, ctx) {
		// reason: start|switch|branch|tree|shutdown
	},
	renderCall(args, options, theme) {
		// optional: pi-tui nodes, a { render(width) } rows object, or undefined
	},
	renderResult(result, options, theme, args) {
		// optional: same contract as renderCall
	},
});
```

`renderCall` 的 `options` 参数还响应 `Theme` API，因此从上游 pi 移植的工具渲染器，即声明为 `renderCall(args, theme, context)` 的渲染器，无需重写就能正确应用样式。

`tool_call`/`tool_result` 在 `sdk.ts` 中拦截注册表工具，包括内置工具
和扩展/自定义工具；批准策略拒绝可能在
`tool_call` 之前短路，被阻止/拒绝的调用不会执行，也不会发出正常的执行后结果钩子。

其他 `ToolDefinition` 字段包括：

- `hidden`, `defaultInactive`：除非显式请求，否则不自动激活。
- `loadMode`：新工具名称默认为 `"discoverable"`；已知的必备内置名称在未显式指定模式而重新注册时，保留 `"essential"`（参阅 `tools/essential-tools.ts`）。显式模式优先。
- `deferrable`, `readsSkillUris`, `strict`。
- `approval`：默认为 `"exec"`；接受层级、决策对象或根据参数计算的函数。
- `mcpServerName`, `mcpToolName`, `legacyName`, `sourcePath`：发现、批准和来源元数据。
- `shellEnv`：交互式用户 shell 接口的环境值。
- `renderCall`, `renderResult`：pi-tui 节点或行（参阅[工具调用/结果渲染器](#tool-callresult-renderer)）。

### 文件写入后备处理 (`registerFileWriteFallback`) \{#file-write-fallback-registerfilewritefallback}

`write`、`edit` 和 `apply_patch` 通过一个共享原语
向普通文件路径执行实际的字节写入
(`file ? file.write(content) : Bun.write(dst, content)`)。当该原语因
权限错误失败（`EPERM`/`EACCES`/`EROFS`；其他所有错误，如
`EISDIR`，均不受影响）时，编程智能体会在放弃之前，询问通过
`pi.registerFileWriteFallback` 注册的处理器：

```ts
import type { FileWriteFallbackHandler } from "@oh-my-pi/pi-coding-agent";

const writeThroughBroker: FileWriteFallbackHandler = async (req, ctx) => {
	// req: { dst: string; content: string; cause: unknown; sessionId: string | undefined }
	const ok = await myPrivilegedWriter.write(req.dst, req.content);
	return ok;
};

pi.registerFileWriteFallback(writeThroughBroker);
```

处理程序按注册顺序运行；第一个解析为 `true` 的处理程序表示这些字节已
持久写入磁盘，原生工具随后继续运行，就像它自己的
写入已成功一样，包括以真实
目标路径记录文件快照，从而让之后针对该路径的 hashline `edit` 继续正常工作。
抛出异常的处理程序会被记录并跳过，转而尝试下一个处理程序，此规则针对每个处理程序，
因此同一扩展随后注册的处理程序仍会运行；如果所有处理程序
都返回 `false`（或未注册任何处理程序），则重新抛出原始错误。
当 Bun 将父目录 `mkdir` 被拒绝掩盖为 `ENOENT` 时，如果原始错误没有原因，
则将恢复出的拒绝错误附加为其 `cause`。此机制适用于这样的宿主：
它将智能体嵌入不允许直接写入文件系统的沙箱中，
但提供了特权写入通道。

`req.dst` 是**已解析符号链接**的目标，而不是传给工具的路径。
内核会跟随最后一个组件之前的每个组件，因此在
`ws/link -> /elsewhere` 链接下的 `ws/link/file` 实际落在 `ws` 之外，却仍看似位于工作区内，
而处理程序中的前缀允许列表会放行这条看似无害的路径。对于
写入，最后一个组件也会被跟随，因此也会解析；对于删除则
不会，因为 `unlink` 删除的是链接，而不是它所指向的对象（所以删除请求的
`req.dst` 本身可能是一个链接）。请以 `req.dst` 为准，不要
从其他信息重新推导目标。当无法确定真实目标时，
例如最后一个链接悬空，或此进程无法解析某个祖先目录，系统不会
调用任何处理程序，而是重新抛出原始错误，因为没有
可交给特权写入方的目标。

当目标位于宿主允许的范围之外时，有两个细节值得注意：

- **父目录不存在。** `Bun.write` 会自行创建缺失的父目录，
  当被拒绝的是该 `mkdir` 操作时，它报告的却是后续
  `open()` 的 `ENOENT`，而不是拒绝错误。智能体会显式重做 `mkdir`
  以恢复真实的 errno，因此仍会调用处理程序，
  并将 `req.cause` 设为 `mkdir` 的拒绝错误。此时 `req.dst` 的父目录尚不
  存在，处理程序负责创建它。如果父目录确实可以创建或本身无效，
  相应的 `ENOENT` 不会转交处理程序。（`apply_patch` 在写入前单独创建
  父目录；当已注册回退处理程序时，该 `mkdir` 容忍拒绝错误，
  因此写入仍能到达处理程序。）
- **hashline `MV`。** `edit` 的移动操作会直接写入目标，而不是
  通过 LSP 写穿机制。它会被路由到相同的处理程序，而源文件
  的 unlink 会进入下述删除接入点，因此从不可写目录
  移出文件也能完成。

这有意不是对智能体所有写入操作的拦截。
以下操作发生权限错误时，会照常报错，不会调用处理程序：

- `write` 写入归档成员（`foo.zip:entry`）或 SQLite 行。这两者都不是
  向 `dst` 写入字节：重写归档会读取整个归档、替换一个
  条目、写入临时文件，再通过重命名覆盖原文件，因此实际落盘的是整个
  二进制容器，而不是传给工具的字符串；SQLite 写入则是
  数据库引擎内部的行操作，完全没有字节载荷。要代理
  这两种操作，需要不同于“这些字节应放在此路径”的请求结构。
- ACP 桥接的 `writeTextFile`，它将写入交给远程客户端。
- `lsp` 工具自身的写入：应用工作区编辑或代码操作，以及
  Biome 格式化器，它先写入缓冲区，再通过 shell 调用 `biome format
--write`，这种子进程写入无法通过进程内接入点触及。

### 文件删除回退（`registerFileDeleteFallback`） \{#file-delete-fallback-registerfiledeletefallback}

删除文件与写入文件是不同的原语，因此有自己的接入点：

```ts
pi.registerFileDeleteFallback(async (req, ctx) => {
	// req: { dst; cause; confirmedFile; sessionId } — no `content`.
	return await myPrivilegedWriter.unlink(req.dst);
});
```

它覆盖 `edit` 的 `REM`、hashline `MV` 的源端，以及 `apply_patch` 的
删除操作，并遵循与写入接入点相同的规则：相同的权限错误码、第一个
`true` 生效、跳过抛出异常的处理程序、如果没有成功者则重新抛出原始错误，
未注册处理程序时则完全不介入。有两点区别：

- **`ENOENT` 从不转交处理程序。** unlink 之前的过程不会创建任何东西，
  所以文件不存在就确实是不存在，`REM` 会将其转换为未找到错误。
- **处理程序应执行 unlink，绝不递归删除。** 在 macOS 上，对目录执行 `unlink` 会报告
  `EPERM`，单凭错误码无法将其与沙箱拒绝区分开，
  因此该接入点会对目标执行 `lstat`，如果是目录就拒绝转交。但当
  目标本身的元数据也位于拒绝 unlink 的同一边界之后时，
  这在沙箱中很常见，此检查便无法得出结果，`req.dst` 此时可能是
  一个目录。只有当接入点明确确认目标是普通常规文件时，
  `req.confirmedFile` 才为 `true`；符号链接也返回 `false`，因为对
  链接执行 unlink 没问题，但解析它会作用于完全不同的对象。如果特权辅助程序
  递归删除 `req.dst`，或先对它执行 realpath，就会远远超出
  一个始终只删除单个文件的工具所请求的范围。

**删除注册与写入注册是有意分开的。**
写入处理程序将 `req.content` 代理写入 `req.dst`；如果删除请求到达它，
缺失的内容容易导致它代理一次空写入，从而将本应删除的文件
_截断_。因此，只处理写入的处理程序永远不会收到删除请求。

两个接入点均受以下两项生命周期约束：

- **在扩展加载期间注册**（从默认工厂中注册），与其他
  `register*` 调用一样。处理程序在 `ExtensionRunner.initialize` 运行时安装；
  到那时仍未注册任何内容的扩展会被整个跳过，因此稍后才进行的
  首次注册永远不会生效。处理程序收到的 `ctx` 在每次调用时构建，
  而不是在安装时捕获，因此 `ctx.cwd` 和 `ctx.hasUI` 描述的是
  变更被拒绝时的会话状态；工作区变更（`/move`）会
  体现在下一个请求中，而不是固定为加载时的状态。
- **注册表作用于整个进程。** 一个进程可以托管多个会话（子代理
  有自己的 runner），因此处理程序可能被调用来处理进程内任意会话
  被拒绝的写入或删除，而不只是注册该处理程序的扩展所属的会话。
  这是有意设计的：宿主在顶层会话中注册一次后，仍
  希望子代理的写入受到代理，包括未继承
  扩展工厂的会话。受限子会话保留父会话加载的钩子，但不
  发现环境中的扩展。`req.sessionId` 标识发起
  变更的会话（不是来自工具调用时为 `undefined`），
  `ctx.sessionManager.getSessionId()` 则标识处理程序自己的会话，可比较两者
  以按会话作出决策。这在提示确认之前尤为重要：`ctx.ui` 属于
  处理程序的会话，不一定属于当前被询问的会话。处理程序会
  在 `session_shutdown` 时移除。

未注册任何处理程序时，这一切都不会介入：原语的运行方式与之前
完全相同，不会执行额外的系统调用。

## UI 集成点 \{#ui-integration-points}

`ctx.ui` 实现 `ExtensionUIContext` 接口。支持情况因模式而异。

### 交互模式（`extension-ui-controller.ts`） \{#interactive-mode-extension-ui-controllerts}

支持：

- 对话框：`select`、`confirm`、`input`（遵循 `ExtensionUIDialogOptions.secret`，将键入字符显示为圆点）、`editor`、可选的 `askDialog`
- 输入编辑：`setEditorText`、`getEditorText`、`pasteToEditor`、`editor`；`supportsEditor` 表示粘贴是否更新本地或远程输入框（缺失表示不支持）
- 自动补全堆叠：`addAutocompleteProvider(factory)` 包装内置编辑器提供方（工厂按注册顺序应用，并在每次斜杠命令刷新时重新应用）
- 终端标题和工作消息（`setTitle`、`setWorkingMessage`）
- 通知/状态/编辑器文本/终端输入/自定义叠层
- 按名称列出/加载主题（`setTheme` 支持字符串名称）
- 工具展开开关
- `rerenderMessage(timestamp)`：重新绘制具有该 `message.timestamp` 的助手回复，重新运行[助手文本渲染器](#assistant-text-renderer)；当 `extensionRenderers.assistantText` 关闭时不执行任何操作
- `refreshTranscript(ids)`：再次向[会话记录呈现器](#transcript-presenter)请求具有这些 id 的块，并重绘显示发生变化的块
- `getLinkClicksAvailable()`：当前通过提示标签或点击来选择[已声明链接](#extension-link-schemes)时，是否会触发 `link_activate`

此控制器中目前不执行任何操作的方法：

- `setFooter`
- `setHeader`

`ctx.ui.composer` 包含[输入框钩子](#composer-hooks)：按键处理程序、
装饰、提交转换和形状。它们替代了已移除的
`setEditorComponent`/`getEditorComponent`。
`setWidget` 在编辑器上方或下方显示组件（`placement: "aboveEditor" |
"belowEditor"`）：字符串数组最多显示 10 行内容，外加截断提示；
工厂 `(ui, theme) => …` 返回 pi-tui 节点或行对象。传入 `undefined`
可移除组件；再次设置同一个键会原位替换它。
`custom(factory, options)` 显示工厂的视图并让其获得键盘焦点，直到它
调用 `done`：可以是单个根节点（它会获得焦点，因此应通过其 `onKey` 处理按键），也可以是
行对象（按键和粘贴以原始输入形式到达其 `handleInput`）。
`{ overlay: true }` 将其绘制在会话记录之上，`fullscreen: true` 则绘制在
备用屏幕上；`onHandle` 收到 `{ closed, close(), isFocused() }`
（当键盘焦点位于叠层或其内部节点上时，`isFocused()` 为 true）。工厂的 `ui`
参数提供 `requestRender()`（重绘行对象）、`size()` 和
`suspend(run)`（在等待 `run` 完成期间，将终端交给外部编辑器）。

#### 启动终端命令 \{#launching-terminal-commands}

`ctx.ui.openTerminal(request)` 仅在交互式 TUI 中可用。它创建一个
多路复用器窗格或提供方原生分组（tmux 窗口、Zellij/Herdr/Orca 标签页，或 CMUX
工作区，而非操作系统窗口），并返回报告的原生 ID；如果
提供方启动了命令却无法在请求的位置显示它，还会返回 `warning`。RPC、ACP、
打印和无界面上下文不提供此可选方法。请求类型和
受支持的提供方集合来自规范的启动能力：支持 tmux、Zellij、
Herdr、CMUX 和 Orca；多路复用器分类体系仍识别 screen 和 wmux，
但目前不支持它们。

提供方专属的会话检测集中在 pi-tui 终端驱动中，
即 `@oh-my-pi/pi-tui/driver/mux/detect`（`MultiplexerId` 列出所有被识别的
多路复用器）。`hasMultiplexerSession(provider, env)` 检查显式会话标记，
而 `classifyMultiplexer(env)` 标识托管进程的多路复用器：先看会话
标记，然后回退到 `tmux`/`screen` 的 `TERM`，再看 Orca 等外层应用，
因此在 Orca 内运行的多路复用器优先。只有分类出的
多路复用器拥有屏幕网格时，`insideMultiplexer(env)` 才为 true；Orca 保留直接终端
渲染路径。分类出某个多路复用器，并不能证明存在嵌套的提供方会话或
原生窗格 ID。每个函数都显式接收环境参数（当前进程请传入
`Bun.env`）。

此能力由 TUI 宿主注入；扩展无需导入分派器
代码即可使用。

OMP 内置调用方可以将 `classifyMultiplexer(env)` 传给
`getTerminalLaunchPlacement(...)`，获取支持情况和呈现元数据，也可以将它作为
`createDefaultTerminalLaunchRequest(...)` 的第一个参数，获取已验证的
提供方默认请求。该工厂还接收放置位置、命令 argv、cwd 和
可选的 shell 确认。这两个辅助函数均由
`src/subprocess/terminal-launch.ts` 导出。
放置位置查询返回提供方显示名称、面向用户的分组标签（例如
`pane`、`tab` 或 `workspace`）以及所需的 shell 语法；如果未检测到
多路复用器，或提供方不支持该放置位置，则返回错误。请求
工厂返回 `{ request }` 或 `{ error }`，验证构造出的请求，并
不设置提供方专属的目标、焦点、方向和执行选项，以便
后端应用自身的默认值。对于 shell 输入启动，只有在确认目标 shell 使用 POSIX 语法后，
才传入 `shellGrammar: "posix"`；工厂会拒绝
缺少这一断言的请求。扩展仍可继续使用 `ctx.ui.openTerminal(...)`，
传入显式的带类型请求。

```ts
const result = await ctx.ui.openTerminal?.({
	multiplexer: "tmux",
	placement: "pane",
	command: ["bun", "run", "dev"],
	cwd: ctx.cwd,
	target: process.env.TMUX_PANE!,
	focus: false,
	execution: "direct",
});
```

目标是提供方原生的 ID/引用，其含义随放置位置而异：

- tmux 窗格放置以窗格 ID 为目标，默认使用 `TMUX_PANE`；新窗口
  的目标是会话名称/ID，在当前 TMUX 会话内可以省略。
  未设置 `TMUX` 时，显式窗格或会话目标可用于寻址 CLI。
- Zellij 窗格放置可以指定现有标签页 ID 为目标（Zellij 0.44.1 或更新版本）。
  创建新标签页没有目标选项。两者都要求存在活动的 `ZELLIJ` 会话。
- Herdr 窗格放置以窗格 ID 为目标，默认使用 `HERDR_PANE_ID`；标签页
  放置以工作区 ID 为目标，默认使用 `HERDR_WORKSPACE_ID`。
  目标应位于活动的 Herdr 窗格或工作区中。
- Orca 窗格拆分将 `ORCA_PANE_KEY` 解析为当前终端句柄；
  检测要求同时存在 `ORCA_PANE_KEY` 和 `ORCA_WORKTREE_ID`。创建标签页
  默认使用工作树 `id:<ORCA_WORKTREE_ID>`；仅有应用标签
  不足以检测到 Orca 会话。目标、标题和命令以
  `--flag=value` 形式传递，因此以 `--` 开头的值仍然是数据。
- CMUX 窗格放置以表面 ID 为目标；工作区放置以窗口
  ID 为目标。当对应的 CMUX 上下文处于活动状态时，两种目标都可省略。
  显式表面目标具有决定性，不会与环境中的
  工作区组合。仅有套接字路径和传输标记，不能证明存在活动的
  本地 CMUX 表面。

不支持的目标组合会失败，而不会被忽略。能力检查
使用提供方身份标记或原生目标，而不只依赖 `TERM`。`focus` 控制
只在放置位置支持时应用：tmux 在 false 时使用 `-d`，Zellij 使用
`--no-focus`（Zellij 0.45.0 或更新版本），Herdr 使用 `--focus`/`--no-focus`，CMUX
则在拆分和创建工作区时均传入 `--focus true|false`。Orca 创建标签页时
将 `focus: true` 映射为 `--focus`；否则焦点遵循 Orca 的默认行为。Orca 窗格
拆分没有焦点选项。当 Orca 无法显示新标签页时，它会在后台终端
启动命令，并在结果的 `warning` 中说明。

执行方式因提供方而异。tmux 直接执行多参数命令，但会将
单个参数交由其配置的 `default-shell -c` 运行，该 shell 可能是 fish、Nushell，
或其他非 POSIX shell。对于只有一个参数的直接启动，分派器添加前缀
`/usr/bin/env --`，使含有空格、前导短横线或 shell
元字符的可执行文件仍作为数据处理；如果单参数的可执行文件名包含 `=`，则会被拒绝，
因为 `env` 会将它视为赋值。`execution: "shell"` 对 argv 进行 POSIX 引用，
并使用 `/bin/sh -c` 运行，不受 `default-shell` 影响。tmux 会对其
起始目录执行格式展开，因此分派器将 `cwd` 中的每个 `#` 作为 `##` 传递。Zellij 接受
直接 argv 执行。如果 Zellij 选项所需的 CLI 版本高于已安装版本
（0.44.0 之前的标签页放置、0.44.1 之前的 `target`、0.45.0 之前的 `focus: false`），会在创建任何内容之前失败，
并在错误中说明所需版本；分派器在每个进程中检查一次 `zellij --version`。

Herdr `pane run` 将文本键入目标的交互式 shell，因此
适配器将经过 POSIX 引用的 argv 写入临时目录下一个私有、会自行删除的 `/bin/sh` 脚本，
并只键入其绝对路径。任何能运行裸路径的交互式 shell
（POSIX shell、fish、Nushell）都会启动完全相同的 argv，因此
Herdr 请求不接收 `shellGrammar`。Windows 上会拒绝 Herdr 启动。

CMUX `--command` 和 Orca `terminal split`/`terminal create`
将 shell 命令文本提交给目标的交互式 shell，而不是
直接启动 argv。因此，它们的请求要求 `shellGrammar: "posix"`。
只有确认目标 shell 接受 POSIX 语法后才设置它；系统
不会从本地操作系统或 `$SHELL` 推断，也不会猜测配置的 shell。
没有这一断言时，不要请求 CMUX 或 Orca 启动。
一旦作出断言，argv 中的词就会通过共享的 POSIX shell 引用辅助函数进行引用。
Orca split/create 没有 `--cwd` 标志，因此适配器会在
`--command` 内已引用的命令前加上 `cd <quoted-cwd> &&`；CMUX split 也会
先在其 shell 内切换目录，再输入命令。这些引用并不
保证适用于 Nushell、PowerShell、`cmd.exe` 或其他 shell 语法。
Orca CLI 按 Orca 文档规定的顺序解析：设置了 `ORCA_CLI_COMMAND` 时使用它，
在 Orca 开发检出目录（`ORCA_DEV_REPO_ROOT`）中使用 `orca-dev`，在 Linux 上且
位于 Orca 终端之外时使用 `orca-ide`，其他情况使用 `orca`。

由于这些命令以终端输入方式提交，shell 输入请求会
在创建窗格或工作区前，拒绝命令参数中的 C0/C1 控制字节和 DEL；
CMUX 和 Orca 也会拒绝 `cwd` 中的这些字符，因为它被嵌入
shell 命令。此限制不适用于 tmux 或 Zellij 的直接 argv，
在这些情况下，参数中的换行仍是数据，而不是终端输入。

Herdr、Zellij 和 Orca 的 `window` 放置会创建标签页；CMUX 则创建工作区。
提供方专属字段包括窗格方向、Zellij 浮动窗格/名称、
Herdr 标签页标签，以及 CMUX 工作区名称。Zellij 浮动窗格不能指定
拆分方向，Zellij 创建新标签页时也不能指定目标标签页。tmux 会返回
必需的窗格（`%...`）或窗口（`@...`）ID；Zellij 0.44.0 及更新版本将窗格 ID 报告
为 `terminal_<id>`，将标签页 ID 报告为数字字符串，而较旧的 Zellij 启动窗格时
不报告 ID，因此 `result.id` 不可用；Herdr 要求其
JSON 响应包含窗格/标签页 ID。CMUX 在存在工作区/窗格 ID 时会报告它们，但其 JSON
响应可能省略 ID，此时 `result.id` 不可用。
Orca 在 `result.split.handle` 返回窗格句柄，或在
`result.terminal.handle` 返回标签页句柄；顶层 JSON `id` 是 RPC 请求 ID，而不是
终端句柄。

`cwd` 应为绝对路径。如果请求不是对象，或指定了未知的
多路复用器或放置位置，就会以 `TypeError` 拒绝。其他所有失败，包括
已识别但不支持启动的提供方或放置位置，都会以经过净化处理的
`TerminalLaunchError` 拒绝，其中注明提供方、操作，以及可用时的退出状态；
不包含命令 argv 和 CLI 输出。CMUX 和 Orca 会拒绝格式不正确的 JSON
响应，不会重试创建。

没有共享的环境覆盖机制：每个多路复用器应用自身的
环境传播规则；分派器不会合成统一的变量
继承。直接后端中的请求 argv 保持分离；只有 shell 输入
后端会在所要求的 POSIX 语法断言下，将 argv 转换为 shell 文本。

### RPC 模式（`rpc-mode.ts`） \{#rpc-mode-rpc-modets}

`ctx.ui` 由 RPC `extension_ui_request` 事件支撑：

- 对话框方法（`select`、`confirm`、`input`、`editor`）通过客户端响应完成往返；`input` 将 `ExtensionUIDialogOptions.secret` 作为未经协商的宿主提示（`secret?: boolean`）转发到 `extension_ui_request` 帧上
- 即发即弃方法发出请求（`notify`、`setStatus`、用于字符串数组或移除操作的 `setWidget`，以及以 `method: "set_editor_text"` 形式发送的 `setEditorText`）；`pasteToEditor` 回退为 `setEditorText`
- `setTitle` 只在 `PI_RPC_EMIT_TITLE` 为 `1`、`true`、`yes` 或 `on`（不区分大小写）时发出事件

RPC 实现中不支持或不执行任何操作的功能：

- `onTerminalInput`
- `custom`；不存在可选的 `askDialog`
- `getEditorText` 返回 `""`；不存在 `composer`
- `setFooter`、`setHeader`、`addAutocompleteProvider`
- `setWorkingMessage`
- 主题切换/加载（`setTheme` 返回失败）
- 工具展开控件不起作用

### 打印/无界面/子代理路径 \{#printheadlesssubagent-paths}

未向 runner 初始化提供 UI 上下文时，`ctx.hasUI` 为 `false`，方法不执行任何操作或返回默认值。`--mode rpc --no-ui` 和 `--mode rpc-ui --no-ui` 中的扩展都采用此路径；`rpc-ui` 工具对话框仍保持启用。

### ACP 模式 \{#acp-mode}

ACP 安装一个通过信息征询桥接的 UI 上下文（位于
`modes/acp/acp-agent.ts` 的 `createAcpExtensionUiContext`）。`ctx.mode` 为 `"rpc"`，`ctx.hasUI` 为 `true`。
`select`/`confirm`/`input`/`editor` 和可选的 `askDialog` 以 ACP 表单
信息征询完成往返；当客户端缺少 `elicitation.form` 时返回默认值，当 `dialogOptions.secret` 为 `true` 时，`input` 返回 `undefined`，不会发出表单信息征询。
非信息征询功能（组件、编辑器控制、主题、终端输入、
自动补全堆叠）不起作用；`notify` 记录一条调试通知。

## 会话与状态模式 \{#session-and-state-patterns}

对于持久化扩展状态：

1. 使用 `pi.appendEntry("com.example.my-extension.state", data)` 持久化。`customType` 命名空间是全局的：使用带包名或反向域名限定的值，并避开 [`custom` 会话条目参考](./session.md#custom)中的核心保留值。
2. 在 `session_start`、`session_branch`、`session_tree` 时，从 `ctx.sessionManager.getBranch()` 重建状态。
3. 当状态应可从工具结果历史中查看/重建时，让工具结果的 `details` 保持结构化。

重建模式示例：

```ts
pi.on("session_start", async (_event, ctx) => {
	let latest;
	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === "com.example.my-extension.state") {
			latest = entry.data;
		}
	}
	// restore from latest
});
```

### 会话条目角色（`message.role` 使用 camelCase） \{#session-entry-roles-messagerole-is-camelcase}

遍历 `ctx.sessionManager.getBranch()` 时，每个持久化条目都有一个 `type`
（`message`、`custom_message`、`branch_summary`、`compaction` 等；以
[会话条目模型](./session.md#entry-taxonomy)为参考）。`type: "message"`
条目的 `entry.message` 中携带一个 `AgentMessage`，其 `role` 判别字段使用
**camelCase**，而不是原始 LLM 传输格式或上述
`tool_call` / `tool_result` **钩子**名称所用的 snake_case：

| 持久化的 `entry.message.role` | 含义 |
| --- | --- |
| `user` | 用户/工具反馈轮次。 |
| `developer` | 开发者角色指令轮次。 |
| `assistant` | 模型轮次。工具调用是 `content` 内的 `{ type: "toolCall" }` 块。 |
| `toolResult` | 单个工具的结果，**不是** `tool_result`。包含 `toolCallId` / `toolName`。 |
| `bashExecution` | 独立的 `!`-bash 运行。 |
| `pythonExecution` | 独立的 python 运行。 |
| `hookMessage` | 旧版钩子注入的消息（仅用于迁移；使用 `custom`）。 |
| `fileMention` | 内联的 `@file` 提及内容。 |

重建后的智能体上下文中的三个角色，来自面向扩展的分支历史中的
专用源条目；`getBranch()` 暴露的是这些源条目：

| 持久化的 `entry.type` | 重建后的 `message.role` | 含义 |
| --- | --- | --- |
| `branch_summary` | `branchSummary` | 已放弃分支的摘要。 |
| `compaction` | `compactionSummary` | 上下文压缩摘要轮次。 |
| `custom_message` | `custom` | 通过 `pi.sendMessage` 发送的消息 |

`toolCall` 是**内容块类型**，而不是角色：工具调用是
`assistant` 消息的 `content` 数组中的一个块，与之配对的结果则是单独的
`role: "toolResult"` 条目。请**原样**匹配这些值；如果过滤器将其与
snake_case 常量比较，或先将 `role` 转为小写（`"toolResult"` → `"toolresult"`），就不会匹配
任何分支，并会**静默丢弃**该条目，不报错也不记录日志，因此按
`role` 捕获会话时会丢失所有工具结果，而用户/助手文本仍能正常通过。

```ts
for (const entry of ctx.sessionManager.getBranch()) {
	switch (entry.type) {
		case "custom_message":
			// pi.sendMessage payload: entry.customType, entry.content
			break;
		case "branch_summary":
			// reconstructed as role: "branchSummary"
			break;
		case "compaction":
			// reconstructed as role: "compactionSummary"
			break;
		case "message":
			switch (entry.message.role) {
				case "assistant":
					// tool calls: entry.message.content.filter(b => b.type === "toolCall")
					break;
				case "toolResult":
					// entry.message.toolCallId, entry.message.content
					break;
			}
			break;
	}
}
```

## 渲染扩展点 \{#rendering-extension-points}

扩展使用 `@oh-my-pi/pi-tui` 绘制，这与 omp 自身屏幕使用的是同一个 UI 库。每个渲染器和自定义视图都返回一个**扩展渲染结果**：

- **pi-tui 节点**：JSX（以 `/** @jsxImportSource @oh-my-pi/pi-tui */` 开头的 `.tsx` 文件）、节点对象、字符串、数组或访问器。小写标签是 TSP 节点种类（`col`、`row`、`text`、`md`、`code`、`card`、`spinner` 等）；Tern 终端以原生方式绘制它们，并由终端绘出。信号（`signal`、`computed`）使其动态更新：节点读取过的信号发生变化时，节点会重绘。
- **行对象** `{ render(width): string[] }`，作为行渲染器的备用出口：绘制为 `canvas` 节点（在 Tern 中是 `rows` 节点）。宽于 `width` 的行会被裁切。宿主重绘它时，它会重绘（在接收 `ui` 的工厂中使用 `ui.requestRender()`，在 `ctx.ui.custom` 中则是在每次处理输入之后）。可选的 `isTranscriptBlockCompact()`、`handleInput(data)` 和 `dispose()` 保留其 pi-tui 含义。
- **`undefined`** 不绘制任何内容（或在宿主提供默认内容的地方绘制默认内容）。

渲染器如果抛出异常或返回其他内容，会被报告且不绘制任何内容；行在绘制时抛出异常，则绘制一行错误信息。

渲染器接收扩展主题：pi-tui 的 `Theme`（`fg`、`bg`、`style(tokens, text)`、`symbols` 等），外加 `bold`、`italic`、`underline`、`strikethrough` 和 `inverse`。

## 输入框形状渲染器 \{#composer-shape-renderer}

`registerComposerShape` 向**外观 → 输入框形状**添加由扩展拥有的输入框形状，也就是围绕输入框文本行绘制的边饰。请从扩展工厂注册它。

```ts
import type { ComposerShape, ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

const dock: ComposerShape & { label: string } = {
	id: "acme-dock",
	label: "Acme Dock",
	description: "Prompt below a single rule",
	bottomBar: "full",
	bottomBarGap: true,
	sideBorders: false,
	gutter: "❯ ",
	paddingX: 0,
	sideWidth: () => 0,
	top: cx => cx.border(cx.box.horizontal.repeat(cx.width)),
	row: cx => [cx.gutter + cx.text + cx.pad],
};

export default function (pi: ExtensionAPI) {
	pi.registerComposerShape(dock);
}
```

`ComposerShape` 包含：

- `id`：持久化的 `composer.shape` 值。使用带包名限定、非空且去除首尾空白的 id。不能替换内置 id（`box`、`band`、`claude`、`pi`、`borderless`、`rule`、`field` 和 `rail`）。扩展之间发生冲突时，后注册的生效。如果扩展不可用，但其 id 仍保留在配置中，输入框会以 `box` 绘制。
- `label`（此处必填）和 `description`：形状选择器的文案。
- `statusAttachment`：顶部边饰承载状态行的位置：`"top-border"`、`"top-band"`（提示上方的一条带状行）或 `"top-rule-chip"`（停靠在顶部横线上的标签）；缺失则不显示。
- `bottomBar`：输入框下方的状态栏：`"full"`、`"left"` 或 `"none"`（默认值）；`bottomBarGap`：在它前面留一个空白行。
- `filled`：用输入框表面填充行。
- `sideBorders`：内容行带有含内边距的侧边边饰，因此行尾光标可能占用一个内边距单元格。
- `gutter`：第一行前的提示栏（其他行前为空白）。
- `paddingX`：侧边边饰内的默认内边距；`sideWidth(paddingX)`：边饰在内容行两侧各占用的单元格数。
- `top(cx)` 和 `bottom(cx)`：一行边饰或 `undefined`；`row(cx)`：第一行承载文本时返回数组；在文本上方添加边饰时，返回 `{ rows, textRow }`，通过从零开始的索引指明文本行。例如，返回 `{ rows: [blankRow, inputRow], textRow: 1 }` 可在输入上方放置一行空白，而不会让光标离开文本。

每个边饰上下文都有 `width`、`paddingX`、`theme`、圆角 `box` 字形、`border(text)`（按状态着色的边框）、`accent(text)`、`surface(text)`（输入框表面，跨行自身的样式重置仍保留），以及在输入框显示状态时，带有自身 `width` 的预设样式 `status` 内容。行上下文额外包含带样式的 `text`（含光标）、填充至内容宽度的 `pad` 空白、本行的 `gutter`、`first`、`last` 和 `overflow`（行尾光标从右侧边饰占用的单元格）。每行应恰好占用 `width` 个可见单元格。

以 `packages/coding-agent/src/ui/styles/composer/shapes.ts` 中的内置形状为参考。

## 输入框钩子 \{#composer-hooks}

`ctx.ui.composer`（在交互式 UI 之外不存在）接入内置输入框：

```ts
pi.on("session_start", (_event, ctx) => {
	const composer = ctx.ui.composer;
	if (!composer) return;
	// Keys reach handlers before the composer's own bindings; true takes the key.
	composer.addKeyHandler(key => {
		if (key.id !== "ctrl+u") return false;
		ctx.ui.setEditorText("");
		return true;
	});
	// Style ranges of the draft (span style tokens), re-run on every edit.
	composer.addDecorator(text =>
		[...text.matchAll(/#\w+/g)].map(match => ({ from: match.index, to: match.index + match[0].length, s: "accent" })),
	);
	// Rewrite what is sent; undefined cancels the submission and keeps the draft.
	composer.setSubmitTransform(text => text.trim() || undefined);
	// Draw with a registered shape; undefined restores the user's choice.
	composer.setShape("acme-dock");
});
```

`addKeyHandler` 和 `addDecorator` 返回各自的移除函数。提交转换有一个：设置它会替换前一个，`undefined` 会移除它。

## 自定义消息渲染器 \{#custom-message-renderer}

```tsx
pi.registerMessageRenderer("my-type", (message, { expanded }, theme) => (
	<md text={expanded ? String(message.content) : "Collapsed note"} />
));
```

交互式渲染显示自定义消息时使用。每当消息展开状态变化时，都会再次调用渲染器；返回 `undefined` 或抛出异常会保留默认卡片。

### 紧凑行 \{#compact-rows}

行对象可以实现 `isTranscriptBlockCompact(): boolean`。当它返回 `true` 时，消息会与相邻的紧凑块紧密排列。终端不会在它们之间绘制空白行，Tern 则将连续的一组显示为一个无间隔的块。两个紧凑块之间的空块或隐藏块不会打断这一组。

```ts
pi.registerMessageRenderer("status", message => ({
	render: width => [String(message.content).slice(0, width)],
	isTranscriptBlockCompact: () => true,
}));
```

会话记录在绘制块时读取返回结果，并在每次重绘时再次读取（展开状态变化、重新渲染）。在普通终端中，滚屏历史中的行永远不会变化。如果一条紧凑消息已滚出可视区域，而其后的块不再紧凑，空白行会出现在实时区域中该块的上方。已在滚屏历史中的空白行会保留，即使其周围的块之后变为紧凑排列。

## 助手思考渲染器 \{#assistant-thinking-renderer}

```tsx
pi.registerAssistantThinkingRenderer(context => (
	<text spans={[{ t: `thinking chars: ${context.text.length}`, s: "dim" }]} />
));
```

交互式渲染使用它在每个可见助手思考块下方添加仅用于显示的补充 UI。渲染器接收已可见的思考文本、内容/思考索引、主题，以及供异步渲染器使用的 `requestRender()` 回调。所有已注册且返回了内容的渲染器都会按注册顺序附加。渲染器不得修改消息；原始思考块仍是提供方/会话的事实来源。

## 助手文本渲染器 \{#assistant-text-renderer}

需主动启用：渲染器只在 `extensionRenderers.assistantText` 设置开启时运行（默认关闭；**工具 → 扩展 → 扩展回复渲染器**）。关闭时永远不会调用它们，回复的绘制方式与没有这些渲染器时完全相同。

```ts
pi.registerAssistantTextRenderer(({ message, contentIndex, text, streaming }) => {
	// Return the markdown to draw for this text block, or undefined to draw `text` unchanged.
	return streaming ? text.replace(/\{\{[^}]*$/, "") : text;
});
```

对主会话记录中每个助手文本块执行仅影响显示的转换，供终端渲染器和原生（TSP）视图共同使用。会话、`/export` 和模型上下文保留原本写入的文本；原生复制操作也会复制原本写入的文本。

- **上下文。** `message` 是正在绘制的消息，`message.timestamp` 标识该回复。它是深拷贝：无论在多深的层级编辑它，都不能改变已存储的回复。`contentIndex` 是块在完整回复的 `content` 中的索引，即使回复围绕工具调用分段绘制时也是如此。对于工具调用之后的文本，`message` 只包含那一段，因此 `message.content[contentIndex]` 并不是该块。`contentIndex` 按回复当前存储和回放的内容计数：当会话记录重建时（例如恢复会话时），如果回复含有从未获得结果的工具调用，这些调用及任何已脱敏的思考都会被丢弃，后续块的索引会随之减小，因此同一个块可能获得更小的索引。只在实时会话中用 `message.timestamp` 和 `contentIndex` 作为渲染器状态的键；不要将这一对值持久化为永久键。`text` 是该块截至目前的 markdown，已经过此前渲染器处理；渲染器按注册顺序运行。
- **流式处理。** 每次绘制流式更新时，都会使用截至目前的完整文本调用渲染器（`streaming: true`）；文本最终确定时（`streaming: false`）还会再调用一次：这可能发生在回复结束时，也可能更早发生在其后开始工具调用或任何其他块时。在同一帧内到达的增量会合并为一次绘制和渲染。如果某个块的文本和 `streaming` 值自上次渲染后未变，就会复用此前输出，不再调用渲染器（例如，块在工具调用处已封口，而调用参数仍在流式传输）。渲染器活动时，回复流式显示不会采用 `display.smoothStreaming` 的逐字揭示效果，因此渲染器永远不会看到只揭示了一部分的前缀。输出可以比输入短，也可以修改此前已绘制的文本，因此使用渲染器的回复会留在实时视口中直到其轮次结束，而不会在流式处理途中将已完成的行移入终端滚屏历史。
- **失败。** 如果传入的不是函数，`registerAssistantTextRenderer` 会抛出异常，导致扩展加载失败。渲染器抛出异常时，继续绘制其输入；每个渲染器的失败只记录一次。
- **重绘。** 渲染器读取的状态变化后（例如点击），调用 `ctx.ui.rerenderMessage(message.timestamp)` 可原位重绘该回复；即使块的文本未变，也会再次调用渲染器。仍在实时视口中的回复只需重绘；在普通终端中，如果回复已有行进入滚屏历史，就会重建滚屏历史（与切换思考可见性一样），代价较高，因此应避免对这样的回复逐帧制作动画。
- **链接。** 渲染器绘制的链接与模型编写的任何链接行为相同。要接收其点击事件，请为它们使用扩展[声明](#extension-link-schemes)的协议方案。渲染器添加的相对链接目标，不会像模型自己的链接那样相对于会话工作目录解析，因此 Tern 原生视图会相对于自身目录打开它们；请使用绝对路径或 URL。

## 会话记录呈现器 \{#transcript-presenter}

需主动启用：只有在 `extensionRenderers.transcriptPresenters` 设置开启时，才会询问呈现器（默认关闭；**工具 → 扩展 → 扩展会话记录呈现器**）。关闭时，永远不会调用它们，各块按没有呈现器的方式绘制；开启或关闭该设置都会重绘会话记录。

```ts
// Tool calls of runs that have ended: answers depend only on the block and this set.
const finished = new Set<string>();
pi.on("agent_end", (event, ctx) => {
	const ids: string[] = [];
	for (const message of event.messages) {
		if (message.role !== "assistant") continue;
		for (const part of message.content) if (part.type === "toolCall") ids.push(part.id);
	}
	for (const id of ids) finished.add(id);
	ctx.ui.refreshTranscript(ids);
});
pi.registerTranscriptPresenter(block => {
	if (block.type !== "toolCall") return undefined;
	if (block.toolName === "edit" || block.toolName === "write") return "compact";
	return finished.has(block.id) ? "hidden" : "compact";
});
```

选择主会话记录的每个块如何在普通终端和 Tern 原生视图中绘制。这只影响显示：会话、`/export` 和模型上下文保持不变。它在开启设置的交互模式中生效；在其他环境中，呈现器会注册，但永远不会被询问。

- **块。** 呈现器接收一个只读的 `TranscriptBlock`。后续版本会添加块类型：对于不认识的 `type`，请返回 `undefined`。
  - `{ type: "toolCall", id, toolName, args, result?, isError, isPartial }` 表示模型工具调用，`id` 是其 `toolCallId`；分组读取卡片中的各次读取会逐个询问。
  - `{ type: "message", id, message }` 表示作为独立块绘制的会话消息：包括 `customType` 为 `advisor`、`skill-prompt`、`lsp-late-diagnostic`、`async-result`（后台作业完成）、`async-notify`（正在运行的后台作业或服务报告的输出）和 `launch-completion`（受监督进程退出）的 `custom` 消息，以及用户 `!`/`$` 运行（`bashExecution`、`pythonExecution`）。`id` 是 `String(message.timestamp)`，实时会话与恢复后相同；在同一毫秒内记录的消息共享该值，就像它们共享 `rerenderMessage` 的时间戳一样。仍在进行的 `!`/`$` 运行有临时消息和 id；会话记录该运行后，会再次使用已记录的消息询问。
  - `{ type: "event", id, event }` 表示 TTSR 规则命中（`ttsr_triggered`）或未完成待办提醒（`todo_reminder`），结构与同类型扩展事件相同。它们只存在于触发它们的会话中；`id` 在进程内唯一。

  `args`、`result`、`message` 和 `event` 不是副本：它们是 omp 绘制块时使用的实时对象，往往就是会话自身的消息数据，因此绝不要修改它们。
- **应答。** `undefined` 交由下一个呈现器处理。`"full"` 使用 omp 自身的绘制方式。`"hidden"` 不绘制任何内容，与 `display.toolActivity: hidden` 一样。`"compact"` 是一行 omp 自身的摘要。如果没有呈现器应答某个工具调用，就按 `display.toolActivity` 的设置绘制：在 `concise` 下，显示一行活动信息（时间、状态、工具、意图）。`{ compact: { label, rows } }` 将该行的文本替换为 `label`，并在其下为 `rows` 的每个条目添加一行；两者都接受 `TspText`（字符串或主题令牌跨度）。呈现器同步应答，在会话记录绘制期间运行，因此应保持开销低：任何其他值（拼错的模式、`async` 呈现器的 Promise）都会让块完整绘制，并像抛出异常一样报告。
- **优先级。** 按扩展加载顺序询问呈现器，第一个不是 `undefined` 的应答生效。已暂停扩展的呈现器会被跳过。抛出异常的呈现器对该块的应答视为 `"full"`：块会完整绘制，不再询问后续呈现器。它的首次失败（抛出异常或未知应答）会通过扩展错误通道报告一次（事件 `transcript_presenter`）。用户通过 `Ctrl+O` 或 Tern 中块自身的开关展开的块，始终完整绘制，且 `display.hideToolActivity` 仍会隐藏工具活动。
- **Tern。** 紧凑工具调用将其 `tool` 节点保留为一行内联折叠行；使用 `rows` 时，主体是包含这些行的一个文本节点，所有行均显示。其他块变为一行内联行，完整绘制内容折叠在其下。该行的开关可打开完整块。
- **间距。** 连续的紧凑块绘制为紧密排列的行，终端中间无空白行，Tern 中间无间隙；它们之间不绘制内容的块（隐藏块、只含工具调用的回复）不会打断这一组。完整绘制的块在两侧保留空白行或间隙。扩展消息渲染器也可以加入这一组（见[紧凑行](#compact-rows)）。
- **omp 何时询问。** 每当块的数据变化时（参数流式传输、结果到达）。当呈现器自身状态变化时，调用 `ctx.ui.refreshTranscript(ids)`，如上面的 `agent_end` 处理程序所示。注册呈现器、释放它（`registerTranscriptPresenter` 返回释放函数），以及暂停或恢复其扩展，都会重绘所有块。
- **同一块，同一应答。** omp 可能随时再次询问，例如设置变化导致会话记录重建时，而且不会保留先前应答。应答应仅由块和扩展自身状态决定，并如上所述，以块 `id` 为键存储该状态：如果每次运行时重置状态（在 `agent_start` 时），那么重建再次询问后，先前运行的块就会使用新运行的应答重绘。
- **滚屏历史。** 在普通终端中，已稳定的块会留在实时视口中，直到屏幕填满（或实时块超过 256 个，包括隐藏块），因此能容纳在屏幕中的轮次，在其块变化时只需重绘。如果变化的块已有行进入终端滚屏历史，omp 会针对整批变更清除并回放一次滚屏历史（与切换思考可见性一样）。会改变这些块的迟到结果（例如呈现器依据 `isPartial` 应答，而后台作业正在完成）在每帧共享一次回放，但每次回放仍会重绘整个会话记录，因此其开销随会话增长。Tern 永远不会回放。避免频繁改变旧块。
- **仅限主会话记录。** 获得焦点的子代理会话记录、协作访客查看宿主会话的视图，以及回放会话记录的叠层（链接浏览器、回退和 `/copy` 选择器、智能体会话记录查看器）都绘制标准卡片，就像未注册呈现器一样。
- **迟到诊断。** 在 Tern 中，迟到的 LSP 诊断会加入所属的编辑/写入卡片，并与其一同绘制；当呈现器将该卡片绘制为紧凑或隐藏时，它们会作为独立块显示在其后。没有卡片接收的迟到诊断（在普通终端中是全部诊断）会成为 `lsp-late-diagnostic` 消息块，像其他块一样被询问。

## 扩展链接协议方案 \{#extension-link-schemes}

与[助手文本渲染器](#assistant-text-renderer)使用同一个设置来主动启用（`extensionRenderers.assistantText`，默认关闭）。关闭时，已声明的协议方案会被忽略，链接的绘制方式与之前完全相同。

```ts
pi.registerLinkScheme("cc-stretch");
pi.on("link_activate", ({ url }) => {
	// url is the link as drawn, e.g. "cc-stretch:open/1792/0/2"; validate it before acting on it
});
```

- **绘制。** 在普通终端中，助手回复或其他任何绘制 markdown 的地方，使用已声明协议方案的 markdown 链接只显示标签，并带点状下划线（不支持样式化下划线的终端中使用普通下划线），以区别于网页链接：没有 ` (url)` 后缀，也没有可供终端或浏览器打开的超链接。
- **键盘。** 在普通终端中，`app.links.hint`（默认为 `Alt+O`，见[按键绑定](./keybindings.md)）会为屏幕上的每个已声明链接添加一个或两个字母的标签，绘制在链接标签的开头之上；跨行换行的链接标签只获得一个提示标签。提示标签优先使用它覆盖的字母：链接标签的首字母，否则使用其下一个未占用字母，再否则使用下一个未占用的键盘基准行字母；没有可用的单字母时就使用两个字母，因此任何提示标签都不会成为另一个的开头。键入完整提示标签会为声明该协议方案的扩展触发 `link_activate`。`Esc` 或任何非小写字母按键都会取消并被吞掉，但 `Ctrl+C` 和粘贴除外，它们会取消模式并保留通常的作用。提示模式在提示编辑器拥有焦点时生效，并在叠层或对话框获取焦点时结束；重绘使带标签的链接标签移动或消失时（例如流式回复）也会结束，因此提示标签永远不会选中已不在其下的链接。当一行上的链接过多，提示标签无法并排容纳时，按键会显示状态，而不是提示标签。屏幕上方的链接在[链接浏览器](#link-browser)中选择。
- **点击。** 启用 `tui.mouse` 时，在普通终端中左键点击链接标签，与键入其提示标签效果相同，而不是执行其他点击操作。无论使用哪种方式，当子代理的会话记录获得焦点时，事件都会发给该子代理的扩展副本（其渲染器绘制了该记录），处理程序的 `ctx.ui` 是交互式 UI，因此应从处理程序自己的上下文调用 `ctx.ui.rerenderMessage`。已在终端滚屏历史中的链接标签不能原位点击或添加提示标签；请在[链接浏览器](#link-browser)中选择。
- **不可信输入。** `url` 来自绘制链接的任意内容，而不只是你的渲染器：模型或它重复的工具输出可以写出 `[Continue](cc-stretch:delete/all)`，由于 URL 被隐藏，用户只看到 `Continue`。验证 `url` 并将它视为用户输入：严格解析、拒绝未知操作，并在进行任何破坏性操作前确认。
- **处理程序。** `link_activate` 处理程序像命令一样运行，不受事件处理程序超时限制，因此可以等待对话框（`ctx.ui.confirm`、`ctx.ui.select` 等）。处理程序抛出的异常会作为扩展错误报告。
- **回退。** 只有能选择已声明链接时，`ctx.ui.getLinkClicksAvailable()` 才为 true：交互模式、普通终端、`extensionRenderers.assistantText` 开启，且提示按键已绑定或 `tui.mouse` 开启。子代理的扩展副本得到相同答案，因为其链接在同一屏幕上被选择。更改此设置、在提示按键未绑定时更改 `tui.mouse`、打开或关闭 Tern 原生视图，或暂停或恢复扩展（实时编辑 `disabledExtensions`），都会重新运行助手文本渲染器，因此渲染器可以在每次调用时检查该值，将内容内联绘制，而不是放在无人能选择的链接后面。
- **所有权。** 协议方案名称不区分大小写，且至少为两个字符，因此不会捕获 `C:/notes.md` 这样的 Windows 驱动器路径。当两个扩展声明同一协议方案时，先加载的接收其点击事件；暂停的扩展会释放其协议方案，直到恢复。网页、文件和邮件协议方案（`http`、`https`、`file`、`mailto` 等）以及 omp 内部 URL 协议方案（`local`、`skill`、`agent` 等）为保留方案：声明它们会抛出异常并使扩展加载失败。只有 omp 自身绘制的链接才可被选择：工具输出中使用已声明协议方案的原始终端超链接仍是普通超链接。
- **注册。** 在扩展工厂中声明协议方案。稍后声明的协议方案（从 `session_start` 或其他处理程序中）会被忽略，直到 `extensionRenderers.assistantText` 变化，或某个扩展被暂停或恢复。
- **Tern。** Tern 原生视图将此类链接绘制为自身的链接，不会将其点击事件路由回 omp；请在那里使用 Tern 插件处理。

### 链接浏览器 \{#link-browser}

链接浏览器以全屏方式回放当前查看的会话记录（也包括获得焦点的子代理记录），因此已滚入终端滚屏历史的已声明链接也可以选择。

- **打开。** 显示提示标签时，再按一次提示按键或 `Page Up`；也可以在屏幕上没有已声明链接时按提示按键。如果会话记录中也没有绘制已声明链接，则改为显示状态。浏览器在会话记录底部打开；仍在流式传输的回复会显示截至当时已到达的内容。
- **选择。** 视图中的链接像提示模式一样带有提示标签。只要链接仍在视图中，就会保留其提示标签，即使其上方的回复重绘时也是如此；只有滚入视图的链接才会获得新标签。当新链接发现所有单字母都已被占用时，视图中的所有链接都会重新分配双字母标签。键入标签或点击链接标签（即使 `tui.mouse` 关闭，全屏视图也会接收点击），即可触发 `link_activate`。
- **按键。** 方向键、`Page Up`/`Page Down`、`Home`/`End` 和滚轮用于滚动，`Esc` 关闭。其他按键不起作用。
- **重绘。** 选择后浏览器保持打开，`ctx.ui.rerenderMessage` 会原位重绘其中的回复副本，其上方的行保持不动。浏览器关闭时，主会话记录的滚屏历史会重建一次。
- **反馈。** 浏览器覆盖状态行，因此处理程序的 `ctx.ui.notify` 或状态文本要在它关闭后才能看到。请在重绘的回复中显示反馈，或在带有 `overlay: true` 的 `ctx.ui.custom` 中显示，它会绘制在浏览器之上，并让浏览器保持打开。
- **长会话。** 与 `/copy` 一样，浏览器先回放会话记录的近期部分，滚动到其顶部后再回放其余内容，同时保持视图中各行的位置；`Home` 会继续前往最顶端。
- **关闭。** 扩展对话框（`ctx.ui.confirm`、`select`、`input`、`editor` 或 `custom`，或一次询问）会在显示前关闭浏览器，因此 `link_activate` 处理程序可以提问。关闭 `extensionRenderers.assistantText`，或暂停或恢复扩展，也会关闭它，因为其中的副本是用旧渲染器和链接绘制的。

## 工具调用/结果渲染器 \{#tool-callresult-renderer}

在 `registerTool` 定义中提供 `renderCall` / `renderResult`，以绘制工具的调用和结果。两者都返回扩展渲染结果，绘制在自定义工具框内（先调用，后结果）：

```tsx
pi.registerTool({
	// …
	renderCall: (args, options, theme) => <text spans={[{ t: "search ", s: "toolTitle strong" }, { t: args.query }]} />,
	renderResult: (result, { expanded }) => ({
		render: width => (expanded ? result.content.map(part => ("text" in part ? part.text : "")) : ["done"]),
	}),
});
```

节点由终端和 Tern 绘制。行对象只由终端绘制；Tern 对它们保留通用工具卡片。钩子返回 `undefined` 时，其阶段不绘制任何内容；钩子抛出异常时会被报告，如果没有其他内容被绘制，就显示通用卡片。使用 `mergeCallAndResult` 时，一旦有结果，就只由结果钩子绘制。

## 从 pi-tui 迁移 \{#migrating-from-pi-tui}

`@oh-my-pi/pi-tui` 已被 `@oh-my-pi/pi-tui` 替代。这是破坏性变更：导入 `@oh-my-pi/pi-tui`（或上游 `@mariozechner/pi-tui` / `@earendil-works/pi-tui`）的扩展、钩子或自定义工具会加载失败，错误会指出该导入和本节。迁移方式：

| pi-tui | 现在 |
| --- | --- |
| `Text`、`Container`、`Box`、`Spacer`、`Markdown` 组件 | JSX 节点：`<text spans={…} />`、`<col>`、`<row>`、`<md text={…} />`，或 `{ render(width) }` 行对象 |
| `Component` 类（`render(width)`、`handleInput(data)`、`invalidate()`） | 将其保留为行对象：移除 `implements Component` 和导入 |
| `tui.requestRender()` | 行对象使用 `ui.requestRender()`；节点根据信号重绘 |
| `tui.terminal.columns` / `rows` | `ui.size()` |
| 在外部程序前后调用 `tui.stop()` … `tui.start()` | `await ui.suspend(() => run())` |
| `ctx.ui.custom(…, { overlayOptions })` | `{ overlay: true, fullscreen? }`；定位选项已移除 |
| `OverlayHandle`（`hide`、`setHidden`） | `{ closed, close() }` |
| `ctx.ui.setEditorComponent(factory)` / `CustomEditor` 子类 | `ctx.ui.composer` 钩子：`addKeyHandler`、`addDecorator`、`setSubmitTransform`、`setShape` |
| `registerComposerShape({ label, style: ComposerStyle })` | `registerComposerShape(shape: ComposerShape)` |
| `describeCall` / `describeResult`（`NativeToolView`） | 从 `renderCall` / `renderResult` 返回节点 |
| `matchesKey(data, "ctrl+c")`、`Key.shift("p")` | 按键 id：在 `onKey` 中使用 `key.id === "ctrl+c"`，快捷键使用 `"shift+p"` |
| `truncateToWidth`、`visibleWidth`、`wrapTextWithAnsi` | 来自 `@oh-my-pi/pi-tui/text/width` 的 `truncate`、`visibleWidth`、`wrap` |
| 来自 `@oh-my-pi/pi-tui/theme` 的 `theme` | `theme` 参数、`ctx.ui.theme`，或来自 `@oh-my-pi/pi-tui/theme/runtime` 的 `currentTheme()` |
| `styledSpans`、`compactText`、`rowsText`、`formTheme`、`getSettingsListTheme` 以及包根目录重新导出的 pi-tui 组件 | 跨度使用 `ansiSpans`；其余使用节点绘制 |

## 约束与陷阱 \{#constraints-and-pitfalls}

- 扩展加载期间无法使用会话操作；注册方法、`getFlag` 和 `exec` 可用。
- `tool_call` 错误和超时会阻止执行（失败时关闭）。其时间预算为 `extensionHandlers.toolCallTimeoutMs`（默认 30,000 ms），在等待扩展 UI 期间暂停计时。
- 大多数分派处理程序有 30 秒的时间预算；`session_shutdown` 处理程序并发运行，预算为 2 秒。超时会停止等待并取消处理程序 UI，但无法撤销任意扩展副作用。
- 与内置命令名称冲突的命令会被跳过，并给出诊断信息。
- 保留快捷键会被忽略（`ctrl+c`、`ctrl+d`、`ctrl+z`、`ctrl+k`、`ctrl+p`、`ctrl+l`、`ctrl+o`、`ctrl+t`、`ctrl+g`、`ctrl+q`、`alt+m`、`shift+tab`、`shift+ctrl+p`、`alt+enter`、`escape`、`enter`）；`getShortcutConflict` 将它们报告为 `reserved`。
- 将 `ctx.reload()` 视为当前命令处理程序调用帧的终点。
- 模块全局变量由父/子绑定共享。将会话专属状态保存在工厂闭包或持久化会话条目中。

## 扩展、钩子与自定义工具的比较 \{#extensions-vs-hooks-vs-custom-tools}

使用合适的扩展面：

- **扩展**（`src/extensibility/extensions/*`）：统一系统（事件 + 工具 + 命令 + 渲染器 + 提供方注册）。
- **钩子**（`src/extensibility/hooks/*`）：旧版 `HookAPI` 事件 API。钩子文件通过扩展 runner 加载，因此按扩展语义运行（见[钩子](./hooks.md)）。
- **自定义工具**（`src/extensibility/custom-tools/*`）：以工具为中心的模块；与扩展一起加载时会经过适配，仍会通过扩展拦截包装器。

如果需要一个包共同拥有策略、工具、命令用户体验和渲染，请使用扩展。
