---
title: "原生绑定契约（JavaScript/TypeScript 侧）"
description: "Oh My Pi 官方仓库文档：原生绑定契约（JavaScript/TypeScript 侧）。"
---

# 原生绑定契约（JavaScript/TypeScript 侧） \{#natives-binding-contract-javascripttypescript-side}

本页定义 `@oh-my-pi/pi-natives` 调用方与其 N-API 插件之间的公共 JS/TS 边界。权威的公共根接口为 `packages/natives/native/index.d.ts` 加上 `native/index.js` 中的显式 ESM 导出；未出现在其中的 Rust 内部实现不属于包 API。

## 契约层次 \{#contract-layers}

1. `crates/natives/src/**/*.rs` 定义 `#[napi]` 函数、类、对象和枚举。
2. `bun --cwd=packages/natives run build:bindings` 运行 napi-rs，安装主机插件和生成的 `native/index.d.ts`，然后运行 `gen-enums.ts`。
3. `gen-enums.ts` 读取声明，将 napi-rs 的 `const enum` 声明改写为可在运行时使用的声明，并将 `native/index.js` 中的标记块替换为显式类/函数导出及字面量枚举对象。
4. `native/index.js` 加载插件并绑定该生成的根接口。`DesktopSession` 经由 `desktop-adapter.js`，后者原样返回当前类，否则替换为在构造时抛出异常的 `UnsupportedDesktopSession` 类。这会将过时插件错误推迟到 `new DesktopSession()` 时发生，不模拟旧版 ABI，使非桌面根导入仍可使用。

不存在 `NativeBindings` 声明合并生命周期，也不存在 `packages/natives/src/<module>` 包装器约定。加载器检查安装/编译模式加载的发布标识（有一项范围有限的哨兵机制出现前的兼容性例外），而不是每个公共符号；加载的插件省略的函数导出为 `missingNativeExport(name)`：在当前插件上是 `undefined`，在过期的工作区插件上则是会抛出异常的桩函数，指出插件和重新构建命令（`bun run build:native`）。

## 公共入口点 \{#public-entrypoints}

`packages/natives/package.json` 导出：

| 入口 | 公共值 |
| --- | --- |
| `@oh-my-pi/pi-natives` | 来自 `native/index.js` / `index.d.ts` 的生成根类、函数和枚举对象。导入时立即加载。 |
| `@oh-my-pi/pi-natives/desktop` | `createDesktopSession(options): DesktopSession`、`desktopEscapeStops(key): number`、`forgetDesktopEscapeStops(key): void`、`closeDesktopEventTaps(): void` 和 `desktopWindowRoster(): DesktopRosterWindow[]`；插件加载推迟到调用时。 |
| `@oh-my-pi/pi-natives/clipboard` | `copyToClipboard(text)` 和 `readImageFromClipboard()`，以及 `ClipboardImage` 类型；插件加载推迟到调用时。 |

另外两个公共子路径是惰性的：

- `@oh-my-pi/pi-natives/path`：`expandWindowsLongPath(path)` 和 `getWindowsShortPath(path)`；只在 Windows 上执行原生加载，其他平台则原样返回输入。
- `@oh-my-pi/pi-natives/vcs`：仓库发现/要求检查（`git`、`repo`、`repoForDisplay`、`require`、`requireGit`、`gitInfo`、`jj`、`isPureJj`）、克隆/分离/补丁辅助函数、VCS 错误谓词以及 `watch`。由原生实现支撑的调用会加载并记忆插件。根目录相同时，`repoForDisplay` 优先选择 Jujutsu；`repo` 保留对 Git 安全的发现优先级。

包使用方不要导入未导出的 `native/*` 实现路径。

## 按归属划分的当前根接口 \{#current-root-surface-by-owner}

