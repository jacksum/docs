# 用主题定制 Pi \{#customize-pi-with-themes}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Customize Pi with themes](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/themes.md)。[上游 MIT 许可证](./license.md)。

主题控制 Pi 在交互式模式和导出的 HTML 中所用的颜色。Pi 内置 `system`、`dark` 和 `light` 三种主题。你可以选定一个主题、跟随终端的浅色或深色外观，也可以自定义配色。

## 使用终端的配色 \{#use-your-terminals-colors}

默认主题为 `system`。它根据终端主题生成配色，让 Pi 与终端保持一致：

- Pi 查询终端的默认前景色、默认背景色和 16 种 ANSI 颜色。
- Pi 界面中每种颜色的色相取自一种 ANSI 颜色，例如错误用红色，链接用蓝色。
- Pi 调整各个颜色的明度，使它们与背景达到最低对比度。正文在背景和所有面板上的对比度均达到或超过 WCAG 要求的 4.5:1。
- 当终端在浅色和深色外观之间切换时，Pi 会重新查询颜色并重新生成主题。

主题根据终端返回的信息调整配色：

| 终端返回的信息 | 结果 |
|---|---|
| 背景色和 ANSI 颜色 | 采用终端配色，并根据实际背景色调整明度。 |
| 只有背景色 | 采用 Pi 自带的色相，并根据实际背景色调整明度。 |
| 未返回颜色信息 | 使用 ANSI 颜色索引和终端的默认颜色，由终端自行渲染。次要文字以低亮度显示，面板没有背景色。 |

Pi 在启动时查询终端颜色。终端通常在几毫秒内响应，Pi 最多等待 100 ms，随后便会显示启动标题。如果终端未及时响应，Pi 会回退到 ANSI 配色。在较慢的 SSH 连接等情况下，Pi 仍会应用稍后收到的颜色。`system` 是保留名称；同名的自定义主题会被忽略。

<a id="selecting-a-theme"></a>

## 选择主题 \{#choose-a-theme}

打开 `/settings` 并选择 **Theme**（主题）。可以在所有终端外观下使用同一个主题，也可以为浅色和深色终端分别选择主题。

