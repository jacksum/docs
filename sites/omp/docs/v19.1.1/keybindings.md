---
title: "快捷键"
description: "Oh My Pi v19.1.1 仓库文档：快捷键。"
---

# 快捷键 \{#keybindings}

运行 `/hotkeys`（在 `omp` 会话中）可查看内置快捷键参考。应用操作条目反映从磁盘加载的重新绑定；导航和编辑示例使用固定的按键组合。此参考不列出扩展注册的快捷键。

基础编辑器、输入和选择器操作分别使用 `tui.editor.*`、`tui.input.*` 和 `tui.select.*`；应用操作使用 `app.*`。定义位于 `packages/tui/src/keybindings.ts` 和 `packages/tui/src/app-keybindings.ts`。

## 自定义快捷键 \{#customize-keybindings}

用户自定义的快捷键保存在 `~/.omp/agent/keybindings.yml`。该文件是一个 YAML 映射，键是快捷键操作 ID，值是单个按键组合字符串或此类字符串的数组。系统不会从 `~/.omp/agent/config.yml` 读取快捷键，也没有嵌套的 `keybindings` 对象。

使用命名配置档案时，系统先加载默认配置档案的代理目录中的绑定，再用当前配置档案的 `keybindings.yml` 按操作逐项覆盖。当前配置档案启动时，只读取继承的文件，不修改它。

```yaml
app.model.cycleForward: Ctrl+P
app.model.selectTemporary: Alt+P
app.plan.toggle: Alt+Shift+P
```

按键组合名称不区分大小写，写法与界面中显示的一致，例如 `Ctrl+P`、`Alt+Shift+P`、`Shift+Enter` 和 `Ctrl+Backspace`。

要禁用某项操作，将其设为空数组：

```yaml
app.history.search: []
```

## 常用操作 ID \{#common-action-ids}

