---
title: "工具审批模式"
description: "Oh My Pi 官方仓库文档：工具审批模式。"
---

# 工具审批模式 \{#tool-approval-mode}

工具审批有三种输入：

1. **工具声明**：每个工具都可以声明一个 `approval` 级别：
   - `read`：读取数据或更新仅用于 UI 的会话元数据。
   - `write`：修改工作区/会话状态，但不执行任意代码。
   - `exec`：执行代码、调用 shell、驱动浏览器、启动智能体或执行类似的广泛操作。
2. **工具策略**：对象形式的声明可以设置 `policy: allow | deny | prompt`，还可选择设置 `override` 和理由。它用于依赖参数的安全/模式规则。
3. **用户策略**：`tools.approval.<toolName>: allow | deny | prompt` 覆盖当前模式，但不能绕过工具自身的 deny/prompt 策略或非 yolo 安全覆盖。

没有 `approval` 声明的工具，以及没有有效级别的决策，使用 `exec`。这是未知自定义工具的安全默认值。MCP 服务器工具声明为 `write`，不受其 MCP 注解影响。

执行时调用方既未提供设置也未提供 `autoApprove` 时，审批解析会以关闭方式失败，使用 `always-ask` 且不带用户授权。省略上下文时，实时扩展包装器可以继承其运行器的会话设置。

### 作为命令运行的工具 \{#tools-run-as-commands}

以 bash 命令调用的已挂载工具，会在分派时按自身级别和 `tools.approval.<tool>` 策略审批，与直接调用完全相同：关卡是 `packages/coding-agent/src/extensibility/extensions/wrapper.ts` 中的 `ExtensionToolWrapper.execute`，它包装注册表中的每个工具。外层 `bash` 关卡将完全由工具命令组成的行视为 `read`，随后每个命令分别通过自身审批；其他行遵循正常的 `bash` 审批。当 bash 调用作为前台支持的作业运行时，若某个命令触发提示，该次运行会提升为后台作业，以便在命令继续运行时回答提示。

## 模式 \{#modes}

通过 `tools.approvalMode` 配置：

| 模式 | 自动批准 | 提示审批 |
| --- | --- | --- |
| `always-ask` | `read` | `write`、`exec` |
| `always-ask-cached` | 没有文件目标的 `read`、已授权的文件和文件夹 | 文件读取、`write`、`exec` |
| `write` | `read`、`write` | `exec` |
| `yolo`（默认） | `read`、`write`、`exec` | 无 |

`--approval-mode <mode>` 为会话覆盖配置的模式。即使同时显式提供 `--approval-mode`，`--auto-approve` 和 `--yolo` 也会强制以 yolo 执行；工具/用户拒绝策略和显式工具提示策略仍然适用。

### 询问并记住（`always-ask-cached`） \{#ask-and-remember-always-ask-cached}

询问并记住模式像 `always-ask` 一样提示，也会在工具读取尚未获授权的文件之前提示。其提示可以记住调用触及的内容：

- **批准目录：`<folder>`** 授权调用周围的文件夹。文件夹授权覆盖直接位于其中的文件，绝不覆盖子文件夹或其下任何内容。提示会标明文件夹并列出其条目（目录以 `/` 结尾）：停靠区中显示前几个，展开提示（`Ctrl+O`）中最多显示 24 个。更大的文件夹会以数量显示其余条目。
- **批准文件**（对于目录或 URL 目标则为**批准**）授权精确目标。
- **批准一次**仅批准本次调用。

这些选项上方的**跨会话记住**开关决定授权存放位置。关闭时，授权仅为本次对话保存在内存中：`/new`、会话切换以及同一进程中的其他会话都不会带上它。开启时，授权写入智能体目录中的 `approval-cache.db`，并覆盖之后的所有会话。没有该对话框的宿主（RPC、ACP、协作访客）会将两种生命周期显示为独立选项：`Approve File`、`Always Approve File` 等。

