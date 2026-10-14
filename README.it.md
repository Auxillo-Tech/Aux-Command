🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · **Italiano** · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** è la workstation di Auxillo per le operazioni remote, gratuita, open source e nativa per Linux: un'unica applicazione desktop sicura per terminali SSH, SFTP, FTP/FTPS, tunnel SSH, desktop remoti RDP e VNC, Mosh, Telnet, console seriali e shell locali.

È pensata per operatori tecnici, team di infrastruttura e ingegneri della sicurezza che lavorano su molti sistemi locali e remoti e vogliono un unico spazio di lavoro coerente invece di tanti strumenti separati.

> Versione attuale: **0.5.0** per Linux x86_64. Le release sono firmate con GPG.

## Caratteristiche principali

- **Area di lavoro del terminale** – Schede che puoi trascinare nell'ordine che preferisci e rinominare (doppio clic o F2), un colore per ogni connessione (ad esempio rosso per la produzione), layout singolo o affiancato, finestre di terminale separabili, zoom del terminale (Ctrl+= / Ctrl+- / Ctrl+0), 14 temi per il terminale, ricerca, macro e input broadcast.
- **Copia e incolla come in un terminale Linux** – La selezione copia, il clic centrale incolla e il clic destro apre un menu (oppure copia/incolla in stile PuTTY), oltre a Ctrl+Shift+C / Ctrl+Shift+V e Ctrl+Insert / Shift+Insert. Ctrl+clic apre i link.
- **SSH** – Sessioni OpenSSH native, agente SSH, importazione di `~/.ssh/config`, file di identità, ProxyJump, compressione, keepalive e inoltro X11.
- **SFTP e FTP/FTPS** – File manager a doppio pannello con trasferimenti da verificare prima dell'avvio, trasferimento di cartelle, confronto e sincronizzazione, modifica del testo inline e coda dei trasferimenti. SFTP rispetta le chiavi già considerate attendibili nel file `known_hosts` di OpenSSH.
- **Tunnel SSH** – Inoltri locali, remoti e dinamici (SOCKS), segnalati come pronti solo quando funzionano davvero.
- **Desktop remoti** – Schede RDP e VNC integrate, client esterni FreeRDP/TigerVNC e RDP/VNC tramite gateway SSH.
- **Spazi di lavoro** – Spazi di lavoro salvati con nome, ripristino delle sessioni, gruppi di connessioni, preferiti, backup degli spazi di lavoro e punti di ripristino locali.
- **Assistente del terminale** – Rilevamento del sistema operativo per sessione, suggerimenti di comandi inline (Ctrl+Space), correzioni «forse intendevi» e una protezione prima dei comandi pericolosi; ogni funzione si può disattivare. Nulla di ciò che viene digitato a un prompt della password viene mostrato, suggerito o salvato.
- **Produttività** – Ricerca nella cronologia di tutte le sessioni, un comando su più sessioni con output raccolto, replay delle sessioni, statistiche degli host in tempo reale e strumenti di rete.
- **IA opzionale** – Disattivata per impostazione predefinita; usa il tuo endpoint compatibile con OpenAI (ad esempio llama.cpp o Ollama). Le risposte vengono solo inserite, mai eseguite.
- **Interfaccia in italiano** – L'interfaccia è disponibile in 9 lingue e si può cambiare dalla barra di stato.

## Installazione rapida

```bash
# AppImage (portabile)
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

Mosh, RDP (FreeRDP) e VNC (TigerVNC) usano i client della distribuzione; `./scripts/install-runtime-tools.sh` li installa. Per i dettagli consulta [INSTALL.md](INSTALL.md).

## Sicurezza

Aux Command preferisce confini di fiducia espliciti a una comodità invisibile. Il renderer di Electron viene eseguito in sandbox con `contextIsolation`, i permessi di Chromium sono negati per impostazione predefinita e la navigazione esterna e i popup sono bloccati. I processi vengono avviati direttamente con array di argomenti, mai tramite una shell. Le chiavi host SSH e i certificati dei server RDP vengono confermati al primo utilizzo e le modifiche vengono segnalate; RDP resta vincolato al certificato confermato. Dal testo incollato vengono rimossi i caratteri di controllo, e gli incolla su più righe o in broadcast richiedono prima una conferma. Le password vengono salvate solo se è disponibile l'archiviazione cifrata del desktop, e le esportazioni non contengono mai segreti.

Segnala le vulnerabilità in privato come descritto in [SECURITY.md](SECURITY.md).

## Supporto

Aux Command è software libero e open source. Se ti è utile nel tuo lavoro, puoi [offrirmi un caffè](https://www.buymeacoffee.com/auxillo).

## Licenza

Aux Command è software libero e open source con licenza **AGPL-3.0-or-later**. Ogni funzionalità fa parte della build pubblica; non esistono edizioni a pagamento né paywall.

---

> Documentazione completa in inglese: [README.md](README.md)
