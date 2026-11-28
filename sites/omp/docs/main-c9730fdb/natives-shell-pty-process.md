---
title: "Natives 的 Shell、PTY、进程与按键内部机制"
description: "Oh My Pi 官方仓库文档：Natives 的 Shell、PTY、进程与按键内部机制。"
---

# Natives 的 Shell、PTY、进程与按键内部机制 \{#natives-shell-pty-process-and-key-internals}

本文使用 `docs/natives-architecture.md` 中的架构术语，介绍 `@oh-my-pi/pi-natives` 中的执行、进程和终端原语：`shell`、`pty`、`ps` 和 `keys`。

## 实现文件 \{#implementation-files}

- `crates/natives/src/shell.rs`
- `crates/natives/src/shell/vfs.rs`（宿主注入的文件系统桥接）
- `crates/vfs/`（共享文件系统抽象）
- `crates/shell/src/shell.rs`
- `crates/shell/src/cancel.rs`
- `crates/builtins`（嵌入式 shell 内建命令：bash 内建命令，以及进程内实用程序和进程命令）
- `crates/shell/src/windows.rs`（Windows 专用 PATH 扩充）
- `crates/shell/src/process.rs`
- `crates/natives/src/pty.rs`
- `crates/natives/src/ps.rs`
- `crates/natives/src/keys.rs`
- `crates/natives/src/task.rs`
- `packages/natives/native/index.d.ts`

## 各层职责 \{#layer-ownership}

- **包入口**（`packages/natives/native/index.js`）：加载 `.node` 插件并导出生成的 N-API 绑定。
- **Rust N-API 模块层**（`crates/natives/src/*`）：面向 JS 的 shell、PTY、进程和按键导出，以及回调桥接。
- **运行时核心**（`crates/shell/src/*`）：嵌入式 bash 引擎及其会话执行（`bash`、`sys`、`vfs`、`host`、`session`、`tools`、`extras`）、取消清理、最小化器集成、命令修正和跨平台进程引用。
- **使用方**（`packages/coding-agent`、`packages/tui`）：上层会话策略、输出产物与最小化器处理、渲染策略，以及 UI 按键处理。

## Shell 子系统（`shell`） \{#shell-subsystem-shell}

### API 模型 \{#api-model}

Shell 执行模式：

1. 通过 `executeShell(options, onChunk?)` **单次执行**。
2. 通过 `new Shell(options?)` 创建**持久会话**，然后重复调用 `shell.run(...)`。

两种模式都会通过线程安全回调流式传输合并后的 stdout/stderr 文本，并返回 `{ exitCode?, cancelled, timedOut, minimized?, workingDir? }`。

持久 `Shell` 还提供 `liveBackgroundJobCount()`，它会静默回收已完成的作业，并返回会话跟踪的存活作业数。普通后台作业仍存活时，宿主可以保留每次调用使用的 shell。只有仍在运行外部进程的作业才计数；已退出的作业会在命令之间回收，并保留其状态供后续 `wait` 使用。内建 `nohup <command> &` 是特殊情况：其操作数会脱离，使其在 shell 销毁后仍然存活；这并非系统 `nohup` 二进制程序的行为。

`ShellOptions` 支持 `sessionEnv`、`snapshotPath`、输出 `minimizer` 和 `filesystem`。`ShellExecuteOptions` 还支持 `command`、`cwd`、命令作用域的 `env`、`timeoutMs` 和 `signal`。`ShellRunOptions` 支持 `command`、`cwd`、命令作用域的 `env`、`timeoutMs`、`signal`，以及仅在本次运行生效的 `filesystem` 覆盖。

### 会话创建与环境模型 \{#session-creation-and-environment-model}

Rust 启动一个 `omp_shell::session::Session`（由所提供 Tokio 运行时上的任务驱动的 bash 引擎，位于 `crates/shell/src/session.rs`），并配置：

