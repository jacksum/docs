# 配置 shell 命令 \{#configure-shell-commands}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Configure shell commands](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/shell-aliases.md)。[上游 MIT 许可证](./license.md)。

Pi 为每条 Bash 命令启动一个独立的非交互式 shell 进程。非交互式 Bash 默认不展开别名，通常也不会加载与交互式终端相同的启动文件。

用 `shellPath` 选择 Bash 可执行文件，用 `shellCommandPrefix` 在每条命令前执行初始化操作。

## Pi 使用的 shell \{#understand-which-shell-pi-uses}

| 命令来源 | Shell |
|---|---|
| 模型调用内置的 `bash` 工具 | Pi 找到的 Bash 可执行文件 |
| 输入 `!command` 或 `!!command` | 相同的 Bash 可执行文件 |
| 模型调用可选的 `powershell` 工具 | PowerShell 7（`pwsh.exe`）或 Windows PowerShell |
| 扩展提供或替换 shell 工具 | 由该扩展实现的操作 |

Pi 通常使用 `bash -c` 调用 Bash。在 Unix 系统上，它先使用 `/bin/bash`，再查找 `PATH` 上的 `bash`；没有 Bash 时，退回 `sh`。在原生 Windows 上，它先检查配置的路径，再检查 Git Bash，最后查找 `PATH` 上的 `bash.exe`。

## 选择 Bash 可执行文件 \{#choose-a-bash-executable}

如果需要 Pi 使用指定的可执行文件，请在 `~/.pi/agent/settings.json` 中设置 `shellPath`：

```json
{
  "shellPath": "~/.local/bin/bash"
}
```

在 Windows 上，请使用正斜杠，或对反斜杠做转义：

```json
{
  "shellPath": "C:\\cygwin64\\bin\\bash.exe"
}
```

更改设置后运行 `/reload`。原生 Windows 上的默认行为见[在 Windows 上运行 Pi](./windows.md)。

## 在每条 Bash 命令前执行初始化 \{#run-setup-before-every-bash-command}

设置 `shellCommandPrefix`，在内置 `bash` 工具执行的命令，以及用户输入的 `!` 或 `!!` 命令前都加上初始化内容：

```json
{
  "shellCommandPrefix": "export CI=1"
}
```

Pi 用换行符连接前缀和要执行的命令。每次执行命令都会重新运行前缀，请让它快速完成，并避免交互式提示。

## 启用 Bash 别名 \{#enable-bash-aliases}

把 Pi 需要的别名放在 Bash 兼容的文件中，无需解析整份交互式 shell 配置。

创建 `~/.bash_aliases`：

```bash
alias ll='ls -la'
alias gs='git status --short'
```

然后配置 Pi，启用别名展开并加载该文件：

```json
{
  "shellCommandPrefix": "shopt -s expand_aliases\nsource ~/.bash_aliases"
}
```

运行 `/reload`，再通过 Pi 验证别名：

```text
!ll
```

该命令应输出与 `ls -la` 相同的列表。

别名必须使用 Bash 兼容的语法。不要在 Bash 中加载任意 `.zshrc`，因为 zsh 的选项、函数和插件可能无法正确解析或运行。

## 故障排查 \{#troubleshooting}

### 前缀对 `!` 生效，但对扩展工具无效 \{#the-prefix-works-for--but-not-for-an-extension-tool}

`shellCommandPrefix` 配置的是 Pi 内置 Bash 的执行过程。替换 `bash` 工具或自行提供 shell 操作的扩展会管理自己的初始化流程，请查看该扩展的文档。

### 找不到 `shopt` \{#shopt-is-not-found}

Pi 已退回 `sh`，或 `shellPath` 指向的不是 Bash。请安装 Bash，或在使用 `shopt` 等 Bash 专用初始化命令前，将 `shellPath` 指向 Bash 可执行文件。

### 初始化命令在等待输入 \{#a-setup-command-waits-for-input}

从 `shellCommandPrefix` 移除交互式命令。每条 Bash 命令执行前，前缀都在非交互式进程中运行。

完整字段定义见 [Shell 设置](./settings.md#shell)。
