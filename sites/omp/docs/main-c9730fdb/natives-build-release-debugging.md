---
title: "Natives 构建、发布与调试操作手册"
description: "Oh My Pi 官方仓库文档：Natives 构建、发布与调试操作手册。"
---

# Natives 构建、发布与调试操作手册 \{#natives-build-release-and-debugging-runbook}

本手册介绍 `@oh-my-pi/pi-natives` 如何生成 `.node` 插件、生成的声明和编译后二进制文件的内嵌载荷，以及如何调试加载器/构建失败。

每个发布插件都由 Bazel（`rules_rust` + `crate_universe` + 密闭 cc 工具链）构建；两个 Windows 插件都从 Linux 交叉构建。cargo 工作区仍是本地 Rust 迭代（rust-analyzer、`cargo nextest`）和宿主构建的权威依据。运行时加载和嵌入方式保持不变。

本文沿用 `docs/natives-architecture.md` 中的架构术语：

- **构建时产物生成**（Bazel `//:natives-<target>`，或通过 `scripts/bazel-natives.ts` 使用 Cargo 后端的 `host` 目标）
- **内嵌插件清单与 zstd 帧生成**（`scripts/embed-native.ts`，在二进制编译期间于内存中进行）
- **运行时插件加载**（`native/index.js`、`native/loader-state.js`）

## 实现文件 \{#implementation-files}

构建侧：

- `BUILD.bazel`（根目录）：九个 `//:natives-<target>` 插件目标和聚合 filegroup
- `bazel/defs.bzl`：`native_addon` 规则/配置转换
- `bazel/platforms/BUILD.bazel`：每个交付插件对应一个 `platform()`
- `bazel/variants/BUILD.bazel`：`baseline`/`modern` ISA 约束值
- `bazel/toolchains/`：musl rustc 消歧及 msvc 交叉 cc 工具链（`msvc/NOTES.md`）
- `bazel/clippy.bazelrc`：从 `Cargo.toml` 中的 `[workspace.lints]` 生成
- `bazel/lints/BUILD.bazel`：同一策略，以选择接入的 crate 所关联的 `rust_lint_config` 形式提供
- `MODULE.bazel`、`MODULE.bazel.lock`、`.bazelrc`、`.bazelversion`（Bazel 9.2.0）
- `scripts/bazel-natives.ts`：标准驱动程序（构建、定位、安装）
- `crates/natives/BUILD.bazel`、`crates/natives/Cargo.toml`

包侧（运行时/打包不变）：

- `packages/natives/scripts/build-bindings.ts`：宿主 Cargo/N-API 构建及类型定义重新生成
- `packages/natives/scripts/embed-native.ts`、`gen-enums.ts`、`gen-npm-packages.ts`
- `packages/natives/package.json`
- `packages/natives/native/index.js`、`native/loader-state.js`

## 构建架构 \{#build-architecture}

### 1) `//:natives-<target>` 插件目标 \{#1-natives-target-addon-targets}

根目录的 `BUILD.bazel` 为每个由 Bazel 构建的 `(platform, arch, ISA-variant)` 实例化一个 `native_addon`：

| 目标 | 平台 | 标准输出 |
| --- | --- | --- |
| `//:natives-linux-x64-baseline` | `//bazel/platforms:linux-x64-baseline` | `pi_natives.linux-x64-baseline.node` |
| `//:natives-linux-x64-modern` | `//bazel/platforms:linux-x64-modern` | `pi_natives.linux-x64-modern.node` |
| `//:natives-linux-arm64` | `//bazel/platforms:linux-arm64` | `pi_natives.linux-arm64.node` |
| `//:natives-linux-musl-x64-baseline` | `//bazel/platforms:linux-musl-x64-baseline` | `pi_natives.linux-x64-baseline.node` |
| `//:natives-linux-musl-arm64` | `//bazel/platforms:linux-musl-arm64` | `pi_natives.linux-arm64.node` |
| `//:natives-darwin-x64-baseline` | `//bazel/platforms:darwin-x64-baseline` | `pi_natives.darwin-x64-baseline.node` |
| `//:natives-darwin-arm64` | `//bazel/platforms:darwin-arm64` | `pi_natives.darwin-arm64.node` |
| `//:natives-win32-x64-baseline` | `//bazel/platforms:win32-x64-baseline` | `pi_natives.win32-x64-baseline.node` |
| `//:natives-win32-arm64` | `//bazel/platforms:win32-arm64` | `pi_natives.win32-arm64.node` |

说明：

- Windows ARM64 与 win32-x64 一样从 Linux 交叉构建（使用带 aarch64 xwin 展开文件集的 msvc 工具链）；`release_smoke` 在 `windows-11-arm` 上运行生成的二进制文件。Windows ARM64 开发宿主仍可通过 Cargo/N-API 构建 `host`。
- musl 插件**有意复用**普通 `linux-<arch>` 文件名，加载器不会同时看到 gnu 和 musl；发布作业将它们放在不同调用/目标目录中（同一次运行中 basename 冲突时，`scripts/bazel-natives.ts` 会硬性报错）。
- Darwin 插件也从 Linux 交叉构建（下文的 `//bazel/toolchains/darwin`）；mac 宿主则使用宿主 Xcode 工具链构建。`release_smoke` 在 `macos-15-intel` 和 `macos-15` 上运行发布二进制文件。
- 聚合目标：`//:natives-all`（所有插件；linux 宿主交叉构建全部插件）和 `//:natives-darwin-all`。

### 2) `native_addon` 规则（`bazel/defs.bzl`） \{#2-native_addon-rule-bazeldefsbzl}

`native_addon` 将 `//crates/natives:pi_natives`（一个 `rust_shared_library`）包装在配置转换中，为每个目标固定：

- `--platforms=<the addon's platform>`
- `--compilation_mode=opt`
- `@rules_rust//rust/settings:lto=thin`
- 额外的 rustc 标志 `-Ccodegen-units=16`；非 Darwin 构建使用 `-Cstrip=symbols`，Darwin 则使用 `-Cstrip=none` 和链接器剥离（`-Wl,-x,-S`），以避免 rust-objcopy 损坏较新的 Mach-O dylib。

这对应旧 cargo `ci` 配置。由于配置位于**转换内部**，无论 `-c` 如何，直接运行 `bazel build //:natives-<t>` 始终达到发布级别，并且每个插件在每个（平台、源代码）组合下共享一个缓存条目。随后，规则将生成的共享库符号链接为加载器的标准名称 `pi_natives.<platform>-<arch>[-<variant>].node`，并限定在规则名之下（`bazel-bin/natives-<t>/…`），使 basename 相同的 gnu/musl 输出不会在包层面冲突。

