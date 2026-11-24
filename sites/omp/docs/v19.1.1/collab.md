---
title: "实时会话共享"
description: "Oh My Pi v19.1.1 仓库文档：实时会话共享。"
---

# Collab：实时会话共享 \{#collab-live-session-sharing}

`/collab` 将正在运行的会话实时共享给其他 omp 实例。访客在自己的 TUI 中**原生呈现同一个会话**，包括流式助手文本、工具调用卡片、底栏状态（当前工作目录、模型、上下文使用百分比、费用）、用 ctrl+o 展开和 `/dump`，无需镜像终端。访客可以向智能体发送提示，也可以中断它。共享端所在的机器运行智能体和所有工具。

## 快速开始 \{#quick-start}

共享端：

```
/collab
```

输出：

```
Collab session started!
 • Join from another terminal: omp join "mgAYTZwEnpRQtca0CTgn-Q.gdJUbTovD94ofDaa8YvhY0-ty16w4fn8PgB6PLnoA30"
 • or any web browser: my.omp.sh/#mgAYTZwEnpRQtca0CTgn-Q.gdJUbTovD94ofDaa8YvhY0-ty16w4fn8PgB6PLnoA30
```

浏览器地址所在行可单击加入（OSC 8 超链接指向完整的 `https://` 深层链接）：中继在 `/` 提供 Web 访客客户端，房间 ID 和密钥放在 URL 片段中。从另一个 omp 实例加入时（目录和机器不限），两种形式都可用：

运行 `/collab` 或 `/collab view` 会启动或显示当前托管的会话，并呈现终端加入链接、浏览器加入链接和浏览器 URL 的二维码。`/collab` 请求控制权限：如果当前房间以只读方式启动，该命令会替换它。`/collab view` 可以复用任一权限级别的房间，只打印只读链接。

```
/join my.omp.sh/#mgAYTZwEnpRQtca0CTgn-Q.gdJU…
```

执行 `/leave` 时（或共享端停止共享时），访客之前的会话会恢复。

### 命令 \{#commands}

| 命令 | 效果 |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `/collab` | 启动完全控制共享；复用可控制的房间，或替换只读房间 |
| `/collab <relay>` | 通过指定的中继（`relay.example.com`、`ws://localhost:7475`）开始共享 |
| `/collab view [relay]` | 启动只读共享，或打印现有房间的只读链接和二维码 |
| `/collab status` | 显示链接和参与者 |
| `/collab stop` | 停止共享 |
| `/collab list` | 列出本机所有活动的 Collab 共享端（不含链接） |
| `/join <link>` | 作为访客加入共享会话 |
| `/leave` | 离开会话（访客）或停止共享（共享端） |

也支持 `/collab start [relay]`。如果已有可复用的活动房间，传入中继不会将该房间移到另一中继；要更换中继，请先停止该房间。

### 自动共享每个会话 \{#sharing-every-session-automatically}

显式运行 `/collab stop` 或 `/leave` 也会取消因会话切换而排队等待启动的替代房间。之后另一次会话变更仍遵循已保存的自动启动策略。访客可以回答启动对话框，但只有外层启动流程（包括设置界面和会话记录重放）成功完成后，才能向智能体发送提示、中断或控制智能体。

专用加入流程会继续观察会话变更：加入失败会立即恢复遵循已保存的自动启动策略；执行 `/leave` 或共享端断开连接时，将恢复当前本地会话及其后续替换会话的自动托管。远程副本重新同步时绝不会启动本地共享端。

显式用 `omp join <link>` 启动时，该命令优先于自动启动：实例以访客身份初始化，不发布临时的本地共享端，并保持已保存的自动启动设置不变。如果交互式启动在共享端就位后失败，系统会先关闭并撤下该房间，再清理终端，并重新抛出启动错误。

