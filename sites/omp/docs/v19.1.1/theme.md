---
title: "主题参考"
description: "Oh My Pi v19.1.1 仓库文档：主题参考。"
---

# 主题参考 \{#theming-reference}

本文描述编码智能体的主题结构、加载方式、运行时行为和失败处理。

## 主题系统的控制范围 \{#what-the-theme-system-controls}

主题系统控制以下内容：

- 整个终端界面使用的前景色和背景色标记。
- Markdown 样式适配器（`getMarkdownTheme()`）。
- 选择器、编辑器和设置列表适配器（`getSelectListTheme()`、`getEditorTheme()`、`getSettingsListTheme()`）。
- 符号预设及覆盖项（`unicode`、`nerd`、`ascii`）。
- 原生高亮器（`@oh-my-pi/pi-natives`）使用的语法高亮颜色。
- 状态栏各段的颜色。
- 智能体中心、智能体树和 Task 工具条目中的智能体名称颜色。

主要实现位于 `packages/tui/src/theme/theme.ts`。

## 主题 JSON 结构 \{#theme-json-shape}

自定义主题文件是 JSON 对象，由 `packages/tui/src/theme/schema-validation.ts` 中的 `validateThemeJson()` 使用 `@oh-my-pi/omptype` 校验。类型定义位于 `schema.ts`，供编辑器使用的 JSON Schema 位于 `packages/tui/src/theme/theme-schema.json`。内置主题随程序嵌入，不经过运行时校验。

顶层字段：

- `name`（必填）。
- `colors`（必填；除 `thinkingMax` 外，所有标记均必填）。
- `vars`（可选；可复用的颜色变量）。
- `export`（可选；HTML 导出颜色）。
- `symbols`（可选）。
   - `preset`（可选，可用值为 `unicode | nerd | ascii`）。
   - `overrides`（可选，为 `SymbolKey` 提供键值覆盖）。

颜色接受以下值：

- 十六进制字符串（`"#RRGGBB"`）。
- 256 色调色板中的数字索引（使用 `0..255`，运行时 schema 接受数字但不强制此范围）。
- 变量引用字符串（通过 `vars` 解析）。
- 空字符串（`""`），表示终端默认色：前景 `\x1b[39m`、背景 `\x1b[49m`。

## 必填与可选颜色标记 \{#required-and-optional-color-tokens}

下面列出的标记在 `colors` 中均为必填，但有以下例外：`thinkingMax` 回退到 `thinkingXhigh`；`assistantMessageText` 未设置或为空时保留终端默认前景色；`mdExtensionLink` 未设置时根据 `mdLink` 生成弱化颜色；`subagent1` 到 `subagent6` 未设置时由 omp 从主题中选取智能体颜色。

### 基本文本和边框（11 项） \{#core-text-and-borders-11}

`accent`、`border`、`borderAccent`、`borderMuted`、`success`、`error`、`warning`、`muted`、`dim`、`text`、`thinkingText`

### 背景块（7 项） \{#background-blocks-7}

`selectedBg`、`userMessageBg`、`customMessageBg`、`toolPendingBg`、`toolSuccessBg`、`toolErrorBg`、`statusLineBg`

### 消息与工具文本（5 项必填，1 项可选） \{#messagetool-text-5-required-1-optional}

`userMessageText`、`customMessageText`、`customMessageLabel`、`toolTitle`、`toolOutput`，以及可选的 `assistantMessageText`

`assistantMessageText` 设置助手回复中普通段落的文本颜色，Markdown 子元素仍用各自的 `md*` 标记。助手正文由该标记控制，不受 `text` 影响。`text` 仅用于显式调用 `theme.fg("text", …)` 的位置，例如编辑器和对话框，从不用于助手消息正文。省略 `assistantMessageText` 或设为 `""` 时，正文仍会使用终端默认前景色，与该标记出现前相同。如果显式安装了正文颜色变换（实时命令输出），变换仍优先于该标记。

### Markdown（10 项必填，1 项可选） \{#markdown-10-required-1-optional}

`mdHeading`、`mdLink`、`mdLinkUrl`、`mdCode`、`mdCodeBlock`、`mdCodeBlockBorder`、`mdQuote`、`mdQuoteBorder`、`mdHr`、`mdListBullet`，以及可选的 `mdExtensionLink`

`mdExtensionLink` 为扩展注册了协议的链接标签着色，例如在原地展开文本的链接。这类链接不会打开浏览器，因此颜色与用于打开 URL 链接的 `mdLink` 区分。省略该标记时，omp 按 45% 链接色和 55% 正文色混合 `mdLink` 与 `text`。任一标记的值为 `""` 时，以主题的 `terminal.foreground` 参与混合；调色板索引 0 到 15 使用对应的 `terminal.ansi` 槽位。两者均未声明时使用近似颜色：索引 0 到 15 使用标准调色板，`""` 使用估算的默认前景色。如果估算效果不对，可显式设置该标记。`tui.colorfulMarkdown` 不改变这两种链接颜色。

