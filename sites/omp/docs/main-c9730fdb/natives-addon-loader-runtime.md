---
title: "原生插件加载器运行时"
description: "Oh My Pi 官方仓库文档：原生插件加载器运行时。"
---

# 原生插件加载器运行时 \{#natives-addon-loader-runtime}

本页介绍 `packages/natives/native/loader-state.js`，即 ESM 入口点与经过验证的 `pi_natives.*.node` 插件之间的运行时。

## 入口点及立即/惰性加载 \{#entrypoints-and-eagerlazy-loading}

- `native/index.js` 在模块求值时调用 `loadNative()`，并暴露生成的根 API。
- `native/desktop.js`、`native/clipboard.js`、`native/path.js` 和 `native/vcs.js` 推迟原生加载。桌面、路径和 VCS 包装器缓存选定的类/绑定；剪贴板在每次调用时调用 `loadNative()`。路径辅助函数在非 Windows 平台上不加载插件，原样返回输入。
- 纯加载器辅助函数被导出供针对性测试使用，在调用 `loadNative()` 或 `initLoaderContext()` 之前不会执行检测或文件系统探测。

JS 不会记忆成功的调用。重复调用依赖 `openNativeAddon` 的缓存：它通过 `process.dlopen` 对每个 `.node` 路径打开一次，并在之后的每次调用中返回相同的导出，就像此前 `require` 的模块缓存那样（第二次 `dlopen` 会再次运行插件初始化并创建新的类）。加载后设置是幂等的或按尽力而为方式执行。

## 加载器上下文 \{#loader-context}

`initLoaderContext()` 派生以下内容：

- `platformTag`：`${platform}-${process.arch}`；
- 包版本（预期的插件发布版本，受下文哨兵机制出现前的兼容性例外约束）；
- 包本地的 `nativeDir` 和 `process.execPath` 所在目录；
- `nativesDir`：首先采用 `PI_NATIVES_DIR`（去除首尾空白、展开 `~` 并规范化；忽略空值或相对值），然后只在 `$XDG_DATA_HOME/omp` 存在时使用 `$XDG_DATA_HOME/omp/natives`，否则使用 `~/.omp/natives`；
- `versionedDir`：`<nativesDir>/<packageVersion>`；
- 旧版编译二进制目录：Windows 上为 `%LOCALAPPDATA%/omp`（或 `~/AppData/Local/omp`），其他平台为 `~/.local/bin`；
- 工作区/安装/编译模式、可选叶子包目录、Windows 暂存策略、CPU 变体、文件名和有序候选项。

存在非空内嵌清单、设置了 `PI_COMPILED`，或 `import.meta.url` 包含 Bun 内嵌标记（`$bunfs`、`~BUN` 或 `%7EBUN`）时，编译模式为真。对于非编译模式加载，如果 `nativeDir` 位于 `node_modules` 路径之外，且核心清单在 `optionalDependencies` 中未声明平台叶子包，则属于工作区加载。复制到 bun 安装缓存中的发布包声明了其叶子包，因此即使路径没有 `node_modules` 段，也属于已安装包。Windows 路径分类不区分大小写；其他平台使用区分大小写的路径匹配。

## 平台和变体 \{#platforms-and-variants}

支持的发布标签如下：

- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`
- `win32-x64`
- `win32-arm64`

只有在探测候选项之后，才会报告不受支持的标签。

对于 x64，`PI_NATIVE_VARIANT=modern|baseline` 优先。无效值会被忽略。否则，如果私有的继承值 `__PI_NATIVE_VARIANT_CACHE` 有效，就使用该结果；只有在此之后加载器才会检测 AVX2：

- Linux 读取 `/proc/cpuinfo`。
- macOS 先尝试 `/usr/sbin/sysctl`，再尝试 `sysctl`，查询 `machdep.cpu.leaf7_features` 和 `machdep.cpu.features`。
- Windows 的 Bun 环境下，首先通过 `bun:ffi` 调用 `kernel32.dll!IsProcessorFeaturePresent(40)`。如果 FFI 不可用，则先尝试非交互式的 `pwsh.exe`，再尝试 `powershell.exe`，探测 `System.Runtime.Intrinsics.X86.Avx2`；探测不存在或失败时选择 baseline。

检测在可用时使用 `Bun.spawnSync`，然后回退为 `node:child_process`。检测结果会写入私有缓存环境条目，使后续工作线程/子进程继承相同的决定。非 x64 不使用也不填充变体。

`getAddonFilenames()` 返回：

| 运行时选择 | 有序文件名 |
| --- | --- |
| modern x64 | `pi_natives.<tag>-modern.node`、`pi_natives.<tag>-baseline.node`、`pi_natives.<tag>.node` |
| baseline x64 | `pi_natives.<tag>-baseline.node`、`pi_natives.<tag>.node` |
| 非 x64 / 无变体 | `pi_natives.<tag>.node` |

## 候选项排序 \{#candidate-ordering}

`resolveLoaderCandidates()` 对路径去重，同时保留首次出现的项。

### 已安装的非编译包 \{#installed-non-compiled-package}

1. `@oh-my-pi/pi-natives-<tag>` 中每个选定的文件名。
2. 对于每个文件名，先是包本地的 `nativeDir`，然后是可执行文件目录。

平台叶子包优先于过期的核心产物。工作区加载有意跳过叶子包解析。叶子包通过 `require.resolve` 查找；未找到时（发布包被复制到 bun 安装缓存，叶子包在其中是核心包的版本固定同级包 `pi-natives-<tag>@<version>@@@N`），加载器会从核心包的作用域目录中，选取含有选定文件名且与运行版本匹配的同级 `pi-natives-<tag>` 目录（`pi-natives-<tag>@<version>@@@N` 或无修饰的 `pi-natives-<tag>`）。

### Windows `node_modules` 暂存 \{#windows-node_modules-staging}

当平台为 Windows、运行时为非编译模式，且 `nativeDir` 包含 `node_modules` 段时：

1. `versionedDir` 中每个选定的文件名。
2. 叶子包候选项。
3. 包本地和可执行文件候选项。

探测之前，`maybeStageNodeModulesAddon()` 会将 `leafPackageDir ?? nativeDir` 中每个可用的文件名复制到尚不存在的缓存目标。已有缓存文件会保留。这会让加载的 DLL 句柄远离更新时需要替换的包管理器副本。目录/复制失败会被记录，正常探测继续进行。

### 编译运行时 \{#compiled-runtime}

1. 对于每个文件名，先是 `versionedDir`，然后是旧版用户数据目录。
2. 对于每个文件名，先是包本地的 `nativeDir`，然后是可执行文件目录。

成功选定的内嵌候选项会被放到最前面。编译模式下禁用 Windows 暂存。

## 内嵌清单和提取 \{#embedded-manifest-and-extraction}

磁盘上的 `embedded-addon.js` 始终为 `embeddedAddon = null`，发布的核心包也不例外。独立二进制构建会在内存中用 `scripts/embed-native.ts` 生成的清单替换它，清单包含：

- `platformTag` 和包 `version`；
- `files[]`，其中包含 `variant`、仅含基本名称的 `filename`、解压后的 `size`，以及 `zstdPath`，即保存该插件的内嵌 `<filename>.zst` zstd 帧。

提取只在编译模式下运行，且平台和版本匹配，并存在可选文件。选择顺序为：

- 非 x64：`default`，然后是第一个文件；
- modern x64：`modern`，然后 `baseline`；
- baseline x64：只使用 `baseline`。

加载器创建 `versionedDir`，并拒绝任何不只是基本名称的清单文件名。对于每个清单文件，如果它已经是具有声明大小的普通文件，就复用它；其他文件则从其 zstd 帧解压，核对声明大小，并通过临时文件加重命名的方式写入。不可读帧、损坏帧以及大小不匹配都会报错。

提取错误会累积记录；加载器会继续尝试普通候选项。

## 候选项验证和加载后设置 \{#candidate-validation-and-post-load-setup}

对于每个候选项：

1. 启用时输出启动标记。
2. 用 `openNativeAddon` 打开 `candidate`，它对每个路径调用一次 `process.dlopen`。Bun 的 `require` 无法从包含 `?` 的路径加载模块，而 `HOME`、`PI_NATIVES_DIR` 或安装目录可能包含该字符；`dlopen` 按原样接收路径。打开失败时会记录该候选项的 `dlopen` 失败原因，不缓存任何内容，然后尝试下一个候选项。
3. 除非是工作区开发，否则要求 `__piNativesBuildVersion()` 返回包版本。构建流水线在链接后将该版本写入固定的 64 字节槽位（`PI_NATIVES_VERSION_STAMP:<version>` 加 NUL 填充）（`scripts/stamp-native-version.ts`，由每次 `scripts/bazel-natives.ts` 安装、本地 cargo 构建和 Nix 包构建调用），因此发布版本递增不会修改任何 Rust 输入。在戳记机制出现之前发布的插件，改为暴露每个发布版本对应的 `__piNativesV<version_with_underscores>` 导出；诊断时仍将它们读取为其发布版本。
4. 如果插件提供 `__ompInstallTokioRuntime()`，则调用它。
5. 尽力移除比当前版本旧、具有有效语义版本号的缓存目录。
6. 返回绑定。

版本错误会区分仍驻留在当前进程中的旧插件与磁盘上的过期文件。如果加载的导出报告了较旧发布版本，但候选文件字节包含当前戳记（`PI_NATIVES_VERSION_STAMP:<packageVersion>\0`），诊断会提示重新启动。否则会提示重新安装。加载器不会验证所有公共导出。作为兼容性例外，如果插件没有发布标识，但具有 `countTokens`、`executeShell`、`visibleWidth`，以及带有 `capture`、`execute` 和 `close` 的 `DesktopSession`，且候选文件字节不含预期的当前戳记，就会被接受。暴露戳记读取器但未加戳记的当前插件不适用此例外。

工作区开发完全跳过版本检查，因此拉取了较新发布版本的检出副本可以在重新构建前启动。这种宽容并非悄无声息：`native/index.js` 对缺少的普通函数导出使用 `missingNativeExport(symbol)`（发布标识函数仍然原样透传），它在当前插件上为 `undefined`，在过期插件上则是一个会抛出异常的桩函数，指出符号、插件路径、加载的发布版本与预期发布版本，以及 `bun run build:native`。`nativeAddonStatus()` 为自行展示状态的调用方报告相同的标识（`path`、`version`、`packageVersion`、`stale`）。

Rust 模块初始化会安装崩溃诊断，但不会在动态加载器锁下派生运行时线程。可选的加载后钩子安装有界的 Windows Tokio 和 Rayon 池。它按尽力而为方式执行；旧插件或钩子失败会回退为 napi-rs 行为。设置 `PI_DEBUG_STARTUP`，可向 stderr 同步输出 `[startup]` 标记，包括钩子成功/失败。

缓存清理忽略读取/删除失败，只移除以较旧 `major.minor.patch` 发布版本命名、且 mtime 至少已过十分钟的目录。`prepareNativeVersionDir()` 在提取或暂存之前刷新目录 mtime，以保护并发启动。清理会保留当前/未来版本、预发布/非版本名称、普通文件以及近期活动的目录。

## 故障诊断 \{#failure-diagnostics}

如果没有候选项成功：

- 不受支持的标签会抛出 `Unsupported platform: <tag>`、支持列表和问题反馈指引；
- 受支持的标签会抛出 `Failed to load pi_natives native addon for <tag>`（包含 x64 变体），后面附上每个候选项/准备错误以及特定模式的帮助。

编译模式帮助会列出预期缓存路径，建议删除版本目录，并打印用于下载发布版本的 `curl` 命令。已安装包帮助会建议重新安装、本地主机构建（`bun --cwd=packages/natives run build`），以及显式的 `scripts/bazel-natives.ts <target> --dest packages/natives/native` 构建。

## 生命周期 \{#lifecycle}

```text
entrypoint evaluates or lazy wrapper is invoked
  -> initialize loader context
  -> extract matching embedded addons, if any
  -> otherwise stage Windows node_modules addon, if applicable
  -> open candidates in deterministic order (process.dlopen, once per path)
       -> validate release stamp outside workspace development
       -> install optional post-load runtime; record addon identity
       -> best-effort clean older version caches
       -> return bindings
  -> no success: throw unsupported-platform or aggregated load error
```
