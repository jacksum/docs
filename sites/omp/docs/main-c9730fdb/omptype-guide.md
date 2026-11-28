---
title: "omptype 指南（在本仓库中编写模式）"
description: "Oh My Pi 官方仓库文档：omptype 指南（在本仓库中编写模式）。"
---

# omptype 指南（在本仓库中编写模式） \{#omptype-guide-schema-authoring-in-this-repo}

内部模式使用 **`@oh-my-pi/omptype`**，这是一个兼容 ArkType、带有惰性 JIT 运行时的验证器（`packages/omptype`）。使用 `import { type } from "@oh-my-pi/omptype"` 编写类型。

## 为什么使用 omptype（运行时契约） \{#why-omptype-runtime-contract}

- `type()` 不会立即生成验证器。`packages/omptype/README.md` 中的基准测量结果取决于硬件/运行时，并非 API 保证。
- 前两次调用运行解释器；第三次调用通过 `new Function` JIT 编译专用验证器。错误消息按需构建。
- 没有可用的 `jitless` 模式，惰性 JIT 已消除了它原本要规避的启动开销。直接导入 `type` 即可。（`ScopeOptions` 为兼容 ArkType 接受 `jitless` 标志，但运行时从不读取它。）

## 检测契约（不要破坏） \{#the-detection-contract-dont-break-it}

`packages/ai/src/utils/schema/wire.ts` 区分两类模式：

- **omptype** = 具有 `.toJsonSchema` 和 `.assert` 方法的可调用函数（`isArkSchema`）。
- **JSON Schema** = 普通对象。

在提供方边界，`toolWireSchema()` 请求 draft-2020-12 JSON Schema，在不改变必需键的情况下剪除不受约束的 `T | undefined` 分支，并且仅当声明的对象没有显式的额外属性/模式属性策略时，才以 `additionalProperties: false` 将其封闭。谓词（`.narrow`）和不透明变换（`.pipe`）在本地验证，但在传输中公开其结构化输入模式。

## 定义语言（兼容 arktype 的子集） \{#definition-language-arktype-compatible-subset}

| 构造 | 形式 |
| --- | --- |
| 基本类型 | `"string"`、`"number"`、`"boolean"`、`"null"`、`"undefined"`、`"unknown"`、`"object"`、`"bigint"` |
| 整数 | `"number.integer"` |
| URL 字符串 | `"string.url"` |
| 字面量 | `"'x'"`、`"5"`、`"true"` |
| 联合 | `"'a' \| 'b'"`、`"string \| null"` |
| 交集 | `"string & string.url"`、`[left, "&", right]` |
| 数组 | `"string[]"`、`"(string \| number)[]"`、`[def, "[]"]` |
| 边界 | `"number >= 0"`、`"0 < number <= 3600"`、`"1 <= string <= 10"` |
| 可选键 | `{ "limit?": "number" }` 或值后缀 `{ limit: "number?" }` |
| 默认值 | `{ count: "number = 10" }`、`type("string[]").default(() => [])` |
| 未声明的键 | `"+": "reject"`（失败）/ `"+": "delete"`（移除）/ 默认保留 |
| 记录 | `{ "[string]": "number" }` 或 `"Record<string, number>"` |
| 元组 | `["string", "number"]`、`["string", "...", "number[]"]` |
| 运行时枚举 | `type.enumerated(...RUNTIME_ARRAY)` |
| 运行时构建的对象定义 | `type.raw({...})`（返回 `BaseType`） |
| 关键字静态成员 | `type.number.atLeast(5).atMost(300)`、`type.string` |

## 验证（与 arktype 相同） \{#validating-same-as-arktype}

```ts
import { type } from "@oh-my-pi/omptype";
const out = schema(value);
if (out instanceof type.errors) {
	// out.summary → human message; entries have .path (array) and .problem
	throw new Error(out.summary);
}
// `out` is the validated/morphed value (defaults filled, extras stripped)
```

