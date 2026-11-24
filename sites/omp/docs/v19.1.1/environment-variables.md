---
title: "环境变量参考"
description: "Oh My Pi v19.1.1 仓库文档：环境变量参考。"
---

# 环境变量（当前运行时参考） \{#environment-variables-current-runtime-reference}

本参考依据以下位置的现行代码：

- `packages/coding-agent/src/**`
- `packages/ai/src/**`（coding-agent 使用的模型提供方与身份验证解析）
- `packages/utils/src/**` 和 `packages/tui/src/**` 中这些变量会直接影响 coding-agent 运行时行为的部分

本文只记录当前生效的行为。

## 解析方式与优先级 \{#resolution-model-and-precedence}

大部分运行时查找使用 `$env`，它来自 `@oh-my-pi/pi-utils`（`packages/utils/src/env.ts`）。

`$env` 的加载顺序：

1. 现有进程环境（`Bun.env`）
2. 启动工作目录中的项目 `.env`，只填充当前为空或尚未设置的键
3. 当前智能体 `.env`（通常为 `~/.omp/agent/.env`），只填充当前为空或尚未设置的键
4. 当前配置根目录的 `.env`（通常为 `~/.omp/.env`），只填充当前为空或尚未设置的键
5. 用户主目录的 `.env`（`~/.env`），只填充当前为空或尚未设置的键

