---
title: "github"
description: "Oh My Pi 官方仓库文档：github。"
---

# github \{#github}

> 分发针对仓库、仓库文件、拉取请求、搜索以及 Actions 运行监视的 GitHub CLI 操作。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/gh.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/github.md`
- 主要协作组件：
   - `packages/coding-agent/src/tools/gh-format.ts`：缩短提交 SHA 并格式化摘要字段。
   - `packages/coding-agent/src/tools/details/github.ts` / `packages/coding-agent/src/ui/tools/github.tsx`：结果类型和 TUI 渲染，尤其是 `run_watch` 的实时/结果视图。
   - `packages/coding-agent/src/tools/gh-view.ts`：仓库摘要及带缓存的议题/PR 视图获取器。
   - `packages/coding-agent/src/tools/gh-search.ts`：日期限定符、搜索验证和搜索操作。
   - `packages/coding-agent/src/tools/gh-pr-checkout.ts`：PR 创建/检出/推送操作。
   - `packages/coding-agent/src/tools/gh-run-watch.ts`：Actions 轮询和失败作业日志。
   - `packages/coding-agent/src/tools/github-cache.ts`：凭据范围的议题/PR/差异缓存及失效处理。
   - `packages/coding-agent/src/utils/github.ts`：`gh` 进程包装器（`github.run/json/text()`）、非交互式环境、命令截止时间、有大小限制的输出捕获。
   - `packages/coding-agent/src/tools/gh-common.ts`：共享辅助函数、当前仓库解析、结果构建。
   - `packages/coding-agent/src/utils/repo-lock.ts`：按仓库串行化写入（`withRepoLock`）。
   - `@oh-my-pi/pi-natives/vcs`：git 操作（`vcs.git()` / `vcs.requireGit()`：分支/工作树/配置/推送）。
   - `packages/utils/src/dirs.ts`：专用 PR 工作树的基础目录。
   - `packages/coding-agent/src/sdk.ts`：会话产物分配钩子。
   - `packages/coding-agent/src/session/artifacts.ts`：会话 `local://` 根目录下的溢出文件名格式 `<id>.log`。

## 可用性与审批 \{#availability-and-approval}

- `github.enabled` 默认为 `false`；使用前请在 **设置 → 工具** 中启用 GitHub CLI 工具。
- 此工具可被发现，采用严格模式定义，并且只有在 `PATH` 上存在 `gh` 时才会创建。身份验证由 CLI 在操作运行时检查。
- `repo_view`、`file_read`、所有 `search_*` 操作以及 `run_watch` 请求读取审批。`pr_create`、`pr_checkout` 和 `pr_push` 请求执行审批。

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `op` | `"repo_view" \| "file_read" \| "pr_create" \| "pr_checkout" \| "pr_push" \| "search_issues" \| "search_prs" \| "search_code" \| "search_commits" \| "search_repos" \| "run_watch"` | 是 | 分发选择器。`GithubTool.execute()` 只根据此字段切换操作。 |
| `repo` | `string` | 否 | `[host/]owner/repo` 覆盖值。只有主机与 `gh` 默认主机相同（github.com，或设置了 `GH_HOST` 时的该值），主机前缀才可省略；其他主机上的仓库，包括 `GH_HOST` 指向企业实例时的 github.com 仓库，都必须带上主机限定，否则 `gh` 会将请求发往其默认主机。标识符参数已是完整 GitHub URL 时忽略此字段。对于 `search_issues`/`search_prs`/`search_code`/`search_commits`，省略时默认为当前检出目录的仓库（查询已包含 `repo:`/`org:`/`user:`/`owner:` 限定符，或当前仓库解析失败时跳过）。当 `gh` 无法从当前检出目录推断仓库上下文时，实际使用中需要此字段。 |
| `branch` | `string` | 否 | 供 `repo_view`、`file_read`、`pr_push` 和 `run_watch` 使用。`file_read` 会省略 ref，以使用仓库的默认分支。对于未提供 `run` 的 `run_watch`，显式分支会选择该分支在 GitHub 上的头部；省略分支时，在确认检出目录与 `repo` 匹配后，监视本地 HEAD。提供 `run` 时忽略。`pr_push` 回退到当前分支。 |
| `path` | `string` | 否 | `file_read` 必填。GitHub 仓库中相对于仓库的文件路径；以 `/` 开头会被拒绝。 |
| `pr` | `string \| string[]` | 否 | 供 `pr_checkout` 使用。每项可以是 PR 编号、分支名或 GitHub PR URL。数组形式支持批处理。省略表示当前分支的 PR。 |
| `force` | `boolean` | 否 | 仅供 `pr_checkout` 使用。默认为 `false`；只有不存在匹配工作树时，才允许重置现有的 `pr-<number>` 分支。复用的工作树不会重置。 |
| `forceWithLease` | `boolean` | 否 | 仅供 `pr_push` 使用；透传给 git push。 |
| `title` | `string` | 否 | 仅供 `pr_create` 使用。除非 `fill` 为 `true`，否则必填。 |
| `body` | `string` | 否 | 仅供 `pr_create` 使用。与 `fill` 互斥。为空/省略时转为 `--body ""`，以抑制交互式编辑器。非空正文会写入临时文件，并作为 `--body-file` 传递。 |
| `base` | `string` | 否 | 仅供 `pr_create` 使用；作为 `--base` 传递。 |
| `head` | `string` | 否 | 仅供 `pr_create` 使用；作为 `--head` 传递。 |
| `draft` | `boolean` | 否 | 仅供 `pr_create` 使用。默认为 `false`。 |
| `fill` | `boolean` | 否 | 仅供 `pr_create` 使用。默认为 `false`。与 `title` 和 `body` 互斥。 |
| `reviewer` | `string[]` | 否 | 仅供 `pr_create` 使用；每个条目转为 `--reviewer`。 |
| `assignee` | `string[]` | 否 | 仅供 `pr_create` 使用；每个条目转为 `--assignee`。 |
| `label` | `string[]` | 否 | 仅供 `pr_create` 使用；每个条目转为 `--label`。 |
| `query` | `string` | 否 | 供所有 `search_*` 操作使用。`search_code` 要求非空查询；其他搜索在添加仓库/类型限定符之前，要求非空查询或至少一个有效的 `since` / `until` 日期限定符。 |
| `since` | `string` | 否 | `search_issues`、`search_prs`、`search_commits` 和 `search_repos` 的日期下限。接受相对时长（`3d`、`12h`、`2w`、`2mo`、`1y`）、`YYYY-MM-DD` 或 ISO 日期时间。`search_code` 会拒绝此字段。 |
| `until` | `string` | 否 | `search_issues`、`search_prs`、`search_commits` 和 `search_repos` 的日期上限。格式与 `since` 相同。`search_code` 会拒绝此字段。 |
| `dateField` | `"created" \| "updated"` | 否 | 议题/PR/仓库搜索的日期限定符字段。默认为 `created`；仓库搜索会将 `updated` 映射为 GitHub 的 `pushed:` 限定符。提交搜索忽略此字段，始终使用 `committer-date:`。 |
| `limit` | `number` | 否 | 供所有 `search_*` 操作使用。默认为 `10`，向下取整，上限为 `50`，且必须 `> 0`。 |
| `run` | `string` | 否 | 仅供 `run_watch` 使用。必须是数字运行 ID 或完整 GitHub Actions 运行 URL。 |
| `tail` | `number` | 否 | 仅供 `run_watch` 使用。默认为 `15`，向下取整，上限为 `200`，且必须 `> 0`。 |

