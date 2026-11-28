---
title: "顾问、WATCHDOG.md 和 WATCHDOG.yml"
description: "Oh My Pi 官方仓库文档：顾问、WATCHDOG.md 和 WATCHDOG.yml。"
---

# 顾问、WATCHDOG.md 和 WATCHDOG.yml \{#advisor-watchdogmd-and-watchdogyml}

顾问子系统为会话附加一个或多个可选的审查模型。每个顾问都会审查主智能体的会话记录更新，可使用自己的工具检查工作区，并将简明建议注入主会话。

顾问不会批准操作，也不会直接修改主会话状态。其默认调查工具集为 `read`、`grep` 和 `glob`，如果当前记忆后端提供 `recall`，还会包含它，但 `WATCHDOG.yml` 名单条目可授予任何内置工具，包括 `edit`、`write`、`bash` 和 `eval` 等可修改状态的工具。这些工具在隔离的顾问 `ToolSession` 中运行，但遵循会话的正常审批模式和各工具策略；仅在顾问模型和工作区可信时授予这些工具（参见[工具与隔离](#tools-and-isolation)）。

## 实现文件 \{#implementation-files}

- [`src/advisor/runtime.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/runtime.ts)
- [`src/advisor/advise-tool.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/advise-tool.ts)
- [`src/advisor/emission-guard.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/emission-guard.ts)
- [`src/advisor/watchdog.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/watchdog.ts)
- [`src/advisor/config.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/config.ts)
- [`src/advisor/transcript-recorder.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/transcript-recorder.ts)
- [`src/prompts/advisor/system.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/advisor/system.md)
- [`src/prompts/advisor/advise-tool.md`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/prompts/advisor/advise-tool.md)
- [`src/session/session-advisors.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-advisors.ts)
- [`src/session/agent-session.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/agent-session.ts)
- [`src/slash-commands/builtin-registry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-registry.ts)
- [`src/advisor/settings.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/advisor/settings.ts)：`advisor.*` 设置定义

---

## 启用顾问 \{#enabling-the-advisor}

此子系统要求 `advisor.enabled: true`。RPC 和 ACP 宿主为 `advisor.*` 使用协议默认值，而不是继承本地交互式偏好：除非该宿主显式选择启用，否则顾问默认禁用。

模型选择取决于名单：

- 未发现任何 `WATCHDOG.yml` 顾问条目时，OMP 创建旧版/默认顾问，并解析 `advisor` 角色。
- 存在名单时，每个启用条目若有显式 `model`，就使用该模型，否则使用 `advisor` 角色。无法解析的条目会报告为 `no_model`，但不会阻止其他条目运行。
- `advisors[].enabled: false` 会使条目以暂停状态保持可见，但不构建其运行时。

示例：

```yaml
modelRoles:
   advisor: anthropic/claude-sonnet-4-5:medium

advisor:
   enabled: true
```

模型选择器使用常规模型角色/模型解析，包括带提供方前缀的 ID、规范 ID、回退列表和可选的思考后缀。

已配置的 `modelRoles.advisor` 优先，若其无效，不会静默回退。未设置时，顾问角色解析先使用已配置的 `slow` 角色，然后使用内置的慢速优先级链；它不会简单继承主模型。

没有推理强度后缀时，顾问请求 `medium`，并限制在模型支持的范围内。`:auto` 会在审查边界处跟随主智能体已解析的推理强度，而不是运行独立的顾问分类器。不支持可控推理强度的模型继承其正常推理行为。

### 备用审查模型 \{#backup-reviewer}

顾问模型失败（服务中断、速率限制、端点不可达）时，顾问会切换到其 `retry.fallbackChains` 条目中的下一个模型，并重试同一次审查。使用 `advisor` 角色或顾问的精确模型选择器作为该链的键：

```yaml
modelRoles:
   advisor: openai/gpt-5.5:medium

retry:
   fallbackChains:
      advisor:
         - anthropic/claude-sonnet-4-5:medium
         - google-vertex/gemini-3-pro
```

它遵循与主智能体回退相同的规则：`retry.enabled` 和 `retry.modelFallback` 必须开启；仍处于冷却期、没有凭据或与原生顾问历史不兼容的候选项会被跳过；`retry.fallbackRevertPolicy: cooldown-expiry` 会在冷却结束后让顾问返回其主模型。切换模型前会先尝试轮换凭据，对于失败的审查，每个同级账号最多尝试一次。短时使用量限制阻塞可以改为在 `retry.maxDelayMs` 和重试预算范围内等待解除；较长或预算已耗尽的阻塞会暂停顾问。

顾问主模型的分类器拒绝（例如 Anthropic 的 `Refusal (cyber)`）被视为对所审查内容的判断，而非模型失败：它不会让该模型进入冷却，并会将顾问固定在回退模型上。固定状态会持续到上下文压缩（会话的或顾问自身的）、交接或新对话替换了该内容；之后的下一次审查会按照 `retry.fallbackRevertPolicy` 重新尝试主模型。拒绝的回退模型会按常规冷却规则被跳过，且不会触发固定，因此仅因其他原因失败的主模型仍会在冷却结束后返回。

`tier.advisor` 控制所有顾问的服务层级。默认值为 `none`（标准处理）；`inherit` 跟随主智能体实时的按模型家族划分的层级，包括 `/fast` 更改。具体值（`auto`、`default`、`flex`、`scale`、`priority`、`ultrafast`）仅在顾问模型的提供方家族支持时应用。

`retry.fallbackOn` 也决定哪些顾问失败可切换模型：在 `usage-limit` 下，只有使用量限制会遍历该链，其他任何失败都会留在顾问自己的模型上，按常规重试后才丢弃该次审查；在 `except-usage-limit` 下，使用量限制会触发凭据轮换、等待或暂停顾问，而不是切换模型。

### 默认顾问设置 \{#default-advisor-settings}

没有 `WATCHDOG.yml` 名单时，默认顾问使用 Model 选项卡中的以下设置：

- `advisor.reviewMode`：审查节奏：`turn`（默认）审查每个主智能体轮次；`agent-end` 仅审查最终交回控制权时的输出。
- `advisor.reviewInterval`：每第 N 次符合条件的更新执行审查（默认 `1`）。跳过的更新会按主智能体看到的原样捕获，并随下一次计划审查发送。
- `advisor.maxNotesPerUpdate`：每次顾问更新接受的非阻断建议条数上限（默认 `4`，范围 1-32）。阻断建议不受此限。
- `advisor.syncBacklog`：追赶策略（默认 `off`）；数值阈值有界，而 `strict` 会等待，且不受实际经过时间上限约束。

对这些设置的编辑会在下一个主智能体边界应用于正在运行的顾问，无需重建。

名单条目自行设置节奏：省略 `reviewMode` 表示 `turn`，省略 `reviewInterval` 表示 `1`，不受上述设置影响。省略 `syncBacklog` 时继承 `advisor.syncBacklog`，省略 `maxNotesPerUpdate` 时先继承共享的 `WATCHDOG.yml` 顶层值，然后是 `advisor.maxNotesPerUpdate`。显式 `syncBacklog: off` 会覆盖全局的 `strict`。

重建顾问（保存 `/advisor configure`、模型角色或上下文更改）会保留被审查节奏跳过的更新：每个重建后的顾问都会在下一次计划审查时接收它们。

### 无界面运行 \{#headless-runs}

使用 `--advisor` 可为一个打印模式进程启用顾问，而不持久化
`advisor.enabled`：

```sh
omp -p --advisor "Review this task."
```

主提示运行期间，符合条件的顾问建议可以引导该次运行。最终提示结束后，打印模式会保留较晚到达的顾问建议，而不启动隐藏的主智能体轮次；发送被审查节奏跳过的更新（因此 `agent-end` 或间隔审查模型仍会审查最终答案），然后等待最终审查最多十分钟，再释放会话。该等待包含失败顾问的重试和[备用审查模型](#backup-reviewer)切换，因此在顾问模型上失败的审查会在其回退模型上完成，而不会被放弃。错误退出使用 30 秒的排空预算，让失败的自动化能够终止。对于追赶策略为 `strict` 的顾问，等待不受这两种预算限制；中止、停止和配额暂停仍会结束其等待。如果预算到期，或顾问彻底停止（被停止或因配额暂停），OMP 会记录释放过程将放弃的审查；已完成的审查会保留其会话记录以及 token/费用用量。

斜杠命令：

| 命令 | 效果 |
| --- | --- |
| `/advisor` | 为此会话切换顾问子系统（会话级覆盖；不更改持久化的 `advisor.enabled`）。 |
| `/advisor on` | 为此会话启用已配置/默认的顾问运行时。仅限会话作用域；不持久化到配置。 |
| `/advisor off` | 为此会话禁用顾问子系统并停止其运行时。仅限会话作用域；不持久化到配置。 |
| `/advisor status` | 显示每个顾问的运行时状态、模型、上下文用量、token 用量和费用。 |
| `/advisor dump` | 在 TUI 中，将精简会话记录（有名单时为所有活动顾问）复制到剪贴板；其他宿主返回文本。 |
| `/advisor dump raw` | 复制/返回完整转储，包括系统提示、工具、思考和调用。 |
| `/advisor configure` | 打开用于项目级或用户级 `WATCHDOG.yml` 的交互式 TUI 编辑器。非 TUI 命令宿主会报告该编辑器仅适用于 TUI。 |

要加载在编辑器外做出的更改，先运行 `/advisor off`，再运行 `/advisor on`。启用时会从磁盘重新加载 `WATCHDOG.yml` 名单及其导入的指令文件。

如果子系统已启用，但旧版/默认模型和名单模型都无法解析，状态会将已配置顾问报告为不活动/`no_model`。

启动期间处于 `no_model` 的条目，会在后台模型发现结束后重试，因此较晚进入目录的模型也能启动，无需手动切换。

## 顾问能看到什么 \{#what-the-advisor-sees}

每次主智能体更新时，`AdvisorRuntime` 只接收自上次更新以来新增的会话记录增量。增量会连同推理、工具意图、被监视角色标记和展开的主智能体约束上下文一起呈现，因此顾问既能审查助手推理，也能审查用户可见文本、工具调用和工具结果。发往提供方的消息以及工具参数/结果，在到达顾问模型前都会经过会话的秘密信息混淆器处理。

大多数隐藏的 `custom` 消息在增量中会折叠成一行摘要。主智能体注入的约束上下文（`plan-mode-context` 和 `plan-mode-reference`）则会在经过 XML 转义的 `<primary-context kind="…">` 包装中逐字呈现，重复副本会被去重。顾问还会在 `<project-context>` 系统提示块中接收主智能体已发现的项目上下文文件（`AGENTS.md` 和相关常设指令），以及当前记忆后端的共享开发者指令。这些指令不会授予工具；显式工具列表保持不变。如果会话 cwd 位于 Git 外，且恰好只有一个直接子仓库，还会有一个额外的 watchdog 块告知顾问哪个子目录是当前项目。

已注入主会话记录的顾问消息会在呈现下一次增量前被过滤掉。这可防止顾问递归审查自己的建议。

主会话记录被重写时，会重置顾问运行时：

- 上下文压缩
- 会话切换/恢复
- 分支/派生新会话式的历史替换
- 顾问自身上下文无法容纳时，进行上下文维护的重新初始化

重置会清除顾问私有的内存中会话记录，并回退其游标。下一次顾问更新会重放当前有界的主会话记录，而不是继续使用重写前的陈旧上下文。

在会话中途启用顾问时，游标会初始化为当前主会话记录的长度。这可避免在首次启用的轮次中重放整个旧对话。

## 工具与隔离 \{#tools-and-isolation}

顾问是完整的智能体，拥有自己的 `Agent` 实例，以及独立的 `ToolSession`，其 ID 后缀为 `-advisor`。它不共享主智能体的文件快照、已见行跟踪、冲突状态或摘要缓存。

每个顾问都有 `advise` 工具，用于将建议呈现到主会话记录中。省略 `tools` 时，它获准使用的调查工具为：

- `read`
- `grep`
- `glob`
- `recall`，仅在当前记忆后端构建了它时提供（Hindsight 或 Mnemopi）

`WATCHDOG.yml` 名单条目可选择为该会话实际构建的内置工具的任意子集（返回 `null` 的工厂所对应工具不存在，例如不可用的 `lsp`）。显式空列表 `tools: []` 不授予任何调查工具；`advise` 仍可用。仅包含未知名称的列表会被丢弃并发出警告，目前会回退到默认子集。可授予的名称包括 `edit`、`write`、`bash`、`eval`、`debug`、`ast_edit`、`task` 和记忆工具等可修改状态的工具，以及按读取类审批的 `wait` 工具。已启用的浏览器/计算机前置环境通过 `eval` 访问，不作为工具授予。

顾问工具针对隔离的顾问 `ToolSession` 构建，并由 `ExtensionToolWrapper` 包装，因此 `tools.approvalMode`、各工具审批策略和 `autoApprove` 的适用方式与注册表工具相同。Cursor 的服务端执行桥使用同一审批上下文，且仅在存在对应顾问授权时才暴露删除/编辑/搜索能力。

`advise` 工具接受一条建议和一个可选的严重性级别：

| 严重性 | 送达方式 | 预期用途 |
| --- | --- | --- |
| 省略 / `nit` | 不打断的旁注，在下一个轮次边界批量加入主会话记录。终结性答案之后会留下可见卡片，除非 `advisor.continueSeverity` 为 `nit`。 | 清理、简化、低风险边缘情况。 |
| `concern` | 送达约束允许时，以打断式引导送达。在终结性答案之后，按默认 `advisor.continueSeverity` 请求继续执行；将阈值设为 `blocker`，则改为留下可见卡片。 | 实质性风险、可能的错误方向、缺失约束、幻觉 API。 |
| `blocker` | 下文的送达约束允许时，以打断式引导消息送达。终结性答案从不会阻止它触发轮次。 | 继续执行显然会浪费工作或产生损坏的输出。 |

被接受的建议会以经过 XML 转义的 `<advisory>` 元素呈现在主会话记录中。具名名单顾问会添加 `advisor` 属性：

```text
<advisory advisor="Architecture" severity="concern" guidance="weigh, don't blindly obey">
note text
</advisory>
```

当你主动中断智能体（Esc，或来自 collab、ACP、RPC、SDK 或扩展的取消）时，顾问会停止自动恢复它。运行停止期间提出的打断式 `concern`/`blocker` 会记录为可见顾问卡片，而不是重启轮次；在你中断时已在途的 concern 也以相同方式保留，而不会意外触发恢复。下一次你恢复时，建议会重新进入上下文，可以通过新消息、`.`/`c` 继续快捷方式，或引导/后续消息恢复。

智能体自行驱动的正常交回控制权，与主动中断的处理不同，但这也不是一概“始终引导并恢复”。循环状态和已完成轮次会先决定正常送达路径：

- **主循环仍在流式输出时**，阻断问题可以引导当前轮次。进行中的审查所提出的小问题和关注事项会延迟到最终边界再交付。
- **主循环让出执行权并进入空闲后**，交付方式取决于该轮如何结束：
   - 如果主智能体最后给出的是**终结性文本答复，且没有排队的工作**，则由 `advisor.continueSeverity`（默认 `concern`）决定：达到或高于此级别的意见会请求继续执行一次；低于此级别的意见会作为可见卡片保留在会话记录末尾，而不是唤醒智能体来重述已经完成的轮次（#4840），并随你的下一条消息传给智能体。所有停止、冷却、计划模式和客户端约束仍然适用；被这些约束阻止的继续执行会以卡片形式保留。
   - 其他情况下（智能体在工作中途让出执行权，没有终结性答复），空闲时的 `concern`/`blocker` 通常会触发新一轮，以便立即处理建议。

会话/客户端约束可能会将通常通过引导交付的意见保留下来：

- **计划模式：**所有原本要进行的顾问引导都会保留为可见卡片，即使主循环正在流式输出，因为只有用户驱动的轮次才会收敛到询问/解决流程。
- **延迟智能体主动发起轮次的 ACP：**当桥接层报告 `deferAgentInitiatedTurns`（没有打开的客户端提示请求）时，空闲状态下原本要进行的引导会被保留，因为客户端无法将被触发的轮次表示为忙碌状态。主循环已经在流式输出时提出的建议，仍可引导该实时轮次。

因此，顾问可以引导并恢复智能体自行结束的运行，前提是**运行仍在进行或在工作中途让出执行权，且当前模式/客户端允许引导**。如果引导被阻止，意见要么会保留为卡片（上述终结性答复、计划模式和延迟 ACP 的情况），要么，对于智能体正在运行或在工作中途让出执行权时的关注事项，会在 `advisor.immuneTurns` 冷却期内降级为不打断执行的旁注；无论哪种情况，它都会等待下一个轮次边界或恢复，而不是唤醒智能体。

`advisor.immuneTurns` 独立于审查频率，限制关注事项打断执行的频率。顾问通过引导通道成功交付 `concern` 或 `blocker` 后，在配置数量的主智能体轮次完成之前，后续关注事项会作为不打断执行的旁注传递。即使对于 `agent-end` 审查者，工具循环的继续执行也会计入该冷却期。默认值为 `3`。阻断问题不受此冷却期限制，但仍遵守主动中断和计划模式等保留约束。`nit` 意见不变。

当顾问更新审查仍在进行中的工作时，`AdviseTool` 会将 `nit` 和 `concern` 调用延迟到最终边界；只有 `blocker` 可以打断尚未完成的工作。延迟的意见在预留名额之前会经过发出防护检查。较高严重级别的意见可以替换同一次审查中待处理的较低严重级别意见，但不能替换较早审查中的意见，也不能撤回已经传递的建议。最终边界会集中交付待处理意见，即使审查频率设置导致跳过新的审查，也不会重置当前审查的预算。

### 发出防护 \{#emission-guard}

每个顾问都有自己的 `AdvisorEmissionGuard`（`src/advisor/emission-guard.ts`），位于从 `AdviseTool` 到 YieldQueue/引导通道的路径上。它执行系统提示中规定的每次更新非阻断建议预算和禁止重复规则：

1. **规范化。**转换为小写，执行 NFKC 规范化，将每一段连续的非字母数字字符折叠为一个空格，然后去除首尾空白。`"Stop."`、`"*Stop*"` 和 `"  stop  "` 都会得到键 `stop`。
2. **无实质内容短语过滤器。**不含具体理由的短语会被抑制，例如 `stop`、`done`、`complete`、`no issue continue`、`lgtm`、`nothing to add` 等。
3. **按严重级别去重。**重复的规范化意见如果严重级别相同或更低，会被丢弃。以更高严重级别重新提出（`nit` → `concern` → `blocker`）仍然符合条件，即使先前的意见已经交付。提示的要求更严格：只有当新的会话记录证据满足 `blocker` 标准时，才允许将先前的非阻断建议作为 `blocker` 重新提出。FIFO 历史最多保留 4096 个条目。
4. **每次更新的等级预算。**每个顾问模型的 `prompt()` 周期最多可发出 N 条非阻断意见（默认 4，可配置为 1-32）。达到容量上限时，较高严重级别的意见可以替换同一次更新中仍待处理的最低等级意见。已经传递的意见仍占用名额；较早更新中的待处理意见仍保留其名额。阻断问题不受限制，被抑制的噪声不消耗预算。优先级：每个顾问的配置 > 共享的 `WATCHDOG.yml` 顶层配置 > `advisor.maxNotesPerUpdate` 设置 > 默认值 4。不另设总体积压预算。

确认响应会区分接受、有条件延迟、重复、噪声和预算抑制。接受意味着宿主已接受该意见，准备交付给主智能体，不代表主模型已经读取它。延迟接受时会提示，同一次审查中较高严重级别的发现可能会替换该意见。被拒绝的意见不获交付保证；顾问不应通过改写被拒绝的发现来规避防护。

每次顾问重置（上下文压缩、切换会话、`/new`）时，防护的全部状态，包括去重历史和每次更新的门控，都会清除，因此重新初始化的审查者可以针对重写后的会话记录重新提出已经提出过的问题。

## 使用 `advisor.syncBacklog` 追赶进度 \{#catch-up-with-advisorsyncbacklog}

追赶策略控制主智能体等待每个已调度顾问的时长，而不是该顾问审查的频率。每个 `WATCHDOG.yml` 条目都可以设置 `syncBacklog`；省略时继承当前全局 `advisor.syncBacklog` 设置。

允许的值：

- `off`：从不等待顾问追赶进度（默认值）
- `1`
- `3`
- `5`
- `strict`：等待已调度的顾问审查完成；没有实际时间超时，但中止和顾问故障仍会让主智能体解除等待

主智能体轮次结束时：

1. 每个顾问都会捕获主智能体的增量；已安排审查的顾问会将该增量与审查频率策略自上次审查以来保留的所有更新一起排入队列
2. 顾问排空循环在后台启动或继续运行
3. 每个已调度顾问解析自己的覆盖设置或全局策略；除非值为 `off`，否则只要该顾问的积压量达到或超过其阈值，主智能体就会等待
4. 有界值将等待时间限制为 30 秒；`strict` 等待时没有实际时间上限
5. 如果顾问追赶到积压量低于阈值，主智能体立即继续
6. 中止、故障、配额暂停、会话转换暂停或释放资源都会解除等待；已暂停的转换也会拒绝新的等待

实际含义：

- `off` 倾向于最大化主智能体吞吐量。
- `1` 最接近同步审查：每次顾问增量排入队列后，主智能体最多等待 30 秒，让积压量归零。
- `3` 和 `5` 允许顾问落后更多，主智能体才会暂停。

`strict` 与 `agent-end` 顾问配合可提供同步最终审查：主智能体到达最终边界，顾问审查累积的运行内容，然后主智能体才能结束。在该边界交付的意见会合并为一条消息，按最新轮次优先、然后按严重级别（`blocker` → `concern` → `nit`）排序。针对较早轮次的意见带有 `turns_ago` 属性，并在会话记录中于严重级别和顾问名称之间显示暗色的 `T-N` 标记。首次合并交付会附带提示，说明发现可能已过时或有误，可以忽略；之后每 50 个主智能体轮次最多附带一次。

如果一批意见中包含达到或高于 `advisor.continueSeverity` 的意见，最多可以请求一次获准的继续执行，即使多个顾问同时报告发现也是如此。停止/中止抑制、关注事项冷却、计划模式策略和客户端保留约束，同时适用于缓冲交付和实时交付。否则，意见会保持可见，但不重启主智能体。由顾问交付启动的继续执行不会安排另一次审查，也不会推进审查频率计数；其更新会被捕获并随下一次审查发送，且不会将顾问意见反馈到审查中。

启动该次继续执行时，会取消所有尚未完成、且审查内容正被此次继续执行修改的顾问审查，但引发此次继续执行的意见所属审查除外。被取消的审查不会发出任何内容，因此不会在智能体修复问题时再次提出该问题。每个失去审查的顾问都会在此次继续执行的最终边界再审查一次，不论其 `reviewInterval` 如何设置，一并覆盖原始工作与修复。

在等待最终审查的同时保持轮次审查异步进行：

```yaml
advisors:
   - name: Turn reviewer
     reviewMode: turn
     syncBacklog: off
   - name: Final reviewer
     reviewMode: agent-end
     syncBacklog: strict
```

顾问故障不会永久阻塞主智能体。宿主会先尝试凭据/回退恢复。可重试故障最多尝试三次，随后丢弃该积压；经历三次丢弃积压的周期后，运行时会停止，直到显式重置，而永久性请求拒绝可能在一个周期后就使其停止。对于无法通过凭据轮换、模型回退或有界冷却等待恢复的配额/用量限制故障，顾问会暂停并保留其批次，直到运行时被重置或重建：上下文压缩、丢弃图片、摇动操作、切换会话或新建会话、通过 `/advisor` 重建、重新加载配置或重启。工具输出裁剪会保留暂停状态，不会有定时器将其恢复。顾问一旦发生故障，主智能体的追赶等待者（`advisor.syncBacklog`）就会解除等待；只有无头模式关闭时的排空过程会等待恢复。

顾问还使用 `model.toolCallLoopGuard.*` 限制重复的相同工具调用。检测到一次循环时会注入纠正提示；如果同一次审查期间再次触及相同界限，则会中止审查，不将此次停止视为提供方故障，也不会启动回退恢复。检测器会在下一个审查/上下文边界重置。

不安全的顾问输出会走单独的隔离路径，而不是上述
三次尝试的请求重试策略。调用未授予顾问的工具会收到 `Tool <name> not found`
结果，以便模型自行纠正；此类调用不会隔离该轮次。
在工具分发之前，如果检测到仅出现在输出中的破坏性 shell
指令，或者在破坏性 shell、指令覆盖、拒绝指令和
账号删除声明这几类危害中，至少有三类仅出现在输出中，
运行时就会隔离生成的文本/建议。
新的指令覆盖与输入中引用的破坏性
命令配对时也符合条件。整个顾问轮次，包括
其中的所有建议，都会在分发前被丢弃。

第一次连续隔离会静默重置顾问，并用
最新待处理上下文重新初始化。第二次连续隔离会发出一条
经过去重的宿主警告，丢弃受影响的批次，并重置顾问
上下文以打破循环。任何成功的顾问轮次都会重置隔离
计数器。

## WATCHDOG.md \{#watchdogmd}

`WATCHDOG.md` 是专供顾问使用的指导。它会附加到顾问系统提示中，不会注入主智能体的常规上下文，也不会像 `AGENTS.md`、`RULES.md` 或其他上下文文件那样工作。

用它指定审查重点：顾问应留意的风险、项目特有的陷阱、危险 API、架构边界，以及对审查者有用、但对主要执行者而言过于嘈杂的质量标准。

示例：

```markdown
# Watchdog notes

Especially watch for:

- Changes that bypass the durable queue in `src/jobs/`.
- UI renderer paths that display unsanitized tool output.
- New worker spawns that do not re-enter the CLI host.
```

### 发现位置 \{#discovery-locations}

`discoverWatchdogFiles(cwd, agentDir)` 会加载以下位置中所有可读的候选文件：

1. 用户级：`<active agent dir>/WATCHDOG.md`（默认为 `~/.omp/agent/WATCHDOG.md`；可通过 `PI_CODING_AGENT_DIR` 迁移）
2. 项目级，从 `cwd` 向上遍历到 git 仓库根目录，找不到仓库根目录时则遍历到主目录：
   - `<dir>/WATCHDOG.md`
   - `<dir>/.omp/WATCHDOG.md`

与原生上下文文件不同，watchdog 发现不会在最近的项目文件处停止。可以同时加载多个项目 watchdog 文件。

隐藏的所属目录中的候选文件会被忽略，除非文件位于 `.omp` 目录中。这样既避免意外拾取无关的点目录约定，又允许使用 `.omp/WATCHDOG.md`。

### `@` 导入 \{#-imports}

`WATCHDOG.md` 内容会使用与上下文文件相同的 `@` 导入辅助程序展开：

- 相对导入从导入方文件所在目录解析
- `~/` 从用户主目录解析
- 围栏代码块和行内代码片段中的导入保持字面内容
- 递归导入最多展开五跳；循环和重复路径会跳过，但不移除原始字面标记
- 缺失或不可读的导入会保留原始 `@path` 文本

### 提示顺序 \{#prompt-order}

加载的 watchdog 块按以下顺序排列：

1. 用户级 `WATCHDOG.md`
2. 项目级文件，从较远的祖先目录逐级向下到 `cwd`

每个文件会以如下形式附加到顾问系统提示：

```xml
Especially pay attention to:
<attention>
...expanded watchdog content...
</attention>
```

后面的项目文件更靠近顾问提示末尾，因此较窄目录范围的指导比宽泛祖先目录的指导更突出。

## WATCHDOG.yml \{#watchdogyml}

`WATCHDOG.yml`（或 `WATCHDOG.yaml`）是顾问名册。每个命名条目都可以设置自己的启用状态、模型、工具和专用提示；`WATCHDOG.md` 提供共享审查指导。

发现过程和 `/advisor configure` 使用相同的逐条目验证：格式错误的条目会被跳过并显示带名称的警告，而正常的顾问仍可使用。无效 YAML 或非映射文档会被跳过并显示文件警告。问题会以汇总的启动/编辑器警告形式显示，并在切换项目/用户作用域后仍保留在编辑器中。保存编辑器文档时只写入有效条目。

编辑器的项目作用域指向仓库根目录的 `WATCHDOG.yml`（不在仓库中时使用 cwd）；用户作用域指向当前智能体目录。如果某个作用域中不存在 `.yml`，但存在 `.yaml`，则会就地编辑已有文件，而不是创建与其竞争的文件。

示例：

```yaml
instructions: |
   Everyone: prefer diffs that keep tests unified.

advisors:
   - name: Architecture
     enabled: true
     model: anthropic/claude-sonnet-4-5:medium
     tools: [read, grep, glob]
     instructions: |
        Watch cross-module coupling and public-API growth.

   - name: Fixer
     enabled: false
     model: anthropic/claude-sonnet-4-5:high
     tools: [read, grep, glob, edit, bash]
     instructions: |
        You may edit and run tests to prove a fix locally, then advise.
```

对于每完成三个主智能体轮次就运行一次的最终让出审查者：

```yaml
advisors:
   - name: Final reviewer
     reviewMode: agent-end
     reviewInterval: 3
     instructions: |
        Review the complete turn. Stay silent unless concrete evidence shows a material problem.
```

字段：

- `instructions`（顶层）：与 `WATCHDOG.md` 一起置于每个顾问系统提示前部的共享提示。所有发现的 `WATCHDOG.yml` 文件中的内容会串接起来。
- `advisors[].name`：供人阅读的标签；会转换为 slug，用于会话 id 及其 `__advisor.<slug>.jsonl` 文件名。跨文件重复的 slug 按与 `WATCHDOG.md` 发现相同的具体性规则处理（项目叶目录 > 项目祖先目录 > 用户）。
- `advisors[].enabled`：可选的逐顾问开关，默认 `true`。`false` 会让顾问在状态/配置中仍然可见，但显示为已暂停。
- `advisors[].model`：可选模型选择器，可带可选的 `:level` 思考后缀（例如 `x-ai/grok-code-fast:high`）。省略 → 顾问使用 `modelRoles.advisor`。
- `advisors[].tools`：可选的内置工具名称列表，用于授予工具权限。省略 → `read`/`grep`/`glob`，如果当前记忆后端提供 `recall`，还会包含该工具；显式 `[]` → 不提供调查工具。[`BUILTIN_TOOL_NAMES`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/builtin-names.ts) 中的任何名称都可接受，包括会修改内容的工具。旧别名（`search`→`grep`、`find`→`glob`）会被规范化。未知名称会被丢弃并发出警告；如果这导致非空输入中没有任何有效名称，当前实现会将结果视为省略，并使用默认子集。
- `advisors[].reviewMode`：可选的审查频率模式。`turn`（默认值）会审查主智能体的每一轮，也就是每一轮工具调用，包括 `willContinue: true` 的工具循环继续执行；`agent-end` 只审查 `willContinue` 不为 true 的最终让出，即每次运行一次。
- `advisors[].reviewInterval`：可选的正安全整数（最大为 `9007199254740991`），默认 `1`。每第 N 次符合条件的更新进行审查；被跳过的更新会累积，并在下一次计划审查中发送。若要每第 N 次已完成运行审查一次，请将 `reviewMode: agent-end` 与此字段结合使用。即使审查频率设置跳过了该次审查，延迟的建议仍会在最终边界具备交付资格。
- `advisors[].syncBacklog`：可选值为 `off`、`1`、`3`、`5` 或 `strict`。数值阈值可以使用不带引号的 YAML 数字。省略 → 继承当前全局 `advisor.syncBacklog`；显式 `off` 始终会禁用对该顾问的等待。编辑器会显示生效的策略，并提供 `inherit` 选项以移除覆盖设置。
- `advisors[].scope`：可选值为 `main`、`subagent` 或 `all`（默认 `all`）。限制哪些会话类型会构建此顾问：`main` 只附加到顶层会话，而 `subagent` 只附加到已启用顾问的衍生子代理会话。
- `advisors[].includeReasoning`：可选布尔值，默认 `true`。为 `false` 时，从主智能体会话记录发送给此顾问的增量会省略助手的 `_thinking:_` 块，使审查依据可观察的行为、工具输入/输出和产出进行评估，而不受主模型思维链的锚定影响。
- `maxNotesPerUpdate`（顶层或逐顾问）：每次提示更新可接受的非阻断意见数，默认 `4`。逐顾问值覆盖顶层值，顶层值覆盖 `advisor.maxNotesPerUpdate` 设置。
- `advisors[].instructions`：此顾问的专用指导，附加在共享基线之后。两个指导字段都会像 `WATCHDOG.md` 一样展开 `@path` 导入。

由顾问交付本身启动的继续执行，也就是主智能体空闲或已越过最终边界时的引导，在到达其自身最终边界的整个过程中，既不会安排审查，也不会推进间隔计数器，因此顾问交付无法重新唤醒审查者，形成顾问→主智能体→顾问的级联。其更新仍会被捕获，并在下一次计划审查中送达。由其他任何来源（待办提醒、异步任务唤醒、实时委派、用户输入）启动的继续执行，都会按正常频率审查，因此 `agent-end` 审查者也会审查待办提醒恢复的运行。交付本身从不暂停：已经产生的建议仍会进行引导、集中交付，或作为旁注传给主智能体。

### 发现位置 \{#discovery-locations-1}

`WATCHDOG.yml`/`WATCHDOG.yaml` 与 `WATCHDOG.md` 使用相同的用户级加项目级搜索路径：用户级的 `<active agent dir>/WATCHDOG.yml`，以及从 `cwd` 向上遍历到仓库根目录（找不到仓库根目录时则到主目录）途中遇到的每个 `WATCHDOG.yml`/`.omp/WATCHDOG.yml`。所有发现的文件会一起加载；更具体的文件（项目叶目录 > 项目祖先目录 > 用户）会替换先前具有相同顾问 slug 的条目。

在相同目录深度，`.yml` 候选文件排在 `.yaml` 候选文件之前，`.omp/<filename>` 排在独立的 `<filename>` 之前。slug 冲突时后面的条目胜出；顶层指导仍会串接。

## 子代理 \{#subagents}

子代理默认不带顾问运行；顾问是**逐智能体**选择启用，而不是通过统一开关开启：

- 智能体定义的 frontmatter `advisor`：`true` 会使用为 `advisor` 角色解析出的模型，为该智能体的衍生会话提供顾问；字符串（例如 `advisor: "deepseek/deepseek-v4-flash"` 或 `advisor: "@smol:high"`）会设置显式顾问模型模式，可带可选的 `:level` 思考后缀。
- `task.agentAdvisor` 设置记录（智能体名称 → `"on"` / `"off"` / 模型模式）会覆盖 frontmatter，并通过 `/agents` 中心逐智能体配置：在某个智能体上按 Enter 会打开其属性栏；顾问栏提供开/关、模型浏览器选择或原始模式输入。

旧版 `advisor.subagents: true` 设置会迁移为 `task.agentAdvisor: { task: "on" }`，内置的通用 `task` 智能体会保留顾问，其他智能体则从无顾问状态开始。

已启用顾问的子代理会话会使用相同的设置/模型角色解析来构建自己的顾问子系统（显式模式会写入衍生会话的 `modelRoles.advisor`），然后针对该子代理会话的 `cwd` 和智能体目录重新执行 `WATCHDOG.md` 与 `WATCHDOG.yml` 发现。子代理顾问与子代理的主工具会话保持隔离，方式与主顾问同主智能体隔离的方式一致。

## 费用和上下文行为 \{#cost-and-context-behavior}

顾问用量是独立的模型用量。`/advisor status` 根据顾问的实时会话记录计算 token/上下文计数，而费用来自每个会话的累计账本，该账本在顾问重置后仍保留，并在恢复时从持久化的顾问会话记录中还原。因此，token 计数可能会重置或缩小，而累计费用不受影响。

`advisor.evictStaleResults` 默认为 `true`。每次审查前，旧审查中的调查性 `read`/`grep`/`glob` 结果会替换为简短占位符；最近一次审查的结果会保留。将其设为 `false`，可在顾问实时上下文中保留这些较旧的工具结果。

对于思考内容绑定前缀的模型，这种清除还会丢弃裁剪边界之后带签名的推理，包括最近一次审查中的推理。主智能体增量和建议意见不会被清除。

顾问拥有自己的仅追加上下文。每次顾问提示前，`AgentSession` 会估算传入 token，并可能维护顾问上下文：

1. 启用模型级上下文升级且存在更大的兼容模型时，尝试进行升级
2. 如果升级后仍无法容纳足够的上下文，则压缩顾问自身的消息历史
3. 对于可读历史，如果上下文压缩没有候选内容或仍无法容纳，则从当前有界主智能体会话记录重新初始化

只有当当前模型能够重放其提供方和 Responses API 格式时，原生上下文压缩才会替换顾问历史。来自其他提供方且启用了原生压缩的摘要模型，会改为对可读历史使用可移植的文本摘要。一旦顾问持有原生历史，就会跳过不兼容的摘要模型、重试回退、冷却恢复和上下文升级。维护失败会保留该历史，而不是通过重新初始化将其清除；常规顾问请求故障处理仍然适用。

重放兼容性不要求启用新的原生上下文压缩。同一提供方的 Responses 模型即使自身的压缩端点被禁用，也可以在回退、冷却恢复或升级期间接收现有原生历史。创建新的原生结果仍要求 `compaction.methodOrder` 中包含 `remote`，并具有符合条件的写入模型；独立的兼容写入模型可以为原生端点被禁用的读取模型维护上下文。

顾问的实时上下文存放在内存中且仅追加；会话运行期间会保留，以便 `/advisor dump` 检查，并且会独立进行升级/压缩/重新初始化（见上文）。它不能代替主智能体持久化的会话记录。

## 会话记录持久化与可观测性 \{#transcript-persistence-and-observability}

顾问是拥有独立模型用量的被动审查者，因此，与任务子代理一样，每个最终确定的顾问轮次都会追加到所属会话产物目录中的 JSONL 文件：

- 旧版/默认顾问：`<session>/__advisor.jsonl`
- 命名顾问：`<session>/__advisor.<slug>.jsonl`
- 子代理顾问（frontmatter `advisor` / `task.agentAdvisor`）：`<session>/<SubId>/__advisor[.<slug>].jsonl`

路径从所属会话文件派生（而不是共享产物根目录），因此每个主智能体/子代理顾问都会写入不同的文件。保留的 `__advisor` 文件名主体不会与任务子代理 id 冲突。

使用文件的原因：

- **用量归属。**`omp stats` 会递归扫描每个会话文件夹，因此顾问助手轮次（及其用量/费用）会像其他子代理一样归属到同一项目/会话。顾问的“会话更新”提示会作为 `synthetic`、归属于智能体的用户消息持久化，因此绝不会增加用户消息指标。
- **可观测性。**[智能体中心](./agent-hub.md) 打开时会发现旧版和命名的 `__advisor*.jsonl` 文件，并将每个文件显示为所属会话下的只读 `advisor` 类型会话记录。

文件会随会话切换而变化：在 `/new`、恢复/切换及分支操作后，记录器会在下一个顾问轮次重新打开新会话路径；在 `/delete` 删除旧产物目录之前，会先分离并排空记录器数据流，避免排队的写入重新创建已删除文件。磁盘日志仅追加，且独立于内存上下文，重新初始化和上下文压缩绝不会截断它。

顾问从来不是对等智能体。`advisor` 类型的注册表引用不会出现在面向智能体的对等名单、`agent://all` 广播、子代理对等提示以及 `history://` 索引/查找/补全中，也无法通过 `write agent://<id>` 或协作聊天向它发消息，亦无法[从智能体中心复活或终止](./agent-hub.md#persisted-agents-and-advisors)，或通过协作功能进行这些操作。无论授予了哪些工具，都无法将它作为对等智能体寻址。
