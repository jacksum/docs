# 设置参考 \{#settings-reference}

本参考列出用户可配置的设置，以及各项设置的类型、默认值和用途。项目设置覆盖智能体目录中的设置，资源列表则会合并。有关文件位置和信任机制，请参阅[配置](./configuration.md)。

在 `settings.json` 中添加 `"$schema": "https://pi.dev/schemas/settings.schema.json"`，即可在编辑器中使用校验和自动补全。

## 模型与思考 \{#model-and-thinking}

<a id="model-cycling"></a>

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `defaultProvider` | string | 自动选择 | 启动时使用的 模型提供方。 |
| `defaultModel` | string | 自动选择 | 启动时使用的模型 ID。 |
| `defaultThinkingLevel` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max"` | `"medium"` | 启动时使用的思考级别。 |
| `modelThinkingLevels` | object | 无 | 为各模型分别指定启动时的思考级别。键必须与 `provider/modelId` 完全匹配。 |
| `thinkingBudgets` | object | 内置预算 | `minimal`、`low`、`medium` 和 `high` 思考级别的 token 预算。 |
| `enabledModels` | `string[]` | 所有可用模型 | 启动时选择模型和循环切换模型所用的匹配模式。格式与 `--models` 相同。 |
| `hideThinkingBlock` | boolean | `false` | 在会话记录中隐藏思考内容块。 |
| `showCacheMissNotices` | boolean | `false` | 在发生影响较大的缓存未命中、缓存预热成功、使用上下文压缩或模型提供方服务恢复时显示提示。 |
| `cacheWarming` | `"off" \| "streaming" \| "idle"` | `"idle"` | 在运行期间让符合条件的模型提供方提示词缓存保持有效。选用 `"idle"` 时，两次运行之间最多维持 30 分钟；`"streaming"` 只在运行期间预热缓存。仅可全局设置。 |