- 显式重建的环境：先取宿主环境（丢弃非 UTF-8 条目，合并重复的 `PATH`），再应用 `sessionEnv`，两者都经过下述跳过列表；不继承其他任何内容，也不读取 profile 或 rc 文件，
- 引擎文件系统接缝（`omp_shell::vfs::VfsFs`）背后的会话 `filesystem`；`scheme://` 路径对引擎而言是绝对路径，外部程序会收到 URL 参数和工作目录所映射的宿主文件（没有底层宿主文件支持或只读的 URL 工作目录会拒绝外部程序）；在 Windows 上，凡是引擎解析名称的位置（命令名、重定向、`test`、`cd`、`source`），MSYS 驱动器路径（`/c/x`、`/mnt/c/x`）都表示驱动器路径 `C:/x`，与 pi 的实用程序相同，因此单字母根目录表示一个驱动器，
- 引擎的 bash 内建命令（`exec` 从不替换本进程；`suspend` 会拒绝执行），
- pi 的进程内实用程序和进程命令（`lsof`、`pgrep`、`pkill`、`pidwait`、`ps`、`sleep`、`top`），作为来自 `omp_builtins::extras` 的引擎命令（见下一节）；`kill` 是引擎内建命令，会拒绝向本进程、其进程组或其祖先进程发送信号，
- 作为宿主外调的 `timeout`、`nohup`（使其操作数脱离，让它在 shell 销毁后继续存活；设置 `PI_DISABLE_NOHUP_BUILTIN` 时不提供）和可选择启用的 `git`（`crates/shell/src/tools`）；凡是 `git` 层不接管的操作，都会使用原始参数运行 git 二进制程序：
   - `PI_SMART_GIT` 通过 `omp-vcs` 处理受支持的 `git worktree add` 调用：写时复制克隆、工作树注册，以及与目标提交的状态协调；无法克隆时回退到进程内检出。克隆会携带源检出目录中被忽略的文件，包括 `.env` 文件等秘密信息，而不只是构建缓存（参见 `docs/cli-reference.md` 中的“工作树克隆”）；
   - `PI_GIT_GUARD`（由编码智能体根据 `bash.gitGuard` 设置；`crates/shell/src/git/guard.rs`）根据命令所在的检出目录，判断会丢弃或移动工作内容的 git 命令。在可能被其他会话共享的仓库主检出目录中，它会以退出状态 1 拒绝以下操作：除 `list`/`show`/`create` 之外的 `stash`；`reset --hard`；`reset` 到不同于 HEAD 的提交；切换到分支或提交的 `switch` 和 `checkout`；针对路径的 `checkout` 和针对工作树的 `restore`，除非仓库正在进行 merge/rebase/cherry-pick/revert（存在未合并的索引条目或该操作的状态文件；已完成 rebase 遗留的 `REBASE_HEAD` 不算），即便如此，也不允许强制形式或全树形式；启动 `rebase`/`merge`/`pull`/`cherry-pick`/`revert`（只有对应操作正在进行时，才允许 `--continue`/`--abort`/`--quit`，以及受支持时的 `--skip`）；`commit --amend`（试运行形式除外）；以及 `clean`（`-n`/`--dry-run` 除外）。非裸仓库（`core.bare = false`）的链接工作树及其中的子模块可以运行所有操作：会丢弃未提交的已跟踪更改的 `reset`/`checkout`/`switch`/`restore` 形式，会先将这些更改记录为 `refs/omp/discarded` reflog 上的一个 `git stash create` 提交，并在 stderr 上说明（如果通过 `--recurse-submodules` 或 `submodule.recurse` 递归进入子模块，则改为拒绝，因为该记录不包含子模块的更改）；而 `stash pop`/`apply`/`drop`/`branch`/`clear` 会拒绝标题为 `WIP on <branch>:`/`On <branch>:` 且指向其他分支、分离 HEAD 或无分支的 stash 列表条目。它在 git 实际运行的目录中（应用 `cd` 和 `-C` 后）判断展开后的 argv；拒绝 `--git-dir`/`--work-tree`/`GIT_DIR` 风格的重定向，因为其更改的仓库不是从当前目录发现的仓库，
- 针对 shell 敏感变量的跳过列表（`PS1`、`PWD`、`SHLVL`、bash 函数导出等），
- 未导出的 `env="$env"` 回退值，使 PowerShell 风格的 `$env:NAME` 在参数展开后仍保留，除非用户遮蔽了 `env`。

以 URL 为后端的外部进程启动会返回一个拥有所有权的 `SpawnFuture`，由 VM 轮询而不阻塞驱动器。取消待完成的启动会在启动进程之前丢弃其提供方请求。外部 I/O 泵和解码中继是与进程一起轮询的协作式状态机；它们不会为引擎 I/O 挂起线程。共享的进程替换输入源会为每个引擎描述符保留一个 OS 管道，并在最后一个持有者关闭时退回未读字节。独立的 `obash` 驱动器使用相同的可轮询操作，不要求 Tokio 运行时。

会话环境行为：

- `ShellOptions.sessionEnv` / 单次执行的 `sessionEnv` 在会话创建时应用。
- `ShellRunOptions.env` / 单次执行的 `env` 作用域为命令：为命令导出，之后恢复每个具名变量。
- Windows 上对 `PATH` 进行特殊合并，去重时不区分大小写。
- 宿主环境和转发的会话环境省略 Git 仓库位置覆盖（`GIT_DIR`、`GIT_COMMON_DIR`、`GIT_WORK_TREE`、`GIT_INDEX_FILE`、`GIT_OBJECT_DIRECTORY`、`GIT_ALTERNATE_OBJECT_DIRECTORIES`），以便 Git 从 cwd 重新发现仓库。显式的命令作用域 `env` 可以再次提供它们。
- Windows 专用路径扩充（`crates/shell/src/windows.rs`）会追加已发现且尚未包含的 Git-for-Windows 路径。
- 如果存在 `snapshotPath`，会在会话创建期间对其执行 source，此时 stdout/stderr/stdin 连接到空文件。

### 分叉状态（子 shell 与后台作业） \{#forked-state-subshells-and-background-jobs}

