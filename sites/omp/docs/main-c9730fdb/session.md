---
title: "会话存储与条目模型"
description: "Oh My Pi 官方仓库文档：会话存储与条目模型。"
---

# 会话存储与条目模型 \{#session-storage-and-entry-model}

本文档是编码智能体会话如何表示、持久化、迁移以及在运行时重建的权威依据。

## 范围 \{#scope}

涵盖：

- 会话 JSONL 格式和版本管理
- 条目分类和树语义（`id`/`parentId` + 叶节点指针）
- 加载旧文件或格式错误文件时的迁移/兼容行为
- 上下文重建（`buildSessionContext`）
- 持久化保证、失败行为、截断/blob 外置
- 存储抽象（`FileSessionStorage`、`MemorySessionStorage`）及相关实用工具

不涵盖 `/tree` UI 的渲染行为，但影响会话数据的语义除外。

## 实现文件 \{#implementation-files}

- [`src/session/session-manager.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-manager.ts)：编排：树/叶节点、追加、持久化、blob、生命周期工厂
- [`src/session/session-entries.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-entries.ts)：条目/头部类型、`SessionEntry` 联合类型、`CURRENT_SESSION_VERSION`
- [`src/session/session-migrations.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-migrations.ts)：版本迁移
- [`src/session/session-loader.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-loader.ts)：文件加载 + blob 引用解析
- [`src/session/session-context.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-context.ts)：`buildSessionContext`
- [`src/session/session-persistence.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-persistence.ts)：截断 + 图像 blob 外置
- [`src/session/session-paths.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-paths.ts)：磁盘布局、目录编码、终端面包屑
- [`src/session/session-listing.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-listing.ts)：发现（列出/最近/解析）
- [`src/session/session-index.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-index.ts)：`history.db` 中建立索引的标题和空闲回顾日志
- [`src/session/exit-diagnostics.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/exit-diagnostics.ts)：待处理工具和中断轮次诊断
- [`src/session/session-storage.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-storage.ts)：存储抽象
- [`src/session/session-title-slot.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/session-title-slot.ts)：固定宽度的当前标题槽
- [`src/session/indexed-session-storage.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/indexed-session-storage.ts)：本地索引 + 有序的远程支持存储适配器
- [`src/session/messages.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/messages.ts)：自定义消息转换器
- [`src/session/blob-store.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/blob-store.ts)：按内容寻址的 blob 存储
- [`src/session/history-storage.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/session/history-storage.ts)：提示词历史（独立子系统）

## 磁盘布局 \{#on-disk-layout}

文件会话的默认位置：

```text
~/.omp/agent/sessions/<encoded-cwd>/<timestamp>_<sessionId>.jsonl
```

`<encoded-cwd>` 根据规范化的 cwd 派生（因此符号链接别名共享同一存储桶）：主目录下的目录使用 `-<relative>`，临时根目录下的目录使用 `-tmp-<relative>`，其他目录使用 `--<encoded-absolute>--`，并将路径分隔符替换为 `-`。

访问时，会尽力将短期使用过的哈希方案（`<scope>-<project-basename>-<sha256(canonical-cwd)>`，用于 17.2.5-17.2.8，随后在 17.2.9 由 #7397 撤回）写入的存储桶迁移回路径编码名称，同时迁移相对主目录存储桶的旧式 `--<home-encoded>-*--` 名称。

blob 存储位置：

```text
~/.omp/agent/blobs/<sha256>
```

终端面包屑文件写入以下位置：

```text
~/.omp/agent/terminal-sessions/<terminal-id>
```

面包屑内容以 cwd 和会话文件路径开头。可选的额外行是 `fresh` 和 `cwdstat <device> <inode>`。fresh 面包屑会保留初始创建的、JSONL 文件尚不存在的延迟会话，防止 `continueRecent()` 重新打开上一个会话。显式的 `newSession()` 边界会在返回前将头部实体化，但由 `drop`（`/delete`）创建的延迟后继会话除外。目录标识允许在同一文件系统内重命名项目后自动重新定位根目录；仅 cwd 缺失并不能作为发生移动的证据。写入是同步、有序且尽力而为的。

## 文件格式 \{#file-format}

会话文件使用 JSONL：每行一个 JSON 对象。当前文件在物理结构上以固定宽度的 256 字节 `type: "title"` 槽开头（包括其换行符），接着是会话头部，然后是 `SessionEntry` 值。旧版文件可能直接以头部开头。加载器会去掉物理槽，并将其当前标题/来源并入逻辑头部。

- 逻辑上的第一个条目始终是会话头部（`type: "session"`）。
- 其余逻辑条目是 `SessionEntry` 值。
- 常规追加会扩展树；分支导航则移动内存中的指针（`leafId`）。定向重写/丢弃辅助函数可以更改现有记录。

### 头部（`SessionHeader`） \{#header-sessionheader}

```json
{
	"type": "session",
	"version": 3,
	"id": "019c625b-b900-7000-8000-000000000001",
	"timestamp": "2026-02-16T10:20:30.000Z",
	"cwd": "/work/pi",
	"title": "optional session title",
	"titleSource": "auto",
	"additionalDirectories": ["/work/shared"],
	"previousSessionFiles": ["/old/location/session.jsonl"],
	"providerPromptCacheKey": "optional inherited cache identity",
	"taskPromptCacheKey": "optional local-only Task sibling family key",
	"parentSession": "optional lineage marker"
}
```

说明：

- 新会话 id 是 UUIDv7 字符串；读取器也接受旧的字符串 id。
- `additionalDirectories` 记录 `cwd` 之外经过规范化和去重的工作区根目录。
- `previousSessionFiles` 记录成功移动前的绝对位置。
- `providerPromptCacheKey` 为符合条件的完整派生会话携带继承的模型提供方提示词缓存标识。
- `taskPromptCacheKey` 是仅限本地的 Task 同级家族键（`<parent cache key>:<agent name>`），分享和 HTML 导出时会省略。
   - 子会话存在后，执行器就会派生此键，与子会话的初始模型无关。父缓存谱系为空时不会派生任何内容，因此这些子会话保留自己的会话标识。
   - 在有请求使用它之前，此键保存在会话作用域内、不持久化的暂存区中。在选择启用 `shared-prompt-cache` 的模型上发出的第一个主请求会将它写入头部，因此派生新会话和重新打开时都能保留。
   - 每个请求根据自己的模型决定是否使用：显式会话键优先；否则，家族键仅适用于选择启用的模型。
   - 暂存区不会在派生、移动、分支、新会话重置或切换到其他会话后保留；回滚的移动或切换会恢复它。
- `parentSession` 是不透明的谱系字符串。当前代码会根据流程（`fork`、`forkFrom`、`createBranchedSession` 或显式 `newSession({ parentSession })`）写入会话 id 或会话路径。应将它视为元数据，而非带类型的外键。

- `titleSource` 为 `auto` 或 `user`；自动重命名不能覆盖用户标题。

### 条目基类（`SessionEntryBase`） \{#entry-base-sessionentrybase}

所有非头部条目都包括：

```json
{
	"type": "...",
	"id": "8-char-id",
	"parentId": "previous-or-branch-parent",
	"timestamp": "2026-02-16T10:20:30.000Z"
}
```

