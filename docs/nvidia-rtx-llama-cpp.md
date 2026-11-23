# 使用 NVIDIA RTX 和 llama.cpp 运行 Pi \{#run-pi-with-nvidia-rtx-and-llamacpp}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Run Pi with NVIDIA RTX and llama.cpp](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/nvidia-rtx-llama-cpp.md)。[上游 MIT 许可证](./license.md)。

[NVIDIA Local AI Inference Recipes](https://nvidia.github.io/local-ai-inference-recipes/index.html) 提供针对特定 NVIDIA 硬件和模型优化的 llama.cpp 设置。每个方案都给出一条运行单个模型的 `llama-server` 命令。Pi 使用支持提供和管理多个模型的 llama.cpp 路由服务器。本指南将方案中的命令转换为路由服务器预设，再用 `llama serve` 启动。`llama serve` 接受与 `llama-server` 相同的选项。

以下示例使用 Windows PowerShell。Pi 的完整路由服务器和模型管理参考见[使用 llama.cpp 运行本地模型](./llama-cpp.md)。

## 准备工作 \{#before-you-begin}

1. 打开[方案目录](https://nvidia.github.io/local-ai-inference-recipes/index.html)，选择你的硬件、操作系统和模型，再选择 **llama.cpp**。检查前置条件和内存要求。保留方案中的启动命令，以便在下文转换。
2. 按方案中的安装说明安装 llama.cpp。方案的设置依赖于所用的构建版本，例如是否支持 CUDA 或所需的推测解码选项。
3. 运行 `llama serve --help`，确认其列出了 `--models-preset`。如果构建中没有 `llama` 程序，或没有这个选项，就无法将方案作为路由服务器预设加载。请使用仍符合方案要求的更新版本。
4. 按照[快速上手](./quickstart.md)安装 Pi。在原生 Windows 中运行时，还可参阅[在 Windows 上运行 Pi](./windows.md)。

## 将方案转换为预设 \{#convert-the-recipe-to-a-preset}

一个预设列出一个或多个模型的设置。每个小节的名称将成为 Pi 中显示的模型 ID。将预设保存在 llama.cpp 文件夹中，或在启动路由服务器时传入它的完整路径。

将方案命令的每个选项转换为预设中的一行：

- 去掉开头的连字符：将 `--ctx-size 65536` 改为 `ctx-size = 65536`。
- 没有值的选项写为 `true`：将 `--jinja` 改为 `jinja = true`。
- 去掉值周围的引号和 PowerShell 用于续行的反引号。
- 不写入 `--host` 和 `--port`，这两个选项应放在路由服务器的命令行中。
- 添加 `load-on-startup = true`，让路由服务器在启动时加载模型。
- 将模型文件选项的简写换成预设中的完整键名：

| 方案选项 | 预设键名 |
|---|---|
| `-hf` | `hf-repo` |
| `-hff` | `hf-file` |
| `-hfrd` | `hf-repo-draft` |
| `--spec-draft-model` | `spec-draft-model` |

例如，方案中的这条命令：

```powershell
llama-server.exe -hf "unsloth/Qwen3.8-27B-GGUF" `
  -hff "Qwen3.8-27B-UD-Q4_K_M.gguf" `
  -hfrd "z-lab/Qwen3.8-27B-DFlash2-GGUF" `
  --spec-draft-model "Qwen3.8-27B-DFlash2-Q4_K_M.gguf" `
  --no-mmproj `
  --host 127.0.0.1 `
  --port 9931 `
  --batch-size 4096 `
  --ubatch-size 1024 `
  --ctx-size 65536 `
  --parallel 1 `
  -ngl 999 `
  --jinja `
  --chat-template-kwargs '{"preserve_thinking":true}' `
  --spec-type draft-dflash `
  --spec-draft-n-max 7 `
  --spec-draft-backend-sampling
```

转换为 `qwen3.8-27b.ini`：

```ini
version = 1

[qwen3.8-27b]
load-on-startup = true
hf-repo = unsloth/Qwen3.8-27B-GGUF
hf-file = Qwen3.8-27B-UD-Q4_K_M.gguf
hf-repo-draft = z-lab/Qwen3.8-27B-DFlash2-GGUF
spec-draft-model = Qwen3.8-27B-DFlash2-Q4_K_M.gguf
no-mmproj = true
batch-size = 4096
ubatch-size = 1024
ctx-size = 65536
parallel = 1
ngl = 999
jinja = true
chat-template-kwargs = {"preserve_thinking":true}
spec-type = draft-dflash
spec-draft-n-max = 7
spec-draft-backend-sampling = true
```

## 启动路由服务器 \{#start-the-router}

在 llama.cpp 文件夹中打开 PowerShell 并运行：

```powershell
.\llama.exe serve --models-preset qwen3.8-27b.ini --host 127.0.0.1
```

如果方案要求使用 Hugging Face 令牌，请在启动路由服务器前，在同一个 PowerShell 窗口中设置 `$env:HF_TOKEN`。首次启动时，路由服务器会下载模型文件。

通过[路由服务器健康检查](./llama-cpp.md#troubleshooting)确认服务器已就绪。在 Windows PowerShell 中请使用 `curl.exe`，因为 PowerShell 会将 `curl` 映射到另一个命令。`/models` 显示 `qwen3.8-27b` 的状态为 `loaded` 时，模型已就绪。

## 在 Pi 中使用模型 \{#use-the-model-in-pi}

按照[配置 Pi](./llama-cpp.md#configure-pi)中的步骤连接 `http://127.0.0.1:9931`。预设的小节名称就是模型 ID，因此本例中在 `/model` 里选择 `qwen3.8-27b`。

NVIDIA 方案中的内存设置假定只有选中的模型使用 GPU。如果 `/llama` 显示还加载了其他模型，请在使用该方案的模型前卸载它们。