子 shell、管道阶段、后台作业、命令替换和进程替换、协进程，以及引擎内嵌套的 `bash`/`sh`，都作为绿线程虚拟进程（`Vproc`）在同一个引擎中运行。每个分叉出的 vproc 都以 `Image`（`crates/shell/src/bash/image.rs`）的形式拥有自己的全局状态：全局变量和所有其他进程记录（函数、别名、选项、陷阱、位置参数、`umask`、目录栈、`hash` 条目、历史记录）。分叉会以 O(1) 的复杂度克隆父进程映像，或通过 `StateStore::snapshot` 克隆根进程映像：`Image` 是持久映射（`crates/shell/src/bash/cow_map.rs`），其克隆共享条目，直到一方写入，类似 `fork(2)` 共享内存页。因此，无论父进程之后如何改变，子进程都会保留分叉时的状态，其自身写入也保持私有。任何映像之外的记录（`Key::forked`）仍留在存储中：所有 vproc 共享的内核状态（vpid 和作业计数器、启动时间、zftp 的共享状态文件），以及根 vproc 自身的字段（cwd、模式、`$?`、`PIPESTATUS`、`$!`、作业表、`getopts` 进度、`ulimit` 值），分叉出的 vproc 将这些字段保存在自身字段中。根 shell 的状态就是存储本身，`MemStore` 将其保存在一个 `Image` 中，因此会话的逐命令状态映像（`Session::latest_image`）也是 O(1) 克隆，`Session::restore` 可以从中启动第二个会话，同时第一个会话继续运行其命令。`Shell::externalize` 将分叉出的 vproc 的映像保存为相对于根映像的更改（`Image::diff`）。

### 宿主注入的文件系统 \{#host-injected-filesystem}

`filesystem` 的结构为 `{ handler: (error: Error | null, request: ShellFsRequest) => Promise<ShellFsResponse>, nativeLocalPaths?: boolean, onFileChange?: (error: Error | null, change: ShellFileChange) => void }`。桥接覆盖 shell 重定向、glob、cwd 更改和进程内实用程序文件操作；路径原样传递，包括绝对 `scheme://` URL。使用 `nativeLocalPaths: true` 时，所有宿主路径都绕过 handler，只有 URL 路径被路由给它；否则 handler 也会收到宿主路径。普通外部程序仍使用 OS 文件系统，而不是此回调接口。

`onFileChange` 以 `{ path, before?, after? }` 报告命令自身更改的宿主文件，包含更改前后的内容（某一侧不存在文件时，省略该侧内容）。它覆盖内建命令的写入、重命名和移除（`sed -i`、`cp`、`mv`、`rm`、`tee`）以及重定向目标，每项都在其命令完成后进行比较：将临时文件重命名到目标位置会被视为目标的一次更改，重定向文件则在通过其写入的程序退出后读取。所启动的程序自行打开的文件不会被报告。只报告 git 会跟踪、大小不超过 4 MiB 的文本文件（位于工作树中、未被忽略且不在 `.git` 内），每个命令最多 1024 个文件、32 MiB，每个文件系统最多 64 MiB；二进制文件和符号链接会被跳过。

请求标识一种操作（`metadata`、`readDir`、`open`、`read`、`write`、`close`、变更操作及其他）；生成的 `ShellFs*` 类型定义完整的传输契约。二进制载荷使用 `Uint8Array`/`Buffer`；定位请求偏移量和其他 `u64` 数值使用 `bigint`，而响应接受精确的 `number | bigint`。文件系统错误返回 `{ error: { code, message? } }`；被拒绝的 promise 或格式错误的响应属于提供方故障。提供方应用其访问策略后，`local`/`localTarget` 响应可以将操作委托给原生宿主路径。

仅本次运行生效的覆盖结束后，会恢复会话文件系统。提供方等待受本次运行的取消作用域约束。成功运行会等待被丢弃的虚拟文件关闭，使写入稳定完成；关闭失败会报告到 stderr，并使原本成功的命令失败。

### 进程内实用程序内建命令（衍生自 uutils） \{#in-process-utility-builtins-uutils-derived}

除了 bash 内建命令，会话还运行 `omp-builtins` crate（`crates/builtins`）实现的进程内命令行实用程序，即基于 `uucore` 0.8.0 自行移植的 uutils coreutils/findutils/sed，以及行为类似 jq 1.8.2 的 `jq`，后者基于纳入仓库并打过 jq 补丁的 jaq crate（`crates/vendor/jaq-*`）构建。这些实用程序包括 `cat`、`head`、`tail`、`wc`、`sort`、`uniq`、`ls`、`find`、`grep`、`mkdir`、`rm`、`mv`、`cp`、`ln`、`sed`、`jq`、`fd`、`diff`、校验和/`tr`/`cut`/`date` 系列等；权威列表为 `omp_builtins::extras::extras()`。

