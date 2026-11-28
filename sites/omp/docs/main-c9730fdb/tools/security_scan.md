---
title: "security_scan"
description: "Oh My Pi 官方仓库文档：security_scan。"
---

# security_scan \{#security_scan}

> 规划并运行 OMP 原生安全审查、验证已存储的发现，并显式与 Codex Security 云扫描交互。

## 可用性与前提条件 \{#availability-and-prerequisites}

- `security.enabled` 默认为 `false`。禁用时，`security_scan` 不会包含在可用工具集中，`security://` 读取会失败并提示启用。在 **Settings → Tools → Security** 中启用，或设置 `security.enabled = true`。
- 该工具可被发现，使用严格模式，并归类为 `exec`。
- 原生 `preflight` 需要 Git 仓库、当前模型以及会话模型/身份验证注册表。它会在可用时选择已存储的 OAuth 凭据。没有此类凭据时，只接受提供方元数据中显式声明的提供方自有身份验证 API：目前为 Amazon Bedrock（`bedrock-converse-stream`）和 Bedrock Mantle（`openai-responses`）。不接受普通的仅 API 密钥提供方。
- 如果存在多个 OAuth 账户且没有活跃账户，请传入 `credential_id`；只有一个账户时会自动选中。不可变计划固定凭据行以及记录的账户/工作区身份。执行和令牌刷新始终使用该行，不会轮换到其他账户。
- 云操作需要 `openai-codex` ChatGPT OAuth 凭据。它们调用 ChatGPT 的 Codex Security 云控制平面，而不是公共 OpenAI API，并且绝不会作为原生扫描的回退方案。

## 源码 \{#source}

- 公共工具与模式：`packages/coding-agent/src/tools/security-scan.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/security-scan.md`
- 原生规划与新鲜度检查：`packages/coding-agent/src/security/preflight.ts`
- OAuth 选择与提供方自有身份验证边界：`packages/coding-agent/src/security/auth.ts`
- 后台执行：`packages/coding-agent/src/security/coordinator.ts`
- 仅用于扫描的发布工具：`packages/coding-agent/src/security/publication.ts`
- 权威存储与输出文件：`packages/coding-agent/src/security/store.ts`
- 云客户端/导入：`packages/coding-agent/src/security/cloud.ts`
- 只读资源：`packages/coding-agent/src/internal-urls/security-protocol.ts`

## 输入 \{#inputs}

| 字段 | 类型 | 使用方 | 说明 |
| --- | --- | --- | --- |
| `action` | `"preflight" \| "start" \| "status" \| "cancel" \| "validate" \| "cloud_scans" \| "cloud_start" \| "cloud_status" \| "cloud_pull"` | 全部 | 必填的分派选择器。 |
| `plan_id` | `string` | `start` | `preflight` 返回的计划 ID。 |
| `operation_id` | `string` | `status`、`cancel` | `start` 返回的操作 ID。 |
| `target_kind` | `"repository" \| "scoped_path" \| "ref_diff" \| "working_tree"` | `preflight` | 默认为 `repository`。 |
| `include_paths` | `string[]` | `preflight` | 包含在不可变作用域中的仓库相对路径。`scoped_path` 要求至少一个非空白值。 |
| `exclude_paths` | `string[]` | `preflight` | 从作用域中移除的仓库相对路径。排除优先于包含。 |
| `base_revision` | `string` | 使用 `ref_diff` 的 `preflight` | 与 `head_revision` 一起必填；在预检期间解析为提交。 |
| `head_revision` | `string` | 使用 `ref_diff` 的 `preflight` | 与 `base_revision` 一起必填；在预检期间解析为提交。 |
| `knowledge_base_paths` | `string[]` | `preflight` | 相对于仓库根目录解析、规范化，并通过 SHA-256 和大小固定的文件。 |
| `output_root` | `string` | `preflight` | 可选的外部结果目录。它须位于仓库外，路径规范、不含符号链接，且为空，除非 `archive_existing=true`。 |
| `archive_existing` | `boolean` | `preflight` | 默认为 `false`。允许在执行开始时，将非空输出目录重命名为 `<output_root>.archive-<scan-id>`。 |
| `credential_id` | 正整数 | 原生 `preflight`；每个云操作 | 固定一个已存储的 OAuth 凭据。原生扫描为当前模型提供方选择它；云操作为 `openai-codex` 选择它。显式指定不可用的 ID 会失败，而不会使用提供方自有身份验证。 |
| `scan_id` | `string` | `validate` | 包含该发现的已存储扫描。 |
| `finding_id` | `string` | `validate` | 要更新的已存储发现。 |
| `validation_status` | `"unvalidated" \| "validated" \| "rejected" \| "partial" \| "error"` | `validate` | 新的验证状态。 |
| `validation_summary` | `string` | `validate` | 必填的非空白验证说明。 |
| `validation_evidence` | `{label: string, explanation: string}[]` | `validate` | 可选证据，作为验证证据追加；标签须非空。 |
| `cloud_configuration_id` | `string` | `cloud_status`、`cloud_pull` | Codex Security 云配置 ID。 |
| `repository_id` | `string` | `cloud_start` | 必填的云仓库标识符。 |
| `repository_url` | `string` | `cloud_start` | 必填的云仓库 URL。 |
| `environment_id` | `string` | `cloud_start` | 必填的云环境标识符。 |
| `lookback_days` | 正整数或 `"all"` | `cloud_start` | 默认为 `30`；`"all"` 发送不设限制的回溯范围。 |