根条目（首次追加，或 `resetLeaf()` 之后）的 `parentId` 可以为 `null`。生成的条目 id 通常是八个十六进制字符，在碰撞重试耗尽时会回退为完整的 Snowflake id；使用方不得假定其宽度固定。

## 条目分类 \{#entry-taxonomy}

`SessionEntry` 是以下类型的联合：

- `message`
- `model_usage`
- `thinking_level_change`
- `model_change`
- `service_tier_change`
- `compaction`
- `branch_summary`
- `reset_boundary`
- `custom`
- `custom_message`
- `label`
- `title_change`
- `ttsr_injection`
- `credential_pin`
- `session_init`
- `mode_change`

### `message` \{#message}

直接存储 `AgentMessage`。

```json
{
	"type": "message",
	"id": "a1b2c3d4",
	"parentId": null,
	"timestamp": "2026-02-16T10:21:00.000Z",
	"message": {
		"role": "assistant",
		"api": "anthropic-messages",
		"provider": "anthropic",
		"model": "claude-sonnet-4-5",
		"content": [{ "type": "text", "text": "Done." }],
		"usage": {
			"input": 100,
			"output": 20,
			"cacheRead": 0,
			"cacheWrite": 0,
			"totalTokens": 120,
			"cost": {
				"input": 0,
				"output": 0,
				"cacheRead": 0,
				"cacheWrite": 0,
				"total": 0
			}
		},
		"stopReason": "stop",
		"timestamp": 1760000000000
	}
}
```

持久化的 `message.role` 判别字段使用 **camelCase**，而非 LLM 传输格式或扩展钩子名称使用的 snake_case。普通对话记录在 `type: "message"` 下使用以下角色：

| 持久化的 `message.role` | 所属包 | 说明 |
| --- | --- | --- |
| `user` | pi-ai | 用户/工具反馈轮次。 |
| `developer` | pi-ai | 开发者角色指令轮次。 |
| `assistant` | pi-ai | 模型轮次；工具调用以 `{ "type": "toolCall" }` 块的形式位于其 `content` 中。 |
| `toolResult` | pi-ai | 单个工具调用的结果，**不是** `tool_result`。携带 `toolCallId`/`toolName`。 |
| `bashExecution` | coding-agent | 独立的 `!`-bash 运行。 |
| `pythonExecution` | coding-agent | 独立的 Python 运行。 |
| `hookMessage` | coding-agent | 旧版钩子注入消息，为迁移保留；新代码使用 `custom`。 |
| `fileMention` | coding-agent | 内联的 `@file` 提及内容。 |

分支摘要和上下文压缩摘要角色在会话上下文重建时，由专用的顶层条目合成。通过 `pi.sendMessage` 发送的扩展消息也会持久化为 `custom_message` 条目，并重建为 `custom`：

| 持久化条目类型 | 重建后的角色 |
| --- | --- |
| `branch_summary` | `branchSummary` |
| `compaction` | `compactionSummary` |
| `custom_message` | `custom` |

内部调用方可以直接追加 `custom` 消息，因此读取器必须根据 `entry.type` 进行区分，而不能从重建后的角色推断持久化结构。

`toolCall` 是 **`assistant` 消息的 `content` 数组内部的内容块类型**，不是消息角色。若扩展依据 `message.role` 匹配 snake_case 常量（`tool_result`、`tool_call`），或在比较前将角色转为小写，就会静默跳过 `toolResult`（及所有其他 camelCase 角色），而不会引发错误。请原样匹配上表中的 camelCase 值。基础角色是 `packages/ai/src/types.ts` 中的 `Message`；其余角色合并到 `CustomAgentMessages` 中（`packages/agent/src/compaction/messages.ts`、`packages/coding-agent/src/session/transcript/messages.ts`）。编码智能体重新导出这些自定义类型，并在 `packages/coding-agent/src/session/messages.ts` 中将其转换为模型提供方上下文。

### `model_usage` \{#model_usage}

记录对话记录之外的模型调用。字段为 `purpose`、可选的模型 `role`、`api`、`provider`、`model`、`usage`、`stopReason` 和可选的 `errorMessage`。这些记录参与用量核算，而不构成模型消息或会话记录轮次。`appendModelUsage()` 将记录关联到发起调用的会话/分支，并拒绝过期的会话归属。

可选字段用于描述调用，而不复制由 `purpose` 标识的静态提示词。

- `duration` / `ttft`：请求的实际耗时和首个 token 延迟，单位为 ms。
- `judgment`：原生判定查询（TypeSafe jev 和其他判定 API）。`state` 是规范状态的 `sha256`，即判定答案缓存（`~/.omp/cache/judgment-cache.db`）中的 `states.id`：该数据库仅保存一份状态文本，并在 `oracle(state, model, name)` 下保存每个问题渲染后的指令、标准和完整答案。`answers` 按问题 id 保留请求所产生的每个答案的概要：noul 的 yes 概率、选择题的 `[label, confidence]`、评分的 `[score, confidence]`、边界框的 `[top, bottom, left, right, confidence]`。`cached` 统计改由缓存回答的问题数（不计费，不包含在 `answers` 中）。完全由缓存回答的判定不写入条目；失败请求的 `answers` 为空。
- `completion`：文本旁路通道（标题生成、回顾、提交消息、记忆提取等）。`prompt` 是发送给模型的动态用户轮次文本；如果请求读取了该条目 `parentId` 处的对话（`title-fork`、`recap`、`btw`），则不包含它。`reply` 是解析前的原始回复，或者在调用通过强制工具调用作答时，以 JSON 表示的工具参数。任一侧超过 4,000 个字符时（例如差异、会话记录）都会被省略，绝不截断。会话已存储其结果的调用（`compaction:<method>`、`branch-summary`、`web-search`、`image-gen`、`image-describe`）仅记录用量和耗时。上下文压缩的 purpose 会标明发出请求的方法：`compaction:remote`（模型提供方原生上下文压缩，包括 OpenAI `/responses/compact` 和 V2 流式处理）、`compaction:soft`（本地摘要请求）、`compaction:handoff`（交接文档）；顾问压缩自身历史时记录为 `compaction:advisor`。

产生了输出的设备端模型调用会以零用量记入日志，因此仍然可以查看其次数和 `duration`。

```json
{
	"type": "model_usage",
	"id": "4e1e5bcf",
	"parentId": "40ec204f",
	"timestamp": "2026-11-18T10:16:19.964Z",
	"purpose": "find",
	"role": "typesafe",
	"api": "typesafe",
	"provider": "typesafe",
	"model": "jev-1.14.0",
	"usage": { "input": 824, "output": 87, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 911, "cost": { "input": 0.0000346, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0.0000346 } },
	"stopReason": "stop",
	"duration": 212,
	"judgment": {
		"state": "9f2c1a7b3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
		"answers": { "p00": 0.46, "p01": 0.02, "kind": ["helper", 0.41] },
		"cached": 1
	}
}
```

```json
{
	"type": "model_usage",
	"purpose": "title",
	"duration": 640,
	"ttft": 410,
	"completion": {
		"prompt": "<user>\nfix the share bar\n</user>",
		"reply": "<title>Fix stats share bar</title>"
	}
}
```

