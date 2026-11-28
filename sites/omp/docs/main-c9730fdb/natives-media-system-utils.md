---
title: "Natives 媒体与系统实用程序"
description: "Oh My Pi 官方仓库文档：Natives 媒体与系统实用程序。"
---

# Natives 媒体与系统实用程序 \{#natives-media--system-utilities}

本文介绍 `@oh-my-pi/pi-natives` 中的媒体、系统和转换导出：音频采集/播放与实时 WebRTC 媒体、终端 SIXEL 转换、SVG 栅格化、snapcompact PNG 渲染、HTML/PDF 转换、剪贴板访问、token 计数、DeviceCheck、macOS 外观/电源辅助函数，以及工作性能分析。

## 实现文件 \{#implementation-files}

- `crates/natives/src/audio.rs`
- `crates/natives/src/live.rs`
- `crates/voice/src/audio.rs` 和 `crates/voice/src/live.rs`（N-API 适配器背后的媒体引擎）
- `crates/natives/src/snapcompact.rs`
- `crates/natives/src/sixel.rs`
- `crates/natives/src/svg.rs`
- `crates/natives/src/pdf.rs`
- `crates/natives/src/web.rs`
- `crates/web/`（`omp-web` 阅读器引擎）
- `crates/natives/src/clipboard.rs`
- `crates/natives/src/tokens.rs`
- `crates/natives/src/utok/`（内嵌分词器实现和词表）
- `crates/natives/src/devicecheck.rs`
- `crates/natives/src/appearance.rs`
- `crates/natives/src/power.rs`
- `crates/natives/src/prof.rs`
- `crates/natives/src/task.rs`
- `packages/natives/native/index.d.ts`

插件中没有原生 `PhotonImage` 类或 `image.rs`。通用图像处理仍在 `Bun.Image` 中；原生图像接口提供 SIXEL 编码/解码、有边界的 SVG 栅格化，以及 snapcompact 帧渲染。文件系统隔离是独立的子系统。

## JS API ↔ Rust 导出/模块映射 \{#js-api--rust-exportmodule-mapping}

| JS 导出 | Rust N-API 导出 | Rust 模块 |
| --- | --- | --- |
| `new AudioCapture(sampleRate, cb)` | `AudioCapture` | `audio.rs` |
| `new AudioPlayback(sampleRate)` | `AudioPlayback` | `audio.rs` |
| `new LiveWebRtcPeer(...)` | `LiveWebRtcPeer` | `live.rs` |
| `encodeSixel(bytes, width, height, backgroundRgb)` | `encode_sixel` | `sixel.rs` |
| `encodeSixelAsync(bytes, width, height, backgroundRgb)` | `encode_sixel_async` | `sixel.rs` |
| `decodeSixelToPng(bytes)` | `decode_sixel_to_png` | `sixel.rs` |
| `rasterizeSvg(bytes, maxWidth, maxHeight)` | `rasterize_svg` | `svg.rs` |
| `pdfToMarkdown(bytes)` | `pdf_to_markdown` | `pdf.rs` |
| `renderSnapcompactPng(text, options)` | `render_snapcompact_png` | `snapcompact.rs` |
| `snapcompactSupportedChars(font, chars)` | `snapcompact_supported_chars` | `snapcompact.rs` |
| `renderHtml(html, options?)` | `render_html` | `web.rs` |
| `new Reader(options?)` | `Reader` | `web.rs` |
| `copyToClipboard(text)` | `copy_to_clipboard` | `clipboard.rs` |
| `readImageFromClipboard()` | `read_image_from_clipboard` | `clipboard.rs` |
| `countTokens(input, encoding?)` | `count_tokens` | `tokens.rs` |
| `detectMacOSAppearance()` | `detect_macos_appearance` | `appearance.rs` |
| `MacAppearanceObserver.start(cb)` | `MacAppearanceObserver::start` | `appearance.rs` |
| `PowerAssertion.start(options?)` | `PowerAssertion::start` | `power.rs` |
| `getWorkProfile(lastSeconds)` | `get_work_profile` | `prof.rs` |
| `deviceCheckGenerateToken()` | `device_check_generate_token` | `devicecheck.rs` |

## 数据格式边界与转换 \{#data-format-boundaries-and-conversions}

### 音频与实时 WebRTC \{#audio-and-live-webrtc}