不读取某些可选字段的操作会忽略这些未使用的字段。

## 输出与执行模型 \{#outputs-and-execution-model}

每个操作返回一个文本内容块，以及包含 `action` 和下文所述操作特定对象的结构化 `details`。工具自身不会流式输出部分参数或进度更新。`start` 会立即返回一个操作；作业管理器可用时，由 OMP 作业报告进度，否则协调器运行其本地后台 Promise。使用 `status` 获取持久化操作状态。

## 操作参考 \{#action-reference}

### `preflight` \{#preflight}

`preflight` 解析并持久化一个不可变计划，然后返回：

```text
Security plan <plan-id> is ready. Fingerprint: <fingerprint>. Start it with action=start and plan_id=<plan-id>.
```

`details` 为 `{ action: "preflight", plan: { id, fingerprint } }`。

计划固定以下内容：

- 规范化的仓库根目录和规范化的包含/排除作用域；
- 目标快照；
- 适用时，已解析的引用差异版本和差异摘要；
- 当前提供方/模型（规划 API 也支持思考级别，但公共工具不传入该项）；
- 确切的 OAuth 凭据和记录的账户/工作区身份，或受支持的提供方自有提供方/API 边界；
- 知识库文件身份；
- 输出策略；
- 安全设置快照以及协调器提示词/工作流的指纹。

对于 `repository`、`scoped_path` 和 `working_tree`，目标摘要涵盖作用域内已跟踪和未跟踪文件的路径与内容、可执行位、符号链接目标，以及当前 HEAD（或 `unborn`）。`ref_diff` 则对已解析的 base/head 提交及其原始树差异生成指纹。作用域路径须为仓库相对路径、须存在且解析到仓库内部，并会被规范化、去重和排序。

如果省略 `output_root`，预检会在项目的 OMP 安全状态下分配一个私有的唯一目录。调用方提供的输出目录若不存在，会在预检期间创建；其父目录须已有规范身份。非空目录要求 `archive_existing=true`。

### `start` \{#start}

`start` 加载存储的计划，并根据当前目标、安全设置、知识库、输出策略和工作流重新计算其指纹。不匹配时会失败并返回：

```text
Security scan plan is stale: expected <old>, got <new>. Run security preflight again.
```

成功时，在注册后台工作后立即返回：

```text
Security scan <scan-id> started as <operation-id>.
```

`details.operation` 包含 `operationId`、`planId`、`scanId`、`phase`、时间戳、`findingCount`，以及可用时的 `jobId`、`sessionFile` 或 `error`。

操作阶段为：

```text
queued → preparing → reviewing → publishing → completed
```