### `model_change` \{#model_change}

```json
{
	"type": "model_change",
	"id": "b1c2d3e4",
	"parentId": "a1b2c3d4",
	"timestamp": "2026-02-16T10:21:30.000Z",
	"model": "openai/gpt-4o",
	"role": "default"
}
```

`role` 可选；缺失时在上下文重建中视为 `default`。`resolvedModelIsFallback` 可选地标记重试回退转换。保留角色 `fallback` 是临时的：模型恢复优先使用配置的默认模型，而不是恢复该角色的临时模型。

重试回退条目还携带 `fallback`：离开的模型（`from`）、导致切换的因素（`trigger`：`request-error`、在智能体循环自行停止轮次且没有请求失败时为 `agent-loop`、`usage-preflight` 或 `missing-credential`），以及错误或条件（`reason`）：

```json
{
	"type": "model_change",
	"model": "openai/gpt-4o",
	"role": "fallback",
	"resolvedModelIsFallback": true,
	"fallback": {
		"from": "anthropic/claude-sonnet-4-5",
		"trigger": "agent-loop",
		"reason": "Soft tool requirement 'bash' was not satisfied after 3 forced turns; aborting to avoid an unbounded force loop."
	}
}
```

匿名化导出对 `from` 使用与 `model` 相同的模型标识规则，保留 `trigger`，并像处理 `errorMessage` 一样对 `reason` 脱敏，因为模型提供方的错误可能回显请求内容。

### `service_tier_change` \{#service_tier_change}

```json
{
	"type": "service_tier_change",
	"id": "c1d2e3f4",
	"parentId": "b1c2d3e4",
	"timestamp": "2026-02-16T10:21:45.000Z",
	"serviceTier": { "openai": "priority", "google": "flex" }
}
```

`serviceTier` 是按家族组织、以 `openai`/`anthropic`/`google` 为键的映射（每个值为 `auto`/`default`/`flex`/`scale`/`priority`/`ultrafast`），没有启用层级时为 `null`。存储单个字符串（`"flex"`、`"openai-only"`、`"claude-only"` 等）的旧条目在上下文重建期间会强制转换为此映射；仅加载不会重写其载荷。

### `thinking_level_change` \{#thinking_level_change}

```json
{
	"type": "thinking_level_change",
	"id": "c1d2e3f4",
	"parentId": "b1c2d3e4",
	"timestamp": "2026-02-16T10:22:00.000Z",
	"thinkingLevel": "high"
}
```

`configured` 还可以保留用户选择的选择器（`"auto"` 或具体级别）。读取旧条目时会回退到 `thinkingLevel`。两个字段都可以是 `null`；解析后的级别为 null 或缺失时，会重建为 `"off"`。

### `compaction` \{#compaction}

```json
{
	"type": "compaction",
	"id": "d1e2f3a4",
	"parentId": "c1d2e3f4",
	"timestamp": "2026-02-16T10:23:00.000Z",
	"summary": "Conversation summary",
	"shortSummary": "Short recap",
	"firstKeptEntryId": "a1b2c3d4",
	"tokensBefore": 42000,
	"details": { "readFiles": ["src/a.ts"] },
	"preserveData": { "hookState": true },
	"fromExtension": false
}
```

可选的上下文压缩元数据包括 `tokensAfter`、`method`、`providerReplayThroughEntryId` 和 `warning`。`preserveData` 可以携带原生 OpenAI/Anthropic 回放状态或 snapcompact 归档；它并非仅用于扩展状态。`providerReplayThroughEntryId` 标记原生替换历史所表示的最后一个条目，以便后续条目仍可正常回放。

### `branch_summary` \{#branch_summary}

```json
{
	"type": "branch_summary",
	"id": "e1f2a3b4",
	"parentId": "a1b2c3d4",
	"timestamp": "2026-02-16T10:24:00.000Z",
	"fromId": "a1b2c3d4",
	"summary": "Summary of abandoned path",
	"details": { "note": "optional" },
	"fromExtension": true
}
```

如果从根分支（`branchFromId === null`），`fromId` 是字面字符串 `"root"`。

### `reset_boundary` \{#reset_boundary}

由 `/clear` 追加的不带载荷的标记。折叠后的实时会话记录和重建的模型上下文从最新适用边界之后开始；完整历史会话记录导出仍保留该边界之前的条目。

### `custom` \{#custom}

由核心子系统或扩展拥有的不透明、非 LLM 记录。`buildSessionContext` 不会直接将它们转换为模型消息，但子系统专用的回放代码可以使用 `customType` 值恢复运行时状态，或诊断中断的轮次。

```json
{
	"type": "custom",
	"id": "f1a2b3c4",
	"parentId": "e1f2a3b4",
	"timestamp": "2026-02-16T10:25:00.000Z",
	"customType": "com.example.my-extension.state",
	"data": { "state": 1 }
}
```

当前由核心拥有的值包括：

| `customType` | `data` 模式 | 写入方与使用方 |
| --- | --- | --- |
| `tool_execution_start` | `{ toolCallId: string, toolName: string, startedAt: string, args?: { command?: string, path?: string }, intent?: string }` | `AgentSession` 在工具实现开始执行前立即写入标记。退出诊断将其与助手工具调用和工具结果相结合，以重建遗留的待处理调用。参数摘要是截断后的投影；读取时也接受旧的完整参数对象。 |
| `session_exit` | `{ reason: string, kind: "normal" \| "signal" \| "fatal" \| "process_exit", recordedAt: string, pendingToolCalls?: Array<{ toolCallId?: string, toolName: string, args?: unknown, intent?: string, assistantTimestamp?: number, startedAt?: string }> }` | 当会话具有助手历史或待处理工具调用时，正常释放和事后清理会记录退出。写入方立即调用 `flushSync()`，以便后续进程检查最后一个已持久化的轮次；刷写失败会记入日志。恢复诊断使用最新的有效记录。 |
| `tool_approval_requested` | `{ toolCallId: string, parentToolCallId?: string, toolName: string, approvalMode: string, reason?: string, requestedAt: string }` | 扩展工具包装器在审批提示打开前将其写入磁盘，不论是否有扩展监听对应事件；如果尚无助手消息，则创建会话文件。该调用会一直处于等待状态，直到后面出现 `tool_approval_resolved`、其 `toolCallId` 对应的工具结果，或者在由 eval 单元或内核定义的工具分派调用时，出现其 `parentToolCallId` 对应的工具结果（派生新会话和恢复修复会用工具结果闭合中断的助手调用，但不会闭合 eval 发出的嵌套调用），这样读取文件的其他进程就能区分会话是在等待用户，还是仍在工作。 |
| `tool_approval_resolved` | `{ toolCallId: string, toolName: string, approved: boolean, reason?: string, resolvedAt: string }` | 结束等待：已批准、已拒绝（`reason: "denied by user"`）、已中止，或因没有可用的交互式 UI 而被拒绝。 |
| `user_todo_edit` | `{ phases: TodoPhase[] }` | SDK/UI 的 todo 编辑会持久化完整的阶段快照。todo 恢复会向后扫描以查找最新快照（或成功的 `todo` 工具结果），并恢复其阶段。 |
| `vibe-session-lifecycle` | 版本 1 事件，包含 `{ version: 1, id, ownerId, parentSessionId, action, ... }`；`spawn` 添加 `cli`、`agent`、`childSessionFile` 和 `createdAt`；轮次事件添加 `turn`；墓碑事件添加 `reason`。 | Vibe 运行时持久化并回放子会话生成、轮次开始/结束、墓碑标记和撤销墓碑标记等转换，以恢复所拥有的子会话和进行中的状态。无效或超出作用域的事件会被忽略。 |
| `autoresearch-control` | `{ mode: "on" \| "off" \| "clear", goal?: string }` | 内置 autoresearch 命令写入模式/目标更改，由实验限制触发的关闭会写入 `mode: "off"`。恢复时，`reconstructControlState()` 回放有效记录，以恢复 autoresearch 是否处于启用状态及其目标；`clear` 移除目标。参见 [自动研究](./autoresearch.md)。 |
| `system-prompt-digest` | 十六进制字符串：基础系统提示词块的哈希（在每轮钩子覆盖之前） | 当带有模型提供方输出的主助手回复所用提示词不同于该分支的最新记录时，`AgentSession` 会在此回复前追加该记录，并将它随重新指定父节点的同级回复一起带入回退分支。在恢复会话的第一次模型调用前，受前缀约束的工具列表重建只有在复现该提示词时才会提交；没有记录时则冻结。注入到基础提示词中的记忆召回也是哈希的一部分，因此这类会话保持冻结。 |

