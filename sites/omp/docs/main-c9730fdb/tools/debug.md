---
title: "debug"
description: "Oh My Pi 官方仓库文档：debug。"
---

# debug \{#debug}

> 驱动一个 DAP 调试会话；相邻的调试 UI 代码复用同一子系统，处理日志、原始 SSE 捕获、报告、性能分析和系统诊断。

## 源码 \{#source}

- 入口：`packages/coding-agent/src/tools/debug.ts`
- 面向模型的提示：`packages/coding-agent/src/prompts/tools/debug.md`
- 关键协作组件：
   - `packages/coding-agent/src/dap/session.ts`：会话生命周期、断点/状态缓存
   - `packages/coding-agent/src/dap/client.ts`：适配器进程/套接字传输、DAP 消息循环
   - `packages/coding-agent/src/dap/config.ts`：适配器解析与自动选择
   - `packages/coding-agent/src/dap/defaults.json`：内置适配器定义
   - `packages/coding-agent/src/dap/types.ts`：请求/响应/能力结构
   - `packages/coding-agent/src/tools/tool-timeouts.ts`：按工具限制超时
   - `packages/coding-agent/src/debug/index.ts`：交互式调试选择器菜单
   - `packages/coding-agent/src/ui/apps/log-viewer/log-viewer.tsx`：近期日志 TUI 查看器
   - `packages/coding-agent/src/ui/apps/raw-sse/raw-sse.tsx`：原始 SSE TUI 查看器
   - `packages/coding-agent/src/debug/raw-sse-buffer.ts`：有界 SSE 捕获缓冲区
   - `packages/coding-agent/src/debug/remote-debugger.ts`：一次性 JavaScriptCore 远程检查器套接字
   - `packages/coding-agent/src/debug/profiler.ts`：CPU/堆性能分析辅助函数
   - `packages/coding-agent/src/debug/report-bundle.ts`：`.tar.gz` 报告打包、日志来源、缓存清理
   - `packages/coding-agent/src/debug/system-info.ts`：系统快照收集与环境变量脱敏
   - `packages/coding-agent/src/modes/view-model/apps/debug/terminal-info.ts`：终端状态收集/格式化
   - `packages/coding-agent/src/ui/apps/protocol-probe/protocol-probe.tsx`：终端协议探测面板和示例图像

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 描述 |
| --- | --- | --- | --- |
| `action` | `"launch" \| "attach" \| "set_breakpoint" \| "remove_breakpoint" \| "set_instruction_breakpoint" \| "remove_instruction_breakpoint" \| "data_breakpoint_info" \| "set_data_breakpoint" \| "remove_data_breakpoint" \| "continue" \| "step_over" \| "step_in" \| "step_out" \| "pause" \| "evaluate" \| "stack_trace" \| "threads" \| "scopes" \| "variables" \| "disassemble" \| "read_memory" \| "write_memory" \| "modules" \| "loaded_sources" \| "custom_request" \| "output" \| "terminate" \| "sessions"` | 是 | `packages/coding-agent/src/tools/debug.ts` 中工具分支的派发键。 |
| `program` | `string` | 否 | 启动目标路径。`launch` 时必填。如提供 `cwd` 则相对于它解析，否则相对于会话 cwd 解析。 |
| `args` | `string[]` | 否 | `launch` 的程序 argv。 |
| `adapter` | `string` | 否 | 显式适配器名称。否则由 `selectLaunchAdapter()` / `selectAttachAdapter()` 从 `packages/coding-agent/src/dap/config.ts` 自动选择。 |
| `cwd` | `string` | 否 | 启动/附加的工作目录。默认为会话 cwd。 |
| `file` | `string` | 否 | 源码断点的源文件路径。 |
| `line` | `number` | 否 | 源码断点的源码行。 |
| `function` | `string` | 否 | 函数断点名称。提供后，断点操作采用函数路径并忽略 `file`/`line`；模式不会拒绝同时提供这两种形式。 |
| `name` | `string` | 否 | 数据断点信息的目标名称。`data_breakpoint_info` 时必填。 |
| `condition` | `string` | 否 | 源码/函数/指令/数据断点的条件表达式。 |
| `hit_condition` | `string` | 否 | 指令/数据断点的命中次数条件。 |
| `expression` | `string` | 否 | 表达式或原始调试器命令。`evaluate` 时必填。 |
| `context` | `string` | 否 | 求值上下文。默认为 `"repl"`。作为 DAP 求值上下文原样传递。 |
| `frame_id` | `number` | 否 | `evaluate`、`scopes`、`data_breakpoint_info` 的栈帧选择器。省略时，`scopes` 和 `evaluate` 默认使用当前已停止的栈帧。 |
| `scope_id` | `number` | 否 | 来自作用域的变量引用。`variables` 接受此字段；也用作 `data_breakpoint_info` 的后备变量引用。 |
| `variable_ref` | `number` | 否 | `variables` 的变量引用；同时存在时优先于 `scope_id`。 |
| `pid` | `number` | 否 | `attach` 的本地进程 id。只有未选择显式适配器时，才要求至少提供 `pid` / `port` 之一。同时作为 DAP `pid` 和 `processId` 发送。 |
| `port` | `number` | 否 | 远程附加端口。未强制指定适配器时，存在 `port` 的附加操作优先使用 `debugpy`。 |
| `host` | `string` | 否 | `attach` 的远程附加主机。 |
| `levels` | `number` | 否 | `stack_trace` 的最大栈帧数。 |
| `memory_reference` | `string` | 否 | `disassemble`、`read_memory`、`write_memory` 的内存引用/地址。`disassemble` 在提供时使用它；否则，如果适配器提供了指令指针引用，则回退到当前停止位置的该引用。 |
| `instruction_reference` | `string` | 否 | 指令断点引用；指令断点操作时必填。`disassemble` 不使用它。 |
| `instruction_count` | `number` | 否 | `disassemble` 时必填。 |
| `instruction_offset` | `number` | 否 | `disassemble` 的指令偏移量。 |
| `count` | `number` | 否 | `read_memory` 的字节数。在该操作中必填。 |
| `data` | `string` | 否 | `write_memory` 的 Base64 载荷。在该操作中必填。 |
| `data_id` | `string` | 否 | 数据断点 id。`set_data_breakpoint` / `remove_data_breakpoint` 时必填。 |
| `access_type` | `"read" \| "write" \| "readWrite"` | 否 | `set_data_breakpoint` 的访问过滤条件。 |
| `command` | `string` | 否 | 自定义 DAP 请求命令。`custom_request` 时必填。 |
| `arguments` | `Record<string, unknown>` | 否 | `custom_request` 的自定义 DAP 请求体。 |
| `offset` | `number` | 否 | 指令断点、反汇编、内存读取、内存写入的偏移量。 |
| `resolve_symbols` | `boolean` | 否 | `disassemble` 的符号解析标志。 |
| `allow_partial` | `boolean` | 否 | `write_memory` 是否允许部分写入。 |
| `start_module` | `number` | 否 | `modules` 的模块分页起始索引。 |
| `module_count` | `number` | 否 | `modules` 的模块分页数量。 |
| `timeout` | `number` | 否 | 每次请求的秒数，默认为 `30`；`clampTimeout("debug", ...)` 先应用正值 `tools.maxTimeout` 上限，再应用工具的 `5..300` 范围（因此 5 秒下限仍优先于更低的全局上限）。 |

