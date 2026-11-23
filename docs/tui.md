# 终端界面 \{#terminal-ui}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Terminal UI](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/tui.md)。[上游 MIT 许可证](./license.md)。

`@earendil-works/pi-tui` 提供 Pi 使用的终端组件系统。当内置的对话框、通知、状态文本和小组件无法满足交互需求时，扩展可以使用这套组件系统。

先使用[扩展](./extensions.md#interact-with-the-user)中的 `ctx.ui` 方法。只有当界面需要自行处理渲染、键盘或鼠标输入、焦点、布局或生命周期时，才构建自定义组件。

## 选择接入方式 \{#choose-an-integration-point}

| 需求 | 使用方式 |
|---|---|
| 选择、确认、输入或多行编辑 | `ctx.ui.select()`、`confirm()`、`input()` 或 `editor()` |
| 提供非阻塞反馈 | `ctx.ui.notify()` 或 `setStatus()` |
| 在编辑器附近持续显示内容 | `ctx.ui.setWidget()` |
| 替换页眉、页脚或编辑器 | 对应的 `ctx.ui` 组件工厂 |
| 临时交互界面或浮层 | `ctx.ui.custom()` |
| 自定义工具或会话条目的渲染方式 | 扩展渲染器 |

Pi 会按需将当前主题和按键绑定传给这些 API。不要在扩展内另建一个终端渲染器。

## 组件模型 \{#understand-the-component-model}

组件根据可用宽度渲染，返回由终端文本行组成的数组。组件可以处理键盘和鼠标输入。当组件状态或依赖主题的内容发生变化时，必须使缓存的输出失效。

将 `render()` 返回的文本行数组视为只读，子类中 `super.render()` 的返回值也是如此。只要内容未变，`Container`、`Box`、`Text` 和 `Markdown` 等内置组件就会返回同一个缓存数组。直接修改该数组会破坏后续帧。先复制数组，例如 `const lines = [...super.render(width)]`。如果生成结果的开销较大，就缓存结果。输出变化时，返回新数组：父组件会复用同一个数组，不会重新读取其内容。

每行渲染结果都不能超过传入的宽度。用终端中的可见列数衡量宽度，因为 ANSI 转义序列、宽字符、表情符号和组合字符会使显示宽度有别于字符串长度。

使用 `visibleWidth()`、`truncateToWidth()`、`sliceByColumn()` 和 `wrapTextWithAnsi()` 处理终端宽度，无需自行实现。Pi 会在每行结束后重置样式和超链接，因此要逐行重新应用样式。

组件状态变化后，先使受影响组件的缓存失效，再调用注入的 `tui.requestRender()`。TUI 会合并渲染请求并更新终端。

## 组合内置组件 \{#compose-built-in-components}

该包提供常用布局和控件所需的组件：

- `Text`、`Markdown`、`Image` 和 `TruncatedText` 用于渲染内容。
- `Container`、`VStack`、`HStack`、`Box` 和 `Spacer` 用于组合布局。
- `Input` 和 `Editor` 用于接收文本输入。
- `SelectList` 和 `SettingsList` 用于实现可搜索的选择和设置流程。
- `ScrollView` 提供范围受限的可滚动视口。
- `Loader` 和 `CancellableLoader` 显示任务正在进行。
- `MouseRegion` 为其包裹的组件添加鼠标指针交互。

优先使用这些组件，无需重新实现选择、滚动、文本编辑或宽度处理。扩展示例展示了如何将这些组件与 Pi 的边框和主题搭配使用。

## 处理键盘输入和焦点 \{#handle-keyboard-input-and-focus}

使用 `matchesKey()` 和 `Key` 处理终端键盘输入。解析器会考虑受支持的终端协议和修饰键。对于可配置的应用操作，扩展组件应使用注入的 `KeybindingsManager`。

显示文本光标的组件应实现 `Focusable`，并将 `CURSOR_MARKER` 紧贴在可见光标之前。用 `renderFakeCursor()` 包裹光标所在的单元格，让 TUI 以反色显示该单元格，或在显示硬件光标时隐藏 `CURSOR_MARKER` 后的模拟光标。TUI 根据该标记定位硬件光标，供输入法使用。

包裹 `Input` 或 `Editor` 的容器必须将自己的 `focused` 状态传给该子组件。否则，中文、日文、韩文等输入法的候选窗口可能出现在错误的屏幕位置。

替换主编辑器时，请继承 Pi 的 `CustomEditor`，以保留应用快捷键和智能体控制功能。

将自定义编辑器不处理的按键转交给基类实现。清除自定义编辑器工厂即可恢复默认编辑器。

## 处理鼠标输入 \{#handle-mouse-input}

全屏模式会将规范化后的鼠标事件分发给组件。事件处理程序可以将事件标记为已处理、捕获一系列拖动事件、请求焦点或请求渲染。

未处理的滚轮事件会滚动最近的 `ScrollView`。未处理的鼠标主键拖动仍可用于选中会话记录中的文本。OSC 8 链接优先于包裹它的点击区域。

普通模式将鼠标输入交给终端，因为回滚缓冲区由终端管理。即使全屏模式支持鼠标输入，也要为每项交互提供键盘操作方式。

## 使用自定义界面和浮层 \{#use-custom-screens-and-overlays}

`ctx.ui.custom()` 会暂时将交互区域交给一个组件控制。该组件调用传入的完成回调时，返回的 Promise 就会兑现。

### 构建最简自定义界面 \{#build-a-minimal-custom-screen}

这个完整的扩展示例演示了自定义组件的生命周期：在传入的宽度内渲染，使用注入的按键绑定，状态变化后使缓存的输出失效，请求渲染，最后调用 `done()` 完成交互。

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("pick-target", {
    description: "Pick a deployment target",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui") {
        ctx.ui.notify("pick-target requires interactive mode", "error");
        return;
      }

      const choices = ["development", "staging", "production"];
      const selected = await ctx.ui.custom<string | undefined>((tui, theme, keybindings, done) => {
        let selectedIndex = 0;
        let cachedWidth: number | undefined;
        let cachedLines: string[] | undefined;

        const invalidate = () => {
          cachedWidth = undefined;
          cachedLines = undefined;
        };

        return {
          render(width: number): string[] {
            if (cachedLines && cachedWidth === width) return cachedLines;

            cachedWidth = width;
            cachedLines = [
              theme.fg("accent", "Choose a deployment target"),
              ...choices.map((choice, index) => `${index === selectedIndex ? "> " : "  "}${choice}`),
              theme.fg("dim", "up/down move, enter selects, escape cancels"),
            ].map((line) => truncateToWidth(line, width));
            return cachedLines;
          },
          handleInput(data: string): void {
            if (keybindings.matches(data, "tui.select.up")) {
              selectedIndex = (selectedIndex - 1 + choices.length) % choices.length;
            } else if (keybindings.matches(data, "tui.select.down")) {
              selectedIndex = (selectedIndex + 1) % choices.length;
            } else if (keybindings.matches(data, "tui.select.confirm")) {
              done(choices[selectedIndex]);
              return;
            } else if (keybindings.matches(data, "tui.select.cancel")) {
              done(undefined);
              return;
            } else {
              return;
            }

            invalidate();
            tui.requestRender();
          },
          invalidate,
        };
      });

      if (selected) ctx.ui.notify(`Selected ${selected}`, "info");
    },
  });
}
```

此组件不显示文本光标，因此不需要实现 `Focusable`。包含 `Input` 或 `Editor` 的组件必须实现 `Focusable`，并将自身的 `focused` 值传给该子组件。

自定义组件默认不会报告 Pi 正在等待用户输入，因为 `ctx.ui.custom()` 也用于承载加载指示器等非阻塞界面。如果组件需要等待回答，请传入 `blocked: { kind: "question", message: "Pick a color" }`，让支持[程序状态](./terminal-setup.md#program-status)的终端显示 Pi 正处于阻塞状态。`kind` 可取 `"question"`、`"permission"` 或 `"auth"`。内联组件在可见期间报告阻塞状态。如果新对话框或组件取代了它，则由新显示的界面报告自己的状态。浮层从显示起一直报告阻塞状态，直到调用 `done()`。即使通过 `setHidden()` 将它隐藏，或它被另一个浮层遮住，仍会报告阻塞状态。如果同时打开多个阻塞式提示，使用最近显示的提示所提供的 `kind` 和 `message`。

传入 `overlay: true` 可在现有内容上方绘制浮层。浮层选项控制大小、锚点、偏移量、边距，以及浮层如何随可用空间显示或隐藏。交互仍在进行时，可以通过浮层句柄更改焦点，也可以调用 `setHidden()` 暂时隐藏或重新显示浮层。

拥有焦点的浮层在常规渲染过程中会保留输入控制权。如果浮层仍然可见，但需要让其他组件接收输入，请通过句柄显式释放或转移焦点。

每个自定义组件实例只用于一次交互。再次开始该交互时，创建新实例。

调用传给组件工厂的完成回调来结束交互。该回调会兑现 `ctx.ui.custom()` 返回的 Promise，并释放组件。不要对通过 `ctx.ui.custom()` 创建的浮层调用 `OverlayHandle.hide()`。

参阅 [`overlay-qa-tests.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/overlay-qa-tests.ts)，了解浮层的定位、堆叠、焦点、响应式显隐和动画行为。