不属于转换的逐目标代码生成设置位于 `crates/natives/BUILD.bazel` 的 `rustc_flags` select 中：通过 `//bazel/variants` 设置 `-Ctarget-cpu=x86-64-v2`（baseline）/ `x86-64-v3`（modern）；napi 链接参数（macOS 上为 `-Wl,-undefined,dynamic_lookup`，linux 上为 `-Wl,-z,nodelete`，有意不接入 `build.rs`/`napi_build::setup()`）；musl 的 `-Ctarget-feature=-crt-static`；以及 win32 msvc 的 x64 和 arm64 的 `-Ctarget-feature=+crt-static`（配合 `native_addon` 转换中启用的 `static_link_msvcrt` cc 特性，使 C 依赖同步以 `/MT` 编译，因此交付的 `.node` 不会从 VC++ Redistributable 导入 `VCRUNTIME140.dll`）。Cargo 宿主路径会在 `build-bindings.ts` 中对本地 Windows ARM64 构建应用相同的 `+crt-static` 策略。

### 3) 平台与工具链 \{#3-platforms-and-toolchains}

| 目标系列 | cc 工具链 | 说明 |
| --- | --- | --- |
| linux gnu（x64/arm64） | `@zig_sdk//libc_aware/toolchain:linux_*_gnu.2.17`（密闭 zig cc） | glibc **2.17** 可移植性下限，与之前交叉构建使用的下限相同 |
| linux musl（x64/arm64） | `@zig_sdk//libc_aware/toolchain:linux_*_musl` | 动态 CRT（crate BUILD 中的 `-Ctarget-feature=-crt-static`） |
| darwin（x64/arm64） | linux 执行宿主：`//bazel/toolchains/darwin`（`@darwin_cc_{arm64,x64}`）：LLVM 23.1.3 clang + ld64.lld，针对 `MacOSX27.0.sdk`；mac 执行宿主：宿主 Xcode 工具链 | SDK 直接来自 Apple：`@macos_sdk` 从 Apple 的软件更新 CDN 下载 Command Line Tools SDK 包，并用 `extract_pkg.py` 解包（宿主上的 python3）。要求 LLVM ≥ 23.1.3：较旧的 ld64.lld 拒绝 SDK 27 `.tbd` 桩文件中的 `arm64e.x1` 目标。两种宿主上的部署目标均为 12.0（`--macos_minimum_os`） |
| win32-x64 msvc | `//bazel/toolchains/msvc`（`@msvc_cc`）：clang-cl + lld-link + xwin CRT/SDK | 从 linux-x64 CI pod 和 darwin 开发宿主进行密闭交叉链接；**静态 CRT**（`+crt-static` + `static_link_msvcrt`），因此插件不需要 VC++ Redistributable；参见 `bazel/toolchains/msvc/NOTES.md` |
| win32-arm64 msvc | `//bazel/toolchains/msvc`（`@msvc_cc_arm64`）：clang-cl + lld-link + xwin aarch64 CRT/SDK（10.0.22621） | 与 win32-x64 相同的交叉链接和**静态 CRT**；`ring` 通过一个 GNU 驱动风格的 `clang` 适配程序构建，opus 则假定有 NEON（无 RTCD）；二进制文件在 `windows-11-arm` 上进行冒烟测试 |

Rust 工具链为 nightly（固定在 `MODULE.bazel` 中），并在 `//bazel/toolchains` 中对 musl 进行仓库本地重新注册，携带显式的 `@zig_sdk//libc:musl` 约束（否则 rules_rust 生成的 gnu 和 musl 工具链会共享 (os, cpu) 约束）。

darwin-arm64 插件内嵌 Apple Foundation Models 桥接（`crates/natives/src/applefm/bridge.swift`，Swift 6.4，针对 macOS 27 SDK），由 `applefm_bridge` 规则使用 `//bazel/toolchains/swift` 工具链构建：mac 执行宿主使用从宿主检测到的 Xcode/Command Line Tools Swift（`@applefm_swift`），linux 执行宿主使用固定的 swift.org Ubuntu 22.04 版 Swift 6.4.0（`@swift_linux`），针对 `@macos_sdk`，并由 `@llvm_darwin_tools` 的 ld64.lld 链接。只要版本匹配，开源编译器就能读取 SDK 的 `.swiftinterface`；它需要将 `-resource-dir` 指向 Linux corelibs 模块映射之外的位置，并设置 `-I <sdk>/usr/lib/swift/shims`（参见 `bazel/toolchains/swift/linux.bzl`）。没有工具链时（x86_64，或没有 Swift 6.4 + SDK 27 的 mac），桥接是一个空文件，插件报告为未构建。mac 宿主上若设置 `OMP_APPLEFM_SWIFTC`，它就是唯一候选；候选不可用会使构建（cargo 和 Bazel）失败，而不是回退到 Xcode/CLT 或空文件；`OMP_APPLEFM_DISABLE=1` 完全跳过检测（无桥接，也不探测宿主工具链），且与 `OMP_APPLEFM_SWIFTC` 冲突。Nix 构建在 Darwin 上设置两者之一：nixpkgs 包装的 Swift，或在 `withAppleFm = false` 时设置 `DISABLE`。AppKit/ScreenCaptureKit 辅助程序（`darwin_helper`）使用最终解析到的 darwin cc 工具链编译。

Linux 宿主上的 Darwin Rust 链接从 `//bazel/toolchains/darwin:rustc_sdk_env` 接收 `SDKROOT`；原生 macOS 链接保留 Xcode 发现机制。Swift 的 `@swift_darwin_resources` 覆盖层公开编译器的 Clang 头文件和 SDK 的真实 Swift 运行时目录，不带 Linux 模块映射。只有这个小型跨仓库符号链接覆盖层不缓存；编译器和 SDK 下载仍分别独立缓存。

### 4) 第三方 crate（`crate_universe`） \{#4-third-party-crates-crate_universe}

`@crates//...` 从工作区 `Cargo.toml`/`Cargo.lock` 生成，严格限制为八个 Bazel 目标三元组（包括 `aarch64-pc-windows-msvc`）。特定 crate 的构建修复以 `crate.annotation` 形式位于 `MODULE.bazel` 中（参见下文的调试指南）。

