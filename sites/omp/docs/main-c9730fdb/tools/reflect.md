---
title: "reflect"
description: "Oh My Pi 官方仓库文档：reflect。"
---

# reflect \{#reflect}

> 基于当前长期记忆后端综合生成答案。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/memory-reflect.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/reflect.md`
- Hindsight 协作组件：
   - `packages/coding-agent/src/hindsight/bank.ts`：首次使用时尽力设置记忆库/任务（`ensureBankExists`）。
   - `packages/coding-agent/src/hindsight/state.ts`：会话状态、共享记忆库作用域、召回/反思配置。
   - `packages/coding-agent/src/hindsight/client.ts`：HTTP `reflect` 调用和错误映射。
- Mnemopi 协作组件：
   - `packages/coding-agent/src/mnemopi/state.ts`：限定作用域的本地召回和上下文格式化。
   - `docs/tools/retain.md`：共享的后端、存储、作用域和心智模型行为。

## 注册 / 可见性 \{#registration--visibility}

- 工具元数据：`approval = "read"`、`strict = true`、`loadMode = "discoverable"`。
- 工具仅在 `memory.backend = "hindsight"` 或 `"mnemopi"` 时注册；在 `"off"` 和 `"local"` 时不存在。Hindsight 还要求已配置非空的 API URL（`isHindsightConfigured(loadHindsightConfig(...))`）。
- 在具有显式工具列表的不受限会话中，注册时会自动包含共享的 `recall`/`retain`/`reflect` 工具集。受限列表不会被扩展。
- 在启用 `bash` 的普通 `tools.commands` 会话中，可发现的内置工具会作为工具命令呈现（在 `bash` 中使用 `reflect --help`、`reflect <args>`）；显式请求的工具仍保持顶层形式。
- 执行是一次性的，不会发出进度更新。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | ---: | --- |
| `query` | `string` | 是 | 要根据长期记忆回答的问题。 |
| `context` | `string` | 否 | 额外指导。Hindsight 将其作为 `context` 发送；Mnemopi 去除上下文首尾空白后，将其追加到召回查询的 `Additional context:` 下。 |

## 输出 \{#outputs}

返回一次性工具结果。

Hindsight：

- `content[0].type = "text"`
- `content[0].text = response.text?.trim() || "No relevant information found to reflect on."`
- `details = {}`
- 工具直接返回 Hindsight 服务器综合生成的文本，不会公开原始召回命中项。

Mnemopi：

- 如果不存在限定作用域的召回结果：`content[0].text = "No relevant information found to reflect on."`
- 否则：`content[0].text = "Based on recalled memories:\n\n<formatted context>"`
- `details = {}`
- 本地路径执行召回加格式化；它不会调用综合模型或独立的综合端点。因此，其结果可能是原始召回上下文，而不是融合后的答案。

## 流程 \{#flow}

1. 当 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"` 时，`MemoryReflectTool.createIf(...)` 会公开该工具。
2. `execute(...)` 在 `untilAborted(...)` 下运行。
3. 如果后端为 `mnemopi`：
   - 读取 `session.getMnemopiSessionState()`，如果后端尚未启动则抛出异常；
   - 如果 `context` 包含非空白内容，则使用 `<query>\n\nAdditional context:\n<context>` 召回；否则使用 `query` 召回；
   - 调用 `state.recallResultsScoped(...)`，使用与 `recall` 相同的本地作用域和合并行为；
   - 如果存在结果，则通过 `state.formatContextScoped(...)` 渲染，并添加前缀 `Based on recalled memories:`。
4. 如果后端为 `hindsight`：
   - 读取 `session.getHindsightSessionState()`，如果后端尚未启动则抛出异常；
   - 使用当前 `bankId`、配置以及会话状态的 `banksSet` 调用 `ensureBankExists(...)`；
   - `ensureBankExists(...)` 对每个会话状态中的每个记忆库尽力执行一次向 `/v1/default/banks/{bank_id}` 的 `PUT`（`createBank`），携带可选的 `reflect_mission` / `retain_mission`；失败会被忽略；
   - 使用 `query`、可选的 `context`、配置的召回预算以及记忆库作用域标签过滤器调用 `state.client.reflect(...)`；
   - `HindsightApi.reflect(...)` 向 `/v1/default/banks/{bank_id}/reflect` 发送 POST 请求，并在调用方省略预算时将自身预算默认为 `"low"`；此工具始终传入配置的预算；
   - 空响应或仅含空白的响应会替换为 `No relevant information found to reflect on.`
