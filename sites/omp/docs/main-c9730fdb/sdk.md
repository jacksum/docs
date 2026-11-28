---
title: "SDK"
description: "Oh My Pi 官方仓库文档：SDK。"
---

# SDK \{#sdk}

SDK 是 `@oh-my-pi/pi-coding-agent` 的进程内集成接口。
当你希望从 Bun 进程直接访问智能体状态、事件流、工具接线和会话控制时，可以使用它。

如果需要跨语言/进程隔离，请改用 RPC 模式。

## 安装 \{#installation}

```bash
bun add @oh-my-pi/pi-coding-agent
```

要求 Bun 1.4.4 或更新版本。在第一次由模型支持的提示之前，配置
提供方凭据或运行无需密钥的本地提供方；参见
[提供方](./providers.md)。没有可用模型时，会话构造也能成功，
但无法发送提示。

## 入口 \{#entry-points}

包根入口 `@oh-my-pi/pi-coding-agent` 是完整的嵌入接口。它包含 `createAgentSession` 和聚焦的 `/sdk` 导出，以及更底层的会话、身份验证、模型、模式、扩展和工具 API。

从包根入口导入以下核心嵌入 API：

- `createAgentSession`
- `SessionManager`
- `Settings`
- `AuthStorage`
- `ModelRegistry`
- `AgentRegistry`
- `discoverAuthStorage`
- 发现辅助程序（`discoverExtensions`、`discoverSkills`、`discoverContextFiles`、`discoverPromptTemplates`、`discoverSlashCommands`、`discoverCustomTSCommands`、`discoverMCPServers`）
- 工具工厂接口（`createTools`、`BUILTIN_TOOLS`、工具类）

范围更窄的 `@oh-my-pi/pi-coding-agent/sdk` 子路径导出 `createAgentSession`、其选项/结果类型、`Settings`、`AgentRegistry`、发现和系统提示辅助程序、工作区树辅助程序、部分扩展/MCP/工具类型，以及部分工具类/工厂。它**不**导出 `SessionManager`、`AuthStorage` 或 `ModelRegistry`；这三者应像下面的示例一样从包根入口导入。

扩展、钩子、自定义命令和自定义工具中注入的 `api.pi` 会在首次访问时解析宿主 SDK。注册回调或加载内置命令不会提前加载完整 SDK 和交互式输入编辑器。

## 快速开始（自动发现默认值） \{#quick-start-auto-discovery-defaults}

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

导入 SDK 不会安装信号或致命错误处理程序；宿主负责自己的进程生命周期。进程退出时，OMP 已注册的清理仍会运行。若要在异步关闭期间更早运行清理，请在释放会话后调用 `@oh-my-pi/pi-utils` 中的 `postmortem.cleanup()`。

## `createAgentSession()` 默认发现的内容 \{#what-createagentsession-discovers-by-default}

`createAgentSession()` 遵循“提供则覆盖，省略则发现”。

省略时，它会解析：

- `cwd`：`getProjectDir()`
- `agentDir`：`~/.omp/agent`（通过 `getAgentDir()`）
- `authStorage`：`discoverAuthStorage(agentDir, { settings, cwd })`
- `modelRegistry`：使用该身份验证存储、`<agentDir>/models.yml`、有效设置和智能体目录模型缓存的 `ModelRegistry`；未提供注册表时，在后台运行 `refreshInBackground()`
- `settings`：`await Settings.init({ cwd, agentDir })`
- `sessionManager`：`SessionManager.create(cwd, SessionManager.getDefaultSessionDir(cwd, agentDir))`（基于文件）
- 技能/规则/上下文文件/提示模板/斜杠命令/扩展/自定义 TS 命令
- 通过 `createTools(...)` 创建的内置工具
- MCP 工具（默认启用；Exa MCP 服务器会并入原生 Exa 集成，启用内置 Eval 浏览器前导代码时会过滤浏览器自动化 MCP 服务器）
- LSP 集成（默认启用）
- `eventBus`：如未提供，则为新的 `EventBus()`

