// The wording of profile validation errors, shared by the main process (which
// writes the messages) and the renderer (which translates them). A message is
// one of REASONS with {p0} replaced by the English label of the field, so every
// message the validator can produce is a known sentence the catalog covers.
(function (root, factory) {
  const value = factory();
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.AuxValidationMessages = value;
})(typeof window === 'undefined' ? globalThis : window, () => {
  'use strict';
  const REASONS = Object.freeze({
    required: '{p0} is required',
    notString: '{p0} must be text',
    tooLong: '{p0} is too long',
    control: '{p0} cannot contain control characters',
    port: '{p0} must be a number from 1 to 65535',
    hyphen: '{p0} cannot start with a hyphen',
    whitespace: '{p0} cannot contain spaces',
    backslash: '{p0} cannot contain a backslash: use user@domain instead of DOMAIN\\user',
    shell: '{p0} cannot contain quotes, backticks, $, backslashes, ; & | < > ( ) * ? or spaces',
    host: '{p0} must be a host name, an IPv4 address or an IPv6 address',
    alias: '{p0} can only contain letters, digits, dots, hyphens and underscores',
    jump: '{p0} must list jump hosts as [user@]host[:port], separated by commas, with IPv6 addresses in [brackets]'
  });

  // Profile property -> the label the editor shows for it (English source).
  const FIELD_LABELS = Object.freeze({
    name: 'Name',
    group: 'Group',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    identityFile: 'Identity file',
    knownHostsFile: 'Known-hosts file',
    sshAlias: 'SSH alias',
    sshAliases: 'SSH alias',
    proxyJump: 'ProxyJump',
    startupCommand: 'Startup command',
    sftpRoot: 'SFTP start path',
    device: 'Serial device',
    rdpDomain: 'RDP domain',
    notes: 'Notes',
    tags: 'Tags'
  });

  function label(field) {
    return Object.hasOwn(FIELD_LABELS, field) ? FIELD_LABELS[field] : String(field);
  }

  function message(reason, field) {
    return REASONS[reason].replace('{p0}', label(field));
  }

  // Turns a message written by message() back into [reason source, label], or
  // null for any other text. The label must be one of FIELD_LABELS' values.
  function parse(text) {
    if (typeof text !== 'string') return null;
    const labels = new Set(Object.values(FIELD_LABELS));
    for (const source of Object.values(REASONS)) {
      const [before, after] = source.split('{p0}');
      if (text.length > before.length + after.length && text.startsWith(before) && text.endsWith(after)) {
        const found = text.slice(before.length, text.length - after.length);
        if (labels.has(found)) return { source, label: found };
      }
    }
    return null;
  }

  return { REASONS, FIELD_LABELS, label, message, parse };
});
