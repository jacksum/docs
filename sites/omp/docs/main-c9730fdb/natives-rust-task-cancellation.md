---
title: "原生 Rust 任务执行与取消 (omp-natives)"
description: "Oh My Pi 官方仓库文档：原生 Rust 任务执行与取消 (omp-natives)。"
---

# 原生 Rust 任务执行与取消 (`omp-natives`) \{#native-rust-task-execution-and-cancellation-omp-natives}

本文介绍 `crates/natives` 如何调度原生工作，以及取消如何从 JS 选项 (`timeoutMs`、`AbortSignal`) 传递到 Rust 执行过程。

## 实现文件 \{#implementation-files}

- `crates/natives/src/task.rs`
- `crates/shell/src/cancel.rs`
- `crates/shell/src/shell.rs`
- `crates/natives/src/vcs.rs`
- `crates/natives/src/grep.rs`
- `crates/natives/src/glob.rs`
- `crates/natives/src/fd.rs`
- `crates/natives/src/ast.rs`
- `crates/natives/src/workspace.rs`
- `crates/natives/src/shell.rs`
- `crates/natives/src/pty.rs`
- `crates/natives/src/html.rs`
- `crates/natives/src/sixel.rs`
- `crates/natives/src/clipboard.rs`
- `crates/natives/src/text.rs`
- `crates/natives/src/ps.rs`

## 核心原语 (`task.rs`) \{#core-primitives-taskrs}

`task.rs` 定义了：

1. `task::blocking(tag, cancel_token, work)`
   - 封装 `napi::AsyncTask` / `Task`。
   - `compute()` 在 libuv 工作线程上运行。
   - 为导出函数返回 JS `Promise<T>`。
   - 通过 `profile_region(tag)` 记录性能分析样本。
   - 在 N-API 异步工作 FFI 边界捕获工作线程 panic，并以 ``native task `<tag>` panicked: <message>`` 拒绝。
   - 在 JS 线程上兑现之前，再次检查显式中止标志状态。工作线程完成后发生的中止会以 `AbortError` 拒绝；如果截止时间是在 JS 忙于结算已完成结果期间才到期，则不会使该结果失效。

2. `task::future(env, tag, work)`
   - 封装 `env.spawn_future(...)`。
   - 在 Tokio 运行时上运行异步工作。
   - 返回 `PromiseRaw<'env, T>`。
   - 通过 `profile_region(tag)` 记录性能分析样本。

3. `CancelToken` / `AbortToken` / `AbortReason`
   - `CancelToken::new(timeout_ms, signal)` 封装共享的 `omp_shell::cancel::CancelToken`，添加可选的 JS `AbortSignal` 桥接。已中止的信号会立即设置标志；无效的可选信号值会被容忍，而不是拒绝操作。
   - `CancelToken::heartbeat()` 为阻塞循环提供协作式取消。
   - `CancelToken::wait()` 异步等待信号或超时。
   - 当共享标志已存在时，`CancelToken::abort_token()` 返回由该标志支持的中止句柄；没有标志时，该句柄不起作用。`emplace_abort_token()` 延迟安装标志并返回有效句柄。`CancelToken::new` 使用后者将 JS `AbortSignal` 桥接到 `AbortReason::Signal`。
   - `CancelToken::aborted()` 提供非阻塞的信号/截止时间检查。`abort_reason()` 只检查显式标志，不包括截止时间；`into_core()` 将令牌转交给 `omp-shell`。
   - `AbortToken::abort(reason)` 允许外部代码请求中止。原因包括 `Unknown`、`Timeout`、`Signal` 和 `User`。

4. `task::blocking_mapped(tag, cancel_token, reject_hook, cancel_hook, work)`
   - 使用与 `blocking` 相同的 libuv 执行/性能分析和 panic 防护。
   - 在 JS 线程上通过 `reject_hook(env, error)` 将带类型的领域失败转换为信息丰富的 JS 错误。
   - 对于在结果结算时发现的显式取消，使用 `cancel_hook(env, reason)`。原生 VCS 导出使用此路径。

## `blocking` 与 `future`：执行模型与选择 \{#blocking-vs-future-execution-model-and-selection}

### 使用 `task::blocking` \{#use-taskblocking}

