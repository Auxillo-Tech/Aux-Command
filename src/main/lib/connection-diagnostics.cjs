'use strict';
function diagnoseConnection(protocol, output) {
  const text = String(output || '').slice(-16384);
  if (!['ssh', 'mosh', 'telnet', 'serial'].includes(protocol)) return null;
  const rules = [
    ['host-key', /REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i, 'Server identity could not be verified', 'Verify the server fingerprint with its administrator before updating the known-host entry.'],
    ['dns', /could not resolve hostname|Name or service not known|Temporary failure in name resolution|getaddrinfo/i, 'Host name could not be resolved', 'Check the host or SSH alias, DNS and VPN connection. For a jump route, check the jump-host name too.'],
    ['proxy', /stdio forwarding failed|channel \d+: open failed|proxy.*(?:failed|error)|kex_exchange_identification/i, 'SSH route failed', 'Check the jump host or ProxyCommand and confirm it can reach the destination.'],
    ['authentication', /Permission denied.*(?:publickey|password)|Authentication failed|Too many authentication failures/i, 'Authentication was rejected', 'Check the username, selected key or password, and keys loaded into your SSH agent.'],
    ['missing-key', /identity file .*not accessible|no such identity/i, 'Identity file is unavailable', 'Choose a private key that exists on this computer. Profile exports do not contain key files.'],
    ['refused', /Connection refused/i, 'The connection was refused', 'Check the destination port and whether the remote service is listening.'],
    ['timeout', /Connection timed out|No route to host|Network is unreachable/i, 'The destination could not be reached', 'Check VPN connectivity, routing, firewall rules and the jump host if used.'],
    ['missing-tool', /command not found|No such file or directory.*mosh|mosh-server.*not found/i, 'A required tool is missing', 'Open System diagnostics to check local tools; Mosh also needs mosh-server on the destination.'],
    ['device', /Permission denied|No such file or directory/i, 'Device or file is unavailable', 'Check that the device or file exists and your account has permission to access it.']
  ];
  for (const [category, pattern, title, guidance] of rules) if (pattern.test(text)) return { category, title, guidance };
  return null;
}
module.exports = { diagnoseConnection };