### 必需与可选输入 \{#required-vs-optional-inputs}

通常你只需提供希望控制的内容：

```ts
function createAgentSession(options?: CreateAgentSessionOptions): Promise<CreateAgentSessionResult>;
```

- **必须提供**：最小会话无需提供任何内容
- 嵌入方**通常显式提供**：
   - `sessionManager`（如果需要内存模式或自定义位置）
   - `authStorage` + `modelRegistry`（如果由你负责凭据/模型生命周期）
   - `model` 或 `modelPattern`（如果确定性的模型选择很重要）
   - `settings`（如果需要隔离/测试配置）

在同一进程中运行多个并发顶层会话时，为每个会话传入私有的
`AgentRegistry`。默认的进程全局注册表在每一代中
只接纳一个 `"Main"` 身份。

## 会话管理器行为（持久化与内存模式） \{#session-manager-behavior-persistent-vs-in-memory}

`AgentSession` 始终使用 `SessionManager`；行为取决于你使用的工厂。

### 基于文件（默认） \{#file-backed-default}

```ts
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";

const { session } = await createAgentSession({
	sessionManager: SessionManager.create(process.cwd()),
});

console.log(session.sessionFile); // absolute .jsonl path
```

- 将对话/消息/状态增量持久化到会话文件。
- 支持恢复/打开/列出/派生新会话工作流。
- `session.sessionFile` 有定义。

### 内存模式 \{#in-memory}

```ts
import { createAgentSession, SessionManager } from "@oh-my-pi/pi-coding-agent";

const { session } = await createAgentSession({
	sessionManager: SessionManager.inMemory(),
});

console.log(session.sessionFile); // undefined
```

- 不进行文件系统持久化。
- 适用于测试、临时工作进程、请求作用域的智能体。
- 会话方法仍可使用，但持久化特有行为（文件恢复/派生新会话路径）自然受到限制。

### 恢复/打开/列出辅助程序 \{#resumeopenlist-helpers}

```ts
import { SessionManager } from "@oh-my-pi/pi-coding-agent";

const recent = await SessionManager.continueRecent(process.cwd());
const listed = await SessionManager.list(process.cwd());
const opened = listed[0] ? await SessionManager.open(listed[0].path) : null;
```

## 模型与身份验证接线 \{#model-and-auth-wiring}

`createAgentSession()` 使用 `ModelRegistry` + `AuthStorage` 选择模型并解析 API 密钥。

如果同时提供 `authStorage` 和 `modelRegistry`，
`modelRegistry.authStorage` 必须是同一个实例；会话创建会拒绝
不一致的存储。

### 显式接线 \{#explicit-wiring}

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

未提供显式 `model`/`modelPattern` 时：

1. 从现有会话恢复模型（如果可恢复且密钥可用）
2. 设置中的默认模型角色（`default`）
3. 按可用性顺序选择已通过身份验证的提供方默认模型（若没有提供方默认模型，则回退到第一个已通过身份验证的可用模型）

恢复失败时，`modelFallbackMessage` 会解释回退原因。

### 身份验证优先级 \{#auth-priority}

`AuthStorage.keys.get(...)` 按以下顺序解析：

1. 运行时覆盖项（`keys.setRuntime`，由 CLI `--api-key` 使用）
2. 配置来源的 API 密钥覆盖项（`models.yml` 提供方 `apiKey`）
3. 存储的 OAuth 凭据，包括需要时的刷新
4. 通过成功的 `/login` 持久化的 API 密钥
5. 提供方环境变量
6. `agent.db` / 代理支持存储中的其他已存储 API 密钥凭据

配置值通过注册表安装的解析器异步解析；目录构造不会执行凭据命令。`ModelRegistry.getProviderHeaders(provider)` 和 `resolveModelHeaders(model, signal?)` 返回 promise。对于直接提供方请求，请等待后者，而不是从 `model.headers` 读取配置支持的值。AI 客户端的 `stream()` 和 `streamSimple()` 会在每次请求尝试时自动实体化 `model.resolveHeaders`，包括身份验证重试。

