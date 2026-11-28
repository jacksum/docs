---
title: "主题参考"
description: "Oh My Pi 官方仓库文档：主题参考。"
---

# 主题参考 \{#theming-reference}

本文介绍 coding-agent 当前的主题机制：模式、加载、运行时行为以及故障模式。

## 主题系统控制的内容 \{#what-the-theme-system-controls}

主题系统驱动以下内容：

- 整个 UI 使用的前景/背景颜色令牌（`theme.fg(key, text)`、`theme.bg(key, text)`、`theme.style(tokens, text)`）
- Markdown 样式（`@oh-my-pi/pi-tui/text/markdown`，样式来自活动主题）
- 通过 `theme.symbols` 设置的符号预设和符号覆盖（`unicode`、`nerd`、`ascii`）
- 原生高亮器使用的语法高亮颜色（`@oh-my-pi/pi-natives`）
- 状态行分段颜色
- 智能体中心、智能体树和 Task 工具行中的智能体名称颜色

实现：

- `packages/tui/src/theme/`（`@oh-my-pi/pi-tui/theme/*`）：主题文件格式（`schema.ts`）、加载（`loader.ts`）、在某一色深下的解析（`theme.ts`、`ResolvedTheme`）、符号（`symbols.ts`）、活动主题信号和 `ThemeController`（`runtime.ts`）。
- `packages/coding-agent/src/ui/theme/service.ts`：应用的主题服务。它持有唯一的 `ThemeController`，并将其与设置、终端和主题选择器连接起来。

## 主题 JSON 结构 \{#theme-json-shape}

自定义主题文件是 JSON 对象，由 `packages/tui/src/theme/schema.ts` 中的 `validateThemeJson()` 验证；同一文件中还定义了 `ThemeJson` 类型和令牌列表（`FOREGROUND_KEYS`、`BACKGROUND_KEYS`、`isForegroundKey()`）。内嵌的内置主题跳过运行时验证。

顶层字段：

- `name`（必需）
- `colors`（必需；除 `thinkingMax` 外，所有令牌都必需）
- `vars`（可选；可复用的颜色变量）
- `export`（可选；HTML 导出颜色）
- `symbols`（可选）
   - `preset`（可选：`unicode | nerd | ascii`）
   - `overrides`（可选：`SymbolKey` 的键/值覆盖）

颜色值接受以下形式：

- 十六进制字符串（`"#RRGGBB"`）
- 数值型 256 色索引（使用 `0..255`；运行时模式接受数值，但不强制此范围）
- 变量引用字符串（通过 `vars` 解析）
- 空字符串（`""`），表示终端默认值（前景为 `\x1b[39m`，背景为 `\x1b[49m`）

## 必需和可选的颜色令牌 \{#required-and-optional-color-tokens}

以下所有令牌都需要放在 `colors` 中，例外是 `thinkingMax`（回退为 `thinkingXhigh`）、`assistantMessageText`（未设置/为空时保留终端默认前景色）、`mdExtensionLink`（未设置时派生出柔和的 `mdLink`）和 `subagent1`-`subagent6`（未设置时由 omp 从主题中挑选智能体颜色）。

### 核心文本和边框（11） \{#core-text-and-borders-11}

`accent`, `border`, `borderAccent`, `borderMuted`, `success`, `error`, `warning`, `muted`, `dim`, `text`, `thinkingText`

### 背景块（7） \{#background-blocks-7}

`selectedBg`, `userMessageBg`, `customMessageBg`, `toolPendingBg`, `toolSuccessBg`, `toolErrorBg`, `statusLineBg`

### 消息/工具文本（5 个必需，1 个可选） \{#messagetool-text-5-required-1-optional}

`userMessageText`, `customMessageText`, `customMessageLabel`, `toolTitle`, `toolOutput`，可选的 `assistantMessageText`

`assistantMessageText` 为助手回复中的普通段落正文着色（Markdown 子元素保留各自的 `md*` 令牌）。控制助手正文的是这个令牌，而不是 `text`：`text` 应用在显式的 `theme.fg("text", …)` 调用点（编辑器/对话框界面），绝不会应用于助手消息正文。省略 `assistantMessageText` 或将其设置为 `""` 时，正文使用终端默认前景色渲染，与该令牌出现之前完全相同。显式安装的正文颜色变换（实时命令输出）仍然优先于该令牌。