`OTEL_*` 条目如果来自智能体目录、配置根目录或用户主目录的 `.env`，就不会进入 `$env`：OMP 的遥测模块会单独读取（见 [OpenTelemetry 导出](#11-opentelemetry-export)）。这三处条目之间的优先级不变，仍低于 shell 导出值或项目 `.env`。

智能体目录和配置根目录的位置受配置档案和 `PI_CONFIG_DIR` 影响，也受 `PI_CODING_AGENT_DIR` 影响，但后者只用于默认配置档案。整个 dotenv 文件由 Bun 的 `node:util.parseEnv` 解析，支持带引号的多行值、转义换行符和行内注释。名称必须是 shell 标识符（`[A-Za-z_][A-Za-z0-9_]*`）；不安全的名称或值会被丢弃。这个解析器将变量引用按字面值保留；只有 Bun 在该模块运行前自动加载启动目录的 dotenv 时才会展开变量。子 shell 过滤使用同一个解析器识别项目的 `.env`、`.env.<NODE_ENV>`（默认为 `development`）、`.env.local` 和 `.env.<NODE_ENV>.local` 中的值。它会从 shell 子进程移除项目 dotenv 中的凭据，同时保留启动程序提供的变量。Linux 使用进程最初执行时的环境作为权威启动快照，其他平台则尽可能按值匹配。

每个 `.env` 文件内部还有一条规则：每个 `OMP_*` 键都会镜像到对应的 `PI_*` 别名，镜像值覆盖同一文件中的 `PI_*` 值。此规则适用于解析后的 dotenv 文件，不适用于从父进程继承的任意变量。

在设置定义中声明的变量（见 [设置优先级](./settings.md#precedence)）优先于所有设置文件，但低于 CLI 选项等运行时覆盖。除非另有说明，变量按相应设置的类型解析。布尔变量（`PI_PY`、`PI_JS`、`PI_INTENT_TRACING`、`PI_AUTO_QA`、`HINDSIGHT_AUTO_RECALL` 等）遵循 `parseFlag`：空值忽略，改用设置值；`1`、`y`、`true`、`yes` 和 `on`（全小写或全大写）表示真；其他非空值均表示假。

---

## 1) 模型与模型提供方身份验证 \{#1-modelprovider-authentication}

除非另有说明，以下变量由 `getEnvApiKey()`（`packages/ai/src/stream.ts`）读取。

直接使用的模型提供方凭据变量名来自 `env` 条目，这些条目位于 `packages/catalog/src/compat/rules/providers/*.kdl` 和 `auth/*.kdl` 中；`packages/ai/src/registry/hooks/env.ts` 提供 Foundry、Bedrock 和 Vertex 的计算解析器。

### 主要模型提供方凭据 \{#core-provider-credentials}

| 变量 | 用途 | 何时需要 | 说明与优先级 |
| ------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_OAUTH_TOKEN` | Anthropic API 身份验证 | 用 OAuth 令牌进行 Anthropic 身份验证 | 解析模型提供方凭据时优先于 `ANTHROPIC_API_KEY` |
| `ANTHROPIC_API_KEY` | Anthropic API 身份验证 | 使用 Anthropic 但不使用 OAuth 令牌 | 在 `ANTHROPIC_OAUTH_TOKEN` 之后回退使用 |
| `ANTHROPIC_FOUNDRY_API_KEY` | 通过 Azure Foundry / 企业网关使用 Anthropic | 启用 `CLAUDE_CODE_USE_FOUNDRY` | 启用 Foundry 模式时优先于 `ANTHROPIC_OAUTH_TOKEN` 和 `ANTHROPIC_API_KEY` |
| `OPENAI_API_KEY` | OpenAI 身份验证 | 使用 OpenAI 系列模型提供方且未显式传入 apiKey 参数 | 供 OpenAI Completions/Responses 模型提供方使用 |
| `OPENAI_CODEX_OAUTH_TOKEN` | OpenAI Codex 身份验证 | 使用 `openai-codex` 模型提供方 | 通过环境变量提供的 Codex OAuth 令牌 |
| `GEMINI_API_KEY` | Google Gemini 身份验证 | 使用 `google` 模型提供方的模型 | Gemini 模型提供方映射的首选密钥 |
| `GROQ_API_KEY` | Groq 身份验证 | 使用 Groq 模型 | |
| `CEREBRAS_API_KEY` | Cerebras 身份验证 | 使用 Cerebras 模型 | |
| `FIREWORKS_API_KEY` | Fireworks 身份验证 | 使用 Fireworks 模型 | |
| `FIREPASS_API_KEY` | Fire Pass 身份验证 | 使用 Fire Pass 模型 | |
| `TOGETHER_API_KEY` | Together 身份验证 | 使用 `together` 模型提供方 | |
| `MODULAR_API_KEY` | Modular 身份验证 | 使用 `modular` 模型提供方 | 也可通过交互式 API 密钥登录配置（`/login modular`） |
| `ABLITERATION_API_KEY` / `ABLIT_KEY` | Abliteration 身份验证 | 使用 `abliteration` 模型提供方 | 优先使用 `ABLITERATION_API_KEY` |
| `AIMLAPI_API_KEY` | AIML API 身份验证 | 使用 `aimlapi` 模型提供方 | AIML API 的 OpenAI 兼容端点为 `https://api.aimlapi.com/v1` |
| `HUGGINGFACE_HUB_TOKEN` | Hugging Face 身份验证 | 使用 `huggingface` 模型提供方 | Hugging Face 令牌的首选环境变量 |
| `HF_TOKEN` | Hugging Face 身份验证 | 使用 `huggingface` 模型提供方 | 未设置 `HUGGINGFACE_HUB_TOKEN` 时回退使用 |
| `SYNTHETIC_API_KEY` | Synthetic 身份验证 | 使用 Synthetic 模型 | |
| `NVIDIA_API_KEY` | NVIDIA 身份验证 | 使用 `nvidia` 模型提供方 | |
| `NANO_GPT_API_KEY` | NanoGPT 身份验证 | 使用 `nanogpt` 模型提供方 | |
| `NOVITA_API_KEY` | Novita 身份验证 | 使用 `novita` 模型提供方 | |
| `VENICE_API_KEY` | Venice 身份验证 | 使用 `venice` 模型提供方 | |
| `LITELLM_API_KEY` | LiteLLM 身份验证 | 使用 `litellm` 模型提供方 | OpenAI 兼容的 LiteLLM 代理密钥 |
| `BIFROST_API_KEY` | Bifrost 身份验证 | 使用 `bifrost` 模型提供方 | Bifrost 虚拟密钥（`sk-bf-...`）；未启用治理功能的网关接受任意值 |
| `MODAL_PROXY_TOKEN` | Modal 身份验证 | 使用 `modal` 模型提供方 | 组合形式的代理身份验证令牌 `wk-<id>.ws-<secret>`；也可通过 `/login modal` 配置 |
| `LM_STUDIO_API_KEY` | LM Studio 身份验证（可选） | 使用 `lm-studio` 模型提供方连接需要身份验证的主机 | 本地 LM Studio 通常无需身份验证；需要密钥时，任意非空令牌均可 |
| `OLLAMA_API_KEY` | Ollama 身份验证（可选） | 使用 `ollama` 模型提供方连接需要身份验证的主机 | 本地 Ollama 通常无需身份验证；需要密钥时，任意非空令牌均可 |
| `LLAMA_CPP_API_KEY` | llama.cpp 身份验证（可选） | 使用 `llama.cpp` 模型提供方连接需要身份验证的主机 | 本地 llama.cpp 通常无需身份验证；配置了密钥时，任意非空令牌均可 |
| `XIAOMI_API_KEY` | 小米 MiMo 身份验证 | 使用 `xiaomi` 模型提供方 | |
| `XIAOMI_TOKEN_PLAN_AMS_API_KEY` | 小米 MiMo Token Plan 身份验证（AMS） | 使用 `xiaomi-token-plan-ams` 模型提供方 | |
| `XIAOMI_TOKEN_PLAN_CN_API_KEY` | 小米 MiMo Token Plan 身份验证（CN） | 使用 `xiaomi-token-plan-cn` 模型提供方 | |
| `XIAOMI_TOKEN_PLAN_SGP_API_KEY` | 小米 MiMo Token Plan 身份验证（SGP） | 使用 `xiaomi-token-plan-sgp` 模型提供方 | |
| `KIRO_API_KEY` | Kiro API 密钥身份验证 | 使用 `kiro`，且未通过 `/login kiro` 登录 | 必须是 `ksk_…` 密钥；通过 `/login kiro` 保存的凭据优先 |
| `MOONSHOT_API_KEY` | Moonshot 身份验证 | 使用 `moonshot` 模型提供方 | `KIMI_API_KEY` 可作为回退别名 |
| `STEPFUN_API_KEY` | StepFun 身份验证 | 使用 `stepfun` 模型提供方 | 密钥按区域划分：`.ai` 密钥用于 `api.stepfun.ai`，`.com` 密钥用于 `api.stepfun.com` |
| `HELMCODE_API_KEY` | Helmcode 身份验证 | 使用 `helmcode` 模型提供方 | |
| `XAI_API_KEY` | xAI 身份验证 | 使用 xAI 模型，或为 `xai-oauth` 提供回退凭据 | |
| `XAI_OAUTH_TOKEN` | xAI OAuth/SuperGrok 身份验证 | 使用 `xai-oauth` 模型提供方 | 优先于 `XAI_API_KEY`，适用于 `xai-oauth` |
| `OPENROUTER_API_KEY` | OpenRouter 身份验证 | 使用 OpenRouter 模型 | 图片角色选用 OpenRouter 时，图片工具也使用此变量 |
| `MISTRAL_API_KEY` | Mistral 身份验证 | 使用 Mistral 模型 | |
| `ZAI_API_KEY` | z.ai 身份验证 | 使用 z.ai 模型 | z.ai 网页搜索服务也使用此变量 |
| `ZHIPU_API_KEY` | 智谱 Coding Plan 身份验证 | 使用 `zhipu-coding-plan` 模型提供方 | |
| `UMANS_AI_CODING_PLAN_API_KEY` | Umans AI Coding Plan 身份验证 | 使用 `umans` 模型提供方 | |
| `MINIMAX_API_KEY` | MiniMax 身份验证 | 使用 `minimax` 模型提供方 | |
| `MINIMAX_CODE_API_KEY` | MiniMax Code 身份验证 | 使用 `minimax-code` 模型提供方 | |
| `MINIMAX_CODE_CN_API_KEY` | MiniMax Code CN 身份验证 | 使用 `minimax-code-cn` 模型提供方 | |
| `OPENCODE_API_KEY` | OpenCode 身份验证 | 使用 `opencode-go` / `opencode-zen` 模型 | |
| `QIANFAN_API_KEY` | 千帆身份验证 | 使用 `qianfan` 模型提供方 | |
| `QWEN_OAUTH_TOKEN` | Qwen Portal 身份验证 | 使用 `qwen-portal` 和 OAuth 令牌 | 优先于 `QWEN_PORTAL_API_KEY` |
| `QWEN_PORTAL_API_KEY` | Qwen Portal 身份验证 | 使用 `qwen-portal` 和 API 密钥 | 在 `QWEN_OAUTH_TOKEN` 之后回退使用 |
| `ZENMUX_API_KEY` | ZenMux 身份验证 | 使用 `zenmux` 模型提供方 | 用于 ZenMux 兼容 OpenAI 和 Anthropic 的路由 |
| `COMMAND_CODE_API_KEY` | Command Code 身份验证 | 使用 `commandcode` 模型提供方 | `COMMANDCODE_API_KEY` 可作为旧版别名 |
| `CHARM_HYPER_API_KEY` | Charm Hyper 身份验证 | 使用 `charm-hyper` 模型提供方 | `HYPER_API_KEY` 可作为回退别名 |
| `VLLM_API_KEY` | vLLM 身份验证及主动启用发现 | 使用 `vllm` 模型提供方（本地 OpenAI 兼容服务端） | 对无需身份验证的本地服务端，任意非空值均可 |
| `CURSOR_ACCESS_TOKEN` | Cursor 模型提供方身份验证 | 使用 Cursor 模型提供方 | `CURSOR_API_KEY` 可作为别名 |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway 身份验证 | 使用 `vercel-ai-gateway` 模型提供方 | `VERCEL_AI_GATEWAY_API_KEY` 可作为别名 |
| `CLOUDFLARE_AI_GATEWAY_API_KEY` | Cloudflare AI Gateway 身份验证 | 使用 `cloudflare-ai-gateway` 模型提供方 | 具备 AI Gateway Run 权限的网关令牌；`/login` 会将其与路由 ID 一同保存 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI 身份验证 | 使用 `cloudflare-workers-ai` 模型提供方（Clef 裁决模型） | 具备 Workers AI Read 和 Edit 权限的 API 令牌；`CLOUDFLARE_AUTH_TOKEN` 可作为回退值 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare AI Gateway / Workers AI 账户路由 | 通过环境变量提供网关令牌或 Workers AI 令牌 | 如果账户 ID 已由 `/login` 保存，则不需要 |
| `CLOUDFLARE_GATEWAY_ID` | 选择 Cloudflare AI Gateway | 通过环境变量提供网关令牌 | 网关标识（slug），通常为 `default`；如果已由 `/login` 保存，则不需要 |
| `SNOWFLAKE_PAT` | Snowflake Cortex 身份验证 | 使用 `snowflake` 模型提供方，且未通过 `/login` 登录 | 程序化访问令牌；优先使用短期有效且有角色限制的令牌 |
| `SNOWFLAKE_ACCOUNT` | Snowflake Cortex 账户路由 | 使用 `SNOWFLAKE_PAT` | 账户标识符（`orgname-accountname`）或账户 URL；使用 `/login` 登录后不需要 |
| `ALIBABA_CODING_PLAN_API_KEY` | 阿里巴巴 Coding Plan 身份验证 | 使用 `alibaba-coding-plan` 模型提供方 | |
| `ALIBABA_TOKEN_PLAN_API_KEY` | QwenCloud Token Plan 身份验证 | 使用 `alibaba-token-plan` 模型提供方 | 此模型提供方专用的首选变量名 |
| `BAILIAN_TOKEN_PLAN_API_KEY` | QwenCloud Token Plan 身份验证 | 使用 `alibaba-token-plan` 模型提供方 | 兼容 Qwen Code 的 Token Plan 预设 |
| `CHUTES_API_KEY` | Chutes 身份验证 | 使用 `chutes` 模型提供方 | |
| `CORAL_API_KEY` | CoralBricks 身份验证（别名：`CORALBRICKS_API_KEY`） | 使用 `coralbricks` 模型提供方 | |
| `DEEPINFRA_API_KEY` | DeepInfra 身份验证 | 使用 `deepinfra` 模型提供方 | |
| `DEEPSEEK_API_KEY` | DeepSeek 身份验证 | 使用 DeepSeek 模型 | |
| `SILICONFLOW_API_KEY` | SiliconFlow 身份验证 | 使用 `siliconflow` 模型提供方 | |
| `SILICONFLOW_CN_API_KEY` | SiliconFlow（中国）身份验证 | 使用 `siliconflow-cn` 模型提供方 | |
| `KILO_API_KEY` | Kilo 身份验证 | 使用 Kilo 模型 | |
| `OLLAMA_CLOUD_API_KEY` | Ollama Cloud 身份验证 | 使用 `ollama-cloud` 模型提供方 | |
| `CLINE_API_KEY` | ClinePass 订阅及免费档身份验证 | 使用 `cline-pass` 模型提供方 | Cline 官方 API 密钥变量 |
| `YOLO_AUTO_API_KEY` | Yolo-Auto 身份验证 | 使用 `yolo-auto` 模型提供方 | 固定费率的 Qwen 模型；通过 `https://yolo-auto.com/v1/models` 验证密钥 |
| `WAFER_SERVERLESS_API_KEY` | Wafer Serverless 身份验证 | 使用 `wafer-serverless` 模型提供方 | 按量付费的 Wafer SKU；通过 `https://pass.wafer.ai/v1/models` 验证密钥 |
| `GITLAB_TOKEN` | GitLab Duo 身份验证 | 使用 `gitlab-duo` / `gitlab-duo-agent` 模型提供方 | 两个 GitLab 模型提供方读取同一令牌 |
| `BASETEN_API_KEY` | Baseten 身份验证 | 使用 `baseten` 模型提供方 | 也可通过交互式 API 密钥登录配置（`/login baseten`，密钥来自 Baseten 控制面板） |
| `COREWEAVE_API_KEY` / `WANDB_API_KEY` | CoreWeave Serverless Inference 身份验证 | 使用 `coreweave` 模型提供方 | 任一变量均可使用（回退到 W&B）。`COREWEAVE_PROJECT`（回退到 `WANDB_INFERENCE_PROJECT`）提供必需的 `OpenAI-Project` 请求头 |
| `SAKANA_API_KEY` / `FUGU_API_KEY` | Sakana AI 身份验证 | 使用 `sakana` 模型提供方 | 任一变量均可使用；`SAKANA_BASE_URL` / `FUGU_BASE_URL` 可覆盖请求的基础 URL |
| `SAMBANOVA_API_KEY` | SambaNova Cloud 身份验证 | 使用 `sambanova` 模型提供方 | 也可通过交互式 API 密钥登录配置（`/login sambanova`） |
| `DEVIN_API_KEY` | Devin 身份验证 | 使用 `devin` 模型提供方 | 也可使用交互式登录（`/login devin`，OAuth） |
| `AIAND_API_KEY` | ai& 身份验证 | 使用 `aiand` 模型提供方 | |
| `GMI_API_KEY` | GMI Cloud 身份验证 | 使用 `gmi-cloud` 模型提供方 | |
| `MODEL_API_KEY` / `META_API_KEY` | Meta Model API 身份验证 | 使用 `meta` 模型提供方 | 任一变量均可使用 |
| `INCEPTION_API_KEY` | Inception Mercury API 身份验证 | 使用 `inception` 模型提供方 | 也可通过 `/login inception` 配置，它会用只生成一个 token 的 Mercury 3 请求验证密钥（`/v1/models` 是公开端点） |
| `SINGULARITYAPI_DEV_API_KEY` | SingularityAPI 通用网关身份验证 | 使用 `singularityapi-dev` 模型提供方 | 按量付费，提供 300 多个模型；通过 `https://api.singularityapi.dev/v1/models` 验证密钥 |
| `SINGULARITYAPI_TECH_API_KEY` | SingularityAPI 预留通道身份验证 | 使用 `singularityapi-tech` 模型提供方 | 预留槽位的 DeepSeek 通道；通过 `https://api.singularityapi.tech/v1/models` 验证密钥 |
| `SCW_SECRET_KEY` | Scaleway Generative APIs 身份验证 | 使用 `scaleway` 模型提供方 | 无服务器开放权重聊天模型；通过 `https://api.scaleway.ai/v1/models` 验证密钥；`SCW_API_KEY` 可作为旧版别名 |
| `OTARI_API_KEY` | Otari 网关身份验证 | 使用 `otari` 模型提供方 | 工作区密钥；通过 `${OTARI_BASE_URL:-https://api.otari.ai/api/v1}/models` 验证 |
| `OTARI_BASE_URL` | Otari 自托管 API 根地址 | 使用 `otari` 模型提供方 | 自托管部署的 API 根地址，包含路径前缀（`https://host.example.com/api/v1`）；用于 `/login otari` 验证、模型发现和请求 |

### GitHub/Copilot 令牌 \{#githubcopilot-tokens}

| 变量 | 用途 | 说明 |
| ------------------------ | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COPILOT_GITHUB_TOKEN` | GitHub Copilot 模型提供方身份验证 | 此处不使用通用 GitHub 令牌 |
| `COPILOT_INTEGRATION_ID` | 覆盖 GitHub Copilot 客户端标识 | 默认为 `copilot-chat`（聊天接口）。请求被拒绝后，以 Copilot CLI 身份重试一次；设置此变量可固定客户端 ID 并跳过重试（[#11372](https://github.com/can1357/oh-my-pi/issues/11372)） |
| `GH_TOKEN` | 网页抓取器的 GitHub API 身份验证 | 网页抓取器在 `GITHUB_TOKEN` 之后回退使用 |
| `GITHUB_TOKEN` | 网页抓取器的 GitHub API 身份验证 | 网页抓取器先检查此变量，再检查 `GH_TOKEN` |

### 凭据代理与身份验证网关（远程凭据库） \{#auth-broker--auth-gateway-remote-credential-vault}

启用凭据代理后，OMP 会绕过本地 SQLite 凭据存储，所有 OAuth 刷新令牌和访问令牌都存放在凭据代理主机上。完整协议、CLI 接口以及 5 分钟和 15 秒的用量缓存分层见 [`auth-broker-gateway.md`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md)。

| 变量 | 用途 | 何时需要 | 说明与优先级 |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OMP_AUTH_BROKER_URL` | 远程凭据代理的基础 URL（例如 `https://broker.tailnet:8765`）；指定后使用代理模式 | 通过凭据代理解析凭据时；`omp auth-gateway serve` 也需要此变量（网关本身是凭据代理客户端） | 优先于 `auth.broker.url`（在 `config.yml` 中）。如果设置了此变量但无法解析出令牌，`resolveAuthBrokerConfig()` 会直接报错，不会回退到本地 SQLite。 |
| `OMP_AUTH_BROKER_TOKEN` | 除 `/v1/healthz` 外，向凭据代理的所有端点发送的 Bearer 令牌 | 已设置 `OMP_AUTH_BROKER_URL`，且无法从 `auth.broker.token` 或 `<config-dir>/auth-broker.token` 获取令牌 | 解析顺序：此环境变量 → `auth.broker.token`（支持通过 `$ENV_NAME` 间接引用）→ `<config-dir>/auth-broker.token`（权限模式 `0600`）。`<config-dir>` 为 `~/.omp/`（受 `PI_CONFIG_DIR` 影响）。 |
| `OMP_AUTH_BROKER_SNAPSHOT_TTL_MS` | 加密的本地凭据代理快照缓存的有效期 | 代理模式下可选 | 默认为 `3600000`（1 小时）。有效期以凭据代理的 `snapshot.generatedAt` 为起点；`0` 禁用缓存读写，每次启动都按旧方式阻塞式获取快照。 |
| `OMP_AUTH_BROKER_SNAPSHOT_CACHE` | 加密的本地凭据代理快照缓存的路径 | 代理模式下可选 | 默认为 `~/.omp/cache/auth-broker-snapshot.enc`（或等效的 XDG 缓存路径）。可用于测试、临时主机或迁移权限模式为 `0600` 的缓存文件。 |
| `OMP_AUTH_BROKER_ACCOUNT_POOL_FILE` | 限定凭据代理客户端进程可见的凭据（OAuth 账户和 API 密钥） | 代理模式下可选 | 指向 JSON 文件的路径，文件中的对象将模型提供方 ID 映射到规则。规则可以是 `identityKey` 数组（`[]` 隐藏该模型提供方的 OAuth 账户，但 API 密钥仍可见）、`true`/`false`（全部可见或全部不可见），或 `{ "accounts"?: [...], "apiKeys"?: boolean }`。未单独配置的模型提供方遵循 `"*"` 规则；如果没有此规则，不作限制。`"*": false` 将该文件变为允许列表。仅在启动时解析一次，输入无效时拒绝放行。这不是凭据代理的授权机制：直连客户端仍持有代理令牌。在 `omp auth-gateway serve` 中，这会限制该网关的客户端可以访问哪些凭据；见 [auth-broker-gateway.md](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/auth-broker-gateway.md#client-account-pools)。 |

网关没有专用环境变量，沿用 `OMP_AUTH_BROKER_*`。供连接网关的客户端使用的 Bearer 令牌存放在 `<config-dir>/auth-gateway.token`，通过 `omp auth-gateway token` 管理。

---

## 2) 各模型提供方的运行时配置 \{#2-provider-specific-runtime-configuration}

### 出站代理路由 \{#outbound-proxy-routing}

发起模型提供方的 HTTP 请求时，先应用 `NO_PROXY` / `no_proxy`，再按以下顺序解析代理：

1. `PI_PROXY_<PROVIDER>`（将模型提供方 ID 转为大写，非字母数字字符替换为 `_`，例如 `PI_PROXY_GITHUB_COPILOT`）
2. `PI_PROXY`
3. HTTPS 和 WebSocket 目标使用 `HTTPS_PROXY` / `https_proxy`；HTTP 目标使用 `HTTP_PROXY` / `http_proxy`
4. `ALL_PROXY` / `all_proxy`

模型提供方的代理解析结果在进程生命周期内缓存。目标为 localhost 时，绕过模型提供方的请求封装层。

两种 `PI_PROXY` 写法的作用范围不同：

- CLI 启动时会将 `PI_PROXY` 应用于进程全局的 `fetch`，因此它也
  涵盖在模型提供方请求封装层之外发出的请求，包括 OAuth 令牌刷新
  与登录、用量探测和模型发现。未设置该变量时，即使流式请求本身
  走代理，有区域限制的令牌端点也会在刷新时返回
  `403 Request not allowed`。
- `PI_PROXY_<PROVIDER>` 仅用于对应模型提供方的请求，并对这些请求覆盖
  `PI_PROXY`。它不覆盖上面那些不限定模型提供方的调用；如果该模型提供方屏蔽了你的地区，
  还应设置 `PI_PROXY`。

回环地址、链路本地地址、私有网段（`10/8`、`172.16/12`、`192.168/16`）及
`NO_PROXY` 匹配的目标始终绕过代理，因此本地模型服务端和 MCP 主机仍使用直连。

### 请求体压缩 \{#request-body-compression}

向模型提供方自身能解码压缩内容的端点发送请求时，大于或等于 1 KiB 的请求体会被压缩。适用端点由目录规则 `request-encodings` / `endpoint-hosts` 声明：Anthropic 官方 API（gzip）、ChatGPT Codex 后端（zstd）、以及位于 `api[.individual|.business|.enterprise].githubcopilot.com` 的 GitHub Copilot API（zstd，回退到 gzip）。代理、中转服务、models.yml 中配置的网关（即使使用内置模型提供方 ID）及其他所有主机都收到未压缩的 JSON。如果端点或其前方检查 TLS 流量的代理拒绝某种编码，而改发未压缩请求后成功，则在该进程剩余的生命周期中，对该主机禁用这种编码。

| 变量 | 行为 |
| ------------------------ | --------------------------------------------------------------------------------- |
| `PI_REQUEST_COMPRESSION` | 设为 `0`/`false`/`no`/`off` 时，所有请求体都不压缩（默认启用压缩） |

### Anthropic API 版本 \{#anthropic-api-version}

| 变量 | 行为 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_ANTHROPIC_API_VERSION` | 发送给 Anthropic 官方 API 的 `anthropic-version`（主机为 `api.anthropic.com`）可设为 `2023-06-01`（默认）或 `2026-10-21`。使用 `2026-10-21` 时，省略 `temperature`/`top_p`/`top_k`，因为该版本会拒绝这些参数。其他主机（Bedrock、Foundry、Copilot、网关及 Anthropic 兼容模型提供方）仍使用 `2023-06-01`；遇到未知值时，记录警告并使用 `2023-06-01` |

### Anthropic 消息线程 \{#anthropic-message-threads}

| 变量 | 行为 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_ANTHROPIC_MESSAGE_THREADS` | 覆盖消息线程的默认设置（`message-threads-2026-08-12`：后续轮次只发送新消息）。Claude 4.5+ 在 `api.anthropic.com` 上默认启用，其他情况默认关闭。`0` 关闭此功能；`1` 也会在其他端点（Foundry、网关）启用此功能 |

### Anthropic Foundry Gateway（Azure / 企业代理） \{#anthropic-foundry-gateway-azure--enterprise-proxy}

启用 `CLAUDE_CODE_USE_FOUNDRY` 后，Anthropic 请求切换到 Foundry 模式：

- 基础 URL 取自 `FOUNDRY_BASE_URL`（未设置时，仍回退到模型的基础 URL 或默认基础 URL）。
- 模型提供方 `anthropic` 的 API 密钥解析顺序变为：
  `ANTHROPIC_FOUNDRY_API_KEY` → `ANTHROPIC_OAUTH_TOKEN` → `ANTHROPIC_API_KEY`。
- `ANTHROPIC_CUSTOM_HEADERS` 按逗号或换行分隔解析成 `key: value`
  对，并合并到请求头中。即使
  `ANTHROPIC_BASE_URL` 指向非 Anthropic 主机（例如企业 API 网关），
  这些请求头也会转发，因此要求专用身份验证请求头的企业网关
  无需启用 Foundry 模式即可使用。
- `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`（与 Claude Code 的约定相同）会让
  模型提供方 `anthropic` 的请求省略预发布的请求体字段和对应的
  `anthropic-beta` 标记：`context_management`、测试版工具字段
  （`strict`、`defer_loading`、`eager_input_streaming`）、会话中途的工具变更、
  `output_config.format` 和 `output_config.task_budget`，以及
  `thinking.block_binding` 和 Anthropic 服务端压缩。思考档位、自适应思考、
  交错思考和扩展上下文仍保留。与 Claude Code 不同，OMP 还会从调用方提供的
  测试版标记和
  `anthropic-beta` 请求头中移除相应的标记。如果 `ANTHROPIC_BASE_URL` 网关
  拒绝这些字段，请使用此变量，无论是否启用了 Foundry 模式都有效。该变量适用的模型提供方由
  `honors-claude-code-beta-kill-switch` 兼容性配置项决定
  （即 `compat.honorsClaudeCodeBetaKillSwitch`，在 `models.yml` 中设置）。
- 可以通过环境变量注入 TLS 客户端和服务端的证书或密钥材料：
  `NODE_EXTRA_CA_CERTS`、`CLAUDE_CODE_CLIENT_CERT`、`CLAUDE_CODE_CLIENT_KEY`。
  每个变量都接受以下任一形式：
   - 指向 PEM 内容的文件路径，或
   - 内联 PEM 内容（可包含转义的 `\n` 序列）。

   `NODE_EXTRA_CA_CERTS` 对模型提供方请求（OpenAI 兼容、
   Codex、Ollama、Azure Responses、Google、Anthropic）和远程 MCP 的 HTTP/SSE
   传输生效。Bun 的 `fetch` 不会原生读取该变量，因此 OMP 将额外的 CA 证书包与
   系统根证书库一起合并进 `RequestInit.tls.ca`。即使在进程启动后
   从智能体的 `.env` 加载该变量，也会执行此合并。
   `CLAUDE_CODE_*` 提供的 mTLS 材料仍仅适用于 Anthropic Foundry。

| 变量 | 值类型 | 行为 |
| ---------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_CODE_USE_FOUNDRY` | 类布尔字符串（`1`、`true`、`yes`、`on`） | 为 Anthropic 模型提供方启用 Foundry 模式 |
| `FOUNDRY_BASE_URL` | URL 字符串 | Foundry 模式下 Anthropic 端点的基础 URL |
| `ANTHROPIC_FOUNDRY_API_KEY` | 令牌字符串 | 用于 `Authorization: Bearer <token>` |
| `ANTHROPIC_CUSTOM_HEADERS` | 请求头列表字符串 | 额外的请求头，格式为 `header-a: value, header-b: value`，也可用换行分隔。只要 `ANTHROPIC_BASE_URL` 指向非 Anthropic 主机，即使未启用 Foundry 模式也会转发。 |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` | 类布尔字符串（`1`、`true`、`yes`、`on`） | 省略预发布字段（`context_management`、测试版工具字段、任务预算、结构化输出格式、`thinking.block_binding`、服务端压缩）及对应的测试版请求头，适用于模型提供方 `anthropic` 的请求 |
| `NODE_EXTRA_CA_CERTS` | PEM 路径或内联 PEM | 用于校验服务端证书的额外 CA 证书链 |
| `CLAUDE_CODE_CLIENT_CERT` | PEM 路径或内联 PEM | mTLS 客户端证书 |
| `CLAUDE_CODE_CLIENT_KEY` | PEM 路径或内联 PEM | mTLS 客户端私钥（必须与证书配对） |

### Amazon Bedrock \{#amazon-bedrock}

| 变量 | 默认值或行为 |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_REGION` | 首选区域来源 |
| `AWS_DEFAULT_REGION` | 未设置 `AWS_REGION` 时回退使用 |
| `AWS_PROFILE` | 启用命名配置档案的身份验证路径 |
| `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | 启用 IAM 密钥身份验证路径 |
| `AWS_BEARER_TOKEN_BEDROCK` | 优先级最高的 Bearer 令牌身份验证路径；设置后跳过 AWS 配置档案和凭据链查找 |
| `AWS_CONTAINER_CREDENTIALS_RELATIVE_URI` / `AWS_CONTAINER_CREDENTIALS_FULL_URI` | 检测模型提供方时，将 Bedrock 标记为可用。凭据解析本身依次涵盖环境变量中的密钥、配置档案/SSO/`credential_process`，再到 IMDSv2 |
| `AWS_WEB_IDENTITY_TOKEN_FILE` + `AWS_ROLE_ARN` | 检测模型提供方时，将 Bedrock 标记为可用；凭据解析方面的注意事项同上面的 ECS 变量 |
| `AWS_BEDROCK_SKIP_AUTH` | 布尔标志，为 Converse 注入占位凭据（用于代理或无需身份验证的场景）；值为空时按 false 处理 |
| `HTTPS_PROXY` / `HTTP_PROXY` | 通过 Bun 原生 fetch 的代理支持生效；该模型提供方不再自带 AWS SDK 或 proxy-agent 传输 |
| `NO_PROXY` | 匹配的主机不走 Bun 的原生代理路由 |

模型提供方代码中的区域回退顺序：`options.region` → `AWS_REGION` → `AWS_DEFAULT_REGION` → `us-east-1`。

`bedrock-mantle` 模型提供方也通过 `packages/ai/src/registry/aws.ts` 检测 Bearer 令牌和 AWS 凭据来源；`AWS_BEDROCK_SKIP_AUTH` 只对 Converse 模型提供方的解析器生效，不适用于 Mantle。

原生 Bedrock 解析器实现的其他凭据链控制项：

| 变量 | 行为 |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `AWS_SESSION_TOKEN` | 与 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` 配套使用的会话令牌 |
| `AWS_SHARED_CREDENTIALS_FILE`, `AWS_CONFIG_FILE` | 覆盖共享凭据和配置的 INI 文件路径 |
| `AWS_SDK_LOAD_CONFIG` | `1`/`true` 允许在未显式指定配置档案时加载共享配置 |
| `AWS_ROLE_SESSION_NAME` | 通过 Web 身份担任角色时使用的会话名称 |
| `AWS_CONTAINER_AUTHORIZATION_TOKEN`, `AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE` | ECS 容器凭据的授权信息 |
| `AWS_EC2_METADATA_DISABLED` | `true` 禁用 IMDSv2 |
| `AWS_EC2_METADATA_SERVICE_ENDPOINT`, `AWS_EC2_METADATA_SERVICE_ENDPOINT_MODE` | 覆盖 IMDS 端点或选择 IPv6 回退路径 |

### Azure OpenAI Responses \{#azure-openai-responses}

| 变量 | 默认值或行为 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `AZURE_OPENAI_API_KEY` | 必需，除非已通过选项传入 API 密钥 |
| `AZURE_OPENAI_API_VERSION` | 默认为 `v1` |
| `AZURE_OPENAI_BASE_URL` | 直接覆盖基础 URL |
| `AZURE_OPENAI_RESOURCE_NAME` | 用于构造基础 URL：`https://<resource>.openai.azure.com/openai/v1` |
| `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` | 可选的映射字符串：`modelId=deploymentName,model2=deployment2` |

基础 URL 解析顺序：选项 `azureBaseUrl` → 环境变量 `AZURE_OPENAI_BASE_URL` → 通过选项或环境变量提供的资源名称 → `model.baseUrl`。

### Google Vertex AI \{#google-vertex-ai}

| 变量 | 是否必需 | 说明 |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT` | 是，除非已通过选项传入 | 首选项目 ID 来源 |
| `GCP_PROJECT` | 回退 | 备用项目 ID 来源 |
| `GCLOUD_PROJECT` | 回退 | 备用项目 ID 来源 |
| `GOOGLE_VERTEX_LOCATION` | 是，除非已通过选项传入 | 首选 Vertex 位置来源 |
| `GOOGLE_CLOUD_LOCATION` | 回退 | 备用 Vertex 位置来源 |
| `VERTEX_LOCATION` | 回退 | 备用 Vertex 位置来源 |
| `GOOGLE_CLOUD_API_KEY` | 视情况而定 | 直接使用 Vertex API 密钥进行身份验证；否则，在已设置项目和位置时，可以回退到 ADC 进行身份验证 |
| `GOOGLE_APPLICATION_CREDENTIALS` | 视情况而定 | 设置后，指定文件必须存在；未设置时检查 ADC 的回退路径（`~/.config/gcloud/application_default_credentials.json`） |

`GOOGLE_CLOUD_ACCESS_TOKEN`（或兼容的回退变量 `CLOUDSDK_AUTH_ACCESS_TOKEN`）提供显式的 Google OAuth 访问令牌，并跳过 ADC 令牌获取流程。

### Kimi \{#kimi}

| 变量 | 默认值或行为 |
| ---------------------- | -------------------------------------------------------- |
| `KIMI_CODE_OAUTH_HOST` | 首选 OAuth 主机覆盖值 |
| `KIMI_OAUTH_HOST` | 回退使用的 OAuth 主机覆盖值 |
| `KIMI_CODE_BASE_URL` | 覆盖 Kimi 用量查询端点的基础 URL（`usage/kimi.ts`） |

OAuth 主机解析顺序：`KIMI_CODE_OAUTH_HOST` → `KIMI_OAUTH_HOST` → `https://auth.kimi.com`。

### Kiro \{#kiro}

| 变量 | 默认值或行为 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `KIRO_API_REGION` | 未设置时，如果 API 密钥没有关联的已保存端点，OMP 会在用于初始化的区域中进行探测；设置后，发现和请求直接使用这个 AWS 区域 |

无效的 `KIRO_API_REGION` 会报错，不会静默回退。`/login kiro` 在验证粘贴的 API 密钥时也会读取此变量。参见 [Kiro](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/kiro.md)。

### OpenAI 兼容端点控制项 \{#openai-compatible-endpoint-controls}

| 变量 | 默认值或行为 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_BASE_URL` | 模型或模型提供方提供默认基础 URL 时，作为 OpenAI 兼容请求的基础 URL 回退值 |
| `MOONSHOT_BASE_URL` | 覆盖 Moonshot 的聊天端点和模型发现端点 |
| `XAI_BASE_URL` | 覆盖 `xai`/`xai-oauth` 聊天、图片生成和网页搜索使用的 xAI 端点。此变量仅在模型使用内置 `https://api.x.ai/v1` 端点时生效，因此 models.yml 中的 `baseUrl` 优先；覆盖后的端点不会收到 `xai-oauth` 的 OAuth 凭据 |
| `SAKANA_BASE_URL` / `FUGU_BASE_URL` | 覆盖 Sakana/Fugu 端点（`SAKANA_BASE_URL` 优先） |
| `PI_OPENROUTER_RESPONSES` | 默认启用 Responses API，除非设为 `0`；`0` 选择 OpenAI Completions 路由 |
| `UMANS_WEBSEARCH_PROVIDER` | 未显式指定时，选择 Umans Anthropic 网页搜索的默认服务 |

### Antigravity 兼容性 \{#antigravity-compatibility}

| 变量 | 默认值或行为 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_AI_ANTIGRAVITY_VERSION` | 覆盖自动发现的 Antigravity hub User-Agent 版本；未设置且发现失败时，回退到 `2.26.0` |
| `PI_AI_ANTIGRAVITY_CL` | 覆盖 Antigravity hub User-Agent 的构建变更列表编号（未设置时为 `1005016104`） |
| `PI_AI_ANTIGRAVITY_OS` | 覆盖 Antigravity hub User-Agent 的 os_type（未设置时使用主机系统的原生构建，对应 `darwin`、`linux` 或 `windows`；其他系统报告 `linux`） |
| `PI_AI_ANTIGRAVITY_ARCH` | 覆盖 Antigravity hub User-Agent 的 arch（未设置时使用对应构建的架构，macOS 为 `arm64`，Linux 和 Windows 为 `amd64`） |

### 提示词扰动 \{#prompt-perturbation}

| 变量 | 默认值或行为 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OMP_PROMPT_PERTURBATION` | 未设置时，如果模型的 KDL 规则设有 `prompt-perturbation #true`，则用本次安装选定的措辞改写文本池中的行；其他模型使用内置措辞。`1` 对所有模型应用扰动；`0` 对所有模型关闭扰动。 |

### GitLab Duo \{#gitlab-duo}

| 变量 | 默认值或行为 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GITLAB_CLIENT_ID` | OAuth 客户端 ID。未设置时，使用内置 GitLab OAuth 应用的客户端 ID。 |
| `GITLAB_REDIRECT_URI` | 提供给 GitLab 的确切 OAuth 重定向 URI。未设置时，本地回调使用 `http://localhost:8080/callback`，必要时回退到随机端口。URI 必须使用 HTTP 或 HTTPS；回环地址的回调必须使用 HTTP，并绑定 URI 的主机和端口。 |
| `GITLAB_DUO_NAMESPACE_ID` | 覆盖工作流命名空间。运行时选项优先；否则，命名空间和项目的发现使用当前凭据和工作目录。 |
| `GITLAB_DUO_PROJECT_ID` | 按 ID 覆盖工作流项目。运行时的 `projectId` 优先，其次是运行时的 `projectPath`；此变量优先于 `GITLAB_DUO_PROJECT_PATH`。 |
| `GITLAB_DUO_PROJECT_PATH` | 未指定运行时项目且未设置 `GITLAB_DUO_PROJECT_ID` 时，按路径覆盖工作流项目。 |
| `GITLAB_DUO_WORKFLOW_DEFINITION` | 覆盖工作流定义；运行时的 `workflowDefinition` 优先。默认为 `ambient`。 |
| `GITLAB_DUO_WORKFLOW_TRACE` | 仅当值恰好为 `1` 时启用工作流跟踪。每个跟踪事件作为一行 JSON 对象追加；忽略跟踪写入失败。 |
| `GITLAB_DUO_WORKFLOW_TRACE_FILE` | 跟踪输出路径。值会去掉首尾空白；未设置或为空时，默认使用相对于模型提供方模块解析 `../../../../.tmp/gitlab-duo-workflow-trace.log` 得到的绝对路径（源码检出目录中为 `<repo>/.tmp/gitlab-duo-workflow-trace.log`）。缺失的父目录会自动创建。 |

`GITLAB_CLIENT_ID` 和 `GITLAB_REDIRECT_URI` 影响 OAuth 登录。四个用于覆盖路由或创建的变量
（`GITLAB_DUO_NAMESPACE_ID`、`GITLAB_DUO_PROJECT_ID`、
`GITLAB_DUO_PROJECT_PATH` 和 `GITLAB_DUO_WORKFLOW_DEFINITION`）影响
`gitlab-duo-agent` 工作流的命名空间或项目解析，以及工作流的创建；它们
不会配置 OAuth。上面两个跟踪变量仅影响本地诊断
输出。如果重定向 URI 使用非回环地址，
本地回调监听器无法直接处理它，
因此必须通过粘贴授权码完成登录。

### OpenAI Codex Responses（功能与调试控制项） \{#openai-codex-responses-featuredebug-controls}

| 变量 | 行为 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_CODEX_DEBUG` | `1`/`true` 启用 Codex 模型提供方调试日志 |
| `PI_CODEX_WEBSOCKET` | `1`/`true` 启用 WebSocket 传输偏好设置 |
| `PI_CODEX_RESPONSES_LITE` | `1`/`true` 让常规推理使用 Responses Lite；`0`/`false` 强制发送标准 Responses 请求体；未设置时，常规推理默认使用完整的 Responses |
| `PI_OPENAI_STATEFUL` | 覆盖 OpenAI 平台 Responses API 的有状态串联默认设置（使用 `previous_response_id`，强制发送 `store: true`）：对 api.openai.com 默认启用，其他端点关闭 |
| `PI_CODEX_WEBSOCKET_IDLE_TIMEOUT_MS` | 正整数覆盖值（默认 `300000`） |
| `PI_CODEX_WEBSOCKET_FIRST_EVENT_TIMEOUT_MS` | 首事件超时覆盖值（默认 `300000`） |
| `PI_CODEX_WEBSOCKET_PING_INTERVAL_MS` | Ping 间隔覆盖值（默认 `10000`） |
| `PI_CODEX_WEBSOCKET_PONG_TIMEOUT_MS` | Pong 超时覆盖值（默认 `60000`） |
| `PI_CODEX_WEBSOCKET_MESSAGE_QUEUE_CAPACITY` | 消息缓冲容量覆盖值（默认 `4096`） |
| `PI_CODEX_WEBSOCKET_MAX_IDLE_REUSE_MS` | 连接可复用的最长空闲时间（默认 `30000`）；`0` 禁用空闲时长限制 |
| `PI_CODEX_WEBSOCKET_RETRY_BUDGET` | 非负整数覆盖值（默认 `5`） |
| `PI_CODEX_WEBSOCKET_RETRY_DELAY_MS` | 正整数的基础退避时长覆盖值（默认 `500`） |
| `PI_STREAM_FIRST_EVENT_TIMEOUT_MS` | 通用流式传输首事件超时；`0` 禁用 |
| `PI_STREAM_IDLE_TIMEOUT_MS` | 通用流式传输空闲超时；`0` 禁用 |
| `PI_OPENAI_STREAM_FIRST_EVENT_TIMEOUT_MS` | OpenAI 专用的首事件超时覆盖值；`0` 禁用此超时，此变量优先于通用值。`omp config set providers.streamFirstEventTimeoutSeconds <seconds>` 提供等效的持久化设置 |
| `PI_OPENAI_STREAM_IDLE_TIMEOUT_MS` | OpenAI 专用的空闲超时覆盖值；`0` 禁用此超时，此变量优先于通用值。`omp config set providers.streamIdleTimeoutSeconds <seconds>` 提供等效的持久化设置 |

### Cursor 模型提供方调试 \{#cursor-provider-debug}

| 变量 | 行为 |
| ------------------ | ------------------------------------------------------------------------ |
| `DEBUG_CURSOR` | 启用模型提供方调试日志；`2`/`verbose` 输出详细的请求载荷片段 |
| `DEBUG_CURSOR_LOG` | 输出 JSONL 调试日志的可选文件路径 |

### 提示词缓存兼容性开关 \{#prompt-cache-compatibility-switch}

| 变量 | 行为 |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_CACHE_RETENTION` | 在支持的情况下覆盖缓存保留档位（`anthropic`、`openai-responses`、Bedrock）。接受 `long`、`short` 或 `none`；其他值均忽略 |

---

## 3) 网页搜索子系统 \{#3-web-search-subsystem}

### 搜索服务凭据 \{#search-provider-credentials}

| 变量 | 使用方 |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXA_API_KEY` | Exa 搜索/MCP；也可用 `/login exa` 配置；无密钥时使用无需密钥的公共 MCP（见下文） |
| `TINYFISH_API_KEY` | TinyFish 搜索服务（必需） |
| `KEENABLE_API_KEY` | Keenable 搜索服务（自动链需要密钥；显式选择 `web/keenable` 时可以使用无需密钥的公共端点，见下文） |
| `SOFYA_API_KEY` | Sofya 搜索服务（必需） |
| `BRAVE_API_KEY` | Brave 搜索服务 |
| `DEEPSEEK_API_KEY` | DeepSeek 搜索服务（与 DeepSeek 模型共用密钥） |
| `PERPLEXITY_API_KEY` | Perplexity 搜索服务的 API 密钥模式 |
| `PERPLEXITY_COOKIES` | Perplexity 使用 Cookie 进行身份验证的搜索模式 |
| `PI_PERPLEXITY_RESPONSES` | `1` 选择 Perplexity Responses 端点，而非 Chat Completions |
| `PI_PERPLEXITY_MODEL` | Perplexity 个人订阅的模型偏好（默认 `experimental`） |
| `PI_PERPLEXITY_API_MODEL` | 覆盖 Perplexity 直连 API 的模型（默认 `sonar-pro`） |
| `FIRECRAWL_API_KEY` | Firecrawl 搜索服务（无密钥时使用无需密钥的托管搜索，见下文）和抓取阅读器后端（必需） |
| `FIRECRAWL_BASE_URL` | 覆盖 Firecrawl API 端点（`FIRECRAWL_API_URL` 是回退别名） |
| `TAVILY_API_KEY` | Tavily 搜索服务 |
| `ZAI_API_KEY` | z.ai 搜索服务（也检查 `agent.db` 中保存的 OAuth 凭据） |
| `OPENAI_CODEX_OAUTH_TOKEN` | Codex 搜索身份验证；也可使用 `openai-codex` 在 `agent.db` 中保存的 OAuth 凭据 |
| `OPENAI_API_KEY` | OpenAI Responses 搜索身份验证 |
| `MOONSHOT_SEARCH_API_KEY` / `KIMI_SEARCH_API_KEY` | 通过环境变量为 Kimi/Moonshot 搜索服务提供凭据 |
| `MOONSHOT_SEARCH_BASE_URL` / `KIMI_SEARCH_BASE_URL` | 覆盖 Kimi/Moonshot 搜索端点 |
| `KAGI_API_KEY` | Kagi 搜索服务 |
| `JINA_API_KEY` | Jina 搜索服务 |
| `PARALLEL_API_KEY` | Parallel 搜索服务；无密钥时使用无需密钥的公共 MCP（见下文） |
| `OLLAMA_CLOUD_API_KEY` | Ollama 网页搜索服务 |
| `SEARXNG_ENDPOINT`, `SEARXNG_TOKEN` | SearXNG 端点及可选的 Bearer 令牌；对应 `searxng.endpoint` / `searxng.token`，当设置未指定、为 `null` 或为空白时作为回退值 |
| `SEARXNG_BASIC_USERNAME`, `SEARXNG_BASIC_PASSWORD` | SearXNG HTTP Basic Auth 凭据；仅当对应的 `searxng.basic*` 设置未指定或为 `null` 时作为回退值（空字符串是有效凭据） |

启用 `providers.webKeyless`（默认）时，自动链可使用无需密钥的 Parallel、Exa 和 Firecrawl 托管搜索。设置 `providers.webKeyless=false` 会跳过这些无需密钥的路径，包括显式配置的 `web` 角色和回退条目；只有 `omp q --model web/exa "…"` 等逐请求选择器仍能使用它们。Keenable 只有在有凭据时才会加入自动链；显式指定 `web/keenable` 候选时可以无凭据使用其公共端点，同样受 `providers.webKeyless` 规则约束。

DuckDuckGo 搜索无需密钥。它查询不含 JavaScript 的 HTML 前端（`html.duckduckgo.com`），无需任何凭据。它也与 startpage、google、ecosia 和 mojeek 一同为无需凭据的 `public` 聚合搜索提供结果。

SearXNG 也会读取等效设置 `searxng.endpoint`、`searxng.token`、`searxng.basicUsername` 和 `searxng.basicPassword`，这些设置来自 `~/.omp/agent/config.yml`；环境变量仅作回退。

### Anthropic 网页搜索身份验证 \{#anthropic-web-search-authentication}

对于目录中的 Anthropic 模型，`searchAnthropic()` 按以下顺序使用凭据：

1. `ANTHROPIC_SEARCH_API_KEY`
2. 模型注册表为所选模型或模型提供方解析出的凭据，包括已配置的运行时凭据、已保存的 OAuth 或 API 密钥登录，以及该模型提供方通常使用的环境变量回退值

`ANTHROPIC_SEARCH_API_KEY` 是仅用于搜索的身份验证来源，不改变聊天凭据。模型 ID 和端点由所选目录模型提供，因此没有单独用来覆盖 Anthropic 搜索模型或基础 URL 的环境变量。

| 变量 | 默认值或行为 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ANTHROPIC_SEARCH_API_KEY` | 专用于 Anthropic 网页搜索请求的 API 密钥。优先于所选模型的常规凭据解析器尝试，不影响聊天补全。 |

### Perplexity OAuth 流程控制标志 \{#perplexity-oauth-flow-behavior-flag}

| 变量 | 行为 |
| ------------------- | ------------------------------------------------------------------------------- |
| `PI_AUTH_NO_BORROW` | 设置后，禁用 Perplexity 登录流程从 macOS 原生应用借用令牌的路径 |

### TypeSafe 裁决 \{#typesafe-judgments}

应用对自身状态所做的小型类型化裁决，包括 `auto` 思考档位的难度分类器、Smart 意外停止检测、Git TUI 中的 AI 暂存和 `judge()` 评估辅助函数，都使用 `judge` 模型角色。有 TypeSafe 凭据时，目录通过 `GET /v1/models` 发现账户可见的裁决模型列表：其中包括端点声明的 `jev-latest` 和 `jev-preview`，以及仅列出别名的返回结果所省略的预置 `jev-1.14.0`。角色会选择一个确切的目录模型。内置裁决链依次为 `typesafe/jev-1.14.0`、`openrouter/typesafe/jev-1.14`、`tiny`、`smol`、`default`，最后是当前会话模型。裁决链一旦到达原生 System One 模型（直连 TypeSafe 或经由 OpenRouter），就只回退到其他原生模型。如果所有原生裁决模型都失败，裁决也会失败，不会降级到提示词裁决的聊天模型或设备端模型。每个失败的候选都会记录为 `judgment candidate failed`。配置 `modelRoles.judge` 或 `retry.fallbackChains.judge` 可选择 `typesafe/jev-preview` 或其他裁决候选模型。

| 变量 | 默认值或行为 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY` | 用于发现和 System One 请求的 TypeSafe API 密钥；也可用 `/login typesafe` 配置 |
| `TYPESAFE_BASE_URL` | 覆盖 API 根地址（默认 `https://api.typesafe.ai`），用于模型发现、`/login` 验证和 System One 请求 |
| `OPENAI_API_KEY` | 也用于 OpenAI Decisions 裁决模型 `openai/gpt-6-luna-decisions` 的身份验证（通过 `POST /v1/decisions` 使用 GPT-6 Luna）；将该模型分配给 `judge` 角色即可使用 |
| `GEMINI_API_KEY` | 也用于 Gemini Decisions 裁决模型 `google/gemini-decision-1` 的身份验证（通过 `POST /v1beta/decisions` 使用 Gemini Decision 1）；将该模型分配给 `judge` 角色即可使用 |
| `CLOUDFLARE_API_TOKEN` | 用于 Cloudflare Workers AI Clef 裁决模型（`cloudflare-workers-ai/@cf/cloudflare/clef`、`.../clef-flash`）的身份验证，需搭配 `CLOUDFLARE_ACCOUNT_ID`；也可用 `/login cloudflare-workers-ai` 配置 |
| `LIQUID_API_KEY` | 用于 Liquid AI 裁决模型（`liquid/d1.2`、`liquid/d1.2-ultra`，以及已弃用的 `liquid/d1.1` 和 `liquid/d1-ultra`）的身份验证；也可用 `/login liquid` 配置 |
| `NACE_API_KEY` | 用于 Nace Drex 裁决模型（`nace/drex-max-v1.1`、`nace/drex-max-finance`、`nace/drex-v2.0`）的身份验证；也可用 `/login nace` 配置 |
| `TYPESAFE_DEFAULT_MODEL` | 调用方未传入模型时，独立的 `pi-ai` TypeSafe 客户端使用的默认模型（默认 `jev-latest`）。coding-agent 应用会传入 `judge` 角色选中的模型，因此此变量不会覆盖应用的角色选择或发现的模型 ID。 |

---

## 4) Python 工具与内核运行时 \{#4-python-tooling-and-kernel-runtime}

| 变量 | 默认值或行为 |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `PI_PY` | 覆盖 Python 设置的布尔标志；未设置或为空时，使用 `eval.py`（默认启用） |
| `PI_JS` | 覆盖 JavaScript 设置的布尔标志；未设置或为空时，使用 `eval.js`（默认启用） |
| `PI_PYTHON_SKIP_CHECK` | 值为真时跳过 Python 解释器可用性检查（运行器子进程仍按需启动） |
| `PI_PYTHON_IPC_TRACE` | 值为真时记录与 Python 运行器子进程交换的 NDJSON 帧 |
| `VIRTUAL_ENV` | 解析 Python 运行时时优先级最高的 venv 路径 |
| `CONDA_PREFIX` | Python 环境回退路径，优先级低于 `VIRTUAL_ENV`，高于本地 `.venv` / `venv` 目录 |

Python 子进程过滤会阻止传入常见的 API 密钥，只允许安全的基础变量和带有 `LC_`、`XDG_` 或 `PI_` 前缀的变量。

shell 子进程采用单独的过滤逻辑（`packages/utils/src/env.ts`）：移除项目 dotenv 值，不使用 Python 的环境变量允许列表。

---

## 5) 智能体与运行时行为开关 \{#5-agentruntime-behavior-toggles}

| 变量 | 默认值或行为 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PI_SMOL_MODEL` | 临时覆盖 `smol` 模型角色（CLI 的 `--smol` 优先） |
| `PI_SLOW_MODEL` | 临时覆盖 `slow` 模型角色（CLI 的 `--slow` 优先） |
| `PI_PLAN_MODEL` | 临时覆盖 `plan` 模型角色（CLI 的 `--plan` 优先） |
| `PI_NO_TITLE` | 设置为任何非空值时，禁止在收到第一条用户消息后自动生成会话标题 |
| `PI_MOTION` | `tui.motion` 动画预设：`full`、`reduced` 或 `none`。`--motion` 优先 |
| `PI_SPINNER_INTERVAL` | `tui.spinnerInterval`：加载动画帧之间的毫秒数（`0` 为静态）。`--spinner-interval` 优先 |
| `PI_MAX_FPS` | `tui.maxFps`：重绘上限，单位为帧/秒，范围 `1` 到 `120`。`--max-fps` 优先 |
| `OMP_BUILD_LABEL` | 自由格式名称，收拢成一行并取前 80 个字符。该进程写入每条会话记录时，会将名称与构建信息一同保存，以区分自定义或实验构建生成的会话记录。`/session` 会显示它 |
| `PI_TINY_DEVICE` | 本地小型模型的推理后端，覆盖 `providers.tinyModelDevice` 设置。默认 CPU。ONNX 提供程序可选 `cpu`、`gpu`、`webgpu`、`auto`、`cuda`、`dml`、`coreml`、`wasm`、`webnn`、`webnn-gpu`、`webnn-cpu`、`webnn-npu`；也可用 `mlx` / `metal` 在 Apple Silicon 上通过 mlx-lm 运行 MLX 权重 |
| `PI_TINY_DTYPE` | 本地小型模型的 ONNX 量化或精度，覆盖 `providers.tinyModelDtype` 设置。默认使用各模型自带的数据类型，当前为 `q4`。支持 `auto`、`fp32`、`fp16`、`q8`、`int8`、`uint8`、`q4`、`bnb4`、`q4f16`、`q2`、`q2f16`、`q1`、`q1f16` |
| `PI_NO_INTERLEAVED_THINKING` | 为 `1` 时禁用 Anthropic 的交错思考预算行为，对旧版思考模式改用扩大输出 token 预算的方式 |
| `PI_NO_THINKING_LOOP_GUARD` | 为 `1` 时禁用模型思考循环防护 |
| `NULL_PROMPT` | 为 `true` 时，系统提示词构建器返回空字符串 |
| `PI_BLOCKED_AGENT` | 在 task 工具中阻止某一类子代理 |
| `PI_TASK_MAX_OUTPUT_BYTES` | 每个子代理最多捕获的输出字节数，默认 `500000` |
| `PI_TASK_MAX_OUTPUT_LINES` | 每个子代理最多捕获的输出行数，默认 `5000` |
| `PI_WALK_WORKERS` | `omp-xfs` 并行遍历所用的工作线程数，包括 grep、glob、模糊查找、AST 发现及 shell 的 `rg` / `grep`。正数 `N` 表示使用 `N` 个工作线程，调用线程为线程 0；未设置或为 `0` 时使用各文件系统默认值（macOS 为 4、Linux 为 8、其他系统及提供程序为 4）。上限取决于可用并行度。此变量由 `PI_GREP_WORKERS` 更名而来，不再读取旧名称 |
| `PI_TIMING` | 设置为任何非空值时，通过 `logger.printTimings()` 向**标准错误**输出分层计时跨度树。交互模式在智能体就绪时打印一次（在终端界面启动前），输出模式在完成整批提示词后打印。输出模式的提示词由 `print:prompt:initial` / `print:prompt:next` 跨度包裹，每条用户消息各占一行。交互模式下用 `PI_TIMING=x` 会在打印后立即以状态码 0 退出，只用于衡量冷启动。`PI_TIMING=full` 列出每个模块加载条目，而不只列出前 N 项 |
| `PI_DEBUG_STARTUP` | 设置为任何非空值时，每个启动阶段开始或结束都会向**标准错误**同步发送一行 `[startup] <phase>:start` / `:done` 标记，包括命令模块导入（`cli:load:<name>`）和原生附加模块的提取及 `dlopen`（`native:*`）。`PI_TIMING` 只在启动完成后打印，而这些标记在进程卡死时也会保留。标准错误的最后一行指出进程卡在哪个阶段。可以与 `PI_TIMING` 同用；标记与跨度树采用相同的阶段名称 |
| `OMP_LOG_LEVEL` | 写入 `logs/omp.<date>.<pid>.log`，以及写入使用 stdout 记录日志的服务（`omp auth-broker serve`）的最详细级别。可用值为 `error`、`warn`、`info`、`debug`，默认记录所有级别。文件记录分批写入，每秒或每 64 KiB 最多写一次；`warn` 和 `error` 立即写入，进程退出、信号及致命错误的处理路径会写出其余记录 |
| `PI_PACKAGE_DIR` | 覆盖包资源基础目录的解析，用于 `docs/`、`examples/` 和 `CHANGELOG.md` |
| `OMP_SKIP_SETUP` | 除 `0`、`false` 或 `no` 外，任何非空值都会跳过自动交互式设置界面；显式强制运行设置时忽略此变量 |
| `PI_DISABLE_LSPMUX` | 为 `1` 时禁用 lspmux 检测和集成，强制直接启动 LSP 服务器 |
| `PI_RPC_EMIT_TITLE` | 类布尔标志，用于启用 RPC 模式下的标题事件 |
| `PUPPETEER_EXECUTABLE_PATH` | 覆盖 Eval 浏览器运行时使用的 Chromium 可执行文件 |
| `LITELLM_BASE_URL` | LiteLLM 代理的后备基础 URL，未设置时为 `http://localhost:4000/v1`。显式的 `providers.litellm.baseUrl` / `models.yml` 配置优先 |
| `BIFROST_BASE_URL` | Bifrost 网关的后备基础 URL，未设置时为 `http://localhost:8080/v1`。显式的 `providers.bifrost.baseUrl` / `models.yml` 配置优先 |
| `MODAL_BASE_URL` | Modal 推理服务的后备基础 URL，未设置时为 `https://inference.us-west.modal.direct/v1`。只指定端点来源时会在其后追加 `/v1`；显式的 `providers.modal.baseUrl` / `models.yml` 配置优先 |
| `LM_STUDIO_BASE_URL` | 覆盖隐式发现 LM Studio 时使用的默认基础 URL，未设置时为 `http://127.0.0.1:1234/v1` |
| `OLLAMA_BASE_URL` | 覆盖隐式发现 Ollama 时使用的默认基础 URL；未设置时先用 `OLLAMA_HOST`，再回退到 `http://127.0.0.1:11434` |
| `OLLAMA_HOST` | `OLLAMA_BASE_URL` 未设置时用于隐式发现 Ollama 的主机。接受 `127.0.0.1:11434` 或 `http://host:11434` 等 Ollama 格式的值 |
| `OLLAMA_CONTEXT_LENGTH` | 隐式发现 Ollama 时覆盖上下文窗口的正整数，只影响 OMP 的上下文预算，不改变 Ollama 运行时的 `num_ctx` |
| `LLAMA_CPP_BASE_URL` | 覆盖隐式发现 Llama.cpp 时使用的默认基础 URL，未设置时为 `http://127.0.0.1:8080` |
| `PI_EDIT_VARIANT` | 值有效时强制使用指定的编辑工具变体（`patch`、`replace`、`hashline`、`apply_patch`、`sloppy`），忽略无效值（包括 `auto`）。匹配的 `edit.modelVariants` 条目仍优先；`magic` 让 `edit` 接收对修改的描述；`none` 移除编辑工具并保持 `bash` 启用 |
| `PI_EDIT_FUZZY` | `1` / `true` 强制启用编辑模糊匹配，`0` / `false` 强制关闭。`auto` 或其他值均忽略，采用 `edit.fuzzyMatch` |
| `PI_EDIT_FUZZY_THRESHOLD` | 模糊匹配相似度阈值，范围 `[0, 1]`，覆盖 `edit.fuzzyThreshold`。忽略 `auto`、非数字或超出范围的值 |
| `PI_INTENT_TRACING` | 覆盖工具意图元数据的布尔标志。未设置或为空时回退到 `tools.intentTracing`，该设置未指定时仅在交互式终端界面默认开启。`PI_INTENT_TRACING=1` 在输出、RPC 和 ACP 模式中启用它 |
| `PI_INTENT_DESC` | 替换工具 schema 中注入的意图字段说明，默认为 `concise intent`。未设置或为空时保留默认值 |
| `PI_INTENT_PROMPT` | 替换系统提示词中意图字段的指引行，即 ``Most tools take `i`: `` 之后的文本。未设置或为空时保留默认值 |
| `PI_STRICT_EDIT_MODE` | 为 `1` 时禁用针对特定模型的内置编辑模式回退，因此采用已配置的全局 `edit.mode`，除非 `PI_EDIT_VARIANT` 或 `edit.modelVariants` 覆盖它 |
| `PI_FORCE_IMAGE_PROTOCOL` | 在使用图像协议的场合强制使用已支持的协议（`kitty`、`iterm2` / `iterm`、`sixel`、`none`）。在 tmux 内设置 `kitty` 也会启用 Kitty Unicode 占位符布局，除非通过 `PI_KITTY_PLACEHOLDERS=0` 或 `PI_NO_KITTY_PLACEHOLDERS=1` 禁用 |
| `PI_ALLOW_SIXEL_PASSTHROUGH` | 在 `PI_FORCE_IMAGE_PROTOCOL=sixel` 时允许 SIXEL 直通 |
| `PI_NO_PTY` | 为 `1` 时禁用 Bash 工具的交互式 PTY 路径 |
| `OMP_MCP_TIMEOUT_MS` | 覆盖所有 MCP 服务器的客户端请求超时及输出模式的就绪等待超时，单位为毫秒，默认 `30000`。`0` 禁用两种超时，此时输出模式可能无限等待服务器。负数或非数字值会被忽略并产生警告，改用各服务器的配置或默认值 |
| `OMP_MCP_STARTUP_TIMEOUT_MS` | 初始 MCP 发现窗口，单位为毫秒，覆盖 `mcp.startupTimeoutMs`（默认 `250`）。`0` 等待初始连接尝试全部结束；无效值会记录并忽略。输出模式另行等待服务器全部就绪，再启动第一轮 |
| `OMP_MCP_REQUIRE_READY` | 设置为 `1` 后，若任何已配置的 MCP 服务器仍在等待或已失败，输出模式会在第一轮之前以状态码 1 退出。不设置时，系统在标准错误上分别警告不可用的服务器，并继续该轮 |
| `PI_DISABLE_UUTILS_BUILTINS` | 非空且不是 `0` / `false` 时，禁用 Bash 工具的 uutils 内置命令。`shell.env.PI_DISABLE_UUTILS_BUILTINS` 优先 |
| `PI_TERMINAL_OWNER_PID` | 交互式终端界面在启动时将其设为自己的进程 ID，所运行的每条命令都会继承。若某个 omp 的进程 ID 与之不同，就不会自动打开 Tern 或 cmux 浏览器标签页，以免它们浮在所有者窗格上方。不要手动设置 |
| `OMP_NO_WEBP` | 为 `1` 或 `true`（不区分大小写）时，图像缩放不选择 WebP 格式 |
| `MNEMOPI_EMBEDDING_MODEL` | `mnemopi.embeddingModel` 的后备嵌入模型。设置未指定、为 `null` 或为空白时使用本变量，否则设置优先 |
| `PI_AUTO_QA` | 控制自动注入和记录工具问题报告的布尔标志，优先级最高。除了 `1` / `y` / `true` / `yes` / `on`，任何其他非空值均会禁用；未设置或为空时采用 `dev.autoqa` 设置 |
| `PI_AUTO_QA_PUSH` | `1` / `true` 在无界面或非交互环境中跳过同意对话框，强制记录要推送的工具问题 |
| `PI_AUTO_QA_PUSH_URL` | 覆盖自动 QA 问题报告的推送端点，优先于 `dev.autoqaPush.endpoint` |
| `PI_AUTO_QA_PUSH_TOKEN` | 覆盖自动 QA 问题报告推送使用的 Bearer 令牌，优先于 `dev.autoqaPush.token` |
| `PI_BROWSER_RELAY` | 浏览器中继的禁用或启用开关：`0` / `1`，覆盖 `browser.relay` 设置。`only` 由扩展的原生宿主为侧栏会话设置，将中继作为会话唯一的浏览器。所有打开操作（包括子代理发起的操作）都使用你的 Chrome，且拒绝任何不是 `"relay"` 的 `app`。Eval 的浏览器 API 需要时，中继会自动启动 |
| `PI_BROWSER_RELAY_KEEP_FRONT` | macOS 上，`0` 会阻止中继在 omp 向中继标签页的输入打开弹窗时，把你的应用带回前台。中继启动时读取，默认开启 |
| `PI_BROWSER_WEBKIT` | omp 自带无头 WebKit 浏览器的开关：`0` / `1`。安装其引擎时，该浏览器为默认浏览器。覆盖 `browser.webkit` 设置，`0` 也会拒绝 `app: "webkit"`。对 `app: "webkit"`，默认位置缺少引擎时会下载；未安装任何浏览器时，也会先下载该引擎，再尝试 Chrome for Testing。没有该引擎时使用托管 Chromium |
| `PI_BROWSER_WEBKIT_PATH` | omp 的 WebKit 引擎位置：可以是宿主可执行文件（文件路径按原样使用），也可以是包含 `ABHost` 的 ABKit 引擎目录（Windows 下为 `ABHost.exe`）。优先于 `browser.webkitPath` 设置和已安装的引擎（`~/.o2/lib/abkit/ABHost`，Windows 下为 `ABHost.exe`）。引擎缺失时，omp 只下载到默认位置，不下载到本变量指定的位置 |
| `PI_SPOTLIGHT_EXPERIMENT` | 以布尔值覆盖 `spotlight.experiment.enabled`（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_HOLDOUT` | 覆盖 `spotlight.experiment.holdout`：Spotlight 实验会从原本要裁剪的结果中随机保留这一比例（`0` 到 `1`），向模型展示未经裁剪的输出。忽略 `0` 到 `1` 之外的值（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_SCORE_FREE` | 覆盖 `spotlight.experiment.scoreFree`：在未被保留的结果中，有这一比例（`0` 到 `1`）由 Spotlight 实验按无评分规则处理，不调用 Spotlight。忽略 `0` 到 `1` 之外的值（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `PI_SPOTLIGHT_TOOLS` | 覆盖 `spotlight.experiment.tools`：用逗号分隔的工具名，Spotlight 实验会处理和记录这些工具的结果（`*` 表示所有工具）。未匹配任何工具的值会被忽略（[Spotlight 实验](./settings.md#spotlight-experiment)） |
| `STENCIL_SPOTLIGHT_URL` | 覆盖 Spotlight 排序端点 `spotlight.url`，默认 `https://cloud.stencil.so/v1/spotlight` |
| `OMP_DAEMON_IDLE_GRACE_MS` | 最后一个 `omp` 客户端断开后，守护进程代理等待多少毫秒再关闭，并停止所管理的未分离守护进程，例如用 Bash 工具的 `name` 启动的服务。默认 `3000`。`omp` 进程启动代理时读取一次，用十进制 `parseInt` 解析数字前缀（`5s` 读作 `5`，`2.5` 读作 `2`）。`0` 表示最后一个客户端断开时立即关闭代理；负数或没有起始数字的值使用默认值 |

### Hindsight 记忆后端 \{#hindsight-memory-backend}

每个受支持的环境变量覆盖对应的 `hindsight.*` 设置，而该设置优先于内置默认值。字符串值会去掉首尾空白，空白值会忽略。布尔值遵循前述由设置支持的标志规则：空值忽略；`1`、`y`、`true`、`yes` 和 `on`（全小写或全大写）表示真，其他值均表示假。整数值用十进制 `parseInt` 解析前缀（`5000ms` 读作 `5000`，`2.5` 读作 `2`）；空值或非数字值忽略，不限制解析所得整数的范围。枚举值必须匹配下列小写值之一，忽略首尾空白；无效值会忽略。

| 变量 | 覆盖的设置 | 接受的值或内置默认值 |
| --- | --- | --- |
| `HINDSIGHT_API_URL` | `hindsight.apiUrl` | 非空字符串；默认 `http://localhost:8888` |
| `HINDSIGHT_API_TOKEN` | `hindsight.apiToken` | 非空字符串；默认未设置 |
| `HINDSIGHT_BANK_ID` | `hindsight.bankId` | 非空字符串；默认未设置，由所选作用域模式推导记忆库 |
| `HINDSIGHT_BANK_MISSION` | `hindsight.bankMission` | 非空字符串；默认空字符串 |
| `HINDSIGHT_RETAIN_MODE` | `hindsight.retainMode` | `full-session` 或 `last-turn`；默认 `full-session` |
| `HINDSIGHT_RECALL_BUDGET` | `hindsight.recallBudget` | `low`、`mid` 或 `high`；默认 `mid` |
| `HINDSIGHT_AUTO_RECALL` | `hindsight.autoRecall` | 布尔值；默认 `true` |
| `HINDSIGHT_AUTO_RETAIN` | `hindsight.autoRetain` | 布尔值；默认 `true` |
| `HINDSIGHT_SCOPING` | `hindsight.scoping` | `global`、`per-project` 或 `per-project-tagged`；默认 `per-project-tagged` |
| `HINDSIGHT_DEBUG` | `hindsight.debug` | 布尔值；默认 `false` |
| `HINDSIGHT_RECALL_MAX_TOKENS` | `hindsight.recallMaxTokens` | 整数；默认 `1024` |
| `HINDSIGHT_RECALL_CONTEXT_TURNS` | `hindsight.recallContextTurns` | 整数；默认 `1` |
| `HINDSIGHT_RECALL_MAX_QUERY_CHARS` | `hindsight.recallMaxQueryChars` | 整数；默认 `800` |
| `HINDSIGHT_RETAIN_EVERY_N_TURNS` | `hindsight.retainEveryNTurns` | 整数；默认 `3` |
| `HINDSIGHT_REQUEST_TIMEOUT_MS` | `hindsight.requestTimeoutMs` | 整数毫秒；默认 `30000` |
| `HINDSIGHT_REFLECT_TIMEOUT_MS` | `hindsight.reflectTimeoutMs` | 整数毫秒；默认 `120000` |
| `HINDSIGHT_RECALL_TIMEOUT_MS` | `hindsight.recallTimeoutMs` | 整数毫秒；默认 `30000` |
| `HINDSIGHT_RETAIN_TIMEOUT_MS` | `hindsight.retainTimeoutMs` | 整数毫秒；默认 `60000` |

CLI 使用 `--no-pty` 时，也会在内部设置 `PI_NO_PTY`。

---

## 6）存储和配置根路径 \{#6-storage-and-config-root-paths}

这些变量影响编码智能体在何处保存数据，以及加载哪些仅对当前进程生效的配置叠加层。

| 变量 | 默认值或行为 |
| --- | --- |
| `OMP_PROFILE` | 命名配置档案的正式选择变量。即使显式设为空，也优先于 `PI_PROFILE` |
| `PI_PROFILE` | 旧版配置档案选择变量，仅在 `OMP_PROFILE` 未定义时使用 |
| `PI_CONFIG_DIR` | 用户主目录下的配置根目录名，默认 `.omp` |
| `PI_CODING_AGENT_DIR` | 仅为默认配置档案完整覆盖智能体目录；命名配置档案忽略它 |
| `PI_CODING_AGENT_SESSION_DIR` | 覆盖初始会话目录，由启动参数解析读取 |
| `PI_SESSION_ORIGIN` | `chrome` 由 omp 扩展的原生宿主为侧栏对话设置，把该进程启动的会话标记为侧栏会话。终端的恢复选择器、最近会话、`--continue` 和 ACP 会话列表会跳过它们。`--resume <id\|path>` 仍可打开这类会话，且进程不会写入终端续接记录 |
| `PI_NATIVES_DIR` | 覆盖原生附加模块的解包和暂存根目录，优先于 XDG 和默认路径。加载器追加 `<version>`。去掉首尾空白，展开 `~` 并规范化；空值或相对路径会忽略。它也会移动已下载的 tree-sitter 语法文件（`grammars/`），不移动会话、插件或其他数据。必须仅允许运行 `omp` 的用户写入，因为已存在且大小符合预期的模块会直接复用，不重新解包，而版本只在加载后检查 |
| `PI_CONFIG_FILES` | 配置叠加层的路径列表，分隔符在 Unix 为 `:`，Windows 为 `;`。按序加载，早于显式的 `--config` 叠加层 |
| `CLAUDE_CONFIG_DIR` | 覆盖 Claude Code 用户配置目录，去掉首尾空白后，相对于进程工作目录解析。也将 Claude 的 `.claude.json` 改到 `<override>/.claude.json`，不改变项目的 `.claude` 目录 |
| `OMP_AUTORESEARCH_DB_DIR` | 覆盖各项目的自主研究数据库及项目产物根目录，见[自主研究](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/autoresearch.md) |
| `XDG_DATA_HOME`、`XDG_STATE_HOME`、`XDG_CACHE_HOME` | 在 macOS 或 Linux 上，只有目标 `omp` 根目录（或命名配置档案的根目录）已存在时，才重定向相应的 OMP 路径 |
| `PWD` | 路径辅助函数匹配规范的当前工作目录时使用 |
| `OMP_WORKTREE_DIR` | 覆盖由智能体管理的工作树目录，默认 `~/.omp/wt`。必须为绝对路径或相对于 `~` 的路径，忽略其他相对路径。优先于 `worktree.base` 设置 |
| `OMP_GITHUB_CACHE_DB` | 覆盖 GitHub 视图缓存数据库路径，默认 `~/.omp/cache/github-cache.db` |
| `PI_BUILD_URL` | 提供独立二进制文件的构建服务来源，默认 `https://build.stencil.so`，末尾斜杠会移除。二进制安装中的 `omp update`、仅发布二进制的版本接管，以及编译版二进制启动时的更新检查，都会请求 `<origin>/api/products/omp/latest/<target>?channel=stable\|canary`。按响应给出的大小和 SHA-256 验证下载；提供相对于已安装二进制的补丁时，使用该补丁。安装脚本（`install.sh`、`install.ps1`）也从同一来源下载 |
| `PI_GRAMMARS_URL` | 按需获取 WebAssembly tree-sitter 语法文件的基础 URL，默认 `https://github.com/stencil-hq/wasm-grammars/releases/download`。资源按 `<base>/<release>/<file>.zst` 获取，使用附加模块锁定的 SHA-256 验证后，写入 `<natives dir>/grammars`（`~/.omp/natives/grammars`） |

---

## 7）Shell 与工具执行环境 \{#7-shelltool-execution-environment}

适用于 `packages/utils/src/procmgr.ts` 和编码智能体的 Bash 工具集成。

| 变量 | 行为 |
| --- | --- |
| `PI_BASH_NO_CI` | 阻止向启动的 shell 环境自动注入 `CI=true` |
| `CLAUDE_BASH_NO_CI` | `PI_BASH_NO_CI` 的旧版后备别名 |
| `PI_BASH_NO_LOGIN` | 非空值禁用 POSIX 登录 shell 模式（用 `-c` 代替 `-l -c`），并为 PowerShell 添加 `-NoProfile`；cmd.exe 始终使用 `/c` |
| `CLAUDE_BASH_NO_LOGIN` | `PI_BASH_NO_LOGIN` 的旧版后备别名 |
| `PI_SHELL_PREFIX` | 可选的命令前缀封装 |
| `CLAUDE_CODE_SHELL_PREFIX` | `PI_SHELL_PREFIX` 的旧版后备别名 |
| `VISUAL` | 首选的外部编辑器命令 |
| `EDITOR` | 后备的外部编辑器命令 |

`PI_BASH_NO_CI`、`PI_BASH_NO_LOGIN` 和 `PI_SHELL_PREFIX` 在正式变量未设置或为空时，使用各自的 `CLAUDE_*` 别名。这些设置检查字符串是否非空，不解析为布尔值：即使是 `0` 或 `false`，也会启用对应的禁止 CI 注入或禁用登录 shell 功能。

### 由 `bash` 工具设置 \{#set-by-the-bash-tool}

智能体通过 `bash` 工具运行的每条命令，包括前台、后台、PTY、ACP 客户端终端和通过 `name` 启动的服务，都会收到当前会话标识及运行它的工具调用 ID：

| 变量 | 值 |
| --- | --- |
| `PI_SESSION_ID` | 当前会话 ID |
| `PI_SESSION_FILE` | 当前会话 JSONL 文件的绝对路径。未持久化时为空（`--no-session`） |
| `PI_TOOL_CALL_ID` | 运行这条命令的 `bash` 工具调用 ID |

每次工具调用开始时读取这些值。因此，执行 `/fork`、`/new` 和 `/resume` 后，下一次工具调用使用新的会话；已在执行中的调用则保留它开始时的会话。这些变量始终设置，因此空值也会覆盖从父 omp 进程继承的旧值。用户的 `!` 命令不会收到它们。

智能体直接调用 `bash` 时，`PI_TOOL_CALL_ID` 与 `PI_SESSION_FILE` 中的 `toolCall` 条目匹配；子代理的调用则在它自己的会话记录中。通过工具桥接从 `eval` 单元发起的 `bash` 调用会得到桥接层生成的 ID（`js-bash-…`），会话记录中的条目不携带该 ID，而是记录 `eval` 调用。

```bash
echo "$PI_SESSION_ID"
```

---

## 8）界面、主题与会话检测（自动检测的环境变量） \{#8-uithemesession-detection-auto-detected-env}

这些变量作为运行时信号读取，通常由终端或操作系统设置，而非手动配置。

| 变量 | 用途 |
| --- | --- |
| `COLORTERM`、`TERM`、`WT_SESSION` | 颜色能力检测（主题颜色模式） |
| `COLORFGBG` | 自动判断终端背景是深色还是浅色 |
| `TERM_PROGRAM`、`TERM_PROGRAM_VERSION`、`TERMINAL_EMULATOR` | 系统提示词或上下文中的终端标识 |
| `TMUX_PANE`、`CMUX_SURFACE_ID`、`KITTY_WINDOW_ID`、`TERM_SESSION_ID`、`WT_SESSION` | 每个终端的稳定会话续接记录 ID |
| `SHELL`、`ComSpec`、`TERM_PROGRAM`、`TERM` | 系统信息诊断 |
| `APPDATA`、`XDG_CONFIG_HOME` | 解析 lspmux 配置路径 |
| `HOME` | 缩短 MCP 命令界面显示的路径 |

`COPILOT_HOME` 覆盖 GitHub Copilot 配置目录（默认 `~/.copilot`），`COPILOT_CUSTOM_INSTRUCTIONS_DIRS` 提供以逗号分隔的其他指令目录。`JS_DEBUG_DAP_SERVER` 选择现有的 JavaScript 调试适配器服务器；`XDG_DATA_HOME` 也参与随附调试器的发现。

---

## 9）终端界面运行时标志（共享包，影响编码智能体的界面） \{#9-tui-runtime-flags-shared-package-affects-coding-agent-ux}

| 变量 | 行为 |
| --- | --- |
| `PI_NOTIFICATIONS` | `off` / `0` / `false` 禁用桌面通知 |
| `PI_TUI_WRITE_LOG` | 设置后将终端界面写入操作记入文件。OSC 52 剪贴板写入只记录载荷长度，不记录内容 |
| `PI_TUI_RAW_BACKSPACE_IS_CTRL` | 为 `1` 时，将原始 `0x08` 解读为 Ctrl+Backspace 而非 Backspace。经由 SSH 或容器跳转、无法辨识 Windows Terminal 客户端时使用 |
| `PI_HARDWARE_CURSOR` | 为 `1` 时启用硬件光标模式 |
| `PI_NO_SYNC_OUTPUT` | 设置为任何非空值时，禁止用 DEC 2026 包裹同步输出，但保留终端界面的自动换行防护 |
| `PI_NO_DECCARA` | 设为真值时，禁用 Kitty 的 DECCARA 矩形 SGR 背景填充，强制用填充后的字符串渲染 |
| `PI_NO_GLYPH_PROTOCOL` | 为 `1` 时跳过 Glyph Protocol 握手（APC `25a1`），使 nerd 预设的图标仅来自终端自身的字体，不使用 omp 在 Rio 或 Ghostty 上通过终端注册的轮廓 |
| `PI_TUI_NATIVE` | Tern Surface Protocol 探测：`0` 从不探测，始终使用 ANSI 逐行渲染器；`1` 即使在终端复用器和测试运行时也探测。未设置时探测每个直连终端，只有收到 `hello` 回复才切换到原生渲染 |
| `PI_TUI_TSP_RECORD` | JSONL 文件路径，记录收发的每条 Tern Surface Protocol 消息及其时间戳 |
| `PI_TUI_NATIVE_STATS` | 为 `1` 时，以 debug 级别记录每个原生帧的操作数及 `rows` 回退次数 |
| `PI_DEBUG_REDRAW` | 为 `1` 时启用重绘调试日志 |
| `PI_FORCE_IMAGE_PROTOCOL` | 强制终端图像协议检测结果（`kitty`、`iterm2` / `iterm`、`sixel`、`none`）。在终端复用器内设置 `kitty`，也会启用 Kitty Unicode 占位符布局，除非由 `PI_KITTY_PLACEHOLDERS=0` 或 `PI_NO_KITTY_PLACEHOLDERS=1` 禁用 |
| `PI_KITTY_PLACEHOLDERS` | `1` 强制启用 Kitty Unicode 占位符布局，`0` 强制关闭。在终端复用器内，只在确认外层终端支持 Kitty `U=1` 占位符后才用 `1`，否则 U+10EEEE 可能直接显示为私用区方框 |
| `PI_NO_KITTY_PLACEHOLDERS` | `1` 强制禁用 Kitty Unicode 占位符布局，优先于 `PI_KITTY_PLACEHOLDERS` |
| `PI_TUI_RESIZE_IN_PLACE` | `1` / `true` 强制原地调整大小（不借用备用屏幕，不用 ED3 重新换行）；`0` / `false` 强制使用备用屏幕的快速路径。Warp 默认开启，因为它会在切换备用屏幕时重新报告尺寸。ConPTY 宿主（Windows 及经 `wslhost` 运行的 WSL）例外，conhost 管理网格并在调整尺寸时自行重绘视口，因此无法恢复锚点 |
| `PI_LOOP_SAMPLER` | 为 `0` 或 `false` 时，关闭终端界面事件循环监视器使用的 JavaScriptCore 调用栈采样器（使用 `--cpu-prof` 时也关闭）。开启时（默认），每条 `ui.loop-blocked` 日志增加 `cause`（阻塞窗口中最常采到的最内层源代码帧，格式为 `name (path:line)`）、`causeShare`（该帧所占的采样比例）和 `top`（最多 4 个出现在至少半数样本中的调用者，由外到内排序，格式为 `name (path:line) NN%`） |

### 远程文件链接 \{#remote-file-links}

| 变量 | 行为 |
| --- | --- |
| `PI_LINK_SCHEME` | 自定义文件链接协议，例如 `ompfile`，不带 `:` 或 `://`。不区分大小写地按 `^[a-z][a-z0-9+.-]*$` 匹配，输出时使用小写。值无效时记录警告，并保留普通文件或 VS Code 链接目标 |
| `PI_LINK_HOST` | 与 `PI_LINK_SCHEME` 配合使用的远程机器名，可带 `:port`，默认为 `os.hostname()`。只接受字母、数字、`.`、`_` 和 `-`。无效值会记录警告，并保留普通目标。未设置协议时无效 |

交互式终端界面在启动时读取这些变量一次。OSC 8 链接及原生 TSP 文件链接均使用此自定义协议，并优先于 VS Code 链接目标。SDK 宿主可调用 `applyFileLinkSetting` 并传入显式配置。原生图像上下文菜单的打开操作保留本地 `file://` URL，因为该操作在本机执行。

例如，用 `PI_LINK_SCHEME=ompfile PI_LINK_HOST=beelink omp` 启动远程会话。指向 `/work/a b.ts` 第 42 行、第 7 列的文件链接，目标为 `ompfile://beelink/work/a%20b.ts?line=42&col=7`。可选查询参数 `line` 和 `col` 保留所传位置，未传入的值会省略。普通 `file:` 链接从不携带这些参数。

桌面端协议处理器必须将主机路由到远程机器，对路径进行百分号解码，并读取可选的位置参数。Windows 盘符路径使用 `/C:/...`。UNC 路径以双斜杠保留文件服务器名，例如 `ompfile://beelink//nas/share/a.ts`。文件系统路径格式无效时，不渲染链接。模型在 Markdown 中写的文件链接会保留自身的查询参数或片段（如 `#L10`），因此处理器必须忽略不认识的参数。处理器本身在桌面端单独注册。

### 浏览器启动与代理控制 \{#browser-launchproxy-controls}

| 变量 | 行为 |
| --- | --- |
| `PUPPETEER_PROXY` | 添加 Chromium 的 `--proxy-server` 启动参数 |
| `PUPPETEER_PROXY_BYPASS_LOOPBACK` | 类布尔标志，将 `<-loopback>` 加入绕过列表，使 localhost 也走代理 |
| `PUPPETEER_PROXY_IGNORE_CERT_ERRORS` | 类布尔标志，以忽略证书错误的方式启动 Chromium |
| `CMUX_WORKSPACE_ID`、`CMUX_SURFACE_ID` | 浏览器打开分窗时的目标 cmux 工作区和界面 |
| `CMUX_RELAY_ID`、`CMUX_RELAY_TOKEN` | cmux 中继的标识和认证后备值 |

---

## 10）提交生成控制项 \{#10-commit-generation-controls}

| 变量 | 行为 |
| --- | --- |
| `PI_COMMIT_TEST_FALLBACK` | 为 `true`（不区分大小写）时，强制使用提交生成的后备路径 |
| `PI_COMMIT_NO_FALLBACK` | 为 `true` 时，智能体不返回提案也不使用后备路径 |
| `DEBUG` | 设置后打印提交智能体的错误堆栈 |

---

## 11）OpenTelemetry 导出 \{#11-opentelemetry-export}

只有至少一个信号设置了端点，OMP 才会初始化 OTLP 导出。设为 `telemetry.otlpExportEnabled: false`（`/settings` → Providers → Privacy）可跳过导出，即使已有端点配置。`OTEL_SDK_DISABLED=true` 也会禁用初始化。

| 变量组 | 行为 |
| --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 共用后备端点 |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`、`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`、`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | 各信号的端点，优先于共用端点 |
| `OTEL_EXPORTER_OTLP_HEADERS` | 以 `key=value,key2=value2` 列表提供共用 OTLP 请求头，值用百分号编码 |
| `OTEL_EXPORTER_OTLP_TRACES_HEADERS`、`OTEL_EXPORTER_OTLP_LOGS_HEADERS`、`OTEL_EXPORTER_OTLP_METRICS_HEADERS` | 各信号的请求头，按键合并，覆盖同键的共用请求头 |
| `OTEL_TRACES_EXPORTER`、`OTEL_LOGS_EXPORTER`、`OTEL_METRICS_EXPORTER` | 含 `none` 的列表会禁用该信号 |
| `OTEL_EXPORTER_OTLP_PROTOCOL` 和各信号的 `..._PROTOCOL` 变体 | 此运行时仅支持 `http/protobuf`，显式指定其他协议会禁用该信号 |
| `OTEL_SERVICE_NAME`、`OTEL_RESOURCE_ATTRIBUTES` | OpenTelemetry 资源元数据 |
| `OTEL_LOG_LEVEL` | OMP 导出日志的最低级别 |

OMP 自有的 `.env` 文件（智能体目录、配置根目录、用户主目录的 `.env`）里的 `OTEL_*` 条目只配置 OMP 的导出器。OMP 将这些值保存在私有映射中，不放入 `Bun.env` / `process.env`。因此，omp 启动的程序（Bash 和 PTY 命令、子代理 shell、JavaScript Eval 和标签页工作线程、LSP/DAP/MCP 服务器、安装器）的进程环境不包含这些值，扩展或钩子看到的 `process.env` 也没有这些值。这是隔离环境变量继承，不是保密措施。磁盘上的文件仍可读，进程内从 `@oh-my-pi/pi-utils` 导入 `$otelEnv` 的代码也可以读取这些值。omp 在启动时构造 OpenTelemetry 导出器，只在该同步步骤期间将它们暂时放入 `process.env`。启动 shell 中已导出的变量优先于文件，并对子进程可见；项目 `.env` 的行为不变。有一个限制：如果 omp 的启动目录中的 `.env` 恰好也是 omp 自己的配置文件（例如在 `$HOME` 启动），Bun 的 dotenv 自动加载会在 omp 的加载器运行前应用该文件；关闭自动加载时，omp 自己的加载器也会先应用它。因此这些值会按项目 `.env` 的值处理并保持可见。可从项目目录启动 omp，或将 `OTEL_*` 放在智能体目录的文件（`~/.omp/agent/.env`）中，Bun 不会自动加载它，除非该目录正是工作目录。这些值不在 `process.env`，而密钥遮蔽从 `process.env` 收集密钥，所以识别不到嵌在这些值中的凭据，例如 `scheme://user:pass@host` 里的密码。扩展如果需要自己的 OpenTelemetry 配置，应从 shell 环境读取。子 `omp` 进程会重新读取同样的文件，以自身的配置导出。

请求头值会经百分号解码，因此应对空格以及分隔符 `,` / `=` 进行编码：

```bash
export OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="http://localhost:8000/v1/traces"
export OTEL_EXPORTER_OTLP_TRACES_HEADERS="authorization=Bearer%20$LAMINAR_PROJECT_API_KEY"
```

---

## 涉及安全的变量 \{#security-sensitive-variables}

将这些变量视为密钥，不要记录到日志或提交到仓库：

- 模型提供方或 API 密钥、OAuth 或 Bearer 凭据（所有 `*_API_KEY`、`*_TOKEN` 以及 OAuth 访问或刷新令牌）。
- 云凭据（`AWS_*`、`GOOGLE_APPLICATION_CREDENTIALS` 路径可能暴露服务账号材料）。
- 搜索服务或模型提供方的认证变量（`EXA_API_KEY`、`BRAVE_API_KEY`、`PERPLEXITY_API_KEY`、Anthropic 搜索密钥）。
- Foundry mTLS 材料（`CLAUDE_CODE_CLIENT_CERT`、`CLAUDE_CODE_CLIENT_KEY`，以及指向私有 CA 集合时的 `NODE_EXTRA_CA_CERTS`）。
- OTLP 导出器请求头（`OTEL_EXPORTER_OTLP_HEADERS` 及各信号的 `..._{TRACES,LOGS,METRICS}_HEADERS` 变体），其中携带接收端的 Bearer 令牌或项目密钥。

Python 运行时在启动内核子进程前也会显式移除许多常见的密钥变量（`packages/coding-agent/src/eval/py/runtime.ts`）。
