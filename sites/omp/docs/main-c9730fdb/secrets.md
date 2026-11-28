---
title: "密钥混淆"
description: "Oh My Pi 官方仓库文档：密钥混淆。"
---

# 密钥混淆 \{#secret-obfuscation}

对发送给 LLM 提供方的对话消息中的敏感值（API 密钥、令牌、密码）进行脱敏。启用后，会在支持的消息和重放文本字段中替换已配置的密钥，以及符合内置凭据形态令牌模式的内容。静态系统提示、静态工具定义和二进制载荷不由此子系统脱敏。模型编写的工具参数会在执行前还原可逆占位符；为显示或恢复而重建本地会话上下文时，也会还原这些占位符。

## 启用 \{#enabling}

默认禁用。可通过 `/settings` 界面切换，或直接在 `config.yml` 中设置：

```yaml
secrets:
   enabled: true
```

## 工作原理 \{#how-it-works}

1. 会话启动时，从以下来源收集密钥：
   - **环境变量**：名称匹配常见密钥模式（`KEY`、`SECRET`、`TOKEN`、`PASSWORD`、`PASS`、`AUTH`、`CREDENTIAL`、`PRIVATE`、`OAUTH`），且值至少为 8 个字符
   - **`secrets.yml` 文件**（见下文）
   - 内置可逆正则表达式，用于匹配仅出现在会话内容或工具结果中的常见凭据形态：GitHub、GitLab、OpenAI 和 Anthropic 令牌、AWS 访问密钥、Google API 密钥、Slack 令牌、npm 令牌、Stripe 私密密钥和受限密钥及 Webhook 密钥、Hugging Face 令牌、SendGrid 密钥、JWT、Bearer 标头令牌，以及 PEM 私钥块
   - 嵌在连接 URL 环境变量值中的密码：任何包含 `scheme://user:password@host` 风格值的变量（例如 `DATABASE_URL`），只要其中密码至少为 8 个字符，就会注册该密码，无论变量名是什么。原始形式和百分号解码形式只要满足该长度限制，都会被收集。

2. 在提供方可见的文本中，匹配值会替换为确定性占位符，例如 `$$3P8W5JH1TK2Q$$`、`$$3P8W5JH1TK2Q:L$$` 或 `$$GITHUBTOKEN_3P8W5JH1TK2Q:L$$`。

3. 对实时的模型编写工具参数进行深度遍历，在工具执行前还原占位符。会话上下文会为本地显示或恢复还原占位符，并在向提供方重放前重新混淆。替换模式的替换是单向的，不会还原。

每个密钥的处理方式由两种模式控制：

| 模式 | 行为 | 可逆 |
| --- | --- | --- |
| `obfuscate`（默认） | 替换为确定性的 `$$HASH(:hint)$$` 或 `$$FRIENDLY_HASH(:hint)$$` 占位符 | 是 |
| `replace` | 替换为配置的 `replacement`，省略时替换为确定性的等长值 | 否 |

混淆模式会忽略短于 8 个字符的普通值和正则匹配，以免对普通短词脱敏。替换模式可处理短值；未提供自定义替换值的替换模式正则表达式，只有在每个可能的 1-2 字符匹配都无法脱敏为不同于原值的稳定值时，才会被拒绝。

## secrets.yml \{#secretsyml}

在 YAML 中定义自定义密钥条目。会检查两个位置：

| 级别 | 路径 | 用途 |
| --- | --- | --- |
| 全局 | `<active-agent-dir>/secrets.yml`（通常为 `~/.omp/agent/secrets.yml`） | 使用该智能体目录的各项目共用的密钥 |
| 项目 | `<cwd>/.omp/secrets.yml` | 项目专用密钥 |

项目条目会覆盖 `content` 相同的全局条目。全局位置跟随会话的智能体目录，包括命名配置档案和显式的 SDK 智能体目录覆盖。

### 模式 \{#schema}

数组中的每个条目包含以下字段：

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `type` | `"plain"` 或 `"regex"` | 是 | 匹配策略 |
| `content` | 字符串 | 是 | 密钥值（plain）或正则表达式模式（regex） |
| `mode` | `"obfuscate"` 或 `"replace"` | 否 | 默认：`"obfuscate"` |
| `replacement` | 字符串 | 否 | 自定义替换值（仅替换模式） |
| `flags` | 字符串 | 否 | 正则表达式标志（仅 regex 类型） |
| `friendlyName` | 字符串 | 否 | 混淆模式占位符中经清理、对模型可见的标签 |

### 示例 \{#examples}

#### 普通密钥 \{#plain-secrets}

```yaml
# Obfuscate a specific API key (default mode)
- type: plain
  content: sk-proj-abc123def456

# Replace a database password with a fixed string
- type: plain
  content: hunter2
  mode: replace
  replacement: "********"
```

#### 友好名称 \{#friendly-names}

`friendlyName` 为可逆混淆占位符添加语义上下文，而不暴露密钥值：

```yaml
- type: plain
  content: github_pat_abc123def456
  friendlyName: GitHub Token
```

这会生成形如 `$$GITHUBTOKEN_3P8W5JH1TK2Q:L$$` 的占位符。友好名称会被清理为大写字母和数字，最长 32 个字符；若清理后为空，则省略。无效的可选 `friendlyName` 元数据不会禁用密钥条目；密钥仍会用不带标签的占位符混淆。如果某个占位符的标签会暴露已配置的字面密钥，或匹配已配置的密钥正则表达式，该占位符也会去掉标签。