根模块有意省略 `crate_universe` 的可选渲染锁。因此扩展是不可复现的，Bazel 会在 `MODULE.bazel.lock` 中记录其完整结果，以 `Cargo.toml`、`Cargo.lock`、每个成员清单以及 `crate.*` 标签的哈希为键。只要该条目仍有效，干净的输出基目录（每个 CI pod）就会复用它，绝不求值该扩展。这些输入中任何一个发生变化后（每次发布版本提升、每次依赖编辑），每个新服务器都会改为用 `cargo-bazel splice` 重新拼接工作区：每个 CI 作业约 240 s，结果正确。因此必须刷新该条目，并与 Cargo 更改一并提交：

```bash
bun run gen:bazel-lock                  # bazelisk fetch --repo=@crates --lockfile_mode=update; needs bazelisk
bun scripts/gen-bazel-lock.ts --check   # bazel fetch --repo=@crates --lockfile_mode=error; requires bazelisk/bazel
```

`scripts/release.ts` 会在重新生成 `Cargo.lock` 后刷新它。`bazel_lock` CI 作业（托管运行，在包括 PR 的每个事件上执行）会因条目过期而失败，并上传刷新的 `MODULE.bazel.lock` 产物。过期损失的是速度，而不是正确性，因此不会阻止发布。

## 本地开发 \{#local-development}

### 构建插件 \{#building-addons}

```bash
# Addon for the current host (x64 hosts pick modern vs baseline via AVX2
# detection), installed into packages/natives/native/. The host target builds
# through the local cargo/napi-rs backend by default; set
# OMP_NATIVE_BUILD_BACKEND=bazel (or pass bazel args after `--`) for bazel:
bun --cwd=packages/natives run build          # = bun ../../scripts/bazel-natives.ts host --dest native
# same, from the repo root:
bun run build:native

# The driver directly — targets are //:natives-* names plus pseudo-targets
# host / all / darwin-all:
bun scripts/bazel-natives.ts <target>... [--dest <dir>] [-- <extra bazel args>]
bun scripts/bazel-natives.ts linux-x64-baseline linux-x64-modern --dest packages/natives/native
bun scripts/bazel-natives.ts darwin-all

# Or bazelisk directly (outputs stay in bazel-bin, nothing is installed):
bazelisk build //:natives-darwin-arm64
bazelisk build //:natives-all
```

除非通过 `OMP_NATIVE_BUILD_BACKEND=bazel` 或额外 Bazel 参数请求 Bazel，否则驱动程序会通过本地 cargo/napi-rs 路径（`packages/natives/scripts/build-bindings.ts`）构建 `host`。Cargo 路径也会重新生成声明和 ESM/枚举导出。`OMP_NATIVE_BUILD_BACKEND=cargo` 强制使用这个仅限宿主的路径；Windows 宿主始终使用它，无法构建显式 Bazel 交叉目标。`OMP_NATIVE_CARGO_PROFILE` 选择 Cargo 配置（默认 `local`；`ci` 会剥离符号）。对于显式目标，它为所有请求目标运行一次 `bazel build`，通过 `bazel cquery --output=files` 定位输出（回退到 `bazel-bin/natives-<t>/<canonical>.node` 路径约定），并解引用后复制到 `--dest`（默认 `packages/natives/native`）。`--` 后的额外参数会原样传给 bazel。它从 `PATH` 解析 `bazelisk`（或 `bazel`），并将 `OMP_BAZEL_RC` 环境变量作为 `--bazelrc=` 启动选项使用（CI 以此注入缓存连接配置）。

将 `all` 构建到同一目标目录会使 musl 插件覆盖 gnu 插件（basename 相同），驱动程序会拒绝；请分开调用并使用不同的 `--dest` 目录。

驱动程序还支持 `--source <dir>`，无需调用 Bazel，即可安装按 `natives-<target>/<canonical>.node` 排列的预构建输出。此模式不能接受额外 Bazel 参数。安装在原子重命名前为临时副本写入戳记；早于戳记机制的产物被该路径接受时，可以保持未加戳状态。对于宿主可加载的目标，驱动程序会运行一个超时为 60 秒的子进程加载探针，并在有戳记时检查报告的版本。

### 重新生成类型定义（napi CLI，仅开发用） \{#typedef-regeneration-napi-cli-dev-only}

`native/index.js`/`index.d.ts` **已提交到仓库**，因此 Bazel 产物构建从不需要 napi CLI。Rust API 改变后，若要显式重新生成（默认使用 Cargo 后端的宿主构建也执行此步骤）：

```bash
bun --cwd=packages/natives run build:bindings   # = bun scripts/build-bindings.ts
```

这会针对 `crates/natives` 运行 napi CLI（仅限宿主，本地 cargo 配置），安装重新生成的 `index.d.ts`，规范化插件文件名，并通过 `gen-enums.ts` 重新渲染显式 ESM 导出和运行时枚举对象。请提交生成的 `index.js`/`index.d.ts` 更改。

### 可选启用的远程缓存（`.bazelrc.user`） \{#opt-in-remote-cache-bazelrcuser}

`.bazelrc` 以 `try-import %workspace%/.bazelrc.user` 结束（该文件被 git 忽略）。CI 远程缓存由 vmon 节点仅向其自身沙箱提供，因此本地请使用磁盘缓存或自己的远程缓存：

```
# .bazelrc.user
build --disk_cache=~/.cache/bazel-disk
# or: build --config=cache-ro --remote_cache=<your cache URL>
```

`.bazelrc` 中的 `cache-ro`/`cache-rw` 只携带策略（上传开关、`--remote_local_fallback`、重试/超时，以确保缓存故障不会使构建失败）；端点始终由使用方提供。

## CI \{#ci}

### 分离 Rust 验证与插件生成 \{#split-rust-validation-and-addon-production}

`.github/workflows/ci.yml` 将 `rust_validate` 与插件作业分离：`native_addons` 生成 linux-x64 的两个插件，`native_addons_cross`（仅非 PR）生成其他所有目标，包括 darwin；每个插件都在 Linux 上构建。TypeScript 作业只依赖 `native_addons`。