将 `collab.autoStart` 设为 `view` 或 `control`，每个交互式会话启动时都会通过 `collab.relayUrl` 托管自身，无需运行 `/collab`。系统会在扩展的 `session_start` 钩子运行之前创建房间。如果扩展在启动时提出问题，问题会保留并交给第一个加入且有写权限的访客。中继连接在后台进行，因此中继响应慢或不可达都不会延迟提示符（失败会以暗色状态行显示）。访客可以加入自动启动的房间并立即回答启动问题。不过，和本地输入框出于同样原因限制 Enter 键一样，在启动完成前，访客无法发送提示、中断或控制子代理；此类帧会被拒绝，错误为 `… is unavailable until the host finishes starting up`。每个自动启动的会话都会向下文所述的本地共享端注册表发布自身；设置值决定注册表为该会话提供的最高权限（`view`：只提供只读链接；`control`：提供可发送提示和中断的链接）。`/collab` 的行为不变：它会重新打印当前房间的信息，或在你请求控制权限时用完全控制房间替换只读房间。

房间随会话而变，不随进程而变。`/new`、`/resume`、`/fork` 和创建分支都会先停止当前房间，向访客发送告别通知并撤下注册条目，然后按当前生效的自动启动策略启动替代房间。持有旧链接的访客绝不会看到另一个会话。`/resume` 尚未提交时，目标会话暂时处于活动状态，旧房间则挂起；回滚会恢复对原房间的访问，无需回调。关闭会立即使房间不可用，并在释放会话前完成清理。如果会话变更失败，`/collab` 和 `/join` 会使用当前会话的托管状态，并在继续前停用本进程拥有的任何过期房间；加入操作仍不会替换活动的共享端。

显式停止操作还会取消等待自动启动的房间，不会改变已保存的策略。仍在队列中或正在加密的应用帧会被丢弃，只有最后的告别帧会发送完毕。已交给传输层的字节无法撤回。之后另一次会话变更或手动启动可以再次托管会话。

房间也可能自行结束：中继永久关闭房间，或共享端待发送的数据积压超过上限（`Collab ended: …`）。访客必须重新加入才能同步，但会话仍遵循当前生效的自动启动策略：已结束的房间撤下后，系统会为同一会话托管一个替代房间（下一代）。中继始终未能打开的自动启动房间也会以同样的方式重试，例如中继不可达或连接超时。由于访客和注册表读取方都没见过这个房间，重试会复用它的代次，恢复后的会话仍会先发布第 1 代。第一次替换会立即进行；如果房间持续结束，或中继持续不可用，且相邻失败发生在五分钟内，则此后每次替换的等待时间都会加倍（1 秒、2 秒、4 秒，以此类推，最多 60 秒）。`/collab`、切换会话、`/collab stop` 和关闭操作都不会被这段等待阻塞。如果自动启动设为 `off`，手动启动的房间以这种方式结束后会保持关闭，直到再次运行 `/collab`。

访客对会话的占用从副本激活前就开始，一直持续到先前的本地会话恢复完成。加入、重新同步和加入失败都不得将副本发布为本地共享端。离开操作会等待恢复完成；恢复失败会报告错误，并继续阻止托管。恢复期间的显式停止操作会取消等待中的自动重启，但不会取消恢复本身。

### 列出活动的本地共享端 \{#listing-active-local-hosts}

挂起会阻止会话数据传输、加入以及访客操作，但不会阻止结束房间中现有的对话框。对话框结束时只携带请求 ID，因此即使之后 `/resume` 回滚，访客也可以关闭对话框。在目标会话暂时处于活动状态期间，现有对话框收到的首个通过身份验证的回答会被保留；只有原房间恢复且回答者仍有写权限时才会应用。提交、停止和本地取消都不会把这条回答应用到其他会话。临时切换期间发起的加入操作必须在切换结束后重试。`/collab status` 打印房间已发布的权限级别，因此只读房间绝不会通过状态信息暴露内部控制链接。

关闭房间通常不会撤销已获准执行的工作。特别是，唤醒子代理的操作与本地调用方共享，并仍绑定到原来的智能体引用和会话记录。它可能在房间关闭后完成，但原访客的后续提示会被丢弃。关闭房间不会取消本地调用方已合并的唤醒操作。