这些实用程序优先于 `PATH` 被查找，因此在 Windows 上，`find`、`sort`、`timeout` 和 `whoami` 会遮蔽 System32 中的同名程序，后者的选项使用 `/X` 开关。以这类程序自身语法编写的命令行会改为交给 `PATH` 中的程序（`Host::defers_to_path`、`crates/shell/src/cmd_dialect.rs`）。语法通过标记判断，即只有一方会使用的 token：cmd 标记是该程序的某个开关（由 `PROGRAM /?` 列出），可以出现在命令行任意位置；GNU 标记是 `-x`、`--x`，或 `find` 的 `(`、`)`、`!`。任何 GNU 标记都会保留 pi 的实用程序；否则，cmd 标记会将该行交给对应程序，除非其操作数多于该程序接受的数量（`timeout 5 sort /t x` 仍使用 pi 的 `timeout`）。判断时从不考虑 GNU 解读是否有效：`find /c` 会遍历整个 `C:`，但仍会交给 `FIND`。因此，`dir | find /c /v ""`、`sort data.txt /r` 和 `timeout /t 5` 会运行 Windows 程序，而 `find /c -name x` 和 `sort -r` 仍使用 pi 的实用程序。当 `PATH` 中没有这类程序时，最终仍运行该实用程序。`type` 仍会报告该实用程序。

有三个搜索相关的内建命令值得特别说明：

- `grep` 基于 ripgrep 库（`grep-regex`/`grep-searcher`）实现，目录遍历和有序并行搜索由 `omp-xfs` 提供（`rg`/`grep` 输出保持路径顺序）。
- `rg` 是采用 ripgrep 默认值（递归搜索、ignore/隐藏文件过滤、二进制抑制）的同级内建命令，它有独立的模块和参数模型，不是 `grep` 的别名。
- `fd` 由 `omp-xfs` 的并行 `walk::ordered` 遍历（过滤器在遍历工作线程上运行；遍历确定匹配后按路径顺序打印，由遍历器将 `.fdignore` 作为额外的忽略文件读取）、`globset` 和 `regex` 提供支持。
- `ast-grep`（也称 `sg`）在 `omp-ast` 搜索引擎上运行 ast-grep 0.50 的 `run` 命令（`-p`/`-r`/`-U`、`--json`、上下文、`--heading`、`--files-with-matches`、`--stdin`），使用 ast-grep 的管道输出（无颜色）；`scan`、`test`、`new`、`lsp`、`outline`、`--config`、`--interactive`、`--kind`、`--debug-query` 和 `--inspect` 会因不受支持而以状态 2 退出。

以本地文件系统为根的遍历（`find`、`fd`、`rg`、`grep -r` 和 `grep`/`glob` 原生模块）会列出根目录下的网络挂载（NFS、SMB、autofs、sshfs 等；从 `crates/xfs/src/fs/mounts.rs` 中的挂载表读取），但不进入其中；要遍历某个挂载，应将该挂载指定为搜索根目录。ovnfs 挂载始终会被遍历。`find` 底层的有序遍历在目录列举较慢（网络文件系统、冷缓存）时，会在阻塞线程池上提前列举后续目录；列举较快时则保持串行。

每个内建命令都在 shell 进程内运行（不使用 `fork`/`exec`），通过 `omp-builtins` 对 shell 的 `Host` 视图（`src/host.rs`）工作：stdio 经由命令的文件描述符路由（可能经过管道或重定向），路径操作数相对于 shell 工作目录解析，shell 导出的环境可见，并遵循中止/超时取消。由于这些内建命令会遮蔽系统二进制程序，注册受开关控制（`crates/shell/src/extras.rs` 中的 `ExtrasGate`，在 `crates/shell/src/tools/mod.rs` 中构建）：

- `PI_DISABLE_UUTILS_BUILTINS` 禁用整套实用程序（裸名称重新解析为系统二进制程序），
- `PI_DISABLE_UUTILS_DESTRUCTIVE` 一并禁用破坏性遮蔽命令：会覆盖或删除文件的 `rm`、`mv`、`cp`、`dd`、`rsync` 和 `tar`，以及可通过 `-f` 覆盖文件的 `ln`，
- `PI_DISABLE_RM_BUILTIN` / `PI_DISABLE_MV_BUILTIN` 分别禁用 `rm`/`mv`。

内建命令开关在会话创建期间先从 `sessionEnv` 读取，再从进程环境读取。值存在且不是空字符串、`"0"` 或不区分大小写的 `"false"` 时视为真；命令作用域的 `env` 不会改变注册。

Windows 上的 `omp zsh`（进程 shell，`crates/shell/src/process`）以相反方式提供同一套实用程序：只有 `PATH` 中不存在同名程序时才作为回退（`Host::fallback`），因此 `PATH` 中的程序仍会运行，而 Windows 缺少的 Unix 工具也仍可使用。已定义的 `command_not_found_handler` 优先于该回退。相同的开关也适用。`type`/`whence` 仍根据 `PATH` 回答，对缺失名称执行 `exec` 仍会报告未找到。在 Linux 和 macOS 上，缺失的命令仍报告未找到。`obash` 与会话一样，在 `PATH` 之前提供这些命令（包括 `awk`、`perl`、`xargs` 和 `find` 等运行命令行的命令）；`obash --no-extras` 对 bash 非内建的所有命令都从 `PATH` 获取，这是与 bash 和 zsh 进行差分运行时所需的行为。

