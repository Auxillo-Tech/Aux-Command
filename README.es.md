🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · **Español** · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** es la estación de trabajo gratuita, de código abierto y nativa de Linux para operaciones remotas de Auxillo: una consola de escritorio segura para operadores que necesitan terminales SSH, SFTP, túneles, lanzadores de escritorio remoto, Mosh, Telnet, consolas serie, shells locales, perfiles y herramientas operativas de nivel profesional en una sola aplicación.

Diseñado para operadores técnicos, equipos de infraestructura e ingenieros de seguridad que necesitan moverse rápidamente entre sistemas locales y remotos sin dispersar el trabajo entre muchas herramientas no coordinadas.

## Características principales

- **Espacio de trabajo de terminal** - Pestañas de terminal basadas en PTY con xterm.js, sesiones de shell local, temas personalizables, diseños divididos, paleta de comandos, grabación de macros y entrada transmitida.
- **Operaciones SSH** - Sesiones OpenSSH nativas, soporte de agente SSH, importación de `~/.ssh/config`, archivos de identidad, ProxyJump, compresión, keepalive, reenvío X11 y modo de respaldo SCP.
- **SFTP** - Explorador SFTP gráfico con confirmación de huella digital de clave de host, carga/descarga, edición de texto en línea y gestión de carpetas.
- **Túneles SSH** - Reenvíos locales, remotos y SOCKS dinámicos con detección de disponibilidad basada en evidencia.
- **Lanzadores de protocolo y puentes** - Puentes Mosh, RDP (FreeRDP), VNC (TigerVNC), Telnet y serie, además de un ayudante PTY.
- **FTP / FTPS** - Perfiles de explorador de archivos con transporte TLS cifrado (FTPS) y advertencia para conexiones FTP no cifradas.
- **Publicación y diagnóstico** - Ruta de actualización de GitHub Releases, paquetes AppImage, .deb y .rpm, generación de SBOM y verificación de suma de comprobación SHA-256.

## Instalación rápida

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

## Seguridad

Aux Command está construido para operaciones sensibles a la seguridad, favoreciendo límites explícitos sobre la conveniencia invisible. El sandbox del renderizador de Electron, `contextIsolation` y la denegación predeterminada de solicitudes de permiso de Chromium están activados. La navegación externa y las ventanas emergentes están bloqueadas por defecto. La IPC privilegiada valida la ventana y el marco del remitente, la creación directa de procesos con matrices de argumentos (sin interpolación de shell) y un guardián de señal de muerte de Linux para procesos auxiliares gestionados garantizan un entorno operativo seguro.

## Licencia

Aux Command es software libre y de código abierto bajo la licencia **AGPL-3.0-or-later**. Cada funcionalidad pertenece a la compilación pública; no hay módulos solo empresariales, ediciones de pago ni muros de pago.

---

> Documentación completa en inglés: [README.md](README.md)
