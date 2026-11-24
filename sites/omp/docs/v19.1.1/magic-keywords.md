---
title: "触发关键词"
description: "Oh My Pi v19.1.1 仓库文档：触发关键词。"
---

# 触发关键词 \{#magic-keywords}

触发关键词是用户提示词正文中独立出现的词，可以给当前轮次添加隐藏指令。这些指令归属于用户。默认启用提示注入功能。终端界面在编辑器获得焦点时对识别到的关键词播放动画，并在已发送的消息中静态高亮这些词。关闭总开关后，编辑器动画和隐藏提示会停止，静态高亮与拼写检查豁免仍然保留。macOS 不会自动纠正或为识别到的关键词加拼写错误下划线，因此 `workflowz` 和 `jevify` 不会被改写成词典中的单词。

触发词、渐变色、设置文案、所需工具和提示都集中定义在 `packages/coding-agent/src/modes/magic-keywords.ts` 的一张表中。设置、提示注入和编辑器高亮均以该表为准。

## 关键词 \{#keywords}

| 关键词 | 效果 |
| --- | --- |
| `ultrathink` | 添加一条要求仔细进行多步推理的提示。启用自动思考时，还会让当前轮次使用当前模型支持的最高推理强度，绕过 `providers.autoThinkingMaxEffort`。 |
| `chillax` | 添加一条要求简短推理的提示。对支持逐消息设定推理强度的模型（Anthropic API 上较新的 Claude 模型），它还会从下一个请求起将思考强度降到模型支持的最低值。在轮次中途引导时，它会降低正在进行的轮次的强度，不使提示词缓存失效。自动思考模式下，它会替换该轮的强度分类，优先于 `ultrathink`。如果使用固定档位，降低后的档位会保留，直到再次修改。它不会提高强度或开启思考。 |
| `orchestrate` | 添加多智能体协作约定：先确定完整任务范围，将可以独立进行的大块工作并行委派，逐阶段核验，直至完成请求。只有启用 `task` 才会注入这条提示，并且提示只提及可用的工具。 |
| `workflowz` | 添加确定性的多子代理工作流约定，以持久化 `eval` 内核提供的 `agent()`、`completion()`、句柄、`wait()` 和 `workpool()` 为核心。适用于大范围调研、审查、迁移和对抗性检查。只有 `eval` 和 `task` 都启用时才注入提示。 |
| `jevify` | 为 `eval` 内核的 `judge()` 辅助函数添加批量分类约定：在加载数据前固定问题、判定标准、预筛条件和升级阈值；在同一批次中判定所有条目，然后只读取被标记的条目。适用于提交或 PR 审计、日志分诊，以及任何可用是非问题或类别归纳的大量同类条目。只有启用 `eval` 时才注入提示。 |

在提示词正文中的任意位置使用关键词：

```text
ultrathink about the failure modes before changing this API
chillax, the fix is a one-line config change


orchestrate the migration described in docs/plan.md

workflowz an adversarial review of the authentication changes

jevify commit a17c3e0 for changes unrelated to the tui refactor
```

## 匹配规则 \{#matching-rules}

匹配规则旨在避免源代码及路径意外改变智能体的行为：

- 使用完全一致的小写拼写。`Ultrathink`、`Chillax`、`Orchestrate`、`Workflowz` 和 `Jevify` 都不会触发。
- 关键词必须是正文中的独立词。句子标点和引号可以与它相邻，但与字母、数字、下划线、斜杠、反斜杠、连字符、文件扩展名、符号引用或调用语法连用时不匹配。例如，`orchestrate,` 会匹配，`orchestrated`、`orchestrate.ts`、`foo::orchestrate` 和 `orchestrate()` 都不会匹配。
- 带围栏的代码块（反引号或波浪号）、行内代码、HTML/XML 注释、标签与元素及其内容都会被忽略。
- 同一条提示词中的每个已启用关键词都可以添加自己的提示。用户消息会保留可见的关键词；隐藏提示是归属于用户且不显示的自定义消息。
- 匹配使用展开后的提示词，在斜杠命令和提示词模板展开后执行。由智能体发起的合成提示词不会触发提示。
- 指令仅适用于包含关键词的轮次。`chillax` 用在固定思考档位时例外：降低后的档位会一直保留，直到被更改。

## 配置 \{#configuration}

打开 `/settings`，选择 **Interaction → Magic Keywords**，或通过 shell 修改设置：

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

总开关及五个关键词各自的开关默认均为 `true`。总开关控制所有隐藏提示与编辑器动画。单个关键词开关只控制该关键词的提示（以及 ultrathink 和 chillax 对思考强度的调整）。静态高亮和拼写检查豁免仍然保留。`workflowz` 使用配置键 `magicKeywords.workflow`。它的提示会根据当前的任务批处理设置、侦察代理可用性，以及 Eval 内核的工具设置进行调整。运行 `omp config list` 查看所有设置及其当前值。配置作用域、优先级与项目级覆盖见[设置](./settings.md)。
