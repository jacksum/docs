---
title: "模型提供方"
description: "Oh My Pi v19.1.1 仓库文档：模型提供方。"
---

# 模型提供方 \{#providers}

模型提供方是 `omp` 可以向其路由请求的模型后端，包括 Anthropic、OpenAI、Google Gemini、Groq、OpenRouter、Mistral、xAI、Ollama 等本地引擎、托管网关、在 `models.yml` 中自定义的模型提供方，以及由扩展注册的模型提供方。

**模型提供方**是账户或后端的命名空间，例如 `anthropic`、`openai`、`google` 或 `ollama`。**模型**是该模型提供方下的具体模型，使用 `provider/model-id` 格式选择，例如 `anthropic/claude-opus-4-6`。禁用一个模型提供方后，便无法选择其下的任何模型。若只想限制可选的个别模型，请使用模型设置。

本页涵盖模型提供方的可用条件、凭据解析、模型提供方与环境变量的对应关系、本地引擎、禁用模型提供方及自定义模型提供方。有关 Kiro 原生身份验证、模型发现和流式响应，参见 [Kiro](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/kiro.md)。有关各端点对请求、推理、工具、流式响应、用量和重试的限制，参见[模型提供方端点限制](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/provider-endpoint-constraints.md)。有关模型选择及完整的 `models.yml` 配置结构，参见[模型与模型提供方配置](./models.md)。有关配置文件的位置及合并优先级，参见[设置](./settings.md)。有关凭据存储和登录流程的详细说明，参见[秘密信息与凭据](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/secrets.md)。完整的环境变量参考见[环境变量](./environment-variables.md)。本地引擎的设置方法见[本地模型](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/local-models.md)。有关用于发现上下文文件的来源，参见[上下文文件](./context-files.md)。

## Antigravity CLI \{#antigravity-cli}

`antigravity-cli` 在本地运行 Google 的 `agy acp`，与已暂停的直连 OAuth 模型提供方 `google-antigravity` 相互独立。

1. 运行 `/login antigravity-cli` 或 `omp login antigravity-cli`。
2. 完成 agy 的 Google 登录，然后粘贴授权码或回调 URL。
3. 选择模型，例如 `antigravity-cli/gemini-4-carbon` 或 `antigravity-cli/claude-sonnet-5-5`。

omp 根据 Google 的发布清单下载 agy，校验 SHA-512，并在数据目录中保留按版本存放的可执行文件（通常在 `~/.omp/antigravity-cli/bin`）。它最多每天检查一次更新，不会修改 Shell 的启动配置。也可用 `PI_AGY_PATH` 指定已有的可执行文件。CLI 的 IDE 工具传输要求 `nc`（netcat）位于 `PATH` 中。

登录会将取得的 OAuth 授权导出到 omp 的凭据存储中，由常规刷新和认证代理分发机制管理。ACP 子进程使用私有的、按账户划分作用域的原生凭据文件，不会改动常规的 agy 登录。仅为子进程设置的无界面认证环境会让 agy 使用文件存储。不要把访问令牌复制到 `--api-key` 中；传输层需要登录生成的结构化 OAuth 凭据。

废弃的登录目录若不含凭据，会在 24 小时后清理。仍含凭据的目录会保留，以便恢复。

omp 通过 ACP 和 IDE MCP 桥接提供系统提示词及工具结构定义。工具在 omp 中保留原名；agy 向模型显示为 `mcp_ide-tools_<name>`。内置的代理提示词和编程工具会被移除，但 agy 的 `manage_task` 及 MCP 资源工具仍留在 agy 内部。由 omp 提供的工具仍由 omp 执行，并由 omp 负责工具审批。

工具参数无效时，会将有误的参数路径和工具所要求的结构定义一并返回给模型，以便模型在不结束当前轮次的情况下修正调用。

传输层会在模型的各步骤间保留 agy 的对话，包括 omp 执行工具期间。发生编辑、创建分支或上下文变化时，若可行，会恢复到匹配的已保存轮次边界；否则会将保留的会话记录提供给一段新对话。原生对话和凭据保留在执行推理的本机上。agy 的 MCP 超时为 3 分钟，耗时较长的工具操作需要取消 agy 正在等待的轮次，并在操作完成后将结果作为后续消息送达。

内置模型列表与 agy 1.5.9 的模型选择器一致，实际可用性仍取决于登录的账户。ACP 支持选择模型及思考档位，但不接受调用方指定的温度、停止序列或输出 token 上限。原生轮次结束时才返回 token 总量；中间步骤报告已占用的上下文，不虚构逐步骤的计费数据。登录前会显示 Google 的账户政策警告。

## Factory Droid \{#factory-droid}

`factory-droid` 模型提供方直接使用 Factory 的 Droid 订阅网关。登录和推理都不需要 `droid` 可执行文件、后台守护进程或 SDK 子进程。

1. 在交互式会话中运行 `omp login factory-droid` 或 `/login factory-droid`。
2. 在浏览器中打开输出的 `auth.factory.ai/device` 链接，输入显示的设备代码并批准登录。
3. 选择模型，例如 `factory-droid/kimi-k3`，然后发送提示词。已保存的 WorkOS 会话会自动刷新。`omp auth-broker login factory-droid` 支持由认证代理管理的凭据。

此模型提供方使用订阅 OAuth。它不会从已安装的 Droid CLI 发现凭据，也不读取 `FACTORY_API_KEY`；Factory 单独提供的 API 密钥产品不属于这项集成。

