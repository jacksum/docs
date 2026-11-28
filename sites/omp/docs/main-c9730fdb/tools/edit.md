---
title: "edit"
description: "Oh My Pi 官方仓库文档：edit。"
---

# edit \{#edit}

> 应用源代码编辑。默认的 `hashline` 模式接收一个基于行锚点的补丁字符串，并直接编辑现有文件。

## 源码 \{#source}

- 入口与模式注册：`packages/coding-agent/src/edit/index.ts`
- 各编辑模式的模式定义：`packages/coding-agent/src/edit/schemas.ts`
- 面向模型的提示词：`crates/edit/prompts/`；精简 hashline 变体：`packages/coding-agent/src/edit/hashline-compact.md`
- 约束解码语法：`crates/edit/grammars/`
- 原生桥接：`crates/natives/src/edit.rs`，包括 `EditSession`、`EditStore`、检查功能以及提示词/语法导出
- Hashline 解析与应用：`crates/edit/src/modes/hashline/`
- 快照/寄存器状态：`crates/edit/src/store.rs`；暂存、流式预览和结果整形：`crates/edit/src/session.rs`
- 宿主写入、LSP 集成与解析退化处理：`packages/coding-agent/src/edit/index.ts`
- 模式选择/设置：`packages/coding-agent/src/utils/edit-mode.ts`、`packages/coding-agent/src/edit/settings.ts`

## 模式选择与可用性 \{#mode-selection-and-availability}

`edit` 是一个必备的内置工具。`resolveEditMode()` 按以下顺序选择当前传输契约：

1. 为模型配置的特定变体；
2. `PI_EDIT_VARIANT`；
3. `edit.mode`；
4. 默认值 `hashline`。

支持的模式为 `hashline`、`apply_patch`、`patch`、`replace` 和 `sloppy`。`edit.mode: none`（或 `PI_EDIT_VARIANT=none`）则会取消注册 `edit`，其优先级高于 `edit.modelVariants`，关闭 hashline 锚点，并且无论 `bash.enabled` 如何设置，都保持 `bash` 已注册；显式工具列表仍然只有在列出 `bash` 时才会包含它。`edit.modelVariants` 对当前模型字符串执行不区分大小写的最长子串匹配；匹配长度相同时保留配置顺序。`PI_EDIT_VARIANT` 会精确固定模式；对于从设置派生出的 `hashline`，`PI_STRICT_EDIT_MODE` 会禁用根据模型家族回退到 `replace` 的行为（Kimi、MiMo、MiniMax、DeepSeek、StepFun、Codex Spark 和 GLM 5.3 Flash）。

本页主要介绍 hashline。模式定义、提示词、示例、渲染器和可选的 Lark 格式会随模式切换。设有 `editPromptVariant: "compact"` 的模型会收到精简 hashline 提示词。在 `apply_patch` 自定义工具模式下，传输名称为 `apply_patch`；当 `PATH` 上没有 `apply_patch` 程序时，Codex 风格的 shell 调用（`apply_patch <<'EOF' … EOF`，或将补丁放在引号内）会转到同一个内部工具。此工具采用严格模式，是必备工具，并使用独占并发。

## `magic` 模式 \{#magic-mode}

`edit.mode: magic`（或 `PI_EDIT_VARIANT=magic`）会保留 `edit` 工具，但更改其契约：载荷用文字描述修改，每个文件一个区段，并由辅助模型为每个文件编写补丁。`edit.modelVariants` 无法选择此模式。源码：`packages/coding-agent/src/edit/magic.ts`；面向模型的提示词：`packages/coding-agent/src/prompts/tools/magic-edit.md`。

```text
# src/jobs.ts
- In `drain()`, declare `limit` before `batch`.
# src/parse.ts
- Rename every `retrunValue` to `returnValue`.
```

模式为 `{ input: string }`。支持自定义工具语法的提供方会收到载荷的 Lark 语法，并像 `hashline` 模式一样直接发送原始载荷。以 `# ` 开头的行会开始下一个文件区段，除非它位于代码围栏内；第一个 `# path` 行之前的文本会被拒绝。指向相同路径的区段会合并。