恢复时，如果非终结对话尾部之后存在有效的最新 `session_exit`，`AgentSession`/SDK 初始化会追加一条 `stopReason: "aborted"` 的合成助手消息，并重建显示/智能体上下文。正常退出仅在记录了待处理工具调用时触发此转换；异常退出类型即使没有该列表也可能触发。这样可以防止恢复后的会话记录将中断的轮次呈现为仍在进行。

表中的字符串为其核心使用方保留。扩展**不得**使用它们。扩展记录应使用命名空间标识符，例如反向域名或包限定名称；发生冲突会导致核心回放逻辑将扩展数据解释为生命周期状态。未知的命名空间值对核心会话上下文重建保持不透明。

### `custom_message` \{#custom_message}

扩展提供的消息，除非 `excludeFromContext` 为 `true`，否则会参与 LLM 上下文（为 true 时只绘制和保存，类似 `!!` bash 行）。`content` 可以是字符串，也可以是文本/图像内容块，`attribution` 记录其由用户还是智能体发起。

```json
{
	"type": "custom_message",
	"id": "a2b3c4d5",
	"parentId": "f1a2b3c4",
	"timestamp": "2026-02-16T10:26:00.000Z",
	"customType": "my-extension",
	"content": "Injected context",
	"display": true,
	"details": { "debug": false },
	"attribution": "agent"
}
```

### `label` \{#label}

```json
{
	"type": "label",
	"id": "b2c3d4e5",
	"parentId": "a2b3c4d5",
	"timestamp": "2026-02-16T10:27:00.000Z",
	"targetId": "a1b2c3d4",
	"label": "checkpoint"
}
```

`label: undefined` 清除 `targetId` 的标签。

### `title_change` \{#title_change}

会话重命名的仅追加审计条目。记录 `title`、`source`（`auto` 或 `user`），以及可选的 `previousTitle` 和 `trigger`。当前标题也会在固定宽度标题槽中更新，因此列出会话无需重写整个文件。

`/rename <title>` 设置显式标题。不带标题的 `/rename` 会使用标题生成候选（`tiny`、`commit`、`smol`，然后是符合条件的当前模型回退项）根据最近对话生成标题，如果当前标题带有卡片（`<icon> <CODE>: `），则保留该卡片。对于仍然没有卡片的标题，无论是输入还是生成的，只要 `title.icons` 不为 `boring`，就会从相同候选中生成卡片（`src/prompts/system/title-card.md`）；卡片生成失败会让标题保持纯文本，中断则只会从输入的标题中去掉卡片。两者都是用户请求的重命名（`source: "user"`），因此后续自动命名不能替换它们。对话为空或生成失败时，当前标题保持不变。如果生成过程中切换了会话或进行了更新的重命名，则会丢弃过期结果。本地小型模型失败时绝不回退到在线模型提供方。

### `ttsr_injection` \{#ttsr_injection}

```json
{
	"type": "ttsr_injection",
	"id": "c2d3e4f5",
	"parentId": "b2c3d4e5",
	"timestamp": "2026-02-16T10:28:00.000Z",
	"injectedRules": ["ruleA", "ruleB"]
}
```

### `credential_pin` \{#credential_pin}

记录模型提供方以及一个化名化的 SHA-256 账户/作用域哈希，用于将恢复后的 OAuth 流量重新固定到提供服务的账户，并保留账户作用域内的提示词缓存复用。它不存储原始账户标识；导出的哈希仍然可以关联，并非匿名。

### `session_init` \{#session_init}

```json
{
	"type": "session_init",
	"id": "d2e3f4a5",
	"parentId": "c2d3e4f5",
	"timestamp": "2026-02-16T10:29:00.000Z",
	"systemPrompt": ["...", "..."],
	"task": "...",
	"tools": ["read", "edit"],
	"outputSchema": { "type": "object" },
	"outputSchemaMode": "strict",
	"restrictToolNames": true,
	"spawns": "*",
	"readSummarize": false
}
```

最新的 `session_init` 也是冷子代理的唤醒契约。可选字段包括 `agent`、`modelRole`、`resolvedModel`、`perCallModel`（布尔值）、`perCallModelIdentity`、`perCallThinkingLevel`、`retryFallback`、`readOnly`、`advisor` 和 `compactionThreshold`（`thresholdPercent`/`thresholdTokens`）。对于 `perCallModel: true`，冷唤醒同时要求 `perCallModelIdentity`（精确的 `provider/model-id[@upstream]`，不带推理强度后缀）和 `perCallThinkingLevel`（配置的推理强度选择器，包括 `auto`，未设置时为 `null`）。缺少任一字段的旧版按调用记录会拒绝唤醒，而不会从用于历史显示的 `resolvedModel` 猜测。这些字段在匿名化导出中会按照与其他会话元数据相同的标志、模型标识和推理强度规则保留。`isolated: true` 标记不可冷唤醒的隔离工作树子会话。`mountedTools` 指定 `tools` 中以工具命令而非顶层工具形式呈现的条目；冷唤醒会重新挂载它们，使唤醒后的会话发送相同的工具列表和工具清单。没有此字段的文件会将 `tools` 中的每个名称都作为顶层工具唤醒。匿名化导出以处理 `tools` 的方式处理它。`systemPrompt` 保存构建模型调用所用的基础提示词块（绝不是每轮 `before_agent_start` 覆盖），唤醒会原样回放它们。当模型调用使用了不同的基础提示词或工作池让出项（`workPoolYieldItems`，唤醒时恢复）时，会话会追加更新的 `session_init`。旧文件存储一个拼接后的字符串，唤醒时作为单个块。`extractSessionInit()` 和只读的 `peekSessionInit()` 暴露此契约。

