'use strict';
// OSC 7 is reported by cooperating shells. Treat it only as directory metadata.
class TerminalDirectoryTracker {
  constructor() { this.pending = ''; }
  feed(data) {
    const text = this.pending + String(data || '');
    let directory = '';
    const pattern = /\x1b\]7;([^\x07\x1b]{1,16384})(?:\x07|\x1b\\)/gu;
    let consumed = 0;
    for (const match of text.matchAll(pattern)) {
      consumed = match.index + match[0].length;
      try {
        const uri = new URL(match[1]);
        const cwd = decodeURIComponent(uri.pathname);
        if (uri.protocol === 'file:' && !uri.search && !uri.hash && cwd.startsWith('/') && cwd.length <= 4096 && !/[\x00-\x1f\x7f]/u.test(cwd)) directory = cwd;
      } catch { /* malformed output is not session metadata */ }
    }
    this.pending = text.slice(consumed).slice(-16390);
    return directory;
  }
}
const BASH_DIRECTORY_HOOK = [
  "[[ -r \"$HOME/.bashrc\" ]] && source \"$HOME/.bashrc\"",
  "__aux_command_report_cwd() {",
  "  local status=$? LC_ALL=C value=\"$PWD\" encoded='' char hex index",
  "  for ((index=0; index<${#value}; index++)); do",
  "    char=\"${value:index:1}\"",
  "    case \"$char\" in [a-zA-Z0-9/._~-]) encoded+=\"$char\" ;; *) printf -v hex '%02X' \"'$char\"; encoded+=\"%$hex\" ;; esac",
  "  done",
  "  printf '\\033]7;file://localhost%s\\007' \"$encoded\"",
  "  return \"$status\"",
  "}",
  "PROMPT_COMMAND=(\"${PROMPT_COMMAND[@]}\" __aux_command_report_cwd)"
].join('\n');
module.exports = { TerminalDirectoryTracker, BASH_DIRECTORY_HOOK };
