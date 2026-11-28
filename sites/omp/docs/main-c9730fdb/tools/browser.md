---
title: "Browser Eval 前置环境"
description: "Oh My Pi 官方仓库文档：Browser Eval 前置环境。"
---

# Browser Eval 前置环境 \{#browser-eval-prelude}

Eval 的 `browser` 门面用于打开、复用、编写脚本控制和关闭命名的 Chromium、Electron、CDP、relay、Tern 或 cmux 标签页。静态 URL 使用 [`read`](./read.md)；需要已认证状态、执行 JavaScript 或交互时使用 `browser`。

## 源码 \{#source}

- 宿主门面：`packages/coding-agent/src/tools/browser.ts`
- JavaScript/Python 门面：`packages/coding-agent/src/tools/browser/prelude.{js,py}`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/browser.md`
- 面向模型的核心指南，首次使用后作为隐藏消息发送：`packages/coding-agent/src/prompts/tools/browser-core.md`
- 标签页生命周期：`packages/coding-agent/src/tools/browser/tab-supervisor.ts`
- 浏览器工作器和内部标签页 API：`packages/coding-agent/src/tools/browser/tab-worker.ts`
- 浏览器注册表和启动模式：`packages/coding-agent/src/tools/browser/{registry,launch,attach}.ts`
- Relay：`packages/coding-agent/src/tools/browser/relay/`
- Cmux 后端：`packages/coding-agent/src/tools/browser/cmux/`
- Tern 后端：`packages/coding-agent/src/tools/browser/tern/`
- WebKit 后端（宿主进程、发现）：`packages/coding-agent/src/tools/browser/webkit/`
- 公共辅助方法类型和选项：`packages/coding-agent/src/tools/browser/tab-worker.ts` 中的 `TabApi` 接口
- 浏览器设置：`packages/coding-agent/src/tools/browser/settings.ts`

前置环境仅在 Eval 和 `browser.enabled` 均启用时存在（`browser.enabled` 默认为 `true`）。它不是 AgentTool。
所有浏览器宿主操作都请求 exec 层级批准，包括检查辅助方法。

对话首次调用浏览器前置环境后，会话会在下一个交付点将浏览器指南的简短核心部分作为隐藏的类型化消息发送：在工具批次之后，或随后台作业结果一起发送。`firstCallDocumentation` 属性提供核心指南；Eval 描述保留其单行浏览器条目，完整指南仍可在 `help://eval/browser` 阅读。核心指南提及的每个辅助方法、选项和参数都须出现在完整指南中（`packages/coding-agent/test/tools/browser-prelude-documentation.test.ts`）。

只有类型化指南消息才算完成交付。如果上下文压缩、回退或 shake 丢弃或缩短了指南，就会在下一个交付点再次发送；恢复的会话若保留了完整指南，则不会重复发送。新对话在调用前置环境之前，没有待交付的指南。

指南从不进入 Eval stdout、输出接收器、产物溢出存储或 Spotlight 整形。页面和脚本文本不能通过模仿指南来声称已完成交付或绕过输出限制。

顾问没有此隐藏消息通道，仍需在首次使用前阅读完整主题。约束首次浏览器操作的安全规则，包括 Linux X11 焦点、借用会话导航和页面完整性规则，保留在调用前指引中，而不是延迟发送的指南中。

没有 `read` 的会话已经内联了完整文档，不会再接收单独的首次调用指南。

## JavaScript API \{#javascript-api}

```js
const tab = await browser.open({
	name: "main",
	url: "https://example.com",
	wait_until: "load",
});

const observation = await tab.observe();
await tab.id(observation.elements[0].id).click();
const title = await tab.title();

const length = await tab.run(async ({ tab }, suffix) => ((await tab.title()) + suffix).length, {
	args: ["!"],
	timeout: 30,
});

await tab.close();
```

- `browser.open(options?) -> Promise<BrowserTab>` 打开或复用一个命名标签页，并返回其句柄。其文本以一行给出标签页及其浏览器名称、实际到达的页面（当它与请求的 `url` 不同，或未提供 URL 时）和页面标题，随后附上各项提示。
- `browser.tab(name = "main") -> BrowserTab` 为该名称创建代理；它不会打开标签页，也不会检查标签页是否存在。
- `browser.tabs() -> Promise<ManagedTabInfo[]>` 列出存活的受管理标签页，包含 `name`、`url`、`title`、`targetId`、`kind` 和 `persist`。
- `browser.close({ name?, all?, kill?, timeout? }) -> Promise<void>` 释放一个或全部受管理标签页。
- `tab.close({ kill?, timeout? }) -> Promise<void>` 释放该句柄的标签页。

`close` 和 `run` 与 `open` 一样解析 `timeout`：单位为秒，默认 30，先受正数 `tools.maxTimeout` 限制，再限幅至 1-300。未指定 `timeout` 的 `run`，以及每次直接辅助方法调用（`tab.evaluate(…)`、`tab.click(…)`、…），在 Eval 单元的 `timeout` 更长时，改用该超时作为默认值（单元设为 `timeout: 0` 时为 300）：浏览器调用运行期间会暂停单元自身的计时器。`waitFor*` 辅助方法的 `timeout` 单位为毫秒，且不能超过外层调用的 `timeout`。

在 Chromium 标签页上，调用超时会失败，omp 会尝试最多 5 秒，将标签页重新连接到新工作器，而不重新加载页面；这会重置标签页自打开以来设置的状态（路由、模拟、初始化脚本、元素 id、run 全局变量）。如果工作器在截止时间或取消后的 750 ms 内未停止，则会连同其标签页一起释放。恢复期间取消信号仍然有效，也会停止卡住的替代工作器。

### 打开选项 \{#open-options}

