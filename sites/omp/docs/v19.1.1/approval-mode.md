---
title: "工具审批模式"
description: "Oh My Pi v19.1.1 仓库文档：工具审批模式。"
---

# 工具审批模式 \{#tool-approval-mode}

工具审批依据三项输入：

1. **工具声明**：每个工具都可以声明一个 `approval` 级别：
   - `read`：读取数据，或更新仅影响界面的会话元数据。
   - `write`：修改工作区或会话状态，但不执行任意代码。
   - `exec`：执行代码、调用 shell、操作浏览器、启动代理或执行范围类似的操作。
2. **工具策略**：对象形式的声明可以设置 `policy: allow | deny | prompt`，也可以附带 `override` 和理由，用于根据参数应用安全规则或模式匹配规则。
3. **用户策略**：`tools.approval.<toolName>: allow | deny | prompt` 覆盖当前模式，但不能绕过工具自身的拒绝或询问策略，也不能绕过非 yolo 模式下的安全覆盖。

没有 `approval` 声明的工具，以及未指定有效级别的审批决策，都使用 `exec`。对未知的自定义工具，这是安全的默认值。MCP 服务器工具一律声明为 `write`，不受其 MCP 注解影响。

调用方在执行时既未提供设置，也未提供 `autoApprove`，审批就会按安全默认回退到 `always-ask`，且不使用任何用户授权。如果没有传入上下文，运行中的扩展包装器可以继承其运行器的会话设置。

### 作为命令运行的工具 \{#tools-run-as-commands}

已挂载的工具作为 bash 命令调用时，会在分派时根据自身级别和 `tools.approval.<tool>` 策略审批，与直接调用完全相同。审批入口是 `ExtensionToolWrapper.execute`，所在文件为 `packages/coding-agent/src/extensibility/extensions/wrapper.ts`；注册表中的每个工具都由该包装器封装。外层 `bash` 审批将仅由工具命令组成的命令行视为 `read`，然后每条命令各自经过审批；其他命令行则遵循普通的 `bash` 审批流程。当 bash 调用以前台任务方式运行时，如果命令触发审批提示，任务会转入后台，让用户可以在命令继续运行时回答提示。

## 模式 \{#modes}

通过 `tools.approvalMode` 配置：

| 模式 | 自动批准 | 需要询问 |
| --- | --- | --- |
| `always-ask` | `read` | `write`、`exec` |
| `always-ask-cached` | 无文件目标的 `read`，以及已获授权的文件和文件夹 | 读取文件、`write`、`exec` |
| `write` | `read`、`write` | `exec` |
| `yolo`（默认） | `read`、`write`、`exec` | 无 |

`--approval-mode <mode>` 覆盖当前会话的配置模式。`--auto-approve` 和 `--yolo` 会强制采用 yolo 模式执行，即使同时显式传入 `--approval-mode`；工具或用户的拒绝策略以及工具显式声明的询问策略仍然生效。

### 询问并记住（`always-ask-cached`） \{#ask-and-remember-always-ask-cached}

「询问并记住」与 `always-ask` 一样会显示审批提示，另外，工具读取未获授权的文件前也会询问。审批提示可以记住此次调用涉及的目标：

- **批准目录：`<folder>`** 授权此次调用所涉及的文件夹。文件夹授权只覆盖直接位于其中的文件，不覆盖子文件夹或子文件夹下的任何内容。提示会显示文件夹名称和其中的条目（目录以 `/` 结尾）：停靠栏显示前几个条目，展开的提示（`Ctrl+O`）最多显示 24 个。更大的文件夹会以数量显示剩余条目。
- **批准文件**（目标是目录或 URL 时为 **批准**）仅授权指定的目标。
- **仅批准一次** 只批准当前调用。

这些选项上方的 **跨会话记住** 开关决定授权的保存位置。关闭时，授权只存于内存，且仅适用于当前对话：使用 `/new`、切换会话或使用同一进程中的其他会话时，都不会继承该授权。开启时，授权写入代理目录中的 `approval-cache.db`，适用于此后的所有会话。没有审批对话框的宿主（RPC、ACP、协作访客）会为两种有效期分别提供选项，例如 `Approve File`、`Always Approve File` 等。

