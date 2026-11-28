---
title: "eval 工具 Python 后端"
description: "Oh My Pi 官方仓库文档：eval 工具 Python 后端。"
---

# eval 工具 Python 后端 \{#eval-tool-python-backend}

本文介绍 `packages/coding-agent` 中的 Python 执行栈。
内容涵盖工具行为、运行器生命周期、环境处理、执行语义、输出渲染、支持的魔法命令以及运行故障模式。

## 范围与关键文件 \{#scope-and-key-files}

- 工具接口：`src/tools/eval.ts`
- 会话级/单次调用内核编排：`src/eval/py/executor.ts`
- 子进程内核客户端：`src/eval/py/kernel.ts`
- 共享 IPC/取消客户端：`src/eval/kernel-base.ts`
- 共享会话/重置所有权：`src/eval/kernel-session-registry.ts`
- 独立 `%load` 的准备处理：`src/eval/input.ts`
- Python 包装器 / NDJSON 服务器：`src/eval/py/runner.py`
- 加载到每个内核的前置辅助函数：`src/eval/py/prelude.py`
- 宿主端子代理辅助函数桥接：`src/eval/agent-bridge.ts`
- 工具输出渲染器与视图拆分：`packages/coding-agent/src/ui/tools/eval.tsx`
- 共享输出捕获：`packages/coding-agent/src/tools/streaming-output.ts`
- 用户触发的 Python 运行的交互模式渲染器：`packages/coding-agent/src/ui/transcript/exec-run.tsx`
- 运行时/环境过滤与 Python 解析：`src/eval/py/runtime.ts`

## eval 的 Python 后端是什么 \{#what-evals-python-backend-is}

