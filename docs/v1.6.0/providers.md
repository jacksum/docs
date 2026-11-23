# 模型提供方 \{#providers}

大多数托管模型提供方支持以下一种或两种认证方式：

- 通过基于 OAuth 的浏览器或设备流程登录。
- 提供 API 密钥。

使用 `/login [provider]` 查看某个模型提供方支持的认证方式。Amazon Bedrock 和 Google Vertex AI 也可以使用运行环境中可用的云凭据。

## 交互式认证 \{#authenticate-interactively}

运行 `/login` 并选择模型提供方。Pi 会引导你完成 OAuth 认证或输入 API 密钥，并将获得的凭据保存在 [`auth.json`](./configuration.md#agent-directory) 中。

在远程或无界面的机器上，OAuth 回调可能无法送达本地进程。如果 Pi 提示你输入，请将最终的重定向 URL 或授权码粘贴回 Pi。

运行 `/logout` 并选择模型提供方，删除该提供方已保存的凭据。此操作不会取消设置环境变量、移除 `models.json` 中的认证配置，也不会在模型提供方撤销该凭据。

`auth.json` 可能包含 API 密钥和 OAuth token。请勿公开此文件，也不要将它提交到版本控制。

## 通过环境变量提供 API 密钥 \{#use-an-api-key-from-the-environment}

在 CI 或其他不应让 Pi 保存密钥的环境中，可以通过环境变量提供密钥。请在启动 Pi 之前设置变量：

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

下表列出只使用一个主要 API 密钥变量的模型提供方。需要额外配置或支持运行环境凭据的模型提供方见[各模型提供方的配置](#provider-specific-config)。

| 模型提供方 | 环境变量 |
|---|---|
| Anthropic | `ANTHROPIC_API_KEY` |
| Ant Ling | `ANT_LING_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| NVIDIA NIM | `NVIDIA_API_KEY` |
| Google Gemini | `GEMINI_API_KEY` |
| GitHub Copilot | `COPILOT_GITHUB_TOKEN` |
| Mistral | `MISTRAL_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Cerebras | `CEREBRAS_API_KEY` |
| xAI | `XAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY` |
| ZAI Coding Plan（全球） | `ZAI_API_KEY` |
| ZAI Coding Plan（中国） | `ZAI_CODING_CN_API_KEY` |
| OpenCode Zen 和 Go | `OPENCODE_API_KEY` |
| Radius | `RADIUS_API_KEY` |
| TypeSafe（[分类模型](./models.md#use-classifier-models)） | `TYPESAFE_API_KEY` |
| Hugging Face | `HF_TOKEN` |
| Fireworks | `FIREWORKS_API_KEY` |
| Together AI | `TOGETHER_API_KEY` |
| Baseten | `BASETEN_API_KEY` |
| Kimi For Coding | `KIMI_API_KEY` |
| Meta | `META_API_KEY` |
| MiniMax | `MINIMAX_API_KEY` |
| MiniMax（中国） | `MINIMAX_CN_API_KEY` |
| Moonshot AI（全球和中国） | `MOONSHOT_API_KEY` |
| Qwen Token Plan Team | `QWEN_TOKEN_PLAN_TEAM_API_KEY` |
| Qwen Token Plan Team（中国） | `QWEN_TOKEN_PLAN_TEAM_CN_API_KEY` |
| Qwen Token Plan Individual | `QWEN_TOKEN_PLAN_INDIVIDUAL_API_KEY` |
| Qwen Token Plan Individual（中国） | `QWEN_TOKEN_PLAN_INDIVIDUAL_CN_API_KEY` |
| Xiaomi MiMo | `XIAOMI_API_KEY` |
| Xiaomi MiMo Token Plan（中国） | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| Xiaomi MiMo Token Plan（阿姆斯特丹） | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` |
| Xiaomi MiMo Token Plan（新加坡） | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |

Anthropic 也接受 `ANTHROPIC_OAUTH_TOKEN` 作为 API 凭据，并支持使用 `ANTHROPIC_AUTH_TOKEN` 进行 Bearer 认证。

如果未设置密钥或 token，但设置了 `ANTHROPIC_FEDERATION_RULE_ID`、`ANTHROPIC_ORGANIZATION_ID` 和 `ANTHROPIC_IDENTITY_TOKEN_FILE`，Anthropic 会使用工作负载身份联合。Anthropic SDK 用身份 token 换取短期访问 token，并自行刷新。刷新时会重新读取身份 token 文件，因此在长时间运行的会话中应保持该文件内容最新。如果设置了 `ANTHROPIC_SERVICE_ACCOUNT_ID` 和 `ANTHROPIC_WORKSPACE_ID`，Pi 也会传递这两个值。

## 从命令获取 API 密钥 \{#load-an-api-key-from-a-command}

如果要使用密钥管理器而不把获取到的密钥写入磁盘，请在 `auth.json` 中将模型提供方的 `key` 设置为以 `!` 开头的命令：

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "!security find-generic-password -ws 'anthropic'"
  }
}
```

Pi 首次需要密钥时会执行命令，并在整个进程生命周期内缓存其标准输出。若输出为空、命令超时或以非零状态退出，Pi 将无法取得密钥，直到重启才会再尝试。

## 各模型提供方的配置 \{#provider-specific-config}

以下模型提供方可能有额外的接入步骤，需要额外设置，或可以使用所在平台提供的凭据。

保存的 API 密钥凭据可以包含 `env` 对象。对该模型提供方，此对象中的值优先于进程环境变量：

```json
{
  "cloudflare-workers-ai": {
    "type": "api_key",
    "key": "...",
    "env": {
      "CLOUDFLARE_ACCOUNT_ID": "account-id"
    }
  }
}
```

### Radius \{#radius}

Radius 是 Pi 的开发团队 Earendil Works 为 Pi 开发的服务。它提供内置组织级控制和分析功能的可定制 AI 网关，也提供制品（artifact），供你分享用 Pi 创建的内容。

在 Pi 中运行 `/login radius` 即可开始。此操作会将 Radius 添加为模型提供方，其模型和其他模型提供方的模型一样出现在 `/model` 中。

Radius 也提供 MCP 服务器，因此 Pi 可以代你管理 Radius。

Radius 目前仍处于早期 alpha 阶段，变化较快。详情见 [radius.earendil.com](https://radius.earendil.com)。

Radius 认证使用其网关的目录，并缓存刷新后的模型元数据，供以后离线启动时使用。在 `models.json` 中配置的 Radius 自定义网关使用自己的目录，不继承 `radius.pi.dev` 的公开目录。

### OpenRouter \{#openrouter}

使用 `/login openrouter` 或 `OPENROUTER_API_KEY` 进行认证。

使用密钥时，Pi 只列出该密钥可用的 OpenRouter 对话模型，并显示该密钥对应的上下文大小、最大输出和价格。这些信息来自 OpenRouter 的 `/models/user` 端点，并反映 OpenRouter 中配置的护栏和模型提供方限制。图像模型和分类模型不受此筛选影响。

交互模式启动时、打开 `/model` 时、运行 `/login` 后，以及运行 `pi update --models` 时，Pi 会在后台刷新列表。Pi 会保存最近一次获取的列表，供离线、`pi -p` 和 RPC 模式使用。如果不通过 `/login` 更换密钥，Pi 会继续使用旧密钥对应的列表，直到下次刷新。

区域端点会将模型限制在各自的区域内。要使用区域端点，请在 [`models.json`](./models.md#configure-a-compatible-endpoint) 中设置基础 URL：

```json
{
  "providers": {
    "openrouter": { "baseUrl": "https://us.openrouter.ai/api/v1" }
  }
}
```

如果基础 URL 对应的服务在 `/models/user` 端点拒绝该密钥，或未提供该端点（例如将 OpenRouter 的基础 URL 指向代理时），Pi 会列出所有 OpenRouter 模型。

### Azure OpenAI \{#azure-openai}

模型提供方 ID 是 `azure`（原为 `azure-openai-responses`）。在 `auth.json`、`models.json` 和 `settings.json` 中使用此 ID 作为键，在 `--model azure/gpt-5.4` 等模型引用中也使用此 ID。

`azure` 模型提供方通过 Responses API 提供 OpenAI 模型，通过 Chat Completions 提供 Microsoft Foundry 模型，例如 `azure/deepseek-v4-pro`。

设置 API 密钥，并指定基础 URL 或资源名称：

```bash
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_BASE_URL=https://your-resource.ai.azure.com
# Or:
export AZURE_OPENAI_RESOURCE_NAME=your-resource
```

`ai.azure.com`、`cognitiveservices.azure.com` 和 `openai.azure.com` 下的资源根 URL 会规范为 OpenAI API 路径。

Pi 将模型 ID 作为部署名称发送。如果实际部署名称不同，请通过 `AZURE_OPENAI_DEPLOYMENT_NAME_MAP` 设置映射：

```bash
export AZURE_OPENAI_DEPLOYMENT_NAME_MAP=gpt-5.4=my-gpt-deployment,deepseek-v4-pro=my-deepseek
```

`AZURE_OPENAI_API_VERSION` 可覆盖 OpenAI 模型的 API 版本（默认为 `v1`）。

要使用 Pi 未收录的 Foundry 模型，请在 [`models.json`](./models.md#configure-a-compatible-endpoint) 的 `azure` 下添加该模型，并设置 `api: "openai-completions"`。自定义模型必须指定 `baseUrl`；如果设置了 `AZURE_OPENAI_BASE_URL` 或 `AZURE_OPENAI_RESOURCE_NAME`，则优先使用这些环境变量：

```json
{
  "providers": {
    "azure": {
      "baseUrl": "https://your-resource.services.ai.azure.com",
      "models": [
        { "id": "your-deployment", "api": "openai-completions" }
      ]
    }
  }
}
```

### Amazon Bedrock \{#amazon-bedrock}

Bedrock 可以使用 Bearer token，也可以使用运行环境中可用的 AWS 凭据来源：

```bash
# Named profile
export AWS_PROFILE=your-profile

# IAM keys
export AWS_ACCESS_KEY_ID=AKIA...
export AWS_SECRET_ACCESS_KEY=...
# Required for temporary credentials
export AWS_SESSION_TOKEN=...

# Bedrock bearer token
export AWS_BEARER_TOKEN_BEDROCK=...

# Region, when not supplied by the profile or AWS SDK configuration
export AWS_REGION=us-west-2
# AWS_DEFAULT_REGION is also supported
```

Pi 也支持通过标准的 `AWS_CONTAINER_CREDENTIALS_*` 和 `AWS_WEB_IDENTITY_TOKEN_FILE` 变量使用 ECS 任务凭据和 IRSA。

### Cloudflare AI Gateway \{#cloudflare-ai-gateway}

该网关需要 token、账户 ID 和网关 ID：

```bash
export CLOUDFLARE_API_KEY=...
export CLOUDFLARE_ACCOUNT_ID=...
export CLOUDFLARE_GATEWAY_ID=...
```

账户 ID 和网关 ID 可以来自进程环境变量，也可以来自 `auth.json` 中该凭据的 `env` 对象。

Pi 使用 `CLOUDFLARE_API_KEY` 向网关认证。访问上游服务时，可以使用 Cloudflare 统一计费、保存在网关中的凭据，或在 `models.json` 中为该模型提供方配置的 `Authorization` 请求头。

### Cloudflare Workers AI \{#cloudflare-workers-ai}

Workers AI 需要 token 和账户 ID：

```bash
export CLOUDFLARE_API_KEY=...
export CLOUDFLARE_ACCOUNT_ID=...
```

也可以将账户 ID 保存在该凭据的 `env` 对象中。

### Google Vertex AI \{#google-vertex-ai}

使用 Google Cloud API 密钥：

```bash
export GOOGLE_CLOUD_API_KEY=...
```

要使用应用默认凭据（Application Default Credentials），请先配置项目和位置：

```bash
export GOOGLE_CLOUD_PROJECT=your-project
# GCLOUD_PROJECT is also supported
export GOOGLE_CLOUD_LOCATION=us-central1
```

然后进行认证：

```bash
gcloud auth application-default login
```

如果改用服务账号密钥文件，请同时设置项目、位置和 `GOOGLE_APPLICATION_CREDENTIALS`。