## 正确应用主题 \{#apply-themes-correctly}

使用传给扩展或组件回调的主题。主题辅助函数为强调色、弱化文本、成功、警告、错误、工具输出和 Markdown 等语义项生成带 ANSI 样式的字符串。

使用 `theme.style()` 将前景色、背景色与文本属性组合起来：

```typescript
return new Text(
  theme.style("Done!", {
    fg: "success",
    bg: "toolSuccessBg",
    bold: true,
  }),
  0,
  0,
);
```

样式颜色可以是语义化主题标记，也可以是具体的 `Color` 值。`fg` 接受前景色标记，`bg` 接受背景色标记。若要将某个标记的颜色用于另一位置，请传入具体颜色，例如 `{ fg: theme.colors.userMessageBg }`。通过 `theme.colors` 获取具体颜色。需要计算颜色时，可使用 `@earendil-works/pi-tui` 中的 `mixColors()` 等工具函数。如果主题将标记设为终端默认色，渲染时会使用终端自己的颜色。`theme.colors` 会返回终端报告的对应颜色；如果终端没有报告，则返回估算值。可根据 `theme.appearance`（`"dark"` 或 `"light"`）决定如何处理颜色，例如调亮还是调暗。Pi 会根据终端能力将结果转换为真彩色或 256 色输出。每套主题只转换一次主题标记。尽可能在渲染流程之外计算具体颜色。

