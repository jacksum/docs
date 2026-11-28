---
title: "扩展与自定义工具的 TUI 集成"
description: "Oh My Pi 官方仓库文档：扩展与自定义工具的 TUI 集成。"
---

# 扩展与自定义工具的 TUI 集成 \{#tui-integration-for-extensions-and-custom-tools}

本文档介绍 `packages/coding-agent` 和 `packages/tui`（`@oh-my-pi/pi-tui`）用于扩展 UI、自定义工具 UI 和自定义渲染器的**当前** UI 契约。

## 此子系统是什么 \{#what-this-subsystem-is}

运行时分为两层：

- **UI 库（`packages/tui`）**：响应式运行时和 JSX、保留式节点树、原生后端（Tern Surface Protocol）和终端后端（布局、各类型绘制器、焦点/输入控件、帧写入器）、终端驱动（I/O）、文本和主题。
- **集成层（`packages/coding-agent/src/ui/**`、`src/modes/**`）**：交互式外壳、界面、工具呈现器，以及挂载扩展/自定义工具视图、连接快捷键/主题并恢复输入编辑器的控制器。

## 各模式下的运行时行为 \{#runtime-behavior-by-mode}

| 模式 | `ctx.ui.custom(...)` 可用性 | 说明 |
| --- | --- | --- |
| 交互式 TUI | 支持 | 视图会替代输入编辑器显示，或显示为覆盖层，并获得焦点，需要调用 `done(result)` 才能完成。 |
| 后台/无头模式 | 不可交互 | UI 上下文不执行操作（`hasUI === false`）。 |
| RPC 模式 | 不挂载 | `custom()` 作为不受支持的 UI 实现，返回 `undefined as never`；不要在 RPC 处理器中依赖交互式 UI。 |

如果扩展/工具可以在无头模式运行，请使用 `ctx.hasUI` / `pi.hasUI` 做保护判断。RPC 可以为协议支持的对话框暴露 `hasUI === true`，但仍不支持 `custom()`；单凭 `hasUI` 并不能保证组件可挂载。

## 项目本地 TUI 调试工具 \{#project-local-tui-debug-tool}

`.omp/tools/tui.ts` 提供仓库的 `tui` 调试工具。`start` 接受
TypeScript/JavaScript `file`（使用 Bun 运行；在编译后的 `omp`
二进制程序下使用 `PATH` 上的 `bun`），或者接受可执行的 `bin` 与独立的 `args`。
Windows 使用原生 ConPTY，无需 POSIX shell；macOS/Linux 使用
Bun 的 PTY。
调试连接使用 Windows 命名管道或 POSIX Unix 套接字。
在 Windows 上，`start` 和 `resize` 使用原生 `normalizePtyDimensions(cols, rows)`
辅助函数，返回限制在 20-400 列和 5-200 行范围内的整数尺寸。
PTY、模拟屏幕和报告尺寸使用相同的生效尺寸。

`screen`、`send`、`resize` 和 `stop` 也可用于没有
`OMP_TUI_DEBUG` 服务器的程序。渲染器查询（`info`、`tree`、`values` 和 `frame`）
需要 omp/pi-ui 宿主：设置 `OMP_TUI_DEBUG` 后，`startHost`（`packages/tui/src/host.ts`）会延迟加载
`packages/tui/src/debug/server.ts` 中的服务器。
`packages/tui/examples/debug-demo.tsx` 是可用于尝试这些查询的最小宿主。

服务器每行返回一个 JSON 对象：

