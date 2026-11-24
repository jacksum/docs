# 中文文档

`/docs/` 默认打开 Pi 文档（`/docs/pi/`）。用顶部「文档」菜单切换到 Oh My Pi（`/docs/omp/`）。每个项目有独立入口、版本、侧栏和许可；OMP 的原文清单见[项目说明](./sites/omp/README.md)。

## 本地预览

在项目根目录用 Node.js 24 或更新版本执行：

```powershell
npm ci
npm run build
npm run verify
npm run preview -- --port 4189
```

启动后打开[默认入口](http://127.0.0.1:4189/docs/)。单独编辑项目文档时，可以运行 `npm run dev --workspace ./sites/pi` 或 `npm run dev --workspace ./sites/omp`。预览跨项目导航时，使用上述预览命令。

## 新增项目

1. 在 `sites/<项目名>/` 新增 Rspress 工作区。该工作区自己的配置负责原文版本、导航和许可。
2. 在[项目目录](./collection.json)登记与目录名相同的 ID 和显示名称。MIT 译本可设置 `license` 为 `MIT`，让验证脚本核对 Markdown 导出中的完整许可。子站使用总站 `base` 加项目 ID 和末尾斜杠作为 Rspress `base`。
3. 在子站主题的顶部布局插槽接入[文档切换器](./shared/DocumentSwitcher.tsx)。已有项目的 ID 保持不变，以保留原地址。
4. 运行完整构建和验证，再从「文档」菜单打开新项目。
