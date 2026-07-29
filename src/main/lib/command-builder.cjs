'use strict';

const os = require('node:os');
const path = require('node:path');
const { expandHome, normalizeProfile, normalizeTunnel } = require('./validation.cjs');

function resolveHelper(name, baseDirectory = __dirname) {
  const helper = path.join(baseDirectory, '../helpers', name);
  const asarSegment = `${path.sep}app.asar${path.sep}`;
  return helper.includes(asarSegment)
    ? helper.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
    : helper;
}

function sshBaseArgs(profileInput, options = {}) {
  const profile = normalizeProfile(profileInput, profileInput?.id);
  const args = [];

  if (!profile.useSshConfig || profile.port !== 22) args.push('-p', String(profile.port));
  if (profile.username) args.push('-l', profile.username);
  if (profile.identityFile) args.push('-i', expandHome(profile.identityFile));
  if (profile.knownHostsFile) args.push('-o', `UserKnownHostsFile=${expandHome(profile.knownHostsFile)}`);
  if (profile.proxyJump) args.push('-J', profile.proxyJump);
  if (profile.keepAliveSeconds > 0) {
    args.push('-o', `ServerAliveInterval=${profile.keepAliveSeconds}`);
    args.push('-o', 'ServerAliveCountMax=3');
  }
  args.push('-o', 'ConnectTimeout=15');
  if (profile.compression) args.push('-C');
  if (profile.agentForwarding) args.push('-A');
  if (profile.x11Forwarding) args.push('-X');
  if (options.batchMode) args.push('-o', 'BatchMode=yes');
  if (options.exitOnForwardFailure) args.push('-o', 'ExitOnForwardFailure=yes');
  if (options.tty) args.push('-tt');
  return args;
}

function target(profile) {
  return profile.useSshConfig && profile.sshAlias ? profile.sshAlias : profile.host;
}

function quotePosixShellArgument(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildTerminalCommand(profileInput) {
  const profile = normalizeProfile(profileInput, profileInput?.id);
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor'
  };

  switch (profile.protocol) {
    case 'local': {
      const shell = process.env.SHELL || '/bin/bash';
      return {
        command: shell,
        args: profile.startupCommand ? ['-lc', `${profile.startupCommand}\nexec ${quotePosixShellArgument(shell)} -l`] : ['-l'],
        env,
        title: profile.name
      };
    }
    case 'ssh': {
      const args = sshBaseArgs(profile, { tty: true });
      args.push(target(profile));
      if (profile.startupCommand) args.push(profile.startupCommand);
      return { command: 'ssh', args, env, title: profile.name };
    }
    case 'mosh': {
      const sshParts = ['ssh'];
      if (!profile.useSshConfig || profile.port !== 22) sshParts.push('-p', String(profile.port));
      if (profile.identityFile) sshParts.push('-i', expandHome(profile.identityFile));
      if (profile.proxyJump) sshParts.push('-J', profile.proxyJump);
      if (profile.compression) sshParts.push('-C');
      if (profile.agentForwarding) sshParts.push('-A');
      if (profile.x11Forwarding) sshParts.push('-X');
      if (profile.keepAliveSeconds > 0) {
        sshParts.push('-o', `ServerAliveInterval=${profile.keepAliveSeconds}`);
        sshParts.push('-o', 'ServerAliveCountMax=3');
      }
      const hostTarget = target(profile);
      const destination = profile.username ? `${profile.username}@${hostTarget}` : hostTarget;
      const sshCommand = sshParts.map(quotePosixShellArgument).join(' ');
      const args = [`--ssh=${sshCommand}`, destination];
      if (profile.startupCommand) args.push(profile.startupCommand);
      return { command: 'mosh', args, env, title: profile.name };
    }
    case 'telnet':
      return { command: 'python3', args: [resolveHelper('telnet_bridge.py'), profile.host, String(profile.port)], env, title: profile.name };
    case 'serial':
      return { command: 'python3', args: [resolveHelper('serial_bridge.py'), '--baud', String(profile.baudRate), profile.device], env, title: profile.name };
    default:
      throw new Error(`${profile.protocol} sessions are launched as external desktop clients`);
  }
}