### 各操作的特定要求 \{#action-specific-requirements}

- `launch`：`program`
- `attach`：`pid` 或 `port`，除非显式适配器提供了其附加参数
- `set_breakpoint` / `remove_breakpoint`：`function`，或 `file` + `line`
- `set_instruction_breakpoint` / `remove_instruction_breakpoint`：`instruction_reference`
- `data_breakpoint_info`：`name`
- `set_data_breakpoint` / `remove_data_breakpoint`：`data_id`
- `evaluate`：`expression`
- `variables`：`variable_ref` 或 `scope_id`
- `disassemble`：能力 `supportsDisassembleRequest`，加上 `instruction_count`，以及 `memory_reference` 或带有 `instructionPointerReference` 的当前停止位置
- `read_memory`：能力 `supportsReadMemoryRequest`，加上 `memory_reference` 和 `count`
- `write_memory`：能力 `supportsWriteMemoryRequest`，加上 `memory_reference` 和 `data`
- `modules`：能力 `supportsModulesRequest`
- `loaded_sources`：能力 `supportsLoadedSourcesRequest`
- `custom_request`：`command`

### 交互式选择器的值 \{#interactive-selector-values}

`packages/coding-agent/src/debug/index.ts` 还提供一个仅用于 UI 的固定选择器，值包括 `open-artifacts`、`performance`、`work`、`dump`、`memory`、`logs`、`system`、`terminal`、`protocols`、`raw-sse`、`remote-debugger`、`transcript`、`clear-cache`。这些值不能由模型通过 `debugSchema` 调用；它们是本地 TUI 菜单路由。

## 输出 \{#outputs}

智能体工具从 `packages/coding-agent/src/tools/debug.ts` 返回标准的 `toolResult()` 载荷：

- `content`：一个文本块。每个操作都会生成可读文本；`content` 中没有结构化 JSON 块。
- `details.action`：回显操作。
- `details.success`：始终初始化为 `true`；失败会在返回结果前通过抛出错误呈现。
- `details.snapshot`：对于操作或创建会话的操作存在，使用 `packages/coding-agent/src/dap/types.ts` 中的 `DapSessionSummary`。
- 各操作特定的 `details` 字段：
   - `launch` / `attach`：`adapter`
   - 断点操作：`breakpoints`、`functionBreakpoints`、`instructionBreakpoints`、`dataBreakpoints`
   - `data_breakpoint_info`：`dataBreakpointInfo`
   - `continue` / `step_*`：`state`、`timedOut`
   - `threads`：`threads`
   - `stack_trace`：`stackFrames`
   - `scopes`：`scopes`
   - `variables`：`variables`
   - `evaluate`：`evaluation`
   - `disassemble`：`disassembly`
   - `read_memory`：`memoryAddress`、`memoryData`、`unreadableBytes`
   - `write_memory`：`bytesWritten`
   - `modules`：`modules`
   - `loaded_sources`：`sources`
   - `custom_request`：`customBody`
   - `output`：`output`
   - `sessions`：`sessions`

