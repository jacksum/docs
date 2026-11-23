# SDK \{#sdk}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 SDK](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/sdk.md)。[上游 MIT 许可证](./license.md)。

`@earendil-works/pi-coding-agent` 将 Pi 嵌入 Node.js 或 Bun 进程。它允许你通过 TypeScript 直接访问命令行应用使用的智能体、会话、工具、模型和资源。

需要在进程内通过 TypeScript 集成时，请使用 SDK。如果集成需要不依赖特定语言，或需要隔离的子进程，请参阅[命令行集成](./cli-integration.md)。

```typescript
import { createAgentSession } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession();

try {
  await session.prompt("What files are in the current directory?");
  console.log(session.getLastAssistantText());
} finally {
  session.dispose();
}
```

此示例使用工作目录、发现的资源、保存的设置和已配置的凭据。运行结束时，`prompt()` 的 Promise 完成。

[完整的最小示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/01-minimal.ts)还会流式传输文本事件。所有 [SDK 示例](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/sdk/)都随仓库一起接受类型检查。

<a id="session-management"></a>

## 会话生命周期 \{#session-lifecycle}

`createAgentSession()` 创建一个 `AgentSession`。该会话管理一次对话、其模型和工具、排队消息、上下文压缩状态以及扩展运行时。

通过 `session.messages`、`session.model`、`session.thinkingLevel`、`session.systemPrompt` 和 `session.getActiveToolNames()` 读取当前状态。

`session.systemPrompt` 为只读，返回当前实际生效的系统提示词，包括尚未发送给模型的改动。Pi 会在下次请求前向模型声明工具改动。

<a id="sessionmanager-api"></a>

### 会话存储 \{#session-storage}

会话默认持久化保存。`SessionManager` 管理持久化或内存中的会话条目树，并跟踪当前叶节点。切换分支只会更改叶节点，不会删除离开的分支。Pi 重建模型上下文时，管理器会选择当前分支并应用上下文压缩。

最终的模型上下文以 `SessionManager` 为准。要恢复外部历史，请使用包含这些条目的管理器构造会话。给 `session.agent.state.messages` 赋值不会替换持久化的上下文。

如果宿主不需要会话文件，请使用内存管理器：

```typescript
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
});
```