选中的主题保存在 `theme` [设置项](./settings.md#terminal-and-display)中：

```json
{
  "theme": "dark"
}
```

未指定 `theme` 时，Pi 使用 `system`。

自动模式下保存的设置将浅色主题列在前，深色主题列在后：

```json
{
  "theme": "light/dark"
}
```

Pi 根据终端报告的背景色和前景色判断终端是浅色还是深色。如果终端未报告背景色，Pi 会先采用终端发出的浅色或深色外观通知，再尝试读取 `COLORFGBG` 环境变量，最后回退到深色。Pi 根据同一判断结果从浅色和深色主题中选择一个，也据此确定 `system` 的外观。在自动模式下，终端报告外观变化时，Pi 会切换主题。主题名称不能包含 `/`，因为 Pi 将它保留给此设置格式使用。

使用 `--use-theme` 可指定本次调用的初始主题，不更改已保存的设置：

```bash
pi --use-theme light
pi --use-theme light/dark
```

命令行选项见[命令行资源选项](./cli.md#resources)。

## 创建自定义主题 \{#create-a-custom-theme}

复制一个[内置主题](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/src/modes/interactive/theme)，或创建符合[主题 JSON Schema](https://pi.dev/schemas/theme.schema.json)的 JSON 文件。内置主题使用 OKHSL 颜色，并通过变量在多个界面角色之间复用颜色，因此你可以直接调整色相、饱和度或明度。

1. 将文件保存为 `<agent-dir>/themes/my-theme.json`。代理目录默认为 `~/.pi/agent`。
2. 将 `name` 设为 `my-theme`。
3. 修改 `vars` 和 `colors` 中的值。
4. 在 `/settings` 中选择 `my-theme`。

用主题名称为文件命名。只有当前使用的用户主题来自 `<agent-dir>/themes/<name>.json` 时，Pi 才会热重载它。添加或修改其他来源的主题后，运行 `/reload`。

## 主题文件格式 \{#understand-the-theme-file}

| 属性 | 必填 | 用途 |
|---|---|---|
| `$schema` | 否 | 让编辑器根据 Pi 发布的 JSON Schema 执行校验和自动补全。 |
| `name` | 是 | 在主题选择器和设置中标识主题。名称必须唯一，不能包含 `/`，也不能为 `system`。 |
| `appearance` | 否 | `"dark"` 或 `"light"`：主题适用的背景外观。省略时，Pi 根据主题颜色判断。 |
| `vars` | 否 | 定义可复用的颜色值。变量可以引用其他变量。 |
| `colors` | 是 | 为终端界面的各个角色分配颜色。JSON Schema 标明哪些角色的颜色必填，哪些可选。 |
| `export` | 否 | 覆盖导出的 HTML 中页面和面板的背景色。 |

主题对象只接受文档列出的顶层字段和颜色标识。可复用的自定义颜色应在 `vars` 中定义。Pi 不接受 `colors` 或 `export` 下的自定义键，也不接受额外的顶层元数据。

颜色支持以下六种写法：

| 形式 | 示例 | 含义 |
|---|---|---|
| RGB 十六进制 | `"#0af"` 或 `"#00aaff"` | 以 3 位或 6 位十六进制数字表示 sRGB 颜色。 |
| OKLCH | `"oklch(62% 0.1 200)"` | 感知明度、彩度和色相。 |
| OKHSL | `"okhsl(250 60% 55%)"` | 色相、饱和度和明度。饱和度以 sRGB 色域在该色相和明度下允许的最大值为基准，因此所有值都在色域内，相同饱和度的颜色在观感上同样鲜艳。 |
| 256 色索引 | `39` | `0` 到 `255` 之间的 ANSI 调色板索引，包含两个端点。 |
| 变量引用 | `"primary"` | `vars` 中某一项的值。 |
| 终端默认色 | `""` | 终端的默认前景色或背景色。 |

终端自行渲染默认色。需要具体颜色值时，例如导出 HTML 或扩展进行颜色计算时，Pi 会使用终端报告的默认色。如果终端未报告默认色，Pi 会根据主题外观选用黑色或白色作为估计值。

Pi 会逐级解析变量引用。变量缺失或存在循环引用都会使主题无效。Pi 在终端支持时使用真彩色。它将 OKLCH 颜色映射到 sRGB 色域，并在 256 色终端上使用近似颜色。由于 CSS 不支持 OKHSL，导出 HTML 时，Pi 会将 OKHSL 值转换为十六进制值。如果显示颜色与源值不同，请检查终端的真彩色检测结果和对比度设置。参阅[配置终端](./terminal-setup.md#override-detected-capabilities)。

具体的属性、必填颜色和可用的值类型见[主题 JSON Schema](https://pi.dev/schemas/theme.schema.json)。

Pi 会在启动和执行 `/reload` 时报告无效的主题文件。

## 按界面用途查找颜色 \{#find-the-color-to-change}

主题颜色按界面用途定义，不与单个组件绑定。可按以下分组在 JSON Schema 中查找对应的颜色：

| 区域 | 颜色名称 |
|---|---|
| 常规界面 | `accent`、`border*`、`text`、`muted`、`dim`、`success`、`error`、`warning` |
| 选中项和全屏模式 | `selectedBg`、`searchMatch*`、`scrollbar*` |
| 消息 | `userMessage*`、`customMessage*`、`thinkingText` |
| 工具执行 | `toolPendingBg`、`toolSuccessBg`、`toolErrorBg`、`toolTitle`、`toolOutput` |
| Markdown | `md*` |
| 工具差异输出 | `toolDiff*` |
| 语法高亮 | `syntax*` |
| 编辑器模式 | `thinking*`、`bashMode` |
| 导出 HTML | `export.pageBg`、`export.cardBg`、`export.infoBg` |

文件格式以 JSON Schema 为准。内置主题提供完整的取值，可复制后调整。

以下五种颜色可省略。省略时会继承其他颜色：

| 可选颜色 | 回退颜色 |
|---|---|
| `scrollbarTrack` | `muted` |
| `scrollbarThumb` | `text` |
| `searchMatchBg` | `selectedBg` |
| `searchMatchText` | `text` |
| `thinkingMax` | `thinkingXhigh` |

省略 `export` 颜色时，Pi 根据 `userMessageBg` 生成 HTML 页面和面板的背景色。

## 从项目或包加载主题 \{#load-a-theme-from-a-project-or-package}

将项目主题放在 `.pi/themes/` 中。只有在[信任项目](./security.md#understand-project-trust)后，Pi 才会加载项目主题。

也可以通过 `themes` 设置加载主题文件或目录，或者通过 Pi 包分发主题。参阅[配置](./configuration.md)、[设置](./settings.md#resources)和 [Pi 包](./packages.md)。

加载的每个主题必须有唯一的名称。Pi 会将名称重复报告为资源冲突。
