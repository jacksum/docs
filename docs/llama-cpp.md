# 使用 llama.cpp 运行本地模型 \{#local-models-with-llamacpp}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Local Models with llama.cpp](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/llama-cpp.md)。[上游 MIT 许可证](./license.md)。

Pi 支持 [llama.cpp](https://llama.app) 的路由服务器。路由服务器可以发现多个 GGUF 模型，并按需加载或卸载它们。

## 安装 llama.cpp \{#install-llamacpp}

使用[官方安装程序](https://llama.app/docs/installation)安装 llama.cpp：

```bash
curl -LsSf https://llama.app/install.sh | sh
```

验证安装：

```bash
llama --version
```

使用包管理器、从源码构建等其他安装方式见 [llama.app](https://llama.app)。

## 启动路由服务器 \{#start-the-router}

运行 `llama serve` 时不要传入 `--model`、`-m` 或 `-hf`。指定模型会启动单模型模式，而不是路由模式。路由配置见 [llama.cpp 服务器指南](https://llama.app/docs/serve#serving-multiple-models-router-mode)。

```bash
llama serve \
  --no-models-autoload \
  -ngl all \
  -c 32768
```

主要选项：

- `--no-models-autoload` 禁用自动加载，需通过 `/llama` 手动加载模型。
- `-ngl all` 将所有层交给 GPU 处理。省略该选项时，会自动决定哪些层交给 GPU 处理。
- `-c 32768` 以 token 为单位设置上下文大小。用 `-c 0` 可使用模型的完整上下文窗口，但可能需要多得多的内存。服务器的并行请求槽共享上下文容量。

单文件模型可以直接放在模型目录中。请将每个多模态模型和多分片模型分别放入独立的子目录：

```text
~/models/
├── llama-3.2-1b-Q4_K_M.gguf
├── gemma-3-4b-it-Q4_K_M/
│   ├── gemma-3-4b-it-Q4_K_M.gguf
│   └── mmproj-F16.gguf
└── large-model-Q4_K_M/
    ├── large-model-Q4_K_M-00001-of-00003.gguf
    ├── large-model-Q4_K_M-00002-of-00003.gguf
    └── large-model-Q4_K_M-00003-of-00003.gguf
```

手动添加文件后，重启路由服务器。路由服务器也支持已缓存的模型，以及通过 `--models-preset` 指定的预设文件。详见[服务器指南](https://llama.app/docs/serve#serving-multiple-models-router-mode)。

## 配置 Pi \{#configure-pi}

启动 Pi 并配置模型提供方：

```text
/login llama.cpp
```

输入路由服务器的 URL。还可以输入 API 密钥。默认 URL 为 `http://127.0.0.1:9931`。

如果启动路由服务器时使用了 `--no-models-autoload`，`/login llama.cpp` 只会保存连接信息。运行 `/llama` 加载模型，再用 `/model` 为当前会话选择已加载的模型。

也可以用环境变量设置相同的值，无需运行 `/login`：

```bash
export LLAMA_BASE_URL=http://127.0.0.1:9931
export LLAMA_API_KEY=optional-secret
pi
```

如果服务器使用 API 密钥，请用对应的 `--api-key` 值启动 `llama serve`。如果只允许本机访问，请保留 `--host 127.0.0.1`。

## 管理模型 \{#manage-models}

运行：

```text
/llama
```

- 选择未加载的模型即可加载它。
- 选择已加载的模型即可卸载它。
- 选择 **Download model…**，搜索 Hugging Face，然后选择仓库和量化版本。也可直接输入确切的 `owner/repository[:quant]` 值。
- 加载或下载时，按 Escape 可确认取消。

搜索 Hugging Face 时，如果设置了 `HF_TOKEN`，则使用它，否则依次检查 `$HF_TOKEN_PATH`、`$HF_HOME/token`、`$XDG_CACHE_HOME/huggingface/token` 和 `~/.cache/huggingface/token`。无需认证也可搜索，但请求速率上限较低。下载受访问控制的仓库之前，Pi 会给出提示并提供访问页面的链接。下载由 llama.cpp 服务器执行，因此选定仓库需要访问权限时，服务器进程也必须有 `HF_TOKEN`。

如果还加载了其他模型，Pi 会询问你要先卸载它们，还是让它们保持加载。Pi 不会擅自卸载模型，也不会删除模型文件。路由服务器可能由多个客户端共享，因此 `/llama` 始终显示路由服务器的当前状态。

已加载和休眠中的模型都会出现在 `/model` 中。选中休眠模型后，它会自动唤醒。路由服务器启用自动加载时，尚未加载的预设模型也会显示，并在选中后加载。使用 `--no-models-autoload` 时，请先通过 `/llama` 加载模型，再选择该模型。

如果路由服务器断开连接，`/llama` 会显示 **Retry** 和 **Close**。选择 Retry 会重新连接并刷新模型状态，不会重新执行中断的操作。

## 分类 \{#classification}

与 TypeSafe 的 Jev 模型类似，分类器模型可针对 JSON 状态回答 `choice`、`bool` 和 `score` 这三类问题。模型可以通过 [`codemode`](./cli.md#enable-codemode) 脚本调用分类器，扩展则可以通过 `ctx.modelRegistry.classify()` 调用。参阅[分类器模型](./models.md#use-classifier-models)。Pi 以两种方式将 llama.cpp 模型列为分类器：

- [Julia-1、Laya、Kev、lev 和 OpenJev](https://huggingface.co/collections/ggml-org/decision-models-6abf80cca3c83f127060a769) 等**决策模型**通过 llama.cpp 的 `/v1/systemone` 端点原生回答问题。它们只作为使用 `typesafe-system-one` API 的分类器出现，不会出现在 `/model` 中。
- **聊天模型**也可以作为分类器列出，使用相同的 ID 和 `llama-cpp-classify` API。该 API 根据下一个 token 的概率读取答案，如下文所述。

从 llama.cpp 0.6.0 起，路由服务器会在模型列表中报告决策模型，它们的 `architecture.output_modalities` 包含 `decisions`。路由服务器直接从 GGUF 元数据读取这项信息，无需加载模型，因此 Pi 也能识别尚未加载或处于休眠状态的决策模型。较早版本的 llama.cpp 不报告这项信息，Pi 会将这些版本提供的决策模型列为聊天模型。

### 将聊天模型用作分类器 \{#chat-models-as-classifiers}

模型不会生成答案。每个问题会转换成一条聊天提示词，依次包含状态、请求中的所有问题、同一份状态，最后是这个问题及其候选答案，每个答案都用单个 token 作标签。选择题用字母作标签（最多 62 个选项），布尔题用 `Yes` 和 `No`，评分题用数字（最多 10 个等级）。模型第二次读取状态时，已经看过所有问题。这一做法提高了小模型在 JevBench 上的准确率。Pi 读取各标签作为下一个 token 的概率，并对它们做归一化。选择题返回每个选项的概率和置信度 `(n * peak - 1) / (n - 1)`，评分题返回期望等级。

- 标签的原始概率通常高估置信程度。每次请求可通过 `temperature` 选项指定归一化之前标签 logits 的除数。值大于 1 时，概率分布更平缓。这不会改变答案。
- 问题逐个执行。对同一次请求中的所有问题，聊天提示词在末尾的待回答问题之前都相同，因此服务器借助提示词缓存只处理这部分一次。状态会出现两次，需要占用两倍的上下文空间。
- 小模型有时会执行写在状态里的指令。提示词会要求模型将状态作为数据来判断，但无法保证模型遵守。
- Qwen3.5 等混合模型没有上下文检查点就无法回退到部分缓存的提示词中。如果每个问题都会重新处理整份状态，请使用 `--ctx-checkpoints 32 --checkpoint-min-step 0` 启动路由服务器。

## 问题排查 \{#troubleshooting}

检查能否连接到路由服务器：

```bash
curl http://127.0.0.1:9931/health
curl http://127.0.0.1:9931/models
```

- **`/llama` 中没有模型：** 检查 `--models-dir` 和目录结构，然后重启路由服务器。
- **使用 `--no-models-autoload` 时，`/model` 中找不到模型：** 先使用 `/llama` 加载模型。
- **加载失败或内存占用过高：** 减小 `-c` 或卸载其他模型。
- **服务器未处于路由模式：** 启动时不要传入 `--model`、`-m` 或 `-hf`。

要移除 `llama.cpp` 模型提供方和 `/llama` 命令，请在 `pi config` 的 Built-in 中禁用 `llama.cpp`，或在[设置](./settings.md#resources)中设为 `"extensions": ["-builtin:llama.cpp"]`。