适用于 CPU 密集型工作，或本质上属于同步/阻塞的工作：

- 内存中的 ast-grep 匹配 (`astMatch`，使用 `CancelToken::cancellation()`)
- HTML 转换
- 剪贴板图像读取

行为：

- 工作闭包接收克隆的 `CancelToken`。
- 计算期间，取消是协作式的：工作代码必须检查 `ct.heartbeat()?`。结果结算还会检查显式中止标志，但无法提前停止不配合的工作。
- 闭包的 `Err(...)` 会拒绝 JS promise。
- 当拒绝需要领域特定的 JS 错误对象、代码或属性时，适合使用 `blocking_mapped`。

### 使用 `task::future` \{#use-taskfuture}

适用于工作必须 `await` 异步操作的情况：

- shell 会话编排 (`Shell.run`、`executeShell`)
- PTY 在进入 `spawn_blocking` 之前的外层 promise (`PtySession.start`)
- 必须桥接完成与取消的异步任务编排

行为：

- future 代码可以让正常完成与 `ct.wait()` 竞速。
- 在取消路径中，异步实现通常会取消下属机制，并可能在宽限超时后强制中止。

## JS API ↔ Rust 导出映射（与任务/取消相关） \{#js-api--rust-export-mapping-taskcancel-relevant}

| 面向 JS 的 API | Rust 导出 | 调度器 | 取消接入 |
| --- | --- | --- | --- |
| `grep(options, onMatch?)` | `grep` | `task::filesystem_future(env, "grep", ct, ...)` | `CancelToken::new(options.timeoutMs, options.signal)`；中止时丢弃工作 future |
| `glob(options, onMatch?)` | `glob` | `task::filesystem_future(env, "glob", ct, ...)` | `CancelToken::new(...)`；中止时丢弃工作 future |
| `fuzzyFind(options)` | `fuzzy_find` | `task::filesystem_future(env, "fuzzy_find", ct, ...)` | `CancelToken::new(...)`；中止时丢弃工作 future |
| `astGrep(options)` / `astEdit(options)` | ast 导出 | `task::filesystem_future(env, tag, ct, ...)` | `CancelToken::new(...)`；中止时丢弃工作 future |
| `astMatch(options)` | `ast_match` | `task::blocking(...)`（内存中的 `find_source`） | 将 `CancelToken::cancellation()` 传给 `find_source` |
| `listWorkspace(options)` | `list_workspace` | `task::filesystem_future(env, "listWorkspace", ct, ...)` | `CancelToken::new(options.timeoutMs, options.signal)`；中止时丢弃工作 future |
| `Shell#run(options, onChunk?)` | `Shell::run` | `task::future(env, "shell.run", ...)` | JS `CancelToken` 转换为 `omp_shell::cancel::CancelToken`；shell 让它与命令完成及后代进程清理竞速 |
| `executeShell(options, onChunk?)` | `execute_shell` | `task::future(env, "shell.execute", ...)` | 相同的取消竞速与 2 秒宽限窗口（Windows 上为 5 秒） |
| `Process#terminate(options?)` | `Process::terminate` | `task::future(env, "process.terminate", ...)` | 可选信号取消终止等待；宽限与强制终止超时属于进程策略，而非 `CancelToken` 截止时间 |
| `Process#waitForExit(options?)` | `Process::wait_for_exit` | `task::future(env, "process.wait_for_exit", ...)` | 可选信号通过 `CancelToken` 桥接；`timeoutMs` 是等待操作以带类型的 `false` 表示的超时 |
| `PtySession#start(...)` / `startArgv(...)` | PTY 方法 | `task::future(env, "pty.start", ...)` + 内层 `spawn_blocking` | PTY 分配/生成之前的心跳检查会拒绝；运行循环中的检查会产生取消标志 |
| `htmlToMarkdown(html, options?)` | `html_to_markdown` | `task::blocking("html_to_markdown", (), ...)` | 无（`()` 令牌） |
| `encodeSixel(...)` | `encode_sixel` | 同步原生函数 | 无 |
| `readImageFromClipboard()` | `read_image_from_clipboard` | `task::blocking("clipboard.read_image", (), ...)` | 无（`()` 令牌） |