| 操作 ID | 默认绑定 | 含义 |
| --- | --- | --- |
| `app.model.cycleForward` | `Ctrl+P` | 向前循环切换角色模型 |
| `app.model.cycleBackward` | `Shift+Ctrl+P` | 向后循环切换角色模型 |
| `app.model.selectTemporary` | `Alt+P` | 为当前会话临时选择模型 |
| `app.model.select` | `Alt+M` | 打开模型选择器并设置角色 |
| `app.plan.toggle` | `Alt+Shift+P` | 切换计划模式 |
| `app.history.search` | `Ctrl+R` | 搜索提示词历史 |
| `app.tools.expand` | `Ctrl+O` | 展开或折叠工具输出 |
| `app.tools.toggleVisibility` | `Ctrl+Shift+O` | 显示或隐藏工具活动 |
| `app.links.hint` | `Alt+O` | 为屏幕上的每个[扩展链接](./extensions.md#extension-link-schemes)加上标签；输入标签即可选中对应链接，按 `Esc` 取消；再次按此快捷键或按 `Page Up` 可浏览所有链接 |
| `app.ask.hide` | `Alt+H` | 将待回答的 `ask` 问题折叠为一行（对应 Tern 的「隐藏」按钮）；再次按此键、按 `Enter` 或点击「显示」可恢复 |
| `app.ask.note` | `N`, `Alt+N` | 为高亮的 `ask` 选项添加或编辑备注；下拉列表使用第一个不会输入文字的绑定，因为字母键会跳转到对应选项 |
| `app.approval.approve` | `Ctrl+Enter`, `Ctrl+Q` | 直接批准待审批的工具调用（对应 Tern 的「批准」按钮）；`Esc` 拒绝调用，`Enter` 确认用方向键高亮的「批准」或「拒绝」选项 |
| `app.thinking.toggle` | `Ctrl+T` | 显示或隐藏思考块 |
| `app.thinking.cycle` | `Shift+Tab` | 循环切换思考级别 |
| `app.editor.external` | `Ctrl+G` | 在 `$VISUAL` / `$EDITOR` 中编辑草稿 |
| `app.local.open` | `Alt+G` | 选择会话中的一个 `local://` 文件，并在 `$VISUAL` / `$EDITOR` 中编辑（与 `/local` 相同） |
| `app.message.followUp` | `Ctrl+Q`, `Ctrl+Enter` | 将后续消息加入队列 |
| `app.message.dequeue` | `Alt+Up`, `Shift+Up` | 将排队的消息移出队列并放回编辑器 |
| `app.btw.inject` | `Alt+I` | 将 `/btw` 回答的引导提示词发送到主会话（需要 `btw.inject`） |
| `app.retry` | `F5`, `Alt+R` | 重试最近一次失败的助手轮次 |
| `app.display.reset` | `Alt+L` | 重置终端显示 |
| `app.clipboard.copyLine` | `Alt+Shift+L` | 复制当前行 |
| `app.clipboard.copyPrompt` | `Alt+Shift+C` | 复制整条提示词 |
| `app.clipboard.pasteTextRaw` | `Ctrl+Shift+V`, `Alt+Shift+V` | 粘贴剪贴板文本，不折叠内容 |
| `app.clipboard.pasteImage` | Linux: `Ctrl+V`; macOS: `Ctrl+V`, `Cmd+V`; Windows: `Ctrl+V`, `Alt+V` | 从剪贴板粘贴（优先粘贴图片，没有图片时粘贴文本） |
| `app.stt.pushToTalk` | `Space` | 按住录音，松开后转写。重新绑定此操作，或将其设为 `[]`，可禁用按键说话而不关闭语音转文本。 |
| `app.stt.toggle` | 未绑定 | 每按一次开始或停止语音转文本录音；独立于按键说话。 |
| `app.live.toggle` | `Ctrl+L` | 开始或停止实时语音模式（与 `/live` 相同） |
| `app.agents.hub` | `Alt+A` | [打开代理中心](./agent-hub.md) |
| `app.session.delete` | `Backspace`, `Delete` | 在恢复会话选择器中请求删除选中的会话；若按键也用于向后删除，则会改为编辑已输入的搜索词 |
| `app.session.pin` | `Alt+K` | 在恢复会话选择器中置顶选中的会话；置顶的会话始终排在最上方，搜索结果中也一样 |
| `app.session.unpin` | `Alt+Shift+K` | 在恢复会话选择器中取消置顶选中的会话 |
| `app.tree.previousBranch` | 未绑定 | 跳转到 `/tree` 中上一个可见分支（[详情](./tree.md)） |
| `app.tree.nextBranch` | 未绑定 | 跳转到 `/tree` 中下一个可见分支（[详情](./tree.md)） |

要禁用按键说话，同时保留用独立快捷键切换语音转文本的功能：

```yaml
app.stt.pushToTalk: []
app.stt.toggle: Ctrl+Shift+S
```

启用语音转文本时，分配给 `app.stt.pushToTalk` 的非打印键和按键组合由该操作独占：短按会被拦截，不会执行通常的编辑或应用操作。短按单个可打印键仍会照常输入。初次按键触发的文本辅助转换会保留；识别出长按后，只会移除未经转换而原样重复输入的文本。配置中的每个备选按键组合都独立处理，交替使用不会合并为一次长按。检测长按要求终端能传递按键自动重复事件。

### 在 Tern 中点击按钮听写 \{#click-to-dictate-in-tern}

开启 `stt.enabled` 后，原生输入框会在「发送」按钮旁显示一个麦克风按钮。点击即可开始录音，无需按住按键。语音模型加载期间，按钮显示 **正在启动…**；再次点击可取消。按钮变为 **正在录音 · 停止** 后，点击可停止录音，然后等待 **正在转写…** 结束。

无论 `stt.submitTrigger` 如何设置，通过此按钮启动的听写结果都会留在草稿中。检查或编辑文本后，按 Enter 或点击「发送」。正在录音或将语音转写到草稿时，按 Enter 或点击「发送」都不会执行任何操作。

如需实时转写英语，请在 `omp setup speech` 中选择 **Nemotron 0.6B（流式实时转写，英语）**，或将 `modelRoles.dictation` 设为 `local/nemotron-streaming-en-0.6b`。说话时，转写文字会陆续出现在草稿中。首次录音会等模型加载完毕才打开麦克风；按钮显示 **正在录音 · 停止** 时再开始说话。后续录音会复用已加载的模型。下载和语言详情见[本地语音模型](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/local-models.md#speech-to-text)。

## 找回已清空的提示词 \{#recover-a-cleared-prompt}

按 `Ctrl+C` 清空输入框中尚未发送的草稿，再按 `Up` 找回。更早的草稿和已提交的提示词共用现有的上、下方向键导航。找回的草稿仍可编辑，只有在你提交后才会发送。

已清空的草稿保留空白字符、已折叠的粘贴内容和图片附件，存放在当前编辑器有限的历史记录中（100 条）。它们不会写入持久化的提示词历史，也不会出现在 `Ctrl+R` 的搜索结果中。关闭进程会丢弃这些已取消的草稿；输入框中此时的文本仍适用独立的退出时保存机制。这不是每个代理各自的暂存区：历史记录随编辑器保留，在代理中心切换焦点时也一样。

现有的连按两次 `Ctrl+C` 退出行为不变。清空本来就是空的输入框不会新增历史条目。

恢复功能默认开启。可在 `/settings` 的「交互 > 输入」下关闭 **找回已清空的草稿**，或设置 `composer.recallClearedDrafts: false`。设置在下次清空时生效，无需重启；之前保留的草稿仍在历史记录中，直到被淘汰或编辑器关闭。

在 Windows Terminal 中，`Ctrl+V` 可能先被终端的粘贴命令处理，导致 `omp` 收不到它；如果从剪贴板粘贴图片时看起来没有反应，请改用 `Alt+V`。剪贴板没有图片时，`app.clipboard.pasteImage` 会改为粘贴剪贴板文本。因此，只传递这一按键组合的宿主也能处理这两类内容，例如配置为转发 `Ctrl+V` 的 VS Code 集成终端，以及通过 `Win+V` 使用的 Windows 剪贴板历史。Windows Terminal 也会拦截 `Ctrl+Enter`，因此 `app.message.followUp` 还绑定了 `Ctrl+Q`，与 GitHub Copilot CLI 使用的组合相同。该组合也用于提交代理仪表板中的新代理描述和钩子编辑器的输入。如果现有的 `keybindings.yml` 已将 `Ctrl+Q` 分配给另一项操作，则用户的绑定优先；后续消息操作仍用 `Ctrl+Enter`，除非显式绑定 `app.message.followUp`。

实现了 OSC 5522 增强粘贴的终端可以直接将剪贴板 MIME 数据发送给 `omp`；粘贴的图片会作为 `[Image #N]` 附上，text/plain 粘贴事件则保留普通粘贴行为。OSC 5522 不可用时，括号粘贴仍能处理文本；若粘贴内容只是一个图片文件路径，且 `omp` 所在宿主能读取该文件，则将其作为图片加载。

加载 `keybindings.yml` 时，旧的无命名空间操作名称会被迁移，但新文档和新配置应使用前文所列的带命名空间的操作 ID。系统仍接受现有的 `keybindings.json` 文件，并将其迁移到 `keybindings.yml`；系统也接受 `keybindings.yaml`。

## Vim 编辑模式 \{#vim-editing-mode}

默认关闭。可在 `/settings` 的「交互 → 输入」下打开 **Vim 编辑模式**，也可直接设置：

```yaml
tui.vimMode: true
```

提示词输入框初始处于插入模式。`Escape` 切换到普通模式；输入框边框会变色以指示模式（bash/python 模式的颜色优先）。在插入模式下，软件光标为当前字符加下划线，位于行末时则显示为竖条；在普通模式下，软件光标显示为方块。可视模式会高亮所选内容。终端光标的形状通过 DECSCUSR 设置：插入模式下为竖条，普通和可视模式下为方块，退出时恢复原状。这只实现了 Vim 中一部分实用的功能。

状态行还显示模式、尚未输入完整的命令，以及跨行可视选区的大小。**Vim 模式指示器**（`tui.vimModeDisplay`）支持 `text`（默认）、`icon` 和 `none`（隐藏整个 Vim 状态区段）。

| 模式 | 进入方式 | 退出方式 |
| --- | --- | --- |
| 插入 | `i` `a` `I` `A` `o` `O` | `Escape` |
| 普通 | 在插入模式中按 `Escape` | 任一进入插入模式的按键 |
| 可视 | `v` | `Escape`，或操作符（`y` `d` `c`） |
| 行可视 | `V` | `Escape`，或操作符（`y` `d` `c`） |

### 普通模式 \{#normal-mode}

| 按键 | 含义 |
| --- | --- |
| `h` `j` `k` `l` | 按字符和行移动（也可用方向键） |
| `0` `^` `$` | 行首 / 第一个非空白字符 / 行尾 |
| `w` `b` `e` | 下一个单词、上一个单词、单词末尾 |
| `f` `F` `t` `T` + 字符 | 行内查找并移到该字符处或紧邻该字符的位置（`;` 重复，`,` 反向） |
| `gg` `G` | 第一行、最后一行（`5gg` 和 `5G` 跳到第 5 行） |
| `1` 至 `9` 前缀 | 重复移动命令或操作符，例如 `3w`、`5j`、`2dd` |
| `i` `a` `I` `A` | 在光标前 / 光标后、行首 / 行尾进入插入模式 |
| `o` `O` | 在下方 / 上方新开一行并进入插入模式 |
| `x` `D` `C` | 删除字符、删除至行尾（`2D` 处理 `count` 行）、修改至行尾（`2C` 同理） |
| `r` + 字符 | 替换光标所在的字符（`3rx` 替换三个字符） |
| `R` | 替换模式：输入的字符会覆盖原有字符，直到按 Escape |
| `%` | 跳转到光标处或之后的配对符号 `()` `[]` `{}` `"` `'` 的另一端。引号只在本行内匹配，括号可跨行。带计数时，`50%` 可跳到缓冲区中相应的百分比位置。 |
| `{` `}` | 上一段 / 下一段（以空行为界） |
| `J` | 合并行，移除后一行的缩进（合并空行时不加空格） |
| `>>` `<<` | 增加 / 减少两个空格的缩进（`3>>` 调整三行，`>}` 按移动命令的范围调整）。空行不变。 |
| `d` `y` `c` + 移动命令 | 对移动命令涵盖的范围执行操作，例如 `dw`、`d$`、`yb`、`cw` |
| `dd` `yy` `cc` | 按行删除 / 复制 / 修改 |
| `d` `y` `c` + 文本对象 | 对文本对象执行操作，例如 `diw`、`ca(`、`ci"`、`dap` |
| `p` `P` | 将最近复制或删除的内容放到光标后 / 前 |
| `u` | 撤销（整次插入操作或整次 `.` 操作可一步撤销） |
| `.` | 重复上次修改，包括该修改所开启的插入操作中输入的文本；提供计数时会替换原计数（`3.`） |

### 文本对象 \{#text-objects}

文本对象可跟在操作符后（`diw`），也可用于扩展可视选区（`viw`）。`i` 选取内部内容，`a` 还选取周边内容；可以指定计数，例如 `d2aw`。

| 对象 | 涵盖范围 |
| --- | --- |
| `iw` `aw` | 单词；`aw` 还会选取相邻的空白字符 |
| `iW` `aW` | 以空白字符分隔的 WORD |
| `i"` `i'` `` i` `` | 当前行引号内的内容（`a"` 也会选取引号） |
| `i(` `i[` `i{` `i<` | 最内层匹配符号之间的内容，支持嵌套和跨行 |
| `a(` `a[` `a{` `a<` | 与上一行相同，但包含这对定界符（`b` 和 `B` 分别是 `(` 和 `{` 的别名） |
| `ip` `ap` | 段落：一连串非空行或空行，按行选取 |

### 可视模式 \{#visual-mode}

`v` 开始按字符选择，`V` 开始按行选择；移动命令会移动选区活动的一端。`y` 将选中内容复制到系统剪贴板（也复制到内部寄存器，因此 `p` 可将其放回），`d` 删除选中内容，`c` 删除选中内容并进入插入模式。`x` 与 `d` 一样执行删除，`s` 与 `c` 一样执行修改。`o` 跳到选区的另一端。`Escape` 取消选区。

如果选区边界落在 `[Image #1, 800x600]` 或 `[Paste #2, +30 lines]` 等附件占位符内，整个占位符都会被选中，因此删除操作不会留下损坏的片段。

### Escape 键 \{#escape}

`Escape` 也用于触发应用级中断，因此只有在下列情况下才由 Vim 模式处理：

- **插入模式** → 切换到普通模式（如果自动补全弹窗已打开，首次按 Escape 会关闭弹窗）。
- **可视模式**，或计数或操作符还未输入完整 → 取消当前操作，回到没有待处理命令的普通模式。
- **替换模式**（`R`） → 切换到普通模式，光标退回到最后一个被覆盖的字符。
- **普通模式且无待处理命令** → 交由应用处理：关闭自动补全弹窗、中止当前任务，或在编辑器为空时执行配置的连按两次 Escape 操作。主会话空闲时，草稿会保留；bash/python 模式和聚焦于代理的视图有各自的 Escape 行为。

Vim 按键不会覆盖应用快捷键：含 `Ctrl` 的按键组合、`Enter` 和 `Tab` 在所有模式下都保留原有行为，所以在普通模式下按 `Enter` 仍会提交。这类按键会先取消未输完的命令（`d`、`r`、`f`），因此这些命令不会带到下一条提示词。只有在插入模式下，`Up`/`Down` 才用于浏览提示词历史；在普通模式下，它们对应 `k` 和 `j`，所以在多行草稿中移动时不会载入以前的提示词。