在 Windows 上，`omp zsh` 从 MSYS2、Cygwin 或 Git for Windows 的 zsh 获取 zsh 函数库（用于 `compinit` 的 `fpath`）：先查找 `PATH` 中某个 `…\usr\bin`（或 Cygwin 的 `…\bin`）的根目录，再查找 `C:\msys64`、`C:\cygwin64` 和 `C:\cygwin`。被 Ctrl-C 结束的控制台 `read` 不表示输入结束：当 shell 捕获或忽略 `INT` 时，read 会在陷阱处理后恢复，如同被 `SIGINT` 中断的 Unix read。`read -k`/`-q` 在所有平台上都以 cbreak 模式读取终端。

Windows 没有进程组或终端前台，因此启动器将它们映射为控制台进程组。前台程序留在 shell 的控制台组中，因此键盘 Ctrl-C 会传到它，如同 `SIGINT` 传到 Unix 前台组。忽略 `INT` 的程序（未启用作业控制的后台作业）或启用作业控制的作业会获得自己的组，因此键盘 Ctrl-C 会绕过它。`fg` 使 shell 将下一次 Ctrl-C 作为 `CTRL_BREAK_EVENT` 转发给该作业的组，而 shell 自身不会被中断，从而模拟 `tcsetpgrp`。`jobs`/`fg`/`bg` 可用，`kill -STOP`/`-CONT` 可暂停和恢复作业。Ctrl-Z 不会挂起前台程序：Windows 程序自行读取控制台，因此按键会传到程序（通常作为输入结束），而不会传到 shell。若要捕获它，就意味着让每个前台程序都在由 shell 中继的伪控制台后运行。

传给 Windows 程序的 `<(…)`/`>(…)` 会变为命名管道 `\\.\pipe\obash-pump-…`，而不是 `/dev/fd/N`。程序经常仅为检查路径而打开它一次（`cmd` 的 `type`、MSYS 运行时的 `stat`），因此从启动开始，管道就保持实例监听，直到确定传输数据的连接：对于子进程读取，是连接稳定后仍保持打开的最新连接（MSYS 运行时的路径检查先打开但从不读取）；对于子进程写入，是第一个交付字节的连接。内建命令和函数继续在进程内读取 `/dev/fd/N`。MSYS 和 Cygwin 程序（Git for Windows 的 `diff`、`cmp` 等）将这类路径视为普通文件，其大小是调用 `stat` 时管道中已有的数据量：信任此大小的程序可能将生产者尚未写入的管道视为空文件（`diff <(slow) <(slow)` 报告没有差异）。原生 Windows 程序则直接读取。

### 运行时生命周期与状态转换 \{#runtime-lifecycle-and-state-transitions}

持久 shell（`Shell.run`）使用以下状态机：

- **空闲/未初始化**：`session: None`。
- **运行中**：第一次 `run()` 延迟创建会话，存储中止令牌并执行命令。
- **完成并保持存活**：如果执行控制流正常，则清除中止状态并复用会话。
- **完成并销毁**：如果控制流涉及循环、脚本或 shell 退出，则丢弃会话。
- **已取消/已超时**：触发 Tokio 取消；每次运行的启动注册表通过多轮 TERM/KILL 信号，针对该次运行的进程及其后代进行处理。允许任务优雅等待 2 秒（Windows 上为 5 秒），随后可能中止任务；如果能够获取锁，则丢弃持久会话。
- **错误**：丢弃会话。

单次执行 shell（`executeShell`）每次调用始终创建并丢弃一个新会话。

### 流式传输、输出与最小化器行为 \{#streamingoutput-and-minimizer-behavior}

- stdout/stderr 被路由到共享管道中，并被并发读取。
- 读取器增量解码 UTF-8；无效字节序列会输出 `U+FFFD` 替换块。
- Windows 使用非 UTF-8 ANSI 代码页时，按生产者决定编码。每个向捕获输出或命令替换写入的外部程序都会写入自己的中继管道（`crates/shell/src/sys/relay.rs`，由 `PiHost::spawn` 启动），并独立解码：在出现第一个无效序列前使用 UTF-8，之后该程序其余输出使用 ANSI 代码页。一个程序的 stdout 和 stderr 共享同一个中继，因此保留交错顺序。中继不是线程：程序的 `ExtProc` 在 shell 自身任务上轮询它（中继管道的 shell 端使用重叠 I/O，其完成会唤醒该任务），也没有其他读取者，因此程序退出时 shell 可以精确确定其输出量：中继已读取的量加上此时管道中的量。中继转发完这些数据后才报告退出，无论缓慢的捕获读取器需要多久。如果程序结束时停在一个字符的中间，解码器持有的字节会等待流结束；若程序留下的运行中进程使管道保持打开，退出最多为此等待 50ms。报告退出后，中继仍会继续转发这类进程的写入，直到流结束（程序的 `ExtProc` 消失后，作为会话运行时上的任务运行），并在那里释放保留字节。内建命令的写入（`printf`、`cut`、对旧编码文件执行 `cat`，通过 `| head` 传递的原生程序输出）按行判断：有效 UTF-8 保持 UTF-8；一行如果能以 ANSI 代码页严格解码，且按 UTF-8 读取效果更差，则从该代码页解码，除非在多字节代码页中，其唯一问题是行尾字符被截断；其他情况使用 `U+FFFD`。ASCII 会立即流出；含其他字节的行会在换行、50ms 无输出或达到 64 KiB 时发出，将跨写入拆开的字符保留到后续字节到来，且已部分发出的行所选编码会保持到换行。流水线管道和文件从不解码，因此二进制数据逐字节传递。
- N-API 输出桥接具有有界的 64 块队列，并等待回调执行，对管道读取器和子进程施加背压。已排队的块会在转发前合并。单个回调停滞 30 秒时，桥接会断开，让读取器继续排空。
- 命令使用 `ProcessGroupPolicy::NewProcessGroup` 运行。
- 前台命令完成后，读取器会排空直到 EOF、输出空闲 250ms 或达到 2s 上限；随后读取器关闭的超时为 250ms。
- 正常完成或出错时，JS 转发泵随后会排空已接受的输出；中断的运行最多允许 2 秒，之后中止该泵。取消会将读取器关闭延迟非 Windows 上的 500ms 或 Windows 上的 2s，以便管道消费者刷新输出。
- 可选的最小化器配置可以捕获并重写输出。发生最小化时，结果包含 `minimized`，其中有过滤器名称、替换文本/原文和字节数。
- 成功结果可以包含 `workingDir`，反映执行后 shell 的 cwd。
- 使用方负责持久化或显示最小化器产物；原生结果只携带数据。

