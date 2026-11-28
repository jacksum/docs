---
title: "eval"
description: "Oh My Pi 官方仓库文档：eval。"
---

# eval \{#eval}

> 在持久化语言运行时中执行一个 Python 或 JavaScript 单元。一次工具调用对应一个单元；状态会保留到后续调用。

> **注意：** 不要通过 `bash` 调用 `python -c`、`bun -e` 或 `node -e` 来执行临时代码。`eval` 提供状态保留、丰富的 `print` 渲染、工具/子代理桥接、流式输出、取消以及由产物文件支持的截断。

## 源码 \{#source}

- 入口与动态模式：`packages/coding-agent/src/tools/eval.ts`
- 后端启用：`packages/coding-agent/src/tools/eval-backends.ts`
- 面向模型的提示词：`packages/coding-agent/src/prompts/tools/eval.md`
- 共享契约：`packages/coding-agent/src/eval/backend.ts`、`types.ts`、`executor-base.ts`、`kernel-base.ts`
- 宿主桥接：`packages/coding-agent/src/eval/agent-bridge.ts`、`completion-bridge.ts`、`handle-bridge.ts`、`workpool-bridge.ts`、`judgment-bridge.ts`、`judgment-batch-bridge.ts`、`budget-bridge.ts`
- 文件/百分号命令准备：`packages/coding-agent/src/eval/input.ts`；扩展前置代码：`packages/coding-agent/src/eval/preludes.ts`
- JavaScript：`packages/coding-agent/src/eval/js/`
- Python：`packages/coding-agent/src/eval/py/`
- 输出/截断：`packages/coding-agent/src/tools/streaming-output.ts`
- Python 内部机制：`docs/python-repl.md`

## 输入 \{#inputs}

参数对象就是一个单元。没有 `cells` 数组、头部解析器、语言探测或隐式回退。增量步骤应分开调用工具执行；每种语言保留各自的状态。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `language` | `"py" \| "js"` | 是 | 显式后端标记。通常实时模式只包含已启用的运行时。 |
| `code` | `string` | 是 | 内联代码，或一个独立的 `%load` / `%pip install`（py）/ `%bun add` / `%environment`（js）命令。 |
| `title` | `string` | 否 | 简短的会话记录标签。 |
| `timeout` | `number` | 否 | 活跃运行时的超时窗口，以秒为单位。默认为 30；`0` 表示禁用。非零值受工具超时策略（`TOOL_TIMEOUTS.eval`：1-3600 秒）和 `tools.maxTimeout` 限制。提供的值若被调整，会在准入时、进度中、最终结果及 `details.notice` 中以请求值 → 有效值的形式告知。`timeout` 字段模式包含配置的上限。宿主等待暂停结束后，会以新的完整窗口恢复，而非使用之前剩余的时间。 |
| `reset` | `boolean` | 否 | 执行前重新创建此语言保留的运行时。其他语言运行时不受影响。默认为 `false`。 |

跨三次调用的示例：

```json
{ "language": "py", "title": "imports", "code": "import json\nfrom pathlib import Path" }
```

```json
{ "language": "py", "title": "load config", "code": "data = json.loads(read('package.json'))\nprint(data)" }
```

```json
{ "language": "py", "title": "reuse state", "code": "print(sorted(data['dependencies']))" }
```

## 脚本与依赖 \{#scripts-and-dependencies}

将可复用的初始化代码保存在文件中，然后加载一次：

```json
{ "language": "py", "code": "%load ./analysis.py" }
```

后续单元复用其中的定义。再次调用 `%load` 会再次执行当前文件；仅编辑文件不会重新加载。宿主会读取文件（包含空格的路径需加引号；支持 `local://` 文件），并使用其文件名运行：Python 设置 `__file__`，将脚本目录放入 `sys.path`，并针对脚本报告回溯；JavaScript/TypeScript 从脚本位置解析相对导入，而 eval 保持其工作目录不变。

Python 依赖通过 `%pip install pillow` 安装：运行器的 pip 魔法命令会为内核自身的解释器运行 `python -m pip`（在没有 pip 的解释器中，例如 `uv venv` 环境，会先用 `ensurepip` 安装 pip；若失败且 `PATH` 上有 `uv`，则用 `uv` 安装），运行期间暂停单元看门狗，并保留内核变量。模块缺失错误会提醒发行包名称可能与导入名称不同（`PIL` 属于 `pillow`）。

