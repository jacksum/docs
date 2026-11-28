---
title: "添加模型提供方"
description: "Oh My Pi 官方仓库文档：添加模型提供方。"
---

# 添加模型提供方 \{#adding-a-provider}

内置模型提供方分为两部分描述：

- **目录部分**（`packages/catalog`）：`src/compat/rules/providers/<id>.kdl` 中的一个 `provider "<id>"` 条目，包含默认模型、环境变量、目录发现策略、种子模型和模型提供方兼容性规则。运行时发现工厂位于 `src/provider-models/descriptors.ts` 的 `MODEL_MANAGER_FACTORIES` 表中。`PROVIDER_DESCRIPTORS` 和 `DEFAULT_MODEL_PER_PROVIDER` 由编译后的目录条目及该工厂表派生。
- **身份验证部分**（`packages/catalog` + `packages/ai`）：`packages/catalog/src/compat/rules/auth/<id>.kdl` 中的一个 `auth "<id>"` 条目。`packages/ai/src/registry/build.ts` 将编译后的策略解释为 `ProviderDefinition`。OAuth 模型提供方联合类型、环境变量密钥映射、`/login` 模型提供方列表、登录/刷新分派及编程智能体回调映射均由此注册表派生。只有在声明式引擎无法表达相应行为时，才需要模型提供方专用的 TypeScript 钩子。

**范围。** 本文适用于复用现有传输 API（`openai-completions`、`openai-responses`、`anthropic-messages`、`google-generative-ai` 等）的模型提供方。分派依据是 `model.api`，而不只是 `model.provider`。新的内置传输协议还需要其传输实现及在 `packages/ai/src/providers/register-builtins.ts` 中的注册、`stream.ts` 中的分派、`api-registry.ts` 中的保留 API 注册，以及目录 API 和兼容性/编译器定义。扩展则可以注册自定义 API。

## 组成 \{#shape}

对于 API 密钥网关，从目录和身份验证 KDL 文件开始；仅在模型提供方支持列出模型时添加发现工厂。

1. **添加 `packages/catalog/src/compat/rules/providers/<id>.kdl`。**
   `default-model` 使该条目成为目录模型提供方；不含它的模型提供方规则只用于传输协议兼容性。将常规 API 密钥环境变量名按优先顺序放入 `env`。需要捆绑模型时，添加经过审查的种子行；端点与 API 默认行为不同时，添加模型提供方/模型兼容性指令。
2. **添加 `packages/catalog/src/compat/rules/auth/<id>.kdl`。**
   `name` 为必填项。仅使用环境变量的模型提供方不需要 `login` 节点。对于简单的 API 密钥登录，声明控制台 URL、提示及适当的受保护验证端点。公开的 `/models` 端点无法验证密钥。身份验证的 `env` 会覆盖目录的 `env`；可用它定义身份验证专用别名或 `env hook="…"` 计算解析器。
3. **如果登录可见，将其 ID 添加到 `auth/_order.kdl`。**
   编译器要求所有可见且可登录的模型提供方都位于 `login-order` 中。`packages/ai/src/registry/` 中没有手动维护的 `ALL` 数组，也没有按模型提供方划分的定义文件。
4. **如果模型可被发现，在 `packages/catalog/src/provider-models/descriptors.ts` 的 `MODEL_MANAGER_FACTORIES` 中添加工厂。** 简单的 OpenAI 兼容网关可以调用 `provider-models/openai-compat.ts` 导出的 `createSimpleOpenAICompletionsOptions(providerId, baseUrl, config)`。单独一个 KDL `discovery` 节点不会创建运行时工厂。专用的 Google OAuth 和 Codex 管理器则由编程智能体运行时构建。
5. **重新生成编译后的规则和捆绑目录。** 从仓库根目录运行 `bun run gen:compat`，然后带上该模型提供方所需的发现凭据运行 `bun run gen:models`。`gen:compat` 写入 `packages/catalog/src/compat/rules.json`。如果只更新一个模型提供方的目录，使用 `bun run gen:models --provider <id>` 重新生成该模型提供方，同时保留其他所有模型提供方已提交的快照。生成器仍可使用跨模型提供方的参考数据。不要手动编辑这些生成文件。

例如，静态 OpenAI 兼容网关可以如下声明其目录行：

```kdl
provider "my-gateway" {
    default-model "chat-model"
    env "MY_GATEWAY_API_KEY"
    seed api="openai-completions" base-url="https://gateway.example.com/v1" {
        model "chat-model" name="Gateway Chat" {
            reasoning #false
            input "text"
            cost input=1 output=2 cache-read=0 cache-write=0
            limits context=128000 max-tokens=8192
        }
    }
}
```

它仅使用环境变量的身份验证策略为：

```kdl
auth "my-gateway" {
    name "My Gateway"
}
```

上述端点、限制、模态和每百万 token 价格都是示例值；请使用模型提供方经核实的部署契约。`packages/catalog/src/compat/rules/auth/` 下的示例包括：通过推理验证 API 密钥登录的 `deepinfra.kdl`、采用声明式授权码流程的 `anthropic.kdl`，以及采用自定义流程的 `github-copilot.kdl`。

## 字段参考 \{#field-reference}

**目录 KDL**（由 `packages/catalog/scripts/compat-compiler/compile-providers.ts` 编译）：