其他终态为 `partial`、`cancelled` 和 `failed`。协调器创建受限、自动批准的扫描会话，配备只读仓库检查工具、只读 LSP，并且任务工作者只有 `security-reviewer`。扩展发现、MCP 和 IRC 均禁用。模型回退和账户轮换均禁用。

对于 `ref_diff`，执行会在固定的 head 版本处创建分离的临时工作树，并向审查会话提供固定的差异；清理时会移除该工作树。其他目标类型直接审查仓库根目录。

### `status` \{#status}

要求 `operation_id`。返回：

```text
Security scan <scan-id>: <phase>; <count> finding(s).
```

完整操作快照位于 `details.operation`。终态操作会跨会话从项目存储中恢复。进程重启会将持久化的 `running` 或 `planned` 扫描标记为 `failed`，注明 `Security scan was interrupted by a process restart`，并清理引用差异目标工作树。未知 ID 会抛出 `Unknown security operation: <id>`。

### `cancel` \{#cancel}

要求 `operation_id`。运行中的异步作业通过作业管理器取消；否则协调器会中止其本地控制器和扫描会话。结果为以下之一：

```text
Cancellation requested for <operation-id>.
No running operation <operation-id>.
```

`details.cancelled` 报告请求是否被接受，操作存在时会包含 `details.operation`。已处于终态的操作和未知操作返回 `false`。

### `validate` \{#validate}

要求 `scan_id`、`finding_id`、`validation_status` 和非空白的 `validation_summary`。它更新权威存储中的发现，并可选地追加生成的验证证据记录：

```text
Finding <finding-id> validation is now <status>.
```

`details.finding` 包含发现 ID 和验证状态。扫描/发现缺失或必填字段缺失会失败，而不会创建新发现。

### `cloud_scans` \{#cloud_scans}

列出所选 ChatGPT 账户可见的所有分页配置。每行包含配置 ID、当前步骤、仓库 ID、环境 ID 和仓库 URL。不存在配置时，工具会说明。结构化配置在 `details.cloudConfigurations` 中返回。

### `cloud_start` \{#cloud_start}

要求 `repository_id`、`repository_url` 和 `environment_id`。它创建一个已启用的 Codex Security 云扫描配置，并消耗账户独立的云扫描额度。`lookback_days` 默认为 `30`。

文本会标明配置和仓库。`details.cloudScan` 包含 `{ id, repositoryUrl }`。

### `cloud_status` \{#cloud_status}

要求 `cloud_configuration_id`。它报告当前步骤以及已完成/待处理提交数量。`details.cloudStats` 还包含失败的提交、按严重程度划分的发现数量，以及服务公开的任何最近扫描提交/时间戳。

### `cloud_pull` \{#cloud_pull}

要求 `cloud_configuration_id`。它获取配置、状态以及所有归属于该配置的发现详情，将其转换为 OMP 的权威模式，生成报告和 SARIF，并持久化一个已完成的导入扫描。

除非当前项目具有 `origin` 远端，且其规范化仓库身份与云配置 URL 匹配，否则导入会以拒绝方式失败。云覆盖范围记录为 `unknown`，因为发现 API 不公开覆盖回执。`details.importedScan` 包含新扫描 ID 和发现数量。

## 原生发布与持久化 \{#native-publication-and-persistence}

`security_publish` 是内部的严格写入级工具，只在受限的原生扫描会话中可用；它不是普通调用方操作。协调器要求扫描智能体调用它一次，携带以下内容：

- 去重的发现，包含规则、标题、摘要、严重程度、置信度、类别、至少一个作用域内位置、可选的证据/修复建议/CWE，以及验证状态；
- 如实的覆盖完整性、已审查范围、排除项、延后工作和待解决问题；
- 最终 Markdown 报告。

发布时会根据被审查树（对 `ref_diff` 而言是固定的 head 工作树）中的实际文件和行数，检查引用的发现位置和证据位置。路径缺失/不可读或行号越界的发现会被扣留，并在 `details.droppedFindings` 中报告。有依据的路径须为仓库相对路径且位于作用域内。具有相同规范指纹的重复发现会去重。第二次成功发布调用会失败。如果扫描会话结束时未发布，扫描会持久化为 `partial`；成功发布即使在后续指标/输出刷新失败时仍保持 `completed`。