JavaScript 依赖通过 `%bun add csv-parse` 安装到 OMP 管理的包环境中，同一项目的会话共享该环境；各工作进程保留各自的变量。安装不会重启工作进程；已导入模块会继续缓存，直到显式重置。生命周期脚本被禁用；需要原生构建/postinstall 的包必须显式准备。`%environment project` 会选择仓库本身作为包/锁文件修改位置；`%environment managed` 则返回 OMP 管理的依赖。此选择会在通过该 eval 工具进行的后续调用中保留。

百分号命令是独立的单元，不是额外的工具参数；包含空格的依赖要求需加引号。

`%load` 需要本地脚本，或有本地支持文件的内部 URL；远程 HTTP 脚本必须先下载并检查。虚拟 URL 文档不能直接执行。

上下文压缩会接收有大小限制的活动内核快照，其中包含环境和成功加载的路径，不包含变量值。在新进程中恢复不会还原历史内核状态。

## 后端可用性 \{#backend-availability}

`resolveEvalBackends(...)` 将设置与环境覆盖值组合：

| 标记 | 运行时 | 设置/默认值 | 环境覆盖值 | 额外前提 |
| --- | --- | --- | --- | --- |
| `py` | 保留状态的 IPython 风格 Python 内核 | `eval.py=true` | `PI_PY` | PATH 上有可工作的 Python 3.8+，或通过 `python.interpreter` 配置 |
| `js` | 保留状态的 Bun 工作进程 VM | `eval.js=true` | `PI_JS` | 内置 JS 运行时 |

被禁用的运行时会从会话范围的传输模式和模型提示词中移除。Python 探测明确失败后，下一个模式、说明和前置代码也会省略 `py`；同步读取模式绝不会运行探测。显式可用性刷新成功后会恢复 Python，而 PATH、当前环境、cwd 或配置的解释器发生变化时，会使已公布的快照失效。被取消或受截止时间限制的探测不会确立永久不可用状态。显式 Python 调用会重试失败的探测，因此修复后的解释器可以在不重启的情况下被识别。

请求不可用的运行时时会抛出 `ToolError`，其中带有经过长度限制和清理的探测原因及补救方法：在 PATH 上提供可工作的 Python 3.8+，或设置 `python.interpreter`。此工具绝不会替换成另一种语言。`eval.tools.enabled`（默认关闭）独立控制是否公布并允许使用内核定义的工具及 `tools` 子代理字段。

`eval.autoProvision=true` 允许首次 `%bun add` 创建托管的 JavaScript 包环境；关闭时则要求环境已存在，或使用 `%environment project`。包安装会暂停计算看门狗，但有自身的十分钟截止时间，且仍可取消。

## 输出 \{#outputs}

`execute()` 返回一个文本内容块以及任意图像块。`onUpdate` 在当前单元运行时流式传送其输出和详细信息，并按 50 毫秒的间隔合并更新。

- 文本为 stdout/stderr（即 `print` 和末尾表达式回显写出的原样内容）加上图像尺寸说明。
- 只有图像的成功结果报告 `(displayed N image(s); no text output)`；没有可见输出的单元报告 `(no output)`。
- 后端非零退出会追加 `[exit code N]`，将单元标记为 `error`，并设置 `details.isError`。
- 取消时返回已捕获的输出或 `[aborted]`，并设有 `details.isError=true`。

`EvalToolDetails`：

- `cells`：只有一个元素的 `EvalCellResult[]`，包含 `index`、`title?`、`code`、后端 `language`、`output`、`status`、`durationMs?`、`exitCode?`、`statusEvents?` 和 `views?`。以文件为来源的单元会保留原始 `%load` 命令用于显示，而不是复制脚本源码。
- `language`：所用后端；`languages`：去重后的后端列表。它们保留兼容历史多单元调用的结构，但当前一次调用只有一个后端。
- `cells[].views`：按打印顺序排列的打印值美化视图，形式为 `{ text, view }`，其中 `text` 是该值打印到 `output` 中的精确片段，`view` 则为 `table`（数据框、`console.table`）、`json`（打印长度超过 80 个字符或跨多行的字典/列表/普通对象）或 `markdown`（具有 `_repr_markdown_` 的 Python 对象）。渲染器以视图替换匹配的文本；模型只看到文本。每个单元最多保留 16 个视图，JSON 超过 32 KiB 的视图会被丢弃；被丢弃的视图会以其文本显示。
- `images`：图像到达后会出现在实时更新中；最终图像是内容块。
- `notice`：可选的后端通知。
- `meta`：由 `toolResult(...)` 提供的输出截断/产物元数据。
- `async`：单元作为异步作业自动转入后台时出现（`{ state, jobId, type: "eval" }`）。
- `isError`：在后端失败或取消时设置。

