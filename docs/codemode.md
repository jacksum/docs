# 代码模式 \{#codemode}

> 非官方简体中文译文。上游原文：[Pi v1.6.0](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/codemode.md)。[许可证](./license.md)。

`codemode` 工具让模型编写 JavaScript 脚本来调用 Pi 的其他工具，并运行分类器、图像模型等非 LLM 模型。模型只会收到脚本的输出，因此脚本可以并行发起调用，也可以在模型看到结果之前先筛选大量数据。要开启此功能，请参阅[启用代码模式](./cli.md#enable-codemode)。

## 脚本 \{#scripts}

工具接受原始 JavaScript 源码，不接受 JSON 或 Markdown 代码围栏。源码在 QuickJS 沙箱中作为异步函数的函数体运行，因此可以在顶层使用 `await` 和 `return`。沙箱不提供 Node API、文件系统、网络或计时器。脚本只能通过工具和 `models` 与外部交互。

脚本可以在开头写一行选项。选项行必须位于第一行，否则调用会在脚本运行前失败：

```js
// @options: {"max_output_tokens": 2000, "timeout_ms": 60000}
```

- `max_output_tokens`（默认值为 10000）限制输出长度。超出限制时，结果只保留输出的开头和结尾。完整文本写入临时文件，结果中会给出该文件的路径。如果文本和 Base64 图像数据合计超过 16777216 个字符，或者 `text()`、`image()` 和 `console` 的调用总次数超过 100000 次，脚本就会失败。大量数据应通过工具写入文件。
- `timeout_ms` 为整个脚本设置硬性时限，包括等待空闲工作线程的时间。默认不设置该选项。生成图像可能需要几分钟，因此不要为生成图像的脚本设置过短的时限。

结果首先显示 `Script completed` 或 `Script failed`，随后是实际耗时和输出。文本项和图像项按顺序显示，各占一行。如果输出中有多个文本项（来自 `text()` 或 `return`），每项都以一行 `==> text N/M <==` 开头。`console` 调用的内容在其他输出之后统一放在一个 `<console_output>` 块中，每次调用占一行。如果脚本失败，结果会保留已产生的部分输出，随后显示 `Script error:` 和错误信息。工具调用会实际执行，脚本失败前发出的调用不会回滚。脚本结束时仍在运行的调用会被取消，未等待的 Promise 会被丢弃。

## 全局变量和函数 \{#globals}

| 全局变量或函数 | 用途 |
|---|---|
| `tools.<name>(args)` | 调用工具。参阅[调用工具](#call-tools)。 |
| `text(value)` | 向输出添加一个文本项。字符串原样添加，其他值以 JSON 格式添加。 |
| `image(value)` | 向输出添加一张图像。接受 Base64 编码的 `data:` URL、`{ image_url }` 对象，或形如 `{ type: "image", data, mimeType }` 的图像块，例如 MCP 工具或 `models.generateImages()` 返回的图像块。不支持远程 URL。支持 PNG、JPEG、GIF 和 WebP。每张图像也会保存到临时文件，结果会先给出路径，再显示图像。 |
| `console.log(...)` | 在其他输出之后的 `<console_output>` 块中添加一行。参数之间用空格分隔；`info`、`warn`、`error` 和 `debug` 的行为相同。 |
| `return value` | 顶层 `return` 会像 `text()` 一样将值添加到输出中。 |
| `exit()` | 成功结束脚本。 |
| `store(key, value)` / `load(key)` | 在多次 `codemode` 调用之间保留少量 JSON 数据。参阅[存储值](#store-values)。 |
| `ALL_TOOLS` | 列出所有可调用工具，每项为 `{ name, description }`，包括工具说明中未列出的工具。 |
| `searchTools(query, { limit?, namespace? })` | 按相关性对可调用工具排序（BM25，默认最多 8 项）。Promise 兑现为 `{ name, description }[]`。 |
| `describeTool(name)` | Promise 兑现为工具的说明和 TypeScript 声明，或 `undefined`。 |
| `describeNamespace(name)` | Promise 兑现为命名空间（例如某个 MCP 服务器）的 `{ name, description?, instructions?, tools }`，或 `undefined`。 |
| `models` | 列出并运行非 LLM 模型。参阅[模型](#models)。 |

## 调用工具 \{#call-tools}

会话中可调用的每个工具都对应 `tools` 的一个方法，方法名由工具标识符转换而来。JavaScript 标识符中不允许的字符会替换为 `_`，例如 MCP 工具 `mcp__dev-radius__search` 对应 `tools.mcp__dev_radius__search`。每个方法只接受一个包含工具参数的对象。

调用成功时，Promise 兑现的值取决于所调用的工具：

- 有输出模式定义的工具返回结构化值。即使退出码非零，`bash` 也会返回 `{ output, truncated, full_output_path?, exit_code, wall_time_seconds }`。其中 `output` 不受模型所见的 2000 行或 50KB 限制，最多可容纳 1 MiB。输出更长时，`output` 会保留开头和结尾各 512 KiB，中间插入省略标记；此时会设置 `truncated`，`full_output_path` 则指向保存完整输出的文件。
- MCP 工具返回其 `CallToolResult`，包括 `isError` 和 `structuredContent`。
- `read` 返回文件文本。如果读取的是图像，则返回可由 `image()` 显示的图像块 `{ type: "image", data, mimeType, note }`。`data` 是模型会看到的 Base64 编码图像，`note` 是附带的文本，例如缩放提示。
- `edit` 和 `write` 等其他工具返回各自的文本输出。

调用失败、被阻止或收到无效参数时，Promise 会以包含工具错误文本的 `Error` 拒绝。使用 `Promise.allSettled()` 可保留成功调用的结果。

`codemode` 的工具说明按命名空间（例如某个 MCP 服务器）列出工具和相应的 TypeScript 声明。采用 `deferred` 暴露方式的工具不在列表中，其中包括使用默认 `codemode` 暴露方式的 MCP 工具。因此，MCP 服务器建立连接时，这份说明不会变化。列出的声明共用 3000 个估算 token 的预算（见[设置](./settings.md#tools)中的 `codemode.inlineBudget`）。脚本可通过 `searchTools()`、`describeTool()`、`describeNamespace()` 或筛选 `ALL_TOOLS` 查找其余工具。

启用 `codemode` 后，[设置](./settings.md#tools)中的 `codemode.mode` 决定其他工具如何呈现给模型。使用 `on`（默认值）时，已声明的工具仍保持声明状态，其说明会告诉模型如何从脚本调用它们。使用 `only` 时，这些工具对模型隐藏，改为列在 `codemode` 说明中，供模型通过脚本调用。系统提示词中的规则只涵盖已声明的工具，因此 `codemode` 说明、`describeTool()` 和 `ALL_TOOLS` 中的工具声明都附带相应的提示词指引。

## 存储值 \{#store-values}

`store(key, value)` 将 JSON 值保存到字符串键下，供后续 `codemode` 调用使用。存入 `undefined` 会删除该键。`load(key)` 返回对应的值或 `undefined`。只有脚本成功结束时，写入才会保留。每个成功存储了值的脚本都会向会话追加一条 `codemode-store` 自定义条目，因此恢复会话后仍可读取这些值，每个分支也只能看到其路径上写入的值。

存储区适合保存 ID、游标或摘要等少量状态。单个值的 JSON 文本长度不得超过 262144 个字符，所有值合计不得超过 1048576 个字符。不要存储图像数据。请使用 `image()` 显示图像，它也会将图像保存到临时文件。

## 模型 \{#models}

`models` 可以访问模型目录，并使用当前会话的凭据运行非 LLM 模型。分类器回答关于 JSON 状态的带类型问题，部分分类器也能回答关于图像的问题。图像模型用于生成图像。目录会列出聊天模型，但脚本不能运行它们。可用的分类器和图像模型见[使用分类器模型](./models.md#use-classifier-models)和[使用图像模型](./models.md#use-image-models)。

```ts
type ModelType = "chat" | "image" | "classifier";

/** A catalog entry. `provider` and `id` identify it; other fields depend on the type. */
interface ModelInfo {
  type?: ModelType;
  provider: string;
  id: string;
  name: string;
  api: string;
  input: ("text" | "image")[];
  contextWindow?: number;
  [key: string]: unknown;
}

declare const models: {
  /** Every known model of a type, optionally for one provider. */
  getModelsOfType(type: ModelType, provider?: string): Promise<ModelInfo[]>;
  /** Models of a type whose provider has working credentials. */
  getAvailableOfType(type: ModelType, provider?: string): Promise<ModelInfo[]>;
  /** One catalog entry, or undefined. */
  getModelOfType(type: ModelType, provider: string, id: string): Promise<ModelInfo | undefined>;
  /** Answer `context.questions` about `context.state`; answers are in `result.answers` by question ID. */
  classify(model: ModelInfo, context: ClassifierContext): Promise<ClassifierResult>;
  /** Generate images from `context.input` text and image blocks; show `result.output` blocks with image(). Can take minutes. */
  generateImages(model: ModelInfo, context: ImagesContext): Promise<ImagesResult>;
};
```

`classify()` 和 `generateImages()` 只使用 `model` 的 `provider` 和 `id`，因此也接受 `{ provider, id }`。如果提供商返回错误，这两个函数不会抛出异常，请检查 `stopReason` 和 `errorMessage`。每个脚本最多同时运行四个此类调用，其余调用会等待空闲名额，因此可以用 `Promise.all()` 处理多项调用。这些调用的用量会记入 `codemode` 的工具结果，并计入会话费用。

模型 ID 因提供商而异，例如 `typesafe/jev-latest` 和 `openrouter/typesafe/jev-1.13`。使用 `models.getAvailableOfType(type)` 查找当前凭据可用的模型 ID。

### 分类 \{#classify}

```ts
interface ClassifierContext {
  /** The data to classify. */
  state: Record<string, unknown>;
  /** Images judged together with `state`. Only models whose `input` includes "image" accept them. */
  images?: { type: "image"; data: string; mimeType: string }[];
  /** Questions by ID. One call answers all of them. */
  questions: Record<string, ClassifierQuestion>;
}

type ClassifierQuestion =
  /** Pick one label. `criteria` maps each label to what it means. */
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  /** Score on an ordered scale. `criteria` describes each level, lowest first. */
  | { type: "score"; instructions: string; criteria: string[] }
  /** Yes or no. */
  | { type: "bool"; instructions: string; criteria: { true: string; false: string } };

interface ClassifierResult {
  provider: string;
  model: string;
  /** Answers by question ID. */
  answers: Record<string, ClassifierAnswer>;
  usage?: ModelUsage;
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
}

type ClassifierAnswer =
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  /** `score` is the expected level index, from 0 to `criteria.length - 1`. */
  | { type: "score"; score: number; confidence: number }
  /** Probability of `true`. */
  | { type: "bool"; probability: number };

/** Token counts and cost in USD, when the service reports them. */
type ModelUsage = { input: number; output: number; totalTokens: number; cost: { total: number } };
```

要对多项内容分类，请为每一项调用一次 `classify()`。以下脚本对反馈消息进行分类，例如脚本中先前某次工具调用返回的反馈消息：

```js
const jev = await models.getModelOfType("classifier", "typesafe", "jev-latest");
const results = await Promise.all(
  messages.map((message) =>
    models.classify(jev, {
      state: { message },
      questions: {
        sentiment: {
          type: "choice",
          instructions: "How does the user feel about the product?",
          criteria: { positive: "Satisfied or happy", negative: "Unhappy or frustrated", neutral: "Neither" },
        },
        urgency: {
          type: "score",
          instructions: "How urgently does this need a reply?",
          criteria: ["no reply needed", "reply this week", "reply today"],
        },
      },
    }),
  ),
);
return results.map((result, i) =>
  result.stopReason === "stop"
    ? { message: messages[i], sentiment: result.answers.sentiment.choice, urgency: result.answers.urgency.score }
    : { message: messages[i], error: result.errorMessage },
);
```

如果分类器的 `input` 包含 `"image"`，它也能判断图像。`tools.read()` 会将图像文件作为图像块返回，`images` 可接受这种图像块。对其他分类器传入非空的 `images` 会得到错误结果。

```js
const luna = await models.getModelOfType("classifier", "openai", "gpt-6-luna");
const photo = await tools.read({ path: "screenshot.png" });
const result = await models.classify(luna, {
  state: { task: "Settings page redesign" },
  images: [photo],
  questions: {
    broken: {
      type: "bool",
      instructions: "Does the screenshot show a broken layout?",
      criteria: { true: "Overlapping, cut-off, or misaligned elements", false: "Clean layout" },
    },
  },
});
```

### 生成图像 \{#generate-images}

```ts
interface ImagesContext {
  /** The prompt as text blocks, plus image blocks to edit or use as references. */
  input: (TextBlock | ImageBlock)[];
}

interface ImagesResult {
  provider: string;
  model: string;
  /** Generated images, and text blocks for models that also return text. */
  output: (TextBlock | ImageBlock)[];
  usage?: ModelUsage;
  stopReason: "stop" | "error" | "aborted";
  errorMessage?: string;
}

type TextBlock = { type: "text"; text: string };
/** `data` is base64. */
type ImageBlock = { type: "image"; data: string; mimeType: string };
```

使用 `image(block)` 显示生成的图像。不要通过 `text()`、`console` 或 `return` 输出 `data`：数据量很大，模型也无法将其作为文本读取。`image()` 还会将每张图像保存到临时文件，并在结果中给出文件路径，以便在后续轮次复制或移动该文件。

```js
// @options: {"timeout_ms": 300000}
const painter = await models.getModelOfType("image", "openrouter", "google/gemini-2.5-flash-image");
const result = await models.generateImages(painter, {
  input: [{ type: "text", text: "A red fox in the snow, watercolor" }],
});
if (result.stopReason !== "stop") return result.errorMessage;
for (const block of result.output) {
  if (block.type === "image") image(block);
  else text(block.text);
}
```

## 限制 \{#limits}

- 每个脚本的虚拟机有 256 MB 内存。内存耗尽时会抛出 `InternalError: out of memory`。数据量大时，请进行筛选或聚合，避免不断累积。
- 在 Bun 上，停止脚本或达到时限时，调用会很快结束。但如果某个内置函数不轮询 QuickJS 的中断处理程序，它仍可能在工作线程中继续计算，直到该函数返回。
- 一个 Pi 进程的所有会话合计最多可以有两个存活的代码模式工作线程。可通过 `PI_CODEMODE_MAX_WORKERS` 更改此上限。被取消的工作线程在退出前仍会占用名额。达到上限时，新脚本按到达顺序等待空闲工作线程。如果脚本在 60 秒内未获得工作线程，或先达到 `timeout_ms` 仍未获得工作线程，调用会失败，脚本不会运行。
- 如果脚本等待一个永远无法兑现或拒绝的 Promise，且没有待完成的工具调用，脚本会立即失败，因为沙箱没有计时器。
- 脚本不能启动其他 `codemode` 脚本。