- `AudioCapture(sampleRate, callback)` 打开默认麦克风，并以请求的逻辑采样率交付低延迟单声道 `Float32Array` PCM 块。`stop()` 立即释放采集资源。
- `AudioPlayback(sampleRate)` 打开默认扬声器。`write(samples)` 按顺序将单声道 `Float32Array` PCM 入队；`setGain(gain)` 改变渲染时增益，对已排队的采样也生效；`end()` 排空后关闭，而 `stop()` 立即丢弃已排队的音频。
- `LiveWebRtcPeer(onEvent, onLevel, onFailure)` 拥有一个用于 Codex 实时媒体的 WebRTC 对等连接。`createOffer()` 返回 SDP，`acceptAnswer(sdp)` 应用远端应答，`waitForOpen(timeoutMs?)` 等待 `oai-events` 数据通道（默认 20 秒）。`pushAudio(samples)` 通过有界队列接受 16 kHz 单声道 PCM；静音输入和会使队列溢出的输入会被丢弃。`setMuted()` 控制传输并丢弃不完整的静音帧；`close()` 异步销毁媒体、数据通道、对等连接和播放。
- N-API 模块适配回调/缓冲区；设备发现、转换、播放、WebRTC 和 Opus 媒体位于 `omp-voice` 中。TypeScript 宿主负责经过身份验证的信令和边带协议处理。

### SIXEL 图像编码（`sixel`） \{#sixel-image-encoding-sixel}

- **JS 输入边界**：包含已编码图像字节的 `Uint8Array`、目标像素尺寸，以及必需的终端背景 RGB 数值，以 `0xRRGGBB` 打包。
- **校验边界**：目标宽度和高度必须大于零；`backgroundRgb` 必须在 24 位范围内（`0x000000` 到 `0xffffff`）。
- **Rust 解码边界**：使用 `ImageReader::with_guessed_format()` 猜测格式，然后解码为 `DynamicImage`。
- **缩放边界**：只有源尺寸与 `targetWidthPx`/`targetHeightPx` 不同时才进行 Lanczos3 重采样。带 alpha 的图像在过滤前转换为 RGBA8 并原地预乘；不透明格式保留原生格式的缩放路径。
- **合成边界**：缩放后，将预乘的 RGB 与 `backgroundRgb` 合成，不再次应用 alpha。未缩放的图像保留直通 alpha 混合。部分透明的输出像素在调色板量化前变为不透明；完全透明的像素保持透明。
- **输出边界**：`encodeSixel(...)` 同步返回 SIXEL 转义字符串。`encodeSixelAsync(...)` 在原生阻塞线程池上执行相同转换，并返回 `Promise<string>`。

配置的 `image` 特性支持 PNG、JPEG、WebP、GIF 和 BMP 解码。目标尺寸无效（宽度或高度为 `0`）时，以 `Target SIXEL dimensions must be greater than zero` 失败；RGB 值超出范围时，以 `SIXEL background must be a packed 24-bit RGB color` 失败。终端背景 RGB 改变时应重新编码。

`decodeSixelToPng(bytes)` 同步将一个 SIXEL 控制字符串转换为 PNG 字节。它在解码前预检栅格声明、重复和行推进，然后再次检查解码后的尺寸。限制为输入/输出 20 MiB、每边 8192 像素，以及 4,194,304 个解码像素；格式错误或超限的输入会抛出异常。

### SVG 栅格化 \{#svg-rasterization}

`rasterizeSvg(bytes, maxWidthPx, maxHeightPx)` 接受 SVG/SVGZ，通过 `task::blocking("svg.rasterize", (), ...)` 返回 PNG 字节。它保留宽高比，从不放大，并将图像固有尺寸适配到给定边界内。边界必须为正，乘积不得超过 16,777,216 像素。基于文件的图像引用被禁用；仍支持内嵌 data URL。系统字体加载一次。无效输入、分配和 PNG 编码失败会导致拒绝；没有超时/signal 选项。

### PDF 转换 \{#pdf-conversion}

`pdfToMarkdown(bytes)` 在派发 `task::blocking("pdf.to_markdown", (), ...)` 前复制输入。`pdf-inspector` 提取带页码的 Markdown，并返回 `{ markdown, title?, pageCount, pagesNeedingOcr, hasEncodingIssues }`。OCR 页码从 1 开始；函数报告需要 OCR 的页面，而不执行 OCR。只有识别出 OCR 页面时，才接受缺失的 Markdown 并将其视为空字符串；否则会拒绝。解析/转换错误以 `PDF conversion failed: ...` 拒绝；没有超时/signal 选项。

