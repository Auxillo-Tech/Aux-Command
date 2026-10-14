🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · **Português** · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** é a estação de trabalho da Auxillo para operações remotas, gratuita, de código aberto e nativa para Linux: uma única aplicação de ambiente de trabalho segura para terminais SSH, SFTP, FTP/FTPS, túneis SSH, ambientes de trabalho remotos RDP e VNC, Mosh, Telnet, consolas série e shells locais.

Foi concebida para operadores técnicos, equipas de infraestrutura e engenheiros de segurança que trabalham com muitos sistemas locais e remotos e querem um espaço de trabalho único e coerente em vez de várias ferramentas separadas.

> Versão atual: **0.5.0** para Linux x86_64. As versões publicadas são assinadas com GPG.

## Principais funcionalidades

- **Espaço de trabalho do terminal** – Separadores que pode arrastar para qualquer ordem e mudar de nome (duplo clique ou F2), uma cor por ligação (por exemplo, vermelho para produção), vista única ou em mosaico, janelas de terminal destacáveis, zoom do terminal (Ctrl+= / Ctrl+- / Ctrl+0), 14 temas de terminal, pesquisa, macros e entrada em difusão (broadcast).
- **Copiar e colar como num terminal Linux** – Selecionar copia, o clique do meio cola e o clique direito abre um menu (ou copia e cola ao estilo do PuTTY); também estão disponíveis Ctrl+Shift+C / Ctrl+Shift+V e Ctrl+Insert / Shift+Insert. Ctrl+clique abre ligações.
- **SSH** – Sessões OpenSSH nativas, agente SSH, importação de `~/.ssh/config`, ficheiros de identidade, ProxyJump, compressão, keepalive e reencaminhamento X11.
- **SFTP e FTP/FTPS** – Gestor de ficheiros de painel duplo com transferências revistas antes de serem executadas, transferência de pastas, comparação e sincronização, edição de texto integrada e fila de transferências. O SFTP respeita as chaves em que o OpenSSH já confia no `known_hosts`.
- **Túneis SSH** – Reencaminhamentos locais, remotos e dinâmicos (SOCKS) que só são indicados como prontos quando funcionam de facto.
- **Ambientes de trabalho remotos** – Separadores RDP e VNC integrados, clientes externos FreeRDP/TigerVNC e RDP/VNC através de um gateway SSH.
- **Espaços de trabalho** – Espaços de trabalho guardados com nome, restauro de sessões, grupos de ligações, favoritos, cópias de segurança dos espaços de trabalho e pontos de recuperação locais.
- **Assistente de terminal** – Deteção do sistema operativo por sessão, sugestões de comandos em linha (Ctrl+Space), correções «queria dizer» e uma confirmação antes de comandos perigosos; cada parte pode ser desativada. Nada do que é escrito num pedido de palavra-passe é mostrado, sugerido ou guardado.
- **Produtividade** – Pesquisa no histórico de todas as sessões, um comando em várias sessões com recolha da saída, reprodução de sessões, estatísticas do host em tempo real e ferramentas de rede.
- **Ajuda de IA opcional** – Desativada por predefinição; usa o seu próprio endpoint compatível com OpenAI (por exemplo, llama.cpp ou Ollama). As respostas são apenas inseridas, nunca executadas.
- **Interface em português** – A interface está disponível em 9 idiomas e pode ser alterada a partir da barra de estado.

## Instalação rápida

```bash
# AppImage (portátil)
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

O Mosh, o RDP (FreeRDP) e o VNC (TigerVNC) utilizam os clientes da própria distribuição; o `./scripts/install-runtime-tools.sh` instala-os. Consulte [INSTALL.md](INSTALL.md) para mais pormenores.

## Segurança

O Aux Command prefere limites de confiança explícitos a uma conveniência invisível. O renderizador do Electron é executado numa sandbox com `contextIsolation`, as permissões do Chromium são recusadas por predefinição e a navegação externa e as janelas pop-up são bloqueadas. Os processos são iniciados diretamente com matrizes de argumentos, nunca através de uma shell. As chaves de host SSH e os certificados de servidor RDP são confirmados na primeira utilização e as alterações são assinaladas; o RDP fica fixado ao certificado confirmado. O texto colado é limpo de caracteres de controlo, e as colagens de várias linhas ou em difusão têm de ser confirmadas primeiro. As palavras-passe só são guardadas quando existe armazenamento encriptado do ambiente de trabalho, e as exportações nunca contêm segredos.

Comunique vulnerabilidades de forma privada, conforme descrito em [SECURITY.md](SECURITY.md).

## Apoio

O Aux Command é software livre e de código aberto. Se for útil no seu trabalho, pode [oferecer-me um café](https://www.buymeacoffee.com/auxillo).

## Licença

O Aux Command é software livre e de código aberto sob a licença **AGPL-3.0-or-later**. Todas as funcionalidades fazem parte da compilação pública; não há edições pagas nem paywalls.

---

> Documentação completa em inglês: [README.md](README.md)