| 选项 | 约定 |
| --- | --- |
| `name` | 受管理标签页的名称；默认为 `"main"`。 |
| `url` | 将打开或复用的标签页导航到此 URL。在以 Chromium 为后端的标签页上，导航超过 `timeout` 会抛出指明标签页的错误，并使其停留在已加载的内容上；可通过 `browser.tab(name)` 访问它。导航直接失败（连接被拒绝、域名被阻止、证书错误）或打开操作被取消时，会关闭此次打开新建的标签页；复用的标签页则保持打开。 |
| `app` | 一个字符串：`"relay"`、`"tern"`、`"webkit"`、`"chromium"`、`"own"`、`"auto"`、CDP 端点 URL 或可执行文件路径；后端选择方式见下文。`argv` 为可执行文件路径提供额外的 CLI 参数。`target` 按精确的目标 id 或不区分大小写的 URL/标题子串选择要连接的页面。 |
| `viewport` | `{ width, height, scale? }`；`scale` 用作设备缩放因子。 |
| `wait_until` | `"load"`、`"domcontentloaded"`、`"networkidle0"` 或 `"networkidle2"`。 |
| `dialogs` | 自动处理策略为 `"accept"` 或 `"dismiss"`。未设置时，会接受 alert 和 beforeunload 提示；confirm 和 prompt 则保持待处理。在 Chromium 和 WebKit 标签页上，待处理的对话框会阻塞页面脚本，因此依赖该脚本的调用（读取、操作、`evaluate`、等待页面内容、截图）会立即失败并指明对话框，直到 `handleDialog` 作答；打开对话框的点击或按键会返回。 |
| `allowed_domains` | 精确主机名或 `*.example.com` 模式（包括裸域）。网络管理器会中止拦截到的发往其他主机的 HTTP(S)/WS(S) 请求；空列表不限制请求。这不是沙箱，原生 webview 的覆盖差异见下文。 |
| `init_scripts` | 在文档启动时执行的 JavaScript 源码，或相对于 cwd 的源文件路径。 |
| `downloads` | 此标签页下载目录的绝对路径或相对于 cwd 的路径；默认每个标签页使用一个临时文件夹。受管理或新启动的 Chromium 中，各标签页共享浏览器但保留独立文件夹，其 iframe 发起的下载也包括在内；在那里，没有标签页跟踪的下载保留 Chromium 的 GUID 文件名。连接的浏览器也会接收用户自己的下载，因此使用一个浏览器级文件夹（最后设置它的标签页生效）并保留真实文件名。relay 无法选择 Chrome 的文件夹，因此 relay 标签页拒绝 `downloads`；它从打开时起跟踪自身下载，并报告 Chrome 保存每个文件的位置。 |
| `user_agent` | 按标签页覆盖 user-agent。 |
| `insecure` | 对该标签页忽略无效 HTTPS 证书。 |
| `headed` | 为此次打开覆盖 `browser.headless`。它不在 Tern 和 Chromium 之间做选择：在 Tern 窗格中，使用 `app: "own"` 可不使用 Tern。 |
| `persist` | 默认为 `false`；退出稳定后冻结和空闲关闭管理。对于 omp 通过 relay 打开的标签页，还会在会话结束后将其保留在用户的 Chrome 中。所属会话显式复用时可以更改它。 |
| `timeout` | 单位为秒；默认 30，先受正数 `tools.maxTimeout` 限制，再限幅至 1-300。首次使用时安装 Chromium 不计入打开操作的截止时间。打开超时会指明卡在哪一步：启动或连接浏览器、关闭标签页以重新打开，或打开标签页。 |

如果 Chrome 在打开操作的导航期间断开 relay，而 omp 重新连接到同一页面，打开操作会返回该标签页并附带恢复提示，而不是将其关闭。重复导航之前先检查当前页面；重新连接不会重新加载页面，也不会重试可能已经生效的输入。
如果重新连接在导航开始前耗尽了预算，打开操作仍会失败，但恢复的标签页仍可通过 `browser.tab(name)` 使用。

重新打开时若指定初始化脚本、下载目录、user-agent 覆盖或 `insecure: true`，会回收现有标签页，以便这些工作器初始化选项生效。

### 直接标签页辅助方法 \{#direct-tab-helpers}

直接辅助方法通过宿主桥接层返回真实的结构化值。完整选项类型见 `browser/tab-worker.ts` 中的 `TabApi` 接口。

