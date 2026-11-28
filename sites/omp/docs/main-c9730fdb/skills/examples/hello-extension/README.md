---
title: "hello-extension"
description: "Oh My Pi 官方仓库文档：hello-extension。"
---

# hello-extension \{#hello-extension}

这是一个最小的 `omp` 扩展，展示两种最常见的编写方式：订阅 `session_start`，在加载时发送通知；注册 `/hello` 斜杠命令，向对话发送问候。它有意保持精简，可将其复制粘贴，作为编写自己扩展的起点。

## 安装 \{#install}

**选项 A：放入用户扩展目录：**

```
cp -r . ~/.omp/agent/extensions/hello-extension
```

重新启动 `omp`。你会立即看到启动通知。

使用 `omp --profile <name>` 时，在默认布局下应使用 `~/.omp/profiles/<name>/agent/extensions/hello-extension`。`PI_CODING_AGENT_DIR` 改变的是默认配置档案的智能体目录，而不是命名配置档案的目录。已初始化的 XDG 根目录可能改变这些位置。

**选项 B：在设置的 `extensions` 数组中指向它：**

```yaml
# ~/.omp/agent/config.yml
extensions:
   - /path/to/hello-extension
```

**选项 C：通过 CLI 标志单次加载：**

```
omp --extension ./hello-extension
```

## 用法 \{#usage}

加载后，在 omp 提示符中输入 `/hello` 或 `/hello Ada`。该命令会向对话发送一条可见的问候自定义消息，并显示“Message sent!”通知。

## 展示内容 \{#what-it-demonstrates}

- 接收 `ExtensionAPI` 的默认导出工厂
- `pi.on("session_start", ...)`：会话生命周期钩子
- `pi.registerCommand(...)`：斜杠命令注册
- `ctx.ui.notify(...)`：面向用户的通知
- 带有 `omp.extensions` 清单字段的 `package.json`
