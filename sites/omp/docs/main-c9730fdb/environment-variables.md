---
title: "环境变量（当前运行时参考）"
description: "Oh My Pi 官方仓库文档：环境变量（当前运行时参考）。"
---

# 环境变量（当前运行时参考） \{#environment-variables-current-runtime-reference}

本参考文档依据以下位置的当前代码路径编写：

- `packages/coding-agent/src/**`
- `packages/ai/src/**`（coding-agent 使用的模型提供方/身份验证解析）
- `packages/utils/src/**` 和 `packages/tui/src/**` 中直接影响 coding-agent 运行时的变量

本文仅记录当前生效的行为。

## 解析模型与优先级 \{#resolution-model-and-precedence}

大多数运行时查找使用 `@oh-my-pi/pi-utils` 中的 `$env`（`packages/utils/src/env.ts`）。

`$env` 加载顺序：

1. 现有进程环境（`Bun.env`）
2. 启动工作目录下的项目 `.env`，仅加载当前值为空/未设置的键
3. 当前智能体 `.env`（通常为 `~/.omp/agent/.env`），仅加载当前值为空/未设置的键
4. 当前配置根目录 `.env`（通常为 `~/.omp/.env`），仅加载当前值为空/未设置的键
5. 主目录 `.env`（`~/.env`），仅加载当前值为空/未设置的键

