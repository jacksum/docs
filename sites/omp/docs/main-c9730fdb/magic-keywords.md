---
title: "魔法关键词"
description: "Oh My Pi 官方仓库文档：魔法关键词。"
---

# 魔法关键词 \{#magic-keywords}

魔法关键词是用户提示词正文中独立出现的单词，可以为该轮次添加归属于用户的隐藏指令。默认启用提示说明注入。编辑器获得焦点时，TUI 会为识别出的单词显示动画，在已发送消息中则显示静态高亮。禁用全局开关会停止编辑器动画和隐藏提示，但会保留静态高亮及拼写豁免。识别出的单词不受 macOS 拼写自动更正和拼写错误下划线影响，因此 `workflowz` 和 `jevify` 绝不会被改写成词典中的单词。

完整清单，包括触发词、渐变、设置文案、所需工具和提示说明，都维护在同一张表 `packages/coding-agent/src/modes/magic-keywords.ts` 中；其他所有界面与功能（设置、提示说明注入、编辑器高亮）均从中派生。

## 关键词 \{#keywords}

| 关键词 | 效果 |
| --- | --- |
| `ultrathink` | 添加细致的多步骤推理提示。启用自动思考时，还会为该轮次选择当前模型支持的最高推理强度，绕过 `providers.autoThinkingMaxEffort`。 |
| `chillax` | 添加简短推理提示。对于支持逐消息推理强度的模型（Anthropic API 上较新的 Claude 模型），还会从下一次请求起，将思考降至模型支持的最低强度；在轮次中途通过引导发送时，它会放宽当前轮次的推理要求，而不使提示词缓存失效。启用自动思考时，它会替换该轮次的分类结果（并优先于 `ultrathink`）；固定的思考档位会持续保持降低后的值，直至再次更改。它绝不会提高推理强度或开启思考。 |
| `orchestrate` | 添加多智能体编排契约：界定完整任务范围，并行委派实质性的独立工作，验证每个阶段，并持续执行直至请求完成。该提示要求启用 `task`，且只列出可用工具的名称。 |
| `workflowz` | 添加确定性的多子代理工作流契约，以持久 `eval` 内核的 `agent()`、`completion()`、句柄、`wait()` 和 `workpool()` 辅助函数为核心。它面向广泛研究、审校、迁移和对抗性覆盖。只有 `eval` 和 `task` 同时启用时，才会注入该提示。 |
| `jevify` | 为 `eval` 内核的 `judge()` 辅助函数添加批量分类契约：加载任何数据之前，先固定问题、评判标准、预筛选规则和升级阈值；在一个批次中评判每个条目，然后只读取评判器标记的内容。它面向提交/PR 审计、日志分流，以及任何需要回答是/否或划分类别的长同类列表。只有启用 `eval` 时，才会注入该提示。 |

可以在提示词正文的任意位置使用关键词：

```text
ultrathink about the failure modes before changing this API
chillax, the fix is a one-line config change


orchestrate the migration described in docs/plan.md

workflowz an adversarial review of the authentication changes

jevify commit a17c3e0 for changes unrelated to the tui refactor
```

## 匹配规则 \{#matching-rules}

匹配规则经过刻意限定，以免源码和路径意外改变智能体行为：

- 使用精确的小写拼写。`Ultrathink`、`Chillax`、`Orchestrate`、`Workflowz` 和 `Jevify` 不会触发。
- 关键词必须是正文中独立的单词。句子标点和引号可以紧邻它，但与字母、数字、下划线、斜杠、反斜杠、连字符、文件扩展名、符号引用或调用语法相连时，不会匹配。例如，`orchestrate,` 会匹配；`orchestrated`、`orchestrate.ts`、`foo::orchestrate` 和 `orchestrate()` 不会匹配。
- 围栏代码块（反引号或波浪号）、行内代码片段、HTML/XML 注释、标签、元素及其内容都会被忽略。
- 同一提示词中所有已启用的关键词，都可以添加各自的提示说明。可见单词仍保留在用户消息中；隐藏提示是归属于用户、但不显示的自定义消息。
- 匹配使用展开后的提示词，在斜杠命令和提示词模板展开之后进行。由智能体发起的合成提示词不会触发这些提示。
- 指令只适用于包含该关键词的轮次。固定思考档位时的 `chillax` 是例外：降低后的档位会持续保留，直至更改。

## 配置 \{#configuration}

打开 `/settings`，使用 **Interaction → Magic Keywords**，或从 shell 更改设置：

```bash
# Disable every magic keyword
omp config set magicKeywords.enabled false

# Disable one keyword while leaving the others enabled
omp config set magicKeywords.ultrathink false
omp config set magicKeywords.chillax false
omp config set magicKeywords.orchestrate false
omp config set magicKeywords.workflow false
omp config set magicKeywords.jevify false
```

全局开关和五个逐关键词开关默认均为 `true`。全局开关控制全部隐藏提示和编辑器动画；逐关键词开关仅控制对应提示（以及 ultrathink 和 chillax 对思考的更改）。静态高亮与拼写豁免仍会保留。`workflowz` 使用设置键 `magicKeywords.workflow`；其提示会根据当前 task 批处理、侦察代理可用性和 Eval 内核工具设置进行调整。运行 `omp config list` 可查看全部设置及其当前值。配置作用域、优先级和项目本地覆盖，参见[设置](./settings.md)。