流式/UI 行为：

- 可发现工具的渲染器合并调用与结果（`mergeCallAndResult: true`），以内联方式渲染，并在参数/结果仍在组装时启用带动画的部分结果呈现。
- `debug.ts` 本身不通过 `_onUpdate` 发出进度更新；执行结果一次性交付。
- 审批随操作而异：只读操作（`output`、`threads`、`stack_trace`、`scopes`、`variables`、`disassemble`、`read_memory`、`loaded_sources`、`modules`、`sessions`）请求读取审批；所有其他操作请求执行审批。
- 交互式选择器由 UI 驱动，而不是模型驱动。它切换 TUI 组件、向聊天窗格追加状态行、在外部查看器中打开文件、写入归档/临时文件，或启动进程级 JavaScriptCore 检查器套接字。

模型工具结果之外的旁路产物：

- `createReportBundle()` 在报告目录下写入 `omp-report-<timestamp>.tar.gz`，并向 UI 处理器返回文件系统路径。
- `#handleWorkReport()` 先写入 `/tmp/work-profile-<Date.now()>.svg`，然后打开它。
- `RawSseViewerComponent` 和 `DebugLogViewerComponent` 可以将捕获的文本复制到剪贴板。

## 流程 \{#flow}

1. 工具注册有条件：`packages/coding-agent/src/tools/debug.ts` 中的 `DebugTool.createIf()` 会返回 `null`，除非 `cfgDebugEnabled.get(session.settings)`（`debug.enabled`，定义于 `packages/coding-agent/src/tools/settings.ts`）为 true（默认 `true`）。`packages/coding-agent/src/tools/index.ts` 连接该工厂，并在工具过滤时重新检查相同设置。
2. `DebugTool.execute()` 通过 `clampTimeout("debug", params.timeout)` 限制 `params.timeout`，先应用可选的正值 `tools.maxTimeout` 上限，再应用工具的 5 秒下限和 300 秒上限，并将调用方 `AbortSignal` 与 `AbortSignal.timeout(...)` 组合。
3. `launch` 解析 cwd/program 路径，将目标分类为文件/目录/不存在，除非所选适配器设置了 `acceptsDirectoryProgram`，否则拒绝目录，并委托给 `dapSessionManager.launch()`。`attach` 解析 cwd 并选择适配器；只有未指定显式适配器时才要求 `pid` 或 `port`。
4. `DapSessionManager.launch()` / `.attach()` 强制单个根会话，通过 `DapClient.spawn()` 启动适配器，注册监听器，发送 `initialize`，缓存能力，订阅整棵树的停止事件，发送 `launch`/`attach`，然后完成 `initialized` → `configurationDone` 握手。
5. `DapClient.spawn()` 使用 `NON_INTERACTIVE_ENV` 以分离方式启动适配器。`stdio` 使用适配器管道；`socket` 在 Linux 上使用 Unix 套接字，在其他平台上使用适配器回调连接本地 TCP 监听器；`tcp` 替换适配器参数中的 `${port}`，启动其本地服务器，然后连接。子会话通过 `DapClient.connect()` 复用根 `tcp` 服务器。
6. `packages/coding-agent/src/dap/session.ts` 中的 `#registerSession()` 安装反向请求处理器：
   - `runInTerminal`：通过 `ptree.spawn()` 以分离方式启动所请求的被调试程序命令，将其 stdout 持续读入有界会话输出缓存，并返回 `{ processId }`
   - `startDebugging`：将子 DAP 客户端连接到根 TCP 服务器，转发所请求的 `launch`/`attach` 配置，在 `configurationDone` 之前绑定根断点，并递归安装相同的处理器
   - 事件：`output`、`initialized`、`stopped`、`continued`、`exited` 和 `terminated` 更新缓存的会话状态；停止的子会话成为活动目标