### Markdown（10 个必需，1 个可选） \{#markdown-10-required-1-optional}

`mdHeading`, `mdLink`, `mdLinkUrl`, `mdCode`, `mdCodeBlock`, `mdCodeBlockBorder`, `mdQuote`, `mdQuoteBorder`, `mdHr`, `mdListBullet`，可选的 `mdExtensionLink`

`mdExtensionLink` 为其 scheme 由扩展注册的链接标签着色（例如在原地展开文本的链接）。这种链接不会在浏览器中打开任何内容，因此其颜色与为打开 URL 的链接着色的 `mdLink` 区分开来。省略时，omp 会将 `mdLink` 与 `text` 混合（45% 链接，55% 文本）。任一令牌中的 `""` 都按主题的 `terminal.foreground` 参与混合，调色板索引 0-15 则按其 `terminal.ansi` 槽位参与混合。如果主题两者都没有声明，就使用近似值：索引 0-15 使用标准调色板，`""` 使用猜测的默认前景色。猜测不合适时，请显式设置该令牌。`tui.colorfulMarkdown` 不会更改这两种链接颜色。

开启 `tui.colorfulMarkdown` 设置时（默认开启），标题、`**strong**`、`*emphasis*`、行内代码和表头从主题的 `terminal.ansi` 调色板取色，而不是使用 `mdHeading`/`mdCode` 和普通粗体/斜体：H1 为品红色，H2 为黄色，H3-H6 为蓝色，粗体/强调为品红色，行内代码为绿色，表头为黄色。所有色相都来自同一个调色板，因此保持可区分。关闭该设置后，各级标题恢复使用 `mdHeading`，代码恢复使用 `mdCode`，粗体/斜体恢复为不着色。

### 工具差异和语法高亮（12） \{#tool-diff--syntax-highlighting-12}

`toolDiffAdded`, `toolDiffRemoved`, `toolDiffContext`,
`syntaxComment`, `syntaxKeyword`, `syntaxFunction`, `syntaxVariable`, `syntaxString`, `syntaxNumber`, `syntaxType`, `syntaxOperator`, `syntaxPunctuation`

### 模式/思考边框（9 个必需，1 个可选） \{#modethinking-borders-9-required-1-optional}

`thinkingOff`, `thinkingMinimal`, `thinkingLow`, `thinkingMedium`, `thinkingHigh`, `thinkingXhigh`，可选的 `thinkingMax`, `bashMode`, `pythonMode`, `btwMode`

### 状态行分段颜色（13） \{#status-line-segment-colors-13}

`statusLineSep`, `statusLineModel`, `statusLinePath`, `statusLineGitClean`, `statusLineGitDirty`, `statusLineContext`, `statusLineSpend`, `statusLineStaged`, `statusLineDirty`, `statusLineUntracked`, `statusLineOutput`, `statusLineCost`, `statusLineSubagents`

### 智能体名称颜色（6 个可选） \{#agent-name-colors-6-optional}

`subagent1`, `subagent2`, `subagent3`, `subagent4`, `subagent5`, `subagent6`

主智能体的名称使用 `accent`。子代理按进入会话的顺序分配颜色：第一个获得第一个子代理颜色，第七个复用该颜色，智能体在会话剩余期间保持其颜色。声明的 `subagentN` 按原值使用。对于主题未设置的槽位，依次填入满足以下条件的颜色：与名称绘制所在的每种表面（`terminal.background`，否则为 `statusLineBg`，以及 Task 卡片色调 `toolPendingBg`、`toolSuccessBg`、`toolErrorBg`）的对比度至少为 3:1，并且在 OKLab 中与 `accent`、`error` 以及彼此之间的距离至少为 0.10。首先使用主题自身的 `terminal.ansi` 色相（蓝、绿、黄、品红、青，然后是它们的亮色槽位；红色留给错误），接着采用与会话颜色相同的方式从 `accent` 派生色相（每个色相还提供明度向远离背景方向移动一步和两步的版本），最后使用固定的回退集合。

## 可选令牌 \{#optional-tokens}

### `export` 节（可选） \{#export-section-optional}

供 HTML 导出主题辅助函数使用：

- `export.pageBg`
- `export.cardBg`
- `export.infoBg`

如果省略，导出代码会从解析后的主题颜色派生默认值。