- 失败时返回 `OmpErrors`（`OmpError` 的数组）；`type.errors === OmpErrors`。
- 结构验证快速失败；谓词/变换可以返回自定义 `OmpErrors`。
- 内置默认值和 `"+": "delete"` 默认生成变换后的副本。用户的 `.pipe()` 回调不会自动克隆；不要修改其输入。作用域的 `clone` 选项可以提供克隆函数，而 `clone: false` 会显式将对象/数组变换写回输入。
- 绝不要使用 `.allows()` 进行工具验证，它会跳过变换/默认值/管道。
- `.infer` / `.inferIn` 是仅用于推断的属性。
- 定义错误（错误的 DSL、非法组合）会在调用 `type()` 时抛出 `OmpTypeError`。

## 方法 \{#methods}

`.describe(d)`、`.default(v | () => v)`、`.or(TypeOrStringDef)`、`.and(Type)`、`.array()`、`.atLeastLength(n)` / `.atMostLength(n)`（字符串/数组）、`.atLeast(n)` / `.atMost(n)`（数字）、`.pipe(fn)`、`.narrow(fn)`（配合 `ctx.mustBe("...")`）、`.allows(v)`、`.assert(v)`、`.toJsonSchema()`。

`.or()` 和 `.and()` 的模式、字符串和对象字面量操作数有带类型的重载。对象模式还支持 `.pick()`、`.omit()`、`.partial()`、`.required()`、`.merge()` 以及未声明键策略。`.in` 和 `.out` 公开独立模式，分别用于接受的输入和已知的输出；不透明变换之后的输出是 `unknown`。`.pipe.try()` 将回调抛出的错误转换为验证错误；普通 `.pipe()` 则传播这些错误。

## 作用域、模块和泛型 \{#scopes-modules-and-generics}

递归或相互引用的模式通过命名作用域处理（`packages/omptype/src/type.ts`、`scope()` / `type.scope()`）：

```ts
import { type } from "@oh-my-pi/omptype";

const types = type.module({
	tree: { value: "number", "children?": "tree[]" },
});
```

- `type.scope(aliases)`（也以顶层 `scope()` 导出）返回一个 `TypeScope`，具有 `.type`、`.define`、`.resolve`、`.import` 和 `.export`；别名可以彼此递归引用，`#private` 名称保留在内部。
- `type.module({...})` 将命名模块（`scope(...).export()`）编译为可直接使用的模式映射。
- `type.generic("<T>", def)` 构建运行时泛型，其他定义可以在作用域内将其实例化。

## JSON Schema 互操作 \{#json-schema-interop}

- `.toJsonSchema()` 默认使用 draft-2020-12 风格的结构关键字，除非 `target` 或 `dialect` 请求，否则不带 `$schema` 声明。`target: "draft-07"` 将元组和引用转换为该方言。递归别名生成 `$defs`/`$ref`（draft-07 使用 `definitions`）。
- `io: "input"` 描述接受的载荷；`io: "output"` 描述生成的值，并将填充了默认值的属性设为必需。不透明变换的输出不受约束。不设置 `io` 则保留嵌套变换的旧有混合行为。
- `fromJsonSchema(schema)` 导入受支持的结构关键字、字符串格式、本地 `$defs`/`definitions` 递归、枚举和组合。它不是完整的 JSON Schema 验证器：未知关键字会被忽略，`oneOf` 被视为联合，外部引用会被拒绝。
- `type.withJsonSchema(schema, json)` 包装仅用于验证的模式，使 `.toJsonSchema()` 即使嵌套在对象、数组或联合中，也原样生成 `json`；带有默认值或会改变输出的变换的模式会被拒绝。
- 每个模式通过 `~standard` 公开 Standard Schema V1（同步 `validate`），可直接用于 `@t3-oss/env`、tRPC 和其他 Standard Schema 使用者。它的 JSON Schema 互操作也通过 `~standard` 公开输入/输出转换器。

## 适配器 \{#adapters}

TypeBox 风格和 Zod 风格的编写方式由 omptype 运行时支持：

```ts
import { Type, type Static } from "@oh-my-pi/omptype/typebox";
import { z } from "@oh-my-pi/omptype/zod";

const User = z.object({ name: z.string() });
type User = z.infer<typeof User>;
```

这些方式会生成真正的 omptype 模式，带有 JIT 验证和 `toJsonSchema`。内部代码直接编写字符串 DSL。
