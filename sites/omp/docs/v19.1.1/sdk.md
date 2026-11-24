---
title: "SDK"
description: "Oh My Pi v19.1.1 仓库文档：SDK。"
---

# SDK \{#sdk}

SDK 是 `@oh-my-pi/pi-coding-agent` 的进程内集成接口。
如果需要从 Bun 进程直接访问代理状态、流式接收事件、接入工具或控制会话，可以使用 SDK。

如果需要跨语言或跨进程隔离，请改用 RPC 模式。

## 安装 \{#installation}

```bash
bun add @oh-my-pi/pi-coding-agent
```

需要 Bun 1.4.4 或更高版本。首次向模型发送提示词前，请配置模型提供方的凭据，或运行无需密钥的本地模型提供方；参见[模型提供方](./providers.md)。没有可用模型时仍可创建会话，但无法发送提示词。

## 入口 \{#entry-points}

包根入口 `@oh-my-pi/pi-coding-agent` 提供完整的嵌入接口。它包括 `createAgentSession` 和 `/sdk` 中面向嵌入场景的导出项，以及更底层的会话、认证、模型、模式、扩展和工具 API。

从包根入口导入以下核心嵌入 API：

- `createAgentSession`
- `SessionManager`
- `Settings`
- `AuthStorage`
- `ModelRegistry`
- `AgentRegistry`
- `discoverAuthStorage`
- 发现辅助函数（`discoverExtensions`、`discoverSkills`、`discoverContextFiles`、`discoverPromptTemplates`、`discoverSlashCommands`、`discoverCustomTSCommands`、`discoverMCPServers`）
- 工具工厂接口（`createTools`、`BUILTIN_TOOLS`、工具类）

范围较窄的子路径 `@oh-my-pi/pi-coding-agent/sdk` 导出 `createAgentSession` 及其选项与结果类型、`Settings`、`AgentRegistry`、发现和系统提示词辅助函数、工作区树辅助函数、部分扩展、MCP 和工具类型，以及部分工具类和工厂。它**不**导出 `SessionManager`、`AuthStorage` 或 `ModelRegistry`；请参照下文示例，从包根入口导入这三项。

注入扩展、钩子、自定义命令和自定义工具的 `api.pi` 会在首次访问时解析宿主 SDK。注册回调或加载内置命令时，不会提前加载完整 SDK 和交互式编辑器。

## 快速入门（使用默认的自动发现） \{#quick-start-auto-discovery-defaults}

```ts
import { createAgentSession } from "@oh-my-pi/pi-coding-agent";

const { session, modelFallbackMessage } = await createAgentSession();

if (modelFallbackMessage) {
	process.stderr.write(`${modelFallbackMessage}\n`);
}

const unsubscribe = session.subscribe(event => {
	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		process.stdout.write(event.assistantMessageEvent.delta);
	}
});

await session.prompt("Summarize this repository in 3 bullets.");
unsubscribe();
await session.dispose();
```

## 进程关闭 \{#process-shutdown}

导入 SDK 不会安装任何信号或致命错误处理器；进程生命周期由宿主管理。进程退出时，OMP 注册的清理逻辑仍会运行。如果需要在异步关闭过程中提前运行清理逻辑，请在销毁会话后调用 `postmortem.cleanup()`，该函数来自 `@oh-my-pi/pi-utils`。

## `createAgentSession()` 默认发现的内容 \{#what-createagentsession-discovers-by-default}

`createAgentSession()` 的规则是：提供参数即覆盖，省略则自动发现。

省略时，它会按以下方式确定各项内容：