7. 操作类动作（`set_breakpoint`、`evaluate`、`threads`、`read_memory`、`custom_request` 等）调用 `dapSessionManager` 方法。大部分经由 `#sendRequestWithConfig()`，它会先在需要时发送 `configurationDone`，然后发送 DAP 请求，并刷新活动会话及其祖先。
8. 断点操作会在存活的根/子会话树中同步所需断点集。新子会话会在其 `configurationDone` 请求之前收到这些集合。
9. `continue` 和三个单步操作清除缓存的停止状态，在发送 DAP 请求前订阅会话树中任意位置的停止/终止事件，然后由 `#awaitStopOutcome()` 返回活动子会话的停止位置，或报告目标在超时后仍在运行。
10.   `pause` 发送 DAP `pause`，在需要时等待停止事件；如果程序已经停止，则复用缓存的停止状态。
11.   当调用方省略 id 且缓存状态可用时，`stack_trace`、`scopes`、`variables` 和 `evaluate` 默认使用当前已停止的子会话/线程/栈帧。
12.   `output` 从活动 `DapSession` 读取内存中的环形输出缓冲区。`terminate` 从根遍历每个子会话，尽力发送 `terminate`/`disconnect`，即使适配器超时，也会销毁整棵树。
13.   `sessions` 读取管理器的当前映射，并格式化根会话和子会话摘要。只能存在一棵根树；递归的适配器请求子会话通过 `parentSessionId` / `childSessionIds` 跟踪。
14.   `packages/coding-agent/src/debug/index.ts` 中的交互式选择器构建包含固定值的 `SelectList`，并将每个值派发给处理器：

- `performance`：`startCpuProfile()`，等待 Enter/Escape，停止性能分析，使用 `getWorkProfile(30)` 读取 30 秒工作性能分析，然后通过 `createReportBundle()` 打包
- `work`：读取 `getWorkProfile(30)`，写入临时 SVG，在外部打开
- `dump`：立即创建报告包
- `memory`：强制 GC，使用 `collectMemoryStats()` 收集数值型进程与堆统计，然后打包
- `logs`：构建 `DebugLogSource` 并挂载 `DebugLogViewerComponent`
- `raw-sse`：从会话解析 `RawSseDebugBuffer` 并挂载 `RawSseViewerComponent`
- `remote-debugger`：复用或启动回环 JavaScriptCore `RemoteInspectorServer` 套接字，并显示其主机/端口；Bun API 为进程级，且没有停止操作
- `system`：调用 `collectSystemInfo()` 并将 `formatSystemInfo()` 渲染到聊天窗格
- `terminal`：将 `collectTerminalState()` + `formatTerminalState()` 渲染到聊天窗格
- `protocols`：发送测试桌面通知（除非被抑制），然后挂载带有示例图像的 `ProtocolProbeComponent`
- `open-artifacts`：如果当前会话产物目录存在，则打开它
- `transcript`：委托给 `ctx.handleDebugTranscriptCommand()`
- `clear-cache`：显示确认，然后使用 `clearArtifactCache()` 移除超过 30 天的产物目录

## 模式 / 变体 \{#modes--variants}

- **可用性门控**
   - `debug.enabled` 为 false 时隐藏工具；该设置默认为 `true`。工具采用可发现加载和独占并发。
- **适配器选择**
   - 内置适配器 id 为 `gdb`、`lldb-dap`、`codelldb`、`debugpy`、`dlv`、`js-debug-adapter`、`netcoredbg`、`kotlin-debug-adapter`、`rdbg`、`php-debug-adapter`、`bash-debug-adapter`、`dart-debug-adapter`、`flutter-debug-adapter` 和 `elixir-ls-debugger`。
   - `launch`：显式 `adapter` 优先。否则先尝试扩展名匹配的适配器；如果存在已配置的匹配项但没有任何一个能解析，工具会报告其安装/配置失败，而不是静默选择无关的调试器。根标记会沿目标的祖先目录向上检查。包目录优先选择匹配且支持目录的适配器；其余候选按扩展名匹配、根匹配、原生调试器偏好（`gdb`、`lldb-dap`）排序。
   - Delve 对目录和 `.go` 源文件使用 `mode: "debug"`，对现有的已编译二进制文件使用 `mode: "exec"`，覆盖其静态启动默认值。
   - `attach`：显式 `adapter` 优先。`pid` 根据运行中进程的可执行映像（不是显示名称）选择运行时适配器。提供 V8 检查器服务的 `port` 优先选择 `js-debug-adapter`；其他端口优先选择 `debugpy`。如果没有匹配项，则先尝试原生调试器，再尝试第一个可用适配器。
- **自定义适配器配置**
   - 可以通过 `dap.json`、`.dap.json`、`dap.yaml`、`.dap.yaml`、`dap.yml` 或 `.dap.yml` 添加或覆盖调试适配器。
   - 搜索顺序：所选 cwd、其项目配置目录（`.omp/`）、用户配置目录（`~/.omp/agent/`）、插件根目录，最后是主目录根级后备位置。文件按从低到高的优先级合并。
   - 配置结构可以是 `{ "adapters": { ... } }`，也可以是顶层适配器映射。
   - 适配器字段：
      - `command`：可执行文件名称或路径。必填。
      - `args`：适配器 argv。
      - `languages`：显示/过滤元数据。
      - `fileTypes`：用于启动自动选择的小写文件扩展名。
      - `rootMarkers`：用于对项目的适配器排序的文件/目录。
      - `launchDefaults`：默认 DAP 启动参数，在所选 program/cwd/args 之前合并。
      - `attachDefaults`：默认 DAP 附加参数。显式适配器可以不带 PID 或端口进行附加；其适配器会验证这些参数。`skipAttachRequest: true` 会执行初始化/配置，但不发送 DAP `attach`。
      - `connectMode`：`"stdio"`（默认）、`"socket"`（Delve 风格、依赖平台的套接字/回调），或 `"tcp"`（启动本地 DAP 服务器，将 `${port}` 替换进 `args`）。
      - `acceptsDirectoryProgram`：对于 `dlv` 等可启动包/项目目录的适配器，设为 `true`。