替代房间会等待会话操作完成其钩子、会话记录替换和可能的回滚后再连接。在原地重置会话记录或在会话树中导航期间，现有访客仍会接收到复制数据，但提示和智能体控制命令会被拒绝，直到该操作结束；这段时间内无法新加入房间，也无法通过注册表发现房间。如果已获准的提示在执行前被丢弃，房间仍保留时，其访客会收到错误。如果房间即将停用，则改为发送告别通知，说明未出现在对话中的提示必须在重新加入后再提交。必须等临时切换结束，才能确定发送哪种通知。

`omp collab list`（TUI 中为 `/collab list`）枚举本机使用同一个 omp 配置根目录的所有活动 Collab 共享端，跨终端、项目和配置档案。列表仅包含元数据，绝不会打印或传输链接：

```
omp collab list                          # one row per host, no links
omp collab list --json                   # {"version": 1, "hosts": [...]}
omp collab link <instanceId|pid>         # print that host's full-control browser URL
omp collab link <instanceId|pid> --view  # print its view-only browser URL
omp collab link <instanceId> --json      # {"version": 1, "instanceId", "generation", "access", "url"}
```

每行共享端信息包含稳定的 `instanceId`（每个进程随机生成，托管不同房间时保持不变）、房间的 `generation`（进程每启动一个新房间就递增，例如执行 `/resume` 时）、PID、会话 ID 和名称、工作目录、模型、启动时间、参与者数量、中继连接当前是否打开、共享端是否有问题在等待有写权限的访客回答（`inputRequired`）、会话是否正在运行一轮（`busy`，显示为 `working` 或 `idle`），以及注册表提供的最高 `access`（`view` 或 `control`）。共享端依次按启动时间、PID 和实例 ID 排序。空结果（“No active Collab hosts.”）表示查询成功，不是错误。

在整个轮次中，无论是流式输出响应还是执行工具，`busy` 都为真；智能体结束后，该值变为假。因此，仪表板可通过轮询它发现仍在发布的会话何时停止工作。共享端从列表中消失则是另一种情况，表示共享端已停止运行或无法访问。如果共享端的 omp 版本早于该字段，返回值为 `null`；不能将未知当成空闲。`busy` 反映正在运行的轮次，不表示是否有已调度的工作。调度暂停期间（排队的后续消息、等待异步任务、上下文压缩），即使会话会自行恢复，该值也为假。因此，从 `true`→`false` 的变化表示轮次结束，不表示工作完成。

获取链接需要对每个共享端单独发起请求。`omp collab link` 向选定的共享端请求一个 URL，并将请求绑定到列出共享端时观察到的房间代次。如果共享端此后启动了新房间（发生了会话切换），请求会返回 `stale_generation`，不会交出后继房间的链接。这时应重新列出共享端。以 `view` 权限发布的共享端会拒绝 `control`。如果一个 PID 匹配多个活动共享端（或没有匹配），请求会被拒绝并附带候选实例 ID；请改用实例 ID。打印的 URL 授予它标明的权限，处理控制 URL 时应像处理 `/collab` 链接一样谨慎。

每个房间在成功连接中继后发布自己的私有 IPC 端点（macOS 和 Linux 上使用 Unix 域套接字，Windows 上使用命名管道，绝不使用 TCP 端口）。轮换房间时会使用新的产物名称发布，因此撤下旧房间不会影响后继房间。完全控制 URL、只读 URL、房间密钥和写入令牌都留在共享端进程内存中；磁盘的 `~/.omp/run/collab-hosts` 下只存放发现用的元数据（协议版本、实例 ID、PID、端点、创建时间和随机生成的持有者令牌）。在 macOS 和 Linux 上，每次发布都会将权限收紧为仅所有者可访问。Windows 上则继承配置根目录的 ACL，因此必须确保只有用户本人可以访问该根目录。端点支持两种经身份验证的操作：`snapshot`（获取共享端状态；自由格式字符串有长度上限，以免异常的会话标题导致共享端无法列出）和 `link`（由 `access` 与 `generation` 换取一个 URL）。列出共享端时，系统会并发查询每个活动的共享端，分别设置较短的时限，跳过无响应或使用其他版本的条目，并清理崩溃的共享端遗留的元数据。暂时性的套接字错误（`EMFILE`、`EACCES` 等）绝不会导致仍存活的共享端被清除。已停止的房间会立即消失：注册表不保留历史，不列出访客或远程共享端，也不需要改动中继。第三方仪表板和桥接程序可使用 `omp collab list --json` 与 `omp collab link`，也可直接与以换行符分隔 JSON 的端点通信，无需 omp 自行提供远程产品。