| 类别 | 代表性公共导出 | Rust 归属 | 调用风格 |
| --- | --- | --- | --- |
| 搜索和工作区 | `grep`、`search`、`hasMatch`、`fuzzyFind`、`glob`、`listWorkspace` | `grep.rs`、`fd.rs`、`glob.rs`、`workspace.rs` | 同步/promise 混合 |
| AST 和代码结构 | `astGrep`、`astMatch`、`astEdit`、`blockRangeAt`、`nodeChainAt`、`enclosingBlockBoundaries`、`summarizeCode`、`wasmGrammarFor` | `ast.rs`、`block.rs`、`summary.rs`、`grammars.rs` | 同步/promise 混合 |
| 编辑引擎 | `EditSession`、`EditStore`、编辑检查/差异/语法辅助函数、hashline 辅助函数、`notebookToEditableText` | `edit.rs`、`crates/edit` | 混合 |
| OAuth 回调 | `NativeOAuthCallback` | `oauth_callback/mod.rs` | 类/promise |
| Apple Foundation Models | `appleFmAvailability`、`appleFmGenerate`、`appleFmCancel` | `applefm/mod.rs` | promise、句柄/回调、同步 |
| Mermaid 渲染 | `renderMermaidAscii` | `mermaid/mod.rs` | 同步 |
| 差异和向量 | `diffLines`、`diffWords`、`diffLineRuns`、`structuredPatchHunks`、`DiffStream`、`cosineSimilarityPairs`、`mmrRerankIndices`、`vectorIndexTopK` | `diff.rs`（核心位于 `omp-diff`）、`vectors.rs` | 同步变换；混合式 `DiffStream` |
| Shell 和 PTY | `executeShell`、`Shell`、`PtySession` | `shell.rs`、`pty.rs` | 类/promise |
| 进程和文件 | `Process`、`FileLock`、`execReplace` | `ps.rs`、`file_lock/mod.rs` | 类/混合 |
| 桌面和剪贴板 | `DesktopSession`、`copyToClipboard`、`readImageFromClipboard` | `desktop/mod.rs`、`clipboard.rs` | 类、同步、promise |
| 音频和实时媒体 | `AudioCapture`、`AudioPlayback`、`LiveWebRtcPeer` | `audio.rs`、`live.rs` | 类/混合 |
| 文本和高亮 | `wrapTextWithAnsi`、`truncateToWidth`、`sliceWithWidth`、`extractSegments`、`visibleWidth`、`setHangulCompatJamoWidthOverride`、`highlightCode`、`HighlightStream`、语言查询 | `text.rs`、`highlight.rs` | 同步 |
| 转换和渲染 | `htmlToMarkdown`、`pdfToMarkdown`、`rasterizeSvg`、`encodeSixel`、`renderSnapcompactPng`、`snapcompactSupportedChars` | `html.rs`、`pdf.rs`、`svg.rs`、`sixel.rs`、`snapcompact.rs` | 同步/promise 混合 |
| 令牌和系统 | `countTokens`、`truncateToTokens`、macOS 外观、跨平台电源导出、`getWorkProfile`、`deviceCheckGenerateToken` | `tokens.rs`、`appearance.rs`、`power.rs`、`prof.rs`、`devicecheck.rs` | 混合 |
| 拼写（macOS） | `macOSCheckSpelling`、`macOSAutocorrectWord`、`macOSSpellingGuesses`、`macOSSpellCheckerAvailable` | `spelling.rs` | 同步/promise 混合 |
| 词语预测 | `TextPredictor`（`ngram`、`smollm` 及仅 macOS 的 `apple` 引擎；由 omp 守护进程的 `predict` 模块提供给编辑器） | `predict.rs`、`crates/predict` | 类/promise |
| 版本控制 | `vcsDiscover`、`vcsGitClone`、`vcsDetachGitDir`、`vcsJoinPatches`、`vcsValidateHunkSelections`、`VcsRepo`、`VcsGitRepo`、`VcsJjWorkspace` | `vcs.rs` | 同步/promise 混合 |
| 终端输出 | `TtyWriter`、`isolateThreadStartsFromConsole` | `tty_writer.rs`、`console_threads.rs` | 类、同步 |
| 控制台输入（Windows） | `enableConsoleVtInput`、`restoreConsoleInputMode`、`translateWindowsAltGrSequence` | `console_input.rs`、`altgr.rs` | 同步 |
| 隔离 | `isoBackend`、`isoProbe`、`isoResolve`、`isoIsUnavailableError`、`isoStart`、`isoStop`、`isoDiff` | `iso.rs` | 同步/promise 混合 |
| 按键 | `parseKey`、`matchesKey`、Kitty/旧版辅助函数 | `keys.rs` | 同步 |

准确的选项/结果字段和签名参见 `native/index.d.ts`。值得注意的当前签名包括 `renderSnapcompactPng(...): Promise<string>`、`readImageFromClipboard(): Promise<ClipboardImage | undefined | null>`，以及类型化数组形式的向量输入/结果。

`ShellOptions`、`ShellRunOptions` 和 `ShellExecuteOptions` 接受注入的 `ShellFilesystem`。其错误优先的 `handler` 返回 `Promise<ShellFsResponse>`，文件系统失败编码为 `error` 数据。`nativeLocalPaths: true` 对所有主机路径绕过处理器，只将 URL 路径发送给它；未设置/为 false 时，将所有路径路由到处理器。其可选的错误优先 `onFileChange` 会为命令内置操作或重定向更改的每个主机文本文件接收一个 `ShellFileChange`。某次运行专用的文件系统只在该次运行中替换会话文件系统。

现有导出中较新的接口成员（均在 `native/index.d.ts` 中）：