| 节点 | 作用 |
| --- | --- |
| `default-model "id"` | 目录条目的必填项。提供 `DEFAULT_MODEL_PER_PROVIDER`。 |
| `env "VAR" …` | 按顺序排列的运行时 API 密钥环境变量回退项，除非被身份验证策略覆盖。 |
| `allow-unauthenticated #true` | 允许在无凭据的情况下创建运行时发现管理器。它本身不会让托管推理变为无需密钥。 |
| `dynamic-models-authoritative #true` | 成功发现后替换捆绑的模型提供方模型，而不保留仅用于回退的 ID。 |
| `skip-cross-provider-reference-fills #true` | 防止生成时从其他模型提供方的相同 ID 行借用推理能力、模态和限制。 |
| `keep-bundled-names #true` | 运行时发现及其缓存保留捆绑行的显示名称，而不使用实时名称，这样模型名称不会在发现完成后改变。适用于实时名称类似 slug 的主机（`openai-codex`）。 |
| `discovery label="…"` | 为带有发现工厂的条目启用目录生成。可选的 `oauth-provider`、`allow-unauthenticated` 和子节点 `env` 用于选择生成时的凭据/策略。 |
| `seed api="…" base-url="…"` | 定义经过审查的模型行；各行可覆盖 API 和基础 URL。每行需要 `name`、`reasoning`、`input`、`cost` 和 `limits`。 |
| 种子的 `bundle` / `precedence` | `bundle="always"` 为默认值；`"fallback"` 在权威发现后省略种子，`"empty"` 则仅在模型提供方没有任何行时输出种子。默认的 `precedence="upstream"` 让上游行优先；`"seed"` 则固定使用种子行。 |
| `kind-apis { … }` | 将非聊天目录类型映射到其运行器 API。 |
| 兼容性/思考/目录指令 | 部署策略，可选择将范围限定为类别、修订版、系列或模型 ID。参阅 `src/compat/axes.ts` 和现有模型提供方规则。 |

**身份验证 KDL**（由 `packages/catalog/scripts/compat-compiler/compile-auth.ts` 编译）：

| 节点 | 作用 |
| --- | --- |
| `name "…"` | 必填的显示名称。 |
| `env "VAR" …` / `env hook="…"` | 使用有序列表或计算解析器覆盖目录环境变量回退项。 |
| `login "api-key" { … }` | 粘贴密钥登录，可选择进行验证。 |
| `login "oauth-code" { … }` | 声明式授权码流程。需要显式的 `refresh` 策略。 |
| `login "device-code" { … }` | 声明式设备码流程。需要显式的 `refresh` 策略。 |
| `login "custom" hook="…"` | 声明式语法不足以表达时，使用延迟加载的完整流程钩子。 |
| `refresh { … }` / `refresh hook="…"` / `refresh "none"` | token 刷新策略、自定义刷新器或显式的不刷新策略。 |
| `available #false` | 将登录条目标记为不可用。 |
| `show-in-login-list #false` | 从交互式列表中隐藏登录流程。 |
| `store-as "id"` | 将凭据存储在另一个模型提供方 ID 下。 |
| `callback-port N`, `paste-code #true` | 编程智能体/代理服务回调元数据；授权码 OAuth 流程从其回调策略派生这些值，除非被覆盖。 |
| `device-bound #true` | 登录依赖本机独有的密钥；它们保留在本地 `agent.db` 中，永不传送到身份验证代理服务。 |
| `sign-out hook="…"` | 移除登录时运行：在上游撤销授权。 |
| `oauth-token-env "VAR" …` | 专用的 OAuth 环境变量 token；借用的 API 密钥别名不会使此模型提供方自动可用。 |
| `org-scoped-identity #true` | 区分已存储的账户时，同时依据组织和身份。 |
| `api-key-format "structured"` | 声明传输专用的凭据编码，而不是普通的 bearer。 |
| `allows-missing-api-key #true`, `native-auth-api "api" …` | 标记由传输层负责的身份验证路径。 |

`packages/catalog/src/compat/types.ts` 中编译后的类型和编译器构成完整的语法参考。实体化的运行时接口是 `packages/ai/src/registry/types.ts` 中的 `ProviderDefinition`，它不是内置模型提供方的编写格式。

## 约定 \{#conventions}

- 将纯粹的模型提供方/模型策略放在 KDL 中，而不是在传输层添加按模型提供方名称判断的分支。`packages/catalog/src/compat/resolve.ts` 中的 `resolveModelPolicy` 依次应用 API 默认值、端点检测、KDL 级联，以及稀疏的模型覆盖项/修正项；随后解析思考元数据。
- API 密钥、授权码 OAuth、设备码和刷新流程优先使用 `packages/ai/src/registry/engine/` 中的共享引擎。在 `registry/hooks/` 下相应的领域表中注册计算或自定义部分。
- 大型模型提供方本地 OAuth 模块放在 `registry/oauth/` 下，并且必须通过延迟加载的钩子导入访问，而不是通过立即加载的注册表导入访问。
- 确实需要代码进行的请求/模型/发现整形，应放在 `ProviderTransport` 中，并在 `registry.ts` 的 `TRANSPORTS` 表中添加条目。钩子包括 `prepareModel`、`prepareRequest`、`mapSimpleOptions` 和 `prepareModelDiscovery`。
- 扩展通过 `registerOAuthProvider` 注册 `OAuthProviderInterface`，而不是注册内置 KDL 策略或传输定义。内置和扩展登录使用同一个 `AuthStorage.oauth.login` 分派器；扩展的模型/API 注册单独处理。
- 针对实际受凭据保护的接口测试登录，测试模型发现，以及在支持的情况下带工具/推理的推理调用。在复用协议适配器或添加兼容性策略前，检查[端点约束](./provider-endpoint-constraints.md)。
