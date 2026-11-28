---
title: "AI 工具模式归一化"
description: "Oh My Pi 官方仓库文档：AI 工具模式归一化。"
---

# AI 工具模式归一化 \{#ai-tool-schema-normalization}

`@oh-my-pi/pi-ai` 提供共享的模式归一化辅助函数，供模型提供方在通过网络发送工具前使用。共享遍历器位于 `packages/ai/src/utils/schema/normalize.ts`；原生 Anthropic 工具归一化仍位于 `packages/ai/src/providers/anthropic.ts`。运行契约为 `packages/ai/src/utils/schema/CONSTRAINTS.md`。

没有单独的 `strict-mode.ts` 模块：OpenAI 严格模式清理、OpenAI Responses 重写、Google/Vertex 清理、MCP 清理和 Cursor 投影已合并到 `normalize.ts` 中。Google、MCP 和 Moonshot 使用其由选项驱动的 `normalizeSchema` 遍历；其他路径使用专门的遍历器。Apple Foundation Models 降级转换位于 `foundation-models.ts`。

## 入口点 \{#entry-points}

所有导出都位于 `@oh-my-pi/pi-ai/utils/schema` 下：

- `normalizeSchema(value, options)`：通用的选项驱动遍历器。
- `normalizeSchemaForGoogle(value)`：Gemini / Vertex。
- `normalizeSchemaForMCP(value)`：在 MCP inputSchema 进入自定义工具注册表前处理它们。`tool-bridge.ts` 将每个 MCP `inputSchema` 交给此分派器处理。
- `sanitizeSchemaForOpenAIResponses(schema)`（别名为 `normalizeSchemaForOpenAIResponses`）：递归将 `oneOf` 重写为 `anyOf`，为对象模式添加空 `properties`，并移除 Responses API 拒绝的正则表达式环视。
- `sanitizeSchemaForStrictMode(schema)` 和 `enforceStrictSchema(schema)` / `tryEnforceStrictSchema(schema)`：OpenAI 严格模式管线（清理 → 强制约束）。三者均从 `normalize.ts` 导出。
- 来自 `./adapt` 的 `adaptSchemaForStrict(schema, strict)`：轻量组合器，将 draft-07 输入升级为 2020-12，并封装 `tryEnforceStrictSchema` 供模型提供方调用点使用。`./adapt` 还导出 `NO_STRICT` 全局绕过标志（环境变量 `PI_NO_STRICT`），每个会发出 `strict: true` 的模型提供方都会遵守该标志。
- `normalizeSchemaForMoonshot(value)`：Moonshot/Kimi 的 MFJS 子集。
- `sanitizeSchemaForOllama(schema)`：为 Ollama 的 Go 模式解析器重写布尔子模式、类型数组，以及值为布尔值的对象开放性关键字。
- `sanitizeSchemaForGrammar(schema)`：为受语法约束的 OpenAI 兼容后端放宽布尔子模式，同时保留布尔值的 `additionalProperties` / `unevaluatedProperties`。
- `sanitizeSchemaForCursor(schema)`：为带有 `requiresCursorToolSchemaProjection: true` 的模型解引用并移除组合关键字。对象备选项会合并，标量备选项会放宽；本地验证仍使用规范工具模式。
- 来自 `./foundation-models` 的 `toFoundationModelsSchema(schema, name)` / `decodeFoundationModelsArguments(args, encodedPaths)`：将工具模式降级转换为 Apple 的 `GenerationSchema` 方言，并解码必须以 JSON 字符串传输的值。

统一流程重构中移除的内容：

- `strict-mode.ts`（合并到 `normalize.ts`）。
- `sanitize-google.ts`（被 `normalizeSchemaFor*` 分派器取代）。
- `StringEnum` 辅助函数：使用 `type.enumerated(...)`；omptype 会输出模型提供方兼容的 JSON Schema。
- `sanitizeSchemaFor{Google,MCP}`：重命名为 `normalizeSchemaFor{Google,MCP}`。

## 分派器映射 \{#dispatcher-mapping}