5. 后端失败会通过 `logger.warn("reflect failed", ...)` 记录，并在需要时以 `Error` 实例重新抛出。

## 模式 / 变体 \{#modes--variants}

- Hindsight 工具路径：一次远程反思请求，可通过 `context` 聚焦。
- Mnemopi 工具路径：一次限定作用域的本地召回，随后格式化上下文。
- Hindsight 记忆库作用域：
   - `global`：无标签过滤器。
   - `per-project`：每个项目标签使用独立的记忆库 ID（git 主检出根目录的基本名；仓库外则为 cwd 基本名）。
   - `per-project-tagged`：共享记忆库 ID 加上 `project:<project label>` 过滤器，并使用 `tagsMatch = "any"`。
- Mnemopi 记忆库作用域：
   - `global`：读取共享记忆库。
   - `per-project`：读取由绝对 cwd 基本名加该 cwd 的哈希派生的记忆库。
   - `per-project-tagged`：读取由 cwd 派生的项目记忆库和共享记忆库，然后合并结果。
   - 按项目划分的模式还可能包含启动时发现的、与 cwd 匹配的安全旧版记忆库。
- 会话作用域：读取跨会话记忆数据，但不持久化本地输出。子代理别名使用父级的后端作用域。

## 副作用 \{#side-effects}

- 网络
   - Hindsight：由 `ensureBankExists(...)` 发出的可选 `PUT /v1/default/banks/{bank_id}`，随后是 `POST /v1/default/banks/{bank_id}/reflect`。
   - Mnemopi：无，除非本地运行时在召回期间使用了配置的嵌入或 LLM 提供方。
- 会话状态
   - 仅读取会话持有的后端作用域和配置。不更新 `lastRecallSnippet`、Hindsight 心智模型缓存或保留队列。
- 后台工作 / 取消
   - 工具调用信号被取消时，通过 `untilAborted(...)` 中止。

## 限制与上限 \{#limits--caps}

- 工具可用性要求 `memory.backend` 为 `"hindsight"` 或 `"mnemopi"`；默认 `memory.backend` 为 `"off"`。
- 工具级参数：仅 `query` 必填；`context` 可选。两者都是普通字符串，模式层面没有最小长度限制。
- Hindsight 预算来自 `hindsight.recallBudget`，默认为 `"mid"`。
- Hindsight `reflect` 在此处没有客户端词元上限参数；其请求截止时间默认为 `hindsight.reflectTimeoutMs = 120_000`。
- Hindsight 记忆库初始化为每个会话状态跟踪最多 `MISSION_SET_CAP = 10_000` 个记忆库 ID，随后丢弃排序集合的一半。
- Mnemopi 结果数量受 `mnemopi.recallLimit` 限制，默认为 `8`，运行时限定为至少 1；每条召回内容预览默认上限为 500 个字符。

## 错误 \{#errors}

- 当 `memory.backend == "mnemopi"` 但不存在状态时，抛出 `Mnemopi backend is not initialised for this session.`。
- 当 `memory.backend == "hindsight"` 但不存在状态时，抛出 `Hindsight backend is not initialised for this session.`。
- Hindsight HTTP、获取和超时失败会变为 `HindsightError`；HTTP 错误会在可用时包含 `statusCode` 和解析后的 `details`。
- Hindsight `ensureBankExists(...)` 失败会以 debug 级别记录，并对调用方隐藏；只有之后的反思请求可能发生可见的失败。
- Mnemopi 召回会按目标捕获失败并记录。健康目标仍会贡献结果；如果所有尝试的目标都失败，则抛出原始错误或多记忆库 `AggregateError`，而不是转换为无信息文本。
- 工具捕获到的非 `Error` 失败会在重新抛出之前规范化为 `new Error(String(err))`。

## 备注 \{#notes}

- 共享后端详情见 `docs/tools/retain.md`：存储、子代理别名、记忆库作用域、种子心智模型和提示词注入。
- Hindsight `reflect` 不会直接读取缓存的 `<mental_models>` 块。它会基于记忆库内容查询 Hindsight 服务器。同一会话可能另行在开发者指令中含有心智模型上下文。
- Hindsight 反思和保留任务是记忆库级服务器设置，不是逐请求载荷。工具只会在反思前尽力确保它们已设置。
- Mnemopi `reflect` 是本地召回加格式化。它并未实现通用的面向模型的 `reflect` 提示词所承诺的综合功能。