function buildTunnelCommand(tunnelInput, profileInput) {
  const tunnel = normalizeTunnel(tunnelInput);
  const profile = normalizeProfile(profileInput, profileInput?.id);
  if (profile.protocol !== 'ssh') throw new Error('Tunnels require an SSH profile');

  const args = sshBaseArgs(profile, { batchMode: true, exitOnForwardFailure: true });
  args.push('-v', '-N');
  if (tunnel.type === 'dynamic') {
    args.push('-D', `${tunnel.bindHost}:${tunnel.bindPort}`);
  } else {
    const spec = `${tunnel.bindHost}:${tunnel.bindPort}:${tunnel.targetHost}:${tunnel.targetPort}`;
    args.push(tunnel.type === 'local' ? '-L' : '-R', spec);
  }
  args.push(target(profile));
  return { command: 'ssh', args, env: { ...process.env }, title: tunnel.name };
}

function buildExternalCommand(profileInput) {
  const profile = normalizeProfile(profileInput, profileInput?.id);
  if (profile.protocol === 'rdp') {
    const args = [
      `/v:${profile.host}:${profile.port}`,
      '/dynamic-resolution',
      '/clipboard',
      '/cert:tofu',
      '+auto-reconnect'
    ];
    if (profile.username) args.push(`/u:${profile.username}`);
    if (profile.rdpDomain) args.push(`/d:${profile.rdpDomain}`);
    return { candidates: ['xfreerdp3', 'xfreerdp'], args };
  }
  if (profile.protocol === 'vnc') {
    return {
      candidates: ['vncviewer', 'tigervncviewer'],
      args: [`${profile.host}::${profile.port}`]
    };
  }
  throw new Error(`Unsupported external protocol: ${profile.protocol}`);
}

function defaultLocalProfile() {
  return normalizeProfile({
    id: 'local-shell',
    name: `${os.userInfo().username}@localhost`,
    protocol: 'local',
    group: 'Local'
  }, 'local-shell');
}

function defaultInfraProfiles() {
  // Personal infrastructure belongs in ~/.ssh/config or an explicit profile import,
  // never in the public application source or packaged defaults.
  return [];
}

function defaultInfraSnippets() {
  return [
    { id: 'sys-health', name: 'System health', command: "echo '=== UPTIME ==='; uptime; echo '=== DISK ==='; df -h; echo '=== MEMORY ==='; free -h; echo '=== FAILED SERVICES ==='; systemctl --failed --no-pager 2>/dev/null || true" },
    { id: 'net-diag', name: 'Network diagnosis', command: "echo '=== INTERFACES ==='; ip -br addr; echo '=== ROUTES ==='; ip route show; echo '=== LISTENERS ==='; ss -tlnp; echo '=== DNS ==='; resolvectl status 2>/dev/null || cat /etc/resolv.conf" },
    { id: 'process-health', name: 'Process health', command: "echo '=== LOAD ==='; uptime; echo '=== TOP CPU ==='; ps -eo pid,user,comm,%cpu,%mem --sort=-%cpu | head -15; echo '=== TOP MEMORY ==='; ps -eo pid,user,comm,%cpu,%mem --sort=-%mem | head -15" },
    { id: 'containers', name: 'Containers', command: "echo '=== DOCKER ==='; docker ps -a 2>/dev/null || echo 'Docker unavailable'; echo '=== PODMAN ==='; podman ps -a 2>/dev/null || echo 'Podman unavailable'" },
    { id: 'security-quick', name: 'Security quick check', command: "echo '=== LOGINS ==='; last -n 10; echo '=== FAILED SSH ==='; journalctl -u sshd -p warning -n 20 --no-pager 2>/dev/null || journalctl -u ssh -p warning -n 20 --no-pager 2>/dev/null || true; echo '=== FIREWALL ==='; firewall-cmd --state 2>/dev/null || ufw status 2>/dev/null || true" }
  ];
}

module.exports = {
  buildExternalCommand,
  buildTerminalCommand,
  buildTunnelCommand,
  defaultInfraProfiles,
  defaultInfraSnippets,
  defaultLocalProfile,
  resolveHelper,
  sshBaseArgs
};
