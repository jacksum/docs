# 技能 \{#skills}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Skills](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/skills.md)。[上游 MIT 许可证](./license.md)。

技能为 Pi 提供面向特定任务的指令和配套文件。Pi 向模型列出各项可用技能的名称和描述，只在任务需要时加载完整指令。

当工作流程所需的上下文超出提示词模板能提供的范围，但不需要新增可执行的集成入口时，可以使用技能。技能除了指令，还可以包含脚本、参考资料和资源文件。

Pi 实现了 [Agent Skills 规范](https://agentskills.io/specification)。遇到多数无效字段时，Pi 会发出警告，不会阻止启动。

## 创建技能 \{#create-a-skill}

技能是包含 `SKILL.md` 的目录：

```text
pdf-tools/
├── SKILL.md
├── scripts/
│   └── extract.sh
├── references/
│   └── formats.md
└── assets/
    └── template.json
```

在 `SKILL.md` 开头写入 frontmatter，随后写明指令：

```markdown
---
name: pdf-tools
description: Extract text and tables from PDF files. Use when reading, converting, or inspecting PDFs.
---

# PDF tools

Read `references/formats.md` before converting a document. Run scripts relative to this skill directory.
```

描述决定模型会在什么情况下考虑加载该技能。写明技能能做什么，以及什么时候适用。不要只写“协助处理 PDF”这类无法说明何时选用的描述。

引用随技能附带的文件时，使用相对于技能目录的路径。Pi 会把技能的位置提供给模型，以便模型解析这些路径。

## 技能的加载方式 \{#understand-how-skills-load}

Pi 启动时扫描已配置的技能位置，把每项技能的名称、描述和路径加入系统提示词。此时不会加载完整指令。

任务匹配时，模型读取 `SKILL.md` 并遵循其中的指令。这样，详细指引只在需要时进入上下文。模型有时不会加载相关技能。如果需要强制加载，请使用 `/skill:name`。

`/skill:name` 后的参数会被附到已加载的指令之后，作为用户请求：

```text
/skill:pdf-tools extract report.pdf
```

如果只想通过显式命令调用技能，请在 frontmatter 中设置 `disable-model-invocation: true`。[设置](./settings.md)中的 `enableSkillCommands` 决定技能命令是否出现在交互式命令菜单中；手动输入的 `/skill:name` 命令仍然可用。

<a id="choose-where-it-loads"></a>

## 添加到 Pi \{#add-it-to-pi}

把技能放在用户或项目的技能目录中。Pi 会递归查找包含 `SKILL.md` 的目录。

Pi 也支持 Agent Skills 的约定位置 `~/.agents/skills/` 和 `.agents/skills/`。Pi 从工作目录起向上查找项目的 `.agents/skills/`，如果存在仓库根目录，就在那里停止。

Pi 接受某些独立的 Markdown 技能文件。为了便于在不同工具间使用，优先采用包含 `SKILL.md` 的目录。其他可用位置见[设置](./settings.md#resources)和 [Pi 包](./packages.md)。

项目技能可以指示模型运行脚本或修改文件。信任项目前，请检查不熟悉的技能及其配套文件。

## 编写可移植的 frontmatter \{#write-portable-frontmatter}

Agent Skills 规范定义了以下字段：

| 字段 | 用途 |
|---|---|
| `name` | 命令名和显示名称 |
| `description` | 向模型说明何时选用该技能的描述 |
| `license` | 许可证名称或随附的许可证文件 |
| `compatibility` | 环境要求 |
| `metadata` | 额外的键值元数据 |
| `allowed-tools` | 实验性的预授权工具列表 |
| `disable-model-invocation` | 从供模型自动选择的技能列表中隐藏该技能 |

名称使用小写字母、数字和连字符，开头和结尾不能是连字符，也不能连续使用连字符。名称最多 64 个字符，描述最多 1024 个字符。

Pi 不要求声明的名称与父目录相同，两者不一致时也不会警告。其他 Agent Skills 实现可能强制要求一致，因此保持两者一致更便于移植。

Pi 不会加载格式错误的 `SKILL.md`，也不会加载已声明但缺少描述的技能。名称冲突时，Pi 保留首先发现的技能并发出警告。

## 验证和分享技能 \{#validate-and-share-a-skill}

在 Pi 能发现该技能的位置启动 Pi，再检查启动诊断信息和 `/skill:name` 命令。如果在会话期间编辑了技能，请运行 `/reload`。

使用 [Pi 包](./packages.md)，可以通过 npm 或 Git 分发一个或多个技能。将环境初始化步骤保留在技能中，并在包中声明它需要的运行时依赖。

示例见 [Anthropic 技能合集](https://github.com/anthropics/skills)和 [Pi 技能合集](https://github.com/badlogic/pi-skills)。
