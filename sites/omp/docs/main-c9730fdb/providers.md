---
title: "模型提供方"
description: "Oh My Pi 官方仓库文档：模型提供方。"
---

# 模型提供方 \{#providers}

模型提供方是 `omp` 可以将请求路由到的模型后端：Anthropic、OpenAI、Google Gemini、Groq、OpenRouter、Mistral、xAI、Ollama 等本地引擎、托管网关、自定义 `models.yml` 模型提供方，以及扩展注册的模型提供方。

**模型提供方**是账户或后端命名空间，例如 `anthropic`、`openai`、`google` 或 `ollama`。**模型**是该模型提供方下的具体模型，通过 `provider/model-id` 选择，例如 `anthropic/claude-opus-4-6`。禁用模型提供方会让其下所有模型都无法选择；如果想缩小单个模型的范围，请改用模型设置。

本页涵盖模型提供方如何变为可用、凭据如何解析、模型提供方/环境变量映射、本地引擎、禁用模型提供方及自定义模型提供方。原生 Kiro 认证、模型发现和流式传输参见 [Kiro](./kiro.md)。端点特定的请求、推理、工具、流、用量和重试约束参见[模型提供方端点约束](./provider-endpoint-constraints.md)。模型选择和完整的 `models.yml` 模式参见[模型与模型提供方配置](./models.md)。配置文件位置和合并优先级参见[设置](./settings.md)。凭据存储和登录流程的深入说明参见[密钥与凭据](./secrets.md)。完整的环境变量参考参见[环境变量](./environment-variables.md)。本地引擎设置参见[本地模型](./local-models.md)。上下文文件发现提供方参见[上下文文件](./context-files.md)。

## `omp` 如何判断模型提供方可用 \{#how-omp-decides-a-provider-is-available}

模型注册表组合以下来源：

1. 捆绑模型目录。
2. 活动智能体目录的 `models.yml`（默认：`~/.omp/agent/models.yml`）中的自定义模型提供方和模型条目。
3. 本地引擎和启用了发现的托管模型提供方的缓存模型及运行时发现模型。
4. 扩展注册的模型提供方和模型，包括扩展自有的发现。

启动时加载配置和缓存发现元数据，不等待每个端点。在线刷新随后填充由发现支持的目录。成功的权威发现可以替换捆绑模型提供方行；显式自定义模型和覆盖会重新应用到发现的目录。由凭据代理支持的网关模式会忽略本地 `models.yml` 路由、凭据和自定义模型。

注册表可以持有当前无法选择的模型。模型只有在以下两个条件都满足时才会变为**可用**：

1. 其模型提供方 ID **不**在有效的 `disabledProviders` 列表中；**并且**
2. 模型提供方**无须密钥**（隐式本地模型提供方、具有 `auth: none` 的自定义模型提供方，或以无密钥模式保存的可选密钥登录），**或者**已配置认证。

可用性是快速配置检查，不是凭据验证请求：它不执行由命令提供的密钥，也不刷新 OAuth token。因此，无效的已配置密钥也可能显示为可用，并在推理时失败。

`disabledProviders` 在凭据**之前**检查。如果模型提供方 ID 被禁用，任何已存储密钥、OAuth 会话、环境变量、`.env` 条目或 `models.yml` 的 `apiKey` 都不能使其可选，无论凭据如何，该模型提供方的模型都会从可用列表中移除。从有效列表中移除该 ID 即可恢复它们。