智能体、配置根目录和主目录 `.env` 文件中的 `OTEL_*` 条目不属于 `$env`：omp 的遥测会私下读取它们（见 [OpenTelemetry 导出](#11-opentelemetry-export)）。它们彼此之间的优先级，以及低于 shell 导出变量或项目 `.env` 的优先关系保持不变。

智能体/根目录位置遵循配置档案、`PI_CONFIG_DIR`，以及仅对默认配置档案生效的 `PI_CODING_AGENT_DIR`。整个 dotenv 文件使用 Bun 的 `node:util.parseEnv` 解析，包括带引号的多行值、转义换行符和行内注释。名称必须是 shell 标识符（`[A-Za-z_][A-Za-z0-9_]*`）；不安全的名称/值会被丢弃。在此解析器中，变量引用保持为字面量；只有 Bun 在此模块运行前自动加载启动目录 dotenv 时才会展开变量。子 shell 过滤使用相同的解析器，识别 `.env`、`.env.<NODE_ENV>`（默认为 `development`）、`.env.local` 和 `.env.<NODE_ENV>.local` 中的项目 dotenv 值。它会从 shell 子进程中移除项目 dotenv 凭据，同时保留启动器持有的变量；Linux 的原始 exec 环境提供权威的启动快照，其他平台则尽力按值匹配。

每个 `.env` 文件内还有一条规则：每个 `OMP_*` 键都会镜像到其 `PI_*` 别名，且镜像值会替换同一文件中的 `PI_*` 值。这种镜像适用于已解析的 dotenv 文件，不适用于从父进程继承的任意变量。

在设置定义上声明的变量（见[设置优先级](./settings.md#precedence)）优先于所有设置文件，但让位于 CLI 标志等运行时覆盖项。除非另有说明，否则按设置的类型解析。布尔变量（`PI_PY`、`PI_JS`、`PI_INTENT_TRACING`、`PI_AUTO_QA`、`HINDSIGHT_AUTO_RECALL` 等）遵循 `parseFlag`：空值会被忽略，因此采用设置值；`1`、`y`、`true`、`yes` 和 `on`（全小写或全大写）表示 true；其他任何非空值表示 false。

---

## 1) 模型/模型提供方身份验证 \{#1-modelprovider-authentication}

除非另有说明，否则通过 `getEnvApiKey()`（`packages/ai/src/stream.ts`）使用这些变量。

普通模型提供方凭据名称来自 `packages/catalog/src/compat/rules/providers/*.kdl` 和 `auth/*.kdl` 中的 `env` 条目；`packages/ai/src/registry/hooks/env.ts` 提供经过计算的 Foundry、Bedrock 和 Vertex 解析器。

### 核心模型提供方凭据 \{#core-provider-credentials}

| 变量 | 用途 | 何时必需 | 说明 / 优先级 |
| --- | --- | --- | --- |
| `ANTHROPIC_OAUTH_TOKEN` | Anthropic API 身份验证 | 使用 OAuth 令牌验证 Anthropic 身份时 | 模型提供方身份验证解析时优先于 `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_KEY` | Anthropic API 身份验证 | 不使用 OAuth 令牌访问 Anthropic 时 | `ANTHROPIC_OAUTH_TOKEN` 之后的回退项 |
| `ANTHROPIC_FOUNDRY_API_KEY` | 通过 Azure Foundry / 企业网关访问 Anthropic | 启用 `CLAUDE_CODE_USE_FOUNDRY` 时 | 启用 Foundry 模式时，优先于 `ANTHROPIC_OAUTH_TOKEN` 和 `ANTHROPIC_API_KEY` |
| `OPENAI_API_KEY` | OpenAI 身份验证 | 使用 OpenAI 系列模型提供方且未显式传入 apiKey 参数时 | 由 OpenAI Completions/Responses 模型提供方使用 |
| `OPENAI_CODEX_OAUTH_TOKEN` | OpenAI Codex 身份验证 | 使用 `openai-codex` 模型提供方时 | 由环境提供的 Codex OAuth 令牌 |
| `GEMINI_API_KEY` | Google Gemini 身份验证 | 使用 `google` 模型提供方的模型时 | Gemini 模型提供方映射的首选密钥；也可通过交互式 API 密钥登录（`/login google`）配置 |
| `GROQ_API_KEY` | Groq 身份验证 | 使用 Groq 模型时 |  |
| `CEREBRAS_API_KEY` | Cerebras 身份验证 | 使用 Cerebras 模型时 |  |
| `FIREWORKS_API_KEY` | Fireworks 身份验证 | 使用 Fireworks 模型时 |  |
| `FIREPASS_API_KEY` | Fire Pass 身份验证 | 使用 Fire Pass 模型时 |  |
| `TOGETHER_API_KEY` | Together 身份验证 | 使用 `together` 模型提供方时 |  |
| `MODULAR_API_KEY` | Modular 身份验证 | 使用 `modular` 模型提供方时 | 也可通过交互式 API 密钥登录（`/login modular`）配置 |
| `ABLITERATION_API_KEY` / `ABLIT_KEY` | Abliteration 身份验证 | 使用 `abliteration` 模型提供方时 | `ABLITERATION_API_KEY` 优先 |
| `REFUSELESS_API_KEY` | Refuseless 身份验证 | 使用 `refuseless` 模型提供方时 |  |
| `AIMLAPI_API_KEY` | AIML API 身份验证 | 使用 `aimlapi` 模型提供方时 | 位于 `https://api.aimlapi.com/v1` 的 OpenAI 兼容 AIML API 端点 |
| `HUGGINGFACE_HUB_TOKEN` | Hugging Face 身份验证 | 使用 `huggingface` 模型提供方时 | 首选的 Hugging Face 令牌环境变量 |
| `HF_TOKEN` | Hugging Face 身份验证 | 使用 `huggingface` 模型提供方时 | 未设置 `HUGGINGFACE_HUB_TOKEN` 时的回退项 |
| `SYNTHETIC_API_KEY` | Synthetic 身份验证 | 使用 Synthetic 模型时 |  |
| `NVIDIA_API_KEY` | NVIDIA 身份验证 | 使用 `nvidia` 模型提供方时 |  |
| `NANO_GPT_API_KEY` | NanoGPT 身份验证 | 使用 `nanogpt` 模型提供方时 |  |
| `NOVITA_API_KEY` | Novita 身份验证 | 使用 `novita` 模型提供方时 |  |
| `VENICE_API_KEY` | Venice 身份验证 | 使用 `venice` 模型提供方时 |  |
| `LITELLM_API_KEY` | LiteLLM 身份验证 | 使用 `litellm` 模型提供方时 | OpenAI 兼容的 LiteLLM 代理密钥 |
| `BIFROST_API_KEY` | Bifrost 身份验证 | 使用 `bifrost` 模型提供方时 | Bifrost 虚拟密钥（`sk-bf-...`）；未启用治理的网关接受任意值 |
| `MODAL_PROXY_TOKEN` | Modal 身份验证 | 使用 `modal` 模型提供方时 | 组合的 `wk-<id>.ws-<secret>` 代理身份验证令牌；也可通过 `/login modal` 配置 |
| `LM_STUDIO_API_KEY` | LM Studio 身份验证（可选） | 使用 `lm-studio` 模型提供方且主机需要身份验证时 | 本地 LM Studio 通常无需身份验证；需要密钥时，任意非空令牌均可 |
| `OLLAMA_API_KEY` | Ollama 身份验证（可选） | 使用 `ollama` 模型提供方且主机需要身份验证时 | 本地 Ollama 通常无需身份验证；需要密钥时，任意非空令牌均可 |
| `LLAMA_CPP_API_KEY` | llama.cpp 身份验证（可选） | 使用 `llama.cpp` 模型提供方且主机需要身份验证时 | 本地 llama.cpp 通常无需身份验证；配置了密钥时，任意非空令牌均可 |
| `XIAOMI_API_KEY` | Xiaomi MiMo 身份验证 | 使用 `xiaomi` 模型提供方时 |  |
| `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | Xiaomi MiMo Token Plan 身份验证（AMS） | 使用 `xiaomi-token-plan-ams` 模型提供方时 |  |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | Xiaomi MiMo Token Plan 身份验证（CN） | 使用 `xiaomi-token-plan-cn` 模型提供方时 |  |
| `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | Xiaomi MiMo Token Plan 身份验证（SGP） | 使用 `xiaomi-token-plan-sgp` 模型提供方时 |  |
| `KIRO_API_KEY` | Kiro API 密钥身份验证 | 使用 `kiro` 且不通过 `/login kiro` 登录时 | 必须是 `ksk_…` 密钥；已存储的 `/login kiro` 凭据优先 |
| `MOONSHOT_API_KEY` | Moonshot 身份验证 | 使用 `moonshot` 模型提供方时 | 不接受 `KIMI_API_KEY`；它用于验证中国大陆的 `kimi-code` 模型提供方身份 |
| `STEPFUN_API_KEY` | StepFun 身份验证 | 使用 `stepfun` 模型提供方时 | 密钥受区域限制：`.ai` 密钥适用于 `api.stepfun.ai`，`.com` 密钥适用于 `api.stepfun.com` |
| `HELMCODE_API_KEY` | Helmcode 身份验证 | 使用 `helmcode` 模型提供方时 |  |
| `XAI_API_KEY` | xAI 身份验证 | 使用 xAI 模型，或作为 `xai-oauth` 的回退项时 |  |
| `XAI_OAUTH_TOKEN` | xAI OAuth/SuperGrok 身份验证 | 使用 `xai-oauth` 模型提供方时 | 对于 `xai-oauth`，优先于 `XAI_API_KEY` |
| `OPENROUTER_API_KEY` | OpenRouter 身份验证 | 使用 OpenRouter 模型时 | 当图像角色选择 OpenRouter 时，图像工具也会使用它 |
| `MISTRAL_API_KEY` | Mistral 身份验证 | 使用 Mistral 模型时 |  |
| `ZAI_API_KEY` | z.ai 身份验证 | 使用 z.ai 模型时 | z.ai 网页搜索提供方也会使用它 |
| `ZHIPU_API_KEY` | Zhipu Coding Plan 身份验证 | 使用 `zhipu-coding-plan` 模型提供方时 |  |
| `UMANS_AI_CODING_PLAN_API_KEY` | Umans AI Coding Plan 身份验证 | 使用 `umans` 模型提供方时 |  |
| `MINIMAX_API_KEY` | MiniMax 身份验证 | 使用 `minimax` 模型提供方时 |  |
| `MINIMAX_CODE_API_KEY` | MiniMax Code 身份验证 | 使用 `minimax-code` 模型提供方时 |  |
| `MINIMAX_CODE_CN_API_KEY` | MiniMax Code CN 身份验证 | 使用 `minimax-code-cn` 模型提供方时 |  |
| `OPENCODE_API_KEY` | OpenCode 身份验证 | 使用 `opencode-go` / `opencode-zen` 模型时 |  |
| `QIANFAN_API_KEY` | Qianfan 身份验证 | 使用 `qianfan` 模型提供方时 |  |
| `QWEN_OAUTH_TOKEN` | Qwen Portal 身份验证 | 使用 OAuth 令牌访问 `qwen-portal` 时 | 优先于 `QWEN_PORTAL_API_KEY` |
| `QWEN_PORTAL_API_KEY` | Qwen Portal 身份验证 | 使用 API 密钥访问 `qwen-portal` 时 | `QWEN_OAUTH_TOKEN` 之后的回退项 |
| `ZENMUX_API_KEY` | ZenMux 身份验证 | 使用 `zenmux` 模型提供方时 | 用于 ZenMux OpenAI 和 Anthropic 兼容路由 |
| `COMMAND_CODE_API_KEY` | Command Code 身份验证 | 使用 `commandcode` 模型提供方时 | 接受 `COMMANDCODE_API_KEY` 作为旧版别名 |
| `CHARM_HYPER_API_KEY` | Charm Hyper 身份验证 | 使用 `charm-hyper` 模型提供方时 | 接受 `HYPER_API_KEY` 作为回退别名 |
| `VLLM_API_KEY` | vLLM 身份验证/启用发现 | 使用 `vllm` 模型提供方（本地 OpenAI 兼容服务器）时 | 对于无需身份验证的本地服务器，任意非空值均可 |
| `CURSOR_ACCESS_TOKEN` | Cursor 模型提供方身份验证 | 使用 Cursor 模型提供方时 | 接受 `CURSOR_API_KEY` 作为别名 |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway 身份验证 | 使用 `vercel-ai-gateway` 模型提供方时 | 接受 `VERCEL_AI_GATEWAY_API_KEY` 作为别名 |
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | Cloudflare AI Gateway 身份验证 | 使用 `cloudflare-ai-gateway` 模型提供方时 | 具有 AI Gateway Run 权限的网关令牌；`/login` 会将它与路由 ID 一起存储 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI 身份验证 | 使用 `cloudflare-workers-ai` 模型提供方（Clef 评判器）时 | 具有 Workers AI Read 和 Edit 权限的 API 令牌；接受 `CLOUDFLARE_AUTH_TOKEN` 作为回退项 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare AI Gateway / Workers AI 账户路由 | 使用环境提供的网关或 Workers AI 令牌时 | 如果账户 ID 已由 `/login` 存储，则不需要 |
| `CLOUDFLARE_GATEWAY_ID` | Cloudflare AI Gateway 选择 | 使用环境提供的网关令牌时 | 网关标识串，通常为 `default`；如果已由 `/login` 存储，则不需要 |
| `SNOWFLAKE_PAT` | Snowflake Cortex 身份验证 | 使用 `snowflake` 模型提供方且未通过 `/login` 登录时 | 编程访问令牌；建议使用短期且受角色限制的令牌 |
| `SNOWFLAKE_ACCOUNT` | Snowflake Cortex 账户路由 | 使用 `SNOWFLAKE_PAT` 时 | 账户标识符（`orgname-accountname`）或账户 URL；通过 `/login` 登录后不需要 |
| `ALIBABA_CODING_PLAN_API_KEY` | Alibaba Coding Plan 身份验证 | 使用 `alibaba-coding-plan` 模型提供方时 |  |
| `ALIBABA_TOKEN_PLAN_API_KEY` | QwenCloud Token Plan 身份验证 | 使用 `alibaba-token-plan` 模型提供方时 | 首选的模型提供方专用名称 |
| `BAILIAN_TOKEN_PLAN_API_KEY` | QwenCloud Token Plan 身份验证 | 使用 `alibaba-token-plan` 模型提供方时 | 兼容 Qwen Code 的 Token Plan 预设 |
| `CHUTES_API_KEY` | Chutes 身份验证 | 使用 `chutes` 模型提供方时 |  |
| `CORAL_API_KEY` | CoralBricks 身份验证（别名：`CORALBRICKS_API_KEY`） | 使用 `coralbricks` 模型提供方时 |  |
| `DEEPINFRA_API_KEY` | DeepInfra 身份验证 | 使用 `deepinfra` 模型提供方时 |  |
| `DEEPSEEK_API_KEY` | DeepSeek 身份验证 | 使用 DeepSeek 模型时 |  |
| `SILICONFLOW_API_KEY` | SiliconFlow 身份验证 | 使用 `siliconflow` 模型提供方时 |  |
| `SILICONFLOW_CN_API_KEY` | SiliconFlow（中国）身份验证 | 使用 `siliconflow-cn` 模型提供方时 |  |
| `KILO_API_KEY` | Kilo 身份验证 | 使用 Kilo 模型时 |  |
| `OLLAMA_CLOUD_API_KEY` | Ollama Cloud 身份验证 | 使用 `ollama-cloud` 模型提供方时 |  |
| `CLINE_API_KEY` | ClinePass 订阅 + 免费层身份验证 | 使用 `cline-pass` 模型提供方时 | 官方 Cline API 密钥变量 |
| `YOLO_AUTO_API_KEY` | Yolo-Auto 身份验证 | 使用 `yolo-auto` 模型提供方时 | 固定费率的 Qwen 模型；通过 `https://yolo-auto.com/v1/models` 验证 |
| `WAFER_SERVERLESS_API_KEY` | Wafer Serverless 身份验证 | 使用 `wafer-serverless` 模型提供方时 | 按量付费的 Wafer SKU；通过 `https://pass.wafer.ai/v1/models` 验证 |
| `GITLAB_TOKEN` | GitLab Duo 身份验证 | 使用 `gitlab-duo` / `gitlab-duo-agent` 模型提供方时 | 两个 GitLab 模型提供方读取同一个令牌 |
| `BASETEN_API_KEY` | Baseten 身份验证 | 使用 `baseten` 模型提供方时 | 也可通过交互式 API 密钥登录（`/login baseten`，密钥来自 Baseten 控制面板）配置 |
| `COREWEAVE_API_KEY` / `WANDB_API_KEY` | CoreWeave Serverless Inference 身份验证 | 使用 `coreweave` 模型提供方时 | 两个变量均可（W&B 为回退项）。`COREWEAVE_PROJECT`（回退项为 `WANDB_INFERENCE_PROJECT`）提供必需的 `OpenAI-Project` 请求头 |
| `SAKANA_API_KEY` / `FUGU_API_KEY` | Sakana AI 身份验证 | 使用 `sakana` 模型提供方时 | 两个变量均可；`SAKANA_BASE_URL` / `FUGU_BASE_URL` 覆盖请求基 URL |
| `SAMBANOVA_API_KEY` | SambaNova Cloud 身份验证 | 使用 `sambanova` 模型提供方时 | 也可通过交互式 API 密钥登录（`/login sambanova`）配置 |
| `DEVIN_API_KEY` | Devin 身份验证 | 使用 `devin` 模型提供方时 | 也可通过交互式登录（`/login devin`，OAuth）使用 |
| `ARKANECLOUD_API_KEY` | ArkaneCloud 身份验证 | 使用 `arkanecloud` 模型提供方时 | 也可通过交互式 API 密钥登录（`/login arkanecloud`）配置；每个密钥看到各自的模型和价格 |
| `AIAND_API_KEY` | ai& 身份验证 | 使用 `aiand` 模型提供方时 |  |
| `GMI_API_KEY` | GMI Cloud 身份验证 | 使用 `gmi-cloud` 模型提供方时 |  |
| `MODEL_API_KEY` / `META_API_KEY` | Meta Model API 身份验证 | 使用 `meta` 模型提供方时 | 两个变量均可 |
| `INCEPTION_API_KEY` | Inception Mercury API 身份验证 | 使用 `inception` 模型提供方时 | 也可通过 `/login inception` 使用，它会用一次单令牌 Mercury 3 请求验证密钥（`/v1/models` 是公开的） |
| `SINGULARITYAPI_DEV_API_KEY` | SingularityAPI 通用网关身份验证 | 使用 `singularityapi-dev` 模型提供方时 | 按量付费，300 多个模型；通过 `https://api.singularityapi.dev/v1/models` 验证 |
| `SINGULARITYAPI_TECH_API_KEY` | SingularityAPI 预留通道身份验证 | 使用 `singularityapi-tech` 模型提供方时 | 预留槽位的 DeepSeek 通道；通过 `https://api.singularityapi.tech/v1/models` 验证 |
| `SCW_SECRET_KEY` | Scaleway Generative APIs 身份验证 | 使用 `scaleway` 模型提供方时 | 无服务器开放权重聊天模型；通过 `https://api.scaleway.ai/v1/models` 验证；接受 `SCW_API_KEY` 作为旧版别名 |
| `OTARI_API_KEY` | Otari 网关身份验证 | 使用 `otari` 模型提供方时 | 工作区密钥（普通密钥，不含区域）；区域（US、EU 或自定义）改由 `/login otari` 询问 |
| `OTARI_BASE_URL` | Otari API 根地址覆盖 | 使用 `otari` 模型提供方时 | 包含前缀的 API 根地址（EU 为 `https://eu.api.otari.ai/api/v1`，自托管为 `https://host.example.com/api/v1`）；跳过 `/login otari` 的区域询问，并为未存储区域的凭据重定向发现和请求 |

### GitHub/Copilot 令牌 \{#githubcopilot-tokens}

| 变量 | 用途 | 说明 |
| --- | --- | --- |
| `COPILOT_GITHUB_TOKEN` | GitHub Copilot 模型提供方身份验证 | 此处不使用通用 GitHub 令牌 |
| `COPILOT_INTEGRATION_ID` | GitHub Copilot 客户端身份覆盖 | 默认为 `copilot-chat`（聊天界面）。被拒绝的请求会以 Copilot CLI 身份重试一次；设置此变量可固定客户端 ID 并跳过重试（[#11372](https://github.com/can1357/oh-my-pi/issues/11372)） |
| `GH_TOKEN` | 网页抓取器中的 GitHub API 身份验证 | 网页抓取器在 `GITHUB_TOKEN` 之后的回退项 |
| `GITHUB_TOKEN` | 网页抓取器中的 GitHub API 身份验证 | 网页抓取器先检查此变量，再检查 `GH_TOKEN` |

### 身份验证代理 / 身份验证网关（远程凭据库） \{#auth-broker--auth-gateway-remote-credential-vault}

启用代理后，会绕过本地 SQLite 凭据存储，所有 OAuth 刷新令牌 / 访问令牌都保存在代理主机上。完整协议、CLI 接口和 5 分钟/15 秒用量缓存分层见 [`auth-broker-gateway.md`](./auth-broker-gateway.md)。

| 变量 | 用途 | 何时必需 | 说明 / 优先级 |
| --- | --- | --- | --- |
| `OMP_AUTH_BROKER_URL` | 远程身份验证代理的基 URL（如 `https://broker.tailnet:8765`）；选择代理模式 | 通过代理解析凭据时；`omp auth-gateway serve` 也需要它（网关本身就是代理客户端） | 优先于 `config.yml` 中的 `auth.broker.url`。设置后若没有可解析的令牌，`resolveAuthBrokerConfig()` 会直接报错，而不是回退到本地 SQLite。 |
| `OMP_AUTH_BROKER_TOKEN` | 发送到除 `/v1/healthz` 外每个代理端点的 Bearer 令牌 | 已设置 `OMP_AUTH_BROKER_URL`，且 `auth.broker.token` 或 `<config-dir>/auth-broker.token` 均未提供令牌时 | 解析顺序：此环境变量 → `auth.broker.token`（支持 `$ENV_NAME` 间接引用）→ `<config-dir>/auth-broker.token`（权限模式为 `0600`）。`<config-dir>` 为 `~/.omp/`（遵循 `PI_CONFIG_DIR`）。 |
| `OMP_AUTH_BROKER_SNAPSHOT_TTL_MS` | 加密的本地代理快照缓存的新鲜度窗口 | 代理模式下可选 | 默认为 `3600000`（1 小时）。新鲜度基于代理的 `snapshot.generatedAt`；`0` 禁用缓存读写，强制每次启动都使用旧的阻塞式获取。 |
| `OMP_AUTH_BROKER_SNAPSHOT_CACHE` | 加密的本地代理快照缓存的路径 | 代理模式下可选 | 默认为 `~/.omp/cache/auth-broker-snapshot.enc`（或对应的 XDG 缓存位置）。适合测试、临时主机或迁移该 `0600` 缓存文件。 |
| `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE` | 代理客户端在进程作用域内的代理凭据可见性（OAuth 账户和 API 密钥） | 代理模式下可选 | JSON 对象路径，对象将模型提供方 ID 映射到规则：`identityKey` 数组（`[]` 隐藏该模型提供方的 OAuth 账户；API 密钥仍可见）、`true`/`false`（全部/无），或 `{ "accounts"?: [...], "apiKeys"?: boolean }`。没有条目的模型提供方遵循 `"*"` 规则，否则不受限制；`"*": false` 会使文件成为允许列表。在启动时解析一次，输入无效时按拒绝方式处理。这不是代理授权：直接客户端仍持有代理令牌。在 `omp auth-gateway serve` 内，它限制网关客户端可访问的范围；见 [auth-broker-gateway.md](./auth-broker-gateway.md#client-account-pools)。 |

网关没有专用环境变量，它继承 `OMP_AUTH_BROKER_*`。它自己的入站 Bearer 令牌保存在 `<config-dir>/auth-gateway.token`，通过 `omp auth-gateway token` 管理。

---

## 2) 模型提供方专用运行时配置 \{#2-provider-specific-runtime-configuration}

### 出站代理路由 \{#outbound-proxy-routing}

模型提供方的 HTTP 获取在应用 `NO_PROXY` / `no_proxy` 后，按以下顺序解析代理：

1. `PI_PROXY_<PROVIDER>`（模型提供方 ID 转为大写，非字母数字字符替换为 `_`，例如 `PI_PROXY_GITHUB_COPILOT`）
2. `PI_PROXY`
3. HTTPS 和 WebSocket 目标使用 `HTTPS_PROXY` / `https_proxy`，HTTP 目标使用 `HTTP_PROXY` / `http_proxy`
4. `ALL_PROXY` / `all_proxy`

模型提供方代理查找结果在进程生命周期内缓存。Localhost 目标绕过模型提供方 fetch 包装器。

两种 `PI_PROXY` 形式的作用域不同：

- `PI_PROXY` 在 CLI 启动时安装到进程级的 `fetch` 上，因此也
  覆盖模型提供方 fetch 包装器以外发起的请求：OAuth 令牌刷新
  和登录、用量探测、模型发现。若无此设置，即使流本身
  已经通过代理，受区域限制的令牌端点在刷新时
  仍会返回 `403 Request not allowed`。
- `PI_PROXY_<PROVIDER>` 仅应用于该模型提供方的请求，并对这些请求覆盖
  `PI_PROXY`。它不覆盖上述不属于模型提供方作用域的调用；如果
  模型提供方限制了你所在的区域，还需设置 `PI_PROXY`。

回环、链路本地、私有网段（`10/8`、`172.16/12`、`192.168/16`）以及
`NO_PROXY` 目标始终绕过代理，因此本地模型服务器和 MCP 主机保持直连。

### 请求体压缩 \{#request-body-compression}

对于至少 1 KiB 的请求体，发送至模型提供方自身且能解码的端点时会进行压缩，这些端点由 `request-encodings` / `endpoint-hosts` 目录规则声明：官方 Anthropic API（gzip）、ChatGPT Codex 后端（zstd），以及位于 `api[.individual|.business|.enterprise].githubcopilot.com` 的 GitHub Copilot API（zstd，回退到 gzip）。代理、中继、models.yml 网关（即使位于内置模型提供方 ID 下）和其他所有主机收到的都是未压缩的 JSON。如果某个端点或其前方检查 TLS 的代理拒绝某种编码，且未压缩的重发成功，则在进程剩余生命周期内，该主机都不会再使用这种编码。

| 变量 | 行为 |
| --- | --- |
| `PI_REQUEST_COMPRESSION` | `0`/`false`/`no`/`off` 使所有请求体均不压缩发送（默认启用压缩） |

### Anthropic API 版本 \{#anthropic-api-version}

| 变量 | 行为 |
| --- | --- |
| `PI_ANTHROPIC_API_VERSION` | 发送给官方 Anthropic API（`api.anthropic.com`）的 `anthropic-version`：`2023-06-01`（默认）或 `2026-10-21`。在 `2026-10-21` 下，会省略 `temperature`/`top_p`/`top_k`，因为该版本拒绝这些字段。其他主机（Bedrock、Foundry、Copilot、网关、Anthropic 兼容模型提供方）继续使用 `2023-06-01`；未知值会记录警告并使用 `2023-06-01` |

### Anthropic 消息线程 \{#anthropic-message-threads}

| 变量 | 行为 |
| --- | --- |
| `PI_ANTHROPIC_MESSAGE_THREADS` | 覆盖消息线程默认值（`message-threads-2026-08-12`：后续轮次只发送新消息）：Claude 4.5+ 访问 `api.anthropic.com` 时默认开启，其他情况关闭。`0` 将其关闭；`1` 还会在其他端点（Foundry、网关）上启用 |

### Anthropic Foundry Gateway（Azure / 企业代理） \{#anthropic-foundry-gateway-azure--enterprise-proxy}

启用 `CLAUDE_CODE_USE_FOUNDRY` 时，Anthropic 请求切换到 Foundry 模式：

- 基 URL 从 `FOUNDRY_BASE_URL` 解析（未设置时，仍回退到模型/默认基 URL）。
- 模型提供方 `anthropic` 的 API 密钥解析变为：
  `ANTHROPIC_FOUNDRY_API_KEY` → `ANTHROPIC_OAUTH_TOKEN` → `ANTHROPIC_API_KEY`。
- `ANTHROPIC_CUSTOM_HEADERS` 被解析为以逗号/换行符分隔的 `key: value`
  键值对，并合并到请求头中。当
  `ANTHROPIC_BASE_URL` 指向非 Anthropic 主机（如企业 API
  网关）时也会转发它们，因此需要专有身份验证头的企业网关
  无需启用 Foundry 模式也能工作。
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`（与 Claude Code 约定相同）使
  模型提供方 `anthropic` 的请求省略预发布请求体字段及其
  `anthropic-beta` 令牌：`context_management`、测试版工具字段
  （`strict`、`defer_loading`、`eager_input_streaming`）和对话中途的
  工具变更、`output_config.format` 和 `output_config.task_budget`，以及
  `thinking.block_binding` 和 Anthropic 服务端上下文压缩。推理力度、自适应
  思考、交错思考和扩展上下文保留。与 Claude
  Code 不同，调用方提供的测试版列表和
  `anthropic-beta` 请求头中匹配的测试版也会被移除。当 `ANTHROPIC_BASE_URL` 网关
  拒绝它们时可使用此设置；无论是否启用 Foundry 模式均有效。哪些模型提供方遵循
  它由兼容性轴 `honors-claude-code-beta-kill-switch` 决定
  （在 `models.yml` 中为 `compat.honorsClaudeCodeBetaKillSwitch`）。
- TLS 客户端/服务端材料可通过环境变量值注入：
  `NODE_EXTRA_CA_CERTS`、`CLAUDE_CODE_CLIENT_CERT`、`CLAUDE_CODE_CLIENT_KEY`。
  每项都接受以下任一形式：
   - 指向 PEM 内容的文件系统路径，或
   - 内联 PEM（包括转义的 `\n` 序列）。

   `NODE_EXTRA_CA_CERTS` 对模型提供方获取请求（OpenAI 兼容、
   Codex、Ollama、Azure Responses、Google、Anthropic）和远程 MCP HTTP/SSE
   传输生效。Bun 的 `fetch` 不会原生使用此环境变量，因此
   证书包会与系统根证书存储一起合并到 `RequestInit.tls.ca`，
   包括在进程启动后从智能体 `.env` 加载的情况。
   `CLAUDE_CODE_*` mTLS 材料仍仅用于 Anthropic Foundry。

| 变量 | 值类型 | 行为 |
| --- | --- | --- |
| `CLAUDE_CODE_USE_FOUNDRY` | 类布尔字符串（`1`、`true`、`yes`、`on`） | 为 Anthropic 模型提供方启用 Foundry 模式 |
| `FOUNDRY_BASE_URL` | URL 字符串 | Foundry 模式下的 Anthropic 端点基 URL |
| `ANTHROPIC_FOUNDRY_API_KEY` | 令牌字符串 | 用于 `Authorization: Bearer <token>` |
| `ANTHROPIC_CUSTOM_HEADERS` | 请求头列表字符串 | 附加请求头；格式为 `header-a: value, header-b: value` 或以换行符分隔。只要 `ANTHROPIC_BASE_URL` 非 Anthropic，即使在 Foundry 模式之外也会转发。 |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | 类布尔字符串（`1`、`true`、`yes`、`on`） | 对模型提供方 `anthropic` 省略预发布字段（`context_management`、测试版工具字段、任务预算、结构化输出格式、`thinking.block_binding`、服务端上下文压缩）及其测试版请求头 |
| `NODE_EXTRA_CA_CERTS` | PEM 路径或内联 PEM | 用于服务器证书验证的额外 CA 链 |
| `CLAUDE_CODE_CLIENT_CERT` | PEM 路径或内联 PEM | mTLS 客户端证书 |
| `CLAUDE_CODE_CLIENT_KEY` | PEM 路径或内联 PEM | mTLS 客户端私钥（必须与证书配对） |

### Amazon Bedrock \{#amazon-bedrock}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `AWS_REGION` | 首选区域来源 |
| `AWS_DEFAULT_REGION` | 未设置 `AWS_REGION` 时的回退项 |
| `AWS_PROFILE` | 启用具名配置档案身份验证路径 |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | 启用 IAM 密钥身份验证路径 |
| `AWS_BEARER_TOKEN_BEDROCK` | 优先级最高的 Bearer 令牌身份验证路径；设置后跳过 AWS 配置档案/凭据链查找 |
| `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` / `AWS_CONTAINER_CREDENTIALS_FULL_URI` | 在模型提供方检测中将 Bedrock 标记为可用（凭据解析本身涵盖环境密钥、配置档案/SSO/`credential_process`，然后是 IMDSv2） |
| `AWS_WEB_IDENTITY_TOKEN_FILE` + `AWS_ROLE_ARN` | 在模型提供方检测中将 Bedrock 标记为可用（与上面的 ECS 变量有相同的注意事项） |
| `AWS_BEDROCK_SKIP_AUTH` | 布尔标志，为 Converse 注入虚拟凭据（代理/无需身份验证场景）；空值按 false 处理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 通过 Bun 原生 fetch 代理支持生效（此模型提供方不再附带 AWS SDK / proxy-agent 传输） |
| `NO_PROXY` | 从 Bun 原生代理路由中排除匹配的主机 |

模型提供方代码中的区域回退顺序：`options.region` → `AWS_REGION` → `AWS_DEFAULT_REGION` → `us-east-1`。

`bedrock-mantle` 模型提供方也通过 `packages/ai/src/registry/aws.ts` 检测 Bearer 令牌和 AWS 凭据来源；`AWS_BEDROCK_SKIP_AUTH` 仅适用于 Converse 模型提供方的解析器，不适用于 Mantle。

原生 Bedrock 解析器实现的额外凭据链控制项：

| 变量 | 行为 |
| --- | --- |
| `AWS_SESSION_TOKEN` | 与 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 配对的会话令牌 |
| `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` | 覆盖共享凭据/配置 INI 路径 |
| `AWS_SDK_LOAD_CONFIG` | `1`/`true` 在没有显式配置档案时启用共享配置加载 |
| `AWS_ROLE_SESSION_NAME` | Web 身份角色代入的会话名称 |
| `AWS_CONTAINER_AUTHORIZATION_TOKEN`, `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE` | ECS 容器凭据的授权 |
| `AWS_EC2_METADATA_DISABLED` | `true` 禁用 IMDSv2 |
| `AWS_EC2_METADATA_SERVICE_ENDPOINT`, `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | 覆盖 IMDS 端点 / 选择 IPv6 回退项 |

### Azure OpenAI Responses \{#azure-openai-responses}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `AZURE_OPENAI_API_KEY` | 必需，除非已通过选项传入 API 密钥 |
| `AZURE_OPENAI_API_VERSION` | 默认为 `v1` |
| `AZURE_OPENAI_BASE_URL` | 直接覆盖基 URL |
| `AZURE_OPENAI_RESOURCE_NAME` | 用于构造基 URL：`https://<resource>.openai.azure.com/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` | 可选映射字符串：`modelId=deploymentName,model2=deployment2` |

基 URL 解析顺序：选项 `azureBaseUrl` → 环境变量 `AZURE_OPENAI_BASE_URL` → 选项/环境变量中的资源名称 → `model.baseUrl`。

### Google Vertex AI \{#google-vertex-ai}

| 变量 | 是否必需？ | 说明 |
| --- | --- | --- |
| `GOOGLE_CLOUD_PROJECT` | 是（除非已通过选项传入） | 首选项目 ID 来源 |
| `GCP_PROJECT` | 回退项 | 备用项目 ID 来源 |
| `GCLOUD_PROJECT` | 回退项 | 备用项目 ID 来源 |
| `GOOGLE_VERTEX_LOCATION` | 是（除非已通过选项传入） | 首选 Vertex 位置来源 |
| `GOOGLE_CLOUD_LOCATION` | 回退项 | 备用 Vertex 位置来源 |
| `VERTEX_LOCATION` | 回退项 | 备用 Vertex 位置来源 |
| `GOOGLE_CLOUD_API_KEY` | 视条件而定 | 直接 Vertex API 密钥身份验证；否则在设置了项目和位置时，ADC 回退项可进行身份验证 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 视条件而定 | 如果设置，文件必须存在；否则检查 ADC 回退路径（`~/.config/gcloud/application_default_credentials.json`） |

`GOOGLE_CLOUD_ACCESS_TOKEN`（或兼容的 `CLOUDSDK_AUTH_ACCESS_TOKEN` 回退项）提供显式 Google OAuth 访问令牌，并绕过 ADC 令牌获取。

### Kimi \{#kimi}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `KIMI_API_KEY` | 中国大陆 `kimi-code`（kimi.com）模型提供方的 API 密钥身份验证；Moonshot 从不使用它 |
| `KIMI_CODE_GLOBAL_API_KEY` | `kimi-code-global`（kimi.ai）模型提供方的 API 密钥身份验证 |
| `KIMI_CODE_OAUTH_HOST` | 两个 Kimi Code 模型提供方共享的 OAuth 主机覆盖 |
| `KIMI_OAUTH_HOST` | 两个模型提供方共享的回退 OAuth 主机覆盖 |
| `KIMI_GLOBAL_OAUTH_HOST` | 全球 OAuth 主机覆盖（仅限 `kimi-code-global`；优先于共享覆盖项） |
| `KIMI_GLOBAL_AUTH_HOST` | 回退全球 OAuth 主机覆盖（仅限 `kimi-code-global`；在共享覆盖项之前应用） |
| `KIMI_CODE_BASE_URL` | 仅为中国大陆 `kimi-code` 部署覆盖 Kimi 用量端点基 URL（`usage/kimi.ts`） |

OAuth 主机链：中国大陆的 `kimi-code` 按 `KIMI_CODE_OAUTH_HOST` → `KIMI_OAUTH_HOST` → `https://auth.kimi.com` 解析；全球的 `kimi-code-global` 按 `KIMI_GLOBAL_OAUTH_HOST` → `KIMI_GLOBAL_AUTH_HOST` → `KIMI_CODE_OAUTH_HOST` → `KIMI_OAUTH_HOST` → `https://auth.kimi.ai` 解析，其 API 基地址为 `https://api.kimi.ai/coding/v1`。

### Kiro \{#kiro}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `KIRO_API_REGION` | 未设置：在引导区域中探测未存储端点的 API 密钥。已设置：发现和请求直接使用此 AWS 区域 |

无效的 `KIRO_API_REGION` 会报错，而不是静默回退。`/login kiro` 验证粘贴的 API 密钥时也会读取它。见 [Kiro](./kiro.md)。

### OpenAI 兼容端点控制项 \{#openai-compatible-endpoint-controls}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `OPENAI_BASE_URL` | 当模型/模型提供方提供默认值时，作为 OpenAI 兼容请求的基 URL 回退项 |
| `MOONSHOT_BASE_URL` | Moonshot 聊天和模型发现端点覆盖 |
| `XAI_BASE_URL` | 用于 `xai`/`xai-oauth` 聊天、图像生成和网页搜索的 xAI 端点覆盖；仅在模型使用内置 `https://api.x.ai/v1` 端点时生效，因此 models.yml 中的 `baseUrl` 优先；绝不会接收 `xai-oauth` OAuth 凭据 |
| `SAKANA_BASE_URL` / `FUGU_BASE_URL` | Sakana/Fugu 端点覆盖（`SAKANA_BASE_URL` 优先） |
| `PI_OPENROUTER_RESPONSES` | 除非设为 `0`，否则启用 Responses API；`0` 选择 OpenAI Completions 路由 |
| `UMANS_WEBSEARCH_PROVIDER` | 未显式提供时，默认选择的 Umans Anthropic 网页搜索提供方 |

### Anthropic OAuth \{#anthropic-oauth}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `PI_ANTHROPIC_OAUTH_CALLBACK_PORT` | Anthropic 回调端口（默认为 `54545`）。本地登录可回退到空闲端口，或用 `0` 请求分配端口。SSH 代理登录要求固定端口，并在隧道两端使用该端口。 |

### GitLab Duo \{#gitlab-duo}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `GITLAB_CLIENT_ID` | OAuth 客户端 ID。未设置时，使用内置 GitLab OAuth 应用客户端 ID。 |
| `GITLAB_REDIRECT_URI` | 向 GitLab 声明的确切 OAuth 重定向 URI。未设置时，本地回调使用 `http://localhost:8080/callback`，并可回退到随机端口。必须使用 HTTP 或 HTTPS；回环回调必须使用 HTTP，并绑定 URI 的主机和端口。 |
| `GITLAB_DUO_NAMESPACE_ID` | 工作流命名空间覆盖。运行时选项优先；否则，命名空间/项目发现使用当前凭据和工作目录。 |
| `GITLAB_DUO_PROJECT_ID` | 按 ID 覆盖工作流项目。运行时 `projectId` 优先，其次是运行时 `projectPath`；此变量优先于 `GITLAB_DUO_PROJECT_PATH`。 |
| `GITLAB_DUO_PROJECT_PATH` | 未设置运行时项目或 `GITLAB_DUO_PROJECT_ID` 时，按路径覆盖工作流项目。 |
| `GITLAB_DUO_WORKFLOW_DEFINITION` | 工作流定义覆盖；运行时 `workflowDefinition` 优先。默认为 `ambient`。 |
| `GITLAB_DUO_WORKFLOW_TRACE` | 仅当值恰好为 `1` 时启用工作流跟踪。每个跟踪事件以每行一个 JSON 对象的形式追加；跟踪写入失败会被忽略。 |
| `GITLAB_DUO_WORKFLOW_TRACE_FILE` | 跟踪输出路径。值会去除首尾空白；未设置或空白时，默认为从模型提供方模块解析 `../../../../.tmp/gitlab-duo-workflow-trace.log` 所得的绝对路径（在源码检出目录中为 `<repo>/.tmp/gitlab-duo-workflow-trace.log`）。缺少的父目录会自动创建。 |

`GITLAB_CLIENT_ID` 和 `GITLAB_REDIRECT_URI` 影响 OAuth 登录。四个路由/创建
覆盖项（`GITLAB_DUO_NAMESPACE_ID`、`GITLAB_DUO_PROJECT_ID`、
`GITLAB_DUO_PROJECT_PATH` 和 `GITLAB_DUO_WORKFLOW_DEFINITION`）影响
`gitlab-duo-agent` Workflow 的命名空间/项目解析或工作流创建；它们
不配置 OAuth。上面的两个跟踪变量仅影响本地诊断
输出。非回环
重定向 URI 无法由本地回调监听器直接提供服务，
因此通过粘贴代码路径完成。

### OpenAI Codex responses（功能/调试控制项） \{#openai-codex-responses-featuredebug-controls}

| 变量 | 行为 |
| --- | --- |
| `PI_CODEX_DEBUG` | `1`/`true` 启用 Codex 模型提供方调试日志 |
| `PI_CODEX_WEBSOCKET` | `1`/`true` 启用优先使用 websocket 传输 |
| `PI_CODEX_RESPONSES_LITE` | `1`/`true` 使常规推理选择 Responses Lite；`0`/`false` 强制使用标准 Responses 请求体；未设置时，常规推理默认使用完整 Responses |
| `PI_OPENAI_STATEFUL` | 覆盖平台 OpenAI Responses API 的有状态链式调用默认值（`previous_response_id`，强制 `store: true`）：访问 api.openai.com 时默认开启，其他情况关闭 |
| `PI_CODEX_WEBSOCKET_IDLE_TIMEOUT_MS` | 正整数覆盖值（默认为 `300000`） |
| `PI_CODEX_WEBSOCKET_FIRST_EVENT_TIMEOUT_MS` | 首事件超时覆盖值（默认为 `300000`） |
| `PI_CODEX_WEBSOCKET_PING_INTERVAL_MS` | Ping 间隔覆盖值（默认为 `10000`） |
| `PI_CODEX_WEBSOCKET_PONG_TIMEOUT_MS` | Pong 超时覆盖值（默认为 `60000`） |
| `PI_CODEX_WEBSOCKET_MESSAGE_QUEUE_CAPACITY` | 缓冲消息容量覆盖值（默认为 `4096`） |
| `PI_CODEX_WEBSOCKET_MAX_IDLE_REUSE_MS` | 连接不再复用前的最长空闲时间（默认为 `30000`）；`0` 禁用按空闲时长截止 |
| `PI_CODEX_WEBSOCKET_RETRY_BUDGET` | 非负整数覆盖值（默认为 `5`） |
| `PI_CODEX_WEBSOCKET_RETRY_DELAY_MS` | 正整数基础退避覆盖值（默认为 `500`） |
| `PI_STREAM_FIRST_EVENT_TIMEOUT_MS` | 通用流首事件超时；`0` 禁用 |
| `PI_STREAM_IDLE_TIMEOUT_MS` | 通用流空闲超时；`0` 禁用 |
| `PI_OPENAI_STREAM_FIRST_EVENT_TIMEOUT_MS` | OpenAI 专用首事件超时覆盖值；`0` 禁用，并优先于通用值。`omp config set providers.streamFirstEventTimeoutSeconds <seconds>` 提供等效的持久化配置 |
| `PI_OPENAI_STREAM_IDLE_TIMEOUT_MS` | OpenAI 专用空闲超时覆盖值；`0` 禁用，并优先于通用值。`omp config set providers.streamIdleTimeoutSeconds <seconds>` 提供等效的持久化配置 |

### Cursor 模型提供方调试 \{#cursor-provider-debug}

| 变量 | 行为 |
| --- | --- |
| `DEBUG_CURSOR` | 启用模型提供方调试日志；`2`/`verbose` 输出详细载荷片段 |
| `DEBUG_CURSOR_LOG` | 可选文件路径，用于输出 JSONL 调试日志 |

### 提示词缓存兼容开关 \{#prompt-cache-compatibility-switch}

| 变量 | 行为 |
| --- | --- |
| `PI_CACHE_RETENTION` | 在支持的场景中覆盖缓存保留时间（`anthropic`、`openai-responses`、Bedrock）。接受 `long`、`short` 或 `none`；忽略其他值 |

---

## 3) 网页搜索子系统 \{#3-web-search-subsystem}

### 搜索提供方凭据 \{#search-provider-credentials}

| 变量 | 使用方 |
| --- | --- |
| `EXA_API_KEY` | Exa 搜索/MCP；也可使用 `/login exa`；无密钥时使用无需密钥的公共 MCP（见下文） |
| `TINYFISH_API_KEY` | TinyFish 搜索提供方（必需） |
| `KEENABLE_API_KEY` | Keenable 搜索提供方（自动链需要密钥；显式选择 `web/keenable` 时可使用无需密钥的公共端点，见下文） |
| `SOFYA_API_KEY` | Sofya 搜索提供方（必需） |
| `BRAVE_API_KEY` | Brave 搜索提供方 |
| `DEEPSEEK_API_KEY` | DeepSeek 搜索提供方（与 DeepSeek 模型使用同一密钥） |
| `PERPLEXITY_API_KEY` | Perplexity 搜索提供方的 API 密钥模式 |
| `PERPLEXITY_COOKIES` | Perplexity cookie 身份验证搜索模式 |
| `PI_PERPLEXITY_RESPONSES` | `1` 选择 Perplexity Responses 端点，而不是 Chat Completions |
| `PI_PERPLEXITY_MODEL` | Perplexity 消费者订阅模型偏好（默认为 `experimental`） |
| `PI_PERPLEXITY_API_MODEL` | Perplexity 直接 API 模型覆盖（默认为 `sonar-pro`） |
| `FIRECRAWL_API_KEY` | Firecrawl 搜索提供方（无密钥时使用无需密钥的托管搜索，见下文）和 fetch 读取器后端（必需） |
| `FIRECRAWL_BASE_URL` | Firecrawl API 端点覆盖（`FIRECRAWL_API_URL` 为回退别名） |
| `TAVILY_API_KEY` | Tavily 搜索提供方 |
| `ZAI_API_KEY` | z.ai 搜索提供方（也会检查 `agent.db` 中存储的 OAuth） |
| `OPENAI_CODEX_OAUTH_TOKEN` | Codex 搜索身份验证；也可使用 `agent.db` 中存储的 `openai-codex` OAuth |
| `OPENAI_API_KEY` | OpenAI Responses 搜索身份验证 |
| `MOONSHOT_SEARCH_API_KEY` / `KIMI_SEARCH_API_KEY` | Kimi/Moonshot 搜索提供方的环境变量身份验证 |
| `MOONSHOT_SEARCH_BASE_URL` / `KIMI_SEARCH_BASE_URL` | Kimi/Moonshot 搜索端点覆盖 |
| `KAGI_API_KEY` | Kagi 搜索提供方 |
| `JINA_API_KEY` | Jina 搜索提供方 |
| `PARALLEL_API_KEY` | Parallel 搜索提供方；无密钥时使用无需密钥的公共 MCP（见下文） |
| `OLLAMA_CLOUD_API_KEY` | Ollama 网页搜索提供方 |
| `SEARXNG_ENDPOINT`, `SEARXNG_TOKEN` | SearXNG 端点和可选 Bearer 令牌；作为 `searxng.endpoint` / `searxng.token` 的回退项，在设置未设置、为 `null` 或空白时使用 |
| `SEARXNG_BASIC_USERNAME`, `SEARXNG_BASIC_PASSWORD` | SearXNG HTTP Basic Auth 凭据；仅在对应的 `searxng.basic*` 设置未设置或为 `null` 时使用回退项（空字符串是有效凭据） |

启用 `providers.webKeyless`（默认启用）时，无需密钥的 Parallel、Exa 和托管 Firecrawl 搜索可以在自动链中运行。设置 `providers.webKeyless=false` 会跳过这些无需密钥的路径，包括显式的 `web` 角色和回退条目；只有 `omp q --model web/exa "…"` 这类逐请求选择器仍可运行它们。Keenable 仅在有凭据时加入自动链；显式的 `web/keenable` 候选项在无凭据时使用其公共端点，同样受 `providers.webKeyless` 规则约束。

DuckDuckGo 搜索无需密钥，它查询无 JS 的 HTML 前端（`html.duckduckgo.com`），不需要凭据；它还与 startpage、google、ecosia 和 mojeek 一起，为无需凭据的 `public` 聚合提供结果。

SearXNG 也会从 `~/.omp/agent/config.yml` 读取对应的 `searxng.endpoint`、`searxng.token`、`searxng.basicUsername` 和 `searxng.basicPassword` 设置；环境变量是回退项。

### Anthropic 网页搜索身份验证 \{#anthropic-web-search-authentication}

对于 Anthropic 目录模型，`searchAnthropic()` 按以下顺序使用凭据：

1. `ANTHROPIC_SEARCH_API_KEY`
2. 模型注册表针对所选模型/模型提供方的凭据解析器，包括已配置的运行时凭据、已存储的 OAuth 或 API 密钥登录，以及该模型提供方的常规环境变量回退项

`ANTHROPIC_SEARCH_API_KEY` 是仅用于搜索的身份验证来源：它不会更改聊天凭据。所选目录模型提供模型 ID 和端点，因此没有单独的 Anthropic 搜索模型或基 URL 环境变量覆盖项。

| 变量 | 默认值 / 行为 |
| --- | --- |
| `ANTHROPIC_SEARCH_API_KEY` | 专用于 Anthropic 网页搜索请求的 API 密钥。它会在所选模型的常规凭据解析器之前尝试，不影响聊天补全。 |

### Perplexity OAuth 流程行为标志 \{#perplexity-oauth-flow-behavior-flag}

| 变量 | 行为 |
| --- | --- |
| `PI_AUTH_NO_BORROW` | 如果设置，则禁用 Perplexity 登录流程中借用 macOS 原生应用令牌的路径 |

### TypeSafe 判断 \{#typesafe-judgments}

应用针对自身状态作出的小型类型化决策（`auto` 思考级别难度分类器、Smart 意外停止检测、git TUI AI 暂存以及 `judge()` eval 辅助函数）使用 `judge` 模型角色。具有 TypeSafe 凭据时，目录会通过 `GET /v1/models` 发现账户可见的评判模型列表，其中包括服务公布的 `jev-latest` 和 `jev-preview`，以及仅列出别名时会遗漏的预置 `jev-1.14.0`，角色会选择一个确切的目录模型。内置评判链为 `typesafe/jev-1.14.0`、`openrouter/typesafe/jev-1.14`、`tiny`、`smol`、`default`，最后是当前会话模型。一旦链到达原生 System One 模型（直接通过 TypeSafe 或通过 OpenRouter），它只会回退到其他原生模型：当所有原生评判模型均失败时，判断失败，而不会降级到通过提示词驱动的聊天模型或设备端模型。每个失败候选项均记录为 `judgment candidate failed`。配置 `modelRoles.judge` 或 `retry.fallbackChains.judge` 可选择 `typesafe/jev-preview` 或其他评判候选项。

| 变量 | 默认值 / 行为 |
| --- | --- |
| `TYPESAFE_API_KEY` | 用于发现和 System One 请求的 TypeSafe API 密钥；也可使用 `/login typesafe` |
| `TYPESAFE_BASE_URL` | API 根地址覆盖（默认为 `https://api.typesafe.ai`），用于模型发现、`/login` 验证和 System One 请求 |
| `OPENAI_API_KEY` | 也用于验证 OpenAI Decisions 评判模型 `openai/gpt-6-luna-decisions` 的身份（通过 `POST /v1/decisions` 使用 GPT-6 Luna）；将其分配给 `judge` 角色即可使用 |
| `GEMINI_API_KEY` | 也用于验证 Gemini Decisions 评判模型 `google/gemini-decision-1` 的身份（通过 `POST /v1beta/decisions` 使用 Gemini Decision 1）；将其分配给 `judge` 角色即可使用 |
| `CLOUDFLARE_API_TOKEN` | 与 `CLOUDFLARE_ACCOUNT_ID` 一起用于验证 Cloudflare Workers AI Clef 评判模型（`cloudflare-workers-ai/@cf/cloudflare/clef`、`.../clef-flash`）的身份；也可使用 `/login cloudflare-workers-ai` |
| `LIQUID_API_KEY` | 用于验证 Liquid AI 评判模型（`liquid/d1.2`、`liquid/d1.2-ultra`，以及已弃用的 `liquid/d1.1` 和 `liquid/d1-ultra`）的身份；也可使用 `/login liquid` |
| `NACE_API_KEY` | 用于验证 Nace Drex 评判模型（`nace/drex-max-v1.1`、`nace/drex-max-finance`、`nace/drex-v2.0`）的身份；也可使用 `/login nace` |
| `TYPESAFE_DEFAULT_MODEL` | 独立 `pi-ai` TypeSafe 客户端在调用方未传入模型时的默认模型（默认为 `jev-latest`）。coding-agent 应用会传入 `judge` 角色所选的模型，因此此变量不会覆盖应用的角色选择或发现的模型 ID。 |

---

## 4) Python 工具与内核运行时 \{#4-python-tooling-and-kernel-runtime}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `PI_PY` | Python 布尔标志覆盖；未设置或为空时遵循 `eval.py`（默认启用） |
| `PI_JS` | JavaScript 布尔标志覆盖；未设置或为空时遵循 `eval.js`（默认启用） |
| `PI_PYTHON_SKIP_CHECK` | 真值标志跳过 Python 解释器可用性检查（子进程运行器仍会按需启动） |
| `PI_PYTHON_IPC_TRACE` | 真值标志记录与 Python 运行器子进程交换的 NDJSON 帧 |
| `VIRTUAL_ENV` | Python 运行时解析中优先级最高的 venv 路径 |
| `CONDA_PREFIX` | Python 环境回退项，位于 `VIRTUAL_ENV` 之后、本地 `.venv` / `venv` 目录之前 |

Python 子进程过滤会拒绝常见 API 密钥，并允许安全的基础变量以及 `LC_`、`XDG_` 和 `PI_` 前缀。

Shell 子进程过滤是独立的（`packages/utils/src/env.ts`）：它移除项目 dotenv 值，而不是应用 Python 的键允许列表。

---

## 5) 智能体/运行时行为开关 \{#5-agentruntime-behavior-toggles}

| 变量 | 默认值 / 行为 |
| --- | --- |
| `PI_SMOL_MODEL` | `smol` 的临时模型角色覆盖（CLI `--smol` 优先） |
| `PI_SLOW_MODEL` | `slow` 的临时模型角色覆盖（CLI `--slow` 优先） |
| `PI_PLAN_MODEL` | `plan` 的临时模型角色覆盖（CLI `--plan` 优先） |
| `PI_NO_TITLE` | 如果设置（任意非空值），则禁用首次用户消息时的自动会话标题生成 |
| `PI_MOTION` | `tui.motion` 动画预设：`full`、`reduced` 或 `none`。`--motion` 优先 |
| `PI_SPINNER_INTERVAL` | `tui.spinnerInterval`：旋转指示器帧之间的毫秒数（`0` = 静态）。`--spinner-interval` 优先 |
| `PI_MAX_FPS` | `tui.maxFps`：每秒重绘帧数上限（`1`-`120`）。`--max-fps` 优先 |
| `OMP_BUILD_LABEL` | 自由格式名称（压成一行，取前 80 个字符），随构建信息记录在此进程写入的每个会话条目中，以便区分来自自定义或实验构建的会话记录；由 `/session` 显示 |
| `PI_TINY_DEVICE` | 本地微型模型的推理后端；覆盖 `providers.tinyModelDevice` 设置（默认：CPU；ONNX 提供程序为 `cpu`、`gpu`、`webgpu`、`auto`、`cuda`、`dml`、`coreml`、`wasm`、`webnn`、`webnn-gpu`、`webnn-cpu`、`webnn-npu`，或使用 `mlx`/`metal` 在 Apple 芯片上通过 mlx-lm 运行 MLX 权重） |
| `PI_TINY_DTYPE` | 本地微型模型的 ONNX 量化/精度；覆盖 `providers.tinyModelDtype` 设置（默认：各模型随附的 dtype，目前为 `q4`；支持 `auto`、`fp32`、`fp16`、`q8`、`int8`、`uint8`、`q4`、`bnb4`、`q4f16`、`q2`、`q2f16`、`q1`、`q1f16`） |
| `PI_NO_INTERLEAVED_THINKING` | 如果为 `1`，则禁用 Anthropic 交错思考预算行为，并对旧思考模式使用输出令牌膨胀 |
| `PI_NO_THINKING_LOOP_GUARD` | 如果为 `1`，则禁用模型思考循环防护 |
| `NULL_PROMPT` | 如果为 `true`，系统提示词构建器返回空字符串 |
| `PI_BLOCKED_AGENT` | 在 task 工具中阻止特定的子代理类型 |
| `PI_TASK_MAX_OUTPUT_BYTES` | 每个子代理捕获的最大输出字节数（默认为 `500000`） |
| `PI_TASK_MAX_OUTPUT_LINES` | 每个子代理捕获的最大输出行数（默认为 `5000`） |
| `PI_WALK_WORKERS` | `omp-xfs` 并行遍历的工作线程数（grep、glob、模糊查找、AST 发现、shell `rg`/`grep`）。正数 `N` = `N` 个工作线程（调用线程为工作线程 0）；未设置或 `0` = 各文件系统默认值（macOS 为 4，Linux 为 8，其他平台及提供程序为 4），上限为可用并行度。由 `PI_GREP_WORKERS` 重命名而来；旧名称已不再读取 |
| `PI_TIMING` | 任意非空值会在交互式 TUI 启动前，或在打印模式的提示词批次之后，将应用墙钟耗时区间打印到 **stderr**（每条消息一个 `print:prompt:initial` / `print:prompt:next` 区间）。使用 `x` 可在不进行模块插桩的情况下测量会话启动并退出。总时间从 Bun 的进程时钟开始测量，而非 shell 启动或首个可见帧；交互式计时运行会跳过推测性的输入框预绘制。使用开发启动器时，`modules` 还会分别报告观测到的源码读取和顶层求值；求值包括等待所耗时间，而不仅是 CPU 时间。此插桩会改变启动开销。`loadCustomTools` 按文件细分：`module` 涵盖模块查找、准备和导入；`factory` 涵盖会话绑定。`x,modules` 添加模块观测并退出；`full` 列出所有观测，包括短于 0.5 毫秒的区间，然后退出。选项可以用 `,`、`:`、`;`、`+` 或空白分隔。 |
| `PI_DEBUG_STARTUP` | 如果设置（任意非空值），则每个启动阶段开始/结束时，同步向 **stderr** 流式输出一行 `[startup] <phase>:start` / `:done` 标记，包括命令模块导入（`cli:load:<name>`）和原生扩展提取/`dlopen`（`native:*`）。与仅在启动完成后打印的 `PI_TIMING` 不同，即使发生严重卡死，标记仍然保留：stderr 最后一行指出进程卡住的阶段。可自由与 `PI_TIMING` 组合使用；标记和耗时区间树使用相同的阶段名称。 |
| `OMP_LOG_LEVEL` | 写入 `logs/omp.<date>.<pid>.log` 文件，以及由在 stdout 记录日志的服务（`omp auth-broker serve`）写入 stdout 的最详细级别：`error`、`warn`、`info` 或 `debug`（默认：所有级别）。文件记录批量写入（每秒或每 64 KiB 最多写入一次）；`warn` 和 `error` 记录立即写入，退出、信号和致命错误路径会刷出其余记录。 |
| `PI_PACKAGE_DIR` | 覆盖包资源基目录解析（`docs/`、`examples/`、`CHANGELOG.md`） |
| `OMP_SKIP_SETUP` | 除 `0`、`false` 或 `no` 外的任意非空值均跳过自动交互式设置场景；显式强制的设置流程会忽略它 |
| `PI_DISABLE_LSPMUX` | 如果为 `1`，则禁用 lspmux 检测/集成，并强制直接启动 LSP 服务器 |
| `PI_RPC_EMIT_TITLE` | 类布尔标志，在 RPC 模式下启用标题事件 |
| `PUPPETEER_EXECUTABLE_PATH` | eval 浏览器运行时的 Chromium 可执行文件覆盖 |
| `LITELLM_BASE_URL` | LiteLLM 代理基 URL 回退项（未设置时为 `http://localhost:4000/v1`）；显式的 `providers.litellm.baseUrl` / `models.yml` 配置优先 |
| `BIFROST_BASE_URL` | Bifrost 网关基 URL 回退项（未设置时为 `http://localhost:8080/v1`）；显式的 `providers.bifrost.baseUrl` / `models.yml` 配置优先 |
| `MODAL_BASE_URL` | Modal 推理基 URL 回退项（未设置时为 `https://inference.us-west.modal.direct/v1`）；裸端点源地址后会追加 `/v1`，显式的 `providers.modal.baseUrl` / `models.yml` 配置优先 |
| `LM_STUDIO_BASE_URL` | 默认隐式 LM Studio 发现基 URL 覆盖（未设置时为 `http://127.0.0.1:1234/v1`） |
| `OLLAMA_BASE_URL` | 默认隐式 Ollama 发现基 URL 覆盖（未设置时使用 `OLLAMA_HOST`，再回退到 `http://127.0.0.1:11434`） |
| `OLLAMA_HOST` | 未设置 `OLLAMA_BASE_URL` 时用于隐式 Ollama 发现的 Ollama 主机；接受 `127.0.0.1:11434` 或 `http://host:11434` 等 Ollama 风格的值 |
| `OLLAMA_CONTEXT_LENGTH` | 隐式 Ollama 发现的正整数上下文窗口覆盖；仅影响 OMP 上下文预算，不改变 Ollama 的运行时 `num_ctx` |
| `LLAMA_CPP_BASE_URL` | 默认隐式 Llama.cpp 发现基 URL 覆盖（未设置时为 `http://127.0.0.1:8080`） |
| `PI_EDIT_VARIANT` | 值有效时强制指定 edit 工具变体（`patch`、`replace`、`hashline`、`apply_patch`、`sloppy`）；无效值（包括 `auto`）会被忽略。匹配的 `edit.modelVariants` 条目仍优先于它；`magic` 使 `edit` 接受以描述方式表达的更改；`none` 移除 edit 工具并保持 `bash` 启用 |
| `PI_EDIT_FUZZY` | `1`/`true` 强制开启 edit 模糊匹配，`0`/`false` 强制关闭；`auto` 或任何其他值会被忽略，并应用 `edit.fuzzyMatch` |
| `PI_EDIT_FUZZY_THRESHOLD` | `[0, 1]` 范围内的模糊匹配相似度阈值，覆盖 `edit.fuzzyThreshold`；`auto`、非数字或超出范围的值会被忽略 |
| `PI_INTENT_TRACING` | 工具意图元数据的布尔标志覆盖；未设置或为空时回退到 `tools.intentTracing`（该设置未设置时，仅在交互式 TUI 中默认开启）。`PI_INTENT_TRACING=1` 会在打印、RPC 和 ACP 模式中开启它 |
| `PI_INTENT_DESC` | 替换注入的意图字段在工具模式中的描述（默认为 `concise intent`）；未设置或为空时保留默认值 |
| `PI_INTENT_PROMPT` | 替换系统提示词中对意图字段的引导行（``Most tools take `i`: `` 后的文本）；未设置或为空时保留默认值 |
| `PI_STRICT_EDIT_MODE` | 如果为 `1`，则禁用内置的模型专用编辑模式回退，因此使用已配置/全局的 `edit.mode`，除非被 `PI_EDIT_VARIANT` 或 `edit.modelVariants` 覆盖 |
| `PI_FORCE_IMAGE_PROTOCOL` | 在使用处强制指定支持的图像协议（`kitty`、`iterm2`/`iterm`、`sixel`、`none`）。在 tmux 内设置 `kitty` 还会启用 Kitty Unicode 占位符放置，除非 `PI_KITTY_PLACEHOLDERS=0` 或 `PI_NO_KITTY_PLACEHOLDERS=1` 将其禁用 |
| `PI_ALLOW_SIXEL_PASSTHROUGH` | 在 `PI_FORCE_IMAGE_PROTOCOL=sixel` 时允许 SIXEL 透传 |
| `PI_NO_PTY` | 如果为 `1`，则禁用 bash 工具的交互式 PTY 路径 |
| `OMP_MCP_TIMEOUT_MS` | 覆盖每个 MCP 服务器的 MCP 客户端请求超时（毫秒）及打印模式就绪等待（默认为 `30000`）。`0` 禁用两种截止时间；打印模式可能无限等待服务器。无效值（负数或非数字）会在发出警告后被忽略，使用每个服务器的配置或默认值。 |
| `OMP_MCP_STARTUP_TIMEOUT_MS` | 初始 MCP 发现窗口（毫秒），覆盖 `mcp.startupTimeoutMs`（默认为 `250`）。`0` 等待初始连接稳定；无效值会记录日志并被忽略。打印模式独立地在首轮之前等待完全就绪。 |
| `OMP_MCP_REQUIRE_READY` | 设为 `1` 后，如果任何已配置 MCP 服务器仍处于等待中或已失败，打印模式会在首轮前以退出码 1 退出。不设置时，不可用的服务器会在 stderr 上产生逐服务器警告，轮次仍继续。 |
| `PI_DISABLE_UUTILS_BUILTINS` | 除 `0`/`false` 外的非空值会禁用 bash 工具的 uutils 内置命令；`shell.env.PI_DISABLE_UUTILS_BUILTINS` 优先 |
| `PI_TERMINAL_OWNER_PID` | 交互式 TUI 在启动时设为自身 pid，并由它运行的每条命令继承。pid 与此不同的 omp 会跳过自动 Tern 和 cmux 浏览器标签页，以免其悬浮在所有者的窗格上方；不要自行设置 |
| `OMP_NO_WEBP` | `1` 或 `true`（不区分大小写）在图像缩放格式选择中禁用 WebP |
| `MNEMOPI_EMBEDDING_MODEL` | `mnemopi.embeddingModel` 的嵌入模型回退项：在该设置未设置、为 `null` 或空白时使用；否则设置优先 |
| `PI_AUTO_QA` | 自动工具问题报告注入/记录的最高优先级布尔标志；除 `1`/`y`/`true`/`yes`/`on` 外的任何非空值都会禁用它；未设置或为空时查询 `dev.autoqa` 设置 |
| `PI_AUTO_QA_PUSH` | `1`/`true` 绕过同意对话框，并在无头/非交互式环境中强制记录工具问题推送 |
| `PI_AUTO_QA_PUSH_URL` | 自动 QA 问题反馈推送的端点覆盖；优先于 `dev.autoqaPush.endpoint` 设置 |
| `PI_AUTO_QA_PUSH_TOKEN` | 自动 QA 问题反馈推送的 Bearer 令牌覆盖；优先于 `dev.autoqaPush.token` |
| `PI_BROWSER_RELAY` | 浏览器中继的 `0`/`1` 总开关；覆盖 `browser.relay` 设置。`only`（由扩展的原生主机为侧边栏会话设置）使中继成为会话唯一的浏览器：每次打开操作，包括子代理的操作，都会驱动你的 Chrome，且拒绝除 `"relay"` 之外的任何 `app`（eval 的浏览器 API 需要时会自动启动中继） |
| `PI_BROWSER_RELAY_KEEP_FRONT` | `0` 阻止中继（macOS）在 omp 对中继标签页的输入打开弹出窗口时，将你的应用重新置于前台；在中继启动时读取，默认开启 |
| `PI_BROWSER_WEBKIT` | omp 自有无头 WebKit 浏览器的 `0`/`1` 开关（其引擎安装后即为默认浏览器）；覆盖 `browser.webkit` 设置，且 `0` 还会拒绝 `app: "webkit"`。对于 `app: "webkit"`，若默认位置缺少引擎则会下载；未安装浏览器时也会先下载它，再考虑 Chrome for Testing；没有该引擎时，浏览器为托管 Chromium |
| `PI_BROWSER_WEBKIT_PATH` | omp 的 WebKit 引擎：其宿主可执行文件（文件路径按原样使用），或包含 `ABHost`（Windows 上为 `ABHost.exe`）的 ABKit 引擎目录；优先于 `browser.webkitPath` 设置和已安装引擎（`~/.o2/lib/abkit/ABHost`，Windows 上为 `ABHost.exe`）。omp 只会将缺失引擎下载到该默认位置，绝不会下载到此变量指定的位置 |
| `PI_SPOTLIGHT_EXPERIMENT` | `spotlight.experiment.enabled` 的布尔覆盖（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_HOLDOUT` | 覆盖 `spotlight.experiment.holdout`：Spotlight 实验从原本要裁剪的结果中随机留出的比例（`0`-`1`），向模型展示原始输出；超出 `0`-`1` 的值会被忽略（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_SCORE_FREE` | 覆盖 `spotlight.experiment.scoreFree`：在未留出的结果中，Spotlight 实验不调用 Spotlight 而按无评分规则整形的比例（`0`-`1`）；超出 `0`-`1` 的值会被忽略（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_TOOLS` | 覆盖 `spotlight.experiment.tools`：以逗号分隔的工具名称，Spotlight 实验会整形并记录这些工具的结果（`*` 表示所有工具）；未指定任何工具的值会被忽略（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `STENCIL_SPOTLIGHT_URL` | 覆盖 `spotlight.url`，即 Spotlight 排名端点（默认为 `https://cloud.stencil.so/v1/spotlight`） |
| `OMP_DAEMON_IDLE_GRACE_MS` | 守护进程代理在最后一个 `omp` 客户端断开后等待的毫秒数，之后它会关闭，并停止其监管的非分离守护进程，例如通过 bash 工具的 `name` 启动的服务（默认为 `3000`）。在 `omp` 进程启动代理时读取一次，使用十进制 `parseInt` 前缀（`5s` 读取为 `5`，`2.5` 读取为 `2`）；`0` 会在最后一个客户端断开时立即关闭代理，负值或不以数字开头的值使用默认值 |

### Hindsight 记忆后端 \{#hindsight-memory-backend}

每个受支持的环境变量都会覆盖对应的 `hindsight.*` 设置，而设置
又会覆盖其内置默认值。字符串值会去除首尾空白，空白值会被忽略。
布尔值遵循上面由设置支持的标志规则：空值会被忽略；`1`、`y`、
`true`、`yes` 和 `on`（全小写或全大写）表示 true；其他任何值表示 false。
整数值使用十进制 `parseInt` 前缀（`5000ms` 读取为 `5000`，`2.5` 读取为 `2`）；
空值和非数字值会被忽略，解析得到的整数不会被限制到某个范围内。枚举值
必须匹配所列小写值之一（忽略首尾空白）；无效值
会被忽略。

| 变量 | 覆盖的设置 | 接受的值 / 内置默认值 |
| --- | --- | --- |
| `HINDSIGHT_API_URL` | `hindsight.apiUrl` | 非空字符串；默认为 `http://localhost:8888` |
| `HINDSIGHT_API_TOKEN` | `hindsight.apiToken` | 非空字符串；默认未设置 |
| `HINDSIGHT_BANK_ID` | `hindsight.bankId` | 非空字符串；默认未设置，因此由所选作用域模式推导记忆库 |
| `HINDSIGHT_BANK_MISSION` | `hindsight.bankMission` | 非空字符串；默认为空字符串 |
| `HINDSIGHT_RETAIN_MODE` | `hindsight.retainMode` | `full-session` 或 `last-turn`；默认为 `full-session` |
| `HINDSIGHT_RECALL_BUDGET` | `hindsight.recallBudget` | `low`、`mid` 或 `high`；默认为 `mid` |
| `HINDSIGHT_AUTO_RECALL` | `hindsight.autoRecall` | 布尔值；默认为 `true` |
| `HINDSIGHT_AUTO_RETAIN` | `hindsight.autoRetain` | 布尔值；默认为 `true` |
| `HINDSIGHT_SCOPING` | `hindsight.scoping` | `global`、`per-project` 或 `per-project-tagged`；默认为 `per-project-tagged` |
| `HINDSIGHT_DEBUG` | `hindsight.debug` | 布尔值；默认为 `false` |
| `HINDSIGHT_RECALL_MAX_TOKENS` | `hindsight.recallMaxTokens` | 整数；默认为 `1024` |
| `HINDSIGHT_RECALL_CONTEXT_TURNS` | `hindsight.recallContextTurns` | 整数；默认为 `1` |
| `HINDSIGHT_RECALL_MAX_QUERY_CHARS` | `hindsight.recallMaxQueryChars` | 整数；默认为 `800` |
| `HINDSIGHT_RETAIN_EVERY_N_TURNS` | `hindsight.retainEveryNTurns` | 整数；默认为 `3` |
| `HINDSIGHT_REQUEST_TIMEOUT_MS` | `hindsight.requestTimeoutMs` | 整数毫秒数；默认为 `30000` |
| `HINDSIGHT_REFLECT_TIMEOUT_MS` | `hindsight.reflectTimeoutMs` | 整数毫秒数；默认为 `120000` |
| `HINDSIGHT_RECALL_TIMEOUT_MS` | `hindsight.recallTimeoutMs` | 整数毫秒数；默认为 `30000` |
| `HINDSIGHT_RETAIN_TIMEOUT_MS` | `hindsight.retainTimeoutMs` | 整数毫秒数；默认为 `60000` |

使用 CLI `--no-pty` 时，内部也会设置 `PI_NO_PTY`。

---

## 6) 存储与配置根路径 \{#6-storage-and-config-root-paths}

这些变量影响 coding-agent 存储数据的位置，以及它加载哪些进程本地设置覆盖层。

| 变量 | 默认值 / 行为 |
| --- | --- |
| `OMP_PROFILE` | 规范的具名配置档案选择器；即使显式为空，也优先于 `PI_PROFILE` |
| `PI_PROFILE` | 旧版配置档案选择器，仅在 `OMP_PROFILE` 未定义时使用 |
| `PI_CONFIG_DIR` | 主目录下的配置根目录名称（默认为 `.omp`） |
| `PI_CODING_AGENT_DIR` | 仅针对默认配置档案的完整智能体目录覆盖；具名配置档案会忽略它 |
| `PI_CODING_AGENT_SESSION_DIR` | 由启动参数解析使用的初始会话目录覆盖 |
| `PI_SESSION_ORIGIN` | `chrome`（由 omp 扩展的原生主机为侧边栏聊天设置）将此进程启动的会话标记为侧边栏所属：终端的恢复选择器、最近会话、`--continue` 和 ACP 会话列表会跳过它们，`--resume <id\|path>` 仍可打开这类会话，且此进程不写入终端面包屑 |
| `PI_NATIVES_DIR` | 原生扩展提取/暂存根目录覆盖，优先于 XDG/默认路径；加载器会追加 `<version>`。会去除首尾空白、展开 `~` 并规范化；空值或相对路径值会被忽略。也会移动下载的 tree-sitter 语法（`grammars/`）；不会移动会话、插件或其他数据。必须仅允许运行 `omp` 的用户写入：大小符合预期的现有扩展会直接复用而不重新提取，其版本仅在加载后检查 |
| `PI_CONFIG_FILES` | 平台路径列表形式的设置覆盖层（Unix 上为 `:`，Windows 上为 `;`）；按顺序在显式 `--config` 覆盖层之前加载 |
| `OMP_AUTORESEARCH_DB_DIR` | 每项目 autoresearch 数据库和项目产物根目录的目录覆盖；见 [Autoresearch](./autoresearch.md) |
| `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME` | 在 macOS/Linux 上，仅当目标 `omp` 根目录（或具名配置档案根目录）已存在时，才重定向对应的 OMP 路径 |
| `PWD` | 在路径辅助函数中匹配规范化当前工作目录时使用 |
| `OMP_WORKTREE_DIR` | 智能体管理的工作树目录覆盖（默认为 `~/.omp/wt`）；必须是绝对路径或相对于 `~` 的路径，相对路径会被忽略；优先于 `worktree.base` 设置 |
| `OMP_GITHUB_CACHE_DB` | 覆盖 GitHub 视图缓存数据库路径（默认为 `~/.omp/cache/github-cache.db`） |
| `PI_BUILD_URL` | 提供独立二进制文件的构建服务源地址（默认为 `https://build.stencil.so`；会去除末尾斜杠）。二进制安装中的 `omp update`、仅二进制发行版的二进制接管，以及已编译二进制文件启动时的更新检查，都会请求 `<origin>/api/products/omp/latest/<target>?channel=stable\|canary`；下载会依据响应中的大小和 SHA-256 验证，如果提供了针对已安装二进制文件的补丁，则通过该补丁获得下载结果。安装脚本（`install.sh`、`install.ps1`）从同一源地址下载 |
| `PI_GRAMMARS_URL` | 按需下载 WebAssembly tree-sitter 语法的基 URL（默认为 `https://github.com/stencil-hq/wasm-grammars/releases/download`）；资源以 `<base>/<release>/<file>.zst` 获取，在存入 `<natives dir>/grammars`（`~/.omp/natives/grammars`）之前，对照扩展固定的 SHA-256 验证 |

---

## 7) Shell/工具执行环境 \{#7-shelltool-execution-environment}

（来自 `packages/utils/src/procmgr.ts` 和 coding-agent 的 bash 工具集成。）

| 变量 | 行为 |
| --- | --- |
| `PI_BASH_NO_CI` | 禁止自动向启动的 shell 环境中注入 `CI=true` |
| `CLAUDE_BASH_NO_CI` | `PI_BASH_NO_CI` 的旧版别名回退项 |
| `PI_BASH_NO_LOGIN` | 非空值会禁用 POSIX 登录 shell 模式（使用 `-c` 而不是 `-l -c`），并添加 PowerShell `-NoProfile`；cmd.exe 始终使用 `/c` |
| `CLAUDE_BASH_NO_LOGIN` | `PI_BASH_NO_LOGIN` 的旧版别名回退项 |
| `PI_SHELL_PREFIX` | 可选的命令前缀包装器 |
| `CLAUDE_CODE_SHELL_PREFIX` | `PI_SHELL_PREFIX` 的旧版别名回退项 |
| `VISUAL` | 首选外部编辑器命令 |
| `EDITOR` | 回退外部编辑器命令 |

当规范变量未设置或为空时，`PI_BASH_NO_CI`、`PI_BASH_NO_LOGIN` 和 `PI_SHELL_PREFIX` 会使用其 `CLAUDE_*` 别名。这些控制项检查的是非空字符串，而非解析布尔值：即使是 `0` 或 `false`，也会激活对应的禁用 CI/禁用登录控制。

### 为会话命令设置 \{#set-for-session-commands}

omp 为会话运行的每条命令都会收到当前会话身份：`bash` 工具调用（前台、后台、PTY、ACP 客户端终端，以及通过 `name` 启动的服务）、eval `sh()`、用户 `!` 命令、`/loop` 条件和 autoresearch 运行。`bash` 工具调用还会收到运行它们的工具调用 ID：

| 变量 | 值 |
| --- | --- |
| `PI_SESSION_ID` | 当前会话 ID |
| `PI_SESSION_FILE` | 当前会话 JSONL 文件的绝对路径；未持久化时为空（`--no-session`） |
| `PI_TOOL_CALL_ID` | 运行该命令的 `bash` 工具调用 ID（仅限 `bash` 工具调用） |

每条命令启动时读取这些值，因此下一条命令会跟随 `/fork`、`/new` 和 `/resume`，而已经执行中的命令保留其启动时所在的会话。它们始终会被设置，因此空值也会替换从父 omp 进程继承的过期值。`ovnfs new`、`fork` 和 `run` 会在其打开的检出目录上记录 `PI_SESSION_ID`，`ovnfs ls` 将其显示为 SESSION。

当智能体自行调用 `bash` 时，`PI_TOOL_CALL_ID` 与 `PI_SESSION_FILE` 中的 `toolCall` 条目匹配（子代理的调用位于子代理自己的会话记录中）。从 `eval` 单元通过工具桥发起的 `bash` 调用获得工具桥生成的 ID（`js-bash-…`），会话记录中没有条目携带该 ID；会话记录记录的是 `eval` 调用。

```bash
echo "$PI_SESSION_ID"
```

---

## 8) UI/主题/会话检测（自动检测的环境变量） \{#8-uithemesession-detection-auto-detected-env}

这些变量作为运行时信号读取；通常由终端/操作系统设置，而非手动配置。

| 变量 | 用途 |
| --- | --- |
| `COLORTERM`, `TERM`, `WT_SESSION` | 颜色能力检测（主题颜色模式） |
| `COLORFGBG` | 终端背景明暗自动检测 |
| `TERM_PROGRAM`, `TERM_PROGRAM_VERSION`, `TERMINAL_EMULATOR` | 系统提示词/上下文中的终端身份 |
| `TMUX_PANE`, `CMUX_SURFACE_ID`, `KITTY_WINDOW_ID`, `TERM_SESSION_ID`, `WT_SESSION` | 每个终端稳定的会话面包屑 ID |
| `SHELL`, `ComSpec`, `TERM_PROGRAM`, `TERM` | 系统信息诊断 |
| `APPDATA`, `XDG_CONFIG_HOME` | lspmux 配置路径解析 |
| `HOME` | MCP 命令 UI 中的路径缩短 |

`JS_DEBUG_DAP_SERVER` 选择现有的 JavaScript 调试适配器服务器；`XDG_DATA_HOME` 也参与内置调试器发现。

---

## 9) TUI 运行时标志（共享包，影响 coding-agent 用户体验） \{#9-tui-runtime-flags-shared-package-affects-coding-agent-ux}

| 变量 | 行为 |
| --- | --- |
| `PI_NOTIFICATIONS` | `off` / `0` / `false` 禁止桌面通知（终端 OSC 9/99/BEL、多路复用器 CLI 及 D-Bus 回退项；`@oh-my-pi/pi-tui/driver/notify`） |
| `PI_NO_DESKTOP_NOTIFY` | 如果为 `1`，则跳过伴随仅响铃终端通知的 Linux D-Bus 提示通知（`notify-send`/`gdbus`） |
| `PI_TUI_WRITE_LOG` | 如果设置，则将 TUI 写入操作记录到文件；OSC 52 剪贴板写入只记录其载荷长度，而非内容 |
| `PI_TUI_RAW_BACKSPACE_IS_CTRL` | 如果为 `1`，则将原始 `0x08` 解释为 Ctrl+Backspace 而不是 Backspace；当 SSH/容器跳转隐藏了 Windows Terminal 客户端身份时使用 |
| `PI_HARDWARE_CURSOR` | 如果为 `1`，则启用硬件光标模式 |
| `PI_NO_SYNC_OUTPUT` | 如果设置（任意非空值），则禁用 DEC 2026 同步输出包装，同时保留 TUI 自动换行防护 |
| `PI_NO_DECCARA` | 如果设置（真值），则禁用 Kitty DECCARA 矩形 SGR 背景填充（强制使用填充字符串渲染） |
| `PI_NO_GLYPH_PROTOCOL` | 如果为 `1`，则跳过 Glyph Protocol 握手（APC `25a1`），因此 nerd 预设图标只来自终端自身的字体，而非 omp 在 Rio/Ghostty 上通过带内方式注册的轮廓 |
| `PI_TUI_NATIVE` | Tern Surface Protocol 探测：`0` 从不探测（始终使用 ANSI 行渲染器）；`1` 即使在多路复用器和测试运行时中也探测。未设置时探测每个直连终端；只有收到 `hello` 回复才切换到原生渲染 |
| `PI_TUI_TSP_RECORD` | JSONL 文件路径，用于接收每条发送和收到的 Tern Surface Protocol 消息及时间戳 |
| `PI_TUI_NATIVE_STATS` | 如果为 `1`，则以 debug 级别记录每个原生帧的操作数和 `rows` 回退次数 |
| `PI_DEBUG_REDRAW` | 如果为 `1`，则启用重绘调试日志 |
| `PI_FORCE_IMAGE_PROTOCOL` | 强制终端图像协议检测（`kitty`、`iterm2`/`iterm`、`sixel`、`none`）。在终端多路复用器内设置 `kitty` 还会启用 Kitty Unicode 占位符放置，除非 `PI_KITTY_PLACEHOLDERS=0` 或 `PI_NO_KITTY_PLACEHOLDERS=1` 将其禁用 |
| `PI_KITTY_PLACEHOLDERS` | `1` 强制开启 Kitty Unicode 占位符放置；`0` 强制关闭。在终端多路复用器下，仅在确认外层终端支持 Kitty `U=1` 占位符后才使用 `1`，否则 U+10EEEE 可能渲染为字面 PUA 方框 |
| `PI_NO_KITTY_PLACEHOLDERS` | `1` 硬性禁用 Kitty Unicode 占位符放置，且优先于 `PI_KITTY_PLACEHOLDERS` |
| `PI_TUI_RESIZE_IN_PLACE` | `1`/`true` 强制原地调整大小（不借用备用屏幕，不进行 ED3 重新换行）；`0`/`false` 强制使用备用屏幕快速路径。Warp 默认开启，因为它会在切换备用屏幕时重新报告大小，但 ConPTY 主机（Windows，以及通过 `wslhost` 的 WSL）除外，因为其网格归 conhost 管理，并在调整大小时自行重绘视口，导致无法恢复锚点 |
| `PI_LOOP_SAMPLER` | 如果为 `0` 或 `false`，则关闭 TUI 事件循环看门狗运行的 JavaScriptCore 栈采样器（在 `--cpu-prof` 下也关闭）。开启时（默认），每条 `ui.loop-blocked` 日志记录会添加 `cause`（阻塞窗口中采样最多的最内层源码帧，`name (path:line)`）、`causeShare`（包含该帧的窗口样本比例）和 `top`（最多 4 个至少出现在一半样本中的调用方，最外层优先，`name (path:line) NN%`） |

### 远程文件链接 \{#remote-file-links}

| 变量 | 行为 |
| --- | --- |
| `PI_LINK_SCHEME` | 自定义文件链接协议方案，例如 `ompfile`，不带 `:` 或 `://`。不区分大小写地匹配 `^[a-z][a-z0-9+.-]*$`，并以小写输出。无效值会记录警告，并保留普通文件/VS Code 目标。 |
| `PI_LINK_HOST` | 与 `PI_LINK_SCHEME` 配合使用的远程机器名称，可带 `:port`；默认为 `os.hostname()`。只允许字母、数字、`.`、`_` 和 `-`；无效值会记录警告并保留普通目标。未设置协议方案时无效。 |

交互式 TUI 在启动时读取这些变量一次。OSC 8 链接和原生 TSP 文件链接都使用自定义协议方案，其优先于 VS Code 目标。SDK 宿主可使用显式配置调用 `applyFileLinkSetting`。原生图像右键菜单的打开操作保留本地 `file://` URL，因为该操作在本地运行。

例如，使用 `PI_LINK_SCHEME=ompfile PI_LINK_HOST=beelink omp` 启动远程会话。指向 `/work/a b.ts` 第 42 行第 7 列的文件链接，其目标为 `ompfile://beelink/work/a%20b.ts?line=42&col=7`。可选的 `line` 和 `col` 查询参数保留提供的位置；未提供的值会省略。普通 `file:` 链接从不携带这些参数。

桌面协议处理器必须将主机路由到远程机器，对路径名进行百分号解码，并读取可选的位置参数。Windows 驱动器路径使用 `/C:/...`。UNC 路径在双斜杠路径名中保留文件服务器，例如 `ompfile://beelink//nas/share/a.ts`。格式错误的文件系统路径渲染时不带链接。模型在 Markdown 中写出的文件链接保留自身的查询或片段（例如 `#L10`），因此处理器必须忽略不认识的参数。处理器本身需在桌面端单独注册。

### 浏览器启动/代理控制项 \{#browser-launchproxy-controls}

| 变量 | 行为 |
| --- | --- |
| `PUPPETEER_PROXY` | 添加 Chromium 的 `--proxy-server` 启动参数 |
| `PUPPETEER_PROXY_BYPASS_LOOPBACK` | 类布尔标志，向绕过列表添加 `<-loopback>`，使 localhost 也使用代理 |
| `PUPPETEER_PROXY_IGNORE_CERT_ERRORS` | 类布尔标志，启动 Chromium 时忽略证书错误 |
| `CMUX_WORKSPACE_ID`, `CMUX_SURFACE_ID` | 浏览器打开分屏时的目标 cmux 工作区/界面 |
| `CMUX_RELAY_ID`, `CMUX_RELAY_TOKEN` | cmux 中继身份/身份验证回退项 |

---

## 10) 提交生成控制项 \{#10-commit-generation-controls}

| 变量 | 行为 |
| --- | --- |
| `PI_COMMIT_TEST_FALLBACK` | 如果为 `true`（不区分大小写），则强制使用提交回退生成路径 |
| `PI_COMMIT_NO_FALLBACK` | 如果为 `true`，则在智能体未返回提案时禁用回退 |
| `DEBUG` | 如果设置，则打印提交智能体的错误堆栈跟踪 |

---

## 11) OpenTelemetry 导出 \{#11-opentelemetry-export}

OMP 仅在至少一种信号具有端点时初始化 OTLP 导出。设置 `telemetry.otlpExportEnabled: false`（`/settings` → Providers → Privacy）可在已配置端点时仍跳过导出。`OTEL_SDK_DISABLED=true` 也会禁用初始化。

| 变量组 | 行为 |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 通用端点回退项 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | 各信号专用端点；优先于通用端点 |
| `OTEL_EXPORTER_OTLP_HEADERS` | 通用 OTLP 请求头，格式为 `key=value,key2=value2` 列表，值采用百分号编码 |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`, `OTEL_EXPORTER_OTLP_LOGS_HEADERS`, `OTEL_EXPORTER_OTLP_METRICS_HEADERS` | 各信号专用请求头；按键合并到通用请求头之上，并覆盖通用请求头 |
| `OTEL_TRACES_EXPORTER`, `OTEL_LOGS_EXPORTER`, `OTEL_METRICS_EXPORTER` | 包含 `none` 的列表会禁用该信号 |
| `OTEL_EXPORTER_OTLP_PROTOCOL` 和各信号的 `..._PROTOCOL` 变体 | 此运行时仅启用 `http/protobuf`；显式指定其他协议会禁用该信号 |
| `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES` | OpenTelemetry 资源元数据 |
| `OTEL_LOG_LEVEL` | 导出的 OMP 日志最低级别 |

OMP 自有 `.env` 文件（智能体目录、配置根目录、主目录 `.env`）中的 `OTEL_*` 条目仅配置 OMP 的导出器。OMP 将它们保存在私有映射中，而不是 `Bun.env`/`process.env` 中，因此它们不会出现在 omp 启动的程序的进程环境中（bash 和 PTY 命令、子代理 shell、JS eval 和标签页工作线程、LSP/DAP/MCP 服务器、安装器），也不会出现在扩展和钩子可见的 `process.env` 中。这是对继承的隔离，而非保密措施：文件在磁盘上仍可读取，且导入 `@oh-my-pi/pi-utils` 中 `$otelEnv` 的进程内代码可以读取这些值。omp 在启动时构造其 OpenTelemetry 导出器期间，仅在该同步步骤持续期间将这些值放入 `process.env`。在启动 shell 中导出的变量优先于文件，并保持对子进程可见，项目 `.env` 也保持不变。有一项限制：当 omp 在一个目录中启动，而该目录的 `.env` 本身就是 omp 的自有文件之一（如 `$HOME`）时，该文件会在 omp 加载器运行之前被应用到环境中（由 Bun 的 dotenv 自动加载完成，或在自动加载关闭时由 omp 自身的加载器完成），因此其中的值会被视为项目 `.env` 值并保持可见；请从项目目录启动 omp，或将 `OTEL_*` 保存在智能体目录文件（`~/.omp/agent/.env`）中，除非该目录就是工作目录，否则 Bun 不会自动加载它。由于这些值不在 `process.env` 中，从 `process.env` 收集机密的机密掩码机制无法看到嵌在此类值中的凭据，例如 `scheme://user:pass@host` 中的密码。需要自身 OpenTelemetry 配置的扩展应从 shell 环境获取配置。子 `omp` 进程会重新读取相同文件，并使用自身配置导出。

请求头值会进行百分号解码，因此需对空格以及 `,`/`=` 分隔符编码：

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:8000/v1/traces"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="authorization=Bearer%20$LAMINAR_PROJECT_API_KEY"
```

---

## 安全敏感变量 \{#security-sensitive-variables}

将以下内容视为机密，不要记录到日志或提交：

- 模型提供方/API 密钥和 OAuth/Bearer 凭据（所有 `*_API_KEY`、`*_TOKEN`、OAuth 访问/刷新令牌）
- 云凭据（`AWS_*`、`GOOGLE_APPLICATION_CREDENTIALS` 路径可能暴露服务账户材料）
- 搜索/提供方身份验证变量（`EXA_API_KEY`、`BRAVE_API_KEY`、`PERPLEXITY_API_KEY`、Anthropic 搜索密钥）
- Foundry mTLS 材料（`CLAUDE_CODE_CLIENT_CERT`、`CLAUDE_CODE_CLIENT_KEY`，以及指向私有 CA 证书包时的 `NODE_EXTRA_CA_CERTS`）
- OTLP 导出器请求头（`OTEL_EXPORTER_OTLP_HEADERS` 及各信号的 `..._{TRACES,LOGS,METRICS}_HEADERS` 变体），它们携带数据接入 Bearer 令牌/项目密钥

Python 运行时在启动内核子进程前，也会显式移除许多常见密钥变量（`packages/coding-agent/src/eval/py/runtime.ts`）。