| 操作 | 响应 |
| --- | --- |
| `text` | 最近一次呈现帧中屏幕上的 `lines`（备用屏幕上全屏层的行）、`window_top`（视口上方的历史行）、`alt_screen`、`cursor`（`{x, y, visible}`，隐藏时不存在）。首帧之前为 `no frame painted yet`。 |
| `frame` | `lines`：终端确认已写入的每一行历史，随后是屏幕行。 |
| `tree` | `root`：包含 `main` 和 `dock` 区域节点的 `surface` 节点；`overlays`：每个 `layer` 节点对应一个条目，包含 `band`（其 `anchor`/`size`）和 `hidden`。节点带有 `kind`、`id`（节点键）、`hidden`、`focused` 和 `focusable`（终端渲染器将按键路由到该类型的控件）。 |
| `values` | 对于每个具有终端控件的节点以及获得焦点的节点：其传输属性（不含 `term` 和函数属性）及控件状态，以 `kind#key` 或 `kind[region:index.index…]` 为键。 |
| `info` | `columns`、`rows`、`pid`、`native`、`overlays`（层节点）、`focused`（类型）、`focus`（`region:keypath`）、`alt_screen`、`cursor`。 |
| `doc` | `doc`：每个区域以其原生（TSP）树（`describeTree`）描述，并附带焦点键路径。两个渲染器均提供此功能。 |
| `tsp` | `native`，以及 `frames`：原生表面最近发送的 TSP 帧（保留 64 帧；由 `n` 限制数量）。 |
| `keys`、`bytes`、`paste`、`mouse` | 注入输入：组合键和字面文本会编码为终端字节，由驱动的输入解码器解码，并交付给驱动的输入监听器，因此拦截器、焦点路由和 `onKey` 会将其视为真实输入。`paste` 交付一个粘贴事件。 |
| `quit` | 返回响应，停止宿主，以 0 退出。 |

不提供组件矩形：覆盖层的 `band` 是层节点的
`anchor`/`size` 属性，`values` 报告属性和控件状态，而 `doc`
描述实时表面。原生（Tern）表面没有
终端帧：`text` 和 `frame` 返回 `native surface: the terminal
renders it`；在该环境中请使用 `doc`、`tsp`、`tree` 和 `values`。

`send` 接受字面文本和 `\e`、`\r`、`\n`、`\t`、`\xNN` 转义。
在 Windows 上，每个载荷都需要包含完整、有效的 UTF-8；无效或截断的
序列会在写入任何输入之前被拒绝。Windows PTY 字符串 API 不支持任意非 UTF-8 字节
（例如 `\x9b` 8 位 CSI）。
请改用兼容 UTF-8 的 `\e[` CSI 序列。macOS/Linux 保留原始字节。

使用 `bun install --cwd .omp/tools` 安装此工具的依赖。
原生 PTY API 发生变更时，需要先通过
`bun --cwd=packages/natives run build` 重新构建插件，再运行工具。
使用 `bun test ./.omp/tests/tui.test.ts` 运行其真实 PTY 回归测试。CI 只在
Linux 上运行这些测试；Windows 专用用例只在本地 Windows 宿主上运行。

## 组件模型（`@oh-my-pi/pi-tui`） \{#component-model-oh-my-pipi-tui}

- **信号**（`packages/tui/src/reactive.ts`）：`signal`、`computed`、`effect`、`batch`、`untrack`、`onCleanup`、上下文。同步且不会出现中间状态不一致。
- **无需编译器的 JSX**（`jsx-runtime.ts`、`element.ts`）：以 `/** @jsxImportSource @oh-my-pi/pi-tui */` 开始一个 `.tsx` 文件。函数组件运行一次；作为属性或子项传入的函数具有响应性。控制流：`Show`、`For`、`Index`、`Switch`/`Match`、`Dynamic`（`flow.ts`）。
- **节点**（`node.ts`）：小写标签创建保留式 `UiNode`。其类型是 TSP 传输类型（`col`、`row`、`text`、`md`、`code`、`card`、`spinner`、`list`、`picker`、`editor`、…），外加仅用于终端的 `canvas`。节点具有响应式属性、子项、`key` 和处理器（`onSelect`、`onActivate`、`onAction`、`onChange`、`onEdit`、`onSend`、`onKey`、`onPaste`、…）。
- **表面**（`surface.ts`）：`createSurface(template)` 构建三个区域：`main`（会话记录流；`settle(node)` 将一个块标记为最终确定，以便终端后端将其写入滚屏历史一次）、`dock`（输入编辑器等实时界面元素）和 `layer`（覆盖层；全屏层使用备用屏幕）。表面拥有键盘焦点。
- **宿主**（`host.ts`）：终端支持 TSP（Tern）时，`startHost({ surface, theme, onKey, intercept, … })` 原生渲染表面；其他情况下使用终端后端。

