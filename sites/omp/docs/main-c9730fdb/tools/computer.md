---
title: "computer Eval 前置环境"
description: "Oh My Pi 官方仓库文档：computer Eval 前置环境。"
---

# computer Eval 前置环境 \{#computer-eval-prelude}

> 从 Eval 通过直接 `computer` 辅助方法及窗口/元素句柄，或通过 `computer.run` 中的持久 JavaScript 驱动真实宿主桌面：枚举窗口和显示器、截图、发送原生输入、使用操作系统无障碍功能（AX），以及访问剪贴板。这不是 `browser` 前置环境，不提供 DOM。

用户设置、权限、安全指引、示例和平台限制：[可脚本化的计算机操作](../computer-use.md)。

## 源码 \{#source}

- 前置环境工厂和宿主服务：`packages/coding-agent/src/tools/computer.ts`
- 直接辅助方法调用渲染器和批准策略：`packages/coding-agent/src/tools/computer/call.ts`
- Eval 门面：`packages/coding-agent/src/tools/computer/{prelude.js,prelude.py,declarations.d.ts}`
- 面向模型的前置环境文档：`packages/coding-agent/src/prompts/tools/computer.md`
- 计算机操作提示：`packages/coding-agent/src/prompts/system/computer-use.md`
- 前置环境注册/开关：`packages/coding-agent/src/sdk.ts`
- 实时前置环境协调：`packages/coding-agent/src/session/agent-session.ts`
- `/computer` 开关：`packages/coding-agent/src/slash-commands/builtin-modes.ts`
- 持久工作器：`packages/coding-agent/src/tools/computer/{supervisor,protocol,worker,worker-entry}.ts`
- 原生实现：`crates/natives/src/desktop/`
- 原生公共类型：`packages/natives/native/index.d.ts`

## 可用性与声明 \{#availability-and-declaration}

- `computer.enabled` 控制 Eval 前置环境，默认为 `false`。`/computer` 在当前会话中切换它，不持久保存设置。
- 前置环境仅通过已启用的 Eval 运行时可用；它不是 AgentTool。
- 工作器允许一个活动 run；并发的直接辅助方法/run 会以 `Computer worker is busy` 失败。run 期间仍可检查能力。活动 Eval 文档和全局变量会随当前启用状态更新。
- 与 `browser` 不同，此前置环境可操作 IDE、终端、原生应用、浏览器窗口和系统对话框。它没有浏览器 DOM 或网页 ARIA 接口；其无障碍方法使用宿主操作系统。
- 会话开始时启用此功能，会在首次调用前将 computer 指南包含在 Eval 工具描述中。它也始终可在 `help://eval/computer` 阅读。会话中途启用时则改为告知该链接，因为已公布的描述是冻结的。

## 设置 \{#settings}

| 设置 | 类型 | 默认值 | 约定 |
| --- | --- | ---: | --- |
| `computer.enabled` | boolean | `false` | 启用 Eval 前置环境。 |
| `computer.display` | string | `active` | 捕获与焦点窗口重叠面积最大的显示器（回退到主显示器）；可显式使用 `all` 或原生显示器 ID。 |
| `computer.maxWidth` | number | `3840` | 截图最大宽度。 |
| `computer.maxHeight` | number | `2400` | 截图最大高度。 |
| `computer.takeover` | enum | `fallback` | 窗口输入调用的后台路径不可用时如何处理，以及由谁决定接管：`fallback` 在接管模式下将该调用重跑一次，将焦点交还用户应用，并在 run 输出中报告；`refuse` 抛出 `BackgroundUnavailable` 而不接管，还会在发送任何内容之前拒绝 `takeover: true`、`raise()` 和 AX `raise`、`apps.open(…, { activate: true })` 或 `{ reveal: true }`、`control.acquire`、向桌面或显示器输入、非 macOS 上的 `el.focus()`，以及 macOS 上所有打开菜单的调用（右键或 Control 点击、`perform("AXShowMenu")`、弹出按钮或菜单按钮上的 `press()`/`perform("AXPress")` 或左键点击、按住、拖动，弹出按钮上的 `setValue`），或任何传入 `menu` 的调用，因为打开的菜单会占用用户键盘。`foreground` 和 `always` 是主动选择的模式，由 omp 而非模型决定：`foreground` 接管向持有输入焦点的窗口发送的输入，`always` 接管每次窗口和元素输入调用；两者都会像 `fallback` 一样重跑被拒绝的后台调用，且输入调用不接受 `takeover` 选项。此设置替代 `computer.backgroundFallback`（`takeover` 对应 `fallback`，`refuse` 保持不变）。 |

在 `refuse` 下，macOS AX `open` 也会被拒绝，因为它可能将“打开”面板所属应用移到前台；设置拒绝的每项 AX 操作，无论通过 `perform()` 的哪种名称执行，都会被拒绝。

没有 `computer.backend` 设置。原生扩展负责选择平台后端。

对于不保留原始图片细节的传输，以及作为 Claude 系列兼容性回退，有效截图上限为 `1280×896`。其他模型保留配置的限制。宿主为每次 run 快照保存 cwd、会话 id、显示器、有效上限和 `read_only`；原生桌面会话本身则保持持久存在。

## Eval API \{#eval-api}

`computer` 全局对象直接提供桌面辅助方法。每个辅助方法都是一次宿主调用（`action: "call"`），携带一个最多两步、在允许列表内的方法链：桌面根方法，可选地再跟上它解析出的窗口或元素句柄的一个方法；宿主将其渲染为 JavaScript，并在持久会话中运行：

```js
const win = await computer.window({ app: "Code" });
await win.screenshot();
const tree = await win.ax({ maxDepth: 6 });
await win.ref("e12").press();
await computer.capabilities();
await computer.close();
```

未知选项或过滤键会被拒绝，并给出辅助方法名和有效键。只有在忽略大小写、下划线和连字符后，存在唯一匹配的有效键时，才会出现拼写建议。
`windows()` 列举一次，且拒绝 `wait`；要等待一个匹配窗口，使用 `window({ ..., wait })`。
选项按所选重载检查：`wait(milliseconds)` 不接受任何选项键，元素 `press()` 或 `press({ menu })` 不接受第二参数中的输入选项键。需要这些选项时，使用 `wait(predicate, { timeout, interval })` 或 `press(chord, { takeover })`。

Python 使用相同的辅助方法名；关键字参数成为末尾的选项对象，`win.raise_()` 代替关键字 `raise`：

```python
win = await computer.window(app="Code")
await win.screenshot(silent=True)
tree = await win.ax(maxDepth=6)
await win.ref("e12").press()
await win.click(120, 48, button="right")
```

句柄是冻结快照加代理方法。`computer.window(...)` 和 `computer.focusedWindow()` 解析为带有 `id`、`app`、`title`、`pid`、`bounds` 和 `focused` 的 `ComputerWindow`；`computer.ref(...)`、`win.ref(...)`、`win.find(...)`、`computer.elementAt(...)`、`computer.focusedElement()`、`el.parent()` 和 `el.children()` 解析为带有 `ref`、`role`、`nativeRole`、`title`、`description`、`enabled`、`focused` 和 `childCount` 的 `ComputerElement` 值。窗口方法每次调用都会通过 `desktop.window(id)` 重新解析，元素方法则通过 `desktop.ref(ref)` 重新解析，因此窗口已关闭或 ref 已过期会在调用时失败。方法不可枚举，因此显示或序列化句柄只会显示其身份字段。

