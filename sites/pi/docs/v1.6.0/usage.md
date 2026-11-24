# 在终端中使用 Pi \{#use-pi-in-the-terminal}

在你要工作的文件夹中运行 `pi`。Pi 根据工作目录查找文件、指令和配置，也按工作目录归类保存的会话。如果还没有安装 Pi 或选择模型，请先按[快速上手](./quickstart.md)操作。

在加载项目资源前，Pi 可能会询问你是否信任当前工作文件夹。参阅[项目信任](./security.md#understand-project-trust)。

![Pi 的交互模式，显示对话、编辑区和状态信息](/images/interactive-mode.png)

对话记录显示你的提示词、Pi 的回复、工具调用、结果和错误。你可以在编辑区输入提示词和命令。底部状态栏显示当前文件夹、会话、模型、上下文用量，以及累计用量和费用。

## 输入提示词 \{#enter-a-prompt}

输入请求，按 `Enter` 发送。按 `Shift+Enter` 换行。如果提示词较长，按 `Ctrl+G` 在已配置的外部编辑器中编写。

要在提示词中加入文件或图片：

- 输入 `@` 搜索文件，并将其加入提示词。
- 按 `Tab` 补全路径。
- 粘贴图片，或将图片拖入支持此操作的终端。

## 查看 Pi 的工作过程 \{#follow-pis-work}

Pi 会显示工作过程中的每次工具调用及其结果。按 `Ctrl+O` 展开或折叠工具输出。按 `Ctrl+T` 显示或隐藏推理区块。

启动时顶部会列出 Pi 加载的指令和资源。编辑区边框指示当前的推理级别。模型使用上下文并报告用量时，底部状态栏会随之更新。

Pi 不会在每次调用工具前都征求确认。请检查命令和有改动的文件。任务涉及不受信任的资源，或需要无人值守运行时，请使用沙箱。参阅[安全指南](./security.md)。

## 调整任务方向 \{#change-direction}

Pi 工作时，你仍然可以继续输入：

| 你想做什么 | 操作 |
|---|---|
| 调整当前任务 | 输入消息并按 `Enter` |
| 在当前任务结束后追加工作 | 输入消息并按 `Alt+Enter` |
| 将排队消息送回编辑区 | 按 `Alt+Up` |
| 停止当前任务 | 按 `Escape` |

用 `Enter` 发送的消息会等到当前回复及其工具调用结束，再引导下一次回复。用 `Alt+Enter` 发送的后续消息会等到 Pi 完成当前任务后再处理。中止任务时，排队消息会回到编辑区。

Windows Terminal 会占用部分 Alt 快捷键。有关 Windows 上的替代按键，请参阅[终端设置](./terminal-setup.md)。

## 更改模型或设置 \{#change-the-model-or-settings}

输入 `/` 搜索可用命令。最常用的命令包括：

- `/model` 用于选择模型。按 `Ctrl+L` 可打开同一个选择器。
- `/thinking` 用于调整当前模型的推理级别。按 `Shift+Tab` 在支持的级别之间循环切换。
- `/login` 和 `/logout` 用于管理对模型提供方的访问。
- `/settings` 用于更改常用设置。

提示词模板、技能和扩展都可以向同一个菜单添加命令。参阅[选择模型](./models.md)、[配置](./configuration.md)或完整的[斜杠命令参考](./slash-commands.md)。

## 继续会话或重新开始 \{#continue-or-start-over}

只要没有禁用会话持久化，Pi 就会自动保存会话。

- `/new` 开始新会话。
- `/resume` 打开另一个已保存的会话。
- `/name` 为当前会话起一个容易辨认的名字。
- `/session` 显示该会话的文件、ID、消息数量、token 用量和费用。

要尝试另一种做法又不丢失现有工作，可以使用 `/tree`、`/fork` 或 `/clone`。使用 `/compact` 可以减少发送给模型的对话历史。具体操作见[会话和上下文](./sessions.md)。

退出 Pi 后，在同一个文件夹中运行 `pi --continue`，即可继续该文件夹中最近一次保存的会话。

## 运行终端命令 \{#run-a-terminal-command}

在命令前加上 `!` 即可运行命令，并将输出加入对话：

```text
!git status
```

如果只想运行命令，不想将输出发送给模型，请使用 `!!`。

## 复制、导出或分享结果 \{#copy-export-or-share-results}

按 `Ctrl+X` 或运行 `/copy`，复制助手的上一条回复。使用 `/export` 将会话保存为 HTML 或 JSONL。

使用 `/share` 上传会话并获取查看链接。默认情况下，如果你已通过 Radius 认证，上传的会话对你的 Radius 组织可见；否则，Pi 使用 GitHub CLI 创建未公开列出的 Gist（secret gist），任何拿到链接的人都可以查看。[`sessionShareDestination`](./settings.md#sessions-and-context) 设置可以指定其中任一目的地。分享前请检查会话内容，其中可能包含提示词、工具输出、文件内容，以及在对话过程中暴露的凭据。

## 调整终端 \{#adjust-the-terminal}

默认的全屏模式将编辑区和状态区固定在终端窗口内，对话记录则在窗口内滚动。常规模式使用终端自带的滚动历史，可向上回看输出。通过 `/settings` 或 `--tui-mode` 选择模式。

不同终端对鼠标输入、键盘快捷键和内嵌图片的支持有所不同。各平台的配置见[终端设置](./terminal-setup.md)，所有可配置的快捷键见[按键绑定](./keybindings.md)。运行 `/hotkeys` 可以查看当前会话中生效的快捷键。

## 收集诊断信息 \{#collect-diagnostic-information}

排查终端渲染或对话状态问题时，运行 `/debug`。Pi 会将终端渲染出的文本行和当前会话消息写入[代理目录](./configuration.md#agent-directory)中的 `pi-debug.log`。

分享此文件前请先检查内容。其中可能包含提示词、模型回复、工具输出、文件内容和终端数据。
