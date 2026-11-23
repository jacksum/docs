# 斜杠命令 \{#slash-commands}

在 Pi 的终端编辑区输入 `/`，即可搜索当前会话可用的命令。本页列出此版本 Pi 的内置命令。

扩展、提示词模板和技能可以添加命令。要确认当前会话所加载资源提供的命令，请以 Pi 中的命令菜单为准。

## 模型和设置 \{#models-and-settings}

| 命令 | 说明 |
|---|---|
| `/settings` | 打开设置 |
| `/model [provider/model]` | 选择模型 |
| `/thinking [level]` | 设置思考级别 |
| `/scoped-models` | 配置交互式循环切换时可选的模型 |
| `/login [provider]` | 添加模型提供方的身份验证信息 |
| `/logout` | 移除模型提供方的身份验证信息 |
| `/llama` | 管理已配置的 llama.cpp 路由器上的模型 |

## 会话和上下文 \{#sessions-and-context}

| 命令 | 说明 |
|---|---|
| `/new` | 开始新会话 |
| `/resume` | 恢复另一个会话 |
| `/name [name]` | 设置会话显示名称，省略参数则显示当前名称 |
| `/session` | 显示当前会话的信息和统计数据 |
| `/tree` | 浏览会话树 |
| `/fork` | 从之前的一条用户消息创建新会话 |
| `/clone` | 在当前位置复制当前会话 |
| `/compact [instructions]` | 压缩当前上下文，可附加自定义指令 |
| `/import <path>` | 导入 JSONL 会话，保留其 ID 和工作目录 |

## 导出和分享 \{#export-and-share}

| 命令 | 说明 |
|---|---|
| `/copy` | 复制最后一条助手消息 |
| `/export [path]` | 将会话导出为 HTML 或 JSONL |
| `/share` | 上传会话并返回查看链接 |
| `/bug [description]` | 为 Pi 开发者准备一份私密的缺陷报告 |

导出或分享前请检查会话。会话可能包含提示词、工具参数、命令输出、文件内容和对话中暴露的凭据。

## 运行时和项目 \{#runtime-and-project}

| 命令 | 说明 |
|---|---|
| `/trust` | 保存项目的信任决定，供之后启动的 Pi 进程使用 |
| `/mcp` | 管理 MCP 服务器：登录、重新连接、启用或禁用，以及调整工具的暴露方式 |
| `/reload` | 重新加载键位绑定、扩展、技能、模板、主题和上下文文件 |
| `/hotkeys` | 显示当前生效的快捷键 |
| `/changelog` | 显示变更日志条目 |
| `/quit` | 退出 Pi |

## 资源添加的命令 \{#commands-added-by-resources}

- 扩展可以注册命令，为命令提供自定义参数和补全行为。
- 每个提示词模板都可以通过其模板名调用。
- 启用技能命令后，可以通过 `/skill:name` 调用技能。

新增或修改能被 Pi 发现的命令资源后，请使用 `/reload`。加载和命名规则见[扩展](./extensions.md)、[提示词模板](./prompt-templates.md)和[技能](./skills.md)。