启用 `tui.colorfulMarkdown`（默认开启）时，标题、`**strong**`、`*emphasis*`、行内代码和表头从主题的 `terminal.ansi` 调色板取色，不再使用 `mdHeading`/`mdCode` 或不带颜色的粗体与斜体。一级标题用洋红色，二级标题用黄色，三级到六级标题用蓝色，粗体和斜体用洋红色，行内代码用绿色，表头用黄色。所有色相都出自同一调色板，因此可以保持区分。关闭后，各级标题恢复 `mdHeading`，行内代码恢复 `mdCode`，粗体和斜体不再着色。

### 工具差异与语法高亮（12 项） \{#tool-diff--syntax-highlighting-12}

`toolDiffAdded`、`toolDiffRemoved`、`toolDiffContext`、
`syntaxComment`、`syntaxKeyword`、`syntaxFunction`、`syntaxVariable`、`syntaxString`、`syntaxNumber`、`syntaxType`、`syntaxOperator`、`syntaxPunctuation`

### 模式与思考档位边框（9 项必填，1 项可选） \{#modethinking-borders-9-required-1-optional}

`thinkingOff`、`thinkingMinimal`、`thinkingLow`、`thinkingMedium`、`thinkingHigh`、`thinkingXhigh`、可选的 `thinkingMax`、`bashMode`、`pythonMode`、`btwMode`

### 状态栏分段颜色（13 项） \{#status-line-segment-colors-13}

`statusLineSep`、`statusLineModel`、`statusLinePath`、`statusLineGitClean`、`statusLineGitDirty`、`statusLineContext`、`statusLineSpend`、`statusLineStaged`、`statusLineDirty`、`statusLineUntracked`、`statusLineOutput`、`statusLineCost`、`statusLineSubagents`

### 智能体名称颜色（6 项可选） \{#agent-name-colors-6-optional}

`subagent1`、`subagent2`、`subagent3`、`subagent4`、`subagent5`、`subagent6`

主智能体的名称使用 `accent`。子代理按它们进入会话的顺序获得颜色：第一个子代理使用第一个颜色，第七个子代理复用它。每个智能体在会话余下的时间内保持同一颜色。声明了 `subagentN` 就按其原值使用。对于主题未设置的槽位，系统按顺序选色。候选颜色与绘制名称的各个背景表面都应有至少 3:1 的对比度。背景使用 `terminal.background`，未设置时用 `statusLineBg`，还需考虑 Task 卡片色调 `toolPendingBg`、`toolSuccessBg` 和 `toolErrorBg`。候选颜色与 `accent`、`error` 及彼此间的 OKLab 距离至少为 0.10。系统先用主题自身的 `terminal.ansi` 色相（蓝、绿、黄、洋红、青，然后是对应的亮色槽，红色留给错误）；接着使用按会话颜色同样的方式从 `accent` 推导的色相（每个色相还提供与背景亮度差距再增加一档和两档的变体）；最后使用固定的后备色集合。

## 可选标记 \{#optional-tokens}

### `export` 部分（可选） \{#export-section-optional}

用于 HTML 导出主题的辅助函数：

- `export.pageBg`
- `export.cardBg`
- `export.infoBg`

省略时，导出代码会从解析后的主题颜色推导默认值。

### `terminal` 部分（可选） \{#terminal-section-optional}

描述该主题适用的终端，供自行绘制终端的宿主（Tern）使用。omp 从不设置终端自身的颜色。`terminal.ansi` 必须有 16 项（ANSI 0 到 15），也是彩色 Markdown 使用的调色板。主题没有这一项时，回退到终端自身的 ANSI 颜色。智能体名称颜色优先取自 `terminal.ansi`，并检查其与 `terminal.background` 的对比度。

### `symbols` 部分（可选） \{#symbols-section-optional}

- `symbols.preset` 设置主题级的默认符号集。
- `symbols.overrides` 可以覆盖单个 `SymbolKey` 的值。
- `symbols.spinnerFrames` 覆盖加载动画的帧。可以用一个扁平的 `string[]` 同时定义两类动画，也可以用对象 `{ "status"?: string[], "activity"?: string[] }` 分别覆盖它们。未指定的类型回退到符号预设的默认帧。`status` 控制加载器和工具执行指示器使用的动画，约 12.5 帧/秒。`activity` 控制 Markdown 进度条等高频界面使用的动画，约 30 帧/秒。

运行时优先顺序：

1. 设置中的 `symbolPreset` 覆盖项（若已配置）。
2. 主题 JSON 中的 `symbols.preset`。
3. 后备值 `"unicode"`。