### `terminal` 节（可选） \{#terminal-section-optional}

描述主题所针对的终端，供自行绘制终端的宿主（Tern）使用；omp 从不设置终端的颜色。`terminal.ansi`（恰好 16 个条目，ANSI 0-15）也是彩色 Markdown 绘制时所用的调色板；没有它的主题会回退为终端自身的 ANSI 颜色。智能体名称颜色首先取自 `terminal.ansi`，并相对于 `terminal.background` 检查对比度。

### `symbols` 节（可选） \{#symbols-section-optional}

- `symbols.preset` 设置主题级默认符号集。
- `symbols.overrides` 可以覆盖单个 `SymbolKey` 值。
- `symbols.spinnerFrames` 覆盖加载旋转指示器的帧。既接受扁平的 `string[]`（应用于两种旋转指示器类型），也接受对象 `{ "status"?: string[], "activity"?: string[] }`，以独立覆盖每种类型。未指定的类型回退为符号预设的默认帧。`status` 驱动加载器和工具执行指示器使用的约 12.5fps 旋转指示器；`activity` 驱动 Markdown 进度条及类似高频 UI 使用的约 30fps 旋转指示器。

运行时优先级：

1. 设置中的 `symbolPreset` 覆盖（如果已设置）
2. 主题 JSON 的 `symbols.preset`
3. 回退值 `"unicode"`

在交互模式下，成功的 Glyph Protocol 握手会将设置来源为 `default` 的 Unicode 预设升级为 Nerd Font 图标，而不更改已保存的设置。显式配置的预设（包括 `unicode`）不会升级。活动的 Tern 原生表面会在进程本地强制使用 Nerd 预设，并在关闭时恢复用户的预设。

无效的覆盖键会被忽略并记录到日志（`logger.debug`）。

#### 框线边框 \{#box-drawing-borders}

所有带轮廓的界面框架，包括工具结果边框、浮层、编辑器、欢迎横幅，都使用 `boxRound.*` 令牌绘制：圆角（`╭╮╰╯`）加上 T 形/十字交点（`├┤┬┴┼`，它们没有圆角 Unicode 形式，因此取自 `boxSharp.*` 令牌）。Markdown 表格是唯一的例外，保留完整的直角 `boxSharp.*` 集合（`┌┐└┘`）。

Markdown 代码围栏不加边框：它们渲染为字面的围栏行（` ```lang ` 和 ` ``` `），以 `mdCodeBlockBorder` 着色，正文位于其间（思考块中缩进两个空格，助手回复中左对齐）。任何 `boxRound.*` 或 `boxSharp.*` 令牌都不会影响它们。

覆盖行为遵循这一划分：

- `boxRound.{topLeft,topRight,bottomLeft,bottomRight,horizontal,vertical}` 重新设置每个边框的角和边的样式。
- `boxSharp.{cross,teeDown,teeUp,teeRight,teeLeft}` 重新设置所有位置的分隔线/交点样式（圆角边框和表格均包括在内）。
- `boxSharp.{topLeft,topRight,bottomLeft,bottomRight}` 现在只影响 Markdown 表格的角。

## 内置与自定义主题来源 \{#built-in-vs-custom-theme-sources}

主题查找顺序（`loadThemeJson`）：

1. 内置的内嵌主题（`dark.json`、`light.json` 以及 `defaults.json` 中的每个调色板）
2. 自定义主题文件：`<customThemesDir>/<name>.json`

自定义主题目录来自 `getCustomThemesDir()`：

- 默认：`~/.omp/agent/themes`
- 默认配置档案覆盖：`PI_CODING_AGENT_DIR`（`$PI_CODING_AGENT_DIR/themes`）
- 命名配置档案：`~/.omp/profiles/<name>/agent/themes`（位于配置的根目录下）；命名配置档案会派生自己的智能体目录

`listThemes()`（`@oh-my-pi/pi-tui/theme/loader`）返回合并并排序后的内置与自定义名称，名称冲突时内置主题优先。主题服务中的 `getAvailableThemesWithPaths()` 会添加每个自定义主题的文件路径。

## 加载、验证和解析 \{#loading-validation-and-resolution}

对于自定义主题文件：