## 输出 \{#outputs}

大多数操作返回由 `packages/coding-agent/src/tools/gh-common.ts` 中的 `buildTextResult()` 构建的文本结果；`file_read` 还可以返回图像附件。

- `content`：一个文本块，受支持的图像读取除外，后者返回一个文本块加一个图像块。多项目操作使用空行和 `---` 分隔符连接各区段。
- `sourceUrl`：仓库/文件/PR/运行结果存在已知规范 URL 时设置。
- `details`：TUI 渲染器使用的可选结构化元数据。
   - 通用字段：`artifactId`、`repo`、`branch`、`worktreePath`、`remote`、`remoteBranch`、`headSha`、`runId`、`runIds`、`status`、`conclusion`、`failedJobs`。
   - `pr_checkout` 添加 `checkouts: GhPrCheckoutSummary[]`，包含 `reused` 和可选的 `clonedWith`。
   - `run_watch` 添加 `watch: GhRunWatchViewDetails`，用于驱动 `packages/coding-agent/src/ui/tools/github.tsx` 中的自定义实时/结果渲染器。
- 产物尾注：存在 `artifactId` 时，会在文本正文后追加类似 `Full failed-job logs: local://<id>.log` 的行。
   - `run_watch` 只有在每个失败作业的日志都完整捕获时才使用 `Full failed-job logs`；部分日志缺失或捕获被截断时使用 `Partial failed-job logs`；均无内容时使用 `Failed-job log diagnostics`。不可用的条目会列出失败作业名称，并解释获取失败的原因。
   - 产物通过 `session.allocateOutputArtifact("github")` 分配；捕获的日志和诊断信息会保存为会话 `local://` 根目录下的溢出文件 `<id>.log`（`local://<id>.log`）；没有会话文件的会话会溢出保存到 `$TMPDIR/omp-local/<sessionId>` 下。

- `run_watch` 是唯一的流式操作。它在轮询期间发出 `onUpdate` 快照，然后返回一个最终文本结果。空搜索结果及未找到运行的提交监视会标记为 `useless: true`。

## 流程 \{#flow}

