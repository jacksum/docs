---
title: "本地模型目录与实验"
description: "Oh My Pi 官方仓库文档：本地模型目录与实验。"
---

# 本地模型目录与实验 \{#local-model-catalog-and-experiments}

本文介绍 `local` 目录中的设备端模型，并记录已交付的标题和记忆推荐所依据的微型模型实验。模型按角色选择：使用 `modelRoles.<role>` 作为主要选择器，使用 `retry.fallbackChains.<role>` 指定有序的备选项。目录条目编写在 `packages/catalog/src/compat/rules/providers/local.kdl` 中；文本模型导出位于 `packages/coding-agent/src/tiny/models.ts`。下文基准测试的耗时是历史测量结果，不是对当前运行时的保证。

```yaml
modelRoles:
   tiny: local/lfm2.5-230m
   memory: local/lfm2-1.2b
   speech: local/phonon-31m
   dictation: local/fluid-speech-pro
   # A local tiny model may also serve typed judgments:
   judge: local/lfm2-1.2b

retry:
   fallbackChains:
      tiny: []
      memory: []
      speech: []
      dictation: []
      judge: []
```

显式的空链会让各项工作负载保持在本地执行。如果不设置某个模型类型的链，则使用该角色的内置优先级列表。`default` 回退链不适用于 `speech`、`dictation` 或 `judge`。

使用 `omp models --kind tiny`、`omp models --kind tts` 和 `omp models --kind stt` 查看目录。使用 `omp tiny-models list`、`omp tiny-models download <model-id>` 或 `omp tiny-models download all` 下载微型模型。运行 `omp setup speech`，选择、持久保存并下载由对应角色选中的本地语音和听写模型。

微型模型 CLI 和源注册表保留了**标题**和**记忆**分组，因为基准测试和模型大小推荐使用的是这两种工作负载。它们不是运行时模型类别：两个分组中的每个条目的目录类型都是 `tiny`，任何兼容条目都可以分配给 `tiny`、`memory` 或 `judge`。请根据质量和资源需求选择，而不只是依据 CLI 分组。

## 运行时/环境发现 \{#runtime--environment-findings}