- `cwd`：`getProjectDir()`
- `agentDir`：`~/.omp/agent`（通过 `getAgentDir()` 获取）
- `authStorage`：`discoverAuthStorage(agentDir, { settings, cwd })`
- `modelRegistry`：一个 `ModelRegistry`，使用上述认证存储、`<agentDir>/models.yml`、生效的设置和代理目录中的模型缓存；未提供注册表时，在后台调用 `refreshInBackground()`
- `settings`：`await Settings.init({ cwd, agentDir })`
- `sessionManager`：`SessionManager.create(cwd, SessionManager.getDefaultSessionDir(cwd, agentDir))`（基于文件存储）
- 技能、规则、上下文文件、提示词模板、斜杠命令、扩展和自定义 TypeScript 命令
- 通过 `createTools(...)` 获取内置工具
- MCP 工具（默认启用；Exa MCP 服务器并入原生 Exa 集成，启用内置 Eval 浏览器前置脚本时会过滤掉浏览器自动化 MCP 服务器）
- LSP 集成（默认启用）
- `eventBus`：未提供时新建 `EventBus()`

### 必填与可选参数 \{#required-vs-optional-inputs}

通常只需提供你想要控制的参数：

```ts
function createAgentSession(options?: CreateAgentSessionOptions): Promise<CreateAgentSessionResult>;
```

- **必填参数**：最简会话不需要任何参数
- 嵌入时**通常显式提供**：
   - `sessionManager`（如果需要使用内存或自定义存储位置）
   - `authStorage` + `modelRegistry`（如果由你管理凭据和模型的生命周期）
   - `model` 或 `modelPattern`（如果需要确定性的模型选择）
   - `settings`（如果需要隔离配置或测试配置）

如果在同一进程中并发运行多个顶层会话，请分别传入各自专用的 `AgentRegistry`。默认的进程全局注册表每一代只接纳一个 `"Main"` 标识。

## 会话管理器行为（持久化与内存模式） \{#session-manager-behavior-persistent-vs-in-memory}

`AgentSession` 始终使用 `SessionManager`；具体行为取决于所用的工厂方法。

### 文件存储（默认） \{#file-backed-default}

```ts
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";

const { session } = await createAgentSession({
	sessionManager: SessionManager.create(process.cwd()),
});

console.log(session.sessionFile); // absolute .jsonl path
```

- 将对话、消息和状态增量持久化到会话文件。
- 支持恢复、打开、列出和分叉会话。
- `session.sessionFile` 有定义。

### 内存存储 \{#in-memory}

```ts
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";

const { session } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
});

console.log(session.sessionFile); // undefined
```

- 不将数据持久化到文件系统。
- 适用于测试、临时工作进程和作用域限于单次请求的代理。
- 会话方法仍可使用，但依赖持久化的行为（通过文件恢复或分叉）会受到限制。

### 恢复、打开和列出会话的辅助方法 \{#resumeopenlist-helpers}

```ts
import { SessionManager } from "@oh-my-pi/pi-coding-agent";

const recent = await SessionManager.continueRecent(process.cwd());
const listed = await SessionManager.list(process.cwd());
const opened = listed[0] ? await SessionManager.open(listed[0].path) : null;
```

## 接入模型与认证 \{#model-and-auth-wiring}

`createAgentSession()` 结合 `ModelRegistry` 和 `AuthStorage` 选择模型并解析 API 密钥。

如果同时提供 `authStorage` 和 `modelRegistry`，`modelRegistry.authStorage` 必须与前者是同一实例；两者指向不同的存储实例时，无法创建会话。

### 显式接入 \{#explicit-wiring}

```ts
import { createAgentSession, discoverAuthStorage, ModelRegistry, SessionManager } from "@oh-my-pi/pi-coding-agent";

const authStorage = await discoverAuthStorage();
const modelRegistry = new ModelRegistry(authStorage);
await modelRegistry.refresh();

const available = modelRegistry.getAvailable();
if (available.length === 0) throw new Error("No authenticated models available");

const { session } = await createAgentSession({
	authStorage,
	modelRegistry,
	model: available[0],
	thinkingLevel: "medium",
	sessionManager: SessionManager.inMemory(),
});
```

### 省略 `model` 时的选择顺序 \{#selection-order-when-model-is-omitted}

未显式提供 `model` 或 `modelPattern` 时：