`computer.run(fnOrCode, { args?, read_only?, timeout? })` 在同一会话中运行多步骤函数或 JavaScript 字符串，并返回真实的结构化值。JavaScript 函数接收 `{ desktop, wait, assert }`，其中 `desktop` 包含桌面辅助方法和同步的 `capabilities()`，但没有 `run()` 或 `close()`，并且不能捕获 Eval 单元闭包；`{ args: [...] }` 会在作用域对象之后传入普通数据、函数和正则表达式。如果 `args` 既不是数组也不是 `null`，或代码字符串同时带有非空 `args`，会在 run 开始前抛出异常；`null` 不传入任何参数。代码字符串返回末尾表达式或顶层 `return`，与 Eval 单元打印它们的方式一致；以赋值或块结束的字符串不返回任何内容。Python 的 `computer.run(code, read_only=..., timeout=...)` 仅接受 JavaScript 字符串。run 内打印的非空文本会打印在外层 Eval 单元中；截图作为 Eval 图片呈现。`read_only` 默认为 `false`；`timeout` 默认为 120 秒，先受正数 `tools.maxTimeout` 限制，再限幅至 1-300 秒。宿主调用模式拒绝未知字段；JavaScript 门面只转发已识别的 run 选项。`computer.capabilities()` 报告原生后端和权限状态（`action: "capabilities"`）；`computer.close()` 结束持久桌面会话。

批准：直接调用的末端方法为纯检查时，批准级别为 `read`（`displays`、`windows`、`window`、`focusedWindow`、`screenshot`、`zoom`、`elementAt`、`focusedElement`、`ref`、`clipboard.read`、`ax`、`find`、`value`、`bounds`、`attributes`、`actions`、`parent`、`children`），输入、`raise`、`setValue`、`selectText`、`perform`、`press`、`click`、`focus` 和 `clipboard.write` 则为 `exec`；read 调用还会在工作器的只读保护下运行。`computer.run` 仅在 `read_only === true` 时为 `read`；输入格式错误、省略标志或设为 `false` 都是 `exec`。

run 拥有完整宿主访问权限，不在沙箱中。持久的 `JsRuntime` 提供 `desktop`、`wait` 和 `assert`，以及 `print`、`read`、`write`、`env` 和 `tool` 等常规辅助方法。完整的 Bun/Node 文件、进程、模块和网络 API 仍然可用。`wait(ms)` 休眠；`wait(predicate, { timeout?, interval? })` 轮询直到结果为真值。

## 桌面 API \{#desktop-api}

相同接口可通过 `computer.*` 直接访问，也可在 `computer.run` 内通过 `desktop.*` 访问。

### 发现 \{#discovery}

- `desktop.windows({ app?, title? })` 返回最多 48 个匹配的 `DesktopWindow[]`；匹配不区分大小写。应用过滤器会先在所有已列出窗口中优先精确匹配应用名，然后才按标题/id 过滤；只有不存在应用名精确匹配的窗口时，才回退到子串匹配。标题使用子串匹配。`desktop.window()` 将此规则应用于每次完成的列举，只要存在任何匹配就返回：当精确名称应用没有窗口时，`wait` 不会延迟子串匹配。每个条目是普通记录 `{ id, app, title, pid?, x, y, width, height, focused }`，坐标为平面字段，没有 `bounds`，也没有句柄方法；Python 得到 dict（`w["x"]`、`w.get("pid")`，因为平台不提供 `pid` 时该字段不存在）。`await desktop.window(w.id)` 返回门面。
  没有窗口的应用名匹配时，`app` 过滤器也接受精确应用 ID 或路径（不区分大小写），通过 `desktop.apps.list()` 返回的运行中 PID 匹配窗口；缺少进程身份时，只能按应用名匹配。ID/路径查找除了每次 100 ms 等待间隔外，每轮还需要扫描应用清单。
- `desktop.window(id | { id?, app?, title?, wait? })` 返回一个持久窗口门面。id 可以是字符串或数字（`74` 就是 id `"74"`，绝不与应用或标题匹配）。过滤器的可选 `wait` 每 100 ms 轮询，等待窗口出现；它接受 0 到 10000 的有限毫秒值，且可以取消，包括只读 run。没有 `wait` 时，只列举一次窗口。Python 关键字过滤器支持相同选项：`await computer.window(app="Preview", title="report.pdf", wait=3000)`。零匹配时抛出异常，以 `id "title"` 形式按应用分组列出打开的窗口：先是匹配过滤器 `app` 的应用（每个最多 10 个窗口，有标题的优先于无标题的），然后是焦点窗口所属应用，再是其余应用（每个最多 3 个），最多 12 个应用，并统计超出和未列出的窗口；没有应用匹配时还会额外说明。多个匹配时抛出异常并给出候选项。
- `desktop.focusedWindow()` 返回窗口门面或 `null`。
- `desktop.displays()` 返回 `DesktopDisplay[]`。
- `desktop.capabilities()` 返回截图/输入/AX 可用性、`backgroundWindowInput` 和 `takeover` 支持情况、权限状态、显示服务器、后端、显示器数量，以及 macOS 和 Windows 上的 `screenLocked`、macOS 上的 `displayAsleep`。

窗口门面提供不可变的 `id`、`app`、`title`、可选 `pid`、`bounds` 和 `focused` 字段。

### 应用与显示器句柄 \{#applications-and-display-handles}

- `desktop.apps.list({ query?, runningOnly? })` 返回 `{ id, name, path, running, pid? }[]`。
- `desktop.apps.open(idOrNameOrNativeAppPath, { activate? })` 启动原生应用；精确身份/路径优先于唯一名称，主动激活默认关闭。macOS 上，文件、文件夹或 URL 目标（`{ app?, reveal? }`）在其默认应用或 `app` 中打开，或在设置 `reveal: true` 时在 Finder 中选中显示（`NSWorkspace` 的 `openURLs` / `activateFileViewerSelectingURLs`）；相对路径在工作器中相对于会话 cwd 解析，`~` 或开头的 `~/`（目标和 `app`）相对于用户主目录解析；`~name` 仍作为名称或 ID。精确清单 ID 或路径仍视为应用。其他平台对 URL、`app` 或 `reveal` 抛出 `Unsupported`，并将其他任何路径视为应用。
- `desktop.display(id | "active" | "all")` 返回带独立截图帧的显示器输入目标。新的 `"active"` 截图会重新选择显示器；输入和缩放使用最近一帧，键盘输入不能静默地指向另一个显示器。

macOS 使用 bundle/Launch Services 身份，Windows 包括已注册、开始菜单和打包应用，Linux 使用带 argv 或 D-Bus 激活的 XDG 桌面条目。缺少平台服务时会明确失败。Windows/Linux 的激活提示仅供参考；无法确定进程归属时省略 PID。

### 截图与输入 \{#screenshots-and-input}

选定窗口和 `desktop` 都提供：

- `screenshot({ silent? }) -> { path, width, height, coordinateWidth, coordinateHeight, screenLocked?, covered? }`
- `zoom({ x, y, width, height }, { silent? }) -> { path, width, height, coordinateWidth, coordinateHeight, region, screenLocked?, covered? }`
- `click(x, y, { button?, count?, modifiers?, menu?, takeover? })`
- `doubleClick(x, y, { button?, modifiers?, takeover? })`
- `move(x, y, { takeover? })`：macOS 上，后台窗口移动不会给应用带来悬停，接管移动的悬停会在返回前结束，因此会话首次后台窗口移动会说明此情况，并指出可通过接管点击来按下仅在悬停时显示的控件
- `drag([[x, y], ...], { button?, keys?, modifiers?, takeover? }) -> { start, length, text, focused } | undefined`：macOS 后台拖动被作为选择操作执行时（见下文），返回选择内容，否则返回 `undefined`
- `scroll(x, y, { dx?, dy?, takeover? })`
- `type(text, { takeover? })`
- `press(chord | string[], { takeover? })`

