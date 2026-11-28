---
title: "find"
description: "Oh My Pi 官方仓库文档：find。"
---

# find \{#find}

> 语义 grep：描述你要寻找的内容，即可返回实现它的文件和行范围，每项均带有经过校准的相关性分数。在 UI 中显示为 `Find`。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/jfind/index.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/find.md`
- 主要协作组件：
   - `packages/coding-agent/src/tools/jfind/cascade.ts`：搜索策略及其并行数量受限的请求分发器
   - `packages/coding-agent/src/tools/jfind/keywords.ts`：查询 → 词法关键词（带引号的短语、停用词移除、低成本词干提取）
   - `packages/coding-agent/src/tools/jfind/lexical.ts`：原生 grep 关键词索引、IDF 权重、文件评分
   - `packages/coding-agent/src/tools/jfind/tree.ts`：符合条件的文件列表（拒绝列表、凭据过滤器）及带标签的目录树渲染
   - `packages/coding-agent/src/tools/jfind/passages.ts`：受字节数限制的窗口、摘要片段、热区范围合并
   - `packages/coding-agent/src/tools/jfind/questions.ts`：三种评判请求结构；问题文本位于 `packages/coding-agent/src/prompts/judge/find.json`
   - `packages/coding-agent/src/judgment/index.ts`：解析回答所有问题的 `judge` 模型角色
   - `packages/coding-agent/src/ui/tools/find.tsx`：会话记录渲染器（分数仪表、超链接范围、实时阶段进度）；`packages/coding-agent/src/tools/details/find.ts`：`FindToolDetails` 类型

该级联流程遵循 [jegrep](https://github.com/can1357/jegrep) 的语义搜索策略：词法预排序、文件名评判、段落摘要片段，然后验证完整段落。

## CLI \{#cli}

`omp find "<query>" [path] [-k keyword]... [--hidden] [--json] [-q]` 从 shell 运行同一个级联流程（`packages/coding-agent/src/cli/find-cli.ts`）：进度发送到 stderr，排序后的摘要（或包含命中与统计信息的 JSON）发送到 stdout。以宿主目录为范围时，由该目录提供用于解析 `judge` 角色的设置/扩展；文件/URL 范围则使用调用方的 cwd。命中路径在 cwd 内相对于 cwd，在 cwd 外为绝对路径，或为内部 URL。查询/根路径无效，或所有评判请求均失败时，以 1 退出。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `query` | `string` | 是 | 用自然语言描述要定位的行为或概念。带引号的短语会在词法阶段整体匹配。纯空白查询会被拒绝。 |
| `grep_keywords` | `string[]` | 是 | 除从 `query` 派生的关键词外，用于词法预排序的额外标识符或术语。没有具体想法时使用 `[]`。 |
| `path` | `string` | 否 | 要搜索的目录或单个文件：宿主路径或内部 URL（`omp://` 表示所有 harness 文档，`omp://<file>.md` 表示一篇文档，`skill://<name>`、`local://notes`）。路径相对于会话 cwd 解析（展开 `~`，裸 `/` 表示工作区根目录）。省略或为空时默认为 cwd。不存在的路径会被拒绝。URL 末尾的 `:start-end` 选择器也会被拒绝，因为 `find` 评判整个文件。 |

内部 URL 会在原位搜索：原生列表、词法扫描和文件读取均通过会话的 URL 文件系统（`InternalUrlFilesystem`，使用调用的审批等级：通常为 `read`，当 `path` 指向 `ssh://` 时为 `exec`，与 `grep` 相同），它与 bash 工具使用的是同一个文件系统。虚拟文档无需本地文件，以文件为支持的协议则解析到其宿主文件。URL 范围下的命中项是 URL（`omp://tools/read.md`）。可直接用 `read` 打开，包括使用 `:start-end` 选择器（`read omp://tools/read.md:50-100`）。隐藏文件会被排除，除非范围直接指定该文件。宿主命中路径在会话 cwd 内相对于 cwd，在 cwd 外为绝对路径，而非相对于被搜索目录，因此 `read` 和超链接无需知道搜索范围也能解析。

`find.enabled` 默认为 `auto`。当 `judge` 角色的第一个可用候选是原生评判器（例如 TypeSafe Jev 或 OpenAI Decisions）时，它会启用 `find`。基于提示词的设备端评判器和聊天评判器不符合 `auto` 条件。`on` 无论评判器类型都启用 `find`，`off` 则禁用。启用后，它是必备的顶层工具，绝不会作为工具命令挂载。

`find.hitThreshold`（大于 0 且不超过 1 的数字；未设置时保持 `0.20`）设置 τ，即文件被报告为命中所需的已验证段落概率，同时也是所列行范围的概率下限。它适用于工具和 `omp find`。默认值适合 TypeSafe Jev。决策模型的校准方式不同；如果某个评判器对无关段落给出的概率偏高，就需要更高的 τ 才能保持相同精确率。

