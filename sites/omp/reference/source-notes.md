# v19.1.1 原文的适用边界

这些说明区分上游原文的简写、口径差异和未说明的条件。译文以固定提交为准，不将这些疑点当作运行时结论。

| 主题 | 原文依据 | 阅读时如何区分 |
| --- | --- | --- |
| 安装版本 | [安装脚本参数](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/README.md#L39-L47)、[mise 示例与 Bun 版本](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/README.md#L88-L100) | 文档固定在 v19.1.1，并不意味着不带版本的安装命令也会固定版本。原文提供脚本的 `--ref` 或 `-Ref`，而 mise 示例未指定版本。独立写出的 Bun 版本行未说明适用的安装方式。 |
| ACP 工具审批 | [通用危险命令规则](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/approval-mode.md#L108-L113)、[ACP 规则](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/approval-mode.md#L207-L213) | 通用规则说 `yolo` 忽略没有显式策略的危险命令覆盖；ACP 段也先区分 `allow`、`deny` 和 `prompt`，随后用「每次调用」概括危险命令。不要将概括句脱离最终策略判定阅读。编辑器侧的操作类别审批另有说明。 |
| Collab 链接 | [导语](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/collab.md#L1-L3)、[权限说明](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/collab.md#L126-L145) | 导语概称访客能发送提示和中断。正文明确区分控制与只读，不能用导语推断只读链接拥有控制权限。 |
| Collab 房间代次 | [重试复用代次](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/collab.md#L60)、[注册表字段](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/collab.md#L82) | 字段说明概称每个新房间递增；从未成功打开的自动启动房间重试时，原文另明确复用代次。 |
| Hindsight 清理 | [通用命令表](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/memory.md#L50-L59)、[Hindsight 专节](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/memory.md#L154-L158) | 通用表将 `clear` 和 `reset` 概括为删除后端数据或产物。Hindsight 专节明确 `/memory clear` 只清本地会话状态与召回缓存，不删除服务器端记忆库。 |
| 扩展提供方字段数 | [替换内置提供方的字段](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/extensions.md#L239-L247) | 原文引导句说有四个字段，实际列了五项。译文保留列表中的全部条目。 |
| 主题必填颜色 | [顶层结构](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/theme.md#L23-L31)、[详细例外](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/theme.md#L40-L42) | 顶层结构只提到 `thinkingMax` 可选；下文还列出 `assistantMessageText`、`mdExtensionLink` 和 `subagent1` 到 `subagent6`。 |
| TypeScript 语言服务器 | [内置列表](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/lsp-config.md#L225-L229)、[每项目选择规则](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/docs/lsp-config.md#L279) | 表中把版本标记放在 JavaScript 之后，末段则按 TypeScript 安装版本与 `tsc` 解释选择规则。译文保留表和末段各自的写法。 |