1. `GithubTool.createIf()` 只有在 `github.available()` 于 `PATH` 上找到 `gh` 时，才会公开该工具。
2. `GithubTool.execute()` 将分发包装在 `untilAborted()` 内，并根据 `params.op` 切换操作。
3. `gh.ts`、`gh-view.ts`、`gh-search.ts`、`gh-pr-checkout.ts` 或 `gh-run-watch.ts` 中选定的实现会规范化其可选字符串、数组、布尔值和数字上限。
4. CLI 通过 `packages/coding-agent/src/utils/github.ts` 中的 `github.run/json/text()` 执行：
   - 在非交互式环境中使用 `Bun.spawn()` 派生 `gh ...`，设置 5 分钟截止时间（`GH_COMMAND_TIMEOUT_MS`）及 8 MiB 的捕获输出上限；
   - 除非 `trimOutput: false`，否则裁剪 stdout/stderr 的首尾空白；
   - 将常见的身份验证/仓库上下文失败映射为面向工具的 `ToolError` 消息；
   - `json()` 拒绝空 JSON 或无效 JSON。
   - 当前检出目录解析会运行 `gh repo view --json url -q .url`。未设置 `gh repo set-default` 时，`gh` 会将 `upstream`/`github` 远程排在 `origin` 之前；当 `origin` 不是该选择的 GitHub 派生仓库时（使用 `gh repo view <origin-url> --json url,parent` 检查），则以 `origin` 为准，因此从不相关上游合并的检出目录仍会读取自身的 PR 和议题。`repoFromUrl()` 只有在主机等于 `gh` 默认主机（`GH_HOST` 或 github.com）时才会去掉主机部分。其他主机保留限定，包括 `GH_HOST` 指向别处时的 github.com 检出目录。仓库范围的 `gh api` 调用使用裸端点短名称加 `--hostname`；搜索限定符同样使用 `repo:owner/repo` 加 `--hostname`。
   - 完整 URL 指定的主机（`pr://<host>/…` 读取、PR/议题/运行 URL 参数）会按原样保留，包括 `github.com`，因此 `GH_HOST` 无法重定向该请求。缓存行会去掉指向 `gh` 默认主机的前缀；通常 `github.com/owner/repo` 和 `owner/repo` 共享一行，而在设置 `GH_HOST` 后，显式的 `github.com/` 形式会保留自己的缓存行，因为此时裸形式指的是已配置的实例。
5. 读取类操作（`repo_view`、`file_read`、`search_*`）获取仓库数据并返回文本、图像附件或格式化摘要。`file_read` 使用 JSON contents API，解码 base64 文件字节，并返回受支持的图像或严格 UTF-8 文本；二进制文件和不含字节的响应会得到解释性文本。单个议题和单个 PR 视图通过 `issue://` / `pr://` 内部 URL 协议及其 SQLite 缓存解析。
6. PR 差异使用 `pr://<N>/diff`（更改的文件）、`pr://<N>/diff/<i>`（一个文件，从 1 开始编号）或 `pr://<N>/diff/all`（完整 unified diff），参见 [read](./read.md)。所有变体共享 `pr-diff` 缓存行；新的获取通常运行 `gh pr diff`，聚合差异过大时回退到 files API。
   退出码为 0 且包含 `git push` 的 `bash` 命令会删除每个被推送仓库的实时 `pr`/`pr-diff` 缓存行，以便下一次未固定快照的读取获取新的头部。目标选择遵循 git：位置参数中的远程/URL（优先于 `--repo`）、`git -C`，然后依次为 `branch.<name>.pushRemote`、`remote.pushDefault`、`branch.<name>.remote`、唯一的远程、`origin`；`remote.<name>.pushurl` 优先于获取 URL。试运行和非零退出会保留缓存。议题行、其他仓库及保留的 `?at=` 快照不受影响。任何缓存失效也会阻止正在进行的获取存储其失效前的结果。
7. `pr_checkout` 先解析 PR 元数据，然后在任何 git 修改之前进入 `withRepoLock()`（`packages/coding-agent/src/utils/repo-lock.ts`），使针对同一主仓库的并行检出调用不会在共享 `.git` 状态上发生竞态。
8. `pr_push` 从 git 分支配置中读回 PR 头部元数据，派生 refspec，通过 `repository.push()`（`@oh-my-pi/pi-natives/vcs`）推送，然后通过 `invalidateAllForNumber()` 使已推送 PR 的 `pr://` 缓存行失效，以便下一次 `pr://` 读取反映该推送。
9. `pr_create` 调用一次 shell，然后尽力仅获取所创建 PR 的摘要元数据。
10.   `run_watch` 选择运行模式（提供 `run`）或提交模式（省略 `run`），在首分钟每 3 秒轮询 GitHub Actions API，之后每 15 秒轮询，发出流式更新，并可能在返回前保存完整的失败日志产物。
11.   最终文本通过 `toolResult().text(...)` 处理；若 `session.allocateOutputArtifact()` 返回槽位，失败日志文本会通过 `Bun.write()` 持久化。

## 模式/变体 \{#modes--variants}

### `repo_view` \{#repo_view}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op` |
| 可选字段 | `repo`、`branch` |
| `gh` 命令 | `gh repo view [<repo>] [--branch <branch>] --json <GH_REPO_FIELDS>` |
| 批处理 | 无 |
| 输出 | `# <owner/repo>` 头部、描述、URL、默认分支、请求的分支、可见性、权限、主要语言、星标数、派生仓库数、归档/派生标记、更新时间戳、主页、主题。`sourceUrl = data.url`。 |