- 授权会记录获准的能力级别。写入授权也覆盖对同一目标的读取；读取授权绝不覆盖写入或 exec 调用。
- 读取文件的工具会报告其触及的文件和文件夹：`read`、`grep`、`glob`、`ast_grep`、`find`，以及旧版 `read`/`grep`/`find`/`ls` 兼容层。递归搜索会进入子文件夹下方，因此需要单独的目录树授权；批准它时也会记录其包含的文件夹授权。`src;other` 之类的根目录列表按每个根目录分别建立键。
- 其他 read 级工具（`lsp`、`debug`、`github`、`todo`、……）与 `always-ask` 中一样继续自动批准。此模式决定何时询问，不会对读取进行沙箱隔离。
- 读取公共 Web URL 从不受审批关卡控制。主机为 `localhost`、私有/回环/链路本地 IP 字面值、单标签名称或 `.local`/`.internal` 名称的 URL 像文件一样受审批控制。不会解析主机名，因此无法检测指向私有地址的公共名称。`local://…` 等内部 URL 按规范化形式建立键。
- 不报告目标的 exec 或 write 调用（`bash`、`eval`、`browser`、`task`、MCP 工具）像 `always-ask` 一样提示，并提供常规的**为此会话批准 `<tool>`** 选项。
- 对 `file.ts:120-140` 的读取和对 `file.ts` 的写入共享一个键：移除选择器，相对于会话 cwd 并通过符号链接解析路径（包括尚不存在文件的符号链接父目录），Windows 上会折叠大小写。
- 授权选项只出现在由该模式触发的提示上。工具策略、`override`（bash 关键命令）、`tools.approval.<tool>: prompt` 规则或待处理提供方安全检查强制触发的提示，仍使用普通批准/拒绝，不记录任何授权。
- `/forget-approvals` 清除当前智能体目录的数据库以及每次对话的会话授权。删除行（`DELETE FROM grants`）或文件也有效；每次检查都重新读取数据库，因此无需重启。

## 受限文件夹 \{#restricted-folders}

`tools.restrictedFolders` 列出每次操作都需要显式批准的文件夹，无论审批模式如何（包括 `yolo` 和 `--auto-approve`），也无论记住过什么：

```yaml
tools:
   restrictedFolders:
      - ~/secrets
      - C:/work/payments
```

- 受限文件夹覆盖其自身及其下所有内容。目标位于其中的调用（`read`、`write`、`edit`、`grep`、`glob`、`ast_grep`、`find`，以及任何报告 `approvalCacheTargets` 的工具）会显示 `Reason: Restricted folder: <folder>` 提示。以受限文件夹上方目录为根的递归搜索也会提示，因为它会读入该文件夹；对父目录进行单层列出则不会。
- 路径比较方式与询问并记住的键相同：展开 `~`，相对条目根据会话 cwd 解析，解析符号链接，Windows 上折叠大小写。`/a/foo` 绝不会覆盖 `/a/foobar`。
- 不指定路径的工具（`bash`、`eval`、`browser`、MCP 工具、eval 前置脚本）按其运行目录匹配：有 `cwd` 参数时使用该参数，否则使用会话 cwd。不会解析命令文本，因此在文件夹外运行但在命令中指定其内部文件的 `bash` 调用不会匹配；对此请使用 `tools.approval.bash` 策略。
- 提示提供普通的**批准** / **拒绝**：会话选项、授权以及 ACP 的“始终允许”都不能覆盖它，因此每次调用都会再次询问。`deny` 策略（工具策略或 `tools.approval.<tool>: deny`）仍会拒绝。
- 没有交互式 UI 时（打印模式、无头子代理、Cursor exec 桥接），调用会被拒绝，与其他无人回答的提示一样。
- `/settings` 面板在“交互 → 审批”下以 JSON 编辑该列表。当项目配置提供列表时，该选项会隐藏，因此项目值绝不会被提升到全局配置。

## 用户覆盖 \{#user-overrides}

`tools.approval` 在每种模式中都生效：

```yaml
tools:
   approvalMode: write
   approval:
      bash: prompt
      read: allow
      mcp__filesystem_delete: deny
```