- 授权会记录获准的权限级别。写入授权也覆盖对同一目标的读取；读取授权不覆盖写入或执行调用。
- 读取文件的工具会报告所涉及的文件和文件夹：`read`、`grep`、`glob`、`ast_grep`、`find`，以及兼容旧版的 `read`/`grep`/`find`/`ls` 包装。递归搜索会深入子文件夹，因此需要单独的目录树授权；批准目录树时也会记录其中包含的文件夹授权。对 `src;other` 之类的根目录列表，系统会逐个根目录生成键。
- 其他读取级工具（`lsp`、`debug`、`github`、`todo` 等）仍与 `always-ask` 一样自动获批。此模式决定何时向你询问，不会对读取操作进行沙箱隔离。
- 读取公开 Web URL 从不需要审批。如果 URL 的主机是 `localhost`、私有 IP 字面量、环回 IP 字面量、链路本地 IP 字面量、单标签名称或 `.local`/`.internal` 名称，则按文件的规则审批。系统不解析主机名，因此无法识别指向私有地址的公开名称。`local://…` 等内部 URL 以规范化后的形式作为键。
- 未报告目标的执行或写入调用（`bash`、`eval`、`browser`、`task`、MCP 工具）与 `always-ask` 一样会显示审批提示，并提供常规的 **在本会话中批准 `<tool>`** 选项。
- 读取 `file.ts:120-140` 和写入 `file.ts` 使用同一个键：系统先去掉选择器，再以会话工作目录为基准解析路径并解析符号链接（包括尚不存在的文件的父目录是符号链接的情况）；在 Windows 上，按不区分大小写的方式处理。
- 授权选项只会出现在当前模式触发的提示中。由工具策略、`override`（bash 危险命令）、`tools.approval.<tool>: prompt` 规则或待处理的模型提供方安全检查强制触发的提示，仍只提供「批准」和「拒绝」，不会记录授权。
- `/forget-approvals` 会清空当前代理目录的授权数据库，以及该目录下所有对话的会话授权。也可以删除数据库记录（`DELETE FROM grants`）或删除数据库文件。每次检查都会重新读取数据库，无需重启。

## 受限文件夹 \{#restricted-folders}

`tools.restrictedFolders` 列出了每项操作都需要显式审批的文件夹。无论采用何种审批模式（包括 `yolo` 和 `--auto-approve`），也无论已记住哪些授权，都需要审批：

```yaml
tools:
   restrictedFolders:
      - ~/secrets
      - C:/work/payments
```

- 受限文件夹的范围包括自身及其下的所有内容。如果调用目标落在该范围内（`read`、`write`、`edit`、`grep`、`glob`、`ast_grep`、`find` 或任何报告 `approvalCacheTargets` 的工具），会显示带 `Reason: Restricted folder: <folder>` 的审批提示。从受限文件夹的上级目录开始递归搜索时也会询问，因为搜索会读取受限文件夹内的内容；只列出父目录一层内容则不会询问。
- 路径的比较方式与「询问并记住」的键相同：展开 `~`，以会话工作目录为基准解析相对路径，解析符号链接，并在 Windows 上按不区分大小写的方式处理。`/a/foo` 从不覆盖 `/a/foobar`。
- 对未指定路径的工具（`bash`、`eval`、`browser`、MCP 工具、eval 前置代码），以其执行目录匹配：有 `cwd` 参数时用该参数，否则用会话工作目录。系统不会解析命令文本，因此在受限文件夹之外运行的 `bash` 调用，即便在命令中指定了受限文件夹内的文件，也不会匹配；这种情况请使用 `tools.approval.bash` 策略。
- 审批提示只提供 **批准** / **拒绝**。会话级选项、已有授权和 ACP 的「始终允许」都不适用，每次调用都会再次询问。`deny` 策略（工具策略或 `tools.approval.<tool>: deny`）仍会拒绝调用。
- 没有交互界面时（打印模式、无界面子代理、Cursor 执行桥接），调用会被拒绝，与其他无人应答的审批提示相同。
- `/settings` 面板可在「交互 → 审批」下用 JSON 编辑此列表。如果列表由项目配置提供，该设置项会隐藏，确保项目值不会被提升到全局配置。

## 用户覆盖设置 \{#user-overrides}

`tools.approval` 在所有模式下均生效：

```yaml
tools:
   approvalMode: write
   approval:
      bash: prompt
      read: allow
      mcp__filesystem_delete: deny
```