注册表目录缺失表示没有活动的共享端。注册表目录不可读或是符号链接时，列举会出错，不会返回成功的空结果。POSIX 上还会拒绝由其他用户所有的目录。无法访问或格式错误的共享端条目仍会单独跳过。目录出错时，CLI 会以非零状态退出；`/collab list` 会显示经过清理且长度受限的错误，TUI 可继续使用。

## 链接格式 \{#link-format}

`/join <link>` 和 `omp join "<link>"` 接受以下格式：

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

`<link>` / `<relay-link>` 会按上述任一受支持的链接格式递归解析。对带有可解析片段的 `http(s)` 浏览器包装链接，先解析片段，再考虑将 HTTP 主机名和路径当成中继地址解析。因此，`https://web.example/collab/#relay.example.com/r/<roomId>.<key>` 可以在 `web.example` 打开 Web 界面，同时加入 `wss://relay.example.com/r/<roomId>`。如果片段不是完整的 Collab 链接，解析会回退到旧版的直连中继格式，因此 `https://relay.example.com/r/<roomId>#<key>` 仍表示中继 `relay.example.com`。

末尾的 `.<key>` 或 `#<key>` 部分是经过 base64url 编码的房间秘密值，有两个权限级别：

- **完整链接**：48 字节，由 32 字节的 AES-256-GCM 房间密钥和紧随其后的 16 字节写入令牌组成。允许发送提示、中断和控制子代理。
- **只读链接**：只有 32 字节的密钥，没有写入令牌。只允许实时读取。引入写入令牌前的链接会按只读链接解析。

新生成的链接用点号连接房间秘密值，因为 RFC 3986 禁止在 URL 片段内直接使用 `#`。解析器仍支持旧版 `#` 格式和被 `%23` 改写的旧版深层链接。

## 端到端加密 \{#end-to-end-encryption}

每个会话载荷（条目、事件、状态、提示）在交给套接字之前都会使用 AES-256-GCM 加密封装。中继只能看到：

- 房间 ID 和连接数量；
- 不可读的密文帧及其大小；
- 4 字节的路由前缀（即帧发往哪个访客）。

持有链接就是信任边界：完整链接允许读取和引导会话，只读链接只允许读取。共享这两种链接时，都应将它们视为秘密信息。

## 访客权限模型 \{#guest-permission-model}

链接本身强制执行两个信任级别。共享端在访客加入时验证 16 字节的写入令牌，并拒绝没有令牌的对等方发起的写操作（这类访客在参与者列表中显示为只读，加入通知也会说明这一点）。

持有完整链接的访客可以：

- 读取整个会话（包括加入时已有的会话记录）；
- 向智能体发送提示（提示会带着访客的姓名徽标显示在每位参与者的会话记录中；LLM 收到的是逐字相同的提示文本，姓名仅用于显示）；
- 中断智能体（Esc）；
- 使用[智能体中心](./agent-hub.md)操作共享端的子代理：查看实时列表及进度、聊天（引导共享端的子代理）、终止、唤醒，以及查看会话记录（按需从共享端获取）。
- 回答共享端的交互式 `select` 和 `editor` 请求。共享端只向有写权限的访客广播待处理的请求；第一个提交或取消的响应会结束请求，并关闭其他界面上的同一请求。

