🌐 [English](README.md) · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · **Español** · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md) · [Русский](README.ru.md)

---

# Aux Command

**Aux Command** es la estación de trabajo de Auxillo para operaciones remotas: gratuita, de código abierto y nativa de Linux. Una única aplicación de escritorio segura para terminales SSH, SFTP, FTP/FTPS, túneles SSH, escritorios remotos RDP y VNC, Mosh, Telnet, consolas serie y shells locales.

Está pensada para operadores técnicos, equipos de infraestructura e ingenieros de seguridad que trabajan con muchos sistemas locales y remotos y prefieren un espacio de trabajo coherente en lugar de muchas herramientas separadas.

> Versión actual: **0.4.0** para Linux x86_64. Las versiones publicadas están firmadas con GPG.

## Características principales

- **Espacio de trabajo de terminal** – Pestañas que puedes arrastrar para ordenarlas como quieras y renombrar (doble clic o F2), un color por conexión (por ejemplo, rojo para producción), vista única o en mosaico, ventanas de terminal independientes, zoom del terminal (Ctrl+= / Ctrl+- / Ctrl+0), 14 temas de terminal, búsqueda, macros y entrada simultánea (broadcast).
- **Copiar y pegar como en un terminal de Linux** – Al seleccionar se copia, el clic central pega y el clic derecho abre un menú (o copia y pega al estilo de PuTTY); además, Ctrl+Shift+C / Ctrl+Shift+V y Ctrl+Insert / Shift+Insert. Ctrl+clic abre los enlaces.
- **SSH** – Sesiones nativas de OpenSSH, agente SSH, importación de `~/.ssh/config`, archivos de identidad, ProxyJump, compresión, keepalive y reenvío X11.
- **SFTP y FTP/FTPS** – Gestor de archivos de doble panel con transferencias que revisas antes de ejecutarlas, transferencia de carpetas, comparación y sincronización, edición de texto integrada y cola de transferencias. SFTP respeta las claves en las que OpenSSH ya confía en `known_hosts`.
- **Túneles SSH** – Reenvíos locales, remotos y dinámicos (SOCKS) que solo se marcan como listos cuando funcionan de verdad.
- **Escritorios remotos** – Pestañas RDP y VNC integradas, clientes externos FreeRDP/TigerVNC y RDP/VNC a través de una pasarela SSH.
- **Espacios de trabajo** – Espacios de trabajo guardados con nombre, restauración de sesiones, grupos de conexiones, favoritos, copias de seguridad de los espacios de trabajo y puntos de recuperación locales.
- **Asistente de terminal** – Detección del sistema operativo por sesión, sugerencias de comandos en línea (Ctrl+Space), correcciones del tipo «¿quisiste decir…?» y una confirmación antes de los comandos peligrosos; cada parte se puede desactivar. Nada de lo que se escribe en una solicitud de contraseña se muestra, se sugiere ni se guarda.
- **Productividad** – Búsqueda en el historial de todas las sesiones, un mismo comando en muchas sesiones con la salida recopilada, reproducción de sesiones, estadísticas del host en tiempo real y herramientas de red.
- **Ayuda de IA opcional** – Desactivada por defecto; usa tu propio endpoint compatible con OpenAI (por ejemplo, llama.cpp u Ollama). Las respuestas solo se insertan, nunca se ejecutan.
- **Interfaz en español** – La interfaz está disponible en 9 idiomas y se puede cambiar desde la barra de estado.

## Instalación rápida

```bash
# AppImage (portátil)
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

Mosh, RDP (FreeRDP) y VNC (TigerVNC) utilizan los clientes de la propia distribución; `./scripts/install-runtime-tools.sh` los instala. Consulta [INSTALL.md](INSTALL.md) para más detalles.

## Seguridad

Aux Command prefiere límites de confianza explícitos a una comodidad invisible. El renderizador de Electron se ejecuta en un sandbox con `contextIsolation`, los permisos de Chromium se deniegan por defecto y se bloquean la navegación externa y las ventanas emergentes. Los procesos se inician directamente con matrices de argumentos, nunca a través de un shell. Las claves de host SSH y los certificados de servidor RDP se confirman en el primer uso y se avisa si cambian; RDP queda fijado al certificado confirmado. Al texto pegado se le eliminan los caracteres de control, y los pegados de varias líneas o en modo broadcast requieren confirmación previa. Las contraseñas solo se guardan si hay disponible un almacenamiento cifrado del escritorio, y las exportaciones nunca contienen secretos.

Informa de las vulnerabilidades de forma privada, tal como se describe en [SECURITY.md](SECURITY.md).

## Apoyo

Aux Command es software libre y de código abierto. Si te ayuda en tu trabajo, puedes [invitarme a un café](https://www.buymeacoffee.com/auxillo).

## Licencia

Aux Command es software libre y de código abierto bajo la licencia **AGPL-3.0-or-later**. Todas las funciones forman parte de la compilación pública; no hay ediciones de pago ni muros de pago.

---

> Documentación completa en inglés: [README.md](README.md)