**拉取请求从不构建或验证 Rust。** 影响原生部分的 PR 足够少，不值得在 PR 侧进行 bazel 构建：完全跳过 `rust_validate`（`if: github.event_name != 'pull_request'`），而 `native_addons` 从 actions/cache 恢复 main 为相同原生源代码构建的 linux-x64 两个插件（`natives-linux-x64-v1-<hash>`，哈希涵盖每个原生构建输入：Cargo/Bazel/工具链设置，以及 `crates/**` 和根目录 `BUILD.bazel`）。没有精确条目时（PR 更改了原生输入，或 main 尚未构建该状态），使用 main 的最新条目；完全没有条目时，则使用最新的 `@oh-my-pi/pi-natives-linux-x64` npm 发布版本。它会对两个插件进行冒烟加载，将其作为 `natives-linux-x64` 工作流产物上传，并在插件与源代码不匹配时发出通知。加载器对工作区加载跳过版本哨兵，因此这些插件都能在较新的检出目录下正常加载；该构建之后新增的符号会是一个抛错桩，指明插件及重新构建命令，而不是 `undefined`。如果 PR 的 TypeScript 测试依赖它自己的原生更改，就会明显失败；Rust 侧在合并到 main 后验证，并在发布时再次验证。只有 main 保存缓存条目（其他引用的条目在别处无法读取，但仍计入仓库 10 GB 配额），并删除除最新两个之外的所有条目。

在非 PR 事件上，三个作业都在 vmon 沙箱（`vmon-large/from=omp-ci`）中运行，使用共享远程缓存。`rust_validate` 运行：

```bash
bazelisk --bazelrc="$rc" test //crates/...                 # full Rust suite
# clippy scope mirrors `cargo clippy --workspace` (libraries, plus omp-shell's
# `obash` binary in the strict set), split by
# lint policy via a query kind filter:
bazelisk query "kind('rust_library|rust_shared_library|rust_binary', //crates/ast/... + //crates/diff/... + //crates/edit/... + //crates/iso/... + //crates/natives/... + //crates/shell/... + //crates/vcs/... + //crates/voice/... + //crates/xfs/...)" \
  | xargs bazelisk --bazelrc="$rc" build --config=clippy-strict --
bazelisk query "kind('rust_library|rust_shared_library', //crates/... - (…strict set…) - //crates/builtins/...)" \
  | xargs bazelisk --bazelrc="$rc" build --config=clippy --
bazelisk query "kind('rust_library|rust_shared_library', //crates/builtins/...)" \
  | xargs bazelisk --bazelrc="$rc" build --config=clippy-ported --
bazelisk --bazelrc="$rc" build --config=rustfmt //crates/...
```

- `--config=clippy` = rules_rust clippy aspect + `-Dwarnings`；`--config=clippy-strict` 为具有 `[lints] workspace = true` 的 crate 叠加生成的 `bazel/clippy.bazelrc`。
- 选择接入的 crate 还设置 `lint_config = "//bazel/lints:workspace_lints"`。clippy aspect 在 `-Dwarnings` 之前应用该策略，因此即使严格查询遗漏某个 crate，`--config=clippy` 也会对任何被调度的目标执行工作区 lint。如果包含 `[lints] workspace = true` 的 `crates/*/Cargo.toml` 缺少 `lint_config`，或定义了 `.github/workflows/ci.yml` 未调度进行 Clippy 检查的目标（例如严格列表之外的 `rust_binary`），`bun scripts/gen-clippy-bazelrc.ts --check` 会失败。
- `--config=clippy-ported` 保持零 rustc 警告，同时允许移植后的 `omp-builtins` 清单所许可的 clippy 组。
- `--config=rustfmt` = 针对工作区 `rustfmt.toml` 的 rustfmt aspect。

在 main 上，`native_addons` 构建 `NATIVES_X64_TARGETS`，`native_addons_cross` 并行构建 `NATIVES_CROSS_TARGETS`，各自每次调用构建一个目标，以避免并发链接导致 OOM；随后交叉构建作业检查两份列表合起来是否等于 `//:natives-all` 的 srcs，并检查 darwin-arm64 插件是否内嵌 Apple Foundation Models 桥接 dylib，同时既不链接 Swift 运行时，也不链接 FoundationModels（插件仅在 macOS 27+ 上 dlopen 桥接）。TS 扇出只等待这两个插件。`native_addons` 将两个插件作为 `natives-linux-x64` 上传；`native_addons_cross` 将其余所有插件作为 `native-addons` 上传。下游作业使用 `.github/actions/native-artifacts`：它下载 `natives-linux-x64`，只有请求的目标不在这两个插件中时才添加 `native-addons`，并在不调用 Bazel 的情况下安装请求的目标集。

Bazel 原生作业无需工具链设置：bazelisk、Bazel 和已预热的仓库缓存已预装在 vmon `omp-ci` 模板中（`infra/vmon/omp_ci_template.py`），而 Bazel 以密闭方式获取 Rust/zig/LLVM/xwin/Swift 和 macOS SDK（SDK 解包需要模板中的 python3）。`macos-15` 和 `windows-11-arm` 只运行发布冒烟测试，不构建任何内容。

### Bun 存储预热器 \{#bun-store-warmer}

`.github/workflows/bun-cache-warm.yml` 为共享 bun 存储条目填充数据，PR 作业恢复该条目但从不保存。它仅在可能改变该条目的推送上触发（`bun.lock`、`bun-install` action）。

### `bazel-cache` action（`.github/actions/bazel-cache`） \{#bazel-cache-action-githubactionsbazel-cache}

缓存连接配置的单一事实来源，以 bazelrc 片段（其 `rc` 输出）形式提供，使用方通过 `bazelisk --bazelrc=...` 或 `OMP_BAZEL_RC` 传入。每个 Bazel 作业都在 vmon runner（`VMON_CI=1`）上运行，选择 `--config=ci` 加上模板预装的仓库/xwin 缓存（`/opt/bazel-repo-cache`）；当节点提供 Bazel 缓存（设置了 `VMON_CACHE_URL`）时，会添加 `--remote_cache=$VMON_CACHE_URL/bazel`，在分支/标签事件上配合 `--config=cache-rw`，在拉取请求上配合 `--config=cache-ro`。不在 vmon 上时，该片段只携带 `--config=ci`，构建不使用缓存。

### 原生产物 action \{#native-artifact-actions}

`.github/actions/native-artifacts` 无需构建即可安装插件：下载 `natives-linux-x64`（其他目标再加上 `native-addons`）→ `scripts/bazel-natives.ts --source`，在运行它的任意宿主上将版本写入每个插件（已签名的 darwin 插件会原地刷新临时签名的页面哈希，因此 Linux 作业也能给 darwin 插件加戳）。

### 发布二进制构建与发布 \{#release-binary-builds-and-publishing}

