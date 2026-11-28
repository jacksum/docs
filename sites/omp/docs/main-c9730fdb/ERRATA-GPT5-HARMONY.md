---
title: "勘误：GPT-5 Harmony 标头泄漏"
description: "Oh My Pi 官方仓库文档：勘误：GPT-5 Harmony 标头泄漏。"
---

# 勘误：GPT-5 Harmony 标头泄漏 \{#errata--gpt-5-harmony-header-leakage}

这是一份历史研究笔记，不是当前运行时约定。以下统计数据来自文中指定的本地统计数据库快照，而非已纳入版本控制的测试或运行时代码。

## 当前运行时缓解措施 \{#current-runtime-mitigation}

当前行为实现在 `packages/ai/src/utils/harmony-leak.ts` 和 `packages/agent/src/agent-loop.ts` 中：

- `isHarmonyDialectModel()` 目前以 `model.identity.class === "gpt-oss"` 作为请求转义的门控条件。OpenAI Responses/Codex 转换路径会在文本、工具结果和序列化工具参数的传输副本中，转义保留的 `<|...|>` 写法；持久化消息保持不变。这个门控目前不会仅因模型 ID 而将 GPT-5 包括在内。
- 响应泄漏检测以 `model.compat.harmonyLeakMitigation === true` 为门控条件。`packages/catalog/src/compat/rules/providers/openai-codex.kdl` 为 Codex 模型启用这一兼容性维度；检测器本身不再检查提供方 ID 或固定的模型 ID 列表。
- 单独出现的 `to=functions.NAME` 标记不足以触发检测。检测还需要一个伴随信号（相邻通道词、异常标记、文字系统不匹配、级联、伪造结果框架或可信的尾随解析边界）；围栏代码块中的示例会被忽略。
- 智能体循环会扫描最终确定的可见文本和思考。命中时会丢弃部分响应，最多重试两次，然后报错升级处理。审计回调会收到操作与信号元数据，以及被移除内容的哈希和已脱敏预览。
- 工具参数检测有意保持不生效，除非调用方提供结构有效的工具解析结束处的字符串偏移量。主智能体循环目前不提供该边界，以免因合法工具数据讨论协议而误中止。
- 恢复辅助函数接受有边界的自由格式 `eval` 输入，以及以 `@` 开头的旧版 `edit` 形状，会在受污染行截断并追加 `*** Abort`。该 `edit` 门控不匹配当前原生 hashline `[PATH#TAG]` 封装（`packages/coding-agent/src/edit/index.ts`、`packages/coding-agent/src/tools/hashline-format.ts`）；它不能证明当前 hashline 调用能够恢复。Apply-patch 封装和 JSON 模式 edit 输入也无法通过该辅助函数的资格检查，在提供有边界检测时会使用中止与重试。

只有设置 `OMP_HARMONY_DEBUG=1` 时，审计事件才会包含被移除的原始内容；普通审计事件保留哈希和已脱敏预览。

下方语料表描述的是该快照中存在的历史输入格式，并非当前 `edit` 工具接受的语法列表。

## 1. 问题 \{#1-the-problem}

OpenAI 在 Harmony 聊天协议中按以下方式封装工具调用：

```
<|start|>assistant<|channel|>commentary to=functions.<NAME><|message|>{ARGS}<|call|>
```

`<|channel|>commentary to=functions.NAME` 是**路由标头**，即由运行时消费以派发调用的控制标记。正常运行时，这些标记绝不会作为内容出现；运行时会将其剥离。

缺陷在于：gpt-5 模型偶尔会在 **`{ARGS}` 内部将这些路由标记的纯文本影子作为普通内容**输出，即相同字符但没有 `<|…|>` 括号，并继续生成更多伪路由结构（通道名称、正文标记、多语言垃圾文本、伪造工具结果框架）。污染存在于可见工具参数内部，并被当作预期内容派发给工具。

**关键细节。** 真正的 `<|start|>` / `<|channel|>` / `<|message|>` / `<|call|>` 特殊标记几乎从不出现在工具参数中。泄漏的是没有括号的写法，即 `analysis to=functions.X
code …`，因为 OpenAI 会应用 logit 掩码，在参数区域内抑制控制标记 ID。本应分配给这些特殊标记的概率质量，转而分配给模型同样学过的无括号纯文本表示。这使泄漏在结构上对路由解析器不可见，并原样进入工具输入。

工具参数中的表现（真实语料示例）：

