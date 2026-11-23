# 配置终端 \{#configure-your-terminal}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Configure your terminal](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/terminal-setup.md)。[上游 MIT 许可证](./license.md)。

大多数现代终端无需额外配置即可运行 Pi。如果带修饰键的组合键、滚动、链接、图片、颜色或输入法（IME）窗口的位置异常，请参阅本页。

Pi 使用扩展按键协议，使终端能够区分单按 `Enter` 和 `Shift+Enter`、`Alt+Enter` 等组合键。终端代理、多路复用器以及 IDE 内置终端都可能改写或丢弃这些按键信息。

## 问题排查 \{#troubleshooting}

| 现象 | 首先检查 |
|---|---|
| `Shift+Enter` 提交了输入，没有换行 | 下方对应的终端章节。如果使用 tmux，参阅[在 tmux 中运行 Pi](./tmux.md) |
| `Alt+Enter` 没有将后续消息加入队列 | [WezTerm](#wezterm)、[Alacritty](#alacritty) 或 [Windows Terminal](#windows-terminal) |
| 全屏模式下滚动异常缓慢 | [iTerm2](#iterm2) |
| 链接可以打开，但没有悬停预览 | [Ghostty](#ghostty) |
| 未检测到内嵌图片或颜色支持 | [手动指定终端能力](#override-detected-capabilities) |
| 输入法候选窗口的位置不正确 | [WezTerm](#wezterm) 或 [IntelliJ IDEA](#intellij-idea-integrated-terminal) |
| 带修饰键的组合键只在 tmux 内失效 | [在 tmux 中运行 Pi](./tmux.md) |

运行 `/hotkeys` 查看 Pi 当前生效的快捷键。更改方法见[按键绑定](./keybindings.md)。

## Kitty \{#kitty}

Kitty 无需额外配置即可支持 Pi 所需的键盘协议。

## iTerm2 \{#iterm2}

常规终端模式无需额外配置。

### 修复全屏模式下滚动缓慢的问题 \{#fix-slow-fullscreen-scrolling}

在全屏模式下，Pi 控制终端的可见区域，因此 iTerm2 会发送鼠标滚轮事件，而不是滚动终端自身的历史内容。此时即使在触控板上快速滑动，每次也可能只滚动约一行。

要更改此行为：

1. 打开 **iTerm2 > Settings > Advanced**。
2. 搜索 **Trackpad scrolls fast?**。
3. 将其设为 **No**。

此设置在整个 iTerm2 中生效，也可能改变未由 Pi 接管时的触控板滚动行为。相关问题见 [iTerm2 issue 9619](https://gitlab.com/gnachman/iterm2/-/work_items/9619)。

## Apple Terminal \{#apple-terminal}

终端支持增强按键报告时，Pi 会启用它。如果按下 `Shift+Enter` 时 Terminal.app 仍只发送 Return 或 `ESC` + Return，Pi 会回退到读取 macOS 本机的修饰键状态，将其识别为 `Shift+Enter`。未按住 Shift 时，`ESC` + Return 仍识别为 `Alt+Enter`。

只有 Pi 和 Terminal.app 在同一台 Mac 上运行时，才能使用这一回退机制。如果 Pi 通过 SSH 在另一台机器上运行，就无法读取本机的修饰键状态。

## Ghostty \{#ghostty}

如果 `Alt+Backspace` 无效，请将以下映射添加到 Ghostty 配置中：

```text
keybind = alt+backspace=text:\x1b\x7f
```

macOS 上的配置文件是 `~/Library/Application Support/com.mitchellh.ghostty/config`，Linux 上的配置文件是 `~/.config/ghostty/config`。

较早版本的 Claude Code 配置可能包含：

```text
keybind = shift+enter=text:\n
```

此映射直接发送换行符，Pi 无法将它与 `Ctrl+J` 区分开来。如果你仅因旧版 Claude Code 而添加了这条映射，请删除它。Pi 已将 `Ctrl+J` 绑定为换行的备用按键，因此映射看起来可能有效，却会阻止 Pi 和 tmux 收到真正的 `Shift+Enter` 事件。

### 在全屏模式下打开链接 \{#open-links-in-fullscreen-mode}

全屏模式下仍可点击链接，但 Pi 捕获鼠标输入时，Ghostty 不会显示通常的悬停下划线或 URL 预览。在 macOS 上按住 `Shift+Command`，或在 Linux 上按住 `Shift+Ctrl`，即可使用 Ghostty 自带的链接处理功能。

## WezTerm \{#wezterm}

WezTerm 通常通过 xterm 扩展按键协议报告 `Shift+Enter`。要显式启用 Kitty 键盘协议，请创建 `~/.wezterm.lua`：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.enable_kitty_keyboard = true
return config
```

### 在 macOS 上转发 Alt+Enter \{#forward-altenter-on-macos}

在 macOS 上，WezTerm 默认将 `Option+Enter` 绑定到全屏切换。要用它为 Pi 追加后续消息，请将以下条目添加到 `config.keys` 表中：

```lua
{
  key = 'Enter',
  mods = 'ALT',
  action = wezterm.action.SendString('\x1b[13;3u'),
}
```

一份完整的最小配置如下：

```lua
local wezterm = require 'wezterm'
local config = wezterm.config_builder()
config.keys = {
  {
    key = 'Enter',
    mods = 'ALT',
    action = wezterm.action.SendString('\x1b[13;3u'),
  },
}
return config
```

### 让 WSL 中的输入法候选窗口跟随光标 \{#position-an-ime-candidate-window-in-wsl}

如果中日韩（CJK）输入法的候选窗口在 WSL 中不跟随 Pi 的文本光标，请显示硬件光标：

```bash
export PI_HARDWARE_CURSOR=1
pi
```

也可以在 Pi 设置中将 `showHardwareCursor` 设为 `true`。

## Alacritty \{#alacritty}

Alacritty 通常会报告 `Shift+Enter`。在 macOS 上，`Option+Enter` 有时会被当作单按 `Enter`。请将以下内容添加到 `~/.config/alacritty/alacritty.toml`，将该组合键转发给 Pi：

```toml
[[keyboard.bindings]]
key = "Enter"
mods = "Alt"
chars = "\u001b[13;3u"
```

修改文件后，重启 Alacritty。

## VS Code 集成终端 \{#vs-code-integrated-terminal}

从 VS Code 1.109.5 起，集成终端默认启用 Kitty 键盘协议。

在较早版本中，请在 `keybindings.json` 中添加终端的 `Shift+Enter` 绑定：

```json
{
  "key": "shift+enter",
  "command": "workbench.action.terminal.sendSequence",
  "args": { "text": "\u001b[13;2u" },
  "when": "terminalFocus"
}
```

用户的 `keybindings.json` 文件通常位于：

- macOS：`~/Library/Application Support/Code/User/keybindings.json`
- Linux：`~/.config/Code/User/keybindings.json`
- Windows：`%APPDATA%\\Code\\User\\keybindings.json`

## Zed 集成终端 \{#zed-integrated-terminal}

将以下绑定添加到 Zed 的 `keymap.json`：

```json
{
  "context": "Terminal",
  "bindings": {
    "shift-enter": ["terminal::SendText", "\u001b[13;2u"],
    "ctrl--": ["terminal::SendText", "\u001b[45;5u"],
    "ctrl-alt-]": ["terminal::SendText", "\u001b[93;7u"]
  }
}
```

## Windows Terminal \{#windows-terminal}

Windows Terminal 中的 Pi 使用 Windows 和 WSL 的默认快捷键。完整列表见[按键绑定](./keybindings.md)。

### 转发 Shift+Enter \{#forward-shiftenter}

Pi 在 Windows 上原生运行时会检查本机的 Shift 键状态。只要按住 Shift，Pi 就会将 Return 或 `ESC` + Return 识别为 `Shift+Enter`。这一回退机制在 WSL 或通过 SSH 运行时无效。如果 `Shift+Enter` 仍然提交输入，请显式转发该组合键。

按 `Ctrl+Shift+,` 或选择 **Settings > Open JSON file**，打开 Windows Terminal 的 `settings.json`。将以下对象添加到其 `actions` 数组：

```json
{
  "command": { "action": "sendInput", "input": "\u001b[13;2u" },
  "keys": "shift+enter"
}
```

完全关闭并重新打开 Windows Terminal，然后确认在 Pi 中按 `Shift+Enter` 会插入换行。

### 使用 Alt+Enter 发送后续消息 \{#use-altenter-for-follow-ups}

Windows Terminal 默认将 `Alt+Enter` 绑定到全屏切换，因此 Pi 在 Windows 和 WSL 上使用 `Ctrl+Q` 发送后续消息。

要改用 `Alt+Enter`，请配置 Windows Terminal 转发该组合键，并在 Pi 的 `keybindings.json` 中将 `app.message.followUp` 绑定到 `alt+enter`。参阅[按键绑定](./keybindings.md#assign-keybindings)。

## xfce4-terminal 和 Terminator \{#xfce4-terminal-and-terminator}

这些终端无法可靠地区分带修饰键的 Enter 组合键和单按 `Enter`。因此，`Ctrl+Enter` 或 `Shift+Enter` 等自定义绑定可能无效。

需要这些快捷键时，请使用支持现代扩展按键协议的终端，例如 Kitty、Ghostty、WezTerm、iTerm2、Windows Terminal 或支持该协议的 Alacritty 版本。

## IntelliJ IDEA 集成终端 \{#intellij-idea-integrated-terminal}

IntelliJ IDEA 的内置终端无法可靠地区分 `Shift+Enter` 和单按 `Enter`。请使用 `Ctrl+J` 换行，或在支持现代扩展按键协议的终端中运行 Pi。

如果输入法候选窗口不跟随文本光标，请显示硬件光标：

```bash
export PI_HARDWARE_CURSOR=1
pi
```

## 手动指定终端能力 \{#override-detected-capabilities}

Pi 会自动检测终端是否支持 OSC 8 超链接、内嵌图片协议和真彩色。终端代理或多路复用器可能导致检测结果不准确。

| 终端能力 | 环境变量 | 设置 |
|---|---|---|
| 超链接 | `PI_HYPERLINKS=1\|0\|auto` | `terminal.hyperlinks: true\|false\|"auto"` |
| 内嵌图片 | `PI_IMAGE_PROTOCOL=kitty\|iterm2\|none\|auto` | `terminal.images: "kitty"\|"iterm2"\|false\|"auto"` |
| 真彩色 | `PI_TRUE_COLOR=1\|0\|auto` | `terminal.trueColor: true\|false\|"auto"` |

设置优先于环境变量。不设置值或将值设为 `auto`，会保留自动检测行为。

只有终端通信链路上的所有环节都支持某项能力时，才应强制启用。终端不支持的转义序列可能导致渲染异常。取值的正式定义见[环境变量](./environment-variables.md#pi-process-configuration)和[设置](./settings.md)。

## 程序状态 \{#program-status}

Pi 通过[程序状态协议（OSC 7501）](https://www.superlogical.com/rex/docs/build/program-status)报告状态，供终端和智能体仪表板显示 Pi 正在工作、等待操作、已完成或失败：

| 状态 | 何时报告 |
|---|---|
| `working` | 智能体正在运行或正在进行上下文压缩。消息为会话名称。 |
| `blocked` | 扩展对话框或登录流程正在等待你操作。消息为对话框标题。 |
| `done` | 一次运行已结束。消息为会话名称。 |
| `error` | 一次运行因错误而结束，且不会重试。消息为错误的第一行。 |
| `idle` | Pi 已启动，或你取消了当前运行。 |

报告不包含提示词或模型输出。只有终端回应了协议支持查询，Pi 才会发送报告。tmux 和 screen 不会转发这些报告。将 `PI_PROGRAM_STATUS=1` 设为环境变量，可跳过查询直接发送报告；将其设为 `PI_PROGRAM_STATUS=0` 可关闭报告。