交互模式下，Glyph Protocol 握手成功后，来源为 `default` 的 Unicode 预设会升级为 Nerd Font 图标，不改动已保存的设置。显式配置的预设（包括 `unicode`）不会升级。Tern 原生界面在运行时会在当前进程内强制使用 Nerd 预设，关闭时恢复用户预设。

忽略无效的覆盖键，并通过 `logger.debug` 记录。

#### 框线边框 \{#box-drawing-borders}

工具结果边框、浮层、代码围栏、编辑器、欢迎横幅等带轮廓的界面元素都用 `boxRound.*` 标记绘制。边框使用圆角（`╭╮╰╯`），丁字和十字连接处（`├┤┬┴┼`）没有圆角形式的 Unicode 字符，从 `boxSharp.*` 取值。Markdown 表格是唯一例外，完整使用带直角的 `boxSharp.*` 集合（`┌┐└┘`）。

覆盖项按这一分工生效：

- `boxRound.{topLeft,topRight,bottomLeft,bottomRight,horizontal,vertical}` 改变各边框的角与边。
- `boxSharp.{cross,teeDown,teeUp,teeRight,teeLeft}` 改变各处的分隔线和连接处，包括圆角边框和表格。
- `boxSharp.{topLeft,topRight,bottomLeft,bottomRight}` 只影响 Markdown 表格的角。

## 内置主题与自定义来源 \{#built-in-vs-custom-theme-sources}

主题查找顺序（`loadThemeJson`）：

1. 嵌入的内置主题（`dark.json`、`light.json`，以及 `defaults.json` 中的所有调色板）。
2. 自定义主题文件：`<customThemesDir>/<name>.json`。

`getCustomThemesDir()` 确定自定义主题目录：

- 默认：`~/.omp/agent/themes`。
- 默认档案的覆盖项：`PI_CODING_AGENT_DIR`（`$PI_CODING_AGENT_DIR/themes`）。
- 命名配置档案：配置根目录下的 `~/.omp/profiles/<name>/agent/themes`。命名档案会自行确定其智能体目录。

`getAvailableThemes()` 合并并排序内置和自定义主题名。同名时内置主题优先。

## 加载、校验和解析 \{#loading-validation-and-resolution}

自定义主题文件按以下步骤处理：

1. 读取 JSON。
2. 解析 JSON。
3. 用 `validateThemeJson()` 校验，包括必填字段、字符串或数字类型，并要求加载动画帧数组非空。
4. 递归解析 `vars` 引用。
5. 按终端的颜色能力将解析后的值转换为 ANSI 值。

校验行为：

- 缺少必填颜色标记：显示按组列出的明确错误。
- 标记类型无效：运行时 schema 报错。字符串颜色值和变量引用在解析或转换时检查。
- 未找到主题文件：`Theme not found: <name>`。

变量引用行为：

- 支持嵌套引用。
- 引用的变量不存在时抛出错误。
- 循环引用时抛出错误。

## 终端颜色模式 \{#terminal-color-mode-behavior}

检测颜色模式（`theme/color.ts` 中的 `detectColorMode`）：

- 有 `WT_SESSION` 时，使用真彩色。
- 否则使用共享终端能力模型中的 `detectTerminalId()` 和 `getTerminalInfo()`；只有 `TerminalInfo.trueColor` 为真时才选择真彩色。

转换行为：

- 十六进制：`Bun.color(..., "ansi-16m" | "ansi-256")`。
- 数字：`38;5` / `48;5` ANSI。
- `""`：重置为默认前景色或背景色。

## 运行时切换行为 \{#runtime-switching-behavior}

`theme` 导出是实时绑定，即使在随程序打包的扩展中也是如此。请在渲染回调中读取，不要在切换之间保留旧主题实例。扩展的渲染回调也可使用传入的主题参数。

```ts
import { theme } from "@oh-my-pi/pi-coding-agent";

const renderStatus = () => theme.fg("accent", "Ready");
```

### 初始主题（`initThemeSync` / `initTheme`） \{#initial-theme-initthemesync--inittheme}

启动输入区在首次绘制前同步初始化缓存的主题。随后 `main.ts` 根据下列设置初始化最终生效的主题：

- `symbolPreset`
- `colorBlindMode`
- `theme.dark`
- `theme.light`

自动选择主题槽位时，按以下顺序使用终端外观信息：

1. 终端通过 OSC 11 报告的背景亮度，除非已启用 macOS/Zellij 后备路径。
2. `COLORFGBG` 背景索引（`< 8` 使用深色，`>= 8` 使用浅色）。
3. 仅对已知失效的 macOS/Zellij OSC 11 组合使用 macOS 外观作为后备。
4. 回退到深色槽位。