```
~      add_function(iso, ctx, ns, "installSystemChangeObserver",
        os_install_system_change_observer);】【"】【analysis to=functions.edit
        code above เงินไทยฟรีuser to=functions.edit code …
```

开头的代码是真实且符合预期的。从第一个非拉丁标记开始，到下一个干净的结构边界为止，所有内容都是损坏内容。

---

## 2. 观测统计与故障模式 \{#2-observed-statistics--failure-modes}

来源：`~/.omp/stats.db`（`ss_tool_calls`、`ss_assistant_msgs`），截至 2026-05-10。共扫描 105 万次工具调用。

### 2.1 发生率 \{#21-rate}

| 模型 | 工具参数中的泄漏次数 | 调用次数 | 每百万次 |
| --- | ---: | ---: | ---: |
| gpt-5.4 | 37 | 226,957 | 163 |
| gpt-5.3-codex | 17 | 112,243 | 151 |
| gpt-5.5 | 2 | 80,750 | 25 |
| gpt-5.2-codex | 0 | - | - |

另有 15 次命中出现在助手可见文本或思考内容中。

### 2.2 工具分布 \{#22-tool-distribution}

| 工具 | 命中次数 |
| --- | ---: |
| `edit` | 38 |
| `eval` | 11 |
| `report_tool_issue` | 3 |
| `grep`/`read`/`search`/`yield` | 各 1 次 |

集中出现在采用自由格式（非 JSON 模式）参数格式的工具中。

### 2.3 泄漏形状（确定性） \{#23-leak-shape-deterministic}

```
LEAK         ::= JUNK_PREFIX MARKER CHANNEL_BODY (LEAK)?
MARKER       ::= "to=functions." TOOL_NAME
CHANNEL_BODY ::= " code " (SPAM | reasoning_prose | fake_tool_output)*
JUNK_PREFIX  ::= (GLITCH_TOKEN | CHANNEL_WORD | NON_LATIN_RUN | "}" | "】【")+
```

**级联很常见。** 在 71 条受污染记录的 96 次标记出现中，39 条包含 ≥2 个标记，7 条包含 ≥3 个标记。模型会接连输出多个伪造的 `to=functions.X code …` 块，中间往往夹着伪造的 `code_output\nCell N:\n…` 框架。一旦纯文本框架进入残差流，前缀现在就_看起来像_一个新工具封装的起点，因此续写的宏观先验会持续倾向于生成更多框架，形成自我放大。

### 2.4 异常标记 \{#24-glitch-tokens}

`o200k_base` 中的一些单标记标识符，由于在后训练中代表性不足，其嵌入似乎接近初始化状态。自然语料中紧邻标记之前的 ASCII 残留如下：

| 表层字符串 | 单标记 | 标记 ID | 语料中的命中次数 |
| --- | :---: | ---: | ---: |
| `Japgolly` | ✅ | 199,745 | 1 |
| `Jsii` | ✅ | 114,318 | （`Jsii_commentary` 的子标记） |
| `Jsii_commentary` | -（3 个标记） | - | 2 |
| `changedFiles` | -（2 个标记） | - | 8 |
| `RTLU` | -（2 个标记） | - | 3 |

`Japgolly` 位于词表最后的 0.13%，属于与 2023 年 GPT-2 词表中产生 `SolidGoldMagikarp` 相同的一类 GitHub 语料残留（Rumbelow 与 Watkins）。`SolidGoldMagikarp` 本身在 `o200k_base` 中会被切分成 5 个标记：那个特定标记已被移除，但这一类别并未消失。

对于多标记条目，语料层面的特征是表层字符串；底层的异常触发器是其中的一个子标记（例如 `Jsii_commentary` 内的 `Jsii`）。检测器列表（`G` 信号）按表层字符串匹配。

在互不相关的会话中表现稳定，被视为高精度检测信号。

### 2.5 通道词泄漏 \{#25-channel-word-leakage}

`analysis`（5 次）、`assistant`（5 次）、`commentary`（3 次）、`user`（1 次）出现在紧邻 `to=` 之前的位置。始终是裸词，从未出现 `<|channel|>analysis` 或任何其他带括号的形式。这与第 1 节一致：括号被掩蔽，词本身则没有。

### 2.6 非拉丁垃圾文本残留 \{#26-non-latin-spam-residue}

