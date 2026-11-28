---
title: "Collab：实时会话共享"
description: "Oh My Pi 官方仓库文档：Collab：实时会话共享。"
---

# Collab：实时会话共享 \{#collab-live-session-sharing}

`/collab` 将运行中的会话实时共享给其他 omp 实例。访客在**自己的 TUI 中原生渲染同一个会话**，包括流式助手文本、工具调用卡片、页脚状态（cwd、模型、上下文 %、费用）、ctrl+o 展开和 `/dump`，而非终端镜像。访客可以发送提示和中断智能体；宿主机器运行智能体和所有工具。

## 快速开始 \{#quick-start}

宿主：

```
/collab
```

输出

```
Collab session started!
 • Join from another terminal: omp join "mgAYTZwEnpRQtca0CTgn-Q.gdJUbTovD94ofDaa8YvhY0-ty16w4fn8PgB6PLnoA30"
 • or any web browser: my.omp.sh/#mgAYTZwEnpRQtca0CTgn-Q.gdJUbTovD94ofDaa8YvhY0-ty16w4fn8PgB6PLnoA30
```

浏览器一行可点击加入（指向完整 `https://` 深层链接的 OSC 8 超链接）：中继在 `/` 提供网页访客客户端，房间 ID 和密钥位于 URL 片段中。从另一个 omp（任意目录、任意机器）出发，两种形式均可：

运行 `/collab` 或 `/collab view` 会启动或显示当前托管会话，渲染终端/浏览器加入链接，以及浏览器 URL 的二维码。`/collab` 请求控制访问权限：如果当前房间以只读方式启动，它会替换该房间。`/collab view` 复用任一种访问级别，并只打印只读链接。

```
/join my.omp.sh/#mgAYTZwEnpRQtca0CTgn-Q.gdJU…
```

执行 `/leave` 时（或宿主停止时），会恢复访客之前的会话。

### 命令 \{#commands}

| 命令 | 效果 |
| --- | --- |
| `/collab` | 启动完全控制共享；复用控制房间或替换只读房间 |
| `/collab <relay>` | 通过指定中继启动共享（`relay.example.com`、`ws://localhost:7475`） |
| `/collab view [relay]` | 启动只读共享，或打印现有房间的只读链接/二维码 |
| `/collab status` | 显示链接和参与者 |
| `/collab stop` | 停止共享 |
| `/collab list` | 列出所有活动的本地 Collab 宿主（不含链接） |
| `/join <link>` | 以访客身份加入共享会话 |
| `/leave` | 离开（访客）或停止共享（宿主） |

也接受 `/collab start [relay]`。可复用房间处于活动状态时传入中继，不会将该房间移至另一个中继；要更改中继，请先停止房间。

### 自动共享每个会话 \{#sharing-every-session-automatically}

显式 `/collab stop` 和 `/leave` 还会取消会话切换已排队的任何替代房间。后续另一场独立的会话变更仍遵循已保存的自动启动策略。访客可以回答启动对话框，但在外层启动流程（包括设置 UI 和会话记录重放）成功完成之前，不能发送提示、中断或控制智能体。

专门的加入流程会保留对会话变更的观察：加入失败时立即恢复已保存的自动启动策略，`/leave` 或宿主断开连接时，会恢复本地会话及其后续替代会话的自动托管。远程副本重新同步绝不会启动本地宿主。

显式 `omp join <link>` 启动优先于自动启动：它会以访客身份初始化，不发布临时本地宿主，且不更改已保存的自动启动设置。如果在安装宿主后交互式启动失败，该房间会在终端拆除前关闭并撤回，然后重新抛出启动错误。