持有只读链接的访客可以实时读取全部内容，包括已有的会话记录、流式文本、工具卡片和子代理会话记录，但共享端会拒绝这类访客发起的提示、中断和智能体控制操作。

顾问记录不作为子代理向访客显示：它们不包含在列表快照和会话记录获取结果中，针对顾问的聊天、终止和唤醒命令也会被拒绝。

其他会话或机器命令仍只有共享端可以执行，例如 `/model`、`/compact`、`/resume`、`/branch`、bash（`!`）、python（`$`）和技能等。访客保留一小组本地命令白名单（`/dump`、`/export`、`/copy`、`/open`、`/help`、`/hotkeys`、`/theme`、`/settings`、`/leave`、`/collab`、`/exit`、`/quit`）。

访客在助手轮次进行中加入时，该轮次会在接下来第一次收到 `message_update` 时显示。访客会根据更新中截至当时的完整消息合成缺失的 `message_start`，再转发增量。如果共享端在访客加入后没有为该轮次发出更多更新，就无法根据更新合成实时组件。持久化条目仍会进入副本的消息状态，但系统有意不渲染条目帧，因此这种边缘情况可能一直不会在实时 TUI 中显示。

## Web 客户端 \{#web-client}

`packages/collab-web` 是可使用相同链接的独立浏览器客户端，访客无需安装 omp。中继在 `/` 提供该客户端，因此 `/collab` 的深层链接可以单击加入：`https://<relay>/#<link>` 会加载客户端，并根据片段自动连接。客户端呈现实时会话记录（流式文本、思考内容、工具卡片），提供可按需查看会话记录的子代理面板，以及具备相同访客权限（发送提示、中断、智能体中心操作）的输入框。在包目录中运行 `bun run dev` 可启动本地实例；运行 `bun run mock-host` 可启动供开发使用的离线脚本化共享端；运行 `bun run build` 可生成能部署到任意位置的静态 `dist/`（WebCrypto 需要 HTTPS）。客户端只与中继通信，密钥留在 URL 片段中。

浏览器界面与 WebSocket 中继分开托管时，设置 `collab.webUrl`。该设置为空时，`/collab` 使用 `http(s)://host[:port]` 格式的地址，该地址根据 `collab.relayUrl` 推导。显式配置的 Web 界面 URL 必须使用 `https://`，本地主机或环回地址的 `http://` 开发源除外；URL 不得包含查询字符串或片段。生成的浏览器 URL 仍会在片段中携带对应中继的 Collab 链接。

## 设置 \{#settings}

| 设置 | 默认值 | 含义 |
| --------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| `collab.relayUrl` | `wss://my.omp.sh` | 未在同一行传入中继时，`/collab` 使用的中继 |
| `collab.webUrl` | 空 | `/collab` 链接的浏览器界面 URL；为空时根据中继地址推导；仅本地主机可以显式使用 `http://` |
| `collab.displayName` | 操作系统用户名 | 向其他参与者显示的名称 |
| `collab.autoStart` | `off` | `view` / `control`：在每个交互式会话启动时托管该会话，并将其发布到本地注册表 |
| `share.serverUrl` | `https://my.omp.sh/s` | `/share` 用于查看和上传共享内容的基址（链接格式为 `<base>/<id>#<key>`） |
| `share.store` | `blob` | `/share` 上传到 blob 服务器；`gist` 使用经身份验证的私密 Gist，以 blob 作为回退 |
| `share.redactSecrets` | `true` | 上传前对 `/share` 快照运行秘密信息混淆工具 |

## 自托管中继 \{#self-hosting-the-relay}

生产中继目前未发布自托管版本：其 Go 源码和独立二进制文件均未公开。下方的端点列表描述托管服务的网络契约，不代表有可安装的发行版。