### 终端后端：绘制器、角色、控件 \{#terminal-backend-painters-roles-widgets}

- **绘制器**（`packages/tui/src/term/paint.ts`、`term/painters/*`）：`definePainter(kind, painter)` 注册 `paint(node, cx) → Block`（`rows`、可选光标、命中矩形、图片）。块按节点、宽度及读取的信号缓存。
- **角色**：`defineRolePainter(kind, role, painter)` 会为 `role` 属性匹配的节点覆盖某类型的外观；coding-agent 用它为界面保持特定外观（`packages/coding-agent/src/ui/styles/**`）。
- **控件**（`term/widgets.ts`、`term/widgets/*`）：`defineWidget(kind, widget)` / `defineRoleWidget` 为可聚焦类型提供 `key`、`paste` 和 `mouse` 行为。控件发出与 Tern 终端相同的事件（`editor` 编辑、`picker` 选择/激活、`button` 操作）。

Coding-agent 将表面包装在 `Shell`（`packages/coding-agent/src/ui/shell/shell.ts`）中：控制器追加会话记录块（`shell.transcript`）、填充停靠槽位（`shell.dock`）并打开覆盖层；它们从不自行构建区域。

## 渲染约束（终端安全） \{#rendering-constraints-terminal-safety}

节点由 pi-tui 布局和绘制；只有在行对象（`{ render(width): string[] }`，绘制为 `canvas` 节点）中，你才需要自行管理宽度：

1. 超过 `width` 的行会被裁切；即便如此，也应返回宽度安全的行。
2. **测量视觉宽度**，而不是字符串长度：`visibleWidth()`。
3. 使用 `truncate()` / `wrap()` **截断/换行包含 ANSI 的文本**。
4. 使用 `replaceTabs()` **清理外部内容中的制表符**。

这四个函数都来自 `@oh-my-pi/pi-tui/text/width`。

```ts
import { replaceTabs, truncate } from "@oh-my-pi/pi-tui/text/width";

const rows = { render: (width: number) => lines.map(line => truncate(replaceTabs(line), width)) };
```

## 输入处理与快捷键 \{#input-handling-and-keybindings}

### 按键 \{#keys}

在终端后端中，按键会从获得焦点的节点沿焦点路径向上传递给 `onKey(key)` 处理器（返回 `true` 可停止传递），然后交给获得焦点类型的控件（`editor` 将其转换为 `edit` 事件），最后交给宿主的全局 `onKey`。`KeyEvent.id` 是规范形式（`ctrl+c`、`shift+enter`、`up`、`a`）；`kind` 为 `press`、`repeat` 或 `release`。`ctx.ui.custom` 中的行对象则在 `handleInput(data)` 中接收原始按键和粘贴输入。

### 匹配应用快捷键操作 \{#match-app-keybinding-actions}

扩展 UI 工厂会收到 `KeybindingsManager`（交互模式下；这是携带默认绑定的内存实例，而不是用户的 `keybindings.yml`），因此你可以匹配操作 id，而不必硬编码按键：

```ts
<col onKey={key => (keybindings.matches(key, "app.interrupt") ? (done(undefined), true) : false)}>…</col>
```

### 内置控件遵循键位映射 \{#built-in-widgets-follow-the-keymap}

pi-tui 的终端控件（`picker`、`prefs`、`menu`、`button`/`buttons`、`editor`/`input`）从控件键位映射读取按键，而不使用固定的按键 id：`select.up`/`down`/`pageUp`/`pageDown`/`confirm`/`cancel`，以及 `editor.*` 移动和编辑操作（`@oh-my-pi/pi-tui/term/keymap`）。键位映射加载或重新加载时，omp 会根据用户的 `tui.select.*`、`tui.editor.*` 和 `tui.input.newLine` 绑定填充它（`setWidgetKeymap`），因此 UI 中的列表或文本字段无需自行匹配按键，就会遵循重映射。以 `esc`（或 `enter`）为键的选择器操作，也会在其他 `select.cancel`（`select.confirm`）按键上运行。

### 鼠标 \{#mouse}