省略 `repo` 时，使用 `gh` 的仓库解析。

### `file_read` \{#file_read}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`、`path` |
| 可选字段 | `repo`、`branch` |
| `gh` 命令 | `gh api [--hostname <host>] /repos/<owner/repo>/contents/<encoded-path> --method GET -H "Accept: application/vnd.github+json" -H "Accept-Encoding: identity" [-f ref=<branch>]` |
| 批处理 | 无 |
| 输出 | Base64 解码后的 UTF-8 文本，或文本加受支持的图像附件。二进制/非 UTF-8 字节及不含文件字节的 API 响应会改为产生解释性文本。`sourceUrl` 使用 API 的 `html_url`，回退为有效主机的 `blob/<branch-or-HEAD>/<encoded-path>` URL；`details` 包含解析后的 `repo` 和可选的 `branch`。 |

`repo` 默认为当前检出目录的 GitHub 仓库。省略 `branch` 时，会向 GitHub 请求仓库的默认分支。每个路径段分别进行 URL 编码。空路径/绝对路径会被拒绝；目录响应会因不是文件而被拒绝。API 错误会标明所请求的仓库、修订版本和路径，而不会猜测 404 表示资源缺失还是访问被拒绝。文本解码保留空白。图像使用 `images.autoResize` 和当前模型的 WebP 兼容性处理。面向模型的提示词要求对仓库托管文件使用此操作，而非 `curl` 或 `wget`。

单个议题和单个 PR 的读取使用 `issue://<N>` / `pr://<N>` URL 协议（参见 `docs/tools/read.md`）。它们共用 `~/.omp/cache/github-cache.db`（可通过 `OMP_GITHUB_CACHE_DB` 覆盖）以及 `github.cache.softTtlSec` / `github.cache.hardTtlSec` / `github.cache.enabled` 设置。缓存保留渲染后的 Markdown 和 `gh` 返回的原始 JSON 载荷，包括私有正文、评论、审查，以及启用评论时的审查评论；缓存行按本地 GitHub 凭据指纹划分作用域。根级和仓库作用域的读取（`issue://`、`pr://owner/repo`）会实时调用 `gh issue list` / `gh pr list` 以供浏览；查询参数 `state`、`limit`、`author`、`label` 会透传给 `gh`（`issue://` 接受 `state=open|closed|all`；`pr://` 还接受 `merged`）。PR 差异也通过 `pr://<N>/diff[/…]` 使用同一缓存：列表、完整差异和各文件切片共用一个以仓库和 PR 编号为键的 `pr-diff` 行。

### `pr_create` \{#pr_create}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`，以及 `fill=true` 或 `title` 中的一个 |
| 可选字段 | `repo`、`title`、`body`、`base`、`head`、`draft`、`fill`、`reviewer[]`、`assignee[]`、`label[]` |
| `gh` 命令 | `gh pr create ...`，标志根据提供的字段组装 |
| 批处理 | 无 |
| 输出 | `# Created Pull Request ...` 摘要，包含 URL、状态、草稿标志、base/head、作者、创建时间和标签。不回显正文。`sourceUrl` 是创建的 PR URL。 |

分支行为：

- `fill && (title || body !== undefined)` 会抛出异常。
- 非空 `body` 写入 `os.tmpdir()` 中的临时目录 `gh-pr-body-*`，以 `--body-file` 传入，然后在 `finally` 中删除。
- 创建后，工具解析返回的 URL，并尽力运行 `gh pr view <number> --repo <repo> --json <GH_PR_CREATE_FIELDS>`，只请求上述摘要字段，不请求正文、文件或审查。即使查询失败，仍会返回创建 URL 和可用的输入元数据。
- `github` 创建结果的分发渲染器参数只保留 `op` 和 `repo`，不保留正文或其他仅执行时使用的字段。经过验证的完整正文仍原样传入 `gh pr create`；原始工具调用输入仍留在历史记录中。要获取正文，请显式读取 `pr://<N>`。

### `pr_checkout` \{#pr_checkout}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op` |
| 可选字段 | `repo`、`pr`、`force` |
| `gh` 命令 | 对每个请求的 PR：`gh pr view [<pr>] [--repo <repo>] --json <GH_PR_CHECKOUT_FIELDS>`；跨仓库 PR 还可能调用 `gh repo view <headRepository> --json <GH_REPO_CLONE_FIELDS>`。 |
| 批处理 | 支持。`pr` 可以是 `string[]`；各 PR 并行解析，但 git 修改通过 `withRepoLock()` 按主仓库串行执行。 |
| 输出 | 单个 PR：检出/工作树摘要，以及 `details.repo`、`details.branch`、`details.worktreePath`、`details.remote`、`details.remoteBranch`、`details.checkouts`。批量：`# <n> Pull Request Worktrees (...)`，每个 PR 各占一节，并汇总 `details.checkouts`。部分失败时，标题变为 `# <n>/<total> Pull Request Worktrees checked out (<k> failed)`，末尾附有 `## Failed` 列表。 |