等待调用运行期间，`mcp_progress` 状态行会显示 MCP 工具名称及其最新进度：若存在总量，则显示服务器消息及 `progress/total`；没有消息时则显示单独的进度值。同一次调用的更新会相互替换，包括 Eval 自动转入后台之后；旧 MCP 快照可能因状态日志上限而被逐出。内部调用 id 不会显示。

渲染器将调用和结果内联合并，根据声明的语言进行语法高亮，以表格、JSON 树和 Markdown 渲染单元视图来替换其文本，并显示超时/截断元数据。`session.allocateOutputArtifact?.("eval")` 为溢出输出提供存储；`meta` 中的 `local://N.log` URL 可访问完整捕获内容。

## 执行流程 \{#execution-flow}

1. `EvalTool` 根据已启用语言构建会话专属模式。它是必备工具，采用严格模式，并在单个智能体会话内具有 `approval="exec"` 和 `concurrency="exclusive"`。
2. `execute()` 将 `py/js` 映射为 `python/js`，解析可用性，读取一次以文件为来源的源码，并将输入包成与渲染器兼容的单元列表。运行时探测受请求的超时时间和中止信号约束。JS 后端在取消/后台生命周期内安装所请求的包。
3. 它通过 `session.getEvalSessionId?.()` 或 `defaultEvalSessionId(session)` 获取保留的执行器 id，分配输出接收器/产物，并通过 `trackEvalExecution?.(...)` 注册本次运行。
4. 超时默认为 30 秒。`0` 不会创建看门狗。否则会将 `IdleTimeout` 与工具和会话中止信号组合。
5. 智能体/补全句柄等待、`judge()`、评判批次排空、包安装、委派的 `tool.task()`/`tool.wait()`，以及浏览器/计算机前置代码会暂停看门狗。恢复时会开始一个新的完整超时窗口。计算、输出、状态辅助函数和普通的 `tool.*` 调用（包括报告进度的 MCP 工具）会计入该窗口。
6. 所选后端接收 cwd、保留的会话 id、会话文件、内核所有者、重置标记、回调和取消信号。
7. 输出块流入支持产物的 `OutputSink` 和实时尾部。运行时显示输出被分为视图、图像和状态通道。
8. 成功、非零退出和取消会被组装为上述结果结构。即使执行失败，输出接收器也会完成收尾。

## 自动转入后台 \{#auto-backgrounding}

启用 `eval.autoBackground.enabled`（默认为 `false`）后，运行时间超过 `eval.autoBackground.thresholdMs`（默认为 60000 毫秒）的单元会转换为托管异步作业，而不是阻塞当前轮次：

- 工具会在前台等待 `resolveAutoBackgroundWaitMs(thresholdMs, clampedCellTimeoutMs)`：该值为阈值，并向下限制为单元自身经过限制的超时时间减去 1 秒缓冲，以便截止时间到期时直接内联返回，而不是在即将到期前转入后台。因此，提高 `timeout` 不会使前台执行超过阈值。阈值为 `0` 时立即转入后台。
- 转入后台时，工具会返回实时输出尾部，加上 `[backgrounded as <id>, killed at <n>s total; …]`，在 `timeout: 0` 下则显示 `no deadline`，并附上禁止轮询的说明（`formatBackgroundNotice`），指出单元经过限制后的超时时间，同时设有 `details.async = { state: "running", jobId, type: "eval" }`。截止时间是单元的运行时预算，从单元开始计算（包含前台等待），而非剩余的墙上时钟时间。智能体/补全句柄等待、`judge()`、评判批次排空、包安装、委派的 `tool.task()`/`tool.wait()` 以及浏览器/计算机前置代码会暂停看门狗；普通的 `tool.*` 调用（包括报告进度的 MCP 工具）不会暂停。作业完成后会像转入后台的 bash 命令一样稍后送达结果。
- 等待期间到达的排队用户/同伴消息（引导消息）会立即让单元转入后台（“提前转入后台以处理传入消息；单元会继续运行。”）。
- 异步作业管理器达到运行作业容量时，工具会退回常规前台执行，而不是失败。
- 失败、取消或超时的单元会报告为失败的后台作业（出错的执行会重新进入作业管理器的失败路径），绝不会静默报为成功。

