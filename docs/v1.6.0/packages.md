# Pi 包 \{#pi-packages}

Pi 包可以将扩展、技能、提示词模板和主题作为一个整体安装和分发。需要通过 npm 或 git 共享定制内容，或需要将相关资源放在一起时，可以使用 Pi 包。

一个 Pi 包可以是普通目录，也可以是 npm 包。它可以采用约定的资源目录，通过 `package.json` 的 `pi` 键声明具体路径，也可以包含自己的运行时依赖。

## 安装和管理包 \{#install-and-manage-packages}

可以从 npm、git 或本地路径安装：

```bash
pi install npm:@example/pi-tools@1.0.0
pi install git:github.com/example/pi-tools@v1
pi install ./local-package
```

`pi list` 列出已配置的包。用 `pi remove <source>` 移除指定包，用 `pi update --extensions` 使已安装的包与配置的来源一致。完整的包管理命令和选项见[命令行](./cli.md#package-commands)。

如果配置的包在启动时安装失败（例如 npm 无法连接注册表），Pi 会发出警告，跳过该包的资源并继续运行。下次启动或执行 `/reload` 时，Pi 会重试安装。`pi install` 和 `pi update --extensions` 仍会报告失败并以非零状态码退出。

个人安装的包会记录在 `~/.pi/agent/settings.json` 中。加上 `--local` 或 `-l` 可将包声明写入 `.pi/settings.json`。只有在项目信任获准后，Pi 才会读取该文件中的包声明。

只有在完成项目信任判定后，Pi 才会安装和加载项目包。包可以执行扩展代码，也可以包含指示模型运行程序的技能。安装第三方包前，请审查其源代码。信任项目前，请审查项目的包声明。

使用 `--extension` 或 `-e` 可以只在本次调用中试用一个包，不将其添加到设置中：

```bash
pi -e npm:@example/pi-tools
```

Pi 将通过 `-e` 加载的包缓存到 `~/.pi/agent/tmp/extensions/`，并在每次启动和执行 `/reload` 时检查它们。如果 npm 注册表中有符合版本要求的较新版本，Pi 会重新安装该包。如果锁定了确切版本（例如 `@1.2.3`），则不检查更新。对于 git 包，Pi 从远程获取更新，并将检出内容重置到远程分支或引用。如果引用是提交哈希且已检出该提交，Pi 不会再次获取。检查失败或启用离线模式时，Pi 会加载缓存的副本。

## 选择包来源 \{#choose-a-source}

| 来源 | 示例 | 行为 |
|---|---|---|
| npm | `npm:@example/pi-tools@1.0.0` | 安装到 Pi 的 npm 目录下 |
| git | `git:github.com/example/pi-tools@v1` | 克隆仓库并使检出内容与所选引用一致 |
| URL | `https://github.com/example/pi-tools` | 按 git 来源处理 |
| 本地路径 | `./pi-tools` | 从解析后的路径直接加载，不复制文件 |

带版本的 npm 包声明会锁定版本。Git 标签和提交也会锁定。更新包时，Pi 会使检出内容与配置的引用一致，不会更改该引用。

本地相对路径以声明该路径的设置文件所在目录为基准解析。文件路径只加载一个扩展。目录路径按常规的包资源发现规则处理。

## 创建包 \{#create-a-package}

最简单的 Pi 包使用约定的目录结构：

```text
my-pi-package/
├── package.json
├── extensions/
├── skills/
├── prompts/
└── themes/
```

没有 `pi` 清单时，Pi 会在这些目录中查找 TypeScript 和 JavaScript 扩展、技能目录、Markdown 提示词和 JSON 主题。

资源位于其他位置或需要筛选时，请使用显式清单：

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./src/extension.ts"],
    "skills": ["./resources/skills"],
    "prompts": ["./resources/prompts/*.md"],
    "themes": ["./resources/themes/*.json"]
  }
}
```

路径相对于包的根目录。数组支持 glob 模式和排除项。如果用 glob 遍历无法找到以点开头的资源根目录或作为符号链接的资源根目录，请直接列出这些目录。

添加 `pi-package` 关键字后，[Pi 包目录](https://pi.dev/packages)便可发现该 npm 包。可选的 `pi.image` 和 `pi.video` 字段可为包添加预览。

## 显示更新日志 \{#show-a-changelog}

包更新后，Pi 可以显示变更。下一次重新启动 Pi 时，Pi 会读取包的更新日志，在「Extension Updates」（扩展更新）下显示比上次记录的版本更新的条目，方式与显示 Pi 自身的更新日志相同。Pi 首次发现某个包时只记录版本，不显示条目。

此功能仅适用于至少加载一个扩展的包。仅提供技能、提示词模板或主题的包不显示更新日志。

Pi 默认读取包根目录下的 `CHANGELOG.md`。可将 `pi.changelogPath` 指向包内的另一个文件，或将它设为 `""` 以禁用更新日志：

```json
{
  "name": "my-pi-package",
  "version": "1.2.0",
  "pi": {
    "changelogPath": "./docs/CHANGELOG.md"
  }
}
```

版本标题须采用与 Pi 更新日志相同的格式，例如 `## [1.2.0]` 或 `## 1.2.0 - 2026-01-01`。Pi 根据 `package.json` 中的 `version` 字段匹配条目，因此 git 包只有在该字段的版本号增加时才会显示更新日志。`collapseChangelog` 设置将日志区段压缩为每个包一行，例如 `Updated my-pi-package to v1.2.0.`。与 Pi 自身的更新日志不同，包的更新日志不会通过 `/changelog` 显示。要查看包的变更详情，请阅读包的更新日志文件或仓库。

