---
title: "快捷键"
description: "Oh My Pi 官方仓库文档：快捷键。"
---

# 快捷键 \{#keybindings}

在 `omp` 会话内运行 `/hotkeys` 可查看内置快捷键参考。应用操作行反映从磁盘加载的重映射；导航和编辑示例使用固定组合键。这里并非扩展注册快捷键的完整清单。

基础编辑器、输入和选择器操作使用 `tui.editor.*`、`tui.input.*` 和 `tui.select.*`；应用操作使用 `app.*`。定义位于 `packages/coding-agent/src/config/keybindings/tui-keybindings.ts` 和 `packages/coding-agent/src/config/keybindings/app-keybindings.ts`；加载 `keybindings.yml` 并匹配按键的键位映射位于 `packages/coding-agent/src/config/keybindings/keybindings.ts`。

`tui.select.*` 操作（`up`、`down`、`pageUp`、`pageDown`、`confirm`、`cancel`）控制所有列表：选择器、菜单、设置页面、对话框和设置向导。`tui.editor.*` 操作和 `tui.input.newLine` 控制所有文本字段，包括提示输入框；`tui.input.submit` 用于提交单一用途输入（重命名、标签、表单字段）。列表中的 Home/End、Space、Tab 和 ←/→，以及字段中用于换行的 Alt+Enter，均保持固定。按键提示和按钮工具提示会显示你绑定的按键。

## 自定义快捷键 \{#customize-keybindings}

用户重映射保存在 `~/.omp/agent/keybindings.yml` 中。该文件是 YAML 映射，键为快捷键操作 ID，值为一个组合键字符串或组合键字符串数组。它不从 `~/.omp/agent/config.yml` 读取，也没有嵌套的 `keybindings` 对象。

使用命名配置档案时，先加载默认配置档案的智能体目录中的绑定，再由当前配置档案的 `keybindings.yml` 逐项覆盖操作。在该配置档案启动期间，继承的文件为只读。

```yaml
app.model.cycleForward: Ctrl+P
app.model.selectTemporary: Alt+P
app.plan.toggle: Alt+Shift+P
```

组合键名称不区分大小写，采用与界面相同的记法，例如 `Ctrl+P`、`Alt+Shift+P`、`Shift+Enter` 和 `Ctrl+Backspace`。修饰键顺序不影响含义（`Shift+Ctrl+P` 即 `Ctrl+Shift+P`），`Esc`/`Return` 表示 `Escape`/`Enter`，用 Shift 输入的符号直接写符号本身：`?` 与 `Shift+?` 是同一个键。

将某项操作设为空数组即可禁用：

```yaml
app.history.search: []
```

## 常用操作 ID \{#common-action-ids}