工作树和元数据行为：

- 本地分支名始终为 `pr-<number>`。
- 工作树路径为 `getWorktreeDir("<number>-<repo-hash>")` = `path.join(getWorktreesDir(), "<number>-<repo-hash>")`，其中 `<number>` 是 PR 编号，`<repo-hash>` 是 `hashPath(primaryRepoRoot)`（主仓库根目录的 7 位十六进制摘要）。`getWorktreesDir()` 按以下顺序解析基目录：有效的 `OMP_WORKTREE_DIR`、已应用的 `worktree.base` 设置，然后是感知配置档案/XDG 的数据根目录默认值（通常为 `~/.omp/wt`）。这两个覆盖值都会展开开头的 `~`，且必须解析为绝对路径；无效的相对值会被忽略，并继续后续解析。如果所得路径已在 git 中注册或已存在于磁盘上，`resolveAvailableWorktreePath()` 会追加 `-2`/`-3`… 后缀。
- 已有工作树通过 `repository.worktrees()`（`@oh-my-pi/pi-natives/vcs`）中的分支引用 `refs/heads/pr-<number>` 检测。
- 创建新工作树时，在选定未使用的路径后调用 `repository.worktreeAdd(finalWorktreePath, localBranch, { detach: false, clone, backend }, signal)`。`clone` 遵循 `worktree.clone`（默认 `true`）；`backend` 遵循 `isolation.backend`（默认 `"auto"`）。克隆失败时会发出警告并回退到普通检出；克隆成功的元数据以 `clonedWith` 显示。
- 同仓库 PR 的远程为 `origin`。对于跨仓库 PR，工具会解析源仓库的克隆 URL，尽可能复用 URL 相同的已有远程，否则创建 `fork-<owner>` / `fork-<owner>-<n>`。
- 分支推送元数据通过 `git config` 持久化到仓库共享的 `.git/config` 中，键如下：
   - `branch.pr-<number>.remote`
   - `branch.pr-<number>.merge`
   - `branch.pr-<number>.pushRemote`
   - `branch.pr-<number>.ompPrHeadRef`
   - `branch.pr-<number>.ompPrUrl`
   - `branch.pr-<number>.ompPrIsCrossRepository`
   - `branch.pr-<number>.ompPrMaintainerCanModify`
- 没有匹配工作树时，如果已有的 `refs/heads/pr-<number>` 位于不同提交，操作会失败，除非设置 `force=true`，这会将分支重置到获取的源分支头。
- 匹配的已有工作树会被复用，并标记 `reused: true`；工具会获取远程并刷新推送元数据，但不会重置其本地分支，即使设置了 `force=true` 也是如此。

### `pr_push` \{#pr_push}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op` |
| 可选字段 | `branch`、`forceWithLease` |
| `gh` 命令 | 无。此路径使用 git，而非 `gh`。 |
| 批处理 | 无 |
| 输出 | `# Pushed Pull Request Branch` 摘要，包含本地分支、远程、远程分支、远程 URL、PR URL 和 force-with-lease 标志。已知时设置 `sourceUrl = prUrl`。 |

推送目标解析会读取 `pr_checkout` 写入的 git-config 键 `branch.<name>.ompPrHeadRef`、`pushRemote`/`remote`、`ompPrUrl`、`ompPrMaintainerCanModify` 和 `ompPrIsCrossRepository`。如果当前检出的分支与目标分支匹配，源引用为 `HEAD`；否则推送 `refs/heads/<branch>`。引用规格为 `HEAD:refs/heads/<headRef>` 或 `refs/heads/<branch>:refs/heads/<headRef>`。

### `search_issues` \{#search_issues}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`，以及非空 `query` 或有效的 `since` / `until` 边界 |
| 可选字段 | `repo`、`query`、`limit`、`since`、`until`、`dateField` |
| `gh` 命令 | `gh api -X GET /search/issues -f q="<query> [date qualifier] [repo:<repo>] is:issue" -F per_page=<limit>` |
| 批处理 | 无 |
| 输出 | `# GitHub issues search`、回显的查询、可选的仓库、结果数量，然后每个议题各一条列表项，包含仓库/状态/作者/标签/时间戳/URL。 |

省略 `repo` 时，通过 `resolveSearchRepoScope()` 默认使用当前检出仓库的 `owner/repo`。如果组合后的查询已包含前导 `repo:`/`org:`/`user:`/`owner:` 限定符，或 `gh repo view` 无法解析当前检出仓库（例如不在具有 github 远程的仓库中），则不应用该默认值。

### `search_prs` \{#search_prs}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`，以及非空 `query` 或有效的 `since` / `until` 边界 |
| 可选字段 | `repo`、`query`、`limit`、`since`、`until`、`dateField` |
| `gh` 命令 | `gh api -X GET /search/issues -f q="<query> [date qualifier] [repo:<repo>] is:pr" -F per_page=<limit>` |
| 批处理 | 无 |
| 输出 | 与 `search_issues` 结构相同，标记为拉取请求。 |

