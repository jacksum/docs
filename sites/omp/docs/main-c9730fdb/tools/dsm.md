---
title: "dsm"
description: "Oh My Pi 官方仓库文档：dsm。"
---

# dsm \{#dsm}

> 从 eval 打开、检查、编辑二进制分析数据库，并对其编写脚本（通过 idalib 使用 IDA Pro，通过 PyGhidra 使用 Ghidra，或通过 Python API 使用 Binary Ninja）。数据库由 omp 守护进程托管，并由所有 omp 进程共享。

`dsm` 是 eval 的前导命名空间，而不是独立工具：它作为全局对象存在于 JavaScript 和 Python 单元中，面向模型的文档位于 `help://eval/dsm`。不存在 `ida`、`ghidra` 或 `binja` 工具或命令。

## 源码 \{#source}

- eval 前导定义（宿主侧、操作派发、审批、引用所有权）：`packages/coding-agent/src/disasm/prelude-definition.ts`
- 内核侧外观对象：`packages/coding-agent/src/disasm/prelude.js`、`packages/coding-agent/src/disasm/prelude.py`
- 面向模型的文档：`packages/coding-agent/src/prompts/tools/dsm.md`（`help://eval/dsm`）、`packages/coding-agent/src/prompts/tools/dsm-guidance.md`（系统提示指导）
- 关键协作组件：
   - `packages/coding-agent/src/disasm/settings.ts`：`disassembler.backend`、`disassembler.maxOpen`、`disassembler.idleCloseSec`
   - `packages/coding-agent/src/disasm/active.ts`：`cfgDisasmBackend`，解析实际生效的后端（或无后端）
   - `packages/coding-agent/src/disasm/backend.ts`：各后端契约（`DISASM_BACKENDS`）：存储目录、数据库命名、工作进程脚本、中断机制
   - `packages/coding-agent/src/disasm/store.ts`：可执行文件探测、通用 Mach-O 切片选择、数据库位置
   - `packages/coding-agent/src/disasm/metadata.ts`：供不带选择器的 `read` 使用的磁盘上 Mach-O/ELF/PE 元数据
   - `packages/coding-agent/src/disasm/client.ts`：omp 侧访问，打开/附加守护进程单元，转发 NDJSON 请求
   - `packages/coding-agent/src/daemon/modules/disasm.ts`：`disasm` 守护进程模块，每个打开的数据库一个单元、引用租约、LRU 驱逐、空闲关闭
   - `packages/coding-agent/src/disasm/supervisor.ts`：`DisasmWorker`，后端 Python 工作进程、请求队列、中断、自动保存
   - `packages/coding-agent/src/ida/`：IDA 安装检测、解释器发现、`ida.python` / `ida.installDir`、`worker.py`
   - `packages/coding-agent/src/ghidra/`：Ghidra/JDK/PyGhidra 发现与准备、`ghidra.installDir` / `ghidra.python`、`worker.py`
   - `packages/coding-agent/src/binja/`：Binary Ninja 安装检测、解释器发现、`binja.installDir` / `binja.python`、`worker.py`
   - `packages/coding-agent/src/tools/read-binary.ts`：`read` 元数据和显式分析视图
   - `packages/coding-agent/src/tools/tool-timeouts.ts`：`dsm` exec 超时限制

## 可用性 \{#availability}

- `disassembler.backend`（默认 `auto`，以及 `ida`、`ghidra`、`binja`、`none`）选择后端。`cfgDisasmBackend` 对其进行解析：
   - `auto`：找到附带 idalib 的安装时使用 IDA，否则在宿主受支持时使用 Ghidra，否则无后端。绝不选择 Binary Ninja：存在安装并不能说明其许可证是否允许无头使用。
   - `ida`：找到安装时才使用 IDA；否则无后端。
   - `ghidra`：宿主受支持时使用 Ghidra（macOS/Linux x64/arm64、Windows x64）；否则无后端。
   - `binja`：找到安装时才使用 Binary Ninja；否则无后端。需主动选择：`auto` 不会选择它。
   - `none`：禁用分析。
