# Pi \{#pi}

> 这是 Pi v1.6.0 文档的非官方简体中文译本。[MIT 许可证](./license.md)。

Pi 是一个在终端中运行的可扩展 AI 智能体。给它一个目标和一个工作目录，它就能检查文件、运行命令、编辑内容并完成多步骤任务。

你可以用 Pi 开发软件、整理研究笔记、写作、处理数据文件或做个人项目。你可以直接使用 Pi，也可以通过提示词让它适应你的工作流程，或使用 SDK 开发由 Pi 驱动的其他应用。

## 开始使用 Pi \{#start-using-pi}

第一次使用 Pi？按[快速上手](./quickstart.md)安装 Pi、连接模型并完成第一个任务。

如果已经安装 Pi，请按需要选择：

- [交互式使用 Pi](./usage.md)：添加文件、运行命令、引导进行中的任务并导出结果。
- [选择模型](./models.md)，或了解如何用订阅、API 密钥、本地模型或兼容端点接入 Pi。
- [继续会话或创建分支](./sessions.md)：恢复工作，或在不丢失历史的情况下尝试其他做法。
- [配置 Pi](./configuration.md)：设置偏好、工作目录、指令和可复用资源。
- [了解 Pi 的工作方式](./how-pi-works.md)：了解工具、上下文、会话和智能体循环。

## 定制 Pi \{#customize-pi}

Pi 可以复用提示词、加载专用指令、添加可执行的集成、更改终端界面和连接模型服务。你也可以将这些资源打包分发。

根据[定制方式对照表](./quickstart.md#choose-how-to-customize-pi)，选择能满足需求、功能范围最小的方式。

## 自动化或嵌入 Pi \{#automate-or-embed-pi}

- 使用[输出模式（print mode）](./cli.md#invocation-and-output)执行一次性任务或脚本任务。
- 使用 [JSON 事件流模式](./json.md)接收单次运行产生的结构化事件。
- 使用 [RPC 模式](./rpc.md)控制独立的 Pi 进程。
- 使用 [TypeScript SDK](./sdk.md)在应用中运行 Pi。

## 参考资料与环境配置 \{#find-reference-and-setup-information}

查阅 [CLI 选项](./cli.md)、[设置](./settings.md)、[模型提供方](./providers.md)、[快捷键](./keybindings.md)和[环境变量](./environment-variables.md)的参考资料。

特定平台的设置见[终端设置](./terminal-setup.md)、[Windows](./windows.md)、[tmux](./tmux.md)、[在 Android 上使用 Termux](./termux.md)或[容器化](./containerization.md)。

## 安全使用 Pi \{#work-safely}

Pi 的工具和扩展以 Pi 进程的权限运行。项目受信任与否决定 Pi 会加载哪些项目资源，但不会把工具调用限制在沙箱内。使用不受信任的文件、仓库或扩展，或执行无人值守的自动化任务前，请先阅读[安全指南](./security.md)。