`text.rs`、`tokens.rs`、`keys.rs`、大多数同步 `ps.rs` 函数、SIXEL 编码/解码及同步实用导出不使用 `task::blocking`/`task::future` 取消。异步的 `Process.terminate()` 和 `Process.waitForExit()` 方法则会使用。其他阻塞转换，如 `rasterizeSvg`、`pdfToMarkdown`、`renderSnapcompactPng` 和 `deviceCheckGenerateToken`，使用被动的 `()` 令牌，不公开超时/信号选项。

## 取消生命周期与状态转换 \{#cancellation-lifecycle-and-state-transitions}

### `CancelToken` 生命周期 \{#canceltoken-lifecycle}

```text
Created
  ├─ no signal + no timeout  -> passive token
  ├─ signal registered        -> AbortSignal callback can set AbortReason::Signal
  └─ deadline set             -> timeout check becomes active

Running
  ├─ heartbeat()/wait() sees signal   -> AbortReason::Signal
  ├─ heartbeat()/wait() sees deadline -> AbortReason::Timeout
  └─ no abort                         -> continue

Aborted
  └─ shared flag wakes waiters; a later abort call can replace the stored reason, while a deadline is evaluated independently
```

### 启动前与执行中取消 \{#before-start-vs-mid-execution-cancellation}

- **启动前 / 首次取消检查之前**：
   - 使用 `ct.wait()` 竞速的 `task::future` 用户可以在进入 `select!` 后兑现取消。
   - `task::blocking` 用户在闭包心跳检查处观察取消，并在 JS 结果结算期间再次检查显式标志。辅助函数本身不会插入计算前心跳。
   - PTY 在 `openpty` 前和生成前的检查会拒绝设置过程，而不是返回命令取消结果。

- **执行中**：
   - `blocking`：下一次 `heartbeat()` 返回 `Err("Aborted: ...")`。
   - `future`：`ct.wait()` 分支赢得 `select!`，随后代码取消下属异步机制。
   - shell：取消会触发 Tokio 取消令牌，并针对每次运行的生成注册表发送多轮 TERM/KILL，等待命令任务最多 2 秒（Windows 上为 5 秒），然后在需要时中止任务。清理范围限定于该次运行，而不是进程全局的后代进程快照。
   - PTY：心跳失败或 `kill()` 会终止 PTY 子进程/目标进程，并短暂排空输出。

## 长时间运行循环的取消要求 \{#cancellation-expectations-for-long-running-loops}

当工作集合无界或很大时，同步循环 (`task::blocking`、PTY) 必须以可预测的频率调用 `heartbeat()`。异步文件系统工作不需要心跳：丢弃 future 即可取消。

观察到的模式：

- `grep`、`glob`、`fuzzyFind`、`listWorkspace`、`astGrep` 和 `astEdit` 通过 `task::filesystem_future(env, tag, ct, fs, work)` 运行。中止/超时时，会丢弃工作 future，并使用与 `task::filesystem` 相同的拒绝字符串。`omp-xfs` 没有自己的运行时：它的 future 使用 `tokio::spawn` 在当前运行时上生成任务，丢弃 future 会设置停止标志（drop guard）来停止这些任务。`walk::Tree` 为每个条目消耗 tokio 的协作预算 (`tokio::task::coop::consume_budget`)，因此参与竞速的串行遍历也能取消。
- `grep` 通过有界的 `tokio::sync::mpsc::Sender<Vec<Match>>` 流式传输批次。`onMatches` 转发器等待每次 JS 调用 (`call_async_catch`)，并将排队批次合并至最多 1024 个匹配项；容量为 4 个批次的通道提供端到端背压。
- `astMatch`（内存中的 `find_source`）仍使用 `task::blocking` 和 `CancelToken::cancellation()`。
- `run_pty_sync` 在每个循环节拍检查，等待间隔最长为 16ms。

实用规则：遍历外部规模输入的同步循环，不应在没有心跳的情况下超过一个较短且有界的时间间隔；异步循环必须持续等待（或消耗协作预算），使丢弃 future 能够生效。

## 失败行为与向 JS 传播错误 \{#failure-behavior-and-error-propagation-to-js}

### 阻塞任务 \{#blocking-tasks}

错误路径：