- 导航：`url`、`title`、`goto`、`back`、`forward`、`reload`、`pushState`（不加载文档的 SPA 导航）。
- 检查：`observe({ includeAll?, viewportOnly?, selector?, compact? })`、`ariaSnapshot(selector?, { depth?, boxes?, interactive?, compact?, urls?, diff? })`、`a11y`、`screenshot`、`diffScreenshot`、`pdf`、`extract(format?, { selector?, outline?, filter? })`、`text`、`html`、`value`、`attr`、`count`、`box`、`styles`、`isVisible`、`isEnabled`、`isChecked`。
- 交互：`click`、`dblclick`、`hover`、`focus`、`check`、`uncheck`、`type`、`fill`、`press`、`keyDown`、`keyUp`、`mouseMove`、`mouseDown`、`mouseUp`、`clickAt`、`wheel`、`scroll`、`drag`、`highlight`、`scrollIntoView`、`select`、`uploadFile`。标签页或 frame 上的 `click(selector, { button?, count? })` 可以按其他鼠标键或点击多次，与下文的 `BrowserElement.click` 类似。`clickAt(x, y, { button?, count?, css? })`、`mouseMove(x, y, { steps?, css? })` 和 `drag` 的 `{ x, y, css? }` 点位，采用从标签页最新视口截图中读取的位置：通常为视口 CSS 像素，除非该截图经过缩放（见下文截图说明）。
- 等待：`waitFor(selector, { timeout? })`、`waitForSelector(selector, { timeout?, state?: "attached" | "detached" | "visible" | "hidden", visible?: boolean, hidden?: boolean })`、`waitForUrl(stringOrRegExp, { timeout? })`（URL 包含的字符串或与之匹配的 RegExp；其他值，包括谓词函数，都会抛出异常）、`waitForText(text, { timeout?, selector?, exact? })`。在以 Chromium 为后端的标签页及其 frame 上，未知的 waitForSelector 选项或值会立即失败；相互冲突的 state 和 visible/hidden 选项，或同时将 visible 和 hidden 设为 true，都会被拒绝。Tern 和 cmux 尚不读取 `state`，并会忽略不认识的选项：Tern 遵循 `visible`/`hidden`，cmux 只遵循 `timeout`。
- Frame：`frames()` 列出 frame 树；`frame(selectorOrNameOrUrl)` 返回限定作用域的代理，支持 `click`、`fill`、`type`、`press`、`text`、`html`、`value`、`attr`、`count`、`isVisible`、`ariaSnapshot`、`evaluate`、`waitFor`、`waitForSelector` 和 `screenshot`。
- 对话框：`dialog`、`handleDialog`、`setDialogs`。
- 原生窗口（macOS、可见的受管理浏览器、新启动的 Chromium 浏览器和回环 relay）：当调用在其标签页上方弹出任何页面调用都无法访问的窗口时（`<select>` 菜单、颜色/日期选择器，或打印、保存、登录、通行密钥、权限面板或气泡），结果会说明此情况并给出窗口 id：若 computer 工具列出了该窗口，则给出 `computer.window(id)`，否则指向 `computer.screenshot()`。只有标签页所属浏览器在该标签页窗口上方绘制的新窗口才计入，且仅限浏览器标签页列表表明该标签页位于该窗口前台时；页面本身无法说明这一点，因为 omp 会对其驱动的标签页模拟焦点。relay 列表会标记扩展的活动标签页。Chrome 的 `/json/list` 按各标签页最近显示的时间排序，从未显示的则按创建时间排序，因此该标签页须在其窗口内排在首位，并且，除非它是窗口中唯一的标签页，否则要能确认它已显示过：在前台打开，受管理浏览器打开每个标签页时都如此；页面报告了一个不位于屏幕原点的浏览器窗口位置，页面只有显示时才能获知此位置；或曾观察到它排到了同窗口另一个标签页之前。无法读取该列表，或窗口中在后台打开的标签页排在首位时，不会指明任何窗口。新启动的 Chromium 在后台打开标签页，因此用户显示过它之后才会指明其窗口；对于位于屏幕原点的窗口，则要先由一次调用看到该窗口的另一个标签页在前台，之后另一次调用又看到智能体的标签页在前台。几何信息在隔离世界中读取，浏览器 pid（relay 的 pid 未知）将窗口匹配限制在该进程内。已连接的（`app.cdp_url`）浏览器、启动的非 Chromium 浏览器应用和远程 relay 不在此列。与浏览器页面目标匹配的普通窗口（如 OAuth 弹窗）不是原生对话框；无法读取页面 frame 时，会排除普通窗口候选项。不明确的重叠、macOS 自身的提示（Touch ID、钥匙串）和页面自身的 JavaScript 对话框不会被指明。调用返回后 2 s 内出现的窗口，会由下一次调用指明。失败的调用也会携带同样的行；没有出现窗口时，调用不会添加任何内容。
- 模拟：`emulate`、`devices`。
- 剪贴板：`clipboardRead`、`clipboardWrite`、`clipboardCopy`、`clipboardPaste`。
- 存储：`cookies`、`setCookies`、`clearCookies`、`storage`、`setStorage`、`clearStorage`、`saveState`、`loadState`。
- 初始化/下载：`addInitScript`、`removeInitScript`、`initScripts`、`waitForDownload`、`downloads`。`waitForDownload` 会占用标签页直到下载完成，因此等待期间对该标签页的其他调用会因忙碌而失败；若打开标签页时没有设置 `downloads`，首次等待之前开始的下载不会被跟踪。应在同一次 run 中开始等待并执行触发下载的步骤：`tab.run("const download = tab.waitForDownload(); await tab.click('#export'); return await download;")`。如果下载已完成，但文件不在 omp 所在机器上，例如通过 `app.cdp_url` 访问的浏览器运行在另一台机器上，则等待会失败并给出查找的路径，该下载也不会列入 `downloads()`。
- 诊断：`console`、`errors`、`clearConsole`、`traceStart`、`traceStop`、`profileStart`、`profileStop`、`metrics`。
- `console({ level?, since?, limit?, clear? })` 和 `errors({ since?, limit?, clear? })` 返回 `{ entries, nextSeq, dropped }`：`entries` 按捕获顺序排列，`nextSeq` 可作为 `since` 传入以获取后续条目，`dropped` 统计有界缓冲区逐出的条目。本地和开发页面（`file:`、`data:`、`about:`、`blob:`、`localhost` 和 `*.localhost`、`*.local`、回环及私有 IP 地址）从加载起就记录控制台消息和未捕获异常。公共网站则仅在标签页首次调用 `console()` 或 `errors()` 后记录，因为浏览器的控制台记录行为对页面脚本可见，会将标签页标记为自动化；从那时起，结果携带 `captureStartedAt`，即开始记录时的 Unix 毫秒时间，此前的内容没有记录。失败请求在每个页面上都会从一开始记录。从 JavaScript 单元直接调用时，对结果使用数组方法、`length` 或迭代会抛出 `TypeError`，提示读取 `.entries`。
- 录制：`recordStart`、`recordStop`、`recordRestart`、`recording`。
- Web Vitals/React：`vitals`、`reactEnable`、`reactTree`、`reactInspect`、`reactRenders`、`reactSuspense`；在其他 `react*` 辅助方法之前调用 `reactEnable`（它会安装 hook 并重新加载）。
- 网络：`route`、`unroute`、`routes`、`requests`、`request`、`clearRequests`、`harStart`、`harStop`、`allowedDomains`。
- 实验性页面工具：`webmcpList`、`webmcpInvoke`、`webmcpEvents`，仅用于 Chromium 标签页。它们通过 DevTools 的 `WebMCP` 域读取页面向 Chrome 原生 WebMCP 注册的工具，包括跨源 iframe；omp 不会为它们注入页面脚本。首次调用之前不会运行任何内容。当 Chrome 不向页面提供 WebMCP 时（Chrome 早于 147、不安全上下文，或在未带 `--enable-features=WebMCP` 启动的 Chrome 中，页面没有 WebMCP 源试用），`webmcpList` 返回 `status: "unavailable"`，并附上说明如何启用它的 `reason`，`webmcpInvoke` 则抛出该原因；调用工具需要 Chrome 149 或更新版本。页面提供的工具元数据和结果不可信；发现工具绝不意味着授权调用。
- 页面执行：`evaluate(fnOrSource, ...args)`。源码字符串是页面全局表达式，不是函数体；顶层 `return` 无效。需要时使用函数或已调用的 IIFE 字符串。

直接调用 `waitFor` 和 `waitForSelector` 会就解析出的句柄返回布尔值，但超时可能抛出异常。`tab.id(number)` 和 `tab.ref("e5")` 返回 `BrowserElement` 代理。它们支持 `click`、`dblclick`、`check`、`uncheck`、`highlight`、`type`、`fill`、`press`、`hover`、`focus`、`select`、`uploadFile`、`scrollIntoView`、`boundingBox`、`isVisible`、`isHidden`、`text`、`html`、`value`、`attr`、`styles`、`isEnabled`、`isChecked` 和 `evaluate`。`click({ button, count })` 可以按其他鼠标键或点击多次；cmux 标签页只按一次左键，并拒绝其他按键和次数（使用 `dblclick()`）。传给 `BrowserElement.evaluate` 的字符串是一个函数表达式，调用时会将元素作为其第一个参数。

在以 Chromium 为后端的标签页上，成功的 hidden/detached 等待在 `tab.run` 内可能返回 `null`，通过直接辅助方法则可能返回 `false`；超时会抛出异常。对于存在但不可见的元素，`hidden` 可以返回句柄；frame 等待在完成时返回 `true`。`role/` 选择器从不匹配隐藏元素，因此当匹配元素隐藏时，其 `detached` 等待也会完成。

Chromium 快照引用等待会检查实时元素，而不仅仅检查引用是否仍在上次快照中：隐藏元素仍处于已附加状态，移除的元素则满足 hidden/detached。

