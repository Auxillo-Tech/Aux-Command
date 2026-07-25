🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · **Français** · [日本語](README.ja.md) · [Português](README.pt.md)

---

# Aux Command

**Aux Command** est le poste de travail gratuit, open-source et natif Linux pour les opérations à distance d'Auxillo : une console de bureau sécurisée pour les opérateurs qui ont besoin de terminaux SSH, SFTP, tunnels, lanceurs de bureau à distance, Mosh, Telnet, consoles série, shells locaux, profils et outils opérationnels de qualité professionnelle dans une seule application.

Conçu pour les opérateurs techniques, les équipes d'infrastructure et les ingénieurs sécurité qui doivent évoluer rapidement entre systèmes locaux et distants sans disperser leur travail entre de nombreux outils non coordonnés.

## Fonctionnalités clés

- **Espace de travail terminal** – Onglets de terminaux basés sur PTY avec xterm.js, sessions shell locales, thèmes personnalisables, dispositions divisées, palette de commandes, enregistrement de macros et diffusion d'entrée.
- **Opérations SSH** – Sessions OpenSSH natives, support de l'agent SSH, importation `~/.ssh/config`, fichiers d'identité, ProxyJump, compression, keepalive, redirection X11 et repli SCP.
- **SFTP** – Navigateur SFTP graphique avec confirmation d'empreinte de clé hôte, téléchargement/téléversement, édition de texte en ligne et gestion de dossiers.
- **Tunnels SSH** – Redirections locales, distantes et SOCKS dynamiques avec détection de disponibilité basée sur des preuves.
- **Lanceurs de protocole et ponts** – Ponts Mosh, RDP (FreeRDP), VNC (TigerVNC), Telnet et série, plus un assistant PTY.
- **FTP / FTPS** – Profils de navigateur de fichiers avec transport TLS chiffré (FTPS) et avertissement pour les connexions FTP non chiffrées.
- **Publication et diagnostic** – Chemin de mise à jour GitHub Releases, paquets AppImage, .deb et .rpm, génération SBOM et vérification de somme de contrôle SHA-256.

## Installation rapide

```bash
# AppImage (portable)
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

## Sécurité

Aux Command est conçu pour les opérations sensibles à la sécurité, privilégiant des limites explicites à la commodité invisible. Le sandbox du renderer Electron, `contextIsolation` et le refus par défaut des demandes d'autorisation Chromium sont activés. La navigation externe et les popups sont bloqués par défaut. L'IPC privilégié valide la fenêtre et le cadre émetteur, la création directe de processus avec des tableaux d'arguments (pas d'interpolation par le shell) et un gardien de signal de mort Linux pour les processus auxiliaires gérés garantissent un environnement d'exploitation sécurisé.

## Licence

Aux Command est un logiciel libre et open-source sous licence **AGPL-3.0-or-later**. Chaque fonctionnalité appartient à la version publique ; il n'y a pas de modules exclusifs aux entreprises, d'éditions payantes ou de murs de paiement.

---

> Documentation complète en anglais : [README.md](README.md)
