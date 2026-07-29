🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · **Português** · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** é a estação de trabalho gratuita, de código aberto e nativa Linux para operações remotas da Auxillo: um console desktop seguro para operadores que precisam de terminais SSH, SFTP, túneis, lançadores de área de trabalho remota, Mosh, Telnet, consoles seriais, shells locais, perfis e ferramentas operacionais de nível profissional em um único aplicativo.

Projetado para operadores técnicos, equipes de infraestrutura e engenheiros de segurança que precisam se mover rapidamente entre sistemas locais e remotos sem dispersar o trabalho entre muitas ferramentas não coordenadas.

## Principais recursos

- **Espaço de trabalho de terminal** - Abas de terminal baseadas em PTY com xterm.js, sessões de shell local, temas personalizáveis, layouts divididos, paleta de comandos, gravação de macros e entrada transmitida.
- **Operações SSH** - Sessões OpenSSH nativas, suporte a agente SSH, importação de `~/.ssh/config`, arquivos de identidade, ProxyJump, compressão, keepalive, encaminhamento X11 e fallback SCP.
- **SFTP** - Navegador SFTP gráfico com confirmação de impressão digital de chave de host, upload/download, edição de texto inline e gerenciamento de pastas.
- **Túneis SSH** - Encaminhamentos locais, remotos e SOCKS dinâmicos com detecção de prontidão baseada em evidências.
- **Lançadores de protocolo e pontes** - Pontes Mosh, RDP (FreeRDP), VNC (TigerVNC), Telnet e serial, além de um auxiliar PTY.
- **FTP / FTPS** - Perfis de navegador de arquivos com transporte TLS criptografado (FTPS) e aviso para conexões FTP não criptografadas.
- **Lançamento e diagnóstico** - Caminho de atualização do GitHub Releases, pacotes AppImage, .deb e .rpm, geração de SBOM e verificação de soma de verificação SHA-256.

## Instalação rápida

```bash
# AppImage (portátil)
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

## Segurança

Aux Command é construído para operações sensíveis à segurança, favorecendo limites explícitos em vez de conveniência invisível. O sandbox do renderizador Electron, `contextIsolation` e a negação padrão de solicitações de permissão do Chromium estão ativados. Navegação externa e popups são bloqueados por padrão. IPC privilegiado valida a janela e o quadro do remetente, criação direta de processos com matrizes de argumentos (sem interpolação de shell) e um guardião de sinal de morte Linux para processos auxiliares gerenciados garantem um ambiente operacional seguro.

## Apoio

O Aux Command é software livre e de código aberto. Se ajudar o seu trabalho de operações, pode [oferecer-me um café](https://www.buymeacoffee.com/auxillo).

## Licença

Aux Command é software livre e de código aberto licenciado sob **AGPL-3.0-or-later**. Cada funcionalidade pertence à compilação pública; não há módulos exclusivos para empresas, edições pagas ou paywalls.

---

> Documentação completa em inglês: [README.md](README.md)
