---
title: "安装 ID"
description: "Oh My Pi 官方仓库文档：安装 ID。"
---

# 安装 ID \{#install-id}

每次安装持久保存的 UUID，在会话和配置档案之间共享。当提供方兼容协议、账号范围内的设备元数据、身份验证代理用量报告或去重诊断推送需要稳定的安装身份时，由它提供。UUID 本身是随机的，不根据主机名、用户名、硬件或账号数据派生。

## API \{#api}

从 `@oh-my-pi/pi-utils`（`packages/utils/src/dirs.ts`）导出：

| 符号 | 用途 |
| --- | --- |
| `getInstallId(): string` | 返回安装 ID，在首次调用时生成并持久保存。结果在运行时的整个生命周期内缓存在进程中。 |
| `__resetInstallIdCacheForTests(): void` | 清除进程内缓存。仅供测试，禁止从生产代码中调用。 |

生成的 ID 是小写 UUID v4 值。读取已有的持久保存值时，先去除首尾空白，再使用带 `i` 标志的正则表达式 `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` 进行不区分大小写的匹配，匹配成功则接受该值；其大小写保持不变。读取检查不限制 UUID 版本或变体。

## 存储 \{#storage}

- 路径：`<base-config-root>/install-id`，即默认为 `~/.omp/install-id`，遵循 `PI_CONFIG_DIR`。相对于基础配置根目录（`getBaseConfigRoot()`）解析，不受当前配置档案或 XDG 数据/状态/缓存路由影响，因此使用该基础根目录的所有配置档案共享一个安装 ID。
- 格式：单行 UUID（末尾带 `\n`）。
- 权限：以模式 `0o600` 创建文件。
- 生命周期：独立于 `~/.omp/agent/`。清除智能体状态（会话、设置、数据库）不会重新生成安装 ID；只有删除 `install-id` 文件本身才会重新生成。

## 生成与生命周期 \{#generation-and-lifecycle}

1. 首次调用 `getInstallId()` 时读取文件。如果内容可解析为有效 UUID，则缓存并返回该值。
2. 否则，辅助函数调用 `crypto.randomUUID()`（Node 由 CSPRNG 支持的 UUID v4）生成新 ID。
3. 通过 `open(O_WRONLY | O_CREAT | O_EXCL, 0o600)` 写入新值。排他创建保护可防止竞争创建者覆盖文件；收到 `EEXIST` 的失败方会重新读取文件，如果其中已有有效 UUID，就采用该值。
4. 如果已有文件包含非空的无效内容（未通过 UUID 正则表达式），则在排他创建之前对其执行 `unlink`，避免 `O_EXCL` 因旧数据而失败。
5. 写入失败（只读文件系统、权限错误），或出现 `EEXIST` 后读取到不可读/无效的值时，错误会被忽略：新生成的 UUID 仍会缓存在内存中，使进程的其余部分看到稳定的值。后续启动会重试。已有空文件不会被取消链接，因此可能导致连续启动的进程使用不同的内存 ID。
6. 后续进程内调用直接返回缓存值，不访问磁盘。首次调用后修改磁盘上的文件不会生效，直到进程重启（或测试调用 `__resetInstallIdCacheForTests`）。

## 使用方 \{#consumers}

| 使用方 | 用途 |
| --- | --- |
| `packages/ai/src/providers/openai-codex-responses.ts` | 将该值作为 OpenAI Codex 兼容的 `installationId` 发送，同时发送每个会话/线程/窗口的 ID。 |
| `packages/ai/src/providers/anthropic-identity.ts` 和 `packages/coding-agent/src/session/session-metadata.ts` | 根据安装 ID 派生兼容 Claude 的 `device_id` 元数据，在有 Anthropic 账号 UUID 时以该 UUID 为范围。原始安装 ID 不用作设备 ID。 |
| `packages/ai/src/auth-broker/remote-store.ts` | 在发送给身份验证代理的默认观测用量归属信息中使用它，同时包含主机名和应用名称；报告也可以携带发起客户端的身份。 |
| `packages/ai/src/providers/pi-native-client.ts` 和 `packages/ai/src/auth-gateway/http.ts` | 向网关发送 `x-omp-install-id`、`x-omp-hostname` 和 `x-omp-app`，用于将用量归属到发起客户端。缺少这些信息时，网关回退到自身的安装 ID，且不会将这些标头转发给上游。 |
| `packages/ai/src/usage/opencode-go.ts` 和 `packages/catalog/src/provider-models/openai-compat.ts` | 分别在 OpenCode Go 用量轮询和 OpenCode 模型发现中，将其作为 `x-opencode-session` 发送。 |
| `packages/coding-agent/src/tools/report-tool-issue.ts` | 在自动 QA 问题反馈推送中将其作为 `installId` 包含在内，使后端能够关联同一安装的报告。 |

新的使用方必须将该值视为不透明值。辅助函数不提供个人身份信息，但传输时仍可能将其与其他元数据一同发送；每个使用方仍有责任记录并尽量缩减其完整载荷。

## 另请参阅 \{#see-also}

- [environment-variables.md](./environment-variables.md)：`PI_CONFIG_DIR` 控制 `install-id` 的存放位置。
- [config-usage.md](./config-usage.md)：更广泛的配置根目录布局。