### Snapcompact PNG 渲染 \{#snapcompact-png-rendering}

`renderSnapcompactPng(text, options)` 在有边界的位图上渲染预先规范化的文本，并异步返回 **base64 编码的 PNG 字符串**。N-API 传输类型是 `Latin1String`，但字符串包含 base64 文本，而不是原始单字节 PNG 数据；在将结果视为 PNG 字节前，应先进行 base64 解码。`options.size` 必需，且必须为 `1..16384`；可选控制项包括 `font`、`cellWidth`、`cellHeight`、`variant`、`lineRepeat`、`stretch` 和 `columns`。字体为 `"5x8"`（默认）、`"6x12"`、`"8x13"`、`"8x8"` 和 `"silver"`；变体为 `"sent"`（默认）和 `"bw"`；列数为 `1`（默认）或 `2`。输出高度贴合已使用的行，溢出的输入会被忽略。`U+000E`/`U+000F` 切换暗灰色笔墨而不占用单元格。`snapcompactSupportedChars(font, chars)` 保留受支持的字形和渲染器控制字符。

### HTML 转换（`renderHtml`、`Reader`） \{#html-conversion-renderhtml-reader}

阅读器引擎位于纯 `omp-web` crate（`crates/web`）中，通过
`crates/natives/src/web.rs` 绑定；它不进行网络访问。

- **JS 输入边界**：`renderHtml(html, options?)` 接受 HTML `string`
  及可选的 `{ format?: "markdown" | "text"; mode?: "auto" | "full"; hidden?: "drop" | "reachable" | "all"; images?: boolean; width?: number; baseUrl?: string }`。
- **Rust 转换边界**：渲染通过 `omp-web` 调度到原生阻塞
  线程池；此导出没有超时/中止选项。
- **输出边界**：Markdown 或纯文本 `string` promise。

转换行为：

- `format` 默认为 `markdown`；`mode` 默认为 `auto`，即选择
  主内容并移除模板内容的阅读器。`full` 则渲染整个
  文档。
- `hidden` 默认为 `drop`：除非请求 `reachable` 或
  `all`，否则丢弃隐藏内容。
- `images` 默认为 `true`；对于纯文本写入器，`width` 默认为 `250`，
  Markdown 写入器则忽略它。
- `baseUrl` 用于解析相对链接和图像来源。

Markdown 写入器输出 ATX 标题、折叠空白后的段落、
加粗/强调/代码/删除线/下标/上标、相对于 `baseUrl` 解析的链接（丢弃
`javascript:`）、嵌套列表和有序列表、引用块、带有从 class
推导的语言的 `pre`/`code`、`hr`、`br`、定义列表，以及针对
矩形行内单元格表格的 GFM 表格；布局表格会被展平为块。纯文本
写入器复现 `lynx -dump -nolist -width <width>` 布局（UTF-8、
默认样式），但不嵌入 Lynx 源码，也不实现其交互式
浏览器、网络访问、其他字符集或样式表。

`new Reader(options?)` 以无 I/O 状态机形式，针对 URL 驱动同一个
引擎。`open(url)` 和 `resolve(response)` 返回 `fetch`、`browse` 或 `done`
步骤，携带 `{ url, method, headers, body, maxBytes, purpose }` 请求或
页面/blob/失败输出；TypeScript 宿主执行 HTTP 请求或
无头浏览器加载，并解析完成每个步骤。引擎负责 user-agent
重试、机器人拦截墙和 JavaScript 空壳页面判定、字符集解码、载荷
分类、`Refresh` 和 meta refresh、Markdown 备选内容、
`Accept: text/markdown` 协商、llms.txt 和 feed 候选、
链接文档回退、空壳页面的内嵌数据、选择、写入和
评判。

### 剪贴板（`clipboard`） \{#clipboard-clipboard}