1. 读取 JSON
2. 解析 JSON
3. 使用 `validateThemeJson()` 验证（必需字段和字符串/数值类型；旋转指示器帧数组不得为空）
4. 递归解析 `vars` 引用（`resolveColorValue()`）
5. 按终端色深将解析后的值转换为 SGR 转义序列

验证行为：

- 缺少必需的颜色令牌：明确的分组错误消息
- 令牌类型错误：运行时模式错误；字符串颜色值和变量引用在解析/转换期间检查
- 未知主题文件：`Theme not found: <name>`

变量引用行为：

- 支持嵌套引用
- 缺少变量引用时抛出异常
- 存在循环引用时抛出异常

## 终端颜色模式行为 \{#terminal-color-mode-behavior}

色深（`ColorDepth`：`truecolor`、`256` 或 `16`）来自终端能力（`packages/tui/src/theme/color.ts` 中的 `depthOf()`）。主题服务跟随终端驱动的能力（通过探测获得，随回复到达而细化）。在驱动运行之前以及 CLI 命令中，它使用环境所暗示的能力（`capabilitiesFromEnv()`：终端标识、`COLORTERM`、`WT_SESSION`、`TERM`）。

转换行为：

- 真彩色/256 色下的十六进制值 -> `Bun.color(..., "ansi-16m" | "ansi-256")`
- 16 色下的十六进制值 -> 按色相族和明度选取最接近的 ANSI 颜色
- 数值 -> `38;5` / `48;5` SGR（16 色下使用最接近的 ANSI 颜色）
- `""` -> 默认前景/背景重置

## 运行时切换行为 \{#runtime-switching-behavior}

活动主题是一个响应式信号：来自 `@oh-my-pi/pi-tui/theme/runtime` 的 `currentTheme()`。它始终持有一个主题（在服务启动前为内置的 `dark`）。只运行一次的代码，例如 CLI 输出和命令报告，在格式化时读取 `currentTheme()`。组件和绘制器在渲染期间读取它，因此每次切换时都会重绘。不要跨切换保留主题实例。扩展渲染器回调也可以使用接收到的主题参数。

```ts
import { currentTheme } from "@oh-my-pi/pi-tui/theme/runtime";
import { bold } from "@oh-my-pi/pi-tui/theme/theme";

const renderStatus = () => {
	const theme = currentTheme();
	return `${theme.symbols.symbol("status.success")} ${bold(theme.fg("accent", "Ready"))}`;
};
```

主题 API 概览（`@oh-my-pi/pi-tui/theme/contract` 中的 `Theme`，由 `ResolvedTheme` 实现）：

| 需求 | 调用 |
| --- | --- |
| 为文本着色 | `theme.fg("accent", text)`、`theme.bg("selectedBg", text)` |
| 文本片段令牌（颜色、色调、属性、语义） | `theme.style("accent strong", text)` |
| 粗体/斜体/下划线/删除线/反色/淡化 | `bold(text)` …，来自 `@oh-my-pi/pi-tui/theme/theme` |
| 字形 | `theme.symbols.symbol("status.success")`、`"tree.branch"`、`"sep.dot"`、`"icon.pin"`、… |
| 命名图标或斜杠命令图标 | `theme.symbols.icon("model")` |
| 框线字形 | `theme.symbols.box`（圆角）、`theme.symbols.sharp` |
| 旋转指示器 | `theme.symbols.spinnerFrames`、`theme.symbols.activityFrames` |
| 符号预设 | `theme.symbols.preset` |
| 浅色或深色 | `theme.dark` |
| 十六进制颜色 / 原始 SGR | `theme.hex(key)`、`theme.fgSgr(key)` |
| 思考级别颜色 | `theme.fg(thinkingColor(level), text)`（`thinkingColor` 来自 `@oh-my-pi/pi-tui/theme/schema`） |

### 启动服务（`initTheme`） \{#starting-the-service-inittheme}

启动组合器在首次绘制之前同步启动主题服务，使用上次运行缓存的主题偏好。随后 `main.ts` 使用以下设置正式启动它：

- `symbolPreset`
- `colorBlindMode`
- `theme.dark`
- `theme.light`

`initTheme()` 在自动模式下同步加载。CLI 命令不带参数调用 `initTheme()`，取得设置已经推送到服务中的偏好。

设置通过 `packages/coding-agent/src/modes/settings.ts` 中的 `effect(...)` 注册项驱动服务：`setThemeSlot("dark" | "light", name)`、`setSymbolPreset(preset)`、`setColorBlindMode(enabled)`。在 `initTheme()` 之前到达的值会被保留，并在它运行时应用。

