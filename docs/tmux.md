# 在 tmux 中运行 Pi \{#run-pi-in-tmux}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Run Pi in tmux](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/tmux.md)。[上游 MIT 许可证](./license.md)。

Pi 可以在 tmux 中运行，但 tmux 可能把 `Shift+Enter`、`Ctrl+Enter` 和单独按下的 `Enter` 报告为同一个按键。启用扩展按键后，Pi 就能区分这几种输入。

## 检查 tmux 版本 \{#check-your-tmux-version}

```bash
tmux -V
```

对于 tmux 3.5 或更新版本，请使用下文推荐的 CSI-u 配置。对于 tmux 3.2 至 3.4，请使用旧版配置。

## 在 tmux 3.5 或更新版本中启用扩展按键 \{#enable-extended-keys-in-tmux-35-or-newer}

向 `~/.tmux.conf` 添加以下内容：

```text
set -g extended-keys on
set -g extended-keys-format csi-u
```

终端未直接提供 Kitty 键盘协议时，Pi 会请求扩展按键报告。CSI-u 是通过 tmux 转发带修饰键输入时最可靠的格式。

## 重启 tmux \{#restart-tmux}

该配置应用于 tmux 服务端。要确保配置已生效，请关闭现有的 tmux 会话，然后启动新的服务端。

如果选择用命令行停止服务端，请先保存工作。以下第一条命令会终止该服务端管理的所有会话：

```bash
tmux kill-server
tmux
```

## 验证带修饰键的输入 \{#verify-modified-keys}

在新 tmux 会话中启动 Pi，然后检查：

1. `Shift+Enter` 在编辑区插入新行。
2. `Enter` 提交提示词。
3. 在 macOS 和 Linux 上，`Alt+Enter` 会将后续消息加入队列。Windows 和 WSL 默认使用 `Ctrl+Q`。

如果这些按键的行为仍与单独按下 `Enter` 相同，请确认 tmux 外部的终端能报告带修饰键的输入。参阅[配置终端](./terminal-setup.md)。

## 使用 tmux 3.2 至 3.4 \{#use-tmux-32-through-34}

这些版本支持扩展按键，但不支持 `extended-keys-format csi-u`。只添加以下设置：

```text
set -g extended-keys on
```

Pi 支持这些版本使用的 xterm `modifyOtherKeys` 格式。重启 tmux 后，重复上述验证步骤。

如果使用更旧的版本，请升级 tmux 或在 tmux 外运行 Pi，避免依赖带修饰键的 Enter 快捷键。

## 已知问题 \{#known-issues}

| 问题 | 受影响版本 | 解决办法 |
|---|---|---|
| 启动时编辑区出现 `c0c/0c0c/0c0c` 等文本（[tmux#4749](https://github.com/tmux/tmux/issues/4749)） | tmux 3.6 | 升级 tmux。更改 Pi 主题无效。 |