选择器接受 CSS 和 Puppeteer 的 `aria/…`、`text/…`、`xpath/…`、`pierce/…`，以及 `label/…`、`placeholder/…`、`testid/…`、`alt/…`、`title/…` 和 `role/<role>[name="…"]` 查询处理器。在角色名称过滤器内添加 ` exact` 可进行精确匹配；无论哪种方式，名称匹配都不区分大小写。在以 Chromium 为后端的标签页上，`role/` 会向 Chrome 的无障碍树查询每个元素的角色和名称，因此接受 Chrome 自己的角色，如 `DescriptionList`；也会将 Chrome 归为布局表格的表格匹配为 `role/table`，深入开放的 shadow root，并跳过隐藏及 `aria-hidden` 元素。在 Tern 上，它使用该套件自身的规则，同样可以深入开放的 shadow root（下文具有原生 DOM 读取能力的 Tern 则改为向引擎查询无障碍角色和名称）；`observe()` 为元素报告的每个角色和名称都能再次选中该元素（两个后端上，纯文本 `StaticText` 条目都没有 `role/` 选择器）。仅 Playwright 支持的伪类，如 `:has-text()` 和 `:visible`，会被拒绝。对于 `<select>`，使用 `tab.select(selector, ...choices)` 或 `handle.select(...choices)`，而不是 `fill`：选项可以混用字符串（先按精确值，再按标签）、`{label: "full text"}`、`{value: "exact value"}` 或 `{index: 0}`；标签按精确文本匹配，或按折叠空白并去除首尾空白后的完整选项文本匹配。

`observe()` 列出交互元素，并分配供 `tab.id` 使用的数字 id；`includeAll: true` 会添加非交互无障碍节点，`viewportOnly: true` 则只保留与视口相交的元素（cmux 忽略此选项）。在 JavaScript Eval 中，打印 `tab.observe()` 结果或将它留作单元的最后一个值，会让每个元素各占一行（`[id] role "name" value=… states`）；`.elements` 保留供代码使用的数据。`ariaSnapshot()` 分配供 `tab.ref` 使用的 `[ref=eN]` id；`diff: true` 返回带修订号的完整对象、未更改对象或增量对象。导航和重新渲染会使句柄失效；应在同一个 Eval 单元中重新观察并操作。

`tab.run(async ({ tab }) => tab.observe())` 返回的观察结果也采用相同打印形式。若观察结果返回后被更改（赋值字段、添加元素、定义 getter 或原地编辑原型），则改用普通 `util.inspect` 输出，但仍会显示所有元素。

在以 Chromium 为后端的标签页上，如果页面请求的导航正在进行（刚点击链接或提交按钮，或脚本设置了 `location`），此时发出的页面读取、选择器操作、`evaluate` 或页面内容等待（`waitFor`、`waitForSelector`、`waitForText`、`waitForUrl`），会先等待新文档提交并完成解析，因此点击及读取所加载页面或在其上执行下一步可以放在同一个单元中。原始指针输入（`clickAt`、`wheel`、`mouse*`）和事件等待（`waitForNavigation`、`waitForResponse`、`waitForDownload`）会立即运行。始终未开始加载的请求最多使调用等待 5 s。内置读取若在调用过程中因导航失去文档，会在新文档上再运行一次；`evaluate` 绝不会将你的代码运行两次。

在 Chromium 标签页上，输入辅助方法或导航之后的第一次 `observe()` 或 `ariaSnapshot()`，会等待自上次查看以来各操作启动的工作：主 frame 文档、自这些操作中第一个操作以来开始的 fetch 和 XHR 请求，然后等待主文档及子 frame（包括跨源 frame）的 DOM 连续 150 ms 没有变化。等待上限为 3 秒，若调用自身预算的一半更短，则用后者，之后按页面当时的状态读取。如果查看前没有操作，则不等待；操作之前已发起的请求不会被等待；一起发出的查看共用一次等待，等待期间进行的操作也包括在内。清空可读请求日志或其发生溢出，不会丢弃尚待完成的稳定等待工作。`browser.open` 或 `goto` 后的第一次查看会将页面加载启动的请求计入。

### `tab.run(fnOrCode, options?)` \{#tabrunfnorcode-options}

run 接受序列化函数或 JavaScript 函数体字符串，并接受 `{ args?, timeout? }`：

```js
const hrefs = await tab.run(async ({ page }) => {
	return await page.$$eval("a", links => links.map(link => link.href));
});

const title = await tab.run("return await tab.title();", { timeout: 10 });
```

函数接收 `{ tab, page, browser, wait, assert }` 作为第一个参数。额外的 `args` 随后传入。如果 `args` 既不是数组也不是 `null`，或代码字符串同时带有非空 `args`，会在 run 开始前抛出异常；`null` 不传入任何参数。普通数据、函数和 `RegExp` 值会被序列化；函数不能捕获 Eval 单元的闭包。代码字符串使用相同名称作为全局变量，并允许顶层 `await`。代码字符串返回末尾表达式或顶层 `return`，与 Eval 单元打印它们的方式一致；以赋值或块结束的字符串不返回任何内容。

内部 `tab` 是完整的工作器辅助 API。除了直接接口之外，还包括返回句柄的 `waitFor`/`waitForSelector`，以及限定在 run 作用域内的 `waitForNavigation`/`waitForResponse`。应在触发导航或响应的操作之前开始等待。

run 使用持久的、每个标签页独立的 JavaScript 运行时，带有常规 Eval 辅助方法，以及完整的 Bun/Node 和工具桥接访问权限。这是 API 隔离，不是安全沙箱。原始 `page.setRequestInterception` 和 run 添加的请求监听器会在 run 结束时清理；`tab.route` 处理器持续存在，直到调用 `unroute` 或关闭标签页。

run 交给 `page.evaluate`、`page.evaluateHandle`、`page.$eval`、`page.$$eval` 和 `page.waitForFunction` 的代码在页面主世界中运行，`tab.evaluate` 也在那里运行，页面全局变量和自定义元素成员也位于其中；作为参数传入的元素句柄会被转移到该世界。在 Chromium 标签页上，omp 的隐身补丁会将其他所有 Puppeteer 求值放在隔离世界中运行，该世界共享 DOM，但不共享页面脚本：包括 `frame.evaluate`、`elementHandle.evaluate` 以及任何其他 `Page` 对象（`tab.page`、`frame.page()`、`browser.pages()`）。选择器也在那里解析，因此要读取页面脚本附加在句柄上的内容，应将句柄传给 `page.evaluate(fn, handle)`。非元素值的句柄只能在创建它的世界中使用，因此要供 `page.evaluate` 使用，应通过 `page.evaluateHandle` 创建。

返回值保持结构化。只有匹配完整观察结果结构的值才采用观察结果打印形式；其他结构化返回值，包括带 `elements` 数组的对象，仍采用原生检查形式。在 run 内打印的非空文本（`print`、`console.*`）会打印在外层 Eval 单元中，打印的图片仍属于 Eval 输出，没有打印文本的 run 不会输出占位内容。

## Python API \{#python-api}

Python 提供相同的句柄和直接方法名，包括 `browser.tabs()`。`open` 和 `close` 使用关键字参数，而 `browser.tab` 和 `tab.id`/`tab.ref` 会同步创建代理。直接辅助方法上的关键字参数会变成末尾的 JavaScript 选项对象。