在自动模式下，终端的外观决定槽位。服务跟随终端驱动（`followTerminal(driver)`）：其 `dark` 能力来自 OSC 11 背景回复，在该回复到达之前或始终未到达时则来自 `COLORFGBG`。如果两者都没有，则假定终端为深色。在驱动之外报告背景时，由 `setTerminalAppearance("dark" | "light")` 应用它。

当前默认值（定义于 `packages/coding-agent/src/modes/settings.ts`）：

- `theme.dark = "titanium"`
- `theme.light = "light"`
- `symbolPreset = "unicode"`
- `colorBlindMode = false`

### 显式切换（`setTheme`） \{#explicit-switching-settheme}

- 加载选定的主题并退出自动模式（`enableAutoTheme()` 可返回自动模式）
- 将其发布为 `currentTheme()`
- 通知 `onThemeChange` 监听器

失败时：

- 回退为内置的 `dark`
- 返回 `{ success: false, error }`

### 预览切换（`previewTheme`） \{#preview-switching-previewtheme}

- 将预览中的主题发布为 `currentTheme()`
- **不**更改已记住的主题、模式或持久化设置
- 返回成功/错误，不使用回退主题替换

`endThemePreview()` 重新应用已记住的主题。设置中的主题选择器使用这两者实现实时预览。

### 更改通知（`onThemeChange`） \{#change-notifications-onthemechange}

对于每个发布的主题，监听器都会收到 `{ cause, ephemeral }`。`cause` 是 `switch`、`preview`、`settings`、`terminal` 或 `file` 之一。预览以及终端外观或色深更改属于 `ephemeral`：实时 UI 会重绘，已写入的历史则保持原样。其他每次切换也会重绘历史，因此向后滚动看到的输出使用相同的调色板。

## 监听器和实时重载 \{#watchers-and-live-reload}

启用监听器时（`initTheme({ watch: true })`，交互式启动）：

- 只在 `<customThemesDir>/<currentTheme>.json` 文件存在时监听它
- 实际上不监听内置主题；内置主题查找也优先于同名自定义文件
- 匹配的文件更改会安排一次防抖重载；重载错误或文件暂时不存在时，保留上次成功加载的主题
- 监听器不会因删除/重命名而回退；它会等待后续成功重载或显式主题切换

`stopThemeWatcher()` 在关闭时停止监听。

终端外观发生更改时，自动模式也会重新评估深色/浅色槽位。

## 色盲模式行为 \{#color-blind-mode-behavior}

`colorBlindMode` 在运行时只更改一个令牌：

- 对 `toolDiffAdded` 进行 HSV 调整（绿色向蓝色偏移）
- 只在解析后的值为十六进制字符串时应用调整

其他令牌不变。从 `accent` 派生的智能体名称颜色会避开主题的色相，包括 `toolDiffAdded`，因此偏移后的令牌可能改变其中一种派生颜色。

## 主题设置的持久化位置 \{#where-theme-settings-are-persisted}

主题相关设置由 `Settings` 持久化到全局配置 YAML：

- 路径：`<agentDir>/config.yml`
- 默认智能体目录：`~/.omp/agent`
- 实际默认文件：`~/.omp/agent/config.yml`

持久化的键：

- `theme.dark`
- `theme.light`
- `symbolPreset`
- `colorBlindMode`

存在旧版迁移机制：扁平的自定义 `theme: "name"` 会根据亮度检测结果迁移为嵌套的 `theme.dark` 或 `theme.light`。扁平的 `"dark"`/`"light"` 值会被移除，以便应用当前默认值。

## 创建自定义主题（实践） \{#creating-a-custom-theme-practical}

1. 在自定义主题目录中创建文件，例如 `~/.omp/agent/themes/my-theme.json`。
2. 包含 `name`、可选的 `vars` 以及**所有必需的** `colors` 令牌。
3. 可以包含 `symbols` 和 `export`。
4. 根据所需的自动槽位，在设置中选择主题（`Appearance -> Dark Theme` 或 `Appearance -> Light Theme`）。

最小骨架：

