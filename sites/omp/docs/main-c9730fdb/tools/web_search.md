---
title: "web_search"
description: "Oh My Pi 官方仓库文档：web_search。"
---

# web_search \{#web_search}

> 通过配置的搜索链运行一次网页查询，返回第一个可用的答案/来源，并可附带引用。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/web/search/index.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/web-search.md`
- 关键协作组件：
   - `packages/coding-agent/src/web/search/provider.ts`：惰性加载的提供方注册表；可用性链。
   - `packages/coding-agent/src/web/search/types.ts`：统一的 `SearchResponse` / `SearchProviderError` 类型。
   - `packages/coding-agent/src/ui/tools/web-search.tsx` / `packages/coding-agent/src/web/search/provider-types.ts`：会话记录渲染，以及共享的响应/提供方类型。
   - `packages/coding-agent/src/web/search/providers/base.ts`：提供方接口和共享参数契约。
   - `packages/coding-agent/src/web/search/providers/utils.ts`：凭据查找；来源归一化。
   - `packages/coding-agent/src/web/search/providers/browser-headers.ts`：抓取型提供方共享的 Chromium 导航请求头。
   - `packages/coding-agent/src/web/search/query.ts`：Google 风格查询解析、提供方语法格式化和宽松的结果过滤。
   - `packages/coding-agent/src/web/search/providers/browser-page.ts`：抓取型提供方共享的 fetch/无头浏览器页面加载器。
   - `packages/coding-agent/src/web/search/providers/anthropic.ts`：Claude 网页搜索提供方。
   - `packages/coding-agent/src/web/search/providers/brave.ts`：Brave Search API 适配器。
   - `packages/coding-agent/src/web/search/providers/deepseek.ts`：DeepSeek Search API 适配器。
   - `packages/coding-agent/src/web/search/providers/codex.ts`：OpenAI Codex SSE 适配器。
   - `packages/coding-agent/src/web/search/providers/openai.ts`：计费的 OpenAI API Responses 适配器，与 Codex OAuth 分开。
   - `packages/coding-agent/src/web/search/providers/openrouter.ts`：通过 OpenRouter 网页插件为 chat-completions 提供信息依据。
   - `packages/coding-agent/src/web/search/providers/duckduckgo.ts`：DuckDuckGo HTML 前端抓取器。
   - `packages/coding-agent/src/web/search/providers/ecosia.ts`：基于浏览器的 Ecosia 抓取器。
   - `packages/coding-agent/src/web/search/providers/exa.ts`：Exa API 或 MCP 适配器。
   - `packages/coding-agent/src/web/search/providers/firecrawl.ts`：Firecrawl 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/gemini.ts`：Gemini 信息依据 SSE 适配器。
   - `packages/coding-agent/src/web/search/providers/google.ts`：基于浏览器的 Google 搜索结果页抓取器。
   - `packages/coding-agent/src/web/search/providers/hackernews.ts`：用于 HN 范围查询的 Hacker News Search API（Algolia）适配器。
   - `packages/coding-agent/src/web/search/providers/jina.ts`：Jina Reader 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/kagi.ts`：Kagi 提供方包装器。
   - `packages/coding-agent/src/web/search/providers/kimi.ts`：Kimi 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/mojeek.ts`：基于浏览器的 Mojeek 抓取器（独立索引）。
   - `packages/coding-agent/src/web/search/providers/parallel.ts`：Parallel 提供方包装器。
   - `packages/coding-agent/src/web/search/providers/perplexity.ts`：Perplexity API / OAuth 适配器。
   - `packages/coding-agent/src/web/search/providers/public.ts`：聚合所有无需凭据引擎的 Public Web。
   - `packages/coding-agent/src/web/search/providers/searxng.ts`：自托管 SearXNG 适配器。
   - `packages/coding-agent/src/web/search/providers/startpage.ts`：Startpage（Google 代理）表单流程抓取器。
   - `packages/coding-agent/src/web/search/providers/synthetic.ts`：Synthetic 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/ollama.ts`：Ollama 网页搜索适配器。
   - `packages/coding-agent/src/web/search/providers/tavily.ts`：Tavily 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/tinyfish.ts`：TinyFish 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/keenable.ts`：Keenable 搜索适配器（带密钥或无密钥公共端点）。
   - `packages/coding-agent/src/web/search/providers/sofya.ts`：Sofya 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/xai.ts`：xAI Responses 网页和 X 搜索适配器。
   - `packages/coding-agent/src/web/search/providers/zai.ts`：Z.AI 远程 MCP 适配器。
   - `packages/coding-agent/src/web/parallel.ts`：Parallel 搜索/提取 HTTP 客户端。
   - `packages/coding-agent/src/web/kagi.ts`：Kagi HTTP 客户端。
   - `packages/coding-agent/src/tools/index.ts`：内置工具注册和启用标志。

## 输入 \{#inputs}

| 字段 | 类型 | 是否必填 | 描述 |
| --- | --- | --- | --- |
| `query` | `string` | 是 | 原始查询。解析器识别 `site:`/`-site:`、`after:`/`before:`、`inurl:`、`intitle:`、`intext:`、`filetype:`、`lang:`/`language:`、带引号的短语、排除项、`OR` 和指令别名。提供方将这些映射到原生过滤器或受支持的语法；正文/语言指令不属于集中式来源过滤器。 |
| `recency` | `"day" \| "week" \| "month" \| "year"` | 否 | 相对时间过滤器。由 Brave、DeepSeek、Perplexity、Parallel、Tavily、SearXNG、Kagi、TinyFish、Keenable、Sofya、Firecrawl、DuckDuckGo、Startpage、Google、Mojeek、Hacker News（`created_at_i` 下界）和 xAI（未提供 `after:`/`before:` 边界时使用 `x_search` 的 `from_date`）实现。Public Web 将其转发到各个引擎；其他适配器忽略此项。 |
| `limit` | `number` | 否 | 返回结果数上限。缺少 `num_search_results` 时，通常成为提供方请求的结果数量参数。TinyFish 在切片前将其用于分页获取。xAI 仅将合并后的值用作解析后来源/引用的本地上限，默认为 `10`，最大为 `30`。 |
| `max_tokens` | `number` | 否 | 由 Anthropic、Gemini、OpenAI Responses、xAI 和 Perplexity API 密钥模式透传的 token 上限。其他提供方忽略此项。 |
| `temperature` | `number` | 否 | 仅由支持采样参数的 Anthropic 模型、Gemini、xAI 和 Perplexity API 密钥模式透传。其他提供方/模型路径忽略或省略此项。 |
| `num_search_results` | `number` | 否 | 提供方原生搜索广度或本地结果上限，通常优先于 `limit`。Perplexity API 和 OpenRouter 在上游使用它；Anthropic、Gemini、Codex、OpenAI Responses 和 xAI 在本地限制解析后的来源。TinyFish 发送每页数量并分页。参见下方的适配器限制。 |

模式没有对数字字段施加整数、正数或范围约束；提供方适配器应用各自的上限。此内置工具按 read（读取）级别审批，采用严格的参数模式，并可被发现。

## 输出 \{#outputs}

工具返回一个文本内容块和结构化 `details`。

- `content`：`[{ type: "text", text: string }]`
- `details`：来自 `packages/coding-agent/src/web/search/types.ts` 的 `SearchResultDetails`
   - `response: SearchResponse`
   - `error?: string`
   - `failures?: SearchFailureDetail[]`：在回退答案和全部失败结果中，按链顺序列出失败候选；没有失败时不提供。每个条目为 `{ provider, label, reason, status? }`：`provider` 是搜索提供方 ID（提供方从未加载时为目录模型 ID），`reason` 是回退说明引用的、已展平且限制为 240 字符的文本，`status` 是 `SearchProviderError` 携带的状态（若有；`204` 表示答案因没有来源或可渲染内容而被拒绝）