为便于本地协议开发，本仓库在 [`packages/collab-web/scripts/local-relay.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/collab-web/scripts/local-relay.ts) 中提供可查看源码的替代实现，仅支持 WebSocket。运行 `bun run relay`（在 `packages/collab-web` 目录中）即可监听 `ws://localhost:7466`。它实现 `/r/<roomId>`，但不提供浏览器客户端、`/share` blob 或 `/healthz`，因此不能替代生产服务。

中继是一个小型 Go 服务，不读取载荷内容。除活动连接外，它不保留其他状态，并提供以下端点：

- `GET /`：静态 collab-web 访客客户端（`/collab` 深层链接的目标）；
- `GET /r/<roomId>?role=host|guest`：WebSocket 升级；
- `POST /s` / `GET /s/<id>` / `GET /s/<id>/raw`：`/share` blob 上传、查看页面和 blob 获取；
- `GET /healthz`：存活检查。

## 实现文件 \{#implementation-files}

- [`src/slash-commands/builtin-collaboration.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/slash-commands/builtin-collaboration.ts)：TUI 命令和加入链接展示
- [`src/collab/controller.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/controller.ts)：自动启动和房间轮换
- [`src/collab/host.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/host.ts)、[`guest.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/guest.ts)：权威共享端和本地副本
- [`src/collab/protocol.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/protocol.ts)、[`crypto.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/crypto.ts)、[`relay-client.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/relay-client.ts)：帧、链接、加密和传输
- [`src/collab/registry.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/registry.ts)：本地共享端的私有发现机制
- [`src/collab/settings.ts`](https://github.com/can1357/oh-my-pi/blob/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/coding-agent/src/collab/settings.ts)：`collab.*` 默认值
- [`packages/collab-web`](https://github.com/can1357/oh-my-pi/tree/31ffee513f27a01bba7d4dfbe12bae239cdc646a/packages/collab-web)：浏览器访客客户端和本地开发中继

## 架构说明 \{#architecture-notes}

中心辐射式拓扑：以共享端为权威，访客之间不建立对等连接。

1. `welcome` + `snapshot-chunk` 帧：初始状态和会话记录。会话记录按字节上限分块，每收到一块都会重置访客的进度超时计时。过大的复制条目在传输前会缩减。
2. `entry` 帧：持久化的会话条目。共享端在外置 blob 前广播这些条目，让图像保留在条目内（访客无法解析共享端的 blob 引用）。访客保留条目 ID，将条目追加到副本会话文件 `~/.omp/collab/<roomId>.jsonl` 和智能体的消息数组中，因此 `/dump` 和上下文用量估算能够正常工作。
3. `event` 帧：实时智能体事件，直接交给访客的常规事件控制器。仅根据事件渲染，以防重复渲染。
4. `state` 帧：经防抖的底栏快照，包括流式生成标志、共享端的完整模型对象和思考级别（应用到访客的副本智能体状态，因此模型显示和上下文窗口计算都走原生逻辑）、共享端的上下文数值以及参与者。
5. `bus` 帧：镜像任务子代理生命周期和进度相关的 EventBus 流量，并重新发布到访客的本地总线，因此子代理 HUD 和状态栏计数都能按原生逻辑工作。
6. `agents` 帧：智能体注册表快照，用于填充访客本地的注册表，让智能体中心的表格能够呈现共享端的子代理。
7. `ui-request` / `ui-request-end` 帧：向拥有完全控制权限的访客展示共享端的选择或编辑器提示，请求一经处理便在所有界面上关闭。访客用 `ui-response` 回答。

从访客发往共享端的帧：`hello`、`prompt`、`abort`、`agent-cmd`（智能体中心的聊天、终止和唤醒）、`fetch-transcript`（增量读取子代理会话记录，由发给指定访客的 `transcript` 帧应答）和 `ui-response`。副本通过常规的 `/resume` 机制加载，因此主题、ctrl+o 和会话记录行为自然沿用原生实现。访客进程绝不会切换工作目录到共享端的路径。

每次回复获取的会话记录最多为 4 MiB，并且以完整的 JSONL 行结束。访客从 `newSize` 继续读取。如果单个条目超过上限，系统会返回不可继续的会话记录错误，避免因读不到数据而无限重试。