窗口还提供 `raise()`、`ax(...)`、`find(...)` 和 `ref(...)`。窗口输入默认在后台传递，不主动激活窗口或移动指针。macOS 上，后台按键、按键事件式键入、左键点击、左键拖动和按住，以及菜单操作，只会使目标窗口成为其自身应用内的主窗口，因此用户应用仍保留键盘焦点；按键会等待应用报告目标已获得焦点，若其另一个窗口成为主窗口，则以 `InputFailed` 停止；发往附属面板持有焦点的窗口或该面板控件的按键和键入，会像 macOS 自身处理那样进入面板（发往窗口本身控件的按键，或发往焦点附属窗口不是面板的窗口的按键，会抛出指明目标的 `InvalidTarget`）；而对最前台应用的非主窗口执行这些操作，没有后台路径。macOS 后台的修饰键点击、右键点击、Electron 滚动、中键拖动和按住，以及从滑块、滚动条、分隔条或步进器上开始的左键拖动和按住，都不会移动用户指针；如果左键拖动不带修饰键或按键，且起点和终点都位于同一个原生文本元素的文本上（不是网页内容或终端），则通过 `AXSelectedTextRange`、不发送鼠标事件，将其作为该元素在相应按下和释放位置所形成的插入点之间的选择操作执行，并返回回读的选择内容，或像 `selectText` 一样抛出异常，但按下位置落在已选文本、链接或附件上，或文本含有从右到左书写文字时除外；其他任何左键拖动或按住都没有后台路径，因为它可能启动拖放，而 macOS 会在用户真实指针处完成拖放；在后台应用中打开菜单的右键或 Control 点击，或菜单按钮、弹出按钮上的点击、`press()` 或 `perform("AXShowMenu")`，会关闭菜单并抛出 `InputFailed`，列出其条目，因为操作已经送达（接管重跑会在焦点恢复时再次将其关闭），除非调用传入 `menu`：这是一个按 `win.menu.select` 方式匹配的条目路径，调用会在所打开的菜单中按下它，并在菜单关闭后返回。右键或 Control 拖动和按住、`count` 大于 1 的右键或 Control 点击、向 Apple Screen Sharing 发送带修饰键或按键的手势，以及向 Tk 8.6 或更新版本发送的按下操作，都没有后台路径。Windows 上，按住 Ctrl、Alt、Shift 或 Windows 键的按键、点击、拖动和按住都没有后台路径，包括键盘布局需要 Shift 才能键入的字符，例如美式布局上的 `?`：应用从键状态读取修饰键，而投递的输入从不设置该状态，因此 `ctrl+s` 会键入 `s`。调用没有后台路径时，由 `computer.takeover` 决定：`fallback`（默认）、`foreground` 和 `always` 会在接管模式下重跑一次，并将焦点交还用户应用，`refuse` 则抛出 `BackgroundUnavailable`。`takeover: true` 会短暂激活目标并立即发送真实输入；应将其留给截图证明未生效且 AX 无法执行该操作的后台调用。在主动选择的 `foreground` 和 `always` 模式下，改由 omp 决定：`foreground` 接管向持有输入焦点的窗口发送的输入，`always` 接管每次窗口和元素输入调用，传入 `takeover` 选项则会在未发送任何内容时抛出异常。绝不要盲目重放效果不确定的输入。桌面根级指针辅助方法会驱动用户的真实指针，因此优先使用窗口句柄。像素坐标属于同一目标最近一次完整截图。在截图前、目标/布局变化后，或使用其他目标的截图帧进行坐标输入，都会抛出异常。

Windows 上，符合条件、不带修饰键的后台单次左键点击，如果目标是 WinForms 或系统 Win32 按钮，会发送按钮自身的点击消息（`BM_CLICK`），而不是在请求位置点击。系统 Win32 自绘按钮仍使用基于点位的点击；此例外不适用于 WinForms 按钮。以这种方式点击 WinForms 单选按钮时，即使窗体验证本会取消对它的鼠标点击，也会选中它。

macOS 拖动选择快捷路径还会在文本视图的插入点边界为垂直方向或不可用，或无法读取当前选择时回退：水平字形边缘无法放置垂直插入点，而无法读取选择时，也不能排除拾取已选文本的可能。

macOS 上，Screen Sharing 和 iPhone Mirroring 转发的是键码，而不是文本，因此 `type` 会在当前键盘布局上按下各字符对应的键（必要时按住 Shift 或 Option），如果没有任何键能键入某个字符，则会在键入任何内容之前抛出 `InvalidKey`；接管不会改变这一点。在这些目标上，`press` 和 `holdKeys` 中的字符也以同样方式采用布局中的键。其他目标以事件文本形式接收键入文本。Screen Sharing 从物理键盘读取修饰键和 Caps Lock：需要 Shift、Option、Control 或 Command 的后台文本、快捷键或按住按键会抛出 `BackgroundUnavailable`，用户按住修饰键或 Caps Lock 开启时的后台按键也如此（如果之前已有按键发出，则为 `InputFailed`，因此不会在接管模式下重跑）；接管会将它们作为按键发送。

当 iPhone Mirroring 显示连接界面（“Connection Paused”、“iPhone in Use”、“Timed Out”）而不是手机时，向其发送点击、滚动、拖动、按住、键入文本或按键，会抛出引用该界面文字的 `InputFailed`，在调用开始时检查，不发送任何内容。其按钮接受在元素上执行 `press()`。

Windows 上，接管键入（在窗口或元素上以接管模式执行的 `type`）只有在焦点控件的线程读取了所有键入按键之后才交还前台，最多等待 5 s：如果前台切走时仍有按键排队，它们就会进入用户窗口。无法确认这一点时（等待超时、调用被取消、前台离开目标、无法附接控件线程，或 Windows 拒绝标记按键），调用仍然成功，输出会说明文本已发送但未确认。如果文本包含 Return 且前台离开目标，则视为 Return 导致前台切换，不报告任何内容。按键被读取不代表字符被保留：应用仍可能丢弃已读取的按键（开启拼写检查的 Windows 11 Notepad 就会如此），而且不会回读字段内容。

截图以 PNG 写入操作系统临时目录。原生捕获在保存和显示之前都会按有效截图上限调整大小；两个 Eval 运行时均保留原始细节图片字节和元数据，因此 Eval 不会进行第二次缩放或编码。除非设置 `silent: true`，每次截图都会输出一个状态文本块和一个图片块。详情记录截图尺寸、原始源尺寸和目标。

缩放要求之前对同一目标做过完整截图。矩形以该完整帧的像素为单位；会先裁剪新的原生图片，再应用输出上限。缩放不会替换存储的点击帧。`width`/`height` 描述返回图片；`coordinateWidth`/`coordinateHeight` 描述后续输入所用、不变的完整帧。桌面缩放会固定原先捕获的显示器，即使焦点移到另一个显示器。窗口调整大小和显示器布局变化会使过期的输入/缩放以 `InvalidCoordinateFrame` 被拒绝。

### 观察、菜单、按住与控制 \{#observation-menus-holds-and-control}

- `win.observe({ silent?, all?, maxDepth? })` 返回截图元数据及 `{ ax, nodeCount, truncated }`，通常同时输出图片和 AX 文本。截图/AX 失败会恢复之前已交付的坐标帧。AX 文本已输出时，返回的 `ax` 仍可读取，但不会出现在值的显示中，因此末尾的 `await win.observe()` 只显示一次树：JavaScript 中 `ax` 不可枚举（展开、`JSON.stringify` 和 `console.log` 会省略它），Python 的 repr 也会省略它。`silent: true` 的观察结果会在所有位置保留 `ax`；`computer.run` 返回的值不变。
- `win.menu.items(path?)` 列出 `{ title, path, enabled, checked, hasSubmenu, shortcut? }[]`；`win.menu.select(path)` 在目标窗口上下文中调用一个已启用且无歧义的命令。两者都接受单个标题（`"File"`）、数组（`["File", "Export…"]`）或独立参数（`"File", "Export…"`）形式的路径。macOS 上，`menu.items` 会先使窗口成为其自身应用中的主窗口，因此与 `menu.select` 一样，它需要 `exec` 批准，并且在所有平台的只读 run 中都会被拒绝。
  不带路径时，只读取菜单栏；指定名称的菜单会按深度优先顺序包含已暴露的后代，并给出完整路径。已启用的子菜单会在总共 150 个条目内展开（指定菜单自身的条目绝不会被丢弃）；不可读或过大的子菜单仍以 `hasSubmenu` 列出，以便通过显式路径读取。首个不可读子菜单会停止后续展开，保留已发现的条目，不重复可能发生的应用超时。取消、用户干预和其他操作故障会向上传播。