1. 从现有会话恢复模型（前提是可以恢复且密钥可用）
2. 使用设置中的默认模型角色（`default`）
3. 按可用顺序选择已有认证凭据的模型提供方默认模型（没有符合条件的提供方默认模型时，回退到第一个已有认证凭据的可用模型）

如果恢复失败，`modelFallbackMessage` 会说明回退情况。

### 认证优先级 \{#auth-priority}

`AuthStorage.keys.get(...)` 按以下顺序解析：

1. 运行时覆盖值（`keys.setRuntime`，CLI 的 `--api-key` 使用此方式）
2. 配置中的 API 密钥覆盖值（`models.yml` 中模型提供方的 `apiKey`）
3. 已存储的 OAuth 凭据，必要时刷新
4. 成功执行 `/login` 后持久化的 API 密钥
5. 模型提供方的环境变量
6. `agent.db` 或代理服务支撑的存储中的其他 API 密钥凭据

配置值由注册表安装的解析器异步解析；构建模型目录时不会执行取用凭据的命令。`ModelRegistry.getProviderHeaders(provider)` 和 `resolveModelHeaders(model, signal?)` 都返回 Promise。直接向模型提供方发送请求时，请等待后者的结果，不要从 `model.headers` 读取来自配置的值。AI 客户端的 `stream()` 和 `streamSimple()` 会在每次尝试请求时自动通过 `model.resolveHeaders` 解析实际的请求头，认证重试时也一样。

## 事件订阅模型 \{#event-subscription-model}

使用 `session.subscribe(listener)` 订阅事件；它会返回一个取消订阅的函数。

```ts
const unsubscribe = session.subscribe(event => {
	switch (event.type) {
		case "agent_start":
		case "turn_start":
		case "tool_execution_start":
			break;
		case "message_update":
			if (event.assistantMessageEvent.type === "text_delta") {
				process.stdout.write(event.assistantMessageEvent.delta);
			}
			break;
	}
});
```

`AgentSessionEvent` 包含核心 `AgentEvent` 和以下会话级事件：

- `auto_compaction_start` / `auto_compaction_end`
- `manual_compaction_start` / `manual_compaction_end`（`compact()`、`/compact`、扩展中的 `ctx.compact()`）
- `auto_retry_start` / `auto_retry_end`
- `retry_fallback_applied` / `retry_fallback_succeeded`
- `model_changed`
- `thinking_level_changed`
- `ttsr_triggered`
- `todo_reminder` / `todo_auto_clear`
- `irc_message`
- `notice`
- `goal_updated`
- `queue_update`（可用于显示的 `steering` 和 `followUp` 字符串数组快照）
- `cache_warming_start` / `cache_warming_end`
- `config_warnings_changed`
- `advisor_cost_changed` / `advisor_yielded`

`agent_end` 包含 `messages` 和可选的遥测字段。它在一次运行彻底结束时仅触发一次：没有流式输出，没有已经安排的续跑，也没有可以恢复运行的后台任务、子代理或排队消息。如果模型循环停止但运行仍未结束，则发出 `agent_pause`（含 `messages`、`yielded`、`awaiting`）。`yielded: false` 表示会话继续处理模型自身的工作（重试、上下文压缩后继续运行，或停止时发出的提醒）；`yielded: true` 表示代理已完成其轮次，运行正在等待排队输入、同级代理的消息、后台任务或子代理。如果只有这些外部工作才能恢复运行，则 `awaiting: true`。可用 `session.isRunActive`、`session.wakeSources` 和 `session.waitForRunEnd()` 检查运行状态或等待运行结束。

RPC 和 JSON 输出流、collab 通信协议及扩展的 `agent_end` 仍按模型循环发出事件：每次循环停止都对应一个 `agent_end`。整个运行尚未结束时，RPC、JSON 和 collab 会带上 `isTerminal: false`，扩展会带上 `willContinue: true`。

## 提示词生命周期 \{#prompt-lifecycle}

