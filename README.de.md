🌐 [English](README.md) · **Deutsch** · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** ist Auxillos kostenlose, quelloffene, Linux-native Fernarbeitsstation: eine sichere Desktop-Konsole für Betreiber, die SSH-Terminals, SFTP, Tunnel, Remote-Desktop-Starter, Mosh, Telnet, serielle Konsolen, lokale Shells, Profile und betriebsreife operative Werkzeuge in einer einzigen Anwendung benötigen.

Entwickelt für technische Betreiber, Infrastrukturteams und Sicherheitsingenieure, die schnell auf lokalen und entfernten Systemen arbeiten müssen, ohne ihre Arbeit über viele unkoordinierte Werkzeuge zu verteilen.

## Hauptfunktionen

- **Terminal-Arbeitsbereich** - Registerkartenbasierter PTY-gestützter Terminal mit xterm.js, lokale Shell-Sitzungen, anpassbare Designs, geteilte Layouts, Befehlspalette, Makroaufzeichnung und gesendete Eingabe.
- **SSH-Operationen** - Native OpenSSH-Sitzungen, SSH-Agent-Unterstützung, `~/.ssh/config`-Import, Identity-Dateien, ProxyJump, Kompression, Keepalive, X11-Weiterleitung und SCP-Fallback.
- **SFTP** - Grafischer SFTP-Browser mit Host-Key-Fingerprint-Bestätigung, Upload/Download, Inline-Textbearbeitung und Ordnerverwaltung.
- **SSH-Tunnel** - Lokale, Remote- und dynamische SOCKS-Weiterleitungen mit evidenzbasierter Bereitschaftserkennung.
- **Protokoll-Starter und Brücken** - Mosh-, RDP- (FreeRDP), VNC- (TigerVNC), Telnet- und serielle Brücken sowie ein PTY-Helfer.
- **FTP / FTPS** - Datei-Browser-Profile mit verschlüsseltem TLS-Transport (FTPS) und Warnung bei unverschlüsselten FTP-Verbindungen.
- **Veröffentlichung und Diagnose** - GitHub-Releases-Update-Pfad, AppImage-, .deb- und .rpm-Pakete, SBOM-Generierung und SHA-256-Prüfsummenverifikation.

## Schnellinstallation

```bash
# AppImage (portabel)
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

## Sicherheit

Aux Command setzt auf explizite Sicherheitsgrenzen statt auf unsichtbare Bequemlichkeit. Der Electron-Renderer-Sandbox, `contextIsolation` und die standardmäßige Verweigerung von Chromium-Berechtigungen sind aktiviert. Fremde Navigation und Popups werden standardmäßig blockiert. Bevorzugte IPC-Validierung, direkte Prozesserzeugung mit Argument-Arrays (keine Shell-Interpolation) und ein Linux-Death-Signal-Wächter für verwaltete Hilfsprozesse gewährleisten eine sichere Betriebsumgebung.

## Lizenz

Aux Command ist freie und quelloffene Software unter der **AGPL-3.0-or-later**-Lizenz. Jede Funktion gehört zum öffentlichen Build; es gibt keine kostenpflichtigen Editionen oder Bezahlschranken.

---

> Vollständige Dokumentation auf Englisch: [README.md](README.md)