- **文本/Whisper 技术栈**：`@huggingface/transformers`（transformers.js）v4 在 Bun 工作进程中运行，默认使用原生 `onnxruntime-node` 后端。Phonon TTS 在隔离的工作进程内，通过 `omp-natives` 原生运行（无需额外安装）；Fluid Speech Pro、Parakeet、Nemotron 和 Silero 语音活动检测器使用 `sherpa-onnx-node`。
- **非 FHS 发行版（NixOS，以及加载器路径上没有 `libstdc++.so.6` 的任何主机）**：按需加载的 `onnxruntime-node` / `sherpa-onnx-node` / `sharp` 插件是预构建的二进制文件，它们通过 `dlopen` 加载 `libstdc++.so.6` 和 `libgcc_s.so.1`，并携带自己的 `DT_RUNPATH`，因此 omp 可执行文件自身的 RPATH 无法解析它们。将 `OMP_NATIVE_LIBRARY_PATH` 设置为包含这些库的目录，以冒号分隔；omp 只会为推理工作子进程将其追加到 `LD_LIBRARY_PATH`（绝不会用于 shell/eval/守护进程的子进程）。Nix 软件包（`nix/package.nix`）默认设置了此项。
- **每个模型/后端一个文本工作进程，保活但不永久驻留**：每个微型文本模型/后端组合由一个全机共享的工作进程提供服务，该进程持有 `~/.omp/run/tiny/<model>-<backend>.sock`（Windows 上为命名管道）。同一模型的 ONNX 和 MLX 工作进程可以共存。第一个需要该组合的 omp 进程会以分离模式启动它（日志位于套接字旁，名为 `<model>-<backend>.log`）；其他 omp 进程连接到它，因此不会为每个 omp 实例重复加载权重。没有监管程序：工作进程在 15 分钟未收到请求后自行退出（`OMP_TINY_WORKER_IDLE_MS` 可在测试时覆盖这一时长），移除套接字，之后任一 omp 进程的下一个请求都会启动一个新工作进程。并发启动通过 `.bind.lock` 文件锁竞争：失败者发现已有活动套接字后退出，其父进程则采用胜出者。`ping` 返回启动标记（`<omp version>|onnx|<device>|<dtype>` 或 `mlx|<mlx-lm version>|<script crc>`），因此 omp 升级或 `providers.tinyModelDevice`/`providers.tinyModelDtype` 变更会替换过时的 ONNX 工作进程；MLX 替换依据其运行时版本/脚本标记。设备/dtype 设置冲突的并发 ONNX 客户端可能相互替换工作进程，因此请统一这些设置。协议位于消息层级（`load`、带有消息/预填充/停止条件/最大 token 数的 `chat`）；提示构建和标题提取位于客户端，因此两类工作进程可以互换。
- **设备策略**：本地微型模型默认仅使用 CPU 推理；如果显式选择的加速提供方无法初始化，会在 CPU 上重试一次。
   - 使用 `providers.tinyModelDevice` 设置持久选择提供方（`default` 保持使用 CPU），或通过 `PI_TINY_DEVICE` 环境变量为单次运行选择（它会覆盖设置）。
   - 接受的值为 `cpu`、`gpu`、`mlx`/`metal`、`webgpu`、`auto`、`cuda`、`dml`、`coreml`、`wasm`、`webnn`、`webnn-gpu`、`webnn-cpu` 和 `webnn-npu`。
   - 直接使用 `coreml` 仍需通过 `PI_TINY_DEVICE=coreml` 主动启用；它不属于默认选项，因为缓存的解码器 LLM ONNX 加载可能在会话初始化时失败。
   - WebGPU/Metal 可用于单进程 eval 测试框架，但生产工作进程会强制将 Darwin 上的 `gpu`/`webgpu`/`auto` 请求回退到 CPU，因为 ONNX Runtime/Bun 目前在 WebGPU 推理后的工作进程销毁阶段会发生硬崩溃。
   - 只有在明确选择不使用默认 CPU 时，才使用 `providers.tinyModelDevice` 或 `PI_TINY_DEVICE`。
- **MLX 后端（Apple 芯片）**：`PI_TINY_DEVICE=mlx`（或 `metal`）替换的是工作进程本身，而不是 ONNX 提供方：每个模型的工作进程是 `mlx-server.py`，运行在固定版本的 `mlx-lm` venv 中，omp 会在首次使用时将其安装到 `~/.omp/agent/cache/tiny-mlx-runtime/`（通过 `uv`，否则使用 Python ≥ 3.10 的 `python3 -m venv`）。它将模型预量化的 4 位 MLX 导出（注册表中的 `mlxRepo`）下载到 `~/.omp/agent/cache/tiny-models/mlx/`，逐字节显示进度，使用 `mlx_lm.load` 加载，并使用与 ONNX 工作进程完全相同的协议，因此标题、记忆补全和本地类型化判断使用同一后端。推理在 Python 工作进程中运行。MLX 忽略 `PI_TINY_DTYPE`。如果 venv 引导失败（没有 Python、安装错误、非 Apple 主机），omp 会记录警告，并在该进程的剩余运行期间使用 ONNX CPU 工作进程。在 M4 Max 上测得：冷启动 venv 安装 + LFM2.5-230M 下载 + 加载耗时 15.7 秒；第二个 omp 实例连接到运行中的工作进程远低于一秒；预热后生成标题耗时 15-60 毫秒；Qwen3-1.7B（在 onnxruntime-node 上受阻）下载量为 984MB，回答一次记忆提取约需 200 毫秒。
- **量化：q4 是最佳平衡点**：磁盘占用更小、加载更快、推理也快。q8/int8 在 CPU 上加载更慢，_而且_推理也更慢。所有随附模型都默认使用 `q4`；可使用 `providers.tinyModelDtype` 设置持久覆盖精度（`default` 保持 `q4`，例如可用 `fp16` 获得更高保真度），或通过 `PI_TINY_DTYPE` 为单次运行覆盖（它会覆盖设置）。接受 `auto`、`fp32`、`fp16`、`q8`、`int8`、`uint8`、`q4`、`bnb4`、`q4f16`、`q2`、`q2f16`、`q1`、`q1f16`；无法识别的值会在工作进程启动时明确报错并失败。
- **加载耗时更正（重要）。** 先前认为“q4 的 >=1B 模型需要数分钟加载”，这是同时运行约 5 个数 GB 的 HuggingFace 下载（I/O 饱和）造成的**测量假象**。在干净、隔离的条件下，所有**热**加载都低于 3 秒：
   - TinyLlama-1.1B q4：约 0.5 秒
   - Llama-3.2-1B q4：约 2.8 秒（`graphOpt=all`）/ 约 0.5 秒（`disabled`）
   - LFM2-1.2B q4：约 0.36 秒
   - Qwen2.5-1.5B q4：约 1.5 秒
   - Qwen3-1.7B q4：约 1.6 秒
   - gemma-3-1b q4：约 1.1 秒
   - 结论：**1B-1.7B 模型在 CPU 上可用。**