1. 闭包返回 `Err(napi::Error)`（包括 `heartbeat()` 中止）。
2. `Task::compute()` 返回 `Err`。
3. `AsyncTask` 拒绝 JS promise。

如果显式中止标志在 `resolve()` 运行前被设置，成功的工作线程结果仍可能遭到拒绝。该路径使用 `AbortError` / `Status::Cancelled`；结算时不检查单纯的截止时间到期。`blocking_mapped` 会应用其领域和取消钩子，而不是通用拒绝。

典型错误字符串：

- `Aborted: Timeout`
- `Aborted: Signal`
- 领域错误（`Conversion error: ...` 等）和捕获的工作线程 panic 错误

### Future 任务 \{#future-tasks}

错误路径：

1. 异步体返回 `Err(napi::Error)`，或 join 失败被映射 (`... task failed: {err}`)。
2. 由 `task::future` 生成的 promise 被拒绝。
3. shell 取消会兑现结构化结果，省略 `exitCode`，并设置 `cancelled` 或 `timedOut`。运行中的 PTY 取消也会兑现标志，但可能保留已观察到的子进程退出码；PTY 设置阶段的取消则会拒绝。

### 取消报告的两种方式 \{#cancellation-reporting-split}

- **将中止作为错误**：使用 `heartbeat()?` 的阻塞导出。
- **将中止作为带类型的结果**：shell 命令 API 和 PTY 运行循环在结果结构体中表示取消；PTY 生成前检查仍然是错误。

为每个 API 选择一种模型，并在文档中明确说明。

## 常见陷阱 \{#common-pitfalls}

1. **阻塞循环缺少心跳**
   - 现象：超时/信号似乎在循环结束前一直被忽略。
   - 修复：在循环顶部及昂贵的逐项步骤之前添加 `ct.heartbeat()?`。

2. **长时间不可取消的区段**
   - 现象：单次大型调用（解码、排序、压缩、解析器调用等）期间，取消延迟骤增。
   - 修复：将工作拆成以心跳为边界的块；如果无法拆分，则记录延迟。

3. **阻塞异步执行器**
   - 现象：同步密集型代码直接在 future 中运行时，异步 API 停滞。
   - 修复：将 CPU/同步代码块移到 `task::blocking` 或 `tokio::task::spawn_blocking`。

4. **取消语义不一致**
   - 现象：一个 API 在取消时拒绝，另一个则兑现带标志的结果，使调用方困惑。
   - 修复：按领域统一，并保持文档一致。

5. **嵌套异步任务中忘记桥接取消**
   - 现象：外层令牌已取消，但内层读取器/子进程任务仍在运行。
   - 修复：将取消桥接到内层令牌/信号，并实施宽限超时 + 强制中止后备方案。

## 新增可取消导出的检查清单 \{#checklist-for-new-cancellable-exports}

1. 正确分类工作：
   - CPU 密集型或同步阻塞 -> `task::blocking`。
   - 异步 I/O / `await` 编排 -> `task::future`。
   - 基于 `omp_vfs::Fs` 的异步文件系统工作 -> `task::filesystem_future`（中止/超时会丢弃 future）。

2. 按需公开取消输入：
   - 在 `#[napi(object)]` 选项中包含 `timeoutMs` 和 `signal`，
   - 创建 `let ct = task::CancelToken::new(timeout_ms, signal);`。

3. 将取消贯穿所有层：
   - 阻塞循环：以稳定间隔调用 `ct.heartbeat()?`，
   - 异步编排：与 `ct.wait()` 竞速，并取消子任务/令牌。

4. 确定取消契约：
   - 以中止错误拒绝 promise，或
   - 兑现带类型的 `{ cancelled, timedOut, ... }`，
   - 在整个 API 家族中保持此契约一致。

5. 传播带上下文的失败：
   - 通过 `Error::from_reason(format!("...: {err}"))` 映射错误，
   - 包含阶段特定前缀（`spawn`、`decode`、`wait` 等）。

6. 处理启动前和运行中的取消：
   - 取消检查/等待必须发生在昂贵的主体之前及长时间执行期间。

7. 验证没有误用执行器：
   - 不在异步 future 内直接运行未经 `spawn_blocking`/阻塞任务封装的长时间同步工作。