将 `collab.autoStart` 设为 `view` 或 `control` 后，每个交互式会话都会在启动时通过 `collab.relayUrl` 托管自身，无需运行 `/collab`。房间在扩展 `session_start` 钩子运行前创建，因此扩展启动时提出的问题会被保留并送达第一个加入的可写访客；中继连接在后台进行，因此中继缓慢或不可达都不会延迟提示符出现（失败会显示为暗色状态行）。访客可以加入自动启动的房间并立即回答启动问题，但与本地输入框因同样原因限制 Enter 一样，在启动完成前，他们不能发送提示、中断或驱动子代理；此类帧会被拒绝，并提示 `… is unavailable until the host finishes starting up`。每个自动启动的会话都会向下述本地宿主注册表发布自身；该设置值是注册表为其提供的最高访问级别（`view`：只有只读链接；`control`：可发送提示和中断的链接）。`/collab` 仍按原有方式工作：重新打印当前房间，或在请求控制时将只读房间替换为完全控制房间。

房间跟随会话，而非进程。`/new`、`/resume`、`/fork` 和分支操作会先停止当前房间，向访客发送告别并撤回其注册表条目，然后依据当前自动启动策略启动替代房间。持有旧链接的访客绝不会看到不同的会话。在尚未提交的 `/resume` 期间，当目标会话临时处于活动状态时，旧房间会改为暂停；回滚会恢复对原房间的访问，无需回调。关闭时会立即使房间不可用，并在释放会话前完成清理。会话变更失败后，`/collab` 和 `/join` 使用当前会话托管状态，并在继续前停用任何过时的自有房间；加入操作仍会拒绝替换活动宿主。

显式停止还会取消待执行的自动启动，而不更改已保存策略。仍在排队或加密中的应用帧会被丢弃；只有最终告别消息会排空发送。已交给传输层的字节无法撤回。后续另一场独立的会话变更或手动启动可以再次托管。

房间也可能自行结束：中继将其永久关闭，或宿主发送积压超过限制（`Collab ended: …`）。其访客必须重新加入以重新同步，但会话仍遵循当前自动启动策略：结束的房间撤回后，会为同一会话托管替代房间（下一代）。中继从未打开的自动启动房间（中继不可达或连接超时）也会以相同方式重试；因为没有访客或注册表读取方见过它，重试会复用其代次，恢复的会话仍首先发布第 1 代。第一次替代立即进行；如果房间持续结束或中继持续不可用，且彼此间隔不超过五分钟，后续每次替代的等待时间都会翻倍（1 秒、2 秒、4 秒、…，最多 60 秒）。`/collab`、会话切换、`/collab stop` 和关闭操作不会被该等待阻挡。自动启动为 `off` 时，以这种方式结束的手动启动房间会保持停止，直到再次运行 `/collab`。

访客所有权从副本激活前开始，一直持续到先前本地会话恢复完成。加入、重新同步或加入失败都不得将副本发布为本地宿主。离开操作会等待恢复；恢复失败会被报告，并继续阻止托管。在恢复期间显式停止会抑制待执行的自动重启，但不会取消恢复本身。

### 列出活动的本地宿主 \{#listing-active-local-hosts}

暂停会抑制会话数据、加入和访客操作；不会抑制现有房间本地对话框的终止。结束的对话框只携带其请求 ID，因此即使 `/resume` 后来回滚，访客也可以关闭它。当目标会话处于临时状态时，对现有对话框的第一个经过认证的回答会被保留，且只有原房间恢复并且写入方仍有权限时才会应用。提交、停止和本地取消都不能将该回答应用到另一个会话。在此临时窗口内的加入必须在其结束后重试。`/collab status` 打印房间发布的访问级别，因此只读房间绝不会通过状态暴露其内部控制链接。

关闭房间通常不会撤销已获准的工作。特别是，子代理恢复与本地调用方共享，并仍绑定到原始智能体引用和会话记录；它可能在关闭后完成，但旧访客的后续提示会被丢弃。关闭房间不会取消本地调用方已合并的恢复操作。

替代房间会等待会话操作完成其钩子、会话记录替换及任何回滚后再连接。在原地重置会话记录或树导航期间，现有访客继续接收复制数据，但在操作结束前，提示和智能体控制命令会被拒绝；新加入和注册表发现也在此期间不可用。如果先前获准的提示在执行前被丢弃，其访客会在保留的房间中收到错误。正在退役的房间则发送告别消息，说明对话中未出现的提示必须在重新加入后重新提交。临时切换必须先结束，才能决定适用哪种通知。

