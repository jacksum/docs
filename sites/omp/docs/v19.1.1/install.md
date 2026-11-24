---
title: "安装与命令补全"
description: "Oh My Pi v19.1.1 仓库文档：安装与命令补全。"
---

# 安装 \{#install}

**macOS 和 Linux**

```sh
curl -fsSL https://omp.sh/install | sh
```

安装脚本从 `build.stencil.so` 获取预编译二进制文件，并在安装前检查其 SHA-256。传入 `--source`（PowerShell 对应 `-Source`）可改用 Bun 安装软件包。用 `curl -fsSL https://omp.sh/install | sh -s -- --binary --ref v<version>` 固定发布版本（PowerShell 对应 `-Binary -Ref v<version>`）。

> **Alpine / musl：** musl 预编译二进制文件会动态链接 `libstdc++` 和 `libgcc`，而 Alpine 默认不附带这两个库。先执行 `apk add libstdc++ libgcc` 安装它们。

**Homebrew**

```sh
brew install can1357/tap/omp
```

**Bun（推荐）**

```sh
bun install -g @oh-my-pi/pi-coding-agent
```

**Nix**

```sh
# Run without installing
nix run github:can1357/oh-my-pi

# Or install into the active profile (Nix < 2.30: `nix profile install`)
nix profile add github:can1357/oh-my-pi
```

Flake 使用者可以用 `packages.<system>.omp`、`overlays.default`、`nixosModules.default` 或 `homeManagerModules.default`。Home Manager 可以安装 OMP，并以声明式配置管理它的设置：

```nix
{
  inputs.omp.url = "github:can1357/oh-my-pi";

  # In your Home Manager module:
  imports = [ inputs.omp.homeManagerModules.default ];
  programs.omp = {
    enable = true;
    settings.startup.quiet = true;
  };
}
```

**Windows（PowerShell）**

```powershell
irm https://omp.sh/install.ps1 | iex
```

**固定版本（mise）**

```sh
mise use -g github:can1357/oh-my-pi
```

macOS、Linux、Windows，Bun ≥ 1.4.4

### Shell 命令补全 \{#shell-completions}

`omp` 从当前命令及参数的元数据为 **bash**、**zsh** 和 **fish** 生成补全脚本，因此脚本与实际 CLI 保持一致。子命令、参数和枚举值使用静态补全。模型名（`--model`、`--smol`、`--slow`、`--plan`）从内置模型目录补全；`--resume` 根据磁盘上的会话补全。

```sh
# zsh — add to ~/.zshrc (or write the output into a file on your $fpath)
eval "$(omp completions zsh)"

# bash — add to ~/.bashrc
eval "$(omp completions bash)"

# fish
omp completions fish > ~/.config/fish/completions/omp.fish
```