- `ShellRunResult.workingDir?`：命令完成后的 shell 工作目录（16.3.0 新增），使宿主无需隐藏的探测命令即可同步 cwd。
- `GrepOptions.maxCountPerFile?`：内容模式下的每文件匹配上限（15.10.11 新增）。注意，`GrepOptions` 没有 `cache` 字段；目录 grep 始终不缓存（`FuzzyFindOptions`/`GlobOptions` 带有选择启用的 `cache` 标志）。
- `snapcompactSupportedChars(font, chars)`：字体字形能力探测（16.2.7 新增）。

## 同步、Promise 和回调规则 \{#sync-promise-and-callback-rules}

调用风格是公共契约的一部分：

- CPU 密集型/阻塞 API 通常通过 napi-rs 任务返回 promise，包括 `grep`、`glob`、`fuzzyFind`、AST 搜索/编辑、`summarizeCodeAsync`、snapcompact 渲染和 HTML 转换。
- 基于 Tokio 的操作，例如 shell、PTY、隔离生命周期、设备检查、桌面操作和实时媒体，在声明规定的位置使用 promise。
- 内存内变换和直接探测通常保持同步：`search`、`hasMatch`、块边界、文本/布局辅助函数、差异、向量排序、高亮、按键解析以及隔离探测/解析辅助函数。
- 有状态的资源是类。其构造函数和各个方法可能具有不同的同步/异步行为；应使用声明，而不是假定整个类都是异步的。

将公共函数在同步与返回 promise 之间切换属于破坏性变更。例如，`renderSnapcompactPng` 必须等待，即使相邻的 snapcompact 字符探测是同步的。

由 napi-rs `ThreadsafeFunction` 生成的回调参数使用错误优先形式，例如 `(error: Error | null, value) => void`。流式 API 返回 promise 时，其回调不会替代该 promise。`appleFmGenerate` 则返回数字类型的取消句柄，并通过回调流式发送 JSON 事件。准确的时序和可选性因导出而异。

## 对象、枚举和二进制数据 \{#objects-enums-and-binary-data}

`#[napi(object)]` 结构体会变成 TS 接口，例如搜索结果、AST 载荷、shell/PTY 结果、桌面选项/结果、音频/实时事件以及隔离记录。napi-rs 负责运行时转换；TypeScript 的可选性不会为无类型调用方提供语义验证。

当前生成的运行时枚举对象为：

- `AstMatchStrictness`
- `DiffSide`
- `Ellipsis`
- `Encoding`
- `FileType`
- `GrepOutputMode`
- `IsoBackendKind`
- `IsoChangeKind`
- `KeyEventType`
- `MacOSAppearance`
- `ProcessStatus`
- `ShellFsFileType`
- `ShellFsMissing`
- `ShellFsOp`
- `ShellFsResolve`

数值和字符串枚举声明约束 TypeScript 调用方，但本身不能证明任意无类型值在语义上有效。二进制 API 在声明规定的位置使用类型化数组（`Uint8Array`、`Float32Array`、`Float64Array`、`Uint32Array`）；没有显式转换时，不要用普通数组替代它们。

## 导入和错误行为 \{#import-and-error-behavior}

- 如果没有兼容的插件候选项加载成功，导入根入口会抛出异常。惰性子路径将该失败推迟到调用由原生实现支撑的操作时。
- 安装和编译模式的候选项通常需要通过戳记或旧版哨兵报告包版本。没有发布标识的哨兵机制出现前的插件，如果磁盘文件缺少预期的当前戳记，可以通过范围有限的核心/桌面兼容性检查。工作区开发候选项跳过此验证。
- 驻留的先前版本插件可能产生特定于重新启动的不匹配提示；磁盘上的过期文件则产生重新安装诊断。
- 加载器不会检查完整的导出集。因此，同版本的不完整构建可以加载，随后暴露出 `undefined` 成员。
- N-API 转换错误在 Rust 业务逻辑运行之前抛出异常或拒绝 promise。原生任务和异步失败通常会拒绝其 promise；`EditSession.apply` 则将引擎失败作为 `isError` 结果返回。

## 绑定更改检查清单 \{#binding-change-checklist}

1. 添加或更改所属的 Rust `#[napi]` 项；在 `crates/natives/src/lib.rs` 中注册新模块。
2. 导出的类型接口更改时，运行 `bun --cwd=packages/natives run build:bindings`。默认的基于 Cargo 的 `build` 也会重新生成声明/导出；基于 Bazel 的构建和显式目标产物构建则保持它们不变。
3. 确认 `native/index.d.ts` 具有预期的 JS 名称、类型、可选性、回调形式以及同步/promise 返回。
4. 确认 `native/index.js` 中的标记块包含该类/函数以及相应的枚举运行时对象。
5. 只在需要推迟加载时添加惰性子路径包装器，然后添加匹配的 `package.json#exports` 运行时/类型条目。
6. 更新所有直接使用方，并在原生路径成为标准实现时移除过时实现。
7. 运行有针对性的场景，针对新构建的插件导入并调用更改后的导出。
