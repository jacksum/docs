---
title: "Kiro"
description: "Oh My Pi 官方仓库文档：Kiro。"
---

# Kiro \{#kiro}

Kiro 是由 Kiro API（`kiro-api`）支持的原生提供方。通用的凭据优先级和提供方配置，参见[提供方](./providers.md)；传输细节参见[提供方特性](./provider-quirks.md#kiro)。

## 快速开始 \{#quick-start}

1. 运行 `/login kiro`。
2. 对 AWS 组织选择 **Identity Center**，对个人 AWS Builder ID 选择 **Builder ID**，对 `ksk_…` 密钥选择 **API key**，或选择 **Google** / **GitHub** 使用对应账户登录。
3. 从发现的目录中选择一个 `kiro/<model-id>` 模型。

## 登录方式 \{#login-methods}

**Identity Center** 执行 AWS IAM Identity Center 设备登录。OMP 会询问 **Start URL**（你的 HTTPS 访问门户 URL，例如 `https://company.awsapps.com/start`）和 **OIDC 区域**，显示验证 URL 和一次性代码，并等待浏览器批准。随后 OMP 会列出该区域所属分区中的 Kiro 配置档案：商业 AWS 为 `us-east-1` 和 `eu-central-1`，OIDC 区域为 AWS GovCloud (US) 区域时则为 `us-gov-west-1` 和 `us-gov-east-1`。有多个 Kiro 配置档案可用时，由你选择一个；选中的配置档案决定请求和发现使用的区域。AWS GovCloud (US) 只支持 Identity Center：其中不可使用 Builder ID 和 Google/GitHub 登录。

**Builder ID** 通过相同的设备流程使用个人 AWS Builder ID 登录，固定使用公共 Builder 门户和 `us-east-1`，因此无需询问任何信息。

**Google** 和 **GitHub** 使用 Kiro 的设备登录：OMP 显示指向 `app.kiro.dev` 的链接和一次性代码，由你在浏览器中批准。不涉及本地回调服务器，因此可通过 SSH 或在无界面机器上使用。

**API key** 接受 `ksk_…` 密钥，对其进行验证，并与解析出的区域一起存储。`KIRO_API_KEY` 是环境变量回退来源。已知密钥区域时，设置 `KIRO_API_REGION`：

```sh
export KIRO_API_KEY=ksk_...
export KIRO_API_REGION=us-east-1
```

`KIRO_API_REGION` 会将没有已存储区域的 API 密钥（例如 `KIRO_API_KEY`）固定到该区域，用于模型发现和请求。未设置时，OMP 会探测引导区域 `us-east-1` 和 `eu-central-1`，并且只有一个区域接受密钥时才使用它。无效区域会报错。

## 模型和发现 \{#models-and-discovery}

模型列表按凭据发现，绝不内置于 OMP 的目录，因为它取决于登录的账户。在你选择模型之前，Kiro 默认为 `auto`。Identity Center、Builder ID、Google 和 GitHub 的模型缓存按每次登录隔离，API 密钥则按密钥和区域隔离，因此一个账户的列表绝不会复用于另一个账户。

## 账户和用量 \{#accounts-and-usage}

与其他所有提供方一样，每次 `/login kiro` 都会添加一个账户，因此同一个人再次登录会添加第二个条目；使用 `/logout` 移除旧条目。

每次 OAuth 登录都会获得随机登录 ID，其身份键为 `account:<login id>`。在账户池中使用该键，或在 `auth.accountPolicies` 中通过 `account: { accountId: "<login id>" }` 匹配它。`ksk_…` API 密钥没有身份键。

`/usage` 显示每个账户的月度套餐额度及重置日期、有效的奖励额度和已购买附加额度及其到期时间，以及在 Kiro 账户中启用超额计费时的超额额度。有多个账户时，请求优先选择仍有套餐、奖励或附加额度的账户；只能使用超额额度的账户最后才使用。

附加额度会在 Kiro 报告的时间到期。OMP 只在当前列表缺失或为空时读取旧版已购买额度列表，因此同一笔购买绝不会重复计算。

## 退出登录和重新登录 \{#logout-and-re-login}

使用 `/logout` 并选择 Kiro，可移除已存储的 Kiro 凭据。它不会移除由环境变量提供的 `KIRO_API_KEY`。

刷新发生无法恢复的失败时（`invalid_grant`、`expired_token`、`invalid_client`、刷新状态缺失，或 Google/GitHub 的 HTTP 400/401），OMP 会禁用已存储的凭据，并要求你重新运行 `/login kiro`。其他刷新失败会重试。AWS 配置档案、Start URL 或 OIDC 区域改变后，也应重新登录。

## 故障排查 \{#troubleshooting}

### `Kiro API key did not resolve to one region` \{#kiro-api-key-did-not-resolve-to-one-region}

将 `KIRO_API_REGION` 设置为签发密钥的区域，然后重新运行 `/login kiro` 并选择 **API key**。

### 登录后没有 Kiro 模型 \{#no-kiro-models-after-login}

检查选中的模型是否属于 `kiro` 提供方，等待在线发现，并确认选中的 AWS 配置档案或 API 密钥区域。

### Builder ID 登录未启动 \{#builder-id-login-does-not-start}

确认设备代码页面能在浏览器中打开，然后检查网络策略是否阻止了 `oidc.us-east-1.amazonaws.com`。