- `holdKeys(keys, { duration, takeover? })` 和 `holdMouse(x, y, { duration, button?, keys?, takeover? })` 使用 `[0, 100]` 范围内的秒数。`drag` 也接受任意 `keys`。按住的输入总会在调用内释放，macOS 上还会在 omp 进程退出或原生调用在按住期间发生 panic 时释放（见下文）。
- `desktop.control.acquire({ reason })` 需要人类实时确认，除非由 `computer.control` 策略作答（下一项）；它返回 `{ active: true }` 或 `{ active: false, reason }`，并在调用之间保持原生任务所有权。没有策略时，用户拒绝（或确认被取消）则 `reason` 为 `"denied"`；会话没有可用来提问的交互式 UI 时为 `"no-ui"`，如子代理或无头运行，此时重复调用不会成功；确认过期前无人作答时为 `"unanswered"`，过期时间在 run 超时前 5 秒（更短超时则为其四分之一），以使脚本仍能收到答复；迟到的答复不会授予任何权限，即使通过将表单保留在屏幕上的 ACP 客户端答复也是如此。`release()` 撤销权限；`state()` 读取实时状态。正常 run 退役会保留已获得的授权，中断、任务完成和销毁则会撤销它。授权不改变传递方式：省略 takeover 仍在后台；只有 `takeover: true` 才接管；在 `foreground` 和 `always` 下则仅由设置决定。在 `computer.takeover: refuse` 下，`acquire` 不会提问，直接抛出 `BackgroundUnavailable`，每次 run 都会释放之前获得的授权。
- `tools.approval["computer.control"]` 策略无需询问任何人即可回答 `acquire`：`allow` 授权，无论有无交互式 UI，`deny` 回答 `"denied"`；`prompt` 或未设置条目时按上文询问。`tools.approvalMode` 和 `tools.approval.computer` 绝不会为其作答。
- `win.bringToCurrentSpace()` 仅用于 macOS，会在不切换 Space/激活的情况下验证实际移动，并使旧帧失效。

