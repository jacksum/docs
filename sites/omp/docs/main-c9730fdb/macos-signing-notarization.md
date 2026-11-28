---
title: "macOS 签名与公证"
description: "Oh My Pi 官方仓库文档：macOS 签名与公证。"
---

# macOS 签名与公证 \{#macos-signing--notarization}

编译后的 macOS `omp` 二进制文件（由 build.stencil.so 提供并附加到
GitHub Releases）可以使用
**Developer ID Application** 证书签名，并由 Apple **公证**。当公证票据
可用时，这使它们具备被 Gatekeeper 接受的资格。
仓库还维护一个 Homebrew tap；formula 安装
与浏览器下载的隔离行为不同（见下文）。

与其他所有发布构建一样，macOS 二进制文件在
Linux 上构建和签名：`release_binary` 矩阵的 Darwin 分支
(`.github/workflows/ci.yml`) 使用 bun 交叉编译它们，并通过
`scripts/ci-macos-sign.sh` 签名，该脚本驱动
[rcodesign](https://github.com/indygreg/apple-platform-rs)（`codesign` 和 `notarytool` 的开源
实现，由脚本固定版本并检查 sha256）。配置下述全部五个 `APPLE_*` 仓库机密后，
脚本会使用 Developer ID 签名并公证；一个都没有时，则进行临时签名
（相同的授权项），使发布版仍能运行。只配置一部分会报错。

## 工作原理 \{#how-it-works}

1. `ci:release:build-binaries` 在 Linux 上交叉编译二进制文件。Bun 自身的
   签名无法用于交付：arm64 得到的是裸链接器签名，而 x86_64
   保留 Bun 运行时的 Developer ID 签名，它已不再与
   追加的载荷匹配。
2. `scripts/ci-macos-sign.sh` 替换该签名。有凭据时，它会：
   - 使用 Developer ID 证书、强化运行时
     (`--code-signature-flags runtime`)、安全时间戳
     (`--for-notarization`) 及 `scripts/macos-entitlements.plist` 签名，保留
     文件名 (`omp-darwin-<arch>`) 作为签名标识符；
   - 将二进制文件打包成 ZIP，并用
     `rcodesign notary-submit --wait` 提交，提交失败时最多重试三
     次。退出时移除凭据文件。
3. `release_smoke` 在任何发布发生之前，分别在对应硬件 (`macos-15-intel`、
   `macos-15`) 上运行每个二进制文件：先执行 `codesign --verify --strict`，
   再在最终签名下运行 `--version` 和 `--smoke-test`，这就是
   强化运行时启动检查。配置签名机密时，它还会
   断言签名不是临时签名。`release_github` 和
   `release_build` (build.stencil.so) 发布的是这些相同产物，因此没有环节
   会重新验证已发布资源。
4. 对非 canary 发布，在 `release_build`
   发布下载文件后，`release_brew` 会重新生成并推送指向 build.stencil.so 下载的 tap formula。
   缺少 `HOMEBREW_TAP_DEPLOY_KEY` 时会跳过；
   此机密独立于签名。

### 为什么授权项是必需的 \{#why-the-entitlements-are-mandatory}

该二进制文件是 Bun 单文件可执行程序，还会启动 Xcode 的 MCP
桥接，因此强化运行时需要：

| 授权项 | 原因 |
| --- | --- |
| `com.apple.security.cs.allow-jit` | JavaScriptCore 在运行时进行 JIT 编译。 |
| `com.apple.security.cs.allow-unsigned-executable-memory` | JSC 可执行内存页。 |
| `com.apple.security.automation.apple-events` | 允许 macOS 在 `xcrun mcpbridge` 连接 Xcode 时提示请求“自动化”权限；没有它，首次 Xcode MCP 初始化会挂起直至超时。 |
| `com.apple.security.cs.disable-library-validation` | omp 将原生插件 (`pi_natives.<triple>.node`) 及其他可选 dylib 提取到运行时缓存，再通过 `dlopen()` 加载。它们与主二进制文件的 Team ID 不同，因此没有此项时，强化运行时会中止并报出 _"mapping process and mapped file have different Team IDs"_（映射进程与被映射文件的 Team ID 不同），几乎所有命令都会因此失效。 |

没有 `disable-library-validation` 时，已签名并公证的二进制文件虽然能正常完成签名和
公证，却会**在首次实际使用时失败**。`release_smoke` 特意在
交付签名下运行 `--smoke-test`，以便在任何发布发生前捕获此问题。

### 票据装订限制（重要） \{#stapling-limitation-important}

裸 Mach-O 可执行文件**无法装订票据**（`stapler` 只支持
`.app`/`.pkg`/`.dmg`）。二进制文件确实已被公证：公证服务
返回 `Accepted`，且票据存在于 Apple 服务器上，以其 cdhash 为键，但
票据必须在线获取，而不能从可执行文件读取。
`release_smoke` 会报告 `spctl -a -t exec -vv` 供查看，但不会
将其作为发布门槛：在线票据不可用时，未装订票据的裸二进制文件可能产生非零
评估结果，这本身并不表示
签名或凭据失败。

实际影响如下：

- `curl https://omp.sh/install | sh`：`curl` 不设置隔离位，因此
  不会咨询 Gatekeeper。
- Homebrew **formula** 安装：Homebrew 不会隔离 formula 文件，因此
  不会咨询 Gatekeeper。
- 任何将二进制文件**隔离**的方式（浏览器下载或 Homebrew
  **cask**）都需要在线向 Apple 查询票据。若要生成可离线分发的
  产物，应将二进制文件封装在可装订票据且已公证的 **`.pkg` 或 `.dmg`** 中
  （`rcodesign staple` 支持这些格式）。
  `curl`/formula 路径不需要这样做。

## 必需的 GitHub 机密 \{#required-github-secrets}

在 **Settings → Secrets and variables → Actions** 下添加这些内容（仓库机密）。
全部五个机密（证书、密码及 API 密钥三项）都必须存在，
才会启用签名。

| 机密 | 内容 |
| --- | --- |
| `APPLE_CERTIFICATE_P12` | 导出的 Developer ID Application `.p12`（证书 + 私钥）的 base64。 |
| `APPLE_CERTIFICATE_PASSWORD` | 导出 `.p12` 时设置的密码。 |
| `APPLE_API_KEY_ID` | App Store Connect API **Key ID**。 |
| `APPLE_API_ISSUER_ID` | App Store Connect API **Issuer ID** (UUID)。 |
| `APPLE_API_KEY` | App Store Connect `.p8` 私钥的 base64。 |

### 生成凭据文件 \{#producing-the-credential-files}

将以下文件放入工作目录（默认 `~/omp-signing`）：

| 文件 | 方法 |
| --- | --- |
| `*.p12` | **钥匙串访问** → 右键点击你的 _Developer ID Application: …_ 身份（展开后显示证书**及**私钥的条目）→ **导出…** → 保存为 `.p12` 并设置密码。 |
| `p12-password.txt` | 刚为 `.p12` 设置的密码。 |
| `AuthKey_<KEYID>.p8` | App Store Connect → **Users and Access → Integrations → App Store Connect API** → 创建密钥（**Account Holder** 角色还允许通过 API 创建证书；**Developer** 足以进行公证）→ **下载一次**（无法恢复）。 |
| `issuer-id.txt` | 密钥表格上方显示的 **Issuer ID** (UUID)。 |
| `key-id.txt` | _可选_：Key ID；否则从 `.p8` 文件名中读取。 |

App Store Connect API 密钥是**无法**通过 CLI 生成的那项凭据，
它是 API 自身的引导凭据，且 `.p8`
只能下载一次。其他所有内容都在本地处理。

### 上传凭据文件 \{#uploading-credential-files}

`scripts/ci-macos-upload-secrets.sh` 要求恰好有一个 `.p12` 和一个 `.p8`，
它将证书导入临时钥匙串以验证密码和
Developer ID 身份，并检查 `.p8` 是否包含 PEM 私钥
头。它通过 stdin 将每个上传值传给 `gh secret set`，而不是
将其放入 `gh` 参数或打印凭据载荷。验证时
确实会通过 `security import -P` 传递证书密码，因此密码
可能出现在该子进程的参数中。脚本会打印文件名
和 Key ID。

```sh
scripts/ci-macos-upload-secrets.sh ~/omp-signing --dry-run   # validate first
scripts/ci-macos-upload-secrets.sh ~/omp-signing             # upload all five
gh secret list --repo can1357/oh-my-pi                       # confirm
```

每次续期证书后重新运行它。`OMP_SIGNING_DIR` 更改
默认输入目录；`OMP_REPO=owner/repo` 更改目标仓库
（默认 `can1357/oh-my-pi`）。验证路径需要 macOS `security`；
上传还需要已通过身份验证的 `gh` CLI。

### 查找签名身份 / Team ID（合理性检查） \{#finding-your-signing-identity--team-id-sanity-check}

```sh
security find-identity -v -p codesigning
# e.g. "Developer ID Application: Your Name (TEAMID1234)"
```

`.p12` 携带单个身份，rcodesign 使用它签名；无需
将身份字符串或 Team ID 存储为机密。

## 本地试运行 \{#local-dry-run}

通过导出五个环境变量并运行以下命令，可以在 Linux 机器上演练完整的签名 + 公证路径
（真实证书 + API 密钥）：

```sh
RELEASE_TARGETS=darwin-arm64 bun run ci:release:build-binaries
APPLE_CERTIFICATE_P12=… APPLE_CERTIFICATE_PASSWORD=… \
APPLE_API_KEY_ID=… APPLE_API_ISSUER_ID=… APPLE_API_KEY=… \
  bash scripts/ci-macos-sign.sh packages/coding-agent/binaries/omp-darwin-arm64
```

没有这些环境变量时，同一命令会进行临时签名。
