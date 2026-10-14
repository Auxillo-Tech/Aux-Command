🌐 [English](README.md) · [Deutsch](README.de.md) · **简体中文** · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** 是 Auxillo 推出的免费、开源、原生 Linux 远程运维工作站：一款安全的桌面应用，集成 SSH 终端、SFTP、FTP/FTPS、SSH 隧道、RDP 和 VNC 远程桌面、Mosh、Telnet、串行控制台和本地 Shell。

它专为技术运维人员、基础设施团队和安全工程师打造，适合需要在众多本地和远程系统之间工作、希望用一个统一的工作区取代多个分散工具的用户。

> 当前版本：适用于 Linux x86_64 的 **0.5.0**。发布版本均经过 GPG 签名。

## 主要功能

- **终端工作区**：可拖动排序并重命名（双击或按 F2）的标签页，为每个连接设置颜色（例如生产环境用红色），单窗口或平铺布局，可弹出的独立终端窗口，终端缩放（Ctrl+= / Ctrl+- / Ctrl+0），14 种终端主题，以及搜索、宏和广播输入。
- **像 Linux 终端一样复制粘贴**：选中即复制，中键粘贴，右键打开菜单（或使用 PuTTY 风格的复制/粘贴），并支持 Ctrl+Shift+C / Ctrl+Shift+V 和 Ctrl+Insert / Shift+Insert。Ctrl+单击可打开链接。
- **SSH**：原生 OpenSSH 会话、SSH 代理、导入 `~/.ssh/config`、身份文件、ProxyJump、压缩、保活和 X11 转发。
- **SFTP 和 FTP/FTPS**：双栏文件管理器，支持传输前审核、文件夹传输、比较与同步、内联文本编辑和传输队列。SFTP 会沿用 OpenSSH `known_hosts` 中已信任的密钥。
- **SSH 隧道**：本地、远程和动态（SOCKS）转发，只有在真正可用时才会显示为就绪。
- **远程桌面**：内嵌 RDP 和 VNC 标签页、外部 FreeRDP/TigerVNC 客户端，以及通过 SSH 网关连接 RDP/VNC。
- **工作区**：可命名保存的工作区、会话恢复、连接分组、收藏夹、工作区备份和本地恢复点。
- **终端助手**：按会话识别操作系统、内联命令建议（Ctrl+Space）、“你是不是想输入”纠错，以及执行危险命令前的确认保护；每项功能均可单独关闭。在密码提示符下输入的任何内容都不会被显示、建议或保存。
- **效率工具**：跨会话历史搜索、在多个会话中执行同一命令并汇总输出、会话回放、实时主机统计和网络工具。
- **可选 AI 辅助**：默认关闭；使用你自己的 OpenAI 兼容端点（例如 llama.cpp 或 Ollama）。回复只会被插入，绝不会被执行。
- **简体中文界面**：界面支持 9 种语言，可在状态栏中切换。

## 快速安装

```bash
# AppImage（便携式）
chmod +x Aux-Command-0.5.0-x86_64.AppImage
./Aux-Command-0.5.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.5.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.5.0-x86_64.rpm
aux-command

# openSUSE
sudo zypper install ./Aux-Command-0.5.0-x86_64.rpm
aux-command
```

Mosh、RDP（FreeRDP）和 VNC（TigerVNC）使用发行版自带的客户端，可通过 `./scripts/install-runtime-tools.sh` 安装。详情请参阅 [INSTALL.md](INSTALL.md)。

## 安全性

Aux Command 倾向于采用明确的信任边界，而非隐蔽的便利。Electron 渲染器在启用 `contextIsolation` 的沙箱中运行，Chromium 权限默认拒绝，外部导航和弹窗均被阻止。进程直接以参数数组启动，从不经过 Shell。SSH 主机密钥和 RDP 服务器证书在首次使用时需要确认，发生变化时会被标记；RDP 会固定到已确认的证书。粘贴的文本会清除控制字符，多行粘贴或广播粘贴需先确认。只有在加密的桌面存储可用时才会保存密码，导出内容中绝不包含机密信息。

请按照 [SECURITY.md](SECURITY.md) 中的说明私下报告漏洞。

## 支持

Aux Command 是免费开源软件。如果它对你的工作有帮助，可以[请我喝杯咖啡](https://www.buymeacoffee.com/auxillo)。

## 许可证

Aux Command 是基于 **AGPL-3.0-or-later** 许可证的免费开源软件。所有功能均包含在公开构建中，没有付费版本或付费墙。

---

> 英文完整文档：[README.md](README.md)