- **`session_options.graphOptimizationLevel`** 在加载与推理速度之间权衡：`disabled` = 加载最快，推理稍慢；`all` = 默认值。
- **首次运行**会从 HF Hub 将权重下载到缓存目录（q4 权重约 150MB-1.1GB，取决于模型）；后续**热**加载耗时从不足一秒到约 3 秒。推理是异步的，适合在后台执行记忆任务；标题生成则是半交互式的。

## 任务 1：会话标题生成（`modelRoles.tiny`） \{#task-1-session-title-generation-modelrolestiny}

**任务**：将用户的第一条消息转换为 3-7 个词的标题。微型模型（低于 1B）即可胜任。

**最佳方案**：

- 简单的系统提示（无少样本示例）。
- 用 `<title>` **预填充**助手轮次，**在 `</title>` 处停止**，然后取第一行。
- 贪心解码（`do_sample:false`），聊天模板中设置 `enable_thinking:false`。

**经验结论**：

- **少样本示例会污染低于 0.6B 模型的标题**，使其照搬示例主题。当前本地标题系统提示不包含示例。
- 在最小的模型上，**大小写指令会变成输出内容**。[`normalizeGeneratedTitle`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/tiny/text.ts) 会在生成后统一大小写，因此提示中省略了该规则。
- **token 偏置（`bad_words_ids`）已确认在此无效**：预填充已经控制了开头。

**替代模型基准测试**（30 条近期首次会话提示，q4 CPU，无示例）：

| 模型 | 缓存 | 热运行均值 / p95 | 3-7 个词 | 观察到的取舍 |
| --- | ---: | ---: | ---: | --- |
| LFM2.5-230M | 214MB | 93 / 194ms | 21/28 | 语义平衡最佳；偶尔生成泛化标题 |
| Falcon-H1-Tiny-90M | 147MB | 117 / 174ms | 17/29 | 体积最小；复杂输入的保真度较低 |
| LFM2.5-350M | 292MB | 166 / 266ms | 4/30 | 极度简短，经常是单词标签 |

**随附的本地选项**：`lfm2.5-230m`、`lfm2.5-350m`、`falcon-h1-90m`。
未设置 `modelRoles.tiny` 时，标题生成会解析其内置在线角色路径；不会自动下载本地权重。本地主模型是明确的无计费边界：如果其工作进程失败或没有返回标题，会话将保持无标题，而不是回退到在线模型。单独运行 `omp tiny-models` 命令时，默认下载 `lfm2.5-230m`。

## 任务 2：Mnemopi 记忆（`modelRoles.memory`） \{#task-2-mnemopi-memory-modelrolesmemory}

Mnemopi 运行两项小型 LLM 任务：

1. **提取**：从单条消息中提取持久、结构化的条目。
2. **整合**：将一组记忆概括为 1-3 句忠实于原意的句子。

这些任务需要**比标题更大的模型：1B-1.7B**。我们通过四个并行智能体测试了 LFM2-1.2B、Qwen2.5-1.5B、Qwen3-1.7B 和 gemma-3-1b（q4，CPU），每个智能体运行 27-31 次实验。

### 提取发现 \{#extraction-findings}

实验暴露了原有五类别 JSON 提示的两个问题：