### 取消、超时与中止 \{#cancellation-timeout-and-abort}

- `CancelToken` 由 `timeoutMs` 和可选 `AbortSignal` 构造，随后转换为共享的 `omp_shell::cancel::CancelToken`。
- 取消或超时时，触发 shell 取消令牌，执行后代清理，随后任务获得 2 秒的优雅处理窗口（Windows 上为 5 秒），之后强制中止。
- 使用结构化结果标志：
   - 超时 -> 省略 `exitCode`，`timedOut: true`。
   - 中止信号 / `Shell.abort()` -> 省略 `exitCode`，`cancelled: true`。

`Shell.abort()` 的行为：

- 通过存储的 `AbortToken` 中止该 `Shell` 实例当前运行的命令，
- 即便没有命令运行，也会成功完成。

### 失败行为 \{#failure-behavior}

常见的对外错误包括：

- 会话初始化失败（`Failed to initialize shell`），
- cwd 错误（`Failed to set cwd`），
- 环境设置/弹出失败，
- 快照 source 失败（`Failed to source snapshot`），
- 管道创建/克隆失败，
- 执行失败（`Shell execution failed: ...`），
- 任务包装器失败（`Shell execution task failed: ...`）。

## PTY 子系统（`pty`） \{#pty-subsystem-pty}

### API 模型 \{#api-model-1}

`new PtySession()` 提供：

- `start(options, onChunk?, onStart?) -> Promise<{ exitCode?, cancelled, timedOut }>` 通过 shell 运行命令字符串。
- `startArgv(options, onChunk?, onStart?)` 直接运行应用程序及参数向量，不进行 shell 解析。
- `write(data)`
- `resize(cols, rows)`
- `kill()`

两种启动方法都会在启动后调用 `onStart(error, pid)`（实现只有在平台子进程 PID 不可用时才提供 `0`）。`PtyStartOptions` 支持 `command`、可选的 `cwd`、可选的 `env`、`timeoutMs`、`signal`、`cols`、`rows` 和 `shell`；默认 shell 为 `sh`。`PtyArgvStartOptions` 则要求 `application` 和 `args`，且没有 `shell`。

### 运行时生命周期与状态转换 \{#runtime-lifecycle-and-state-transitions-1}

`PtySession` 状态机：

- **空闲**：`core: None`。
- **已预留**：`start()` 在异步工作开始前同步安装控制通道（`core: Some`），因此 `write/resize/kill` 立即可用。
- **运行中**：阻塞式 PTY 循环处理子进程状态、读取器事件、取消心跳和控制消息。
- **终端已关闭/排空**：子进程退出或取消会启动一个短暂的读取器排空窗口。
- **已结束**：启动任务完成后（成功或出错），`core` 总会重置为 `None`。

并发保护：

- 已在运行时再次启动，会返回 `PTY session already running`。

### 启动、连接、写入、读取与终止模式 \{#spawnattachwritereadterminate-patterns}

- PTY 通过 `openpty`（Unix；子进程领导自己的会话，以 PTY 为控制终端）或 ConPTY 伪控制台（Windows；旁加载的 `conpty.dll` 优先于系统版本）打开。
- Windows 上在辅助线程中打开伪控制台，启动超时为 5s；超时会以 `PTY creation timed out (5s). ConPTY may be unavailable on this system.` 拒绝。
- `start()` 通过所配置的 shell 运行命令：
   - `cmd.exe`/`cmd` 接收 `/c`，
   - `powershell`/`pwsh` 接收 `-Command`，
   - 其他 shell 接收 `-lc`。