`.omp/dap.json` 示例：

```json
{
	"adapters": {
		"custom-jvm": {
			"command": "kotlin-debug-adapter",
			"args": ["--stdio"],
			"languages": ["java", "kotlin"],
			"fileTypes": [".java", ".kt", ".kts"],
			"rootMarkers": ["pom.xml", "build.gradle", "build.gradle.kts"],
			"launchDefaults": {
				"request": "launch",
				"projectRoot": "."
			},
			"attachDefaults": {
				"request": "attach",
				"host": "127.0.0.1"
			}
		}
	}
}
```

用于 OpenOCD 远程目标的 GDB 示例：

```json
{
	"adapters": {
		"pico-openocd": {
			"command": "gdb",
			"args": ["-q", "-ex", "file zig-out/firmware/gc9a01-test.elf", "-i", "dap"],
			"attachDefaults": {
				"target": ":3334"
			}
		}
	}
}
```

- **传输**
   - `stdio`：直接使用适配器 `stdin`/`stdout` 分帧。
   - `socket`：Linux 上使用 Unix 域套接字；macOS/其他平台上由适配器回调本地 TCP 监听器。
   - `tcp`：预留回环端口，将其替换到适配器参数中的 `${port}`，等待适配器监听，然后连接。解析出的 JavaScript/TypeScript 适配器使用此模式，递归 `startDebugging` 子会话也要求此模式。
- **DAP 智能体工具操作**
   - `launch`：启动适配器，初始化会话，可能在入口停止；返回格式化的会话快照和 `details.adapter`。
   - `attach`：连接到运行中的进程或远程端口；输出结构与 `launch` 相同。
   - `set_breakpoint`：添加/更新源码或函数断点；返回该目标当前的断点列表。
   - `remove_breakpoint`：移除源码或函数断点；返回剩余断点列表。
   - `set_instruction_breakpoint` / `remove_instruction_breakpoint`：要求 `supportsInstructionBreakpoints`；返回当前指令断点列表。
   - `data_breakpoint_info`：要求 `supportsDataBreakpoints`；向适配器查询 `name` 的 `dataId`、访问类型和描述。
   - `set_data_breakpoint` / `remove_data_breakpoint`：要求 `supportsDataBreakpoints`；返回缓存的数据断点列表。
   - `continue` / `step_over` / `step_in` / `step_out`：返回描述执行是已停止、已终止还是继续运行的文本，以及 `details.state` 和 `details.timedOut`。
   - `pause`：中断运行中的目标，并返回停止快照。
   - `evaluate`：适配器表达式求值；上下文默认为 `repl`。
   - `stack_trace`：获取解析出的线程的栈帧。
   - `threads`：获取当前线程。
   - `scopes`：显式 `frame_id` 或当前已停止栈帧的作用域。
   - `variables`：`variable_ref` 或 `scope_id` 的变量。
   - `disassemble`：要求 `supportsDisassembleRequest`；围绕 `memory_reference` 反汇编，未提供内存引用时则围绕当前停止的指令指针反汇编。
   - `read_memory`：要求 `supportsReadMemoryRequest`；返回地址、base64 数据、不可读字节数。
   - `write_memory`：要求 `supportsWriteMemoryRequest`；写入 base64 数据并报告写入字节数。
   - `modules`：要求 `supportsModulesRequest`；可通过 `start_module` / `module_count` 分页。
   - `loaded_sources`：要求 `supportsLoadedSourcesRequest`；返回已加载源文件描述符。
   - `custom_request`：发送任意 DAP 请求名称及任意参数。
   - `output`：输出缓存的 DAP output 事件，以及从 `runInTerminal` 被调试程序持续读入的 stdout。
   - `terminate`：断开并销毁活动会话；不存在会话时返回 `No debug session to terminate.`。
   - `sessions`：列出所有缓存的会话摘要。