当前默认值（定义于 `packages/coding-agent/src/modes/settings.ts`）：

- `theme.dark = "titanium"`
- `theme.light = "light"`
- `symbolPreset = "unicode"`
- `colorBlindMode = false`

### 显式切换（`setTheme`） \{#explicit-switching-settheme}

- 加载所选主题。
- 更新实时 `theme` 导出。
- 按选项启动文件监听器。
- 触发 `onThemeChange` 回调。

失败时：

- 回退到内置 `dark` 主题。
- 返回 `{ success: false, error }`。

### 预览切换（`previewTheme`） \{#preview-switching-previewtheme}

- 将预览主题应用到实时 `theme` 导出。
- 本身**不**改变持久化设置。
- 返回成功或错误，不用后备主题替换。

设置界面用它实时预览，取消时恢复先前的主题。

## 文件监听与重新加载 \{#watchers-and-live-reload}

启用监听器后（`setTheme(..., true)` 或交互式初始化）：

- 只有 `<customThemesDir>/<currentTheme>.json` 存在时才监听。
- 内置主题实际上不会被监听。查找时内置主题也优先于同名自定义文件。
- 匹配的文件发生变化时，防抖后重新加载。重新加载出错或文件暂时缺失时，保留上次成功加载的主题。
- 监听器不会针对删除或改名执行后备处理。它会等下一次成功重新加载，或等用户显式切换主题。

自动模式也会在终端外观变化、收到 `SIGWINCH` 或 macOS 后备观察器（启用时）发出通知时，重新判断深色和浅色槽位的映射。

## 色觉辅助模式 \{#color-blind-mode-behavior}

`colorBlindMode` 在运行时只改变一个颜色标记：

- 在 HSV 色彩空间调整 `toolDiffAdded`，使绿色偏向蓝色。
- 仅在解析后的值为十六进制字符串时调整。

其他标记保持不变。从 `accent` 推导的智能体名称颜色会避开主题已有色相，包括 `toolDiffAdded`。因此，该标记偏移后可能导致其中一个推导出的名称颜色变化。

## 主题设置的持久化位置 \{#where-theme-settings-are-persisted}

`Settings` 将主题相关设置保存到全局 YAML 配置：

- 路径：`<agentDir>/config.yml`。
- 默认智能体目录：`~/.omp/agent`。
- 实际默认文件：`~/.omp/agent/config.yml`。

保存的配置键：

- `theme.dark`
- `theme.light`
- `symbolPreset`
- `colorBlindMode`

系统支持迁移旧配置：根据亮度检测，将扁平的自定义 `theme: "name"` 迁移到嵌套的 `theme.dark` 或 `theme.light`。会移除扁平的 `"dark"` 或 `"light"` 值，以使用当前默认值。

## 创建自定义主题 \{#creating-a-custom-theme-practical}

1. 在自定义主题目录内创建文件，例如 `~/.omp/agent/themes/my-theme.json`。
2. 填写 `name`、可选的 `vars`，以及 `colors` 中全部**必填**标记。
3. 按需加入 `symbols` 和 `export`。
4. 根据想要使用的自动槽位，在设置中选择主题（`Appearance -> Dark Theme` 或 `Appearance -> Light Theme`）。

最小结构：

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

按以下步骤检查：

1. 启动交互模式，文件监听器会随启动启用。
2. 打开设置并预览主题值，使用实时 `previewTheme`。
3. 对于自定义主题，在程序运行时编辑 JSON，确认保存后自动重新加载。
4. 检查以下关键界面：
   - Markdown 渲染。
   - 工具块的等待、成功和错误状态。
   - 差异的新增、移除和上下文渲染。
   - 状态栏的可读性。
   - 更改思考档位时的边框变化。
   - Bash 和 Python 模式的边框颜色。
5. 如果主题依赖字形宽度或外观，验证两种符号预设。

## 约束与注意事项 \{#real-constraints-and-caveats}

- 自定义主题必须提供 `colors` 中全部标记，但以下可选项除外：`thinkingMax`（回退到 `thinkingXhigh`）、`assistantMessageText`（未设置时保留终端默认前景色）、`mdExtensionLink`（未设置时混合 `mdLink` 与 `text`），以及 `subagent1` 到 `subagent6`（未设置时由 omp 从主题中选择智能体颜色）。
- `export` 和 `symbols` 为可选项。
- 主题 JSON 中的 `$schema` 仅供参考。`packages/tui/src/theme/schema-validation.ts` 中的 `@oh-my-pi/omptype` 执行自定义主题的运行时校验。
- `setTheme` 失败时回退到 `dark`；`previewTheme` 失败不会替换当前主题。
- 文件监听器重新加载出错或文件暂时缺失时，保留当前加载的主题，直到成功重新加载或显式切换主题。
