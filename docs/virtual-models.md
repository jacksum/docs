# 虚拟模型 \{#virtual-models}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Virtual Models](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/virtual-models.md)。[上游 MIT 许可证](./license.md)。

虚拟模型是可供选择的模型，它会为每个请求挑选一个实际处理请求的物理模型。你可以按任务、费用或对话状态进行路由。例如，用户只需选定一个虚拟模型，路由器就能把简单问题交给小模型，把难题交给大模型。

通过[扩展](./extensions.md)注册虚拟模型。与其他模型一样，虚拟模型可以在 `/model`、`--model`、模型范围和设置中使用。虚拟模型可以列在任意模型提供方名下，包括同时提供物理模型的提供方，例如 `openai-codex/auto`。

## 模型选择与请求分派 \{#selection-and-dispatch}

选择虚拟模型时，也会选定一个思考级别。对每个请求，路由器都会将这组选择映射为一组实际使用的物理模型和思考级别：

```
selected (virtual model, virtual level)  ->  dispatched (physical model, physical level)
jev/auto:low                             ->  anthropic/claude-sonnet-4-5:high
```

虚拟模型的思考级别是路由器的输入。它的含义由路由器决定，不必对应推理预算。

Pi 分开记录和呈现这两组值：

| | 用户选定的值 | 实际分派的值 |
|---|---|---|
| 记录位置 | `model_change` 和 `thinking_level_change` 条目 | 每条助手消息中的 `provider`、`api`、`model`、`thinkingLevel` |
| 查看方式 | `ctx.model`、`ctx.thinkingLevel`、`PI_MODEL`、`PI_REASONING_LEVEL`、`/model` | 每次响应的助手消息 |

模型提供方只接收物理模型。助手消息会记录物理模型，因此跨物理模型重放对话的行为与手动切换模型后相同。恢复会话时，Pi 会根据最新的 `model_change` 条目恢复选定的虚拟模型。如果该虚拟模型已不再注册，Pi 会改用最后一次给出响应的物理模型。

在交互模式下，界面底部会同时显示选定的模型和路由结果，例如 `auto • high → gpt-5.6-luna • medium`。`/session` 会列出各物理模型的费用。

上下文用量按最后一次响应所用物理模型的限制计算，即使该响应出现在切换到虚拟模型之前。如果还没有这样的响应，则使用虚拟模型声明的限制（如有）。Pi 判断是否需要压缩上下文时，会检查同样的限制，也会再检查每个请求实际路由到的模型的限制。如果目标模型的上下文窗口容不下当前对话，Pi 会在发送请求前压缩上下文，并保留路由器选定的目标。