二进制构建只负责构建，与测试扇出并行运行。`release_binary` 在同一个 `ubuntu-22.04` 镜像上构建每个二进制文件（bun 交叉编译每个目标），只依赖两个插件作业，由其工作流产物提供插件。随后 darwin 分支使用 `scripts/ci-macos-sign.sh` 签名（rcodesign：存在 `APPLE_*` 秘密时使用 Developer ID + 公证，否则使用临时签名；参见 `docs/macos-signing-notarization.md`）。发布前，`release_smoke` 矩阵会在各自平台上下载每个二进制文件，并运行 `--version` 和 `--smoke-test`：linux 使用 `ubuntu-22.04` / `ubuntu-24.04-arm`（musl 在 Alpine 容器内），darwin 使用 `macos-15-intel` / `macos-15`（先执行 `codesign --verify --strict`，存在 `APPLE_*` 秘密时还断言不是临时签名），win32 使用 `windows-2025` / `windows-11-arm`。

## 调试指南 \{#debugging-playbook}

### 产物位置与检查方法 \{#where-things-land--how-to-inspect}

```bash
# Outputs (workspace-relative): bazel-bin/natives-<target>/pi_natives.<...>.node
bazelisk cquery --output=files //:natives-linux-x64-baseline

# What actions/flags a target produces (add the same --config flags as the build):
bazelisk aquery 'outputs(".*\.node", deps(//:natives-linux-arm64))'
bazelisk aquery 'mnemonic("Rustc", deps(//crates/natives:pi_natives))'

# Which toolchain resolved (e.g. confirm @msvc_cc, not host cc, for win32):
bazelisk cquery 'deps(//:natives-win32-x64-baseline)' | grep msvc_cc

# Keep the sandbox dir + print the full command line of a failing action:
bazelisk build --sandbox_debug --verbose_failures //:natives-<t>

# Analyze without building (cheap cross-target sanity check):
bazelisk build --nobuild //:natives-win32-x64-baseline
```

`scripts/bazel-natives.ts` 实时流式传输 bazel stderr，失败时再输出末尾 40 行；cquery 步骤失败时，它会回退到 `bazel-bin` 路径约定。

### 常见失败类型（在初始调通期间出现，修复已在仓库中，再次出现时可引用） \{#common-failure-classes-seen-during-bring-up--fixes-already-in-tree-cite-when-they-resurface}

| 现象 | 原因 | 修复（仓库中已有） |
| --- | --- | --- |
| musl 构建“成功”但不生成 `.node` | musl 默认为 `+crt-static`；rustc 静默地不生成 cdylib | `crates/natives/BUILD.bazel` 中的 `-Ctarget-feature=-crt-static` select |
| Opus 对象文件引入宿主 UBSan 运行时 | zig cc 默认启用 UBSan | `opusic-sys` 注解（`MODULE.bazel`）中的 `CFLAGS=-fno-sanitize=undefined` |
| blake3 msvc：找不到 `ml64.exe` | cc-rs 在非 windows 宿主上从构建脚本 PATH 解析 MASM | `@msvc_cc` 中的 `bin/ml64.exe → llvm-ml -m64` 适配程序，通过 `blake3` 注解 PATH 前置 |
| `opusic-sys` msvc 需要交叉 CMake 工具链 | 内附 Opus 在 Linux/macOS 上配置为 Windows 目标 | 通过 `CMAKE_TOOLCHAIN_FILE_x86_64_pc_windows_msvc` 使用 `@msvc_cc` 的 `toolchain.cmake`；sys crate 选择 Ninja、静态试编译和 `/MT` |
| 一般的 win32 链接异常 | 未指定统一原因 | 先阅读 `bazel/toolchains/msvc/NOTES.md`：包装器自身定位、`lld-link` 风格/驱动链接行为、`LIB`、`/MT` 静态 CRT 选择、xwin 展开文件集注意事项 |
| `rust_test(crate = ...)` 在宏展开时报“can't find crate” | 仅 rmeta 的流水线依赖破坏了 macro_rules 重新导出的测试框架编译 | rust pipelined_compilation 保持关闭（见 `.bazelrc` 注释） |
| 构建脚本找不到 cmake/ninja | `--incompatible_strict_action_env`，不泄露宿主环境 | 在 crate 注解（`MODULE.bazel`）中显式设置 `PATH`，而不是使用宿主环境 |
| 构建脚本找不到依赖生成的头文件（tree-sitter 中的 `wasm.h`） | rules_rust 0.71.3 写入的 `DEP_<links>_*` out_dir 路径带有依赖方从不解析的 `${out_dir}` token | `bazel/patches/rules_rust-dep-env-exec-root-paths.patch`（`MODULE.bazel` 中的 `single_version_override`）使其保持相对于执行根目录 |

### 缓存行为 \{#cache-behavior}

- **vmon：** 节点的逐仓库 Bazel HTTP 缓存（`$VMON_CACHE_URL/bazel`；分支和标签作业写入，拉取请求读取）。`--remote_local_fallback` 加上重试，使故障降级为本地执行，而不是使构建失败。
- **GitHub 托管：** 无远程缓存，也无 Bazel 构建；PR 运行从 actions/cache 恢复 main 的 linux-x64 两个插件。
- **darwin 仓库：** `@llvm_darwin_tools`（约 2 GiB LLVM 23.1.3）、`@swift_linux`（约 1.1 GiB Swift 6.4.0）和 `@macos_sdk`（约 70 MiB Command Line Tools 包）以 sha256 固定，使用仓库缓存，并选择启用仓库内容缓存。SDK 输入集约 50k 个文件，会暂存到每个 darwin 编译/链接沙箱中。
- **msvc 仓库：** 约 2 GiB 的 LLVM 下载以 sha256 固定，并使用仓库缓存；约 1 GiB 的 xwin CRT/SDK 展开文件集在仓库规则内从 Microsoft CDN 获取，**不**使用仓库缓存，因此冷输出基目录会重新下载，除非 `OMP_XWIN_CACHE_DIR` 和仓库内容缓存持有它（CI 中二者都预装在 `omp-ci` 模板内）。Microsoft 会随时间推进 VS 通道载荷，因此 MS 更新后，win32 action 的远程缓存命中率会平缓下降（之前的交叉工具链也具有相同特性）。Win32 链接 action 也不跨宿主 OS 共享缓存条目（linux 与 mac 的 clang 二进制文件不同）。
- 缓存布局、策略和投毒边界：`infra/docs/03-caching.md`。

## 目标/变体模型与命名约定 \{#targetvariant-model-and-naming-conventions}

## 平台标签 \{#platform-tag}

构建和运行时都使用平台标签：

`<platform>-<arch>`（例如：`darwin-arm64`、`linux-x64`）。

## 变体模型（仅 x64） \{#variant-model-x64-only}

