# Oh My Pi 官网文档与 v19.1.1 来源清单

官网公开导航有 56 页。没有确认其中任何一页的原文来自 Oh My Pi v19.1.1，因此这 56 页均保留为原文链接，未翻译或分配译站路径。

## 范围与依据

- 官网导航：2026-11-24 读取 [官方文档](https://omp.sh/docs) 及 [站点地图](https://omp.sh/sitemap.xml)。六个栏目的全部 56 条导航与站点地图的文档路由和顺序一致，逐页返回 HTTP 200。官网未提供可验证的 v19.1.1 文档导航或正文归档。
- 产品版本：[v19.1.1 发布页](https://github.com/can1357/oh-my-pi/releases/tag/v19.1.1) 和 [npm 来源证明](https://registry.npmjs.org/-/npm/v1/attestations/@oh-my-pi%2fpi-coding-agent@19.1.1) 指向提交 [31ffee513f27a01bba7d4dfbe12bae239cdc646a](https://github.com/can1357/oh-my-pi/commit/31ffee513f27a01bba7d4dfbe12bae239cdc646a)。该发布的 CLI 包收录的是 [Git 仓库的 docs/](https://github.com/can1357/oh-my-pi/tree/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs)，不是官网整个文档站。
- 许可：[固定提交的 MIT 许可证](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/LICENSE#L1-L15)覆盖软件及其随附的仓库文档，要求保留完整版权和许可声明。未找到证据表明同一许可也覆盖官网独立正文或站点配图，不能把仓库许可直接用于它们。

逐页核对了正文中的源码链接，并将官网页面的标题、完整小标题序列和首段片段与固定提交下的 137 个 Markdown 文件（`docs/` 及根目录英文、简体中文 README）比对。14 页存在同名标题，但没有一页符合完整小标题序列和首段片段的两个检查。这些是排查同源的信号，不能单独证明正文出处。官网正文也未提供到对应仓库文档的来源链接。

例如，[官网 Settings](https://omp.sh/docs/settings) 从命令行查看和改动设置讲起，[仓库 Settings](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/settings.md) 先说明配置文件的范围和格式。[官网 Compaction](https://omp.sh/docs/compaction) 面向使用者解释自动压缩，[仓库 Compaction](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/compaction.md) 则先描述实现文件、会话数据模型和压缩管线。这些主题有关联，不能将仓库对应主题页当作官网原文的固定版本。

## 官网路由清单

| 序号 | 栏目 | 官网页面 | 官网路径 | v19.1.1 原文路径 | 译文路径 | 状态与例外 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 入门 | [Overview](https://omp.sh/docs) | `/docs` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 2 | 入门 | [Quickstart](https://omp.sh/docs/quickstart) | `/docs/quickstart` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 3 | 入门 | [Using omp](https://omp.sh/docs/using) | `/docs/using` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 4 | 入门 | [Slash commands](https://omp.sh/docs/slash) | `/docs/slash` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 5 | 入门 | [Keybindings](https://omp.sh/docs/keybindings) | `/docs/keybindings` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 6 | 入门 | [Settings](https://omp.sh/docs/settings) | `/docs/settings` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 7 | 入门 | [Run modes](https://omp.sh/docs/modes) | `/docs/modes` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 8 | 入门 | [Sessions](https://omp.sh/docs/sessions) | `/docs/sessions` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 9 | 入门 | [Session tree](https://omp.sh/docs/session-tree) | `/docs/session-tree` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 10 | 入门 | [Memory](https://omp.sh/docs/memory) | `/docs/memory` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 11 | 入门 | [Compaction](https://omp.sh/docs/compaction) | `/docs/compaction` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 12 | 入门 | [Plan mode](https://omp.sh/docs/plan) | `/docs/plan` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 13 | 入门 | [Goal mode](https://omp.sh/docs/goal) | `/docs/goal` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 14 | 入门 | [Handoff](https://omp.sh/docs/handoff) | `/docs/handoff` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 15 | 功能 | [Working with files](https://omp.sh/docs/files) | `/docs/files` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 16 | 功能 | [Code intelligence](https://omp.sh/docs/code-intelligence) | `/docs/code-intelligence` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 17 | 功能 | [Debugging](https://omp.sh/docs/debugging) | `/docs/debugging` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 18 | 功能 | [Structural edits](https://omp.sh/docs/editing) | `/docs/editing` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 19 | 功能 | [Code review](https://omp.sh/docs/review) | `/docs/review` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 20 | 功能 | [Creating commits](https://omp.sh/docs/commit) | `/docs/commit` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 21 | 功能 | [Security scans](https://omp.sh/docs/security) | `/docs/security` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 22 | 功能 | [Subagents](https://omp.sh/docs/subagents) | `/docs/subagents` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 23 | 功能 | [Advisor models](https://omp.sh/docs/advisor) | `/docs/advisor` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 24 | 功能 | [Vibe mode](https://omp.sh/docs/vibe) | `/docs/vibe` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 25 | 功能 | [Collab](https://omp.sh/docs/collab) | `/docs/collab` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 26 | 功能 | [Web & browser](https://omp.sh/docs/web) | `/docs/web` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 27 | 功能 | [Computer control](https://omp.sh/docs/computer) | `/docs/computer` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 28 | 功能 | [GitHub](https://omp.sh/docs/github) | `/docs/github` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 29 | 模型 | [Providers](https://omp.sh/docs/providers) | `/docs/providers` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 30 | 模型 | [Model roles](https://omp.sh/docs/roles) | `/docs/roles` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 31 | 模型 | [Agents & model roles](https://omp.sh/docs/agents-and-roles) | `/docs/agents-and-roles` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 32 | 模型 | [Custom models & providers](https://omp.sh/docs/custom-models) | `/docs/custom-models` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 33 | 模型 | [Prewalk](https://omp.sh/docs/prewalk) | `/docs/prewalk` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 34 | 定制 | [Context files](https://omp.sh/docs/context-files) | `/docs/context-files` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 35 | 定制 | [Skills](https://omp.sh/docs/skills) | `/docs/skills` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 36 | 定制 | [Prompt templates](https://omp.sh/docs/prompt-templates) | `/docs/prompt-templates` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 37 | 定制 | [Magic keywords](https://omp.sh/docs/magic-keywords) | `/docs/magic-keywords` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 38 | 定制 | [Hooks](https://omp.sh/docs/hooks) | `/docs/hooks` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 39 | 定制 | [Custom tools](https://omp.sh/docs/custom-tools) | `/docs/custom-tools` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 40 | 定制 | [Authoring subagents](https://omp.sh/docs/subagent-authoring) | `/docs/subagent-authoring` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 41 | 定制 | [MCP](https://omp.sh/docs/mcp) | `/docs/mcp` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 42 | 定制 | [Authoring MCP servers](https://omp.sh/docs/mcp-authoring) | `/docs/mcp-authoring` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 43 | 定制 | [Themes](https://omp.sh/docs/themes) | `/docs/themes` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 44 | 定制 | [TTSR rules](https://omp.sh/docs/ttsr) | `/docs/ttsr` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 45 | 定制 | [Plugins](https://omp.sh/docs/plugins) | `/docs/plugins` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 46 | 定制 | [Authoring extensions](https://omp.sh/docs/extension-authoring) | `/docs/extension-authoring` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 47 | 定制 | [Marketplaces](https://omp.sh/docs/marketplace) | `/docs/marketplace` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 48 | 编程接口 | [SDK](https://omp.sh/docs/sdk) | `/docs/sdk` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 49 | 编程接口 | [RPC mode](https://omp.sh/docs/rpc) | `/docs/rpc` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 50 | 编程接口 | [ACP](https://omp.sh/docs/acp) | `/docs/acp` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 51 | 参考 | [CLI reference](https://omp.sh/docs/cli) | `/docs/cli` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 52 | 参考 | [Environment variables](https://omp.sh/docs/env) | `/docs/env` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 53 | 参考 | [Secrets and auth](https://omp.sh/docs/secrets) | `/docs/secrets` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 54 | 参考 | [Tool approvals](https://omp.sh/docs/approvals) | `/docs/approvals` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 55 | 参考 | [Session format](https://omp.sh/docs/session-format) | `/docs/session-format` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
| 56 | 参考 | [Tools index](https://omp.sh/docs/tools) | `/docs/tools` | 未核验 | 未分配 | 未找到该官网页面的版本化来源 |