`omp collab list`（以及 TUI 内的 `/collab list`）枚举本机同一 omp 配置根目录下所有活动的 Collab 宿主，跨终端、项目和配置档案。列出操作只涉及元数据，绝不会打印或传输链接：

```
omp collab list                          # one row per host, no links
omp collab list --json                   # {"version": 1, "hosts": [...]}
omp collab link <instanceId|pid>         # print that host's full-control browser URL
omp collab link <instanceId|pid> --view  # print its view-only browser URL
omp collab link <instanceId> --json      # {"version": 1, "instanceId", "generation", "access", "url"}
```

每个宿主行包含稳定的 `instanceId`（按进程随机生成，在该进程托管的不同房间之间保持不变）、房间 `generation`（进程每启动一个新房间就递增，例如在 `/resume` 时）、PID、会话 ID 和名称、工作目录、模型、开始时间、参与者数量、中继连接当前是否打开、是否有宿主端问题正在等待可写访客（`inputRequired`）、会话是否正在运行一个回合（`busy`，渲染为 `working` 或 `idle`），以及注册表会提供的最高 `access`（`view` 或 `control`）。宿主先按开始时间排序，再按 PID，最后按实例 ID。空结果（"No active Collab hosts."）是成功结果，而不是错误。

`busy` 在整个回合中为 true，无论是响应流式传输还是工具执行；智能体结束后变为 false，因此仪表板可通过轮询它发现仍已发布的会话停止了工作；宿主从列表中消失则意味着它已终止或变得不可达，这是另一回事。如果宿主运行的 omp 早于该字段出现的版本，其值为 `null`，未知不能被解读为空闲。`busy` 报告的是正在进行的回合，而非已调度的工作：在调度暂停期间（排队的后续消息、异步作业等待、上下文压缩），即使会话会自行恢复，它也为 false，因此 `true`→`false` 的边沿表示回合结束，而不是工作完成。

获取链接是针对每个宿主有意执行的操作。`omp collab link` 向选定宿主请求一个 URL，并绑定到列出时观察到的代次：如果宿主此后已启动新房间（会话切换），请求会以 `stale_generation` 失败，而不是提供后继房间，此时需重新列出。以 `view` 访问级别发布的宿主会拒绝 `control`。匹配多个活动宿主（或一个也不匹配）的 PID 会被拒绝，并给出候选实例 ID；请使用实例 ID。打印的 URL 授予其访问级别所述的权限，请像对待 `/collab` 链接本身一样对待控制 URL。

工作原理：每个房间在中继连接成功后发布自己的私有 IPC 端点（macOS/Linux 上为 Unix 域套接字，Windows 上为命名管道，绝不是 TCP 端口）；轮换时会以新的产物名称发布，因此撤回旧房间绝不会干扰其后继房间。完全控制和只读 URL、房间密钥和写令牌留在宿主进程内存中；磁盘只在 `~/.omp/run/collab-hosts` 下保存发现元数据（协议版本、实例 ID、PID、端点、创建时间和随机不记名令牌）。在 macOS/Linux 上，每次发布都会将权限收紧为仅所有者可访问。Windows 继承配置根目录的 ACL，因此该根目录必须保持为用户私有。端点上存在两种经过认证的操作：`snapshot`（宿主状态，自由文本字符串有界，避免异常会话标题使宿主无法列出）和 `link`（`access` + `generation` → 一个 URL）。列出时会使用较短的独立截止时间并发查询每个活动宿主，跳过无响应或版本不兼容的条目，并清理崩溃宿主留下的元数据；临时套接字错误（`EMFILE`、`EACCES`、…）绝不会清理活动宿主。停止的房间会立即消失，注册表不保留历史、不列出访客或远程宿主，也不要求修改中继。第三方仪表板和桥接可以基于 `omp collab list --json` 加 `omp collab link` 构建，或直接使用按换行分隔的 JSON 端点，而无需 omp 自身提供远程产品。

