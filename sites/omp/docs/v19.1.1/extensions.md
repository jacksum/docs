---
title: "扩展"
description: "Oh My Pi v19.1.1 仓库文档：扩展。"
---

# 扩展 \{#extensions}

在 `packages/coding-agent` 中编写运行时扩展的主要指南。

本文介绍由以下文件实现的当前扩展运行时：

- `src/extensibility/extensions/types.ts`
- `src/extensibility/extensions/runner.ts`
- `src/extensibility/extensions/wrapper.ts`
- `src/extensibility/extensions/index.ts`
- `src/modes/controllers/extension-ui-controller.ts`

有关发现路径和文件系统加载规则，参见 [`extension-loading.md`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/extension-loading.md)。

有关打包后面向用户的扩展 CLI 和功能，参见 [`user-facing-packages.md`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/user-facing-packages.md)。

## 扩展的定义 \{#what-an-extension-is}

扩展是导出默认工厂函数的 TS/JS 模块。工厂函数可以同步初始化，也可以返回 Promise：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
	// register handlers/tools/commands/renderers
}
```

一个扩展模块可以同时包含以下功能：

- 事件处理程序（`pi.on(...)`）
- 大语言模型可调用的工具（`pi.registerTool(...)`）
- 斜杠命令（`pi.registerCommand(...)`）
- 键盘快捷键和选项标志
- 自定义消息渲染
- 会话或消息注入 API（`sendMessage`、`sendUserMessage`、`appendEntry`）

从包根入口 `@oh-my-pi/pi-coding-agent` 导入宿主提供的值。`@oh-my-pi/pi-tui/native/spans` 等更深层的路径也能在 omp 可执行文件中解析，但它们指向内部文件。文件一旦移动，静态导入该文件就会导致整个扩展无法加载。除扩展类型和主题（`theme`、`getSettingsListTheme`）外，根入口还导出以下辅助项：

- 用于设置对话框和按键提示的 `formTheme`、`editorKey`、`editorKeys` 和 `formatKeyHint`
- `styledSpans` 和 `compactText` 将带 ANSI 样式的文本转换为 `TspText`，例如会话记录呈现器的 `{ compact: { label, rows } }`；`rowsText` 将预先渲染的行包装为一个原生文本节点。`styleSpans`、`plainText`、`plainLine`、`spansLine` 和 `styledBackground` 支持 ANSI 文本与样式片段之间的其他转换
- `toolCommandCallName` 读取 `bash` 调用所执行的命令词，`toolCommandDispatches` 读取 bash 结果上的分派记录
- `unwrapHashlineHeaderPath` 将 `[path#TAG]` 形式的写入或编辑目标转换为普通路径
- `cfgExtensionTranscriptPresenters` 是 `extensionRenderers.transcriptPresenters` 设置的句柄

## 运行时模型 \{#runtime-model}

1. 并发导入扩展模块，然后按路径顺序依次运行工厂函数。
2. 加载期间可以使用注册方法；会话操作方法尚未初始化。
3. `ExtensionRunner.initialize(...)` 为当前模式接入可用的操作和上下文。
4. 会话、智能体和工具的生命周期事件会发送给处理程序。
5. 注册表中的工具会被包装，以便扩展拦截（`tool_call` / `tool_result`）。

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

`loader.ts` 中的约束：

- 加载扩展期间调用 `pi.sendMessage()` 等操作方法，会抛出 `ExtensionRuntimeNotInitializedError`
- 先完成注册，再通过事件、命令或工具执行运行时操作
- 加载期间可以直接使用 `pi.exec()`；模型提供方注册则排队等候会话初始化
- 子会话复用已导入的工厂函数，但绑定新的 API 和扩展注册项；模块级变量仍在这些会话之间共享

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

## 1) 注册和操作（`ExtensionAPI`） \{#1-registration-and-actions-extensionapi}

核心方法：

- `on(event, handler)`
- `registerTool`、`registerCommand`、`registerShortcut`、`getShortcutConflict`、`registerFlag`
- `registerMessageRenderer`、`registerAssistantThinkingRenderer`、`registerAssistantTextRenderer`、`registerTranscriptPresenter`、`registerLinkScheme`
- `registerComposerShape`
- `setLabel`、`getFlag`
- `sendMessage`、`sendUserMessage`、`appendEntry`、`exec`
- `getActiveTools`、`getAllTools`、`setActiveTools`
- `getCommands`
- `getSessionName`、`setSessionName`
- `setModel`、`getThinkingLevel`、`setThinkingLevel`
- `getServiceTiers`、`setServiceTier`
- `registerProvider`、`unregisterProvider`
- `registerFileWriteFallback`、`registerFileDeleteFallback`
- `registerTodoBackend`
- `events`（共享事件总线）

解构 `ExtensionAPI` 方法或将其作为回调传递时，方法仍绑定到所属扩展。

`setLabel(label)` 设置扩展的显示标签，并非为会话条目
添加标签。`getAllTools()` 返回工具结构定义和来源元数据，而
`getActiveTools()` 返回已启用工具的名称。

`getServiceTiers()` 返回当前会话按系列划分的实时服务档位映射的独立快照。`setServiceTier(family, tier)` 更改后续请求中某一系列的服务档位；传入 `undefined` 可清除此会话覆盖项。OpenAI 接受 `auto`、`default`、`flex`、`scale`、`priority` 或 `ultrafast`；Anthropic 接受 `priority`；Google 接受 `flex` 或 `priority`。在响应流式传输期间进行的更改，不会影响该进行中的请求。

### 键盘快捷键 \{#keyboard-shortcuts}

在扩展工厂函数中注册快捷键。omp 会在 `session_start` 之前绑定它们，因此稍后注册的快捷键会在下次启动时生效。

若组合键未被占用，`getShortcutConflict(chord)` 返回 `undefined`，否则返回以下类别中最先匹配的占用者：

- `{ kind: "reserved" }`：omp 保留该组合键（参见[约束与注意事项](#constraints-and-pitfalls)）；使用该组合键的快捷键永远不会绑定。
- `{ kind: "keybinding", keybindings }`：编辑器中绑定到该组合键的键位映射操作（审批和跟进操作的绑定都被清空时，Ctrl+Enter 仍计为这两项的按键）。`app.*` 操作通常在适用处优先获得按键；编辑按键（`tui.editor.*`、`tui.input.*`，例如用于轮换粘贴的 `alt+y`）则让位于扩展快捷键。
- `{ kind: "extension", extensionPath }`：另一个扩展的快捷键。若多个扩展注册同一组合键，无论写法如何，只有最后加载的扩展所注册的快捷键会绑定。

组合键按 TUI 的匹配方式比较：`alt+ctrl+x` 与 `ctrl+alt+x` 等价，`?` 也涵盖 `shift+?`。调用方自己的注册不计入冲突。键位绑定来自会话的 TUI 键位映射，包括用户自定义映射。没有 TUI 的会话（打印、RPC、ACP、SDK）使用 omp 的默认绑定。

加载扩展时调用此方法会抛出错误，应在处理程序（如命令或 `session_start`）中调用。例如，可先验证用户选取的组合键，再由工厂函数在下次启动时注册。

### 模型提供方注册 \{#provider-registration}

模型提供方的 `models` 条目以及 `fetchDynamicModels` 返回的条目，接受相同的 `api`/`kind` 配对，规则与 `models.yml` 一致（参见[模型](./models.md)）。`openai-images` 等运行器 API 隐含模型类别，因此模型会提供给 `image` 角色和 `generate_image`，而不会注册为聊天模型。静态 `models` 条目的 `kind` 若不受其 API 支持，`registerProvider` 会失败；`fetchDynamicModels` 返回的此类条目会被丢弃，并记一条警告日志。

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

`pi.registerProvider(name, config)` 可以包含可选的 `usage` 字段，其值为一个
`UsageProvider`（从 `@oh-my-pi/pi-ai` 导入）。其 `fetchUsage` 实现接收
规范化后的凭据并返回规范化的 `UsageReport`，然后由宿主的
AuthStorage 缓存、用量历史和用量显示功能处理，处理方式与内置模型提供方的用量
相同。

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

只要扩展注册处于生效状态，扩展用量提供方就会覆盖同名的
内置提供方。`pi.unregisterProvider(name)`（以及扩展来源清理）
仅移除该运行时覆盖项，恢复内置或通过配置指定的
用量解析器。

已缓存的用量报告存放在共享的 `agent.db` 中，以模型提供方名称、
用量提供方的 `cacheVersion`、规范化的基础 URL 和凭据身份为键。覆盖内置提供方时，请设置不同于内置值的 `cacheVersion`，
使未加载该扩展的进程（较早的会话、
使用 `--no-extensions` 的运行、SDK 脚本）无法与加载该扩展的进程互相读取对方的报告。

#### 接管内置模型提供方 \{#taking-over-a-built-in-provider}

通过四个字段，扩展可替换现有模型提供方的部分行为，而不必重新定义其模型。模型保留自己的 `api`，因此选项映射、凭据和模型目录策略保持不变：

- `stream(model, context, options)`：代替其 API 的内置适配器处理对该模型提供方下模型的所有请求。`options` 已按该 API 完成映射（例如 `GoogleGeminiCliOptions`），并携带该模型提供方的密钥。
- `generateImage(model, request, options)`：处理该模型提供方下图像模型的图像生成。
- `webSearch(params)`：为该模型提供方下的模型执行基于外部资料的搜索请求。可用性检查和标签仍由模型的资料检索后端提供。
- `discoverModels({ accounts, baseUrl, fetch })`：取代模型提供方的内置发现请求来获取模型列表。它会使用所有已登录账户运行一次（配置的密钥算一个账户）。返回 `null` 可保留已缓存的模型目录。内置发现机制仍负责缓存、合并条目及应用策略。
- `rules`：适用于该模型提供方所有模型的 KDL 规则指令，以指令名称为键，如同在 `provider "<id>" { … }` 块中设置这些指令（`{ "prompt-perturbation": true }`）。未知指令或无效值会导致 `registerProvider` 失败。在同等匹配精度下，运行时规则优先于随软件分发的规则，但更具体的规则仍然优先，例如作用域限定到模型的规则。

```ts
pi.registerProvider("google-generative-ai", {
	stream: myGeminiStream,
	generateImage: myImageGenerator,
	rules: { "prompt-perturbation": true },
});
```

这些覆盖项只在注册生效期间有效。注销模型提供方或卸载扩展会恢复内置行为。工作线程中的子代理会在主线程运行这些钩子。`providerSessionState` 等线程本地流状态仍留在工作线程中。

扩展注册的模型提供方（`registerProvider`）可以提供 `fetchDynamicModels` 来在运行时发现模型。此类请求的硬性超时为 15 秒（参见 `RUNTIME_DYNAMIC_MODEL_FETCH_TIMEOUT_MS`，定义于 `model-provider-discovery.ts`），以免故障端点阻塞发现。

模型提供方的 `apiKey`（字面密钥或环境变量名）通常优先于为该模型提供方保存的 OAuth 或 `/login` 凭据。若注册时也提供了 `oauth`，`apiKey` 会改作回退项。用户通过 `/login` 保存的密钥优先，只有没有已保存的登录凭据时才使用 `apiKey`。这样可避免将未设置的环境变量名当作字面密钥发送。因此，使用 `oauth` 和网关 `apiKey` 同时注册内置模型提供方 ID 时，已保存的上游凭据可以优先于网关密钥。

模型提供方的登录回调可以通过以下方式请求遮蔽输入：
`callbacks.onPrompt({ message: "Consumer key", secret: true })`。原生 `/login`
和首次运行的设置流程会保留提交值的原样，同时在输入界面、
保留的答案和输入诊断预览中隐藏该值。登录提示不共享
撤销或剪切和粘回历史。普通提示不遮蔽输入。

RPC 会拒绝机密提示，不会将其作为普通输入转发。SDK
宿主如果实现了 `onPrompt`，必须遵循 `secret` 或拒绝该提示。遮蔽
不提供加密、内存擦除或通用日志脱敏。

### 基于命令的模型提供方 \{#command-backed-providers}

`registerProvider` 也支持由扩展自行实现传输的模型
提供方。`api` 值是归该扩展所有的字符串（内置 API 名称
为保留名称），`streamSimple` 返回标准的
`AssistantMessageEventStream`，无须 HTTP 端点：

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

这一模式适用于本地 CLI、stdio 服务或 JSONL 进程。
模型提供方也可由此使用厂商只通过 CLI 提供的订阅套餐：
子进程使用自己的订阅凭据进行身份验证；相比之下，
通过 API 密钥调用同一模型时，即使账户已付费订阅，
也会按 token 计费。若工具必须由子进程负责，基于命令的模型提供方应将自己的
工具循环保留在子进程内，并且只发出最终的助手事件。
完整的子进程适配器还应移除不应继承的
凭据，遵循 `options.signal`，使用 `options.cwd`，将
一个稳定的会话 ID 映射到一段子进程对话，再将非零退出状态
转换为流错误。`models.yml` 仍仅用于 HTTP 及配置；
非 HTTP 传输可通过扩展实现。

在交互模式下，`input` 处理程序先于内置的首条消息自动标题检查运行。扩展可调用 `await pi.setSessionName(...)`（在 `input` 中调用），设置持久化的会话名称，并阻止该会话触发默认的自动标题生成。

其他可用接口：

- `pi.logger`
- `pi.arktype`（omptype 的 `type(...)` 结构构建器）
- `pi.zod`（基于 omptype、兼容 Zod 的构建器）
- `pi.typebox`（兼容旧版 TypeBox 的适配层）
- `pi.pi`（包的导出项）

### 待办后端（`registerTodoBackend`） \{#todo-backends-registertodobackend}

待办后端将会话的待办列表复制到外部存储，如任务跟踪系统、文件或仪表盘。omp 保留自己的列表及 `todo` 工具、HUD、`/todo` 和提醒。`todo.backend` 指定的后端（默认为 `native`，即不启用外部后端）会在每次更改后收到完整列表。

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

- **传递内容。** 主会话的列表每次提交更改后，都会传递整个列表，而不是单次操作。任务仅包含 `content` 和 `status`。某次调用运行期间，后续列表合并为最新一份。有两种情况会跳过调用：列表没有变化，且所用后端刚收到该列表；或者列表为空，且 omp 尚未调用过任何后端（`/new` 不会重置该状态）。
- **会话。** 使用 `ctx.sessionManager.getSessionId()` 的返回值作为存储键，并在首次 `await` 之前读取它。执行 `/new` 后，ID 会变更，随后的空列表归入新 ID。调用与 `session_*` 事件之间没有顺序保证，也不按会话分别创建实例；请在 `session_shutdown` 时释放状态。
- **失败。** 后端不能拒绝更改，也不会收到中止信号。抛出异常或未在扩展处理程序超时前响应，都会报告扩展错误；omp 的列表保持已提交的状态，下次更改时再次发送整个列表。一次调用超时后，下一次调用可以在前一次调用仍运行时启动。迟到的写入不得覆盖更新的列表。退出时，omp 会等待仍在运行的调用，等待上限与 `session_shutdown` 处理程序相同。
- **选择。** `todo.backend` 存放已注册的 `id`（可用字母、数字、`.`、`_`、`-`；`native` 为保留值）。若多个扩展注册所选 ID，首个加载的扩展保留该 ID，其他扩展会报告错误。若所选 ID 未由任何已启用扩展注册，则报告一次扩展错误（切换到其他 ID 后再次选回时会重新报告），待办功能仍按 `native` 工作。会话中途选择的后端会在下次更改时收到列表；若在 `/settings` 中选择，则立即收到。
- **作用域。** 仅主会话：子代理和 `/tan` 克隆的会话不会镜像待办列表。
- **设置。** `/settings` → 工具 → 待办 →「待办后端」会列出 `Native` 和已启用扩展注册的所有后端，以及各后端的 `label`（省略时使用 `id`）和 `description`。两项均可省略，但任何一项若填写为空白，注册时都会抛出错误。

### 运行时设置覆盖项 \{#runtime-setting-overrides}

使用带类型的注册表句柄访问设置（参见 [config-usage.md](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/config-usage.md#definitions-srcconfigregistryts) 中的「定义」）；使用字符串路径的 `settings.get`/`set`/`override` 方法已在 18.3 中移除。扩展使用 `lookup(id)` 按 ID 查找句柄（使用 `all()` 枚举句柄）。这两个方法来自 `@oh-my-pi/pi-coding-agent/config/registry` 子路径；取得句柄后，传入 `pi.pi.settings` 作为作用域：

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { lookup } from "@oh-my-pi/pi-coding-agent/config/registry";

export default function (pi: ExtensionAPI) {
	const recap = lookup("recap.enabled");
	// Defer to the user: pin a default only when no env var or settings layer configures it.
	if (recap && !recap.isConfigured(pi.pi.settings)) recap.override(pi.pi.settings, false);
}
```

- `override(scope, value)` 写入内存中的运行时层；不持久化，优先级高于项目层、全局层和 `--config` 层。设置绑定的环境变量通常优先；定义使用 `envFallback` 时，则由已配置的设置优先。若定义拒绝某个值，会抛出错误，例如 `Invalid value for recap.enabled: "nope" (expected a boolean)`。
- `clearOverride(scope)` 清除覆盖项，恢复持久化的值或默认值。
- `isConfigured(scope)` / `provenance(scope)` 区分用户配置的值和默认值（`"env" | "runtime" | "overlay" | "project" | "global" | "default"`）。
- `get(scope)` 读取生效值；`listen(scope, cb)` 监听更改。写入经过设置存储，因此会触发更改监听器和实时效果。
- ID 未知时，`lookup` 返回 `undefined`。

### 消息投递语义 \{#message-delivery-semantics}

`pi.sendMessage(message, options)` 支持：

- `deliverAs: "steer"`（流式传输时的默认值）：引导当前运行
- `deliverAs: "followUp"`：流式传输期间，排在当前运行结束后投递
- `deliverAs: "nextTurn"`：不出现在可编辑的待发送消息界面中；流式传输时等待下一轮，空闲且没有 `triggerTurn` 时追加到上下文和历史记录，不启动轮次
- `deliverAs: "aside"`：在下一个智能体步骤边界注入，不中断当前工具批次；但会结束正在运行且可中断的 `wait`（等待会返回「Wait interrupted by message.」，其作业继续运行）。空闲时通常会启动轮次，不受 `triggerTurn` 影响。处于计划模式，或用户中断后自动恢复受抑制时，则并入上下文
- `triggerTurn: true`：在空闲时启动轮次（使用 `deliverAs: "nextTurn"` 时也生效：空闲时立即提交提示词；流式传输期间，由排队消息安排一次内部续接）

空闲且没有 `triggerTurn` 时，普通的 `sendMessage` 投递会追加
消息，不启动轮次。带 `display: true` 的消息会立即渲染；
使用 `"nextTurn"` 投递则不会发出该即时显示事件。
ACP 客户端可以推迟由智能体发起的轮次，此时本应启动轮次的请求
作为隐藏的下一轮消息保留。

`pi.sendUserMessage(content, { deliverAs })` 提交文本或图像，不展开斜杠命令
或提示词模板。省略 `deliverAs` 时，空闲状态会启动提示词的处理；
流式传输期间则会将引导消息加入队列。显式指定 `"steer"` 或 `"followUp"`
时，即使空闲也会将提示词加入队列，不直接启动轮次。`"aside"`
在运行期间会于下一个步骤边界注入；空闲时则
启动轮次。消息默认记录为 `attribution: "user"`，除非传入
`attribution: "agent"`；请用 `"agent"` 标记由扩展生成或从
其他智能体转发的文本。

传给 `pi.sendMessage` 的载荷会在投递前规范化
（使用 `normalizeCustomMessagePayload`，其定义在 `packages/tui/src/chat/messages.ts`，
由 `session/messages.ts` 重新导出）：非对象载荷会转换为字符串，
作为默认自定义类型的内容；缺失的 `customType`/`attribution` 字段会使用
默认值，无效内容会转换为空字符串。

若某行需要显示并保存，但不能发送给模型，请在其载荷上设置 `excludeFromContext: true`。
它与 `!!` bash 运行类似，可用于逐轮统计或状态行。
此标志会持久化在 `custom_message` 条目中，因此在
会话恢复、上下文压缩和分支摘要后，该行仍不进入上下文。这类行不会
启动或延长轮次，`triggerTurn` 和 `"aside"` 会被忽略。如果在
运行期间发送，会像 `!!` bash 行一样排队，并在运行结束或
下一条提示词开始时显示并保存；如果 `/new` 或切换会话中断了
运行，就保存到正在离开的会话中。与 `!!` 和 `$$` 运行一样，
它会保留输入区正在显示的预测内容，也不会阻挡排队的跟进消息，
因为模型看到的上下文没有改变。

## 2) 处理程序上下文（`ExtensionContext`） \{#2-handler-context-extensioncontext}

处理程序和工具的 `execute` 方法收到的 `ctx` 包含：

- `ui`
- `mode`：`"tui" | "rpc" | "json" | "print"`；ACP 使用 `"rpc"`。使用仅限终端的组件前，应检查模式是否为 `"tui"`
- `hasUI`：此运行器是否具有实际的 UI 上下文，而非空操作上下文；这不表示所有 UI 方法都受支持
- `cwd`
- `sessionManager`（只读）
- `modelRegistry`、`model`
- `models`（只读模型查询，见下文）
- `localProtocolOptions`（可选，为外部工具桥接提供调用会话的 `local://` 根目录映射）
- `getContextUsage()`
- `getAsyncJobSnapshot()` 返回当前会话的只读异步作业快照；若上下文不属于任何会话，则返回 `null`
- `compact(instructionsOrOptions?)`：接受指定摘要重点的文本或 `CompactOptions`，包括单次使用的 `mode: "soft" | "remote" | "snapcompact"`、`onComplete`、`onError` 和 `suppressContinuation`
- `isIdle()`、`hasPendingMessages()`、`abort()`
- `shutdown()`
- `resolvePlanReview(reviewId, choice, input?)`：回答已打开的交互式计划审查。审查或选项不可用时返回 `false`（传入 `input.role` 时，在所指定的档位判断选项是否可用，因此即使滑块当前没有选中上下文更大的档位，也可在该档位接受 `keep`）。`refine` 要求 `input.feedback` 非空。审批选项（`execute`、`compact`、`keep`）中的 `input.role` 可引用该事件的 `tiers` 中的档位，以选择执行模型。角色未知，或在其他选项中传入 `role`，都会返回 `false`。
- `getPendingPlanReview()`：返回仍在等待答复的交互式计划审查，结构与 `plan_review_requested` 相同，且会根据滑块当前选定的档位重新度量 `options`；没有时返回 `undefined`。可用它回答扩展加载或重新连接之前已打开的审查。
- `openPlanReview()`：打开最新计划文件的交互式计划审查，与 `/plan-review` 类似。审查开始等待答复时即返回 `true`，不等待选择。若审查已打开，则保留原审查，不替换。与 `/plan-review` 不同，此方法从不中止工作。智能体正在流式传输或压缩上下文、计划模式未启用，或者不存在非空计划文件时，静默返回 `false`。
- `sessionModes`（仅交互式 TUI 会话可用；打印、JSON、RPC、ACP 和子代理中为 `undefined`）：不通过斜杠命令或对话框，直接控制内置的计划、Vibe、目标和循环模式。`getState()` 返回独立快照（`plan`/`goal`：`inactive | active | paused`，`vibe`：`inactive | active`，`loop`：`inactive | active | paused`，另含计划文件及目标的任务和预算），因此较晚加载的扩展也能读取当前状态。`set(request)` 执行一次显式状态转换：`{ mode: "plan" | "vibe", action: "enter" | "exit" }`、`{ mode: "goal", action: "enter", objective, tokenBudget? }`、`{ mode: "goal", action: "pause" | "resume" | "drop" }`、`{ mode: "loop", action: "enter", prompt?, limit?, condition? }` 或 `{ mode: "loop", action: "exit" }`。请求的状态已经生效时，返回 `{ ok: true, changed: false }`。拒绝时返回 `{ ok: false, code, message, state }`，其中 `code` 为 `busy`（正在运行轮次、压缩上下文或执行其他模式转换；会话仍在恢复保存的模式，例如在 `session_start` 或切换会话时；或者已完成的目标仍在清理）、`conflict`（与斜杠命令一样，被其他模式阻挡）、`disabled`（关闭了 `extensionHandlers.modeControl`，或关闭了 `plan.enabled` / `goal.enabled`）或 `invalid_request`。状态转换不会提交提示词，需另行发送；目标续接和循环重复会在下一轮结束后开始。循环的 `prompt` 是每轮结束后重复使用的文本（若未指定，则使用用户下一次输入的提示词）；对正在运行的循环，此字段替换原文本；对已暂停的循环，`enter` 会恢复运行。计划模式的 `exit` 会完全退出计划模式并恢复工具和模型，但不会批准计划或删除草稿。设置 `extensionHandlers.modeControl: false` 会拒绝所有 `set()`，但 `getState()` 和 `mode_changed` 仍正常工作。

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
- `isProjectTrusted()`：始终为 `true`；OMP 加载项目输入前，不会按目录询问信任确认。
- `agent`：此会话运行的智能体，结构为 `{ kind: "main" | "sub", id, name, depth, parentId? }`。工厂函数会重新绑定到每个子代理会话（task 工具、eval `agent()`、`/tan` 克隆），因此处理程序可检查 `ctx.agent.kind === "sub"`，或比较已转为小写的智能体定义 `name`（如 `"explore"`），以便只在子代理中运行。使用 `kind` 而非 `depth`：`depth` 只统计 `task` 嵌套层数，因此 `/tan` 克隆是深度为 0 的子代理，并报告 `name: "sub"`。顾问自身的工具调用会进入会话的 `tool_call`/`tool_result` 处理程序，并带有 `{ kind: "sub", id: "advisor", name: "advisor", depth: 0, parentId }`，因此 `kind === "main"` 也会排除顾问活动。
- `runEphemeralTurn(...)`（可选，见下文）
- `startLive(...)`（可选，仅交互模式可用，见下文）
- `memory`（可选的结构化记忆运行时，通过已配置的后端查询状态、搜索或保存）
- `annotations`：供看板和远程客户端使用的 `/annotate` API。`submit({ source, notes, deliver?, review?, focus? })` 生成与 `/annotate` 相同的反馈并在不使用 UI 的情况下投递；`open({ source, deliver?, focus? })` 在来源上挂载标注浮层，返回操作者的批注（关闭时为 `undefined`，仅支持 `mode === "tui"`）。文本来源为 `{ kind: "text", text, label? }`、`{ kind: "file", path }`（相对于当前会话的工作目录解析）或 `{ kind: "last" }`；差异来源为 `{ kind: "diff", diff, label? }`、`{ kind: "uncommitted" }` 或 `{ kind: "pr", ref }`（`ref` 可以是 GitHub PR 或 GitLab MR 的 URL、`pr://owner/repo/N` 或 `mr://<host>/<group>/<project>/N/diff`）。`review`/`focus` 仅用于差异来源，用于文本来源会产生类型错误。文本批注采用 `{ note, line?, quote? }`（行号从 1 起算；省略时批注涵盖整个来源，引用行会自动填充）；差异批注采用 `{ path, note, line?, side?, occurrence?, rawLine? }`（`side` 默认为 `"new"`；`rawLine` 是含 `+`/`-`/空格前缀的差异行）。不匹配来源的批注会导致请求被拒绝，不会被静默丢弃。`text` 和 `diff` 来源是传入内容的固定快照；`file`、`last`、`uncommitted` 和 `pr` 会在调用时重新读取，行号按当前内容匹配。因此可传入 `quote`/`rawLine`，在内容变化时拒绝并指出不匹配的批注。`deliver` 默认为 `"auto"`：交互式 TUI 编辑器可用时，可粘贴的批注会进入输入区，否则直接发送；大语言模型审查请求（对差异指定 `review: true`）总会发送。发送使用 `pi.sendUserMessage`，并在智能体流式传输期间排为跟进消息。`"paste"`/`"send"` 强制指定投递方式，`"none"` 则仅返回 `text`。结果由 `kind` 区分：`"text"` 带有 `TextReviewAnnotation[]`；若操作者在 `open` 后用外部编辑器替换了来源，还会带有 `editedText`（反馈此时指向替换后的文本）；`"diff"` 带有 `CodeReviewAnnotation[]` 和 `review`（表示 `text` 是否为大语言模型审查请求）。两类结果都带有渲染后的 `text` 和实际投递渠道 `delivered`。
  显式粘贴要求 `ctx.ui.supportsEditor === true`：TUI 和带界面的 RPC 提供输入区；ACP 和空操作 UI 上下文不提供。提交给大语言模型审查的差异若超过 50,000 字符或 20 个可审查文件，会在投递前被拒绝；`open` 会在挂载浮层前拒绝这种补丁。请把更大的补丁拆成较小的请求。仅提交批注时不受此审查提示词上限约束。
- `setInterval(fn, ms, ...args)` / `setTimeout(fn, ms, ...args)` / `clearTimer(timer)`：托管计时器（见下文）

### 临时旁支轮次（`ctx.runEphemeralTurn`） \{#ephemeral-side-turns-ctxrunephemeralturn}

使用当前模型和对话上下文，运行与 `/btw` 相同的旁支轮次处理流程。问题和响应不会追加到会话历史，请求可在主轮次仍运行时执行。快照可能包含正在生成的助手文本。

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

例如，Synadia/NATS 桥接可以根据本地上下文回答另一智能体的问题并流式返回答复，不必注入实时用户消息。**旁支轮次会将当前对话快照发送给已配置的模型提供方，并把答复返回给调用它的扩展。** 桥接扩展使用此 API 前，必须在适当情况下征得用户同意，对调用方进行身份验证和授权，并审计每次远程请求。智能体之间相互咨询的扩展可在推理前设置 `maxTokens`，以及序列化并转换后的 `maxContextBytes` 上限（在秘密信息混淆后衡量）。会忽略或覆盖调用方输出 token 上限的传输层，包括 Codex Responses、Cursor、GitLab Duo Workflow、Ollama Cloud 发现的模型以及 Antigravity，会在推理前拒绝 `maxTokens`，而不会静默启动不设上限的请求。由于推理强度路由可能选择输出上限固定的传输配置，Antigravity 为谨慎起见会在整个传输层拒绝此类上限请求。请求设置上限时会关闭可选的预算式思考，因为这些传输层否则可能为容纳思考预算而提高实际传输的限制；要求预算式思考的模型会拒绝此上限。Cursor 的传输层不依赖所提供的工具目录也会公开原生工具，因此在 Cursor 上指定 `tools: false` 也会在推理前被拒绝。两项上限都必须是正的安全整数。只有能接受无上限的轮次时才应省略 `maxTokens`，否则请选择支持输出限制的 API。扩展自行管理传输、访问控制、请求限制和取消（包括关闭）；此 API 不增加网络依赖。`onTextDelta` 可以返回 Promise：按顺序等待投递完成，包括最后一次刷新缓冲；投递出错时会拒绝本次旁支轮次，并中止模型提供方请求，不会任其继续流式传输。

钩子可以启动旁支轮次，包括从延迟回调中启动。只有在正在运行的旁支轮次 _内部_ 触发的 `context`、`before_provider_request` 和 `after_provider_response` 钩子才会拒绝嵌套的 `runEphemeralTurn` 调用，从而限制递归；调用方的 `onTextDelta` 不受该限制。旁支轮次继承当前事件处理程序的信号（仅在该处理程序仍运行时）；对已注册工具，还会继承工具调用的中止信号。显式传入的 `options.signal` 会与这些信号合并，不会取代它们。`maxContextBytes` 在 `before_provider_request` 钩子运行前检查；如果钩子替换载荷，不会重新度量。

工具调用一律丢弃，不会执行。传入 `tools: false` 会在上下文转换后移除工具定义，并在模型提供方边界设置 `toolChoice: "none"`。省略该选项会保留 `/btw` 的工具目录，以复用提示缓存；关闭工具可能降低缓存命中率。如果转换后的历史仍包含工具调用或结果，Bedrock Converse 会拒绝禁用工具。现有的上下文和模型提供方钩子仍会运行。此机制并非沙箱，也不保证任意扩展钩子都没有副作用。模型推理会消耗所配置的模型提供方资源。`dedupeReply` 默认为 `true`，会折叠连续超过三行的相同行，并将返回的答复限制在 4 KiB 以内。设为 `false` 可关闭这些转换，但 `replyText` 仍会去除首尾空白。调用方应使用 `replyText` 作为最终结果。

`history` 仅用于独立于当前会话的既有旁支轮次消息；它会用 `structuredClone` 克隆，因此应传入可克隆的消息数据。`conversationKey` 使相关旁支轮次沿用模型提供方的同一对话脉络。取消或失败后，请先更换此键再重试。如果分派前会话或确切的模型实例发生变化，旁支轮次也会以可重试错误拒绝请求。调用方应从新的当前上下文快照重试，不要复用旧快照。

### 在自有对等端上运行实时语音（`ctx.startLive`） \{#live-voice-on-your-own-peer-ctxstartlive}

启动 `/live` 会话，让音频由扩展拥有的 WebRTC 对等端处理（例如手机上的浏览器），而不使用宿主的麦克风和扬声器。其余工作仍由 omp 负责，包括信令（用会话的 OpenAI Codex 登录连接 Codex，或使用[自定义实时端点](./rpc.md#custom-live-endpoint)（设置了 `live.endpoint` 时））、随软件分发的实时提示词、将委派到此会话的工作作为普通轮次处理，以及会话记录。TUI 显示实时可视化界面；使用 `/live` 或停止键可结束通话。

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

通话信令完成且控制套接字打开时，Promise 就会兑现；请立即应用 `sdpAnswer`。未提供非空的 `sdpOffer`，或已有另一个实时会话在运行时，Promise 会被拒绝。`voice` 和 `instructions` 的行为与 RPC 的 `live_start` 相同。对等端自行处理回声消除和静音。TUI 的静音键只会将阶段切换为 `muted`，因此在该阶段应让对等端的麦克风轨道静音。omp 不会为这类通话报告音频电平或 `speaking` 阶段。`onEnd` 恰好调用一次，包括通话无法启动时（在 Promise 被拒绝前调用）。观察者回调抛出的异常会记录到日志，不会结束通话。

对于这类通话，omp 没有自己的媒体对等端，因此无法得知你的对等端何时断开。对等端断开时请调用 `live.stop()`（例如 `connectionstatechange` 变为 `failed` 或 `closed`，或中继套接字关闭时）；否则通话会保持打开，TUI 也会继续显示实时可视化界面。

控制对等端的人可以用语音引导这个会话，包括委派会运行工具的工作。因此，应对向你提供 offer 的页面或中继进行身份验证。

### 后台工作（`ctx.setInterval` / `ctx.setTimeout`） \{#background-work-ctxsetinterval--ctxsettimeout}

扩展**在进程内运行，没有隔离**。直接使用 `setInterval`/`setTimeout` 或分离的 Promise 时，回调抛出的异常不在处理程序分派的 try/catch 范围内，会成为进程级 `uncaughtException`。全局事后处理程序会将其视为致命错误，**整个会话会被终止**，而不只是出错的扩展。

周期性或延迟的后台工作应使用 `ctx.setInterval` / `ctx.setTimeout`。它们沿用平台的函数签名，但具有以下行为：

- 以与处理程序分派相同的异常隔离方式运行回调。同步抛错或 Promise 被拒绝时，会记录日志并通过扩展错误渠道报告，会话继续运行；
- 返回可传给 `ctx.clearTimer(handle)` 的句柄；
- 已调用 `unref`（本身不会让进程保持运行），并会在 `session_shutdown` 时自动清除。

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

如果仍直接使用 `setInterval`/`setTimeout` 或分离的 Promise，需要自行隔离异常：用自己的 `try/catch` 包裹回调体（未处理的异常会终止会话），并在 `session_shutdown` 时清除计时器。

### 模型选择（`ctx.models`） \{#model-selection-ctxmodels}

`ctx.models` 是只读接口，可按内核使用的相同规则选择和比较模型：

- `list()`：当前会话可用且已通过身份验证的模型。
- `current()`：会话当前使用的模型（实时读取，因此会反映 `/model` 切换）。
- `resolve(spec)`：将模型字符串（`provider/id` 或裸 ID）或角色别名（`@slow` 等已配置角色）解析为 `Model`，遵循与 `--model` 相同的配置别名及匹配偏好。无匹配项时返回 `undefined`。
- `family(model)`：返回一个不透明的谱系标识，用于检查是否为同一系列（Claude 的小版本共用一个标识，Claude 和 GPT 的标识不同）。可以比较该标识，但不要持久化，因为标识词表会随新版本变化。

```ts
// Pick a model from a different family than the current one (e.g. a cross-family reviewer).
const current = ctx.models.current();
const contrasting = ctx.models.list().find(m => current && ctx.models.family(m) !== ctx.models.family(current));
```

## 3) 命令上下文（`ExtensionCommandContext`） \{#3-command-context-extensioncommandcontext}

命令处理程序还可使用：

- `waitForIdle()`
- `newSession(...)`
- `switchSession(...)`
- `branch(entryId)`
- `navigateTree(targetId, { summarize })`
- `reload()`

控制会话的流程应使用命令上下文。这些方法特意与通用事件处理程序分开。

## 事件接口（当前名称及行为） \{#event-surface-current-names-and-behavior}

标准事件联合类型与载荷类型定义在 `types.ts` 中。

### 会话生命周期 \{#session-lifecycle}

- `session_start`
- `session_before_switch` / `session_switch`
- `session_clear`
- `session_before_branch` / `session_branch`
- `session_before_compact` / `session.compacting` / `session_compact`
- `session_before_tree` / `session_tree`
- `session_before_shutdown` / `session_shutdown`

在交互式 TUI 中，若扩展工厂函数没有注册模型提供方、
快捷键、输入区形态或文件操作回退项，
且之前某次启动已针对其当前源码记录这一点，就会等到输入区可以
接收输入后再加载该扩展。它的 `session_start` 仍会运行（绑定时投递），
而提交的第一条消息及每个模型轮次都会等待扩展
加载完成，因此其工具、命令和 `input`/`before_agent_start` 钩子
从第一个请求起就会生效。绑定前发出的事件不会重放。恢复会话、
使用 `--tools` 启动或携带 omp 无法识别的选项启动时，会在会话
开始前加载所有扩展。

`session_clear` 在原地重置上下文成功后收到 `{ type: "session_clear" }`，
包括用 `/clear` 或 `AgentSession.resetSessionContext()` 执行的空清除。
重置操作返回前会等待处理程序；处理程序可让已注入
模型上下文的指令缓存失效。会话 ID、文件和
持久化历史均不变。这不是 `session_switch`，也
不能取消重置。重置因忙碌或被拒绝而未执行时，不发出事件。

`session.compacting` 收到 `{ sessionId, messages }`，并可返回
`{ context?: string[]; prompt?: string; preserveData?: Record<string, unknown> }`，
以自定义摘要上下文、摘要提示词和存储的压缩数据。
如果 `session_before_compact` 已提供替代的
上下文压缩结果，则跳过此事件。

可取消的前置事件：

- `session_before_switch` → `{ cancel?: boolean }`
- `session_before_branch` → `{ cancel?: boolean; skipConversationRestore?: boolean }`
- `session_before_compact` → `{ cancel?: boolean; compaction?: CompactionResult }`
- `session_before_tree` → `{ cancel?: boolean; summary?: { summary: string; details?: unknown } }`
- `session_before_shutdown` → `{ cancel?: boolean }`

前置事件决定操作能否继续。处理程序可以先询问操作者，再作决定。因此，等待宿主对话框的时间（`ctx.ui.select`、`confirm`、`input`、`askDialog`、`formDialog`、`approve`、`editor` 或已显示的 `custom` 组件）不计入处理程序的 30 秒时限。`signal` 在 `session_before_compact` 和 `session_before_tree` 上是协作式中止信号，可将其传给自己的工作，但操作仍会等待处理程序。`signal` 在 `session_before_shutdown` 上可以结束关闭操作的等待：中止时，宿主停止等待，关闭你尚未完成的对话框，并忽略迟到的结果。

`session_before_branch` 和 `session_branch` 携带 `reason`，它决定 `session_before_branch.entryId` 的含义。对于 `"branch"`（`branch(entryId)`、`/branch`），它是回退到的那条用户消息；该消息及其后的所有内容都会丢弃。对于 `"fork"`（`AgentSession.fork(entryId)`、RPC `fork` 携带 `entryId`）和 `"btw"`（提升 `/btw`），它是新会话中保留的最后一个条目。

#### 关闭会话 \{#closing-the-session}

操作者通过仍可拒绝的方式关闭会话前，`session_before_shutdown` 会询问扩展。在交互式 TUI 中，这包括 `/exit`、`/quit`、在空编辑器中按 Ctrl+D、连按两次 Ctrl+C，以及从会话选择器退出。它在任何工作停止前运行，此时扩展 UI 仍可用；每次尝试关闭都会触发。强制关闭时从不发出此事件，包括致命的工作区错误、`ctx.shutdown()`、操作系统信号、重启，以及 RPC、ACP、打印、SDK 或子代理的销毁。

第一个 `{ cancel: true }` 会让会话保持打开。错误、超时和中止均不会阻止关闭。关闭操作停止等待时，事件的 `signal` 会中止，例如又收到关闭请求（再执行一次 `/exit` 或再按 Ctrl+D，或发生致命错误而关闭）、收到操作系统信号，或 UI 停止。此后送达的取消结果会被忽略。操作者的对话框按键不变；关闭提示框会使其返回 `undefined`，会话随后正常关闭。

在提示期间到达的 `ctx.shutdown()` 请求，不会随操作者的退出请求一起取消；它仍会在下一处稳定边界关闭会话。

```ts
pi.on("session_before_shutdown", async (event, ctx) => {
	const outcome = await ctx.ui.input("Did this session reach its goal?");
	if (event.signal.aborted || outcome === undefined) return;
	pi.appendEntry("session-outcome", { outcome });
});
```

取消只能让宿主停止等待，无法停止扩展代码或撤销其副作用。持久化迟到的结果前，应检查 `signal`。`appendEntry` 遵循通常的会话持久化规则，不会强制把空会话写入磁盘。

`session_shutdown` 不变：仅用于通知清理，处理程序并发执行，时限为 2 秒。如需提问，请在 `session_before_shutdown` 中询问，而不要在此事件中询问。

### 提示词与轮次生命周期 \{#prompt-and-turn-lifecycle}

- `input`
- `before_agent_start`
- `before_provider_request`：接收 `{ payload }`；返回替换载荷本身，而不是 `{ payload }`。各处理程序依次处理。模型提供方的传输层必须调用 `onPayload`；`devin-agent` 不调用它。
- `after_provider_response`：读取响应体之前发出的通知，载荷为 `{ status, headers, requestId?, metadata? }`。模型提供方的请求和响应处理程序可在 `ctx.model` 中取得该次请求所用的模型。
- `context`：接收对话消息，可返回 `{ messages }`。各次替换依次应用，不改写持久化历史。
- `agent_start` / `agent_end`：智能体循环的生命周期通知；`agent_end` 仍只用于通知。
  对扩展而言，`agent_end.messages` 包含该循环结束时的当前会话上下文，而不只是
  该循环生成的消息。以前的消息可能在后续通知中再次出现；
  上下文压缩或分支变化可能改变其中保留的消息。如果每条消息只应触发一次操作，
  请跟踪已处理的消息 ID，不要将此数组视为增量。
- `session_stop`：主会话的停止钩子，进入稳定状态前会等待它完成。建议性的 `{ continue: true, additionalContext }` 请求最多触发 8 次续接。明确的拒绝 `{ decision: "block", reason }` 优先于建议性请求，不消耗该额度，并会一直阻止完成，直到钩子允许完成或操作者中断。拒绝未提供原因时，会安排一次给出诊断信息的续接，而不允许结束。任务及子代理会话从不触发此事件，并且只有智能体拥有的后台作业完全空闲时才会触发（参见 `#hasPendingAsyncWake`，位于 `session/agent-session.ts`）。
- `cache_warming_decision`：每次作出提示缓存预热决策前触发，并携带预热成本信息。`method` 指明刷新方式（`"prewarm"` 表示以 `max_tokens: 0` 预热，`"replay"` 表示以一个 token 重放；无法安全刷新请求时省略），`warmCost` 是读取提示缓存的成本，若重放再加上预计计费的输出成本；`missCost` 是重新写入提示词而非读取缓存的成本；`compactCost` 是用上下文压缩跨过等待期的成本（不能压缩时省略）；`spentCost` 是上次实际请求以来的刷新支出；另外还包含 `continuationProbability` 和 `action`（`"warm"`、`"compact"` 或 `"stop"`）。返回 `{ action }` 可覆盖决策，以最后一个返回操作的处理程序为准。处理程序失败、响应耗时超过 2 秒，或预热器无法执行覆盖项时，沿用预热器原来的决策。无法执行的覆盖项包括 `"warm"`（缺少 `method` 时）和 `"compact"`（缺少 `compactCost`，或提交时距条目到期不足一分钟）。覆盖为 `"stop"` 会停止预热，直到下一次实际请求。主智能体循环可在任何模式下预热，任务子代理最高只到 `streaming`；单次请求会话从不触发此事件。刷新与实际请求采用相同的模型提供方路径，因此刷新也会触发 `before_provider_request` 和 `after_provider_response`。替换载荷必须与实际请求的载荷逐字节相同，刷新才能命中缓存。
- `turn_start` / `turn_end`
- `assistant_message`：每条已定稿的助手消息都会触发一次并等待处理完成，然后才会写入智能体上下文、持久化、发出 `message_end` 或分派工具。返回 `{ content }` 可替换用于历史、持久化、`message_end` 使用方和下一次模型提供方请求的文本；各处理程序依次处理。已经通过流式更新（`message_update`、ACP/RPC 数据块）投递的文本不会撤回，因此从流渲染的客户端可能继续显示原始文本。文本块的数量、顺序和位置必须保持不变，只能修改其文本。所有非文本块及其他块元数据都必须保持不变。未改动的文本保留原来的 `textSignature`，即使处理程序删除或改动了它。改过的文本将失去签名，以免将模型提供方的重放状态用于不同的文本。无效的替换和处理程序错误会被报告并跳过。若等待处理程序期间收到中止，保留此前已完成的改写，跳过其余处理程序。
- `message_start` / `message_update` / `message_end`：生命周期通知；`message_end` 收到独立快照，因此就地修改不会改写智能体或模型提供方的上下文。

```ts
pi.on("assistant_message", event => ({
	content: event.message.content.map(block =>
		block.type === "text" ? { ...block, text: block.text.replaceAll("teh", "the") } : block,
	),
}));
```

`before_agent_start` 为普通提示词准备策略，也会在含用户输入的每批引导或跟进消息实际出队时为该批次准备策略（`reason: "prompt"`）。它不是入队通知：运行中的批次可触发此事件，而不再次触发 `agent_start`。查看队列、模型提供方重试、只执行工具的迭代，以及仅含合成消息的排队续接都不会触发此事件。显式提交的合成提示词仍遵循普通提示词的生命周期。重新唤醒已挂起的子代理（无论以唤醒指令、消息触发，还是仅将焦点切换过去）会在 `session_start` 后触发一次，`reason: "revive"`，`prompt` 为空，且返回结果将被丢弃。这样，扩展就能再次登记它在子代理首个提示词时注册的内容。执行逐提示词工作（检索记忆、分类、记录日志）的处理程序应在 `reason: "revive"` 时提前返回，因为恢复流程会等待处理程序完成。唤醒轮次由智能体发起，不会触发此事件；之后的普通提示词仍会照常触发。

对排队批次，`prompt` 包含每条选中用户消息中已经转换的文本，消息之间用两个换行符连接；同一消息内的文本块直接拼接。`images` 按投递顺序包含这些消息中已经规范化的图像。归属为智能体的隐藏伴随消息不包含在这些事件输入中，但仍保留在投递批次中。输入钩子、命令、模板和原始附件的预处理都不会再次执行。

处理程序从当前的基础系统提示词开始依次处理。最终覆盖项适用于下一次模型提供方请求及其续接，直到下一条提示词或含用户输入的批次重新准备策略。覆盖项始终是完整替换，即便返回的字符串或数组与基础内容无关。宿主不会推断或重新应用文本补丁。返回的自定义消息会在原批次之后追加一次；原始消息保留顺序、标识、归属和元数据。处理程序尚未完成时，若轮次中止，或会话、队列的归属发生变化，宿主会取消应用结果。

如果在准备过程中，返回的覆盖项所依据的基础内容发生变化（例如处理程序等待 `pi.setActiveTools()`），宿主会丢弃此次尝试返回的自定义消息和暂存记忆，改用最终生效的基础内容再次准备策略。每次投递最多尝试三次；基础内容反复变化时，会报错且不投递原始输入。已排队的原始消息继续留在队列中，该轮失败后不会自动重试它们。新的提示词或排队投递可以恢复队列处理，包括合成跟进消息和扩展或顾问发出的自定义消息；解除暂停并不限于由用户发起的重试。普通文本会通过丢弃提示词的回调返还。如果基础内容不变，即使刷新替换了数组，也不会重试。未返回覆盖项的准备过程仍使用最终生效的基础内容，但不会重新运行处理程序或检索记忆。发布结果前会再同步检查归属；如果此时发生变化，则拒绝投递，不提交记忆或上下文。

处理程序必须能处理重入。基于基础内容变化的重试可对同一次提交再次调用整个 `before_agent_start` 处理链；取消的投递在恢复后也可能重新准备。只有被接受的那次尝试返回的上下文和暂存记忆才会发布；处理程序已经产生的外部副作用无法回滚。这些策略重试从不重放输入钩子、命令、模板或原始附件的预处理。

如果后续处理队列时失败，尚未写入会话记录的早期原始消息会
恢复到较新入队消息之前。准备阶段生成的上下文不会重新入队，
显式清空或替换的队列也不会恢复。

#### 拦截外部输入 \{#external-input-interception}

`input` 在提交入口处运行一次，先于命令解析、技能或
提示词模板展开以及入队：

| 提交方式 | `source` |
| --- | --- |
| 主会话中按 Enter 或 Ctrl+Enter | `"interactive"` |
| RPC 或 RPC UI 模式中的 `prompt`、`steer`、`follow_up` 或 `abort_and_prompt` | `"rpc"` |

处理程序按扩展和注册顺序运行。返回的 `text` 和 `images`
替换值会传给后续处理程序；省略的字段保留当前值，
`images: []` 则移除附件。替换文本会在分派前去除首尾空白。
`handled: true` 会停止其余处理程序和正常分派。文本为空且
未保留任何图像时，也会停止正常分派。处理程序显式安排的工作
若通过 `sendUserMessage` 或 `sendMessage` 提交，不会被丢弃。

这是输入入口事件，不是用户角色消息事件。队列投递和重放
不会再次发出此事件。通过程序调用 `sendUserMessage`/`sendMessage`，以及
合成续接，都不会自动发出 `input`。主会话中用 Enter 提交的
`.`/`c` 续接快捷方式仍走合成路径。聚焦子代理时，
输入仍只路由到聊天，不调用主会话的输入钩子。
打印模式和 ACP 的输入不在此拦截约定内。

Ctrl+Enter 会先分离本次提交的草稿，再等待原生处理程序，因此
另一次提交不会复用它，之后的普通输入也会作为新草稿保留。
若输入被处理程序接管或内容为空，只消耗已分离的那次提交。分派失败时，
会恢复其文本和附件，并保留更新的草稿。这并不意味着
可按 Esc 取消既有的交互式输入处理链。
内置的提交清理也会保留更新的草稿，包括 `/clear`
和 `/new`。命令仍保留各自显式的预填及会话转换行为。

### 工具生命周期 \{#tool-lifecycle}

- `tool_call`（执行前触发，可阻止执行、修改工具执行时的 `input`，或返回被动 `additionalContext`。对模型发起的调用，此事件在智能体循环准备参数时触发，因此修改后的参数会重新校验，且并发调度、执行事件、持久化的助手消息和审批环节都会看到该修改。未阻止调用的处理程序返回的被动上下文，会在该批次的工具结果之后、下一次模型提供方请求之前，按助手调用顺序投递）
- `tool_result`（执行后触发，可修改 content、details 或 isError，或返回被动 `additionalContext`。即使 `event.isError` 为真，结果上下文也在工具输出之外投递，因此针对失败的处理程序可以引导模型的下一步）
- `tool_execution_start` / `tool_execution_update` / `tool_execution_end`（用于观测）
- `tool_approval_requested` / `tool_approval_resolved`（用于观测。仅当工具需要审批、且已注册审批处理程序时，才由 `wrapper.ts` 发出）

`tool_call` 和 `tool_result` 用 `toolCallId` 标识调用。在 JS 或 Python 求值单元或内核定义的工具调用会话工具时，两个事件都额外携带 `parentToolCallId`：它是发起嵌套调用的那次调用的 ID，不是定义该工具的求值操作 ID。直接调用省略此字段。

`tool_result` 采用中间件式处理：处理程序按扩展顺序运行，每个处理程序都能看到此前的修改。每个处理程序返回的非空且不重复的 `additionalContext` 按注册顺序保留，比较时忽略首尾空白，重复项丢弃；这些上下文在该调用的 `tool_call` 上下文之前投递。

### 计划审查生命周期 \{#plan-review-lifecycle}

- `plan_review_requested` 报告交互式计划审查的 `reviewId`、会话、标题、计划路径和内容，以及按显示顺序排列的选项。选项 ID 固定（`execute`、`compact`、`keep`、`refine`、`save`），标签可以变化。`keep` 携带当前 token 数，按审查打开时所选档位的上下文窗口衡量（移动滑块会重新测量；用 `ctx.getPendingPlanReview()` 读取当前状态）。扩展可通过 `ctx.resolvePlanReview(...)` 回答，此时终端选择器仍可使用；以最早的答复为准。`save` 用默认文件名保存计划，不打开路径提示，并保持审查打开，仍可作答（不触发 `plan_review_resolved`）。只有计划包含批注时，浮层才显示「细化」；`refine` 只要带 `input.feedback`，无论是否有批注都会被接受。
- 扩展批准计划时，使用 `input.role` 指定的档位；若省略 `role`，则使用浮层中模型滑块当前选中的档位。`plan_review_requested` 列出可选 `tiers`（`role`、`provider`、`model`，以及角色固定思考档位时的 `thinkingLevel`；不足两个可解析档位时不提供）。审批按选中时的计划执行：有浮层内编辑时使用编辑后的版本，否则从磁盘重新读取计划文件。实际执行的内容可能与报告的 `planContent` 不同；扩展可以在回答前写入计划文件，以执行自己修订的版本。
- 档位顺序遵循配置的角色切换顺序，不取决于所选档位。若 `default` 可用，滑块初始选中它；远程传入 `input.role` 会更新显示档位并提交答复，之后的终端输入无法再更改它。
- `plan_review_resolved` 报告审查关闭的方式，包含所选选项 ID（被关闭，或因切换会话、替换审查或关闭会话而取消时，为 `undefined`）及 `by: "local" | "extension"`。该事件在浮层真正关闭时发出，此时所有 `plan_review_requested` 处理程序均已返回。因此，`plan_review_requested` 处理程序应将耗时工作交给其他任务（如一次远程往返或一个 `ctx.ui` 对话框），而不应等待其完成。

### 模式生命周期 \{#mode-lifecycle}

- 内置模式变更提交后，`mode_changed` 报告 `{ previous, state }`（与 `ctx.sessionModes.getState()` 的结构相同），不论变更来自 `ctx.sessionModes.set()`、斜杠命令、目标工具、目标自动完成还是恢复会话。切换会话时，会在切换稳定后报告一次，内容是目标会话恢复后的各模式。目标的 token 和时间统计不是状态的一部分，因此不会触发此事件。处理程序可调用 `ctx.sessionModes.set()`；若有另一次转换仍在运行，则返回 `busy`，不会等待。

### 子代理生命周期 \{#subagent-lifecycle}

- `before_subagent_spawn` → `{ model?: string | string[]; block?: boolean; reason?: string; note?: string }`。每启动一个子代理（`task`、求值中的 `agent()`、工作池工作进程），都会在父会话中恰好触发一次。它在分派时、子代理解析模型之前触发，从不在前端预检时触发，因此有状态的路由器（如轮询或配额路由器）每个子代理只推进一次。事件携带 `agent`、`invocationKind`、`modelRole`（展开前的角色别名，如有）、内核原本会使用的展开后 `patterns`，以及可选的稳定 `spawnKey`。返回 `model` 会替换启动时按尝试顺序排列的模型模式，但保留角色身份；剩余条目因此成为子代理的重试回退链。处理程序按扩展顺序运行，以最后返回的 `model` 及其 `note` 为准。任务界面会将该说明作为启动路由原因显示在运行中、异步及已结束的条目上。`block: true` 会用 `reason` 拒绝启动。取消启动会停止等待尚未返回的处理程序（丢弃结果，并关闭待完成的 `ctx.ui` 对话框），不会等到处理程序超时才结束启动流程。

### 可靠性与运行时信号 \{#reliabilityruntime-signals}

- `auto_compaction_start` / `auto_compaction_end`
- `auto_retry_start` / `auto_retry_end`
- `retry_fallback_applied`：自动重试切换模型或模型提供方时，载荷为 `{ from, to, role, reason? }`
- `retry_fallback_succeeded`：请求在回退目标上成功时，载荷为 `{ model, role }`
- `ttsr_triggered`
- `todo_reminder`
- `goal_updated`
- `credential_disabled`

### 链接激活 \{#link-activation}

- `link_activate`：载荷为 `{ url, scheme }`。当用户点击链接或使用提示标签选择链接，且该链接的方案由此扩展通过 [`registerLinkScheme`](#extension-link-schemes) 声明时触发。只投递给该扩展，不受处理程序时限限制。`url` 不可信：模型可以写出这种链接，应当像验证用户输入一样验证它。

### MCP 通知 \{#mcp-notifications}

- `mcp_notification`：每次从已连接的 MCP 服务器收到 JSON-RPC 通知时触发，但在管理器自行处理已知的列表或更新方法之后才发出（`notifications/tools/list_changed`、`notifications/resources/list_changed`、`notifications/resources/updated`、`notifications/prompts/list_changed`）。未知方法或服务器自定义方法也会投递。载荷为 `{ server: string; method: string; params: unknown }`。多个扩展可以订阅；某个处理程序抛出异常不会阻止其他处理程序触发。首次添加监听器之前收到的通知会进入有界的先进先出缓冲区（上限 100 条，满时丢弃最旧的一条），然后全部投递给第一个订阅者。因此，即使扩展在 MCP 发现之后才绑定，仍能收到缓冲区中的启动阶段消息。

将支持推送的 MCP 桥接为会话引导消息：

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

运行时先处理 JSON-RPC 传输及自身的列表或更新刷新，随后运行处理程序。处理程序可用 `pi.sendMessage` / `pi.sendUserMessage` 在轮次中途注入引导消息。

### 拦截用户命令 \{#user-command-interception}

- `user_bash`（用 `{ result }` 覆盖）
- `user_python`（用 `{ result }` 覆盖）

### `resources_discover` \{#resources_discover}

`resources_discover` 存在于扩展类型和 `ExtensionRunner` 中。
当前运行时说明：`ExtensionRunner.emitResourcesDiscover(...)` 已实现，但当前代码中没有 `AgentSession` 调用点会调用它。

## 工具编写细节 \{#tool-authoring-details}

`registerTool` 使用 `ToolDefinition`，定义见 `types.ts`。其 `parameters` 字段接受 omptype 结构定义；为旧版扩展注入的 TypeBox 兼容层仍可使用。

优先在工厂函数中注册，但随后发现的工具（例如在会话事件
`session_start` 中发现）也会挂载到当前注册表。在已分派事件的处理程序内
进行的注册，会在该处理程序完成前全部应用；
`await pi.setActiveTools(...)` 也会等待待处理的注册。受限制的
子代理不允许使用扩展工具，包括后来注册的工具。宿主 RPC
和 SDK 的自定义工具优先于与之冲突的扩展工具。

当前的 `execute` 签名：

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

`tool_call` 处理程序可以返回 `additionalContext`，而不改变工具结果：

```ts
pi.on("tool_call", async event => {
	if (event.toolName === "search") {
		return { additionalContext: "Use this result before searching again." };
	}
});
```

`additionalContext` 携带处理程序编写的可信指令，用于下一次模型提供方请求。
宿主会在工具结果之后发出这些指令；所选传输层支持时，使用开发者或系统优先级。
会在两个层级丢弃重复项，比较时忽略首尾空白：同一次调用中，某个处理程序的值
与更早的处理程序相同，或同一批次中，某次调用拼接后的上下文与更早调用的上下文
相同。原始工具输出和其他不可信数据必须保留在普通工具结果中。

每个未阻止调用的处理程序返回的非空且不重复的上下文，按注册顺序保留。OMP 会等待
工具批次结束，再按助手发起工具调用的顺序，在对应工具结果之后、
下次模型提供方请求之前发出上下文。只有调用实际执行并返回非错误结果时，
才会投递处理程序的上下文。如果当前或后续处理程序阻止调用、
审批提示拒绝调用、中断导致调用被跳过，或调用失败，则丢弃为它收集的
上下文。

已注册的工具可以在执行期间通过
`ctx.addAdditionalContext?.("...")` 添加上下文。即使工具随后返回错误，工具自行添加的上下文
也会保留。在同一次调用中，工具自身的上下文（包括作为命令在嵌套 `bash` 调用中运行的工具）先于 `tool_call` 处理程序的上下文。
Cursor 在其执行通道上发起的调用，会在缓冲结果之后、下一次
向模型提供方发出请求时投递上下文。

### 委派给原生内置工具（`ctx.invokeTool`） \{#delegating-to-a-native-built-in-ctxinvoketool}

用内置工具名称重新注册的工具（例如包装 `write` 以添加日志或策略检查），可以
直接运行原始工具，无需重新实现。注册的工具覆盖某个内置工具时，传入的 `ctx`
会为 `execute` 提供以下接口：

```ts
ctx.invokeTool?<TDetails>(
  params: Record<string, unknown>,
  options?: { signal?: AbortSignal; onUpdate?: AgentToolUpdateCallback },
): Promise<AgentToolResult<TDetails>>
```

它会运行与你的工具同名的**原生**内置工具。委派仅限同一个工具，
因此不能访问任意目标，也不能超出本次调用已授予的审批权限。它会
返回原生工具的结果，并保留其自身的副作用和内部记录。
默认继承外层调用的中止信号、进度回调及工具和模型提供方的
元数据；显式指定 `signal` / `onUpdate` 可覆盖对应通道。仅在
存在同名原生内置工具时才提供此方法。若工具完全是新增的、未覆盖任何内置工具，`ctx.invokeTool` 为 `undefined`。
原生调用不会重新进行审批，因为该工具就是已获批准的同一个工具；
委派深度设有保护，避免意外的自递归。

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
		// optional TUI render
	},
	renderResult(result, options, theme, args) {
		// optional TUI render
	},
});
```

`renderCall` 的 `options` 参数也实现了 `Theme` API。因此，从上游 pi 移植、声明为 `renderCall(args, theme, context)` 的工具渲染器无需重写，也能正确应用样式。

`tool_call`/`tool_result` 在 `sdk.ts` 中拦截注册表工具，包括内置工具
与扩展或自定义工具。审批策略可在
`tool_call` 之前拒绝调用。被阻止或拒绝的调用不会执行，也不发出正常的执行后结果钩子。

`ToolDefinition` 的其他字段包括：

- `hidden`、`defaultInactive`：除非明确请求，否则不自动启用。
- `loadMode`：新工具名称默认为 `"discoverable"`；已知的必备内置工具名重新注册时，若未显式指定模式，则保留 `"essential"`（参见 `tools/essential-tools.ts`）。显式模式优先。
- `deferrable`、`readsSkillUris`、`strict`。
- `approval`：默认为 `"exec"`；接受审批级别、决定对象或根据参数作出决定的函数。
- `mcpServerName`、`mcpToolName`、`legacyName`、`sourcePath`：发现、审批及来源元数据。
- `shellEnv`：用于交互式用户 Shell 的环境变量值。
- `renderCall`、`renderResult`：TUI 组件。
- `describeCall`、`describeResult`：用于 TSP 终端的语义化工具视图。

### 文件写入回退（`registerFileWriteFallback`） \{#file-write-fallback-registerfilewritefallback}

`write`、`edit` 和 `apply_patch` 通过同一个原语，实际将字节写入
普通文件路径
（`file ? file.write(content) : Bun.write(dst, content)`）。此原语因
权限错误（`EPERM`/`EACCES`/`EROFS`，其他错误如
`EISDIR` 不受影响）失败时，编程智能体会先查询通过
`pi.registerFileWriteFallback` 注册的处理程序，再决定是否放弃：

```ts
import type { FileWriteFallbackHandler } from "@oh-my-pi/pi-coding-agent";

const writeThroughBroker: FileWriteFallbackHandler = async (req, ctx) => {
	// req: { dst: string; content: string; cause: unknown; sessionId: string | undefined }
	const ok = await myPrivilegedWriter.write(req.dst, req.content);
	return ok;
};

pi.registerFileWriteFallback(writeThroughBroker);
```

处理程序按注册顺序运行。第一个兑现为 `true` 的结果表示
字节已持久写入磁盘，原生工具会像自身写入成功一样继续，
包括以真实目标路径为键记录其文件快照，使之后在该路径运行的 hashline
`edit` 仍能工作。若某个处理程序抛出异常，会记录日志，
跳过它并尝试下一个。跳过以处理程序为单位，同一扩展后来注册的
处理程序仍会运行。如果所有处理程序都
返回 `false`（或没有注册任何处理程序），则重新抛出原始错误。
如果 Bun 把被拒绝的父目录 `mkdir` 隐藏为 `ENOENT`，
且原始错误没有 `cause`，会将找回的拒绝错误作为其原因。此机制适用于这样的宿主：
将智能体嵌入禁止直接写入文件系统、但向宿主开放特权写入通道的
沙箱中。

`req.dst` 是**解析符号链接后得到的**目标，并非工具最初收到的路径。
内核会跟随末级之前的每个路径分量，因此若访问 `ws/link/file` 时遇到
`ws/link -> /elsewhere` 链接，实际目标在 `ws` 之外，但仍看起来像在工作区内。
处理程序若只使用前缀允许列表，便会放行这个看似无害的路径。
写入也会跟随末级分量，因此末级同样会解析；删除则不会，
因为 `unlink` 移除的是链接而非其指向的对象（所以删除时的
`req.dst` 可能就是链接）。应以 `req.dst` 为准，不要根据其他信息
重新推导目标。如果无法确定真实目标，
例如末级是失效链接，或当前进程无法解析某个祖先目录，
就不会查询任何处理程序，而是重新抛出原始错误，因为没有可交给
特权写入程序的目标。

对于宿主不允许直接写入的目标，有两点需要注意：

- **父目录不存在。** `Bun.write` 会自行创建缺失的父目录。
  如果被拒绝的是该 `mkdir` 操作，它会报告后续
  `open()` 的 `ENOENT`，而不是权限拒绝。智能体会显式重做 `mkdir`，
  以取得真实的错误码，因此仍会调用处理程序，并且
  `req.cause` 会设为 `mkdir` 的拒绝错误。此时 `req.dst` 的父目录尚未
  存在，由处理程序负责创建。若 `ENOENT` 涉及确实可创建或无效的父目录，
  则不会转交给处理程序。（`apply_patch` 在写入前会单独创建父目录；
  如果注册了回退处理程序，该 `mkdir` 允许继续处理权限拒绝，
  因而写入仍会交给处理程序。）
- **hashline `MV` 操作。** `edit` 的移动操作直接写入目标，
  不经过 LSP 直写通道。它会路由到同一组处理程序，删除源文件的
  unlink 操作走下文的删除接口，因此也能从不可写入的目录
  移出文件。

这一机制并不拦截智能体能发起的每一种写入。以下操作的
权限错误仍按原有方式报告，不会查询处理程序：

- `write` 写入归档成员（`foo.zip:entry`）或 SQLite 数据行。两者都不是
  将字节写入 `dst`：重写归档会读取整个归档、替换一个条目、
  写入临时文件，再重命名以覆盖原件，因此落盘的是整个二进制容器，
  而不是工具收到的字符串；SQLite 写入是在数据库引擎内执行
  行操作，根本没有字节载荷。为任一操作提供代理，
  都需要不同于「把这些字节写入此路径」的请求结构。
- ACP 桥接的 `writeTextFile`，它将写入交给远程客户端。
- `lsp` 工具自身的写入：应用工作区编辑或代码操作，以及
  Biome 格式化器。后者先写入缓冲区，再通过 Shell 执行 `biome format
--write`；这是子进程写入，任何进程内接口都无法拦截。

### 文件删除回退（`registerFileDeleteFallback`） \{#file-delete-fallback-registerfiledeletefallback}

文件删除和写入使用不同的原语，删除也有独立的回退接口：

```ts
pi.registerFileDeleteFallback(async (req, ctx) => {
	// req: { dst; cause; confirmedFile; sessionId } — no `content`.
	return await myPrivilegedWriter.unlink(req.dst);
});
```

该接口覆盖 `edit` 的 `REM`、hashline `MV` 的源文件删除，以及 `apply_patch` 的
删除操作，并遵守与写入接口相同的规则：权限错误码相同，第一个
`true` 生效，抛出异常的处理程序会被跳过，没有处理程序成功时重新抛出
原始错误，未注册处理程序时不触发任何回退。两者有两点区别：

- **`ENOENT` 从不转交给处理程序。** 执行 unlink 不会创建任何内容，因此
  缺失文件确实不存在；`REM` 会将其转换为未找到错误。
- **处理程序必须使用 unlink，不能递归删除。** 在 macOS 上，对目录执行 `unlink` 会报告
  `EPERM`，仅靠错误码无法与沙箱拒绝区分，
  因此该接口会对目标执行 `lstat`，拒绝转交目录。但如果
  目标本身的元数据也受阻于拒绝 unlink 的同一访问边界，
  这在沙箱中很常见，就无法完成该检查，此时 `req.dst` 可能是
  目录。只有接口明确确认目标为普通常规文件时，`req.confirmedFile` 才为 `true`；
  符号链接也会报告 `false`，因为移除链接本身没有问题，但解析链接后会作用于
  完全不同的对象。特权辅助程序若递归移除
  `req.dst`，或先解析为真实路径再删除，会远超仅要求删除一个文件的
  工具所请求的范围。

**删除注册和写入注册有意分开。**
写入处理程序会把 `req.content` 交由代理写到 `req.dst`；如果把删除请求交给它，
缺少内容可能使它执行空写入，将本应移除的文件 _截断_，
而不是删除。因此，只注册了写入的处理程序不会收到删除请求。

两种回退接口均受以下生命周期约束：

- **在扩展加载期间注册**（从默认工厂函数中调用），与其他
  `register*` 调用相同。`ExtensionRunner.initialize` 运行时会安装处理程序；
  此时尚未注册任何内容的扩展会被整体跳过，因此之后才执行的
  首次注册不会生效。处理程序收到的 `ctx` 会为每次调用单独构建，
  而不是在安装时捕获，因此 `ctx.cwd` 和 `ctx.hasUI` 反映
  写入或删除被拒绝时的会话状态。工作区变化（`/move`）会
  反映到下一次请求，不会固定为加载时的状态。
- **注册表在整个进程中共享。** 一个进程可以托管多个会话（子代理
  有自己的运行器），因此进程中任一会话的写入或删除被拒绝时，
  都可能调用处理程序，而不只是注册它的扩展所属会话。
  这是有意设计的：宿主只在顶层会话注册一次，也可以预期其
  子代理的写入经代理处理，包括未继承扩展工厂函数的会话。
  受限制的子代理保留父会话加载的钩子，但不发现环境中的扩展。
  `req.sessionId` 标识发起写入或删除的会话（并非来自工具调用时为
  `undefined`），而
  `ctx.sessionManager.getSessionId()` 标识处理程序所属的会话。应比较两者，按会话
  作出决定。提问前尤其要注意：`ctx.ui` 属于
  处理程序的会话，不一定属于请求所涉及的会话。处理程序会在
  `session_shutdown` 时移除。

未注册任何处理程序时，不会触发上述机制。原语完全按原有方式运行，
不执行额外的系统调用。

## UI 集成点 \{#ui-integration-points}

`ctx.ui` 实现 `ExtensionUIContext` 接口。各模式的支持情况不同。

### 交互模式（`extension-ui-controller.ts`） \{#interactive-mode-extension-ui-controllerts}

支持：

- 对话框：`select`、`confirm`、`input`（遵循 `ExtensionUIDialogOptions.secret`，用圆点遮蔽输入字符）、`editor`、可选的 `askDialog`
- 输入区编辑：`setEditorText`、`getEditorText`、`pasteToEditor`、`editor`；`supportsEditor` 表示粘贴是否会更新本地或远程输入区（缺失表示不支持）
- 自动补全叠加：`addAutocompleteProvider(factory)` 包装编辑器的内置补全提供方（工厂函数按注册顺序应用，每次刷新斜杠命令时重新应用）
- 终端标题和工作消息（`setTitle`、`setWorkingMessage`）
- 通知、状态、编辑器文本、终端输入和自定义浮层
- 按名称列出或加载主题（`setTheme` 支持字符串名称）
- 切换工具展开状态
- `rerenderMessage(timestamp)`：再次绘制具有该 `message.timestamp` 的助手回复，重新运行[助手文本渲染器](#assistant-text-renderer)；`extensionRenderers.assistantText` 关闭时不执行操作
- `refreshTranscript(ids)`：再次请求[会话记录呈现器](#transcript-presenter)提供这些 ID 的块，并重绘显示内容有变化的块
- `getLinkClicksAvailable()`：当前点击或通过提示标签选择[已声明的链接](#extension-link-schemes)，是否会触发 `link_activate`

该控制器中当前不执行操作的方法：

- `setFooter`
- `setHeader`

`ctx.ui.setEditorComponent(factory)` 会接入当前编辑器。工厂函数
必须返回 `CustomEditor` 的子类，而非普通的 `Editor`/`EditorComponent`。
`ctx.ui.getEditorComponent()` 返回当前安装的工厂函数（内置编辑器则返回
`undefined`），因此扩展可以包装另一个扩展提供的编辑器，
而非替换它；在工厂函数内部调用时，它仍会返回
前一个工厂函数。
`setWidget` 可通过
`setHookWidget(...)` 在编辑器上方或下方渲染小组件（`placement: "aboveEditor" | "belowEditor"`；字符串数组最多显示
10 行内容及一条截断提示）。传入 `undefined` 可移除
小组件。`setEditorText` 和 `pasteToEditor` 会在修改编辑器后请求
重绘。

#### 启动终端命令 \{#launching-terminal-commands}

`ctx.ui.openTerminal(request)` 仅在交互式 TUI 中可用。它会创建
多路复用器窗格或后端原生分组（tmux 窗口、Zellij/Herdr/Orca 标签页，或 CMUX
工作区，均非操作系统窗口），并返回后端报告的原生 ID。若后端已启动命令却无法在请求的位置显示，也会返回 `warning`。
RPC、ACP、
打印和无界面上下文不提供此可选方法。请求类型和
受支持的后端集合由标准启动能力定义决定：支持 tmux、Zellij、
Herdr、CMUX 和 Orca；多路复用器分类仍能识别 screen 和 wmux，
但目前不支持它们。

各后端的会话检测集中在
`@oh-my-pi/pi-tui/terminal-multiplexer`，其中每个多路复用器注册一个模块。
`hasTerminalMultiplexerSession(provider, env)` 检查显式会话标记，
`classifyTerminalMultiplexer(env)` 则判定托管当前进程的多路复用器：先检查会话
标记，再用 `tmux`/`screen` 的 `TERM` 作回退，最后检查外层应用，例如
Orca。因此，运行在 Orca 内部的多路复用器优先。`isInsideTerminalMultiplexer(env)` 仅在
判定的多路复用器拥有屏幕网格时为真；Orca 保留
直接终端渲染路径。识别出多路复用器并不能证明有嵌套的
后端会话或原生窗格 ID。

TUI 宿主会注入此能力，扩展无需导入分派器代码
即可使用。

OMP 的内置调用方可将 `classifyTerminalMultiplexer(env)` 的结果传给
`getTerminalLaunchPlacement(...)`，以获取支持情况和呈现元数据；也可将其作为
`createDefaultTerminalLaunchRequest(...)` 的第一个参数，生成经过验证的
后端默认请求。工厂函数还接收放置方式、命令 argv、cwd 和可选的
Shell 语法确认。两个辅助函数均由
`src/subprocess/terminal-launch.ts` 导出。
放置方式查询返回后端显示名称、面向用户的分组标签（如
`pane`、`tab` 或 `workspace`），以及所需的 Shell 语法。如果没有检测到
多路复用器，或后端不支持该放置方式，则返回错误。请求工厂函数
返回 `{ request }` 或 `{ error }`，会验证构造的请求，并
留空后端专属的目标、焦点、方向和执行选项，以便后端
采用自己的默认值。对于通过 Shell 输入启动的请求，传入 `shellGrammar: "posix"` 前
必须确认目标 Shell 使用 POSIX 语法。工厂函数会拒绝
缺少该声明的请求。扩展仍可通过 `ctx.ui.openTerminal(...)` 使用
显式的带类型请求。

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

目标采用后端的原生 ID 或引用，含义随放置方式而异：

- tmux 窗格的目标是窗格 ID，默认为 `TMUX_PANE`；新窗口的
  目标是会话名称或 ID，在当前 tmux 会话内可省略。
  即使未设置 `TMUX`，显式窗格或会话目标也能交给 CLI 寻址。
- Zellij 窗格可指定现有标签页 ID（要求 Zellij 0.44.1 或更新版本）。
  创建标签页没有目标选项。两种操作都需要处于活动的 `ZELLIJ` 会话。
- Herdr 窗格的目标是窗格 ID，默认为 `HERDR_PANE_ID`；标签页的
  目标是工作区 ID，默认为 `HERDR_WORKSPACE_ID`。目标
  必须位于活动的 Herdr 窗格或工作区中。
- Orca 拆分窗格时，将 `ORCA_PANE_KEY` 解析为当前终端句柄；
  检测时需要同时存在 `ORCA_PANE_KEY` 和 `ORCA_WORKTREE_ID`。创建标签页
  默认使用工作树 `id:<ORCA_WORKTREE_ID>`；仅有应用标签不足以
  检测 Orca 会话。目标、标题和命令均以
  `--flag=value` 形式传递，因此以 `--` 开头的值仍作为数据处理。
- CMUX 窗格的目标是界面 ID，工作区的目标是窗口 ID。
  对应的 CMUX 上下文处于活动状态时，两种目标都可以省略。
  显式指定的界面目标优先，不会与当前环境中的工作区合并。
  仅有套接字路径和传输标记，不足以确定有活动的
  本地 CMUX 界面。

不受支持的目标组合会报错，不会被忽略。能力检查
使用后端身份标记或原生目标，而不只依赖 `TERM`。`focus` 控件
只在放置方式支持时生效：为假时，tmux 使用 `-d`，Zellij 使用
`--no-focus`（要求 Zellij 0.45.0 或更新版本）；Herdr 使用 `--focus`/`--no-focus`，CMUX
在拆分窗格和创建工作区时都传入 `--focus true|false`。Orca 创建标签页时，
将 `focus: true` 映射为 `--focus`；否则按 Orca 的默认规则处理焦点。Orca 拆分
窗格没有焦点选项。若 Orca 无法显示新标签页，它会在后台终端
启动命令，并在结果的 `warning` 中说明。

各后端的执行方式不同。tmux 直接执行多参数命令，但会通过其
配置的 `default-shell -c` 运行单参数命令。该 Shell 可能是 fish、Nushell
或其他非 POSIX Shell。对于单参数直接启动，分派器会添加前缀
`/usr/bin/env --`，让带空格、前导连字符或 Shell 元字符的可执行文件名
仍作为数据处理。若单参数可执行文件名含有 `=`，则拒绝请求，
因为 `env` 会将其解释为赋值表达式。`execution: "shell"` 使用 POSIX 引用规则处理 argv，
并用 `/bin/sh -c` 运行，不受 `default-shell` 影响。tmux 会对启动目录做格式展开，
因此分派器会将每个 `#`（出现在 `cwd` 中）作为 `##` 传递。Zellij 支持
直接执行 argv。如果某个 Zellij 选项需要比已安装 CLI 更新的版本，
例如旧于 0.44.0 时的标签页放置、旧于 0.44.1 时的 `target`，以及旧于 0.45.0 时的 `focus: false`，则在创建任何内容前失败，
错误会说明所需版本。分派器在每个进程中只运行一次 `zellij --version` 来检查
版本。

Herdr 的 `pane run` 向目标交互式 Shell 键入文本，因此适配器会将
按 POSIX 规则引用过的 argv 写入临时目录中私有且可自行删除的 `/bin/sh` 脚本，
并只键入其绝对路径。任何能运行裸路径的交互式 Shell
（POSIX Shell、fish、Nushell）都会按原样启动 argv，因此 Herdr
请求不接受 `shellGrammar`。Windows 上会拒绝 Herdr 启动请求。

CMUX 的 `--command` 和 Orca 的 `terminal split`/`terminal create`
会将 Shell 命令文本提交给目标交互式 Shell，而非
直接启动 argv。因此，它们的请求需要 `shellGrammar: "posix"`。
只有确认目标 Shell 接受 POSIX 语法后才设置此项。
不会从本地操作系统或 `$SHELL` 推断，也不会猜测配置了哪个 Shell。
未作此声明时，请勿请求 CMUX 或 Orca 启动。
声明后，argv 各参数会使用共享的 POSIX Shell 引用辅助函数处理。
Orca 的拆分和创建命令没有 `--cwd` 选项，因此适配器会在
经过引用的命令前添加 `cd <quoted-cwd> &&`，再一并放入 `--command`；CMUX 拆分也会
先在其 Shell 内切换目录，再输入命令。不保证这些引用规则
适用于 Nushell、PowerShell、`cmd.exe` 或其他 Shell 语法。
Orca CLI 按 Orca 文档规定的顺序解析：已设置时使用 `ORCA_CLI_COMMAND`；
其次使用 `orca-dev`（在 `ORCA_DEV_REPO_ROOT` 所指的 Orca 开发检出目录中）；或使用 `orca-ide`（在 Linux 上且不处于 Orca 终端内）；
其他情况使用 `orca`。

由于这些命令作为终端输入提交，通过 Shell 输入启动的请求
会在创建窗格或工作区前拒绝命令参数中的 C0/C1 控制字节和 DEL；
CMUX 和 Orca 也会拒绝 `cwd` 中的这些字节，因为目录会嵌入其
Shell 命令。这一限制不适用于直接传给 tmux 或 Zellij 的 argv，
因为其中的参数换行符仍是数据，而不是终端输入。

Herdr、Zellij 和 Orca 的 `window` 放置方式会创建标签页；CMUX 会创建工作区。
后端专属字段包括窗格方向、Zellij 浮动窗格或名称、
Herdr 标签页名称和 CMUX 工作区名称。Zellij 浮动窗格不能指定
拆分方向，创建 Zellij 标签页时不能将标签页指定为目标。tmux 会返回
必需的窗格（`%...`）或窗口（`@...`）ID。Zellij 0.44.0 及更新版本会报告窗格 ID，
格式为 `terminal_<id>`，标签页 ID 则为数字字符串。较旧的 Zellij 在启动窗格时不报告 ID，
因此无法取得 `result.id`；Herdr 要求在
JSON 响应中包含窗格或标签页 ID。CMUX 会在有 ID 时报告工作区或窗格 ID，
但 JSON 响应可能省略 ID，此时 `result.id` 不可用。
Orca 通过 `result.split.handle` 返回窗格句柄，或通过
`result.terminal.handle` 返回标签页句柄。顶层 JSON 的 `id` 是 RPC 请求 ID，
而非终端句柄。

`cwd` 必须为绝对路径。请求若不是对象，或指定了未知的
多路复用器或放置方式，会以 `TypeError` 拒绝。其他失败，包括已识别的
后端或放置方式不支持启动，都会以经过脱敏的
`TerminalLaunchError` 拒绝，并在可获取时注明后端、操作和退出状态；
不会包含命令 argv 或 CLI 输出。收到格式有误的 JSON 响应时，CMUX 和 Orca
会直接拒绝，不会重试创建。

没有共享的环境覆盖项。每个多路复用器使用自己的
环境传播规则；分派器不会统一构造环境变量继承行为。
对于直接执行的后端，请求的 argv 仍分开传递。只有通过 Shell 输入的
后端才会把 argv 转换成 Shell 文本，而且必须声明采用 POSIX 语法。

### RPC 模式（`rpc-mode.ts`） \{#rpc-mode-rpc-modets}

`ctx.ui` 由 RPC 的 `extension_ui_request` 事件支持：

- 对话框方法（`select`、`confirm`、`input`、`editor`）等待客户端返回响应；`input` 将 `ExtensionUIDialogOptions.secret` 作为未经协商的宿主提示（`secret?: boolean`），通过 `extension_ui_request` 帧转发
- 不等待响应的方法会发出请求（`notify`、`setStatus`、面向字符串数组或移除操作的 `setWidget`，以及 `setEditorText`（对应 `method: "set_editor_text"`））；`pasteToEditor` 回退到 `setEditorText`
- 仅当 `setTitle` 检测到 `PI_RPC_EMIT_TITLE` 为 `1`、`true`、`yes` 或 `on`（不区分大小写）时，才发出请求

在 RPC 实现中不支持或不执行操作的功能：

- `onTerminalInput`
- `custom`；可选的 `askDialog` 不提供
- `getEditorText` 返回 `""`；`getEditorComponent` 返回 `undefined`
- `setFooter`、`setHeader`、`setEditorComponent`、`addAutocompleteProvider`
- `setWorkingMessage`
- 切换或加载主题（`setTheme` 返回失败）
- 工具展开控件不生效

### 打印、无界面和子代理路径 \{#printheadlesssubagent-paths}

运行器初始化时若未提供 UI 上下文，`ctx.hasUI` 为 `false`，各方法不执行操作或返回默认值。`--mode rpc --no-ui` 和 `--mode rpc-ui --no-ui` 下，扩展均采用这一方式；`rpc-ui` 的工具对话框仍启用。

### ACP 模式 \{#acp-mode}

ACP 安装通过征询请求桥接的 UI 上下文（`createAcpExtensionUiContext` 定义在
`modes/acp/acp-agent.ts` 中）。`ctx.mode` 为 `"rpc"`，`ctx.hasUI` 为 `true`。
`select`/`confirm`/`input`/`editor` 和可选的 `askDialog` 会通过 ACP 表单
征询往返请求；客户端不支持 `elicitation.form` 时返回默认值。`input` 返回 `undefined` 且不发出表单征询的条件是 `dialogOptions.secret` 为 `true`。
不涉及征询的功能（小组件、编辑器控制、主题、终端输入和
自动补全叠加）不执行操作；`notify` 会记录调试级通知。

## 会话与状态模式 \{#session-and-state-patterns}

持久保存扩展状态的方法：

1. 用 `pi.appendEntry("com.example.my-extension.state", data)` 持久化。`customType` 命名空间是全局的：请使用带包名或反向域名限定的值，避开 [`custom` 会话条目参考](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/session.md#custom)中列出的内核保留值。
2. 在 `ctx.sessionManager.getBranch()` 中读取数据，并在 `session_start`、`session_branch`、`session_tree` 时重建状态。
3. 如果状态需要能从工具结果历史中查看或重建，请让工具结果的 `details` 保持结构化。

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

### 会话条目角色（`message.role` 用小驼峰命名） \{#session-entry-roles-messagerole-is-camelcase}

遍历 `ctx.sessionManager.getBranch()` 时，每个持久化条目都有一个 `type`
（`message`、`custom_message`、`branch_summary`、`compaction` 等；
参见[会话条目模型](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/session.md#entry-taxonomy)）。`type: "message"`
条目包含 `AgentMessage`（位于 `entry.message` 下），其 `role` 判别字段使用
**小驼峰命名**，而不是原始大语言模型传输格式或上文
`tool_call` / `tool_result` **钩子**名称所用的下划线命名：

| 持久化的 `entry.message.role` | 含义 |
| --- | --- |
| `user` | 用户轮次或工具反馈轮次。 |
| `developer` | 开发者角色的指令轮次。 |
| `assistant` | 模型轮次。工具调用是 `{ type: "toolCall" }` 块，位于 `content` 中。 |
| `toolResult` | 一个工具的结果，**不是** `tool_result`。包含 `toolCallId` / `toolName`。 |
| `bashExecution` | 独立的 `!` bash 运行。 |
| `pythonExecution` | 独立的 Python 运行。 |
| `hookMessage` | 旧版钩子注入的消息（仅用于迁移，请改用 `custom`）。 |
| `fileMention` | 内联的 `@file` 引用内容。 |

重建后的智能体上下文中，有三种角色来自面向扩展的分支历史专用
来源条目；`getBranch()` 暴露的是这些来源条目：

| 持久化的 `entry.type` | 重建后的 `message.role` | 含义 |
| --- | --- | --- |
| `branch_summary` | `branchSummary` | 已放弃的分支的摘要。 |
| `compaction` | `compactionSummary` | 上下文压缩摘要轮次。 |
| `custom_message` | `custom` | 通过 `pi.sendMessage` 发送的消息 |

`toolCall` 是**内容块类型**，而非角色。工具调用是
`assistant` 消息的 `content` 数组中的一个块，配对的结果则是另一个条目，
其角色为 `role: "toolResult"`。请**原样**匹配这些值：过滤器若使用
下划线命名的常量进行比较，或先将 `role` 转为小写（`"toolResult"` → `"toolresult"`），
就无法匹配任何分支，并会**静默丢弃**该条目，不报错也不记录日志。因此，按
`role` 采集会话时会漏掉所有工具结果，而用户和助手的文本仍能正常通过。

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

## 输入区形态渲染器 \{#composer-shape-renderer}

`registerComposerShape` 将扩展提供的输入编辑器布局加入**外观 → 输入区形态**。请从扩展工厂函数中注册；当前编辑器及设置预览都会使用该渲染器。

```ts
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import type { ComposerStyle } from "@oh-my-pi/pi-tui";

const dockStyle: ComposerStyle = {
	id: "acme-dock",
	sideBorders: false,
	verticalChrome: 1,
	statusAttachment: "none",
	bottomBar: "full",
	bottomBarGap: true,
	defaultPromptGutter: "❯ ",

	defaultPaddingX: () => 0,
	sideChromeWidth: () => 0,
	renderTop: ({ box, width, borderColor }) => borderColor(box.horizontal.repeat(width)),
	renderRow: ({ gutter, text, pad }) => [gutter + text + pad],
	renderBottom: () => undefined,
};

export default function (pi: ExtensionAPI) {
	pi.registerComposerShape({
		label: "Acme Dock",
		description: "Prompt below a single rule",
		style: dockStyle,
	});
}
```

`ComposerShapeDefinition` 包含：

- `label`：必填的选择器标签。
- `description`：可选的选择器说明。
- `style`：完整的 `ComposerStyle` 渲染约定。`style.id` 也是持久化的 `composer.shape` 值。

请使用带包名限定、非空且已去除首尾空白的 `style.id`。内置 ID（`box`、`band`、`claude`、`pi`、`borderless`、`rule`、`field` 和 `rail`）不能替换。扩展之间发生冲突时，后注册者优先。如果扩展不可用但仍配置了其 ID，编辑器会回退到 `box`。

### `ComposerStyle` 布局元数据 \{#composerstyle-layout-metadata}

- `filledSurface`：样式是否通过 `surfaceColor` 绘制行的自有前景色。省略时，扩展拥有的 ID 保留填充行为；设为 `false` 则使用宿主主题的文本色。
- `sideBorders`：内容行是否有两侧边饰。这会影响光标预留空间、输入法布局和滚动条行为，不只是说明。
- `verticalChrome`：用于计算编辑器高度的固定顶部和底部边饰总行数，必须是 `0`、`1` 或 `2`。
- `statusAttachment`：`"top-border"` 接收内嵌状态仪表，`"top-band"` 使用紧贴输入区上方、两端柔和收边的状态条，`"top-rule-chip"` 接收状态栏右侧区块以停靠在横线上，`"none"` 将状态栏与编辑器边饰分离。
- `bottomBar`：编辑器下方的独立状态内容，可用值为 `"none"`、`"left"` 或 `"full"`。
- `bottomBarGap`：编辑器和独立底部状态栏之间是否留一行空白。
- `defaultPromptGutter`：宿主未提供覆盖项时使用的提示文本。
- `defaultPaddingX(themePaddingX)`：为此样式选定的水平内边距。
- `sideChromeWidth(paddingX)`：内容行**每侧**消耗的可见单元格，包括内边距和边框或侧栏字形。

`renderTop` 和 `renderBottom` 返回一行带样式的终端内容或 `undefined`。`renderRow` 返回一行或多行带样式的内容。每个普通渲染行必须恰好占 `ctx.width` 个可见单元格，ANSI 转义序列的宽度为零。保留传入的 `gutter`、`text` 和 `pad`，不要重新排版或截断。

### 渲染器上下文 \{#renderer-context}

所有渲染方法都接收 `width`、`paddingX`、主题的 `box` 字形和三个样式函数：

- `borderColor(text)`：普通边框或横线颜色。
- `accentColor(text)`：为决定轮廓的侧边或端部提供稳定的强调色。
- `surfaceColor(text)`：输入区的背景填充，不受带装饰输入中嵌套的 SGR 重置影响。

如果提供了 `topBorder`，它包含已设置样式的状态内容及其可见 `width`。顶部渲染器决定其位置，最终一行仍必须为 `ctx.width`。

`renderRow` 还接收：

- `gutter`、`text` 和 `pad`：预先渲染好的内容片段。
- `isLastRow`：是否最后一行可见输入。
- `cursorOverflow`：行尾光标从右侧边饰占用的单元格数。
- `imeSafeCursorTail`：省略光标后的右侧单元格，防止终端本地输入法的预编辑移位边饰。
- `scrollbarThumb`：本行与编辑器滚动条滑块相交。

带边框、横线、填充背景及输入法安全布局可参考 `packages/tui/src/components/composer/` 中的内置实现。

## 自定义消息渲染器 \{#custom-message-renderer}

```ts
pi.registerMessageRenderer("my-type", (message, { expanded }, theme) => {
	// return pi-tui Component
});
```

交互式界面显示自定义消息时使用。

### 紧凑行 \{#compact-rows}

渲染器组件可实现 `isTranscriptBlockCompact(): boolean`，对应 `@oh-my-pi/pi-tui/chrome/transcript-container` 中的 `CompactTranscriptBlock` 接口。返回 `true` 时，消息会紧贴相邻的紧凑块。终端不在它们之间绘制空行，Tern 将连续的紧凑行显示为一个没有间隙的块。夹在两个紧凑块之间的空块或隐藏块不会中断它们。

```ts
import { type Component, truncateToWidth } from "@oh-my-pi/pi-tui";

class StatusRow implements Component {
	constructor(readonly label: string) {}
	render(width: number) {
		return [truncateToWidth(this.label, width)];
	}
	isTranscriptBlockCompact() {
		return true;
	}
}

pi.registerMessageRenderer("status", message => new StatusRow(String(message.content)));
```

会话记录每帧都会重新询问，因此返回值可以随展开等状态变化。在普通终端中，滚动历史里的行不会改变。如果一条紧凑消息已滚出可见区域，而紧随其后的块不再紧凑，空行会出现在可见区域中该块上方。如果空行已经进入滚动历史，即使两侧的块后来变为紧凑，它也会保留。

## 助手思考内容渲染器 \{#assistant-thinking-renderer}

```ts
import { Container, Text } from "@oh-my-pi/pi-tui";

pi.registerAssistantThinkingRenderer((context, theme) => {
	const container = new Container();
	container.addChild(new Text(theme.fg("dim", `thinking chars: ${context.text.length}`), 1, 0));
	return container;
});
```

交互式渲染用它在每个可见的助手思考块下添加仅用于显示的补充界面。渲染器接收已可见的思考文本、内容及思考索引、主题，以及供异步渲染器调用的 `requestRender()` 回调。所有返回组件的已注册渲染器依注册顺序追加。渲染器不得修改消息；原始思考块仍是模型提供方和会话使用的准绳。

## 助手文本渲染器 \{#assistant-text-renderer}

需显式启用。仅当 `extensionRenderers.assistantText` 开启时才运行渲染器，默认关闭；入口为 **Tools → Extensions → Extension Reply Renderers**。关闭时不调用渲染器，回复与未注册渲染器时一样绘制。

```ts
pi.registerAssistantTextRenderer(({ message, contentIndex, text, streaming }) => {
	// Return the markdown to draw for this text block, or undefined to draw `text` unchanged.
	return streaming ? text.replace(/\{\{[^}]*$/, "") : text;
});
```

此接口只变换主会话记录中各助手文本块的显示，终端渲染器和原生（TSP）视图都使用它。会话、`/export` 和模型上下文保留文本原样；原生 Copy 操作也复制原始文本。

- **上下文。** `message` 是正在绘制的消息，`message.timestamp` 标识该回复。它是深拷贝，修改任何一层都不会改变已存储的回复。`contentIndex` 是该块在完整回复的 `content` 中的索引，即使回复按工具调用分段绘制也一样。对于工具调用后的文本，`message` 只含那一段，因此 `message.content[contentIndex]` 并不是这个块。`contentIndex` 按回复目前所存储和重放的内容计数：重建会话记录时（例如恢复会话），回复中未取得结果的工具调用以及任何被遮蔽的思考内容都会去掉，后续块向前移，因此同一个块可能得到较小的索引。只在活动会话内用 `message.timestamp` 与 `contentIndex` 作为渲染器状态的键，不要将这一对值持久化为永久键。`text` 是经过较早渲染器后该块目前为止的 Markdown 文本。渲染器按注册顺序运行。
- **流式输出。** 每次绘制流式更新时，调用渲染器并传入到该时刻为止的完整文本（`streaming: true`）。文本达到最终状态时会再调用一次（`streaming: false`），可能是在回复结束时，也可能更早，例如在它之后开始工具调用或任何其他块时。同一帧内到达的多个增量只绘制和渲染一次。若块的文本和 `streaming` 值自上次渲染后都未改变，则复用输出，不重复调用渲染器。例如，工具调用开始时已封闭前一块，而该调用的参数仍在流式传输。渲染器启用时，回复会直接流式传输，不用 `display.smoothStreaming` 的逐字显示，因此渲染器不会看到只显示了一部分的前缀。输出可以比输入短，也可以改变之前画出的文本，因此启用了渲染器的回复在该轮次结束前一直保留在可见视口，不会在流式输出期间把已完成的行送入终端滚动历史。
- **失败。** 如果传入的不是函数，`registerAssistantTextRenderer` 会抛出异常，使扩展加载失败。渲染器抛出异常时，绘制其输入，每个渲染器的失败只记一次日志。
- **重绘。** 渲染器读取的状态变化后（例如点击），调用 `ctx.ui.rerenderMessage(message.timestamp)` 原地重绘该回复。即使某块文本未变，也会再次调用渲染器。仍在可见视口的回复只会重绘可见内容。普通终端中，若回复已有行进入滚动历史，则会重建滚动历史，与切换思考可见性一样，代价较高，因此避免逐帧为这类回复播放动画。
- **链接。** 渲染器绘制的链接与模型写出的其他链接一样。要处理它们的点击，请使用扩展[认领的协议](#extension-link-schemes)。渲染器添加的相对链接目标不像模型自身的链接那样按会话工作目录解析，Tern 原生视图会相对于自己的目录打开它们。因此请使用绝对路径或 URL。

## 会话记录呈现器 \{#transcript-presenter}

需显式启用。只有 `extensionRenderers.transcriptPresenters` 开启时，才会询问呈现器，默认关闭；入口为 **Tools → Extensions → Extension Transcript Presenters**。关闭时不调用呈现器，各块与未注册呈现器时一样绘制。打开或关闭都会重绘会话记录。

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

呈现器负责决定主会话记录的各块如何在普通终端和 Tern 原生视图中绘制。它只影响显示，会话、`/export` 和模型上下文不变。在交互模式开启设置时生效；其他场景仍注册呈现器，但不询问它。

- **内容块。** 呈现器接收一份只读的 `TranscriptBlock`。后续版本可能增加块类型，对未知 `type` 应返回 `undefined`。
  - `{ type: "toolCall", id, toolName, args, result?, isError, isPartial }` 表示一次模型工具调用，`id` 是该调用的 `toolCallId`。合并显示的读取卡片会逐个询问其中的读取调用。
  - `{ type: "message", id, message }` 表示单独作为一块绘制的会话消息，包括 `custom` 消息（其 `customType` 可为 `advisor`、`skill-prompt`、`lsp-late-diagnostic`、`async-result`（后台作业完成）、`async-notify`（正在运行的后台作业或服务报告的输出）、`launch-completion`（受管理的进程退出）），以及用户的 `!` / `$` 运行（`bashExecution`、`pythonExecution`）。`id` 为 `String(message.timestamp)`，实时显示及恢复后均相同。同一毫秒内记录的消息共用这个 ID，也共用 `rerenderMessage` 的时间戳。仍在进行的 `!` / `$` 运行使用临时消息和 ID；会话记录该运行后，以已记录的消息再次询问。
  - `{ type: "event", id, event }` 表示命中 TTSR 规则（`ttsr_triggered`）或待办未完成提醒（`todo_reminder`），结构与同类型的扩展事件一致。它们只存在于触发这些事件的会话中；`id` 在同一进程内唯一。

  `args`、`result`、`message` 和 `event` 都不是副本，而是 omp 绘制内容块时使用的活动对象，通常是会话自己的消息数据，因此不要修改它们。
- **返回值。** 返回 `undefined` 会交给下一呈现器。`"full"` 使用 omp 自己的完整绘制。`"hidden"` 不绘制任何内容，与 `display.hideToolActivity` 一样。`"compact"` 使用一行 omp 自己的摘要。`{ compact: { label, rows } }` 用 `label` 替换这一行的文字，并在下方为 `rows` 中每项绘制一行；两者均接受 `TspText`（字符串或由主题标记着色的文本片段）。呈现器在绘制会话记录时同步运行，应避免耗时操作。其他返回值（例如拼错的模式、`async` 呈现器返回的 Promise）会让该块完整绘制，并像抛出异常一样报告。
- **优先级。** 按扩展加载顺序询问呈现器，第一个不是 `undefined` 的返回值生效。跳过已暂停扩展的呈现器。呈现器抛出异常时，视为对该块回答 `"full"`，完整绘制，且不再询问后续呈现器。每个呈现器的首次失败（抛出异常或未知返回值）只通过扩展错误通道报告一次（事件 `transcript_presenter`）。用户按 `Ctrl+O` 或用 Tern 自己的切换控件展开的块始终完整绘制；`display.hideToolActivity` 仍会隐藏工具活动。
- **Tern。** 紧凑显示的工具调用将其 `tool` 节点保留为一行内联、收起的内容。提供 `rows` 时，主体为这些行组成的一个文本节点，全部可见。其他块显示成一行内联内容，完整绘制折叠在其下方。行上的切换控件可以展开完整块。
- **间距。** 连续紧凑块在普通终端中没有空行，在 Tern 中也没有间隙。夹在其中不绘制内容的块（隐藏的块或仅包含工具调用的回复）不会断开这组紧凑块。完整绘制的块两侧保留空行或间隙。扩展消息渲染器也可加入一组紧凑块，见[紧凑行](#compact-rows)。
- **何时询问。** 内容块数据变化时都会询问，例如参数流式到达或结果返回时。呈现器自身状态变化时，可调用 `ctx.ui.refreshTranscript(ids)`，如上面的 `agent_end` 处理器所示。注册、释放呈现器（`registerTranscriptPresenter` 返回释放函数），以及暂停或恢复所属扩展，都会重绘每个块。
- **同一个块得到同一个返回值。** omp 可能随时再次询问，例如设置变更重建会话记录时，不保留前一次返回值。返回值应只取决于该块及扩展自身的状态，并如上用块的 `id` 作为状态键。按运行重置状态（在 `agent_start` 时）会导致重建再次询问时，把较早运行的块按新运行的返回值重绘。
- **滚动历史。** 普通终端中，已稳定的块会留在可见视口，直到屏幕填满，或同时有超过 256 个活动块（包括隐藏块）。如果一轮可以放进屏幕，块变化时只会重绘可见区域。如果发生变化的块已有行进入终端滚动历史，omp 会为整批变更清除并重放一次滚动历史，与切换思考可见性相同。较晚到达的结果若改变这类块，例如后台作业完成时呈现器依据 `isPartial` 作答，同一帧只重放一次。但每次仍都会重绘整个会话记录，代价随会话增长。Tern 从不重放。避免频繁改变旧块。
- **只用于主会话记录。** 当前聚焦子代理的会话记录、Collab 访客看到的共享端会话，以及重放会话记录的浮层（链接浏览器、回退和 `/copy` 选择器、智能体会话记录查看器），都使用内置卡片，仿佛未注册呈现器。
- **延迟诊断。** Tern 中，延迟到达的 LSP 诊断与所属的编辑或写入卡片一起绘制；当呈现器将该卡片绘为紧凑或隐藏时，诊断会作为独立块紧随其后显示。没有所属卡片的延迟诊断（普通终端中的所有延迟诊断）是 `lsp-late-diagnostic` 消息块，按其他消息块的方式询问呈现器。

## 扩展链接协议 \{#extension-link-schemes}

使用与[助手文本渲染器](#assistant-text-renderer)相同的设置显式启用（`extensionRenderers.assistantText`，默认关闭）。关闭时忽略已认领的协议，链接按原样绘制。

```ts
pi.registerLinkScheme("cc-stretch");
pi.on("link_activate", ({ url }) => {
	// url is the link as drawn, e.g. "cc-stretch:open/1792/0/2"; validate it before acting on it
});
```

- **绘制。** 在普通终端中，只要绘制了 Markdown，例如在助手回复中，使用已认领协议的链接就只显示标签。标签用点状下划线与网页链接区分，在不支持下划线样式的终端中使用普通下划线。不显示 ` (url)` 后缀，也没有可由终端或浏览器打开的超链接。
- **键盘。** 在普通终端中，`app.links.hint`（默认 `Alt+O`，见[快捷键](./keybindings.md)）用一个或两个字母标记屏幕上每个已认领的链接，标记覆盖标签开头。标签跨行时只给一个标记。标记优先选择它覆盖的字母：先用标签首字母，再尝试标签中下一个未用的字母，最后用主键位一行内下一个未用字母。没有可用的单字母时改用两个字母，保证没有标记是另一个标记的开头。完整键入标记会给认领它的扩展触发 `link_activate`。按 `Esc` 或任何非小写字母键都会取消模式并吞掉按键；`Ctrl+C` 和粘贴除外，它们取消模式但保留原有作用。提示模式只在提示词编辑器获得焦点时有效。当浮层或对话框取得焦点，或重绘移动或移除已标记的标签时（例如流式回复），它会结束，确保标记不会选中已不在它下面的链接。一行链接太多、标记无法并排时，快捷键显示一条状态提示而不显示标记。已经滚到屏幕上方的链接用[链接浏览器](#link-browser)选择。
- **点击。** 开启 `tui.mouse` 时，在普通终端中左击标签与键入其标记效果相同，不会触发其他点击操作。不论哪种方式，在某个子代理的会话记录获得焦点时，事件都会交给该子代理那份扩展实例，即渲染器绘制该标签的那份。处理器的 `ctx.ui` 是交互界面，因此应从处理器自己的上下文调用 `ctx.ui.rerenderMessage`。已经进入终端滚动历史的标签无法原地点击或标记，请在[链接浏览器](#link-browser)中选择。
- **不受信任的输入。** `url` 来自绘制链接的任何来源，不只来自自己的渲染器。模型或它复述的工具输出可写出 `[Continue](cc-stretch:delete/all)`。因 URL 隐藏，用户只会看到 `Continue`。请校验 `url`，将其视为用户输入：严格解析，拒绝不认识的操作，执行任何破坏性动作前先确认。
- **处理器。** `link_activate` 处理器像命令一样运行，不受事件处理器超时限制，因此可以等待对话框（`ctx.ui.confirm`、`ctx.ui.select` 等）。处理器抛出异常时，作为扩展错误报告。
- **回退。** `ctx.ui.getLinkClicksAvailable()` 仅在能够选择已认领的链接时返回真：当前是交互模式、使用普通终端、开启 `extensionRenderers.assistantText`，且提示快捷键已绑定或 `tui.mouse` 开启。子代理的扩展实例得到相同返回值，因为它的链接也在同一屏幕选择。改动该设置、在提示键未绑定时改动 `tui.mouse`、打开或关闭 Tern 原生视图、暂停或恢复扩展（实时编辑 `disabledExtensions`），都会让助手文本渲染器重新运行。渲染器可以每次检查此返回值，若链接不能选择，则将内容直接绘出而不放在链接后。
- **归属。** 协议名不区分大小写且至少两个字符，因此不会将 `C:/notes.md` 之类的 Windows 盘符路径识别成协议。两个扩展认领同一个协议时，先加载的扩展收到点击。已暂停扩展认领的协议会被释放，恢复后再认领。网页、文件和邮件协议（`http`、`https`、`file`、`mailto` 等）与 omp 内部 URL 协议（`local`、`skill`、`agent` 等）都是保留名称；认领这些协议会抛出异常并使扩展加载失败。只有 omp 自己绘制的链接才能选择；工具输出中使用已认领协议的原始终端超链接仍是普通超链接。
- **注册。** 在扩展工厂中认领协议。随后才认领的协议（例如从 `session_start` 或其他处理器认领）会被忽略，直到 `extensionRenderers.assistantText` 变更，或有扩展被暂停或恢复。
- **Tern。** Tern 原生视图将这类链接绘为自己的链接，不把点击转回 omp；可在 Tern 中用插件处理它们。

### 链接浏览器 \{#link-browser}

链接浏览器会全屏重放正在查看的会话记录，包括当前聚焦子代理的记录。因此也可以选择已经进入终端滚动历史的已认领链接。

- **打开。** 显示标记时，再按提示键或按 `Page Up`；如果屏幕上没有已认领链接，也可按提示键打开。如果重放的会话记录同样没有已认领链接，则改为显示一条状态提示。浏览器从会话记录底部打开；仍在流式输出的回复显示到当前进度。
- **选择。** 可见链接与提示模式一样标记。链接只要还在可见范围，就保留原标记，即使它上方的回复重绘也一样；只有新滚入的链接得到新标记。新链接如果发现单字母已经用完，会给视图里的所有链接重新分配两个字母的标记。键入标记或点击标签（即使 `tui.mouse` 关闭，全屏视图也接收点击），即可触发 `link_activate`。
- **按键。** 方向键、`Page Up` / `Page Down`、`Home` / `End` 和鼠标滚轮可以滚动，按 `Esc` 关闭。其他按键不起作用。
- **重绘。** 选择后链接浏览器保持打开，`ctx.ui.rerenderMessage` 会在原地重绘其回复副本，上方的行不动。链接浏览器关闭后，才重建一次主会话记录的滚动历史。
- **反馈。** 链接浏览器盖住状态栏，所以处理器的 `ctx.ui.notify` 或状态文本只会在关闭浏览器后看到。可以把反馈绘在重新渲染的回复里，或在 `ctx.ui.custom` 中使用 `overlay: true`，将反馈绘在浏览器上方而不关闭它。
- **长会话。** 与 `/copy` 一样，浏览器先重放记录的近期部分；滚到顶端时再重放其余部分，保持当前可见行的位置。`Home` 会继续到整个记录的最顶端。
- **关闭。** 扩展对话框（`ctx.ui.confirm`、`select`、`input`、`editor`、`custom` 或 ask）显示前会关闭浏览器，因此 `link_activate` 处理器可以提问。关闭 `extensionRenderers.assistantText`，暂停或恢复扩展，也会关闭链接浏览器，因为其副本是用旧的渲染器和链接绘制的。

## 工具调用和结果渲染器 \{#tool-callresult-renderer}

在 `registerTool` 定义中提供 `renderCall` / `renderResult`，即可在终端界面中自定义工具的显示方式。

## 约束与注意事项 \{#constraints-and-pitfalls}

- 扩展加载时不能执行会话操作；注册方法、`getFlag` 和 `exec` 仍可用。
- `tool_call` 发生错误或超时时，默认拒绝执行工具。其时间预算由 `extensionHandlers.toolCallTimeoutMs` 指定，默认为 30,000 毫秒，等待扩展界面时暂停计时。
- 大多数分发的处理器有 30 秒预算；`session_shutdown` 处理器并发运行，预算为 2 秒。超时会停止等待并取消处理器的界面，但不能撤销扩展任意产生的副作用。
- 与内置命令同名的命令会跳过，并给出诊断信息。
- 保留的快捷键会被忽略（`ctrl+c`、`ctrl+d`、`ctrl+z`、`ctrl+k`、`ctrl+p`、`ctrl+l`、`ctrl+o`、`ctrl+t`、`ctrl+g`、`ctrl+q`、`alt+m`、`shift+tab`、`shift+ctrl+p`、`alt+enter`、`escape`、`enter`）。`getShortcutConflict` 将它们报告为 `reserved`。
- 将 `ctx.reload()` 视为当前命令处理器调用的终结操作。
- 模块全局变量在父子绑定之间共享。会话专用状态应放在工厂闭包或已持久化的会话条目中。

## 扩展、钩子和自定义工具的区别 \{#extensions-vs-hooks-vs-custom-tools}

按用途选择相应接口：

- **扩展**（`src/extensibility/extensions/*`）：统一管理事件、工具、命令、渲染器以及模型提供方注册。
- **钩子**（`src/extensibility/hooks/*`）：旧版 `HookAPI` 事件接口。钩子文件由扩展运行器加载，因而遵循扩展行为，见[钩子](./hooks.md)。
- **自定义工具**（`src/extensibility/custom-tools/*`）：以工具为主的模块。与扩展一同加载时经过适配，仍会经过扩展的拦截封装器。

如果需要一个包同时管理策略、工具、命令界面和渲染，请使用扩展。