x64 支持 CPU 变体，在平台上编码为 `//bazel/variants` 约束值（baseline → `-Ctarget-cpu=x86-64-v2`，modern → `x86-64-v3`）：

- `modern`（支持 AVX2 的路径）
- `baseline`（回退）

非 x64 使用单个默认产物，不带变体后缀。不存在构建时变体_开关_：每个变体都是独立的 `//:natives-*` 目标，而 `host` 伪目标通过 AVX2 检测选择 modern 或 baseline。

### 输出文件名 \{#output-filenames}

- x64：`pi_natives.<platform>-<arch>-modern.node` 或 `...-baseline.node`
- 非 x64：`pi_natives.<platform>-<arch>.node`

运行时 x64 候选顺序还包括不带后缀的默认文件名，排在所选变体候选之后。

## 运行时标志 \{#runtime-flags}

- `PI_NATIVES_DIR`：在 XDG/默认路径之前覆盖原生插件提取/暂存根目录；加载器追加包版本。值会被去除首尾空白、展开 `~` 并规范化；空值或相对值被忽略。下载的 tree-sitter 语法位于其 `grammars/` 子目录中，加载器将该目录传给插件，版本清理不会触碰它；其他应用数据仍留在通常位置。该目录必须只有运行 `omp` 的用户可写：复用检查只检查文件大小，且版本哨兵在插件加载后才读取，因此另一个用户植入的同样大小文件会被加载。
  多个 `omp` 版本共享的目录受正常的过期版本清理影响：较新版本成功加载后会删除空闲十分钟的较旧版本目录，因此长时间运行的旧版本若其目录被删除，会在下一次新进程启动时重新提取。
- `PI_NATIVE_VARIANT`：x64 运行时覆盖；有效值为 `modern` 和 `baseline`。无效值被忽略；检测前先查询继承的变体缓存。
- `PI_DEBUG_STARTUP`：在加载器入口、内嵌提取、候选加载和原生 Tokio 运行时安装前后，向 stderr 同步写入 `[startup] native:…` 标记；可用来定位启动挂起。
- `PI_COMPILED`：编译模式信号。发布编译将 `process.env.PI_COMPILED` 常量折叠为 `"true"`；已填充的内嵌插件清单和 Bun 内嵌 URL 标记也表示编译模式。

## 嵌入生命周期（`embed-native.ts`） \{#embed-lifecycle-embed-nativets}

`compileCodingAgent`（`packages/coding-agent/scripts/compile-binary.ts`）针对二进制目标调用 `embeddedAddonFiles()`，并将结果交给 `Bun.build({ files })`。不会写入 `native/` 下的任何内容；已检入的 `embedded-addon.js` 保持为 null 桩。

1. **初始化**：平台标签来自编译目标（本地构建为 `CROSS_TARGET`，发布构建为发布矩阵条目，否则为宿主）。
2. **候选集**：
   - x64 查找 `modern` 和 `baseline` 文件；
   - 非 x64 查找一个默认文件。
3. **校验可用性**：`packages/natives/native` 中必须至少存在一个预期文件。
4. **校验版本并生成帧和清单**：每个可用插件必须包含当前版本戳记或旧式版本哨兵。将每个插件压缩为各自独立的内存 `native/<addon>.node.zst` zstd 帧（级别 19，变体并行处理），并构建内存中的 `native/embedded-addon.js` 替代内容，包含包版本、文件名、解压后大小和帧路径。
5. 编译模式的**运行时提取已就绪**。

帧是插件字节的纯函数：没有容器、文件名或时间戳。因此，若某次发布的插件只改变版本戳记，嵌入字节几乎完全相同，连续两个二进制文件只在插件变化的位置存在差异。不要重新向内嵌数据中引入 tar/gzip 或逐构建元数据。

这些覆盖有意保留在内存中：`Bun.build` 共享运行时的目录缓存，缓存未命中时不会重新读取，因此如果构建进程在向 `native/` 写入帧之前导入了 omp-natives，就无法解析这些帧。

## 开发工作流与交付/编译行为对比 \{#dev-workflow-vs-shippedcompiled-behavior}

## 本地开发工作流 \{#local-development-workflow}

典型本地循环：

1. 构建插件：`bun --cwd=packages/natives run build`。
2. 在工作区检出目录中，加载器跳过 npm 叶子包，按文件名先解析包本地 `native/` 候选，再解析可执行文件目录候选。已安装的包则先探测平台叶子包。
3. `native/index.d.ts` 中生成的声明描述公共 TS API。默认使用 Cargo 后端的宿主构建会重新生成它们；Rust API 改变后，`build:bindings` 显式执行相同生成操作。
4. Windows 包安装时，加载器先将 `node_modules` 插件复制到带版本的缓存中，避免运行中的进程锁住 Bun 在后续全局更新中必须替换的文件。
5. 成功加载后，会尽力移除 mtime 至少早于当前十分钟的较旧 `major.minor.patch` 缓存目录；清理失败从不导致启动中止。

## 交付/编译后二进制文件工作流 \{#shippedcompiled-binary-workflow}

在编译模式下（`PI_COMPILED`、Bun 内嵌 URL 标记，或已填充的内嵌清单）：

1. 加载器计算带版本的缓存目录：`<getNativesDir()>/<packageVersion>`。根目录优先采用 `PI_NATIVES_DIR`（去除首尾空白、展开 `~` 并规范化；忽略空值或相对值），然后在 `$XDG_DATA_HOME/omp` 已存在时采用 `$XDG_DATA_HOME/omp/natives`，否则采用 `~/.omp/natives`。
2. 如果内嵌清单与平台和版本匹配，且有可选择的文件，加载器会将所有缺失或大小错误的清单文件，从其内嵌的 `<addon>.node.zst` 帧解压到该带版本的目录。
3. 运行时候选顺序包括：
   - 提取后的带版本缓存路径（若可用），
   - 带版本的缓存目录，
   - 旧式编译二进制目录（Windows 上为 `%LOCALAPPDATA%/omp`，其他平台为 `~/.local/bin`），
   - 包/可执行文件目录。
4. 返回第一个成功加载且通过发布校验（包括旧式身份/兼容性规则）的插件。

这就是打包与运行时加载器预期必须一致的原因：文件名、平台标签、CPU 变体和内嵌清单版本必须匹配 `native/loader-state.js` 所探测的内容。

## JS API ↔ Rust 导出映射（构建健全性检查子集） \{#js-api--rust-export-mapping-build-sanity-subset}

生成的声明当前包含来自以下 Rust 模块的导出：