`session.prompt(text, options?)` 是主要入口。

行为如下：

1. 可选地展开命令或模板（`/` 命令、自定义命令、基于文件的斜杠命令、提示词模板）
2. 如果正在流式输出：
   - `streamingBehavior: "steer" | "followUp"` 决定 `prompt()` 如何将消息排入队列
   - 扩展中的 `sendUserMessage(content)` 在省略 `deliverAs` 时默认使用引导方式
   - 已排队的消息会保留，不会丢弃工作
3. 如果处于空闲状态：
   - 验证模型和 API 密钥
   - 追加用户消息
   - 启动代理轮次

相关 API：

- `sendUserMessage(content, { deliverAs?, attribution? })`
- `steer(text, images?, { attribution? })`
- `followUp(text, images?, { synthetic?, attribution? })`
- `sendCustomMessage({ customType, content, ... }, { deliverAs?, triggerTurn? })`
- `abort()`

在这两个 API 中，`deliverAs: "aside"` 都会在代理当前步骤结束、下一步开始前投递消息，不会中断当前批次的工具执行。相比之下，引导会跳过剩余工具，等待运行结束则会推迟投递。唯一的例外是正在运行且可被打断的 `wait` 或 `vibe_wait`：插话会结束这次等待，以免消息在其后滞留。会话空闲时，这两个 API 都会改为启动一个轮次（在计划模式下，自定义消息并入上下文，不启动轮次）。

## 空闲维护 \{#idle-maintenance}

会话所有者须调用 `session.enableIdleMaintenance({ isBlocked?, scheduledTurn?, onRecap? })` 才会启用自主空闲维护；交互式 TUI 会调用，SDK、RPC 和输出模式的会话不会。如果某个轮次的最后一条消息是生成的助手回复（文本、思考内容或工具调用，即使该轮次随后被中止），那么等到没有正在进行、已接纳、已排队或已安排的工作时，会话就会生成空闲回顾（`recap.*` 设置），将其记入历史数据库，并把完整的非空白回复传给 `onRecap`。回顾不会进入会话记录或模型上下文。空闲上下文压缩（`compaction.idle*` 设置）还会等到没有后台任务或待投递消息能唤醒会话。`isBlocked` 表示所有者不希望开展自主工作（正在撰写草稿、已离开当前视图或启动尚未完成）；`scheduledTurn` 表示所有者已决定启动一个轮次，但尚未接纳它。其中任一返回值变化时，请调用 `session.refreshIdleMaintenance()`：不再需要的工作会被丢弃，当前空闲时段仍需要完成的工作会重新安排，并重新计时。重复启用时仍使用首个所有者的选项；会话销毁时负责清理。

## `AgentSession` 生命周期与销毁 \{#agentsession-lifecycle-and-disposal}

嵌入方彻底用完一个会话后，请调用 `await session.dispose()`。`dispose()` 会自行启动销毁流程，且是幂等的：重复或并发调用都会收到同一个清理 Promise，因此关闭事件和会话自有资源不会被处理两遍。

`beginDispose()` 会同步阻止新工作进入，适用于必须先等待自身清理完成、再调用 `dispose()` 的包装层。请在包装层第一次 `await` 前调用它，否则延后执行的工作可能趁这段间隙进入。它会立即将会话标记为已销毁，取消记忆初始化、标题生成和自动经验记录，清空排队的让出操作与插话，停止顾问运行时，解除插话投递，并拒绝新的 eval 执行。延后执行的会话工作会检查销毁状态，并据此丢弃或跳过。`beginDispose()` 也是幂等的，之后仍须调用 `dispose()` 才能完成异步清理。

```ts
import type { AgentSession } from "@oh-my-pi/pi-coding-agent";

async function closeEmbeddedSession(session: AgentSession, closeHostInputAndUi: () => Promise<void>): Promise<void> {
	session.beginDispose(); // no new deferred work may enter after this point
	await closeHostInputAndUi();
	await session.dispose();
}
```