权威状态是私有的，并在 OMP 安全状态根目录下按项目建立键。已完成的原生输出目录包含：

- `scan.json`：公共扫描清单，最后写入，作为提交标记；
- `findings.json`；
- `report.md`；
- `results.sarif`；
- `provenance.json`：私有元数据已脱敏。

在非 Windows 平台上，目录权限加固为 `0700`，文件权限加固为 `0600`。

## 读取结果 \{#reading-results}

`security://` 命名空间为只读，且限定在项目作用域内；读取反映当前存储状态：

| URL | 结果 |
| --- | --- |
| `security://` | 命名空间索引。 |
| `security://scans` | 已存储扫描列表。 |
| `security://scans/<scan-id>` | 扫描摘要和子资源索引。 |
| `security://scans/<scan-id>/manifest` | 公共清单 JSON，包含计划。 |
| `security://scans/<scan-id>/findings` | 发现列表。 |
| `security://scans/<scan-id>/findings/<finding-id>` | 渲染后的发现、位置、证据和修复建议。 |
| `security://scans/<scan-id>/coverage` | 覆盖范围 JSON。 |
| `security://scans/<scan-id>/report` | Markdown 报告，存在时提供。 |
| `security://scans/<scan-id>/sarif` | SARIF JSON，存在时提供。 |
| `security://scans/<scan-id>/provenance` | 已脱敏的来源 JSON。 |

使用 `security_scan` 操作或显式安全命令进行变更；URI 读取绝不会验证、导入、取消或以其他方式修改状态。

## 示例 \{#examples}

规划并启动仓库扫描：

```json
{ "action": "preflight", "target_kind": "repository", "exclude_paths": ["vendor", "dist"] }
```

```json
{ "action": "start", "plan_id": "secplan_<id>" }
```

使用外部输出目录规划确切的版本差异：

```json
{
	"action": "preflight",
	"target_kind": "ref_diff",
	"base_revision": "origin/main",
	"head_revision": "HEAD",
	"output_root": "/tmp/omp-security-review"
}
```

验证一个发现：

```json
{
	"action": "validate",
	"scan_id": "secscan_<id>",
	"finding_id": "secfinding_<id>",
	"validation_status": "validated",
	"validation_summary": "Reproduced with an untrusted archive entry.",
	"validation_evidence": [{ "label": "Reproduction", "explanation": "The entry writes outside the extraction root." }]
}
```

显式启动云扫描，并在之后导入：

```json
{
	"action": "cloud_start",
	"repository_id": "repo_<id>",
	"repository_url": "https://github.com/owner/repo",
	"environment_id": "env_<id>",
	"lookback_days": 30,
	"credential_id": 7
}
```

```json
{ "action": "cloud_pull", "cloud_configuration_id": "scan_<id>", "credential_id": 7 }
```

## 错误与约束 \{#errors-and-constraints}

- 每个操作首先重新检查 `security.enabled`；禁用时直接执行会抛出 `Security is disabled. Enable security.enabled before using security_scan.`
- 操作特定的必填 ID、云仓库字段和验证摘要会去除首尾空白，并拒绝空白值。引用版本和路径数组则由规划验证处理。ArkType 会拒绝无效枚举值、非正数的凭据/回溯 ID，以及格式错误的验证证据。
- 原生扫描会拒绝缺失的 Git 上下文、未知引用、逃逸/不存在的作用域路径、无效知识库文件、不安全的输出目录、未知/过期计划、不可用的固定模型、OAuth 身份变更，以及不可用的固定凭据。
- 云请求在 HTTP 401 时强制刷新并重试一次，随后失败。其他非成功响应会报告状态和端点。
- `cloud_pull` 在导入前会验证仓库身份和配置归属。
- 取消采用协作方式。尚未发布的操作在后台运行处理完中止并持久化其终态包后达到 `cancelled` 终态；已发布的结果保持 `completed`。