### `mode_change` \{#mode_change}

```json
{
	"type": "mode_change",
	"id": "e2f3a4b5",
	"parentId": "d2e3f4a5",
	"timestamp": "2026-02-16T10:30:00.000Z",
	"mode": "plan",
	"data": { "planFilePath": "local://PLAN.md" }
}
```

## 版本管理与迁移 \{#versioning-and-migration}

当前会话版本：`3`。

### v1 -> v2 \{#v1---v2}

在头部 `version` 缺失或 `< 2` 时应用：

- 为每个非头部条目添加 `id` 和 `parentId`。
- 按文件顺序重建线性父链。
- 如存在上下文压缩字段 `firstKeptEntryIndex`，将其迁移为 `firstKeptEntryId`。
- 设置头部 `version = 2`。

### v2 -> v3 \{#v2---v3}

在头部 `version < 3` 时应用：

- 对于 `message` 条目：将旧版 `message.role === "hookMessage"` 重写为 `"custom"`。
- 设置头部 `version = 3`。

### 迁移触发与持久化 \{#migration-trigger-and-persistence}

- 迁移在会话加载（`setSessionFile`）期间运行。
- 如果运行了任何迁移，内存中的表示会被标记为需要完整重写，而不是立即重写。
- 下次持久化操作会先执行完整重写，然后再继续增量追加。

## 加载与兼容行为 \{#load-and-compatibility-behavior}

`loadEntriesFromFile(path)` 的行为：

- 文件缺失（`ENOENT`）-> 返回 `[]`，除非通过 `throwIfMissing: true` 要求报错。
- 大小至少为 8 MiB 的当前文件使用流式 JSONL 加载器；更小的文件或非文件存储则读取完整文本。
- 格式错误的记录由宽松的 JSONL 解析器跳过并计数。
- 可选的固定宽度标题槽会被移除并并入头部。
- 如果第一个逻辑条目不是有效的会话头部（`type !== "session"` 或缺少字符串 `id`）-> 返回 `[]`。

`SessionManager.setSessionFile()` 的行为：

- 对于缺失或确实为空的文件，会在该确切路径初始化新会话，并立即将头部实体化。相反，`SessionManager.open(..., { throwIfMissing: true })` 会拒绝缺失/空输入。
- 对于非空但开头没有有效会话头部的数据，会拒绝加载且不修改文件。因此，仅返回数组的 `loadEntriesFromFile()` 结果 `[]` 无法区分空输入和损坏输入；管理器使用 `loadSessionFile()` 诊断。
- 有效文件会被加载，按需迁移，解析 blob 引用，然后建立索引。迁移、跳过格式错误记录以及对已加载 OpenAI 回放内容的清理，都会将下次持久化操作标记为需要完整重写。
- 只有可以进入记录的 cwd 时才会采用它。否则，运行时 cwd 保持为启动/当前目录，而会话记录仍留在原位置；工作区根目录编辑仅在运行时有效，直到重定位为止。

## 树与叶节点语义 \{#tree-and-leaf-semantics}

底层模型是仅追加的树 + 可变的叶节点指针：

- 常规追加方法创建一个新条目，其 `parentId` 为当前 `leafId`，然后推进叶节点。
- `appendMessageToBranch()` 追加到显式父节点，而不移动活动叶节点。当发起调用的父节点不再活动时，`appendModelUsage()` 同样保留后继分支的叶节点。
- `branch(entryId)` 仅移动 `leafId`；现有条目保持不变。
- `resetLeaf()` 设置 `leafId = null`；下次追加会创建新的根条目（`parentId: null`）。
- `branchWithSummary()` 将叶节点设为分支目标，并追加一个 `branch_summary` 条目。

`getEntries()` 按插入顺序返回所有非头部条目。没有单独持久化的叶节点字段：加载时会根据最后一个物理条目重建叶节点。因此，仅改变指针的 `branch()`/`resetLeaf()` 操作需要后续追加，才能在重新加载后保留。`discardEntryDurably()` 会追加一个元数据分支标记并重写日志，使被丢弃路径的状态持久生效。

`createBranchedSession(leafId, { copyArtifacts? })` 创建一个新标识，其中仅包含选定的根到叶路径。它丢弃旧标签记录，并为保留条目重新创建解析后的标签。与完整派生不同，它不会继承模型提供方提示词缓存键。启用 `copyArtifacts` 时（`AgentSession.fork(entryId)` 使用此选项），产物目录会在后台复制，而新的产物管理器会等待复制完成后才分配 id 或解析溢出文件（`local://N.log`），与移动到同级文件时一样。

## 上下文重建（`buildSessionContext`） \{#context-reconstruction-buildsessioncontext}

`buildSessionContext(entries, leafId?, byId?, options?)` 解析要发送给模型的内容。`options.transcript: true` 则构建用于显示的会话记录。完整会话记录模式会以内联方式保留上下文压缩；`collapseCompactedHistory` 只渲染当前压缩后的尾部，`keepDanglingToolCalls` 则在轮次中途 UI 重建时保留仍在运行的工具调用。

算法：

1. 确定叶节点：
   - `leafId === null` -> 返回空上下文。
   - 显式 `leafId` -> 如果找到对应条目，则使用它。
   - 否则回退到最后一个条目。
2. 沿 `parentId` 遍历到根，遇到重复 id 时停止以限制损坏循环，然后反转为根->叶顺序。
3. 沿路径派生运行时状态：
   - 根据最新 `thinking_level_change` 获取解析后的和配置的思考选择器
   - 根据最新 `service_tier_change` 获取服务层级
   - 根据 `model_change` 条目获取模型映射（`role ?? "default"`）；助手消息推断只是旧版回退机制，仅在尚未出现显式默认值时使用
   - 去重后的 `injectedTtsrRules`
   - 根据最新 `mode_change` 获取模式/模式数据（默认模式为 `"none"`）
4. 选择输出边界：
   - 更晚的 `reset_boundary` 会从模型上下文和折叠的实时会话记录中隐藏截至该边界的所有内容
   - 否则，最新的上下文压缩输出其摘要及保留/压缩后消息（模型提供方原生替换历史可提供保留的模型上下文）
   - 完整会话记录导出保留重置前的历史，并按时间顺序渲染上下文压缩
5. 将 `message`、`custom_message` 和 `branch_summary` 条目转换为消息。其他条目类型仅影响回放状态或元数据。
6. 从回放中移除悬空工具调用（除非显式要求在轮次中途会话记录中保留），同时清除重写轮次上受保护推理元数据的效力；从模型上下文中丢弃不安全的已中止/错误助手轮次及其配对的工具结果。

## 持久化保证与失败模型 \{#persistence-guarantees-and-failure-model}

### 持久化与内存 \{#persist-vs-in-memory}

- `SessionManager.create/open/continueRecent/forkFrom` -> 持久化模式（`persist = true`）。
- `SessionManager.inMemory` -> 使用 `MemorySessionStorage` 的非持久化模式（`persist = false`）。

### 写入流水线 \{#write-pipeline}

