---
title: "将热点路径移植到 omp-natives"
description: "Oh My Pi 官方仓库文档：将热点路径移植到 omp-natives。"
---

# 将热点路径移植到 `omp-natives` \{#porting-hot-paths-to-omp-natives}

本文为贡献者介绍如何将经测量确认的 JS/TS 热点路径移入 `crates/natives`，并通过 `@oh-my-pi/pi-natives` 公开。

## 决定是否移植 \{#decide-whether-to-port}

当原生代码能够消除已证实的 CPU、阻塞 I/O、分配或平台集成成本，且边界能够保持以数据为导向时，可以移植。如果工作高度依赖 JS 对象身份、动态导入、回调应用状态，或原生转换成本抵消了收益，则保留 JS。

从行为兼容的 JS 基线和有代表性的输入开始。原生导出即使存在，但速度更慢或行为不同，也不算成功的移植。

## 当前包与构建划分 \{#current-package-and-build-split}

此包没有 `packages/natives/src/<module>` 封装层。它的入口点为：

- 立即加载的根入口：`native/index.js`，以及生成的 `native/index.d.ts`；
- 延迟加载的桌面封装：`native/desktop.js` / `desktop.d.ts`；
- 延迟加载的剪贴板封装：`native/clipboard.js` / `clipboard.d.ts`；
- 延迟加载的 Windows 路径封装：`native/path.js` / `path.d.ts` (`@oh-my-pi/pi-natives/path`)；其他平台不加载，直接原样返回输入；
- 延迟加载的 vcs 封装：`native/vcs.js` / `vcs.d.ts` (`@oh-my-pi/pi-natives/vcs`)。

VCS 子路径通过 `git`、
`repo`、`repoForDisplay`、`require`、`requireGit` 和 `jj` 公开发现及 Git/Jujutsu 操作，另提供元数据、
克隆/分离/补丁辅助函数和错误判定函数。根路径相同时，`repoForDisplay` 优先选择 Jujutsu；
需要保证 Git 安全性的自动化则使用 `repo`。

两条命令用途不同：

- `bun --cwd=packages/natives run build:bindings` 为宿主运行 napi-rs，安装本地变体插件和生成的声明，并重新生成显式 ESM/枚举导出。Rust 公共类型接口变化时使用此命令。
- `bun --cwd=packages/natives run build` 调用 `scripts/bazel-natives.ts host --dest native`。宿主目标默认通过本地 cargo/napi-rs 后端构建，因此也会重新生成声明和导出；`OMP_NATIVE_BUILD_BACKEND=bazel` 则选择 Bazel，它不会更改这些已提交文件。

发布构建使用 Bazel 目标，并在各平台的叶子包中发布 `.node` 文件。核心发布重写会移除插件，并注入根据 `gen-npm-packages.ts` 中的 `LEAF_TARGETS` 生成、版本同步的可选依赖。

## 设计 N-API 边界 \{#design-the-n-api-boundary}

1. 将实现放在负责该功能的 `crates/natives/src/<module>.rs` 中；在 `lib.rs` 中注册新模块。
2. 可行时，将计算保留在普通 Rust 函数中，再公开一个薄层 `#[napi]` 边界。
3. 优先使用拥有所有权的 N-API 兼容值：`String`、向量、类型化数组，以及 `#[napi(object)]` 选项/结果结构体。避免使用生命周期无法跨越 N-API 工作的借用型公共输入。
4. 除非有意设计的公共名称需要 `js_name`，否则让 napi-rs 应用默认的 snake_case 到 camelCase 名称转换。
5. 保留 JS 契约：null/undefined 的区别、顺序、错误与结果语义、回调时机，以及同步与 Promise 行为。

### 工作调度与取消 \{#work-scheduling-and-cancellation}

- 对 CPU 密集型或阻塞工作使用 `task::blocking(tag, cancel_token, work)`。它返回 `AsyncTask`，对工作进行性能分析，并在 panic 跨越异步工作 FFI 边界之前捕获它。
- 对 Tokio 异步 I/O 使用 `task::future(env, tag, future)`。它通过 `Env::spawn_future` 返回 `PromiseRaw`。
- 当公共选项公开 `timeoutMs` 或 `AbortSignal` 时，构造 `task::CancelToken::new(timeout_ms, signal)`，并在阻塞循环中按有意义的间隔调用 `heartbeat()`。取消是协作式的；从不检查的令牌不会停止工作。
- 不要在模块初始化中创建运行时或工作线程池。JS 加载器会在动态加载器锁释放后，执行可选的加载后步骤 `__ompInstallTokioRuntime`。

参照调度/错误形式相同的现有导出，而不是引入第二套约定。

## 端到端检查清单 \{#end-to-end-checklist}

### 1. 实现并公开 \{#1-implement-and-expose}

- 添加 Rust 逻辑，并在需要时为纯粹的不变量添加针对性的 Rust 测试。
- 添加 `#[napi]` 项及对象/枚举类型。
- 在 `crates/natives/src/lib.rs` 中注册新模块。
- 如果移植使用另一个第一方 crate，按照原生构建要求，将依赖添加到 `crates/natives/Cargo.toml` 及其构建系统输入中。

### 2. 重新生成并检查绑定 \{#2-regenerate-and-inspect-the-binding}

运行：

```bash
bun --cwd=packages/natives run build:bindings
```

然后验证：