| 模型提供方传输 | 分派器 |
| --- | --- |
| `openai-completions` | `adaptSchemaForStrict`（启用严格模式时清理并强制约束） |
| `openai-responses`、`openai-codex-responses` | 严格模式适配前使用 `sanitizeSchemaForOpenAIResponses` |
| `azure-openai-responses` | `sanitizeSchemaForOpenAIResponses`；不进行适配，发出 `strict: false` |
| 使用 MFJS 的 Moonshot/Kimi 原生主机（`toolSchemaFlavor: "moonshot-mfjs"`） | `normalizeSchemaForMoonshot` |
| 语法风格的 OpenAI 兼容主机（`toolSchemaFlavor: "grammar"`） | `sanitizeSchemaForGrammar` |
| OpenAI 兼容主机后面的 Gemini（`toolSchemaFlavor: "google"`，GitHub Copilot） | `normalizeSchemaForGoogle` |
| `ollama-chat`（`ollama` / `ollama-cloud`）工具参数 | `toolWireSchema` → `sanitizeSchemaForOllama` |
| 带有 `requiresCursorToolSchemaProjection: true` 的 `cursor-agent` | `toolWireSchema` → `sanitizeSchemaForCursor` |
| `google-generative-ai`、`google-vertex` | `normalizeSchemaForGoogle` |
| `apple-foundation-models` | `toolWireSchema` → `toFoundationModelsSchema`；之后解码参数 |
| MCP `inputSchema` 接入 | `normalizeSchemaForMCP` |
| `anthropic-messages` | `anthropic.ts` 中按模型提供方设置的白名单 |

## 遍历语义 \{#walk-semantics}

`normalizeSchema` 将输入升级为 JSON Schema 2020-12，对树解引用，然后使用分派器固定的选项集进行遍历。根据这些选项的启用情况，每个节点会：

1. 将 `snake_case` 组合器/属性键重命名为 camelCase（`any_of` → `anyOf` 等；冲突遵循 python-genai 的 `pop(from)`/`set(to)` 语义，即 snake_case 优先）。
2. 在递归到子节点之前，对可空联合应用 `handle_null_fields` 折叠。
3. 剥离目标模型提供方不支持的键，并可选择通过溢出格式化器（`spill.ts`），将对人有意义的键（`pattern`、`format`、最小值/最大值、`default`、`examples` 等）提升到同级 `description` 中。结构/元数据键（`$ref`、`$defs`、`additionalProperties`）不会溢出。
4. 归一化类型联合（在 Google 上，`type: ["T", "null"]` → `type: "T"` + 可空标记）。Google 还会输出属性排序，并且只保留值为字符串的枚举；其他分派器使用各自的枚举策略。
5. 折叠仅含对象/同类型的组合器，并执行残余组合器的不动点处理。

## OpenAI 严格模式管线 \{#openai-strict-mode-pipeline}

`adaptSchemaForStrict(schema, strict)` 运行 `tryEnforceStrictSchema`，后者组合以下步骤：

1. **清理**（`sanitizeSchemaForStrictMode`）：剥离非结构关键字（`format`、`pattern`、最小值/最大值、`examples`、`default`、`if`/`then`/`else`、`not`、`unevaluated*`、`patternProperties`、`dependent*`、`content*`、`min/maxProperties`、`$dynamicRef` 等）。在丢弃 `default` 值之前，将它以 ` (default: X)` 形式内联到同级 `description` 中，除非 `description` 已包含 `(default:` 或不存在 `description`。
2. **强制约束**（`enforceStrictSchema`）：每个对象节点获得 `additionalProperties: false`，每个属性都进入 `required`，可选属性变为可空联合（`anyOf: [<original>, { "type": "null" }]`）。元组 `prefixItems` 会递归进行严格化。

这两轮处理使用缓存/循环防护，使引用、`allOf` 和可空包装保持确定性，不会无限递归。在清理之前，`tryEnforceStrictSchema` 会将开放映射（`patternProperties`、`additionalProperties: true` 或模式）及无约束的布尔/空子模式排除在严格模式之外，而不是静默关闭它们。结果按输入模式对象进行记忆化缓存。如果预检查失败或强制约束抛出异常，它会返回 `{ strict: false, schema: upgraded }`；调用方只有在强制约束确实成功时才能发出 `strict: true`。