一旦跨过延迟文件创建门槛，常规已完成追加会同步更新内存和本地文件存储。没有 `fsync`，因此成功的本地写入可以防范软件崩溃，但不能防范断电。带索引的 Redis/SQL 后端立即更新本地视图，但通过有序异步队列向远端发布；必须调用 `flush()`/排空后端才能确认这些写入。标题更改和原子批次各有需要等待完成的持久化路径。流式部分文本直到完整消息被追加时才会持久化。

- 新的普通会话在包含助手消息或调用方调用 `ensureOnDisk()` 之前，仅保存在内存中。
- 在此门槛之前，条目保留在内存中；跨过门槛时会写入完整的标题槽、头部和累积条目。
- 显式 `newSession()`（包括 `/new`）在返回前调用 `ensureOnDisk()`，以便跨终端保留空会话边界。`/delete` 的后继会话（`drop`）是例外：它保持延迟创建，因为 fresh 终端面包屑已将此终端固定到该会话，而删除失败会使前任会话仍成为合法的恢复目标；零轮次退出不得留下空文件。
- 此后，条目以增量方式追加。
- 保存编辑器草稿会强制生成可被发现的头部，并存储带标记的 `draft.txt`；如果草稿消失且仅剩启动元数据，关闭时会移除这个仅有草稿的会话。显式调用过 `ensureOnDisk()` 的会话仍可恢复。
- 并发的已完成追加会以权威的全正文重写取代进行中的原子重写，以防过期发布覆盖它们。
- 已排队的带索引完整重写在确认之前保持非当前状态。当受防护的重写在被后继操作取代后才落盘时，管理器会先验证该持久化正文并记录其字节大小，然后重试较新的会话记录。

### 持久性操作 \{#durability-operations}

- `flush()` 排空异步磁盘/存储队列和打开的写入器（无 `fsync`）；`flushSync()` 同步排空支持同步的工作，或重写非当前文件。它无法确认已排队的远程发布；这些后端仍要求等待 `flush()`/排空完成。
- 原子完整重写使用存储的 `writeTextAtomic`，带提交防护和预期字节大小前置条件；文件存储先暂存，再通过重命名覆盖目标，包括可安全处理 EPERM 的先移开目标回退机制。
- 本地追加和发布共享一个跨进程发布锁。字节大小发生变化会引发 `SessionWriteConflictError`；锁争用会引发 `SessionLockError`，且不发布暂存的重写。这不是内容哈希比较，无法防范不遵守协议的外部写入方。
- `FileSessionStorage` 在进程写入的每个会话上持有归该进程所有的操作系统租约，以会话 id 而非文件路径为键，因此每个访问同一日志的进程（无论通过符号链接、硬链接还是移动后访问）都会遇到同一租约。该租约是对 `<session-owners>/<session-id>` 使用 `pi-utils` 的 `tryAcquireFileLock`，其中 `<session-owners>` 为跨配置档案共享的 `~/.omp/run/session-owners`（XDG：`$XDG_STATE_HOME/omp/run/session-owners`）：Windows 上为不创建文件的命名互斥量；Linux 上为打开文件描述（`F_OFD_SETLK`）锁，macOS 和其他 Unix 上为 `flock`，后两者都作用于该目录中的伴随文件。在 Linux 上，如果旧版 omp 构建仍绑定着租约的抽象套接字名称，也视为租约已被持有。仅写入路径会认领租约，因此第一个写入会话的进程拥有它；打开会话进行检查（`omp share`、`--export`、`render`）绝不会认领。同一进程中的管理器共享租约；关闭或切换会话时释放租约，进程退出时内核也会将其释放。主目录或状态目录不同的进程不会遇到同一租约。直接复制会话文件会保留其 id，因此当原文件的写入进程仍存活时，写入副本的进程会改用同级文件；协作访客的副本使用自己的 id（`parentSession` 为宿主的 id），因此绝不会与宿主争用。
- 进程绝不写入租约由其他存活进程持有的会话：首次写入会将会话移到同目录中新建的同级 `<timestamp>_<new-session-id>.jsonl`，在那里一次性发布完整的内存会话记录，然后继续增量追加。所有者的文件保持不变。与 `fork` 一样，同级会话获得新的会话 id，`parentSession` 指向旧会话，并保留模型提供方提示词缓存键，因此按 id 恢复、标题索引和选择器绝不会看到两个文件使用同一 id。产物目录在后台复制，不会覆盖移动后的会话已写入的文件；其产物管理器等待复制完成后才分配 id 或解析溢出文件，`flush()`/`close()` 也会等待复制完成。绕过产物管理器的 `local://` 和 `agent://` 读取，在复制完成前可能找不到移动前的文件。
- `moveTo()` 会在移动任何内容或创建任何目录之前，拒绝移动由其他存活进程写入的会话，或替换其会话（按头部 id 识别）正被其他存活进程写入的目标文件。
- 其他程序可以在不认领的情况下检查归属：`isSessionLeaseHeld(sessionId)`、`omp session lease --json -- <id>...`（`{"held": [...], "unknown": [...]}`）和 RPC `get_session_lease` 只观察而不获取租约（Linux 上使用 `F_OFD_GETLK` 查询并对旧抽象套接字名称进行连接探测，其他 Unix 上使用 `F_GETLK`，Windows 上列出 `\BaseNamedObjects` 目录），因此绝不会导致并发认领使会话派生。
- 在 `bun test` 下，租约目录是 `<os temp>/omp-test-session-owners-<uid>`，而非真实状态目录。加载 `session-storage` 时会将其导出为 `PI_TEST_SESSION_OWNERS_DIR`；如果测试生成了会写入会话的 omp 进程，必须传入 `env: process.env`（Bun 默认使用启动环境），或在 `ci-test-ts` 下运行，其子进程会继承 `PI_TEST_RUNTIME=1` 并派生出相同目录。
- 在文件和内存后端上，完整重写期间针对持久化字节的 `SessionWriteConflictError` 意味着没有租约的写入方（旧版 omp、外部工具）更改了文件。管理器会重新读取文件，将自身缺少的条目保留为旁支（活动叶节点仍保持自身的），并根据读到的大小重试，每次重写最多三次。如果该写入方在每次重试中都更改文件，会话会将文件留给它，并移到同级文件（`reason: "contested"`），而不是在此后的每次写入中重新序列化会话记录。已删除文件会重新创建；读取后不再属于此会话的文件保持不变，会话则移到同级文件。带索引后端会继续报告冲突，因为在那里可能是管理器与自己尚未确认的发布发生竞争。
- `appendEntriesAtomically()` 将同步回调中的追加归为一次原子发布。失败时回滚暂存条目，并修复保留的并发工作。
- 重写用于重命名、条目重写、迁移/清理、移动/派生以及恢复。会话标题更改通常更新固定宽度标题槽，并追加 `title_change` 审计条目，而不重写正文。

### 错误行为 \{#error-behavior}