- `copyToClipboard(text)` 是使用 `arboard::Clipboard::set_text` 的同步原生调用。Linux 上会保留一个贯穿进程生命周期的 `Clipboard` 实例（用于 X11/Wayland 选择所有权）；macOS/Windows 每次调用使用一个临时实例。
- `readImageFromClipboard()` 在 `task::blocking("clipboard.read_image", (), ...)` 中运行。
- 当 `arboard` 报告 `ContentNotAvailable` 时，图像读取返回 `null`/`undefined`。
- 成功读取图像后，将剪贴板 RGBA 数据转换为 PNG 字节，并返回 `{ data: Uint8Array, mimeType: "image/png" }`。
- Windows 上，`arboard` 图像读取的操作性错误会触发原始 `CF_DIB` 解码回退，以处理 Qt 截图工具等生成的位图布局。如果回退失败，则保留原始图像读取错误。
- 剪贴板访问或图像编码失败会作为原生错误拒绝/抛出。

当前没有会发出 OSC52、处理 Termux 或抑制原生剪贴板失败的 `packages/natives` TS 包装器。任何尽力而为的剪贴板策略都必须放在使用方中。

### Token（`tokens`） \{#tokens-tokens}

- `countTokens(input, encoding?)` 接受单个字符串或字符串数组。
- 数组返回一个合计 token 数。全局线程池可用时，至少 16 个字符串的批次使用 Rayon；更小的批次串行计数。
- 默认编码为 `O200kBase`。其他导出为 `Cl100kBase`、`ClaudeV3`、`ClaudeV47`、`ClaudeV5`、`ClaudeV5Sonnet`、`Qwen3`、`DeepSeekV3`、`KimiK2`、`Glm5` 和 `Jev`。
- `tokens.rs` 直接使用 JS UTF-16 输入，将其派发给内嵌的 `utok` 分词器。词表在首次使用时解码并复用。
- 计数衡量的是内容，而不是传输协议封装。BPE 编码使用普通编码，不处理特殊 token；Claude 计数不包含固定的逐消息封装。

### DeviceCheck \{#devicecheck}

`deviceCheckGenerateToken()` 在阻塞线程池上运行，返回 `{ supported, tokenBase64?, error?, latencyMs }`。macOS 上，token 回调等待上限为一秒；这不是端到端的 promise 截止时间。辅助函数要求在调用 DeviceCheck 前已有 GUI 登录会话。不受支持的平台返回 `{ supported: false, latencyMs: 0 }`；不受支持的设备和生成失败会在结果中报告，而不是要求 token 存在。

### macOS 外观与跨平台电源辅助函数 \{#macos-appearance-and-cross-platform-power-helpers}

- `detectMacOSAppearance()` 返回 `"dark"`、`"light"`，非 macOS 上返回 `null`。
- `MacAppearanceObserver.start(callback)` 返回带 `stop()` 的句柄；macOS 上先报告初始外观，再通过分布式通知加上 2 秒轮询回退报告变化，对重复值去重。非 macOS 上它是无操作观察器。
- `PowerAssertion.start(options?)` 返回带幂等 `stop()` 和丢弃时释放机制的句柄。它在 macOS 上使用 IOKit，在 Linux 上使用 login1 抑制（针对 `display` 还尽力进行 ScreenSaver 抑制），在 Windows 上使用线程亲和的执行状态。不受支持的平台获得无操作句柄。
- 选项为 `{ reason?, idle?, system?, user?, display? }`；默认原因为 `"omp agent session"`。如果没有布尔值为真，即使提供了 `idle: false`，也会启用防止空闲休眠。`user` 仅适用于 macOS。Linux login1 失败会导致拒绝，而显示抑制器失败是非致命的。

### 工作性能分析（`prof`） \{#work-profiling-prof}

- **采集边界**：性能分析样本由 `profile_region(tag)` 守卫生成，包括 `task::blocking`、`task::blocking_mapped` 和 `task::future` 中的守卫。
- **存储格式**：固定大小的环形缓冲区（`MAX_SAMPLES = 10_000`），存储栈路径、时长和时间戳。
- **输出边界**：`getWorkProfile(lastSeconds)` 返回：
   - `folded`：折叠栈文本（火焰图输入）
   - `summary`：Markdown 表格摘要
   - `svg`：可选的火焰图 SVG
   - `totalMs`、`sampleCount`

## 生命周期与状态转换 \{#lifecycle-and-state-transitions}

### SIXEL 生命周期 \{#sixel-lifecycle}