1. 全空示例 `{"facts":[],...}` 被**逐字照搬**，未产生任何事实。
2. 值为对象的类别条目先前会变成 `[object Object]`。

对于本地和在线模型，托管记忆路径现在都会将提取指令放在系统轮次，将原始消息放在用户轮次。它要求**每行一个纯文本事实**，对于问候和其他非持久内容，则要求准确输出 `NO_FACTS`。当前解析器也接受条目为字符串或包含可识别文本字段的结构化类别对象；不再将任意对象强制转换为字符串。

### 与标题任务相比，技术效果相反 \{#technique-polarity-flips-vs-titles}

- 在 1B 及以上规模，**少样本是影响质量的主要因素**：例如，Qwen2.5-1.5B 从 1 个示例增至 3 个示例时，提取 F1 从 0.52 → 0.83；gemma 使用 2 个示例时，召回率从 0.65 → 0.92。
- **预填充有害于提取**：它会强制对闲聊输出内容，产生假阳性。
- **系统拆分**（将指令放在系统角色中）有助于具备系统角色的模型。
- 对于两项任务，**贪心解码 >= 温度采样**。
- **token 偏置**仍然无效。

### 各模型结论（正面对比，16 个测试样例集） \{#per-model-verdicts-head-to-head-16-fixture-set}

- **Qwen3-1.7B**：提取最严谨：对闲聊返回空结果，没有隐含事实泄漏，保留语言，输出干净的扁平 JSON。弱点：粒度粗，漏掉了一次多轮值更新。
- **Qwen2.5-1.5B**：提取粒度最佳（原子事实），捕捉到了值更新，闲聊泄漏为零。弱点：整合最差（句子冗长连写、无去重），以及一次退化的隐含事实输出。
- **gemma-3-1b**：整合最佳（去重有效、忠实、单条记忆结果干净）。弱点：泄漏闲聊，并翻译了德语。
- **LFM2-1.2B**：表现稳健且加载最快。弱点：`Label: value` 噪声、闲聊和隐含事实泄漏，以及一条空泛的单条记忆摘要。

### 推荐与当前可用性 \{#recommendation-and-current-availability}

实验在提取精确率方面倾向于 **Qwen3-1.7B**。其随附的 ONNX 导出已禁用，因为 `onnxruntime-node` 不支持它的 RotaryEmbedding 缓存更新；ONNX 工作进程会在加载运行时之前拒绝它。它可通过 Apple 芯片上的 MLX 后端使用（`providers.tinyModelDevice: mlx` 或 `PI_TINY_DEVICE=mlx`）。除非 MLX 已启用，否则 `omp tiny-models download all` 会跳过 ONNX 已禁用的模型。

在可运行的选项中，`lfm2-1.2b` 加载最快，综合表现稳健；没有任何机制会自动选择它。
`gemma-3-1b` 偏重整合质量，而 `qwen2.5-1.5b` 偏重细粒度提取。

**已配置的本地选项**：`llama3.2:3b`、`qwen3-1.7b`（如上所述，ONNX 已禁用）、`gemma-3-1b`、`qwen2.5-1.5b`、`lfm2-1.2b`。
未设置 `modelRoles.memory` 时，它会通过生效的 `tiny` 角色解析，然后使用内置 smol 优先级列表；不会自动下载本地权重。

### Mnemopi 解析器行为 \{#mnemopi-parser-behavior}

`packages/mnemopi/src/core/extraction.ts` 保留结构化事实、指令、偏好、时间线和知识图谱三元组。它从值为对象的条目中提取可识别的文本字段，而不是返回 `[object Object]`。纯文本行回退仍会忽略 10 个字符及以下的行，因此 `Name: Can` 这样的短事实会被丢弃；结构化字符串条目没有此长度限制。

## 本地语音和听写模型 \{#local-speech-and-dictation-models}

`speech` 角色接受 TTS 目录模型，`dictation` 角色接受 STT 目录模型。`omp setup speech` 提供这些角色所接受的本地条目，持久保存选中的 `modelRoles.speech` 和 `modelRoles.dictation` 值，并下载其模型/运行时文件。

### 文本转语音 \{#text-to-speech}

