'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findExecutable } = require('../lib/executable-finder.cjs');

const TOOLS = [
  ['Python PTY', ['python3']],
  ['ssh', ['ssh']],
  ['sftp', ['sftp']],
  ['scp', ['scp']],
  ['Mosh', ['mosh']],
  ['RDP', ['xfreerdp3', 'xfreerdp']],
  ['VNC', ['vncviewer', 'tigervncviewer']],
  ['Xvfb', ['Xvfb']],
  ['x11vnc', ['x11vnc']],
  ['Serial bridge', ['python3']],
  ['Telnet bridge', ['python3']]
];

function toolStatus(name, candidates) {
  const executable = findExecutable(candidates);
  return { name, available: Boolean(executable), executable, candidates };
}

function protocolCapabilities(tools) {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const has = (name) => Boolean(byName.get(name)?.available);
  return [
    {
      protocol: 'local',
      mode: 'builtin-python-pty',
      available: has('Python PTY'),
      detail: 'Local shells run through the bundled Python PTY bridge.'
    },
    {
      protocol: 'ssh',
      mode: 'builtin-node-ssh2-and-openssh',
      available: has('ssh'),
      detail: 'Terminal SSH uses OpenSSH; SFTP and host-key workflows use ssh2-backed services.'
    },
    {
      protocol: 'sftp',
      mode: 'builtin-node-ssh2',
      available: true,
      detail: 'Graphical SFTP uses the bundled ssh2 dependency; external sftp/scp tools are optional diagnostics.'
    },
    {
      protocol: 'ftp',
      mode: 'builtin-basic-ftp-insecure',
      available: true,
      detail: 'Plain FTP uses the bundled basic-ftp dependency and requires an insecure-transport warning before use.'
    },
    {
      protocol: 'ftps',
      mode: 'builtin-basic-ftp-tls',
      available: true,
      detail: 'FTPS uses the bundled basic-ftp dependency with TLS enabled.'
    },
    {
      protocol: 'mosh',
      mode: 'external-client',
      available: has('Mosh'),
      detail: 'Mosh still requires the host mosh client and a reachable mosh-server target.'
    },
    {
      protocol: 'telnet',
      mode: 'bundled-python-bridge',
      available: has('Telnet bridge'),
      detail: 'Telnet runs through the bundled stdlib TCP/Telnet bridge; no host telnet binary is required.'
    },
    {
      protocol: 'serial',
      mode: 'bundled-python-bridge',
      available: has('Serial bridge'),
      detail: 'Serial runs through the bundled stdlib raw TTY bridge; no host picocom binary is required.'
    },
    {
      protocol: 'rdp',
      mode: has('RDP') && has('Xvfb') && has('x11vnc') ? 'embedded-freerdp-x11vnc' : 'external-client',
      available: has('RDP'),
      detail: has('RDP') && has('Xvfb') && has('x11vnc')
        ? 'RDP renders in an embedded tab via FreeRDP on a headless Xvfb display exported through x11vnc.'
        : 'RDP launches the installed FreeRDP client. Install Xvfb and x11vnc to render RDP in an embedded tab.'
    },
    {
      protocol: 'vnc',
      mode: 'embedded-novnc-bridge',
      available: true,
      detail: 'VNC renders in an embedded tab through the bundled noVNC WebSocket bridge; an installed VNC viewer is used only as a fallback.'
    },
    {
      protocol: 'x11-forwarding',
      mode: 'openssh-x11-forwarding',
      available: has('ssh') && Boolean(process.env.DISPLAY),
      detail: 'X11 forwarding uses OpenSSH -X and the host X/Wayland Xwayland display.'
    }
  ];
}

class SystemService {
  diagnostics() {
    const tools = TOOLS.map(([name, candidates]) => toolStatus(name, candidates));
    return {
      platform: process.platform,
      architecture: process.arch,
      hostname: os.hostname(),
      shell: process.env.SHELL || '',
      sshAgent: Boolean(process.env.SSH_AUTH_SOCK),
      display: process.env.DISPLAY || '',
      tools,
      protocols: protocolCapabilities(tools)
    };
  }

  stats() {
    if (process.platform !== 'linux') return { supported: false };
    try {
      const load1 = Number(fs.readFileSync('/proc/loadavg', 'utf8').split(/\s+/u)[0]);
      const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
      const memValue = (key) => Number((meminfo.match(new RegExp(`^${key}:\\s+(\\d+) kB`, 'mu')) || [])[1] || 0);
      const memTotal = memValue('MemTotal');
      const memAvailable = memValue('MemAvailable');
      const disk = fs.statfsSync('/');
      const diskTotal = disk.blocks * disk.bsize;
      const diskFree = disk.bavail * disk.bsize;
      return {
        supported: true,
        load1: Number.isFinite(load1) ? load1 : null,
        cpuCount: os.cpus().length,
        memUsedPct: memTotal ? Math.round(((memTotal - memAvailable) / memTotal) * 100) : null,
        diskUsedPct: diskTotal ? Math.round(((diskTotal - diskFree) / diskTotal) * 100) : null,
        uptimeSec: Math.round(os.uptime())
      };
    } catch {
      return { supported: false };
    }
  }

  osInfo() {
    let releaseText = '';
    if (process.platform === 'linux') {
      try { releaseText = fs.readFileSync('/etc/os-release', 'utf8'); } catch { /* minimal distros may lack os-release */ }
    }
    return { platform: process.platform, releaseText };
  }

  readTextFile(filename, limit = 5_000_000) {
    const stat = fs.statSync(filename);
    if (!stat.isFile() || stat.size > limit) throw new Error('File is not a supported profile export');
    return fs.readFileSync(filename, 'utf8');
  }

  writeTextFile(filename, content) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(filename, content, { mode: 0o600 });
    return true;
  }
}

module.exports = { SystemService };
