🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · **Français** · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** est le poste de travail d'Auxillo pour les opérations à distance, gratuit, open source et natif Linux : une seule application de bureau sécurisée pour les terminaux SSH, SFTP, FTP/FTPS, les tunnels SSH, les bureaux à distance RDP et VNC, Mosh, Telnet, les consoles série et les shells locaux.

Il s'adresse aux opérateurs techniques, aux équipes d'infrastructure et aux ingénieurs sécurité qui travaillent sur de nombreux systèmes locaux et distants et qui veulent un espace de travail unique et cohérent plutôt qu'une multitude d'outils séparés.

> Version actuelle : **0.4.0** pour Linux x86_64. Les versions publiées sont signées avec GPG.

## Fonctionnalités clés

- **Espace de travail terminal** – Des onglets que vous pouvez réorganiser par glisser-déposer et renommer (double-clic ou F2), une couleur par connexion (par exemple rouge pour la production), affichage simple ou en mosaïque, fenêtres de terminal détachables, zoom du terminal (Ctrl+= / Ctrl+- / Ctrl+0), 14 thèmes de terminal, recherche, macros et saisie diffusée.
- **Copier-coller comme dans un terminal Linux** – La sélection copie, le clic du milieu colle, le clic droit ouvre un menu (ou copie/colle à la manière de PuTTY), sans oublier Ctrl+Shift+C / Ctrl+Shift+V et Ctrl+Insert / Shift+Insert. Ctrl+clic ouvre les liens.
- **SSH** – Sessions OpenSSH natives, agent SSH, import de `~/.ssh/config`, fichiers d'identité, ProxyJump, compression, keepalive et redirection X11.
- **SFTP et FTP/FTPS** – Gestionnaire de fichiers à deux panneaux avec transferts vérifiés avant exécution, transfert de dossiers, comparaison et synchronisation, édition de texte intégrée et file d'attente des transferts. SFTP respecte les clés déjà approuvées dans le fichier `known_hosts` d'OpenSSH.
- **Tunnels SSH** – Redirections locales, distantes et dynamiques (SOCKS), signalées comme prêtes uniquement lorsqu'elles fonctionnent réellement.
- **Bureaux à distance** – Onglets RDP et VNC intégrés, clients externes FreeRDP/TigerVNC, et RDP/VNC via une passerelle SSH.
- **Espaces de travail** – Espaces de travail nommés et enregistrés, restauration de session, groupes de connexions, favoris, sauvegardes des espaces de travail et points de restauration locaux.
- **Assistant de terminal** – Détection du système d'exploitation par session, suggestions de commandes en ligne (Ctrl+Space), corrections « vouliez-vous dire » et garde-fou avant les commandes dangereuses ; chaque élément peut être désactivé. Rien de ce qui est saisi à une invite de mot de passe n'est affiché, suggéré ni enregistré.
- **Productivité** – Recherche dans l'historique de toutes les sessions, une même commande sur plusieurs sessions avec collecte des sorties, relecture de session, statistiques des hôtes en temps réel et outils réseau.
- **Assistance IA optionnelle** – Désactivée par défaut ; utilise votre propre endpoint compatible OpenAI (par exemple llama.cpp ou Ollama). Les réponses sont seulement insérées, jamais exécutées.
- **Interface en français** – L'interface est disponible en 9 langues et peut être changée depuis la barre d'état.

## Installation rapide

```bash
# AppImage (portable)
chmod +x Aux-Command-0.4.0-x86_64.AppImage
./Aux-Command-0.4.0-x86_64.AppImage

# Debian / Ubuntu
sudo apt install ./Aux-Command-0.4.0-amd64.deb
aux-command

# Fedora / RHEL / Rocky / AlmaLinux
sudo dnf install ./Aux-Command-0.4.0-x86_64.rpm
aux-command

# openSUSE
sudo zypper install ./Aux-Command-0.4.0-x86_64.rpm
aux-command
```

Mosh, RDP (FreeRDP) et VNC (TigerVNC) utilisent les clients fournis par la distribution ; `./scripts/install-runtime-tools.sh` les installe. Consultez [INSTALL.md](INSTALL.md) pour plus de détails.

## Sécurité

Aux Command privilégie des limites de confiance explicites plutôt qu'une commodité invisible. Le moteur de rendu Electron s'exécute dans un bac à sable avec `contextIsolation`, les autorisations Chromium sont refusées par défaut, et la navigation externe ainsi que les fenêtres pop-up sont bloquées. Les processus sont lancés directement avec des tableaux d'arguments, jamais via un shell. Les clés d'hôte SSH et les certificats de serveur RDP sont confirmés à la première utilisation, et toute modification est signalée ; RDP est épinglé au certificat confirmé. Le texte collé est débarrassé des caractères de contrôle, et les collages multilignes ou diffusés doivent d'abord être confirmés. Les mots de passe ne sont enregistrés que si un stockage chiffré du bureau est disponible, et les exports ne contiennent jamais de secrets.

Signalez les vulnérabilités en privé, comme indiqué dans [SECURITY.md](SECURITY.md).

## Soutien

Aux Command est un logiciel libre et open source. S'il vous aide dans votre travail, vous pouvez [m'offrir un café](https://www.buymeacoffee.com/auxillo).

## Licence

Aux Command est un logiciel libre et open source sous licence **AGPL-3.0-or-later**. Toutes les fonctionnalités font partie de la version publique ; il n'y a ni édition payante ni paywall.

---

> Documentation complète en anglais : [README.md](README.md)