对于 MCP 工具，策略键必须是最终注册的确切名称。常规格式为
`mcp__<sanitized_server>_<sanitized_tool>`。工具名称中重复的 `<server>_` 前缀会被移除，
因此服务器 `echo` 上的工具 `echo_it` 会注册为 `mcp__echo_it`。超过 64 个字符的名称会被限制长度，并加上确定性的
哈希后缀；请使用限制后的最终名称，而非未限制长度的格式。参见
[MCP 工具命名](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/mcp-server-tool-authoring.md#naming-and-collision-domain)。

名称清理会将名称转成小写，并保留字母、数字和下划线。若旧版清理规则曾去除数字，导致 MCP 名称不同，则只有在没有使用当前名称的策略适用时，才会继承以旧名称为键的 `deny` 或 `prompt`；绝不会继承旧名称对应的 `allow`。

每次调用工具时，按以下顺序判定：

1. 求值 `tool.approval(args)`；没有决策或决策格式错误时，默认采用 `exec` 级别。
2. 工具声明的 `policy: deny` 始终拒绝调用。接下来检查用户的 `deny`，该策略也始终拒绝调用。
3. 在 `yolo` 模式下，工具显式声明的 `allow`/`prompt` 策略优先；否则，有效的用户策略优先，没有此类策略时允许调用。单独的 `override` 标记在 `yolo` 模式下不会强制询问。
4. 在非 yolo 模式下，若决策包含 `override: true`，只有附带工具的 `policy: allow` 时才允许调用；其他未被拒绝的情况均会询问。
5. 没有覆盖时，工具显式声明的 `allow`/`prompt` 策略优先，其次是有效的用户策略。
6. 没有显式策略时，当前模式按级别自动批准或询问。在 `always-ask-cached` 模式下，若调用的所有 `approvalCacheTargets` 都已获授权，则直接允许。

策略字符串会去掉首尾空白并统一大小写。无效的用户设置值会被忽略。

扩展的 `tool_call` 处理程序修改输入后，系统会按实际执行时使用的参数重新判定审批。判定为拒绝时，系统会在显示审批提示之前阻止执行；若仍需询问但没有交互界面，调用会失败，不会被静默批准。

## 安全覆盖 \{#safety-overrides}

工具可以用对象形式的审批声明强制询问：

```ts
approval: { tier: "exec", override: true, reason: "Critical pattern detected" }
```

`bash` 对危险的破坏性模式采用此机制，例如 `rm -rf /`、fork 炸弹、从远程获取后执行、写入 `/etc/passwd` 和关闭宿主机的命令。它还支持通过 `bash.patterns` 配置规则：`deny` 一律拒绝，`prompt` 强制询问，`allow` 则显式允许匹配的简单命令按 `write` 级别执行。操作方的 `deny` 规则（来自 `Settings.grantAuthority()`）不能被项目层的 `bash.patterns` 覆盖。理由会显示在审批提示中。在 `yolo` 模式下，单独的危险命令覆盖会被忽略，但工具或用户显式设置的 `prompt` 或 `deny` 策略仍然生效。
对于独立的 bash 命令，危险命令检测优先于匹配到的 `allow`/`prompt` 模式结果（但不优先于 `deny`），并用单独的安全覆盖替换这些结果。对于不符合 `bash.allowCompoundCommands` 条件的复合命令行，`deny` 和 `prompt` 规则按分词后的各段分别判定（每段采用首个匹配项），再结合各段和整条命令的限制，其中 `deny` 优先。

`bash.allowCompoundCommands` 默认关闭。启用后，它只识别以 `&&` 连接的平坦命令链，其中每段均由字面量参数构成。每段的规则仍按顺序判定：首个匹配规则对该段生效。各段的显式限制按较严格的结果合并：匹配到任何 `deny` 就拒绝，否则匹配到任何 `prompt` 就询问。匹配整条链但不匹配任何单段的限制，仍可否决整条链。

系统会评估所有匹配整条链的限制，因此顺序靠后的整链拒绝可以覆盖靠前的询问。启用此功能要求集中式 shell 分类器明确识别出 shell 支持 POSIX 引号规则。Cmd、PowerShell、fish 和未知 shell 保持旧版的审批行为。

这些对命令链和各段的显式限制，会在现有的原始命令和规范化命令的危险检查之前判定。检查完成后，如果各段均显式判定为 `allow`，则整条链按 `write` 级别放行；若有任一段未匹配规则，bash 则沿用独立命令的 `exec` 审批级别，不带显式策略。通用审批判定随后应用 `tools.approval.bash`，再应用当前审批模式，与处理独立命令完全相同。因此，只在现有的工具级策略或模式要求时，未匹配的命令段才会触发询问。涉及展开、赋值、其他控制流、重定向、通配符匹配、换行、错误语法或会改变 shell 状态的内置命令，不符合条件，仍按旧版行为审批。

这些模式规则控制 `bash` 工具的审批，不隔离进程或文件系统。获准的命令保留 shell 原有的文件系统、网络和子进程访问权限。`eval` 工具同样声明为 `exec` 级别，并可以经由子进程启动 shell。因此，`bash.patterns` 的 `deny` 规则对经 `eval` 执行的同一条命令不生效；在 `yolo` 模式下，该 `exec` 调用会判定为 `allow`。要对 `eval` 可调用的 shell 进行审批，请添加 `tools.approval.eval` 策略（`prompt` 或 `deny`），与 `bash.patterns` 一起使用。

### 计算机操作安全 \{#computer-safety}

Eval 的 [`computer` API](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/computer-use.md) 默认禁用，并为每次调用选择级别：

- 对于直接调用的辅助方法（`computer.windows()`、`win.screenshot()`、`win.ax()`、`el.bounds()`、`computer.clipboard.read()` 等），所调用的方法本身仅做检查时使用 `read`。使用 `exec` 的情况包括输入、切换焦点、修改和 `clipboard.write`。读取调用也受工作进程的只读保护机制约束；
- `computer.run(fnOrCode, options)` 使用 `read` 的唯一条件是传入 `read_only: true`（JavaScript 末尾的选项，或 Python 的关键字参数）；`read_only: false`、缺少该字段、参数格式错误或任何其他值都使用 `exec`。

适用时，审批提示会先显示 `read-only`，然后显示解析后将执行的 JavaScript（标准格式化器会将其截断至 2,000 个字符）。对 `computer.run`，`read_only: true` 还会启用工作进程的桌面保护机制：输入、切换焦点、修改和写入剪贴板都会抛出异常。该机制不是静态分析，也不是通用 JavaScript 沙箱。

在任何模式下，`computer.control.acquire` 都会先询问用户，再将前台控制权交给代理；无人可询问时，返回 `no-ui`。只有 `tools.approval["computer.control"]` 可以跳过询问而直接给出结果：`allow` 即使没有交互界面也会授予控制权，适用于无人值守的机器；`deny` 则拒绝。审批模式和 `tools.approval.computer` 从不授予前台控制权，否则默认的 `yolo` 会让每个无界面子代理都能接管用户的前台。

此外，由模型提供方发起的计算机操作调用可能带有 `pendingSafetyChecks` 元数据。只要有待处理的检查，就会强制显示交互式提示，无论是否处于 yolo 模式或为该工具设置了 `allow`。提示会列出每项安全检查的代码、消息，以及经清理或截断处理的数据。没有交互界面时，调用会以 `pending provider safety checks but no interactive UI is available` 报错并拒绝执行。

工具审批不会授权实际的现实操作。屏幕上的文字不可信，不能覆盖用户的直接指令。对于会产生实际后果的操作，必须在即将产生风险时确认确切的目标、范围和值，除非用户已在直接消息中授权。

## 各工具的审批提示详情 \{#per-tool-prompt-details}

工具可以通过 `formatApprovalDetails(args)` 在审批提示正文中添加若干行。标准提示包含：

- `Allow tool: <name>`
- `Origin: MCP server tool`：用于未加注解的 `mcp__...` 工具
- `Reason: <reason>`：工具决策提供理由时显示
- 工具特定的详情，例如命令、路径、代码、浏览器操作或子代理任务分派（设为 `bash.allowCompoundCommands: true` 后，复合 `&&` bash 命令的审批提示会逐行列出各段，由 `allow` 规则覆盖的段标记为 `✓`，正在请求审批的段标记为 `?`）

在交互界面中，审批提示停靠在输入框上方，直到收到答复，并列出 **批准**、**在本会话中批准 `<tool>`** 和 **拒绝**。输入框为空时，方向键可在这些选项间移动，按 `Enter` 确认高亮项（提示出现时默认高亮「批准」）；`Ctrl+Enter`（或 `Ctrl+Q`；可重新绑定 `app.approval.approve`）直接批准当前调用，`Esc` 拒绝调用。提示出现的前半秒会忽略 `Enter` 和批准快捷键，以免提示刚出现时，把原本按给输入框的键（或在运行中按下的后续消息快捷键）当作答复。会话级选项会批准同一工具在同一级别的后续调用，直到会话结束或切换；只有审批模式触发的提示才提供该选项。危险命令覆盖、显式 `prompt` 策略或模型提供方安全检查每次都会询问，不提供该选项。输入框保留光标并继续接收输入，以便拒绝调用并引导代理。输入框有草稿时，高亮会停在「拒绝」上，标签变为 **拒绝并发送消息**；方向键和 `Enter` 用于编辑和发送草稿，`Ctrl+C` 清空草稿而非拒绝调用。在审批等待期间发送消息（通过输入框、Tern 或协作访客），会拒绝所有待审批的调用，也会拒绝同一批工具在消息送达前发起的其他审批请求。随后，该消息会引导当前轮次，让代理知道拒绝的原因，不必从一个不带理由的拒绝中猜测。为给输入框留出空间，提示会将工具详情汇总到一行（取每项详情的首行，省略后续内容时以 `…` 标示）；汇总始终基于实际将执行的输入。`Ctrl+O`（`app.tools.expand`，或 Tern 中的「详情」）会显示每项详情的完整内容，`PgUp`/`PgDn` 可滚动浏览。在 Tern 中，点击选项即以该选项答复审批。RPC、ACP 和其他没有审批对话框的宿主会收到一个选择控件，其中包含相同的选项和完整的详情。

带授权选项的「询问并记住」提示，会在 **仅批准一次** 上方列出 **跨会话记住** 开关和授权选项。提示出现时默认高亮「仅批准一次」。高亮开关时按 `Enter` 可切换开关，相应的授权选项标签会改为带 **始终…** 的形式。`Ctrl+Enter` 仍只批准当前调用。

## 在工具中定义审批 \{#defining-approval-on-tools}

内置工具和自定义工具使用相同的结构：

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

`approvalCacheTargets` 返回 `always-ask-cached` 为此次调用检查和记录的键：可以是绝对文件路径（用 `approvalTargetKey` 生成，让选择器、工作目录和符号链接的解析方式与内置工具一致），也可以是规范化的内部 URL。`ToolDefinition` 和 `CustomTool` 接受同一个钩子。工具省略该钩子时，与 `always-ask` 一样，仅按级别判定。

示例：

```ts
approval: "read";

approval: args => (LSP_READONLY_ACTIONS.has(args.action) ? "read" : "write");

approval: args =>
	isCritical(args.command) ? { tier: "exec", override: true, reason: "Critical pattern detected" } : "exec";

approval: args => (isForbidden(args) ? { tier: "exec", policy: "deny", reason: "Blocked by tool policy" } : "write");
```

## ACP 会话 \{#acp-sessions}

ACP（`omp acp`）与 OMP 的常规启动方式使用同一个设置解析器。全局 `~/.omp/agent/config.yml`、ACP 会话的 `cwd` 对应的项目配置，以及传给 ACP 服务器进程的任何 `--config <file>` 覆盖配置，都适用于该进程创建的会话。

要自动批准 ACP 工具调用，请在全局或项目配置中设置模式：

```yaml
tools:
   approvalMode: yolo
```

也可以启动 ACP 服务器时传入运行时覆盖选项，或仅适用于该进程的覆盖配置：

```bash
omp acp --yolo
omp acp --auto-approve
omp acp --approval-mode yolo
omp acp --config ./acp-yolo.yml   # file contains tools.approvalMode: yolo
```

优先级与常规设置相同：运行时选项（`--approval-mode`、`--auto-approve`、`--yolo`）覆盖 `--config` 提供的配置，后者覆盖项目配置，项目配置则覆盖全局配置。ACP 目前没有为 `session/new`、`session/load` 或 `session/resume` 定义审批策略字段。因此，ACP 客户端如果需要为某个会话使用 yolo，应另行启动 `omp acp` 进程，并使用上述选项之一或该会话专用的 `--config` 覆盖配置。

显式配置 `tools.approvalMode: yolo` 或通过运行时选项指定后，该模式就会完整应用到 ACP：除非判定出的工具或用户策略要求询问或拒绝调用，否则会跳过 OMP 常规的按级别审批提示和 ACP 客户端审批。配置规范中的默认值也是 `yolo`，但如果未明确启用，不匹配规则的 bash 命令和破坏性的文件操作仍需 ACP 客户端授权。

对于 `bash`，ACP 会先判定 `bash.patterns`、危险命令覆盖、各工具策略和审批模式，再请求授权：`allow` 无需显示卡片即可执行，`deny` 不显示卡片并阻止执行，`prompt` 使用 `session/request_permission`。「始终允许」选项覆盖当前会话中后续的普通 `bash` 调用；危险命令和显式要求询问的模式匹配规则仍会在每次调用时显示卡片。

`delete`、`move` 及含有删除或重命名操作的 `edit` 补丁，仍须经过编辑器侧按操作类别限定的额外审批。普通的文件内容编辑不需要这项额外审批。客户端声明支持 `elicitation.form` 时，通用审批提示采用表单方式征询。提示遭拒、被取消或不受支持时，工具调用会被拒绝或取消。

## 子代理 \{#subagents}

子代理以 `tools.approvalMode: yolo` 在无界面模式下运行，以免常规的按级别审批提示使它们停滞。父级的 `task` 审批是授权边界。各工具策略仍按常规规则判定：用户的 `deny` 始终拒绝调用，任何判定为 `prompt` 的调用也会被拒绝，因为无界面子代理无法应答。