`find.timeoutMs`（毫秒，`1000` 到 `600000` 之间的整数；默认为 `20000`）是一次 `find` 工具调用的墙上时钟预算。较慢或串行的评判器，例如一次只回答一个请求的自托管模型，需要更长的预算；`omp find` 不受此限制。

不知道实现位置时优先使用 `find`。已知字面文本、正则表达式或符号时使用 `grep`，按名称查找时使用 `glob`。将范围限定为已知子系统，并批量处理相关问题。低于约 `0.4` 的分数属于弱证据：在认定不存在之前，扩大描述范围或使用 `grep`。该工具没有隐藏文件选项；CLI 的 `--hidden` 不是工具参数。

## 输出 \{#outputs}

- 单个文本块，最强命中优先：
   - 头部 `N hit(s) for "query" (τ 0.20), strongest first`
   - 每个命中项：`path  score  N lines judged[, partial]`，后接最多三行 `path:start-end  p  snippet`（最强范围优先）
   - 页脚包含 `listed`、`judged`、读取的文件数和发送的字节数、请求数（若成功响应中有问题未获得可用答案，还会附带 `N unanswered`）、输入 token 数、费用以及墙上时钟/API 时间
   - 有任何失败时：显示 `failures:`，后接最多五条带阶段前缀的不同失败消息
- 无命中：`no hits for "query" (τ 0.20)` 加页脚；结果标记为 `useless`。
- 部分评判请求失败：头部之后显示 `partial: F of R judge requests failed; unjudged files may still match` 行。
- 至少验证出一个命中后，验证期间 20 秒预算耗尽：返回目前已验证的命中项，后接 ``partial: timed out after 20.0s with V of P passages verified; unverified files may still match. Narrow `path` for a complete search.``；`coverage` 为 `partial`，`details.timeout` 包含 `verified` 和 `passages`，渲染器显示 `timed out, V/P passages verified`。
- 所有评判请求均失败（例如未配置评判器，或提供方拒绝该账户）：头部为 `find unavailable for "query": all R judge requests failed, nothing was judged. This is not evidence of absence; use grep.`，结果为错误。`omp find` 打印相同状态并以 1 退出。
- 当 `path` 缩小搜索范围时，头部为 `N hit(s) for "query" in <dir>/ …`，渲染器显示 `in <dir>/`。
- `details`：`query`、`keywords`（所用词法关键词）、`threshold`、`hits`（`rel` 为可读的宿主路径或 URL，另有 `nameScore`、`contentScore`、包含 `start`/`end`/`p`/`snippet` 的合并 `ranges`、`linesSeen`、`truncated`）、`coverage`（根据 `stats.failed` 与 `stats.requests` 为 `complete`、`partial` 或 `unavailable`，预算使验证提前结束时也为 `partial`；同样出现在 `omp find --json` 中）、`stats`（`failed` 统计失败的评判请求，`unanswered` 统计不可用答案）、`timeout`（预算使验证提前结束时设置）、`elapsedMs`、`cwd`（超链接基准）以及 `scopePath`（`path` 的显示形式，搜索 cwd 时不存在）。
- 流式输出：调用运行期间，阶段进度（`lexical scan`、`filename ranking 64/128`、`verifying 8 passages in 5 files` 等）通过 `onUpdate` 发出，并显示在会话记录头部。

## 流程 \{#flow}

1. **词法扫描。** `listFiles()` 遍历根目录（遵循 gitignore，不含隐藏文件），并排除构建输出、锁文件、二进制扩展名、凭据文件和空文件。链接指向的普通文件使用其目标的大小，而不会被误判为空文件；悬空链接被排除。显式 `skill://` 范围还会进入其内部的目录链接，并检测循环，同时保留技能 URL；宿主范围不会进入目录链接。直接指定的文件绕过隐藏文件排除，但仍必须通过凭据/二进制/空文件过滤。`grepIndex()` 为所有关键词运行一次原生 grep，并统计匹配行中每个关键词的出现次数。两者并发运行。`idf()` 为稀有关键词赋予更高权重（限制在 `[0.5, 6]`）；`fileScore()` 根据加权对数频率加上路径中含关键词的额外分数，对每个文件排序。
2. **文件名排序。** 对词法排名前 128 的候选按名称进行评判，每批 64 个：基于折叠公共前缀的目录树列表（`# e017 name (size)`）和共享标准，为每个文件提供一个 noul。
3. **段落评分。** 读取二十个文件（无条件读取词法排名最强的两个候选，其余先按名称分数、再按词法排名选择）：每个最多 4 MB，切成带 `L<n>| ` 标签的 8 KB 完整行窗口，保留得分最高的 24 个窗口（没有关键词匹配时，在整个文件中均匀选取）。每个窗口由关键词最密集的原样行形成一个 384 字节的摘要片段；跨文件将摘要片段按每请求 46 个打包并评判。
4. **验证。** 得分 ≥ 0.45 的摘要片段（最多 40 个）会作为完整段落进行验证，按文件分组，每个请求三个。只有已验证段落才会产生范围；相接或重叠的正向范围（≥ τ = 0.20）会合并，并保留最大概率。文件中最佳的已验证段落达到 τ 时，该文件即为命中。