若要在终端覆盖层中接收滚轮输入，请使用 `ctx.ui.custom(factory, { overlay: true, mouse: "click" })` 打开它。使用 `"drag"` 还可接收按键拖动，使用 `"any"` 则可接收所有移动。`"off"` 禁用报告；省略时继承底层模式。关闭覆盖层会恢复该模式。

`<canvas>` 通过 `onMouse(event)` 接收其绘制行上的报告。`row` 和 `col` 是从零开始的画布坐标。滚轮刻度使用 `button: "wheel-up"` 或 `"wheel-down"`（也包括 `"wheel-left"` 和 `"wheel-right"`），并带有 `action: "press"`。返回 `true` 可消费该报告。画布 `onMouse` 仅用于终端，不在 Tern 中运行。

## 焦点、覆盖层与光标 \{#focus-overlays-and-cursor}

- 表面跟踪一个获得焦点的节点；两个后端都会在该处绘制插入光标/焦点框，并将按键路由到它。
- 不带选项的 `ctx.ui.custom(factory)` 会替代输入编辑器显示视图；`{ overlay: true }` 会将其绘制在会话记录上方，`fullscreen: true` 则在备用屏幕上绘制。`onHandle` 接收 `{ closed, close(), isFocused() }`；`isFocused()` 报告键盘焦点是否位于覆盖层或其内部节点上。
- `editor`/`input` 节点自行定位终端光标；行对象没有光标。

### 内置全屏表面 \{#built-in-full-screen-surfaces}

coding-agent 集成还会在 `ctx.ui.custom(...)` 之外挂载内置全屏表面。[智能体中心](./agent-hub.md) 是子代理的实时名单和控制表面。其文件支持的会话记录查看器打开期间会借用备用屏幕，关闭时恢复下方的中心界面。

## 挂载点与返回契约 \{#mount-points-and-return-contracts}

## 1) 扩展 UI（`ExtensionUIContext`） \{#1-extension-ui-extensionuicontext}

当前签名（`extensibility/extensions/types.ts`）：

```ts
custom<T>(factory: ExtensionCustomFactory<T>, options?: ExtensionCustomOptions): Promise<T>

type ExtensionCustomFactory<T> = (
  ui: ExtensionUiHost, // requestRender(), size(), suspend(run)
  theme: ExtensionTheme,
  keybindings: KeybindingsManager,
  done: (result: T) => void,
) => ExtensionRender | Promise<ExtensionRender>;
```

`ExtensionRender`（`extensibility/extensions/render-types.ts`）是 pi-tui 节点或行对象（`render(width)`，可选 `handleInput(data)`、`dispose()`）。

交互模式下的行为（`extension-ui-controller.ts`）：

- 保存输入编辑器文本。
- 没有 `options.overlay` 时，替代输入编辑器显示你的视图；有该选项时，以覆盖层显示（`fullscreen` 用于备用屏幕）。
- `options.onHandle` 接收覆盖层句柄。
- `options.signal` 会中止流程，并以信号的原因（或 `AbortError`）拒绝其 promise；取消后返回的视图会被释放，而不是挂载。
- 将焦点置于你的视图：节点根获得焦点（通过 `onKey` 处理按键）；行对象在 `handleInput` 中接收原始输入。
- 在 `done(result)` 时：释放视图，若存在覆盖层则将其关闭，恢复输入编辑器及其文本，并兑现 promise。
  调用 `done(...)` 以成功完成；工厂失败和信号取消会拒绝 promise。

## 2) Hook/自定义工具 UI 上下文（`HookUIContext`） \{#2-hookcustom-tool-ui-context-hookuicontext}

`extensibility/hooks/types.ts` 中的 `custom(factory)` 接受与
`ExtensionUIContext.custom` 相同的工厂（不带选项）。当 hook 也可能在无头模式运行时，
请用 `pi.hasUI` 保护仅用于终端的 UI。

## 3) 自定义工具调用/结果渲染器 \{#3-custom-tool-callresult-renderers}

自定义工具和扩展工具可以从以下方法返回 `ExtensionRender`：

- `renderCall(args, options, theme)`
- `renderResult(result, options, theme, args?)`

`options`（`RenderResultOptions`、`tools/details/renderer.ts`）包含 `expanded`、`isPartial`、`spinnerFrame?`，以及 `argsComplete` 等调用状态标志。

