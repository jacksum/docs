---
title: "文件系统目录列表缓存架构契约"
description: "Oh My Pi 官方仓库文档：文件系统目录列表缓存架构契约。"
---

# 文件系统目录列表缓存架构契约 \{#filesystem-listing-cache-architecture-contract}

本文档定义由 `crates/xfs` 实现、供暴露给 `packages/coding-agent` 的原生发现 API 使用的共享目录列表缓存。

## 归属与数据模型 \{#ownership-and-data-model}

缓存位于 `crates/xfs/src/walk/cache.rs`（`omp_xfs::walk::cache`）。它在整个进程范围内共享，存储**逐目录列表**：从文件系统读取的单个目录条目，以及该目录忽略文件的状态戳。它不存储按根目录划分的条目列表、遍历结果，或最终的 glob、模糊查找、grep 或 AST 结果。遍历器（`omp_xfs::walk::walk` / `walk::collect`）会对访问的每个目录查询缓存，并且仍在每次遍历中应用隐藏/忽略策略、剪枝、过滤器、排序和限制，因此配置不同的遍历可以共享相同的目录列表。

对于未发生变化的目录，开销是一次元数据调用，而不是打开 + 列举 + 关闭。

当前的原生使用方：

- `crates/natives/src/glob.rs`：通过 `GlobOptions.cache` 选择启用
- `crates/natives/src/fd.rs`（`fuzzyFind`）：通过 `FuzzyFindOptions.cache` 选择启用
- `crates/natives/src/ast.rs`（`astGrep` / `astEdit` 发现）：对目录操作数始终请求缓存

`crates/natives/src/grep.rs` 不请求缓存；公开的 `GrepOptions` 没有 cache 字段。

`omp-xfs` 负责遍历、搜索根目录解析（`omp_xfs::fs::resolve_dir`）和缓存策略；N-API 模块只转换选项和结果。缓存是 `omp-xfs` 的私有实现，不暴露失效 API。

## 有效性规则 \{#validity-rules}

有效性依赖内核自身的变更跟踪：添加、删除或重命名条目会改变目录的 mtime 和 ctime，替换目录则会改变其 inode。

- 只有目录的状态戳（设备、inode、mtime、ctime）不变时，才会复用缓存的列表。
- 目录的忽略文件也按相同方式重新验证；忽略文件状态戳发生变化时会丢弃列表。
- 如果列表对应的目录状态戳距今不足 50 ms 的竞态窗口，则绝不缓存该列表（git 的“竞态下看似干净”规则），因此不会遗漏与列举发生在同一个时间戳刻度内的变更。这类目录会重新列举。

由于每次复用都会对照实时状态戳检查，缓存无需显式失效操作即可保证正确，也不存在此类操作。没有 TTL，也没有空结果重新验证。

## 适用条件 \{#eligibility}

只有满足以下所有条件时，才会从缓存读取目录列表或将其写入缓存：

- 遍历在原生文件系统（`Fs::Native`）上运行；提供方（`Fs::Provider(omp_vfs::Fs)`，包括 `scheme://` 根目录和任何宿主注入的 `ShellFilesystem`）从不使用缓存，即使它们重定向到宿主路径；
- 文件系统报告稳定的状态戳：macOS 上的 APFS；Linux 上的 ext4、XFS、Btrfs、tmpfs、F2FS、ZFS 和 bcachefs；Windows 上的 NTFS 和 ReFS。网络、FUSE、overlay 及其他挂载点始终重新列举；
- 遍历使用 `Detail::Minimal`（文件大小和 mtime 可以在不改变其目录状态戳的情况下发生变化，因此 `Detail::Full` 遍历从不使用缓存）；
- 遍历的 `walk::Options::cache` 为 `true`。

## 容量与淘汰 \{#capacity-and-eviction}

缓存拆分为 64 个由读写锁保护的分片。它最多保留约 64 MiB 的列表（条目载荷加上固定的每条目开销估算）。插入将超出预算时，会丢弃整个分片。没有后台过期线程。

## 遍历并行性 \{#walk-parallelism}

`walk::walk` 和 `walk::collect` 在当前 tokio 运行时上使用固定的长驻工作单元池；omp-xfs 没有自己的运行时。工作单元共享目录队列，并保留各自的会话和缓冲区。丢弃 future 会设置停止标志，并中止已注册的任务，包括启动任务。`walk::walk` 返回由 `Batch<T> { dir, items }` 构成的 `Stream`；无界 grep 会在这些相同的工作单元上扫描文件，然后再发送结果。`walk::Tree` 是一个串行异步游标，按条目消耗 tokio 的协作预算。`PI_WALK_WORKERS`（或 `Fs::workers`）设置工作单元数量：

- 正数 `N` 使用 `N` 个工作单元；
- 未设置或为 `0` 时，使用各文件系统的默认值：macOS 为 4，Linux 为 8，其他平台和提供方为 4；
- 结果受可用并行度限制。

## 原生快速路径 \{#native-fast-paths}

原生遍历通过 `openat` 相对于父句柄打开子目录，并批量读取列表：macOS 上使用 `__getdirentries64`（及其 EOF 标志），`Detail::Full` 还会使用 `getattrlistbulk`；Linux 上使用 `getdents64` 加 `statx`；Windows 上使用 `NtQueryDirectoryFile`。原生系统调用在异步 `fs::Session` 方法中内联运行；提供方则通过等待异步 `omp_vfs::Fs` 来读取。

## 添加缓存使用方 \{#adding-a-cache-consumer}

1. 设置 `walk::Options::cache = true` 并使用 `Detail::Minimal`；无需其他配置。
2. 不要添加逐调用的 TTL 或新鲜度控制；由状态戳决定是否复用。
3. 修改路径可以调用失效辅助函数以提早释放内存；保证正确性并不需要这些调用。

## 边界 \{#boundaries}

- 缓存位于进程本地，不会持久化。
- 条目是目录列表，而不是工具结果。
- 共享只发生在具有稳定状态戳的原生文件系统上，涵盖所有启用缓存的遍历，与根目录或遍历选项无关。

## 测量 \{#measuring}

`crates/xfs/examples/bench.rs`（遍历/glob 计时）和 `crates/xfs/examples/search_bench.rs`（内容搜索计时）是计时测试程序；使用 `cargo run --release -p omp-xfs --example bench` / `--example search_bench` 运行。两者都不会修改被测目录树。