`repo` 与 `search_issues` 一样，默认使用当前检出仓库的 `owner/repo`。

### `search_code` \{#search_code}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`、`query` |
| 可选字段 | `repo`、`limit` |
| `gh` 命令 | `gh api -X GET /search/code -f q="<query> [repo:<repo>]" -F per_page=<limit> -H "Accept: application/vnd.github.text-match+json"` |
| 批处理 | 无 |
| 输出 | `# GitHub code search`、结果数量，然后每个匹配项各一条列表项，包含路径、仓库、缩短后的 API 结果 `sha`（标为 `Commit`）、URL，以及存在时的第一行规范化文本匹配片段。 |

`repo` 与 `search_issues` 一样，默认使用当前检出仓库的 `owner/repo`。此操作显式拒绝 `since` 和 `until`，因为 GitHub 代码搜索没有受支持的日期限定符。

### `search_commits` \{#search_commits}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`，以及非空 `query` 或有效的 `since` / `until` 边界 |
| 可选字段 | `repo`、`query`、`limit`、`since`、`until`、`dateField`（接受但忽略；提交搜索使用 `committer-date`） |
| `gh` 命令 | `gh api -X GET /search/commits -f q="<query> [committer-date qualifier] [repo:<repo>]" -F per_page=<limit>` |
| 批处理 | 无 |
| 输出 | `# GitHub commits search`、结果数量，然后每个提交各一条列表项：短 SHA + 提交消息首行、仓库、作者、日期、URL。 |

`repo` 与 `search_issues` 一样，默认使用当前检出仓库的 `owner/repo`。

### `search_repos` \{#search_repos}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op`，以及非空 `query` 或有效的 `since` / `until` 边界 |
| 可选字段 | `query`、`limit`、`since`、`until`、`dateField` |
| `gh` 命令 | `gh api -X GET /search/repositories -f q="<query> [date qualifier]" -F per_page=<limit>` |
| 批处理 | 无 |
| 输出 | `# GitHub repositories search`、结果数量，然后每个仓库各一条列表项，包含描述首行、语言、星标数、分叉数、开放议题数、可见性、归档/分叉标志、更新时间、URL。 |

此操作有意不使用 `repo`。没有非空查询或有效日期边界时，本地验证会抛出 `query is required (or pass since/until to filter by date)`。议题、PR 和提交搜索也会在确定作用域前进行相同验证。

### `run_watch` \{#run_watch}

| 方面 | 值 |
| --- | --- |
| 必填字段 | `op` |
| 可选字段 | `repo`、`branch`、`run`、`tail` |
| `gh` 命令 | 仓库解析：当 `repo` 和运行 URL 中的仓库均缺失时，使用 `gh repo view --json url -q .url`。单次运行模式使用 `gh api --method GET /repos/<repo>/actions/runs/<runId>` 和 `gh api --method GET /repos/<repo>/actions/runs/<runId>/jobs`。提交模式使用 `gh api --method GET /repos/<repo>/branches/<branch>`、`gh api --method GET /repos/<repo>/actions/runs`、`gh api --method GET /repos/<repo>/actions/runs/<runId>/jobs`，并对失败作业使用 `gh api /repos/<repo>/actions/jobs/<jobId>/logs --allow-escape-sequences`。 |
| 批处理 | 仅在提交模式下隐式批处理：一起跟踪一个提交的所有工作流运行。 |
| 输出 | 通过 `onUpdate` 流式输出快照，然后生成最终文本报告。产物分配成功时，设置 `details.artifactId`，并根据捕获日志的可用情况，追加标记为完整日志、部分日志或诊断信息的产物引用。 |

监视流程：