- `native/index.d.ts` 包含预期的 JS 名称、精确的输入/结果类型、回调形式，以及同步/Promise 返回；
- `native/index.js` 中带标记的生成块包含类/函数导出；
- 更改的枚举同时具备声明和字面量运行时对象。

`gen-enums.ts` 通过读取顶层 `export declare class`、`export declare function` 和枚举声明来推导导出。声明中没有的项不会成为具名的根 ESM 导出。

### 3. 有充分理由时才添加延迟加载入口点 \{#3-add-a-lazy-entrypoint-only-when-justified}

根入口会立即加载插件。如果工作线程必须在不承担该启动成本的情况下导入，请遵循现有的延迟加载子路径模式：

- 小型 JS 封装在导出函数内部调用 `loadNative()`；
- 配套的 `.d.ts` 导入/重新导出根类型；
- `package.json#exports` 同时提供 `types` 和 `import` 路径。

不要仅为重命名生成的根导出而添加封装。

### 4. 干净地迁移使用方 \{#4-migrate-consumers-cleanly}

- 从 `@oh-my-pi/pi-natives` 导入生成的根符号或有意设计的延迟加载子路径。
- 针对边界情况，将结果和错误与 JS 基线进行比较。
- 在同一变更中切换所有预期调用方，并移除过时实现。
- 当原生原语不负责面向用户的策略和渲染时，将它们保留在使用方中。

### 5. 对代表性工作进行基准测试 \{#5-benchmark-representative-work}

在负责该功能的包中放置可长期使用的基准测试（`packages/natives/bench`、`packages/coding-agent/bench` 或其他现有包的 bench 目录）。在同一进程中，对相同的预备输入运行 JS 和原生实现。当调用方可以复用准备过程时，将设置/转换与计时操作分开。

```ts
const ITERATIONS = 2_000;

function bench(name: string, fn: () => void): number {
	const start = Bun.nanoseconds();
	for (let i = 0; i < ITERATIONS; i++) fn();
	const elapsedMs = (Bun.nanoseconds() - start) / 1e6;
	console.log(`${name}: ${elapsedMs.toFixed(2)}ms (${(elapsedMs / ITERATIONS).toFixed(6)}ms/op)`);
	return elapsedMs;
}

bench("feature/js", () => jsImpl(sample));
bench("feature/native", () => nativeImpl(sample));
```

对于返回 Promise 的操作，使用异步基准循环并等待每次调用；不要只测量 promise 的创建时间。

### 6. 验证加载的产物 \{#6-verify-the-loaded-artifact}

针对刚构建的插件运行范围明确的场景。诊断候选项不匹配时，检查加载器报告的候选路径：

```bash
bun -e 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url); const mod = require(process.argv[1]); console.log(Object.keys(mod).sort())' -- /path/to/pi_natives.<tag>[-variant].node
```

确认导出存在，且 `__piNativesBuildVersion()` 报告新构建插件的包版本。标准驱动程序还会在子进程中探测已安装且宿主可加载的插件，超时为 60 秒。不要为必需导出添加可选的使用方检查来掩盖产物不匹配。

## 常见失败 \{#common-failures}

### 过时变体或缓存被优先选中 \{#stale-variant-or-cache-wins}

对于现代宿主，x64 候选顺序为现代版 → 基线版 → 无后缀版；对于基线宿主，则为基线版 → 无后缀版。编译和暂存的 Windows 加载还可能在包路径之前，从 `<getNativesDir()>/<version>` 中优先选中。根入口首先遵循 `PI_NATIVES_DIR`（去除首尾空白、展开 `~` 并规范化；忽略空值或相对值），然后在 `$XDG_DATA_HOME/omp` 存在时使用 `$XDG_DATA_HOME/omp/natives`，否则使用 `~/.omp/natives`。

只移除加载器诊断所识别的过时本地产物/缓存，然后重新构建。加载成功后，加载器会尽力删除较旧的 `major.minor.patch` 缓存目录，但仅限 mtime 距当前至少十分钟的目录；它会保留当前版本目录。

### 声明已变更，但交付的插件未变更 \{#declarations-changed-but-shipping-addon-did-not}

`build:bindings` 和默认使用 Cargo 后端的 `build` 会重新生成宿主声明和导出。使用 Bazel 后端的 `build` 及显式 CI/发布目标只生成产物，不重新生成这些文件。既要验证生成并纳入版本控制的输出，也要验证场景实际使用的二进制文件。

### 同版本但不完整的插件 \{#same-version-incomplete-addon}

发布标记证明的是发布版本，而不是完整的导出集合。本地生成的同版本二进制文件可能通过加载，却缺少新生成的成员。检查实际候选项的 `Object.keys` 并重新构建它；不要削弱调用方。

### 缺少运行时枚举 \{#runtime-enum-missing}

单靠 napi-rs 枚举声明不会提供根入口的字面量运行时对象。运行 `build:bindings` 并验证生成块。如果 `gen-enums.ts` 无法解析声明形式，应修复生成器，而不是手动编辑带标记的块。

### 错误的同步/异步假设 \{#wrong-syncasync-assumption}

以 `native/index.d.ts` 为准。例如，`renderSnapcompactPng` 返回 `Promise<string>`，而 `snapcompactSupportedChars` 是同步的。改变调用方式的移植需要有意迁移使用方。

## 完成标准 \{#completion-criteria}

只有当生成的声明和 ESM 导出与 Rust API 匹配、预期使用方已使用它、过时 JS 代码已移除、针对构建插件的实际定向调用成功，且有代表性的对比显示行为和性能可接受时，移植才算完成。
