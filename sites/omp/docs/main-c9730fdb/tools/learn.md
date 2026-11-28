---
title: "learn"
description: "Oh My Pi 官方仓库文档：learn。"
---

# learn \{#learn}

> 将可复用的经验存入长期记忆，并可选择创建或更新托管技能。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/learn.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/learn.md`
- 托管技能辅助模块：`packages/coding-agent/src/autolearn/managed-skills.ts`
- 本地记忆后端：`packages/coding-agent/src/memory-backend/local-backend.ts`
- 本地经验持久化：`packages/coding-agent/src/memories/index.ts`（`saveLearnedLesson(...)`）

## 注册 / 可见性 \{#registration--visibility}

- `loadMode = "essential"` 且 `strict = true`，因此该工具保持为顶层工具，而非变为工具命令。
- 审批是动态的：包含 `skill` 或 `scope: "global"` 的调用，或 `memory.backend = "local"` 时的任何调用，均使用 `approval = "write"`；其他仅操作记忆的 Hindsight/Mnemopi 调用使用 `approval = "read"`。
- 注册要求 `autolearn.enabled = true`（默认 `false`），且 `memory.backend` 等于 `"hindsight"`、`"mnemopi"` 或 `"local"`。Hindsight 还要求已配置后端（`isHindsightConfigured(loadHindsightConfig(settings))`）。
- 已启用的顶层会话会在普通显式工具列表中自动包含 `learn`。子代理不会发现或自动获得它，但请求的工具/frontmatter 列表显式包含它时可以使用。
- 执行为单次执行，不发出进度更新。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | ---: | --- |
| `memory` | `string` | 是 | 要记住的持久、独立完整的经验：是什么、何时使用，以及为什么。模式没有最小长度；空值是否成功取决于后端特定的清理/存储行为。 |
| `context` | `string` | 否 | 经验的来源上下文。 |
| `scope` | `"project" \| "global"` | 否 | `global` 将经验存储到每个项目都可召回的位置：共享 Mnemopi 存储库，或不带标签的 Hindsight 记忆。仅在 `memory.backend` 为 `"mnemopi"` 或 `"hindsight"`，且该后端的作用域设置（`mnemopi.scoping` / `hindsight.scoping`）为 `global` 或 `per-project-tagged` 时，才出现在模式和工具描述中；对于 Hindsight，还仅在 `hindsight.globalScope = true`（默认 `false`）时出现。该配置从会话的 Hindsight 状态读取，因此子代理遵循其启动时父级的配置；省略表示 `project`。 |
| `skill` | `{ action: "create" \| "update"; name: string; description: string; body: string }` | 否 | 经验保存成功后要创建或增强的托管技能。`body` 是不带 frontmatter 的 Markdown。 |

## 输出 \{#outputs}

- 仅经验：
   - `content[0].text = "Lesson stored."` 或 `"Lesson queued for retention."`
   - `details = { skill: null }`
- 经验加技能：
   - `content[0].text = "<lesson result>. Created managed skill \"<name>\"."` 或 `"... Updated ..."`
   - `details = { skill: "<name>" }`
- 与手工编写技能重名时，会在存储经验或将其入队后返回 `isError: true`，并报告 `details = { skill: null, shadowed: true }`。

## 流程 \{#flow}

1. `LearnTool.createIf(...)` 检查 `autolearn.enabled`、受支持的后端，以及选择 Hindsight 后端时的 Hindsight 配置。
2. `execute(...)` 在尝试任何技能修改前先存储经验：
   - Mnemopi：对于 `scope: "global"`，先解析 `state.getGlobalRetainTarget()`；在 `per-project` 作用域模式下，它会在存储任何内容或写入任何技能前抛出异常；随后调用 `rememberScoped(...)`（全局经验会传入该目标），使用 `source: "coding-agent-learn"`、`importance: 0.8`、`scope: "bank"`，启用事实和实体提取，使用 `veracity: "tool"`、`memoryType: "fact"`，并传入会话/cwd/上下文元数据。存储抛出的错误会报告为 `Mnemopi did not store the lesson: <reason>`；不检查返回值。
   - 本地后端：调用 `localBackend.save(...)`，规范化并写入项目作用域的 `learned.md`；`stored === 0` 视为失败。
   - 本地后端：在存储或写入技能前，以 `Global memory scope is not available with the local memory backend.` 拒绝 `scope: "global"`。
   - Hindsight：等待 `state.enqueueRetain(toolCallId, [{ content: memory, context, scope }])`，它会在报告经验已入队前，将经验写入[与 retain 相同的持久发件箱](./retain.md)。全局经验不带标签地保留；当 `hindsight.globalScope` 关闭时（`Hindsight global scope is off; set hindsight.globalScope to true to enable it.`）、处于 `per-project` 作用域模式时（`Hindsight global scope requires global or per-project-tagged scoping.`），或发件箱已满或不可写时，`enqueueRetain` 会在入队或写入技能前抛出异常。
3. 如果没有 `skill`，工具在写入记忆/入队后返回。
4. 如果 `skill.action == "create"`，工具会将转为小写并验证后的名称与当前生效的手工编写技能比较。冲突会在经验已存储或入队后返回错误结果。
5. 否则，调用 `writeManagedSkill(...)`。由于经验已持久化，技能写入失败会作为部分完成结果重新抛出。
6. 与 `manage_skill` 不同，`learn` 写入后不会调用会话的 `refreshSkills` 回调。托管技能会在后续技能刷新/会话中被发现。

## 模式 / 变体 \{#modes--variants}

- 仅将经验存入记忆。
- 对值得固化为 `SKILL.md` 的可重复流程，保存经验并创建/更新托管技能。
- 后端特定的持久化：排队中的 Hindsight、带作用域的 Mnemopi SQLite，或项目作用域的本地 `learned.md`。
- 托管技能文件已存在时，`create` 失败；文件不存在时，`update` 失败。同名的进程内修改串行执行。

## 副作用 \{#side-effects}

- 文件系统：
   - 本地后端写入 `<agent-dir>/memories/<encoded-cwd>/learned.md`。
   - 托管技能写入 `<agent-dir>/managed-skills/<sanitized-name>/SKILL.md`；默认智能体目录为 `~/.omp/agent`。
   - Mnemopi 写入其带作用域的 SQLite 数据库。
   - Hindsight 在 `<agent-dir>/hindsight-outbox/` 下写入私有事件文件，直到服务器接受它。
- 网络：Hindsight 队列稍后刷新到配置的服务器。Mnemopi 可在同步写入行后，调度已配置的嵌入/事实提取提供方工作；本地文件存储本身离线运行。
- 会话状态：读取后端状态、设置、cwd 和会话 ID。在此创建的技能不会立即注入当前生效的技能列表。
- 后台工作：Hindsight 保留和 Mnemopi 提取/嵌入可在工具结果返回后继续。

## 限制与上限 \{#limits--caps}

- 可用性要求 `autolearn.enabled` 和受支持的记忆后端；两项设置默认均为禁用/关闭。
- 托管技能名称先去除首尾空白并转为小写，随后必须匹配 `[a-z0-9][a-z0-9-]{0,63}`。
- 托管描述会折叠成一行，并去除控制/格式字符、尖括号、反引号和重复波浪号。
- 最终托管 `SKILL.md` 内容（包括生成的 frontmatter 和描述）上限为 `64_000` 个 UTF-8 字节。
- 托管技能绝不覆盖手工编写的技能；发现时优先采用手工编写的名称。
- 本地经验按从新到旧排列，并按规范化渲染行去重，最多保留 100 条经验列表项。在中和提示注入和脱敏敏感信息后，经验内容上限为 2,000 个字符，上下文上限为 400 个字符。写入在进程内按经验文件串行执行，并保留经验列表项以外手工编辑的标题、正文和空行。

## 错误 \{#errors}

- 缺少 Mnemopi 状态时，返回 `Mnemopi backend is not initialised for this session.`。
- 同步 Mnemopi 写入抛出异常时，返回 `Mnemopi did not store the lesson: <reason>`；不会尝试可选技能操作。
- 本地后端规范化后没有经验内容时，返回 `Lesson was empty after sanitization; nothing stored.`；不会尝试可选技能操作。
- 缺少 Hindsight 状态时，返回 `Hindsight backend is not initialised for this session.`。
- `skill.action = "create"` 时与手工编写名称冲突，会在经验保存成功后返回 `isError: true`、`details = { skill: null, shadowed: true }`。
- 托管技能验证、创建/更新、安全或大小检查失败，会在经验保存成功后抛出 `<lesson result>, but the managed skill could not be written: <reason>`。

## 说明 \{#notes}

- 谨慎使用此工具。一条精确、可复用的经验优于多条模糊记忆。
- 仅对可重复流程设置 `skill`；普通事实应仅保留在记忆中。
- 托管技能 frontmatter 从规范化名称和清理后的描述生成；`body` 不得包含 frontmatter。
- 托管技能与手工编写技能相互隔离。`learn` 写入它们，以供后续发现刷新；修改后需要立即刷新当前会话时，使用 `manage_skill`。