[会话示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/11-sessions.ts)展示了创建、打开、继续、列出和派生会话的方法。[会话文件格式](./session-format.md)定义持久化 JSONL 的约定，[消息类型](./message-types.md)定义会话记录中的消息值。具体方法及签名以导出的 TypeScript 声明或 [`session-manager.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/core/session-manager.ts) 为准。

`cwd` 选择工作区，该工作区用于查找项目资源和上下文文件、归类会话，以及解析内置工具使用的路径。如果目标目录不同于 `process.cwd()`，请显式传入 `cwd`。

`session.dispose()` 中止活动工作、使扩展上下文失效、断开与智能体的连接并移除事件监听器。无需继续使用会话时调用它。

`AgentSessionRuntime` 新增 `newSession()`、`switchSession()`、`fork()` 和 `importFromJsonl()`。每项操作都会替换当前 `AgentSession`，并为目标工作目录重新创建服务。

替换运行时后，订阅仍属于旧 `AgentSession`，须重新绑定。参阅[会话运行时示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/13-session-runtime.ts)。

## 发送提示词 \{#prompting}

`prompt()` 会先处理扩展命令并展开基于文件的提示词模板，再将普通用户消息交给智能体。智能体接受并开始运行后，`prompt()` 会等到本次运行结束，包括所有自动重试，然后完成。

如果会话已经在流式输出，发送提示词时必须明确它是引导当前运行，还是等运行结束后再处理。没有指定时，`prompt()` 会拒绝该调用，不会自行选择。

引导消息在当前助手轮次及其工具调用结束后进入智能体。后续消息在当前运行完成待处理工作后进入。`steer()` 和 `followUp()` 直接提供这两种行为。如果输入已加入队列（包括经扩展转换后入队），返回 `"queued"`；如果扩展已处理该输入，返回 `"handled"`。

`abort()` 停止当前操作，并等会话进入空闲状态。`waitForIdle()` 只等待，不中止操作。

## 订阅事件 \{#subscribing-to-events}

宿主需要流式输出时，请在发送提示词前订阅事件：

```typescript
const unsubscribe = session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

try {
  await session.prompt("Explain this repository");
} finally {
  unsubscribe();
}
```

会话事件报告消息更新、工具执行、队列、上下文压缩、重试和运行生命周期变化。

`message_end` 中的消息是最终的完整消息。`agent_end` 标记一次底层智能体运行结束，但之后仍可能进行自动恢复或处理排队工作。

宿主需要确认 Pi 不会自动继续时，请使用 `agent_settled`。

## 配置会话 \{#configuring-a-session}

未提供覆盖值时，工厂会创建 `ModelRuntime`、以文件为后端的 `SettingsManager`、持久化的 `SessionManager`、`DefaultResourceLoader` 和已配置的默认工具。

可以逐项显式提供这些组件和配置：

- `modelRuntime`、`model`、`thinkingLevel` 和 `scopedModels` 控制模型访问和选择。
- `settingsManager` 提供合并后的设置或内存中的配置。
- `sessionManager` 提供持久化或内存中的对话历史。
- `resourceLoader` 提供扩展、技能、提示词模板、主题和上下文文件。
- `tools`、`noTools`、`excludeTools` 和 `customTools` 控制启用的工具集合。

需要保留标准发现方式、只覆盖部分内容时，请使用 `DefaultResourceLoader`。宿主完全自行管理资源存储和发现时，请提供自定义 `ResourceLoader`。

<a id="inlineextension"></a>

内联扩展工厂可由 `DefaultResourceLoader` 提供。只有在诊断信息和启动输出中必须使用稳定名称时，才为工厂指定 `InlineExtension` 名称。如果具名内联扩展设有 `replaceable: true`，而另一扩展加载时注册了同名工具、命令或选项，则省略该内联扩展，避免同时加载产生冲突。CLI 内置的 Codemode、工具搜索和 MCP 扩展都是可替换的。

带 `builtin: true` 的具名条目不属于内联扩展。它提供 `builtin:<name>` 扩展的代码，加载方式与配置中的扩展文件相同。该扩展默认加载，在 `pi config` 中列出，可以在 `extensions` 设置中用 `-builtin:<name>` 禁用，或通过 `noExtensions` 禁用。使用 `additionalExtensionPaths: ["builtin:<name>"]` 可显式加载。它在项目信任判定之后才加载，因而不能处理 `project_trust`。CLI 的内置扩展使用这种方式。

<a id="codemode-mcp"></a>

CLI 将 `codemode`、`tool_search` 和 MCP 作为内置扩展加载，SDK 会话不自动加载它们。请将 `createCodemodeExtension()`、`createToolSearchExtension()` 和 `createMcpExtension()` 加入 `DefaultResourceLoader` 的 `extensionFactories`。注册时，`codemode` 和 `tool_search` 都未启用。可通过 `defaultTools` 设置启用它们（`["+codemode", "+tool_search"]` 保留其他默认工具），或让 MCP 扩展根据服务器的工具暴露方式启用：`codemode` 对应 `codemode`，`deferred` 对应 `tool_search`。MCP 扩展会在 `session_start` 时连接服务器，因此请调用 `session.bindExtensions()`。参阅 [Codemode 和 MCP 示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/14-codemode-mcp.ts)。

另见[模型](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/02-custom-model.ts)、[工具](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/05-tools.ts)、[扩展](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/06-extensions.ts)和[完全控制](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/12-full-control.ts)的专项示例。

## 示例 \{#examples}

| 示例 | 用途 |
|---|---|
| [最小示例](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/01-minimal.ts) | 创建会话、发送提示词、观察会话并释放资源。 |
| [自定义模型](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/02-custom-model.ts) | 选择模型和思考级别。 |
| [系统提示词](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/03-custom-prompt.ts) | 替换系统提示词或在其末尾追加内容。 |
| [技能](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/04-skills.ts) | 发现、筛选和添加技能。 |
| [工具](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/05-tools.ts) | 选择内置工具及其工作目录。 |
| [扩展](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/06-extensions.ts) | 加载基于文件的扩展和内联扩展。 |
| [上下文文件](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/07-context-files.ts) | 添加或替换项目指令。 |
| [提示词模板](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/08-prompt-templates.ts) | 添加基于文件的提示词模板。 |
| [凭据](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/09-api-keys-and-oauth.ts) | 配置凭据与模型存储。 |
| [设置](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/10-settings.ts) | 提供以文件为后端的设置或内存设置。 |
| [会话](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/11-sessions.ts) | 控制会话的持久化和恢复。 |
| [完全控制](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/12-full-control.ts) | 替换默认的发现和状态服务。 |
| [会话运行时](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/13-session-runtime.ts) | 安全替换当前会话。 |
| [Codemode 和 MCP](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/sdk/14-codemode-mcp.ts) | 添加 `codemode`、`tool_search` 和 MCP 扩展。 |

<a id="exports"></a>

## 参考资料 \{#resources}

- [选择模型](./models.md)介绍模型选择及兼容端点，[模型提供方](./providers.md)说明凭据和各提供方的具体配置。
- [配置](./configuration.md)解释常规的资源发现和设置，[设置](./settings.md)列出全部设置项。
- [会话与上下文](./sessions.md)介绍会话行为，[会话文件格式](./session-format.md)定义持久化条目，[消息类型](./message-types.md)定义通用的会话记录值。
- [扩展](./extensions.md)、[技能](./skills.md)和[提示词模板](./prompt-templates.md)介绍通过 `ResourceLoader` 提供的资源。
- [命令行集成](./cli-integration.md)介绍输出、JSON 和 RPC 模式，可替代进程内 SDK 集成。
