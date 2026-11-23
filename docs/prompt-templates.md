# 提示词模板 \{#prompt-templates}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Prompt Templates](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/prompt-templates.md)。[上游 MIT 许可证](./license.md)。

提示词模板把 Markdown 文件变成可复用的 `/` 命令。只需复用同一条提示词，不需要添加可执行行为或更多配套指令时，可以使用模板。

模板可以接收参数，也可以出现在命令补全中。Pi 可以从个人配置、项目配置、显式指定的路径或 Pi 包加载模板。只有在信任项目后，Pi 才会加载项目配置。

## 创建模板 \{#create-a-template}

创建 `~/.pi/agent/prompts/review.md`：

```markdown
---
description: Review staged git changes
argument-hint: "[focus]"
---
Review the staged changes. Focus on ${1:-correctness, security, and error handling}.
```

文件名就是命令名，因此可以通过 `/review` 使用此模板。`description` 会显示在命令补全中。省略时，Pi 使用模板的第一行非空文本。

`argument-hint` 为可选项。使用 `<尖括号>` 表示必填参数，使用 `[方括号]` 表示可选参数。

如果在会话期间新增或修改模板，请运行 `/reload`。

<a id="invoke-a-template"></a>

## 使用模板 \{#use-a-template}

在编辑区输入模板命令：

```text
/review
/review concurrency
```

Pi 会先展开模板，再将展开后的文本交给智能体。扩展先通过 `input` 事件收到原始输入。如果同名扩展命令处理了该输入，则不会触发 `input` 事件。

模板支持以下替换语法：

| 语法 | 结果 |
|---|---|
| `$1`、`$2`、… | 一个位置参数 |
| `$@` 或 `$ARGUMENTS` | 用空格连接的所有参数 |
| `${1:-default}` | 第一个参数，缺省时使用默认值 |
| `${@:-default}` | 所有参数，缺省时使用默认值 |
| `${@:N}` | 从位置 `N` 开始的参数 |
| `${@:N:L}` | 从位置 `N` 开始的 `L` 个参数 |

参数遵循类似 shell 的引号规则，因此 `/review "API compatibility"` 会传入一个带空格的参数。引号只有出现在参数开头时才开始引用。`doesn't` 这样的单词中间的撇号会保留为普通字符，没有配对结束符的引号也会保留。在带引号的参数内，用反斜杠转义同种引号可保留引号本身。例如，`/review "the \"fast\" path"` 会传入 `the "fast" path`；其他反斜杠按原样保留。

<a id="choose-where-it-loads"></a>

## 添加到 Pi \{#add-it-to-pi}

把模板放到个人或项目的提示词目录。按约定发现的目录只加载直接位于该目录中的 `.md` 文件。

设置和 Pi 包可以选择嵌套目录中的 Markdown 文件。包清单还可以用显式路径和 glob 模式缩小搜索范围。相关选项见[设置](./settings.md#resources)和 [Pi 包](./packages.md)。

信任项目后，项目模板才会成为编辑区可用的命令。信任不熟悉的项目前，请先检查模板内容。参阅[项目受信任机制](./security.md#understand-project-trust)。