模型列表以 KDL 随软件分发（`packages/catalog/src/compat/rules/providers/factory-droid.kdl`；每个模型的传输协议和计费池定义在 `rules/runtime/behavior.kdl` 中）。该列表按 `FACTORY_DROID_CLIENT_VERSION` 固定的 Droid CLI 版本（见 `packages/catalog/src/wire/factory-droid.ts`）手动维护。列表包含具体的 CLI 模型，不含 Factory Auto Model 路由器或仅应用内可用的 Flex 变体。账户功能开关、强制弃用限制、组织政策（包括须明确选择加入的要求）及服务区域会实时缩小列表范围。新的模型 ID 需要更新模型目录。在线发现成功之前，受功能开关或同意状态限制的模型保持隐藏。离线或发现失败时可能保留缓存快照，但不能据此确认当前仍有使用权限。

模型列表包含 Factory 的 `generate_image` 模型（`gpt-image-2.6-sunburst`、`gpt-image-2.6-flare`、`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`、`gemini-3-pro-image-preview`），补齐了 `image` 角色的默认选项，因此仅登录 Factory 也能生成图像。只有发现过程读取组织的受管设置后，这些模型才会显示：`imageGenerationEnabled: false` 会全部隐藏，`imageGenerationAllowedModelIds` 可缩小范围（空列表会全部隐藏）。图像调用计入 Standard Credits 池。

组织身份和数据驻留信息会随处理每个请求的凭据一同传递，账户轮换时也一样。每个账户与数据驻留组合的作用域都有独立的模型缓存。数据驻留位置决定 API 主机；推理区域（`global`、`us` 或 `eu`）是独立设置，用于限制可用的上游服务。

使用 Anthropic 自有上游的 Claude 请求，仅在发现过程中确认账户模型列表中有回退模型时，才提供 Factory 的服务端拒绝回退（Fable 和 Opus 5.5 可回退到 Opus 5）。若处理请求的凭据来自不同于发现时的组织，则不提供回退。对于 OMP 未发现、而是在 `models.yml` 中定义的 Factory 模型，仍提供其规则列出的所有回退项，就像发现机制尚未跟踪回退项时一样。

当账户使用基于 token 速率限制的计费模式时，`/usage` 和 `omp usage` 会报告 Standard Credits 和 Droid Core 的配额窗口。若账户的计费响应明确禁用了该模式，账户仍会显示，并注明未公开配额窗口；OMP 不会虚构剩余余额。模型浏览器显示各模型当前生效的积分费率，包括 Factory 的限时积分优惠。模型详情会列出下一次计划生效的费率及日期。美元金额是上游公开标价，仅供参考，并非 Factory 的计费金额，也不包含优惠。没有美元参考价的模型会显示积分费率，而非 `free`。仅有额外余额不足以证明已启用超额计费。

如果账户轮换会缩小所选模型的上下文窗口，OMP 会在发出重试前停止，不会猜测已有对话是否超出窗口。重试前，请用 `omp models refresh factory-droid` 刷新发现结果，并选择适用于当前区域的模型。

即使未启用扩展上下文，Factory 原生的上下文限制仍然生效。Factory 的 GPT 和 Gemini 路由不发送输出 token 上限，因此，要求有输出上限的临时轮次会拒绝带 `maxTokens` 的请求，而不会在没有上限的情况下静默运行。

## `omp` 判定模型提供方可用的规则 \{#how-omp-decides-a-provider-is-available}

模型注册表汇集以下来源：

1. 随软件分发的模型目录。
2. 当前代理目录的 `models.yml` 中自定义的模型提供方和模型条目（默认文件为 `~/.omp/agent/models.yml`）。
3. 本地引擎和启用了发现功能的托管模型提供方的缓存模型，以及运行时发现的模型。
4. 由扩展注册的模型提供方和模型，包括由扩展负责的发现结果。

启动时会加载配置和已缓存的发现元数据，无须等待每个端点。随后通过在线刷新填充依赖发现的模型目录。权威发现成功后，可替换随软件分发的模型提供方条目；显式配置的自定义模型和覆盖项会重新应用到发现的模型目录。由认证代理支持的网关模式会忽略本地 `models.yml` 的路由、凭据和自定义模型。

模型即使当前不能选择，也可能存在于注册表中。只有同时满足以下两个条件，模型才算**可用**：

1. 该模型提供方 ID **不在**实际生效的 `disabledProviders` 列表中；**且**
2. 模型提供方为**无密钥**模式（隐式本地模型提供方、配置 `auth: none` 的自定义模型提供方，或已按无密钥模式保存登录的可选密钥模型提供方），**或者**已配置身份验证。

可用性只做快速配置检查，不发送凭据验证请求，也不执行通过命令取得密钥的操作或刷新 OAuth 令牌。因此，配置了无效密钥的模型仍可能显示为可用，但在推理时失败。

系统会 _先_ 检查 `disabledProviders`，然后才检查凭据。禁用模型提供方 ID 后，无论是否存在已保存的密钥、OAuth 会话、环境变量、`.env` 条目，或 `models.yml` 中的 `apiKey`，都无法选择该模型提供方。其模型会从可用列表中移除，与凭据无关。将该 ID 从实际生效的列表中移除后，模型会恢复可用。

