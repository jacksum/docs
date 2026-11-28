---
title: "原生模块架构"
description: "Oh My Pi 官方仓库文档：原生模块架构。"
---

# 原生模块架构 \{#natives-architecture}

`@oh-my-pi/pi-natives` 将 JavaScript ESM 加载器与 Rust Node-API 插件结合起来：

1. **包/加载器层**选择、加载并验证正确的 `.node` 插件，然后暴露生成的具名 ESM 导出。
2. **Rust N-API 层**实现这些导出，并提供 napi-rs 生成的 TypeScript 声明。

## 权威文件 \{#authoritative-files}

- `packages/natives/package.json`
- `packages/natives/native/index.js` 和 `index.d.ts`
- `packages/natives/native/loader-state.js` 和 `loader-state.d.ts`
- `packages/natives/native/desktop.js` 和 `desktop.d.ts`
- `packages/natives/native/clipboard.js` 和 `clipboard.d.ts`
- `packages/natives/native/path.js` 和 `path.d.ts`
- `packages/natives/native/vcs.js` 和 `vcs.d.ts`
- `packages/natives/native/desktop-adapter.js`
- `packages/natives/native/version-sentinel.js`
- `packages/natives/native/embedded-addon.js`
- `packages/natives/scripts/build-bindings.ts`
- `packages/natives/scripts/embed-native.ts`
- `packages/natives/scripts/gen-enums.ts`
- `packages/natives/scripts/gen-npm-packages.ts`
- `scripts/bazel-natives.ts`
- `crates/natives/src/lib.rs` 及其模块

## 包入口点 \{#package-entrypoints}

该包导出五个入口点：

| 导入 | 运行时 | 类型 | 加载行为 |
| --- | --- | --- | --- |
| `@oh-my-pi/pi-natives` | `native/index.js` | `native/index.d.ts` | 立即加载插件，然后绑定每个生成的类/函数和枚举对象。 |
| `@oh-my-pi/pi-natives/desktop` | `native/desktop.js` | `native/desktop.d.ts` | 暴露 `createDesktopSession(options)`、`desktopEscapeStops(key)`、`forgetDesktopEscapeStops(key)`、`closeDesktopEventTaps()` 和 `desktopWindowRoster()`；插件加载推迟到调用时。 |
| `@oh-my-pi/pi-natives/clipboard` | `native/clipboard.js` | `native/clipboard.d.ts` | 暴露惰性的 `copyToClipboard` 和 `readImageFromClipboard` 包装器。 |

其他惰性入口点是 `@oh-my-pi/pi-natives/path`（`native/path.js` / `path.d.ts`）和 `@oh-my-pi/pi-natives/vcs`（`native/vcs.js` / `vcs.d.ts`）。路径包装器只在执行 Windows 路径操作时加载，在其他平台上原样返回输入。VCS 包装器在第一次执行由原生实现支撑的操作时记忆绑定；其错误谓词和监听辅助函数可以在不加载插件的情况下导入。

不存在 `packages/natives/src` 包装层。大多数根导出直接绑定 N-API 值；`DesktopSession` 经过 `desktop-adapter.js`，后者原样返回当前类，否则替换为在构造时抛出异常的 `UnsupportedDesktopSession` 类。因此，过时插件错误会推迟到 `new DesktopSession()` 时发生，不模拟旧版 ABI，使非桌面根导入仍可使用。惰性子路径会将加载推迟到需要原生功能时。

当前根入口的能力包括：

- 搜索、glob 匹配、工作区扫描、AST 匹配/编辑、代码摘要、语法高亮、文本布局、令牌计数和结构化差异；
- shell、PTY、进程、文件锁、隔离和工作配置档案原语；
- 桌面捕获/输入/无障碍功能、剪贴板、音频采集/播放、实时 WebRTC、设备检查、SIXEL、snapcompact 渲染和向量排序；
- PDF 检查/Markdown 转换、SVG 栅格化、Mermaid 终端渲染、macOS 拼写服务、词语预测，以及进程内 Git/Jujutsu 操作；
- 流式编辑会话和共享编辑状态、原生 OAuth 回调注册，以及 Apple Foundation Models 桥接。

## 加载器和分发 \{#loader-and-distribution}

`native/index.js` 调用 `loader-state.js` 中的 `loadNative()`。平台标签为 `${process.platform}-${process.arch}`。支持的标签如下：

- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`
- `win32-x64`
- `win32-arm64`

x64 构建有 `modern`（x86-64-v3/AVX2）和 `baseline`（x86-64-v2）变体。`PI_NATIVE_VARIANT=modern|baseline` 可覆盖自动检测。自动检测在 Linux 上读取 `/proc/cpuinfo`，在 macOS 上调用 `sysctl`，在 Windows 上通过 Bun FFI 使用 `IsProcessorFeaturePresent(40)`，FFI 不可用时回退为 PowerShell。后续工作线程和子进程通过私有环境条目 `__PI_NATIVE_VARIANT_CACHE` 继承检测结果。非 x64 构建使用无后缀的文件名。

文件名回退顺序为：

- modern x64：`-modern.node`，然后 `-baseline.node`，然后无后缀的 `.node`；
- baseline x64：`-baseline.node`，然后无后缀的 `.node`；
- 非 x64：只使用无后缀的 `.node`。

发布的核心包包含加载器 JS、声明和元数据，但不包含 `.node` 文件。发布流程会生成 `@oh-my-pi/pi-natives-<platform>-<arch>` 可选依赖叶子包，并以相同版本将它们注入核心清单。`gen-npm-packages.ts` 中的 `LEAF_TARGETS` 是权威的发布目标列表。

### 候选项的归属和顺序 \{#candidate-ownership-and-order}

对于正常安装的包，会先探测平台叶子包，再探测核心包的 `native/` 目录和 `process.execPath` 目录。工作区开发跳过叶子包解析，使本地产物优先。

通过非空的内嵌清单、`PI_COMPILED` 或 `import.meta.url` 中的 Bun 内嵌标记检测编译模式。该模式先探测按版本划分的缓存和旧版用户数据目录，再探测包/可执行文件位置。`getNativesDir()` 首先遵循 `PI_NATIVES_DIR`（去除首尾空白、展开 `~` 并规范化；忽略空值或相对值），然后只在 `$XDG_DATA_HOME/omp` 已存在时使用 `$XDG_DATA_HOME/omp/natives`；否则使用 `~/.omp/natives`。

非空清单为每个内嵌变体引用一个 `<addon>.node.zst` zstd 帧。提取只接受清单中仅含基本名称的文件名，将缺失或大小不正确的文件原子解压到 `<getNativesDir()>/<version>`，并验证其大小。在 Windows 的 `node_modules` 安装中，加载器改为将叶子包/核心包插件暂存到该版本目录，使运行中的进程不会锁定 Bun 在更新期间需要替换的副本。

插件成功加载后，加载器会尽力移除以较旧 `major.minor.patch` 发布版本命名、且修改时间至少已过十分钟的缓存目录。准备过程会刷新该时间戳，以保护并发提取/暂存。当前版本、未来版本、预发布版本、非版本目录以及近期活动的目录会保留。

## 加载验证和运行时初始化 \{#load-validation-and-runtime-initialization}

安装和编译模式的候选项通常需要通过 `__piNativesBuildVersion()` 或旧版发布哨兵报告 `package.json#version`。没有发布标识的哨兵机制出现前的插件也可通过一项范围有限的兼容性检查，涵盖令牌计数、shell 执行、文本宽度和旧版桌面方法，前提是磁盘文件不带有预期的当前戳记。版本并非编译进去：`scripts/stamp-native-version.ts` 在链接后将其写入固定的占位槽位，这发生在支持戳记的 `scripts/bazel-natives.ts` 安装、本地 Cargo 绑定构建和 Nix 包构建（`nix/package.nix`）期间，因此发布版本递增不会重新编译插件 crate。工作区加载跳过此检查。加载器不会验证完整的符号列表。

在 `require(...)` 和版本验证之后，如果存在 `__ompInstallTokioRuntime()`，加载器就会调用它。Rust 有意避免在持有动态加载器锁的 `#[module_init]` 期间创建工作线程。加载后钩子安装有界的 Windows Tokio/Rayon 池；没有该钩子的旧插件使用 napi-rs 默认值。钩子失败按尽力而为处理，只有启用启动标记时才会出现在其中。

设置 `PI_DEBUG_STARTUP`，可在插件加载、提取和运行时安装前后向 stderr 同步输出 `[startup]` 标记。

## Rust 模块归属 \{#rust-module-ownership}

`crates/natives/src/lib.rs` 注册当前模块：

- 平台/运行时：`appearance`、`clipboard`、`crash_handler`、`desktop`、`devicecheck`、`file_lock`、`oauth_callback`、`power`、`prof`、`ps`、`pty`、`shell`、`spelling`、`tty_writer`、`vcs`；
- 媒体/实时/模型：`applefm`、`audio`、`live`、`predict`、`sixel`、`snapcompact`、`svg`；
- 代码/数据：`ast`、`block`、`diff`、`edit`、`fd`、`glob`、`grep`、`highlight`、`html`、`keys`、`mermaid`、`pdf`、`summary`、`text`、`tokens`、`utok`、`vectors`、`workspace`；
- 隔离/任务支持：`iso`、`task`，以及 N-API 边界/转换辅助模块（`js`、crate 私有的 `utils`、仅测试使用的 `testing`）；
- 从 `omp_ast::language` 重新导出的语言元数据。

Rust 的 `#[napi]` 函数、类、对象和枚举生成声明接口。默认的 snake_case Rust 名称会变成 camelCase JavaScript 名称。

## 职责边界 \{#ownership-boundaries}

- **包/脚本**负责二进制选择、CPU 变体、可选叶子包解析、内嵌提取、Windows 暂存、桌面 ABI 验证、声明和显式 ESM 导出。
- **`omp-natives` 及支持 crate**负责算法、原生资源、平台行为、取消和 N-API 转换。
- **使用方**负责更高层的工具策略、渲染、产物，以及未编码在原语中的面向用户的回退。

支持 crate 的映射参见 [`native-crates.md`](./native-crates.md)。准确的加载器诊断参见 [`natives-addon-loader-runtime.md`](./natives-addon-loader-runtime.md)。

## 运行时流程 \{#runtime-flow}

1. 使用方导入立即加载的根入口或惰性子路径。
2. `loadNative()` 计算模式、平台、变体、文件名和有序候选项。
3. 内嵌提取或 Windows 暂存可能会在前面插入一个缓存候选项。
4. 按顺序 require 候选项，并对安装/编译模式加载验证发布戳记。
5. 运行可选的加载后运行时钩子，然后尽力清理过期缓存版本。
6. 根入口绑定生成的具名导出；惰性子路径通过包装器调用选定的绑定。
7. 调用方调用 N-API 函数/类；napi-rs 执行参数和结果转换。
