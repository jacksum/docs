# 使用 Termux 在 Android 上运行 Pi \{#run-pi-on-android-with-termux}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Run Pi on Android with Termux](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/termux.md)。[上游 MIT 许可证](./license.md)。

Pi 可以通过 [Termux](https://termux.dev/) 在 Android 上运行。Termux 提供终端模拟器和 Linux 环境。Pi 支持文本输入、文件工具和 Shell 命令。借助 Termux:API，Pi 可以通过 Android 剪贴板复制和粘贴文本，但不支持从剪贴板粘贴图片。

## 准备工作 \{#before-you-begin}

从 [GitHub 或 F-Droid](https://github.com/termux/termux-app#installation) 安装 Termux。不要使用已弃用的 Google Play 版本。

[Termux:API](https://github.com/termux/termux-api#installation) 是可选组件。仅在需要 Pi 复制或粘贴 Android 剪贴板中的文本，或需要让 Shell 命令调用 Android 设备 API 时安装。

## 安装 Pi \{#install-pi}

1. 更新 Termux 软件包：

   ```bash
   pkg update && pkg upgrade
   ```

2. 安装 Node.js 和 Git：

   ```bash
   pkg install nodejs git
   ```

3. 安装 Pi：

   ```bash
   npm install -g --ignore-scripts @earendil-works/pi-coding-agent
   ```

4. 验证安装：

   ```bash
   pi --version
   ```

5. 切换到你要工作的文件夹，启动 Pi：

   ```bash
   cd /path/to/working-folder
   pi
   ```

接下来，按照[快速上手](./quickstart.md#3-choose-a-model)连接模型并运行第一个任务。

## 访问 Android 共享存储 \{#access-android-shared-storage}

授权之前，Termux 无法访问 Android 共享存储。运行一次以下命令：

```bash
termux-setup-storage
```

授权后，可以在 `/storage/emulated/0` 下访问 Android 共享存储，也可以通过 Termux 在 `~/storage/` 下创建的链接访问。

只有在需要 Pi 访问这些文件时，才授予此权限。在 Termux 中运行的命令和工具使用与 Termux 进程相同的存储权限。

## 使用剪贴板命令 \{#use-clipboard-commands}

Pi 使用 `termux-clipboard-set` 复制文本，使用 `termux-clipboard-get` 响应剪贴板粘贴快捷键。在 Shell 中也可以直接使用这两个命令。安装 Termux:API 应用及其命令行软件包：

```bash
pkg install termux-api
```

验证剪贴板集成：

```bash
printf 'Pi clipboard test' | termux-clipboard-set
termux-clipboard-get
```

第二条命令应输出 `Pi clipboard test`。

Termux 的剪贴板 API 只支持文本。Pi 的剪贴板粘贴快捷键会将文本插入编辑区，但无法附加剪贴板中的图片。

## 添加 Termux 专用指令 \{#add-termux-specific-instructions}

Pi 能检测到自己正在 Termux 中运行，但无法推断你希望它如何与 Android 交互。请只将与你的工作相关的环境信息添加到 `~/.pi/agent/AGENTS.md`：

````markdown
# Termux environment

- Pi runs in Termux on Android.
- Shared Android storage is under `/storage/emulated/0`.
- Open URLs with `termux-open-url "https://example.com"`.
- Open files with `termux-open <path>`.
- Do not access shared storage unless the task requires it.
````

如果在会话期间修改了此文件，请运行 `/reload`。

## 问题排查 \{#troubleshooting}

### 剪贴板集成失败 \{#clipboard-integration-fails}

确认已安装以下两个组件：

1. 与 Termux 来自同一安装渠道的 Termux:API Android 应用
2. `termux-api` 命令行软件包

然后在 Pi 之外运行上面的剪贴板验证命令。如果命令仍然失败，请先修复 Termux:API 安装，再重试 Pi 的复制命令。

### 访问共享存储时提示权限不足 \{#shared-storage-reports-permission-denied}

运行 `termux-setup-storage`，批准 Android 的权限请求。然后重试 `~/storage/` 或 `/storage/emulated/0` 下的路径。

### 安装后找不到 Pi \{#pi-is-not-found-after-installation}

打开一个新的 Termux Shell 并运行：

```bash
npm prefix -g
command -v pi
```

确认 npm 的全局可执行文件目录已加入 `PATH`。如果软件包尚未安装，请重新安装 Pi。