| 选择器 | 仓库 | 精度 | 下载量 | 备注 |
| --- | --- | --- | --- | --- |
| `local/phonon-31m` | `gradium/phonon-31m-en`（固定修订版） | GGUF q8 | 约 68 MB（64.5 MB 权重 + 12 个音色嵌入） | 24 kHz Phonon 31M，仅支持英语，原生 omp-natives TTS |

Phonon 音色选择仍独立于模型角色。为 `tts` 工具设置 `tts.localVoice`，为助手输出朗读设置 `speech.voice`。可用的本地音色 ID 为 `harper`（默认）、`hadley`、`delia`、`everly`（美式女声）、`easton`、`preston`、`miles`、`trevor`（美式男声）、`maeve`、`bryony`（英式女声）、`edwin` 和 `hugh`（英式男声）。更换音色不会下载另一个模型。语速同样分开设置：`tts.localSpeed` 用于 `tts` 工具和 `omp say`，`speech.speed` 用于朗读（两者默认均为 `1`，限制在 `0.8`-`1.3`）。旧版 Kokoro 音色设置会自动迁移（`af_*`→`harper`、`am_*`→`easton`、`bf_*`→`maeve`、`bm_*`→`edwin`）。

### 语音转文本 \{#speech-to-text}

使用这些规范的目录模型 ID：

| 选择器 | 仓库 | 运行时/精度 | 下载量 | 备注 |
| --- | --- | --- | --- | --- |
| `local/whisper-base` | `onnx-community/whisper-base` | transformers.js q8 | 约 60 MB | 最小的多语言 Whisper 选项 |
| `local/whisper-small` | `onnx-community/whisper-small` | transformers.js q8 | 约 190 MB | 均衡的多语言 Whisper 选项 |
| `local/whisper-large-v3-turbo` | `onnx-community/whisper-large-v3-turbo` | transformers.js q4 | 约 600 MB | Whisper large-v3-turbo，99 种语言 |
| `local/fluid-speech-pro` | `FluidVoice-Labs/fluid-speech-pro-onnx` | sherpa-onnx int8 | 约 800 MB | 默认选项；25 种欧洲语言 |
| `local/parakeet-tdt-0.6b-v2` | `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v2-int8` | sherpa-onnx int8 | 约 650 MB | 最准确的英语选项 |
| `local/nemotron-streaming-en-0.6b` | `csukuangfj2/sherpa-onnx-nemotron-speech-streaming-en-0.6b-160ms-int8-2026-04-25` | sherpa-onnx int8 | 约 630 MB | 原生流式处理；仅支持英语 |

transformers.js Whisper 模型读取 `providers.tinyModelDevice` / `PI_TINY_DEVICE` 和 `providers.tinyModelDtype` / `PI_TINY_DTYPE`；默认精度来自各语音模型的规格，而不是文本模型默认的 q4。Phonon 通过 omp-natives 在 CPU 上运行，并忽略这些设置。MLX 是文本模型后端，因此选择它仍会让语音推理在 CPU 上运行。Fluid Speech Pro、Parakeet 和 Nemotron 在 CPU 上使用其随附的 sherpa-onnx int8 文件。行为设置仍使用 `stt.language`、`stt.submitTrigger`、`tts.localVoice` 及其他语音/实时设置；只有模型选择移到了角色中。

除 Nemotron 外，每个模型都对完整话段进行解码。实时听写时，Silero VAD（`istupakov/silero-vad-onnx`，约 2 MB，随模型一同获取）会在 0.5 秒或更长的停顿处切分录音。每个话段前补 240 毫秒、后补 120 毫秒，解码一次后提交；正在进行的话段会重新解码以供实时预览。检测器会强制切分超过 20 秒的话段。Silero 不将歌唱视为语音，因此如果整段录音都未检测到语音，停止时会以 20 秒的窗口将录音一次转写完成。低于约 −50 dBFS 的窗口会被跳过。

实时英语听写请选择 Nemotron。它以 160 毫秒的块处理新音频，并在录音期间更新草稿，而不反复解码整个短语。块大小并不保证词语显示的延迟。首次录音会等待识别器加载；后续录音则复用它。音频保留在你的机器上。多语言默认选项仍为 Fluid Speech Pro。