`ollama` 和 `lm-studio` 的隐式发现默认无须密钥。未配置身份验证时，隐式 `llama.cpp` 也无须密钥。Apple Foundation Models 在受支持的 Apple 芯片设备上同样无须密钥。参见[内置本地引擎](#built-in-local-engines)。

## 凭据与优先级 \{#credentials-and-precedence}

模型提供方需要 API 密钥时，`omp` 按以下顺序解析，采用首个匹配项：

1. **运行时覆盖项**：为当前进程提供的密钥，例如 CLI 的 `--api-key`。不会持久化。
2. **`models.yml` 中配置的密钥**：固定在自定义模型提供方上的 `apiKey`，注册为来自配置的 Bearer 凭据。它优先于已保存的 OAuth 凭据，以便使用为自定义 `baseUrl` 或网关指定的密钥，避免转发会被代理拒绝的上游 OAuth 令牌。
3. **已保存的 OAuth 凭据**：按需刷新，并对多个账户自动排序和轮换。对 Anthropic 和 ChatGPT（Codex），每个组织或工作区都算一个独立账户。同一电子邮件地址若既有 Team 或 Enterprise 席位，又有个人套餐，可以分别登录每个订阅（在浏览器的授权页面选择工作区），轮换时会视为两个账户。
4. **通过登录保存的 API 密钥**：成功运行 `/login` 后保存的 API 密钥凭据。
5. **扩展配置回退项**：若扩展注册的模型提供方同时有 `apiKey` 引用和 OAuth 或登录流程，该引用的优先级低于已保存的 OAuth 凭据和通过登录保存的密钥。
6. **模型提供方的环境变量**：包括从 `.env` 文件加载的值（见[环境变量表](#environment-variables-and-env-files)）。
7. **其他已保存的 API 密钥**：例如通过认证代理迁移的密钥。这是最后的回退项，因此显式设置的环境变量优先。

本地凭据存放在当前使用的认证存储中（默认 `~/.omp/agent/agent.db`）；认证代理模式使用已配置的共享认证代理。命名配置档案和 Linux XDG 目录布局可以改变存储位置。使用默认配置档案时，`PI_CODING_AGENT_DIR` 可覆盖代理目录。路径解析见[设置](./settings.md)和[秘密信息与凭据](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/secrets.md)。

### OAuth、API 密钥与按模型提供方登录 \{#oauth-vs-api-key-and-provider-scoped-logins}

登录**以模型提供方为作用域**。登录 `anthropic` 不等于登录 `openai`，各模型提供方分别管理自己的凭据。即使已保存的认证信息有效，已禁用的模型提供方仍处于禁用状态。

在会话内使用以下交互式斜杠命令：

- `/login`：打开 OAuth 或密钥选择器。`/login <provider>` 直接进入指定模型提供方（例如 `/login anthropic`）；若 OAuth 流程要求粘贴回调地址，可运行 `/login <redirect-url>` 来完成流程。
- `/logout`：打开模型提供方选择器，以移除已保存的凭据。

在会话外，可在终端运行 `omp login [<provider>]` 执行相同的登录流程，扩展注册的模型提供方也适用。命令会输出认证 URL（并在浏览器中打开），从标准输入读取各项提示所需的输入，然后保存到会话使用的同一存储，即本地 `agent.db` 或已配置的认证代理。不指定模型提供方时，会显示带编号的选择列表。登录成功后，会在线刷新该模型提供方的模型目录，使新获准使用的模型可见。

对使用共享认证代理的无界面或远程环境，CLI 提供 `omp auth-broker login <provider>` / `omp auth-broker logout`（以及 `status`、`list`、`import`、`migrate`）。认证代理的工作方式见[秘密信息与凭据](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/secrets.md)。

模型没有凭据时，`omp` 会提示你运行 `/login`，或设置该模型提供方的环境变量。

使用 ClinePass 时，可设置 `CLINE_API_KEY`，或运行 `/login cline-pass` 打开 Cline 控制台，通过 `/users/me` 验证新建的 API 密钥。验证不发起补全测试请求，也不扣减订阅配额。OMP 从 Cline 的公开推荐模型端点刷新模型列表，并随软件提供经过审校的 Cline 元数据，供离线启动使用。在线出现的新 ID 会从上游参考资料补充元数据；没有参考资料时会使用保守的元数据，不虚构推理控制项。`omp usage` 报告 5 小时、每周和每月的配额窗口。免费档位模型标记为 `(free)`，使用同一个密钥。订阅模型显示等效 API 参考价格，而实际费用以网关随流式响应返回的费用为准。请求采用与 Cline CLI 相同的客户端请求头，并使用同一会话内保持不变的任务 ID；推理控制项仍因模型而异。

使用 Command Code 时，可设置 `COMMAND_CODE_API_KEY` 或运行 `/login commandcode`。与 Command Code CLI 一样，登录会通过 Command Code 的 `/alpha/whoami` 端点检查密钥，只有收到 401 才会拒绝密钥；收到 403 或无法访问检查端点时仍保留密钥。Claude 模型使用 Anthropic Messages 端点，十个 GPT 模型使用 OpenAI Responses 端点，其他模型均使用 Chat Completions，与 Command Code CLI 的划分一致。思考档位、图像输入、输出上限和价格遵循 Command Code CLI 的模型注册表。该注册表尚未列出 Claude Sonnet 5.5 的思考档位和图像输入，这两项采用 Anthropic 模型目录中的定义。GPT 模型可以使用托管网页搜索，但不能使用托管图像生成，因为 Command Code 不提供这项服务。TypeSafe 的 `typesafe/jev` 判定模型可供 `judge` 角色使用。`omp usage`、`/usage` 和状态栏会显示积分余额；套餐含 5 小时或每周配额窗口时，也会显示这些窗口。数据来自 Command Code CLI 使用的账户端点，模型提供方 API 文档没有说明这些端点。

### 在 `models.yml` 中固定密钥 \{#pinning-a-key-in-modelsyml}

自定义模型提供方的 `apiKey` 按**环境变量名或字面值**解析。若该值与某个值非空的环境变量名称完全匹配（区分大小写），则使用该环境变量的值；否则将该字符串本身用作密钥。若该值以 `!` 开头，则将其作为 Shell 命令执行，并使用去除首尾空白的标准输出（完整的值语法见[模型与模型提供方配置](./models.md)）。

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

如果为自定义模型提供方设置了 `authHeader: true`，则向该模型提供方发送的每个请求都会在 `Authorization: Bearer <key>` 头中带上解析出的密钥。

## 环境变量和 `.env` 文件 \{#environment-variables-and-env-files}

下列变量提供凭据，其优先级低于运行时或配置覆盖项，以及已保存的 OAuth 或登录凭据。只通过登录进行身份验证的模型提供方可能没有密钥变量。常规回退名称来自模型目录的模型提供方 KDL 定义；认证策略可以用有序的名称列表或通过计算得到结果的解析器来覆盖它们。

### 核心模型提供方 \{#core-providers}

| 模型提供方 ID | 环境变量 |
| --- | --- |
| `anthropic` | 先 `ANTHROPIC_OAUTH_TOKEN`，再 `ANTHROPIC_API_KEY`（Foundry 模式优先使用 `ANTHROPIC_FOUNDRY_API_KEY`，条件是 `CLAUDE_CODE_USE_FOUNDRY=true`） |
| `openai` | `OPENAI_API_KEY` |
| `openai-codex` | `OPENAI_CODEX_OAUTH_TOKEN` |
| `google` | `GEMINI_API_KEY` |
| `google-vertex` | `GOOGLE_CLOUD_API_KEY`，或 ADC（显式指定的 `GOOGLE_APPLICATION_CREDENTIALS` 或 gcloud 的默认 ADC 文件，另需项目和位置变量；见下文） |
| `groq` | `GROQ_API_KEY` |
| `openrouter` | `OPENROUTER_API_KEY` |
| `mistral` | `MISTRAL_API_KEY` |
| `xai` | `XAI_API_KEY` |
| `xai-oauth` | 先 `XAI_OAUTH_TOKEN`，再 `XAI_API_KEY` |
| `github-copilot` | `COPILOT_GITHUB_TOKEN` |
| `cursor` | `CURSOR_ACCESS_TOKEN` |
| `azure` | `AZURE_OPENAI_API_KEY` |
| `amazon-bedrock` | `AWS_BEARER_TOKEN_BEDROCK`、AWS 配置档案、`AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`，或 ECS/IRSA/EC2 凭据链 |

### 其他托管模型提供方 \{#additional-hosted-providers}

| 模型提供方 ID | 环境变量 |
| --- | --- |
| `abliteration` | 先 `ABLITERATION_API_KEY`，再 `ABLIT_KEY` |
| `aiand` | `AIAND_API_KEY` |
| `cerebras` | `CEREBRAS_API_KEY` |
| `alibaba-token-plan` | 先 `ALIBABA_TOKEN_PLAN_API_KEY`，再 `BAILIAN_TOKEN_PLAN_API_KEY` |
| `baseten` | `BASETEN_API_KEY` |
| `bedrock-mantle` | `AWS_BEARER_TOKEN_BEDROCK` 或 AWS 凭据链（SigV4） |
| `chutes` | `CHUTES_API_KEY` |
| `commandcode` | 先 `COMMAND_CODE_API_KEY`，再 `COMMANDCODE_API_KEY` |
| `coralbricks` | 先 `CORAL_API_KEY`，再 `CORALBRICKS_API_KEY` |
| `deepinfra` | `DEEPINFRA_API_KEY` |
| `deepseek` | `DEEPSEEK_API_KEY` |
| `siliconflow` | `SILICONFLOW_API_KEY` |
| `siliconflow-cn` | `SILICONFLOW_CN_API_KEY` |
| `fireworks` | `FIREWORKS_API_KEY` |
| `together` | `TOGETHER_API_KEY` |
| `modular` | `MODULAR_API_KEY` |
| `typesafe` | `TYPESAFE_API_KEY` |
| `coreweave` | 先 `COREWEAVE_API_KEY`，再 `WANDB_API_KEY` |
| `nvidia` | `NVIDIA_API_KEY` |
| `devin` | `DEVIN_API_KEY` |
| `gmi-cloud` | `GMI_API_KEY` |
| `huggingface` | 先 `HUGGINGFACE_HUB_TOKEN`，再 `HF_TOKEN` |
| `inception` | `INCEPTION_API_KEY` |
| `kiro` | `KIRO_API_KEY`（`ksk_…`）；`KIRO_API_REGION` 固定其区域 |
| `moonshot` | 先 `MOONSHOT_API_KEY`，再 `KIMI_API_KEY` |
| `stepfun` | `STEPFUN_API_KEY` |
| `helmcode` | `HELMCODE_API_KEY` |
| `meta` | 先 `MODEL_API_KEY`，再 `META_API_KEY` |
| `nanogpt` | `NANO_GPT_API_KEY` |
| `novita` | `NOVITA_API_KEY` |
| `venice` | `VENICE_API_KEY` |
| `vercel-ai-gateway` | `AI_GATEWAY_API_KEY`（目录发现也接受 `VERCEL_AI_GATEWAY_API_KEY`） |
| `cloudflare-ai-gateway` | `CLOUDFLARE_AI_GATEWAY_API_KEY` + `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_GATEWAY_ID` |
| `cloudflare-workers-ai` | 先 `CLOUDFLARE_API_TOKEN`，再 `CLOUDFLARE_AUTH_TOKEN`，另需 `CLOUDFLARE_ACCOUNT_ID` |
| `liquid` | `LIQUID_API_KEY` |
| `nace` | `NACE_API_KEY` |
| `snowflake` | `SNOWFLAKE_PAT` + `SNOWFLAKE_ACCOUNT` |
| `litellm` | `LITELLM_API_KEY`；可用 `LITELLM_BASE_URL` 指定代理端点 |
| `bifrost` | `BIFROST_API_KEY`；可用 `BIFROST_BASE_URL` 指定网关端点 |
| `modal` | `MODAL_PROXY_TOKEN`；可用 `MODAL_BASE_URL` 指定专用端点 |
| `kilo` | `KILO_API_KEY` |
| `zai` | `ZAI_API_KEY` |
| `zenmux` | `ZENMUX_API_KEY` |
| `zhipu-coding-plan` | `ZHIPU_API_KEY` |
| `umans` | `UMANS_AI_CODING_PLAN_API_KEY` |
| `qianfan` | `QIANFAN_API_KEY` |
| `qwen-portal` | 先 `QWEN_OAUTH_TOKEN`，再 `QWEN_PORTAL_API_KEY` |
| `synthetic` | `SYNTHETIC_API_KEY` |
| `minimax-code` | `MINIMAX_CODE_API_KEY` |
| `minimax-code-cn` | `MINIMAX_CODE_CN_API_KEY` |
| `minimax` | `MINIMAX_API_KEY` |
| `alibaba-coding-plan` | `ALIBABA_CODING_PLAN_API_KEY` |
| `sakana` | 先 `SAKANA_API_KEY`，再 `FUGU_API_KEY` |
| `sambanova` | `SAMBANOVA_API_KEY` |
| `scaleway` | 先 `SCW_SECRET_KEY`，再 `SCW_API_KEY` |
| `otari` | `OTARI_API_KEY` |
| `aimlapi` | `AIMLAPI_API_KEY` |
| `gitlab-duo`、`gitlab-duo-agent` | `GITLAB_TOKEN` |
| `opencode-zen`、`opencode-go` | `OPENCODE_API_KEY` |
| `cline-pass` | `CLINE_API_KEY` |
| `factory-droid` | 无；请使用 `/login factory-droid` |
| `firepass` | `FIREPASS_API_KEY` |
| `wafer-serverless` | `WAFER_SERVERLESS_API_KEY` |
| `xiaomi` | `XIAOMI_API_KEY` |
| `xiaomi-token-plan-ams` | `XIAOMI_TOKEN_PLAN_AMS_API_KEY` |
| `xiaomi-token-plan-cn` | `XIAOMI_TOKEN_PLAN_CN_API_KEY` |
| `xiaomi-token-plan-sgp` | `XIAOMI_TOKEN_PLAN_SGP_API_KEY` |
| `ollama-cloud` | `OLLAMA_CLOUD_API_KEY` |
| `ollama` | `OLLAMA_API_KEY`（可选；本地发现默认无须密钥） |
| `lm-studio` | `LM_STUDIO_API_KEY`（可选；默认无须密钥） |
| `llama.cpp` | `LLAMA_CPP_API_KEY`（仅在服务器要求身份验证时需要） |
| `vllm` | `VLLM_API_KEY`（如果本地服务器不要求身份验证，则可选） |
| `yolo-auto` | `YOLO_AUTO_API_KEY` |
| `charm-hyper` | 先 `CHARM_HYPER_API_KEY`，再 `HYPER_API_KEY` |
| `singularityapi-dev` | `SINGULARITYAPI_DEV_API_KEY` |
| `singularityapi-tech` | `SINGULARITYAPI_TECH_API_KEY` |

判断 Vertex ADC 是否可用时，项目变量可使用 `GOOGLE_CLOUD_PROJECT`、`GCP_PROJECT` 或 `GCLOUD_PROJECT`，位置变量可使用 `GOOGLE_VERTEX_LOCATION`、`GOOGLE_CLOUD_LOCATION` 或 `VERTEX_LOCATION`。

对于 `xai-oauth`，显式请求可使用 `XAI_API_KEY`，但这样不会让 SuperGrok 模型自动可用或成为首选。若要自动可用，需要专用的 `XAI_OAUTH_TOKEN`，也可使用已保存或已配置的认证信息。

`/login cloudflare-ai-gateway` 会要求输入网关令牌、Cloudflare 账户 ID 和网关 ID，然后将三项一起保存。若使用环境变量，请设置上面列出的全部三个值。OMP 会根据模型选择 Anthropic、OpenAI 或 Workers AI 的网关路由，无需用 `models.yml` 覆盖基础 URL。

`cloudflare-workers-ai` 将 Cloudflare 的 Clef 判定模型（`cloudflare-workers-ai/@cf/cloudflare/clef` 和 `cloudflare-workers-ai/@cf/cloudflare/clef-flash`）作为 `judge` 模型提供。要使用其中一个模型，请将它分配给 `judge` 角色。`/login cloudflare-workers-ai` 会要求输入拥有 Workers AI 读取和编辑权限的 Cloudflare API 令牌（可在 `https://dash.cloudflare.com/profile/api-tokens` 创建）和账户 ID，然后一起保存。若使用环境变量，请设置 `CLOUDFLARE_API_TOKEN`（或 `CLOUDFLARE_AUTH_TOKEN`）和 `CLOUDFLARE_ACCOUNT_ID`。

`liquid` 将 Liquid AI 的判定模型（`liquid/d1.2`、`liquid/d1.2-ultra`，以及已弃用的 `liquid/d1.1` 和 `liquid/d1-ultra`）作为 `judge` 模型提供。要使用其中一个模型，请将它分配给 `judge` 角色。`/login liquid` 会要求输入来自 `https://console.liquid.ai/`（Dashboard > API Keys）的 API 密钥；若使用环境变量，请设置 `LIQUID_API_KEY`。发给 Liquid 的图像会调整大小，以满足每次请求 10,000 个图像块的限制，每块为 32×32 像素。

`nace` 将 Nace 的 Drex 判定模型（`nace/drex-max-v1.1`、`nace/drex-max-finance` 以及仅支持文本的 `nace/drex-v2.0`）作为 `judge` 模型提供。要使用其中一个模型，请将它分配给 `judge` 角色。`/login nace` 会要求输入来自 `https://console.nace.ai/dashboard/api-keys` 的 API 密钥；若使用环境变量，请设置 `NACE_API_KEY`。Drex Max 模型每个请求最多接受 8 张 PNG、JPEG 或 WebP 图像。Drex 会拒绝任何含 base64 图像、音频、视频或 PDF 数据 URL 的文本，因此 OMP 会将状态、指令和评判标准中的每个此类 URL 替换为 `[image/png base64 data URL]` 之类的描述。

`/login snowflake` 会要求输入 Snowflake 账户标识符或账户 URL，然后使用 Snowflake 内置的本地应用 OAuth 集成在浏览器中登录，并一并保存账户和令牌。若改用环境变量，请同时设置 `SNOWFLAKE_PAT` 和 `SNOWFLAKE_ACCOUNT`。

`charm-hyper` 是 Charm 面向编程代理提供的 OpenAI 兼容推理网关。可在 `https://hyper.charm.land/` 创建或管理密钥；模型列表从该模型提供方的公开 `/v1/models` 端点实时发现，`HYPER_API_KEY` 可用作 `CHARM_HYPER_API_KEY` 的回退别名。

`inception` 是 Inception 的原生 Mercury API。设置 `INCEPTION_API_KEY`，或运行 `/login inception` 并提供在 `https://platform.inceptionlabs.ai/dashboard/api-keys` 获取的密钥，然后选择 `inception/mercury-3`。OMP 从 `/v1/models` 发现聊天模型，包括 Mercury 3、Mercury 2.5 和 Mercury 2；不纳入 FIM 或编辑模型以及仅支持 Decisions 的模型。Mercury 3 支持 1,000,000 token 的上下文，最多可输出 131,072 token。思考档位为 `minimal`、`low`、`medium` 和 `high`；`minimal` 映射到 Inception 的 `instant`，`off` 也会请求这个最低档位，并不会完全关闭推理。Mercury 不会流式传输推理内容，因此不会显示思考文本；`high` 档位的轮次可能在首次输出前沉默数分钟。OMP 最多等待 10 分钟让 Mercury 3 返回首个数据块（可用 `providers.streamFirstEventTimeoutSeconds` 覆盖）。当 `/v1/models` 报告 Mercury 3 的价格为 $0 时，OMP 按公布的上线费率计价（每百万 token 输入 $0.10、输出 $0.35）；`/v1/models` 报告的费率优先。

SingularityAPI 在同一个品牌下销售两项互不相关的产品，因此 OMP 将它们视为两个模型提供方。两者不共用密钥、计费模式或推理强度档位，任何一个主机都不接受另一个的密钥。

`singularityapi-dev` 是按量计费的通用推理网关，提供 300 多个模型，包括 DeepSeek、Kimi、GLM 和前沿旗舰模型。在 `https://app.singularityapi.dev` 创建密钥（或运行 `/login singularityapi-dev`），然后设置 `SINGULARITYAPI_DEV_API_KEY`。模型列表、上限和费率从 `https://api.singularityapi.dev/v1/models` 实时发现。

`singularityapi-tech` 是 DeepSeek 预订通道网关。用量按已预订的时段计费，不从预付余额扣除。即使密钥有效，若没有当前可用的预订时段，仍会返回 403，直到你在 `https://app.singularityapi.tech` 完成预订。在该站点创建 `sk-...` 密钥（或运行 `/login singularityapi-tech`），再设置 `SINGULARITYAPI_TECH_API_KEY`。通道列表从 `https://api.singularityapi.tech/v1/models` 实时发现。

使用 Mistral 时，可将 `MISTRAL_API_KEY` 设为在 Mistral 控制台创建的密钥，也可运行 `/login mistral`，像 Mistral Vibe CLI 一样通过浏览器登录。浏览器登录会签发绑定到 Mistral 套餐的普通 API 密钥。该密钥的用量计入套餐的 Vibe Code 配额，不消耗按量付费 API 积分。OMP 将其存为普通 API 密钥，无需刷新。

使用 OAuth 的模型提供方包括 `anthropic`、`openai-codex`、`github-copilot`、`cursor`、`muse-code`、`ollama-cloud`、`qwen-portal`、`kimi-code`、`xai-oauth`、`wafer-serverless`、`google-antigravity`、`devin` 和 GitLab 模型提供方（`gitlab-duo`、`gitlab-duo-agent`）。通常通过 `/login` 接入这类模型提供方，无需设置环境变量。也支持用 API 密钥交互式登录：`/login baseten`、`/login coreweave`、`/login modal`、`/login sakana`、`/login singularityapi-dev` 和 `/login singularityapi-tech` 会要求输入控制台或 API 密钥（`coreweave` 还需要 `COREWEAVE_PROJECT`，用于 `OpenAI-Project` 请求头）。这里未列出的搜索工具和配置变量见[环境变量](./environment-variables.md)。

`/login kiro` 支持通过 AWS IAM Identity Center、Builder ID、`ksk_…` API 密钥、Google 账户或 GitHub 账户登录。Google 和 GitHub 使用 Kiro 的设备登录流程，会显示指向 `app.kiro.dev` 的链接和一次性代码，因此也可通过 SSH 使用。详情见 [Kiro](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/kiro.md)。

### `.env` 的发现与优先级 \{#env-discovery-and-precedence}

`omp` 在查找模型提供方前，会主动将四个 `.env` 文件加载到进程环境中。对每个变量，优先采用第一个**非空**来源。实际优先级从高到低如下：

1. 进程环境中已有的非空值。
2. `<project>/.env`
3. 当前代理目录的 `.env`（默认 `~/.omp/agent/.env`）。
4. 当前配置根目录的 `.env`（默认 `~/.omp/.env`）。
5. `~/.env`

不会覆盖进程中已有的非空值；空值可以由随后读取的文件填充。项目的非空值优先于代理目录、配置根目录和用户主目录中的文件。各命名配置档案使用自己的配置根目录和代理目录。Bun 也可能在此加载器之前预加载项目 dotenv 的其他变体；已经存在的值视为进程环境中的值。

在项目中使用 `.env`，是让单个仓库采用专用网关、密钥或本地端点的最简单方式：

```dotenv
# <project>/.env
OPENROUTER_API_KEY=sk-or-...
OLLAMA_BASE_URL=http://127.0.0.1:11434
```

`.env` 文件使用 Node 的 `parseEnv` 语法，包括注释、带引号或多行的值以及 `export` 前缀。解析后：

- 键名必须匹配 `[A-Za-z_][A-Za-z0-9_]*`，不匹配的名称会被丢弃；
- 包含 NUL 字节的值会被丢弃；
- 带 `OMP_` 前缀的键会镜像到对应的 `PI_` 名称，并覆盖同一文件中的 `PI_` 条目。

## 内置本地引擎 \{#built-in-local-engines}

Ollama、llama.cpp 和 LM Studio 会自动发现，无需在 `models.yml` 中添加条目。每个引擎都使用一个可通过环境变量覆盖的基础 URL：

| 模型提供方 ID | 基础 URL（环境变量覆盖项 → 默认值） | 说明 |
| --- | --- | --- |
| `ollama` | 先 `OLLAMA_BASE_URL`，再 `OLLAMA_HOST`（会规范化），否则用 `http://127.0.0.1:11434` | 默认无须密钥。 |
| `llama.cpp` | 使用 `LLAMA_CPP_BASE_URL`，否则用 `http://127.0.0.1:8080` | 未配置身份验证时无须密钥。 |
| `lm-studio` | 使用 `LM_STUDIO_BASE_URL`，否则用 `http://127.0.0.1:1234/v1` | 默认无须密钥。 |

隐式发现的 Ollama 和 llama.cpp 模型使用 `openai-responses`；LM Studio 使用 `openai-completions`。在 arm64 架构的 macOS 上，`apple` 也会探测进程内的 Apple Foundation Models 桥接（`local://apple-foundation-models`）。只有桥接报告该模型可用时，才会提供 `apple/on-device`；设备不符合条件、Apple Intelligence 已禁用或构建版本未包含桥接时，均不提供模型。标准提示词与项目指令合在一起，可能超出端侧模型的上下文窗口，因此 OMP 不会自动选择它。可通过 `--model apple/on-device` 或 `/model` 主动选择。

在下列情况下会**跳过**这些隐式引擎：

- `models.yml` 中已配置相同 ID 的模型提供方（显式配置优先）；或
- 模型提供方 ID 出现在实际生效的 `disabledProviders` 列表中。

有关安装及运行这些引擎的方法，参见[本地模型](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/local-models.md)。

## 禁用模型提供方 \{#disabling-model-providers}

使用 `disabledProviders` 设置可让指定模型提供方的模型无法被选择：

```yaml
# ~/.omp/agent/config.yml or <project>/.omp/config.yml
disabledProviders:
   - anthropic
   - openai
   - google
   - groq
```

模型提供方 ID 必须完全匹配。禁用 `google-antigravity` 可隐藏独立的 Google Antigravity OAuth 模型提供方。禁用 `ollama`、`llama.cpp` 或 `lm-studio` 可停止对应引擎的本地发现。

`disabledProviders` 统一适用于：

- 随软件分发的模型目录中的模型提供方；
- 在 `models.yml` 中自定义的模型提供方；
- 运行时发现的模型提供方的模型；
- 由扩展注册的模型提供方；
- 隐式本地引擎。

禁用模型提供方不会删除已保存的凭据。要重新启用，可从实际生效的列表中移除其 ID。

## 按项目控制模型提供方 \{#project-specific-provider-control}

项目设置位于 `<project>/.omp/config.yml`。当某个仓库需要允许或隐藏与全局默认设置不同的一组模型提供方时，请使用项目设置：

```yaml
# <project>/.omp/config.yml
disabledProviders:
   - openai
   - openrouter
```

设置数组会被优先级更高的配置层**整体替换**，不会合并或追加。如果全局配置文件禁用了三个模型提供方，而项目文件禁用了一个，那么项目只能看到项目列表：

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

在该项目中实际生效的结果：

```json
["groq"]
```

项目数组会为从该项目启动的会话重新启用 `anthropic`、`openai` 和 `google`。如果希望某个项目在全局列表上 _追加_ 条目，请在项目文件中再次列出全局 ID。完整的优先级顺序见[设置](./settings.md)，其中包括 `--config` 配置覆盖层和运行时覆盖项。

## 按路径限定作用域的 `disabledProviders` \{#path-scoped-disabledproviders}

`disabledProviders` 可以混用普通字符串条目（全局适用）和按路径限定作用域的条目（仅在当前工作目录匹配所配置的路径时适用）：

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

- 普通字符串条目始终生效。
- 当当前工作目录**就是**所配置的路径，或**位于该路径之下**时，限定作用域的条目才会生效。`~` 会展开为用户主目录。
- 支持的路径键：`path`、`paths`、`pathPrefix`、`pathPrefixes`。
- 支持的值键：`providers`、`values`、`items`。

在上述示例中：

- `ollama` 在所有目录中都被禁用。
- `anthropic` 和 `openai` 在 `~/projects/sensitive` 下也被禁用。
- `openrouter` 在 `~/work/client-a` 和 `~/work/client-b` 下也被禁用。

路径作用域在合并设置**之后**解析。由于高优先级的配置层会替换整个数组，项目级的 `disabledProviders` 数组会丢弃仅存在于全局数组中的路径作用域条目。`enabledModels` 和 `enabledProviders` 也支持这种写法。详情见[设置](./settings.md)。

## 模型提供方 ID 与发现源 ID \{#provider-ids-vs-discovery-provider-ids}

`disabledProviders` 使用**同一个共享的 ID 命名空间**控制两个不同的子系统：

- **模型提供方**：本页介绍的模型后端（`anthropic`、`openai`、`ollama`、自定义 `models.yml` ID 等）。禁用某个模型提供方后，就无法选择它的模型。
- **发现源**：提供上下文文件、MCP 服务器、命令、技能、钩子、工具、提示词和设置的来源。禁用某个发现源后，将不再从该来源获得功能项。

| 条目类型 | 示例 | 效果 |
| --- | --- | --- |
| 模型提供方 ID | `anthropic`、`openai`、`google`、`groq`、`openrouter`、`ollama`、`my-gateway` | 从可用列表中移除该模型提供方的模型。 |
| 发现源 ID | `native`、`claude`、`codex`、`gemini`、`agents`、`github` | 阻止该发现源提供功能项。 |

`enabledProviders` 控制需要显式启用的外部用户级发现源，不是模型提供方的允许列表。项目级的外部来源采用另行定义的发现行为。要限制可选模型，请使用模型设置。

注意区分这些名称。Google Gemini **API** 模型使用的模型提供方 ID 是 `google`；`gemini` 是**发现源** ID（读取 `GEMINI.md` 的来源），并非 Google 的模型提供方。仅当要禁用整个配置来源时，才使用发现源 ID。有关发现源的说明，参见[上下文文件](./context-files.md)。

## `models.yml` 中的自定义模型提供方 \{#custom-providers-in-modelsyml}

自定义模型提供方定义在 `~/.omp/agent/models.yml` 的 `providers:` 下。其中定义的模型提供方 ID 与内置模型提供方遵循相同的选择规则、凭据解析规则及 `disabledProviders` 规则。

最简 OpenAI 兼容模型提供方：

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

`/login zai` 使用面向全球的 Z.AI Coding Plan 端点，`/login zhipu-coding-plan` 使用中国国内的智谱 Coding Plan 端点。这两个登录流程都不会配置位于 `https://open.bigmodel.cn/api/paas/v4` 的通用 BigModel 按量付费端点。

使用标准 BigModel 账户余额签发的 API 密钥时，请配置自定义模型提供方：

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

将 `BIGMODEL_API_KEY` 设为 `<id>.<secret>` 格式的密钥后启动 `omp`，然后选择 `bigmodel/glm-4.6`。这种密钥没有 `sk-` 前缀。

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

完整的配置结构、所有允许的 `api` 值、发现 `type`、模型覆盖项及等价性设置，参见[模型与模型提供方配置](./models.md)。

要禁用某个自定义模型提供方，请按原样列出其 ID：

```yaml
disabledProviders:
   - my-openai-compatible
   - team-proxy
```

## 故障排查 \{#troubleshooting}

**无法选择某个模型提供方的模型。** 确认该模型提供方有凭据（通过 `/login <provider>`、已导出的环境变量，或者 `models.yml` 中的 `apiKey` 提供），且其 ID 不在实际生效的 `disabledProviders` 列表中。规则是：未禁用，**且**（无密钥**或**已有凭据）。首次填充发现结果时，本地引擎必须能够响应。之后，缓存的目录条目可能仍然可见，但推理仍需要引擎运行。Apple 模型的可用性由进程内的桥接检查。

**使用了错误的密钥（例如 `.env` 中的旧密钥）。** 解析时，运行时的 `--api-key` 优先，其次是 `models.yml` 中配置的密钥、已保存的 OAuth 凭据、通过 `/login` 保存的密钥、扩展配置回退项、环境变量或 `.env`，最后是其他已保存的 API 密钥。进程环境中的非空值还优先于所有 `.env` 文件，`<project>/.env` 中的非空值优先于 `~/.env`。如果实际使用了意外的密钥，请按优先级检查 Shell 中已导出的变量和四个 `.env` 文件，清除不应生效的那一项。

**禁用后，模型提供方仍然显示。** `disabledProviders` 数组按层替换，不会合并。项目 `<project>/.omp/config.yml` 中的数组会完全覆盖全局数组。请检查当前目录中 _实际生效_ 的列表（按路径限定作用域的条目只在所配置的路径及其下级目录生效），并确认 ID 拼写完全一致。可用 `omp config get disabledProviders` 查看合并后的值（参见[设置](./settings.md)）。

**发现源名称未影响模型，或模型提供方名称未影响发现源。** 两者共用 ID 命名空间。`gemini`、`codex`、`claude`、`native` 和 `agents` 是发现源 ID；Google 的模型后端是 `google`。请确认禁用的是正确类型的条目。

**无法加载 `models.yml` 中的自定义模型提供方。** YAML 或配置结构错误会使注册表跳过自定义文件。可用 `omp models` 验证该文件（用 `omp models find <substr>` 将检查范围限定为一个模型提供方）。定义了自定义 `models` 的模型提供方需要 `baseUrl`、身份验证（`apiKey`，但设为 `auth: none` 或 `auth: oauth` 时除外），并在模型提供方级别或每个模型上指定 `api`。没有定义模型的模型提供方也可以生效，前提是至少定义一项受支持的覆盖项（`baseUrl`、`headers`、`apiKey`、`auth: none`、`compat`、`disableStrictTools`、`guardrailIdentifier`、`requestMetadata`、`remoteCompaction`、`modelOverrides` 或 `discovery`）。启用发现的模型提供方可以省略 `models`，但需要在模型提供方级别指定 `api`，除非 `discovery.type` 是 `proxy`。显式定义的 `ollama`、`lm-studio` 或 `llama.cpp` 条目会按设计替换对应 ID 的内置发现。参见[模型与模型提供方配置](./models.md)。