- **交互式选择器路由（仅 UI）**
   - `logs`：将今天的日志尾部和可选的更早每日日志文件加载到 `DebugLogViewerComponent`；支持复制、范围选择、pid 过滤、加载更早内容。
   - `raw-sse`：会话 `RawSseDebugBuffer` 的实时视图；支持跟随尾部、滚动、全部复制。
   - `remote-debugger`：在 `127.0.0.1` 和自动预留的端口上启动或复用进程级 JavaScriptCore WebKit 检查器；它是实验性的，无法停止/重新绑定，并要求兼容的 Safari/WebKit 检查器客户端。
   - `performance`：CPU 性能分析 + 30 秒工作性能分析 + 报告包。
   - `memory`：数值型内存统计（`memory.json`）+ 报告包。
   - `dump`：不包含性能分析产物的报告包。
   - `work`：独立导出/打开工作性能分析火焰图。
   - `system`：格式化的操作系统/架构/CPU/内存/版本/cwd/shell/终端转储。
   - `terminal`：格式化的终端子协议/几何信息/滚屏历史缓冲区状态转储。
   - `protocols`：终端协议测试：产生桌面通知副作用，并提供对特殊协议进行采样的探测面板。
   - `open-artifacts` / `transcript` / `clear-cache`：打开产物目录、导出会话记录、清理产物缓存。

## 副作用 \{#side-effects}

- 文件系统
   - 相对于会话 cwd 解析 program/file/cwd 路径。
   - 创建报告会写入 `.tar.gz` 包，并读取当前会话 JSONL、其递归产物子树（包括嵌套子代理会话记录/产物）和当天日志。不包含无关的同级会话；它们的日志记录会从 `session-logs.txt` 中排除，但仍出现在 `logs.txt` 按文件收集的尾部内容中。
   - 内存报告仅包含数值型进程/堆计数器，不包含堆快照或从运行时派生的类型名称。会话数据、产物、日志、设置、原始 SSE 诊断信息和环境变量值仍可能包含隐私数据；分享前请检查归档。环境变量脱敏匹配变量名，而不是值中的任意秘密。
   - 含有 `heap.heapsnapshot` 的旧内存报告须视为携带凭据的文件。不要分享它们；如果已经分享，请撤销或轮换暴露的提供方和 MCP 凭据，包括 OAuth 刷新令牌，并移除已分享的副本。
   - 工作性能分析导出会写入 `/tmp/work-profile-<timestamp>.svg`。
   - 日志来源从日志目录读取每日日志文件。
   - 产物缓存清理会移除早于截止时间的会话产物目录。
   - `resolveRawSseDebugBuffer()` 在所有者存在显式 `rawSseDebugBuffer` 属性时复用它，否则在私有 `Symbol("debug.rawSseBuffer")` 键下缓存缓冲区（所有者不可扩展时静默跳过）。
- 网络
   - Socket/TCP 模式适配器绑定或连接本地套接字；远程附加可能通过适配器连接远程调试端口。
   - 仅 UI 的 `remote-debugger` 路由在随机预留的 `127.0.0.1` TCP 端口上打开进程级 JavaScriptCore 检查器。它会探测套接字是否就绪，且没有停止操作。
- 子进程 / 原生绑定
   - 以分离方式启动调试器适配器（`gdb`、`lldb-dap`、`python -m debugpy.adapter`、`dlv`，以及 `defaults.json` 中的其他适配器）。
   - 反向 DAP `runInTerminal` 请求通过 `ptree.spawn()` 以分离方式启动被调试程序；其整个生命周期中，stdout 都会在后台被持续读取。
   - `getWorkProfile(30)` 来自 `@oh-my-pi/pi-natives`。
   - CPU 性能分析使用 `node:inspector/promises`；内存统计使用 `process.memoryUsage()` 和 GC 后 `bun:jsc` 的 `heapStats()` 中的数值计数器；原始数据/日志查看器通过 `@oh-my-pi/pi-utils` 中的 `sanitizeText()` 清理文本。
   - `openPath()` 为产物目录和 SVG 启动操作系统默认的文件/浏览器处理程序。
   - 日志/原始 SSE 查看器可以调用 `copyToClipboard()`。
- 会话状态（会话记录、内存、任务、检查点、注册表）
   - `DapSessionManager` 在内存中保留会话摘要、断点、线程、栈帧、停止位置、输出捕获、能力和最近使用时间戳。
   - 活动会话 id 对单例 `dapSessionManager` 是全局的。
   - `RawSseDebugBuffer` 按所有者/会话存储近期 SSE 事件。
   - `remote-debugger.ts` 缓存活动检查器端点，并合并并发启动；底层 Bun 检查器对该进程而言是单向的。
   - 工具为 `exclusive`；并发 debug 工具调用会被调度器阻止。
- 用户可见提示 / 交互式 UI
   - 调试选择器在删除缓存前显示确认。
   - 性能分析会临时接管编辑器的 Enter/Escape 处理器，直到分析停止。
   - 日志/原始 SSE 查看器用自定义组件替换编辑器窗格。
- 后台工作 / 取消
   - 每个 DAP 请求都接受 `AbortSignal`；超时和调用方取消会中止活动请求，而不是整个会话生命周期。
   - `DapSessionManager` 每 30 秒运行一次后台清理循环。
   - 原始 SSE 查看器在关闭前持续订阅缓冲区更新。

## 限制与上限 \{#limits--caps}