- 常规追加失败会被锁存，并携带会话文件上下文只记录一次，而不会抛入轮次循环。后续追加可能重试完整的内存日志；`flush()`/`flushSync()` 和关闭操作会暴露尚未解决的失败。
- `onPersistenceNotice` 以 `SessionPersistenceNotice`（`reason`、`from`、`to`）报告会话移到同级文件；它不锁存任何错误，也绝不会传递到 `onPersistenceError`。与锁存的失败类似，迄今触发的每条通知都会回放给每个新订阅者。交互模式以警告显示，打印模式输出到 stderr，RPC 则作为 `warning` 通知帧，各自都使用相对主目录的路径。
- 原子批次和恢复路径会尝试权威修复。如果发布可能已经发生，而无法证实修复已持久化，`SessionPersistenceIndeterminateError` 会携带原始错误和恢复错误，以封闭方式失败。
- 写入器关闭会传播第一个有意义的错误。最终释放会封闭管理器，使迟到的追加/重写变为无操作，然后释放保留条目，避免已释放的管理器覆盖唤醒后的会话记录。

## 数据大小控制与 blob 外置 \{#data-size-controls-and-blob-externalization}

持久化条目之前：

- 超过 500,000 个字符的字符串会用 `"[Session persistence truncated large content]"` 截断，但已签名/加密的模型提供方块、签名字段、已验证的 Anthropic 原生 Web/工具搜索历史块、Anthropic 服务端上下文压缩回放载体，以及 Cursor 服务端记录（`cursorHistory` 载荷）除外，它们必须保持字节完全一致才能回放。
- 移除临时的 `jsonlEvents`。
- 如果对象同时有字符串 `content` 和数字 `lineCount`，则在截断后重新计算行数。
- `image_url` 字段中的图像数据 URL 始终会在 blob 存储中按内容寻址，并替换为 `blob:sha256:<hash>`，与长度无关。图像 `content` 块、`images[]`、snapcompact `frames[]` 和图像生成结果中至少 1,024 个字符的 Base64 载荷会被外置。
- 当权威推理项已存在于 `providerPayload` 时，会省略冗余的 OpenAI Responses `thinkingSignature` 副本。
- 当渲染后的结构化输出已存在于其截断产物中时，溢出存储的 MCP 工具结果会省略重复的 `details.structuredContent`。

这些投影不会更改实时条目。加载时，普通的持久化图像引用会被解析回内联载荷。snapcompact 帧保持延迟状态，直到上下文重建选中它们。对于帧被旧版持久化代码截断的归档，会回退到其保留文本或未损坏的帧。

## 存储抽象 \{#storage-abstractions}

`SessionStorage` 负责 `SessionManager` 使用的类文件系统操作：同步的目录/存在性/写入/stat/列出操作；异步读取、切片读取、写入、受防护的原子写入、重命名、unlink、感知产物的删除、标题更新、写入器创建和后端排空。可选能力包括同步读取、已确认的远程写入、助手轮次扫描、文件锁定、会话归属认领和条件式感知产物删除。

实现和适配器：

- `FileSessionStorage`：真实的本地文件
- `MemorySessionStorage`：用于非持久化会话和测试的、基于映射/分块的内存存储
- `IndexedSessionStorage`：Redis/SQL 支持的存储所用的共享本地索引和有序远程发布

`SessionStorageWriter` 暴露 `append`、可选的 `appendSync`、`flush`、可选的 `flushSync`、`isOpen`、`close` 和 `getError`。

### 手动存储维护 \{#manual-storage-maintenance}

`omp gc` 默认预览维护操作；必须指定 `--apply`，才能清扫未被引用的 blob、归档符合条件的冷会话、对数据库 WAL 执行检查点，或清理过期状态。存储维护与模型上下文压缩相互独立。

会话阶段还会在会话记录重写临时文件（`.<name>.jsonl.<snowflake>.tmp`，以及已注册 `--session` 文件旁的相同模式）超过 5 分钟写入宽限期后移除它们。正在进行的重写会在几毫秒内将临时文件重命名到位，因此更早的临时文件是被终止或崩溃的写入进程留下的。

过期状态阶段需显式启用：仅在指定 `--stale` 或启用 `gc.stale` 时运行（默认关闭），因此不带此限定的 `omp gc --apply` 绝不会删除报告或副本。对于会话文件已不存在的 `custom-session-files` 标记和终端面包屑，满一天后会将其移除（延迟会话的标记所指会话记录仅在首次轮次时写入）。记录为 fresh `/new` 边界的面包屑始终保留：`--continue` 在其会话记录存在之前就会遵循它，会话实体化时会重写它，或由该终端的下一个会话替换它。对于默认智能体目录，或名为 `agent` 且其父目录被视为配置根目录的自定义智能体目录，还会使调试报告包（`reports/*.tar.gz`）和协作访客副本（`collab/*.jsonl` 及其产物目录和自定义会话标记）过期，前提是它们既不在最新的 `gc.staleRetainNewest` 个之内（默认 20），又早于 `gc.staleRetainDays` 天（默认 30）。终端面包屑指向的副本，或运行中的访客保持打开的副本，会被保留。过期状态清理先于 blob 清扫，因此仅被过期副本引用的 blob 会在同次运行中清除。

压缩阶段也需显式启用：`--compress` 或 `gc.compress`（默认关闭）。当会话记录已空闲 `gc.compressAfterDays` 天（默认 7，`--compress-after-days`）后，它会使用文件系统的透明压缩存储会话的每个文件（会话记录及其产物树）；写入时间更近的文件会被跳过。仅对仍有文件需要压缩的会话获取会话归属租约：如果某个运行中的进程持有其会话记录或产物树内任意嵌套会话记录的租约（子代理会话，不论文件名如何，均按会话头部识别），则跳过该会话；重写文件期间会一直持有这些租约。与归档不同，最后一轮被中断的会话也符合条件，因为它仍可恢复。路径、字节和 mtime 均不变，也不删除任何历史或统计行，因此压缩后的会话仍然会列出、可恢复且可搜索。具有单个链接且跨越多个文件系统块的普通文件符合条件；已经压缩的格式（`.gz`、`.zst`、图像）会被跳过。会话根目录所在的卷决定使用的方法：

- **APFS（macOS）：** 通过将目录的设备与挂载表中的 `apfs` 条目匹配来检测。`ditto --hfsCompression` 会将保留原始 mtime（精确到纳秒）的压缩副本写入原文件旁新建的 `.omp-gc-compress-XXXXXX` 临时目录，该目录带有所有者标记。仅在副本的大小和 SHA-256 匹配且占用空间更少时，才会替换原文件；紧接重命名之前，原文件的 inode、大小和 mtime 必须仍与选定时的值一致，且仍只有一个链接，会话记录的检查和重命名在串行化追加的会话发布锁下执行。被终止的运行留下的临时目录会在下次 `--compress --apply` 运行时从会话根目录和归档根目录下移除；同名但没有所有者标记的目录仅在为空时才移除。统计同步和仪表板监视器会跳过 `.omp-gc-compress-*` 目录，因此绝不会摄入临时副本。被替换的文件具有新的 inode，因此下次统计同步会将每份已压缩会话记录从头重新读取一次；它会替换该会话的行，而不是重复添加。追加到压缩文件会使其重新以未压缩方式存储，后续运行会再次处理它。
- **NTFS（Windows）：** 使用 `GetVolumeInformationW` 检测，该调用必须报告支持按文件压缩的 NTFS。`compact /c` 会原地为每个文件设置 LZNT1 压缩，保留其 inode 和时间戳；后续追加也以压缩方式存储。不使用 WOF（`compact /exe`），因为一次写入会解压整个文件。

