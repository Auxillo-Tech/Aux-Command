🌐 [English](README.md) · **Deutsch** · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** ist Auxillos kostenlose, quelloffene und Linux-native Workstation für den Remote-Betrieb: eine einzige sichere Desktop-Anwendung für SSH-Terminals, SFTP, FTP/FTPS, SSH-Tunnel, RDP- und VNC-Remote-Desktops, Mosh, Telnet, serielle Konsolen und lokale Shells.

Sie richtet sich an technische Betreiber, Infrastrukturteams und Sicherheitsingenieure, die mit vielen lokalen und entfernten Systemen arbeiten und statt vieler einzelner Werkzeuge einen einheitlichen Arbeitsbereich wollen.

> Aktuelle Version: **0.5.0** für Linux x86_64. Releases sind mit GPG signiert.

## Hauptfunktionen

- **Terminal-Arbeitsbereich** – Tabs, die du per Drag-and-drop beliebig anordnen und umbenennen kannst (Doppelklick oder F2), eine eigene Farbe pro Verbindung (zum Beispiel Rot für Produktion), Einzel- oder Kachelansicht, abtrennbare Terminalfenster, Terminal-Zoom (Ctrl+= / Ctrl+- / Ctrl+0), 14 Terminal-Designs, Suche, Makros und Broadcast-Eingabe.
- **Kopieren und Einfügen wie in einem Linux-Terminal** – Markieren kopiert, Mittelklick fügt ein, Rechtsklick öffnet ein Menü (oder kopiert und fügt ein wie in PuTTY), dazu Ctrl+Shift+C / Ctrl+Shift+V und Ctrl+Insert / Shift+Insert. Ctrl+Klick öffnet Links.
- **SSH** – Native OpenSSH-Sitzungen, SSH-Agent, Import von `~/.ssh/config`, Identitätsdateien, ProxyJump, Kompression, Keepalive und X11-Weiterleitung.
- **SFTP und FTP/FTPS** – Zweispaltiger Dateimanager mit Übertragungen, die du vor dem Start prüfst, Ordnerübertragungen, Vergleichen und Synchronisieren, Inline-Textbearbeitung und einer Übertragungswarteschlange. SFTP berücksichtigt Schlüssel, die in der OpenSSH-Datei `known_hosts` bereits als vertrauenswürdig hinterlegt sind.
- **SSH-Tunnel** – Lokale, entfernte und dynamische (SOCKS) Weiterleitungen, die erst dann als bereit gemeldet werden, wenn sie tatsächlich funktionieren.
- **Remote-Desktops** – Eingebettete RDP- und VNC-Tabs, externe FreeRDP-/TigerVNC-Clients sowie RDP/VNC über ein SSH-Gateway.
- **Arbeitsbereiche** – Benannte gespeicherte Arbeitsbereiche, Sitzungswiederherstellung, Verbindungsgruppen, Favoriten, Sicherungen der Arbeitsbereiche und lokale Wiederherstellungspunkte.
- **Terminal-Assistent** – Betriebssystemerkennung pro Sitzung, Inline-Befehlsvorschläge (Ctrl+Space), „Meintest du …?“-Korrekturen und eine Sicherheitsabfrage vor gefährlichen Befehlen; jede dieser Funktionen lässt sich abschalten. Was an einer Passwortabfrage eingegeben wird, wird nie angezeigt, vorgeschlagen oder gespeichert.
- **Produktivität** – Sitzungsübergreifende Verlaufssuche, ein Befehl auf vielen Sitzungen mit gesammelter Ausgabe, Sitzungswiedergabe, Live-Hoststatistiken und Netzwerkwerkzeuge.
- **Optionale KI-Hilfe** – Standardmäßig deaktiviert; nutzt deinen eigenen OpenAI-kompatiblen Endpunkt (zum Beispiel llama.cpp oder Ollama). Antworten werden nur eingefügt, nie ausgeführt.
- **Oberfläche auf Deutsch** – Die Oberfläche ist in 9 Sprachen verfügbar und lässt sich über die Statusleiste umschalten.

## Schnellinstallation

```bash
# AppImage (portabel)
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

Mosh, RDP (FreeRDP) und VNC (TigerVNC) verwenden die Clients der jeweiligen Distribution; `./scripts/install-runtime-tools.sh` installiert sie. Details findest du in [INSTALL.md](INSTALL.md).

## Sicherheit

Aux Command setzt auf klare Vertrauensgrenzen statt auf unsichtbaren Komfort. Der Electron-Renderer läuft in einer Sandbox mit `contextIsolation`, Chromium-Berechtigungen werden standardmäßig verweigert, und externe Navigation sowie Pop-ups werden blockiert. Prozesse werden direkt mit Argument-Arrays gestartet, nie über eine Shell. SSH-Hostschlüssel und RDP-Serverzertifikate werden bei der ersten Verwendung bestätigt, Änderungen werden gekennzeichnet; RDP wird an das bestätigte Zertifikat gebunden. Eingefügter Text wird von Steuerzeichen bereinigt, und mehrzeiliges Einfügen oder Einfügen per Broadcast muss zuerst bestätigt werden. Passwörter werden nur gespeichert, wenn verschlüsselter Desktop-Speicher verfügbar ist, und Exporte enthalten niemals Geheimnisse.

Sicherheitslücken meldest du bitte vertraulich, wie in [SECURITY.md](SECURITY.md) beschrieben.

## Support

Aux Command ist freie und quelloffene Software. Wenn sie dir bei der Arbeit hilft, kannst du mir [einen Kaffee ausgeben](https://www.buymeacoffee.com/auxillo).

## Lizenz

Aux Command ist freie und quelloffene Software unter der Lizenz **AGPL-3.0-or-later**. Jede Funktion ist Teil des öffentlichen Builds; es gibt keine kostenpflichtigen Editionen und keine Bezahlschranken.

---

> Vollständige Dokumentation auf Englisch: [README.md](README.md)
