---
title: "ask"
description: "Oh My Pi 官方仓库文档：ask。"
---

# ask \{#ask}

> 请交互用户填写一个 HTML 表单，并返回提交的表单数据。

## 来源 \{#source}

- 入口：`packages/coding-agent/src/tools/ask.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/ask.md`
- 主要协作组件：
   - `packages/coding-agent/src/tools/html-form/parse.ts`：`parseHtmlForm`，处理分节、字段和隐藏输入
   - `packages/coding-agent/src/tools/html-form/data.ts`：表单数据结构、默认值、字段问题和验证
   - `packages/coding-agent/src/ui/forms/html-form/html-form.tsx`：`HtmlFormDialog`，交互式表单
   - `packages/coding-agent/src/modes/settings.ts`：`ask.timeout` / `ask.notify` 默认值
   - `packages/coding-agent/src/ui/tools/ask.tsx`：调用/结果渲染

## 输入 \{#inputs}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `html` | `string` | 是 | 一个 HTML `<form>`。存在第一个 `<form>` 时，会忽略其外部的内容。 |

表单采用普通的语义化 HTML。控件包括：`<input type="radio">`（单选）、`type="checkbox"`（多个控件同名时为多选，单独使用时为是/否标志）、`<select>` / `<select multiple>`、文本类输入（`text`、`number`、`range`、`date`、`email`、`url` 等）、`<textarea>` 和 `type="hidden"`。`checked`、`selected` 和 `value` 用于预选答案；`required`、`min`/`max`、`minlength`/`maxlength` 和 `pattern` 会被强制校验。上下文从 `<p>`、标题、列表、`<pre>`、`<table>` 及 `<fieldset>`/`<legend>` 分组渲染。图片从 `<img src>`（http(s) URL、`data:` URI、`file:` URL，或相对于会话工作目录解析的路径）及内联 `<svg>` 渲染；`<label>` 内的图片只贡献其 `alt` 文本。`<script>`、`<style>` 和按钮会被丢弃。

## 输出 \{#outputs}

- 一次性结果。
- `content[0].text`：
   - 提交：`User answers:`，后接缩进格式的表单数据 JSON
   - 超时：`No answer before the timeout; submitted the form's current values:`，后接 JSON
- 表单数据（`HtmlFormData`）：以控件的 `name` 为键。单选组或单选 `<select>` 给出所选的 `value`（未选择时省略）；复选框组或 `<select multiple>` 给出数组；单独的复选框在选中时给出其 `value`，否则省略；当文本可解析时，`number`/`range` 输入给出数字；其他文本字段给出其文本；隐藏输入原样传递。禁用的选项和未命名的控件不会出现。
- “其他”答案：对于每个单选组，以及具有两个或更多选项的复选框组（不包括 `<select>`），如果其选项中没有标为“其他……”的选项，UI 会提供一个自由文本“其他”答案（`ChoiceField.other`）。去除首尾空白后的文本会成为单选组的值（`"db": "MySQL 8"`），或追加到复选框组的数组中（`["ci", "terraform"]`）；空白文本不算答案。回退界面会添加一行 `Other (type your own)`，用于打开 `input`；协作访客会获得同样的一行及编辑器；ACP 则添加可选的 `<name>_other` 字符串属性。
- 选项备注：在交互式表单中，`n`（`app.ask.note`）为选项添加备注；所选选项的备注会在 JSON 后的 `Option notes:` 下显示，并存入 `details.notes`（`{ name, question, option, value, text }[]`）。回退界面、协作访客和 ACP 不收集备注。
- 备注图片：工具打开表单时启用 `acceptImages`。备注处于打开状态时，会接收粘贴的图片并表示为 `[Image #N, WxH]` 标记，图片可来自 Ctrl+V（Windows 上为 Alt+V）、终端自身的粘贴，或粘贴的图片文件路径。Enter 会等待仍在加载的粘贴完成。Esc 会丢弃自备注打开以来粘贴的图片，删除标记则会移除对应图片。在结果中，所有备注的标记会统一重新编号。每张图片在 `content` 中位于文本块之后、其源路径通知之后；启用 `images.describeForTextModels` 时，纯文本模型还会获得其视觉描述。`details.notes` 保留重新编号后的文本，但不保留图片数据。
- `details: AskToolDetails`：`{ answers: { name, question, answer }[]; notes?; timedOut? }`，按表单顺序为每个命名字段提供一个答案。`question` 取字段的标签，否则取其紧前方的文本块，否则取所属节的图例，否则取其名称；`answer` 显示选项标签，而不是值。
- 取消和无界面情形会抛出异常，而不是返回结构化的成功结果。工具不会流式发送更新。

## 流程 \{#flow}