注册表目录缺失意味着没有活动宿主。不可读或符号链接形式的注册表目录会导致列出错误，而非成功的空结果；POSIX 还会拒绝非本用户所有的目录。单个不可达或格式错误的宿主条目仍会独立省略。目录错误时 CLI 以非零状态退出；`/collab list` 显示经过净化且长度受限的错误，并保持 TUI 可用。

## 链接格式 \{#link-format}

`/join <link>` 和 `omp join "<link>"` 接受：

```
<roomId>.<key>                                                    → default relay (wss://my.omp.sh)
<roomId>#<key>                                                    → legacy bare form
host[:port]/r/<roomId>.<key>                                     → custom relay, wss:// inferred
host[:port]/r/<roomId>#<key>                                     → legacy direct relay form
https://host[:port]/r/<roomId>.<key>                             → direct relay URL, normalized to wss://
wss://host[:port]/r/<roomId>.<key>                               → direct websocket relay URL
ws://localhost:7475/r/<roomId>.<key>                             → direct plain ws, localhost only
https://host[:port]/#<link>                                      → browser deep link when web UI and relay share a host
https://web-host[:port][/<path>]/#<relay-link>                   → browser UI wrapper with relay link in the fragment
https://web.example/collab/#relay.example.com/r/<roomId>.<key>   → web UI and relay on different hosts
```

`<link>` / `<relay-link>` 会递归解析为上述任意受支持的链接。对于带可解析片段的 `http(s)` 浏览器包装链接，在将 HTTP 主机/路径作为中继处理前，先采用片段。这使 `https://web.example/collab/#relay.example.com/r/<roomId>.<key>` 能在 `web.example` 打开网页 UI，同时加入 `wss://relay.example.com/r/<roomId>`。如果片段不是完整的 collab 链接，解析会回退到旧版直接中继形式，因此 `https://relay.example.com/r/<roomId>#<key>` 仍表示中继 `relay.example.com`。

尾部 `.<key>` 或 `#<key>` 部分是以 base64url 编码的房间秘密，具有两种强度之一：

- **完整链接**：48 字节，由 32 字节 AES-256-GCM 房间密钥加 16 字节写令牌组成。授予发送提示、中断和子代理控制权限。
- **只读链接**：单独的 32 字节密钥，没有写令牌。只授予实时读取权限。令牌机制之前的链接会解析为只读。

新生成的链接使用点连接房间秘密，因为 RFC 3986 禁止在 URL 片段中使用未转义的 `#`；解析器仍接受旧版 `#` 形式，以及因 `%23` 变形的旧版深层链接。

## 端到端加密 \{#end-to-end-encryption}

每个会话负载（条目、事件、状态、提示）在接触套接字之前都会使用 AES-256-GCM 封装。中继只能看到：

- 房间 ID 和连接数，
- 不透明的密文帧及其大小，
- 一个 4 字节路由前缀（帧发给哪个访客）。

持有链接就是信任边界：完整链接可读取和引导会话，只读链接可读取会话。两者都应像秘密一样分享。

## 访客权限模型 \{#guest-permission-model}

有两个信任级别，由链接本身强制执行：宿主在加入时验证 16 字节写令牌，并拒绝没有令牌的同级方写入（他们在参与者列表中显示为只读，加入通知中也会注明）。

持有完整链接的访客可以：

- 阅读整个会话，包括加入时的既有会话记录，
- 向智能体发送提示词（在每位参与者的会话记录中都带有其姓名标记；LLM 看到的是原样提示词文本，姓名仅用于显示），
- 中断智能体（Esc），
- 通过[智能体中心](./agent-hub.md)操作宿主的子代理：查看实时表格与进度、聊天（引导宿主的子代理）、终止、重新激活，以及查看会话记录（按需从宿主获取）。
- 回答宿主的交互式 `select` 和 `editor` 请求。宿主仅将每个待处理请求广播给可写访客；第一个提交或取消的响应会使请求结束，并关闭其他位置的请求界面。