原生 Responses 重放明文也会被混淆，包括消息文本、工具参数和结果，以及文件和网页搜索文本。`mcp_list_tools`、`tool_search_output` 和 `additional_tools` 中的动态定义还会对工具或命名空间描述、shell 技能描述、MCP 注解，以及模式中的描述性注解和示例进行脱敏。模式约束（包括 `enum`/`const`）、执行默认值、未知模式扩展、标识符、认证和路由设置以及语法保持不变，不属于文本脱敏范围。静态 `context.tools`、系统提示和图像或文件字节保持不变。

原生冲突值会在脱敏前通过相同的字段遍历收集，因此即使某个值只出现在动态定义或搜索项中，也可能使历史记录或待处理顾问更新中先前的友好前缀失效。顾问会在维护提交后重新清理重放及其下一次上下文压缩的来源，包括含有新发现值的快照。加密重放和未知协议变体仍保持不透明；无法追溯检查或重写加密历史。

12 字符哈希基值是用每次安装的私有密钥对精确密钥值计算的 HMAC（该私有密钥存储在 `~/.omp/agent/secret-placeholder.key`，启用 XDG 的安装则存储在 `$XDG_STATE_HOME/omp/secret-placeholder.key`，绝不会发送给模型）。这可防止会话记录读者通过字典哈希从占位符反推出密钥。仅大小写不同的密钥会获得独立基值，因此提供方无法通过改变大小写提示，从一个占位符合成另一个占位符。如果在惰性的内置令牌路径上无法持久化私有密钥，会话会发出警告，并使用仅在进程存续期间有效的密钥；混淆在该进程内仍可逆，但占位符在重启后不再稳定。大小写提示后缀用于标明已脱敏值的大小写：

| 提示 | 含义 |
| --- | --- |
| `:U` | 所有有大小写之分的 ASCII 字母均为大写 |
| `:L` | 所有有大小写之分的 ASCII 字母均为小写 |
| `:C` | 第一个有大小写之分的 ASCII 字母大写，其余小写 |
| `:M` | ASCII 大小写混合 |

正则条目上的 `friendlyName` 标注的是所配置的正则条目，而非匹配值。正则标签应足够宽泛，确保对每次匹配都成立。

#### 正则密钥 \{#regex-secrets}

```yaml
# Obfuscate any AWS-style key
- type: regex
  content: "AKIA[0-9A-Z]{16}"

# Case-insensitive match with explicit flags
- type: regex
  content: "api[_-]?key\\s*=\\s*\\w+"
  flags: "i"

# Regex literal syntax (pattern and flags in one string)
- type: regex
  content: "/bearer\\s+[a-zA-Z0-9._~+\\/=-]+/i"
```

正则条目始终全局扫描（自动强制启用 `g` 标志）。支持用正则字面量语法 `/pattern/flags` 代替分开的 `content` + `flags` 字段。模式中的转义斜杠（`\\/`）会被正确处理。

条目使用 `LinearRegExp`（`packages/utils/src/regex/linear-regexp.ts`）运行：采用 JavaScript 语法和匹配行为，匹配器的设计目标是避免灾难性回溯。它支持 Unicode 模式（`u` 和 `v`）以及 `(?i:…)` 等作用域修饰符。对于 `\p{RGI_Emoji}` 等字符串 Unicode 属性，仅单个字符类使用原生匹配，而非整个表达式。超出该引擎支持形状或大小限制的模式仍可使用原生引擎。

#### 正则替换模式 \{#replace-mode-with-regex}

```yaml
# One-way replace connection strings (not reversible)
- type: regex
  content: "postgres://[^\\s]+"
  mode: replace
  replacement: "postgres://***"
```

## 无效条目与文件 \{#invalid-entries-and-files}

- 缺少 `secrets.yml` 视为没有条目。
- 解析失败或文档不是数组时，会发出警告并忽略。
- 无效条目会逐项跳过并发出警告。`type` 必须是 `plain` 或 `regex`；`content` 必须是非空字符串；`mode`、`replacement`、`flags` 和正则语法会按上述规则验证。
- 无效的可选 `friendlyName` 元数据会被丢弃，但不会丢弃其他方面有效的条目。

## 与自动检测的交互 \{#interaction-with-automatic-detection}

先收集环境变量，再处理文件定义的条目，最后运行内置凭据正则表达式，使已配置条目先于通用检测器接触匹配内容。环境扫描内部会合并重复的环境变量值。环境条目与文件条目之间不去重，因此同时存在于两者中的普通值会被注册两次；两个占位符都还原为同一密钥，因此反混淆不受影响。

## 关键文件 \{#key-files}

- `packages/coding-agent/src/secrets/index.ts`：加载、合并、环境变量收集
- `packages/coding-agent/src/secrets/obfuscator.ts`：`SecretObfuscator` 类、占位符生成、消息混淆
- `packages/coding-agent/src/secrets/regex.ts`：正则字面量解析与编译
- `packages/coding-agent/src/secrets/message-transform.ts`：提供方上下文和本地上下文转换
- `packages/coding-agent/src/secrets/patterns.ts`：内置凭据模式
- `packages/coding-agent/src/secrets/settings.ts`：`secrets.enabled` 设置定义

## 另请参阅 \{#see-also}

- [`auth-broker-gateway.md`](./auth-broker-gateway.md)：远程凭据保险库和正向代理，使提供方 OAuth 刷新令牌和访问令牌完全不落在开发者主机上（与进程内混淆互为补充）。
