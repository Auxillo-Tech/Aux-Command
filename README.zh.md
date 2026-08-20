🌐 [English](README.md) · [Deutsch](README.de.md) · **简体中文** · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** 是 Auxillo 推出的免费、开源、原生 Linux 远程运维工作站：一款安全桌面控制台，为需要在单一应用中整合 SSH 终端、SFTP、隧道、远程桌面启动器、Mosh、Telnet、串行控制台、本地 Shell、配置文件和生产级运维工具的操作人员而设计。

专为需要跨本地和远程系统快速移动的技术运维人员、基础设施团队和安全工程师打造，无需将工作分散在多个不协调的工具中。

## 主要功能

- **终端工作区** - 基于 PTY 的选项卡式终端（xterm.js），支持本地 Shell 会话、可定制主题、分屏布局、命令面板、宏录制和广播输入。
- **SSH 操作** - 原生 OpenSSH 会话、SSH 代理支持、`~/.ssh/config` 导入、身份文件、ProxyJump、压缩、保活、X11 转发和 SCP 回退。
- **SFTP** - 图形化 SFTP 浏览器，支持主机密钥指纹确认、上传/下载、内联文本编辑和文件夹管理。
- **SSH 隧道** - 本地、远程和动态 SOCKS 转发，基于证据的就绪检测。
- **协议启动器和桥接器** - Mosh、RDP（FreeRDP）、VNC（TigerVNC）、Telnet 和串行桥接器，以及 PTY 辅助程序。
- **FTP / FTPS** - 文件浏览器配置文件，支持加密 TLS 传输（FTPS）并对未加密的 FTP 连接发出警告。
- **发布与诊断** - GitHub Releases 更新路径、AppImage、.deb 和 .rpm 软件包、SBOM 生成和 SHA-256 校验验证。
- **终端助手** - 按会话被动识别操作系统、内联命令建议（Ctrl+Space）、“你是不是想输入”纠错，以及执行破坏性命令前的确认保护；每项均可单独关闭。
- **效率工具** - 跨会话历史搜索、一条命令在多个会话中执行并收集输出、带真实时间轴的会话回放，以及状态栏系统统计。
- **可选 AI 辅助** - 默认关闭；使用你自己的 OpenAI 兼容端点（llama.cpp、Ollama 等）。回复只会插入终端，绝不自动执行。
- **中文界面** - 界面支持 9 种语言，可在状态栏即时切换。

## 快速安装

```bash
# AppImage（便携式）
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

## 安全性

Aux Command 倾向于采用明确的安全边界而非隐蔽的便利性。Electron 渲染器沙箱、`contextIsolation` 已启用，Chromium 权限请求默认拒绝。外部导航和弹窗默认被阻止。特权 IPC 经过发送者窗口和框架验证，使用参数数组直接生成进程（无 Shell 插值），并通过 Linux 死亡信号守卫管理辅助进程的生命周期。

## 支持

Aux Command 是免费开源软件。如果它对你的运维工作有帮助，可以[请我喝杯咖啡](https://www.buymeacoffee.com/auxillo)。

## 许可证

Aux Command 是免费开源软件，采用 **AGPL-3.0-or-later** 许可证。所有功能均包含在公开构建中，无企业专属模块、付费版本或付费墙。

---

> 英文完整文档：[README.md](README.md)
