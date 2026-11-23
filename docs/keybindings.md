# 快捷键参考 \{#keybindings-reference}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Keybindings Reference](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/keybindings.md)。[上游 MIT 许可证](./license.md)。

Pi 提供 `app.session.new` 等可绑定快捷键的命名操作。你可以在 Pi 的[用户配置](./configuration.md#agent-directory)中更改默认绑定，或为尚未绑定的操作指定快捷键。

运行 `/hotkeys` 可以查看主编辑器和应用当前生效的快捷键。

## 配置快捷键 \{#assign-keybindings}

创建 `<agent-dir>/keybindings.json`。代理目录默认为 `~/.pi/agent`，详见[代理目录](./configuration.md#agent-directory)。

将每个操作 ID 映射到一个按键或一组按键：

```json
{
  "$schema": "https://pi.dev/schemas/keybindings.schema.json",
  "app.session.new": "ctrl+shift+n",
  "app.session.tree": ["ctrl+shift+t", "alt+shift+t"]
}
```

配置值会替换该操作的默认绑定。要禁用某个操作的快捷键，请将其设为空列表：

```json
{
  "tui.altScreen.pageUp": []
}
```

编辑文件后，运行 `/reload` 将更改应用到当前会话。

## 按键语法 \{#key-syntax}

使用 `modifier+key` 格式。修饰键包括 `ctrl`、`shift`、`alt` 和 `super`，也可以组合使用。支持以下按键：

- **字母：** `a-z`
- **数字：** `0-9`
- **特殊键：** `escape`、`esc`、`enter`、`return`、`tab`、`space`、`backspace`、`delete`、`insert`、`clear`、`home`、`end`、`pageUp`、`pageDown`、`up`、`down`、`left`、`right`
- **功能键：** `f1`-`f12`
- **符号：** `` ` ``、`-`、`=`、`[`、`]`、`\`、`;`、`'`、`,`、`.`、`/`、`!`、`@`、`#`、`$`、`%`、`^`、`&`、`*`、`(`、`)`、`_`、`+`、`|`、`~`、`{`、`}`、`:`、`<`、`>`、`?`

示例：`ctrl+shift+x`、`alt+ctrl+x`、`ctrl+shift+alt+x`、`super+k`、`ctrl+super+k` 和 `ctrl+1`。

绑定 `super` 需要终端能单独报告这个修饰键，通常使用 Kitty 键盘协议。不支持这一功能的终端可能无法识别这些快捷键。

## 操作 \{#actions}

### 终端界面 \{#terminal-ui}

#### 光标移动 \{#cursor-movement}

| 快捷键 ID | 默认值 | 说明 |
|---|---|---|
| `tui.editor.cursorUp` | `up` | 向上移动光标，到达顶部后浏览较早的历史记录 |
| `tui.editor.cursorDown` | `down` | 向下移动光标，到达底部后浏览较新的历史记录 |
| `tui.editor.historyPrevious` | None | 选择上一条提示词历史记录 |
| `tui.editor.historyNext` | None | 选择下一条提示词历史记录 |
| `tui.editor.cursorLeft` | `left`, `ctrl+b` | 将光标向左移动 |
| `tui.editor.cursorRight` | `right`, `ctrl+f` | 将光标向右移动 |
| `tui.editor.cursorWordLeft` | `alt+left`, `ctrl+left`, `alt+b` | 将光标向左移动一个词 |
| `tui.editor.cursorWordRight` | `alt+right`, `ctrl+right`, `alt+f` | 将光标向右移动一个词 |
| `tui.editor.cursorLineStart` | `home`, `ctrl+a` | 移至行首 |
| `tui.editor.cursorLineEnd` | `end`, `ctrl+e` | 移至行尾 |
| `tui.editor.jumpForward` | `ctrl+]` | 向前跳至指定字符 |
| `tui.editor.jumpBackward` | `ctrl+alt+]` | 向后跳至指定字符 |
| `tui.editor.pageUp` | `pageUp`, `ctrl+pageUp` | 向上滚动一页 |
| `tui.editor.pageDown` | `pageDown`, `ctrl+pageDown` | 向下滚动一页 |

专用的历史记录操作可在任意光标位置浏览提示词历史记录，并优先于使用同一按键的应用操作。

#### 文本编辑 \{#text-editing}

| 快捷键 ID | 默认值 | 说明 |
|---|---|---|
| `tui.editor.deleteCharBackward` | `backspace` | 删除光标前的字符 |
| `tui.editor.deleteCharForward` | `delete`, `ctrl+d` | 删除光标后的字符 |
| `tui.editor.deleteWordBackward` | `ctrl+w`, `alt+backspace` | 删除光标前的一个词 |
| `tui.editor.deleteWordForward` | `alt+d`, `alt+delete` | 删除光标后的一个词 |
| `tui.editor.deleteToLineStart` | `ctrl+u` | 从光标位置删除至行首 |
| `tui.editor.deleteToLineEnd` | `ctrl+k` | 从光标位置删除至行尾 |
| `tui.editor.yank` | `ctrl+y` | 粘贴最近删除的文本 |
| `tui.editor.yankPop` | `alt+y` | 粘贴后在已删除的文本之间循环切换 |
| `tui.editor.undo` | `ctrl+-`（Windows 上为 `ctrl+z`；WSL 上为 `alt+z`） | 撤销上一次编辑 |

#### 输入和选择 \{#input-and-selection}

| 快捷键 ID | 默认值 | 说明 |
|---|---|---|
| `tui.input.newLine` | `shift+enter`, `ctrl+j` | 插入换行 |
| `tui.input.submit` | `enter` | 提交输入 |
| `tui.input.tab` | `tab` | 制表或自动补全 |
| `tui.input.copy` | `ctrl+c` | 复制选区 |
| `tui.select.up` | `up` | 向上移动选中项 |
| `tui.select.down` | `down` | 向下移动选中项 |
| `tui.select.pageUp` | `pageUp` | 在列表中向上翻页 |
| `tui.select.pageDown` | `pageDown` | 在列表中向下翻页 |
| `tui.select.confirm` | `enter` | 确认选择 |
| `tui.select.cancel` | `escape`, `ctrl+c` | 取消选择 |

#### 全屏模式 \{#fullscreen}

在全屏模式下，这些操作控制对话记录，并优先于使用同一按键的编辑器操作。如果浮层或可滚动列表（如自动补全列表、`/settings` 或模型选择器）获得焦点，滚动和提示词跳转操作会作用于它，而非对话记录。此时，`tui.select.pageUp` 和 `tui.select.pageDown` 会移动列表中的选中项。对话记录的搜索操作仍然有效。

| 快捷键 ID | 默认值 | 说明 |
|---|---|---|
| `tui.altScreen.pageUp` | `pageUp` | 将对话记录向上滚动一页 |
| `tui.altScreen.pageDown` | `pageDown` | 将对话记录向下滚动一页 |
| `tui.altScreen.halfPageUp` | None | 将对话记录向上滚动半页 |
| `tui.altScreen.halfPageDown` | None | 将对话记录向下滚动半页 |
| `tui.altScreen.lineUp` | None | 将对话记录向上滚动一行 |
| `tui.altScreen.lineDown` | None | 将对话记录向下滚动一行 |
| `tui.altScreen.previousPrompt` | `ctrl+shift+up`, `ctrl+up`（`ctrl+up` 仅在 Windows 和 WSL 上可用） | 跳到上一条已标记的消息 |
| `tui.altScreen.nextPrompt` | `ctrl+shift+down`, `ctrl+down`（`ctrl+down` 仅在 Windows 和 WSL 上可用） | 跳到下一条已标记的消息 |
| `tui.altScreen.search` | `ctrl+shift+f`（Windows 和 WSL 上为 `ctrl+f`） | 搜索已渲染的对话记录 |
| `tui.altScreen.searchNext` | `enter`, `ctrl+g` | 搜索时选中下一处匹配 |
| `tui.altScreen.searchPrevious` | `shift+enter`, `ctrl+shift+g` | 搜索时选中上一处匹配 |
| `tui.altScreen.searchClose` | `escape` | 关闭对话记录搜索 |
| `tui.altScreen.top` | `ctrl+home` | 滚动至对话记录开头 |
| `tui.altScreen.bottom` | `ctrl+end` | 滚动至对话记录末尾并跟随新输出 |

### 应用 \{#application}

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.interrupt` | `escape` | 取消或中止 |
| `app.clear` | `ctrl+c` | 首次按下时清空编辑器，再次按下时退出 |
| `app.exit` | `ctrl+d` | 编辑器为空时退出 |
| `app.suspend` | `ctrl+z`（Windows 上为 None） | 挂起至后台 |
| `app.editor.external` | `ctrl+g` | 在外部编辑器中打开（`externalEditor`、`$VISUAL`、`$EDITOR`、Windows 上的记事本或其他平台上的 `nano`） |
| `app.clipboard.pasteImage` | `ctrl+v`（Windows 和 WSL 上为 `alt+v`、`ctrl+v`） | 从剪贴板粘贴文件（仅 macOS）、图片或文本 |

Windows 原生环境下，终端不支持 Unix 作业控制，因此 `app.suspend` 没有默认快捷键。如果手动为它指定快捷键，Pi 会显示一条状态消息，不会挂起。WSL 中的 `ctrl+z` 和 `fg` 照常工作。

### 会话 \{#sessions}

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.session.new` | None | 开始新会话（`/new`） |
| `app.session.tree` | None | 打开会话树导航器（`/tree`） |
| `app.session.fork` | None | 从当前会话创建分支（`/fork`） |
| `app.session.resume` | None | 打开会话恢复选择器（`/resume`） |
| `app.session.togglePath` | `ctrl+p` | 切换是否显示路径 |
| `app.session.toggleSort` | `ctrl+s` | 切换排序方式 |
| `app.session.toggleNamedFilter` | `ctrl+n` | 切换是否仅显示已命名的会话 |
| `app.session.rename` | `ctrl+r` | 重命名会话 |
| `app.session.delete` | `ctrl+d` | 删除会话 |
| `app.session.deleteNoninvasive` | `ctrl+backspace` | 搜索框为空时删除会话 |

### 模型和思考级别 \{#models-and-thinking}

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.model.select` | `ctrl+l` | 打开模型选择器 |
| `app.model.cycleForward` | `ctrl+p` | 循环切换到下一个模型 |
| `app.model.cycleBackward` | `shift+ctrl+p`（Windows 和 WSL 上为 `alt+p`） | 循环切换到上一个模型 |
| `app.models.save` | `ctrl+s` | 将选定的默认模型或模型切换范围保存到设置 |
| `app.thinking.cycle` | `shift+tab` | 循环切换思考级别 |
| `app.thinking.save` | `ctrl+s` | 将当前思考级别保存到设置 |
| `app.thinking.toggle` | `ctrl+t` | 折叠或展开思考内容块 |

### 显示和消息队列 \{#display-and-message-queue}

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.tools.expand` | `ctrl+o` | 折叠或展开工具输出 |
| `app.message.copy` | `ctrl+x` | 在 `/tree` 中复制选中的消息；在全屏模式下，若 `fullscreenCopyOnSelect` 为 `false`，则复制当前选区；其他情况下复制助手的最后一条消息。在 OAuth 登录界面上复制登录 URL |
| `app.message.followUp` | `alt+enter`（Windows 和 WSL 上为 `ctrl+q`） | 将后续消息加入队列 |
| `app.message.dequeue` | `alt+up`（Windows 和 WSL 上为 `alt+q`） | 将排队的消息恢复到编辑器 |

### 会话树导航 \{#tree-navigation}

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.tree.foldOrUp` | `ctrl+left`, `alt+left` | 折叠当前分支片段，或跳到上一片段的起点 |
| `app.tree.unfoldOrDown` | `ctrl+right`, `alt+right` | 展开当前分支片段，或跳到下一片段的起点或分支末尾 |
| `app.tree.editLabel` | `shift+l` | 编辑会话树中选中节点的标签 |
| `app.tree.toggleLabelTimestamp` | `shift+t` | 切换是否在会话树中显示标签的时间戳 |
| `app.tree.filter.default` | `ctrl+d` | 将会话树的筛选模式设为默认视图 |
| `app.tree.filter.noTools` | `ctrl+t` | 切换会话树中隐藏工具结果的筛选模式 |
| `app.tree.filter.userOnly` | `ctrl+u` | 切换会话树中仅显示用户消息的筛选模式 |
| `app.tree.filter.labeledOnly` | `ctrl+l` | 切换会话树中仅显示带标签条目的筛选模式 |
| `app.tree.filter.all` | `ctrl+a` | 切换会话树中显示所有条目的筛选模式 |
| `app.tree.filter.cycleForward` | `ctrl+o` | 循环切换到下一个会话树筛选模式 |
| `app.tree.filter.cycleBackward` | `shift+ctrl+o` | 循环切换到上一个会话树筛选模式 |

### 模型切换范围选择器 \{#scoped-models-selector}

以下快捷键适用于通过 `/scoped-models` 打开的模型切换范围选择器。

| 快捷键 ID | 默认值 | 说明 |
|--------|---------|-------------|
| `app.models.enableAll` | `ctrl+a` | 启用所有模型（或所有符合当前搜索条件的模型） |
| `app.models.clearAll` | `ctrl+x` | 清除所有模型的选择（或只清除符合当前搜索条件的模型） |
| `app.models.toggleProvider` | `ctrl+p` | 切换当前模型提供方下所有模型的启用状态 |
| `app.models.reorderUp` | `alt+up` | 将选中的模型在循环切换顺序中上移 |
| `app.models.reorderDown` | `alt+down` | 将选中的模型在循环切换顺序中下移 |