1. 应用修改的模型会看到文件或带行号的摘录。它可以用 `search` 搜索字面文本，并用 `read` 读取当前草稿的任何部分，包括省略的行及它自己所做的编辑。
2. 它使用精确的 `old_string` → `new_string` 替换。未匹配到或匹配不明确时会返回错误，但不会丢弃草稿中已成功的编辑。模型可以检查草稿，并在另一轮中修正失败的修改。
3. 模型报告完成后，原本可解析的文件必须仍可解析。如果语法发生退化，模型可以修复草稿。只有完成的草稿才会通过常规编辑引擎写入，该引擎会拒绝过期快照，并报告产生的差异和诊断信息。

各文件相互独立。未完成、被拒绝执行、超时或遭拒的区段会保持对应文件不变，并在成功的差异之外报告 `[path] not applied: <reason>`。调用方的编辑格式和 `edit.magic.model` 设置不变。

## 输入 \{#input}

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `input` | `string` | 是 | 一个或多个包含 hashline 操作的 `[PATH#TAG]` 区段。严格的自定义工具语法会将区段包在 `*** Begin Patch` / `*** End Patch` 内；常规解析器也接受不带包装的载荷。 |

每个区段编辑一个现有文件，并且必须复制最近一次带锚点的 `read`、`grep` 或成功的 `edit` 结果中的四位大写十六进制快照标签：

```text
[src/example.ts#1A2B]
PUT 4.=4:
+const value = 2;
```

使用 `write` 创建或完全覆盖文件。Hashline 会在应用时拒绝不带标签的锚点编辑。

当编辑落到同一仓库的另一个 Git 工作树中时，结果会分别列出被编辑分支与会话分支。这不会切换会话的检出位置，也不会改变相对路径的解析方式。

## 标准补丁语言 \{#canonical-patch-language}

所有行号均指向带标签的原始快照，而非同一次调用中较早的补丁块。

| 形式 | 效果 |
| --- | --- |
| `PUT N.=M:` | 用后续 `+TEXT` 行替换原始行 `N..M`（包含首尾两行）。 |
| `PUT N*:` | 替换从第 `N` 行开始的多行语法块。 |
| `PUT <N:` / `PUT >N:` | 紧邻第 `N` 行之前/之后插入正文行。`PUT <1:` 表示文件开头。 |
| `PUT >$:` | 在文件末尾追加正文行。 |
| `PUT >N*:` | 在从第 `N` 行开始的语法块之后插入。 |
| `CUT N.=M` / `CUT N*` | 删除并捕获包含首尾的行范围或解析得到的块。添加 `@name` 可写入命名寄存器。 |
| `PUT <N` / `PUT >N` / `PUT >$` | 将匿名寄存器内容粘贴到间隙中。 |
| `PUT <N @name` / `PUT >N @name` / `PUT >$ @name` | 将命名寄存器内容粘贴到间隙中。 |
| `PUT N.=M @name` / `PUT N* @name` | 用命名寄存器内容替换行范围或块。跨度/块粘贴需要使用命名寄存器。 |
| `REM` | 删除该区段的文件。 |
| `MV DEST` | 将编辑后的文件写入目标位置，然后删除源文件。现有目标内容可以被覆盖；包含空格的目标路径需加引号。 |

寄存器名称可包含 ASCII 字母、数字、`_` 或 `-`。匿名寄存器局限于本批次，每次调用开始时都为空。命名寄存器在会话期间持续存在，只有相关写入落地后才会发布。操作跨区段从上到下执行，因此较早区段中的剪切可供后续粘贴使用。重复粘贴不会消耗寄存器内容。

只有带正文的 `PUT ...:` 头部才接受正文行。每个正文行均为 `+TEXT`；单独的 `+` 插入一个空行。正文是最终内容，绝不是 unified diff 中的修改前/后行对。以 `-` 或 `+` 开头的字面内容应写为 `+-...` 或 `++...`。`CUT`、基于寄存器的 `PUT`、`REM` 和 `MV` 不接受正文。

### 块锚点 \{#block-anchors}