- `startArgv()` 将各个参数原样传给程序（Windows 会为 `CommandLineToArgvW` 分别添加引号）；程序在子进程环境的 `PATH` 中查找（Windows 上还使用 `PATHEXT`）。
- 缺失或不是目录的 `cwd` 会回退到 `HOME`（Windows 上为 `USERPROFILE`）。
- PTY 命令继承移除 Git 仓库位置覆盖后的进程环境；显式 PTY `env` 值可以将其加回。
- 默认大小为 `120x40`；启动和调整大小时会限制尺寸范围（`cols 20..400`、`rows 5..200`）。
- `write(data: string)` 将字符串的 UTF-8 字节发送到 PTY stdin。
- `resize()` 发送控制消息，并再次限制尺寸范围。
- `kill()` 发送控制消息，将本次运行标记为已取消，并终止 PTY 进程目标。

输出路径：

- 专用读取线程读取主端流，并增量解码 UTF-8，将无效字节替换为 `U+FFFD`，
- 有界的 64 块队列对读取器施加背压；独立的异步泵合并输出，并等待 N-API 回调执行，
- 控制循环从不等待 JS 回调执行，因此输入、调整大小、终止和子进程状态检查始终可响应。

终止路径：

- `terminate_pty_processes` 在 PTY 进程组可用时以它为目标，在子进程 pid 可用时也以其为目标。
- 它发送平台的 `TERM_SIGNAL`，调用 `child.kill()`，再发送平台的 `KILL_SIGNAL`。
- Windows 上，在丢弃主端前先关闭 ConPTY 输入；主端丢弃被交给后台线程处理，并最多等待 2s，以避免死锁。

### 取消与超时语义 \{#cancellation-and-timeout-semantics}

- `timeoutMs` 和 `AbortSignal` 输入到 `CancelToken`。
- 在 `openpty` 和启动前进行的预检心跳检查，会将取消作为设置错误而拒绝。
- 运行循环调用 `ct.heartbeat()`，控制等待间隔最长为 16ms。超时分类依据包含 `Timeout` 的心跳错误。
- 取消、终止或丢失 JS 回调会终止进程目标，并启动 300ms 的取消后窗口。结果仍可能包含回收时观察到的退出码。
- 非 Windows 上，对已取消子进程的回收最多轮询 500ms，之后将未完成的回收委托给一个分离线程，而不是一直占住 promise。
- 正常的有限运行会等待已接受的输出到达 JS。若后代进程使从端保持打开，可以在 2s 后、队列为空且没有正在执行的回调时结束排空；背压不被视为空闲从端。
- 中断的运行会中止缓慢的输出泵，并最多等待 300ms 让它停止；已排队的 JS 回调仍可能运行。

### 失败行为 \{#failure-behavior-1}

对外错误包括：

- PTY 分配/打开失败，
- Windows PTY 启动超时，
- PTY 进程启动失败，
- 写入器/读取器获取失败，
- 子进程状态/等待失败，
- 控制通道断开（`PTY session is no longer available`）。

未运行时控制调用的失败：

- `write/resize/kill` 返回 `PTY session is not running`。

## 进程子系统（`ps`） \{#process-subsystem-ps}

### API 模型 \{#api-model-2}

当前的 JS 接口为 `Process` 类：

- `Process.fromPid(pid) -> Process | null`
- `Process.fromPath(path) -> Process[]`
- getter：`pid`、`ppid`
- 方法：`args()`、`killTree(signal?)`、`terminate(options?)`、`waitForExit(options?)`、`groupId()`、`children()`、`status()`

`ProcessTerminateOptions` 支持 `{ group?, gracefulMs?, timeoutMs?, signal? }`。`ProcessWaitOptions` 支持 `{ timeoutMs?, signal? }`。

### 行为 \{#behavior}

- `killTree(signal?)` 默认为强制终止信号，以子进程优先的顺序发送给进程及其后代，并返回已发送信号的数量；Windows 上忽略 signal 参数，通过 `TerminateProcess` 终止进程。
- `terminate(options?)` 是异步的，完成值表示进程树是否在其等待窗口内退出。默认优雅等待 1000ms，强制终止后等待 5000ms。`gracefulMs < 0` 跳过优雅等待，但不跳过初始的温和信号。`group: true` 在受支持的平台上还会以进程组为目标；中止其 signal 会使终止等待被拒绝。
- `waitForExit(options?)` 在进程退出时完成为 `true`，超时时为 `false`；中止其 signal 会拒绝 promise。

平台专用实现位于 `omp_shell::process`；`crates/natives/src/ps.rs` 是 N-API 适配层，并提供 PTY 终止所用的重新导出。

`execReplace(path, argv, env, keepFds)` 是独立的同步进程交接：在 Unix 上，它清除 `keepFds` 上的 `FD_CLOEXEC` 并调用 `execve`，在相同 PID 中替换宿主进程，成功时不进行 JS/原生清理。`path` 不会在 `PATH` 中查找。调用方必须先恢复终端并刷新日志。内部 NUL 字节、exec 失败和不受支持的平台会抛出异常；Windows 调用方必须改用启动并等待。

`expandWindowsLongPath(path)` 和 `getWindowsShortPath(path)` 从 `shell.rs` 导出。展开或短名称查找失败时，它们保留输入；在非 Windows 上则是恒等函数。

## 按键解析子系统（`keys`） \{#key-parsing-subsystem-keys}