异步销毁期间，会话会记录退出诊断信息并同步写出，发出一次 `session_shutdown`，停止扩展的回退计时器，中止重试、上下文压缩和正在进行的代理轮次，并给提示词后续工作和自动经验记录留出有限的收尾时间。随后，会话并发清理自有的异步任务、eval 内核、浏览器标签页、原生计算机操作会话、MCP 连接、顾问状态和记忆状态。各子系统会尽力完成清理，并在适用时设有时限；系统会记录失败，但不会因此停止清理其余子系统。

只有等可能追加会话条目的工作全部收尾后，销毁流程才会清理已移动但为空的会话、关闭 `SessionManager`、关闭模型提供方的会话状态、断开代理并移除监听器。如果最后的持久化清理或 `SessionManager.close()` 失败，共用的销毁 Promise 会被拒绝；各模型提供方的会话关闭失败则会记录下来。

## 工具与扩展集成 \{#tools-and-extension-integration}

### 内置工具与过滤 \{#built-ins-and-filtering}

- 内置工具来自 `createTools(...)` 和 `BUILTIN_TOOLS`。
- `toolNames` 请求指定名称的工具，可启用默认禁用的工具；它本身**不是**允许名单。
- 设置 `restrictToolNames: true` 可将会话限制为只使用 `toolNames` 中的工具。受限会话默认禁用环境中的 MCP、扩展、自定义命令和 LSP。
- 受限子会话保留父会话的 `preloadedPreparedExtensions` 中的钩子和提供方，并将它们重新绑定至自身会话。扩展提供的工具即便在之后注册，也不能扩充或替换受限工具集。
- 在受限会话中，SDK 提供的 `customTools` 默认排除，除非设置 `allowRestrictedCustomTools: true`，且它们的名称也在 `toolNames` 中。
- 隐藏工具（例如 `yield`）需要显式启用，除非选项要求包含它们。

```ts
const { session } = await createAgentSession({
	toolNames: ["read", "grep", "glob", "write"],
	restrictToolNames: true,
	requireYieldTool: true,
});
```

### 扩展 \{#extensions}

