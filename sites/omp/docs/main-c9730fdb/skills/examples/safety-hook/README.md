---
title: "safety-hook"
description: "Oh My Pi 官方仓库文档：safety-hook。"
---

# safety-hook \{#safety-hook}

一个演示 `tool_call` 阻止机制的 `omp` 扩展。它拦截 `bash` 工具调用，当命令匹配后跟绝对路径的 `rm -rf` 时，返回 `{ block: true, reason: "..." }`，阻止工具执行。

这个刻意收窄匹配范围的正则表达式也会阻止 `/tmp/example` 等目标。它不解析 shell 语法，也不涵盖标志顺序调整、引号、别名、其他删除工具或直接 eval 辅助函数；不要将其视为完整的安全边界。

## 演示内容 \{#what-it-demonstrates}

- `pi.on("tool_call", ...)`：执行前拦截
- `return { block: true, reason: "..." }`：阻止契约
- 对 bash 输入的正则表达式防护（`/\brm\s+-rf\s+\//`）

## 安装 \{#install}

```
cp -r . ~/.omp/agent/extensions/safety-hook
```

重启 `omp`。该钩子在加载此扩展的会话中生效。

对于命名配置档案，请使用该配置档案的智能体扩展目录。`PI_CODING_AGENT_DIR` 覆盖默认配置档案的智能体目录，而非命名配置档案的目录。已初始化的 XDG 根目录可能改变这些位置。

或者加载一次：

```
omp --extension ./safety-hook
```

## 工作原理 \{#how-it-works}

```
LLM calls bash tool
       │
       ▼
tool_call handlers run
       │
       ├─ command matches /\brm\s+-rf\s+\// ?
       │       yes → { block: true, reason: "..." }  ←  execution stops, reason sent to LLM
       │       no  → undefined                        ←  execution continues normally
       ▼
tool executes (if not blocked)
```

`reason` 文本是 LLM 收到的工具错误，因此它可以理解调用被拒绝的原因，并尝试其他方法。