| 领域 | 代表性 JS 导出 | Rust 源文件 |
| --- | --- | --- |
| 搜索/工作区 | `grep`、`search`、`hasMatch`、`fuzzyFind`、`glob`、`listWorkspace` | `grep.rs`、`fd.rs`、`glob.rs`、`workspace.rs`（遍历/搜索位于 `omp-xfs`） |
| AST/块/摘要 | `astGrep`、`astEdit`、`blockRangeAt`、`summarizeCode` | `ast.rs`、`block.rs`、`summary.rs` |
| 文本/高亮/token | `visibleWidth`、`truncateToWidth`、`highlightCode`、`countTokens` | `text.rs`、`highlight.rs`、`tokens.rs` |
| Shell/PTY/进程/按键 | `executeShell`、`Shell`、`PtySession`、`Process`、`parseKey` | `shell.rs`、`pty.rs`、`ps.rs`、`keys.rs` |
| 媒体/系统/iso | `encodeSixel`、`copyToClipboard`、`detectMacOSAppearance`、`PowerAssertion`、`getWorkProfile`、`isoBackend`、`isoStart`、`isoDiff` | `sixel.rs`、`clipboard.rs`、`appearance.rs`、`power.rs`、`prof.rs`、`iso.rs` |

## 失败行为与诊断 \{#failure-behavior-and-diagnostics}

## 构建时失败 \{#build-time-failures}

- Bazel 分析/编译失败：`scripts/bazel-natives.ts` 显示退出码及 stderr 末尾内容；直接重新运行打印的 `bazel build` 行（添加 `--verbose_failures`、`--sandbox_debug`）进行迭代。
- 未知目标名：驱动程序报错，并列出完整已知目标列表（`//:natives-*` 名称及 `host`/`all`/`darwin-all`）。
- 构建成功后未定位到 `.node` 输出：驱动程序以 1 退出（手动检查 `bazel cquery --output=files`）。
- basename 冲突（一次调用中同时有 gnu 和 musl）：驱动程序拒绝安装，并指出两个源，应拆分到不同的 `--dest` 目录。
- `build:bindings`（napi）失败：脚本显示非零退出和 stderr；产物构建不受影响（Bazel 从不运行 napi CLI）。

## 运行时加载器失败（`native/loader-state.js`） \{#runtime-loader-failures-nativeloader-statejs}

- 不受支持的平台标签：探测失败后抛出异常，列出支持的平台列表。
- 没有候选可加载：抛出异常，包含完整候选错误列表和模式专属的修复提示。
- 内嵌提取和 Windows 暂存问题：解压/mkdir/写入/复制错误会被记录，加载失败时纳入最终诊断。
- 版本不匹配：安装/编译加载通常要求通过戳记或旧式哨兵提供包版本。没有发布身份的哨兵机制之前的插件，可以通过加载器的狭窄兼容性检查。驱动程序安装、本地绑定构建和 Nix 构建会给产物加戳；复制到别处的原始 `bazel-bin` 输出未加戳，不报告版本。工作区加载跳过发布校验。

## 故障排查矩阵 \{#troubleshooting-matrix}

| 现象 | 可能原因 | 验证 | 修复 |
| --- | --- | --- | --- |
| 每个候选都出现 `Cannot find module` 或动态库加载错误 | 缺少发布产物、平台标签错误，或编译缓存过期 | 检查加载器错误列表和 `packages/natives/native` 文件名 | 构建正确目标（`bun scripts/bazel-natives.ts <t> --dest packages/natives/native`）；删除该包版本的过期缓存 |
| 运行时缺少导出，但 TypeScript 中存在 | 加载了过期的 `.node`，生成的声明比二进制文件新，或 Rust 导出未编译 | require 实际候选并检查 `Object.keys(mod)` | 重新构建原生包，移除过期的候选/缓存路径 |
| x64 机器预期加载 modern，却加载了 baseline | `PI_NATIVE_VARIANT=baseline`、未检测到 AVX2，或 modern 文件不可用 | 检查环境变量和 `native/` 中的文件名 | 构建并交付 modern 目标（`bun scripts/bazel-natives.ts linux-x64-modern --dest packages/natives/native`） |
| gnu 插件被 musl 覆盖（反之亦然） | 二者构建到同一目标目录，设计上就共享标准 basename | 对比 `bazel-bin/natives-<t>/` 源与已安装文件 | 分开调用，使用不同的 `--dest` 目录（发布矩阵已这样处理） |
| 编译后的二进制文件升级后失败 | 提取缓存过期、内嵌帧/大小不匹配，或内嵌清单版本不匹配 | 检查 `<getNativesDir()>/<version>` 和加载器错误列表 | 删除该包版本的带版本缓存；打包时重新生成内嵌帧/清单 |
| 二进制构建报 `No native addons found` 失败 | 嵌入前未构建所需平台产物 | 检查错误文本中的预期列表 | 为目标构建至少一个预期产物，然后重新运行二进制构建 |

## 运维命令 \{#operational-commands}

```bash
# Addon for the current host, installed into packages/natives/native/
bun --cwd=packages/natives run build

# Explicit targets (x64 variants are separate targets, not env switches)
bun scripts/bazel-natives.ts linux-x64-modern linux-x64-baseline --dest packages/natives/native

# Raw bazel (output: bazel-bin/natives-<t>/pi_natives.<...>.node)
bazelisk build //:natives-darwin-arm64

# Regenerate TS typedefs + enum exports (napi CLI, only on Rust API changes)
bun --cwd=packages/natives run build:bindings

# Compile a standalone binary embedding the host addon (CROSS_TARGET=<id> for another target)
bun --cwd=packages/coding-agent run build
```

## 编排器侧内容寻址构建缓存（robomp） \{#orchestrator-side-content-addressed-build-cache-robomp}

在 robomp 编排器（`python/robomp/`）中构建 `omp-natives` 时，工作区通过内容寻址缓存共享已构建产物，而不是在每个按 issue 划分的工作树中从头构建。该缓存**仅位于编排器侧**，`bun --cwd=packages/natives run build` 本身不变；缓存位于构建流水线外部，在 `python/robomp/src/natives_cache.py` 中围绕 `ensure_workspace` 和任务后成功路径填充/捕获。

### 缓存内容 \{#what-is-cached}

缓存以计算出的键，从 `packages/natives/native/` 捕获以下文件。正确复用假定纳入键的路径在工作树中的内容与已提交 `HEAD` 一致；由于键忽略未提交更改，否则从有未提交更改的键内路径构建的产物可能被捕获到未变化的键下，之后又从该键复用：