### API 模型 \{#api-model-3}

提供的辅助函数：

- `parseKey(data, kittyProtocolActive)`
- `matchesKey(data, keyId, kittyProtocolActive)`
- `parseKittySequence(data)`
- `matchesKittySequence(data, expectedCodepoint, expectedModifier)`
- `matchesLegacySequence(data, keyName)`

### 解析模型 \{#parsing-model}

解析器结合了：

- 直接单字节映射（`enter`、`tab`、`ctrl+<letter>`、可打印 ASCII），
- O(1) 传统转义序列查找（PHF 映射），
- xterm `modifyOtherKeys` 解析，
- Kitty 协议解析（`CSI u`、`CSI ~`、`CSI 1;...<letter>`），
- 规范化为按键 ID（`ctrl+c`、`shift+tab`、`pageUp`、`f5` 等）。

修饰键处理：

- 高层按键 ID 支持 shift/alt/ctrl/super，
- Kitty 匹配在比较修饰键掩码前会屏蔽 caps-lock 和 num-lock 位；不受支持的修饰键位不会被静默忽略。

布局行为：

- 基础布局回退被有意限制，以免重映射布局导致 ASCII 字母/符号误匹配。
- `parseKey` 和高层 `matchesKey` 忽略 Kitty 释放事件；`parseKittySequence` 为有需要的调用方保留事件类型（按下/重复/释放）。

### 失败行为 \{#failure-behavior-2}

- 无法识别或无效的序列会使解析函数返回 `null`。
- 解析失败或不匹配时，匹配函数返回 `false`。
- 格式错误的按键输入不会引发对外抛出的错误。

## JS API ↔ Rust 导出映射 \{#js-api--rust-export-mapping}

### Shell + PTY + 进程 \{#shell--pty--process}

| JS API | Rust N-API 导出 | 说明 |
| --- | --- | --- |
| `executeShell(options, onChunk?)` | `executeShell` (`execute_shell`) | 单次 shell 执行 |
| `new Shell(options?)` | `Shell` 类 | 持久 shell 会话 |
| `shell.run(options, onChunk?)` | `Shell::run` | 在保持存活的控制流下复用会话 |
| `shell.abort()` | `Shell::abort` | 中止该 shell 实例的活动运行 |
| `shell.liveBackgroundJobCount()` | `Shell::live_background_job_count` | 回收作业，再统计存活的后台子进程 |
| `new PtySession()` | `PtySession` 类 | 有状态的 PTY 会话 |
| `pty.start(options, onChunk?, onStart?)` | `PtySession::start` | 通过 shell 命令进行 PTY 运行 |
| `pty.startArgv(options, onChunk?, onStart?)` | `PtySession::start_argv` | 直接以可执行文件/argv 进行 PTY 运行 |
| `pty.write(data)` | `PtySession::write` | 原始 stdin 透传 |
| `pty.resize(cols, rows)` | `PtySession::resize` | 限定范围的终端尺寸 |
| `pty.kill()` | `PtySession::kill` | 终止活动的 PTY 子进程/目标 |
| `Process.fromPid(pid)` | `Process::from_pid` | 稳定进程引用查找 |
| `Process.fromPath(path)` | `Process::from_path` | 按可执行文件路径查找进程 |
| `process.killTree(signal?)` | `Process::kill_tree` | 子进程优先的进程树终止 |
| `process.terminate(options?)` | `Process::terminate` | 先优雅、后强制地终止进程 |
| `process.waitForExit(options?)` | `Process::wait_for_exit` | 异步等待退出 |
| `process.children()` | `Process::children` | 以 `Process[]` 返回直接子进程 |
| `process.status()` | `Process::status` | `running` / `exited` |

### 按键 \{#keys}

| JS API | Rust N-API 导出 | 说明 |
| --- | --- | --- |
| `matchesKittySequence(data, cp, mod)` | `matchesKittySequence` (`matches_kitty_sequence`) | Kitty 码点与修饰键匹配 |
| `parseKey(data, kittyProtocolActive)` | `parseKey` (`parse_key`) | 规范化按键 ID 解析器 |
| `matchesLegacySequence(data, keyName)` | `matchesLegacySequence` (`matches_legacy_sequence`) | 精确的传统序列映射检查 |
| `parseKittySequence(data)` | `parseKittySequence` (`parse_kitty_sequence`) | 结构化 Kitty 解析结果 |
| `matchesKey(data, keyId, kittyProtocolActive)` | `matchesKey` (`matches_key`) | 高层按键匹配器 |

## 废弃会话清理与终结说明 \{#abandoned-session-cleanup-and-finalization-notes}

- **Shell 持久会话**：如果运行被取消、超时、出错或出现非保持存活的控制流，Rust 会丢弃内部会话状态。成功的正常运行会保留会话以供复用。
- **PTY 会话**：`start()` 完成后总会清除 `core`，包括失败路径。
- 包装器**未公开显式的 JS 终结器驱动终止契约**；清理主要关联运行完成/取消路径。调用方应使用 `timeoutMs`、`AbortSignal`、`shell.abort()` 或 `pty.kill()` 进行确定性的销毁。