只有当模型声明了缓存有效期，且 Pi 估计预热可节省至少 0.05 美元的缓存未命中费用时，才会预热缓存。刷新缓存的用量计入会话总用量，但不会进入模型上下文。`/session` 显示下一次预热决策；扩展可通过 `cache_warming_decision` 覆盖该决策。参阅[提示词缓存有效期](./models.md#prompt-cache-lifetimes)。

有关模型选择和思考控制，请参阅[选择模型](./models.md)。

## 交互 \{#interaction}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `steeringMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | 队列中引导消息的发送方式。 |
| `followUpMode` | `"all" \| "one-at-a-time"` | `"one-at-a-time"` | 队列中后续消息的发送方式。 |
| `externalEditor` | string | 依次使用 `$VISUAL`、`$EDITOR`、平台默认值 | 按下外部编辑器快捷键时运行的命令。 |
| `doubleEscapeAction` | `"tree" \| "fork" \| "none"` | `"tree"` | 编辑器为空时连按两次 Escape 键执行的操作。 |
| `treeFilterMode` | `"default" \| "no-tools" \| "user-only" \| "labeled-only" \| "all"` | `"default"` | `/tree` 使用的初始筛选条件。 |
| `defaultProjectTrust` | `"ask" \| "always" \| "never"` | `"ask"` | 未另行指定时采用的项目信任策略。**只能在智能体目录的设置中指定。** |

## 工具 \{#tools}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `defaultTools` | `string[]` | `read`、`bash`、`edit`、`write` | 启动时启用的工具。直接列出工具名会替换默认工具；`+name` 添加工具，`-name` 移除工具。空数组会禁用所有内置工具，扩展工具和 SDK 工具不受影响。 |
| `codemode.mode` | `"on"` \| `"only"` | `"on"` | `codemode` 工具启用时呈现工具的方式。`on`：已声明工具的说明末尾会附上如何从脚本调用它的提示，`codemode` 只列出未声明的工具。`only`：`codemode` 列出脚本可调用的所有工具；已启用的内置工具和扩展工具对模型隐藏，模型通过 `codemode` 调用它们。 |
| `codemode.inlineBudget` | number | `3000` | `codemode` 工具的说明中可用于工具声明的估算 token 数（字符数除以 4）。超出预算的工具不列出，可通过 `searchTools()` 查找。设为 `0` 时只列出命名空间。 |

可用的内置工具有 `read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find` 和 `ls`。`defaultTools` 也可指定内置扩展注册为未启用的 `codemode` 和 `tool_search`，以及其他注册为未启用的扩展工具。

如果列表只有 `+name` 和 `-name` 项，Pi 会在继承的工具列表上增删。下面的示例在默认工具之外启用 `codemode`：

```json
{
  "defaultTools": ["+codemode"]
}
```

以下设置用 `powershell` 替换 `bash`，并启用 `grep`：`["-bash", "+powershell", "+grep"]`。项目设置在用户设置的基础上生效：如果项目列表只有 `+name` 和 `-name` 项，Pi 会在用户选择的工具上增删；只要项目列表含有直接列出的工具名，就会替换用户的选择。在同一个列表中，直接列出的名称先确定工具范围，再按顺序应用 `+name` 和 `-name`。

`/reload` 会启用新加入 `defaultTools` 的工具。它不会禁用已从设置中移除的工具，也不会重新启用仍在设置中但被你关闭的工具。`--tools` 在直接列出工具名时会覆盖 `defaultTools`；`--no-tools` 和 `--no-builtin-tools` 也会覆盖该设置，重新加载时同样如此。

命令行的工具选项仅在当前这次调用中覆盖该设置。若 `--tools` 只有 `+name` 和 `-name` 项，则在解析出的 `defaultTools` 工具列表上增删，例如 `pi --tools +codemode`。执行 `/reload` 时，这些项也会应用于重新加载的设置，因此通过 `-name` 移除的工具仍会保持移除。参阅[命令行](./cli.md#tools)。

## 会话与上下文 \{#sessions-and-context}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `sessionDir` | string | 智能体会话目录 | 会话存储目录。相对路径以当前工作目录为基准解析。`PI_CODING_AGENT_SESSION_DIR` 和 `--session-dir` 会覆盖此设置。 |
| `sessionShareDestination` | `"auto" \| "gist" \| "radius"` | `"auto"` | `/share` 使用的分享目标。`auto` 在通过身份验证时使用 Radius，否则创建 GitHub gist。`gist` 始终使用 gist。`radius` 要求通过 Radius 身份验证，不会回退到 gist。 |

### 上下文压缩 \{#compaction}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `compaction.enabled` | boolean | `true` | 启用自动上下文压缩。 |
| `compaction.reserveTokens` | number | `16384` | 上下文的剩余 token 数低于此值时开始自动压缩。 |
| `compaction.keepRecentTokens` | number | `20000` | 保留的最新 token 数。这部分内容不做摘要。 |
| `compaction.modelOverrides` | object | 无 | 为各模型分别指定 token 设置。键必须与 `provider/modelId` 完全匹配。 |

<a id="per-model-compaction-overrides"></a>

上下文压缩的 token 数必须是非负安全整数。每个值单独解析，按以下优先级取值：匹配模型的覆盖设置、常规压缩设置、内置默认值。Pi 先合并项目和用户的设置对象，再按模型查找。

有关触发条件、摘要生成和校验行为，请参阅[上下文压缩参考](./compaction.md)。

### 分支摘要 \{#branch-summaries}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `branchSummary.reserveTokens` | number | `16384` | 为生成分支历史摘要预留的 token 数。 |
| `branchSummary.skipPrompt` | boolean | `false` | 跳过是否生成分支摘要的询问，默认不生成摘要。 |

## 终端与显示 \{#terminal-and-display}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `theme` | string | `"system"` | 内置或自定义主题的名称。`system` 从终端主题获取配色。 |
| `quietStartup` | boolean \| `"header"` | `false` | `true` 隐藏启动标头和已加载的资源列表。`"header"` 保留标头（版本和快捷键提示），但隐藏模型范围提示行和已加载的资源列表。 |
| `tuiMode` | `"regular" \| "fullscreen"` | `"fullscreen"` | 交互式终端界面的模式。 |
| `fullscreenExitOutput` | `"transcript" \| "resume-hint"` | `"transcript"` | 退出全屏模式时打印的内容。 |
| `fullscreenScrollbar` | `"auto" \| "always" \| "hidden"` | `"auto"` | 全屏模式下会话记录滚动条的显示方式。 |
| `fullscreenCopyOnSelect` | boolean | `true` | 在全屏模式下自动复制选中的文本。 |
| `fullscreenWheelScrollLines` | `"auto"` \| number | `"auto"` | 全屏模式下每次鼠标滚轮事件滚动的行数，范围为 1 到 100。选择 `"auto"` 时，如果使用本地 macOS 终端，每次事件滚动一行，因为终端已对滚轮和触控板输入做了加速。在其他环境中（包括通过 SSH 连接时），快速转动滚轮会加速滚动，每次事件最多滚动 6 行。按住 Alt 滚动时，距离为平时的 5 倍。 |
| `editorPaddingX` | number | `0` | 编辑器的水平内边距，范围为 0 到 3 个字符单元格。 |
| `outputPad` | `0 \| 1` | `1` | 会话记录中消息、工具输出、`!` 命令输出和摘要块的水平内边距。 |
| `autocompleteMaxVisible` | number | `5` | 可见的自动补全条目数，范围为 3 到 20。 |
| `showHardwareCursor` | boolean | `false` | 使用终端光标，取代 Pi 自行绘制的光标。Pi 仍会为输入法设置光标位置。 |
| `terminal.showImages` | boolean | `true` | 在终端支持时显示内嵌图像。 |
| `terminal.imageWidthCells` | number | `60` | 内嵌图像的首选宽度，以终端字符单元格为单位。 |
| `terminal.clearOnShrink` | boolean | `false` | 渲染内容缩减时清除空行。未设置此项时，可通过 `PI_CLEAR_ON_SHRINK=1` 启用。 |
| `terminal.showTerminalProgress` | boolean | `false` | 在终端标签页中显示 OSC 9;4 进度。 |
| `terminal.hyperlinks` | `boolean \| "auto"` | `"auto"` | 覆盖 OSC 8 超链接检测结果。 |
| `terminal.images` | `"kitty" \| "iterm2" \| "auto" \| false` | `"auto"` | 覆盖内嵌图像协议的检测结果。 |
| `terminal.trueColor` | `boolean \| "auto"` | `"auto"` | 覆盖真彩色检测结果。 |
| `images.autoResize` | boolean | `true` | 将图像缩放至不超过 2000 × 2000 像素，再发送给模型。 |
| `images.blockImages` | boolean | `false` | 阻止向模型发送图像。 |
| `markdown.codeBlockIndent` | string | `"  "` | 渲染代码块时用于缩进的前缀。 |
| `markdown.mermaid` | `"off" \| "final" \| "streaming"` | `"streaming"` | Mermaid 渲染模式。 |

有关格式和平台差异，请参阅[主题](./themes.md)和[终端设置](./terminal-setup.md)。

## 网络与重试 \{#network-and-retries}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `transport` | `"auto" \| "sse" \| "websocket" \| "websocket-cached"` | `"auto"` | 模型提供方支持多种传输方式时，优先使用的方式。 |
| `httpProxy` | string | 无 | Pi 为其管理的 HTTP 客户端设置 `HTTP_PROXY` 和 `HTTPS_PROXY` 时使用的代理 URL。**只能在智能体目录的设置中指定。** |
| `httpIdleTimeoutMs` | number \| `"disabled"` | `300000` | HTTP 头部和正文的空闲超时时间，单位为毫秒。设为 `0` 或 `"disabled"` 可禁用超时。 |
| `websocketConnectTimeoutMs` | number \| `"disabled"` | `15000` | WebSocket 建立连接的超时时间，单位为毫秒。设为 `0` 或 `"disabled"` 可禁用超时。 |
| `retry.enabled` | boolean | `true` | 发生暂时性故障时，启用智能体级别的自动重试。 |
| `retry.maxRetries` | number | `3` | 智能体级别的最大重试次数。 |
| `retry.baseDelayMs` | number | `2000` | 指数退避的初始延迟，单位为毫秒。 |
| `retry.maxAgentDelayMs` | number | `60000` | 智能体级别的最大重试延迟，单位为毫秒。 |
| `retry.provider.timeoutMs` | number | `httpIdleTimeoutMs` | 模型提供方请求超时时间，单位为毫秒。 |
| `retry.provider.maxRetries` | number | `0` | 模型提供方级别的重试次数。 |
| `retry.provider.maxRetryDelayMs` | number | `60000` | 服务器要求的重试延迟上限，单位为毫秒。设为 `0` 可取消此上限。 |

除非需要模型提供方级别的重试，否则请将 `retry.provider.maxRetries` 保持为 `0`。模型提供方级别的重试可能延迟 Pi 自行处理配额和用量限制错误。

## Shell \{#shell}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `shellPath` | string | 平台默认值 | 自定义 shell 可执行文件的路径，支持以 `~` 开头。 |
| `shellCommandPrefix` | string | 无 | 添加到每条 shell 命令开头的前缀。 |
| `npmCommand` | `string[]` | `npm` | 查找和安装 npm 包所用的命令及参数。 |
| `selfUpdateCommand` | `string[]` | 无 | `pi update` 用来更新 Pi 本身的命令及参数，支持 `{packageName}`、`{version}` 和 `{installSpec}` 占位符。`PI_SELF_UPDATE_COMMAND` 优先于此设置。**只能在智能体目录的设置中指定。** 参阅[自定义更新命令](./cli.md#custom-update-command)。 |

有关 shell 配置，请参阅 [Shell 别名](./shell-aliases.md)；有关包管理器的行为，请参阅 [Pi 软件包](./packages.md)。

## 资源 \{#resources}

用户设置中的资源路径以智能体目录为基准解析，项目设置中的资源路径则以项目的 `.pi` 目录为基准。两者都支持绝对路径和 `~`。

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `packages` | array | `[]` | Pi 软件包的来源，可以是 npm、git 或本地路径。参阅 [Pi 软件包](./packages.md)。 |
| `extensions` | `string[]` | `[]` | 扩展文件或目录。 |
| `skills` | `string[]` | `[]` | 技能文件或目录。 |
| `prompts` | `string[]` | `[]` | 提示词模板文件或目录。 |
| `themes` | `string[]` | `[]` | 主题文件或目录。 |
| `enableSkillCommands` | boolean | `true` | 将技能注册为 `/skill:name` 命令。 |

资源数组支持用 `!pattern` 按 glob 模式排除，用 `+path` 精确包含指定路径，用 `-path` 精确排除指定路径。Pi 会加载用户设置和项目设置中列出的资源。

内置扩展在 `extensions` 中的名称为 `builtin:mcp`、`builtin:llama.cpp`、`builtin:codemode` 和 `builtin:tool-search`。这些扩展默认加载；例如，`-builtin:mcp` 可禁用其中对应的扩展。项目设置中的 `+builtin:<name>` 或 `-builtin:<name>` 项会覆盖用户设置。`pi config` 在 Built-in 分类中列出这些扩展。`--no-extensions` 也会禁用它们，`-e builtin:<name>` 则可显式加载其中一个。

## 更新、遥测和警告 \{#updates-telemetry-and-warnings}

| 设置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `collapseChangelog` | boolean | `false` | 更新后显示简要的更新日志。扩展包的更新日志也会缩减为每个包一行。 |
| `enableInstallTelemetry` | boolean | `true` | 启用匿名安装和更新报告，以及部分模型提供方的归因请求头。不影响更新检查。 |
| `enableAnalytics` | boolean | `false` | 选择共享分析数据。目前仅用于实验性的首次运行设置。 |
| `warnings.anthropicExtraUsage` | boolean | `true` | 当通过 Anthropic 订阅进行身份验证可能产生付费的额外用量时发出警告。 |