- `pi_natives.<platform>-<arch>[-variant].node`（glob `pi_natives.*.node`）
- `index.d.ts`
- `index.js`
- `embedded-addon.js`
- `manifest.json`（缓存元数据：键、目标三元组、捕获时间戳、源工作区、提交）

只有 `.node` glob 匹配且每个配套文件和清单均存在时，条目才被视为命中。GC 移除没有清单的目录和点前缀暂存目录；带清单但缺少配套文件的条目视为未命中，不会仅因此自动清除。

### 缓存键 \{#cache-key}

键是对以下输入的 `(path \t git-tree-hash \n)` 对按以下顺序（顺序重要）并在末尾追加目标三元组计算的 `sha256`：

1. `crates`（整个子树，omp-natives 传递依赖其他工作区 crate）
2. `Cargo.lock`
3. `Cargo.toml`
4. `rust-toolchain.toml`
5. `packages/natives`（整个子树，构建脚本、`scripts/*`、package.json）

树哈希来自针对 `HEAD` 的一次 `git cat-file --batch-check` 调用；`HEAD` 中缺失的路径以固定空哈希参与计算，使键在不包含全部输入的仓库间仍保持确定性。非 x64 的目标后缀为 `<platform>-<arch>`。x64 上为 `<platform>-<arch>-<TARGET_VARIANT>`，未设置 `TARGET_VARIANT` 时为 `<platform>-<arch>-host`；Python 缓存不执行 AVX2 检测。

此输入集之外的任何内容（如 `MODULE.bazel`/`BUILD.bazel` 等 Bazel 定义文件、宿主 glibc、目标后缀之外的环境变量）都**不**在键中。内容哈希描述的也是已提交 `HEAD`，而不是未提交的工作树更改。键外或未提交的构建输入更改后，应删除相应缓存条目；提交五个键内路径之一的更改会自动生成新键。

### 布局与所有权 \{#layout-and-ownership}

- 根目录：`/data/cache/pi-natives`（由 `entrypoint.sh` 与 cargo 缓存一起配置，所有权为 `root:omp`，模式 `02770` 带 setgid，使缓存文件继承 `gid=omp`，并始终可被每个槽位用户读取）。
- 逐仓库子目录：`<root>/<repo-slug>/`，其中 slug 为 `owner__repo`（对应 `SandboxManager.pool_path`）。
- 逐条目目录：`<root>/<repo-slug>/<sha256-key>/`，包含缓存文件及 `manifest.json`。
- 逐仓库锁文件：`<root>/<repo-slug>/.lock`（建议性 `fcntl.flock`，捕获和 GC 时独占）。
- 捕获期间使用暂存目录（`.<key>.tmp.<pid>`）；原子重命名为最终条目路径。捕获崩溃遗留的过期暂存目录在 GC 时清理。

### 填充与捕获语义 \{#populate-and-capture-semantics}

- **填充**（工作区 ← 缓存）在 `ensure_workspace` 内运行。键命中时，`.node` 被**硬链接**到工作区（零复制，共享 inode）；配套的 `index.d.ts` / `index.js` / `embedded-addon.js` 则被**复制**（独立 inode），因为绑定重新生成流程（`build-bindings.ts` 的 `installGeneratedBindings` 和 `gen-enums.ts`）通过 `open(..., 'w')` 重写这些文件，即原地截断，否则会通过硬链接传播并损坏缓存。跨设备硬链接失败（`EXDEV`）时回退到复制。
- **捕获**（缓存 ← 工作区）在构建生成完整产物集后，从任务后成功路径运行。捕获使用**复制**而非硬链接：硬链接槽位所有的工作区文件会保留缓存 inode 上的槽位 UID 所有权，破坏共享组模型。复制通过带 setgid 的缓存根目录创建新的 root 所有、`gid=omp` 的 inode。捕获在逐仓库 flock 下是幂等的：同一键的并发捕获返回已有条目。

### 垃圾回收 \{#garbage-collection}

`WorkerPool` 中运行周期性 GC 循环，每个仓库有两个上限。超过任意上限时，先丢弃最旧的条目（按 `manifest.json.captured_at`）：

- 条目数量上限（`max_entries_per_repo`，默认 8）
- 字节上限（`max_bytes`，默认 4 GiB）；小于或等于零的值将其禁用，且按字节上限驱逐时始终至少保留一个条目，即使该条目本身就超过上限。

GC 之前已硬链接 `.node` 的工作区通过内核 inode 引用计数保留访问能力，对缓存条目执行 `rmtree` 不会删除工作区中的文件。

### 配置（`robomp.config.Settings` 上的设置） \{#configuration-settings-on-robompconfigsettings}

| 环境变量 | 默认值 | 效果 |
| --- | --- | --- |
| `ROBOMP_NATIVES_CACHE_ENABLED` | `true` | 总开关。为 false 时，填充/捕获钩子无操作，每个工作区从头构建。 |
| `ROBOMP_NATIVES_CACHE_ROOT` | `/data/cache/pi-natives` | 缓存根目录。必须为 `root:omp 02770`，以支持跨槽位读取。 |
| `ROBOMP_NATIVES_CACHE_MAX_ENTRIES_PER_REPO` | `8` | 每个仓库 slug 的 LRU 条目数量上限。 |
| `ROBOMP_NATIVES_CACHE_MAX_BYTES` | `4294967296`（4 GiB） | 每个仓库 slug 的字节上限；≤0 时禁用，且至少保留一个条目。 |
| `ROBOMP_NATIVES_CACHE_GC_INTERVAL_SECONDS` | `3600` | `WorkerPool` 中后台 GC 循环的周期；≤0 禁用周期性 GC（捕获仍会回收）。 |

### 手动失效 \{#manual-invalidation}

- 一个键：`rm -rf /data/cache/pi-natives/<repo-slug>/<sha256>`。
- 一个仓库：`rm -rf /data/cache/pi-natives/<repo-slug>`。
- 全部：`rm -rf /data/cache/pi-natives/*`（保留根目录，使其 setgid 模式得以保留）。
- 卡住的锁：`rm /data/cache/pi-natives/<repo-slug>/.lock`（仅在没有编排器进程触碰该仓库时）。

对于固定目标后缀，`crates/`、`Cargo.lock`、`Cargo.toml`、`rust-toolchain.toml` 或 `packages/natives/` 下已提交的 `HEAD` 更改会自动导致未命中。改变平台/架构，或 x64 上的 `TARGET_VARIANT`，也会选择不同的键。仅编辑未提交的工作树既不会改变 `HEAD` 哈希，也不会改变键。