### 严格模式归一化器处理的边界情况 \{#edge-cases-the-strict-mode-normalizer-handles}

- **本地 `$ref` 内联。** OpenAI 严格模式拒绝带有同级键的 `{ "$ref": "...", "description": "..." }`。清理器会根据根节点预先解析本地 `#/...` 引用并合并，**同级键优先**于解析后的定义，与 `openai-python` 的 `_ensure_strict_json_schema` 优先级相同。递归引用由每次遍历的 epoch 防护。
- **单项 `allOf`。** `{ "allOf": [X], ...siblings }` 会折叠为 `{ ...X, ...siblings }`，内联条目的键优先于原有同级键（与 `openai-python` 的 `_pydantic.py:79-83` 一致）。多项 `allOf` 会保留，其分支会递归严格化。
- **类型数组分支和可空联合。** 当节点有 `type: ["T", "U"]` 时，清理器会为每种类型输出一个变体模式，删去类型专属关键字（例如，`properties`/`required` 只保留在 `object` 变体中，`items` 只保留在 `array` 变体中）。共享的 `description` 会**提升到 `anyOf` 包装器上**，而不是在每个分支中重复，因此严格可空联合变为 `{ anyOf: [T, { type: "null" }], description: "..." }`，而不是 `anyOf: [{ ..., description }, { ..., description }]`。
- **纯联合扁平化。** 仅包含 `anyOf` 和可选 `description` 的嵌套 `anyOf` 节点会被扁平化。可选的纯联合会直接获得 null 分支；带有约束性同级项的联合则保留可空包装器，使这些同级项不会意外约束 null 分支。
- **没有 `type` 的枚举/常量。** 清理和强制约束路径都会调用 `inferStrictPrimitiveTypeFromEnumOrConst`，从 `enum` / `const` 值推断基础类型 `type`。混合基础类型枚举（`[1, "two", null]`）、包含对象/数组的枚举，以及非基础类型的 `const` 值（`{a:1}`、`[1,2,3]`）无法用单个 `type` 关键字描述，因此会触发严格模式的失败放行路径；输出无类型模式只会在网络交互时被 OpenAI 拒绝。

## 性能：静态指纹缓存 \{#performance-static-fingerprint-cache}

`packages/catalog/src/model-manager.ts` 中的 `resolveProviderModels` 与 `packages/catalog/src/model-cache.ts` 中的 `readModelCache`/`writeModelCache`，通过 SQLite `model_cache` 表上的 `static_fingerprint` 列协作（当前缓存模式版本为 13）。

- `fingerprintStaticModels(staticModels, dynamicModelsAuthoritative)` 每次调用都会对当前静态目录切片计算哈希（`Bun.hash(JSON.stringify(models))`，以 base36 表示）。它以合并格式、软件包版本和权威模式作为前缀；不会标记或记忆化缓存调用方拥有的数组。端点迁移时要删除的 ID 也纳入缓存身份。
- 当跳过网络获取、缓存新鲜且具权威性、恢复的请求头完整，并且静态指纹匹配时，`resolveProviderModels` 可以复用恢复的合并结果。增量式静态目录仍会移除缓存中相同 ID 的贡献项并合并其指标；返回的模型还会经过变体折叠。
- `mergeModelSources` 和 `mergeDynamicModels` 会对空来源输入短路，避免不必要的 `Map` 构建。

缓存模式版本或实体化策略戳不同的行会被删除。策略戳包含编译后 KDL 规则的内容哈希，因此即使软件包版本不变，策略变更也会使已实体化的模型失效。新增缓存列采用保守默认值。

## 相关内容 \{#related}

- `docs/models.md`：注册表、等价性、兼容性标志（`supportsStrictMode`、`toolStrictMode`、`disableStrictTools`）。
- `docs/provider-streaming-internals.md`：归一化模式如何在下游的模型提供方流循环中使用。
- `docs/mcp-server-tool-authoring.md`：通过 `normalizeSchemaForMCP` 接入 MCP `inputSchema`。
- `packages/ai/src/utils/schema/CONSTRAINTS.md`：每条归一化规则的运行契约。