## 运行时行为 \{#runtime-behavior}

### JavaScript（`js`） \{#javascript-js}

- 持久化工作进程 VM 以 `js:${sessionId}` 为键；`reset` 会重新创建 VM，并破坏同时使用该会话 id 的其他使用者的状态。
- 在 Bun 下运行，并公开宿主全局对象，包括 `Bun`、`Buffer`、`fetch`、`process`、`require`、`createRequire`、`fs` 和 Web Crypto。
- 通过异步包装支持顶层 `await` 和裸 `return`。
- 末尾表达式或顶层 `return` 值会按 `console.log` 的方式打印。与 Python 一样，其他末尾语句不打印任何内容：赋值（`globalThis.items = items`，或解构 `({ a } = obj)`）、声明、循环或 `if` 块。被赋值的 promise 仍会在本次运行内完成，并报告拒绝。加括号的赋值会打印其值，类似 Python 的 `(x := value)`。
- 静态顶层导入和动态导入会通过本地模块加载器重写。本地文件系统导入在单元之间会绕过缓存；裸包导入和协议/URL 导入保留正常的缓存身份。
- 等待中的代码区域可以与共享执行器的其他会话交错执行；同步代码仍会阻塞工作进程事件循环。

### Python（`py`） \{#python-py}

- 保留的内核以 `python:${sessionId}`、规范化的 cwd 和解释器为键。`python.kernelMode="per-call"` 则会为每次调用创建一个新内核，并在调用后关闭。
- 运行器使用一个持久化 asyncio 事件循环，因此支持顶层 `await`；在此使用 `asyncio.run(...)` 无效。
- 运行器会替换面向 stdout 的 `builtins.print`：打印的图像（omp 图像字典、matplotlib 图形、PIL 图像、`_repr_png_`/`_repr_jpeg_` 对象）会作为图像附加，DataFrames/Series、Markdown 对象及大型字典/列表/元组会添加视图。非 `None` 的末尾表达式也以同样方式打印其 `repr`。
- 交互式 stdin 会被拒绝，并显示 `[stdin unsupported]`。
- 同步块使用默认执行器，并复制 ContextVars；Python 字节码仍会争用 GIL。

## 前置辅助函数 \{#prelude-helpers}

在语言允许的范围内，所有已启用运行时都公开等效的辅助函数：

- `print(...)`（Python）/ `print(...)` 和 `console.*`（JS）
- `read(path, offset?, limit?)`、`write(path, content)`、`env(...)`、`output(...)`
- `tool.<name>(args)` 用于普通会话工具调用（两个运行时中均为异步：`await tool.read({...})`）
- `@tool` / `tool(fn, {...})` 用于定义供子代理使用的内核本地工具（`eval.tools.enabled`，默认关闭）
- `judge(...)`、`judge_batch(...)`（Python）/ `judgeBatch(...)`（JS）、`completion(...)`
- `wait(...)` 用于智能体/补全句柄
- 允许派生时可使用 `agent(...)`、`workpool(...)`
- `log(message)`、`phase(title)`、`budget`

JS 辅助函数为异步；Python 文件辅助函数为同步，而 `tool.<name>()` 是协程。`read()` 将非 `local://` 协议委派给已注册的 read 工具，通过注入的根目录解析 `local://`，并相对于 cwd 读取普通路径。`read("local://N.log")` 与其他 `local://` 文件一样，通过注入的 `local` 根目录读取溢出内容，并使用 `offset`/`limit` 选择行；不存在产物特例。`write()` 接受普通路径及 `local://` 路径，但拒绝其他协议 URL。