菜单/应用标签是不可信数据。接管授权不意味着允许无关的外部影响。应检查 `applications`、`menus`、`heldInput`、`spaces` 和 `globalEscape` 能力。macOS 上，`secureInput` 为 true 时 `globalEscape` 为 false（密码字段或终端的安全键盘输入持有 Secure Event Input，因此 macOS 隐藏用户按键）；`secureInputApp` 指明持有者，run 结束时它若仍开启，会返回 `Note:` 块（[详情](../computer-use.md#safety-and-troubleshooting)）。

### 无障碍功能 \{#accessibility}

- `win.ax({ all?, maxDepth? }) -> string` 返回带 `[ref=eN]` 引用的原生文本无障碍树。
- `win.find({ role?, title?, value?, limit? }) -> El[]` 以数组返回请求上限内的所有原生匹配；在数组自身上调用元素方法或读取元素字段，会抛出 `TypeError`，提示先选取一个元素（`const [el] = await win.find(...)`）。
  过滤器匹配不区分大小写的子串。角色过滤器还会忽略空格、`_` 和 `-` 来精确匹配元素原生角色，或从查询中去除这些分隔符后匹配打印的角色；`radio` 和 `radiobutton` 是别名。打印的 `ax()` 角色不变，未知角色返回零匹配。
- `await win.ref("e5") -> El` 和 `await desktop.ref("e5") -> El` 解析实时原生引用。`ref()` 返回的句柄也可直接调用元素方法，因此 `win.ref("e5").click()` 不需要内部 `await`。
- `desktop.elementAt(x, y)` 和 `desktop.focusedElement()` 返回 `El | null`。

每个 `ax()` 行的形式为 `- role "label" [ref=eN]: "value"`，后面跟随状态。标签取标题，否则取描述；macOS 上，窗口中没有标签的关闭、最小化、缩放和全屏按钮会使用相应名称。macOS 上，标签和值使用带 `\n`、`\t`、`\"` 和 `\\` 转义的引号字符串。如果长度超过 200 个字符加上替代剩余内容的提示长度，则显示前 200 个字符，并以 `… (+N chars; (await computer.ref("eN")).value())` 结尾（标签则用 `.title` 或 `.description`）；该调用会返回完整内容，脚本应对它切片或搜索（`v.slice(-300)`、`v.indexOf(…)`、正则表达式），而不是完整打印。Linux 和 Windows 保留 80 字符预览，没有恢复完整值的提示；后端限制也可能截断访问器结果（AT-SPI 值上限为 16,384 字符）。Linux 上，元素值为其文本；没有文本且它列出 AT-SPI `Value` 接口时，则为其数值（滑块、滚动条或进度条的位置），`find({ value })` 像匹配文本一样匹配该数值；微调按钮显示文本，接口无法读取的元素不显示数值。窗口为焦点窗口时，`(focused)` 标记窗口行，也标记持有键盘焦点的元素：macOS 上只标记应用的焦点元素，因为获得焦点的表格会报告每个单元格都有焦点。macOS 上，已选行、单元格、按钮和 Finder 文件图标的行还显示 `(selected)`，Linux 上则在每个 AT-SPI 状态为 `SELECTED` 的元素上显示；macOS 上还会对 `setValue` 可写入的日期显示 `(settable)`（绝不用于网页内容，因为 `setValue` 拒绝网页内容；文本字段不标记），对网页声明为只读（`readonly`、`aria-readonly`）的文本字段或文本区域显示 `(readonly)`，因此预期向其键入不会改变任何内容；`actions=` 则显示元素提供的超出其角色的操作：控件的按下、文本字段的确认和取消，以及几乎每个元素都有的滚入视野、上下文菜单、移到前台、页面滚动和悬停操作，不会列出，但没有按下操作的控件例外，它会列出全部操作。每个名称只列一次；超过 16 项时，列表以 `… (+N more; (await computer.ref("eN")).actions())` 结尾，该调用会列出所有操作。`perform()` 接受列出的名称，不区分大小写，可带或不带 `AX` 前缀。日期值读作带 UTC 偏移的本地 ISO-8601（`2026-10-16T09:00:00-04:00`）。

`El` 提供快照字段 `ref`、`role`、`nativeRole`、可选的 `title`/`description`、`enabled`、`focused` 和 `childCount`，以及：

- 读取：`value()`、`bounds()`、`attributes()`、`actions()`、`parent()`、`children()`；
- 修改：`setValue(value)`、`selectText(text, { prefix?, suffix?, select? })`、`perform(action, { menu? })`、`press({ menu? })`、`press(chord, { takeover? })`、`type(text, { takeover? })`、`click({ button?, count?, modifiers?, menu?, takeover? })`、`doubleClick({ button?, modifiers?, takeover? })` 和 `focus()`。

`el.type(text)` 和 `el.press(chord)` 操作的是该元素，而不是窗口当前聚焦的对象。在 macOS 上，对于选区可设置的原生文本字段、文本区域或组合框，`type` 通过辅助功能在其自身选区插入文本，不发送按键，也不移动焦点，后台模式和接管模式均如此。插入后会回读：如果字段回读为掩码，且长度与其应有值相同，则视为已输入；长度不同的掩码会抛出 `AxFailed`。其他情况下，包括网页字段、基于 Chromium 的应用中的所有字段（也包括 Chrome 地址栏：它会显示辅助功能写入的内容却不接受，因此 Return 会重新加载当前页面）以及所有组合键，都会先聚焦元素，并且只有当应用在 250 毫秒内报告焦点确实位于该元素时，才通过窗口的后台（或接管）键盘通道发送按键，即使元素拒绝了聚焦请求也是如此。焦点在第一个按键前确认一次，因此每输入一位就将焦点移到下一个框的验证码输入框仍可填入；每次后台按键仍会检查该窗口是否仍是其应用内接收键盘输入的窗口。如果元素始终未报告获得焦点，则不发送任何按键，调用会抛出 `BackgroundUnavailable`（接管模式下为 `InputFailed`），指出持有键盘焦点的窗口，以及已聚焦元素的 `ax()` 行，其中包含可用的 ref。在 Windows 上，后台 `type` 和 `press` 直接向元素自身的控件窗口（例如经典编辑框）投递消息，不移动焦点，也不改变前台窗口；无窗口元素（WPF、WinUI、网页内容）会抛出 `BackgroundUnavailable`，且不发送任何内容，因为聚焦它会将其窗口带到前台，而接管模式会先聚焦它。在 X11 上，后台 `type` 和 `press` 只对 GTK 3 窗口中已聚焦的元素使用窗口的键盘通道；任何其他元素，包括 Chrome 和 Electron 字段，都会抛出 `BackgroundUnavailable`，且不发送任何内容，因为 AT-SPI 聚焦请求会将其窗口带到前台，而接管模式会先聚焦该元素。在 Wayland 上，元素的 `type` 和 `press` 与所有按窗口输入一样，会抛出 `BackgroundUnavailable`。

在 macOS 上，Mac Catalyst 应用中的 `press()` 会先在元素提供 `AXScrollToVisible` 操作时请求该操作，然后再按下元素：在这些应用中，如果直接按下已滚出视野的行，会报告成功却不产生任何效果。滚动请求失败不会阻止按下操作。

在 macOS 上，对报告自身已禁用的元素（`AXEnabled` 为 false，在 `ax()` 中显示为 `(disabled)`）调用 `press()` 会抛出 `AxFailed`，且不发送任何内容；`AXScrollToVisible` 等其他操作仍会发送给它。如果人无法点击某元素，除了滚动到可见位置之外的所有元素操作，以及后台 `el.click()`，也会抛出 `AxFailed`，且不发送任何内容：其窗口正在显示附属表单，并且绘制了该元素自身（不是该附属表单、弹出框、另一个进程的面板或标题栏按钮）；或者，向元素所属应用查询点击该元素中心会命中什么（对应用调用 `AXUIElementCopyElementAtPosition`）时，应用返回该元素自身窗口中的某个对象，而它既不是该元素，也不在其内部，不是仍将其列为子元素的父元素，也不绘制在某个已列出元素的框架内。错误会指出窗口在该位置显示的内容，并对仅悬停时出现的控件提示使用 `el.click({ takeover: true })`。以下情况不做命中测试：返回的是另一个窗口中的对象或没有对象（被其他应用、其他 Space 遮挡，或已最小化）、中心位于某个祖先元素边界之外（已滚出视野）、Mac Catalyst 按下操作（会先将其所在行滚动到可见位置）、网页内容和基于 Chromium 的应用；接管模式的 `el.click()` 不做检查，因为它带来的指针可能让仅悬停时出现的控件显示出来。

在 macOS 上，对日期或时间控件（其 `AXValue` 为日期）调用 `setValue` 接受 ISO-8601：`YYYY-MM-DD` 更改日期并保留控件的日内时间，`YYYY-MM-DDTHH:MM[:SS]` 表示本地时间，日期时间后带 `Z` 或 `±HH:MM` 则表示该确切时刻。其他格式会在写入前被拒绝，并给出这些格式及控件当前的日期；因夏令时而跳过或重复的本地时间也会被拒绝（添加偏移量以选择重复时间中的一个）。

在 macOS 上，对 `AXValue` 为数字的控件（滑块、步进器或级别指示器）调用 `setValue` 会将文本作为数字写入，并在应用响应写入后最多回读 500 毫秒。它接受最多 32 个字符的普通十进制文本：可选的符号、数字，以及可选的小数点和数字（`"75"`、`"-0.5"`）；其他内容，包括指数形式，都会在写入前被拒绝，并指出控件读出的值。向整数值控件写入整数文本（没有小数部分，或小数部分全为零）时，会精确写入，并且回读值须与该整数完全相同；超出 64 位整数范围时会被拒绝。其他文本会作为双精度数写入，忽略前导零和末尾零后，其打印结果须与文本相同：最多 15 位有效数字的文本均可满足，而包含双精度数会丢失的数字的文本（`"1.0000000000000001"`，或向浮点控件写入的 `"9007199254740993"`）会在写入前被拒绝。浮点控件可以回读为写入的双精度数，或对于保存 `Float` 的控件，回读为其 `f32` 舍入值，前提是该值仍可读作原文本（如 `"0.3"`，而不是读作 100 的 `"100.000001"`）。如果控件将值限制在其范围内、进行了舍入或未接受该值，则抛出 `AxFailed`，指出当前读出的值；写入值超出范围时，还会指出范围边界。如果应用未及时响应写入，但之后读到了该值，则视为成功；否则抛出 `AxUnconfirmed`，因为写入仍可能生效。应用在写入后移除或重建的控件会立即抛出 `StaleRef`，并说明数字已发送：再次写入前，重新运行 `ax()`/`find()` 并读取那里的值。如果控件的值不可设置，但提供了 `AXIncrement` 或 `AXDecrement`（SwiftUI `Slider`），则会拒绝操作并指出这些操作，`perform` 接受这些操作的原样名称；不发送任何内容。所有平台上的 `setValue` 都接受字符串或有限数值；数字会按其十进制文本写入，而在传递途中会丢失数字的值（超过 2^53 的整数，例如超过该值的 Python int 传入时）或打印为指数形式的值会在发送任何内容前被拒绝：请将其作为由数字组成的文本传入。

在 macOS 上，如果 ref 对应的元素已被应用移除，每种元素操作都会抛出 `StaleRef`，无需等待快照使其过期。有些应用会销毁元素并在原处创建一个相同的元素，例如 Automator 在某个筛选规则弹出菜单发生变化时，会对该规则的弹出菜单这样处理。此时，`StaleRef` 会指出窗口中唯一具有该 ref 读取时所见字段（角色、子角色、角色描述、标题、描述、值、值描述、帮助、标识符、URL）的元素，并将其注册为新 ref：`e12 destroyed; e57 is the one element in the window with the role, labels and value e12 was read with…`。不会向它发送任何内容，`e12` 仍指向已销毁的元素。字段相同不能证明它是同一个控件，而且这些字段是读取时看到的字段，而不是之后任何操作留下的字段。只有满足以下条件时才会给出候选元素：应用报告元素已销毁；ref 来自一次针对整个窗口的 `ax()` 或 `find()` 读取（未被节点或深度限制截断，每个元素的字段和子元素均有响应），且当时没有其他元素具有这些字段；窗口 id 仍指向同一个窗口；现在以至少与当时相同的深度读取整个窗口，恰好找到一个具有这些字段的元素。否则仍抛出普通的 `StaleRef`。

在 macOS 上，对弹出按钮（`popupbutton`）调用 `setValue(value)` 会选择标题与 `value` 完全相同的菜单选项（对于 Chrome 或 Electron 中选项无标题的 `<select>`，则选择文本为 `value` 的选项）：它打开已关闭的菜单，按下该选项，并通过回读弹出按钮的值确认选择。如果没有匹配项，或有多个选项具有该标题，会抛出错误并列出可用的选项标题，同时重新关闭本次调用打开的菜单：先使用 `AXCancel`，如果菜单仍在显示（Chromium 的 `<select>` 会忽略取消），则向其应用投递 Escape。如果此后菜单仍打开，调用失败并指出该菜单。

在 macOS 上，对原生文本字段、文本区域或组合框调用 `setValue(text)`，会以 `win.type` 插入文本的方式替换整个值，使应用将编辑作为键入输入处理：搜索字段会执行搜索，提供建议的字段可能显示建议。对于未聚焦的字段，只有当其应用不是最前台应用时才会先聚焦它，因为在最前台应用中聚焦该字段会移动用户的插入点；此类字段、安全文本字段以及选区不可设置的元素改为通过 `AXValue` 写入，有些应用会显示该值却不保存。为写入而聚焦的后台字段之后会保留其应用内部的焦点，因为有些应用会丢弃提交前字段失去焦点的编辑。无论哪种方式，都会回读字段，若值不是 `text`，则抛出 `AxFailed`，指出写入了多少字符，以及字段当前读出的内容。写入的文本绝不被引用输出，即使回读重复了它；安全字段读出的内容也不会被引用输出；回读为掩码字符的字段会被描述为已掩码。如果字段回读为与 `text` 长度完全相同的掩码（密码字段，无论它报告什么角色），则视为写入成功；长度不同的掩码仍会失败。网页内容、终端和基于 Chromium 的应用中的字段（Chrome、Edge、Brave、Electron 应用；在那里使用 `el.type(text)`）会在写入任何内容前被拒绝。

在 Windows 上，`setValue(text)` 会在写入后回读值，当可读的值不同时抛出 `AxFailed`。无法回读并不代表失败：写入成功后，它与 main 上一样返回成功，但不声称已确认。密码字段错误绝不包含文本。原生 Win32 和 WinForms 组合框，包括对其编辑子控件的 ref，会选择原生搜索候选项并通知应用，除非确切文本和选中项已一致；可读文本或选中项不匹配会报错。原生搜索不区分大小写，因此非精确匹配可能改变选中项，但会报告未验证的值及读出的内容，而不是成功。可编辑组合框还可以接受列表之外的文本。原生组合框的搜索、写入、通知和文本/索引读取使用有超时限制的消息，而不是辅助功能提供程序的项目名称调用。已禁用的原生组合框、已禁用或只读的组合框编辑控件、不带字符串项目的自绘组合框，以及 `ComboBoxEx32` 控件（包括其内嵌组合框和编辑子控件）都会被拒绝，并提供按下/点击的替代方式。经典 Win32 和 WinForms EDIT 控件使用 `WM_SETTEXT`，不聚焦或抬升其窗口；无法回读时保留该消息的响应，而且 Ctrl+Z 无法恢复旧值。其他控件，包括 `SysIPAddress32` 内的 EDIT 八位组控件，仍使用 UI Automation 写入通道。原生组合框写入都不会聚焦或抬升其窗口。原生组合框错误会区分准备失败（未写入任何内容）与写入或通知派发失败（控件可能已经改变）。

富文本编辑控件自身的行标记不能否定一次写入：它将每个换行报告为 `\r`，并添加末尾段落标记。UI Automation 会隐藏密码文本，有时会改为返回非空的受保护表示；已确认是密码字段时，无论该表示如何，都会返回未确认内容的成功结果，不论是否具有原生窗口，也包括等长覆盖。对于非空文本，可读的空非密码值仍属于不匹配。如果密码状态查询本身失败，可读的不匹配仍会导致失败，但其错误不会披露文本。

向 computer 工作进程自身进程中的另一个线程发送携带指针的原生消息时，会报告未确认的值，而不是冒着超时后消息缓冲区已被释放的风险。其他进程中的目标仍使用 Windows 的系统消息封送；此限制不改变它们的写入路径。

在 macOS 上，`selectText(text, { prefix?, suffix?, select? })` 会写入 `AXSelectedTextRange`，在元素的值中选中 `text`，或通过 `select: "start" | "end"` 将插入点放在其前面或后面；不输入任何内容，值保持不变，用户的焦点和指针也保持原位。`prefix` 和 `suffix` 须紧邻匹配项的前后，用于区分重复项。没有匹配项、匹配项只出现在该上下文之外、有多个匹配项，或元素不允许 AX 设置选区，都会在写入任何内容前抛出 `AxFailed`，说明具体情况；如果应用在调用开始时位于后台，却在写入前来到前台，也会如此，因为用户正在操作它。结果 `{ start, length, text, focused }` 是写入稳定后回读的选区，以 UTF-16 代码单元计量；回读与请求不符时则抛出错误。`focused` 表示元素在其自身应用内的焦点状态。在可编辑字段中，随后对该元素调用 `el.type` 会替换选区；窗口级的 `win.type` 只有在 `focused` 为 true 时才会这样做，否则请先调用 `focus()`。终端的 AX 文本是其显示的输出，因此在那里选择文本不会移动 shell 的输入光标，输入也不会替换选区。其他平台抛出 `Unsupported`。

AX 操作不需要截图。AX 边界和 `desktop.elementAt()` 使用平台原生的全局桌面坐标（macOS 上为逻辑点，Windows 上为物理像素），而不是截图像素。元素在不同 AX 快照间保留其 ref；一旦元素同时不在窗口当前和上一次快照中，ref 就会抛出 `StaleRef`。角色或标签变化会为元素分配新 ref，旧 ref 则继续可用，直到以同样方式过期。

### 剪贴板 \{#clipboard}

- `desktop.clipboard.read() -> string`
- `desktop.clipboard.write(text)`；只读运行中会被拒绝。

## 输出 \{#outputs}

直接辅助函数和 `computer.run(...)` 直接返回工作进程的结构化值；窗口和元素外观对象以其身份字段跨越边界。外层 Eval 单元会输出运行内部打印的非空文本。非静默截图仍是普通的 Eval 图像输出。未打印文本且没有返回值的运行不会输出占位文本。合并后的打印文本受共享的内联字节上限约束；超出上限的文本会保存为会话产物。

结果详情包含解析后的 `code`、`readOnly`、`screenshots`、可选的结构化 `value`，以及能力元数据（`backend`、`capturePermission`、`inputPermission`、`axPermission`）。每条截图详情包含 `path`、`width`、`height`、`coordinateWidth`、`coordinateHeight`、可选的 `sourceWidth`/`sourceHeight`、`region`、`screenLocked` 和 `covered`，以及 `target`。向提供方交付时使用普通文本/图像内容，图像 detail 为 `original`；不使用提供方 Files 或原生 `computer_call_output` 元数据。

在 macOS 上，在锁屏后方截取的截图会设置 `screenLocked: true`，并在状态文本中添加说明；屏幕锁定或显示器休眠时抛出的原生错误会以括号中的该状态结尾；运行结束时若仍锁定或休眠，则返回一个前置的 `Note:` 文本块。这些情况均不会拒绝输入。原生会话使用期间会持有 `PreventUserIdleDisplaySleep` 断言，使显示器保持唤醒，从智能体回合的第一次桌面调用持续到该回合结束或提示等待用户回答时（在智能体回合之外或子代理中，则持续到最后一次桌面调用后的五分钟），或持续到关闭时；参见 [macOS 显示器休眠与锁屏](../computer-use.md#macos-display-sleep-and-the-lock-screen)。

在 Windows 上，`screenLocked` 也涵盖会话断开连接或输入桌面不可用的情况，例如 UAC 的安全桌面。它使用相同的截图标签、原生错误后缀和运行说明；在会话解锁或重新连接，或安全桌面关闭之前，捕获和输入均不能确认应用状态。Windows 上的 `displayAsleep` 保持为 false。

在 Windows 上，对于由 Chromium 绘制的窗口（Chrome、Edge、Electron 应用），如果它在读取前后看起来完全被遮挡（其他窗口覆盖了它的全部区域，或它位于所有显示器之外），其截图或缩放图会设置 `covered: true`，并在状态文本中添加说明，而且该窗口的 `ax()` 会以一行 `… covered:` 结尾。`silent: true` 会省略状态文本及其说明，但不会省略 `covered` 属性。该标记来自窗口几何信息，而不是应用：Chromium 发现自身被遮挡时，可能停止绘制和更新辅助功能树，Windows 此时会返回其最后绘制的帧，因此两种读取都可能已过时，在窗口持续被遮挡时重复读取并无帮助。说明会按干扰从小到大的顺序列出获取当前视图的方法：先使用已连接到该应用的浏览器工具，再使用 `raise()`（它会将窗口置于用户窗口之前并占用其键盘，而且 Windows 会在用户使用其他窗口时拒绝它），然后进行一次检查预期状态的读取，而不是相信第一次没有标记的读取；否则向用户说明无法确认的内容。不会拒绝任何操作；只要窗口有任何部分可见，以及其他应用的窗口，都不会带此标记。点击穿透、工具窗口或弹出窗口样式本身不会阻止不透明窗口构成遮挡，不过 Chromium 通常会在这些窗口之下继续绘制：此时该标记属于不必要的谨慎，但仍予以保留，因为相同窗口也可能位于某个页面之上，而 Chromium 曾在此前的遮挡下暂停该页面，且尚未重新计算。异形（复杂区域）窗口、无法读取不透明度的分层窗口和无法读取几何信息的窗口不计入遮挡，而且几何信息只能近似 Chromium 的判断（窗口区域、框架边界和工作区限制均有差异），因此没有标记的读取并不能证明窗口内容是当前的。

## 流程与生命周期 \{#flow-and-lifecycle}

1. `createComputerPrelude(session)` 定义仅在启用时存在的全局对象及其宿主侧调用器。
2. 直接辅助函数生成其允许列表内的调用链，`computer.run(fnOrCode, options)` 则在需要时序列化函数；宿主解析 JavaScript、限制超时、计算有效图像上限、创建每次运行的快照（检查调用链为只读），然后请求监督器执行。
3. 监督器按需启动一个崩溃隔离的 Bun 工作进程（启动期限为 10 秒），并转发中止请求。工作进程会拒绝重叠运行，而不是将它们排队。
4. 工作进程按需创建一个原生 `DesktopSession` 和一个持久的 `JsRuntime`。句柄、截图坐标框架、运行时变量和近期 AX ref 会在成功调用之间保留。
5. 每次运行安装一个运行级的 `desktop` 外观对象，以及 `wait`/`assert`。AsyncLocalStorage 防止泄漏的异步任务借用后续运行的信号或只读策略。
6. 原生操作在工作进程中执行，取消令牌在 NAPI 调度之前捕获。修改操作会获取操作系统支持的跨进程输入/焦点租约；读取不会。运行时的 `tool.*` 调用经由监督器返回所属会话的工具桥，并继承取消状态。
7. 中止、超时和正常运行清理会同步退役该次运行的原生代际，包括未等待的排队操作。交付会在事件之间检查取消状态，并在清理期间释放保持中的输入；后续运行使用新的代际。可安全克隆的显示内容/返回值和能力信息返回宿主，工作进程继续存活。
8. 运行超时后，监督器给予 750 毫秒宽限期。如果工作进程仍未完成，则终止它，并显示 `computer worker restarted; captures and ax refs were reset`；后续调用会启动新的工作进程。
9. 在所属顶层智能体会话的回合期间（其 `power.sleepPrevention` 处理中区间）进行的运行，会将原生会话标记为保持显示器唤醒，直到释放。回合结束，或打开等待用户回答的对话框（`ask`、工具或设置审批、控制确认、扩展提示）时，会话向其每个 computer 工作进程发送 `release-display`，只解除该保持状态；工作进程、运行时、框架和 AX ref 均保留。带期限的对话框（`ask.timeout`，或其对话框选项中的 `timeout`）不算等待：它会自行结束，回合继续，因此保持状态不变。最后一个打开的对话框结束且仍有提示处理中时，回合继续：会话发送 `resume-display`，因此该回合中仍在进行的运行（其控制确认对应于该对话框）会再次保持显示器唤醒，该回合后续的运行也一样。
10.   `computer.close()` 发送 `close`，最多等待 1.5 秒，然后以强制终止作为有时限的后备方案；句柄、框架和 AX ref 均消失，用户的 Escape 停止状态仍会拒绝调用，后续调用会启动新的工作进程。销毁智能体会话会以相同方式永久关闭每个已注册的 computer 控制器：之后的调用会以 `Computer session is closed` 失败。

## 副作用 \{#side-effects}

- 将真实窗口或选定的桌面合成图捕获到提供方上下文中，并将 PNG 写入操作系统临时目录。
- 发送真实的键盘/指针输入。窗口后台交付旨在保留焦点、指针和窗口顺序；`takeover: true`、被 `foreground` 或 `always` 模式接管的调用，以及被拒绝的后台调用的重新运行，会临时激活目标。桌面根级指针调用会影响用户的真实指针。在 `computer.takeover: refuse` 下，任何会激活应用、驱动用户指针或键盘，或在 macOS 上打开菜单（打开期间会占用用户键盘）的调用，都会在发送任何内容前被拒绝。
- 读取或写入系统剪贴板。
- 执行具有完全访问权限的 JavaScript，并可能通过 `tool.*` 调用其他会话工具。
- 在多次调用之间保持原生桌面会话和 Bun 工作进程存活。
- 不启动浏览器，也不回退到浏览器自动化。

## 错误与恢复 \{#errors-and-recovery}

原生错误以 `ToolError` 文本形式呈现，并以稳定的代码名称为前缀：

- `PermissionDenied`、`CaptureFailed`、`InputFailed`、`BackgroundUnavailable`、`InputBusy`、`Cancelled`、`UserIntervened`（macOS 或 X11）
- `WindowNotFound`、`InvalidTarget`、`InvalidKey`、`InvalidCoordinateFrame`
- `StaleRef`、`AxUnsupported`、`AxFailed`、`AxUnconfirmed`、`Timeout`、`Closed`、`Internal`
- `Unsupported`、`SpaceUnsupported`、`SpaceMoveDenied`

前导代码/工作进程错误包括 `Computer session is closed`、`Computer worker is busy`、`Timed out starting computer worker`、`Computer code execution timed out after <ms>ms`、只读修改错误，以及上述工作进程重启消息。文本参数缺失或类型错误会在任何原生调用之前失败，并指出辅助函数及参数：`selectText(text) requires a string, got undefined`。

如果运行或辅助函数在产生文本或截图后失败，Eval 会显示该部分输出，并仍然抛出原始错误。该输出不包含锁屏、显示器休眠和安全输入通知，因为失败的运行不会读取原生能力信息。用户取消和工作进程崩溃可能丢弃尚未到达宿主的输出。

`AxUnconfirmed`（macOS 和 Windows）表示已请求 AX 操作，但无法确认其结果。在 Windows 上，WinForms 复选框可能处理 `press()` 而不改变状态。在 macOS 上，应用可能未及时响应或消息传递可能失败，例如操作打开了模态对话框；应用也可能返回不适用于操作的属性错误，如 Preview 在跟随 PDF 链接后，以及 Finder 在打开项目后所做的那样。操作可能已经生效，因此在重复之前，请观察错误所指窗口及其应用。
在 Windows 上，不带菜单路径的 AX `press()`（无组合键）和 `perform()` 调用，如果在原生响应等待结束前没有得到响应，一旦调用到达其派发点，就会报告 `AxUnconfirmed`：操作可能已经发送，也可能仍会生效。重试前请检查新的 AX 或截图。否则它们报告 `Timeout`，而且只有该 `Timeout` 才能保证之后不会再发送操作。对于这些调用，调用方会在原生三分钟上限与运行期限前 125 毫秒两者中较早的时间停止等待；运行自身的中止是独立的，不会关闭该屏障。点击、`press(chord)`、`setValue()`、`focus()` 和菜单路径不在此范围内。

`UserIntervened`（macOS）表示用户在调用所针对的应用中按键或点击。会话首次读取或操作某应用时启动仅监听的事件 tap，按会话已接触的应用分别记录用户的按键和点击（以及听写等工具为用户投递的输入）；之后复用已接触应用进程 id 的新进程，初始状态仍为未接触。向为应用绘制窗口的进程输入，例如绘制其“打开”或“保存”面板的进程，也计为向该应用输入。正在发送的按键，包括接管点击、拖动或 `holdMouse` 周围保持按下的键，会在用户于该处首次按键或点击时停止：此前发送的按键可能已到达，不再发送更多按键，但仍会发送释放事件。无论后台还是接管点击，如果用户自调用开始后已在该处按键或点击，则不再按下，因此多次点击可能在第一次点击后停止；正在进行的按下、拖动和滚动不会在手势中途被打断。之后针对该应用的输入或修改（窗口输入、`menu.select`、`raise`、`bringToCurrentSpace`，包括针对其他 Space 上的窗口，以及元素的 `setValue`/`selectText`/`perform`/`press`/`type`/`click`/`focus`）会等待，直到用户停止操作该应用达 5 秒，或直到运行超时前 250 毫秒或原生请求的 3 分钟上限，然后抛出 `UserIntervened`，不发送任何内容，并指出应用及其最后一次输入距今多久。每个此类调用都会持续抛出错误，直到对该应用某个窗口的 `screenshot`、`zoom`、`observe`、`ax` 或 `find` 在该次输入至少 5 秒后开始，且结果已交付；此前的读取仍会成功。其他应用不受影响，桌面级或显示器级输入也不受影响。没有事件监听访问权限（输入监控）时，tap 看不到任何输入，因此不会检测到干预。

在 X11 上，`UserIntervened` 表示窗口或元素接管在其准入期限之前无法观察到连续 5 秒无按键或按钮按下的时段，或用户在接管期间（包括交还焦点时）按下了键或按钮。新监听器也须观察第一个安静时段。扣除本会话自身的按下事件后，远程用户的核心 XTEST 按下事件也会计入。OMP 的 MPX 设备不计入。活动观察和物理紧急 Escape 都需要 XI2.2，以免抓取隐藏原始事件。启动时或运行时观察失败会拒绝或停止接管，而不是发送无人监看的输入；检查功能仍可用。

X11 接管还要求所有核心按键和指针按钮都已释放，包括监听器启动前开始的保持按下状态。它在准入前读取服务器当前的设备状态，并在获取输入租约后重新检查，因此安静但仍保持按下的修饰键或拖动不会让接管获准。

激活失败时，即使窗口管理器的活动窗口属性尚未更新，X11 接管也会恢复已捕获的核心焦点；它始终请求窗口管理器恢复用户的窗口，而且不会覆盖之后从目标移开的核心焦点切换。激活请求发出后的按下或 Escape 会等待窗口管理器最多 800 毫秒来处理该请求，然后交还用户的窗口。用户按下后或有按钮保持按下时，它不会将指针移回。

`InputBusy` 表示调用最多等待 5 秒后，另一个原生操作仍持有输入/焦点，且未发送任何输入。仅为接管输入（`takeover: true`、持有控制权时的任何操作、桌面/显示器级输入、抬升窗口及激活式启动）启用的仅监听 Escape 监视器，会在任何位置出现物理 Escape 时取消操作，并忽略合成事件。原生会话在监督器选择的键（`escapeStopKey`；宿主取消、退役和释放都不计入）下累计这些停止次数，监督器通过 `desktopEscapeStops(key)` 读取次数，因此停止状态在工作进程重启后仍会保留，即使没有运行报告它也能被发现。每个智能体会话都有自己的监督器和键，因此停止只会拒绝该会话后续的调用，而不影响父会话或子代理的调用。在一次运行中，每次原生访问都会先检查该次数，并在操作结束后再次检查，因此捕获取消操作的脚本也不会再发送任何内容；已停止调用的错误会优先保留原生操作所报告的内容（恢复失败、某个键仍保持按下），然后才是停止信息。若次数超过用户最新消息已确认的次数，则正在运行的调用失败，之后的每次运行和能力调用都会在向工作进程发消息前被拒绝；`AgentSession` 会在用户自己的提示、引导、后续消息或用户发起的自定义提示到来时确认该次数，绝不会在合成消息或归于智能体的消息到来时确认。未持有控制权时，后台窗口输入和语义 AX 操作不会启用监视器：用户自己的 Escape 不会取消任何内容，只有宿主中断（工具调用的中止信号）或运行超时才会停止它们。在 macOS 上，没有事件监听访问权限（启动应用的输入监控已关闭）时，监视器看不到任何输入，且 `globalEscape` 报告 `false`；监视器无法启动时，会以 `PermissionDenied` 拒绝接管输入。`Cancelled` 可能发生在部分输入或原子的 OS/AX 操作之后：取消无法撤销已交付的效果。

恢复时，在坐标框架错误后刷新确切目标的截图，在 `StaleRef` 后获取新的 AX 快照，并通过 `desktop.capabilities()` 检查平台/权限失败。只有 `computer.takeover` 为 `refuse`、调用设置了 `takeover: false`，或后端不支持接管时，后台拒绝才会以 `BackgroundUnavailable` 到达脚本；否则工具已经以接管方式重新运行调用，运行输出会说明 `<method> ran in takeover because <reason>; the input was delivered, and <where focus ended>`（Windows 接管键入未被观察到读取时，用 `sent` 而不是 `delivered`）。在 `refuse` 下，前台请求也会得到 `BackgroundUnavailable`：消息会说明用户设置使智能体保持在后台，并在存在后台通道时指出该通道。发生部分交付或恢复错误后，重试前应检查目标，因为输入可能已经到达。在 `UserIntervened` 后，重新读取该窗口，并依据其显示的内容继续，保留用户的编辑。

如果输入锁持有者的会话是使用 `agentId`（`DesktopSessionOptions`）创建的，`InputBusy` 会指出该智能体及其 omp 进程 id（`agent "Scout" (omp pid 4242) owns input/focus control`）。所有平台都会指出同一进程中的持有者；另一个进程的持有者在 macOS 和 Linux 上存活期间会通过锁文件被识别，但 Windows 上不会。

## 平台限制 \{#platform-constraints}

当前原生后端支持 macOS、Linux X11、可用时的 Linux Wayland portal 捕获/输入，以及 Windows；其他目标取决于原生插件支持。能力和权限状态是运行时事实，请检查 `desktop.capabilities()`，不要想当然。Wayland 合成器不允许 omp 激活任意窗口，因此逐窗口原生输入和 `raise()` 不可用；请使用 AX 操作，或在自行聚焦目标后使用桌面输入。前置条件和权限详情请参见[可脚本化的计算机使用：平台](../computer-use.md#platforms)。

macOS 捕获在 14+ 上使用 ScreenCaptureKit，每个桌面会话有一个持久的原生主循环工作进程，通过私有管道传输原始像素：不会为每次截图启动进程，也没有中间 PNG。macOS 12/13 由原生 CoreGraphics 处理。Wayland PipeWire 路径会在坐标交付前刷新 portal 几何信息；这会额外产生一次 portal 请求，如果其恢复权限已过期，可能需要重新同意。

macOS 上会按下按键或按钮的输入，会将每次按下、为其准备的释放事件、每次拖动移动及每次释放流式发送到释放辅助进程（`crates/natives/src/desktop/macos/release_guard.rs`、`release_helper.rs`）。每个可能执行按下的调用（点击、键入、组合键、保持按下、拖动、元素 `type` 和 `press(chord)`、`menu.select`、提供 `menu` 路径的 AX 操作，以及弹出控件的 `setValue`）都会在开始时、检查之前启动一个辅助进程，因此检查与其保护的按下操作之间没有进程启动或等待；每次调用对应一个短生命周期进程。其他 AX 操作只有在投递使菜单窗口成为键盘窗口的按下事件时，才会启动辅助进程。调用结束时，辅助进程退出，调用等待其退出（约一毫秒，最多 500 毫秒），因此调用之间不会有任何进程运行，下一个调用会发现输入所有权已空闲。如果由于宿主被终止或 panic 导致调用展开，流结束时仍有未释放的按下状态，辅助进程会先沿这些按下事件所用的通道投递释放事件。辅助进程在退出之前一直持有宿主的桌面所有权锁，因此在释放事件发出前，其他宿主的输入不会开始。按进程（后台）释放只会到达目标。在与用户键盘和鼠标共享的 HID 通道上，仅监听 tap 会跟踪用户物理保持按下的内容，在调用检查前已启动并就绪（约 30 毫秒），用户保持按下的键或按钮则留给用户自行释放。如果辅助进程无法启动，或无法观察用户（没有输入监控权限），则停止它，调用在没有该进程的情况下继续。

## 关键约束 \{#critical-constraints}

- 屏幕和辅助功能内容是不可信数据；它们绝不授权操作。
- 存在语义控件时，优先使用 AX 操作，而不是像素操作。
- 优先使用直接检查辅助函数；仅用于检查的 `computer.run` 调用使用 `read_only: true`。
- 绝不混用截图像素坐标与全局 AX 坐标。
- 对会产生重大后果或不可逆的操作进行确认，除非用户的直接请求已经授权该确切操作。