## 声明依赖 \{#declare-dependencies}

将扩展导入的运行时依赖包列在 `dependencies` 中。Pi 从 npm 或 git 安装包时，也会安装该包的依赖。

Pi 向扩展和技能提供以下包：

- `@earendil-works/pi-ai`
- `@earendil-works/pi-agent-core`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

将以上由 Pi 提供的包声明在 `peerDependencies` 中，版本范围设为 `"*"`，不要将它们打包。对于受 Pi 管理的 npm 包，以及使用 npm、pnpm 或 Bun 安装的 git 包，Pi 会阻止自动安装对等依赖。Pi 不会安装或修改本地包，因此本地包的依赖树仍由包作者负责。

不要在 `dependencies` 中列出由 Pi 提供的包。包的实体副本可能让编译后的 ESM 绕过 Pi 的扩展模块映射，导致类和注册表出现多个副本，并重复执行初始化。Pi 检测到这种清单配置时会发出扩展警告。作为依赖使用的其他 Pi 包必须包含在发布的 tar 包中，并通过它们在 `node_modules` 下的资源路径引用。

已安装的包各自从独立的模块根目录加载。不要假定两个包会共享同一个依赖实例，也不要假定一个包可以解析另一个包未声明的依赖。

## 选择包中的资源 \{#select-package-resources}

在设置中使用对象形式的包声明，可缩小从包中加载的资源范围：

```json
{
  "packages": [
    {
      "source": "npm:@example/pi-tools",
      "extensions": ["extensions/*.ts", "!extensions/legacy.ts"],
      "skills": [],
      "prompts": ["prompts/review.md"]
    }
  ]
}
```

对于每种资源类型：

- 省略该属性，加载包允许的全部资源。
- 使用 `[]`，不加载此类资源。
- 使用 `!pattern`，排除与 glob 模式匹配的资源。
- 使用 `+path`，包含指定路径上的一个允许加载的资源。
- 使用 `-path`，排除指定路径上的一个资源。

筛选条件只能缩小包清单允许的范围，不能加载包本身未声明的资源。

运行 `pi config` 可启用或禁用已发现的资源和 Pi 的内置扩展。默认打开个人配置。按 `Tab` 切换配置范围，或运行 `pi config --local` 直接打开项目的覆盖设置。

## 包的配置范围与标识 \{#understand-scope-and-identity}

同一个包可以同时出现在个人设置和项目设置中。通常，项目条目会替换个人条目。如果项目条目设置了 `autoload: false`，它只在个人条目的基础上调整资源筛选。

Pi 以包名标识 npm 包，以不含引用的仓库 URL 标识 git 包，以解析后的绝对路径标识本地包。这可以防止同一个包因多条等效声明而被加载两次。

打包前，可参阅[扩展](./extensions.md)、[技能](./skills.md)、[提示词模板](./prompt-templates.md)和[主题](./themes.md)，了解如何设计各类资源。