前置代码列出可接受的会话工具名称，包括无歧义的传输别名，例如为启用了 apply-patch 模式的 `edit` 工具提供的 `tool.apply_patch({ input: "..." })`。精确的注册名称会覆盖别名；有歧义的别名不可用。规范名称调用和传输名称调用都会检查解析后工具的启用状态，并使用其常规审批/ACP 门控。

桥接限制和记账使用解析后的规范工具，而非请求中的传输名称写法。`checkpoint`、`rewind` 和 `yield`（包括其别名）会被省略并拒绝，因为它们的会话更改或任务完成要求直接的工具事件。单元通过 `sh()` 访问的工具命令，若为 `checkpoint`、`rewind` 或 `yield`，也会被拒绝，并给出相同的直接工具诊断；模型自身的 `bash` 调用运行的命令不受影响，包括单元通过 `tool.task` 启动的子代理运行的命令。`todo` 的别名保留分支持久化行为，`task`/`wait` 的别名则像其规范调用一样暂停单元看门狗。

打印图像或图形会将其附加到结果中，供模型和用户查看。打印的数据框、`console.table`、Markdown 对象和大型结构化值还会为用户附带美化视图；模型看到的是打印文本。

已启用的扩展前置代码会添加全局对象（如 `browser`），其文档位于 `help://eval/<name>`。它们的宿主调用依据实时会话解析审批和可用性；禁用前置代码也会阻止先前捕获的函数继续保有宿主访问权限。

### `judge()` 与评判批次 \{#judge-and-judgment-batches}

`await judge(state, questions)` 返回以问题 id 为键的答案。状态为非空字符串、JSON 对象或 JSON 数组。问题具有 `type: "choice"`、`"bool"` 或 `"score"` 以及非空的 `instructions`：choice 至少需要两个标签/评分标准条目；score 至少需要两个有序的等级说明；bool 在 `.bool` 中返回概率，而非布尔值。会话的 `judge` 角色决定后端。

对于多个状态，Python 的 `await judge_batch(states, questions, concurrency=32, retries=1, min_ok=1, intent=None)` 或 JS 的 `await judgeBatch(states, questions, { concurrency?, retries?, minOk?, intent? })` 会创建由宿主拥有的批次。状态是列表/数组（以索引为键）或带键的对象。`await b.drain(...)` 拉取新完成的 `(key, item)` 对，其中带有 `item.answers` 或 `item.error`；Python 直接接收 `timeout`，JS 接收 `{ timeout }`。单项失败会被保留，而整次运行失败会在排空游标耗尽后抛出。`status()`、`results()`、`failed()`、`cancel()` 和 `close()` 用于检查/控制批次。批次的生命周期超出单元和内核重置；`judge_batch.attach(id)` / `judgeBatch.attach(id)` 可让拥有该批次的会话重新连接，直到批次关闭或所有者被释放。补全与评判请求共享进程级的 32 请求信号量。

完整辅助函数参考位于 `help://eval/judge`。

### MCP 结构化结果 \{#mcp-structured-results}

MCP 调用返回包含 `text` 和 MCP 专属 `details` 的对象。当服务器
提供 `structuredContent` 时，可通过 `details.structuredContent` 访问：

```js
const result = await tool.mcp__example_page({});
if (result.hasError) throw new Error(result.text);
const page = result.details.structuredContent;
if (page === undefined) throw new Error("Server did not return structured data");
console.log(page.next_cursor);
```

Python 调用方使用 `result["details"].get("structuredContent")`。服务器未提供结构化结果时，
该属性不存在；OMP 不会从看起来像 JSON 的文本中推断它。
错误结果也可以携带结构化数据，因此将载荷视为成功结果之前，
应检查 `hasError`。

`text` 仍是面向模型的渲染内容，包括任何 JSON 回显和输出
截断通知。截断不会裁剪 `details.structuredContent`：即使渲染内容溢出，
代码仍会收到服务器提供的完整对象。对于大型数据，应使用
服务器端分页/边界限制，并且只打印模型所需的字段。
该对象不会根据服务器的输出模式进行验证，也不会被视为可信内容。
普通工具保留现有返回结构，包括不带详细信息的纯文本结果所使用的裸字符串。

### `completion()` \{#completion}

这是无状态、无工具的一次性模型调用，会立即返回 `CompletionHandle`：

