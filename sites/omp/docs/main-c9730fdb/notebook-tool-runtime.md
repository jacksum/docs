---
title: "Notebook 文件运行时内部机制"
description: "Oh My Pi 官方仓库文档：Notebook 文件运行时内部机制。"
---

# Notebook 文件运行时内部机制 \{#notebook-file-runtime-internals}

本文介绍 `coding-agent` 当前对 `.ipynb` 的处理方式，以及它与基于内核的 Python 运行时的关系。

关键区别是：**notebook 支持指文件转换/编辑，而非 notebook 执行**。`.ipynb` 文件通过 `read` 和编辑流水线呈现为带单元标记的可编辑文本；没有 notebook 专用工具会启动 Python 内核或与之通信。

## 实现文件 \{#implementation-files}

- [`crates/edit/src/notebook.rs`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/edit/src/notebook.rs)
- [`crates/edit/src/files.rs`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/edit/src/files.rs)
- [`src/tools/read.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/read.ts)
- [`src/tools/eval.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/eval.ts)
- [`src/eval/py/executor.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/eval/py/executor.ts)
- [`src/eval/py/kernel.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/eval/py/kernel.ts)
- [`src/eval/kernel-session-registry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/eval/kernel-session-registry.ts)
- [`src/eval/executor-base.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/eval/executor-base.ts)
- [`packages/coding-agent/src/tools/streaming-output.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tools/streaming-output.ts)

## 1) 运行时边界：编辑与执行 \{#1-runtime-boundary-editing-vs-executing}

## `.ipynb` 文件转换（`crates/edit/src/notebook.rs`） \{#ipynb-file-conversion-crateseditsrcnotebookrs}

- 除非选择器为 `:raw`，否则 `read` 会将 `.ipynb` 文件视为 notebook。
- 默认 notebook 视图是带有标记的可编辑文本：
   - `# %% [code] cell:N`
   - `# %% [markdown] cell:N`
   - `# %% [raw] cell:N`
- 行选择器和多范围选择器作用于该虚拟文本。
- 编辑流水线通过 `serialize_edited_notebook_text(...)` 将虚拟文本往返转换回 notebook JSON。
- 当标记引用现有且未使用的 `cell:N` 时，会保留已有 notebook 元数据；新单元获得新的空元数据。
- 向序列化器传入不存在的 notebook 时，会从空的 nbformat 4.5 notebook 开始。
- 独立的 `write` 工具不识别 notebook：它会替换文件内容，而不是转换单元标记。只能向它提供有效的 notebook JSON，而非虚拟标记表示。

该路径中不存在内核生命周期：

- 没有内核会话 ID
- 不执行代码
- 没有来自 Python 的流式块
- 不捕获图像或视图
- 没有执行产生的输出产物流水线

## 基于内核的执行路径（`src/tools/eval.ts` + `src/eval/py/*`） \{#kernel-backed-execution-path-srctoolsevalts--srcevalpy}

当智能体需要运行具有持久状态和富输出（图像、表格/JSON/Markdown 视图）的单元式 Python 代码时，每个单元通过一次带 `language: "py"` 的 **`eval` 工具**调用执行，而不是通过 notebook 文件处理来执行。

Python 子进程生命周期、重置/取消行为、分块流式传输、富内容打印和输出产物截断均在该路径实现。

## 2) Notebook 单元处理语义 \{#2-notebook-cell-handling-semantics}

## 源代码规范化 \{#source-normalization}

Notebook JSON 的 `source` 通过连接源代码数组转换为虚拟文本。将虚拟文本序列化回来时，单元源代码按保留换行符的方式拆分：

- 每个以 `\n` 结尾的行保留为包含换行符的独立源代码条目
- 最后一个不以换行符结尾的行在存储时不会被强制添加尾随换行符
- 空内容变成空的 `source` 数组

这符合 notebook JSON 的惯例，避免后续编辑时意外将行拼接到一起。

### 类标记源代码的转义 \{#marker-like-source-escaping}

本身看起来像单元标记的源代码行，在渲染时会通过增加一个 `%` 来转义（`# %% ...` 变为 `# %%% ...`），在解析时取消转义。已转义的类标记行也以同样方式增加和移除一个额外的 `%`。这可防止在往返编辑时将单元中的字面标记文本误解析为新单元。

## 标记解析与单元保留 \{#marker-parsing-and-cell-preservation}

- 非空表示必须以标记开头；第一个标记之前的文本，包括空行，都会被拒绝。空文本会序列化为没有单元的 notebook。
- 标记必须匹配 `# %% [code|markdown|raw]`，可选带有 `cell:N`。
- 如果 `cell:N` 指向未使用的现有单元，则克隆该单元，更新其 `cell_type` 和 `source`，并保留不相关的字段。
- 现有代码单元的 `execution_count` 和 `outputs` 会保留而非清除，即使源代码发生变化也是如此；缺失或 null 字段会初始化为 `null` 和 `[]`。因此，编辑不会使已存储输出变为最新结果。
- Markdown/raw 单元会移除 `execution_count` 和 `outputs`。
- 如果没有有效且未使用的原始索引，则创建带空元数据的新单元。
- notebook 级元数据、格式字段和不相关的顶层字段会保留，因为序列化会克隆原始文档并只替换 `cells`。

## 错误表现 \{#error-surfaces}

以下情况会抛出硬性错误：

- 读取时 notebook 不存在
- JSON 无效
- `cells` 缺失或不是数组
- 单元对象或单元类型无效
- 可编辑表示无效（例如第一个单元标记之前有文本）

这些错误通过 `read` 和编辑流水线等识别 notebook 的调用方作为普通工具错误呈现。独立的 `write` 路径不解析 notebook JSON。

## 3) 内核会话语义（实际存在的位置） \{#3-kernel-session-semantics-where-they-actually-exist}

内核语义在 `executePython` / `PythonKernel` 中实现，适用于 `eval` 工具的 Python 后端。

## 模式 \{#modes}

`PythonKernelMode`：

- `session`（默认值）
   - 按 `(session id, cwd, interpreter)` 缓存内核
   - 多个所有者可以共享同一键对应的保留内核
   - 前台 eval 工具调用使用独占并发；这不是施加于后台单元或内核定义工具请求的全面锁
   - 执行前会替换已终止的内核
- `per-call`
   - 为请求创建子进程
   - 执行
   - 始终在 `finally` 中关闭子进程

## 重置行为 \{#reset-behavior}

每次 eval 调用都有可选的 `reset` 标志。`reset: true` 会在该次调用执行前重置选定的 Python 会话；不会重置其他已启用的语言运行时。

## 内核终止与重启 \{#kernel-death-and-restart}

在会话模式下：

- 如果执行前保留的子进程已不存活，则替换它
- 如果子进程在执行期间终止，完成情况不确定，单元**不会重放**；下一次调用启动新内核
- 同一会话键的并发重置会合并：等待已经在进行的重置，而不是再启动一个；排在其后的运行会在刚重启的内核上继续

## 4) 环境/会话变量注入 \{#4-environmentsession-variable-injection}

内核启动和每次执行的环境更新可以接收：

- `PI_SESSION_FILE`
- `PI_ARTIFACTS_DIR`
- `PI_TOOL_BRIDGE_URL`
- `PI_TOOL_BRIDGE_TOKEN`
- `PI_TOOL_BRIDGE_SESSION`
- `PI_EVAL_LOCAL_ROOTS`

运行器在每个单元执行前应用请求的 cwd 和托管环境更新，并将 cwd 放在 `sys.path` 首位。单元内的 `%cd` 或 `os.chdir()` 不会覆盖下一次 eval 调用的宿主会话 cwd。更新中省略的托管条目会从 `os.environ` 中移除。

## 5) 流式/分块与富输出处理（基于内核的路径） \{#5-streamingchunk-and-rich-output-handling-kernel-backed-path}

Python 后端使用 NDJSON 子进程运行器。不提供 `display()`：`print` 和末尾表达式回显写入纯文本，运行器为图像、数据框、Markdown 对象和大型结构添加帧（参见 [Python 后端：富内容打印](./python-repl.md#rich-print)）。宿主按次执行处理帧：

- `stdout` / `stderr` -> 传给 `onChunk` 的文本块；这些文本是模型看到的全部文本
- `view` -> `onDisplay({type: "view", text, view})`，对已经通过 `stdout` 流式传输的文本进行表格/JSON/Markdown 渲染，向用户显示以替代该文本
- `image` -> 面向模型和用户的 `onDisplay` 图像输出（带 `detail` / `url` / `providerFile` 元数据）
- `status` -> 供 TUI 状态渲染器使用的 `onDisplay({type: "status", event})`
- `reply` -> 工具请求封装，作为 `KernelExecuteResult.reply` 返回
- `error` -> 回溯文本和结构化错误元数据
- `done` -> 最终状态、执行计数、取消状态

取消/超时：

- 中止/超时会向运行器发送 `SIGINT`
- 如果运行器在中断宽限窗口后仍未结束，关闭流程会升级，并在下一次调用时重新创建内核
- 超时输出会附加超时消息

## 6) 截断与产物行为 \{#6-truncation-and-artifact-behavior}

内核执行路径使用 `packages/coding-agent/src/tools/streaming-output.ts` 中的 `OutputSink`：

- 净化每个块
- 跟踪总计/输出的行数和字节数
- 可选择将完整输出转存到产物文件
- 在一个内联字节预算内（默认 50 KiB）保留 UTF-8 安全的头部/尾部视图，启用头部保留时省略中间部分
- 使用 `tools.outputMaxColumns` 限制单行，同时在产物中保留未受上限限制的净化后文本
- 单独报告产物 I/O 失败；如果完整捕获失败，则不提供产物 ID

`eval` 将此元数据转换为结果截断通知和 TUI 警告。

Notebook 文件转换**不**使用 `OutputSink`；它不执行代码，因此没有流式/产物截断流水线。

## 7) 渲染器假设与格式 \{#7-renderer-assumptions-and-formatting}

## 读取/编辑 notebook 表示 \{#readedit-notebook-representation}

Notebook 文件以文本形式呈现给模型。可见的单元标记是可编辑表示的一部分，不是序列化时会被忽略的注释。

## Python 渲染器（用于实际执行输出） \{#python-renderer-for-actual-execution-output}

基于内核的执行渲染预期接收：

- 每个单元的状态转换（`pending` / `running` / `complete` / `error`）
- 可选的结构化状态事件
- 可选的 JSON 输出树
- 图像输出
- 截断警告 + 可选的 `local://<id>.log` 指针

除了两者都复用共享 TUI 基础组件外，此渲染器行为与 notebook JSON 编辑无关。

## 8) 实用工作流程 \{#8-practical-workflow}

如果工作流程同时需要修改 notebook 和执行：

1. 在默认可编辑视图中读取 `.ipynb` 文件，并使用编辑流水线修改该视图
2. 将所需的一个单元源代码复制到带 `language: "py"` 的 `eval` 调用中
3. 对后续单元重复操作；会话模式的 Python 状态跨调用保留
4. 通过编辑流水线应用后续源代码变更；整文件 `write` 必须包含 notebook JSON

当前实现没有提供既修改 `.ipynb`，又通过内核上下文执行 notebook 单元的单一工具。