```python
tab = await browser.open(name="main", url="https://example.com")
observation = await tab.observe(viewportOnly=True)
await tab.id(observation["elements"][0]["id"]).click()
title = await tab.run("return await tab.title();", timeout=30)
await tab.close()
```

Python 的 `tab.run` 仅接受 JavaScript 字符串；不接受 Python 可调用对象。

## 浏览器模式 \{#browser-modes}

`browser.open` 优先采用显式 `app`：CDP URL、可执行文件路径、`"relay"`、`"tern"`，然后是 `"webkit"`；`"chromium"` 和 `"own"` 也直接指定浏览器（受管理的 Chromium；omp 自己的浏览器，跳过已配置的 CDP、Tern 和 cmux）。否则会依次考虑已配置的 relay（`browser.relay`，`PI_BROWSER_RELAY=1|0` 可将其覆盖为开启或关闭）、已配置的 CDP（`browser.cdpUrl`）、自动 Tern、cmux，最后是 omp 自己的浏览器：若可用，则使用其无头 WebKit 宿主（见下文），否则使用项目共享的受管理 Chromium。无论 relay 以何种方式启用，`app: "auto"` 都会跳过它，依次尝试已配置的 CDP、Tern、cmux，再到 omp 自己的浏览器；`app: "own"` 直接使用 omp 自己的浏览器，`app: "chromium"` 则跳过 WebKit 宿主（改为打开受管理的 Chromium）。Relay 和 Tern 的环境禁用开关可以禁用相应模式。

- **WebKit（已安装时的默认选择）：** 在 omp 自己的引擎 ABKit（修补过的 WPE WebKit）中打开无头 web view，omp 将其 `ABHost` 可执行文件作为子进程启动（每个 omp 进程一个，由其标签页共享；每个标签页是一个视图）。只有标签页显示在窗口中时（见下文）才向屏幕绘制，但页面始终看到一个可见且有焦点的窗口、没有自动化标志、每会话独立的 canvas 噪声，以及宿主自行选择的合理屏幕和窗口几何信息（macOS 上还有 Safari user agent 和 `window.safari`；`user_agent` 会替换该 agent）。macOS 上支持 WebGL、WebGPU、视频和音频播放、Web Audio、WebRTC、WebAuthn（没有认证器：请求以被取消结束）、游戏手柄（未连接任何手柄）和 Web Share（以被取消结束）；声音被丢弃，摄像头和麦克风请求被拒绝。其 TLS 握手、HTTP/2 设置和请求头与 Safari 发送的相同。不支持加密媒体和语音合成。当打开操作走到上述优先顺序末尾，并同时满足以下条件时选择它：后端已开启（`browser.webkit`，默认 `true`；`PI_BROWSER_WEBKIT=0|1` 可覆盖为开启或关闭）、宿主可执行文件存在，且打开操作不需要 Chromium 独有的能力（在引擎未附带查看器的情况下，通过 `headed: true` 或 `browser.headless = false` 显示标签页）。宿主可执行文件使用已安装引擎的 `~/.o2/lib/abkit/ABHost`（Windows 上为 `ABHost.exe`；Tern 运行同一个程序），除非 `PI_BROWSER_WEBKIT_PATH` 或其次的 `browser.webkitPath` 设置另行指定：可以是可执行文件本身，不论文件叫什么都原样使用；也可以是 ABKit 引擎目录，程序在其中名为 `ABHost`（Windows 上为 `ABHost.exe`）。两者均未指定且默认位置没有引擎时，omp 从构建服务（`https://build.stencil.so`，产品 `abkit`；`PI_BUILD_URL` 可覆盖源站）下载最新稳定版 ABKit，根据服务返回的大小和 SHA-256 校验归档，在引擎的 `VERSION` 文件中记录版本，在操作系统锁保护下将其 `abkit/` 目录解压为 `~/.o2/lib/abkit-versions/<version>`，并使 `~/.o2/lib/abkit` 指向它：这是通过重命名替换的链接（Windows 上为目录联接）。进程首次打开并运行此处的引擎前，omp 会向构建服务查询最新稳定版（最多等待 5 s），当 `VERSION` 缺失或指向较旧版本时，以同样方式更新引擎，不等待正在运行的宿主；已无程序从中运行的版本文件夹会在之后的检查中删除。其他 omp 进程正在安装或更新引擎时，以及构建服务不响应时，打开操作不做此检查，直接运行已安装的引擎。在 omp 开始保留版本之前以普通文件夹安装的引擎，只有在没有程序从中运行时才会替换（其宿主通过该路径查找辅助程序）。更新失败或推迟时会记录日志，并运行已安装的引擎。omp 通过真实路径启动 `ABHost`，对引擎目录链接解析一次，因此即使链接后来指向其他版本，宿主仍使用其自身版本的辅助程序。较新版本和本地构建（`VERSION` 为 `dev`，来自 ABKit 的 `install-engine.sh`）会保留，其他应用管理的引擎也会保留：即真实路径向上两层存在该应用的 `manager.json` 的引擎（Tern 将 `~/.o2/lib/abkit` 链接到 `<its root>/versions/<version>`）。由该应用负责更新，omp 按原样运行。对于 `app: "webkit"` 的打开操作，以及本来会下载 Chrome for Testing 的打开操作（没有 `PUPPETEER_EXECUTABLE_PATH`、在优先系统 Chrome 的场景下没有系统 Chrome、也没有缓存），在无头模式或已发布引擎附带查看器的平台（macOS）上，omp 会执行上述下载。与 Chrome 一样，下载发生在打开操作截止时间开始计时之前；下载失败时，`app: "webkit"` 会失败并给出原因，其他打开操作则附带提示并继续尝试 Chromium。可执行文件缺失，或宿主无法启动或无法打开第一个标签页时，会回退到受管理的 Chromium，打开结果会说明原因。`app.webkit: true` 则要求使用宿主：无法解析出可执行文件、宿主无法启动，以及在 `headed: true` 时因引擎没有查看器而无法显示标签页，都会导致打开失败；它仍遵循 `PI_BROWSER_WEBKIT=0`。`app.webkit: false` 会为此次打开使用受管理的 Chromium，这是处理引擎无法支持的页面（DRM 保护的视频、语音合成）的替代方式。
  当打开选项指定 `headed: true`，或 `browser.headless` 关闭，且引擎附带查看器程序（宿主旁的 `ABView`；macOS）时，WebKit 标签页会有窗口。宿主自身仍然没有窗口：omp 启动查看器并将标签页视图呈现给它，停止呈现则将其隐藏，因此无论哪种方式，页面都是同一页面，且永远看不到这种差别。`/browser visible` 和 `/browser headless` 会立即显示和隐藏已打开 WebKit 标签页的窗口；关闭窗口会隐藏该标签页；设置了 `headed` 的打开操作作用于存活标签页时，会显示或隐藏它。窗口会移到前台但不抢占键盘，用户在其中的点击、滚动和键入会作为可信输入传给页面。omp 启动宿主时不带参数（每个配置档案都在内存中，随进程消失），通过其 stdin/stdout 通信，以 debug 级别记录 stderr，并在最后一个标签页关闭时关闭 stdin 来停止宿主（若两秒后仍未退出，则终止进程树）；所属 omp 已退出的宿主会自行退出。
  默认 WebKit 标签页不在页面世界中运行任何 omp 脚本。宿主的欢迎信息列出 `console` 和 `network`，随后 omp 从引擎自身事件读取控制台及页面错误日志（`console`、`errors`）和请求日志（`requests`、`request`、HAR、`waitForResponse`、网络空闲等待）：控制台消息和未捕获异常，以及每次资源加载的 `request` / `response` / `requestFinished` / `requestFailed`。DOM 读取和输入也是原生实现，因此页面找不到包装过的内置对象或 omp 全局变量。原生日志的限制：引擎不提供资源类型（omp 从 `Sec-Fetch-Dest` 推导，WebKit 仅向可能可信的源发送它；在其他普通 http 场景中，frame 文档请求是带有 `Upgrade-Insecure-Requests` 的请求，其他请求的 HTML 响应记为 `fetch`；否则按响应 MIME 类型推导；XHR 记为 `fetch`），事件不携带时间（`ts` 是 omp 读取事件的时间，且没有 `durationMs`），请求体大小未知（省略 `sizes.requestBody`，HAR 的 `bodySize` 为 -1），响应体大小采用响应声明的 `Content-Length`（没有则省略），且不存储正文：`request(id)` 返回不含 `body` 的记录，`response.text()` 抛出异常，HAR 没有内容。只有需要页面世界代码的辅助方法才会安装它，此后页面便能检测到：
  - `route`，以及带 `geolocation`、`locale` 或 `offline` 的 `emulate`：omp 的捕获脚本（包装 `fetch`、`XMLHttpRequest` 和 `console`，添加 `__ompTernCapture`）。最后一次 `unroute` 后且这些模拟已清除时，它会从文档启动列表中移除；已运行它的文档会保留包装，直到导航。安装期间，引擎事件仍是日志来源；脚本报告的内容中，只有它自行响应的请求（履行或中止请求的路由、离线）会被加入，这些请求有正文。
  - `vitals`：Web Vitals 观察器（`__ompBrowserVitals`），从首次调用起保留到标签页生命周期结束；首次调用会重新加载页面一次，除非设置 `reload: false`。
  - `reactEnable`：React DevTools hook，保留到标签页生命周期结束。
  - `init_scripts`、录制的光标叠加层，以及 `evaluate` / `tab.run` 代码自身留下的任何内容。`highlight` 和带标注截图在显示期间从隔离世界向页面 DOM 绘制。
  Tern 守护进程既不列出 `console` 也不列出 `network`：其标签页仍像之前一样，在每个文档中保留捕获和 vitals 脚本。