- JS：`completion(prompt, { model?, system?, schema? })`；Python：使用带 `model`、`system` 和 `schema` 的关键字形式。
- `model`：`"smol"`、`"default"` 或 `"slow"` 档位；默认为当前/默认档位。
- 对于 `"slow"` 档位，配置的角色选择器遵循显式的具体推理强度后缀，包括 `:max` 和 `:off`；`:max` 会被限制到目标模型支持的等级。裸选择器、`:auto` 和 `:inherit` 主选择器保留档位默认行为，包括为根级回退模型重新计算默认值。当主选择器显式指定具体推理强度或 `:off` 时，裸选择器和 `:auto` 根级回退会继承该有效设置，并按各自模型支持情况进行限制。嵌套回退继承其直接父候选的有效设置。回退后缀中显式指定具体推理强度或 `:off` 会覆盖继承。`"smol"` 和 `"default"` 保留其现有的提供方选项行为。
- 推理强度提取遵循共享的选择器语法：即使模型匹配在精确模型 ID 中保留了后缀，`:low` 和 `:off` 等严格后缀仍具有优先权。字面 ID 保护适用于有歧义的 `:max` 和 `:auto` 后缀，提供方和模型 ID 的匹配不区分大小写。
- `attempts` 按顺序列出目前已尝试的回退候选，无需等待：JS 为 `await handle.attempts()`，Python 为 `handle.attempts`。每个条目是 `{ model, effort, outcome, error? }`：`effort` 是发送的推理强度（`"off"` = 禁用，`null` = 提供方默认值）；`outcome` 为 `running`、`no-credentials`、`succeeded`、`failed` 或 `cancelled`。`succeeded` 条目对应作答的模型。
- `schema`：合成 `respond` 工具所用的 JSON Schema；此时 `.wait()` 返回解析后的数据。
- 无法解析的档位及无效参数会使句柄分配失败；JS 立即返回的待定句柄包装器会在被等待/使用时暴露该拒绝。缺少凭据、错误/中止停止、空输出以及无效结构化输出会通过 `.wait()` 暴露。
- 句柄局限于进程，由调用智能体拥有，并在完成 30 分钟后（或所有者会话结束时）被逐出。

### `agent()` \{#agent}

注册一个后台子代理作业，并立即返回 `AgentHandle`：