96 次标记命中按文字系统分布如下：中日韩文字 40 次、西里尔字母 12 次、泰卢固文/卡纳达文/马拉雅拉姆文 18 次、泰文 8 次、格鲁吉亚文 7 次、亚美尼亚文 7 次、阿拉伯文 1 次。反复出现的片段包括中文赌博 SEO（`大发时时彩`、`天天中彩票`）、格鲁吉亚语/阿布哈兹语垃圾内容，以及泰语赌场垃圾信息，都是众所周知的低质量抓取残留。

这种文字系统分布与受控复现（第 7.3 节）中观察到的相同，且与提示的自然语言无关。

### 2.7 `edit` 工具的故障模式细分 \{#27-failure-mode-breakdown-for-the-edit-tool}

语料中有两种 `edit` 工具变体：

| 变体 | 调用次数 | 恢复 |
| --- | ---: | --- |
| Patch-DSL（`[PATH#TAG]`/锚点/`SWAP DEL INS` 操作） | 27 | **可恢复**，通过截断操作（第 3.3 节） |
| JSON 模式（`{path,edits:[…]}`） | 11 | **不可恢复**，污染被转义在 JSON 字符串_内部_，解析器能正常接受，内容会被原样写入源文件 |

具体到 Patch-DSL 泄漏：

- 20/27 个案例：污染出现在输入最后一行，后面没有内容。
- 7/27 个案例：污染出现在输入中间；后续内容属于以下情况之一：重复重放先前的文件或锚点、原本属于_另一次_工具调用的内容（模型在行内开始了下一次调用），或纯粹的幻觉。污染之后的内容绝不可信。

### 2.8 机制（已确认） \{#28-mechanism-confirmed}

**空嵌入异常标记导致先验坍缩，落入控制标记被掩蔽的吸引域，其概率质量重新分配到 Harmony 协议的纯文本影子上。**

逐步说明：

1. 模型正处于 Harmony 工具调用的 `{ARGS}` 中间。运行时应用 logit 掩码，在参数区域内抑制结构性控制标记（`<|channel|>`、`<|message|>`、`<|call|>`、`<|start|>`、`<|end|>`）。没有这个掩码，正常生成会不断幻觉出封装结束符；有了它，这些标记 ID 在参数中的 logit 为 `-∞`。
2. 采样到了异常标记 `g`。从构造上看，`g` 曾存在于 BPE 合并语料中，但几乎没有出现在 LM/RL 训练中，因此其**输入嵌入 `e_g` 约等于范数较小的近初始化噪声**。
3. 在位置 t+1，残差更新 `h_{t+1} ≈ LN(h_t + e_g + Attn +
MLP)` 由源于前缀的项主导；刚输出标记的信号实际上缺失了。生成多样性通常来自 `e_x` 将残差引导到不同子区域，但这里这一作用被剥离了。
4. 因此，下一标记分布坍缩为**去掉局部条件后的前缀续写条件先验**。在工具调用的 rollout 上下文中，该先验高度集中于 Harmony 框架（控制标记加路由标记），因为 RL 训练的正是这些内容。
5. 掩码将控制标记 ID 对应的概率置零。概率质量重新分配到**次优续写**：同一协议的无括号表层写法（`analysis`、`commentary`、` to=functions.X`、`code`）。这种写法没有被掩蔽，因为这些字符都是普通标记。
6. 一旦几个纯文本框架标记进入残差流，前缀现在就类似于新的封装起点。宏观先验会持续倾向于生成更多框架。于是出现级联（第 2.3 节）。
7. 标记后的多语言垃圾文本也是同一种先验坍缩续写，来自异常标记的训练邻域（往往是 ESL/自动生成的多语言网页垃圾，正是第 2.6 节中的抓取残留）。

**语料数据要求解释、但只有实验才解释清楚的两个推论：**

- **括号从不出现**（第 1 节、第 2.5 节）。正是掩码让泄漏落入纯文本，而不是成为真正的封装结束符。
- **反直觉的语法依赖性**（第 7.4 节）。在最接近 OpenAI 训练分布的格式中，泄漏_更严重_。分布外的自定义语法会抑制宏观先验吸引域；官方的 `*** Begin Patch` 格式是最强的坍缩目标。

2023 年的 SolidGoldMagikarp 论文记录了机制 (1)+(2)+(4)。新增的部分是 (5)：当约束解码掩蔽了自然坍缩目标时，经由未掩蔽的纯文本影子转移的概率质量，会成为一个在结构上不可见的外泄通道。