`packages/coding-agent/src/ui/tools/legacy.ts` 运行这些 hook，并在自定义工具框内绘制其各个部分。节点由终端和 Tern 绘制；行对象只由终端绘制（Tern 保留通用工具卡片）。参见[渲染扩展点](./extensions.md#rendering-extension-points)。

## 生命周期与取消 \{#lifecycle-and-cancellation}

- 节点随视图一起释放；请在视图内通过 `onCleanup` 注册定时器、子进程、监听器或套接字的清理操作，或使用行对象上的 `dispose()`。清理操作必须幂等。
- 视图应调用 `done(...)` 恰好一次。
- 对于可取消的长时间运行 UI，通过 `options.signal` 传入 `AbortSignal`，或在自己的取消按键中调用 `done(undefined)`。

## 暂停状态 \{#pause-status}

`/pause` 界面在 ANSI 和 TSP 中显示相同的本地轮次与任务状态：正在排空的轮次和正在运行的任务会计数，已停放或已完成的轮次不计数。当两个计数均归零时，界面会隐藏这些行并发出就绪信号。这些计数只覆盖 OMP 跟踪的工作，而不是设备范围内的空闲状态。

## 贴近实际的自定义视图示例（扩展命令） \{#realistic-custom-view-example-extension-command}

```tsx
/** @jsxImportSource @oh-my-pi/pi-tui */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { signal } from "@oh-my-pi/pi-tui";

export default function extension(pi: ExtensionAPI): void {
	pi.registerCommand("pick-model", {
		description: "Pick a model profile",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) return;

			const cursor = signal("fast");
			const selected = await ctx.ui.custom<string | undefined>((_ui, _theme, keybindings, done) => (
				<picker
					items={[
						{ id: "fast", label: "Fast" },
						{ id: "balanced", label: "Balanced" },
						{ id: "quality", label: "Quality" },
					]}
					selected={cursor}
					onSelect={id => cursor.set(id)}
					onActivate={id => done(id)}
					onKey={key => (keybindings.matches(key, "app.interrupt") ? (done(undefined), true) : false)}
				/>
			));

			if (selected) ctx.ui.notify(`Selected profile: ${selected}`, "info");
		},
	});
}
```

## 关键实现文件 \{#key-implementation-files}

- `packages/tui/src/reactive.ts`、`element.ts`、`flow.ts`、`node.ts`：信号、JSX、控制流、节点模型。
- `packages/tui/src/surface.ts` / `host.ts`：区域、焦点、最终确定；原生渲染与终端渲染。
- `packages/tui/src/term/paint.ts`、`term/painters/*`、`term/widgets.ts`、`term/widgets/*`、`term/keymap.ts`：绘制器、角色、控件、控件键位映射。
- `packages/tui/src/driver/input/*`：终端输入解码（`keys.ts`：按键 id）。
- `packages/tui/src/text/width.ts`：宽度/截断/换行/制表符原语。
- `packages/coding-agent/src/config/keybindings/keybindings.ts` / `app-keybindings.ts`：操作映射、磁盘加载、控件键位映射填充。
- `packages/coding-agent/src/ui/shell/*`：交互式外壳（会话记录、停靠区、覆盖层）。
- `packages/coding-agent/src/modes/controllers/extension-ui-controller.ts`：扩展/hook/自定义工具 UI 的交互式挂载/卸载。
- `packages/coding-agent/src/ui/extensions/render-output.tsx`：将 `ExtensionRender` 转换为节点（行 → `canvas`）。
- `packages/coding-agent/src/extensibility/extensions/types.ts`、`render-types.ts`：扩展 UI 和渲染器契约。
- `packages/coding-agent/src/extensibility/hooks/types.ts`：hook UI 契约。
- `packages/coding-agent/src/extensibility/custom-tools/types.ts`：自定义工具执行/渲染契约。
- `packages/coding-agent/src/ui/tools/legacy.ts`：运行 `renderCall`/`renderResult` hook。
- `packages/coding-agent/src/tools/context.ts`：工具 UI 上下文传播（`hasUI`、`ui`）。
