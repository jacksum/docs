---
title: "Prewalk"
description: "Oh My Pi v19.1.1 仓库文档：Prewalk。"
---

# Prewalk \{#prewalk}

任务从规划进入实施后，Prewalk 可以把会话从当前模型一次性交接给更快或更便宜的模型。起始模型可以先检查仓库、建立待办清单并着手修改，再由目标模型继续会话。

Prewalk 默认关闭。目标由 `prewalk.into` 指定，默认使用 `@smol` 角色的模型。若要让 OMP 逐项判断任务是否值得交接，见[自动 Prewalk](#auto-prewalk)。

## 启用 Prewalk \{#enable-prewalk}

在全局配置中持久启用 Prewalk：

```bash
omp config set prewalk.enabled true
```

在 `~/.omp/agent/config.yml` 或项目的 `.omp/config.yml` 中，对应的 YAML 如下：

```yaml
prewalk:
   enabled: true
```

`prewalk.into`（默认 `@smol`）设置交接目标。`prewalk.from`（默认 `@default`）设置 `/prewalk restart` 要返回的规划模型。两项都接受模型匹配模式或角色。例如，使用较慢的模型规划，然后交接给默认模型：

```yaml
prewalk:
   from: "@slow"
   into: "@default"
```

配置项只为新会话预备交接，不为恢复或导入的会话预备。显式会话参数可用于这两类会话：

| 参数 | 效果 |
| --- | --- |
| `--prewalk` | 为新会话预备 Prewalk。 |
| `--no-prewalk` | 即使 `prewalk.enabled` 为 `true`，也在启动会话中保持 Prewalk 关闭，且不允许[自动 Prewalk](#auto-prewalk)介入。`/new` 仍遵循配置。 |
| `--prewalk-into <model-or-role>` | 预备 Prewalk，使用指定模型匹配模式或角色代替 `prewalk.into`。 |

例如：

```bash
omp --prewalk
omp --prewalk-into @smol
omp --prewalk-into openai/gpt-5-mini
```

启动时，OMP 按通常的模型角色和模型匹配规则解析目标。它按顺序尝试配置的角色候选项，寻找已启用且已通过身份验证的模型提供方。扩展可以在注册后提供可解析的目标。如果没有可用目标，OMP 会发出警告，不预备交接就启动。

`--no-prewalk` 不能与 `--prewalk` 或 `--prewalk-into` 同用。显式传入 `--prewalk-into @default` 时，OMP 会按 `--model` 覆盖前的默认角色解析目标。

`/new` 按 `prewalk.enabled` 和 `prewalk.into` 启动新一轮交接流程，不继承已经执行的交接或上一轮待办触发条件的状态。启动参数（`--prewalk`、`--no-prewalk`、`--prewalk-into`）只影响启动会话；`/new` 总是按配置执行。启用 Prewalk 时，如果交接后没有重新选择模型或思考档位，新会话会恢复到先前规划所用的模型和档位。如果规划模型已不可用，例如凭据被移除，`/new` 会发出警告并保留当前模型。恢复现有会话不会自动重新预备 Prewalk。

交接后对模型或思考档位的任何更改都算作替换，包括进入和退出计划模式时的切换。自动重试时的回退、回退后的恢复以及上下文提升不算替换；运行 `/new` 时，如果会话已回到交接所用模型及思考档位，仍会恢复规划模型。

如果在交接切换期间选择新模型或思考档位，用户的选择优先。OMP 不会记录该次交接，因此 `/new` 或下一个任务都不会返回规划模型。如果用户在目标模型就绪前完成选择，OMP 会显示 `Prewalk: cancelled …` 并取消切换，会话保持在用户选定的状态。若目标模型已经就绪，例如用户选了思考档位，会话仍使用目标模型及用户所选档位，并照常接收实施检查清单。从自动交接返回时，OMP 也不会覆盖加载规划模型期间做出的选择。

## 交接触发条件 \{#handoff-trigger}

预备 Prewalk 时，OMP 会注入规划提示。启用 `todo` 工具时，任何一次成功的 `todo` 调用都能满足交接的待办前置条件，包括只读的 `view` 操作。未启用 `todo` 工具时，此条件默认满足。

OMP 在收到首个符合条件的 `edit` 或 `write` 结果的助手轮次结束时切换。它先持久化该轮的助手消息和工具结果。和待办前置条件不同，编辑或写入的触发条件不要求结果成功。

其他工具的调用不会触发交接。不改文件的 `write` 调用也不会触发，例如发往 `agent://` 的同级消息、回复，以及写入 `proc://` 的标准输入、模式或终止操作。通过 `bash` 执行的工具命令，只有调度记录把运行归为工作区写入时才计入。LSP 导航或 `<tool> --help` 查询等只读调度不会触发交接，测试运行器或远程命令等执行级调度也不会触发。

切换只发生一次。交接后，Prewalk 清除预备状态和规划提示，并向目标模型发送实施检查清单。它只改变会话的当前模型及可选的思考档位，不改模型角色的分配。交接到同一模型时，仍可改变思考档位。若模型与实际生效的思考配置已经一致，Prewalk 会清除预备状态，不切换。

交接会记录在会话里。恢复会话、使用 `--restore` 恢复中断的工作，或唤醒暂挂的子代理时，都会使用交接后的模型及档位继续，不会返回规划模型。与其他只影响会话的模型选择一样，交接后的重试回退可以替换它。唤醒的子代理如果还在使用交接目标，就不会重新预备 Prewalk。

## 在当前会话中预备交接 \{#arm-from-an-active-session}

在顶层会话中，实时更改 `prewalk.enabled` 也会生效：开启时，如果没有预备的目标，就为 `prewalk.into` 预备交接；关闭时则取消待处理的交接。此项更改不控制子代理的 Prewalk。

无需重启 OMP 即可运行以下斜杠命令：

```text
/prewalk [into]
/prewalk restart [from] [into]
/prewalk off
```

`/prewalk` 预备一次从当前模型到 `into` 的交接。目标可以是任意模型匹配模式或角色，默认为 `prewalk.into`。

`/prewalk off` 取消待处理的交接并清除它的规划引导，不改变当前模型、已保存的配置或已经发出的续接历史。切换进行中运行这条命令，会取消本次切换。已关闭或已经交接后仍可安全运行；命令本身不会切回规划模型，不过下一个任务仍会从[自动交接](#one-task-at-a-time)返回。取消只影响当前会话；配置项启用时，`/new` 会重新预备 Prewalk。此命令还会阻止[自动 Prewalk](#auto-prewalk)重新预备交接，直到运行 `/new`。

交接后，`/prewalk restart` 会立即将会话切回 `from`，并重新预备交接给 `into`。未传入的参数使用 `prewalk.from` 和 `prewalk.into`。这些参数只用于本次命令，不会保存。模型选择器在命令执行时才解析，因此角色重新分配会生效，两个角色的持久配置都不会改变。

如果 Prewalk 已预备，`/prewalk` 会保留现有目标。`/prewalk restart` 同样保留目标一致的预备状态；如果现有目标与请求的 `into` 不同，命令会在改变当前模型前被拒绝。要在启动时选择其他目标，使用 `--prewalk-into`。

## 自动 Prewalk \{#auto-prewalk}

`prewalk.enabled` 和 `/prewalk` 会无条件预备一次性交接。自动 Prewalk 则逐项询问 OMP 的原生判定器任务是否适合交接，适合时从当前模型预备同样的交接。判定器只检查任务是否适合 Prewalk，不给难度分级，也不负责通用模型路由；它不会另选规划模型。

```yaml
prewalk:
   enabled: false
   auto: on
   autoTarget: "@smol"
```

`prewalk.autoTarget`（默认 `@smol`）接受模型匹配模式或角色，按通常的角色和模型匹配规则解析，包括验证凭据。

| `prewalk.auto` | 行为 |
| --- | --- |
| `off`（默认） | 不分类。如果之前有过自动交接，下一个任务仍会从那个交接目标返回。 |
| `suggest` | 为每项新任务分类，只报告判定，不预备交接。如果之前有过自动交接，下一个任务仍会返回。 |
| `on` | 为每项新任务分类。当判定器确信任务适合，且目标有可用凭据时，预备从当前模型交接给目标；否则保持不变。 |

先运行一段时间的 `suggest`，观察它如何判定提示词，再设为 `auto: on`。要用能力更强的模型规划，把它设为当前（`@default`）模型；自动 Prewalk 会从当前模型发起交接。

`prewalk.enabled` 的含义不变：无条件启用 Prewalk，独立于 `prewalk.auto`。

### 前置条件 \{#requirements}

自动 Prewalk 要求 `judge` 模型角色优先解析到原生判定后端，条件与 `find.enabled: auto` 相同。它复用已有的判定角色提供方支持，包括 TypeSafe `jev`、OpenRouter、OpenAI Decisions 和 Workers AI Clef。它依赖已校准的概率，绝不会调用通过提示词驱动的端侧或聊天判定器，即使判定角色缓存早于登录或发现状态的变更。没有原生判定器时，不分类，也不报告。

### 判定内容 \{#what-it-decides}

判定器按任务中需要较多推理资源的阶段分类，而非按难度或规模分类：

| 路由 | 含义 | 典型任务 |
| --- | --- | --- |
| `prewalk` | 难点在前期推理；方案确定后，实施和验证的范围就明确了。 | 先追踪陌生子系统，再做局部变更；先读几份相互关联的文件，再实现明确的设计；把缺陷诊断到具体修复方案；迁移的难点在于确定转换方式和影响范围。 |
| `primary` | 实施、调试或验证仍需要较强推理能力，因此首次编辑就交接为时过早。 | 尚未解决的竞态或不变量；细微的生命周期变更；初次排查后仍无法确定原因的缺陷；高风险或算法难度较高的变更。 |
| `direct` | 前期没有值得单独交接的阶段。 | 解释和只读问题；简单、机械或规格完整的编辑；极小的局部修复。 |

只凭工作量或难度，任务都不会成为 Prewalk 候选。错交接的代价高于漏交接：判定器在 `prewalk` 与 `primary` 之间犹豫时应选 `primary`，任务很小时应选 `direct`。只有 `prewalk` 得分最高且概率至少为 0.70，OMP 才会预备交接。阈值固定；即使 `prewalk` 排第一，低于阈值也判为不交接。

`suggest` 为每项判定后的任务报告一行：

```text
Auto-prewalk: prewalk 0.84
Auto-prewalk: primary (prewalk 0.18)
Auto-prewalk: direct (prewalk 0.06)
Auto-prewalk: prewalk 0.55 (below threshold)
```

使用 `on` 时，确信适合交接的判定会显示常规的 `Prewalk: armed for …` 提示；其他判定只记入日志。规划提示随任务的第一个请求发送；现有的交接逻辑负责模型切换，待办前置条件及首次 `edit`/`write` 的触发条件均保持不变。与通过配置启用的 Prewalk 一样，已预备交接的任务跳过 `todo.eager` 提醒，因为规划提示负责建立待办清单。

### 每次只处理一项任务 \{#one-task-at-a-time}

自动交接只属于预备它的任务。下一项任务开始时，OMP 会先回到上个任务规划时使用的模型和思考档位，再判定新任务，确保 `primary` 任务不会继续留在上个交接目标。`/new` 同样会返回。无论此时 `prewalk.auto` 的设置如何，包括运行过 `/prewalk off`，都仍会返回。如果上一项任务预备了自动交接但未使用，OMP 会在下一项任务开始时丢弃该状态，并独立判定新任务。

交接后显式选择模型或思考档位会接管会话：会话保持在用户选定的状态。这类选择也会在尚未切换时取消待处理的自动交接，包括进入和退出计划模式时的切换、模型预设，以及扩展或 ACP 做出的选择。由 `/prewalk`、`--prewalk` 或 `prewalk.enabled` 预备的交接会保持待执行状态，自动 Prewalk 也不会从这些方式触发的交接返回。

### 会被分类的输入 \{#what-is-classified}

只有顶层会话中新产生的用户任务才会分类：手动输入的提示词、用户调用的 `/skill:` 提示词，以及送达时的排队后续消息。引导只修改已在运行的任务，因此从不分类。确认性回复（例如 `ok` 或 `thanks`）、合成续接轮次、归属于智能体的消息、子代理、计划模式，以及已经预备 Prewalk 的任务都跳过。子代理有独立的逐代理控制，见[子代理 Prewalk](#subagent-prewalk)。

判定器与其他提示词准备步骤（记忆召回、钩子、自动思考）并行运行，结果在发送请求前一刻应用。因此，只有它是最慢的准备步骤时才会增加延迟。

无法仅凭 `do that` 或 `continue` 之类的后续消息做判定。因此，判定器还会看到上一条实质性用户请求，以及智能体的上一次回复。两者与其他小模型输入一样会被截断。当前请求仍是准绳，上下文只用于解析它所指的内容。

### 手动控制优先 \{#manual-controls-win}

不适合、直接处理、低于阈值的判定，或分类器错误，都不会改变模型、思考档位或 Prewalk 的状态。

不会替换、重定向或重新分类通过 `/prewalk`、`prewalk.enabled` 或 `--prewalk` 预备的交接。`/prewalk off` 和 `--no-prewalk` 都会阻止自动 Prewalk 介入会话（`--no-prewalk` 只影响启动会话），直到运行 `/new`，两者都不会切换模型。显式调用 `/prewalk` 或 `/prewalk restart` 会接管待处理的自动交接，接下来按手动交接处理。

### 失败时的行为 \{#failure-behavior}

自动 Prewalk 是一项优化，失败时放行。没有原生判定器、判定出错或答案格式错误、超过 4 秒、被中止，或者判定期间提示词被替换，任务都会按未启用自动 Prewalk 的方式运行。无效的概率、与概率不一致的获胜路由或无效的置信度都会使答案被拒绝。判定失败只记入日志，不显示给用户；目标不可用时则显示 `Auto-prewalk not armed: target …` 警告。判定会以 `auto-prewalk` 为用途记录为模型用量。

## 子代理 Prewalk \{#subagent-prewalk}

使用 Task 的子代理有独立的 Prewalk 控制：智能体的前置元数据、`task.prewalk` 和逐智能体的 `task.agentPrewalk` 覆盖项。优先级和目标选择方法见[Task 智能体发现](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/task-agent-discovery.md)。

这些控制项会无条件预备交接。`task.agentPrewalkAuto` 则让判定器逐次根据分派的任务决定：

```yaml
task:
   agentPrewalkAuto:
      task: "on"
      builder: "openai/gpt-5-mini"
```

每个条目将一个智能体名映射到 `"on"`（交接给 `prewalk.autoTarget`）、`"off"`、模型匹配模式或角色。缺少条目时按 `"off"` 处理。

创建子代理时，根据分派的任务文本判定一次。它与自动 Prewalk 使用相同的原生判定器、路由和固定的 0.70 阈值，见[判定内容](#what-it-decides)和[前置条件](#requirements)。预备交接后，子代理按无条件子代理 Prewalk 的规则交接；否则不使用 Prewalk。

由智能体前置元数据、`task.prewalk` 或 `task.agentPrewalk` 设置的无条件交接始终优先，不进行判定。按调用指定模型和限制工具（计划模式）的子代理不会判定。目标不可用，或与起始模型和推理强度都相同时，也不会判定。

子代理的自动 Prewalk 失败时放行：没有原生判定器、判定出错、超时，或分派的任务信号不足，都会让子代理不使用 Prewalk。它独立于 `prewalk.auto`。保持运行的子代理会沿用创建时的判定来处理后续任务。子代理会话启动后，判定以 `auto-prewalk` 为用途记录在该子代理的模型用量中。