- 解析出后端后，`sdk.ts` 会将 `dsm` 前导内容添加到 eval（仅在 `eval` 工具处于启用状态时）。无后端时，`dsm` 不存在，`read` 分析选择器失败，而不带选择器的可执行文件读取仍返回元数据。
- IDA 安装查找：设置了 `ida.installDir` 时使用它（具有权威性），否则依次查找 `$IDADIR`、`ida-config.json` 中的 `Paths.ida-install-dir`、标准安装位置。`ida.python` 覆盖解释器，该解释器须能导入 `ida_domain` 和 `idapro`。
- Ghidra 安装查找：`ghidra.installDir`（Ghidra 12+），其次是 `$GHIDRA_INSTALL_DIR`，再其次是 Homebrew 前缀，最后是在 omp 数据目录下托管下载的 Ghidra 12.2。JDK 25+ 来自 `JAVA_HOME` 或托管下载的 Temurin JDK 25。`ghidra.python` 覆盖解释器（须能导入 `pyghidra`）；否则使用安装附带的 wheel 构建托管 venv。准备工作按需进行：在首次分析时发生，绝不会在不带选择器的读取时发生。
- Binary Ninja 安装查找：设置了 `binja.installDir` 时使用它（具有权威性；核心库目录或 macOS `.app` 包），否则依次查找 `$BN_INSTALL_DIR`、Binary Ninja 用户文件夹中的 `lastrun` 文件、默认安装位置。`binja.python` 覆盖解释器；否则使用第一个能从安装的 API 目录导入 `binaryninja` 的 Python 3。无头使用需要允许此用途的许可证。`BN_LICENSE` 绝不会传递给工作进程：它们读取用户文件夹中的 `license.dat`（设置了 `$BN_USER_DIRECTORY` 时使用该目录）。工作进程中禁用用户和仓库插件。
- 审批层级：`list`、`get`、`view` → 读取；`exec` → 执行；所有其他操作 → 写入。

## API \{#api}

每次调用都返回 promise。JavaScript 和 Python 提供相同的方法；Python 使用 `set_type` / `make_function` 和关键字选项。

| 调用 | 描述 |
| --- | --- |
| `dsm.open(path)` | 为可执行文件、`<bin>:@<arch>` 通用切片、现有 IDA `.i64`/`.idb` 或 Binary Ninja `.bndb`，或可移植的 `db.handle()` 字符串打开（或创建）数据库。返回句柄。 |
| `dsm.list()` | 活动后端所有已打开数据库的描述符，带可移植的 `handle` 字符串和实时引用计数。 |
| `dsm.get(id?)` | 附加到已打开的数据库；只有恰好打开一个数据库时，才可以省略 `id`。 |
| `db.view(view = "overview")` | 使用 `read` 后缀语法的渲染视图：`overview`、`<func\|0xaddr>`（伪代码）、`<func>:asm`、`imports`、`exports`、`strings`、`xrefs:<func\|0xaddr>`。 |
| `db.exec(code, { timeout })` | 在后端工作进程中运行 Python。返回 `{ output, value, error }`。 |
| `db.rename(target, name)` | 重命名符号/地址。 |
| `db.comment(target, text, { repeatable })` | 设置注释。 |
| `db.setType(target, decl)` | 应用 C 声明（IDA）或原型/类型表达式（Ghidra、Binary Ninja）。 |
| `db.makeFunction(target)` | 在某地址处创建函数。 |
| `db.save()` | 立即保存。 |
| `db.close({ save = true })` | 释放此句柄的引用；最后一个引用释放时关闭数据库。 |
| `db.handle()` | 绑定到此数据库当前存活实例的可移植字符串，用于传递给子代理。 |

句柄提供 `id`、`backend`、`ref`、`path` 和 `info`。目标接受符号名称、`0x` 字符串或整数地址。保留视图名称优先于同名符号；对于这些符号请使用地址。

## 与 read 集成 \{#read-integration}