## 事件订阅模型 \{#event-subscription-model}

通过 `session.subscribe(listener)` 订阅；它返回取消订阅函数。

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

`AgentSessionEvent` 包含核心 `AgentEvent` 和会话级事件：

- `auto_compaction_start` / `auto_compaction_end`
- `manual_compaction_start` / `manual_compaction_end`（`compact()`、`/compact`、扩展 `ctx.compact()`）
- `auto_retry_start` / `auto_retry_end`
- `retry_fallback_applied` / `retry_fallback_succeeded`
- `model_changed`
- `thinking_level_changed`
- `ttsr_triggered`
- `todo_reminder` / `todo_auto_clear`
- `irc_message`
- `notice`
- `goal_updated`
- `queue_update`（可显示的 `steering` 和 `followUp` 字符串数组快照）
- `cache_warming_start` / `cache_warming_end`
- `config_warnings_changed`
- `advisor_cost_changed` / `advisor_yielded`

`agent_end` 包含 `messages` 和可选遥测字段。它在每次运行结束时
恰好触发一次：没有任何流式传输，没有安排后续继续执行，
也没有后台作业、子智能体或排队消息能恢复该运行。
运行仍在继续时停止的模型循环会改为发出 `agent_pause`
（`messages`、`yielded`、`awaiting`）：`yielded: false` 表示会话
继续模型自己的工作（重试、上下文压缩后的继续执行、停止时
提醒）；`yielded: true` 表示智能体已完成该轮，运行正在等待
排队输入、同级消息、后台作业或子智能体，
其中 `awaiting: true` 表示只有这些外部工作才能恢复它。使用
`session.isRunActive`、`session.wakeSources` 和 `session.waitForRunEnd()`
检查或等待运行。

RPC 和 JSON 打印流、协作传输及扩展 `agent_end`
保持其每循环的形式：每个停止的循环都是一个 `agent_end`，
运行仍在继续时带有 `isTerminal: false`（RPC/JSON/协作）或 `willContinue: true`（扩展）。

## 提示生命周期 \{#prompt-lifecycle}

`session.prompt(text, options?)` 是主要入口。

行为：

1. 可选的命令/模板展开（`/` 命令、自定义命令、文件斜杠命令、提示模板）
2. 如果当前正在流式传输：
   - `streamingBehavior: "steer" | "followUp"` 选择 `prompt()` 的排队方式
   - 扩展 `sendUserMessage(content)` 在省略 `deliverAs` 时默认为引导
   - 保留排队消息，而不是丢弃工作
3. 如果空闲：
   - 验证模型和 API 密钥
   - 追加用户消息
   - 启动智能体轮次

相关 API：

- `sendUserMessage(content, { deliverAs?, attribution? })`
- `steer(text, images?, { attribution? })`
- `followUp(text, images?, { synthetic?, attribution? })`
- `sendCustomMessage({ customType, content, ... }, { deliverAs?, triggerTurn? })`
- `abort()`

`deliverAs: "aside"`（两个 API 均支持）在下一个智能体步骤边界交付，不中断当前工具批次，而不是进行引导（会跳过剩余工具）或等待运行完成。唯一例外是正在运行且可中断的 `wait` 或 `vibe_wait`，aside 会结束它，避免消息被延迟到其后。会话空闲时，两者会改为启动一轮（计划模式下，自定义消息会并入上下文而不启动轮次）。

## 空闲维护 \{#idle-maintenance}

