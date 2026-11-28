---
title: "gitlab"
description: "Oh My Pi 官方仓库文档：gitlab。"
---

# gitlab \{#gitlab}

> 分发 GitLab CLI（`glab`）操作，涵盖项目、仓库文件、议题、合并请求、讨论、搜索、工作树检出/推送，以及 CI 流水线/作业。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/gl.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/gitlab.md`
- 主要协作模块：
   - `packages/coding-agent/src/tools/details/gitlab.ts` / `packages/coding-agent/src/ui/tools/gitlab.tsx`：结果类型和 TUI 呈现器（`pipeline_watch` 实时/结果视图、`tool.gl` 图标）。
   - `packages/coding-agent/src/tools/gl-common.ts`：嵌套群组的项目/群组解析、带主机限定的规范引用解析、主机信任强制检查、`glab api` JSON/文本/分页包装器，以及 MR IID 解析。
   - `packages/coding-agent/src/tools/gl-view.ts`：项目概览、缓存的 MR 概览（`mr://`）和缓存的议题视图。
   - `packages/coding-agent/src/tools/gl-mr.ts`：MR 创建（`--push=false`）、更新、讨论列表、备注/回复/差异评论，以及讨论解决。
   - `packages/coding-agent/src/tools/gl-mr-checkout.ts`：在隔离的 git 工作树中检出和推送 MR。
   - `packages/coding-agent/src/tools/gl-search.ts`：支持项目/群组/全局作用域的 MR、议题、代码、提交和项目搜索。
   - `packages/coding-agent/src/tools/gl-ci.ts`：流水线列表/查看/监视（包括触发/桥接作业和分叉 MR 的 `project_id`）、作业日志/重试，以及 `ci_lint`。
   - `packages/coding-agent/src/tools/github-cache.ts` 和 `packages/coding-agent/src/tools/gh-cache-invalidation.ts`：共享 SQLite 缓存（模式 v5），以及针对 `glab` / `git push` 的 bash 缓存失效处理。
   - `packages/coding-agent/src/internal-urls/mr-protocol.ts`：`mr://` 内部 URL 处理器（列表、单项概览和 `/diff` 切片）。
   - `packages/coding-agent/src/utils/gitlab.ts`：`glab` 进程包装器（`gitlab.run/json/text()`）。

## 可用性与审批 \{#availability-and-approval}

- `gitlab.enabled` 默认为 `false`；使用前请在 **设置 → 工具** 中启用 GitLab CLI 工具。
- 该工具可被发现，并使用严格模式，仅在 `PATH` 中可找到 `glab` 时创建。
- 读取审批：`repo_view`、`file_read`、`issue_view`、`mr_discussions`、`search_mrs`、`search_issues`、`search_code`、`search_commits`、`search_projects`、`pipeline_list`、`pipeline_view`、`pipeline_watch`、`job_log`。
- 执行审批：`mr_create`、`mr_update`、`mr_checkout`、`mr_push`、`mr_note`、`mr_discussion_resolve`、`job_retry`、`ci_lint`。
- 主机信任防护：环境中设置了 `GITLAB_TOKEN`、`GITLAB_ACCESS_TOKEN` 或 `OAUTH_TOKEN` 时，仅允许向 `gitlab.com`、`GITLAB_HOST`/`GITLAB_URI`/`GITLAB_URL`/`GL_HOST`、`glab` 的 `config.yml` 中配置的主机，或当前检出仓库自身的 GitLab 主机发出请求。

## 操作 \{#operations}

- **项目与文件**：`repo_view`、`file_read`（读取 `ref` 处的文件，默认为 `HEAD`；当省略 `path`、其值为 `.`，或因路径是目录而返回 404 时，分页列出目录树）、`issue_view`。
- **合并请求**：`mr_create`（始终传入 `--push=false --yes`）、`mr_update`、`mr_checkout`（以主机/项目/IID 为键的隔离 git 工作树）、`mr_push`（验证推送远程与 MR 源项目匹配后，推送工作树分支）。
- **讨论**：`mr_discussions`（默认隐藏系统备注）、`mr_note`（通过 `discussionId` 或至少 8 个字符的前缀回复；通过 `path` 及可选的 `line`/`oldLine` 添加差异评论；或添加普通/内部备注）、`mr_discussion_resolve`。
- **搜索**：`search_mrs`、`search_issues`、`search_code`、`search_commits`、`search_projects`。
- **CI**：`pipeline_list`、`pipeline_view`、`pipeline_watch`（优先选择当前分支开放 MR 的源分支头流水线，忽略 `allow_failure` 作业，包含触发/桥接作业，将完整/部分跟踪日志溢出保存到会话产物）、`job_log`、`job_retry`、`ci_lint`。
