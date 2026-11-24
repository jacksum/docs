# 快速上手 \{#quickstart}

Pi 在终端中运行，可以处理你电脑上的文件。使用前，你需要通过 Pi 支持的模型服务接入模型。你可以使用订阅、API 密钥或本地模型。

如果要在 Windows 上原生运行 Pi，请参阅 [Windows 环境设置][windows]。在 Android 上，请参阅 [Termux 安装指南][termux]。

## 1. 安装 Pi \{#1-install-pi}

下面的默认安装命令不会把 Pi 固定在本文对应的 v1.6.0。

在 macOS 或 Linux 上，运行安装脚本：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

在 Windows 上，运行安装脚本：

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

这两种安装脚本都会锁定所有依赖的版本。使用脚本安装后，用 `pi update` 更新 Pi。

也可以通过 npm 安装。此方式不锁定间接依赖的版本，需要 Node.js 22.19 或更高版本：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent
```

通过 npm 正常安装 Pi 时，不需要运行依赖包的生命周期脚本。

如需安装本文对应的版本，请在 npm 包名后指定 `@1.6.0`：

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@1.6.0
```

如果你在 macOS 或 Linux 上使用 Nix，可以从 Pi 的 flake 安装最新发行版。Nix 会从源码构建 Pi：

```bash
nix profile add github:earendil-works/pi/stable
```

较旧的 Nix 版本使用 `nix profile install`。通过 Nix 安装后，用 `nix profile upgrade pi` 更新，`pi update` 无法更新这种安装。如需锁定发行版，可以使用 `github:earendil-works/pi/v1.0.0` 这样的标签。

运行以下命令检查实际安装的版本：

```bash
pi --version
```

如果指定了 `@1.6.0`，输出应为 `1.6.0`。

## 2. 启动 Pi \{#2-start-pi}

切换到你希望 Pi 在其中工作的文件夹，再启动 Pi：

```bash
cd /path/to/folder
pi
```

Pi 根据工作目录查找相关文件、指令和配置。它也按工作目录归类保存的会话。

![Pi 在终端中运行，界面包含对话、输入编辑区和底部状态栏](/images/interactive-mode.png)

终端界面会显示对话，提供输入提示词和命令的编辑区，并在底部显示当前目录、模型和会话状态。关于添加文件、运行命令、引导进行中的任务和管理结果，请参阅[在终端中使用 Pi][usage]。

## 3. 选择模型 \{#3-choose-a-model}

**模型**生成 Pi 的回复。**模型提供方（provider）**是 Pi 用来访问模型的服务或账号。

在 Pi 中运行：

```text
/login
```

选择模型提供方，按提示使用订阅或保存 API 密钥。如果之后想换另一个可用模型，运行 `/model`。

支持的模型提供方、环境变量认证、本地模型和自定义端点，见[选择模型和提供方][models]。

## 4. 交给 Pi 一个任务 \{#4-give-pi-a-task}

Pi 会显示它执行的每次文件读取、搜索、命令执行和文件编辑。它不会在每次调用工具前都征求确认。

输入与你的工作有关的任务，例如：

```text
总结 @meeting-notes.md，并将待办事项保存到 action-items.md。
```

```text
解释这个仓库的结构，以及如何运行仓库中的检查。
```

```text
比较 @previous.csv 和 @current.csv，并概括重要变化。
```

在编辑区输入 `@` 即可搜索文件，无需键入完整路径。Pi 完成任务后，检查它的回复和有改动的文件。重要工作请使用版本控制或备份。任务涉及不受信任的资源，或需要让 Pi 无人值守运行时，请使用容器或其他沙箱。详情见[安全指南][security]。

## 稍后继续会话 \{#continue-later}

Pi 会自动保存会话。退出 Pi 后，在同一工作目录中运行以下命令，继续最近的会话：

```bash
pi --continue
```

使用 `/resume` 可以选择其他已保存的会话。有关会话命名、分支、上下文压缩、导出和分享，请参阅[继续会话或创建分支][sessions]。

## 下一步 \{#next-steps}

- [交互式使用 Pi][usage]：了解输入方式、命令、快捷键和排队消息。
- [添加工作指令][context-files]：为指定工作目录设置 Pi 每次工作时应遵循的指令。
- [选择模型和提供方][models]。

### 选择定制方式 \{#choose-how-to-customize-pi}

优先选择能满足需求、功能范围最小的方式：

| 需求 | 从这里开始 |
|---|---|
| 给 Pi 设置在某个文件夹中长期生效的指令 | [`AGENTS.md`][context-files] |
| 通过 `/` 菜单复用提示词 | [提示词模板（Prompt template）][prompt-templates] |
| 添加面向特定任务的指令和配套文件 | [技能（Skill）][skills] |
| 添加可执行工具、命令或事件处理器 | [扩展（Extension）][extensions] |
| 创建自定义终端组件 | [终端界面（Terminal UI）][tui] |
| 接入 Pi 尚未支持的模型服务 | [自定义模型提供方][custom-provider] |
| 安装或分发多种资源 | [Pi 包（Pi package）][packages] |

## 卸载 Pi \{#uninstall-pi}

如果通过 npm 安装，运行：

```bash
npm uninstall -g @earendil-works/pi-coding-agent
```

如果使用安装脚本，重新运行对应平台的安装程序并选择 **Uninstall Pi**。

在 macOS 或 Linux 上运行：

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

在 Windows 上运行：

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

如果通过 Nix 安装，运行：

```bash
nix profile remove pi
```

这些方法都不会删除 `~/.pi/agent/` 中的配置、凭据、会话或已安装的 Pi 包。

[windows]: ./windows.md
[termux]: ./termux.md
[usage]: ./usage.md
[models]: ./models.md
[security]: ./security.md
[sessions]: ./sessions.md
[context-files]: ./configuration.md#context-files
[prompt-templates]: ./prompt-templates.md
[skills]: ./skills.md
[extensions]: ./extensions.md
[tui]: ./tui.md
[custom-provider]: ./custom-provider.md
[packages]: ./packages.md