持有只读链接的访客可以实时阅读全部内容，包括既有会话记录、流式文本、工具卡片和子代理会话记录，但宿主会拒绝他们发送提示词、中断和控制智能体。

顾问记录不是对访客可见的子代理：它们被排除在列表快照和会话记录获取之外，针对顾问的聊天、终止和重新激活命令也会被拒绝。

其他会话或机器命令仍仅供宿主使用，包括 `/model`、`/compact`、`/resume`、`/branch`、bash（`!`）、python（`$`）、技能等。访客只保留一个小型本地允许列表（`/dump`、`/export`、`/copy`、`/open`、`/help`、`/hotkeys`、`/theme`、`/settings`、`/leave`、`/collab`、`/exit`、`/quit`）。

访客在助手轮次进行中加入时，该进行中的轮次会在随后第一个 `message_update` 到来时显示：访客先根据更新中完整的累积消息合成缺失的 `message_start`，再转发增量。如果访客加入后，宿主不再为该轮次发出更新，就没有可用于合成实时组件的更新。持久化条目仍会进入副本的消息状态，但条目帧有意不参与渲染，因此这一边界情况可能始终不会出现在实时 TUI 中。

## Web 客户端 \{#web-client}

`packages/collab-web` 是支持同一类链接的独立浏览器客户端，访客端无需安装 omp。中继在 `/` 提供该客户端，从而使 `/collab` 深层链接能够点击加入：`https://<relay>/#<link>` 加载客户端，并根据片段自动连接。它会渲染实时会话记录（流式文本、思考、工具卡片）、支持按需查看会话记录的子代理面板，以及拥有相同访客能力的输入区（提示词、中断、智能体中心操作）。在该包中运行 `bun run dev` 可启动本地实例，运行 `bun run mock-host` 可启动用于开发的离线脚本化宿主，运行 `bun run build` 则生成可部署到任意位置的静态 `dist/`（WebCrypto 要求 HTTPS）。客户端只与中继通信，密钥始终保留在 URL 片段中。

浏览器界面与 WebSocket 中继分开托管时，请设置 `collab.webUrl`。为空时，`/collab` 根据 `collab.relayUrl` 派生 `http(s)://host[:port]`；显式 Web 界面 URL 必须使用 `https://`，只有 localhost 或环回 `http://` 开发源可以例外，并且不能包含查询字符串或片段。生成的浏览器 URL 仍在片段中携带该中继专用的 collab 链接。

## 设置 \{#settings}

| 设置 | 默认值 | 含义 |
| --- | --- | --- |
| `collab.relayUrl` | `wss://my.omp.sh` | `/collab` 未在命令中传入中继时使用的中继 |
| `collab.webUrl` | 空 | `/collab` 链接的浏览器界面 URL；为空时从中继派生；显式 `http://` 仅允许用于 localhost |
| `collab.displayName` | 操作系统用户名 | 向其他参与者显示的名称 |
| `collab.autoStart` | `off` | `view` / `control`：每个交互式会话启动时都作为宿主开放，并发布到本地注册表 |
| `share.serverUrl` | `https://my.omp.sh/s` | `/share` 使用的分享查看器及上传基础地址（链接形式为 `<base>/<id>#<key>`） |
| `share.store` | `blob` | `/share` 上传到 blob 服务器；`gist` 使用已认证的 secret gist，并以 blob 作为回退 |
| `share.redactSecrets` | `true` | 上传前，对 `/share` 快照运行密钥混淆器 |

## 自托管中继 \{#self-hosting-the-relay}

生产中继目前不提供自托管分发：其 Go 源码和独立二进制文件尚未公开。下面的端点列表说明托管服务的网络契约，不代表可安装的发行版。

