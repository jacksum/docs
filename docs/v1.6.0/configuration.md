# 配置 \{#configuration}

Pi 支持用户级配置和项目级配置。用户级配置保存在代理目录中，默认为 `~/.pi/agent`。项目级配置保存在工作目录下的 `.pi` 中，只有在你[信任项目](./security.md#understand-project-trust)后才会加载。`sessionDir` 是唯一的例外：为定位会话，Pi 会在判断项目是否受信任之前读取它。

在交互模式中，使用 `/settings` 更改常用偏好设置。对于其他选项，可以让 Pi 更新配置，也可以直接编辑相关文件。手动更改设置、快捷键、指令或资源后，运行 `/reload`。

## 代理目录 \{#agent-directory}

下文用 `<agent-dir>` 表示代理目录。你可以通过环境变量 `PI_CODING_AGENT_DIR` 或 SDK 的 [`agentDir`](./sdk.md) 选项指定其位置。

| 路径 | 用途 |
|---|---|
| `<agent-dir>/settings.json` | 用户级[设置](./settings.md)，包括偏好设置、默认值、资源路径和 Pi 包声明。 |
| `<agent-dir>/keybindings.json` | 自定义终端界面和应用[快捷键](./keybindings.md)。 |
| `<agent-dir>/mcp.json` | 在所有项目中可用的 [MCP 服务器](./mcp.md)。 |
| `<agent-dir>/models.json` | [兼容端点、模型和模型覆盖配置](./models.md#configure-a-compatible-endpoint)。 |
| `<agent-dir>/auth.json` | 已保存的 API 密钥和 OAuth 凭据。 |
| `<agent-dir>/AGENTS.override.md`、`AGENTS.md`、`AGENTS.MD`、`CLAUDE.md` 或 `CLAUDE.MD` | 在所有工作目录中生效的用户指令。 |
| `<agent-dir>/SYSTEM.md` | 替换 Pi 的默认系统提示词。 |
| `<agent-dir>/APPEND_SYSTEM.md` | 向 Pi 的系统提示词添加指令。 |
| `<agent-dir>/extensions/` | 用户[扩展](./extensions.md)。 |
| `<agent-dir>/skills/` | 用户[技能](./skills.md)及配套文件。 |
| `<agent-dir>/prompts/` | 以斜杠命令提供的用户[提示词模板](./prompt-templates.md)。 |
| `<agent-dir>/themes/` | 用户[主题](./themes.md)文件。 |

## 项目的 `.pi` 目录 \{#project-pi-directory}

| 路径 | 用途 |
|---|---|
| `.pi/settings.json` | 项目级[设置](./settings.md)、资源路径和 Pi 包声明。 |
| `.pi/mcp.json` | 项目的 [MCP 服务器](./mcp.md)。 |
| `.pi/SYSTEM.md` | 替换项目的系统提示词。 |
| `.pi/APPEND_SYSTEM.md` | 向系统提示词添加项目专用指令。 |
| `.pi/extensions/` | 项目扩展。 |
| `.pi/skills/` | 项目技能及配套文件。 |
| `.pi/prompts/` | 以斜杠命令提供的项目提示词模板。 |
| `.pi/themes/` | 项目主题文件。 |

对于 `SYSTEM.md` 和 `APPEND_SYSTEM.md`，受信任项目中的文件优先于代理目录中的对应文件。同名文件不会合并。

## 上下文文件 \{#context-files}

上下文文件不属于项目的 `.pi` 配置。Pi 从代理目录、工作目录及工作目录的各级父目录加载这些文件。无论 Pi 在上下文文件所在目录还是其任意下级目录中运行，该文件都适用。

`AGENTS.override.md` 只会替换同一目录下的 `AGENTS.md` 或 `CLAUDE.md`。它不影响代理目录或其他目录中的上下文文件。

查找上下文文件不要求事先信任项目。