`eval` 工具每次调用在保留的 Python 子进程内执行一个 Python 单元，该进程通过 stdin/stdout 使用 NDJSON 通信。运行器本身不需要 Jupyter 网关，也不需要额外的 pip 依赖；可选库（pandas、polars、matplotlib、PIL）需另行安装。可用性探测运行 `python -c "import sys;sys.exit(0)"`，检查解释器能否启动，不检查其版本或运行器的每项功能。不提供 `display()`：输出 API 是 `print` 和末尾表达式回显（参见[富内容打印](#rich-print)）。

当前工具输入：

```ts
{
  language: "py";
  code: string;    // inline source or a standalone %load / %pip install
  title?: string;
  timeout?: number; // seconds; default 30, 0 disables, otherwise clamped to 1..3600
  reset?: boolean;  // wipe the Python kernel before this call
}
```

会话作用域的传输模式仅声明已启用的运行时（"py" 和 "js"）。Python 和 JavaScript 默认启用。该工具在前台调度中采用 `concurrency = "exclusive"`。自动转入后台可以在单元仍在运行时返回，内核定义的工具请求也有自己的分发路径；工具独占调度并不是全局内核锁。在 `session` 模式下，状态跨调用保留。

## 内核生命周期 \{#kernel-lifecycle}

每个 Python 内核都是一个子进程：`<resolved-python> -u <runner.py>`。运行器随宿主二进制文件打包（Bun 文本导入），按脚本哈希写入操作系统临时目录下的用户专属 `omp-python-runner-<uid>` 缓存一次，后续启动复用该缓存。

内核启动顺序：

1. 可用性检查（`checkPythonKernelAvailability`），验证能否解析并运行 Python 解释器。
2. 使用过滤后的环境和 `cwd` 启动 `python -u runner.py`。
3. 发送初始化请求，运行 `os.chdir(cwd)`、注入环境条目，并将 `cwd` 加入 `sys.path`。
4. 执行 `PYTHON_PRELUDE`（幂等，每个进程只初始化一次）。

内核关闭：

- 通过 stdin 发送 `{"type": "exit"}`。
- 在 `SHUTDOWN_GRACE_MS` 时限内等待进程退出。
- 如果进程未及时退出，则升级为 `SIGTERM`，最后使用 `SIGKILL`。

## 传输协议（NDJSON，宿主 ↔ 运行器） \{#wire-protocol-ndjson-host--runner}

每行一个 JSON 对象，使用 UTF-8，以 `\n` 结尾。

宿主 → 运行器：

```jsonc
{"id": "<reqId>", "code": "<source>", "silent": false, "storeHistory": true, "cwd": "<optional>", "filename": "<optional source path>", "env": {"KEY": "VAL"}}
{"type": "exit"}
```

运行器 → 宿主：

```jsonc
{"type": "started",  "id": "<reqId>"}
{"type": "stdout",   "id": "<reqId>", "data": "..."}
{"type": "stderr",   "id": "<reqId>", "data": "..."}
{"type": "view",     "id": "<reqId>", "text": "...", "view": {"kind": "table"|"json"|"markdown", ...}}
{"type": "image",    "id": "<reqId>", "image": {"mimeType": "...", "data": "<base64>", "detail"?: "...", "url"?: "...", "providerFile"?: {...}}}
{"type": "status",   "id": "<reqId>", "event": {"op": "...", ...}}
{"type": "reply",    "id": "<reqId>", "value": {"ok": true, ...}}
{"type": "error",    "id": "<reqId>", "ename": "...", "evalue": "...", "traceback": ["..."]}
{"type": "done",     "id": "<reqId>", "status": "ok"|"error", "executionCount": N, "cancelled": false}
```

- `view` 携带 `text` 的美化渲染结果，而单元已通过 `stdout` 打印该文本；宿主不会再次将 `text` 加入输出流。运行器在发送 `view` 或 `image` 之前刷新缓冲的 stdout，因此文本在其前面。
- `image` 同时发送给模型和用户。
- `status` 携带前置辅助函数和魔法命令发出的结构化事件（`_emit_status("find", count=…)`），供 TUI 状态渲染器使用。
- `reply` 回答工具请求（参见[工具可用性与模式选择](#tool-availability-and-mode-selection)）；`kernel-base.ts` 将其作为 `KernelExecuteResult.reply` 返回。

## 魔法命令 \{#magics}

运行器的源代码转换器会在解析前将 IPython 风格的魔法命令重写为普通 Python 调用。支持以下命令：

| 魔法命令 | 效果 |
| --- | --- |
| `%pip <args>` | 执行 `python -m pip <args>` 并实时流式输出；暂停单元看门狗。在没有 pip 的解释器（`uv venv` 环境）中，先用 `ensurepip` 安装 pip，若失败则用 `uv`（当其位于 `PATH` 中时）。新安装的包会从 `sys.modules` 中移除，使下一次 `import` 获取新安装的版本。 |
| `%cd <path>` | 执行 `os.chdir(path)`（展开 `~`）；发出状态事件。 |
| `%pwd` | 返回 `os.getcwd()`。 |
| `%ls [path]` | 返回 `sorted(os.listdir(path))`。 |
| `%env [KEY[=VAL]]` | 列出、读取或设置环境变量（与前置辅助函数 `env()` 的语义相同）。 |
| `%set_env KEY VALUE` | 设置 `os.environ[KEY]`。 |
| `%time <expr>` / `%timeit <stmt>` | `%time` 求值一次；`%timeit` 使用 `timeit.Timer.autorange()` 并报告每轮耗时。两者都会发出状态事件。 |
| `%who` / `%whos` | 列出用户命名空间中的名称。 |
| `%reset` | 清除用户全局变量并恢复运行器的魔法内置项，而非宿主前置代码。要获得完全初始化的新内核，优先使用工具输入 `reset: true`。 |
| `%load <path>` | 在保留的命名空间中执行引号括起的文件路径，支持顶层 await 和包含文件名的回溯；不回显源代码。独立的 `%load` 单元则由宿主读取（支持 `local://`）。 |
| `%run <path>` | 执行 `runpy.run_path` 并将全局变量合并回来。 |
| `%%bash` | 通过 `bash` 运行单元体。这是注册的唯一 shell 单元魔法命令，`%%sh` 不存在，未注册的名称会引发 `Cell magic function '%%<name>' not found`。 |
| `%%capture [name]` | 运行单元体，并将 stdout/stderr 捕获到 `name`。 |
| `%%timeit` | 对单元体计时。 |
| `%%writefile <path>` | 将单元体写入文件。 |
| `!cmd` / `var = !cmd` | 通过子进程 shell 运行命令；返回带有 `.n` / `.s` 辅助属性的 SList 风格结果。 |
| `var = %name args` | 行魔法命令和 `!cmd` 支持赋值形式。 |

未知魔法命令名称会在单元内引发 `NameError: UsageError: ...`。

## 会话持久化语义 \{#session-persistence-semantics}

`python.kernelMode` 控制保留内核的复用：

- `session`（默认值）
   - 复用内核会话，键由带命名空间的 eval 会话 ID、规范化的 cwd 和解释器组成。
   - 多个所有者可以共享该键对应的同一保留内核。
   - 通过工具发起的前台调用使用独占调度；后台单元和内核定义的工具请求相互独立。
   - 执行前会替换已终止的保留子进程。
   - 如果子进程在执行期间终止，不会重放单元，因为无法确定其是否完成。下一次调用会启动新内核。
- `per-call`
   - 每次调用都启动新子进程。
   - 调用后关闭子进程。
   - 不跨调用保留状态。

### eval 调用之间的状态 \{#state-across-eval-calls}

每次工具调用包含一个单元，在 `session` 模式下，后续调用复用选定的保留内核。在依赖自动转入后台的单元所做的修改之前，先等待该单元完成。同一保留会话键的并发重置会合并；排在重置之后的调用会等待重置完成。

如果单元失败，错误发生前完成的定义和修改可能仍保留在内核内存中。`reset: true` 在该次调用前只重置选定的语言运行时；其他语言运行时不受影响。

宿主在每个单元执行前重新应用会话 cwd，并将其放在 `sys.path` 的首位。`%cd` 或 `os.chdir()` 影响该单元的后续部分，不影响下一次工具调用的起始 cwd。基于文件的 `%load` 还会设置 `__file__`，并将脚本目录加入 `sys.path`。

单元在持久的 asyncio 事件循环上支持顶层 `await`、`async for` 和 `async with`。请使用顶层 `await`，而不是 `asyncio.run()`，后者无法在该线程中启动第二个循环。最后一个非 `None` 表达式会像打印其 `repr` 一样回显，图像和视图行为与 `print` 相同。

## 环境过滤与运行时解析 \{#environment-filtering-and-runtime-resolution}

启动运行器前会过滤环境：

- 允许列表包括 `PATH`、`HOME`、区域设置变量、`VIRTUAL_ENV`、`PYTHONPATH` 等核心变量。
- 允许的前缀：`LC_`、`XDG_`、`PI_`
- 拒绝列表会剔除常见 API 密钥（OpenAI/Anthropic/Gemini 等）。

运行时选择顺序（当 `python.interpreter` 设置指定了明确的可执行文件时，完全跳过此流程）：

1. 活动的/找到的 venv（先 `VIRTUAL_ENV`，然后 `CONDA_PREFIX`，接着 `<cwd>/.venv`、`<cwd>/venv`）
2. 位于 `~/.omp/python-env` 的托管 venv
3. PATH 中的 `python` 或 `python3`

按顺序探测候选项，直到找到可运行的一项；损坏的 venv 不会自动遮蔽后面可用的候选项。选定的可用运行时会按 cwd/解释器键缓存。显式解释器是路径（展开 `~`，相对路径基于会话 cwd 解析），而不是要在 PATH 中搜索的命令名称。

选中 venv 后，其 bin/Scripts 路径会前置到 `PATH`。托管 venv 路径遵循配置的 OMP 数据根目录；默认值为 `~/.omp/python-env`。

运行器还会接收 `PYTHONUNBUFFERED=1` 和 `PYTHONIOENCODING=utf-8`，使流式输出及时到达宿主。

每个单元执行前，会通过 `PI_SESSION_FILE`、`PI_ARTIFACTS_DIR`、`PI_TOOL_BRIDGE_URL`、`PI_TOOL_BRIDGE_TOKEN`、`PI_TOOL_BRIDGE_SESSION` 和 `PI_EVAL_LOCAL_ROOTS` 更新会话/桥接上下文。缺失的托管条目会从 `os.environ` 中移除；不相关的环境修改会保留。

## 工具可用性与模式选择 \{#tool-availability-and-mode-selection}

后端设置 `eval.py` / `eval.js` 默认值为 `true`。可选的布尔环境标志 `PI_PY` 和 `PI_JS` 分别覆盖其对应设置。`eval.tools.enabled` 默认值为 `false`；启用后会加入 `tools` 启动字段和内核定义工具的指导说明。

工具的会话作用域模式只列出已启用的运行时。如果 Python 预检失败，但另一个运行时已启用，`eval` 仍可供该运行时使用，而 `py` 调用会报告 Python 后端可用性错误，并列出已启用的替代运行时。

Python 前置辅助函数包括 `agent(prompt, *, agent=None, label=None, schema=None, schema_mode=None, isolated=None, apply=None, merge=None, tools=None, model=None)`，它会注册后台子代理作业并返回 `AgentHandle`（`.id`、`.handle` = `agent://<id>`、`.status`、`.done()`、`.wait(timeout=None)`、`.send()`、`.cancel()`、`.output()`，可等待）；`model` 是[单次调用模型](./task-agent-discovery.md#per-call-model)：一个经操作员批准的精确 `provider/model-id[@upstream][:level]` 字符串，仅在 `task.perCallModel` 不为 `off` 时接受。`@upstream` 固定聚合器路由，是模型身份的一部分。`completion(...)` 同样返回 `CompletionHandle`（另有 `.attempts`，记录迄今已尝试的回退候选项）。`wait(handles, timeout=None, raise_errors=True)` 按输入顺序对句柄执行屏障等待。`workpool(agent=None, *, name=None, context=None, tools=None, model=None)` 返回 `WorkPool`（`push`、`status`、`peek`、`close`）；其名称是聚合异步作业 ID；结果会自动送达，零参数 `wait` 工具只在没有其他剩余工作时阻塞。`tool.<name>(args)` 是协程（`await tool.read({...})`）；当 `eval.tools.enabled` 启用时，`@tool` 将内核本地函数注册为供子代理使用的工具（模式从类型提示推断）。

运行器在单元请求之外还接受 `{"type": "tool", "id", "op": "describe"|"call", ...}` 请求。该请求由专用守护线程（POSIX；Windows 上则在单元之间）针对内核的 `__omp_tools__` 注册表处理，以 `reply` 帧（`{ok, tools, missing}` 或 `{ok, value}`）回复；工具抛出异常时以 `error` 帧报告，不影响正在运行的单元。面向调用方的约定参见 [eval 工具](./tools/eval.md)。

## 执行流程与取消/超时 \{#execution-flow-and-cancellationtimeout}

### 单元超时 \{#cell-timeout}

`timeout` 的单位为秒，默认值为 30。`0` 禁用单元超时；非零值会被限制在 `1..3600` 秒范围内，并受正值 `tools.maxTimeout` 上限限制，然后传给 `IdleTimeout`。宿主端对 `agent()` / `completion()` 句柄执行 `wait()` 期间，超时计时暂停：这些调用通过 `withBridgeTimeoutPause` 发出带引用计数的暂停/恢复事件，控制返回时开始新的超时窗口。

暂停/恢复事件是暂停计时预算的唯一机制；`%pip` 在 pip 运行期间也会发出这些事件。计算、`stdout`/`stderr`、`log()`/`phase()` 和普通工具调用都计入该预算。工具使用 `AbortSignal.any(...)` 合并调用方、会话和看门狗的中止信号；后端不会设置另一个相互竞争的截止时间。后端可用性发现也受单元解析后的超时值和取消信号约束。

### 自动转入后台 \{#auto-backgrounding}

`eval.autoBackground.enabled`（默认值 `false`）允许单元在经过 `eval.autoBackground.thresholdMs`（默认 60,000 毫秒）后成为托管 eval 作业，或在收到引导消息时提前转入后台。在前台等待期间完成的单元会正常返回。作业管理器达到容量上限时，执行保持在前台。转入后台不会延长或禁用单元看门狗。

### 内核执行取消 \{#kernel-execution-cancellation}

发生中止/超时时：

- 宿主向运行器子进程发送 `kill("SIGINT")`。
- 运行器的执行期信号处理程序在用户代码内引发 `KeyboardInterrupt`。
- 结果包含 `cancelled=true`；内核超时会标注为 `[timed out after <n>s; kernel interrupted, state kept]`，若内核忽略中断，则标注为 `[timed out after <n>s; kernel killed, state gone]`。
- 在请求之间，运行器为 SIGINT 安装 `SIG_IGN`，防止意外的取消信号终止内核。

如果运行器在中断后的 5 秒内未发出 `done`（`INTERRUPT_ESCALATION_MS`，例如卡在持有 GIL 的 C 代码中），宿主会关闭子进程（依次升级为 `exit` → `SIGTERM` → `SIGKILL`），单元会被标注为内核已终止，并在下一次调用时重新创建内核。

### stdin 行为 \{#stdin-behavior}

不支持交互式 stdin：宿主的 NDJSON 控制通道通过运行器原始 stdin 传入，运行器启动时先将其移至私有描述符，再将 fd 0 指向空设备。用户代码中的 `input()` 和 `sys.stdin` 读取会立即遇到 EOF，任何未显式指定 stdin 的进程也是如此，因此它们都无法消耗控制帧。内置 pip 和 shell 魔法命令也会显式传入 `DEVNULL`。

## 输出捕获与渲染 \{#output-capture-and-rendering}

### 捕获的输出类别 \{#captured-output-classes}

来自运行器的帧：

- `stdout` / `stderr` → 纯文本块（模型看到的全部文本）
- `view` → 面向用户的渲染，文本已在流中
- `image` → 提供给模型和用户的图像负载
- `error` → 回溯文本
- `status` → 结构化状态事件

### 富内容打印 \{#rich-print}

运行器替换了 `builtins.print`。向单元 stdout 打印时，会对每个参数分类；任何其他 `file`（例如 `sys.stderr` 或重定向的 `sys.stdout`）都使用原生 `print`。末尾表达式回显会对 `repr(value)` 应用相同分类。

| 值 | 输出中的文本 | 额外帧 |
| --- | --- | --- |
| `{"type": "image", "mimeType", "data": str\|bytes, "detail"?, "url"?, "providerFile"?}` | `<image MIME>` | `image` |
| matplotlib `Figure`（PNG，`bbox_inches="tight"`）、`PIL.Image.Image`、带有 `_repr_png_` / `_repr_jpeg_` 的对象 | `str` / `repr` | `image` |
| 带有 `_repr_markdown_` 的对象（非类） | Markdown 源文本 | `markdown` 视图 |
| pandas `DataFrame` / `Series`、polars `DataFrame` / `Series` | `str` / `repr` | `table` 视图 |
| 文本超过 80 个字符或跨行的 `dict` / `list` / `tuple` | `str` / `repr` | `json` 视图 |

- 表格视图遵循库自身的截断设置（`display.max_rows` / `min_rows` / `max_columns`，包括 pandas 的终端宽度适配；polars 的 `tbl_rows` / `tbl_cols`），因此视图显示的行列与文本一致。省略的行列会变成 `…` 单元格。索引层级作为前置列；MultiIndex 列标签用 `/` 连接。列根据 dtype 标记为 `numeric`（bool 不属于数值类型）。pandas 和 polars 通过 `sys.modules` 检测，绝不导入。
- JSON 视图将超出 ±2^53 的整数转为十进制字符串，将其他非 JSON 叶值转为 `str()`。自定义文本表示的子类（namedtuple、`OrderedDict`）不会生成视图。
- 探测抛出异常不会中断打印；值仍以文本形式打印。

### Matplotlib \{#matplotlib}

运行器将 `MPLBACKEND=Agg` 设为环境默认值，使图形在离屏环境中渲染。每个单元结束后，剩余图形会作为 PNG `image` 帧发出（不含文本）并关闭。该单元中已打印或回显的图形会关闭，不重复发送图像。

### 存储与截断 \{#storage-and-truncation}

输出通过 `packages/coding-agent/src/tools/streaming-output.ts` 中的 `OutputSink` 流式传输。默认内联正文预算为 50 KiB，由保留的头部和尾部共享，中间部分省略，并对每行施加字节上限（`tools.outputMaxColumns`）。完整的净化后文本可转存到无大小上限的产物中。持久化成功时，工具结果包含截断元数据和 `local://<id>.log`；产物 I/O 失败会单独报告，且不会提供该 ID。

### 渲染器行为 \{#renderer-behavior}

- 工具渲染器（`packages/coding-agent/src/ui/tools/eval.tsx`）：
   - 显示代码单元块及每个单元的状态
   - 折叠预览默认显示 10 行
   - 支持展开模式，显示工具结果中保留的全部输出
- 交互式渲染器（`eval-execution.ts`）：
   - 用于 TUI 中由用户触发的 Python 执行
   - 折叠预览默认显示 20 行
   - 为保证显示安全，将过长的单行限制为 4000 个可见列
   - 显示取消/错误/截断通知

## 运行故障排查 \{#operational-troubleshooting}

- **Python 后端不可用**：检查 `eval.py`、`PI_PY`，以及 `python`/`python3` 是否位于 PATH 中。如果启用了其他后端，使用其声明的语言标记。
- **没有可用的 Python**：安装现代 Python 3 解释器，配置 `python.interpreter`，或在托管 Python 路径（默认 `~/.omp/python-env`）放置兼容的 venv。`omp setup python --check` 会报告解析出的解释器。
- **执行挂起后超时**：对正常工作增大 `timeout`，或将其设为 `0` 以禁用看门狗。对于卡住的原生代码，取消时先发送 `SIGINT`，再逐步升级；在会话模式下，如果内核被强制终止，则会在下一次请求时重新创建。
- **长会话期间内存增长**：在 `session` 模式下，顶层 Python 值保留在子进程中。输出截断和影子快照限制不会约束其实际内存，也没有自动内存限制或警告。使用 `%whos` 检查保留的名称，用 `del name` 删除不再需要的值。要释放解释器内存，请保存所需状态，等待活动单元完成，然后发起带 `reset: true` 的新 eval 调用（例如 `{"language":"py","code":"print('ready')","reset":true}`）。重置会丢弃用户定义的 Python 全局变量，并可能中断共享该内核的其他工作。
- **Python 代码中的 stdin/input 提示**：不支持 `input()`；请以编程方式传入数据。
- **工作目录错误**：Python 在每个单元开始时使用会话 cwd。需要时在单元内使用 `%cd` 或 `os.chdir()`；下一次调用会重新从宿主会话 cwd 开始。

## 相关环境变量 \{#relevant-environment-variables}

- `PI_PY` / `PI_JS`：按后端覆盖其是否对外提供
- `PI_PYTHON_SKIP_CHECK=1`：跳过 Python 预检/预热检查
- `PI_PYTHON_INTEGRATION=1`：启用受开关控制、会启动真实 Python 的集成测试
- `PI_PYTHON_IPC_TRACE=1`：记录与运行器子进程交换的 NDJSON 帧
