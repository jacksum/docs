---
title: "manage_skill"
description: "Oh My Pi 官方仓库文档：manage_skill。"
---

# manage_skill \{#manage_skill}

> 创建、更新或删除独立的托管技能。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/manage-skill.ts`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/manage-skill.md`
- 托管技能辅助模块：`packages/coding-agent/src/autolearn/managed-skills.ts`
- 技能发现：`packages/coding-agent/src/extensibility/skills.ts`

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "write"`、`strict = true`、`loadMode = "essential"`。它保持为顶层工具，不会变为工具命令。
- 注册要求 `autolearn.enabled = true`（默认 `false`），但与 `memory.backend` 无关。
- 启用了此功能的顶层会话会在普通的显式工具列表中自动包含它。子代理不会发现或自动获得它，但在其请求工具/frontmatter 列表显式包含它时可以使用。
- 执行是一次性的，不发出进度更新。

## 输入 \{#inputs}

| 字段 | 类型 | 是否必填 | 说明 |
| --- | --- | ---: | --- |
| `action` | `"create" \| "update" \| "delete"` | 是 | 托管技能变更操作。 |
| `name` | `string` | 是 | 托管技能名称；在解析路径之前去除首尾空白并转为小写，然后按 `[a-z0-9][a-z0-9-]{0,63}` 验证。 |
| `description` | `string` | 创建/更新时必填 | 用于技能发现的单行描述。 |
| `body` | `string` | 创建/更新时必填 | `SKILL.md` 的 Markdown 正文；不要包含 frontmatter。 |

## 输出 \{#outputs}

- `delete`：`content[0].text = "Deleted managed skill \"<name>\"."`，`details = { action: "delete", name }`
- `create`：`content[0].text = "Created managed skill \"<name>\" (managed-skills/<name>/SKILL.md)."`，`details = { action: "create", name }`
- `update`：`content[0].text = "Updated managed skill \"<name>\" (managed-skills/<name>/SKILL.md)."`，`details = { action: "update", name }`
- 结果名称回显提供的 `name`；创建/更新路径使用其规范化后的磁盘拼写。
- 创建的托管技能若会被同名人工编写技能遮蔽，返回 `isError: true`，并带有 `details = { action: "create", name, shadowed: true }`。

## 流程 \{#flow}

1. `ManageSkillTool.createIf(...)` 仅在 `autolearn.enabled` 为 true 时暴露工具，并保留工具会话（其可选的 `refreshSkills` 回调、会话 id，以及用于来源追溯的 cwd）。
2. 模式验证要求 `create` / `update` 同时提供 `description` 和 `body`；`delete` 只需 `name`。
3. `delete` 调用 `deleteManagedSkill(name)`，然后在回调存在时刷新活动技能。
4. `create` 规范化名称，并检查活动的人工编写技能是否已占用该名称；如果是，则不写入，返回错误结果。
5. `create` / `update` 调用 `writeManagedSkill(...)`，它会规范化/验证名称，清理生成的 frontmatter，记录来源信息（见注意事项），将进程内同名写入串行化，并在托管技能根目录下写入 `SKILL.md`。
6. 成功创建/更新后，工具会在回调存在时刷新活动技能，使交互式会话能够立即发现变化。
   刷新失败会在文件系统修改后向上传播；不会回滚技能。

## 模式 / 变体 \{#modes--variants}

- `create`：使用独占创建（`wx`）语义创建 `SKILL.md`；文件已存在则失败。创建是独占的，不是临时文件/重命名事务。
- `update`：覆盖现有的普通、单链接托管 `SKILL.md`；文件不存在则失败。
- `delete`：递归移除现有的托管技能目录；目录不存在则失败。
- 同一规范化名称的变更在进程内按提交顺序串行执行；不同名称可以并行进行。不对跨进程竞争进行串行化。

## 副作用 \{#side-effects}

- 文件系统：写入或删除 `<agent-dir>/managed-skills/<name>/SKILL.md`；默认智能体目录为 `~/.omp/agent`。
- 网络：无。
- 会话状态：创建工具时读取 `autolearn.enabled`，成功变更后在 `refreshSkills` 可用时刷新活动技能列表。
- 后台工作：无。

## 限制与上限 \{#limits--caps}

- 可用性要求 `autolearn.enabled = true`。
- 名称会去除首尾空白并转为小写，然后必须匹配 `[a-z0-9][a-z0-9-]{0,63}`。
- 描述会被清理为单行，并移除控制/格式字符、尖括号、反引号及重复波浪号。
- 正文会去除首尾空白，且之后不得为空；生成的 frontmatter 包含规范化的 `name`、清理后的 `description` 和 `x-omp-provenance` 块。
- 来源信息保留最近 20 个参与会话 id 和项目目录。
- 最终托管的 `SKILL.md` 内容上限为 `64_000` 个 UTF-8 字节，包括 frontmatter 和描述。
- 会检查托管技能根目录、技能目录和文件，以防止符号链接逃逸；更新还会拒绝非普通文件或具有多个硬链接的文件。

## 错误 \{#errors}

- 无效名称会抛出 `Invalid skill name "<raw>"...`。
- 创建/更新时未同时提供 `description` 和 `body`，会被模式验证拒绝；执行时的防御性错误为 `"<action>" requires both "description" and "body".`
- 清理后的描述为空会抛出 `Managed skill "<name>" needs a non-empty description.`
- 去除首尾空白后的正文为空会抛出 `Managed skill "<name>" needs a non-empty body.`
- 最终文件超大会抛出 `Managed skill is <bytes> bytes; the limit is 64000.`
- 对已存在的托管文件执行 `create`，或对不存在的目标执行 `update`/`delete`，会抛出操作特定的辅助函数错误。
- `create` 遇到已被人工编写技能占用的名称时，是带有 `isError: true` 和 `details.shadowed = true` 的正常工具结果；不会写入文件。
- 不安全的根目录、符号链接目录/文件、非普通文件及更新时具有多个硬链接的文件，都会抛出安全错误。

## 注意事项 \{#notes}

- 托管技能在 `<agent-dir>/managed-skills` 下生成，绝不编辑人工编写的技能。
- 不要在 `body` 中包含 YAML frontmatter；`writeManagedSkill(...)` 会生成包含规范化的 `name`、清理后的 `description` 以及来源信息的 frontmatter。
- 来源信息 frontmatter（`x-omp-provenance`，不会渲染进系统提示）：`generator`（`manage_skill` 或 `learn`，即最后写入者）、`created`（在引入来源信息之前写入的技能中不存在）、`updated`，以及 `sessions` / `projects`，即参与的会话 id 和工作目录，最早的在前；重复参与者会移至末尾。`update` 会保留已存储的信息块。
- 用户通过 `/skills learned` 查看托管技能及其来源信息，通过 `/skills forget <name>` 删除某个技能。
- `update` 不会绕过人工编写技能的优先级：如果人工编写的技能同名，托管技能在发现过程中仍会被遮蔽。