- 工具超时限制：`packages/coding-agent/src/tools/tool-timeouts.ts` 中的 `default=30`、`min=5`、`max=300`。
- 每次 DAP 请求的默认超时：`packages/coding-agent/src/dap/client.ts` 中的 `DEFAULT_REQUEST_TIMEOUT_MS = 30_000`。
- 单个活动会话：由 `packages/coding-agent/src/dap/session.ts` 中的 `#ensureLaunchSlot()` 强制执行。
- 空闲会话清理：`IDLE_TIMEOUT_MS = 10 * 60 * 1000`，每隔 `CLEANUP_INTERVAL_MS = 30 * 1000` 检查一次。
- 适配器存活心跳：`HEARTBEAT_INTERVAL_MS = 5 * 1000`。
- 输出捕获上限：`MAX_OUTPUT_BYTES = 128 * 1024`；从前端丢弃完整块（然后对最前面的块按字节裁切，使剩余内容恰好达到上限），并记录 `outputTruncated`。
- 启动/附加后的初始停止捕获超时：`STOP_CAPTURE_TIMEOUT_MS = 5_000`。
- Socket 模式适配器就绪超时：`waitForCondition()` 中的 `10_000` 毫秒，以及 `packages/coding-agent/src/dap/client.ts` 中的 TCP 连接超时逻辑。
- `packages/coding-agent/src/debug/raw-sse-buffer.ts` 中的原始 SSE 缓冲区上限：
   - `MAX_RAW_SSE_EVENTS = 1_000`
   - `MAX_RAW_SSE_CHARS = 512_000`
   - 每个事件 `MAX_RAW_SSE_EVENT_CHARS = 64_000`；超预算事件会先将较长的 `tools` 模式/描述压缩为 200 字符的预览（保留 name/type），如果仍超限，则使用头部+尾部裁剪，并带有 `: omp-debug-elided chars=...`。被裁剪的事件以 `: omp-debug-truncated originalChars=...` 结尾。
- `packages/coding-agent/src/ui/apps/log-viewer/entries.ts` 中的日志查看器窗口：
   - `LOG_CHUNK = 50`（初始窗口及每次加载更早块）
- `packages/coding-agent/src/debug/report-bundle.ts` 中的报告/日志摄取上限：
   - 交互式日志读取为 `MAX_LOG_LINES = 5000`
   - 尾部读取上限为 `MAX_LOG_BYTES = 2 * 1024 * 1024`
   - 报告包从每个带 PID 标识/已轮转的当天日志文件中包含最多 `1000` 行尾部内容，按 mtime 排序，并带文件名分隔符
   - `session-logs.txt` 保存当天最后 `MAX_LOG_LINES` 条记录，其 `sessionId` 属于打包的会话或其打包的某个子代理会话记录；从完整文件读取，而不是尾部
   - 产物包含范围只递归跟随当前会话的产物子树；没有单独的十个子代理上限
- `packages/coding-agent/src/debug/index.ts` 中的交互式性能分析窗口：performance 和 work 报告都请求 `getWorkProfile(30)`。
- 产物缓存清理默认值：`clearArtifactCache()` 及选择器确认文本中的 `30` 天。

## 错误 \{#errors}

- `packages/coding-agent/src/tools/debug.ts` 中的参数验证会抛出 `ToolError`，并带有明确消息，例如：
   - `program is required for launch`
   - 未选择显式适配器时的 `attach requires pid or port`
   - `set_breakpoint requires file+line or function`
   - `variables requires variable_ref or scope_id`
   - `instruction_count is required for disassemble`
   - `disassemble requires memory_reference unless the current stop location has an instruction pointer reference`
   - `memory_reference is required for read_memory`
   - `count is required for read_memory`
   - `data is required for write_memory`
   - 所选适配器未设置 `acceptsDirectoryProgram` 时的 `launch program resolves to a directory: <path>...`
   - `command is required for custom_request`
- 适配器选择失败会抛出 `No debugger adapter available. Installed adapters: ...`。
- 由能力控制的操作会从 `requireCapability(...)` 抛出错误，例如 `Current adapter does not support memory reads`。
- 无会话和状态错误来自 `DapSessionManager`，例如 `No active debug session. Launch or attach first.`、`No active stack frame. Run stack_trace first or supply frame_id.`、`Debugger reported no threads.`
- 启动第二个存活会话会抛出 `Debug session <id> is still active. Terminate it before launching another.`
- DAP 传输/请求失败以 `DapClient` 抛出的错误呈现：
   - `DAP request <command> timed out after <ms>ms`
   - `DAP event <event> timed out after <ms>ms`
   - `DAP adapter <name> is not running`
   - `DAP adapter exited (code N): <stderr>` 或 `DAP adapter exited unexpectedly (code N)`
   - DAP 请求失败时适配器响应中的 `message`