块形式会从起始行解析到 tree-sitter 节点的末尾。锚定构造的起始行，不要锚定闭合分隔符、最后一个可见行、空行或内部语句。单行节点会被拒绝，并提示使用相应的显式行操作。当无法解析出块时，`PUT >N*:` 会降级为普通的 `PUT >N:` 并发出警告；替换/剪切块形式则会失败，而不是猜测。

前置装饰器、属性和文档注释可能是独立的语法节点。当解析器将第一个装饰器与声明归为一组时，应锚定该装饰器。在 Rust 中，条目的第一个外部属性（`#[...]`）或外部文档注释（`///`、`/** */`）也会解析到条目结束，跨过后续的属性和注释。同一条目的后续属性或文档注释，或者后面没有条目的属性或文档注释，无论跨越多少行，都会像单行节点一样被拒绝。其他情况下使用显式范围。独立的行注释不会自动纳入。在 Markdown 中，标题的块包含其正文和更深层的子章节，直到下一个同级或更高级的标题为止。

使用紧凑的范围，并将不相邻的修改分开。不要仅为了重新格式化或调整代码风格而使用 `edit`；完成实质性编辑后，运行项目的格式化工具。

## 示例 \{#examples}

给定：

```text
[greet.py#A1B2]
1:@cache
2:def greet(name):
3:    print("Hello, " + name)
4:
5:greet("world")
```

替换带装饰器的函数，不改动其调用方：

```text
*** Begin Patch
[greet.py#A1B2]
PUT 1*:
+@cache
+def greet(name):
+    print(f"Hi, {name}")
*** End Patch
```

使用命名寄存器，将它移动到另一个之前读过的文件：

```text
*** Begin Patch
[greet.py#A1B2]
CUT 1* @fn
[lib/greet.py#3C4D]
PUT <1 @fn
*** End Patch
```

编辑后重命名：

```text
*** Begin Patch
[greet.py#A1B2]
PUT 5.=5:
+greet("team")
MV lib/welcome.py
*** End Patch
```

## 其他传输契约 \{#other-wire-contracts}

| 模式 | 参数 | 编辑形式 |
| --- | --- | --- |
| `replace` | `path`、`old_string`、`new_string`，可选的 `replace_all` | 替换一个文件中引用的文本。 |
| `patch` | `path`、`edits: Array<{ op?: "create" \| "delete" \| "update"; rename?: string; diff?: string }>` | 所有补丁条目均针对顶层 `path`；不同文件分开调用。 |
| `apply_patch` | `input` | 包含 `*** Add File`、`*** Update File`、`*** Move to` 和 `*** Delete File` 区段的组合 `*** Begin Patch` 载荷。 |
| `sloppy` | `input` | 先是 `*** Edit File: path`，然后是 `*** Find` 加上 `*** Replace`、`*** Insert Before`/`After`、`*** Cut` 或 `*** Paste Before`/`After`。 |

`sloppy` 使用现有文本锚点，而非快照标签。Find 必须识别出一个匹配项，除非使用 `*** Find all`（或文件头部以 ` all` 结尾），此时会修改每个匹配项；对于裸标识符，这表示完整单词。正文是原始文本，不带差异前缀或结束标记。Find 中的 `…` 会捕获省略的文本；Replace 按顺序重新输出这些捕获内容。由首行、一个 `…` 行和末行构成的 Find 会定位一个块，并在该块的结束行闭合，而非在嵌套或延续结构的结束行闭合。Insert 保留锚点，并按字面处理 `…`。`*** Cut` 取出匹配的行，下一个 `*** Paste Before`/`*** Paste After` 会将它们放在自身匹配项旁边；两者均无正文，粘贴失败时块会保留在原处。没有操作的 Find 会被拒绝。每一对操作都针对原始文件；匹配/验证失败发生在写入之前。

对于完整的多行构造，将操作和起始行前缀放在同一行：`*** Replace Block: opener`、`*** Delete Block: opener`、`*** Cut Block: opener` 或 `*** Paste Before Block: opener` / `*** Paste After Block: opener`。头部仅用于定位旧块。Replace 接收完整的最终代码，包括仍需保留的起始行；其他块操作不接受正文。无法解析的语法块、共用结束行或不明确的起始行都会被拒绝。此时应改用带有显著上下文的文本 Find。`Delete Block` 还接受两个相邻且字节完全相同的副本：它保留第一个，删除分隔部分和第二个副本。