- 不带选择器的 `read <binary>`（ELF/PE/Mach-O，包括无扩展名文件）以及不带选择器的 `read <db>.i64`/`.idb`/`.bndb` 只返回磁盘上的元数据。它们绝不会打开数据库或准备后端。页脚列出显式分析选择器，并指向 `help://eval/dsm`，或说明分析已禁用。
- 分析选择器（`bin:overview`、`bin:<func|0xaddr>`、`bin:<func>:asm`、`:imports`、`:exports`、`:strings`、`:xrefs:<func|0xaddr>`）通过与 `dsm.open` 相同的守护进程单元打开数据库。参见 [`read`](./read.md#executables-and-disassembler-databases)。

## 流程 \{#flow}

1. `dsm.open` 解析路径（或解析句柄），定位数据库，并调用 `acquireDatabase`。它附加到键为 `<backend>:<id>` 的运行中 `disasm` 守护进程单元，或请求守护进程启动一个单元，然后等待打开。分析开始后，打开操作无法取消；超出等待时间的打开操作会以 `<Backend> is still analyzing … Retry later` 失败，而进行中的 Ghidra 安装会以 `Ghidra is still being installed (…); it continues in the background. Retry later.` 失败。
2. 每个已打开数据库都是全局作用域的守护进程单元，`omp ps` 将其列为 `omp.ida.<id>` / `omp.ghidra.<id>`，其中托管一个长期运行的 Python 工作进程。所有 omp 进程共享它。
3. 每次 `open` 或 `get` 都获取独立的引用租约。`close()` 只释放该租约；最后一个引用释放时关闭数据库。保留的引用会固定数据库，防止空闲关闭和 LRU 驱逐。
4. 打开数量超过 `disassembler.maxOpen`（默认 4，跨所有后端）时，会驱逐最近最少使用且无引用的空闲数据库。
5. 请求按数据库串行执行。结构化编辑、视图和 `save` 使用 120 秒请求超时；`exec` 默认为 120 秒，由 `clampTimeout("dsm", …)` 限制（先应用正值 `tools.maxTimeout` 上限，再应用 `1..3600`）。超时或中止会中断运行中的请求（Unix 上的 IDA 和 Binary Ninja 使用 SIGINT，Ghidra 和 Windows 上使用中断帧）；5 秒内未响应的工作进程会被终止。

## `exec` 命名空间 \{#exec-namespace}

Python 按数据库持久保存，并在智能体之间共享（不是按句柄）；空闲关闭后重新打开会将其重置。每个后端都会预加载：

- `resolve(t)`、`func(t)`、`name_of(ea)`
- `pseudocode(t)`、`asm(t)` → str
- `xrefs_to(t)`、`xrefs_from(t)` → 字典；`callers(t)`、`callees(t)` → 名称
- `functions(pattern)`、`strings(pattern)`、`imports(pattern)` → 元组；可选的不区分大小写的正则表达式
- `hexdump(t, size=64)`、`read_bytes(t, size)`
- `rename(t, name)`、`comment(t, text, repeatable=False)`、`set_type(t, decl)`、`make_function(t)`

IDA 还预加载 `db`（ida_domain `Database`）、`ida_domain`、`ida_*` 模块、`idautils` 和 `help_ida()`。Ghidra 还预加载 `program` / `currentProgram`、`project`、`flat`、`monitor`、`pyghidra`、`jpype` 和 `help_ghidra()`；其伪代码在反编译器不可用时回退为反汇编。Binary Ninja 还预加载 `bv`（`BinaryView`）、`binaryninja`、`wait_analysis()` 和 `help_binja()`；对于 Binary Ninja 跳过的函数，其伪代码会回退为反汇编，并指出原因。Binary Ninja 的 `exec` 代码通过 `wait_analysis()` 等待分析，绝不使用 `bv.update_analysis_and_wait()`（不可中断）或 `bv.abort_analysis()`（会使打开的数据库分析不足）。

## 副作用 \{#side-effects}

- 可执行文件在智能体目录（`getAgentDir()`）下的托管数据库中分析：IDA 为 `idbs/<sha16>-<name>[.<arch>]/`，Ghidra 为 `ghidra-projects/<sha16>-<name>[.<arch>]/`，Binary Ninja 为 `bndbs/<sha16>-<name>[.<arch>]/`。绝不修改源二进制文件。IDA `.i64`/`.idb` 和 Binary Ninja `.bndb` 文件原地打开；Ghidra 项目路径不原地打开。数据库文件只在其所属后端下打开。
- 通用 Mach-O：只暂存所选切片。默认切片匹配宿主 CPU（否则为第一个）；`:@<arch>` 选择另一个切片。每个切片都有自己的数据库。
- 已修改数据库在空闲约 10 秒后自动保存；`save()` 强制保存。`close()` 默认请求保存；最后一个引用释放时会遵循任何所有者的保存请求，因此只有每个已释放的引用都选择 `save: false` 时，才会丢弃未保存的更改。有序的 `omp ps stop` 会保存；崩溃、强制终止或因工作进程无响应而终止，会丢失自上次保存以来的更改。
- Ghidra 的 `exec` 数据库更改在错误或中断时回滚（Python 变量不会）。IDA 在 `exec` 失败前所做的更改会保留。Binary Ninja 在 `exec` 失败或中断时撤销已记录到撤销记录中的更改；自动级更改（`define_auto_symbol`）和元数据（`bv.store_metadata`）会保留，Python 变量也一样。
- 一次 `exec` 视为可能的编辑：其后执行带保存的关闭，即使代码只读取，也可能重写数据库文件。对须保持字节完全相同的文件完成只读工作后，请使用 `save: false` 关闭。
- 无引用的数据库空闲达到 `disassembler.idleCloseSec`（默认 900，`0` = 永不）后，会被保存并关闭。
- 会话拥有的引用会在会话销毁以及对话或后端更改时保存并释放；可恢复的子代理会保留其引用，直到显式关闭或销毁。

## 错误 \{#errors}

- `dsm is disabled in the current session.` / `Disassembler backend changed; reopen with dsm.open(path or handle).`
- `Not an executable or supported database: <path>`
- `no <arch> slice; available: …`
- `Database reference is closed or expired; reopen with dsm.open(path or handle).`
- `dsm handle has expired; the original database is no longer open. Ask its owner for a live handle.`
- `<Label> database <id> is in use by another process`
- `<Label> worker for <id> exited (<code>)…`：工作进程已退出；参见 `omp ps logs`。
- `<Label> databases require disassembler.backend=<id> with <Label> installed. Read the bare database path for metadata.`：对属于另一个后端的数据库文件使用 `read` 分析选择器（`.i64`/`.idb` → `ida`，`.bndb` → `binja`）。
- `<Label> database <path> cannot be opened with the active <Label> backend; set disassembler.backend to <id>.`：对属于另一个后端的数据库文件使用 `dsm.open`。