- `run` 解析接受十进制运行 ID 或完整运行 URL。两者均提供时，URL 中的仓库必须与显式 `repo` 匹配。
- 省略 `run` 时，显式 `branch` 通过 GitHub 的分支 API 解析分支头。没有 `branch` 时，当前检出仓库必须与解析出的仓库匹配；工具监视其本地 HEAD，而不是隐式读取远程分支。
- 运行结论 `success`、`neutral` 和 `skipped` 均视为成功。已完成的单次运行会立即返回；只有提交模式执行额外的确认轮询。
- 监视开始后的前 `60` 秒（`RUN_WATCH_FAST_WINDOW_MS`），轮询间隔为 `3` 秒（`RUN_WATCH_INTERVAL_DEFAULT`），之后为 `15` 秒（`RUN_WATCH_INTERVAL_SLOW`）。受到速率限制的轮询错误会按慢速间隔退避，最多重试至连续失败 `5` 次（`RUN_WATCH_MAX_POLL_FAILURES`）。在提交模式下，如果始终没有运行出现，工具会在 `90` 秒后放弃并给出明确消息（`RUN_WATCH_NO_RUNS_GIVE_UP_MS`）。
- 失败宽限期固定为 5 秒（`RUN_WATCH_GRACE_DEFAULT`）。当完成前出现任何失败作业时，工具会发出提示，等待一次，重新获取状态，然后收集日志，以纳入并发发生的失败。
- 失败作业日志通过 `github.run()` 而非 `json()` 调用 `gh api /repos/<repo>/actions/jobs/<jobId>/logs --allow-escape-sequences` 获取；旧版 `gh` 因不认识该标志而拒绝时，会移除该标志重试一次。捕获的日志经过 `sanitizeText()` 处理，剥离 ANSI 转义序列和控制字符。退出码非零或清理后输出为空时，会保留 `available: false`，而不是使整个监视失败。每个不可用条目都保留一个上限为 512 个 UTF-8 字节的原因，失败命令的原因包含退出状态和 stderr。
- 内联结果仅包含每个失败作业捕获日志的最后 `tail` 行。保存的产物包含捕获的日志（`mode: "full"`），并指出没有日志的作业及相同的失败原因。子进程捕获的结构化截断标志会在产物标签及内容中将超过 8 MiB 的日志标记为部分日志。
- 在提交模式下，工具会有意重复确认成功状态：所有已知运行均成功后，工具再等待一个轮询间隔，只有运行 ID 集合未变化时才判定成功。这可避免在同一提交的后续工作流运行出现前就返回。
- `details.watch` 驱动 `packages/coding-agent/src/ui/tools/github.tsx` 中的专用渲染器；日志不可用的原因会经过清理，并压平为一个显示行。非监视结果使用回退摘要渲染器。
- 作业快照保留同一次作业 API 调用返回的有序步骤（编号、名称、状态、结论、时间戳）；不额外请求步骤。尚未运行的步骤中 GitHub 的零日期时间戳会在接收时丢弃。`details.watch` 会为实时及已完成的运行/提交监视提供步骤耗时。文本结果仅列出每个失败作业中失败的步骤。
- 折叠的作业视图显示当前步骤进度或失败步骤。**Ctrl+O** 展开卡片，显示每个已报告步骤的状态和耗时。Tern Surface Protocol 视图使用原生的带键作业折叠控件和步骤列表；原生折叠控件点击和现有工具卡片展开状态仍然可用。没有步骤数据的结果保留仅作业视图。

## 副作用 \{#side-effects}

- 文件系统
   - `pr_create` 可能在 `os.tmpdir()` 下创建名为 `gh-pr-body-*` 的临时目录，写入 `body.md`，然后在 `finally` 中删除该目录。
   - `pr_checkout` 可能在选定的基目录下创建名为 `<pr-number>-<repo-hash>` 的工作树目录，并在其中添加 git 工作树。基目录依次取自 `OMP_WORKTREE_DIR`、`worktree.base`、感知配置档案/XDG 的默认值（通常为 `~/.omp/wt`）。
   - `run_watch` 可能写入会话产物，其中包含捕获的失败作业日志和/或获取诊断信息。
- 网络
   - 除 `pr_push` 外，每个操作都会通过 shell 调用 `gh`，再由它与 GitHub API 通信。
   - `pr_push` 使用 git 网络传输连接配置的远程。
- 子进程 / 原生绑定
   - 所有 `gh` 调用均使用 `Bun.spawn(["gh", ...args])`。
   - `pr_checkout` 和 `pr_push` 通过 `@oh-my-pi/pi-natives/vcs`（`vcs.requireGit()`）调用 git 操作。检出修改使用进程内的 `withRepoLock()`；`pr_push` 不获取该锁。
- 会话状态（会话记录、内存、作业、检查点、注册表）
   - 持久化失败作业日志时，`run_watch` 会使用 `session.allocateOutputArtifact()`。
   - 返回的 `details` 对象携带供渲染器/UI 使用的运行/检出元数据。
- 用户可见提示 / 交互式 UI
   - `pr_create` 通过强制使用 `--body-file` 或 `--body ""`，抑制 `gh` 回退到交互式编辑器。
   - `packages/coding-agent/src/ui/tools/github.tsx` 中的 `githubPresenter` 提供紧凑标题和自定义实时监视视图。
- 后台工作 / 取消
   - `run_watch` 循环运行直至成功/失败，并在轮询之间使用 `scheduler.wait()`。
   - `GithubTool.execute()` 由 `untilAborted()` 包装；`github.run()` 将中止信号转发给 `Bun.spawn()`。

## 限制与上限 \{#limits--caps}