sloppy 工具调用可以恢复后接 `*** Find` 的 `*** Update File: path`。它也接受只含更新的补丁，其中包含裸 `@@` 补丁块，并以 `*** End Patch` 结尾。每个补丁块的旧行/上下文行必须恰好匹配一次。恢复不会猜测缺失的目标，也不接受文件创建、删除或移动。

`crates/edit/prompts/` 中的模式提示词定义了完整语法。

`apply_patch` 按以下顺序匹配完整的旧行/上下文行：精确匹配、去除尾部空白、去除两端空白，然后规范化 Unicode 标点。
无论其他模式的模糊匹配如何设置，它都不会使用子串匹配或字符相似度匹配。
重复的上下文会绑定到上一个补丁块所在位置或之后的第一个匹配项；上下文无法匹配时，会在任何写入之前拒绝整个封套。
旧行和新行中的数字前缀仍是字面文本，不会被恢复为行号注释。

如果 `*** Update File` 后面只有 `*** Move to:`，则会重命名一个 UTF-8 文件，
但不改变它的字节或权限。没有移动的空更新仍会被拒绝，
源文件缺失或目标位置已占用也同样会被拒绝。

封套中的各区段按顺序看到较早区段的结果。移动会在后续添加操作之前腾出源路径，
后续更新可以指向移动后的文件。预览和应用都会在首次文件系统写入之前验证同一个虚拟命名空间；
后续区段无效时，所有文件都会保持不变。

## 输出与副作用 \{#output-and-side-effects}

Hashline 在一次工具调用中应用修改；它不使用 `ast_edit` 所用的分阶段 `resolve` / `reject` 预览流程。

成功的 hashline 区段会返回新的 `[path#TAG]` 头部、可选的块解析和移动信息行、可用时的精简编辑后预览，以及在恢复或规范化产生警告时出现的 `Warnings:` 块。`EditToolDetails` 可以包含 unified `diff`、`firstChangedLine`、诊断信息、操作（在 hashline 模式下为 `update` 或 `delete`）、路径/移动元数据、`oldText` / `newText`、`snapshotsPruned` 和每文件结果。多区段输入会返回一个汇总结果。存储的修改前/后快照文本在单个文件及多文件结果的总量上均以 32,768 个字符为上限；后续条目可能保留差异，但省略快照文本。

原生解析/匹配/应用失败及写入器失败会返回 `isError: true`，附带诊断文本以及 `details.errorKind`，后者是引擎对失败的分类：`unseen_lines`、`stale_tag`、`unknown_tag`、`other_file_tag`（此会话为另一文件发出的标签）、`missing_tag`、`header_only`、`out_of_range`、`ambiguous_boundary`、`no_change`、`file_not_found`、`parse`、`no_match`、`invalid_utf8`、`plan_mode`、`unresolved_url`、`io`、`write_failed`，其余情况为 `apply`；多文件调用中的文件失败保留各自的分类，`/session` 按该分类统计失败的编辑。原生桥接失败可能会抛出异常。更新通过 ACP 桥接或 LSP 直写执行，因此配置的格式化可能改变持久化文本。新引入的语法解析失败不会回滚编辑：它会生成警告，或在 `edit.autoRepair.enabled` 成功修复时额外提供一条修复说明。

流式渲染器会解析正在传输的载荷中已完整的部分，并计算只读差异。流式预览会跳过暂时无法解析的块、过期标签和空粘贴，而非将不完整输入显示为最终失败。执行时会照常重新读取并验证。

对于多区段调用，所有区段都会在开始写入之前完成解析和准备，使语法、锚点和无实际改动的失败尽早暴露。随后按顺序写入文件；操作系统写入失败可能导致已落地的前缀部分保持已应用状态。命名寄存器的会话状态只针对已落地的前缀部分推进。

## 限制与验证 \{#limits-and-validation}

