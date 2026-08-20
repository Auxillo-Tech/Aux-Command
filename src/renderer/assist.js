'use strict';

// Terminal assist engine: command-line mirroring, OS detection, suggestions,
// autocorrect and the dangerous-command guard. Pure logic only — no DOM and no
// IPC — so the renderer and the unit suite share the exact same behavior.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AuxAssist = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const BASE_COMMANDS = [
    'ls -la', 'cd ', 'pwd', 'cat ', 'less ', 'tail -f ', 'head ', 'grep -r ', 'find . -name ',
    'mkdir -p ', 'cp -r ', 'mv ', 'rm ', 'chmod ', 'chown ', 'ln -s ', 'touch ', 'du -sh ',
    'df -h', 'free -h', 'ps aux', 'top', 'htop', 'kill ', 'pkill ', 'uname -a', 'whoami',
    'id', 'uptime', 'history', 'which ', 'echo ', 'export ', 'env', 'ssh ', 'scp ', 'rsync -av ',
    'curl -s ', 'wget ', 'tar -xzf ', 'tar -czf ', 'unzip ', 'git status', 'git pull',
    'git push', 'git log --oneline', 'git diff', 'git add ', 'git commit -m ', 'git checkout ',
    'docker ps', 'docker logs -f ', 'docker exec -it ', 'docker compose up -d', 'crontab -e',
    'ip a', 'ip route', 'ss -tulpn', 'netstat -tulpn', 'ping ', 'traceroute ', 'dig ', 'nslookup ',
    'systemctl status ', 'systemctl restart ', 'systemctl stop ', 'systemctl start ',
    'systemctl enable ', 'journalctl -u ', 'journalctl -f', 'hostnamectl', 'timedatectl',
    'mount ', 'umount ', 'lsblk', 'fdisk -l', 'sudo '
  ];

  const FAMILY_COMMANDS = {
    linux: [],
    macos: ['brew install ', 'brew update', 'brew upgrade', 'brew list', 'sw_vers', 'launchctl list', 'open ', 'pbcopy', 'pbpaste', 'diskutil list'],
    windows: ['dir', 'cls', 'ipconfig /all', 'tasklist', 'taskkill /PID ', 'winget install ', 'winget upgrade', 'Get-Process', 'Get-Service', 'Get-ChildItem', 'Set-Location ', 'Test-NetConnection ', 'systeminfo', 'sfc /scannow', 'netsh interface show interface'],
    bsd: ['pkg install ', 'pkg update', 'pkg upgrade', 'sysrc ', 'service ', 'bectl list']
  };

  const PACKAGE_MANAGER_COMMANDS = {
    apt: ['apt install ', 'apt update', 'apt upgrade', 'apt search ', 'apt remove ', 'apt autoremove', 'dpkg -l', 'dpkg -i ', 'apt list --installed'],
    dnf: ['dnf install ', 'dnf update', 'dnf search ', 'dnf remove ', 'dnf info ', 'rpm -qa', 'dnf list installed', 'dnf history'],
    zypper: ['zypper install ', 'zypper update', 'zypper search ', 'zypper remove '],
    pacman: ['pacman -S ', 'pacman -Syu', 'pacman -Ss ', 'pacman -R ', 'pacman -Q'],
    apk: ['apk add ', 'apk update', 'apk upgrade', 'apk search ', 'apk del '],
    brew: [],
    winget: [],
    pkg: []
  };

  const DISTRO_TABLE = [
    { id: 'ubuntu', label: 'Ubuntu', family: 'linux', packageManager: 'apt', patterns: [/\bID=ubuntu\b/i, /Welcome to Ubuntu/i, /PRETTY_NAME="?Ubuntu/i, /OpenSSH[^\r\n]*Ubuntu/] },
    { id: 'debian', label: 'Debian', family: 'linux', packageManager: 'apt', patterns: [/\bID=debian\b/i, /Debian GNU\/Linux/i, /OpenSSH[^\r\n]*Debian/] },
    { id: 'mint', label: 'Linux Mint', family: 'linux', packageManager: 'apt', patterns: [/\bID=linuxmint\b/i, /Linux Mint/i] },
    { id: 'fedora', label: 'Fedora', family: 'linux', packageManager: 'dnf', patterns: [/\bID=fedora\b/i, /Fedora Linux/i] },
    { id: 'rhel', label: 'RHEL', family: 'linux', packageManager: 'dnf', patterns: [/\bID="?rhel"?/i, /Red Hat Enterprise Linux/i] },
    { id: 'centos', label: 'CentOS', family: 'linux', packageManager: 'dnf', patterns: [/\bID="?centos"?/i, /CentOS (Stream|Linux)/i] },
    { id: 'rocky', label: 'Rocky Linux', family: 'linux', packageManager: 'dnf', patterns: [/\bID="?rocky"?/i, /Rocky Linux/i] },
    { id: 'alma', label: 'AlmaLinux', family: 'linux', packageManager: 'dnf', patterns: [/\bID="?almalinux"?/i, /AlmaLinux/i] },
    { id: 'opensuse', label: 'openSUSE', family: 'linux', packageManager: 'zypper', patterns: [/\bID="?opensuse/i, /openSUSE/i] },
    { id: 'arch', label: 'Arch Linux', family: 'linux', packageManager: 'pacman', patterns: [/\bID=arch\b/i, /Arch Linux/i] },
    { id: 'manjaro', label: 'Manjaro', family: 'linux', packageManager: 'pacman', patterns: [/\bID=manjaro\b/i, /Manjaro Linux/i] },
    { id: 'alpine', label: 'Alpine', family: 'linux', packageManager: 'apk', patterns: [/\bID=alpine\b/i, /Alpine Linux/i] },
    { id: 'macos', label: 'macOS', family: 'macos', packageManager: 'brew', patterns: [/\bDarwin\b(?! kernel driver)/, /ProductName:\s*macOS/i] },
    { id: 'freebsd', label: 'FreeBSD', family: 'bsd', packageManager: 'pkg', patterns: [/FreeBSD/] },
    { id: 'openbsd', label: 'OpenBSD', family: 'bsd', packageManager: 'pkg', patterns: [/OpenBSD/] },
    { id: 'netbsd', label: 'NetBSD', family: 'bsd', packageManager: 'pkg', patterns: [/NetBSD/] },
    { id: 'windows', label: 'Windows', family: 'windows', packageManager: 'winget', patterns: [/Microsoft Windows \[Version/i, /Windows PowerShell/i, /\bPS [A-Z]:\\/, /(^|[\r\n])[A-Z]:\\[^\r\n]*>/] }
  ];

  const GENERIC_LINUX = [/\bID=linux\b/i, /\bGNU\/Linux\b/, /\bLinux [0-9]+\.[0-9]+/];

  // A session stops being scanned once this much output has been inspected
  // without a distro-level lock; family-level knowledge is kept.
  const DETECTION_BUDGET = 65536;

  function dictionaryFor(osInfo) {
    const family = osInfo?.family || 'linux';
    const commands = family === 'windows' ? [...FAMILY_COMMANDS.windows] : [...BASE_COMMANDS, ...(FAMILY_COMMANDS[family] || [])];
    const pm = osInfo?.packageManager;
    if (pm && PACKAGE_MANAGER_COMMANDS[pm]) commands.push(...PACKAGE_MANAGER_COMMANDS[pm]);
    return commands;
  }

  class OsDetector {
    constructor(seed) {
      this.osInfo = seed || null;
      this.scanned = 0;
      this.buffer = '';
      this.locked = Boolean(seed && seed.distro);
    }

    feed(chunk) {
      if (this.locked || typeof chunk !== 'string' || !chunk) return this.osInfo;
      if (this.scanned >= DETECTION_BUDGET) return this.osInfo;
      this.scanned += chunk.length;
      // Keep a small tail so patterns spanning chunk boundaries still match.
      this.buffer = (this.buffer + chunk).slice(-4096);
      for (const entry of DISTRO_TABLE) {
        if (entry.patterns.some((pattern) => pattern.test(this.buffer))) {
          this.osInfo = { family: entry.family, distro: entry.id, label: entry.label, packageManager: entry.packageManager };
          this.locked = true;
          return this.osInfo;
        }
      }
      if (!this.osInfo && GENERIC_LINUX.some((pattern) => pattern.test(this.buffer))) {
        this.osInfo = { family: 'linux', distro: null, label: 'Linux', packageManager: null };
      }
      return this.osInfo;
    }
  }

  function osInfoFromRelease(platform, releaseText) {
    if (platform === 'darwin') return { family: 'macos', distro: 'macos', label: 'macOS', packageManager: 'brew' };
    if (platform === 'win32') return { family: 'windows', distro: 'windows', label: 'Windows', packageManager: 'winget' };
    const text = String(releaseText || '');
    for (const entry of DISTRO_TABLE) {
      if (entry.family !== 'linux') continue;
      if (entry.patterns.some((pattern) => pattern.test(text))) {
        return { family: entry.family, distro: entry.id, label: entry.label, packageManager: entry.packageManager };
      }
    }
    return { family: 'linux', distro: null, label: 'Linux', packageManager: null };
  }

  // Mirrors what the user has typed at the current shell line. The mirror goes
  // "untracked" whenever the shell might have rewritten the line in a way we
  // cannot see (history recall, tab completion, cursor movement), and recovers
  // on the next Enter, Ctrl+C or Ctrl+U.
  class CommandLineMirror {
    constructor() {
      this.line = '';
      this.tracked = true;
    }

    feed(data) {
      const committed = [];
      if (typeof data !== 'string' || !data) return { committed, line: this.line, tracked: this.tracked };
      // Bracketed paste wrappers are transport markers, not typed characters.
      const text = data.replace(/\x1b\[20[01]~/g, '');
      let index = 0;
      while (index < text.length) {
        const char = text[index];
        if (char === '\r' || char === '\n') {
          committed.push({ line: this.line, tracked: this.tracked });
          this.line = '';
          this.tracked = true;
          if (char === '\r' && text[index + 1] === '\n') index += 1;
        } else if (char === '\x7f' || char === '\b') {
          this.line = this.line.slice(0, -1);
        } else if (char === '\x15') { // Ctrl+U
          this.line = '';
          this.tracked = true;
        } else if (char === '\x17') { // Ctrl+W
          this.line = this.line.replace(/\S+\s*$/u, '');
        } else if (char === '\x03') { // Ctrl+C
          this.line = '';
          this.tracked = true;
        } else if (char === '\t') {
          this.tracked = false;
        } else if (char === '\x1b') {
          // Any escape sequence (arrows, home/end, alt-chords) can move the
          // cursor or recall history — the mirror can no longer trust itself.
          this.tracked = false;
          index += 1;
          if (text[index] === '[' || text[index] === 'O') {
            index += 1;
            while (index < text.length && !/[a-zA-Z~]/u.test(text[index])) index += 1;
          }
        } else if (char >= ' ' || char === ' ') {
          this.line += char;
        } else {
          // Other control characters (Ctrl+A/E/K/R…) edit the line shell-side.
          this.tracked = false;
        }
        index += 1;
      }
      return { committed, line: this.line, tracked: this.tracked };
    }

    // What would commit if `data` were fed now, without mutating this mirror.
    preview(data) {
      const clone = new CommandLineMirror();
      clone.line = this.line;
      clone.tracked = this.tracked;
      return clone.feed(data);
    }
  }

  const DANGER_RULES = [
    { pattern: /\brm\s+(-[a-z]*[rf][a-z]*\s+)+(-[a-z]*\s+)*("?\/"?|\/\*|~\/?\s*$|~\/\*|"?\$HOME"?\/?\s*$|--no-preserve-root)/iu, reason: 'Recursively deletes the filesystem root or the entire home directory.' },
    { pattern: /\bdd\b[^|;&]*\bof=\/dev\//iu, reason: 'Writes raw data directly over a block device.' },
    { pattern: /\bmkfs(\.[a-z0-9]+)?\b/iu, reason: 'Creates a new filesystem, destroying everything on the target device.' },
    { pattern: /(^|[|;&]\s*)>(\s*)\/dev\/sd[a-z]/iu, reason: 'Truncates a raw disk device.' },
    { pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/u, reason: 'Fork bomb — exhausts the machine until it hangs.' },
    { pattern: /\bchmod\s+(-[a-z]*R[a-z]*\s+)+[0-7]{3,4}\s+"?\/"?\s*$/iu, reason: 'Recursively rewrites permissions from the filesystem root.' },
    { pattern: /\bchown\s+(-[a-z]*R[a-z]*\s+)+\S+\s+"?\/"?\s*$/iu, reason: 'Recursively rewrites ownership from the filesystem root.' },
    { pattern: /\b(iptables|nft)\s+(-F|flush)\b/iu, reason: 'Flushes firewall rules — on a remote host this can lock you out.', anchored: true },
    { pattern: /^(shutdown|poweroff|halt)\b/iu, reason: 'Powers the machine off.', anchored: true },
    { pattern: /^reboot\b/iu, reason: 'Reboots the machine.', anchored: true },
    { pattern: /^init\s+[06]\b/u, reason: 'Halts or reboots the machine via init.', anchored: true }
  ];

  function dangerCheck(command) {
    const text = String(command || '').trim();
    if (!text) return null;
    // Anchored rules only fire when the pattern starts a command segment, so
    // `echo reboot` or `grep shutdown` never trip the guard.
    const segments = text.split(/(?:\|\||&&|;|\|)/u)
      .map((segment) => segment.trim().replace(/^(sudo|doas)\s+(-\S+\s+)*/iu, ''))
      .filter(Boolean);
    for (const rule of DANGER_RULES) {
      if (rule.anchored) {
        if (segments.some((segment) => rule.pattern.test(segment))) return { command: text, reason: rule.reason };
      } else if (rule.pattern.test(text)) {
        return { command: text, reason: rule.reason };
      }
    }
    return null;
  }

  // In-memory, most-recent-first command history. Never persisted: transcripts
  // and shell history already exist on disk for users who want durable records.
  class CommandHistory {
    constructor(limit = 500) {
      this.limit = limit;
      this.entries = [];
    }

    add(command) {
      const text = String(command || '').trim();
      if (!text || text.length < 2) return;
      const existing = this.entries.indexOf(text);
      if (existing !== -1) this.entries.splice(existing, 1);
      this.entries.unshift(text);
      if (this.entries.length > this.limit) this.entries.length = this.limit;
    }

    list() {
      return this.entries;
    }
  }

  function suggest(prefix, history, osInfo) {
    const text = String(prefix || '');
    if (text.trim().length < 2) return null;
    const historyEntries = history ? history.list() : [];
    for (const entry of historyEntries) {
      if (entry.startsWith(text) && entry !== text) return { completion: entry.slice(text.length), full: entry, source: 'history' };
    }
    for (const entry of dictionaryFor(osInfo)) {
      if (entry.startsWith(text) && entry.trim() !== text.trim()) return { completion: entry.slice(text.length), full: entry, source: 'dictionary' };
    }
    return null;
  }

  // Optimal-string-alignment distance: like Levenshtein but adjacent
  // transpositions (gerp → grep) cost 1, which matches how typos happen.
  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const rows = [Array.from({ length: n + 1 }, (_, i) => i)];
    for (let i = 1; i <= m; i++) {
      const current = [i];
      const previous = rows[i - 1];
      for (let j = 1; j <= n; j++) {
        current[j] = Math.min(
          previous[j] + 1,
          current[j - 1] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          current[j] = Math.min(current[j], rows[i - 2][j - 2] + 1);
        }
      }
      rows.push(current);
    }
    return rows[m][n];
  }

  const NOT_FOUND_PATTERNS = [
    /(?:^|[\r\n])[^\r\n]*?:\s*([^\s:]+):\s*command not found/u,
    /(?:^|[\r\n])([^\s:]+):\s*Command not found\./u,
    /'([^']+)' is not recognized as an internal or external command/u,
    /(?:^|[\r\n])zsh:\s*command not found:\s*([^\s\r\n]+)/u
  ];

  function detectCommandNotFound(output) {
    const text = String(output || '');
    for (const pattern of NOT_FOUND_PATTERNS) {
      const match = pattern.exec(text);
      if (match) return match[1];
    }
    return null;
  }

  function correctCommand(failedCommand, failedToken, history, osInfo) {
    const command = String(failedCommand || '').trim();
    const token = String(failedToken || '').trim();
    if (!command || !token || token.length < 2) return null;
    const candidates = new Set();
    for (const entry of history ? history.list() : []) {
      const first = entry.split(/\s+/u)[0];
      if (first) candidates.add(first);
    }
    for (const entry of dictionaryFor(osInfo)) {
      const first = entry.trim().split(/\s+/u)[0];
      if (first) candidates.add(first);
    }
    candidates.delete(token);
    let best = null;
    let bestDistance = Infinity;
    const maxDistance = token.length <= 4 ? 1 : 2;
    for (const candidate of candidates) {
      const distance = levenshtein(token, candidate);
      if (distance <= maxDistance && distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (!best) return null;
    const corrected = command.replace(token, best);
    return corrected === command ? null : { corrected, replaced: token, replacement: best };
  }

  // Cross-session history search: substring matches rank above in-order
  // subsequence (fuzzy) matches; MRU order is preserved inside each rank.
  function searchHistory(query, entries, limit = 50) {
    const text = String(query || '').trim().toLowerCase();
    const source = Array.isArray(entries) ? entries : [];
    if (!text) return source.slice(0, limit);
    const substring = [];
    const fuzzy = [];
    for (const entry of source) {
      const command = String(entry.command || '').toLowerCase();
      if (command.includes(text)) {
        substring.push(entry);
      } else {
        let index = 0;
        for (const char of text) {
          index = command.indexOf(char, index);
          if (index === -1) break;
          index += 1;
        }
        if (index !== -1) fuzzy.push(entry);
      }
      if (substring.length >= limit) break;
    }
    return [...substring, ...fuzzy].slice(0, limit);
  }

  // Remove ANSI/OSC control sequences so captured terminal output reads as
  // plain text in result panes.
  function stripAnsi(text) {
    return String(text || '')
      .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '')
      .replace(/\x1b[[?][0-9;?]*[a-zA-Z~]/g, '')
      .replace(/\x1b[()][A-Z0-9]/g, '')
      .replace(/\x1b[=>]/g, '')
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  }

  return {
    OsDetector,
    osInfoFromRelease,
    CommandLineMirror,
    CommandHistory,
    dangerCheck,
    suggest,
    correctCommand,
    detectCommandNotFound,
    searchHistory,
    stripAnsi,
    dictionaryFor,
    levenshtein,
    DANGER_RULES
  };
});