会话不会自主启动空闲工作，直到其所有者通过 `session.enableIdleMaintenance({ isBlocked?, scheduledTurn?, onRecap? })` 选择启用；交互式 TUI 会启用，SDK、RPC 和打印会话不会。若一轮的最后一条消息是生成的助手回复（文本、思考或工具调用，即使该轮随后被中止），一旦没有任何活动、已接纳、排队或已安排的工作，会话就会生成空闲回顾（`recap.*` 设置），将其记入历史数据库，并把完整的非空回复传给 `onRecap`；回顾不会进入会话记录或模型上下文。空闲上下文压缩（`compaction.idle*` 设置）也会等待，直到没有后台作业或交付能唤醒会话。`isBlocked` 表示所有者不希望有自主工作（正在编写草稿、已离开的视图、启动尚未完成）；`scheduledTurn` 表示所有者已决定启动一轮，但尚未接纳该轮。任一答案变化时，调用 `session.refreshIdleMaintenance()`：不再需要的工作会被丢弃，这段空闲期仍应完成的工作会以新的延迟重新准备。重复激活保留第一个所有者的选项；会话释放负责清理。

## `AgentSession` 生命周期与释放 \{#agentsession-lifecycle-and-disposal}

嵌入方完全不再使用会话时，调用 `await session.dispose()`。`dispose()` 会自行启动释放且具有幂等性：重复或并发调用得到相同的拆卸 promise，因此关闭事件和所拥有资源不会被清空两次。

`beginDispose()` 是一个同步接纳屏障，供必须先等待自身拆卸再调用 `dispose()` 的包装器使用。应在包装器的第一个 `await` 前调用它；否则延迟工作可能进入这一间隙。它会立即将会话标记为已释放，取消记忆启动、标题生成和自动学习捕获，清除排队的让出/旁路消息，停止顾问运行时，分离旁路交付，并拒绝新的 eval 执行。延迟会话工作会检查释放状态，然后被丢弃或跳过。`beginDispose()` 同样具有幂等性，之后仍需调用 `dispose()` 完成异步清理。

```ts
import type { AgentSession } from "@oh-my-pi/pi-coding-agent";

async function closeEmbeddedSession(session: AgentSession, closeHostInputAndUi: () => Promise<void>): Promise<void> {
	session.beginDispose(); // no new deferred work may enter after this point
	await closeHostInputAndUi();
	await session.dispose();
}
```

异步释放期间，会话会记录并同步刷新退出诊断，发出一次 `session_shutdown`，停止扩展回退计时器，中止重试、上下文压缩和活动智能体轮次，并给予提示后和自动学习工作有限的完成时间。随后，它并发拆卸会话拥有的异步作业、eval 内核、浏览器标签页、原生计算机会话、MCP 连接、顾问状态和记忆状态。这些子系统清空操作尽力执行，并在适用时有时间限制；失败会被记录，而不会阻止剩余子系统清理。

只有在能够追加会话条目的工作完成后，释放过程才会清理已移动的空会话、关闭 `SessionManager`、关闭提供方会话状态、断开智能体连接并移除监听器。最终持久化清理或 `SessionManager.close()` 的失败会使共享释放 promise 被拒绝；单个提供方会话关闭失败会被记录。

## 工具与扩展集成 \{#tools-and-extension-integration}

### 内置工具与过滤 \{#built-ins-and-filtering}

- 内置工具来自 `createTools(...)` 和 `BUILTIN_TOOLS`。
- `toolNames` 请求指定名称的工具，并可启用默认
  禁用的工具；它本身**不是**允许列表。
- 设置 `restrictToolNames: true` 可将会话限制为
  `toolNames` 中的名称。受限会话默认禁用环境中的 MCP、扩展、自定义
  命令和 LSP。
- 受限子会话保留父会话
  `preloadedPreparedExtensions` 中的钩子/提供方，并重新绑定到自身会话。贡献的工具
  不能扩展或替换受限工具集，即使它们是在之后注册的。
- 在受限会话中，SDK 提供的 `customTools` 会被排除，除非
  `allowRestrictedCustomTools: true`，且它们的名称也出现在
  `toolNames` 中。
- 隐藏工具（例如 `yield`）需要选择启用，除非选项要求使用它们。

```ts
const { session } = await createAgentSession({
	toolNames: ["read", "grep", "glob", "write"],
	restrictToolNames: true,
	requireYieldTool: true,
});
```

