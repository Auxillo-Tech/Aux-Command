#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  SUDO=()
elif command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
else
  printf '%s\n' 'Root privileges or sudo are required to install system packages.' >&2
  exit 1
fi

install_apt() {
  "${SUDO[@]}" apt-get update
  local rdp='freerdp2-x11'
  if apt-cache show freerdp3-x11 >/dev/null 2>&1; then rdp='freerdp3-x11'; fi
  "${SUDO[@]}" apt-get install -y python3 openssh-client mosh "$rdp" tigervnc-viewer iputils-ping traceroute dnsutils whois
}

install_dnf() {
  "${SUDO[@]}" dnf install -y python3 openssh-clients mosh freerdp tigervnc iputils traceroute bind-utils whois
}

install_pacman() {
  "${SUDO[@]}" pacman -Sy --needed python openssh mosh freerdp tigervnc iputils traceroute bind whois
}

install_zypper() {
  "${SUDO[@]}" zypper --non-interactive install python3 openssh-clients mosh freerdp tigervnc iputils traceroute bind-utils whois
}

if command -v apt-get >/dev/null 2>&1; then install_apt
elif command -v dnf >/dev/null 2>&1; then install_dnf
elif command -v pacman >/dev/null 2>&1; then install_pacman
elif command -v zypper >/dev/null 2>&1; then install_zypper
else
  printf '%s\n' 'Unsupported package manager. Install Python 3, OpenSSH, Mosh, FreeRDP, TigerVNC, ping, traceroute, dig and whois manually.' >&2
  exit 1
fi

printf '%s\n' 'Aux Command runtime tools installed.'