隐式 `ollama` 和 `lm-studio` 发现默认无须密钥；隐式 `llama.cpp` 在未配置认证时无须密钥。Apple Foundation Models 在受支持的 Apple Silicon 系统上也无须密钥。参见[内置本地引擎](#built-in-local-engines)。

## 凭据与优先级 \{#credentials-and-precedence}

当模型提供方需要 API 密钥时，`omp` 按以下顺序解析（第一个匹配项生效）：

1. **运行时覆盖**：为当前进程提供的密钥，例如 CLI `--api-key`。从不持久化。
2. **`models.yml` 配置密钥**：固定在自定义模型提供方上的 `apiKey`，注册为配置来源的 bearer 凭据。这有意优先于已存储 OAuth，使自定义 `baseUrl` 或网关所提供的密钥得到采用，而不是转发会被代理拒绝的上游 OAuth token。
3. **已存储的 OAuth 凭据**：需要时刷新；多个账户会自动排序和轮换。对于 Anthropic 和 ChatGPT（Codex），每个组织或工作区都算作独立账户：一个同时拥有 Team 或 Enterprise 席位及个人套餐的邮箱，可以为每份订阅各登录一次（在浏览器授权页面选择工作区），轮换时会将它们视为两个账户。
4. **登录来源的已存储 API 密钥**：成功 `/login` 后保存的 API 密钥凭据。
5. **扩展配置回退**：同时注册了 `apiKey` 引用和 OAuth/登录流程的扩展模型提供方，会将该引用排在已存储 OAuth 和登录密钥之后。
6. **模型提供方环境变量**：包括从 `.env` 文件加载的值（参见[环境变量表](#environment-variables-and-env-files)）。
7. **其他已存储 API 密钥**：例如从凭据代理迁移的密钥。这是最后手段，以便显式环境变量优先。

本地凭据位于活动认证存储中（默认：`~/.omp/agent/agent.db`）；凭据代理模式使用配置的共享认证代理。命名配置档案和 Linux XDG 布局可以改变存储位置。在默认配置档案中，`PI_CODING_AGENT_DIR` 会覆盖智能体目录。路径解析参见[设置](./settings.md)和[密钥与凭据](./secrets.md)。

### 凭据存储 \{#credential-storage}

`agent.db` 中的凭据可以通过保存在操作系统凭据保管库中的主密钥进行加密（AES-256-GCM，每个凭据使用新的盐）：macOS Keychain、Windows Credential Manager，或 Linux 上的 Secret Service 密钥环。默认情况下，存储保持其模式：现有未加密存储继续不加密，已加密存储继续加密，新建存储在保管库无需提示即可响应时会加密。无头主机（SSH 会话、CI、没有显示环境的 Linux）不会自行使用保管库。在 `config.yml` 中设置 `auth.encrypt: true`（或 `OMP_AUTH_ENCRYPT=1`）以加密新凭据，或设为 `false` 停止：下次启动会解密已加密的凭据（最后读取一次保管库），之后 omp 不再访问保管库。将 `agent.db` 复制到另一台机器后，其加密凭据在该机器上不可读，除非该机器获得相同密钥：`omp auth key` 会打印该密钥，`omp auth key -` 从 stdin 读取一个密钥，将其存入保管库，并使用它重新加密该机器的凭据（`omp auth key | ssh host omp auth key -`）。在凭据代理模式下，凭据代理主机加密其自身的存储。

### OAuth 与 API 密钥，以及模型提供方范围的登录 \{#oauth-vs-api-key-and-provider-scoped-logins}

登录**按模型提供方划定范围**：对 `anthropic` 认证不会对 `openai` 认证，每个模型提供方跟踪自己的凭据。即使存储的认证有效，禁用的模型提供方仍然禁用。

在会话内使用交互式斜杠命令：

- `/login`：打开 OAuth/密钥选择器。`/login <provider>` 直接跳转到一个模型提供方（例如 `/login anthropic`）；对于需要粘贴回调的 OAuth 流程，运行 `/login <redirect-url>` 完成。
- `/logout`：打开模型提供方选择器，以移除已存储的凭据。

在会话外，`omp login [<provider>]` 从终端运行相同登录流程，包括扩展注册的模型提供方：它打印认证 URL（并在浏览器中打开），从 stdin 读取提示输入，并保存到会话使用的同一存储，即本地 `agent.db` 或配置的认证代理。不指定模型提供方时，它会显示编号选择器。成功登录会在线刷新该模型提供方的模型目录，使新解锁的模型可见。

对于由共享认证代理支持的无头或远程设置，CLI 提供 `omp auth-broker login <provider>` / `omp auth-broker logout`（以及 `status`、`list`、`import`、`migrate`）。凭据代理模型参见[密钥与凭据](./secrets.md)。

当模型没有凭据时，`omp` 会提示你运行 `/login` 或设置模型提供方的环境变量。

对于 ClinePass，设置 `CLINE_API_KEY` 或运行 `/login cline-pass`，打开 Cline 仪表盘并针对 `/users/me` 验证新创建的 API 密钥，不进行补全探测，也不产生订阅配额费用。OMP 从 Cline 的公开推荐模型端点刷新成员列表，并捆绑已审查的 Cline 元数据以供离线启动使用。新的实时 ID 会从上游参考条目补充信息，或使用保守元数据，不编造推理控制。`omp usage` 报告五小时、每周和每月配额窗口。免费层模型标记为 `(free)`，并使用相同密钥；订阅模型显示 API 等效参考定价，而流式网关成本是实际费用的权威依据。请求采用与 Cline CLI 相同的客户端请求头和稳定的逐会话任务 ID；推理控制仍因模型而异。

对于 Command Code，设置 `COMMAND_CODE_API_KEY` 或运行 `/login commandcode`；登录会针对 Command Code 的 `/alpha/whoami` 端点检查密钥，并像 Command Code CLI 一样，只在收到 401 时拒绝它，因此 403 或检查端点不可达时会保留密钥。Claude 模型使用 Anthropic Messages 端点，十个 GPT 模型使用 OpenAI Responses 端点，其他模型使用 Chat Completions，与 Command Code CLI 的划分相同。思考等级、图像输入、输出限制和价格遵循 Command Code CLI 的模型注册表；Claude Sonnet 5.5 的思考等级和图像输入尚未列在该注册表中，因此这两项取自 Anthropic 目录。GPT 模型可以运行托管网页搜索，但不能运行托管图像生成，因为 Command Code 不提供后者。TypeSafe 的 `typesafe/jev` 决策模型可用于 `judge` 角色。`omp usage`、`/usage` 和状态行显示信用余额，以及在具有相应窗口的套餐上显示五小时和每周窗口。这些数字来自 Command Code CLI 使用的账户端点；Provider API 文档没有记录它们。

### 在 `models.yml` 中固定密钥 \{#pinning-a-key-in-modelsyml}

自定义模型提供方的 `apiKey` 解析为**环境变量名或字面值**：如果该值按大小写精确匹配一个值非空的环境变量，就使用该变量值；否则该字符串本身就是密钥。为值添加 `!` 前缀会将其作为 shell 命令运行，并使用去除首尾空白的 stdout（完整值语法参见[模型与模型提供方配置](./models.md)）。

```yaml
# ~/.omp/agent/models.yml
providers:
   my-gateway:
      baseUrl: https://gateway.example.com/v1
      api: openai-completions
      apiKey: MY_GATEWAY_API_KEY # reads this env var if set, else literal text
      models:
         - id: claude-sonnet
           name: Claude Sonnet via Gateway
           contextWindow: 200000
           maxTokens: 8192
```

如果自定义模型提供方设置了 `authHeader: true`，解析后的密钥会作为 `Authorization: Bearer <key>` 请求头注入发往该模型提供方的每个请求。

## 环境变量和 `.env` 文件 \{#environment-variables-and-env-files}

以下变量在运行时/配置覆盖以及已存储 OAuth/登录凭据之后提供凭据。仅通过登录认证的模型提供方可能没有密钥变量。普通回退名称来自目录模型提供方 KDL；认证策略可以通过有序名称或计算解析器覆盖它们。

### 核心模型提供方 \{#core-providers}

| 模型提供方 ID | 环境变量 |
| --- | --- |
| `anthropic` | `ANTHROPIC_OAUTH_TOKEN`，其次 `ANTHROPIC_API_KEY`（当 `CLAUDE_CODE_USE_FOUNDRY=true` 时，Foundry 模式优先使用 `ANTHROPIC_FOUNDRY_API_KEY`） |
| `openai` | `OPENAI_API_KEY` |
| `openai-codex` | `OPENAI_CODEX_OAUTH_TOKEN` |
| `google` | `GEMINI_API_KEY` |
| `google-vertex` | `GOOGLE_CLOUD_API_KEY`，或 ADC（显式 `GOOGLE_APPLICATION_CREDENTIALS` 或 gcloud 的默认 ADC 文件，加上项目和位置变量；见下文） |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `xai-oauth` | `XAI_OAUTH_TOKEN`，其次 `XAI_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN` |
| `cursor` | `CURSOR_ACCESS_TOKEN` |
| `azure` | `AZURE_OPENAI_API_KEY` |
| `amazon-bedrock` | `AWS_BEARER_TOKEN_BEDROCK`、AWS 配置档案、`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`，或 ECS/IRSA/EC2 凭据链 |

### 其他托管模型提供方 \{#additional-hosted-providers}

| 模型提供方 ID | 环境变量 |
| --- | --- |
| `abliteration` | `ABLITERATION_API_KEY`，其次 `ABLIT_KEY` |
| `arkanecloud` | `ARKANECLOUD_API_KEY` |
| `aiand` | `AIAND_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `alibaba-token-plan` | `ALIBABA_TOKEN_PLAN_API_KEY`，其次 `BAILIAN_TOKEN_PLAN_API_KEY` |
| `baseten` | `BASETEN_API_KEY` |
| `bedrock-mantle` | `AWS_BEARER_TOKEN_BEDROCK` 或 AWS 凭据链（SigV4） |
| `chutes` | `CHUTES_API_KEY` |
| `commandcode` | `COMMAND_CODE_API_KEY`，其次 `COMMANDCODE_API_KEY` |
| `coralbricks` | `CORAL_API_KEY`，其次 `CORALBRICKS_API_KEY` |
| `deepinfra` | `DEEPINFRA_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `siliconflow-cn` | `SILICONFLOW_CN_API_KEY` |
| `fireworks` | `FIREWORKS_API_KEY` |
| `together` | `TOGETHER_API_KEY` |
| `modular` | `MODULAR_API_KEY` |
| `typesafe` | `TYPESAFE_API_KEY` |
| `coreweave` | `COREWEAVE_API_KEY`，其次 `WANDB_API_KEY` |
| `nvidia` | `NVIDIA_API_KEY` |
| `devin` | `DEVIN_API_KEY` |
| `gmi-cloud` | `GMI_API_KEY` |
| `huggingface` | `HUGGINGFACE_HUB_TOKEN`，其次 `HF_TOKEN` |
| `inception` | `INCEPTION_API_KEY` |
| `kiro` | `KIRO_API_KEY`（`ksk_…`）；`KIRO_API_REGION` 固定其区域 |
| `moonshot` | `MOONSHOT_API_KEY` |
| `stepfun` | `STEPFUN_API_KEY` |
| `helmcode` | `HELMCODE_API_KEY` |
| `meta` | `MODEL_API_KEY`，其次 `META_API_KEY` |
| `nanogpt` | `NANO_GPT_API_KEY` |
| `novita` | `NOVITA_API_KEY` |
| `venice` | `VENICE_API_KEY` |
| `vercel-ai-gateway` | `AI_GATEWAY_API_KEY`（目录发现也使用 `VERCEL_AI_GATEWAY_API_KEY`） |
| `cloudflare-ai-gateway` | `CLOUDFLARE_AI_GATEWAY_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_GATEWAY_ID` |
| `cloudflare-workers-ai` | `CLOUDFLARE_API_TOKEN`，其次 `CLOUDFLARE_AUTH_TOKEN`，+ `CLOUDFLARE_ACCOUNT_ID` |
| `liquid` | `LIQUID_API_KEY` |
| `nace` | `NACE_API_KEY` |
| `snowflake` | `SNOWFLAKE_PAT` + `SNOWFLAKE_ACCOUNT` |
| `litellm` | `LITELLM_API_KEY`；可选 `LITELLM_BASE_URL` 用于代理端点 |
| `bifrost` | `BIFROST_API_KEY`；可选 `BIFROST_BASE_URL` 用于网关端点 |
| `modal` | `MODAL_PROXY_TOKEN`；可选 `MODAL_BASE_URL` 用于专用端点 |
| `kilo` | `KILO_API_KEY` |
| `zai` | `ZAI_API_KEY` |
| `zenmux` | `ZENMUX_API_KEY` |
| `zhipu-coding-plan` | `ZHIPU_API_KEY` |
| `umans` | `UMANS_AI_CODING_PLAN_API_KEY` |
| `qianfan` | `QIANFAN_API_KEY` |
| `qwen-portal` | `QWEN_OAUTH_TOKEN`，其次 `QWEN_PORTAL_API_KEY` |
| `refuseless` | `REFUSELESS_API_KEY` |
| `synthetic` | `SYNTHETIC_API_KEY` |
| `minimax-code` | `MINIMAX_CODE_API_KEY` |
| `minimax-code-cn` | `MINIMAX_CODE_CN_API_KEY` |
| `minimax` | `MINIMAX_API_KEY` |
| `alibaba-coding-plan` | `ALIBABA_CODING_PLAN_API_KEY` |
| `sakana` | `SAKANA_API_KEY`，其次 `FUGU_API_KEY` |
| `sambanova` | `SAMBANOVA_API_KEY` |
| `scaleway` | `SCW_SECRET_KEY`，其次 `SCW_API_KEY` |
| `otari` | `OTARI_API_KEY` |
| `aimlapi` | `AIMLAPI_API_KEY` |
| `gitlab-duo`, `gitlab-duo-agent` | `GITLAB_TOKEN` |
| `opencode-zen`, `opencode-go` | `OPENCODE_API_KEY` |
| `cline-pass` | `CLINE_API_KEY` |
| `factory-droid` | 无，使用 `/login factory-droid` |
| `firepass` | `FIREPASS_API_KEY` |
| `wafer-serverless` | `WAFER_SERVERLESS_API_KEY` |
| `xiaomi` | `XIAOMI_API_KEY` |
| `xiaomi-token-plan-ams` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` |
| `xiaomi-token-plan-cn` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| `xiaomi-token-plan-sgp` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| `ollama-cloud` | `OLLAMA_CLOUD_API_KEY` |
| `ollama` | `OLLAMA_API_KEY`（可选；本地发现默认无须密钥） |
| `lm-studio` | `LM_STUDIO_API_KEY`（可选；默认无须密钥） |
| `llama.cpp` | `LLAMA_CPP_API_KEY`（服务器要求认证时使用） |
| `vllm` | `VLLM_API_KEY`（未认证的本地服务器可选） |
| `yolo-auto` | `YOLO_AUTO_API_KEY` |
| `charm-hyper` | `CHARM_HYPER_API_KEY`，其次 `HYPER_API_KEY` |
| `singularityapi-dev` | `SINGULARITYAPI_DEV_API_KEY` |
| `singularityapi-tech` | `SINGULARITYAPI_TECH_API_KEY` |

Vertex ADC 可用性接受项目别名 `GOOGLE_CLOUD_PROJECT`、`GCP_PROJECT` 或 `GCLOUD_PROJECT`，以及位置别名 `GOOGLE_VERTEX_LOCATION`、`GOOGLE_CLOUD_LOCATION` 或 `VERTEX_LOCATION`。

对于 `xai-oauth`，显式请求可接受 `XAI_API_KEY`，但它不会自动使 SuperGrok 模型变为可用或优先；自动可用性需要其专用的 `XAI_OAUTH_TOKEN` 或已存储/配置的认证。

`/login cloudflare-ai-gateway` 会提示输入网关 token、Cloudflare 账户 ID 和网关 ID，然后将三者一起存储。要使用环境变量，请设置上方列出的全部三个值。OMP 为每个模型选择 Anthropic、OpenAI 或 Workers AI 网关路由；不需要覆盖 `models.yml` 基础 URL。

`cloudflare-workers-ai` 将 Cloudflare 的 Clef 决策模型（`cloudflare-workers-ai/@cf/cloudflare/clef` 和 `cloudflare-workers-ai/@cf/cloudflare/clef-flash`）作为 `judge` 模型提供；将其中一个分配给 `judge` 角色即可使用。`/login cloudflare-workers-ai` 会提示输入具有 Workers AI Read 和 Edit 权限的 Cloudflare API token（在 `https://dash.cloudflare.com/profile/api-tokens` 创建）和账户 ID，然后将两者一起存储。要使用环境变量，请设置 `CLOUDFLARE_API_TOKEN`（或 `CLOUDFLARE_AUTH_TOKEN`）和 `CLOUDFLARE_ACCOUNT_ID`。

`liquid` 将 Liquid AI 的决策模型（`liquid/d1.2`、`liquid/d1.2-ultra`，以及已弃用的 `liquid/d1.1` 和 `liquid/d1-ultra`）作为 `judge` 模型提供；将其中一个分配给 `judge` 角色即可使用。`/login liquid` 会提示输入来自 `https://console.liquid.ai/`（Dashboard > API Keys）的 API 密钥；要使用环境变量，请设置 `LIQUID_API_KEY`。发送到 Liquid 的图像会调整大小，以适应其每个请求 10,000 个 32×32 像素图块的限制。

`nace` 将 Nace 的 Drex 决策模型（`nace/drex-max-v1.1`、`nace/drex-max-finance` 和纯文本的 `nace/drex-v2.0`）作为 `judge` 模型提供；将其中一个分配给 `judge` 角色即可使用。`/login nace` 会提示输入来自 `https://console.nace.ai/dashboard/api-keys` 的 API 密钥；要使用环境变量，请设置 `NACE_API_KEY`。Drex Max 模型每个请求最多接受 8 张 PNG、JPEG 或 WebP 图像。Drex 拒绝任何包含 base64 图像、音频、视频或 PDF 数据 URL 的文本，因此 OMP 会将状态、指令和条件中的每个此类 URL 替换为 `[image/png base64 data URL]` 这样的描述。

`/login snowflake` 会提示输入 Snowflake 账户标识符或账户 URL，然后通过浏览器使用 Snowflake 内置的本地应用 OAuth 集成登录，并将账户与 token 一起存储。要改用环境变量，请同时设置 `SNOWFLAKE_PAT` 和 `SNOWFLAKE_ACCOUNT`。

`charm-hyper` 是 Charm 为编程智能体提供的 OpenAI 兼容推理网关。在 `https://hyper.charm.land/` 签发或管理密钥；模型列表从模型提供方的公开 `/v1/models` 端点实时发现，`HYPER_API_KEY` 可作为 `CHARM_HYPER_API_KEY` 的回退别名。

`inception` 是 Inception 的原生 Mercury API。设置 `INCEPTION_API_KEY`，或使用来自 `https://platform.inceptionlabs.ai/dashboard/api-keys` 的密钥运行 `/login inception`，然后选择 `inception/mercury-3`。OMP 从 `/v1/models` 发现聊天模型，包括 Mercury 3、Mercury 2.5 和 Mercury 2；FIM/编辑模型和 Decisions 专用模型被排除。Mercury 3 支持 1,000,000 token 上下文，输出最多 131,072 token。思考等级为 `minimal`、`low`、`medium` 和 `high`；`minimal` 映射到 Inception 的 `instant`，`off` 请求该最低强度，而不是完全禁用推理。Mercury 不流式输出推理，因此不会显示思考文本，`high` 轮次可能在首次输出前沉默数分钟；OMP 等待 Mercury 3 的首个数据块最多 10 分钟（`providers.streamFirstEventTimeoutSeconds` 可覆盖）。虽然 `/v1/models` 将 Mercury 3 报价为 $0，OMP 会按公布的发布费率定价（每百万 token 输入 $0.10 / 输出 $0.35）；`/v1/models` 报告的费率优先。

SingularityAPI 在同一品牌下销售两款无关产品，因此 OMP 将它们建模为两个模型提供方：它们不共享密钥、计费模型或强度等级序列，任一主机都不接受另一方的密钥。

`singularityapi-dev` 是按量付费的通用推理网关（300+ 模型：DeepSeek、Kimi、GLM、前沿旗舰）。在 `https://app.singularityapi.dev` 创建密钥（或运行 `/login singularityapi-dev`），并设置 `SINGULARITYAPI_DEV_API_KEY`；名单、限制和费率从 `https://api.singularityapi.dev/v1/models` 实时发现。

`singularityapi-tech` 是预留 DeepSeek 通道网关。用量按预订的预留时段计费，而不是使用预付余额，因此没有活动时段的有效密钥会收到 403，直到你在 `https://app.singularityapi.tech` 预订时段。在那里创建 `sk-...` 密钥（或运行 `/login singularityapi-tech`），设置 `SINGULARITYAPI_TECH_API_KEY`，通道名单会从 `https://api.singularityapi.tech/v1/models` 实时发现。

对于 Mistral，将 `MISTRAL_API_KEY` 设为在 Mistral 控制台创建的密钥，或运行 `/login mistral`，以 Mistral Vibe CLI 的方式通过浏览器登录。浏览器登录会生成绑定到你的 Mistral 套餐的常规 API 密钥：其用量计入套餐的 Vibe Code 配额，而不是按量付费 API 余额。OMP 将其存储为普通 API 密钥；没有需要刷新的内容。

`anthropic`、`openai-codex`、`github-copilot`、`cursor`、`muse-code`、`ollama-cloud`、`qwen-portal`、`kimi-code-global`（Kimi Code，kimi.ai）、`kimi-code`（中国大陆 Kimi Code，kimi.com）、`xai-oauth`、`wafer-serverless`、`devin` 和 GitLab 模型提供方（`gitlab-duo`、`gitlab-duo-agent`）等基于 OAuth 的模型提供方，通常通过 `/login` 而不是环境变量访问；两个 Kimi Code 模型提供方还接受通过 `KIMI_API_KEY`（`kimi-code`）或 `KIMI_CODE_GLOBAL_API_KEY`（`kimi-code-global`）进行的 API 密钥认证。也有交互式 API 密钥登录：`/login baseten`、`/login coreweave`、`/login modal`、`/login sakana`、`/login singularityapi-dev` 和 `/login singularityapi-tech` 会提示输入仪表盘/API 密钥（`coreweave` 还要求 `COREWEAVE_PROJECT`，用于 `OpenAI-Project` 请求头）。此处未列出的搜索工具和配置变量参见[环境变量](./environment-variables.md)。

`/login kiro` 可使用 AWS IAM Identity Center、Builder ID、`ksk_…` API 密钥，或 Google、GitHub 账户登录。Google 和 GitHub 使用 Kiro 的设备登录，显示指向 `app.kiro.dev` 的链接和一次性代码，因此也适用于 SSH。详情参见 [Kiro](./kiro.md)。

### `.env` 发现与优先级 \{#env-discovery-and-precedence}

`omp` 在查找模型提供方之前，会主动将四个 `.env` 文件加载到进程环境。对于每个变量，第一个**非空**来源生效。有效优先级从高到低为：

1. 进程环境中已有的非空值。
2. `<project>/.env`
3. 活动智能体目录的 `.env`（默认：`~/.omp/agent/.env`）。
4. 活动配置根目录的 `.env`（默认：`~/.omp/.env`）。
5. `~/.env`

现有非空进程值不会被覆盖；空值可由后续文件填充。非空项目值优先于智能体、配置根目录和主目录文件。命名配置档案使用自己的配置根目录和智能体目录。Bun 也可能在此加载器之前预加载项目 dotenv 变体；已存在的值会被视为进程值。

项目本地 `.env` 是让一个仓库使用项目专用网关、密钥或本地端点的最简单方式：

```dotenv
# <project>/.env
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

`.env` 文件使用 Node 的 `parseEnv` 语法，包括注释、引号/多行值及 `export` 前缀。解析后：

- 键必须匹配 `[A-Za-z_][A-Za-z0-9_]*`，其他名称会被丢弃；
- 包含 NUL 字节的值会被丢弃；
- 以 `OMP_` 为前缀的键会镜像到匹配的 `PI_` 名称，覆盖同一文件的 `PI_` 条目。

## 内置本地引擎 \{#built-in-local-engines}

Ollama、llama.cpp 和 LM Studio 会自动发现，无需 `models.yml` 条目。每个引擎使用的基础 URL 都可以通过环境变量覆盖：

| 模型提供方 ID | 基础 URL（环境变量覆盖 → 默认值） | 说明 |
| --- | --- | --- |
| `ollama` | `OLLAMA_BASE_URL`，其次 `OLLAMA_HOST`（已规范化），否则 `http://127.0.0.1:11434` | 默认无须密钥。 |
| `llama.cpp` | `LLAMA_CPP_BASE_URL`，否则 `http://127.0.0.1:8080` | 未配置认证时无须密钥。 |
| `lm-studio` | `LM_STUDIO_BASE_URL`，否则 `http://127.0.0.1:1234/v1` | 默认无须密钥。 |

隐式 Ollama 和 llama.cpp 模型使用 `openai-responses`；LM Studio 使用 `openai-completions`。在 macOS arm64 上，`apple` 还会探测进程内 Apple Foundation Models 桥接（`local://apple-foundation-models`）。它在桥接报告模型可用时才提供 `apple/on-device`；不符合条件的设备、禁用的 Apple Intelligence 或不含桥接的构建都不会产生模型。其设备端上下文可能不足以容纳标准提示加项目指令，因此 OMP 不会自动选择它；使用 `--model apple/on-device` 或 `/model` 选择启用。

在以下情况下会**跳过**这些隐式引擎：

- `models.yml` 中已配置同 ID 的模型提供方（显式配置优先）；或
- 模型提供方 ID 出现在有效的 `disabledProviders` 列表中。

安装和运行这些引擎参见[本地模型](./local-models.md)。

## 禁用模型提供方 \{#disabling-model-providers}

使用 `disabledProviders` 设置，让模型提供方的模型无法选择：

```yaml
# ~/.omp/agent/config.yml or <project>/.omp/config.yml
disabledProviders:
   - anthropic
   - openai
   - google
   - groq
```

模型提供方 ID 精确匹配。禁用 `ollama`、`llama.cpp` 或 `lm-studio` 可停止对应引擎的本地发现。

`disabledProviders` 统一适用于：

- 捆绑目录模型提供方；
- 自定义 `models.yml` 模型提供方；
- 运行时发现的模型提供方模型；
- 扩展注册的模型提供方；
- 隐式本地引擎。

禁用模型提供方不会删除其已存储的凭据，从有效列表中移除其 ID 即可重新启用。

## 项目专用模型提供方控制 \{#project-specific-provider-control}

项目设置位于 `<project>/.omp/config.yml`。当某个仓库需要允许或隐藏与全局默认值不同的一组模型提供方时，使用这些设置：

```yaml
# <project>/.omp/config.yml
disabledProviders:
   - openai
   - openrouter
```

设置数组由优先级更高的层整体**替换**，而不是合并或追加。如果全局文件禁用三个模型提供方，项目文件禁用一个，项目只会看到项目列表：

```yaml
# ~/.omp/agent/config.yml
disabledProviders:
   - anthropic
   - openai
   - google

# <project>/.omp/config.yml
disabledProviders:
   - groq
```

项目内的有效结果：

```json
["groq"]
```

项目数组为从该项目启动的会话重新启用了 `anthropic`、`openai` 和 `google`。如果想让项目在全局集合基础上*增加*条目，请在项目文件中重复全局 ID。完整优先级链（包括 `--config` 叠加和运行时覆盖）参见[设置](./settings.md)。

## 按路径限定的 `disabledProviders` \{#path-scoped-disabledproviders}

`disabledProviders` 可以混合普通字符串条目（适用于所有位置）和按路径限定的条目（在当前工作目录匹配配置路径时生效）：

```yaml
disabledProviders:
   - ollama
   - path: ~/projects/sensitive
     providers:
        - anthropic
        - openai
   - paths:
        - ~/work/client-a
        - ~/work/client-b
     values:
        - openrouter
```

- 裸字符串条目始终生效。
- 当前工作目录**是**配置的路径或位于其**下方**时，带作用域的条目生效。`~` 展开为主目录。
- 接受的路径键：`path`、`paths`、`pathPrefix`、`pathPrefixes`。
- 接受的值键：`providers`、`values`、`items`。

对于上面的示例：

- `ollama` 在所有位置禁用。
- `anthropic` 和 `openai` 在 `~/projects/sensitive` 下额外禁用。
- `openrouter` 在 `~/work/client-a` 和 `~/work/client-b` 下额外禁用。

路径作用域在设置合并**之后**解析。由于优先级更高的层会替换整个数组，项目级 `disabledProviders` 数组会丢弃只存在于全局数组中的作用域条目。`enabledModels` 也支持这种形式。详情参见[设置](./settings.md)。

## 模型提供方 ID 与配置发现来源 ID \{#provider-ids-vs-discovery-provider-ids}

`disabledProviders` 使用**单一共享 ID 命名空间**控制两个不同的子系统：

- **模型提供方**：本页中的后端（`anthropic`、`openai`、`ollama`、自定义 `models.yml` ID 等）。禁用后，其模型将无法选择。
- **配置发现来源**：上下文文件、MCP 服务器、命令、技能、钩子、工具、提示和设置的来源。禁用后，该来源将停止提供能力项。

| 条目类型 | 示例 | 效果 |
| --- | --- | --- |
| 模型提供方 ID | `anthropic`、`openai`、`google`、`groq`、`openrouter`、`ollama`、`my-gateway` | 从可用列表中移除该模型提供方的模型。 |
| 配置发现来源 ID | `native`、`claude`、`codex`、`agents`、`opencode` | 阻止该配置发现来源提供能力项。 |

注意相关名称。Google Gemini **API** 模型使用模型提供方 ID `google`；`claude` 或 `codex` 等配置发现来源 ID 指配置来源，而不是模型提供方。只有打算禁用整个配置来源时才使用配置发现来源 ID。配置发现来源方面的说明参见[上下文文件](./context-files.md)。

## `models.yml` 中的自定义模型提供方 \{#custom-providers-in-modelsyml}

自定义模型提供方位于 `~/.omp/agent/models.yml` 的 `providers:` 下。在此定义的模型提供方 ID 遵循与内置模型提供方相同的选择、凭据解析和 `disabledProviders` 规则。

最小 OpenAI 兼容模型提供方：

```yaml
providers:
   my-openai-compatible:
      baseUrl: https://api.example.com/v1
      api: openai-completions
      apiKey: MY_OPENAI_COMPATIBLE_KEY # env-var-name or literal
      models:
         - id: fast-chat
           name: Fast Chat
           contextWindow: 128000
           maxTokens: 8192
```

### 智谱 BigModel 账户余额密钥 \{#zhipu-bigmodel-account-balance-keys}

`/login zai` 面向全球 Z.AI Coding Plan 端点，`/login zhipu-coding-plan` 面向国内智谱 Coding Plan 端点。这两个流程都不会配置位于 `https://open.bigmodel.cn/api/paas/v4` 的通用按量付费 BigModel 端点。

对于从标准 BigModel 账户余额签发的 API 密钥，使用自定义模型提供方：

```yaml
providers:
   bigmodel:
      baseUrl: https://open.bigmodel.cn/api/paas/v4
      api: openai-completions
      apiKey: BIGMODEL_API_KEY
      models:
         - id: glm-4.6
           name: GLM-4.6 (BigModel)
```

启动 `omp` 前，将 `BIGMODEL_API_KEY` 设为 `<id>.<secret>` 密钥，然后选择 `bigmodel/glm-4.6`。该密钥不使用 `sk-` 前缀。

无密钥本地模型提供方（无需凭据）：

```yaml
providers:
   local-proxy:
      baseUrl: http://127.0.0.1:4000/v1
      api: openai-completions
      auth: none
      models:
         - id: local-model
           name: Local Model
           contextWindow: 32768
           maxTokens: 4096
```

启用发现的模型提供方（运行时从端点获取模型）：

```yaml
providers:
   team-proxy:
      baseUrl: https://models.example.com/v1
      apiKey: TEAM_PROXY_API_KEY
      authHeader: true # send Authorization: Bearer <resolved key>
      disableStrictTools: true
      discovery:
         type: proxy
```

完整配置模式、所有允许的 `api` 值、发现 `type`、模型覆盖项和等价设置，请参阅[模型和模型提供方配置](./models.md)。

要禁用自定义模型提供方，请准确列出其 ID：

```yaml
disabledProviders:
   - my-openai-compatible
   - team-proxy
```

## 故障排查 \{#troubleshooting}

**无法选择某个模型提供方的模型。** 确认该模型提供方已配置凭据（通过 `/login <provider>`、导出的环境变量或 `models.yml` 中的 `apiKey`），且其 ID 不在生效的 `disabledProviders` 列表中。请记住这条规则：未禁用，**且**（无需密钥，**或**具有凭据）。本地引擎需要响应，才能在首次发现时填充模型列表；之后缓存的目录行可能仍然可见，但推理仍需要引擎。Apple 的可用性通过其进程内桥接检查。

**使用了错误的密钥（来自 `.env` 的过期密钥）。** 解析时依次优先使用运行时 `--api-key`、`models.yml` 配置密钥、已存储的 OAuth、通过 `/login` 保存的密钥、扩展配置回退值、环境变量或 `.env`，以及其他已存储的 API 密钥。非空的进程环境变量也优先于所有 `.env` 文件，非空的 `<project>/.env` 值优先于 `~/.env`。如果最终使用了非预期的密钥，请检查已导出的 shell 变量，并按优先顺序检查四个 `.env` 文件，清除不应生效的值。

**禁用了某个模型提供方，但它仍然出现。** `disabledProviders` 数组采用替换而非合并：项目的 `<project>/.omp/config.yml` 数组会完全覆盖全局数组。请核实当前目录的_生效_列表（按路径限定的条目只在配置的路径或其下级路径生效），并确认 ID 的拼写完全一致。使用 `omp config get disabledProviders` 查看合并后的值（参阅[设置](./settings.md)）。

**发现提供方名称对模型没有影响（或反之）。** ID 命名空间是共享的。`codex`、`claude`、`native` 和 `agents` 是配置发现来源 ID；Google 模型后端是 `google`。请确保禁用的是正确类型的提供方。

**自定义 `models.yml` 模型提供方未加载。** YAML 或配置模式错误会导致注册表跳过自定义文件。使用 `omp models` 验证文件（使用 `omp models find <substr>` 将范围限定到一个模型提供方）。带有自定义 `models` 的模型提供方需要 `baseUrl`、身份验证（`apiKey`，除非使用 `auth: none` 或 `auth: oauth`），以及模型提供方级别或每个模型上的 `api`。不包含模型的模型提供方也有效，前提是它至少定义一项受支持的覆盖项（`baseUrl`、`headers`、`apiKey`、`auth: none`、`compat`、`disableStrictTools`、`guardrailIdentifier`、`requestMetadata`、`remoteCompaction`、`modelOverrides` 或 `discovery`）。发现提供方可以省略 `models`，但需要模型提供方级别的 `api`，除非 `discovery.type` 为 `proxy`。显式的 `ollama`、`lm-studio` 或 `llama.cpp` 条目会有意替换该 ID 的内置发现机制。参阅[模型和模型提供方配置](./models.md)。