也可以继续使用 `theme.fg()` 和 `theme.bg()` 辅助函数来应用单个语义颜色。

不要长期保存含有主题色的字符串，除非 `invalidate()` 会重新生成它们。切换主题会清除渲染缓存，但无法移除已写入应用状态的旧 ANSI 颜色。

在渲染时求值的主题回调无需专门重建。无状态组件也可以在每次渲染时计算带主题样式的输出。

参阅[主题](./themes.md)，了解如何创建终端配色方案。渲染需要与当前应用主题一致的 Markdown 时，使用 Pi 的 `getMarkdownTheme()`。

## 保持渲染响应及时 \{#keep-rendering-responsive}

渲染在交互过程中执行。按宽度和内容缓存开销较大的布局和高亮计算结果，再通过 `invalidate()` 清除这些缓存。

默认视图应保持紧凑。用户可展开内容或进入专用界面查看详情。自定义工具渲染时，要处理部分结果；如果可以安全地更新上次使用的组件，就复用它。

排查渲染问题时，使用 `PI_TUI_WRITE_LOG` 捕获原始 ANSI 流。测试较窄的可用宽度、宽字符、尺寸调整事件、主题切换、焦点切换，以及普通和全屏两种模式。

## 示例与源码 \{#examples-and-source}

这些经过检查的扩展示例涵盖了主要用法：

- [`preset.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/preset.ts) 和 [`tools.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/tools.ts) 使用选择列表和设置列表。
- [`qna.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/qna.ts) 使用可取消的异步界面。
- [`modal-editor.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/modal-editor.ts) 替换编辑器。
- [`custom-footer.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/custom-footer.ts) 替换页脚。
- [`widget-placement.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/widget-placement.ts) 在编辑器周围持续显示内容。
- [`doom-overlay/`](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/extensions/doom-overlay/) 演示持续渲染的浮层。

公开的导出项定义在 [`packages/tui/src/index.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/tui/src/index.ts) 中。参阅[扩展](./extensions.md)，了解扩展的生命周期、状态、工具、事件和各模式下的行为。