```json
{
	"name": "my-theme",
	"vars": {
		"accent": "#7aa2f7",
		"muted": 244
	},
	"colors": {
		"accent": "accent",
		"border": "#4c566a",
		"borderAccent": "accent",
		"borderMuted": "muted",
		"success": "#9ece6a",
		"error": "#f7768e",
		"warning": "#e0af68",
		"muted": "muted",
		"dim": 240,
		"text": "",
		"thinkingText": "muted",

		"selectedBg": "#2a2f45",
		"userMessageBg": "#1f2335",
		"userMessageText": "",
		"customMessageBg": "#24283b",
		"customMessageText": "",
		"customMessageLabel": "accent",
		"toolPendingBg": "#1f2335",
		"toolSuccessBg": "#1f2d2a",
		"toolErrorBg": "#2d1f2a",
		"toolTitle": "",
		"toolOutput": "muted",

		"mdHeading": "accent",
		"mdLink": "accent",
		"mdLinkUrl": "muted",
		"mdCode": "#c0caf5",
		"mdCodeBlock": "#c0caf5",
		"mdCodeBlockBorder": "muted",
		"mdQuote": "muted",
		"mdQuoteBorder": "muted",
		"mdHr": "muted",
		"mdListBullet": "accent",

		"toolDiffAdded": "#9ece6a",
		"toolDiffRemoved": "#f7768e",
		"toolDiffContext": "muted",

		"syntaxComment": "#565f89",
		"syntaxKeyword": "#bb9af7",
		"syntaxFunction": "#7aa2f7",
		"syntaxVariable": "#c0caf5",
		"syntaxString": "#9ece6a",
		"syntaxNumber": "#ff9e64",
		"syntaxType": "#2ac3de",
		"syntaxOperator": "#89ddff",
		"syntaxPunctuation": "#9aa5ce",

		"thinkingOff": 240,
		"thinkingMinimal": 244,
		"thinkingLow": "#7aa2f7",
		"thinkingMedium": "#2ac3de",
		"thinkingHigh": "#bb9af7",
		"thinkingXhigh": "#f7768e",
		"thinkingMax": "#ff007c",

		"bashMode": "#2ac3de",
		"pythonMode": "#bb9af7",
		"btwMode": "#7aa2f7",

		"statusLineBg": "#16161e",
		"statusLineSep": 240,
		"statusLineModel": "#bb9af7",
		"statusLinePath": "#7aa2f7",
		"statusLineGitClean": "#9ece6a",
		"statusLineGitDirty": "#e0af68",
		"statusLineContext": "#2ac3de",
		"statusLineSpend": "#7dcfff",
		"statusLineStaged": "#9ece6a",
		"statusLineDirty": "#e0af68",
		"statusLineUntracked": "#f7768e",
		"statusLineOutput": "#c0caf5",
		"statusLineCost": "#ff9e64",
		"statusLineSubagents": "#bb9af7"
	}
}
```

## 测试自定义主题 \{#testing-custom-themes}

使用以下工作流程：

1. 启动交互模式（从启动时起启用监听器）。
2. 打开设置并预览主题值（实时 `previewTheme`）。
3. 对于自定义主题文件，在运行期间编辑 JSON，并确认保存时自动重载。
4. 试用关键界面：
   - Markdown 渲染
   - 工具块（待处理/成功/错误）
   - 差异渲染（新增/删除/上下文）
   - 状态行可读性
   - 思考级别边框变化
   - bash/python 模式边框颜色
5. 如果主题依赖字形宽度/外观，请验证两种符号预设。

## 实际约束和注意事项 \{#real-constraints-and-caveats}

- 自定义主题需要所有 `colors` 令牌，例外是可选的 `thinkingMax`（回退为 `thinkingXhigh`）、`assistantMessageText`（未设置时保留终端默认前景色）、`mdExtensionLink`（未设置时将 `mdLink` 与 `text` 混合）以及 `subagent1`-`subagent6`（未设置时由 omp 从主题中挑选智能体颜色）。
- `export` 和 `symbols` 是可选的。
- 主题 JSON 中的 `$schema` 仅作信息说明；自定义主题的运行时验证由 `packages/tui/src/theme/schema.ts` 中的 `validateThemeJson()` 完成。
- `setTheme` 失败时回退为 `dark`；`previewTheme` 失败时不替换当前主题。
- 文件监听器重载错误或文件暂时缺失时，保留当前加载的主题，直到成功重载或显式切换主题。
