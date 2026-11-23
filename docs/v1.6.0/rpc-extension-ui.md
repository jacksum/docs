# RPC 扩展界面 \{#rpc-extension-ui}

扩展可以通过 `ctx.ui` 请求用户交互。在 RPC 模式下，受支持的调用会使用请求与响应子协议，与常规 [RPC 命令](./rpc-commands.md)和[会话事件](./json.md)并行工作。

扩展界面的方法分两类：

- **对话框方法**（`select`、`confirm`、`input`、`editor`）：向标准输出发送 `extension_ui_request`，然后等待客户端通过标准输入发回具有相同 `id` 的 `extension_ui_response`。
- **无需等待响应的方法**（`notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`）：向标准输出发送 `extension_ui_request`，不期待响应。客户端可以显示该信息，也可以忽略它。

如果对话框方法包含 `timeout` 字段，超时后智能体端会自动以默认值结束等待。客户端无需自行跟踪超时。

## 限制 \{#limitations}

一些 `ExtensionUIContext` 方法需要直接操作终端界面，因此在 RPC 模式下不受支持，或只能提供部分功能：

- `custom()` 返回 `undefined`。
- `onTerminalInput()` 返回一个不执行任何操作的取消订阅函数。
- `setWorkingMessage()`、`setWorkingVisible()`、`setWorkingIndicator()`、`setHiddenThinkingLabel()`、`setFooter()`、`setHeader()`、`addAutocompleteProvider()`、`setEditorComponent()` 和 `setToolsExpanded()` 不执行任何操作。
- `getEditorText()` 返回 `""`，`getEditorComponent()` 返回 `undefined`。
- `getToolsExpanded()` 返回 `false`。
- `pasteToEditor()` 将调用交给 `setEditorText()`，不处理终端粘贴。
- `getAllThemes()` 返回 `[]`，`getTheme()` 返回 `undefined`。
- `setTheme()` 返回 `{ success: false, error: "Theme switching not supported in RPC mode" }`。

在 RPC 模式下，`ctx.mode` 为 `"rpc"`，`ctx.hasUI` 为 `true`，因为对话框和无需等待响应的方法仍可通过扩展界面子协议使用。对 `custom()` 等依赖真实终端的 TUI 功能，请先检查 `ctx.mode === "tui"`。

## Pi 发出的请求 \{#requests-from-pi}

所有请求都包含 `type: "extension_ui_request"`、唯一的 `id` 和 `method` 字段。

### select \{#select}

请用户从列表中选择。包含 `timeout` 字段的对话框方法以毫秒为单位指定超时。如果客户端没有及时响应，智能体会自动以 `undefined` 结束等待。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-1",
  "method": "select",
  "title": "Allow dangerous command?",
  "options": ["Allow", "Block"],
  "timeout": 10000
}
```

预期响应：`extension_ui_response` 包含 `value`（选中的选项字符串），或包含 `cancelled: true`。

### confirm \{#confirm}

请用户确认或拒绝。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-2",
  "method": "confirm",
  "title": "Clear session?",
  "message": "All messages will be lost.",
  "timeout": 5000
}
```

预期响应：`extension_ui_response` 包含 `confirmed: true/false`，或包含 `cancelled: true`。

### input \{#input}

请用户输入任意文本。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-3",
  "method": "input",
  "title": "Enter a value",
  "placeholder": "type something..."
}
```

预期响应：`extension_ui_response` 包含 `value`（输入的文本），或包含 `cancelled: true`。

### editor \{#editor}

打开多行文本编辑器，可选地预填内容。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-4",
  "method": "editor",
  "title": "Edit some text",
  "prefill": "Line 1\nLine 2\nLine 3"
}
```

预期响应：`extension_ui_response` 包含 `value`（编辑后的文本），或包含 `cancelled: true`。

### notify \{#notify}

显示通知，不需要响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-5",
  "method": "notify",
  "message": "Command blocked by user",
  "notifyType": "warning"
}
```

`notifyType` 字段可取 `"info"`、`"warning"` 或 `"error"`。省略时默认为 `"info"`。

### setStatus \{#setstatus}

设置或清除底部状态栏中的某个状态项。不需要响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-6",
  "method": "setStatus",
  "statusKey": "my-ext",
  "statusText": "Turn 3 running..."
}
```

发送 `statusText: undefined`，或省略该字段，可清除这个键对应的状态项。

### setWidget \{#setwidget}

设置或清除显示在编辑区上方或下方的小组件。小组件由多行文本组成，不需要响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-7",
  "method": "setWidget",
  "widgetKey": "my-ext",
  "widgetLines": ["--- My Widget ---", "Line 1", "Line 2"],
  "widgetPlacement": "aboveEditor"
}
```

发送 `widgetLines: undefined`，或省略该字段，可清除小组件。`widgetPlacement` 字段为 `"aboveEditor"`（默认）或 `"belowEditor"`。RPC 模式只支持字符串数组，组件工厂会被忽略。

### setTitle \{#settitle}

设置终端窗口或标签页的标题。不需要响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-8",
  "method": "setTitle",
  "title": "pi - my project"
}
```

### set_editor_text \{#set_editor_text}

设置输入编辑区的文本。不需要响应。

```json
{
  "type": "extension_ui_request",
  "id": "uuid-9",
  "method": "set_editor_text",
  "text": "prefilled text for the user"
}
```

## 发给 Pi 的响应 \{#responses-to-pi}

只有对话框方法（`select`、`confirm`、`input`、`editor`）需要发送响应。`id` 必须与请求中的 `id` 一致。

### 返回值的响应（select、input、editor） \{#value-response-select-input-editor}

```json
{"type": "extension_ui_response", "id": "uuid-1", "value": "Allow"}
```

### 确认响应（confirm） \{#confirmation-response-confirm}

```json
{"type": "extension_ui_response", "id": "uuid-2", "confirmed": true}
```

### 取消响应（任意对话框） \{#cancellation-response-any-dialog}

关闭任意对话框。对于 `select`、`input` 和 `editor`，扩展收到 `undefined`；对于 `confirm`，扩展收到 `false`。

```json
{"type": "extension_ui_response", "id": "uuid-3", "cancelled": true}
```

## 示例 \{#example}

参见经过检查的 [RPC 扩展界面客户端](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/rpc-extension-ui.ts)及其[演示扩展](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/rpc-demo.ts)。

导出的请求和响应联合类型定义在 [`rpc-types.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/src/modes/rpc/rpc-types.ts) 中。与运行模式无关的扩展指南见[扩展](./extensions.md#ui-and-modes)。