- 当目标超过超时仍在运行时，`continue` / `step_*` 被有意设计为非致命：它们返回 `details.timedOut = true` 和 `state: "running"`，而不是抛出错误。
- `terminate` 在发送 `terminate`/`disconnect` 时抑制适配器错误；它仍会销毁客户端，并尽可能返回最后的摘要。
- 交互式选择器处理器会报告 UI 错误，而不是抛出错误：
   - 性能分析器启动/停止、报告打包、日志读取、系统信息收集、缓存清理、产物打开和远程检查器启动使用 `ctx.showError(...)` / `ctx.showWarning(...)`
   - 空日志和空产物缓存是警告/状态消息，而不是失败
   - 日志/原始 SSE 查看器中的复制失败会变为 UI 中的状态/错误文本
- 报告包辅助函数对许多文件读取有意采用尽力而为的方式：缺失的会话文件、缺失的产物目录、不可读的产物文件、缺失的日志目录、无法访问的缓存目录和缺失的子代理文件都会被静默跳过。
- `collectSystemInfo()` 对 CPU 探测采用尽力而为的方式；此处失败会回退为 `Unknown CPU`。
- 远程检查器启动会拒绝已被占用的端口，如果所选回环套接字在探测期限内仍无法访问，也会失败。UI 将此报告为 `Failed to start remote debugger: ...`。

## 说明 \{#notes}

- `packages/coding-agent/src/prompts/tools/debug.md` 告知模型只支持一个活动根会话。适配器请求的子会话属于该根树。
- 默认 JavaScript/TypeScript 适配器通过 TCP 运行 vscode-js-debug 的 `dapDebugServer.js`。可通过以下任一方式安装；第一种和最后一种会由 `packages/coding-agent/src/dap/config.ts` 中的 `resolveJsDebugServerPath()` 自动发现。（不要尝试 `npm i -g js-debug-adapter`，它会返回 404；`js-debug-adapter` 是 omp 适配器 id，不是 npm 包。）
   - 发布 tar 包，解压后使 `dapDebugServer.js` 位于 `~/.local/opt/js-debug/src/dapDebugServer.js`：
      ```sh
      curl -sL -o js-debug-dap.tar.gz \
        https://github.com/microsoft/vscode-js-debug/releases/download/v1.117.0/js-debug-dap-v1.117.0.tar.gz
      mkdir -p ~/.local/opt && tar -xzf js-debug-dap.tar.gz -C ~/.local/opt
      ```
      将 `v1.117.0` 替换为[发布页面](https://github.com/microsoft/vscode-js-debug/releases)中的最新标签。
   - 通过 `JS_DEBUG_DAP_SERVER=<path-to-dapDebugServer.js>` 指定任何其他位置。
   - 使用 Mason 的 Neovim 用户：`:MasonInstall js-debug-adapter` → 在 `~/.local/share/nvim/mason/packages/js-debug-adapter/js-debug/src/dapDebugServer.js` 被发现。
- 如果 `PATH` 上有 `node`，适配器在其下运行，否则在 omp 宿主（Bun）下运行；`resolveDefaultJsDebugAdapter()` 回退到 `process.execPath`，因此支持仅有 Bun 的设置。
- `configurationDone` 会在根会话和子会话的启动/附加握手期间自动发送，如果初始握手未完成，也会在后续请求之前按需发送。
- `startDebugging` 反向请求在同一 TCP 服务器上创建递归子会话；停止的子会话会成为线程级操作的目标。
- `output` 提供活动会话合并后的 DAP `output` 事件和 `runInTerminal` stdout。DAP 的 stdout/stderr/console 类别不分开；终端启动路径不会将其单独持续读取的 stderr 添加到此缓存。
- 会话摘要提供 `needsConfigurationDone`、`parentSessionId` 和 `childSessionIds`。
- 源码断点文件路径在缓存并跨树同步之前，会通过 `path.resolve()` 规范化。
- `evaluate` 默认为 `repl`，因此适配器支持时，工具可以转发原始调试器命令。
- `disassemble` 先从 `memory_reference` 解析目标，再尝试当前已停止会话的 `instructionPointerReference`；两者都不存在时会抛出错误。
- `RawSseDebugBuffer.recordEvent()` 在进行有界保留之前递增 `totalEvents`。因此，快照显示的保留记录数可能少于已观察到的事件总数。
- 原始 SSE 缓冲区监听器的失败会被吞掉，以免查看器缺陷破坏捕获。
- `createDebugLogSource()` 从当前进程的日志开始，并按日期从新到旧排列其他带 PID 标识/已轮转的日志；`loadOlderLogs()` 会在拼接前反转每个请求的切片。
- `clearArtifactCache()` 按目录 mtime 删除目录，而不是按单个文件的年龄。
- `addDirectoryToArchive()` 使用 `Bun.file(...).text()` 将产物文件作为文本读取。报告包中不会逐字节保留二进制产物内容。
- 工具渲染器会为 TUI 预览截断显示的输出，但底层文本结果仍包含完整的返回字符串。
- 仅 UI 的 JavaScriptCore 远程调试器在启动后是幂等的，且无法停止，因为 `bun:jsc` 不返回句柄。它只绑定到 `127.0.0.1`；成功与否由回环就绪探测确定，因为在 macOS 上，即使套接字已启动，Bun 也可能抛出虚假的绑定错误。