配置中的 `local/parakeet-tdt-0.6b-v3` 角色和回退链会迁移到 `local/fluid-speech-pro`，后者是经过进一步训练的 Parakeet TDT 0.6B v3。

#### 听写基准测试（2026-11-26） \{#dictation-benchmark-2026-11-26}

测试集：将 LibriSpeech dev-clean 话段拼接成 24 个约 22 秒的片段，话段之间停顿 0.35-0.9 秒。三种条件：

- **干净：** 原始音频。
- **麦克风：** 语音约为 −36 dBFS，带有混响和信噪比为 18 dB 的房间噪声。
- **音乐：** 在麦克风条件下，叠加信噪比为 8 dB 的流行歌曲背景音。

所有运行都使用 M4 Max CPU、4 个线程和 int8 权重。第一张表对每个片段进行整体解码：

| 模型 | 干净 WER | 麦克风 WER | 音乐 WER | 速度（实时倍数） |
| --- | ---: | ---: | ---: | ---: |
| Parakeet TDT 0.6B v3（先前默认选项） | 4.6% | 7.3% | 35.7% | 48× |
| Fluid Speech Pro | 4.1% | 5.0% | 8.7% | 37× |
| Parakeet TDT 0.6B v2（英语） | 3.2% | 3.8% | 9.7% | 49× |
| Nemotron streaming EN 0.6B | 10.2% | 14.8% | 31.0% | 6×（按 100 毫秒块输入） |

这些分数将“Mr.”相对于参考文本中完整拼写的“mister”计为错误。这使输出“Mr.”的模型损失了零点几个百分点。

实时听写按话段解码。针对 6 个片段，将“Mr.”规范化为“mister”，使用 Silero VAD 切分，而非先前的响度门限：

| 模型 | 条件 | 响度门限 | Silero VAD |
| --- | --- | ---: | ---: |
| Parakeet v3 | 麦克风 | 20.9%（48 段） | 6.9%（12 段） |
| Parakeet v3 | 音乐 | 87.4%（65 段） | 30.1%（10 段） |
| Fluid Speech Pro | 麦克风 | 17.7% | 4.6% |
| Fluid Speech Pro | 音乐 | 79.3% | 7.1% |

响度门限测量的是音量，而不是语音。安静的麦克风或房间里的音乐会将话段切成不足一秒的小段，解码后变成零散词语。

在 Tern 中，点击“发送”旁的麦克风，出现**录音中 · 停止**时开始说话，然后点击“停止”完成草稿。此按钮从不自动提交。键盘听写仍遵循 `stt.submitTrigger`。

## 集成说明 \{#integration-notes}

- 为角色分配 `local/<model-id>`，即可为标题、记忆或判断工作负载选择本地微型推理。未设置的 `tiny` 角色保持其在线默认值；未设置的 `memory` 角色遵循生效的 `tiny` 角色，因此当 `tiny` 为本地时，它也可能变为本地。未设置的 `speech` 和 `dictation` 角色使用各自的内置优先级列表，其首选候选项为本地模型。
- 本地推理**在工作进程中**运行（不在主线程）；只有使用本地候选项或通过 `omp tiny-models` 或 `omp setup speech` 显式预取时，才下载权重，随后缓存在磁盘上。
- 会话标题生成使用 `modelRoles.tiny`；Mnemopi 在启用其 LLM 模式时，提取和整合使用 `modelRoles.memory`。它们不同的提示和基准测试分组并不意味着运行时模型类型必须分开。
- 自动思考、Smart 意外停止检测、类型化 Eval 判断和 AI 辅助 git 暂存使用 `judge` 角色。分配 `typesafe/jev-1.14.0` 以使用 TypeSafe，或分配兼容的本地微型模型以进行设备端判断；在 `retry.fallbackChains.judge` 下排列备选项。
- 托管记忆提取在本地和在线传输上使用共享的行格式系统提示，并防止提取闲聊内容。本地主模型还会选择本地整合提示。显式外部 Mnemopi 端点仍具有决定权，不会被记忆角色替代。