- **受管理的 Chromium：** 在项目共享的 Chromium 中创建 omp 拥有的页面，并应用隐身补丁。首次使用时自动安装。`headed` 可覆盖默认的隐藏模式。
- **新启动（`app` 为可执行文件路径）：** 启动或复用启用了 CDP 的浏览器/Electron 可执行文件。`argv` 仅适用于此模式；Chromium 系列进程使用 omp 拥有的配置档案，除非参数指定了 `--user-data-dir`。
- **已连接（`app` 为 CDP URL）：** 连接现有的 HTTP CDP 发现端点。一些引擎，例如 Lightpanda，会将每个页面保留在创建它的 CDP 连接上。当通过 omp 自身连接读取的端点目标列表中没有显示 omp 刚创建的页面时，omp 会识别出此类引擎。在这种情况下，列出标签页绝不会误将标签页的页面认作已关闭，而在 omp 外关闭的页面仍会释放其标签页。替换工作器（run 超时、工作器退出、页面会话丢失）时无法重新连接页面，因为页面已随旧工作器的连接关闭。omp 会改为在新工作器上，使用打开操作的视口、初始化脚本、下载文件夹和 user agent 打开新页面，并再次加载旧页面的 URL。结果会说明页面的 JavaScript 状态及其连接的 cookie 和存储已丢失。
- **Relay（`app: "relay"`）：** 通过 omp 扩展驱动用户真实的 Chrome。打开不带 `target` 的新名称时，会创建 omp 自己的后台标签页，不改变用户选中的标签页和窗口焦点；`url` 导航该标签页，截图也不将它移到前台。同一个 relay 上有多个浏览器时，新标签页会在 omp 上次通过该 relay 使用的标签页所属浏览器中打开（对于 `tab.run` 打开的页面，则使用其自身标签页的浏览器）；否则使用 relay 标签页列表中第一个选中标签页所属的浏览器（无论其窗口是否最小化）；再否则使用扩展最后连接的浏览器。`target` 按精确 CDP 目标 id 或 URL/标题子串借用现有标签页。重新打开已打开的名称时，会保留其标签页，无论该标签页是借用还是自有。运行 `omp browser-relay install`，然后在 `chrome://extensions` 中使用 _加载已解压的扩展程序_。从旧的未固定 ID 扩展迁移时，先移除旧扩展；重新加载不会将其迁移到固定 ID。
- **Tern：** 在 Tern 窗格内，使用原生 WKWebView 而非 Chromium，在窗格上方打开可见的浏览器画中画。`app: "own"` 可不使用 Tern；`headed` 不在 Tern 和 Chromium 之间做选择。`app: "tern"` 要求使用 Tern。自动选择 Tern 时，如果 Tern 无法承载页面，会回退到 omp 自己的浏览器（适用时为 WebKit 宿主，否则为受管理的 Chromium），并在结果中说明原因。在引擎原生读取 DOM 的 Tern 上（欢迎信息列出 `dom` 操作），`observe`、选择器解析、可操作性检查、元素读取（`text`、`html`、`attr`、`value`、`count`、`boundingBox`、`isVisible`、`isEnabled`、`isChecked`）和等待（`waitFor`、`waitForSelector`、`waitForText`）在引擎中运行，不在页面中使用脚本，每次操作都是在引擎解析的位置进行的可信输入：视野外的元素会通过滚轮滚入视野，`type` 点击元素并在点击放置的插入点键入，`fill` 点击元素、全选并插入文本，`focus` 点击可编辑控件，`scroll(dx, dy, { selector })` 则在元素上滚动滚轮。此时选择器可跨同进程 frame，并穿透开放和封闭的 shadow root 匹配，`text/` 和 `waitForText` 忽略大小写，`observe()` 不列出 `StaticText` 条目，元素句柄指向其节点：再次 `observe()` 后仍指向同一元素，该元素离开页面后就不再能解析。`select`、`highlight`、带标注截图、`styles`、`uploadFile`、`ariaSnapshot` 及其引用、`frames`/`frame`、元素 `evaluate`、对不接受文本的元素执行的 `focus`，以及对日期/时间/颜色/范围输入执行的 `fill`，仍运行 omp 的页面脚本。
- **Cmux：** 驱动可用的 cmux WKWebView 界面。