每个评判阶段都通过同时处理 16 个请求的分发器排空后，才开始下一阶段，因此关键路径由三个相互依赖的波次构成。

`find.verifyModel`（默认未设置）接受模型角色值，例如 `openrouter/liquid/d1-ultra` 或 `nace/drex-max-v1.1`。它仅用于验证；文件名和摘要片段的路由仍使用 `judge`。选择器依据 judge 角色的候选解析，先作为显式候选尝试，再尝试去重后的 `judge` 链，并遵循相同的回退规则：第一个原生候选之后的尾部只包含原生候选、还有已配置回退时使用单次尝试超时，以及冷却期。未匹配到任何候选的选择器会记录警告，并由普通 `judge` 链执行验证；空值或纯空白值视为未设置。建议使用原生决策模型，因为 τ 假定概率已经校准。页脚统计和覆盖率涵盖两个评判器，而 `find.enabled: auto` 仍只根据 `judge` 进行门控。`omp find` 从与 judge 角色相同的项目设置中读取该设置。较慢的验证器更容易触发工具 20 秒的部分结果超时。

## 副作用 \{#side-effects}

- 文件系统：读取最多 20 个候选文件（每个 4 MB）；绝不写入。
- 网络：通过会话的 judge 角色发出评判请求；用量汇总在结果页脚中。
- 取消：工具中止信号会停止原生扫描和正在进行的评判。

## 限制与上限 \{#limits--caps}

- 按名称评判的候选：128 个；读取文件：20 个；每文件窗口：24 个；窗口大小：8 KB；摘要片段：384 B；验证段落：40 个；摘要片段分数门槛 0.45；命中阈值 0.20，或 `find.hitThreshold`（`packages/coding-agent/src/tools/jfind/cascade.ts`）。
- 原生词法扫描超时：30 秒。原生评判使用 `NativeJudge`（每次尝试 10 秒，最多三次尝试）；工具的 20 秒墙上时钟预算可能更早中止它们。
- 每次调用的墙上时钟预算：`find.timeoutMs`（默认为 `20000`，`1000` 到 `600000` 之间的整数），因此停滞的评判器绝不会阻塞当前轮次。验证期间耗尽预算会返回目前已验证的命中项，并标记为部分结果；更早耗尽，或在尚未验证出任何命中时耗尽，则抛出超时错误。`omp find` CLI 不受此类限制。
- 超过 4 MB 的文件，在词法阶段只扫描到原生 grep 上限，且只读取最多 4 MB（裁剪到最后一个完整行）。

## 错误 \{#errors}

- `query` 为空、`path` 不存在（`Path not found: …`）或既非文件也非目录、URL 带 `:start-end` 选择器，或会话没有模型注册表时，抛出 `ToolError`。
- 评判器失败不会抛出异常：失败请求会使其条目保留为未评判（文件名和验证），或作为未知继续流转（摘要片段评分，因此服务中断绝不会导致剪枝）。失败会列在页脚中；只有所有请求均失败时，结果才会成为错误。
- 当 `find.timeoutMs`（默认 20 秒）的墙上时钟预算耗尽且未验证出任何结果时，显示 ``find timed out after 20.0s at "<phase>", before any hit was verified. Narrow `path` to a smaller tree, or use grep.``；`<phase>` 是最后一条进度消息（`lexical scan`、`filename ranking 64/128` 等）。调用方中止会原样重新抛出，不作转换。

## 说明 \{#notes}

- 分数是评判器给出的绝对是/否概率，因此可跨调用和批次比较。
- 关键词提取会转为小写，丢弃短于三个字节的标记、停用词和纯数字，并在词干保留至少四个字符时，提取 `-ing`/`-ed`/`-es`/`-s` 的词干。
- 目录文件夹绝不会被评判；向评判器展示的目录树只提供结构，因此文件名批次会携带 `criteria.folder`，以与参考请求结构保持一致。
- 词法扫描通过原生 `glob()` 列出目录树，因此在 ovnfs 检出目录下，会由为其提供服务的 ovnfs 守护进程响应列表请求，而非遍历其 NFS 挂载点（`crates/xfs/src/ovnfs.rs`）；守护进程发生任何失败时，都会回退到原生遍历。
