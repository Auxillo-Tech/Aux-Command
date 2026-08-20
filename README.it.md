🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · **Italiano** · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** è la workstation gratuita, open-source e nativa Linux per operazioni remote di Auxillo: una console desktop sicura per operatori che necessitano di terminali SSH, SFTP, tunnel, lanciatori di desktop remoti, Mosh, Telnet, console seriali, shell locali, profili e strumenti operativi di livello professionale in un'unica applicazione.

Progettato per operatori tecnici, team infrastrutturali e ingegneri della sicurezza che devono muoversi rapidamente tra sistemi locali e remoti senza disperdere il lavoro tra molti strumenti non coordinati.

## Caratteristiche principali

- **Area di lavoro terminale** - Schede terminale basate su PTY con xterm.js, sessioni shell locali, temi personalizzabili, layout suddivisi, palette comandi, registrazione macro e input broadcast.
- **Operazioni SSH** - Sessioni OpenSSH native, supporto agente SSH, importazione `~/.ssh/config`, file di identità, ProxyJump, compressione, keepalive, inoltro X11 e fallback SCP.
- **SFTP** - Browser SFTP grafico con conferma dell'impronta della chiave host, upload/download, modifica testo inline e gestione cartelle.
- **Tunnel SSH** - Inoltri locali, remoti e SOCKS dinamici con rilevamento della prontezza basato su evidenze.
- **Lanciatori di protocollo e ponti** - Bridge Mosh, RDP (FreeRDP), VNC (TigerVNC), Telnet e seriali, più un helper PTY.
- **FTP / FTPS** - Profili browser file con trasporto TLS crittografato (FTPS) e avviso per connessioni FTP non crittografate.
- **Rilascio e diagnostica** - Percorso di aggiornamento GitHub Releases, pacchetti AppImage, .deb e .rpm, generazione SBOM e verifica checksum SHA-256.
- **Assistente del terminale** - Rilevamento passivo del sistema operativo per sessione, suggerimenti in linea (Ctrl+Spazio), correzioni «forse intendevi» e protezione prima dei comandi distruttivi; tutto disattivabile singolarmente.
- **Produttività** - Ricerca della cronologia tra sessioni, un comando su più sessioni con output raccolto, replay delle sessioni con tempi reali e statistiche di sistema nella barra di stato.
- **IA opzionale** - Disattivata per impostazione predefinita; usa il tuo endpoint compatibile OpenAI (llama.cpp, Ollama…). Le risposte vengono solo inserite, mai eseguite.
- **Interfaccia in italiano** - L'interfaccia è disponibile in 9 lingue, selezionabili dalla barra di stato.

## Installazione rapida

```bash
# AppImage (portabile)
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

## Sicurezza

Aux Command è costruito per operazioni sensibili alla sicurezza, privilegiando confini espliciti rispetto alla comodità invisibile. Il sandbox del renderer Electron, `contextIsolation` e la negazione predefinita delle richieste di autorizzazione Chromium sono attivi. La navigazione esterna e i popup sono bloccati per impostazione predefinita. La IPC privilegiata convalida finestra e frame mittente, la creazione diretta di processi con array di argomenti (nessuna interpolazione shell) e un guardiano del segnale di morte Linux per i processi helper gestiti garantiscono un ambiente operativo sicuro.

## Supporto

Aux Command è software libero e open source. Se ti aiuta nel lavoro operativo, puoi [offrirmi un caffè](https://www.buymeacoffee.com/auxillo).

## Licenza

Aux Command è software libero e open-source con licenza **AGPL-3.0-or-later**. Ogni funzionalità appartiene alla build pubblica; non esistono moduli solo enterprise, edizioni a pagamento o paywall.

---

> Documentazione completa in inglese: [README.md](README.md)