| 操作 ID | 默认值 | 含义 |
| --- | --- | --- |
| `app.model.cycleForward` | `Ctrl+P` | 向前循环切换角色模型 |
| `app.model.cycleBackward` | `Shift+Ctrl+P` | 向后循环切换角色模型 |
| `app.model.selectTemporary` | `Alt+P` | 为当前会话临时选择模型 |
| `app.model.select` | `Alt+M` | 打开模型选择器并设置角色 |
| `app.plan.toggle` | `Alt+Shift+P` | 切换计划模式 |
| `app.history.search` | `Ctrl+R` | 搜索提示历史 |
| `app.tools.expand` | `Ctrl+O` | 切换工具输出展开状态 |
| `app.tools.toggleVisibility` | `Ctrl+Shift+O` | 循环切换工具活动显示：详细、简洁、隐藏（`display.toolActivity`） |
| `app.links.hint` | `Alt+O` | 给屏幕上的每个[扩展链接](./extensions.md#extension-link-schemes)加标签；输入标签进行选择，`Esc` 取消；再次按下或按 `Page Up` 可浏览全部链接 |
| `app.ask.hide` | `Alt+H` | 将待回答的 `ask` 问题隐藏为一行（Tern 中的“隐藏”按钮）；再次按同一个键、按 `Enter` 或选择“显示”可将其恢复 |
| `app.ask.note` | `N`, `Alt+N` | 为高亮的 `ask` 选项添加或编辑备注；下拉列表使用第一个不会输入文本的按键，因为字母用于跳转到选项 |
| `app.approval.approve` | `Ctrl+Enter`, `Ctrl+Q` | 直接批准待处理的工具调用（Tern 中的“批准”按钮）；`Esc` 拒绝，`Enter` 则执行用方向键高亮的“批准/拒绝”选项 |
| `app.thinking.toggle` | `Ctrl+T` | 切换思考块可见性 |
| `app.thinking.cycle` | `Shift+Tab` | 循环切换思考级别 |
| `app.editor.external` | `Ctrl+G` | 在 `$VISUAL` / `$EDITOR` 中编辑草稿 |
| `app.local.open` | `Alt+G` | 选择一个会话 `local://` 文件，并在 `$VISUAL` / `$EDITOR` 中编辑它（与 `/local` 相同） |
| `app.message.followUp` | `Ctrl+Q`, `Ctrl+Enter` | 将后续消息加入队列 |
| `app.message.dequeue` | `Alt+Up`, `Shift+Up` | 将队列中的消息移回编辑器 |
| `app.btw.inject` | `Alt+I` | 将 `/btw` 回答的引导提示发送到主会话（需要 `btw.inject`） |
| `app.retry` | `F5`, `Alt+R` | 重试上一次失败的助手轮次 |
| `app.display.reset` | `Alt+L` | 重置终端显示 |
| `app.clipboard.copyLine` | `Alt+Shift+L` | 复制当前行 |
| `app.clipboard.copyPrompt` | `Alt+Shift+C` | 复制整个提示 |
| `app.transcript.pageUp` | `PageUp` | 将全屏会话记录向上滚动一页（`tui.screen: fullscreen`；内联模式下该按键传给编辑器） |
| `app.transcript.pageDown` | `PageDown` | 将全屏会话记录向下滚动一页；到末尾时重新跟随新输出 |
| `app.transcript.top` | `Ctrl+Home` | 将全屏会话记录滚动到开头 |
| `app.transcript.bottom` | `Ctrl+End` | 将全屏会话记录滚动到末尾，并跟随新输出 |
| `app.transcript.lineUp` / `lineDown` | `Ctrl+Shift+Up` / `Ctrl+Shift+Down`, `Ctrl+Up` / `Ctrl+Down` | 将全屏会话记录滚动一行，类似终端自身的回滚按键（后者无法传入备用屏幕）。内联模式下，这些按键传给编辑器。 |
| `app.transcript.halfPageUp` / `halfPageDown` | 未绑定 | 滚动半个全屏会话记录窗口。 |
| `app.transcript.previousPrompt` / `nextPrompt` | `Alt+PageUp` / `Alt+PageDown` | 转到上一个或下一个用户提示。 |
| `app.transcript.search` | `Alt+/` | 查找文本而不替换草稿。Enter / Shift+Enter 逐项浏览结果；Escape 取消并返回原位置；Ctrl+Enter 在匹配位置关闭搜索。 |
| `app.transcript.selectLeft` / `selectRight` / `selectUp` / `selectDown` / `selectLineStart` / `selectLineEnd` / `clearSelection` | 未绑定 | 无需鼠标即可调整或清除当前会话记录选区。请显式绑定这些操作，避免占用输入区的选区按键和出队按键。 |
| `app.transcript.copySelection` | `Alt+C`, `Ctrl+Shift+C`, `Super+C` | 复制选中的会话记录文本，即使自动复制已禁用也可使用。 |
| `app.clipboard.pasteTextRaw` | `Ctrl+Shift+V`, `Alt+Shift+V` | 粘贴剪贴板文本，不折叠内容 |
| `app.clipboard.pasteImage` | Linux：`Ctrl+V`；macOS：`Ctrl+V`, `Cmd+V`；Windows：`Ctrl+V`, `Alt+V` | 从剪贴板粘贴（优先图像，回退为文本） |
| `app.stt.pushToTalk` | `Space` | 按住录音，松开转写。重映射此操作，或将其设为 `[]`，可在不禁用语音转文本的情况下禁用按住说话。 |
| `app.stt.toggle` | 未绑定 | 每次按下时开始或停止语音转文本录音；独立于按住说话。 |
| `app.live.toggle` | `Ctrl+L` | 开始或停止实时语音模式（与 `/live` 相同） |
| `app.agents.hub` | `Alt+A` | [打开智能体中心](./agent-hub.md) |
| `app.session.delete` | `Backspace`, `Delete` | 在恢复选择器中请求删除选中的会话；若该按键也用于向后删除，则在已输入搜索查询时改为编辑查询 |
| `app.session.pin` | `Alt+K` | 在恢复选择器中置顶选中的会话；置顶会话始终位于顶部，搜索结果中也是如此 |
| `app.session.unpin` | `Alt+Shift+K` | 在恢复选择器中取消置顶选中的会话 |
| `app.tree.previousBranch` | 未绑定 | 跳到 `/tree` 中上一个可见分支（[详情](./tree.md)） |
| `app.tree.nextBranch` | 未绑定 | 跳到 `/tree` 中下一个可见分支（[详情](./tree.md)） |

若要禁用按住说话，同时通过独立的切换绑定保留语音转文本：

```yaml
app.stt.pushToTalk: []
app.stt.toggle: Ctrl+Shift+S
```

语音转文本启用时，分配给 `app.stt.pushToTalk` 的不可打印按键和组合键会被保留：轻按会被吞掉，而不是执行其正常的编辑或应用操作。普通可打印按键轻按时仍正常输入。初始轻按产生的文本辅助转换会保留；只有在识别出长按时，才会移除未经改变的字面重复文本。每个配置的备选按键相互独立；在备选按键之间交替按下不会合并成一次长按。长按检测要求终端能够传递按键自动重复事件。

### 在 Tern 中点击听写 \{#click-to-dictate-in-tern}

启用 `stt.enabled` 后，原生输入区会在“发送”旁显示麦克风。点击它即可开始录音，无需按住按键。语音模型加载期间，按钮显示**正在启动…**；再次点击可取消。按钮变为**录音中 · 停止**后，点击停止，然后等待**正在转写…**结束。

无论 `stt.submitTrigger` 如何设置，通过此按钮启动的听写都会留在草稿中。检查或编辑文本，然后按 Enter 或点击“发送”。听写正在录音或转写到草稿时，Enter 和“发送”都不会执行操作。

如需实时英语转写，在 `omp setup speech` 中选择 **Nemotron 0.6B（实时流式，英语）**，或将 `modelRoles.dictation` 设为 `local/nemotron-streaming-en-0.6b`。说话时，文字会出现在草稿中。首次录音会等待模型加载完毕才打开麦克风；当按钮显示**录音中 · 停止**时再开始说话。之后的录音复用已加载模型。下载和语言详情见[本地语音模型](./local-models.md#speech-to-text)。

## 恢复已清空的提示 \{#recover-a-cleared-prompt}

按 `Ctrl+C` 清空尚未发送的输入区草稿，再按 `Up` 可将其调回。较早的草稿与已提交提示共用现有的 Up/Down 导航。调回的草稿仍可编辑，在你提交之前绝不会发送。

已清空的草稿会在当前编辑器有上限的历史记录（100 条）中保留空白、折叠粘贴和图像附件。它们不会写入持久化提示历史，也不会出现在 `Ctrl+R` 搜索中。关闭进程会丢弃这些已取消的草稿；独立的退出时保存行为仍适用于当前输入区中的文本。这不是按智能体划分的暂存区：历史跟随编辑器，即使智能体中心切换焦点也是如此。

现有的连续两次 `Ctrl+C` 退出行为保持不变。空内容清空不会添加历史条目。

恢复功能默认开启。可在 `/settings` 的“交互 > 输入”中关闭**调回已清空草稿**，或设置 `composer.recallClearedDrafts: false`。无需重启，下次清空时即生效；先前保留的草稿仍留在历史中，直到被淘汰或编辑器关闭。

在 Windows Terminal 中，`Ctrl+V` 可能在 `omp` 收到之前就被终端粘贴命令处理；剪贴板图像粘贴似乎没有反应时，请使用 `Alt+V` 回退键。剪贴板没有图像时，`app.clipboard.pasteImage` 会改为粘贴剪贴板文本，因此只传递这一组合键的宿主（配置为转发 `Ctrl+V` 的 VS Code 集成终端、通过 `Win+V` 调用的 Windows 剪贴板历史）可处理两类载荷。Windows Terminal 还会吞掉 `Ctrl+Enter`，所以 `app.message.followUp` 组合键也绑定了 `Ctrl+Q`，与 GitHub Copilot CLI 使用的组合键相同；同一组合键也用于提交智能体仪表板的新智能体描述和钩子编辑器提示。如果现有 `keybindings.yml` 已将 `Ctrl+Q` 分配给其他操作，则该用户重映射优先，后续消息仍使用 `Ctrl+Enter`，除非显式绑定 `app.message.followUp`。

实现了 OSC 5522 增强粘贴的终端可将剪贴板 MIME 数据直接发送给 `omp`；粘贴图像会作为 `[Image #N]` 附加，而 text/plain 粘贴事件保持正常粘贴行为。OSC 5522 不可用时，括号粘贴仍处理文本；如果粘贴的是单个图像文件路径，且 `omp` 宿主可读取该文件，就会将其作为图像加载。

加载 `keybindings.yml` 时会迁移旧版未限定的操作名称，但新文档和新配置应使用上面的命名空间操作 ID。现有 `keybindings.json` 文件仍会被接受并迁移为 `keybindings.yml`；也接受 `keybindings.yaml`。

## Vim 编辑模式 \{#vim-editing-mode}

默认关闭。在 `/settings`（交互 → 输入）中启用 **Vim 编辑模式**，或直接设置：

```yaml
tui.vimMode: true
```

每个提示都从插入模式开始，也可通过 **Vim 起始模式**（`tui.vimStartMode: normal`）从普通模式开始：启动时、每次发送消息后，以及对话框文本框中都是如此。`Escape` 切换到普通模式；提示边框会变色以显示当前模式（bash/python 模式颜色优先）。软件光标在插入模式下为当前字符加下划线，在普通模式下使用方块；行尾时插入模式使用竖线，可视模式则高亮选区。终端光标形状通过 DECSCUSR 设置，插入模式为竖线，普通/可视模式为方块，并在退出时恢复。这是一个实用的 Vim 子集，而非完整实现。

状态行也会显示模式、正在输入的命令，以及多行可视选区的大小。**Vim 模式指示器**（`tui.vimModeDisplay`）可选择 `text`（默认）、`icon` 或 `none`（隐藏模式）。**Vim 显示命令**（`tui.vimShowCommand`，默认开启）会像 Vim 的 `showcmd` 一样回显尚未输入完整的命令，因此在输入最后一个 `d` 之前就会显示 `15d`；即使模式被隐藏，它也会显示。关闭即可隐藏。

对话框中的文本框使用相同的 Vim 模式：ask 表单的多行文本区、单行文本字段、“其他”答案和选项备注，以及 ask 工具的键入答案和扩展文本提示。在这些地方，`Escape` 先退出插入模式，第二次 `Escape` 才关闭备注、将按键控制交回输入区或取消提示。密码字段保持普通输入。终端光标形状跟随当前获得按键控制的文本框。在 ask 表单的选项行和“提交”处，`j` 和 `k` 像方向键一样向下和向上移动；在普通模式的文本框中，它们会在最后一行或第一行处移出文本框。下拉列表将 `j` 和 `k` 保留用于字母预输入定位；在那里请使用方向键。

| 模式 | 进入方式 | 退出方式 |
| --- | --- | --- |
| 插入 | `i` `a` `I` `A` `o` `O` | `Escape` |
| 普通 | 在插入模式按 `Escape` | 任意插入模式按键 |
| 可视 | `v` | `Escape` 或操作符（`y` `d` `c`） |
| 可视行 | `V` | `Escape` 或操作符（`y` `d` `c`） |

### 普通模式 \{#normal-mode}

| 按键 | 含义 |
| --- | --- |
| `h` `j` `k` `l` | 按字符和行移动（方向键也可使用）。越过第一行时，`k`（以及 `-`）从历史中加载上一个提示；越过最后一行时，`j`（以及 `+`）加载下一个，类似 zsh 的 vi 模式；在最新提示之后按 `j` 会恢复草稿，包括撤销历史。对调回提示的编辑会保留到发送为止 |
| `gj` `gk` | 在自动换行的行中按屏幕行移动，保持屏幕列位置（`j`/`k` 与 Vim 一样按完整行移动） |
| `0` `^` `$` | 行首 / 第一个非空白字符 / 行尾 |
| `-` `+` `_` | 上一行 / 下一行 / 当前行的第一个非空白字符；配合操作符时按行操作（`d-`、`c+`、`2d_`） |
| `w` `b` `e` `ge` / `W` `B` `E` `gE` | 按单词 / 空白分隔的 WORD 移动，像 Vim 一样跨行（空行算一个单词） |
| `f` `F` `t` `T` + 字符 | 在行内查找到 / 移至该字符之前（`;` 重复，`,` 反向） |
| `gg` `G` | 第一行、最后一行的第一个非空白字符（`5gg` 和 `5G` 跳到第 5 行） |
| `1`-`9` 前缀 | 重复移动或操作符，例如 `3w`、`5j`、`2dd` |
| `i` `a` `I` `A` | 在光标前 / 后、行首 / 行尾插入；计数会重复键入的文本（`3ix` 输入 `xxx`） |
| `o` `O` | 在下方 / 上方新建一行并插入（`2ofoo` 新建两行） |
| `gi` | 在上次离开插入模式的位置插入 |
| `x` `X` | 删除光标处 / 光标前的字符 |
| `D` `C` `Y` | 分别为 `d$`、`c$` 和 `yy`（`2D` 删除到下一行末尾） |
| `s` `S` | 替换：`s` 为 `cl`（`3s` 更改三个字符），`S` 为 `cc`（`2S` 更改两行） |
| `r` + 字符 | 替换光标处的字符（`3rx` 替换三个字符） |
| `R` | 替换模式：键入的字符会覆盖原字符，直到按 Escape |
| `~` | 切换光标处字符的大小写并向右移动（`3~` 切换三个字符） |
| `%` | 跳到光标处或之后匹配的 `()` `[]` `{}` `"` `'`。引号匹配限于当前行；括号可跨行。带计数时，`50%` 跳到缓冲区相应百分比的位置。 |
| `{` `}` | 上一段 / 下一段（以空行为边界） |
| `J` `gJ` | 合并行；`J` 去掉下一行的缩进（空行合并时不加空格），`gJ` 保留所有空白 |
| `>>` `<<` | 增加 / 减少两个空格的缩进（`3>>` 为三行增加缩进；`>}` 对移动范围执行缩进）。空行不变。 |
| `d` `y` `c` + 移动 | 对移动范围执行操作，例如 `dw`、`d$`、`yb`、`cw`；从缩进中开始的多行删除会变为按行删除，与 Vim 相同 |
| `g~` `gu` `gU` + 移动 | 对移动范围或文本对象切换大小写 / 转小写 / 转大写（`gUiw`）；重复操作符（`gUU`、`guu`、`g~~`）则操作整行 |
| `dd` `yy` `cc` | 按行删除 / 复制 / 更改；`cc` 保留一个空行，并完整存储原来的行，因此 `p` 会按行将其放回 |
| `d` `y` `c` + 文本对象 | 对文本对象执行操作，例如 `diw`、`ca(`、`ci"`、`dap` |
| `p` `P` / `gp` `gP` | 放到光标后 / 前；`gp` 和 `gP` 会将光标停在刚放入的文本之后 |
| `"x` 前缀 | 下一次复制、删除或放入使用寄存器 `x`（见[寄存器](#registers)） |
| `u` `Ctrl+R` | 撤销 / 重做，支持计数（`3u`）；整个插入过程或整个 `.` 算一步，光标返回更改开始的位置 |
| `/` `?` | 打开提示历史搜索，与 `Ctrl+R` 打开的是同一个搜索 |
| `:` | 在空提示中开始斜杠命令：在插入模式键入 `/`，从而打开命令菜单。有草稿时不执行操作 |
| `.` | 重复上次更改，包括它开启的插入过程中键入的文本；计数会替换原计数（`3.`） |
| `gv` | 重新选择上次的可视选区 |

### 文本对象 \{#text-objects}

文本对象跟在操作符后（`diw`），或用于扩展可视选区（`viw`）。`i` 选取内部，`a` 选取包括外围的内容；支持计数，例如 `d2aw`。

| 对象 | 覆盖范围 |
| --- | --- |
| `iw` `aw` | 单词；`aw` 还包括相邻空白 |
| `iW` `aW` | 以空白分隔的 WORD |
| `i"` `i'` `` i` `` | 当前行引号内部（`a"` 也包括引号） |
| `i(` `i[` `i{` `i<` | 最内层匹配对内部，支持嵌套并可跨行；若光标周围没有匹配对，则取前方下一对，与 Vim 9.2 相同 |
| `a(` `a[` `a{` `a<` | 同一匹配对，包括其分隔符（`b` 和 `B` 是 `(` 和 `{` 的别名） |
| `ip` `ap` | 段落，即连续的非空白行（或空白行），按行选取 |

### 可视模式 \{#visual-mode}

`v` 开始按字符选择，`V` 开始按行选择；移动命令移动活动端，`$` 将选区扩展到包含换行符。`y` 将选区复制到寄存器，之后可用 `p` 放回（只有使用 `"+` 或 `tui.vimYankToClipboard` 才会复制到系统剪贴板，见[寄存器](#registers)）；`d` 删除选区，`c` 删除选区并进入插入模式。`x` 像 `d` 一样删除，`s` 像 `c` 一样更改，`r` + 字符会替换每个字符，`u` / `U` / `~` 将其转小写 / 转大写 / 切换大小写，`J` / `gJ` 则合并其中的行。即使是按字符的选区，`X`、`D`、`Y`、`C`、`S` 和 `R` 也会作用于选区触及的每一行。`p` 和 `P` 用寄存器内容替换选区（`p` 随后会将被替换的文本保存在寄存器中；`P` 不改变寄存器）。`o` 跳到选区另一端。`Escape` 取消。

### 寄存器 \{#registers}

复制和删除会像 Vim 一样填充寄存器。不指定名称的 `p` 放入最近的内容；`"x` 选择另一个寄存器：

| 寄存器 | 保存的内容 |
| --- | --- |
| `"a`-`"z` | 命名寄存器；`"A`-`"Z` 向其追加 |
| `"0` | 上次未指定寄存器名称的复制 |
| `"1`-`"9` | 整行或多行删除，最新的在 `"1` 中 |
| `"-` | 上次行内删除 |
| `"_` | 黑洞：删除内容不存储在任何位置 |
| `"+` `"*` | 系统剪贴板：`"+y` 复制到其中，`"+p` 放入其内容（以换行符结尾的文本按整行放入） |

插入模式中剪除的文本（`Ctrl+K`、`Ctrl+W`）会成为不指定名称的 `p` 放入的内容，直到 Vim 存储更新内容；Vim 的复制和删除也会保留在剪除环中，供 `Ctrl+Y` 使用。

与 Vim 一样，只有 `"+y` 和 `"*y` 会复制到系统剪贴板。启用 **Vim 复制到剪贴板**（`tui.vimYankToClipboard: true`）后，每次复制也都会写入系统剪贴板，类似 Vim 中的 `clipboard=unnamed`。删除内容只有通过 `"+` / `"*` 才会进入剪贴板。

如果选区会切穿 `📷 #1` 或 `📄 #2` 这样的附件标签块，则会将整个标签块纳入其中，因此删除绝不会留下损坏的片段。

### Escape \{#escape}

`Escape` 与应用级中断共用，所以 Vim 模式只在有事可做时接管它：

- **插入模式** → 切换到普通模式（若自动补全弹窗已打开，第一次 Escape 会先关闭它）。
- **可视模式**，或尚未输入完整的计数或操作符 → 取消并返回无待处理操作的普通模式。
- **替换模式**（`R`）→ 切换到普通模式，向后移到最后一个被覆盖的字符上。
- **普通模式且无待处理操作** → 交给应用行为：关闭自动补全、中止正在执行的工作，或在编辑器为空时执行配置的双击 Escape 操作。空闲主会话的草稿会保留；bash/python 视图和聚焦的智能体视图有各自的 Escape 行为。

Vim 按键绝不会覆盖应用组合键：`Ctrl` 组合键、`Enter` 和 `Tab` 在所有模式中都保持正常行为，因此 `Enter` 在普通模式下仍会提交。有两个例外：`Ctrl+R` 在普通模式下是 Vim 的重做（插入模式下仍用于历史搜索）；无论终端使用何种键盘协议，`Ctrl+[` 在 Vim 模式中都执行与 `Escape` 相同的操作。这类按键也会先取消尚未输入完整的命令（`d`、`r`、`f`），所以命令绝不会延续到下一个提示。普通模式下，`Up`/`Down` 等同于 `k`/`j`，包括历史步进；插入模式下，它们像未启用 Vim 模式时一样浏览历史。

不支持：标记（`m`、`'`、`` ` ``）、在草稿中搜索（`/` 和 `?` 打开历史搜索）、`n` / `N`、`*` 和 `#`、宏（`q`、`@`）、`Ctrl+A` / `Ctrl+X`、行撤销（`U`），以及 Ex 命令（`:` 只用于开始斜杠命令）。
