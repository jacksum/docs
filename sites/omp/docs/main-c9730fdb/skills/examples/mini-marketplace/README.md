---
title: "mini-marketplace"
description: "Oh My Pi 官方仓库文档：mini-marketplace。"
---

# mini-marketplace \{#mini-marketplace}

这是一个最小的 `omp` 市场目录，展示 `marketplace.json` 格式。它使用相对路径来源，列出一个插件（`my-plugin`）。

## 安装命令 \{#install-command}

```
/marketplace add ./docs/skills/examples/mini-marketplace
/marketplace install my-plugin@example-marketplace
```

也可以通过 CLI：

```
omp plugin marketplace add ./docs/skills/examples/mini-marketplace
omp plugin install my-plugin@example-marketplace
```

从仓库根目录运行这些路径。通过 CLI 安装后，启动或重新加载 `omp` 以加载扩展；其 `session_start` 处理器会在交互模式下显示通知。

## 展示内容 \{#what-it-demonstrates}

- `marketplace.json` 的最少必填字段：`name`、`owner.name`、`plugins`
- 使用 `./` 前缀的相对路径插件来源（`"source": "./my-plugin"`）
- 插件与市场目录捆绑在同一目录树内
- 在 `metadata.description` 中提供市场描述
- 带有 `omp.extensions` 的 `package.json` 会在安装后加载捆绑的 TypeScript 工厂

## 结构 \{#structure}

```
mini-marketplace/
  .claude-plugin/
    marketplace.json      ← catalog
  README.md
  my-plugin/
    package.json          ← omp.extensions manifest
    index.ts              ← extension entry point
```

已发布市场和本地市场使用相同的目录文件位置。omp 会先加载市场根目录下的 `.omp-plugin/marketplace.json`，再回退到 `.claude-plugin/marketplace.json`（本示例提供的 Claude Code 兼容路径）。将 `/marketplace add` 指向此文件夹，即可加载示例。