### 扩展 \{#extensions}

- `extensions`：内联 `ExtensionFactory[]`。进程内子会话会重新绑定
  它们；工作线程子代理无法导入闭包，因此会在没有它们的情况下运行
  （参见[扩展加载](./extension-loading.md#restricted-children-and-revival)）。
  必须在那里运行的钩子应放在扩展文件中。
- `additionalExtensionPaths`：加载额外的扩展文件
- `disableExtensionDiscovery`：禁用环境扫描；显式路径和
  内联工厂仍会加载
- `preloadedExtensions`：复用同一
  会话所属进程提前加载的扩展集。切勿将父会话已加载的扩展实例传给
  另一个会话；应使用 `preloadedPreparedExtensions`，使每个会话获得
  自己的 `ExtensionAPI` 绑定。
- `preloadedPreparedExtensions`：已导入、可重新绑定的工厂，包括
  在受限子会话中使用；不会重新求值模块图。
- `extensionRoots`：用于子会话发现和恢复的实时所有者根目录提供方。
  其显式根目录、发现模式和已配置根目录优先于
  子会话本地的扩展加载输入。

### 运行时工具集更改 \{#runtime-tool-set-changes}

`AgentSession` 支持运行时激活更新：

- `getActiveToolNames()`
- `getAllToolNames()`
- `setActiveToolsByName(names)`
- `refreshMCPTools(mcpTools)`

系统提示会重新构建，以反映活动工具变化。

## 发现辅助程序 \{#discovery-helpers}

当你希望部分控制发现行为，但不想重建内部发现逻辑时，使用这些辅助程序：

- `discoverAuthStorage(agentDir?, options?)`（有效设置/cwd 和凭据发现选项）
- `discoverExtensions(cwd?)`
- `discoverSkills(cwd?, _agentDir?, settings?)`
- `discoverContextFiles(cwd?, _agentDir?, disabledExtensions?)`
- `discoverPromptTemplates(cwd?, agentDir?)`
- `discoverSlashCommands(cwd?)`
- `discoverCustomTSCommands(cwd?, agentDir?)`
- `discoverMCPServers(cwd?)`
- `buildSystemPrompt(options?)`

## 宿主集成选项 \{#host-integration-options}

- `hasUI` 默认为 `false`；只应为具有交互式 UI 的宿主启用。
- `interactivePrompts` 默认为 `hasUI`。能够回答
  同步提示的非 TUI 宿主可将其设置为 `true`，以启用 `ask`，而不启用
  LSP 预热等仅面向 UI 的启动行为。
- `telemetry: {}` 启用智能体循环 OpenTelemetry span。没有注册
  宿主 OpenTelemetry SDK 时，API 使用无操作 tracer。
- `additionalDirectories` 添加绝对路径或相对于 cwd 的工作区根目录。
- `providerSessionId` 可以复用提供方侧的会话身份，同时保持会话
  持久化隔离；`providerPromptCacheKey` 设置独立的缓存键。
- `systemPromptTemplate`、`customSystemPrompt`、`appendSystemPrompt` 和
  `systemPrompt` 控制不同的提示层。其
  替换与发现契约参见[系统提示自定义](./system-prompt-customization.md)。

## 面向子代理的选项 \{#subagent-oriented-options}

适用于构建编排器的 SDK 使用者（类似任务执行器流程）：

- `outputSchema`：将结构化输出预期传入工具上下文
- `outputSchemaMode`：选择宽松或严格的结构化输出强制执行方式
- `requireYieldTool`：强制包含 `yield` 工具
- `taskDepth`：嵌套任务会话的递归深度上下文
- `parentTaskPrefix`：嵌套任务输出的产物命名前缀
- `bindProcessState`：代表宿主会话生成的辅助会话应设为 `false`（见下文）

这些选项对于常规单智能体嵌入都是可选的。

跟随一个设置实例的进程级状态，即设置效果（主题、请求限制、回退凭据脱敏开关）和发现提供方开关，由每个顶层会话在其自身 `settings` 上持有，直到该会话释放。存在多个活动会话时，最新的持有者驱动该状态，释放会话会将其交还给先前的持有者。带有 `parentTaskPrefix`/`taskDepth` 或 `bindProcessState: false` 的会话永远不会取得它。无论持有者是谁，每个会话自身的提供方请求都会根据该会话的 `secrets.enabled` 对形似凭据的令牌脱敏。

## `createAgentSession()` 返回值 \{#createagentsession-return-value}

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

仅当嵌入方提供了工具/扩展应调用的 UI 能力时，才使用 `setToolUIContext(...)`。

`subagentEventBus` 在会话树中传递 `task:subagent:*` 可观测性帧。UI 宿主可以在首次绘制后调用 `startBackgroundModelDiscovery()`，启动感知缓存的在线模型发现。

## 启动性能 \{#startup-performance}

`createAgentSession()` 运行两项后台优化，使 I/O 与其余会话设置重叠：

- **模型主机预热。** `prewarmModelConnection(model)`（`packages/ai/src/providers/connection-prewarm.ts`）通过真实请求使用的同一传输通道（代理、额外 CA、TLS 选项），向模型 API 源站发送不带凭据的 `HEAD`，使下一个请求复用池化 socket，而不必付出 DNS + TCP + TLS 的成本。SDK 在模型解析后立即发起它，与会话设置重叠；交互式 UI 在空闲时重复执行（首帧、模型变化、键入），按每个源站每 30 秒一次节流。第一方 Anthropic 会提前解析其官方端点；其他模型只预热其上一次推理请求实际到达的源站，因此不会猜测分发时改写（Copilot 计划主机、`MOONSHOT_BASE_URL`、区域主机），也不会在第一次请求前预热任何内容。源站必须是提供方自身的端点（其内置基础 URL 主机或 KDL `endpoint-hosts` 条目）：自定义 `models.yml` 提供方、路由至网关的内置提供方 id，以及 `ANTHROPIC_BASE_URL`/Foundry 网关都不会被探测。失败会被静默跳过。适用于每种模式（交互式、打印、RPC、ACP）。
- **有条件的 LSP 预热。** 只有**全部**满足以下条件，才会预热启动 LSP 服务器（由 `discoverStartupLspServers(cwd)` 返回的服务器）：
   - 会话选项中启用了 LSP 集成，且 `lsp.enabled` 为 `true`，**并且**
   - `options.hasUI === true`（交互式 TUI），**并且**
   - `lsp.lazy` 设置已禁用（其默认为 `true`）。

   启用 `lsp.lazy` 时（默认行为），启动时完全不会启动语言服务器；每个服务器在首次使用时冷启动，即智能体调用 `lsp` 工具，或编辑/写入触及扩展名匹配服务器 `fileTypes` 的文件时。打印 / 脚本 / RPC / ACP 调用（`hasUI=false`）无论该设置如何都会跳过预热：它们不渲染预热状态指示器，通常也会在语言服务器稳定之前结束，因此预热只会花费 CPU，与 LLM 流消费者并发解析大型 `initialize` 响应，并使感知延迟产生抖动。实际需要 LSP 服务器的工具仍会通过 `getOrCreateClient()` 按需启动服务器，跳过的只是_启动时_预热。在延迟模式下，UI 会话返回的 `CreateAgentSessionResult` 中仍会填充 `lspServers` 字段，会发现已识别的服务器（不生成进程）并以 `"available"` 状态报告，使欢迎屏幕和 `/status` 可以列出它们；LSP 集成或 `lsp.enabled` 禁用，或者 `hasUI` 为 false 时，该字段为 `undefined`。在会话中途关闭 `lsp.lazy`（通过 `/settings` 或任何 `settings.set()`/重新加载），会为这些服务器运行一次相同的预热，原地更新其状态，并发出常规的 `lsp:startup` 事件。

## 最小受控嵌入示例 \{#minimal-controlled-embed-example}

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