**从 WSL2 使用 Windows Chrome：** 在 Windows 上安装 omp 扩展和原生宿主，并使用[镜像网络](https://learn.microsoft.com/windows/wsl/networking#mirrored-mode-networking)。当 `browser.relayUrl` 未设置且没有本地 relay 时，新发起的 `app: "relay"` 打开操作和目标列表查询会通过 Windows 互操作发现端口，并在 WSL 回环地址上验证 relay 身份。重新打开命名标签页时，会先在回环地址上检查其绑定实例。如果 Chrome 重启，复用名称前先关闭旧句柄。

自动 Windows 发现要求 `wslinfo --networking-mode` 报告 `mirrored`；不需要更改防火墙，也不需要面向网络的监听器。WSL2 NAT 无法使用此传输方式；请改为在 Windows 上使用 omp。

自动 Tern 和 cmux 属于绘制在该终端中的交互式 omp。它在启动时将 `PI_TERMINAL_OWNER_PID` 设为自身 pid，运行的每条命令都会继承它，因此从这些命令中启动的 omp（通过 bash 工具运行 `omp -p`、eval 单元运行的脚本）会看到一个属于其他进程的窗格，不会从中选择 Tern 或 cmux；其未指定 `app` 的打开操作最终会使用 omp 自己的浏览器（WebKit 宿主或受管理的 Chromium），除非为其配置的 relay 或 `browser.cdpUrl` 优先。`app: "tern"`、`target`、`PI_BROWSER_TERN=1` 和 `PI_BROWSER_CMUX=1` 仍可选择它们。

用户自己的界面是其正在对话的会话的默认选择。子代理（`task` 子代理或 eval `agent()`）在未指定 `app` 的打开操作中会跳过 relay、Tern 和 cmux，即使已开启 `browser.relay` 或设置 `PI_BROWSER_RELAY=1`/`PI_BROWSER_TERN=1`/`PI_BROWSER_CMUX=1`，也会继续选择 `browser.cdpUrl` 或 omp 自己的浏览器（WebKit 宿主或受管理的 Chromium）。要使用用户的 Chrome，需要 `app: "relay"`；要接管现有 Chrome 标签页，传入 `app: "relay", target: "<CDP target id>"`。`app: "tern"` 显式选择 Tern，单独的 `target` 则表示选择接管 Tern 浏览器块，而不是 Chrome 标签页（已配置的 CDP 仍优先于仅通过 target 选择 Tern）。`/tan` 克隆会携带描述父级默认值的父级系统提示，并保留这些默认值；顾问与其所属智能体共享浏览器和默认值。子代理重新打开父级已打开的 relay 标签页名称时，也需要 `app: "relay"`；否则打开操作会因浏览器类型不匹配而失败。

原生 webview 后端不提供完整的 Puppeteer/CDP 能力。Tern 提供 fetch/XHR 和导航响应日志，而非完整的 CDP 子资源覆盖；路由只接受 fetch/XHR 资源类型。不支持 CPU/网络节流、时区/请求头/减少动态效果模拟、经过 CSS 变换的 frame 输入，以及跟踪/性能分析；`metrics` 返回导航计时和 DOM 计数，而不是完整的 CDP 指标。Tern 的 PDF 仅接受 `path`；WebKit 宿主由与 Tern 相同的标签页驱动程序驱动，共享这些限制，并且还没有 `pdf`，其配色方案模拟为进程级（最后一次 `emulate({ colorScheme })` 会应用于每个 WebKit 标签页）；加载存储时只恢复当前源；`webmcp*` 辅助方法会抛出异常（WKWebView 没有 WebMCP）。应检查后端特定错误，而不是假定其行为与 Chromium 相同。

在关闭现有标签页之前，不允许跨浏览器类型复用同一标签页名称。关闭 omp 拥有的 Chromium 页面、WebKit 宿主视图、omp 在 relay 中打开的标签页、Tern 画中画和自有 cmux 界面时，会将其关闭。已连接页面和借用的 relay 标签页保持打开。新启动的浏览器进程保持打开，除非 `kill: true` 释放其最后一个受管理标签页，并终止本进程拥有的应用；复用的进程绝不会被终止。

受管理的 Chromium 关闭了打印功能，因此页面的 `window.print()` 会立即返回，不打开打印预览；`tab.pdf()` 仍可生成 PDF。在 omp 连接的浏览器（relay、`app` 为 CDP URL 或可执行文件路径）中，预览仍会打开并占住页面，直到用户取消或标签页导航离开。

在 Linux X11 下，Chrome 150 及更新版本在窗口未激活、且该窗口当前显示的标签页内有鼠标键或触摸按下时，会激活窗口，omp 的 CDP 输入也包括在内（`ContentsWebView::DidGetUserInteraction` 在此类按下时为页面视图请求焦点）。因此，在 relay、已连接浏览器或任何其他有头 Chrome 中，当用户位于另一窗口，而操作目标是已显示的标签页时，`click`、`dblclick`、`tap`、`drag`、`mouseDown`、`clickAt`、`check` 或 `uncheck`（元素已处于所请求状态时除外；拒绝更改的元素仍会按下；取消选中原生单选按钮不会按下），以及对非 `<input type=file>` 元素执行的 `uploadFile`，都会将 Chrome 移到前台，用户随后键入的内容会进入页面；omp 不会恢复用户原来的应用。不论以何种方式激活，打开新标签页或弹窗的控件仍可能将 Chrome 移到前台。智能体的浏览器指南在 Linux 宿主上包含此说明；其他平台在 `browser.cdpUrl` 或 `browser.relayUrl` 指向另一台机器时也会包含。按键（`type`、`fill`、`press`）、`focus`、`select`、`hover`、滚轮滚动和截图会让用户应用保持在前台，向窗口当前未显示的标签页输入也如此；GNOME 下的原生 Wayland Chrome 同样不会激活。

## 截图与输出 \{#screenshots-and-output}

`tab.screenshot({ selector?, fullPage?, silent?, annotate?, format?, quality?, ifChanged?, threshold? })` 返回保存路径；启用变化检测时，返回 `{ path?, changed, revision, pixelChangeRatio }`。`format` 为 `png` 或 `jpeg`；整数 `quality`（0-100）要求使用 JPEG。`threshold` 是 0-1 的像素变化比例，设置它即启用变化检测。受跟踪截图若没有变化，则不保存也不输出任何内容。

以 Chromium 为后端的截图绝不会激活标签页或将其窗口移到前台：后台标签页、最小化窗口或位于其他应用之后的窗口，都会在原处按当前内容截图，因此用户的前台应用保留焦点。对于 relay 和通过 CDP 连接的浏览器，这也包括用户后来已经切离的接管标签页。

图片保存在 `browser.screenshotDir` 下，未设置时则保存在操作系统临时目录中。指定该目录或显式格式时，Chromium 保存完整分辨率，否则保存调整大小后的图片。模型可见的图片以 CSS 像素为单位：设备缩放大于 1 时截取的图片会重采样为每个 CSS 像素对应一个图片像素，因此从视口截图读取的位置就是 `clickAt` 接受的位置。只有当图片在传给模型的途中本来就会再次缩放时，才会缩小：最长边超过 2000px（携带 20 张以上图片的 Anthropic 请求允许的单张图片最大边长）、超过模型宿主传入的边长（`image-max-edge`）、超过模型自身图片缩放保留的大小（`image-tokenization`），或在最低编码质量下仍超过 500 KiB。图片携带 `detail: "original"`，因此 Eval 的显示缩放不会改变它。短边小于 200px 的截图会放大或填充到该下限。Chromium 或 cmux 上的 `silent: true` 截图根据设备像素确定大小，因为不会读取其缩放值。截图文本只有一行：模型看到的大小、保留完整大小文件时的文件信息，以及仅在图片不是 CSS 像素时说明位置映射方式。缩放后的 `fullPage` 或 `selector` 截图会说明从图片坐标到页面或元素相对 CSS 像素的换算因子。缩放后的视口截图则注明视口的 CSS 尺寸，并且在标签页下一次视口截图之前，`clickAt`、`mouseMove` 和 `drag` 的 `{ x, y }` 点位会被视为该图片上的位置，并映射到视口；`css: true`（`clickAt(x, y, { css: true })`、`{ x, y, css: true }`）表示在页面上测量的视口 CSS 像素。`wheel` 和 `scroll` 的增量，以及 `tab.run` 内的原始 `page.mouse` 输入，始终使用 CSS 像素。如果 omp 知道截图后视口大小发生了变化（模拟的 Chromium 视口、Tern 或 WebKit 的 `emulate({ viewport })`），旧图片上的位置会抛出异常，要求重新截图；用户调整窗口大小则不会被检测到。除非设置 `silent: true`，否则截图会输出 Eval 图片。`annotate: true` 叠加数字交互元素标签，并刷新 `tab.id` 映射。截图选项不接受输出路径；`diffScreenshot(baselinePath, { threshold?, output? })` 接受路径，`pdf({ path?, ... })` 则写入 PDF。

宿主结果详情会将结构化 `value` 与显示内容分开保留。打印文本受共享内联输出策略限制；超限文本存为会话产物，并打印截断后的文本。

## 安全与生命周期 \{#safety-and-lifecycle}

Relay 和连接模式操作的是真实的已登录会话；网站会将操作归于用户。应指定目标，或创建专用标签页。没有直接授权，绝不要导航用户可见的标签页，也不要执行会产生重要后果的操作。

在 macOS 上，用户位于另一应用时，若 omp 对 relay 标签页的输入打开了新标签页或弹窗，Chrome 会将自身设为活动应用；relay 会在接下来的半秒内将用户的应用恢复到前台，除非用户点击、按住 ⌘/⌃、从 Spotlight 或启动器选择应用、切换到另一应用，或 computer 工具拥有桌面控制权。在 relay 环境中设置 `PI_BROWSER_RELAY_KEEP_FRONT=0` 可关闭此行为。

Tern/WebKit 快速读取（`observe`、`ariaSnapshot`、`extract` 和截图）的准备与捕获阶段共享一个截止时间：最多 20 秒，并在预留恢复时间后限制在剩余 run 预算内。WebKit 使用原生捕获稳定等待，而不是再等待一个 JavaScript 动画帧。用户取消和有意设置的 `evaluate` 超时不会隔离渲染器。

每个命名标签页允许一个活动 run；以 Chromium 为后端的标签页拥有一个工作器，Tern/WebKit/cmux 则使用各自后端。run 超时或中止可能回收工作器并使句柄失效。如果 Chromium 标签页的渲染器已崩溃（在调用期间，或更早的空闲期间），调用会立即失败，并在返回前回收工作器，从而重新加载页面；错误会说明此情况。页面若无法恢复（加载时再次崩溃，或 relay 标签页在重新连接后仍然崩溃），就会关闭标签页；工作器内联运行在 omp 进程中的标签页发生任何崩溃时也会关闭。对这种标签页执行导航或调整大小的打开操作会先重新加载，并报告此情况。标签页在打开它的智能体的整个生命周期中归该智能体（包括其顾问）所有，跨越 `/new`、`/resume`、派生和分支；`browser.close({ all: true })` 释放调用智能体的标签页，不影响其他智能体的标签页（父级、子代理），每个智能体结束时会关闭其标签页。`kill` 绝不关闭或终止 relay/CDP 连接的浏览器。

默认情况下，omp 拥有的受管理 Chromium 标签页会在轮次稳定结束时冻结，并在下次使用时解冻（`browser.freezeOnTurnEnd = true`）。自有 Chromium、WebKit 和 Tern 标签页空闲 1,800 秒后会关闭（`browser.idleCloseSec`；`0` 禁用此功能）。`persist: true` 使标签页不受这两项策略管理，但显式关闭仍会释放它。Relay、已连接、新启动和 cmux 标签页不会自动冻结或因空闲而关闭。会话结束时，omp 打开的 relay 标签页会关闭，`persist` 标签页除外，它们保留在用户的 Chrome 中。

## 常见恢复方法 \{#common-recovery}

- 标签页不存在或已失效：再次调用 `browser.open`。
- id/ref 过期：再次调用 `observe` 或 `ariaSnapshot`，然后重新获取句柄。通过句柄或元素已被页面替换的 `aria-ref` 点击，会立即失败；向 `tab.click`、`dblclick`、`check`、`uncheck`、`uploadFile` 和 `frame.click` 提供选择器，则会重新查找。
- 标签页忙碌：等待活动辅助方法/run 完成，再发起另一个调用。
- 选择器超时：重新观察并使用受支持的选择器。
- WebKit 渲染器无响应：如果快速读取和独立渲染器探测都超时，后续调用会立即失败。显式执行 `await browser.close({ name })`，然后重新打开标签页。其他标签页和用户拥有的 Tern 视图不会被自动终止。
- Relay 不可用：打开装有 omp 扩展的 Chrome；如果工具栏徽标一直未开启，运行 `omp browser-relay install`，注册提供 relay 服务的原生宿主。
- 连接目标不存在：检查可用页面，并使用精确的 `target`。

`tab.run` 和直接辅助方法针对实时浏览器状态执行。每次改变 UI 的操作之后，都应验证实际页面。