1. `encodeSixel(bytes, targetWidthPx, targetHeightPx, backgroundRgb)` 校验目标尺寸和打包的 24 位背景 RGB。
2. Rust 猜测并解码已编码的图像。
3. 缩放带 alpha 的图像时，在 RGBA8 缓冲区中原地预乘 RGB，包括清除完全透明像素中的隐藏颜色。
4. Lanczos3 将预乘图像缩放到目标尺寸。不透明格式在缩放时不预乘；未缩放的图像跳过这两个步骤。
5. 将终端背景合成到部分透明像素中，不会将覆盖率相乘两次。完全透明的像素保持透明。
6. 使用 `icy_sixel::sixel_encode` 编码合成后的像素，并同步返回 SIXEL 转义字符串。

`encodeSixelAsync(bytes, targetWidthPx, targetHeightPx, backgroundRgb)` 在原生阻塞线程池上运行相同的生命周期，并以转义字符串完成。

失败转换（同步形式抛出异常；异步形式拒绝）：

- 格式检测/解码失败会使转换失败。
- 无效的目标尺寸会使转换失败。
- 背景 RGB 超出范围时，以 `SIXEL background must be a packed 24-bit RGB color` 失败。
- SIXEL 编码失败时，以 `Failed to encode SIXEL: ...` 失败。

### HTML 生命周期 \{#html-lifecycle}

1. `renderHtml(html, options)` 在原生阻塞线程池上调度渲染。
2. 除非另有指定，渲染使用默认选项（`format=markdown`、`mode=auto`、`hidden=drop`、`images=true`、`width=250`）。
3. `mode=auto` 执行一种阅读器行为：选择主内容并移除模板内容。`mode=full` 渲染所有可见内容。
4. Markdown 写入器负责渲染和规范化；纯文本写入器负责 Lynx 风格布局。
5. 返回 Markdown 或纯文本字符串（所选模式未找到内容时为空）。

### 剪贴板生命周期 \{#clipboard-lifecycle}

- 文本复制同步调用 `set_text`；macOS/Windows 每次调用创建临时的 `arboard::Clipboard`，Linux 则在首次复制时初始化一个贯穿进程生命周期的实例并复用它。
- 图像读取创建 `arboard::Clipboard`，调用 `get_image`，成功时编码 PNG，将 `ContentNotAvailable` 映射为 `None`，并在拒绝其他图像读取错误前尝试 Windows 原始 DIB 回退。

### 工作性能分析生命周期 \{#work-profiling-lifecycle}

1. 无须显式启动：任务辅助函数执行时，性能分析处于启用状态。
2. 每个已插桩的任务作用域在守卫丢弃时记录一个样本。
3. 达到缓冲区容量后，样本会覆盖最旧的条目。
4. `getWorkProfile(lastSeconds)` 读取一个时间窗口，并派生 folded/summary/svg 产物。

失败转换：

- SVG 生成失败是非致命的（省略 `svg` 或其值为 undefined），folded 和 summary 仍会返回。
- 空样本窗口返回空 folded 数据且不含 SVG，而不是返回错误。

## 不受支持的操作与错误传播 \{#unsupported-operations-and-error-propagation}

### SIXEL \{#sixel}

- 不受支持或损坏的图像输入会直接失败。
- 无效的 SIXEL 目标尺寸会直接失败。
- 无效的打包背景 RGB 会直接失败。
- natives 包未公开 JS 回退路径。

### HTML \{#html}

- `renderHtml` 返回所选模式下尽力生成的渲染结果；空字符串表示该模式未找到内容。
- 省略选项表示使用默认值，而不是失败。
- `Reader` 将传输失败、拦截墙和 JavaScript 空壳页面作为输出步骤报告，而不是抛出异常。

### 剪贴板 \{#clipboard}

- 原生 API 接口上的文本复制采用严格失败语义。
- 图像读取区分“没有图像”（`null`/`undefined`）与操作失败（拒绝）。

### 工作性能分析 \{#work-profiling}

- 获取操作对函数调用本身采用严格失败语义。
- 火焰图 SVG 生成结果可为空/可选。
- 缓冲区截断是预期的环形缓冲区行为。

## 平台注意事项 \{#platform-caveats}

- 剪贴板访问依赖通过 `arboard` 提供的 OS/会话支持。
- macOS 外观和电源辅助函数在不受支持的平台上有意返回无操作/null 行为。
- 此媒体/系统原生实用程序接口未公开 ProjFS。隔离后端选择（包括任何 ProjFS 支持）位于独立的 `iso` 子系统中。