- 快照标签是四位大写十六进制字符，由规范化后的文件内容派生，并记录在会话快照存储中。
- 使用占位标签（`#AUTO`、`#????`、裸 `#`）或无标签的区段，以及只有头部没有操作的输入，都会被拒绝且不执行写入。与未知标签不匹配的情况一样，回复会携带文件当前的标签；区段有锚点时，还会附带带锚点的上下文。
- `read`/`grep` 展示过的内容很重要：当 `edit.enforceSeenLines=true`（默认值）时，针对已记录可见范围之外的行进行编辑会被拒绝。编辑被省略或未显示的范围之前，应重新读取它们。当存储中没有对带标签内容的读取记录时（新进程、快照被逐出），只有落在超过最窄显示列上限的行上的锚点才会被拒绝（grep 为 512 字节，或更低的 `tools.outputMaxColumns`），因为只有这些行可能曾以截断形式显示。
- 范围包含首尾行，必须按顺序排列；在检查目标文件的实际边界之前，解析器会施加最多展开 100,000 行的放大限制。
- 相互冲突的重叠范围会被拒绝。完全重复的替换范围可以合并，采用后一个正文并发出警告；每个范围应编写一个最终内容补丁块。
- 不匹配回复打印的行，在使用它返回的标签重新发送时会计为已读：没有保留快照的内容会从这些行开始建立已读记录，而保留的读取记录会将它们加入已读集合。重新发送时若锚定其他位置，会收到已读行拒绝及对应内容展示。未记录已读集合或已读集合为空的内容（如 `write` 所记录的内容）仍不受限制。
- 同路径区段会合并，使它们的原始行锚点一同应用。如果交错的同路径区段会使编写时的寄存器顺序不明确，剪贴板操作会被拒绝。
- 过期标签会尝试基于快照恢复。只有记录的快照链能证明存在唯一且安全的结果时，才会应用恢复；否则返回带当前上下文的不匹配信息。如果替换正文与其编写行号处的当前行高度相似，却与偏移后指向的行不相似（用来启发式判断行号是否读自当前文件而非带标签的读取结果），或者恢复破坏了原本可解析文件的语法，也会拒绝造成行号偏移的恢复。
- 单区段中字节完全相同的编辑会返回无改动诊断，不执行写入；连续第三次相同的空操作会报错。在多区段调用中，任何空操作都会在写入之前拒绝整个批次。
- `edit.blockAutoGenerated=true`（默认值）会拒绝识别为自动生成的文件。计划模式只允许在可写根目录内更新，并拒绝所有删除/移动。
- 在所有模式下，非普通文件的目标（FIFO、套接字、字符设备或块设备，包括通过符号链接指向这些对象的情况）都会被拒绝：在进程内读取它可能永久阻塞或永不结束。
- 可以编辑由文件支持的可变内部 URL。只读协议和由处理器负责写入的地址（`agent://`、`proc://` 等）会被拒绝；对这些处理器请使用 `write`。局部/行选择器不能作为编辑目标。
- 审批采用所有目标及移动目的地中最严格的写入等级。

## 常见失败 \{#common-failures}

- `[PATH#TAG]` 缺失/格式错误、未知快照标签，或路径已不存在。
- 锚点在文件之外、已记录的已读行范围之外、被省略的区域中，或基于无法安全恢复的过期快照。
- 范围反向或重叠。
- 带正文的 `PUT` 正文为空、不带正文的操作下面出现正文行、未知命名寄存器，或在明确的匿名剪切之前执行匿名粘贴。
- 块锚点落在不受支持/无效的语法树、空行/闭合行或单行节点上。
- 混入 unified diff 内容（`@@`、apply-patch 哨兵标记、`-old` 行），而非 hashline 操作和最终内容的 `+` 行。
- `REM` / `MV` 冲突、移动目的地无效或与源相同，或文件系统写入失败。
- 多区段批次中存在无改动区段，或连续第三次相同的单区段空操作。
- 非普通目标：`Cannot edit '<path>': it is a <kind>, not a regular file or directory.`

解析器对常见的模型失误提供有限恢复（可选封套、无害的头部噪声、部分裸行和范围写法），并在修复输入时显示警告。调用方应该只输出上面的标准语法；恢复行为不是第二套公开语法。