`text` 由 `packages/coding-agent/src/web/search/index.ts` 中的 `formatForLLM()` 生成。首先输出放宽查询约束的说明：

- 若存在 `response.answer`，则先输出它。
- 若存在来源，随后为每个来源输出一个条目（只有同时生成答案时才输出带来源数量的 `## Sources` 标题）：
   - `[n] <title> (<formatted age or published date>)`
   - `    <url>`
   - 可选的片段行，截断为 240 字符。
- 若存在引用，随后输出 `## Citations` 一节，包含 URL/标题，以及可选的、截断为 240 字符的引用文本。
- 若存在相关问题，随后输出 `## Related` 项目列表。
- 若存在搜索查询，随后输出 `Search queries: <n>` 一节，限于前 3 个查询，每个最多 120 字符。

提供方不可用或尝试失败时，失败输出不会在工具边界抛出。工具改为返回：

- `content[0].text = "Error: ..."`
- `details.response.provider = <last attempted provider> | "none"`
- `details.error = ...`
- `details.failures = [...]`，每个失败候选一个条目（没有模型匹配时不提供，因为未运行任何候选）

流式传输：无。`WebSearchTool.execute()` 将其 `AbortSignal` 转发给 `executeSearch()`，`executeSearch()` 再将其传给提供方。若信号在回退处理期间中止，`throwIfAborted(signal)` 会重新抛出取消，而非返回 `"Error: ..."` 文本结果。

每个提供方搜索传输都从 `providers.webSearchTimeoutSeconds` 获得硬超时（默认 `60`，最大 `300`）。该传输超过上限时，自动链会记录提供方失败，并推进到下一个候选。此设置不是整条链的截止时间，且提供方可能施加更短的上游、重试或聚合限制。请设置正数秒数，例如对于较慢的模型驱动搜索，可用 `omp config set providers.webSearchTimeoutSeconds 180`。

## 流程 \{#flow}

