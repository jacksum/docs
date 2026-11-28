---
title: "原生 crate"
description: "Oh My Pi 官方仓库文档：原生 crate。"
---

# 原生 crate \{#native-crates}

面向贡献者的 `crates/` 下 Rust 工作区成员索引。它们是 `@oh-my-pi/pi-natives` 及其嵌入式 shell 背后的实现细节；包的使用者使用 JavaScript 入口点，而不是这些 crate API。

根目录的 `Cargo.toml` 在 `workspace.members` 中显式列出了 `crates/` 下的每个 crate，新增 crate 时请在此处添加。其 `[patch.crates-io]` 选择了随仓库提供的 `grep-searcher`、`jaq-core`、`jaq-json`、`jaq-std`、`napi` 和 `tree-sitter-go`。

## 第一方 crate \{#first-party-crates}

| Crate | 路径 | 职责和使用者 |
| --- | --- | --- |
| `omp-natives` | [`crates/natives`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/natives) | 顶层 N-API `cdylib`。它公开 JS 可见的 API，并依赖 `omp-ast`、`omp-diff`、`omp-edit`、`omp-iso`、`omp-predict`、`omp-shell`、`omp-vcs`、`omp-vfs`、`omp-voice` 和 `omp-xfs`。 |
| `omp-builtins` | [`crates/builtins`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/builtins) | pi 为嵌入式 shell 提供的进程内扩展工具：每个命令行实用工具对应一个模块（`cat`、`grep`/`rg`、`sed`、`ls`、`find`、`jq`、`fd`、`diff`、moreutils 工具集等），另有进程内置命令（`ps`、`top`、`sleep`、`pgrep`、`pkill`、`pidwait`、`lsof`）。`src/host.rs` 包含 `Utility` trait，以及实用工具运行所依托的 shell `Host` 视图（标准输入输出、工作目录、导出的环境、取消、`Host::vfs()`）。`rg`、`grep`、`fd`、`find` 和 `ast-grep`/`sg` 是 `AsyncUtility`：宿主将它们作为 tokio 任务等待（同步实用工具在阻塞池上运行），取消会丢弃任务体。它们的输出写入内存支持的写入器，由 `Host::flush_output` 排空；所有输入（stdin、操作数、FIFO、`<(…)`、解压器管道）都通过 `stdio::Source` 读取：提供方文件通过异步 `omp_vfs` API 读取，普通文件内联读取，描述符通过 tokio `AsyncFd` 按就绪状态驱动（继承的描述符通过私有 dup 处理，每次系统调用都由零超时 `poll` 把关，因为对共享文件描述设置 `O_NONBLOCK` 会泄漏到其他进程）。搜索通过随仓库提供的 grep-searcher 的 `Searcher::search_push` 逐块馈入，因此在 unix 上没有实用工具使用阻塞池。uutils coreutils/findutils/sed 和 jaq 的移植版本也位于此处；第三方声明见 crate 的 `LICENSE`。 |
| `omp-diff` | [`crates/diff`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/diff) | 不依赖 N-API、兼容 jsdiff 的 Myers、行、词和结构化补丁原语，由原生 diff 绑定和编辑引擎使用。 |
| `omp-edit` | [`crates/edit`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/edit) | 编辑模式解析、匹配、暂存、流式预览、快照和宿主写入器应用（缺失路径的后缀恢复位于 `omp-natives/src/edit.rs` 的异步层）；由原生 `EditSession` / `EditStore` 封装。 |
| `omp-predict` | [`crates/predict`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/predict) | 不依赖 N-API 的 ngram、SmolLM 和基于 macOS 拼写功能的词语补全引擎，由 `TextPredictor` 封装。 |
| `omp-vfs` | [`crates/vfs`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/vfs) | 可注入的异步文件系统（为同步调用者提供阻塞外观）、原生宿主快速路径，以及 shell、内置命令和遍历共享的、保留 URL 的词法辅助函数。 |
| `omp-shell` | [`crates/shell`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/shell) | pi 的嵌入式 bash，以及 `omp-natives` 导出的 shell API。`bash` 是 bash 5.3 引擎（IR、带安全点的 VM 调度器、bash 内置命令、宿主和状态存储接缝；带别名展开的 `bash::syntax` 词法分析器/解析器和 `declare -f` 打印器，`bash::pattern` glob/extglob/ERE 匹配）；`sys` 包含操作系统部分（支持会话、进程组和 Job Objects 的进程启动器、文件、数据泵、`PATHEXT`、shebang）；`vfs` 是建立在 `omp-vfs` 上的引擎文件系统；`host`（`PiHost`，每个外部命令都领导自己的会话）、`session`（持久驱动器）、`tools`（`timeout`、`nohup`、`git`、命令运行扩展工具）、`extras`（作为引擎命令的 `omp-builtins` 实用工具）和 `git`；`testkit` 包含引擎测试套件，`src/bin/obash` 则是作为独立 shell 的引擎（操作系统宿主、内存存储），用于与 bash 进行差异测试和基准测试。其上层是 `Shell`/`execute_shell`、命令最小化、管道分流、取消和进程管线；遍历和可注入文件系统原语位于 `omp-xfs` 和 `omp-vfs`。 |
| `omp-voice` | [`crates/voice`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/voice) | `AudioCapture`、`AudioPlayback` 和 `LiveWebRtcPeer` 绑定使用的跨平台麦克风/播放及 Opus/WebRTC 支持。 |
| `omp-ast` | [`crates/ast`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/ast) | tree-sitter/ast-grep 语言注册表、匹配/编辑、块分析和摘要。常用语法直接链接；其余语法以 WebAssembly 模块加载，由智能体在首次使用时下载（`src/language/grammar.rs`）。它们由 [stencil-hq/wasm-grammars](https://github.com/stencil-hq/wasm-grammars) 构建和发布；`bun run gen:grammars` 将最新发行版固定在 `src/language/wasm_grammars.rs` 中。 |
| `omp-iso` | [`crates/iso`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/iso) | APFS、btrfs、ZFS、Linux reflink、overlayfs、Windows 块克隆和 ProjFS 的隔离后端实现与差异比较；回退时，Git 仓库使用 Git 工作树，其他情况使用递归复制。 |
| `omp-xfs` | [`crates/xfs`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/xfs) | 并行且遵循忽略规则的遍历器、逐目录列表缓存、glob 选择和内容搜索，全都在调用者的 Tokio 运行时上异步运行（每次调用通过 `tokio::spawn` 创建任务，由许可信号量限流；丢弃 future 会取消其工作），由原生扫描和 shell `rg`/`grep`/`fd`/`find` 共享。原生读取使用各平台的系统调用快速路径；提供方通过 `omp-vfs` 访问，且从不缓存。 |
| `omp-vcs` | [`crates/vcs`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/vcs) | 进程内版本控制：基于 gitoxide 的 git（git 二进制程序还处理受凭据约束的网络传输、reftable 仓库以及整个工作树的状态/未跟踪文件遍历），以及基于 jj-lib 的 Jujutsu；`vcs*` 原生绑定使用的统一发现和操作。 |

## 随仓库提供的工作区 crate \{#vendored-workspace-crates}

| 分组 | 路径 | 用途 |
| --- | --- | --- |
| 构建/运行时兼容性 | [`crates/vendor/grep-searcher`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/vendor/grep-searcher)、[`crates/vendor/napi`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/vendor/napi)、[`crates/vendor/tree-sitter-go`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/crates/vendor/tree-sitter-go) | 工作区补丁分别添加了分块馈入搜索（`Searcher::search_push`）、修复 N-API 环境销毁，以及修复 Go 语法支持。 |

`omp_builtins::extras::extras()`（定义于 `src/extras.rs`）是进程内扩展工具的权威列表；`omp-shell`（`src/extras.rs`）依次通过引擎内置命令、pi 工具、这些扩展工具来解析命令名，并遵循 `omp-shell` 配置的会话环境中的 `PI_DISABLE_*` 开关。一个目录是工作区成员，本身并不意味着 `omp-natives` 将其公开为 JavaScript API。

## 边界图 \{#boundary-map}

```text
@oh-my-pi/pi-natives JS entrypoints
  -> omp-natives (N-API conversion, platform bindings, task boundaries)
       -> omp-ast / omp-diff / omp-edit / omp-iso / omp-predict / omp-vcs / omp-voice
       -> omp-xfs / omp-vfs
       -> omp-shell
            -> omp_shell::session / host / tools / extras (session driver, engine host, pi's commands)
                 -> omp_shell::bash (engine: compiler, VM, bash builtins; bash::syntax, bash::pattern)
                 -> omp_shell::sys (process spawner, OS files) / omp_shell::vfs (engine filesystem)
            -> omp-builtins (in-process utilities + process builtins; host.rs: per-invocation I/O and cwd)
            -> omp-vfs / omp-xfs (filesystem provider and traversal)
```

加载器和 JS 边界见：

- [`natives-architecture.md`](./natives-architecture.md)
- [`natives-addon-loader-runtime.md`](./natives-addon-loader-runtime.md)
- [`natives-binding-contract.md`](./natives-binding-contract.md)

子系统详情见：

- [`natives-build-release-debugging.md`](./natives-build-release-debugging.md)
- [`natives-media-system-utils.md`](./natives-media-system-utils.md)
- [`natives-rust-task-cancellation.md`](./natives-rust-task-cancellation.md)
- [`natives-shell-pty-process.md`](./natives-shell-pty-process.md)
- [`natives-text-search-pipeline.md`](./natives-text-search-pipeline.md)
- [`fs-scan-cache-architecture.md`](./fs-scan-cache-architecture.md)

## 文档策略 \{#documentation-policy}

这些 crate 仍是面向贡献者的实现细节。只有当某个 crate 获得了独立于 `@oh-my-pi/pi-natives` 使用的公共 API 或可执行程序时，才为其编写独立的面向用户文档；见 [`user-facing-packages.md`](./user-facing-packages.md)。