其他文件系统会将该阶段报告为不受支持。

剥离阶段也需显式启用：`--strip` 或 `gc.strip`（默认关闭）。模型提供方会返回只有自身才能读回的状态，omp 会持久化这些状态，以便恢复的轮次原生回放：已签名和加密的推理、为提示词缓存保留的逐字传输响应、请求控制项、已上传文件引用。当会话记录已空闲 `gc.stripAfterDays` 天（默认 30，`--strip-after-days`），超过每个模型提供方的缓存和响应保留期后，该阶段会重写记录并去掉这些状态：增量 OpenAI Responses 历史、Cursor 和 Gemini 原生历史、`requestControls`、`inputTransformations`、不透明的 `thinkingSignature`、`itemId`、`redactedThinking` 块、工具调用的 `thoughtSignature` 和剩余流式状态，以及图像 `providerFile` 引用。此后，每个轮次读起来就像由另一个模型记录的轮次，而所有模型提供方本就能回放此类轮次（推理作为纯文本，或完全不回放推理）。最新回放轮次会保留全部内容：其中由工具结果连接起来的一连串助手响应，模型提供方将其作为一条助手消息回放，并作为整体进行验证，因为恢复后的工具循环必须原样回放其中每条响应的推理。在其他位置没有副本的状态也会保留：推理来源标记（`reasoning_content`，包括 chat-completions 的 `reasoning_details` 封装携带的那个标记，该封装会被精简为此标记）、文本签名（OpenAI 消息阶段）、Anthropic 消息控制项和原生上下文压缩块、OpenAI 快照历史，以及上下文压缩条目（OpenAI 远程上下文压缩所存储的摘要只是其加密历史的占位内容）。该阶段覆盖每个会话的会话记录及其产物树中的子代理会话记录，遵循与压缩相同的归属租约规则，也覆盖已归档的 `.jsonl.gz` 会话，后者会被重新压缩。不含回放数据的行保留原始字节，包括标题槽，会话记录也保留其 mtime，因此会话排序不变；统计数据库会对重写后的会话记录重新解析一次。该阶段在归档和压缩之前运行，因此两者存储的都是剥离后的会话记录。

要在不运行命令的情况下压缩，请启用 `gc.autoCompress`（默认关闭）。交互式会话绘制第一帧后，如果距离上次后台运行至少已过一天，且会话目录支持压缩，omp 就会以低 CPU 优先级启动一个分离的 `omp gc --compress --apply` 进程。支持检测通过压缩会话目录中的一次性探测文件进行，因此，对于压缩器会将文件存为未压缩状态的卷（macOS 27 的 `ditto --hfsCompression`，#16244），不会每天复制并计算哈希；检测失败时，`gc-auto-compress.log` 会记录原因，下次检测在一天后进行。启动时会在以日志为键的操作系统锁下认领该次运行，并在持锁期间重新检查间隔，因此同时启动只会产生一个子进程。子进程的寿命不受启动它的会话限制，会将摘要写入智能体目录中的 `gc-auto-compress.log`，该文件的 mtime 标记上次运行时间；如果生成进程失败，则移除日志，以便下次启动重试。子进程像其他 gc 运行一样获取 `gc.lock`，因此，如果发现 gc 已在运行，本次运行会退出并将该错误写入日志，一天后重试。能够压缩但没有缩小的文件仍是候选项，会在后续运行中再次复制。打印、RPC 和 ACP 启动绝不会启动此过程。

blob 引用扫描、归档历史/统计协调、gzip 创建和回滚期间，日志载荷 I/O 使用流式处理。活动的 `.jsonl`、可恢复的 `.jsonl.*.bak` 和已归档的 `.jsonl.gz` 记录都参与引用发现，包括格式错误 JSON 文本中的引用。压缩扫描必须排空并验证完整流，其结果才可授权删除。归档在解压后保留原始 JSONL 字节（减去剥离阶段移除的回放数据），产物树保持现有布局。

流式处理避免将整个日志实体化，但不会使 GC 的内存占用变为常数。单条长记录、引用集合以及历史/统计标识集合仍会占用内存。归档发布期间，原始文件和临时压缩输出也会同时存在。

## 会话发现实用工具 \{#session-discovery-utilities}

发现辅助函数位于 `session-listing.ts`；`SessionManager` 暴露项目作用域的包装方法：

- `getRecentSessions(sessionDir, limit?)` -> 轻量的欢迎页元数据，默认上限为 4
- `findMostRecentSession(sessionDir)` -> 按 mtime 取最新会话
- `findMostRecentNonEmptySession(sessionDir)` -> 最新的可恢复内容，供 `continueRecent` 使用
- `listSessions(sessionDir, storage)` / `SessionManager.list(...)` -> 带生命周期状态的项目作用域列表
- `listSessionsReadOnly(...)` -> 相同元数据，但不进行备份恢复
- `listAllSessions(storage)` / `SessionManager.listAll()` -> 托管会话根目录下的项目存储桶，不包括任意自定义目录
- `SessionManager.listForPicker(...)` / `listAllForPicker()` -> 置顶优先列表，移除无标题且无提示词的零轮次占位会话；已置顶的占位会话仍可选择
- `resolveResumableSession(...)` -> 本地查找，然后可选地回退到全局

`getRecentSessions()` 对文件状态排序，并首先在 `history.db` 的 `session_titles` 索引中查找标题；未建立索引的文件回退到内容扫描并回填标题。`findMostRecentSession()` 读取 4 KiB 前缀。启用状态的完整/非空扫描会读取该前缀以及最多 32 KiB 的尾部。扫描以 stat 为键并缓存；大型完整列表使用有界并行工作进程。常规的逐目录扫描还会在主 JSONL 缺失时恢复最新的孤立 EPERM 备份。

`SessionManager.list()`/`listAll()` 将置顶会话排在前面；原始列表辅助函数按最新优先排序。空内容过滤仅用于选择器/继续会话，不用于 id 查找或维护。恢复匹配不区分大小写，接受会话 id 前缀、完整文件名前缀，或时间戳后的 id 后缀。显式指定 `sessionDir` 会禁用全局回退，除非请求 `allowGlobalFallback: true`。

## 相关但独立：提示词历史存储 \{#related-but-distinct-prompt-history-storage}

`HistoryStorage`（`history-storage.ts`）是独立的 SQLite 子系统，用于提示词召回/搜索，而非会话回放。

- 数据库：`~/.omp/agent/history.db`
- 表：`history(id, prompt, created_at, cwd, session_id, use_count)`，其中 `prompt` 唯一
- FTS5 索引：`history_fts`；新提示词通过插入触发器建立索引
- 规范化换行符和首尾/行尾空白，然后在整个数据库范围内对提示词去重
- 重新提交会更新最新时间戳/cwd/会话来源，并递增 `use_count`
- `add()` 在返回已兑现的 promise 前同步写入；失败会记入日志而不抛出
- 同一数据库还包含独立的 `session_titles` 表和仅追加的 `session_recaps` 表。空闲回顾不会进入会话 JSONL 或模型上下文。

使用会话文件进行对话图/状态回放；使用 `HistoryStorage` 提供提示词历史交互体验。