## 注册虚拟模型 \{#register-a-virtual-model}

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerVirtualModel({
    provider: "router",
    id: "auto",
    name: "Auto",
    thinkingLevels: ["low", "high"],
    route(request, ctx) {
      // Tool follow-ups and retries stay on the model that handled the turn.
      const sticky = request.failed ?? request.previous;
      if (request.reason !== "user" && sticky) {
        return { model: sticky.model, thinkingLevel: sticky.thinkingLevel ?? "medium" };
      }
      const id = request.thinkingLevel === "high" ? "claude-sonnet-4-5" : "claude-haiku-4-5";
      return { model: ctx.modelRegistry.find("anthropic", id)!, thinkingLevel: "medium" };
    },
  });
}
```

- `provider` 指定虚拟模型列在哪个模型提供方名下，可以是任意模型提供方 ID。同一提供方可以同时列出多个虚拟模型和自己的物理模型。如果该提供方有物理模型，则在它具备凭据时，虚拟模型才可用。如果所指定的 ID 未被任何提供方使用，虚拟模型始终可用。
- `id` 不能与该提供方的物理模型 ID 相同。如果后续刷新模型目录时加入了同 ID 的物理模型，虚拟模型会将其隐藏。
- `thinkingLevels` 列出可选的思考级别，默认为 `["off"]`。
- `contextWindow` 和 `maxTokens` 在收到首个响应前显示。未设置的限制视为未知。
- `input` 列出可选的输入类型，默认支持文本和图像。不支持图像的物理模型会收到占位内容。

注册虚拟模型遵循与 `pi.registerProvider()` 相同的排队和重载规则。使用相同的提供方和 ID 再次注册会替换该虚拟模型。`pi.unregisterVirtualModel(provider, id)` 会移除虚拟模型，`pi.unregisterProvider()` 不会。SDK 代码无需扩展即可通过 `modelRuntime.registerVirtualModel(definition)` 注册虚拟模型。

## 路由请求 \{#route-requests}

使用虚拟模型发出请求前，Pi 每次都会调用 `route(request, ctx)`，它返回 `{ model, thinkingLevel }`。只要模型提供方具备凭据，目录中的任意物理模型都可作为目标，可用 `ctx.modelRegistry` 查找。虚拟模型不能路由到另一个虚拟模型。Pi 会将思考级别限制在返回的模型所支持的范围内。

| 字段 | 含义 |
|---|---|
| `model`、`thinkingLevel` | 选定的虚拟模型和思考级别 |
| `reason` | 发起请求的原因，见下表 |
| `previous` | `messages` 中最近一次成功响应所用的物理模型和思考级别 |
| `failed` | 对于 `retry`，包含上一次失败请求所用的物理模型和思考级别，以及对应的助手消息 `message`。`messages` 已不再包含这条消息。该消息带有 `stopReason` 和 `errorMessage`。如果路由本身失败，则没有此字段 |
| `state` | 此会话分支上一次返回的路由器状态，见下文 |
| `messages` | 本次请求的对话内容，包括系统消息 |
| `signal` | 本次请求的中止信号 |

| `reason` | 请求 |
|---|---|
| `user` | 用户发送消息后的首个请求，用户消息包括引导消息和后续消息 |
| `continuation` | 智能体循环中的其他请求，例如收到工具结果或扩展消息后发出的请求 |
| `retry` | 请求失败后的自动重试，包括因上下文溢出而压缩后发起的重试 |
| `direct` | 智能体循环之外发出的请求，例如生成压缩摘要，或扩展调用 `ctx.modelRegistry.streamSimple()` |

处理 `continuation` 时返回 `previous`，处理 `retry` 时返回 `failed`，可以使提示词缓存和思考签名保持有效。可以在不同轮次之间切换模型，但会丢失提示词缓存。重试时也可以换用其他模型，例如 `failed.message.errorMessage` 表明模型提供方过载或上下文溢出时。

如果 `route()` 抛出异常，或返回了虚拟模型或没有凭据的模型，请求会以错误响应结束。

## 保存路由状态 \{#keep-routing-state}

`route()` 可以在返回模型时一并返回 `state`。Pi 将它保存在当前会话分支上，并在后续请求中通过 `request.state` 传回。可以用它保存对话记录中没有的决策信息，例如分类结果或当前路由阶段：

```typescript
pi.registerVirtualModel<{ phase: "plan" | "build" }>({
  provider: "router",
  id: "phased",
  name: "Phased",
  route(request, ctx) {
    const state = request.state ?? { phase: "plan" };
    const id = state.phase === "plan" ? "claude-opus-4-5" : "claude-haiku-4-5";
    return { model: ctx.modelRegistry.find("anthropic", id)!, thinkingLevel: "medium", state };
  },
});
```

- 状态必须能序列化为 JSON。返回 `undefined` 或 `request.state` 本身会保留当前状态。
- 返回其他任何对象时，Pi 会在发送请求之前将其保存为新状态，即使它与当前状态相等。仅在状态变化时返回新对象。即使请求随后失败，保存的状态也会保留。
- 状态随会话树管理，因此创建分支或通过 `/tree` 导航时，看到的都是所在分支的状态。压缩上下文不会清除状态。
- `direct` 请求不携带状态，Pi 也会忽略这类请求返回的状态。

对话记录已经包含选定的模型和每次实际分派的模型，`ctx.sessionManager.getBranch()` 可访问这两类记录。

路由器可以通过 `ctx.modelRegistry` 调用其他模型。例如，可以用 `ctx.modelRegistry.findOfType("classifier", provider, id)` 查找分类模型，再通过 `ctx.modelRegistry.classify()` 调用该模型。这会增加该轮首个 token 出现前的延迟。

完整的路由器示例见 [`jev-router.ts`](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/examples/extensions/jev-router.ts)。它先让 Jev 分类器选定一个能力较强的 OpenAI Codex 模型，由该模型制定计划并完成首次编辑，再切换一次，改用费用较低的模型。这次切换会导致一次提示词缓存未命中。路由器将当前阶段保存在状态中。
