# 在 Windows 上运行 Pi \{#run-pi-on-windows}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Run Pi on Windows](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/windows.md)。[上游 MIT 许可证](./license.md)。

你可以在 Windows 上原生运行 Pi，也可以在适用于 Linux 的 Windows 子系统（WSL）中运行。原生运行时，Pi 默认通过 Git Bash 执行 Bash 命令，也可以让模型使用 PowerShell。在 WSL 中运行时，Pi 使用 Linux 环境和其中安装的 Bash。

按照[快速上手](./quickstart.md)安装 Pi 并完成认证，再参照本页选择和配置命令执行环境。

## 选择原生 Windows 或 WSL \{#choose-native-windows-or-wsl}

| 环境 | 命令执行环境 | 适用场景 |
|---|---|---|
| 原生 Windows，使用 Git Bash | 内置 `bash` 工具和 `!` 命令都使用 Git Bash | 文件和开发工具主要在 Windows 中 |
| 原生 Windows，使用 `powershell` 工具 | 模型调用工具时使用 PowerShell；`!` 命令仍可使用 Bash | 任务依赖 PowerShell 模块或 Windows 原生命令 |
| WSL | 所选 WSL 发行版中的 Linux Bash 和工具 | 文件和工具链已经在 Linux 或 WSL 中 |

## 在原生 Windows 中使用 Git Bash \{#use-git-bash-on-native-windows}

对大多数原生 Windows 用户，安装 [Git for Windows](https://git-scm.com/download/win) 即可。

Pi 按以下顺序查找 Bash：

1. `~/.pi/agent/settings.json` 中的 `shellPath`
2. `%ProgramFiles%\Git\bin\bash.exe` 中的 Git Bash
3. `%ProgramFiles(x86)%\Git\bin\bash.exe` 中的 Git Bash
4. `PATH` 中的 `bash.exe`，包括 Cygwin、MSYS2 或旧版 WSL 提供的 Bash

启动 Pi 并输入以下命令，验证 Shell 是否可用：

```text
!printf 'Bash is working\n'
```

如果找不到 Bash，Pi 会列出查过的位置。你可以安装 Git for Windows，将其他 Bash 可执行文件所在的目录加到 `PATH`，或配置 `shellPath`。

## 让模型使用 PowerShell \{#let-the-model-use-powershell}

可选的 `powershell` 工具优先通过 `pwsh.exe` 运行命令，找不到时改用 Windows PowerShell。工具以 `-NoProfile -NonInteractive -ExecutionPolicy Bypass` 参数启动 PowerShell。管理员强制实施的执行策略仍可能优先于这些参数。

Pi 按以下顺序查找 PowerShell：

1. `PATH` 中的 `pwsh.exe`
2. `%ProgramFiles%\PowerShell\7\pwsh.exe`
3. `PATH` 中的 `powershell.exe`
4. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe`

要将模型使用的 `bash` 工具替换为 `powershell`，请将以下内容添加到 `~/.pi/agent/settings.json`：

```json
{
  "defaultTools": ["read", "powershell", "edit", "write"]
}
```

`["-bash", "+powershell"]` 也能实现同样的替换，同时保留你配置的其他默认工具。

重启 Pi，再让它执行一条无害的 PowerShell 命令。编辑区中的 `!` 和 `!!` 命令仍然使用 Bash。只有在 Pi 作为原生 Windows 进程运行时，才能使用 `powershell` 工具。

其他工具组合见[设置](./settings.md#tools)。

## WSL \{#wsl}

Windows 上的 WSL 路径转换，以及 WSL 内的额外 Git 分支轮询，都只识别 `/mnt/<drive>`，不识别自定义挂载根目录。

在 Windows 中使用旧版 WSL 的 `bash.exe` 启动程序时，Pi 通过标准输入发送命令，以避免命令行引号处理问题。

## 使用自定义 Bash 可执行文件 \{#use-a-custom-bash-executable}

如果 Bash 安装在 Pi 无法自动找到的位置，请设置 `shellPath`：

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```

JSON 使用反斜杠表示转义序列。填写带反斜杠的 Windows 路径时，每个反斜杠都要像上面的示例一样写两遍。

命令前缀、别名和完整的 Shell 查找规则见[配置 Shell 命令](./shell-aliases.md)。

## 选择终端 \{#choose-a-terminal}

Windows 上的终端通过控制台主机（conhost）运行 Pi。有些终端自带较新的 conhost，其他终端则使用 Windows 内置的旧版本，其中有些缺陷会影响 Pi。

推荐使用 [Windows Terminal](https://aka.ms/terminal)。它始终附带最新的 conhost，Pi 在这个终端上经过的测试也最充分。

下表的兼容性状态截至 2026 年 10 月。

| 终端 | Conhost | 状态 |
|---|---|---|
| [Windows Terminal](https://aka.ms/terminal) | 随终端提供，版本较新 | 推荐 |
| [VS Code](https://code.visualstudio.com)、[Tabby](https://tabby.sh)、[WezTerm](https://wezterm.org) nightly 版 | 随终端提供，版本较新 | 可用 |
| [Alacritty](https://alacritty.org) | 使用 Windows 内置版本，除非 `alacritty.exe` 旁边放有来自 Windows Terminal 的 `conpty.dll` 和 `OpenConsole.exe` | 只有放入这两个文件才能正常使用 |
| WezTerm 20240203 及更早版本 | 随终端提供，版本较旧 | [已知问题](#known-issues) |
| 经典控制台（不经 Windows Terminal 运行的 `cmd.exe` 或 PowerShell）、mintty（Git Bash）、ConEmu、Cmder、[Hyper](https://hyper.is)、Windows OpenSSH | Windows 内置 | [已知问题](#known-issues) |

## 配置 Windows Terminal \{#configure-windows-terminal}

Windows Terminal 会占用或改写一些带修饰键的组合键。`Shift+Enter` 和 `Alt+Enter` 的配置方法见 [Windows Terminal](./terminal-setup.md#windows-terminal)，Pi 在 Windows 和 WSL 上的默认快捷键见[按键绑定](./keybindings.md)。

## 已知问题 \{#known-issues}

这些问题都出在 conhost。Microsoft 已修复源代码中的问题，但尚未说明 Windows 内置的 conhost 何时会收到这些修复。

| 问题 | 受影响的环境 | 解决方法 |
|---|---|---|
| 从全屏模式切换到常规模式，或在全屏模式下按 `Ctrl+G`，都会导致会话崩溃（[#9186](https://github.com/earendil-works/pi/issues/9186)、[microsoft/terminal#17515](https://github.com/microsoft/terminal/issues/17515)） | Windows 内置的 conhost | 使用带较新 conhost 的终端，或用 `--tui-mode regular` 启动 Pi |
| 提示词中出现 `;0;rgb:0000/0000/0000` 等文本，BEL 字符还会打开外部编辑器（[#10256](https://github.com/earendil-works/pi/issues/10256)） | 通过其他终端（mintty、Windows OpenSSH）使用 Windows 内置的 conhost | 使用带较新 conhost 的终端 |
| 提示词中出现 `79` 或 `55` 等片段（[#10717](https://github.com/earendil-works/pi/issues/10717)） | WezTerm 20240203 | 使用 WezTerm nightly 版 |
| 在常规模式下，每按一次键都会在新的一行重新绘制输入行（[#6300](https://github.com/earendil-works/pi/issues/6300)） | Windows 内置的 conhost、经典控制台 | 使用全屏模式（默认），或使用带较新 conhost 的终端 |