- 搜索结果默认数量：`10`（`packages/coding-agent/src/tools/gh-search.ts` 中的 `SEARCH_LIMIT_DEFAULT`）。
- 搜索结果最大数量：`50`（`SEARCH_LIMIT_MAX`）。
- `pr://` 视图内的 PR 文件预览：仅前 `50` 个文件（`gh-search.ts` 中的 `FILE_PREVIEW_LIMIT`）。对于因 GitHub 的 20,000 行限制而被拒绝的汇总差异，`pr://<N>/diff` 获取器会回退到分页文件 API（每页 `100` 个文件，最多 `3000` 个文件）；二进制补丁或单个体积过大的补丁仍会列出，并带有补丁不可用标记。
- 运行监视轮询间隔：前 `60s` 为 `3s`，之后为 `15s`（`RUN_WATCH_INTERVAL_DEFAULT`、`RUN_WATCH_FAST_WINDOW_MS`、`RUN_WATCH_INTERVAL_SLOW`）；提交模式在没有运行时会在 `90s` 后放弃（`RUN_WATCH_NO_RUNS_GIVE_UP_MS`）；最多容忍连续 `5` 次受到速率限制的轮询失败（`RUN_WATCH_MAX_POLL_FAILURES`）。
- 运行监视失败宽限期：`5s`（`RUN_WATCH_GRACE_DEFAULT`）。
- 运行监视失败日志尾部默认长度：`15` 行（`RUN_WATCH_TAIL_DEFAULT`）。
- 运行监视失败日志尾部最大长度：`200` 行（`RUN_WATCH_TAIL_MAX`）。
- PR 审查评论每页数量：`100`（`REVIEW_COMMENTS_PAGE_SIZE`）。
- Actions 作业每页数量：`100`（`RUN_JOBS_PAGE_SIZE`）。
- 搜索和尾部行数的数字输入通过 `Math.floor()` 向下取整，限制在最大值以内；非有限数或 `<= 0` 时被拒绝。
- `pr_checkout` 批量扇出在工具代码中没有上限；所有请求的 PR 通过 `Promise.allSettled()` 启动，因此单个失败会呈现为部分结果，而非中止整批操作。

## 错误 \{#errors}

- 未安装 `gh` 时，会完全跳过工具创建。
- 如果执行时缺少 `gh`，`github.run()` 会抛出 `ToolError("GitHub CLI (gh) is not installed...")`。
- `github.text()/json()` 将常见失败映射为面向模型的消息：
   - 未认证 → `GitHub CLI is not authenticated. Run \`gh auth login\`.`
   - 没有仓库上下文且未显式提供 `repo` → `GitHub repository context is unavailable. Pass \`repo\` explicitly or run the tool inside a GitHub checkout.`
   - 其他情况使用 stderr/stdout 文本，或回退为 `GitHub CLI command failed: gh ...`
- stdout 为空或 JSON 无效时，`json()` 也会抛出异常。
- 本地验证错误会抛出 `ToolError`，包括：
   - 缺少操作所需字段（`file_read` 的 `path`、`search_code` 的 `query`、其他搜索的查询/日期边界、未设置 `fill=true` 时的 `title`）
   - 无效的数字 `limit` / `tail`
   - 无效的 `since` / `until` 日期边界
   - 无效的 `run` 格式
   - `fill` 与 `title` 或 `body` 同时使用
   - 检出、推送或监视时缺少 git 仓库 / 分支 / HEAD 上下文
   - 在没有 `ompPrHeadRef` 元数据的分支上使用 `pr_push`
   - 没有匹配工作树时，已有 PR 分支位于不同提交但未设置 `force`，或者 100 个候选工作树路径全部用尽
   - PR 标识符以 `-` 开头
   - `file_read` 路径为绝对路径（以 `/` 开头），或 contents API 响应不是文件
   - 当前检出仓库与请求仓库不匹配时，在未提供 `branch` / `run` 的情况下使用 `run_watch`
- `run_watch` 对失败作业日志获取做特殊处理：缺少日志内容不会使监视失败；它会将该日志标记为 `available: false`，并打印 `Log tail unavailable.` / `Full log unavailable.`，附上长度受限的原因。两种监视模式的产物标签都会区分完整日志、部分日志和不可用日志。
- `pr_create` 只吞掉创建后尽力执行的 `gh pr view` 刷新错误；创建步骤本身仍会正常失败。

## 说明 \{#notes}

- 当标识符参数已经是完整 GitHub URL 时，`appendRepoFlag()` 会有意跳过 `--repo`，让 `gh` 从 URL 推导仓库/编号。
- `normalizePrIdentifierList()` 也接受 `reviewer`、`assignee` 和 `label` 数组；这个辅助函数名称的含义比调用方所用范围更宽。
- `pr_push` 依赖此前已对该本地分支运行过 `pr_checkout`；没有其他元数据来源。
- `pr_checkout` 将推送元数据存储在分支配置中，而非工作树目录中。复用同一个 `pr-<number>` 分支会复用这些配置键。
- 检出写入的串行化在进程内进行，以主仓库根目录而非当前工作树路径为键，因为 git 工作树共享 `.git/config`、`packed-refs`、提交图和工作树元数据文件。
- `search_repos` 是唯一从不转发 `repo` 的搜索操作；仓库作用域必须在查询本身中表达。
- `run_watch` 在提交模式下成功，表示“所有已观察到的运行均成功，且在一次轮询后没有出现额外运行”，而不只是“最近一次轮询显示为绿色”。
- 除非展开结果视图，否则 TUI 渲染器会折叠步骤详情和失败日志预览；底层文本结果包含每个失败作业中失败的步骤、相同的日志尾部行，以及任何产物引用。