- JS：`await agent(prompt, { agent?, label?, schema?, schemaMode?, isolated?, apply?, merge?, tools?, model? })`；Python 使用关键字参数（`schema_mode`）。
- 预检（派生策略、未知智能体、`task.maxRecursionDepth`、硬性轮次预算、计划模式隔离控制、未知 `tools` 名称）会使句柄分配失败；Python 直接抛出，JS 的待定句柄在被等待/使用时拒绝。执行失败通过 `.wait()` 暴露。
- `agent` 的默认值来自当前派生策略；`model` 是[按调用指定的模型](../task-agent-discovery.md#per-call-model)：一个经操作方批准的精确 `provider/model-id[@upstream][:level]`，在 `task.perCallModel` 为 `eval` 或 `on` 时接受，但对于有 `task.agentModelOverrides` 条目的智能体，或带等级标记的 `^provider/model:level` 提及智能体，会被拒绝。`@upstream` 固定聚合器路由，并构成模型身份的一部分。工作池会将其应用于每个工作智能体的首轮（包括每个新工作智能体）；后续轮次复用该会话。`schema` 覆盖智能体/会话模式；`schemaMode`/`schema_mode` 选择 `permissive` 或 `strict`。
- `isolated` 请求隔离。`apply` 控制是否集成捕获的修改；`merge=false` 选择补丁模式，而正常设置控制分支模式。
- `tools`：子智能体可调用的内核定义工具名称（见下文）；每次调用都在调用方内核内执行。
- 句柄接口：`.id`、`.agent`、`.handle`（`agent://<id>`）、`.status`、`.done()`、`.wait(timeout?)`、`.send(message)`、`.cancel()`、`.output()`。Python 句柄可直接等待；JavaScript 使用 `await handle.wait()`。
- 作业是由调用智能体拥有的常规异步作业：未等待的结果会像转入后台的 `task` 一样自动送达，而句柄的 `.wait()` 会消费该交付，避免再次播放。Eval 子代理保持存活（通过 `write agent://<id>` 发消息，在 `history://<id>` 读取会话记录），并像所有子代理一样拥有自己的 eval 执行器。

### `wait()` \{#wait}

`wait(handles, timeout=None, raise_errors=True)`（JS：`wait(handles, { timeout, raiseErrors })`）会阻塞直到列出的每个智能体/补全句柄均完成，并按输入顺序返回其值。在 `timeout` 后仍运行的句柄会抛出 `TimeoutError`；失败或被取消的句柄会抛出自身错误，或者在 `raise_errors=False` 时，在其对应位置返回错误对象。等待会暂停单元看门狗；涉及智能体的等待会推迟破坏性的运行时中止，直到宿主等待退出。中止会取消被等待的句柄，并等待它们完成。

### `workpool()` \{#workpool}

`workpool(agent=None, name=None, context=None, tools=None, model=None)` 创建一个保持存活的子代理池，其规模受实时 `task.maxConcurrency` 限制：

- `.push(*items)` 返回项目 id（`<pool>#<seq>`）。项目会交给上下文使用量最低的空闲工作智能体；池尚有容量时会派生新工作智能体；否则会按轮询顺序排入忙碌工作智能体的队列，在该工作智能体的轮次结束时作为一个批次交付。`eval.workpool.freshAgents=true` 则会在容量释放时排队交给新智能体，因此每个项目都有新上下文，不进行后续批处理。
- 工作智能体通过 `yield({ key: <1-based number>, data: {...} })` 或 `yield({ key, error })` 分别提交每个批次项目；每次响应会列出剩余的键，最后一个键会自动结束当前轮次。
- 池名称同时是其聚合异步作业 id 和标签。首次完整排空会使池完成并关闭；另一个阶段需创建新的命名池。聚合结果自动送达一次，而内部批次作业会被消费。
- 完全阻塞时，应离开 eval 并调用零参数 `wait` 工具。结果会自动送达；绝不轮询。没有 `pool.wait()`，因此内核可保持空闲以处理 `@tool` 调用。
- `.status()` 报告工作智能体/项目数量和上下文使用量；`.peek()` 返回不消费结果的 `{ batches, pending }` 快照；`.close()` 丢弃仍在排队的项目。池局限于进程；重启后，其工作智能体仍作为驻留的保活智能体，可通过 `write agent://<id>` 访问。

### 内核定义的工具（`@tool` / `tool(fn)`） \{#kernel-defined-tools-tool--toolfn}

启用 `eval.tools.enabled`（默认关闭）后，单元可以将函数转换为供其他智能体调用的工具：

- Python：`@tool` / `@tool(name=..., description=...)`；JSON Schema 根据类型提示（`str`、`int`、`float`、`bool`、`list[...]`、`dict[...]`、`Literal`、`Optional`、`Annotated[T, "description"]`）及默认值推断；仅限位置参数会被拒绝。异步函数会被等待。
- JS：`tool(fn, { name?, description?, parameters? })`；`fn` 接收一个参数对象。
- `tool.defined()` 列出名称；`tool.undefine(name)` 移除一个工具。重新定义会执行替换。
- 使用方：`task` 项目的 `tools`、`agent(tools=...)`、`workpool(tools=...)`。宿主针对保留的 Python 和 JS 内核解析名称（同一名称在两者中均有定义时会报错），并将每个工具作为子会话的必备自定义工具公开。调用在专用运行器线程（Python）或工作进程的运行上下文（JS）内执行，因此即使父单元阻塞在 `wait()` 中，也仍能处理这些调用。异步 Python 工具均在同一个共享工具事件循环中运行（不是单元循环），因此模块级的 `asyncio.Lock()` 可以将来自多个子代理的并发调用串行化；放弃等待（中断、取消）的调用方会取消其异步调用的协程，而同步工具会继续运行至完成。工具抛出异常时会向调用方报告错误；内核继续运行。内核未运行时则会产生错误结果。
- 未知名称会使 `task`/`agent()` 调用同步失败；计划模式完全拒绝 `tools`。

## 副作用与取消 \{#side-effects-and-cancellation}

- 前置辅助函数可以读写文件并调用任意已注册工具；JS 公开了具备网络能力的 `fetch`。
- Python 使用保留的子进程内核，通过带帧格式的本地 IPC 通信。JavaScript 使用隔离子进程，并以 Bun Worker 作为回退；若两者都无法启动，调用会失败，不会在宿主线程上执行代码。
- 保留的运行时没有心跳或空闲计时器；它们会跨调用存活，直到重置、所有者释放（`EvalRunner.disposeKernels()` 按 `kernelOwnerId` 调用 `disposeKernelSessionsByOwner` 和 `disposeVmContextsByOwner`，位于 `packages/coding-agent/src/session/eval-runner.ts`）或进程退出。
- 必要时取消会产生破坏性影响：JS 会终止其工作进程；托管内核会中断，并可能升级为关闭。重置同样会破坏共享该后端会话的并发工作。
- 在单元之间死亡的保留运行时（崩溃、被终止、内存不足，或因取消/超时而结束）会在下次调用时替换；在替代运行时上执行的首个单元会以 `[Python kernel restarted; earlier state gone]` 开头（JavaScript 对应为 `JS worker`），每次替换只提示一次。`reset` 或所有者释放不会给出通知。
- 由 eval 驱动的 `agent()` 子智能体会继续注册为保活智能体；所有者拆除时会取消它们的作业，释放补全句柄/评判批次，并关闭所有者的工作池。

## 限制与错误 \{#limits-and-errors}

- 默认超时：30 秒；`0` 表示禁用。非零超时通过 `clampTimeout("eval", ..., tools.maxTimeout)` 限制。
- 输出接收器的默认窗口：50 KiB（`DEFAULT_MAX_BYTES`）；实时尾部：100 KiB；截断辅助函数最多保留 3000 行。
- 每个单元最多保留 16 个视图，每个视图的 JSON 最多 32 KiB；过大或超额的视图以其打印文本显示。
- 会话记录预览默认为 10 行。
- Eval 子代理派生遵循 `task.maxRecursionDepth`（默认为 `2`；负值允许无限深度）。每个 `workpool()` 将自身的活动工作智能体数限制为 `task.maxConcurrency`（默认为 32，`0` 表示无限制）。`agent()` 不占用 `task.maxConcurrency` 名额：每个句柄都是运行中的后台作业，计入会话范围的 `async.maxJobs` 上限（默认值及最大值均为 100），与会话内所有其他后台作业共享该上限，包括异步 `bash`、异步 `task` 派生、`workpool()` 池和嵌套子代理的作业。达到上限后，`agent()` 会以 `Background job limit reached` 失败。补全与评判请求共享另一个固定的 32 请求上限。
- 格式错误的参数属于模式错误；不可用/被禁用的后端及缺少会话属于 `ToolError`。
- 运行时异常会转为后端输出，并以非零状态退出。交互式 stdin 会报错。输出截断不会使调用失败。
- 未捕获的 JavaScript 错误会打印其消息，以及单元、单元发送到页面或工作进程的函数、单元导入的模块所对应的栈帧；位于单元工作目录之外的 omp 安装树中的栈帧、已安装的 `@oh-my-pi` 包和引擎内部栈帧，会被替换为一行数量统计。单元工作目录下的项目依赖仍然可见，即使 omp 安装在项目本地也是如此，包括 omp 也使用的依赖：共享依赖路径不能表明导入者是谁。错误的 `stack` 保留所有栈帧，因此 `catch (e) { print(e.stack) }` 可以显示它们。
- 未处理的 JavaScript promise 拒绝会在单元运行期间使其失败。归属于已完成单元的拒绝会保留内核状态，并在下一个单元输出的开头显示一次，附带来源单元和错误堆栈；桥接调用错误会包含工具名称或前置代码操作（例如 `browser.call`）。下一个单元最多显示十个延迟错误，并统计额外的拒绝数量。
- 已死亡的保留托管内核可能由其执行器替换，并将本次调用重试一次。

## 说明 \{#notes}

- 一次调用对应一个单元。使用分开的调用来利用持久化状态，并且只重新运行失败的步骤。
- 状态按语言隔离；重置 Python 不会重置 JS。
- 当前模式标记只有 `py` 和 `js`；完整语言名是渲染器/审批格式化别名，不是传输值。
- 旧的多单元 `cells` 载荷、`*** Cell` 解析器、探测回退及受约束的 `eval.lark` 语法已移除。
- 每个智能体会话，包括 `task`、`agent()`、workpool 和 vibe 子代理，都拥有私有的 eval 执行器 id；子代理绝不会继承其父级的内核或 VM 状态。
