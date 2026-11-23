# 在隔离环境中运行 Pi \{#run-pi-in-an-isolated-environment}

> **非官方简体中文译文。** 原文：[Pi v1.6.0 Run Pi in an isolated environment](https://github.com/earendil-works/pi/blob/v1.6.0/packages/coding-agent/docs/containerization.md)。[上游 MIT 许可证](./license.md)。

使用隔离环境可以限制生成的命令所能访问或影响的文件、凭据、进程和网络服务。

你可以隔离整个 Pi 进程，也可以让 Pi 在宿主机上运行，只将选定的工具交给隔离环境执行。

## 选择隔离方式 \{#choose-an-isolation-method}

| 方式 | Pi 在哪里运行 | 隔离范围 | 凭据处理 | 适用场景 |
|---|---|---|---|---|
| 基础 Docker | 容器 | Pi、内置工具、`!` 命令和扩展 | 将凭据传入容器 | 简单的本地容器隔离 |
| Docker Sandboxes | 受管理的沙箱 | Pi、内置工具、`!` 命令和扩展 | 模型提供方的真实凭据保留在宿主机上，由代理替换占位凭据 | 在本地使用受管理的隔离环境，不暴露真实的模型提供方密钥 |
| OpenShell | 本地或远程沙箱 | Pi、内置工具、`!` 命令和扩展 | 凭据和推理路由由策略控制 | 需要文件系统、进程、网络和凭据策略 |
| Gondolin 扩展 | 宿主机 | 内置工具和 `!` 命令 | Pi 保存的凭据保留在宿主机上，但命令继承宿主进程的环境变量 | 保留宿主机上的 Pi 界面，在本地微型虚拟机中执行工具 |

隔离方式决定扩展在哪里运行。如果整个 Pi 进程在隔离环境中运行，扩展也在那里运行。如果宿主机上的 Pi 通过 Gondolin 委托执行内置工具，其他扩展工具仍在宿主机上运行，除非它们也委托执行自己的操作。

## 决定 Pi 可以访问哪些资源 \{#decide-what-pi-can-access}

即使进程处于隔离环境中，它仍可能影响你向它开放的资源：

- 以读写方式挂载宿主机目录，Pi 就能修改其中的宿主机文件。
- 挂载 `~/.pi/agent` 会暴露你的 Pi 凭据、设置、扩展和会话。
- 容器内的进程可以读取传入容器的环境变量。
- 允许访问网络后，代码或工具输出可能被发送到隔离环境之外。
- 仅隔离工具不会限制宿主机上的 Pi 进程，也不会限制不使用隔离后端的扩展工具。

只开放任务所需的工作目录、凭据和网络目标。如果不希望写入操作影响宿主机，请使用只读挂载，或在宿主机和隔离环境之间复制文件。

## 使用基础 Docker 运行 Pi \{#run-pi-in-plain-docker}

基础 Docker 是用容器隔离整个 Pi 进程的最简单方式。

### 构建镜像 \{#build-the-image}

创建 `Dockerfile.pi`：

```dockerfile
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

WORKDIR /workspace
ENTRYPOINT ["pi"]
```

在该文件所在的目录中构建镜像：

```bash
docker build -t pi-sandbox -f Dockerfile.pi .
```

### 启动 Pi \{#start-pi}

在你希望 Pi 访问的工作目录中运行：

```bash
docker run --rm -it \
  -e ANTHROPIC_API_KEY \
  -v "$PWD:/workspace" \
  -v pi-agent-home:/root/.pi/agent \
  pi-sandbox
```

将 `ANTHROPIC_API_KEY` 替换为你的模型提供方所需的凭据。命名卷 `pi-agent-home` 会在多次运行之间保留容器内的设置、凭据和会话。

除非容器确实需要访问宿主机上的 Pi 配置和凭据，否则不要挂载宿主机的 `~/.pi/agent`。

### 验证工作区 \{#verify-the-workspace}

在 Pi 中运行：

```text
!pwd
```

命令应输出 `/workspace`。在 `/workspace` 下所做的更改会写入挂载的宿主机目录。如果不能接受这种行为，请移除绑定挂载，或改用只读挂载。

## 使用 Docker Sandboxes 运行 Pi \{#run-pi-with-docker-sandboxes}

[Docker Sandboxes](https://docs.docker.com/ai/sandboxes/) 在受管理的沙箱中运行整个 Pi 进程。它的代理可以将真实的模型提供方凭据保留在宿主机上，在请求发出沙箱时用真实凭据替换占位凭据。

创建沙箱前请先配置凭据。不要在沙箱内运行 `/login`，因为这会将真实凭据写入沙箱。

### 使用 Claude Pro 或 Max 令牌 \{#use-a-claude-pro-or-max-token}

在装有 Claude Code 的计算机上运行 `claude setup-token`，生成令牌。如果已配置 `anthropic` 密钥，请先删除，以免代理在发送 Bearer 令牌的同时添加 API 密钥请求头：

```bash
sbx secret rm anthropic

sbx secret set-custom \
  --host api.anthropic.com \
  --env ANTHROPIC_OAUTH_TOKEN \
  --placeholder 'sk-ant-oat01-{rand}'
```

`sbx secret set-custom` 从标准输入读取真实令牌。沙箱收到的是一段符合 OAuth 令牌格式的占位值，代理只会在向已配置的主机发送请求时替换它。

如果使用的是 Anthropic API 密钥，请改用 `sbx secret set anthropic`。

### 启动 Pi \{#start-pi-1}

在要挂载的工作目录中运行：

```bash
sbx run --kit "docker.io/sbx/pi-kit:latest" pi
```

要在现有沙箱中以非交互方式运行 Pi，请使用：

```bash
sbx exec <sandbox-name> -- pi -p "list the failing tests"
```

其他模型提供方、故障排查和锁定镜像版本的方法见 [Pi kit 文档](https://github.com/docker/sbx-kits-contrib/tree/main/pi)。

## 使用 OpenShell 运行 Pi \{#run-pi-with-openshell}

[NVIDIA OpenShell](https://docs.nvidia.com/openshell/about/overview) 提供本地或远程沙箱，并支持文件系统、进程、网络、凭据和推理策略。

### 选择网关 \{#select-a-gateway}

每个沙箱都需要一个处于活动状态的网关：

```bash
openshell gateway add <gateway-url> --name <name>
openshell gateway select <name>
```

### 创建沙箱 \{#create-the-sandbox}

```bash
openshell sandbox create --name pi-sandbox --from pi -- pi
```

Pi、内置工具、`!` 命令和扩展工具都在 OpenShell 的隔离环境中运行。

### 将文件传入或传出远程沙箱 \{#transfer-files-to-a-remote-sandbox}

远程网关不会绑定挂载宿主机上的工作目录。请在沙箱内克隆仓库，或显式传输文件：

```bash
openshell sandbox upload pi-sandbox ./working-folder /workspace
openshell sandbox download pi-sandbox /workspace/working-folder ./working-folder-out
```

OpenShell 的推理路由可以把真实的模型凭据留在沙箱外。配置推理路由后，让 Pi 使用网关提供的相应 OpenAI 或 Anthropic 兼容端点。

## 通过 Gondolin 执行工具 \{#route-tools-through-gondolin}

[Gondolin](https://github.com/earendil-works/gondolin) 是本地 Linux 微型虚拟机。其示例扩展将 Pi 进程和保存在文件中的模型提供方凭据留在宿主机上，同时将内置工具和用户输入的 `!` 命令交给虚拟机执行。

虚拟机内的命令会继承宿主进程的环境变量。因此，通过环境变量提供的模型提供方密钥可能在虚拟机内可见。只有在移除敏感变量或修改扩展处理环境变量的方式后，才能用这种方式隔离凭据。

Gondolin 要求 Node.js 23.6 或更高版本，还要求通过操作系统的包管理器安装 QEMU。

### 安装扩展 \{#install-the-extension}

在本地检出的 Pi 源码目录中运行：

```bash
mkdir -p ~/.pi/agent/extensions
cp -R packages/coding-agent/examples/extensions/gondolin ~/.pi/agent/extensions/gondolin
cd ~/.pi/agent/extensions/gondolin
npm install --ignore-scripts
```

### 启动 Pi \{#start-pi-2}

在要挂载的工作目录中启动 Pi：

```bash
cd /path/to/working-folder
pi -e ~/.pi/agent/extensions/gondolin
```

扩展将宿主机工作目录挂载到虚拟机内的 `/workspace`，并覆盖 `read`、`write`、`edit`、`bash`、`grep`、`find` 和 `ls`。在 `/workspace` 下所做的文件更改会写入宿主机。

其他扩展工具仍在宿主机上运行，除非它们显式委托执行自己的操作。添加可能绕过虚拟机隔离的工具前，请先查看 [Gondolin 示例](https://github.com/earendil-works/pi/tree/v1.6.0/packages/coding-agent/examples/extensions/gondolin)。