1. `packages/coding-agent/src/web/search/index.ts` 中的 `WebSearchTool.execute()` 直接委托给 `executeSearch()`。
2. `executeSearch()` 使用 `roleCandidatePool("web", …)` 构建候选池：`web` 角色接受的可用模型，即 `web/*` 搜索引擎目录模型（类型为 `search`），以及声明了 `webSearch` 信息依据能力的聊天模型。然后对候选排序：
   - 若设置了 `params.model`（不在面向模型的模式中；由 `omp q --model <selector>` 设置），则该选择器最多解析到一个候选，并标记为显式；
   - 否则，`resolveRoleChain("web", …)`（`packages/coding-agent/src/config/model-resolver.ts`）产生[提供方选择](#modes--variants)中描述的 `web` 角色链。
3. `web/hosted` 在可用时先展开为活动模型同提供方的 `webSearchModel` 替换模型，再展开为活动模型本身，只保留具有信息依据能力的模型。替换模型失败时会转到活动模型。无法展开的占位符在自动模式下被跳过，在显式模式下则失败。每个剩余候选会惰性加载其搜索引擎或信息依据后端（`gemini`、`anthropic`、`codex`、`openai`、`xai`、`openrouter`）。显式候选使用 `isExplicitlyAvailable()`，自动候选使用 `isAvailable()`；不可用的显式候选会记录失败，而自动候选会被跳过。
   OpenAI Responses 和 Codex Responses 上的 GPT-5+ 模型使用 `gpt-6-luna` 作为同提供方的托管搜索替换目标。
   如果替换模型与活动模型的提供方和 ID 相同，则只尝试活动模型，即使它是与目录条目不同的独立对象，也保留会话特定配置。
4. 若没有可用候选且没有失败，`executeSearch()` 返回 `Error: No web search model configured.`（提供了 `params.model` 时则为 `No web search model matches selector "<model>".`），并设置 `details.response.provider = "none"`。
5. 对于每个按顺序排列的提供方，`executeSearch()` 使用以下参数调用 `provider.search()`：
   - `query`，
   - `limit`、`recency`、`temperature`、`maxOutputTokens`、`numSearchResults`，
   - `timeoutMs`，由 `providers.webSearchTimeoutSeconds` 派生，
   - 来自 `packages/coding-agent/src/prompts/system/web-search.md` 的 `systemPrompt`，
   - 解析后的结构化查询，包括识别出的指令及日期/域名/标题/URL/文件类型约束，
   - 候选的思考级别（如 `openai-codex/gpt-6-luna:xhigh` 这样的 `:<level>` 选择器后缀）。Codex 和 OpenAI API 将其作为 `reasoning.effort` 发送，与聊天一样限制在模型支持的级别内，并在级别未设置、为 `auto` 或 `off` 时省略该字段。Gemini 以相同方式限制级别，以选择按推理强度路由的传输模型 ID。xAI 始终发送推理强度 `low`。其他适配器忽略此项。
6. 提供方响应后，`applyQueryConstraints()` 对上游未保证的约束进行宽松的来源后过滤。它依次应用每个可过滤维度；任何会排除所有剩余结果的维度都会被放宽，并在开头输出 `Note: no results matched ...`。答案/引用文本不会被重写。
7. 具有信息依据的聊天响应须包含来源或引用；只有答案的补全会以状态 `204` 被拒绝。任何没有可渲染内容的响应也会被拒绝。第一个可接受响应被格式化为一个文本块。
8. 若提供方抛出异常，`executeSearch()` 记录错误并尝试下一个提供方。没有提供方级并行扇出；回退依次进行。
9. 所有候选失败后，`formatSearchProviderFailure()` 归一化每个错误：
   - Anthropic `404` 变为 `Anthropic web search returned 404 (model or endpoint not found).`
   - `401`/`403` 变为 `<Provider> authorization failed ...`，Z.AI 除外，它会保留其原始消息。
   - 其他 `SearchProviderError` 显示 `error.message`。
10.   若多个提供方失败，最终消息为 `All web search providers failed: <provider/error>; ...`；否则仅为归一化后的最后一个错误。

## 模式 / 变体 \{#modes--variants}

- **提供方选择**
   - 提供方由 `web` 模型角色选择。候选项是目录中的模型：搜索引擎使用 `web/<engine>`（例如 `web/brave`、`web/duckduckgo`），也可以使用目录条目声明了 `webSearch` 搜索增强的聊天模型（例如 `anthropic/claude-haiku-4-5`、内置的 `openai/gpt-6-luna` 或 `openai/gpt-5.6-luna`），此时由该模型运行搜索增强查询。
   - **主选项**：`modelRoles.web`。如果已设置，其中第一个与可用模型匹配的选择器模式就成为第一个候选项，且属于显式候选项。如果未设置，该角色通过内置的 `web` 优先级列表解析。
   - **回退项**：`retry.fallbackChains.web`。如果已设置（即使为空列表），主选项后面就跟随这些选择器，且都属于显式候选项。如果未设置，内置 `web` 优先级列表中与可用模型匹配的每个条目都会作为非显式候选项跟随其后。重复模型会被移除，任何显式选择器列出的模型都保持显式状态。
   - **显式与自动**：显式候选项使用 `isExplicitlyAvailable()`，因此当你选中 Perplexity 和 Public Web 时，它们可以运行未经身份验证的路径。Parallel、Exa 和 Firecrawl 在两种模式下都能运行无密钥路径。自动候选项使用 `isAvailable()`，缺少凭据时会被跳过。
   - **无密钥服务**（`providers.webKeyless`，默认 `true`）：关闭后，`executeSearch()` 会跳过所有其 `isKeyless()` 表明搜索将访问第三方、却没有使用你配置的凭据或端点的候选项：没有密钥的 Parallel、Exa 和 Keenable，没有密钥或自托管端点的 Firecrawl，没有直接身份验证的 Perplexity，以及抓取型引擎（Startpage、DuckDuckGo、Ecosia、Google、Mojeek、Hacker News、Public Web）。这也适用于配置的 `modelRoles.web` / `retry.fallbackChains.web` 条目，包括迁移后的链；只有按请求指定的选择器（`omp q --model web/duckduckgo`）仍会运行无密钥引擎。托管搜索、SearXNG 和带凭据的引擎不受影响。当所有候选项都因此被跳过时，工具返回 `Error: No configured web search service is available, and providers.webKeyless is off. …`。
   - **按请求指定的选择器**：`SearchQueryParams.model`（`omp q --model web/duckduckgo "…"`）会将整条链替换为这一个显式候选项。
   - **xAI 凭据顺序**：采用 xAI 搜索增强的候选项会在各自所占位置之间按提供方优先级重新排序，因此凡是 `xai-oauth` 登录与 `xai` API 密钥同时出现的位置，前者都会先运行（除非 `modelProviderOrder` 另有指定）；其他候选项的位置保持不变。
   - **仅限 X 的查询**：未按请求指定选择器时，如果查询的 `site:` 值全部为 X 主机，或通过 `from:<handle>` 指定作者，就会将链中采用 xAI 搜索增强的候选项移到前面；如果链中没有此类候选项，则将 `xaiModelChain()` 的默认 xAI 模型作为自动候选项添加到链首。只有 xAI 的 `x_search` 能访问 X 帖子。链的其余部分仍跟随其后。工具描述只在采用 xAI 搜索增强的模型具有凭据时才列出这些 X 运算符（`xSearchAvailable()`）。这项检查每个进程运行一次，时机为首次使用模型注册表读取描述时，因此描述和提示词缓存保持稳定；xAI 登录或退出登录对描述的影响在重启后生效（路由本身会实时遵循凭据变化）。
   - **仅限 Hacker News 的查询**：未按请求指定选择器时，如果查询的 `site:` 值全部为 `news.ycombinator.com`（带不带路径均可），就会将 `web/hackernews` 移到链首；如果链中未列出它，则将它作为自动候选项添加到链首。链的其余部分仍跟随其后，因此 HN 搜索失败或结果为空时会回退到配置的引擎。`web/hackernews` 不在默认链中；其他查询只能通过显式角色、回退项或按请求指定的选择器访问它。
   - **默认链**（`packages/catalog/src/compat/rules/runtime/behavior.kdl` 中的 `web` 角色默认值，通过 `roleDefaultModels()` 读取）：`web/parallel`、`web/hosted`、`web/exa`、`web/firecrawl`、`web/searxng`、`web/startpage`、`web/duckduckgo`、`web/ecosia`、`web/google`、`web/mojeek`、`web/public`。Parallel/Exa/Firecrawl 提供无密钥路径，但存在已配置凭据时会使用它们；托管搜索使用会话提供方的凭据。这条链并不保证零计费。其他付费引擎/聊天提供方需要显式配置角色/回退项。Public Web 只支持显式选择，绝不会自动运行。
   - **旧版设置**：加载时，`packages/coding-agent/src/config/settings.ts` 会将 `providers.webSearch`、`providers.webSearchOrder`、`providers.webSearchExclude` 和 `providers.webSearchGeminiModel` 迁移到 `modelRoles.web` 及 `retry.fallbackChains.web`，然后删除旧键。迁移绝不会覆盖已经设置的角色或链。迁移后的链由列出的提供方后接默认链组成，并移除被排除的提供方；`providers.webSearchGeminiModel` 只影响列出的 `gemini` 条目。
     旧版 `codex` 偏好设置和顺序条目会解析为 `openai-codex/gpt-6-luna`。
- **提供方超时**：`providers.webSearchTimeoutSeconds` 为每个提供方的搜索传输设置硬性时间上限，之后自动链会前进到下一项。默认值为 `60`；无效的非正值会回退到该默认值，大于 `300` 的值会被限制为该上限，但提供方特有的上游限制或总时间限制仍可能更短。
- **提供方适配器**
   - **Perplexity**：`packages/coding-agent/src/web/search/providers/perplexity.ts`
      - 可用性：依次尝试 Cookie、已存储的 OAuth，然后是直接 API 凭据。只有在没有任何凭据方式解析成功且候选项为显式选择时，才允许匿名搜索；已验证身份的方法失败后不会追加匿名尝试。自动准入需要直接 Perplexity 身份验证。绝不会借用 OpenRouter 密钥；要使用 OpenRouter 搜索增强，请选择 `openrouter/perplexity/…` 模型。
      - 浏览器 SSO：运行 `/login perplexity`（或在设置向导中选择 Perplexity），然后将电子邮件提示留空并按 Enter，或输入 `sso`。在专用浏览器窗口中完成登录，为你的组织选择 **Single sign-on (SSO)**。omp 会自动捕获并验证会话；不需要扩展、DevTools、复制 Cookie，也不需要从常用浏览器退出登录。
      - 浏览器登录要求运行 omp 的机器具有图形会话。它使用隔离的 Chromium 配置档案和无痕上下文，保留沙箱和 TLS 检查，在 Chromium 自动化模式之外运行（Google 登录会拒绝受自动化控制的浏览器），并在登录完成、取消或达到五分钟超时后关闭浏览器。Microsoft Edge 无法在自动化模式之外启动，因此当解析得到的浏览器是 Edge 时（包括通过 `PUPPETEER_EXECUTABLE_PATH` 指定的情况），登录会改用 omp 下载的 Chrome for Testing。在 omp 中按 Escape 可取消。如果操作系统仍锁定文件，配置档案清理会使用现有的重试并警告行为。
      - 保存的会话使用现有的 Perplexity 订阅，包括 Enterprise 席位；浏览器 SSO 不会切换到单独计费的 API 凭据。如果 Perplexity 使会话过期或撤销会话，请重新登录。在同一提示处输入电子邮件地址，可改用电子邮件验证码和身份验证器验证码流程。
      - 登录提示出现前，仍可能借用旧版 `ai.perplexity.mac` 会话。以 `PI_AUTH_NO_BORROW=1` 启动 omp 可跳过借用。受限钥匙串中的较新 Mac 应用会话不会被借用。
      - SDK 宿主可以提供 `OAuthController.onBrowserSession`，按偏好顺序检查并返回第一个匹配 `request.cookieNames` 的非空 Cookie 值。回调以私密方式返回该值；pi-ai 会在不导入浏览器自动化的情况下验证它。没有该回调的宿主保留电子邮件验证码流程。RPC 登录不会启动浏览器。
      - OAuth/Cookie/匿名模式：向 `https://www.perplexity.ai/rest/sse/perplexity_ask` 发送 POST，消费 SSE，合并部分事件，提取回答和来源 URL，设置 `authMode: "oauth"`（未经身份验证的回退为 `"anonymous"`）。
      - API 密钥模式：以默认模型 `sonar-pro`（可用 `PI_PERPLEXITY_API_MODEL` 覆盖）、`search_mode: "web"`、搜索广度及令牌/采样控制参数，流式访问 `https://api.perplexity.ai/chat/completions`。原生域名/日期/语言筛选器从查询中派生；绝对日期优先于时效性。
      - `num_search_results` 只在 API 密钥模式下控制上游 API 广度。`limit` 单独保留为 `num_results`，并在两种身份验证模式下解析后裁剪返回的 `sources`。
      - 输出可能包含 `answer`、`sources`、`citations`、`usage`、`model`、`requestId`、`authMode`。
   - **Gemini**：`packages/coding-agent/src/web/search/providers/gemini.ts`
      - 可用性：Google Developer API 密钥。
      - 查询：在所选模型的端点调用带 Google Search 搜索增强的 SSE `streamGenerateContent`。身份验证使用模型注册表解析器。HTTP 重试最多尝试四次，使用指数退避/服务器提供的延迟，延迟上限为五分钟，并受传输信号约束。
      - 模型：所选的 `web` 候选项（`google/…` 聊天模型）。
      - `max_tokens` 和 `temperature` 透传为 `generationConfig.maxOutputTokens` / `generationConfig.temperature`。
      - `limit` 与 `num_search_results` 在分发前合并。
      - 输出可能包含 `answer`、`sources`、`citations`、`searchQueries`、`usage`、`model`。
   - **Anthropic**：`packages/coding-agent/src/web/search/providers/anthropic.ts`
      - 可用性：所选模型提供方的凭据，或者当该提供方为 `anthropic` 时使用 `ANTHROPIC_SEARCH_API_KEY`。先尝试搜索专用密钥，身份验证重试时可使用注册表凭据。端点和配置的请求头来自所选模型；没有 `ANTHROPIC_SEARCH_BASE_URL` 覆盖项。
      - 模型：所选的 `web` 候选项。
      - 查询：启用网页搜索工具的 Claude Messages API。
      - `max_tokens` 透传。`temperature` 只对支持采样参数的模型透传；Opus 4.7+、Sonnet 5+ 和 Fable/Mythos 5+ 会省略此参数，因为这些 API 拒绝采样参数。
      - `num_search_results ?? limit` 在本地限制解析所得来源的数量；不会发送上游结果数量字段。
      - 输出可能包含 `answer`、`sources`、`citations`、`searchQueries`、`usage.searchRequests`、`model`、`requestId`。
   - **Codex**：`packages/coding-agent/src/web/search/providers/codex.ts`
      - 可用性：`agent.db` 中 `openai-codex` 的 OAuth 凭据，或在不存在已存储行时使用环境中的 `OPENAI_CODEX_OAUTH_TOKEN`；刷新在搜索时惰性进行。这使用 ChatGPT/Codex OAuth，而非 OpenAI API 计费。自定义模型注册表端点可以改用配置的 API 密钥/命令凭据，但自定义端点拒绝使用官方 OAuth/环境凭据。
      - 查询：流式访问 Codex Responses 端点，启用托管的 `web_search`、`search_context_size: "high"`，并在候选项设置了思考级别时，从中获取 `reasoning.effort`。Google 风格的指令会重新放入查询。
      - 模型：所选的 `web` 候选项。没有 `web_search_call` 的补全会被拒绝，而不是作为已搜索的内容呈现。
      - 忽略 `recency`、`max_tokens` 和 `temperature`。`num_search_results ?? limit` 在本地裁剪解析所得来源。
      - 输出可能包含 `answer`、`sources`、`usage`、`model`、`requestId`。如果流中没有 `url_citation` 注解，适配器会回退到回答中的 Markdown 链接和裸 URL。
   - **OpenAI API**：`packages/coding-agent/src/web/search/providers/openai.ts`
      - 可用性：所选模型提供方的非 OAuth 凭据。它使用模型注册表解析器，并明确拒绝 OAuth；不会借用 `openai-codex` 凭据。
      - 查询：向所选模型的 Responses 端点（`<model.baseUrl>/responses`；标准 OpenAI 基础 URL 为 `https://api.openai.com/v1`）发送非流式 JSON POST，启用托管的 `web_search`。如果候选项设置了思考级别，`reasoning.effort` 取自该级别；目录中的 Pro 别名还会发送 `reasoning.mode`。
      - 模型：目录中使用 `openai-responses` API 的 `openai` 类 GPT-5+ 模型声明了此搜索增强能力，包括兼容的代理宿主。目录中没有搜索增强声明的模型不是 `web` 候选项。
      - 如果响应不包含实际的 `web_search_call`，生成的回答会被拒绝。`usage.searchRequests` 统计 `search` 操作，不统计 `open_page` 或 `find_in_page`，没有搜索操作时会省略。
      - `site:` 主机映射到 `filters.allowed_domains`；其他指令会重新放入查询。`max_tokens` 透传为 `max_output_tokens`。忽略 `recency` 和 `temperature`。
      - `num_search_results ?? limit` 在本地硬性限制解析所得来源/引用的数量（默认 `10`，最大 `100`）；先收集回答中引用的 URL，因此在达到上限时，它们优先于仅供参考的来源得到保留。HTTP 失败会报告 OpenAI 的结构化 `type`/`code`/`param`，绝不报告自由格式错误消息（其中可能回显被掩码的密钥）。
      - 输出可能包含 `answer`、`sources`、`citations`、`searchQueries`、`usage`、`model`、`requestId`、`authMode: "api_key"`。
   - **OpenRouter**：`packages/coding-agent/src/web/search/providers/openrouter.ts`
      - 可用性：所选模型提供方的凭据。
      - 查询：向 `<model.baseUrl>/chat/completions` 发送 POST，携带 `plugins: [{ id: "web", max_results }]`。`num_search_results` 设置 `max_results`（默认 `5`）；不使用 `limit`、`recency`、`max_tokens` 和 `temperature`。
      - 将回答及 URL 引用注解解析为来源/引用。没有来源/引用的搜索增强响应会被编排器拒绝。
   - **xAI**：`packages/coding-agent/src/web/search/providers/xai.ts`
      - 可用性：所选模型的提供方（`xai`、`xai-oauth` 或兼容宿主）的凭据。角色候选项决定提供方；此适配器不会自行优先选择 OAuth 模型而非 API 密钥模型。
      - 查询：向 Responses API 发送 POST，携带所选 `web` 候选项的模型 ID、`tools: [{ type: "web_search", ... }, { type: "x_search", ... }]` 和推理强度 `low`；Grok 按查询决定搜索网页、X 帖子或两者。支持自定义模型注册表端点，但自定义端点拒绝使用官方 xAI OAuth 凭据。
      - `site:` 限于 `x.com`/`twitter.com`，或出现 `from:<handle>` 词项时，只发送 `x_search`；`site:` 不包含 X 主机，或出现单独的 `-site:x.com`/`-site:twitter.com` 时，只发送 `web_search`。其余最多五个 `site:` 或 `-site:` 主机映射到互斥的 `web_search` `allowed_domains` / `excluded_domains` 筛选器（允许列表优先）；路径限制保留给集中筛选处理。
      - `from:<handle>` 和 `site:x.com/<handle>` 变为 `x_search` 的 `allowed_x_handles`；`-from:<handle>` 和 `-site:x.com/<handle>` 变为 `excluded_x_handles`（允许列表优先；各最多 20 个）。`from:` 词项也会保留在查询文本中。
      - `after:`/`before:` 变为 `x_search` 的 `from_date`/`to_date`（包含起点，不包含终点，与指令一致），同时也作为提示保留在查询文本中，因为 `web_search` 没有日期字段。如果两端边界均未提供，`recency` 会将 `from_date` 设置为当前时间减去一天/一周/一个月/一年（UTC）。
      - 请求不携带 `search_parameters`（已弃用的 Live Search 字段现在返回 410）。
      - `max_tokens` 和 `temperature` 透传。`num_search_results`（或 `limit`）只通过 `clampNumResults(...)` 在本地限制解析所得来源/引用的数量，默认 `10`，最大 `30`；不会作为上游搜索数量参数发送。
      - 输出可能包含 `answer`、`sources`、`citations`、`usage`、`model`、`requestId`、`authMode: "api_key" | "oauth"`。
   - **Z.AI**：`packages/coding-agent/src/web/search/providers/zai.ts`
      - 可用性：环境或 `agent.db` 中 `zai` 的凭据。
      - 查询：针对远程 MCP 工具 `web_search_prime`，向 `https://api.z.ai/api/mcp/web_search_prime/mcp` 发送 JSON-RPC `tools/call`。
      - 提供方内部的回退链：先尝试 `{query,count}`，然后尝试 `{search_query,count}`，如果前面的尝试因参数形状错误而失败，再尝试 `{search_query, search_engine:"search-prime", count}`。
      - `limit` 与 `num_search_results` 在分发前合并。
      - 输出可能包含解析得到的自由文本 `answer`、`sources`、`requestId`。
   - **Exa**：`packages/coding-agent/src/web/search/providers/exa.ts`
      - 可用性：除非 `exa.enabled=false`，否则可用。`EXA_API_KEY` 或已存储的 `exa` 凭据会选择 API；否则搜索使用公共 MCP，这属于无密钥模式。如果已配置的凭据无法解析，会报错，而不是降级到 MCP。
      - 查询：使用解析得到的 Exa API 密钥向 `https://api.exa.ai/search` 发送 POST，否则针对远程 MCP 工具 `web_search_exa`，向 `https://mcp.exa.ai/mcp` 发送 JSON-RPC `tools/call`。
      - `limit` 与 `num_search_results` 在分发前合并。
      - 输出：根据最多 3 个结果摘要合成的 `answer`、`sources`、`requestId`。
   - **TinyFish**：`packages/coding-agent/src/web/search/providers/tinyfish.ts`
      - 可用性：`TINYFISH_API_KEY` 或 `agent.db` 中 `tinyfish` 的凭据。
      - 查询：向 `https://api.search.tinyfish.ai` 发送 GET，携带 `X-API-Key` 和 `query`；`recency` 映射到 `recency_minutes`。
      - `limit` / `num_search_results`：合并后限制在 `1..20`，默认 `10`；每页发送 `num_results=min(count,10)`，从 `page=0` 分页到最多 `page=10`，在页面结果不足或唯一 URL 已足够时停止，然后在本地裁剪。`lang:it-it` 映射为 `language=it`、`location=IT`。输出 `sources`、`authMode: "api_key"`。
   - **Keenable**：`packages/coding-agent/src/web/search/providers/keenable.ts`
      - 可用性：自动链只在存在 `KEENABLE_API_KEY` 或配置/存储的 `keenable` 凭据时才准入。显式选择 `web/keenable` 总会运行：没有密钥时会调用无密钥公共端点（按 IP 限流，不需要账户）。如果已配置的凭据无法解析，会报错，而不是降级到公共端点。
      - 查询：携带 `X-API-Key` 向 `https://api.keenable.ai/v1/search` 发送 POST，或在没有解析到密钥时，携带 `X-Keenable-Title: oh-my-pi` 向 `https://api.keenable.ai/v1/search/public` 发送 POST。请求体为 `{ query, max_results }`；单个 `site:` 主机映射到 `site`，`after:`/`before:` 映射到 `published_after`/`published_before`，`recency` 变为相对的 `published_after`（`1d`、`7d`、`1mo`、`1y`），除非查询已有 `after:` 边界。保留引号短语；其他指令交给后置筛选器处理。只有指令的查询会将其约束值（站点主机、`intitle:` 词语）作为关键词搜索；只有日期的查询会被拒绝。
      - `limit` / `num_search_results`：`params.numSearchResults ?? params.limit`，限制在 `1..50`，默认 `10`。
      - 输出：`sources`（摘要取自 `snippet`，`published_at` 作为 `publishedDate`）、`authMode: "api_key"` 或 `"anonymous"`。
   - **Sofya**：`packages/coding-agent/src/web/search/providers/sofya.ts`
      - 可用性：`SOFYA_API_KEY` 或配置/存储的 `sofya` 凭据。
      - 查询：使用 bearer 身份验证向 `https://sofya.co/v1/search` 发送 POST。请求体为 `{ query, search_depth: "snippets", max_results }`；`site:` / `-site:` 主机映射到 `include_domains` / `exclude_domains`（各最多 10 个；更多排除项交给后置筛选器处理），`after:`/`before:` 映射到包含端点的 `freshness` 范围 `YYYY-MM-DD:YYYY-MM-DD`，结束于 `before:` 的前一天（开放的一端延伸至 `1970-01-01` 或今天），否则 `recency` 透传为 `freshness`。保留引号短语和 `-` 排除项；其他指令交给后置筛选器处理。只有指令的查询会将其约束值作为关键词搜索；只有日期的查询会被拒绝。
      - `limit` / `num_search_results`：`params.numSearchResults ?? params.limit`，限制在 `1..20`，默认 `10`。
      - 输出：`sources`（摘要取自 `description`，否则取自 `content`；`published_date` 作为 `publishedDate`）、包含 Sofya 在重写查询时产生的 `relaxed_query` 或 `altered_query` 的 `searchQueries`、`authMode: "api_key"`。
   - **Jina**：`packages/coding-agent/src/web/search/providers/jina.ts`
      - 可用性：`JINA_API_KEY` 或配置/存储的 `jina` 凭据。
      - 查询：使用 bearer 身份验证及 JSON/无内容请求头，向 `https://s.jina.ai/<encoded query>?count=<count>` 发送 GET。单个 `site:` 主机映射到 `X-Site`；多个站点保留在查询内。
      - 忽略 `recency`、`max_tokens` 和 `temperature`。
      - `num_search_results ?? limit` 限制在 `1..20`，默认 `5`，并限制解析所得来源的数量。
      - 输出：只有 `sources`。
   - **Kagi**：`packages/coding-agent/src/web/search/providers/kagi.ts`、`packages/coding-agent/src/web/kagi.ts`
      - 可用性：环境或 `agent.db` 中 `kagi` 的凭据。
      - 查询：向 `https://kagi.com/api/v1/search` 发送 POST，携带 `Authorization: Bearer <key>` 和 JSON 请求体 `{ query, workflow: "search", limit, filters?: { after } }`。`recency` 映射到 `filters.after`，值为 UTC `YYYY-MM-DD` 字符串（`day`/`week`/`month`/`year`）。
      - `limit` 与 `num_search_results` 在分发前合并，限制在 `1..40`，默认 `10`。
      - 输出：`sources`（连接 `data.search` + `data.video` + `data.news` + `data.infobox`，其中视频/新闻/信息框结果在标题中标记）、`relatedQuestions`（`data.adjacent_question` + `data.related_search` 的 `props.question`）、`answer`（`data.direct_answer[0].snippet ?? title`）、`requestId`（`meta.trace`）。
   - **Tavily**：`packages/coding-agent/src/web/search/providers/tavily.ts`
      - 可用性：`TAVILY_API_KEY`，或通过 AuthStorage 配置/存储的 `tavily` 凭据。
      - 查询：向 `https://api.tavily.com/search` 发送 POST。
      - `recency` 映射到 `time_range`，不会将范围缩小为新闻。查询中的域名/日期筛选器映射到原生字段；绝对日期覆盖时效性。带时间筛选的响应为空时，会移除时间筛选重试一次。
      - `num_search_results ?? limit` 限制在 `1..20`，默认 `5`。
      - 输出：`answer`、`sources`、`requestId`、`authMode: "api_key"`。
   - **Firecrawl**：`packages/coding-agent/src/web/search/providers/firecrawl.ts`
      - 可用性：始终可用；未配置凭据或自托管端点时使用无密钥模式。如果已配置的凭据无法针对托管 API 解析，会报错，而不是降级到无密钥模式。
      - 查询：向 `https://api.firecrawl.dev/v2/search` 发送 POST，携带 `sources: [{ type: "web" }]`。端点由 `packages/coding-agent/src/web/firecrawl.ts` 中的共享解析器构造，该解析器应用 `FIRECRAWL_BASE_URL`（别名 `FIRECRAWL_API_URL`）自托管覆盖项。Google 风格的运算符会格式化到查询中；`recency` 和解析所得的绝对日期映射到 `tbs`。
      - `limit` / `num_search_results`：合并后限制在 `1..100`，默认 `10`；输出 `sources`、`requestId` 和 `authMode: "api_key" | "keyless"`。
      - 共享客户端还将 `/scrape` 暴露为 `providers.fetch` 阅读器后端，需要 Firecrawl 凭据；进程内的 `local` 引擎（`renderHtml`/`Reader`）是默认后端。API 参考：[docs.firecrawl.dev](https://docs.firecrawl.dev)。
   - **Brave**：`packages/coding-agent/src/web/search/providers/brave.ts`
      - 可用性：`BRAVE_API_KEY` 或配置/存储的 `brave` 凭据。
      - 查询：向 `https://api.search.brave.com/res/v1/web/search` 发送 GET，携带 `count`、`extra_snippets=true` 和时效性 `freshness=pd|pw|pm|py`。绝对日期边界覆盖时效性；安全搜索默认为 `moderate`。公共工具路径不会将 `lang:` 映射到 Brave 的可选语言/国家字段。
      - `limit` / `num_search_results`：`params.numSearchResults ?? params.limit`，限制在 `1..20`，默认 `10`。
      - 输出：`sources`、`requestId`。
   - **DeepSeek**：`packages/coding-agent/src/web/search/providers/deepseek.ts`
      - 可用性：`DEEPSEEK_API_KEY` 或配置/存储的 `deepseek` 凭据（与 DeepSeek 聊天模型使用相同密钥）。
      - 查询：向 `https://api.deepseek.com/v1/tools/search` 发送 POST，携带 `{ query, count }` 和 `Authorization: Bearer <key>`。指令会重写为 DeepSeek 的运算符集：引号短语、`-term`、用 `OR` 连接的 `site:` 主机、`-site:`、`lang:`（主子标签），以及 `after:`/`before:`。`recency` 变为 `after:` 日期，除非查询已有该日期。超过 128 个字符（API 限制）的查询会在请求之前失败。
      - `limit` / `num_search_results`：`params.numSearchResults ?? params.limit`，限制在 `1..50`，默认 `10`。
      - 输出：`sources`（摘要为面向模型的 `summary`，回退到 `snippet`）、`authMode: "api_key"`。按成功且非空的请求计费。
   - **Kimi**：`packages/coding-agent/src/web/search/providers/kimi.ts`
      - 可用性：`MOONSHOT_SEARCH_API_KEY`、`KIMI_SEARCH_API_KEY`，或 `agent.db` 中 `kimi-code` / `kimi-code-global` 的凭据。会有意拒绝 `MOONSHOT_API_KEY` 和已存储的 `moonshot` 凭据，因为开放平台密钥不能用于 Kimi Code 搜索服务的身份验证。
      - 查询：向 `MOONSHOT_SEARCH_BASE_URL` / `KIMI_SEARCH_BASE_URL` / 凭据的区域默认地址（环境密钥和 `kimi-code` 为 `https://api.kimi.com/coding/v1/search`，`kimi-code-global` 为 `https://api.kimi.ai/coding/v1/search`）发送 POST，携带 `text_query`、`limit`、`enable_page_crawling`、`timeout_seconds: 30`。
      - `limit` / `num_search_results`：`params.numSearchResults ?? params.limit`，限制在 `1..20`，默认 `10`。
      - 输出：`sources`、`requestId`。
   - **Parallel**：`packages/coding-agent/src/web/search/providers/parallel.ts`、`packages/coding-agent/src/web/parallel.ts`
      - 可用性：始终可用，且位于自动链首位，已配置时使用经过身份验证的搜索，否则使用无需凭据的 MCP。如果已配置的凭据无法解析，会报错，而不是降级到 MCP。
      - 查询：经过身份验证的请求向 `https://api.parallel.ai/v1beta/search` 发送 POST，携带 `objective`、一个搜索查询、`mode:"fast"`、`excerpts.max_chars_per_result:10000` 和 beta 请求头 `search-extract-2025-10-10`。域名筛选器和 `after:`/时效性映射到 `source_policy`；显式 `after:` 优先。无密钥请求在 `https://search.parallel.ai/mcp` 调用 `web_search`，只携带 `objective` 和 `search_queries`，保留查询运算符和根据时效性派生的日期提示；不发送会话或模型标识符。客户端标识为 `omp/<version>`。
      - 尽管名称如此，这里并不向多个提供方并发分发；当前适配器始终发送单元素的 `search_queries` 数组。
      - `limit` 与 `num_search_results` 在分发前合并，限制在 `1..40`，默认 `10`。
      - 输出：`sources`、`requestId`。
   - **Synthetic**：`packages/coding-agent/src/web/search/providers/synthetic.ts`
      - 可用性：环境或 `agent.db` 中 `synthetic` 的凭据。
      - 查询：向 `https://api.synthetic.new/v2/search` 发送 POST，携带 `{ query }`。
      - 忽略 `recency`、`max_tokens` 和 `temperature`。
      - `limit` 与 `num_search_results` 在分发前合并。
      - 输出：只有 `sources`。
   - **Ollama**：`packages/coding-agent/src/web/search/providers/ollama.ts`
      - 可用性：环境中的 `OLLAMA_CLOUD_API_KEY` 或 `agent.db` 中 `ollama-cloud` 的凭据。
      - 查询：向 `https://ollama.com/api/web_search` 发送 POST，携带 `{ query, max_results }`、`Authorization: Bearer <key>`。
      - 忽略 `recency`、`max_tokens` 和 `temperature`。
      - `limit` 与 `num_search_results` 在分发前合并，限制在 `1..10`，默认 `5`。
      - 输出：只有 `sources`。
   - **SearXNG**：`packages/coding-agent/src/web/search/providers/searxng.ts`
      - 可用性：`searxng.endpoint` 设置或 `SEARXNG_ENDPOINT` 环境变量提供的端点。
      - 查询：GET `<endpoint>/search?format=json&q=...`；设置可以选择类别、语言、引擎和安全搜索（`0`、`1`、`2`）。引擎快捷方式通过 `/config` 解析；`lang:` 覆盖配置的语言，外部 bang 指令在分发前移除。
      - 身份验证优先级：Basic 身份验证（`searxng.basicUsername` / `searxng.basicPassword` 或对应环境变量）优先于 bearer 令牌（`searxng.token` / `SEARXNG_TOKEN`）。Basic 凭据会按 RFC 7617 限制进行验证。
      - `recency` 映射到 `time_range`；`week` 降级为 `month`，因为 SearXNG 不支持周。
      - `limit` 与 `num_search_results` 在分发前合并，限制在 `1..20`，默认 `10`。
      - 输出：`sources`、来自实例回答记录的可选 `answer`，以及来自 `suggestions` 的 `relatedQuestions`。来源列表为空且存在上游引擎失败时，会抛出提供方错误。
   - **DuckDuckGo**：`packages/coding-agent/src/web/search/providers/duckduckgo.ts`
      - 可用性：始终可用；不需要 API 密钥。
      - 查询：向无 JS 的 HTML 前端 `https://html.duckduckgo.com/html/` 发送 POST，携带 `q`、区域设置 `kl`（默认 `us-en`；可识别的 `lang:` 区域设置会覆盖它）和可选的时效性 `df=d|w|m|y`；展开 DuckDuckGo 重定向 URL。此路径不会升级到 Chromium。
      - `recency` 映射到 `df`；忽略 `day|week|month|year` 之外的值。
      - `limit` / `num_search_results`：合并后限制在 `1..20`，默认 `10`；输出只暴露 `sources`（DuckDuckGo 的 HTML 页面不返回独立摘要）。
      - DuckDuckGo 在限制数据中心或共享出口 IP 时会返回机器人检测挑战（HTTP 200/202，响应体包含 `anomaly-modal`）。适配器会检测并抛出 `SearchProviderError`，以便编排器带着明确原因继续尝试下一个配置的提供方。
   - **Startpage**：`packages/coding-agent/src/web/search/providers/startpage.ts`
      - 可用性：始终可用；不需要 API 密钥。它代理 Google 的索引，先 GET 首页获取 `sc` 反机器人表单令牌，再 POST `/sp/search`（可回退到不带令牌的 GET）。`recency` 映射到 `with_date=d|w|m|y`。
      - 机器人/挑战页面或同意页面会抛出带提供方标记的 `SearchProviderError`（429），使链继续前进。
   - **Google / Ecosia / Mojeek**：`providers/google.ts`、`providers/ecosia.ts`、`providers/mojeek.ts`
      - 可用性：始终可用；不需要 API 密钥。`browserFetch`（`providers/browser-page.ts`）先尝试使用浏览器特征的普通 fetch，再将 fetch 失败、非 2xx 状态和挑战响应体升级到共享的隐身无头浏览器（`acquireBrowser`）；注入的 `params.fetch`（测试）绝不会升级。
      - Google：通过首页植入 Cookie，然后加载渲染后的搜索结果页；`recency` 映射到 `tbs=qdr:*`。Ecosia 位于 Cloudflare 之后（因此需要浏览器）；其自然搜索结果由 Google 支持；`recency` 在服务端不产生作用，会被静默忽略。Mojeek 前置 ALTCHA 工作量证明屏障，浏览器路径会自动求解；`recency` 映射到 `since=day|week|month|year`。
      - 挑战页面（Google 的 `unusual traffic`、Ecosia Firewall、Mojeek ALTCHA/robot 403）会抛出带提供方标记的 `SearchProviderError`（429）。
   - **Hacker News**：`packages/coding-agent/src/web/search/providers/hackernews.ts`
      - 可用性：始终可用；不需要 API 密钥。不在默认链中；仅限 HN 的查询会路由到它（参见**仅限 Hacker News 的查询**）。
      - 查询：对 HN Search API（`https://hn.algolia.com/api/v1/search`，按相关性排序）发起两次 GET，一次携带 `tags=story`，一次携带 `tags=comment`。引号短语和 `-exclusions` 保留在 `query` 中（`advancedSyntax=true`）；`OR` 备选项作为关键词发送，并列入 `optionalWords`；`intitle:`/`intext:`/`inurl:` 的值变为普通关键词。没有关键词的查询只针对故事发送空 `query`，列出日期范围内得分最高的故事。
      - `after:`/`before:` 变为针对 `created_at_i` 的 `numericFilters`（包含起点，不包含终点）；两者均未提供时，`recency` 将下界设为 1/7/30/365 天前那一天的 UTC 起始时间。
      - `limit` / `num_search_results`：合并后限制在 `1..30`，默认 `10`，作为每种类型的 `hitsPerPage` 发送。故事排在前面，占一半名额，其余为评论；任一种类型都可补足另一种的缺额。
      - 输出：只有 `sources`。每个来源都链接到 HN 条目页（`https://news.ycombinator.com/item?id=…`），绝不链接到故事提交的链接。故事摘要包含积分、评论数、提交者、提交的链接和任何正文；评论来源以 `Comment by <author> on: <story title>` 为标题，以评论文本为摘要。
   - **Public Web**：`packages/coding-agent/src/web/search/providers/public.ts`
      - 可用性：只支持显式选择（`isAvailable()` 为 `false`；`isExplicitlyAvailable()` 为 `true`）。
      - 查询：并发分发到五个无需凭据的引擎（`startpage`、`google`、`duckduckgo`、`ecosia`、`mojeek`），然后整合结果。URL 按规范化键去重（移除主机中的 `www.`、规范化尾部斜杠、保留查询、移除片段），先按跨引擎共识排序，再按各引擎中的最佳排名排序；采用最长的摘要。
      - 截止时间竞速：在所有引擎均已结束、有至少一次成功时达到 5 秒软截止时间、或达到 30 秒硬上限这三种情况中，最早发生时返回；未完成的请求会被中止。允许个别引擎失败；只有所有引擎都失败时才会失败。

## 副作用 \{#side-effects}

- 网络
   - 通过 HTTPS 调用一个或多个外部搜索提供方，直到某个成功或全部失败。
   - 提供方专用传输包括 JSON POST（包括 OpenAI Responses）、JSON GET、SSE 流式传输（Perplexity OAuth/API、Gemini、Codex）和基于 HTTP 的 JSON-RPC（Z.AI）。
- 子进程 / 原生绑定
   - 大多数 HTTP/API 适配器不会派生任何进程。Google、Ecosia 和 Mojeek 先尝试普通 fetch，但生产环境中失败、非 2xx 或遇到挑战的响应可能会获取由项目共享代理服务持有的无头 Chromium。没有 CLI 工作进程入口的宿主（例如嵌入式 SDK 宿主）则会启动进程本地的 Chromium。
   - 此回退可能启动 Chromium 进程并创建其浏览器配置档案生命周期。首次使用浏览器时，如果没有可用的系统 Chromium 或 `PUPPETEER_EXECUTABLE_PATH`，还可能将 Chromium 下载到 omp Puppeteer 缓存中。搜索适配器本身不使用原生绑定。
- 会话状态（会话记录、记忆、作业、检查点、注册表）
   - 使用 `packages/coding-agent/src/web/search/provider.ts` 中的模块全局提供方实例缓存。
   - `packages/coding-agent/src/tools/index.ts` 通过 `cfgWebSearchEnabled.get(session.settings)`（`web_search.enabled`，定义于 `packages/coding-agent/src/tools/settings.ts`）控制工具可用性。
- 后台工作 / 取消
   - 许多提供方适配器接受 `AbortSignal`；`WebSearchTool.execute()` 将工具调用信号传入 `executeSearch()`，后者将其作为 `params.signal` 转发给提供方，并在回退期间重新抛出取消。

## 限制与上限 \{#limits--caps}

- 默认链长度：11 个选择器（`packages/catalog/src/compat/rules/runtime/behavior.kdl` 中的 `web` 角色默认值）。
- `formatForLLM()` 将来源摘要和引用文本截断为 240 个字符（`packages/coding-agent/src/web/search/index.ts`）。
- `formatForLLM()` 最多输出 3 个搜索查询，每个截断为 120 个字符（`packages/coding-agent/src/web/search/index.ts`）。
- Brave 结果数量：默认 `10`，最大 `20`（`packages/coding-agent/src/web/search/providers/brave.ts` 中的 `DEFAULT_NUM_RESULTS`、`MAX_NUM_RESULTS`）。
- DeepSeek 结果数量：默认 `10`，最大 `50`；查询长度最多 `128` 个字符（`packages/coding-agent/src/web/search/providers/deepseek.ts`）。
- Keenable 结果数量：默认 `10`，最大 `50`（`packages/coding-agent/src/web/search/providers/keenable.ts`）。
- Sofya 结果数量：默认 `10`，最大 `20`（`packages/coding-agent/src/web/search/providers/sofya.ts`）。
- TinyFish 数量：默认 `10`，最大 `20`；每页最多发送 `10` 个结果，获取页面 `0..10`，直到唯一来源足够或页面结果不足。
- Jina 数量：默认 `5`，最大 `20`；OpenRouter 插件广度：默认 `5`。
- DuckDuckGo 结果数量：默认 `10`，最大 `20`（`packages/coding-agent/src/web/search/providers/duckduckgo.ts`）。
- Startpage / Google / Ecosia / Mojeek 结果数量：默认 `10`，最大 `20`（各自的 `providers/*.ts` 模块）。
- Public Web 结果数量：默认 `15`，最大 `30`；并发分发软截止时间 `5s`，硬上限 `30s`（`packages/coding-agent/src/web/search/providers/public.ts`）。
- Tavily 结果数量：默认 `5`，最大 `20`（`packages/coding-agent/src/web/search/providers/tavily.ts`）。
- Firecrawl 结果数量：默认 `10`，最大 `100`（`packages/coding-agent/src/web/search/providers/firecrawl.ts`）。
- Kimi 结果数量：默认 `10`，最大 `20`；请求超时字段固定为 `30` 秒（`packages/coding-agent/src/web/search/providers/kimi.ts`）。
- Parallel 结果数量：默认 `10`，最大 `40`；每个结果的摘录上限为 `10_000` 个字符（`packages/coding-agent/src/web/search/providers/parallel.ts`、`packages/coding-agent/src/web/parallel.ts`）。
- Kagi 结果数量：默认 `10`，最大 `40`（`packages/coding-agent/src/web/search/providers/kagi.ts`）。
- SearXNG 结果数量：默认 `10`，最大 `20`（`packages/coding-agent/src/web/search/providers/searxng.ts`）。
- OpenAI API 本地来源/引用上限：`num_search_results` 优先于 `limit`，默认 `10`，最大 `100`；该数量不会发送到上游（`packages/coding-agent/src/web/search/providers/openai.ts`）。
- xAI 本地来源/引用上限：`num_search_results` 优先于 `limit`，省略/无效/零 => 默认 `10`，最大 `30`；该数量不会发送到上游（`packages/coding-agent/src/web/search/providers/xai.ts`）。
- Perplexity API 密钥模式默认值：`max_tokens = 8192`、`temperature = 0.2`、`num_search_results = 20`（`packages/coding-agent/src/web/search/providers/perplexity.ts`）。
- Anthropic 默认值：提供方省略 `max_tokens` 时，`DEFAULT_MAX_TOKENS = 4096`（`packages/coding-agent/src/web/search/providers/anthropic.ts`）。
- Gemini HTTP 重试：最多 `3` 次重试，指数退避基础延迟 `1000` 毫秒，每次重试延迟上限 `5 * 60 * 1000` 毫秒；传输中止信号约束尝试和延迟。

## 错误 \{#errors}

- 工具级无候选项情况会返回正常工具结果，内容为 `Error: No web search model configured.`（或 `No web search model matches selector "<model>".`，或者在该设置跳过所有候选项时返回 `providers.webKeyless` 消息）；不会抛出异常。
- 工具级全部失败情况也会返回带 `Error: ...` 的正常工具结果；消息为单个规范化提供方错误，或所有失败提供方的分号分隔摘要。
- 提供方适配器通常对 HTTP 或协议失败抛出 `SearchProviderError(provider, message, status)`。
- 可用性因提供方而异：大多数带凭据的适配器检查 AuthStorage，而无密钥引擎和显式选择的 Perplexity/Public Web 有独立的准入规则。
- 各提供方值得注意的失败：
   - Anthropic：缺少凭据时抛出普通 `Error`；`404` 由 `formatSearchProviderFailure()` 重新映射为特殊的最终消息。
   - Perplexity：没有获准的身份验证方式时抛出 `SearchProviderError("perplexity", ..., 401)`；ask 流中的 `error_code` 事件也会变为提供方错误。
   - Gemini：身份验证刷新和 HTTP 重试在内部进行；重试耗尽后的失败通过共享的提供方失败处理机制呈现。
   - Codex 和 Gemini 在 HTTP 响应为 `200` 却没有响应体时都会失败。
   - Z.AI 将格式错误的 SSE/JSON-RPC 载荷视为提供方错误，并且只针对参数形状失败在请求变体间重试。
   - 如果 Basic 身份验证字段不完整或无效，SearXNG 的 `findAuth()` 可在任何 HTTP 调用之前抛出配置错误。

## 说明 \{#notes}

- 面向模型的模式不暴露提供方或模型；CLI/内部调用方可通过 `SearchQueryParams.model` 固定其中一个。
- `executeSearch()` 在链到达相应提供方时惰性加载其模块。提供方实例按 ID 缓存（`packages/coding-agent/src/web/search/provider.ts`），通过 `getSearchProviderLabel()` 获取标签不会触发导入。
- 大多数提供方将 `limit` 和 `num_search_results` 视为同一个数量，因为适配器传递 `params.numSearchResults ?? params.limit`。Perplexity 保留两个概念。TinyFish 将合并后的值用作本地上限，逐页序列化 `num_results`，并在需要更多结果时分页。xAI 只用它限制解析所得来源/引用的数量（默认 `10`，最大 `30`）。
- `recency` 在 Brave、DeepSeek、Perplexity、Parallel、Tavily、SearXNG、Kagi、TinyFish、Keenable、Sofya、Firecrawl、DuckDuckGo、Startpage、Google、Mojeek、Hacker News（`created_at_i` 下界）和 xAI（未给出 `after:`/`before:` 边界时的 `x_search` `from_date`）中有原生映射或引擎查询映射。Ecosia 忽略它。Public Web 将请求转发给其引擎。
- `packages/coding-agent/src/web/search/provider-types.ts` 中的 `SEARCH_PROVIDER_LABELS` 是每种搜索实现（引擎和搜索增强）的 ID→标签注册表；提供方 ID、`SearchResponse` 和会话记录渲染器都派生自它。选择逻辑本身只存在于 `web` 模型角色中。
- 无需凭据的抓取器位于自动链末端：Startpage 和 DuckDuckGo 排在基于浏览器的 Ecosia、Google 和 Mojeek 路径之前；`public` 列在最后，绝不会被自动选择。
- `/login exa` 将粘贴的密钥存入 AuthStorage；Exa 会先解析已存储或环境中的凭据，再回退到未经身份验证的 `https://mcp.exa.ai/mcp`。