- `extensions`：内联 `ExtensionFactory[]`。进程内的子会话会重新绑定这些工厂；工作线程中的子代理无法导入闭包，因此运行时没有这些工厂（参见[扩展加载](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/extension-loading.md#restricted-children-and-revival)）。必须在子代理中运行的钩子应放入扩展文件。
- `additionalExtensionPaths`：加载额外的扩展文件。
- `disableExtensionDiscovery`：禁用对环境的自动扫描，显式指定的路径和内联工厂仍会加载。
- `preloadedExtensions`：复用由同一负责该会话的进程提前加载的扩展集合。不要将父会话中已加载的扩展实例传给另一会话；请用 `preloadedPreparedExtensions`，使每个会话拥有自己的 `ExtensionAPI` 绑定。
- `preloadedPreparedExtensions`：重新绑定已经导入的工厂，包括在受限子会话中重新绑定；不会重新求值模块图。
- `extensionRoots`：在发现和恢复子会话时，实时提供会话所有者的根目录。它的显式根目录、发现模式和配置中的根目录优先于子会话本地的扩展加载参数。

### 运行时修改工具集 \{#runtime-tool-set-changes}

`AgentSession` 支持在运行时更新启用的工具：

- `getActiveToolNames()`
- `getAllToolNames()`
- `setActiveToolsByName(names)`
- `refreshMCPTools(mcpTools)`

启用的工具发生变化后，系统会重新构建系统提示词以反映变更。

## 发现辅助函数 \{#discovery-helpers}

如果需要控制发现流程的某些部分，但不想重写内部发现逻辑，可以使用以下辅助函数：

- `discoverAuthStorage(agentDir?, options?)`（生效的设置、工作目录和凭据发现选项）
- `discoverExtensions(cwd?)`
- `discoverSkills(cwd?, _agentDir?, settings?)`
- `discoverContextFiles(cwd?, _agentDir?, disabledExtensions?)`
- `discoverPromptTemplates(cwd?, agentDir?)`
- `discoverSlashCommands(cwd?)`
- `discoverCustomTSCommands(cwd?, agentDir?)`
- `discoverMCPServers(cwd?)`
- `buildSystemPrompt(options?)`

## 宿主集成选项 \{#host-integration-options}

- `hasUI` 默认为 `false`；仅当宿主有交互式 UI 时启用。
- `interactivePrompts` 默认为 `hasUI` 的值。能够同步应答询问的非 TUI 宿主可将它设为 `true`，这样可以启用 `ask`，而不启用 LSP 预热等仅适用于 UI 的启动行为。
- `telemetry: {}` 启用代理循环的 OpenTelemetry span。如果宿主未注册 OpenTelemetry SDK，API 使用空操作追踪器。
- `additionalDirectories` 添加绝对路径或相对于当前工作目录的工作区根目录。
- `providerSessionId` 可以复用模型提供方侧的会话标识，同时保持会话持久化相互隔离；`providerPromptCacheKey` 用于设置单独的缓存键。
- `systemPromptTemplate`、`customSystemPrompt`、`appendSystemPrompt` 和 `systemPrompt` 分别控制不同的提示词层。替换与发现规则见[系统提示词自定义](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/system-prompt-customization.md)。

## 面向子代理的选项 \{#subagent-oriented-options}

如果你用 SDK 构建编排器（类似任务执行器的流程），可以使用以下选项：

- `outputSchema`：将预期的结构化输出传入工具上下文
- `outputSchemaMode`：选择宽松或严格地校验结构化输出
- `requireYieldTool`：强制包含 `yield` 工具
- `taskDepth`：为嵌套任务会话提供递归深度上下文
- `parentTaskPrefix`：嵌套任务输出的产物命名前缀
- `bindProcessState`：代表宿主会话启动辅助会话时设为 `false`（见下文）

在普通的单代理嵌入场景中，这些选项均可省略。

某些进程级状态受单个设置实例控制，包括设置产生的效果（主题、请求限制和凭据遮盖的回退开关），以及发现提供方的启用开关。每个顶层会话都通过自己的 `settings` 持有这类状态，直到会话销毁。多个会话同时处于运行状态时，由最近取得该状态的会话控制；销毁该会话后，控制权交还给上一位持有者。具有 `parentTaskPrefix` 或 `taskDepth`，或者设置了 `bindProcessState: false` 的会话，不会取得这类状态。不论由谁持有，各会话向模型提供方发送请求时，均按照自身的 `secrets.enabled` 设置遮盖形似凭据的 token。

## `createAgentSession()` 的返回值 \{#createagentsession-return-value}

```ts
type CreateAgentSessionResult = {
	session: AgentSession;
	extensionsResult: LoadExtensionsResult;
	setToolUIContext: (uiContext: ExtensionUIContext, hasUI: boolean) => void;
	mcpManager?: MCPManager;
	modelFallbackMessage?: string;
	lspServers?: Array<{
		name: string;
		status: "connecting" | "ready" | "error" | "available";
		fileTypes: string[];
		error?: string;
	}>;
	startBackgroundModelDiscovery?: () => Promise<void>;
	eventBus: EventBus;
	subagentEventBus?: EventBus;
};
```

仅当嵌入方提供了应供工具或扩展调用的 UI 能力时，才使用 `setToolUIContext(...)`。

`subagentEventBus` 在整个会话树中传递 `task:subagent:*` 可观测性帧。带 UI 的宿主可以在首次绘制后调用 `startBackgroundModelDiscovery()`，启动利用缓存的在线模型发现。

## 启动性能 \{#startup-performance}

`createAgentSession()` 在后台执行两项优化，使 I/O 能与会话初始化的其他工作并行：

- **预热模型主机连接。** `prewarmModelConnection(model)`（`packages/ai/src/providers/connection-prewarm.ts`）用与实际请求相同的传输配置（代理、额外 CA、TLS 选项），向模型的 API 源站发送不带凭据的 `HEAD` 请求。这样下一个请求可复用连接池中的套接字，无须再次完成 DNS 解析、TCP 连接和 TLS 握手。SDK 在确定模型后立即发出预热请求，与会话初始化并行；交互式 UI 在空闲时（首帧、切换模型、输入文本时）会再次发起预热，每个源站每 30 秒最多一次。Anthropic 第一方模型会预先解析官方端点；其他模型只预热其上一次推理请求实际到达的源站，因此不会猜测发送请求时改写的地址（Copilot 方案对应的主机、`MOONSHOT_BASE_URL`、区域主机），也不会在首次请求前预热。源站必须是模型提供方自己的端点（随附的基础 URL 中的主机，或 KDL 中的 `endpoint-hosts` 条目）。不会探测 `models.yml` 中的自定义模型提供方、路由到网关的内置模型提供方 ID，以及 `ANTHROPIC_BASE_URL` 或 Foundry 网关。预热失败时静默跳过。适用于所有模式（交互式、输出、RPC、ACP）。
- **按条件预热 LSP。** 只有**全部**满足以下条件时，才会预热启动时的 LSP 服务器（由 `discoverStartupLspServers(cwd)` 返回）：
   - 会话选项启用了 LSP 集成，并且 `lsp.enabled` 为 `true`；**且**
   - `options.hasUI === true`（交互式 TUI）；**且**
   - `lsp.lazy` 设置已禁用（默认值为 `true`）。

   启用 `lsp.lazy` 时（默认行为），启动时不会启动任何语言服务器。每个服务器都在首次使用时冷启动，即代理调用 `lsp` 工具，或编辑、写入操作涉及的文件扩展名与服务器的 `fileTypes` 匹配时。输出、脚本、RPC 和 ACP 调用（`hasUI=false`）无论此项如何设置都跳过预热：它们不显示预热状态指示，且通常会在语言服务器稳定运行前结束。对这些调用执行预热，只会在大语言模型流的消费端运行期间同时解析大型 `initialize` 响应，占用 CPU 并造成感知延迟波动。真正需要 LSP 服务器的工具仍会通过 `getOrCreateClient()` 按需启动服务器；仅跳过 _启动时_ 的预热。在惰性模式下，带 UI 的会话仍会填充返回的 `lspServers` 字段（见 `CreateAgentSessionResult`）：系统会发现已识别的服务器（不启动进程），并以 `"available"` 状态报告，供欢迎屏幕和 `/status` 列出。该字段在下列情形下为 `undefined`：LSP 集成或 `lsp.enabled` 被禁用，或者 `hasUI` 为假。会话中途关闭 `lsp.lazy`（通过 `/settings`、任意 `settings.set()` 调用或重新加载设置）时，会对这些服务器执行一次同样的预热，就地更新其状态，并发出通常的 `lsp:startup` 事件。

## 最简受控嵌入示例 \{#minimal-controlled-embed-example}

```ts
import {
	createAgentSession,
	discoverAuthStorage,
	ModelRegistry,
	SessionManager,
	Settings,
} from "@oh-my-pi/pi-coding-agent";

const authStorage = await discoverAuthStorage();
const modelRegistry = new ModelRegistry(authStorage);
await modelRegistry.refresh();

const settings = Settings.isolated({
	"compaction.enabled": true,
	"retry.enabled": true,
});

const { session } = await createAgentSession({
	authStorage,
	modelRegistry,
	settings,
	sessionManager: SessionManager.inMemory(),
	toolNames: ["read", "grep", "glob", "edit", "write"],
	restrictToolNames: true,
	enableMCP: false,
	enableLsp: true,
});

session.subscribe(event => {
	if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
		process.stdout.write(event.assistantMessageEvent.delta);
	}
});

await session.prompt("Find all TODO comments in this repo and propose fixes.");
await session.dispose();
```