对于 MCP 工具，使用最终注册的精确名称作为策略键。通常形式为
`mcp__<sanitized_server>_<sanitized_tool>`。工具名称中多余的 `<server>_` 前缀会被移除，
因此服务器 `echo` 的工具 `echo_it` 注册为 `mcp__echo_it`。超过 64 个字符的名称
会以确定性哈希后缀限制长度；请使用最终受限名称，而不是未限制的模式。参见
[MCP 工具命名](./mcp-server-tool-authoring.md#naming-and-collision-domain)。

名称清理器将名称转为小写，并保留字母、数字和下划线。对于因旧版移除数字的清理器而发生变化的 MCP 名称，只有当前名称没有适用策略时才会继承旧版 `deny` 或 `prompt` 键；绝不会继承旧版 `allow`。

每次工具调用的解析顺序：

1. 求值 `tool.approval(args)`；省略/格式错误的决策默认为 `exec` 级别。
2. 工具声明的 `policy: deny` 始终拒绝。接着检查用户 `deny`，它也始终拒绝。
3. 在 `yolo` 中，显式工具 `allow`/`prompt` 策略优先；否则有效用户策略优先，或者允许调用。单独的 `override` 标志不会在 `yolo` 中强制提示。
4. 在非 yolo 模式中，`override: true` 决策只允许同时带有工具 `policy: allow` 的情况；其他所有未被拒绝的情况都会提示。
5. 没有覆盖时，显式工具 `allow`/`prompt` 策略优先，然后是有效用户策略。
6. 没有显式策略时，当前模式按级别自动批准或提示。在 `always-ask-cached` 中，如果调用的 `approvalCacheTargets` 全部已获授权，则改为允许。

策略字符串会去除首尾空白并规范化大小写。无效用户值会被忽略。

扩展 `tool_call` 处理器修改输入后，会针对实际执行的参数再次解析审批。拒绝会在提示之前阻止执行；没有可用交互式 UI 时，仍需要提示的调用会失败，而不是静默允许。

## 安全覆盖 \{#safety-overrides}

工具可以通过对象形式的审批强制提示：

```ts
approval: { tier: "exec", override: true, reason: "Critical pattern detected" }
```

`bash` 将其用于关键破坏性模式，例如 `rm -rf /`、fork 炸弹、远程获取后执行、写入 `/etc/passwd` 以及主机关机命令。它也支持配置的 `bash.patterns` 规则：`deny` 是绝对拒绝，`prompt` 强制提示，`allow` 则在 `write` 级别显式允许匹配的简单命令。操作方 `deny` 规则（来自 `Settings.grantAuthority()`）不能被项目层 `bash.patterns` 覆盖。理由会显示在审批提示中。在 `yolo` 中，单独的关键安全覆盖会被忽略，但显式工具/用户 `prompt` 或 `deny` 策略仍会强制执行。
对于独立 bash 命令，关键检测优先于匹配的 `allow`/`prompt` 模式返回（但不优先于 `deny`），将其替换为单独的安全覆盖。对于不符合 `bash.allowCompoundCommands` 的复合行，`deny` 和 `prompt` 规则按分词后的片段解析（每个片段内首次匹配），并在片段之间和整条命令限制之间以 `deny` 优先合并。

`bash.allowCompoundCommands` 默认关闭。启用时，它只识别以 `&&` 连接、且各片段由字面参数组成的平面链。每个片段内的规则仍按顺序处理：首个匹配规则决定该片段。显式限制在整条链上保守合并：任何匹配的 `deny` 优先，否则任何匹配的 `prompt` 优先。匹配完整链但不匹配任何单独片段的限制仍作为整链否决。

所有匹配的整链限制都会被考虑，因此后面的整链 deny 会覆盖前面的 prompt。该可选功能要求通过集中式 shell 分类器明确识别出使用 POSIX 引号规则的 shell。Cmd、PowerShell、fish 和未知 shell 保持旧有审批行为。

这些显式链和片段限制在现有的原始与规范化关键命令检查之前解析。检查之后，如果链的所有片段都显式解析为 `allow`，则获得 `write` 级别的允许；如果任一片段没有匹配，bash 则保留其独立的 `exec` 审批级别，不带显式策略。随后通用解析器先应用 `tools.approval.bash`，再应用当前审批模式，与独立命令完全相同。因此，未匹配的片段只有在现有工具级策略或模式要求时才会提示。展开、赋值、其他控制流、重定向、通配、换行、格式错误的语法以及改变 shell 状态的内置命令不符合条件，保持旧有审批行为。

此模式策略控制 `bash` 工具的审批，不是进程或文件系统隔离。获准命令保留 shell 在环境中的文件系统、网络和子进程访问权限。`eval` 工具也声明 `exec` 级别，并且可以通过子进程启动 shell，因此 `bash.patterns` 的 `deny` 规则不适用于通过 `eval` 运行的同一命令；在 `yolo` 下，该 `exec` 调用解析为 `allow`。要对 `eval` 能访问的 shell 设置审批关卡，请在 `bash.patterns` 之外添加 `tools.approval.eval` 策略（`prompt` 或 `deny`）。

### 计算机安全 \{#computer-safety}

默认禁用的 Eval [`computer` API](./computer-use.md) 按每次调用选择级别：

- 直接辅助方法（`computer.windows()`、`win.screenshot()`、`win.ax()`、`el.bounds()`、`computer.clipboard.read()`、……）在调用的方法仅用于检查时使用 `read`，对于输入、聚焦、修改和 `clipboard.write` 使用 `exec`；读取调用还会在工作线程的只读保护下运行；
- `computer.run(fnOrCode, options)` 只有在 `read_only: true` 时使用 `read`（JavaScript 末尾选项或 Python 关键字）；`read_only: false`、字段缺失、参数格式错误或任何其他值都使用 `exec`。

适用时，审批提示显示 `read-only`，后面跟解析后的 JavaScript（由标准格式化器截断到 2,000 个字符）。对于 `computer.run`，`read_only: true` 还会启用工作线程的桌面保护：输入、聚焦、修改和剪贴板写入会抛出异常。它不是静态分析，也不是通用 JavaScript 沙箱。

`computer.control.acquire` 在每种模式下都会先询问用户，再将前台控制权交给智能体，无人可询问时返回 `no-ui`。只有 `tools.approval["computer.control"]` 可以不经询问作答：`allow` 即使在没有交互式 UI 时也授予控制权，适用于无人值守机器；`deny` 则拒绝。审批模式和 `tools.approval.computer` 从不授予该权限，否则默认 `yolo` 会让每个无头子代理接管用户前台。

另外，来自提供方的计算机使用调用可能携带 `pendingSafetyChecks` 元数据。任何待处理检查都会强制触发交互式提示，不受 yolo 或每工具 `allow` 影响。提示列出每项安全检查的代码、消息以及已清理/截断的数据。没有交互式 UI 时，调用会以关闭方式失败，报错 `pending provider safety checks but no interactive UI is available`。

工具审批不授权底层的现实世界操作。屏幕文本不可信，不能覆盖用户的直接指令。除非用户的直接消息已经授权，否则有重大影响的操作仍需要在风险发生点确认精确目标、范围和值。

## 每个工具的提示详情 \{#per-tool-prompt-details}

工具可以通过 `formatApprovalDetails(args)` 添加审批提示正文行。标准提示包括：

- `Allow tool: <name>`
- 对于未带注解的 `mcp__...` 工具，显示 `Origin: MCP server tool`
- 工具决策提供原因时，显示 `Reason: <reason>`
- 工具专属详情，例如命令、路径、代码、浏览器操作或子代理任务（设置 `bash.allowCompoundCommands: true` 时，复合 `&&` bash 审批提示会逐行列出各段，用 `✓` 标记由 `allow` 规则覆盖的段，用 `?` 标记正在请求审批的段）

在交互式 UI 中，审批提示会停靠在输入框上方，直到用户从选项列表中作出选择：**批准**、**在此会话中批准 `<tool>`** 和 **拒绝**。输入框为空时，方向键可在选项间移动，`Enter` 选择高亮项（初次显示时为“批准”）；`Ctrl+Enter`（或 `Ctrl+Q`；可通过 `app.approval.approve` 重新绑定）直接批准本次调用，`Esc` 则拒绝。最初半秒内会忽略 `Enter` 和批准快捷键，防止审批提示出现时，将原本要用于输入框的按键（或在运行中按下的后续消息快捷键）当成审批答复。会话选项会批准后续同一工具在同一级别的调用，直至会话结束或切换；该选项只会出现在由审批模式触发的提示中，不会出现在关键命令覆盖、显式 `prompt` 策略或提供方安全检查的提示中，后者每次都会询问。输入框保留光标并接受输入，便于用户改为拒绝并进行引导：只要其中有草稿，高亮项就会停在“拒绝”上，并改名为 **拒绝并发送消息**，方向键和 `Enter` 用于编辑和发送草稿，`Ctrl+C` 则清空草稿而不是拒绝。在调用等待期间发送消息（来自输入框、Tern 或协作访客），会拒绝所有待处理的审批，以及消息交付前同一工具批次提出的审批，随后用该消息引导本轮运行，让智能体得知原因，而不是面对单纯的拒绝自行猜测。为给输入框留出空间，审批提示会将工具详情汇总为一行（每项详情取第一行，有更多内容被省略时显示 `…`），且始终根据实际将要运行的输入生成；`Ctrl+O`（`app.tools.expand`，或 Tern 中的“详情”）会完整显示每项详情，`PgUp`/`PgDn` 可滚动查看。在 Tern 中，点击某个选项即可选择。RPC、ACP 以及其他没有审批对话框的宿主会收到包含相同选项和完整详情的选择控件。

带有授权项的“询问并记住”提示会在 **批准一次** 上方列出 **跨会话记住** 开关和授权选项，初次显示时高亮 **批准一次**。在开关上按 `Enter` 可切换其状态，授权项标签会切换为 **始终……** 的形式。`Ctrl+Enter` 仍然只批准本次调用。

## 为工具定义审批 \{#defining-approval-on-tools}

内置工具和自定义工具采用相同的结构：

```ts
export type ToolTier = "read" | "write" | "exec";
export type ToolApprovalDecision =
  | ToolTier
  | {
      tier: ToolTier;
      reason?: string;
      override?: boolean;
      policy?: "allow" | "deny" | "prompt";
    };
export type ToolApproval = ToolApprovalDecision | ((args: unknown) => ToolApprovalDecision);

approval?: ToolApproval;
formatApprovalDetails?: (args: unknown) => string | string[] | undefined;
approvalCacheTargets?: (args: unknown) => readonly string[] | undefined;
```

`approvalCacheTargets` 返回 `always-ask-cached` 为一次调用检查和记录的键：绝对文件路径（使用 `approvalTargetKey` 派生这些路径，使选择器、cwd 和符号链接的解析方式与内置工具一致）或规范化的内部 URL。`ToolDefinition` 和 `CustomTool` 接受相同的钩子。省略此钩子的工具只按级别解析，与 `always-ask` 一样。

示例：

```ts
approval: "read";

approval: args => (LSP_READONLY_ACTIONS.has(args.action) ? "read" : "write");

approval: args =>
	isCritical(args.command) ? { tier: "exec", override: true, reason: "Critical pattern detected" } : "exec";

approval: args => (isForbidden(args) ? { tier: "exec", policy: "deny", reason: "Blocked by tool policy" } : "write");
```

## ACP 会话 \{#acp-sessions}

ACP（`omp acp`）使用与正常启动 OMP 相同的设置解析器。全局 `~/.omp/agent/config.yml` 会生效，ACP 会话 `cwd` 对应的项目配置会生效，传给 ACP 服务端进程的任何 `--config <file>` 覆盖配置也会应用于该进程创建的会话。

要自动批准 ACP 工具调用，请在全局配置或项目配置中设置模式：

```yaml
tools:
   approvalMode: yolo
```

或者在启动 ACP 服务端时提供运行时覆盖参数或单进程配置覆盖：

```bash
omp acp --yolo
omp acp --auto-approve
omp acp --approval-mode yolo
omp acp --config ./acp-yolo.yml   # file contains tools.approvalMode: yolo
```

优先级与通常的设置优先级相同：运行时标志（`--approval-mode`、`--auto-approve`、`--yolo`）覆盖 `--config` 覆盖配置，后者覆盖项目配置，项目配置又覆盖全局配置。ACP 目前没有定义 `session/new`、`session/load` 或 `session/resume` 审批策略字段，因此，需要按会话启用 yolo 的 ACP 客户端应使用上述标志之一或会话专用的 `--config` 覆盖配置启动独立的 `omp acp` 进程。

显式配置或通过运行时标志提供 `tools.approvalMode: yolo` 时，它会完整应用于 ACP：除非解析后的工具策略或用户策略要求提示或拒绝调用，否则会跳过常规的基于级别的 OMP 提示和 ACP 客户端关卡。配置模式的默认值也是 `yolo`，但如果没有显式启用，不匹配的 bash 命令和破坏性文件操作仍需要 ACP 客户端授权。

对于 `bash`，ACP 会先解析 `bash.patterns`、关键命令覆盖、逐工具策略和审批模式，然后再请求权限：`allow` 无需卡片即可运行，`deny` 无需卡片即可阻止，`prompt` 则使用 `session/request_permission`。“始终允许”选项涵盖会话中后续的常规 `bash` 调用；关键命令和显式提示模式仍会在每次调用时要求卡片审批。

对于 `delete`、`move` 以及包含删除或重命名操作的 `edit` 补丁，额外的编辑器端关卡仍以操作类别为范围。普通文件内容编辑不使用这一额外关卡。当客户端声明支持 `elicitation.form` 时，通用审批提示会使用表单征询。提示被拒绝、取消或不受支持时，工具调用会被拒绝或取消。

## 子代理 \{#subagents}

子代理以无界面模式运行，并设置 `tools.approvalMode: yolo`，使常规的基于级别的提示不会阻塞它们。父级的 `task` 审批是授权边界。逐工具策略仍使用正常的解析器：用户 `deny` 始终具有绝对效力，任何解析为 `prompt` 的调用都会被拒绝，因为无界面子代理无法满足提示要求。