1. 注册需要启用 `ask.enabled`，而 `AskTool.createIf()` 要求 `session.canPromptUser ?? session.hasUI` 成立（或由声明支持 `ask` 的无界面派生会话提供支持）。
2. `execute()` 要求存在 `context.hasUI` 和 `context.ui`。没有它们时，无界面派生会话会收到 `ToolError`，告知其模型将尚未解决的问题放在最终答复中；其他会话则中止上下文并抛出 `ToolAbortError("Ask tool requires interactive mode")`。
3. 解析表单。没有命名控件的表单会返回错误文本结果，而不是抛出异常。
4. 读取 `ask.timeout`（单位为秒；`0` 表示禁用），并在启用计划模式期间完全禁用超时。
5. 如果会话有本地 UI，且 `ask.notify` 不为 `off`，则发送终端通知：`Waiting for input`。当 `speech.enabled` 为 true 时，会朗读字段问题。
6. 当 UI 提供 `formDialog` 时，整个表单一次性打开：交互式 TUI 显示 `HtmlFormDialog`（提交时验证；任何按键都会重置倒计时），支持表单征询的 ACP 客户端会收到一次征询，每个字段对应一个属性，而 RPC 宿主无需选择启用即可收到一个携带 HTML 的 `form` 请求。在 Tern 中，具有两个或更多顶层 `<fieldset>` 的表单会为每个字段集显示一个标签页，另加一个“审查”标签页；位于字段集之外的字段会获得自己的标签页，并包含它前面的上下文。问题标签页底部为“隐藏/取消/下一步”栏，“提交”只出现在“审查”页。每个标签页的内容在该栏上方滚动，该栏保持可见，`app.ask.hide`（`Alt+H`）或“隐藏”会将表单折叠为一行。
7. 否则（不提供 `formDialog` 的扩展 UI），按顺序遍历命名字段。每个提示的标题是字段周围的表单文本（分节图例，自上一个字段以来的段落、列表、`<pre>` 块和表格，该字段自身选项之间的文本，以及对于最后一个字段而言其后的文本；均以空行分隔的纯文本表示），后接字段问题：
   - 单选组 / 单选下拉框：一个 `select`，打开时定位到预选项
   - 复选框组 / 单独复选框 / 多选下拉框：带有 `Done selecting` 行的复选框 `select` 循环（必填组尚未选中任何项时隐藏该行）
   - 空的单行输入：带占位文本的 `input`
   - 文本区域或预填输入：带当前文本的 `editor`
   - 文本答案会连同验证错误一起重新询问，直至有效
8. 超时会提交表单的当前值：在回退界面中，未回答的字段保留默认值，复选框组保留截至当时已勾选的内容。设置 `details.timedOut`。
9. 用户取消会中止工具上下文并抛出 `ToolAbortError("Ask tool was cancelled by the user")`。

## 副作用 \{#side-effects}

- 用户可见的提示 / 交互式 UI
   - 可用时使用 `context.ui.formDialog(...)`；否则使用 `context.ui.select(...)`、`input(...)` 和 `editor(...)`。
   - 会话有本地 UI 时发送终端通知，除非 `ask.notify=off`。
   - 当 `speech.enabled=true` 时，通过语音合成器朗读字段问题。
- 会话状态
   - 读取计划模式状态以禁用超时。
   - 在无界面使用或用户取消时调用 `context.abort()`。
- 后台工作 / 取消
   - 使用 `untilAborted(...)` 包装 UI 等待，使中止信号能够打断待处理对话框。用户排队发送的消息会以 `ToolAbortError("Ask interrupted by message")` 关闭对话框，但不会中止本轮运行。

## 限制与上限 \{#limits--caps}

- 由于 `AskTool.strict=true`，未知参数会被拒绝。
- `ask.timeout` 默认为 `0` 秒（禁用）。计划模式始终禁用它。
- 在回退界面中，`editor` 提示（文本区域、预填输入）没有超时；`select` 和 `input` 提示有超时。对于报告展示/重置事件的提示界面，会在这些事件发生时启动或重新设置截止时间；否则，计时器在请求提示时启动。
- `AskTool.concurrency = "exclusive"`：由于共享对话框界面，该工具在其工具批次中单独运行。
- 表单打开期间，图片会在后台加载：每张最多 10 MiB，远程图片需在 10 秒内完成；支持 PNG、JPEG、GIF、WebP 和 SVG。加载失败时会显示其 `alt` 和原因。只有交互式 TUI/Tern 表单会绘制图片；回退提示和 ACP 不显示图片。

## 错误 \{#errors}

- 缺少交互式 UI：抛出 `ToolAbortError("Ask tool requires interactive mode")`。
- 用户取消：抛出 `ToolAbortError("Ask tool was cancelled by the user")`。
- 输入期间收到中止信号：转换为 `ToolAbortError("Ask input was cancelled")`。
- 没有命名控件：返回文本错误结果，`details.answers` 为空。

## 备注 \{#notes}

- `/tree` 重新回答会从持久化的 `ask` 调用中恢复原始 `html`，并重新打开表单以创建同级答案分支；不含 `html` 字符串的调用（旧版 `questions` 会话）会回退为普通的叶节点移动。
- 扩展为自己的提示保留 `ui.askDialog`（基于问题）；只有该工具使用表单。