为进行本地协议开发，本仓库提供了一个源码可获取、仅支持 WebSocket 的替代实现，位于 [`packages/collab-web/scripts/local-relay.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/collab-web/scripts/local-relay.ts)。从 `packages/collab-web` 运行 `bun run relay`，即可监听 `ws://localhost:7466`。它实现了 `/r/<roomId>`，但不提供浏览器客户端、`/share` blob 或 `/healthz`，因此不能替代生产服务。

中继是一个不读取内容的小型 Go 服务。除实时连接外不保留其他状态，并暴露以下接口：

- `GET /`：静态 collab-web 访客客户端（`/collab` 深层链接的目标），
- `GET /r/<roomId>?role=host|guest`：WebSocket 升级，
- `POST /s` / `GET /s/<id>` / `GET /s/<id>/raw`：`/share` blob 上传、查看器页面及 blob 获取，
- `GET /healthz`：存活检查。

## 实现文件 \{#implementation-files}

- [`src/slash-commands/builtin-collaboration.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)：TUI 命令及加入链接展示
- [`src/collab/controller.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/controller.ts)：自动启动和房间轮换
- [`src/collab/host.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/host.ts)、[`guest.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/guest.ts)：权威宿主和本地副本
- [`src/collab/protocol.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/protocol.ts)、[`crypto.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/crypto.ts)、[`relay-client.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/relay-client.ts)：帧、链接、加密和传输
- [`src/collab/registry.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/registry.ts)：私有的本地宿主发现
- [`src/collab/settings.ts`](https://github.com/can1357/oh-my-pi/blob/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/coding-agent/src/collab/settings.ts)：`collab.*` 默认值
- [`packages/collab-web`](https://github.com/can1357/oh-my-pi/tree/c9730fdb620ce4599dd898691e3e3b56003bfcb5/packages/collab-web)：浏览器访客和本地开发中继

## 架构说明 \{#architecture-notes}

中心式拓扑以宿主为权威，访客之间从不直接对等连接：

1. `welcome` + `snapshot-chunk` 帧：初始状态和会话记录。会话记录按字节上限分块，因此每个块到达时都会重置访客的进度超时；过大的复制条目会在传输前缩减。
2. `entry` 帧：持久化会话条目，在将 blob 外置之前广播，使图像保持内联（访客无法解析宿主 blob 引用）。访客保留 ID，将条目追加到 `~/.omp/collab/<roomId>.jsonl` 下的副本会话文件以及智能体消息数组中，因此 `/dump` 和上下文估算能够正常工作。
3. `event` 帧：实时智能体事件，直接交给访客正常的事件控制器；只通过事件渲染，防止重复渲染。
4. `state` 帧：经过防抖的页脚快照，包括流式状态标志、宿主完整模型对象及思考档位（应用到访客副本的智能体状态，因此模型显示和上下文窗口计算都使用原生机制）、宿主上下文数值和参与者。
5. `bus` 帧：镜像的 task 子代理生命周期及进度 EventBus 流量，在访客本地事件总线上重新发布，使子代理 HUD 和状态栏计数原生生效。
6. `agents` 帧：智能体注册表快照，供给访客本地注册表，使智能体中心表格显示宿主子代理。
7. `ui-request` / `ui-request-end` 帧：向具备完整控制权的访客展示宿主的 select/editor 提示，并在请求结束后关闭所有位置的展示。访客使用 `ui-response` 回答。

访客→宿主：`hello`、`prompt`、`abort`、`agent-cmd`（智能体中心聊天、终止、重新激活）、`fetch-transcript`（增量读取子代理会话记录，通过定向 `transcript` 帧回复）和 `ui-response`。副本通过常规 `/resume` 机制加载，因此主题、ctrl+o 和会话记录行为天然一致；访客进程绝不会将工作目录切换到宿主路径。

会话记录获取每次回复最多4 MiB，并在完整 JSONL 行处结束。访客从 `newSize` 继续；单条目超过上限时，会产生终止性会话记录错误，而不是无限重试空读取。
